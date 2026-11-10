// Adapter from Mermaid's graph records to the translated TALA graph.
// ID allocation and seed selection follow D2 bf337903. MPL-2.0.
import type {
  LayoutNode,
  LayoutEdge,
  LayoutOptions,
  LayoutResult,
  LayoutDirection,
  RoutingNode,
  RoutingEdge,
} from '../../layout.js';
import { getTalaSeeds, normalizeSeeds } from '../../random.js';
import { Background } from '../limits/context.js';
import {
  MaxEngineNodes,
  MaxEngineEdges,
  MaxEngineRoutePoints,
  MaxEngineTreeDepth,
} from '../limits/work.js';
import { Orientation } from '../geo/orientation.js';
import { Point } from '../geo/point.js';
import {
  FromString,
  IsShapePosition,
  IsEdgePosition,
  IsUnlocked,
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
import { parseGoFloat } from './parse-float.js';
import { coordinateLocalSeeds } from './seed-coordination.js';
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
/** Construct the synthetic destination ID used by a D2 sequence lifeline. */
export function d2LifelineEndId(actorId: string): string {
  const prefix = `${actorId}-lifeline-end`;
  return `${prefix}-${fnv32(prefix)}`;
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
// D2's Edge.AbsID compares path components with Go's Unicode simple case folding.
function equalFold(a: string, b: string): boolean {
  if (a === b) return true;
  const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:${escaped})(?![\\s\\S])`, 'iu').test(b);
}
// Go strings.ToLower applies Unicode simple mappings rune by rune, without
// JavaScript's context-sensitive final sigma or dotted-I expansion.
function d2Lower(value: string): string {
  return Array.from(value, (rune) => rune === 'İ' ? 'i' : rune.toLowerCase()).join('');
}
function arrowhead(value: string | undefined, fallback: string, filled?: boolean, hasLabel = false): string {
  if (value === undefined && filled === undefined && !hasLabel) return fallback;
  const aliases: Record<string, string> = {
    arrow_point: 'triangle',
    arrow_circle: 'circle',
    arrow_cross: 'cross',
    arrow_open: 'none',
  };
  const shape = value === undefined || value === ''
    ? TriangleArrowhead : aliases[value] ?? value;
  if (shape === 'triangle' && filled === false) return 'unfilled-triangle';
  if (filled === true && (shape === 'diamond' || shape === 'circle' || shape === 'box'))
    return `filled-${shape}`;
  return shape;
}
function arrowFlags(e: LayoutEdge): [boolean, boolean] {
  return [
    e.sourceArrow ?? (!!e.sourceArrowhead && e.sourceArrowhead !== 'none' && e.sourceArrowhead !== 'arrow_open'),
    e.targetArrow ?? (e.targetArrowhead === undefined || (e.targetArrowhead !== '' && e.targetArrowhead !== 'none' && e.targetArrowhead !== 'arrow_open')),
  ];
}
export function translateFlowchart(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions,
  loadExistingLayout = false,
): {
  graph: Graph;
  nodeIDs: Map<string, bigint>;
  edgeIDs: bigint[];
  reversed: boolean[];
  lifelines: boolean[];
} {
  if (inputNodes.length > MaxEngineNodes)
    throw new Error(`D2 object count exceeds limit ${MaxEngineNodes}`);
  if (inputEdges.length > MaxEngineEdges)
    throw new Error(`D2 edge count exceeds limit ${MaxEngineEdges}`);
  if (loadExistingLayout && inputEdges.reduce((sum, edge) => sum + ((edge as RoutingEdge).points?.length ?? 0), 0) > MaxEngineRoutePoints)
    throw new Error(`D2 route point count exceeds limit ${MaxEngineRoutePoints}`);
  const totalColumns = inputNodes.reduce(
    (count, node) => count + (node.tableColumns ?? 0),
    0,
  );
  if (totalColumns > MaxEngineNodes)
    throw new Error(
      `D2 SQL table column count exceeds limit ${MaxEngineNodes}`,
    );
  const direction = options.direction;
  if (direction !== undefined && !(direction in orientation)) throw new Error('invalid layout direction');
  if (options.rootLevel !== undefined && !Number.isSafeInteger(options.rootLevel))
    throw new Error('rootLevel must be a safe integer');
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
    if (loadExistingLayout) {
      const node = n as RoutingNode;
      const x = node.x - n.width / 2, y = node.y - n.height / 2;
      if (!Number.isFinite(x) || !Number.isFinite(y) ||
          Math.abs(x) > 1_000_000_000 || Math.abs(y) > 1_000_000_000 ||
          Math.abs(x + n.width) > 1_000_000_000 || Math.abs(y + n.height) > 1_000_000_000)
        throw new Error(`node ${n.id} has an invalid existing position`);
    }
    if (n.style?.opacity !== undefined) {
      const opacity = parseGoFloat(n.style.opacity);
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
        throw new Error(`node ${n.id} has invalid opacity`);
    }
    if (n.style?.strokeWidth !== undefined &&
        (!/^[+-]?\d+$/.test(n.style.strokeWidth) || Number(n.style.strokeWidth) < 0 ||
         Number(n.style.strokeWidth) > 1_000_000_000))
      throw new Error(`node ${n.id} has invalid strokeWidth`);
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
  const visit = (node: LayoutNode, parent: string[], parentAbs: string, parentID: string, depth: number) => {
    if (depth > MaxEngineTreeDepth)
      throw new Error(
        `D2 object nesting depth exceeds limit ${MaxEngineTreeDepth}`,
      );
    if (visiting.has(node.id)) throw new Error('cyclic container parent');
    visiting.add(node.id);
    const d2ID = node.d2Id ?? node.id;
    const path = [...parent, d2ID];
    const absoluteID = parentID !== '' ? `${parentAbs}.${d2ID}` : d2ID;
    paths.set(node.id, path);
    abs.set(node.id, absoluteID);
    ordered.push(node);
    for (const child of children.get(node.id) ?? [])
      visit(child, path, absoluteID, d2ID, depth + 1);
    visiting.delete(node.id);
  };
  for (const node of children.get(null) ?? []) visit(node, [], '', '', 1);
  if (ordered.length !== inputNodes.length)
    throw new Error('cyclic container parent');
  const ids = allocateEntityIDs(ordered.map((n) => abs.get(n.id)!)),
    nodeIDs = new Map<string, bigint>(),
    graph = new Graph(),
    mapped = new Map<string, Node>();
  if (direction !== undefined) graph.Directions.set(null, orientation[direction]);
  graph.IsRootHierarchy = options.rootHierarchy ?? false;
  ordered.forEach((n, i) => {
    const node = new Node(ids[i]!, n.width, n.height);
    if (loadExistingLayout) {
      const positioned = n as RoutingNode;
      node.TopLeft = new Point(positioned.x - n.width / 2, positioned.y - n.height / 2);
    }
    if (n.shape) {
      const known: Record<string, string> = {
        rectangle: 'Square',
        sql_table: 'Table',
        table: 'Table',
        hierarchy: 'Square',
        square: 'RealSquare',
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
        'c4-person': 'C4Person',
        callout: 'Callout',
        stored_data: 'StoredData',
        text: 'Text',
        code: 'Code',
        class: 'Class',
        sequence_diagram: 'Square',
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
    const style = n.style;
    const noFill = style?.fill?.toLowerCase() === 'transparent';
    const noStroke = style?.stroke?.toLowerCase() === 'transparent' ||
      (style?.strokeWidth !== undefined && Number(style.strokeWidth) === 0);
    const labelText = n.label ?? ((n.labelWidth ?? 0) > 0 || (n.labelHeight ?? 0) > 0 ? 'label' : '');
    const noLabel = labelText === '';
    node.IsInvisible = !!n.isInvisible ||
      (style?.opacity !== undefined && parseGoFloat(style.opacity) === 0) ||
      (!!noFill && !!noStroke && noLabel && n.icon === undefined);
    node.Is3D = n.is3D ?? false;
    node.IsMultiple = n.isMultiple ?? false;
    if (n.fixedPosition)
      node.FixedTopLeft = new Point(n.fixedPosition.x, n.fixedPosition.y);
    if (n.icon !== undefined) {
      node.InitIcon();
      if (n.iconPosition) node.Icon!.Position = FromString(n.iconPosition);
    }
    let depth = 1 + (options.rootLevel ?? 0), insideSequence = options.rootSequence ?? false;
    for (let parent = n.parentId; parent !== undefined; parent = byId.get(parent)?.parentId) {
      depth++;
      if (byId.get(parent)?.shape === 'sequence_diagram') insideSequence = true;
    }
    node.FontSize =
      n.fontSize ??
      (((n.isGroup && (children.get(n.id)?.length ?? 0) > 0) || n.isGrid) && n.shape !== 'text' && !insideSequence
        ? ([28, 24, 20][depth - 1] ?? 16)
        : n.tableColumns !== undefined || n.hasClassData
          ? 20
          : 16);
    if (n.fixedSize) {
      node.DesiredWidth = n.width;
      node.DesiredHeight = n.height;
    }
    if (labelText !== '' && !['text', 'class', 'sql_table', 'code'].includes(n.shape ?? '')) {
      node.Label = new Label();
      node.Label.Text = labelText;
      if (n.labelPosition) node.Label.Position = FromString(n.labelPosition);
      node.Label.Width = n.labelWidth ?? 0;
      node.Label.Height = n.labelHeight ?? 0;
    }
    graph.AddNewNodeToContainer(
      n.parentId !== undefined ? mapped.get(n.parentId)! : null,
      node,
    );
    if (n.direction) graph.Directions.set(node, orientation[n.direction]);
    mapped.set(n.id, node);
    nodeIDs.set(n.id, node.ID);
  });
  const lowerNodes = new Map<string, Node>(), lowerRootD2Nodes = new Map<string, Node>();
  for (const input of ordered) {
    const key = d2Lower(input.id);
    if (!lowerNodes.has(key)) lowerNodes.set(key, mapped.get(input.id)!);
    if (input.parentId === undefined) {
      const d2Key = d2Lower(input.d2Id ?? input.id);
      if (!lowerRootD2Nodes.has(d2Key)) lowerRootD2Nodes.set(d2Key, mapped.get(input.id)!);
    }
  }
  for (const input of ordered) {
    if (input.nearId === undefined) continue;
    const key = d2Lower(input.nearId);
    const target = mapped.get(input.nearId) ?? lowerRootD2Nodes.get(key) ?? lowerNodes.get(key);
    if (!target && [
      'top-left', 'top-center', 'top-right', 'center-left', 'center-right',
      'bottom-left', 'bottom-center', 'bottom-right',
    ].includes(input.nearId)) continue;
    if (!target)
      throw new Error(`node ${input.id} references a missing near node`);
    mapped.get(input.id)!.AddNear(target);
  }
  const edgeNames = new Set<string>(),
    reversed: boolean[] = [],
    lifelines: boolean[] = [],
    edgeAbs: string[] = [],
    equivalentCounts = new Map<string, number>();
  for (let i = 0; i < inputEdges.length; i++) {
    const e = inputEdges[i]!;
    for (const [name, value] of [['source', e.sourceArrowhead], ['target', e.targetArrowhead]] as const) {
      if (value !== undefined && ![
        '', 'none', 'arrow', 'triangle', 'unfilled-triangle', 'diamond', 'filled-diamond',
        'circle', 'filled-circle', 'cross', 'box', 'filled-box', 'line',
        'cf-one', 'cf-many', 'cf-one-required', 'cf-many-required',
        'arrow_point', 'arrow_circle', 'arrow_cross', 'arrow_open',
      ].includes(value))
        throw new Error(`edge ${e.id} has unsupported ${name} arrowhead ${JSON.stringify(value)}`);
    }
    if (loadExistingLayout) {
      const existing = e as RoutingEdge;
      if (existing.labelPosition !== undefined && !IsEdgePosition(FromString(existing.labelPosition)))
        throw new Error(`edge ${e.id} has an invalid label position`);
      if (existing.labelPercentage !== undefined && (!Number.isFinite(existing.labelPercentage) || existing.labelPercentage < 0 || existing.labelPercentage > 1))
        throw new Error(`edge ${e.id} has an invalid label percentage`);
      if (existing.points?.length === 1) throw new Error(`edge ${e.id} has an incomplete route`);
      for (let j = 0; j < (existing.points?.length ?? 0); j++) {
        const point = existing.points![j]!;
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1_000_000_000 || Math.abs(point.y) > 1_000_000_000)
          throw new Error(`edge ${e.id} has an invalid route point`);
        const previous = existing.points![j - 1];
        if (previous && previous.x === point.x && previous.y === point.y)
          throw new Error(`edge ${e.id} has a degenerate route segment`);
      }
    }
    if (e.d2Index !== undefined) {
      const index = e.d2Index;
      if (typeof index === 'number' ? !Number.isSafeInteger(index) :
        typeof index !== 'bigint' || index < -9223372036854775808n || index > 9223372036854775807n)
        throw new Error(`edge ${e.id} has an invalid D2 index`);
    }
    if (edgeNames.has(e.id)) throw new Error('duplicate edge ID');
    edgeNames.add(e.id);
    const [source, target] = arrowFlags(e);
    const lifelineID = d2LifelineEndId(byId.get(e.from)?.d2Id ?? e.from);
    const lifeline = !mapped.has(e.to) && e.to === lifelineID && !source && !target &&
      e.sourceArrowhead === undefined && e.targetArrowhead === undefined &&
      e.sourceArrowheadFilled === undefined && e.targetArrowheadFilled === undefined &&
      e.sourceArrowheadLabel === undefined && e.targetArrowheadLabel === undefined;
    if (!mapped.has(e.from) || (!mapped.has(e.to) && !lifeline))
      throw new Error(`edge ${e.id} references a missing node`);
    lifelines.push(lifeline);
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
    const forward = JSON.stringify([e.from, source, e.to, target]);
    const backward = JSON.stringify([e.to, target, e.from, source]);
    const key = forward < backward ? forward : backward;
    const inferredIndex = equivalentCounts.get(key) ?? 0;
    equivalentCounts.set(key, inferredIndex + 1);
    reversed.push(source && !target);
    const from = [...paths.get(e.from)!],
      to = [...paths.get(lifeline ? e.from : e.to)!],
      common: string[] = [];
    while (
      from.length > 1 &&
      to.length > 1 &&
      equalFold(from[0]!, to[0]!)
    ) {
      common.push(from.shift()!);
      to.shift();
    }
    const arrow = source ? (target ? '<->' : '<-') : target ? '->' : '--';
    edgeAbs.push(
      `${common.length ? common.join('.') + '.' : ''}(${from.join('.')} ${arrow} ${to.join('.')})[${e.d2Index ?? inferredIndex}]`,
    );
  }
  const edgeIDs = allocateEntityIDs(edgeAbs);
  inputEdges.forEach((input, i) => {
    const e = graph.Connect(
      mapped.get(reversed[i] ? input.to : input.from)!,
      mapped.get(reversed[i] || lifelines[i] ? input.from : input.to)!,
    );
    e.ID = edgeIDs[i]!;
    e.D2ID = edgeAbs[i]!;
    if (loadExistingLayout) {
      const points = (input as RoutingEdge).points ?? [];
      e.Points = (reversed[i] ? [...points].reverse() : points).map((p) => new Point(p.x, p.y));
    }
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
      if (style.opacity !== undefined) {
        const opacity = parseGoFloat(style.opacity);
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
          throw new Error(`edge ${input.id} has invalid opacity`);
      }
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
      (style?.opacity !== undefined && parseGoFloat(style.opacity) === 0);
    const [sourceArrow, targetArrow] = arrowFlags(input);
    e.SourceArrowhead = reversed[i]
      ? NoArrowhead
      : arrowhead(input.sourceArrowhead, sourceArrow ? TriangleArrowhead : NoArrowhead, input.sourceArrowheadFilled, input.sourceArrowheadLabel !== undefined);
    e.TargetArrowhead = reversed[i]
      ? arrowhead(input.sourceArrowhead, TriangleArrowhead, input.sourceArrowheadFilled, input.sourceArrowheadLabel !== undefined)
      : arrowhead(input.targetArrowhead, targetArrow ? TriangleArrowhead : NoArrowhead, input.targetArrowheadFilled, input.targetArrowheadLabel !== undefined);
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
    if (style?.opacity !== undefined && parseGoFloat(style.opacity) === 0) {
      e.MinWidth = 0;
      e.MinHeight = 0;
    }
    const labelText = input.label ?? ((input.labelWidth ?? 0) > 0 || (input.labelHeight ?? 0) > 0 ? 'label' : '');
    if (labelText !== '') {
      e.Label = new Label();
      e.Label.Text = labelText;
      e.Label.Width = input.labelWidth ?? 0;
      e.Label.Height = input.labelHeight ?? 0;
      const existing = input as RoutingEdge;
      if (loadExistingLayout && existing.labelPosition !== undefined) {
        e.Label.Position = FromString(existing.labelPosition);
        if (existing.labelPercentage !== undefined) e.LabelPercentage = existing.labelPercentage;
        if (reversed[i]) {
          e.Label.Position = Mirrored(e.Label.Position);
          if (existing.labelPercentage !== undefined || IsUnlocked(e.Label.Position))
            e.LabelPercentage = 1 - e.LabelPercentage;
        }
      }
    }
  });
  return { graph, nodeIDs, edgeIDs, reversed, lifelines };
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
  if (options.inputOrder === 'canonical') {
    inputNodes = [...inputNodes].sort((a, b) => compareIdentifiers(a.id, b.id));
    inputEdges = [...inputEdges].sort((a, b) => compareIdentifiers(a.id, b.id));
  }
  const seeds =
      options.seeds === undefined
        ? getTalaSeeds()
        : normalizeSeeds(options.seeds),
    { graph, nodeIDs, edgeIDs, reversed, lifelines } = translateFlowchart(
      inputNodes,
      inputEdges,
      options,
    );
  const initial = coordinateLocalSeeds(seeds, (seed) => {
    const candidate = Layout(Background, graph, { Seed: seed });
    return { value: candidate, score: evaluateCandidate(graph, candidate) };
  });
  let best = initial.value, bestScore = initial.score;
  const ordinary = best;
  try {
    const candidate = CompoundCandidate(Background, best);
    if (candidate !== best) {
      const score = evaluateCandidate(graph, candidate);
      if (score.Compare(bestScore) < 0) {
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
    if (edge.from !== edge.to && outgoing.has(edge.to)) outgoing.get(edge.from)!.push(edge);
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
          ...(lifelines[index] ? { to: input.from } : {}),
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
