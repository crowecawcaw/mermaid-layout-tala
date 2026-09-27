import type { Point } from '../layout.js';
import { ovgCandidatePoints, ovgPortGridIntersections, ovgPortGroups,
  type OVGCandidateNode } from './ovg-candidates.js';
import { shapePortPolicy } from './shape-ports.js';
import { connectOVGSweepNodes, type OVGPortDirection, type OVGSweepEdge,
  type OVGSweepVertex } from './ovg-sweep.js';
import { addFlatOVGTunnels, type OVGTunnelEdge } from './ovg-tunnels.js';
import { assertOVGCount, MAX_OVG_NODES } from './ovg-limits.js';
import { buildHierarchyOVGVertices } from './ovg-hierarchy.js';
import type { LayoutDirection } from '../layout.js';

export interface OVGFlatNode extends OVGCandidateNode { id: string }
export interface OVGFlatEdge { from: string; to: string; directed?: boolean | undefined;
  sourceArrowhead?: string | undefined; targetArrowhead?: string | undefined }
export interface OVGHierarchyInput { levels: ReadonlyMap<string, number>;
  direction: LayoutDirection }

export function buildFlatOVG(nodes: readonly OVGFlatNode[],
  edges: readonly OVGFlatEdge[], hierarchy?: OVGHierarchyInput): { vertices: OVGSweepVertex[];
  tunnelEdges: OVGTunnelEdge[]; sweepEdges: OVGSweepEdge[]; edges: OVGSweepEdge[] } {
  const vertices = hierarchy && hierarchy.levels.size === nodes.length
    ? buildAllHierarchyOVGVertices(nodes, edges, hierarchy) : buildFlatOVGVertices(nodes, edges);
  const tunnelEdges = addFlatOVGTunnels(nodes, edges, vertices);
  const sweepEdges = connectOVGSweepNodes(nodes.map((node) => ({ ...node,
    container: node.isGroup === true })), vertices);
  return { vertices, tunnelEdges, sweepEdges, edges: [...tunnelEdges, ...sweepEdges] };
}

function buildAllHierarchyOVGVertices(nodes: readonly OVGFlatNode[],
  edges: readonly OVGFlatEdge[], hierarchy: OVGHierarchyInput): OVGSweepVertex[] {
  const vertices: OVGSweepVertex[] = buildHierarchyOVGVertices(nodes, edges,
    hierarchy.levels, hierarchy.direction).map((point) => ({ ...point }));
  const occupied = new Map(vertices.map((vertex) => [`${vertex.x},${vertex.y}`, vertex]));
  const sides: OVGPortDirection[] = ['top', 'left', 'bottom', 'right'];
  for (const node of nodes) {
    const nodePorts: OVGSweepVertex[] = [];
    for (const [index, group] of ovgPortGroups(node).entries()) for (const point of group) {
      const vertex = occupied.get(`${point.x},${point.y}`);
      if (!vertex) throw new Error(`missing hierarchy port for ${node.id}`);
      let owner = vertex.owners?.find((item) => item.node === node.id);
      if (!owner) {
        owner = { node: node.id, directions: [] };
        (vertex.owners ??= []).push(owner);
      }
      if (!owner.directions.includes(sides[index]!)) owner.directions.push(sides[index]!);
      nodePorts.push(vertex);
    }
    for (const index of shapePortPolicy(node.shape, node.numColumns).centers ?? []) {
      const owner = nodePorts[index]?.owners?.find((item) => item.node === node.id);
      if (owner) owner.center = true;
    }
  }
  return vertices;
}

/** The ordinary flat-graph vertex stages of routing/ovg.go through
 * addCornerNodes. Tunnels and hierarchical vertices are later stages. */
