// test-accounts-held-consumers.mjs — THE ACCOUNTS LIST UNREAD, the consumers' side (主开发 r3044 / r3047; the page
// bl-accounts/held/consumers-page.md). Every consumer that acts on the list's silence asks the list's ONE fact,
// accounts.held(), and never its own guess. The unreadable file is a PLACED refusal of every READ of data/accounts.json
// (EIO for that one path; writes pass); a REAL AccountManager starts over it. Each held leg stands beside a CONTROL on the same
// stand-ins (the store read), and each cure has a RED copy without its question. Made-up accounts only; nothing is spawned.
//   S1 the unattended continue's gate HOLDS (re-armed, nothing spent)   S2 the fire identity is NONE (the authorizer refuses)
//   S3 a verdict naming an account is not usable                        S4 the reset credit's identity is unknown
//   F1 a pooled conversation's reading is NOT filed                     F2 the attribution journal records nothing
//   D1 the reset claims are pruned of nothing                           D2 the sign-in expiry sweep does nothing
//   D3 the CLI models door drops no entry (its refresh refused by name has no leg here: it needs a person's press)
//   M1/M2 the two account-store migrations THROW (not recorded; tried again at the next start)
//   SG the spend guard ITSELF (r3060 / r3088, first): a turn nobody typed, past a cap of one — REFUSED by name, no counter touched
//   M3 the four September migrations that read the list themselves THROW on a refused read (one table, its red)
//   H the usage history WAITS: its walk bakes nothing, a paired machine's rows are deferred, the re-bake marks nothing
//   Q4 the usage reply says accountsHeld
//   r3132 (b) the long-lived sign-in's file sweep does nothing while held and runs at the lift's first tick; (c) an unexpected exit's
//   one-shot resume is not spent on the list's refusal (asked at the lift); (d) the agents' roster says the list could not be read
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST after node's own (§113): the suite runs on a temp home of its own before any of its code
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { waitEverySave } = require('./lib/accounts-landed.cjs');   // B-574d unit 1 (a): accounts.json is the store writer's — each save waited for (the suite's thread)
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ahc-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const MUT = mutantCopies('accounts-held-consumers', REPO);
const copy = (rel, edits, why) => { try { const src = fs.readFileSync(path.join(REPO, rel), 'utf8'); return { path: MUT.write(rel, edits.reduce((s, [a, b, c]) => anchored(s, a, b, why, { count: c || 1 }), src)) }; } catch (e) { return { err: e.message }; } };
const quiet = async (fn) => { const l = console.log, w = console.warn; const said = []; console.log = (...a) => said.push(a.join(' ')); console.warn = (...a) => said.push(a.join(' ')); try { return { r: await fn(), said }; } finally { console.log = l; console.warn = w; } };

// ── THE PLACED REFUSAL: every READ of that one file throws EIO; writes pass ──
const RAW = { readFileSync: fs.readFileSync, readFile: fs.readFile, pReadFile: fs.promises.readFile, pOpen: fs.promises.open };
const rawRead = (f) => RAW.readFileSync.call(fs, f);
function refuseReadsOf(file) {
  const hit = (p) => { try { return path.resolve(String(p)) === path.resolve(file); } catch { return false; } };
  const readFlag = (f) => f === undefined || f === null || f === 'r' || f === 'rs' || f === fs.constants.O_RDONLY;
  const eio = () => Object.assign(new Error(`EIO: i/o error, read '${file}' (a placed refusal)`), { code: 'EIO', errno: -5, syscall: 'read', path: file });
  fs.readFileSync = function (p, ...a) { if (hit(p)) throw eio(); return RAW.readFileSync.call(this, p, ...a); };
  fs.readFile = function (p, ...a) { if (hit(p)) { const cb = a[a.length - 1]; if (typeof cb === 'function') { process.nextTick(cb, eio()); return undefined; } } return RAW.readFile.call(this, p, ...a); };
  fs.promises.readFile = function (p, ...a) { if (hit(p)) return Promise.reject(eio()); return RAW.pReadFile.call(this, p, ...a); };
  fs.promises.open = function (p, f, ...a) { if (hit(p) && readFlag(f)) return Promise.reject(eio()); return RAW.pOpen.call(this, p, f, ...a); };
  return () => { fs.readFileSync = RAW.readFileSync; fs.readFile = RAW.readFile; fs.promises.readFile = RAW.pReadFile; fs.promises.open = RAW.pOpen; };
}
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
waitEverySave(AccountManager);
// ── THE STAND-IN WORLD: two signed-in subscriptions (A the default), a pool of both (A its current), saved by the store ──
let n = 0;
function world(tag) {
  const root = path.join(ROOT, `${tag}-${++n}`), D = path.join(root, 'data');
  fs.mkdirSync(D, { recursive: true });
  const am = new AccountManager({ dataDir: D });
  const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'ref-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, scopes: ['user:inference'], subscriptionType: 'max' } }));
  const A = am.createSubscription({ name: 'Member A' }).id; login(A);
  const B = am.createSubscription({ name: 'Member B' }).id; login(B);
  const P = am.poolSupported() ? am.createPool({ name: 'Team pool', members: [A, B] }).id : null;
  if (P) am.setPoolTarget(P, A);
  am.setDefault(A);
  return { root, D, am, A, B, P, file: path.join(D, 'accounts.json') };
}
/** THE HELD STORE over a world: a NEW AccountManager (a hub start) whose read of accounts.json is refused. On a base whose store
 *  carries no held() yet (before bl-windows' list unit) a STAND-IN answers, and the premise leg below is red by name */
