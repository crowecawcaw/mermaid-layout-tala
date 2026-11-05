// Translated portions of internal/routing/route_search_guard.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context, Done } from '../limits/context.js';
import type { Node } from '../layoutgraph/node.js';
import { ancestryParent } from '../layoutgraph/reachability.js';
import { RouteWorkGuard } from './stage-guard.js';
export const MaxSearchWorkUnits = 120_000_000n,
  MaxRouteSearchFlavors = 3;
const Uint64Max = (1n << 64n) - 1n,
  stride = 1024n,
  MaxEdgeRoutingStageWorkUnits = 660_000_000n;
export class SearchTelemetry {
  samples: bigint[] = [];
  WorkSamples(): bigint[] {
    return [...this.samples];
  }
}
export class RouteSearchWorkGuard {
  private done: Done | null;
  private used = 0n;
  private nextCheck = 0n;
  private aggregateCharged = 0n;
  private metricID = -1;
  private deferAggregate = false;
  constructor(
    private ctx: Context,
    readonly flavor: string,
    readonly limit: bigint,
    private aggregate: RouteWorkGuard | null = null,
    private telemetry: SearchTelemetry | null = null,
  ) {
    if (!ctx) throw new Error('TALA EdgeRouting requires a context');
    this.done = ctx.Done();
    this.deferAggregate =
      aggregate !== null &&
      aggregate.limit === MaxEdgeRoutingStageWorkUnits &&
      limit === MaxSearchWorkUnits;
    this.Check();
    this.nextCheck = stride;
  }
  Bind(ctx: Context): void {
    if (!ctx) throw new Error('TALA EdgeRouting requires a context');
    this.ctx = ctx;
    this.done = ctx.Done();
    this.Check();
    this.nextCheck = BigInt.asUintN(64, this.used + stride);
  }
  Step(): void {
    if (this.done === null || this.used >= this.nextCheck) {
      this.Check();
      this.nextCheck = BigInt.asUintN(64, this.used + stride);
    }
    if (this.used >= this.limit) {
      this.Check();
      this.exceeded();
    }
    this.used++;
    if (!this.deferAggregate && this.aggregate) this.aggregate.Add(1n);
  }
  Add(units: bigint): void {
    if (this.used > this.limit || units > this.limit - this.used) {
      this.Check();
      this.exceeded();
    }
    this.used += units;
    if (!this.deferAggregate && this.aggregate) this.aggregate.Add(units);
    if (this.done === null || units === 0n || this.used >= this.nextCheck) {
      this.Check();
      this.nextCheck = BigInt.asUintN(64, this.used + stride);
    }
  }
  Check(): void {
    if (this.done === null || this.done.closed) {
      const error = this.ctx.Err();
      if (error)
        throw new Error(`EdgeRouting: ${error.message}`, { cause: error });
    }
  }
  private exceeded(): never {
    throw new Error(
      `TALA route-search work limit exceeded: TALA EdgeRouting flavor ${this.flavor} work exceeds limit ${this.limit}`,
    );
  }
  ReserveProduct(a: bigint, b: bigint): void {
    const p = a * b;
    if (p > Uint64Max) {
      this.Check();
      throw new Error(
        'TALA route-search work limit exceeded: route-search work arithmetic overflow',
      );
    }
    this.Add(p);
  }
  ReserveSum(a: bigint, b: bigint): void {
    const sum = a + b;
    if (sum > Uint64Max) {
      this.Check();
      throw new Error(
        'TALA route-search work limit exceeded: route-search work arithmetic overflow',
      );
    }
    this.Add(sum);
  }
  ReserveSort(length: number): void {
    if (length < 2) {
      this.Step();
      return;
    }
    let levels = 0n;
    for (let remaining = BigInt(length - 1); remaining > 0n; remaining >>= 1n)
      levels++;
    this.ReserveProduct(BigInt(length), levels);
  }
  Finish(): void {
    if (this.telemetry) {
      if (this.metricID < 0) {
        this.metricID = this.telemetry.samples.length;
        this.telemetry.samples.push(this.used);
      } else this.telemetry.samples[this.metricID] = this.used;
    }
    if (
      this.deferAggregate &&
      this.aggregate &&
      this.used !== this.aggregateCharged
    ) {
      this.aggregate.Add(this.used - this.aggregateCharged);
      this.aggregateCharged = this.used;
    }
    this.Check();
  }
  HasDone(): boolean {
    return this.done !== null;
  }
  Used(): bigint {
    return this.used;
  }
}
export function routeSearchIsDescendantOf(
  guard: { Step(): void },
  descendant: Node | null,
  ancestor: Node | null,
): boolean {
  for (let current = descendant; ; current = ancestryParent(current)) {
    guard.Step();
    if (ancestor === current) return true;
    if (!current) return false;
    const parent = ancestryParent(current);
    if (!parent) return ancestor === null;
  }
}
export function routeSearchHasFixedAncestor(
  guard: { Step(): void },
  node: Node | null,
): boolean {
  for (let current = node; current; current = current.container()) {
    guard.Step();
    if (current.FixedTopLeft !== null) return true;
  }
  return false;
}

// fixedOverlapsForRoute mirrors the per-flavor immutable overlap inventory.
export function fixedOverlapsForRoute(
  nodes: Node[],
  guard: RouteSearchWorkGuard,
): Set<Node> {
  const fixed: Node[] = [];
  for (const node of nodes) {
    guard.Step();
    if (routeSearchHasFixedAncestor(guard, node)) fixed.push(node);
  }
  const overlaps = new Set<Node>();
  for (const node of fixed) {
    guard.Step();
    if (overlaps.has(node)) continue;
    for (const other of nodes) {
      guard.Step();
      const a = routeSearchIsDescendantOf(guard, node, other),
        b = routeSearchIsDescendantOf(guard, other, node);
      if (node === other || a || b) continue;
      if (node.Box.Overlaps(other.Box)) {
        overlaps.add(node);
        if (routeSearchHasFixedAncestor(guard, other)) overlaps.add(other);
        break;
      }
    }
  }
  guard.Check();
  return overlaps;
}
