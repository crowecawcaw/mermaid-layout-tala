import type { Point } from '../layout.js';
import { bezierLineIntersections } from './bezier-intersections.js';
import { shapePortPolicy } from './shape-ports.js';

export interface ShapeBox extends Point { width: number; height: number }
const straightOrRectangular = new Set(['square', 'realsquare', 'table', 'class',
  'text', 'code', 'image', 'parallelogram', 'hexagon', 'step', 'package', 'callout',
  'diamond', 'document', 'cylinder', 'queue', 'storeddata', 'page',
  'person', 'c4person', 'cloud']);
const ellipseShapes = new Set(['oval', 'circle']);

export function supportsShapeBorderTrace(shape: string | undefined): boolean {
  const kind = shapePortPolicy(shape).shape.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  return straightOrRectangular.has(kind) || ellipseShapes.has(kind);
}

/** lib/shape.TraceToShapeBorder for every upstream nodeshape perimeter. */
export function traceShapeBorder(shape: string | undefined, box: ShapeBox,
  rectBorderPoint: Point, previousPoint: Point): Point | undefined {
  const kind = shapePortPolicy(shape).shape.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  if (['square', 'realsquare', 'table', 'class', 'text', 'code', 'image']
    .includes(kind)) return { ...rectBorderPoint };
  const from = previousPoint, to = rectBorderPoint;
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return { ...rectBorderPoint };
  const length = distance + (from.x === to.x ? box.height : box.width);
  const extended = { x: from.x + dx * (1 / distance) * length,
    y: from.y + dy * (1 / distance) * length };
  let intersections: Point[];
  if (ellipseShapes.has(kind)) {
    intersections = ellipseIntersections(from, extended,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      box.width / 2, box.height / 2);
  } else if (['diamond', 'document', 'cylinder', 'queue', 'storeddata', 'page',
    'person', 'c4person', 'cloud']
    .includes(kind)) {
    intersections = curvedPerimeter(kind, box).flatMap((element) => element.type === 'line'
      ? one(segmentIntersection(element.from, element.to, from, extended))
      : bezierLineIntersections(element.points, from, extended));
    if (kind === 'c4person') {
      const radius = box.width * .22;
      intersections.push(...ellipseIntersections(from, extended,
        { x: box.x + box.width / 2, y: box.y + radius }, radius, radius));
    }
  } else {
    const path = straightPerimeter(kind, box);
    if (!path) return undefined;
    intersections = [];
    for (let i = 0; i < path.length; i++) {
      const point = segmentIntersection(path[i]!, path[(i + 1) % path.length]!,
        from, extended);
      if (point) intersections.push(point);
    }
  }
  let closest = rectBorderPoint, closestDistance = Infinity;
  for (const point of intersections) {
    const candidate = Math.hypot(point.x - to.x, point.y - to.y);
    if (candidate < closestDistance) { closest = point; closestDistance = candidate; }
  }
  return { x: roundAway(Math.fround(closest.x)), y: roundAway(Math.fround(closest.y)) };
}

function one(point: Point | undefined): Point[] { return point ? [point] : []; }

type TraceElement = { type: 'line'; from: Point; to: Point }
  | { type: 'cubic'; points: [Point, Point, Point, Point] };

/** Path operations preserve lib/svg/SvgPathContext's command-by-command
 * integer chopping before constructing each line or Bezier segment. */
