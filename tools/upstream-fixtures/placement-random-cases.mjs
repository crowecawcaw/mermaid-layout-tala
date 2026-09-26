import { writeFileSync } from 'node:fs';

let state = 642837;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
};
const randomIndex = (length) => Math.floor(random() * length);

const cases = [];
for (let caseIndex = 0; caseIndex < 30; caseIndex++) {
  const count = 2 + randomIndex(6);
  const names = Array.from({ length: count }, (_, index) => String.fromCharCode(97 + index));
  const nodes = names.map((id) => ({
    id,
    width: 20 + 5 * randomIndex(10),
    height: 20 + 5 * randomIndex(10),
  }));
  const edges = [];
  for (let index = 1; index < count; index++) {
    edges.push({ from: names[randomIndex(index)], to: names[index], directed: random() < 0.8 });
  }
  for (let extra = 0; extra < randomIndex(3); extra++) {
    const first = randomIndex(count), second = randomIndex(count);
    if (first !== second && !edges.some((edge) =>
      edge.from === names[first] && edge.to === names[second]
      || edge.from === names[second] && edge.to === names[first])) {
      edges.push({ from: names[first], to: names[second], directed: random() < 0.8 });
    }
  }
  cases.push({
    name: `random-${String(caseIndex + 1).padStart(2, '0')}`,
    seed: 1 + randomIndex(15),
    direction: ['TB', 'BT', 'LR', 'RL', ''][randomIndex(5)],
    nodes,
    edges,
  });
}

writeFileSync(new URL('./placement-random-cases.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
