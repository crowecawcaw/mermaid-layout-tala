import { readFileSync } from 'node:fs';
import { layoutFlowchart, routeEdges } from '../build/src/index.js';
const fixtures = [
  'upstream-layout.json',
  'upstream-layoutcorpus.json',
  'upstream-layoutfeatures.json',
  'upstream-layoutrandom.json',
  'upstream-layoutrandomextended.json',
  'upstream-layoutarrowheads.json',
  'upstream-layoutnodeoptions.json',
  'upstream-layoutarrowlabels.json',
  'upstream-layouttables.json',
  'upstream-layoutvisibility.json',
  'upstream-layoutlarge.json',
  'upstream-layoutproximity.json',
  'upstream-layoutsequence.json',
  'upstream-layoutstyles.json',
  'upstream-layoutordering.json',
].flatMap((file) =>
  JSON.parse(
    readFileSync(new URL(`../test/fixtures/${file}`, import.meta.url), 'utf8'),
  ),
);
const equal = (a, b) => Math.abs(a - b) <= 1e-7;
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
      if ('hasLabel' in node && (!found || (found.labelX !== undefined) !== node.hasLabel))
        differences.push(`node-label-presence:${node.id}`);
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
      if ('to' in edge && (!found || found.to !== edge.to)) differences.push(`edge-destination:${edge.id}`);
      if ('hasLabel' in edge && (!found || (found.labelPosition !== undefined) !== edge.hasLabel))
        differences.push(`edge-label-presence:${edge.id}`);
      const expected = edge.points,
        points = found?.points ?? [];
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
const rerouteFixtures = JSON.parse(
  readFileSync(new URL('../test/fixtures/upstream-layoutreroute.json', import.meta.url), 'utf8'),
);
const rerouteResults = rerouteFixtures.map((fixture) => {
  const differences = [];
  try {
    const actual = routeEdges(fixture.nodes, fixture.edges, fixture.selected, fixture.options);
    for (const edge of fixture.expected) {
      const found = actual.edges.find((candidate) => candidate.id === edge.id);
      if (!found) { differences.push(`edge:${edge.id}`); continue; }
      for (const key of ['to', 'isCurve', 'labelPosition', 'labelPercentage'])
        if (found[key] !== edge[key]) differences.push(`edge-${key}:${edge.id}`);
      const expectedPoints = edge.points, actualPoints = found.points ?? [];
      if (expectedPoints.length !== actualPoints.length || expectedPoints.some((point, i) =>
        !actualPoints[i] || !equal(point.x, actualPoints[i].x) || !equal(point.y, actualPoints[i].y)))
        differences.push(`route:${edge.id}`);
    }
  } catch (error) { differences.push(`error:${error.message}`); }
  return { name: fixture.name, passed: differences.length === 0, differences };
});
const reroutePassed = rerouteResults.filter((result) => result.passed).length;
const rerouteFailureFixtures = JSON.parse(
  readFileSync(new URL('../test/fixtures/upstream-layoutreroute-errors.json', import.meta.url), 'utf8'),
);
const rerouteFailureResults = rerouteFailureFixtures.map((fixture) => {
  try {
    routeEdges(fixture.nodes, fixture.edges, fixture.selected, fixture.options);
    return { name: fixture.name, passed: false, differences: ['expected an upstream failure'] };
  } catch (error) {
    const passed = error.message === fixture.error;
    return { name: fixture.name, passed, differences: passed ? [] : [`error:${error.message}`] };
  }
});
const rerouteFailurePassed = rerouteFailureResults.filter((result) => result.passed).length;
const failureFixtures = JSON.parse(
  readFileSync(new URL('../test/fixtures/upstream-layoutrandomextended-errors.json', import.meta.url), 'utf8'),
);
const failureResults = failureFixtures.map((fixture) => {
  try {
    layoutFlowchart(fixture.nodes, fixture.edges, fixture.options);
    return { name: fixture.name, passed: false, differences: ['expected an upstream failure'] };
  } catch (error) {
    const passed = error.message === fixture.error;
    return { name: fixture.name, passed, differences: passed ? [] : [`error:${error.message}`] };
  }
});
const failurePassed = failureResults.filter((result) => result.passed).length;
if (process.argv.includes('--json'))
  console.log(
    JSON.stringify({ passed, total: fixtures.length, results, failures: { passed: failurePassed, total: failureFixtures.length, results: failureResults }, rerouting: { passed: reroutePassed, total: rerouteFixtures.length, results: rerouteResults }, reroutingFailures: { passed: rerouteFailurePassed, total: rerouteFailureFixtures.length, results: rerouteFailureResults } }, null, 2),
  );
else {
  for (const result of results)
    console.log(
      `${result.passed ? 'PASS' : 'DIFF'} ${result.name}${result.passed ? '' : ` (${result.differences.join(', ')})`}`,
    );
  console.log(
    `Full-layout parity: ${passed}/${fixtures.length}; tolerance 1e-7; route vertices compared in order.`,
  );
  for (const result of failureResults)
    console.log(`${result.passed ? 'PASS' : 'DIFF'} failure-${result.name}${result.passed ? '' : ` (${result.differences.join(', ')})`}`);
  console.log(`Layout failure parity: ${failurePassed}/${failureFixtures.length}.`);
  for (const result of rerouteResults)
    console.log(`${result.passed ? 'PASS' : 'DIFF'} reroute-${result.name}${result.passed ? '' : ` (${result.differences.join(', ')})`}`);
  console.log(`Standalone rerouting parity: ${reroutePassed}/${rerouteFixtures.length}.`);
  for (const result of rerouteFailureResults)
    console.log(`${result.passed ? 'PASS' : 'DIFF'} reroute-failure-${result.name}${result.passed ? '' : ` (${result.differences.join(', ')})`}`);
  console.log(`Rerouting failure parity: ${rerouteFailurePassed}/${rerouteFailureFixtures.length}.`);
}
process.exitCode = passed === fixtures.length && failurePassed === failureFixtures.length && reroutePassed === rerouteFixtures.length && rerouteFailurePassed === rerouteFailureFixtures.length ? 0 : 1;
