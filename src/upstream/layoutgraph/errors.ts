// Translated from internal/layoutgraph/errors.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
export const ErrInvalidCandidate = new Error('invalid layout candidate');
export const ErrNonImprovingCandidate = new Error(
  'layout candidate did not improve',
);
export function IsCandidateRejection(err: unknown): boolean {
  const seen = new Set<unknown>();
  while (err instanceof Error && !seen.has(err)) {
    if (err === ErrInvalidCandidate || err === ErrNonImprovingCandidate)
      return true;
    seen.add(err);
    err = err.cause;
  }
  return false;
}
