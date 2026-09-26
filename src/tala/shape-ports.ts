import type { Point } from '../layout.js';
import policies from './shape-port-data.json' with { type: 'json' };

export type PortSide = 'top' | 'left' | 'bottom' | 'right';
export type PortOrientation = PortSide | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

interface RelativePort { x: number; y: number }
export interface ShapePortPolicy {
  shape: string;
  groups: RelativePort[][];
  indices: Record<PortOrientation, number[]>;
  centers: number[] | null;
  centerBySide: Record<PortOrientation, number>;
  mirrors: Partial<Record<string, number>> | null;
}

const byShape = new Map((policies as ShapePortPolicy[]).map((policy) => [
  policy.shape.toLowerCase().replaceAll(/[^a-z0-9]/g, ''), policy,
]));

function shapeKey(shape: string | undefined): string {
  const key = (shape ?? 'Square').toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  return byShape.has(key) ? key : 'square';
}

/** Upstream nodeshape shape policy, including row-specific SQL table ports. */
export function shapePortPolicy(shape: string | undefined, numColumns = 0): ShapePortPolicy {
  const key = shapeKey(shape);
  const base = byShape.get(key)!;
  if (key !== 'table' || numColumns <= 0) return base;
  if (!Number.isSafeInteger(numColumns)) throw new Error('numColumns must be a nonnegative safe integer');
  const left: RelativePort[] = [], right: RelativePort[] = [];
  const rowHeight = 1 / (numColumns + 1);
  let percentage = rowHeight + rowHeight / 2;
  for (let i = 0; i < numColumns; i++) {
    const clipped = Math.round(percentage * 10_000) / 10_000;
    const y = Math.trunc(clipped * 1000) / 1000;
    left.push({ x: 0, y });
    right.push({ x: 1, y });
    percentage += rowHeight;
  }
  const top = [0, 1, 2];
  const leftIndices = Array.from({ length: numColumns }, (_, i) => 3 + i);
  const bottom = [3 + numColumns, 4 + numColumns, 5 + numColumns];
  const rightIndices = Array.from({ length: numColumns }, (_, i) => 6 + numColumns + i);
  return {
    shape: base.shape,
    groups: [base.groups[0]!, left, base.groups[2]!, right],
    indices: {
      top, left: leftIndices, bottom, right: rightIndices,
      topLeft: [...top, ...leftIndices], topRight: [...top, ...rightIndices],
      bottomLeft: [...bottom, ...leftIndices], bottomRight: [...bottom, ...rightIndices],
    },
    centers: null,
    centerBySide: { top: -1, left: -1, bottom: -1, right: -1,
      topLeft: -1, topRight: -1, bottomLeft: -1, bottomRight: -1 },
    mirrors: null,
  };
}

/** Matches layoutgraph.Node.ports: percentages are rounded inside each box. */
export function shapePorts(shape: string | undefined, topLeft: Point,
  width: number, height: number, numColumns = 0): Point[] {
  return shapePortPolicy(shape, numColumns).groups.flatMap((group) => group.map((relative) => ({
    x: topLeft.x + Math.round(width * relative.x),
    y: topLeft.y + Math.round(height * relative.y),
  })));
}

export function centerPort(shape: string | undefined, side: PortSide,
  topLeft: Point, width: number, height: number, numColumns = 0): Point | undefined {
  const index = shapePortPolicy(shape, numColumns).centerBySide[side];
  return index >= 0 ? shapePorts(shape, topLeft, width, height, numColumns)[index] : undefined;
}

export function tableColumnPortIndex(numColumns: number, side: 'left' | 'right', column: number): number {
  const count = numColumns === 0 ? 1 : numColumns;
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(column) || column < 0 || column >= count) {
    throw new Error('table column port index out of range');
  }
  return side === 'left' ? 3 + column : 6 + count + column;
}
