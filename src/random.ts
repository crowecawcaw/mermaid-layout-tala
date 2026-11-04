// Copyright 2009 The Go Authors. All rights reserved.
// Adapted from Go math/rand. See LICENSE-GO for the BSD-style license.
import { cooked } from './random-cooked.js';

/** Go's legacy math/rand stream, using exact 64-bit arithmetic. */
export class GoRandom {
  private tap = 0;
  private feed = 334;
  private readonly state: bigint[] = [];
  constructor(seed: bigint) {
    let normalized = seed % 2147483647n;
    if (normalized < 0) normalized += 2147483647n;
    if (normalized === 0n) normalized = 89482311n;
    let x = Number(normalized);
    const nextSeed = () => {
      x = 48271 * (x % 44488) - 3399 * Math.floor(x / 44488);
      if (x < 0) x += 2147483647;
      return BigInt(x);
    };
    for (let i = -20; i < 607; i++) {
      nextSeed();
      if (i >= 0) {
        let value = BigInt(x) << 40n;
        value ^= nextSeed() << 20n;
        value ^= nextSeed();
        value ^= cooked[i]!;
        this.state.push(BigInt.asIntN(64, value));
      }
    }
  }
  uint64(): bigint {
    if (--this.tap < 0) this.tap += 607;
    if (--this.feed < 0) this.feed += 607;
    const value = BigInt.asIntN(64, this.state[this.feed]! + this.state[this.tap]!);
    this.state[this.feed] = value;
    return BigInt.asUintN(64, value);
  }
  int63(): bigint {
    return this.uint64() & 9223372036854775807n;
  }
  uint32(): number {
    return Number(this.int63() >> 31n);
  }
  float64(): number {
    let value: number;
    do {
      value = Number(this.int63()) / 9223372036854775808;
    } while (value === 1);
    return value;
  }
  intn(n: number): number {
    if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647)
      throw new Error('random bound must be an integer in [1, 2147483647]');
    let value = Number(this.int63() >> 32n);
    if ((n & (n - 1)) === 0) return value & (n - 1);
    const maximum = 2147483647 - (2147483648 % n);
    while (value > maximum) value = Number(this.int63() >> 32n);
    return value % n;
  }
  shuffle<T>(values: T[]): void {
    if (values.length > 2147483647) throw new Error('shuffle exceeds maximum array size');
    for (let i = values.length - 1; i > 0; i--) {
      const n = BigInt(i + 1);
      let product = BigInt(this.uint32()) * n;
      let low = BigInt.asUintN(32, product);
      if (low < n) {
        const threshold = BigInt.asUintN(32, -n) % n;
        while (low < threshold) {
          product = BigInt(this.uint32()) * n;
          low = BigInt.asUintN(32, product);
        }
      }
      const j = Number(product >> 32n);
      [values[i], values[j]] = [values[j]!, values[i]!];
    }
  }
}

export type TalaSeed = number | bigint;
export function normalizeSeeds(input: readonly TalaSeed[] = [1, 2, 3]): bigint[] {
  if (!Array.isArray(input) || input.length === 0)
    throw new Error('tala requires at least one seed');
  if (input.length > 64) throw new Error('tala accepts at most 64 seed entries');
  const unique = new Set<bigint>();
  for (const seed of input) {
    if (typeof seed !== 'bigint' && (typeof seed !== 'number' || !Number.isSafeInteger(seed))) {
      throw new Error('tala seeds must be safe integer numbers or signed 64-bit bigints');
    }
    const value = BigInt(seed);
    if (value < -9223372036854775808n || value > 9223372036854775807n)
      throw new Error('tala seeds must fit signed 64-bit integers');
    unique.add(value);
    if (unique.size > 16) throw new Error('tala supports at most 16 unique seeds');
  }
  return [...unique];
}

let configuredSeeds = normalizeSeeds();
/** Configure defaults for subsequent layouts; inputs are defensively copied. */
export function setTalaSeeds(seeds: readonly TalaSeed[]): void {
  configuredSeeds = normalizeSeeds(seeds);
}
export function getTalaSeeds(): bigint[] {
  return [...configuredSeeds];
}
