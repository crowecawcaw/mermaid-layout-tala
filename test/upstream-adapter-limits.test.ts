import { describe, expect, it } from 'vitest';
import { translateFlowchart } from '../src/upstream/adapter/flowchart.js';

describe('flowchart adapter input bounds', () => {
  it('rejects oversized graphs before translating their records', () => {
    const nodes = Array.from({ length: 10_001 }, (_, i) => ({
      id: `n${i}`,
      width: 10,
      height: 10,
    }));
    expect(() => translateFlowchart(nodes, [], {})).toThrow(
      /object count exceeds limit 10000/,
    );
    const edges = Array.from({ length: 50_001 }, (_, i) => ({
      id: `e${i}`,
      from: 'n0',
      to: 'n0',
    }));
    expect(() =>
      translateFlowchart([{ id: 'n0', width: 10, height: 10 }], edges, {}),
    ).toThrow(/edge count exceeds limit 50000/);
    const points = Array(1_000_001).fill({ x: 0, y: 0 });
    expect(() => translateFlowchart([{ id: 'n0', width: 10, height: 10 }], [
      { id: 'e', from: 'n0', to: 'n0', points },
    ], {})).toThrow(/route point count exceeds limit 1000000/);
  });
  it('rejects excessive nesting, table columns and unsupported geometry', () => {
    const nested = Array.from({ length: 257 }, (_, i) => ({
      id: `n${i}`,
      width: 10,
      height: 10,
      isGroup: true,
      ...(i ? { parentId: `n${i - 1}` } : {}),
    }));
    expect(() => translateFlowchart(nested, [], {})).toThrow(
      /nesting depth exceeds limit 256/,
    );
    expect(() =>
      translateFlowchart(
        [
          {
            id: 'a',
            width: 10,
            height: 10,
            shape: 'table',
            tableColumns: 6000,
          },
          {
            id: 'b',
            width: 10,
            height: 10,
            shape: 'table',
            tableColumns: 6000,
          },
        ],
        [],
        {},
      ),
    ).toThrow(/column count exceeds limit 10000/);
    expect(() =>
      translateFlowchart(
        [{ id: 'a', width: 1_000_000_001, height: 10 }],
        [],
        {},
      ),
    ).toThrow(/dimensions/);
    expect(() =>
      translateFlowchart(
        [
          {
            id: 'a',
            width: 10,
            height: 10,
            fixedPosition: { x: 1_000_000_000, y: 0 },
          },
        ],
        [],
        {},
      ),
    ).toThrow(/fixed bounds/);
  });
});
