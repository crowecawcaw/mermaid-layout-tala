import { it, expect } from 'vitest';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import { Canceled, type Context } from '../src/upstream/limits/context.js';
import {
  Preprocess,
  preprocessTreesWithWorkLimit,
} from '../src/upstream/trees/preprocess.js';
function reconnectGraph() {
  const g = new Graph();
  const add = (id: number) => {
    const n = new Node(BigInt(id), 10, 10);
    n.TopLeft = new Point(id * 20, 0);
    g.AddNewNodeToContainer(null, n);
    return n;
  };
  const core = [add(1), add(2), add(3)];
  g.Connect(core[0]!, core[1]!);
  g.Connect(core[1]!, core[2]!);
  g.Connect(core[2]!, core[0]!);
  let previous = core[0]!;
  for (let i = 0; i < 8; i++) {
    const n = add(10 + i);
    g.Connect(previous, n);
    previous = n;
  }
  for (const e of g.Edges)
    e.Points = [e.From.TopLeft!.Copy(), e.To.TopLeft!.Copy()];
  return { g, leaf: previous };
}
function remember(g: Graph) {
  const nodes = g.Nodes,
    edges = g.Edges,
    containers = g.Containers,
    roots = g.Containers.get(null)!,
    trees = g.Trees,
    nodeToTree = g.NodeToTree;
  const nodeValues = nodes.slice(),
    edgeValues = edges.slice(),
    rootValues = roots.slice();
  const incidence = new Map(
    nodes.map((n) => [
      n,
      { ref: n.Edges, values: n.Edges.slice(), position: n.TopLeft },
    ]),
  );
  const routes = new Map(
    edges.map((e) => [
      e,
      {
        ref: e.Points,
        points: e.Points.slice(),
        values: e.Points.map((p) => p.Copy()),
      },
    ]),
  );
  return () => {
    expect(g.Nodes).toBe(nodes);
    expect(g.Nodes).toEqual(nodeValues);
    expect(g.Edges).toBe(edges);
    expect(g.Edges).toEqual(edgeValues);
    expect(g.Containers).toBe(containers);
    expect(g.Containers.get(null)).toBe(roots);
    expect(roots).toEqual(rootValues);
    expect(g.Trees).toBe(trees);
    expect(g.NodeToTree).toBe(nodeToTree);
    for (const [n, s] of incidence) {
      expect(n.Edges).toBe(s.ref);
      expect(n.Edges).toEqual(s.values);
      expect(n.TopLeft).toBe(s.position);
      expect(n.Graph).toBe(g);
    }
    for (const [e, s] of routes) {
      expect(e.Points).toBe(s.ref);
      expect(e.Points).toEqual(s.values);
      s.points.forEach((p, i) => expect(e.Points[i]).toBe(p));
    }
  };
}
it.each(['fringe removal', 'tree map installation', 'reconnection'] as const)(
  'rolls back exact topology when canceled after %s',
  (stage) => {
    const { g, leaf } = reconnectGraph(),
      assertRestored = remember(g),
      count = g.Nodes.length;
    let observed = false,
      removed = false;
    const ctx: Context = {
      Done: () => null,
      Err: () => {
        const present = g.Nodes.includes(leaf);
        if (!present) removed = true;
        const reached =
          stage === 'fringe removal'
            ? g.Nodes.length < count
            : stage === 'tree map installation'
              ? g.Trees.size > 0
              : removed && present;
        if (reached) {
          observed = true;
          return Canceled;
        }
        return null;
      },
    };
    try {
      Preprocess(ctx, g);
      throw new Error('expected cancellation');
    } catch (e) {
      expect((e as Error).cause).toBe(Canceled);
    }
    expect(observed).toBe(true);
    assertRestored();
  },
);
it('rolls back every work-limit interruption across a preprocessing pass', () => {
  let failures = 0,
    success = false;
  for (let limit = 0; limit < 2200; limit += 13) {
    const { g } = reconnectGraph(),
      assertRestored = remember(g);
    try {
      preprocessTreesWithWorkLimit(
        { Done: () => null, Err: () => null },
        g,
        BigInt(limit),
      );
      success = true;
      break;
    } catch (e) {
      expect((e as Error).message).toContain('work exceeds limit');
      failures++;
      assertRestored();
    }
  }
  expect(failures).toBeGreaterThan(10);
  expect(success).toBe(true);
});
