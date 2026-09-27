import { sizedOrientation } from './placement-geometry.js';
import type { TalaNode } from './graph.js';

/** placementcost.AxisScore: how strongly a group shares a visual axis. */
export function axisScore(nodes: readonly TalaNode[]): number {
  if (nodes.length < 2) return 1;
  if (nodes.length === 2) {
    const orientation = sizedOrientation(nodes[0]!, nodes[1]!);
    return ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].includes(orientation) ? 0 : 1;
  }
  let widest = nodes[0]!, tallest = nodes[0]!;
  for (const node of nodes) {
    if (node.width > widest.width) widest = node;
    if (node.height > tallest.height) tallest = node;
  }
  const horizontal = (orientation: string): boolean => orientation === 'Left' || orientation === 'Right';
  const vertical = (orientation: string): boolean => orientation === 'Top' || orientation === 'Bottom';
  if (nodes.every((node) => node === tallest || horizontal(sizedOrientation(node, tallest)))) {
    let score = 0;
    for (const node of nodes) {
      if (node === tallest) continue;
      let nodeScore = 0;
      for (const fraction of [.25, .5, .75]) {
        const y = tallest.topLeft!.y + fraction * tallest.height;
        if (node.topLeft!.y <= y && y <= node.topLeft!.y + node.height) nodeScore += .33;
      }
      if (node.height < .25 * tallest.height) nodeScore *= 3;
      else if (node.height < .75 * tallest.height) nodeScore *= 2;
      score += nodeScore === .99 ? 1 : nodeScore;
    }
    return Math.max(.33, score / (nodes.length - 1));
  }
  if (nodes.every((node) => node === widest || vertical(sizedOrientation(node, widest)))) {
    let score = 0;
    for (const node of nodes) {
      if (node === widest) continue;
      let nodeScore = 0;
      for (const fraction of [.25, .5, .75]) {
        const x = widest.topLeft!.x + fraction * widest.width;
        if (node.topLeft!.x <= x && x <= node.topLeft!.x + node.width) nodeScore += .33;
      }
      if (node.width < .25 * widest.width) nodeScore *= 3;
      else if (node.width < .75 * widest.width) nodeScore *= 2;
      score += nodeScore === .99 ? 1 : nodeScore;
    }
    return Math.max(.33, score / (nodes.length - 1));
  }
  return 0;
}
