#!/usr/bin/env node
// SESSION BLACKBOARD GUARD (拆分P3): every `session._field` / `sess._field`
// WRITE in the server-side session-handling files must be registered in
// src/session-schema.js with an owner. A new field added without a schema row
// fails here — the blackboard can grow, but never anonymously. Dead schema
// rows fail too (they hide future violations behind them).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { SESSION_FIELDS } = require(path.join(REPO, 'src/session-schema.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? ' — ' + extra : '')); } };

// The server-side files that hold session objects. Client-side (src/lib) uses
// its own window/session mirrors — different objects, not in scope.
const FILES = [
  'server.js', 'src/ws-handler.js', 'src/ws-create.js', 'src/normalizers.js', // normalizers: the rebuild gate writes _rebuildQueue/_rebuildPromise (2.369.16)
  'src/routes/sessions.js', 'src/agent-routes.js', 'src/usage-routes.js',
  ...fs.readdirSync(path.join(REPO, 'src/server')).filter((f) => f.endsWith('.js')).map((f) => 'src/server/' + f),
  ...fs.readdirSync(path.join(REPO, 'src/server/stdout')).filter((f) => f.endsWith('.js')).map((f) => 'src/server/stdout/' + f), // S5: the per-protocol stdout consumers (owner 'stdout')
];

// THE DETECTOR READS ANY RECEIVER (design-account-hardening §4.4f, 2026-09-08).
// It used to match `session._x =` / `sess._x =` only — and the live session
// object is passed around as `s`, `s2`, `sessionObj`, … everywhere, so eight
// real fields were invisible to it, including `s._lastStopNudge`: the sole
// rate limiter on the largest measured automatic spender in the product (550
// Stop-nudge mini-turns in 3 days on this instance). A blackboard guard that
// only sees one spelling of the blackboard is not a guard.
//
// Widening to "any identifier" also catches receivers that are NOT sessions
// (ws clients, plugin records, the `data` payload of a create), so those are
// an ALLOWLIST WITH A REASON, in the shape every other census in this repo
// uses: an entry that stops matching anything FAILS too, so the list cannot
// quietly grow stale around a field that became a session field.
const NON_SESSION = [
  { recv: 'global', why: 'the two global telemetry hooks (__vsEvent/__vsMetric) — the process, not a session' },
  { recv: 'wss', why: 'the WebSocket SERVER (heartbeat pulse/timer) — src/server/ws-heartbeat.js' },
  { recv: 'ws', why: 'one WebSocket CLIENT connection (liveness), not the session it is attached to' },
  { recv: 'client', why: 'the same client connection under its other local name (heartbeat misses)' },
  { recv: 'rec', why: 'a PLUGIN registry record (crash timer / content-type warning) — src/server/plugin-loader.js' },
  { recv: 'dm', why: 'a DeviceManager handle (dial pairing stream), not a session' },
  { recv: 'locals', why: "express app.locals (the login-wake floor) — src/server/account-usage-routes.js" },
  { recv: 'out', why: 'a response payload being assembled (the __global__ usage key), not a session' },
  { recv: 'p', why: 'a workflow PHASE row while titles are being merged — src/routes/sessions.js' },
  { recv: 'h', why: 'a workflow-watcher handle (announced-once latch) — src/server/usage-pool-engine.js' },
  { recv: 'data', why: 'the ws CREATE payload (spawn-time hints: _placementModelHint, _effOutputStyle) — it is consumed at spawn and never stored on the session' },
  { recv: 'spawnAccount', why: 'the resolved ACCOUNT record for one spawn (_hostSubReady), not a session' },
];
const writes = new Map();   // field → Set(file) — SESSION fields
const others = new Map();   // receiver → Set(field) — everything the allowlist covers
for (const f of FILES) {
  let src = '';
  try { src = fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { continue; }
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\._([A-Za-z0-9_]+)\s*=[^=]/g)) {
    const recv = m[1], field = '_' + m[2];
    if (NON_SESSION.some((n) => n.recv === recv)) {
      if (!others.has(recv)) others.set(recv, new Set());
      others.get(recv).add(field);
      continue;
    }
    if (!writes.has(field)) writes.set(field, new Set());
    writes.get(field).add(f);
  }
}
const deadAllow = NON_SESSION.filter((n) => !others.has(n.recv));
ok(deadAllow.length === 0,
  `every non-session receiver on the allowlist still exists (${NON_SESSION.length} entries)`,
  deadAllow.map((n) => n.recv).join(', '));

