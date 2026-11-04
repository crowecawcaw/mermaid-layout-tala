import { describe, expect, it } from 'vitest';
import { Point } from '../src/upstream/geo/point.js';
import type { Node } from '../src/upstream/layoutgraph/node.js';
import { scoringNodeBounds } from '../src/upstream/placementcost/obstruction-bounds.js';

function node(x: number, y: number, width: number, height: number): Node {
  return { TopLeft: new Point(x, y), Width: width, Height: height } as Node;
}

describe('placement obstruction bounds', () => {
  it('includes both endpoint boxes and handles negative dimensions', () => {
    const bounds = scoringNodeBounds(node(10, 10, -5, -5)).including(
      scoringNodeBounds(node(20, 20, 5, 5)),
    );
    expect(bounds.excludes(node(0, 0, 4, 4))).toBe(true);
    expect(bounds.excludes(node(4, 4, 1, 1))).toBe(false);
    expect(bounds.excludes(node(30, 20, -5, 1))).toBe(false);
  });
  it('does not reject unplaced, nonfinite or overflow-prone geometry', () => {
    const bounds = scoringNodeBounds(node(0, 0, 10, 10));
    expect(bounds.excludes(null)).toBe(false);
    expect(bounds.excludes(node(Infinity, 0, 1, 1))).toBe(false);
    expect(bounds.excludes(node(NaN, 0, 1, 1))).toBe(false);
    expect(
      scoringNodeBounds(node(Number.MAX_VALUE, 0, 1, 1)).excludes(
        node(0, 0, 1, 1),
      ),
    ).toBe(false);
  });
});
