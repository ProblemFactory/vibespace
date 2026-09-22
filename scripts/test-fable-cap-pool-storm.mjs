#!/usr/bin/env node
// THE FABLE-CAP POOL STORM (2026-09-13 04:58-05:01Z, production forensics).
//
// WHAT HAPPENED. The owner's main conversation ("VibeSpace 主开发", spawn model
// `fable[1m]`) was proactively moved off the ONE member that still had Fable
// quota, onto three members whose Fable cap was 100 % spent, one after another;
// each move earned a limit rejection, each rejection falsely marked that
// member's PLAN week 100 % spent for 12-60 h, and the two OPUS conversations
// linked to the same members were bounced along on every hop. Meanwhile the
// pool told the owner three times that "no member can serve it — out of quota
// (still available: 5h 100%, 7d 69%, Fable 45%)" — numbers that belong to the
// member it was already sitting on, which was healthy on every bucket.
//
// THREE INDEPENDENT DEFECTS, each reproduced here against the REAL modules:
//   §1 PLACEMENT FOLLOWED A FALLBACK-SERVED MODEL. The CLI's safety classifier
//      rerouted `claude-fable-5-1 → claude-opus-4-8`, announced it ONCE
//      (`scope:"session"`) and then answered 18 more records as opus with no
//      marker at all — while still REQUESTING Fable. `sessionModelFor` prefers
//      the served model, so the pool projected the OPUS view, dropped the Fable
//      bucket that was the binding constraint, and moved the conversation.
//   §2 A MODEL-CAP REJECTION MARKED THE PLAN LANE. claude 2.1.267 has no
//      `seven_day_fable` type, so the rejection arrives on the UNSCOPED
//      `seven_day` lane and only the banner names the model — we wrote both.
//   §3 A HEALTHY CURRENT MEMBER WAS REPORTED AS "NO MEMBER CAN SERVE IT".
//
// Every leg here runs the real engine / the real pool with real credential
// symlinks / the real stdout consumer, and every fix has a NEGATIVE CONTROL
// that is a PATCHED COPY of the real module with the patch asserted to hit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const { parseRateLimitEvent } = require(path.join(REPO, 'src/rate-limit-capture.js'));
const { decidePoolSwitch, poolBlockedNotice } = require(path.join(REPO, 'src/account-pool-auto.js'));
const { projectCacheForFamily } = require(path.join(REPO, 'src/model-family.js'));

const cleanup = [];
// PATCHED COPIES live BESIDE the real module (their relative requires must
// resolve), are gitignored, and are swept by PID at start — a SIGKILL must
// never leave this suite's litter in the tree, because a dirty tree is what the
// release gate refuses on. Only a PID that is GONE may be swept: this suite can
// legitimately run twice in the same checkout.
for (const dir of ['src', 'src/server', 'src/server/stdout']) {
  try {
    for (const f of fs.readdirSync(path.join(REPO, dir))) {
      const m = /^vs-fable-mut-(\d+)-/.exec(f);
      if (!m || Number(m[1]) === process.pid) continue;
      try { process.kill(Number(m[1]), 0); continue; } catch { }
      try { fs.unlinkSync(path.join(REPO, dir, f)); } catch { }
    }
  } catch { }
}
const mutants = [];
process.on('exit', () => {
  for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
  for (const f of mutants) { try { fs.unlinkSync(f); } catch { } }
});
/** Write a patched SIBLING of a real module and require it. */
function mutate(rel, tag, replacements) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  let out = src;
  for (const [from, to] of replacements) {
    if (!out.includes(from)) return { hit: false, why: 'anchor not found: ' + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const fp = path.join(REPO, path.dirname(rel), 'vs-fable-mut-' + process.pid + '-' + tag + '.js');
  fs.writeFileSync(fp, out); mutants.push(fp);
  return { hit: out !== src, mod: require(fp), file: fp };
}
/** MASTER'S BLOCKED-NOTICE MACHINERY, verbatim from d2065aa2 — the two-band
 *  bucket split and the sentence that rode the live list whatever else was
 *  true. §3 (round 1) and §6 (r2) share ONE definition of "master" so neither
 *  control can quietly drift into being a control for something else. */
const MASTER_NOTICE_PATCHES = [
  [
    '    deadBuckets: brs.filter((b) => b.remaining < THRESH[b.kind].hard).map(pct),\n'
    + '    lowBuckets: brs.filter((b) => b.remaining >= THRESH[b.kind].hard && b.remaining < softLine(b)).map(pct),\n'
    + '    liveBuckets: brs.filter((b) => b.remaining >= softLine(b)).map(pct),',
    '    deadBuckets: brs.filter((b) => b.remaining < THRESH[b.kind].hard).map((b) => `${b.label} ${Math.round(b.remaining)}%`), // PRE-FIX: two bands, split on the HARD floor\n'
    + '    liveBuckets: brs.filter((b) => b.remaining >= THRESH[b.kind].hard).map((b) => `${b.label} ${Math.round(b.remaining)}%`),',
  ],
  [
    '  const what = dead && low ? `spent: ${dead}; nearly spent: ${low}`\n'
    + '    : dead ? `spent: ${dead}`\n'
    + '    : low ? `nearly spent: ${low}`\n'
    + "    : 'out of quota';",
    "  const what = dead ? `spent: ${dead}` : 'out of quota'; // PRE-FIX: only a HARD-dead bucket could be named",
  ],
  [
    "  const rest = (dead || low) && live ? ` (still available: ${live})` : '';",
    "  const rest = live ? ` (still available: ${live})` : ''; // PRE-FIX: the live list rides even when nothing is spent",
  ],
];
const quiet = () => {
  const o = console.log, w = console.warn; const lines = [];
  console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' '));
  return { done: () => { console.log = o; console.warn = w; return lines; } };
};

const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });

// ── THE INCIDENT'S OWN NUMBERS ─────────────────────────────────────────────
// Read out of this instance's data/usage-anchors on-demand rows, 04:31-04:55Z,
// and out of the caches the walls then wrote. `hoursOut` is each member's
// weekly reset, which is what EDF ranks on.
const MEMBERS = [
  { tag: 'personal', name: 'Member P', u5: 0.21, u7: 0.34, fable: 0.60, hoursOut: 100 },
  { tag: 'fish', name: 'Member F', u5: 0.00, u7: 0.83, fable: 1.00, hoursOut: 11.8 },
  { tag: 'wmax', name: 'Member W', u5: 0.03, u7: 0.65, fable: 1.00, hoursOut: 44.8 },
  { tag: 'pf', name: 'Member Q', u5: 0.00, u7: 0.70, fable: 1.00, hoursOut: 59.8 },
  { tag: 'uci', name: 'Member U', u5: 0.06, u7: 0.63, fable: 0.99, hoursOut: 82 },
];

/** A real pool over the incident's five subscriptions, with real per-session
 *  credential symlinks and the REAL engine over the real usage-cache writer.
 *  `sameDeadline` collapses every member's weekly reset onto one instant so the
 *  EDF PROACTIVE tier is structurally silent (it needs a strictly-sooner
 *  deadline by PROACTIVE_MARGIN_SEC) — used where the leg must prove that the
 *  ONLY thing that could move a conversation is a wall. */
function mkWorld({ sameDeadline = false, engineModule = engMod, roster = MEMBERS, metaStore = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fablestorm-'));
  cleanup.push(root);
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const id = {};
  for (const m of roster) {
    id[m.tag] = am.createSubscription({ name: m.name }).id;
    fs.writeFileSync(path.join(am.subDir(id[m.tag]), '.credentials.json'), CREDS(id[m.tag]), { mode: 0o600 });
  }
  const P = am.createPool({ name: '全部' }).id;
  am.setPoolTarget(P, id[roster[0].tag]);
  am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowSec = Math.floor(Date.now() / 1000);
  const readCache = (k) => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, k + '.json'), 'utf8')); } catch { return null; } };
  const writeCache = (k, c) => fs.writeFileSync(path.join(cacheDir, k + '.json'), JSON.stringify(c));
  // The store is LAZY in production (session-stdout is constructed ~70 lines
  // after this engine), so a leg that needs the REAL writer may wire it AFTER
  // the world exists — which is the boot order, not a convenience.
  let metaStoreRef = metaStore;
  const resets = {};
  for (const m of roster) {
    const r = nowSec + Math.round((sameDeadline ? 48 : m.hoursOut) * 3600);
    resets[m.tag] = r;
    writeCache(id[m.tag], {
      fetchedAt: Date.now() - 60000, source: 'on-demand',
      fiveHour: { utilization: m.u5, resetsAt: nowSec + 2 * 3600 },
      sevenDay: { utilization: m.u7, resetsAt: r },
      // `opus` is OPT-IN per member: only §5 needs a second model-scoped cap,
      // and every other section must keep the incident's own one-bucket shape.
      scopedWeekly: [{ name: 'Fable', utilization: m.fable, resetsAt: r },
        ...(m.opus != null ? [{ name: 'Opus', utilization: m.opus, resetsAt: r }] : [])],
    });
  }
  const sessions = new Map();
  const notices = [], arms = [];
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const autoResume = {
    armIfEnabled: (sid, s, until, why, wall) => arms.push({ sid, until, why, wall }),
    noteFireOutcome() { }, noteRecovered() { },
    noteNoPoolTarget(sid, n, reason) { arms.push({ noPoolTarget: reason, sid }); },
    statusFor: () => null, enabledFor: () => false, fireNow() { },
  };
  const eng = engineModule.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice: (k, t) => notices.push(t),
    serverSetting: () => undefined, getAccounts: () => am,
    // a device handle that accepts the sealed-orders push and does nothing: the
    // push is fire-and-forget, so a rejection lands on a LATER tick and would
    // print outside every quiet() window in this file. It is not under test.
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }),
    recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => autoResume, getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null,
    // the session-meta store (r3 §7): only the legs that drive the reroute
    // stamp across a restart pass one — everywhere else it is absent, which is
    // exactly the `mk()`-over-null shape production takes before boot order
    // reaches session-stdout.
    getSessionMetaStore: () => metaStoreRef,
  });
  const mkSession = (sid, member, fields = {}) => {
    const s = {
      backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid,
      _accountId: P, name: sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(),
      pty: { write() { } }, ...fields,
    };
    sessions.set(sid, s);
    am.ensureSessionPoolLink(P, sid, id[member], { why: 'spawn' });
    return s;
  };
  const linkOf = (sid) => { const cur = am.poolCurrentFor(P, sid); return Object.keys(id).find((k) => id[k] === cur) || cur; };
  return { root, dataDir, cacheDir, am, eng, sessions, id, P, notices, arms, readCache, writeCache, mkSession, linkOf, nowSec, resets, setMetaStore: (m) => { metaStoreRef = m; } };
}

// ═══ §1 PLACEMENT FOLLOWS THE REQUEST MODEL, NEVER A FALLBACK-SERVED ONE ════
console.log('— §1 placement follows the REQUEST model');
{
  const w = mkWorld();
  if (!w) { ok('§1 SKIP — pools unsupported on this platform', true); }
  else {
    // THE PRODUCTION RECORDS, verbatim from the frozen transcript
    // (data/incidents/inc-mtzcj5sl-lzmw, session 9f4cd444-…): ONE fallback
    // block at 04:42:45, ONE `system/model_refusal_fallback` at 04:43:36 with
    // `scope:"session"`, and then eighteen plain `claude-opus-4-8` assistant
    // records carrying no marker whatsoever.
    const s = w.mkSession('sess-6', 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
    ok('§1 setup: the spawn model is the REQUEST model, and nothing has been served yet',
      w.eng.sessionModelFor(s) === 'claude-fable-5-1[1m]', String(w.eng.sessionModelFor(s)));

    w.eng.noteModelFallback(s, 'claude-fable-5-1', 'claude-opus-4-8');
    for (let i = 0; i < 18; i++) w.eng.noteServedModel(s, 'claude-opus-4-8');
    ok('§1 eighteen unmarked `claude-opus-4-8` records later, the session still states the model it REQUESTS',
      w.eng.sessionModelFor(s) === 'claude-fable-5-1[1m]', String(w.eng.sessionModelFor(s)));
    ok('§1 …and the served model itself is still recorded (the model LOCK and the status bar still need it)',
      s._servedModel === 'claude-opus-4-8' && !!s._servedModelAt);

    // THE INCIDENT: the per-session pass over the incident's own caches.
    const cap = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P);
    const lines = cap.done();
    ok('§1 THE INCIDENT: the conversation stays on the only member that still has Fable',
      w.linkOf('sess-6') === 'personal', w.linkOf('sess-6') + ' | ' + lines.filter((l) => /\[pool\]/.test(l)).join(' | ').slice(0, 200));
    ok('§1 …and nothing was announced to the user about it',
      w.notices.length === 0, JSON.stringify(w.notices).slice(0, 200));

    // NEGATIVE CONTROL: master's own ladder, on the same world.
    const mut = mutate('src/server/usage-pool-engine.js', 'served', [[
      'const served = servedDefinesModel(s) ? { m: s._servedModel, at: s._servedModelAt || 0 } : null;',
      'const served = s._servedModel ? { m: s._servedModel, at: s._servedModelAt || 0 } : null; // PRE-FIX: a fallback-served model defines the session',
    ]]);
    ok('§1 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const w2 = mkWorld({ engineModule: mut.mod });
      const s2 = w2.mkSession('sess-6', 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
      w2.eng.noteModelFallback(s2, 'claude-fable-5-1', 'claude-opus-4-8');
      for (let i = 0; i < 18; i++) w2.eng.noteServedModel(s2, 'claude-opus-4-8');
      const cap2 = quiet();
      w2.eng.maybePoolAutoSwitchForPool(w2.P);
      const l2 = cap2.done();
      ok('§1 NEGATIVE CONTROL: without the rule the pool really does move it onto the Fable-dead member (the incident)',
        w2.linkOf('sess-6') === 'fish', w2.linkOf('sess-6') + ' | ' + l2.filter((l) => /per-session switch/.test(l)).join(' | ').slice(0, 200));
      ok('§1 NEGATIVE CONTROL: …and the notice tells the owner it moved because of its OPUS quota',
        w2.notices.some((n) => /opus quota/.test(n)), JSON.stringify(w2.notices).slice(0, 220));
    }

    // CONTROL ①: a served model that changed WITHOUT a fallback (a CLI-side
    // `/model`) still defines the session — this fix narrows the ladder, it
    // does not retire the served model.
    const w3 = mkWorld();
    const s3 = w3.mkSession('sess-x', 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
    w3.eng.noteServedModel(s3, 'claude-opus-4-8');
    ok('§1 CONTROL: a served model with NO fallback on record still defines the session',
      w3.eng.sessionModelFor(s3) === 'claude-opus-4-8', String(w3.eng.sessionModelFor(s3)));
    // …and the stamp RETIRES the moment something other than the fallback
    // target answers (an in-CLI switch away, a recovered turn).
    const s4 = w3.mkSession('sess-y', 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
    w3.eng.noteModelFallback(s4, 'claude-fable-5-1', 'claude-opus-4-8');
    w3.eng.noteServedModel(s4, 'claude-sonnet-5');
    ok('§1 CONTROL: the fallback stamp retires when anything else answers, and that served model counts',
      w3.eng.sessionModelFor(s4) === 'claude-sonnet-5' && s4._servedViaFallback == null, String(w3.eng.sessionModelFor(s4)));
    // …and an explicit PICK outranks both, whatever the classifier did.
    const s5 = w3.mkSession('sess-z', 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
    w3.eng.noteModelFallback(s5, 'claude-fable-5-1', 'claude-opus-4-8');
    w3.eng.noteServedModel(s5, 'claude-opus-4-8');
    s5._pickedModel = 'claude-opus-4-8'; s5._pickedModelAt = Date.now() + 1000;
    ok('§1 CONTROL: an explicit per-session PICK still outranks everything (picked > spawn > served-if-not-fallback)',
      w3.eng.sessionModelFor(s5) === 'claude-opus-4-8', String(w3.eng.sessionModelFor(s5)));
    // CONTROL ②: nothing known at all ⇒ null ⇒ NO projection ⇒ every bucket
    // counts. The conservative direction, and the reason `null` is not a guess.
    const s6 = w3.mkSession('sess-w', 'personal');
    w3.eng.noteModelFallback(s6, 'claude-fable-5-1', 'claude-opus-4-8');
    w3.eng.noteServedModel(s6, 'claude-opus-4-8');
    ok('§1 CONTROL: with no pick and no spawn model the answer is null — no projection, so every bucket counts',
      w3.eng.sessionModelFor(s6) === null, String(w3.eng.sessionModelFor(s6)));
    ok('§1 CONTROL: …and null really does mean the WHOLE cache (a spent Fable cap is a wall for an unknown session too)',
      JSON.stringify(projectCacheForFamily(w3.readCache(w3.id.fish), null)) === JSON.stringify(w3.readCache(w3.id.fish)));
  }
}

// ── §1b THE TWIN: both stdout feeds stamp the same fact ─────────────────────
{
  const brainSrc = fs.readFileSync(path.join(REPO, 'src/server/session-brain.js'), 'utf8');
  const parseSrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
  for (const [what, src] of [['the device feed (claudeSideEffects)', brainSrc], ['the parse (claude-stream-json)', parseSrc]]) {
    ok('§1b ' + what + ' records the served model through the engine\'s ONE consumer', /noteServedModel\(session, /.test(src));
    ok('§1b ' + what + ' stamps the fallback on BOTH of its records (the block and the system record)',
      (src.match(/noteModelFallback\(session, /g) || []).length >= 2, String((src.match(/noteModelFallback\(session, /g) || []).length));
  }
  ok('§1b neither feed assigns `_servedModel` inline any more (an inline twin is the drift the CS rules ban)',
    !/session\._servedModel\s*=/.test(brainSrc) && !/session\._servedModel\s*=/.test(parseSrc));
}

// ═══ §2 A MODEL-CAP REJECTION MARKS THE MODEL'S CAP, NEVER THE PLAN LANE ════
console.log('— §2 the rejection marks the model cap');
// THE VOCABULARY FACT, measured on the installed claude 2.1.267 and on this
// instance's own session buffers: the ONLY `rateLimitType` values that exist
// are these six, and there is NO `seven_day_fable`.
const CLI_TYPES = ['five_hour', 'seven_day', 'seven_day_overage_included', 'seven_day_sonnet', 'seven_day_opus', 'seven_day_oauth_apps'];
{
  ok('§2 the measured 2.1.267 vocabulary has no `seven_day_fable` — a Fable cap can ONLY arrive unscoped',
    !CLI_TYPES.includes('seven_day_fable'));
  const kindOf = (t) => parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: t } });
  ok('§2 …and the parser agrees: `seven_day` is the unscoped weekly lane',
    kindOf('seven_day').kind === 'sevenDay' && kindOf('seven_day').scopedName === null);
  ok('§2 …while `seven_day_opus` is already scoped and needs no deferral at all',
    kindOf('seven_day_opus').kind === 'scoped' && kindOf('seven_day_opus').scopedName === 'opus');
  ok('§2 …and a FUTURE `seven_day_fable` would be scoped by the same regex — the rule never mentions a model NAME',
    kindOf('seven_day_fable').kind === 'scoped' && kindOf('seven_day_fable').scopedName === 'fable');
  ok('§2 the BANNER is the only thing that names the model, and it says `scoped`',
    JSON.stringify(ClaudeCodeAdapter.parseLimitBanner("You've reached your Fable limit. Switch to another model, or manage usage credits at claude.ai/settings/usage?from=cc_cli_limit_message, to continue.")) === JSON.stringify({ kind: 'scoped', name: 'Fable' }));
}

const FABLE_BANNER = "You've reached your Fable limit. Switch to another model, or manage usage credits at claude.ai/settings/usage?from=cc_cli_limit_message, to continue.";
/** The REAL session-stdout engine over a world — its own tmp meta/buffer dirs.
 *  `engine` is the caller's so a PATCHED-COPY control reaches the consumer too. */
function mkStdout(w, { engine = w.eng, broadcastToSession = () => { }, stdoutModule = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fablestorm-so-')); cleanup.push(tmp);
  const BUFFERS_DIR = path.join(tmp, 'buffers'), META_DIR = path.join(tmp, 'meta');
  fs.mkdirSync(BUFFERS_DIR, { recursive: true }); fs.mkdirSync(META_DIR, { recursive: true });
  // `stdoutModule` = a PATCHED COPY of session-stdout (r3-r2 §7d's negative
  // control chains consumer → registry → session-stdout so the pre-fix latch
  // runs inside the REAL pipeline, not a re-implementation of it).
  const so = (stdoutModule || require(path.join(REPO, 'src/server/session-stdout.js'))).create({
    rootDir: tmp, BUFFERS_DIR, META_DIR, DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(tmp, 'nonexistent'),
    CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result']), _seenStreamTypes: new Set(),
    activeSessions: w.sessions, engine,
    checkClaudeGoalStatus() { }, broadcastToSession, broadcastActiveSessions() { },
    noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h,
    sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null,
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), getTelemetry: () => null,
    getNoConvoRef: () => ({ map: new Map() }), getDeliver: () => ({ stashFor() { } }),
  });
  return { so, tmp, META_DIR };
}
/** A fake pty the real consumer attaches to: `data(line)` feeds it, `exit()` is
 *  the TEARDOWN path (the wrapper dying), which is §9's whole subject. */
const mkPty = () => { const p = { data: null, exit: null, onData(cb) { p.data = cb; }, onExit(cb) { p.exit = cb; } }; return p; };

/** Drive the incident's exact records through the REAL stdout consumer. */
function playWall(w, { banner = FABLE_BANNER, rawType = 'seven_day', member = 'wmax' } = {}) {
  const { so } = mkStdout(w);
  const s = w.sessions.get('sess-6');
  s._normalizer = createMessageManager('claude', 'sess-6');
  const pty = mkPty();
  so.setupSessionPty(s, 'sess-6', pty);
  const RESET = w.resets[member];
  const cap = quiet();
  // ① the STRUCTURED rejection — unscoped weekly, exactly as the CLI emits it
  pty.data(JSON.stringify({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'rejected', rateLimitType: rawType, resetsAt: RESET, resets_at: RESET,
      overageStatus: 'rejected', isUsingOverage: false,
      unifiedWindows: { five_hour: { utilization: 0.03, resetsAt: w.nowSec + 3600 }, seven_day: { utilization: 0.65, resetsAt: RESET } },
    },
  }) + '\n');
  // ② the BANNER — the only record that names the model
  if (banner) pty.data(JSON.stringify({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: banner }] } }) + '\n');
  // ③ the turn ends
  pty.data(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'cid-sess-6' }) + '\n');
  return { lines: cap.done(), reset: RESET };
}

