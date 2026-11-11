import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutrandomextended-errors.json';
import { layoutFlowchart, type LayoutDirection } from '../src/layout.js';

it.each(fixtures)('matches pinned Go layout failure $name', (fixture) => {
  expect(() => layoutFlowchart(fixture.nodes, fixture.edges, {
    ...fixture.options,
    direction: fixture.options.direction as LayoutDirection | undefined,
  })).toThrow(fixture.error);
});
