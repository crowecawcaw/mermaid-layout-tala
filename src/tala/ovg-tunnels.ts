import type { Point } from '../layout.js';
import type { OVGFlatEdge, OVGFlatNode } from './ovg-build.js';
import type { OVGSweepEdge, OVGSweepVertex } from './ovg-sweep.js';

interface Range { start: number; end: number }

/** Ordinary flat-node branch of routing/tunnel.go's buildTunnels. Mutates the
 * OVG vertices, as upstream addTunnels does, and returns its pre-sweep edges. */
export function addFlatOVGTunnels(nodes: readonly OVGFlatNode[],
  edges: readonly OVGFlatEdge[], vertices: OVGSweepVertex[]): OVGSweepEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const occupied = new Map(vertices.map((vertex) => [`${vertex.x},${vertex.y}`, vertex]));
  const addEntry = (point: Point, owner: string): OVGSweepVertex => {
    const key = `${point.x},${point.y}`;
    let vertex = occupied.get(key);
    if (!vertex) {
      vertex = { ...point };
      occupied.set(key, vertex);
      vertices.push(vertex);
    }
    if (!vertex.owners?.some((item) => item.node === owner)) {
      (vertex.owners ??= []).push({ node: owner, directions: [] });
    }
    vertex.tunnel = true;
    return vertex;
  };
  const result: OVGSweepEdge[] = [];
  const visited = new Set<string>();
  for (const node of nodes) {
    if (node.shape?.toLowerCase() === 'table') continue;
    for (const edge of edges) {
      if (edge.from !== node.id && edge.to !== node.id) continue;
      const otherId = edge.from === node.id ? edge.to : edge.from;
      if (otherId === node.id) continue;
      const other = byId.get(otherId);
      if (!other || other.shape?.toLowerCase() === 'table') continue;
      const pair = [node.id, other.id].sort().join('\0');
      if (visited.has(pair)) continue;
      visited.add(pair);
      const parallel = edges.filter((candidate) =>
        candidate.from === node.id && candidate.to === other.id
        || candidate.from === other.id && candidate.to === node.id).length;
      const visibleHorizontal = node.y <= other.y + other.height
        && node.y + node.height >= other.y;
      const visibleVertical = node.x <= other.x + other.width
        && node.x + node.width >= other.x;
      if (!visibleHorizontal && !visibleVertical) continue;
      const horizontal = visibleHorizontal;
      let ranges: Range[] = [{
        start: horizontal ? Math.max(node.y, other.y) : Math.max(node.x, other.x),
        end: horizontal ? Math.min(node.y + node.height, other.y + other.height)
          : Math.min(node.x + node.width, other.x + other.width),
      }];
      for (const blocker of nodes) {
        if (blocker.id === node.id || blocker.id === other.id) continue;
        if (blocksEntireSpan(blocker, node, other, horizontal)) { ranges = []; break; }
        const between = horizontal
          ? node.x < blocker.x && blocker.x < other.x
            || other.x < blocker.x && blocker.x < node.x
          : node.y < blocker.y && blocker.y < other.y
            || other.y < blocker.y && blocker.y < node.y;
        if (!between) continue;
        const start = horizontal ? blocker.y : blocker.x;
        const end = start + (horizontal ? blocker.height : blocker.width);
        const next: Range[] = [];
        for (const range of ranges) {
          if (start <= range.start && end >= range.end) continue;
          if (start > range.start && end < range.end) {
            next.push({ start: range.start, end: start }, { start: end, end: range.end });
          } else if (start <= range.start && end < range.end && end > range.start) {
            next.push({ start: end, end: range.end });
          } else if (start > range.start && end >= range.end && start < range.end) {
            next.push({ start: range.start, end: start });
          } else {
            next.push(range);
          }
        }
        ranges = next.filter((range) => range.end - range.start >= 40);
      }
      let remaining = parallel;
      for (const range of ranges) {
        const fit = Math.min(Math.floor((range.end - range.start) / 40), remaining);
        for (let i = 1; i <= fit; i++) {
          const coordinate = roundAway(range.start + i * (range.end - range.start) / (fit + 1));
          const first = horizontal
            ? { x: node.x > other.x ? node.x : node.x + node.width, y: coordinate }
            : { x: coordinate, y: node.y > other.y ? node.y : node.y + node.height };
          const second = horizontal
            ? { x: node.x > other.x ? other.x + other.width : other.x, y: coordinate }
            : { x: coordinate, y: node.y > other.y ? other.y + other.height : other.y };
          const a = addEntry(first, node.id), b = addEntry(second, other.id);
          result.push({ from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } });
          remaining--;
        }
      }
    }
  }
  return result;
}

function blocksEntireSpan(blocker: OVGFlatNode, a: OVGFlatNode, b: OVGFlatNode,
  horizontal: boolean): boolean {
  if (horizontal) {
    const between = blocker.x >= a.x + a.width && blocker.x + blocker.width <= b.x
      || blocker.x >= b.x + b.width && blocker.x + blocker.width <= a.x;
    return between && blocker.y <= Math.max(a.y, b.y)
      && blocker.y + blocker.height >= Math.min(a.y + a.height, b.y + b.height);
  }
  const between = blocker.y >= a.y + a.height && blocker.y + blocker.height <= b.y
    || blocker.y >= b.y + b.height && blocker.y + blocker.height <= a.y;
  return between && blocker.x <= Math.max(a.x, b.x)
    && blocker.x + blocker.width >= Math.min(a.x + a.width, b.x + b.width);
}

function roundAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
