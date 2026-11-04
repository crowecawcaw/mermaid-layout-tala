import { Cluster } from '../src/upstream/layoutgraph/records.js';
import { clusterExactlyTwoExternalConnectedNodes } from '../src/upstream/placementcost/cluster.js';
import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-placementgeometry.json';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { Point } from '../src/upstream/geo/point.js';
import {
  TurnCost,
  CrossingCost,
  NonCenterPortCost,
} from '../src/upstream/layoutgraph/placement-cost.js';
import { AxisScore } from '../src/upstream/placementcost/axis.js';
import { flowContinuityCost } from '../src/upstream/placementcost/flow-continuity.js';
import {
  distanceToPoint,
  placementDistance,
  sizelessOrientation,
  directionCompass,
  compassDelta,
  compassAxisDelta,
} from '../src/upstream/placementcost/geometry.js';
import { compare } from './helpers/compare.js';
it.each(fixtures)(
  'matches Go placement geometry, alignment and flow costs $trial',
  (f) => {
    const g = new Graph();
    g.CellSize = f.cell;
    const all = f.nodes.map((r, j) => {
      const n = g.AddNode(new Node(BigInt(j + 1), r.width, r.height));
      n.TopLeft = new Point(r.point.x, r.point.y);
      return n;
    });
    for (const r of f.edges) {
      const e = g.Connect(all[r.from]!, all[r.to]!);
      e.SourceArrowhead = r.source;
      e.TargetArrowhead = r.target;
      e.IsInvisible = r.invisible;
    }
    const s = {
      nRepl: all[0]!.Edges.map(() => all[0] as Node | null),
      aRepl: all[0]!.Edges.map((e) => all[0]!.Adjacent(e) as Node | null),
    };
    if (f.trial % 13 === 0) s.aRepl[0] = null;
    if (f.trial % 17 === 0) s.nRepl[0] = all[1]!;
    const distances = [
        distanceToPoint(all[0]!, new Point(17.5, -28.25), false),
        distanceToPoint(all[0]!, new Point(17.5, -28.25), true),
        placementDistance(all[0]!, all[1]!, false),
        placementDistance(all[0]!, all[1]!, true),
      ],
      flow = flowContinuityCost(all[0]!, s);
    const cluster = new Cluster();
    cluster.Nodes = [all[0]!];
    cluster.EdgeAbductions = all[0]!.Edges.map((e) => ({
      Edge: e,
      CurrentFrom: e.From,
      CurrentTo: e.To,
      OriginallyFrom: e.From === all[0] ? all[0]! : null,
      OriginallyTo: e.To === all[0] ? all[0]! : null,
    }));
    const [first, second, two] =
        clusterExactlyTwoExternalConnectedNodes(cluster),
      c1 = directionCompass(f.trial % 9),
      c2 = directionCompass(Math.trunc(f.trial / 9) % 9);
    compare(
      {
        cluster: [Number(first?.ID ?? 0n), Number(second?.ID ?? 0n), two],
        compass: [c1, c2, compassDelta(c1, c2), compassAxisDelta(c1, c2)],
        axis: AxisScore(all),
        flow,
        distance: distances,
        orientation: sizelessOrientation(all[0]!, all[1]!),
        turn: TurnCost(g),
        crossing: CrossingCost(g),
        nonCenter: NonCenterPortCost(g),
      },
      f.expected,
    );
  },
);
