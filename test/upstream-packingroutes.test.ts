import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-packingroutes.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import {
  newWorkGuard,
  allEdgesHaveCompleteRoutesGuarded,
} from '../src/upstream/packing/guard.js';
it.each(fixtures)('matches Go packing route inventory $trial', (f) => {
  const g = new Graph(),
    nodes: Node[] = [];
  for (let i = 0; i < 3; i++) {
    const n = g.AddNode(new Node(BigInt(i + 1), 40, 30));
    n.TopLeft = new Point(i * 150, 0);
    nodes.push(n);
  }
  g.Containers.set(null, nodes);
  const e = g.Connect(nodes[0]!, nodes[1]!),
    edge2 = g.Connect(nodes[1]!, nodes[2]!);
  switch (f.trial % 5) {
    case 1:
      e.Points = [new Point(40, 15), new Point(150, 15)];
      break;
    case 2:
      e.Points = [new Point(40, 15), new Point(150, 15)];
      edge2.Points = [new Point(190, 15), new Point(300, 15)];
      break;
    case 3:
      e.Points = [new Point(40, 15)];
      break;
    case 4:
      nodes[0]!.Edges.push(e);
  }
  const guard = newWorkGuard(Background, 1000000n);
  let routed = false,
    incident: number[] = [],
    error = '';
  try {
    const [value, edges] = allEdgesHaveCompleteRoutesGuarded(g, null, guard);
    routed = value;
    incident = (edges ?? []).map((e) => Number(e.ID));
  } catch (e) {
    error = (e as Error).message;
  }
  expect({ routed, incident, error, work: Number(guard.Used()) }).toEqual({
    routed: f.routed,
    incident: f.incident,
    error: f.error,
    work: f.work,
  });
});
