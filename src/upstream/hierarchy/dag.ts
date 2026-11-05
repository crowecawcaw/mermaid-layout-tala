// Translated from internal/hierarchy/discovery.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../limits/work.js';
import { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { NoArrowhead, TriangleArrowhead } from '../layoutgraph/records.js';
import { isHierarchyStructuralEdge } from './eligibility.js';
export function findCycleEdges(ctx: Context, g: Graph): Set<Edge> {
  const guard = new WorkGuard(ctx, 'FindCycleEdges', MaxEngineWorkUnits),
    incoming = new Map<Node, Set<Edge>>(),
    outgoing = new Map<Node, Set<Edge>>(),
    nodes = new Set<Node>(),
    edges = new Set<Edge>();
  const add = (map: Map<Node, Set<Edge>>, node: Node, edge: Edge) => {
    let list = map.get(node);
    if (!list) {
      list = new Set();
      map.set(node, list);
    }
    list.add(edge);
  };
  for (const e of g.Edges) {
    guard.Step();
    edges.add(e);
    nodes.add(e.From);
    nodes.add(e.To);
    if (e.HasArrowTo(e.From)) {
      add(incoming, e.From, e);
      add(outgoing, e.To, e);
    } else {
      add(outgoing, e.From, e);
      add(incoming, e.To, e);
    }
  }
  const size = (map: Map<Node, Set<Edge>>, node: Node) =>
      map.get(node)?.size ?? 0,
    nonCycle = new Set<Edge>();
  const prune = (n: Node) => {
    for (const e of incoming.get(n) ?? []) {
      guard.Step();
      nonCycle.add(e);
      const adj = n.Adjacent(e);
      outgoing.get(adj)?.delete(e);
      if (size(outgoing, adj) === 0 && size(incoming, adj) === 0) {
        nodes.delete(adj);
        outgoing.delete(adj);
        incoming.delete(adj);
      }
    }
    for (const e of outgoing.get(n) ?? []) {
      guard.Step();
      nonCycle.add(e);
      const adj = n.Adjacent(e);
      incoming.get(adj)?.delete(e);
      if (size(incoming, adj) === 0 && size(outgoing, adj) === 0) {
        nodes.delete(adj);
        incoming.delete(adj);
        outgoing.delete(adj);
      }
    }
    nodes.delete(n);
    incoming.delete(n);
    outgoing.delete(n);
  };
  while (nodes.size) {
    guard.Step();
    for (;;) {
      let found = false;
      for (const n of nodes) {
        guard.Step();
        if (size(outgoing, n) === 0) {
          found = true;
          prune(n);
        }
      }
      if (!found) break;
    }
    for (;;) {
      let found = false;
      for (const n of nodes) {
        guard.Step();
        if (size(incoming, n) === 0) {
          found = true;
          prune(n);
        }
      }
      if (!found) break;
    }
    if (nodes.size) {
      let best: Node | null = null,
        max = -Infinity;
      for (const n of nodes) {
        guard.Step();
        const diff = size(outgoing, n) - size(incoming, n);
        if (diff > max) {
          max = diff;
          best = n;
        } else if (diff === max) {
          const count = size(outgoing, n) + size(incoming, n),
            bestCount = size(outgoing, best!) + size(incoming, best!);
          if (
            count > bestCount ||
            (size(incoming, n) === size(incoming, best!) && n.ID < best!.ID)
          ) {
            max = diff;
            best = n;
          }
        }
      }
      for (const e of incoming.get(best!) ?? []) {
        guard.Step();
        incoming.get(best!)!.delete(e);
        outgoing.get(best!.Adjacent(e))?.delete(e);
      }
      prune(best!);
    }
  }
  for (const e of nonCycle) {
    guard.Step();
    edges.delete(e);
  }
  guard.Finish();
  return edges;
}
export function reverseEdges(ctx: Context, edges: Set<Edge>): void {
  const guard = new WorkGuard(ctx, 'ReverseEdges', MaxEngineWorkUnits);
  for (const _ of edges) guard.Step();
  guard.Finish();
  for (const e of edges) [e.From, e.To] = [e.To, e.From];
}
export function removeDuplicateEdges(ctx: Context, g: Graph): void {
  const guard = new WorkGuard(ctx, 'RemoveDuplicateEdges', MaxEngineWorkUnits),
    pairs = new Map<Node, Map<Node, Edge>>(),
    unique: Edge[] = [],
    weights = new Map<Edge, number>();
  for (const e of g.Edges) {
    guard.Step();
    let from = pairs.get(e.From);
    if (!from) {
      from = new Map();
      pairs.set(e.From, from);
    }
    const retained = from.get(e.To),
      weight = e.hierarchyRankWeightSet ? e.hierarchyRankWeight : 1;
    if (retained) weights.set(retained, weights.get(retained)! + weight);
    else {
      from.set(e.To, e);
      unique.push(e);
      weights.set(e, weight);
    }
  }
  guard.Finish();
  for (const e of unique) {
    e.hierarchyRankWeight = weights.get(e)!;
    e.hierarchyRankWeightSet = true;
  }
  for (const e of g.Edges) {
    e.From.Edges = [];
    e.To.Edges = [];
  }
  g.Edges = unique;
  for (const e of unique) {
    e.From.Edges.push(e);
    if (e.To !== e.From) e.To.Edges.push(e);
  }
}
export function makeSimpleDAG(ctx: Context, g: Graph): Graph {
  const guard = new WorkGuard(ctx, 'MakeSimpleDAG', MaxEngineWorkUnits),
    dag = new Graph(),
    byId = new Map<bigint, Node>();
  const connect = (from: Node, to: Node, weight: number) => {
    const e = dag.Connect(from, to);
    e.SourceArrowhead = NoArrowhead;
    e.TargetArrowhead = TriangleArrowhead;
    e.ID = BigInt(dag.Edges.length);
    e.hierarchyRankWeight = weight;
    e.hierarchyRankWeightSet = true;
  };
  for (const n of g.Nodes) {
    guard.Step();
    const copy = dag.AddNode(new Node(n.ID, n.Width, n.Height));
    copy.D2ID = n.D2ID;
    byId.set(n.ID, copy);
  }
  for (const e of g.Edges) {
    guard.Step();
    if (!isHierarchyStructuralEdge(e)) continue;
    if (e.IsDirected()) {
      const [from, to] = e.DirectedEndpoints();
      connect(byId.get(from!.ID)!, byId.get(to!.ID)!, 1);
    } else {
      connect(byId.get(e.From.ID)!, byId.get(e.To.ID)!, 1);
      connect(byId.get(e.To.ID)!, byId.get(e.From.ID)!, 0);
    }
  }
  const cycles = findCycleEdges(ctx, dag);
  reverseEdges(ctx, cycles);
  removeDuplicateEdges(ctx, dag);
  for (const _ of dag.Nodes) guard.Step();
  guard.Finish();
  return dag;
}
export function mapDAGToGraphLevels(
  g: Graph,
  levels: Map<Node, number>,
): Map<Node, number> {
  const byId = new Map(g.Nodes.map((n) => [n.ID, n])),
    out = new Map<Node, number>();
  for (const [node, level] of levels) out.set(byId.get(node.ID)!, level);
  return out;
}
