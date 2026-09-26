import { compactOrdinaryGraph, type OrdinaryCompactionOptions } from './compaction-search.js';
import { GoRandom } from './go-rng.js';
import { TalaGraph } from './graph.js';
import { initializeByGraphDistance } from './graph-distance.js';
import { initializeNodes } from './initialize-nodes.js';
import { joinDistancedClusters } from './join-distanced-clusters.js';
import { SizedOptimizer } from './sized-optimizer.js';
import { SizelessOptimizer } from './sizeless-optimizer.js';

/** The ordinary-node branch of placement.placeNodesOrthogonally. */
export function placeOrdinaryNodes(graph: TalaGraph, seed: number,
  trace?: (stage: string, iteration: number, graph: TalaGraph) => void): void {
  if (graph.nodes.length < 2) throw new Error('ordinary placement requires at least two nodes');
  if (graph.nodes.some((node) => node.isGroup)) throw new Error('compound placement is not ported');
  const random = new GoRandom(seed);
  if (seed % 2 !== 0 || !initializeByGraphDistance(graph)) initializeNodes(graph);
  trace?.('initialized', -1, graph);

  const count = Math.trunc(90 * Math.sqrt(graph.nodes.length));
  let temp = 2 * Math.sqrt(graph.nodes.length);
  const cooling = Math.pow(0.2 / temp, 1 / count);
  let compactionAxis: 'x' | 'y' = 'x';
  const compact = (options: OrdinaryCompactionOptions) => compactOrdinaryGraph(graph, options);

  const sizeless = new SizelessOptimizer(graph, random);
  for (let i = 0; i < Math.trunc(count / 2); i++) {
    sizeless.optimize(temp);
    trace?.('sizeless', i, graph);
    if (i % 9 === 0) {
      compact({ axis: compactionAxis, includeSizes: false, factor: 3 });
      compactionAxis = opposite(compactionAxis);
      sizeless.resetOccupied();
      trace?.('sizeless-compaction', i, graph);
    }
    temp *= cooling;
  }

  compact({ axis: 'x', includeSizes: true, factor: 3, transition: true });
  compact({ axis: 'y', includeSizes: true, factor: 3, transition: true });
  trace?.('transition', -1, graph);
  alignFixedPositions(graph);
  for (const node of graph.nodes) {
    if (node.fixedTopLeft) continue;
    node.topLeft = {
      x: Math.floor(node.topLeft!.x / graph.cellSize) * graph.cellSize,
      y: Math.floor(node.topLeft!.y / graph.cellSize) * graph.cellSize,
    };
  }
  graph.turnCost();
  graph.halveTurnCost();

  const sized = new SizedOptimizer(graph, random);
  for (let i = Math.trunc(count / 2) + 1; i < count; i++) {
    sized.optimize(temp);
    trace?.('sized', i, graph);
    if (i % 9 === 0) {
      const factor = Math.max(1, 1 + 2 * (count - i - 30) / (0.5 * count));
      compact({ axis: compactionAxis, includeSizes: true, factor });
      compactionAxis = opposite(compactionAxis);
      trace?.('sized-compaction', i, graph);
      joinDistancedClusters(graph);
    }
    temp *= cooling;
  }
  joinDistancedClusters(graph);
  for (let i = 0; i < 10; i++) {
    if (!sized.optimize(0)) break;
    trace?.('final', i, graph);
  }
  alignFixedPositions(graph);
  for (const node of graph.nodes) {
    if (Object.is(node.topLeft!.x, -0)) node.topLeft!.x = 0;
    if (Object.is(node.topLeft!.y, -0)) node.topLeft!.y = 0;
  }
}

function alignFixedPositions(graph: TalaGraph): void {
  const fixed = graph.nodes.filter((node) => node.fixedTopLeft);
  if (fixed.length === 0) return;
  const dx = fixed[0]!.fixedTopLeft!.x - fixed[0]!.topLeft!.x;
  const dy = fixed[0]!.fixedTopLeft!.y - fixed[0]!.topLeft!.y;
  for (const node of graph.nodes) node.topLeft = { x: node.topLeft!.x + dx, y: node.topLeft!.y + dy };
  for (const node of fixed) node.topLeft = { ...node.fixedTopLeft! };
}

function opposite(axis: 'x' | 'y'): 'x' | 'y' { return axis === 'x' ? 'y' : 'x'; }
