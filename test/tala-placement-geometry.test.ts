import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { compassAxisDelta, compassDelta, directionCompass, distanceBetweenBoxes, placementDistance, sizelessOrientation } from '../src/tala/placement-geometry.js';

describe('upstream TALA placement geometry', () => {
  it('measures box gaps on both axes', () => {
    expect(distanceBetweenBoxes(
      { topLeft: { x: 0, y: 0 }, width: 20, height: 10 },
      { topLeft: { x: 50, y: 50 }, width: 10, height: 10 }
    )).toBe(50);
  });

  it('retains the alignment term in placement distance', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'a', width: 20, height: 20 }, { id: 'b', width: 20, height: 20 },
    ], [], 'TB');
    const [a, b] = graph.nodes;
    a!.topLeft = { x: 0, y: 0 };
    b!.topLeft = { x: 40, y: 10 };
    expect(placementDistance(a!, b!, true)).toBeCloseTo(20.0125);
    expect(sizelessOrientation(a!, b!)).toBe('TopLeft');
  });

  it('uses the upstream compass wraparound rules', () => {
    expect(directionCompass('BottomLeft')).toBe(-3);
    expect(compassDelta(4, -3)).toBe(1);
    expect(compassAxisDelta(0, 3)).toBe(-1);
  });
});
