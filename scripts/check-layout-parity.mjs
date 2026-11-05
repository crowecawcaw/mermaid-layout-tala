import { readFileSync } from 'node:fs';
import { layoutFlowchart } from '../build/src/index.js';
const fixtures = [
  'upstream-layout.json',
  'upstream-layoutcorpus.json',
  'upstream-layoutfeatures.json',
  'upstream-layoutrandom.json',
  'upstream-layoutarrowheads.json',
  'upstream-layoutnodeoptions.json',
  'upstream-layoutarrowlabels.json',
  'upstream-layouttables.json',
  'upstream-layoutvisibility.json',
  'upstream-layoutlarge.json',
  'upstream-layoutproximity.json',
  'upstream-layoutsequence.json',
].flatMap((file) =>
  JSON.parse(
    readFileSync(new URL(`../test/fixtures/${file}`, import.meta.url), 'utf8'),
  ),
);
const equal = (a, b) => Math.abs(a - b) <= 1e-7;
function compact(points) {
  const result = [];
  for (const point of points) {
    const b = result.at(-1),
      a = result.at(-2);
    if (b && equal(b.x, point.x) && equal(b.y, point.y)) continue;
    if (
      a &&
      b &&
      ((equal(a.x, b.x) && equal(b.x, point.x)) ||
        (equal(a.y, b.y) && equal(b.y, point.y)))
    )
      result.pop();
    result.push(point);
  }
  return result;
}
let passed = 0;
const results = [];
for (const fixture of fixtures) {
  let differences = [];
  try {
    const actual = layoutFlowchart(
      fixture.nodes,
      fixture.edges,
      fixture.options,
    );
    if (actual.nodes.length !== fixture.expected.nodes.length)
      differences.push('node-count');
    if (actual.edges.length !== fixture.expected.edges.length)
      differences.push('edge-count');
    for (const node of fixture.expected.nodes) {
      const found = actual.nodes.find((n) => n.id === node.id);
      if (
        !found ||
        ['x', 'y', 'width', 'height'].some(
          (key) => !equal(node[key], found[key]),
        )
      )
        differences.push(`node:${node.id}`);
      for (const key of [
        'fontSize',
        'iconPosition',
        'labelPosition',
        'labelWidth',
        'labelHeight',
      ])
        if (key in node && (!found || node[key] !== found[key]))
          differences.push(`node-${key}:${node.id}`);
      if (
        'labelX' in node &&
        (!found ||
          !equal(node.labelX, found.labelX) ||
          !equal(node.labelY, found.labelY))
      )
        differences.push(`node-label:${node.id}`);
    }
    for (const edge of fixture.expected.edges) {
      const found = actual.edges.find((e) => e.id === edge.id);
      const expected = compact(edge.points),
        points = compact(found?.points ?? []);
      for (const key of [
        'sourceArrowheadLabelPosition',
        'targetArrowheadLabelPosition',
      ])
        if (
          key in edge &&
          (!found ||
            !found[key] ||
            !equal(edge[key].x, found[key].x) ||
            !equal(edge[key].y, found[key].y))
        )
          differences.push(`arrow-label:${edge.id}:${key}`);
      for (const key of ['isCurve', 'labelPosition', 'labelPercentage'])
        if (key in edge && (!found || edge[key] !== found[key]))
          differences.push(`edge-${key}:${edge.id}`);
      if (
        'labelX' in edge &&
        (!found || !equal(edge.labelX, found.x) || !equal(edge.labelY, found.y))
      )
        differences.push(`edge-label:${edge.id}`);
      if (
        expected.length !== points.length ||
        expected.some(
          (p, i) =>
            !points[i] || !equal(p.x, points[i].x) || !equal(p.y, points[i].y),
        )
      )
        differences.push(`route:${edge.id}`);
    }
  } catch (error) {
    differences.push(`error:${error.message}`);
  }
  if (!differences.length) passed++;
  results.push({
    name: fixture.name,
    passed: !differences.length,
    differences,
  });
}
if (process.argv.includes('--json'))
  console.log(
    JSON.stringify({ passed, total: fixtures.length, results }, null, 2),
  );
else {
  for (const result of results)
    console.log(
      `${result.passed ? 'PASS' : 'DIFF'} ${result.name}${result.passed ? '' : ` (${result.differences.join(', ')})`}`,
    );
  console.log(
    `Full-layout parity: ${passed}/${fixtures.length}; tolerance 1e-7; redundant collinear route vertices ignored.`,
  );
}
process.exitCode = passed === fixtures.length ? 0 : 1;
