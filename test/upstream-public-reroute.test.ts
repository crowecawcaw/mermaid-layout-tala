import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutreroute.json';
import { routeEdges, type LayoutDirection } from '../src/index.js';
import { compare } from './helpers/compare.js';

it.each(fixtures)('matches pinned Go RouteEdges $name', (fixture) => {
  const before = structuredClone({ nodes: fixture.nodes, edges: fixture.edges });
  const result = routeEdges(fixture.nodes, fixture.edges, fixture.selected, {
    ...fixture.options,
    direction: fixture.options.direction as LayoutDirection,
  });
  expect({ nodes: fixture.nodes, edges: fixture.edges }).toEqual(before);
  expect(result.nodes).toEqual(fixture.nodes);
  for (const expected of fixture.expected) {
    const actual = result.edges.find((edge) => edge.id === expected.id)!;
    expect(actual).toBeDefined();
    expect(actual.to).toBe(expected.to);
    expect(actual.isCurve).toBe(expected.isCurve);
    expect(actual.labelPosition).toBe(expected.labelPosition);
    expect(actual.labelPercentage).toBe(expected.labelPercentage);
    compare(actual.points, expected.points);
    if (!fixture.selected.includes(expected.id))
      expect(actual).toBe(fixture.edges.find((edge) => edge.id === expected.id));
  }
});

it('validates selections and existing geometry without mutating inputs', () => {
  const fixture = fixtures[0]!;
  const nodes = structuredClone(fixture.nodes);
  const edges = structuredClone(fixture.edges);
  const before = structuredClone({ nodes, edges });
  expect(() => routeEdges(nodes, edges, ['e1', 'e1'])).toThrow(/repeated/);
  expect(() => routeEdges(nodes, edges, ['missing'])).toThrow(/not in the graph/);
  expect(() => routeEdges(nodes.map((n, i) => i === 0 ? { ...n, x: Infinity } : n), edges, ['e1'])).toThrow(/position/);
  expect(() => routeEdges(nodes, edges.map((e, i) => i === 0 ? { ...e, points: [{ x: 0, y: 0 }] } : e), ['e1'])).toThrow(/incomplete route/);
  expect(() => routeEdges(nodes, edges.map((e, i) => i === 0 ? { ...e, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] } : e), ['e1'])).toThrow(/degenerate/);
  expect(() => routeEdges(nodes, edges.map((e, i) => i === 0 ? { ...e, labelPosition: 'INSIDE_TOP_CENTER' } : e), ['e1'])).toThrow(/label position/);
  expect(() => routeEdges(nodes, edges.map((e, i) => i === 0 ? { ...e, labelPercentage: 2 } : e), ['e1'])).toThrow(/label percentage/);
  expect(() => routeEdges(nodes, edges.map((e, i) => i === 0 ? { ...e, points: [] } : e), ['e1'])).toThrow(/unselected edge/);
  expect({ nodes, edges }).toEqual(before);
});
