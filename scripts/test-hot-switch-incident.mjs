#!/usr/bin/env node
// THE 2026-09-30 "SESSION LIMITED WHILE A MEMBER HAD QUOTA" INCIDENT (lane-hot-switch).
//
// What the measurement and the production record established (the lane's
// report; scripts/measure-claude-cred-read.mjs is the measurement):
//   · a RUNNING claude 2.1.281 follows its pool link — it statx()es the creds
//     file through the link every turn and re-reads it when the mtime differs;
//   · the OTel `organization.id` is a machine-wide LABEL (~/.claude.json's
//     oauthAccount, rewritten by whichever claude process last fetched its
//     profile), never the account a request billed;
//   · the incident itself: the server crashed at 12:03, one conversation's
//     stdout bridge came back dead for THREE HOURS, and a local re-attach at
//     15:05:14 released the whole backlog in three seconds. Every record was
//     taken as NOW: a 12:15 Fable rejection another member had answered was
//     charged to the member the link held at 15:05, stale readings overwrote
//     fresh ones, the pool moved ten conversations onto a spent member.
//
// §A — A LATE RECORD IS NOT A LIVE FACT (src/record-lateness.js + the engine's
//      gateLiveFact): the PURE tables, then the incident's backlog replayed
//      through the REAL claude parse + the REAL engine + a REAL pool over real
//      credential symlinks, with patched-copy controls for every mechanism.
// §B — A WALL WHOSE OWN WINDOW REFUTES THE PIN NEVER DEMOTES THE PIN: not by
//      the window-less banner of the same wall, not at the turn end, not by
//      excluding it from the conversation.
// §C — EVERY RE-POINT BUMPS THE TARGET'S CREDS MTIME (the measured blind spot:
//      an equal-mtime replacement is never followed).
// §D — THE OTel ORG IS A MACHINE-WIDE LABEL: nothing reads it as a member.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const L = require(path.join(REPO, 'src/record-lateness.js'));
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));

const cleanup = [];
process.on('exit', () => { for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const MUT = mutantCopies('hotsw', REPO);
/** A patched copy of a real module (outside the tree), loaded. */
function mutate(rel, tag, replacements) {
  const src = read(rel);
  let out = src;
  for (const [from, to] of replacements) {
    if (!out.includes(from)) return { hit: false, why: 'anchor not found: ' + from.slice(0, 80) };
    out = out.replace(from, to);
  }
  const fp = MUT.write(rel, out, tag, { esm: false });
  return { hit: out !== src, mod: require(fp), file: fp };
}
const quiet = () => {
  const o = console.log, w = console.warn; const lines = [];
  console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' '));
  return { done: () => { console.log = o; console.warn = w; return lines; } };
};
const iso = (ms) => new Date(ms).toISOString();

// ═══ §A1 THE PURE RULE ══════════════════════════════════════════════════════
console.log('— §A1 the late-record rule (PURE)');
{
  const now = 1790806000000;
  const st = (ms) => ({ type: 'assistant', timestamp: iso(ms) });
  ok('§A1 a record states its own stamp; one without (rate_limit_event, result) states none',
    L.stampOf(st(now - 5)) === now - 5 && L.stampOf({ type: 'rate_limit_event' }) === null && L.stampOf({ timestamp: 'nope' }) === null && L.stampOf(null) === null);
  ok('§A1 its OWN stamp judges it: 2 ms old is live, 3 h old is late',
    L.judge(null, st(now - 2), now).verdict === 'live' && L.judge(null, st(now - 3 * 3600e3), now).verdict === 'late');
  ok('§A1 the bound is LATE_MS (2 min) — just under is live, just over is late',
    L.judge(null, st(now - L.LATE_MS + 1), now).verdict === 'live' && L.judge(null, st(now - L.LATE_MS - 1), now).verdict === 'late' && L.LATE_MS === 120e3);
  ok('§A1 a REMOTE session is judged against REMOTE_LATE_MS (30 min: another machine\'s clock may be skewed)',
    L.judge(null, st(now - 10 * 60e3), now, { remote: true }).verdict === 'live' && L.judge(null, st(now - 40 * 60e3), now, { remote: true }).verdict === 'late'
    && L.judge(null, st(now - 10 * 60e3), now).verdict === 'late');
  const lateClock = L.observe(null, st(now - 3 * 3600e3), now - 10).clock;
  const liveClock = L.observe(null, st(now - 12), now - 10).clock;
  ok('§A1 an UNSTAMPED record inherits the verdict of the stamped record that arrived just before it (a burst)',
    L.judge(lateClock, { type: 'rate_limit_event' }, now).verdict === 'late' && L.judge(liveClock, { type: 'rate_limit_event' }, now).verdict === 'live');
  ok('§A1 …but only within BURST_MS — an old neighbour says nothing ("unknown")',
    L.judge(lateClock, { type: 'result' }, now - 10 + L.BURST_MS + 1).verdict === 'unknown' && L.judge(null, { type: 'result' }, now).verdict === 'unknown');
  ok('§A1 an unstamped record leaves the clock alone; a stamped one moves it',
    L.observe(lateClock, { type: 'result' }, now).clock === lateClock && L.observe(lateClock, st(now), now).clock.delayMs === 0);
  ok('§A1 verdictOfClock = the verdict the next stamped record hands the records before it',
    L.verdictOfClock(lateClock).verdict === 'late' && L.verdictOfClock(liveClock).verdict === 'live' && L.verdictOfClock(null).verdict === 'live');
  // the look-ahead
  const lines = (...recs) => recs.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n';
  ok('§A1 nextStampIn: the first STAMPED top-level record ahead',
    L.nextStampIn(lines({ type: 'result' }, st(now - 7), st(now - 1))) === now - 7);
  ok('§A1 …a `timestamp` NESTED in a record\'s content is not the record\'s stamp (records are parsed, never grepped)',
    L.nextStampIn(lines({ type: 'user', message: { content: [{ type: 'tool_result', content: '{"timestamp":"2020-01-01T00:00:00Z"}', timestamp: '2020-01-01T00:00:00Z' }] } })) === null);
  ok('§A1 …an incomplete last line is not a record yet; garbage lines are skipped',
    L.nextStampIn(JSON.stringify(st(now))) === null && L.nextStampIn('not json\n' + JSON.stringify(st(now - 3)) + '\n') === now - 3);
  ok('§A1 …BOUNDED: at most 8 records and 256 KiB are looked at',
    L.nextStampIn(lines(...Array.from({ length: 8 }, () => ({ type: 'system' })), st(now))) === null
    && L.nextStampIn(lines({ type: 'user', pad: 'x'.repeat(300000) }, st(now))) === null
    && L.nextStampIn(lines(...Array.from({ length: 7 }, () => ({ type: 'system' })), st(now))) === now);
  ok('§A1 lateWords speaks minutes and hours', L.lateWords(35e3) === '35s' && L.lateWords(4 * 60e3) === '4m' && L.lateWords((3 * 60 + 2) * 60e3) === '3h02m');
}

