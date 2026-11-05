import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingchannelconstraints.json';
import { Background } from '../src/upstream/limits/context.js';
import { RouteWorkGuard } from '../src/upstream/routing/stage-guard.js';
import {
  channelGap,
  solveChannelGap,
  type ChannelProblem,
} from '../src/upstream/routing/channel-constraints.js';

it.each(fixtures)('matches Go channel separation constraints $trial', (f) => {
  const p: ChannelProblem = {
    groups: [],
    arcs: [
      { from: 0, to: 1, separate: f.trial % 2 === 0 },
      { from: 1, to: 2, separate: true },
      { from: 0, to: 3, separate: f.trial % 3 === 0 },
      { from: 2, to: 3, separate: true },
    ],
  };
  for (let i = 0; i < 4; i++)
    p.groups.push({
      segments: [],
      lower: i * 12,
      upper: 80 + i * 11,
      position: 20 + i * 16,
      fixed: false,
      nodeClearance:
        (f.trial + i) % 3 === 0
          ? { start: 5 + i * 12, end: 65 + i * 13 }
          : null,
    });
  const guard = new RouteWorkGuard(Background, 'channels', 100000n);
  const [lo, hi, ok] = solveChannelGap(p, f.trial % 38, guard);
  expect({
    lo: ok ? lo : null,
    hi: ok ? hi : null,
    ok,
    gap: channelGap(p, [20, 36, 52, 68]),
    work: Number(guard.Used()),
  }).toEqual({ lo: f.lo, hi: f.hi, ok: f.ok, gap: f.gap, work: f.work });
});
