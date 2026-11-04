// Translated from internal/limits/optimization.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from './context.js';
import { MaxUint64 } from './arithmetic.js';
export const MaxOptimizationWorkUnits = 250_000_000n;
export const ErrOptimizationResourceLimit = new Error(
  'TALA optimization resource limit exceeded',
);
export class OptimizationWorkGuard {
  private used = 0n;
  constructor(
    private readonly ctx: Context,
    private readonly location: string,
    private readonly limit: bigint,
  ) {
    if (!ctx) throw new Error(`TALA ${location} requires a context`);
    this.Finish();
  }
  Step(): void {
    this.Add(1n);
  }
  Add(amount: bigint): void {
    if (amount === 0n) return this.Check();
    if (MaxUint64 - this.used < amount) this.overflow();
    const previous = this.used,
      next = previous + amount;
    if (next > this.limit)
      throw new Error(
        `${ErrOptimizationResourceLimit.message}: TALA ${this.location} work exceeds limit ${this.limit}`,
        { cause: ErrOptimizationResourceLimit },
      );
    this.used = next;
    if (previous / 64n !== next / 64n) this.Check();
  }
  private overflow(): never {
    throw new Error(
      `${ErrOptimizationResourceLimit.message}: ${this.location} work arithmetic overflow`,
      { cause: ErrOptimizationResourceLimit },
    );
  }
  AddProduct(a: bigint, b: bigint): void {
    if (a !== 0n && b > MaxUint64 / a) this.overflow();
    this.Add(a * b);
  }
  AddSort(length: number): void {
    if (length <= 1) return this.Check();
    this.AddProduct(
      BigInt(length),
      BigInt((BigInt(length) - 1n).toString(2).length),
    );
  }
  Check(): void {
    const error = this.ctx.Err();
    if (error)
      throw new Error(`${this.location}: ${error.message}`, { cause: error });
  }
  Finish(): void {
    this.Check();
  }
  Location(): string {
    return this.location;
  }
  Used(): bigint {
    return this.used;
  }
}
export interface Random {
  uint32(): number;
  int63n(n: bigint): bigint;
}
export function Shuffle<T>(
  values: T[],
  random: Random,
  guard: OptimizationWorkGuard,
): void {
  if (!random)
    throw new Error(
      `TALA ${guard.Location()} shuffle requires a random generator`,
    );
  let i = values.length - 1;
  for (; i > 2147483646; i--) {
    guard.Step();
    const j = Number(random.int63n(BigInt(i + 1)));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  for (; i > 0; i--) {
    const j = shuffleIndex(random, i + 1, guard);
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
}
function shuffleIndex(
  random: Random,
  n: number,
  guard: OptimizationWorkGuard,
): number {
  guard.Step();
  let product = BigInt(random.uint32()) * BigInt(n),
    low = Number(BigInt.asUintN(32, product));
  if (low < n) {
    const threshold = (-n >>> 0) % n;
    while (low < threshold) {
      guard.Step();
      product = BigInt(random.uint32()) * BigInt(n);
      low = Number(BigInt.asUintN(32, product));
    }
  }
  return Number(product >> 32n);
}
