#!/usr/bin/env node
// «Off (never contact Anthropic)» REFUSES EVERY START OF THE CLAUDE USAGE READ (B-5279, 主开发 r4883 / r4896). The row
// accounts.onDemandQuotaRefresh — the Claude descriptor's quota.readsRow — at off: the ONE door every start of the panel program
// passes (src/usage-routes.js spawnPanelProbe) refuses BY NAME before the program starts; the read (refreshViaCliPanel) records
// it as NOT PROBED and books nothing; the pool engine's roads read the refusal as «no reading» (src/server/usage-pool-engine.js).
// The program is a STAND-IN (a shell script that counts its starts — never a vendor program, never a vendor call); every road's
// ask of the read is counted too, so a road that never reached the read can never pass as «no start».
//   ① THE DOOR: off refuses by name (refresh-off), no start; manual / auto-cli / nothing stored / a reader that throws start it
//      once (the row's meaning unchanged); a door handed no reader refuses (refresh-no-reader) — fail closed.
//   ② THE READ under Off: no start, NOT PROBED with the door's code, and NONE of the bookings the release makes on a failed read —
//      a serve failure against the account, a failed-probe verdict (spawn-failed / no-buckets-parsed / login-needed, the «re-login»
//      word), a probe-log line.
//   ③ THE FIVE ROADS through the REAL engine with the REAL read wired: the wall ladder, the gate before an automatic continue, the
//      reset-credit hold, its re-read after a superseded credit, the check after a login — Off: each ASKS, 0 starts; the ladder
//      asks no more (a known reset still arms; none ⇒ the conversation's word, once); the hold lifts at once; the gate's verdict
//      is the one a read that did not answer gives. On: each starts the program ONCE, never more.
//   ④ THE WIRING: the mint's door with the row's reader; auto-resume's status carries the word only while stopped and unarmed;
//      the chip and its door; the strip's row; the door census's row.
//   ③b WHILE THE SETTINGS ARE HELD (主开发 r4932 M2): the held view (its marker + the strict «manual») — every road, a direct press and
//      the person's ⟳ route: refused BY NAME (refresh-held), 0 starts, nothing booked; the ladder's word names THAT reason.
//   ⑤ RED CONTROLS (scripts/mutant-copy.mjs, anchored edits): the door without the fence starts the program under Off on every
//      road; a refusal booked as a failure makes ②'s booking leg red; the recorder without the door's codes books the account's
//      failed-probe note (r4932 M1); the door reading the held view's value starts the program while held (M2).
// Run: node scripts/test-usage-reads-off.mjs
import './scratch.mjs';   // FIRST (§113 THE ROW): the worlds below write homes and data dirs — the re-home comes before any of this suite's code
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => {
  if (typeof msg !== 'string' || msg.length === 0) throw new TypeError(`ok(cond, name): the name is a ${typeof msg} — the arguments are swapped`);
  if (c === true) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700) : ''}`); }
};
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const ROW = 'accounts.onDemandQuotaRefresh';
const UR = require(path.join(REPO, 'src/usage-routes.js'));
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const ROOT = scratchDir('usage-reads-off');
// THE WAIT IS ON THE FACT (law 1 of r4340), bounded; its expiry is a NAMED line, never a quiet false
const until = async (fact, what, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fact()) return true; await new Promise((r) => setTimeout(r, 10)); } console.log(`    (the wait for ${what} ran out after ${ms} ms)`); return false; };
const quiet = () => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; return { done() { console.log = o; console.warn = w; } }; };

// THE STAND-IN PROGRAM: every start appends one line to its count file, then prints a usage panel
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const at = (ms) => { const d = new Date(Date.now() + ms); return MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + (d.getUTCHours() % 12 || 12) + (d.getUTCHours() < 12 ? 'am' : 'pm') + ' (UTC)'; };
const PANEL = 'Current session: 3% used · resets ' + at(2 * 3600e3) + '\n' + 'Current week (all models): 20% used · resets ' + at(44 * 3600e3) + '\n';
let seq = 0;
function standIn(dir) {
  const count = path.join(dir, 'starts.log'), bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!/bin/sh\necho start >> '${count}'\ncat <<'EOF'\n${PANEL}EOF\n`, { mode: 0o755 });
  return { bin, starts: () => { try { return fs.readFileSync(count, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } } };
}
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
/** ONE WORLD: the real accounts store (a pool of one member), the REAL engine, the REAL usage routes with the stand-in program on
 *  CLAUDE_CMD, the read wired as the engine's probe (counted asks); `row` = the usage-refresh row's value; `cache` = the member's
 *  reading; `usage` = a usage-routes module (a red control's copy); `probe` = another probe in place of the read */
