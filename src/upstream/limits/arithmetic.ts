// Translated from internal/limits/arithmetic.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
export const MaxUint64 = (1n << 64n) - 1n;
export function CheckedAddUint64(a: bigint, b: bigint): [bigint, boolean] {
  return MaxUint64 - a < b ? [0n, false] : [a + b, true];
}
export function CheckedMulUint64(a: bigint, b: bigint): [bigint, boolean] {
  return a !== 0n && MaxUint64 / a < b ? [0n, false] : [a * b, true];
}
