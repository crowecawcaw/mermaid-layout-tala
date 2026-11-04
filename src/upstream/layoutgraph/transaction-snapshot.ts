// Translated from internal/layoutgraph/transaction_snapshot.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Node } from './node.js';
import type { Edge } from './edge.js';
import type { Graph } from './graph.js';
import type {
  Cluster,
  Sequence,
  Tree,
  HerdAssignment,
  Hierarchy,
} from './records.js';
import { sliceCapacity, setSliceCapacity } from './topology-preflight.js';
export function snapshotPointer<T extends object>(pointer: T | null) {
  const value = pointer === null ? null : { ...pointer };
  return {
    pointer,
    value,
    restore(): T | null {
      if (pointer !== null) Object.assign(pointer, value);
      return pointer;
    },
  };
}
export function captureExactSlice<T>(original: T[]) {
  const backing = original.slice(),
    capacity = sliceCapacity(original);
  return {
    original,
    backing,
    restore(): T[] {
      original.length = backing.length;
      for (let i = 0; i < backing.length; i++) original[i] = backing[i]!;
      setSliceCapacity(original, capacity);
      return original;
    },
  };
}
export function captureExactSliceMap<K, V>(original: Map<K, V[]>) {
  const values = new Map(
    [...original].map(([key, items]) => [key, captureExactSlice(items)]),
  );
  return {
    original,
    values,
    restore(): Map<K, V[]> {
      original.clear();
      for (const [key, items] of values) original.set(key, items.restore());
      return original;
    },
  };
}
export function restoreMap<K, V>(
  original: Map<K, V>,
  snapshot: Map<K, V>,
): Map<K, V> {
  original.clear();
  for (const [key, value] of snapshot) original.set(key, value);
  return original;
}
export function restoreSet<T>(original: Set<T>, snapshot: Set<T>): Set<T> {
  original.clear();
  for (const value of snapshot) original.add(value);
  return original;
}
export function captureNode(node: Node) {
  // Box and spacing are embedded Go values; preserve the address used by Shape.
  const value = {
      ...node,
      margin: { ...node.margin },
      padding: { ...node.padding },
    },
    box = { ...node.Box };
  const topLeft = snapshotPointer(node.TopLeft),
    fixedTopLeft = snapshotPointer(node.FixedTopLeft),
    label = snapshotPointer(node.Label),
    icon = snapshotPointer(node.Icon);
  const edges = captureExactSlice(node.Edges),
    nears = new Set(node.Nears),
    loopOffsets = new Map(node.LoopOffsets);
  const longDistanceNeighborRequirements = new Map(
    [...node.LongDistanceNeighborRequirements].map(([n, r]) => [n, { ...r }]),
  );
  return {
    restore(target: Node): void {
      topLeft.restore();
      fixedTopLeft.restore();
      label.restore();
      icon.restore();
      Object.assign(target, value);
      Object.assign(target.Box, box);
      target.margin = { ...value.margin };
      target.padding = { ...value.padding };
      target.Edges = edges.restore();
      target.Nears = restoreSet(value.Nears, nears);
      target.LoopOffsets = restoreMap(value.LoopOffsets, loopOffsets);
      target.LongDistanceNeighborRequirements = restoreMap(
        value.LongDistanceNeighborRequirements,
        new Map(
          [...longDistanceNeighborRequirements].map(([n, r]) => [n, { ...r }]),
        ),
      );
    },
  };
}
export function captureEdge(edge: Edge) {
  const value = { ...edge, Style: { ...edge.Style } },
    points = captureExactSlice(edge.Points),
    pointValues = edge.Points.map((p) => snapshotPointer(p));
  const label = snapshotPointer(edge.Label),
    sourceArrowheadLabel = snapshotPointer(edge.SourceArrowheadLabel),
    targetArrowheadLabel = snapshotPointer(edge.TargetArrowheadLabel);
  return {
    restore(target: Edge): void {
      label.restore();
      sourceArrowheadLabel.restore();
      targetArrowheadLabel.restore();
      for (const point of pointValues) point.restore();
      const originalPoints = points.restore();
      Object.assign(target, value);
      target.Style = Object.assign(
        Object.create(Object.getPrototypeOf(edge.Style)),
        value.Style,
      );
      target.Points = originalPoints;
    },
  };
}
export function captureGraph(graph: Graph) {
  const isRootHierarchy = graph.IsRootHierarchy,
    nodes = captureExactSlice(graph.Nodes),
    edges = captureExactSlice(graph.Edges),
    cellSize = graph.CellSize;
  const containers = captureExactSliceMap(graph.Containers),
    trees = captureExactSliceMap(graph.Trees),
    hubs = captureExactSliceMap(graph.Hubs),
    commonSiblings = captureExactSliceMap(graph.CommonUncleSiblings);
  const clustersRef = graph.Clusters,
    clusters = new Map(graph.Clusters),
    nodeToTreeRef = graph.NodeToTree,
    nodeToTree = new Map(graph.NodeToTree),
    sequencesRef = graph.Sequences,
    sequences = new Map(graph.Sequences),
    directionsRef = graph.Directions,
    directions = new Map(graph.Directions);
  return {
    restore(target: Graph): void {
      target.IsRootHierarchy = isRootHierarchy;
      target.Nodes = nodes.restore();
      target.Edges = edges.restore();
      target.CellSize = cellSize;
      target.Containers = containers.restore();
      target.Clusters = restoreMap(clustersRef, clusters);
      target.Trees = trees.restore();
      target.NodeToTree = restoreMap(nodeToTreeRef, nodeToTree);
      target.Hubs = hubs.restore();
      target.Sequences = restoreMap(sequencesRef, sequences);
      target.Directions = restoreMap(directionsRef, directions);
      target.CommonUncleSiblings = commonSiblings.restore();
    },
  };
}
export function captureGroup<T extends Cluster | Sequence>(group: T) {
  const value = { ...group },
    nodes = captureExactSlice(group.Nodes),
    edgeAbductions = captureExactSlice(group.EdgeAbductions);
  return {
    restore(target: T): void {
      Object.assign(target, value);
      target.Nodes = nodes.restore();
      target.EdgeAbductions = edgeAbductions.restore();
    },
  };
}
export function captureTree(tree: Tree) {
  const value = { ...tree },
    children = captureExactSlice(tree.Children);
  return {
    restore(target: Tree): void {
      Object.assign(target, value);
      target.Children = children.restore();
    },
  };
}
export function captureHerd(herd: HerdAssignment) {
  const value = { ...herd },
    opposite = new Set(herd.oppositeSidePaired),
    same = new Set(herd.sameSidePaired);
  return {
    restore(target: HerdAssignment): void {
      Object.assign(target, value);
      target.oppositeSidePaired = restoreSet(
        value.oppositeSidePaired,
        opposite,
      );
      target.sameSidePaired = restoreSet(value.sameSidePaired, same);
    },
  };
}
export function captureHierarchy(hierarchy: Hierarchy) {
  const value = { ...hierarchy },
    levelRef = hierarchy.Levels(),
    level = new Map(levelRef);
  return {
    restore(target: Hierarchy): void {
      Object.assign(target, value);
      target.ReplaceLevels(restoreMap(levelRef, level));
    },
  };
}
