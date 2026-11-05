// Translated internal/placement/sized_optimizer.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Node } from '../layoutgraph/node.js';
import { Point } from '../geo/point.js';
import type { OptimizationWorkGuard } from '../limits/optimization.js';
import { ErrOptimizationResourceLimit } from '../limits/optimization.js';
import { maxEngineTopologyReferences } from '../layoutgraph/topology-preflight.js';
import { nodeDebugID } from '../layoutgraph/debug.js';
import { Slice } from '../gosort/slice.js';
import { roundToNearestCellSize } from './types.js';
import { iterPlacementsAroundPoint } from './sized-kernels.js';
import { SizedSetup } from './sized-setup.js';
import { OptimizerSpatialIndex } from './optimizer-spatial-index.js';
const maxCandidates = 1_000_000;
const pointKey = (x: number, y: number): string => `${x},${y}`;
const goInt64 = (value: number): bigint =>
  !Number.isFinite(value) ||
  value >= 9223372036854775808 ||
  value < -9223372036854775808
    ? -(1n << 63n)
    : BigInt(Math.trunc(value));
export class PlacementPointsScratch {
  seen = new Set<bigint>();
  points: Point[] = [];
}
export class SizedSearch extends SizedSetup {
  readonly spatialIndex = new OptimizerSpatialIndex();
  findClosestUnoccupiedDistanceGuarded(
    node: Node | null,
    p: Point | null,
    minimizingSelf: boolean,
    checked: Set<string> | null,
    guard: OptimizationWorkGuard,
  ): number {
    if (
      node === null ||
      node.Graph === null ||
      node.TopLeft === null ||
      p === null
    )
      throw new Error(
        `TALA ${guard.Location()} placement search requires a positioned node, graph, and point`,
      );
    if (!(this.cellSize > 0) || !Number.isFinite(this.cellSize))
      throw new Error(
        `TALA ${guard.Location()} placement search requires a finite positive cell size`,
      );
    if ((checked?.size ?? 0) > maxCandidates)
      throw new Error(
        `${ErrOptimizationResourceLimit.message}: TALA ${guard.Location()} checked placement count exceeds limit ${maxCandidates}`,
        { cause: ErrOptimizationResourceLimit },
      );
    const cell = this.cellSize;
    for (let curr = 0; curr <= 100; curr++) {
      guard.Step();
      const ring = curr * cell;
      let x = ring,
        y = 0;
      while (x >= -ring) {
        guard.Step();
        if (y !== 0) {
          const a = new Point(
            roundToNearestCellSize(p.X + x, cell),
            roundToNearestCellSize(p.Y - y, cell),
          );
          if (
            this.fixedOrigin === null ||
            (a.X >= this.fixedOrigin.X && a.Y >= this.fixedOrigin.Y)
          ) {
            if (
              this.findUnoccupiedGuarded(
                x,
                -y,
                node.Width,
                node.Height,
                minimizingSelf,
                node,
                p,
                checked,
                guard,
              )
            )
              return curr;
          }
        }
        const b = new Point(
          roundToNearestCellSize(p.X + x, cell),
          roundToNearestCellSize(p.Y + y, cell),
        );
        if (
          this.fixedOrigin === null ||
          (b.X >= this.fixedOrigin.X && b.Y >= this.fixedOrigin.Y)
        ) {
          if (
            this.findUnoccupiedGuarded(
              x,
              y,
              node.Width,
              node.Height,
              minimizingSelf,
              node,
              p,
              checked,
              guard,
            )
          )
            return curr;
        }
        if (x > 0) y += cell;
        else y -= cell;
        x -= cell;
      }
    }
    throw new Error(
      `could not find closest unoccupied distance for p=&{${p.X} ${p.Y}}, node=${nodeDebugID(node)}`,
    );
  }
  private findUnoccupiedGuarded(
    x: number,
    y: number,
    width: number,
    height: number,
    minimizingSelf: boolean,
    node: Node,
    p: Point,
    checked: Set<string> | null,
    guard: OptimizationWorkGuard,
  ): boolean {
    guard.Step();
    let skip = false;
    const mark = (x: number, y: number): boolean => {
      if (checked === null) return false;
      const key = pointKey(x, y);
      if (checked.has(key)) return true;
      if (checked.size >= maxCandidates)
        throw new Error(
          `${ErrOptimizationResourceLimit.message}: TALA ${guard.Location()} checked placement count exceeds limit ${maxCandidates}`,
          { cause: ErrOptimizationResourceLimit },
        );
      checked.add(key);
      return false;
    };
    skip = mark(x, y);
    if (!skip && !this.isPointOccupiedGuarded(x, y, p, node, guard))
      return true;
    if (!minimizingSelf) return false;
    for (let i = x - width; i <= x; i += this.cellSize)
      for (let j = y - height; j <= y; j += this.cellSize) {
        guard.Step();
        if (i === x && j === y) continue;
        if (mark(i, j)) continue;
        if (!this.isPointOccupiedGuarded(i, j, p, node, guard)) return true;
      }
    return false;
  }
  private isPointOccupiedGuarded(
    x: number,
    y: number,
    p: Point,
    node: Node,
    guard: OptimizationWorkGuard,
  ): boolean {
    const point = new Point(
      roundToNearestCellSize(p.X + x, this.cellSize),
      roundToNearestCellSize(p.Y + y, this.cellSize),
    );
    if (
      this.fixedOrigin !== null &&
      (point.X < this.fixedOrigin.X || point.Y < this.fixedOrigin.Y)
    )
      return true;
    const [, occupied] = this.spatialIndex.isOccupied(this.graph, point, guard);
    if (!occupied && !this.spatialIndex.doesOverlap(node, point, [node], guard))
      return false;
    return true;
  }
  fillPlacementPointsGuarded(
    node: Node | null,
    median: Point | null,
    minUnocc: number,
    minimizingSelf: boolean,
    scratch: PlacementPointsScratch,
    guard: OptimizationWorkGuard,
  ): Point[] {
    if (node === null || node.TopLeft === null || median === null)
      throw new Error(
        `TALA ${guard.Location()} placement generation requires a positioned node and median`,
      );
    if (minUnocc < 0 || minUnocc > 100 || !Number.isFinite(minUnocc))
      throw new Error(
        `TALA ${guard.Location()} placement distance must be finite and within [0, 100]`,
      );
    if (!(this.cellSize > 0) || !Number.isFinite(this.cellSize))
      throw new Error(
        `TALA ${guard.Location()} placement generation requires a finite positive cell size`,
      );
    for (const k of scratch.seen) {
      guard.Step();
      scratch.seen.delete(k);
    }
    scratch.points.length = 0;
    const dist = minUnocc + 1;
    let addError: unknown = null;
    const add = (offX: number, offY: number): boolean => {
      if (addError !== null) return true;
      try {
        guard.Step();
        const x = roundToNearestCellSize(median.X + offX, this.cellSize),
          y = roundToNearestCellSize(median.Y + offY, this.cellSize);
        if (
          this.fixedOrigin !== null &&
          (x < this.fixedOrigin.X || y < this.fixedOrigin.Y)
        )
          return false;
        const ix = BigInt.asUintN(32, goInt64(x / this.cellSize)),
          iy = BigInt.asUintN(32, goInt64(y / this.cellSize)),
          key = (ix << 32n) | iy;
        if (scratch.seen.has(key)) return false;
        if (scratch.points.length >= maxCandidates)
          throw new Error(
            `${ErrOptimizationResourceLimit.message}: TALA LocalOptimize placement candidates exceed limit ${maxCandidates}`,
            { cause: ErrOptimizationResourceLimit },
          );
        scratch.seen.add(key);
        scratch.points.push(new Point(x, y));
        return false;
      } catch (error) {
        addError = error;
        return true;
      }
    };
    for (let x = dist; x >= -dist; x--) {
      guard.Step();
      const maxY = dist - Math.abs(x);
      for (let y = 0; y <= maxY; y++) {
        guard.Step();
        if (y !== 0)
          iterPlacementsAroundPoint(node, x, -y, minimizingSelf, add);
        iterPlacementsAroundPoint(node, x, y, minimizingSelf, add);
        if (addError !== null) throw addError;
      }
    }
    const data = node.LongDistanceNeighborRequirements;
    if (data.size > 0) {
      if (data.size > maxEngineTopologyReferences)
        throw new Error(
          `TALA ${guard.Location()} long-distance neighbor references exceed limit ${maxEngineTopologyReferences}`,
        );
      const cell = Math.trunc(this.cellSize),
        neighbors: Node[] = [];
      for (const adjacent of data.keys()) {
        guard.Step();
        neighbors.push(adjacent);
      }
      guard.AddSort(neighbors.length);
      Slice(neighbors, (a, b) => a.ID < b.ID);
      for (const adjacent of neighbors) {
        guard.Step();
        const requirements = data.get(adjacent)!;
        if (adjacent == null || adjacent.TopLeft === null)
          throw new Error(
            `TALA ${guard.Location()} found an unpositioned long-distance neighbor`,
          );
        const maxW = requirements.MaxWidth,
          maxH = requirements.MaxHeight,
          ax = adjacent.TopLeft.X - median.X,
          ay = adjacent.TopLeft.Y - median.Y;
        if (maxW > cell) {
          add(Math.floor((ax - node.Width - maxW) / cell) * cell, ay);
          add(Math.ceil((ax + adjacent.Width + maxW) / cell) * cell, ay);
        }
        if (maxH > cell) {
          add(ax, Math.floor((ay - node.Height - maxH) / cell) * cell);
          add(ax, Math.ceil((ay + adjacent.Height + maxH) / cell) * cell);
        }
        if (addError !== null) throw addError;
      }
    }
    if (node.HerdAssignment !== null) {
      if (scratch.points.length >= maxCandidates)
        throw new Error(
          `${ErrOptimizationResourceLimit.message}: TALA LocalOptimize placement candidates exceed limit ${maxCandidates}`,
          { cause: ErrOptimizationResourceLimit },
        );
      scratch.points.push(node.TopLeft.Copy());
    }
    guard.Add(BigInt(scratch.points.length));
    return scratch.points;
  }
}
