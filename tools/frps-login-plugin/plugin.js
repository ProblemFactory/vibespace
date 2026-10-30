#!/usr/bin/env node
'use strict';
// THE RELAY LOGIN PLUGIN (lane relay-token-per-instance, design q-051 §2 — the owner's decision 2026-10-20): frps's server
// plugin (frps.toml `[[httpPlugins]] ops = ["Login", "NewProxy", "CloseProxy"]`) that binds every instance to its OWN
// token and its OWN public names. frps POSTs { version, op, content } here before it accepts a login or a proxy; we answer
// { reject: true, reject_reason } or { reject: false, unchange: true }. frps refuses a login whose plugin call fails, so a
// plugin that is down refuses every NEW login (live ones stay) — systemd Restart=always + GET /healthz in the monitor.
//   Login     metas.token (frpc `metadatas.token`) — its sha256 is the instance's row (`user` = the instance id), or a
//             cluster row's (`user` = the pod's name, matched by the row's userRe) ⇒ accept; revoked ⇒ `revoked`; another
//             hash ⇒ `bad_token`. No metas.token (an older build: the shared token is its knock — frps checks that one) ⇒
//             accept during the GRACE only, one `legacy` audit line per use; after it ⇒ `legacy_token_retired`. An id the
//             table does not know ⇒ the same knock during the grace, `unknown_instance` after it.
//   NewProxy  the same identity again (frps hands user + metas with every proxy), then the name (without its `<user>.`
//             prefix) must start with one of the row's prefixes ⇒ else `name_not_yours`; a subdomain / custom domain held
//             by ANOTHER owner ⇒ `name_in_use:<its label>` + a `conflict` audit line; one nobody holds ⇒ this owner's from
//             now on (the first claim, persisted — a restart keeps its names). A legacy login never takes a held name.
//   CloseProxy the live list forgets the proxy (the name stays its owner's).
// VOUCH (opt-in, --knock-file <frps's auth.token in a 0600 file>) — REFUTED against frps 0.70.0 (lane frp-token-proof,
// 2026-10-30, a production incident): a login accepted by the instance's OWN token gets frp's privilege key for frps's
// token (md5(token + timestamp)), so frps's own auth.token check passes — but frps then keys the CONTROL connection with
// its auth.token and frpc with its own, so a frpc without the shared token is taken and dropped ~16 ms later (no NewProxy
// ever reaches this plugin). It works only once frps's auth.token is empty — when no vouch is needed. Without the flag
// that frpc is refused at the login, by name. Kept working as it was (the relay admin removes the flag — README
// «Vouching»); legacy logins are handed back unchanged; the file is re-read whenever it changes (q-052).
// Every refusal is named; an unreadable table, a malformed body, an op we were not built for ⇒ refused (fail closed).
// The audit (JSONL, 0600) never holds a token nor a hash. Node ≥ 20, no dependencies (./table.js).
// Run: node plugin.js --table /var/lib/frps-plugin/relay-instances.json --listen 127.0.0.1:7001 --audit /var/log/frps-plugin/audit.jsonl
//      [--knock-file /etc/frp/knock]
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const T = require('./table.js');

const BODY_MAX = 64 * 1024;