{
  const w = mkWorld({ sameDeadline: true });
  if (!w) { ok('§2 SKIP — pools unsupported on this platform', true); }
  else {
    // Every member shares one weekly deadline here, so the EDF PROACTIVE tier
    // is structurally silent: the ONLY thing that can move either conversation
    // is a wall. That isolates §2 from §1.
    w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    w.mkSession('sess-7', 'wmax', { _spawnModel: 'claude-opus-4-8' });   // the OPUS conversation on the same member
    const { lines, reset } = playWall(w);

    const c = w.readCache(w.id.wmax);
    ok('§2 THE INCIDENT: the PLAN week is untouched — it still reads what the member\'s own panel said',
      Math.abs(c.sevenDay.utilization - 0.65) < 1e-9 && c.sevenDay.status !== 'limited', JSON.stringify(c.sevenDay));
    const fable = (c.scopedWeekly || []).find((b) => /fable/i.test(b.name || ''));
    ok('§2 …and the FABLE cap is the one marked spent, carrying the event\'s own reset',
      !!fable && fable.utilization === 1 && fable.status === 'limited' && fable.resetsAt === reset, JSON.stringify(fable));
    const demotions = lines.filter((l) => /\[wall\] demoted/.test(l));
    ok('§2 …ONE demotion, not two (one rejection may not mark two buckets)',
      demotions.length === 1 && /fable/.test(demotions[0]), demotions.join(' | ').slice(0, 220));
    ok('§2 …and the journal says which rule decided the lane',
      lines.some((l) => /unscoped weekly rejection on .* → the Fable model cap \(the banner names/.test(l)),
      lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 260));
    ok('§2 THE MONEY: the OPUS conversation on the same member is NOT bounced — its view of that member never changed',
      w.linkOf('sess-7') === 'wmax', w.linkOf('sess-7'));
    const arm = w.arms.filter((a) => a.wall).pop();
    ok('§2 auto-resume arms on the SCOPED bucket — the wall it will wait for is the one that exists',
      !!arm && arm.wall.bucket === 'scoped' && arm.wall.scopedName === 'fable', JSON.stringify(arm && arm.wall));

    // the ANCHOR stream is the estimator's ground truth and it must agree
    w.eng.sweepUsageAnchors();
    const aDir = path.join(w.dataDir, 'usage-anchors');
    const rows = (fs.existsSync(aDir) ? fs.readdirSync(aDir) : []).filter((f) => f.endsWith('.ndjson')).flatMap((f) => fs.readFileSync(path.join(aDir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    const wRow = rows.filter((r) => r.accountId === w.id.wmax).pop();
    ok('§2 …and the ANCHOR the sweep writes carries the same two facts (7d alive, Fable spent)',
      !!wRow && Math.abs(wRow.buckets.sevenDay.u - 0.65) < 1e-9 && (wRow.buckets.scopedWeekly || []).some((b) => /fable/i.test(b.name) && b.u === 1),
      JSON.stringify(wRow && wRow.buckets));

    // NEGATIVE CONTROL: the immediate write restored = master's behaviour.
    const mut = mutate('src/server/usage-pool-engine.js', 'lane', [[
      'if (laneIsProvisional(session, ev)) {',
      'if (false && laneIsProvisional(session, ev)) { // PRE-FIX: the unscoped weekly rejection is written the instant it arrives',
    ]]);
    ok('§2 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const w2 = mkWorld({ sameDeadline: true, engineModule: mut.mod });
      w2.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
      w2.mkSession('sess-7', 'wmax', { _spawnModel: 'claude-opus-4-8' });
      const r2 = playWall(w2);
      const c2 = w2.readCache(w2.id.wmax);
      ok('§2 NEGATIVE CONTROL: without the deferral the PLAN week really is marked 100 % spent (the incident)',
        c2.sevenDay.utilization === 1 && c2.sevenDay.status === 'limited', JSON.stringify(c2.sevenDay));
      ok('§2 NEGATIVE CONTROL: …two demotions for one rejection',
        r2.lines.filter((l) => /\[wall\] demoted/.test(l)).length === 2, r2.lines.filter((l) => /\[wall\] demoted/.test(l)).join(' | ').slice(0, 220));
      ok('§2 NEGATIVE CONTROL: …and the OPUS conversation is bounced off a member whose opus quota is fine',
        w2.linkOf('sess-7') !== 'wmax', w2.linkOf('sess-7'));
    }
  }
}

// ── §2b the CONTROLS on the lane rule ──────────────────────────────────────
{
  const w = mkWorld({ sameDeadline: true });
  if (!w) { ok('§2b SKIP — pools unsupported', true); }
  else {
    // ① a PLAN-lane banner still confirms the plan lane
    w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    const r1 = playWall(w, { banner: "You've reached your weekly usage limit." });
    const c = w.readCache(w.id.wmax);
    ok('§2b CONTROL: a "weekly usage limit" banner still marks the PLAN lane spent',
      c.sevenDay.utilization === 1 && c.sevenDay.status === 'limited', JSON.stringify(c.sevenDay));
    ok('§2b CONTROL: …and it says the banner is what decided it',
      r1.lines.some((l) => /→ the plan weekly lane \(the banner says weekly usage limit\)/.test(l)),
      r1.lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 240));

    // ② an already-scoped type is written immediately — no deferral at all
    const w2 = mkWorld({ sameDeadline: true });
    w2.mkSession('sess-6', 'personal', { _spawnModel: 'claude-opus-4-8' });
    const s2 = w2.sessions.get('sess-6');
    const cap2 = quiet();
    w2.eng.recordRateLimitEvent(s2, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'seven_day_opus', resetsAt: w2.resets.personal, resets_at: w2.resets.personal } });
    cap2.done();
    const p2 = w2.readCache(w2.id.personal);
    ok('§2b CONTROL: a `seven_day_opus` rejection is scoped ALREADY — written on arrival, never deferred',
      (p2.scopedWeekly || []).some((b) => /opus/i.test(b.name) && b.utilization === 1) && Math.abs(p2.sevenDay.utilization - 0.34) < 1e-9,
      JSON.stringify(p2.scopedWeekly) + ' 7d=' + p2.sevenDay.utilization);
    ok('§2b CONTROL: …and it left nothing pending', w2.eng.pendingLaneDeferrals(s2).length === 0);

    // ③ NO banner, and the plan week is nearly spent ⇒ the plan lane (today's
    //    behaviour). The evidence rule may only claim the model cap when the
    //    plan week is CLEARLY alive.
    const w3 = mkWorld({ sameDeadline: true });
    w3.writeCache(w3.id.wmax, { ...w3.readCache(w3.id.wmax), sevenDay: { utilization: 0.95, resetsAt: w3.resets.wmax } });
    w3.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    const r3 = playWall(w3, { banner: null });
    const c3 = w3.readCache(w3.id.wmax);
    ok('§2b CONTROL: no banner + a plan week at 95 % ⇒ the PLAN lane is marked, exactly as before',
      c3.sevenDay.utilization === 1 && c3.sevenDay.status === 'limited', JSON.stringify(c3.sevenDay));
    ok('§2b CONTROL: …and the journal says it was the evidence rule, with the numbers it read',
      r3.lines.some((l) => /the plan weekly lane \(no banner: the plan week reads 95% used/.test(l)),
      r3.lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 260));

    // ④ NO banner, plan week clearly alive, this session's family cap spent
    //    ⇒ the model cap. (The shape the CLI produces when the banner is lost.)
    const w4 = mkWorld({ sameDeadline: true });
    w4.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    const r4 = playWall(w4, { banner: null });
    const c4 = w4.readCache(w4.id.wmax);
    ok('§2b CONTROL: no banner, plan week 65 % and this session\'s Fable cap at 100 % ⇒ the model cap, by evidence',
      Math.abs(c4.sevenDay.utilization - 0.65) < 1e-9 && (c4.scopedWeekly || []).some((b) => /fable/i.test(b.name) && b.status === 'limited'),
      JSON.stringify(c4.sevenDay) + ' | ' + JSON.stringify(c4.scopedWeekly));
    ok('§2b CONTROL: …and it SAYS which rule decided, with both numbers',
      r4.lines.some((l) => /→ the Fable model cap \(no banner: the plan week reads 65% used while this session's Fable cap reads 100%/.test(l)),
      r4.lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 260));

    // ⑤ a session whose model is UNKNOWN can never claim the model cap
    const w5 = mkWorld({ sameDeadline: true });
    w5.mkSession('sess-6', 'wmax');
    const r5 = playWall(w5, { banner: null });
    ok('§2b CONTROL: a session that states no model falls to the PLAN lane and says so (never a guess)',
      w5.readCache(w5.id.wmax).sevenDay.utilization === 1 && r5.lines.some((l) => /this session states no model/.test(l)),
      r5.lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 200));

    // ⑥ `seven_day_overage_included` is the account's MODEL-CAP lane
    //    (inc-mubu23bd-5vxi, 2026-09-21: the 2.1.274 binary calls that window
    //    the "overage-included weekly (per-model bucket)", and every live buffer
    //    on this instance reads it about twice the plan week). 2.361.2 had
    //    mapped it to the plan lane and B-ccaa then deferred it; now it is
    //    neither — the naming ladder finds the existing Fable cap with the
    //    same reset, the rejection marks THAT cap on arrival, and the plan week
    //    is never touched, with or without a banner.
    const w6 = mkWorld({ sameDeadline: true });
    w6.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    w6.writeCache(w6.id.wmax, { ...w6.readCache(w6.id.wmax), scopedWeekly: [{ name: 'Fable', utilization: 0.6, resetsAt: w6.resets.wmax }] }); // a cap the evidence rule could not pick — the ladder names it by its RESET
    const s6 = w6.sessions.get('sess-6');
    const cap6 = quiet();
    w6.eng.recordRateLimitEvent(s6, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'seven_day_overage_included', resetsAt: w6.resets.wmax, resets_at: w6.resets.wmax } });
    const pend6 = w6.eng.pendingLaneDeferrals(s6).length;
    const mid6 = w6.readCache(w6.id.wmax);
    w6.eng.noteTurnEnd(s6);
    const l6 = cap6.done();
    ok('§2b CONTROL: `seven_day_overage_included` is the MODEL-CAP lane — nothing is deferred, the FABLE cap is marked on arrival (the existing cap with this reset names it) and the plan week is untouched',
      pend6 === 0 && Math.abs(mid6.sevenDay.utilization - 0.65) < 1e-9 && (mid6.scopedWeekly || []).find((b) => /fable/i.test(b.name))?.utilization === 1,
      JSON.stringify({ pend6, sevenDay: mid6.sevenDay, scoped: mid6.scopedWeekly }));
    ok('§2b CONTROL: …and with no banner the plan week STILL reads what the panel said by turn end (never the 2.361.2 plan-lane mark), the journal naming the rung that decided',
      Math.abs(w6.readCache(w6.id.wmax).sevenDay.utilization - 0.65) < 1e-9 && l6.some((l) => /model-cap rejection on .* → the Fable model cap \(the existing model limit Fable shares this window's reset\)/.test(l)),
      JSON.stringify(w6.readCache(w6.id.wmax).sevenDay) + ' | ' + l6.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 300));

    // ⑦ a CODEX session is never deferred — the deferral is a fact about
    //    claude's own type vocabulary, and codex's producer is a different one.
    const w7 = mkWorld({ sameDeadline: true });
    const s7 = w7.mkSession('sess-6', 'wmax', { backend: 'codex' });
    ok('§2b CONTROL: the deferral is claude-only (codex names its own limits)',
      w7.eng.laneIsProvisional(s7, { status: 'rejected', kind: 'sevenDay', rawType: 'seven_day' }) === false);
    ok('§2b CONTROL: …and an ALLOWED weekly reading is never deferred either (only a rejection has a lane to decide)',
      w7.eng.laneIsProvisional(w7.sessions.get('sess-6'), { status: 'allowed', kind: 'sevenDay', rawType: 'seven_day' }) === false);
  }
}

// ═══ §3 A HEALTHY CURRENT MEMBER IS NEVER "NO MEMBER CAN SERVE IT" ══════════
console.log('— §3 a healthy current member is never "no member can serve it"');
{
  const w = mkWorld();
  if (!w) { ok('§3 SKIP — pools unsupported', true); }
  else {
    // The pool-level pass over the incident's own caches: the DEFAULT target is
    // Member P (healthy on every bucket) and every other member's Fable cap
    // is spent, which is exactly the state that printed the notice three times.
    const cap = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P);
    const lines = cap.done();
    ok('§3 THE INCIDENT: no "no member can serve it" notice while the current member is healthy',
      !w.notices.some((n) => /no member can serve it/.test(n)), JSON.stringify(w.notices).slice(0, 300));
    ok('§3 …and nothing told auto-resume there was no usable member left',
      !w.arms.some((a) => a.noPoolTarget), JSON.stringify(w.arms).slice(0, 200));
    ok('§3 …and the pool did not move anything either (there was nowhere better, which is not a wall)',
      !lines.some((l) => /per-session switch/.test(l)), lines.filter((l) => /\[pool\]/.test(l)).join(' | ').slice(0, 200));

    // NEGATIVE CONTROL: master's branch, on the same world. decidePoolSwitch is
    // PURE, so the control is driven directly over the incident's caches — the
    // engine only renders what it returns.
    // BOTH halves of the pre-fix sentence, so the control reproduces the string
    // the owner actually read: master claimed the wall on a proactive scan AND
    // printed the current member's own healthy buckets under "out of quota".
    const mut = mutate('src/account-pool-auto.js', 'nobetter', [
      [
        "    if (!exhausted) return none('no-better', { fromRemaining: cur.known ? cur.remaining : null, noBetter: true, excluded: excludedN || undefined, loginBlocked: loginBlocked.length ? loginBlocked : undefined, ...barDetail(), ...bucketDetail(curBr) });",
        '    // PRE-FIX: a proactive scan with a healthy current member claims the wall anyway',
      ],
      ...MASTER_NOTICE_PATCHES,
    ]);
    ok('§3 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const members = MEMBERS.map((m) => ({ id: w.id[m.tag], name: m.name }));
      const projected = (id) => projectCacheForFamily(w.readCache(id), 'fable');
      const args = { currentId: w.id.personal, members, readCache: projected, nowSec: w.nowSec, proactive: true, hot: true, explain: true };
      const pre = mut.mod.decidePoolSwitch(args);
      ok('§3 NEGATIVE CONTROL: master claims `no-members` about a pool whose current member is healthy',
        pre.to === null && pre.reason === 'no-members', JSON.stringify(pre).slice(0, 200));
      const sentence = mut.mod.poolBlockedNotice(pre, { poolName: '全部', currentName: 'Member P' });
      // The SHAPE the owner read, with this fixture's numbers rather than the
      // incident's (its notice was captured 20 min earlier, at 5h 100% / 7d 69%
      // / Fable 45%; these caches are the 04:31-04:55Z on-demand rows).
      ok('§3 NEGATIVE CONTROL: …and the SENTENCE is the one the owner read — the CURRENT member\'s own healthy numbers, under "out of quota"',
        /no member can serve it — out of quota \(still available: /.test(sentence) && /Fable 40%/.test(sentence), sentence);
      ok('§3 …while the fixed sentence never contrasts "out of quota" with a list of what is available',
        !/out of quota \(still available/.test(poolBlockedNotice(pre, { poolName: '全部', currentName: 'Member P' })),
        poolBlockedNotice(pre, { poolName: '全部', currentName: 'Member P' }));
      const now = decidePoolSwitch(args);
      ok('§3 …while the fixed rule answers `no-better`, which no surface renders',
        now.to === null && now.reason === 'no-better' && now.noBetter === true, JSON.stringify(now).slice(0, 200));
    }
  }
}

// ═══ §4 A WALL MARK NEVER OUTRANKS A FRESH ENUMERATING READING ══════════════
// The data question this incident owes: the three false plan-7d marks were
// written with a `resetsAt` 12-60 h out. Do they HEAL, or does the store carry
// them until that instant?
//
// MEASURED ON THIS INSTANCE'S OWN STORE (read-only, 2026-09-13 05:50Z): all
// three healed on their own, through the auto-cli loop's ordinary panel read —
//   Member F            1.00 @ 04:58:33 (wall) → 0.84 @ 05:35:58 (on-demand)
//   Member W          1.00 @ 04:59:48 (wall) → 0.66 @ 05:39:58 (on-demand)
//   Member Q  1.00 @ 05:00:42 (wall) → 0.70 @ 05:41:58 (on-demand)
// i.e. 37 / 40 / 41 minutes of false exhaustion each, not 12-60 h, and NO
// migration is owed. The reason is `carryUnmeasuredLimits`: it hands back the
// previous limit only when the CLAIM is unchanged, and a re-measured 7-day
// window is a different claim, so the merge takes the new one.
//
// That is a PROPERTY of the write path, so it is pinned here rather than left
// as a note: the wall is written by the REAL engine (the pre-fix copy, because
// only it produces the false mark) and cleared by the REAL refreshViaCliPanel
// with a fake `claude` on CLAUDE_CMD — real execFile, real parse, real write.
console.log('— §4 the wall mark heals on the next enumerating reading');
{
  const usageMod = require(path.join(REPO, 'src/usage-routes.js'));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const at = (ms) => { const d = new Date(Date.now() + ms); return MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + (d.getUTCHours() % 12 || 12) + (d.getUTCHours() < 12 ? 'am' : 'pm') + ' (UTC)'; };
  // Member W's own panel, as its 05:39:58Z read printed it.
  const PANEL = 'Current session: 3% used · resets ' + at(2 * 3600e3) + '\n'
    + 'Current week (all models): 66% used · resets ' + at(44 * 3600e3) + '\n'
    + 'Current week (Fable): 100% used · resets ' + at(44 * 3600e3) + '\n';

  // the FALSE wall, written by master's own code over a healthy on-demand file
  const mut = mutate('src/server/usage-pool-engine.js', 'lane4', [[
    'if (laneIsProvisional(session, ev)) {',
    'if (false && laneIsProvisional(session, ev)) { // PRE-FIX: produce the false plan-lane mark this section heals',
  ]]);
  ok('§4 setup: the pre-fix engine copy applied its replacement', mut.hit === true, mut.why || '');
  const w = mut.hit ? mkWorld({ sameDeadline: true, engineModule: mut.mod }) : null;
  if (!w) { ok('§4 SKIP — pools unsupported / control unavailable', mut.hit !== true ? false : true); }
  else {
    w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    playWall(w);
    const before = w.readCache(w.id.wmax);
    ok('§4 setup: the incident\'s false plan-lane mark is on disk (source `wall`, 100 % spent)',
      before.sevenDay.utilization === 1 && before.source === 'wall', JSON.stringify(before.sevenDay) + ' src=' + before.source);
    const planBefore = (before.limits || []).find((l) => l.limitId === 'plan');
    ok('§4 setup: …and the TYPED plan limit carries it too (the half every reader migrated to)',
      !!planBefore && planBefore.windows.some((x) => x.kind === '7d' && x.usedPct === 100), JSON.stringify(planBefore && planBefore.windows));

    // the ordinary panel read that follows, through the REAL refresher
    const bin = path.join(w.root, 'fake-claude');
    fs.writeFileSync(bin, '#!/bin/sh\ncat <<\'EOF\'\n' + PANEL + 'EOF\n', { mode: 0o755 });
    const u = usageMod.setupUsage({
      app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} },
      accounts: w.am, hosts: null, usageHistory: null, activeSessions: new Map(),
      serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
      USAGE_CACHE_FILE: path.join(w.dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: w.cacheDir,
      CODEX_SESSIONS_DIR: path.join(w.root, 'codex-sessions'), META_DIR: path.join(w.dataDir, 'session-meta'),
      AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(w.dataDir, 'session-buffers'),
      probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: bin,
    });
    const capP = quiet();
    const done = await u.refreshViaCliPanel(w.id.wmax);
    capP.done();
    ok('§4 the panel read landed', done === true, String(done));
    const after = w.readCache(w.id.wmax);
    ok('§4 THE HEAL: one ordinary enumerating reading clears the false plan-lane mark (no migration is owed)',
      Math.abs(after.sevenDay.utilization - 0.66) < 1e-9 && after.sevenDay.status !== 'limited', JSON.stringify(after.sevenDay));
    const planAfter = (after.limits || []).find((l) => l.limitId === 'plan');
    ok('§4 …in the TYPED half too, with the panel\'s own provenance',
      !!planAfter && planAfter.windows.some((x) => x.kind === '7d' && x.usedPct === 66) && planAfter.source === 'on-demand',
      JSON.stringify(planAfter && { src: planAfter.source, w: planAfter.windows.map((x) => x.kind + ':' + x.usedPct) }));
    ok('§4 …and the Fable cap the panel still reports at 100 % is NOT cleared by the same write',
      (after.scopedWeekly || []).some((b) => /fable/i.test(b.name) && b.utilization === 1), JSON.stringify(after.scopedWeekly));
    // …and the pool agrees: the member is placeable again for an OPUS
    // conversation, which is the money this heal gives back.
    const members = MEMBERS.map((m) => ({ id: w.id[m.tag], name: m.name }));
    const opusView = (id) => projectCacheForFamily(w.readCache(id), 'opus');
    const stay = decidePoolSwitch({ currentId: w.id.wmax, members, readCache: opusView, nowSec: w.nowSec, proactive: true, hot: true, explain: true });
    ok('§4 …so an OPUS conversation sitting on it is no longer evicted (the bounce this incident produced)',
      stay && stay.to === null, JSON.stringify(stay).slice(0, 180));
  }
}


// ═══ §5 (r2) THE PROJECTION FAMILY IS NOT THE STATED MODEL ══════════════════
// The round-1 verifier's finding, reproduced end to end before it was fixed.
//
// §1 taught `sessionModelFor` to answer the REQUEST model while a classifier
// reroute stands. Handing THAT to `projectCacheForFamily` trades the incident's
// blind spot for its MIRROR: the projection then drops the scoped cap of the
// model that is actually ANSWERING and being billed (this instance's own anchor
// for the incident reads `costSince.byFamily {opus: 21.3957, fable: 0}` over 24
// requests), so the pool proactively moves the conversation ONTO a member whose
// cap for that model is 100 % spent — and `quotaVerdictFor` calls that member
// usable, which is what AUTHORISES the billed continue. Master does neither.
//
// A STANDING REROUTE MAKES THE FAMILY AMBIGUOUS: both caps can refuse the turn
// (the incident proves the request side — its rejection was "You've reached
// your Fable limit" — and the ledger proves the substituted side is what gets
// billed). So the answer is round 1's own doctrine, applied where it was not:
// UNKNOWN STAYS null, null means NO projection, every bucket counts.
//
// REACHABILITY (measured on this instance, 2026-09-13, read-only): an Opus
// scoped bucket is producible by BOTH shipped producers — a `seven_day_opus`
// rejection (that type IS in §2's measured vocabulary) and a banner
// "You've reached your Opus limit." through `markLimitBanner`. No claude cache
// file here carries one TODAY, but nine of them carry `Fable` and one carries a
// SECOND model cap (`Nimbus Quill`), so the multi-cap shape is the vendor's,
// not a hypothetical.
console.log('— §5 (r2) the projection family is not the stated model');
// current healthy on everything; the EDF-preferred member has Fable left but
// its OPUS cap is spent, and its weekly deadline is sooner so EDF wants it.
const R2_MEMBERS = [
  { tag: 'personal', name: 'Member P', u5: 0.20, u7: 0.20, fable: 0.20, opus: 0.20, hoursOut: 100 },
  { tag: 'fish', name: 'Member F', u5: 0.00, u7: 0.20, fable: 0.10, opus: 1.00, hoursOut: 20 },
];
/** The two PROJECTION sites reverted to round 1 — the control for this fix. */
const R1_PROJECTION_PATCHES = [
  [
    '      const fam = projectionFamilyFor(s2, sessionModelFor(s2));',
    '      const fam = familyOfModel(sessionModelFor(s2)); // PRE-FIX (r1): the stated family goes straight to the projection',
  ],
  [
    '  const fam = projectionFamilyFor(session, model);',
    '  const fam = familyOfModel(model); // PRE-FIX (r1)',
  ],
];
/** …and `sessionModelFor`'s ladder reverted too = MASTER. */
const MASTER_SERVED_PATCH = [
  'const served = servedDefinesModel(s) ? { m: s._servedModel, at: s._servedModelAt || 0 } : null;',
  'const served = s._servedModel ? { m: s._servedModel, at: s._servedModelAt || 0 } : null; // PRE-FIX: a fallback-served model defines the session',
];
{
  /** A fable-requesting session with a STANDING reroute to opus, 18 records in. */
  const rerouted = (w) => {
    const s = w.mkSession('sess-6', 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
    w.eng.noteModelFallback(s, 'claude-fable-5-1', 'claude-opus-4-8');
    for (let i = 0; i < 18; i++) w.eng.noteServedModel(s, 'claude-opus-4-8');
    return s;
  };
  const w = mkWorld({ roster: R2_MEMBERS });
  if (!w) { ok('§5 SKIP — pools unsupported on this platform', true); }
  else {
    const s = rerouted(w);
    ok('§5 setup: §1 is intact — the session still STATES the model it requests',
      w.eng.sessionModelFor(s) === 'claude-fable-5-1[1m]', String(w.eng.sessionModelFor(s)));
    ok('§5 …while the PROJECTION family is null, because two caps can refuse this turn',
      w.eng.projectionFamilyFor(s, w.eng.sessionModelFor(s)) === null,
      String(w.eng.projectionFamilyFor(s, w.eng.sessionModelFor(s))));

    const cap = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P);
    const lines = cap.done();
    ok('§5 THE MOVE DOES NOT HAPPEN: the pool cannot place it on a member whose Opus cap is spent',
      w.linkOf('sess-6') === 'personal',
      w.linkOf('sess-6') + ' | ' + lines.filter((l) => /per-session switch/.test(l)).join(' | ').slice(0, 200));
    ok('§5 …and nothing was announced', w.notices.length === 0, JSON.stringify(w.notices).slice(0, 200));

    // THE MONEY SITE: the verdict that authorises a continue. A POOLED scope
    // answers "is ANY member usable", so this leg needs a pool where the Opus
    // cap is the only thing in the way — one member, Fable 10 % / Opus 100 %.
    const wv = mkWorld({ roster: [{ tag: 'personal', name: 'Member P', u5: 0.20, u7: 0.20, fable: 0.10, opus: 1.00, hoursOut: 20 }] });
    const sv = rerouted(wv);
    const capV = quiet();
    const v = wv.eng.quotaVerdictFor(wv.P, { model: wv.eng.sessionModelFor(sv), session: sv });
    capV.done();
    ok('§5 THE VERDICT refuses too — a spent Opus cap blocks a session opus is answering',
      v.usable === false && /Opus 0%/.test(String(v.reason)), JSON.stringify({ usable: v.usable, reason: v.reason }).slice(0, 200));

    // NEGATIVE CONTROL — round 1's two projection sites restored, nothing else.
    const mut = mutate('src/server/usage-pool-engine.js', 'proj', R1_PROJECTION_PATCHES);
    ok('§5 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const w2 = mkWorld({ roster: R2_MEMBERS, engineModule: mut.mod });
      rerouted(w2);
      const cap2 = quiet();
      w2.eng.maybePoolAutoSwitchForPool(w2.P);
      const l2 = cap2.done();
      ok('§5 NEGATIVE CONTROL: round 1 really does move it onto the Opus-dead member',
        w2.linkOf('sess-6') === 'fish',
        w2.linkOf('sess-6') + ' | ' + l2.filter((l) => /per-session switch/.test(l)).join(' | ').slice(0, 200));
      ok('§5 NEGATIVE CONTROL: …and tells the owner it moved because of its FABLE quota',
        w2.notices.some((n) => /fable quota/.test(n)), JSON.stringify(w2.notices).slice(0, 220));
      const w2v = mkWorld({ roster: [{ tag: 'personal', name: 'Member P', u5: 0.20, u7: 0.20, fable: 0.10, opus: 1.00, hoursOut: 20 }], engineModule: mut.mod });
      const s2v = rerouted(w2v);
      const cap2v = quiet();
      const v2 = w2v.eng.quotaVerdictFor(w2v.P, { model: w2v.eng.sessionModelFor(s2v), session: s2v });
      cap2v.done();
      ok('§5 NEGATIVE CONTROL: …and round 1 calls that member USABLE, which is what authorises a billed continue',
        v2.usable === true, JSON.stringify({ usable: v2.usable, reason: v2.reason }).slice(0, 200));
    }

    // THIS IS A DISTINCT DEFECT FROM §1, and the proof is that §1's OWN control
    // does not reproduce it: with only `sessionModelFor` reverted, master's
    // ladder names the fallback TARGET as the session's model, so the stated
    // family and the substituted family AGREE and the projection is kept.
    const mutS = mutate('src/server/usage-pool-engine.js', 'servedonly', [MASTER_SERVED_PATCH]);
    ok('§5 the §1 control alone applied', mutS.hit === true, mutS.why || '');
    if (mutS.hit) {
      const w3 = mkWorld({ roster: R2_MEMBERS, engineModule: mutS.mod });
      rerouted(w3);
      const cap3 = quiet();
      w3.eng.maybePoolAutoSwitchForPool(w3.P);
      cap3.done();
      ok('§5 …reverting ONLY §1 does not reproduce §5 (the two are different defects, and §1\'s control must be MASTER)',
        w3.linkOf('sess-6') === 'personal', w3.linkOf('sess-6'));
    }
  }
}

