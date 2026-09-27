import { writeFileSync } from 'node:fs';

const directions = ['TB', 'BT', 'LR', 'RL'];
const node = (id, width = 70, height = 35, parentId, isGroup = false) =>
  ({ id, width, height, ...(parentId ? { parentId } : {}), ...(isGroup ? { isGroup } : {}) });
const edge = (id, from, to) => ({ id, from, to, directed: true });
const patterns = [
  {
    name: 'sibling-fan',
    nodes: [node('Cloud', 300, 200, undefined, true),
      node('API', 190, 150, 'Cloud', true), node('Worker', 190, 150, 'Cloud', true),
      node('A', 80, 40, 'API'), node('B', 90, 35, 'API'), node('C', 70, 50, 'API'),
      node('D', 75, 40, 'Worker'), node('E', 85, 45, 'Worker'),
      node('Client', 90, 45), node('DB', 90, 55)],
    edges: [edge('ca', 'Client', 'A'), edge('ab', 'A', 'B'), edge('ac', 'A', 'C'),
      edge('bd', 'B', 'D'), edge('ce', 'C', 'E'), edge('de', 'D', 'E'),
      edge('ed', 'E', 'DB')],
  },
  {
    name: 'nested-branch',
    nodes: [node('System', 320, 230, undefined, true),
      node('Front', 190, 150, 'System', true), node('Back', 210, 170, 'System', true),
      node('Auth', 150, 110, 'Back', true), node('UI', 90, 50, 'Front'),
      node('Gateway', 90, 45, 'Front'), node('Token', 70, 35, 'Auth'),
      node('Policy', 70, 35, 'Auth'), node('Queue', 90, 45, 'Back'),
      node('Store', 90, 50, 'Back'), node('Browser', 85, 45), node('Ops', 80, 40)],
    edges: [edge('bu', 'Browser', 'UI'), edge('ug', 'UI', 'Gateway'),
      edge('gt', 'Gateway', 'Token'), edge('gp', 'Gateway', 'Policy'),
      edge('tq', 'Token', 'Queue'), edge('pq', 'Policy', 'Queue'),
      edge('qs', 'Queue', 'Store'), edge('os', 'Ops', 'Store')],
  },
  {
    name: 'grouped-tree',
    nodes: [node('Group', 250, 180, undefined, true),
      node('Root', 90, 45, 'Group'), node('Left', 80, 40, 'Group'),
      node('Right', 80, 40, 'Group'), node('Leaf1', 70, 35, 'Group'),
      node('Leaf2', 70, 35, 'Group'), node('Input', 80, 40),
      node('Output', 80, 40)],
    edges: [edge('ir', 'Input', 'Root'), edge('rl', 'Root', 'Left'),
      edge('rr', 'Root', 'Right'), edge('ll', 'Left', 'Leaf1'),
      edge('r2', 'Right', 'Leaf2'), edge('lo', 'Leaf1', 'Output'),
      edge('ro', 'Leaf2', 'Output')],
  },
];
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const cases = patterns.flatMap((pattern, pi) => directions.map((direction, di) => ({
  name: `${pattern.name}-${direction}`, direction, seed: 1 + ((pi + di) % 3),
  // The Mermaid adapter canonicalizes IDs at its boundary. The Go oracle
  // must receive the same order for deterministic tie breaks.
  nodes: [...pattern.nodes].sort(byId), edges: [...pattern.edges].sort(byId),
})));
writeFileSync(new URL('./compound-stress-cases.json', import.meta.url),
  `${JSON.stringify(cases, null, 2)}\n`);