function createPlugin({ table: tableFile, audit: auditFile = null, knock = null, knockFile = null, now = () => Date.now() } = {}) {
  if (!tableFile) throw new Error('--table <file> is required');
  let cache = { key: null, table: null, error: null };
  const live = new Map();   // the frps-side proxy name → { owner, user, legacy, at }
  let lastLegacyAt = null;
  const bootAt = now();
  /** the table, re-read when its file changed (one stat per request) */
  function current() {
    let st;
    try { st = fs.statSync(tableFile); } catch (e) { cache = { key: null, table: null, error: e.code || 'unreadable' }; return cache; }
    const key = `${st.ino}:${st.size}:${st.mtimeMs}`;
    if (key === cache.key) return cache;
    const r = T.load(tableFile);
    cache = { key, table: r.table || null, error: r.error || null };
    return cache;
  }
  const graceOpen = (t) => { const u = t.grace && t.grace.legacyUntil; return !!u && Date.parse(u) > now(); };
  function audit(row) {
    if (!auditFile) return;
    const clip = (v) => (typeof v === 'string' ? v.slice(0, 160) : v);   // user / proxy / subdomain are the caller's words
    const out = { at: new Date(now()).toISOString() };
    for (const [k, v] of Object.entries(row)) out[k] = Array.isArray(v) ? v.slice(0, 8).map(clip) : clip(v);
    try { fs.appendFileSync(auditFile, JSON.stringify(out) + '\n', { mode: 0o600 }); } catch { /* the verdict never waits on its audit */ }
  }
  /** WHO is this login — from its user + metas (Login and NewProxy carry both) */
  function who(t, user, metas) {
    const tok = metas && typeof metas.token === 'string' ? metas.token : '';
    const legacy = (unregistered) => (graceOpen(t) ? { ok: true, kind: 'legacy', owner: null, label: '', unregistered } : { ok: false, reason: unregistered ? 'unknown_instance' : 'legacy_token_retired' });
    if (!tok) return legacy(false);
    const inst = Object.prototype.hasOwnProperty.call(t.instances, user) ? t.instances[user] : null;
    if (inst) {
      if (inst.revokedAt) return { ok: false, reason: 'revoked' };
      if (!T.hashEq(T.sha256(tok), inst.tokenHash)) return { ok: false, reason: 'bad_token' };
      return { ok: true, kind: 'instance', owner: user, label: inst.label, prefixes: inst.prefixes };
    }
    if (typeof user === 'string' && user && !T.ID_RE.test(user)) {
      const h = T.sha256(tok);
      for (const [cid, c] of Object.entries(t.clusters)) {
        if (c.revokedAt || !T.hashEq(h, c.tokenHash)) continue;
        if (!T.LABEL_RE.test(user) || !new RegExp(c.userRe).test(user)) return { ok: false, reason: 'unknown_instance' };   // the shape first: ≤ 60 plain characters reach the admin's regex
        return { ok: true, kind: 'cluster', owner: `${cid}/${user}`, label: user, prefixes: c.prefixes };
      }
    }
    return legacy(true);
  }
  const accept = () => ({ reject: false, unchange: true });
  /** frps's auth.token for the vouch: --knock-file re-read whenever it changes (q-052: emptied at the grace's end = the empty
   *  token frps then takes, md5('' + ts)); a missing file = no vouch */
  let knockCache = { key: null, value: null };
  const knockOf = () => {
    if (!knockFile) return typeof knock === 'string' ? knock : null;
    let st; try { st = fs.statSync(knockFile); } catch { return null; }
    const key = `${st.ino}:${st.size}:${st.mtimeMs}`;
    if (key !== knockCache.key) { let v = null; try { v = fs.readFileSync(knockFile, 'utf8').trim(); } catch { } knockCache = { key, value: v }; }
    return knockCache.value;
  };
  /** an identity login handed back with frp's privilege key for frps's own token (opt-in — see VOUCH above) */
  const vouch = (c, k = knockOf()) => (typeof k === 'string' ? { reject: false, unchange: false, content: { ...c, privilege_key: crypto.createHash('md5').update(k + String(c.timestamp)).digest('hex') } } : accept());
  const refuse = (reason) => ({ reject: true, reject_reason: reason });
  function login(t, c) {
    const w = who(t, c.user, c.metas);
    const row = { op: 'Login', user: c.user || '', label: w.label || '', addr: c.client_address || '' };
    if (!w.ok) { audit({ ...row, verdict: 'reject', reason: w.reason }); return refuse(w.reason); }
    if (w.kind === 'legacy') { lastLegacyAt = now(); audit({ ...row, verdict: 'legacy', reason: w.unregistered ? 'unregistered' : 'shared-token' }); return accept(); }
    const k = knockOf();
    audit({ ...row, kind: w.kind, verdict: 'accept', ...(typeof k === 'string' ? { vouched: true } : {}) });
    return vouch(c, k);
  }
  function newProxy(t, c) {
    const u = c.user || {};
    const w = who(t, u.user, u.metas);
    const sub = typeof c.subdomain === 'string' ? c.subdomain : '';
    const doms = Array.isArray(c.custom_domains) ? c.custom_domains.filter((d) => typeof d === 'string' && d) : [];
    const row = { op: 'NewProxy', user: u.user || '', label: w.label || '', proxy: c.proxy_name || '', subdomain: sub || doms.join(',') };
    if (!w.ok) { audit({ ...row, verdict: 'reject', reason: w.reason }); return refuse(w.reason); }
    const name = T.strippedName(c.proxy_name, u.user);
    if (w.kind !== 'legacy' && !(name && w.prefixes.some((p) => name.startsWith(p)))) { audit({ ...row, verdict: 'reject', reason: 'name_not_yours' }); return refuse('name_not_yours'); }
    const names = [sub, ...doms].filter(Boolean).map((n) => n.toLowerCase());
    if (names.some((n) => !T.NAME_RE.test(n))) { audit({ ...row, verdict: 'reject', reason: 'name_not_yours' }); return refuse('name_not_yours'); }
    const held = names.find((n) => t.names[n] && t.names[n].owner !== w.owner);
    if (held) {
      const reason = 'name_in_use:' + T.ownerLabel(t, t.names[held].owner);
      audit({ ...row, verdict: 'conflict', reason });
      return refuse(reason);
    }
    const claims = w.owner ? names.filter((n) => !t.names[n]) : [];
    if (claims.length) {
      let raced = null;
      try {
        T.update(tableFile, (t2) => {
          for (const n of claims) {
            if (t2.names[n] && t2.names[n].owner !== w.owner) { raced = 'name_in_use:' + T.ownerLabel(t2, t2.names[n].owner); return; }
            t2.names[n] = { owner: w.owner, at: new Date(now()).toISOString() };
          }
        });
      } catch (e) { audit({ ...row, verdict: 'reject', reason: 'table_unreadable', detail: String(e.message).slice(0, 200) }); return refuse('table_unreadable'); }
      if (raced) { audit({ ...row, verdict: 'conflict', reason: raced }); return refuse(raced); }
      cache.key = null;   // our own write: the next request reads it back
    }
    live.set(String(c.proxy_name || ''), { owner: w.owner, user: u.user || '', legacy: w.kind === 'legacy', at: now() });
    if (w.kind === 'legacy') lastLegacyAt = now();
    audit({ ...row, kind: w.kind, verdict: w.kind === 'legacy' ? 'legacy' : 'accept', ...(claims.length ? { claimed: claims } : {}) });
    return accept();
  }
  function closeProxy(c) {
    live.delete(String(c.proxy_name || ''));
    audit({ op: 'CloseProxy', user: (c.user && c.user.user) || '', proxy: c.proxy_name || '', verdict: 'accept' });
    return accept();
  }
  /** one frps call → the answer (never throws) */
  function handle(body) {
    const op = body && body.op, c = body && body.content;
    if (!op || !c || typeof c !== 'object') return refuse('bad_request');
    const cur = current();
    if (!cur.table) { audit({ op, verdict: 'reject', reason: 'table_unreadable', detail: String(cur.error || '') }); return refuse('table_unreadable'); }
    if (op === 'Login') return login(cur.table, c);
    if (op === 'NewProxy') return newProxy(cur.table, c);
    if (op === 'CloseProxy') return closeProxy(c);
    audit({ op: String(op).slice(0, 40), verdict: 'reject', reason: 'unknown_op' });
    return refuse('unknown_op');
  }
  function health() {
    const cur = current();
    const t = cur.table;
    return { ok: !!t, error: t ? undefined : String(cur.error || 'unreadable'), instances: t ? Object.keys(t.instances).length : 0, clusters: t ? Object.keys(t.clusters).length : 0,
      names: t ? Object.keys(t.names).length : 0, live: live.size, legacyLive: [...live.values()].filter((x) => x.legacy).length,
      grace: t ? { open: graceOpen(t), until: t.grace.legacyUntil } : null, lastLegacyAt: lastLegacyAt ? new Date(lastLegacyAt).toISOString() : null, since: new Date(bootAt).toISOString() };
  }
  const send = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }); res.end(b); };
  function listener(path = '/handler') {
    return (req, res) => {
      const url = String(req.url || '').split('?')[0];
      if (req.method === 'GET' && url === '/healthz') return send(res, 200, health());
      if (req.method !== 'POST' || url !== path) return send(res, 404, { error: 'not found' });
      let size = 0; const parts = [];
      req.on('data', (d) => { size += d.length; if (size > BODY_MAX) { req.destroy(); return; } parts.push(d); });
      req.on('end', () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { body = null; }
        let out;
        try { out = handle(body); } catch (e) { audit({ op: 'error', verdict: 'reject', reason: 'internal', detail: String(e && e.message).slice(0, 200) }); out = refuse('internal'); }
        send(res, 200, out);
      });
    };
  }
  return { handle, health, listener, live };
}

function argOf(argv, k, d = null) { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; }
function main(argv = process.argv.slice(2)) {
  const table = argOf(argv, '--table', '/var/lib/frps-plugin/relay-instances.json');
  const auditFile = argOf(argv, '--audit', null);
  const [host, port] = String(argOf(argv, '--listen', '127.0.0.1:7001')).split(':');
  const knockFile = argOf(argv, '--knock-file', null);
  if (knockFile) { try { fs.readFileSync(knockFile, 'utf8'); } catch (e) { console.error(`frps-login-plugin: --knock-file ${knockFile}: ${e.code || e.message}`); process.exit(1); } }   // a typo fails at start; later reads follow the file
  const p = createPlugin({ table, audit: auditFile, knockFile });
  const srv = http.createServer(p.listener(argOf(argv, '--path', '/handler')));
  srv.listen(Number(port), host || '127.0.0.1', () => { const a = srv.address(); console.log(`frps-login-plugin listening ${a.address}:${a.port} (table ${table})`); });
  const stop = () => srv.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return srv;
}

module.exports = { createPlugin, main };
if (require.main === module) main();
