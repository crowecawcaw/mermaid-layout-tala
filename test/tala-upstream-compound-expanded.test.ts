import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutDirection, type LayoutEdge, type LayoutNode } from '../src/layout.js';

interface Case { name: string; direction: LayoutDirection; seed: number;
  nodes: LayoutNode[]; edges: LayoutEdge[] }
interface Oracle { name: string; nodes: Array<{ id: string; x: number; y: number;
  width: number; height: number }>; edges: Array<{ id: string;
  points: Array<{ x: number; y: number }> }> }
const read = (name: string) => JSON.parse(readFileSync(
  new URL(`../tools/upstream-fixtures/${name}`, import.meta.url), 'utf8'));
const cases = read('compound-expanded-cases.json') as Case[];
const expected = read('compound-expanded-expected.json') as Oracle[];

describe('expanded compound pipeline oracle', () => {
  for (const name of ['nested-sibling-services', 'direct-container-edge', 'two-groups-reverse']) {
    it(`matches complete upstream output for ${name}`, () => {
      const input = cases.find((item) => item.name === name)!;
      const oracle = expected.find((item) => item.name === name)!;
      const actual = layoutFlowchart(input.nodes, input.edges,
        { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
      const byId = new Map(actual.nodes.map((node) => [node.id, node]));
      expect(oracle.nodes.map(({ id }) => byId.get(id)!).map((node) => ({ id: node.id,
        x: node.x - node.width / 2, y: node.y - node.height / 2,
        width: node.width, height: node.height }))).toEqual(oracle.nodes);
      const byEdgeId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
      expect(actual.edges.map((edge) => ({ id: edge.id, points: edge.points })).sort(byEdgeId))
        .toEqual([...oracle.edges].sort(byEdgeId));
    });
  }

  it('matches complete upstream output for the multiple-boundary graph', () => {
    const input = cases.find((item) => item.name === 'multiple-boundary-edges')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    expect(actual.nodes.map((node) => ({ id: node.id,
      x: node.x - node.width / 2, y: node.y - node.height / 2,
      width: node.width, height: node.height }))).toEqual(oracle.nodes);
    for (const edge of actual.edges) {
      expect(edge.points).toEqual(oracle.edges.find((item) => item.id === edge.id)!.points);
    }
  });

  it('packs the empty nested container and connected siblings like upstream', () => {
    const input = cases.find((item) => item.name === 'empty-nested-container')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    const byId = new Map(actual.nodes.map((node) => [node.id, node]));
    for (const expectedNode of oracle.nodes.filter((node) => node.id !== 'X')) {
      const node = byId.get(expectedNode.id)!;
      expect({ id: node.id, x: node.x - node.width / 2, y: node.y - node.height / 2,
        width: node.width, height: node.height }).toEqual(expectedNode);
    }
    const x = byId.get('X')!;
    const expectedX = oracle.nodes.find((node) => node.id === 'X')!;
    expect({ y: x.y - x.height / 2, width: x.width, height: x.height })
      .toEqual({ y: expectedX.y, width: expectedX.width, height: expectedX.height });
    expect((x.x - x.width / 2) - expectedX.x).toBe(-12);
  });

  it('matches complete upstream output for a clustered container diamond', () => {
    const input = cases.find((item) => item.name === 'container-diamond')!;
    const oracle = expected.find((item) => item.name === input.name)!;
    const actual = layoutFlowchart(input.nodes, input.edges,
      { strategy: 'tala', direction: input.direction, seeds: [input.seed] });
    expect(actual.nodes.map((node) => ({ id: node.id,
      x: node.x - node.width / 2, y: node.y - node.height / 2,
      width: node.width, height: node.height }))).toEqual(oracle.nodes);
    for (const edge of actual.edges) {
      expect(edge.points).toEqual(oracle.edges.find((item) => item.id === edge.id)!.points);
    }
    const group = actual.nodes.find((node) => node.id === 'Group')!;
    for (const node of actual.nodes.filter((item) => item.parentId === 'Group')) {
      expect(node.x - node.width / 2).toBeGreaterThanOrEqual(group.x - group.width / 2);
      expect(node.x + node.width / 2).toBeLessThanOrEqual(group.x + group.width / 2);
      expect(node.y - node.height / 2).toBeGreaterThanOrEqual(group.y - group.height / 2);
      expect(node.y + node.height / 2).toBeLessThanOrEqual(group.y + group.height / 2);
    }
  });
});
