import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-engineovggoldens.json';
import { WithCancel, type Context } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { FromString } from '../src/upstream/label/label.js';
import { Pipeline } from '../src/upstream/engine/pipeline.js';
import { RouteGraph } from '../src/upstream/routing/graph-stage.js';
import type { OVG } from '../src/upstream/routing/ovg.js';

type Coord = { x: number; y: number };
type Snapshot = { nodes: Coord[]; edges: { from: Coord; to: Coord }[] };
const pointOrder = (a: Coord, b: Coord) => a.x - b.x || a.y - b.y;
const edgeOrder = (a: Snapshot['edges'][number], b: Snapshot['edges'][number]) =>
  pointOrder(a.from, b.from) || pointOrder(a.to, b.to);

class SnapshotPipeline extends Pipeline {
  snapshots: Snapshot[] = [];
  override route(ctx: Context): void {
    let started = false;
    this.edgeRoutingComplete = RouteGraph(ctx, this.graph, {
      ForceReroute: this.forceReroute,
      RoutesPreviouslyCompleted: this.edgeRoutingComplete,
      Observer: { SubgraphRouted: (ovg: OVG) => {
        if (!started) { this.snapshots = []; started = true; }
        this.snapshots.push({
          nodes: ovg.Nodes.map((node) => ({ x: node.X, y: node.Y })).sort(pointOrder),
          edges: ovg.Edges.map((edge) => ({
            from: { x: edge.From.X, y: edge.From.Y }, to: { x: edge.To.X, y: edge.To.Y },
          })).sort(edgeOrder),
        });
      } },
    });
  }
}

it.each(fixtures)('matches upstream pipeline OVG golden $name', (fixture) => {
  const graph = new Graph();
  const nodes = new Map<number, Node>();
  for (const input of fixture.input.nodes) {
    const node = new Node(BigInt(input.id), input.width, input.height);
    node.TopLeft = input.topLeft ? new Point(input.topLeft.x, input.topLeft.y) : null;
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
  for (const input of fixture.input.nodes)
    if ('nears' in input) for (const near of input.nears ?? []) nodes.get(input.id)!.AddNear(nodes.get(near)!);
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
  const pipeline = new SnapshotPipeline(graph, 123n);
  pipeline.runAllStages(WithCancel()[0]);
  expect(pipeline.snapshots).toHaveLength(fixture.snapshots.length);
  for (let i = 0; i < fixture.snapshots.length; i++) {
    const actual = pipeline.snapshots[i]!, expected = fixture.snapshots[i]!;
    const expectedNodes = [...expected.nodes].sort(pointOrder), expectedEdges = [...expected.edges].sort(edgeOrder);
    expect(actual.nodes).toHaveLength(expectedNodes.length);
    expect(actual.edges).toHaveLength(expectedEdges.length);
    const compare = (a: Coord, b: Coord) => {
      expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1e-7);
      expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1e-7);
    };
    expectedNodes.forEach((point, j) => compare(actual.nodes[j]!, point));
    expectedEdges.forEach((edge, j) => { compare(actual.edges[j]!.from, edge.from); compare(actual.edges[j]!.to, edge.to); });
  }
}, 60_000);
