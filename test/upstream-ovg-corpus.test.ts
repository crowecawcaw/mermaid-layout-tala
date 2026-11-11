import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-ovgupstreamcorpus.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { FromString } from '../src/upstream/label/label.js';
import { buildOVGFromGraphWithLimits } from '../src/upstream/routing/ovg-build.js';

type Coord = { X: number; Y: number };
const order = (a: Coord, b: Coord) => a.X - b.X || a.Y - b.Y;

it.each(fixtures)('matches upstream visibility graph $name', (fixture) => {
  const graph = new Graph();
  const nodes = new Map<number, Node>();
  for (const [index, input] of fixture.input.nodes.entries()) {
    const node = new Node(BigInt(input.id), input.width, input.height);
    node.TopLeft = input.topLeft ? new Point(input.topLeft.x, input.topLeft.y) : new Point((index % 5) * 700, Math.floor(index / 5) * 700);
    node.FontSize = 'fontSize' in input ? input.fontSize ?? null : null;
    node.D2ID = 'd2id' in input ? input.d2id ?? null : null;
    node.SetShape(input.shapeType);
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
    if ('label' in input && input.label) {
      edge.Label = new Label();
      edge.Label.Text = input.label.Text;
      edge.Label.Position = FromString(input.label.Position);
      edge.Label.Width = input.label.Width;
      edge.Label.Height = input.label.Height;
    }
  }
  graph.ComputeCellSize();
  const ovg = buildOVGFromGraphWithLimits(Background, graph, []);
  const actualNodes = ovg.Nodes.map((node) => ({
    X: node.Point.X, Y: node.Point.Y, center: node.IsNodeCenter, tunnel: node.IsTunnel,
    container: String(node.Container?.ID ?? 0n),
    nears: [...(node.IsNearPort ?? [])].map((near) => String(near.ID)).sort(),
    owners: [...(node.portOwners() ?? [])].map(([owner, meta]) => ({
      id: String(owner.ID), directions: meta.directions, center: meta.isCenterPort,
    })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  })).sort(order);
  const actualEdges = ovg.Edges.map((edge) => {
    let A = { X: edge.From.Point.X, Y: edge.From.Point.Y }, B = { X: edge.To.Point.X, Y: edge.To.Point.Y };
    if (order(B, A) < 0) [A, B] = [B, A];
    return { A, B, Distance: edge.Distance };
  }).sort((a, b) => order(a.A, b.A) || order(a.B, b.B));
  expect(actualNodes).toHaveLength(fixture.nodes.length);
  expect(actualEdges).toHaveLength(fixture.edges.length);
  const comparePoint = (actual: Coord, expected: Coord) => {
    expect(Math.abs(actual.X - expected.X)).toBeLessThanOrEqual(1e-7);
    expect(Math.abs(actual.Y - expected.Y)).toBeLessThanOrEqual(1e-7);
  };
  fixture.nodes.forEach((point, i) => {
    const actual = actualNodes[i]!;
    comparePoint(actual, point);
    expect({ center: actual.center, tunnel: actual.tunnel, container: actual.container, nears: actual.nears, owners: actual.owners })
      .toEqual({ center: point.center, tunnel: point.tunnel, container: point.container, nears: point.nears, owners: point.owners });
  });
  fixture.edges.forEach((edge, i) => {
    comparePoint(actualEdges[i]!.A, edge.A);
    comparePoint(actualEdges[i]!.B, edge.B);
    expect(Math.abs(actualEdges[i]!.Distance - edge.Distance)).toBeLessThanOrEqual(1e-7);
  });
});
