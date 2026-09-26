import { rngCooked } from './go-rng-cooked.js';

/** Go's math/rand.Source used by the pinned TALA placement pipeline.
 * The 607-word feedback register and its seed table preserve the same streams
 * for a given int64 seed, including Shuffle's Lemire reduction.
 */
export class GoRandom {
  private tap = 0;
  private feed = 607 - 273;
  private readonly vec: bigint[] = new Array<bigint>(607);

  constructor(seed: number | bigint) {
    let value = BigInt(seed) % 2147483647n;
    if (value < 0n) value += 2147483647n;
    if (value === 0n) value = 89482311n;
    let x = Number(value);
    for (let i = -20; i < 607; i++) {
      x = seedRand(x);
      if (i >= 0) {
        let word = BigInt(x) << 40n;
        x = seedRand(x);
        word ^= BigInt(x) << 20n;
        x = seedRand(x);
        word ^= BigInt(x);
        this.vec[i] = BigInt.asIntN(64, word ^ rngCooked[i]!);
      }
    }
  }

  uint64(): bigint {
    if (--this.tap < 0) this.tap += 607;
    if (--this.feed < 0) this.feed += 607;
    const word = BigInt.asIntN(64, this.vec[this.feed]! + this.vec[this.tap]!);
    this.vec[this.feed] = word;
    return BigInt.asUintN(64, word);
  }

  int63(): bigint { return this.uint64() & ((1n << 63n) - 1n); }
  uint32(): number { return Number(this.int63() >> 31n); }
  int31(): number { return Number(this.int63() >> 32n); }

  int31n(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 0x7fffffff) throw new RangeError('invalid Int31n argument');
    if ((BigInt(n) & (BigInt(n) - 1n)) === 0n) return this.int31() & (n - 1);
    const limit = 0x7fffffff - (0x80000000 % n);
    let value = this.int31();
    while (value > limit) value = this.int31();
    return value % n;
  }

  intn(n: number): number {
    if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError('invalid Intn argument');
    if (n <= 0x7fffffff) return this.int31n(n);
    const divisor = BigInt(n);
    if ((divisor & (divisor - 1n)) === 0n) return Number(this.int63() & (divisor - 1n));
    const limit = ((1n << 63n) - 1n) - ((1n << 63n) % divisor);
    let value = this.int63();
    while (value > limit) value = this.int63();
    return Number(value % divisor);
  }

  float64(): number {
    let value: number;
    do { value = Number(this.int63()) / 2 ** 63; } while (value === 1);
    return value;
  }

  /** The algorithm called by Go Rand.Shuffle for ordinary array lengths. */
  shuffle<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.lemire31(i + 1);
      [array[i], array[j]] = [array[j]!, array[i]!];
    }
  }

  private lemire31(n: number): number {
    if (n <= 0 || n > 0x7fffffff) throw new RangeError('invalid shuffle length');
    let product = BigInt(this.uint32()) * BigInt(n);
    let low = Number(product & 0xffffffffn);
    if (low < n) {
      const threshold = Number(BigInt.asUintN(32, -BigInt(n)) % BigInt(n));
      while (low < threshold) {
        product = BigInt(this.uint32()) * BigInt(n);
        low = Number(product & 0xffffffffn);
      }
    }
    return Number(product >> 32n);
  }
}

function seedRand(x: number): number {
  const hi = Math.trunc(x / 44488);
  const lo = x % 44488;
  let next = 48271 * lo - 3399 * hi;
  if (next < 0) next += 2147483647;
  return next;
}
