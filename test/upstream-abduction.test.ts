import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-abduction.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import type { EdgeAbduction } from '../src/upstream/layoutgraph/records.js';
import { CopyEntitiesFrom } from '../src/upstream/layoutgraph/subgraphs.js';
import {
  AbductEdges,
  ApplyEdgeAbductions,
  RestoreEdgeAbductions,
} from '../src/upstream/layoutgraph/edge-abduction.js';
it.each(fixtures)(
  'matches Go container edge abduction, view restore and reapplication $trial',
  (f) => {
    const g = new Graph(),
      all: Node[] = [];
    for (const r of f.nodes) {
      const n = g.AddNode(new Node(BigInt(r.id), 60, 40));
      all.push(n);
      g.AddNodeToContainer(r.parent ? all[r.parent - 1]! : null, n);
    }
    for (const [a, b] of f.edges) {
      const e = g.Connect(all[a! - 1]!, all[b! - 1]!);
      e.ID = BigInt(g.Edges.length);
    }
    const container = f.container ? all[f.container - 1]! : null,
      view = new Graph();
    CopyEntitiesFrom(view, g);
    for (const n of g.Containers.get(container) ?? []) view.AddNodeUnchecked(n);
    const abs = AbductEdges(g, container, view),
      id = (n: Node | null) => Number(n?.ID ?? 0n);
    const capture = (remaining: EdgeAbduction[]) => ({
      edges: g.Edges.map((e) => [Number(e.ID), id(e.From), id(e.To)]),
      incidence: Object.fromEntries(
        all.map((n) => [String(n.ID), n.Edges.map((e) => Number(e.ID))]),
      ),
      abductions: abs.map((a) => [
        Number(a.Edge.ID),
        id(a.OriginallyFrom),
        id(a.OriginallyTo),
        id(a.CurrentFrom),
        id(a.CurrentTo),
      ]),
      remaining: remaining.map((a) => Number(a.Edge.ID)),
      viewEdges: view.Edges.map((e) => Number(e.ID)),
    });
    const abducted = capture([]),
      restoredView = capture(RestoreEdgeAbductions(view, abs));
    ApplyEdgeAbductions(abs);
    const applied = capture([]),
      restored = capture(RestoreEdgeAbductions(g, abs));
    expect({ abducted, restoredView, applied, restored }).toEqual(f.expected);
  },
);
