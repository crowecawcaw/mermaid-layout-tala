import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-overlaps.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import { Background } from '../src/upstream/limits/context.js';
import { buildTransactionOverlapsWithReferenceLimit } from '../src/upstream/layoutgraph/transaction-overlaps.js';
it.each(fixtures)(
  'matches Go transaction overlap inventory, limits and work for trial $trial',
  (f) => {
    const g = new Graph(),
      all = f.nodes.map((r, j) => {
        const n = new Node(BigInt(j + 1), r.box.Width, r.box.Height);
        n.TopLeft = r.box.TopLeft
          ? new Point(r.box.TopLeft.x, r.box.TopLeft.y)
          : null;
        n.Graph = g;
        if (r.table) n.SetShape('Table');
        n.margin = {
          top: r.margin[0]!,
          right: r.margin[1]!,
          bottom: r.margin[2]!,
          left: r.margin[3]!,
        };
        n.LoopOffsets = new Map([
          [Orientation.Top, r.loops[0]!],
          [Orientation.Right, r.loops[1]!],
        ]);
        return n;
      });
    g.Nodes = all.slice();
    for (const [a, b, width, height] of f.edges) {
      const e = g.Connect(all[a!]!, all[b!]!);
      e.MinWidth = width!;
      e.MinHeight = height!;
    }
    if (f.trial % 7 === 0) g.Nodes.push(all[0]!);
    if (f.trial % 11 === 0) all[0]!.Edges = [];
    const guard = new WorkGuard(
      Background,
      'overlap fixture',
      MaxEngineWorkUnits,
    );
    let overlaps: Map<Node, Set<Node>> | null = null,
      exact: Map<Node, Set<Node>> | null = null,
      error = '';
    try {
      [overlaps, exact] = buildTransactionOverlapsWithReferenceLimit(
        g,
        guard,
        BigInt(f.limit),
      );
    } catch (e) {
      error = (e as Error).message;
    }
    const encode = (m: Map<Node, Set<Node>> | null) =>
      m === null
        ? null
        : Object.fromEntries(
            [...m].map(([n, others]) => [
              String(n.ID),
              [...others].map((o) => Number(o.ID)).sort((a, b) => a - b),
            ]),
          );
    expect({
      overlaps: encode(overlaps),
      exact: encode(exact),
      error,
      work: String(guard.Used()),
    }).toEqual(f.expected);
  },
);
