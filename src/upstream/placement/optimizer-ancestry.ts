// Translated internal/placement/optimization_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { MaxEngineNodes } from '../limits/work.js';
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Tree } from '../layoutgraph/records.js';
import type { Point } from '../geo/point.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import { fixedOrigin } from '../layoutgraph/containment.js';
import { maxEngineTopologyReferences } from '../layoutgraph/topology-preflight.js';

export function optimizerIsDescendantOf(
  descendant: Node | null,
  ancestor: Node | null,
  guard: OptimizationWorkGuard,
): boolean {
  const seen = new Set<Node>();
  let current = descendant;
  for (;;) {
    guard.Step();
    if (current === ancestor) return true;
    if (current === null) return ancestor === null;
    if (seen.has(current))
      throw new Error(
        `TALA ${guard.Location()} found a cycle in node ancestry at ${nodeDebugID(current)}`,
      );
    if (seen.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${guard.Location()} ancestry exceeds node limit ${MaxEngineNodes}`,
      );
    seen.add(current);
    if (current.Container !== null) current = current.Container;
    else if (current.Cluster !== null) current = current.Cluster.Vessel;
    else if (current.Sequence !== null) current = current.Sequence.Vessel;
    else current = null;
  }
}
export function optimizerTreeRoot(
  tree: Tree | null,
  guard: OptimizationWorkGuard,
): Tree | null {
  const seen = new Set<Tree>();
  while (tree !== null && tree.Parent !== null) {
    guard.Step();
    if (seen.has(tree))
      throw new Error(
        `TALA ${guard.Location()} found a cycle in tree ancestry`,
      );
    if (seen.size >= MaxEngineNodes)
      throw new Error(
        `TALA ${guard.Location()} tree ancestry exceeds node limit ${MaxEngineNodes}`,
      );
    seen.add(tree);
    tree = tree.Parent;
  }
  return tree;
}
export function optimizerFixedOrigin(
  graph: Graph | null,
  container: Node | null,
  guard: OptimizationWorkGuard,
): Point | null {
  if (graph === null)
    throw new Error(
      `TALA ${guard.Location()} fixed-origin lookup requires a graph`,
    );
  if (graph.Nodes.length > MaxEngineNodes)
    throw new Error(
      `TALA ${guard.Location()} fixed-origin node count exceeds limit ${MaxEngineNodes}`,
    );
  for (const node of graph.Nodes) {
    guard.Step();
    if (node == null || node.container() !== container) continue;
    const origin = fixedOrigin(node);
    if (origin !== null) return origin;
  }
  return null;
}
export function optimizerOrderedNears(
  node: Node | null,
  guard: OptimizationWorkGuard,
): Node[] {
  if (node === null)
    throw new Error(
      `TALA ${guard.Location()} cannot order nears for a nil node`,
    );
  if (node.Nears.size > MaxEngineNodes)
    throw new Error(
      `TALA ${guard.Location()} near count exceeds limit ${MaxEngineNodes}`,
    );
  const nears: Node[] = [];
  for (const near of node.Nears) {
    guard.Step();
    if (near == null)
      throw new Error(
        `TALA ${guard.Location()} found a nil near on ${nodeDebugID(node)}`,
      );
    nears.push(near);
  }
  guard.AddSort(nears.length);
  nears.sort((a, b) => (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));
  return nears;
}
export function appendBoundedOptimizerNodes(
  dst: Node[],
  src: Node[],
  guard: OptimizationWorkGuard,
): Node[] {
  if (dst.length > maxEngineTopologyReferences - src.length)
    throw new Error(
      `TALA ${guard.Location()} optimizer node references exceed limit ${maxEngineTopologyReferences}`,
    );
  dst.push(...src);
  return dst;
}
export function appendOptimizerTreeNears(
  nears: Node[],
  tree: Tree | null,
  guard: OptimizationWorkGuard,
): Node[] {
  if (tree === null) return nears;
  const stack = [tree],
    seen = new Set<Tree>([tree]);
  while (stack.length > 0) {
    guard.Step();
    const current = stack.pop()!;
    if (current == null)
      throw new Error(`TALA ${guard.Location()} found a nil tree node`);
    if (current.Node == null)
      throw new Error(
        `TALA ${guard.Location()} found a tree entry without a node`,
      );
    appendBoundedOptimizerNodes(
      nears,
      optimizerOrderedNears(current.Node, guard),
      guard,
    );
    if (current.Children.length > MaxEngineNodes)
      throw new Error(
        `TALA ${guard.Location()} tree child references exceed limit ${MaxEngineNodes}`,
      );
    for (let i = current.Children.length - 1; i >= 0; i--) {
      guard.Step();
      const child = current.Children[i]!;
      if (child == null)
        throw new Error(`TALA ${guard.Location()} found a nil tree child`);
      if (seen.has(child))
        throw new Error(
          `TALA ${guard.Location()} found a cycle or shared child in a tree`,
        );
      if (seen.size >= MaxEngineNodes)
        throw new Error(
          `TALA ${guard.Location()} tree exceeds node limit ${MaxEngineNodes}`,
        );
      seen.add(child);
      stack.push(child);
    }
  }
  return nears;
}
