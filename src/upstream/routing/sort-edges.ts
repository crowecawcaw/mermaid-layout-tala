// Translated sortEdges from internal/routing/ovg_edge_router.go at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { goStableSort } from '../../stable-sort.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Node } from '../layoutgraph/node.js';
import { distance } from '../layoutgraph/node-spatial.js';
export type RouteGenerationFlavor =
  'ShortestToLongest' | 'LongestToShortest' | 'TopDownLeftRight' | 'Default';
export function sortEdges(
  flavor: RouteGenerationFlavor,
  edges: Edge[],
  clusterNodes: Set<Node>,
): void {
  if (flavor === 'ShortestToLongest' || flavor === 'LongestToShortest')
    goStableSort(edges, (a, b) => {
      const x = distance(a.From, a.To, true),
        y = distance(b.From, b.To, true);
      return flavor === 'ShortestToLongest'
        ? x < y
          ? -1
          : y < x
            ? 1
            : 0
        : x > y
          ? -1
          : y > x
            ? 1
            : 0;
    });
  else if (flavor === 'TopDownLeftRight')
    goStableSort(edges, (a, b) => {
      let af = a.From,
        at = a.To,
        bf = b.From,
        bt = b.To;
      if (af.TopLeft!.Y > at.TopLeft!.Y) [af, at] = [at, af];
      if (bf.TopLeft!.Y > bt.TopLeft!.Y) [bf, bt] = [bt, bf];
      const cmp = (x: number, y: number) => (x < y ? -1 : y < x ? 1 : 0);
      if (af.TopLeft!.Y !== bf.TopLeft!.Y)
        return cmp(af.TopLeft!.Y, bf.TopLeft!.Y);
      if (af !== bf) return cmp(af.TopLeft!.X, bf.TopLeft!.X);
      if (at.TopLeft!.Y === bt.TopLeft!.Y)
        return cmp(at.TopLeft!.X, bt.TopLeft!.X);
      return cmp(at.TopLeft!.Y, bt.TopLeft!.Y);
    });
  goStableSort(edges, (a, b) => {
    const aa = clusterNodes.has(a.From) || clusterNodes.has(a.To),
      bb = clusterNodes.has(b.From) || clusterNodes.has(b.To);
    return aa && !bb ? -1 : !aa && bb ? 1 : 0;
  });
}
