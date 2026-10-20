'use strict';
// THE RELAY'S INSTANCE TABLE (tools/frps-login-plugin — lane relay-token-per-instance, design q-051 §2). ONE JSON file
// (default /var/lib/frps-plugin/relay-instances.json, 0600) with TWO writers — the plugin (a first claim of a public name) and
// relay-admin (add / rotate / revoke / release / grace) — both under ONE lock file, each write atomic (tmp + rename).
//   { v: 1, grace: { legacyUntil: <ISO> | null },
//     instances: { 'vi-<12 hex>': { tokenHash, label, prefixes, addedAt, rotatedAt, revokedAt } },
//     clusters:  { '<cluster id>': { tokenHash, userRe, prefixes, addedAt, revokedAt } },
//     names:     { '<subdomain or custom domain>': { owner: '<instance id>' | '<cluster id>/<pod user>', at } } }
// Node ≥ 20, no dependencies. Only a token's sha256 is ever stored — the token itself lives on its instance alone.
const fs = require('fs');
const crypto = require('crypto');

const V = 1;
const ID_RE = /^vi-[0-9a-f]{12}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;
const CLUSTER_ID_RE = /^[a-z][a-z0-9-]{0,30}$/;
const PREFIX_RE = /^[a-z][a-z0-9-]{1,40}$/;
const NAME_RE = /^[a-z0-9][a-z0-9.-]{0,252}$/;
/** the hub's proxy names (src/relay-token.js PREFIXES — test-frps-plugin holds the two lists equal) */
const DEFAULT_PREFIXES = Object.freeze(['pf-', 'vibespace-instance']);
const empty = () => ({ v: V, grace: { legacyUntil: null }, instances: {}, clusters: {}, names: {} });
const isTimeOrNull = (x) => x === null || (typeof x === 'string' && Number.isFinite(Date.parse(x)));
const prefixesOk = (p) => Array.isArray(p) && p.length > 0 && p.every((x) => PREFIX_RE.test(x));

/** the table's shape — every row named and shaped, else the reason (the plugin then refuses EVERY op: fail closed) */
function shapeError(t) {
  if (!t || typeof t !== 'object' || t.v !== V) return 'not a v1 table';
  if (!t.grace || typeof t.grace !== 'object' || !isTimeOrNull(t.grace.legacyUntil)) return 'grace';
  for (const k of ['instances', 'clusters', 'names']) if (!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) return k;
  for (const [id, r] of Object.entries(t.instances)) {
    if (!ID_RE.test(id) || !r || !HASH_RE.test(r.tokenHash) || !LABEL_RE.test(r.label) || !prefixesOk(r.prefixes) || !isTimeOrNull(r.revokedAt)) return 'instance ' + id;
  }
  for (const [id, r] of Object.entries(t.clusters)) {
    if (!CLUSTER_ID_RE.test(id) || !r || !HASH_RE.test(r.tokenHash) || !prefixesOk(r.prefixes) || !isTimeOrNull(r.revokedAt)) return 'cluster ' + id;
    try { new RegExp(r.userRe); } catch { return 'cluster ' + id + ' userRe'; }
    if (typeof r.userRe !== 'string' || !r.userRe.startsWith('^') || !r.userRe.endsWith('$')) return 'cluster ' + id + ' userRe (anchor it: ^…$)';
  }
  for (const [n, r] of Object.entries(t.names)) if (!NAME_RE.test(n) || !r || typeof r.owner !== 'string' || !r.owner) return 'name ' + n;
  return null;
}
/** → { table } | { error, code } (ENOENT = no table yet) */
function load(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return { error: e.code || e.message, code: e.code || 'EIO' }; }
  let t;
  try { t = JSON.parse(text); } catch { return { error: 'unparseable', code: 'EBADF' }; }
  const bad = shapeError(t);
  return bad ? { error: 'bad shape: ' + bad, code: 'EBADF' } : { table: t };
}
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** fn() under the table's lock file (O_EXCL); a lock older than 10 s is a dead writer's and is taken over */
function withLock(file, fn) {
  const lock = file + '.lock';
  for (let i = 0; ; i++) {
    try { fs.closeSync(fs.openSync(lock, 'wx', 0o600)); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10e3) { fs.unlinkSync(lock); continue; } } catch { continue; }
      if (i > 200) throw new Error('the instance table is locked (' + lock + ')');
      sleep(10);
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(lock); } catch { } }
}
function save(file, t) {
  const bad = shapeError(t);
  if (bad) throw new Error('refused to write a bad table: ' + bad);
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, JSON.stringify(t, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
}
/** read-modify-write under the lock: fn(table) mutates it and returns the answer; a missing table starts empty */
function update(file, fn) {
  return withLock(file, () => {
    const cur = load(file);
    if (cur.error && cur.code !== 'ENOENT') throw new Error('the instance table is unreadable (' + cur.error + ') — nothing was changed');
    const t = cur.table || empty();
    const out = fn(t);
    save(file, t);
    return out;
  });
}
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
/** two hex digests compared in constant time */
function hashEq(a, b) {
  if (!HASH_RE.test(String(a)) || !HASH_RE.test(String(b))) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
/** frps registers a proxy as `<user>.<name>` — the name without that prefix */
const strippedName = (proxyName, user) => { const n = String(proxyName || ''); return user && n.startsWith(user + '.') ? n.slice(user.length + 1) : n; };
/** an owner key's printable label (the reject reason `name_in_use:<label>` the hub reads) */
function ownerLabel(t, owner) {
  const inst = t.instances[owner];
  if (inst) return inst.label;
  const pod = String(owner).split('/')[1] || '';
  return LABEL_RE.test(pod) ? pod : 'another-instance';
}

module.exports = { V, ID_RE, HASH_RE, LABEL_RE, CLUSTER_ID_RE, PREFIX_RE, NAME_RE, DEFAULT_PREFIXES, empty, shapeError, load, withLock, save, update, sha256, hashEq, strippedName, ownerLabel };