// ── §5b the rule's own truth table + the callers it must not disturb ────────
{
  // the rule ships with the engine's other model facts, so the truth table is
  // driven off a REAL engine rather than a copy of the expression
  const wf = mkWorld({ roster: R2_MEMBERS });
  const F = wf ? wf.eng.projectionFamilyFor : null;
  const noFb = {};
  ok('§5b the rule is reachable from the engine', typeof F === 'function', String(typeof F));
  if (typeof F !== 'function') { ok('§5b SKIP — pools unsupported', true); } else {
  ok('§5b no session at all ⇒ exactly `familyOfModel` (every session-less quotaVerdictFor caller is byte-identical)',
    F(null, 'claude-fable-5-1[1m]') === 'fable' && F(null, 'claude-opus-4-8') === 'opus'
    && F(null, 'weird-model') === null && F(null, null) === null);
  ok('§5b a session with NO reroute ⇒ the stated family, unchanged',
    F(noFb, 'claude-fable-5-1[1m]') === 'fable' && F({ _servedViaFallback: null }, 'claude-opus-4-8') === 'opus');
  ok('§5b a reroute to ANOTHER known family ⇒ null (both caps bind)',
    F({ _servedViaFallback: { to: 'claude-opus-4-8' } }, 'claude-fable-5-1[1m]') === null);
  ok('§5b a reroute WITHIN the same family keeps its projection (fable-5-1 → fable-4 is one cap)',
    F({ _servedViaFallback: { to: 'claude-fable-4' } }, 'claude-fable-5-1[1m]') === 'fable');
  ok('§5b a reroute to a family we cannot NAME ⇒ null — fail closed, like every other unknown here',
    F({ _servedViaFallback: { to: 'some-internal-model' } }, 'claude-fable-5-1[1m]') === null);
  ok('§5b a stated model we cannot name is null whatever the reroute says (no projection either way)',
    F({ _servedViaFallback: { to: 'claude-opus-4-8' } }, 'mystery') === null && F(noFb, 'mystery') === null);
  // …and the OTHER readers of sessionModelFor keep the REQUEST model: the lane
  // rule is about which cap a REJECTION was about, and the CLI rejects the
  // REQUEST (the incident's banner named Fable while opus was answering).
  const engSrc = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  ok('§5b WIRING: both PROJECTION sites ask the one rule',
    /const fam = projectionFamilyFor\(session, model\);/.test(engSrc)
    && /const fam = projectionFamilyFor\(s2, sessionModelFor\(s2\)\);/.test(engSrc));
  // A DERIVED CENSUS, not a spelling ban: every `projectCacheForFamily` call
  // in the engine must take a family the ONE rule produced — except the SPAWN
  // chooser, which is handed an explicit model and has no session to ask.
  {
    // A census reads CODE: this file's own prose names the function, so whole-
    // line and block comments are blanked before anything is counted.
    const code = engSrc.replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const sites = [];
    for (let i = code.indexOf('projectCacheForFamily('); i !== -1; i = code.indexOf('projectCacheForFamily(', i + 1)) {
      const before = code.slice(Math.max(0, i - 700), i);
      sites.push({
        line: code.slice(0, i).split('\n').length,
        viaRule: /projectionFamilyFor\(/.test(before),
        spawnChooser: /function poolChooserForModel\(/.test(before),
      });
    }
    const unruled = sites.filter((x) => !x.viaRule && !x.spawnChooser);
    console.log('    [census] projectCacheForFamily sites: ' + JSON.stringify(sites));
    ok('§5b CENSUS: every projection site asks the rule (the spawn chooser is the ONE allowed exception — it is handed a model and has no session)',
      sites.length === 3 && unruled.length === 0 && sites.filter((x) => x.spawnChooser).length === 1,
      JSON.stringify(sites));
  }
  ok('§5b …while `laneByEvidence` deliberately still asks the REQUEST-model family',
    /function laneByEvidence[\s\S]{0,200}const fam = familyOfModel\(sessionModelFor\(session\)\);/.test(engSrc));
  }
}

// ═══ §6 (r2) A BLOCKED POOL NAMES THE BUCKET THAT BLOCKED IT ════════════════
// The round-1 verifier's second finding, reproduced first.
//
// A HOT pool's `exhausted` is the SOFT (hot-raised) threshold while
// `deadBuckets` was filtered on the HARD one, so a pool that really IS blocked —
// current member in the 3-5 % weekly band, every other member quota-dead —
// printed "no member can serve it — out of quota." with NO number in it at all.
// That band is the whole reason a hot pool exists (提前切), and the standing law
// is that every blocked outcome must SPEAK with named buckets.
console.log('— §6 (r2) a blocked pool names the bucket that blocked it');
{
  const nowSec = Math.floor(Date.now() / 1000);
  const R = nowSec + 20 * 3600;
  const bk = (u5, u7, fable) => ({
    fetchedAt: Date.now(),
    fiveHour: { utilization: u5, resetsAt: nowSec + 3600 },
    sevenDay: { utilization: u7, resetsAt: R },
    scopedWeekly: [{ name: 'Fable', utilization: fable, resetsAt: R }],
  });
  // 7d 96 % used = 4 % left: >= THRESH.weekly.hard (3) and < .hot (5).
  const caches = { cur: bk(0.10, 0.96, 0.20), b: bk(0, 1, 1), c: bk(0, 1, 1) };
  const members = [{ id: 'cur', name: 'Cur' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const args = { currentId: 'cur', members, readCache: (id) => caches[id] || null, nowSec, proactive: true, hot: true, explain: true };
  const d = decidePoolSwitch(args);
  ok('§6 the pool really is blocked (this is not the §3 shape — the current member IS exhausted)',
    d.to === null && d.reason === 'no-members', JSON.stringify({ to: d.to, reason: d.reason }));
  ok('§6 nothing is under the HARD floor, so the two-band split had nothing to say',
    (d.deadBuckets || []).length === 0, JSON.stringify(d.deadBuckets));
  ok('§6 the bucket that made it exhausted is named in its own band',
    (d.lowBuckets || []).join() === '7d 4%', JSON.stringify(d.lowBuckets));
  ok('§6 …and it is NOT also listed as still available (that contrast is what §3 killed)',
    !(d.liveBuckets || []).some((x) => /^7d /.test(x)) && (d.liveBuckets || []).length === 2, JSON.stringify(d.liveBuckets));
  const sentence = poolBlockedNotice(d, { poolName: 'P', currentName: 'Cur' });
  ok('§6 THE SENTENCE names the binding number and contrasts it with real headroom',
    /no member can serve it — nearly spent: 7d 4% \(still available: 5h 90%, Fable 80%\)\./.test(sentence), sentence);

  // NEGATIVE CONTROL: ROUND 1 — the two-band split with round 1's own `rest`.
  // That is the code this finding is about; master is a SECOND control below,
  // and it is wrong a different way (the §3 contradiction).
  const mutR1 = mutate('src/account-pool-auto.js', 'bandsr1', [
    MASTER_NOTICE_PATCHES[0], MASTER_NOTICE_PATCHES[1],
    [
      "  const rest = (dead || low) && live ? ` (still available: ${live})` : '';",
      "  const rest = dead && live ? ` (still available: ${live})` : ''; // ROUND 1: only a HARD-dead bucket earned the contrast",
    ],
  ]);
  ok('§6 NEGATIVE CONTROL (round 1): the patch hit the product source', mutR1.hit === true, mutR1.why || '');
  if (mutR1.hit) {
    const pre1 = mutR1.mod.decidePoolSwitch(args);
    const s1 = mutR1.mod.poolBlockedNotice(pre1, { poolName: 'P', currentName: 'Cur' });
    ok('§6 NEGATIVE CONTROL (round 1): a genuinely blocked pool with NO number in the sentence at all',
      s1 === 'Pool "P": no member can serve it — out of quota. Conversations on it will hit a limit until a window resets, you add a member, or you move them off the pool.', s1);
  }
  // NEGATIVE CONTROL: master — it names the binding bucket, but under
  // "still available" while the sentence says "out of quota".
  const mut = mutate('src/account-pool-auto.js', 'bands', MASTER_NOTICE_PATCHES);
  ok('§6 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
  if (mut.hit) {
    const pre = mut.mod.decidePoolSwitch(args);
    const preSentence = mut.mod.poolBlockedNotice(pre, { poolName: 'P', currentName: 'Cur' });
    ok('§6 NEGATIVE CONTROL: master calls the blocking bucket "still available" (the §3 contradiction, on this shape)',
      /out of quota \(still available: 5h 90%, 7d 4%, Fable 80%\)/.test(preSentence), preSentence);

    // BYTE-IDENTITY, MEASURED — not read off the diff. Every shape where no
    // bucket sits in the hot band must produce master's sentence verbatim; the
    // ONLY rows that may differ are the ones this fix exists for.
    const spent = (u5, u7, fable) => bk(u5, u7, fable);
    const rows = [
      { why: 'COLD pool, hard-dead 5h + healthy weeklies', differs: false,
        a: { currentId: 'cur', members, readCache: (id) => ({ cur: spent(0.99, 0.10, 0.10), b: spent(0.99, 0.10, 0.10), c: spent(0.99, 0.10, 0.10) })[id] || null, nowSec, explain: true } },
      { why: 'COLD pool, spent Fable cap with live siblings', differs: false,
        a: { currentId: 'cur', members, readCache: (id) => ({ cur: spent(0, 0.40, 1), b: spent(0, 0.40, 1), c: spent(0, 0.40, 1) })[id] || null, nowSec, explain: true } },
      { why: 'HOT pool, hard-dead Fable, everything else well clear of the hot bar', differs: false,
        a: { currentId: 'cur', members, readCache: (id) => ({ cur: spent(0, 0.30, 1), b: spent(0, 0.30, 1), c: spent(0, 0.30, 1) })[id] || null, nowSec, proactive: true, hot: true, explain: true } },
      { why: 'HOT pool, current member in the 3-5 % weekly band (THE FIX)', differs: true, a: args },
      { why: 'HOT pool, current member in the 5-10 % FIVE-HOUR band', differs: true,
        a: { currentId: 'cur', members, readCache: (id) => ({ cur: spent(0.93, 0.20, 0.20), b: spent(0, 1, 1), c: spent(0, 1, 1) })[id] || null, nowSec, proactive: true, hot: true, explain: true } },
      { why: 'HOT pool, hard-dead weekly AND a 5h in the hot band (both bands named)', differs: true,
        a: { currentId: 'cur', members, readCache: (id) => ({ cur: spent(0.93, 0.99, 0.20), b: spent(0, 1, 1), c: spent(0, 1, 1) })[id] || null, nowSec, proactive: true, hot: true, explain: true } },
    ];
    let same = 0, diff = 0, wrong = [];
    for (const r of rows) {
      const now = poolBlockedNotice(decidePoolSwitch(r.a), { poolName: 'P', currentName: 'Cur' });
      const was = mut.mod.poolBlockedNotice(mut.mod.decidePoolSwitch(r.a), { poolName: 'P', currentName: 'Cur' });
      const isSame = now === was;
      if (isSame) same++; else diff++;
      if (isSame === r.differs) wrong.push(r.why + ' → ' + (isSame ? 'IDENTICAL' : now));
    }
    ok('§6 BYTE-IDENTITY over a shape matrix: only the hot-band rows changed (' + same + ' identical, ' + diff + ' changed)',
      wrong.length === 0, wrong.join(' | ').slice(0, 400));
    const both = poolBlockedNotice(decidePoolSwitch(rows[5].a), { poolName: 'P', currentName: 'Cur' });
    ok('§6 …and when both bands have entries the sentence carries both',
      /spent: 7d 1%; nearly spent: 5h 7%/.test(both), both);
  }

  // CONTROLS.
  // A COLD decision only REACHES bucketDetail when the current member is
  // HARD-dead (4 % weekly left is simply 'healthy' at hard = 3), so the control
  // is a hard-dead weekly PLUS a 5h sitting in what WOULD be the hot band:
  // on a cold pool that 5h is ordinary headroom and must stay in `liveBuckets`.
  const coldCaches = { cur: bk(0.93, 0.99, 0.20), b: bk(0, 1, 1), c: bk(0, 1, 1) };
  const cold = decidePoolSwitch({ currentId: 'cur', members, readCache: (id) => coldCaches[id] || null, nowSec, explain: true });
  ok('§6 CONTROL: a COLD decision has no low band at all (soft === hard ⇒ byte-identical by construction)',
    cold.reason === 'no-members' && (cold.lowBuckets || []).length === 0 && (cold.liveBuckets || []).includes('5h 7%'),
    JSON.stringify({ reason: cold.reason, low: cold.lowBuckets, live: cold.liveBuckets }));
  ok('§6 CONTROL: …and its sentence is master\'s, verbatim',
    poolBlockedNotice(cold, { poolName: 'P', currentName: 'Cur' })
      === 'Pool "P": no member can serve it — spent: 7d 1% (still available: 5h 7%, Fable 80%). Conversations on it will hit a limit until a window resets, you add a member, or you move them off the pool.',
    poolBlockedNotice(cold, { poolName: 'P', currentName: 'Cur' }));
  const legacy = { reason: 'no-members', to: null, deadBuckets: [], liveBuckets: ['5h 100%', '7d 69%', 'Fable 45%'] };
  ok('§6 CONTROL: a decision object with no `lowBuckets` (the §3 shape) still refuses to contrast "out of quota"',
    poolBlockedNotice(legacy, { poolName: 'P', currentName: 'A' }) === 'Pool "P": no member can serve it — out of quota. Conversations on it will hit a limit until a window resets, you add a member, or you move them off the pool.',
    poolBlockedNotice(legacy, { poolName: 'P', currentName: 'A' }));
  ok('§6 CONTROL: §3 is intact — a HEALTHY current member still answers `no-better`, which renders nothing',
    decidePoolSwitch({ ...args, readCache: (id) => ({ cur: bk(0, 0.30, 0.30), b: bk(0, 1, 1), c: bk(0, 1, 1) })[id] || null }).reason === 'no-better');
}

// ═══ §7 (r3) THE MODEL LOCK IS THE REQUEST MODEL ════════════════════════════
// The owner's correction, 2026-09-13. The incident's conversation was LOCKED —
// its FROZEN meta (data/incidents/inc-mtzcj5sl-lzmw, cw-6-1788859480777.json)
// reads `modelLocked: true, lockedModel: "fable[1m]", pickedModel: "fable[1m]",
// spawnModel: "fable[1m]"` — and `maybeRepinLockedModel` re-sends `/model` at
// every turn end where the served model drifted, i.e. the server KNEW the
// request model the whole time and was actively re-asserting it. Yet "newest
// wins" let a fallback-served `claude-opus-4-8` record outrank both the lock
// and the pick.
//
// Reproduced on the real engine + real pool before anything changed: one
// main-thread opus record after a restart ⇒ `sessionModelFor` 'claude-opus-4-8',
// `projectionFamilyFor` 'opus', the conversation MOVED personal → fish (Fable
// 100 % spent), the notice said "its opus quota was at 66%", and
// `quotaVerdictFor` — the site that authorises an unattended continue —
// answered `usable: true` about that member.
console.log('— §7 (r3) the model lock is the request model');
const FROZEN_META = { // verbatim fields from the incident's own frozen meta
  spawnModel: 'fable[1m]', pickedModel: 'fable[1m]', pickedModelAt: 1788860042726,
  modelLocked: true, lockedModel: 'fable[1m]',
};
/** r2 = BOTH halves of the lock fix reverted. A negative control must be the
 *  thing it names (§5's own rule): "r2" is the ladder rung AND the projection's
 *  lock-drift rung, so the control reverts both and a separate leg below proves
 *  they are different defects. */
const R2_LOCK_PATCHES = [
  [
    // r3-r2 belted this rung (§12); "r2" is still the WHOLE rung being gone.
    '  if (s && s._modelLocked && s._lockedModel\n'
    + '    && !(s._servedViaFallback?.to && modelsMatch(s._lockedModel, s._servedViaFallback.to))) return s._lockedModel;\n',
    '  // PRE-FIX (r2): a served model outranks the lock, however new\n',
  ],
  [
    '  if (session._modelLocked && session._lockedModel && session._servedModel\n'
    + '    && familyOfModel(session._servedModel) !== fam) return null;\n',
    '  // PRE-FIX (r2): a drifted lock is not read as ambiguity\n',
  ],
];
/** …and JUST the projection rung, for the "different defects" proof. */
const R2_PROJECTION_LOCK_PATCH = R2_LOCK_PATCHES[1];
/** r3-r2 §12's BELT alone: the rung is back, but it no longer refuses a lock
 *  target that IS the standing reroute. Declared here beside the rung's other
 *  patch tables because §11d needs it too (both layers reverted = the incident). */
const R3R2_BELT_PATCH = [
  '  if (s && s._modelLocked && s._lockedModel\n'
  + '    && !(s._servedViaFallback?.to && modelsMatch(s._lockedModel, s._servedViaFallback.to))) return s._lockedModel;',
  '  if (s && s._modelLocked && s._lockedModel) return s._lockedModel; // PRE-FIX (r3): any lock target speaks',
];
{
  const w = mkWorld();
  if (!w) { ok('§7 SKIP — pools unsupported on this platform', true); }
  else {
    // THE RESTORED CONVERSATION: boot-restore hydrates the lock from meta
    // (`_modelLocked`/`_lockedModel` are already persisted), so this session is
    // right BEFORE any stamp, pick or served model has been re-learned.
    const s = w.mkSession('sess-6', 'personal', {
      _spawnModel: FROZEN_META.spawnModel,
      _pickedModel: FROZEN_META.pickedModel, _pickedModelAt: FROZEN_META.pickedModelAt,
      _modelLocked: !!FROZEN_META.modelLocked, _lockedModel: FROZEN_META.lockedModel,
    });
    ok('§7 setup: the restored session carries the lock and nothing else has been learned',
      s._servedViaFallback === undefined && w.eng.sessionModelFor(s) === 'fable[1m]', String(w.eng.sessionModelFor(s)));

    // ONE main-thread opus record after boot — NEWER than the pick.
    w.eng.noteServedModel(s, 'claude-opus-4-8');
    ok('§7 the served record really is newer than the pick (this is the "newest wins" input)',
      (s._servedModelAt || 0) > FROZEN_META.pickedModelAt, `${s._servedModelAt} vs ${FROZEN_META.pickedModelAt}`);
    ok('§7 THE FIX: a lock is never outranked by a served model, however new',
      w.eng.sessionModelFor(s) === 'fable[1m]', String(w.eng.sessionModelFor(s)));
    // …and under a lock a DRIFTED served model is the same ambiguity a standing
    // reroute is (r2's rule, one rung lower): both caps can refuse the turn.
    ok('§7 …and the PROJECTION family is null — the lock drifted, so both caps count',
      w.eng.projectionFamilyFor(s, w.eng.sessionModelFor(s)) === null,
      String(w.eng.projectionFamilyFor(s, w.eng.sessionModelFor(s))));

    const cap = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P);
    const lines = cap.done();
    ok('§7 THE INCIDENT: the locked conversation stays on the only member that still has Fable',
      w.linkOf('sess-6') === 'personal',
      w.linkOf('sess-6') + ' | ' + lines.filter((l) => /per-session switch/.test(l)).join(' | ').slice(0, 200));
    ok('§7 …and nothing was announced', w.notices.length === 0, JSON.stringify(w.notices).slice(0, 200));

    // NEGATIVE CONTROL — r2's ladder + projection, nothing else.
    const mut = mutate('src/server/usage-pool-engine.js', 'lock', R2_LOCK_PATCHES);
    ok('§7 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const w2 = mkWorld({ engineModule: mut.mod });
      const s2 = w2.mkSession('sess-6', 'personal', {
        _spawnModel: FROZEN_META.spawnModel,
        _pickedModel: FROZEN_META.pickedModel, _pickedModelAt: FROZEN_META.pickedModelAt,
        _modelLocked: true, _lockedModel: FROZEN_META.lockedModel,
      });
      w2.eng.noteServedModel(s2, 'claude-opus-4-8');
      ok('§7 NEGATIVE CONTROL: without the lock rung the session states the model it was NOT asking for',
        w2.eng.sessionModelFor(s2) === 'claude-opus-4-8', String(w2.eng.sessionModelFor(s2)));
      const cap2 = quiet();
      w2.eng.maybePoolAutoSwitchForPool(w2.P);
      const l2 = cap2.done();
      ok('§7 NEGATIVE CONTROL: …and the pool really does move it onto the Fable-dead member (the incident)',
        w2.linkOf('sess-6') === 'fish',
        w2.linkOf('sess-6') + ' | ' + l2.filter((l) => /per-session switch/.test(l)).join(' | ').slice(0, 200));
      ok('§7 NEGATIVE CONTROL: …and the notice tells the owner it moved because of its OPUS quota',
        w2.notices.some((n) => /opus quota/.test(n)), JSON.stringify(w2.notices).slice(0, 220));
      const capv = quiet();
      const v2 = w2.eng.quotaVerdictFor(w2.P, { model: w2.eng.sessionModelFor(s2), session: s2 });
      capv.done();
      ok('§7 NEGATIVE CONTROL: …and calls that member USABLE, which is what authorises a billed continue',
        v2.usable === true && /Member F/.test(String(v2.reason)), JSON.stringify({ usable: v2.usable, reason: v2.reason }).slice(0, 200));
    }

    // THE TWO RUNGS ARE DIFFERENT DEFECTS, and the proof is that reverting the
    // projection rung ALONE does not reproduce §7: the ladder still answers the
    // lock, so the projection is asked about 'fable' and the move is refused on
    // the Fable cap anyway. (Its own harm is r2's mirror — the cap of the model
    // that is ANSWERING is dropped — which §7c measures.)
    const mutP = mutate('src/server/usage-pool-engine.js', 'lockproj', [R2_PROJECTION_LOCK_PATCH]);
    ok('§7 the projection-only control applied', mutP.hit === true, mutP.why || '');
    if (mutP.hit) {
      const w3 = mkWorld({ engineModule: mutP.mod });
      const s3 = w3.mkSession('sess-6', 'personal', {
        _spawnModel: FROZEN_META.spawnModel, _pickedModel: FROZEN_META.pickedModel, _pickedModelAt: FROZEN_META.pickedModelAt,
        _modelLocked: true, _lockedModel: FROZEN_META.lockedModel,
      });
      w3.eng.noteServedModel(s3, 'claude-opus-4-8');
      const cap3 = quiet();
      w3.eng.maybePoolAutoSwitchForPool(w3.P);
      cap3.done();
      ok('§7 …reverting ONLY the projection rung does not reproduce §7 (two different defects)',
        w3.eng.sessionModelFor(s3) === 'fable[1m]' && w3.linkOf('sess-6') === 'personal', w3.linkOf('sess-6'));
    }
  }
}

// ── §7c the lock-drift rung's OWN harm: the answering model's cap ───────────
// r2's rule one rung lower. A locked conversation whose stamp we never saw (a
// meta an older build wrote, a reroute announced on a feed that was down) would
// otherwise project the LOCK's family alone and throw away the cap of the model
// that is answering and being BILLED — r2's mirror defect.
{
  const roster = [
    { tag: 'personal', name: 'Member P', u5: 0.20, u7: 0.20, fable: 0.20, opus: 0.20, hoursOut: 100 },
    { tag: 'fish', name: 'Member F', u5: 0.00, u7: 0.20, fable: 0.10, opus: 1.00, hoursOut: 20 },
  ];
  const w = mkWorld({ roster });
  if (!w) { ok('§7c SKIP — pools unsupported', true); }
  else {
    // locked to fable, answering as opus, and NO stamp on the session
    const mk = (world) => {
      const s = world.mkSession('sess-6', 'personal', { _spawnModel: 'fable[1m]', _modelLocked: true, _lockedModel: 'fable[1m]' });
      world.eng.noteServedModel(s, 'claude-opus-4-8');
      return s;
    };
    mk(w);
    const cap = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P);
    cap.done();
    ok('§7c THE FIX: the pool will not place a drifted lock on a member whose OPUS cap is spent',
      w.linkOf('sess-6') === 'personal', w.linkOf('sess-6'));
    const mutP = mutate('src/server/usage-pool-engine.js', 'lockproj2', [R2_PROJECTION_LOCK_PATCH]);
    ok('§7c the projection-only control applied', mutP.hit === true, mutP.why || '');
    if (mutP.hit) {
      const w2 = mkWorld({ roster, engineModule: mutP.mod });
      mk(w2);
      const cap2 = quiet();
      w2.eng.maybePoolAutoSwitchForPool(w2.P);
      const l2 = cap2.done();
      ok('§7c NEGATIVE CONTROL: without it the Opus cap is dropped and the move happens',
        w2.linkOf('sess-6') === 'fish',
        w2.linkOf('sess-6') + ' | ' + l2.filter((l) => /per-session switch/.test(l)).join(' | ').slice(0, 200));
    }
  }
}

// ── §7b the ladder's truth table + the CLI-side /model control it must keep ──
{
  const w = mkWorld();
  if (!w) { ok('§7b SKIP — pools unsupported', true); }
  else {
    // THE CONTROL THIS FIX MUST NOT BREAK: an UNLOCKED session whose served
    // model changed with no fallback on record is an in-CLI `/model`, and the
    // served model still defines it (§1's own control, restated at this rung).
    const a = w.mkSession('u1', 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
    w.eng.noteServedModel(a, 'claude-opus-4-8');
    ok('§7b CONTROL: unlocked + served changed with no fallback ⇒ the served model still defines it',
      w.eng.sessionModelFor(a) === 'claude-opus-4-8', String(w.eng.sessionModelFor(a)));
    ok('§7b CONTROL: …and its projection is that family (nothing is ambiguous here)',
      w.eng.projectionFamilyFor(a, w.eng.sessionModelFor(a)) === 'opus',
      String(w.eng.projectionFamilyFor(a, w.eng.sessionModelFor(a))));
    // a lock with NOTHING served yet is simply the lock
    const b = w.mkSession('u2', 'personal', { _spawnModel: 'claude-fable-5-1[1m]', _modelLocked: true, _lockedModel: 'fable[1m]' });
    ok('§7b a lock with nothing served yet answers the lock, and projects its own family',
      w.eng.sessionModelFor(b) === 'fable[1m]' && w.eng.projectionFamilyFor(b, 'fable[1m]') === 'fable');
    // a lock whose served model AGREES is not a drift
    w.eng.noteServedModel(b, 'claude-fable-5-1');
    ok('§7b …and a served model of the SAME family is not a drift — the projection stands',
      w.eng.projectionFamilyFor(b, w.eng.sessionModelFor(b)) === 'fable',
      String(w.eng.projectionFamilyFor(b, w.eng.sessionModelFor(b))));
    // `_modelLocked` with NO target is the target-less latch (claude-stream-json
    // fills it from the first main-thread model) — it may not hijack the ladder
    const c = w.mkSession('u3', 'personal', { _spawnModel: 'claude-fable-5-1[1m]', _modelLocked: true, _lockedModel: null });
    ok('§7b a lock with NO target does not hijack the ladder (the target-less latch)',
      w.eng.sessionModelFor(c) === 'claude-fable-5-1[1m]', String(w.eng.sessionModelFor(c)));
    // a lock beats a NEWER pick too — and they cannot disagree on the path that
    // exists, because picking while locked re-targets the lock on both sides
    const d = w.mkSession('u4', 'personal', { _spawnModel: 'claude-fable-5-1[1m]', _modelLocked: true, _lockedModel: 'fable[1m]', _pickedModel: 'claude-opus-4-8', _pickedModelAt: Date.now() + 5000 });
    ok('§7b the lock outranks even a newer pick (ws-handler re-targets the lock on every pick)',
      w.eng.sessionModelFor(d) === 'fable[1m]', String(w.eng.sessionModelFor(d)));
    const srv = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
    ok('§7b …and that is a PROPERTY of set-model, not an assumption: a pick while locked rewrites `_lockedModel`',
      /else if \(data\.model && session\._modelLocked\)[\s\S]{0,220}session\._lockedModel = data\.model;/.test(srv));
    const bar = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
    ok('§7b …on the client side too (it sends `lockModel` with the pick)',
      /if \(this\._modelLocked\) this\._lockedModel = model;/.test(bar) && /lockModel: model/.test(bar));
    // an UNNAMEABLE served model under a lock fails CLOSED, like every other unknown here
    const e = w.mkSession('u5', 'personal', { _spawnModel: 'fable[1m]', _modelLocked: true, _lockedModel: 'fable[1m]' });
    w.eng.noteServedModel(e, 'some-internal-model');
    ok('§7b a served model we cannot NAME under a lock ⇒ null (fail closed)',
      w.eng.projectionFamilyFor(e, w.eng.sessionModelFor(e)) === null);
    // and the lock rung is deliberately NOT extended to a plain pick: a
    // `set-model` writes /model on the same tick, so a served model older than
    // a pick is stale BY CONSTRUCTION, and treating that as ambiguity would
    // suppress the projection for one turn after every ordinary model switch.
    const f = w.mkSession('u6', 'personal', { _spawnModel: 'claude-opus-4-8', _pickedModel: 'claude-fable-5-1[1m]', _pickedModelAt: Date.now() + 5000 });
    w.eng.noteServedModel(f, 'claude-opus-4-8');
    ok('§7b CONTROL: an unlocked pick newer than a served model keeps its projection (no ambiguity rung)',
      w.eng.sessionModelFor(f) === 'claude-fable-5-1[1m]' && w.eng.projectionFamilyFor(f, w.eng.sessionModelFor(f)) === 'fable');
  }
}

// ═══ §8 (r3) THE REROUTE STAMP SURVIVES A RESTART ═══════════════════════════
// The round-2 verifier's finding, reproduced on the real engine. `_servedViaFallback`
// was `persisted: null` on the argument that boot-restore's ladder falls back to
// picked/spawn = the REQUEST model — true of the LADDER, false of everything
// else. A restored UNLOCKED conversation whose reroute was announced BEFORE the
// restart gets ONE main-thread opus record; nothing on the session refutes it,
// so `servedDefinesModel` says yes, `sessionModelFor` answers opus,
// `projectionFamilyFor` answers 'opus', the pool moves it onto a member whose
// Fable cap is 100 % spent and `quotaVerdictFor` calls that member usable —
// the incident verbatim, one restart later.
console.log('— §8 (r3) the reroute stamp survives a restart');
/** boot-restore's OWN hydration expression, sliced out of the shipped source so
 *  this leg cannot drift away from what production actually does. */
function bootRestoreHydrate(meta) {
  const src = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  const m = /const restoredFallback = \(meta\) => \{[\s\S]*?\n  \};/.exec(src);
  if (!m) return { ok: false };
  // eslint-disable-next-line no-new-func
  const fn = new Function('meta', `${m[0]}\nreturn restoredFallback(meta);`);
  return { ok: true, value: fn(meta) };
}
{
  const w0 = mkWorld();
  if (!w0) { ok('§8 SKIP — pools unsupported on this platform', true); }
  else {
    // the REAL session-meta store — the stamp must go through the real writer
    const { so } = mkStdout(w0);
    const metaStore = { readSessionMeta: so.readSessionMeta, writeSessionMeta: so.writeSessionMeta };

    // ① BEFORE the restart: the classifier announces the reroute ONCE
    const wBefore = mkWorld({ metaStore });
    const sBefore = wBefore.mkSession('sess-9', 'personal', { _spawnModel: 'claude-fable-5-1[1m]', _pickedModel: 'claude-fable-5-1[1m]', _pickedModelAt: Date.now() - 3600e3 });
    so.writeSessionMeta(sBefore.sockName, { webuiSessionId: 'sess-9', spawnModel: 'claude-fable-5-1[1m]', pickedModel: 'claude-fable-5-1[1m]', pickedModelAt: Date.now() - 3600e3 });
    wBefore.eng.noteModelFallback(sBefore, 'claude-fable-5-1', 'claude-opus-4-8');
    const meta = so.readSessionMeta(sBefore.sockName);
    const written = !!meta.servedViaFallback && meta.servedViaFallback.to === 'claude-opus-4-8' && meta.servedViaFallback.from === 'claude-fable-5-1';
    ok('§8 the reroute is written to session-meta by the ONE consumer that learns it',
      written, JSON.stringify(meta.servedViaFallback));
    ok('§8 …and the spread kept every other key (the ws-handler set-model idiom)',
      meta.spawnModel === 'claude-fable-5-1[1m]' && meta.webuiSessionId === 'sess-9', JSON.stringify(meta).slice(0, 160));
    // ONE write per reroute, not one per record: the incident announced the
    // same reroute twice (a `fallback` block, then a `model_refusal_fallback`).
    // A MUTANT MUST GO RED, NOT CRASH: everything below reads the stamp the
    // assert above just decided on, so an absent one is a loud red per leg
    // rather than a TypeError that abandons the remaining ~140 asserts.
    const at1 = written ? meta.servedViaFallback.at : null;
    wBefore.eng.noteModelFallback(sBefore, 'claude-fable-5-1', 'claude-opus-4-8');
    ok('§8 restating the SAME reroute leaves the stamp alone (`at` dates when this reroute began)',
      written && so.readSessionMeta(sBefore.sockName).servedViaFallback?.at === at1 && sBefore._servedViaFallback?.at === at1,
      written ? '' : 'nothing was persisted — see the assert above');

    // ② THE RESTART: hydrate through boot-restore's own expression
    const hyd = bootRestoreHydrate(meta);
    ok('§8 boot-restore\'s hydration rule was found in the shipped source', hyd.ok === true);
    const w = mkWorld({ metaStore });
    const s = w.mkSession('sess-9', 'personal', {
      _spawnModel: meta.spawnModel || null, _pickedModel: meta.pickedModel || null, _pickedModelAt: meta.pickedModelAt || 0,
      _servedViaFallback: hyd.value,
    });
    ok('§8 THE FIX: the restored session still knows the CLI is answering with a model we did not ask for',
      !!s._servedViaFallback && s._servedViaFallback.to === 'claude-opus-4-8', JSON.stringify(s._servedViaFallback));

    w.eng.noteServedModel(s, 'claude-opus-4-8');   // ONE main-thread record after boot
    ok('§8 …so the session still STATES the model it requests',
      w.eng.sessionModelFor(s) === 'claude-fable-5-1[1m]', String(w.eng.sessionModelFor(s)));
    ok('§8 …and the PROJECTION family is null — every bucket counts',
      w.eng.projectionFamilyFor(s, w.eng.sessionModelFor(s)) === null,
      String(w.eng.projectionFamilyFor(s, w.eng.sessionModelFor(s))));

    const cap = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P);
    const lines = cap.done();
    ok('§8 THE INCIDENT: the first opus record after boot does NOT move the link',
      w.linkOf('sess-9') === 'personal',
      w.linkOf('sess-9') + ' | ' + lines.filter((l) => /per-session switch/.test(l)).join(' | ').slice(0, 200));
    const capv = quiet();
    const v = w.eng.quotaVerdictFor(w.P, { model: w.eng.sessionModelFor(s), session: s });
    capv.done();
    ok('§8 …and the verdict does not answer usable via a Fable-100% member',
      v.viaId === w.id.personal, JSON.stringify({ usable: v.usable, via: v.viaId, reason: v.reason }).slice(0, 200));

    // ③ A STALE STAMP COSTS CONSERVATISM, NOT MONEY — and the retirement
    // clears it ON DISK, so it cannot outlive the reroute it describes.
    w.eng.noteServedModel(s, 'claude-sonnet-5');
    ok('§8 the retirement clears the stamp on disk too (a restored stale one dies at the first other answer)',
      s._servedViaFallback === null && so.readSessionMeta(s.sockName).servedViaFallback === null,
      JSON.stringify(so.readSessionMeta(s.sockName).servedViaFallback));
    ok('§8 …and that session then states the model that answered it',
      w.eng.sessionModelFor(s) === 'claude-sonnet-5', String(w.eng.sessionModelFor(s)));

    // NEGATIVE CONTROL: the r2 shape — nothing persisted, so the restore has
    // nothing to hydrate. Same world, same records, one variable.
    const w2 = mkWorld();
    const s2 = w2.mkSession('sess-9', 'personal', {
      _spawnModel: meta.spawnModel || null, _pickedModel: meta.pickedModel || null, _pickedModelAt: meta.pickedModelAt || 0,
      _servedViaFallback: null, // r2: `persisted: null` ⇒ boot-restore never saw it
    });
    w2.eng.noteServedModel(s2, 'claude-opus-4-8');
    ok('§8 NEGATIVE CONTROL: with the stamp lost the session states the SUBSTITUTED model',
      w2.eng.sessionModelFor(s2) === 'claude-opus-4-8', String(w2.eng.sessionModelFor(s2)));
    ok('§8 NEGATIVE CONTROL: …and the projection drops the Fable cap',
      w2.eng.projectionFamilyFor(s2, w2.eng.sessionModelFor(s2)) === 'opus');
    const cap2 = quiet();
    w2.eng.maybePoolAutoSwitchForPool(w2.P);
    const l2 = cap2.done();
    ok('§8 NEGATIVE CONTROL: …and the pool really does move it onto the Fable-dead member',
      w2.linkOf('sess-9') === 'fish',
      w2.linkOf('sess-9') + ' | ' + l2.filter((l) => /per-session switch/.test(l)).join(' | ').slice(0, 200));
    const cap2v = quiet();
    const v2 = w2.eng.quotaVerdictFor(w2.P, { model: w2.eng.sessionModelFor(s2), session: s2 });
    cap2v.done();
    ok('§8 NEGATIVE CONTROL: …and answers usable via it',
      v2.usable === true && v2.viaId === w2.id.fish, JSON.stringify({ usable: v2.usable, via: v2.viaId }).slice(0, 160));

    // A STORE THAT IS NOT THERE IS NOT A CRASH: the engine is constructed 70
    // lines before session-stdout, so `mk()` over null answers `undefined`.
    const w3 = mkWorld(); // no metaStore
    const s3 = w3.mkSession('sess-x', 'personal', { _spawnModel: 'fable[1m]' });
    let threw = null;
    try { w3.eng.noteModelFallback(s3, 'claude-fable-5-1', 'claude-opus-4-8'); } catch (e) { threw = e.message; }
    ok('§8 CONTROL: with no meta store wired the stamp is memory-only and nothing throws',
      threw === null && s3._servedViaFallback?.to === 'claude-opus-4-8', String(threw));
    // …and a session with no sockName (a view-only shell) is the same shape
    const s4 = w3.mkSession('sess-y', 'personal', { _spawnModel: 'fable[1m]', sockName: null });
    let threw2 = null;
    try { w3.eng.noteModelFallback(s4, 'claude-fable-5-1', 'claude-opus-4-8'); } catch (e) { threw2 = e.message; }
    ok('§8 CONTROL: …and so is a session with no sockName', threw2 === null && s4._servedViaFallback?.to === 'claude-opus-4-8', String(threw2));
  }
}

// ── §8b THE CENSUS: every boot-restore site that hydrates the ladder ─────────
// A COUNT would pass a fourth restore path that silently drops the fact, so
// this derives the sites from the source: wherever `_pickedModel` is hydrated
// from a meta, `_servedViaFallback` must be hydrated beside it.
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  const code = src.replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const sites = [];
  const seen = new Set();
  for (let i = code.indexOf('_pickedModel'); i !== -1; i = code.indexOf('_pickedModel', i + 1)) {
    const line = code.slice(0, i).split('\n').length;
    if (seen.has(line)) continue;       // `_pickedModel` + `_pickedModelAt` are one site
    // the hydration STATEMENT/entry is one line in both shapes used here
    const lineText = code.split('\n')[line - 1];
    const near = code.slice(i, i + 400);
    if (!/meta\.pickedModel/.test(lineText)) continue;
    seen.add(line);
    sites.push({ line, restoresStamp: /_servedViaFallback\s*[:=]\s*restoredFallback\(meta\)/.test(near) });
  }
  console.log('    [census] boot-restore model-ladder hydration sites: ' + JSON.stringify(sites));
  ok('§8b CENSUS: every boot-restore site that hydrates the model ladder also restores the reroute stamp',
    sites.length >= 3 && sites.every((x) => x.restoresStamp), JSON.stringify(sites));
  ok('§8b …and the rule itself is ONE expression, not three copies',
    (src.match(/const restoredFallback = /g) || []).length === 1);
  // NEGATIVE CONTROL: the census really can see a site that drops it.
  const broken = code.replace(/_servedViaFallback\s*[:=]\s*restoredFallback\(meta\)/, '/* dropped */ 0');
  const bSites = [];
  for (let i = broken.indexOf('_pickedModel'); i !== -1; i = broken.indexOf('_pickedModel', i + 1)) {
    const line = broken.slice(0, i).split('\n').length;
    if (!/meta\.pickedModel/.test(broken.split('\n')[line - 1])) continue;
    bSites.push(/_servedViaFallback\s*[:=]\s*restoredFallback\(meta\)/.test(broken.slice(i, i + 400)));
  }
  ok('§8b NEGATIVE CONTROL: a site that drops the stamp is seen',
    bSites.some((x) => x === false), JSON.stringify(bSites));
  // and the schema row states it is persisted (a `null` row is the r2 claim)
  const schema = fs.readFileSync(path.join(REPO, 'src/session-schema.js'), 'utf8');
  ok('§8b the schema row says `meta`, and the sentence that justified `null` is gone',
    /_servedViaFallback:\s*\{ owner: 'stdout', persisted: 'meta'/.test(schema)
    && !/NULL-persisted like `_servedModel` itself/.test(schema));
}

// ═══ §9 (r3) A LANE DEFERRAL IS SETTLED ON TEARDOWN ═════════════════════════
// The round-2 verifier's finding. `settleTurnLane` is reachable only from
// `noteTurnEnd`, i.e. from claude's `result` record — and a turn can end by the
// WRAPPER DYING. A rejected unscoped `seven_day` event followed by a pty exit
// (no result, no banner) therefore left NO bucket mark at all, where master's
// immediate write left one. A dropped wall is the money direction: the member
// reads healthy to every OTHER conversation.
console.log('— §9 (r3) a lane deferral is settled on teardown');
const REJECTION_LINE = (w, member, rawType = 'seven_day') => JSON.stringify({
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'rejected', rateLimitType: rawType, resetsAt: w.resets[member], resets_at: w.resets[member],
    overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.03, resetsAt: w.nowSec + 3600 }, seven_day: { utilization: 0.65, resetsAt: w.resets[member] } },
  },
}) + '\n';
/** rejection → pty EXIT (no `result`, no banner) through the REAL consumer. */
function playWallThenDeath(w, { engine = w.eng } = {}) {
  const { so } = mkStdout(w, { engine });
  const s = w.sessions.get('sess-6');
  s._normalizer = createMessageManager('claude', 'sess-6');
  const pty = mkPty();
  so.setupSessionPty(s, 'sess-6', pty);
  const cap = quiet();
  pty.data(REJECTION_LINE(w, 'wmax'));
  const pending = engine.pendingLaneDeferrals(s).length;
  pty.exit({ exitCode: 1 });               // the wrapper dies
  return { lines: cap.done(), pending };
}
{
  const w = mkWorld({ sameDeadline: true });
  if (!w) { ok('§9 SKIP — pools unsupported on this platform', true); }
  else {
    // the incident-shaped Member W cache: plan 7d 65 % alive, Fable 100 % spent
    w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    const before = w.readCache(w.id.wmax);
    ok('§9 setup: the plan week is alive and the Fable cap is the spent one',
      Math.abs(before.sevenDay.utilization - 0.65) < 1e-9 && (before.scopedWeekly || []).some((b) => /fable/i.test(b.name) && b.utilization === 1)
      && !(before.scopedWeekly || []).some((b) => b.status === 'limited'), JSON.stringify(before.scopedWeekly));

    const { lines, pending } = playWallThenDeath(w);
    ok('§9 the rejection really was DEFERRED (this is the shape that could be lost)', pending === 1, String(pending));
    const c = w.readCache(w.id.wmax);
    const fable = (c.scopedWeekly || []).find((b) => /fable/i.test(b.name || ''));
    ok('§9 THE FIX: the mark lands by the evidence rule even though no `result` ever arrived',
      !!fable && fable.status === 'limited' && fable.resetsAt === w.resets.wmax, JSON.stringify(fable));
    ok('§9 …on the MODEL cap, not the plan lane',
      Math.abs(c.sevenDay.utilization - 0.65) < 1e-9 && c.sevenDay.status !== 'limited', JSON.stringify(c.sevenDay));
    ok('§9 …and the journal says which rule decided it',
      lines.some((l) => /unscoped weekly rejection on .* → the Fable model cap \(no banner: the plan week reads/.test(l)),
      lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 260));

    // NEGATIVE CONTROL: the teardown call removed — the r2 shape.
    const mutT = mutate('src/server/session-stdout.js', 'teardown', [[
      "    try { session._settleTurnLane?.(); } catch (e) { console.warn('[wall] teardown lane settle failed:', e.message); }",
      '    /* PRE-FIX (r2): the teardown never settled the lane */',
    ]]);
    ok('§9 NEGATIVE CONTROL: the patch hit the product source', mutT.hit === true, mutT.why || '');
    if (mutT.hit) {
      const w2 = mkWorld({ sameDeadline: true });
      w2.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
      // same world, same records — only session-stdout is the patched copy
      const so2 = mutT.mod.create({
        rootDir: w2.root, BUFFERS_DIR: path.join(w2.root, 'b'), META_DIR: path.join(w2.root, 'm'),
        DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(w2.root, 'nonexistent'),
        CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result']), _seenStreamTypes: new Set(),
        activeSessions: w2.sessions, engine: w2.eng,
        checkClaudeGoalStatus() { }, broadcastToSession() { }, broadcastActiveSessions() { },
        noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h,
        sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null,
        getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), getTelemetry: () => null,
        getNoConvoRef: () => ({ map: new Map() }), getDeliver: () => ({ stashFor() { } }),
      });
      const s2 = w2.sessions.get('sess-6');
      s2._normalizer = createMessageManager('claude', 'sess-6');
      const pty2 = mkPty();
      so2.setupSessionPty(s2, 'sess-6', pty2);
      const cap2 = quiet();
      pty2.data(REJECTION_LINE(w2, 'wmax'));
      pty2.exit({ exitCode: 1 });
      const l2 = cap2.done();
      const c2 = w2.readCache(w2.id.wmax);
      ok('§9 NEGATIVE CONTROL: without the teardown settle the wall is DROPPED — no bucket mark at all',
        !(c2.scopedWeekly || []).some((b) => b.status === 'limited') && c2.sevenDay.status !== 'limited',
        JSON.stringify(c2.scopedWeekly));
      ok('§9 NEGATIVE CONTROL: …and not one journal line says what happened to it',
        !l2.some((l) => /unscoped weekly rejection/.test(l)), l2.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 200));
    }

    // …and MASTER left a mark on this very shape, so the drop is a REGRESSION
    // against it, not a pre-existing gap. (Master's mark is on the WRONG lane —
    // that is §2 — but it is a mark.)
    const mutM = mutate('src/server/usage-pool-engine.js', 'laneimmediate', [[
      'if (laneIsProvisional(session, ev)) {',
      'if (false && laneIsProvisional(session, ev)) { // MASTER: the unscoped weekly rejection is written the instant it arrives',
    ]]);
    ok('§9 the master control patch hit the product source', mutM.hit === true, mutM.why || '');
    if (mutM.hit) {
      const w3 = mkWorld({ sameDeadline: true, engineModule: mutM.mod });
      w3.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
      playWallThenDeath(w3, { engine: w3.eng });
      const c3 = w3.readCache(w3.id.wmax);
      ok('§9 MASTER CONTROL: master DID leave a mark on this shape (so dropping it was a regression)',
        c3.sevenDay.status === 'limited', JSON.stringify(c3.sevenDay));
    }

    // CONTROL: a turn that ends normally is unchanged — one settle, not two.
    const w4 = mkWorld({ sameDeadline: true });
    w4.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    const { so: so4 } = mkStdout(w4);
    const s4 = w4.sessions.get('sess-6');
    s4._normalizer = createMessageManager('claude', 'sess-6');
    const pty4 = mkPty();
    so4.setupSessionPty(s4, 'sess-6', pty4);
    const cap4 = quiet();
    pty4.data(REJECTION_LINE(w4, 'wmax'));
    pty4.data(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'cid-sess-6' }) + '\n');
    pty4.exit({ exitCode: 0 });
    const l4 = cap4.done();
    ok('§9 CONTROL: a turn that ends normally settles ONCE — the teardown adds nothing',
      l4.filter((l) => /unscoped weekly rejection/.test(l)).length === 1,
      l4.filter((l) => /unscoped weekly rejection/.test(l)).join(' | ').slice(0, 220));
    // CONTROL: a session with NO deferral pays nothing on teardown
    const w5 = mkWorld({ sameDeadline: true });
    w5.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    const { so: so5 } = mkStdout(w5);
    const s5 = w5.sessions.get('sess-6');
    s5._normalizer = createMessageManager('claude', 'sess-6');
    const pty5 = mkPty();
    so5.setupSessionPty(s5, 'sess-6', pty5);
    const cap5 = quiet();
    pty5.exit({ exitCode: 0 });
    const l5 = cap5.done();
    ok('§9 CONTROL: a session that never deferred anything writes nothing on teardown',
      !l5.some((l) => /\[wall\]/.test(l)) && !(w5.readCache(w5.id.wmax).scopedWeekly || []).some((b) => b.status === 'limited'),
      l5.join(' | ').slice(0, 200));
  }
}