const SETTINGS_HELD = Symbol.for('vibespace.settings-held');
function world({ row, cache = 'unknown-reset', usage = UR, probe = null, held = false } = {}) {
  const dir = path.join(ROOT, 'w' + (++seq)); fs.mkdirSync(dir, { recursive: true });
  const dataDir = path.join(dir, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const M = am.createSubscription({ name: 'Member One' }).id;
  fs.writeFileSync(path.join(am.subDir(M), '.credentials.json'), CREDS(M), { mode: 0o600 });
  const P = am.createPool({ name: 'Pool' }).id;
  am.setPoolTarget(P, M); am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowSec = Math.floor(Date.now() / 1000);
  // the member's reading: spent with NO reset time anywhere (the ladder's data gap), or spent with a KNOWN reset
  const spent = cache === 'known-reset'
    ? { fetchedAt: Date.now() - 60000, source: 'on-demand', fiveHour: { utilization: 1, resetsAt: nowSec + 2 * 3600 }, sevenDay: { utilization: 0.4, resetsAt: nowSec + 3 * 86400 } }
    : { fetchedAt: Date.now() - 60000, source: 'on-demand', fiveHour: { utilization: 1 }, sevenDay: { utilization: 1 } };
  fs.writeFileSync(path.join(cacheDir, M + '.json'), JSON.stringify(spent));
  const store = row === undefined ? {} : { [ROW]: row };
  // the HELD view as src/routes/persistence.js hands it: its marker answers, the row reads the strict side (src/settings-held-strict.js)
  const strict = require(path.join(REPO, 'src/settings-held-strict.js'));
  const serverSetting = (k) => (held ? (k === SETTINGS_HELD ? { code: 'settings-unreadable' } : (k === ROW ? strict.STRICT_WHILE_HELD[ROW].strict : store[k])) : store[k]);
  const sessions = new Map(), arms = [], statusAsks = [], asks = [], serveFails = [];
  const routes = {};
  const app = { get() { }, post(p, ...h) { routes[p] = h[h.length - 1]; }, put() { }, delete() { }, use() { }, locals: {} };
  const autoResume = {
    armIfEnabled: (sid, s, until2, why) => arms.push({ sid, until: until2, why }), noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { },
    statusFor: () => null, enabledFor: () => true, fireNow() { }, armedIds: () => arms.map((a) => a.sid), refreshStatus: (id) => statusAsks.push(id),
  };
  const prog = standIn(dir);
  let u = null;
  const eng = engMod.create({
    app, rootDir: dir, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice: () => 1, serverSetting, getAccounts: () => am,
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => autoResume,
    // the read, wired as server.js wires it — each ASK counted (a road that never reached the read cannot pass as «no start»)
    getQuotaProbe: () => { const real = probe || (u && u.refreshViaCliPanel); if (!real) return null; const f = (k) => { asks.push(k); return real(k); }; if (typeof real.refusal === 'function') f.refusal = real.refusal; return f; },
    getSessionMetaStore: () => null,
  });
  const realServeFail = app.locals.noteMemberServeFailure;
  app.locals.noteMemberServeFailure = (...a) => { serveFails.push(a[0]); return realServeFail?.(...a); };
  u = usage.setupUsage({
    app, accounts: am, hosts: null, usageHistory: null, activeSessions: sessions, serverSetting, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(dir, 'codex-sessions'),
    META_DIR: path.join(dataDir, 'session-meta'), AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
    probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: prog.bin,
  });
  const mkSession = (sid, fields = {}) => {
    const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: sid, cwd: dir, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } }, ...fields };
    sessions.set(sid, s); am.ensureSessionPoolLink(P, sid, M, { why: 'spawn' });
    return s;
  };
  const probeLog = path.join(dataDir, 'usage-probe-log.ndjson');
  const press = (key) => new Promise((resolve) => { const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); return this; } }; Promise.resolve(routes['/api/usage/refresh']({ headers: {}, body: { account: key } }, res)).catch((e) => resolve({ code: 'threw', body: String(e && e.message) })); });
  return { dir, dataDir, am, eng, u, M, P, sessions, arms, statusAsks, asks, serveFails, starts: prog.starts, mkSession, probeLog, press, setRow: (v) => { if (v === undefined) delete store[ROW]; else store[ROW] = v; } };
}
const stopTimers = (w) => { for (const s of w.sessions.values()) { try { clearTimeout(s._wallProbeTimer); } catch { } s._wallProbeTimer = null; } const p = w.eng._resetCreditPending; if (p && typeof p.forEach === 'function') { p.forEach((x) => { try { clearTimeout(x.timer); } catch { } }); p.clear?.(); } };

