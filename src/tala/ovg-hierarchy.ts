import type { LayoutDirection, Point } from '../layout.js';
import { ovgCoordinateIntersectionsWithPorts, ovgPortGridIntersectionsWithPorts,
  ovgPortGroups } from './ovg-candidates.js';
import type { OVGFlatEdge, OVGFlatNode } from './ovg-build.js';
import { assertOVGCount, MAX_OVG_NODES } from './ovg-limits.js';

const padding = 20;

/** The vertex-construction branch of routing/ovg_hierarchy.go. These are the
 * hierarchy's own ports, intersections, level lanes, and outer layers, before
 * its vertices are merged into the graph-wide OVG. */
export function buildHierarchyOVGVertices(nodes: readonly OVGFlatNode[],
  edges: readonly OVGFlatEdge[], levels: ReadonlyMap<string, number>,
  direction: LayoutDirection): Point[] {
  if (!nodes.length) return [];
  const horizontal = direction === 'LR' || direction === 'RL';
  const transformed = nodes.map((node) => transformBox(node, direction));
  const byId = new Map(transformed.map((node) => [node.id, node]));
  const vertices: Point[] = [];
  const occupied = new Set<string>();
  const add = (point: Point): void => {
    const key = `${point.x},${point.y}`;
    if (occupied.has(key)) return;
    assertOVGCount('node count', vertices.length + 1, MAX_OVG_NODES);
    occupied.add(key);
    vertices.push(point);
  };
  const ports = new Map(nodes.map((node) => [node.id, transformPorts(ovgPortGroups(node), direction)]));
  const portGroups = transformed.map((node) => ports.get(node.id)!);
  for (const node of nodes) for (const group of ovgPortGroups(node)) {
    for (const point of group) add(forwardPoint(point, direction));
  }
  for (const point of ovgPortGridIntersectionsWithPorts(transformed, portGroups)) add(point);

  const levelToNodes = new Map<number, OVGFlatNode[]>();
  for (const node of transformed) {
    const level = levels.get(node.id);
    if (level === undefined) throw new Error(`missing hierarchy level for ${node.id}`);
    const row = levelToNodes.get(level) ?? [];
    row.push(node);
    levelToNodes.set(level, row);
  }
  for (const row of levelToNodes.values()) row.sort((a, b) => a.x - b.x);
  const levelCount = Math.max(...levelToNodes.keys()) + 1;
  const initial = vertexBounds(vertices);
  const leftX = Math.floor((initial.minX - padding) / padding) * padding;
  const width = Math.ceil((initial.maxX - leftX) / padding) * padding;
  const rightX = leftX + width + padding;
  const ys = new Set<number>();
  const sidePorts = (node: OVGFlatNode, side: 0 | 1 | 2 | 3): Point[] => ports.get(node.id)![side]!;

  for (let level = 1; level < levelCount; level++) {
    const above = levelToNodes.get(level - 1) ?? [];
    const below = levelToNodes.get(level) ?? [];
    if (!above.length || !below.length) continue;
    const belowMinY = Math.min(...below.map((node) => node.y));
    const aboveMaxY = Math.max(...above.map((node) => node.y + node.height));
    let edgesAbove = 1;
    for (const node of below) for (const edge of edges) {
      const adjacent = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : undefined;
      if (adjacent && adjacent !== node.id && byId.has(adjacent)
        && (levels.get(adjacent) ?? 0) < level) edgesAbove++;
    }
    const distance = belowMinY - aboveMaxY;
    const horizontalLines = Math.min(edgesAbove, distance / padding);
    const pad = Math.max(Math.ceil(distance / horizontalLines), padding);
    const levelYs: number[] = [];
    for (let i = 0; i < Math.trunc(horizontalLines) - 1; i++) {
      const y = belowMinY - pad * (i + 1);
      levelYs.push(y);
      ys.add(y);
      add({ x: leftX, y });
      add({ x: rightX, y });
    }
    for (const y of levelYs) {
      for (const node of above) for (const port of sidePorts(node, 2)) add({ x: port.x, y });
      for (const node of below) for (const port of sidePorts(node, 0)) add({ x: port.x, y });
    }
  }

  const xs = new Set<number>();
  for (let level = 0; level < levelCount; level++) {
    const row = levelToNodes.get(level) ?? [];
    if (!row.length) continue;
    let index = 0;
    let last = false;
    let node = row[index]!;
    let activePorts = sidePorts(node, 1);
    for (let x = leftX; x <= rightX; x += padding) {
      xs.add(x);
      for (const port of activePorts) add({ x, y: port.y });
      if (!last && x >= node.x - padding) {
        x = Math.ceil((node.x + node.width) / padding) * padding;
        activePorts = [...sidePorts(node, 3)];
        last = index === row.length - 1;
        if (!last) {
          node = row[++index]!;
          activePorts.push(...sidePorts(node, 1));
        }
      }
    }
  }
  for (const point of ovgCoordinateIntersectionsWithPorts(transformed, portGroups,
    [...xs].sort((a, b) => a - b), [...ys].sort((a, b) => a - b))) add(point);

  const extent = vertexBounds(vertices);
  const near = (point: Point): boolean => transformed.some((node) =>
    node.x - padding <= point.x && point.x <= node.x + node.width + padding
    && node.y - padding <= point.y && point.y <= node.y + node.height + padding);
  for (let layer = 1; layer <= 3; layer++) for (const point of [...vertices]) {
    let candidate: Point | undefined;
    if (point.y === extent.minY) candidate = { x: point.x, y: point.y - padding * layer };
    if (point.y === extent.maxY) candidate = { x: point.x, y: point.y + padding * layer };
    if (point.x === extent.minX) candidate = { x: point.x - padding * layer, y: point.y };
    if (point.x === extent.maxX) candidate = { x: point.x + padding * layer, y: point.y };
    if (candidate && !near(candidate)) add(candidate);
  }
  for (let layer = 1; layer <= 3; layer++) for (const point of [
    { x: extent.minX - padding * layer, y: extent.minY - padding * layer },
    { x: extent.maxX + padding * layer, y: extent.minY - padding * layer },
    { x: extent.maxX + padding * layer, y: extent.maxY + padding * layer },
    { x: extent.minX - padding * layer, y: extent.maxY + padding * layer },
  ]) if (!near(point)) add(point);

  return vertices.map((point) => inversePoint(point, direction, horizontal));
}

