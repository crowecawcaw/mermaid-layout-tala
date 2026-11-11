import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-engineupstreamcorpus.json';
import { Background } from '../src/upstream/limits/context.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { FromString, String as labelPositionString } from '../src/upstream/label/label.js';
import { Point } from '../src/upstream/geo/point.js';
import { Layout } from '../src/upstream/engine/pipeline.js';

it.each(fixtures)('matches pinned upstream engine graph $name', (fixture) => {
  const graph = new Graph();
  graph.CellSize = fixture.input.CellSize;
  const nodes = new Map<number, Node>();
  for (const input of fixture.input.nodes) {
    const node = new Node(BigInt(input.id), input.width, input.height);
    node.TopLeft = input.topLeft ? new Point(input.topLeft.x, input.topLeft.y) : null;
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
    edge.Points = input.points.map((point: { x: number; y: number }) => new Point(point.x, point.y));
  }
  const result = Layout(Background, graph, { Seed: BigInt(fixture.seed) });
  expect(result.Nodes).toHaveLength(fixture.nodes.length);
  expect(result.Edges).toHaveLength(fixture.edges.length);
  const resultNodes = new Map(result.Nodes.map((node) => [Number(node.ID), node]));
  const resultEdges = new Map(result.Edges.map((edge) => [Number(edge.ID), edge]));
  for (const expected of fixture.nodes) {
    const node = resultNodes.get(expected.id)!;
    expect(node).toBeDefined();
    for (const [actual, value] of [[node.TopLeft!.X, expected.x], [node.TopLeft!.Y, expected.y],
      [node.Width, expected.width], [node.Height, expected.height]])
      expect(Math.abs(actual! - value!)).toBeLessThanOrEqual(1e-7);
    if ('label' in expected && expected.label) {
      expect(node.Label).not.toBeNull();
      expect(labelPositionString(node.Label!.Position)).toBe(expected.label.position);
      expect(node.Label!.Width).toBe(expected.label.width);
      expect(node.Label!.Height).toBe(expected.label.height);
    } else expect(node.Label).toBeNull();
    if ('iconPosition' in expected) expect(labelPositionString(node.Icon!.Position)).toBe(expected.iconPosition);
  }
  for (const expected of fixture.edges) {
    const edge = resultEdges.get(expected.id)!;
    expect(edge).toBeDefined();
    expect(edge.IsCurve).toBe(expected.isCurve);
    if ('label' in expected && expected.label) {
      expect(edge.Label).not.toBeNull();
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
}, 60_000);
