// Optional Host plugin: mount this subpath instead of the native MCP row.
// ctx.loader.import uses DSH's installed-package resolver; no copied MCP client or SDK.
import { Vault, VaultError, objectOnly, nameOf, markerKey } from './vault.js';
export const inject = ['credentials', 'loader'];
export function validateMcpConfig(input) {
  objectOnly(input, ['mcp', 'envRefs', 'headerRefs']);
  if (!input.mcp || typeof input.mcp !== 'object' || Array.isArray(input.mcp)) throw new VaultError('invalid-mcp-config');
  const envRefs = input.envRefs ?? {}, headerRefs = input.headerRefs ?? {};
  if (!envRefs || typeof envRefs !== 'object' || Array.isArray(envRefs) || !headerRefs || typeof headerRefs !== 'object' || Array.isArray(headerRefs)) throw new VaultError('invalid-mcp-config');
  const names = new Set();
  for (const [target, name] of Object.entries(envRefs)) { nameOf(target); names.add(nameOf(name)); }
  for (const [header, ref] of Object.entries(headerRefs)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header) || header.toLowerCase() === 'host') throw new VaultError('invalid-mcp-config');
    objectOnly(ref, ['name', 'prefix']); names.add(nameOf(ref.name));
    if (ref.prefix !== undefined && (typeof ref.prefix !== 'string' || ref.prefix.length > 256 || /[\r\n\0]/.test(ref.prefix))) throw new VaultError('invalid-mcp-config');
  }
  if (!names.size || names.size > 32) throw new VaultError('invalid-bindings');
  if (Object.keys(envRefs).length && input.mcp.transport !== 'stdio' || Object.keys(headerRefs).length && input.mcp.transport !== 'streamable-http') throw new VaultError('invalid-mcp-config');
  return { mcp: input.mcp, envRefs, headerRefs, names: [...names] };
}
export async function resolveMcpConfig(vault, config) {
  const values = await vault.environment(config.names);
  const runtime = { ...config.mcp };
  if (Object.keys(config.envRefs).length) {
    runtime.env = { ...config.mcp.env };
    for (const [target, name] of Object.entries(config.envRefs)) runtime.env[target] = values[name];
  }
  if (Object.keys(config.headerRefs).length) {
    runtime.headers = { ...config.mcp.headers };
    for (const [header, ref] of Object.entries(config.headerRefs)) {
      const value = `${ref.prefix ?? ''}${values[ref.name]}`;
      if (/[\r\n\0]/.test(value)) throw new VaultError('invalid-header-value');
      // Replace case-insensitively, so a literal Authorization cannot survive beside the ref.
      for (const key of Object.keys(runtime.headers)) if (key.toLowerCase() === header.toLowerCase()) delete runtime.headers[key];
      runtime.headers[header] = value;
    }
  }
  return runtime;
}
export async function apply(ctx, input) {
  const config = validateMcpConfig(input);
  const vault = new Vault(ctx.credentials);
  const native = await ctx.loader.import('@deepseek-ai/dsh-mcp-client');
  if (!native || typeof native.apply !== 'function') throw new VaultError('mcp-client-unavailable');
  let closed = false, fork;
  let queue = Promise.resolve();
  const mount = async () => {
    if (closed) return;
    const previous = fork; fork = undefined;
    if (previous) await previous.dispose();
    if (closed) return;
    // Resolve again for every connection generation, including key rotations.
    const runtime = await resolveMcpConfig(vault, config);
    if (closed) return;
    const pending = ctx.plugin(native, { ...runtime, failOnStartupError: true });
    fork = pending;
    await pending; // Cordis fibers are thenable: wait for native validation and initial connection.
  };
  ctx.effect(() => async () => { closed = true; if (fork) await fork.dispose(); await queue.catch(() => {}); });
  ctx.on('credentials/reference-updated', name => {
    if (!config.names.includes(name) || closed) return;
    // Never keep an old token connected after a failed refresh/removal.
    queue = queue.catch(() => {}).then(mount).catch(() => { ctx.logger.warn('Token vault MCP connection could not reload; check named credentials and MCP configuration.'); });
  });
  ctx.on('credentials/record-updated', key => {
    if (!config.names.some(name => key === markerKey(name)) || closed) return;
    queue = queue.catch(() => {}).then(mount).catch(() => { ctx.logger.warn('Token vault MCP connection could not reload; check named credentials and MCP configuration.'); });
  });
  queue = queue.then(mount);
  try { await queue; }
  catch { throw new VaultError('mcp-mount-failed'); }
}
