export * from './core.js';

// Keep the root declaration usable without the optional Mermaid peer. The
// loader is structurally compatible with Mermaid's LayoutLoaderDefinition.
type LayoutLoaderDefinition = {
  name: string;
  loader: () => Promise<{ render: (...args: any[]) => Promise<void> }>;
};

const talaLayouts: LayoutLoaderDefinition[] = [
  {
    name: 'tala',
    loader: async () => await import('./render.js'),
  },
];

export default talaLayouts;
