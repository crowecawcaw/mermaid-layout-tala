// Translated OVG post-connection scans from internal/routing/ovg.go and
// ovg_resource.go at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc.
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import { isPointOnNode } from '../layoutgraph/node-spatial.js';
import type { OVG } from './ovg.js';
import type { OVGBuildGuard } from './ovg-resource.js';
import type { OVGNode } from './ovg-node.js';
export function containerRDFSOrder(
  graph: Graph,
  root: Node | null,
  guard: OVGBuildGuard,
): Node[] {
  const order: Node[] = [];
  if (root !== null && !root.IsContainer()) {
    guard.Check();
    return order;
  }
  const children = graph.Containers.get(root) ?? [];
  for (let i = children.length - 1; i >= 0; i--) {
    guard.Step();
    const child = children[i]!;
    if (child.IsContainer()) {
      order.push(...containerRDFSOrder(graph, child, guard), child);
      continue;
    }
    if (child.IsClusterVessel()) {
      const nodes = graph.Clusters.get(child)!.Nodes;
      for (let j = nodes.length - 1; j >= 0; j--) {
        guard.Step();
        const node = nodes[j]!;
        if (!node.IsContainer()) continue;
        order.push(...containerRDFSOrder(graph, node, guard), node);
      }
    }
  }
  guard.Check();
  return order;
}
export function mapNodesToContainer(
  ovg: OVG,
  g: Graph,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  const order = containerRDFSOrder(g, null, guard);
  for (const node of ovg.Nodes) {
    guard.Step();
    for (const container of order) {
      guard.Step();
      if (isPointOnNode(container, node.Point)) {
        node.Container = container;
        break;
      }
    }
  }
}
export function flagNodesNearPorts(ovg: OVG, guard: OVGBuildGuard): void {
  guard.Check();
  for (const [owner, ports] of ovg.Ports) {
    guard.Step();
    for (const port of ports) {
      guard.Step();
      const seen = new Set<OVGNode>([port]),
        queue: OVGNode[] = [];
      for (const e of port.Edges) {
        guard.Step();
        const adjacent = port.Adjacent(e);
        if (adjacent.X !== port.X && adjacent.Y !== port.Y) continue;
        queue.push(adjacent);
      }
      for (let i = 0; i < queue.length; i++) {
        guard.Step();
        const current = queue[i]!;
        if (seen.has(current)) continue;
        seen.add(current);
        if (!current.isPortOf(owner)) {
          if (
            Math.abs(current.Y - port.Y) >= 30 ||
            Math.abs(current.X - port.X) >= 30
          )
            continue;
          current.IsNearPort ??= new Set();
          current.IsNearPort.add(owner);
        }
        for (const e of current.Edges) {
          guard.Step();
          const adjacent = current.Adjacent(e);
          if (adjacent.X !== port.X && adjacent.Y !== port.Y) continue;
          queue.push(adjacent);
        }
      }
    }
  }
  guard.Check();
}
