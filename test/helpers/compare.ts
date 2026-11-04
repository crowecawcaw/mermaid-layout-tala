import { expect } from 'vitest';
export function compare(
  actual: unknown,
  expected: unknown,
  path = 'result',
): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(
      1e-10 * Math.max(1, Math.abs(expected)),
    );
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((v, i) =>
      compare((actual as unknown[])[i], v, `${path}[${i}]`),
    );
  } else if (expected !== null && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort(), path).toEqual(
      Object.keys(expected).sort(),
    );
    for (const [key, value] of Object.entries(expected))
      compare(
        (actual as Record<string, unknown>)[key],
        value,
        `${path}.${key}`,
      );
  } else expect(actual, path).toBe(expected);
}