// ── §9b the LANE_DEFER_MAX drop is COUNTED, never silent ────────────────────
// The OTHER way this deferral loses a wall: past the cap the rejection gets no
// bucket mark at all, and r2 returned in silence — same harm as §9, one rung up.
//
// REACHABILITY, MEASURED AND STATED: a turn's rejections share ONE key by
// construction (`rejectionSlotFor` pins the slot at the first keyed signal), so
// five DISTINCT keys in one turn need `wallRecordTarget` to re-file mid-turn.
// Driving five real re-files end to end was NOT done; the cap is driven through
// the product's own `deferTurnLane` and the re-file path is pinned at its call
// site instead. A bound nobody can prove unreachable may not drop a wall quietly.
{
  const w = mkWorld({ sameDeadline: true });
  if (!w) { ok('§9b SKIP — pools unsupported', true); }
  else {
    ok('§9b the cap\'s own function is reachable', typeof w.eng.deferTurnLane === 'function');
    const engSrc = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
    ok('§9b the key a deferral carries is the RE-FILED one, so the cap is not structurally dead',
      /writeKey = wallRecordTarget\(session, key, ev\);/.test(engSrc)
      && /deferTurnLane\(session, \{ key: writeKey,/.test(engSrc));
    // (a comment wraps, so the prose is compared with its line breaks flattened)
    const flat = engSrc.replace(/\n\s*\/\/ ?/g, ' ');
    ok('§9b …and the reachability limit is written down beside the constant, not assumed',
      /five distinct re-filed keys has NOT been measured end to end/i.test(flat));

    const s = w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    const events = [];
    const prevEv = global.__vsEvent;
    global.__vsEvent = (n, d) => events.push(n + ':' + d);
    const cap = quiet();
    for (const tag of ['wmax', 'fish', 'pf', 'uci', 'personal']) {
      w.eng.deferTurnLane(s, { key: w.id[tag], resetsAt: w.resets[tag], rawType: 'seven_day' });
    }
    const lines = cap.done();
    global.__vsEvent = prevEv;
    ok('§9b the cap really bound (five distinct members, LANE_DEFER_MAX is 4)',
      w.eng.pendingLaneDeferrals(s).length === 4, String(w.eng.pendingLaneDeferrals(s).length));
    ok('§9b THE FIX: the dropped wall is COUNTED, not silent',
      events.filter((e) => e.startsWith('rate-limit-lane-dropped:')).length === 1, JSON.stringify(events).slice(0, 240));
    ok('§9b …and it SAYS which member lost its bucket mark and why',
      lines.some((l) => /lane deferral dropped for Member P — more than 4 members walled in one turn \(its bucket mark is lost\)/.test(l)),
      lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 260));

    // CONTROL: under the cap nothing is dropped and nothing is counted
    const s2 = w.mkSession('sess-7', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    const ev2 = [];
    const prev2 = global.__vsEvent;
    global.__vsEvent = (n, d) => ev2.push(n + ':' + d);
    const cap2 = quiet();
    for (const tag of ['wmax', 'fish']) w.eng.deferTurnLane(s2, { key: w.id[tag], resetsAt: w.resets[tag], rawType: 'seven_day' });
    cap2.done();
    global.__vsEvent = prev2;
    ok('§9b CONTROL: under the cap nothing is dropped and nothing is counted',
      w.eng.pendingLaneDeferrals(s2).length === 2 && !ev2.some((e) => e.startsWith('rate-limit-lane-dropped:')),
      JSON.stringify(ev2).slice(0, 200));
    // CONTROL: the SAME member restated is a dedup, not a drop — the two
    // early returns must stay distinguishable, or the counter counts noise.
    const ev3 = [];
    const prev3 = global.__vsEvent;
    global.__vsEvent = (n, d) => ev3.push(n + ':' + d);
    const cap3 = quiet();
    w.eng.deferTurnLane(s2, { key: w.id.wmax, resetsAt: w.resets.wmax, rawType: 'seven_day' });
    cap3.done();
    global.__vsEvent = prev3;
    ok('§9b CONTROL: the same member\'s wall restated is a dedup, never a counted drop',
      w.eng.pendingLaneDeferrals(s2).length === 2 && !ev3.some((e) => e.startsWith('rate-limit-lane-dropped:')),
      JSON.stringify(ev3).slice(0, 160));

    // NEGATIVE CONTROL: the r2 early return — silent.
    const mut = mutate('src/server/usage-pool-engine.js', 'lanecap', [[
      `  if (list.length >= LANE_DEFER_MAX) {\n    console.warn(\`[wall] \${session._webuiId}: lane deferral dropped for \${nameOf(key)} — more than \${LANE_DEFER_MAX} members walled in one turn (its bucket mark is lost)\`);\n    global.__vsEvent?.('rate-limit-lane-dropped', \`\${key}:\${rawType || 'sevenDay'}\`);\n    return;\n  }\n`,
      '  if (list.length >= LANE_DEFER_MAX) return; // PRE-FIX (r2): the cap drops a wall in silence\n',
    ]]);
    ok('§9b NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const w2 = mkWorld({ sameDeadline: true, engineModule: mut.mod });
      const s3 = w2.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
      const ev4 = [];
      const prev4 = global.__vsEvent;
      global.__vsEvent = (n, d) => ev4.push(n + ':' + d);
      const cap4 = quiet();
      for (const tag of ['wmax', 'fish', 'pf', 'uci', 'personal']) {
        w2.eng.deferTurnLane(s3, { key: w2.id[tag], resetsAt: w2.resets[tag], rawType: 'seven_day' });
      }
      const l4 = cap4.done();
      global.__vsEvent = prev4;
      ok('§9b NEGATIVE CONTROL: r2 drops the fifth wall with no event and no line',
        w2.eng.pendingLaneDeferrals(s3).length === 4
        && !ev4.some((e) => e.startsWith('rate-limit-lane-dropped:'))
        && !l4.some((l) => /lane deferral dropped/.test(l)),
        JSON.stringify({ ev: ev4.length, lines: l4.filter((l) => /\[wall\]/.test(l)).length }));
    }
  }
}

// ═══ §10 (r3) EVERY ENGINE NAME A CONSUMER DESTRUCTURES IS WIRED ════════════
// Found while wiring §8, reproduced against the round-2 commit: server.js hands
// session-stdout and session-brain HAND-PICKED `engine:` object literals, and
// round 1's own `noteServedModel` / `noteModelFallback` were in NEITHER (nor in
// the engine's top-level destructure). So the call at claude-stream-json.js:609
// was a TypeError inside the per-LINE try, whose catch treats the record as
// "non-JSON noise" — it broadcast the assistant record as RAW terminal output
// and `feedLive` (the last statement of that try) never ran. MEASURED against
// e3cc388e with that exact literal: frames `["output"]`, normalizer ops `[]`,
// `_servedModel` undefined. The whole round-1 fix was dead in production AND it
// broke every claude chat session — while three suites stayed green because
// every one of them passes the WHOLE engine.
//
// A hand-written list is the tool this class has already defeated, so the check
// DERIVES both halves: the consumers' own `const {…} = engine;` and server.js's
// own literals.
console.log('— §10 (r3) every engine name a consumer destructures is wired');
{
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  /** the balanced object literal that follows `anchor` */
  const literalAfter = (src, anchor) => {
    const i = src.indexOf(anchor);
    if (i === -1) return null;
    const s = src.indexOf('{', i);
    let d = 0;
    for (let j = s; j < src.length; j++) {
      if (src[j] === '{') d++;
      else if (src[j] === '}') { d--; if (!d) return src.slice(s + 1, j); }
    }
    return null;
  };
  const names = (body) => [...new Set((String(body).replace(/\/\/.*$/gm, '')
    .match(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*(?:[,}]|:|$)/gm) || [])
    .map((m) => m.replace(/[^\w$]/g, '')).filter(Boolean))];
  /** the names a module destructures from `engine` */
  const destructured = (rel) => {
    const s = fs.readFileSync(path.join(REPO, rel), 'utf8');
    const i = s.indexOf('} = engine;');
    if (i === -1) return [];
    return names(s.slice(s.lastIndexOf('const {', i) + 7, i));
  };

  // the consumer set is DERIVED from the registry, never typed here
  const regSrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/index.js'), 'utf8');
  const consumers = [...new Set((regSrc.match(/require\('\.\/([\w-]+\.js)'\)/g) || [])
    .map((m) => 'src/server/stdout/' + /\/([\w-]+\.js)/.exec(m)[1]))];
  ok('§10 the consumer set is derived from the registry and is not empty',
    consumers.length >= 3, JSON.stringify(consumers));

  const wired = {
    'src/server/session-stdout.js': names(literalAfter(srv, "require('./src/server/session-stdout.js').create({")),
    'src/server/session-brain.js': names(literalAfter(srv, "require('./src/server/session-brain.js').create({")),
  };
  ok('§10 both `engine:` literals were found in server.js',
    wired['src/server/session-stdout.js'].length > 5 && wired['src/server/session-brain.js'].length > 3);

  // every stdout consumer is served by the session-stdout literal; session-brain
  // is its own holder (the DEVICE feed).
  const rows = [];
  for (const c of consumers) rows.push({ consumer: c, via: 'src/server/session-stdout.js', need: destructured(c) });
  rows.push({ consumer: 'src/server/session-brain.js', via: 'src/server/session-brain.js', need: destructured('src/server/session-brain.js') });
  let missingTotal = 0;
  for (const r of rows) {
    const missing = r.need.filter((n) => !wired[r.via].includes(n));
    missingTotal += missing.length;
    console.log(`    [census] ${r.consumer}: needs ${r.need.length} from engine, missing ${JSON.stringify(missing)}`);
  }
  ok('§10 THE FIX: every name a consumer destructures from `engine` is in the literal server.js passes',
    missingTotal === 0, String(missingTotal));
  // …and the two names this whole branch depends on are really there
  ok('§10 …including the round-1 pair and the r3 teardown settle',
    ['noteServedModel', 'noteModelFallback', 'settleTurnLane'].every((n) => wired['src/server/session-stdout.js'].includes(n))
    && ['noteServedModel', 'noteModelFallback'].every((n) => wired['src/server/session-brain.js'].includes(n)));
  // …and they are exported from the engine at all (the other half of the hole:
  // the literals can only pass what server.js destructured in the first place).
  const poolDestructure = srv.slice(0, srv.indexOf("require('./src/server/usage-pool-engine.js').create({"));
  const poolNames = names(poolDestructure.slice(poolDestructure.lastIndexOf('const {')));
  ok('§10 …and server.js destructures them from the engine in the first place',
    ['noteServedModel', 'noteModelFallback', 'settleTurnLane', 'servedDefinesModel'].every((n) => poolNames.includes(n)),
    JSON.stringify(poolNames.filter((n) => /^note(Served|Model)|settleTurn|servedDefines/.test(n))));
  // …and the rule DERIVED rather than typed (r3-r2): a name in either `engine:`
  // literal that server.js never destructured is a free identifier — the
  // lost-binding class, which throws only when the line RUNS. Measured: all 20
  // + 8 names resolve today, so the rule is satisfiable, not aspirational.
  const engineSub = (anchor) => names(literalAfter(srv.slice(srv.indexOf(anchor)), 'engine: {'));
  const literalOnly = [...new Set([
    ...engineSub("require('./src/server/session-stdout.js').create({"),
    ...engineSub("require('./src/server/session-brain.js').create({"),
  ])].filter((n) => !poolNames.includes(n));
  ok('§10 …and EVERY name in either `engine:` literal is destructured from the engine',
    literalOnly.length === 0, JSON.stringify(literalOnly));

  // NEGATIVE CONTROL: the census must SEE a missing name. Drive it over the
  // round-2 literal — the bytes that shipped the defect.
  const preFix = srv.replace(
    ', noteServedModel, noteModelFallback, servedDefinesModel, rerouteAnnouncedBy, settleTurnLane },',
    ' }, // PRE-FIX (r2): the served-model pair was never passed');
  ok('§10 NEGATIVE CONTROL: the patch hit server.js', preFix !== srv);
  const preWired = names(literalAfter(preFix, "require('./src/server/session-stdout.js').create({"));
  const preMissing = destructured('src/server/stdout/claude-stream-json.js').filter((n) => !preWired.includes(n));
  ok('§10 NEGATIVE CONTROL: the round-2 literal really is missing the pair the consumer calls',
    preMissing.includes('noteServedModel') && preMissing.includes('noteModelFallback'), JSON.stringify(preMissing));
}

// ── §10b THE CONSEQUENCE: the round-2 literal breaks every claude chat ──────
// The census above is a text check; this drives the REAL consumer over the
// REAL `engine:` literal shape and measures what a user would see.
{
  const w = mkWorld();
  if (!w) { ok('§10b SKIP — pools unsupported', true); }
  else {
    const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    const i = srv.indexOf("require('./src/server/session-stdout.js').create({");
    const s0 = srv.indexOf('engine: {', i);
    let d = 0, body = '';
    for (let j = srv.indexOf('{', s0 + 8); j < srv.length; j++) {
      if (srv[j] === '{') d++;
      else if (srv[j] === '}') { d--; if (!d) { body = srv.slice(srv.indexOf('{', s0 + 8) + 1, j); break; } }
    }
    const keys = [...new Set((body.replace(/\/\/.*$/gm, '').match(/(?:^|[,\s])([A-Za-z_$][\w$]*)\s*(?:,|$)/gm) || [])
      .map((m) => m.replace(/[^\w$]/g, '')).filter(Boolean))];
    ok('§10b server.js\'s engine literal was sliced out of the shipped bytes', keys.length > 10, String(keys.length));

    const drive = (allow) => {
      const eng = {};
      for (const k of keys) if (allow(k)) eng[k] = w.eng[k];
      const frames = [];
      const { so } = mkStdout(w, { engine: eng, broadcastToSession: (s, id, m) => frames.push(m.type) });
      const s = w.mkSession('sess-' + Math.random().toString(36).slice(2, 7), 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
      s._normalizer = createMessageManager('claude', s._webuiId);
      const ops = [];
      s._normalizer.onOp((op) => ops.push(op.op));
      const pty = mkPty();
      so.setupSessionPty(s, s._webuiId, pty);
      const cap = quiet();
      pty.data(JSON.stringify({ type: 'assistant', message: { id: 'msg_1', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'text', text: 'hello' }] } }) + '\n');
      cap.done();
      return { frames, ops, served: s._servedModel };
    };
    const now = drive(() => true);
    ok('§10b THE FIX: a main-thread assistant record reaches the normalizer and records the served model',
      now.ops.length > 0 && now.served === 'claude-fable-5-1' && !now.frames.includes('output'),
      JSON.stringify(now).slice(0, 200));
    const pre = drive((k) => k !== 'noteServedModel' && k !== 'noteModelFallback');
    ok('§10b NEGATIVE CONTROL: with the round-2 literal the record is broadcast as RAW OUTPUT…',
      pre.frames.length === 1 && pre.frames[0] === 'output', JSON.stringify(pre.frames));
    ok('§10b NEGATIVE CONTROL: …never reaches the normalizer, and the served model is never learned',
      pre.ops.length === 0 && pre.served === undefined, JSON.stringify({ ops: pre.ops, served: pre.served }));
  }
}


