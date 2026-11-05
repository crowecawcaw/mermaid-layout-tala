import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingbest.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import { RouteSearchWorkGuard } from '../src/upstream/routing/search-guard.js';
import { bestRoute } from '../src/upstream/routing/best-route.js';
it.each(fixtures)('matches Go best route reconstruction $trial $limit', (f) => {
  const trial = f.trial,
    a = new Node(1n, 20, 20),
    b = new Node(2n, 20, 20);
  a.TopLeft = new Point(0, 0);
  b.TopLeft = new Point(100, 100);
  const nodes = Array.from({ length: 9 }, (_, i) => {
      const n = new OVGNode(new Point((i % 3) * 50, Math.trunc(i / 3) * 50));
      n.Index = i;
      return n;
    }),
    contexts = nodes.map((_, i) => ({
      verticalDistance: (trial * 7 + i * 13) % 80,
      horizontalDistance: (trial * 11 + i * 17) % 80,
    }));
  const vertical = nodes.map((_, i) =>
      i > 0 && (i + trial) % 3 !== 0 ? nodes[(i - 1 + (trial % 2)) % 9]! : null,
    ),
    horizontal = nodes.map((_, i) =>
      i > 0 && (i + trial) % 4 !== 0 ? nodes[(i + 7 + (trial % 3)) % 9]! : null,
    ),
    guard = new RouteSearchWorkGuard(Background, 'Default', BigInt(f.limit));
  let ids: number[] | null = null,
    error = '';
  try {
    ids = bestRoute(
      Background,
      a,
      b,
      nodes[0]!,
      nodes[8]!,
      contexts,
      vertical,
      horizontal,
      trial % 20,
      guard,
    ).map((n) => n.Index);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toBe(f.error);
  expect(guard.Used()).toBe(BigInt(f.used));
  expect(ids).toEqual(f.ids);
});
