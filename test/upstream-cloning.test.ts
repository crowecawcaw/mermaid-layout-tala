import { build } from './helpers/upstream-graph.js';
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
