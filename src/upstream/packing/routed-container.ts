// Translated from internal/packing/routed_container.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import type { WorkGuard } from '../limits/work.js';
import { allDescendantNodesGuarded } from '../layoutgraph/containment.js';
import { CanContain } from '../layoutgraph/node-geometry.js';
import { modifierElementAdjustments } from '../layoutgraph/node-spatial.js';
import { binPackIsDescendantOf } from './guard.js';
import {
  routedContainerBoxIsFinite,
  routedContainerBoxCovers,
  routedContainerEndpointKeepsSides,
  routedContainerPointIsFinite,
  routedContainerControlHullIsPreserved,
  routedContainerSegmentStaysInsideShrink,
} from './routed-container-geometry.js';
export enum RoutedContainerBoxDecision {
  DeferToSideConstraints,
  KeepOriginalBox,
  UseProposedBox,
}
function parseGoFloat(text: string): number {
  const decimal =
    /^[+-]?(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/;
  const hex =
    /^([+-]?)0[xX](_?[0-9a-fA-F](?:_?[0-9a-fA-F])*(?:\.(?:[0-9a-fA-F](?:_?[0-9a-fA-F])*)?)?|\.[0-9a-fA-F](?:_?[0-9a-fA-F])*)[pP]([+-]?[0-9](?:_?[0-9])*)$/;
  if (decimal.test(text)) return Number(text.replaceAll('_', ''));
  const match = hex.exec(text);
  if (!match) return NaN;
  const [whole, fraction = ''] = match[2]!.replaceAll('_', '').split('.');
  let mantissa = 0;
  for (const digit of whole! + fraction)
    mantissa = mantissa * 16 + parseInt(digit, 16);
  return (
    (match[1] === '-' ? -1 : 1) *
    mantissa *
    2 ** (Number(match[3]!.replaceAll('_', '')) - 4 * fraction.length)
  );
}
export function routedContainerRoundedCornersStayInsideShrink(
  edge: Edge,
  original: Box,
  proposed: Box,
  guard: WorkGuard,
): boolean {
  let radius = 10;
  const scalar = edge.Style.BorderRadius;
  if (scalar) {
    const text = scalar.Value;
    if (new TextEncoder().encode(text).length > 64) return false;
    radius = parseGoFloat(text);
  }
  if (!Number.isFinite(radius) || radius < 0) return false;
  for (let i = 1; i < edge.Points.length - 1; i++) {
    guard.Step();
    const previous = edge.Points[i - 1]!,
      corner = edge.Points[i]!,
      next = edge.Points[i + 1]!;
    const ix = corner.X - previous.X,
      iy = corner.Y - previous.Y,
      ox = next.X - corner.X,
      oy = next.Y - corner.Y,
      il = Math.hypot(ix, iy),
      ol = Math.hypot(ox, oy);
    if (!Number.isFinite(il) || il <= 0 || !Number.isFinite(ol) || ol <= 0)
      return false;
    if (radius === 0) continue;
    if (il < radius || ol / 2 < radius) return false;
    const entry = new Point(
        corner.X - (ix / il) * radius,
        corner.Y - (iy / il) * radius,
      ),
      exit = new Point(
        corner.X + (ox / ol) * radius,
        corner.Y + (oy / ol) * radius,
      );
    if (
      !routedContainerPointIsFinite(entry) ||
      !routedContainerPointIsFinite(exit) ||
      !routedContainerControlHullIsPreserved(
        original,
        proposed,
        entry,
        corner,
        exit,
      )
    )
      return false;
  }
  return true;
}
export function routedContainerRoutesStayInsideShrink(
  edges: Edge[],
  original: Box,
  proposed: Box,
  guard: WorkGuard,
): boolean {
  for (const edge of edges) {
    guard.Step();
    if (
      !edge ||
      !edge.From ||
      !edge.To ||
      edge.Points.length < 2 ||
      edge.IsCurve
    )
      return false;
    for (const point of edge.Points) {
      guard.Step();
      if (!routedContainerPointIsFinite(point)) return false;
    }
    if (
      !routedContainerRoundedCornersStayInsideShrink(
        edge,
        original,
        proposed,
        guard,
      )
    )
      return false;
    for (let i = 0; i < edge.Points.length - 1; i++) {
      guard.Step();
      if (
        !routedContainerSegmentStaysInsideShrink(
          original,
          proposed,
          edge.Points[i]!,
          edge.Points[i + 1]!,
          guard,
        )
      )
        return false;
    }
  }
  guard.Finish();
  return true;
}
export function binPackCanUseRoutedContainerBox(
  graph: Graph,
  root: Node,
  original: Box,
  graphIncidentEdges: Edge[],
  guard: WorkGuard,
): RoutedContainerBoxDecision {
  const D = RoutedContainerBoxDecision;
  guard.Step();
  if (!graph || !root || root.Graph !== graph) return D.KeepOriginalBox;
  if (!graphIncidentEdges.length) {
    guard.Finish();
    return D.DeferToSideConstraints;
  }
  if (!root.TopLeft || !root.Shape || !original || !original.TopLeft)
    return D.KeepOriginalBox;
  const descendants = allDescendantNodesGuarded(graph, root, true, guard),
    descendantSet = new Set<Node>();
  for (const node of descendants) {
    guard.Step();
    if (!node) return D.KeepOriginalBox;
    descendantSet.add(node);
  }
  const affected: Edge[] = [],
    affectedSet = new Set<Edge>();
  for (const edge of graph.Edges) {
    guard.Step();
    if (!edge || !edge.From || !edge.To) return D.KeepOriginalBox;
    if (
      edge.From !== root &&
      edge.To !== root &&
      !descendantSet.has(edge.From) &&
      !descendantSet.has(edge.To)
    )
      continue;
    if (affectedSet.has(edge)) return D.KeepOriginalBox;
    affectedSet.add(edge);
    affected.push(edge);
  }
  const graphEdges = new Set<Edge>();
  for (const edge of graphIncidentEdges) {
    guard.Step();
    if (
      !edge ||
      (edge.From !== root && edge.To !== root) ||
      graphEdges.has(edge) ||
      !affectedSet.has(edge)
    )
      return D.KeepOriginalBox;
    graphEdges.add(edge);
  }
  if (!root.isContainer || !CanContain(root) || !root.Shape.IsRectangular())
    return D.KeepOriginalBox;
  const [dx, dy] = modifierElementAdjustments(root);
  if (dx !== 0 || dy !== 0) return D.KeepOriginalBox;
  if (
    !routedContainerBoxIsFinite(root.Box) ||
    !routedContainerBoxIsFinite(original) ||
    !routedContainerBoxCovers(original, root.Box)
  )
    return D.KeepOriginalBox;
  if (
    root.FixedTopLeft &&
    (root.TopLeft.X !== original.TopLeft.X ||
      root.TopLeft.Y !== original.TopLeft.Y)
  )
    return D.KeepOriginalBox;
  let checked = false;
  const rootEdges = new Set<Edge>();
  for (const edge of root.Edges) {
    guard.Step();
    if (
      !edge ||
      !edge.From ||
      !edge.To ||
      edge.From === edge.To ||
      edge.Points.length < 2 ||
      !graphEdges.has(edge) ||
      rootEdges.has(edge)
    )
      return D.KeepOriginalBox;
    rootEdges.add(edge);
    let incident = false;
    if (edge.From === root) {
      incident = true;
      checked = true;
      guard.Step();
      if (
        !routedContainerEndpointKeepsSides(original, root.Box, edge.Points[0]!)
      )
        return D.KeepOriginalBox;
    }
    if (edge.To === root) {
      incident = true;
      checked = true;
      guard.Step();
      if (
        !routedContainerEndpointKeepsSides(
          original,
          root.Box,
          edge.Points[edge.Points.length - 1]!,
        )
      )
        return D.KeepOriginalBox;
    }
    if (!incident) return D.KeepOriginalBox;
    const adjacent = edge.From === root ? edge.To : edge.From;
    if (binPackIsDescendantOf(adjacent, root, guard)) return D.KeepOriginalBox;
  }
  if (rootEdges.size !== graphEdges.size || !checked) return D.KeepOriginalBox;
  const preserved = routedContainerRoutesStayInsideShrink(
    affected,
    original,
    root.Box,
    guard,
  );
  guard.Finish();
  return preserved ? D.UseProposedBox : D.KeepOriginalBox;
}
