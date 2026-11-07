// Values live in the native credential reference space. Records only enumerate names.
export const OWNER = 'pnpwin-token-vault';
export const PREFIX = `${OWNER}/`;
export const MAX_VALUE_BYTES = 32768;
// Credential record ids accept lowercase hyphenated segments, not POSIX ref names.
// Hex encoding is reversible and preserves case without collisions (A != a).
export function markerKey(name) { return `${PREFIX}n-${Buffer.from(nameOf(name), 'ascii').toString('hex')}`; }
export function markerName(key) {
  const encoded = key.slice(PREFIX.length);
  if (!key.startsWith(PREFIX) || !/^n-(?:[0-9a-f]{2})+$/.test(encoded)) throw new VaultError('invalid-name');
  const name = nameOf(Buffer.from(encoded.slice(2), 'hex').toString('ascii'));
  if (markerKey(name) !== key) throw new VaultError('invalid-name');
  return name;
}
export class VaultError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function nameOf(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value) || value.startsWith('DSH_') || ['__proto__', 'prototype', 'constructor'].includes(value)) throw new VaultError('invalid-name');
  return value;
}
export function objectOnly(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new VaultError('invalid-request');
  return value;
}
export function valueOf(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || Buffer.byteLength(value) > MAX_VALUE_BYTES) throw new VaultError('invalid-value');
  return value;
}
export function safeError(error) {
  // Never return a thrown provider/parser/network message: it might contain a secret.
  return { error: { code: error instanceof VaultError ? error.code : 'operation-failed' } };
}
export class Vault {
  constructor(credentials) { this.credentials = credentials; this.queue = Promise.resolve(); }
  serialize(fn) {
    const task = this.queue.then(fn);
    this.queue = task.catch(() => {});
    return task;
  }
  async list() {
    const records = await this.credentials.listRecords();
    const names = records.flatMap(r => { try { return [markerName(r.key)]; } catch { return []; } }).sort();
    const entries = [];
    // Do not resolve or return secret values while rendering an inventory.
    for (const name of names) {
      const info = await this.credentials.describe(name);
      entries.push({ name, configured: info.configured, writable: info.writable });
    }
    return { entries };
  }
  async save(input) {
    objectOnly(input, ['name', 'value', 'replace']);
    const name = nameOf(input.name), value = valueOf(input.value);
    if (input.replace !== undefined && typeof input.replace !== 'boolean') throw new VaultError('invalid-request');
    return this.serialize(async () => {
      const info = await this.credentials.describe(name);
      if (!info.writable) throw new VaultError('read-only');
      if (info.configured && input.replace !== true) throw new VaultError('already-exists');
      // Marker first: an interrupted/failed save remains visible as "missing", not orphaned.
      await this.credentials.modifyRecord(markerKey(name), async () => ({ kind: 'grant', payload: { version: 1 } }));
      await this.credentials.set(name, value);
      return { name, saved: true };
    });
  }
  async remove(input) {
    objectOnly(input, ['name']);
    const name = nameOf(input.name);
    return this.serialize(async () => {
      if (!await this.credentials.readRecord(markerKey(name))) throw new VaultError('not-found');
      await this.credentials.unset(name);
      await this.credentials.deleteRecord(markerKey(name));
      // An ambient fallback can remain. Don't imply a revoked credential if one exists.
      const info = await this.credentials.describe(name);
      return { name, removed: true, ambientRemains: info.configured };
    });
  }
  async resolve(name) {
    nameOf(name);
    if (!await this.credentials.readRecord(markerKey(name))) throw new VaultError('not-found');
    const hit = await this.credentials.resolve(name);
    if (!hit || typeof hit.value !== 'string' || hit.value.length === 0) throw new VaultError('not-configured');
    return valueOf(hit.value);
  }
  async environment(names) {
    if (!Array.isArray(names) || names.length < 1 || names.length > 32 || new Set(names).size !== names.length) throw new VaultError('invalid-bindings');
    const env = Object.create(null);
    for (const name of names) env[nameOf(name)] = await this.resolve(name);
    return env;
  }
}
// Host plugins can resolve the same references directly through ctx.credentials.resolve(NAME).
export async function resolveEnvironment(ctx, names) { return new Vault(ctx.credentials).environment(names); }
export function redact(value, secrets) {
  const needles = [...new Set(secrets.filter(s => typeof s === 'string' && s.length))].sort((a, b) => b.length - a.length);
  const visit = item => {
    if (typeof item === 'string') { for (const secret of needles) item = item.split(secret).join('[REDACTED]'); return item; }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object') {
      const result = Object.create(null);
      for (const [key, itemValue] of Object.entries(item)) result[visit(key)] = visit(itemValue);
      return result;
    }
    return item;
  };
  return visit(value);
}
