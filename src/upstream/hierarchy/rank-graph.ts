// Translated from internal/hierarchy/{rank_graph,rank_queue}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { MaxEngineNodes, MaxEngineEdges } from '../limits/work.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
export interface RankEdge {
  from: number;
  to: number;
  weight: bigint;
  id: bigint;
}
class NodeMinHeap {
  items: number[] = [];
  push(n: number): void {
    const a = this.items;
    a.push(n);
    for (let child = a.length - 1; child > 0;) {
      const parent = Math.floor((child - 1) / 2);
      if (a[parent]! <= a[child]!) break;
      [a[parent], a[child]] = [a[child]!, a[parent]!];
      child = parent;
    }
  }
  pop(): number {
    const a = this.items,
      root = a[0]!,
      last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let parent = 0; ;) {
        const left = parent * 2 + 1;
        if (left >= a.length) break;
        let child = left;
        const right = left + 1;
        if (right < a.length && a[right]! < a[left]!) child = right;
        if (a[parent]! <= a[child]!) break;
        [a[parent], a[child]] = [a[child]!, a[parent]!];
        parent = child;
      }
    }
    return root;
  }
}
export class RankProblem {
  constructor(
    public nodes: Node[],
    public edges: RankEdge[],
    public outgoingStart: number[],
    public pivotOrder: number[],
  ) {}
  longestPathLevels(guard: OptimizationWorkGuard): bigint[] {
    const indegree = new Array<number>(this.nodes.length).fill(0);
    for (const edge of this.edges) {
      guard.Step();
      indegree[edge.to]!++;
    }
    const ready = new NodeMinHeap();
    for (let i = 0; i < indegree.length; i++) {
      guard.Step();
      if (indegree[i] === 0) {
        ready.push(i);
        guard.Step();
      }
    }
    const levels = new Array<bigint>(this.nodes.length).fill(0n);
    let visited = 0;
    while (ready.items.length) {
      guard.Step();
      const u = ready.pop();
      visited++;
      for (
        let i = this.outgoingStart[u]!;
        i < this.outgoingStart[u + 1]!;
        i++
      ) {
        guard.Step();
        const e = this.edges[i]!,
          candidate = levels[u]! + 1n;
        if (candidate > 9223372036854775807n)
          throw new Error('initial level overflow');
        if (candidate > levels[e.to]!) levels[e.to] = candidate;
        indegree[e.to]!--;
        if (indegree[e.to] === 0) {
          ready.push(e.to);
          guard.Step();
        }
      }
    }
    if (visited !== this.nodes.length)
      throw new Error('input graph contains a directed cycle');
    return levels;
  }
}
export function newRankProblem(
  g: Graph,
  guard: OptimizationWorkGuard,
): RankProblem {
  if (!g) throw new Error('graph is required');
  if (g.Nodes.length > MaxEngineNodes)
    throw new Error(`node count exceeds limit ${MaxEngineNodes}`);
  if (g.Edges.length > MaxEngineEdges)
    throw new Error(`edge count exceeds limit ${MaxEngineEdges}`);
  const nodes = [...g.Nodes];
  guard.AddSort(nodes.length);
  nodes.sort((a, b) =>
    !a ? (!b ? 0 : -1) : !b ? 1 : a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0,
  );
  const index = new Map<Node, number>();
  for (let i = 0; i < nodes.length; i++) {
    guard.Step();
    const n = nodes[i];
    if (!n) throw new Error('nil node');
    if (i > 0 && nodes[i - 1]!.ID === n.ID)
      throw new Error(`duplicate node ID ${n.ID}`);
    if (index.has(n)) throw new Error(`duplicate node ${nodeDebugID(n)}`);
    index.set(n, i);
  }
  const edges: { edge: Edge; from: number; to: number }[] = [],
    seen = new Set<Edge>(),
    ids = new Set<bigint>(),
    pairs = new Set<string>();
  for (const edge of g.Edges) {
    guard.Step();
    if (!edge || !edge.From || !edge.To)
      throw new Error('edge has a nil endpoint');
    const from = index.get(edge.From),
      to = index.get(edge.To);
    if (from === undefined || to === undefined)
      throw new Error(`edge ${edge.ID} references a node outside the graph`);
    if (from === to) throw new Error(`self edge on ${nodeDebugID(edge.From)}`);
    if (edge.HasSourceArrow() || !edge.HasTargetArrow())
      throw new Error('canonical source-to-target directed edges required');
    const weight = edge.hierarchyRankWeightSet ? edge.hierarchyRankWeight : 1;
    if (weight <= 0 || weight > MaxEngineEdges)
      throw new Error(`edge ${edge.ID} has invalid rank weight ${weight}`);
    if (seen.has(edge)) throw new Error(`duplicate edge reference ${edge.ID}`);
    if (ids.has(edge.ID)) throw new Error(`duplicate edge ID ${edge.ID}`);
    const pair = `${from},${to}`;
    if (pairs.has(pair))
      throw new Error(
        `duplicate directed edge ${nodeDebugID(edge.From)} -> ${nodeDebugID(edge.To)}`,
      );
    seen.add(edge);
    ids.add(edge.ID);
    pairs.add(pair);
    edges.push({ edge, from, to });
  }
  guard.AddSort(edges.length);
  edges.sort(
    (a, b) =>
      a.from - b.from ||
      a.to - b.to ||
      (a.edge.ID < b.edge.ID ? -1 : a.edge.ID > b.edge.ID ? 1 : 0),
  );
  const incident = new Map<Edge, { from: number; to: number }>();
  let refs = 0;
  for (const node of nodes)
    for (const edge of node.Edges) {
      guard.Step();
      refs++;
      if (refs > MaxEngineEdges * 2)
        throw new Error(
          `incident edge references exceed limit ${MaxEngineEdges * 2}`,
        );
      if (!edge || (edge.From !== node && edge.To !== node))
        throw new Error(`malformed incident edge on ${nodeDebugID(node)}`);
      if (!seen.has(edge))
        throw new Error(
          `node ${nodeDebugID(node)} references an edge outside the graph`,
        );
      const counts = incident.get(edge) ?? { from: 0, to: 0 };
      if (edge.From === node) counts.from++;
      else counts.to++;
      incident.set(edge, counts);
    }
  for (const e of edges) {
    guard.Step();
    const count = incident.get(e.edge) ?? { from: 0, to: 0 };
    if (count.from !== 1 || count.to !== 1)
      throw new Error(
        `edge ${e.edge.ID} must appear once on each endpoint; got source=${count.from} target=${count.to}`,
      );
  }
  if (nodes.length > 1) {
    const seenNodes = new Set<number>([0]),
      queue = [0];
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]!;
      for (const edge of nodes[u]!.Edges) {
        guard.Step();
        const v = index.get(nodes[u]!.Adjacent(edge))!;
        if (!seenNodes.has(v)) {
          seenNodes.add(v);
          queue.push(v);
        }
      }
    }
    if (queue.length !== nodes.length)
      throw new Error('input graph is disconnected');
  }
  const result: RankEdge[] = [],
    starts = new Array<number>(nodes.length + 1).fill(0);
  for (const e of edges) {
    guard.Step();
    result.push({
      from: e.from,
      to: e.to,
      weight: BigInt(
        e.edge.hierarchyRankWeightSet ? e.edge.hierarchyRankWeight : 1,
      ),
      id: e.edge.ID,
    });
    starts[e.from + 1]!++;
  }
  for (let i = 0; i < nodes.length; i++) {
    guard.Step();
    starts[i + 1]! += starts[i]!;
  }
  const pivot: number[] = [];
  for (let i = 0; i < result.length; i++) {
    guard.Step();
    pivot.push(i);
  }
  guard.AddSort(pivot.length);
  pivot.sort((a, b) =>
    result[a]!.id < result[b]!.id ? -1 : result[a]!.id > result[b]!.id ? 1 : 0,
  );
  return new RankProblem(nodes, result, starts, pivot);
}
