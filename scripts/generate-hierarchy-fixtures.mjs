import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pin = 'bf33790338b9854cb2a34418e69c17f9abf8de4b';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.argv[2];
if (!upstream) throw new Error('Usage: node scripts/generate-hierarchy-fixtures.mjs /path/to/d2');
const checkout = resolve(upstream);
const head = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== pin) throw new Error(`Expected D2 ${pin}; found ${head}`);
const target = resolve(checkout, 'd2layouts/d2talalayout/internal/hierarchy/typescript_fixture_test.go');
if (existsSync(target)) throw new Error(`Refusing to overwrite ${target}`);
try {
  copyFileSync(resolve(root, 'scripts/upstream/hierarchy_fixture_test.go'), target);
  execFileSync(process.env.TALA_GO ?? 'go', ['test', './d2layouts/d2talalayout/internal/hierarchy', '-run', '^TestExportTypeScriptHierarchyFixtures$', '-count=1'], {
    cwd: checkout,
    stdio: 'inherit',
    env: { ...process.env, TALA_HIERARCHY_FIXTURES: resolve(root, 'test/fixtures/upstream-hierarchy.json') },
  });
} finally {
  rmSync(target, { force: true });
}
