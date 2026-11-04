import { describe, it, expect } from 'vitest';
import fixtures from './fixtures/upstream-spatial.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  Label,
  Icon,
  type Spacing,
} from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { Box } from '../src/upstream/geo/box.js';
import * as S from '../src/upstream/layoutgraph/node-spatial.js';
import {
  UpdateSpacing,
  deltaToGuarded,
} from '../src/upstream/layoutgraph/node-spacing.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import { Background } from '../src/upstream/limits/context.js';
function compare(actual: unknown, expected: unknown, path = 'result'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(
      1e-10 * Math.max(1, Math.abs(expected)),
    );
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((v, i) =>
      compare((actual as unknown[])[i], v, `${path}[${i}]`),
    );
  } else if (expected !== null && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort(), path).toEqual(
      Object.keys(expected).sort(),
    );
    for (const [key, value] of Object.entries(expected))
      compare(
        (actual as Record<string, unknown>)[key],
        value,
        `${path}.${key}`,
      );
  } else expect(actual, path).toBe(expected);
}
const spacing = (s: Spacing) => [s.top, s.right, s.bottom, s.left];
const record = (s: number[]): Spacing => ({
  top: s[0]!,
  right: s[1]!,
  bottom: s[2]!,
  left: s[3]!,
});
describe('direct upstream spatial and spacing predicates', () => {
  it.each(fixtures)('matches Go predicates and work for trial $trial', (f) => {
    const g = new Graph();
    g.CellSize = f.cell;
    const nodes = f.nodes.map((r, j) => {
      const n = new Node(BigInt(j + 1), r.box.Width, r.box.Height);
      n.TopLeft = new Point(r.box.TopLeft.x, r.box.TopLeft.y);
      n.Graph = g;
      n.SetShape(r.shape);
      n.margin = record(r.margin);
      n.padding = record(r.padding);
      if (f.trial % 4 !== 0) r.loops.forEach((v, o) => n.LoopOffsets.set(o, v));
      n.Label = Object.assign(new Label(), {
        Position: r.label[0] as number,
        Width: r.label[1] as number,
        Height: r.label[2] as number,
      });
      if (r.label[3]) n.Label.FixPosition();
      n.Icon = Object.assign(new Icon(), { Position: r.icon[0] as number });
      if (r.icon[1]) n.Icon.FixPosition();
      n.Is3D = r.threeD;
      n.IsMultiple = r.multiple;
      UpdateSpacing(n);
      return n;
    });
    for (const [target, width, height] of f.edges) {
      const e = g.Connect(nodes[0]!, nodes[target!]!);
      e.MinWidth = width!;
      e.MinHeight = height!;
    }
    const [a, b, c] = nodes as [Node, Node, Node],
      p = new Point(f.p.x, f.p.y),
      q = new Point(f.q.x, f.q.y),
      delta = f.delta;
    const guard = new WorkGuard(
        Background,
        'spatial fixture',
        MaxEngineWorkUnits,
      ),
      clearance = deltaToGuarded(a, b, p, guard);
    const variants: unknown[] = [];
    for (const sized of [false, true])
      for (const horizontal of [false, true])
        variants.push([
          S.distanceTo(a, b, sized),
          S.isAdjacentTo(a, b, sized),
          S.distanceBetweenCenters(a, b, sized),
          S.distance(a, b, sized),
          S.IsBlocked(c, a, b, sized, horizontal),
          S.overlapsAlongDimension(a, b, horizontal, sized),
          S.isVisibilityGraphCandidate(a, horizontal, false, sized, b, delta),
          S.isVisibilityGraphCandidate(a, horizontal, true, sized, b, delta),
        ]);
    compare(
      {
        clearance,
        work: String(guard.Used()),
        margins: nodes.map((n) => spacing(n.margin)),
        paddings: nodes.map((n) => spacing(n.padding)),
        variants,
        orthogonal: S.orthogonalDistanceTo(a, b),
        modifier: S.modifierElementAdjustments(a),
        covers: S.covers(a.Box, b.Box),
        exact: S.DoesOverlapExact(a, b),
        overlapAt: S.doesOverlapAt(a, b, p),
        overlap: S.doesOverlap(a, b),
        padded: S.doesOverlapCalc(a, b, delta),
        area: S.overlapArea(a, b),
        near: S.isPointNear(a, p),
        on: S.isPointOnNode(a, p),
        within: S.isWithinBounds(a, p, q),
        passes: S.passesThrough(a, p, q),
        intersects: S.intersects(p, q, a.TopLeft!, b.TopLeft!),
        contains: S.containsPoint(a, p, delta),
        line: S.overlapsLine(a, p, q, delta),
        surrounds: S.Surrounds(a, b, delta),
        orientation: S.nodeOrientation(a, b),
        orientationAt: S.orientationAtPoint(a, b, p),
      },
      f.expected,
    );
  });
  it('preserves the upstream distinction between tangency and boundary overlap', () => {
    const box = new Box(new Point(0, 0), 10, 10);
    expect(
      S.segmentIntersectsBox(new Point(-1, 1), new Point(1, -1), box),
    ).toBe(false);
    expect(
      S.segmentIntersectsBox(new Point(-1, 0), new Point(11, 0), box),
    ).toBe(true);
    expect(
      S.segmentIntersectsBox(new Point(0, 0), new Point(-1, -1), box),
    ).toBe(true);
    expect(
      S.segmentIntersectsBox(
        new Point(-1, 5),
        new Point(11, 5),
        new Box(new Point(10, 10), -10, -10),
      ),
    ).toBe(true);
    expect(
      S.segmentIntersectsBox(
        new Point(-1, 5),
        new Point(11, 5),
        new Box(new Point(NaN, 0), 10, 10),
      ),
    ).toBe(false);
  });
});
