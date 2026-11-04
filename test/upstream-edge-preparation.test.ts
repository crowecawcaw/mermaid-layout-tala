import { describe, expect, it } from 'vitest';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Label } from '../src/upstream/layoutgraph/records.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Background, WithCancel } from '../src/upstream/limits/context.js';
import {
  edgePairKey,
  prepareNodeEdgeLength,
} from '../src/upstream/placementcost/edge-preparation.js';

const options = {
  EdgeAbductions: null,
  IncludeNodeSizes: true,
  EnforceMinimumGap: false,
  PenalizeDirection: true,
};
describe('edge scoring preparation', () => {
  it('counts labeled parallel edges and uses their semantic direction', () => {
    const graph = new Graph(),
      a = new Node(1n, 10, 10),
      b = new Node(2n, 10, 10);
    graph.AddNodeUnchecked(a);
    graph.AddNodeUnchecked(b);
    for (let i = 0; i < 3; i++) {
      const e = graph.Connect(a, b);
      e.Label = new Label();
    }
    const result = prepareNodeEdgeLength(Background, a, options);
    expect(result.direction).toBe(Orientation.Left);
    expect(result.directionFactor).toBe(10);
    expect(result.labeledEdgeCount.get(edgePairKey(a, b))).toBe(3);
    expect(result.nRepl).toEqual([a, a, a]);
    expect(result.aRepl).toEqual([b, b, b]);
  });
  it('consumes matching abductions once in order and honors cancellation', () => {
    const graph = new Graph(),
      a = new Node(1n, 10, 10),
      b = new Node(2n, 10, 10),
      child = new Node(3n, 10, 10);
    graph.AddNodeUnchecked(a);
    graph.AddNodeUnchecked(b);
    const edge = graph.Connect(a, b);
    graph.Connect(a, b);
    const abduction = {
      Edge: edge,
      CurrentFrom: a,
      CurrentTo: b,
      OriginallyFrom: child,
      OriginallyTo: null,
    };
    const result = prepareNodeEdgeLength(Background, a, {
      ...options,
      EdgeAbductions: [abduction],
    });
    expect(result.nRepl).toEqual([child, a]);
    const [ctx, cancel] = WithCancel();
    cancel();
    expect(() => prepareNodeEdgeLength(ctx, a, options)).toThrow(
      'EdgeLength: context canceled',
    );
  });
});