let standIns = 0;
function held(w) {
  const undo = refuseReadsOf(w.file);
  const h = new AccountManager({ dataDir: w.D });
  if (typeof h.held !== 'function') { standIns++; h.held = () => ({ code: 'EIO', why: 'a stand-in: this store carries no held() yet', at: 1 }); }
  return { h, undo };
}
{ const w = world('premise'), { h, undo } = held(w); let ans = null; try { ans = h.held(); } finally { undo(); }
  ok(!!ans && standIns === 0, 'PREMISE: the store over the refused file answers its own held() (bl-windows\' list unit) — no stand-in', JSON.stringify({ code: ans && ans.code, standIn: standIns > 0 }));
  const r = new AccountManager({ dataDir: w.D });
  ok(!(typeof r.held === 'function' && r.held()), 'PREMISE: the store over the READABLE file answers nothing from held()'); }

// ── THE ENGINE: S1 S2 S3 S4 F1 — a real pool engine over the world, its release twin for the red ──
const ENG = 'src/server/usage-pool-engine.js';
const w0P = (() => { let v = null; return () => (v === null ? (v = !!world('pools').P) : v); })();   // pools supported on this platform
const engRed = copy(ENG, [["function accountsHeld() { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown', why: 'the accounts store did not answer', at: 0 }; } }", 'function accountsHeld() { return null; }']], 'the engine never asks (RED)');
ok(!engRed.err, 'RED CONTROL built: an engine that never asks held()', engRed.err || '');
async function engineScene(engPath, am, w) {
  const engMod = require(engPath);
  const cacheDir = path.join(w.D, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const at = Date.now() - 1000, rs = Math.floor(Date.now() / 1000) + 3 * 3600;
  for (const id of [w.A, w.B]) fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: at, source: 'cli-usage', fiveHour: { utilization: 0.2, resetsAt: rs }, sevenDay: { utilization: 0.3, resetsAt: rs + 4 * 86400 } }));
  const sessions = new Map(), arms = [];
  const eng = engMod.create({
    app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { }, locals: {} }, rootDir: w.root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null,
    getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => ({ armIfEnabled: (...a) => { arms.push(a); } }), getQuotaProbe: () => null,
  });
  const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'w-ahc-' + n, claudeSessionId: 'c-ahc-' + n, _accountId: w.P, pty: { write() { } }, name: 'w-ahc' };
  sessions.set(s._webuiId, s);
  try { am.ensureSessionPoolLink(w.P, s._webuiId, w.A); } catch { }
  const before = fs.readdirSync(cacheDir).sort().join(',');
  const out = await quiet(async () => {
    const r = {};
    try { r.fire = eng.fireIdentityFor(s); } catch (e) { r.fire = { threw: e.message }; }
    try { r.key = eng.resolveUsageKey(s); } catch (e) { r.key = { threw: e.message }; }
    try { const v = eng.quotaVerdictFor(w.P, { session: s }); r.verdict = { usable: v.usable, held: !!v.accountsHeld }; } catch (e) { r.verdict = { threw: e.message }; }
    try { const g = eng.quotaVerdictFor('__global__'); r.machine = { held: !!g.accountsHeld }; } catch (e) { r.machine = { threw: e.message }; }
    try { r.credit = eng.creditIdentityFor(s); } catch (e) { r.credit = { threw: e.message }; }
    try { eng.recordRateLimitEvent(s, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.4, resetsAt: rs } }); } catch (e) { r.recordThrew = e.message; }
    try { r.gate = await eng.beforeAutoResumeFire(s._webuiId, s); } catch (e) { r.gate = { threw: e.message }; }
    return r;
  });
  return { ...out.r, said: out.said, arms, filed: fs.readdirSync(cacheDir).sort().join(',') !== before, poolFile: fs.existsSync(path.join(cacheDir, w.P + '.json')) };
}
if (!fs.existsSync(path.join(REPO, ENG))) ok(false, 'the engine is where this suite reads it');
{ const w = world('engine');
  if (!w.P) ok(true, 'S · SKIP — pools unsupported on ' + process.platform);
  else {
    const ctl = await engineScene(path.join(REPO, ENG), w.am, w);
    ok(ctl.fire && ctl.fire.key && ctl.fire.key !== w.P && ctl.gate === true, 'CONTROL (the list read): the fire identity is a MEMBER and a continue on a healthy pool fires — the legs see the roads', JSON.stringify({ fire: !!(ctl.fire && ctl.fire.key), gate: ctl.gate }));
    const { h, undo } = held(w); let got = null, red = null;
    try { got = await engineScene(path.join(REPO, ENG), h, w); if (!engRed.err) red = await engineScene(engRed.path, h, w); } finally { undo(); }
    ok(got.gate === false && got.arms.length === 1 && /could not be read/.test(String(got.arms[0][3])) && got.said.some((l) => /continue held at the fire — the accounts list could not be read/.test(l)), 'S1 · held: the unattended continue\'s gate HOLDS — re-armed to look again, said once, nothing spent', JSON.stringify({ gate: got.gate, arms: got.arms.length }));
    ok(got.fire === null, 'S2 · held: the fire identity is NONE (never the pool\'s own id: no fresh counters at zero; the authorizer refuses an unknown key)', JSON.stringify(got.fire));
    ok(got.verdict && got.verdict.usable === false && got.verdict.held && got.machine && !got.machine.held, 'S3 · held: a verdict naming the pool is NOT usable (said held); the machine\'s own login needs no list', JSON.stringify({ verdict: got.verdict, machine: got.machine }));
    ok(got.credit && got.credit.key === null && got.credit.unknown === true, 'S4 · held: the reset credit\'s identity is unknown — nothing consumed or previewed on a key the list cannot confirm', JSON.stringify(got.credit));
    ok(got.key === null && !got.filed && !got.poolFile && got.said.some((l) => /readings are not filed — the accounts list could not be read/.test(l)), 'F1 · held: a pooled conversation\'s reading has NO filing identity and is NOT filed (said once), never under the pool\'s own id', JSON.stringify({ key: got.key, filed: got.filed, poolFile: got.poolFile }));
    if (red) ok(red.gate === true && red.fire && red.fire.key === w.P, 'RED: the engine that never asks fires the continue and keys its spend on the pool\'s own id', JSON.stringify({ gate: red.gate, fire: red.fire }));
  } }
