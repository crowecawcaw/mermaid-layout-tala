import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-routingshortcutgeometry.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { RouteWorkGuard } from '../src/upstream/routing/stage-guard.js';
import {
  shortcutCandidate,
  shortcutOrthogonal,
  shortcutBends,
  shortcutLength,
  shortcutContactsPreserved,
} from '../src/upstream/routing/shortcut-geometry.js';
it.each(fixtures)('matches Go shortcut geometry $trial', (f) => {
  const x = 40 + (f.trial % 10) * 5,
    before = [
      new Point(0, 0),
      new Point(x, 0),
      new Point(x, 60),
      new Point(120, 60),
      new Point(120, 120),
      new Point(200, 120),
    ];
  const other = [
      new Point((f.trial % 8) * 25, -20),
      new Point((f.trial % 8) * 25, 140),
    ],
    candidate = shortcutCandidate(before, f.trial % 2, 4, f.trial % 3 === 0);
  const guard = new RouteWorkGuard(Background, 'shortcut', 100000n),
    contacts = shortcutContactsPreserved(before, candidate, other, guard);
  expect({
    candidate: candidate.map((p) => ({ x: p.X, y: p.Y })),
    orthogonal: shortcutOrthogonal(candidate),
    bends: shortcutBends(candidate),
    length: shortcutLength(candidate),
    contacts,
    work: Number(guard.Used()),
  }).toEqual({
    candidate: f.candidate,
    orthogonal: f.orthogonal,
    bends: f.bends,
    length: f.length,
    contacts: f.contacts,
    work: f.work,
  });
});
