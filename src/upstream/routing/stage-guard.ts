// Translated from internal/routing/route_stage_guard.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context, Done } from '../limits/context.js';
import { MaxEngineRoutePoints } from '../limits/work.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import {
  validateEngineGraph,
  sliceCapacity,
  maxEngineTopologyReferences,
} from '../layoutgraph/topology-preflight.js';
import {
  captureEdge,
  snapshotPointer,
} from '../layoutgraph/transaction-snapshot.js';
import { Position, IsEdgePosition } from '../label/label.js';
import { New as invariant } from '../invariant/errors.js';
export const MaxRouteStageWorkUnits = 50_000_000n;
export class RouteWorkGuard {
  private used = 0n;
  private readonly done: Done | null;
  constructor(
    private readonly ctx: Context,
    readonly location: string,
    readonly limit: bigint,
  ) {
    if (!ctx) throw new Error(`TALA ${location} requires a context`);
    this.done = ctx.Done();
    this.Check();
  }
  Step(): void {
    this.Add(1n);
  }
  Add(units: bigint): void {
    if (this.used > this.limit || units > this.limit - this.used) {
      this.Check();
      throw new Error(
        `TALA route-stage work limit exceeded: TALA ${this.location} work exceeds limit ${this.limit}`,
      );
    }
    const previous = this.used;
    this.used += units;
    if (units === 0n || previous / 1024n !== this.used / 1024n) this.Check();
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
  ReserveSort(length: number): void {
    if (length < 2) {
      this.Step();
      return;
    }
    for (let width = 1; width < length;) {
      this.Add(BigInt(length));
      if (width > Math.floor(length / 2)) break;
      width *= 2;
    }
    this.Check();
  }
  Used(): bigint {
    return this.used;
  }
}
export function validateRouteStageGeometry(
  g: Graph,
  extra: Edge[],
  guard: RouteWorkGuard,
): void {
  if (extra.length > maxEngineTopologyReferences)
    throw new Error(
      `TALA ${guard.location} extra edge references exceed limit ${maxEngineTopologyReferences}`,
    );
  const seenNodes = new Set<Node>(),
    graphNodes = new Set<Node>();
  const validateNode = (node: Node | null, description: string): void => {
    guard.Step();
    if (!node)
      throw new Error(`TALA ${guard.location} contains a nil ${description}`);
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
    if (!node.TopLeft)
      throw new Error(`TALA ${guard.location} ${description} has no position`);
  };
  for (let i = 0; i < g.Nodes.length; i++) {
    const node = g.Nodes[i]!;
    validateNode(node, `graph node at index ${i}`);
    graphNodes.add(node);
  }
  const seen = new Set<Edge>();
  let capacity = 0;
  const validateEdge = (
    edge: Edge | null,
    requireGraphEndpoints: boolean,
  ): void => {
    guard.Step();
    if (!edge) throw new Error(`TALA ${guard.location} contains a nil edge`);
    if (seen.has(edge)) return;
    seen.add(edge);
    if (requireGraphEndpoints) {
      if (!graphNodes.has(edge.From))
        throw new Error(
          `graph edge ${edge.ID} source node does not belong to the graph`,
        );
      if (!graphNodes.has(edge.To))
        throw new Error(
          `graph edge ${edge.ID} target node does not belong to the graph`,
        );
    }
    capacity += sliceCapacity(edge.Points);
    if (capacity > MaxEngineRoutePoints)
      throw new Error(
        `TALA ${guard.location} route point capacity exceeds limit ${MaxEngineRoutePoints}`,
      );
    if (edge.Points.length === 1)
      throw invariant(
        `edge ${edge.ID} has an incomplete route: expected at least two points, got 1`,
      );
    for (const [name, label] of [
      ['label', edge.Label],
      ['source arrowhead label', edge.SourceArrowheadLabel],
      ['target arrowhead label', edge.TargetArrowheadLabel],
    ] as const)
      if (
        label &&
        label.Position !== Position.Unset &&
        !IsEdgePosition(label.Position)
      )
        throw invariant(`edge ${edge.ID} ${name} has an invalid edge position`);
    validateNode(edge.From, `edge ${edge.ID} source`);
    validateNode(edge.To, `edge ${edge.ID} target`);
    for (const point of edge.Points) {
      guard.Step();
      if (!point)
        throw new Error(
          `TALA ${guard.location} edge ${edge.ID} contains a nil route point`,
        );
      if (!Number.isFinite(point.X) || !Number.isFinite(point.Y))
        throw new Error(
          `TALA ${guard.location} edge ${edge.ID} has a non-finite route point`,
        );
    }
  };
  for (const edge of g.Edges) validateEdge(edge, true);
  for (const node of g.Nodes)
    for (const edge of node.Edges) validateEdge(edge, false);
  for (const edge of extra) validateEdge(edge, false);
  guard.Finish();
}
export function captureRouteMutations(
  g: Graph,
  extra: Edge[],
  guard: RouteWorkGuard,
): {
  restore(): void;
  nodes: ReadonlyMap<Node, unknown>;
  edges: ReadonlyMap<Edge, unknown>;
} {
  const cellSize = g.CellSize,
    crossing = g.crossingCost,
    turn = g.turnCost,
    nonCenter = g.nonCenterPortCost;
  const nodes = new Map<
    Node,
    {
      point: ReturnType<typeof snapshotPointer<Node['Box']['TopLeft']>>;
      graph: Graph | null;
    }
  >();
  const edges = new Map<Edge, ReturnType<typeof captureEdge>>(),
    queue: Node[] = [];
  const captureNode = (node: Node | null): void => {
    guard.Step();
    if (!node || nodes.has(node)) return;
    nodes.set(node, {
      point: snapshotPointer(node.TopLeft),
      graph: node.Graph,
    });
    queue.push(node);
  };
  const capture = (edge: Edge | null): void => {
    guard.Step();
    if (!edge || edges.has(edge)) return;
    for (let i = 0; i < sliceCapacity(edge.Points); i++) guard.Step();
    edges.set(edge, captureEdge(edge));
    captureNode(edge.From);
    captureNode(edge.To);
  };
  for (const edge of g.Edges) capture(edge);
  for (const node of g.Nodes) {
    captureNode(node);
    if (node) for (const edge of node.Edges) capture(edge);
  }
  for (const edge of extra) capture(edge);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!,
      graph = node.Graph ?? g;
    if (node.isContainer)
      for (const child of graph.Containers.get(node) ?? []) captureNode(child);
    if (node.isClusterVessel)
      for (const child of graph.Clusters.get(node)?.Nodes ?? [])
        captureNode(child);
    for (const child of graph.Sequences.get(node)?.Nodes ?? [])
      captureNode(child);
  }
  guard.Finish();
  return {
    nodes,
    edges,
    restore() {
      g.CellSize = cellSize;
      g.crossingCost = crossing;
      g.turnCost = turn;
      g.nonCenterPortCost = nonCenter;
      for (const [node, state] of nodes) {
        node.TopLeft = state.point.restore();
        node.Graph = state.graph;
      }
      for (const [edge, state] of edges) state.restore(edge);
    },
  };
}
export function runAtomicRouteStage(
  ctx: Context,
  location: string,
  g: Graph,
  extra: Edge[],
  limit: bigint,
  fn: (guard: RouteWorkGuard) => void,
): void {
  validateEngineGraph(ctx, location, g);
  runAtomicRouteStageAfterPreflight(ctx, location, g, extra, limit, fn);
}

