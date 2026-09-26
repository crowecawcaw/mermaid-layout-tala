import type { Point } from '../layout.js';
import { TalaGraph, TalaNode } from './graph.js';
import { doesOverlapAt } from './overlap.js';

const maxCandidates = 1_000_000;
const key = (point: Point): string => `${point.x},${point.y}`;

/** Port of placement.roundToNearestCellSize (Go rounds ties away from zero). */
export function roundToNearestCellSize(value: number, cellSize: number): number {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('invalid cell size');
  const cells = value / cellSize;
  return (cells < 0 ? -Math.round(-cells) : Math.round(cells)) * cellSize;
}

/** Port of sizedOptimizer.iterPlacementsAroundPoint. Offsets are relative to
 * the median and the callback may stop the scan by returning true. */
export function iterPlacementsAroundPoint(
  node: TalaNode, cellSize: number, x: number, y: number,
  minimizingSelf: boolean, apply: (x: number, y: number) => boolean
): void {
  const px = x * cellSize, py = y * cellSize;
  if (apply(px, py) || !minimizingSelf) return;
  for (let currentX = px - node.width; currentX <= px; currentX += cellSize) {
    for (let currentY = py - node.height; currentY <= py; currentY += cellSize) {
      if (currentX === px && currentY === py) continue;
      if (apply(currentX, currentY)) return;
    }
  }
}

/** Ordinary-node branch of sizedOptimizer.findClosestUnoccupiedDistance.
 * It applies TALA's per-pair gap and ring order to box placements. */
export function closestSizedUnoccupiedDistance(
  graph: TalaGraph, node: TalaNode, median: Point, minimizingSelf: boolean,
  fixedOrigin?: Point
): number {
  const cell = graph.cellSize;
  if (!node.topLeft) throw new Error('sized placement requires a positioned node');
  const checked = new Set<string>();
  const allowedCenter = (offX: number, offY: number): boolean => {
    if (!fixedOrigin) return true;
    return roundToNearestCellSize(median.x + offX, cell) >= fixedOrigin.x
      && roundToNearestCellSize(median.y + offY, cell) >= fixedOrigin.y;
  };
  const isOccupied = (offX: number, offY: number): boolean => {
    const point = {
      x: roundToNearestCellSize(median.x + offX, cell),
      y: roundToNearestCellSize(median.y + offY, cell),
    };
    if (fixedOrigin && (point.x < fixedOrigin.x || point.y < fixedOrigin.y)) return true;
    for (const other of graph.nodes) {
      if (other === node || !other.topLeft) continue;
      if (other.topLeft.x === point.x && other.topLeft.y === point.y) return true;
      if (doesOverlapAt(node, other, point)) return true;
    }
    return false;
  };
  const unoccupied = (offX: number, offY: number): boolean => {
    const offset = { x: offX, y: offY };
    if (!checked.has(key(offset))) {
      if (checked.size >= maxCandidates) throw new RangeError('placement candidates exceed limit');
      checked.add(key(offset));
      if (!isOccupied(offX, offY)) return true;
    }
    if (!minimizingSelf) return false;
    for (let x = offX - node.width; x <= offX; x += cell) {
      for (let y = offY - node.height; y <= offY; y += cell) {
        if (x === offX && y === offY) continue;
        const nearby = { x, y };
        if (checked.has(key(nearby))) continue;
        if (checked.size >= maxCandidates) throw new RangeError('placement candidates exceed limit');
        checked.add(key(nearby));
        if (!isOccupied(x, y)) return true;
      }
    }
    return false;
  };
  for (let distance = 0; distance <= 100; distance++) {
    let y = 0;
    for (let x = distance; x >= -distance; x--) {
      if (y !== 0 && allowedCenter(x * cell, -y * cell) && unoccupied(x * cell, -y * cell)) return distance;
      if (allowedCenter(x * cell, y * cell) && unoccupied(x * cell, y * cell)) return distance;
      if (x > 0) y++;
      else y--;
    }
  }
  throw new Error('no sized placement within 100 cells');
}

/** Ordinary-node branch of sizedOptimizer.fillPlacementPoints. The returned
 * points are candidates; occupancy is checked later by moveNodeToBest. */
export function sizedPlacementPoints(
  graph: TalaGraph, node: TalaNode, median: Point,
  closestDistance: number, minimizingSelf: boolean, fixedOrigin?: Point
): Point[] {
  if (!Number.isInteger(closestDistance) || closestDistance < 0 || closestDistance > 100) {
    throw new RangeError('placement distance must be an integer in [0, 100]');
  }
  const cell = graph.cellSize;
  const seen = new Set<string>();
  const points: Point[] = [];
  const add = (offX: number, offY: number): boolean => {
    const point = {
      x: roundToNearestCellSize(median.x + offX, cell),
      y: roundToNearestCellSize(median.y + offY, cell),
    };
    if (fixedOrigin && (point.x < fixedOrigin.x || point.y < fixedOrigin.y)) return false;
    if (seen.has(key(point))) return false;
    if (points.length >= maxCandidates) throw new RangeError('placement candidates exceed limit');
    seen.add(key(point));
    points.push(point);
    return false;
  };
  const distance = closestDistance + 1;
  for (let x = distance; x >= -distance; x--) {
    for (let y = 0; y <= distance - Math.abs(x); y++) {
      if (y !== 0) iterPlacementsAroundPoint(node, cell, x, -y, minimizingSelf, add);
      iterPlacementsAroundPoint(node, cell, x, y, minimizingSelf, add);
    }
  }
  return points;
}
