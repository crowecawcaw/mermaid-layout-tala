import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutseedboundaries.json';
import { layoutGraph, type LayoutDirection } from '../src/core.js';
import { compare } from './helpers/compare.js';

it.each(fixtures)('matches Go public layout with signed seeds $name', (fixture) => {
  const actual = layoutGraph(fixture.nodes, fixture.edges, {
    direction: fixture.direction as LayoutDirection,
    seeds: fixture.seeds.map((seed) => BigInt(seed)),
  });
  expect(actual.nodes).toHaveLength(fixture.expected.nodes.length);
  expect(actual.edges).toHaveLength(fixture.expected.edges.length);
  for (const node of fixture.expected.nodes) {
    const found = actual.nodes.find((n) => n.id === node.id)!;
    compare({ id: found.id, x: found.x, y: found.y, width: found.width, height: found.height }, node);
  }
  for (const edge of fixture.expected.edges) {
    const found = actual.edges.find((e) => e.id === edge.id)!;
    compare({ id: found.id, points: found.points }, edge);
  }
}, 60_000);
