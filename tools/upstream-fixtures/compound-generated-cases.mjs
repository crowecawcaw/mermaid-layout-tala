// Deterministic compound graphs for full-pipeline differential comparisons.
import { writeFileSync } from 'node:fs';

const cases = [];
for (const direction of ['TB', 'BT', 'LR', 'RL']) {
  for (const count of [2, 3, 4]) {
    const nodes = [{ id: 'Group', width: 185 + 10 * count,
      height: 125 + 15 * count, isGroup: true }];
    for (let i = 0; i < count; i++) {
      nodes.push({ id: `N${i}`, parentId: 'Group',
        width: 58 + 12 * (i % 3), height: 32 + 7 * (i % 2) });
    }
    nodes.push({ id: 'Input', width: 75, height: 43 });
    nodes.push({ id: 'Output', width: 82, height: 38 });
    const edges = [{ id: 'entry', from: 'Input', to: 'N0', directed: true }];
    for (let i = 1; i < count; i++) {
      edges.push({ id: `chain${i}`, from: `N${i - 1}`, to: `N${i}`, directed: true });
    }
    edges.push({ id: 'exit', from: `N${count - 1}`, to: 'Output', directed: true });
    if (count >= 3) edges.push({ id: 'bypass', from: 'N0', to: 'Output', directed: true });
    cases.push({ name: `chain-${direction}-${count}`, direction,
      seed: 1 + count, nodes, edges });
  }
}
writeFileSync(new URL('./compound-generated-cases.json', import.meta.url),
  JSON.stringify(cases, null, 2) + '\n');
