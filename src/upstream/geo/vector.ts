// Translated from D2 lib/geo/vector.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Point } from './point.js';
import { EuclideanDistance } from './math.js';
export class Vector {
  readonly components: number[];
  constructor(...components: number[]) {
    this.components = components;
  }
  AddLength(length: number): Vector {
    return this.Unit().Multiply(this.Length() + length);
  }
  Add(b: Vector): Vector {
    return new Vector(...this.components.map((v, i) => v + b.components[i]!));
  }
  Minus(b: Vector): Vector {
    return new Vector(...this.components.map((v, i) => v - b.components[i]!));
  }
  Multiply(v: number): Vector {
    return new Vector(...this.components.map((c) => c * v));
  }
  Length(): number {
    let sum = 0;
    for (const c of this.components) sum += c * c;
    return Math.sqrt(sum);
  }
  Unit(): Vector {
    return this.Multiply(1 / this.Length());
  }
  ToPoint(): Point {
    return new Point(this.components[0]!, this.components[1]!);
  }
  Radians(): number {
    return Math.fround(Math.atan2(this.components[1]!, this.components[0]!));
  }
  Degrees(): number {
    return (this.Radians() * 180) / Math.PI;
  }
  Reverse(): Vector {
    return this.Multiply(-1);
  }
}
export function NewVectorFromProperties(length: number, angle: number): Vector {
  return new Vector(length * Math.sin(angle), length * Math.cos(angle));
}
export function GetUnitNormalVector(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): [number, number] {
  const length = EuclideanDistance(x1, y1, x2, y2);
  return [(y1 - y2) / length, (x2 - x1) / length];
}
