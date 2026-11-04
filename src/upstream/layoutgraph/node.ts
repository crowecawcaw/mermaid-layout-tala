// Translated portions of internal/layoutgraph/node.go and accessors at D2 bf337903.
// MPL-2.0. Copyright Terrastruct Inc. and contributors.
import { Point } from '../geo/point.js';
import { Box } from '../geo/box.js';
import { Orientation } from '../geo/orientation.js';
import type { Edge } from './edge.js';
import type { Graph } from './graph.js';
import {
  Icon,
  type EntityID,
  type Cluster,
  type Sequence,
  type Hierarchy,
  type HerdAssignment,
  type Label,
  type Spacing,
  type LongDistanceNeighborRequirements,
} from './records.js';
export class Node {
  D2ID: string | null = null;
  TopLeft: Point | null = null;
  Edges: Edge[] = [];
  Nears = new Set<Node>();
  Graph: Graph | null = null;
  FontSize: number | null = null;
  ForceHierarchy = false;
  Container: Node | null = null;
  Cluster: Cluster | null = null;
  Sequence: Sequence | null = null;
  HerdAssignment: HerdAssignment | null = null;
  Hierarchy: Hierarchy | null = null;
  Label: Label | null = null;
  Icon: Icon | null = null;
  FixedTopLeft: Point | null = null;
  DesiredWidth: number | null = null;
  DesiredHeight: number | null = null;
  LoopOffsets = new Map<Orientation, number>();
  margin: Spacing = { top: 0, bottom: 0, left: 0, right: 0 };
  padding: Spacing = { top: 0, bottom: 0, left: 0, right: 0 };
  isClusterVessel = false;
  isContainer = false;
  Is3D = false;
  IsMultiple = false;
  IsInvisible = false;
  LongDistanceNeighborRequirements = new Map<
    Node,
    LongDistanceNeighborRequirements
  >();
  constructor(
    public ID: EntityID,
    public Width: number,
    public Height: number,
  ) {}
  Center(): Point {
    return new Point(
      this.TopLeft!.X + this.Width / 2,
      this.TopLeft!.Y + this.Height / 2,
    );
  }
  Translate(dx: number, dy: number): void {
    this.TopLeft!.X += dx;
    this.TopLeft!.Y += dy;
  }
  Adjacent(edge: Edge): Node {
    return this === edge.From ? edge.To : edge.From;
  }
  IsContainer(): boolean {
    return this.isContainer;
  }
  IsClusterVessel(): boolean {
    return this.isClusterVessel;
  }
  SetClusterVessel(value: boolean): void {
    this.isClusterVessel = value;
  }
  AddIncidentEdgeUnchecked(edge: Edge): void {
    this.Edges.push(edge);
  }
  RemoveIncidentEdge(edge: Edge): void {
    const i = this.Edges.indexOf(edge);
    if (i !== -1) this.Edges.splice(i, 1);
  }
  HierarchyLevel(): number {
    return this.Hierarchy!.Levels().get(this) ?? 0;
  }
  InitIcon(): void {
    this.Icon = new Icon();
  }
  Box(): Box {
    return new Box(this.TopLeft!, this.Width, this.Height);
  }
}
