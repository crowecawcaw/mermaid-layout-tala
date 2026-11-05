// Translated internal/labeling/model.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { Position as P } from '../label/label.js';
import { LabelTier as T } from '../nodeshape/policy.js';
export const edgeLabelPreferenceOrder = [
  P.OutsideTopCenter,
  P.OutsideBottomCenter,
  P.OutsideTopLeft,
  P.OutsideTopRight,
  P.OutsideBottomLeft,
  P.OutsideBottomRight,
  P.InsideMiddleCenter,
  P.InsideMiddleLeft,
  P.InsideMiddleRight,
];
export const nodeLabelPositionOrder = [
  P.InsideMiddleCenter,
  P.InsideTopCenter,
  P.InsideBottomCenter,
  P.InsideMiddleLeft,
  P.InsideMiddleRight,
  P.InsideTopLeft,
  P.InsideTopRight,
  P.InsideBottomLeft,
  P.InsideBottomRight,
  P.OutsideTopCenter,
  P.OutsideBottomCenter,
  P.OutsideLeftMiddle,
  P.OutsideRightMiddle,
  P.OutsideTopLeft,
  P.OutsideTopRight,
  P.OutsideBottomLeft,
  P.OutsideBottomRight,
  P.OutsideLeftTop,
  P.OutsideLeftBottom,
  P.OutsideRightTop,
  P.OutsideRightBottom,
];
export const containerLabelPositionOrder = [
  P.InsideTopCenter,
  P.OutsideTopCenter,
  P.InsideBottomCenter,
  P.OutsideBottomCenter,
  P.OutsideTopLeft,
  P.OutsideTopRight,
  P.OutsideBottomLeft,
  P.OutsideBottomRight,
  P.OutsideLeftMiddle,
  P.OutsideRightMiddle,
  P.OutsideLeftTop,
  P.OutsideLeftBottom,
  P.OutsideRightTop,
  P.OutsideRightBottom,
  P.InsideTopLeft,
  P.InsideTopRight,
  P.InsideBottomLeft,
  P.InsideBottomRight,
  P.InsideMiddleLeft,
  P.InsideMiddleRight,
  P.InsideMiddleCenter,
];
export function labelPositionPreferenceTranches(node: Node): P[][] {
  const order = node.isContainer
    ? containerLabelPositionOrder
    : nodeLabelPositionOrder;
  return [T.Good, T.OK, T.Unideal, T.Bad].map((tier) => {
    const allowed = node.Shape.LabelPositionPreferences(tier);
    return order.filter((p) => allowed.has(p));
  });
}
export function labelPositionPreferences(node: Node): P[] {
  return labelPositionPreferenceTranches(node).flat();
}
export function compareLabelPositions(node: Node, first: P, second: P): number {
  const score = (position: P): number => {
    let score = -1;
    [T.Good, T.OK, T.Unideal, T.Bad].forEach((tier, index) => {
      if (node.Shape.LabelPositionPreferences(tier).has(position))
        score = index + 1;
    });
    return score;
  };
  const a = score(first),
    b = score(second);
  return a < b ? 1 : a > b ? -1 : 0;
}
export function Initialize(graph: Graph): void {
  for (const node of graph.Nodes) {
    if (node.Label !== null) {
      if (node.Label.Position === P.Unset)
        node.Label.Position = labelPositionPreferences(node)[0]!;
      else node.Label.FixPosition();
    }
    if (node.Icon !== null && node.Icon.Position !== P.Unset)
      node.Icon.FixPosition();
  }
}
