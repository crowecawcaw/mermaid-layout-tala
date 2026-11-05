// Translated internal/placement/sized_optimizer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { MaxEngineNodes, MaxEngineEdges } from '../limits/work.js';
export function iterPlacementsAroundPoint(
  node: Node,
  x: number,
  y: number,
  minimizingSelf: boolean,
  apply: (x: number, y: number) => boolean,
): void {
  const width = node.Width,
    height = node.Height;
  x *= node.Graph!.CellSize;
  y *= node.Graph!.CellSize;
  const increment = node.Graph!.CellSize;
  if (apply(x, y) || !minimizingSelf) return;
  for (let currentX = x - width; currentX <= x; currentX += increment)
    for (let currentY = y - height; currentY <= y; currentY += increment) {
      if (currentX === x && currentY === y) continue;
      if (apply(currentX, currentY)) return;
    }
}
export function withHubSpokesSuppressed(
  node: Node | null,
  spokes: Node[],
  guard: OptimizationWorkGuard,
  fn: () => void,
): void {
  if (node === null)
    throw new Error('TALA LocalOptimize cannot suppress spokes on a nil hub');
  if (spokes.length > MaxEngineNodes || node.Edges.length > MaxEngineEdges)
    throw new Error(
      'TALA LocalOptimize hub suppression inputs exceed engine limits',
    );
  const original = node.Edges,
    removed = new Array<boolean>(original.length).fill(false);
  try {
    for (const spoke of spokes) {
      guard.Step();
      if (spoke == null)
        throw new Error('TALA LocalOptimize found a nil hub spoke');
      for (let i = 0; i < original.length; i++) {
        guard.Step();
        if (removed[i]) continue;
        const edge = original[i];
        if (edge == null || (edge.From !== node && edge.To !== node))
          throw new Error('TALA LocalOptimize found a malformed hub edge');
        if (node.Adjacent(edge) === spoke) {
          removed[i] = true;
          break;
        }
      }
    }
    const working = [];
    for (let i = 0; i < original.length; i++) {
      guard.Step();
      if (!removed[i]) working.push(original[i]!);
    }
    node.Edges = working;
    fn();
  } finally {
    node.Edges = original;
  }
}