console.log('— ① THE DOOR (spawnPanelProbe): off refuses by name, before the program starts');
{
  const dir = path.join(ROOT, 'door'); fs.mkdirSync(dir, { recursive: true });
  const prog = standIn(dir);
  const run = (setting) => new Promise((resolve) => { const r = UR.spawnPanelProbe(prog.bin, { root: null, env: { PATH: process.env.PATH }, setting }, (err, stdout) => resolve({ err, stdout: String(stdout || ''), child: r })); });
  const off = await run((k) => (k === ROW ? 'off' : undefined));
  ok(!!off.err && off.err.code === 'refresh-off' && off.err.refusedByRow === true && off.child === null && prog.starts() === 0 && /off in Settings/.test(off.err.message), 'off: refused BY NAME (refresh-off), no child, the stand-in never started', { code: off.err && off.err.code, starts: prog.starts() });
  const none = await run(undefined);
  ok(!!none.err && none.err.code === 'refresh-no-reader' && prog.starts() === 0, 'a door handed NO reader refuses (refresh-no-reader) — fail closed: a new caller cannot start the program unasked');
  let n = 0;
  for (const [what, setting] of [['manual', (k) => (k === ROW ? 'manual' : undefined)], ['auto-cli', (k) => (k === ROW ? 'auto-cli' : undefined)], ['nothing stored (the default)', () => undefined], ['a reader that throws (unreadable = the default, as the route reads it)', () => { throw new Error('unreadable'); }]]) {
    const r = await run(setting); n++;
    ok(!r.err && /Current session/.test(r.stdout) && prog.starts() === n, `${what}: the program starts ONCE (the row's meaning unchanged)`, { err: r.err && r.err.code, starts: prog.starts() });
  }
  const heldR = await run((k) => (k === SETTINGS_HELD ? { code: 'settings-unreadable' } : (k === ROW ? 'manual' : undefined)));
  ok(!!heldR.err && heldR.err.code === 'refresh-held' && /settings could not be read/.test(heldR.err.message) && prog.starts() === n, 'WHILE THE SETTINGS ARE HELD the door refuses BY NAME (refresh-held) — even though the held view reads «manual» (r4932 M2)', { code: heldR.err && heldR.err.code, starts: prog.starts() });
  ok(UR.panelDoorRefusal((k) => (k === ROW ? 'off' : undefined)).code === UR.PANEL_OFF && UR.panelDoorRefusal(() => 'manual') === null && UR.panelDoorRefusal(null).code === UR.PANEL_NO_READER
    && require(path.join(REPO, 'src/harnesses/claude-quota.js')).readsRow === ROW, 'panelDoorRefusal reads the Claude descriptor\'s own row (quota.readsRow), its two codes exported');
  const O = require(path.join(REPO, 'src/server/oat-mint.js'));
  const pp = O.panelProbeVia((o, done) => UR.spawnPanelProbe(prog.bin, { ...o, setting: (k) => (k === ROW ? 'off' : undefined) }, done), UR.parseCliUsageText);
  const before = prog.starts(), pr = await pp({ root: null, env: { PATH: process.env.PATH } });
  ok(!!pr && pr.refused === 'refresh-off' && prog.starts() === before, 'the mint\'s production probe (panelProbeVia over the door) answers {refused} under Off — no start (the mint then asks the person: test-oat-mint)', pr);
}