class ShapePath {
  private current!: Point;
  private start!: Point;
  readonly elements: TraceElement[] = [];
  constructor(private readonly box: ShapeBox, private readonly sx: number,
    private readonly sy: number) {}
  private point(base: Point, x: number, y: number): Point {
    return { x: chopPrecision(base.x + this.sx * x),
      y: chopPrecision(base.y + this.sy * y) };
  }
  private next(relative: boolean, x: number, y: number): Point {
    return this.point(relative ? this.current : this.box, x, y);
  }
  startAt(x: number, y: number): void {
    this.current = this.start = this.point(this.box, x, y);
  }
  line(relative: boolean, x: number, y: number): void {
    const end = this.next(relative, x, y);
    this.addLine(end);
  }
  horizontal(relative: boolean, x: number): void {
    const end = this.next(relative, x, 0);
    if (!relative) end.y = this.current.y;
    this.addLine(end);
  }
  vertical(relative: boolean, y: number): void {
    const end = this.next(relative, 0, y);
    if (!relative) end.x = this.current.x;
    this.addLine(end);
  }
  private addLine(end: Point): void {
    this.elements.push({ type: 'line', from: this.current, to: end });
    this.current = end;
  }
  cubic(relative: boolean, x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number): void {
    const points: [Point, Point, Point, Point] = [this.current,
      this.next(relative, x1, y1), this.next(relative, x2, y2),
      this.next(relative, x3, y3)];
    this.elements.push({ type: 'cubic', points });
    this.current = points[3];
  }
  close(): void {
    this.elements.push({ type: 'line', from: this.current, to: this.start });
    this.current = this.start;
  }
}

