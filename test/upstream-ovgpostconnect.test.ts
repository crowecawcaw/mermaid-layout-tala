import { it, expect } from 'vitest';
import fixtures from './fixtures/upstream-ovgpostconnect.json';
import { Background } from '../src/upstream/limits/context.js';
import { Point } from '../src/upstream/geo/point.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Graph } from '../src/upstream/layoutgraph/graph.js';
import { Node } from '../src/upstream/layoutgraph/node.js';
import { OVG } from '../src/upstream/routing/ovg.js';
import { OVGNode } from '../src/upstream/routing/ovg-node.js';
import {
  OVGBuildGuard,
  defaultOVGBuildLimits,
} from '../src/upstream/routing/ovg-resource.js';
import {
  mapNodesToContainer,
  flagNodesNearPorts,
} from '../src/upstream/routing/ovg-postconnect.js';
it.each(fixtures)(
  'matches Go visibility post-connection scans $trial $limit',
  (f) => {
    const g = new Graph(),
      a = g.AddNode(new Node(1n, 110, 110)),
      b = g.AddNode(new Node(2n, 40, 40));
    a.TopLeft = new Point(0, 0);
    a.isContainer = true;
    b.TopLeft = new Point((f.trial % 5) * 10, (f.trial % 7) * 10);
    b.isContainer = true;
    b.Container = a;
    g.Containers.set(null, [a]);
    g.Containers.set(a, [b]);
    const ovg = new OVG(g.Nodes),
      nodes: OVGNode[] = [];
    for (let i = 0; i < 25; i++) {
      const n = ovg.AddNode(
        new OVGNode(new Point((i % 5) * 25, Math.trunc(i / 5) * 25)),
      );
      n.Index = i;
      nodes.push(n);
    }
    const ports: OVGNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if ((i + f.trial) % 11 === 0) {
        n.addPortOwner(a, Orientation.Top, false);
        ports.push(n);
      }
      if (i % 5 !== 4) ovg.Connect(n, nodes[i + 1]!);
      if (i < 20) ovg.Connect(n, nodes[i + 5]!);
    }
    ovg.Ports.set(a, ports);
    const guard = new OVGBuildGuard(Background, {
      ...defaultOVGBuildLimits(),
      work: BigInt(f.limit),
    });
    let error = '';
    try {
      mapNodesToContainer(ovg, g, guard);
      flagNodesNearPorts(ovg, guard);
    } catch (e) {
      error = (e as Error).message;
    }
    expect(error).toBe(f.error);
    expect(guard.work).toBe(BigInt(f.work));
    expect(
      nodes.map((n) => ({
        container: Number(n.Container?.ID ?? 0n),
        near: n.IsNearPort?.has(a) ?? false,
      })),
    ).toEqual(f.states);
  },
);
