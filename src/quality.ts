// Adapted from D2 TALA internal/quality at bf337903. SPDX-License-Identifier: MPL-2.0
// Copyright Terrastruct Inc. and contributors.
import type { LayoutResult, Point, PositionedEdge } from './layout.js';

export interface LayoutScore {
  penalty: number;
  area: number;
}
type Box = { x: number; y: number; width: number; height: number };
const goRound = (value: number) => (value < 0 ? -Math.round(-value) : Math.round(value));
const overlaps = (a: Box, b: Box, padding = 0) =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 + padding &&
  Math.abs(a.y - b.y) < (a.height + b.height) / 2 + padding;
const covers = (a: Box, b: Box) =>
  b.x - b.width / 2 >= a.x - a.width / 2 &&
  b.x + b.width / 2 <= a.x + a.width / 2 &&
  b.y - b.height / 2 >= a.y - a.height / 2 &&
  b.y + b.height / 2 <= a.y + a.height / 2;
const orientation = (a: Point, b: Point, c: Point) =>
  (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
const sameSign = (a: number, b: number) => Math.sign(a) === Math.sign(b);
function angledIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  return (
    !sameSign(orientation(a, b, c), orientation(a, b, d)) &&
    !sameSign(orientation(c, d, a), orientation(c, d, b))
  );
}
export function nonSharedCrossing(a: Point, b: Point, c: Point, d: Point): boolean {
  return (
    angledIntersection(a, b, c, d) &&
    !(a.x === b.x && (a.x === c.x || a.x === d.x)) &&
    !(a.y === b.y && (a.y === c.y || a.y === d.y))
  );
}
function lineOverlaps(box: Box, a: Point, b: Point, padding: number): boolean {
  // Closed-rectangle slab intersection, including collinear boundary contact.
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.x - box.width / 2 - padding, box.x + box.width / 2 + padding],
    [a.y, b.y - a.y, box.y - box.height / 2 - padding, box.y + box.height / 2 + padding],
  ] as const) {
    if (delta === 0) {
      if (start < min || start > max) return false;
      continue;
    }
    const first = (min - start) / delta,
      last = (max - start) / delta;
    low = Math.max(low, Math.min(first, last));
    high = Math.min(high, Math.max(first, last));
    if (low > high) return false;
  }
  return true;
}
function sharedSegmentBoxes(edges: readonly PositionedEdge[], step: () => void): Box[] {
  const result: Box[] = [];
  for (const horizontal of [false, true]) {
    const groups = new Map<number, Array<[number, number]>>();
    for (const edge of edges)
      for (let i = 1; i < edge.points.length; i++) {
        step();
        const a = edge.points[i - 1]!,
          b = edge.points[i]!;
        if (horizontal ? a.y !== b.y || a.x === b.x : a.x !== b.x) continue;
        const fixed = horizontal ? a.y : a.x;
        const start = horizontal ? a.x : a.y,
          end = horizontal ? b.x : b.y;
        const list = groups.get(fixed) ?? [];
        list.push([Math.min(start, end), Math.max(start, end)]);
        groups.set(fixed, list);
      }
    for (const [fixed, list] of groups) {
      list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let previous = list[0]!,
        overlap: [number, number] | undefined;
      const save = () => {
        if (overlap)
          result.push(
            horizontal
              ? {
                  x: (overlap[0] + overlap[1]) / 2,
                  y: fixed,
                  width: overlap[1] - overlap[0],
                  height: 25,
                }
              : {
                  x: fixed,
                  y: (overlap[0] + overlap[1]) / 2,
                  width: 25,
                  height: overlap[1] - overlap[0],
                }
          );
      };
      for (const current of list.slice(1)) {
        step();
        if (previous[1] > current[0]) {
          if (!overlap) overlap = [current[0], Math.min(previous[1], current[1])];
          else overlap[1] = Math.max(overlap[1], Math.min(previous[1], current[1]));
        } else if (overlap) {
          save();
          overlap = undefined;
        }
        if (current[1] > previous[1]) previous = current;
      }
      save();
    }
  }
  return result;
}
/** Upstream penalty/area ordering for the adapter's measured rectangular
 * geometry. Icons, arrowhead labels, and cluster membership are not yet exposed.
 */
