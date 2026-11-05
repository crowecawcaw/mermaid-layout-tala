// Translated from internal/routing/ovg_edge_set.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { OVGEdge } from './ovg-edge.js';
import type { OVGNode } from './ovg-node.js';
import { intersects } from './geometry.js';
export interface OVGEdgeSetBudget {
  Step(): void;
  Add(n: bigint): void;
  Check(): void;
}
function search(length: number, predicate: (i: number) => boolean): number {
  let i = 0,
    j = length;
  while (i < j) {
    const h = Math.floor((i + j) / 2);
    if (!predicate(h)) i = h + 1;
    else j = h;
  }
  return i;
}
export class OVGEdgeSet {
  readonly horizontalEdges = new Map<number, OVGEdge[]>();
  readonly verticalEdges = new Map<number, OVGEdge[]>();
  readonly horizontals: number[] = [];
  readonly verticals: number[] = [];
  private edges = new WeakMap<OVGNode, WeakMap<OVGNode, Set<number>>>();
  private has(edge: OVGEdge): boolean {
    return (
      !Number.isNaN(edge.Distance) &&
      (this.edges.get(edge.From)?.get(edge.To)?.has(edge.Distance) ?? false)
    );
  }
  private insertKey(edge: OVGEdge): void {
    let to = this.edges.get(edge.From);
    if (!to) {
      to = new WeakMap();
      this.edges.set(edge.From, to);
    }
    let distances = to.get(edge.To);
    if (!distances) {
      distances = new Set();
      to.set(edge.To, distances);
    }
    distances.add(edge.Distance);
  }
  private insertSortedFloat64(values: number[], value: number): void {
    const i = search(values.length, (j) => values[j]! >= value);
    if (i < values.length && values[i] === value) return;
    values.splice(i, 0, value);
  }
  private insertSortedEdge(
    values: OVGEdge[],
    edge: OVGEdge,
    vertical: boolean,
  ): void {
    const min = (e: OVGEdge) =>
      vertical
        ? e.From.Y < e.To.Y
          ? e.From.Y
          : e.To.Y
        : e.From.X < e.To.X
          ? e.From.X
          : e.To.X;
    const coordinate = min(edge),
      i = search(values.length, (j) => min(values[j]!) >= coordinate);
    values.splice(i, 0, edge);
  }
  add(edge: OVGEdge): void {
    if (this.has(edge)) return;
    this.insertKey(edge);
    const copy = new OVGEdge(edge.From, edge.To);
    copy.Distance = edge.Distance;
    if (edge.isVertical()) {
      let list = this.verticalEdges.get(edge.From.X);
      if (!list) {
        list = [];
        this.verticalEdges.set(edge.From.X, list);
        this.insertSortedFloat64(this.verticals, edge.From.X);
      }
      this.insertSortedEdge(list, copy, true);
    } else if (edge.isHorizontal()) {
      let list = this.horizontalEdges.get(edge.From.Y);
      if (!list) {
        list = [];
        this.horizontalEdges.set(edge.From.Y, list);
        this.insertSortedFloat64(this.horizontals, edge.From.Y);
      }
      this.insertSortedEdge(list, copy, false);
    }
  }
  addGuarded(edge: OVGEdge, guard: OVGEdgeSetBudget): void {
    guard.Step();
    if (this.has(edge)) return;
    if (edge.isVertical()) {
      if (!this.verticalEdges.has(edge.From.X))
        guard.Add(BigInt(this.verticals.length) + 1n);
      guard.Add(BigInt(this.verticalEdges.get(edge.From.X)?.length ?? 0) + 1n);
    } else if (edge.isHorizontal()) {
      if (!this.horizontalEdges.has(edge.From.Y))
        guard.Add(BigInt(this.horizontals.length) + 1n);
      guard.Add(
        BigInt(this.horizontalEdges.get(edge.From.Y)?.length ?? 0) + 1n,
      );
    }
    this.add(edge);
    guard.Check();
  }
  intersectsWithChecked(
    edge: OVGEdge,
    guard: OVGEdgeSetBudget | null,
  ): boolean {
    const horizontal = edge.isHorizontal();
    if (!horizontal && !edge.isVertical()) return false;
    const coord = (node: OVGNode) => (horizontal ? node.X : node.Y),
      perpendicular = (node: OVGNode) => (horizontal ? node.Y : node.X);
    let min = coord(edge.From),
      max = coord(edge.To);
    if (max < min) [min, max] = [max, min];
    const axis = perpendicular(edge.From),
      same = horizontal ? this.horizontalEdges : this.verticalEdges,
      other = horizontal ? this.verticalEdges : this.horizontalEdges,
      lines = horizontal ? this.verticals : this.horizontals;
    for (const existing of same.get(axis) ?? []) {
      guard?.Step();
      const a = coord(existing.From),
        b = coord(existing.To);
      if (a < b) {
        if (max <= a) break;
        if (b <= min) continue;
      } else {
        if (max <= b) break;
        if (a <= min) continue;
      }
      if (!edge.sharePoints(existing)) return true;
    }
    const start = search(lines.length, (i) => !(lines[i]! < min));
    for (let i = 0; i < start; i++) guard?.Step();
    for (let i = start; i < lines.length; i++) {
      guard?.Step();
      const line = lines[i]!;
      if (line < min) continue;
      if (max < line) break;
      for (const existing of other.get(line) ?? []) {
        guard?.Step();
        const a = perpendicular(existing.From),
          b = perpendicular(existing.To);
        if (a < b) {
          if (axis < a) break;
          if (b < axis) continue;
        } else {
          if (axis < b) break;
          if (a < axis) continue;
        }
        if (!edge.sharePoints(existing)) return true;
      }
    }
    return false;
  }
  overlappingEdgesChecked(
    edge: OVGEdge,
    guard: OVGEdgeSetBudget | null,
  ): OVGEdge[] {
    const maybe = edge.isVertical()
        ? this.verticalEdges.get(edge.From.X)
        : edge.isHorizontal()
          ? this.horizontalEdges.get(edge.From.Y)
          : undefined,
      result: OVGEdge[] = [];
    for (const existing of maybe ?? []) {
      guard?.Step();
      if (
        intersects(
          edge.From.Point,
          edge.To.Point,
          existing.From.Point,
          existing.To.Point,
        )
      )
        result.push(existing);
    }
    return result;
  }
}
