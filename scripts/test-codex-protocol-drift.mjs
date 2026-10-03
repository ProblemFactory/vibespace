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
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { judge, wrapperRequestSites, wrapperConsumed, measuredTables, installedCodexVersion, WRAPPER } from './codex-protocol-census.mjs';
import { scratch, stopWrapper, withoutVendorKeys, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { writeStub } from './codex-app-server-stub.mjs';

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

console.log('— ②b the reset-credit helper (lane reset-path) judged against every measured table');
{
  // the helper (src/codex-reset-helper.js) is a SECOND app-server client: one bounded child a person's
  // Use… starts when no conversation can carry the credit — its requests are judged exactly like the wrapper's
  const HELPER = read('src/codex-reset-helper.js');
  const hs = wrapperRequestSites(HELPER);
  const hm = [...new Set(hs.flatMap((x) => x.methods))].sort();
  ok(JSON.stringify(hm) === JSON.stringify(['account/rateLimitResetCredit/consume', 'account/rateLimits/read', 'initialize']) && hs.every((x) => x.methods.length === 1),
    `the helper's census reads its three requests (${hm.join(', ')})`, JSON.stringify(hs));
  ok(hm.every((m) => m in (NEWEST.table.wrapperMethods || {})), `every helper method was PROBED by the newest table (${NEWEST.version})`, hm.filter((m) => !(m in (NEWEST.table.wrapperMethods || {}))).join(', '));
  ok(JSON.stringify(wrapperConsumed(HELPER).notifies) === '["initialized"]', 'the helper sends exactly one notification: initialized');
  for (const { version, table } of TABLES) {
    const f = judge(table, HELPER, { neverShipped: NEVER_SHIPPED });
    ok(f.length === 0, `codex ${version}: the helper is in step (0 findings)`, f.map((x) => `[${x.kind}] ${x.detail}`).join(' | '));
  }
  const pre = HELPER.replace("request('account/rateLimitResetCredit/consume', { idempotencyKey })", "request('account/rateLimitResetCredit/consume', {})");
  ok(pre !== HELPER && judge(NEWEST.table, pre, { neverShipped: NEVER_SHIPPED }).some((x) => x.kind === 'missing-required' && x.field === 'idempotencyKey'), 'CONTROL: a helper consume without the key is named — missing-required idempotencyKey');
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
  // lane reset-path: the answer's reading moved into the PURE rule (src/reset-credit.js creditAnswerOf) the engine calls
  const RCP = require(path.join(REPO, 'src/reset-credit.js'));
  // verify r3 (money): the PURE rule's closed set IS the measured enum, both ways — a word a re-measure adds is RED here
  // until it is classified, and a word in our set no table lists is a stale row; a word outside the set fails CLOSED
  for (const { version, table } of TABLES) ok(JSON.stringify([...table.resetCreditOutcomes].sort()) === JSON.stringify([...RCP.VENDOR_OUTCOMES].sort()), `codex ${version}: the measured outcome enum equals src/reset-credit.js VENDOR_OUTCOMES (${RCP.VENDOR_OUTCOMES.join(', ')})`, table.resetCreditOutcomes.join(', '));
  ok(RCP.creditAnswerOf({ outcome: 'somethingNew', idempotencyKey: 'k', attempts: 1 }).outcome === 'unknown-outcome' && RCP.outcomeArmsFloor('unknown-outcome') && RCP.UNSETTLED_OUTCOMES.includes('unknown-outcome') && RCP.creditAnswerOf({ result: {}, outcome: null, idempotencyKey: 'k', attempts: 1 }).outcome === 'unknown-outcome', 'an outcome word outside the measured enum (or an answer with none) fails CLOSED — unknown-outcome: charged, the floor, unsettled until a reading; never "nothing spent"');
  ok(RCP.creditAnswerOf({ outcome: 'alreadyRedeemed', idempotencyKey: 'k', attempts: 2 }).outcome === 'reset' && RCP.creditAnswerOf({ outcome: 'alreadyRedeemed' }).outcome === 'alreadyRedeemed' && /const ans = resetCredit\.creditAnswerOf\(payload\);/.test(ENGINE), 'a KEYED alreadyRedeemed is the press\'s own reset (the schema: "the same idempotency key already completed a reset")');
  ok(/session\.pty\.write\(JSON\.stringify\(\{ type: 'codex-reset-credit', idempotencyKey: idemKey, \.\.\.\(rf \? \{ readFirst: true \} : \{\}\) \}\)/.test(ENGINE) && /const idemKey = crypto\.randomUUID\(\);/.test(ENGINE), 'the engine\'s one writer mints the key per press and hands it down in the verb (lane reset-path verify r8 T0: with `readFirst` for a person\'s press on a wrapper that reads first)');
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
// the stub lives in ONE place since lane reset-path (scripts/codex-app-server-stub.mjs): the reset-credit
// helper's legs (test-reset-credit-ui, test-vendor-whitelist §8) drive the same measured-table answers
const STUB = writeStub(DIR);

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
