import type { RankNode } from './rank.js';
import type { TalaSeed } from './random.js';
import type { Context } from './upstream/limits/context.js';
import { layoutFlowchartTranslated } from './upstream/adapter/flowchart.js';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

/** D2 style fields that determine whether a node participates as visible. */
export interface NodeStyleInput {
  opacity?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
}

export interface LayoutNode extends RankNode {
  /** Original local D2 object ID when it differs from the unique API ID. */
  d2Id?: string;
  width: number;
  height: number;
  fixedSize?: boolean;
  shape?: string;
  tableColumns?: number;
  /** Whether the D2 object has class metadata, even if it has no members. */
  hasClassData?: boolean;
  /** Whether D2 grid rows or columns are set on this object. */
  isGrid?: boolean;
  nearId?: string;
  forceHierarchy?: boolean;
  label?: string;
  labelPosition?: string;
  icon?: string;
  iconPosition?: string;
  fontSize?: number;
  fixedPosition?: { x: number; y: number };
  isInvisible?: boolean;
  style?: NodeStyleInput;
  is3D?: boolean;
  isMultiple?: boolean;
  parentId?: string;
  isGroup?: boolean;
  direction?: LayoutDirection;
  labelWidth?: number;
  labelHeight?: number;
}

export interface ArrowheadLabel {
  text: string;
  width: number;
  height: number;
}

export interface EdgeStyleInput {
  opacity?: string;
  stroke?: string;
  fill?: string;
  fillPattern?: string;
  strokeWidth?: string;
  strokeDash?: string;
  borderRadius?: string;
  shadow?: string;
  threeDee?: string;
  multiple?: string;
  font?: string;
  fontSize?: string;
  fontColor?: string;
  animated?: string;
  bold?: string;
  italic?: string;
  underline?: string;
  filled?: string;
  doubleBorder?: string;
  textTransform?: string;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  /** D2 edge identity index; defaults to the count of earlier equivalent edges. */
  d2Index?: number | bigint;
  sourceArrowhead?: string;
  targetArrowhead?: string;
  /** D2 edge arrow flags, independent of arrowhead attributes. */
  sourceArrow?: boolean;
  targetArrow?: boolean;
  sourceArrowheadFilled?: boolean;
  targetArrowheadFilled?: boolean;
  sourceTableColumnIndex?: number;
  targetTableColumnIndex?: number;
  sourceArrowheadLabel?: ArrowheadLabel;
  targetArrowheadLabel?: ArrowheadLabel;
  style?: EdgeStyleInput;
  label?: string;
  isInvisible?: boolean;
  labelWidth?: number;
  labelHeight?: number;
}

export interface LayoutOptions {
  direction?: LayoutDirection;
  /** Input ordering; defaults to authored order as in D2. */
  inputOrder?: 'authored' | 'canonical';
  rootHierarchy?: boolean;
  rootSequence?: boolean;
  rootLevel?: number;
  context?: Context;
  nodeSpacing?: number;
  rankSpacing?: number;
  orderingPasses?: number;
  containerPadding?: number;
  seeds?: readonly TalaSeed[];
}

export interface Point {
  x: number;
  y: number;
}

export interface PositionedNode extends LayoutNode {
  x: number;
  y: number;
  rank: number;
  order: number;
  labelX?: number;
  labelY?: number;
  iconPosition?: string;
}

export interface PositionedEdge extends LayoutEdge {
  points: Point[];
  x: number;
  y: number;
  labelPosition?: string;
  labelPercentage?: number;
  isCurve?: boolean;
  sourceArrowheadLabelPosition?: Point;
  targetArrowheadLabelPosition?: Point;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
}

/** A node whose center is already positioned for standalone edge routing. */
export interface RoutingNode extends LayoutNode {
  x: number;
  y: number;
}

/** Existing edge geometry; selected edges may have no route yet. */
export interface RoutingEdge extends LayoutEdge {
  points?: Point[];
  labelPosition?: string;
  labelPercentage?: number;
  isCurve?: boolean;
}

export interface RoutingResult {
  nodes: RoutingNode[];
  edges: RoutingEdge[];
}

export interface RoutingOptions {
  direction?: LayoutDirection;
  rootHierarchy?: boolean;
  rootSequence?: boolean;
  rootLevel?: number;
  context?: Context;
}

interface WeightedEdge extends LayoutEdge {
  weight: number;
}

/** Lay out a Mermaid flowchart with the translated TALA engine. */
export function layoutFlowchart(
  inputNodes: readonly LayoutNode[],
  inputEdges: readonly LayoutEdge[],
  options: LayoutOptions = {},
): LayoutResult {
  return layoutFlowchartTranslated(inputNodes, inputEdges, options);
}
