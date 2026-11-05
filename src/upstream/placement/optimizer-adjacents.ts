// Translated internal/placement/optimization_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import type { EdgeAbduction } from '../layoutgraph/records.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { MaxEngineEdges, MaxEngineNodes } from '../limits/work.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import {
  optimizerIsDescendantOf,
  optimizerOrderedNears,
  optimizerTreeRoot,
  appendBoundedOptimizerNodes,
  appendOptimizerTreeNears,
} from './optimizer-ancestry.js';

export function optimizerAdjacents(
  node: Node | null,
  edgeAbductions: EdgeAbduction[] | null,
  guard: OptimizationWorkGuard,
): Node[] {
  if (node === null || node.Graph === null)
    throw new Error(
      `TALA ${guard.Location()} adjacency lookup requires a node with a graph`,
    );
  const graph = node.Graph,
    abs = edgeAbductions ?? [];
  if (node.Edges.length > MaxEngineEdges || abs.length > MaxEngineEdges)
    throw new Error(
      `TALA ${guard.Location()} adjacency inputs exceed edge limit ${MaxEngineEdges}`,
    );
  const result: Node[] = [],
    used = new Array<boolean>(abs.length).fill(false);
  for (const edge of node.Edges) {
    guard.Step();
    if (edge == null || (edge.From !== node && edge.To !== node))
      throw new Error(
        `TALA ${guard.Location()} found a malformed incident edge on ${nodeDebugID(node)}`,
      );
    const adjacent = node.Adjacent(edge);
    if (adjacent == null || adjacent.TopLeft === null) continue;
    let add = adjacent;
    for (let i = 0; i < abs.length; i++) {
      guard.Step();
      const ab = abs[i];
      if (ab == null)
        throw new Error(`TALA ${guard.Location()} found a nil edge abduction`);
      if (used[i]) continue;
      if (
        ab.CurrentFrom === node &&
        ab.CurrentTo === adjacent &&
        ab.OriginallyTo !== null
      ) {
        used[i] = true;
        add = ab.OriginallyTo;
        break;
      }
      if (
        ab.CurrentFrom === adjacent &&
        ab.CurrentTo === node &&
        ab.OriginallyFrom !== null
      ) {
        used[i] = true;
        add = ab.OriginallyFrom;
        break;
      }
    }
    result.push(add);
  }
  if (result.length !== 0) return result;
  const resolve = (initial: Node): Node => {
    let near = initial;
    if (near.Cluster !== null && near.Cluster.Vessel!.Graph !== null)
      near = near.Cluster.Vessel!;
    else if (near.Sequence !== null && near.Sequence.Vessel!.Graph !== null)
      near = near.Sequence.Vessel!;
    const tree = graph.NodeToTree.get(near);
    if (tree !== undefined) {
      const root = optimizerTreeRoot(tree, guard);
      if (root === null)
        throw new Error(
          `TALA ${guard.Location()} found a tree without a sentinel`,
        );
      near =
        root.SentinelEdge!.From === root.Node
          ? root.SentinelEdge!.To
          : root.SentinelEdge!.From;
      if (near == null)
        throw new Error(
          `TALA ${guard.Location()} found a tree without a sentinel`,
        );
    }
    return near;
  };
  for (const original of optimizerOrderedNears(node, guard)) {
    const near = resolve(original);
    if (near == null || near.TopLeft === null) continue;
    if (optimizerIsDescendantOf(near, node.Container, guard)) result.push(near);
  }
  if (result.length !== 0) return result;
  const nears: Node[] = [];
  if (node.isClusterVessel) {
    const cluster = graph.Clusters.get(node);
    if (cluster === undefined)
      throw new Error(
        `TALA ${guard.Location()} found a cluster vessel without a cluster`,
      );
    for (const child of cluster.Nodes) {
      guard.Step();
      appendBoundedOptimizerNodes(
        nears,
        optimizerOrderedNears(child, guard),
        guard,
      );
    }
  }
  const sequence = graph.Sequences.get(node);
  if (sequence !== undefined)
    for (const child of sequence.Nodes) {
      guard.Step();
      appendBoundedOptimizerNodes(
        nears,
        optimizerOrderedNears(child, guard),
        guard,
      );
    }
  const trees = graph.Trees.get(node) ?? [];
  if (trees.length > MaxEngineNodes)
    throw new Error(
      `TALA ${guard.Location()} tree roots exceed node limit ${MaxEngineNodes}`,
    );
  for (const tree of trees) appendOptimizerTreeNears(nears, tree, guard);
  for (const near of nears) {
    guard.Step();
    const add = resolve(near);
    if (add != null && add.TopLeft !== null) result.push(add);
  }
  return result;
}
