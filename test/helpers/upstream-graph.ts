import { Graph } from '../../src/upstream/layoutgraph/graph.js';
import { Node } from '../../src/upstream/layoutgraph/node.js';
import { Edge } from '../../src/upstream/layoutgraph/edge.js';
import {
  Cluster,
  Sequence,
  Tree,
  Hierarchy,
  Label,
  Icon,
} from '../../src/upstream/layoutgraph/records.js';
import { Point } from '../../src/upstream/geo/point.js';
import { Orientation } from '../../src/upstream/geo/orientation.js';
import { Position } from '../../src/upstream/label/label.js';
export function build(trial: number): Graph {
  const g = new Graph(),
    all: Node[] = [],
    count = 8 + (trial % 17);
  for (let j = 0; j < count; j++) {
    const n = new Node(BigInt(j + 1), 60 + j, 40 + j);
    n.TopLeft = new Point(j * 100, trial);
    n.Graph = g;
    n.SetShape(['Square', 'Diamond', 'Table', 'Cloud'][j % 4]!);
    n.SetNumColumns(j % 5);
    n.D2ID = `node-${j}`;
    n.FontSize = 12 + j;
    n.Label = Object.assign(new Label(), {
      Text: n.D2ID,
      Position: j % 37,
      Width: j + 20,
      Height: 12,
    });
    n.Label.FixPosition();
    n.Icon = Object.assign(new Icon(), {
      Position: Position.InsideMiddleCenter,
    });
    n.Icon.FixPosition();
    n.LoopOffsets.set(Orientation.Top, 5);
    n.Is3D = j % 2 === 0;
    n.IsMultiple = j % 3 === 0;
    n.ForceHierarchy = j % 4 === 0;
    all.push(n);
  }
  const active = trial % 2 === 0,
    cv = new Node(1000n, 80, 60),
    sv = new Node(1001n, 90, 70);
  if (active) {
    cv.Graph = g;
    sv.Graph = g;
  }
  cv.isClusterVessel = true;
  const cluster = Object.assign(new Cluster(), {
    Vessel: cv,
    Nodes: all.slice(4, 6),
    Graph: g,
    Padding: 7,
    FixedSize: trial % 3 === 0,
    Arrangement: 'Row',
    DesiredArrangement: 'Column',
  });
  const sequence = Object.assign(new Sequence(), {
    Vessel: sv,
    Nodes: all.slice(2, 4),
    Graph: g,
  });
  for (const n of cluster.Nodes) n.Cluster = cluster;
  for (const n of sequence.Nodes) n.Sequence = sequence;
  g.Clusters.set(cv, cluster);
  g.Sequences.set(sv, sequence);
  for (let j = 0; j < count; j++) {
    if (active && j >= 2 && j < 6) continue;
    g.Nodes.push(all[j]!);
  }
  if (active) g.Nodes.push(cv, sv);
  g.Containers.set(null, g.Nodes.slice());
  for (let j = 1; j < count; j++) {
    const e = g.Connect(all[j - 1]!, all[j]!);
    e.ID = BigInt(j);
    e.Points = [new Point(j, trial), new Point(j + 10, trial + 20)];
    e.Label = Object.assign(new Label(), {
      Text: 'edge',
      Position: Position.UnlockedMiddle,
      Width: 20,
      Height: 10,
    });
    e.Label.FixPosition();
    e.LabelPercentage = 0.3;
    e.TargetArrowhead = 'triangle';
    e.IsCurve = true;
    e.MinWidth = 30;
    e.MinHeight = 10;
  }
  cluster.EdgeAbductions = [
    {
      Edge: g.Edges[0]!,
      OriginallyFrom: all[0]!,
      OriginallyTo: all[1]!,
      CurrentFrom: cv,
      CurrentTo: all[1]!,
    },
  ];
  sequence.EdgeAbductions = [
    {
      Edge: g.Edges[1]!,
      OriginallyFrom: all[1]!,
      OriginallyTo: all[2]!,
      CurrentFrom: all[1]!,
      CurrentTo: sv,
    },
  ];
  all[0]!.AddNear(all[count - 1]!);
  g.Hubs.set(all[0]!, [all[1]!, all[count - 1]!]);
  const h = new Hierarchy();
  h.ReplaceLevels(
    new Map([
      [all[0]!, 0],
      [all[1]!, 1],
    ]),
  );
  h.LevelCount = 2;
  all[0]!.Hierarchy = h;
  all[1]!.Hierarchy = h;
  const tn = new Node(2000n, 30, 20);
  tn.TopLeft = new Point(1, 2);
  tn.Graph = g;
  const te = new Edge(all[0]!, tn);
  te.ID = 3000n;
  const tree = new Tree(tn);
  tree.SentinelEdge = te;
  tree.Orientation = Orientation.Left;
  const child = new Node(2001n, 35, 25);
  child.Graph = g;
  child.TopLeft = new Point(3, 4);
  const ce = new Edge(tn, child);
  ce.ID = 3001n;
  const ct = new Tree(child);
  ct.SentinelEdge = ce;
  ct.Parent = tree;
  ct.Orientation = Orientation.Right;
  tree.Children = [ct];
  tn.AddNear(all[0]!);
  g.Trees.set(all[0]!, [tree]);
  g.Directions.set(null, trial % 9);
  g.Directions.set(all[0]!, Orientation.Bottom);
  g.CellSize = 20 + trial;
  g.IsRootHierarchy = trial % 3 === 0;
  g.crossingCost = 3;
  g.turnCost = 4;
  g.nonCenterPortCost = 5;
  return g;
}