export function buildFlatOVGVertices(nodes: readonly OVGFlatNode[],
  edges: readonly OVGFlatEdge[]): OVGSweepVertex[] {
  const vertices: OVGSweepVertex[] = [];
  const occupied = new Map<string, OVGSweepVertex>();
  const ports = new Map<string, OVGSweepVertex[]>();
  const add = (point: Point): OVGSweepVertex => {
    const key = `${point.x},${point.y}`;
    let vertex = occupied.get(key);
    if (!vertex) {
      assertOVGCount('node count', vertices.length + 1, MAX_OVG_NODES);
      vertex = { x: point.x, y: point.y };
      occupied.set(key, vertex);
      vertices.push(vertex);
    }
    return vertex;
  };

  // addPorts: each group is top, left, bottom, right. Go canonicalizes
  // touching ports by coordinate and accumulates every owner/direction.
  const sides: OVGPortDirection[] = ['top', 'left', 'bottom', 'right'];
  for (const node of nodes) {
    const nodePorts: OVGSweepVertex[] = [];
    for (const [i, group] of ovgPortGroups(node).entries()) {
      for (const point of group) {
        const vertex = add(point);
        let owner = vertex.owners?.find((item) => item.node === node.id);
        if (!owner) {
          owner = { node: node.id, directions: [] };
          (vertex.owners ??= []).push(owner);
        }
        if (!owner.directions.includes(sides[i]!)) owner.directions.push(sides[i]!);
        nodePorts.push(vertex);
      }
    }
    for (const index of shapePortPolicy(node.shape, node.numColumns).centers ?? []) {
      const owner = nodePorts[index]?.owners?.find((item) => item.node === node.id);
      if (owner) owner.center = true;
    }
    ports.set(node.id, nodePorts);
  }

  // addNodesIntersections: candidate generation includes the upstream
  // port-clearance and two-owner visibility checks.
  for (const point of ovgPortGridIntersections(nodes)) add(point);

  const near = (point: Point): boolean => nodes.some((box) => !box.isGroup &&
    box.x - 20 <= point.x && point.x <= box.x + box.width + 20
    && box.y - 20 <= point.y && point.y <= box.y + box.height + 20);
  const intersects = (box: OVGFlatNode, from: Point, to: Point): boolean => {
    if (from.x === to.x) return box.x <= from.x && from.x <= box.x + box.width
      && Math.max(from.y, to.y) >= box.y && Math.min(from.y, to.y) <= box.y + box.height;
    if (from.y === to.y) return box.y <= from.y && from.y <= box.y + box.height
      && Math.max(from.x, to.x) >= box.x && Math.min(from.x, to.x) <= box.x + box.width;
    return false;
  };
  const alignedPortVisible = (point: Point): boolean => {
    let aligned = false;
    for (const owner of nodes) {
      for (const port of ports.get(owner.id) ?? []) {
        if (port.x !== point.x && port.y !== point.y) continue;
        aligned = true;
        if (port.x === point.x && (port.x === owner.x || port.x === owner.x + owner.width)) continue;
        if (port.y === point.y && (port.y === owner.y || port.y === owner.y + owner.height)) continue;
        if (nodes.every((blocker) => blocker.id === owner.id || blocker.isGroup
          || !intersects(blocker, port, point))) {
          return true;
        }
      }
    }
    return !aligned;
  };

  // addEdgesNodes: only non-loop graph edges produce perimeter and halfway
  // fill candidates. Keep candidate order, then apply graph-node visibility.
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to) continue;
    const candidates = ovgCandidatePoints(from, to);
    for (const point of [...candidates.perimeter, ...candidates.halfway]) {
      if (!near(point) && alignedPortVisible(point)) add(point);
    }
  }

  if (!nodes.length) return vertices;
  const tl = { x: Math.min(...nodes.map((node) => node.x)),
    y: Math.min(...nodes.map((node) => node.y)) };
  const br = { x: Math.max(...nodes.map((node) => node.x + node.width)),
    y: Math.max(...nodes.map((node) => node.y + node.height)) };

  // addNewBoundaryLayers. The inner loop sees the vertices that existed at
  // the start of each layer, as Go's range over a slice does.
  for (let i = 1; i <= 3; i++) {
    for (const vertex of [...vertices]) {
      let point: Point | undefined;
      if (vertex.y === tl.y) point = { x: vertex.x, y: vertex.y - 20 * i };
      if (vertex.y === br.y) point = { x: vertex.x, y: vertex.y + 20 * i };
      if (vertex.x === tl.x) point = { x: vertex.x - 20 * i, y: vertex.y };
      if (vertex.x === br.x) point = { x: vertex.x + 20 * i, y: vertex.y };
      if (point && !near(point)) add(point);
    }
  }

  const allPortKeys = new Map([...ports].map(([id, list]) =>
    [id, new Set(list.map((port) => `${port.x},${port.y}`))]));
  const isDescendantOf = (node: OVGFlatNode, ancestor: OVGFlatNode): boolean => {
    if (node.id === ancestor.id) return true;
    for (let parentId = node.parentId; parentId; parentId = byId.get(parentId)?.parentId) {
      if (parentId === ancestor.id) return true;
    }
    return false;
  };
  const passesAllowingPort = (box: OVGFlatNode, from: Point, to: Point,
    direction: OVGPortDirection): boolean => {
    const outward = direction === 'top' && from.x === to.x && from.y > to.y
      || direction === 'bottom' && from.x === to.x && from.y < to.y
      || direction === 'left' && from.y === to.y && from.x > to.x
      || direction === 'right' && from.y === to.y && from.x < to.x;
    if (outward && (allPortKeys.get(box.id)?.has(`${from.x},${from.y}`)
      || allPortKeys.get(box.id)?.has(`${to.x},${to.y}`))) return false;
    return intersects(box, from, to);
  };

  // addPortConnectionNodesAtBoundaries and its isolated-port fallback.
  for (let i = 1; i <= 3; i++) {
    for (const node of nodes) {
      let added = false;
      for (const port of new Set(ports.get(node.id) ?? [])) {
        const directions = port.owners?.find((item) => item.node === node.id)?.directions ?? [];
        for (const direction of directions) {
          const boundary: Point[] = [
            { x: port.x, y: tl.y - 20 * i }, { x: port.x, y: br.y + 20 * i },
            { x: tl.x - 20 * i, y: port.y }, { x: br.x + 20 * i, y: port.y },
          ];
          for (const point of boundary) {
            if (nodes.some((box) => passesAllowingPort(box, port, point, direction)
              && !(box.isGroup && isDescendantOf(node, box)))) continue;
            if (!near(point)) { add(point); added = true; }
          }
        }
      }
      if (!added) {
        for (const port of new Set(ports.get(node.id) ?? [])) {
          const directions = port.owners?.find((item) => item.node === node.id)?.directions ?? [];
          for (const direction of directions) {
            let point: Point;
            switch (direction) {
              case 'top': point = { x: port.x, y: port.y - 20 }; break;
              case 'bottom': point = { x: port.x, y: port.y + 20 }; break;
              case 'left': point = { x: port.x - 20, y: port.y }; break;
              case 'right': point = { x: port.x + 20, y: port.y }; break;
              default: continue;
            }
            add(point);
            for (let layer = 1; layer <= 3; layer++) {
              if (direction === 'top' || direction === 'bottom') {
                add({ x: tl.x - 20 * layer, y: point.y });
                add({ x: br.x + 20 * layer, y: point.y });
              } else {
                add({ x: point.x, y: tl.y - 20 * layer });
                add({ x: point.x, y: br.y + 20 * layer });
              }
            }
          }
        }
      }
    }
  }

  // addCornerNodes.
  for (let i = 1; i <= 3; i++) {
    const corners: Point[] = [
      { x: tl.x - 20 * i, y: tl.y - 20 * i },
      { x: br.x + 20 * i, y: tl.y - 20 * i },
      { x: br.x + 20 * i, y: br.y + 20 * i },
      { x: tl.x - 20 * i, y: br.y + 20 * i },
    ];
    for (const point of corners) if (!near(point)) add(point);
  }
  return vertices;
}