// ── r3197 THE ROUND's MUST: the second road of the readings — a pooled CODEX conversation's push while held files NOTHING ──
async function codexScene(engPath, am, w) {
  const engMod = require(engPath);
  const cacheDir = path.join(w.D, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const eng = (await quiet(async () => engMod.create({ app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { }, locals: {} }, rootDir: w.root, USAGE_CACHE_DIR: cacheDir, activeSessions: new Map(),
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null }))).r;
  const s = { backend: 'codex', mode: 'chat', host: null, _webuiId: 'w-cx-' + (++n), backendSessionId: 'cx-' + n, _accountId: w.P, pty: { write() { } }, name: 'codex pooled' };
  const nowS = Math.floor(Date.now() / 1000);
  const said = (await quiet(async () => { try { eng.recordCodexQuotaSignal(s, { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 30, window_minutes: 300, resets_at: nowS + 3600 }, secondary: null } }); } catch { } })).said;
  return { poolFile: fs.readdirSync(cacheDir).some((f) => f.startsWith(w.P)), said };
}
if (w0P()) {
  const w = world('codex'), { h, undo } = held(w); let got = null, red = null;
  try { got = await codexScene(path.join(REPO, ENG), h, w); if (!engRed.err) { const w2 = world('codex-red'), t2 = held(w2); try { red = await codexScene(engRed.path, t2.h, w2); } finally { t2.undo(); } } } finally { undo(); }
  ok(!!got && !got.poolFile && got.said.some((l) => /codex:.*readings are not filed — the accounts list could not be read/.test(l)), 'r3197 MUST · held: a pooled CODEX conversation\'s quota push files NOTHING (never a cache file under the pool\'s own id), said once', JSON.stringify(got && { poolFile: got.poolFile }));
  if (red) ok(red.poolFile === true, 'RED: the engine that never asks files the codex reading under the POOL\'s own id (the phantom pool reading the round found)', JSON.stringify({ poolFile: red.poolFile }));
}
// S2's other half: the authorizer refuses an identity that is none (fail closed) — the pure rule the engine's NONE lands on
{ const SA = require(path.join(REPO, 'src/spend-authorizer.js'));
  const fn = SA.authorizeUnattendedSpend || SA.authorize;
  let v = null; try { v = fn({ state: { identities: {}, instance: [] }, identity: null, reason: Object.keys(SA.SPEND_REASONS || {})[0], now: Date.now() }); } catch (e) { v = { threw: e.message }; }
  ok(v && v.ok === false && v.why === 'identity-unknown', 'S2 · the spend authorizer refuses a turn whose identity is NONE (identity-unknown) — what the held engine hands it', JSON.stringify(v && { ok: v.ok, why: v.why, threw: v.threw })); }

