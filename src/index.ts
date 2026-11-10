import type { LayoutLoaderDefinition } from 'mermaid';

export * from './core.js';

const talaLayouts: LayoutLoaderDefinition[] = [
  {
    name: 'tala',
    loader: async () => await import('./render.js'),
  },
];

export default talaLayouts;
