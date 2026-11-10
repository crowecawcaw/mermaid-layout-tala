import { expect, it } from 'vitest';
import fixtures from './fixtures/upstream-layoutarrowvalidation.json';
import { translateFlowchart } from '../src/upstream/adapter/flowchart.js';

it.each(fixtures)('matches Go arrowhead validation for $shape', ({ shape, valid }) => {
  const nodes = ['a', 'b'].map((id) => ({ id, width: 40, height: 30 }));
  const invoke = () => translateFlowchart(nodes, [{ id: 'e', from: 'a', to: 'b', sourceArrowhead: shape }], {});
  if (valid) expect(invoke).not.toThrow();
  else expect(invoke).toThrow(/unsupported source arrowhead/);
});
