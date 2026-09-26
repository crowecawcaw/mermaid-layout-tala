import { TalaGraph } from './graph.js';

/**
 * Port of placement.initializeByGraphDistance from upstream TALA.
 * This is the even-seed initial arrangement; the upstream annealing and
 * compaction stages refine it before a result can be rendered.
 */
export function initializeByGraphDistance(graph: TalaGraph): boolean {
  const n = graph.nodes.length;
  if (n < 4 || n > 64 || graph.edges.length > 256) return false;
  const index = new Map(graph.nodes.map((node, i) => [node, i]));
  const distances = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 0 : Infinity));
  for (const edge of graph.edges) {
    const i = index.get(edge.from)!;
    const j = index.get(edge.to)!;
    if (i !== j) distances[i]![j] = distances[j]![i] = 1;
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    distances[i]![j] = Math.min(distances[i]![j]!, distances[i]![k]! + distances[k]![j]!);
  }
  if (distances.some((row) => row.some((distance) => !Number.isFinite(distance)))) return false;

  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < n; i++) {
    const angle = 2 * Math.PI * i / n;
    x.push(Math.sqrt(n) * Math.cos(angle));
    y.push(Math.sqrt(n) * Math.sin(angle));
  }
  for (let sweep = 0; sweep < 48; sweep++) {
    const eta = 0.7 * Math.pow(0.02 / 0.7, sweep / 47);
    for (let p = 0; p < n; p++) {
      const i = (p + sweep) % n;
      for (let q = p + 1; q < n; q++) {
        const j = (q + sweep) % n;
        let dx = x[i]! - x[j]!;
        let dy = y[i]! - y[j]!;
        let length = Math.hypot(dx, dy);
        if (length < 1e-9) {
          dx = dy = 1e-6;
          length = Math.SQRT2 * 1e-6;
        }
        const distance = distances[i]![j]!;
        const mu = Math.min(1, eta / (distance * distance));
        const amount = 0.5 * mu * (length - distance) / length;
        x[i] = x[i]! - dx * amount;
        y[i] = y[i]! - dy * amount;
        x[j] = x[j]! + dx * amount;
        y[j] = y[j]! + dy * amount;
      }
    }
  }

  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((i, j) => graph.nodes[j]!.edges.length - graph.nodes[i]!.edges.length || i - j);
  const occupied = new Set<string>();
  const points = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  for (const i of order) {
    const tx = x[i]! * 2 + n;
    const ty = y[i]! * 2 + n;
    const cx = Math.round(tx);
    const cy = Math.round(ty);
    let bestX = cx, bestY = cy, bestCost = Infinity;
    for (let radius = 0; radius <= n; radius++) {
      for (let xx = cx - radius; xx <= cx + radius; xx++) {
        for (let yy = cy - radius; yy <= cy + radius; yy++) {
          if (radius > 0 && xx !== cx - radius && xx !== cx + radius && yy !== cy - radius && yy !== cy + radius) continue;
          if (occupied.has(`${xx},${yy}`)) continue;
          const cost = (xx - tx) ** 2 + (yy - ty) ** 2;
          if (cost < bestCost) {
            bestX = xx;
            bestY = yy;
            bestCost = cost;
          }
        }
      }
      if (bestCost < Infinity) break;
    }
    occupied.add(`${bestX},${bestY}`);
    points[i] = { x: bestX, y: bestY };
  }
  for (let i = 0; i < n; i++) graph.nodes[i]!.topLeft = points[i]!;
  return true;
}
