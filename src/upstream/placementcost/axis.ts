// Translated internal/placementcost/axis.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import { IsDiagonal, IsHorizontal, IsVertical } from '../geo/orientation.js';
import { nodeOrientation, overlapsLine } from '../layoutgraph/node-spatial.js';
export function AxisScore(nodes: Node[]): number {
  if (nodes.length < 2) return 1;
  if (nodes.length === 2)
    return IsDiagonal(nodeOrientation(nodes[0]!, nodes[1]!)) ? 0 : 1;
  let largestWidth = -Infinity,
    largestWidthNode: Node | null = null,
    largestHeight = -Infinity,
    largestHeightNode: Node | null = null;
  for (const node of nodes) {
    if (node.Width > largestWidth) {
      largestWidth = node.Width;
      largestWidthNode = node;
    }
    if (node.Height > largestHeight) {
      largestHeight = node.Height;
      largestHeightNode = node;
    }
  }
  let verticallyAligned = true;
  for (const node of nodes) {
    if (node === largestHeightNode) continue;
    if (!IsHorizontal(nodeOrientation(node, largestHeightNode!))) {
      verticallyAligned = false;
      break;
    }
  }
  if (verticallyAligned) {
    const center = largestHeightNode!.Center();
    let score = 0;
    for (const node of nodes) {
      if (node === largestHeightNode) continue;
      let nodeScore = 0;
      for (const fraction of [0.25, 0.5, 0.75]) {
        const y =
          largestHeightNode!.TopLeft!.Y + fraction * largestHeightNode!.Height;
        if (
          overlapsLine(
            node,
            new Point(center.X, y),
            new Point(node.Center().X, y),
            0,
          )
        )
          nodeScore += 0.33;
      }
      if (node.Height < 0.25 * largestHeightNode!.Height) nodeScore *= 3;
      else if (node.Height < 0.75 * largestHeightNode!.Height) nodeScore *= 2;
      if (nodeScore === 0.99) score++;
      else score += nodeScore;
    }
    return Math.max(0.33, score / (nodes.length - 1));
  }
  let horizontallyAligned = true;
  for (const node of nodes) {
    if (node === largestWidthNode) continue;
    if (!IsVertical(nodeOrientation(node, largestWidthNode!))) {
      horizontallyAligned = false;
      break;
    }
  }
  if (horizontallyAligned) {
    const center = largestWidthNode!.Center();
    let score = 0;
    for (const node of nodes) {
      if (node === largestWidthNode) continue;
      let nodeScore = 0;
      for (const fraction of [0.25, 0.5, 0.75]) {
        const x =
          largestWidthNode!.TopLeft!.X + fraction * largestWidthNode!.Width;
        if (
          overlapsLine(
            node,
            new Point(x, center.Y),
            new Point(x, node.Center().Y),
            0,
          )
        )
          nodeScore += 0.33;
      }
      if (node.Width < 0.25 * largestWidthNode!.Width) nodeScore *= 3;
      else if (node.Width < 0.75 * largestWidthNode!.Width) nodeScore *= 2;
      if (nodeScore === 0.99) score++;
      else score += nodeScore;
    }
    return Math.max(0.33, score / (nodes.length - 1));
  }
  return 0;
}
