// Translated from internal/hierarchy/{discovery,orientation}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Hierarchy, EdgeAbduction } from '../layoutgraph/records.js';
import {
  allDescendantNodesGuarded,
  unboundedWork,
} from '../layoutgraph/containment.js';
import { IsHorizontal as isHorizontalOrientation } from '../geo/orientation.js';
import { MaxGraphSize } from '../limits/work.js';
import { MinPortClearance } from '../layoutgraph/geometry-policy.js';
import {
  isHierarchyStructuralEdge,
  countHierarchyStructuralEdges,
} from './eligibility.js';
export function IsHorizontal(nodes: Node[]): boolean {
  if (!nodes.length) return false;
  if (
    isHorizontalOrientation(nodes[0]!.Graph!.Direction(nodes[0]!.container()))
  )
    return true;
  return nodes.some((n) => n && n.IsTable());
}
export function countEdgeDirection(h: Hierarchy, g: Graph): [number, number] {
  let forward = 0,
    structural = 0;
  for (const edge of g.Edges) {
    if (!isHierarchyStructuralEdge(edge)) continue;
    structural++;
    if (!edge.IsDirected()) continue;
    const [from, to] = edge.DirectedEndpoints();
    if ((h.Levels().get(to!) ?? 0) > (h.Levels().get(from!) ?? 0)) forward++;
  }
  return [forward, structural - forward];
}
export function minimumWorkflowExtentFits(h: Hierarchy, g: Graph): boolean {
  const horizontal = IsHorizontal(g.Nodes),
    size = new Array<number>(h.LevelCount).fill(0);
  for (const [node, level] of h.Levels())
    size[level] = Math.max(size[level]!, horizontal ? node.Width : node.Height);
  let extent = (h.LevelCount - 1) * (50 + 2 * MinPortClearance);
  for (const n of size) extent += Math.ceil(n);
  return extent <= MaxGraphSize;
}
export function is1N1(h: Hierarchy, abductions: EdgeAbduction[]): boolean {
  if (h.LevelCount !== 3) return false;
  const levels = new Map<number, Node[]>();
  for (const [node, level] of h.Levels()) {
    const list = levels.get(level) ?? [];
    list.push(node);
    levels.set(level, list);
  }
  const source = levels.get(0) ?? [],
    sink = levels.get(2) ?? [];
  if (source.length !== 1 || sink.length !== 1) return false;
  let sourceAbduction: EdgeAbduction | null = null,
    sinkAbduction: EdgeAbduction | null = null;
  for (const ea of abductions) {
    if (!isHierarchyStructuralEdge(ea.Edge)) continue;
    if (ea.CurrentFrom === source[0]) {
      if (sourceAbduction) {
        if (ea.OriginallyFrom !== sourceAbduction.OriginallyFrom) return false;
      } else sourceAbduction = ea;
    }
    if (ea.CurrentTo === source[0]) {
      if (sourceAbduction) {
        if (ea.OriginallyTo !== sourceAbduction.OriginallyTo) return false;
      } else sourceAbduction = ea;
    }
    if (ea.CurrentFrom === sink[0]) {
      if (sinkAbduction) {
        if (ea.OriginallyFrom !== sinkAbduction.OriginallyFrom) return false;
      } else sinkAbduction = ea;
    }
    if (ea.CurrentTo === sink[0]) {
      if (sinkAbduction) {
        if (ea.OriginallyTo !== sinkAbduction.OriginallyTo) return false;
      } else sinkAbduction = ea;
    }
  }
  for (const node of levels.get(1) ?? []) {
    let above = false,
      below = false;
    for (const edge of node.Edges) {
      if (!isHierarchyStructuralEdge(edge)) continue;
      const level = h.Levels().get(node.Adjacent(edge)) ?? 0;
      if (level === 0) above = true;
      else if (level === 2) below = true;
      else return false;
      if (above && below) break;
    }
    if (!above || !below) return false;
  }
  for (const edge of source[0]!.Edges) {
    if (!isHierarchyStructuralEdge(edge)) continue;
    if ((h.Levels().get(source[0]!.Adjacent(edge)) ?? 0) !== 1) return false;
  }
  return true;
}
export function isValid(
  h: Hierarchy,
  g: Graph,
  abductions: EdgeAbduction[],
  sourceCount: number,
  sinkCount: number,
): boolean {
  if (h.LevelCount < 3) return false;
  const unique = new Set<Node>();
  for (const node of h.Levels().keys()) {
    unique.add(node);
    for (const child of allDescendantNodesGuarded(
      g,
      node,
      false,
      unboundedWork,
    ))
      unique.add(child);
  }
  const aspect = unique.size / (h.LevelCount * h.LevelCount),
    tooTall = aspect < 0.5,
    tooWide = aspect > 2,
    [forward, back] = countEdgeDirection(h, g),
    directional = forward >= 1.5 * back;
  let branched =
    g.Nodes.length > h.LevelCount &&
    sourceCount === 1 &&
    sinkCount === 1 &&
    back === 0 &&
    unique.size <= 128 &&
    forward + back <= 256;
  if (tooTall && branched && !minimumWorkflowExtentFits(h, g)) branched = false;
  const abducted = new Map<Node | null, number>();
  for (const ea of abductions) {
    if (!isHierarchyStructuralEdge(ea.Edge)) continue;
    if (ea.OriginallyFrom)
      abducted.set(ea.CurrentFrom, (abducted.get(ea.CurrentFrom) ?? 0) + 1);
    if (ea.OriginallyTo)
      abducted.set(ea.CurrentTo, (abducted.get(ea.CurrentTo) ?? 0) + 1);
  }
  const maxEdges = 2 * Math.ceil(Math.sqrt(unique.size));
  let dense = false;
  for (const node of unique)
    if (
      countHierarchyStructuralEdges(node) - (abducted.get(node) ?? 0) >
      maxEdges
    ) {
      dense = true;
      break;
    }
  return (
    !tooWide &&
    (!tooTall || branched) &&
    directional &&
    !dense &&
    !is1N1(h, abductions)
  );
}
