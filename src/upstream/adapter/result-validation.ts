// Translated from d2talalayout/result_validate.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Context } from '../limits/context.js';
import type { Graph } from '../layoutgraph/graph.js';
import type { Node } from '../layoutgraph/node.js';
import type { Edge } from '../layoutgraph/edge.js';
import { SequenceDefiningEdges } from '../grouping/sequences.js';
const maxResultCoordinate = 1_000_000_000;
function checkContext(ctx: Context): void {
  const error = ctx.Err();
  if (error) throw error;
}
function goFloat(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4))
    return value
      .toExponential()
      .replace(
        /e([+-])(\d+)$/,
        (_, sign: string, exponent: string) =>
          `e${sign}${exponent.padStart(2, '0')}`,
      );
  return Object.is(value, -0) ? '-0' : String(value);
}
function coordinate(name: string, value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > maxResultCoordinate)
    throw new Error(
      `${name} is outside the finite supported range: ${goFloat(value)}`,
    );
}
function dimension(name: string, value: number, zeroAllowed: boolean): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (!zeroAllowed && value === 0) ||
    value > maxResultCoordinate
  )
    throw new Error(
      `${name} is outside the supported range: ${goFloat(value)}`,
    );
}
export function validateResultNode(node: Node): void {
  if (!node) throw new Error('node is nil');
  if (!node.TopLeft) throw new Error(`node ${node.ID} has no position`);
  try {
    coordinate('node x', node.TopLeft.X);
    coordinate('node y', node.TopLeft.Y);
    dimension('node width', node.Width, false);
    dimension('node height', node.Height, false);
    if (
      !Number.isFinite(node.TopLeft.X + node.Width) ||
      !Number.isFinite(node.TopLeft.Y + node.Height)
    )
      throw new Error('bounds overflow');
    if (node.Label) {
      dimension('node label width', node.Label.Width, true);
      dimension('node label height', node.Label.Height, true);
    }
  } catch (error) {
    throw new Error(`node ${node.ID}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}
export function validateResultEdge(ctx: Context, edge: Edge): void {
  if (!edge) throw new Error('edge is nil');
  if (edge.Points.length < 2)
    throw new Error(`edge ${edge.ID} has an incomplete route`);
  for (let i = 0; i < edge.Points.length; i++) {
    if (i % 256 === 0) checkContext(ctx);
    const point = edge.Points[i];
    if (!point) throw new Error(`edge ${edge.ID} route point ${i} is nil`);
    try {
      coordinate('route x', point.X);
      coordinate('route y', point.Y);
    } catch (error) {
      throw new Error(
        `edge ${edge.ID} point ${i}: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }
  if (
    !Number.isFinite(edge.LabelPercentage) ||
    edge.LabelPercentage < 0 ||
    edge.LabelPercentage > 1
  )
    throw new Error(
      `edge ${edge.ID} has invalid label percentage ${goFloat(edge.LabelPercentage)}`,
    );
  for (const [name, label] of [
    ['label', edge.Label],
    ['source arrowhead label', edge.SourceArrowheadLabel],
    ['target arrowhead label', edge.TargetArrowheadLabel],
  ] as const) {
    if (!label) continue;
    try {
      dimension(`${name} width`, label.Width, true);
      dimension(`${name} height`, label.Height, true);
    } catch (error) {
      throw new Error(`edge ${edge.ID}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
}
export function validateCompletedGraph(ctx: Context, graph: Graph): void {
  if (!graph) throw new Error('graph is nil');
  const nodes = new Set<Node>(),
    nodeIDs = new Set<bigint>();
  for (let i = 0; i < graph.Nodes.length; i++) {
    checkContext(ctx);
    const node = graph.Nodes[i];
    if (!node) throw new Error(`node ${i} is nil`);
    if (nodes.has(node)) throw new Error(`node ${node.ID} is repeated`);
    nodes.add(node);
    if (nodeIDs.has(node.ID))
      throw new Error(`node ID ${node.ID} is duplicated`);
    nodeIDs.add(node.ID);
    validateResultNode(node);
  }
  const edges = new Set<Edge>(),
    edgeIDs = new Set<bigint>();
  for (let i = 0; i < graph.Edges.length; i++) {
    checkContext(ctx);
    const edge = graph.Edges[i];
    if (!edge) throw new Error(`edge ${i} is nil`);
    if (edges.has(edge)) throw new Error(`edge ${edge.ID} is repeated`);
    edges.add(edge);
    if (edgeIDs.has(edge.ID))
      throw new Error(`edge ID ${edge.ID} is duplicated`);
    edgeIDs.add(edge.ID);
    if (!nodes.has(edge.From))
      throw new Error(`edge ${edge.ID} has a source outside the result graph`);
    if (!nodes.has(edge.To))
      throw new Error(
        `edge ${edge.ID} has a destination outside the result graph`,
      );
    validateResultEdge(ctx, edge);
  }
}
export function validateTopology(
  ctx: Context,
  expected: Graph,
  actual: Graph,
  allowedMissing: Set<bigint>,
): void {
  if (!expected || !actual)
    throw new Error('cannot compare nil graph topology');
  if (expected.Nodes.length !== actual.Nodes.length)
    throw new Error(
      `node count changed from ${expected.Nodes.length} to ${actual.Nodes.length}`,
    );
  const nodes = new Set<bigint>();
  for (const node of expected.Nodes) {
    checkContext(ctx);
    if (!node) throw new Error('input contains a nil node');
    if (nodes.has(node.ID))
      throw new Error(`input contains duplicate node ID ${node.ID}`);
    nodes.add(node.ID);
  }
  for (const node of actual.Nodes) {
    checkContext(ctx);
    if (!nodes.has(node.ID))
      throw new Error(`result contains unexpected node ID ${node.ID}`);
  }
  const expectedEdges = new Map<bigint, Edge>();
  for (const edge of expected.Edges) {
    checkContext(ctx);
    if (!edge || !edge.From || !edge.To)
      throw new Error('input contains an edge with a nil endpoint');
    if (expectedEdges.has(edge.ID))
      throw new Error(`input contains duplicate edge ID ${edge.ID}`);
    expectedEdges.set(edge.ID, edge);
  }
  const actualEdges = new Set<bigint>();
  for (const edge of actual.Edges) {
    checkContext(ctx);
    if (!edge || !edge.From || !edge.To)
      throw new Error('result contains an edge with a nil endpoint');
    if (actualEdges.has(edge.ID))
      throw new Error(`result contains duplicate edge ID ${edge.ID}`);
    actualEdges.add(edge.ID);
    const input = expectedEdges.get(edge.ID);
    if (!input)
      throw new Error(`result contains unexpected edge ID ${edge.ID}`);
    if (input.From.ID !== edge.From.ID || input.To.ID !== edge.To.ID)
      throw new Error(
        `edge ${edge.ID} endpoints changed from ${input.From.ID}->${input.To.ID} to ${edge.From.ID}->${edge.To.ID}`,
      );
  }
  for (const id of expectedEdges.keys()) {
    checkContext(ctx);
    if (!actualEdges.has(id) && !allowedMissing.has(id))
      throw new Error(`result is missing edge ID ${id}`);
  }
}
export function validateLayoutResultTopology(
  ctx: Context,
  expected: Graph,
  actual: Graph,
): Set<bigint> {
  const sequenceEdges = SequenceDefiningEdges(ctx, expected);
  validateTopology(ctx, expected, actual, sequenceEdges);
  return sequenceEdges;
}

export function validateLayoutResultMetadata(
  ctx: Context,
  expected: Graph,
  actual: Graph,
  allowedMissing: Set<bigint>,
): void {
  if (!expected || !actual)
    throw new Error('cannot compare nil graph metadata');
  checkContext(ctx);
  if (expected.IsRootHierarchy !== actual.IsRootHierarchy)
    throw new Error('root hierarchy metadata changed');
  const directions = (graph: Graph) => {
    const result = new Map<string, number>();
    for (const [node, direction] of graph.Directions) {
      checkContext(ctx);
      const key = node ? `node:${node.ID}` : 'root';
      if (result.has(key))
        throw new Error('graph direction metadata repeats a canonical key');
      result.set(key, direction);
    }
    return result;
  };
  const expectedDirections = directions(expected),
    actualDirections = directions(actual);
  if (expectedDirections.size !== actualDirections.size)
    throw new Error('graph direction metadata changed');
  for (const [key, value] of expectedDirections) {
    checkContext(ctx);
    if (actualDirections.get(key) !== value)
      throw new Error('graph direction metadata changed');
  }
  const nodes = new Map<bigint, Node>();
  for (const node of expected.Nodes) {
    checkContext(ctx);
    if (!node) throw new Error('input contains a nil node');
    nodes.set(node.ID, node);
  }
  const optionalPoint = (a: Node['FixedTopLeft'], b: Node['FixedTopLeft']) =>
    a === null || b === null ? a === b : a.Equals(b);
  for (const node of actual.Nodes) {
    checkContext(ctx);
    if (!node) throw new Error('result contains a nil node');
    const input = nodes.get(node.ID);
    if (!input)
      throw new Error(`result contains unexpected node ID ${node.ID}`);
    if (input.ShapeType() !== node.ShapeType())
      throw new Error(
        `node ${node.ID} shape changed from ${JSON.stringify(input.ShapeType())} to ${JSON.stringify(node.ShapeType())}`,
      );
    if ((input.Container?.ID ?? null) !== (node.Container?.ID ?? null))
      throw new Error(`node ${node.ID} container ownership changed`);
    if (input.NumColumns() !== node.NumColumns())
      throw new Error(
        `node ${node.ID} table column count changed from ${input.NumColumns()} to ${node.NumColumns()}`,
      );
    if (input.Is3D !== node.Is3D)
      throw new Error(`node ${node.ID} 3D outline metadata changed`);
    if (input.IsMultiple !== node.IsMultiple)
      throw new Error(`node ${node.ID} multiple outline metadata changed`);
    if (input.IsInvisible !== node.IsInvisible)
      throw new Error(`node ${node.ID} visibility metadata changed`);
    if (!optionalPoint(input.FixedTopLeft, node.FixedTopLeft))
      throw new Error(`node ${node.ID} fixed position metadata changed`);
    if (
      input.DesiredWidth !== node.DesiredWidth ||
      input.DesiredHeight !== node.DesiredHeight
    )
      throw new Error(`node ${node.ID} desired-size metadata changed`);
    if (input.ForceHierarchy !== node.ForceHierarchy)
      throw new Error(`node ${node.ID} forced-hierarchy metadata changed`);
    if ((input.Label?.Text ?? null) !== (node.Label?.Text ?? null))
      throw new Error(`node ${node.ID} label identity changed`);
    if (
      input.Label &&
      input.Label.Position !== 0 &&
      input.Label.Position !== node.Label!.Position
    )
      throw new Error(`node ${node.ID} fixed label position changed`);
    if (!!input.Icon !== !!node.Icon)
      throw new Error(`node ${node.ID} icon presence changed`);
    if (
      input.Icon &&
      input.Icon.Position !== 0 &&
      input.Icon.Position !== node.Icon!.Position
    )
      throw new Error(`node ${node.ID} fixed icon position changed`);
    if (
      input.FontSize === null || node.FontSize === null
        ? input.FontSize !== node.FontSize
        : input.FontSize !== node.FontSize &&
          ![13, 14, 16, 20, 24, 28, 32].includes(node.FontSize)
    )
      throw new Error(
        `node ${node.ID} font size is outside the layout output domain`,
      );
  }
  const edges = new Map<bigint, Edge>();
  for (const edge of expected.Edges) {
    checkContext(ctx);
    if (!edge) throw new Error('input contains a nil edge');
    edges.set(edge.ID, edge);
  }
  const seen = new Set<bigint>();
  const sameLabel = (a: Edge['Label'], b: Edge['Label'], position: boolean) =>
    a === null || b === null
      ? a === b
      : a.Text === b.Text &&
        a.Width === b.Width &&
        a.Height === b.Height &&
        (!position || a.Position === b.Position);
  for (const edge of actual.Edges) {
    checkContext(ctx);
    if (!edge) throw new Error('result contains a nil edge');
    seen.add(edge.ID);
    const input = edges.get(edge.ID);
    if (!input)
      throw new Error(`result contains unexpected edge ID ${edge.ID}`);
    if (
      input.SourceArrowhead !== edge.SourceArrowhead ||
      input.TargetArrowhead !== edge.TargetArrowhead
    )
      throw new Error(`edge ${edge.ID} arrowhead metadata changed`);
    if (!sameLabel(input.SourceArrowheadLabel, edge.SourceArrowheadLabel, true))
      throw new Error(
        `edge ${edge.ID} source arrowhead label metadata changed`,
      );
    if (!sameLabel(input.TargetArrowheadLabel, edge.TargetArrowheadLabel, true))
      throw new Error(
        `edge ${edge.ID} target arrowhead label metadata changed`,
      );
    if (input.MinWidth !== edge.MinWidth || input.MinHeight !== edge.MinHeight)
      throw new Error(`edge ${edge.ID} minimum geometry changed`);
    if (
      input.FromTableColumnIndex !== edge.FromTableColumnIndex ||
      input.ToTableColumnIndex !== edge.ToTableColumnIndex
    )
      throw new Error(
        `edge ${edge.ID} table column attachment metadata changed`,
      );
    if (input.IsInvisible !== edge.IsInvisible)
      throw new Error(`edge ${edge.ID} visibility metadata changed`);
    const keys = Object.keys(input.Style) as (keyof typeof input.Style)[];
    if (keys.some((key) => input.Style[key]?.Value !== edge.Style[key]?.Value))
      throw new Error(`edge ${edge.ID} style metadata changed`);
    if (!sameLabel(input.Label, edge.Label, false))
      throw new Error(`edge ${edge.ID} label identity or dimensions changed`);
  }
  for (const id of edges.keys()) {
    checkContext(ctx);
    if (!seen.has(id) && !allowedMissing.has(id))
      throw new Error(`result is missing edge ID ${id}`);
  }
}
