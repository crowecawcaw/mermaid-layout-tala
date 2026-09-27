import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutFlowchart, type LayoutDirection, type LayoutEdge,
  type LayoutNode } from '../src/layout.js';
import { discoverFlatHierarchy, placeFlatHierarchy } from '../src/tala/hierarchy-flat.js';
import { prescaleNodes } from '../src/tala/prescale.js';

interface Case {
  name: string;
  direction: LayoutDirection;
  seed: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}
const cases = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-cases.json',
  import.meta.url), 'utf8')) as Case[];
const completed = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-expected.json',
  import.meta.url), 'utf8')) as Array<{ name: string; nodes: Array<{
    id: string; x: number; y: number; width: number; height: number;
  }> }>;
const curatedStage = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-stage-expected.json',
  import.meta.url), 'utf8')) as typeof completed;
const generated = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-generated-cases.json',
  import.meta.url), 'utf8')) as Case[];
const generatedStage = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-generated-stage-expected.json',
  import.meta.url), 'utf8')) as typeof completed;
const generatedCompleted = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-generated-expected.json',
  import.meta.url), 'utf8')) as typeof completed;
const mixed = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-mixed-cases.json',
  import.meta.url), 'utf8')) as Case[];
const mixedStage = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-mixed-stage-expected.json',
  import.meta.url), 'utf8')) as typeof completed;
const mixedCompleted = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/hierarchy-mixed-expected.json',
  import.meta.url), 'utf8')) as typeof completed;
const expected = new Map(curatedStage.filter((item) => item.nodes.length > 0)
  .map((item) => [item.name, item.nodes.map((node) => [node.x, node.y])]));

