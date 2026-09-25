import { describe, expect, it } from 'vitest';
import { rankDag, type RankEdge } from '../src/rank.js';
import upstreamRandomCases from './fixtures/upstream-rank-random-cases.json';

interface WeightedInputEdge {
  from: number;
  to: number;
  weight: number;
}

const upstreamRandomWeightedCases = upstreamRandomCases as readonly (readonly WeightedInputEdge[])[];

// Black-box translation of D2 TALA's rank_correctness_test.go at the pinned
// upstream revision. White-box simplex tests are represented by equivalent
// rank and optimal-cost checks because the TypeScript solver keeps its basis private.
describe('TALA DAG ranking port', () => {
  it('finds the optimum for the upstream five-node fixture', () => {
    const graph = [[0, 1], [0, 2], [0, 4], [1, 3], [2, 3], [2, 4]] as const;
    const result = rankDag(nodes(5), edges(graph));
    expect(cost(result, graph)).toBe(7);
  });

  it('finds the weighted-span optimum and improves the longest-path ranking', () => {
    const result = rankDag(
      nodes(4),
      edges([[0, 3], [1, 2], [2, 3]])
    );
    expect([...result.values()]).toEqual([1, 0, 1, 2]);
    expect(cost(result, [[0, 3], [1, 2], [2, 3]])).toBe(3);
  });

  it('normalizes the upstream equal-cost ranking deterministically', () => {
    const graph = [[0, 1], [1, 2], [2, 3], [0, 4], [4, 3]] as const;
    const result = rankDag(nodes(5), edges(graph));
    expect([...result.values()]).toEqual([0, 1, 2, 3, 1]);
    const alternate = new Map([['1', 0], ['2', 1], ['3', 2], ['4', 3], ['5', 2]]);
    expect(cost(result, graph)).toBe(cost(alternate, graph));
    expect(cost(result, graph)).toBe(6);
  });

  it('matches TALA simplex tie choices deterministically', () => {
    const graph = [[0, 1], [2, 3], [4, 0], [4, 3], [5, 1], [5, 2]] as const;
    const first = rankDag(nodes(6), edges(graph));
    const second = rankDag([...nodes(6)].reverse(), [...edges(graph)].reverse());
    expect([...first.values()]).toEqual([2, 3, 1, 2, 1, 0]);
    expect([...second.values()]).toEqual([...first.values()]);
  });

  it('ranks a single edge whose source has a larger ID than its target', () => {
    const result = rankDag(nodes(2), [{ id: 'backward-id-edge', from: '2', to: '1', weight: 3 }]);
    expect([...result.values()]).toEqual([1, 0]);
  });

  it('passes the upstream tree-flow fixture through its optimality certificate', () => {
    const graph = [
      { from: 0, to: 1, weight: 2 },
      { from: 0, to: 2, weight: 1 },
      { from: 0, to: 3, weight: 1 },
      { from: 1, to: 3, weight: 1 },
      { from: 2, to: 3, weight: 3 },
    ];
    const result = rankDag(nodes(4), weightedEdges(graph));
    expect(weightedCost(result, graph)).toBe(9);
  });

  it('completes the upstream degenerate Bland-pivot fixture deterministically', () => {
    const pairs = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 3], [2, 4]] as const;
    const weights = [1, 1, 1, 1, 2, 2];
    const graph = pairs.map(([from, to], index) => ({ from, to, weight: weights[index]! }));
    const result = rankDag(nodes(5), weightedEdges(graph));
    expect([...result.values()]).toEqual([0, 1, 1, 2, 2]);
    expect(weightedCost(result, graph)).toBe(8);
  });

  it('completes the upstream 250-node, 1,000-edge exchange graph', () => {
    const graph = manyExchangeGraph(25, 10, 1_000);
    const ids = Array.from({ length: 250 }, (_unused, index) => String(index + 1).padStart(3, '0'));
    const rankNodes = ids.map((id) => ({ id }));
    const rankEdges = graph.map((edge, index) => ({
      id: String(index + 1).padStart(4, '0'),
      from: ids[edge.from]!,
      to: ids[edge.to]!,
      weight: edge.weight,
    }));
    const result = rankDag(rankNodes, rankEdges);
    expect(result.size).toBe(250);
    for (const edge of graph) {
      expect(result.get(ids[edge.to]!)!).toBeGreaterThan(result.get(ids[edge.from]!)!);
    }
  });

  it('preserves parallel-edge influence through rank weights', () => {
    const graph = [[0, 1], [1, 2], [2, 3], [0, 4]] as const;
    const rankedEdges: RankEdge[] = [
      ...edges(graph),
      { id: 'parallel-group', from: '5', to: '4', weight: 10 },
    ];
    const result = rankDag(nodes(5), rankedEdges);
    const actual = cost(result, [...graph, ...Array.from({ length: 10 }, () => [4, 3] as const)]);
    expect(actual).toBe(15);
  });

  it('matches TALA optimum costs for every connected forward DAG through five nodes', () => {
    for (let count = 2; count <= 5; count++) {
      const pairs: Array<readonly [number, number]> = [];
      for (let from = 0; from < count; from++) {
        for (let to = from + 1; to < count; to++) pairs.push([from, to]);
      }
      for (let mask = 1; mask < 2 ** pairs.length; mask++) {
        const graph = pairs.filter((_pair, i) => (mask & (1 << i)) !== 0);
        if (!isConnected(count, graph)) continue;
        const result = rankDag(nodes(count), edges(graph));
        expect(cost(result, graph), `nodes=${count}, mask=${mask}`).toBe(minimumCost(count, graph));
      }
    }
  });

  it('matches weighted TALA optima when edge weights can change the chosen ranks', () => {
    for (let count = 2; count <= 4; count++) {
      const pairs: Array<readonly [number, number]> = [];
      for (let from = 0; from < count; from++) {
        for (let to = from + 1; to < count; to++) pairs.push([from, to]);
      }
      let cases = 3 ** pairs.length;
      for (let encoded = 1; encoded < cases; encoded++) {
        let digits = encoded;
        const graph: Array<{ from: number; to: number; weight: number }> = [];
        for (const [from, to] of pairs) {
          const digit = digits % 3;
          digits = Math.floor(digits / 3);
          if (digit !== 0) graph.push({ from, to, weight: digit === 1 ? 1 : 3 });
        }
        const pairGraph = graph.map((edge) => [edge.from, edge.to] as const);
        if (!isConnected(count, pairGraph)) continue;
        const weightedEdges = graph.map((edge, i) => ({
          id: `e${i + 1}`,
          from: String(edge.from + 1),
          to: String(edge.to + 1),
          weight: edge.weight,
        }));
        const result = rankDag(nodes(count), weightedEdges);
        expect(weightedCost(result, graph), `nodes=${count}, encoded=${encoded}`).toBe(minimumWeightedCost(count, graph));
      }
    }
  });

  it('matches optimal costs for the exact Go-seeded random DAG corpus', () => {
    for (const [testCase, graph] of upstreamRandomWeightedCases.entries()) {
      const result = rankDag(nodes(5), weightedEdges(graph));
      expect(weightedCost(result, graph), `upstream seeded case=${testCase}`).toBe(minimumWeightedCost(5, graph));
    }
  });

  it('is independent of the upstream weighted graph input order', () => {
    const pairs = [[0, 1], [0, 2], [0, 4], [1, 3], [2, 3], [2, 4], [3, 5], [4, 5]] as const;
    const graph = pairs.map(([from, to], index) => ({ from, to, weight: index % 4 + 1 }));
    const rankEdges = weightedEdges(graph);
    const first = rankDag(nodes(6), rankEdges);
    const second = rankDag([...nodes(6)].reverse(), [...rankEdges].reverse());
    expect([...second.entries()].sort(([a], [b]) => Number(a) - Number(b))).toEqual([...first.entries()]);
  });

  it('rejects cycles and disconnected graphs', () => {
    expect(() => rankDag(nodes(3), edges([[0, 1], [1, 2], [2, 0]]))).toThrow(/cycle/);
    expect(() => rankDag(nodes(3), edges([[0, 1]]))).toThrow(/disconnected/);
  });

  it('rejects invalid explicit rank weights', () => {
    for (const weight of [-1, 0, 10_001]) {
      expect(() => rankDag(nodes(2), [{ id: 'e1', from: '1', to: '2', weight }])).toThrow(/invalid rank weight/);
    }
  });
});

