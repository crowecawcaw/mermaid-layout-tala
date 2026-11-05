// Translated visibility graph build orchestration from internal/routing/ovg.go
// at D2 bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Hierarchy } from '../layoutgraph/records.js';
import { OVG } from './ovg.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
  type OVGBuildLimits,
} from './ovg-resource.js';
import { addPorts, addTunnels, connectPortsToCenter } from './ovg-ports.js';
import { addNodesIntersections } from './ovg-intersections.js';
import { addEdgesNodes } from './ovg-edge-points.js';
import { addTreeNodes } from './tree-routes.js';
import {
  tightBoundingBox,
  addNewBoundaryLayers,
  addCornerNodes,
} from './ovg-boundaries.js';
import { addPortConnectionNodesAtBoundaries } from './ovg-port-boundaries.js';
import { connectNodes } from './ovg-connect.js';
import { mapNodesToContainer, flagNodesNearPorts } from './ovg-postconnect.js';
import { newOVGForHierarchy } from './ovg-hierarchy.js';
export function mergePorts(ovg: OVG, other: OVG, guard: OVGBuildGuard): void {
  guard.Check();
  for (const [owner, ports] of other.Ports) {
    guard.Add(BigInt(ports.length) + 1n);
    const canonical = [];
    for (const port of ports) {
      const node = guard.addNode(ovg, port);
      if (node !== port)
        for (const [owner, metadata] of port.portOwners() ?? []) {
          guard.Step();
          node.addPortMetadata(owner, metadata);
        }
      canonical.push(node);
    }
    ovg.Ports.set(owner, canonical);
  }
  guard.Add(BigInt(other.NodesInsideBoundingBox?.length ?? 0));
  ovg.NodesInsideBoundingBox = [
    ...(ovg.NodesInsideBoundingBox ?? []),
    ...(other.NodesInsideBoundingBox ?? []),
  ];
  guard.Check();
}
export function mergeNonPorts(
  ovg: OVG,
  other: OVG,
  guard: OVGBuildGuard,
): void {
  guard.Check();
  for (const node of other.Nodes) {
    guard.Step();
    if (!node.isPort()) guard.addNode(ovg, node);
  }
  guard.Check();
}
export function buildOVGFromGraphWithGuard(
  g: Graph,
  nearby: Node[],
  guard: OVGBuildGuard,
): OVG {
  guard.Check();
  const orthogonal = [...nearby],
    hierarchies: OVG[] = [],
    seen = new Set<Hierarchy>();
  for (const node of g.Nodes) {
    guard.Step();
    if (!node.Hierarchy) orthogonal.push(node);
    else if (!seen.has(node.Hierarchy)) {
      seen.add(node.Hierarchy);
      hierarchies.push(newOVGForHierarchy(g, node.Hierarchy, guard));
    }
  }
  const ovg = new OVG(orthogonal);
  addPorts(ovg, g, guard);
  for (const h of hierarchies) {
    guard.Step();
    mergePorts(ovg, h, guard);
  }
  addNodesIntersections(ovg, g, guard);
  for (const h of hierarchies) {
    guard.Step();
    mergeNonPorts(ovg, h, guard);
  }
  addEdgesNodes(ovg, g, guard);
  addTreeNodes(ovg, g, guard);
  const [tl, br] = tightBoundingBox(ovg.NodesInsideBoundingBox ?? [], guard);
  addNewBoundaryLayers(ovg, g, tl!, br!, guard);
  addPortConnectionNodesAtBoundaries(ovg, g, tl!, br!, guard);
  addCornerNodes(ovg, g, tl!, br!, guard);
  addTunnels(ovg, g, guard);
  connectNodes(ovg, g, guard);
  connectPortsToCenter(ovg, guard);
  ovg.removeIsolatedNodes(guard);
  mapNodesToContainer(ovg, g, guard);
  flagNodesNearPorts(ovg, guard);
  for (let i = 0; i < ovg.Nodes.length; i++) {
    guard.Step();
    ovg.Nodes[i]!.Index = i;
  }
  return ovg;
}
export function buildOVGFromGraphWithLimits(
  ctx: Context | null,
  g: Graph,
  nearby: Node[],
  limits: OVGBuildLimits = defaultOVGBuildLimits(),
): OVG {
  return buildOVGFromGraphWithGuard(g, nearby, new OVGBuildGuard(ctx, limits));
}
