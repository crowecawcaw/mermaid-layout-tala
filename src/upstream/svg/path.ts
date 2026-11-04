// Translated SvgPathContext from lib/svg/path.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Round } from '../geo/math.js';
import { Segment, type Intersectable } from '../geo/segment.js';
import { BezierCurve } from '../geo/bezier.js';
export enum PathCommandKind {
  Move,
  Line,
  Cubic,
  Close,
}
export interface PathCommand {
  Kind: PathCommandKind;
  Control1: Point;
  Control2: Point;
  End: Point;
}
function command(
  kind: PathCommandKind,
  end = new Point(0, 0),
  c1 = new Point(0, 0),
  c2 = new Point(0, 0),
): PathCommand {
  return {
    Kind: kind,
    Control1: c1.Copy(),
    Control2: c2.Copy(),
    End: end.Copy(),
  };
}
function chopPrecision(f: number): number {
  const v = Round(Math.fround(f * 10000) / 10000);
  return v === 0 ? 0 : v;
}
function fmt(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return '+Inf';
  if (v === -Infinity) return '-Inf';
  if (Object.is(v, -0)) return '-0';
  if (v !== 0 && (Math.abs(v) < 0.0001 || Math.abs(v) >= 1000000))
    return v
      .toExponential()
      .replace(/e([+-])(\d)$/, (_, sign, digit) => `e${sign}0${digit}`);
  return String(v);
}
export class SvgPathContext {
  Path: Intersectable[] = [];
  Commands: string[] = [];
  private commands: PathCommand[] = [];
  Start: Point | null = null;
  Current: Point | null = null;
  TopLeft: Point;
  constructor(
    tl: Point,
    public ScaleX: number,
    public ScaleY: number,
  ) {
    this.TopLeft = tl.Copy();
  }
  Relative(base: Point, dx: number, dy: number): Point {
    return new Point(
      chopPrecision(base.X + this.ScaleX * dx),
      chopPrecision(base.Y + this.ScaleY * dy),
    );
  }
  Absolute(x: number, y: number): Point {
    return this.Relative(this.TopLeft, x, y);
  }
  StartAt(p: Point): void {
    this.Start = p;
    this.Commands.push(`M ${fmt(p.X)} ${fmt(p.Y)}`);
    this.commands.push(command(PathCommandKind.Move, p));
    this.Current = p.Copy();
  }
  Z(): void {
    this.Path.push(new Segment(this.Current!.Copy(), this.Start!.Copy()));
    this.Commands.push('Z');
    this.commands.push(command(PathCommandKind.Close));
    this.Current = this.Start!.Copy();
  }
  L(relative: boolean, x: number, y: number): void {
    const end = relative
      ? this.Relative(this.Current!, x, y)
      : this.Absolute(x, y);
    this.Path.push(new Segment(this.Current!.Copy(), end));
    this.Commands.push(`L ${fmt(end.X)} ${fmt(end.Y)}`);
    this.commands.push(command(PathCommandKind.Line, end));
    this.Current = end.Copy();
  }
  C(
    relative: boolean,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ): void {
    const p = (x: number, y: number) =>
        relative ? this.Relative(this.Current!, x, y) : this.Absolute(x, y),
      points = [this.Current!.Copy(), p(x1, y1), p(x2, y2), p(x3, y3)];
    this.Path.push(new BezierCurve(points));
    this.Commands.push(
      `C ${fmt(points[1]!.X)} ${fmt(points[1]!.Y)} ${fmt(points[2]!.X)} ${fmt(points[2]!.Y)} ${fmt(points[3]!.X)} ${fmt(points[3]!.Y)}`,
    );
    this.commands.push(
      command(PathCommandKind.Cubic, points[3]!, points[1]!, points[2]!),
    );
    this.Current = points[3]!.Copy();
  }
  H(relative: boolean, x: number): void {
    const end = relative
      ? this.Relative(this.Current!, x, 0)
      : this.Absolute(x, 0);
    if (!relative) end.Y = this.Current!.Y;
    this.Path.push(new Segment(this.Current!.Copy(), end.Copy()));
    this.Commands.push(`H ${fmt(end.X)}`);
    this.commands.push(command(PathCommandKind.Line, end));
    this.Current = end.Copy();
  }
  V(relative: boolean, y: number): void {
    const end = relative
      ? this.Relative(this.Current!, 0, y)
      : this.Absolute(0, y);
    if (!relative) end.X = this.Current!.X;
    this.Path.push(new Segment(this.Current!.Copy(), end));
    this.Commands.push(`V ${fmt(end.Y)}`);
    this.commands.push(command(PathCommandKind.Line, end));
    this.Current = end.Copy();
  }
  PathCommands(): PathCommand[] {
    return this.commands.map((c) =>
      command(c.Kind, c.End, c.Control1, c.Control2),
    );
  }
  PathData(): string {
    return this.Commands.join(' ');
  }
}
