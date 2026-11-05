import { expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  restoreNodePositions,
  roundToNearestCellSize,
  snapshotNodePositionsContext,
} from '../src/upstream/placement/types.js';

it('restores original point identities and values for nested nodes', () => {
  const graph = new Graph(),
    parent = new Node(1n, 10, 10),
    child = new Node(2n, 10, 10);
  graph.AddNewNodeToContainer(null, parent);
  graph.AddNewNodeToContainer(parent, child);
  const p = new Point(2, 3),
    q = new Point(4, 5);
  parent.TopLeft = p;
  child.TopLeft = q;
  const snapshots = snapshotNodePositionsContext(Background, 'test', [
    parent,
    child,
  ]);
  p.X = 30;
  q.Y = 40;
  parent.TopLeft = new Point(1, 1);
  child.TopLeft = null;
  restoreNodePositions(snapshots);
  expect(parent.TopLeft).toBe(p);
  expect(child.TopLeft).toBe(q);
  expect([p.X, p.Y, q.X, q.Y]).toEqual([2, 3, 4, 5]);
  expect(roundToNearestCellSize(-15, 10)).toBe(-20);
});
