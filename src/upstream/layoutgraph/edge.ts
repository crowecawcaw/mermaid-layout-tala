// Translated portions of internal/layoutgraph/edge.go at D2 bf337903. MPL-2.0.
// Copyright Terrastruct Inc. and contributors.
import type { Point } from '../geo/point.js';
import type { Node } from './node.js';
import {
  EdgeStyle,
  NoArrowhead,
  type EntityID,
  type Arrowhead,
  type Label,
} from './records.js';
export class Edge {
  D2ID: string | null = null;
  ID: EntityID = 0n;
  Points: Point[] = [];
  SourceArrowhead: Arrowhead = '';
  TargetArrowhead: Arrowhead = '';
  SourceArrowheadLabel: Label | null = null;
  TargetArrowheadLabel: Label | null = null;
  MinWidth = 0;
  MinHeight = 0;
  Label: Label | null = null;
  LabelPercentage = 0;
  IsCurve = false;
  FromTableColumnIndex: number | null = null;
  ToTableColumnIndex: number | null = null;
  IsInvisible = false;
  Style = new EdgeStyle();
  hierarchyRankWeight = 0;
  hierarchyRankWeightSet = false;
  constructor(
    public From: Node,
    public To: Node,
  ) {}
  SourcePort(): Point | null {
    return this.Points[0] ?? null;
  }
  TargetPort(): Point | null {
    return this.Points.at(-1) ?? null;
  }
  IsLoop(): boolean {
    return this.From === this.To;
  }
  HasSourceArrow(): boolean {
    return this.SourceArrowhead !== '' && this.SourceArrowhead !== NoArrowhead;
  }
  HasTargetArrow(): boolean {
    return this.TargetArrowhead !== '' && this.TargetArrowhead !== NoArrowhead;
  }
  IsDirected(): boolean {
    return this.HasSourceArrow() !== this.HasTargetArrow();
  }
  IsBidirectional(): boolean {
    return this.HasSourceArrow() && this.HasTargetArrow();
  }
  IsUndirected(): boolean {
    return !this.HasSourceArrow() && !this.HasTargetArrow();
  }
  DirectedEndpoints(): [Node | null, Node | null, boolean] {
    if (!this.IsDirected()) return [null, null, false];
    return this.HasSourceArrow()
      ? [this.To, this.From, true]
      : [this.From, this.To, true];
  }
  HasArrowTo(node: Node): boolean {
    return (
      (node === this.From && this.HasSourceArrow()) ||
      (node === this.To && this.HasTargetArrow())
    );
  }
  ArrowheadTo(node: Node): Arrowhead {
    return node === this.From ? this.SourceArrowhead : this.TargetArrowhead;
  }
  EquivalentStyles(other: Edge): boolean {
    return this.stylesMatchOneWay(other) && other.stylesMatchOneWay(this);
  }
  private stylesMatchOneWay(other: Edge): boolean {
    for (const key of [
      'Opacity',
      'Stroke',
      'StrokeWidth',
      'StrokeDash',
      'Animated',
    ] as const) {
      const value = this.Style[key];
      if (
        value !== null &&
        !(other.Style[key] !== null && other.Style[key]!.Value === value.Value)
      )
        return false;
    }
    return true;
  }
}
