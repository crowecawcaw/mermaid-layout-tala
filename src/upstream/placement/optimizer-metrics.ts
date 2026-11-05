// Translated internal/placement/optimization_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import type { Point } from '../geo/point.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { MaxEngineNodes, MaxEngineEdges } from '../limits/work.js';
import { maxEngineTopologyReferences } from '../layoutgraph/topology-preflight.js';
import { deltaToGuarded } from '../layoutgraph/node-spacing.js';
import { median } from './metrics.js';
import { optimizerAdjacents } from './optimizer-adjacents.js';

export function optimizerMedian(
  nodes: Node[],
  includeSizes: boolean,
  guard: OptimizationWorkGuard,
): [number, number] {
  if (nodes.length === 0)
    throw new Error(
      `TALA ${guard.Location()} cannot compute a median without positioned neighbors`,
    );
  if (nodes.length > maxEngineTopologyReferences)
    throw new Error(
      `TALA ${guard.Location()} median inputs exceed limit ${maxEngineTopologyReferences}`,
    );
  for (const node of nodes) {
    guard.Step();
    if (node == null || node.TopLeft === null)
      throw new Error(
        `TALA ${guard.Location()} cannot compute a median with an unpositioned neighbor`,
      );
  }
  guard.AddSort(nodes.length);
  guard.AddSort(nodes.length);
  if (
    includeSizes &&
    (!(nodes[0]!.Graph!.CellSize > 0) ||
      !Number.isFinite(nodes[0]!.Graph!.CellSize))
  )
    throw new Error(
      `TALA ${guard.Location()} requires a finite positive cell size`,
    );
  return median(nodes, includeSizes);
}
export function optimizerMedianToNeighbors(
  node: Node,
  includeSizes: boolean,
  abductions: EdgeAbduction[] | null,
  guard: OptimizationWorkGuard,
): [number, number] {
  return optimizerMedian(
    optimizerAdjacents(node, abductions, guard),
    includeSizes,
    guard,
  );
}
export function optimizerDoesOverlap(
  node: Node | null,
  point: Point | null,
  exceptions: Node[],
  guard: OptimizationWorkGuard,
): boolean {
  if (node === null || node.Graph === null || point === null)
    throw new Error(
      `TALA ${guard.Location()} overlap check requires a node, graph, and point`,
    );
  if (
    node.Graph.Nodes.length > MaxEngineNodes ||
    exceptions.length > MaxEngineNodes
  )
    throw new Error(
      `TALA ${guard.Location()} overlap inputs exceed node limit ${MaxEngineNodes}`,
    );
  const right = point.X + node.Width,
    bottom = point.Y + node.Height;
  for (const other of node.Graph.Nodes) {
    guard.Step();
    if (other == null)
      throw new Error(`TALA ${guard.Location()} found a nil graph node`);
    if (other === node) continue;
    let excluded = false;
    for (const exception of exceptions) {
      guard.Step();
      if (exception === other) {
        excluded = true;
        break;
      }
    }
    if (excluded || other.TopLeft === null) continue;
    if (
      point.X > other.TopLeft.X + other.Width + 500 ||
      point.X + node.Width + 500 < other.TopLeft.X ||
      point.Y > other.TopLeft.Y + other.Height + 500 ||
      point.Y + node.Height + 500 < other.TopLeft.Y
    )
      continue;
    guard.Add(BigInt(node.Edges.length));
    const delta = deltaToGuarded(node, other, point, null);
    if (
      point.X < other.TopLeft.X + other.Width + delta &&
      right + delta > other.TopLeft.X &&
      point.Y < other.TopLeft.Y + other.Height + delta &&
      bottom + delta > other.TopLeft.Y
    )
      return true;
  }
  return false;
}
export function optimizerIsOccupied(
  graph: Graph | null,
  point: Point | null,
  guard: OptimizationWorkGuard,
): [Node | null, boolean] {
  if (graph === null || point === null)
    throw new Error(
      `TALA ${guard.Location()} occupancy check requires a graph and point`,
    );
  if (graph.Nodes.length > MaxEngineNodes)
    throw new Error(
      `TALA ${guard.Location()} occupancy node count exceeds limit ${MaxEngineNodes}`,
    );
  for (const node of graph.Nodes) {
    guard.Step();
    if (node == null)
      throw new Error(`TALA ${guard.Location()} found a nil graph node`);
    if (node.TopLeft !== null && node.TopLeft.Equals(point))
      return [node, true];
  }
  return [null, false];
}
export function optimizerCanMove(
  node: Node | null,
  point: Point | null,
  includeSizes: boolean,
  guard: OptimizationWorkGuard,
): boolean {
  if (node === null || node.Graph === null || point === null)
    throw new Error(
      `TALA ${guard.Location()} movement check requires a node, graph, and point`,
    );
  if (node.TopLeft!.Equals(point)) return true;
  const [, occupied] = optimizerIsOccupied(node.Graph, point, guard);
  if (occupied || !includeSizes) return !occupied;
  return !optimizerDoesOverlap(node, point, [], guard);
}
export function chargeOptimizerScoring(
  node: Node | null,
  abductions: EdgeAbduction[] | null,
  includeSymmetry: boolean,
  guard: OptimizationWorkGuard,
): void {
  if (node === null || node.Graph === null)
    throw new Error(
      `TALA ${guard.Location()} scoring requires a node with a graph`,
    );
  const edges = BigInt(node.Edges.length + 1);
  let search = BigInt(node.Graph.Nodes.length + (abductions?.length ?? 0) + 1);
  if (includeSymmetry) search += edges;
  guard.AddProduct(edges, search);
}

export function chargeOptimizerTranspose(
  graph: Graph | null,
  node: Node | null,
  abductions: EdgeAbduction[] | null,
  guard: OptimizationWorkGuard,
): void {
  if (graph === null || node === null || node.Graph === null)
    throw new Error(
      `TALA ${guard.Location()} transpose requires a node with a graph`,
    );
  if (
    graph.Nodes.length > MaxEngineNodes ||
    graph.Edges.length > MaxEngineEdges ||
    (abductions?.length ?? 0) > MaxEngineEdges
  )
    throw new Error(
      `TALA ${guard.Location()} transpose inputs exceed engine limits`,
    );
  for (const ab of abductions ?? []) {
    guard.Step();
    if (ab == null)
      throw new Error(`TALA ${guard.Location()} found a nil edge abduction`);
  }
  if (
    node.Hierarchy !== null ||
    node.FixedTopLeft !== null ||
    node.Edges.length < 1 ||
    node.Edges.length > 2 ||
    graph.NodeToTree.has(node) ||
    graph.Trees.has(node)
  ) {
    guard.Step();
    return;
  }
  const nodes = BigInt(graph.Nodes.length + 1),
    edges = BigInt(graph.Edges.length + 1),
    abs = BigInt((abductions?.length ?? 0) + 1);
  for (let i = 0; i < 6; i++) guard.Add(nodes + edges + abs);
  for (let i = 0; i < 5; i++) {
    if (abductions === null) {
      guard.AddProduct(nodes, edges);
      guard.AddProduct(edges, edges);
    } else guard.AddProduct(BigInt(node.Edges.length + 1), nodes + abs);
  }
  for (let i = 0; i < 4; i++) guard.AddProduct(nodes, nodes);
}
