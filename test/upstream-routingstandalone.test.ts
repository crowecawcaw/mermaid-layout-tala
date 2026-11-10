import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-routingstandalone.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { RouteEdges, routeEdgesWithBudgets } from '../src/upstream/routing/standalone-router.js';
import { defaultOVGBuildLimits } from '../src/upstream/routing/ovg-resource.js';
import { compare } from './helpers/compare.js';

it.each(fixtures)('matches Go standalone routing $trial', ({ trial, error, routes, labels, budget }) => {
  const g = new Graph();
  const a = g.AddNode(new Node(1n, 80, 60)); a.TopLeft = new Point(0, 0);
  const b = g.AddNode(new Node(2n, 80, 60)); b.TopLeft = new Point(200, 0);
  const c = g.AddNode(new Node(3n, 70, 50)); c.TopLeft = new Point(30 + trial % 5 * 35, 130 + trial % 3 * 25);
  const existing = g.Connect(a, b); existing.Points = [new Point(80, 30), new Point(200, 30)];
  const one = g.Connect(a, c); one.TargetArrowhead = 'triangle';
  if (trial % 3 === 0) { one.Label = new Label(); Object.assign(one.Label, { Text: 'edge', Width: 24, Height: 12 }); }
  if (trial % 5 === 0) { one.SourceArrowheadLabel = new Label(); Object.assign(one.SourceArrowheadLabel, { Text: 'start', Width: 20, Height: 10 }); }
  const selected = [one];
  if (trial % 2 === 0) { const two = g.Connect(b, c); two.TargetArrowhead = 'triangle'; if (trial % 8 === 0) { b.SetShape('Table'); b.SetNumColumns(3); two.FromTableColumnIndex = 1; } selected.push(two); }
  if (trial >= 32 && trial < 48) { const loop = g.Connect(c, c); loop.TargetArrowhead = 'triangle'; selected.push(loop); }
  if (trial >= 48 && trial < 64) { const parallel = g.Connect(a, c); parallel.TargetArrowhead = 'triangle'; selected.push(parallel); if (trial >= 56) { const another = g.Connect(a, c); another.TargetArrowhead = 'triangle'; selected.push(another); } }
  if (trial % 4 === 0) { c.Label = new Label(); Object.assign(c.Label, { Text: 'node', Width: 30, Height: 12 }); }
  g.ComputeCellSize();
  let actualError = '';
  try { routeEdgesWithBudgets(Background, g, selected, defaultOVGBuildLimits(), BigInt(budget)); }
  catch (e) { actualError = (e as Error).message; }
  expect(actualError).toBe(error);
  compare(g.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))), routes);
  compare(g.Edges.map((e) => e.Label ? { position: e.Label.Position, percentage: e.LabelPercentage } : null), labels);
});

it('preserves graph state on routing failure and rejects repeated selections', () => {
  const g = new Graph();
  const a = g.AddNode(new Node(1n, 80, 60)); a.TopLeft = new Point(0, 0);
  const b = g.AddNode(new Node(2n, 80, 60)); b.TopLeft = new Point(200, 0);
  const existing = g.Connect(a, b); existing.Points = [new Point(80, 20), new Point(200, 20)];
  const selected = g.Connect(a, b); selected.Points = [new Point(80, 40), new Point(200, 40)];
  const oldExisting = existing.Points, oldSelected = selected.Points, oldCell = g.CellSize;
  expect(() => RouteEdges(Background, g, [selected, selected])).toThrow(/selected more than once/);
  expect(() => routeEdgesWithBudgets(Background, g, [selected], { ...defaultOVGBuildLimits(), nodes: 0n }, 50_000_000n)).toThrow(/OVG resource limit/);
  expect(g.CellSize).toBe(oldCell);
  expect(existing.Points).toBe(oldExisting);
  expect(selected.Points).toBe(oldSelected);
  expect(selected.Points.map((p) => [p.X, p.Y])).toEqual([[80, 40], [200, 40]]);
});
