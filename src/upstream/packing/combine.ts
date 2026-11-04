// Translated internal/packing/combine.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import {
  WorkGuard,
  MaxEngineWorkUnits,
  MaxEngineNodes,
  MaxEngineEdges,
  MaxEngineRoutePoints,
} from '../limits/work.js';
import { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import {
  validateEngineGraph,
  validateCombineNodeTopology,
  sliceCapacity,
} from '../layoutgraph/topology-preflight.js';
import { captureEdge } from '../layoutgraph/transaction-snapshot.js';
import { CopyEntitiesFrom } from '../layoutgraph/subgraphs.js';
import { BoundingBox, graphBoundingBox } from '../layoutgraph/graph-bounds.js';
import {
  allDescendantNodesGuarded,
  moveNodeWithChildren,
  unboundedWork,
} from '../layoutgraph/containment.js';
import { doesOverlap } from '../layoutgraph/node-spatial.js';
import { ContainerPadding } from '../layoutgraph/geometry-policy.js';
import { Point } from '../geo/point.js';
import type { Box } from '../geo/box.js';
import { Slice } from '../gosort/slice.js';
import {
  snapshotCombineNodePositions,
  restoreCombineNodePositions,
} from './combine-snapshot.js';
export const subgraphPadding = 20,
  subgraphSquareDampener = 0.5;
export function graphArea(graph: Graph): number {
  if (graph.Nodes.length === 0) return 0;
  const [tl, br] = graphBoundingBox(graph, false);
  return Math.abs(tl!.X - br!.X) * Math.abs(tl!.Y - br!.Y);
}
export function CombineSubgraphs(
  ctx: Context,
  masterGraph: Graph,
  graphs: Graph[],
  ancestorObstacles: Box[],
): Graph {
  if (masterGraph === null)
    throw new Error('TALA CombineSubgraphs requires a master graph');
  validateEngineGraph(ctx, 'CombineSubgraphs', masterGraph);
  if (graphs.length > MaxEngineNodes)
    throw new Error(
      `TALA CombineSubgraphs subgraph count ${graphs.length} exceeds limit ${MaxEngineNodes}`,
    );
  const mapIDs = new WeakMap<object, number>();
  let nextID = 0;
  const identityOf = (graph: Graph) =>
    [
      graph.Containers,
      graph.Clusters,
      graph.Trees,
      graph.NodeToTree,
      graph.Hubs,
      graph.Sequences,
      graph.Directions,
      graph.CommonUncleSiblings,
    ]
      .map((map) => {
        if (!mapIDs.has(map)) mapIDs.set(map, ++nextID);
        return mapIDs.get(map)!;
      })
      .join(',');
  const validated = new Set([identityOf(masterGraph)]),
    allGraphs = [masterGraph];
  for (const graph of graphs) {
    if (graph === null)
      throw new Error('TALA CombineSubgraphs received a nil subgraph');
    const identity = identityOf(graph);
    if (!validated.has(identity)) {
      validateEngineGraph(ctx, 'CombineSubgraphs', graph);
      validated.add(identity);
    }
    allGraphs.push(graph);
  }
  validateCombineNodeTopology(ctx, allGraphs);
  const guard = new WorkGuard(ctx, 'CombineSubgraphs', MaxEngineWorkUnits),
    allNodes: Node[] = [],
    uniqueNodes = new Set<Node>(),
    edgeSnapshots = new Map<Edge, ReturnType<typeof captureEdge>>();
  let routePointCapacity = 0;
  const collectGraph = (graph: Graph) => {
    for (const node of graph.Nodes) {
      guard.Step();
      if (node === null)
        throw new Error('TALA CombineSubgraphs contains a nil node');
      if (!uniqueNodes.has(node)) {
        uniqueNodes.add(node);
        if (uniqueNodes.size > MaxEngineNodes)
          throw new Error(
            `TALA CombineSubgraphs unique node count exceeds limit ${MaxEngineNodes}`,
          );
        allNodes.push(node);
      }
    }
    for (const edge of graph.Edges) {
      guard.Step();
      if (edge === null)
        throw new Error('TALA CombineSubgraphs contains a nil edge');
      if (edge.From === null || edge.To === null)
        throw new Error(
          `TALA CombineSubgraphs edge ${edge.ID} has missing endpoints`,
        );
      if (!edgeSnapshots.has(edge)) {
        if (edgeSnapshots.size >= MaxEngineEdges)
          throw new Error(
            `TALA CombineSubgraphs unique edge count exceeds limit ${MaxEngineEdges}`,
          );
        const capacity = sliceCapacity(edge.Points);
        if (capacity > MaxEngineRoutePoints - routePointCapacity)
          throw new Error(
            `TALA CombineSubgraphs route point count exceeds limit ${MaxEngineRoutePoints}`,
          );
        routePointCapacity += capacity;
        for (const point of edge.Points) {
          guard.Step();
          if (point === null)
            throw new Error(
              `TALA CombineSubgraphs edge ${edge.ID} contains a nil route point`,
            );
        }
        edgeSnapshots.set(edge, captureEdge(edge));
      }
    }
  };
  collectGraph(masterGraph);
  for (const graph of graphs) collectGraph(graph);
  const nodeSnapshots = snapshotCombineNodePositions(ctx, allNodes),
    nodeGraphReferences = new Map(
      nodeSnapshots.map((s) => [s.node, s.node.Graph]),
    );
  let complete = false;
  try {
    const combined = new Graph();
    CopyEntitiesFrom(combined, masterGraph);
    if (graphs.length === 0) {
      complete = true;
      return combined;
    }
    const combinedBR = new Point(-Infinity, -Infinity),
      candidatePoints: Point[] = [];
    if (graphs[0]!.Nodes.some((n) => n.FixedTopLeft !== null)) {
      const firstGraph = graphs[0]!;
      graphs = graphs.slice(1);
      const [, graphBR] = BoundingBox(firstGraph);
      for (const n of firstGraph.Nodes) {
        guard.Step();
        combined.AddNodeUnchecked(n);
        for (const child of allDescendantNodesGuarded(
          masterGraph,
          n,
          true,
          unboundedWork,
        )) {
          guard.Step();
          combined.AddNodeUnchecked(child);
        }
      }
      for (const edge of firstGraph.Edges) {
        guard.Step();
        combined.AddEdge(edge);
      }
      combinedBR.X = Math.max(combinedBR.X, graphBR!.X);
      combinedBR.Y = Math.max(combinedBR.Y, graphBR!.Y);
      candidatePoints.push(
        new Point(graphBR!.X, 0),
        new Point(graphBR!.X, graphBR!.Y),
        new Point(0, graphBR!.Y),
        new Point(graphBR!.X + subgraphPadding, 0),
        new Point(graphBR!.X + subgraphPadding, graphBR!.Y),
        new Point(0, graphBR!.Y + subgraphPadding),
      );
    }
    const sortedByArea = graphs.slice();
    Slice(sortedByArea, (a, b) => graphArea(a) > graphArea(b));
    guard.Finish();
    for (const graph of sortedByArea) {
      guard.Step();
      const [graphTL, graphBR] = BoundingBox(graph);
      let minCost = Infinity,
        minOverlaps = 9223372036854775807,
        minCandidatePoint = new Point(0, 0),
        minCandidatePointIndex = 0;
      for (let i = 0; i < candidatePoints.length; i++) {
        guard.Step();
        const candidatePoint = candidatePoints[i]!,
          offsetX = candidatePoint.X - graphTL!.X,
          offsetY = candidatePoint.Y - graphTL!.Y;
        let collides = false,
          ancestorOverlaps = 0;
        for (const node of graph.Nodes) {
          guard.Step();
          moveNodeWithChildren(node, offsetX, offsetY);
          for (const other of combined.Nodes) {
            guard.Step();
            if (doesOverlap(node, other)) {
              collides = true;
              break;
            }
          }
          if (!collides)
            for (const obstacle of ancestorObstacles) {
              guard.Step();
              if (
                obstacle.TopLeft.X === -ContainerPadding &&
                obstacle.TopLeft.Y === -ContainerPadding
              )
                continue;
              if (node.Box.Overlaps(obstacle)) ancestorOverlaps++;
            }
          moveNodeWithChildren(node, -offsetX, -offsetY);
          if (collides) break;
        }
        if (collides || ancestorOverlaps > minOverlaps) continue;
        const newWidth = Math.max(
            combinedBR.X,
            candidatePoint.X + (graphBR!.X - graphTL!.X),
          ),
          newHeight = Math.max(
            combinedBR.Y,
            candidatePoint.Y + (graphBR!.Y - graphTL!.Y),
          ),
          cost =
            newWidth * newHeight +
            Math.pow(newWidth - newHeight, 2) * subgraphSquareDampener;
        if (
          ancestorOverlaps < minOverlaps ||
          (ancestorOverlaps === minOverlaps && cost < minCost)
        ) {
          minOverlaps = ancestorOverlaps;
          minCost = cost;
          minCandidatePoint = candidatePoint;
          minCandidatePointIndex = i;
        }
      }
      if (candidatePoints.length > 0) {
        candidatePoints[minCandidatePointIndex] =
          candidatePoints[candidatePoints.length - 1]!;
        candidatePoints.pop();
      }
      const offsetX = minCandidatePoint.X - graphTL!.X,
        offsetY = minCandidatePoint.Y - graphTL!.Y;
      for (const n of graph.Nodes) {
        guard.Step();
        moveNodeWithChildren(n, offsetX, offsetY);
        combined.AddNodeUnchecked(n);
        for (const child of allDescendantNodesGuarded(
          masterGraph,
          n,
          true,
          unboundedWork,
        )) {
          guard.Step();
          combined.AddNodeUnchecked(child);
        }
      }
      for (const edge of graph.Edges) {
        guard.Step();
        for (const point of edge.Points) {
          guard.Step();
          point.X += offsetX;
          point.Y += offsetY;
        }
        combined.AddEdge(edge);
      }
      graphTL!.X += offsetX;
      graphTL!.Y += offsetY;
      graphBR!.X += offsetX;
      graphBR!.Y += offsetY;
      combinedBR.X = Math.max(combinedBR.X, graphBR!.X);
      combinedBR.Y = Math.max(combinedBR.Y, graphBR!.Y);
      candidatePoints.push(
        new Point(graphBR!.X, graphTL!.Y),
        new Point(graphBR!.X, graphBR!.Y),
        new Point(graphTL!.X, graphBR!.Y),
        new Point(graphBR!.X + subgraphPadding, graphTL!.Y),
        new Point(graphBR!.X + subgraphPadding, graphBR!.Y),
        new Point(graphTL!.X, graphBR!.Y + subgraphPadding),
      );
    }
    guard.Finish();
    complete = true;
    return combined;
  } finally {
    if (!complete) {
      restoreCombineNodePositions(nodeSnapshots);
      for (const [node, graph] of nodeGraphReferences) node.Graph = graph;
      for (const [edge, snapshot] of edgeSnapshots) snapshot.restore(edge);
    }
  }
}
