// Translated internal/placement/stress_initialize.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { validateEngineGraph } from '../layoutgraph/topology-preflight.js';
export function initializeByGraphDistance(ctx: Context, graph: Graph): boolean {
  validateEngineGraph(ctx, 'GraphDistanceInitialization', graph);
  const n = graph.Nodes.length;
  if (
    n < 4 ||
    n > 64 ||
    graph.Edges.length > 256 ||
    graph.Nodes.some((node) => node.FixedTopLeft !== null)
  )
    return false;
  const index = new Map(graph.Nodes.map((node, i) => [node, i]));
  const d = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
  );
  for (const edge of graph.Edges) {
    const i = index.get(edge.From),
      j = index.get(edge.To);
    if (i !== undefined && j !== undefined && i !== j) {
      d[i]![j] = 1;
      d[j]![i] = 1;
    }
  }
  const check = (): void => {
    const err = ctx.Err();
    if (err !== null) throw err;
  };
  for (let k = 0; k < n; k++) {
    check();
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        d[i]![j] = Math.min(d[i]![j]!, d[i]![k]! + d[k]![j]!);
  }
  for (const row of d)
    for (const value of row) if (value === Infinity) return false;
  const x: number[] = [],
    y: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    x.push(Math.sqrt(n) * Math.cos(a));
    y.push(Math.sqrt(n) * Math.sin(a));
  }
  for (let sweep = 0; sweep < 48; sweep++) {
    check();
    const eta = 0.7 * Math.pow(0.02 / 0.7, sweep / 47);
    for (let p = 0; p < n; p++) {
      const i = (p + sweep) % n;
      for (let q = p + 1; q < n; q++) {
        const j = (q + sweep) % n;
        let dx = x[i]! - x[j]!,
          dy = y[i]! - y[j]!,
          length = Math.hypot(dx, dy);
        if (length < 1e-9) {
          dx = 1e-6;
          dy = 1e-6;
          length = Math.sqrt(2) * 1e-6;
        }
        const mu = Math.min(1, eta / (d[i]![j]! * d[i]![j]!)),
          amount = (0.5 * mu * (length - d[i]![j]!)) / length;
        x[i] = x[i]! - dx * amount;
        y[i] = y[i]! - dy * amount;
        x[j] = x[j]! + dx * amount;
        y[j] = y[j]! + dy * amount;
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort(
    (i, j) => graph.Nodes[j]!.Edges.length - graph.Nodes[i]!.Edges.length,
  );
  const occupied = new Set<string>(),
    points: Point[] = [];
  for (const i of order) {
    check();
    const tx = x[i]! * 2 + n,
      ty = y[i]! * 2 + n,
      cx = Round(tx),
      cy = Round(ty);
    let bestX = cx,
      bestY = cy,
      cost = Infinity;
    for (let radius = 0; radius <= n; radius++) {
      for (let xx = cx - radius; xx <= cx + radius; xx++)
        for (let yy = cy - radius; yy <= cy + radius; yy++) {
          if (
            radius > 0 &&
            xx !== cx - radius &&
            xx !== cx + radius &&
            yy !== cy - radius &&
            yy !== cy + radius
          )
            continue;
          if (occupied.has(`${xx},${yy}`)) continue;
          const c = Math.pow(xx - tx, 2) + Math.pow(yy - ty, 2);
          if (c < cost) {
            bestX = xx;
            bestY = yy;
            cost = c;
          }
        }
      if (cost < Infinity) break;
    }
    occupied.add(`${bestX},${bestY}`);
    points[i] = new Point(bestX, bestY);
  }
  check();
  for (let i = 0; i < n; i++) graph.Nodes[i]!.TopLeft = points[i]!;
  return true;
}
