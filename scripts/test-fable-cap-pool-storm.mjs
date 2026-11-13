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
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
// ok(NAME, condition): a name that is not a string is a SWAPPED call (lane fable-52-cli-321 r6 — a non-empty string as the condition
// is always true, so such a leg can never fail); it fails, named
const ok = (n, c, e) => {
  if (typeof n !== 'string') { fail++; console.error(`  ✗ ok() was handed a ${typeof n} as its NAME (arguments swapped?): ${String(c).slice(0, 160)}`); return; }
  if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); }
};

const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const { parseRateLimitEvent } = require(path.join(REPO, 'src/rate-limit-capture.js'));
const { decidePoolSwitch, poolBlockedNotice } = require(path.join(REPO, 'src/account-pool-auto.js'));
const { projectCacheForFamily } = require(path.join(REPO, 'src/model-family.js'));

const cleanup = [];
// PATCHED COPIES are written OUTSIDE the tree (scripts/mutant-copy.mjs: this
// process's scratch dir, `require` re-bound on line 1 to the real module's
// path, so relative requires resolve as a sibling's); §tree measures that while
// they exist. They used to be siblings in src/, src/server/ and
// src/server/stdout/ (vs-fable-mut-*, gitignored) — and §14f's census had to
// skip them by NAME, which is exactly what any other src/ scanner could not.
// A copy that must reach ANOTHER copy is re-pointed at its absolute path.
sweepLegacy(REPO, ['src', 'src/server', 'src/server/stdout'], /^vs-fable-mut-(\d+)-/);   // what a pre-fix run stranded (dead PIDs only)
const MUTF = mutantCopies('fable', REPO);
process.on('exit', () => {
  for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
});
/** Write a patched copy of a real module (outside the tree) and require it. */
function mutate(rel, tag, replacements) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  let out = src;
  for (const [from, to] of replacements) {
    if (!out.includes(from)) return { hit: false, why: 'anchor not found: ' + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const fp = MUTF.write(rel, out, tag, { esm: false });
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
    getAutoResume: () => autoResume, getQuotaProbe: () => null,
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
      // (B-8a65 S5: on a hot pool the mis-projected conversation now leaves the Fable-rich member through the spare-lane tier,
      // whose sentence names the family it wrongly believes the conversation does NOT use — the same wrong family, other words;
      // §5, §7 and §11d read either sentence the same way)
      ok('§1 NEGATIVE CONTROL: …and the notice tells the owner it moved because of its OPUS quota',
        w2.notices.some((n) => /opus quota|does not use Fable\b/.test(n)), JSON.stringify(w2.notices).slice(0, 220));
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
        /no member can serve it — Member P is out of quota \(still available: /.test(sentence) && /Fable 40%/.test(sentence), sentence);
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
        w2.notices.some((n) => /fable quota|does not use Opus\b/.test(n)), JSON.stringify(w2.notices).slice(0, 220));
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
      // 4 since B-f69c ③: projectionRereadFor projects each LIVE conversation's family through the rule too;
      // 5 since 2026-09-28: the removed-member verdict (removalVerdict) projects the moved conversation's family through it;
      // 6 since the pin (same day): setConversationPin judges the pin on the conversation's family through it too;
      // 7 since verify r1: memberVerdictFor — the ONE site "Move every conversation here now" (gatherPlan) and the
      //   held branch of memberRemoved judge a member on the conversation's family through
      // 8 since q-053 P0b (lane pool-provider-aware): crossMoveNow — the owner's answer to a cross-provider card
      //   re-judges the conversation on its family through it before anything moves
      // 9 since q-055 M2 (lane pool-provider-latents): placeUnplaced — a deleted member's UNPLACED conversation is decided
      //   from that member on its family through it
      sites.length === 9 && unruled.length === 0 && sites.filter((x) => x.spawnChooser).length === 1,
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
    /no member can serve it — Cur is nearly spent: 7d 4% \(still available: 5h 90%, Fable 80%\)\./.test(sentence), sentence); // (lane pool-silent-members R2: the current member named)

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
      // (lane pool-silent-members R2: the others out of quota are NAMED with their spent buckets — a count named nobody)
      new RegExp('^Pool "P": no member can serve it — Cur is out of quota\\. Out of quota: B \\(7d 0% until \\d\\d:\\d\\d:\\d\\dZ, Fable 0% until \\d\\d:\\d\\d:\\d\\dZ\\), C \\(7d 0% until \\d\\d:\\d\\d:\\d\\dZ, Fable 0% until \\d\\d:\\d\\d:\\d\\dZ\\)\\. Conversations on it will hit a limit until a window resets, you add a member, or you move them off the pool\\.$').test(s1), s1);
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
      .replace(/until \d\d:\d\d:\d\dZ/g, 'until T') === 'Pool "P": no member can serve it — Cur is spent: 7d 1% (still available: 5h 7%, Fable 80%). Out of quota: B (7d 0% until T, Fable 0% until T), C (7d 0% until T, Fable 0% until T). Conversations on it will hit a limit until a window resets, you add a member, or you move them off the pool.', // (+ R2's named others)
    poolBlockedNotice(cold, { poolName: 'P', currentName: 'Cur' }));
  const legacy = { reason: 'no-members', to: null, deadBuckets: [], liveBuckets: ['5h 100%', '7d 69%', 'Fable 45%'] };
  ok('§6 CONTROL: a decision object with no `lowBuckets` (the §3 shape) still refuses to contrast "out of quota"',
    poolBlockedNotice(legacy, { poolName: 'P', currentName: 'A' }) === 'Pool "P": no member can serve it — A is out of quota. Conversations on it will hit a limit until a window resets, you add a member, or you move them off the pool.',
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
        w2.notices.some((n) => /opus quota|does not use Fable\b/.test(n)), JSON.stringify(w2.notices).slice(0, 220));
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
      /else if \(model && session\._modelLocked\)[\s\S]{0,220}session\._lockedModel = model;/.test(srv) && /const model = door\.model;/.test(srv));
    const bar = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
    const wcText = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
    ok('§7b …on the client side the pick re-targets the lock as master\'s pick does — ONE site, on every page (round 13: one bar; a live session\'s facts then write the server\'s target onto the same field), and what a resume reads is the saved config written where master writes it — at the press (round 9 law 2: no server store, ws-create\'s resume reads the client\'s frame)',
      (bar.match(/this\._lockedModel = model;/g) || []).length === 1 && /const pick = \(model\) => \{[\s\S]{0,2400}?if \(this\._modelLocked\) this\._lockedModel = model;/.test(bar) && !/_serverModelFacts/.test(bar) && /this\._onConfigChange\?\.\(\{ modelLock: nowLock, lockModel: nowLock \? this\._statusModel : undefined/.test(bar) && /\n    if \('lockedModel' in status\) this\._lockedModel = status\.lockedModel \|\| null;/.test(bar) && !/askRecordOf|askStoreReady/.test(wcText) && /_lockedModel: data\.modelLock \? \(data\.lockModel \|\| data\.model \|\| null\) : null/.test(wcText));
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

  // THE `engine:` OBJECT LITERAL'S KEYS ONLY (lane agy-wall-signal r3): the whole `create({…})` options literal also names
  // BUFFERS_DIR, activeSessions, … — a consumer reading `engine.BUFFERS_DIR` would have passed against it
  const engineKeys = (anchor) => { const i = srv.indexOf(anchor); return i < 0 ? [] : names(literalAfter(srv.slice(i), 'engine: {')); };
  const wired = {
    'src/server/session-stdout.js': engineKeys("require('./src/server/session-stdout.js').create({"),
    'src/server/session-brain.js': engineKeys("require('./src/server/session-brain.js').create({"),
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
  // …AND every name a consumer READS off `engine` directly (lane agy-wall-signal r2, the acceptance's MAJOR: acp-events read
  // `engine.sessionModelFor?.(session)` — an optional-chained read this destructure census never saw; server.js's literal
  // lacked the key, so in production the first wall of a session was dropped while every suite that stubbed the key was
  // green). r3: dotted AND bracketed reads (`engine.x`, `engine?.x`, `engine['x']`, `engine?.["x"]`), judged against the
  // `engine:` literal's keys only, by ONE census function that reads a FILE (its RED control plants into a file)
  // r4: `engine?.x` is its own alternative (r3's optional `?.` swallowed the dot and then demanded a second one)
  const READ_RE = /\bengine\s*(?:\?\.\s*([A-Za-z_$][\w$]*)|\.\s*([A-Za-z_$][\w$]*)|(?:\?\.)?\[\s*(['"])([A-Za-z_$][\w$]*)\3\s*\])/g;
  const directReadsOfFile = (abs) => [...new Set([...fs.readFileSync(abs, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '').matchAll(READ_RE)].map((m) => m[1] || m[2] || m[4]))];
  const directMissing = (files, wiredSet) => files.flatMap((abs) => directReadsOfFile(abs).filter((n) => !wiredSet.includes(n)).map((n) => `${path.relative(REPO, abs)}: engine.${n}`));
  const direct = directMissing(consumers.map((c) => path.join(REPO, c)), wired['src/server/session-stdout.js']);
  ok('§10 every name a consumer READS off `engine` directly (engine.x / engine?.x / engine[\'x\']) is in the `engine:` literal too', direct.length === 0, JSON.stringify(direct));
  ok('§10 …the wall road\'s model accessor is wired: acp-events destructures sessionModelFor and server.js\'s `engine:` literal carries it',
    destructured('src/server/stdout/acp-events.js').includes('sessionModelFor') && wired['src/server/session-stdout.js'].includes('sessionModelFor'));
  ok('§10 …the wired set is the `engine:` literal, not the whole options literal (BUFFERS_DIR / activeSessions are options, never engine names)',
    !wired['src/server/session-stdout.js'].includes('BUFFERS_DIR') && !wired['src/server/session-stdout.js'].includes('activeSessions') && wired['src/server/session-stdout.js'].includes('noteTurnEnd'));
  // RED CONTROLS: server.js's literal WITHOUT the key; reads planted into a scratch COPY of a real consumer FILE
  {
    const lit = literalAfter(srv.slice(srv.indexOf("require('./src/server/session-stdout.js').create({")), 'engine: {');
    const noKey = names(lit.replace('notePoolAuthFailure, sessionModelFor,', 'notePoolAuthFailure,'));
    ok('§10 RED control: the `engine:` literal without sessionModelFor ⇒ acp-events\' destructure is missing it', noKey.length > 5 && !noKey.includes('sessionModelFor') && destructured('src/server/stdout/acp-events.js').some((n) => !noKey.includes(n)));
    const dir10 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-storm10-'));
    try {
      const real = fs.readFileSync(path.join(REPO, 'src/server/stdout/acp-events.js'), 'utf8');
      const anchor10 = '  function attach(session, id, ptyProcess,';
      const copy = path.join(dir10, 'acp-events.js');
      fs.writeFileSync(copy, real.replace(anchor10, "  const planted1 = engine.BUFFERS_DIR?.(null); const planted2 = engine['notWiredName']; const planted3 = engine?.[\"alsoNotWired\"]; const planted4 = engine?.optionalUnwired?.(null);\n" + anchor10));
      const caught = directMissing([copy], wired['src/server/session-stdout.js']);
      ok('§10 RED control: reads PLANTED into a copy of acp-events.js — an option name (engine.BUFFERS_DIR?.()), engine[\'x\'], engine?.["x"], engine?.x?.() — are each caught by the census over that file', real.includes(anchor10) && ['BUFFERS_DIR', 'notWiredName', 'alsoNotWired', 'optionalUnwired'].every((n) => caught.some((c) => c.endsWith('engine.' + n))) && directMissing([path.join(REPO, 'src/server/stdout/acp-events.js')], wired['src/server/session-stdout.js']).length === 0, JSON.stringify(caught));
    } finally { fs.rmSync(dir10, { recursive: true, force: true }); }
  }
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
      `'stream-json': require(${JSON.stringify(mutC.file)}),`,
    ]]);
    const mutS = mutI.hit ? mutate('src/server/session-stdout.js', 'sostdout', [[
      "require('./stdout/index.js')",
      `require(${JSON.stringify(mutI.file)})`,
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
          worst.w.notices.some((n) => /opus quota|does not use Fable\b/.test(n)), JSON.stringify(worst.w.notices).slice(0, 220));
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
// `set-model {lock:true}` on a conversation that asks NOTHING (the CLI's default)
// locks its served fact (r5; round 13: a lock otherwise targets what its frame names, else the server's own ask —
// model-ask lockTarget; the UI row says "Lock to this model" about the model on screen),
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
  // THE FILES ARE DERIVED (lane fable-52-cli-321 r5 — a fixed list of seven let a writer planted in src/server/user-input.js stay
  // green): every server-side .js under src/ (src/lib/ is the CLIENT's own mirror — a different object in a different process;
  // it can never define this server's placement).
  const walkJs = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (dir + '/' + e.name === 'src/lib' ? [] : walkJs(dir + '/' + e.name)) : (e.name.endsWith('.js') ? [dir + '/' + e.name] : []));
  const FILES = walkJs('src');
  const ALLOW = [
    { file: 'src/ws-create.js', has: 'data.modelLock ?', why: 'the REQUEST: the spawn asks for it (lockModel, else the spawn model, else target-less)' },
    { file: 'src/ws-handler.js', has: 'data.lock ?', why: 'ADOPTS _servedModel when the client sends no lockModel — covered by §12\'s belt, which refuses a target that is the standing reroute (master\'s line again — lane fable-52-cli-321 round 14)' },
    { file: 'src/ws-handler.js', has: '= model;', why: 'the REQUEST: a pick while locked re-targets the lock (§7b pins it) — a pick that passed the door (model-ask setModelDoor)' },
    { file: 'src/server/boot-restore.js', has: 'meta.lockedModel', why: 'restores what one of the writers above wrote' },
    { file: 'src/server/stdout/claude-stream-json.js', has: '= session._servedModel;', why: 'the target-less latch — GATED on servedDefinesModel (§11)' },
    { file: 'src/server/stdout/claude-stream-json.js', has: '= echo.id;', why: 'refines the SAME model to its full id (the resolved id from src/model-echo.js), gated on modelsMatch — never another model (master\'s A5, back in round 14)' },
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
  ok('§12b …the file set is DERIVED (every server-side src file, src/lib excluded) — it holds user-input.js, which no fixed list named', FILES.includes('src/server/user-input.js') && FILES.length > 50 && !FILES.some((f) => f.startsWith('src/lib/')), String(FILES.length));
  {
    // CONTROL: a writer planted in user-input.js (a file the r4 list of seven never read) is found and is unclassified
    const plantedLines = (fs.readFileSync(path.join(REPO, 'src/server/user-input.js'), 'utf8') + '\n  session._lockedModel = data.text;\n').split('\n');
    const hits = plantedLines.map((l) => l.replace(/^(\s*)\/\/.*$/, '$1')).filter((c) => /_lockedModel\s*[=:]/.test(c) && !/_lockedModel\s*[=!]==/.test(c));
    ok('§12b CONTROL: a `_lockedModel` writer planted in src/server/user-input.js is found by the derived census and matches no row', hits.length === 1 && !ALLOW.some((a) => a.file === 'src/server/user-input.js' && hits[0].includes(a.has)), JSON.stringify(hits));
  }
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
// The capture keeps its own date in the file (2026-09-13); this suite replays it
// as a LIVE record, so it is re-stamped NOW — the late-record rule (lane-hot-
// switch, src/record-lateness.js) takes a record the CLI stamped 17 days ago for
// what it is, a backlog's, and acts on none of it.
const FROZEN_FALLBACK = { ...JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/claude-fallback-block-record.json'), 'utf8')), timestamp: new Date().toISOString() };
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
    `'stream-json': require(${JSON.stringify(mutC.file)}),`,
  ]]);
  if (!mutI.hit) return { hit: false, why: 'registry patch missed' };
  const mutS = mutate('src/server/session-stdout.js', tag + 'so', [[
    "require('./stdout/index.js')",
    `require(${JSON.stringify(mutI.file)})`,
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
      else if (e.name.endsWith('.js')) files.push(fp);   // no name-based exclusion: this suite's copies never live under src/ (§tree)
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
  // (lane cache-warmth-tiles r1a′: a fixture's activity is `_lastRequestAt` — what the stream's request record writes; a chat
  // conversation with only pty bytes is UNKNOWN to the hold — §21)
  const w = mkWorld({ roster: ROSTER });
  if (!w) { ok('§17 SKIP — pools unsupported on this platform', true); }
  else {
    const now = Date.now();
    w.mkSession('sess-warm', 'far', { _spawnModel: 'claude-fable-5-1', _lastRequestAt: now - 60e3 });
    w.mkSession('sess-cold', 'far', { _spawnModel: 'claude-fable-5-1', _lastRequestAt: now - 70 * 60e3 }); // past the 1-hour cache (lane cache-warmth-tiles: 10 min read cold on the 5-minute belief)
    // a [1m] conversation already ANSWERED: its served model is the API's base id (no variant) — the hour holds
    // whatever the model says (lane cache-warmth-tiles: the TTL is the account's fact, not the model's)
    const s1m = w.mkSession('sess-1m', 'far', { _spawnModel: 'claude-fable-5-1[1m]', _lastRequestAt: now - 20 * 60e3 });
    w.eng.noteServedModel(s1m, 'claude-fable-5-1');
    const cap = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P);
    const lines = cap.done();
    const pool = lines.filter((l) => /\[pool\]/.test(l));
    ok('§17 the COLD sibling takes the proactive EDF move (the control — same pool, same verdict)', w.linkOf('sess-cold') === 'soon', w.linkOf('sess-cold') + ' | ' + pool.join(' | ').slice(0, 300));
    ok('§17 THE RULE: the WARM conversation (output 60 s ago < 3600 s) stays where its cache is', w.linkOf('sess-warm') === 'far', w.linkOf('sess-warm') + ' | ' + pool.join(' | ').slice(0, 300));
    ok('§17 …and a conversation idle 20 min is still warm (the 1-hour cache — a [1m] spawn answered by the base id too)', w.linkOf('sess-1m') === 'far', w.linkOf('sess-1m'));
    ok('§17 the hold SPEAKS in the journal, naming the conversation, its ago/ttl and where it would have gone — by the member\'s NAME (verifier INFO-a)',
      pool.some((l) => l === `[pool] hold sess-warm: warm cache (last request 60s ago < ttl 3600s) — proactive move to Member Soon deferred`), pool.join(' | ').slice(0, 400));
    const cap2 = quiet();
    w.eng.maybePoolAutoSwitchForPool(w.P, { force: true });
    const again = cap2.done().filter((l) => /\[pool\] hold sess-warm/.test(l));
    ok('§17 …once per (pool, conversation) per 10 min — the next cycle holds again, silently', again.length === 0 && w.linkOf('sess-warm') === 'far', again.join(' | '));
    ok('§17 no user notice is posted for a hold (it is a deferral, not a blocked pool)', !w.notices.some((n) => /warm/i.test(n)), JSON.stringify(w.notices).slice(0, 200));

    // NEGATIVE CONTROL: the engine WITHOUT the per-session wiring moves the warm conversation too.
    const mut = mutate('src/server/usage-pool-engine.js', 'warm', [[
      'overageIds: overageMemberIds(members), creditsIds, warm, explain: true, roster });',
      'overageIds: overageMemberIds(members), creditsIds, explain: true, roster }); // PRE-FIX: no warm-cache hold',
    ]]);
    ok('§17 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const wm = mkWorld({ roster: ROSTER, engineModule: mut.mod });
      wm.mkSession('sess-warm', 'far', { _spawnModel: 'claude-fable-5-1', _lastRequestAt: Date.now() - 60e3 });
      const c = quiet(); wm.eng.maybePoolAutoSwitchForPool(wm.P); c.done();
      ok('§17 NEGATIVE CONTROL: without the wiring the warm conversation IS moved (the cold start the owner named)', wm.linkOf('sess-warm') === 'soon', wm.linkOf('sess-warm'));
    }

    // THE POOL DEFAULT: it moves every conversation WITHOUT its own link at once,
    // so one warm follower defers its proactive move; cold, the move goes through.
    const wd = mkWorld({ roster: ROSTER });
    const follower = {
      backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-follow', claudeSessionId: 'cid-sess-follow',
      _accountId: wd.P, name: 'sess-follow', cwd: wd.root, sockName: 'cw-sess-follow', buffer: '', createdAt: Date.now(),
      pty: { write() { } }, _spawnModel: 'claude-fable-5-1', _lastRequestAt: Date.now() - 30e3,
    };
    wd.sessions.set('sess-follow', follower); // NO own link — it follows the pool default
    const cd = quiet(); wd.eng.maybePoolAutoSwitchForPool(wd.P); const dl = cd.done().filter((l) => /\[pool\]/.test(l));
    ok('§17 POOL DEFAULT: a warm default-following conversation defers the default\'s proactive move', wd.am.poolCurrent(wd.P) === wd.id.far, wd.am.poolCurrent(wd.P) + ' | ' + dl.join(' | ').slice(0, 300));
    ok('§17 POOL DEFAULT: …and says so, naming the conversation that holds it',
      dl.some((l) => l === `[pool] hold sess-follow: warm cache (last request 30s ago < ttl 3600s) — proactive move to Member Soon deferred (pool default)`), dl.join(' | ').slice(0, 300));
    follower._lastRequestAt = Date.now() - 61 * 60e3; // the cache went cold on its own (past the hour)
    const cd2 = quiet(); wd.eng.maybePoolAutoSwitchForPool(wd.P, { force: true }); cd2.done();
    ok('§17 POOL DEFAULT: once the cache is cold the next cycle makes the move', wd.am.poolCurrent(wd.P) === wd.id.soon, wd.am.poolCurrent(wd.P));

    // ── LOW-A RETIRED (lane cache-warmth-tiles, 2026-11-02): the verifier's LOW-A made a user lock "fable" over a [1m]
    // spawn read the 5-minute cache, because the TTL was then a property of the REQUEST model. It is not: a subscription
    // session rides the 1-hour cache whatever the model and however it is spelled (account-pool-auto cacheTtlSecFor —
    // the harness row, the billing, the credits), so every lock shape idle 20 min is WARM and held, and each hold speaks
    // the hour. The read-back rule (usage-pool-engine cacheModelFor) and its two controls went with the belief.
    {
      const wl = mkWorld({ roster: ROSTER });
      const t = Date.now();
      wl.mkSession('lock-bare', 'far', { _modelLocked: true, _lockedModel: 'fable', _spawnModel: 'claude-fable-5-1[1m]', _lastRequestAt: t - 20 * 60e3 });
      const sAns = wl.mkSession('lock-answered', 'far', { _modelLocked: true, _lockedModel: 'fable', _spawnModel: 'claude-fable-5-1[1m]', _lastRequestAt: t - 20 * 60e3 });
      wl.eng.noteServedModel(sAns, 'claude-fable-5-1');
      wl.mkSession('lock-1m', 'far', { _modelLocked: true, _lockedModel: 'fable[1m]', _spawnModel: 'claude-fable-5-1', _lastRequestAt: t - 20 * 60e3 });
      wl.mkSession('plain', 'far', { _spawnModel: 'claude-fable-5-1', _lastRequestAt: t - 20 * 60e3 });
      const c = quiet(); wl.eng.maybePoolAutoSwitchForPool(wl.P); const lines = c.done().filter((l) => /\[pool\]/.test(l));
      ok('§17 THE TTL IS THE ACCOUNT\'S: every lock spelling and a plain model, idle 20 min, are WARM on the hour ⇒ all held (RED on 3f8429cd5: the bare lock and the plain model moved at 5 min)',
        ['lock-bare', 'lock-answered', 'lock-1m', 'plain'].every((sid) => wl.linkOf(sid) === 'far'), ['lock-bare', 'lock-answered', 'lock-1m', 'plain'].map(wl.linkOf).join(',') + ' | ' + lines.join(' | ').slice(0, 300));
      ok('§17 …and each hold speaks the hour', lines.some((l) => l === `[pool] hold lock-bare: warm cache (last request 1200s ago < ttl 3600s) — proactive move to Member Soon deferred`), lines.join(' | ').slice(0, 400));
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
          pty: { write() { } }, _spawnModel: 'claude-fable-5-1', _lastRequestAt: T0 - 5e3,
        }); // NO own link — every one follows the pool default
      }
      const holds = [];
      Date.now = () => fake;
      try {
        for (let tick = 1; tick <= 21; tick++) { // 30 s cadence: ticks 1..20 span 10 min, tick 21 is 600 s after tick 1
          fake = T0 + tick * 30e3;
          wr.sessions.get(ids[tick % ids.length])._lastRequestAt = fake - 1e3; // a different follower is the warmest each tick
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
        inTen.length === 1 && inTen[0].l === `[pool] hold ${inTen[0].sid}: warm cache (last request 1s ago < ttl 3600s) — proactive move to Member Soon deferred (pool default)`, inTen[0]?.l || '');
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

// ═══ §18 A SOFT MOVE OF A WARM CONVERSATION WAITS FOR ITS FIRST STOP ═════════
// Owner, 2026-09-22: "软耗尽的话 热对话切走时机晚一点，普通10%，热对话的话就5%这样。如果一个对话到达了
// 冷对话切走的标准但还热着，就在停下来的第一时间切走。" On a HOT pool the soft band (under the
// hot bar, above the hard bar) moves a cold conversation at once and DEFERS a warm one
// that is mid-turn to the moment it stops; the hard band moves everyone at once.
// Driven through the REAL engine (per-session pass, pool default, the turn-end
// boundary) and, for the authoritative turn state, the REAL stdout pipeline.
console.log('— §18 a soft move of a warm mid-turn conversation waits for its first stop');
{
  const SOFT = [
    { tag: 'cur', name: 'Member Cur', u5: 0.93, u7: 0.30, fable: 0.30, hoursOut: 48 }, // 5h 7 % left: under hot 10, above hard 5
    { tag: 'alt', name: 'Member Alt', u5: 0.05, u7: 0.30, fable: 0.30, hoursOut: 48 },
  ];
  const HARD = [{ ...SOFT[0], u5: 0.97 }, SOFT[1]]; // 5h 3 % left: under the hard bar
  const inTurn = (t) => ({ _isStreaming: true, _turnState: 'running', _lastRequestAt: t - 20e3, _spawnModel: 'claude-fable-5-1' });
  const coldIdle = (t) => ({ _isStreaming: false, _turnState: 'idle', _lastRequestAt: t - 70 * 60e3, _spawnModel: 'claude-fable-5-1' }); // past the 1-hour cache (lane cache-warmth-tiles)
  const follow = (w, sid, fields) => {
    const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: w.P, name: sid, cwd: w.root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } }, ...fields };
    w.sessions.set(sid, s); // NO own link — it follows the pool default
    return s;
  };
  const perSessionWorld = (roster, engineModule = engMod) => {
    const w = mkWorld({ roster, sameDeadline: true, engineModule });
    if (!w) return null;
    w.am.setPoolTarget(w.P, w.id.alt); // the DEFAULT is healthy: only the per-session pass acts here
    const t = Date.now();
    w.mkSession('sess-hot', 'cur', inTurn(t));
    w.mkSession('sess-cold', 'cur', coldIdle(t));
    return w;
  };
  const w = perSessionWorld(SOFT);
  if (!w) { ok('§18 SKIP — pools unsupported on this platform', true); }
  else {
    const c1 = quiet(); w.eng.maybePoolAutoSwitchForPool(w.P); const l1 = c1.done().filter((l) => /\[pool\]/.test(l));
    ok('§18 (b) the COLD sibling on the soft-exhausted member moves at once', w.linkOf('sess-cold') === 'alt', w.linkOf('sess-cold') + ' | ' + l1.join(' | ').slice(0, 300));
    ok('§18 (a) THE RULE: the warm conversation mid-turn is NOT moved by the tick', w.linkOf('sess-hot') === 'cur', w.linkOf('sess-hot') + ' | ' + l1.join(' | ').slice(0, 300));
    ok('§18 (a) …the defer SPEAKS once in the journal, naming the bucket, both numbers and where it goes at its first stop — by the member\'s NAME (verifier INFO-a)',
      l1.filter((l) => /\[pool\] defer sess-hot/.test(l)).length === 1
      && l1.includes(`[pool] defer sess-hot: soft-exhausted (5h 7% < hot 10%) but mid-turn with a warm cache — moves at its first stop (to Member Alt)`), l1.join(' | ').slice(0, 400));
    ok('§18 (a) …and posts NO user notice for the deferred conversation (the cold one\'s move notice is the only one)',
      w.notices.length === 1 && /sess-cold/.test(w.notices[0]) && !w.notices.some((n) => /sess-hot/.test(n)), JSON.stringify(w.notices).slice(0, 300));
    const c2 = quiet(); w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }); const l2 = c2.done().filter((l) => /\[pool\]/.test(l));
    ok('§18 (a) the next tick defers again, SILENTLY (one line per (pool, conversation) per 10 min)', w.linkOf('sess-hot') === 'cur' && !l2.some((l) => /defer sess-hot/.test(l)), l2.join(' | ').slice(0, 300));
    // THE FIRST STOP: the turn ends. A default switch seconds ago closed the 10 s
    // eval gate — the owed move must still happen IN THIS CALL, not a later tick.
    w.eng._poolAutoLast.set(w.P, Date.now());
    const sh = w.sessions.get('sess-hot');
    sh._isStreaming = false; sh._turnState = 'idle'; sh._lastRequestAt = Date.now() - 1e3; // the cache is still warm at the stop — accepted
    const c3 = quiet(); w.eng.noteTurnEnd(sh); const l3 = c3.done().filter((l) => /\[pool\]/.test(l));
    ok('§18 (a) FIRST STOP: the turn-end boundary moves it IN THAT CALL (gate closed, cache still warm)', w.linkOf('sess-hot') === 'alt', w.linkOf('sess-hot') + ' | ' + l3.join(' | ').slice(0, 300));
    ok('§18 (a) …with the normal switch notice', w.notices.some((n) => /conversation "sess-hot" moved to Member Alt/.test(n)), JSON.stringify(w.notices).slice(0, 300));

    // NEGATIVE CONTROL ①: the pre-fix engine (2.369.149 — no inTurn) moves the warm mid-turn conversation at once.
    const mutA = mutate('src/server/usage-pool-engine.js', 'softps', [[
      ', inTurn: conversationInTurn({ isStreaming: s2._isStreaming, turnState: s2._turnState }) };',
      ' }; // PRE-FIX (2.369.149): no inTurn — a soft move is never deferred',
    ]]);
    ok('§18 (a) NEGATIVE CONTROL: the patch hit the product source', mutA.hit === true, mutA.why || '');
    if (mutA.hit) {
      const wm = perSessionWorld(SOFT, mutA.mod);
      const c = quiet(); wm.eng.maybePoolAutoSwitchForPool(wm.P); c.done();
      ok('§18 (a) NEGATIVE CONTROL: pre-fix, the warm mid-turn conversation IS moved by the tick (the cold start mid-turn)', wm.linkOf('sess-hot') === 'alt', wm.linkOf('sess-hot'));
    }
    // NEGATIVE CONTROL ②: without the boundary's force the closed gate swallows the first stop.
    const mutG = mutate('src/server/usage-pool-engine.js', 'softgate', [[
      'maybePoolAutoSwitchForPool(session._accountId, force || now != null ? { ...(force ? { force: true } : {}), ...(now != null ? { now } : {}) } : undefined);',
      'maybePoolAutoSwitchForPool(session._accountId, now != null ? { now } : undefined); // PRE-FIX: the stop is an ordinary kick',
    ]]);
    ok('§18 (a) GATE CONTROL: the patch hit the product source', mutG.hit === true, mutG.why || '');
    if (mutG.hit) {
      const wg = perSessionWorld(SOFT, mutG.mod);
      const c = quiet(); wg.eng.maybePoolAutoSwitchForPool(wg.P); c.done();
      wg.eng._poolAutoLast.set(wg.P, Date.now());
      const s = wg.sessions.get('sess-hot'); s._isStreaming = false; s._turnState = 'idle';
      const c2b = quiet(); wg.eng.noteTurnEnd(s); c2b.done();
      ok('§18 (a) GATE CONTROL: without the force the first stop is lost to the 10 s gate — the move waits for a later tick', wg.linkOf('sess-hot') === 'cur', wg.linkOf('sess-hot'));
    }
  }

  // (a') THE AUTHORITATIVE TURN STATE, through the REAL stdout pipeline: the CLI's
  // `result` arrives while its own turn state still says 'running' (idle is strictly
  // later), so the boundary defers again and the move is made on the idle record.
  const authRun = (engineModule = engMod) => {
    const wa = mkWorld({ roster: SOFT, sameDeadline: true, engineModule });
    wa.am.setPoolTarget(wa.P, wa.id.alt);
    const s = wa.mkSession('sess-auth', 'cur', { _spawnModel: 'claude-fable-5-1' });
    s._normalizer = createMessageManager('claude', 'sess-auth');
    const { so } = mkStdout(wa);
    const pty = mkPty(); so.setupSessionPty(s, 'sess-auth', pty);
    const feed = (o) => pty.data(JSON.stringify(o) + '\n');
    const out = {};
    const c = quiet();
    feed({ type: 'system', subtype: 'session_state_changed', state: 'running', session_id: 'cid-sess-auth' });
    s._lastRequestAt = Date.now() - 5e3; // the liveness stamp setupSessionPty wires (the fake pty keeps only the LAST onData callback, the consumer's) — the conversation just produced output
    wa.eng.maybePoolAutoSwitchForPool(wa.P);
    out.afterTick = wa.linkOf('sess-auth');
    feed({ type: 'result', subtype: 'success', session_id: 'cid-sess-auth' });
    out.afterResult = wa.linkOf('sess-auth');
    out.stateAtResult = s._turnState;
    feed({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: 'cid-sess-auth' });
    out.afterIdle = wa.linkOf('sess-auth');
    out.lines = c.done().filter((l) => /\[pool\]/.test(l));
    out.notices = wa.notices;
    return out;
  };
  if (w) {
    const r = authRun();
    ok('§18 (a\') authoritative: a warm conversation whose harness says running is deferred by the tick', r.afterTick === 'cur', r.afterTick + ' | ' + r.lines.join(' | ').slice(0, 300));
    ok('§18 (a\') …the `result` boundary still reads running, so the move stays owed', r.afterResult === 'cur' && r.stateAtResult === 'running', r.afterResult + '/' + r.stateAtResult);
    ok('§18 (a\') …and the harness\'s own idle record is the first stop: moved on that record, notice posted',
      r.afterIdle === 'alt' && r.notices.some((n) => /conversation "sess-auth" moved to Member Alt/.test(n)), r.afterIdle + ' | ' + JSON.stringify(r.notices).slice(0, 200));
    const mutI = mutate('src/server/usage-pool-engine.js', 'softidle', [[
      "    if (!session || !session._accountId) return;\n",
      "    return; // PRE-FIX: the idle record re-decides nothing\n",
    ]]);
    ok('§18 (a\') NEGATIVE CONTROL: the patch hit the product source', mutI.hit === true, mutI.why || '');
    if (mutI.hit) {
      const rm = authRun(mutI.mod);
      ok('§18 (a\') NEGATIVE CONTROL: without the idle hook the authoritative conversation is still on the spent member after it stopped', rm.afterIdle === 'cur', rm.afterIdle);
    }
  }

  // (c) THE HARD BAND never waits: the warm mid-turn conversation moves at once.
  // Control = an over-broad defer (a pure copy that also defers the hard band).
  const hardRun = (engineModule = engMod) => {
    const wh = perSessionWorld(HARD, engineModule);
    const c = quiet(); wh.eng.maybePoolAutoSwitchForPool(wh.P); const lines = c.done().filter((l) => /\[pool\]/.test(l));
    return { wh, lines };
  };
  const overBroad = () => {
    const pure = mutate('src/account-pool-auto.js', 'softhardpure', [[
      '    if (hardDead) {\n',
      '    if (hardDead && !(warm && warm.warm && warm.inTurn)) { // OVER-BROAD: the hard band defers too\n',
    ]]);
    if (!pure.hit) return pure;
    return mutate('src/server/usage-pool-engine.js', 'softhardeng', [[
      "require('../account-pool-auto.js');",
      'require(' + JSON.stringify(pure.file) + ');',
    ]]);
  };
  if (w) {
    const { wh, lines } = hardRun();
    ok('§18 (c) HARD band: the warm mid-turn conversation moves at once', wh.linkOf('sess-hot') === 'alt' && wh.linkOf('sess-cold') === 'alt', wh.linkOf('sess-hot') + ' | ' + lines.join(' | ').slice(0, 300));
    ok('§18 (c) …no defer line, and its move notice is posted', !lines.some((l) => /defer/.test(l)) && wh.notices.some((n) => /sess-hot/.test(n)), JSON.stringify(wh.notices).slice(0, 200));
    const ob = overBroad();
    ok('§18 (c) NEGATIVE CONTROL: the patch hit the product source', ob.hit === true, ob.why || '');
    if (ob.hit) {
      const { wh: wo } = hardRun(ob.mod);
      ok('§18 (c) NEGATIVE CONTROL: a copy that defers the hard band too leaves the conversation on a member under the hard bar', wo.linkOf('sess-hot') === 'cur', wo.linkOf('sess-hot'));
    }
  }

  // (d)/(e) THE POOL DEFAULT — NO SOFT HOLD (owner ruling 2026-09-22, design-reset-
  // credits §8 ③, reversing 2.369.153's first-stop rule at this site). A follower of
  // the pool default has no link of its own: it is LEGACY and gets no compatibility.
  // The default's SOFT move is made at once, like a cold conversation's — even with
  // a warm follower mid-turn — while 2.369.149's PROACTIVE warm-cache hold stays
  // (§17 above pins it). The per-session first-stop rule (a–c) is untouched.
  const defaultWorld = (roster, engineModule = engMod) => {
    const wd = mkWorld({ roster, sameDeadline: true, engineModule }); // default = roster[0] = cur
    const t = Date.now();
    follow(wd, 'fol-turn', inTurn(t));
    follow(wd, 'fol-idle', { _isStreaming: false, _turnState: 'idle', _lastRequestAt: t - 5e3, _spawnModel: 'claude-fable-5-1' });
    follow(wd, 'fol-cold', coldIdle(t));
    return wd;
  };
  // the PRE-RULING shape (2.369.153): the default computed `inTurn` and held its
  // soft move while a warm follower was mid-turn
  const HELD_DEFAULT = [
    '      const w = warmCache({ ...cacheFactsOf(s, now), nowMs: now });\n',
    '      const w = { ...warmCache({ ...cacheFactsOf(s, now), nowMs: now }), inTurn: conversationInTurn({ isStreaming: s._isStreaming, turnState: s._turnState }) }; // PRE-RULING (2.369.153)\n',
  ];
  const HELD_PICK = [ // …and its pick: a mid-turn follower outranked every idle one
    '      if (!defaultWarm || w.ttlSec - w.agoSec > defaultWarm.ttlSec - defaultWarm.agoSec) { defaultWarm = w; defaultWarmSid = sid; }\n',
    '      if (!defaultWarm || (w.inTurn && !defaultWarm.inTurn) || (w.inTurn === defaultWarm.inTurn && w.ttlSec - w.agoSec > defaultWarm.ttlSec - defaultWarm.agoSec)) { defaultWarm = w; defaultWarmSid = sid; } // PRE-RULING\n',
  ];
  if (w) {
    const wd = defaultWorld(SOFT);
    const c1 = quiet(); wd.eng.maybePoolAutoSwitchForPool(wd.P); const l1 = c1.done().filter((l) => /\[pool\]/.test(l));
    ok('§18 (d) default soft-exhausted with a warm MID-TURN follower: the default MOVES AT ONCE (no soft hold for legacy followers)', wd.am.poolCurrent(wd.P) === wd.id.alt, wd.am.poolCurrent(wd.P) + ' | ' + l1.join(' | ').slice(0, 300));
    ok('§18 (d) …no defer line, and the normal pool switch notice is posted', !l1.some((l) => /defer|hold/.test(l)) && wd.notices.some((n) => /auto-switched to Member Alt \(previous account down to 7% remaining\)/.test(n)), l1.join(' | ').slice(0, 300) + ' | ' + JSON.stringify(wd.notices).slice(0, 200));
    ok('§18 (d) …every follower moves with it (one credential path) — no per-session link is created for any of them',
      ['fol-turn', 'fol-idle', 'fol-cold'].every((sid) => wd.am.poolCurrentFor(wd.P, sid) === wd.id.alt && !fs.existsSync(wd.am.sessionPoolLinkPath(wd.P, sid))));
    const mutD = mutate('src/server/usage-pool-engine.js', 'softdef', [HELD_DEFAULT, HELD_PICK]);
    ok('§18 (d) NEGATIVE CONTROL: the patch hit the product source', mutD.hit === true, mutD.why || '');
    if (mutD.hit) {
      const wdm = defaultWorld(SOFT, mutD.mod);
      const c = quiet(); wdm.eng.maybePoolAutoSwitchForPool(wdm.P); c.done();
      ok('§18 (d) NEGATIVE CONTROL: the pre-ruling copy (inTurn at the default) HOLDS the default — the leg can see the hold', wdm.am.poolCurrent(wdm.P) === wdm.id.cur, wdm.am.poolCurrent(wdm.P));
    }
    const we = defaultWorld(HARD);
    const c4 = quiet(); we.eng.maybePoolAutoSwitchForPool(we.P); const l4 = c4.done().filter((l) => /\[pool\]/.test(l));
    ok('§18 (e) default HARD-exhausted: all three followers move now (the default re-points at once)', we.am.poolCurrent(we.P) === we.id.alt && !l4.some((l) => /defer/.test(l)), we.am.poolCurrent(we.P) + ' | ' + l4.join(' | ').slice(0, 300));
    // control: the over-broad pure copy (the hard band defers too) ON the pre-ruling
    // engine — the only shape that could hold a hard-exhausted default
    const pure = mutate('src/account-pool-auto.js', 'softhardpure-e', [[
      '    if (hardDead) {\n',
      '    if (hardDead && !(warm && warm.warm && warm.inTurn)) { // OVER-BROAD: the hard band defers too\n',
    ]]);
    const obE = pure.hit ? mutate('src/server/usage-pool-engine.js', 'softhardeng-e', [["require('../account-pool-auto.js');", 'require(' + JSON.stringify(pure.file) + ');'], HELD_DEFAULT, HELD_PICK]) : pure;
    if (obE.hit) {
      const weo = defaultWorld(HARD, obE.mod);
      const c = quiet(); weo.eng.maybePoolAutoSwitchForPool(weo.P); c.done();
      ok('§18 (e) NEGATIVE CONTROL: the over-broad pre-ruling copy holds a HARD-exhausted default — the leg can see it', weo.am.poolCurrent(weo.P) === weo.id.cur, weo.am.poolCurrent(weo.P));
    } else ok('§18 (e) NEGATIVE CONTROL: the patch hit the product source', false, obE.why || '');
  }
  // (f) LOW-2 (the verifier): A STOP INSIDE THE 10 s WINDOW STILL MOVES A TURN THE
  // POOL NEVER EVALUATED WHILE IT RAN. No tick saw the turn, so nothing was recorded
  // as owed; a default switch seconds ago closed the eval gate; the stop is the first
  // time the pool looks. The stop forces the re-decide, owed or not — at the turn-end
  // boundary AND at the authoritative idle record. Control = the PRE-FIX engine: the
  // owed-move map, the boundary's force and the idle hook both gated on it.
  const preFixOwed = () => mutate('src/server/usage-pool-engine.js', 'softowed', [
    ['const _warmHoldLogAt = new Map();', 'const _softDeferred = new Map(); // PRE-FIX: the owed-move map\nconst _warmHoldLogAt = new Map();'],
    ["if (ds && ds.reason === 'warm-soft-defer') { noteWarmHold(", "if (ds && ds.reason === 'warm-soft-defer') { _softDeferred.set(poolId + ':' + sid, 1); noteWarmHold("],
    ['    const force = forced || (stop\n', "    const force = forced || (stop && _softDeferred.has(session._accountId + ':' + session._webuiId) // PRE-FIX: forced only for an owed move\n"],
    ['    if (!session || !session._accountId) return;\n    maybePoolAutoSwitch(session, { stop: true });',
      "    if (!session || !session._accountId || !_softDeferred.has(session._accountId + ':' + session._webuiId)) return; // PRE-FIX: only an owed move\n    maybePoolAutoSwitch(session, { stop: true });"],
  ]);
  const neverEvaluated = (engineModule = engMod) => {
    const wn = perSessionWorld(SOFT, engineModule);
    wn.eng._poolAutoLast.set(wn.P, Date.now()); // the gate closed before the pool ever looked at this turn
    const s = wn.sessions.get('sess-hot');
    s._isStreaming = false; s._turnState = 'idle'; s._lastRequestAt = Date.now() - 1e3; // the stop, cache still warm
    const c = quiet(); wn.eng.noteTurnEnd(s); const lines = c.done().filter((l) => /\[pool\]/.test(l));
    return { wn, lines };
  };
  const authNeverEvaluated = (engineModule = engMod) => {
    const wa = mkWorld({ roster: SOFT, sameDeadline: true, engineModule });
    wa.am.setPoolTarget(wa.P, wa.id.alt);
    const s = wa.mkSession('sess-auth', 'cur', { _spawnModel: 'claude-fable-5-1' });
    s._normalizer = createMessageManager('claude', 'sess-auth');
    const { so } = mkStdout(wa);
    const pty = mkPty(); so.setupSessionPty(s, 'sess-auth', pty);
    const feed = (o) => pty.data(JSON.stringify(o) + '\n');
    const out = {};
    const c = quiet();
    feed({ type: 'system', subtype: 'session_state_changed', state: 'running', session_id: 'cid-sess-auth' });
    s._lastRequestAt = Date.now() - 5e3;
    wa.eng._poolAutoLast.set(wa.P, Date.now()); // no tick ever saw the turn, and the gate is closed
    feed({ type: 'result', subtype: 'success', session_id: 'cid-sess-auth' });
    out.afterResult = wa.linkOf('sess-auth');
    feed({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: 'cid-sess-auth' });
    out.afterIdle = wa.linkOf('sess-auth');
    out.lines = c.done().filter((l) => /\[pool\]/.test(l));
    out.notices = wa.notices;
    return out;
  };
  if (w) {
    const { wn, lines } = neverEvaluated();
    ok('§18 (f) LOW-2: a turn the pool never evaluated while it ran is moved AT ITS STOP although the stop lands inside the 10 s eval window',
      wn.linkOf('sess-hot') === 'alt' && wn.notices.some((n) => /conversation "sess-hot" moved to Member Alt/.test(n)), wn.linkOf('sess-hot') + ' | ' + lines.join(' | ').slice(0, 300));
    const ra = authNeverEvaluated();
    ok('§18 (f) LOW-2 authoritative: the `result` boundary still reads running (decided in-turn, nothing moved)', ra.afterResult === 'cur', ra.afterResult);
    ok('§18 (f) LOW-2 authoritative: …and the idle record inside the window moves it though nothing was recorded as owed',
      ra.afterIdle === 'alt' && ra.notices.some((n) => /conversation "sess-auth" moved to Member Alt/.test(n)), ra.afterIdle + ' | ' + ra.lines.join(' | ').slice(0, 300));
    const mutO = preFixOwed();
    ok('§18 (f) LOW-2 NEGATIVE CONTROL: the patch hit the product source', mutO.hit === true, mutO.why || '');
    if (mutO.hit) {
      const { wn: wo } = neverEvaluated(mutO.mod);
      ok('§18 (f) LOW-2 NEGATIVE CONTROL: pre-fix, the stop inside the window is swallowed by the gate — still on the soft-exhausted member',
        wo.linkOf('sess-hot') === 'cur', wo.linkOf('sess-hot'));
      const rao = authNeverEvaluated(mutO.mod);
      ok('§18 (f) LOW-2 NEGATIVE CONTROL: pre-fix, the authoritative idle record re-decides nothing — still on the soft-exhausted member',
        rao.afterIdle === 'cur', rao.afterIdle);
    }
  }

  // (g) LOW-3 (the verifier): A NEW DEFERRAL EPISODE SPEAKS. Episode 1 defers and
  // moves at the stop; a minute later the conversation's NEW member is the soft-
  // exhausted one while it is in its next turn — a new owed move, inside the first
  // line's 10-min floor, and the journal must say it. Control = the engine whose
  // re-point keeps the conversation's throttle keys.
  const twoEpisodes = (engineModule = engMod) => {
    const we = perSessionWorld(SOFT, engineModule);
    const defers = [];
    const run = (fn) => { const c = quiet(); fn(); defers.push(...c.done().filter((l) => /\[pool\] defer sess-hot/.test(l))); };
    run(() => we.eng.maybePoolAutoSwitchForPool(we.P)); // episode 1: deferred
    const s = we.sessions.get('sess-hot');
    s._isStreaming = false; s._turnState = 'idle';
    run(() => we.eng.noteTurnEnd(s)); // …and moved at its first stop
    const moved = we.linkOf('sess-hot');
    const cAlt = we.readCache(we.id.alt), cCur = we.readCache(we.id.cur);
    // a FRESH reading of each (the estimator's 30 s memo yields only to newer ground truth)
    we.writeCache(we.id.alt, { ...cAlt, fetchedAt: Date.now(), fiveHour: { ...cAlt.fiveHour, utilization: 0.93 } });
    we.writeCache(we.id.cur, { ...cCur, fetchedAt: Date.now(), fiveHour: { ...cCur.fiveHour, utilization: 0.05 } });
    // episode 2: its next turn, warm, on a member now soft-exhausted — its request comes AFTER the move (lane
    // cache-warmth-tiles: a stamp before the move is the old account's cache, read cold — the move is the cache lost)
    Object.assign(s, inTurn(Date.now()), { _lastRequestAt: Date.now() + 1 });
    run(() => we.eng.maybePoolAutoSwitchForPool(we.P, { force: true }));
    return { we, defers, moved };
  };
  if (w) {
    const { we, defers, moved } = twoEpisodes();
    ok('§18 (g) LOW-3: episode 1 deferred, then moved at its stop', moved === 'alt', moved);
    ok('§18 (g) LOW-3: two deferral episodes inside 10 min ⇒ TWO defer lines, the second naming its own target',
      defers.length === 2 && defers[1] === '[pool] defer sess-hot: soft-exhausted (5h 7% < hot 10%) but mid-turn with a warm cache — moves at its first stop (to Member Cur)',
      JSON.stringify(defers).slice(0, 400));
    ok('§18 (g) LOW-3: …and episode 2 is deferred (still on the member it moved to)', we.linkOf('sess-hot') === 'alt', we.linkOf('sess-hot'));
    const mutT = mutate('src/server/usage-pool-engine.js', 'softthrottle', [[
      "        _warmHoldLogAt.delete(poolId + ':' + sid); _warmHoldLogAt.delete(poolId + ':' + sid + ':soft');",
      '        // PRE-FIX: a re-point keeps the throttle keys',
    ]]);
    ok('§18 (g) LOW-3 NEGATIVE CONTROL: the patch hit the product source', mutT.hit === true, mutT.why || '');
    if (mutT.hit) {
      const { defers: dt } = twoEpisodes(mutT.mod);
      ok('§18 (g) LOW-3 NEGATIVE CONTROL: pre-fix, the second episode is swallowed by the first one\'s 10-min floor — one line', dt.length === 1, JSON.stringify(dt).slice(0, 300));
    }
  }

}


// ═══ §19 THE SPARE LANE AT A SPAWN (B-8a65) ══════════════════════════════════
// The incident's frozen caches: Member P (the pool DEFAULT) is the one member with Fable left (40 %); the
// other four read Fable ≤ 1 %. The REAL chooser places a new conversation: an OPUS spawn starts on a
// Fable-spent member that can settle (the soonest week among them, F), so P's 7d stays for the Fable
// conversations that need it; a FABLE spawn starts exactly where the pool started it before this change.
// S5 (owner 2026-10-03): the hot pool's per-session pass moves an IDLE running Opus conversation the same way.
console.log('— §19 the spare lane at a spawn');
{
  const w = mkWorld();
  if (!w) { ok('§19 SKIP — pools unsupported on this platform', true); }
  else {
    const tag = (id) => Object.keys(w.id).find((k) => w.id[k] === id) || String(id);
    const place = (eng, P, model, hinted = false) => { const c = quiet(); try { return eng.poolChooserForModel(P, { model, hinted }); } finally { c.done(); } };
    ok('§19 setup: the pool default is the Fable-rich member (P)', w.am.poolCurrent(w.P) === w.id.personal, tag(w.am.poolCurrent(w.P)));
    ok('§19 an OPUS spawn starts on a Fable-SPENT member — F (Fable 0 %, the soonest week of the spent four)', tag(place(w.eng, w.P, 'claude-opus-4-8')) === 'fish', tag(place(w.eng, w.P, 'claude-opus-4-8')));
    ok('§19 a FABLE spawn stays on the default (P), the only member whose Fable can serve it', tag(place(w.eng, w.P, 'claude-fable-5-1')) === 'personal' && tag(place(w.eng, w.P, 'claude-fable-5-1[1m]')) === 'personal');
    ok('§19 a spawn with no model (no family, no projection) stays on the default', tag(place(w.eng, w.P, null)) === 'personal');
    ok('§19 the chooser MOVES nothing: the pool default is untouched after every placement', w.am.poolCurrent(w.P) === w.id.personal);
    // the default already on a Fable-spent member: an Opus spawn has nowhere strictly less spare to go
    w.am.setPoolTarget(w.P, w.id.wmax);
    ok('§19 a default that is itself Fable-spent (W) keeps an Opus spawn (strictly less only — F ties at 0 %)', tag(place(w.eng, w.P, 'claude-opus-4-8')) === 'wmax');
    ok('§19 …and a Fable spawn leaves it for P exactly as before (W\'s Fable is its constraint — never spare)', tag(place(w.eng, w.P, 'claude-fable-5-1')) === 'personal');
    w.am.setPoolTarget(w.P, w.id.personal);
    // S5 (owner 2026-10-03, Q2 = yes): the per-session pass of this HOT pool moves an IDLE Opus conversation off P
    {
      const w5 = mkWorld();
      w5.mkSession('sp-opus', 'personal', { _spawnModel: 'claude-opus-4-8' });                                // cold: no output on record
      w5.mkSession('sp-warm', 'personal', { _spawnModel: 'claude-opus-4-8', _lastRequestAt: Date.now() });     // warm: output this second
      w5.mkSession('sp-fable', 'personal', { _spawnModel: 'claude-fable-5-1' });
      const c5 = quiet(); w5.eng.maybePoolAutoSwitchForPool(w5.P); const l5 = c5.done();
      ok('§19 S5: a COLD Opus conversation on P moves to a Fable-spent member (F)', w5.linkOf('sp-opus') === 'fish', w5.linkOf('sp-opus') + ' | ' + l5.filter((l) => /\[pool\]/.test(l)).join(' | ').slice(0, 240));
      ok('§19 S5: …a WARM one stays on P (the warm hold)', w5.linkOf('sp-warm') === 'personal', w5.linkOf('sp-warm'));
      ok('§19 S5: …a FABLE conversation is never moved for it', w5.linkOf('sp-fable') === 'personal', w5.linkOf('sp-fable'));
      ok('§19 S5: …and the ONE notice names the cap it keeps and where',
        w5.notices.length === 1 && w5.notices[0] === 'Pool "全部": conversation "sp-opus" moved to Member F — it does not use Fable, so the Fable quota on Member P is kept for the conversations that do.', JSON.stringify(w5.notices));
      const key = JSON.stringify('Pool "{pool}": conversation "{title}" moved to {target} — it does not use {lane}, so the {lane} quota on {source} is kept for the conversations that do.');
      ok('§19 S5: …worded in zh and ja too (the key is in both dictionaries)', ['zh', 'ja'].every((l) => fs.readFileSync(path.join(REPO, `src/lib/i18n-${l}.js`), 'utf8').includes(key + ': ')));
      const w6 = mkWorld({ sameDeadline: true });
      w6.mkSession('sp-w', 'wmax', { _spawnModel: 'claude-opus-4-8' });
      const c6 = quiet(); w6.eng.maybePoolAutoSwitchForPool(w6.P); c6.done();
      ok('§19 S5: an Opus conversation already on a Fable-spent member (W) has no better member ⇒ stays, nothing said', w6.linkOf('sp-w') === 'wmax' && w6.notices.length === 0, w6.linkOf('sp-w') + ' ' + JSON.stringify(w6.notices).slice(0, 200));
    }
    // VERIFY r1: a RESUME's family is a guess (a claude resume commands no model; the instance default stands in) —
    // a Fable conversation hinted as Opus must start where the pool would have put it, never on a Fable-spent member
    ok('§19 r1: a HINTED family places nothing — an Opus-hinted resume starts on the default (P)', tag(place(w.eng, w.P, 'claude-opus-4-8', true)) === 'personal');
    {
      const mh = mutate('src/server/usage-pool-engine.js', 'hintplace', [['hot: true, placing: !hinted, readLogin:', 'hot: true, placing: true /* PATCHED: a guess places */, readLogin:']]);
      const wh = mh.hit ? mkWorld({ engineModule: mh.mod }) : null;
      const gotH = wh ? place(wh.eng, wh.P, 'claude-opus-4-8', true) : null;
      ok('§19 r1 CONTROL: placing on the hint puts the (Fable) resume on F, whose Fable is spent', !!wh && gotH === wh.id.fish, mh.why || String(gotH));
    }
    // NEGATIVE CONTROL: the chooser without the one word
    const mut = mutate('src/server/usage-pool-engine.js', 'noplacing', [[
      'hot: true, placing: !hinted, readLogin: poolReadLogin(), membership,',
      'hot: true, /* PRE-CHANGE: no placing */ readLogin: poolReadLogin(), membership,',
    ]]);
    ok('§19 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const w2 = mkWorld({ engineModule: mut.mod });
      const o2 = place(w2.eng, w2.P, 'claude-opus-4-8'), f2 = place(w2.eng, w2.P, 'claude-fable-5-1');
      ok('§19 NEGATIVE CONTROL: pre-change, an Opus spawn started on the Fable-rich default (P) — spending the 7d its Fable needs', o2 === w2.id.personal, String(o2));
      ok('§19 NEGATIVE CONTROL: …and a Fable spawn on P, the same member as now', f2 === w2.id.personal, String(f2));
    }
  }
}

// ═══ §20 THE SPARE LANE'S DWELL (B-8a65, verify r1 L3, design desk 2026-10-02) ═════════════
// verify r1's F3 replay: the ONLY Fable-spent member (F) sits on its 5h settle line (13 % ± 4 left, seeded
// jitter), its week later than the rich members' (the deadline tier stays silent). On the 3-min belt every
// crossing re-pointed an idle Opus conversation P → F and the wobble threw it back — each move a cold start.
// A 'spare-lane' move now waits SPARE_DWELL_MS (1 h) after the conversation's last move; the move OFF F when
// its 5h dips keeps the 3-min belt. MIN_GAIN, the settle line and the inherited EDF jitter (F3b) are untouched.
console.log('— §20 a spare-lane move waits an hour after the conversation\'s last move');
{
  const F3 = [
    { tag: 'personal', name: 'P', u5: 0.2, u7: 0.3, fable: 0.30, hoursOut: 40 },
    { tag: 'fish', name: 'F', u5: 0.87, u7: 0.5, fable: 1.0, hoursOut: 100 },
    { tag: 'wmax', name: 'R', u5: 0.2, u7: 0.3, fable: 0.30, hoursOut: 120 }];
  // 120 ticks × 60 s on a mocked clock; a move ONTO F (the one Fable-spent member) is a spare-lane move
  const replay = (engineModule) => {
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const realNow = Date.now; let T = realNow();
    Date.now = () => T;
    try {
      const w = mkWorld({ engineModule, roster: F3 });
      if (!w) return null;
      w.mkSession('x', 'personal', { _spawnModel: 'claude-opus-4-8' });
      const hops = []; let prev = w.linkOf('x');
      for (let i = 0; i < 120; i++) {
        T += 60e3; const nowSec = Math.floor(T / 1000);
        for (const m of F3) {
          const u5 = Math.min(1, Math.max(0, m.u5 + (rnd() * 2 - 1) * 0.04)), r = w.nowSec + Math.round(m.hoursOut * 3600);
          w.writeCache(w.id[m.tag], { fetchedAt: T - 30e3, source: 'on-demand', fiveHour: { utilization: u5, resetsAt: nowSec + 4 * 3600 }, sevenDay: { utilization: m.u7, resetsAt: r }, scopedWeekly: [{ name: 'Fable', utilization: m.fable, resetsAt: r }] });
        }
        const q = quiet(); try { w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }); } finally { q.done(); }
        const cur = w.linkOf('x'); if (cur !== prev) { hops.push(i + ':' + prev + '>' + cur); prev = cur; }
      }
      return { moves: hops.length, spare: hops.filter((h) => h.endsWith('>fish')).length, hops: hops.join(',') };
    } finally { Date.now = realNow; }
  };
  const now1 = replay(engMod);
  if (!now1) { ok('§20 SKIP — pools unsupported on this platform', true); }
  else {
    ok('§20 F3 replay, 2 h of 60 s ticks: at most 2 spare-lane moves (onto the spent member F)', now1.spare <= 2, JSON.stringify(now1));
    ok('§20 …the tier still MOVES (held back, not off): at least 1 spare-lane move', now1.spare >= 1, JSON.stringify(now1));
    ok('§20 …and the move OFF F when its 5h dips is never held by the hour (the 3-min belt only)', now1.moves - now1.spare >= 1, JSON.stringify(now1));
    const mut = mutate('src/server/usage-pool-engine.js', 'sparedwell', [[
      'const SPARE_DWELL_MS = 60 * 60 * 1000;',
      'const SPARE_DWELL_MS = 180000; // PATCHED: the 3-min belt',
    ]]);
    ok('§20 NEGATIVE CONTROL: the patch hit the product source', mut.hit === true, mut.why || '');
    if (mut.hit) {
      const c = replay(mut.mod);
      ok('§20 NEGATIVE CONTROL: on the 3-min belt the same replay makes more than 2 spare-lane moves', !!c && c.spare > 2, JSON.stringify(c));
    }
  }
}