describe('pinned upstream flat hierarchy placement', () => {
  for (const input of mixed) {
    it(`${input.name} matches the Go hierarchy stage after DAG simplification`, () => {
      const oracle = mixedStage.find((item) => item.name === input.name)!;
      const scaled = prescaleNodes(input.nodes, input.edges);
      const levels = discoverFlatHierarchy(scaled, input.edges, input.direction);
      expect(levels).toBeDefined();
      const result = placeFlatHierarchy(scaled, input.edges, levels!,
        input.direction, input.seed);
      expect(result.map((node) => ({ id: node.id,
        x: node.x - node.width / 2, y: node.y - node.height / 2,
        width: node.width, height: node.height }))).toEqual(oracle.nodes);
    });
  }
  for (const input of mixed.filter((item) => ['parallel-edges', 'undirected-cross-edge',
    'two-feedback-edges', 'bidirectional-cross-edge']
    .includes(item.name))) {
    it(`${input.name} matches completed Go node geometry through the public API`, () => {
      const oracle = mixedCompleted.find((item) => item.name === input.name)!;
      const result = layoutFlowchart(input.nodes, input.edges, {
        strategy: 'tala', direction: input.direction, seeds: [input.seed],
      });
      const actualReference = result.nodes.find((node) => node.id === oracle.nodes[0]!.id)!;
      const reference = oracle.nodes[0]!;
      for (const node of oracle.nodes) {
        const actual = result.nodes.find((candidate) => candidate.id === node.id)!;
        expect([actual.width, actual.height]).toEqual([node.width, node.height]);
        expect(actual.x - actual.width / 2 - actualReference.x + actualReference.width / 2)
          .toBe(node.x - reference.x);
        expect(actual.y - actual.height / 2 - actualReference.y + actualReference.height / 2)
          .toBe(node.y - reference.y);
      }
    });
  }
  for (const input of generated) {
    it(`${input.name} matches the generated Go PreprocessHierarchies stage`, () => {
      const oracle = generatedStage.find((item) => item.name === input.name)!;
      const scaled = prescaleNodes(input.nodes, input.edges);
      const levels = discoverFlatHierarchy(scaled, input.edges, input.direction);
      expect(levels).toBeDefined();
      const result = placeFlatHierarchy(scaled, input.edges, levels!,
        input.direction, input.seed);
      expect(result.map((node) => ({ id: node.id,
        x: node.x - node.width / 2, y: node.y - node.height / 2,
        width: node.width, height: node.height }))).toEqual(oracle.nodes);
    });
  }

  for (const input of generated.filter((item) => ['layered-1', 'layered-2',
    'layered-3', 'layered-8', 'layered-9', 'layered-10']
    .includes(item.name))) {
    it(`${input.name} matches the complete Go node and route output`, () => {
      const oracle = generatedCompleted.find((item) => item.name === input.name)! as
        typeof generatedCompleted[number] & { edges: Array<{ id: string;
          points: Array<{ x: number; y: number }> }> };
      const result = layoutFlowchart(input.nodes, input.edges, {
        strategy: 'tala', direction: input.direction, seeds: [input.seed],
      });
      const anchor = result.nodes.find((node) => node.id === oracle.nodes[0]!.id)!;
      const dx = anchor.x - anchor.width / 2 - oracle.nodes[0]!.x;
      const dy = anchor.y - anchor.height / 2 - oracle.nodes[0]!.y;
      expect(oracle.nodes.map((node) => {
        const placed = result.nodes.find((candidate) => candidate.id === node.id)!;
        return { id: node.id, x: placed.x - placed.width / 2 - dx,
          y: placed.y - placed.height / 2 - dy,
          width: placed.width, height: placed.height };
      })).toEqual(oracle.nodes);
      expect(oracle.edges.map((edge) => ({ id: edge.id,
        points: result.edges.find((candidate) => candidate.id === edge.id)!.points.map((point) => ({
          x: point.x - dx, y: point.y - dy,
        })) }))).toEqual(oracle.edges);
    });
  }

  for (const input of mixed.filter((item) => ['parallel-edges',
    'undirected-cross-edge', 'two-feedback-edges'].includes(item.name))) {
    it(`${input.name} matches the complete Go edge routes`, () => {
      const oracle = mixedCompleted.find((item) => item.name === input.name)! as
        typeof mixedCompleted[number] & { edges: Array<{ id: string;
          points: Array<{ x: number; y: number }> }> };
      const result = layoutFlowchart(input.nodes, input.edges, {
        strategy: 'tala', direction: input.direction, seeds: [input.seed],
      });
      const anchor = result.nodes.find((node) => node.id === oracle.nodes[0]!.id)!;
      const dx = anchor.x - anchor.width / 2 - oracle.nodes[0]!.x;
      const dy = anchor.y - anchor.height / 2 - oracle.nodes[0]!.y;
      expect(oracle.edges.map((edge) => ({ id: edge.id,
        points: result.edges.find((candidate) => candidate.id === edge.id)!.points.map((point) => ({
          x: point.x - dx, y: point.y - dy,
        })) }))).toEqual(oracle.edges);
    });
  }

  for (const input of generated) {
    it(`${input.name} matches completed Go node geometry through the public API`, () => {
      const oracle = generatedCompleted.find((item) => item.name === input.name)!;
      const result = layoutFlowchart(input.nodes, input.edges, {
        strategy: 'tala', direction: input.direction, seeds: [input.seed],
      });
      const actualReference = result.nodes.find((node) => node.id === oracle.nodes[0]!.id)!;
      const reference = oracle.nodes[0]!;
      for (const node of oracle.nodes) {
        const actual = result.nodes.find((candidate) => candidate.id === node.id)!;
        expect([actual.width, actual.height]).toEqual([node.width, node.height]);
        expect(actual.x - actual.width / 2 - actualReference.x + actualReference.width / 2)
          .toBe(node.x - reference.x);
        expect(actual.y - actual.height / 2 - actualReference.y + actualReference.height / 2)
          .toBe(node.y - reference.y);
      }
    });
  }
  for (const input of cases) {
    it(`${input.name} matches the Go PreprocessHierarchies stage`, () => {
      const levels = discoverFlatHierarchy(input.nodes, input.edges, input.direction);
      const positions = expected.get(input.name);
      if (!positions) {
        expect(levels).toBeUndefined();
        return;
      }
      expect([...levels!.values()]).toEqual([0, 1, 1, 2, 2, 3]);
      const result = placeFlatHierarchy(input.nodes, input.edges, levels!,
        input.direction, input.seed);
      expect(result.map((node) => [node.x - node.width / 2,
        node.y - node.height / 2])).toEqual(positions);
    });
  }

  for (const input of cases.filter((item) => expected.has(item.name))) {
    it(`${input.name} matches completed Go node geometry through the public API`, () => {
      const oracle = completed.find((item) => item.name === input.name)!;
      const result = layoutFlowchart(input.nodes, input.edges, {
        strategy: 'tala', direction: input.direction, seeds: [input.seed],
      });
      const actualReference = result.nodes.find((node) => node.id === oracle.nodes[0]!.id)!;
      const reference = oracle.nodes[0]!;
      for (const node of oracle.nodes) {
        const actual = result.nodes.find((candidate) => candidate.id === node.id)!;
        expect(actual.width).toBe(node.width);
        expect(actual.height).toBe(node.height);
        expect(actual.x - actual.width / 2 - actualReference.x + actualReference.width / 2)
          .toBe(node.x - reference.x);
        expect(actual.y - actual.height / 2 - actualReference.y + actualReference.height / 2)
          .toBe(node.y - reference.y);
      }
    });
  }
});
