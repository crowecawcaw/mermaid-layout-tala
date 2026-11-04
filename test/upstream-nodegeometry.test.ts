import { describe, it, expect } from 'vitest';
import fixtures from './fixtures/upstream-nodegeometry.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  Label,
  Icon,
  type Spacing,
} from '../src/upstream/layoutgraph/records.js';
import { Point } from '../src/upstream/geo/point.js';
import { Box } from '../src/upstream/geo/box.js';
import * as S from '../src/upstream/layoutgraph/node-spatial.js';
import {
  UpdateSpacing,
  deltaToGuarded,
} from '../src/upstream/layoutgraph/node-spacing.js';
import { WorkGuard, MaxEngineWorkUnits } from '../src/upstream/limits/work.js';
import { Background } from '../src/upstream/limits/context.js';
import { compare } from './helpers/compare.js';
const spacing = (s: Spacing) => [s.top, s.right, s.bottom, s.left];
const record = (s: number[]): Spacing => ({
  top: s[0]!,
  right: s[1]!,
  bottom: s[2]!,
  left: s[3]!,
});
import * as G from '../src/upstream/layoutgraph/node-geometry.js';
it.each(fixtures)(
  'matches Go bounds, labels and container fitting for trial $trial',
  (f) => {
    const g = new Graph();
    g.CellSize = f.cell;
    const nodes = f.nodes.map((r, j) => {
      const n = new Node(BigInt(j + 1), r.box.Width, r.box.Height);
      n.TopLeft = new Point(r.box.TopLeft.x, r.box.TopLeft.y);
      n.Graph = g;
      n.SetShape(r.shape);
      n.margin = record(r.margin);
      n.padding = record(r.padding);
      if (f.trial % 4 !== 0) r.loops.forEach((v, o) => n.LoopOffsets.set(o, v));
      n.Label = Object.assign(new Label(), {
        Position: r.label[0] as number,
        Width: r.label[1] as number,
        Height: r.label[2] as number,
      });
      if (r.label[3]) n.Label.FixPosition();
      n.Icon = Object.assign(new Icon(), { Position: r.icon[0] as number });
      if (r.icon[1]) n.Icon.FixPosition();
      n.Is3D = r.threeD;
      n.IsMultiple = r.multiple;
      UpdateSpacing(n);
      return n;
    });

    g.Nodes = nodes;
    g.Containers.set(null, [nodes[0]!]);
    g.Containers.set(nodes[0]!, nodes.slice(1));
    nodes[0]!.isContainer = true;
    nodes[1]!.Container = nodes[0]!;
    nodes[2]!.Container = nodes[0]!;
    if (f.trial % 5 === 0) nodes[1]!.FixedTopLeft = new Point(10, 20);
    const guard = new WorkGuard(
      Background,
      'node geometry fixture',
      MaxEngineWorkUnits,
    );
    const bounds = G.boundsWithWorkGuard(nodes, guard),
      unrounded = G.nodesBoundingBox(nodes, false),
      fixed = G.fixedBounds(nodes),
      childFixed = G.fixedBounds(nodes.slice(1));
    const perNode = nodes.map((n) => ({
      bounds: G.boundingBoxValues(n, nodes, true),
      raw: G.boundingBoxValues(n, null, false),
      inner: G.InnerBox(n),
      inside: G.InsidePlacement(n, 50, 40, n.padding),
      labels: Array.from({ length: 37 }, (_, pos) =>
        G.LabelTopLeft(n, pos, 55, 25),
      ),
      icons: Array.from({ length: 37 }, (_, pos) => G.IconSize(n, pos)),
      contain: G.CanContain(n),
    }));
    const paddingFalse = G.containerPadding(g, nodes[0]!, false),
      paddingTrue = G.containerPadding(g, nodes[0]!, true);
    G.wrapChildren(nodes[0]!);
    const wrapped = nodes[0]!.Box.Copy();
    G.positionContainerChildren(nodes[0]!, true);
    const after = nodes.map((n) => n.Box.Copy());
    for (const n of nodes) G.mirror(n, f.trial % 2 === 0, f.trial % 3 === 0);
    const mirrored = nodes.map((n) => n.Box.Copy());
    compare(
      JSON.parse(
        JSON.stringify({
          bounds,
          unrounded,
          fixed,
          childFixed,
          perNode,
          paddingFalse: spacing(paddingFalse),
          paddingTrue: spacing(paddingTrue),
          wrapped,
          after,
          mirrored,
          work: String(guard.Used()),
        }),
      ),
      f.expected,
    );
  },
);
