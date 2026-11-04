import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-proximity.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  HerdAssignment,
  type EdgeAbduction,
} from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation as O } from '../src/upstream/geo/orientation.js';
import { Background } from '../src/upstream/limits/context.js';
import { AddHubs } from '../src/upstream/proximity/hubs.js';
import { CommonUncleSiblings } from '../src/upstream/proximity/common-uncle.js';
import {
  AssignNears,
  assignNearsWithWorkLimit,
  sortByID,
} from '../src/upstream/proximity/nears.js';
import {
  AssignHerds,
  GroupSheep,
  SyncHerdFences,
  ApplyVirally,
  connectedHerds,
} from '../src/upstream/proximity/herding.js';
function build(trial: number) {
  const g = new Graph(),
    all: Node[] = [];
  for (let j = 0; j < 20; j++) {
    const n = g.AddNode(new Node(BigInt(j + 1), 60, 40));
    all.push(n);
    let parent: Node | null = null;
    if ((j >= 3 && j <= 8) || j === 17) parent = all[0]!;
    else if (j >= 9 && j <= 12) parent = all[1]!;
    else if (j >= 13 && j <= 16) parent = all[2]!;
    else if (j >= 18) parent = all[17]!;
    g.AddNodeToContainer(parent, n);
    n.TopLeft = new Point(j * 100, (j % 3) * 100);
  }
  all[1]!.Width = 80 + (trial % 4) * 80;
  all[1]!.Height = 120;
  all[2]!.Width = 90;
  all[2]!.Height = 60 + (trial % 4) * 90;
  for (let j = 9; j <= 16; j++) {
    if (trial % 5 !== 0) {
      const h = new HerdAssignment();
      h.Orientation = [O.Top, O.Right, O.Bottom, O.Left][
        (trial + Math.trunc(j / 4)) % 4
      ]!;
      if (trial % 3 === 0) h.oppositeSidePaired.add(all[0]!);
      all[j]!.HerdAssignment = h;
    }
    if (trial % 7 === 0) all[j]!.TopLeft = null;
  }
  const add = (a: number, b: number) => {
    const e = g.Connect(all[a]!, all[b]!);
    e.ID = BigInt(g.Edges.length);
    return e;
  };
  add(3, 4);
  add(3, 5);
  add(4, 6);
  if (trial % 3 === 0) add(3, 7);
  const abductions: EdgeAbduction[] = [];
  for (let j = 0; j < 10 + (trial % 9); j++) {
    let a = 3 + ((j * 3 + trial) % 6);
    if (j % 7 === 0) a = 18 + (j % 2);
    const b = 9 + ((j * 5 + trial) % 8),
      e = add(a, b),
      uncle = all[b >= 13 ? 2 : 1]!;
    const ab: EdgeAbduction = {
      Edge: e,
      OriginallyFrom: all[a]!,
      OriginallyTo: all[b]!,
      CurrentFrom: all[0]!,
      CurrentTo: uncle,
    };
    if (j % 2 === 1) {
      [ab.OriginallyFrom, ab.OriginallyTo] = [
        ab.OriginallyTo,
        ab.OriginallyFrom,
      ];
      [ab.CurrentFrom, ab.CurrentTo] = [ab.CurrentTo, ab.CurrentFrom];
    }
    abductions.push(ab);
  }
  add(3, 1);
  add(5, 1);
  add(6, 2);
  add(7, 2);
  add(8, 2);
  return { g, all, abductions };
}
it.each(fixtures)(
  'matches all Go proximity stages on compound graph $trial',
  (f) => {
    const { g, all, abductions } = build(f.trial);
    AddHubs(Background, g);
    AssignNears(Background, g, all[0]!, abductions);
    const ids = (ns: Node[]) => ns.map((n) => Number(n.ID)),
      maps = (m: Map<Node, Node[]>) =>
        Object.fromEntries([...m].map(([n, ns]) => [String(n.ID), ids(ns)]));
    const common = maps(CommonUncleSiblings(g)),
      nears = Object.fromEntries(
        all.map((n) => [String(n.ID), ids(sortByID([...n.Nears]))]),
      );
    const [grouped, cousins] = GroupSheep(Background, g, all[0]!, abductions);
    const cousinIDs = Object.fromEntries(
      [...cousins].map(([n, byNode]) => [String(n.ID), maps(byNode)]),
    );
    AssignHerds(Background, g, all[0]!, abductions);
    all.forEach((n, j) => {
      if (n.TopLeft === null) n.TopLeft = new Point(j * 100, (j % 3) * 100);
    });
    SyncHerdFences(g);
    const herds = Object.fromEntries(
      all
        .filter((n) => n.HerdAssignment !== null)
        .map((n) => [
          String(n.ID),
          {
            orientation: n.HerdAssignment!.Orientation,
            val: n.HerdAssignment!.Val,
            same: n.HerdAssignment!.sameSidePaired.size,
            opposite: n.HerdAssignment!.oppositeSidePaired.size,
          },
        ]),
    );
    expect({
      hubs: maps(g.Hubs),
      nears,
      common,
      grouped: maps(grouped),
      cousins: cousinIDs,
      herds,
    }).toEqual(f.expected);
  },
);
it('keeps original near sets across work-limit failures and commit cancellation', () => {
  for (const limit of [1n, 20n, 100n, 200n]) {
    const { g, all, abductions } = build(3),
      sets = all.map((n) => n.Nears);
    let failed = false;
    try {
      assignNearsWithWorkLimit(Background, g, all[0]!, abductions, limit);
    } catch {
      failed = true;
      all.forEach((n, j) => expect(n.Nears).toBe(sets[j]));
    }
    expect(failed).toBe(true);
  }
  const { g, all, abductions } = build(3),
    sets = all.map((n) => n.Nears),
    error = new Error('cancel near publication');
  let changed = false;
  const ctx = {
    Done: () => ({
      get closed() {
        return (changed = all.some((n, j) => n.Nears !== sets[j]));
      },
    }),
    Err: () => (changed ? error : null),
  };
  expect(() => AssignNears(ctx, g, all[0]!, abductions)).toThrow(
    'cancel near publication',
  );
  all.forEach((n, j) => expect(n.Nears).toBe(sets[j]));
});
it('propagates independent herd records and preserves connected-component order', () => {
  const nodes = Array.from(
      { length: 6 },
      (_, j) => new Node(BigInt(j), 10, 10),
    ),
    [a, b, c, d, u, v] = nodes;
  const groups = new Map([
    [u!, [a!, b!]],
    [v!, [b!, c!, d!]],
  ]);
  a!.HerdAssignment = new HerdAssignment();
  a!.HerdAssignment.Orientation = O.Left;
  a!.HerdAssignment.sameSidePaired.add(u!);
  ApplyVirally(Background, [v!, u!], groups);
  expect(connectedHerds(Background, [v!, u!], groups)).toEqual([
    { uncles: [v, u], nodes: [b, c, d, a] },
  ]);
  for (const n of [b!, c!, d!]) {
    expect(n.HerdAssignment!.Orientation).toBe(O.Left);
    expect(n.HerdAssignment).not.toBe(a!.HerdAssignment);
    expect(n.HerdAssignment!.sameSidePaired).not.toBe(
      a!.HerdAssignment!.sameSidePaired,
    );
  }
  d!.HerdAssignment!.Orientation = O.Right;
  expect(() => ApplyVirally(Background, [v!, u!], groups)).toThrow(
    'herd orientation',
  );
});
