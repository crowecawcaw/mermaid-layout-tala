// Translated internal/placement/sized_optimizer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type {
  EdgeAbduction,
  LongDistanceNeighborRequirements,
} from '../layoutgraph/records.js';
import type { Box } from '../geo/box.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { MaxEngineNodes, MaxEngineEdges } from '../limits/work.js';
import {
  OptimizationWorkGuard,
  MaxOptimizationWorkUnits,
} from '../limits/optimization.js';
import { maxEngineTopologyReferences } from '../layoutgraph/topology-preflight.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import { containerFixedOrigin } from '../layoutgraph/containment.js';
import { optimizerFixedOrigin } from './optimizer-ancestry.js';
import {
  optimizerMedian,
  optimizerMedianToNeighbors,
} from './optimizer-metrics.js';
export class SizedSetup {
  readonly fixedOrigin: Point | null;
  readonly symmetryCost: number;
  readonly cellSize: number;
  constructor(
    ctx: Context,
    readonly graph: Graph,
    root: Node | null,
    readonly edgeAbductions: EdgeAbduction[] | null,
    readonly random: { float64(): number } | null,
    readonly obstacles: Box[],
  ) {
    if (graph == null) throw new Error('TALA LocalOptimize requires a graph');
    if (graph.Nodes.length > MaxEngineNodes)
      throw new Error(
        `TALA LocalOptimize node count exceeds limit ${MaxEngineNodes}`,
      );
    if (graph.Edges.length > MaxEngineEdges)
      throw new Error(
        `TALA LocalOptimize edge count exceeds limit ${MaxEngineEdges}`,
      );
    if ((edgeAbductions?.length ?? 0) > MaxEngineEdges)
      throw new Error(
        `TALA LocalOptimize edge abduction count exceeds limit ${MaxEngineEdges}`,
      );
    if (obstacles.length > maxEngineTopologyReferences)
      throw new Error(
        `TALA LocalOptimize obstacle count exceeds limit ${maxEngineTopologyReferences}`,
      );
    if (
      graph.CellSize < 1 ||
      !Number.isFinite(graph.CellSize) ||
      Math.trunc(graph.CellSize) !== graph.CellSize
    )
      throw new Error(
        'TALA LocalOptimize requires a finite positive integer cell size',
      );
    const guard = new OptimizationWorkGuard(
      ctx,
      'LocalOptimizeSetup',
      MaxOptimizationWorkUnits,
    );
    for (const node of graph.Nodes) {
      guard.Step();
      if (node == null || node.Graph === null)
        throw new Error('TALA LocalOptimize found a node without a graph');
      if (
        node.Edges.length > MaxEngineEdges ||
        node.Nears.size > MaxEngineNodes
      )
        throw new Error(
          `TALA LocalOptimize node ${nodeDebugID(node)} adjacency references exceed engine limits`,
        );
      if (node.Graph.CellSize !== graph.CellSize)
        throw new Error(`cell size mismatch for node ${nodeDebugID(node)}`);
    }
    this.fixedOrigin = containerFixedOrigin(graph, root);
    this.symmetryCost = graph.CellSize;
    this.cellSize = graph.CellSize;
    for (const node of graph.Nodes) {
      guard.Step();
      const abducted = new Set<object>(),
        replacements = new Map<Node, Node>();
      for (const ab of edgeAbductions ?? []) {
        guard.Step();
        if (ab == null || ab.Edge == null)
          throw new Error('TALA LocalOptimize found a nil edge abduction');
        if (ab.CurrentFrom === node || ab.CurrentTo === node) {
          if (ab.OriginallyFrom !== null || ab.OriginallyTo !== null) {
            abducted.add(ab.Edge);
            continue;
          }
          const adj = node.Adjacent(ab.Edge);
          if (ab.CurrentFrom === node && ab.OriginallyTo !== null)
            replacements.set(adj, ab.OriginallyTo);
          else if (ab.CurrentTo === node && ab.OriginallyFrom !== null)
            replacements.set(adj, ab.OriginallyFrom);
        }
      }
      const requirements = new Map<Node, LongDistanceNeighborRequirements>();
      for (const edge of node.Edges) {
        guard.Step();
        if (edge == null || (edge.From !== node && edge.To !== node))
          throw new Error(
            `TALA LocalOptimize found a malformed incident edge on ${nodeDebugID(node)}`,
          );
        if (abducted.has(edge)) continue;
        let adjacent = node.Adjacent(edge);
        adjacent = replacements.get(adjacent) ?? adjacent;
        const req = requirements.get(adjacent) ?? {
          EdgeCount: 0,
          MaxWidth: 0,
          MaxHeight: 0,
        };
        req.EdgeCount++;
        if (edge.MinWidth > req.MaxWidth) req.MaxWidth = edge.MinWidth;
        if (edge.MinHeight > req.MaxHeight) req.MaxHeight = edge.MinHeight;
        requirements.set(adjacent, req);
      }
      for (const req of requirements.values()) {
        guard.Step();
        if (req.EdgeCount < 3) continue;
        if (
          req.MaxWidth <= Math.trunc(this.cellSize) &&
          req.MaxHeight <= Math.trunc(this.cellSize)
        )
          continue;
        node.LongDistanceNeighborRequirements = requirements;
        break;
      }
    }
    guard.Finish();
  }
  medianPointGuarded(
    node: Node,
    temp: number,
    children: Node[],
    guard: OptimizationWorkGuard,
  ): Point {
    const width = node.Width / this.cellSize,
      height = node.Height / this.cellSize;
    let [x, y] = optimizerMedianToNeighbors(
      node,
      true,
      this.edgeAbductions,
      guard,
    );
    const origin = optimizerFixedOrigin(this.graph, node.container(), guard);
    if (origin !== null) {
      if (x < origin.X / this.cellSize) {
        x = origin.X / this.cellSize;
        x += temp * width;
      }
      if (y < origin.Y / this.cellSize) {
        y = origin.Y / this.cellSize;
        y += temp * height;
      }
    }
    x += -1.0 * temp * width + this.random!.float64() * (2.0 * temp * width);
    y += -1.0 * temp * height + this.random!.float64() * (2.0 * temp * height);
    if (children.length > 0) {
      const [cx, cy] = optimizerMedian(children, true, guard);
      x -= cx - node.TopLeft!.X / this.cellSize;
      y -= cy - node.TopLeft!.Y / this.cellSize;
    }
    if (origin !== null) {
      x = Math.max(x, origin.X / this.cellSize);
      y = Math.max(y, origin.Y / this.cellSize);
    }
    return new Point(Round(x * this.cellSize), Round(y * this.cellSize));
  }
  protrudingChildrenGuarded(node: Node, guard: OptimizationWorkGuard): Node[] {
    const children: Node[] = [];
    for (const ab of this.edgeAbductions ?? []) {
      guard.Step();
      if (ab == null)
        throw new Error('TALA LocalOptimize found a nil edge abduction');
      if (ab.CurrentFrom === node && ab.OriginallyFrom !== null)
        children.push(ab.OriginallyFrom);
      if (ab.CurrentTo === node && ab.OriginallyTo !== null)
        children.push(ab.OriginallyTo);
    }
    return children;
  }
}
