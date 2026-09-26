import { TalaNode, type TalaEdge } from './graph.js';

export const StepWedgeWidth = 35;

/** layoutgraph.SequenceAdvance, including the narrow-step wedge clamp. */
export function sequenceAdvance(width: number): number {
  if (width <= 0) return 0;
  return width - (width <= StepWedgeWidth ? width / 2 : StepWedgeWidth);
}

export interface SequenceEdgeAbduction {
  edge: TalaEdge;
  originallyFrom?: TalaNode;
  originallyTo?: TalaNode;
  currentFrom: TalaNode;
  currentTo: TalaNode;
}

/** The temporary vessel used by layoutgraph.Sequence. */
export class TalaSequence {
  readonly edgeAbductions: SequenceEdgeAbduction[] = [];
  readonly definingEdges: TalaEdge[] = [];

  constructor(readonly vessel: TalaNode, readonly nodes: TalaNode[],
    readonly container: TalaNode | null) {
    if (nodes.length < 2) throw new Error('sequence needs at least two steps');
    const maxHeight = Math.max(...nodes.map((node) => node.height));
    for (const node of nodes) {
      if (node.width <= StepWedgeWidth) node.width = 2 * StepWedgeWidth;
      node.height = maxHeight;
    }
    this.resize();
    this.placeVessel();
  }

  /** layoutgraph.Sequence.resizeWithWork. */
  resize(): void {
    let width = 0, offset = 0, height = 0;
    for (const node of this.nodes) {
      width = Math.max(width, offset + Math.max(0, node.width));
      offset += sequenceAdvance(node.width);
      height = Math.max(height, Math.max(0, node.height));
    }
    this.vessel.width = width;
    this.vessel.height = height;
  }

  /** layoutgraph.Sequence.PlaceVessel. */
  placeVessel(): void {
    if (this.nodes.some((node) => !node.topLeft)) return;
    this.vessel.topLeft = {
      x: Math.min(...this.nodes.map((node) => node.topLeft!.x)),
      y: Math.min(...this.nodes.map((node) => node.topLeft!.y)),
    };
  }

  /** layoutgraph.Sequence.ArrangeSteps. */
  arrangeSteps(): void {
    if (!this.vessel.topLeft) return;
    let x = this.vessel.topLeft.x;
    for (const node of this.nodes) {
      node.topLeft = { x, y: this.vessel.topLeft.y };
      node.x = x + node.width / 2;
      node.y = this.vessel.topLeft.y + node.height / 2;
      x += sequenceAdvance(node.width);
    }
  }

  syncGeometry(): void { this.resize(); this.arrangeSteps(); }
}
