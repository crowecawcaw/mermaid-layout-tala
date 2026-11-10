// Translated seed-result coordination from d2talalayout/layout.go at D2 bf337903.
// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
import type { Score } from '../quality/scoring.js';

export interface SeedCandidate<T> { value: T; score: Score }

/** Choose the lowest score, breaking ties in favor of the later authored seed. */
export function coordinateLocalSeeds<T>(
  seeds: readonly bigint[],
  run: (seed: bigint, index: number) => SeedCandidate<T>,
): SeedCandidate<T> {
  if (!seeds.length) throw new Error('tala requires at least one seed');
  let best: SeedCandidate<T> | null = null;
  const errors: string[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]!;
    try {
      const candidate = run(seed, i);
      if (!best || candidate.score.Compare(best.score) <= 0) best = candidate;
    } catch (error) {
      errors.push(`seed ${seed}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!best) throw new Error(`all TALA seed attempts failed: ${errors.join('\n')}`);
  return best;
}
