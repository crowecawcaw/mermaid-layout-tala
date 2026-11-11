import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'tala-package-check-'));
try {
  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8' });
  const archive = join(temporary, JSON.parse(output)[0].filename);
  execFileSync('npm', ['install', '--ignore-scripts', '--omit=optional', '--offline', '--no-audit', '--no-fund', '--prefix', temporary, archive], { stdio: 'pipe' });
  if (existsSync(join(temporary, 'node_modules/mermaid'))) throw new Error('Standalone check unexpectedly installed Mermaid');
  const sample = `import { layoutGraph } from 'mermaid-layout-tala';
import { layoutGraph as coreLayoutGraph } from 'mermaid-layout-tala/core';
const nodes = [{ id: 'a', width: 40, height: 30 }, { id: 'b', width: 40, height: 30 }];
const edges = [{ id: 'e', from: 'a', to: 'b' }];
if (layoutGraph !== coreLayoutGraph || layoutGraph(nodes, edges).edges[0]!.points.length < 2) throw new Error('Standalone layout failed');
`;
  writeFileSync(join(temporary, 'check.mts'), sample);
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--ignoreConfig', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', 'check.mts'], { cwd: temporary, stdio: 'pipe' });
  writeFileSync(join(temporary, 'check.mjs'), sample.replace('edges[0]!.points', 'edges[0].points'));
  execFileSync(process.execPath, ['check.mjs'], { cwd: temporary, stdio: 'pipe' });
  const installed = JSON.parse(readFileSync(join(temporary, 'node_modules/mermaid-layout-tala/package.json'), 'utf8'));
  console.log(`Standalone ${installed.name}@${installed.version} compiled and ran without Mermaid.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
