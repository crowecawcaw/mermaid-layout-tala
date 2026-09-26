import { ConnectedNodeGap } from './geometry-policy.js';
import type { TalaEdge, TalaNode } from './graph.js';
import { sizedOrientation } from './placement-geometry.js';

const goRound = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);

/** The ordinary-node branch of placement.alignmentDeltas. */
export function ordinaryAlignmentDeltas(edge: TalaEdge): { x: number; y: number } {
  if (edge.fromTableColumnIndex !== undefined || edge.toTableColumnIndex !== undefined) {
    throw new Error('table-column alignment requires facing-port geometry');
  }
  const from = edge.from, to = edge.to;
  if (!from.topLeft || !to.topLeft) throw new Error('alignment requires positioned endpoints');
  let x = goRound((to.topLeft.x + to.width / 2) - (from.topLeft.x + from.width / 2));
  let y = goRound((to.topLeft.y + to.height / 2) - (from.topLeft.y + from.height / 2));
  const orientation = sizedOrientation(from, to);
  if (orientation === 'Left' || orientation === 'Right') x = 0;
  else if (orientation === 'Top' || orientation === 'Bottom') y = 0;
  else {
    const gaps = orthogonalGaps(from, to);
    if (gaps.x < ConnectedNodeGap) y = 0;
    if (gaps.y < ConnectedNodeGap) x = 0;
  }
  return { x, y };
}

function orthogonalGaps(first: TalaNode, second: TalaNode): { x: number; y: number } {
  const a = first.topLeft!, b = second.topLeft!;
  const x = a.x < b.x ? Math.max(0, b.x - (a.x + first.width))
    : Math.max(0, a.x - (b.x + second.width));
  const y = a.y < b.y ? Math.max(0, b.y - (a.y + first.height))
    : Math.max(0, a.y - (b.y + second.height));
  return { x, y };
}