// ── ㉑3e / ㉑3f «NO 5h LIMIT» AT THE WALL (lane no-5h-window r3 — acceptance r2's two MAJORS, driven) ─────────
// A member whose plan says «no 5h limit» (the dated tombstone `fiveHourAbsent`, src/quota-model.js) is still walled
// the base's way: the tombstone changes ranking and display, never the wall's KIND or the lane decider (㉑3e); and the
// banner's freshest-SIBLING base never re-creates the 5h window on it nor files a false «back» (㉑3f).
console.log('\n㉑3e/㉑3f «no 5h limit» at the wall (lane no-5h-window r3)');
{
  const usageWriteM = require(path.join(REPO, 'src/usage-cache-write.js'));
  const quotaModelM = require(path.join(REPO, 'src/quota-model.js'));
  const changes = [];
  // base-safe (a tree without the rule names the legs RED instead of crashing): no listener API, no predicate
  const listen = (f) => { if (typeof usageWriteM.onWindowChange === 'function') usageWriteM.onWindowChange(f); };
  const absentOf = (c) => (typeof quotaModelM.fiveHourAbsent === 'function' ? quotaModelM.fiveHourAbsent(c) : null);
  // the four records of a walled turn whose stream states NO 5h window (the plan week only), then a banner
  const playNo5h = (w, { banner, rawType = 'seven_day', member = 'wmax', sid = 'sess-6', midTurn = null }) => {
    const { so } = mkStdout(w);
    const s = w.sessions.get(sid);
    s._normalizer = createMessageManager('claude', sid);
    const pty = mkPty();
    so.setupSessionPty(s, sid, pty);
    const RESET = w.resets[member];
    const cap = quiet();
    pty.data(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: rawType, resetsAt: RESET, resets_at: RESET, overageStatus: 'rejected', isUsingOverage: false, unifiedWindows: { seven_day: { utilization: 0.65, resetsAt: RESET } } } }) + '\n');
    if (banner) pty.data(JSON.stringify({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: banner }] } }) + '\n');
    if (midTurn) midTurn(s); // the turn's state BEFORE `result` (noteTurnEnd clears the banner lane — acceptance r3 F3)
    pty.data(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'cid-' + sid }) + '\n');
    return { lines: cap.done(), reset: RESET };
  };
  const lift = (w, member) => {
    const c = w.readCache(w.id[member]) || {};
    w.writeCache(w.id[member], { ...c, fiveHour: undefined, fiveHourAbsent: Date.now() - 3600e3, limits: undefined });
  };
  { // ㉑3e — the GUESSED banner on a lifted member
    const w = mkWorld({ sameDeadline: true });
    if (!w) ok('㉑3e SKIP — pools unsupported on this platform', true);
    else {
      lift(w, 'wmax');
      listen((c) => changes.push(c));
      w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-fable-5-1[1m]' });
      const before = w.readCache(w.id.wmax);
      let mid = null;
      const { reset } = playNo5h(w, { banner: "You've reached your usage limit.", midTurn: (s) => { mid = { lane: s._turnBannerLane ? { ...s._turnBannerLane } : null, deferred: (s._turnLaneDefer || []).length }; } });
      const after = w.readCache(w.id.wmax);
      const s = w.sessions.get('sess-6');
      ok('㉑3e setup: the member is lifted (no 5h window, a tombstone) and the banner is a GUESSED 5h wall',
        !before.fiveHour && absentOf(before) > 0 && ClaudeCodeAdapter.parseLimitBanner("You've reached your usage limit.").guessed === true);
      ok(`㉑3e the guessed banner keeps the base wall KIND: the plan WEEK is not marked limited for days (7d ${after.sevenDay && after.sevenDay.utilization} / ${after.sevenDay && after.sevenDay.status}, reset in ${Math.round(((after.sevenDay && after.sevenDay.resetsAt) - w.nowSec) / 3600)} h)`,
        !!after.sevenDay && after.sevenDay.utilization < 1 && after.sevenDay.status !== 'limited',
        JSON.stringify(after.sevenDay));
      ok('㉑3e …and never decides the lane: read MID-TURN (before `result` clears it), no banner lane is remembered and the deferral is still pending (the evidence rule\'s)',
        !!mid && !(mid.lane && mid.lane.kind === 'sevenDay') && mid.deferred >= 1, JSON.stringify(mid));
      void s;
      ok('㉑3e …and it has no 5h window to mark on a lifted member: still no fiveHour, the tombstone stands, nothing said',
        !after.fiveHour && absentOf(after) > 0 && !changes.some((c) => c.key === w.id.wmax), JSON.stringify({ f5: after.fiveHour, ch: changes }));
      void reset;
    }
  }
  { // ㉑3f — the banner's freshest-SIBLING base on a lifted member
    const w = mkWorld({ sameDeadline: true });
    if (!w) ok('㉑3f SKIP — pools unsupported on this platform', true);
    else {
      lift(w, 'wmax');
      const own = w.readCache(w.id.wmax);
      w.writeCache(w.id.wmax, { ...own, orgUuid: 'org-n5h-merged' });
      // the org-merged machine login: FRESHER, and still holding the 5h bucket the member's plan says is gone
      w.writeCache('__global__', { fetchedAt: Date.now() + 5000, source: 'passive', orgUuid: 'org-n5h-merged', fiveHour: { utilization: 0.2, resetsAt: w.nowSec - 60 }, sevenDay: { utilization: 0.6, resetsAt: w.resets.wmax }, scopedWeekly: [] });
      const n0 = changes.length;
      listen((c) => changes.push(c));
      w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-opus-4-8' });
      playNo5h(w, { banner: "You've reached your weekly usage limit." });
      const after = w.readCache(w.id.wmax);
      ok('㉑3f setup: the member and the machine login are ONE identity, the sibling is fresher and holds a 5h bucket',
        (w.readCache('__global__').fetchedAt || 0) > (own.fetchedAt || 0) && !!w.readCache('__global__').fiveHour);
      ok('㉑3f markLimitBannerNow on a lifted member with a fresher 5h-holding sibling never re-creates the 5h window, keeps the tombstone, files no «restored»',
        !after.fiveHour && absentOf(after) > 0 && !changes.slice(n0).some((c) => c.key === w.id.wmax && c.change === 'restored'),
        JSON.stringify({ f5: after.fiveHour, abs: after.fiveHourAbsent, ch: changes.slice(n0) }));
      ok('㉑3f …and the banner still marked what it NAMED (the plan week walled)', !!after.sevenDay && (after.sevenDay.status === 'limited' || after.sevenDay.utilization >= 1), JSON.stringify(after.sevenDay));
    }
  }
  { // ㉑3h — a SIBLING's unsaid change marker never rides the banner's freshest-sibling spread (acceptance r3 MAJOR 1)
    const w = mkWorld({ sameDeadline: true });
    if (!w) ok('㉑3h SKIP — pools unsupported on this platform', true);
    else {
      const own = w.readCache(w.id.wmax);
      w.writeCache(w.id.wmax, { ...own, orgUuid: 'org-n5h-merged' }); // an ordinary member: its own 5h window, never lifted
      // the org-merged machine login, FRESHER, whose own statusline saw its 5h window come back and left it UNSAID
      w.writeCache('__global__', { fetchedAt: Date.now() + 5000, source: 'passive', orgUuid: 'org-n5h-merged', fiveHour: { utilization: 0.2, resetsAt: w.nowSec + 3600 }, sevenDay: { utilization: 0.6, resetsAt: w.resets.wmax }, scopedWeekly: [],
        windowChangeUnsaid: { kind: '5h', change: 'restored', at: Date.now(), key: '__global__' } });
      const n0 = changes.length;
      listen((c) => changes.push(c));
      w.mkSession('sess-6', 'wmax', { _spawnModel: 'claude-opus-4-8' });
      playNo5h(w, { banner: "You've reached your weekly usage limit." });
      const after = w.readCache(w.id.wmax);
      ok('㉑3h markLimitBannerNow on a member that never changed, with a fresher sibling holding an unsaid «back», files nothing on the member (the marker is the sibling\'s own) and carries no marker onto it',
        !changes.slice(n0).some((c) => c.key === w.id.wmax) && !after.windowChangeUnsaid && !!after.fiveHour, JSON.stringify({ ch: changes.slice(n0), mk: after.windowChangeUnsaid || null }));
    }
  }
  // ── r5 (acceptance r4 #1): THE ESTIMATED VIEW after a real 60-s anchor sweep — the engine's poolReadCache ────────
  const estWorld = (engineModule = engMod) => {
    const w = mkWorld({ sameDeadline: true, engineModule });
    if (!w) return null;
    lift(w, 'wmax');
    const own = w.readCache(w.id.wmax);
    w.writeCache(w.id.wmax, { ...own, orgUuid: 'org-n5h-est' });
    // the org-merged machine login: FRESHER, still holding a 90.5 % 5h window (its session never saw the lift)
    w.writeCache('__global__', { fetchedAt: Date.now() - 1000, source: 'passive', orgUuid: 'org-n5h-est', fiveHour: { utilization: 0.905, resetsAt: w.nowSec + 3 * 3600 }, sevenDay: { utilization: 0.6, resetsAt: w.resets.wmax }, scopedWeekly: [] });
    const before = w.eng.poolReadCache(w.P)(w.id.wmax);
    w.eng.sweepUsageAnchors();
    const after = w.eng.poolReadCache(w.P)(w.id.wmax);
    let anchor = null;
    try { const t = fs.readFileSync(path.join(w.dataDir, 'usage-anchors', 'anchors-org_org-n5h-est.ndjson'), 'utf8').trim().split('\n'); anchor = JSON.parse(t[t.length - 1]); } catch { }
    return { w, before, after, anchor };
  };
  { // ㉑3i
    const E = estWorld();
    if (!E) ok('㉑3i SKIP — pools unsupported on this platform', true);
    else {
      ok('㉑3i setup: a lifted member and its org-merged machine login are ONE identity, the sibling is fresher and holds a 90.5 % 5h window; before any sweep the pool reads the member with no 5h bucket (r4)',
        !E.before.fiveHour && absentOf(E.before) > 0 && !!E.w.readCache('__global__').fiveHour, JSON.stringify({ f5: E.before.fiveHour, abs: E.before.fiveHourAbsent }));
      ok('㉑3i after one real anchor sweep the ESTIMATED view the pool ranks a lifted member on (poolReadCache) still has no 5h bucket, and its «no 5h limit» stands',
        !E.after.fiveHour && absentOf(E.after) > 0, JSON.stringify({ f5: E.after.fiveHour, abs: E.after.fiveHourAbsent, est: E.after.estimated }));
      ok('㉑3i …and the sweep anchored the identity with NO 5h bucket (the week only)',
        !!E.anchor && E.anchor.buckets && E.anchor.buckets.fiveHour === null && !!E.anchor.buckets.sevenDay, JSON.stringify(E.anchor && E.anchor.buckets));
    }
  }
  // ── r5 (acceptance r4 #4): a get_usage reply is the CLI's own merged state — the stale rule holds for it too ──────
  const guWorld = (engineModule = engMod) => {
    const w = mkWorld({ sameDeadline: true, engineModule });
    if (!w) return null;
    const M = w.id.wmax, T = Date.now() - 40 * 60e3;
    // lifted 40 min ago, by the write path's own enumerating answer (its 5h window was last read an hour before that)
    w.writeCache(M, { ...w.readCache(M), fetchedAt: T - 3600e3 });
    usageWriteM.writeCacheObject({ cacheDir: w.cacheDir, key: M, obj: { ...w.readCache(M), fiveHour: undefined, limits: undefined, fetchedAt: T, source: 'on-demand' }, measuredAt: T, source: 'on-demand', backend: 'claude', absentWindows: ['5h'] });
    const seeded = w.readCache(M);
    const n0 = changes.length;
    listen((c) => changes.push(c));
    const nowS = Math.floor(Date.now() / 1000);
    // an idle session still holding a 5h window that BEGAN two hours ago (it resets in three)
    const stale = ClaudeCodeAdapter.parseGetUsageResponse({ rate_limits: { five_hour: { utilization: 30, resets_at: nowS + 3 * 3600 }, seven_day: { utilization: 60, resets_at: w.resets.wmax } } });
    w.eng.writeUsageCacheForKey(M, stale, { producer: 'ev:sess-idle' });
    const a1 = w.readCache(M), said1 = changes.slice(n0).filter((c) => c.key === M).map((c) => c.change);
    // …and a session whose window began AFTER the lift (it resets in five hours and a minute)
    const fresh = ClaudeCodeAdapter.parseGetUsageResponse({ rate_limits: { five_hour: { utilization: 3, resets_at: nowS + 5 * 3600 + 60 }, seven_day: { utilization: 61, resets_at: w.resets.wmax } } });
    w.eng.writeUsageCacheForKey(M, fresh, { producer: 'ev:sess-new' });
    const a2 = w.readCache(M), said2 = changes.slice(n0).filter((c) => c.key === M).map((c) => c.change);
    return { w, T, seeded, a1, a2, said1, said2 };
  };
  { // ㉑3j
    const G = guWorld();
    if (!G) ok('㉑3j SKIP — pools unsupported on this platform', true);
    else {
      ok('㉑3j setup: the member was lifted 40 min ago by the write path (no 5h window, the tombstone at that instant)',
        !G.seeded.fiveHour && absentOf(G.seeded) === G.T, JSON.stringify({ f5: G.seeded.fiveHour, abs: G.seeded.fiveHourAbsent, T: G.T }));
      ok('㉑3j a get_usage reply (the real writeUsageCacheForKey) from an idle session still holding a 5h window that BEGAN before the tombstone is kept out: the tombstone stands, nothing said',
        !G.a1.fiveHour && absentOf(G.a1) > 0 && G.said1.length === 0, JSON.stringify({ f5: G.a1.fiveHour, abs: G.a1.fiveHourAbsent, said: G.said1 }));
      ok('㉑3j …and one whose window began AFTER the tombstone is the window back, said once',
        !!G.a2.fiveHour && !absentOf(G.a2) && G.said2.join() === 'restored', JSON.stringify({ f5: G.a2.fiveHour, said: G.said2 }));
    }
  }
  { // the two controls: each turns its own leg red
    const mE = mutate('src/usage-estimator.js', 'r5est', [
      ['  return withOwnAbsence(out, rawCache);\n}', '  return out;\n}'],
      ['  const out = withOwnAbsence(est, rawCache);\n  return out !== est', '  const out = est;\n  return out !== est'],
      ['  const cache = withOwnAbsence(group?.cache, group?.tomb5h);\n', '  const cache = group?.cache;\n'],
    ]);
    const mEng = mE.hit ? mutate('src/server/usage-pool-engine.js', 'r5est', [["require('../usage-estimator.js')", `require(${JSON.stringify(mE.file || '')})`]]) : { hit: false, why: mE.why };
    ok('㉑3i NEGATIVE CONTROL setup: the estimator\'s three guards removed, wired into a copy of the engine', mE.hit === true && mEng.hit === true, (mE.why || '') + (mEng.why || ''));
    if (mEng.hit) {
      const E = estWorld(mEng.mod);
      ok('㉑3i CONTROL: an estimator that ignores the member\'s tombstone puts the sibling\'s 90.5 % 5h window back on the lifted member after the sweep — ㉑3i RED there',
        !!E && !!E.after.fiveHour && E.after.fiveHour.utilization > 0.9, JSON.stringify(E && E.after.fiveHour));
    }
    const mG = mutate('src/server/usage-pool-engine.js', 'r5gu', [["      authoritativeScopes: quotaModel.authoritativeScopesOf(parsed),\n      passiveAnswer: {", "      authoritativeScopes: quotaModel.authoritativeScopesOf(parsed),\n      passiveAnswerOff: {"]]);
    ok('㉑3j NEGATIVE CONTROL setup: writeUsageCacheForKey passes no passive answer (the base\'s write)', mG.hit === true, mG.why || '');
    if (mG.hit) {
      const G = guWorld(mG.mod);
      ok('㉑3j CONTROL: a get_usage write with no passive answer brings the pre-lift 5h window back and says «restored» — ㉑3j RED there',
        !!G && !!G.a1.fiveHour && G.said1.includes('restored'), JSON.stringify(G && { f5: G.a1.fiveHour, said: G.said1 }));
    }
  }
  listen(null);
}