export function evaluateLayout(layout: LayoutResult): LayoutScore {
  let work = 0;
  const step = () => {
    if (++work > 50_000_000) throw new Error('layout scoring work limit exceeded');
  };
  const { nodes, edges } = layout;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error('duplicate scoring node ID');
  for (const node of nodes) {
    if (
      ![node.x, node.y, node.width, node.height].every(Number.isFinite) ||
      node.width <= 0 ||
      node.height <= 0
    ) {
      throw new Error('scoring nodes require finite positions and positive dimensions');
    }
    if (node.parentId !== undefined && !byId.get(node.parentId)?.isGroup)
      throw new Error('invalid scoring parent');
    for (const value of [node.labelX, node.labelY, node.labelWidth, node.labelHeight]) {
      if (value !== undefined && !Number.isFinite(value))
        throw new Error('nonfinite scoring label geometry');
    }
    if ((node.labelWidth ?? 0) < 0 || (node.labelHeight ?? 0) < 0)
      throw new Error('negative scoring label dimensions');
  }
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to))
      throw new Error('scoring edge references missing node');
    if (edge.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))
      throw new Error('nonfinite scoring route');
    if (
      (edge.labelWidth ?? 0) < 0 ||
      (edge.labelHeight ?? 0) < 0 ||
      ![edge.labelWidth ?? 0, edge.labelHeight ?? 0, edge.x, edge.y].every(Number.isFinite)
    ) {
      throw new Error('invalid scoring edge label geometry');
    }
  }
  const ancestors = (id: string): Set<string> => {
    const result = new Set<string>();
    let current = byId.get(id);
    while (current) {
      step();
      if (result.has(current.id)) throw new Error('cyclic scoring ancestry');
      result.add(current.id);
      current = current.parentId === undefined ? undefined : byId.get(current.parentId);
    }
    return result;
  };
  const countBoxes = (box: Box, others: Box[], padding: number) =>
    others.reduce((sum, other) => {
      step();
      return sum + Number(overlaps(box, other, padding));
    }, 0);
  const countEdges = (box: Box, others: PositionedEdge[], padding: number) =>
    others.reduce((sum, edge) => {
      for (let i = 1; i < edge.points.length; i++) {
        step();
        if (lineOverlaps(box, edge.points[i - 1]!, edge.points[i]!, padding)) sum++;
      }
      return sum;
    }, 0);
  const edgeBox = (edge: PositionedEdge): Box => ({
    x: edge.x,
    y: edge.y,
    width: edge.labelWidth ?? 0,
    height: edge.labelHeight ?? 0,
  });
  const placed: Box[] = edges
    .filter((e) => e.from === e.to && e.labelWidth && e.labelHeight)
    .map(edgeBox);
  const allBounds: Box[] = [...nodes];
  let penalty = 0,
    labelPenalty = 0;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]!;
    penalty += Math.max(0, edge.points.length - 2) * 0.5;
    for (let k = 1; k < edge.points.length; k++) {
      const a = edge.points[k - 1]!,
        b = edge.points[k]!;
      if (a.x !== b.x && a.y !== b.y) penalty += 3;
      allBounds.push(
        { x: goRound(a.x), y: goRound(a.y), width: 0, height: 0 },
        { x: goRound(b.x), y: goRound(b.y), width: 0, height: 0 }
      );
      for (let j = i + 1; j < edges.length; j++)
        for (let n = 1; n < edges[j]!.points.length; n++) {
          step();
          if (nonSharedCrossing(a, b, edges[j]!.points[n - 1]!, edges[j]!.points[n]!)) penalty++;
        }
    }
  }
  for (const node of nodes) {
    if (!node.labelWidth || !node.labelHeight) continue;
    const box = {
      x: node.labelX ?? node.x,
      y: node.labelY ?? (node.isGroup ? node.y - node.height / 2 + node.labelHeight / 2 : node.y),
      width: node.labelWidth,
      height: node.labelHeight,
    };
    const related = ancestors(node.id);
    const peers = nodes.filter(
      (other) =>
        other.id !== node.id && (other.parentId === node.parentId || other.parentId === node.id)
    );
    let overlapCount = countBoxes(box, peers, 5);
    for (const id of related) {
      const parent = byId.get(id)!;
      step();
      if (overlaps(box, parent, 5) && !covers(parent, box)) overlapCount++;
    }
    labelPenalty += overlapCount + countEdges(box, edges, 4) + 2 * countBoxes(box, placed, 5);
    placed.push(box);
  }
  const shared = sharedSegmentBoxes(edges, step);
  for (const edge of edges) {
    if (!edge.labelWidth || !edge.labelHeight) continue;
    const box = edgeBox(edge);
    allBounds.push(box);
    if (edge.from === edge.to) continue;
    const related = new Set([...ancestors(edge.from), ...ancestors(edge.to)]);
    let overlapArea = 0;
    for (const node of nodes) {
      step();
      const partial = node.id !== edge.from && node.id !== edge.to && related.has(node.id);
      if (!overlaps(box, node, 5) || (partial && covers(node, box))) continue;
      if (overlaps(box, node))
        overlapArea +=
          (Math.min(box.x + box.width / 2, node.x + node.width / 2) -
            Math.max(box.x - box.width / 2, node.x - node.width / 2)) *
          (Math.min(box.y + box.height / 2, node.y + node.height / 2) -
            Math.max(box.y - box.height / 2, node.y - node.height / 2));
      if (!node.isGroup) overlapArea += box.width * box.height;
    }
    labelPenalty +=
      (overlapArea / (box.width * box.height)) * 2 +
      countBoxes(box, placed, 0) * 10 +
      countBoxes(box, placed, 5) +
      countEdges(
        box,
        edges.filter((other) => other !== edge),
        5
      ) *
        2 +
      countBoxes(box, shared, 5);
    placed.push(box);
  }
  penalty += 1 - 1 / (1 + labelPenalty);
  if (!allBounds.length) return { penalty, area: 0 };
  const minX = Math.min(...allBounds.map((b) => b.x - b.width / 2)),
    maxX = Math.max(...allBounds.map((b) => b.x + b.width / 2));
  const minY = Math.min(...allBounds.map((b) => b.y - b.height / 2)),
    maxY = Math.max(...allBounds.map((b) => b.y + b.height / 2));
  return { penalty, area: (maxX - minX) * (maxY - minY) };
}
/** Exact comparison; no epsilon ties. Invalid scores sort after valid ones. */
export function compareScores(a: LayoutScore, b: LayoutScore): number {
  for (const key of ['penalty', 'area'] as const) {
    const left = a[key],
      right = b[key];
    const leftValid = Number.isFinite(left) && (key !== 'area' || left >= 0);
    const rightValid = Number.isFinite(right) && (key !== 'area' || right >= 0);
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    if (leftValid && left !== right) return left < right ? -1 : 1;
  }
  return 0;
}
