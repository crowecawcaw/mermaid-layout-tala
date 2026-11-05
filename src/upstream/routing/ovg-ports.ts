// Translated port-building operations from internal/routing/ovg.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Orientation } from '../geo/orientation.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { OVG } from './ovg.js';
import type { OVGNode } from './ovg-node.js';
import type { OVGBuildGuard } from './ovg-resource.js';
import { buildTunnels } from './tunnel.js';
export function addPorts(ovg: OVG, g: Graph, guard: OVGBuildGuard): void {
  guard.Check();
  const skip = new Set<Node>();
  for (const children of g.Containers.values()) {
    guard.Step();
    let has = false;
    for (const child of children) {
      guard.Step();
      if (child.Edges.length > 0) {
        has = true;
        break;
      }
    }
    if (!has)
      for (const child of children) {
        guard.Step();
        skip.add(child);
      }
  }
  for (const node of ovg.NodesInsideBoundingBox ?? []) {
    guard.Step();
    if (skip.has(node)) continue;
    const ports: OVGNode[] = [];
    ovg.Ports.set(node, ports);
    const groups = node.Shape.SnapPointPercentages();
    for (let i = 0; i < groups.length; i++) {
      guard.Step();
      for (const p of groups[i]!) {
        guard.Step();
        const port = guard.addPoint(
          ovg,
          new Point(
            node.TopLeft!.X + Round(node.Width * p.XPercentage),
            node.TopLeft!.Y + Round(node.Height * p.YPercentage),
          ),
        );
        ports.push(port);
        const direction =
          i === 0
            ? Orientation.Top
            : i === 1
              ? Orientation.Left
              : i === 2
                ? Orientation.Bottom
                : i === 3
                  ? Orientation.Right
                  : Orientation.TopLeft;
        port.addPortOwner(node, direction, false);
      }
    }
    for (const index of node.Shape.CenterPortIndices()) {
      guard.Step();
      ports[index]!.setCenterPort(node);
    }
  }
  guard.Check();
}
export function connectPortsToCenter(ovg: OVG, guard: OVGBuildGuard): void {
  guard.Check();
  for (const node of ovg.NodesInsideBoundingBox ?? []) {
    guard.Step();
    const center = guard.newCandidateNode(node.Box.Center());
    ovg.Centers.set(node, center);
    if (!node.IsInvisible) center.IsNodeCenter = true;
    guard.addNodeUnchecked(ovg, center);
    for (const port of ovg.Ports.get(node) ?? [])
      guard.connect(ovg, center, port);
  }
  guard.Check();
}
export function addTunnels(ovg: OVG, g: Graph, guard: OVGBuildGuard): void {
  guard.Check();
  const tunnels = buildTunnels(g, guard);
  for (const tunnel of tunnels) {
    guard.Step();
    for (const entry of [tunnel.EntryA, tunnel.EntryB]) {
      guard.Step();
      const candidate = entry.OVGNode,
        canonical = guard.addNode(ovg, candidate);
      if (canonical !== candidate) {
        for (const [owner, metadata] of candidate.portOwners() ?? []) {
          guard.Step();
          canonical.addPortMetadata(owner, metadata);
        }
        entry.OVGNode = canonical;
      }
      entry.OVGNode.IsTunnel = true;
      const ports = ovg.Ports.get(entry.Node) ?? [];
      ports.push(entry.OVGNode);
      ovg.Ports.set(entry.Node, ports);
    }
    guard.connect(ovg, tunnel.EntryA.OVGNode, tunnel.EntryB.OVGNode);
  }
  guard.Check();
}
export function portsByOrientation(
  ovg: OVG,
  owner: Node,
  direction: Orientation,
  guard: OVGBuildGuard,
): OVGNode[] {
  const result: OVGNode[] = [],
    seen = new Set<OVGNode>();
  for (const port of ovg.Ports.get(owner) ?? []) {
    guard.Step();
    if (seen.has(port)) continue;
    seen.add(port);
    if (port.hasPortDirection(owner, direction)) result.push(port);
  }
  guard.Check();
  return result;
}
