import { writeFileSync } from 'node:fs';

let seed = 0x0f011a7a;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function pick(values) { return values[Math.floor(random() * values.length)]; }

const cases = [];
for (let index = 0; index < 20; index++) {
  const axis = index % 2 === 0 ? 'x' : 'y';
  const includeSizes = index % 4 !== 0;
  const count = 2 + index % 3;
  const step = includeSizes ? pick([160, 200, 240]) : pick([8, 10, 12]);
  const cross = includeSizes ? [-80, 0, 80] : [-2, 0, 2];
  const nodes = Array.from({ length: count }, (_, i) => {
    const along = i * step;
    const across = pick(cross);
    return { id: String.fromCharCode(97 + i), width: pick([30, 40, 50]), height: pick([20, 30, 40]),
      x: axis === 'x' ? along : across, y: axis === 'y' ? along : across,
      fixed: i === 0 && index % 7 === 0 };
  });
  const edges = [];
  for (let i = 1; i < count; i++) edges.push({ from: nodes[i - 1].id, to: nodes[i].id });
  if (count > 2 && index % 3 === 0) edges.push({ from: nodes[0].id, to: nodes.at(-1).id });
  cases.push({ name: `full-compaction-varied-${String(index).padStart(2, '0')}`,
    axis, includeSizes, transition: false, factor: pick([1, 1.5, 2, 3]), full: true, nodes, edges });
}
writeFileSync(new URL('./compaction-full-random-cases.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
