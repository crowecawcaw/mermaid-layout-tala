import type { Point } from '../layout.js';
import { TalaGraph, TalaNode } from './graph.js';
import { sizedOrientation } from './placement-geometry.js';
import { sizedNodeEdgeLength } from './sized-cost.js';
import { wrapContainers } from './equidistance.js';

const precision = 1e-6;

/** The one-edge branch of placement.transpose, run in graph order. A leaf's
 * reachable side turns around its neighbor and enclosing boxes are refitted
 * for each trial, as in TransposeAll's AffectContainers transaction. */
export function transposeLeaves(graph: TalaGraph): boolean {
  graph.computeCellSize();
  let changed = false;
  for (const node of graph.nodes) {
    if (!node.topLeft || node.fixedTopLeft || node.edges.length !== 1) continue;
    const center = node.adjacent(node.edges[0]!);
    if (!center.topLeft || node.isDescendantOf(center) || center.isDescendantOf(node)
      || isDiagonal(sizedOrientation(node, center))) continue;
    const moving = reachableSide(node, center);
    if (moving.some((item) => item.fixedTopLeft)) continue;
    const before = snapshot(graph);
    let bestScore = edgeLength(graph);
    let bestTurn = 0;
    for (let turn = 1; turn <= 3; turn++) {
      restore(before);
      for (const item of moving) moveWithChildren(item, rotate(item, center, turn));
      wrapContainers(graph);
      if (!validSiblingGeometry(graph)) continue;
      const score = edgeLength(graph);
      if (score < bestScore - precision) {
        bestScore = score;
        bestTurn = turn;
      }
    }
    restore(before);
    if (bestTurn > 0) {
      for (const item of moving) moveWithChildren(item, rotate(item, center, bestTurn));
      wrapContainers(graph);
      changed = true;
    }
  }
  return changed;
}

function reachableSide(start: TalaNode, blocked: TalaNode): TalaNode[] {
  const result: TalaNode[] = [];
  const queue = [start];
  const seen = new Set<TalaNode>([start, blocked]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    result.push(node);
    for (const edge of node.edges) {
      const next = node.adjacent(edge);
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return result;
}

function edgeLength(graph: TalaGraph): number {
  const turnCost = graph.turnCost();
  return graph.nodes.reduce((sum, node) => sum + sizedNodeEdgeLength(node, graph, turnCost, true), 0);
}

function rotate(node: TalaNode, center: TalaNode, times: number): Point {
  const centerX = center.topLeft!.x + center.width / 2;
  const centerY = center.topLeft!.y + center.height / 2;
  let point = { ...node.topLeft! };
  for (let i = 0; i < times; i++) {
    const relativeX = point.x + node.width / 2 - centerX;
    const relativeY = point.y + node.height / 2 - centerY;
    point = {
      x: goRound(centerX - relativeY - node.width / 2),
      y: goRound(centerY + relativeX - node.height / 2),
    };
  }
  return point;
}

function moveWithChildren(node: TalaNode, point: Point): void {
  const dx = point.x - node.topLeft!.x, dy = point.y - node.topLeft!.y;
  const move = (current: TalaNode): void => {
    current.topLeft = { x: current.topLeft!.x + dx, y: current.topLeft!.y + dy };
    for (const child of current.children) move(child);
  };
  move(node);
}

function snapshot(graph: TalaGraph): Array<{ node: TalaNode; topLeft: Point; width: number; height: number }> {
  return graph.nodes.map((node) => ({ node, topLeft: { ...node.topLeft! }, width: node.width,
    height: node.height }));
}

function restore(before: ReturnType<typeof snapshot>): void {
  for (const item of before) {
    item.node.topLeft = { ...item.topLeft };
    item.node.width = item.width;
    item.node.height = item.height;
  }
}

function validSiblingGeometry(graph: TalaGraph): boolean {
  for (let i = 0; i < graph.nodes.length; i++) {
    const a = graph.nodes[i]!;
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const b = graph.nodes[j]!;
      if (a.parent !== b.parent) continue;
      if (a.topLeft!.x < b.topLeft!.x + b.width && a.topLeft!.x + a.width > b.topLeft!.x
        && a.topLeft!.y < b.topLeft!.y + b.height && a.topLeft!.y + a.height > b.topLeft!.y) return false;
    }
  }
  return true;
}

function isDiagonal(orientation: string): boolean {
  return orientation === 'TopLeft' || orientation === 'TopRight'
    || orientation === 'BottomLeft' || orientation === 'BottomRight';
}

function goRound(value: number): number { return value < 0 ? -Math.round(-value) : Math.round(value); }
