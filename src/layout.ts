import type { RankNode } from './rank.js';
import type { TalaSeed } from './random.js';
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
  width: number;
  height: number;
  fixedSize?: boolean;
  shape?: string;
  tableColumns?: number;
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
  /** D2 edge identity index; defaults to the edge's position in the input. */
  d2Index?: number;
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
  /** Preserve authored node and edge order as D2 does. Defaults to canonical order. */
  inputOrder?: 'authored' | 'canonical';
  rootHierarchy?: boolean;
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