// ═══ §11 (r3-r2) A LOCK NEVER LATCHES THE CLASSIFIER'S SUBSTITUTE ═══════════
// The round-3 verifier's BLOCKER, reproduced on the real engine + real pool +
// real credential symlinks + the REAL stdout consumer before anything changed.
//
// §7 put the LOCK at the top of `sessionModelFor`'s ladder. But the parse's
// target-less lock latch (`_modelLocked && !_lockedModel` ⇒ adopt the first
// main-thread served model — in master long before this branch, where it only
// ever fed the repin) hands that rung whatever ANSWERED. While a reroute is
// standing that is the SUBSTITUTE, so the lock states the model we are not
// asking for, `projectionFamilyFor` answers its family, the Fable cap that is
// the binding constraint is dropped, and the pool moves the conversation onto a
// member whose Fable is 100 % spent — the incident verbatim, a REGRESSION
// against r2 (measured: same fixture, r2 keeps it on `personal`), and PERMANENT
// because the latch writes the target to session-meta. It also defeated r3(B):
// the stamp that exists to make a RESTORED session right was overridden by the
// latch on the first record after the restore.
//
// REACHABLE BY CONSTRUCTION, not by luck. src/ws-create.js creates exactly this
// state — `_lockedModel: data.modelLock ? (data.lockModel || data.model || null)
// : null`, whose own comment says the server latches the first main-thread
// served model instead — boot-restore hydrates it from meta, and
// src/lib/session-lifecycle.js carries `modelLock` and `lockModel` as SEPARATE
// saved-config keys, so a saved config predating `lockModel` resumes
// locked-with-no-target.
console.log('— §11 (r3-r2) a target-less lock never latches the substitute');

/** Drive the defect's own records through the REAL pipeline (session-stdout →
 *  the registry → claude-stream-json) on a fake pty.
 *    announce  — the `system/model_refusal_fallback` the classifier emits ONCE
 *    restored  — skip the announcement and hydrate the stamp through
 *                boot-restore's OWN expression instead (the r3(B) shape)
 *    answers   — the model on the main-thread assistant record
 *    stdoutModule — a PATCHED COPY of session-stdout (the negative control) */
function playLatch({ stdoutModule = null, engineModule = engMod, restored = false, announce = true, answers = 'claude-opus-4-8' } = {}) {
  const w = mkWorld({ engineModule });
  if (!w) return null;
  const { so, META_DIR } = mkStdout(w, { stdoutModule });
  w.setMetaStore({ readSessionMeta: so.readSessionMeta, writeSessionMeta: so.writeSessionMeta });
  const sid = 'sess-lockless';
  const stampMeta = {
    webuiSessionId: sid, spawnModel: 'claude-fable-5-1[1m]', modelLocked: true,
    servedViaFallback: { from: 'claude-fable-5-1', to: 'claude-opus-4-8', at: Date.now() - 60000 },
  };
  const hyd = restored ? bootRestoreHydrate(stampMeta) : null;
  const s = w.mkSession(sid, 'personal', {
    _spawnModel: 'claude-fable-5-1[1m]',
    _modelLocked: true, _lockedModel: null,       // ws-create: `modelLock` with no `lockModel`
    ...(restored ? { _servedViaFallback: hyd.value } : {}),
  });
  if (restored) so.writeSessionMeta(s.sockName, stampMeta);
  s._normalizer = createMessageManager('claude', sid);
  const pty = mkPty();
  so.setupSessionPty(s, sid, pty);
  const cap = quiet();
  if (announce && !restored) {
    pty.data(JSON.stringify({ type: 'system', subtype: 'model_refusal_fallback', original_model: 'claude-fable-5-1', fallback_model: 'claude-opus-4-8', scope: 'session' }) + '\n');
  }
  pty.data(JSON.stringify({ type: 'assistant', message: { id: 'msg_1', role: 'assistant', model: answers, content: [{ type: 'text', text: 'hi' }] } }) + '\n');
  cap.done();
  const cap2 = quiet();
  w.eng.maybePoolAutoSwitchForPool(w.P);
  const lines = cap2.done();
  const cap3 = quiet();
  let verdict = null;
  try { verdict = w.eng.quotaVerdictFor(w.P, { model: w.eng.sessionModelFor(s), session: s }); } catch (e) { verdict = { err: e.message }; }
  cap3.done();
  let meta = null; try { meta = so.readSessionMeta(s.sockName); } catch { }
  const model = w.eng.sessionModelFor(s);
  return {
    w, s, so, META_DIR, meta, verdict, model, hyd,
    fam: w.eng.projectionFamilyFor(s, model), link: w.linkOf(sid),
    switches: lines.filter((l) => /per-session switch/.test(l)),
  };
}
{
  const r = playLatch();
  if (!r) { ok('§11 SKIP — pools unsupported on this platform', true); }
  else {
    ok('§11 setup: the reroute the CLI announced really is standing on the session',
      r.s._servedViaFallback?.to === 'claude-opus-4-8', JSON.stringify(r.s._servedViaFallback));
    ok('§11 setup: …and the substitute really did answer the main thread',
      r.s._servedModel === 'claude-opus-4-8', String(r.s._servedModel));
    ok('§11 THE FIX: the lock stays target-less — a substituted model is not a request',
      r.s._lockedModel === null, String(r.s._lockedModel));
    ok('§11 …and nothing was written to session-meta, where it would be permanent',
      !r.meta || r.meta.lockedModel == null, JSON.stringify(r.meta && r.meta.lockedModel));
    ok('§11 …so the session states the model it is asking FOR',
      r.model === 'claude-fable-5-1[1m]', String(r.model));
    ok('§11 …and the projection is null — the reroute stands, so every bucket counts',
      r.fam === null, String(r.fam));
    ok('§11 THE INCIDENT: the conversation stays on the only member that still has Fable',
      r.link === 'personal', r.link + ' | ' + r.switches.join(' | ').slice(0, 200));
    ok('§11 …and nothing was announced to the owner', r.w.notices.length === 0, JSON.stringify(r.w.notices).slice(0, 200));
    ok('§11 …and the verdict answers via that member, never a Fable-100% one',
      r.verdict.viaId === r.w.id.personal, JSON.stringify({ usable: r.verdict.usable, via: r.verdict.viaId, reason: r.verdict.reason }).slice(0, 180));
  }

  // ── the r3(B) shape: the stamp is RESTORED and the latch must respect it ──
  const rb = playLatch({ restored: true });
  if (!rb) { ok('§11b SKIP — pools unsupported', true); }
  else {
    ok('§11b boot-restore\'s own hydration expression was found in the shipped source',
      rb.hyd.ok === true && rb.s._servedViaFallback?.to === 'claude-opus-4-8', JSON.stringify(rb.s._servedViaFallback));
    ok('§11b THE FIX: the first record after a restore does not overwrite the restored fact',
      rb.s._lockedModel === null && rb.model === 'claude-fable-5-1[1m]',
      JSON.stringify({ locked: rb.s._lockedModel, model: rb.model }));
    ok('§11b …and the restored conversation is not moved',
      rb.link === 'personal' && rb.w.notices.length === 0, rb.link + ' | ' + JSON.stringify(rb.w.notices).slice(0, 160));
  }
}

