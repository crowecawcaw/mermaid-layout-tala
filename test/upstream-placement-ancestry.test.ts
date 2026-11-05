import { expect, it } from 'vitest';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  containerLevel,
  nearestSharedAncestor,
} from '../src/upstream/layoutgraph/placement-ancestry.js';

it('finds the closest common container at unequal nesting depths', () => {
  const root = new Node(1n, 1, 1),
    left = new Node(2n, 1, 1),
    deep = new Node(3n, 1, 1),
    right = new Node(4n, 1, 1),
    a = new Node(5n, 1, 1),
    b = new Node(6n, 1, 1);
  left.Container = root;
  deep.Container = left;
  right.Container = root;
  a.Container = deep;
  b.Container = right;
  expect(containerLevel(a)).toBe(4);
  expect(nearestSharedAncestor(a, b)).toBe(root);
  expect(nearestSharedAncestor(a, deep)).toBe(left);
  expect(nearestSharedAncestor(a, root)).toBeNull();
});
