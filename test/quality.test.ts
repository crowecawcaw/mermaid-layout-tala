import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-quality.json';
import { compareScores, evaluateLayout } from '../src/quality.js';

describe('upstream quality scoring', () => {
  it.each(fixtures)('matches Go penalty and area for $name', (fixture) => {
    expect(evaluateLayout(fixture.layout)).toEqual(fixture.score);
  });
  it('uses exact penalties before area, and finite values before invalid ones', () => {
    expect(compareScores({ penalty: 1, area: 300 }, { penalty: 1 + Number.EPSILON, area: 1 })).toBe(
      -1
    );
    expect(compareScores({ penalty: 1, area: 100 }, { penalty: 1, area: 300 })).toBe(-1);
    expect(compareScores({ penalty: 1, area: 100 }, { penalty: NaN, area: 1 })).toBe(-1);
    expect(compareScores({ penalty: 1, area: 100 }, { penalty: 1, area: -1 })).toBe(-1);
    expect(compareScores({ penalty: 1, area: 100 }, { penalty: 1, area: 100 })).toBe(0);
  });
});
