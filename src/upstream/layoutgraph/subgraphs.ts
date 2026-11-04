// Translated graph splitting and ownership journals from internal/layoutgraph
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import {
  WorkGuard,
  MaxEngineWorkUnits,
  MaxEngineNodes,
} from '../limits/work.js';
import { Graph } from './graph.js';
import type { Node } from './node.js';
import type { Edge } from './edge.js';
import { validateEngineGraph } from './topology-preflight.js';
import {
  allReachableNodesGuarded,
  type ReachabilityWork,
} from './reachability.js';
export interface SplitOptions {
  IncludeContainers: boolean;
  IncludeNears: boolean;
  TraverseTrees: boolean;
}
export class NodeGraphOwnershipJournal {
  constructor(public original = new Map<Node, Graph | null>()) {}
  Restore(): void {
    for (const [node, graph] of this.original) node.Graph = graph;
  }
  OriginalGraph(node: Node): [Graph | null, boolean] {
    return [this.original.get(node) ?? null, this.original.has(node)];
  }
}
export function CopyEntitiesFrom(g: Graph, other: Graph): void {
  g.Containers = other.Containers;
  g.Clusters = other.Clusters;
  g.Trees = other.Trees;
  g.NodeToTree = other.NodeToTree;
  g.Sequences = other.Sequences;
  g.Hubs = other.Hubs;
  g.Directions = other.Directions;
  g.CommonUncleSiblings = other.CommonUncleSiblings;
  g.IsRootHierarchy = other.IsRootHierarchy;
}
export function SplitSubgraphs(
  ctx: Context,
  g: Graph,
  options: SplitOptions,
): Graph[] {
  return SplitSubgraphsTracked(ctx, g, options, null)[0];
}
export function SplitSubgraphsTracked(
  ctx: Context,
  g: Graph,
  options: SplitOptions,
  sharedGuard: ReachabilityWork | null,
): [Graph[], NodeGraphOwnershipJournal] {
  let guard = sharedGuard;
  if (guard === null) {
    validateEngineGraph(ctx, 'SplitSubgraphs', g);
    guard = new WorkGuard(ctx, 'SplitSubgraphs', MaxEngineWorkUnits);
  } else guard.Finish();
  const work = guard,
    original = new Map<Node, Graph | null>();
  for (const node of g.Nodes) {
    work.Step();
    if (node !== null) original.set(node, node.Graph);
  }
  let complete = false;
  try {
    const graphs: Graph[] = [];
    if (g.Nodes.length === 0) {
      complete = true;
      return [graphs, new NodeGraphOwnershipJournal()];
    }
    const added = new Set<Node>(),
      nodeToSubgraph = new Map<Node, Graph>();
    const addReachable = (startingNode: Node, subgraph: Graph) => {
      const reachable = allReachableNodesGuarded(
        startingNode,
        options.IncludeContainers,
        options.IncludeNears,
        options.TraverseTrees,
        null,
        work,
      );
      for (const node of reachable) {
        work.Step();
        if (added.has(node)) continue;
        if (!original.has(node)) {
          if (original.size >= MaxEngineNodes)
            throw new Error(
              `TALA SplitSubgraphs unique node ownership exceeds limit ${MaxEngineNodes}`,
            );
          original.set(node, node.Graph);
        }
        subgraph.AddNodeUnchecked(node);
        added.add(node);
        nodeToSubgraph.set(node, subgraph);
      }
    };
    const fixedNodes: Node[] = [];
    for (const node of g.Nodes) {
      work.Step();
      if (node.FixedTopLeft !== null) fixedNodes.push(node);
    }
    if (fixedNodes.length > 0) {
      const subgraph = new Graph();
      CopyEntitiesFrom(subgraph, g);
      for (const startingNode of fixedNodes)
        addReachable(startingNode, subgraph);
      graphs.push(subgraph);
    }
    for (const startingNode of g.Nodes) {
      work.Step();
      if (added.has(startingNode)) continue;
      const subgraph = new Graph();
      CopyEntitiesFrom(subgraph, g);
      addReachable(startingNode, subgraph);
      graphs.push(subgraph);
    }
    const seenEdges = new Map<Graph, Set<Edge>>(),
      appendEdge = (graph: Graph, edge: Edge) => {
        if (!seenEdges.has(graph)) seenEdges.set(graph, new Set());
        const graphEdges = seenEdges.get(graph)!;
        if (graphEdges.has(edge)) return;
        graphEdges.add(edge);
        graph.Edges.push(edge);
      };
    for (const edge of g.Edges) {
      work.Step();
      const fromGraph = nodeToSubgraph.get(edge.From),
        toGraph = nodeToSubgraph.get(edge.To);
      if (fromGraph !== undefined) appendEdge(fromGraph, edge);
      if (toGraph !== undefined && toGraph !== fromGraph)
        appendEdge(toGraph, edge);
    }
    work.Finish();
    complete = true;
    return [graphs, new NodeGraphOwnershipJournal(original)];
  } finally {
    if (!complete) for (const [node, graph] of original) node.Graph = graph;
  }
}
