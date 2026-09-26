import { writeFileSync } from 'node:fs';

let state = 0x59e28a17;
function next(limit) {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state % limit;
}
const cases = [];
const directions = ['TB', 'LR', 'BT', 'RL'];
for (let number = 0; number < 24; number++) {
  const count = 4 + next(7);
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: String.fromCharCode(65 + index),
    width: 40 + next(7) * 10,
    height: 25 + next(6) * 5,
  }));
  const edges = [];
  // Force a branch at the root, then grow an outward tree.
  for (let index = 1; index < count; index++) {
    const parent = index < 3 ? 0 : next(index);
    edges.push({
      id: `e${index}`,
      from: nodes[parent].id,
      to: nodes[index].id,
      directed: true,
    });
  }
  cases.push({ name: `tree-random-${number}`, direction: directions[number % 4], seed: 1 + next(3), nodes, edges });
}
writeFileSync(new URL('./full-tree-random-cases.json', import.meta.url), `${JSON.stringify(cases, null, 2)}\n`);