// ═══ §A2–§A6 THE INCIDENT'S BACKLOG THROUGH THE REAL PIPELINE ═══════════════
// The pool at 15:05 (names neutral): S = the member the link held (quota
// left), Q = the member that answered the 12:15 Fable rejection,
// U = the member whose 5 h window was SPENT (resets in 45 min).
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
const MEMBERS = [
  { tag: 's', name: 'Member S', u5: 0.07, u7: 0.13, fable: 0.03, weekH: 70 },
  { tag: 'q', name: 'Member Q', u5: 0.38, u7: 0.50, fable: 0.99, weekH: 140 },
  { tag: 'u', name: 'Member U', u5: 1.00, u7: 0.60, fable: 0.72, weekH: 150, fiveH: 0.75 },
];
function mkWorld({ engineModule = engMod } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hotsw-'));
  cleanup.push(root);
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const id = {};
  for (const m of MEMBERS) {
    id[m.tag] = am.createSubscription({ name: m.name }).id;
    fs.writeFileSync(path.join(am.subDir(id[m.tag]), '.credentials.json'), CREDS(id[m.tag]), { mode: 0o600 });
  }
  const P = am.createPool({ name: 'Pool' }).id;
  am.setPoolTarget(P, id.s);
  am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowSec = Math.floor(Date.now() / 1000);
  const readCache = (k) => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, k + '.json'), 'utf8')); } catch { return null; } };
  const week = {}, five = {};
  for (const m of MEMBERS) {
    week[m.tag] = nowSec + Math.round(m.weekH * 3600);
    five[m.tag] = nowSec + Math.round((m.fiveH || 3) * 3600);
    fs.writeFileSync(path.join(cacheDir, id[m.tag] + '.json'), JSON.stringify({
      fetchedAt: Date.now() - 60000, source: 'on-demand',
      fiveHour: { utilization: m.u5, resetsAt: five[m.tag] },
      sevenDay: { utilization: m.u7, resetsAt: week[m.tag] },
      scopedWeekly: [{ name: 'Fable', utilization: m.fable, resetsAt: week[m.tag] }],
    }));
    // each member's OWN established window (the panel's) — what a stated reset is judged against
    fs.writeFileSync(path.join(cacheDir, '.window-' + id[m.tag]), JSON.stringify({ sevenDay: week[m.tag], fiveHour: five[m.tag], scoped: { fable: week[m.tag] } }));
  }
  const sessions = new Map();
  const notices = [], arms = [], recovered = [];
  const autoResume = {
    armIfEnabled: (sid, s, until, why) => arms.push({ sid, until, why }),
    noteFireOutcome() { }, noteRecovered: (sid, why) => recovered.push({ sid, why }),
    noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { }, recentFireFailures: () => [],
  };
  const eng = engineModule.create({
    app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice: (k, t) => notices.push(t), serverSetting: () => undefined, getAccounts: () => am,
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }),
    recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => autoResume, getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null,
  });
  const mkSession = (sid, member, fields = {}) => {
    const s = {
      backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid,
      _accountId: P, name: sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now() - 6 * 3600e3,
      _spawnModel: 'claude-fable-5-1[1m]', pty: { write() { } }, ...fields,
    };
    sessions.set(sid, s);
    am.ensureSessionPoolLink(P, sid, id[member], { why: 'spawn' });
    return s;
  };
  const linkOf = (sid) => { const cur = am.poolCurrentFor(P, sid); return Object.keys(id).find((k) => id[k] === cur) || cur; };
  return { root, am, eng, sessions, id, P, notices, arms, recovered, readCache, mkSession, linkOf, nowSec, week, five };
}
function mkStdout(w, { stdoutModule = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hotsw-so-')); cleanup.push(tmp);
  const BUFFERS_DIR = path.join(tmp, 'buffers'), META_DIR = path.join(tmp, 'meta');
  fs.mkdirSync(BUFFERS_DIR, { recursive: true }); fs.mkdirSync(META_DIR, { recursive: true });
  const so = (stdoutModule || require(path.join(REPO, 'src/server/session-stdout.js'))).create({
    rootDir: tmp, BUFFERS_DIR, META_DIR, DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(tmp, 'nonexistent'),
    CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'rate_limit_event']), _seenStreamTypes: new Set(),
    activeSessions: w.sessions, engine: w.eng,
    checkClaudeGoalStatus() { }, broadcastToSession() { }, broadcastActiveSessions() { },
    noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h,
    sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null,
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), getTelemetry: () => null,
    getNoConvoRef: () => ({ map: new Map() }), getDeliver: () => ({ stashFor() { } }),
  });
  return { so };
}
const mkPty = () => { const p = { data: null, exit: null, onData(cb) { p.data = cb; }, onExit(cb) { p.exit = cb; } }; return p; };

