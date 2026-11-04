import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-cloning.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Edge } from '../src/upstream/layoutgraph/edge.js';
import {
  GraphCloneState,
  copyEdgeStyle,
} from '../src/upstream/layoutgraph/clone.js';
import {
  Cluster,
  Sequence,
  Tree,
  Hierarchy,
  Label,
  Icon,
  EdgeStyle,
} from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Position } from '../src/upstream/label/label.js';
import { Background } from '../src/upstream/limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
function build(trial: number): Graph {
  const g = new Graph(),
    all: Node[] = [],
    count = 8 + (trial % 17);
  for (let j = 0; j < count; j++) {
    const n = new Node(BigInt(j + 1), 60 + j, 40 + j);
    n.TopLeft = new Point(j * 100, trial);
    n.Graph = g;
    n.SetShape(['Square', 'Diamond', 'Table', 'Cloud'][j % 4]!);
    n.SetNumColumns(j % 5);
    n.D2ID = `node-${j}`;
    n.FontSize = 12 + j;
    n.Label = Object.assign(new Label(), {
      Text: n.D2ID,
      Position: j % 37,
      Width: j + 20,
      Height: 12,
    });
    n.Label.FixPosition();
    n.Icon = Object.assign(new Icon(), {
      Position: Position.InsideMiddleCenter,
    });
    n.Icon.FixPosition();
    n.LoopOffsets.set(Orientation.Top, 5);
    n.Is3D = j % 2 === 0;
    n.IsMultiple = j % 3 === 0;
    n.ForceHierarchy = j % 4 === 0;
    all.push(n);
  }
  const active = trial % 2 === 0,
    cv = new Node(1000n, 80, 60),
    sv = new Node(1001n, 90, 70);
  if (active) {
    cv.Graph = g;
    sv.Graph = g;
  }
  cv.isClusterVessel = true;
  const cluster = Object.assign(new Cluster(), {
    Vessel: cv,
    Nodes: all.slice(4, 6),
    Graph: g,
    Padding: 7,
    FixedSize: trial % 3 === 0,
    Arrangement: 'Row',
    DesiredArrangement: 'Column',
  });
  const sequence = Object.assign(new Sequence(), {
    Vessel: sv,
    Nodes: all.slice(2, 4),
    Graph: g,
  });
  for (const n of cluster.Nodes) n.Cluster = cluster;
  for (const n of sequence.Nodes) n.Sequence = sequence;
  g.Clusters.set(cv, cluster);
  g.Sequences.set(sv, sequence);
  for (let j = 0; j < count; j++) {
    if (active && j >= 2 && j < 6) continue;
    g.Nodes.push(all[j]!);
  }
  if (active) g.Nodes.push(cv, sv);
  g.Containers.set(null, g.Nodes.slice());
  for (let j = 1; j < count; j++) {
    const e = g.Connect(all[j - 1]!, all[j]!);
    e.ID = BigInt(j);
    e.Points = [new Point(j, trial), new Point(j + 10, trial + 20)];
    e.Label = Object.assign(new Label(), {
      Text: 'edge',
      Position: Position.UnlockedMiddle,
      Width: 20,
      Height: 10,
    });
    e.Label.FixPosition();
    e.LabelPercentage = 0.3;
    e.TargetArrowhead = 'triangle';
    e.IsCurve = true;
    e.MinWidth = 30;
    e.MinHeight = 10;
  }
  cluster.EdgeAbductions = [
    {
      Edge: g.Edges[0]!,
      OriginallyFrom: all[0]!,
      OriginallyTo: all[1]!,
      CurrentFrom: cv,
      CurrentTo: all[1]!,
    },
  ];
  sequence.EdgeAbductions = [
    {
      Edge: g.Edges[1]!,
      OriginallyFrom: all[1]!,
      OriginallyTo: all[2]!,
      CurrentFrom: all[1]!,
      CurrentTo: sv,
    },
  ];
  all[0]!.AddNear(all[count - 1]!);
  g.Hubs.set(all[0]!, [all[1]!, all[count - 1]!]);
  const h = new Hierarchy();
  h.ReplaceLevels(
    new Map([
      [all[0]!, 0],
      [all[1]!, 1],
    ]),
  );
  h.LevelCount = 2;
  all[0]!.Hierarchy = h;
  all[1]!.Hierarchy = h;
  const tn = new Node(2000n, 30, 20);
  tn.TopLeft = new Point(1, 2);
  tn.Graph = g;
  const te = new Edge(all[0]!, tn);
  te.ID = 3000n;
  const tree = new Tree(tn);
  tree.SentinelEdge = te;
  tree.Orientation = Orientation.Left;
  const child = new Node(2001n, 35, 25);
  child.Graph = g;
  child.TopLeft = new Point(3, 4);
  const ce = new Edge(tn, child);
  ce.ID = 3001n;
  const ct = new Tree(child);
  ct.SentinelEdge = ce;
  ct.Parent = tree;
  ct.Orientation = Orientation.Right;
  tree.Children = [ct];
  tn.AddNear(all[0]!);
  g.Trees.set(all[0]!, [tree]);
  g.Directions.set(null, trial % 9);
  g.Directions.set(all[0]!, Orientation.Bottom);
  g.CellSize = 20 + trial;
  g.IsRootHierarchy = trial % 3 === 0;
  g.crossingCost = 3;
  g.turnCost = 4;
  g.nonCenterPortCost = 5;
  return g;
}
function run(source: Graph): GraphCloneState {
  const state = new GraphCloneState(
    source,
    new Graph(),
    new WorkGuard(Background, 'clone fixture', MaxEngineWorkUnits),
  );
  state.copy();
  return state;
}
function snapshot(state: GraphCloneState): unknown {
  const cloned = state.clone,
    id = (n: Node | null) => Number(n?.ID ?? 0n),
    ids = (nodes: Node[]) => nodes.map(id);
  const nodes: Record<string, unknown> = {},
    edges: Record<string, unknown> = {},
    containers: Record<string, unknown> = {},
    directions: Record<string, unknown> = {};
  for (const [nid, n] of state.nodesByID) {
    const levels: Record<string, number> = {};
    for (const [m, l] of n.Hierarchy?.Levels() ?? []) levels[String(m.ID)] = l;
    nodes[String(nid)] = {
      position: n.TopLeft,
      width: n.Width,
      height: n.Height,
      owner: n.Graph === cloned,
      shape: n.ShapeType(),
      columns: n.NumColumns(),
      container: id(n.Container),
      cluster: id(n.Cluster?.Vessel ?? null),
      sequence: id(n.Sequence?.Vessel ?? null),
      incidence: n.Edges.map((e) => Number(e.ID)),
      nears: ids(n.orderedNears()),
      label: n.Label
        ? [
            n.Label.Text,
            n.Label.Position,
            n.Label.Width,
            n.Label.Height,
            n.Label.PositionFixed(),
          ]
        : null,
      icon: n.Icon ? [n.Icon.Position, n.Icon.PositionFixed()] : null,
      levels,
      loopOffsets: n.LoopOffsets.size,
      is3D: n.Is3D,
      isMultiple: n.IsMultiple,
      forceHierarchy: n.ForceHierarchy,
      vessel: n.isClusterVessel,
      d2id: n.D2ID,
      fontSize: n.FontSize,
    };
  }
  for (const [eid, e] of state.edgesByID)
    edges[String(eid)] = {
      from: id(e.From),
      to: id(e.To),
      points: e.Points,
      curve: e.IsCurve,
      percentage: e.LabelPercentage,
      minWidth: e.MinWidth,
      minHeight: e.MinHeight,
      target: e.TargetArrowhead,
    };
  for (const [c, ns] of cloned.Containers) containers[String(id(c))] = ids(ns);
  for (const [c, d] of cloned.Directions) directions[String(id(c))] = d;
  const trees: Record<string, unknown> = {};
  for (const [n, tr] of cloned.NodeToTree)
    trees[String(n.ID)] = [
      Number(tr.Parent?.Node.ID ?? 0n),
      Number(tr.SentinelEdge!.ID),
      tr.Orientation,
    ];
  const abductions = [
    ...cloned.Clusters.get(state.nodesByID.get(1000n)!)!.EdgeAbductions,
    ...cloned.Sequences.get(state.nodesByID.get(1001n)!)!.EdgeAbductions,
  ].map((a) => [
    Number(a.Edge.ID),
    id(a.OriginallyFrom),
    id(a.OriginallyTo),
    id(a.CurrentFrom),
    id(a.CurrentTo),
  ]);
  return JSON.parse(
    JSON.stringify({
      nodes,
      edges,
      order: ids(cloned.Nodes),
      containers,
      directions,
      trees,
      abductions,
      work: String(state.guard.Used()),
      cell: cloned.CellSize,
      root: cloned.IsRootHierarchy,
      costs: [cloned.crossingCost, cloned.turnCost, cloned.nonCenterPortCost],
    }),
  );
}
describe('direct upstream graph clone copy stage', () => {
  it.each(fixtures)(
    'matches Go ownership, state and work for trial $trial',
    (f) => {
      const source = build(f.trial),
        state = run(source);
      expect(snapshot(state)).toEqual(f.expected);
      for (const [original, copy] of state.nodesBySource) {
        expect(copy).not.toBe(original);
        expect(copy.Box).not.toBe(original.Box);
        if (copy.TopLeft) expect(copy.TopLeft).not.toBe(original.TopLeft);
        if (copy.Label) expect(copy.Label).not.toBe(original.Label);
      }
      for (const [original, copy] of state.edgesBySource) {
        expect(copy).not.toBe(original);
        expect(copy.Points).not.toBe(original.Points);
        for (let i = 0; i < copy.Points.length; i++)
          expect(copy.Points[i]).not.toBe(original.Points[i]);
      }
    },
  );
  it('copies every style scalar independently', () => {
    const style = new EdgeStyle();
    for (const key of Object.keys(style) as (keyof EdgeStyle)[])
      style[key] = { Value: key };
    const copy = copyEdgeStyle(style);
    expect(copy).toEqual(style);
    for (const key of Object.keys(style) as (keyof EdgeStyle)[])
      expect(copy[key]).not.toBe(style[key]);
  });
  it('rejects distinct full node records sharing an ID', () => {
    const source = build(1);
    source.Nodes.push(new Node(1n, 40, 30));
    expect(() => run(source)).toThrow('cannot clone duplicate node ID 1');
  });
  it('rejects a duplicate edge record', () => {
    const source = build(1);
    source.Edges.push(source.Edges[0]!);
    expect(() => run(source)).toThrow('cannot clone duplicate edge record 1');
  });
});
