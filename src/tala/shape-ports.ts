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

function midpoint(a: Point, b: Point, c: Point, d: Point): Point {
  // geo.BezierCurve.At(0.5), retaining Go's operation order.
  return {
    x: d.x * 0.125 + c.x * 0.75 * 0.5 + b.x * 1.5 * 0.25 + a.x * 0.125,
    y: d.y * 0.125 + c.y * 0.75 * 0.5 + b.y * 1.5 * 0.25 + a.y * 0.125,
  };
}

/** The seven upstream shapes whose snap percentages depend on box dimensions. */
function dimensionedGroups(key: string, width: number, height: number): RelativePort[][] | undefined {
  // geo.NewRelativePoint truncates both percentages to three decimals.
  const rp = (x: number, y: number): RelativePort => ({
    x: Math.trunc(x * 1000) / 1000, y: Math.trunc(y * 1000) / 1000,
  });
  const pt = (x: number, y: number): Point => ({ x, y });
  if (key === 'parallelogram') {
    const wedge = width < 26 ? width / 2 : 26;
    const left = (wedge / 2 + wedge) / 2 / width;
    return [
      [rp(wedge / width + ((width - wedge) / width) * .25, 0), rp(wedge / width + ((width - wedge) / width) * .5, 0), rp(wedge / width + ((width - wedge) / width) * .75, 0)],
      [rp(left, .25), rp(wedge / 2 / width, .5), rp(wedge / 2 / 2 / width, .75)],
      [.25, .5, .75].map((n) => rp(((width - wedge) / width) * n, 1)),
      [rp((width - wedge) / width + left, .25), rp((width - wedge) / width + wedge / 2 / width, .5), rp((width - wedge) / width + wedge / 2 / 2 / width, .75)],
    ];
  }
  if (key === 'step') {
    const wedge = width < 35 ? width / 2 : 35;
    const top = [.25, .5, .75].map((n) => rp(((width - wedge) / width) * n, 0));
    return [top, [rp(wedge / width / 2, .25), rp(wedge / width, .5), rp(wedge / width / 2, .75)], top.map((p) => rp(p.x, 1)), [rp(1, .5)]];
  }
  if (key === 'callout') {
    const tipWidth = width < 60 ? width / 2 : 30;
    const tipHeight = height < 90 ? height / 2 : 45;
    const side = (height - tipHeight) / height;
    return [[rp(.25, 0), rp(.5, 0), rp(.75, 0)],
      [.25, .5, .75].map((n) => rp(0, side * n)),
      [rp(.5 * .33, side), rp(.5 * .66, side), rp(.5, 1), rp(1 - ((width / 2 - tipWidth) / width) * .5, side)],
      [.25, .5, .75].map((n) => rp(1, side * n))];
  }
  if (key === 'package') {
    const topWidth = width < 100 ? width * .5 : Math.min(150, Math.max(50, width * .5));
    const topHeight = height < 68 ? height * .2 : Math.min(55, Math.max(34, height * .2));
    const wr = topWidth / width, hr = topHeight / height;
    return [[rp(wr * .33, 0), rp(wr * .66, 0), rp(wr + (1 - wr) * .5, hr)],
      [.25, .5, .75].map((n) => rp(0, hr + (1 - hr) * n)),
      [.25, .5, .75].map((n) => rp(n, 1)),
      [.25, .5, .75].map((n) => rp(1, hr + (1 - hr) * n))];
  }
  if (key === 'cylinder') {
    const arc = height < 48 ? height / 2 : 24;
    const tl = midpoint(pt(0, arc), pt(0, 0), pt(width * .45, 0), pt(width / 2, 0));
    const tr = midpoint(pt(width / 2, 0), pt(width - width * .45, 0), pt(width, 0), pt(width, arc));
    const br = midpoint(pt(width, height - arc), pt(width, height), pt(width - width * .45, height), pt(width / 2, height));
    const bl = midpoint(pt(width / 2, height), pt(width * .45, height), pt(0, height), pt(0, height - arc));
    const side = [.25, .5, .75].map((n) => arc / height + ((height - arc * 2) / height) * n);
    return [[rp(tl.x / width, tl.y / height), rp(.5, 0), rp(tr.x / width, tr.y / height)],
      side.map((n) => rp(0, n)), [rp(bl.x / width, bl.y / height), rp(.5, 1), rp(br.x / width, br.y / height)], side.map((n) => rp(1, n))];
  }
  if (key === 'queue') {
    const arc = width < 48 ? width / 2 : 24;
    const tl = midpoint(pt(arc, 0), pt(0, 0), pt(0, height * .45), pt(0, height / 2));
    const tr = midpoint(pt(width - arc, 0), pt(width, 0), pt(width, height * .45), pt(width, height / 2));
    const br = midpoint(pt(width, height / 2), pt(width, height - height * .45), pt(width, height), pt(width - arc, height));
    const bl = midpoint(pt(0, height / 2), pt(0, height - height * .45), pt(0, height), pt(arc, height));
    const top = [.25, .5, .75].map((n) => arc / width + ((width - arc * 2) / width) * n);
    return [top.map((n) => rp(n, 0)), [rp(tl.x / width, tl.y / height), rp(0, .5), rp(bl.x / width, bl.y / height)],
      top.map((n) => rp(n, 1)), [rp(tr.x / width, tr.y / height), rp(1, .5), rp(br.x / width, br.y / height)]];
  }
  if (key === 'storeddata') {
    const wedge = width < 15 ? width / 2 : 15;
    const tl = midpoint(pt(wedge, 0), pt(wedge - wedge * .27, 0), pt(0, height * .27), pt(0, height / 2));
    const bl = midpoint(pt(wedge, height), pt(wedge - wedge * .27, height), pt(0, height - height * .27), pt(0, height / 2));
    const tr = midpoint(pt(width, 0), pt(width - wedge * .27, 0), pt(width - wedge, height * .27), pt(width - wedge, height / 2));
    const br = midpoint(pt(width - wedge, height / 2), pt(width - wedge, height - height * .27), pt(width - wedge * .27, height), pt(width, height));
    const side = (width - wedge) / width, start = 1 - side;
    const top = [.25, .5, .75].map((n) => start + n * side);
    return [top.map((n) => rp(n, 0)), [rp(tl.x / width, tl.y / height), rp(0, .5), rp(bl.x / width, bl.y / height)],
      top.map((n) => rp(n, 1)), [rp(tr.x / width, tr.y / height), rp((width - wedge) / width, .5), rp(br.x / width, br.y / height)]];
  }
  return undefined;
}

export function shapePortGroups(shape: string | undefined, topLeft: Point,
  width: number, height: number, numColumns = 0): Point[][] {
  const groups = dimensionedGroups(shapeKey(shape), width, height)
    ?? shapePortPolicy(shape, numColumns).groups;
  return groups.map((group) => group.map((relative) => ({
    x: topLeft.x + Math.round(width * relative.x),
    y: topLeft.y + Math.round(height * relative.y),
  })));
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
  return shapePortGroups(shape, topLeft, width, height, numColumns).flat();
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
