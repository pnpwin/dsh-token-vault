import assert from 'node:assert/strict';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const ROOT_FILES = new Set(['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'icon.svg',
  'README.md', 'README.ru.md', 'LICENSE', 'UPSTREAM.md', 'AGENTS.md', 'CHANGELOG.md', 'SECURITY.md', 'CONTRIBUTING.md',
  '.gitignore', '.gitattributes', '.npmignore', '.editorconfig']);
const ROOT_DIRECTORIES = new Set(['src', 'tests', 'locale', '.git', '.github', 'node_modules']);

async function walk(root, directory) {
  const result = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    assert.ok(!entry.isSymbolicLink(), `Distribution sources cannot be symlinks: ${relative}`);
    if (entry.isDirectory()) result.push(...await walk(root, relative));
    else { assert.ok(entry.isFile(), `Expected regular source file: ${relative}`); result.push(relative); }
  }
  return result.sort();
}
function globMatches(pattern, candidate) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(candidate);
}
function included(manifest, relative) {
  return manifest.files.some(item => item.includes('*') ? globMatches(item, relative) : relative === item || relative.startsWith(`${item}/`));
}
export async function validateDistribution(root = packageRoot) {
  assert.equal(await realpath(root), path.resolve(root), 'Package root must be canonical');
  const roots = await readdir(root, { withFileTypes: true });
  for (const entry of roots) {
    assert.ok(!entry.isSymbolicLink(), `Unexpected root symlink: ${entry.name}`);
    assert.ok(entry.isDirectory() ? ROOT_DIRECTORIES.has(entry.name) : ROOT_FILES.has(entry.name), `Unexpected root entry: ${entry.name}; runtime and helpers belong in src/`);
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@pnpwin/dsh-token-vault');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.engines.dsh, '0.2.2-rc.1');
  assert.equal(manifest.exports['.'], './src/host.js');
  assert.equal(manifest.exports['./host'], manifest.exports['.']);
  assert.equal(manifest.exports['./client'], './src/client.js');
  assert.equal(manifest.exports['./mcp'], './src/mcp.js');
  assert.equal(manifest.exports['./api'], './src/vault.js');
  assert.ok(!Object.keys(manifest.scripts).some(name => ['install', 'preinstall', 'postinstall', 'prepare'].includes(name)), 'No installation scripts');
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0, 'Use native Host services, not a copied SDK');
  const files = ['package.json', ...roots.filter(entry => entry.isFile() && entry.name !== 'package.json').map(entry => entry.name),
    ...await walk(root, 'src'), ...await walk(root, 'tests'), ...await walk(root, 'locale')].sort();
  const sources = files.filter(file => /\.(?:js|mjs|cjs)$/.test(file));
  assert.ok(sources.every(file => file.startsWith('src/') || file.startsWith('tests/')), 'No root runtime/helper code');
  for (const [key, target] of Object.entries(manifest.exports)) {
    assert.ok(typeof target === 'string' && target.startsWith('./') && !target.split('/').includes('..'), `Unsafe export: ${key}`);
    const relative = target.slice(2);
    const matches = relative.includes('*') ? files.filter(file => globMatches(relative, file)) : [relative];
    assert.ok(matches.length, `Export has no files: ${key}`);
    for (const file of matches) {
      assert.ok((await lstat(path.join(root, file))).isFile(), `Export missing: ${file}`);
      assert.ok(included(manifest, file), `Export excluded from package.files: ${file}`);
    }
  }
  for (const required of ['src', 'tests', 'locale', 'README.md', 'README.ru.md', 'LICENSE', 'UPSTREAM.md', 'AGENTS.md']) assert.ok(manifest.files.includes(required), `Missing package.files entry: ${required}`);
  assert.ok(files.filter(file => file.startsWith('src/')).every(file => included(manifest, file)));
  const patch = await readFile(path.join(root, manifest.dsh.bundle.patch), 'utf8');
  assert.match(patch, /id: pnpwin-token-vault/);
  assert.match(patch, /name: ['"]@pnpwin\/dsh-token-vault['"]/);
  assert.equal(manifest.dsh.client.platform, 'web');
  for (const language of ['en', 'ru']) {
    const metadata = JSON.parse(await readFile(path.join(root, `locale/${language}.json`), 'utf8'));
    assert.ok(metadata.meta.title.trim()); assert.ok(metadata.meta.description.trim());
  }
  const icon = await readFile(path.join(root, 'icon.svg'));
  assert.ok(icon.length <= 256 * 1024); assert.match(icon.toString(), /<svg\b[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  for (const file of sources) {
    const checked = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(checked.status, 0, `Syntax check failed: ${file}\n${checked.stderr}`);
  }
  return { modules: sources.filter(file => file.startsWith('src/')).length, testModules: sources.filter(file => file.startsWith('tests/')).length,
    rootEntries: roots.map(entry => entry.name).sort(), publishFiles: files.filter(file => file === 'package.json' || included(manifest, file)) };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await validateDistribution();
  console.log(`Token Vault distribution OK: ${result.modules} src modules, ${result.testModules} test modules, ${result.publishFiles.length} publish files.`);
}
