import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/upstream-shapes.json';
import { NewPolicy } from '../src/upstream/nodeshape/new-policy.js';
import {
  SetNumColumns,
  NumColumns,
  TablePortIndex,
  TableColumnPortValue,
} from '../src/upstream/nodeshape/shape_table.js';
import { LabelTier } from '../src/upstream/nodeshape/policy.js';
import { Orientation } from '../src/upstream/geo/orientation.js';
import { Box } from '../src/upstream/geo/box.js';
import { Point } from '../src/upstream/geo/point.js';
describe('direct upstream shape policy translation', () => {
  it.each(fixtures)(
    'matches all Go port groups and label preferences for $name',
    (f) => {
      const [s, kind, ok] = NewPolicy(
        f.type,
        new Box(new Point(-3.25, 17.5), f.width, f.height),
      );
      expect(ok).toBe(true);
      SetNumColumns(s!, f.columns);
      const preferences = [],
        portIndices = [],
        centerIndices = [];
      for (let tier = LabelTier.Good; tier <= LabelTier.Bad; tier++)
        preferences.push(
          [...s!.LabelPositionPreferences(tier)].sort((a, b) => a - b),
        );
      for (let o = Orientation.TopLeft; o <= Orientation.NONE; o++) {
        portIndices.push(s!.PortIndices(o));
        centerIndices.push(s!.CenterPortIndex(o));
      }
      const columns = f.expected.columns.map(({ column, orientation }) => {
        const [index, valid] = TablePortIndex(s!, orientation, column),
          [point, validPoint] = TableColumnPortValue(s!, orientation, column);
        return { column, orientation, index, valid, point, validPoint };
      });
      const actual = {
        kind,
        preferences,
        points: s!.SnapPointPercentages(),
        portIndices,
        centerIndices,
        centerPorts: s!.CenterPortIndices(),
        mirrored: Object.fromEntries(s!.MirroredPortIndices()),
        numColumns: NumColumns(s!),
        columns,
      };
      expect(JSON.parse(JSON.stringify(actual))).toEqual(f.expected);
    },
  );
  it('preserves unsupported types and invalid table-column behavior', () => {
    const box = new Box(new Point(0, 0), 80, 40);
    expect(NewPolicy('unsupported', box)).toEqual([null, 0, false]);
    const [square] = NewPolicy('', box),
      [table] = NewPolicy('Table', box);
    expect(TablePortIndex(square!, Orientation.Left, 0)).toEqual([0, false]);
    expect(() => TablePortIndex(table!, Orientation.Left, 1)).toThrow(
      'table column port index out of range',
    );
  });
});
