// Translated from D2 lib/geo/orientation.go at bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
export enum Orientation {
  TopLeft,
  TopRight,
  BottomLeft,
  BottomRight,
  Top,
  Right,
  Bottom,
  Left,
  NONE,
}
export function ToString(o: Orientation): string {
  return o >= 0 && o < Orientation.NONE ? Orientation[o]! : '';
}
export function SameSide(o1: Orientation, o2: Orientation): boolean {
  const {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    Top,
    Right,
    Bottom,
    Left,
  } = Orientation;
  for (const side of [
    [TopLeft, Top, TopRight],
    [BottomLeft, Bottom, BottomRight],
    [Left, TopLeft, BottomLeft],
    [Right, TopRight, BottomRight],
  ]) {
    if (side.includes(o1) && side.includes(o2)) return true;
  }
  return false;
}
export function IsDiagonal(o: Orientation): boolean {
  return o >= 0 && o <= Orientation.BottomRight;
}
export function IsHorizontal(o: Orientation): boolean {
  return o === Orientation.Left || o === Orientation.Right;
}
export function IsVertical(o: Orientation): boolean {
  return o === Orientation.Top || o === Orientation.Bottom;
}
export function GetOpposite(o: Orientation): Orientation {
  return (
    [
      Orientation.BottomRight,
      Orientation.BottomLeft,
      Orientation.TopRight,
      Orientation.TopLeft,
      Orientation.Bottom,
      Orientation.Left,
      Orientation.Top,
      Orientation.Right,
    ][o] ?? o
  );
}
