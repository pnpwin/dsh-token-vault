import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { nameOf, objectOnly, redact, VaultError } from './vault.js';

export async function authorize(ctx, exec, reason) {
  if (!exec.agent || exec.signal.aborted) throw new VaultError('cancelled');
  const outcome = await ctx.approval.request({ agent: exec.agent, toolName: exec.name, callId: exec.callId, signal: exec.signal, reason });
  if (outcome !== 'allowed-once') throw new VaultError(`approval-${outcome}`);
  if (exec.signal.aborted) throw new VaultError('cancelled');
}
export function runArgs(input) {
  objectOnly(input, ['names', 'command', 'description', 'workdir', 'timeoutMs']);
  if (!Array.isArray(input.names) || !input.names.length || input.names.length > 32 || new Set(input.names).size !== input.names.length) throw new VaultError('invalid-bindings');
  input.names.forEach(nameOf);
  if (typeof input.command !== 'string' || !input.command.trim() || input.command.length > 32768 || input.command.includes('\0')) throw new VaultError('invalid-request');
  if (typeof input.description !== 'string' || !input.description.trim() || input.description.length > 500) throw new VaultError('invalid-request');
  if (input.workdir !== undefined && (typeof input.workdir !== 'string' || !input.workdir || input.workdir.includes('\0'))) throw new VaultError('invalid-request');
  if (input.timeoutMs !== undefined && (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 120000)) throw new VaultError('invalid-request');
  return input;
}
export async function runWithSecrets(ctx, vault, input, exec) {
  const args = runArgs(input);
  await authorize(ctx, exec, `Run one command with vault variables: ${args.names.join(', ')}. Values are not shown.\n${args.command}`);
  const env = await vault.environment(args.names);
  const secrets = Object.values(env);
  try {
    const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
    const workdir = args.workdir === undefined ? cwd : isAbsolute(args.workdir) ? args.workdir : resolve(cwd, args.workdir);
    const sandboxPolicy = ctx.sandboxPolicy.resolve({ session: exec.agent.session });
    const spec = ctx.shell.resolve({ command: args.command, workdir, env, dshEnv: ctx.shellEnv.collect(exec), sandboxPolicy, signal: exec.signal, timeoutMs: args.timeoutMs ?? 30000, onExpiry: 'kill', stdoutMaxBytes: 65536 });
    const result = await (await ctx.shell.execute(spec)).result();
    return redact({ exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, aborted: result.aborted, stdout: result.stdout.text, stderr: result.stderr.text, truncated: result.stdout.truncated || result.stderr.truncated, ...(result.sandbox ? { sandbox: result.sandbox } : {}) }, secrets);
  } finally {
    for (const key of Object.keys(env)) delete env[key];
  }
}
export function callArgs(input) {
  objectOnly(input, ['tool', 'arguments', 'bindings']);
  if (typeof input.tool !== 'string' || !/^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/.test(input.tool)) throw new VaultError('mcp-tool-required');
  if (!input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments) || JSON.stringify(input.arguments).length > 32768) throw new VaultError('invalid-request');
  if (!Array.isArray(input.bindings) || input.bindings.length < 1 || input.bindings.length > 32) throw new VaultError('invalid-bindings');
  const paths = new Set();
  for (const binding of input.bindings) {
    objectOnly(binding, ['name', 'path', 'prefix', 'suffix']); nameOf(binding.name);
    if (!Array.isArray(binding.path) || !binding.path.length || binding.path.length > 16 || binding.path.some(p => !(typeof p === 'string' && p.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(p) || Number.isInteger(p) && p >= 0))) throw new VaultError('invalid-bindings');
    if ([binding.prefix, binding.suffix].some(v => v !== undefined && (typeof v !== 'string' || v.length > 256 || v.includes('\0')))) throw new VaultError('invalid-bindings');
    const key = JSON.stringify(binding.path);
    if (paths.has(key)) throw new VaultError('invalid-bindings'); paths.add(key);
  }
  for (const a of input.bindings) for (const b of input.bindings) if (a !== b && a.path.length < b.path.length && a.path.every((p, i) => p === b.path[i])) throw new VaultError('invalid-bindings');
  return input;
}
export function bindValues(args, values) {
  const result = structuredClone(args.arguments);
  for (const binding of args.bindings) {
    let parent = result;
    for (const key of binding.path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw new VaultError('invalid-path');
      parent = parent[key];
    }
    const last = binding.path.at(-1);
    if (!parent || typeof parent !== 'object' || Array.isArray(parent) && (!Number.isInteger(last) || last >= parent.length)) throw new VaultError('invalid-path');
    Object.defineProperty(parent, last, { value: `${binding.prefix ?? ''}${values[binding.name]}${binding.suffix ?? ''}`, enumerable: true, configurable: true, writable: true });
  }
  return result;
}
export async function callWithSecrets(ctx, vault, input, exec) {
  const args = callArgs(input);
  if (!ctx.tools.executable(args.tool, exec.agent, exec.toolSet)) throw new VaultError('tool-unavailable');
  // Use the public nested pipeline, not a new root executor batch: PTC accepts only
  // run_code at its root. Native and PTC share these policy/guard/dispatch stages.
  const { ToolExecutionPipeline } = await ctx.loader.import('@deepseek-ai/dsh-tools/pipeline');
  const pipeline = new ToolExecutionPipeline(ctx);
  await authorize(ctx, exec, `Pass vault credentials ${args.bindings.map(b => b.name).join(', ')} to ${args.tool} at ${args.bindings.map(b => JSON.stringify(b.path)).join(', ')}.\nArguments without secret values: ${JSON.stringify(args.arguments)}`);
  const values = await vault.environment([...new Set(args.bindings.map(b => b.name))]);
  const controller = new AbortController();
  const signal = AbortSignal.any([exec.signal, controller.signal]);
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const injected = bindValues(args, values);
    const callId = randomUUID();
    const prepared = await pipeline.prepare({ callId, rootCallId: exec.rootCallId, parent: exec.token, name: args.tool, arguments: injected, agent: exec.agent, toolSet: exec.toolSet, signal });
    const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared;
    const result = await pipeline.complete(prepared.exec, outcome);
    // No root Session logging of expanded arguments; redact canonical values too.
    return redact({ results: [{ callId, result }], additionalContexts: [], concluded: false }, Object.values(values));
  } finally {
    clearTimeout(timer);
    for (const name of Object.keys(values)) delete values[name];
  }
}
