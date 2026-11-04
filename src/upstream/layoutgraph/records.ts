// Graph-owned records translated from internal/layoutgraph at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import { Position } from '../label/label.js';
import { Orientation } from '../geo/orientation.js';
import type { Node } from './node.js';
import type { Graph } from './graph.js';
import type { Edge } from './edge.js';
export type EntityID = bigint;
export class Label {
  Text = '';
  Position = Position.Unset;
  Width = 0;
  Height = 0;
  private positionFixed = false;
  PositionFixed(): boolean {
    return this.positionFixed;
  }
  FixPosition(): void {
    this.positionFixed = true;
  }
}
export class Icon {
  Position = Position.Unset;
  private positionFixed = false;
  PositionFixed(): boolean {
    return this.positionFixed;
  }
  FixPosition(): void {
    this.positionFixed = true;
  }
}
export interface Spacing {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
export interface LongDistanceNeighborRequirements {
  EdgeCount: number;
  MaxWidth: number;
  MaxHeight: number;
}
export class Hierarchy {
  private level = new Map<Node, number>();
  LevelCount = 0;
  Levels(): Map<Node, number> {
    return this.level;
  }
  ReplaceLevels(levels: Map<Node, number>): void {
    this.level = levels;
  }
}
export class HerdAssignment {
  oppositeSidePaired = new Set<Node>();
  sameSidePaired = new Set<Node>();
  Orientation = Orientation.TopLeft;
  Val = 0;
  Copy(): HerdAssignment {
    const h = new HerdAssignment();
    h.oppositeSidePaired = new Set(this.oppositeSidePaired);
    h.sameSidePaired = new Set(this.sameSidePaired);
    h.Orientation = this.Orientation;
    h.Val = this.Val;
    return h;
  }
}
export interface EdgeAbduction {
  Edge: Edge;
  OriginallyFrom: Node | null;
  OriginallyTo: Node | null;
  CurrentFrom: Node | null;
  CurrentTo: Node | null;
}
export type ClusterArrangement = '' | 'Row' | 'Column';
export function FlipArrangement(a: ClusterArrangement): ClusterArrangement {
  return a === 'Row' ? 'Column' : 'Row';
}
export class Cluster {
  Vessel: Node | null = null;
  Nodes: Node[] = [];
  Arrangement: ClusterArrangement = '';
  DesiredArrangement: ClusterArrangement = '';
  Graph: Graph | null = null;
  EdgeAbductions: EdgeAbduction[] = [];
  Padding = 0;
  FixedSize = false;
  Container: Node | null = null;
}
export class Sequence {
  Vessel: Node | null = null;
  Nodes: Node[] = [];
  Graph: Graph | null = null;
  EdgeAbductions: EdgeAbduction[] = [];
  Container: Node | null = null;
}
export class Tree {
  Parent: Tree | null = null;
  Children: Tree[] = [];
  SentinelEdge: Edge | null = null;
  Orientation = Orientation.TopLeft;
  constructor(public Node: Node) {}
}
export type Arrowhead = string;
export const NoArrowhead = 'none',
  TriangleArrowhead = 'triangle';
export interface StyleScalar {
  Value: string;
}
export class EdgeStyle {
  Opacity: StyleScalar | null = null;
  Stroke: StyleScalar | null = null;
  Fill: StyleScalar | null = null;
  FillPattern: StyleScalar | null = null;
  StrokeWidth: StyleScalar | null = null;
  StrokeDash: StyleScalar | null = null;
  BorderRadius: StyleScalar | null = null;
  Shadow: StyleScalar | null = null;
  ThreeDee: StyleScalar | null = null;
  Multiple: StyleScalar | null = null;
  Font: StyleScalar | null = null;
  FontSize: StyleScalar | null = null;
  FontColor: StyleScalar | null = null;
  Animated: StyleScalar | null = null;
  Bold: StyleScalar | null = null;
  Italic: StyleScalar | null = null;
  Underline: StyleScalar | null = null;
  Filled: StyleScalar | null = null;
  DoubleBorder: StyleScalar | null = null;
  TextTransform: StyleScalar | null = null;
}
