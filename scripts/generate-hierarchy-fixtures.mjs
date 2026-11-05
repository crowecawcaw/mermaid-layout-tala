import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pin = 'bf33790338b9854cb2a34418e69c17f9abf8de4b';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.argv[2];
if (!upstream)
  throw new Error(
    'Usage: node scripts/generate-hierarchy-fixtures.mjs /path/to/d2',
  );
const checkout = resolve(upstream);
const head = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
execFileSync('git', [
  '-C',
  checkout,
  'diff',
  '--quiet',
  'HEAD',
  '--',
  'd2layouts/d2talalayout',
  'd2graph',
  'lib',
]);
if (head !== pin) throw new Error(`Expected D2 ${pin}; found ${head}`);
const kind = process.argv[3] ?? 'hierarchy';
const packages = {
  hierarchy: 'internal/hierarchy',
  quality: 'internal/quality',
  layout: '',
  loops: 'internal/loops',
  loopoffsets: 'internal/loops',
  packing: 'internal/packing',
  geo: '../../lib/geo',
  label: '../../lib/label',
  trees: 'internal/trees',
  discovery: 'internal/trees',
  shapes: 'internal/nodeshape',
  shapegeometry: '../../lib/shape',
  cloning: 'internal/layoutgraph',
  preflight: 'internal/layoutgraph',
  snapshot: 'internal/layoutgraph',
  spatial: 'internal/layoutgraph',
  overlaps: 'internal/layoutgraph',
  nodegeometry: 'internal/layoutgraph',
  groupgeometry: 'internal/layoutgraph',
  transaction: 'internal/layoutgraph',
  treeplacement: 'internal/trees',
  graphbounds: 'internal/layoutgraph',
  proximity: 'internal/proximity',
  clusters: 'internal/grouping',
  gosort: 'internal/grouping',
  sequences: 'internal/grouping',
  lifecycle: 'internal/grouping',
  join: 'internal/grouping',
  subgraphs: 'internal/layoutgraph',
  abduction: 'internal/layoutgraph',
  combinationpreflight: 'internal/layoutgraph',
  combine: 'internal/packing',
  placementgeometry: 'internal/placementcost',
  placementmetrics: 'internal/placement',
  clusteralignment: 'internal/placement',
  clusterflip: 'internal/placement',
  childorder: 'internal/placement',
  containerorientation: 'internal/placement',
  transpose: 'internal/placement',
  optimizerindex: 'internal/placement',
  placementstages: 'internal/placement',
  labelmodel: 'internal/labeling',
  initialize: 'internal/placement',
  orthogonal: 'internal/placement',
  placenodes: 'internal/placement',
  placenested: 'internal/placement',
  edgelength: 'internal/placementcost',
  ports: 'internal/placementcost',
  routinggeometry: 'internal/routing',
  routingtrace: 'internal/routing',
  routingstage: 'internal/routing',
  routingsimplify: 'internal/routing',
  routingqueue: 'internal/routing',
  routingovg: 'internal/routing',
  routingedgeset: 'internal/routing',
  routingguard: 'internal/routing',
  routingsort: 'internal/routing',
  ovgresource: 'internal/routing',
  routingroute: 'internal/routing',
  routingtunnel: 'internal/routing',
  ovgports: 'internal/routing',
  ovgboundary: 'internal/routing',
  ovgportindex: 'internal/routing',
  ovgintersection: 'internal/routing',
  ovgedgepoints: 'internal/routing',
  ovgportboundary: 'internal/routing',
  ovgconnect: 'internal/routing',
  ovgpostconnect: 'internal/routing',
  routingtree: 'internal/routing',
  ovghierarchy: 'internal/routing',
  ovgbuild: 'internal/routing',
  ovgbuildmulti: 'internal/routing',
  routingsortedge: 'internal/routing',
  slingshotgeometry: 'internal/routing',
  routingbest: 'internal/routing',
  routingsharing: 'internal/routing',
  routingtable: 'internal/routing',
};
if (!(kind in packages))
  throw new Error(
    `Fixture kind must be one of: ${Object.keys(packages).join(', ')}`,
  );
const packagePath = `d2layouts/d2talalayout/${packages[kind]}`;
const target = resolve(checkout, packagePath, 'typescript_fixture_test.go');
if (existsSync(target)) throw new Error(`Refusing to overwrite ${target}`);
try {
  copyFileSync(
    resolve(root, `scripts/upstream/${kind}_fixture_test.go`),
    target,
  );
  execFileSync(
    process.env.TALA_GO ?? 'go',
    [
      'test',
      `./${packagePath}`,
      '-run',
      `^TestExportTypeScript${kind[0].toUpperCase()}${kind.slice(1)}Fixtures$`,
      '-count=1',
    ],
    {
      cwd: checkout,
      stdio: 'inherit',
      env: {
        ...process.env,
        [`TALA_${kind.toUpperCase()}_FIXTURES`]: resolve(
          root,
          `test/fixtures/upstream-${kind}.json`,
        ),
      },
    },
  );
} finally {
  rmSync(target, { force: true });
}