console.log('— ② THE READ under Off: no start, NOT PROBED, nothing booked');
const BOOKINGS = ['a serve failure against the account (noteMemberServeFailure)', 'a failed-probe verdict (spawn-failed / no-buckets-parsed / login-needed — the «re-login» word)', 'the account\'s failed-probe note (accounts.noteProbe — «Last probe failed» in Manage agents)', 'a probe-log line'];
const bookingsOf = (w, key) => { const pv = w.u.panelVerdictFor ? w.u.panelVerdictFor(key) : null; return { serveFails: w.serveFails.length, probeNote: w.am.probeOf(key) || null, verdict: pv ? { outcome: pv.outcome, code: pv.code, why: String(pv.why || '') } : null, probeLog: fs.existsSync(w.probeLog) ? fs.readFileSync(w.probeLog, 'utf8').split('\n').filter(Boolean).length : 0 }; };
const nothingBooked = (b, code = 'refresh-off') => b.serveFails === 0 && b.probeNote === null && !!b.verdict && b.verdict.outcome === 'not-probed' && b.verdict.code === code && !/login/i.test(b.verdict.why) && b.probeLog === 0;
{
  const w = world({ row: 'off' });
  if (!w) ok(false, 'pools are supported on this machine (the worlds need one)');
  else {
    const q = quiet(); const r = await w.u.refreshViaCliPanel(w.M); q.done();
    const b = bookingsOf(w, w.M);
    ok(r === false && w.starts() === 0, 'refreshViaCliPanel under Off answers false and starts NOTHING');
    ok(nothingBooked(b), `NOTHING BOOKED — of the release's bookings on a failed read (${BOOKINGS.join('; ')}) none is made: the read is NOT PROBED with the door's code`, b);
    ok(typeof w.u.refreshViaCliPanel.refusal === 'function' && w.u.refreshViaCliPanel.refusal().code === 'refresh-off', 'the read lets its callers ask the DOOR for its refusal (refreshViaCliPanel.refusal) — never a second rule');
    w.setRow('manual');
    const q2 = quiet(); const r2 = await w.u.refreshViaCliPanel(w.M); q2.done();
    ok(w.starts() === 1 && w.u.refreshViaCliPanel.refusal() === null, 'the same world with the row back on manual: the read starts the program once (the read itself is unchanged)', { r2, starts: w.starts() });
    stopTimers(w);
  }
}

