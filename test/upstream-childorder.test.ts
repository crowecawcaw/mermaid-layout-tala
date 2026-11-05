import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-childorder.json';
import { compare } from './helpers/compare.js';
import { Background, WithCancel } from '../src/upstream/limits/context.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Edge } from '../src/upstream/layoutgraph/edge.js';
import { PlaceChildrenOrder } from '../src/upstream/placement/child-order.js';
it.each(fixtures)('matches Go child placement order $trial', (f) => {
  const nodes = Array.from(
    { length: f.count },
    (_, i) => new Node(BigInt(i + 1), 20, 20),
  );
  const abductions = f.pairs.map(([a, b]) => ({
    Edge: new Edge(nodes[a!]!, nodes[b!]!),
    OriginallyFrom: null,
    OriginallyTo: null,
    CurrentFrom: nodes[a!]!,
    CurrentTo: nodes[b!]!,
  }));
  compare(
    PlaceChildrenOrder(Background, nodes, abductions).map((n) => Number(n.ID)),
    f.order,
  );
});
it('rejects duplicate children and respects cancellation', () => {
  const node = new Node(1n, 20, 20);
  expect(() => PlaceChildrenOrder(Background, [node, node], null)).toThrow(
    'duplicate child',
  );
  const [ctx, cancel] = WithCancel();
  cancel();
  expect(() => PlaceChildrenOrder(ctx, [node], null)).toThrow(
    'PlaceChildrenOrder: context canceled',
  );
});
