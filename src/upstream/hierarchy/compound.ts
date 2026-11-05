// Translated from internal/hierarchy/compound.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Random } from '../limits/optimization.js';
import { MaxGraphSize, type WorkGuard } from '../limits/work.js';
import { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import { Hierarchy, Label } from '../layoutgraph/records.js';
import { GraphState, RollbackGraphState } from '../layoutgraph/graph-state.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
import { EnsureTransactionWorkGuard } from '../layoutgraph/transaction.js';
import { BoundingBox } from '../graphbounds/bounds.js';
import { Orientation as O, IsHorizontal } from '../geo/orientation.js';
import { Point } from '../geo/point.js';
import { TableColumnPortValue } from '../nodeshape/shape_table.js';
import { Candidates } from './eligibility.js';
import { build } from './build.js';
import { countEdgeDirection } from './validity.js';
import { Place } from './place.js';
export interface CompoundBlock {
  original: Node;
  proxy: Node;
  members: Node[];
}
export interface CompoundInterface {
  from: CompoundBlock;
  to: CompoundBlock;
  fromOffset: Point;
  toOffset: Point;
}
export function compoundEndpointOffset(
  endpoint: Node,
  block: Node,
  column: number | null,
): Point {
  let center = endpoint.Center();
  if (column !== null) {
    const [port, ok] = TableColumnPortValue(endpoint.Shape, O.Right, column);
    if (ok) center = port;
  }
  return new Point(
    Math.max(0, Math.min(block.Width, center.X - block.TopLeft!.X)),
    Math.max(0, Math.min(block.Height, center.Y - block.TopLeft!.Y)),
  );
}
export function compoundConnected(
  blocks: CompoundBlock[],
  interfaces: CompoundInterface[],
): boolean {
  const adjacent = new Map<CompoundBlock, CompoundBlock[]>();
  for (const edge of interfaces) {
    const a = adjacent.get(edge.from) ?? [];
    a.push(edge.to);
    adjacent.set(edge.from, a);
    const b = adjacent.get(edge.to) ?? [];
    b.push(edge.from);
    adjacent.set(edge.to, b);
  }
  const seen = new Set([blocks[0]!]),
    queue = [blocks[0]!];
  for (let i = 0; i < queue.length; i++)
    for (const next of adjacent.get(queue[i]!) ?? [])
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  return seen.size === blocks.length;
}
export function compoundInterfaceScore(
  interfaces: CompoundInterface[],
  horizontal: boolean,
  guard: WorkGuard,
): { crossings: number; span: number } {
  const score = { crossings: 0, span: 0 },
    segments: { a: Point; b: Point }[] = [];
  for (const edge of interfaces) {
    guard.Step();
    const from = edge.from.proxy,
      to = edge.to.proxy,
      a = new Point(
        from.TopLeft!.X + edge.fromOffset.X,
        from.TopLeft!.Y + edge.fromOffset.Y,
      ),
      b = new Point(
        to.TopLeft!.X + edge.toOffset.X,
        to.TopLeft!.Y + edge.toOffset.Y,
      );
    if (horizontal) {
      if (from.Center().X < to.Center().X) {
        a.X = from.TopLeft!.X + from.Width;
        b.X = to.TopLeft!.X;
      } else {
        a.X = from.TopLeft!.X;
        b.X = to.TopLeft!.X + to.Width;
      }
      score.span += Math.abs(a.Y - b.Y);
    } else {
      if (from.Center().Y < to.Center().Y) {
        a.Y = from.TopLeft!.Y + from.Height;
        b.Y = to.TopLeft!.Y;
      } else {
        a.Y = from.TopLeft!.Y;
        b.Y = to.TopLeft!.Y + to.Height;
      }
      score.span += Math.abs(a.X - b.X);
    }
    segments.push({ a, b });
  }
  const orientation = (a: Point, b: Point, c: Point) =>
    (b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X);
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      guard.Step();
      const a = segments[i]!,
        b = segments[j]!;
      if (
        orientation(a.a, a.b, b.a) * orientation(a.a, a.b, b.b) < 0 &&
        orientation(b.a, b.b, a.a) * orientation(b.a, b.b, a.b) < 0
      )
        score.crossings++;
    }
  return score;
}
export function orderCompoundInterfaces(
  blocks: CompoundBlock[],
  interfaces: CompoundInterface[],
  horizontal: boolean,
  guard: WorkGuard,
): void {
  const levels = new Map<number, CompoundBlock[]>();
  for (const block of blocks) {
    const level = block.proxy.Hierarchy!.Levels().get(block.proxy) ?? 0,
      list = levels.get(level) ?? [];
    list.push(block);
    levels.set(level, list);
  }
  const coord = (b: CompoundBlock) =>
    horizontal ? b.proxy.TopLeft!.Y : b.proxy.TopLeft!.X;
  const size = (b: CompoundBlock) =>
    horizontal ? b.proxy.Height : b.proxy.Width;
  const set = (b: CompoundBlock, n: number) => {
    if (horizontal) b.proxy.TopLeft!.Y = n;
    else b.proxy.TopLeft!.X = n;
  };
  for (let level = 0; level < blocks[0]!.proxy.Hierarchy!.LevelCount; level++) {
    const row = levels.get(level) ?? [];
    row.sort((a, b) => coord(a) - coord(b));
    levels.set(level, row);
  }
  let score = compoundInterfaceScore(interfaces, horizontal, guard);
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (
      let level = 0;
      level < blocks[0]!.proxy.Hierarchy!.LevelCount;
      level++
    ) {
      const row = levels.get(level)!;
      for (let i = 0; i + 1 < row.length; i++) {
        guard.Step();
        const a = row[i]!,
          b = row[i + 1]!,
          oldA = coord(a),
          oldB = coord(b);
        set(a, oldB + size(b) - size(a));
        set(b, oldA);
        const candidate = compoundInterfaceScore(interfaces, horizontal, guard);
        if (
          candidate.crossings < score.crossings ||
          (candidate.crossings === score.crossings &&
            candidate.span < score.span)
        ) {
          score = candidate;
          [row[i], row[i + 1]] = [b, a];
          changed = true;
        } else {
          set(a, oldA);
          set(b, oldB);
        }
      }
    }
    if (!changed) break;
  }
  guard.Finish();
}
export function PlaceCompound(
  ctx: Context,
  g: Graph,
  random: Random | null,
): boolean {
  validateEngineGraph(ctx, 'PlaceCompound', g);
  const roots = g.Containers.get(null) ?? [];
  if (roots.length < 3 || roots.length > 64) return false;
  let guard: WorkGuard;
  [ctx, guard] = EnsureTransactionWorkGuard(ctx, 'PlaceCompoundTransactions');
  const proxy = new Graph();
  proxy.Directions.set(null, g.Direction(null));
  const blocks: CompoundBlock[] = [],
    byRoot = new Map<Node, CompoundBlock>();
  for (const root of roots) {
    guard.Step();
    const n = new Node(root.ID, root.Width, root.Height);
    n.TopLeft = root.TopLeft!.Copy();
    proxy.AddNewNodeToContainer(null, n);
    const block = { original: root, proxy: n, members: [] };
    blocks.push(block);
    byRoot.set(root, block);
  }
  const owner = new Map<Node, CompoundBlock>();
  for (const node of g.Nodes) {
    guard.Step();
    if (node.FixedTopLeft || g.Sequences.has(node) || node.isClusterVessel)
      return false;
    let root = node;
    while (root.Container) {
      guard.Step();
      root = root.Container;
    }
    const block = byRoot.get(root);
    if (!block) return false;
    block.members.push(node);
    owner.set(node, block);
  }
  for (const node of g.NodeToTree.keys()) {
    guard.Step();
    if (!owner.has(node)) return false;
  }
  const interfaces: CompoundInterface[] = [];
  let detailed = false;
  for (const edge of g.Edges) {
    guard.Step();
    const from = owner.get(edge.From),
      to = owner.get(edge.To);
    if (!from || !to) return false;
    if (from === to) {
      detailed =
        detailed || (from.original.isContainer && edge.From !== edge.To);
      continue;
    }
    if (interfaces.length === 256) return false;
    const e = proxy.Connect(from.proxy, to.proxy);
    e.ID = edge.ID;
    e.SourceArrowhead = edge.SourceArrowhead;
    e.TargetArrowhead = edge.TargetArrowhead;
    if (edge.Label) e.Label = Object.assign(new Label(), edge.Label);
    interfaces.push({
      from,
      to,
      fromOffset: compoundEndpointOffset(
        edge.From,
        from.original,
        edge.FromTableColumnIndex,
      ),
      toOffset: compoundEndpointOffset(
        edge.To,
        to.original,
        edge.ToTableColumnIndex,
      ),
    });
  }
  if (!detailed || !compoundConnected(blocks, interfaces)) return false;
  const hierarchy = build(ctx, proxy, true, Candidates(proxy), []);
  if (!hierarchy) return false;
  const [forward, other] = countEdgeDirection(hierarchy, proxy);
  if (hierarchy.LevelCount < 2 || forward === 0 || forward < 1.5 * other)
    return false;
  for (const node of proxy.Nodes) {
    guard.Step();
    node.Hierarchy = hierarchy;
  }
  Place(ctx, proxy, null, random);
  orderCompoundInterfaces(
    blocks,
    interfaces,
    IsHorizontal(proxy.Direction(null)),
    guard,
  );
  const work = { Step() {}, Finish() {} },
    [tl, br] = BoundingBox(proxy.Nodes, work);
  if (br.X - tl.X > MaxGraphSize || br.Y - tl.Y > MaxGraphSize) return false;
  const state = new GraphState({
    CaptureTopology: true,
    CaptureEdgeRoutes: true,
  });
  state.UpdateWithWorkGuard(g, guard);
  let complete = false;
  try {
    const [originalTL] = BoundingBox(roots, work),
      h = new Hierarchy();
    h.LevelCount = proxy.Nodes[0]!.Hierarchy!.LevelCount;
    for (const block of blocks) {
      guard.Step();
      const dx =
          block.proxy.TopLeft!.X -
          tl.X +
          originalTL.X -
          block.original.TopLeft!.X,
        dy =
          block.proxy.TopLeft!.Y -
          tl.Y +
          originalTL.Y -
          block.original.TopLeft!.Y;
      for (const member of block.members) {
        guard.Step();
        member.Translate(dx, dy);
      }
      block.original.Hierarchy?.Levels().delete(block.original);
      block.original.Hierarchy = h;
      h.Levels().set(
        block.original,
        block.proxy.Hierarchy!.Levels().get(block.proxy) ?? 0,
      );
    }
    guard.Finish();
    complete = true;
    return true;
  } finally {
    if (!complete) RollbackGraphState(g, state);
  }
}
