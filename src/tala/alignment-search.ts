import { AxisAlignmentTolerance } from './geometry-policy.js';
import { ordinaryAlignmentDeltas } from './alignment-deltas.js';
import { attemptAxisShift, overlapPairs } from './alignment-shift.js';
import type { TalaEdge, TalaGraph, TalaNode } from './graph.js';

export interface AxisAlignmentOptions {
  excludedEdges?: ReadonlySet<TalaEdge>;
  excludedNodes?: readonly TalaNode[];
}

interface Candidate {
  nodes: TalaNode[];
  dx: number;
  dy: number;
}

/** The ordinary-endpoint candidate loop from placement.alignAxes. Callers
 * supply upstream-equivalent total EdgeLength + ContainerAlignmentCost. */
export function alignAxesPass(graph: TalaGraph, score: (graph: TalaGraph) => number,
  options: AxisAlignmentOptions = {}): boolean {
  let changed = false;
  const existingOverlaps = overlapPairs(graph);
  const fixed = graph.nodes.filter((node) => node.fixedTopLeft);
  const excluded = [...fixed, ...(options.excludedNodes ?? [])];
  for (const edge of graph.edges) {
    if (options.excludedEdges?.has(edge) || edge.from.inHierarchy || edge.to.inHierarchy
      || edge.fromTableColumnIndex !== undefined
      || edge.toTableColumnIndex !== undefined || isAxisAligned(edge)) continue;
    const deltas = ordinaryAlignmentDeltas(edge);
    let bestScore = score(graph);
    let best: Candidate | undefined;
    for (const endpoint of [edge.from, edge.to]) {
      const other = endpoint === edge.from ? edge.to : edge.from;
      const nodes = endpoint.connectedNodes([...excluded, other], graph);
      const sign = endpoint === edge.from ? 1 : -1;
      const attempts: [number, number][] = [[0, sign * deltas.y], [sign * deltas.x, 0]];
      for (const [dx, dy] of attempts) {
        if (dx === 0 && dy === 0) continue;
        const previous = graph.nodes.map((node) => ({ node, topLeft: node.topLeft
          ? { ...node.topLeft } : undefined, width: node.width,
        height: node.height, x: node.x, y: node.y }));
        if (attemptAxisShift(graph, edge, nodes, dx, dy, existingOverlaps)) {
          const candidateScore = score(graph);
          // tryMove chooses the later X attempt when both attempts tie.
          if (candidateScore <= bestScore) {
            if (candidateScore < bestScore || best?.nodes === nodes) {
              bestScore = candidateScore;
              best = { nodes, dx, dy };
            }
          }
        }
        for (const old of previous) {
          old.node.topLeft = old.topLeft;
          old.node.width = old.width;
          old.node.height = old.height;
          old.node.x = old.x;
          old.node.y = old.y;
        }
      }
    }
    if (best) {
      if (!attemptAxisShift(graph, edge, best.nodes, best.dx, best.dy, existingOverlaps))
        throw new Error('accepted alignment move became invalid');
      changed = true;
    }
  }
  return changed;
}

function isAxisAligned(edge: TalaEdge): boolean {
  const a = edge.from, b = edge.to;
  if (!a.topLeft || !b.topLeft) return false;
  return Math.abs(a.topLeft.x + a.width / 2 - b.topLeft.x - b.width / 2) <= AxisAlignmentTolerance
    || Math.abs(a.topLeft.y + a.height / 2 - b.topLeft.y - b.height / 2) <= AxisAlignmentTolerance;
}
