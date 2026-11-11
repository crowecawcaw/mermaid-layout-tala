import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-engineupstreamcorpus.json';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label, type EdgeAbduction, type Tree } from '../src/upstream/layoutgraph/records.js';
import { FromString, String as labelPositionString } from '../src/upstream/label/label.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Layout } from '../src/upstream/engine/pipeline.js';

it.each(fixtures)('matches pinned upstream engine graph $name', (fixture) => {
  const graph = new Graph();
  graph.CellSize = fixture.input.CellSize;
  const nodes = new Map<number, Node>();
  for (const input of fixture.input.nodes) {
    const node = new Node(BigInt(input.id), input.width, input.height);
    node.TopLeft = input.topLeft ? new Point(input.topLeft.x, input.topLeft.y) : null;
    if ('fixedTopLeft' in input && input.fixedTopLeft) node.FixedTopLeft = new Point(input.fixedTopLeft.x, input.fixedTopLeft.y);
    if ('desiredWidth' in input) node.DesiredWidth = input.desiredWidth ?? null;
    if ('desiredHeight' in input) node.DesiredHeight = input.desiredHeight ?? null;
    if ('isInvisible' in input) node.IsInvisible = input.isInvisible ?? false;
    if ('is3D' in input) node.Is3D = input.is3D ?? false;
    if ('isMultiple' in input) node.IsMultiple = input.isMultiple ?? false;
    if ('forceHierarchy' in input) node.ForceHierarchy = input.forceHierarchy ?? false;
    node.FontSize = input.fontSize ?? null;
    node.D2ID = 'd2id' in input ? input.d2id ?? null : null;
    node.SetShape(input.shapeType);
    if ('numColumns' in input) node.SetNumColumns(input.numColumns ?? 0);
    if ('label' in input && input.label) {
      node.Label = new Label();
      node.Label.Text = input.label.Text;
      node.Label.Position = FromString(input.label.Position);
      node.Label.Width = input.label.Width;
      node.Label.Height = input.label.Height;
    }
    if ('icon' in input && input.icon) {
      node.InitIcon();
      node.Icon!.Position = FromString(input.icon.Position);
    }
    graph.AddNodeUnchecked(node);
    nodes.set(input.id, node);
  }
  for (const [container, children] of Object.entries(fixture.input.containers)) {
    const parent = container === '0' ? null : nodes.get(Number(container))!;
    for (const child of children) graph.AddNodeToContainer(parent, nodes.get(child)!);
  }
  for (const input of fixture.input.nodes) {
    if ('nears' in input)
      for (const near of input.nears ?? []) nodes.get(input.id)!.AddNear(nodes.get(near)!);
  }
  for (const input of fixture.input.edges) {
    const edge = graph.Connect(nodes.get(input.from)!, nodes.get(input.to)!);
    edge.ID = BigInt(input.id);
    edge.SourceArrowhead = input.sourceArrowhead;
    edge.TargetArrowhead = input.targetArrowhead;
    if ('isInvisible' in input) edge.IsInvisible = input.isInvisible ?? false;
    if ('style' in input && input.style) {
      const style = input.style as Record<string, { value: string } | undefined>;
      for (const [key, destination] of [['stroke', 'Stroke'], ['strokeDash', 'StrokeDash'], ['animated', 'Animated']] as const)
        if (style[key]) edge.Style[destination] = { Value: style[key]!.value };
    }
    if ('minWidth' in input) edge.MinWidth = input.minWidth ?? 0;
    if ('minHeight' in input) edge.MinHeight = input.minHeight ?? 0;
    if ('labelPercentage' in input) edge.LabelPercentage = input.labelPercentage ?? 0;
    if ('fromTableColumnIndex' in input) edge.FromTableColumnIndex = input.fromTableColumnIndex ?? null;
    if ('toTableColumnIndex' in input) edge.ToTableColumnIndex = input.toTableColumnIndex ?? null;
    if ('label' in input && input.label) {
      edge.Label = new Label();
      edge.Label.Text = input.label.Text;
      edge.Label.Position = FromString(input.label.Position);
      edge.Label.Width = input.label.Width;
      edge.Label.Height = input.label.Height;
    }
    for (const [key, destination] of [['sourceArrowheadLabel', 'SourceArrowheadLabel'], ['targetArrowheadLabel', 'TargetArrowheadLabel']] as const) {
      if (key in input && input[key]) {
        const value = input[key];
        const label = new Label();
        label.Text = value.Text;
        label.Position = FromString(value.Position);
        label.Width = value.Width;
        label.Height = value.Height;
        edge[destination] = label;
      }
    }
    edge.Points = input.points.map((point: { x: number; y: number }) => new Point(point.x, point.y));
  }
  const result = Layout(Background, graph, { Seed: BigInt(fixture.seed) });
  const id = (node: Node | null) => String(node?.ID ?? 0n);
  const containers = Object.fromEntries([...result.Containers].map(([parent, children]) =>
    [id(parent), children.map(id)]));
  const hubs = Object.fromEntries([...result.Hubs].map(([hub, spokes]) =>
    [id(hub), spokes.map(id)]));
  const abductions = (values: EdgeAbduction[]) => values.map((value) => ({
    edge: String(value.Edge.ID), originallyFrom: id(value.OriginallyFrom), originallyTo: id(value.OriginallyTo),
    currentFrom: id(value.CurrentFrom), currentTo: id(value.CurrentTo),
  }));
  const clusters = Object.fromEntries([...result.Clusters].map(([vessel, cluster]) => [id(vessel), {
    nodes: cluster.Nodes.map(id), arrangement: cluster.Arrangement, desiredArrangement: cluster.DesiredArrangement,
    container: id(cluster.Container), abductions: abductions(cluster.EdgeAbductions), padding: cluster.Padding, fixedSize: cluster.FixedSize,
  }]));
  const sequences = Object.fromEntries([...result.Sequences].map(([vessel, sequence]) => [id(vessel), {
    nodes: sequence.Nodes.map(id), container: id(sequence.Container), abductions: abductions(sequence.EdgeAbductions),
  }]));
  const tree = (value: Tree): unknown => ({ node: id(value.Node), edge: String(value.SentinelEdge?.ID ?? 0n),
    orientation: value.Orientation, children: value.Children.map(tree) });
  const trees = Object.fromEntries([...result.Trees].map(([parent, roots]) => [id(parent), roots.map(tree)]));
  const directionName = (direction: Orientation) => ({
    [Orientation.Top]: 'up', [Orientation.Bottom]: 'down', [Orientation.Left]: 'left', [Orientation.Right]: 'right',
  }[direction] ?? '');
  const directions = Object.fromEntries([...result.Directions].map(([node, direction]) => [id(node), directionName(direction)]));
  const seenHierarchies = new Set();
  const hierarchies = [];
  for (const node of result.Nodes) {
    if (!node.Hierarchy || seenHierarchies.has(node.Hierarchy)) continue;
    seenHierarchies.add(node.Hierarchy);
    hierarchies.push({ Levels: Object.fromEntries([...node.Hierarchy.Levels()].map(([member, level]) => [String(member.ID), level])) });
  }
  const { clusterVessels, sequenceVessels, costs, ...expectedStructure } = fixture.structure;
  expect({ cellSize: result.CellSize, containers, hubs, clusters, sequences, trees, directions,
    isRootHierarchy: result.IsRootHierarchy, hierarchies: hierarchies.length ? hierarchies : null }).toEqual(expectedStructure);
  [result.crossingCost, result.turnCost, result.nonCenterPortCost].forEach((value, i) =>
    expect(Math.abs(value - costs[i]!)).toBeLessThanOrEqual(1e-7));
  for (const [actual, expected] of [[result.Clusters, clusterVessels], [result.Sequences, sequenceVessels]] as const) {
    expect([...actual.keys()].map(id).sort()).toEqual(Object.keys(expected).sort());
    for (const vessel of actual.keys()) {
      const record = expected[id(vessel) as keyof typeof expected];
      expect(record).toBeDefined();
      expect(Math.abs(vessel.Width - record.width)).toBeLessThanOrEqual(1e-7);
      expect(Math.abs(vessel.Height - record.height)).toBeLessThanOrEqual(1e-7);
      if (record.topLeft) {
        expect(vessel.TopLeft).not.toBeNull();
        expect(Math.abs(vessel.TopLeft!.X - record.topLeft.x)).toBeLessThanOrEqual(1e-7);
        expect(Math.abs(vessel.TopLeft!.Y - record.topLeft.y)).toBeLessThanOrEqual(1e-7);
      } else expect(vessel.TopLeft).toBeNull();
      expect({ shapeType: vessel.ShapeType(), fontSize: vessel.FontSize, isInvisible: vessel.IsInvisible,
        is3D: vessel.Is3D, isMultiple: vessel.IsMultiple, forceHierarchy: vessel.ForceHierarchy }).toEqual({
        shapeType: record.shapeType, fontSize: record.fontSize, isInvisible: record.isInvisible,
        is3D: record.is3D, isMultiple: record.isMultiple, forceHierarchy: record.forceHierarchy,
      });
    }
  }
  expect(result.Nodes).toHaveLength(fixture.nodes.length);
  expect(result.Edges).toHaveLength(fixture.edges.length);
  expect(result.Nodes.map((node) => Number(node.ID))).toEqual(fixture.nodes.map((node) => node.id));
  expect(result.Edges.map((edge) => Number(edge.ID))).toEqual(fixture.edges.map((edge) => edge.id));
  const resultNodes = new Map(result.Nodes.map((node) => [Number(node.ID), node]));
  const resultEdges = new Map(result.Edges.map((edge) => [Number(edge.ID), edge]));
  for (const expected of fixture.nodes) {
    const node = resultNodes.get(expected.id)!;
    expect(node).toBeDefined();
    expect({ d2id: node.D2ID, fontSize: node.FontSize, shapeType: node.ShapeType(), numColumns: node.NumColumns(),
      isInvisible: node.IsInvisible, is3D: node.Is3D, isMultiple: node.IsMultiple,
      forceHierarchy: node.ForceHierarchy, isContainer: node.IsContainer(), nears: node.orderedNears().map(id) }).toEqual({
      d2id: expected.d2id, fontSize: expected.fontSize, shapeType: expected.shapeType, numColumns: expected.numColumns,
      isInvisible: expected.isInvisible, is3D: expected.is3D, isMultiple: expected.isMultiple,
      forceHierarchy: expected.forceHierarchy, isContainer: expected.isContainer, nears: expected.nears,
    });
    for (const [actual, value] of [[node.TopLeft!.X, expected.x], [node.TopLeft!.Y, expected.y],
      [node.Width, expected.width], [node.Height, expected.height]])
      expect(Math.abs(actual! - value!)).toBeLessThanOrEqual(1e-7);
    if ('fixedTopLeft' in expected && expected.fixedTopLeft) {
      expect(node.FixedTopLeft).not.toBeNull();
      expect(Math.abs(node.FixedTopLeft!.X - expected.fixedTopLeft.x)).toBeLessThanOrEqual(1e-7);
      expect(Math.abs(node.FixedTopLeft!.Y - expected.fixedTopLeft.y)).toBeLessThanOrEqual(1e-7);
    } else expect(node.FixedTopLeft).toBeNull();
    if ('label' in expected && expected.label) {
      expect(node.Label).not.toBeNull();
      expect(node.Label!.Text).toBe(expected.label.text);
      expect(labelPositionString(node.Label!.Position)).toBe(expected.label.position);
      expect(node.Label!.Width).toBe(expected.label.width);
      expect(node.Label!.Height).toBe(expected.label.height);
    } else expect(node.Label).toBeNull();
    if ('iconPosition' in expected) expect(labelPositionString(node.Icon!.Position)).toBe(expected.iconPosition);
  }
  for (const expected of fixture.edges) {
    const edge = resultEdges.get(expected.id)!;
    expect(edge).toBeDefined();
    const style: Record<string, string> = {};
    for (const [key, value] of [['stroke', edge.Style.Stroke], ['strokeDash', edge.Style.StrokeDash], ['animated', edge.Style.Animated]] as const)
      if (value) style[key] = value.Value;
    expect(style).toEqual('style' in expected ? expected.style : {});
    for (const [key, actual] of [['sourceArrowheadLabel', edge.SourceArrowheadLabel], ['targetArrowheadLabel', edge.TargetArrowheadLabel]] as const) {
      if (key in expected && expected[key]) {
        const value = expected[key];
        expect(actual).not.toBeNull();
        expect({ text: actual!.Text, position: labelPositionString(actual!.Position), width: actual!.Width, height: actual!.Height }).toEqual(value);
      } else expect(actual).toBeNull();
    }
    expect({ d2id: edge.D2ID, from: Number(edge.From.ID), to: Number(edge.To.ID), sourceArrowhead: edge.SourceArrowhead,
      targetArrowhead: edge.TargetArrowhead, minWidth: edge.MinWidth, minHeight: edge.MinHeight,
      fromTableColumnIndex: edge.FromTableColumnIndex, toTableColumnIndex: edge.ToTableColumnIndex, isInvisible: edge.IsInvisible }).toEqual({
      d2id: expected.d2id, from: expected.from, to: expected.to, sourceArrowhead: expected.sourceArrowhead,
      targetArrowhead: expected.targetArrowhead, minWidth: expected.minWidth, minHeight: expected.minHeight,
      fromTableColumnIndex: expected.fromTableColumnIndex, toTableColumnIndex: expected.toTableColumnIndex, isInvisible: expected.isInvisible,
    });
    expect(edge.IsCurve).toBe(expected.isCurve);
    if ('label' in expected && expected.label) {
      expect(edge.Label).not.toBeNull();
      expect(edge.Label!.Text).toBe(expected.label.text);
      expect(labelPositionString(edge.Label!.Position)).toBe(expected.label.position);
      expect(edge.Label!.Width).toBe(expected.label.width);
      expect(edge.Label!.Height).toBe(expected.label.height);
      expect(Math.abs(edge.LabelPercentage - expected.label.percentage)).toBeLessThanOrEqual(1e-7);
    } else expect(edge.Label).toBeNull();
    expect(edge.Points).toHaveLength(expected.points.length);
    for (let i = 0; i < expected.points.length; i++) {
      expect(Math.abs(edge.Points[i]!.X - expected.points[i]!.x)).toBeLessThanOrEqual(1e-7);
      expect(Math.abs(edge.Points[i]!.Y - expected.points[i]!.y)).toBeLessThanOrEqual(1e-7);
    }
  }
}, 300_000);
