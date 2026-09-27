import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TalaGraph } from '../src/tala/graph.js';
import { alignAxesPass } from '../src/tala/alignment-search.js';
import { ordinaryPlacementEdgeLength } from '../src/tala/placement-edge-length.js';
import { containerAlignmentCost } from '../src/tala/container-alignment-cost.js';
import { equidistance } from '../src/tala/equidistance.js';
import type { LayoutDirection, LayoutEdge, LayoutNode } from '../src/layout.js';

interface Case { name: string; direction: LayoutDirection; nodes: LayoutNode[];
  edges: LayoutEdge[] }
const cases = JSON.parse(readFileSync(new URL(
  '../tools/upstream-fixtures/compound-generated-cases.json', import.meta.url), 'utf8')) as Case[];
type Box = [number, number, number, number];

function graphAt(boxes: Record<string, Box>): TalaGraph {
  const input = cases.find((item) => item.name === 'chain-LR-3')!;
  const graph = TalaGraph.fromFlowchart(input.nodes, input.edges, input.direction);
  for (const node of graph.nodes) {
    const [x, y, width, height] = boxes[node.id]!;
    node.topLeft = { x, y };
    node.width = width;
    node.height = height;
  }
  graph.cellSize = 48;
  const n0 = graph.nodes.find((node) => node.id === 'N0')!;
  const n2 = graph.nodes.find((node) => node.id === 'N2')!;
  n0.nears.add(n2);
  n2.nears.add(n0);
  return graph;
}

function boxes(graph: TalaGraph): Record<string, Box> {
  return Object.fromEntries(graph.nodes.map((node) => [node.id,
    [node.topLeft!.x, node.topLeft!.y, node.width, node.height]]));
}

describe('compound alignment and equidistance against Go stages', () => {
  it('aligns across container boundaries without counting cross-level ray crossings', () => {
    const graph = graphAt({
      Group: [171, -4, 436, 159], N0: [231, 63, 58, 32],
      N1: [477, 56, 70, 39], N2: [313, 63, 82, 32],
      Input: [0, 50, 75, 43], Output: [285, 224, 82, 38],
    });
    expect(alignAxesPass(graph, (candidate) => ordinaryPlacementEdgeLength(candidate)
      + containerAlignmentCost(candidate))).toBe(true);
    expect(boxes(graph)).toEqual({
      Group: [171, -4, 436, 159], N0: [231, 59, 58, 32],
      N1: [477, 56, 70, 39], N2: [313, 59, 82, 32],
      Input: [0, 54, 75, 43], Output: [285, 220, 82, 38],
    });
  });

  it('moves a near sibling and side branch when the solo move loses clearance', () => {
    const graph = graphAt({
      Group: [171, -4, 436, 159], N0: [231, 59, 58, 32],
      N1: [477, 56, 70, 39], N2: [313, 59, 82, 32],
      Input: [0, 54, 75, 43], Output: [272, 220, 82, 38],
    });
    expect(equidistance(graph)).toBe(true);
    expect(boxes(graph)).toEqual({
      Group: [187, -4, 420, 159], N0: [247, 59, 58, 32],
      N1: [477, 56, 70, 39], N2: [329, 59, 82, 32],
      Input: [0, 54, 75, 43], Output: [288, 220, 82, 38],
    });
  });
});
