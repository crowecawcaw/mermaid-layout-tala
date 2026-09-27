import { describe, expect, it } from 'vitest';
import { assignHerds, canUseBothSides, type HerdAssignment, type HerdSide } from '../src/tala/herding.js';
import { TalaGraph } from '../src/tala/graph.js';
import { syncHerdFences } from '../src/tala/ordinary-placement.js';
import { sizedNodeEdgeLength } from '../src/tala/sized-cost.js';

const assigned = (orientation: HerdSide): HerdAssignment => ({ orientation, val: 0,
  sameSidePaired: new Set(), oppositeSidePaired: new Set(['earlier-uncle']) });

describe('upstream AssignHerds overlapping groups', () => {
  it.each([
    ['opposing preferences with a shared side', true, true, 'Bottom', 'Top'],
    ['later constraint selects the shared side', true, false, 'Bottom', 'Top'],
    ['later constraint overrides the first preference', true, false, 'Top', 'Bottom'],
    ['incompatible sides leave the connected herd free', false, false, 'Bottom', undefined],
  ] as const)('%s', (_name, firstWide, lastWide, lastOrientation, expected) => {
    const assignments = new Map<string, HerdAssignment>([
      ['firstCousin', assigned('Top')], ['lastCousin', assigned(lastOrientation)],
    ]);
    const first = { uncle: 'first', nodes: ['a', 'b'],
      cousins: new Map([['a', ['firstCousin']], ['b', ['firstCousin']]]),
      uncleWidth: firstWide ? 300 : 100, uncleHeight: 100, unclePlaced: true };
    const last = { uncle: 'last', nodes: ['b', 'c'],
      cousins: new Map([['b', ['lastCousin']], ['c', ['lastCousin']]]),
      uncleWidth: lastWide ? 300 : 100, uncleHeight: 100, unclePlaced: true };
    const choices = assignHerds([first, last], assignments);
    for (const id of ['a', 'b', 'c']) {
      expect(choices.get(id)).toBe(expected);
      expect(assignments.get(id)?.orientation).toBe(expected);
    }
    expect(assignments.get('firstCousin')!.sameSidePaired.size)
      .toBe(expected === 'Top' ? 1 : 0);
    expect(assignments.get('lastCousin')!.sameSidePaired.size)
      .toBe(expected === lastOrientation ? 1 : 0);
  });

  it('uses both parallel sides only when the uncle is long enough', () => {
    expect(canUseBothSides(200, 100, 'Top')).toBe(true);
    expect(canUseBothSides(200, 100, 'Right')).toBe(false);
    expect(canUseBothSides(100, 200, 'Right')).toBe(true);
  });

  it('syncs a herd fence and scores crossing it as upstream does', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'a', width: 50, height: 40 }, { id: 'b', width: 50, height: 40 },
    ], []);
    const [a, b] = graph.nodes;
    a!.topLeft = { x: 0, y: 0 };
    b!.topLeft = { x: 100, y: 100 };
    b!.herdAssignment = assigned('Top');
    syncHerdFences(graph);
    expect(b!.herdAssignment.val).toBe(0);
    expect(sizedNodeEdgeLength(b!, graph, 0)).toBe(100);
    b!.herdAssignment.val = 120;
    expect(sizedNodeEdgeLength(b!, graph, 0)).toBe(graph.cellSize + 20);
    const cloned = graph.clone().nodes.find((node) => node.id === 'b')!;
    expect(cloned.herdAssignment).toEqual(b!.herdAssignment);
    expect(cloned.herdAssignment).not.toBe(b!.herdAssignment);
  });
});
