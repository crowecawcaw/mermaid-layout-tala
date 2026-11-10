import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutseedselection.json';
import { coordinateLocalSeeds } from '../src/upstream/adapter/seed-coordination.js';
import { Score } from '../src/upstream/quality/scoring.js';

it.each(fixtures)('matches Go seed coordination $trial', ({ attempts, winner, error }) => {
  let actual = -1, message = '';
  try {
    actual = coordinateLocalSeeds([1n, 2n, 3n], (_seed, index) => {
      const attempt = attempts[index]!;
      if (attempt.error) throw new Error(attempt.error);
      return { value: index, score: new Score(attempt.penalty, attempt.area) };
    }).value;
  } catch (e) { message = (e as Error).message; }
  expect(actual).toBe(winner);
  expect(message).toBe(error);
});
