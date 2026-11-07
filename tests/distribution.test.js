import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { packageRoot, validateDistribution } from '../src/build.mjs';
import * as root from '@pnpwin/dsh-token-vault';
import * as host from '@pnpwin/dsh-token-vault/host';
import * as api from '@pnpwin/dsh-token-vault/api';
import * as mcp from '@pnpwin/dsh-token-vault/mcp';
import * as dispatch from '../src/dispatch.js';
import * as execution from '../src/execution.js';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
test('src-only root policy, syntax, exports and packaged resources validate', async () => {
  const result = await validateDistribution();
  assert.equal(result.modules, 7);
  assert.equal(result.testModules, 2);
  assert.ok(result.publishFiles.includes('src/host.js'));
  assert.ok(result.publishFiles.includes('src/client.js'));
  assert.ok(result.publishFiles.includes('src/build.mjs'));
  assert.ok(result.publishFiles.includes('tests/vault.test.js'));
  assert.ok(result.publishFiles.includes('locale/en.json'));
  assert.ok(result.publishFiles.includes('locale/ru.json'));
  assert.ok(!result.rootEntries.some(name => /\.(?:[cm]?js|tsx?)$/.test(name)));
});
test('public package identities survive source migration and in-src execution compatibility is exact', () => {
  assert.equal(root.apply, host.apply);
  assert.equal(root.requestBody, host.requestBody);
  assert.equal(typeof api.Vault, 'function');
  assert.equal(typeof api.resolveEnvironment, 'function');
  assert.equal(typeof mcp.apply, 'function');
  assert.deepEqual(mcp.inject, ['credentials', 'loader']);
  for (const name of ['authorize', 'runArgs', 'runWithSecrets', 'callArgs', 'bindValues', 'callWithSecrets']) assert.equal(execution[name], dispatch[name]);
});
test('Client module registration keeps the package identity and native settings/locale dependencies', async () => {
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8');
  let registration;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { registration = value; } } } });
  assert.equal(registration.id, manifest.name); assert.equal(typeof registration.factory, 'function');
  assert.deepEqual(manifest.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-locale']);
  assert.ok(source.includes("ctx.slots.inject('settings.section'"));
});
test('every subpath has usable localized metadata and original packaged icon', async () => {
  for (const prefix of ['', '/host', '/mcp']) {
    const exported = prefix ? `.${prefix}` : '.';
    for (const language of ['en', 'ru']) {
      const relative = manifest.exports[`${exported}/locale/*.json`].replace('*', language);
      const metadata = JSON.parse(await readFile(path.join(packageRoot, relative), 'utf8'));
      assert.ok(metadata.meta.title); assert.ok(metadata.meta.description);
    }
    assert.equal(manifest.exports[`${exported}/icon`], './icon.svg');
  }
});
test('release source is portable and the packed manifest excludes private/generated trees', async () => {
  const result = await validateDistribution();
  const home = homedir();
  for (const file of result.publishFiles) {
    const text = await readFile(path.join(packageRoot, file), 'utf8');
    if (home.length > 1) assert.ok(!text.includes(home), `Machine-specific home path in ${file}`);
    assert.ok(!file.startsWith('node_modules/'));
    assert.ok(!file.startsWith('.git/'));
    assert.ok(!/\.(?:tgz|log)$/.test(file));
  }
  assert.equal(manifest.engines.dsh, '0.2.2-rc.1');
  assert.equal(manifest.repository.url, 'git+https://github.com/pnpwin/dsh-token-vault.git');
  assert.ok(!Object.keys(manifest.scripts).some(script => /^(?:preinstall|install|postinstall|prepare)$/.test(script)));
  assert.ok((await readdir(packageRoot)).includes('tests'));
});
