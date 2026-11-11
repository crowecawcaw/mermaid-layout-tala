import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutseednormalize.json';
import { normalizeSeeds } from '../src/random.js';

it.each(fixtures)('matches Go seed normalization for $input', (fixture) => {
  let output: string[] = [], error = '';
  try { output = normalizeSeeds(fixture.input.map((value) => BigInt(value))).map(String); }
  catch (caught) { error = (caught as Error).message; }
  expect({ output, error }).toEqual({ output: fixture.output, error: fixture.error });
});