console.log('— ③ THE FIVE ROADS through the real engine, the real read wired: Off ⇒ asks, 0 starts; On ⇒ once, never more');
const ROADS = [
  ['the wall ladder (no reset known)', async (w) => { const s = w.mkSession('s-ladder'); w.eng._scheduleWallProbe(s, w.P, null, 0); return { s }; },
    (w, x) => w.asks.length >= 1 && (w.statusAsks.includes('s-ladder') || w.arms.length > 0 || w.starts() >= 1)],
  ['the gate before an automatic continue', async (w) => { const s = w.mkSession('s-gate'); const v = await w.eng.beforeAutoResumeFire('s-gate', s); return { s, v }; }, (w) => w.asks.length >= 1],
  ['the reset-credit hold', async (w) => { w.mkSession('s-hold'); w.eng._holdForResetReading(w.M, 's-hold'); return {}; },
    (w) => w.asks.length >= 1 && (!w.eng._resetCreditPending.has(w.M) || w.starts() >= 1)],
  ['the re-read after a superseded reset credit', async (w) => { const s = w.mkSession('s-credit', { _resetCreditKey: w.M }); const q = quiet(); try { w.eng.recordCodexQuotaSignal(s, { type: 'reset_credit_result', outcome: 'alreadyRedeemed' }, null); } finally { q.done(); } return { s }; }, (w) => w.asks.length >= 1],
  ['the check after a login', async (w) => { const r = await w.eng.onMemberLoginSuccess(w.M, 'login'); return { r }; }, (w) => w.asks.length >= 1],
];
const offOutcomes = {};
for (const [what, drive, settled] of ROADS) {
  const w = world({ row: 'off' });
  if (!w) { ok(false, `${what}: a world (pools supported)`); continue; }
  const q = quiet(); let x = null; try { x = await drive(w); await until(() => settled(w, x), `${what} to settle`); await new Promise((r) => setTimeout(r, 120)); } finally { q.done(); }
  offOutcomes[what] = { w, x };
  ok(w.asks.length >= 1 && w.starts() === 0, `Off — ${what}: the road ASKS the read (${w.asks.length}) and the program starts 0 times`, { asks: w.asks.length, starts: w.starts() });
  ok(w.serveFails.length === 0 && (w.am.probeOf(w.M) || null) === null, `Off — ${what}: nothing booked against the account (no serve failure, no failed-probe note)`, { serveFails: w.serveFails, note: w.am.probeOf(w.M) });
  stopTimers(w);
}
{
  const L = offOutcomes['the wall ladder (no reset known)'];
  if (L) {
    const s = L.x.s;
    ok(!!s._readsOffWall && s._readsOffWall.code === 'refresh-off' && L.w.statusAsks.includes('s-ladder') && L.w.arms.length === 0 && !s._wallProbeTimer,
      'Off — the ladder asks NO MORE (no next try armed) and, no reset being known, the conversation is TOLD once in its own view (the status re-said; nothing armed, nothing typed)', { fact: s._readsOffWall, arms: L.w.arms, timer: !!s._wallProbeTimer });
    const again = L.w.statusAsks.length; L.w.eng._scheduleWallProbe(s, L.w.P, null, 0);   // the same wall asked again at once
    await until(() => L.w.asks.length >= 2, 'the second try to ask');
    await new Promise((r) => setTimeout(r, 60));
    ok(L.w.statusAsks.length === again && L.w.starts() === 0, '…said ONCE a wall: a later try of the same wall says nothing again (and starts nothing)', { said: L.w.statusAsks.length - again });
    L.w.eng.clearStoppedBy(s, 'ran again');
    ok(s._readsOffWall === null, '…and the word goes when the conversation runs again (clearStoppedBy)');
    stopTimers(L.w);
  }
  const H = offOutcomes['the reset-credit hold'];
  if (H) ok(!H.w.eng._resetCreditPending.has(H.w.M), 'Off — the reset-credit hold lifts AT ONCE (no ten-minute wait for a reading that cannot come)');
  const G = offOutcomes['the check after a login'];
  if (G) ok(!!G.x.r && G.x.r.ok === false && !!G.x.r.probe && G.x.r.probe.refused === 'refresh-off', 'Off — the check after a login reads the refusal by its code and re-decides without a reading (no continue)', G.x.r && G.x.r.probe);
}
{
  // a KNOWN reset still arms the continue as today — no start, no word
  const w = world({ row: 'off', cache: 'known-reset' });
  if (w) {
    const s = w.mkSession('s-known');
    const q = quiet(); w.eng._scheduleWallProbe(s, w.P, null, 0); await until(() => w.asks.length >= 1 && w.arms.length >= 1, 'the known reset to arm'); q.done();
    ok(w.arms.length === 1 && w.arms[0].until > Date.now() && w.starts() === 0 && !s._readsOffWall, 'Off with a KNOWN reset: the continue is armed at that reset as today, the program not started, no word said', { arms: w.arms, starts: w.starts() });
    stopTimers(w);
  }
}
{
  // THE GATE'S VERDICT IS NOT CHANGED: under Off it is the verdict a read that did NOT answer gives (the release's road) — B-9a24 rebuilds that gate
  const wOff = world({ row: 'off' }), wNone = world({ row: 'manual', probe: async () => false });
  if (wOff && wNone) {
    const sO = wOff.mkSession('s-g'), sN = wNone.mkSession('s-g');
    const q = quiet(); const vO = await wOff.eng.beforeAutoResumeFire('s-g', sO); const vN = await wNone.eng.beforeAutoResumeFire('s-g', sN); q.done();
    ok(JSON.stringify(vO) === JSON.stringify(vN) && JSON.stringify(wOff.arms.map((a) => a.why)) === JSON.stringify(wNone.arms.map((a) => a.why)) && wOff.starts() === 0,
      'Off — the gate before an automatic continue reads the refusal as «no fresh reading»: its verdict and its arms are a read that did not answer\'s, byte for byte', { off: vO, none: vN, arms: [wOff.arms, wNone.arms] });
    stopTimers(wOff); stopTimers(wNone);
  }
}
for (const [what, drive, settled] of ROADS) {
  const w = world({ row: 'manual' });
  if (!w) continue;
  const q = quiet(); let x = null; try { x = await drive(w); await until(() => w.starts() >= 1 && settled(w, x), `${what} to start the program`); await new Promise((r) => setTimeout(r, 200)); } finally { q.done(); }
  ok(w.starts() === 1, `On (manual) — ${what}: the program starts ONCE, never more (this unit only removes starts)`, { asks: w.asks.length, starts: w.starts() });
  stopTimers(w);
}