function transformBox(node: OVGFlatNode, direction: LayoutDirection): OVGFlatNode {
  let x = direction === 'RL' ? -node.x - node.width : node.x;
  let y = direction === 'BT' ? -node.y - node.height : node.y;
  let width = node.width, height = node.height;
  if (direction === 'LR' || direction === 'RL') {
    [x, y] = [y, x];
    [width, height] = [height, width];
  }
  return { ...node, x, y, width, height };
}

function transformPorts(groups: Point[][], direction: LayoutDirection): Point[][] {
  // Go creates the ports before mirroring/transposing a hierarchy. Rounding
  // an odd-width box after the transform can shift a snap point by one pixel.
  const destinations: Record<LayoutDirection, number[]> = {
    TB: [0, 1, 2, 3], BT: [2, 1, 0, 3],
    LR: [1, 0, 3, 2], RL: [1, 2, 3, 0],
  };
  const result: Point[][] = [[], [], [], []];
  groups.forEach((group, index) => {
    result[destinations[direction][index]!]!.push(...group.map((point) => {
      return forwardPoint(point, direction);
    }));
  });
  return result;
}

function forwardPoint(point: Point, direction: LayoutDirection): Point {
  let x = direction === 'RL' ? -point.x : point.x;
  let y = direction === 'BT' ? -point.y : point.y;
  if (direction === 'LR' || direction === 'RL') [x, y] = [y, x];
  return { x, y };
}

function inversePoint(point: Point, direction: LayoutDirection, horizontal: boolean): Point {
  let { x, y } = point;
  if (horizontal) [x, y] = [y, x];
  if (direction === 'RL') x = -x;
  if (direction === 'BT') y = -y;
  return { x, y };
}

function vertexBounds(vertices: readonly Point[]): { minX: number; minY: number;
  maxX: number; maxY: number } {
  return { minX: Math.min(...vertices.map((point) => point.x)),
    minY: Math.min(...vertices.map((point) => point.y)),
    maxX: Math.max(...vertices.map((point) => point.x)),
    maxY: Math.max(...vertices.map((point) => point.y)) };
}
