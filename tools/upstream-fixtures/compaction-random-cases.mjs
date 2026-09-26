import { writeFileSync } from 'node:fs';

let seed = 0x0c0a9d12;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function pick(values) { return values[Math.floor(random() * values.length)]; }

const cases = [];
for (let index = 0; index < 30; index++) {
  const includeSizes = random() < 0.65;
  const positions = includeSizes ? [-160, -80, 0, 80, 160] : [-8, -4, 0, 4, 8];
  const nodes = Array.from({ length: 3 + index % 2 }, (_, i) => ({
    id: String.fromCharCode(97 + i), width: pick([20, 30, 40, 60]), height: pick([20, 30, 40, 60]),
    x: pick(positions), y: pick(positions), fixed: i === 0 && index % 7 === 0,
  }));
  const edges = [];
  for (let i = 1; i < nodes.length; i++) if (random() < 0.8) {
    edges.push({ from: nodes[i - 1].id, to: nodes[i].id });
  }
  cases.push({ name: `compaction-varied-${String(index).padStart(2, '0')}`,
    axis: pick(['x', 'y']), includeSizes, transition: includeSizes && index % 3 === 0,
    factor: pick([1, 1.5, 2, 3]), nodes, edges });
}
writeFileSync(new URL('./compaction-random-cases.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
