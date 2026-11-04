// Translated internal/placementcost/flow_continuity.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import { TurnCost } from '../layoutgraph/placement-cost.js';
import { hasTableColumn } from '../layoutgraph/ports.js';
export const flowSpineWeight = 1,
  flowBranchWeight = 1;
export function flowContinuityCost(
  node: Node,
  s: { nRepl: (Node | null)[]; aRepl: (Node | null)[] },
): number {
  if (
    node.TopLeft === null ||
    node.Edges.length < 2 ||
    node.Edges.length > 8 ||
    node.Cluster !== null ||
    node.Sequence !== null ||
    node.HerdAssignment !== null ||
    (node.Graph!.Containers.get(node)?.length ?? 0) !== 0
  )
    return 0;
  const incomingDirection = 1,
    outgoingDirection = 2,
    rays: { node: Node; x: number; y: number; directions: number }[] = [];
  const cx = node.TopLeft.X + node.Width / 2,
    cy = node.TopLeft.Y + node.Height / 2;
  for (let i = 0; i < node.Edges.length; i++) {
    const edge = node.Edges[i]!;
    if (
      edge.IsInvisible ||
      edge.From === edge.To ||
      hasTableColumn(edge) ||
      edge.HasSourceArrow() === edge.HasTargetArrow() ||
      s.nRepl[i] !== node
    )
      continue;
    const adjacent = s.aRepl[i];
    if (
      adjacent == null ||
      adjacent.TopLeft === null ||
      adjacent.Container !== node.Container
    )
      continue;
    let incoming = edge.To === node;
    if (edge.HasSourceArrow()) incoming = !incoming;
    const direction = incoming ? incomingDirection : outgoingDirection;
    let duplicate = false;
    for (const ray of rays)
      if (ray.node === adjacent) {
        ray.directions |= direction;
        duplicate = true;
        break;
      }
    if (duplicate) continue;
    const x = adjacent.TopLeft.X + adjacent.Width / 2 - cx,
      y = adjacent.TopLeft.Y + adjacent.Height / 2 - cy,
      length = Math.hypot(x, y);
    if (length === 0) continue;
    rays.push({
      node: adjacent,
      x: x / length,
      y: y / length,
      directions: direction,
    });
  }
  let spine = Infinity,
    branchSum = 0,
    branches = 0;
  for (let i = 0; i < rays.length; i++)
    for (let j = i + 1; j < rays.length; j++) {
      const first = rays[i]!,
        second = rays[j]!,
        dot = Math.max(
          -1,
          Math.min(1, first.x * second.x + first.y * second.y),
        ),
        a = first.directions,
        b = second.directions;
      if (
        ((a & incomingDirection) !== 0 && (b & outgoingDirection) !== 0) ||
        ((a & outgoingDirection) !== 0 && (b & incomingDirection) !== 0)
      )
        spine = Math.min(spine, 1 + dot);
      if ((a & b) !== 0) {
        branchSum += Math.max(0, 2 * dot - 1);
        branches++;
      }
    }
  let cost = 0;
  if (spine !== Infinity) cost += flowSpineWeight * spine;
  if (branches > 0) cost += (flowBranchWeight * branchSum) / branches;
  return TurnCost(node.Graph!) * cost;
}
