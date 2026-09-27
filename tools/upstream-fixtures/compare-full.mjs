// Diagnostic comparison of completed upstream layouts and the current adapter.
// Build TypeScript first. This reports gaps; it is not an assertion of parity.
import { readFileSync } from 'node:fs';
import { layoutFlowchart } from '../../build/src/layout.js';

const cases = JSON.parse(readFileSync(new URL(process.argv[2] ?? './full-layout-cases.json', import.meta.url), 'utf8'));
const expected = JSON.parse(readFileSync(new URL(process.argv[3] ?? './full-layout-expected.json', import.meta.url), 'utf8'));
for (const [index, input] of cases.entries()) {
  let actual;
  try {
    actual = layoutFlowchart(input.nodes, input.edges, {
      direction: input.direction,
      strategy: 'tala',
      seeds: [input.seed],
    });
  } catch (error) {
    process.stdout.write(`${input.name}: ERROR ${error instanceof Error ? error.stack : error}\n`);
    continue;
  }
  const target = expected[index];
  const anchor = target.nodes[0];
  const actualAnchor = actual.nodes.find((node) => node.id === anchor.id);
  const deviations = target.nodes.map((node) => {
    const placed = actual.nodes.find((candidate) => candidate.id === node.id);
    const dx = (placed.x - placed.width / 2 - actualAnchor.x + actualAnchor.width / 2) - (node.x - anchor.x);
    const dy = (placed.y - placed.height / 2 - actualAnchor.y + actualAnchor.height / 2) - (node.y - anchor.y);
    return { id: node.id, dx, dy, dw: placed.width - node.width, dh: placed.height - node.height };
  });
  const exactNodes = deviations.filter((node) => Object.entries(node).every(([key, value]) => key === 'id' || value === 0)).length;
  const originX = actualAnchor.x - actualAnchor.width / 2 - anchor.x;
  const originY = actualAnchor.y - actualAnchor.height / 2 - anchor.y;
  const routeDeviations = (target.edges ?? []).flatMap((edge) => {
    const placed = actual.edges.find((candidate) => candidate.id === edge.id);
    const points = placed?.points.map((point) => ({ x: point.x - originX, y: point.y - originY }));
    return JSON.stringify(points) === JSON.stringify(edge.points) ? [] : [edge.id];
  });
  const routes = `${(target.edges ?? []).length - routeDeviations.length}/${(target.edges ?? []).length}`;
  process.stdout.write(`${input.name}: ${exactNodes}/${input.nodes.length} exact relative node geometries, ${routes} exact routes; ${JSON.stringify(deviations)}; route differences ${JSON.stringify(routeDeviations)}\n`);
}
