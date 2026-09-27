import type { Point } from '../layout.js';

/** The ordinary-node branch of routing/ovg.go's connectNodes sweep. The
 * caller supplies the OVG vertices produced by the preceding build stages. */
export interface OVGSweepObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  container?: boolean;
  parentId?: string;
  fixedOverlap?: boolean;
}

export type OVGPortDirection = 'top' | 'bottom' | 'left' | 'right' | 'none';
export interface OVGSweepPortOwner {
  node: string;
  directions: OVGPortDirection[];
  center?: boolean;
}
export interface OVGSweepVertex extends Point {
  owners?: OVGSweepPortOwner[];
  center?: boolean;
  tunnel?: boolean;
  nearPortOwners?: string[];
  containerId?: string;
  index?: number;
}
export interface OVGSweepEdge { from: Point; to: Point }

export function connectOVGSweepNodes(obstacles: readonly OVGSweepObstacle[],
  vertices: readonly OVGSweepVertex[]): OVGSweepEdge[] {
  const horizontal = new Map<number, OVGSweepVertex[]>();
  const vertical = new Map<number, OVGSweepVertex[]>();
  const ports = new Map<string, Set<string>>();
  const obstaclesById = new Map(obstacles.map((node) => [node.id, node]));
  for (const vertex of vertices) {
    for (const owner of vertex.owners ?? []) {
      let points = ports.get(owner.node);
      if (!points) ports.set(owner.node, points = new Set());
      points.add(pointKey(vertex));
    }
    if (vertex.tunnel) continue;
    push(horizontal, vertex.y, vertex);
    push(vertical, vertex.x, vertex);
  }

  const edges: OVGSweepEdge[] = [];
  for (const [isHorizontal, lines] of [[true, horizontal], [false, vertical]] as const) {
    for (const line of [...lines.keys()].sort((a, b) => a - b)) {
      const candidates = obstacles.filter((box) => !box.fixedOverlap &&
        (isHorizontal
          ? box.y <= line && box.y + box.height >= line
          : box.x <= line && box.x + box.width >= line))
        .sort((a, b) => isHorizontal ? a.x - b.x : a.y - b.y);
      const sorted = lines.get(line)!.sort((a, b) => isHorizontal ? a.x - b.x : a.y - b.y);
      let searchStart = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const from = sorted[i]!, to = sorted[i + 1]!;
        if (misdirectedPortPair(from, to, isHorizontal, obstaclesById)) continue;
        let clear = true;
        for (let j = searchStart; j < candidates.length; j++) {
          const box = candidates[j]!;
          if (isHorizontal ? box.x > to.x : box.y > to.y) break;
          const firstPasses = passesThroughAllowingPorts(box, from, to, ports);
          const secondPasses = passesThroughAllowingPorts(box, to, from, ports);
          if (firstPasses && secondPasses) {
            if (!(box.container && (contains(box, from) || contains(box, to)))) {
              clear = false;
              break;
            }
          } else {
            searchStart = j;
          }
        }
        if (clear && !(from.center && !to.owners?.length)
          && !(to.center && !from.owners?.length)) {
          edges.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } });
        }
      }
    }
  }
  return edges;
}

function push(map: Map<number, OVGSweepVertex[]>, key: number, vertex: OVGSweepVertex): void {
  let list = map.get(key);
  if (!list) map.set(key, list = []);
  list.push(vertex);
}

function pointKey(point: Point): string { return `${point.x},${point.y}`; }

function misdirectedPortPair(from: OVGSweepVertex, to: OVGSweepVertex,
  horizontal: boolean, obstacles: ReadonlyMap<string, OVGSweepObstacle>): boolean {
  if (!from.owners?.length || !to.owners?.length) return false;
  for (const first of from.owners) for (const second of to.owners) {
    if (first.node === second.node) return false;
    if (isDescendant(first.node, second.node, obstacles)
      || isDescendant(second.node, first.node, obstacles)) return false;
    if (first.directions.includes(horizontal ? 'right' : 'bottom')
      && second.directions.includes(horizontal ? 'left' : 'top')) return false;
  }
  return true;
}

function isDescendant(nodeId: string, ancestorId: string,
  obstacles: ReadonlyMap<string, OVGSweepObstacle>): boolean {
  for (let parent = obstacles.get(nodeId)?.parentId; parent;
    parent = obstacles.get(parent)?.parentId) {
    if (parent === ancestorId) return true;
  }
  return false;
}

function passesThroughAllowingPorts(box: OVGSweepObstacle, from: OVGSweepVertex,
  to: OVGSweepVertex, ports: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  const directions = from.owners?.find((owner) => owner.node === box.id)?.directions ?? ['none'];
  for (const direction of directions) {
    const outward = direction === 'top' && from.x === to.x && from.y > to.y
      || direction === 'bottom' && from.x === to.x && from.y < to.y
      || direction === 'left' && from.y === to.y && from.x > to.x
      || direction === 'right' && from.y === to.y && from.x < to.x;
    if (outward && (ports.get(box.id)?.has(pointKey(from))
      || ports.get(box.id)?.has(pointKey(to)))) return false;
  }
  return segmentIntersectsBox(from, to, box);
}

function contains(box: OVGSweepObstacle, point: Point): boolean {
  return box.x <= point.x && point.x <= box.x + box.width
    && box.y <= point.y && point.y <= box.y + box.height;
}

/** layoutgraph/node.go segmentIntersectsBox, including its closed boundary
 * and single-point tangency behavior. */
function segmentIntersectsBox(from: Point, to: Point, box: OVGSweepObstacle): boolean {
  const left = Math.min(box.x, box.x + box.width);
  const right = Math.max(box.x, box.x + box.width);
  const top = Math.min(box.y, box.y + box.height);
  const bottom = Math.max(box.y, box.y + box.height);
  if ([left, right, top, bottom].some(Number.isNaN)) return false;
  if (from.x < left && to.x < left || from.x > right && to.x > right
    || from.y < top && to.y < top || from.y > bottom && to.y > bottom) return false;
  if (contains(box, from) || contains(box, to)) return true;
  let enter = 0, exit = 1;
  const clip = (start: number, delta: number, min: number, max: number): boolean => {
    if (delta === 0) return min <= start && start <= max;
    let a = (min - start) / delta, b = (max - start) / delta;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    exit = Math.min(exit, b);
    return enter <= exit;
  };
  return clip(from.x, to.x - from.x, left, right)
    && clip(from.y, to.y - from.y, top, bottom) && enter < exit;
}
