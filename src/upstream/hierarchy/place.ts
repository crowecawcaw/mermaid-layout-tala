// Translated from internal/hierarchy/placement.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Random } from '../limits/optimization.js';
import { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Orientation as O } from '../geo/orientation.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import { EnsureTransactionWorkGuard } from '../layoutgraph/transaction.js';
import { GraphState, RollbackGraphState } from '../layoutgraph/graph-state.js';
import {
  CopyEntitiesFrom,
  SplitSubgraphsTracked,
  NodeGraphOwnershipJournal,
} from '../layoutgraph/subgraphs.js';
import {
  AbductEdges,
  RestoreEdgeAbductions,
} from '../layoutgraph/edge-abduction.js';
import { mirrorNode } from '../placement/mirror.js';
import {
  createPlacementNodes,
  connectPlacementNodes,
  groupPlacementNodesByLevel,
  initializeRanks,
  breakLongConnections,
  removeTableColumnNodes,
  computeLevelRanks,
} from './placement-nodes.js';
import { minimizeHierarchyCrossings } from './crossing.js';
import { globalSifting } from './sifting.js';
import { IsHorizontal } from './validity.js';
import { placeNodesByLevel } from './initial-geometry.js';
import { alignHierarchy } from './alignment.js';
function walk(g: Graph, apply: (n: Node) => void): void {
  const queue = [...g.Nodes];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i]!;
    if (n.isContainer) queue.push(...(g.Containers.get(n) ?? []));
    apply(n);
  }
}
function transpose(g: Graph): void {
  walk(g, (n) => {
    [n.Width, n.Height] = [n.Height, n.Width];
    if (n.TopLeft) [n.TopLeft.X, n.TopLeft.Y] = [n.TopLeft.Y, n.TopLeft.X];
    [n.padding.left, n.padding.top] = [n.padding.top, n.padding.left];
    [n.padding.right, n.padding.bottom] = [n.padding.bottom, n.padding.right];
    [n.margin.left, n.margin.top] = [n.margin.top, n.margin.left];
    [n.margin.right, n.margin.bottom] = [n.margin.bottom, n.margin.right];
  });
}
export function placeNodesInHierarchy(
  ctx: Context,
  g: Graph,
  random: Random | null,
): void {
  const hierarchy = g.Nodes[0]!.Hierarchy;
  if (hierarchy)
    for (const node of hierarchy.Levels().keys()) {
      const err = ctx.Err();
      if (err)
        throw new Error(`PlaceHierarchies: ${err.message}`, { cause: err });
      if (node.FixedTopLeft) return;
    }
  let guard: import('../limits/work.js').WorkGuard;
  [ctx, guard] = EnsureTransactionWorkGuard(
    ctx,
    'PlaceHierarchiesTransactions',
  );
  const state = new GraphState({
    CaptureTopology: false,
    CaptureEdgeRoutes: true,
  });
  state.UpdateWithWorkGuard(g, guard);
  let complete = false;
  try {
    const nodes = createPlacementNodes(g, g.Nodes, random);
    connectPlacementNodes(g, nodes);
    const levels = groupPlacementNodesByLevel(nodes);
    initializeRanks(levels);
    breakLongConnections(nodes, levels);
    minimizeHierarchyCrossings(levels);
    globalSifting(levels);
    const horizontal = IsHorizontal(g.Nodes);
    if (horizontal) transpose(g);
    placeNodesByLevel(g, levels, horizontal);
    for (let level = 0; level < levels.size; level++) {
      const filtered = removeTableColumnNodes(levels.get(level)!);
      levels.set(level, filtered);
      computeLevelRanks(filtered);
    }
    alignHierarchy(ctx, g, levels);
    if (horizontal) transpose(g);
    switch (g.Nodes[0]!.Graph!.Direction(g.Nodes[0]!.container())) {
      case O.Left:
        walk(g, (n) => mirrorNode(n, true, false));
        break;
      case O.Top:
        walk(g, (n) => mirrorNode(n, false, true));
        break;
    }
    complete = true;
  } finally {
    if (!complete) RollbackGraphState(g, state);
  }
}
export function Place(
  ctx: Context,
  g: Graph,
  root: Node | null,
  random: Random | null,
): void {
  validateEngineGraph(ctx, 'PlaceHierarchies', g);
  if (!g.Containers.get(root)?.length) return;
  let guard: import('../limits/work.js').WorkGuard;
  [ctx, guard] = EnsureTransactionWorkGuard(
    ctx,
    'PlaceHierarchiesTransactions',
  );
  const state = new GraphState({
    CaptureTopology: true,
    CaptureEdgeRoutes: true,
  });
  state.UpdateWithWorkGuard(g, guard);
  let complete = false;
  try {
    place(ctx, g, root, random);
    const err = ctx.Err();
    if (err)
      throw new Error(`PlaceHierarchies: ${err.message}`, { cause: err });
    complete = true;
  } finally {
    if (!complete) RollbackGraphState(g, state);
  }
}
function place(
  ctx: Context,
  g: Graph,
  root: Node | null,
  random: Random | null,
): void {
  const hGraph = new Graph();
  CopyEntitiesFrom(hGraph, g);
  for (const child of g.Containers.get(root) ?? [])
    hGraph.AddNodeUnchecked(child);
  let abductions = AbductEdges(g, root, hGraph),
    restored = false,
    ownership = new NodeGraphOwnershipJournal();
  try {
    for (const child of g.Containers.get(root) ?? [])
      if (!child.Hierarchy && child.isContainer) place(ctx, g, child, random);
    const [subgraphs, journal] = SplitSubgraphsTracked(
      ctx,
      hGraph,
      { IncludeContainers: false, IncludeNears: true, TraverseTrees: false },
      null,
    );
    ownership = journal;
    for (const subgraph of subgraphs) {
      if (!subgraph.Nodes[0]!.Hierarchy) continue;
      subgraph.ComputeCellSize();
      for (const node of g.Nodes) node.Graph = subgraph;
      abductions = RestoreEdgeAbductions(subgraph, abductions);
      placeNodesInHierarchy(ctx, subgraph, random);
    }
    RestoreEdgeAbductions(g, abductions);
    restored = true;
  } finally {
    if (!restored) RestoreEdgeAbductions(g, abductions);
    ownership.Restore();
    for (const node of g.Nodes) node.Graph = g;
  }
}