// ── SG: THE SPEND GUARD ITSELF (r3060's last paragraph, r3088 — the line's first) ──
async function guardScene(engPath, w) {
  const engMod = require(engPath);
  const SET = { 'spend.unattendedPerIdentityHour': 1, 'spend.unattendedPerIdentityDay': 50, 'spend.unattendedPerInstanceDay': 100 };
  let cur = w.am;   // ONE hub process: its guard's counts in memory; the list it reads becomes held below
  const cacheDir = path.join(w.D, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const sessions = new Map(), sid = 'w-guard-' + (++n);
  const eng = (await quiet(async () => engMod.create({ app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { }, locals: {} }, rootDir: w.root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: (k) => SET[k], getAccounts: () => cur, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null }))).r;
  const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'c-' + sid, _accountId: w.P, pty: { write() { } }, name: 'guarded conversation' };
  sessions.set(sid, s);
  try { w.am.ensureSessionPoolLink(w.P, sid, w.A); } catch { }
  const G = eng.spendGuard;
  const ask = async (hold) => (await quiet(async () => G.authorize({ reason: 'auto-resume', session: s, sessionId: sid, hold }))).r;
  const spend = async (v) => { if (v && v.ok && v.hold) await quiet(async () => G.note({ reason: 'auto-resume', session: s, hold: v.hold })); };
  const ids = () => { try { G.flush(); } catch { } try { const j = JSON.parse(rawRead(path.join(w.D, 'spend-budget.json'))); return Object.fromEntries(Object.entries(j.identities || {}).map(([k, l]) => [k, (l || []).length])); } catch { return null; } };
  const v1 = await ask(true); await spend(v1); const v2 = await ask(false); const before = ids();
  const { h, undo } = held(w); let v3 = null, after = null;
  try { cur = h; v3 = await ask(true); await spend(v3); after = ids(); } finally { cur = w.am; undo(); }
  const v4 = await ask(false);   // the list read again: the member's own count, as the hold left it
  return { v1, v2, v3, v4, before, after };
}
{ const w = world('guard');
  if (!w.P) ok(true, 'SG · SKIP — pools unsupported on ' + process.platform);
  else {
    const g = await guardScene(path.join(REPO, ENG), w);
    ok(!!(g.v1 && g.v1.ok && g.v2 && g.v2.ok === false && g.v2.why === 'hour-cap'), 'SG · CONTROL (the list read): a cap of one turn nobody typed an hour — the first is let through and charged on its member, the second REFUSED by the hour cap', JSON.stringify({ first: g.v1 && g.v1.ok, second: g.v2 && g.v2.why }));
    ok(!!(g.v3 && g.v3.ok === false && g.v3.why === 'identity-unknown' && g.v3.accountsHeld && /accounts list could not be read/.test(String(g.v3.detail))), 'SG · held: the SAME conversation\'s next turn nobody typed is REFUSED BY NAME (the accounts list could not be read) — never counted under a fresh name', JSON.stringify(g.v3 && { ok: g.v3.ok, why: g.v3.why, held: !!g.v3.accountsHeld }));
    const ck = (v) => (v && v.counts) || {}, k2 = g.v2 && g.v2.identity && g.v2.identity.key;
    ok(!!k2 && k2 !== w.P && Number(ck(g.v2).hour) >= 1 && !!g.v4 && g.v4.why === 'hour-cap' && g.v4.identity && g.v4.identity.key === k2 && ck(g.v4).hour === ck(g.v2).hour && ck(g.v4).day === ck(g.v2).day, 'SG · …and the hour and day counters of every real identity are UNTOUCHED by that refusal: the list read again, the MEMBER (never the pool) still meets its cap at the same counts', JSON.stringify({ member: !!k2 && k2 !== w.P, before: { hour: ck(g.v2).hour, day: ck(g.v2).day }, after: g.v4 && { why: g.v4.why, hour: ck(g.v4).hour, day: ck(g.v4).day } }));
    if (!engRed.err) { const w2 = world('guard-red'); const r = await guardScene(engRed.path, w2); ok(!!(r.v3 && r.v3.ok === true && r.v3.identity && r.v3.identity.key === w2.P), 'RED (the base\'s way, as the verifier found it): an engine that never asks lets the turn nobody typed THROUGH, past the cap, under the pool\'s own id as a fresh name', JSON.stringify(r.v3 && { ok: r.v3.ok, poolKey: !!(r.v3.identity && r.v3.identity.key === w2.P) })); }
  } }

// ── M3: the four September migrations that read the list themselves THROW on a refused read (one table, its red) ──
{ const MIG = 'src/server/migrations.js', IDS = ['2026-09-reattribute-readings-by-slot', '2026-09-refile-readings-by-window-v2', '2026-09-backfill-ledger-by-slot', '2026-09-repair-sidecars-by-api-phase'];
  const THROW = "catch (e) { if (!(e && e.code === 'ENOENT')) throw accountsUnread(e); }";
  const src = fs.readFileSync(path.join(REPO, MIG), 'utf8'), nThrow = src.split(THROW).length - 1;
  const red = copy(MIG, [[THROW, 'catch { }', 3]], 'the September reads say nothing (RED)');
  const { runMigrations } = require(path.join(REPO, 'src/migration-runner.js'));
  const recorded = (w) => { try { const j = JSON.stringify(JSON.parse(rawRead(path.join(w.D, 'migrations.json')))); return IDS.filter((id) => j.includes(id)); } catch { return []; } };
  const tree = (w) => ['archive', 'usage-anchors', 'usage-cache'].map((d) => { try { return d + ':' + fs.readdirSync(path.join(w.D, d)).sort().join('|'); } catch { return d + ':-'; } }).join(' ');
  const run = async (p, w) => { const u = refuseReadsOf(w.file); try { return (await quiet(async () => runMigrations({ ledgerPath: path.join(w.D, 'migrations.json'), migrations: require(p).create({ rootDir: w.root, homeDir: os.homedir(), serverNotice: () => { } }).MIGRATIONS.filter((x) => IDS.includes(x.id)), log: () => { }, warn: () => { } }))).r; } finally { u(); } };
  const stashRow = (w) => { const hd = path.join(w.D, 'usage-history'); fs.mkdirSync(hd, { recursive: true }); fs.writeFileSync(path.join(hd, 'otel-truth.ndjson'), JSON.stringify({ acctKnown: true, rid: 'r-made-up', sid: 's-made-up', acct: w.A, ts: Date.now() - 36e5 }) + '\n'); };   // the backfill's own input (else it has nothing to do and reads no list)
  const w = world('sept'); stashRow(w); const t0 = tree(w), res = await run(path.join(REPO, MIG), w);
  ok(nThrow === 3 && recorded(w).length === 0 && IDS.every((id) => (res || []).some((x) => x.id === id && x.status === 'failed')) && tree(w) === t0, 'M3 · held (the file\'s read refused): NONE of the four September migrations is recorded — nothing archived, nothing re-filed; each tried again at the next start', JSON.stringify({ statuses: (res || []).map((x) => [x.id.slice(8), x.status]), same: tree(w) === t0 }));
  if (!red.err) { const w2 = world('sept-red'); stashRow(w2); await run(red.path, w2); ok(recorded(w2).length >= 3, 'RED: September reads that say nothing on a refused read are recorded as run (never retried)', JSON.stringify(recorded(w2).map((x) => x.slice(8)))); } else ok(false, 'RED CONTROL built: the September reads', red.err);
  const LB = copy('src/ledger-slot-backfill.js', [["  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch (e) { if (e && e.code === 'ENOENT') return null; throw new Error(`data/accounts.json could not be read (${(e && e.code) || 'unparsable'}) — not run; tried again at the next start`); }", "  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; }"]], 'the ledger read says nothing (RED)');
  if (!LB.err) { const w3 = world('sept-lb'); stashRow(w3); const u = refuseReadsOf(w3.file); let threw = null; try { (await quiet(async () => require(LB.path).backfillLedgerBySlot({ dataDir: w3.D, id: 'red' }))); } catch (e) { threw = e.message; } finally { u(); } ok(threw === null, 'RED: a ledger backfill whose read says nothing carries on over the refused list', threw || ''); } else ok(false, 'RED CONTROL built: the ledger read', LB.err); }