console.log('— ③b WHILE THE SETTINGS ARE HELD: every road and a press refused by name, 0 starts, nothing booked');
for (const [what, drive, settled] of ROADS) {
  const w = world({ held: true });
  if (!w) continue;
  const q = quiet(); let x = null; try { x = await drive(w); await until(() => settled(w, x), `${what} (held) to settle`); await new Promise((r) => setTimeout(r, 120)); } finally { q.done(); }
  const b = bookingsOf(w, w.M);
  ok(w.asks.length >= 1 && w.starts() === 0 && b.serveFails === 0 && b.probeNote === null, `held — ${what}: asks the read, 0 starts, nothing booked`, { asks: w.asks.length, starts: w.starts(), b });
  if (what.startsWith('the wall ladder')) ok(!!x.s._readsOffWall && x.s._readsOffWall.code === 'refresh-held', 'held — the ladder\'s word names the TRUE reason: the settings could not be read (refresh-held)', x.s._readsOffWall);
  stopTimers(w);
}
{
  const w = world({ held: true });
  if (w) {
    const q = quiet(); const r = await w.u.refreshViaCliPanel(w.M); const pr = await w.press(w.M); q.done();
    ok(r === false && w.starts() === 0 && nothingBooked(bookingsOf(w, w.M), 'refresh-held'), 'held — a direct press of the read: refused by name (refresh-held), 0 starts, nothing booked', bookingsOf(w, w.M));
    ok(pr.code === 503 && pr.body && pr.body.code === 'refresh-held' && /settings could not be read/.test(String(pr.body.error)) && w.starts() === 0,
      'held — the person\'s ⟳ route refuses by the DOOR\'s own code and words before its token ladder and remote roads (no contact against a stored Off nobody can read)', pr);
    stopTimers(w);
  }
  const wo = world({ row: 'off' });
  if (wo) { const q = quiet(); const pr = await wo.press(wo.M); q.done(); ok(pr.code === 403 && /disabled in Settings/.test(String(pr.body && pr.body.error)) && wo.starts() === 0, 'Off — the ⟳ route answers its release 403, as ever, and starts nothing', pr); stopTimers(wo); }
  const strict = require(path.join(REPO, 'src/settings-held-strict.js')).STRICT_WHILE_HELD[ROW];
  ok(strict.strict === 'manual' && /a person's press included/.test(strict.why) && !/still reads/.test(strict.why), 'the held view\'s sentence for the row says what is now true (no read, a person\'s press included) — its strict value unchanged', strict);
}

