// Translated from internal/limits/work.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context, Done } from './context.js';
export const MaxEngineNodes = 10_000,
  MaxEngineEdges = 50_000,
  MaxEngineRoutePoints = 1_000_000,
  MaxEngineTreeDepth = 256,
  MaxGraphSize = 30_000;
export const MaxEngineWorkUnits = 61_440_000n,
  MaxTransactionWorkUnits = 1_000_000_000n,
  MaxTransactionOverlapReferences = 4_000_000n,
  MaxBinPackWorkUnits = 1_000_000_000n,
  MaxPlaceTreesWorkUnits = 68_000_000n,
  MaxLabelPlacementWorkUnits = 50_000_000n;
export class WorkGuard {
  private used = 0n;
  private readonly done: Done | null;
  constructor(
    private readonly ctx: Context,
    private readonly location: string,
    private limit: bigint,
  ) {
    if (!ctx) throw new Error(`TALA ${location} requires a context`);
    if (limit < 0n)
      throw new Error(`TALA ${location} work limit must not be negative`);
    this.done = ctx.Done();
    this.Finish();
  }
  Step(): void {
    this.used = BigInt.asIntN(64, this.used + 1n);
    if (this.used > this.limit) this.exceeded();
    if (this.used % this.pollingStride() === 0n) this.Check();
  }
  Add(units: bigint): void {
    if (units < 0n)
      throw new Error(`TALA ${this.location} work charge must not be negative`);
    if (units > this.limit || this.used > this.limit - units) {
      const previous = this.used;
      this.used = BigInt.asIntN(64, this.limit + 1n);
      const stride = this.pollingStride();
      if (previous <= this.limit && previous / stride !== this.limit / stride)
        this.Check();
      this.exceeded();
    }
    const previous = this.used;
    this.used = BigInt.asIntN(64, this.used + units);
    const stride = this.pollingStride();
    if (this.used % stride !== 0n && previous / stride === this.used / stride)
      return;
    this.Check();
  }
  private exceeded(): never {
    throw new Error(`TALA ${this.location} work exceeds limit ${this.limit}`);
  }
  private pollingStride(): bigint {
    return this.done === null ? 64n : 1024n;
  }
  Check(): void {
    if (this.done === null || this.done.closed) {
      const error = this.ctx.Err();
      if (error)
        throw new Error(`${this.location}: ${error.message}`, { cause: error });
    }
  }
  Finish(): void {
    this.Check();
  }
  SetLimit(limit: bigint): void {
    this.limit = limit;
  }
  Used(): bigint {
    return this.used;
  }
}
