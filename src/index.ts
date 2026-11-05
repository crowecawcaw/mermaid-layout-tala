import type { LayoutLoaderDefinition } from 'mermaid';

export { setTalaSeeds, getTalaSeeds, type TalaSeed } from './random.js';
export { evaluateLayout, type LayoutScore } from './quality.js';

export { rankDag, type RankEdge, type RankNode } from './rank.js';
export {
  layoutFlowchart,
  type LayoutDirection,
  type LayoutEdge,
  type ArrowheadLabel,
  type EdgeStyleInput,
  type LayoutNode,
  type LayoutOptions,
  type LayoutResult,
  type Point,
  type PositionedEdge,
  type PositionedNode,
} from './layout.js';

const talaLayouts: LayoutLoaderDefinition[] = [
  {
    name: 'tala',
    loader: async () => await import('./render.js'),
  },
];

export default talaLayouts;
