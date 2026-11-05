import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-hierarchysifting.json';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Hierarchy } from '../src/upstream/layoutgraph/records.js';
import { globalSifting } from '../src/upstream/hierarchy/sifting.js';
import {
  createPlacementNodes,
  connectPlacementNodes,
  groupPlacementNodesByLevel,
  initializeRanks,
  breakLongConnections,
} from '../src/upstream/hierarchy/placement-nodes.js';
it.each(fixtures)('matches Go hierarchy sifting $trial', (f) => {
  const g = new Graph(),
    h = new Hierarchy(),
    nodes: Node[] = [];
  for (let i = 0; i < 6; i++) {
    const n = new Node(BigInt(i + 1), 40, 30);
    n.TopLeft = new Point(i * 100, 0);
    g.AddNewNodeToContainer(null, n);
    nodes.push(n);
    n.Hierarchy = h;
    h.Levels().set(n, i % 2);
  }
  h.LevelCount = 2;
  const pairs = [
    [0, 5],
    [2, 3],
    [4, 1],
    [0, 3],
  ];
  if (f.trial % 2 === 0) pairs.push([2, 5]);
  if (f.trial % 3 === 0) pairs.push([4, 3]);
  for (const p of pairs) g.Connect(nodes[p[0]!]!, nodes[p[1]!]!);
  const placement = createPlacementNodes(g, g.Nodes, null);
  connectPlacementNodes(g, placement);
  const byLevel = groupPlacementNodesByLevel(placement);
  initializeRanks(byLevel);
  const dummies = breakLongConnections(placement, byLevel),
    records: object[] = [];
  globalSifting(byLevel);
  for (let i = 0; i < byLevel.size; i++)
    for (const pn of byLevel.get(i) ?? []) {
      const ids = (s: Set<typeof pn>) =>
        [...s].map((n) => Number(n.graphNode!.ID)).sort((a, b) => a - b);
      records.push({
        id: Number(pn.graphNode!.ID),
        level: pn.level,
        rank: pn.rank,
        dummy: pn.isDummy,
        above: ids(pn.aboves),
        below: ids(pn.belows),
      });
    }
  expect({ dummyCount: dummies.length, records }).toEqual({
    dummyCount: f.dummyCount,
    records: f.records,
  });
});
