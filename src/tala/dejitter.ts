import type { PositionedEdge, PositionedNode, Point } from '../layout.js';
import { TalaGraph, type TalaEdge, type TalaNode } from './graph.js';
import { doesOverlapAt } from './overlap.js';
import { segmentIntersectsBox } from './sized-cost.js';
import { nodeSymmetry } from './symmetry.js';

const JitterThreshold = 80;
const SignFlipPadding = 5;

/** The tree-sentinel branch of placement.Dejitter. Accepted candidates update
 * their incident routes before the next candidate is considered. */
export function dejitterTreeRoutes(nodes: PositionedNode[], edges: PositionedEdge[],
  sentinelIds: ReadonlySet<string>): boolean {
  const graph = TalaGraph.fromFlowchart(nodes, edges);
  const byNode = new Map(nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    const placed = byNode.get(node.id)!;
    node.topLeft = { x: placed.x - placed.width / 2, y: placed.y - placed.height / 2 };
  }
  const byRoute = new Map(edges.map((edge) => [edge.id, edge]));
  for (const edge of graph.edges) edge.points = byRoute.get(edge.id)!.points.map((point) => ({ ...point }));

  let changed = false;
  for (const node of graph.nodes) {
    if (node.isGroup || node.fixedTopLeft || !sentinelIds.has(node.id)) continue;
    let priorSymmetry = nodeSymmetry(node, graph);
    for (const edge of node.edges) {
      if (edge.points.length < 4) continue;
      const from = edge.from === node;
      const points = edge.points;
      const first = from ? points[1]! : points.at(-2)!;
      const second = from ? points[2]! : points.at(-3)!;
      const before = from ? points[3]! : points.at(-4)!;
      const onNode = from ? points[0]! : points.at(-1)!;
      if (Math.hypot(first.x - second.x, first.y - second.y) > JitterThreshold) continue;
      const vertical = first.y === second.y;
      const axis = vertical ? 'x' : 'y';
      const lengthAxis = vertical ? 'y' : 'x';
      if (before[lengthAxis] > first[lengthAxis] && onNode[lengthAxis] > first[lengthAxis]
        || before[lengthAxis] < first[lengthAxis] && onNode[lengthAxis] < first[lengthAxis]) continue;
      const difference = second[axis] - first[axis];
      const delta = difference < 0 ? -Math.round(-difference) : Math.round(difference);
      if (delta === 0) continue;
      if (node.edges.some((other) => other !== edge && other.points.length === 2
        && (nearSegmentVertical(other, node) === vertical))) continue;

      const signFlipDelta = delta + Math.sign(delta) * SignFlipPadding;
      const newSegments = new Map<TalaEdge, [Point, Point]>();
      let signFlip = false;
      for (const other of node.edges) {
        const route = other.points;
        if (route.length < 2 || route.length === 2
          && route[0]!.x !== route[1]!.x && route[0]!.y !== route[1]!.y) continue;
        const forward = other.from === node;
        const p0 = forward ? route[0]! : route.at(-1)!;
        const p1 = forward ? route[1]! : route.at(-2)!;
        const p2 = forward ? route[2] : route.at(-3);
        const otherVertical = p0.x === p1.x;
        const same = vertical === otherVertical;
        if (same && !p2) continue;
        const a = { ...p0, [axis]: p0[axis] + delta };
        const b = same ? { ...p1, [axis]: p1[axis] + delta } : p1;
        newSegments.set(other, [a, b]);
        if (same && other !== edge && crosses(p1[axis], p2![axis], signFlipDelta)
          || !same && crosses(p0[axis], p1[axis], signFlipDelta)) {
          signFlip = true;
          break;
        }
      }
      if (signFlip || newlyIntersectsNode(graph, node, newSegments)) continue;

      const oldCrossings = routedSegmentsThroughNode(graph, node);
      const oldPosition = { ...node.topLeft! };
      node.topLeft = { ...oldPosition, [axis]: oldPosition[axis] + delta };
      const candidateSymmetry = nodeSymmetry(node, graph);
      const accepted = routedSegmentsThroughNode(graph, node) <= oldCrossings
        && candidateSymmetry >= priorSymmetry
        && validPosition(graph, node, oldPosition);
      if (!accepted) { node.topLeft = oldPosition; continue; }
      priorSymmetry = candidateSymmetry;
      for (const other of node.edges) {
        const route = other.points;
        const forward = other.from === node;
        const firstIndex = forward ? 0 : route.length - 1;
        const secondIndex = forward ? 1 : route.length - 2;
        const otherVertical = route[firstIndex]!.x === route[secondIndex]!.x;
        route[firstIndex] = { ...route[firstIndex]!, [axis]: route[firstIndex]![axis] + delta };
        if (vertical === otherVertical) {
          route[secondIndex] = { ...route[secondIndex]!, [axis]: route[secondIndex]![axis] + delta };
        }
      }
      edge.points = from ? [edge.points[0]!, ...edge.points.slice(3)]
        : [...edge.points.slice(0, -3), edge.points.at(-1)!];
      changed = true;
    }
  }
  if (changed) for (const node of graph.nodes) {
    const placed = byNode.get(node.id)!;
    placed.x = node.topLeft!.x + node.width / 2;
    placed.y = node.topLeft!.y + node.height / 2;
  }
  return changed;
}

function nearSegmentVertical(edge: TalaEdge, node: TalaNode): boolean {
  const points = edge.points;
  const a = edge.from === node ? points[0]! : points.at(-1)!;
  const b = edge.from === node ? points[1]! : points.at(-2)!;
  return a.x === b.x;
}

function crosses(first: number, second: number, delta: number): boolean {
  return first + delta < second && first > second
    || first + delta > second && first < second;
}

function newlyIntersectsNode(graph: TalaGraph, node: TalaNode,
  segments: ReadonlyMap<TalaEdge, [Point, Point]>): boolean {
  for (const [edge, [a, b]] of segments) for (const other of graph.nodes) {
    if (other === node || other === edge.from || other === edge.to) continue;
    if (edge.from.isDescendantOf(other) || edge.to.isDescendantOf(other)) continue;
    if (other.topLeft && segmentIntersectsBox(a, b, other)) return true;
  }
  return false;
}

function routedSegmentsThroughNode(graph: TalaGraph, node: TalaNode): number {
  let count = 0;
  for (const edge of graph.edges) {
    if (edge.from === node || edge.to === node) continue;
    for (let i = 1; i < edge.points.length; i++) {
      if (segmentIntersectsBox(edge.points[i - 1]!, edge.points[i]!, node)) count++;
    }
  }
  return count;
}

function validPosition(graph: TalaGraph, node: TalaNode, old: Point): boolean {
  for (const other of graph.nodes) {
    if (other === node || other.isDescendantOf(node) || node.isDescendantOf(other)
      || !other.topLeft) continue;
    if (doesOverlapAt(node, other, node.topLeft!) && !doesOverlapAt(node, other, old)) return false;
  }
  if (node.parent && node.parent.topLeft) {
    const box = node.parent;
    const corner = box.topLeft!;
    if (node.topLeft!.x < corner.x || node.topLeft!.y < corner.y
      || node.topLeft!.x + node.width > corner.x + box.width
      || node.topLeft!.y + node.height > corner.y + box.height) return false;
  }
  return true;
}
