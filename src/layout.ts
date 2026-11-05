import type { RankNode } from './rank.js';
import type { TalaSeed } from './random.js';
import { layoutFlowchartTranslated } from './upstream/adapter/flowchart.js';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface LayoutNode extends RankNode {
  width: number;
  height: number;
  fixedSize?: boolean;
  parentId?: string;
  isGroup?: boolean;
  direction?: LayoutDirection;
  labelWidth?: number;
  labelHeight?: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  sourceArrowhead?: string;
  targetArrowhead?: string;
  labelWidth?: number;
  labelHeight?: number;
}

export interface LayoutOptions {
  direction?: LayoutDirection;
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
}

export interface PositionedEdge extends LayoutEdge {
  points: Point[];
  x: number;
  y: number;
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