ok(writes.size >= 40, `field inventory found (${writes.size} distinct written fields, any receiver)`);
const unregistered = [...writes.keys()].filter((k) => !(k in SESSION_FIELDS));
ok(unregistered.length === 0,
  'every written session._field is registered in src/session-schema.js (new field ⇒ add a row WITH an owner)',
  unregistered.map((k) => `${k} (${[...writes.get(k)].join(',')})`).slice(0, 6).join('; '));

// Dead = the field appears NOWHERE in the file set (object-literal
// initialization and reads count as alive — the write scanner only sees
// assignments, but a literal-initialized field like _resumeSpawn is real).
const allSrc = FILES.map((f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { return ''; } }).join('\n');
const dead = Object.keys(SESSION_FIELDS).filter((k) => !allSrc.includes(k));
ok(dead.length === 0, 'no dead schema rows (field gone from the codebase ⇒ remove its row)', dead.join(', '));

for (const [k, v] of Object.entries(SESSION_FIELDS)) {
  if (!v.owner || !('persisted' in v)) { fail++; console.error(`  ✗ ${k}: schema row missing owner/persisted`); }
}
ok(true, 'every schema row carries owner + persisted');

// MULTIVIEW (docs/design-browser-multiview.zh.md D4 / §4): the two new fields, each with its home. `_browserCap` is
// the conversation's explicit browser cap — persisted in the session meta (written at spawn + restored at boot); the
// keeper's per-conversation `caps` is what a resume reads. `_browserHelpers` (the helper-naming witness) is in memory.
const bc = SESSION_FIELDS._browserCap, bh = SESSION_FIELDS._browserHelpers;
const src = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { return ''; } };
ok(bc && bc.persisted === 'meta' && bc.owner === 'ws' && writes.has('_browserCap')
  && /browserCap: Number\.isInteger\(session\._browserCap\)/.test(src('src/ws-create.js'))
  && (src('src/server/boot-restore.js').match(/_browserCap: Number\.isInteger\(meta\.browserCap\)/g) || []).length === 1
  && (src('src/server/boot-restore.js').match(/= sessionFromMeta\(meta, \{/g) || []).length === 3,
  '_browserCap: registered (owner ws, persisted meta), written to the session meta at spawn and restored by sessionFromMeta, which all three boot-restore paths call');
ok(bh && bh.persisted === null && bh.owner === 'stdout' && writes.has('_browserHelpers') && [...writes.get('_browserHelpers')].includes('src/server/browser-helpers.js'),
  '_browserHelpers: registered (in memory), written only by src/server/browser-helpers.js (the stdout witness + the new-child mint)');

// ── THE RESUME CARRIER CENSUS (lane-pool-pin verify r2) ─────────────────────────────────────────
// A per-session pick rides a resume through the client's config: session-lifecycle writes it with
// sidebar.setSessionConfig and reads it back as `savedCfg.<key>`. setSessionConfig keeps only the
// keys it names, and that list silently dropped 'account' (2.43.0), 'groupManager' (2.132.0),
// 'outputStyle' + 'autoResume' (2.368.0) and 'poolPin' (2026-09-28): five strikes, each caught by a
// person. The rule is now DERIVED: the schema declares every key a resume carries (a row's
// `config`, or SESSION_CONFIG_ONLY), the census DRIVES the real setSessionConfig with each
// declared example, and every key the resume reads or a writer writes must be declared.
{
  const { SESSION_CONFIG_ONLY = {} } = require(path.join(REPO, 'src/session-schema.js'));
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MC = mutantCopies('schema-cfg', REPO);
  // what the SCHEMA declares — derived, never a hand list in this suite
  const declaredOf = (fields, only) => {
    const out = new Map();
    for (const [f, row] of Object.entries(fields)) if (row && row.config) out.set(row.config.key, { field: f, example: row.config.example });
    for (const [k, v] of Object.entries(only || {})) out.set(k, { field: null, example: v.example, reader: v.reader });
    return out;
  };
  const declared = declaredOf(SESSION_FIELDS, SESSION_CONFIG_ONLY);
  ok(declared.size >= 10, `the schema declares the resume carrier's keys (${declared.size}: ${[...declared.keys()].join(', ')})`);
  const sc = Object.entries(SESSION_FIELDS).filter(([, v]) => /session-config/.test(String(v.persisted || '')) && !v.config).map(([k]) => k);
  ok(sc.length === 0, "every row the schema calls 'session-config' names its config key", sc.join(', '));
  const badRow = Object.entries(SESSION_FIELDS).filter(([, v]) => v.config && (typeof v.config.key !== 'string' || !v.config.key || !('example' in v.config))).map(([k]) => k);
  ok(badRow.length === 0, 'every `config` is {key, example}', badRow.join(', '));
  const staleOnly = Object.entries(SESSION_CONFIG_ONLY).filter(([k, v]) => !src(v.reader).includes(k)).map(([k]) => k);
  ok(staleOnly.length === 0 && Object.values(SESSION_CONFIG_ONLY).every((v) => v.why), `every SESSION_CONFIG_ONLY key is still read by the module it names, with a reason (${Object.keys(SESSION_CONFIG_ONLY).length})`, staleOnly.join(', '));

  // what the CLIENT carries — derived from the code: the resume's reads and every writer's keys
  const carrierKeys = (texts) => {
    const keys = new Set();
    const lc = texts['src/lib/session-lifecycle.js'] || '';
    for (const m of lc.matchAll(/\b(?:savedCfg|forkCfg)\.([A-Za-z_$][\w$]*)/g)) keys.add(m[1]);
    for (const m of lc.matchAll(/\bnext\.([A-Za-z_$][\w$]*)\s*=/g)) keys.add(m[1]); // the billing submenu's saveCfg
    for (const [f, text] of Object.entries(texts)) {
      // a direct read of the saved config anywhere in the client (`getSessionConfig?.(k)?.poolPin`, `(… || {}).groupManager`)
      for (const m of text.matchAll(/getSessionConfig\??\.?\((?:\([^()]*\)|[^()])*\)(?:\s*\|\|\s*\{\})?\)?\??\.([A-Za-z_$][\w$]*)/g)) keys.add(m[1]);
      for (const line of text.split('\n')) {
        const c = line.replace(/(^|\s)\/\/.*$/, '');
        if (!/setSessionConfig\??\.?\(/.test(c) || /proto\.setSessionConfig/.test(c)) continue;
        const lit = c.slice(c.indexOf('{') + 1);
        for (const m of lit.matchAll(/(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:/g)) keys.add(m[1]);
        // a named spread (…overrides / …patch): the keys of the literal it is built from in the same file
        for (const m of c.matchAll(/\.\.\.(overrides|patch)\b/g)) {
          const re = m[1] === 'overrides' ? /const overrides = \{([^}]*)\}/g : /_persistSessionConfig\(\{([^}]*)\}\)/g;
          for (const d of text.matchAll(re)) for (const k of d[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) keys.add(k[1]);
        }
      }
    }
    return keys;
  };
  const libTexts = {};
  for (const f of fs.readdirSync(path.join(REPO, 'src/lib')).filter((x) => x.endsWith('.js'))) libTexts['src/lib/' + f] = src('src/lib/' + f);
  const carried = carrierKeys(libTexts);
  ok(carried.size >= 10 && ['poolPin', 'account', 'worktree', 'groupManager', 'outputStyle'].every((k) => carried.has(k)), `the carrier's keys are read off the client code (${carried.size}: ${[...carried].sort().join(', ')})`);
  const undeclared = [...carried].filter((k) => !declared.has(k));
  ok(undeclared.length === 0, 'CENSUS: every key the resume reads or a writer writes is declared in src/session-schema.js (a row\'s `config`, or SESSION_CONFIG_ONLY)', undeclared.join(', '));

  // …and the STORE keeps every declared key (the real setSessionConfig, DOM-free: its imports stubbed)
  const domFree = (s) => s
    .replace("import { getSessionKey, backendFeatureCaps } from './agent-meta.js';", 'const getSessionKey = (s) => (s && s.sessionKey) || null, backendFeatureCaps = () => ({});')
    .replace("import { showToast, showInputDialog } from './utils.js';", 'const showToast = () => {}, showInputDialog = async () => null;')
    .replace("import { t as tr } from './i18n.js';", 'const tr = (s) => s;');
  const storeSrc = src('src/lib/sidebar-state.js');
  ok(!/^import /m.test(domFree(storeSrc)), 'the store\'s scratch copy is DOM-free (every import of sidebar-state.js stubbed)');
  const loadStore = async (text, tag) => {
    const { installSidebarState } = await import(MC.write('src/lib/sidebar-state.js', domFree(text), tag, { esm: true }));
    class Sb { constructor() { this._sessionConfigs = {}; this._sessionModes = {}; } }
    installSidebarState(Sb);
    Sb.prototype._pushUserState = async function () { };
    return new Sb();
  };
  const dropped = async (store, decl) => {
    const key = 'claude:11111111-2222-4333-8444-555555555555';
    const lost = new Set();
    const all = {}; for (const [k, v] of decl) all[k] = v.example;
    store.setSessionConfig(key, all);
    for (const [k, v] of decl) if (JSON.stringify(store.getSessionConfig(key)?.[k]) !== JSON.stringify(v.example)) lost.add(k);
    for (const [k, v] of decl) { store.setSessionConfig(key + ':' + k, { [k]: v.example }); if (JSON.stringify(store.getSessionConfig(key + ':' + k)?.[k]) !== JSON.stringify(v.example)) lost.add(k); }
    return [...lost];
  };
  const real = await loadStore(storeSrc, 'real');
  const lostReal = await dropped(real, declared);
  ok(lostReal.length === 0, `CENSUS: the real setSessionConfig keeps every declared key WHOLE — alone and beside the others (${declared.size}, tri-state false and object values included)`, lostReal.join(', '));

  // NEGATIVE CONTROLS — the census must SEE each of the three ways the class came back
  const pinClause = /    if \(config\?\.poolPin && typeof config\.poolPin === 'object'[\s\S]*?\n    \}\n/;
  const preF1 = storeSrc.replace(pinClause, '');
  ok(preF1 !== storeSrc, 'control ①: the patch (the pin\'s clause removed — the store as the lane first shipped it) hits');
  ok(JSON.stringify(await dropped(await loadStore(preF1, 'prefix'), declared)) === '["poolPin"]', 'control ①: …and the census names exactly the key that store drops (poolPin — verify r1\'s F1)');
  const schemaSrc = src('src/session-schema.js');
  const grown = schemaSrc.replace("  _pickedModel:        {", "  _newPick:            { owner: 'ws', persisted: 'meta', config: { key: 'newPick', example: 'x' }, note: 'a future resume-carried pick' },\n  _pickedModel:        {");
  ok(grown !== schemaSrc, 'control ②: the patch (a new schema row that rides the resume) hits');
  const g = MC.load('src/session-schema.js', grown, 'grown');
  ok(JSON.stringify(await dropped(real, declaredOf(g.SESSION_FIELDS, g.SESSION_CONFIG_ONLY))) === '["newPick"]', 'control ②: …a declared key the store does not list FAILS the census (the whitelist cannot silently drop the next one)');
  const readsMore = { ...libTexts, 'src/lib/session-lifecycle.js': libTexts['src/lib/session-lifecycle.js'].replace('poolPin: savedCfg.poolPin,', 'poolPin: savedCfg.poolPin, brandNew: savedCfg.brandNew,') };
  ok(readsMore['src/lib/session-lifecycle.js'] !== libTexts['src/lib/session-lifecycle.js'], 'control ③: the patch (the resume reads a new key) hits');
  ok([...carrierKeys(readsMore)].filter((k) => !declared.has(k)).join() === 'brandNew', 'control ③: …a key the resume reads that the schema does not declare FAILS the census');
  const writesMore = { ...libTexts, 'src/lib/session-props.js': libTexts['src/lib/session-props.js'].replace('groupManager: cb.checked || undefined });', 'groupManager: cb.checked || undefined, freshToggle: 1 });') };
  ok([...carrierKeys(writesMore)].filter((k) => !declared.has(k)).join() === 'freshToggle', 'control ④: …and so does a key a writer adds');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
