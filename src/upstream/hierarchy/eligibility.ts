// Translated from internal/hierarchy/eligibility.go and discovery.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { isDescendantOf } from '../layoutgraph/edge-abduction.js';
export function isHierarchyStructuralEdge(edge: Edge): boolean {
  return !edge.IsLoop();
}
export function countHierarchyStructuralEdges(node: Node): number {
  let count = 0;
  for (const edge of node.Edges) if (isHierarchyStructuralEdge(edge)) count++;
  return count;
}
export function isSimpleCandidate(graph: Graph, node: Node): boolean {
  return !(
    node.isContainer ||
    graph.Trees.has(node) ||
    node.isClusterVessel ||
    graph.Sequences.has(node) ||
    node.Cluster
  );
}
export function shapeCanBeContainer(node: Node): boolean {
  return ['', 'Square', 'Package', 'StoredData', 'Queue', 'Step'].includes(
    node.Shape.GetType(),
  );
}
export function isEligibleContainer(graph: Graph, root: Node): boolean {
  for (const child of graph.Containers.get(root) ?? []) {
    if (
      child.FixedTopLeft ||
      graph.NodeToTree.has(child) ||
      graph.Trees.has(child) ||
      child.Sequence
    )
      return false;
    if (!child.isContainer && !isSimpleCandidate(graph, child)) return false;
    for (const edge of child.Edges) {
      if (!isHierarchyStructuralEdge(edge)) continue;
      if (isDescendantOf(child.Adjacent(edge), root)) return false;
    }
    if (child.isContainer && !isEligibleContainer(graph, child)) return false;
  }
  return true;
}
export function Candidates(graph: Graph): Set<Node> {
  const result = new Set<Node>();
  for (const node of graph.Nodes) {
    if (
      graph.NodeToTree.has(node) ||
      graph.Trees.has(node) ||
      node.Sequence ||
      node.FixedTopLeft
    )
      continue;
    if (isSimpleCandidate(graph, node)) {
      result.add(node);
      continue;
    }
    if (
      node.isContainer &&
      shapeCanBeContainer(node) &&
      !node.Shape.AspectRatio1() &&
      isEligibleContainer(graph, node)
    )
      result.add(node);
  }
  return result;
}
