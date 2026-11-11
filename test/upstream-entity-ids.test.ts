import { expect, it } from 'vitest';
import { allocateEntityIDs } from '../src/upstream/adapter/flowchart.js';

it('allocates colliding Unicode identities in Go UTF-8 string order', () => {
  // Both identifiers hash to 3507422569. Go sorts the private-use rune
  // before the supplementary-plane rune; UTF-16 string order is reversed.
  const supplementary = '𐀀1ti7zkx';
  const privateUse = '\ue000zvtd6b';
  expect(allocateEntityIDs([supplementary, privateUse])).toEqual([
    4294967297n,
    4294967296n,
  ]);
});
