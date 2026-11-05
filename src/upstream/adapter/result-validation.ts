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