// ── §11c the LEGITIMATE latch is untouched (the controls this fix must keep) ─
{
  // No reroute at all: the first main-thread model IS the target, and it is
  // persisted — that is the whole reason the latch exists (else repin no-ops).
  const clean = playLatch({ announce: false, answers: 'claude-fable-5-1' });
  if (!clean) { ok('§11c SKIP — pools unsupported', true); }
  else {
    ok('§11c CONTROL: with no reroute on record the latch still fires',
      clean.s._lockedModel === 'claude-fable-5-1', String(clean.s._lockedModel));
    ok('§11c CONTROL: …and still writes the target to session-meta',
      !!clean.meta && clean.meta.lockedModel === 'claude-fable-5-1', JSON.stringify(clean.meta && clean.meta.lockedModel));
  }
  // THE ORDER IS LOAD-BEARING: the gate is asked AFTER `noteServedModel`, so a
  // record served by anything but the reroute target RETIRES the stamp and is
  // then allowed to latch. Asking before would freeze the lock target-less for
  // the life of a session whose reroute is long over.
  const other = playLatch({ answers: 'claude-sonnet-5' });
  if (other) {
    ok('§11c CONTROL: a record served by something ELSE retires the reroute…',
      other.s._servedViaFallback === null, JSON.stringify(other.s._servedViaFallback));
    ok('§11c CONTROL: …and that same record latches the lock',
      other.s._lockedModel === 'claude-sonnet-5' && other.model === 'claude-sonnet-5',
      JSON.stringify({ locked: other.s._lockedModel, model: other.model }));
  }
}

// ── §11d NEGATIVE CONTROL: the pre-fix latch, inside the REAL pipeline ──────
// consumer → registry → session-stdout, three patched siblings so the ONLY
// variable is the gate clause; each patch is asserted to hit.
{
  // Only the `servedDefinesModel` clause is reverted — §11's reroute is
  // announced by a SEPARATE system record, so r4's `!announced` belt is a
  // structural no-op on this fixture and the control stays single-mechanism
  // (§14c is where the belt gets its own control, on the record that carries
  // the announcement).
  const mutC = mutate('src/server/stdout/claude-stream-json.js', 'latch', [[
    'if (session._modelLocked && !session._lockedModel && !announced && servedDefinesModel(session)) {',
    'if (session._modelLocked && !session._lockedModel && !announced) { // PRE-FIX (r3): whatever answered becomes the lock target',
  ]]);
  ok('§11d NEGATIVE CONTROL: the patch hit the consumer', mutC.hit === true, mutC.why || '');
  if (mutC.hit) {
    const mutI = mutate('src/server/stdout/index.js', 'registry', [[
      "'stream-json': require('./claude-stream-json.js'),",
      `'stream-json': require('./${path.basename(mutC.file)}'),`,
    ]]);
    const mutS = mutI.hit ? mutate('src/server/session-stdout.js', 'sostdout', [[
      "require('./stdout/index.js')",
      `require('./stdout/${path.basename(mutI.file)}')`,
    ]]) : { hit: false, why: 'registry patch missed' };
    ok('§11d NEGATIVE CONTROL: …and the registry + session-stdout were re-pointed at it',
      mutI.hit === true && mutS.hit === true, (mutI.why || '') + ' ' + (mutS.why || ''));
    // (a) the LATCH alone reverted: it really does adopt the substitute and
    // write it to session-meta, where it is permanent — and §12's belt is the
    // reason that is not yet a pool move. THE TWO LAYERS ARE DIFFERENT DEFECTS
    // and this is where that is proven, exactly as §7 proves it for its pair.
    const bad = mutI.hit && mutS.hit ? playLatch({ stdoutModule: mutS.mod }) : null;
    if (bad) {
      ok('§11d NEGATIVE CONTROL: the ungated latch really does adopt the substitute',
        bad.s._lockedModel === 'claude-opus-4-8', String(bad.s._lockedModel));
      ok('§11d NEGATIVE CONTROL: …and writes it to session-meta, where it is permanent',
        !!bad.meta && bad.meta.lockedModel === 'claude-opus-4-8', JSON.stringify(bad.meta && bad.meta.lockedModel));
      ok('§11d …and with the latch alone reverted §12\'s belt still refuses the move (two layers)',
        bad.model === 'claude-fable-5-1[1m]' && bad.fam === null && bad.link === 'personal',
        JSON.stringify({ model: bad.model, fam: bad.fam, link: bad.link }));

      // (b) BOTH layers reverted = the shape the verifier measured on r3.
      const mutE = mutate('src/server/usage-pool-engine.js', 'beltoff', [R3R2_BELT_PATCH]);
      ok('§11d NEGATIVE CONTROL: the belt patch hit the engine too', mutE.hit === true, mutE.why || '');
      const worst = mutE.hit ? playLatch({ stdoutModule: mutS.mod, engineModule: mutE.mod }) : null;
      if (worst) {
        ok('§11d NEGATIVE CONTROL: with both reverted the session states the model it was NOT asking for',
          worst.model === 'claude-opus-4-8' && worst.fam === 'opus', JSON.stringify({ model: worst.model, fam: worst.fam }));
        ok('§11d NEGATIVE CONTROL: …and the pool moves it onto the Fable-dead member (the incident)',
          worst.link === 'fish', worst.link + ' | ' + worst.switches.join(' | ').slice(0, 200));
        ok('§11d NEGATIVE CONTROL: …announcing an OPUS quota it is not the one spending',
          worst.w.notices.some((n) => /opus quota/.test(n)), JSON.stringify(worst.w.notices).slice(0, 220));
        ok('§11d NEGATIVE CONTROL: …and calls that member usable, which authorises a billed continue',
          worst.verdict.usable === true && worst.verdict.viaId === worst.w.id.fish,
          JSON.stringify({ usable: worst.verdict.usable, via: worst.verdict.viaId }).slice(0, 160));
        // …and the same control on the RESTORED shape: r3(B)'s stamp is on the
        // session AND on disk, and the ungated latch overrides it anyway.
        const badR = playLatch({ stdoutModule: mutS.mod, engineModule: mutE.mod, restored: true });
        ok('§11d NEGATIVE CONTROL: …and it defeats the restored stamp too',
          !!badR && badR.s._lockedModel === 'claude-opus-4-8' && badR.link === 'fish',
          badR ? badR.link + ' | ' + String(badR.s._lockedModel) : 'no world');
      }
    }
  }
}

// ═══ §12 (r3-r2) A LOCK TARGET THAT *IS* THE STANDING REROUTE IS NOT A REQUEST
// The belt, and it is not decoration: §11 closed the latch, but ws-handler's
// `set-model {lock:true}` with no `lockModel` ALSO adopts `session._servedModel`
// (the UI row it serves says "Lock to this model" about the model on screen),
// and a session-meta written by any build with an ungated latch carries the
// substitute forever. A rung that decides money may not depend on every writer
// of a field being careful — so the rung itself refuses a target that is the
// model we are being rerouted TO.
console.log('— §12 (r3-r2) the lock rung refuses a target that is the reroute');
{
  const FB = { from: 'claude-fable-5-1', to: 'claude-opus-4-8', at: Date.now() - 60000 };
  /** one world per shape — `maybePoolAutoSwitchForPool` evaluates EVERY session
   *  in the pool, so sharing one world would let these legs move each other. */
  const drive = (fields, { engineModule = engMod } = {}) => {
    const world = mkWorld({ engineModule });
    if (!world) return null;
    const s = world.mkSession('sess-belt', 'personal', { _spawnModel: 'claude-fable-5-1[1m]', ...fields });
    const model = world.eng.sessionModelFor(s);
    const cap = quiet(); world.eng.maybePoolAutoSwitchForPool(world.P); cap.done();
    return { world, s, model, fam: world.eng.projectionFamilyFor(s, model), link: world.linkOf('sess-belt'), notices: world.notices };
  };
  const WS_ADOPTED = { _modelLocked: true, _lockedModel: 'claude-opus-4-8', _servedModel: 'claude-opus-4-8', _servedModelAt: Date.now(), _servedViaFallback: FB };
  const a = drive(WS_ADOPTED);
  if (!a) { ok('§12 SKIP — pools unsupported', true); }
  else {
    ok('§12 THE FIX: a lock target that IS the reroute target does not define the session',
      a.model === 'claude-fable-5-1[1m]' && a.fam === null, JSON.stringify({ model: a.model, fam: a.fam }));
    ok('§12 …so the conversation is not moved onto a Fable-dead member',
      a.link === 'personal' && a.notices.length === 0, a.link + ' | ' + JSON.stringify(a.notices).slice(0, 160));
    // the same, spelled as the bare alias the status bar can send
    const b = drive({ ...WS_ADOPTED, _lockedModel: 'opus' });
    ok('§12 …and the alias spelling is the same target (`modelsMatch`, not string equality)',
      b.model === 'claude-fable-5-1[1m]' && b.link === 'personal', JSON.stringify({ model: b.model, link: b.link }));
    // CONTROL: a REAL lock still speaks — the belt is about the target BEING
    // the substitute, never about a reroute being on record.
    const c = drive({ ...WS_ADOPTED, _lockedModel: 'fable[1m]' });
    ok('§12 CONTROL: a real lock whose target is NOT the reroute still speaks (§7 intact)',
      c.model === 'fable[1m]' && c.link === 'personal', JSON.stringify({ model: c.model, link: c.link }));
    // CONTROL: the same target with NO reroute standing is an ordinary user
    // lock to opus, and it must still place the conversation on opus quota.
    const d = drive({ _modelLocked: true, _lockedModel: 'claude-opus-4-8', _servedModel: 'claude-opus-4-8', _servedModelAt: Date.now() });
    ok('§12 CONTROL: a user lock to opus with no reroute standing still defines the session',
      d.model === 'claude-opus-4-8' && d.fam === 'opus', JSON.stringify({ model: d.model, fam: d.fam }));
    ok('§12 CONTROL: …and is placed on its own family\'s quota', d.link === 'fish', d.link);

    // NEGATIVE CONTROL: the belt clause reverted, nothing else.
    const mut = mutate('src/server/usage-pool-engine.js', 'belt', [R3R2_BELT_PATCH]);
    ok('§12 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const bad = drive(WS_ADOPTED, { engineModule: mut.mod });
      ok('§12 NEGATIVE CONTROL: without the belt the adopted substitute defines the session',
        bad.model === 'claude-opus-4-8' && bad.fam === 'opus', JSON.stringify({ model: bad.model, fam: bad.fam }));
      ok('§12 NEGATIVE CONTROL: …and the pool moves it onto the Fable-dead member',
        bad.link === 'fish', bad.link);
    }
    // …and the belt gives back exactly r2's answer for this shape, so it
    // RESTORES a behaviour rather than inventing one (r2 had no lock rung, so
    // its ladder fell to served-refused → picked → spawn).
    const mutR2 = mutate('src/server/usage-pool-engine.js', 'nolock', [R2_LOCK_PATCHES[0]]);
    ok('§12 the r2 control applied', mutR2.hit === true, mutR2.why || '');
    if (mutR2.hit) {
      const r2ish = drive(WS_ADOPTED, { engineModule: mutR2.mod });
      ok('§12 …and the belt\'s answer is r2\'s answer for this shape (restored, not invented)',
        r2ish.model === a.model && r2ish.link === a.link, JSON.stringify({ r2: r2ish.model + '/' + r2ish.link, now: a.model + '/' + a.link }));
    }
  }
}

// ── §12b THE CENSUS: every server-side writer of `_lockedModel` ─────────────
// `_lockedModel` decides PLACEMENT since §7, so "who may write it" became a
// money question. A count would pass a fourth adoption site; this DERIVES the
// sites from the source and classifies each one, printed. An unclassified
// writer goes red, and so does a row that describes a site nobody has.
{
  const FILES = ['src/ws-create.js', 'src/ws-handler.js', 'src/server/boot-restore.js',
    'src/server/stdout/claude-stream-json.js', 'src/server/usage-pool-engine.js', 'src/session-schema.js'];
  // (src/lib/ is the CLIENT's own mirror — a different object in a different
  //  process; it can never define this server's placement.)
  const ALLOW = [
    { file: 'src/ws-create.js', has: 'data.modelLock ?', why: 'the REQUEST: the spawn asks for it (lockModel, else the spawn model, else target-less)' },
    { file: 'src/ws-handler.js', has: 'data.lock ?', why: 'ADOPTS _servedModel when the client sends no lockModel — covered by §12\'s belt, which refuses a target that is the standing reroute' },
    { file: 'src/ws-handler.js', has: '= data.model;', why: 'the REQUEST: a pick while locked re-targets the lock (§7b pins it)' },
    { file: 'src/server/boot-restore.js', has: 'meta.lockedModel', why: 'restores what one of the writers above wrote' },
    { file: 'src/server/stdout/claude-stream-json.js', has: '= session._servedModel;', why: 'the target-less latch — GATED on servedDefinesModel (§11)' },
    { file: 'src/server/stdout/claude-stream-json.js', has: '= em[1];', why: 'refines the SAME model to its full id, gated on modelsMatch — never another model' },
    { file: 'src/session-schema.js', has: 'owner:', why: 'the schema ROW, not a write' },
  ];
  const sites = [];
  for (const f of FILES) {
    const lines = fs.readFileSync(path.join(REPO, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/^(\s*)\/\/.*$/, '$1');   // a whole-line comment is not code
      if (!/_lockedModel\s*[=:]/.test(code)) return;
      if (/_lockedModel\s*[=!]==/.test(code)) return;      // a comparison, not a write
      sites.push({ at: `${f}:${i + 1}`, file: f, text: code.trim() });
    });
  }
  ok('§12b the writer set is derived from the source and is not empty', sites.length >= 6, String(sites.length));
  const unknown = [];
  for (const s of sites) {
    const row = ALLOW.find((a) => a.file === s.file && s.text.includes(a.has));
    if (!row) unknown.push(s.at + '  ' + s.text.slice(0, 90));
    console.log(`    [census] ${s.at}  ${row ? '✓ ' + row.why : '✗ UNCLASSIFIED'}`);
  }
  ok('§12b THE CENSUS: every writer of `_lockedModel` is classified',
    unknown.length === 0, JSON.stringify(unknown).slice(0, 300));
  const dead = ALLOW.filter((a) => !sites.some((s) => s.file === a.file && s.text.includes(a.has)));
  ok('§12b …and no row describes a site that no longer exists',
    dead.length === 0, JSON.stringify(dead.map((d) => d.file + ' ' + d.has)));
  ok('§12b NEGATIVE CONTROL: a new adoption site matches no row',
    !ALLOW.some((a) => 'session._lockedModel = someNewFact;'.includes(a.has)));
}

// ═══ §13 (r3-r2) WHAT A STALE REROUTE STAMP ACTUALLY COSTS ══════════════════
// The round-3 verifier's LOW finding, and it is a CLAIM defect, not a code one:
// the `_servedViaFallback` row promised that a stale stamp "costs only
// CONSERVATISM". Measured on the real engine + real pool: a null projection
// makes EVERY bucket count, and that can also REFUSE A MOVE OFF a member whose
// 5h is 100 % spent, because the free member beside it has a spent Opus cap
// that an unprojected session still counts. It never authorises a billed turn
// (the direction that costs money) and it self-heals at the first main-thread
// record served by anything else — but the row has to SAY so. r2 strands on the
// identical fixture, so §8 did not introduce this; it only made the state
// survive a restart instead of being cleared by one.
console.log('— §13 (r3-r2) what a stale reroute stamp actually costs');
{
  // The current member is HARD-dead on 5h; the escape is free on 5h and Fable
  // but its OPUS cap is spent, so only an UNPROJECTED session counts it.
  const roster = [
    { tag: 'cur', name: 'Cur', u5: 1.00, u7: 0.40, fable: 0.30, opus: 0.30, hoursOut: 40 },
    { tag: 'esc', name: 'Esc', u5: 0.05, u7: 0.20, fable: 0.10, opus: 1.00, hoursOut: 40 },
  ];
  const STALE = { _servedViaFallback: { from: 'claude-fable-5-1', to: 'claude-opus-4-8', at: Date.now() - 3600e3 } };
  const drive = (fields, { engineModule = engMod } = {}) => {
    const world = mkWorld({ roster, engineModule });
    if (!world) return null;
    const s = world.mkSession('sess-stale', 'cur', { _spawnModel: 'claude-fable-5-1[1m]', ...fields });
    const model = world.eng.sessionModelFor(s);
    const cap = quiet(); world.eng.maybePoolAutoSwitchForPool(world.P); cap.done();
    const capv = quiet();
    let v = null; try { v = world.eng.quotaVerdictFor(world.P, { model, session: s }); } catch (e) { v = { err: e.message }; }
    capv.done();
    return { world, s, model, fam: world.eng.projectionFamilyFor(s, model), link: world.linkOf('sess-stale'), usable: v && v.usable, notices: world.notices };
  };
  const free = drive({});
  if (!free) { ok('§13 SKIP — pools unsupported', true); }
  else {
    ok('§13 setup: with no stamp the session projects fable and escapes the 5h-dead member',
      free.fam === 'fable' && free.link === 'esc' && free.usable === true,
      JSON.stringify({ fam: free.fam, link: free.link, usable: free.usable }));
    const stale = drive(STALE);
    ok('§13 THE MEASUREMENT: a stale stamp makes the projection null…',
      stale.fam === null && stale.model === 'claude-fable-5-1[1m]', JSON.stringify({ fam: stale.fam, model: stale.model }));
    ok('§13 …and every bucket counting can REFUSE A MOVE OFF a 5h-spent member',
      stale.link === 'cur' && stale.usable === false, JSON.stringify({ link: stale.link, usable: stale.usable }));
    ok('§13 …and the refusal SPEAKS — it names the bucket that blocked it (§6)',
      stale.notices.some((n) => /no member can serve it/.test(n) && /5h/.test(n)), JSON.stringify(stale.notices).slice(0, 240));
    // NOT A REGRESSION: r2 strands on the identical fixture (this session is
    // unlocked, so the lock rung is not what decides it either way).
    const mut = mutate('src/server/usage-pool-engine.js', 'stale-r2', [R2_LOCK_PATCHES[0]]);
    ok('§13 the r2 control applied', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const r2 = drive(STALE, { engineModule: mut.mod });
      ok('§13 CONTROL: r2 strands on the same fixture — the stamp is not a regression, only a claim',
        r2.link === 'cur' && r2.usable === false, JSON.stringify({ link: r2.link, usable: r2.usable }));
    }
    // …and it SELF-HEALS at one main-thread record served by anything else.
    stale.world.eng.noteServedModel(stale.s, 'claude-fable-5-1');
    const healedFam = stale.world.eng.projectionFamilyFor(stale.s, stale.world.eng.sessionModelFor(stale.s));
    ok('§13 …and one record served by anything else retires it',
      stale.s._servedViaFallback === null && healedFam === 'fable',
      JSON.stringify({ fb: stale.s._servedViaFallback, fam: healedFam }));
    const cap = quiet(); stale.world.eng.maybePoolAutoSwitchForPool(stale.world.P); cap.done();
    ok('§13 …and the conversation then escapes the spent member',
      stale.world.linkOf('sess-stale') === 'esc', stale.world.linkOf('sess-stale'));

    // THE CLAIM ITSELF. The schema row and the engine essay are what the next
    // round reads; a sentence that promises less than the measurement is how a
    // row stays "closed" while the behaviour surprises somebody.
    const schema = fs.readFileSync(path.join(REPO, 'src/session-schema.js'), 'utf8');
    const row = /_servedViaFallback:.*\n/.exec(schema)?.[0] || '';
    ok('§13 the schema row exists and no longer promises that a stale stamp costs only conservatism',
      row.length > 400 && !/costs only CONSERVATISM/.test(row), String(row.length));
    ok('§13 …and it names what a null projection can actually refuse',
      /refuse a move OFF/.test(row), row.slice(-260));
    const engSrc = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
    ok('§13 …and the engine essay says the same thing (one claim, not two)',
      /refuse a move OFF/.test(engSrc) && !/COSTS CONSERVATISM, NEVER MONEY/.test(engSrc));
  }
}

// ═══ §14 (r4) THE FACT IS PLACED BEFORE ITS READERS ════════════════════════
// The round-3 verifier's HIGH, reproduced on the REAL pipeline (session-stdout
// → the registry → claude-stream-json) on a fake pty + the real engine + the
// real pool + real credential symlinks, before anything changed.
//
// §11 gated the target-less lock latch on `servedDefinesModel` — and asks it
// AFTER `noteServedModel`, which is right for the shape §11 drove (a reroute
// announced by a SEPARATE `system/model_refusal_fallback` record that arrives
// FIRST). The incident's own transcript has the other shape, and it is the
// FIRST announcement: the `fallback` CONTENT BLOCK rides the assistant message
// whose own `message.model` IS the substitute — ONE record carrying both facts
// — while the content-block loop that stamps the reroute sits ~50 lines BELOW
// the served capture. So the gate asks a question whose answer has not been
// written yet: no stamp ⇒ `servedDefinesModel` says yes ⇒ the lock latches
// `claude-opus-4-8` and WRITES IT TO SESSION-META, where it is permanent.
// MEASURED on the frozen transcript: the block is at 04:42:45.234Z and the
// system record 51 s later at 04:43:36.398Z, so for 51 seconds the only thing
// on the wire that said "rerouted" was inside the very record that answered.
console.log('— §14 (r4) the reroute a record announces is stamped before it is read');

// THE PRODUCTION RECORD, structural fields only (scripts/fixtures/
// claude-fallback-block-record.json, copied from the incident's frozen
// transcript — the owner's cwd/sessionId/branch/slug/parentUuid and the real
// `usage` block stripped; nothing the consumers read was changed).
const FROZEN_FALLBACK = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/claude-fallback-block-record.json'), 'utf8'));
{
  ok('§14 the fixture is ONE record that both announces the reroute AND is served by its target',
    FROZEN_FALLBACK.type === 'assistant' && FROZEN_FALLBACK.isSidechain === false
    && FROZEN_FALLBACK.message.model === 'claude-opus-4-8'
    && FROZEN_FALLBACK.message.content.some((b) => b.type === 'fallback' && b.from?.model === 'claude-fable-5-1' && b.to?.model === 'claude-opus-4-8'),
    JSON.stringify(FROZEN_FALLBACK.message).slice(0, 200));
  ok('§14 …and it carries no owner content (only the fields the consumers read)',
    !('cwd' in FROZEN_FALLBACK) && !('sessionId' in FROZEN_FALLBACK) && !('gitBranch' in FROZEN_FALLBACK)
    && !('usage' in FROZEN_FALLBACK.message), Object.keys(FROZEN_FALLBACK).join(','));
}

/** Drive records through the REAL pipeline on a target-less locked session
 *  (the §11 shape: ws-create's `modelLock` with no `lockModel`). */
