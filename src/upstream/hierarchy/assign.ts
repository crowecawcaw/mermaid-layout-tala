// Translated from internal/hierarchy/discovery.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Hierarchy } from '../layoutgraph/records.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import { EnsureTransactionWorkGuard } from '../layoutgraph/transaction.js';
import { GraphState, RollbackGraphState } from '../layoutgraph/graph-state.js';
import {
  allDescendantNodesGuarded,
  unboundedWork,
} from '../layoutgraph/containment.js';
import {
  CopyEntitiesFrom,
  SplitSubgraphsTracked,
  NodeGraphOwnershipJournal,
} from '../layoutgraph/subgraphs.js';
import {
  AbductEdges,
  RestoreEdgeAbductions,
} from '../layoutgraph/edge-abduction.js';
import { build } from './build.js';
export function Assign(
  ctx: Context,
  g: Graph,
  root: Node | null,
  hierarchicalNodes: Set<Node>,
): void {
  validateEngineGraph(ctx, 'AssignNodeHierarchy', g);
  let guard: import('../limits/work.js').WorkGuard;
  [ctx, guard] = EnsureTransactionWorkGuard(
    ctx,
    'AssignNodeHierarchyTransactions',
  );
  const state = new GraphState({
    CaptureTopology: true,
    CaptureEdgeRoutes: true,
  });
  state.UpdateWithWorkGuard(g, guard);
  let complete = false;
  try {
    const owned = state.OwnedNodes(g, guard),
      seen = new Set<Hierarchy>();
    for (const node of owned) {
      guard.Step();
      if (node.Hierarchy) seen.add(node.Hierarchy);
    }
    for (const hierarchy of seen)
      for (const node of hierarchy.Levels().keys()) {
        guard.Step();
        if (owned.has(node)) hierarchy.Levels().delete(node);
      }
    for (const node of owned) {
      guard.Step();
      node.Hierarchy = null;
    }
    assign(ctx, g, root, hierarchicalNodes);
    guard.Finish();
    complete = true;
  } finally {
    if (!complete) RollbackGraphState(g, state);
  }
}
function assign(
  ctx: Context,
  g: Graph,
  root: Node | null,
  hierarchicalNodes: Set<Node>,
): void {
  const force = root ? root.ForceHierarchy : g.IsRootHierarchy,
    hierarchyGraph = new Graph();
  CopyEntitiesFrom(hierarchyGraph, g);
  for (const node of g.Containers.get(root) ?? [])
    hierarchyGraph.AddNodeUnchecked(node);
  const abductions = AbductEdges(g, root, hierarchyGraph);
  let restored = false,
    ownership = new NodeGraphOwnershipJournal();
  try {
    for (const child of g.Containers.get(root) ?? [])
      if (!hierarchicalNodes.has(child) && child.isContainer)
        assign(ctx, g, child, hierarchicalNodes);
    const [subgraphs, journal] = SplitSubgraphsTracked(
      ctx,
      hierarchyGraph,
      { IncludeContainers: false, IncludeNears: false, TraverseTrees: false },
      null,
    );
    ownership = journal;
    for (const subgraph of subgraphs) {
      const hierarchy = build(
        ctx,
        subgraph,
        force,
        hierarchicalNodes,
        abductions,
      );
      if (!hierarchy) continue;
      for (const node of subgraph.Nodes) {
        node.Hierarchy = hierarchy;
        for (const descendant of allDescendantNodesGuarded(
          g,
          node,
          false,
          unboundedWork,
        )) {
          hierarchy.Levels().set(descendant, hierarchy.Levels().get(node) ?? 0);
          descendant.Hierarchy = hierarchy;
        }
      }
    }
    RestoreEdgeAbductions(g, abductions);
    restored = true;
    if (!root)
      for (const node of g.Nodes) {
        const nears = node.Nears;
        node.Nears = new Set();
        if (!node.Hierarchy)
          for (const near of nears) if (!near.Hierarchy) node.AddNear(near);
      }
  } finally {
    if (!restored) RestoreEdgeAbductions(g, abductions);
    ownership.Restore();
    for (const node of g.Nodes) node.Graph = g;
  }
}
