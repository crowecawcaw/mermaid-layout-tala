import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { centerPort, shapePortGroups, shapePortPolicy, shapePorts, tableColumnPortIndex,
  type PortSide, type ShapePortPolicy } from '../src/tala/shape-ports.js';
import { TalaGraph } from '../src/tala/graph.js';

interface Fixture extends ShapePortPolicy { numColumns: number; ports: Array<{ x: number; y: number }> }
const fixtures = JSON.parse(readFileSync(new URL(
  '../tools/upstream-fixtures/shape-ports-expected.json', import.meta.url), 'utf8')) as Fixture[];
interface DimensionFixture { shape: string; width: number; height: number;
  groups: Array<Array<{ x: number; y: number }>>; ports: Array<{ x: number; y: number }> }
const dimensionFixtures = JSON.parse(readFileSync(new URL(
  '../tools/upstream-fixtures/shape-port-dimensions-expected.json', import.meta.url), 'utf8')) as DimensionFixture[];

describe('upstream nodeshape port policy', () => {
  for (const fixture of fixtures) {
    it(`matches ${fixture.shape} with ${fixture.numColumns} table columns`, () => {
      const { ports, numColumns, ...expectedPolicy } = fixture;
      expect(shapePortPolicy(fixture.shape, numColumns)).toEqual(expectedPolicy);
      expect(shapePorts(fixture.shape, { x: 37, y: 29 }, 101, 83, numColumns)).toEqual(ports);
      for (const side of ['top', 'left', 'bottom', 'right'] as PortSide[]) {
        const expected = fixture.centerBySide[side];
        expect(centerPort(fixture.shape, side, { x: 37, y: 29 }, 101, 83, numColumns))
          .toEqual(expected >= 0 ? fixture.ports[expected] : undefined);
      }
    });
  }

  for (const fixture of dimensionFixtures) {
    it(`matches ${fixture.shape} ports at ${fixture.width}x${fixture.height}`, () => {
      const groups = shapePortGroups(fixture.shape, { x: 37, y: 29 }, fixture.width, fixture.height);
      expect(groups).toEqual(fixture.groups.map((group) => group.map((relative) => ({
        x: 37 + Math.round(fixture.width * relative.x),
        y: 29 + Math.round(fixture.height * relative.y),
      }))));
      expect(groups.flat()).toEqual(fixture.ports);
    });
  }

  it('uses row-specific port indices for table columns', () => {
    expect(tableColumnPortIndex(3, 'left', 2)).toBe(5);
    expect(tableColumnPortIndex(3, 'right', 2)).toBe(11);
    expect(tableColumnPortIndex(0, 'right', 0)).toBe(7);
    expect(() => tableColumnPortIndex(3, 'left', 3)).toThrow();
  });

  it('retains table row metadata through graph cloning', () => {
    const graph = TalaGraph.fromFlowchart([
      { id: 'A', width: 100, height: 120, shape: 'Table', numColumns: 3 },
      { id: 'B', width: 100, height: 120, shape: 'Table', numColumns: 3 },
    ], [{ id: 'AB', from: 'A', to: 'B', fromTableColumnIndex: 0, toTableColumnIndex: 2 }]);
    expect(graph.clone().toLayoutEdges()[0]).toMatchObject({
      fromTableColumnIndex: 0, toTableColumnIndex: 2,
    });
    expect(graph.clone().toLayoutNodes()).toEqual(graph.toLayoutNodes());
  });
});
