import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { traceShapeBorder } from '../src/tala/trace-shape-border.js';

interface Case { shape: string; topLeft: [number, number]; width: number; height: number;
  rect: [number, number]; prev: [number, number]; trace: [number, number] }
const expected = JSON.parse(readFileSync(new URL('../tools/upstream-fixtures/shape-trace-expected.json',
  import.meta.url), 'utf8')) as Case[];
const supported = new Set(['Square', 'RealSquare', 'Table', 'Class', 'Text', 'Code',
  'Image', 'Oval', 'Circle', 'Parallelogram', 'Hexagon', 'Step', 'Package', 'Callout',
  'Diamond', 'Document', 'Cylinder', 'Queue', 'StoredData', 'Page',
  'Person', 'C4Person', 'Cloud']);

describe('pinned upstream shape-border tracing', () => {
  for (const shape of supported) it(shape, () => {
    for (const item of expected.filter((entry) => entry.shape === shape)) {
      const point = traceShapeBorder(item.shape,
        { x: item.topLeft[0], y: item.topLeft[1], width: item.width, height: item.height },
        { x: item.rect[0], y: item.rect[1] },
        { x: item.prev[0], y: item.prev[1] });
      expect([point?.x, point?.y], JSON.stringify(item)).toEqual(item.trace);
    }
  });
});
