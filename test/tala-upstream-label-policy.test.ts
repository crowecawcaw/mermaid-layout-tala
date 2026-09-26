import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart } from '../src/layout.js';
import { nodeLabelPositionPreferences, prepareNodeLabels } from '../src/tala/label-policy.js';

interface Policy { shape: string; container: boolean; tranches: string[][]; default: string }
const policies = JSON.parse(readFileSync(new URL(
  '../tools/upstream-fixtures/label-policy-expected.json', import.meta.url), 'utf8')) as Policy[];

describe('upstream node label policy', () => {
  for (const policy of policies) {
    it(`matches ${policy.shape} ${policy.container ? 'container' : 'node'}`, () => {
      expect(nodeLabelPositionPreferences(policy.shape, policy.container)).toEqual(policy.tranches);
      const result = prepareNodeLabels([{ id: 'A', width: 100, height: 50,
        shape: policy.shape, isGroup: policy.container,
        labelBBox: { width: 20, height: 10 } }]);
      expect(result[0]).toMatchObject({ labelPosition: policy.default, labelPositionFixed: false });
    });
  }

  it('preserves a caller-selected position and marks it fixed', () => {
    const result = prepareNodeLabels([{ id: 'A', width: 100, height: 50,
      labelBBox: { width: 20, height: 10 }, labelPosition: 'OUTSIDE_BOTTOM_CENTER' }]);
    expect(result[0]).toMatchObject({ labelPosition: 'OUTSIDE_BOTTOM_CENTER', labelPositionFixed: true });
  });

  it('carries the chosen position through the public layout path', () => {
    const result = layoutFlowchart([{ id: 'A', width: 100, height: 50,
      labelBBox: { width: 20, height: 10 } }], [], { strategy: 'tala', seeds: [1] });
    expect(result.nodes[0]).toMatchObject({ labelPosition: 'INSIDE_MIDDLE_CENTER',
      labelPositionFixed: false });
  });
});
