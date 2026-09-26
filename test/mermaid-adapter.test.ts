import mermaid, { type InternalHelpers, type LayoutData, type SVG } from 'mermaid';
import { describe, expect, it, vi } from 'vitest';
import talaLayouts from '../src/index.js';
import { render } from '../src/render.js';

describe('Mermaid adapter', () => {
  it('registers as an external Mermaid layout loader', async () => {
    expect(talaLayouts[0]?.name).toBe('tala');
    mermaid.registerLayoutLoaders(talaLayouts);
    const algorithm = await talaLayouts[0]!.loader();
    expect(typeof algorithm.render).toBe('function');
  });

  it('measures nodes and returns routed edge points through Mermaid helpers', async () => {
    const transforms = new Map<string, string>();
    const routedEdges: Array<{ id: string; points?: Array<{ x: number; y: number }> }> = [];
    const selection = {
      select: vi.fn(() => selection),
      insert: vi.fn(() => selection),
      attr: vi.fn(() => selection),
    };
    const svg = selection as unknown as SVG;
    const helpers = {
      insertMarkers: vi.fn(),
      insertNode: vi.fn(async (_parent, node: { id: string; width?: number; height?: number }) => ({
        node: () => ({ getBBox: () => ({ width: node.width ?? 60, height: node.height ?? 30 }) }),
        attr: (_name: string, value: string) => { transforms.set(node.id, value); },
      })),
      insertEdgeLabel: vi.fn(async () => undefined),
      insertEdge: vi.fn((_parent, edge: { id: string; points?: Array<{ x: number; y: number }> }) => {
        routedEdges.push(edge);
        return { updatedPath: {}, originalPath: {} };
      }),
      positionEdgeLabel: vi.fn(),
      log: { debug: vi.fn() },
    } as unknown as InternalHelpers;
    const data = {
      nodes: [
        { id: 'A', isGroup: false, width: 60, height: 30 },
        { id: 'B', isGroup: false, width: 80, height: 40 },
      ],
      edges: [{ id: 'e1', start: 'A', end: 'B' }],
      config: { flowchart: {} },
      direction: 'TB',
      markers: [],
      type: 'flowchart-v2',
      diagramId: 'smoke',
    } as unknown as LayoutData;

    await render(data, svg, helpers);

    expect(transforms.get('A')).toMatch(/^translate\(/);
    expect(transforms.get('B')).toMatch(/^translate\(/);
    expect(routedEdges[0]?.points).toHaveLength(3);
    expect(new Set(routedEdges[0]?.points?.map(({ x, y }) => `${x},${y}`)).size).toBe(3);
    expect(helpers.positionEdgeLabel).toHaveBeenCalledOnce();
  });
});