export function runAtomicRouteStageAfterPreflight(
  ctx: Context,
  location: string,
  g: Graph,
  extra: Edge[],
  limit: bigint,
  fn: (guard: RouteWorkGuard) => void,
): void {
  const guard = new RouteWorkGuard(ctx, location, limit);
  validateRouteStageGeometry(g, extra, guard);
  const snapshot = captureRouteMutations(g, extra, guard);
  try {
    fn(guard);
    guard.Finish();
  } catch (error) {
    snapshot.restore();
    throw error;
  }
}

// stableSortRouteValues is the upstream cancellable bottom-up merge sort.
export function stableSortRouteValues<T>(
  values: T[],
  less: (a: T, b: T) => boolean,
  guard: RouteWorkGuard,
): void {
  if (values.length < 2) {
    guard.Step();
    return;
  }
  const temporary = new Array<T>(values.length);
  for (let width = 1; width < values.length;) {
    for (let start = 0; start < values.length; start += 2 * width) {
      const middle = Math.min(start + width, values.length),
        end = Math.min(start + 2 * width, values.length);
      let left = start,
        right = middle,
        output = start;
      while (left < middle && right < end) {
        guard.Step();
        temporary[output++] = less(values[right]!, values[left]!)
          ? values[right++]!
          : values[left++]!;
      }
      while (left < middle) {
        guard.Step();
        temporary[output++] = values[left++]!;
      }
      while (right < end) {
        guard.Step();
        temporary[output++] = values[right++]!;
      }
    }
    guard.Add(BigInt(values.length));
    for (let i = 0; i < values.length; i++) values[i] = temporary[i]!;
    if (width > Math.floor(values.length / 2)) break;
    width *= 2;
  }
}
