import { afterAll, describe, expect, it } from 'vitest';
import { disposeTala, layoutWithTala, toD2 } from '../src/upstream.js';

afterAll(disposeTala);

describe('official TALA engine adapter', () => {
  it('lays out nested containers and routes parallel edges through the original engine', async () => {
    const nodes = [
      { id: 'cloud', isGroup: true, label: 'Cloud', width: 50, height: 20 },
      { id: 'app', isGroup: true, parentId: 'cloud', label: 'Application', width: 50, height: 20 },
      { id: 'api', parentId: 'app', label: 'API', width: 90, height: 40 },
      { id: 'database', parentId: 'cloud', label: 'Database', shape: 'cylinder', width: 100, height: 60 },
      { id: 'client', label: 'Client', width: 80, height: 35 },
    ];
    const edges = [
      { id: 'client-api', from: 'client', to: 'api' },
      { id: 'api-db', from: 'api', to: 'database', label: 'read' },
      { id: 'api-db-retry', from: 'api', to: 'database', label: 'retry' },
    ];
    const result = await layoutWithTala(nodes, edges, { direction: 'LR', seeds: [1] });
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    const contains = (containerId: string, childId: string) => {
      const outer = byId.get(containerId)!;
      const inner = byId.get(childId)!;
      expect(inner.x - inner.width / 2).toBeGreaterThan(outer.x - outer.width / 2);
      expect(inner.x + inner.width / 2).toBeLessThan(outer.x + outer.width / 2);
      expect(inner.y - inner.height / 2).toBeGreaterThan(outer.y - outer.height / 2);
      expect(inner.y + inner.height / 2).toBeLessThan(outer.y + outer.height / 2);
    };
    contains('cloud', 'app');
    contains('app', 'api');
    contains('cloud', 'database');
    expect(result.edges).toHaveLength(edges.length);
    for (const edge of result.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      expect(edge.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    }
    expect(result.edges[1]!.points).not.toEqual(result.edges[2]!.points);
  });

  it('keeps Mermaid IDs separate from D2 paths and validates TALA seeds', () => {
    const converted = toD2([
      { id: 'a.b', isGroup: true, width: 20, height: 20 },
      { id: 'node with spaces', parentId: 'a.b', width: 70.2, height: 30.4 },
    ], [], { seeds: [3, 5] });
    expect(converted.names.get('node with spaces')).toBe('g0.n1');
    expect(converted.source).toContain('width: 71');
    expect(converted.source).toContain('tala-seeds: [3, 5]');
    expect(() => toD2([], [], { seeds: [] })).toThrow(/seeds/);
  });

  it('keeps cycles, self loops, and disconnected components routable', async () => {
    const result = await layoutWithTala(
      [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 80, height: 40 },
        { id: 'solo', width: 60, height: 30 },
      ],
      [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'ba', from: 'b', to: 'a' },
        { id: 'loop', from: 'b', to: 'b' },
      ],
      { direction: 'TB', seeds: [1] },
    );
    expect(result.nodes).toHaveLength(3);
    expect(result.edges.map((edge) => edge.id)).toEqual(['ab', 'ba', 'loop']);
    expect(result.edges.every((edge) => edge.points.length >= 2)).toBe(true);
    expect(result.edges.every((edge) => edge.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))).toBe(true);
  });
});