// ── §21 THE LAST MODEL REQUEST (lane cache-warmth-tiles, 2026-11-02 — 主开发's pin): the prompt cache re-times at each
// REQUEST, so the stamp the warm-cache hold and the session list read is the stream's own request record — one writer in
// the engine (noteModelRequest), called by BOTH feeds — and pty noise never moves it once it exists. Driven through the
// REAL stdout consumer and the REAL session-brain over the REAL engine.
console.log('\n§21 the last model request is the stream\'s own request record');
{
  const w = mkWorld();
  if (!w) { ok('§21 SKIP — pools unsupported on this platform', true); }
  else {
    const reqRec = (id, extra = {}) => ({ type: 'assistant', message: { id, role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 3, output_tokens: 1, cache_read_input_tokens: 600000 } }, parent_tool_use_id: null, session_id: 'cid-sess-req', uuid: 'u-' + id, ...extra });
    const s = w.mkSession('sess-req', 'personal', { _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - 50 * 60e3 });
    ok('§21 before any request record a CHAT conversation is UNKNOWN — its pty stamp never stands in (r1a′: a restart\'s attach preamble is no request)', s.mode === 'chat' && (w.eng.cacheFactsOf?.(s, Date.now()) || {}).lastRequestAt === null, s.mode + ' ' + (w.eng.cacheFactsOf?.(s, Date.now()) || {}).lastRequestAt);
    const { so } = mkStdout(w);
    s._normalizer = createMessageManager('claude', 'sess-req');
    const pty = mkPty();
    so.setupSessionPty(s, 'sess-req', pty);
    const t0 = Date.now();
    const cap = quiet();
    pty.data(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'cid-sess-req', model: 'claude-fable-5-1' }) + '\n');
    const afterInit = s._lastRequestAt;
    pty.data(JSON.stringify(reqRec('msg_r1')) + '\n');
    const afterReq = s._lastRequestAt;
    pty.data(JSON.stringify({ type: 'assistant', message: { id: 'msg_r1b', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'no usage on this one' }] }, parent_tool_use_id: null, session_id: 'cid-sess-req', uuid: 'u-r1b' }) + '\n');
    const afterNoUsage = s._lastRequestAt;
    pty.data(JSON.stringify(reqRec('msg_old', { timestamp: new Date(Date.now() - 3 * 3600e3).toISOString() })) + '\n');
    const afterLate = s._lastRequestAt;
    cap.done();
    ok('§21 a frame that makes no request (the init) stamps nothing', afterInit === undefined, String(afterInit));
    ok('§21 THE PIN: a usage-carrying assistant record (one API response) through the REAL consumer moves the stamp', afterReq >= t0, String(afterReq));
    ok('§21 …a record with no usage does not', afterNoUsage === afterReq);
    ok('§21 …nor a BACKLOG record (stamped 3 h ago — a catch-up proves nothing about now)', afterLate === afterReq, String(afterLate - afterReq));
    s._lastPtyDataAt = Date.now() + 5; // pty noise after the request: keystroke echo, a redraw, an attach preamble
    const f = (w.eng.cacheFactsOf?.(s, Date.now() + 10) || {});
    ok('§21 THE PIN: pty noise without a request does not move it once a request stamp exists', f.lastRequestAt === afterReq && f.cacheTtlSec === 3600, JSON.stringify(f));
    // the device feed's twin: the SAME writer through session-brain's claudeSideEffects
    const brain = require(path.join(REPO, 'src/server/session-brain.js')).create({
      engine: w.eng, applyTaskToolUpdate() { }, updateSessionTodos() { },
      getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }),
    });
    const s2 = w.mkSession('sess-req2', 'personal', { _spawnModel: 'claude-fable-5-1' });
    const t1 = Date.now();
    const cap2 = quiet(); brain.claudeSideEffects(s2, 'sess-req2', reqRec('msg_r2')); cap2.done();
    ok('§21 the device feed stamps it too (claudeSideEffects → the engine\'s ONE writer)', s2._lastRequestAt >= t1, String(s2._lastRequestAt));
    // ── ROUND 2 (F2): THE CLI'S OWN RECORD IS NO REQUEST — a `<synthetic>`-model record (an API error, a limit or credit
    // refusal, «Not logged in») or one whose usage counts nothing never stamps (noteModelRequest, the ONE writer — never a
    // feed). The row is SHAPED FROM the real capture (scripts/fixtures/claude-signin/cli-2.1.308-not-logged-in.jsonl: model
    // <synthetic>, all-zero usage, `error`) with a LIVE timestamp (the capture's own is judged late — not this pin), through
    // BOTH real feeds: the stamp unchanged, a 3-h-cold conversation stays cold, a move's `lost` survives it on the new member.
    const { warmCache } = require(path.join(REPO, 'src/account-pool-auto.js'));
    const factsNow = (x) => (w.eng.cacheFactsOf?.(x, Date.now()) || {});
    const idleWarm = (x) => { x._isStreaming = false; x._turnState = 'idle'; return warmCache({ ...factsNow(x), nowMs: Date.now() }); }; // judged between turns: a turn is warm by definition
    const capRow = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/claude-signin/cli-2.1.308-not-logged-in.jsonl'), 'utf8').split('\n')[0]);
    const synth = (sid, n) => ({ ...capRow, session_id: 'cid-' + sid, uuid: 'u-syn-' + n, timestamp: new Date().toISOString(), message: { ...capRow.message, id: 'syn-' + n } });
    const zeroUse = (sid, n) => { const r = reqRec('msg_z' + n); return { ...r, session_id: 'cid-' + sid, message: { ...r.message, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }; };
    ok('§21 F2 fixture: the row is the real capture\'s shape — an assistant record, model <synthetic>, every usage counter zero, an error',
      capRow.type === 'assistant' && capRow.message.model === '<synthetic>' && capRow.error === 'authentication_failed' && ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].every((k) => capRow.message.usage[k] === 0));
    // (b) the parse feed
    const before = s._lastRequestAt;
    const cap3 = quiet(); pty.data(JSON.stringify(synth('sess-req', 1)) + '\n'); pty.data(JSON.stringify(zeroUse('sess-req', 1)) + '\n'); cap3.done();
    ok('§21 F2 THE PIN (parse feed): a <synthetic> refusal and a zero-usage record leave the stamp where it was (RED on dc59acd80)', s._lastRequestAt === before, String(s._lastRequestAt - before));
    s._lastRequestAt = Date.now() - 3 * 3600e3;
    const cold3 = s._lastRequestAt;
    const cap4 = quiet(); pty.data(JSON.stringify(synth('sess-req', 2)) + '\n'); cap4.done();
    const wc3 = idleWarm(s);
    ok('§21 F2 THE PIN (parse feed): a 3-h-cold conversation stays COLD through the <synthetic> record', s._lastRequestAt === cold3 && wc3.warm === false && wc3.agoSec >= 3 * 3600 - 5, JSON.stringify(wc3));
    // (c) the device feed
    const s3 = w.mkSession('sess-req3', 'personal', { _spawnModel: 'claude-fable-5-1', _lastRequestAt: Date.now() - 3 * 3600e3 });
    const cold3b = s3._lastRequestAt;
    const cap5 = quiet(); brain.claudeSideEffects(s3, 'sess-req3', synth('sess-req3', 3)); brain.claudeSideEffects(s3, 'sess-req3', zeroUse('sess-req3', 3)); cap5.done();
    const wc3b = idleWarm(s3);
    ok('§21 F2 THE PIN (device feed): the 3-h-cold conversation stays cold — neither record stamps (RED on dc59acd80)', s3._lastRequestAt === cold3b && wc3b.warm === false, JSON.stringify(wc3b));
    // a REAL re-point leaves the cache behind (lost); the new member's <synthetic> refusal cached nothing there
    const s4 = w.mkSession('sess-req4', 'personal', { _spawnModel: 'claude-fable-5-1' });
    const cap4a = quiet(); brain.claudeSideEffects(s4, 'sess-req4', reqRec('msg_r4a')); cap4a.done(); // a real request on its member (round 3: the writer stamps WHERE it was served)
    s4._lastRequestAt = Date.now() - 60e3;
    w.am.ensureSessionPoolLink(w.P, 'sess-req4', w.id.wmax, { why: 'per-session-switch' });
    w.am.ensureSessionPoolLink(w.P, 'sess-req', w.id.wmax, { why: 'per-session-switch' });
    s._lastRequestAt = Date.now() - 60e3;
    const lost0 = idleWarm(s4).lost === true && idleWarm(s).lost === true;
    const spin = () => { const t = Date.now(); while (Date.now() <= t + 1) { } }; // the records come after the move
    spin();
    const cap6 = quiet(); brain.claudeSideEffects(s4, 'sess-req4', synth('sess-req4', 4)); pty.data(JSON.stringify(synth('sess-req', 5)) + '\n'); cap6.done();
    const l4 = idleWarm(s4), lP = idleWarm(s);
    ok('§21 F2 THE PIN: after a real re-point, `lost` survives a <synthetic> record on the new member — device feed AND parse feed (RED on dc59acd80)', lost0 && l4.lost === true && l4.warm === false && lP.lost === true && lP.warm === false, JSON.stringify([l4, lP]));
    spin();
    const cap7 = quiet(); brain.claudeSideEffects(s4, 'sess-req4', reqRec('msg_r4')); cap7.done();
    ok('§21 F2 control: a REAL request on the new member warms it again (the gate is the record, not the feed)', idleWarm(s4).warm === true && !idleWarm(s4).lost, JSON.stringify([idleWarm(s4), factsNow(s4)]));
    const both = (src) => (src.match(/noteModelRequest\?\.\(session, msg\)/g) || []).length;
    ok('§21 WIRING: each feed calls the writer once — no inline twin',
      both(fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8')) === 1 && both(fs.readFileSync(path.join(REPO, 'src/server/session-brain.js'), 'utf8')) === 1
      && !/session\._lastRequestAt\s*=/.test(fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8') + fs.readFileSync(path.join(REPO, 'src/server/session-brain.js'), 'utf8')));
    // ── ROUND 4 (K2): THE FLIGHT INSTANT IS EVERY REQUEST'S SEND — the follow-up request a TOOL RESULT sends is a fresh write
    // of the cache, re-stamped by turn-state's request-out writer at BOTH feeds (the parity law: the parse's user-record branch
    // and the device stream's claudeSideEffects read the ONE predicate, sendsRequest, and call the ONE writer). The
    // acceptance's probe, on a clock moved back: the send at T0, the tool_use response at T0 + 5 s, a 70-min tool, its
    // tool_result 10 s ago ⇒ in flight since 10 s, warm (the pool pass on these facts: test-pool-auto K2). RED on 16c8b5252
    // by name: the parse kept T0 (older than the last stamp ⇒ the 70-min stamp read it cold); the device feed wrote nothing.
    {
      const realNow = Date.now; let skew = 0;
      const toolUse = (sid, n) => ({ type: 'assistant', message: { id: 'msg_tu' + n, role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: 'tu-' + n, name: 'Bash', input: { command: 'make check' } }], usage: { input_tokens: 3, output_tokens: 1, cache_read_input_tokens: 600000 } }, parent_tool_use_id: null, session_id: 'cid-' + sid, uuid: 'u-tu' + n });
      const toolResult = (sid, n) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu-' + n, content: 'ok' }] }, parent_tool_use_id: null, session_id: 'cid-' + sid, uuid: 'u-tr' + n });
      const prompt = (sid, n) => ({ type: 'user', message: { role: 'user', content: 'run the checks' }, parent_tool_use_id: null, session_id: 'cid-' + sid, uuid: 'u-pr' + n });
      const s5 = w.mkSession('sess-k2p', 'personal', { _spawnModel: 'claude-fable-5-1' });
      s5._normalizer = createMessageManager('claude', 'sess-k2p');
      const pty5 = mkPty(); so.setupSessionPty(s5, 'sess-k2p', pty5);
      const s6 = w.mkSession('sess-k2d', 'personal', { _spawnModel: 'claude-fable-5-1', _isStreaming: true, _turnState: 'running' }); // the parse wrote its flags
      const capK = quiet();
      Date.now = () => realNow() + skew;
      try {
        skew = -(70 * 60e3 + 15e3); // T0
        pty5.data(JSON.stringify({ type: 'system', subtype: 'session_state_changed', state: 'running', session_id: 'cid-sess-k2p', uuid: 'u-st5' }) + '\n');
        brain.claudeSideEffects(s6, 'sess-k2d', prompt('sess-k2d', 6));
        skew += 5e3; // the tool_use response
        pty5.data(JSON.stringify(toolUse('sess-k2p', 5)) + '\n');
        brain.claudeSideEffects(s6, 'sess-k2d', toolUse('sess-k2d', 6));
        skew = -10e3; // 70 min of tool, then its result
        pty5.data(JSON.stringify(toolResult('sess-k2p', 5)) + '\n');
        brain.claudeSideEffects(s6, 'sess-k2d', toolResult('sess-k2d', 6));
      } finally { Date.now = realNow; capK.done(); }
      const tK = Date.now(), fP5 = factsNow(s5), fD6 = factsNow(s6);
      const wP5 = warmCache({ ...fP5, nowMs: tK }), wD6 = warmCache({ ...fD6, nowMs: tK });
      const tenS = (f) => f.inFlight === true && Math.abs(Number(f.turnStartedAt) - (tK - 10e3)) < 2e3 && Math.abs(Number(f.lastRequestAt) - (tK - 70 * 60e3 - 10e3)) < 2e3;
      ok('§21 K2 THE PIN (parse feed): the tool_result re-stamps the send — in flight since 10 s, warm, after a 70-min tool (RED on 16c8b5252: the send instant stayed T0, read cold)',
        tenS(fP5) && wP5.warm === true && wP5.inFlight === true, JSON.stringify({ fP5: { ...fP5, turnStartedAt: fP5.turnStartedAt && tK - fP5.turnStartedAt, lastRequestAt: fP5.lastRequestAt && tK - fP5.lastRequestAt }, wP5 }));
      ok('§21 K2 THE PIN (device feed): the SAME writer on the same records — in flight since 10 s, warm (RED on 16c8b5252: the device feed never wrote the instant)',
        tenS(fD6) && wD6.warm === true && wD6.inFlight === true, JSON.stringify({ fD6: { ...fD6, turnStartedAt: fD6.turnStartedAt && tK - fD6.turnStartedAt, lastRequestAt: fD6.lastRequestAt && tK - fD6.lastRequestAt }, wD6 }));
      // a BACKLOG's tool result (a stalled bridge's catch-up, stamped 3 h ago) proves nothing about now — noteModelRequest's law
      const late = (r) => ({ ...r, timestamp: new Date(Date.now() - 3 * 3600e3).toISOString() });
      const at5 = s5._turnStartedAt, at6 = s6._turnStartedAt;
      const capL = quiet(); pty5.data(JSON.stringify(late(toolResult('sess-k2p', 7))) + '\n'); brain.claudeSideEffects(s6, 'sess-k2d', late(toolResult('sess-k2d', 8))); capL.done();
      ok('§21 K2 a backlog\'s tool result (stamped 3 h ago) re-stamps nothing — parse feed AND device feed', s5._turnStartedAt === at5 && s6._turnStartedAt === at6 && at5 > 0 && at6 > 0, JSON.stringify([s5._turnStartedAt - at5, s6._turnStartedAt - at6]));
      const parseSrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8'), brainSrc = fs.readFileSync(path.join(REPO, 'src/server/session-brain.js'), 'utf8');
      ok('§21 K2 WIRING: both feeds gate on the ONE predicate (sendsRequest) and call the ONE request-out writer — no inline twin',
        /if \(sendsRequest\(msg\)\) \{\s*if \(!authoritative\) session\._isStreaming = true;\s*\(recordIsLate\?\.\(session, msg\) \? noteTurnFlight : noteRequestSent\)\(session, Date\.now\(\)\);/.test(parseSrc)
        && /if \(sendsRequest\(msg\) && !recordIsLate\?\.\(session, msg\)\) noteRequestSent\(session, Date\.now\(\)\);/.test(brainSrc) && !/local-command-/.test(parseSrc.slice(parseSrc.indexOf('if (sendsRequest(msg))') - 400, parseSrc.indexOf('if (sendsRequest(msg))'))));
    }
    // ── LANE CACHE-WARMTH-COMPACT (2026-11-03 — userW inc-mw1aanqt-994q, B-9769; amendment 1): THE CACHE FACT IS WHAT THE
    // LAST RECORD SAID, and a compaction's END resets it until the new context's first request — ONE writer each in the engine
    // (noteModelRequest stamps the record's cache facts; noteCompacted the reset), called by BOTH feeds. The parse is fed the
    // REAL capture's order (data/session-buffers, a manual /compact): status compacting → status null + compact_result
    // success → compact_boundary → the summary's user record → the «Compacted» echo → result. RED on 749aa7bf9 by name.
    // ROUND 2 (the acceptance of a03e496e6): round 1's «the compaction's own summary record never stamps» legs are RETIRED —
    // no CLI streams such a record (nothing to pin), the writer's gate keyed off the client's /compact intent (B), and the
    // parse-feed leg compared two Date.now() stamps of one millisecond (green on the base by luck). A request that goes out
    // after the boundary ends the window — in flight, held (A; the device feed here, the parse in test-pool-auto CW4).
    {
      const cwRec = (sid, n, { read = 0, h1 = 0, m5 = 0 } = {}) => ({ type: 'assistant', message: { id: 'msg_cw' + n, role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 3, output_tokens: 40, cache_read_input_tokens: read, cache_creation_input_tokens: h1 + m5, cache_creation: { ephemeral_1h_input_tokens: h1, ephemeral_5m_input_tokens: m5 } } }, parent_tool_use_id: null, session_id: 'cid-' + sid, uuid: 'u-cw' + n });
      const cwSys = (sid, n, extra) => ({ type: 'system', session_id: 'cid-' + sid, uuid: 'u-cws' + n, ...extra });
      const cwBoundary = (sid, n) => cwSys(sid, n, { subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 270743, post_tokens: 16740, duration_ms: 78444 } });
      const cwUser = (sid, n, text) => ({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: 'cid-' + sid, uuid: 'u-cwu' + n });
      const sP = w.mkSession('sess-cw-p', 'personal', { _spawnModel: 'claude-fable-5-1' });
      sP._normalizer = createMessageManager('claude', 'sess-cw-p');
      const ptyP = mkPty(); so.setupSessionPty(sP, 'sess-cw-p', ptyP);
      const feedP = (r) => ptyP.data(JSON.stringify(r) + '\n');
      const capC = quiet();
      let p1 = null, pEnd = null, pAfter = null, cEnd = null;
      try {
        feedP(cwRec('sess-cw-p', 1, { read: 0, h1: 21000 }));
        p1 = factsNow(sP);
        feedP(cwSys('sess-cw-p', 2, { subtype: 'status', status: 'compacting' }));
        feedP(cwSys('sess-cw-p', 4, { subtype: 'status', status: null, compact_result: 'success' }));
        feedP(cwBoundary('sess-cw-p', 5));
        feedP(cwUser('sess-cw-p', 6, 'This session is being continued from a previous conversation that ran out of context.'));
        feedP(cwUser('sess-cw-p', 7, '<local-command-stdout>Compacted </local-command-stdout>'));
        feedP({ type: 'result', subtype: 'success', session_id: 'cid-sess-cw-p', uuid: 'u-cwr8' });
        pEnd = factsNow(sP); cEnd = sP._compactedAt;
        feedP(cwRec('sess-cw-p', 9, { read: 0, h1: 17000 }));
        pAfter = factsNow(sP);
      } finally { capC.done(); }
      ok('§21 CW THE PIN (parse feed): a record that wrote the 1-hour bucket ⇒ the TTL is the RECORD\'s (3600, `ttlSource: record`), observed \'created\' — the facts the hub already read for cost (RED on 749aa7bf9: no record facts)',
        p1 && p1.cacheTtlSec === 3600 && p1.ttlSource === 'record' && p1.cacheObserved === 'created' && p1.cacheCreatedTokens === 21000, JSON.stringify(p1));
      ok('§21 CW THE PIN (parse feed): the compaction\'s END (compact_boundary) ⇒ UNKNOWN until the next request — no stamp, not lost, nothing in flight, `unknownWhy: compacted`, warmCache unknown — through the summary\'s user record and the turn\'s end (RED on 749aa7bf9: warm on the old stamp)',
        pEnd && pEnd.unknownWhy === 'compacted' && pEnd.lastRequestAt === null && pEnd.lost === false && pEnd.inFlight === false && warmCache({ ...pEnd, nowMs: Date.now() }).unknown === true && Number(cEnd) > 0, JSON.stringify([pEnd, cEnd]));
      ok('§21 CW THE PIN (parse feed): the new context\'s first request ⇒ WARM again from its record (observed \'cold\': the old prefix was replaced), the reset over',
        pAfter && pAfter.unknownWhy === null && pAfter.lastRequestAt > 0 && pAfter.ttlSource === 'record' && pAfter.cacheObserved === 'cold' && !sP._compactedAt && idleWarm(sP).warm === true, JSON.stringify(pAfter));
      // the device feed's twin: the SAME writers through session-brain's claudeSideEffects
      const sD = w.mkSession('sess-cw-d', 'personal', { _spawnModel: 'claude-fable-5-1' });
      const capD = quiet();
      let d1 = null, dEnd = null, dOut = null, dAfter = null, cD = 0;
      try {
        brain.claudeSideEffects(sD, 'sess-cw-d', cwRec('sess-cw-d', 11, { m5: 9000 }));
        d1 = factsNow(sD);
        sD._isStreaming = true; sD._turnState = 'running'; // the parse's flags (an auto-compaction inside a turn): the device feed writes none
        brain.claudeSideEffects(sD, 'sess-cw-d', cwBoundary('sess-cw-d', 13));
        dEnd = factsNow(sD); cD = Number(sD._compactedAt) || 0;
        brain.claudeSideEffects(sD, 'sess-cw-d', cwUser('sess-cw-d', 15, 'This session is being continued from a previous conversation that ran out of context.')); // the continuation goes out
        dOut = factsNow(sD);
        brain.claudeSideEffects(sD, 'sess-cw-d', cwRec('sess-cw-d', 14, { read: 0, m5: 6000 }));
        sD._isStreaming = false; sD._turnState = 'idle';
        dAfter = factsNow(sD);
      } finally { capD.done(); }
      ok('§21 CW THE PIN (device feed): a record that wrote the 5-minute bucket ⇒ 300 from the record, though the member bills on the hour (`ttlSource: record`)', d1 && d1.cacheTtlSec === 300 && d1.ttlSource === 'record' && d1.cacheObserved === 'created', JSON.stringify(d1));
      ok('§21 CW THE PIN (device feed): the boundary ⇒ UNKNOWN (`compacted`, nothing in flight: the flight instant is the old context\'s); the next request ⇒ warm from its record — the SAME writers (RED on 749aa7bf9)',
        dEnd && dEnd.unknownWhy === 'compacted' && dEnd.lastRequestAt === null && dEnd.inFlight === false && dAfter && dAfter.unknownWhy === null && dAfter.cacheTtlSec === 300 && dAfter.cacheObserved === 'cold' && idleWarm(sD).warm === true,
        JSON.stringify({ dEnd, dAfter }));
      ok('§21 CW THE PIN (device feed, round 2 — A): the continuation going out after the boundary (the summary\'s user record — a request-out like any other) ENDS the window: in flight, warm by the turn law — never hidden by the reset (RED on a03e496e6: still «compacted»)',
        dOut && dOut.unknownWhy === null && dOut.inFlight === true && cD > 0 && dOut.turnStartedAt >= cD && warmCache({ ...dOut, nowMs: Date.now() }).warm === true, JSON.stringify(dOut));
      const parseSrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8'), brainSrc = fs.readFileSync(path.join(REPO, 'src/server/session-brain.js'), 'utf8');
      const one = (src) => (src.match(/noteCompacted\?\.\(session, msg\)/g) || []).length;
      ok('§21 CW WIRING: each feed calls the compaction writer once, beside the stamp writer — no inline twin (neither feed writes `_compactedAt` or `_cacheFact`)',
        one(parseSrc) === 1 && one(brainSrc) === 1 && !/\._compactedAt\s*=[^=]|\._cacheFact\s*=[^=]/.test(parseSrc + brainSrc));
    }
  }
}

