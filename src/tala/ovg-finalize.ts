import type { Point } from '../layout.js';
import { buildFlatOVG, type OVGFlatEdge, type OVGFlatNode } from './ovg-build.js';
import { ovgPortGroups } from './ovg-candidates.js';
import type { OVGSweepEdge, OVGSweepVertex } from './ovg-sweep.js';
import { assertOVGCount, MAX_OVG_EDGES, MAX_OVG_NODES } from './ovg-limits.js';

export interface OVGFlatRoutingGraph {
  vertices: OVGSweepVertex[];
  edges: OVGSweepEdge[];
  edgeObjects: OVGFlatRoutingEdge[];
  incident: Map<OVGSweepVertex, OVGFlatRoutingEdge[]>;
  centers: Map<string, OVGSweepVertex>;
  ports: Map<string, OVGSweepVertex[]>;
}
export interface OVGFlatRoutingEdge {
  from: OVGSweepVertex;
  to: OVGSweepVertex;
  distance: number;
}

/** Flat-graph post-sweep stages of routing/ovg.go: connectPortsToCenter,
 * removeIsolatedNodes, flagNodesNearPorts, and vertex indexing. */
export function completeFlatOVG(nodes: readonly OVGFlatNode[],
  inputEdges: readonly OVGFlatEdge[]): OVGFlatRoutingGraph {
  const graph = buildFlatOVG(nodes, inputEdges);
  const occupied = new Map(graph.vertices.map((vertex) => [key(vertex), vertex]));
  const adjacent = new Map<OVGSweepVertex, OVGSweepVertex[]>();
  const incident = new Map<OVGSweepVertex, OVGFlatRoutingEdge[]>();
  const edgeObjects: OVGFlatRoutingEdge[] = [];
  const centers = new Map<string, OVGSweepVertex>();
  const ports = new Map<string, OVGSweepVertex[]>();
  const link = (a: OVGSweepVertex, b: OVGSweepVertex): void => {
    assertOVGCount('edge count', edgeObjects.length + 1, MAX_OVG_EDGES);
    let from = adjacent.get(a), to = adjacent.get(b);
    if (!from) adjacent.set(a, from = []);
    if (!to) adjacent.set(b, to = []);
    from.push(b);
    to.push(a);
    const edge = { from: a, to: b, distance: Math.hypot(a.x - b.x, a.y - b.y) };
    edgeObjects.push(edge);
    let aEdges = incident.get(a), bEdges = incident.get(b);
    if (!aEdges) incident.set(a, aEdges = []);
    if (!bEdges) incident.set(b, bEdges = []);
    aEdges.push(edge);
    bEdges.push(edge);
  };
  for (const edge of graph.edges) {
    const from = occupied.get(key(edge.from)), to = occupied.get(key(edge.to));
    if (from && to) link(from, to);
  }

  const centerEdges: OVGSweepEdge[] = [];
  for (const node of nodes) {
    assertOVGCount('node count', graph.vertices.length + 1, MAX_OVG_NODES);
    const center: OVGSweepVertex = { x: node.x + node.width / 2,
      y: node.y + node.height / 2, center: true };
    centers.set(node.id, center);
    graph.vertices.push(center); // upstream addNodeUnchecked, even at an occupied coordinate
    const nodePorts: OVGSweepVertex[] = [];
    for (const point of ovgPortGroups(node).flat()) {
      const port = occupied.get(key(point));
      if (port) nodePorts.push(port);
    }
    for (const edge of graph.tunnelEdges) {
      if (edge.fromOwner === node.id) {
        const port = occupied.get(key(edge.from));
        if (port) nodePorts.push(port);
      }
      if (edge.toOwner === node.id) {
        const port = occupied.get(key(edge.to));
        if (port) nodePorts.push(port);
      }
    }
    ports.set(node.id, nodePorts);
    for (const port of nodePorts) {
      centerEdges.push({ from: { x: center.x, y: center.y },
        to: { x: port.x, y: port.y } });
      link(center, port);
    }
  }
  graph.edges.push(...centerEdges);
  const vertices = graph.vertices.filter((vertex) => (adjacent.get(vertex)?.length ?? 0) > 0);

  // mapNodesToContainer uses the deepest containing group, including its
  // boundary. Route search uses this ownership to avoid unrelated containers
  // and to price a path that leaves its endpoints' shared container.
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = (node: OVGFlatNode): number => {
    let result = 0;
    for (let parent = node.parentId; parent; parent = byId.get(parent)?.parentId) result++;
    return result;
  };
  const containers = nodes.filter((node) => node.isGroup)
    .sort((a, b) => depth(b) - depth(a));
  for (const vertex of vertices) {
    const owner = containers.find((node) => node.x <= vertex.x
      && vertex.x <= node.x + node.width && node.y <= vertex.y
      && vertex.y <= node.y + node.height);
    if (owner) vertex.containerId = owner.id;
  }

  for (const [owner, nodePorts] of ports) for (const port of nodePorts) {
    const seen = new Set<OVGSweepVertex>([port]);
    const queue = (adjacent.get(port) ?? []).filter((vertex) =>
      vertex.x === port.x || vertex.y === port.y);
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!;
      if (seen.has(current)) continue;
      seen.add(current);
      if (!current.owners?.some((item) => item.node === owner)) {
        if (Math.abs(current.y - port.y) >= 30 || Math.abs(current.x - port.x) >= 30) continue;
        const owners = current.nearPortOwners ??= [];
        if (!owners.includes(owner)) owners.push(owner);
      }
      for (const next of adjacent.get(current) ?? []) {
        if (next.x === port.x || next.y === port.y) queue.push(next);
      }
    }
  }
  vertices.forEach((vertex, index) => { vertex.index = index; });
  return { vertices, edges: graph.edges, edgeObjects, incident, centers, ports };
}

function key(point: Point): string { return `${point.x},${point.y}`; }
