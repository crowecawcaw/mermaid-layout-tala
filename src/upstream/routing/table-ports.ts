// Translated tablePorts from internal/routing/ovg_edge_router.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Orientation as O } from '../geo/orientation.js';
import type { Edge } from '../layoutgraph/edge.js';
import type { Node } from '../layoutgraph/node.js';
import { nodeOrientation } from '../layoutgraph/node-spatial.js';
import { TablePortIndex } from '../nodeshape/shape_table.js';
import type { OVG } from './ovg.js';
import type { OVGNode } from './ovg-node.js';
import type { RouteSearchWorkGuard } from './search-guard.js';
export function tablePorts(
  ovg: OVG,
  edge: Edge,
  source: Node,
  target: Node,
  facing: boolean,
  guard: RouteSearchWorkGuard,
): [Set<OVGNode> | null, Set<OVGNode> | null] {
  const get = (node: Node, column: number, orientations: O[]): Set<OVGNode> => {
    const ports = new Set<OVGNode>();
    for (const o of orientations) {
      guard.Add(BigInt(node.Edges.length) + 1n);
      let [index, tableSide] = TablePortIndex(node.Shape, o, column);
      if (!tableSide) index = node.Shape.PortIndices(o)[column]!;
      ports.add(ovg.Ports.get(node)![index]!);
    }
    return ports;
  };
  let sources: O[] = [],
    targets: O[] = [];
  if (!facing) {
    sources = [O.Right, O.Left];
    targets = [O.Right, O.Left];
  } else
    switch (nodeOrientation(source, target)) {
      case O.Left:
      case O.TopLeft:
      case O.BottomLeft:
        sources = [O.Right];
        targets = [O.Left];
        break;
      case O.Right:
      case O.TopRight:
      case O.BottomRight:
        sources = [O.Left];
        targets = [O.Right];
        break;
    }
  return [
    edge.FromTableColumnIndex !== null
      ? get(source, edge.FromTableColumnIndex, sources)
      : null,
    edge.ToTableColumnIndex !== null
      ? get(target, edge.ToTableColumnIndex, targets)
      : null,
  ];
}
