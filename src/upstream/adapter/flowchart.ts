// Adapter from Mermaid's graph records to the translated TALA graph.
// ID allocation and seed selection follow D2 bf337903. MPL-2.0.
import type {
  LayoutNode,
  LayoutEdge,
  LayoutOptions,
  LayoutResult,
  LayoutDirection,
} from '../../layout.js';
import { getTalaSeeds, normalizeSeeds } from '../../random.js';
import { Background } from '../limits/context.js';
import { Orientation } from '../geo/orientation.js';
import { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import {
  Label,
  NoArrowhead,
  TriangleArrowhead,
} from '../layoutgraph/records.js';
import { EdgeLabelTopLeft } from '../layoutgraph/graph-bounds.js';
import { LabelTopLeft } from '../layoutgraph/node-geometry.js';
import { Layout } from '../engine/pipeline.js';
import { CompoundCandidate } from '../engine/compound-candidate.js';
import { PreserveCompoundRoutes } from '../engine/compound-routes.js';
import { Evaluate, type Score } from '../quality/scoring.js';
import { routeMidpoint } from '../../routing.js';
const orientation: Record<LayoutDirection, Orientation> = {
  TB: Orientation.Bottom,
  BT: Orientation.Top,
  LR: Orientation.Right,
  RL: Orientation.Left,
};
function fnv32(value: string): number {
  let h = 2166136261;
  for (const b of new TextEncoder().encode(value)) {
    h ^= b;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function allocateEntityIDs(values: string[]): bigint[] {
  const seen = new Set<string>(),
    counts = new Map<number, number>();
  const entries = values.map((value, index) => {
    if (seen.has(value)) throw new Error(`duplicate identity ${value}`);
    seen.add(value);
    const hash = fnv32(value);
    counts.set(hash, (counts.get(hash) ?? 0) + 1);
    return { value, index, hash };
  });
  const ids: bigint[] = new Array(values.length),
    ambiguous = entries
      .filter((e) => e.hash === 0 || counts.get(e.hash)! > 1)
      .sort(
        (a, b) =>
          a.hash - b.hash ||
          (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
      );
  for (const e of entries)
    if (e.hash !== 0 && counts.get(e.hash) === 1) ids[e.index] = BigInt(e.hash);
  ambiguous.forEach((e, i) => (ids[e.index] = 4294967296n + BigInt(i)));
  return ids;
}
export function translateFlowchart(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions,
): {
  graph: Graph;
  nodeIDs: Map<string, bigint>;
  edgeIDs: bigint[];
  reversed: boolean[];
} {
  const direction = options.direction ?? 'TB';
  if (!(direction in orientation)) throw new Error('invalid layout direction');
  for (const name of [
    'nodeSpacing',
    'rankSpacing',
    'containerPadding',
  ] as const) {
    const v = options[name];
    if (v !== undefined && (!Number.isFinite(v) || v < 0))
      throw new Error(`${name} must be finite and nonnegative`);
  }
  if (
    options.orderingPasses !== undefined &&
    !Number.isFinite(options.orderingPasses)
  )
    throw new Error('orderingPasses must be finite');
  const byId = new Map<string, LayoutNode>();
  for (const n of inputNodes) {
    if (byId.has(n.id)) throw new Error('duplicate node ID');
    if (
      !Number.isFinite(n.width) ||
      n.width <= 0 ||
      !Number.isFinite(n.height) ||
      n.height <= 0
    )
      throw new Error(`node ${n.id} must have finite positive dimensions`);
    for (const key of ['labelWidth', 'labelHeight'] as const) {
      const value = n[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0))
        throw new Error(`${key} must be finite and nonnegative`);
    }
    if (n.direction !== undefined && !(n.direction in orientation))
      throw new Error(`node ${n.id} has an invalid direction`);
    byId.set(n.id, n);
  }
  const children = new Map<string | null, LayoutNode[]>();
  for (const n of inputNodes) {
    const parent = n.parentId ?? null;
    if (parent !== null && !byId.has(parent))
      throw new Error(`node ${n.id} references a missing parent`);
    if (parent !== null && !byId.get(parent)!.isGroup)
      throw new Error(`node ${n.id} has a non-group parent`);
    const a = children.get(parent) ?? [];
    a.push(n);
    children.set(parent, a);
  }
  const ordered: LayoutNode[] = [],
    abs = new Map<string, string>(),
    visiting = new Set<string>();
  const visit = (node: LayoutNode, parent: string) => {
    if (visiting.has(node.id)) throw new Error('cyclic container parent');
    visiting.add(node.id);
    const id = parent ? `${parent}.${node.id}` : node.id;
    abs.set(node.id, id);
    ordered.push(node);
    for (const child of children.get(node.id) ?? []) visit(child, id);
    visiting.delete(node.id);
  };
  for (const node of children.get(null) ?? []) visit(node, '');
  if (ordered.length !== inputNodes.length)
    throw new Error('cyclic container parent');
  const ids = allocateEntityIDs(ordered.map((n) => abs.get(n.id)!)),
    nodeIDs = new Map<string, bigint>(),
    graph = new Graph(),
    mapped = new Map<string, Node>();
  graph.Directions.set(null, orientation[direction]);
  ordered.forEach((n, i) => {
    const emptyGroup = n.isGroup && !children.get(n.id)?.length;
    const node = new Node(
      ids[i]!,
      emptyGroup ? Math.max(n.width, 2) : n.width,
      emptyGroup ? Math.max(n.height, 2) : n.height,
    );
    node.D2ID = abs.get(n.id)!;
    let depth = 1;
    for (let parent = n.parentId; parent; parent = byId.get(parent)?.parentId)
      depth++;
    node.FontSize =
      n.isGroup && (children.get(n.id)?.length ?? 0) > 0
        ? ([28, 24, 20][depth - 1] ?? 16)
        : 16;
    if (n.fixedSize) {
      node.DesiredWidth = n.width;
      node.DesiredHeight = n.height;
    }
    if ((n.labelWidth ?? 0) > 0 || (n.labelHeight ?? 0) > 0) {
      node.Label = new Label();
      node.Label.Text = 'label';
      node.Label.Width = n.labelWidth ?? 0;
      node.Label.Height = n.labelHeight ?? 0;
    }
    graph.AddNewNodeToContainer(
      n.parentId ? mapped.get(n.parentId)! : null,
      node,
    );
    if (n.direction) graph.Directions.set(node, orientation[n.direction]);
    mapped.set(n.id, node);
    nodeIDs.set(n.id, node.ID);
  });
  const edgeNames = new Set<string>(),
    reversed: boolean[] = [],
    edgeAbs: string[] = [];
  for (let i = 0; i < inputEdges.length; i++) {
    const e = inputEdges[i]!;
    if (edgeNames.has(e.id)) throw new Error('duplicate edge ID');
    edgeNames.add(e.id);
    if (!mapped.has(e.from) || !mapped.has(e.to))
      throw new Error(`edge ${e.id} references a missing node`);
    for (const key of ['labelWidth', 'labelHeight'] as const) {
      const v = e[key];
      if (v !== undefined && (!Number.isFinite(v) || v < 0))
        throw new Error(`${key} must be finite and nonnegative`);
    }
    const source = !!e.sourceArrowhead && e.sourceArrowhead !== 'none',
      target =
        e.targetArrowhead === undefined ||
        (e.targetArrowhead !== '' && e.targetArrowhead !== 'none');
    reversed.push(source && !target);
    const from = abs.get(e.from)!.split('.'),
      to = abs.get(e.to)!.split('.'),
      common: string[] = [];
    while (
      from.length > 1 &&
      to.length > 1 &&
      from[0]!.toLowerCase() === to[0]!.toLowerCase()
    ) {
      common.push(from.shift()!);
      to.shift();
    }
    const arrow = source ? (target ? '<->' : '<-') : target ? '->' : '--';
    edgeAbs.push(
      `${common.length ? common.join('.') + '.' : ''}(${from.join('.')} ${arrow} ${to.join('.')})[${i}]`,
    );
  }
  const edgeIDs = allocateEntityIDs(edgeAbs);
  inputEdges.forEach((input, i) => {
    const source = !!input.sourceArrowhead && input.sourceArrowhead !== 'none',
      target =
        input.targetArrowhead === undefined ||
        (input.targetArrowhead !== '' && input.targetArrowhead !== 'none');
    const e = graph.Connect(
      mapped.get(reversed[i] ? input.to : input.from)!,
      mapped.get(reversed[i] ? input.from : input.to)!,
    );
    e.ID = edgeIDs[i]!;
    e.D2ID = edgeAbs[i]!;
    e.SourceArrowhead = reversed[i]
      ? NoArrowhead
      : source
        ? TriangleArrowhead
        : NoArrowhead;
    e.TargetArrowhead = reversed[i] || target ? TriangleArrowhead : NoArrowhead;
    e.MinWidth = (input.labelWidth ?? 0) + 10;
    e.MinHeight = (input.labelHeight ?? 0) + 10;
    if ((input.labelWidth ?? 0) > 0 || (input.labelHeight ?? 0) > 0) {
      e.Label = new Label();
      e.Label.Text = 'label';
      e.Label.Width = input.labelWidth ?? 0;
      e.Label.Height = input.labelHeight ?? 0;
    }
  });
  return { graph, nodeIDs, edgeIDs, reversed };
}
export function layoutFlowchartTranslated(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions = {},
): LayoutResult {
  inputNodes = [...inputNodes].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  inputEdges = [...inputEdges].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const seeds =
      options.seeds === undefined
        ? getTalaSeeds()
        : normalizeSeeds(options.seeds),
    { graph, nodeIDs, edgeIDs, reversed } = translateFlowchart(
      inputNodes,
      inputEdges,
      options,
    );
  let best: Graph | null = null,
    bestScore: Score | null = null,
    lastError: unknown;
  for (const seed of seeds)
    try {
      const candidate = Layout(Background, graph, { Seed: seed }),
        score = Evaluate(Background, candidate);
      if (!Number.isFinite(score.Penalty))
        throw new Error('TALA seed result has a non-finite score');
      if (!bestScore || score.Compare(bestScore) <= 0) {
        best = candidate;
        bestScore = score;
      }
    } catch (error) {
      lastError = error;
    }
  if (!best) throw lastError;
  const ordinary = best;
  try {
    const candidate = CompoundCandidate(Background, best);
    if (candidate !== best) {
      const score = Evaluate(Background, candidate);
      if (score.Compare(bestScore!) < 0) {
        best = candidate;
        bestScore = score;
      }
    }
  } catch {
    /* Optional upstream candidate retains the incumbent. */
  }
  if (best !== ordinary)
    try {
      best = PreserveCompoundRoutes(Background, ordinary, best);
    } catch {
      /* Optional upstream refinement retains the selected placement. */
    }
  // Ranks are public metadata; upstream layout itself does not use this pass.
  const colors = new Map(inputNodes.map((n) => [n.id, 0]));
  const outgoing = new Map(inputNodes.map((n) => [n.id, [] as LayoutEdge[]]));
  for (const edge of inputEdges)
    if (edge.from !== edge.to) outgoing.get(edge.from)!.push(edge);
  const dag: LayoutEdge[] = [];
  const visitRank = (id: string): void => {
    colors.set(id, 1);
    for (const edge of outgoing.get(id)!) {
      const color = colors.get(edge.to)!;
      if (color === 1) continue;
      dag.push(edge);
      if (color === 0) visitRank(edge.to);
    }
    colors.set(id, 2);
  };
  for (const n of inputNodes) if (colors.get(n.id) === 0) visitRank(n.id);
  const ranks = new Map(inputNodes.map((n) => [n.id, 0]));
  const indegrees = new Map(inputNodes.map((n) => [n.id, 0]));
  const rankOutgoing = new Map(inputNodes.map((n) => [n.id, [] as string[]]));
  for (const e of dag) {
    indegrees.set(e.to, indegrees.get(e.to)! + 1);
    rankOutgoing.get(e.from)!.push(e.to);
  }
  const ready = inputNodes
    .filter((n) => indegrees.get(n.id) === 0)
    .map((n) => n.id);
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i]!;
    for (const to of rankOutgoing.get(id)!) {
      ranks.set(to, Math.max(ranks.get(to)!, ranks.get(id)! + 1));
      indegrees.set(to, indegrees.get(to)! - 1);
      if (indegrees.get(to) === 0) ready.push(to);
    }
  }
  const nodesByID = new Map(best.Nodes.map((n) => [n.ID, n])),
    edgesByID = new Map(best.Edges.map((e) => [e.ID, e]));
  return {
    nodes: inputNodes.map((input, index) => {
      const n = nodesByID.get(nodeIDs.get(input.id)!)!;
      const label = n.Label
        ? LabelTopLeft(n, n.Label.Position, n.Label.Width, n.Label.Height)
        : null;
      return {
        ...input,
        x: n.TopLeft!.X + n.Width / 2,
        y: n.TopLeft!.Y + n.Height / 2,
        width: n.Width,
        height: n.Height,
        rank: ranks.get(input.id) ?? 0,
        order: index,
        ...(label
          ? {
              labelX: label.X + n.Label!.Width / 2,
              labelY: label.Y + n.Label!.Height / 2,
            }
          : {}),
      };
    }),
    edges: inputEdges.map((input, index) => {
      const edge = edgesByID.get(edgeIDs[index]!)!;
      const points = (
        reversed[index] ? [...edge.Points].reverse() : edge.Points
      ).map((p) => ({ x: p.X, y: p.Y }));
      const label = edge.Label
        ? EdgeLabelTopLeft(
            edge,
            edge.Label.Position,
            edge.Label.Width,
            edge.Label.Height,
          )
        : null;
      const center = label
        ? {
            x: label.X + edge.Label!.Width / 2,
            y: label.Y + edge.Label!.Height / 2,
          }
        : routeMidpoint(points);
      return { ...input, points, x: center.x, y: center.y };
    }),
  };
}