function playRecords(records, { stdoutModule = null, engineModule = engMod, roster = MEMBERS, member = 'personal', sameDeadline = false } = {}) {
  const w = mkWorld({ engineModule, roster, sameDeadline });
  if (!w) return null;
  const { so } = mkStdout(w, { stdoutModule });
  w.setMetaStore({ readSessionMeta: so.readSessionMeta, writeSessionMeta: so.writeSessionMeta });
  const sid = 'sess-frozen';
  const s = w.mkSession(sid, member, {
    _spawnModel: 'claude-fable-5-1[1m]', _modelLocked: true, _lockedModel: null,
  });
  s._normalizer = createMessageManager('claude', sid);
  const pty = mkPty();
  so.setupSessionPty(s, sid, pty);
  const cap = quiet();
  for (const r of records) pty.data(JSON.stringify(r) + '\n');
  const fed = cap.done();
  const cap2 = quiet();
  w.eng.maybePoolAutoSwitchForPool(w.P);
  const lines = cap2.done();
  let meta = null; try { meta = so.readSessionMeta(s.sockName); } catch { }
  const model = w.eng.sessionModelFor(s);
  return {
    w, s, so, meta, model, fed, lines, fam: w.eng.projectionFamilyFor(s, model), link: w.linkOf(sid),
    cache: w.readCache(w.id[member]),
    switches: lines.filter((l) => /per-session switch/.test(l)),
  };
}
{
  const r = playRecords([FROZEN_FALLBACK]);
  if (!r) { ok('§14 SKIP — pools unsupported on this platform', true); }
  else {
    ok('§14 setup: the ONE record really did place the reroute on the session',
      r.s._servedViaFallback?.to === 'claude-opus-4-8' && r.s._servedViaFallback?.from === 'claude-fable-5-1',
      JSON.stringify(r.s._servedViaFallback));
    ok('§14 setup: …and the substitute really is what answered',
      r.s._servedModel === 'claude-opus-4-8', String(r.s._servedModel));
    ok('§14 THE FIX: the lock stays target-less — the record that announces a reroute never latches',
      r.s._lockedModel === null, String(r.s._lockedModel));
    ok('§14 …and nothing reached session-meta, where it would be permanent',
      !r.meta || r.meta.lockedModel == null, JSON.stringify(r.meta && r.meta.lockedModel));
    ok('§14 …so the session states the model it is asking FOR',
      r.model === 'claude-fable-5-1[1m]', String(r.model));
    ok('§14 …and the projection is null — the reroute stands, so every bucket counts',
      r.fam === null, String(r.fam));
    ok('§14 THE INCIDENT: the conversation stays on the only member that still has Fable',
      r.link === 'personal', r.link + ' | ' + r.switches.join(' | ').slice(0, 200));
    ok('§14 …and nothing was announced to the owner', r.w.notices.length === 0, JSON.stringify(r.w.notices).slice(0, 200));
  }
}

// ── §14b THE DOWNSTREAM HARM: the lane the next rejection lands on ──────────
// The latch's write is PERMANENT (session-meta), so it outlives the reroute it
// was taken from. The stamp self-heals at the first record served by anything
// else — and that record is exactly what makes the bad lock VISIBLE, because
// with the stamp gone §12's belt has nothing to refuse and the lock rung
// answers `claude-opus-4-8`. `laneByEvidence` then asks for THAT family's cap,
// finds none on the member, and files a Fable rejection against the PLAN week
// — the incident's §2 harm, false for 12-60 h and evicting every other
// conversation on that member.
const NO_BANNER_REJECT = (resetsAt, u7) => ({
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'rejected', rateLimitType: 'seven_day', resetsAt, resets_at: resetsAt,
    overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { seven_day: { utilization: u7, resetsAt } },
  },
});
const SERVED_BY_FABLE = { type: 'assistant', message: { id: 'msg_after', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'back on fable' }] } };
// The member the conversation is parked on: plan week alive (0.65), its Fable
// cap spent — the incident's own member. `sameDeadline` keeps the EDF proactive
// tier structurally silent, so the ONLY thing under test is the lane.
function playLane({ stdoutModule = null, engineModule = engMod } = {}) {
  const w = mkWorld({ engineModule, sameDeadline: true });
  if (!w) return null;
  const { so } = mkStdout(w, { stdoutModule });
  w.setMetaStore({ readSessionMeta: so.readSessionMeta, writeSessionMeta: so.writeSessionMeta });
  const sid = 'sess-frozen';
  const s = w.mkSession(sid, 'wmax', { _spawnModel: 'claude-fable-5-1[1m]', _modelLocked: true, _lockedModel: null });
  s._normalizer = createMessageManager('claude', sid);
  const pty = mkPty();
  so.setupSessionPty(s, sid, pty);
  const RESET = w.resets.wmax;
  const cap = quiet();
  pty.data(JSON.stringify(FROZEN_FALLBACK) + '\n');                       // ① the reroute + the substitute, ONE record
  pty.data(JSON.stringify(SERVED_BY_FABLE) + '\n');                       // ② the reroute is over — the stamp retires
  pty.data(JSON.stringify(NO_BANNER_REJECT(RESET, 0.65)) + '\n');         // ③ the Fable cap refuses the turn, UNSCOPED, no banner
  pty.data(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'cid-' + sid }) + '\n');
  const lines = cap.done();
  return { w, s, so, lines, model: w.eng.sessionModelFor(s), cache: w.readCache(w.id.wmax), meta: so.readSessionMeta(s.sockName) };
}
{
  const r = playLane();
  if (!r) { ok('§14b SKIP — pools unsupported', true); }
  else {
    const fable = (r.cache.scopedWeekly || []).find((b) => /fable/i.test(b.name || ''));
    ok('§14b setup: the reroute retired at the record served by something else',
      r.s._servedViaFallback === null && r.s._servedModel === 'claude-fable-5-1', JSON.stringify(r.s._servedViaFallback));
    ok('§14b THE FIX: the lock never took the substitute, so the session still states the REQUEST model',
      r.s._lockedModel === 'claude-fable-5-1' && r.model === 'claude-fable-5-1',
      JSON.stringify({ locked: r.s._lockedModel, model: r.model }));
    ok('§14b …so the rejection lands on the FABLE cap',
      !!fable && fable.utilization === 1 && fable.status === 'limited', JSON.stringify(fable));
    ok('§14b …and the PLAN week is untouched',
      Math.abs(r.cache.sevenDay.utilization - 0.65) < 1e-9 && r.cache.sevenDay.status !== 'limited', JSON.stringify(r.cache.sevenDay));
    ok('§14b …and the journal says the model cap decided it',
      r.lines.some((l) => /\[wall\] demoted/.test(l) && /fable/i.test(l)),
      r.lines.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 260));
  }
}

// ── §14c TWO INDEPENDENT PROTECTIONS, TWO CONTROLS ──────────────────────────
// The ORDER (the fact is placed before its readers) and the BELT (a record that
// announces a reroute never latches, whatever the stamp says) each refuse this
// record on their own — that is the point of having both, and it is why each
// needs its own single-mechanism control. They are not redundant in the way a
// duplicated check is: the ORDER is a property of THIS function's statement
// order, one refactor away from being lost; the BELT is a property of the
// RECORD and survives any re-ordering. Only reverting BOTH reproduces the
// shipped defect — which is exactly what a defence-in-depth claim has to prove.
console.log('— §14c the order and the belt each hold alone; only both reverted reproduces it');
/** Chain a patched consumer through the REAL registry + session-stdout, so the
 *  control runs inside the real pipeline rather than a re-implementation. */
function chainConsumer(tag, replacements) {
  const mutC = mutate('src/server/stdout/claude-stream-json.js', tag, replacements);
  if (!mutC.hit) return { hit: false, why: mutC.why };
  const mutI = mutate('src/server/stdout/index.js', tag + 'reg', [[
    "'stream-json': require('./claude-stream-json.js'),",
    `'stream-json': require('./${path.basename(mutC.file)}'),`,
  ]]);
  if (!mutI.hit) return { hit: false, why: 'registry patch missed' };
  const mutS = mutate('src/server/session-stdout.js', tag + 'so', [[
    "require('./stdout/index.js')",
    `require('./stdout/${path.basename(mutI.file)}')`,
  ]]);
  if (!mutS.hit) return { hit: false, why: 'session-stdout patch missed' };
  return { hit: true, mod: mutS.mod };
}
const R4_ORDER_PATCH = [
  '            const announced = rerouteAnnouncedBy(msg);\n'
  + '            if (announced) noteModelFallback(session, announced.from, announced.to);\n',
  '            const announced = rerouteAnnouncedBy(msg); // PRE-FIX (r4): the fact is NOT placed before its readers\n',
];
const R4_BELT_PATCH = [
  'if (session._modelLocked && !session._lockedModel && !announced && servedDefinesModel(session)) {',
  'if (session._modelLocked && !session._lockedModel && servedDefinesModel(session)) { // PRE-FIX (r4): the belt is gone',
];
{
  // (a) ORDER reverted, BELT intact.
  const a = chainConsumer('r4order', [R4_ORDER_PATCH]);
  ok('§14c the ORDER-only patch hit the consumer', a.hit === true, a.why || '');
  if (a.hit) {
    const r = playRecords([FROZEN_FALLBACK], { stdoutModule: a.mod });
    ok('§14c CONTROL: with the order reverted the BELT alone still refuses the latch',
      !!r && r.s._lockedModel === null && (!r.meta || r.meta.lockedModel == null),
      r ? JSON.stringify({ locked: r.s._lockedModel, meta: r.meta && r.meta.lockedModel }) : 'no world');
    ok('§14c …and the reroute is still on the session (the LATER stamp is a real belt, not decoration)',
      !!r && r.s._servedViaFallback?.to === 'claude-opus-4-8', r ? JSON.stringify(r.s._servedViaFallback) : '');
  }
  // (b) BELT reverted, ORDER intact.
  const b = chainConsumer('r4belt', [R4_BELT_PATCH]);
  ok('§14c the BELT-only patch hit the consumer', b.hit === true, b.why || '');
  if (b.hit) {
    const r = playRecords([FROZEN_FALLBACK], { stdoutModule: b.mod });
    ok('§14c CONTROL: with the belt reverted the ORDER alone still refuses the latch',
      !!r && r.s._lockedModel === null && (!r.meta || r.meta.lockedModel == null),
      r ? JSON.stringify({ locked: r.s._lockedModel, meta: r.meta && r.meta.lockedModel }) : 'no world');
  }
  // (c) BOTH reverted = the shipped bytes. THE DEFECT, end to end.
  const c = chainConsumer('r4both', [R4_ORDER_PATCH, R4_BELT_PATCH]);
  ok('§14c the BOTH-reverted patch hit the consumer', c.hit === true, c.why || '');
  if (c.hit) {
    const r = playRecords([FROZEN_FALLBACK], { stdoutModule: c.mod });
    ok('§14c NEGATIVE CONTROL: the shipped shape latches the classifier\'s substitute',
      !!r && r.s._lockedModel === 'claude-opus-4-8', r ? String(r.s._lockedModel) : 'no world');
    ok('§14c NEGATIVE CONTROL: …and writes it to session-meta, where it is permanent',
      !!r && !!r.meta && r.meta.lockedModel === 'claude-opus-4-8', r ? JSON.stringify(r.meta && r.meta.lockedModel) : '');
    // …and the permanent write outlives the reroute it was taken from: once the
    // stamp retires, §12's belt has nothing to refuse and the Fable rejection
    // lands on the PLAN week — the incident's §2 harm, from ONE record.
    const lane = playLane({ stdoutModule: c.mod });
    const fable = lane && (lane.cache.scopedWeekly || []).find((bk) => /fable/i.test(bk.name || ''));
    ok('§14c NEGATIVE CONTROL: …so the session states the substitute for the rest of its life',
      !!lane && lane.model === 'claude-opus-4-8', lane ? String(lane.model) : '');
    ok('§14c NEGATIVE CONTROL: …and the Fable rejection falsely marks the PLAN week spent',
      !!lane && lane.cache.sevenDay.utilization === 1 && lane.cache.sevenDay.status === 'limited',
      lane ? JSON.stringify(lane.cache.sevenDay) : '');
    ok('§14c NEGATIVE CONTROL: …while the cap that actually refused the turn is never marked',
      !!fable && fable.status !== 'limited', JSON.stringify(fable));
  }
}

// ── §14d THE CONTROLS THIS FIX MUST NOT BREAK ───────────────────────────────
{
  // A SIDECHAIN record carrying a fallback block stamps NOTHING — a subagent's
  // reroute says nothing about what the main thread is requesting, and the rule
  // lives inside `rerouteAnnouncedBy` so neither feed can get it wrong.
  const side = { ...FROZEN_FALLBACK, isSidechain: true, uuid: 'sidechain-1', message: { ...FROZEN_FALLBACK.message, id: 'msg_side' } };
  const r = playRecords([side]);
  if (!r) { ok('§14d SKIP — pools unsupported', true); }
  else {
    ok('§14d CONTROL: a SIDECHAIN record carrying a fallback block stamps nothing',
      r.s._servedViaFallback == null, JSON.stringify(r.s._servedViaFallback));
    ok('§14d …and states no served model either (the whole branch is main-thread only)',
      r.s._servedModel === undefined, String(r.s._servedModel));
  }
  // …and the rule ITSELF, over the shapes the wire produces. It is the ENGINE's
  // (both feeds ask this one function), so it is read off a real engine.
  const ra = r ? r.w.eng.rerouteAnnouncedBy : null;
  if (!ra) { ok('§14d SKIP — no engine (pools unsupported)', true); }
  else {
    ok('§14d CONTROL: the pure rule refuses a sidechain and a parent_tool_use_id record',
      ra(side) === null && ra({ ...FROZEN_FALLBACK, parent_tool_use_id: 'tu_1' }) === null
      && ra(FROZEN_FALLBACK)?.to === 'claude-opus-4-8' && ra(FROZEN_FALLBACK)?.from === 'claude-fable-5-1');
    ok('§14d CONTROL: …and a record with no fallback block, a non-assistant record and junk are all null',
      ra(SERVED_BY_FABLE) === null
      && ra({ type: 'system', subtype: 'model_refusal_fallback' }) === null
      && ra(null) === null
      && ra({ type: 'assistant', message: { content: [{ type: 'fallback', from: { model: 'a' } }] } }) === null);
  }
}

// ── §14e THE TWIN: the device feed does it too, through its OWN entry point ──
// `claudeSideEffects` is the other implementation of these families, and it has
// no latch — but it has the same two readers in the same order, so the same
// record would have retired nothing and stamped late. Driven through the REAL
// session-brain factory over the REAL engine.
{
  const w = mkWorld();
  if (!w) { ok('§14e SKIP — pools unsupported', true); }
  else {
    const brain = require(path.join(REPO, 'src/server/session-brain.js')).create({
      engine: w.eng, applyTaskToolUpdate() { }, updateSessionTodos() { },
      getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }),
    });
    const s = w.mkSession('sess-dark', 'personal', { _spawnModel: 'claude-fable-5-1[1m]', _modelLocked: true, _lockedModel: null });
    const cap = quiet();
    brain.claudeSideEffects(s, 'sess-dark', FROZEN_FALLBACK);
    cap.done();
    ok('§14e the device feed stamps the reroute the record announces',
      s._servedViaFallback?.to === 'claude-opus-4-8' && s._servedViaFallback?.from === 'claude-fable-5-1',
      JSON.stringify(s._servedViaFallback));
    ok('§14e …and the session still states the model it is asking FOR',
      w.eng.sessionModelFor(s) === 'claude-fable-5-1[1m]' && w.eng.projectionFamilyFor(s, w.eng.sessionModelFor(s)) === null,
      String(w.eng.sessionModelFor(s)));
    // CONTROL: a sidechain reaching the device feed stamps nothing either.
    const s2 = w.mkSession('sess-dark2', 'personal', { _spawnModel: 'claude-fable-5-1[1m]' });
    const cap2 = quiet();
    brain.claudeSideEffects(s2, 'sess-dark2', { ...FROZEN_FALLBACK, isSidechain: true });
    cap2.done();
    ok('§14e CONTROL: a sidechain record stamps nothing on the device feed',
      s2._servedViaFallback == null && s2._servedModel === undefined, JSON.stringify(s2._servedViaFallback));
  }
}

// ── §14f THE CENSUS: the stamp precedes the served capture, in EVERY file ────
// DERIVED, not typed: every file under src/ that CALLS `noteServedModel(` (the
// engine's own `function noteServedModel` definition is not a call) must ask
// `rerouteAnnouncedBy` and stamp through `noteModelFallback` BEFORE it, inside
// the same statement neighbourhood. A third stdout feed that captures a served
// model and forgets the order fails HERE instead of shipping the incident.
{
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/^(node_modules)$/.test(e.name)) walk(fp); }
      else if (e.name.endsWith('.js') && !/^vs-fable-mut-/.test(e.name)) files.push(fp);
    }
  };
  walk(path.join(REPO, 'src'));
  /** A CENSUS READS CODE. Comments are blanked to SPACES (length-preserving, so
   *  every index below still points at the real source) before anything is
   *  matched — the fix's own comments name `noteServedModel(` and
   *  `rerouteAnnouncedBy` on purpose, and a census that counted those would
   *  report a phantom capture site with no ask above it (measured: it did, the
   *  moment the twin's comment was written). Blanking can only ever REMOVE a
   *  candidate, and a real call never lives in a comment. */
  const blankComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  /** A file's served-model CALL sites, and the gap to the stamp above each. */
  const sitesIn = (raw) => {
    const src = blankComments(raw);
    const out = [];
    const re = /noteServedModel\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      // the engine DEFINES it; a definition is not a capture
      if (/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
      const before = src.slice(0, m.index);
      const ask = before.lastIndexOf('rerouteAnnouncedBy(');
      const stamp = before.lastIndexOf('noteModelFallback(');
      out.push({ at: m.index, askGap: ask < 0 ? null : m.index - ask, stampGap: stamp < 0 ? null : m.index - stamp });
    }
    return out;
  };
  const rows = [];
  for (const fp of files) {
    const src = fs.readFileSync(fp, 'utf8');
    const sites = sitesIn(src);
    if (sites.length) rows.push({ file: path.relative(REPO, fp), sites });
  }
  // The bound is MEASURED off the real code and printed, never guessed.
  const gaps = rows.flatMap((r) => r.sites.map((s) => Math.max(s.askGap ?? 1e9, s.stampGap ?? 1e9)));
  const WINDOW = 1200;
  for (const r of rows) console.log(`    [census] ${r.file}: ${r.sites.length} served-model capture(s), gaps ${JSON.stringify(r.sites.map((s) => [s.askGap, s.stampGap]))}`);
  ok('§14f the census found BOTH feeds (a derived set, printed above)',
    rows.length === 2
    && rows.some((r) => r.file === 'src/server/stdout/claude-stream-json.js')
    && rows.some((r) => r.file === 'src/server/session-brain.js'),
    JSON.stringify(rows.map((r) => r.file)));
  ok('§14f THE RULE: every served-model capture is preceded by the ask AND the stamp',
    rows.length > 0 && rows.every((r) => r.sites.every((s) => s.askGap != null && s.stampGap != null && s.askGap <= WINDOW && s.stampGap <= WINDOW)),
    JSON.stringify(gaps));
  ok('§14f …and the measured gaps are well inside the window (the bound is measured, not guessed)',
    gaps.length > 0 && Math.max(...gaps) < WINDOW, `max gap ${Math.max(...gaps)} of ${WINDOW}`);
  // NEGATIVE CONTROLS on scratch sources — a file that captures without asking,
  // and one that stamps AFTER (the shipped defect's exact shape).
  const NO_ASK = 'function f(session, msg) {\n  noteServedModel(session, msg.message.model);\n}\n';
  const AFTER = 'function f(session, msg) {\n  noteServedModel(session, msg.message.model);\n'
    + '  for (const b of msg.message.content) if (b.type === "fallback") noteModelFallback(session, b.from.model, b.to.model);\n}\n';
  const okFile = 'function f(session, msg) {\n  const a = rerouteAnnouncedBy(msg);\n  if (a) noteModelFallback(session, a.from, a.to);\n  noteServedModel(session, msg.message.model);\n}\n';
  const verdict = (src) => sitesIn(src).every((s) => s.askGap != null && s.stampGap != null && s.askGap <= WINDOW && s.stampGap <= WINDOW);
  ok('§14f NEGATIVE CONTROL: a capture with no ask above it FAILS the rule', verdict(NO_ASK) === false);
  ok('§14f NEGATIVE CONTROL: a capture whose stamp comes AFTER it FAILS the rule (the shipped shape)', verdict(AFTER) === false);
  ok('§14f POSITIVE CONTROL: the fixed shape PASSES (the rule is satisfiable, not a tautology)', verdict(okFile) === true);
  ok('§14f POSITIVE CONTROL: the engine\'s own `function noteServedModel` is not counted as a capture',
    sitesIn('function noteServedModel(session, model) {\n  session._servedModel = model;\n}\n').length === 0);
  // A CENSUS READS CODE (the shape that bit this very branch: the twin's own
  // comment names both `noteServedModel(` and `rerouteAnnouncedBy`, and an
  // unblanked census reported a third capture site with no ask above it).
  ok('§14f NEGATIVE CONTROL: a COMMENT naming the call is not a capture site',
    sitesIn('// see noteServedModel(session, m) and rerouteAnnouncedBy(msg)\nlet x = 1;\n').length === 0);
  ok('§14f NEGATIVE CONTROL: …and a block comment naming it is not either',
    sitesIn('/* noteServedModel(session, m) */\nlet x = 1;\n').length === 0);
  ok('§14f POSITIVE CONTROL: …while a real call BESIDE such a comment is still counted, with its real gaps',
    sitesIn('const a = rerouteAnnouncedBy(msg);\nif (a) noteModelFallback(s, a.from, a.to);\n// noteServedModel(x) in prose\nnoteServedModel(s, m);\n').length === 1);
  ok('§14f …and blanking is LENGTH-PRESERVING, so every measured gap is an index into the REAL source',
    blankComments('// zz\nab').length === '// zz\nab'.length
    && blankComments('/* zz */\nab').length === '/* zz */\nab'.length
    && blankComments('// zz\nab').endsWith('\nab'));
  ok('§14f …and a `://` is NOT a comment (a URL in code must not blank the rest of its line)',
    blankComments('const u = "http://x"; noteServedModel(s, m);').includes('noteServedModel(s, m);'));
}