function curvedPerimeter(kind: string, box: ShapeBox): TraceElement[] {
  if (kind === 'diamond') return diamondPerimeter(box);
  const { width: w, height: h } = box;
  const path = new ShapePath(box, kind === 'document' ? w : 1,
    kind === 'document' ? h : 1);
  switch (kind) {
    case 'document': {
      const end = 16.3 / 18.925;
      path.startAt(0, end);
      path.line(false, 0, 0);
      path.line(false, 1, 0);
      path.line(false, 1, end);
      path.cubic(false, 5 / 6, 12.8 / 18.925, 2 / 3, 12.8 / 18.925,
        1 / 2, end);
      path.cubic(false, 1 / 3, 19.8 / 18.925, 1 / 6, 19.8 / 18.925, 0, end);
      path.close();
      break;
    }
    case 'cylinder': {
      const arc = h < 48 ? h / 2 : 24;
      path.startAt(0, arc);
      path.cubic(false, 0, 0, w * .45, 0, w / 2, 0);
      path.cubic(false, w - w * .45, 0, w, 0, w, arc);
      path.vertical(true, h - arc * 2);
      path.cubic(false, w, h, w - w * .45, h, w / 2, h);
      path.cubic(false, w * .45, h, 0, h, 0, h - arc);
      path.vertical(true, -(h - arc * 2));
      path.close();
      break;
    }
    case 'queue': {
      const arc = w < 48 ? w / 2 : 24;
      path.startAt(arc, 0);
      path.horizontal(true, w - 2 * arc);
      path.cubic(false, w, 0, w, h * .45, w, h / 2);
      path.cubic(false, w, h - h * .45, w, h, w - arc, h);
      path.horizontal(true, -(w - 2 * arc));
      path.cubic(false, 0, h, 0, h - h * .45, 0, h / 2);
      path.cubic(false, 0, h * .45, 0, 0, arc, 0);
      path.close();
      break;
    }
    case 'storeddata': {
      const wedge = w < 30 ? w / 2 : 15;
      path.startAt(wedge, 0);
      path.horizontal(true, w - wedge);
      path.cubic(false, w - wedge * .27, 0, w - wedge, h * .27,
        w - wedge, h / 2);
      path.cubic(false, w - wedge, h - h * .27, w - wedge * .27, h, w, h);
      path.horizontal(true, -(w - wedge));
      path.cubic(false, wedge - wedge * .27, h, 0, h - h * .27, 0, h / 2);
      path.cubic(false, 0, h * .27, wedge - wedge * .27, 0, wedge, 0);
      path.close();
      break;
    }
    case 'page': {
      path.startAt(.5, 0);
      path.horizontal(false, w - 20.8164);
      path.cubic(false, w - 19.6456, 0, w - 18.521, .456297,
        w - 17.6811, 1.27202);
      path.line(false, w - 1.3647, 17.12);
      path.cubic(false, w - .4923, 17.9674, w, 19.1318, w, 20.348);
      path.vertical(false, h - .5);
      path.cubic(false, w, h - .2239, w - .2239, h, w - .5, h);
      path.horizontal(false, .499999);
      path.cubic(false, .223857, h, 0, h - .2239, 0, h - .5);
      path.vertical(false, .499999);
      path.cubic(false, 0, .223857, .223857, 0, .5, 0);
      path.close();
      break;
    }
    case 'person': {
      const p = new ShapePath(box, w / 68.3, h / 77.4);
      p.startAt(68.3, 77.4);
      p.horizontal(false, 0);
      p.vertical(true, -1.1);
      p.cubic(true, 0, -13.2, 7.5, -25.1, 19.3, -30.8);
      p.cubic(false, 12.8, 40.9, 8.9, 33.4, 8.9, 25.2);
      p.cubic(false, 8.9, 11.3, 20.2, 0, 34.1, 0);
      p.cubic(true, 13.9, 0, 25.2, 11.3, 25.2, 25.2);
      p.cubic(true, 0, 8.2, -3.8, 15.6, -10.4, 20.4);
      p.cubic(true, 11.8, 5.7, 19.3, 17.6, 19.3, 30.8);
      p.vertical(true, 1);
      p.horizontal(false, 68.3);
      p.close();
      return p.elements;
    }
    case 'c4person': {
      const headRadius = w * .22;
      const bodyTop = headRadius + headRadius * .8;
      const bodyHeight = h - bodyTop;
      const corner = Math.min(w * .175, bodyHeight * .25);
      const tangent = 4 * (Math.SQRT2 - 1) / 3 * corner;
      path.startAt(0, bodyTop + corner);
      path.cubic(true, 0, -tangent, tangent, -corner, corner, -corner);
      path.horizontal(true, w - 2 * corner);
      path.cubic(true, tangent, 0, corner, tangent, corner, corner);
      path.vertical(true, bodyHeight - 2 * corner);
      path.cubic(true, 0, tangent, -tangent, corner, -corner, corner);
      path.horizontal(true, -(w - 2 * corner));
      path.cubic(true, -tangent, 0, -corner, -tangent, -corner, -corner);
      path.close();
      break;
    }
    case 'cloud': {
      const p = new ShapePath(box, w / 834, h / 523);
      p.startAt(137.833, 182.833);
      p.cubic(true, 0, 5.556, -5.556, 11.111, -11.111, 11.111);
      p.cubic(true, -70.833, 6.944, -126.389, 77.778, -126.389, 163.889);
      p.cubic(true, 0, 91.667, 62.5, 165.278, 141.667, 165.278);
      p.horizontal(true, 537.5);
      p.cubic(true, 84.723, 0, 154.167, -79.167, 154.167, -175);
      p.cubic(true, 0, -91.667, -63.89, -168.056, -144.444, -173.611);
      p.cubic(true, -5.556, 0, -11.111, -4.167, -12.5, -11.111);
      p.cubic(true, -18.056, -93.055, -101.39, -162.5, -198.611, -162.5);
      p.cubic(true, -63.889, 0, -120.834, 29.167, -156.944, 75);
      p.cubic(true, -4.167, 5.556, -11.111, 6.945, -15.278, 5.556);
      p.cubic(true, -13.889, -5.556, -29.166, -8.333, -45.833, -8.333);
      p.cubic(false, 196.167, 71.722, 143.389, 120.333, 137.833, 182.833);
      p.close();
      return p.elements;
    }
  }
  return path.elements;
}

function diamondPerimeter(box: ShapeBox): TraceElement[] {
  const path = new ShapePath(box, box.width / 77, box.height / 76.9);
  path.startAt(38.5, 76.9);
  path.cubic(true, -.3, 0, -.5, -.1, -.7, -.3);
  path.line(false, .3, 39.2);
  path.cubic(true, -.4, -.4, -.4, -1, 0, -1.4);
  path.line(false, 37.8, .3);
  path.cubic(true, .4, -.4, 1, -.4, 1.4, 0);
  path.line(true, 37.5, 37.5);
  path.cubic(true, .4, .4, .4, 1, 0, 1.4);
  path.line(false, 39.2, 76.6);
  path.cubic(false, 39, 76.8, 38.8, 76.9, 38.5, 76.9);
  path.close();
  return path.elements;
}

