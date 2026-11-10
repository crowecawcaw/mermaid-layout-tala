import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-routingadditional.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { routeAdditionalEdgesWithResourceLimits } from '../src/upstream/routing/coordinator.js';
import { compare } from './helpers/compare.js';

it.each(fixtures)('matches Go additional-edge routing $trial', ({ trial, error, routes }) => {
  const g = new Graph();
  const a = g.AddNode(new Node(1n, 80, 60)); a.TopLeft = new Point(0, 0);
  const b = g.AddNode(new Node(2n, 80, 60)); b.TopLeft = new Point(200, 0);
  const c = g.AddNode(new Node(3n, 70, 50)); c.TopLeft = new Point(30 + trial % 5 * 35, 130 + trial % 3 * 25);
  const existing = g.Connect(a, b); existing.Points = [new Point(80, 30), new Point(200, 30)];
  const one = g.Connect(a, c); one.TargetArrowhead = 'triangle';
  const selected = [one];
  if (trial % 2 === 0) { const two = g.Connect(b, c); two.TargetArrowhead = 'triangle'; selected.push(two); }
  if (trial % 4 === 0) { c.Label = new Label(); Object.assign(c.Label, { Text: 'node', Width: 30, Height: 12 }); }
  g.ComputeCellSize();
  let actualError = '';
  try { routeAdditionalEdgesWithResourceLimits(Background, g, selected); }
  catch (e) { actualError = (e as Error).message; }
  expect(actualError).toBe(error);
  compare(g.Edges.map((e) => e.Points.map((p) => ({ x: p.X, y: p.Y }))), routes);
});
