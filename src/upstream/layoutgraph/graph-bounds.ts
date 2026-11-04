// Translated from internal/layoutgraph/{edge,graph}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from './graph.js';
import type { Edge } from './edge.js';
import { Point } from '../geo/point.js';
import { Route } from '../geo/route.js';
import { Round } from '../geo/math.js';
import { Position, GetPointOnRoute } from '../label/label.js';
import { ArrowheadTopLeft } from '../labelgeom/arrowhead.js';
import { fixedBounds } from './node-geometry.js';
export function EdgeLabelTopLeft(
  edge: Edge,
  position: Position,
  width: number,
  height: number,
): Point | null {
  return GetPointOnRoute(
    position,
    new Route(edge.Points),
    3,
    edge.LabelPercentage,
    width,
    height,
  )[0];
}
export function edgeBoundingBoxValues(edge: Edge): [Point, Point] {
  const tl = new Point(Infinity, Infinity),
    br = new Point(-Infinity, -Infinity);
  for (const p of edge.Points) {
    tl.X = Math.min(tl.X, p.X);
    tl.Y = Math.min(tl.Y, p.Y);
    br.X = Math.max(br.X, p.X);
    br.Y = Math.max(br.Y, p.Y);
  }
  if (
    edge.Label !== null &&
    edge.Points.length !== 0 &&
    edge.Label.Position !== Position.Unset
  ) {
    const p = EdgeLabelTopLeft(
      edge,
      edge.Label.Position,
      edge.Label.Width,
      edge.Label.Height,
    )!;
    tl.X = Math.min(tl.X, p.X);
    tl.Y = Math.min(tl.Y, p.Y);
    br.X = Math.max(br.X, p.X + edge.Label.Width);
    br.Y = Math.max(br.Y, p.Y + edge.Label.Height);
  }
  if (edge.Points.length > 0) {
    if (edge.SourceArrowheadLabel !== null) {
      const label = edge.SourceArrowheadLabel,
        p = ArrowheadTopLeft(
          edge.Points,
          false,
          edge.SourceArrowhead,
          edge.TargetArrowhead,
          label.Width,
          label.Height,
        );
      tl.X = Math.min(tl.X, p.X);
      tl.Y = Math.min(tl.Y, p.Y);
      br.X = Math.max(br.X, p.X + label.Width);
      br.Y = Math.max(br.Y, p.Y + label.Height);
    }
    if (edge.TargetArrowheadLabel !== null) {
      const label = edge.TargetArrowheadLabel,
        p = ArrowheadTopLeft(
          edge.Points,
          true,
          edge.SourceArrowhead,
          edge.TargetArrowhead,
          label.Width,
          label.Height,
        );
      tl.X = Math.min(tl.X, p.X);
      tl.Y = Math.min(tl.Y, p.Y);
      br.X = Math.max(br.X, p.X + label.Width);
      br.Y = Math.max(br.Y, p.Y + label.Height);
    }
  }
  tl.X = Round(tl.X);
  tl.Y = Round(tl.Y);
  br.X = Round(br.X);
  br.Y = Round(br.Y);
  return [tl, br];
}
export function graphBoundingBox(
  g: Graph,
  roundNodeDimensions: boolean,
): [Point | null, Point | null] {
  const [tl, br] = fixedBounds(g.Nodes, roundNodeDimensions);
  if (tl === null || br === null) return [null, null];
  let minX = tl.X,
    minY = tl.Y,
    maxX = br.X,
    maxY = br.Y;
  for (const edge of g.Edges) {
    const [edgeTL, edgeBR] = edgeBoundingBoxValues(edge);
    if (edgeTL.X !== Infinity && edgeTL.X !== -Infinity) {
      minX = Math.min(minX, edgeTL.X);
      minY = Math.min(minY, edgeTL.Y);
      maxX = Math.max(maxX, edgeBR.X);
      maxY = Math.max(maxY, edgeBR.Y);
    }
  }
  return [new Point(minX, minY), new Point(maxX, maxY)];
}
export function BoundingBox(g: Graph): [Point | null, Point | null] {
  const [tl, br] = graphBoundingBox(g, true);
  if (tl === null || br === null) return [null, null];
  return [
    new Point(Round(tl.X), Round(tl.Y)),
    new Point(Round(br.X), Round(br.Y)),
  ];
}
