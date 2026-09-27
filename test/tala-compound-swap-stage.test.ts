import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { swapStage } from '../src/tala/swap-stage.js';

describe('compound SwapStuff stage', () => {
  it('moves shared-uncle siblings to the pinned Go stage positions', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'Group', width: 436, height: 159, isGroup: true },
      { id: 'N0', parentId: 'Group', width: 58, height: 32 },
      { id: 'N1', parentId: 'Group', width: 70, height: 39 },
      { id: 'N2', parentId: 'Group', width: 82, height: 32 },
      { id: 'Input', width: 75, height: 43 },
      { id: 'Output', width: 82, height: 38 },
    ], [
      { id: 'entry', from: 'Input', to: 'N0', directed: true },
      { id: 'chain1', from: 'N0', to: 'N1', directed: true },
      { id: 'chain2', from: 'N1', to: 'N2', directed: true },
      { id: 'exit', from: 'N2', to: 'Output', directed: true },
      { id: 'bypass', from: 'N0', to: 'Output', directed: true },
    ], 'TB');
    const positions: Record<string, [number, number]> = {
      Group: [0, 114], N0: [60, 174], N1: [306, 174], N2: [142, 174],
      Input: [114, 0], Output: [114, 342],
    };
    for (const node of graph.nodes) {
      const [x, y] = positions[node.id]!;
      node.topLeft = { x, y };
    }
    expect(swapStage(graph)).toBe(true);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get('N0')!.topLeft).toEqual({ x: 166, y: 174 });
    expect(byId.get('N2')!.topLeft).toEqual({ x: 60, y: 174 });
    expect(byId.get('N1')!.topLeft).toEqual({ x: 306, y: 174 });
    expect(byId.get('Group')!.topLeft).toEqual({ x: 0, y: 114 });
    expect(byId.get('Input')!.topLeft).toEqual({ x: 114, y: 0 });
    expect(byId.get('Output')!.topLeft).toEqual({ x: 114, y: 342 });
  });
});