// the records, in the CLI's own shapes (2.1.281: `assistant` stamped at emission)
const said = (ms, text, model = 'claude-fable-5-1') => ({ type: 'assistant', message: { id: 'msg_' + ms, role: 'assistant', model, content: [{ type: 'text', text }] }, parent_tool_use_id: null, session_id: 'cid-sess-4', uuid: 'u-' + ms + '-' + text.length, timestamp: iso(ms) });
const reading = (w, tag, u5) => ({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: w.five[tag], rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false, unifiedWindows: { five_hour: { utilization: u5, resetsAt: w.five[tag] }, seven_day: { utilization: 0.5, resetsAt: w.week[tag] } } }, uuid: 'rl-' + tag + u5, session_id: 'cid-sess-4' });
const fableWall = (w, tag) => ({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: w.week[tag], rateLimitType: 'seven_day', overageStatus: 'rejected', isUsingOverage: false }, uuid: 'rj-' + tag, session_id: 'cid-sess-4' });
const FABLE_BANNER = "You've reached your Fable limit. Switch to another model, or manage usage credits at claude.ai/settings/usage?from=cc_cli_limit_message, to continue.";
const errSaid = (ms) => ({ type: 'assistant', message: { id: 'msg_err_' + ms, role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: FABLE_BANNER }] }, parent_tool_use_id: null, session_id: 'cid-sess-4', uuid: 'ue-' + ms, timestamp: iso(ms), error: 'rate_limit', is_api_error_message: true });
const result = (n) => ({ type: 'result', subtype: 'success', is_error: false, session_id: 'cid-sess-4', uuid: 'res-' + n });
const chunk = (...recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';

/** THE BACKLOG: two turns the CLI ran while the bridge was dead — one on U
 *  (its reading: 5 h at 95 %), one on Q that met Q's Fable cap — delivered in
 *  ONE chunk at "15:05". */
function backlog(w, { hoursAgo = 3 } = {}) {
  const t0 = Date.now() - hoursAgo * 3600e3;
  return chunk(
    said(t0, 'working on it'), reading(w, 'u', 0.95), result(1),
    said(t0 + 600e3, 'next step'), fableWall(w, 'q'), errSaid(t0 + 600e3 + 40), result(2),
  );
}
function play(w, data, { stdoutModule = null, sid = 'sess-4' } = {}) {
  const s = w.sessions.get(sid);
  s._normalizer = s._normalizer || createMessageManager('claude', sid);
  const { so } = mkStdout(w, { stdoutModule });
  const pty = mkPty();
  so.setupSessionPty(s, sid, pty);
  const cap = quiet();
  for (const d of [].concat(data)) pty.data(d);
  return { s, lines: cap.done() };
}
const fableOf = (c) => (c?.scopedWeekly || []).find((b) => /fable/i.test(b.name || '')) || {};

console.log('— §A2 THE INCIDENT: the backlog of a stalled bridge is not taken as live');
{
  const w = mkWorld();
  if (!w) { ok('§A2 SKIP — pools unsupported on this platform', true); }
  else {
    w.mkSession('sess-4', 's');
    const { lines } = play(w, backlog(w));
    const S = w.readCache(w.id.s), U = w.readCache(w.id.u);
    ok('§A2 THE FIX: the member the link holds NOW keeps its Fable (a 12:15 wall another member answered is not charged to it)',
      fableOf(S).utilization === 0.03 && fableOf(S).status !== 'limited', JSON.stringify(fableOf(S)));
    ok('§A2 …the SPENT member\'s 5 h is not regressed by an hours-old reading (still 100 %)',
      U.fiveHour.utilization === 1, JSON.stringify(U.fiveHour));
    ok('§A2 …the conversation is not moved (the link still holds S)', w.linkOf('sess-4') === 's', w.linkOf('sess-4'));
    ok('§A2 …nothing is armed, no conversation is announced moved, no "turn completed normally" credit is taken',
      w.arms.length === 0 && w.notices.length === 0 && w.recovered.length === 0, JSON.stringify({ arms: w.arms, notices: w.notices, rec: w.recovered }).slice(0, 240));
    ok('§A2 …and the journal SAYS it, once, with how late',
      lines.filter((l) => /^\[stream\] sess-4: records arriving 3h\d\dm late — a stalled bridge's backlog/.test(l)).length === 1, lines.filter((l) => /\[stream\]|\[wall\]/.test(l)).join(' | ').slice(0, 300));
    // the first LIVE turn after the backlog is taken as live, and closes the episode
    const s = w.sessions.get('sess-4');
    const cap = quiet();
    const pty = mkPty(); mkStdout(w).so.setupSessionPty(s, 'sess-4', pty);
    pty.data(chunk(said(Date.now() - 3, 'live again'), reading(w, 's', 0.08), result(3)));
    const lines2 = cap.done();
    ok('§A2 the first LIVE turn is taken: its reading lands on the member it came from',
      w.readCache(w.id.s).fiveHour.utilization === 0.08, JSON.stringify(w.readCache(w.id.s).fiveHour));
    ok('§A2 …and closes the backlog episode with its count',
      lines2.some((l) => /^\[stream\] sess-4: backlog over — 5 late fact\(s\) not taken as live \(/.test(l) && /2 rate_limit_event/.test(l) && /1 limit banner/.test(l) && /2 turn end/.test(l)), lines2.filter((l) => /\[stream\]/.test(l)).join(' | '));
    ok('§A2 …and a normally completed LIVE turn still earns its credit', w.recovered.some((r) => r.why === 'turn completed normally'), JSON.stringify(w.recovered));
  }
  // NEGATIVE CONTROL: the engine without the gate. The backlog's readings and
  // turn ends are taken as NOW again — the spent member reads 95 %, the breaker
  // is credited for turns that ended hours ago. (The Fable half is ALSO refused
  // by §B's rule on its own — two independent protections; the second control
  // reverts both and reproduces the whole incident.)
  const mut = mutate('src/server/usage-pool-engine.js', 'nogate', [[
    "  if (!v || v.verdict !== 'late') return run();",
    '  return run(); // PRE-FIX: every record is NOW',
  ]]);
  ok('§A2 NEGATIVE CONTROL: the patch hit the engine', mut.hit === true, mut.why || '');
  if (mut.hit) {
    const w2 = mkWorld({ engineModule: mut.mod });
    w2.mkSession('sess-4', 's');
    play(w2, backlog(w2));
    const U = w2.readCache(w2.id.u);
    ok('§A2 NEGATIVE CONTROL: without the gate the spent member\'s 5 h reads 95 % again (the number that let the pool pick it)',
      U.fiveHour.utilization === 0.95, JSON.stringify(U.fiveHour));
    ok('§A2 NEGATIVE CONTROL: …and hours-old turn ends credit the loop breaker', w2.recovered.length >= 1, JSON.stringify(w2.recovered));
  }
  const both = mutate('src/server/usage-pool-engine.js', 'nogate-norefute', [[
    "  if (!v || v.verdict !== 'late') return run();",
    '  return run(); // PRE-FIX: every record is NOW',
  ], [
    "    if (!(refile && refile.from === pinKey && refile.to) && refuted && refuted.from === pinKey) {",
    '    if (false) { // PRE-FIX: the banner falls back to the pin',
  ], [
    "    if (rq && rq.from === pinnedKey) {",
    '    if (false) { // PRE-FIX',
  ]]);
  ok('§A2 NEGATIVE CONTROL (both reverted): the patch hit the engine', both.hit === true, both.why || '');
  if (both.hit) {
    const w2 = mkWorld({ engineModule: both.mod });
    w2.mkSession('sess-4', 's');
    const { lines } = play(w2, backlog(w2));
    const S = w2.readCache(w2.id.s);
    ok('§A2 NEGATIVE CONTROL (both reverted): the member the link holds gets another member\'s Fable wall — the incident, whole',
      fableOf(S).status === 'limited', JSON.stringify(fableOf(S)) + ' | ' + lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 300));
  }
}

console.log('— §A3 an UNSTAMPED record at the head of the backlog asks the record ahead of it');
{
  // the chunk STARTS with a reading (no stamp, no neighbour behind it): only the
  // look-ahead can tell it belongs to the backlog
  const head = (w) => chunk(reading(w, 'u', 0.95), said(Date.now() - 3 * 3600e3, 'old'), result(1));
  const w = mkWorld();
  if (w) {
    w.mkSession('sess-4', 's');
    play(w, head(w));
    ok('§A3 THE FIX: the head-of-backlog reading is judged by the stamped record ahead — not written',
      w.readCache(w.id.u).fiveHour.utilization === 1, JSON.stringify(w.readCache(w.id.u).fiveHour));
    // …while the SAME reading alone in its chunk (nothing ahead, nothing behind) runs as it always did
    const w3 = mkWorld();
    w3.mkSession('sess-4', 's');
    play(w3, [chunk(reading(w3, 'u', 0.95))]);
    ok('§A3 …an unstamped record with nothing to judge it by runs as live (a harness that stamps nothing is unchanged)',
      w3.readCache(w3.id.u).fiveHour.utilization === 0.95, JSON.stringify(w3.readCache(w3.id.u).fiveHour));
  }
  const mut = mutate('src/server/stdout/claude-stream-json.js', 'nopeek', [[
    '    session._peekStamp = () => nextStampIn(lineBuf);',
    '    session._peekStamp = () => null; // PRE-FIX: no look-ahead',
  ]]);
  ok('§A3 NEGATIVE CONTROL: the patch hit the parse', mut.hit === true, mut.why || '');
  if (mut.hit && w) {
    // a closed world: the registry and session-stdout that load THIS copy of the consumer
    const reg = mutate('src/server/stdout/index.js', 'nopeek-reg', [["require('./claude-stream-json.js')", `require(${JSON.stringify(mut.file)})`]]);
    const so = reg.hit && mutate('src/server/session-stdout.js', 'nopeek-so', [["require('./stdout/index.js')", `require(${JSON.stringify(reg.file)})`]]);
    ok('§A3 NEGATIVE CONTROL: the copy is wired through the registry and session-stdout', !!(reg.hit && so && so.hit), (reg.why || '') + (so && so.why || ''));
    if (so && so.hit) {
      const w2 = mkWorld();
      w2.mkSession('sess-4', 's');
      play(w2, head(w2), { stdoutModule: so.mod });
      ok('§A3 NEGATIVE CONTROL: without the look-ahead the head-of-backlog reading regresses the spent member',
        w2.readCache(w2.id.u).fiveHour.utilization === 0.95, JSON.stringify(w2.readCache(w2.id.u).fiveHour));
    }
  }
}

console.log('— §A4 an unstamped record in the MIDDLE of a backlog inherits the stamp behind it');
{
  const tail = (w) => chunk(said(Date.now() - 3 * 3600e3, 'old'), reading(w, 'u', 0.95));   // the backlog ENDS on the reading: nothing ahead
  const w = mkWorld();
  if (w) {
    w.mkSession('sess-4', 's');
    play(w, tail(w));
    ok('§A4 THE FIX: the reading inherits the late stamp of the record just before it — not written',
      w.readCache(w.id.u).fiveHour.utilization === 1, JSON.stringify(w.readCache(w.id.u).fiveHour));
  }
  const mut = mutate('src/record-lateness.js', 'noburst', [[
    '  if (clock && Number.isFinite(clock.arrivedAt) && now - clock.arrivedAt <= BURST_MS) {',
    '  if (false) { // PRE-FIX: an unstamped record inherits nothing',
  ]]);
  ok('§A4 NEGATIVE CONTROL: the patch hit record-lateness', mut.hit === true, mut.why || '');
  if (mut.hit && w) {
    const eng = mutate('src/server/usage-pool-engine.js', 'noburst-eng', [["require('../record-lateness.js')", `require(${JSON.stringify(mut.file)})`]]);
    if (eng.hit) {
      const w2 = mkWorld({ engineModule: eng.mod });
      w2.mkSession('sess-4', 's');
      play(w2, tail(w2));
      ok('§A4 NEGATIVE CONTROL: without the inheritance the reading regresses the spent member',
        w2.readCache(w2.id.u).fiveHour.utilization === 0.95, JSON.stringify(w2.readCache(w2.id.u).fiveHour));
    }
  }
}

console.log('— §A5 a backlog\'s turn END settles nothing');
{
  const ends = (w) => chunk(said(Date.now() - 3 * 3600e3, 'old'), result(1));
  const w = mkWorld();
  if (w) {
    w.mkSession('sess-4', 's');
    play(w, ends(w));
    ok('§A5 THE FIX: an hours-old "turn completed normally" is not a loop-breaker credit', w.recovered.length === 0, JSON.stringify(w.recovered));
  }
  const mut = mutate('src/server/usage-pool-engine.js', 'noend', [[
    '  if (recordIsLate(session, rec)) {\n    noteLateFact(session, \'turn end\', liveFactVerdict(session, rec));',
    '  if (false) { // PRE-FIX: a backlog turn end settles like a live one\n    noteLateFact(session, \'turn end\', liveFactVerdict(session, rec));',
  ]]);
  ok('§A5 NEGATIVE CONTROL: the patch hit the engine', mut.hit === true, mut.why || '');
  if (mut.hit) {
    const w2 = mkWorld({ engineModule: mut.mod });
    w2.mkSession('sess-4', 's');
    play(w2, ends(w2));
    ok('§A5 NEGATIVE CONTROL: without it the backlog\'s turn end credits the breaker', w2.recovered.length === 1, JSON.stringify(w2.recovered));
  }
}

console.log('— §A6 the DEVICE feed shows every record to the same clock');
{
  const brainFor = (w, mod) => (mod || require(path.join(REPO, 'src/server/session-brain.js'))).create({
    engine: w.eng, applyTaskToolUpdate() { }, updateSessionTodos() { }, getUsageHistory: () => ({ _cost: () => 0 }),
  });
  const feed = (w, mod) => {
    const s = w.sessions.get('sess-4');
    const brain = brainFor(w, mod);
    const cap = quiet();
    brain.claudeSideEffects(s, 'sess-4', said(Date.now() - 3 * 3600e3, 'old'));
    brain.claudeSideEffects(s, 'sess-4', reading(w, 'u', 0.95));
    cap.done();
  };
  const w = mkWorld();
  if (w) {
    w.mkSession('sess-4', 's');
    feed(w);
    ok('§A6 THE FIX: a late record relayed by the device feed is not taken either', w.readCache(w.id.u).fiveHour.utilization === 1, JSON.stringify(w.readCache(w.id.u).fiveHour));
  }
  const mut = mutate('src/server/session-brain.js', 'nodevclock', [[
    '    try { noteStreamRecord?.(session, msg); } catch { }',
    '    // PRE-FIX: the device feed never shows its records to the clock',
  ]]);
  ok('§A6 NEGATIVE CONTROL: the patch hit session-brain', mut.hit === true, mut.why || '');
  if (mut.hit) {
    const w2 = mkWorld();
    w2.mkSession('sess-4', 's');
    feed(w2, mut.mod);
    ok('§A6 NEGATIVE CONTROL: without it the device-fed backlog reading regresses the spent member', w2.readCache(w2.id.u).fiveHour.utilization === 0.95, JSON.stringify(w2.readCache(w2.id.u).fiveHour));
  }
}

console.log('— §A7 wiring');
{
  const cs = read('src/server/stdout/claude-stream-json.js'), br = read('src/server/session-brain.js'), eng = read('src/server/usage-pool-engine.js');
  ok('§A7 the parse shows EVERY record to the clock right after it parses', /const msg = JSON\.parse\(line\);\s*\n\s*parsed = true;[\s\S]{0,400}?noteStreamRecord\?\.\(session, msg\)/.test(cs));
  ok('§A7 …and hands the record to the banner (both producers) and the turn end',
    (cs.match(/markLimitBanner\(session, [^,]+, msg\)/g) || []).length === 2 && /noteTurnEnd\?\.\(session, msg\)/.test(cs) && /noteSessionProduced\?\.\(session, msg\)/.test(cs));
  ok('§A7 the device feed does the same', /noteStreamRecord\?\.\(session, msg\)/.test(br) && /markLimitBanner\(session, b\.text, msg\)/.test(br));
  ok('§A7 both feeds keep a backlog\'s spend off the live odometer', /recordIsLate\?\.\(session, msg\)\)/.test(cs) && /recordIsLate\?\.\(session, msg\)\)/.test(br));
  ok('§A7 the three live-fact consumers are gated in the engine',
    /function recordRateLimitEvent\(session, msg\) \{\s*\n\s*return gateLiveFact\(session, msg, 'rate_limit_event'/.test(eng)
    && /function markLimitBanner\(session, text, rec = null\) \{\s*\n\s*return gateLiveFact\(session, rec, 'limit banner'/.test(eng)
    && /function noteTurnEnd\(session, rec = null\) \{[\s\S]{0,900}?if \(recordIsLate\(session, rec\)\)/.test(eng));
}

// ═══ §B A WALL WHOSE OWN WINDOW REFUTES THE PIN NEVER DEMOTES THE PIN ═══════
// The incident's last hop, LIVE this time (a lag-shadow response has the same
// shape): the rejection record states member Q's week while the link and the
// slot ledger name S. The record was always archived ("contradicts the
// member's own unexpired window but the ledger names that same member") — and
// the window-less banner of the same wall then marked S's Fable anyway, and the
// turn end excluded S from the conversation.
console.log('— §B a refuted wall: not marked by its banner, not demoted, not excluded');
const liveRefutedWall = (w) => chunk(said(Date.now() - 5, 'working'), fableWall(w, 'q'), errSaid(Date.now() - 2), result(9));
{
  const w = mkWorld();
  if (w) {
    w.mkSession('sess-4', 's');
    const { lines } = play(w, liveRefutedWall(w));
    const S = w.readCache(w.id.s);
    ok('§B THE FIX: the banner of a refuted wall does not mark the pin (its Fable is untouched)',
      fableOf(S).utilization === 0.03 && fableOf(S).status !== 'limited', JSON.stringify(fableOf(S)));
    ok('§B …the record and the banner are both ARCHIVED with the reason, never silently dropped',
      lines.some((l) => /\[wall\] sess-4: refusing to mark Member S sevenDay|\[wall\] sess-4: refusing to mark Member S 7d/.test(l))
      && lines.some((l) => /\[wall\] sess-4: refusing to mark Member S fable — the banner is the same wall this turn's rejection record proved is not Member S's/.test(l)),
      lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 400));
    ok('§B …the turn end says the pin did not refuse, and demotes nothing',
      lines.some((l) => /\[wall\] sess-4: Member S did not refuse this turn/.test(l)) && !lines.some((l) => /\[wall\] demoted/.test(l)),
      lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 400));
    ok('§B …S is NOT excluded from this conversation (it was the "2 members already rejected" of the incident)',
      !w.eng.sessionWalledMembers('sess-4').has(w.id.s), JSON.stringify([...w.eng.sessionWalledMembers('sess-4')]));
    ok('§B …and S\'s own wall ring does not count it (the ≥2-walls corroboration other conversations lean on)',
      w.eng.wallCount(w.id.s) === 0, String(w.eng.wallCount(w.id.s)));
    ok('§B …the conversation stays on S', w.linkOf('sess-4') === 's', w.linkOf('sess-4'));
    // a wall the pin's own window does NOT contradict is still the pin's — the rule refuses nothing else
    const w3 = mkWorld();
    w3.mkSession('sess-4', 's');
    play(w3, chunk(said(Date.now() - 5, 'working'), fableWall(w3, 's'), errSaid(Date.now() - 2), result(9)));
    ok('§B CONTROL: the pin\'s OWN Fable wall is still marked on it', fableOf(w3.readCache(w3.id.s)).status === 'limited', JSON.stringify(fableOf(w3.readCache(w3.id.s))));
  }
  const mutB = mutate('src/server/usage-pool-engine.js', 'nobanner', [[
    "    if (!(refile && refile.from === pinKey && refile.to) && refuted && refuted.from === pinKey) {",
    '    if (false) { // PRE-FIX: the banner falls back to the pin',
  ], [
    "    if (rq && rq.from === pinnedKey) {",
    '    if (false) { // PRE-FIX',
  ]]);
  ok('§B NEGATIVE CONTROL: the patch hit the engine', mutB.hit === true, mutB.why || '');
  if (mutB.hit) {
    const w2 = mkWorld({ engineModule: mutB.mod });
    w2.mkSession('sess-4', 's');
    const { lines } = play(w2, liveRefutedWall(w2));
    ok('§B NEGATIVE CONTROL: without the refutation the banner marks the member with quota (the incident\'s last hop)',
      fableOf(w2.readCache(w2.id.s)).status === 'limited', JSON.stringify(fableOf(w2.readCache(w2.id.s))) + ' | ' + lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 300));
  }
  const mutX = mutate('src/server/usage-pool-engine.js', 'noexclude', [[
    "  if (onPin.length && !onPin.includes('write')) {",
    "  noteSessionWall(session._webuiId, member.id, now); // PRE-FIX: the pin is excluded whatever the signals prove\n  if (onPin.length && !onPin.includes('write')) {",
  ]]);
  ok('§B NEGATIVE CONTROL: the exclusion patch hit the engine', mutX.hit === true, mutX.why || '');
  if (mutX.hit) {
    const w2 = mkWorld({ engineModule: mutX.mod });
    w2.mkSession('sess-4', 's');
    play(w2, liveRefutedWall(w2));
    ok('§B NEGATIVE CONTROL: without it the member with quota is excluded from the conversation',
      w2.eng.sessionWalledMembers('sess-4').has(w2.id.s), JSON.stringify([...w2.eng.sessionWalledMembers('sess-4')]));
  }
}

// ═══ §C THE BUMP THAT MAKES A RE-POINT VISIBLE ══════════════════════════════
// Measured (scripts/fixtures/claude-cred-read-2.1.281.json, `hardlink-same`): a
// running CLI re-reads its credential only when the mtime it statx()es through
// the link DIFFERS from the last one it saw. So every way a link moves — the
// per-session switch, the pool default, the owner's "move everything now"
// sweep (whose own re-points pass no path: the default re-point in the same
// call bumps that same target) — must leave the TARGET's creds mtime changed.
console.log('— §C every re-point bumps the target creds mtime (the CLI\'s only change signal)');
function repointLegs(AM) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hotsw-bump-')); cleanup.push(root);
  const am = new AM({ dataDir: path.join(root, 'data') });
  if (!am.poolSupported()) return null;
  const a = am.createSubscription({ name: 'Member A' }).id, b = am.createSubscription({ name: 'Member B' }).id, c = am.createSubscription({ name: 'Member C' }).id;
  for (const id of [a, b, c]) fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 });
  const P = am.createPool({ name: 'Pool' }).id;
  am.setPoolTarget(P, a);
  am.ensureSessionPoolLink(P, 'sess-1', a, { why: 'spawn' });
  // a WHOLE-second old mtime, compared with a 1 s tolerance (a float mtimeMs read back from ns never equals a Date's ms exactly)
  const aged = (id) => { const f = path.join(am.subDir(id), '.credentials.json'); const oldS = Math.floor(Date.now() / 1000) - 3600; fs.utimesSync(f, oldS, oldS); return () => Math.abs(fs.statSync(f).mtimeMs - oldS * 1000) > 1000; };
  const bMoved = aged(b);
  am.ensureSessionPoolLink(P, 'sess-1', b, { why: 'per-session-switch' });   // the engine's per-session switch
  const cMoved = aged(c);
  am.setPoolTarget(P, c, { sweepSessionLinks: true });                         // the owner's "move everything now"
  return { perSession: bMoved(), sweep: cMoved(), linkNow: am.poolCurrentFor(P, 'sess-1') === c };
}
{
  const r = repointLegs(AccountManager);
  if (r) ok('§C every re-point path leaves the target creds mtime changed (per-session switch, default + sweep)', r.perSession && r.sweep && r.linkNow, JSON.stringify(r));
  const mat = mutate('src/account-material.js', 'nobump', [[
    '  if (credsPath) { try { const now = Date.now() / 1000; fs.utimesSync(credsPath, now, now); } catch { } }',
    '  // PRE-FIX: no bump',
  ]]);
  ok('§C NEGATIVE CONTROL: the patch hit account-material', mat.hit === true, mat.why || '');
  if (mat.hit && r) {
    const rebind = ["require('./account-material.js')", `require(${JSON.stringify(mat.file)})`];
    const accts = mutate('src/accounts.js', 'nobump-acc', [rebind, rebind, rebind]); // accounts.js requires it at each of its three re-point sites
    const r2 = accts.hit ? repointLegs(accts.mod.AccountManager) : null;
    ok('§C NEGATIVE CONTROL: without the bump every path leaves the mtime — a running CLI never follows the move', !!r2 && !r2.perSession && !r2.sweep && r2.linkNow, JSON.stringify(r2) + (accts.why || ''));
  }
}

