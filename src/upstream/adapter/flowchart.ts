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
import {
  MaxEngineNodes,
  MaxEngineEdges,
  MaxEngineTreeDepth,
} from '../limits/work.js';
import { Orientation } from '../geo/orientation.js';
import { Point } from '../geo/point.js';
import {
  FromString,
  IsShapePosition,
  String as LabelPositionString,
  Mirrored,
} from '../label/label.js';
import { Graph } from '../layoutgraph/graph.js';
import { Node } from '../layoutgraph/node.js';
import {
  Label,
  NoArrowhead,
  TriangleArrowhead,
} from '../layoutgraph/records.js';
import { EdgeLabelTopLeft } from '../layoutgraph/graph-bounds.js';
import { LabelTopLeft } from '../layoutgraph/node-geometry.js';
import { PositionArrowheadLabel } from '../labeling/arrowhead.js';
import { Layout } from '../engine/pipeline.js';
import { CompoundCandidate } from '../engine/compound-candidate.js';
import { PreserveCompoundRoutes } from '../engine/compound-routes.js';
import { Evaluate, type Score } from '../quality/scoring.js';
import {
  validateCompletedGraph,
  validateLayoutResultTopology,
  validateLayoutResultMetadata,
} from './result-validation.js';
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
function compareIdentifiers(a: string, b: string): number {
  const left = /^(.*?)(\d+)$/.exec(a),
    right = /^(.*?)(\d+)$/.exec(b);
  if (left && right && left[1] === right[1]) {
    const x = BigInt(left[2]!),
      y = BigInt(right[2]!);
    if (x !== y) return x < y ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
function arrowhead(value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  const aliases: Record<string, string> = {
    arrow_point: 'triangle',
    arrow_circle: 'circle',
    arrow_cross: 'cross',
  };
  return aliases[value] ?? (value === '' ? NoArrowhead : value);
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
  if (inputNodes.length > MaxEngineNodes)
    throw new Error(`D2 object count exceeds limit ${MaxEngineNodes}`);
  if (inputEdges.length > MaxEngineEdges)
    throw new Error(`D2 edge count exceeds limit ${MaxEngineEdges}`);
  const totalColumns = inputNodes.reduce(
    (count, node) => count + (node.tableColumns ?? 0),
    0,
  );
  if (totalColumns > MaxEngineNodes)
    throw new Error(
      `D2 SQL table column count exceeds limit ${MaxEngineNodes}`,
    );
  const direction = options.direction ?? 'TB';
  if (!(direction in orientation)) throw new Error('invalid layout direction');
  if (options.inputOrder !== undefined && options.inputOrder !== 'authored' && options.inputOrder !== 'canonical')
    throw new Error('invalid input order');
  for (const name of [
    'nodeSpacing',
    'rankSpacing',
    'containerPadding',
  ] as const) {
    const v = options[name];
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1_000_000_000))
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
      n.width > 1_000_000_000 ||
      !Number.isFinite(n.height) ||
      n.height <= 0 ||
      n.height > 1_000_000_000
    )
      throw new Error(`node ${n.id} must have finite positive dimensions`);
    for (const key of ['labelWidth', 'labelHeight'] as const) {
      const value = n[key];
      if (
        value !== undefined &&
        (!Number.isFinite(value) || value < 0 || value > 1_000_000_000)
      )
        throw new Error(`${key} must be finite and nonnegative`);
    }
    if (
      n.fontSize !== undefined &&
      (!Number.isInteger(n.fontSize) ||
        n.fontSize <= 0 ||
        n.fontSize > 1_000_000_000)
    )
      throw new Error(`node ${n.id} has an invalid font size`);
    if (
      n.fixedPosition &&
      (!Number.isInteger(n.fixedPosition.x) ||
        !Number.isInteger(n.fixedPosition.y) ||
        Math.abs(n.fixedPosition.x) > 1_000_000_000 ||
        Math.abs(n.fixedPosition.y) > 1_000_000_000)
    )
      throw new Error(`node ${n.id} has an invalid fixed position`);
    if (
      n.fixedPosition &&
      (Math.abs(n.fixedPosition.x + n.width) > 1_000_000_000 ||
        Math.abs(n.fixedPosition.y + n.height) > 1_000_000_000)
    )
      throw new Error(`node ${n.id} fixed bounds exceed the supported range`);
    for (const [name, value] of [
      ['labelPosition', n.labelPosition],
      ['iconPosition', n.iconPosition],
    ] as const)
      if (value !== undefined && !IsShapePosition(FromString(value)))
        throw new Error(`node ${n.id} has an invalid ${name}`);
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
    paths = new Map<string, string[]>(),
    visiting = new Set<string>();
  const visit = (node: LayoutNode, parent: string[], depth: number) => {
    if (depth > MaxEngineTreeDepth)
      throw new Error(
        `D2 object nesting depth exceeds limit ${MaxEngineTreeDepth}`,
      );
    if (visiting.has(node.id)) throw new Error('cyclic container parent');
    visiting.add(node.id);
    const path = [...parent, node.id];
    paths.set(node.id, path);
    abs.set(node.id, path.join('.'));
    ordered.push(node);
    for (const child of children.get(node.id) ?? [])
      visit(child, path, depth + 1);
    visiting.delete(node.id);
  };
  for (const node of children.get(null) ?? []) visit(node, [], 1);
  if (ordered.length !== inputNodes.length)
    throw new Error('cyclic container parent');
  const ids = allocateEntityIDs(ordered.map((n) => abs.get(n.id)!)),
    nodeIDs = new Map<string, bigint>(),
    graph = new Graph(),
    mapped = new Map<string, Node>();
  graph.Directions.set(null, orientation[direction]);
  graph.IsRootHierarchy = options.rootHierarchy ?? false;
  ordered.forEach((n, i) => {
    const emptyGroup = n.isGroup && !children.get(n.id)?.length;
    const node = new Node(
      ids[i]!,
      emptyGroup ? Math.max(n.width, 2) : n.width,
      emptyGroup ? Math.max(n.height, 2) : n.height,
    );
    if (n.shape) {
      const known: Record<string, string> = {
        rectangle: 'Square',
        sql_table: 'Table',
        table: 'Table',
        hierarchy: 'Square',
        square: 'Square',
        diamond: 'Diamond',
        diam: 'Diamond',
        question: 'Diamond',
        decision: 'Diamond',
        circle: 'Circle',
        circ: 'Circle',
        oval: 'Oval',
        hexagon: 'Hexagon',
        hex: 'Hexagon',
        cylinder: 'Cylinder',
        cyl: 'Cylinder',
        db: 'Cylinder',
        database: 'Cylinder',
        parallelogram: 'Parallelogram',
        cloud: 'Cloud',
        person: 'Person',
        document: 'Document',
        queue: 'Queue',
        package: 'Package',
        page: 'Page',
        step: 'Step',
        image: 'Image',
      };
      node.SetShape(known[n.shape.toLowerCase()] ?? n.shape);
    }
    if (n.tableColumns !== undefined) {
      if (
        !Number.isInteger(n.tableColumns) ||
        n.tableColumns < 0 ||
        n.tableColumns > 10_000
      )
        throw new Error(`node ${n.id} has an invalid table column count`);
      if (!node.IsTable())
        throw new Error(`node ${n.id} has columns but is not a table`);
      node.SetNumColumns(n.tableColumns);
    }
    node.D2ID = abs.get(n.id)!;
    node.ForceHierarchy =
      (n.forceHierarchy ?? false) || n.shape?.toLowerCase() === 'hierarchy';
    node.IsInvisible = n.isInvisible ?? false;
    node.Is3D = n.is3D ?? false;
    node.IsMultiple = n.isMultiple ?? false;
    if (n.fixedPosition)
      node.FixedTopLeft = new Point(n.fixedPosition.x, n.fixedPosition.y);
    if (n.icon) {
      node.InitIcon();
      if (n.iconPosition) node.Icon!.Position = FromString(n.iconPosition);
    }
    let depth = 1;
    for (let parent = n.parentId; parent; parent = byId.get(parent)?.parentId)
      depth++;
    node.FontSize =
      n.fontSize ??
      (node.IsTable()
        ? 20
        : n.isGroup && (children.get(n.id)?.length ?? 0) > 0
          ? ([28, 24, 20][depth - 1] ?? 16)
          : 16);
    if (n.fixedSize) {
      node.DesiredWidth = n.width;
      node.DesiredHeight = n.height;
    }
    if (n.label || (n.labelWidth ?? 0) > 0 || (n.labelHeight ?? 0) > 0) {
      node.Label = new Label();
      node.Label.Text = n.label || 'label';
      if (n.labelPosition) node.Label.Position = FromString(n.labelPosition);
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
  for (const input of ordered) {
    if (input.nearId === undefined) continue;
    const target = mapped.get(input.nearId);
    if (!target)
      throw new Error(`node ${input.id} references a missing near node`);
    mapped.get(input.id)!.AddNear(target);
  }
  const edgeNames = new Set<string>(),
    reversed: boolean[] = [],
    edgeAbs: string[] = [];
  for (let i = 0; i < inputEdges.length; i++) {
    const e = inputEdges[i]!;
    if (e.d2Index !== undefined && (!Number.isSafeInteger(e.d2Index) || e.d2Index < 0))
      throw new Error(`edge ${e.id} has an invalid D2 index`);
    if (edgeNames.has(e.id)) throw new Error('duplicate edge ID');
    edgeNames.add(e.id);
    if (!mapped.has(e.from) || !mapped.has(e.to))
      throw new Error(`edge ${e.id} references a missing node`);
    for (const key of ['labelWidth', 'labelHeight'] as const) {
      const v = e[key];
      if (
        v !== undefined &&
        (!Number.isFinite(v) || v < 0 || v > 1_000_000_000)
      )
        throw new Error(`${key} must be finite and nonnegative`);
    }
    for (const [name, label] of [
      ['sourceArrowheadLabel', e.sourceArrowheadLabel],
      ['targetArrowheadLabel', e.targetArrowheadLabel],
    ] as const) {
      if (!label) continue;
      if (
        !Number.isFinite(label.width) ||
        label.width < 0 ||
        label.width > 1_000_000_000 ||
        !Number.isFinite(label.height) ||
        label.height < 0 ||
        label.height > 1_000_000_000
      )
        throw new Error(`${name} dimensions must be finite and nonnegative`);
    }
    const source = !!e.sourceArrowhead && e.sourceArrowhead !== 'none',
      target =
        e.targetArrowhead === undefined ||
        (e.targetArrowhead !== '' && e.targetArrowhead !== 'none');
    reversed.push(source && !target);
    const from = [...paths.get(e.from)!],
      to = [...paths.get(e.to)!],
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
      `${common.length ? common.join('.') + '.' : ''}(${from.join('.')} ${arrow} ${to.join('.')})[${e.d2Index ?? i}]`,
    );
  }
  const edgeIDs = allocateEntityIDs(edgeAbs);
  inputEdges.forEach((input, i) => {
    const e = graph.Connect(
      mapped.get(reversed[i] ? input.to : input.from)!,
      mapped.get(reversed[i] ? input.from : input.to)!,
    );
    e.ID = edgeIDs[i]!;
    e.D2ID = edgeAbs[i]!;
    const style = input.style;
    if (style) {
      const fields = {
        opacity: 'Opacity',
        stroke: 'Stroke',
        fill: 'Fill',
        fillPattern: 'FillPattern',
        strokeWidth: 'StrokeWidth',
        strokeDash: 'StrokeDash',
        borderRadius: 'BorderRadius',
        shadow: 'Shadow',
        threeDee: 'ThreeDee',
        multiple: 'Multiple',
        font: 'Font',
        fontSize: 'FontSize',
        fontColor: 'FontColor',
        animated: 'Animated',
        bold: 'Bold',
        italic: 'Italic',
        underline: 'Underline',
        filled: 'Filled',
        doubleBorder: 'DoubleBorder',
        textTransform: 'TextTransform',
      } as const;
      for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
        const value = style[key];
        if (value !== undefined) e.Style[fields[key]] = { Value: value };
      }
      if (
        style.opacity !== undefined &&
        (!style.opacity.trim() ||
          !Number.isFinite(Number(style.opacity)) ||
          Number(style.opacity) < 0 ||
          Number(style.opacity) > 1)
      )
        throw new Error(`edge ${input.id} has invalid opacity`);
      for (const key of ['strokeWidth', 'fontSize'] as const)
        if (
          style[key] !== undefined &&
          (!/^[+-]?\d+$/.test(style[key]!) ||
            Number(style[key]) < (key === 'fontSize' ? 1 : 0) ||
            Number(style[key]) > 1_000_000_000)
        )
          throw new Error(`edge ${input.id} has invalid ${key}`);
      for (const key of [
        'animated',
        'bold',
        'doubleBorder',
        'filled',
        'italic',
        'multiple',
        'shadow',
        'threeDee',
        'underline',
      ] as const)
        if (
          style[key] !== undefined &&
          !/^(1|0|t|T|f|F|true|false|TRUE|FALSE|True|False)$/.test(style[key]!)
        )
          throw new Error(`edge ${input.id} has invalid ${key}`);
    }
    if (input.isInvisible) e.Style.Stroke = { Value: 'transparent' };
    e.IsInvisible =
      !!input.isInvisible ||
      style?.stroke?.toLowerCase() === 'transparent' ||
      (style?.opacity !== undefined && Number(style.opacity) === 0);
    e.SourceArrowhead = reversed[i]
      ? NoArrowhead
      : arrowhead(input.sourceArrowhead, NoArrowhead);
    e.TargetArrowhead = reversed[i]
      ? arrowhead(input.sourceArrowhead, TriangleArrowhead)
      : arrowhead(input.targetArrowhead, TriangleArrowhead);
    const makeArrowLabel = (
      value: typeof input.sourceArrowheadLabel,
    ): Label | null => {
      if (!value?.text) return null;
      const result = new Label();
      result.Text = value.text;
      result.Width = value.width;
      result.Height = value.height;
      return result;
    };
    const sourceColumn = reversed[i]
      ? input.targetTableColumnIndex
      : input.sourceTableColumnIndex;
    const targetColumn = reversed[i]
      ? input.sourceTableColumnIndex
      : input.targetTableColumnIndex;
    for (const [node, index] of [
      [e.From, sourceColumn],
      [e.To, targetColumn],
    ] as const) {
      if (
        index !== undefined &&
        (!node.IsTable() ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= node.NumColumns())
      )
        throw new Error(`edge ${input.id} has an invalid table column index`);
    }
    e.FromTableColumnIndex = sourceColumn ?? null;
    e.ToTableColumnIndex = targetColumn ?? null;
    e.SourceArrowheadLabel = makeArrowLabel(
      reversed[i] ? input.targetArrowheadLabel : input.sourceArrowheadLabel,
    );
    e.TargetArrowheadLabel = makeArrowLabel(
      reversed[i] ? input.sourceArrowheadLabel : input.targetArrowheadLabel,
    );
    e.MinWidth = (input.labelWidth ?? 0) + 10;
    e.MinHeight = (input.labelHeight ?? 0) + 10;
    for (const label of [e.SourceArrowheadLabel, e.TargetArrowheadLabel])
      if (label) {
        const extra = Math.trunc(Math.max(label.Width, label.Height) + 5);
        e.MinWidth += extra;
        e.MinHeight += extra;
      }
    if (style?.opacity !== undefined && Number(style.opacity) === 0) {
      e.MinWidth = 0;
      e.MinHeight = 0;
    }
    if (
      input.label ||
      (input.labelWidth ?? 0) > 0 ||
      (input.labelHeight ?? 0) > 0
    ) {
      e.Label = new Label();
      e.Label.Text = input.label || 'label';
      e.Label.Width = input.labelWidth ?? 0;
      e.Label.Height = input.labelHeight ?? 0;
    }
  });
  return { graph, nodeIDs, edgeIDs, reversed };
}
function evaluateCandidate(input: Graph, candidate: Graph): Score {
  try {
    validateCompletedGraph(Background, candidate);
  } catch (error) {
    throw new Error(`validate TALA seed result: ${(error as Error).message}`, {
      cause: error,
    });
  }
  let sequenceEdges: Set<bigint>;
  try {
    sequenceEdges = validateLayoutResultTopology(Background, input, candidate);
  } catch (error) {
    throw new Error(
      `validate TALA seed result topology: ${(error as Error).message}`,
      { cause: error },
    );
  }
  try {
    validateLayoutResultMetadata(Background, input, candidate, sequenceEdges);
  } catch (error) {
    throw new Error(
      `validate TALA seed result metadata: ${(error as Error).message}`,
      { cause: error },
    );
  }
  const score = Evaluate(Background, candidate);
  if (!Number.isFinite(score.Penalty))
    throw new Error('TALA seed result has a non-finite score');
  return score;
}
export function layoutFlowchartTranslated(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions = {},
): LayoutResult {
  if (options.inputOrder !== 'authored') {
    inputNodes = [...inputNodes].sort((a, b) => compareIdentifiers(a.id, b.id));
    inputEdges = [...inputEdges].sort((a, b) => compareIdentifiers(a.id, b.id));
  }
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
        score = evaluateCandidate(graph, candidate);
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
      const score = evaluateCandidate(graph, candidate);
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
      const refined = PreserveCompoundRoutes(Background, ordinary, best);
      evaluateCandidate(graph, refined);
      best = refined;
    } catch {
      /* Optional upstream refinement retains the selected placement. */
    }
  // Ranks are public metadata; upstream layout itself does not use this pass.
  const colors = new Map(inputNodes.map((n) => [n.id, 0]));
  const outgoing = new Map(inputNodes.map((n) => [n.id, [] as LayoutEdge[]]));
  for (const edge of inputEdges)
    if (edge.from !== edge.to) outgoing.get(edge.from)!.push(edge);
  const dag: LayoutEdge[] = [];
  const visitRank = (start: string): void => {
    const stack: { id: string; index: number }[] = [{ id: start, index: 0 }];
    colors.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1]!,
        edges = outgoing.get(frame.id)!;
      if (frame.index >= edges.length) {
        colors.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const edge = edges[frame.index++]!,
        color = colors.get(edge.to)!;
      if (color === 1) continue;
      dag.push(edge);
      if (color === 0) {
        colors.set(edge.to, 1);
        stack.push({ id: edge.to, index: 0 });
      }
    }
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
        ...(n.FontSize !== null ? { fontSize: n.FontSize } : {}),
        ...(n.Icon
          ? { iconPosition: LabelPositionString(n.Icon.Position) }
          : {}),
        ...(label
          ? {
              labelX: label.X + n.Label!.Width / 2,
              labelY: label.Y + n.Label!.Height / 2,
              labelWidth: n.Label!.Width,
              labelHeight: n.Label!.Height,
              labelPosition: LabelPositionString(n.Label!.Position),
            }
          : {}),
      };
    }),
    edges: inputEdges.flatMap((input, index) => {
      const edge = edgesByID.get(edgeIDs[index]!);
      if (!edge) return [];
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
      const sourceArrow = PositionArrowheadLabel(
        edge,
        !!reversed[index],
        edge.Points,
      );
      const targetArrow = PositionArrowheadLabel(
        edge,
        !reversed[index],
        edge.Points,
      );
      return [
        {
          ...input,
          points,
          ...(sourceArrow
            ? {
                sourceArrowheadLabelPosition: {
                  x: sourceArrow.Box.TopLeft.X + sourceArrow.Box.Width / 2,
                  y: sourceArrow.Box.TopLeft.Y + sourceArrow.Box.Height / 2,
                },
              }
            : {}),
          ...(targetArrow
            ? {
                targetArrowheadLabelPosition: {
                  x: targetArrow.Box.TopLeft.X + targetArrow.Box.Width / 2,
                  y: targetArrow.Box.TopLeft.Y + targetArrow.Box.Height / 2,
                },
              }
            : {}),
          x: center.x,
          y: center.y,
          isCurve: edge.IsCurve,
          ...(edge.Label
            ? {
                labelPosition: LabelPositionString(
                  reversed[index]
                    ? Mirrored(edge.Label.Position)
                    : edge.Label.Position,
                ),
                labelPercentage: reversed[index]
                  ? 1 - edge.LabelPercentage
                  : edge.LabelPercentage,
              }
            : {}),
        },
      ];
    }),
  };
}
