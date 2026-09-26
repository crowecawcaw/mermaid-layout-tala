import { readFileSync, writeFileSync } from 'node:fs';

const fixtures = JSON.parse(readFileSync(new URL('./shape-ports-expected.json', import.meta.url)));
const policies = fixtures.filter((item) => item.numColumns === 0).map((item) => ({
  shape: item.shape,
  groups: item.groups,
  indices: item.indices,
  centers: item.centers,
  centerBySide: item.centerBySide,
  mirrors: item.mirrors,
}));
writeFileSync(new URL('../../src/tala/shape-port-data.json', import.meta.url),
  JSON.stringify(policies, null, 2) + '\n');
