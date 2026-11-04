import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-transaction.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import {
  WorkGuard,
  MaxTransactionWorkUnits,
} from '../src/upstream/limits/work.js';
import {
  Background,
  WithCancel,
  Canceled,
} from '../src/upstream/limits/context.js';
import {
  NewTransaction,
  EnsureTransactionWorkGuard,
  ExistingTransactionWorkGuard,
} from '../src/upstream/layoutgraph/transaction.js';
import {
  ErrInvalidCandidate,
  ErrNonImprovingCandidate,
  IsCandidateRejection,
} from '../src/upstream/layoutgraph/errors.js';
import {
  SnapshotPlacementCosts,
  StoreEdgeLengthCost,
  LookupEdgeLengthCost,
} from '../src/upstream/layoutgraph/placement-cost.js';
function build(trial: number) {
  const g = new Graph(),
    all: Node[] = [],
    count = 4 + (trial % 16);
  for (let j = 0; j < count; j++) {
    const n = new Node(BigInt(j + 1), 20 + (j % 5), 20 + (j % 7));
    n.TopLeft = new Point(j * 400, 0);
    g.AddNewNodeToContainer(null, n);
    all.push(n);
  }
  if (trial % 3 === 0) {
    all[0]!.Width = 900;
    all[0]!.Height = 300;
    all[1]!.TopLeft = new Point(100, 100);
    all[2]!.TopLeft = new Point(500, 100);
    g.Containers.set(null, [all[0]!, ...all.slice(3)]);
    g.Containers.set(all[0]!, all.slice(1, 3));
    all[0]!.isContainer = true;
    all[1]!.Container = all[0]!;
    all[2]!.Container = all[0]!;
  }
  if (trial % 9 === 0)
    all[count - 1]!.FixedTopLeft = all[count - 1]!.TopLeft!.Copy();
  for (let j = 1; j < count; j++) {
    const e = g.Connect(all[j - 1]!, all[j]!);
    e.ID = BigInt(j);
    e.Points = [all[j - 1]!.TopLeft!.Copy(), all[j]!.TopLeft!.Copy()];
  }
  const options = {
    AffectContainers: trial % 6 === 0,
    IgnoreContainerEscape: trial % 7 === 0,
    AffectEdgeRoutes: trial % 2 === 0,
  };
  return { g, all, options };
}
it.each(fixtures)(
  'matches Go repeated transaction outcomes, rollback and work for trial $trial',
  (f) => {
    const { g, all, options } = build(f.trial),
      guard = new WorkGuard(
        Background,
        'transaction fixture',
        MaxTransactionWorkUnits,
      ),
      txn = NewTransaction(Background, g, options, guard);
    expect(String(guard.Used())).toBe(f.constructionWork);
    for (const attempt of f.attempts) {
      txn.Clear();
      txn.AddOp(() => {
        all[attempt.index]!.Translate(attempt.dx, attempt.dy);
        all[attempt.index]!.Width += attempt.widthDelta;
      });
      let message = '';
      try {
        txn.Commit(Background);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe(attempt.error);
      expect(JSON.parse(JSON.stringify(all.map((n) => n.Box.Copy())))).toEqual(
        attempt.committed,
      );
      if (attempt.updated) txn.UpdateState();
      else txn.Rollback();
      expect(JSON.parse(JSON.stringify(all.map((n) => n.Box.Copy())))).toEqual(
        attempt.restored,
      );
      if(attempt.work!=='')expect(String(guard.Used())).toBe(attempt.work);
    }
  },
);
it('shares a request guard and preserves independent geometry rollback points', () => {
  const [ctx, guard] = EnsureTransactionWorkGuard(Background, 'outer');
  expect(ExistingTransactionWorkGuard(ctx, 'inner')).toEqual([guard, true]);
  expect(EnsureTransactionWorkGuard(ctx, 'inner')).toEqual([ctx, guard]);
  const { g, all, options } = build(1),
    txn = NewTransaction(ctx, g, options, guard),
    prior = txn.PreservePriorGraphState(),
    clone = txn.CloneGeometryContext();
  clone.AddOp(() => all[0]!.Translate(10, 10));
  clone.Commit(ctx);
  clone.UpdateState();
  expect(clone.PriorGraphState).not.toBe(prior);
  expect(txn.PriorGraphState).toBe(prior);
  txn.Rollback();
  expect(all[0]!.TopLeft).toEqual(new Point(0, 0));
  clone.Rollback();
  expect(all[0]!.TopLeft).toEqual(new Point(10, 10));
});
it('rolls back mutations on operation exceptions and cancellation', () => {
  for (const canceled of [false, true]) {
    const { g, all, options } = build(1),
      txn = NewTransaction(Background, g, options),
      original = all[0]!.TopLeft!,
      [ctx, cancel] = WithCancel();
    const failure = new Error('operation failed');
    txn.AddOp(() => {
      all[0]!.Translate(50, 50);
      if (canceled) cancel();
      else throw failure;
    });
    expect(() => txn.Commit(ctx)).toThrow(canceled ? Canceled : failure);
    expect(all[0]!.TopLeft).toBe(original);
    expect(original).toEqual(new Point(0, 0));
  }
});
it('restores placement costs separately from speculative geometry rollback', () => {
  const { g, options } = build(1);
  StoreEdgeLengthCost(g, 1n, 5);
  g.crossingCost = 3;
  const cache = g.edgeLengthCache,
    txn = NewTransaction(Background, g, options);
  txn.CapturePlacementCosts('fixture');
  StoreEdgeLengthCost(g, 1n, 9);
  g.crossingCost = 8;
  txn.Rollback();
  expect(LookupEdgeLengthCost(g, 1n)).toEqual([9, true]);
  expect(txn.RestorePlacementCosts()).toBe(true);
  expect(g.edgeLengthCache).toBe(cache);
  expect(LookupEdgeLengthCost(g, 1n)).toEqual([5, true]);
  expect(g.crossingCost).toBe(3);
  expect(txn.RestorePlacementCosts()).toBe(false);
  g.edgeLengthCache = null;
  const snapshot = SnapshotPlacementCosts(g);
  g.edgeLengthCache = new Map();
  snapshot.Restore();
  expect(g.edgeLengthCache).toBeNull();
});
it('classifies only candidate rejection errors, including wrapped causes', () => {
  expect(IsCandidateRejection(ErrInvalidCandidate)).toBe(true);
  expect(
    IsCandidateRejection(
      new Error('wrapped', { cause: ErrNonImprovingCandidate }),
    ),
  ).toBe(true);
  expect(IsCandidateRejection(Canceled)).toBe(false);
});
