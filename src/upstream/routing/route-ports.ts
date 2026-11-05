// Translated port occupancy helpers from internal/routing/ovg_edge_router.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import { ports } from '../layoutgraph/ports.js';
import type { OVG } from './ovg.js';
import type { OVGNode } from './ovg-node.js';
import type { RouteInventory } from './route-inventory.js';
import type { RouteSearchWorkGuard } from './search-guard.js';
import { PointMap } from './point-map.js';
function check(ctx: Context): void {
  const err = ctx.Err();
  if (err) throw new Error(`EdgeRouting: ${err.message}`, { cause: err });
}
export interface UsedPorts {
  source: PointMap<boolean>;
  target: PointMap<boolean>;
  duplicateSource: PointMap<boolean>;
  duplicateTarget: PointMap<boolean>;
  sharedClusterSource: PointMap<boolean>;
  sharedClusterTarget: PointMap<boolean>;
}
export function usedPorts(
  ctx: Context,
  ovg: OVG,
  inventory: RouteInventory,
  source: Node,
  target: Node,
  sourceCenter: OVGNode,
  targetCenter: OVGNode,
  sourceCluster: Set<Node>,
  targetCluster: Set<Node>,
  undesirable: boolean,
  guard: RouteSearchWorkGuard,
): UsedPorts {
  const result: UsedPorts = {
    source: new PointMap(),
    target: new PointMap(),
    duplicateSource: new PointMap(),
    duplicateTarget: new PointMap(),
    sharedClusterSource: new PointMap(),
    sharedClusterTarget: new PointMap(),
  };
  for (const center of [sourceCenter, targetCenter]) {
    guard.Step();
    for (const route of inventory.routesAt(center.Point)) {
      guard.Step();
      const e = route.GEdge;
      if (
        e.From !== source &&
        e.To !== source &&
        e.From !== target &&
        e.To !== target
      )
        continue;
      if (e.From === source && e.To === target) {
        result.duplicateSource.set(route.FromPort, true);
        result.duplicateTarget.set(route.ToPort, true);
      }
      if (!undesirable) {
        if (e.To === target && sourceCluster.has(e.From))
          result.sharedClusterTarget.set(route.ToPort, true);
        if (e.From === source && targetCluster.has(e.To))
          result.sharedClusterSource.set(route.FromPort, true);
      }
      for (const node of route.OVGNodes) {
        guard.Step();
        for (const port of ovg.Ports.get(source) ?? []) {
          guard.Step();
          if (node === port) {
            result.source.set(port.Point, true);
            break;
          }
        }
        for (const port of ovg.Ports.get(target) ?? []) {
          guard.Step();
          if (node === port) {
            result.target.set(port.Point, true);
            break;
          }
        }
      }
    }
  }
  check(ctx);
  return result;
}
export function centerSymmetricalPorts(
  ctx: Context,
  ovg: OVG,
  source: Node,
  target: Node,
  sourceUsed: PointMap<boolean>,
  targetUsed: PointMap<boolean>,
  guard: RouteSearchWorkGuard,
): Set<OVGNode> {
  const result = new Set<OVGNode>(),
    sourcePorts = ovg.Ports.get(source) ?? [],
    targetPorts = ovg.Ports.get(target) ?? [];
  guard.ReserveSum(BigInt(sourcePorts.length), BigInt(targetPorts.length));
  const mirrors = (node: Node): PointMap<import('../geo/point.js').Point> => {
    const values = ports(node),
      map = new PointMap<import('../geo/point.js').Point>();
    for (const [i, j] of node.Shape.MirroredPortIndices())
      map.set(values[i]!, values[j]!);
    return map;
  };
  const sourceMirrored = mirrors(source),
    targetMirrored = mirrors(target);
  for (const [list, map, used] of [
    [sourcePorts, sourceMirrored, sourceUsed],
    [targetPorts, targetMirrored, targetUsed],
  ] as const)
    for (const port of list) {
      guard.Step();
      const mirror = map.get(port.Point);
      if (mirror && used.has(mirror)) result.add(port);
    }
  check(ctx);
  return result;
}
