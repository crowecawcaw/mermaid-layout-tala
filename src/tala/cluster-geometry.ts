import type { Point } from '../layout.js';
import { TalaNode } from './graph.js';

export type ClusterArrangement = 'Row' | 'Column';
const goRound = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);

function moveWithChildren(node: TalaNode, x: number, y: number): void {
  const previous = node.topLeft;
  if (!previous) { node.topLeft = { x, y }; return; }
  const dx = x - previous.x, dy = y - previous.y;
  const stack = [node];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.topLeft) {
      current.topLeft = { x: current.topLeft.x + dx, y: current.topLeft.y + dy };
      if (current.x !== undefined) current.x += dx;
      if (current.y !== undefined) current.y += dy;
    }
    stack.push(...current.children);
  }
}

/** layoutgraph.Cluster's geometry contract for a temporary placement vessel. */
export class TalaCluster {
  readonly vessel: TalaNode;
  readonly nodes: TalaNode[];
  arrangement: ClusterArrangement;
  desiredArrangement: ClusterArrangement;
  padding: number;
  fixedSize: boolean;

  constructor(vessel: TalaNode, nodes: TalaNode[], arrangement: ClusterArrangement,
    padding: number, fixedSize: boolean) {
    if (nodes.length < 2) throw new Error('cluster needs at least two nodes');
    this.vessel = vessel;
    this.nodes = nodes;
    this.arrangement = arrangement;
    this.desiredArrangement = arrangement;
    this.padding = padding;
    this.fixedSize = fixedSize;
    this.resize();
  }

  maximums(): { width: number; height: number } {
    return { width: Math.max(...this.nodes.map((node) => node.width)),
      height: Math.max(...this.nodes.map((node) => node.height)) };
  }

  /** Port of layoutgraph.Cluster.Resize. */
  resize(): void {
    if (!this.fixedSize) {
      const { width, height } = this.maximums();
      for (const node of this.nodes) { node.width = width; node.height = height; }
    }
    const { width, height } = this.maximums();
    if (this.arrangement === 'Row') {
      this.vessel.width = width * this.nodes.length + this.padding * (this.nodes.length - 1);
      this.vessel.height = height;
    } else {
      this.vessel.width = width;
      this.vessel.height = height * this.nodes.length + this.padding * (this.nodes.length - 1);
    }
  }

  /** Port of layoutgraph.Cluster.ArrangeClusterNodes. */
  arrangeNodes(): void {
    const origin = this.vessel.topLeft;
    if (!origin) return;
    if (this.arrangement === 'Row') {
      let position = origin.x;
      const center = origin.y + this.vessel.height / 2;
      for (const node of this.nodes) {
        const y = node.topLeft ? node.topLeft.y + goRound(center - (node.topLeft.y + node.height / 2))
          : goRound(center - node.height / 2);
        moveWithChildren(node, position, y);
        position += node.width + this.padding;
      }
    } else {
      let position = origin.y;
      const center = origin.x + this.vessel.width / 2;
      for (const node of this.nodes) {
        const x = node.topLeft ? node.topLeft.x + goRound(center - (node.topLeft.x + node.width / 2))
          : goRound(center - node.width / 2);
        moveWithChildren(node, x, position);
        position += node.height + this.padding;
      }
    }
  }

  syncGeometry(): void { this.resize(); this.arrangeNodes(); }

  /** Changes arrangement around the same vessel center. */
  flipAroundCenter(): void {
    const previous = this.vessel.topLeft ? { ...this.vessel.topLeft } : undefined;
    const oldWidth = this.vessel.width, oldHeight = this.vessel.height;
    this.arrangement = this.arrangement === 'Row' ? 'Column' : 'Row';
    this.resize();
    if (previous) {
      const point: Point = { x: previous.x + goRound((oldWidth - this.vessel.width) / 2),
        y: previous.y + goRound((oldHeight - this.vessel.height) / 2) };
      this.vessel.topLeft = point;
      this.arrangeNodes();
    }
  }
}
