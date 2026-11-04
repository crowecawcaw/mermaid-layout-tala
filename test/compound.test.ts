import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutNode } from '../src/layout.js';
import { crossesBox } from '../src/routing.js';

const nodes: LayoutNode[] = [
  { id: 'cloud', isGroup: true, width: 100, height: 50, labelWidth: 180, labelHeight: 28 },
  { id: 'app', isGroup: true, parentId: 'cloud', width: 80, height: 40, direction: 'LR' },
  { id: 'a', parentId: 'app', width: 80, height: 40 },
  { id: 'b', parentId: 'app', width: 120, height: 60 },
  { id: 'db', parentId: 'cloud', width: 100, height: 50 },
  { id: 'client', width: 90, height: 40 },
];
const edges = [
  { id: 'ca', from: 'client', to: 'a' },
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bd', from: 'b', to: 'db' },
];

describe('compound layout', () => {
  it.each(['TB', 'BT', 'LR', 'RL'] as const)('contains nested nodes and avoids unrelated nodes in %s', (direction) => {
    const result = layoutFlowchart(nodes, edges, { direction });
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    for (const node of result.nodes) {
      if (!node.parentId) continue;
      const parent = byId.get(node.parentId)!;
      expect(node.x - node.width / 2).toBeGreaterThanOrEqual(parent.x - parent.width / 2 + 24);
      expect(node.x + node.width / 2).toBeLessThanOrEqual(parent.x + parent.width / 2 - 24);
      expect(node.y - node.height / 2).toBeGreaterThanOrEqual(parent.y - parent.height / 2 + 24);
      expect(node.y + node.height / 2).toBeLessThanOrEqual(parent.y + parent.height / 2 - 24);
    }
    expect(byId.get('a')!.x).toBeLessThan(byId.get('b')!.x);
    for (const edge of result.edges) {
      for (const node of result.nodes.filter((node) => !node.isGroup)) {
        for (let i = 1; i < edge.points.length; i++) {
          expect(crossesBox(edge.points[i - 1]!, edge.points[i]!, {
            left: node.x - node.width / 2, right: node.x + node.width / 2,
            top: node.y - node.height / 2, bottom: node.y + node.height / 2,
          }), `${edge.id} crosses ${node.id}`).toBe(false);
        }
      }
    }
    expect(layoutFlowchart([...nodes].reverse(), [...edges].reverse(), { direction })).toEqual(result);
  });

  it('does not mutate inputs and supports empty groups and group endpoints', () => {
    const input = structuredClone(nodes);
    const links = [...edges, { id: 'group', from: 'client', to: 'cloud' }, { id: 'inside', from: 'app', to: 'a' }];
    expect(layoutFlowchart(nodes, links).edges).toHaveLength(5);
    expect(nodes).toEqual(input);
    expect(layoutFlowchart([{ id: 'empty', isGroup: true, width: 1, height: 1 }], []).nodes[0]!.width).toBeGreaterThan(1);
  });

  it('rejects missing parents, non-group parents, and parent cycles', () => {
    const a = { id: 'a', width: 40, height: 20, parentId: 'b' };
    expect(() => layoutFlowchart([a], [])).toThrow(/parent/);
    expect(() => layoutFlowchart([a, { id: 'b', width: 40, height: 20 }], [])).toThrow(/parent/);
    expect(() => layoutFlowchart([{ ...a, isGroup: true }, { ...a, id: 'b', parentId: 'a', isGroup: true }], [])).toThrow(/cyclic/);
  });
});
