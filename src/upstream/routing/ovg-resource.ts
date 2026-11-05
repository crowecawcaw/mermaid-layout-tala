// Translated resource accounting from internal/routing/ovg_resource.go at D2
// bf337903. MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Background, type Context, type Done } from '../limits/context.js';
import type { Point } from '../geo/point.js';
import { OVGNode } from './ovg-node.js';
import type { OVGEdge } from './ovg-edge.js';
import type { OVG } from './ovg.js';
import type { OVGEdgeSetBudget } from './ovg-edge-set.js';
export const MaxOVGIntersectionCandidates = 1_000_000n,
  MaxOVGNodes = 200_000n,
  MaxOVGEdges = 500_000n,
  MaxOVGWorkUnits = 250_000_000n;
const maxUint64 = (1n << 64n) - 1n;
export interface OVGBuildLimits {
  intersectionCandidates: bigint;
  nodes: bigint;
  edges: bigint;
  work: bigint;
}
export function defaultOVGBuildLimits(): OVGBuildLimits {
  return {
    intersectionCandidates: MaxOVGIntersectionCandidates,
    nodes: MaxOVGNodes,
    edges: MaxOVGEdges,
    work: MaxOVGWorkUnits,
  };
}
export function ovgResourceOverflow(resource: string): Error {
  return new Error(
    `TALA OVG resource limit exceeded: ${resource} arithmetic overflow`,
  );
}
export function ovgResourceExceeded(
  resource: string,
  requested: bigint,
  limit: bigint,
): Error {
  return new Error(
    `TALA OVG resource limit exceeded: ${resource} ${requested} exceeds limit ${limit}`,
  );
}
export class OVGBuildGuard implements OVGEdgeSetBudget {
  private done: Done | null;
  candidates = 0n;
  nodes = 0n;
  edges = 0n;
  work = 0n;
  constructor(
    private ctx: Context | null,
    readonly limits: OVGBuildLimits,
    private aggregate: { Add(n: bigint): void } | null = null,
  ) {
    this.ctx ??= Background;
    this.done = this.ctx.Done();
    this.Check();
  }
  Check(): void {
    if (this.done === null || this.done.closed) {
      const error = this.ctx!.Err();
      if (error)
        throw new Error(`EdgeRouting: ${error.message}`, { cause: error });
    }
  }
  private reserve(
    resource: string,
    used: bigint,
    amount: bigint,
    limit: bigint,
  ): bigint {
    this.Check();
    const next = used + amount;
    if (next > maxUint64) throw ovgResourceOverflow(resource);
    if (next > limit) throw ovgResourceExceeded(resource, next, limit);
    return next;
  }
  reserveCandidates(amount: bigint): void {
    this.candidates = this.reserve(
      'intersection candidate count',
      this.candidates,
      amount,
      this.limits.intersectionCandidates,
    );
  }
  reserveNodes(amount: bigint): void {
    this.nodes = this.reserve(
      'node count',
      this.nodes,
      amount,
      this.limits.nodes,
    );
  }
  reserveEdges(amount: bigint): void {
    this.edges = this.reserve(
      'edge count',
      this.edges,
      amount,
      this.limits.edges,
    );
  }
  Add(amount: bigint): void {
    const next = this.work + amount;
    if (next > maxUint64) {
      this.Check();
      throw ovgResourceOverflow('work units');
    }
    if (next > this.limits.work) {
      this.Check();
      throw ovgResourceExceeded('work units', next, this.limits.work);
    }
    if (
      this.done === null ||
      amount === 0n ||
      this.work / 1024n !== next / 1024n
    )
      this.Check();
    this.work = next;
    this.aggregate?.Add(amount);
  }
  Step(): void {
    this.Add(1n);
  }
  reserveSortWork(length: number): void {
    if (length < 2) {
      this.Check();
      return;
    }
    let levels = 0n;
    for (let remaining = BigInt(length - 1); remaining > 0n; remaining >>= 1n)
      levels++;
    const work = BigInt(length) * levels;
    if (work > maxUint64) throw ovgResourceOverflow('sort work units');
    this.Add(work);
  }
  addNode(ovg: OVG, node: OVGNode): OVGNode {
    this.Step();
    const existing = ovg.occupant(node.Point);
    if (existing) return existing;
    this.reserveNodes(1n);
    ovg.AddNodeUnchecked(node);
    return node;
  }
  addPoint(ovg: OVG, point: Point): OVGNode {
    this.Step();
    const existing = ovg.occupant(point);
    if (existing) return existing;
    this.reserveNodes(1n);
    const node = new OVGNode(point);
    ovg.AddNodeUnchecked(node);
    return node;
  }
  newDerivedNode(point: Point): OVGNode {
    this.Step();
    this.reserveNodes(1n);
    return new OVGNode(point);
  }
  newCandidateNode(point: Point): OVGNode {
    this.Step();
    return new OVGNode(point);
  }
  addNodeUnchecked(ovg: OVG, node: OVGNode): void {
    this.Step();
    this.reserveNodes(1n);
    ovg.AddNodeUnchecked(node);
  }
  connect(ovg: OVG, a: OVGNode, b: OVGNode): OVGEdge | null {
    this.Step();
    if ((a.IsNodeCenter && !b.isPort()) || (b.IsNodeCenter && !a.isPort()))
      return null;
    this.reserveEdges(1n);
    return ovg.Connect(a, b);
  }
}
export function checkedOVGIntersectionCount(x: bigint, y: bigint): bigint {
  const count = x * y;
  if (count > maxUint64)
    throw ovgResourceOverflow('intersection candidate count');
  return count;
}
export function checkedUint64ToInt(value: bigint, intLimit: bigint): number {
  if (value > intLimit)
    throw ovgResourceExceeded('allocation capacity', value, intLimit);
  return Number(value);
}
export function checkedOVGEdgeCapacity(
  existing: bigint,
  nodes: bigint,
  horizontal: bigint,
  vertical: bigint,
  edgeLimit: bigint,
  intLimit: bigint,
): number {
  if (existing > edgeLimit)
    throw ovgResourceExceeded('edge count', existing, edgeLimit);
  const twice = nodes * 2n,
    lines = horizontal + vertical;
  if (twice > maxUint64 || lines > maxUint64 || twice < lines)
    throw ovgResourceOverflow('edge capacity');
  let capacity = existing + twice - lines;
  if (capacity > maxUint64) throw ovgResourceOverflow('edge capacity');
  if (capacity > edgeLimit) capacity = edgeLimit;
  return checkedUint64ToInt(capacity, intLimit);
}