console.log('— ④ THE WIRING');
{
  const AU = read('src/server/account-usage-routes.js'), AR = read('src/server/auto-resume.js'), CSB = read('src/lib/chat-status-bar.js'), ST = read('src/lib/strip-table.js'), UN = read('src/ui-needs.js');
  ok(/usageRoutesMod\.spawnPanelProbe\(claudeBin\(\), \{ \.\.\.o, setting: serverSetting \}, done\)/.test(AU), 'the mint\'s identity proof passes the door WITH the row\'s reader (the mint asks the person when it refuses)');
  ok(/\.\.\.\(!a && session && session\._readsOffWall && \(normalizeStoppedBy\(session\._stoppedBy\) \|\| \{\}\)\.kind === 'quota' \? \{ readsOff: session\._readsOffWall\.code \|\| 'refresh-off' \} : \{\}\),/.test(AR), 'auto-resume\'s status carries the door\'s code only while nothing is armed and the conversation stands stopped by a limit');
  ok(/if \(a\.readsOff && !a\.armed\) \{ const held = a\.readsOff === 'refresh-held'; chip\('readsoff', /.test(CSB) && /\{ attrs: \{ 'data-reads-off-door': '1' \} \}\); \}/.test(CSB) && /const roDoor = e\.target\.closest\('\[data-reads-off-door\]'\);\n\s*if \(roDoor\) \{ e\.stopPropagation\(\); const d = settingsDoor\(this\._app, 'accounts\.onDemandQuotaRefresh'\); if \(d\) d\.run\(\); return; \}/.test(CSB),
    'the conversation\'s own status bar says it beside the wall\'s chip, and its press opens the setting\'s row (need-line settingsDoor)');
  ok(/row\('readsoff', 'I', 'row1', 31, \{ exists: true \}\)/.test(ST) && /id: 'usage-reads-off-wait'/.test(UN), 'the strip places the mark (row 1, while it exists) and the door census claims its two sentences');
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  const keys = ['Usage reads are off', 'Usage reads are off, so this conversation continues when you resume it — press to open the setting.', 'Settings could not be read', 'The settings could not be read, so usage is not read and this conversation continues when you resume it — press to open Settings.'];
  ok(keys.every((k) => ZH.includes('  ' + JSON.stringify(k) + ': ') && JA.includes('  ' + JSON.stringify(k) + ': ')), 'zh and ja hold the four sentences (off, held)');
  const S = read('src/lib/settings-schema.js');
  ok(/\{ value: 'off', label: t\('Off \(never contact Anthropic\)'\) \}/.test(S), 'the row\'s meaning and its words in Settings stay as they are (no default, meaning or sentence changes)');
}

