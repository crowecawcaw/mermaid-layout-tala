import { writeFileSync } from 'node:fs';

const patterns = [
  { levels: [1, 2, 2, 1], direction: 'TB', seed: 1 },
  { levels: [1, 2, 2, 1], direction: 'LR', seed: 2 },
  { levels: [1, 3, 3, 1], direction: 'TB', seed: 3 },
  { levels: [1, 3, 3, 1], direction: 'RL', seed: 1 },
  { levels: [1, 2, 3, 2, 1], direction: 'BT', seed: 2 },
  { levels: [1, 2, 3, 2, 1], direction: 'LR', seed: 3 },
  { levels: [1, 2, 2, 2, 2, 1], direction: 'TB', seed: 2 },
  { levels: [1, 2, 2, 2, 2, 1], direction: 'RL', seed: 3 },
  { levels: [1, 2, 2, 1], direction: 'TB', seed: 2, skips: [[0, 2]] },
  { levels: [1, 2, 2, 1], direction: 'LR', seed: 3, skips: [[0, 3], [1, 3]] },
  { levels: [1, 2, 3, 2, 1], direction: 'BT', seed: 1, skips: [[0, 2], [1, 3]] },
  { levels: [1, 2, 3, 2, 1], direction: 'RL', seed: 2, skips: [[0, 4], [1, 3]] },
];

const cases = patterns.map(({ levels, direction, seed, skips = [] }, caseIndex) => {
  const rows = levels.map((count, level) => Array.from({ length: count }, (_unused, index) =>
    `L${level}_${index}`));
  const nodes = rows.flat().map((id, index) => ({ id,
    width: 60 + (index * 13 + caseIndex * 7) % 5 * 17,
    height: 30 + (index * 11 + caseIndex * 3) % 4 * 9,
  }));
  const edges = [];
  for (let level = 0; level < rows.length - 1; level++) {
    for (const from of rows[level]) for (const to of rows[level + 1]) {
      edges.push({ id: `e${String(edges.length + 1).padStart(3, '0')}`,
        from, to, directed: true });
    }
  }
  for (const [fromLevel, toLevel] of skips) {
    edges.push({ id: `e${String(edges.length + 1).padStart(3, '0')}`,
      from: rows[fromLevel][0], to: rows[toLevel][0], directed: true });
  }
  return { name: `layered-${caseIndex + 1}`, direction, seed, nodes, edges };
});

writeFileSync(new URL('./hierarchy-generated-cases.json', import.meta.url),
  JSON.stringify(cases, null, 2) + '\n');