// ── H: the usage history WAITS while the list is unread (r3060 Q1) ──
{ const UH = require(path.join(REPO, 'src/usage-history.js'));
  const dir = path.join(ROOT, 'history-' + (++n)); fs.mkdirSync(dir, { recursive: true });
  let isHeld = true;
  const hist = new UH.UsageHistory({ dataDir: dir, homeDir: path.join(ROOT, 'home-' + n), resolveAccount: (id) => (isHeld ? { held: true, type: 'unknown', name: null } : null) });
  const walk = (await quiet(async () => hist._walkAndAppend())).r;
  const ingest = hist.ingestRemoteEvents('host-made-up', 'Made-up machine', JSON.stringify({ rid: 'r-1', ts: Date.now(), sid: 's-1', model: 'claude-made-up', i: 1, o: 1 }) + '\n');
  hist._maybeRebakeAttribution();
  const markerOf = () => { try { return fs.existsSync(path.join(hist.dir, '.attrib-rebake-v1')); } catch { return false; } };
  const marked = markerOf();
  ok(walk && walk.held === true && walk.added === 0, 'H · held: the ledger walk WAITS — nothing baked, its cursors where they were (its next pass after the lift bakes once, by the read list)', JSON.stringify(walk));
  ok(ingest && ingest.deferred === true && UH.ackOf(ingest) === false, 'H · held: a paired machine\'s rows are DEFERRED (unacked): the device walks them again and they land once the list reads', JSON.stringify(ingest));
  ok(!marked, 'H · held: the one-shot re-bake marks NOTHING (it runs at a later start, never against the unread list)');
  isHeld = false;
  const after = (await quiet(async () => hist._walkAndAppend())).r;
  ok(after && after.held !== true, 'H · at the lift the same walk runs by itself (no wait)', JSON.stringify(after && { held: after.held, added: after.added }));
  hist._maybeRebakeAttribution();
  ok(markerOf(), 'H · CONTROL: at the lift the one-shot re-bake runs and marks itself — the leg sees the marker', String(hist.dir || '')); }

// ── r3132 (b): the long-lived sign-in's file sweep — nothing while held, its first tick after the lift syncs ──
{ const w = world('oat-sweep'), OFp = 'src/server/oat-file-sync.js';
  const red = copy(OFp, [["    if (heldLast) return null;\n", '']], 'the sweep never asks (RED)');
  const scene = async (p, am) => {
    let calls = 0; am.syncOatFiles = async () => { calls++; }; am.oatFileSettled = async () => { calls++; };
    const st = (await quiet(async () => require(p).start({ accounts: am, machineProbes: { cliVersion: async () => '2.0.0', cliBinary: async () => null }, claudeCmd: 'claude', log: () => { }, bootDelayMs: 3600e3, recheckMs: 3600e3 }))).r;
    await quiet(async () => st.tick()); const whileHeld = calls;
    const was = am.held; am.held = () => null;   // THE LIFT: the store reads again
    await quiet(async () => st.tick()); am.held = was; st.stop();
    return { whileHeld, afterLift: calls - whileHeld };
  };
  const { h, undo } = held(w); let got = null, r = null;
  try { got = await scene(path.join(REPO, OFp), h); if (!red.err) { const t2 = held(world('oat-sweep-red')); try { r = await scene(red.path, t2.h); } finally { t2.undo(); } } } finally { undo(); }
  ok(!!got && got.whileHeld === 0 && got.afterLift >= 1, 'r3132 (b) · held: the long-lived sign-in\'s file sweep does NOTHING over the unread list — and its first tick after the lift syncs every row (a minute, never the next 15-min tick)', JSON.stringify(got));
  if (!red.err) ok(!!r && r.whileHeld >= 1, 'RED: a sweep that never asks walks the empty list while held', JSON.stringify(r)); else ok(false, 'RED CONTROL built: the sweep', red.err); }

