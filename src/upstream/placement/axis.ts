// Translated internal/placement/axis.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { ClusterArrangement } from '../layoutgraph/records.js';
export enum LayoutAxis {
  Invalid,
  Horizontal,
  Vertical,
}
export const axisValid = (axis: LayoutAxis): boolean =>
  axis === LayoutAxis.Horizontal || axis === LayoutAxis.Vertical;
export const axisIsHorizontal = (axis: LayoutAxis): boolean =>
  axis === LayoutAxis.Horizontal;
export const oppositeAxis = (axis: LayoutAxis): LayoutAxis =>
  axis === LayoutAxis.Horizontal
    ? LayoutAxis.Vertical
    : axis === LayoutAxis.Vertical
      ? LayoutAxis.Horizontal
      : LayoutAxis.Invalid;
export const axisForArrangement = (
  arrangement: ClusterArrangement,
): LayoutAxis =>
  arrangement === 'Column' ? LayoutAxis.Horizontal : LayoutAxis.Vertical;
export enum TraversalDirection {
  Invalid,
  Forward,
  Backward,
}
export const directionValid = (direction: TraversalDirection): boolean =>
  direction === TraversalDirection.Forward ||
  direction === TraversalDirection.Backward;
export const directionIsForward = (direction: TraversalDirection): boolean =>
  direction === TraversalDirection.Forward;
export const oppositeDirection = (
  direction: TraversalDirection,
): TraversalDirection =>
  direction === TraversalDirection.Forward
    ? TraversalDirection.Backward
    : direction === TraversalDirection.Backward
      ? TraversalDirection.Forward
      : TraversalDirection.Invalid;
