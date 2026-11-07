import test from 'node:test';
import assert from 'node:assert/strict';
import { Vault, nameOf, valueOf, redact, safeError, markerKey, markerName } from '../src/vault.js';
import { runWithSecrets, callWithSecrets, callArgs, bindValues } from '../src/execution.js';
import { requestBody, apply } from '../src/host.js';
import { validateMcpConfig, resolveMcpConfig, apply as mcpApply } from '../src/mcp.js';
const TOKEN = 'fixture_secret_7q9!';
function store() {
  const refs = new Map(), records = new Map();
  return {
    refs, records,
    async describe(name) { return { configured: refs.has(name), writable: true }; },
    async resolve(name) { return refs.has(name) ? { value: refs.get(name), source: 'fixture' } : undefined; },
    async set(name, value) { refs.set(name, value); }, async unset(name) { refs.delete(name); },
    async modifyRecord(key, mutate) { assert.match(key, /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/); const next = await mutate(records.get(key)); if (next !== undefined) records.set(key, next); return records.get(key); },
    async readRecord(key) { return records.get(key); }, async deleteRecord(key) { records.delete(key); },
    async listRecords() { return [...records].map(([key, record]) => ({ key, kind: record.kind })); },
  };
}
async function fixture() { const credentials = store(); const vault = new Vault(credentials); await vault.save({ name: 'API_TOKEN', value: TOKEN }); return { credentials, vault }; }
const exec = () => ({ name: 'vault_run', callId: 'call-fixture', rootCallId: 'root-fixture', token: Symbol('outer-call'), agent: { id: 'session-fixture', session: { id: 'session-fixture' } }, signal: new AbortController().signal, toolSet: {} });
test('validates names and values without reflecting sensitive values', () => {
  for (const name of ['A', 'TOKEN_1', '_TOKEN']) assert.equal(nameOf(name), name);
  for (const name of ['', 'X=evil', 'x-y', 'DSH_HOME', '__proto__', 'constructor', 'A'.repeat(129), null]) assert.throws(() => nameOf(name));
  for (const value of ['', 'a\0b', 'x'.repeat(32769), null]) assert.throws(() => valueOf(value));
  assert.equal(valueOf('multi\nline'), 'multi\nline');
  assert(!JSON.stringify(safeError(new Error(TOKEN))).includes(TOKEN));
});
test('marker keys obey native CredentialKey grammar and round-trip case without collisions', () => {
  for (const name of ['GITHUB_TOKEN', 'github_token', '_TOKEN', 'A', 'a']) {
    assert.match(markerKey(name), /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/);
    assert.equal(markerName(markerKey(name)), name);
  }
  assert.notEqual(markerKey('A'), markerKey('a'));
  assert.throws(() => markerName('pnpwin-token-vault/GITHUB_TOKEN'));
});
test('save/list/rotate/delete use native refs; inventory and markers have no values', async () => {
  const { credentials, vault } = await fixture();
  assert.equal((await credentials.resolve('API_TOKEN')).value, TOKEN);
  assert.equal(await vault.resolve('API_TOKEN'), TOKEN);
  assert.deepEqual(await vault.list(), { entries: [{ name: 'API_TOKEN', configured: true, writable: true }] });
  assert(!JSON.stringify([...credentials.records]).includes(TOKEN));
  await assert.rejects(vault.save({ name: 'API_TOKEN', value: 'new' }), /already-exists/);
  await vault.save({ name: 'API_TOKEN', value: 'new', replace: true });
  assert.equal(await vault.resolve('API_TOKEN'), 'new');
  assert.equal((await vault.remove({ name: 'API_TOKEN' })).ambientRemains, false);
  assert.deepEqual(await vault.list(), { entries: [] });
  await assert.rejects(vault.resolve('API_TOKEN'), /not-found/);
});
test('cannot resolve unregistered native credentials or overwrite them without acknowledgement', async () => {
  const credentials = store(), vault = new Vault(credentials);
  credentials.refs.set('FOREIGN', TOKEN);
  await assert.rejects(vault.resolve('FOREIGN'), /not-found/);
  await assert.rejects(vault.save({ name: 'FOREIGN', value: 'new' }), /already-exists/);
  assert.equal(credentials.refs.get('FOREIGN'), TOKEN);
});
test('failed persistence remains visible without reporting success or leaking diagnostics', async () => {
  const credentials = store(), vault = new Vault(credentials);
  credentials.set = async () => { throw new Error(TOKEN); };
  await assert.rejects(vault.save({ name: 'API_TOKEN', value: TOKEN }));
  assert.equal((await vault.list()).entries[0].configured, false);
});
test('redacts exact values from nested values and object keys', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(redact({ [TOKEN]: ['prefix ' + TOKEN, { value: TOKEN }] }, [TOKEN]))), { '[REDACTED]': ['prefix [REDACTED]', { value: '[REDACTED]' }] });
});
test('run refuses denied, unavailable or cancelled approvals before credential resolution/spawn', async () => {
  const { vault } = await fixture(); let resolutions = 0;
  vault.environment = async () => { resolutions++; throw new Error('must not read'); };
  for (const outcome of ['rejected', 'unavailable', 'cancelled']) await assert.rejects(runWithSecrets({ approval: { request: async () => outcome } }, vault, { names: ['API_TOKEN'], command: 'true', description: 'Test' }, exec()), /approval-/);
  assert.equal(resolutions, 0);
});
test('run injects only chosen names, preserves cwd/session sandbox/cancellation and masks output', async () => {
  const { vault } = await fixture(); let seen;
  const policy = { mode: 'workspace-write', workspaceRoot: '/workspace' };
  const ctx = {
    approval: { request: async request => { assert(!request.reason.includes(TOKEN)); return 'allowed-once'; } },
    workingDirectory: { ensure: async () => '/workspace' }, sandboxPolicy: { resolve: request => { assert.equal(request.session.id, 'session-fixture'); return policy; } },
    shellEnv: { collect: () => ({ DSH_TEST: 'fact' }) },
    shell: { resolve: spec => { seen = { ...spec, env: { ...spec.env } }; return spec; }, execute: async () => ({ result: async () => ({ exitCode: 0, signal: null, timedOut: false, aborted: false, stdout: { text: TOKEN, truncated: false }, stderr: { text: '', truncated: false } }) }) },
  };
  const result = await runWithSecrets(ctx, vault, { names: ['API_TOKEN'], command: 'some command', description: 'Test', workdir: 'child' }, exec());
  assert.deepEqual(seen.env, { API_TOKEN: TOKEN }); assert.equal(seen.sandboxPolicy, policy); assert.equal(seen.onExpiry, 'kill'); assert.equal(seen.workdir, '/workspace/child'); assert.equal(seen.timeoutMs, 30000); assert.equal(result.stdout, '[REDACTED]');
  assert.equal(process.env.API_TOKEN, undefined);
});
test('MCP binding validation blocks prototype pollution, overlapping paths and non-MCP tools', () => {
  const good = { tool: 'mcp__example__request', arguments: { nested: { token: '' } }, bindings: [{ name: 'API_TOKEN', path: ['nested', 'token'], prefix: 'Bearer ' }] };
  const parsed = callArgs(good);
  assert.equal(bindValues(parsed, { API_TOKEN: TOKEN }).nested.token, `Bearer ${TOKEN}`);
  assert.equal(good.arguments.nested.token, '');
  assert.throws(() => callArgs({ ...good, tool: 'bash' }), /mcp-tool-required/);
  assert.throws(() => callArgs({ ...good, bindings: [{ name: 'API_TOKEN', path: ['__proto__', 'token'] }] }));
  assert.throws(() => callArgs({ ...good, bindings: [{ name: 'API_TOKEN', path: ['a'] }, { name: 'API_TOKEN', path: ['a', 'b'] }] }));
});
test('MCP call uses nested public pipeline in native/PTC, preserves identity and masks canonical output', async () => {
  const { vault } = await fixture(); let preparedInput;
  const execution = exec();
  class Pipeline {
    async prepare(input) { preparedInput = input; return { kind: 'dispatch', exec: input }; }
    async dispatch(input) { assert.equal(input, preparedInput); return { kind: 'post-result', result: { isError: false, value: { echoed: TOKEN }, content: [{ type: 'text', text: TOKEN }] } }; }
    async complete(input, outcome) { assert.equal(input, preparedInput); return outcome.result; }
  }
  const ctx = { loader: { import: async name => { assert.equal(name, '@deepseek-ai/dsh-tools/pipeline'); return { ToolExecutionPipeline: Pipeline }; } }, approval: { request: async () => 'allowed-once' }, tools: {
    executable: (name, agent, toolSet) => { assert.equal(agent, execution.agent); assert.equal(toolSet, execution.toolSet); return {}; },
    execute: async () => { throw new Error('PTC rejects non-run_code roots; must not call a root executor batch'); },
  } };
  const result = await callWithSecrets(ctx, vault, { tool: 'mcp__example__request', arguments: { token: '' }, bindings: [{ name: 'API_TOKEN', path: ['token'] }] }, execution);
  assert.equal(preparedInput.parent, execution.token); assert.equal(preparedInput.rootCallId, execution.rootCallId); assert.equal(preparedInput.toolSet, execution.toolSet);
  assert.equal(preparedInput.arguments.token, TOKEN); assert.equal(result.results[0].result.value.echoed, '[REDACTED]'); assert.equal(result.results[0].result.content[0].text, '[REDACTED]');
  ctx.tools.executable = () => undefined;
  await assert.rejects(callWithSecrets(ctx, vault, { tool: 'mcp__example__request', arguments: {}, bindings: [{ name: 'API_TOKEN', path: ['token'] }] }, execution), /tool-unavailable/);
});
test('MCP startup adapter maps env/header refs and rejects header injection', async () => {
  const { vault } = await fixture();
  const config = validateMcpConfig({ mcp: { transport: 'streamable-http', serverName: 'test', url: 'https://example.invalid/mcp', headers: { authorization: 'literal' } }, headerRefs: { Authorization: { name: 'API_TOKEN', prefix: 'Bearer ' } } });
  const runtime = await resolveMcpConfig(vault, config);
  assert.deepEqual(runtime.headers, { Authorization: `Bearer ${TOKEN}` }); assert.equal(config.mcp.headers.authorization, 'literal');
  await vault.save({ name: 'API_TOKEN', value: 'bad\r\nvalue', replace: true });
  await assert.rejects(resolveMcpConfig(vault, config), /invalid-header-value/);
  assert.throws(() => validateMcpConfig({ mcp: { transport: 'stdio' }, headerRefs: { Authorization: { name: 'API_TOKEN' } } }));
});
test('adapter serializes rotations, stops old generation, and disposes cleanly', async () => {
  const { credentials } = await fixture(); const events = {}, disposers = [], configs = [];
  let disposed = 0;
  const ctx = { credentials, loader: { import: async () => ({ apply() {} }) }, on: (name, cb) => { events[name] = cb; }, effect: cb => { disposers.push(cb()); }, logger: { warn() {} }, plugin: (_native, config) => { configs.push(config); return { dispose: async () => { disposed++; } }; } };
  await mcpApply(ctx, { mcp: { transport: 'stdio', serverName: 'test' }, envRefs: { API_TOKEN: 'API_TOKEN' } });
  assert.equal(configs[0].env.API_TOKEN, TOKEN);
  await credentials.set('API_TOKEN', 'rotated'); events['credentials/reference-updated']('API_TOKEN');
  // Disposal awaits every queued transition; no sleeps/polling required.
  await disposers[0](); assert(disposed >= 1); assert(configs.length <= 2);
});
test('bounded JSON parser accepts JSON and rejects oversized/invalid bodies without contents', async () => {
  assert.deepEqual(await requestBody(new Request('http://test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"A"}' })), { name: 'A' });
  await assert.rejects(requestBody(new Request('http://test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: TOKEN })), /invalid-request/);
  await assert.rejects(requestBody(new Request('http://test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(65537) })), /request-too-large/);
});
test('Host routes share operations and return no secret; no save/get-value tools exist', async () => {
  const credentials = store(), routes = [], tools = [], cleanup = [];
  const ctx = { credentials, connection: { fetch: { register: route => { routes.push(route); return () => {}; } } }, tools: { register: tool => { tools.push(tool); return () => {}; } }, systemPrompt: { section: () => () => {} }, effect: fn => { cleanup.push(fn()); } };
  apply(ctx);
  assert.deepEqual(tools.map(t => t.name), ['vault_list', 'vault_run', 'vault_call']);
  const request = new Request('http://test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'API_TOKEN', value: TOKEN }) });
  const saved = await routes.find(r => r.path.endsWith('/save')).fetch(request);
  assert.equal(saved.status, 200); assert(!JSON.stringify(await saved.json()).includes(TOKEN));
  const listed = await tools[0].execute({}, exec()); assert.equal(listed.entries[0].name, 'API_TOKEN'); assert(!JSON.stringify(listed).includes(TOKEN));
  assert.equal(routes.some(r => /resolve|value/.test(r.path)), false);
});