// ── r3132 (c): an unexpected exit's ONE-SHOT resume is not spent on the list's refusal ──
{ const w = world('exit'), UEp = 'src/server/unexpected-exit.js';
  const red = copy(UEp, [["    if (listHeld && !entry.askedAt) {", "    if (false && !entry.askedAt) {"]], 'the resume never asks (RED)');
  const scene = (p, am) => {
    const UE = require(p), sent = [], ws = { readyState: 1, send: (m) => sent.push(String(m)) };
    UE.install({ userTodos: null, sessionKeyFor: (s) => 'claude:' + s.claudeSessionId, activeSessions: new Map(), clients: () => [ws], log: { log() { }, warn() { } }, tickMs: 3600e3, landMs: 3600e3, accounts: am });
    const s = { mode: 'chat', backend: 'claude', claudeSessionId: 'c-exit-' + (++n), name: 'made-up conversation', clients: new Map() };
    const v = UE.onExit(s, 'w-exit-' + n, { code: 1 }, { midTurn: true });
    return { v, sent, UE };
  };
  const { h, undo } = held(w); let got = null, r = null;
  try { got = scene(path.join(REPO, UEp), h); if (!red.err) r = scene(red.path, h); } finally { undo(); }
  const asked0 = got.sent.length;
  const was = h.held; h.held = () => null; got.UE.tick(); h.held = was;
  ok(got.v && got.v.action === 'respawn' && asked0 === 0 && got.sent.length === 1 && /unexpected-exit-respawn/.test(got.sent[0]), 'r3132 (c) · held: the one-shot resume asks NO client (the resume road would refuse: its one shot is not spent); the first tick after the lift asks once', JSON.stringify({ action: got.v && got.v.action, whileHeld: asked0, afterLift: got.sent.length }));
  if (!red.err) ok(r && r.sent.length === 1, 'RED: a resume that never asks spends its one shot on a refusal while held', JSON.stringify(r && r.sent.length)); else ok(false, 'RED CONTROL built: the resume', red.err); }

// ── r3132 (d): the agents' roster says the list could not be read — never «no accounts» ──
{ const w = world('roster'), CO = require(path.join(REPO, 'src/server/conversation-ops.js'));
  const ctl = CO.limitChoices({ accounts: w.am });
  const { h, undo } = held(w); let got = null; try { got = CO.limitChoices({ accounts: h }); } finally { undo(); }
  ok(!!ctl && ctl.accounts.length >= 2 && !ctl.accountsHeld && !!got && Array.isArray(got.accounts) && got.accounts.length === 0 && !!(got.accountsHeld && got.accountsHeld.code), 'r3132 (d) · held: the agents\' roster carries accountsHeld (the list could not be read) beside its empty accounts — never «no accounts»; absent while the list reads', JSON.stringify({ read: ctl && ctl.accounts.length, held: got && got.accountsHeld && got.accountsHeld.code })); }

// ── F2: the attribution journal records nothing while held ──
{ const w = world('attr'), UAp = 'src/server/usage-attribution.js';
  const red = copy(UAp, [["  if (acct && (() => { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown' }; } })()) return;\n", '']], 'the journal never asks (RED)');
  const scene = (p, am) => { const rec = []; const UA = require(p).create({ activeSessions: new Map(), accounts: am, usageHistory: { recordAttribution: (x) => rec.push(x) } }); UA.recordUsageAttribution({ claudeSessionId: 'c-attr-' + (++n), accountId: w.P || w.A }); return rec; };
  const ctl = scene(path.join(REPO, UAp), w.am);
  ok(ctl.length === 1 && ctl[0].acct && ctl[0].acct !== w.P, 'CONTROL (the list read): a pooled conversation\'s attribution names its member', JSON.stringify(ctl.map((x) => ({ isPool: x.acct === w.P }))));
  const { h, undo } = held(w); let got = null, r = null; try { got = scene(path.join(REPO, UAp), h); if (!red.err) r = scene(red.path, h); } finally { undo(); }
  ok(got.length === 0, 'F2 · held: the attribution journal (append-only) records NOTHING — never a line under a key no account owns', JSON.stringify(got));
  if (!red.err) ok(r.length === 1 && r[0].acct === (w.P || w.A), 'RED: the journal that never asks appends the pool\'s own id as the spender', JSON.stringify(r.map((x) => ({ isPool: x.acct === w.P })))); else ok(false, 'RED CONTROL built: the journal', red.err); }

// ── D2: the sign-in expiry sweep does nothing while held ──
{ const w = world('expiry'), LEp = 'src/server/login-expiry-watch.js', file = path.join(w.D, 'login-expiry.json');
  const red = copy(LEp, [["    const listHeld = (() => { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown' }; } })();\n", '    const listHeld = null;\n']], 'the sweep never asks (RED)');
  const seed = () => fs.writeFileSync(file, JSON.stringify({ version: 1, since: Date.now() - 864e5, members: { [w.A]: { exp: Date.now() + 20 * 36e5, sent: ['24h'], items: [] }, [w.B]: { exp: Date.now() + 20 * 36e5, sent: ['24h'], items: [] } }, seen: { [w.A]: { at: Date.now() - 36e5 }, [w.B]: { at: Date.now() - 36e5 } } }));
  const rowsOf = () => { try { const j = JSON.parse(rawRead(file)); return { members: Object.keys(j.members || {}).sort(), seen: Object.keys(j.seen || {}).sort() }; } catch { return null; } };
  const sweep = async (p, am) => (await quiet(async () => { const x = require(p).create({ accounts: am, userTodos: { add: (k, i) => i, resolve: () => { } }, dataDir: w.D, log: () => { } }); const r = x.sweep(); if (typeof x.whenWritten === 'function') await x.whenWritten(); return r; })).r;   // B-0248 unit 5 (lane bl-loop-b): the record is the store writer's — read once on disk
  seed(); const gone = new AccountManager({ dataDir: w.D }); gone._state.accounts = gone._state.accounts.filter((a) => a.id !== w.B);
  await sweep(path.join(REPO, LEp), gone); const ctl = rowsOf();
  ok(!!(ctl && ctl.members.includes(w.A) && !ctl.members.includes(w.B)), 'CONTROL: with B really removed the sweep drops B\'s rows — the leg sees the prune', JSON.stringify(ctl && { A: ctl.members.includes(w.A), B: ctl.members.includes(w.B) }));
  seed(); const before = rawRead(file);
  const { h, undo } = held(w); let r = null; try { r = await sweep(path.join(REPO, LEp), h); } finally { undo(); }
  ok(r && r.held === true && Buffer.compare(rawRead(file), before) === 0, 'D2 · held: the sign-in expiry sweep does NOTHING — every row, warning and seen sign-in kept, its file byte-identical', JSON.stringify({ held: r && r.held }));
  if (!red.err) { seed(); const u2 = refuseReadsOf(w.file); const h2 = new AccountManager({ dataDir: w.D }); if (typeof h2.held !== 'function') h2.held = () => ({ code: 'EIO' }); try { await sweep(red.path, h2); } finally { u2(); } const rr = rowsOf(); ok(!!rr && rr.members.length === 0, 'RED: the sweep that never asks drops every row against the empty list', JSON.stringify(rr)); } else ok(false, 'RED CONTROL built: the sweep', red.err); }

