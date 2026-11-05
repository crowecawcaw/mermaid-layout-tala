// Translated OVG port index and aligned-owner scan from internal/routing/
// ovg_resource.go and ovg_node.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import type { Graph } from '../layoutgraph/graph.js';
import { passesThrough } from '../layoutgraph/node-spatial.js';
import type { OVGNode } from './ovg-node.js';
import type { OVG } from './ovg.js';
import type { OVGBuildGuard } from './ovg-resource.js';
function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}
export class OVGPortIndex {
  xByY = new Map<number, number[]>();
  yByX = new Map<number, number[]>();
  owners: Node[] = [];
  ownersByX = new Map<number, number[]>();
  ownersByY = new Map<number, number[]>();
  verticalBlockers = new Map<number, Node[]>();
  horizontalBlockers = new Map<number, Node[]>();
  constructor(
    ports: Map<Node, OVGNode[]>,
    graph: Graph | null,
    fixedOverlaps: Set<Node>,
    guard: OVGBuildGuard,
  ) {
    for (const [owner, nodePorts] of ports) {
      guard.Step();
      const index = this.owners.length;
      this.owners.push(owner);
      for (const port of nodePorts) {
        guard.Step();
        append(this.xByY, port.Y, port.X);
        append(this.yByX, port.X, port.Y);
        append(this.ownersByX, port.X, index);
        append(this.ownersByY, port.Y, index);
      }
    }
    for (const values of this.xByY.values()) {
      guard.reserveSortWork(values.length);
      values.sort((a, b) => a - b);
    }
    for (const values of this.yByX.values()) {
      guard.reserveSortWork(values.length);
      values.sort((a, b) => a - b);
    }
    if (graph) {
      for (const x of this.ownersByX.keys()) {
        guard.Step();
        for (const node of graph.Nodes) {
          guard.Step();
          if (
            !node ||
            !node.TopLeft ||
            node.IsContainer() ||
            fixedOverlaps.has(node)
          )
            continue;
          const left = Math.min(node.TopLeft.X, node.TopLeft.X + node.Width),
            right = Math.max(node.TopLeft.X, node.TopLeft.X + node.Width);
          if (left <= x && x <= right) append(this.verticalBlockers, x, node);
        }
      }
      for (const y of this.ownersByY.keys()) {
        guard.Step();
        for (const node of graph.Nodes) {
          guard.Step();
          if (
            !node ||
            !node.TopLeft ||
            node.IsContainer() ||
            fixedOverlaps.has(node)
          )
            continue;
          const top = Math.min(node.TopLeft.Y, node.TopLeft.Y + node.Height),
            bottom = Math.max(node.TopLeft.Y, node.TopLeft.Y + node.Height);
          if (top <= y && y <= bottom) append(this.horizontalBlockers, y, node);
        }
      }
    }
  }
  alignedOwners(x: number, y: number): OVGAlignedOwners {
    return new OVGAlignedOwners(
      this.ownersByX.get(x) ?? [],
      this.ownersByY.get(y) ?? [],
    );
  }
  tooClose(
    x: number,
    y: number,
    distance: number,
    guard: OVGBuildGuard,
  ): boolean {
    if (hasCoordinateWithin(this.xByY.get(y) ?? [], x, distance, guard))
      return true;
    return hasCoordinateWithin(this.yByX.get(x) ?? [], y, distance, guard);
  }
}
export class OVGAlignedOwners {
  private x = 0;
  private y = 0;
  constructor(
    private readonly byX: number[],
    private readonly byY: number[],
  ) {}
  hasAligned(): boolean {
    return this.byX.length > 0 || this.byY.length > 0;
  }
  next(guard: OVGBuildGuard): number | null {
    guard.Step();
    if (this.x >= this.byX.length && this.y >= this.byY.length) return null;
    const owner =
      this.y >= this.byY.length ||
      (this.x < this.byX.length && this.byX[this.x]! < this.byY[this.y]!)
        ? this.byX[this.x]!
        : this.byY[this.y]!;
    while (this.x < this.byX.length && this.byX[this.x] === owner) {
      guard.Step();
      this.x++;
    }
    while (this.y < this.byY.length && this.byY[this.y] === owner) {
      guard.Step();
      this.y++;
    }
    return owner;
  }
}
export function hasCoordinateWithin(
  values: number[],
  coordinate: number,
  distance: number,
  guard: OVGBuildGuard,
): boolean {
  let low = 0,
    high = values.length;
  const threshold = coordinate - distance;
  while (low < high) {
    guard.Step();
    const mid = Math.floor((low + high) / 2);
    if (values[mid]! < threshold) low = mid + 1;
    else high = mid;
  }
  guard.Check();
  return low < values.length && values[low]! <= coordinate + distance;
}
export function hasUnobstructedLineToPorts(
  node: OVGNode,
  ovg: OVG,
  index: OVGPortIndex,
  numNodes: number,
  guard: OVGBuildGuard,
): boolean {
  guard.Check();
  let count = 0;
  const aligned = index.alignedOwners(node.X, node.Y),
    hasAligned = aligned.hasAligned();
  for (;;) {
    const ownerIndex = aligned.next(guard);
    if (ownerIndex === null) break;
    const owner = index.owners[ownerIndex]!;
    for (const port of ovg.Ports.get(owner) ?? []) {
      guard.Step();
      if (port.X !== node.X && port.Y !== node.Y) continue;
      if (
        port.X === node.X &&
        (port.X === owner.TopLeft!.X ||
          port.X === owner.TopLeft!.X + owner.Width)
      )
        continue;
      if (
        port.Y === node.Y &&
        (port.Y === owner.TopLeft!.Y ||
          port.Y === owner.TopLeft!.Y + owner.Height)
      )
        continue;
      let direct = true;
      const blockers =
        port.X === node.X
          ? index.verticalBlockers.get(port.X)
          : index.horizontalBlockers.get(port.Y);
      for (const other of blockers ?? []) {
        guard.Step();
        if (owner === other || owner.IsInvisible) continue;
        if (
          owner.Sequence &&
          other.Sequence &&
          owner.Sequence === other.Sequence
        )
          continue;
        if (passesThrough(other, port.Point, node.Point)) {
          direct = false;
          break;
        }
      }
      if (direct) {
        count++;
        if (count === numNodes) return true;
        break;
      }
    }
  }
  guard.Check();
  return !hasAligned;
}
