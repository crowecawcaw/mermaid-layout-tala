import type { LayoutLoaderDefinition } from 'mermaid';

export { rankDag, type RankEdge, type RankNode } from './rank.js';
export {
  layoutFlowchart,
  type LayoutDirection,
  type LayoutEdge,
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
