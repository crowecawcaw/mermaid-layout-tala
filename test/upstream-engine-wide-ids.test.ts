import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-enginewideids.json';
import { Background } from '../src/upstream/limits/context.js';
import { Layout } from '../src/upstream/engine/pipeline.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { compare } from './helpers/compare.js';

it.each(fixtures)('matches Go with exact signed 64-bit entity IDs: $name', (fixture) => {
  const graph = new Graph();
  const nodes = new Map<string, Node>();
  for (const input of fixture.nodes) {
    const node = new Node(BigInt(input.id), input.width, input.height);
    node.SetShape(input.shape);
    graph.AddNewNodeToContainer('parent' in input && input.parent ? nodes.get(input.parent)! : null, node);
    nodes.set(input.id, node);
  }
  for (const input of fixture.edges) {
    const edge = graph.Connect(nodes.get(input.from)!, nodes.get(input.to)!);
    edge.ID = BigInt(input.id);
    edge.TargetArrowhead = 'triangle';
  }
  const result = Layout(Background, graph, { Seed: BigInt(fixture.seed) });
  const actualNodes = result.Nodes.map((node) => ({ id: String(node.ID), x: node.TopLeft!.X, y: node.TopLeft!.Y, width: node.Width, height: node.Height }));
  const actualEdges = result.Edges.map((edge) => ({ id: String(edge.ID), from: String(edge.From.ID), to: String(edge.To.ID), points: edge.Points.map((point) => ({ x: point.X, y: point.Y })) }));
  expect(actualNodes).toHaveLength(fixture.expectedNodes.length);
  expect(actualEdges).toHaveLength(fixture.expectedEdges.length);
  compare(actualNodes, fixture.expectedNodes);
  compare(actualEdges, fixture.expectedEdges);
  const id = (node: Node | null) => String(node?.ID ?? 0n);
  expect({
    containers: Object.fromEntries([...result.Containers].map(([parent, children]) => [id(parent), children.map(id)])),
    hubs: Object.fromEntries([...result.Hubs].map(([hub, spokes]) => [id(hub), spokes.map(id)])),
    clusters: Object.fromEntries([...result.Clusters].map(([vessel, cluster]) => [id(vessel), cluster.Nodes.map(id)])),
    sequences: Object.fromEntries([...result.Sequences].map(([vessel, sequence]) => [id(vessel), sequence.Nodes.map(id)])),
  }).toEqual(fixture.structure);
}, 60_000);
