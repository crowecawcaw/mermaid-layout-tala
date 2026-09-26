import type { LayoutLoaderDefinition } from 'mermaid';

export {
  disposeTala,
  getTalaSeeds,
  layoutWithTala,
  setTalaSeeds,
  toD2,
  type TalaDirection,
  type TalaEdge,
  type TalaNode,
  type TalaOptions,
  type TalaResult,
} from './upstream.js';

const talaLayouts: LayoutLoaderDefinition[] = [
  {
    name: 'tala',
    loader: async () => await import('./render.js'),
  },
];

export default talaLayouts;