// ── D1: the reset claims are pruned of nothing while held (every /api/usage answer prunes) ──
{ const w = world('claims'), URp = 'src/usage-routes.js';
  const HELDEXP = "(() => { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown' }; } })()";
  const red = copy(URp, [[` if (${HELDEXP}) return null;`, '']], 'the claims never ask (RED)');
  const RC = require(path.join(REPO, 'src/usage-reset-claim.js'));
  const reading = () => { const rs = Math.floor(Date.now() / 1000) + 3 * 3600; return { fetchedAt: Date.now(), fiveHour: { utilization: 0.9, resetsAt: rs }, sevenDay: { utilization: 0.5, resetsAt: rs + 4 * 86400 } }; };
  const answer = async (p, am, dir) => {
    let body = null;
    const routes = {}; const app = { get: (pt, hh) => { routes[`GET ${pt}`] = hh; }, post: (pt, hh) => { routes[`POST ${pt}`] = hh; }, put() { }, delete() { }, use() { }, locals: {} };
    const cacheDir = path.join(dir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    await quiet(async () => {
      require(p).setupUsage({ app, accounts: am, activeSessions: new Map(), serverSetting: () => null, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: path.join(dir, 'usage.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(dir, 'codex-sessions'), META_DIR: path.join(dir, 'meta'), AVAILABLE_MODELS: { claude: [] }, BUFFERS_DIR: path.join(dir, 'buffers') });
      await new Promise((resolve) => { try { routes['GET /api/usage']({ query: {} }, { json: (b) => { body = b; resolve(); }, status() { return this; }, end: resolve }); } catch { resolve(); } });
    });
    const st = RC.at(dir); return { A: !!st.get(w.A), B: !!st.get(w.B), heldField: body && body.accountsHeld ? Object.keys(body.accountsHeld).sort().join(',') : null };
  };
  const plant = (dir) => { const st = RC.at(dir); st.claim(w.A, 'all', reading()); st.claim(w.B, 'all', reading()); return { A: !!st.get(w.A), B: !!st.get(w.B) }; };
  const gone = new AccountManager({ dataDir: w.D }); gone._state.accounts = gone._state.accounts.filter((a) => a.id !== w.B);
  const p0 = plant(w.D), ctl = await answer(path.join(REPO, URp), gone, w.D);
  ok(p0.A && p0.B && ctl.A && !ctl.B, 'CONTROL: with B really removed, a usage answer prunes B\'s claim — the leg sees the prune', JSON.stringify({ planted: p0, after: ctl }));
  const w2 = world('claims-held'); plant(w2.D);
  const { h, undo } = held(w2); let got = null; try { got = await answer(path.join(REPO, URp), h, w2.D); } finally { undo(); }
  ok(got && got.A && got.B, 'D1 · held: a usage answer prunes NOTHING — every account\'s reset claims (and the pool\'s held falls) kept until the list reads', JSON.stringify(got));
  ok(got && got.heldField === 'at,code' && ctl.heldField === null, 'Q4 · held: the usage reply SAYS the list could not be read (accountsHeld { code, at }); absent while the list reads', JSON.stringify({ held: got && got.heldField, read: ctl.heldField }));
  if (!red.err) { const w3 = world('claims-red'); plant(w3.D); const t = held(w3); let rr = null; try { rr = await answer(red.path, t.h, w3.D); } finally { t.undo(); } ok(rr && !rr.A && !rr.B, 'RED: the claims that never ask are all dropped by one usage answer', JSON.stringify(rr)); } else ok(false, 'RED CONTROL built: the claims', red.err); }

// ── M1 / M2: the two account-store migrations THROW while held ──
{ const MIG = 'src/server/migrations.js', IDS = ['2026-09-pool-manual-priority', '2026-11-default-key-names'];
  const red = copy(MIG, [["        heldThrows(am);   // r3044 (3): never «ran» over an unread list — the runner tries again at the next start\n        accountsReadItsFile(am);   // r3615 (MG1, r2944): a start whose read said «not there» while the file IS there — the list is empty and unheld\n        const rep = am.migrateManualPools();", '        const rep = am.migrateManualPools();'], ["        heldThrows(am);   // r3044 (3): never «ran» over an unread list — the runner tries again at the next start\n        accountsReadItsFile(am);   // r3615 (MG1, r2944): a start whose read said «not there» while the file IS there — the list is empty and unheld\n        const rep = am.renameDefaultKeyNames();", '        const rep = am.renameDefaultKeyNames();']], 'the migrations never ask (RED)');
  const { runMigrations } = require(path.join(REPO, 'src/migration-runner.js'));
  const run = async (p, w, am) => (await quiet(async () => runMigrations({ ledgerPath: path.join(w.D, 'migrations.json'), migrations: require(p).create({ rootDir: w.root, homeDir: os.homedir(), serverNotice: () => { }, accounts: () => am }).MIGRATIONS.filter((x) => IDS.includes(x.id)), log: () => { }, warn: () => { } }))).r;
  const recorded = (w) => { try { const j = JSON.stringify(JSON.parse(rawRead(path.join(w.D, 'migrations.json')))); return IDS.filter((id) => j.includes(id)); } catch { return []; } };
  const w = world('mig'); if (w.P) { w.am.get(w.P).auto = false; delete w.am.get(w.P).priority; w.am._save(); }
  const { h, undo } = held(w); let res = null; try { res = await run(path.join(REPO, MIG), w, h); } finally { undo(); }
  ok(recorded(w).length === 0 && (res || []).every((x) => x.status !== 'ran'), 'M1 / M2 · held: neither account-store migration is recorded as run over the unread list (each throws; the runner tries again at the next start)', JSON.stringify((res || []).map((x) => [x.id, x.status])));
  const r2 = await run(path.join(REPO, MIG), w, new AccountManager({ dataDir: w.D }));
  ok(recorded(w).length === IDS.length && (!w.P || new AccountManager({ dataDir: w.D }).get(w.P).auto === true), '…and at the next start over the READ list both run (the manual pool reshaped) — the retry the throw left', JSON.stringify((r2 || []).map((x) => [x.id, x.status])));
  if (!red.err) { const w3 = world('mig-red'); const t = held(w3); let rr = null; try { rr = await run(red.path, w3, t.h); } finally { t.undo(); } ok(recorded(w3).length === IDS.length, 'RED: migrations that never ask are recorded as run over the empty list (never retried)', JSON.stringify((rr || []).map((x) => [x.id, x.status]))); } else ok(false, 'RED CONTROL built: the migrations', red.err);
  // the store-less road: its own read refused is not «nothing to do»
  const w4 = world('mig-nostore'); const u4 = refuseReadsOf(w4.file); let r4 = null; try { r4 = await run(path.join(REPO, MIG), w4, null); } finally { u4(); }
  ok(recorded(w4).length === 0, 'M1 / M2 · with no live store and the file\'s read refused: not recorded (only «not there» is nothing to do)', JSON.stringify((r4 || []).map((x) => [x.id, x.status]))); }

// ── D3: the CLI models door drops no entry while held, and its refresh is refused by name ──
{ const w = world('models'), CMp = 'src/server/cli-models-door.js';
  const red = copy(CMp, [["  const listHeld = () => (() => { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown' }; } })();   // the accounts list's ONE fact (主开发 r3047)", '  const listHeld = () => null;']], 'the door never asks (RED)');
  const CM = require(path.join(REPO, CMp)), file = path.join(w.D, CM.FILE);
  const plant = () => fs.writeFileSync(file, JSON.stringify({ schema: 1, harnesses: { claude: { [w.A]: { rows: [{ id: 'made-up-model', label: 'Made-up' }], listedAt: Date.now() }, [w.B]: { rows: [{ id: 'made-up-model', label: 'Made-up' }], listedAt: Date.now() } } } }));
  const keys = () => { try { return Object.keys((JSON.parse(rawRead(file)).harnesses || {}).claude || {}); } catch { return null; } };
  const forgetA = async (p, am) => { const { door } = require(p).createCliModelsDoor({ accounts: am, harnessOf: () => null, cliCmds: {}, dataDir: w.D }); await quiet(async () => { await door.forget(w.A); await door._flush(); }); return keys(); };
  plant(); const gone = new AccountManager({ dataDir: w.D }); gone._state.accounts = gone._state.accounts.filter((a) => a.id !== w.B);
  const ctl = await forgetA(path.join(REPO, CMp), gone);
  ok(Array.isArray(ctl) && !ctl.includes(w.A) && !ctl.includes(w.B), 'CONTROL: A forgotten and B really removed — the save drops both (the leg sees the prune)', JSON.stringify(ctl && ctl.length));
  plant(); const { h, undo } = held(w); let got = null;
  try { got = await forgetA(path.join(REPO, CMp), h); } finally { undo(); }
  ok(Array.isArray(got) && !got.includes(w.A) && got.includes(w.B), 'D3 · held: the save after a person\'s forget drops ONLY what was forgotten — nothing by the list\'s silence', JSON.stringify(got && { A: got.includes(w.A), B: got.includes(w.B) }));
  if (!red.err) { plant(); const t = held(w); let rr = null; try { rr = await forgetA(red.path, t.h); } finally { t.undo(); } ok(Array.isArray(rr) && !rr.includes(w.B), 'RED: the door that never asks drops B by the list\'s silence', JSON.stringify(rr && rr.length)); } else ok(false, 'RED CONTROL built: the door', red.err); }

report();
