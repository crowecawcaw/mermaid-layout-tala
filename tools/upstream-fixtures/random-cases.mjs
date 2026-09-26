import { writeFileSync } from 'node:fs';

// Stable, varied ordinary-node probes for the pinned Go differential harness.
let seed = 0x5a17c0de;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function pick(values) { return values[Math.floor(random() * values.length)]; }

const cases = [];
for (let index = 0; index < 32; index++) {
  const widthA = pick([30, 40, 50, 70]);
  const heightA = pick([20, 30, 50, 70]);
  const widthB = pick([30, 40, 50, 70]);
  const heightB = pick([20, 30, 50, 70]);
  const dx = pick([-240, -180, -120, -80, 0, 80, 120, 180, 240]);
  const dy = pick([-240, -180, -120, -80, 0, 80, 120, 180, 240]);
  if (Math.abs(dx) < Math.max(widthA, widthB) && Math.abs(dy) < Math.max(heightA, heightB)) continue;
  const nodes = [
    { id: 'a', width: widthA, height: heightA, x: 0, y: 0 },
    { id: 'b', width: widthB, height: heightB, x: dx, y: dy },
  ];
  if (random() < 0.6) {
    nodes.push({ id: 'c', width: pick([20, 30, 40]), height: pick([20, 30, 40]),
      x: pick([-120, -60, 0, 60, 120]), y: pick([-120, -60, 0, 60, 120]) });
  }
  cases.push({ name: `varied-${String(index).padStart(2, '0')}`,
    direction: pick(['', 'TB', 'BT', 'LR', 'RL']),
    nodes, edges: [{ from: 'a', to: 'b', directed: random() < 0.8 }] });
}
writeFileSync(new URL('./random-cases.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
