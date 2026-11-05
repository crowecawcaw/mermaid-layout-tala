import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingedgeset.json';
import { Point } from '../src/upstream/geo/point.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import { OVGEdge } from '../src/upstream/routing/ovg-edge.js';
import { OVGEdgeSet } from '../src/upstream/routing/ovg-edge-set.js';
it.each(fixtures)('matches Go indexed visibility edges $trial', (f) => {
  const trial = f.trial,
    set = new OVGEdgeSet(),
    guard = {
      used: 0n,
      Step() {
        this.used++;
      },
      Add(n: bigint) {
        this.used += n;
      },
      Check() {},
    };
  const nodes = Array.from({ length: 40 }, (_, i) => {
    const n = new OVGNode(
      new Point(
        (((i * 7 + trial) % 13) - 6) * 10,
        (((i * 11 + trial * 3) % 11) - 5) * 10,
      ),
    );
    n.Index = i;
    return n;
  });
  for (let i = 0; i < 30; i++) {
    const a = nodes[i]!,
      b = new OVGNode(new Point(a.X, a.Y));
    b.Index = 40 + i;
    if (i % 3 === 0) b.X += ((i % 5) - 2) * 10;
    else b.Y += ((i % 7) - 3) * 10;
    const e = new OVGEdge(a, b);
    e.Distance = i % 3;
    set.addGuarded(e, guard);
    if (i % 4 === 0) set.addGuarded(e, guard);
  }
  const results = [];
  for (let i = 0; i < 40; i++) {
    const a = nodes[i]!,
      b = new OVGNode(new Point(a.X, a.Y));
    b.Index = 100 + i;
    if (i % 2 === 0) b.X += ((i % 9) - 4) * 10;
    else b.Y += ((i % 9) - 4) * 10;
    const e = new OVGEdge(a, b),
      cross = set.intersectsWithChecked(e, guard),
      overlap = set.overlappingEdgesChecked(e, guard).map((x) => x.From.Index);
    results.push({ cross, overlap });
  }
  expect(results).toEqual(f.results);
  expect(guard.used).toBe(BigInt(f.used));
});