function nodes(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: String(i + 1) }));
}

function edges(pairs: readonly (readonly [number, number])[]): RankEdge[] {
  return pairs.map(([from, to], i) => ({ id: String(i + 1), from: String(from + 1), to: String(to + 1) }));
}

function isConnected(count: number, pairs: readonly (readonly [number, number])[]): boolean {
  const adjacency = Array.from({ length: count }, () => [] as number[]);
  for (const [from, to] of pairs) {
    adjacency[from]!.push(to);
    adjacency[to]!.push(from);
  }
  const seen = new Set([0]);
  const queue = [0];
  for (let i = 0; i < queue.length; i++) {
    for (const next of adjacency[queue[i]!]!) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === count;
}

function minimumCost(count: number, graph: readonly (readonly [number, number])[]): number {
  return minimumObjective(count, graph.map(([from, to]) => ({ from, to, weight: 1 })));
}

function minimumWeightedCost(count: number, graph: readonly { from: number; to: number; weight: number }[]): number {
  return minimumObjective(count, graph);
}

function minimumObjective(count: number, graph: readonly { from: number; to: number; weight: number }[]): number {
  let best = Number.POSITIVE_INFINITY;
  const levels = Array.from({ length: count }, () => 0);
  const assign = (i: number) => {
    if (i < count) {
      for (let level = 0; level < count; level++) {
        levels[i] = level;
        assign(i + 1);
      }
      return;
    }
    let value = 0;
    for (const edge of graph) {
      const span = levels[edge.to]! - levels[edge.from]!;
      if (span < 1) return;
      value += edge.weight * span;
    }
    best = Math.min(best, value);
  };
  assign(0);
  return best;
}

function cost(result: Map<string, number>, graph: readonly (readonly [number, number])[]): number {
  return weightedCost(result, graph.map(([from, to]) => ({ from, to, weight: 1 })));
}

function weightedCost(result: Map<string, number>, graph: readonly { from: number; to: number; weight: number }[]): number {
  return graph.reduce((sum, edge) => sum + edge.weight * (result.get(String(edge.to + 1))! - result.get(String(edge.from + 1))!), 0);
}

function weightedEdges(graph: readonly WeightedInputEdge[]): RankEdge[] {
  return graph.map((edge, index) => ({
    id: String(index + 1),
    from: String(edge.from + 1),
    to: String(edge.to + 1),
    weight: edge.weight,
  }));
}

function manyExchangeGraph(width: number, height: number, edgeCount: number): WeightedInputEdge[] {
  const nodeCount = width * height;
  if (edgeCount < width * (height - 1) || edgeCount > nodeCount * (nodeCount - 1) / 2) {
    throw new Error(`invalid many-exchange graph size: ${width}x${height}, ${edgeCount} edges`);
  }
  const graph: WeightedInputEdge[] = [];
  const connect = (fromLayer: number, fromColumn: number, toLayer: number, toColumn: number) => {
    const from = fromLayer * width + fromColumn;
    const to = toLayer * width + toColumn;
    graph.push({ from, to, weight: 1 + (from * 31 + to * 17) % 997 });
  };
  for (let layer = 0; layer + 1 < height; layer++) {
    for (let column = 0; column < width; column++) connect(layer, column, layer + 1, column);
  }
  for (let span = 2; graph.length < edgeCount && span < height; span++) {
    for (let layer = 0; layer + span < height && graph.length < edgeCount; layer++) {
      for (let column = 0; column < width && graph.length < edgeCount; column++) {
        connect(layer, column, layer + span, (column + span - 1) % width);
      }
    }
  }
  if (graph.length !== edgeCount) throw new Error(`could only create ${graph.length} of ${edgeCount} edges`);
  return graph;
}
