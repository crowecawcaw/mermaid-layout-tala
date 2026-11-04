// Adapted from TALA internal/loops at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { goStableSort } from './stable-sort.js';
import type { LayoutEdge, LayoutNode, Point, PositionedNode } from './layout.js';

type Side = 'top' | 'right' | 'bottom' | 'left';
interface PortPair {
  from: Point;
  to: Point;
  fromSide: Side;
  toSide: Side;
  vertical: number;
  horizontal: number;
  source?: string;
  target?: string;
}
const arrowheads = (edge: LayoutEdge) =>
  [edge.sourceArrowhead ?? 'none', edge.targetArrowhead ?? 'triangle'] as const;
const hasArrow = (arrow: string) => arrow !== '' && arrow !== 'none';

/** Upstream edge-density prescaling for rectangular nodes, including loops. */
export function prescaleNodes(nodes: LayoutNode[], edges: readonly LayoutEdge[]): void {
  const counts = new Map(nodes.map((node) => [node.id, new Map<string, number>()]));
  const incident = new Set<string>();
  for (const edge of edges) {
    incident.add(edge.from);
    incident.add(edge.to);
    if (edge.from === edge.to) continue;
    for (const [id, other] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      const map = counts.get(id!)!;
      map.set(other!, (map.get(other!) ?? 0) + 1);
    }
  }
  for (const node of nodes) {
    if (node.fixedSize || !incident.has(node.id)) continue;
    const neighbors = counts.get(node.id)!;
    const total = [...neighbors.values()].reduce((sum, n) => sum + n, 0);
    const perSide = neighbors.size
      ? Math.max(...neighbors.values(), Math.ceil(total / Math.min(4, neighbors.size)))
      : 0;
    if (perSide === 1) continue;
    const minimum = (perSide + 1) * 40;
    node.width = Math.max(node.width, minimum);
    node.height = Math.max(node.height, minimum);
  }
}

export function routeLoops(
  node: PositionedNode,
  edges: readonly LayoutEdge[]
): Map<string, Point[]> {
  const left = node.x - node.width / 2,
    top = node.y - node.height / 2,
    right = left + Math.round(node.width),
    bottom = top + Math.round(node.height);
  const pairs: PortPair[] = [
    {
      from: { x: left, y: top + Math.round(node.height / 4) },
      to: { x: left + Math.round(node.width / 4), y: top },
      fromSide: 'left',
      toSide: 'top',
      vertical: 0,
      horizontal: 0,
    },
    {
      from: { x: left + Math.round((3 * node.width) / 4), y: top },
      to: { x: right, y: top + Math.round(node.height / 4) },
      fromSide: 'top',
      toSide: 'right',
      vertical: 0,
      horizontal: 0,
    },
    {
      from: { x: left + Math.round(node.width / 4), y: bottom },
      to: { x: left, y: top + Math.round((3 * node.height) / 4) },
      fromSide: 'bottom',
      toSide: 'left',
      vertical: 0,
      horizontal: 0,
    },
    {
      from: { x: right, y: top + Math.round((3 * node.height) / 4) },
      to: { x: left + Math.round((3 * node.width) / 4), y: bottom },
      fromSide: 'right',
      toSide: 'bottom',
      vertical: 0,
      horizontal: 0,
    },
  ];
  const score = (edge: LayoutEdge) => {
    const [a, b] = arrowheads(edge);
    return hasArrow(a) !== hasArrow(b) ? 0 : hasArrow(a) ? 1 : 2;
  };
  const sorted = goStableSort(
    edges.filter((edge) => edge.from === node.id && edge.to === node.id),
    (a, b) => {
      const [as, at] = arrowheads(a),
        [bs, bt] = arrowheads(b);
      if (hasArrow(as) !== hasArrow(bs) || hasArrow(at) !== hasArrow(bt))
        return score(a) - score(b);
      return (
        (a.labelWidth ?? 0) * (a.labelHeight ?? 0) - (b.labelWidth ?? 0) * (b.labelHeight ?? 0)
      );
    }
  );
  const routes = new Map<string, Point[]>();
  const bend = (point: Point, side: Side, pair: PortPair) => ({
    x:
      point.x +
      (side === 'left' ? -pair.horizontal - 30 : side === 'right' ? pair.horizontal + 30 : 0),
    y:
      point.y + (side === 'top' ? -pair.vertical - 30 : side === 'bottom' ? pair.vertical + 30 : 0),
  });
  for (const edge of sorted) {
    const [source, target] = arrowheads(edge);
    const pair =
      pairs.find((p) => p.source === source && p.target === target) ??
      pairs.find((p) => p.source === undefined) ??
      pairs.find(
        (p) => hasArrow(p.source!) === hasArrow(source) && hasArrow(p.target!) === hasArrow(target)
      );
    if (!pair) throw new Error('no compatible loop ports');
    const a = bend(pair.from, pair.fromSide, pair),
      b = bend(pair.to, pair.toSide, pair);
    const middle =
      pair.fromSide === 'left' || pair.fromSide === 'right'
        ? { x: a.x, y: b.y }
        : { x: b.x, y: a.y };
    routes.set(edge.id, [{ ...pair.from }, a, middle, b, { ...pair.to }]);
    pair.vertical += 30 + (edge.labelHeight ?? 0);
    pair.horizontal += 30 + (edge.labelWidth ?? 0);
    pair.source = source;
    pair.target = target;
  }
  return routes;
}