console.log('— ⑤ RED CONTROLS');
{
  const M = mutantCopies('usage-reads-off', REPO);
  const US = read('src/usage-routes.js');
  const noFence = anchored(anchored(US, "  const no = panelDoorRefusal(setting);\n  if (no) { setImmediate(() => done(no, '', '')); return null; }\n", '', 'the door without its fence'),
    "  { const no = panelDoorRefusal(serverSetting); if (no) { panelSays(key, { at: Date.now(), outcome: 'not-probed', code: no.code, identityVerified: false, why: no.message, rung: 'panel' }); return false; } }\n", '', 'the read without its ask');
  const R1 = M.load('src/usage-routes.js', noFence, 'no-fence');
  const started = [];
  for (const [what, drive, settled] of ROADS) {
    const w = world({ row: 'off', usage: R1 }); if (!w) continue;
    const q = quiet(); try { const x = await drive(w); await until(() => w.starts() >= 1, `${what} to start (the control)`, 4000); void x; } finally { q.done(); }
    if (w.starts() >= 1) started.push(what);
    stopTimers(w);
  }
  ok(started.length === ROADS.length, `RED: the door without the fence starts the program under Off on EVERY road (${started.length}/${ROADS.length}) — ③'s 0-starts legs go red`, started);
  const booked = anchored(US, "  { const no = panelDoorRefusal(serverSetting); if (no) { panelSays(key, { at: Date.now(), outcome: 'not-probed', code: no.code, identityVerified: false, why: no.message, rung: 'panel' }); return false; } }\n",
    "  { const no = panelDoorRefusal(serverSetting); if (no) { try { app.locals.noteMemberServeFailure?.(key, { message: no.message }); } catch { } panelSays(key, { at: Date.now(), outcome: 'spawn-failed', code: 'exit', identityVerified: false, why: no.message, rung: 'panel' }); return false; } }\n", 'a refusal booked as a failure');
  const R2 = M.load('src/usage-routes.js', booked, 'booked');
  const w = world({ row: 'off', usage: R2 });
  if (w) {
    const q = quiet(); await w.u.refreshViaCliPanel(w.M); q.done();
    const b = bookingsOf(w, w.M);
    ok(!nothingBooked(b) && b.serveFails === 1 && w.starts() === 0, 'RED: a refusal booked as a failure (a serve failure + a spawn-failed verdict) ⇒ ②\'s nothing-booked leg goes red', b);
    stopTimers(w);
  }
}

{
  // r4932 M1's red: the recorder without the door's codes in its early return books the account's failed-probe note
  const M = mutantCopies('usage-reads-off-m1', REPO);
  const US = read('src/usage-routes.js');
  const R3 = M.load('src/usage-routes.js', anchored(US, " || DOOR_CODES.includes(v.code)) return v;", ") return v;", 'the recorder without the door codes'), 'recorder');
  const w = world({ row: 'off', usage: R3 });
  if (w) { const q = quiet(); await w.u.refreshViaCliPanel(w.M); q.done(); const b = bookingsOf(w, w.M); ok(!nothingBooked(b) && b.probeNote && b.probeNote.ok === false && w.starts() === 0, 'RED: the recorder without the door\'s codes ⇒ the account\'s failed-probe note is booked («Last probe failed») — ②\'s leg goes red (M1)', b); stopTimers(w); }
  // r4932 M2's red: the door reading the held view's value (no held check) starts the program while the settings are held
  const R4 = M.load('src/usage-routes.js', anchored(US, "  if (held) return Object.assign(new Error('the settings could not be read — nothing was started'), { code: PANEL_HELD, refusedByRow: true });\n", '', 'the door without its held check'), 'no-held');
  const started = [];
  for (const [what, drive] of ROADS) {
    const wh = world({ held: true, usage: R4 }); if (!wh) continue;
    const q = quiet(); try { await drive(wh); await until(() => wh.starts() >= 1, `${what} to start (the held control)`, 4000); } finally { q.done(); }
    if (wh.starts() >= 1) started.push(what);
    stopTimers(wh);
  }
  ok(started.length === ROADS.length, `RED: the door reading the held view's «manual» starts the program while held on EVERY road (${started.length}/${ROADS.length}) — ③b's legs go red (M2)`, started);
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
