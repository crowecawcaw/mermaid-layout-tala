import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-trees.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Tree, Label } from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { Background, WithCancel } from '../src/upstream/limits/context.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import {
  constructToOrientation,
  positionTreeEdgeLabels,
} from '../src/upstream/trees/layout.js';
import { levelsByDepth } from '../src/upstream/trees/geometry.js';
import { ErrViolation } from '../src/upstream/invariant/errors.js';
describe('upstream tree geometry translation', () => {
  it.each(fixtures)(
    'matches Go coordinates, labels and exact work counts for $name',
    (f) => {
      const g = new Graph(),
        nodes = new Map<number, Node>(),
        trees: Tree[] = [];
      for (const record of f.nodes) {
        const n = new Node(BigInt(record.id), record.width, record.height);
        g.AddNode(n);
        n.TopLeft = new Point(record.x, record.y);
        nodes.set(record.id, n);
        if (record.parent !== -2) trees.push(new Tree(n));
      }
      let index = 0;
      for (const record of f.nodes) {
        const node = nodes.get(record.id)!;
        if (record.container)
          g.AddNodeToContainer(nodes.get(record.container)!, node);
        if (record.parent === -2) continue;
        const tree = trees[index++]!;
        if (record.parent >= 0) {
          tree.Parent = trees[record.parent]!;
          tree.Parent.Children.push(tree);
        }
      }
      for (const record of f.edges) {
        const edge = g.Connect(nodes.get(record.from)!, nodes.get(record.to)!);
        edge.ID = BigInt(record.id);
        edge.TargetArrowhead = 'triangle';
        edge.MinWidth = record.minWidth;
        edge.MinHeight = record.minHeight;
        if (record.label) {
          edge.Label = new Label();
          edge.Label.Text = 'label';
          edge.Label.Width = record.minWidth;
          edge.Label.Height = record.minHeight;
        }
        trees[record.id]!.SentinelEdge = edge;
      }
      const guard = new WorkGuard(
        Background,
        'tree fixture',
        MaxEngineWorkUnits,
      );
      constructToOrientation(trees[0]!, f.orientation, guard);
      positionTreeEdgeLabels(trees[0]!, true, guard);
      expect(
        Object.fromEntries(
          g.Nodes.map((n) => [
            String(n.ID),
            {
              x: n.TopLeft!.X,
              y: n.TopLeft!.Y,
              width: n.Width,
              height: n.Height,
            },
          ]),
        ),
      ).toEqual(f.expected);
      expect(
        Object.fromEntries(
          g.Edges.map((e) => [
            String(e.ID),
            { position: e.Label?.Position ?? 0, percentage: e.LabelPercentage },
          ]),
        ),
      ).toEqual(f.expectedEdges);
      expect(String(guard.Used())).toBe(f.work);
    },
  );
  it('rejects repeated topology with the upstream invariant cause', () => {
    const root = new Tree(new Node(1n, 20, 20));
    root.Children.push(root);
    expect(() =>
      levelsByDepth(root, new WorkGuard(Background, 'test', 100n)),
    ).toThrow(expect.objectContaining({ cause: ErrViolation }));
  });
  it('observes cancellation before tree work', () => {
    const [ctx, cancel] = WithCancel();
    cancel();
    expect(
      () => new WorkGuard(ctx, 'tree fixture', MaxEngineWorkUnits),
    ).toThrow('tree fixture: context canceled');
  });
});
