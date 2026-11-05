// Translated slingshot geometry from internal/routing/slingshot.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Orientation as O } from '../geo/orientation.js';
import type { Node } from '../layoutgraph/node.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import type { OVGNode } from './ovg-node.js';
import type { OVG } from './ovg.js';
export function findLaunchings(
  ovg: OVG,
  vertical: boolean,
  orientation: O,
  source: Node,
): OVGNode[] | null {
  let d = O.NONE;
  switch (orientation) {
    case O.TopLeft:
      d = vertical ? O.Bottom : O.Right;
      break;
    case O.TopRight:
      d = vertical ? O.Bottom : O.Left;
      break;
    case O.BottomLeft:
      d = vertical ? O.Top : O.Right;
      break;
    case O.BottomRight:
      d = vertical ? O.Top : O.Left;
      break;
  }
  if (d === O.NONE) return null;
  const out: OVGNode[] = [],
    seen = new Set<OVGNode>();
  for (const p of ovg.Ports.get(source) ?? []) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (p.hasPortDirection(source, d)) out.push(p);
  }
  return out.length ? out : null;
}
export function findLandings(
  ovg: OVG,
  vertical: boolean,
  orientation: O,
  target: Node,
): OVGNode[] | null {
  let d = O.NONE;
  switch (orientation) {
    case O.TopLeft:
      d = vertical ? O.Left : O.Top;
      break;
    case O.TopRight:
      d = vertical ? O.Right : O.Top;
      break;
    case O.BottomLeft:
      d = vertical ? O.Left : O.Bottom;
      break;
    case O.BottomRight:
      d = vertical ? O.Right : O.Bottom;
      break;
  }
  if (d === O.NONE) return null;
  const out: OVGNode[] = [],
    seen = new Set<OVGNode>();
  for (const p of ovg.Ports.get(target) ?? []) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (p.hasPortDirection(target, d)) out.push(p);
  }
  return out.length ? out : null;
}
export function undershot(
  n: OVGNode,
  target: Node,
  o: O,
  vertical: boolean,
): boolean {
  switch (o) {
    case O.TopLeft:
      return vertical ? n.Y < target.TopLeft!.Y : n.X < target.TopLeft!.X;
    case O.TopRight:
      return vertical
        ? n.Y < target.TopLeft!.Y
        : n.X > target.TopLeft!.X + target.Width;
    case O.BottomLeft:
      return vertical
        ? n.Y > target.TopLeft!.Y + target.Height
        : n.X < target.TopLeft!.X;
    case O.BottomRight:
      return vertical
        ? n.Y > target.TopLeft!.Y + target.Height
        : n.X > target.TopLeft!.X + target.Width;
    default:
      return false;
  }
}
export function overshot(
  n: OVGNode,
  target: Node,
  o: O,
  vertical: boolean,
  forL: boolean,
): boolean {
  switch (o) {
    case O.TopLeft:
      return vertical
        ? n.Y > (forL ? target.TopLeft!.Y + target.Height : target.TopLeft!.Y)
        : n.X > (forL ? target.TopLeft!.X + target.Width : target.TopLeft!.X);
    case O.TopRight:
      return vertical
        ? n.Y > (forL ? target.TopLeft!.Y + target.Height : target.TopLeft!.Y)
        : n.X < (forL ? target.TopLeft!.X : target.TopLeft!.X + target.Width);
    case O.BottomLeft:
      return vertical
        ? n.Y < (forL ? target.TopLeft!.Y : target.TopLeft!.Y + target.Height)
        : n.X > (forL ? target.TopLeft!.X + target.Width : target.TopLeft!.X);
    case O.BottomRight:
      return vertical
        ? n.Y < (forL ? target.TopLeft!.Y : target.TopLeft!.Y + target.Height)
        : n.X < (forL ? target.TopLeft!.X : target.TopLeft!.X + target.Width);
    default:
      return false;
  }
}
export function isOnFlightPlan(
  prev: OVGNode,
  next: OVGNode,
  o: O,
  vertical: boolean,
): boolean {
  switch (o) {
    case O.TopLeft:
      return vertical
        ? next.X === prev.X && next.Y > prev.Y
        : next.Y === prev.Y && next.X > prev.X;
    case O.TopRight:
      return vertical
        ? next.X === prev.X && next.Y > prev.Y
        : next.Y === prev.Y && next.X < prev.X;
    case O.BottomLeft:
      return vertical
        ? next.X === prev.X && next.Y < prev.Y
        : next.Y === prev.Y && next.X > prev.X;
    case O.BottomRight:
      return vertical
        ? next.X === prev.X && next.Y < prev.Y
        : next.Y === prev.Y && next.X < prev.X;
    default:
      return false;
  }
}
export function preferLaunchingVertically(
  source: Node,
  target: Node,
  o: O,
): [boolean, boolean] {
  let vs: O[] = [],
    vt: O[] = [],
    hs: O[] = [],
    ht: O[] = [];
  switch (o) {
    case O.TopLeft:
      vs = [O.BottomLeft, O.Bottom];
      vt = [O.Left, O.BottomLeft];
      hs = [O.TopRight, O.Right];
      ht = [O.Top, O.TopRight];
      break;
    case O.TopRight:
      vs = [O.BottomRight, O.Bottom];
      vt = [O.Right, O.BottomRight];
      hs = [O.TopLeft, O.Left];
      ht = [O.Top, O.TopLeft];
      break;
    case O.BottomLeft:
      vs = [O.TopLeft, O.Top];
      vt = [O.Left, O.TopLeft];
      hs = [O.BottomRight, O.Right];
      ht = [O.Bottom, O.BottomRight];
      break;
    case O.BottomRight:
      vs = [O.TopRight, O.Top];
      vt = [O.Right, O.TopRight];
      hs = [O.BottomLeft, O.Left];
      ht = [O.Bottom, O.BottomLeft];
      break;
  }
  let v = 0,
    h = 0;
  for (const e of source.Edges) {
    const adj = source.Adjacent(e);
    if (adj === target) continue;
    const dir = nodeOrientation(adj, source);
    if (dir === O.NONE) continue;
    if (vs.includes(dir)) v++;
    if (hs.includes(dir)) h++;
  }
  for (const e of target.Edges) {
    const adj = target.Adjacent(e);
    if (adj === source) continue;
    const dir = nodeOrientation(adj, target);
    if (dir === O.NONE) continue;
    if (vt.includes(dir)) v++;
    else if (ht.includes(dir)) h++;
  }
  return v === h ? [source.ID < target.ID, false] : [v < h, true];
}
export function fillPathGuarded(
  from: OVGNode,
  to: OVGNode,
  guard: { Step(): void },
): [OVGNode[] | null, boolean] {
  const out = [from];
  let current = from;
  for (;;) {
    guard.Step();
    const previous = current;
    for (const edge of current.Edges) {
      guard.Step();
      const adjacent = current.Adjacent(edge);
      let onPath = false;
      if (from.X === to.X && adjacent.X === current.X)
        onPath =
          (from.Y < to.Y && current.Y < adjacent.Y) ||
          (from.Y > to.Y && current.Y > adjacent.Y);
      else if (from.Y === to.Y && adjacent.Y === current.Y)
        onPath =
          (from.X < to.X && current.X < adjacent.X) ||
          (from.X > to.X && current.X > adjacent.X);
      if (onPath) {
        current = adjacent;
        break;
      }
    }
    if (current === previous) return [null, false];
    if (current === to) break;
    out.push(current);
  }
  return [out, true];
}
export class RouteChecker {
  private mem = new Map<OVGNode, Map<OVGNode, boolean>>();
  constructor(private compute: (from: OVGNode, to: OVGNode) => boolean) {}
  cacheCheck(from: OVGNode, to: OVGNode): [boolean, boolean] {
    const values = this.mem.get(from);
    return [values?.get(to) ?? false, values?.has(to) ?? false];
  }
  check(from: OVGNode, to: OVGNode): boolean {
    const [value, hit] = this.cacheCheck(from, to);
    if (hit) return value;
    let values = this.mem.get(from);
    if (!values) {
      values = new Map();
      this.mem.set(from, values);
    }
    try {
      const result = this.compute(from, to);
      values.set(to, result);
      return result;
    } catch (error) {
      values.set(to, false);
      throw error;
    }
  }
}