// ── §alias THE ALIAS MOVED (lane fable-52-cli-321 r2, the owner 2026-11-09 13:55 PT) ──
// The owner's CLI went 2.1.319 → 2.1.321 and `fable[1m]` now resolves to claude-fable-5-2. A conversation LOCKED on `fable[1m]`
// (eight on this instance, all spelled so) served by 5.2 is served exactly what it asked for: the re-pin must not fire, no
// fallback notice is drawn, and the attach status carries the server's model facts (the ask, the lock and the served model, numbered
// from one counter — r4; no record time) so every client holds the served model to the ask. A REAL fallback (asked fable, served
// opus) still re-pins and still warns.
console.log('\n§alias a locked alias the CLI now resolves to a newer model: never re-pinned, never a fallback; a real fallback still is');
{
  const engSrc = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const fnOf = (head) => { const at = engSrc.indexOf(head); const end = at < 0 ? -1 : engSrc.indexOf('\n}\n', at); return at < 0 || end < 0 ? '' : engSrc.slice(at, end + 2); };
  const writes = [], events = [];
  const E = new Function('adapterRegistry', 'global', 'require', fnOf('function modelsMatch(a, b) {') + '\n' + fnOf('function maybeRepinLockedModel(session) {') + '\nreturn { modelsMatch, maybeRepinLockedModel };')(
    { get: () => ({ formatSetModel: (m) => JSON.stringify({ type: 'control_request', request: { subtype: 'set_model', model: m } }) }) },
    { __vsEvent: (n, d) => events.push([n, d]) }, createRequire(path.join(REPO, 'src/server/usage-pool-engine.js')));
  const sess = (lockedModel, served) => ({ _modelLocked: true, _lockedModel: lockedModel, _servedModel: served, mode: 'chat', backend: 'claude', pty: { write: (x) => writes.push(x) } });
  E.maybeRepinLockedModel(sess('fable[1m]', 'claude-fable-5-2'));
  E.maybeRepinLockedModel(sess('fable[1m]', 'claude-fable-5-2[1m]'));
  ok('§alias a lock on fable[1m] served by claude-fable-5-2 (with or without [1m]) is NEVER re-pinned — no set_model written, no model-lock-repin event (the real modelsMatch + maybeRepinLockedModel, read from the engine)', writes.length === 0 && events.length === 0 && E.modelsMatch('fable[1m]', 'claude-fable-5-2'), JSON.stringify({ writes, events }));
  E.maybeRepinLockedModel(sess('fable[1m]', 'claude-opus-5-5'));
  ok('§alias …a REAL fallback (served claude-opus-5-5) IS re-pinned to the ask: one set_model fable[1m], one event', writes.length === 1 && /"model":"fable\[1m\]"/.test(writes[0]) && events.length === 1 && events[0][1] === 'claude-opus-5-5->fable[1m]', JSON.stringify({ writes, events }));
  writes.length = 0; events.length = 0;
  E.maybeRepinLockedModel(sess('claude-fable-5-1', 'claude-fable-5-2'));
  ok('§alias …and a lock on a FULL id (claude-fable-5-1) is held exactly: served 5.2 ⇒ re-pinned to 5.1 (a point release pinned is not an alias)', writes.length === 1 && /claude-fable-5-1/.test(writes[0]), JSON.stringify(writes));
  // the fallback notice: drawn only from the CLI's own `fallback` block — a record served by the moved alias draws none
  const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
  const notices = (recs) => { const mm = new MessageManager('alias-' + Math.random()); const ops = []; mm.listeners.push((o) => ops.push(o)); for (const r of recs) mm.processLive(r); return ops.filter((o) => o.op === 'create' && o.message.noticeKind === 'model-fallback').length; };
  const asst = (model, extra = []) => ({ type: 'assistant', session_id: 's', uuid: 'u-' + Math.random(), message: { id: 'm-' + Math.random(), role: 'assistant', model, content: [...extra, { type: 'text', text: 'ok' }] } });
  const moved = notices([asst('claude-fable-5-1'), asst('claude-fable-5-2'), asst('claude-fable-5-2')]);
  const real = notices([asst('claude-fable-5-2', [{ type: 'fallback', from: { model: 'claude-fable-5-2' }, to: { model: 'claude-opus-5-5' } }])]);
  ok('§alias the real normalizer: records served 5.1 then 5.2 (the alias moved) draw NO fallback notice; a record carrying the CLI\'s fallback block (5.2 → opus) draws one', moved === 0 && real === 1, JSON.stringify({ moved, real }));
  // the attach status: the server's model facts (r4)
  const wsSrc = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'), ssSrc = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8');
  const { ownModelOf } = require(path.join(REPO, 'src/server/stream-wall.js'));
  ok('§alias the attach status carries the model facts (model-ask.js modelFacts: the ask = stream-wall\'s ownModelOf — the lock, else the pick, else the spawn — the served model and the CLI\'s report, each numbered; the record\'s model the want falls back to is the newest turn\'s asked one, else master\'s `model`)', wsSrc.includes("{ const MA = require('./server/model-ask.js'); if (MA.declares(session)) Object.assign(chatStatus, MA.modelFacts(session)); }") && wsSrc.includes("session._transcriptModel = chatStatus.lastAsked || chatStatus.model || null;") && ownModelOf({ _modelLocked: true, _lockedModel: 'fable[1m]', _pickedModel: 'opus' }) === 'fable[1m]' && ownModelOf({ _pickedModel: 'opus', _spawnModel: 'sonnet' }) === 'opus');
  {
    // SMALLER 3 (rounds 14–15): the NEWEST TURN's asked model — a turn the CLI fell back in carries the fallback block {from, to} on the
    // record that served; `from` is what that turn asked (session-store chatStatus, over its real scan). A newest turn that states no
    // ask (no block): master's `model` (the result's modelUsage first key, else the newest assistant's)
    const SM = require(path.join(REPO, 'src/session-store.js')).SessionMessages;
    const o = Object.create(SM.prototype); o._ensureParsed = () => { }; o._session = { id: 'la14', cwd: '/nonexistent-la14', backendSessionId: 'bsid-la14' }; o._permissionModes = null;
    const A = (model, extra = []) => ({ type: 'assistant', message: { model, content: [...extra, { type: 'text', text: 'x' }], usage: { input_tokens: 1 } } });
    const RES = (...m) => ({ type: 'result', modelUsage: Object.fromEntries(m.map((x) => [x, { contextWindow: 200000 }])) });
    const FB = { type: 'fallback', from: { model: 'claude-fable-5-2' }, to: { model: 'claude-opus-5-5' } };
    o._all = [A('claude-fable-5-2'), RES('claude-fable-5-2'), A('claude-opus-5-5', [FB]), A('claude-opus-5-5')]; const fell = o.chatStatus();
    o._all = [A('claude-opus-5-5', [FB]), RES('claude-fable-5-2', 'claude-opus-5-5'), A('claude-opus-5-5'), RES('claude-opus-5-5')]; const later = o.chatStatus();
    o._all = [A('claude-fable-5-2'), RES('claude-fable-5-2'), A('claude-haiku-4-5'), RES('claude-fable-5-2', 'claude-haiku-4-5')]; const noBlock = o.chatStatus();
    ok('§alias (rounds 14–15, smaller 3) session-store names the NEWEST TURN\'s asked model where its record states one (its fallback block: claude-fable-5-2); a newer turn with no block states none; a turn whose record carries no block is master\'s `model` (the result\'s first key: claude-fable-5-2) — no `servedModel` field is told',
      fell.lastAsked === 'claude-fable-5-2' && !('lastAsked' in later) && !('lastAsked' in noBlock) && noBlock.model === 'claude-fable-5-2' && !('servedModel' in fell), JSON.stringify({ fell, later: later.lastAsked, noBlock: noBlock.model }));
  }
}

