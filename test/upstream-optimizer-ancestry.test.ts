import { expect, it } from 'vitest';
import { Background } from '../src/upstream/limits/context.js';
import { OptimizationWorkGuard } from '../src/upstream/limits/optimization.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Tree } from '../src/upstream/layoutgraph/records.js';
import {
  optimizerIsDescendantOf,
  optimizerOrderedNears,
  optimizerTreeRoot,
} from '../src/upstream/placement/optimizer-ancestry.js';

it('charges ancestry traversal, orders nears and detects cycles', () => {
  const guard = new OptimizationWorkGuard(Background, 'test', 1000n);
  const root = new Node(1n, 1, 1),
    child = new Node(2n, 1, 1),
    far = new Node(3n, 1, 1);
  child.Container = root;
  expect(optimizerIsDescendantOf(child, root, guard)).toBe(true);
  expect(guard.Used()).toBe(2n);
  child.Nears.add(far);
  child.Nears.add(root);
  expect(optimizerOrderedNears(child, guard)).toEqual([root, far]);
  const a = new Tree(root),
    b = new Tree(child);
  a.Parent = b;
  b.Parent = a;
  expect(() => optimizerTreeRoot(a, guard)).toThrow('cycle in tree ancestry');
  root.Container = child;
  expect(() => optimizerIsDescendantOf(child, far, guard)).toThrow(
    'cycle in node ancestry',
  );
});