// ═══ §D THE OTel ORG IS A MACHINE-WIDE LABEL — NOTHING READS IT AS A MEMBER ══
// Measured (the fixture's `otelOrg`: one value for BOTH tokens — ~/.claude.json's
// oauthAccount). Production: ~99 % of every conversation's rows named one member
// for four days while 47 of 47 fingerprinted rejections were answered by the
// member each link named. The census: no executable line in src/ asks the label
// which member a session is on, and the stash row no longer writes `agreed`.
console.log('— §D the OTel org is a label: nothing reads it as a member');
{
  const rec = JSON.parse(read('scripts/fixtures/claude-cred-read-2.1.281.json'));
  const orgs = rec.variants.symlink.otelOrg;
  ok('§D the measurement: ONE OTel org for both tokens across the re-point (a label, not the bill)', orgs.length === 1 && rec.variants.symlink.requests.msg2.every((a) => a === 'B:200'), JSON.stringify(rec.variants.symlink));
  const codeOf = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const asksLabel = (text) => /observedOrgFor\??\.?\(|\bobservedMemberFor\b|\bcorroborateReading\b/.test(codeOf(text));
  const readers = (files) => files.filter((f) => asksLabel(read(f)));
  const srcFiles = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) walk(rel); else if (/\.(c|m)?js$/.test(e.name)) srcFiles.push(rel); } };
  walk('src'); srcFiles.push('server.js');
  const hits = readers(srcFiles);
  ok('§D no executable line in src/ or server.js asks the label which member a session is on', hits.length === 0, hits.join(' '));
  const ingest = codeOf(read('src/server/otel-ingest.js'));
  ok('§D the stash row names its comparison for what it is (`labelMatchesSlot`), and writes no `agreed`', /labelMatchesSlot: attributed === \(acct \|\| null\)/.test(ingest) && !/\bagreed:/.test(ingest));
  // NEGATIVE CONTROL: the census sees a planted reader
  const planted = read('src/server/usage-pool-engine.js').replace('function resolveUsageKey(session) {', 'function resolveUsageKey(session) { const o = getOtelIngest()?.observedOrgFor?.(session?.claudeSessionId); void o;');
  ok('§D NEGATIVE CONTROL: the same census catches a planted `observedOrgFor` read in the engine', planted !== read('src/server/usage-pool-engine.js') && asksLabel(planted) && !asksLabel(read('src/server/usage-pool-engine.js')));
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
