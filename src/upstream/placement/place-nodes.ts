// Translated internal/placement/node_placement.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { GoRandom } from '../../random.js';
import { ContainerPadding } from '../layoutgraph/geometry-policy.js';
import {
  allDescendantNodesGuarded,
  unboundedWork,
} from '../layoutgraph/containment.js';
import {
  CopyEntitiesFrom,
  SplitSubgraphsTracked,
} from '../layoutgraph/subgraphs.js';
import {
  AbductEdges,
  RestoreEdgeAbductions,
  ApplyEdgeAbductions,
} from '../layoutgraph/edge-abduction.js';
import {
  containerPadding,
  fitNodeToGraph,
} from '../layoutgraph/node-geometry.js';
import {
  clusterResizeWithWork,
  unmeteredGroupGeometry,
} from '../layoutgraph/group-geometry.js';
import { AssignNears } from '../proximity/nears.js';
import { AssignHerds } from '../proximity/herding.js';
import { Place as PlaceTrees } from '../trees/placement.js';
import { Descendants } from '../trees/traversal.js';
import { CombineSubgraphs } from '../packing/combine.js';
import { UpdateOffsets } from '../loops/loops.js';
import { PlaceChildrenOrder, validatePlacedNodes } from './child-order.js';
import { direct } from './direct.js';
import { syncNestedGeometry, placeNodesOrthogonally } from './orthogonal.js';
import { optimizeClusterFlip } from './cluster-flip.js';
import { orientSourceInterior } from './container-orientation.js';
function setGraphReference(nodes: Node[], graph: Graph): void {
  for (const node of nodes) {
    node.Graph = graph;
    for (const child of allDescendantNodesGuarded(
      graph,
      node,
      true,
      unboundedWork,
    ))
      child.Graph = graph;
  }
}
export function placeNodes(
  ctx: Context,
  graph: Graph,
  root: Node | null,
  seed: bigint,
  previousAbductions: EdgeAbduction[] | null,
  ancestorObstacles: Box[],
): void {
  if (graph.Nodes.length === 0) return;
  if (graph.Nodes.length === 1) {
    const node = graph.Nodes[0]!;
    node.TopLeft =
      node.FixedTopLeft !== null ? node.FixedTopLeft.Copy() : new Point(0, 0);
    syncNestedGeometry(graph);
    PlaceTrees(ctx, graph, root);
    direct(ctx, graph, graph.Nodes, root, { checkEdgeLength: false });
    return;
  }
  const childrenGraph = new Graph();
  CopyEntitiesFrom(childrenGraph, graph);
  for (const child of graph.Containers.get(root) ?? [])
    childrenGraph.AddNodeUnchecked(child);
  if (childrenGraph.Nodes.length === 0) return;
  const fixedObstacles: Box[] = [];
  for (const node of graph.Containers.get(root) ?? [])
    if (node.FixedTopLeft !== null)
      fixedObstacles.push(
        new Box(node.FixedTopLeft.Copy(), node.Width, node.Height),
      );
  let dx = 0,
    dy = 0;
  if (
    root !== null &&
    root.FixedTopLeft !== null &&
    ancestorObstacles.length > 1
  ) {
    dx = -root.FixedTopLeft.X - ContainerPadding;
    dy = -root.FixedTopLeft.Y - ContainerPadding;
    if (dx !== 0 || dy !== 0)
      for (const box of ancestorObstacles) {
        box.TopLeft.X += dx;
        box.TopLeft.Y += dy;
      }
  }
  try {
    const abductions = AbductEdges(graph, root, childrenGraph);
    let restored = false;
    try {
      const order = PlaceChildrenOrder(
        ctx,
        graph.Containers.get(root) ?? [],
        abductions,
      );
      for (const child of order) {
        if (child.Hierarchy !== null) continue;
        if (child.isContainer) {
          placeNodes(ctx, graph, child, seed, abductions, fixedObstacles);
          UpdateOffsets(child);
          childrenGraph.Containers = graph.Containers;
        }
        if (child.isClusterVessel)
          for (const n of graph.Clusters.get(child)!.Nodes)
            if (n.isContainer) {
              placeNodes(ctx, graph, n, seed, abductions, fixedObstacles);
              childrenGraph.Containers = graph.Containers;
            }
      }
      AssignNears(ctx, childrenGraph, root, previousAbductions ?? []);
      AssignHerds(ctx, childrenGraph, root, previousAbductions ?? []);
      const [subgraphs, ownership] = SplitSubgraphsTracked(
        ctx,
        childrenGraph,
        { IncludeContainers: false, IncludeNears: true, TraverseTrees: true },
        null,
      );
      let splitCommitted = false;
      try {
        for (const subgraph of subgraphs) {
          subgraph.ComputeCellSize();
          setGraphReference(subgraph.Nodes, subgraph);
          if (subgraph.Nodes[0]!.Hierarchy === null) {
            const random = new GoRandom(seed);
            placeNodesOrthogonally(
              ctx,
              root,
              subgraph,
              abductions,
              random,
              ancestorObstacles,
              seed,
            );
            for (const n of subgraph.Nodes)
              if (n.isClusterVessel)
                optimizeClusterFlip(ctx, subgraph.Clusters.get(n)!);
          }
          PlaceTrees(ctx, subgraph, root);
          for (const n of [...subgraph.Nodes])
            for (const treeRoot of graph.Trees.get(n) ?? [])
              for (const tree of [...Descendants(treeRoot), treeRoot]) {
                graph.AddNodeUnchecked(tree.Node);
                graph.AddEdge(tree.SentinelEdge!);
              }
          const children = subgraph.Containers.get(root) ?? [];
          graph.Containers.set(root, children);
          for (const other of subgraphs) other.Containers.set(root, children);
          RestoreEdgeAbductions(subgraph, abductions);
          try {
            direct(ctx, subgraph, subgraph.Nodes, root, {
              checkEdgeLength: false,
            });
          } finally {
            ApplyEdgeAbductions(abductions);
          }
          validatePlacedNodes(root, subgraph.Nodes);
        }
        const combined = CombineSubgraphs(
          ctx,
          graph,
          subgraphs,
          ancestorObstacles,
        );
        orientSourceInterior(ctx, combined, root, ancestorObstacles);
        if (root !== null) {
          fitNodeToGraph(root, combined, containerPadding(graph, root, false));
          for (const cluster of graph.Clusters.values())
            if (cluster.Nodes.includes(root))
              clusterResizeWithWork(
                cluster,
                cluster.Vessel!,
                unmeteredGroupGeometry,
              );
        }
        RestoreEdgeAbductions(graph, abductions);
        setGraphReference(graph.Nodes, graph);
        restored = true;
        splitCommitted = true;
      } finally {
        if (!splitCommitted) ownership.Restore();
      }
    } finally {
      if (!restored) {
        RestoreEdgeAbductions(graph, abductions);
        setGraphReference(graph.Nodes, graph);
      }
    }
  } finally {
    if (dx !== 0 || dy !== 0)
      for (const box of ancestorObstacles) {
        box.TopLeft.X -= dx;
        box.TopLeft.Y -= dy;
      }
  }
}