function straightPerimeter(kind: string, box: ShapeBox): Point[] | undefined {
  const { width: w, height: h, x, y } = box;
  let relative: Array<[number, number]>;
  switch (kind) {
    case 'parallelogram': {
      const wedge = w <= 26 ? w / 2 : 26;
      relative = [[wedge, 0], [w, 0], [w - wedge, h], [0, h]];
      break;
    }
    case 'hexagon': {
      const half = 43.6 / 87.3;
      relative = [[w * .25, 0], [0, h * half], [w * .25, h],
        [w * .75, h], [w, h * half], [w * .75, 0]];
      break;
    }
    case 'step': {
      const wedge = w <= 35 ? w / 2 : 35;
      relative = [[0, 0], [w - wedge, 0], [w, h / 2],
        [w - wedge, h], [0, h], [wedge, h / 2]];
      break;
    }
    case 'package': {
      const topWidth = w >= 100 ? Math.min(150, Math.max(50, w * .5)) : w * .5;
      const topHeight = Math.min(55, h * .2);
      relative = [[0, 0], [topWidth, 0], [topWidth, topHeight],
        [w, topHeight], [w, h], [0, h]];
      break;
    }
    case 'callout': {
      const tipWidth = w < 60 ? w / 2 : 30;
      const tipHeight = h < 90 ? h / 2 : 45;
      relative = [[0, 0], [0, h - tipHeight], [w / 2, h - tipHeight],
        [w / 2, h], [w / 2 + tipWidth, h - tipHeight],
        [w, h - tipHeight], [w, 0]];
      break;
    }
    default: return undefined;
  }
  return relative.map(([px, py]) => ({ x: chopPrecision(x + px),
    y: chopPrecision(y + py) }));
}

function chopPrecision(value: number): number {
  const rounded = roundAway(Math.fround(value * 10_000) / 10_000);
  return rounded === 0 ? 0 : rounded;
}

/** geo.IntersectionPoint rounds the position along the first segment. */
function segmentIntersection(u0: Point, u1: Point, v0: Point, v1: Point): Point | undefined {
  const udx = u1.x - u0.x, udy = u1.y - u0.y;
  const vdx = v1.x - v0.x, vdy = v1.y - v0.y;
  const uvdx = v0.x - u0.x, uvdy = v0.y - u0.y;
  const denominator = udy * vdx - udx * vdy;
  if (denominator === 0) return undefined;
  const s = (vdx * uvdy - vdy * uvdx) / denominator;
  const t = (udx * uvdy - udy * uvdx) / denominator;
  if (s < 0 || s > 1 || t < 0 || t > 1) return undefined;
  return { x: u0.x + roundAway(s * udx), y: u0.y + roundAway(s * udy) };
}

function ellipseIntersections(from: Point, to: Point, center: Point,
  rx: number, ry: number): Point[] {
  if (rx <= 0 || ry <= 0) return [];
  const dx = to.x - from.x, dy = to.y - from.y;
  const x = from.x - center.x, y = from.y - center.y;
  const a = dx * dx / (rx * rx) + dy * dy / (ry * ry);
  const b = 2 * (x * dx / (rx * rx) + y * dy / (ry * ry));
  const c = x * x / (rx * rx) + y * y / (ry * ry) - 1;
  const discriminant = b * b - 4 * a * c;
  if (a === 0 || discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  const values = [(-b + root) / (2 * a), (-b - root) / (2 * a)];
  return values.filter((t) => t >= 0 && t <= 1)
    .map((t) => ({ x: from.x + t * dx, y: from.y + t * dy }));
}

function roundAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
