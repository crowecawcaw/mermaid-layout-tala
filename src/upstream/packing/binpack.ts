// Translated from internal/packing/binpack.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { Point } from '../geo/point.js';
import { Box } from '../geo/box.js';
import { Segment } from '../geo/segment.js';
import { MaxBinPackWorkUnits, type WorkGuard } from '../limits/work.js';
import { GraphState, RollbackGraphState } from '../layoutgraph/graph-state.js';
import { snapshotPointer } from '../layoutgraph/transaction-snapshot.js';
import {
  contextWithTransactionWorkGuard,
  NewTransaction,
} from '../layoutgraph/transaction.js';
import { IsCandidateRejection } from '../layoutgraph/errors.js';
import {
  allReachableNodesGuarded,
  reachableNodesGuarded,
} from '../layoutgraph/reachability.js';
import { allDescendantNodesGuarded } from '../layoutgraph/containment.js';
import { InnerBox } from '../layoutgraph/node-geometry.js';
import { covers } from '../layoutgraph/node-spatial.js';
import { isBadStateContext } from '../layoutgraph/bad-state.js';
import {
  BoundingBox,
  FixedBoundingBox,
  NodeBoundingBox,
} from '../graphbounds/bounds.js';
import {
  newWorkGuard,
  allEdgesHaveCompleteRoutesGuarded,
  binPackIsDescendantOf,
  binPackHasExternalConnection,
  binPackContainerTopLeft,
  binPackScoreGuarded,
  binPackSmallestDeltas,
  binPackHierarchyBoxes,
  binPackPointInHierarchy,
  binPackSyncClusters,
  binPackSyncSequences,
  binPackWrapChildren,
} from './guard.js';
import {
  placementCandidatesGuarded,
  estimateRouteSegments,
  routedEdgeSegments,
  blocksRoutesWithDeltasGuarded,
} from './candidates.js';
import {
  binPackCanUseRoutedContainerBox,
  RoutedContainerBoxDecision,
} from './routed-container.js';
export function Pack(ctx: Context, g: Graph, root: Node | null): void {
  packAtomic(ctx, g, root, newWorkGuard(ctx, MaxBinPackWorkUnits));
}
export function packAtomic(
  ctx: Context,
  g: Graph,
  root: Node | null,
  guard: WorkGuard,
): void {
  if (!guard) throw new Error('TALA BinPack requires a work guard');
  ctx = contextWithTransactionWorkGuard(ctx, guard);
  const state = new GraphState({
    CaptureTopology: false,
    CaptureEdgeRoutes: true,
  });
  state.UpdateWithWorkGuard(g, guard);
  let complete = false;
  try {
    packGuarded(ctx, g, root, guard);
    guard.Finish();
    complete = true;
  } finally {
    if (!complete) RollbackGraphState(g, state);
  }
}
export function packGuarded(
  ctx: Context,
  g: Graph,
  root: Node | null,
  guard: WorkGuard,
): void {
  guard.Step();
  const [edgesPlaced, graphIncidentEdges] = allEdgesHaveCompleteRoutesGuarded(
    g,
    root,
    guard,
  );
  for (const n of g.Containers.get(root) ?? []) {
    guard.Step();
    if (n.isContainer) packGuarded(ctx, g, n, guard);
  }
  const cross: Node[][] = [],
    containedGraphs: Node[][] = [],
    added = new Set<Node>(),
    fixed: Node[] = [],
    ignore = new Set<Node>();
  if (root) ignore.add(root);
  for (const n of g.Containers.get(root) ?? []) {
    guard.Step();
    if (!n.FixedTopLeft) continue;
    const reachable = allReachableNodesGuarded(
      n,
      true,
      true,
      false,
      ignore,
      guard,
    );
    for (const rn of reachable) {
      guard.Step();
      if (!added.has(rn)) fixed.push(rn);
      added.add(rn);
    }
  }
  let visitError: unknown = null;
  const shouldVisit = (n: Node): boolean => {
      if (visitError) return false;
      try {
        return root ? binPackIsDescendantOf(n, root, guard) : true;
      } catch (error) {
        visitError = error;
        return false;
      }
    },
    contained = new Set<Node>();
  for (const n of g.Containers.get(root) ?? []) {
    guard.Step();
    if (added.has(n)) continue;
    const reachable = reachableNodesGuarded(
      n,
      shouldVisit,
      true,
      true,
      false,
      ignore,
      guard,
    );
    if (visitError) throw visitError;
    let external = false;
    for (const rn of reachable) {
      guard.Step();
      if (
        rn.Hierarchy ||
        binPackHasExternalConnection(g, rn, root, false, edgesPlaced, guard) ||
        binPackHasExternalConnection(g, rn, root, true, false, guard)
      ) {
        external = true;
        break;
      }
    }
    if (!external) {
      for (const rn of reachable) {
        guard.Step();
        added.add(rn);
        contained.add(rn);
      }
      containedGraphs.push(reachable);
    }
  }
  for (const n of g.Containers.get(root) ?? []) {
    guard.Step();
    if (added.has(n)) continue;
    const filtered: Node[] = [];
    for (const rn of allReachableNodesGuarded(
      n,
      true,
      false,
      false,
      ignore,
      guard,
    )) {
      guard.Step();
      if (!contained.has(rn)) filtered.push(rn);
    }
    for (const rn of filtered) {
      guard.Step();
      added.add(rn);
    }
    cross.push(filtered);
  }
  if (!containedGraphs.length) {
    guard.Step();
    return;
  }
  let packed = cross,
    toPack = containedGraphs;
  if (fixed.length) packed.push(fixed);
  const rootTL = binPackContainerTopLeft(g, root, toPack[0]!, guard),
    originalScore = binPackScoreGuarded(
      g.Containers.get(root) ?? [],
      root,
      guard,
    );
  const originalPos = new Map<
      Node,
      ReturnType<typeof snapshotPointer<Point>>
    >(),
    posOrder: Node[] = [],
    originalRoute = new Map<Edge, Point[]>(),
    routeOrder: Edge[] = [];
  for (const nodes of toPack) {
    guard.Step();
    for (const n of nodes) {
      guard.Step();
      if (!originalPos.has(n)) {
        originalPos.set(n, snapshotPointer(n.TopLeft));
        posOrder.push(n);
      }
      n.Translate(100000, 100000);
      if (edgesPlaced)
        for (const e of n.Edges) {
          guard.Step();
          if (originalRoute.has(e)) continue;
          const route: Point[] = [];
          for (const p of e.Points) {
            guard.Step();
            route.push(p.Copy());
          }
          originalRoute.set(e, route);
          routeOrder.push(e);
        }
    }
  }
  const moveRoutes = (nodes: Node[]): void => {
    const moved = new Set<Edge>();
    for (const n of nodes) {
      guard.Step();
      for (const edge of n.Edges) {
        guard.Step();
        if (moved.has(edge)) continue;
        moved.add(edge);
        for (const p of edge.Points) {
          guard.Step();
          p.X += n.TopLeft!.X - originalPos.get(n)!.value!.X;
          p.Y += n.TopLeft!.Y - originalPos.get(n)!.value!.Y;
        }
      }
    }
  };
  if (!packed.length) {
    const [tl] = BoundingBox(toPack[0]!, guard),
      dx = rootTL.X - tl.X,
      dy = rootTL.Y - tl.Y;
    for (const n of toPack[0]!) {
      guard.Step();
      n.Translate(dx, dy);
    }
    if (edgesPlaced) moveRoutes(toPack[0]!);
    packed = [toPack[0]!];
    toPack = toPack.slice(1);
  }
  guard.Step();
  const packedRootChildren: Node[] = [],
    packedSegments: Segment[] = [];
  const appendSegments = (nodes: Node[], x: number, y: number): void => {
    if (edgesPlaced) {
      const edges: Edge[] = [],
        unique = new Set<Edge>();
      for (const n of nodes) {
        guard.Step();
        if (n === root || !binPackIsDescendantOf(n, root, guard)) continue;
        for (const e of n.Edges) {
          guard.Step();
          if (!unique.has(e)) {
            unique.add(e);
            edges.push(e);
          }
        }
      }
      const hs = routedEdgeSegments(edges, true, guard),
        vs = routedEdgeSegments(edges, false, guard);
      for (const s of [...hs, ...vs]) {
        guard.Step();
        packedSegments.push(new Segment(s.Start, s.End));
      }
    } else {
      const filtered: Node[] = [];
      for (const n of nodes) {
        guard.Step();
        if (n !== root && binPackIsDescendantOf(n, root, guard))
          filtered.push(n);
      }
      for (const s of estimateRouteSegments(filtered, g, x, y, guard)) {
        guard.Step();
        packedSegments.push(s);
      }
    }
  };
  if (edgesPlaced) {
    const all: Node[] = [];
    for (const nodes of packed) {
      guard.Step();
      for (const n of nodes) all.push(n);
    }
    appendSegments(all, Infinity, Infinity);
    for (const nodes of packed) {
      guard.Step();
      for (const n of nodes) {
        guard.Step();
        if (n.Container === root) packedRootChildren.push(n);
      }
    }
  } else
    for (const nodes of packed) {
      guard.Step();
      for (const n of nodes) {
        guard.Step();
        if (n.Container === root) packedRootChildren.push(n);
      }
      const [x, y] = binPackSmallestDeltas(toPack, guard);
      appendSegments(nodes, x, y);
    }
  let canLeft = true,
    canRight = true,
    canTop = true,
    canBottom = true;
  if (edgesPlaced && root)
    for (const e of root.Edges) {
      guard.Step();
      const p = e.From === root ? e.Points[0]! : e.Points[e.Points.length - 1]!,
        q = e.From === root ? e.Points[1]! : e.Points[e.Points.length - 2]!;
      if (p.Y === q.Y) {
        if (p.X < q.X) canRight = false;
        if (p.X > q.X) canLeft = false;
      } else if (p.X === q.X) {
        if (p.Y < q.Y) canBottom = false;
        if (p.Y > q.Y) canTop = false;
      } else {
        canLeft = canRight = canTop = canBottom = false;
        break;
      }
    }
  const pointKey = (p: Point) =>
      `${p.X === 0 ? 0 : p.X},${p.Y === 0 ? 0 : p.Y}`,
    occupied = new Set<string>();
  let failed = false;
  while (toPack.length) {
    guard.Step();
    const candidates: Point[] = [],
      keys = new Set<string>(),
      boxes = binPackHierarchyBoxes(packed, guard),
      add = (p: Point) => {
        const key = pointKey(p);
        if (!keys.has(key)) {
          keys.add(key);
          candidates.push(p);
        }
      };
    add(new Point(rootTL.X, rootTL.Y));
    let packedX = Infinity,
      packedY = Infinity;
    for (const nodes of packed) {
      guard.Step();
      const [tl] = BoundingBox(nodes, guard);
      packedX = Math.min(packedX, tl.X);
      packedY = Math.min(packedY, tl.Y);
      for (const p of placementCandidatesGuarded(
        nodes,
        root,
        !nodes[0]!.Hierarchy,
        edgesPlaced,
        guard,
      )) {
        guard.Step();
        if (
          occupied.has(pointKey(p)) ||
          binPackPointInHierarchy(boxes, p, guard)
        )
          continue;
        add(p);
      }
    }
    const curr = toPack[0]!;
    toPack = toPack.slice(1);
    const [tl, br] = FixedBoundingBox(curr, guard),
      width = br.X - tl.X,
      height = br.Y - tl.Y;
    if (canTop) candidates.push(new Point(packedX, packedY - height - 20));
    if (canLeft) candidates.push(new Point(packedX - width - 20, packedY));
    if (canTop && canLeft)
      candidates.push(new Point(packedX - width - 20, packedY - height - 20));
    const txn = NewTransaction(ctx, g, {
      AffectContainers: false,
      IgnoreContainerEscape: true,
      AffectEdgeRoutes: edgesPlaced,
    });
    const [currTL] = BoundingBox(curr, guard),
      packedWithCurr: Node[] = [];
    for (const node of packedRootChildren) {
      guard.Step();
      packedWithCurr.push(node);
    }
    for (const node of curr) {
      guard.Step();
      packedWithCurr.push(node);
    }
    for (const n of curr) {
      guard.Step();
      const p = originalPos.get(n)!.value!;
      add(new Point(p.X, p.Y));
    }
    const [xd, yd] = binPackSmallestDeltas(packed, guard);
    let best: Point | null = null,
      bestScore = Infinity;
    for (const p of candidates) {
      guard.Step();
      txn.Clear();
      txn.AddOp(() => {
        for (const n of curr) {
          guard.Step();
          n.Translate(p.X - currTL.X, p.Y - currTL.Y);
        }
      });
      try {
        txn.Commit(ctx);
      } catch (e) {
        if (IsCandidateRejection(e)) continue;
        guard.Step();
        throw e;
      }
      let reject = false;
      try {
        if (root) {
          const within: Node[] = [];
          for (const n of packedWithCurr) {
            guard.Step();
            if (n.Container === root) within.push(n);
          }
          const [a, b] = BoundingBox(within, guard),
            inner = InnerBox(root);
          if (b.X - a.X > inner.Width || b.Y - a.Y > inner.Height)
            reject = true;
        }
        if (!reject && !edgesPlaced)
          for (const n of curr) {
            const [a, b] = NodeBoundingBox(n, null, guard);
            const topLeftInside = binPackPointInHierarchy(boxes, a, guard);
            const bottomRightInside = binPackPointInHierarchy(boxes, b, guard);
            if (topLeftInside || bottomRightInside) {
              reject = true;
              break;
            }
          }
        if (
          !reject &&
          blocksRoutesWithDeltasGuarded(
            g,
            curr,
            packed,
            packedSegments,
            xd,
            yd,
            guard,
          )
        )
          reject = true;
        if (!reject) {
          const score = binPackScoreGuarded(packedWithCurr, root, guard);
          if (score < bestScore) {
            bestScore = score;
            best = p;
          }
        }
      } finally {
        txn.Rollback();
      }
    }
    guard.Step();
    if (!best) {
      failed = true;
      break;
    }
    const chosen: Point = best;
    txn.Clear();
    txn.AddOp(() => {
      for (const n of curr) {
        guard.Step();
        n.Translate(chosen.X - currTL.X, chosen.Y - currTL.Y);
      }
      if (edgesPlaced) moveRoutes(curr);
    });
    try {
      txn.Commit(ctx);
    } catch (e) {
      guard.Step();
      throw e;
    }
    occupied.add(pointKey(chosen));
    for (const n of curr) {
      guard.Step();
      packedRootChildren.push(n);
    }
    packed.push(curr);
    const [x, y] = binPackSmallestDeltas(toPack, guard);
    appendSegments(curr, x, y);
  }
  guard.Step();
  const after = failed
    ? Infinity
    : binPackScoreGuarded(g.Containers.get(root) ?? [], root, guard);
  if (originalScore < after) {
    for (const node of posOrder) {
      guard.Step();
      node.TopLeft = originalPos.get(node)!.restore();
    }
    binPackSyncClusters(g, guard);
    binPackSyncSequences(g, guard);
    failed = true;
  } else if (root && !root.Cluster) {
    for (const node of allDescendantNodesGuarded(g, root, true, guard)) {
      guard.Step();
      if (!originalPos.has(node)) {
        originalPos.set(node, snapshotPointer(node.TopLeft));
        posOrder.push(node);
      }
    }
    const x = root.TopLeft!.X,
      y = root.TopLeft!.Y,
      w = root.Width,
      h = root.Height,
      originalBox = new Box(new Point(x, y), w, h);
    binPackWrapChildren(root, guard);
    let handled = false;
    if (edgesPlaced) {
      const decision = binPackCanUseRoutedContainerBox(
        g,
        root,
        originalBox,
        graphIncidentEdges ?? [],
        guard,
      );
      switch (decision) {
        case RoutedContainerBoxDecision.DeferToSideConstraints:
          break;
        case RoutedContainerBoxDecision.UseProposedBox:
          handled = true;
          break;
        case RoutedContainerBoxDecision.KeepOriginalBox:
          handled = true;
          root.TopLeft!.X = x;
          root.TopLeft!.Y = y;
          root.Width = w;
          root.Height = h;
          break;
        default:
          throw new Error(
            'TALA BinPack received an invalid routed-container decision',
          );
      }
    }
    if (!handled) {
      if (!canLeft) root.TopLeft!.X = x;
      if (!canTop) root.TopLeft!.Y = y;
      if (!canRight) root.Width = w;
      if (!canBottom) root.Height = h;
      if (root.Shape.AspectRatio1())
        root.Width = root.Height = Math.max(root.Width, root.Height);
    }
    let childrenFit = true;
    const inner = InnerBox(root);
    for (const child of g.Containers.get(root) ?? []) {
      guard.Step();
      if (!covers(inner, child.Box)) {
        childrenFit = false;
        break;
      }
    }
    const bad = isBadStateContext(g, root, null, false, guard);
    if (!childrenFit || bad) {
      for (const node of posOrder) {
        guard.Step();
        node.TopLeft = originalPos.get(node)!.restore();
      }
      root.TopLeft!.X = x;
      root.TopLeft!.Y = y;
      root.Width = w;
      root.Height = h;
      failed = true;
    }
  }
  if (failed)
    for (const edge of routeOrder) {
      guard.Step();
      const route = originalRoute.get(edge)!;
      for (let i = 0; i < route.length; i++) {
        guard.Step();
        edge.Points[i]!.X = route[i]!.X;
        edge.Points[i]!.Y = route[i]!.Y;
      }
    }
  guard.Finish();
}
