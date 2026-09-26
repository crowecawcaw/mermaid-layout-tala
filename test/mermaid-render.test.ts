// @vitest-environment jsdom
import mermaid from 'mermaid';
import { beforeAll, describe, expect, it } from 'vitest';
import talaLayouts from '../src/index.js';

describe('Mermaid render integration', () => {
  let talaLoaderCalled = false;
  beforeAll(() => {
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value(this: SVGElement) {
        const text = this.textContent?.trim() ?? '';
        return { x: 0, y: 0, width: Math.max(48, text.length * 8), height: 36 };
      },
    });
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value(this: SVGElement) { return (this.textContent?.length ?? 0) * 8; },
    });
    const talaDefinition = talaLayouts[0]!;
    mermaid.registerLayoutLoaders([{
      ...talaDefinition,
      loader: async () => {
        talaLoaderCalled = true;
        return talaDefinition.loader();
      },
    }]);
  });

  it('renders real Mermaid flowcharts with finite routed paths', async () => {
    mermaid.initialize({ startOnLoad: false, layout: 'tala' });
    const diagrams = [
      'flowchart TD\n  A[Start] --> B[Finish]\n  A --> C[Review]\n  B --> D[Done]\n  C --> D',
      'flowchart LR\n  A[Client] -->|primary| B[Gateway]\n  A -->|retry| B\n  B --> C[Service]\n  C --> B\n  C --> C',
      'flowchart RL\n  A[Webhook] --> B[Queue]\n  B --> C[Normalize]\n  C -->|valid| D[Store]\n  C -->|invalid| E[Dead letter]',
    ];
    for (const [index, source] of diagrams.entries()) {
      const result = await mermaid.render(`tala-layout-smoke-${index}`, source);
      expect(result.svg).toContain(`tala-layout-smoke-${index}`);
      expect(result.svg).toContain('edgePaths');
      expect(result.svg).toContain('translate(');
      expect(result.svg).not.toContain('NaN');
    }
    expect(talaLoaderCalled).toBe(true);
  });
});
