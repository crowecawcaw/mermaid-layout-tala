import { describe, it, expect } from 'vitest';
import fixtures from './fixtures/upstream-preflight.json';
import combinationFixtures from './fixtures/upstream-combinationpreflight.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Edge } from '../src/upstream/layoutgraph/edge.js';
import {
  Tree,
  Cluster,
  Hierarchy,
  HerdAssignment,
} from '../src/upstream/layoutgraph/records.js';
import {
  validateEngineGraph,
  validateCombineNodeTopology,
  setSliceCapacity,
} from '../src/upstream/layoutgraph/topology-preflight.js';
import { Clone } from '../src/upstream/layoutgraph/clone.js';
import {
  Background,
  WithCancel,
  Canceled,
} from '../src/upstream/limits/context.js';
function build(trial: number): Graph {
  let g = new Graph();
  const n = new Node(1n, 40, 30);
  n.Graph = g;
  g.Nodes = [n];
  const tr = new Tree(n),
    c = new Tree(new Node(2n, 30, 20));
  c.Parent = tr;
  tr.Children = [c];
  switch (trial) {
    case 0:
      g = new Graph();
      break;
    case 1:
      g.Nodes = [null!];
      break;
    case 2:
      g.Edges = [null!];
      break;
    case 3:
      g.Edges = [new Edge(n, null!)];
      break;
    case 4:
      g.Containers.set(null, [null!]);
      break;
    case 5:
      g.Clusters.set(n, null!);
      break;
    case 6:
      g.Sequences.set(n, null!);
      break;
    case 7:
      g.Trees.set(null, [null!]);
      break;
    case 8:
      n.Nears.add(null!);
      break;
    case 9:
      g.Connect(n, n).Points = [null!];
      break;
    case 10:
      n.Cluster = new Cluster();
      break;
    case 11:
      n.isClusterVessel = true;
      break;
    case 12:
      n.Container = n;
      break;
    case 13: {
      const v = new Node(2n, 20, 20);
      v.Graph = g;
      v.Container = n;
      n.Cluster = Object.assign(new Cluster(), { Vessel: v });
      break;
    }
    case 14:
      n.Cluster = Object.assign(new Cluster(), { Vessel: n });
      break;
    case 15:
      n.isContainer = true;
      g.Containers.set(n, [n]);
      break;
    case 16:
      tr.Children = [tr];
      g.Trees.set(null, [tr]);
      break;
    case 17:
      tr.Children = [];
      tr.Parent = tr;
      g.Trees.set(null, [tr]);
      break;
    case 18:
      g.Trees.set(null, [tr, tr]);
      break;
    case 19:
      tr.Children = [c, c];
      g.Trees.set(null, [tr]);
      break;
    case 20:
      c.Parent = null;
      g.Trees.set(null, [tr]);
      break;
    case 21:
      g.Trees.set(null, [new Tree(n), new Tree(n)]);
      break;
    case 22:
      tr.Parent = new Tree(new Node(3n, 20, 20));
      g.Trees.set(null, [tr]);
      break;
    case 23: {
      const p = new Tree(new Node(3n, 20, 20));
      p.Children = [tr];
      tr.Parent = p;
      g.Trees.set(null, [tr]);
      break;
    }
    case 24:
      g.NodeToTree.set(n, c);
      break;
    case 25:
      g.Trees.set(null, [tr]);
      g.NodeToTree.set(n, tr);
      break;
    case 26: {
      g.Trees.set(null, [tr]);
      const other = new Tree(new Node(4n, 20, 20));
      g.NodeToTree.set(other.Node, other);
      break;
    }
    case 27:
      g.Nodes = setSliceCapacity([], 1000001);
      break;
    case 28:
      g.Connect(n, n).Points = setSliceCapacity([], 1000001);
      break;
    case 29:
    case 30:
    case 31: {
      const depth = 255 + trial - 29;
      let prev = n;
      for (let j = 1; j < depth; j++) {
        const p = new Node(BigInt(j + 1), 20, 20);
        prev.Container = p;
        prev = p;
      }
      break;
    }
    case 32:
    case 33:
    case 34: {
      const depth = 255 + trial - 32;
      let prev = n;
      for (let j = 1; j < depth; j++) {
        const p = new Node(BigInt(j + 1), 20, 20);
        prev.isContainer = true;
        g.Containers.set(prev, [p]);
        prev = p;
      }
      break;
    }
    case 35:
    case 36:
    case 37: {
      const depth = 255 + trial - 35;
      tr.Children = [];
      let prev = tr;
      for (let j = 1; j < depth; j++) {
        const p = new Tree(new Node(BigInt(j + 1), 20, 20));
        p.Parent = prev;
        prev.Children = [p];
        prev = p;
      }
      g.Trees.set(null, [tr]);
      break;
    }
    case 38:
      g.Trees.set(null, [tr]);
      g.NodeToTree.set(n, tr);
      g.NodeToTree.set(c.Node, c);
      break;
    case 39:
      n.Hierarchy = new Hierarchy();
      n.Hierarchy.ReplaceLevels(new Map([[null!, 0]]));
      break;
    case 40:
      n.HerdAssignment = new HerdAssignment();
      n.HerdAssignment.sameSidePaired.add(null!);
      break;
    case 41:
      g.Hubs.set(n, [null!]);
      break;
  }
  return g;
}
describe('direct upstream topology preflight', () => {
  it.each(fixtures)('matches Go validation for topology $trial', (f) => {
    let message = '';
    try {
      validateEngineGraph(Background, 'fixture', build(f.trial));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe(f.error);
  });
  it('checks cancellation before copying and preserves cause', () => {
    const [ctx, cancel] = WithCancel();
    cancel();
    try {
      Clone(ctx, build(0));
      throw new Error('expected cancellation');
    } catch (e) {
      expect((e as Error).cause).toBe(Canceled);
    }
  });
  it('clones root-sentinel trees and orders the nil sentinel before positive IDs', () => {
    const g = new Graph(),
      a = new Node(1n, 20, 20),
      b = new Node(2n, 30, 30);
    g.AddNodeUnchecked(a);
    g.AddNodeUnchecked(b);
    const t = new Tree(b);
    t.SentinelEdge = new Edge(a, b);
    g.Trees.set(null, [t]);
    g.Trees.set(a, []);
    expect(g.TreeOrder()).toEqual([null, a]);
    const copy = Clone(Background, g);
    expect(copy.Trees.get(null)![0]!.Node).toBe(copy.Nodes[1]);
    expect(copy.Trees.get(null)![0]!.Node).not.toBe(b);
  });
});

it.each(combinationFixtures)(
  'matches Go node-owned union preflight $trial',
  (f) => {
    const g = build(f.trial);
    let message = '';
    try {
      validateCombineNodeTopology(Background, [g, g]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(f.error);
  },
);
