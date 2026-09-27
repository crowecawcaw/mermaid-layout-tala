import type { Point } from '../layout.js';
import { countGraphEdgeCrossings } from './crossings.js';
import { TalaGraph, TalaNode } from './graph.js';
import { doesOverlapAt } from './overlap.js';
import { ordinaryPlacementEdgeLength } from './placement-edge-length.js';
import { sizedOrientation } from './placement-geometry.js';
import { sizedNodeEdgeLength } from './sized-cost.js';
import { nodeSymmetry } from './symmetry.js';

const precision = 1e-6;

/** The ordinary sibling branch of placement.Swap / swapOptimize. */
export function swapStage(graph: TalaGraph): boolean {
  graph.computeCellSize();
  let changed = false;
  for (let pass = 0; pass < 4; pass++) {
    const swapped = swapOptimize(graph);
    changed = changed || swapped;
    if (!swapped) break;
  }
  return changed;
}

function swapOptimize(graph: TalaGraph): boolean {
  const turnCost = graph.turnCost();
  const measure = (node: TalaNode): number => sizedNodeEdgeLength(node, graph, turnCost)
    - nodeSymmetry(node, graph) * graph.cellSize * node.edges.length;
  let changed = false;
  for (const node of graph.nodes) {
    if (!node.topLeft || node.fixedTopLeft || node.edges.length === 0 && !hasLeakyEdge(node)) continue;
    let best: { candidate: TalaNode; smart: boolean; global: number } | undefined;
    const currentGlobal = ordinaryPlacementEdgeLength(graph);
    const currentLocal = measure(node);
    const currentCrossings = countGraphEdgeCrossings(graph);
    for (const candidate of graph.containers.get(node.parent) ?? []) {
      if (candidate === node || !candidate.topLeft || candidate.fixedTopLeft) continue;
      const plain = trial(node, candidate, false);
      const smart = trial(node, candidate, true);
      const selected = choose(plain, smart);
      if (!selected) continue;
      if (selected.crossings > currentCrossings || selected.global >= currentGlobal - precision
        || selected.global >= (best?.global ?? Infinity) - precision) continue;
      if (currentLocal !== 0 && selected.local >= currentLocal - precision) continue;
      best = { candidate, smart: selected.smart, global: selected.global };
    }
    if (best) {
      applySwap(node, best.candidate, best.smart);
      changed = true;
    }
  }
  return changed;

  function trial(node: TalaNode, candidate: TalaNode, smart: boolean):
    { smart: boolean; local: number; global: number; crossings: number } | undefined {
    const before = snapshot(graph);
    applySwap(node, candidate, smart);
    try {
      if (!validGeometry(graph)) return;
      return { smart, local: measure(node), global: ordinaryPlacementEdgeLength(graph),
        crossings: countGraphEdgeCrossings(graph) };
    } finally { restore(before); }
  }
}

interface Trial { smart: boolean; local: number; global: number; crossings: number }
function choose(plain: Trial | undefined, smart: Trial | undefined): Trial | undefined {
  if (!plain) return smart;
  if (!smart) return plain;
  if (plain.local === 0 && smart.local !== 0) return smart;
  if (smart.local === 0 && plain.local !== 0) return plain;
  if (plain.local === 0 && smart.local === 0) return smart.global < plain.global - precision ? smart : plain;
  return smart.local < plain.local - precision ? smart : plain;
}

function applySwap(first: TalaNode, second: TalaNode, smart: boolean): void {
  const a = first.topLeft!, b = second.topLeft!;
  if (!smart) {
    moveWithChildren(first, b);
    moveWithChildren(second, a);
    return;
  }
  const orientation = sizedOrientation(first, second);
  let nextA: Point = { ...b }, nextB: Point = { ...a };
  switch (orientation) {
    case 'Left': nextA = { x: b.x + second.width - first.width, y: a.y };
      nextB = { x: a.x, y: b.y }; break;
    case 'Right': nextA = { x: b.x, y: a.y };
      nextB = { x: a.x + first.width - second.width, y: b.y }; break;
    case 'Top': nextA = { x: a.x, y: b.y + second.height - first.height };
      nextB = { x: b.x, y: a.y }; break;
    case 'Bottom': nextA = { x: a.x, y: b.y };
      nextB = { x: b.x, y: a.y + first.height - second.height }; break;
    case 'TopLeft': nextA = { x: b.x + second.width - first.width,
      y: b.y + second.height - first.height }; break;
    case 'TopRight': nextA = { x: b.x, y: b.y + second.height - first.height };
      nextB = { x: a.x + first.width - second.width, y: a.y }; break;
    case 'BottomLeft': nextA = { x: b.x + second.width - first.width, y: b.y };
      nextB = { x: a.x, y: a.y + first.height - second.height }; break;
    case 'BottomRight': nextB = { x: a.x + first.width - second.width,
      y: a.y + first.height - second.height }; break;
  }
  moveWithChildren(first, nextA);
  moveWithChildren(second, nextB);
}

function moveWithChildren(node: TalaNode, point: Point): void {
  const dx = point.x - node.topLeft!.x, dy = point.y - node.topLeft!.y;
  const move = (current: TalaNode): void => {
    current.topLeft = { x: current.topLeft!.x + dx, y: current.topLeft!.y + dy };
    for (const child of current.children) move(child);
  };
  move(node);
}

function hasLeakyEdge(node: TalaNode): boolean {
  if (!node.isGroup) return false;
  const visit = (current: TalaNode): boolean => current.edges.some((edge) =>
    !current.adjacent(edge).isDescendantOf(node) && current.adjacent(edge) !== node)
    || current.children.some(visit);
  return node.children.some(visit);
}

function validGeometry(graph: TalaGraph): boolean {
  for (const siblings of graph.containers.values()) {
    for (let i = 0; i < siblings.length; i++) for (let j = i + 1; j < siblings.length; j++) {
      const a = siblings[i]!, b = siblings[j]!;
      if (a.topLeft && b.topLeft && doesOverlapAt(a, b, a.topLeft)) return false;
    }
  }
  return true;
}

function snapshot(graph: TalaGraph): Array<{ node: TalaNode; point: Point }> {
  return graph.nodes.filter((node) => node.topLeft).map((node) => ({ node, point: { ...node.topLeft! } }));
}

function restore(before: ReturnType<typeof snapshot>): void {
  for (const { node, point } of before) node.topLeft = point;
}
