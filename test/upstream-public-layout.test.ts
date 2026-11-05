import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-layout.json';
import expanded from './fixtures/upstream-layoutcorpus.json';
import features from './fixtures/upstream-layoutfeatures.json';
import random from './fixtures/upstream-layoutrandom.json';
import arrowheads from './fixtures/upstream-layoutarrowheads.json';
import nodeOptions from './fixtures/upstream-layoutnodeoptions.json';
import arrowLabels from './fixtures/upstream-layoutarrowlabels.json';
import {
  layoutFlowchart,
  type LayoutDirection,
  type Point,
} from '../src/layout.js';

const equal = (a: number, b: number) => Math.abs(a - b) <= 1e-7;
function compact(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const b = result.at(-1),
      a = result.at(-2);
    if (b && equal(b.x, point.x) && equal(b.y, point.y)) continue;
    if (
      a &&
      b &&
      ((equal(a.x, b.x) && equal(b.x, point.x)) ||
        (equal(a.y, b.y) && equal(b.y, point.y)))
    )
      result.pop();
    result.push(point);
  }
  return result;
}
it.each([
  ...fixtures,
  ...expanded,
  ...features,
  ...random,
  ...arrowheads,
  ...nodeOptions,
  ...arrowLabels,
])('matches pinned Go public layout $name', (fixture) => {
  const actual = layoutFlowchart(fixture.nodes, fixture.edges, {
    ...fixture.options,
    direction: fixture.options.direction as LayoutDirection,
  });
  for (const node of fixture.expected.nodes) {
    const found = actual.nodes.find((candidate) => candidate.id === node.id);
    expect(found).toBeDefined();
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(found![key]).toBeCloseTo(node[key], 7);
    if ('fontSize' in node) expect(found!.fontSize).toBe(node.fontSize);
    if ('iconPosition' in node)
      expect(found!.iconPosition).toBe(node.iconPosition);
    if ('labelPosition' in node) {
      expect(found!.labelPosition).toBe(node.labelPosition);
      expect(found!.labelWidth).toBe(node.labelWidth);
      expect(found!.labelHeight).toBe(node.labelHeight);
    }
    if ('labelX' in node) {
      expect(found!.labelX).toBeCloseTo(node.labelX as number, 7);
      expect(found!.labelY).toBeCloseTo(node.labelY as number, 7);
    }
  }
  for (const edge of fixture.expected.edges) {
    const found = actual.edges.find((candidate) => candidate.id === edge.id);
    expect(found).toBeDefined();
    for (const key of [
      'sourceArrowheadLabelPosition',
      'targetArrowheadLabelPosition',
    ] as const) {
      if (key in edge) {
        const expected = edge[key] as { x: number; y: number };
        expect(found![key]?.x).toBeCloseTo(expected.x, 7);
        expect(found![key]?.y).toBeCloseTo(expected.y, 7);
      }
    }
    if ('isCurve' in edge) expect(found!.isCurve).toBe(edge.isCurve);
    if ('labelPosition' in edge) {
      expect(found!.labelPosition).toBe(edge.labelPosition);
      expect(found!.labelPercentage).toBeCloseTo(
        edge.labelPercentage as number,
        7,
      );
    }
    if ('labelX' in edge) {
      expect(found!.x).toBeCloseTo(edge.labelX as number, 7);
      expect(found!.y).toBeCloseTo(edge.labelY as number, 7);
    }
    const expected = compact(edge.points),
      points = compact(found!.points);
    expect(points).toHaveLength(expected.length);
    for (let i = 0; i < points.length; i++) {
      expect(points[i]!.x).toBeCloseTo(expected[i]!.x, 7);
      expect(points[i]!.y).toBeCloseTo(expected[i]!.y, 7);
    }
  }
});
