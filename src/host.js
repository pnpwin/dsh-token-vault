import { Vault, VaultError, safeError } from './vault.js';
import { runWithSecrets, callWithSecrets } from './dispatch.js';
export const inject = ['credentials', 'connection', 'tools', 'approval', 'shell', 'sandboxPolicy', 'shellEnv', 'workingDirectory', 'systemPrompt', 'loader'];
const str = { type: 'string' };
const binding = { type: 'object', additionalProperties: false, required: ['name', 'path'], properties: { name: str, path: { type: 'array', items: { oneOf: [str, { type: 'integer' }] } }, prefix: str, suffix: str } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
export async function requestBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new VaultError('invalid-request');
  if (Number(request.headers.get('content-length')) > 65536) throw new VaultError('request-too-large');
  const reader = request.body?.getReader();
  if (!reader) throw new VaultError('invalid-request');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > 65536) throw new VaultError('request-too-large');
      chunks.push(Buffer.from(chunk.value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new VaultError('invalid-request'); }
  } finally { await reader.cancel().catch(() => {}); }
}
export function apply(ctx) {
  const vault = new Vault(ctx.credentials);
  const handle = operation => async request => {
    try { return json(await operation(request)); }
    catch (error) { return json(safeError(error), error instanceof VaultError ? 400 : 503); }
  };
  for (const route of [
    { path: '/api/token-vault/list', methods: ['GET'], requestBody: 'buffered', fetch: handle(() => vault.list()) },
    { path: '/api/token-vault/save', methods: ['POST'], requestBody: 'streaming', fetch: handle(async request => vault.save(await requestBody(request))) },
    { path: '/api/token-vault/remove', methods: ['POST'], requestBody: 'streaming', fetch: handle(async request => vault.remove(await requestBody(request))) },
  ]) ctx.effect(() => ctx.connection.fetch.register(route));
  const register = (name, description, parameters, execute) => ctx.effect(() => ctx.tools.register({
    name, description, parameters, timeoutMs: 180000,
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) { try { return await execute(args, exec); } catch (error) { return safeError(error); } },
  }));
  register('vault_list', 'List names and configured states in the DSH token vault, never values.', { type: 'object', additionalProperties: false, properties: {} }, () => vault.list());
  register('vault_run', 'Run a foreground bash command with selected vault credentials as environment variables. Requires approval and preserves the session sandbox. Literal secret echoes are masked; transformed values, files and remote recipients are not protected. Never evade a sandbox denial through this tool.', {
    type: 'object', additionalProperties: false, required: ['names', 'command', 'description'], properties: {
      names: { type: 'array', items: str, description: 'Vault names for this command only; 1–32 unique names.' }, description: str, command: str, workdir: str,
      timeoutMs: { type: 'integer', description: '1–120000 ms; default 30000. Kills on expiry; no background jobs.' },
    },
  }, (args, exec) => runWithSecrets(ctx, vault, args, exec));
  register('vault_call', 'Call a loaded MCP tool with named vault values substituted into argument paths. Requires approval and preserves native/PTC tool permissions. Exact echoed values are masked. This substitutes arguments, not MCP connection authentication.', {
    type: 'object', additionalProperties: false, required: ['tool', 'arguments', 'bindings'], properties: {
      tool: str, arguments: { type: 'object', description: 'Ordinary MCP arguments; use empty placeholders at secret destinations.' }, bindings: { type: 'array', items: binding },
    },
  }, (args, exec) => callWithSecrets(ctx, vault, args, exec));
  ctx.effect(() => ctx.systemPrompt.section({ name: 'plugin:token-vault', order: 85, text:
    'Named credentials are entered only in Settings → Tokens and environment, never in chat or tool arguments. Do not read the credential file with file tools. Skills use vault_run for script environment or vault_call for MCP argument substitution. Connection authentication belongs in the MCP client settings: Lazy Discovery supports named bindings in Settings → MCP authorization; eager clients may use @pnpwin/dsh-token-vault/mcp. Neither client is required by this vault. Existing connections are never silently rebound and no global process environment is modified.' }));
}
