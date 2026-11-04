// Translated from internal/invariant/errors.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
export const ErrViolation = new Error('layout invariant violated');
export function New(reason: string): Error {
  return new Error(`${ErrViolation.message}: ${reason}`, {
    cause: ErrViolation,
  });
}