// ── §15 ONE WALL, ONE LANE — B-ccaa (2026-09-16 11:18:20, reproduced from the telemetry shard) ──
// The production record: `rate-limit-event <member>:sevenDay:rejected:reading`
// (an immediate write — NO `rate-limit-lane-deferred`), then
// `usage-limit-banner-marked <member>:scoped`, then TWO `wall-demote` lines
// (7d, then fable) 2 ms apart, all '1 walls / credential slot'. The only
// kind-sevenDay rejection `laneIsProvisional` declined on a claude session was
// `seven_day_overage_included` — excused from the 2026-09-13 rule as "the weekly
// lane's own accounting". It names no model either; the banner does. Both legs
// below drive the REAL stdout consumer over a fake pty, and each has a PRE-FIX
// control: a patched copy of the engine with exactly the changed line reverted.
{
  const w = mkWorld({ sameDeadline: true });
  if (!w) { ok('§15 SKIP — pools unsupported on this platform', true); }
  else {
    // ① the incident's own shape: an overage-included weekly rejection + the Fable banner + result
    w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    w.mkSession('sess-7', 'wmax', { _spawnModel: 'claude-opus-4-8' });
    const { lines, reset } = playWall(w, { rawType: 'seven_day_overage_included' });
    const c = w.readCache(w.id.wmax);
    const fable = (c.scopedWeekly || []).find((b) => /fable/i.test(b.name || ''));
    const demotions = lines.filter((l) => /\[wall\] demoted/.test(l));
    ok('§15 ① a `seven_day_overage_included` rejection beside a Fable banner marks the FABLE cap only — the plan week still reads what the panel said',
      Math.abs(c.sevenDay.utilization - 0.65) < 1e-9 && c.sevenDay.status !== 'limited' && !!fable && fable.utilization === 1 && fable.resetsAt === reset, JSON.stringify({ sevenDay: c.sevenDay, fable }));
    ok('§15 ① …ONE demotion (the 11:18:20 pair was two)', demotions.length === 1 && /fable/.test(demotions[0]), demotions.join(' | ').slice(0, 220));
    // Since inc-mubu23bd-5vxi the type is the MODEL-CAP lane itself (no
    // deferral): the ladder names the cap by its reset ON ARRIVAL, the banner
    // then marks the same lane, and the journal says which rung decided.
    ok('§15 ① …the journal says the ladder named the cap on arrival (the existing Fable cap shares the reset), and the OPUS conversation on the same member is not bounced',
      lines.some((l) => /model-cap rejection on .* → the Fable model cap \(/.test(l)) && w.linkOf('sess-7') === 'wmax', w.linkOf('sess-7') + ' | ' + lines.filter((l) => /model-cap rejection/.test(l)).join(' | ').slice(0, 200));
    // PRE-FIX CONTROL: the 2.361.2 mapping — the overage-included type IS the
    // weekly lane, written on arrival ⇒ two lanes for one wall (the 11:18:20
    // shape). The patch re-maps the parsed lane at the engine's entry, which
    // is exactly what `parseRateLimitEvent` did before the parse was fixed.
    const mut = mutate('src/server/usage-pool-engine.js', 'ccaa-type', [[
      '    if (ev.modelCap || (ev.windows && ev.windows.modelCap)) ev = nameCap(preKey);\n',
      "    if (ev.modelCap) ev = { ...ev, kind: 'sevenDay', modelCap: false, scopedName: null }; // PRE-FIX (2.361.2): the overage-included type IS the weekly lane, written on arrival\n",
    ]]);
    ok('§15 ① PRE-FIX CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const w2 = mkWorld({ sameDeadline: true, engineModule: mut.mod });
      w2.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
      w2.mkSession('sess-7', 'wmax', { _spawnModel: 'claude-opus-4-8' });
      const r2 = playWall(w2, { rawType: 'seven_day_overage_included' });
      const d2 = r2.lines.filter((l) => /\[wall\] demoted/.test(l));
      ok('§15 ① PRE-FIX CONTROL: without it the plan week is marked spent AND the Fable cap — two demotions for one wall (the 11:18:20 shape)',
        w2.readCache(w2.id.wmax).sevenDay.utilization === 1 && d2.length === 2 && /7d/.test(d2[0]) && /fable/.test(d2[1]), d2.join(' | ').slice(0, 220));
      ok('§15 ① PRE-FIX CONTROL: …and the OPUS conversation is bounced off a member whose plan week is fine', w2.linkOf('sess-7') !== 'wmax', w2.linkOf('sess-7'));
    }

    // ② ORDER MUST NOT MATTER: the banner BEFORE the rejection, on a session
    //    that states NO model (nothing spawned, nothing served yet — the first
    //    turn of a fresh conversation). MEASURED while writing this leg: with a
    //    model stated, the banner's own cache mark (Fable → 100 %) is the very
    //    evidence the turn-end rule reads, so the lane lands on Fable with or
    //    without the memo; with none, the evidence rule's answer is "the plan
    //    lane is the safe default" — and the banner had already marked Fable.
    const playBannerFirst = (ww) => {
      const { so } = mkStdout(ww);
      const s = ww.sessions.get('sess-6');
      s._normalizer = createMessageManager('claude', 'sess-6');
      const pty = mkPty();
      so.setupSessionPty(s, 'sess-6', pty);
      const RESET = ww.resets.wmax;
      const cap = quiet();
      pty.data(JSON.stringify({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: FABLE_BANNER }] } }) + '\n');
      pty.data(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'seven_day', resetsAt: RESET, resets_at: RESET, overageStatus: 'rejected', isUsingOverage: false } }) + '\n');
      pty.data(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'cid-sess-6' }) + '\n');
      return { lines: cap.done(), reset: RESET };
    };
    const w3 = mkWorld({ sameDeadline: true });
    w3.mkSession('sess-6', 'wmax');
    const r3 = playBannerFirst(w3);
    const c3 = w3.readCache(w3.id.wmax);
    const d3 = r3.lines.filter((l) => /\[wall\] demoted/.test(l));
    ok('§15 ② a banner that arrived BEFORE the rejection still decides its lane (the memo): Fable marked, plan untouched, one demotion',
      Math.abs(c3.sevenDay.utilization - 0.65) < 1e-9 && (c3.scopedWeekly || []).some((b) => /fable/i.test(b.name) && b.utilization === 1) && d3.length === 1 && /fable/.test(d3[0]),
      JSON.stringify({ sevenDay: c3.sevenDay, d3 }));
    ok('§15 ② …and the memo dies with the turn', w3.sessions.get('sess-6')._turnBannerLane === null);
    const mut3 = mutate('src/server/usage-pool-engine.js', 'ccaa-memo', [
      ["      if (session._turnBannerLane) { try { laneFromBanner(session, session._turnBannerLane); } catch (e) { console.warn('[wall] lane-from-banner failed:', e.message); } }\n", "      // PRE-FIX (B-ccaa): a banner that came first is forgotten\n"],
      ["  if (session._turnBannerLane) { laneFromBanner(session, session._turnBannerLane); if (!pendingLaneDeferrals(session).length) return; }\n", "  // PRE-FIX (B-ccaa): the settle never consults the banner memo\n"],
    ]);
    ok('§15 ② PRE-FIX CONTROL: the patch hit both memo consults', mut3.hit === true, mut3.why || '');
    if (mut3.hit) {
      const w4 = mkWorld({ sameDeadline: true, engineModule: mut3.mod });
      w4.mkSession('sess-6', 'wmax');
      const r4 = playBannerFirst(w4);
      const d4 = r4.lines.filter((l) => /\[wall\] demoted/.test(l));
      ok('§15 ② PRE-FIX CONTROL: without the memo the evidence rule lands the deferral on the PLAN lane ("states no model") while the banner already marked Fable — two lanes for one wall',
        w4.readCache(w4.id.wmax).sevenDay.utilization === 1 && d4.length === 2 && r4.lines.some((l) => /this session states no model/.test(l)), d4.join(' | ').slice(0, 220) + ' | ' + r4.lines.filter((l) => /unscoped weekly rejection/.test(l)).join(' | ').slice(0, 200));
    }
    // ③ the schema names the memo (test-session-schema fails an unregistered field; this pins the WHY)
    ok('§15 ③ the banner memo is a registered session field, owned by the engine and cleared with the turn pins',
      /_turnBannerLane:\s*\{ owner: 'engine', persisted: null/.test(fs.readFileSync(path.join(REPO, 'src/session-schema.js'), 'utf8'))
      && /session\._turnLaneDefer = null; session\._turnBannerLane = null;/.test(fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8')));
  }
}

console.log('— §16 (r2) a model-cap event after the WEEK ROLLED still names the cap, and never parks an opus session');
// From a weekly reset until the next verified panel the member's stored cap
// carries LAST week's reset; a 2.1.274 event then states THIS week's. The lane
// is the same by PHASE — an absolute compare wrote an un-named placeholder
// beside the stale Fable, and the placeholder (family null) gated EVERY family:
// with a rejection, every opus session on the member read 0 % and was parked.
{
  const w = mkWorld({ sameDeadline: true });
  if (!w) { ok('§16 SKIP — pools unsupported on this platform', true); }
  else {
    const { accountRemaining } = require(path.join(REPO, 'src/account-pool-auto.js'));
    const WEEK = 604800;
    const OLD = w.nowSec - 3600;               // last week's reset, an hour ago — the stored cap still says so
    const NEW = OLD + WEEK;                    // this week's, as the event states it
    const before = w.readCache(w.id.wmax);
    w.writeCache(w.id.wmax, { ...before, sevenDay: { ...before.sevenDay, resetsAt: OLD }, scopedWeekly: [{ name: 'Fable', utilization: 0.80, resetsAt: OLD }] });
    w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
    w.mkSession('sess-7', 'wmax', { _spawnModel: 'claude-opus-4-8' });
    const { so } = mkStdout(w);
    const s = w.sessions.get('sess-6');
    s._normalizer = createMessageManager('claude', 'sess-6');
    const pty = mkPty();
    so.setupSessionPty(s, 'sess-6', pty);
    const cap = quiet();
    pty.data(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: NEW, rateLimitType: 'seven_day_overage_included', overageStatus: 'rejected', isUsingOverage: false, unifiedWindows: { five_hour: { utilization: 0.03, resetsAt: w.nowSec + 3600 }, seven_day: { utilization: 0.10, resetsAt: NEW }, seven_day_overage_included: { utilization: 1, resetsAt: NEW } } } }) + '\n');
    const lines = cap.done();
    const c = w.readCache(w.id.wmax);
    const fable = (c.scopedWeekly || []).find((b) => /fable/i.test(b.name || ''));
    ok('§16 the rolled rejection lands on the FABLE cap (dead @ this week) — no placeholder beside it, one scoped entry',
      !!fable && fable.utilization === 1 && fable.resetsAt === NEW && !(c.scopedWeekly || []).some((b) => /model cap/i.test(b.name || '')) && (c.scopedWeekly || []).length === 1, JSON.stringify(c.scopedWeekly));
    ok('§16 …the plan week reads THIS week\'s 0.10, and the journal says the ladder named the cap by its existing limit',
      Math.abs(c.sevenDay.utilization - 0.10) < 1e-9 && c.sevenDay.resetsAt === NEW && lines.some((l) => /model-cap rejection on .* → the Fable model cap \(/.test(l)), JSON.stringify(c.sevenDay) + ' | ' + lines.filter((l) => /model-cap rejection/.test(l)).join(' | ').slice(0, 200));
    const remO = accountRemaining(projectCacheForFamily(c, 'opus'), w.nowSec), remF = accountRemaining(projectCacheForFamily(c, 'fable'), w.nowSec);
    ok('§16 THE MONEY: the opus family sees the plan week (90 %), the fable family its dead cap (0 %) — no un-named bucket parks every family',
      remO.known && Math.abs(remO.remaining - 90) < 1e-9 && remF.known && remF.remaining === 0, JSON.stringify({ remO, remF }));
    const members = MEMBERS.map((m) => ({ id: w.id[m.tag], name: m.name }));
    const stay = decidePoolSwitch({ currentId: w.id.wmax, members, readCache: (id) => projectCacheForFamily(w.readCache(id), 'opus'), nowSec: w.nowSec, explain: true });
    ok('§16 …so the OPUS conversation on that member has no wall to leave (the pool reads it healthy)', stay.to == null && stay.reason === 'healthy', JSON.stringify(stay).slice(0, 200));
  }
}


// ═══ §17 A WARM CONVERSATION IS NEVER MOVED PROACTIVELY ══════════════════════
// Owner, 2026-09-22: "如果一个对话最近在活跃（缓存还热）那就尽量不要切，因为无缓启动要消耗大量额度".
// A re-point cold-starts the conversation (the prompt cache belongs to the account
// that wrote it), so the pool's PROACTIVE 'edf' jump waits until the cache has gone
// cold on its own; a forced move never waits (test-pool-auto pins that half). Driven
// through the REAL engine's per-session pass and pool-default decision, with the
// cold sibling on the same verdict as the control.
console.log('— §17 a warm conversation is never moved proactively (the owner\'s warm-cache rule)');
{
  // two healthy members: FAR resets in 120 h, SOON in 30 h ⇒ EDF wants every conversation on SOON
  const ROSTER = [
    { tag: 'far', name: 'Member Far', u5: 0.05, u7: 0.30, fable: 0.30, hoursOut: 120 },
    { tag: 'soon', name: 'Member Soon', u5: 0.05, u7: 0.30, fable: 0.30, hoursOut: 30 },
  ];
  const w = mkWorld({ roster: ROSTER });
  if (!w) { ok('§17 SKIP — pools unsupported on this platform', true); }
  else {
    const now = Date.now();
    w.mkSession('sess-warm', 'far', { _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: now - 60e3 });
    w.mkSession('sess-cold', 'far', { _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: now - 10 * 60e3 });
    // a [1m] conversation already ANSWERED: its served model is the API's base id
    // (no variant) — the 1-hour cache must still be read off its request model
    const s1m = w.mkSession('sess-1m', 'far', { _spawnModel: 'claude-fable-5-1[1m]', _lastPtyDataAt: now - 20 * 60e3 });
    w.eng.noteServedModel(s1m, 'claude-fable-5-1');
    const cap = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P);
    const lines = cap.done();
    const pool = lines.filter((l) => /\[pool\]/.test(l));
    ok('§17 the COLD sibling takes the proactive EDF move (the control — same pool, same verdict)', w.linkOf('sess-cold') === 'soon', w.linkOf('sess-cold') + ' | ' + pool.join(' | ').slice(0, 300));
    ok('§17 THE RULE: the WARM conversation (output 60 s ago < 300 s) stays where its cache is', w.linkOf('sess-warm') === 'far', w.linkOf('sess-warm') + ' | ' + pool.join(' | ').slice(0, 300));
    ok('§17 …and a [1m] conversation idle 20 min is still warm (1-hour cache, read off the REQUEST model after a variant-less answer)', w.linkOf('sess-1m') === 'far', w.linkOf('sess-1m'));
    ok('§17 the hold SPEAKS in the journal, naming the conversation, its ago/ttl and where it would have gone',
      pool.some((l) => l === `[pool] hold sess-warm: warm cache (last output 60s ago < ttl 300s) — proactive move to ${w.id.soon} deferred`), pool.join(' | ').slice(0, 400));
    const cap2 = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P, { force: true });
    const again = cap2.done().filter((l) => /\[pool\] hold sess-warm/.test(l));
    ok('§17 …once per (pool, conversation) per 10 min — the next cycle holds again, silently', again.length === 0 && w.linkOf('sess-warm') === 'far', again.join(' | '));
    ok('§17 no user notice is posted for a hold (it is a deferral, not a blocked pool)', !w.notices.some((n) => /warm/i.test(n)), JSON.stringify(w.notices).slice(0, 200));

    // NEGATIVE CONTROL: the engine WITHOUT the per-session wiring moves the warm conversation too.
    const mut = mutate('src/server/usage-pool-engine.js', 'warm', [[
      'overageIds: overageMemberIds(members), creditsIds, warm, explain: true });',
      'overageIds: overageMemberIds(members), creditsIds, explain: true }); // PRE-FIX: no warm-cache hold',
    ]]);
    ok('§17 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const wm = mkWorld({ roster: ROSTER, engineModule: mut.mod });
      wm.mkSession('sess-warm', 'far', { _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - 60e3 });
      const c = quiet(); wm.eng.maybePoolAutoSwitchForPool(wm.P); c.done();
      ok('§17 NEGATIVE CONTROL: without the wiring the warm conversation IS moved (the cold start the owner named)', wm.linkOf('sess-warm') === 'soon', wm.linkOf('sess-warm'));
    }

    // THE POOL DEFAULT: it moves every conversation WITHOUT its own link at once,
    // so one warm follower defers its proactive move; cold, the move goes through.
    const wd = mkWorld({ roster: ROSTER });
    const follower = {
      backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-follow', claudeSessionId: 'cid-sess-follow',
      _accountId: wd.P, name: 'sess-follow', cwd: wd.root, sockName: 'cw-sess-follow', buffer: '', createdAt: Date.now(),
      pty: { write() { } }, _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - 30e3,
    };
    wd.sessions.set('sess-follow', follower); // NO own link — it follows the pool default
    const cd = quiet(); wd.eng.maybePoolAutoSwitchForPool(wd.P); const dl = cd.done().filter((l) => /\[pool\]/.test(l));
    ok('§17 POOL DEFAULT: a warm default-following conversation defers the default\'s proactive move', wd.am.poolCurrent(wd.P) === wd.id.far, wd.am.poolCurrent(wd.P) + ' | ' + dl.join(' | ').slice(0, 300));
    ok('§17 POOL DEFAULT: …and says so, naming the conversation that holds it',
      dl.some((l) => l === `[pool] hold sess-follow: warm cache (last output 30s ago < ttl 300s) — proactive move to ${wd.id.soon} deferred (pool default)`), dl.join(' | ').slice(0, 300));
    follower._lastPtyDataAt = Date.now() - 6 * 60e3; // the cache went cold on its own
    const cd2 = quiet(); wd.eng.maybePoolAutoSwitchForPool(wd.P, { force: true }); cd2.done();
    ok('§17 POOL DEFAULT: once the cache is cold the next cycle makes the move', wd.am.poolCurrent(wd.P) === wd.id.soon, wd.am.poolCurrent(wd.P));

    // ── LOW-A (the verifier, reproduced on the real engine): A LOCK IS THE
    // REQUEST MODEL AS SPELLED. `/model fable` asks for the 5-minute cache, so a
    // variant-less lock never borrows the spawn model's '[1m]'; only a lock
    // COPIED off the served model (the API's base id — it cannot carry the
    // variant) reads the variant back, like the served rung does.
    const lockLegs = (engineModule) => {
      const wl = mkWorld({ roster: ROSTER, engineModule });
      const t = Date.now();
      // the repro, verbatim: a user lock 'fable' over a [1m] spawn, nothing served yet, idle 20 min
      wl.mkSession('lock-bare', 'far', { _modelLocked: true, _lockedModel: 'fable', _spawnModel: 'claude-fable-5-1[1m]', _lastPtyDataAt: t - 20 * 60e3 });
      // …and the same lock once the conversation has been ANSWERED (served = the base id)
      const sAns = wl.mkSession('lock-answered', 'far', { _modelLocked: true, _lockedModel: 'fable', _spawnModel: 'claude-fable-5-1[1m]', _lastPtyDataAt: t - 20 * 60e3 });
      wl.eng.noteServedModel(sAns, 'claude-fable-5-1');
      // a lock COPIED off the served model (the target-less latch / `set-model {lock:true}` adopting _servedModel)
      const sLat = wl.mkSession('lock-latched', 'far', { _modelLocked: true, _spawnModel: 'claude-fable-5-1[1m]', _lastPtyDataAt: t - 20 * 60e3 });
      wl.eng.noteServedModel(sLat, 'claude-fable-5-1');
      sLat._lockedModel = sLat._servedModel;
      // a lock SPELLED with the variant
      wl.mkSession('lock-1m', 'far', { _modelLocked: true, _lockedModel: 'fable[1m]', _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: t - 20 * 60e3 });
      const c = quiet(); wl.eng.maybePoolAutoSwitchForPool(wl.P); const lines = c.done().filter((l) => /\[pool\]/.test(l));
      return { wl, lines };
    };
    {
      const { wl, lines } = lockLegs(engMod);
      ok('§17 LOW-A: a user lock "fable" over a [1m] spawn, idle 20 min, is COLD (the 5-minute cache the lock asks for) ⇒ the EDF move goes through',
        wl.linkOf('lock-bare') === 'soon', wl.linkOf('lock-bare') + ' | ' + lines.join(' | ').slice(0, 300));
      ok('§17 LOW-A: …and so once it has been answered (served base id known — `modelsMatch` would call the two the same model)',
        wl.linkOf('lock-answered') === 'soon', wl.linkOf('lock-answered') + ' | ' + lines.join(' | ').slice(0, 300));
      ok('§17 LOW-A: a lock COPIED off the served model reads the [1m] back off the spawn model ⇒ still warm at 20 min, held',
        wl.linkOf('lock-latched') === 'far', wl.linkOf('lock-latched') + ' | ' + lines.join(' | ').slice(0, 300));
      ok('§17 LOW-A: a lock SPELLED "fable[1m]" is the 1-hour cache ⇒ held',
        wl.linkOf('lock-1m') === 'far', wl.linkOf('lock-1m'));
      ok('§17 LOW-A: the latched hold speaks with the 1-hour ttl',
        lines.some((l) => l === `[pool] hold lock-latched: warm cache (last output 1200s ago < ttl 3600s) — proactive move to ${wl.id.soon} deferred`), lines.join(' | ').slice(0, 400));
    }
    // NEGATIVE CONTROL (the pre-fix code): without the lock rule the user lock borrows the spawn's [1m] and is held for an hour.
    const mutL = mutate('src/server/usage-pool-engine.js', 'warmlock', [[
      '  if (s._modelLocked && s._lockedModel && m === s._lockedModel && m !== s._servedModel) return m;\n',
      '  // PRE-FIX: every answer, a user-spelled lock included, reads the variant back\n',
    ]]);
    ok('§17 LOW-A NEGATIVE CONTROL: the patch hit the product source', mutL.hit === true, mutL.why || '');
    if (mutL.hit) {
      const { wl } = lockLegs(mutL.mod);
      ok('§17 LOW-A NEGATIVE CONTROL: pre-fix, the user lock "fable" IS held (ttl 3600 s borrowed off the spawn) — the finding reproduced',
        wl.linkOf('lock-bare') === 'far' && wl.linkOf('lock-answered') === 'far', wl.linkOf('lock-bare') + '/' + wl.linkOf('lock-answered'));
      ok('§17 LOW-A NEGATIVE CONTROL: …while the latched lock is held either way (the rule narrows the read-back, it does not remove it)', wl.linkOf('lock-latched') === 'far', wl.linkOf('lock-latched'));
    }
    // WHY EXACT EQUALITY: the `modelsMatch(m, s._servedModel)` spelling of the same
    // rule reads the variant back in both of the repro's shapes (it answers true
    // for an unknown served model and for 'fable' against 'claude-fable-5-1').
    const mutM = mutate('src/server/usage-pool-engine.js', 'warmlockmm', [[
      'm === s._lockedModel && m !== s._servedModel) return m;',
      'm === s._lockedModel && !modelsMatch(m, s._servedModel)) return m; // the modelsMatch spelling',
    ]]);
    ok('§17 LOW-A CONTROL (modelsMatch spelling): the patch hit the product source', mutM.hit === true, mutM.why || '');
    if (mutM.hit) {
      const { wl } = lockLegs(mutM.mod);
      ok('§17 LOW-A CONTROL (modelsMatch spelling): it holds BOTH user-lock shapes for an hour — why the rule compares the spelling exactly',
        wl.linkOf('lock-bare') === 'far' && wl.linkOf('lock-answered') === 'far', wl.linkOf('lock-bare') + '/' + wl.linkOf('lock-answered'));
    }

    // ── LOW-B (the verifier): THE POOL DEFAULT'S HOLD IS ONE DEFERRAL. Keyed on
    // the warmest follower, five followers taking turns being the most recent
    // spoke five times in ten minutes; keyed on the pool it speaks once, still
    // naming the conversation holding it — and again after the 10-min floor.
    const rotate = (engineModule) => {
      const wr = mkWorld({ roster: ROSTER, engineModule });
      const realNow = Date.now;
      const T0 = realNow();
      let fake = T0;
      const ids = ['fol-1', 'fol-2', 'fol-3', 'fol-4', 'fol-5'];
      for (const f of ids) {
        wr.sessions.set(f, {
          backend: 'claude', mode: 'chat', host: null, _webuiId: f, claudeSessionId: 'cid-' + f,
          _accountId: wr.P, name: f, cwd: wr.root, sockName: 'cw-' + f, buffer: '', createdAt: T0,
          pty: { write() { } }, _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: T0 - 5e3,
        }); // NO own link — every one follows the pool default
      }
      const holds = [];
      Date.now = () => fake;
      try {
        for (let tick = 1; tick <= 21; tick++) { // 30 s cadence: ticks 1..20 span 10 min, tick 21 is 600 s after tick 1
          fake = T0 + tick * 30e3;
          wr.sessions.get(ids[tick % ids.length])._lastPtyDataAt = fake - 1e3; // a different follower is the warmest each tick
          const c = quiet(); wr.eng.maybePoolAutoSwitchForPool(wr.P);
          for (const l of c.done()) if (/\[pool\] hold /.test(l)) holds.push({ tick, sid: /hold (\S+):/.exec(l)?.[1], l });
        }
      } finally { Date.now = realNow; }
      return { wr, holds };
    };
    {
      const { wr, holds } = rotate(engMod);
      const inTen = holds.filter((h) => h.tick <= 20);
      ok('§17 LOW-B: five rotating warm followers ⇒ exactly ONE pool-default hold line in 10 min', inTen.length === 1, JSON.stringify(holds.map((h) => [h.tick, h.sid])));
      ok('§17 LOW-B: …the line still names the conversation holding it, scoped "(pool default)"',
        inTen.length === 1 && inTen[0].l === `[pool] hold ${inTen[0].sid}: warm cache (last output 1s ago < ttl 300s) — proactive move to ${wr.id.soon} deferred (pool default)`, inTen[0]?.l || '');
      ok('§17 LOW-B: …and it speaks again once the 10-min floor has passed (a floor, not a gag)', holds.filter((h) => h.tick === 21).length === 1, JSON.stringify(holds.map((h) => [h.tick, h.sid])));
      ok('§17 LOW-B: the default never moved while a follower was warm', wr.am.poolCurrent(wr.P) === wr.id.far, wr.am.poolCurrent(wr.P));
    }
    // NEGATIVE CONTROL (the pre-fix code): keyed on the warmest sid, the same run prints one line per follower.
    const mutB = mutate('src/server/usage-pool-engine.js', 'warmdefkey', [[
      "noteWarmHold(poolId, defaultWarmSid, d, now, ' (pool default)', poolId + ':default');",
      "noteWarmHold(poolId, defaultWarmSid, d, now, ' (pool default)' /* PRE-FIX: keyed on the warmest follower */);",
    ]]);
    ok('§17 LOW-B NEGATIVE CONTROL: the patch hit the product source', mutB.hit === true, mutB.why || '');
    if (mutB.hit) {
      const { holds } = rotate(mutB.mod);
      const inTen = holds.filter((h) => h.tick <= 20);
      ok('§17 LOW-B NEGATIVE CONTROL: pre-fix, the five followers speak five times in 10 min — the finding reproduced', inTen.length === 5, JSON.stringify(inTen.map((h) => [h.tick, h.sid])));
    }
  }
}

console.log(fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);
