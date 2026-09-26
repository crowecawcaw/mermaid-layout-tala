/** Derived-graph count limits from upstream routing/ovg_resource.go. */
export const MAX_OVG_INTERSECTION_CANDIDATES = 1_000_000;
export const MAX_OVG_NODES = 200_000;
export const MAX_OVG_EDGES = 500_000;

export function assertOVGCount(resource: string, count: number, limit: number): void {
  if (!Number.isSafeInteger(count) || count > limit) {
    throw new Error(`TALA OVG resource limit exceeded: ${resource} ${count} exceeds limit ${limit}`);
  }
}