// ── §ask THE MODEL FACTS: SERVER FACTS, ONE COUNTER, ORIGIN NOT TEXT (lane fable-52-cli-321 r4–r15) ──
// every set-model leg runs ws-handler's REAL `case 'set-model'` text over a fake session (no replay of its steps); the counter's
// persistence runs boot-restore's own statements. Round 15: the person's roads write nothing here but the pick's number — a typed
// /model is the CLI's to take (its next init reports it), a refusal changes nothing a person set.
console.log('\n§ask the model facts: a pick moves the ask; the CLI reports what it runs (an init, a live echo); a lock is master\'s; one door; one counter, persisted; no record text moves an ask; no clock');
{
  const MA = require(path.join(REPO, 'src/server/model-ask.js'));
  const engSrc = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const fnOf = (head) => { const at = engSrc.indexOf(head); const end = at < 0 ? -1 : engSrc.indexOf('\n}\n', at); return at < 0 || end < 0 ? '' : engSrc.slice(at, end + 2); };
  const modelsMatch = new Function(fnOf('function modelsMatch(a, b) {') + '\nreturn modelsMatch;')();
  const metas = {}; let metaWrites = 0;
  const io = { readSessionMeta: (k) => metas[k] || {}, writeSessionMeta: (k, v) => { metaWrites++; metas[k] = v; } };
  const sess = (o = {}) => ({ sockName: 'cw-ask', _webuiId: 'web-1', backend: 'claude', mode: 'chat', _spawnModel: 'fable[1m]', ...o });
  // ws-handler's REAL set-model case, its own text
  const wsSrc = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  const caseAt = wsSrc.indexOf("        case 'set-model': {"), caseEnd = wsSrc.indexOf("        case 'set-effort': {", caseAt);
  const CASE = caseAt > 0 && caseEnd > caseAt ? wsSrc.slice(caseAt, caseEnd) : '';
  const wsRequire = createRequire(path.join(REPO, 'src/ws-handler.js'));
  const handlerOf = (caseText) => new Function('data', 'activeSessions', 'adapterRegistry', 'readSessionMeta', 'writeSessionMeta', 'broadcastActiveSessions', 'broadcastToSession', 'ws', 'require', `switch (data.type) {\n${caseText}\n}`);
  const hub = (caseText = CASE) => {
    const run = handlerOf(caseText), sessions = new Map(), pty = [], replies = [], frames = [], meta = {};
    const h = { sessions, pty, replies, frames, meta };
    h.add = (id, o = {}) => { const s = sess({ sockName: 'cw-' + id, _webuiId: id, pty: { write: (l) => pty.push([id, l]) }, ...o }); sessions.set(id, s); return s; };
    h.send = (id, data, from = 'A') => run({ type: 'set-model', sessionId: id, ...data }, sessions, { get: () => ({ formatSetModel: (m) => JSON.stringify({ type: 'control_request', request: { subtype: 'set_model', model: m } }) }) }, (k) => meta[k] || {}, (k, v) => { meta[k] = v; }, () => {}, (s, sid, frame) => frames.push([sid, frame]), { send: (raw) => replies.push([from, JSON.parse(raw)]) }, wsRequire);
    return h;
  };
  const masterSame = (a, b) => { const c = (m) => String(m || '').toLowerCase().replace(/^claude-/, '').replace(/\s*\[1m\]$/, '').trim(); const x = c(a), y = c(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };   // master's rule (round 14)
  ok('§ask the REAL set-model case is read from ws-handler (its own text runs below)', CASE.length > 1000 && /setModelDoor/.test(CASE) && /session\._lockedModel = data\.lock \? \(data\.lockModel \|\| session\._servedModel \|\| null\) : null;/.test(CASE), String(CASE.length));
  // LAW D on the real case: pick opus[1m] → lock → unlock — the ask is the pick at every step and a lock change takes NO new number
  {
    const h = hub(), d = h.add('d');
    h.send('d', { model: 'opus[1m]' }); const a1 = MA.modelFacts(d);
    h.send('d', { lock: true, lockModel: 'opus[1m]' }); const a2 = { ...MA.modelFacts(d), modelLocked: !!d._modelLocked, lockedModel: d._lockedModel || null };
    h.send('d', { lock: false }); const a3 = { ...MA.modelFacts(d), modelLocked: !!d._modelLocked, lockedModel: d._lockedModel || null };
    ok('§ask LAW D (the real case): pick opus[1m] → lock → unlock ⇒ the ask is opus[1m] at every step, the lock\'s target is that ask, and the lock set / lifted takes no number (pick 1, lock 1, unlock 1); meta keeps the lock',
      a1.askedModel === 'opus[1m]' && a2.askedModel === 'opus[1m]' && a2.modelLocked && a2.lockedModel === 'opus[1m]' && a3.askedModel === 'opus[1m]' && !a3.modelLocked && a1.askSeq === 1 && a2.askSeq === 1 && a3.askSeq === 1 && h.meta['cw-d']?.modelLocked === false && h.meta['cw-d']?.pickedModel === 'opus[1m]', JSON.stringify([a1, a2, a3]));
  }
  // THE LOCK IS MASTER'S LINE (rounds 13–14): the hub locks what the frame names (`lockModel`: what the chip showed), else its served model
  {
    const h = hub(), s = h.add('t', { _servedModel: 'claude-opus-5-5', _pickedModel: 'opus' });
    MA.noteServed(s, 'claude-fable-5-2', io); MA.noteServed(s, 'claude-opus-5-5', io);
    const before = MA.modelFacts(s);
    h.send('t', { lock: true, lockModel: 'claude-fable-5-2' });
    const after = MA.modelFacts(s);
    ok('§ask (round 14) the Lock is MASTER\'s LINE: a frame naming `lockModel` (claude-fable-5-2 — a stale bar\'s view) locks what it names; it MOVES the ask\'s value, so it takes a number (the unlocked chip\'s yardstick — master\'s repin needs none)', s._lockedModel === 'claude-fable-5-2' && after.askedModel === 'claude-fable-5-2' && after.askSeq > before.askSeq, JSON.stringify({ before, after, l: s._lockedModel }));
    const h2 = hub(), s2 = h2.add('t2', { _servedModel: 'claude-fable-5-2' }); MA.noteServed(s2, 'claude-fable-5-2', io); const b2 = MA.modelFacts(s2);
    h2.send('t2', { lock: true });
    ok('§ask …a Lock frame that names NO model (an older client) locks the SERVED model, as master\'s line does (claude-fable-5-2); a lock on the ask\'s own value takes no number (law D)', s2._lockedModel === 'claude-fable-5-2' && s2._modelLocked === true, JSON.stringify({ l: s2._lockedModel, b2, a2: MA.modelFacts(s2) }));
  }
  {
    // two clients: a pick on A, the Lock on B — both clients are told
    const h = hub(), s = h.add('two');
    h.send('two', { model: 'opus[1m]' }, 'A'); h.send('two', { lock: true, lockModel: 'opus[1m]' }, 'B');
    await new Promise((r) => setImmediate(r));   // the lock frame goes after its durable write (hub-loop-stalls commit 2), the facts after it
    const fx = h.frames.filter(([, x]) => x.subtype === 'model-facts'), f = MA.modelFacts(s), lk = h.frames.filter(([, x]) => x.subtype === 'model-lock'), last = lk.length ? lk[lk.length - 1][1].data : {};
    ok('§ask MUST 1 across two clients: a pick on A, then Lock on B ⇒ locked opus[1m] (what B\'s chip showed — master\'s line), the ask opus[1m]; every client told — the lock on master\'s model-lock op, the facts beside it (which carry no lock)', s._lockedModel === 'opus[1m]' && f.askedModel === 'opus[1m]' && fx.length >= 2 && !('lockedModel' in fx[fx.length - 1][1].data) && last.lockedModel === 'opus[1m]', JSON.stringify({ f, last }));
    const h2 = hub(), fb = h2.add('fb', { _servedModel: 'claude-opus-5-5' }); MA.noteServed(fb, 'claude-opus-5-5', io);
    h2.send('fb', { lock: true, lockModel: MA.modelFacts(fb).want });
    ok('§ask …a standing fallback (asked fable[1m], opus serving): the Lock locks what the chip shows — the want, fable[1m] — not the served opus', fb._lockedModel === 'fable[1m]', JSON.stringify({ fb: fb._lockedModel }));
    const h5 = hub(), rv = h5.add('rv', { _spawnModel: null, _transcriptModel: 'claude-opus-5-5' }); h5.send('rv', { lock: true, lockModel: MA.modelFacts(rv).want });
    const h6 = hub(), rn = h6.add('rn', { _spawnModel: null }); h6.send('rn', { lock: true });
    ok('§ask (defect fix) a conversation RESUMED and never picked (no ask, no init, nothing served) ⇒ the chip names the transcript\'s model (the want) and the Lock locks it, as master locks it; a bare frame with nothing served locks no target (master\'s line)', rv._modelLocked === true && rv._lockedModel === 'claude-opus-5-5' && rn._modelLocked === true && !rn._lockedModel, JSON.stringify({ rv: rv._lockedModel, rn: rn._lockedModel }));
  }
  // MUST 5: THE DOOR — one check for a pick and for a lock re-target; a refused frame changes nothing and is answered
  {
    const bad = [['whitespace', '   '], ['10 000 characters', 'x'.repeat(10000)], ['not an id', 'not a model id; rm -rf'], ['an object', { id: 'x' }], ['a number', 42], ['a list', ['opus']]];
    const rows = [];
    for (const locked of [false, true]) for (const [what, model] of bad) {
      const h = hub(), s = h.add('door', locked ? { _modelLocked: true, _lockedModel: 'fable[1m]', _pickedModel: 'fable[1m]' } : {});
      const snap = JSON.stringify({ p: s._pickedModel, l: s._lockedModel, k: s._modelLocked, a: s._askSeq, q: s._picksSent });
      h.send('door', { model });
      rows.push({ locked, what, same: JSON.stringify({ p: s._pickedModel, l: s._lockedModel, k: s._modelLocked, a: s._askSeq, q: s._picksSent }) === snap, pty: h.pty.length, meta: Object.keys(h.meta).length, frames: h.frames.length, reply: h.replies.length === 1 && h.replies[0][1].type === 'error' && h.replies[0][1].code === 'model-refused' && h.replies[0][1].reason === 'not-a-model-id' });
    }
    ok('§ask MUST 5 THE DOOR (the real case): whitespace, 10 000 characters, a non-id string, an object, a number, a list — unlocked AND locked — change nothing (no pick, no lock, no meta, nothing to the CLI, no broadcast) and are answered refused (code model-refused)', rows.every((r) => r.same && !r.pty && !r.meta && !r.frames && r.reply), JSON.stringify(rows.filter((r) => !(r.same && !r.pty && !r.meta && !r.frames && r.reply))));
    const h = hub(), s = h.add('ok'); h.send('ok', { model: ' opus ' });
    const h2 = hub(), n = h2.add('none'); h2.send('none', { model: '' }); h2.send('none', { model: null });
    const refusals = (hh) => hh.replies.filter(([, f]) => f.type === 'error').length;
    ok('§ask …a named model passes the door trimmed (« opus » ⇒ opus, sent to the CLI); a frame naming NO model (\'\' / null) changes nothing and is no refusal (law D) — each frame is ANSWERED', s._pickedModel === 'opus' && h.pty.length === 1 && JSON.parse(h.pty[0][1]).request.model === 'opus' && !refusals(h) && h.replies.length === 1 && !n._pickedModel && !h2.pty.length && !refusals(h2) && h2.replies.length === 2);
    ok('§ask …the door\'s grammar: aliases, full ids, a [1m] mark, provider paths pass; a space, a quote, a semicolon, an over-long id do not', ['opus', 'fable[1m]', 'claude-fable-5-2', 'claude-opus-5-5-20261101', 'us.anthropic.claude-opus-5-5-v1:0', 'openrouter/anthropic/claude-sonnet-5-5', 'gpt-5.1-codex-max'].every((m) => MA.setModelDoor({ model: m }).ok) && ['opus 5', "opus'", 'opus;x', 'x'.repeat(129)].every((m) => !MA.setModelDoor({ model: m }).ok));
  }
  // ONE COUNTER, PERSISTED (MUST 4a): the served fact is written down with its number — only when it takes a new one — and a restart
  // (boot-restore's own statements) gives back the same facts: a standing fallback is still one
  {
    const s1 = sess({ sockName: 'cw-one', _askSeq: 3, _modelSeq: 3 });
    const w0 = metaWrites;
    const n1 = MA.noteServed(s1, 'claude-fable-5-2', io), n2 = MA.noteServed(s1, 'claude-fable-5-2', io), n3 = MA.noteServed(s1, 'claude-opus-5-5', io);
    ok('§ask the served fact: numbered when it changes (or is the first served since the ask moved), not on every record — and written down only then (2 numbers, 2 meta writes for 3 records)', n1 && !n2 && n3 && s1._servedSeq === 5 && s1._askSeq === 3 && metaWrites - w0 === 2 && metas['cw-one']?.factServedModel === 'claude-opus-5-5' && metas['cw-one']?.factServedSeq === 5);
    const brSrc = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
    const STMT = "Object.assign(session, require('./model-ask.js').hydratedFacts(meta));";
    const OBJ = "...require('./model-ask.js').hydratedFacts(meta),";
    const live = sess({ sockName: 'cw-fb', _modelLocked: true, _lockedModel: 'fable[1m]' });
    MA.askAfter(live, null, io); MA.noteServed(live, 'claude-opus-5-5', io);   // locked fable[1m], opus serving after it: a real fallback
    const restarted = { _modelLocked: true, _lockedModel: 'fable[1m]', _spawnModel: 'fable[1m]', backend: 'claude' };
    new Function('session', 'meta', 'require', STMT)(restarted, metas['cw-fb'], createRequire(path.join(REPO, 'src/server/boot-restore.js')));
    const fa = MA.modelFacts(live), fr = MA.modelFacts(restarted);
    ok('§ask MUST 4a: a standing REAL fallback (locked fable[1m], opus served after the ask) survives a restart — boot-restore\'s own statements (2 statement sites + 1 object site) give back the same facts, servedSeq > askSeq', brSrc.split(STMT).length - 1 === 2 && brSrc.split(OBJ).length - 1 === 1 && JSON.stringify(fa) === JSON.stringify(fr) && fr.servedSeq > fr.askSeq && fr.served === 'claude-opus-5-5', JSON.stringify({ fa, fr }));
  }
  // AFTER A RESTORE the device feed is held until it hands over a record the parse already gave — a DEVICE-owned buffer is never held
  {
    const sv = sess({ sockName: 'cw-quiet-srv' }), dv = sess({ sockName: 'cw-quiet-dev' });
    Object.assign(sv, MA.hydratedFacts({ askSeq: 1, modelSeq: 1, bufferOwner: 'server' }));
    Object.assign(dv, MA.hydratedFacts({ askSeq: 1, modelSeq: 1, bufferOwner: 'device' }));
    const heldSrv = MA.noteServed(sv, 'claude-opus-5-5', { ...io, recId: 'q-1', feed: 'device' }), heldDev = MA.noteServed(dv, 'claude-opus-5-5', { ...io, recId: 'q-1', feed: 'device' });
    ok('§ask AFTER A RESTORE (round 10, smaller 2b): the device feed of a server-owned buffer waits for the parse (nothing judged yet); a DEVICE-owned buffer has no parse feed — its first device record is judged at once', sv._servedQuiet === true && !heldSrv && !sv._servedFactModel && dv._servedQuiet === false && heldDev === true && dv._servedFactModel === 'claude-opus-5-5');
  }
  // ONE VERDICT PER RECORD, AT THE MOMENT IT MATTERS: a lagging feed's copy of an OLDER record is not judged again
  {
    const s1 = sess({ sockName: 'cw-once' });
    MA.noteServed(s1, 'claude-fable-5-2', { ...io, recId: 'msg_old', feed: 'device' });
    MA.noteServed(s1, 'claude-opus-5', { ...io, recId: 'msg_new', feed: 'device' });
    const before = MA.modelFacts(s1);
    MA.noteServed(s1, 'claude-fable-5-2', { ...io, recId: 'msg_old', feed: 'parse' });
    const after = MA.modelFacts(s1);
    ok('§ask ONE VERDICT PER RECORD (round 8, transient): a lagging feed\'s copy of an OLDER record, handed over after a newer one was served, is not judged again — the served fact stays claude-opus-5, its number unmoved', after.servedModel === 'claude-opus-5' && after.servedSeq === before.servedSeq, JSON.stringify({ before, after }));
  }
  // ── CUT 1 (round 15): A REFUSAL CHANGES NOTHING A PERSON SET. The API's 404 «There's an issue with the selected model (X)» naming the
  // ask (measured: probe/typed-model-v321-refused-stream.jsonl — the init names the refused id BEFORE the 404) is told; the ask, the
  // lock, the pick stand; the chip draws the refused ask against the served model standing (amber, as master's); the pressing page
  // says it once. A 404 naming another model is no refusal of the ask; a model served after all ends it.
  {
    const R404 = (m) => ({ type: 'result', subtype: 'success', is_error: true, api_error_status: 404, num_turns: 1, uuid: 'r-' + m, result: `There's an issue with the selected model (${m}). It may not exist or you may not have access to it. Run --model to pick a different model.` });
    const h = hub(), r = h.add('ref15', { _servedModel: 'claude-opus-5-5' }); MA.noteCliModel(r, 'claude-opus-5-5', io); MA.noteServed(r, 'claude-opus-5-5', io);
    h.send('ref15', { model: 'claude-nope-9' });
    MA.noteEcho(r, { alias: 'claude-nope-9', id: null }, io); MA.noteCliModel(r, 'claude-nope-9', io);   // its echo, then the next turn's init names it
    const pickBefore = r._pickedModel, metaBefore = JSON.stringify(h.meta['cw-ref15']);
    const told = MA.noteRefusal(r, R404('claude-nope-9'), io), f = MA.modelFacts(r), again = MA.noteRefusal(r, R404('claude-nope-9'), io);
    ok('§ask CUT 1 (round 15): the API\'s 404 NAMING the ask (claude-nope-9, after its init named it — the measured order) is TOLD once (askRefused) and changes nothing a person set — the pick, the saved state, the want stand on the refused ask, and the served model standing (claude-opus-5-5) is drawn against it: master\'s amber',
      told === true && !again && f.askRefused === 'claude-nope-9' && f.want === 'claude-nope-9' && f.served === 'claude-opus-5-5' && r._pickedModel === pickBefore && pickBefore === 'claude-nope-9' && JSON.stringify(h.meta['cw-ref15']) === metaBefore && typeof MA.useConfigWriter === 'undefined', JSON.stringify({ told, again, f }));
    const h2 = hub(), o = h2.add('oth15', { _servedModel: 'claude-opus-5-5' }); MA.noteCliModel(o, 'claude-opus-5-5', io); MA.noteServed(o, 'claude-opus-5-5', io);
    h2.send('oth15', { model: 'claude-sonnet-5-5' });
    const other = MA.noteRefusal(o, R404('gate-model'), io);
    const h3 = hub(), w = h3.add('way15', { _servedModel: 'claude-opus-5-5' }); MA.noteServed(w, 'claude-opus-5-5', io); h3.send('way15', { model: 'claude-nope-9' }); MA.noteRefusal(w, R404('claude-nope-9'), io);
    const servedAfter = (MA.noteServed(w, 'claude-nope-9', io), MA.modelFacts(w).askRefused);
    const h4 = hub(), lk = h4.add('lk15', { _servedModel: 'claude-opus-5-5', _modelLocked: true, _lockedModel: 'claude-opus-5-5' }); MA.noteServed(lk, 'claude-opus-5-5', io);
    h4.send('lk15', { model: 'claude-nope-9' });   // a pick under the lock re-targets it (master's line)
    const lockTold = MA.noteRefusal(lk, R404('claude-nope-9'), io);
    ok('§ask CUT 1 …a 404 naming ANOTHER model (gate-model) is no refusal of the ask; a model served after all ends a refusal; UNDER A LOCK the refusal of the re-targeted lock is told the same and the lock stands on it (the hub retries it — master\'s repin, the page\'s lock sentence)',
      other === false && !MA.modelFacts(o).askRefused && servedAfter === null && lockTold === true && lk._lockedModel === 'claude-nope-9' && lk._modelLocked === true && MA.modelFacts(lk).askRefused === 'claude-nope-9', JSON.stringify({ other, servedAfter, lockTold, l: lk._lockedModel }));
  }
  // ── ROUND 16 — THE SENTENCE IS ABOUT THE PICK THE API REFUSED: the 404 is the ask's refusal only when it names THE MODEL THE CLI RUNS
  // FOR THE ASK (its echo for that pick, else the first init since the ask moved); the family prefix serves only before any report
  {
    const R404 = (m) => ({ type: 'result', subtype: 'success', is_error: true, api_error_status: 404, num_turns: 1, result: `There's an issue with the selected model (${m}). It may not exist or you may not have access to it.` });
    const live = (spawn = 'claude-fable-5-2') => { const h = hub(), s = h.add('r16-' + Math.random().toString(36).slice(2, 7), { _spawnModel: spawn, _servedModel: spawn }); MA.noteCliModel(s, spawn, io); MA.noteServed(s, spawn, io); return { h, s, id: s._webuiId }; };
    const pickEcho = (x, m, alias, id) => { x.h.send(x.id, { model: m }); MA.noteEcho(x.s, { alias, id }, io); };
    // (a) the skeptic's scene: pick «opus» (echo opus → claude-opus-5-5), a TYPED /model claude-opus-4-8 (nothing written), its next init, the 404 naming 4-8
    const a = live(); pickEcho(a, 'opus', 'opus', 'claude-opus-5-5'); MA.noteServed(a.s, 'claude-opus-5-5', io); MA.noteCliModel(a.s, 'claude-opus-4-8', io);
    const aTold = MA.noteRefusal(a.s, R404('claude-opus-4-8'), io);
    // …its fable[1m] / claude-fable-5-1 twin: pick fable[1m], the CLI reports claude-fable-5-2, the 404 names a cousin
    const f = live('claude-opus-5-5'); pickEcho(f, 'fable[1m]', 'fable[1m]', 'claude-fable-5-2'); const fTold = MA.noteRefusal(f.s, R404('claude-fable-5-1'), io);
    // the alias that RESOLVES to the refused id: pick opus, the CLI reports claude-opus-4-8, the 404 names it
    const r = live(); pickEcho(r, 'opus', 'opus', 'claude-opus-4-8'); const rTold = MA.noteRefusal(r.s, R404('claude-opus-4-8'), io), rAgain = MA.noteRefusal(r.s, R404('claude-opus-4-8'), io);
    // no report for the pick yet (its set_model answered mid-turn, no echo seen): the family prefix decides
    const n = live(); n.h.send(n.id, { model: 'claude-nope-9' }); const nTold = MA.noteRefusal(n.s, R404('claude-nope-9'), io);
    // …and the pick answered by the NEXT init (no echo): that init is what the CLI runs for it
    const i = live(); i.h.send(i.id, { model: 'opus' }); MA.noteCliModel(i.s, 'claude-opus-4-8', io); const iTold = MA.noteRefusal(i.s, R404('claude-opus-4-8'), io), iOther = MA.noteRefusal(live().s, R404('claude-opus-4-8'), io);
    const j = live(); j.h.send(j.id, { model: 'opus' }); MA.noteCliModel(j.s, 'claude-opus-5-5', io); const jCousin = MA.noteRefusal(j.s, R404('claude-opus-4-8'), io);   // the init answered it: a cousin is no refusal
    const k = live(); k.h.send(k.id, { model: 'opus' }); k.h.send(k.id, { model: 'sonnet' }); MA.noteEcho(k.s, { alias: 'opus', id: 'claude-opus-5-5' }, io); MA.noteEcho(k.s, { alias: 'sonnet', id: 'claude-sonnet-5-5' }, io); const kTold = MA.noteRefusal(k.s, R404('claude-sonnet-5-5'), io);   // an EARLIER pick's echo is no report for the ask
    ok('§ask ROUND 16 — THE SENTENCE IS ABOUT THE PICK THE API REFUSED: a 404 naming a model the CLI does not run for the pick — a typed /model\'s (claude-opus-4-8 after pick opus → claude-opus-5-5), a family cousin (claude-fable-5-1 after fable[1m] → claude-fable-5-2) — says nothing and writes nothing, as on master; the alias that RESOLVES to the refused id (opus → claude-opus-4-8) is told, once; before any report for the pick the family prefix decides; the next init answers a pick no echo answered',
      aTold === false && !MA.modelFacts(a.s).askRefused && fTold === false && !MA.modelFacts(f.s).askRefused && rTold === true && rAgain === false && MA.modelFacts(r.s).askRefused === 'opus' && nTold === true && iTold === true && iOther === false && jCousin === false && kTold === true,
      JSON.stringify({ aTold, fTold, rTold, rAgain, nTold, iTold, iOther, jCousin, kTold, a: MA.modelFacts(a.s).askRefused, f: MA.modelFacts(f.s).askRefused }));
  }
  // SMALL 2 (round 16, RULED): a Lock / Unlock frame keeps the hub's pick (master clears it) — the pool then places by the model the hub
  // SENT the CLI: pick sonnet, Lock, Unlock, no served record between ⇒ the request model is the pick (master: the older served opus)
  {
    const R = new Function('global', fnOf('function modelsMatch(a, b) {') + '\n' + fnOf('function servedDefinesModel(s) {') + '\n' + fnOf('function sessionModelFor(s) {') + '\nreturn sessionModelFor;')({});
    const h = hub(), s = h.add('pool16', { _servedModel: 'claude-opus-5-5', _servedModelAt: 1 });
    h.send('pool16', { model: 'sonnet' }); h.send('pool16', { lock: true, lockModel: 'sonnet' }); h.send('pool16', { lock: false });
    ok('§ask SMALL 2 (round 16, a named difference from master): pick sonnet, Lock, Unlock with no served record between ⇒ the hub keeps the pick and the pool\'s request model (usage-pool-engine sessionModelFor, its own text) is sonnet — what the hub sent the CLI; master clears the pick on the lock frames and falls back to the older served claude-opus-5-5',
      s._pickedModel === 'sonnet' && !s._modelLocked && R(s) === 'sonnet' && R({ ...s, _pickedModel: null, _pickedModelAt: 0 }) === 'claude-opus-5-5', JSON.stringify({ picked: s._pickedModel, request: R(s) }));
  }
  // ── CUT 2 (round 15): A TYPED /model WRITES NOTHING — the chat-input case is master's text (it only sends the frame), no typed road is
  // left in model-ask, and the chip learns the CLI's new model from the CLI's own report: the measured 2.1.321 answer to «/model opus»
  // is an init of the OLD model, a <synthetic> answer and a num_turns-0 result — then the next turn's init names claude-opus-5-5
  {
    const ci = (src) => { const a = src.indexOf("const r = sendUserInput(data.sessionId, data.text"); return a < 0 ? null : src.slice(a, src.indexOf('break;', a)); };
    const masterCI = (t) => !!t && /^const r = sendUserInput\(data\.sessionId, data\.text, \{ msgId: data\.msgId, origin: 'ws', steer: data\.steer === true \}\);\n\s+if \(!r\.ok && \(r\.code === 'input_rejected' \|\| r\.code === 'too_large'\)\) \{/.test(t) && !/model-ask|typed/i.test(t);
    const srcAll = ['src/ws-handler.js', 'src/server/stdout/claude-stream-json.js', 'src/server/session-brain.js', 'src/server/usage-pool-engine.js', 'src/server/session-stdout.js', 'server.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n');
    const s = sess({ sockName: 'cw-typed15', _modelLocked: true, _lockedModel: 'claude-opus-5-5' }); MA.noteCliModel(s, 'claude-opus-5-5', io); MA.noteServed(s, 'claude-opus-5-5', io);
    const metaBefore = JSON.stringify(metas['cw-typed15']), pickBefore = s._pickedModel, lockBefore = s._lockedModel;
    MA.noteCliModel(s, 'claude-opus-5-5', io);                        // «/model sonnet»'s own init (the OLD model)
    MA.noteCliModel(s, 'claude-sonnet-5-5', io);                      // the next turn's init: the CLI took it
    const f = MA.modelFacts(s), metaAfter = metas['cw-typed15'];
    const u = sess({ sockName: 'cw-typed15u', _spawnModel: 'opus' }); MA.noteCliModel(u, 'claude-opus-5-5', io); MA.noteServed(u, 'claude-opus-5-5', io);
    MA.noteCliModel(u, 'claude-sonnet-5-5', io);                      // unlocked: the CLI moved by a road the hub did not order
    ok('§ask CUT 2 (round 15): a typed /model WRITES NOTHING — chat-input is master\'s text, no typed road is left (no arm, no config writer, no queue / mark / reconnect reader); the CLI\'s next init reports what it took: no pick and no lock change on the server (a lock\'s repin answers it, master\'s), and the unlocked want follows the CLI\'s newer report (claude-sonnet-5-5 over the spawn\'s opus — what master\'s live init names)',
      masterCI(ci(wsSrc)) && !/noteTypedModel|noteQueueRecord|noteForwarded|noteAcrossReconnect|noteRemoteState|noteProcessGone|noteControlResponse|useConfigWriter|sbPreGate|input_forwarded|model_across_reconnect/.test(srcAll)
        && s._pickedModel === pickBefore && s._lockedModel === lockBefore && f.cliModel === 'claude-sonnet-5-5' && metaAfter.cliModel === 'claude-sonnet-5-5' && !('pickedModel' in metaAfter && metaAfter.pickedModel) && MA.modelFacts(u).want === 'claude-sonnet-5-5',
      JSON.stringify({ metaBefore, metaAfter, f, u: MA.modelFacts(u) }));
  }
  // MUST 3: DECLARED, never inferred — the capability row says whether a harness's server states these facts
  {
    const caps = require(path.join(REPO, 'src/backend-caps.js'));
    const rows = Object.fromEntries(Object.keys(caps.BACKEND_CAPS).map((id) => [id, caps.BACKEND_CAPS[id].modelFacts]));
    const sentCodex = []; MA.broadcastFacts(sess({ backend: 'codex' }), 'web-cx', (x, id, fr) => sentCodex.push(fr));
    ok('§ask MUST 3: every harness row DECLARES `modelFacts` (claude true; codex, opencode, antigravity, shell false; a contributed row false) — model-ask reads that row and nothing else', rows.claude === true && Object.entries(rows).every(([id, v]) => typeof v === 'boolean' && (id === 'claude') === v) && caps.capsOf('nope-contributed').modelFacts === false && MA.declares(sess()) && !MA.declares(sess({ backend: 'codex' })), JSON.stringify(rows));
    ok('§ask MUST 3 …a harness that declares none is told no facts: no model-facts op for codex (codex keeps the model its live init names)', !sentCodex.length);
  }
  // ── THE LIVE ECHO IS THE CLI'S REPORT (rounds 14–15): the parse feed's live «Set model to X (id)» — A5's own record — answers the OLDEST
  // pick still waiting that it NAMES (never «any pick of the same family»); a backlog's echo is none; its id is kept WHOLE
  {
    const h = hub(), e = h.add('echo15', { _servedModel: 'claude-fable-5-2' }); MA.noteCliModel(e, 'claude-fable-5-2', io); MA.noteServed(e, 'claude-fable-5-2', io);
    h.send('echo15', { model: 'opus' });
    const atPick = MA.modelFacts(e).want;
    const lateOne = MA.noteEcho(e, { alias: 'opus', id: 'claude-opus-5-5' }, io, { late: true }), afterLate = MA.modelFacts(e).want;
    const live = MA.noteEcho(e, { alias: 'opus', id: 'claude-opus-5-5' }, io), afterLive = MA.modelFacts(e);
    ok('§ask (rounds 14–15) a pick names itself until its LIVE echo (opus); a BACKLOG\'s echo (late — src/record-lateness.js) is no report; the live echo is: the want becomes its resolved id (claude-opus-5-5), told once with its number, persisted',
      atPick === 'opus' && lateOne === false && afterLate === 'opus' && live === true && afterLive.want === 'claude-opus-5-5' && afterLive.echoSeq === 1 && afterLive.echoModel === 'claude-opus-5-5' && metas['cw-echo15']?.echoSeq === 1, JSON.stringify({ atPick, afterLate, afterLive }));
    // MUST 4: pick claude-opus-4-8, then pick opus — echo 1 (claude-opus-4-8) answers PICK 1 (the oldest it names), never pick 2
    const h2 = hub(), m4 = h2.add('m4', { _servedModel: 'claude-sonnet-5-5', _spawnModel: 'sonnet' }); MA.noteCliModel(m4, 'claude-sonnet-5-5', io); MA.noteServed(m4, 'claude-sonnet-5-5', io);
    h2.send('m4', { model: 'claude-opus-4-8' }); h2.send('m4', { model: 'opus' });
    MA.noteEcho(m4, { alias: 'claude-opus-4-8', id: null }, io); const w1 = MA.modelFacts(m4).want;
    MA.noteEcho(m4, { alias: 'opus', id: 'claude-opus-5-5' }, io); const w2 = MA.modelFacts(m4).want;
    ok('§ask MUST 4 (round 15): an echo reports the pick it NAMES — pick claude-opus-4-8, then opus: echo 1 answers pick 1 (the chip still names the newer pick, opus), echo 2 answers pick 2 (claude-opus-5-5) — never «any pick of the same family»', w1 === 'opus' && w2 === 'claude-opus-5-5' && m4._cliModel === 'claude-opus-5-5', JSON.stringify({ w1, w2 }));
    // the echo's id WHOLE ([1m] kept), a bare id token, the lock's repin echo
    const h3 = hub(), k = h3.add('echo15k', { _servedModel: 'claude-opus-5-5' }); MA.noteCliModel(k, 'claude-opus-5-5', io); MA.noteServed(k, 'claude-opus-5-5', io);
    h3.send('echo15k', { model: 'fable[1m]' }); MA.noteEcho(k, { alias: 'fable[1m]', id: 'claude-fable-5-2[1m]' }, io); const fk = MA.modelFacts(k);
    const z = sess({ sockName: 'cw-echo15z', _modelLocked: true, _lockedModel: 'claude-opus-5-5' }); MA.noteCliModel(z, 'claude-opus-5-5', io); MA.noteServed(z, 'claude-fable-5-2', io);
    const repin = MA.noteEcho(z, { alias: 'claude-opus-5-5', id: null }, io), fz = MA.modelFacts(z);
    ok('§ask (round 14) the LIVE echo\'s id is kept WHOLE — claude-fable-5-2[1m], the [1m] mark too (what A5 locks and master\'s chip names; an init strips it); under a lock the REPIN\'s echo (a bare id token) is a report too, told with its number',
      fk.cliModel === 'claude-fable-5-2[1m]' && fk.want === 'claude-fable-5-2[1m]' && fk.echoModel === 'claude-fable-5-2[1m]' && repin === true && fz.echoSeq === 1 && fz.echoModel === 'claude-opus-5-5' && z._lockedModel === 'claude-opus-5-5', JSON.stringify({ fk, fz }));
    // SMALL 1 (round 16) — WHERE THE EXACT NAME MATTERS: picks opus, then claude-opus-4-8; the 4-8 echo arrives FIRST, then opus's
    const h5 = hub(), o5 = h5.add('m4b', { _servedModel: 'claude-sonnet-5-5', _spawnModel: 'sonnet' }); MA.noteCliModel(o5, 'claude-sonnet-5-5', io); MA.noteServed(o5, 'claude-sonnet-5-5', io);
    h5.send('m4b', { model: 'opus' }); h5.send('m4b', { model: 'claude-opus-4-8' });
    MA.noteEcho(o5, { alias: 'claude-opus-4-8', id: null }, io); const v1 = MA.modelFacts(o5).want;
    MA.noteEcho(o5, { alias: 'opus', id: 'claude-opus-5-5' }, io); const v2 = MA.modelFacts(o5).want;
    ok('§ask MUST 4 (round 16) — the echoes OUT OF ORDER where a family match would lie: picks opus then claude-opus-4-8, the 4-8 echo first (it answers pick 2 — the CLI ran it first), then opus\'s ⇒ claude-opus-4-8, then claude-opus-5-5 (the CLI\'s last report); matching by family, opus\'s pick would take the 4-8 echo and the chip would stay on claude-opus-4-8', v1 === 'claude-opus-4-8' && v2 === 'claude-opus-5-5', JSON.stringify({ v1, v2 }));
    // THREE PICKS IN A ROW (主开发's addition): echoes in order; out of order; one never arriving — an init ends the rest
    const run3 = (order, init) => {
      const hh = hub(), t = hh.add('p3', { _servedModel: 'claude-opus-5-5', _spawnModel: 'opus' }); MA.noteCliModel(t, 'claude-opus-5-5', io); MA.noteServed(t, 'claude-opus-5-5', io);
      const P = [['claude-sonnet-5-5', null], ['haiku', 'claude-haiku-5-5'], ['claude-fable-5-2', null]];
      for (const [m] of P) hh.send('p3', { model: m });
      const wants = [MA.modelFacts(t).want];
      for (const i of order) { const [m, id] = P[i]; MA.noteEcho(t, { alias: m, id }, io); wants.push(MA.modelFacts(t).want); }
      if (init) { MA.noteCliModel(t, init, io); wants.push(MA.modelFacts(t).want); }
      return wants;
    };
    const inOrder = run3([0, 1, 2]), outOrder = run3([0, 2, 1]), missing = run3([0], 'claude-haiku-5-5');   // (fable's set_model died: the CLI's init names haiku)
    ok('§ask MUST 4 …THREE PICKS IN A ROW (sonnet, haiku, fable): echoes IN ORDER ⇒ the newest pick until its own echo, then its id; OUT OF ORDER (fable\'s before haiku\'s — the CLI ran haiku last) ⇒ the CLI\'s last report, claude-haiku-5-5; ONE NEVER ARRIVING ⇒ the newest pick stands until the next init ends the rest and names what the CLI runs (claude-haiku-5-5: fable\'s set_model died)',
      JSON.stringify(inOrder) === JSON.stringify(['claude-fable-5-2', 'claude-fable-5-2', 'claude-fable-5-2', 'claude-fable-5-2']) && JSON.stringify(outOrder) === JSON.stringify(['claude-fable-5-2', 'claude-fable-5-2', 'claude-fable-5-2', 'claude-haiku-5-5']) && JSON.stringify(missing) === JSON.stringify(['claude-fable-5-2', 'claude-fable-5-2', 'claude-haiku-5-5']),
      JSON.stringify({ inOrder, outOrder, missing }));
    // an echo that MOVES the CLI's model takes a number: the served record before it is never judged against it (the oracle's
    // targetless scene: a repin, then an Unlock) — and the number survives a restart
    const u = sess({ sockName: 'cw-echo15u', _spawnModel: null, _modelLocked: true, _lockedModel: 'claude-haiku-4-5' }); MA.noteCliModel(u, 'claude-opus-5-5', io); MA.noteServed(u, 'claude-opus-5-5', io);
    MA.noteEcho(u, { alias: 'claude-haiku-4-5', id: null }, io); u._modelLocked = false; u._lockedModel = null;
    const fu = MA.modelFacts(u), back = MA.hydratedFacts(metas['cw-echo15u']), fb = MA.modelFacts({ backend: 'claude', ...back });
    MA.noteServed(u, 'claude-haiku-4-5', io); const after = MA.modelFacts(u).served;
    ok('§ask (round 14) an echo that MOVES the CLI\'s model takes a number: the served record before it (claude-opus-5-5) is never judged against the new report (claude-haiku-4-5) — no amber after the repin and an Unlock; the number (and the echo count) survive a restart; the next served record is judged again',
      fu.want === 'claude-haiku-4-5' && fu.served === null && back._reportSeq > 0 && back._echoSeq === 1 && fb.served === null && after === 'claude-haiku-4-5', JSON.stringify({ fu, back: { r: back._reportSeq, e: back._echoSeq }, fb: fb.served, after }));
  }
  // LAW C + no clock: A5 is master's; the same live record is the CLI's report; model-ask reads no clock
  const csj = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8'), maSrc = fs.readFileSync(path.join(REPO, 'src/server/model-ask.js'), 'utf8');
  ok('§ask (rounds 14–15) master\'s A5 — the LIVE echo upgrades a bare-alias lock to its resolved id (gated on modelsMatch) — and the same record is read once more, as the CLI\'s report (model-ask noteEcho, a backlog\'s none); a result is read only for the 404 that names the ask (noteRefusal)', /session\._lockedModel = echo\.id;/.test(csj) && /MA\.noteEcho\(session, parseSetModelEcho\(uText, \{ envelope: 'required' \}\), \{ readSessionMeta, writeSessionMeta \}, \{ late: !!recordIsLate\?\.\(session, msg\) \}\)/.test(csj) && /if \(msg\.type === 'result'\) \{ try \{ require\('\.\.\/model-ask\.js'\)\.noteRefusal\(session, msg, \{ readSessionMeta, writeSessionMeta \}\); \} catch \{ \} \}/.test(csj));
  const readsClock = (src) => /\bDate\b|performance\.now|process\.hrtime|\.timestamp\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''));
  ok('§ask LAW B: model-ask.js reads NO clock at all — no Date, no performance.now, no hrtime, no record timestamp', !readsClock(maSrc) && /const bump = /.test(maSrc));
  ok('§ask CONTROL: the same predicate over a copy with `Date.now()` planted in noteServed names it', readsClock(maSrc.replace('session._servedSeq = bump(session);', 'session._servedSeq = bump(session); session._t = Date.now();')));
  // the wiring
  {
    const s1 = sess({ _askSeq: 3, _modelSeq: 5, _servedFactModel: 'claude-opus-5-5', _servedSeq: 5 });
    const sent = []; MA.broadcastFacts(s1, 'web-1', (x, id, frame) => sent.push([id, frame]));
    ok('§ask broadcastFacts: ONE `model-facts` meta op — the facts, saying they are declared — to every client of the conversation', sent.length === 1 && sent[0][0] === 'web-1' && JSON.stringify(sent[0][1]) === JSON.stringify({ type: 'msg', sessionId: 'web-1', op: 'meta', subtype: 'model-facts', data: { modelFacts: true, askedModel: 'fable[1m]', askSeq: 3, servedModel: 'claude-opus-5-5', servedSeq: 5, askRefused: null, cliModel: null, want: 'fable[1m]', served: 'claude-opus-5-5', echoModel: null, echoSeq: 0 } }), JSON.stringify(sent));
    const brSrc = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8'), sbSrc = fs.readFileSync(path.join(REPO, 'src/server/session-brain.js'), 'utf8');
    const W = {
      setModel: wsSrc.includes('MA.askAfter(s3, ask0, { readSessionMeta, writeSessionMeta }); }') && wsSrc.includes('MA.broadcastFacts(s3, data.sessionId, broadcastToSession); };') && wsSrc.includes('if (lockSaid) lockSaid.then(() => { tellFacts(); answer(); }') && wsSrc.includes('if (s1 && model) MA.notePick(s1, model);'),
      served: engSrc.includes('if (MA.noteServed(session, model, { recId: (rec && (rec.message?.id || rec.uuid)) || null, feed,') && sbSrc.includes("noteServedModel(session, msg.message.model, msg, 'device');"),
      init: csj.includes("require('../model-ask.js').noteCliModel(session, msg.model, { readSessionMeta, writeSessionMeta });"),
      restore: brSrc.split('hydratedFacts(meta)').length - 1 === 3,
    };
    ok('§ask the WIRING: ws-handler set-model notes the pick, moves + tells the ask; the engine\'s noteServedModel (both feeds\' one consumer) numbers the served fact; an init and a live echo report the CLI\'s model; boot-restore hydrates at its three sites', Object.values(W).every(Boolean), JSON.stringify(W));
  }
  // ── the server items of earlier rounds that stand (condition FIRST here: okc)
  {
    const okc = (c, n, e) => ok(n, c, e);
    try {
    const MP = require(path.join(REPO, 'src/model-providers.js'));
    // ROUND 14: MASTER's rule is the one rule — the repin is master's function; a full-id lock served its shorter cousin is HELD
    {
      const engSrc2 = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
      const fn2 = (head) => { const a = engSrc2.indexOf(head); const end = a < 0 ? -1 : engSrc2.indexOf('\n}\n', a); return a < 0 || end < 0 ? '' : engSrc2.slice(a, end + 2); };
      const writes = [];
      const R = new Function('adapterRegistry', 'global', 'require', fn2('function modelsMatch(a, b) {') + '\n' + fn2('function maybeRepinLockedModel(session) {') + '\nreturn { maybeRepinLockedModel };')({ get: () => ({ formatSetModel: (m) => m }) }, { __vsEvent: () => {} }, require);
      R.maybeRepinLockedModel({ _modelLocked: true, _lockedModel: 'claude-opus-5-5', _servedModel: 'claude-opus-5', mode: 'chat', backend: 'claude', pty: { write: (x) => writes.push(x) } });
      R.maybeRepinLockedModel({ _modelLocked: true, _lockedModel: 'fable[1m]', _servedModel: 'claude-fable-5-2', mode: 'chat', backend: 'claude', pty: { write: (x) => writes.push(x) } });
      okc(writes.length === 0 && masterSame('fable[1m]', 'claude-fable-5-2') && typeof MP.modelHeld === 'undefined' && MA.sameModel('claude-opus-5-5', 'claude-opus-5') === modelsMatch('claude-opus-5-5', 'claude-opus-5'),
        '§ask MUST 5 (round 14): MASTER\'s rule is the one rule — a lock on claude-opus-5-5 served claude-opus-5 is HELD, not re-pinned (master\'s repin, verbatim), as an alias lock served its family is; model-ask\'s sameModel is master\'s modelsMatch; modelHeld is gone', JSON.stringify({ writes }));
      const placement = ["if (fb && fb.to && !modelsMatch(model, fb.to))", "return !modelsMatch(s._servedModel, fb.to);", "modelsMatch(s._lockedModel, s._servedViaFallback.to)"];
      okc(placement.every((x) => engSrc2.includes(x)), '§ask MUST 5 …pool placement keeps the rule it reads — usage-pool-engine modelsMatch (the prefix rule) for the reroute stamp\'s retirement, servedDefinesModel and the lock-vs-reroute belt');
    }
    // MUST 6: numbers never go backwards after a restart — the counter is the maximum of every persisted number, garbage is zero
    {
      const H = (m) => MA.hydratedFacts(m);
      const table = [H({ askSeq: 7 })._modelSeq, H({ modelSeq: 3, factServedSeq: 9 })._modelSeq, H({ askSeq: 'x', modelSeq: -4, factServedSeq: Infinity })._modelSeq, H({ askSeq: 2.7 })._askSeq, H(null)._modelSeq, H({ reportSeq: 11 })._modelSeq];
      const after = { backend: 'claude', _spawnModel: 'fable[1m]', ...H({ askSeq: 7, factServedSeq: 9, factServedModel: 'claude-opus-5-5' }) }; after._pickedModel = 'opus'; MA.askAfter(after, 'fable[1m]', {});
      okc(table.join() === '7,9,0,2,0,11' && after._askSeq === 10, '§ask MUST 6 (r6): a restart hydrates the counter as the MAXIMUM of every persisted number (an ask number without the counter ⇒ 7; a served number above it ⇒ 9; a report number ⇒ 11), garbage as 0 — so the next move is numbered above them all', JSON.stringify({ table, a: after._askSeq }));
    }
    // master's lock line on a bare frame; EVERY passed frame is answered to its sender
    {
      const h = hub(), bare = h.add('bare', { _spawnModel: null });
      h.send('bare', { lock: true }); await new Promise((r) => setImmediate(r));   // a Lock's answer follows its frame, after the durable write (hub-loop-stalls commit 2)
      const masterBare = bare._modelLocked === true && !bare._lockedModel && h.replies.length === 1 && h.replies[0][1].subtype === 'model-answer';
      const h2 = hub(), dl = h2.add('dl', { _spawnModel: null }); MA.noteServed(dl, 'claude-fable-5-2', io); dl._servedModel = 'claude-fable-5-2'; const n0 = dl._askSeq || 0;
      h2.send('dl', { lock: true });
      okc(masterBare && dl._lockedModel === 'claude-fable-5-2' && (dl._askSeq || 0) > n0,
        '§ask master\'s lock line: a bare lock frame locks the served model (claude-fable-5-2), with nothing served no target; the ask moves from nothing to it and takes a number (a lock on the same value takes none — law D)', JSON.stringify({ masterBare, dl: dl._lockedModel }));
      const h3 = hub(), rp = h3.add('rp'); h3.send('rp', { model: 'fable[1m]' }, 'A'); const seqAfterFirst = MA.modelFacts(rp).askSeq; h3.send('rp', { model: 'fable[1m]' }, 'A');
      const answers = h3.replies.filter(([, f]) => f.subtype === 'model-answer');
      okc(answers.length === 2 && answers.every(([from, f]) => from === 'A' && f.data.ok === true && f.data.facts && f.data.facts.modelFacts === true) && answers[1][1].data.facts.askSeq === seqAfterFirst && MA.modelFacts(rp).askSeq === seqAfterFirst,
        '§ask THE LAW (r6): EVERY set-model frame that passed the door is ANSWERED to its sender — the facts as they stand, even a re-pick of the model already asked (its number does not move)', JSON.stringify(answers.map(([f, x]) => [f, x.data.ok])));
      const h4 = hub(), cx = h4.add('cx', { backend: 'codex' }); h4.send('cx', { model: 'gpt-5.1-codex' });
      okc(h4.replies.length === 1 && h4.replies[0][1].subtype === 'model-answer' && h4.replies[0][1].data.facts === null && !h4.frames.length, '§ask …a harness that declares no facts is answered too (no facts: the frame was taken) and is told no facts');
    }
    // the create / resume road passes the SAME door; the client sends no saved model the door would refuse
    {
      const wc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8'), sl = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
      okc(/const named = MP\.namedModel\(data\[k\]\); if \(!named\) console\.warn\(`\[create\] \$\{k\} is not a model id — dropped, the default spawns`\); data\[k\] = named \|\| undefined;/.test(wc) && !/create-not-a-model-id/.test(wc) && /const sessionModel = \(modelPick\.value && !namedModel\(modelPick\.value\)\) \? undefined : modelPick\.value;/.test(sl),
        '§ask (c) the create / resume road passes the SAME door with ONE behavior (round 14, smaller 5): a saved model or lock target that is no model id is DROPPED on the server as on the client — the conversation starts on its default');
    }
    } catch (e) { okc(false, '§ask the earlier rounds\' server roads (hydratedFacts, the answer, the one rule…) are present — threw: ' + (e && e.message)); }
  }
}
// ── §tree THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\n§tree the patched copies never touch the tree');
for (const r of copiesCensus(MUTF.files, MUTF.dir, REPO, { minCopies: 20 })) ok('§tree ' + r.name, r.pass, r.detail);

console.log(fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')');
process.exit(fail ? 1 : 0);
