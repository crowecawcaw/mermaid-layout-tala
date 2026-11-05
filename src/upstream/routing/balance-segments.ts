// Translated from internal/routing/{postprocess,port_interior_balance}.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import { Round } from '../geo/math.js';
import type { Point } from '../geo/point.js';
import type { Segment } from '../geo/segment.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Cluster } from '../layoutgraph/records.js';
import { Kind } from '../nodeshape/kind.js';
import { Inspect } from '../quality/inspection.js';
import {
  MaxRouteStageWorkUnits,
  RouteWorkGuard,
  runAtomicRouteStage,
  stableSortRouteValues,
  captureRouteMutations,
} from './stage-guard.js';
import {
  BalancedEdgeSegment,
  BalanceOrderStatus,
  nodeSegmentsGuarded,
  edgeSegmentsGuarded,
  routeSegmentBounds,
  evenlyDistributeGuarded,
  checkBalanceOrder,
  removeDuplicatePointsGuarded,
} from './balance-geometry.js';
import { balanceReversalRemovesCrossings } from './balance-crossings.js';
import {
  lineIntersectsUnrelatedNode,
  sameRouteDirection,
} from './edge-simplify.js';

const segmentSpacingBuffer = 40,
  unboundedSegmentMove = 100;
export function hasFixedBalancingPorts(e: Edge): boolean {
  return (
    e.FromTableColumnIndex !== null ||
    e.ToTableColumnIndex !== null ||
    e.From.shapeType === Kind.Diamond ||
    e.To.shapeType === Kind.Diamond
  );
}
export function isSpecialEdgeForBalancing(g: Graph, e: Edge): boolean {
  if (
    g.NodeToTree.has(e.From) ||
    g.NodeToTree.has(e.To) ||
    hasFixedBalancingPorts(e) ||
    e.IsLoop()
  )
    return true;
  const first = e.Points[0]!,
    last = e.Points[e.Points.length - 1]!;
  return Math.abs(first.X - last.X) === 1 || Math.abs(first.Y - last.Y) === 1;
}
export function balanceRegularEdgesGuarded(
  g: Graph,
  specialEdges: Edge[],
  regularEdges: Edge[],
  guard: RouteWorkGuard,
): void {
  const fixedPortPoints = new Set<Point>();
  for (const edge of regularEdges) {
    guard.Step();
    if (!hasFixedBalancingPorts(edge)) continue;
    for (const p of edge.Points.slice(0, 2)) fixedPortPoints.add(p);
    for (const p of edge.Points.slice(Math.max(0, edge.Points.length - 2)))
      fixedPortPoints.add(p);
  }
  const connected = (p: Point): boolean => {
    for (const node of g.Nodes) {
      guard.Step();
      if (
        node.Width === 1 &&
        node.Height === 1 &&
        (p.X === node.TopLeft!.X || p.X === node.TopLeft!.X + 1) &&
        (p.Y === node.TopLeft!.Y || p.Y === node.TopLeft!.Y + 1)
      )
        return true;
    }
    return false;
  };
  const sharedCluster = (a: Edge, b: Edge): Cluster | null => {
    const fa = a.From.Cluster,
      ta = a.To.Cluster,
      fb = b.From.Cluster,
      tb = b.To.Cluster;
    if (fa && (fa === fb || fa === tb)) return fa;
    if (ta && (ta === fb || ta === tb)) return ta;
    return null;
  };
  const eq = (a: number, b: number) => Math.abs(a - b) <= 1;
  const ids = new WeakMap<object, number>();
  let nextID = 0;
  const id = (o: object) => {
    let v = ids.get(o);
    if (v === undefined) {
      v = ++nextID;
      ids.set(o, v);
    }
    return v;
  };
  const key = (s: BalancedEdgeSegment) =>
    `${id(s.Start)}:${id(s.End)}:${id(s.owner)}`;
  for (const horizontal of [true, false]) {
    const lockedSegments: Segment[] = nodeSegmentsGuarded(
      g.Nodes,
      !horizontal,
      guard,
    );
    const locked = new Set<string>();
    const all = edgeSegmentsGuarded(regularEdges, !horizontal, guard),
      segments: BalancedEdgeSegment[] = [],
      fixed: Segment[] = [];
    for (const segment of all) {
      if (
        fixedPortPoints.has(segment.Start) ||
        fixedPortPoints.has(segment.End)
      ) {
        fixed.push(segment);
        continue;
      }
      const start = connected(segment.Start),
        end = connected(segment.End);
      if (!start && !end) segments.push(segment);
    }
    const special: Segment[] = fixed;
    const specialEdgesSegments = edgeSegmentsGuarded(
      specialEdges,
      !horizontal,
      guard,
    );
    for (const s of specialEdgesSegments) {
      guard.Step();
      special.push(s);
    }
    for (const s of segments)
      for (const other of special) {
        guard.Step();
        if (!s.Overlaps(other, horizontal, 1)) continue;
        if (
          horizontal
            ? eq(s.Start.X, other.Start.X)
            : eq(s.Start.Y, other.Start.Y)
        ) {
          special.push(s);
          locked.add(key(s));
          break;
        }
      }
    lockedSegments.push(...special);
    while (locked.size !== segments.length) {
      guard.Step();
      let minStart = -Infinity,
        minEnd = Infinity,
        minLength = Infinity;
      const ranges = new Map<number, Map<number, BalancedEdgeSegment[]>>();
      for (const es of segments) {
        guard.Step();
        if (locked.has(key(es))) continue;
        let [floor, ceil] = routeSegmentBounds(
          es,
          lockedSegments,
          segmentSpacingBuffer,
          guard,
        );
        const coordinate = horizontal ? es.Start.X : es.Start.Y;
        if (floor === -Infinity) floor = coordinate - unboundedSegmentMove;
        if (ceil === Infinity) ceil = coordinate + unboundedSegmentMove;
        let ends = ranges.get(floor);
        if (!ends) {
          ends = new Map();
          ranges.set(floor, ends);
        }
        let values = ends.get(ceil);
        if (!values) {
          values = [];
          ends.set(ceil, values);
        }
        values.push(es);
        if (ceil - floor < minLength) {
          minStart = floor;
          minEnd = ceil;
          minLength = ceil - floor;
        }
      }
      for (const s of ranges.get(minStart)?.get(minEnd) ?? []) {
        guard.Step();
        if (locked.has(key(s))) continue;
        const batch = [s],
          batchSet = new Set(batch);
        for (const other of ranges.get(minStart)!.get(minEnd)!) {
          guard.Step();
          if (s === other || locked.has(key(other))) continue;
          const buffer = s.owner === other.owner ? 0 : segmentSpacingBuffer;
          if (s.Overlaps(other, horizontal, buffer)) {
            batch.push(other);
            batchSet.add(other);
          }
        }
        for (const other of segments) {
          guard.Step();
          if (batchSet.has(other) || locked.has(key(other))) continue;
          const cluster = sharedCluster(s.owner, other.owner);
          if (cluster && cluster.Arrangement === cluster.DesiredArrangement) {
            const together = horizontal
              ? cluster.Arrangement === 'Column' && eq(s.Start.X, other.Start.X)
              : cluster.Arrangement === 'Row' && eq(s.Start.Y, other.Start.Y);
            if (together) {
              batch.push(other);
              batchSet.add(other);
              continue;
            }
          }
          if (!s.Overlaps(other, horizontal, 1)) continue;
          if (
            horizontal
              ? eq(s.Start.X, other.Start.X)
              : eq(s.Start.Y, other.Start.Y)
          ) {
            batch.push(other);
            batchSet.add(other);
          }
        }
        stableSortRouteValues(
          batch,
          (a, b) => {
            const ap = horizontal ? a.Start.X : a.Start.Y,
              bp = horizontal ? b.Start.X : b.Start.Y;
            const as = horizontal ? a.Start.Y : a.Start.X,
              bs = horizontal ? b.Start.Y : b.Start.X;
            return ap === bp ? as < bs : ap < bp;
          },
          guard,
        );
        const distincts = new Set<number>();
        for (const segment of batch) {
          guard.Step();
          distincts.add(Round(horizontal ? segment.Start.X : segment.Start.Y));
        }
        const distribution = evenlyDistributeGuarded(
            minStart,
            minEnd,
            distincts.size,
            guard,
          ),
          proposed: number[] = [];
        for (const segment of batch) {
          guard.Step();
          proposed.push(horizontal ? segment.Start.X : segment.Start.Y);
        }
        let segmentIndex = 0;
        for (const val of distribution) {
          guard.Step();
          let sharedCount = 0;
          while (segmentIndex + sharedCount < batch.length) {
            guard.Step();
            const a = batch[segmentIndex]!,
              b = batch[segmentIndex + sharedCount]!;
            if (
              horizontal ? eq(a.Start.X, b.Start.X) : eq(a.Start.Y, b.Start.Y)
            )
              sharedCount++;
            else break;
          }
          for (let i = segmentIndex; i < segmentIndex + sharedCount; i++) {
            guard.Step();
            proposed[i] = val;
          }
          segmentIndex += sharedCount;
        }
        let order = checkBalanceOrder(
          batch,
          batchSet,
          all,
          proposed,
          horizontal,
          guard,
        );
        if (order !== BalanceOrderStatus.ContactChanged)
          order = Math.max(
            order,
            checkBalanceOrder(
              batch,
              batchSet,
              specialEdgesSegments,
              proposed,
              horizontal,
              guard,
            ),
          );
        let accept = order === BalanceOrderStatus.Preserved;
        if (order === BalanceOrderStatus.Reversed)
          accept = balanceReversalRemovesCrossings(
            g,
            batch,
            proposed,
            horizontal,
            guard,
          );
        if (accept)
          for (let i = 0; i < batch.length; i++) {
            guard.Step();
            const segment = batch[i]!;
            if (horizontal) {
              segment.Start.X = proposed[i]!;
              segment.End.X = proposed[i]!;
            } else {
              segment.Start.Y = proposed[i]!;
              segment.End.Y = proposed[i]!;
            }
          }
        for (const segment of batch) {
          guard.Step();
          locked.add(key(segment));
          lockedSegments.push(segment);
        }
      }
    }
  }
  for (const edge of regularEdges)
    edge.Points = removeDuplicatePointsGuarded(edge.Points, guard);
}
export function copyRoutePoints(
  edges: Edge[],
  guard: RouteWorkGuard,
): Map<Edge, Point[]> {
  const out = new Map<Edge, Point[]>();
  for (const e of edges) {
    guard.Add(BigInt(e.Points.length + 1));
    out.set(
      e,
      e.Points.map((p) => p.Copy()),
    );
  }
  return out;
}
export function changedRouteIsClear(
  g: Graph,
  e: Edge,
  before: Point[],
  fixedPorts: boolean,
  guard: RouteWorkGuard,
): boolean {
  if (e.Points.length < 2 || before.length < 2) return false;
  if (
    fixedPorts &&
    (!e.Points[0]!.Equals(before[0]!) ||
      !e.Points.at(-1)!.Equals(before.at(-1)!) ||
      !sameRouteDirection(before[0]!, before[1]!, e.Points[0]!, e.Points[1]!) ||
      !sameRouteDirection(
        before.at(-2)!,
        before.at(-1)!,
        e.Points.at(-2)!,
        e.Points.at(-1)!,
      ))
  )
    return false;
  for (let i = 1; i < e.Points.length; i++) {
    const a = e.Points[i - 1]!,
      b = e.Points[i]!;
    let unchanged = false;
    for (let j = 1; j < before.length; j++) {
      guard.Step();
      if (a.Equals(before[j - 1]!) && b.Equals(before[j]!)) {
        unchanged = true;
        break;
      }
    }
    if (unchanged) continue;
    if (a.X !== b.X && a.Y !== b.Y) return false;
    if (lineIntersectsUnrelatedNode(g, e, a, b, guard)) return false;
  }
  return true;
}
function balancePortInteriorsGuarded(
  ctx: Context,
  g: Graph,
  guard: RouteWorkGuard,
): void {
  const selected: Edge[] = [],
    locked: Edge[] = [];
  for (const e of g.Edges) {
    guard.Step();
    if (
      hasFixedBalancingPorts(e) &&
      !e.IsCurve &&
      !e.IsLoop() &&
      !g.NodeToTree.has(e.From) &&
      !g.NodeToTree.has(e.To) &&
      e.Points.length >= 6
    )
      selected.push(e);
    else locked.push(e);
  }
  if (!selected.length) return;
  const beforeMetrics = Inspect(ctx, g),
    snapshot = captureRouteMutations(g, [], guard),
    before = copyRoutePoints(selected, guard);
  balanceRegularEdgesGuarded(g, locked, selected, guard);
  for (const e of selected)
    if (!changedRouteIsClear(g, e, before.get(e)!, true, guard)) {
      snapshot.restore();
      return;
    }
  const after = Inspect(ctx, g);
  if (
    after.RouteObstructions > beforeMetrics.RouteObstructions ||
    after.Crossings > beforeMetrics.Crossings ||
    after.TextOcclusions > beforeMetrics.TextOcclusions ||
    after.RouteLength > beforeMetrics.RouteLength * 1.1
  )
    snapshot.restore();
}
export function balanceEdgeSegmentsWithLimit(
  ctx: Context,
  g: Graph,
  limit: bigint,
): void {
  runAtomicRouteStage(ctx, 'BalanceEdgeSegments', g, [], limit, (guard) => {
    const special: Edge[] = [],
      regular: Edge[] = [];
    for (const e of g.Edges) {
      guard.Step();
      if (e.Points.length < 2)
        throw new Error(
          `TALA BalanceEdgeSegments edge ${e.ID} has an incomplete route`,
        );
      (isSpecialEdgeForBalancing(g, e) ? special : regular).push(e);
    }
    balanceRegularEdgesGuarded(g, special, regular, guard);
    balancePortInteriorsGuarded(ctx, g, guard);
  });
}
export function BalanceEdgeSegments(ctx: Context, g: Graph): void {
  balanceEdgeSegmentsWithLimit(ctx, g, MaxRouteStageWorkUnits);
}
