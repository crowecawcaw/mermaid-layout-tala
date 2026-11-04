// Translated from D2 lib/geo/math.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
export function Round(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v);
}
export function EuclideanDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (x1 === x2) return Math.abs(y1 - y2);
  if (y1 === y2) return Math.abs(x1 - x2);
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
}
export function PrecisionCompare(a: number, b: number, e: number): number {
  if (Math.abs(a - b) < e) return 0;
  return a < b ? -1 : 1;
}
export function TruncateDecimals(v: number): number {
  return Math.trunc(v * 1000) / 1000;
}
export function Sign(i: number): number {
  return i < 0 ? -1 : i > 0 ? 1 : 0;
}
