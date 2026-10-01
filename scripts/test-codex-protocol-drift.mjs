#!/usr/bin/env node
// THE CODEX PROTOCOL DRIFT GATE (lane-codex-0159, 2026-09-30) — fast tier.
//
// The incident: every codex reset credit failed with "Invalid request: missing
// field `idempotencyKey`" — the wrapper's `account/rateLimitResetCredit/consume`
// sent `{}`, and nothing compared the wrapper's requests with what the INSTALLED
// codex-cli accepts. This gate does, against tables MEASURED from the CLI itself
// (scripts/measure-codex-protocol.mjs — the CLI's own JSON Schema, launch-free,
// plus each method's answer to `{}` inside an empty network namespace):
//  ① every measured table is well-formed and names the version it measured;
//  ② the wrapper's census (every request(), every consumed name) is judged
//    against EVERY measured table — a missing required field, an unknown
//    method, a renamed field, a retired notification FAILS by name;
//  ③ every reset-credit outcome the CLI declares is handled by the engine;
//  ④ THE VERSION GATE: the installed codex-cli has a measured table — an update
//    nobody measured FAILS here by name (re-measure, read the diff, fix);
//  ⑤ the REAL wrapper against a stub app-server that answers as the measured
//    table says: boot + resume + driven verbs pass its validation; the consume
//    carries the press's key, a retry after no answer reuses it, a keyless
//    verb (older server) mints a UUID; CONTROL = the pre-fix wrapper reproduces
//    the incident's exact words.
// Zero vendor calls: the stub is a node script; no codex process starts here.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { judge, wrapperRequestSites, wrapperConsumed, measuredTables, installedCodexVersion, WRAPPER } from './codex-protocol-census.mjs';
import { scratch, stopWrapper, withoutVendorKeys, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + String(detail).slice(0, 600) : ''}`); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const SRC = read(WRAPPER);
const ENGINE = read('src/server/usage-pool-engine.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** names the wrapper consumes that NO measured binary sends, each with its reason */
const NEVER_SHIPPED = {
  'thread/resumed': 'absent from every measured binary (0.153.4 and 0.159.3: schema AND strings) — a defensive alias beside thread/started; the thread/resume RESPONSE carries the Thread (updateMetaFromThread)',
};

console.log('— ① the measured tables');
const TABLES = measuredTables(REPO);
ok(TABLES.length >= 2, `at least two measured tables (the newest + the one before it, the census's control): ${TABLES.map((t) => t.version).join(', ')}`);
for (const { version, table } of TABLES) {
  const wm = table.wrapperMethods || {};
  ok(table.codexVersion === version && /^\d{4}-\d{2}-\d{2}$/.test(table.measuredAt || '') && Object.keys(table.clientRequests || {}).length > 50 && (table.serverNotifications || []).length > 20,
    `${version}: names its own version, a date, the CLI's request + notification sets`);
  ok(Object.keys(wm).every((m) => table.clientRequests[m] && JSON.stringify(table.clientRequests[m].required) === JSON.stringify(wm[m].required)),
    `${version}: every probed wrapper method's required set equals the schema row`);
  ok(/\b(unshare|empty network namespace)\b/.test(table.how?.live || '') ? (table.how.network && table.how.network.inetOk === 0) : true,
    `${version}: the live half (when it ran) recorded ZERO internet-family calls that succeeded`, JSON.stringify(table.how?.network));
}
const NEWEST = TABLES[TABLES.length - 1];

console.log('— ② the wrapper judged against every measured table');
const sites = wrapperRequestSites(SRC);
const methods = [...new Set(sites.flatMap((s) => s.methods))].sort();
ok(sites.length >= 20 && sites.every((s) => s.methods.length > 0), `the census reads ${sites.length} request() sites, every one resolved to a method (${methods.length} methods)`, JSON.stringify(sites.filter((s) => !s.methods.length)));
ok(methods.includes('thread/start') && methods.includes('thread/resume') && methods.includes('thread/fork'), 'the dynamic site (startThread\'s `request(method, params)`) resolves to thread/start | thread/resume | thread/fork');
const missingFromNewest = methods.filter((m) => !(m in (NEWEST.table.wrapperMethods || {})));
ok(missingFromNewest.length === 0, `every method the wrapper calls was PROBED by the newest table (${NEWEST.version}) — a new call is measured before it ships`, missingFromNewest.join(', ') + ' — run node scripts/measure-codex-protocol.mjs');
for (const { version, table } of TABLES) {
  const f = judge(table, SRC, { neverShipped: NEVER_SHIPPED });
  ok(f.length === 0, `codex ${version}: the wrapper is in step (0 findings over ${methods.length} methods + ${wrapperConsumed(SRC).compared.length} consumed names)`, f.map((x) => `[${x.kind}] ${x.detail}${x.line ? ' (line ' + x.line + ')' : ''}`).join(' | '));
}
for (const [n, why] of Object.entries(NEVER_SHIPPED)) ok(TABLES.every(({ table }) => !table.serverNotifications.includes(n) && !table.serverRequests.includes(n)), `never shipped, pinned: ${n} — ${why.split(' — ')[0]}`);
// the census's changed rows, printed (what moved between the last two tables)
{
  const [a, b] = [TABLES[TABLES.length - 2], NEWEST];
  const rows = [];
  for (const m of methods) {
    const x = a.table.clientRequests[m], y = b.table.clientRequests[m];
    if (!x || !y) { rows.push(`${m}: ${x ? 'retired' : 'new'}`); continue; }
    if (JSON.stringify(x.required) !== JSON.stringify(y.required)) rows.push(`${m}: required ${JSON.stringify(x.required)} → ${JSON.stringify(y.required)}`);
    const add = y.properties.filter((k) => !x.properties.includes(k)), rm = x.properties.filter((k) => !y.properties.includes(k));
    if (add.length || rm.length) rows.push(`${m}: ${add.length ? '+' + add.join(',') : ''}${rm.length ? ' -' + rm.join(',') : ''}`);
  }
  console.log(`  · ${a.version} → ${b.version}, the wrapper's methods: ${rows.length ? rows.join(' · ') : 'unchanged'}`);
  ok(rows.every((r) => !/required|retired/.test(r)), `${a.version} → ${b.version}: no wrapper method gained a required field or was retired (additive optional fields only)`, rows.join(' | '));
  const consume = 'account/rateLimitResetCredit/consume';
  ok(TABLES.every(({ table }) => JSON.stringify(table.clientRequests[consume]?.required) === '["idempotencyKey"]'),
    `pinned: ${consume} requires idempotencyKey on EVERY measured version (${TABLES.map((t) => t.version).join(', ')}) — the keyless consume was broken before 0.159.3 too`);
  const e = NEWEST.table.wrapperMethods[consume]?.errorOnEmpty?.message || '';
  ok(e === 'Invalid request: missing field `idempotencyKey`', `the incident's words are the CLI's own answer to the keyless consume (measured live on ${NEWEST.version})`, e);
}

console.log('— ② controls: each finding kind is produced when its drift is planted');
{
  const consumeLine = "request('account/rateLimitResetCredit/consume', { idempotencyKey }, RESET_CREDIT_CONSUME_TIMEOUT_MS)";
  ok(SRC.includes(consumeLine), 'the consume site is spelled as the controls expect');
  const preFix = SRC.replace(consumeLine, "request('account/rateLimitResetCredit/consume', {}, 30000)");
  for (const { version, table } of TABLES) {
    const f = judge(table, preFix, { neverShipped: NEVER_SHIPPED });
    ok(f.length === 1 && f[0].kind === 'missing-required' && f[0].field === 'idempotencyKey', `CONTROL (${version}): the PRE-FIX consume (\`{}\`) is named — missing-required idempotencyKey`, JSON.stringify(f));
  }
  const t = JSON.parse(JSON.stringify(NEWEST.table));
  t.clientRequests['turn/start'].required = [...t.clientRequests['turn/start'].required, 'brandNewField'];
  delete t.clientRequests['turn/steer'];
  t.clientRequests['thread/goal/set'].properties = t.clientRequests['thread/goal/set'].properties.filter((k) => k !== 'objective');
  t.serverNotifications = t.serverNotifications.filter((n) => n !== 'turn/plan/updated');
  const kinds = judge(t, SRC, { neverShipped: NEVER_SHIPPED }).map((x) => `${x.kind}:${x.method}${x.field ? '.' + x.field : ''}`).sort();
  ok(JSON.stringify(kinds) === JSON.stringify(['missing-required:turn/start.brandNewField', 'retired-notification:turn/plan/updated', 'unknown-field:thread/goal/set.objective', 'unknown-method:turn/steer']),
    'CONTROL: a planted new required field / retired method / renamed field / retired notification each FAILS by name', kinds.join(' | '));
  const f2 = judge(NEWEST.table, SRC, { neverShipped: {} });
  ok(f2.length === 1 && f2[0].method === 'thread/resumed', 'CONTROL: without its never-shipped row the alias is reported (the row is load-bearing)', JSON.stringify(f2));
}

console.log('— ③ every reset-credit outcome the CLI declares is handled');
{
  const words = (ENGINE.match(/const RESET_CREDIT_OUTCOME_WORDS = \{([^}]*)\}/) || [])[1] || '';
  const worded = [...words.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  const handled = new Set(['reset', 'alreadyRedeemed', ...worded]);
  for (const { version, table } of TABLES) {
    const un = table.resetCreditOutcomes.filter((o) => !handled.has(o));
    ok(table.resetCreditOutcomes.length >= 4 && un.length === 0, `codex ${version}: outcomes ${table.resetCreditOutcomes.join(', ')} — each is the reset path, the keyed alreadyRedeemed, or said in words`, un.join(', '));
  }
  ok(/out0 === 'alreadyRedeemed' && keyed \? 'reset' : out0/.test(ENGINE), 'a KEYED alreadyRedeemed is the press\'s own reset (the schema: "the same idempotency key already completed a reset")');
  ok(/session\.pty\.write\(JSON\.stringify\(\{ type: 'codex-reset-credit', idempotencyKey: idemKey \}\)/.test(ENGINE) && /const idemKey = crypto\.randomUUID\(\);/.test(ENGINE), 'the engine\'s one writer mints the key per press and hands it down in the verb');
}

console.log('— ④ THE VERSION GATE: the installed codex-cli was measured');
/** PURE: the verdict for an installed version against the measured tables. */
const versionVerdict = (installed, tables) => {
  if (!installed) return { ok: true, skip: true };
  const hit = tables.find((t) => t.version === installed);
  return hit ? { ok: true, table: hit.version } : { ok: false, why: `codex-cli ${installed} is installed, but the protocol tables measure ${tables.map((t) => t.version).join(', ')} — nobody measured this version. Run \`node scripts/measure-codex-protocol.mjs\`, read the diff against ${tables[tables.length - 1].version}, fix every method the census names in ${WRAPPER}, commit the new table WITH the fix.` };
};
{
  const inst = installedCodexVersion({ env: withoutVendorKeys(process.env) });
  const v = versionVerdict(inst && inst.version, TABLES);
  if (v.skip) console.log('  SKIP: no `codex` on PATH — the version gate did not run (② still judges the wrapper against every measured table)');
  else ok(v.ok, `the installed codex-cli ${inst.version} (${path.basename(inst.how)}) has a measured table`, v.why);
  const c = versionVerdict('9.99.0', TABLES);
  ok(!c.ok && /codex-cli 9\.99\.0 is installed/.test(c.why) && /measure-codex-protocol/.test(c.why), 'CONTROL: an unmeasured version FAILS by name, with the remedy', c.why);
}

console.log('— ⑤ the REAL wrapper against a stub app-server driven by the measured table');
const DIR = scratch('cx159');
fs.mkdirSync(DIR, { recursive: true });
const cleanup = () => { try { endRootedProcesses(DIR); } catch { } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
const STUB = path.join(DIR, 'stub-app-server.cjs');
fs.writeFileSync(STUB, `'use strict';
const fs = require('fs');
const T = JSON.parse(fs.readFileSync(process.env.STUB_TABLE, 'utf8'));
const LOG = process.env.STUB_LOG, MODE = process.env.STUB_MODE || 'answer';
// the CLI's own words, read off the measured table (never spelled here)
const missingWords = (f) => T.wrapperMethods['account/rateLimitResetCredit/consume'].errorOnEmpty.message.replace(/\`[^\`]+\`/, '\`' + f + '\`');
const unknownWords = (m) => T.unknownMethodError.message.replace(/\`[^\`]+\`/, '\`' + m + '\`').split(', expected')[0];
const seenKeys = new Set(); const dropped = new Set();
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
let b = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) >= 0) { const l = b.slice(0, i); b = b.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; }
  if (m.id === undefined || !m.method) continue;
  const row = T.clientRequests[m.method];
  const p = m.params || {};
  let verdict = 'ok', error = null;
  if (!row) error = { code: T.unknownMethodError.code, message: unknownWords(m.method) };
  else { const miss = row.required.filter((f) => !(f in p) || p[f] === undefined || p[f] === null); if (miss.length) error = { code: -32600, message: missingWords(miss[0]) }; }
  if (!error && m.method === 'account/rateLimitResetCredit/consume' && p.idempotencyKey === '') error = { code: -32600, message: 'idempotencyKey must not be empty' };
  if (error) verdict = 'refused';
  fs.appendFileSync(LOG, JSON.stringify({ method: m.method, params: p, verdict, error: error && error.message }) + '\\n');
  if (error) { out({ id: m.id, error }); continue; }
  let r = {};
  if (m.method === 'initialize') r = { userAgent: 'stub/' + T.codexVersion };
  else if (/^thread\\/(start|resume|fork)$/.test(m.method)) r = { thread: { id: p.threadId || 'th-stub-1', name: null }, model: 'gpt-stub', reasoningEffort: 'medium' };
  else if (m.method === 'account/rateLimits/read') r = { rateLimits: { primary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 86400 }, secondary: null }, rateLimitResetCredits: { availableCount: 1, credits: null } };
  else if (m.method === 'account/rateLimitResetCredit/consume') {
    const k = p.idempotencyKey;
    if (MODE === 'drop-first' && !dropped.has(k)) { dropped.add(k); seenKeys.add(k); continue; } // no answer: the consume landed, the reply was lost
    r = { outcome: seenKeys.has(k) ? 'alreadyRedeemed' : 'reset' }; seenKeys.add(k);
  }
  else if (m.method === 'thread/queue/list') r = { data: [] };
  else if (m.method === 'thread/goal/get') r = { goal: null };
  else if (m.method === 'turn/start') r = { turn: { id: 'turn-stub-1', status: 'inProgress', items: [] } };
  else if (m.method === 'thread/name/set') r = { thread: { id: p.threadId, name: p.name } };
  else if (m.method === 'config/read') r = { config: {}, origins: {}, layers: [] };
  out({ id: m.id, result: r });
} });
// the app-server's own lifetime rule: stdin closed (the wrapper is gone) ⇒ exit —
// a stub that outlives its wrapper is an orphan for the scratch reaper
process.stdin.on('end', () => process.exit(0));
`);

async function runWrapper(tag, { wrapperFile = path.join(REPO, WRAPPER), env = {}, mode = 'answer', drive = async () => { } } = {}) {
  const d = path.join(DIR, tag); fs.mkdirSync(d, { recursive: true });
  const log = path.join(d, 'rpc.ndjson'); fs.writeFileSync(log, '');
  const SID = 'sess-1-1700000000159';
  const w = spawn(process.execPath, [wrapperFile, path.join(d, SID + '.buf'), path.join(d, SID + '.json'), process.execPath, STUB], {
    stdio: ['pipe', 'pipe', 'pipe'], cwd: d,
    env: { ...withoutVendorKeys(process.env), HOME: d, CODEX_HOME: path.join(d, 'no-codex-home'), CODEX_WEBUI_CWD: d, VIBESPACE_API: '', VIBESPACE_SESSION_TOKEN: '', VIBESPACE_SKIP_AGENT_HOOKS: '1', STUB_TABLE: NEWEST.file, STUB_LOG: log, STUB_MODE: mode, ...env },
  });
  let out = ''; w.stdout.on('data', (x) => { out += x; }); w.stderr.on('data', () => { });
  const recs = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const rpc = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const until = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(40); } return false; };
  const send = (o) => w.stdin.write(JSON.stringify(o) + '\n');
  const booted = await until(() => rpc().some((r) => r.method === 'thread/queue/list'));
  const ctx = { w, recs, rpc, until, send, booted, events: (type) => recs().filter((r) => r.type === 'event_msg' && r.payload?.type === type).map((r) => r.payload) };
  try { await drive(ctx); } finally { await stopWrapper(w); }
  return ctx;
}

const exercised = new Set();
const refusedOf = (ctx) => ctx.rpc().filter((r) => r.verdict !== 'ok');
{
  const a = await runWrapper('boot', {
    drive: async (c) => {
      c.send({ type: 'codex-reset-credit', idempotencyKey: 'k-press-0001' });
      await c.until(() => c.events('reset_credit_result').length > 0);
      c.send({ type: 'codex-read-limits' });
      c.send({ type: 'set-thread-name', name: 'drift probe' });
      c.send({ type: 'set-goal', goal: 'measure the protocol' });
      c.send({ type: 'read-permission-rules', requestId: 'r1' });
      c.send({ type: 'chat-input', text: 'hello', msgId: 'm-1' });
      await c.until(() => ['thread/name/set', 'thread/goal/set', 'config/read', 'turn/start'].every((m) => c.rpc().some((r) => r.method === m)));
    },
  });
  ok(a.booted, 'boot: the real wrapper came up on the stub (initialize → thread/start → … → thread/queue/list)');
  for (const r of a.rpc()) exercised.add(r.method);
  ok(refusedOf(a).length === 0, `boot + driven verbs: every request passed the ${NEWEST.version} table's validation (${a.rpc().length} requests over ${new Set(a.rpc().map((r) => r.method)).size} methods)`, JSON.stringify(refusedOf(a)));
  const consumes = a.rpc().filter((r) => r.method === 'account/rateLimitResetCredit/consume');
  ok(consumes.length === 1 && consumes[0].params.idempotencyKey === 'k-press-0001', 'the consume carries the PRESS\'s key, exactly once', JSON.stringify(consumes));
  const res = a.events('reset_credit_result')[0] || {};
  ok(res.outcome === 'reset' && res.idempotencyKey === 'k-press-0001' && res.attempts === 1, 'the answer names the outcome, echoes the key, one attempt', JSON.stringify(res));
  const rpcs = a.rpc().map((x) => x.method), ic = rpcs.indexOf('account/rateLimitResetCredit/consume');
  const order = a.recs().map((r) => r.payload?.type).filter((t) => t === 'rate_limits_updated' || t === 'reset_credit_result');
  ok(ic >= 0 && rpcs.indexOf('account/rateLimits/read', ic + 1) > ic && order[order.indexOf('reset_credit_result') - 1] === 'rate_limits_updated', 'the post-reset reading still goes out BEFORE the answer (reset credits r3 unchanged)', `${rpcs.join(',')} :: ${order.join(',')}`);
}
{
  const r = await runWrapper('retry', {
    mode: 'drop-first', env: { VIBESPACE_CODEX_RESET_TIMEOUT_MS: '400' },
    drive: async (c) => { c.send({ type: 'codex-reset-credit', idempotencyKey: 'k-press-0002' }); await c.until(() => c.events('reset_credit_result').length > 0, 6000); },
  });
  const consumes = r.rpc().filter((x) => x.method === 'account/rateLimitResetCredit/consume');
  ok(consumes.length === 2 && consumes.every((x) => x.params.idempotencyKey === 'k-press-0002'), 'RETRY: a consume with no answer is retried ONCE with the SAME key (the vendor dedupes — never two credits for one press)', JSON.stringify(consumes.map((x) => x.params)));
  const res = r.events('reset_credit_result')[0] || {};
  ok(res.outcome === 'alreadyRedeemed' && res.attempts === 2 && res.idempotencyKey === 'k-press-0002', 'RETRY: the retry is answered `alreadyRedeemed` (this key\'s reset completed) and the answer says two attempts — the engine reads it as the press\'s reset', JSON.stringify(res));
}
{
  const o = await runWrapper('keyless', {
    drive: async (c) => { c.send({ type: 'codex-reset-credit' }); await c.until(() => c.events('reset_credit_result').length > 0); },
  });
  const k = o.rpc().find((x) => x.method === 'account/rateLimitResetCredit/consume')?.params?.idempotencyKey || '';
  ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(k) && (o.events('reset_credit_result')[0] || {}).idempotencyKey === k, 'a verb with NO key (a server older than the key) — the wrapper mints its own UUID and echoes it', k);
}
{
  const res = await runWrapper('resume', { env: { CODEX_WEBUI_RESUME_ID: 'th-resumed-1' } });
  for (const r of res.rpc()) exercised.add(r.method);
  ok(res.booted && res.rpc().some((r) => r.method === 'thread/resume' && r.params.threadId === 'th-resumed-1') && refusedOf(res).length === 0, 'resume boot: thread/resume carries its threadId and every request passes', JSON.stringify(refusedOf(res)));
}
{
  // CONTROL: the PRE-FIX wrapper (the consume back to `{}`) against the same stub reproduces the incident
  const M = mutantCopies('cx159', REPO);
  const pre = SRC.replace("request('account/rateLimitResetCredit/consume', { idempotencyKey }, RESET_CREDIT_CONSUME_TIMEOUT_MS)", "request('account/rateLimitResetCredit/consume', {}, 30000)");
  ok(pre !== SRC, 'CONTROL: the pre-fix patch applies');
  const f = M.write(WRAPPER, pre, 'prefix');
  const c = await runWrapper('control', { wrapperFile: f, drive: async (x) => { x.send({ type: 'codex-reset-credit', idempotencyKey: 'k-press-0003' }); await x.until(() => x.events('reset_credit_result').length > 0); } });
  const res = c.events('reset_credit_result')[0] || {};
  ok(res.error === 'Invalid request: missing field `idempotencyKey`' && refusedOf(c).length === 1, 'CONTROL: the pre-fix wrapper gets the incident\'s exact answer from the table-driven stub (the leg can see the defect)', JSON.stringify(res));
}
{
  // no stub outlives its wrapper (each one exits on stdin EOF) — read /proc, not a pid list
  const live = () => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).filter((d) => { try { return fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').includes(STUB); } catch { return false; } });
  const t0 = Date.now(); while (live().length && Date.now() - t0 < 3000) await sleep(50);
  ok(live().length === 0, 'every stub app-server exited with its wrapper (stdin EOF) — nothing left for the scratch reaper', live().join(','));
}
const uncovered = methods.filter((m) => !exercised.has(m) && m !== 'account/rateLimitResetCredit/consume');
console.log(`  · stub-driven: ${[...exercised].filter((m) => methods.includes(m)).length}/${methods.length} wrapper methods; judged statically only: ${uncovered.join(', ')}`);

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed' : ''})`);
process.exit(fail ? 1 : 0);
