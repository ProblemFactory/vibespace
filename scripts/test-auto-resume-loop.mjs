#!/usr/bin/env node
// THE AUTO-RESUME FIRE LOOP (2026-09-07 incident; owner decision ut-1c6c15a2db ①④).
//
// What happened, from the frozen journal (last 6h of the production server):
// 130 "continued immediately" on one conversation and 32 on another between
// 23:32 and 04:03, up to two per SECOND, each one a billed turn the CLI
// answered with "You've hit your session limit". Every cycle was identical:
//   [auto-resume] <id>: armed for <now+45s> (switched to a usable account)
//   [pool] per-session switch <pool>/<id>: <observed> (observed; linked <link>)
//                                          → <link> (re-point, same target)
//   [auto-resume] <id>: 账号池已切换到 <link> — continued immediately
// ~150 junk cards landed in one transcript. Two independent defects:
//
//   ① ATTRIBUTION. B-2c9b made the OTel-observed org override the link for
//      blocking decisions. The owner's post-mortem corrected the premise: an
//      api_request's organization.id is the identity the CLI cached in its
//      config dir at SPAWN, not the token that authorized the request. So the
//      rejection was recorded against the org the session started on, the
//      LINKED member — whose credentials the process actually reads — stayed
//      "healthy" in the cache forever, and the verdict answered "usable via
//      <link>" on every single cycle.
//   ② NO MEMORY. Neither fire path remembered that the previous continue onto
//      that exact identity had just been rejected, and fireNow() skipped the
//      pre-fire gate that the timed path runs.
//
// This suite drives the REAL engine + REAL auto-resume + a real AccountManager
// pool with real per-session symlinks, and a scripted "CLI" that answers every
// continue with a rate_limit_event shaped like the production record.
//
// NEGATIVE CONTROL is a matrix, not a snapshot: each pre-fix behaviour is
// re-created through a PUBLIC seam, so each fix can be switched off on its own.
//   · old attribution  = inject the wall keyed to the OBSERVED org with
//                        slot:false — literally what orgVerifiedKey computed
//   · old breaker      = noteFireOutcome(id, true) after every fire — the
//                        pre-fix module had no memory of a failed fire
// Both off ⇒ the loop runs unbounded (≥10 fires). Either one on ⇒ it stops.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const arMod = require(path.join(REPO, 'src/server/auto-resume.js'));
// row B-9a24 R9 / B-574d: auto-resume.json is the store writer's — the legs read it on disk and restart over it: each save flushed here
require('./lib/auto-resume-landed.cjs').landEveryAutoResumeSave();
const { create, CONTINUE_PROMPT, GRACE_MS, FIRE_MAX_IMMEDIATE, FIRE_QUARANTINE_MS, FIRE_WINDOW_MS } = arMod;
// lane resume-words: the continue is CONTINUE_PROMPT's head + facts + the CLI's own sentence (continuePromptFor)
const IS_CONTINUE = (t) => typeof t === 'string' && !!CONTINUE_PROMPT && typeof CONTINUE_PROMPT.cli === 'string' && t.endsWith(' ' + CONTINUE_PROMPT.cli) && t.includes(' ' + CONTINUE_PROMPT.facts + ' ');
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));

const cleanup = [];
process.on('exit', () => { for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });

// ── THE SUITE THAT RAN BESIDE US (B-0220) ───────────────────────────────────
// A 2026-09-22 integration ran this suite and test-new-member-wake side by
// side: 3 red here, green alone. That suite wrote its patched copies of the
// engine as SIBLINGS inside src/server/, and §5's AUDIT (walk src/, classify
// every noteRecovered call site) counted the copies as product code. So the
// pair is driven for real, and not by luck: a child run of test-new-member-wake
// HOLDS at the point where every copy it made still exists (VS_WAKE_HOLD) and
// this whole suite runs inside that window; it is released at the end and its
// own verdict is asserted too. Pre-fix placement ⇒ the AUDIT goes red here.
const PAIR = scratch('arl-pair');
fs.mkdirSync(PAIR, { recursive: true }); cleanup.push(PAIR);
const HOLD = path.join(PAIR, 'hold');
let heldGone = false;          // a child that died before holding must not cost the full wait
process.on('exit', () => { try { fs.writeFileSync(HOLD + '.go', '1'); } catch { } });
const held = new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(REPO, 'scripts', 'test-new-member-wake.mjs')],
    { cwd: REPO, env: { ...process.env, VS_WAKE_HOLD: HOLD }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 300e3);
  c.on('exit', (code) => { heldGone = true; clearTimeout(kill); resolve({ code, out }); });
});
let heldCopies = null;
for (let i = 0; i < 2400 && !heldCopies && !heldGone; i++) {
  if (fs.existsSync(HOLD + '.ready')) heldCopies = JSON.parse(fs.readFileSync(HOLD + '.ready', 'utf8'));
  else await new Promise((r) => setTimeout(r, 50));
}
ok('PAIR: a run of test-new-member-wake is holding, every patched copy it made still on disk, before anything here reads src/',
  gateOf(Array.isArray(heldCopies)) && heldCopies.length >= 5 && verdictOf(heldCopies.every((f) => fs.existsSync(f))), JSON.stringify(heldCopies));

/** A real pool of three logged-in subscriptions, a real engine, a real
 *  auto-resume, a fake OTel source, and a scripted CLI that rejects.
 *  `ignoreWorkedFlag` re-creates the ROUND-3 module through a public seam: the
 *  engine's producers reach auto-resume through `getAutoResume()`, so handing
 *  the engine a wrapper that drops `noteRecovered`'s third argument is exactly
 *  the pre-round-4 call (`noteRecovered(id, why)` — no classification) with
 *  everything else, including both real producers, unchanged. */
function mkWorld({ dir = null, healthy = true, ignoreWorkedFlag = false, arModule = null, engModule = null } = {}) {
  const root = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'vs-arloop-'));
  if (!dir) cleanup.push(root);
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r', expiresAt: Date.now() + 36e5, subscriptionType: 'max' } }), { mode: 0o600 });
  const FISH = am.createSubscription({ name: 'Fish Max' }).id; login(FISH);       // the OTel-observed (spawn-time) org
  const LINK = am.createSubscription({ name: 'userP' }).id; login(LINK);      // the credential slot: cache says healthy, the CLI rejects
  const SPARE = am.createSubscription({ name: 'B-Stack Max' }).id; login(SPARE); // the other healthy-looking member
  const P = am.createPool({ name: '全部' }).id;
  am.setPoolTarget(P, LINK);
  am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(Date.now() / 1000);
  const R5 = nowS + 2 * 3600, R7 = nowS + 3 * 86400;
  const cache = (u5, u7) => ({ fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: u5, resetsAt: R5 }, sevenDay: { utilization: u7, resetsAt: R7 } });
  const writeCache = (id, c) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify(c));
  const readCache = (id) => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, id + '.json'), 'utf8')); } catch { return null; } };
  writeCache(FISH, { ...cache(1, 0.4), fiveHour: { utilization: 1, status: 'limited', resetsAt: R5 } });
  if (healthy) { writeCache(LINK, cache(0.1, 0.3)); writeCache(SPARE, cache(0.2, 0.35)); }

  const sessions = new Map();
  const notices = [], notes = [], events = [], fired = [];
  const obs = new Map();
  // `arModule` swaps in a PATCHED COPY of the product module (§4g's control):
  // everything else in the world — the engine, the pool, both producers, the
  // scripted CLI — is the shipped code, so the control differs in one named
  // dimension and in nothing else.
  const ar = (arModule || arMod).create({
    dataDir, activeSessions: sessions, serverSetting: () => true, log: (...a) => console.log(...a), // one journal: the capture below reads both modules' lines
    notify: (id, s2, text) => notes.push(text),
    sendToSession: (id, s2, text, carried) => { fired.push({ id, text, note: carried && carried.note || null }); return true; },   // 2.369.97: the cause rides the prompt
    beforeFire: (id, s2) => { try { return eng.beforeAutoResumeFire(id, s2); } catch { return true; } },
    fireIdentity: (id, s2) => { try { return eng.fireIdentityFor(s2); } catch { return null; } },
  });
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  // the pre-round-4 auto-resume, seen from the engine: same module, but the
  // classification the producer passes never arrives
  const arSeenByEngine = ignoreWorkedFlag
    ? new Proxy(ar, { get: (t, p) => (p === 'noteRecovered' ? ((id, why) => t.noteRecovered(id, why)) : t[p]) })
    : ar;
  const eng = (engModule || engMod).create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(t),
    serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => arSeenByEngine, getQuotaProbe: () => null,
  });
  const SID = 'sess-4-1788764794641', CID = 'cid-4';
  const session = { backend: 'claude', mode: 'chat', host: null, _webuiId: SID, claudeSessionId: CID, _accountId: P, _autoResume: true, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'work' };
  sessions.set(SID, session);
  am.ensureSessionPoolLink(P, SID, LINK);
  obs.set(CID, { orgUuid: 'org-fish', acct: FISH, known: true, ts: Date.now() });

  const w = {
    root, dataDir, am, eng, ar, sessions, session, SID, CID, P, FISH, LINK, SPARE, R5, R7,
    notices, notes, events, fired, obs, cacheDir, readCache, writeCache,
    linkNow: () => am.poolCurrentFor(P, SID),
    nameOf: (id) => am.get(id)?.name || id,
  };
  // the scripted CLI: every turn we send it is answered by a limit rejection
  w.reject = ({ oldAttribution = false } = {}) => {
    if (oldAttribution) {
      // exactly what the pre-fix code computed: orgVerifiedKey → the observed
      // org, and no notion of a credential slot at all
      eng.noteWallSignal(session, { resetsAtMs: w.R5 * 1000, bucket: 'fiveHour', key: FISH, slot: false });
    } else {
      eng.recordRateLimitEvent(session, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: w.R5 } });
    }
    eng.noteTurnEnd(session);
  };
  // the PASSIVE reading: the same record type, status "allowed" — the event
  // this instance sees ~20× per rejection. It lands on the WEEKLY bucket at
  // half full deliberately: a reading is not supposed to change any verdict
  // here, so the leg measures the breaker and nothing else.
  w.passiveReading = (info = {}) => w.eng.recordRateLimitEvent(session, {
    type: 'rate_limit_event',
    rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.5, resetsAt: w.R7, ...info },
  });
  // …and its codex twin: a rate_limits_updated push with nothing exhausted
  w.codexReading = (s2) => w.eng.recordCodexQuotaSignal(s2, {
    type: 'rate_limits_updated',
    rateLimits: { primary: { used_percent: 20, window_minutes: 300, resets_at: w.R5 }, secondary: { used_percent: 30, window_minutes: 10080, resets_at: w.R7 } },
  });
  // the timed path: back-date the arm so the tick considers it due
  w.tickFire = async () => {
    const a = ar._armed.get(SID);
    if (a) a.resetsAt = Date.now() - GRACE_MS - 1000;
    const before = fired.length;
    ar.tick(Date.now());
    // B-b4af: the pre-fire gate is async — waited for by its OWN settle (the in-flight flag attemptFire raises before the gate
    // and drops once the continue is delivered or refused), a bounded COUNT of looks, never a fixed 20 ms: a slower gate read
    // as «no fire», and a frozen clock (§4h) was restored under a gate still deciding — it then judged two minutes early and
    // re-armed for the NEXT member's reset (the row's red-then-green on the runner)
    // (at least ONE turn, always: a refusal before the flag rises — canFire's 'same-identity' — still leaves the timers it queued,
    // the wall probe's setTimeout(0) among them, their turn: §1(d) reads the arm they re-time; the read's MUST)
    let k = 0;
    do { await new Promise((r) => setTimeout(r, 5)); } while (session._arFiring && ++k < 600);
    if (session._arFiring) ok('tickFire: the pre-fire gate settled within its 600 looks (it never did — the race B-b4af is about)', false);
    return fired.length > before;
  };
  // flake census round 2 (主开发 r4456): an IMMEDIATE continue (fireNow, reached from a wall the pool switched past) is waited for
  // by its OWN settle, as tickFire's is (B-b4af): at least ONE turn, then until the in-flight flag is down AND the leg's continues
  // are there, a bounded COUNT of looks, never a fixed 40 ms (the real gate yields twice through gateTurn and the probe: on a
  // loaded loop a 40 ms timer ran first and read «no continue»). Its expiry is a NAMED red line, never a silent read
  w.fireSettled = async (want, label = 'the immediate continue') => {
    let k = 0;
    do { await new Promise((r) => setTimeout(r, 5)); } while ((session._arFiring || fired.length < want) && ++k < 600);
    if (session._arFiring || fired.length < want) { ok(`${label}: the pre-fire gate settled with ${want} continue(s) within its 600 looks (it did not: ${fired.length} continue(s), in flight ${!!session._arFiring})`, false); return false; }
    return true;
  };
  return w;
}

const capture = () => { const orig = console.log; const lines = []; console.log = (...a) => { const s = a.join(' '); if (/^\[(wall|pool|auto-resume)\]/.test(s)) lines.push(s); else orig(...a); }; return { lines, done: () => { console.log = orig; return lines; } }; };

const probe = mkWorld();
if (!probe) {
  console.log('  · SKIP (pooled accounts are unsupported on ' + process.platform + ')');
  console.log('\nALL PASS (0)');
  process.exit(0);
}

// ── §1 THE LOOP, and each fix switched off on its own ──────────────────────
{
  /** Drive fire → rejection → re-arm for up to `cycles` rounds. */
  async function drive(w, { oldAttribution, oldBreaker, cycles = 25 }) {
    w.reject({ oldAttribution });                       // the user's own prompt hit the wall
    let rounds = 0;
    for (let i = 0; i < cycles; i++) {
      const did = await w.tickFire();
      if (!did) break;
      rounds++;
      // the pre-fix module had NO memory to record into, so the simulation has
      // to drop the pending fire BEFORE the rejection arrives — clearing it
      // afterwards would still let the verdict see one failure
      if (oldBreaker) w.ar.noteFireOutcome(w.SID, true, 'simulated pre-fix module (no memory of a failed fire)');
      w.reject({ oldAttribution });                     // the CLI rejects the continue too
    }
    return rounds;
  }

  // (a) NEGATIVE CONTROL — both defects present
  {
    const w = mkWorld(); const cap = capture();
    const n = await drive(w, { oldAttribution: true, oldBreaker: true });
    const lines = cap.done();
    ok('NEGATIVE CONTROL: with the wall attributed away from the credential slot AND no memory of a failed fire, the session re-fires without bound (≥10 billed continues)', n >= 10, 'fires=' + n);
    ok('…and the reproduction is the journal we have: every cycle re-armed "switched to a usable account" naming the LINK the CLI keeps rejecting', lines.filter((l) => /armed for .*switched to a usable account \(userP\)/.test(l)).length >= 10, lines.slice(0, 3).join(' | '));
    ok("…the linked member's cache never learned it was blocked (the whole mechanism of the incident)", (w.readCache(w.LINK) || {}).source === 'cli-usage' && w.readCache(w.LINK).fiveHour.utilization === 0.1, JSON.stringify(w.readCache(w.LINK)));
    ok('…and every one of those continues was a real send of the CLI\'s continue prompt', w.fired.length === n && verdictOf(w.fired.every((f) => IS_CONTINUE(f.text))));
  }

  // (b) ATTRIBUTION alone stops it — the wall lands on the slot, the verdict turns
  {
    const w = mkWorld(); const cap = capture();
    const n = await drive(w, { oldAttribution: false, oldBreaker: true });
    const lines = cap.done();
    ok('FIX ①: with the rejection attributed to the credential slot, the loop is over after at most one continue', n <= 1, 'fires=' + n);
    const c = w.readCache(w.LINK);
    ok('…because the LINKED member is what got demoted — utilization 1, source wall, on the FIRST rejection', c.fiveHour.utilization === 1 && c.source === 'wall' && c.fiveHour.status === 'limited', JSON.stringify(c));
    ok("…journaled as a credential-slot demotion, not a guess", verdictOf(lines.some((l) => /\[wall\] demoted userP 5h until \S+ \(1 walls \/ credential slot\)/.test(l))), lines.filter((l) => /demoted/.test(l)).join(' | '));
    ok('…and the OTel label is neither the target nor in the log (a machine-wide label since the 2026-09-30 measurement — it corroborates nothing)', !lines.some((l) => /OTel observed/.test(l)) && !lines.some((l) => /demoted Fish Max/.test(l)), lines.filter((l) => /walled turn/.test(l)).join(' | '));
  }

  // (c) THE BREAKER alone stops it — attribution still wrong, damage bounded
  {
    const w = mkWorld(); const cap = capture();
    const n = await drive(w, { oldAttribution: true, oldBreaker: false });
    const lines = cap.done();
    ok(`FIX ②: with the attribution defect still present, the breaker alone caps the damage at ${FIRE_MAX_IMMEDIATE} continues instead of 130`, n >= 1 && n <= FIRE_MAX_IMMEDIATE, 'fires=' + n);
    ok('…and every refused fire is journaled ONCE with its reason (never one line per cycle)', lines.filter((l) => /refused a (timed|immediate) continue onto userP \((same-identity|backoff|hourly-cap|fire-pending)/.test(l)).length >= 1 && lines.filter((l) => /refused a /.test(l)).length <= 4, lines.filter((l) => /refused/.test(l)).join(' | '));
    ok('…the rejection of our own continue is recorded by name', verdictOf(lines.some((l) => /the continue onto sub-\w+ was rejected again \(limit rejection\) — not re-firing there/.test(l))), lines.filter((l) => /rejected again/.test(l)).join(' | '));
    ok('…and the conversation was told AT MOST ONCE, not ~150 times', w.notes.filter((t) => /已自动继续这个任务/.test(t)).length <= 1, JSON.stringify(w.notes));
  }

  // (d) BOTH fixes — the shipped behaviour
  {
    const w = mkWorld(); const cap = capture();
    const n = await drive(w, { oldAttribution: false, oldBreaker: false });
    const lines = cap.done();
    ok('SHIPPED: at most one immediate continue, then the session waits', n <= 1, 'fires=' + n);
    const st = w.ar.statusFor(w.SID);
    ok('…still ARMED afterwards, on a real reset time rather than a 45s re-try (the wait is what a blocked pool deserves)', st.armed === true && st.resetsAt > Date.now() + 60000, JSON.stringify(st));
    ok('…the arm reason names the buckets that are dead, per member', verdictOf(/userP:|B-Stack Max:|Fish Max:/.test(String(st.reason || ''))), String(st.reason));
    ok('…no member was silently re-selected after refusing this conversation', !lines.some((l) => /re-point, same target/.test(l)), lines.filter((l) => /per-session switch/.test(l)).join(' | '));
  }
}

// ── §2 THE RECOVERY PATH THE INCIDENT ACTUALLY TAKES, and the immediate one ─
// Round 2 (the r1 verifier's finding): this section used to INJECT the wall
// signal, which skips the early `maybePoolAutoSwitch` that BOTH real producers
// run — and that early switch is what decides the outcome. Measured on this
// same world, only the producer changed:
//   injected noteWallSignal   → 1 immediate continue (fireNow)
//   real recordRateLimitEvent → 0 immediate continues. The link is re-pointed
//                               to the healthy member BEFORE onWalledTurn arms
//                               the session, so the `finally` pass has nothing
//                               left to switch and fireNow is never called;
//                               the session is armed at +45s and continued by
//                               the TICK (45s arm + 15s grace on a 30s tick ⇒
//                               ~60-90s, not "immediately")
//   real markLimitBanner      → same as the rejection
// So the legs below pin the REAL flows, and the injected one is kept only as
// the labelled artificial control. The immediate path still exists for the
// case it was built for (c1206711) — a switch that lands LATER, onto a session
// that is already armed — and (d) drives that through the real pool seam.
{
  // (a) THE INCIDENT'S OWN FLOW, through the producer the CLI actually feeds
  const w = mkWorld(); const cap = capture();
  w.eng.recordRateLimitEvent(w.session, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: w.R5 } });
  w.eng.noteTurnEnd(w.session);
  await new Promise((r) => setTimeout(r, 40));
  ok('REAL rate_limit_event: the pool re-points the link BEFORE the session is armed, so NOTHING is continued immediately (the injected signal reaches fireNow; the producer does not)', w.fired.length === 0 && w.linkNow() === w.SPARE, JSON.stringify({ fires: w.fired.length, link: w.nameOf(w.linkNow()) }));
  const st = w.ar.statusFor(w.SID);
  ok('…the session is armed on the +45s NEAR-arm the switch created, naming the member it moved to', st.armed === true && gateOf(/^switched to a usable account \(B-Stack Max\)/.test(String(st.reason))) && st.resetsAt <= Date.now() + 46000, JSON.stringify(st));
  ok('…and nothing was said in the conversation yet (a switch that self-heals in 45s must not narrate itself)', w.notes.length === 0, JSON.stringify(w.notes));
  // the tick, ~60s later in production (the arm is back-dated instead of slept)
  const did = await w.tickFire();
  ok('…the TICK is what continues it — one continue, delivered onto the member the pool moved to', did === true && w.fired.length === 1 && verdictOf(IS_CONTINUE(w.fired[0].text)), JSON.stringify({ fires: w.fired.length }));
  // 2.369.97 ONE CARD PER CONTINUE: the wording rides the delivered prompt (`note`); no second notice follows
  ok('…and the card says the POOL SWITCHED, not that the limit reset (round 1 said 用量上限已重置 on exactly this, now the dominant, path)', w.fired.length === 1 && w.fired[0].note === '账号池已切换到 B-Stack Max，已自动继续这个任务。' && w.notes.length === 0, JSON.stringify({ note: w.fired[0] && w.fired[0].note, notes: w.notes }));
  ok('…NEGATIVE CONTROL: the reset wording still exists for an arm anchored on a real reset (the fix is a branch, not a rename)', arMod.continueNoticeFor({ kind: 'timed', armReason: '5h 0% < 10%', label: 'B-Stack Max' }).text === '用量上限已重置，已自动继续这个任务。');
  // 2.369.104 (owner: "明明没到也没被中断你却提示到达上限了"): the DELAYED ARM notice
  // used to say "用量已达上限。已安排在 <now+45s> 重置后自动继续" about a hot pool
  // switch — a reset instant that was no reset. The arm's own reason decides.
  const armSwitch = arMod.armNoticeFor(st.reason, st.resetsAt, Date.now() - 1000);
  ok('…and the delayed ARM notice for a switch names the member and the seconds, never a "reset"', gateOf(/^账号池已切换到 B-Stack Max，约 \d+ 秒后自动继续这个任务/.test(armSwitch)) && !/重置|已达上限/.test(armSwitch), armSwitch);
  ok('…NEGATIVE CONTROL: an arm anchored on a real reset keeps the reset sentence', verdictOf(/^用量已达上限。已安排在 .+ 重置后自动继续/.test(arMod.armNoticeFor('5h 0% < 10%', Date.now() + 3600000, Date.now()))));
  // (the delayed notice site's WIRING pin: MOVED to the fast scripts/test-auto-resume-loop-pins.mjs — lane text-legs, B-94d3: a leg that reads only source text runs in every lane's gate)
  const rec = w.ar._fires.get(w.SID);
  ok('…the breaker recorded the fire against the member the continue LANDED on', gateOf(rec) && gateOf(rec.last) && rec.last.key === w.SPARE, JSON.stringify(rec && rec.last));
  // the CLI rejects that continue too — through the real producer again
  w.reject({});
  await new Promise((r) => setTimeout(r, 40));
  const lines = cap.done();
  ok('the rejection of that continue does not start a cycle: no second continue', w.fired.length === 1, JSON.stringify({ fires: w.fired.length }));
  ok('…the member that rejected us is quarantined BY NAME (the one we fired at, not the one we came from)', w.ar.recentFireFailures(w.SID).join(',') === w.SPARE, JSON.stringify(w.ar.recentFireFailures(w.SID).map(w.nameOf)));
  ok('…and the session waits instead of spinning', w.ar.statusFor(w.SID).armed === true, JSON.stringify(w.ar.statusFor(w.SID)));
  ok('…the whole episode: one continue and ONE card (the prompt itself; no separate notice), versus 130 and ~150', w.fired.length === 1 && !!w.fired[0].note && w.notes.length === 0, JSON.stringify({ fired: w.fired.length, notes: w.notes }));
  ok('…journaled as the switch it was, not as a reset', gateOf(lines.some((l) => /pool switched to another account — continued automatically/.test(l))) && !lines.some((l) => /usage limit reset — continued automatically/.test(l)), lines.filter((l) => /continued/.test(l)).join(' | '));
}
{
  // (b) the OTHER real producer: a limit BANNER on stdout
  const w = mkWorld();
  w.eng.markLimitBanner(w.session, "Claude usage limit reached. You've hit your session limit · resets 6am");
  w.eng.noteTurnEnd(w.session);
  await new Promise((r) => setTimeout(r, 40));
  ok('REAL limit banner: same ordering — link moved first, no immediate continue, armed on the near-arm', w.fired.length === 0 && w.linkNow() === w.SPARE && verdictOf(/^switched to a usable account/.test(String(w.ar.statusFor(w.SID).reason))), JSON.stringify({ fires: w.fired.length, link: w.nameOf(w.linkNow()), st: w.ar.statusFor(w.SID) }));
  ok('…and the tick then continues it exactly once, with the switch wording', (await w.tickFire()) === true && w.fired.length === 1 && w.notes.length === 0 && verdictOf(/账号池已切换到 B-Stack Max/.test(w.fired[0].note)), JSON.stringify({ note: w.fired[0] && w.fired[0].note, notes: w.notes }));
}
{
  // (c) ARTIFICIAL CONTROL, kept and labelled: injecting the signal skips the
  // early switch, which is the ONLY way this world reaches fireNow — the
  // measurement that made (a) and (b) necessary
  const w = mkWorld();
  w.eng.noteWallSignal(w.session, { resetsAtMs: w.R5 * 1000, bucket: 'fiveHour', key: w.linkNow(), slot: true });
  w.eng.noteTurnEnd(w.session);
  await w.fireSettled(1, 'CONTROL (c)');   // on the gate's own settle (flake census round 2), never a fixed 40 ms
  ok('CONTROL (injected signal, no early pool eval): the switch lands with the session already armed and fireNow DOES continue it immediately', w.fired.length === 1 && w.linkNow() === w.SPARE, JSON.stringify({ fires: w.fired.length, link: w.nameOf(w.linkNow()) }));
  ok('…which is why (a)/(b) cannot be written this way: the same world, the same wall, a different producer, a different outcome', true);
}
{
  // (c) PLACED (flake census round 2, 主开发 r4456): control (c)'s immediate continue with its gate HELD past the old 40 ms (the
  // world's real beforeAutoResumeFire waits for the leg's word, as B-b4af's plant holds it). The OLD read — 40 ms, then the
  // continues — reads NONE while the gate still decides: the red-then-green the census found. The NEW read waits on the gate's
  // own settle through the same hold and sees the one continue. (The hold ends on the leg's word, after a stall PLACED past the
  // old 40 ms window — a placement, never a verdict bound.)
  const held = (w) => { let open = null; const gate = new Promise((r) => { open = r; }); let entered = 0; const real = w.eng.beforeAutoResumeFire; w.eng.beforeAutoResumeFire = async (...a) => { entered++; await gate; return real.apply(w.eng, a); }; return { open: () => open(), entered: () => entered }; };
  const wall = (w) => { w.eng.noteWallSignal(w.session, { resetsAtMs: w.R5 * 1000, bucket: 'fiveHour', key: w.linkNow(), slot: true }); w.eng.noteTurnEnd(w.session); };
  const w0 = mkWorld(), h0 = held(w0);
  wall(w0);
  await new Promise((r) => setTimeout(r, 40));
  const oldRead = w0.fired.length, entered0 = h0.entered();
  h0.open(); await w0.fireSettled(1, 'CONTROL (c) PLACED, after the old read');
  ok('CONTROL (c) PLACED: with the gate held past 40 ms the OLD read (40 ms, then the continues) reads NO continue although the gate was entered — and the late gate then continues it: the old shape\'s red, placed', oldRead === 0 && entered0 >= 1 && w0.fired.length === 1, JSON.stringify({ oldRead, entered: entered0, fires: w0.fired.length }));
  const w1 = mkWorld(), h1 = held(w1);
  wall(w1);
  const settled = w1.fireSettled(1, 'CONTROL (c) PLACED, the new read');
  await new Promise((r) => setTimeout(r, 40)); h1.open();
  const got = await settled;
  ok('CONTROL (c) PLACED: the NEW read waits on the gate\'s own settle through the same hold and sees the ONE continue, onto the spare', got === true && h1.entered() >= 1 && w1.fired.length === 1 && w1.linkNow() === w1.SPARE, JSON.stringify({ got, entered: h1.entered(), fires: w1.fired.length, link: w1.nameOf(w1.linkNow()) }));
}
{
  // (d) THE IMMEDIATE PATH'S REAL JOB (c1206711): the pool has nowhere to go
  // when the wall lands, the session waits on a real reset, and a member frees
  // up LATER. A hot re-point does not move an idle session by itself, so
  // fireNow must continue it — driven here through maybePoolAutoSwitchForPool,
  // the engine's own seam, not through auto-resume.
  const w = mkWorld(); const cap = capture();
  const dead = { fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: w.R5 }, sevenDay: { utilization: 0.4, resetsAt: w.R7 } };
  w.writeCache(w.LINK, dead); w.writeCache(w.SPARE, dead);
  w.eng.recordRateLimitEvent(w.session, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: w.R5 } });
  w.eng.noteTurnEnd(w.session);
  await new Promise((r) => setTimeout(r, 40));
  const st0 = w.ar.statusFor(w.SID);
  ok('a wall with nowhere to go arms on the REAL reset and continues nothing', w.fired.length === 0 && st0.armed === true && st0.resetsAt > Date.now() + 60 * 60000, JSON.stringify(st0));
  // …and now B-Stack Max frees up. Wind back the eval gate (10s) and the
  // per-session dwell belt (180s) instead of sleeping through them.
  w.writeCache(w.SPARE, { fetchedAt: Date.now(), source: 'cli-usage', fiveHour: { utilization: 0.05, resetsAt: w.R5 }, sevenDay: { utilization: 0.2, resetsAt: w.R7 } });
  w.eng._poolAutoLast.delete(w.P);
  w.eng._poolSwitchAt.delete(w.P + ':' + w.SID);
  w.eng.maybePoolAutoSwitchForPool(w.P);
  await new Promise((r) => setTimeout(r, 60));
  const lines = cap.done();
  ok('a LATER pool switch onto a healthy member continues the armed session IMMEDIATELY (the c1206711 rule, through the real pool seam)', w.fired.length === 1 && w.linkNow() === w.SPARE, JSON.stringify({ fires: w.fired.length, link: w.nameOf(w.linkNow()) }));
  ok('…journaled as an immediate continue, and explained once ON the prompt, naming the member', gateOf(lines.some((l) => /continued immediately/.test(l))) && w.fired.filter((f) => /账号池已切换到 B-Stack Max/.test(f.note || '')).length === 1 && w.notes.length === 0, JSON.stringify({ notes: w.notes, fired: w.fired.map((f) => f.note), j: lines.filter((l) => /continued/.test(l)) }));
}

// ── §3 THE BREAKER'S RULES (unit level, on the real module) ────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-arbreak-'));
  cleanup.push(dir);
  const sessions = new Map();
  const sent = [], notes = [], journal = [];
  let ident = { key: 'sub-a', name: 'Account A' };
  const ar = create({
    dataDir: dir, activeSessions: sessions, serverSetting: () => true, log: (...a) => journal.push(a.join(' ')),
    sendToSession: (id, s, t) => { sent.push(t); return true; }, notify: (id, s, t) => notes.push(t),
    fireIdentity: () => ident,
  });
  const s = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
  sessions.set('s1', s);
  const arm = () => ar.armIfEnabled('s1', s, Date.now() + 60000, 'usage limit');

  arm(); ok('breaker: the first immediate fire goes through', ar.fireNow('s1', '账号池已切换到 Account A') === true && sent.length === 1);
  arm(); ok('…a second one, before we have heard back about the first, is refused (never two continues in flight)', ar.fireNow('s1', '账号池已切换到 Account A') === false && sent.length === 1);
  ar.noteFireOutcome('s1', false, 'limit rejection');
  arm(); ok('…and once the first came back REJECTED, the same identity is refused outright', ar.fireNow('s1', '账号池已切换到 Account A') === false && sent.length === 1);
  ok("…the refusal is journaled once, with its reason and when it may retry", journal.filter((l) => /refused an? immediate continue onto Account A \(same-identity, not before /.test(l)).length === 1, journal.join(' | '));
  ok('…and the conversation gets ONE honest line: it names the identity that refused US and claims nothing about the rest of the pool (nobody has told us)', notes.filter((t) => /^账号 Account A 刚刚拒绝了这个会话的自动续跑，已暂停立即重试。/.test(t)).length === 1 && !notes.some((t) => /没有其它可用成员/.test(t)), JSON.stringify(notes));
  const nBefore = notes.length;
  arm(); ar.fireNow('s1', '账号池已切换到 Account A');
  arm(); ar.fireNow('s1', '账号池已切换到 Account A');
  ok('…repeats are journal-only (the notice is once per session per window)', notes.length === nBefore, JSON.stringify(notes.slice(nBefore)));

  ident = { key: 'sub-b', name: 'Account B' };
  arm();
  ok('a DIFFERENT identity is allowed — but only after the immediate back-off (2nd fire ≥60s)', ar.fireNow('s1', '账号池已切换到 Account B') === false && verdictOf(/backoff/.test(journal.filter((l) => /refused/.test(l)).pop() || '')), journal.filter((l) => /refused/.test(l)).pop());
  // wind the clock back on the recorded fire instead of sleeping 60s
  const rec = ar._fires.get('s1');
  rec.lastFireAt = Date.now() - 61000;
  arm();
  ok('…and it goes through once that back-off has elapsed', ar.fireNow('s1', '账号池已切换到 Account B') === true && sent.length === 2);
  ar.noteFireOutcome('s1', false, 'limit rejection');
  ident = { key: 'sub-c', name: 'Account C' };
  rec.lastFireAt = Date.now() - 400000;
  arm();
  ok('…a third identity after the 5min rung still fires (the cap is 3, not 2)', ar.fireNow('s1', '账号池已切换到 Account C') === true && sent.length === 3);
  ar.noteFireOutcome('s1', false, 'limit rejection');
  ident = { key: 'sub-d', name: 'Account D' };
  ar._fires.get('s1').lastFireAt = Date.now() - 400000;
  arm();
  ok(`…the ${FIRE_MAX_IMMEDIATE}-per-hour cap then closes the immediate path entirely`, ar.fireNow('s1', '账号池已切换到 Account D') === false && verdictOf(/hourly-cap/.test(journal.filter((l) => /refused/.test(l)).pop() || '')), journal.filter((l) => /refused/.test(l)).pop());
  ok('…but the TIMED reset path is still open (that is the path anchored to a real reset)', verdictOf((() => {
    const a = ar._armed.get('s1'); a.resetsAt = Date.now() - GRACE_MS - 1000;
    const before = sent.length; ar.tick(Date.now()); return sent.length === before + 1;
  })()), 'timed fire blocked by the immediate cap');
  ok('…and the identities that rejected us are reportable to the engine', ar.recentFireFailures('s1').sort().join(',') === 'sub-a,sub-b,sub-c', JSON.stringify(ar.recentFireFailures('s1')));
  ok('a completed turn CLEARS the whole memory (proof the lane works — noteRecovered runs it before the armed-record check, which a fire has already deleted)', verdictOf((() => {
    ar.noteRecovered('s1', 'turn completed normally');
    return ar.recentFireFailures('s1').length === 0 && !ar._fires.has('s1');
  })()));

  // RESTART: the breaker state is persisted with the armed waits
  {
    ident = { key: 'sub-a', name: 'Account A' };
    arm(); ar.fireNow('s1', '账号池已切换到 Account A'); ar.noteFireOutcome('s1', false, 'limit rejection');
    const sessions2 = new Map(); const sent2 = [];
    const ar2 = create({
      dataDir: dir, activeSessions: sessions2, serverSetting: () => true, log: () => { },
      sendToSession: (id, s2, t) => { sent2.push(t); return true; }, fireIdentity: () => ({ key: 'sub-a', name: 'Account A' }),
    });
    const s2 = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
    sessions2.set('s1', s2);
    ar2.armIfEnabled('s1', s2, Date.now() + 60000, 'usage limit');
    ok('RESTART: a fresh module reloads the failed-fire record and still refuses that identity (a deploy must not hand the loop a fresh budget)', ar2.fireNow('s1', '账号池已切换到 Account A') === false && sent2.length === 0);
    ok('…and it is on disk under `fires`, next to the armed waits', verdictOf((() => {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, 'auto-resume.json'), 'utf8'));
      return !!raw.fires && !!raw.fires.s1 && (raw.fires.s1.fails || []).some((f) => f.key === 'sub-a');
    })()), fs.readFileSync(path.join(dir, 'auto-resume.json'), 'utf8').slice(0, 300));
    ok(`…the quarantine self-expires (${Math.round(FIRE_QUARANTINE_MS / 60000)}min), it is not a permanent ban`, verdictOf((() => {
      const r2 = ar2._fires.get('s1');
      const before = ar2.canFire('s1', 'sub-a', 'now', Date.now()).reason;
      r2.fails = r2.fails.map((f) => ({ ...f, at: Date.now() - FIRE_QUARANTINE_MS - 1000 }));
      const after = ar2.canFire('s1', 'sub-a', 'now', Date.now()).reason;
      r2.windowStart = Date.now() - FIRE_WINDOW_MS - 1000;   // …and so does the hourly cap
      return before === 'same-identity' && after !== 'same-identity' && ar2.canFire('s1', 'sub-a', 'now', Date.now()).ok === true;
    })()));
  }
}

// ── §3b WHAT A REFUSAL IS ALLOWED TO CLAIM (round 2, verifier finding #1) ──
// Round 1 gave every refusal the same card: "the pool switched to X, X was
// rejected too, there is no usable member, retrying has stopped." For the
// PACING reasons all four clauses are false — X is a member we never fired at,
// the pool is healthy, and the session is still armed and continues seconds
// later — and the card also spent the once-per-window budget, so the genuine
// exhaustion line was suppressed for the rest of the hour.
{
  const mk = (name) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-arnote-' + name + '-')); cleanup.push(dir);
    const sessions = new Map(); const sent = [], sentNotes = [], notes = [], journal = [];
    const st = { ident: { key: 'sub-a', name: 'Account A' } };
    const ar = create({
      dataDir: dir, activeSessions: sessions, serverSetting: () => true, log: (...a) => journal.push(a.join(' ')),
      // 2.369.97: a delivered continue explains itself ON the prompt (`note`); `notes` now holds only the refusal cards
      sendToSession: (id, s, t, carried) => { sent.push(t); sentNotes.push(carried && carried.note || null); return true; }, notify: (id, s, t) => notes.push(t),
      fireIdentity: () => st.ident,
    });
    const s = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
    sessions.set('s1', s);
    return { ar, sent, sentNotes, notes, journal, st, arm: (ms = 60000) => ar.armIfEnabled('s1', s, Date.now() + ms, 'usage limit') };
  };

  // (i) a PACING refusal — the pool moved us onto a member nobody has asked yet
  {
    const w = mk('pace');
    w.arm(); w.ar.fireNow('s1', '账号池已切换到 Account A');
    w.st.ident = { key: 'sub-b', name: 'Account B' };   // the pool re-points onto a HEALTHY member
    w.arm(); const second = w.ar.fireNow('s1', '账号池已切换到 Account B');
    ok('a fire-pending refusal is JOURNAL-ONLY: Account B never rejected anything, and the promise is intact', second === false && gateOf(w.journal.some((l) => /refused an immediate continue onto Account B \(fire-pending/.test(l))) && w.notes.length === 0 && w.sentNotes.length === 1 && w.sentNotes[0] === '账号池已切换到 Account A，已自动继续这个任务。', JSON.stringify({ notes: w.notes, j: w.journal.filter((l) => /refused/.test(l)) }));
    ok('…and the session it just told nothing to is STILL ARMED (round 1 told it "已停止反复重试" here)', w.ar.statusFor('s1').armed === true, JSON.stringify(w.ar.statusFor('s1')));
    ok('…the once-per-window budget was NOT spent: the genuine exhaustion line still goes out', verdictOf((() => {
      w.ar.noteFireOutcome('s1', false, 'limit rejection');           // the CLI answers OUR fire (Account A) with a limit
      w.st.ident = { key: 'sub-a', name: 'Account A' };               // the pool puts us back on the rejector
      w.arm(); w.ar.fireNow('s1', '账号池已切换到 Account A');        // same identity ⇒ the real thing
      return w.notes.length === 1 && /^账号 Account A 刚刚拒绝了这个会话的自动续跑/.test(w.notes[0]);   // the continue's own card is not in `notes` since 2.369.97
    })()), JSON.stringify(w.notes));
    ok('…a BACKOFF refusal is journal-only for the same reason (a 60s pacer on a live promise)', verdictOf((() => {
      const before = w.notes.length;
      w.st.ident = { key: 'sub-c', name: 'Account C' };
      w.arm(); const r = w.ar.fireNow('s1', '账号池已切换到 Account C');
      return r === false && /backoff/.test(w.journal.filter((l) => /refused/.test(l)).pop() || '') && w.notes.length === before;
    })()), JSON.stringify({ notes: w.notes, j: w.journal.filter((l) => /refused/.test(l)).pop() }));
  }

  // (ii) the HOURLY CAP says what is true, and has its OWN budget
  {
    const w = mk('cap');
    for (const [key, name] of [['sub-a', 'Account A'], ['sub-b', 'Account B'], ['sub-c', 'Account C']]) {
      w.st.ident = { key, name };
      const r = w.ar._fires.get('s1'); if (r) r.lastFireAt = Date.now() - 400000;   // past the back-off rungs
      w.arm(); w.ar.fireNow('s1', '账号池已切换到 ' + name);
      w.ar.noteFireOutcome('s1', false, 'limit rejection');
    }
    ok(`${FIRE_MAX_IMMEDIATE} continues went out, each explained once ON its prompt and never by a second card`, w.sent.length === FIRE_MAX_IMMEDIATE && w.sentNotes.filter(Boolean).length === FIRE_MAX_IMMEDIATE && w.notes.length === 0, JSON.stringify({ sentNotes: w.sentNotes, notes: w.notes }));
    w.st.ident = { key: 'sub-d', name: 'Account D' };
    w.ar._fires.get('s1').lastFireAt = Date.now() - 400000;
    w.arm(); w.ar.fireNow('s1', '账号池已切换到 Account D');
    const capLine = w.notes[w.notes.length - 1];
    ok('the cap speaks ONE true line — the count and the pause, never "Account D refused us"', gateOf(/^自动续跑在一小时内已连续尝试 3 次仍未见这个会话恢复，暂停立即重试。/.test(capLine)) && !/Account D/.test(capLine) && !/没有其它可用成员/.test(capLine), JSON.stringify(capLine));
    ok('…and it did NOT eat the exhaustion budget: a same-identity refusal still speaks in the same window', verdictOf((() => {
      const before = w.notes.length;
      w.st.ident = { key: 'sub-a', name: 'Account A' };   // in `fails` ⇒ same-identity, which outranks the cap
      w.arm(); w.ar.fireNow('s1', '账号池已切换到 Account A');
      return w.notes.length === before + 1 && /^账号 Account A 刚刚拒绝了这个会话的自动续跑/.test(w.notes[before]);
    })()), JSON.stringify(w.notes));
    ok('…NEGATIVE CONTROL: with round 1\'s SINGLE budget (both classes sharing one stamp) that line is suppressed — the split is what carries it', verdictOf((() => {
      const r = w.ar._fires.get('s1');
      r.notices = { exhausted: Date.now(), cap: Date.now() };   // one shared stamp, the r1 shape
      const before = w.notes.length;
      w.arm(); w.ar.fireNow('s1', '账号池已切换到 Account A');
      return w.notes.length === before;
    })()));
  }

  // (iii) the "nowhere else to go" clause is a SECOND fact, from the pool
  {
    const w = mk('notarget');
    w.arm(); w.ar.fireNow('s1', '账号池已切换到 Account A');
    w.ar.noteFireOutcome('s1', false, 'limit rejection');
    ok('the ENGINE is the only source of "no usable member left" — noteNoPoolTarget records it for a tracked session', w.ar.noteNoPoolTarget('s1', 2, 'all-rejected') === true && (w.ar._fires.get('s1').noTargetAt || 0) > 0);
    ok('…and refuses to mint a record for a session the breaker does not track (a stuck pool must not grow the store)', w.ar.noteNoPoolTarget('never-armed', 3, 'all-rejected') === false && !w.ar._fires.has('never-armed'));
    w.arm(); w.ar.fireNow('s1', '账号池已切换到 Account A');
    ok('…with that fact in hand the same refusal names the state only the USER can fix', gateOf(/没有其它可用成员/.test(w.notes[w.notes.length - 1] || '')) && verdictOf(/可以添加成员/.test(w.notes[w.notes.length - 1] || '')), JSON.stringify(w.notes));
  }
}

// ── §3c THE TWO NOTICE RULES, PURE (truth tables) ──────────────────────────
{
  const { refusalNoticeFor, continueNoticeFor, NO_TARGET_FRESH_MS } = arMod;
  const now = 1788780000000;
  const far = now + 3 * 3600000, near = now + 45000;
  const R = (o) => refusalNoticeFor({ now, ...o });
  ok('PURE refusal: backoff and fire-pending say NOTHING (they do not break the promise)', R({ reason: 'backoff', label: 'A', armedResetsAt: near }) === null && R({ reason: 'fire-pending', label: 'A', armedResetsAt: far }) === null);
  ok('PURE refusal: an unknown reason says nothing either (a new refusal must opt IN to speaking)', R({ reason: 'something-new', label: 'A', armedResetsAt: far }) === null);
  ok('PURE refusal: same-identity names the account and, with a far reset, promises the time it will retry', verdictOf((() => {
    const n = R({ reason: 'same-identity', label: 'A', armedResetsAt: far });
    return n.cls === 'exhausted' && /^账号 A 刚刚拒绝了/.test(n.text) && n.text.includes(new Date(far).toLocaleString()) && !/没有其它可用成员/.test(n.text);
  })()), JSON.stringify(R({ reason: 'same-identity', label: 'A', armedResetsAt: far })));
  ok('PURE refusal: same-identity on a NEAR arm promises no time (a +45s pacer is not a reset)', verdictOf((() => {
    const n = R({ reason: 'same-identity', label: 'A', armedResetsAt: near });
    return n.cls === 'exhausted' && /账号池恢复可用时会自动继续/.test(n.text) && !/重置后自动继续/.test(n.text);
  })()), JSON.stringify(R({ reason: 'same-identity', label: 'A', armedResetsAt: near })));
  ok('PURE refusal: the "nowhere else to go" clause needs the pool\'s FRESH verdict', verdictOf((() => {
    const fresh = R({ reason: 'same-identity', label: 'A', armedResetsAt: near, noTargetAt: now - 1000 });
    const stale = R({ reason: 'same-identity', label: 'A', armedResetsAt: near, noTargetAt: now - NO_TARGET_FRESH_MS - 1 });
    return /没有其它可用成员/.test(fresh.text) && !/没有其它可用成员/.test(stale.text);
  })()));
  ok('PURE refusal: hourly-cap is its own class and never claims an account refused us', verdictOf((() => {
    const n = R({ reason: 'hourly-cap', label: 'A', armedResetsAt: far, maxImmediate: 3 });
    return n.cls === 'cap' && /连续尝试 3 次/.test(n.text) && !/A /.test(n.text) && !/拒绝/.test(n.text);
  })()), JSON.stringify(R({ reason: 'hourly-cap', label: 'A', armedResetsAt: far })));
  const C = continueNoticeFor;
  ok('PURE continue: the immediate path is always a pool switch', C({ kind: 'now', armReason: '5h 0% < 10%', label: 'X' }).cls === 'switched');
  ok('PURE continue: a TIMED fire off the near-arm says the pool switched (round 1 said the limit had reset)', C({ kind: 'timed', armReason: 'switched to a usable account (X)', label: 'X' }).text === '账号池已切换到 X，已自动继续这个任务。');
  ok('PURE continue: a TIMED fire whose identity MOVED during the gate says the same', C({ kind: 'timed', armReason: 'usage limit', label: 'X', moved: true }).cls === 'switched');
  ok('PURE continue: an account that came back by itself is not a pool switch', C({ kind: 'timed', armReason: 'account usable again', label: 'X' }).text === '账号 X 已恢复可用，已自动继续这个任务。');
  // THE PAIR ROUND 1 SILENTLY CHANGED (r2 of the new-member wake): the engine
  // arms with 'account usable again' at scheduleWallProbe and then a REAL pool
  // switch fires with kind:'now' (:2417/:2498). Round 1 hoisted the arm-reason
  // clause above kind:'now' while adding `cause`, and this pair started
  // reading as a recovery. `cause` may only REFINE the order, never reorder it.
  ok('PURE continue: kind:\'now\' on a session near-armed with \'account usable again\' is a SWITCH, not a recovery (the pair round 1 changed)',
    C({ kind: 'now', armReason: 'account usable again', label: 'X' }).text === '账号池已切换到 X，已自动继续这个任务。');
  ok('PURE continue: the new-member wake NAMES the member that became usable (nothing switched)',
    C({ kind: 'now', armReason: 'usage limit', label: 'X', cause: 'member-usable' }).text === '账号 X 已恢复可用，已自动继续这个任务。');
  ok('PURE continue: …but `moved` still outranks `cause` — the gate re-pointed us onto a member the wake never spoke about',
    C({ kind: 'now', armReason: 'usage limit', label: 'Y', moved: true, cause: 'member-usable' }).text === '账号池已切换到 Y，已自动继续这个任务。');
  ok('PURE continue: a real reset anchor keeps the reset wording', C({ kind: 'timed', armReason: '5h 0% < 10% · 7d 2% < 5%', label: 'X' }).cls === 'reset');
  ok('PURE continue: a missing label degrades, never throws', C({ kind: 'now', armReason: null, label: null }).text === '账号池已切换到 可用账号，已自动继续这个任务。');
  // DRIFT GUARD: the arm reasons above are ENGINE strings — if the engine
  // renames one, the timed pool-switch card silently reverts to "限额已重置"
  // (the near-arm DRIFT guard: COPIED to the fast scripts/test-auto-resume-loop-pins.mjs — lane text-legs, B-94d3: a leg that reads only source text runs in every lane's gate)
  const engSrc = read('src/server/usage-pool-engine.js');   // …and kept HERE beside the fixture strings it guards (an engine rename must red this suite too)
  ok('DRIFT: the two near-arm reasons the wording keys on are the ones the engine writes', gateOf(/armIfEnabled\(id, session, Date\.now\(\) \+ 45000, `switched to a usable account \(/.test(engSrc)) && verdictOf(/armIfEnabled\?\.\(id, session, Date\.now\(\) \+ 45000, 'account usable again'\)/.test(engSrc)));
}

// ── §4 THE PRE-FIRE GATE IS NO LONGER BYPASSED BY THE IMMEDIATE PATH ───────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-argate-'));
  cleanup.push(dir);
  const sessions = new Map(); const sent = [];
  let gate = false, seen = 0;
  const ar = create({
    dataDir: dir, activeSessions: sessions, serverSetting: () => true, log: () => { },
    sendToSession: (id, s, t) => { sent.push(t); return true; },
    beforeFire: async () => { seen++; return gate; },
  });
  const s = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
  sessions.set('s1', s);
  ar.armIfEnabled('s1', s, Date.now() + 60000, 'usage limit');
  ar.fireNow('s1', 'switched');
  await new Promise((r) => setTimeout(r, 30));
  ok('fireNow runs the SAME pre-fire gate as the tick — a VETO blocks the immediate spend (it used to skip the gate entirely)', seen === 1 && sent.length === 0 && s._arFiring === false);
  ok('…and a vetoed fire stays ARMED (nothing was spent, nothing was forgotten)', ar.statusFor('s1').armed === true);
  gate = true;
  ar.fireNow('s1', 'switched');
  await new Promise((r) => setTimeout(r, 30));
  ok('…a passing gate delivers exactly one continue', seen === 2 && sent.length === 1 && verdictOf(IS_CONTINUE(sent[0])));
  // re-entrancy: the real gate calls maybePoolAutoSwitch, which calls fireNow
  const sessions2 = new Map(); const sent2 = [];
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-argate2-')); cleanup.push(dir2);
  let depth = 0, maxDepth = 0;
  const ar2 = create({
    dataDir: dir2, activeSessions: sessions2, serverSetting: () => true, log: () => { },
    sendToSession: (id, s2, t) => { sent2.push(t); return true; },
    beforeFire: async () => { depth++; maxDepth = Math.max(maxDepth, depth); ar2.fireNow('s1', 're-entrant'); depth--; return true; },
  });
  const s2b = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
  sessions2.set('s1', s2b);
  ar2.armIfEnabled('s1', s2b, Date.now() + 60000, 'usage limit');
  ar2.fireNow('s1', 'switched');
  await new Promise((r) => setTimeout(r, 30));
  ok('the gate calling back into fireNow cannot recurse (the real beforeFire runs maybePoolAutoSwitch, which fires armed sessions)', maxDepth === 1 && sent2.length === 1, JSON.stringify({ maxDepth, sent: sent2.length }));
}

// ── §4b TOKEN-SLOT VALIDATION: what happens when the slot cannot be trusted ─
{
  const w = mkWorld(); const cap = capture();
  // the link's credentials disappear under it (re-login in flight, a hand-
  // deleted dir): the slot no longer VALIDATES, so it is not authority for a
  // wall — the old corroboration ladder takes over instead of demoting on a guess
  fs.rmSync(path.join(w.am.subDir(w.LINK), '.credentials.json'), { force: true });
  const bm = w.eng.sessionBillingMember(w.session, w.P);
  // poolMembers() filters by loggedIn, so a signed-out link fails the
  // membership leg — that IS the credentials check, held in one place
  ok('an unvalidated credential slot says WHICH leg failed, and still names the link', bm.id === w.LINK && bm.slotOk === false && bm.slotReason === 'slot-not-a-member', JSON.stringify(bm));
  w.eng._wallRing.clear(); w.eng._sessionWalls.clear();
  w.eng.noteWallSignal(w.session, { resetsAtMs: w.R5 * 1000, bucket: 'fiveHour', key: w.LINK, slot: false });
  w.eng.noteTurnEnd(w.session);
  const lines = cap.done();
  // NOTE (round 2): assert the LADDER's own output, not "the cache is
  // untouched" — that only held because the signal was injected. A real
  // rejection writes its own reading through captureRateLimitEvent before the
  // ladder ever runs; the leg below drives exactly that.
  ok('…a single wall on it is HELD (never demote on a guess — the 2.368.34 ladder is the degrade path, not a silent skip)', (w.readCache(w.LINK) || {}).source !== 'wall' && verdictOf(lines.some((l) => /holding the demotion/.test(l))), lines.filter((l) => /wall/.test(l)).join(' | '));
  ok('…and the journal names the failing leg, not a wrong claim about which account it is', verdictOf(lines.some((l) => /this session's slot, but unvalidated: slot-not-a-member/.test(l))), lines.filter((l) => /single wall/.test(l)).join(' | '));
  ok('…every named failure reason is reachable (an unsatisfiable leg is deleted functionality wearing a check\'s clothes)', verdictOf((() => {
    const w2 = mkWorld();
    // a session with no link of its own, on a pool whose DEFAULT link is gone:
    // poolCurrentFor resolves to nothing at all (unlink, never rmSync — the
    // pool link is a directory symlink and rmSync throws on it)
    const noLink = { backend: 'claude', mode: 'chat', _webuiId: 'nolink', _accountId: w2.P, pty: { write() { } } };
    fs.unlinkSync(w2.am.subDir(w2.P));
    return w2.eng.sessionBillingMember(noLink, w2.P).slotReason === 'no-slot';
  })()));
  ok("…while a non-pooled session's slot is trivially its own account (one creds dir, fixed at spawn)", verdictOf((() => {
    const solo = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'solo', claudeSessionId: 'cid-solo', _accountId: w.SPARE, pty: { write() { } } };
    return w.eng.wallKeyFor(solo) === w.SPARE && w.eng.fireIdentityFor(solo).key === w.SPARE;
  })()));
}

// ── §4b2 …and what the REAL producer writes while that hold stands ─────────
{
  const w = mkWorld(); const cap = capture();
  fs.rmSync(path.join(w.am.subDir(w.LINK), '.credentials.json'), { force: true });   // slot no longer validates
  w.eng._wallRing.clear(); w.eng._sessionWalls.clear();
  w.eng.recordRateLimitEvent(w.session, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: w.R5 } });
  w.eng.noteTurnEnd(w.session);
  await new Promise((r) => setTimeout(r, 40));
  const lines = cap.done();
  const c = w.readCache(w.LINK);
  ok('a REAL rejection writes its OWN reading on the slot key (rate-limit-event, utilization 1) — so "the cache is untouched" was an artefact of injecting the signal', gateOf(c) && c.source === 'rate-limit-event' && c.fiveHour.utilization === 1, JSON.stringify(c));
  ok('…and the wall machine still demotes NOTHING on an unvalidated slot — two writers, and only the ground-truth one is gated', !lines.some((l) => /\[wall\] demoted/.test(l)) && c.source !== 'wall', lines.filter((l) => /wall/.test(l)).join(' | '));
  ok('…the ladder says WHY by name: with its credentials gone the link is not a pool member at all (the other unvalidated shape, §4b, is the held one)', verdictOf((() => {
    const d = w.eng.demoteWalledAccount(w.session, [{ at: Date.now(), key: w.LINK, slot: false, bucket: 'fiveHour', resetsAtMs: w.R5 * 1000 }]);
    return d && d.demoted === false && (d.reason === 'not-a-member' || d.reason === 'unverified');
  })()), 'the ladder demoted an account it could not verify');
}

// ── §4d TWO RECORDS, ONE REJECTION (r3, the round-2 verifier's finding) ────
// ONE rejection reaches us as SEVERAL records — the CLI's `rate_limit_event`,
// the assistant limit banner, and a banner inside a task_notification (three
// producers in claude-stream-json.js; noteWallSignal's own comment says a
// banner + its rejected event are ONE wall). Every one of them calls
// maybePoolAutoSwitch the moment it marks the cache, so the FIRST record
// re-points the link BY ITSELF — and round 2 resolved the credential slot per
// RECORD. The second record therefore keyed to the member the pool had just
// moved TO, and the branch's own slot rung demoted that HEALTHY member with
// `credential slot` authority and recorded it as having rejected this
// conversation: the misattribution the whole change exists to remove.
// The legs below drive BOTH real producers in ONE turn, in both orders (plus
// the two-events shape), and the NEGATIVE CONTROL re-creates the un-pinned
// resolution through the same public seam.
{
  const BANNER = "Claude usage limit reached. You've hit your session limit · resets 6am";
  const rejEvent = (w, kind = 'five_hour', resetsAt = null) => ({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: kind, resetsAt: resetsAt || w.R5 } });
  const dead = (w) => ({ fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: w.R5 }, sevenDay: { utilization: 0.4, resetsAt: w.R7 } });
  /** ONE turn, the REAL producers, in the CLI's own order.
   *  `unpinned` wipes the turn's signal list BETWEEN the records — which is
   *  exactly what the per-record resolution saw before the pin existed. */
  async function oneRejection(steps, { unpinned = false } = {}) {
    const w = mkWorld(); const cap = capture();
    const fire = {
      event: () => w.eng.recordRateLimitEvent(w.session, rejEvent(w)),
      banner: () => w.eng.markLimitBanner(w.session, BANNER),
      sevenDay: () => w.eng.recordRateLimitEvent(w.session, rejEvent(w, 'seven_day', w.R7)),
    };
    steps.forEach((step, i) => { fire[step](); if (unpinned && i < steps.length - 1) w.session._turnWallSigs = []; });
    w.eng.noteTurnEnd(w.session);
    await new Promise((r) => setTimeout(r, 40));
    return { w, lines: cap.done() };
  }
  const healthyNow = (w, id) => w.writeCache(id, { fetchedAt: Date.now(), source: 'cli-usage', fiveHour: { utilization: 0.05, resetsAt: w.R5 }, sevenDay: { utilization: 0.2, resetsAt: w.R7 } });

  for (const steps of [['event', 'banner'], ['banner', 'event'], ['event', 'sevenDay']]) {
    const label = steps.join('→');
    const { w, lines } = await oneRejection(steps);
    const spare = w.readCache(w.SPARE);
    ok(`ONE turn, both producers (${label}): only the member that was the slot when the rejection ARRIVED is demoted`, gateOf(lines.some((l) => /\[wall\] demoted userP (5h|7d) until \S+ \(1 walls \/ credential slot\)/.test(l))) && !lines.some((l) => /demoted B-Stack Max/.test(l)), lines.filter((l) => /demoted/.test(l)).join(' | '));
    ok(`…and the member the pool MOVED TO is untouched — its cache still the reading it had (${label})`, gateOf(spare) && spare.source === 'cli-usage' && spare.fiveHour.utilization === 0.2 && spare.sevenDay.utilization === 0.35, JSON.stringify(spare));
    ok(`…it is not recorded as having rejected this conversation either (${label})`, [...w.eng.sessionWalledMembers(w.SID)].join(',') === w.LINK, JSON.stringify([...w.eng.sessionWalledMembers(w.SID)].map(w.nameOf)));
    const st = w.ar.statusFor(w.SID);
    ok(`…so the session near-arms onto it instead of waiting out a reset (${label})`, w.fired.length === 0 && st.armed === true && gateOf(/^switched to a usable account \(B-Stack Max\)/.test(String(st.reason))) && st.resetsAt <= Date.now() + 46000, JSON.stringify(st));
    healthyNow(w, w.SPARE);
    const v = w.eng.quotaVerdictFor(w.P, { model: 'claude-fable-5', session: w.session });
    ok(`…and a fresh ground-truth reading on it answers usable (${label}) — the misattribution's harm was a multi-hour wait with a healthy member sitting in the pool`, v.usable === true && v.viaId === w.SPARE, JSON.stringify({ usable: v.usable, via: v.via, blockedUntil: v.blockedUntil }));
    ok(`…the TICK then continues it, once, onto that member (${label})`, (await w.tickFire()) === true && w.fired.length === 1 && w.ar._fires.get(w.SID).last.key === w.SPARE, JSON.stringify({ fires: w.fired.length, last: w.ar._fires.get(w.SID).last }));
  }

  // NEGATIVE CONTROL: the same world, the same two producers, the pin's INPUT
  // wiped between them = the per-record resolution round 2 shipped.
  {
    const { w, lines } = await oneRejection(['event', 'banner'], { unpinned: true });
    const spare = w.readCache(w.SPARE);
    ok('NEGATIVE CONTROL (slot resolved per RECORD): the healthy member the pool just moved TO is demoted with `credential slot` authority', gateOf(lines.some((l) => /\[wall\] demoted B-Stack Max 5h until \S+ \(1 walls \/ credential slot\)/.test(l))) && spare.source === 'wall' && spare.fiveHour.utilization === 1, JSON.stringify({ spare, j: lines.filter((l) => /demoted/.test(l)) }));
    ok('…and it is marked as having rejected this conversation, while the account that actually refused us is not', [...w.eng.sessionWalledMembers(w.SID)].join(',') === w.SPARE, JSON.stringify([...w.eng.sessionWalledMembers(w.SID)].map(w.nameOf)));
    healthyNow(w, w.SPARE);
    const v = w.eng.quotaVerdictFor(w.P, { model: 'claude-fable-5', session: w.session });
    ok('…so even a FRESH ground-truth reading showing it healthy cannot unblock the session — it waits on a reset instead of continuing in ~60s', v.usable === false && gateOf(/B-Stack Max: rejected this conversation/.test(String(v.reason))) && v.blockedUntil > Date.now() + 30 * 60000, JSON.stringify({ usable: v.usable, reason: v.reason, blockedUntil: v.blockedUntil && new Date(v.blockedUntil).toISOString() }));
    ok('…(and the 7d variant of the same control stamps a reset THREE DAYS out on that healthy member)', verdictOf(await (async () => {
      const r = await oneRejection(['event', 'sevenDay'], { unpinned: true });
      const c = r.w.readCache(r.w.SPARE);
      return !!c && c.sevenDay.utilization === 1 && c.sevenDay.status === 'limited';
    })()));
  }

  // the pin itself, on the engine's own seam
  {
    const w = mkWorld();
    ok('rejectionSlotFor: with no signals on the turn it resolves the slot FRESH', w.eng.rejectionSlotFor(w.session).key === w.LINK && w.eng.rejectionSlotFor(w.session).slotReason !== 'turn-pinned', JSON.stringify(w.eng.rejectionSlotFor(w.session)));
    w.eng.noteWallSignal(w.session, { key: w.LINK, slot: true, bucket: 'fiveHour' });
    w.am.ensureSessionPoolLink(w.P, w.SID, w.SPARE);   // …and now the link moves, exactly as the first record's own pool switch moves it
    const pinned = w.eng.rejectionSlotFor(w.session);
    ok('…once the turn has a keyed signal it PINS to it, link movement notwithstanding (a re-point does not reach a running CLI — 2.361.0)', pinned.key === w.LINK && pinned.slotOk === true && pinned.slotReason === 'turn-pinned', JSON.stringify(pinned));
    ok('…while "where would a CONTINUE land" still reads the link fresh: two different questions, two different functions', w.eng.wallKeyFor(w.session) === w.SPARE && w.eng.fireIdentityFor(w.session).key === w.SPARE, JSON.stringify({ wallKey: w.nameOf(w.eng.wallKeyFor(w.session)), fire: w.eng.fireIdentityFor(w.session) }));
    w.eng.noteTurnEnd(w.session);
    await new Promise((r) => setTimeout(r, 40));
    ok('…and the pin dies with the turn (noteTurnEnd clears the signals — it is exactly one turn wide)', w.eng.rejectionSlotFor(w.session).key === w.linkNow() && w.eng.rejectionSlotFor(w.session).slotReason !== 'turn-pinned', JSON.stringify({ slot: w.eng.rejectionSlotFor(w.session), link: w.nameOf(w.linkNow()) }));
  }
}

// ── §4e THE NEAR-ARM: what protects it, and what merely asserts it ─────────
// Round 2 guarded the near-arm with `v.viaId === demoted.key`, which cannot be
// true: demoteWalledAccount records noteSessionWall(member) on EVERY path that
// resolves a member (held demotions included) and quotaVerdictFor forces
// usable:false for that set, so `viaId` is never the rejector; the only
// `demoted.key` that skips the session wall is `not-a-member`, whose key by
// construction matches no member. The suite pinned it by source grep, so the
// branch never executed while reading like the defence (恒假守卫). Now: the
// PROTECTION is executed below, and the assertion is a PURE function with a
// truth table that says out loud what it is.
{
  const w = mkWorld();
  w.writeCache(w.LINK, { fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: w.R5 }, sevenDay: { utilization: 0.4, resetsAt: w.R7 } });
  const before = w.eng.quotaVerdictFor(w.P, { model: 'claude-fable-5', session: w.session });
  ok('CONTROL: with nothing walled, the verdict answers `usable via` the healthy member', before.usable === true && before.viaId === w.SPARE, JSON.stringify({ usable: before.usable, via: before.via }));
  const d = w.eng.demoteWalledAccount(w.session, [{ at: Date.now(), key: w.SPARE, slot: false, bucket: 'fiveHour', resetsAtMs: w.R5 * 1000 }]);
  const after = w.eng.quotaVerdictFor(w.P, { model: 'claude-fable-5', session: w.session });
  ok('THE REAL PROTECTION, executed: a member that answered this conversation with a wall can never be the verdict\'s way out — even with the demotion HELD and its cache still reading healthy', gateOf(d) && d.demoted === false && d.reason === 'unverified' && gateOf(w.eng.sessionWalledMembers(w.SID).has(w.SPARE)) && after.usable !== true && verdictOf(/B-Stack Max: rejected this conversation/.test(String(after.reason))), JSON.stringify({ d, reason: after.reason }));
  ok('…which is why the near-arm assertion cannot fire — so it is PURE, tested, and labelled an assertion instead of pinned as the defence', typeof probe.eng.nearArmVeto === 'function');
  ok('nearArmVeto: a viaId in the walled set IS a violation (the branch the call site takes)', typeof probe.eng.nearArmVeto(w.SPARE, new Set([w.SPARE])) === 'string' && verdictOf(/rejected this conversation/.test(probe.eng.nearArmVeto(w.SPARE, new Set([w.SPARE])))));
  ok('…NEGATIVE CONTROL: a viaId that is not in the set says nothing (the assertion is not a blanket refusal to near-arm)', probe.eng.nearArmVeto(w.SPARE, new Set([w.LINK])) === null && probe.eng.nearArmVeto(w.SPARE, new Set()) === null);
  ok('…a missing viaId or a missing set says nothing either (never a veto on an unknown)', probe.eng.nearArmVeto(null, new Set([w.SPARE])) === null && probe.eng.nearArmVeto(w.SPARE, null) === null);
  ok('…and it reads an ARRAY the same way (the rule is membership, not a Set trick)', typeof probe.eng.nearArmVeto('m1', ['m1']) === 'string' && probe.eng.nearArmVeto('m1', []) === null);
}

// ── §4c THE GATE CAN MOVE US: the fire is keyed to where it LANDED ─────────
// The pre-fire gate is `beforeAutoResumeFire`, which runs maybePoolAutoSwitch
// and can re-point the session's credential link. Round 1 resolved the
// identity BEFORE the gate and kept it: the breaker then quarantined the
// account we had already left, left the real rejector fireable, journaled the
// wrong name, and deduped the card under the wrong key.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-argate3-')); cleanup.push(dir);
  const sessions = new Map(); const sent = [], notes = [], journal = [];
  const st = { ident: { key: 'sub-a', name: 'Account A' }, move: false };
  const ar = create({
    dataDir: dir, activeSessions: sessions, serverSetting: () => true, log: (...a) => journal.push(a.join(' ')),
    sendToSession: (id, s, t) => { sent.push(t); return true; }, notify: (id, s, t) => notes.push(t),
    fireIdentity: () => st.ident,
    beforeFire: async () => { if (st.move) st.ident = { key: 'sub-b', name: 'Account B' }; return true; },
  });
  const s = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
  sessions.set('s1', s);
  const arm = () => ar.armIfEnabled('s1', s, Date.now() + 60000, 'usage limit');
  // NEGATIVE CONTROL first: a gate that moves nothing must key the fire where it always did
  arm(); ar.fireNow('s1', '账号池已切换到 Account A');
  await new Promise((r) => setTimeout(r, 20));
  ok('CONTROL: a gate that does not move the link keys the fire to the identity we resolved', sent.length === 1 && ar._fires.get('s1').last.key === 'sub-a', JSON.stringify(ar._fires.get('s1').last));
  ar.noteRecovered('s1', 'turn completed normally');   // clean slate
  st.move = true;
  arm(); ar.fireNow('s1', '账号池已切换到 Account A');
  await new Promise((r) => setTimeout(r, 20));
  ok('a gate that RE-POINTS the link keys the fire to the account the continue landed on', sent.length === 2 && ar._fires.get('s1').last.key === 'sub-b', JSON.stringify(ar._fires.get('s1').last));
  // r4784: the continue's journal line names no account — it says the continue landed on another one (the billed account is the
  // fire record's key, pinned just above)
  ok('…and says so in the journal (the continue landed on another account; the line names none)', verdictOf(journal.some((l) => /the gate moved this session onto Account B/.test(l))) || verdictOf(journal.some((l) => /\(landed on another account\) — continued immediately/.test(l) && !/landed on Account/.test(l))), journal.join(' | '));
  ok('…so the rejection quarantines the REAL rejector, not the account we came from', verdictOf((() => {
    ar.noteFireOutcome('s1', false, 'limit rejection');
    return ar.recentFireFailures('s1').join(',') === 'sub-b' && journal.some((l) => /the continue onto sub-b was rejected again/.test(l));
  })()), JSON.stringify(ar.recentFireFailures('s1')));
  const dedupBefore = notes.length;
  st.move = false; st.ident = { key: 'sub-b', name: 'Account B' };
  ar._fires.get('s1').fails = []; ar._fires.get('s1').lastFireAt = Date.now() - 400000;
  arm(); ar.fireNow('s1', '账号池已切换到 Account B');
  await new Promise((r) => setTimeout(r, 20));
  ok('…and the card was deduped under that key too (a second continue onto B in the same window is journal-only)', sent.length === 3 && notes.length === dedupBefore, JSON.stringify({ sent: sent.length, notes }));
  ar.noteFireOutcome('s1', false, 'limit rejection');                 // sub-b is quarantined
  st.ident = { key: 'sub-a', name: 'Account A' }; st.move = true;     // …and the gate moves us right back onto it
  ar._fires.get('s1').lastFireAt = Date.now() - 400000;
  const burnBefore = sent.length;
  arm(); ar.fireNow('s1', 'switched');
  await new Promise((r) => setTimeout(r, 20));
  ok('a gate that moves us onto an identity we already BURNED this window aborts the spend', sent.length === burnBefore, JSON.stringify({ sent: sent.length, burnBefore }));
  ok('…the abort is journaled with the post-gate identity, and the session stays armed', gateOf(journal.some((l) => /refused an immediate continue onto Account B \(same-identity/.test(l))) && ar.statusFor('s1').armed === true, journal.filter((l) => /refused/.test(l)).join(' | '));
}
{
  // null → X is the WIRING finding its voice, not the pool switching accounts:
  // the fire is still keyed to what we learned, but nothing claims a switch
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-argate4-')); cleanup.push(dir);
  const sessions = new Map(); const sent = [], notes = [];
  let calls = 0;
  const ar = create({
    dataDir: dir, activeSessions: sessions, serverSetting: () => true, log: () => { },
    sendToSession: (id, s, t) => { sent.push(t); return true; }, notify: (id, s, t) => notes.push(t),
    fireIdentity: () => (++calls === 1 ? null : { key: 'sub-x', name: 'Account X' }),
    beforeFire: async () => true,
  });
  const s = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
  sessions.set('s1', s);
  ar.armIfEnabled('s1', s, Date.now() + 60000, 'usage limit');
  ar.fireNow('s1', 'switched');
  await new Promise((r) => setTimeout(r, 20));
  ok('an identity we could not resolve BEFORE the gate is not reported as a switch — but the fire is still keyed to what we learned', sent.length === 1 && ar._fires.get('s1').last.key === 'sub-x', JSON.stringify({ sent: sent.length, last: ar._fires.get('s1').last }));
}
{
  // …and the same thing through the REAL engine gate (the r1 verifier's repro):
  // the link sits on a dead member, the gate re-points it, the continue lands
  // on the healthy one.
  const w = mkWorld();
  w.writeCache(w.LINK, { fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: w.R5 }, sevenDay: { utilization: 0.4, resetsAt: w.R7 } });
  w.ar.armIfEnabled(w.SID, w.session, Date.now() + 60000, 'usage limit');
  const did = await w.tickFire();
  ok('REAL gate: the pre-fire pool evaluation re-points the link and the continue is keyed to the member it landed on', did === true && w.linkNow() === w.SPARE && w.ar._fires.get(w.SID).last.key === w.SPARE, JSON.stringify({ link: w.nameOf(w.linkNow()), last: w.ar._fires.get(w.SID).last }));
  ok('…and the card names that member instead of claiming the limit reset (the cause rides the prompt since 2.369.97; no second card)', w.notes.length === 0 && w.fired.length === 1 && w.fired[0].note === '账号池已切换到 B-Stack Max，已自动继续这个任务。', JSON.stringify({ note: w.fired[0] && w.fired[0].note, notes: w.notes }));
}
{
  // NEGATIVE CONTROL for the wording at integration level: nothing moved, the
  // wait simply ended ⇒ the reset wording is still what the user gets.
  const w = mkWorld();
  w.ar.armIfEnabled(w.SID, w.session, Date.now() + 60000, '5h 0% < 10%');
  const did = await w.tickFire();
  ok('CONTROL: an arm that simply came due on a healthy link says the limit reset (and fires onto the same account)', did === true && w.linkNow() === w.LINK && w.notes.length === 0 && w.fired.length === 1 && w.fired[0].note === '用量上限已重置，已自动继续这个任务。', JSON.stringify({ link: w.nameOf(w.linkNow()), note: w.fired[0] && w.fired[0].note, notes: w.notes }));
}

// ── §4h THE EXACT SECOND (lane pool-silent-members R4, inc-mvsjhna7 13:01:00 PT) ──
// A member's 5h window reset at 13:00:00; the fire was armed for reset + 60 s. The gate's switch (a FRACTIONAL clock)
// saw the window landed and moved the conversation onto that member; the money verdict (a FLOORED clock, the opposite
// strict inequality) saw it at 1 % with no future reset, `filter(Boolean)` dropped it, and the fire re-armed for the
// NEXT member's reset 100 minutes later. One clock (the gate's `now`) and one inequality (resetLanded) — the fire
// continues on the member whose window just landed, and the gate probes THAT member (the switch runs first).
{
  const w = mkWorld();
  const realNow = Date.now;
  const RU = Math.floor(realNow() / 1000) + 120;   // the landing member's stated 5h reset, on a fake clock two minutes out
  const T = (RU + 60) * 1000 + 300;                  // the fire: EXACTLY reset + grace, +300 ms (the fraction that split the clocks)
  const far = RU + 100 * 60;                         // every other member: spent until much later
  w.writeCache(w.LINK, { fetchedAt: realNow() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: far }, sevenDay: { utilization: 0.4, resetsAt: w.R7 } });
  w.writeCache(w.FISH, { fetchedAt: realNow() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: far + 600 }, sevenDay: { utilization: 0.4, resetsAt: w.R7 } });
  w.writeCache(w.SPARE, { fetchedAt: realNow() - 60000, source: 'cli-usage', fiveHour: { utilization: 0.99, resetsAt: RU }, sevenDay: { utilization: 0.36, resetsAt: w.R7 } });
  w.ar.armIfEnabled(w.SID, w.session, (RU + 60) * 1000, '5h 1% < 10%');
  const cap = capture();
  Date.now = () => T;
  let did = false;
  try { did = await w.tickFire(); } finally { Date.now = realNow; }
  const lines = cap.done();
  ok('EXACT SECOND: a fire at reset + grace (the fractional clock) CONTINUES on the member whose window just landed', did === true && w.linkNow() === w.SPARE && w.fired.length === 1, JSON.stringify({ did, link: w.nameOf(w.linkNow()), fired: w.fired.length, lines: lines.filter((l) => /re-armed|refused|continued|armed for/.test(l)).slice(-3) }));
  ok('…never a re-arm for the NEXT member\'s reset at the fire (the incident: «re-armed at fire: … via <next member>/5h»)', !lines.some((l) => /re-armed at fire/.test(l)), lines.filter((l) => /re-armed/.test(l)).join(' | '));
}
{
  // B-b4af PLACED: the gate HELD past the old 20 ms (the world's real beforeAutoResumeFire waits for the leg's word). CONTROL —
  // the old shape (tick, 20 ms, read): it reads NO fire while the gate still decides, and its clock is the real one by the time
  // the gate runs (the row's red). THE NEW tickFire waits for the gate's own settle through the same hold: the continue lands on
  // the member whose window just landed. (No ms bound judges either: the hold ends on the leg's word.)
  const plant = (offMs = 300) => {
    const w = mkWorld(), realNow = Date.now, RU = Math.floor(realNow() / 1000) + 120, T = (RU + 60) * 1000 + offMs, far = RU + 100 * 60;
    w.writeCache(w.LINK, { fetchedAt: realNow() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: far }, sevenDay: { utilization: 0.4, resetsAt: w.R7 } });
    w.writeCache(w.FISH, { fetchedAt: realNow() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: far + 600 }, sevenDay: { utilization: 0.4, resetsAt: w.R7 } });
    w.writeCache(w.SPARE, { fetchedAt: realNow() - 60000, source: 'cli-usage', fiveHour: { utilization: 0.99, resetsAt: RU }, sevenDay: { utilization: 0.36, resetsAt: w.R7 } });
    w.ar.armIfEnabled(w.SID, w.session, (RU + 60) * 1000, '5h 1% < 10%');
    let open = null; const held = new Promise((r) => { open = r; }); let entered = 0;
    const real = w.eng.beforeAutoResumeFire;
    w.eng.beforeAutoResumeFire = async (...a) => { entered++; await held; return real.apply(w.eng, a); };
    return { w, realNow, T, open: () => open(), entered: () => entered };
  };
  const P0 = plant(), cap0 = capture();
  Date.now = () => P0.T;
  let oldDid = null, enteredOld = 0;
  try {
    const a = P0.w.ar._armed.get(P0.w.SID); if (a) a.resetsAt = Date.now() - GRACE_MS - 1000;
    const before = P0.w.fired.length; P0.w.ar.tick(Date.now()); await new Promise((r) => setTimeout(r, 20)); oldDid = P0.w.fired.length > before; enteredOld = P0.entered();
  } finally { Date.now = P0.realNow; }
  P0.open();
  for (let k = 0; k < 600 && P0.w.session._arFiring; k++) await new Promise((r) => setTimeout(r, 5));   // (the late gate settles — on the real clock now)
  const lines0 = cap0.done();
  ok('B-b4af CONTROL: with the gate held past its 20 ms, the OLD tick shape reads NO fire (the gate had been entered), and the late gate — judging on the real clock it was handed back — RE-ARMS for the next member: the row\'s red, both halves', oldDid === false && enteredOld >= 1 && P0.w.fired.length === 0 && verdictOf(lines0.some((l) => /re-armed at fire/.test(l))), JSON.stringify({ oldDid, enteredOld, fired: P0.w.fired.length, late: lines0.filter((l) => /re-armed/.test(l)).slice(0, 2) }));
  const P1 = plant(), cap1 = capture();
  Date.now = () => P1.T;
  let did = false;
  // (the hold is released after a STALL PLACED past the old 20 ms window — a placement, never a verdict bound: a tickFire that
  // read at 20 ms would read «no fire» here as the control did; the read's MUST)
  try { const p = P1.w.tickFire(); await new Promise((r) => setTimeout(r, 40)); P1.open(); did = await p; } finally { Date.now = P1.realNow; }
  const lines1 = cap1.done();
  ok('B-b4af: the NEW tickFire waits for the gate\'s own settle through the same hold — the continue lands on the member whose window just landed, no re-arm', did === true && P1.entered() >= 1 && P1.w.linkNow() === P1.w.SPARE && P1.w.fired.length === 1 && !lines1.some((l) => /re-armed at fire/.test(l)), JSON.stringify({ did, entered: P1.entered(), link: P1.w.nameOf(P1.w.linkNow()), fired: P1.w.fired.length }));
  // THE BOUNDARY, ±1 ms (the triage's frozen-clock reproduction): resetLanded floors the clock (r + 60 <= floor(now / 1000)) —
  // a fire 1 ms before reset + grace is not landed (no continue, re-armed), at exactly reset + grace and 1 ms after it continues
  const atOff = async (offMs) => { const P = plant(offMs), cap = capture(); P.open(); Date.now = () => P.T; let d = false; try { d = await P.w.tickFire(); } finally { Date.now = P.realNow; } const ls = cap.done(); return { did: d, link: P.w.nameOf(P.w.linkNow()), spare: P.w.linkNow() === P.w.SPARE, rearmed: ls.some((l) => /re-armed at fire/.test(l)) }; };
  const bm1 = await atOff(-1), b0 = await atOff(0), bp1 = await atOff(1);
  ok('B-b4af BOUNDARY: 1 ms BEFORE reset + grace the window has not landed — no continue, re-armed; at exactly reset + grace and 1 ms after, the continue lands on the member whose window landed', bm1.did === false && gateOf(bm1.rearmed) && b0.did === true && gateOf(b0.spare) && bp1.did === true && verdictOf(bp1.spare), JSON.stringify({ bm1, b0, bp1 }));
}
{
  // THE GATE PROBES THE MEMBER IT IS MOVING TO (R4): the switch runs BEFORE the probe target is read
  const eng = read('src/server/usage-pool-engine.js');
  const body = (() => { const i = eng.indexOf('async function beforeAutoResumeFire(id, session) {'); return i < 0 ? '' : eng.slice(i, eng.indexOf('\n}\n', i)); })();
  const sw = body.indexOf('maybePoolAutoSwitch(session, { now });'), tg = body.indexOf('sessionBillingMember(session, scope).id'), pr = body.indexOf('await preFireProbe(target'), vd = body.indexOf('quotaVerdictFor(scope, { model, session, now: at })'); // (acceptance r3: the ONE shared probe per target)
  // (acceptance r2) …and the probe's fresh reading may re-decide ONCE (forced, at the clock after the probe) before the
  // verdict, which reads that SAME instant (`at` = the switch's `now` when nothing was probed)
  const re = body.indexOf('maybePoolAutoSwitch(session, { now: at, force: true });');
  ok('WIRING: the pre-fire gate switches FIRST, then reads the billing member, probes it, re-decides on the fresh reading when the member cannot serve after all, and judges with ONE clock', sw > 0 && tg > sw && pr > tg && re > pr && vd > re && gateOf(/const now = Date\.now\(\);/.test(body.slice(0, sw))) && verdictOf(/let at = now;/.test(body.slice(pr, re))), JSON.stringify({ sw, tg, pr, re, vd }));
}
// ── §4i THE FRESH READING DECIDES (lane pool-silent-members acceptance r2 — the reviewers' «plausible», reproduced) ──
// The gate's switch moved the conversation onto the member whose 5h had just landed (its CACHE said 100 %); the probe of
// THAT member said spent again (a late reset: «limited, resets in 30 min»); another member was usable. 9d53db09 judged the
// POOL ("another member is usable") and continued into the spent member's link — the wall again. The decision is re-made
// ONCE on the fresh reading: the continue goes to the member that can serve.
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MG = mutantCopies('arl-r2gate', REPO);
  const gateWorld = (engModule = null, { n = 1, probeDelay = 0 } = {}) => {
    const gateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-arloop-gate-'));
    const dataDir = path.join(gateRoot, 'data');
    const am = new AccountManager({ dataDir });
    if (!am.poolSupported()) return null;
    const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r', expiresAt: Date.now() + 36e5, subscriptionType: 'max' } }), { mode: 0o600 });
    const id = {}; for (const n of ['m-link', 'm-fish', 'm-spare', 'm-ok']) { id[n] = am.createSubscription({ name: n }).id; login(id[n]); }
    const P = am.createPool({ name: 'pool' }).id; am.setPoolTarget(P, id['m-link']); am.updatePool(P, { auto: true, hot: true });
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const writeCache = (k, c) => fs.writeFileSync(path.join(cacheDir, k + '.json'), JSON.stringify(c));
    const sessions = new Map(), fired = [], probed = [], firedOn = [];
    const ar = arMod.create({ dataDir, activeSessions: sessions, serverSetting: () => true, log: (...a) => console.log(...a), notify: () => { },
      sendToSession: (sid, s2, text) => { fired.push(text); firedOn.push({ sid, link: am.get(am.poolCurrentFor(P, sid))?.name || '?' }); return true; },
      beforeFire: (sid, s2) => { try { return eng.beforeAutoResumeFire(sid, s2); } catch { return true; } },
      fireIdentity: (sid, s2) => { try { return eng.fireIdentityFor(s2); } catch { return null; } } });
    const eng = (engModule || engMod).create({ app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: gateRoot, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: () => 1, serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => ar,
      // THE PROBE: whatever member it is asked about answers «limited — resets in 30 min» (the late reset)
      getQuotaProbe: () => (target) => { probed.push(am.get(target)?.name || target); if (probeDelay) return new Promise((res) => setTimeout(() => { const ns = Math.floor(Date.now() / 1000); writeCache(target, { fetchedAt: Date.now(), source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: ns + 30 * 60 }, sevenDay: { utilization: 0.36, resetsAt: ns + 3 * 86400 } }); res(true); }, probeDelay)); const ns = Math.floor(Date.now() / 1000); writeCache(target, { fetchedAt: Date.now(), source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: ns + 30 * 60 }, sevenDay: { utilization: 0.36, resetsAt: ns + 3 * 86400 } }); return true; } });
    const SID = 'sess-4i', session = { backend: 'claude', mode: 'chat', host: null, _webuiId: SID, claudeSessionId: 'cid-4i', _accountId: P, _autoResume: true, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'work' };
    sessions.set(SID, session); am.ensureSessionPoolLink(P, SID, id['m-link']);
    const more = []; // (§4j) siblings armed for the same reset — the incident's shape
    for (let i = 1; i < n; i++) { const sid = SID + '-' + i, s2 = { ...session, _webuiId: sid, claudeSessionId: 'cid-4i-' + i }; sessions.set(sid, s2); am.ensureSessionPoolLink(P, sid, id['m-link']); more.push({ sid, s2 }); }
    return { am, ar, eng, P, id, SID, session, more, sessions, writeCache, fired, firedOn, probed, nameOf: (k) => am.get(k)?.name || k, end: () => fs.rmSync(gateRoot, { recursive: true, force: true }) };
  };
  const fire = async (engModule = null, { n = 1, probeDelay = 0, authFailOk = false } = {}) => {
    const w = gateWorld(engModule, { n, probeDelay });
    if (!w) return null;
    const realNow = Date.now, RU = Math.floor(realNow() / 1000) + 120, far = RU + 100 * 60, R7 = Math.floor(realNow() / 1000) + 3 * 86400;
    const c = (u5, r5, u7 = 0.4) => ({ fetchedAt: realNow() - 60000, source: 'cli-usage', fiveHour: { utilization: u5, ...(u5 >= 1 ? { status: 'limited' } : {}), resetsAt: r5 }, sevenDay: { utilization: u7, resetsAt: R7 } });
    w.writeCache(w.id['m-link'], c(1, far)); w.writeCache(w.id['m-fish'], c(1, far + 600));
    w.writeCache(w.id['m-spare'], c(0.99, RU, 0.36));     // its 5h lands at RU: at the fire its cache reads 100 %
    w.writeCache(w.id['m-ok'], c(0.45, far + 1200, 0.5)); // usable, but less room than the landed one
    if (authFailOk) { // (§4j) m-ok was refused by the vendor (403) on ANOTHER conversation a minute ago: the engine's 10-min mark
      const sid = 'sess-4j-other', s2 = { ...w.session, _webuiId: sid, claudeSessionId: 'cid-4j-other', _autoResume: false };
      w.sessions.set(sid, s2); w.am.ensureSessionPoolLink(w.P, sid, w.id['m-ok']);
      const o = console.log, ww = console.warn; console.log = () => { }; console.warn = () => { };
      try { w.eng.notePoolAuthFailure(s2, sid, { status: 403, message: 'API Error: 403 {"type":"error","error":{"type":"permission_error"}}' }); } finally { console.log = o; console.warn = ww; }
    }
    for (const x of [{ sid: w.SID, s2: w.session }, ...w.more]) w.ar.armIfEnabled(x.sid, x.s2, (RU + 60) * 1000, '5h 1% < 10%');
    const T = RU * 1000 + 60300;
    const cap = capture();
    Date.now = () => T;
    let did = false;
    try { for (const x of [w.SID, ...w.more.map((m) => m.sid)]) { const a = w.ar._armed.get(x); if (a) a.resetsAt = T - GRACE_MS - 1000; } const b = w.fired.length; w.ar.tick(T); const ids = [w.SID, ...w.more.map((m) => m.sid)]; for (let k = 0; k < 600 && ids.some((x) => (w.sessions.get(x) || {})._arFiring); k++) await new Promise((r) => setTimeout(r, 5)); did = w.fired.length > b; } finally { Date.now = realNow; }   // (B-b4af: each gate waited for by its own settle, never probeDelay + 300 / 40 ms)
    cap.done();
    const res = { did, link: w.nameOf(w.am.poolCurrentFor(w.P, w.SID)), probed: w.probed.slice(), firedOn: w.firedOn.slice(), lines: cap.lines ? cap.lines.slice() : [] };
    w.end();
    return res;
  };
  const g = await fire();
  if (!g) ok('§4i SKIP — pools unsupported on this platform', true);
  else {
    ok('§4i FRESH READING: the switch lands on m-spare (its window just landed), the probe of m-spare says spent again, m-ok can serve ⇒ the decision is re-made ONCE and the continue goes to m-ok — never into m-spare\'s wall', g.did === true && g.link === 'm-ok' && g.probed.length === 1 && g.probed[0] === 'm-spare', JSON.stringify(g));
    const esrc = read('src/server/usage-pool-engine.js'), cut = '        maybePoolAutoSwitch(session, { now: at, force: true });\n';
    const last = '    const lv = pooled && !v.held ? linkHold(session, scope, model, v, at) : null;\n';
    ok('§4i RED CONTROL: the patches (the re-decision taken out — 9d53db09\'s gate; the fire\'s last check taken out — b552c972\'s) hit', gateOf(esrc.includes(cut)) && verdictOf(esrc.includes(last)));
    if (esrc.includes(cut) && esrc.includes(last)) {
      const r = await fire(MG.load('src/server/usage-pool-engine.js', editAnchor(editAnchor(esrc, cut, '', "src/server/usage-pool-engine.js"), last, '    const lv = null;\n', "src/server/usage-pool-engine.js"), 'no-redecide'));
      ok('§4i RED CONTROL: without the re-decision AND the last check the SAME fire continues into m-spare — the member its own fresh probe just called spent (the wall again)', gateOf(r) && r.did === true && r.link === 'm-spare', JSON.stringify(r));
      // THE FIRE'S LAST CHECK IS THE LINK'S MEMBER (acceptance r3): with the re-decision out, the belt alone still holds it
      const h = await fire(MG.load('src/server/usage-pool-engine.js', editAnchor(esrc, cut, '', "src/server/usage-pool-engine.js"), 'no-redecide-belt'));
      ok('§4i THE LAST CHECK (acceptance r3): with the re-decision taken out, the pool\'s «usable via m-ok» is no licence — the link\'s member m-spare is spent on the same reading ⇒ the continue is HELD and said, never sent into the wall', gateOf(h) && h.did === false && verdictOf(h.lines.some((l) => /continue held at the fire — m-spare, the member its link names, cannot serve/.test(l))), JSON.stringify(h && { did: h.did, link: h.link }));
    }
    // ── §4j ONE PROBE PER TARGET, SHARED; ONE CANDIDATE PREDICATE (acceptance r3, reproduced: repro/accept-r2/
    // skeptic-gate-two-trace.mjs + engine-gate-authfail.mjs). b552c972 stamped the 60 s floor BEFORE its await: a sibling
    // gate for the same target (re-entering through fireNow inside the first gate's own switch) skipped the probe AND the
    // re-decision and continued into m-spare. And the pool's verdict never read the vendor's 10-min refusal mark the switch
    // obeys — «usable via m-ok» while the switch could not move there.
    const two = await fire(null, { n: 2, probeDelay: 150 });
    ok('§4j ONE PROBE, SHARED: two conversations armed for the same reset, the probe of m-spare answering 150 ms later ⇒ ONE probe, and BOTH continue on m-ok (b552c972: one into m-spare)', gateOf(two) && two.probed.length === 1 && two.firedOn.length === 2 && verdictOf(two.firedOn.every((f) => f.link === 'm-ok')), JSON.stringify(two && { probed: two.probed, firedOn: two.firedOn }));
    const share = '  if (p && (p.pending || Date.now() - p.at <= 60e3)) return p.done || Promise.resolve();\n';
    ok('§4j RED CONTROL: the patch (a sibling gate does not await the in-flight probe — b552c972\'s stamp) hits', verdictOf(esrc.includes(share)));
    if (esrc.includes(share)) {
      const r = await fire(MG.load('src/server/usage-pool-engine.js', editAnchor(editAnchor(esrc, share, '  if (p && (p.pending || Date.now() - p.at <= 60e3)) return Promise.resolve();\n', "src/server/usage-pool-engine.js"), last, '    const lv = null;\n', "src/server/usage-pool-engine.js"), 'no-share'), { n: 2, probeDelay: 150 });
      ok('§4j RED CONTROL: a sibling that judges the pre-probe cache continues into m-spare (the wall its fresh probe names)', gateOf(r) && verdictOf(r.firedOn.some((f) => f.link === 'm-spare')), JSON.stringify(r && r.firedOn));
    }
    const af = await fire(null, { authFailOk: true });
    ok('§4j ONE CANDIDATE PREDICATE: m-ok refused by the vendor a minute ago (the switch\'s 10-min exclusion) and every other member spent ⇒ the continue is HELD and said — never «usable via m-ok» into m-spare\'s wall', gateOf(af) && af.did === false && verdictOf(af.lines.some((l) => /continue held at the fire — no member of pool can serve .*m-ok: refused by the vendor \d+ min ago — retried after 10 min/.test(l))), JSON.stringify(af && { did: af.did, link: af.link }));
    const excl = "      if (authOut.has(m.id)) {";
    ok('§4j RED CONTROL: the patch (the verdict without the switch\'s auth exclusion — b552c972) hits', verdictOf(esrc.includes(excl)));
    if (esrc.includes(excl)) {
      const r = await fire(MG.load('src/server/usage-pool-engine.js', editAnchor(editAnchor(esrc, excl, '      if (false) {', "src/server/usage-pool-engine.js"), last, '    const lv = null;\n', "src/server/usage-pool-engine.js"), 'no-authout'), { authFailOk: true });
      ok('§4j RED CONTROL: without it the verdict says «usable via m-ok» and the continue goes into m-spare — CONTINUED INTO THE WALL', gateOf(r) && r.did === true && r.link === 'm-spare', JSON.stringify(r && { did: r.did, link: r.link }));
    }
  }
}
// ── §4f WHAT MAY CLEAR THE BREAKER (round 4, the r3 verifier's finding) ────
// Round 1 cleared the ENTIRE loop-breaker record inside noteRecovered, for
// every caller — and `noteRecovered` is not one signal. Its loudest caller is
// a PASSIVE reading: a `rate_limit_event` with status "allowed", which the CLI
// emits whenever quota info changes (this instance sees it ~20× per
// rejection). That reading says a bucket has room; it says nothing about
// whether this conversation produced a token. Deleting the record on it threw
// away the failed-fire quarantine, the 3-per-hour immediate counter AND both
// once-per-window notice budgets — so in production neither budget the spec
// requires was ever enforced, and the identity that had just rejected our
// continue was immediately fireable again.
// The rule now: only proof of WORK clears the memory of a failed fire. Every
// caller classifies its own evidence (`{worked}`); the disarm is unchanged for
// all of them, because a fire onto a session that no longer waits is the
// wasted billed turn noteRecovered has always existed to prevent.
{
  // (a) THE CLAUDE PRODUCER, through the real engine and a real pool
  const w = mkWorld();
  w.eng.recordRateLimitEvent(w.session, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: w.R5 } });
  w.eng.noteTurnEnd(w.session);
  await new Promise((r) => setTimeout(r, 40));
  await w.tickFire();                                  // the continue goes out onto B-Stack Max
  w.reject({});                                        // …and the CLI answers it with another limit rejection
  await new Promise((r) => setTimeout(r, 40));
  w.ar.fireNow(w.SID, 'pool switched');                // refused (same-identity) — this spends the ONE exhaustion notice
  await new Promise((r) => setTimeout(r, 20));
  const before = JSON.parse(JSON.stringify(w.ar._fires.get(w.SID) || null));
  const notesBefore = w.notes.length;
  ok('setup: a fire was delivered, rejected, and the identity is quarantined with its notice budget spent', !!before && before.fails.length === 1 && before.fails[0].key === w.SPARE && !!before.notices.exhausted && !!before.notified[w.SPARE], JSON.stringify(before));
  ok('…and the session is armed, waiting', w.ar.statusFor(w.SID).armed === true);

  w.passiveReading();                                  // the ~20×-more-common event arrives
  const after = w.ar._fires.get(w.SID) || null;
  ok('a PASSIVE non-rejected reading leaves the breaker record untouched — quarantine, counter and BOTH notice budgets survive it', JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ before, after }));
  ok('…so the next immediate continue onto the identity that rejected us is still refused, by name', w.ar.canFire(w.SID, w.SPARE, 'now', Date.now()).reason === 'same-identity', JSON.stringify(w.ar.canFire(w.SID, w.SPARE, 'now', Date.now())));
  ok('…and it is still on DISK (a reading must not hand a restart a fresh budget either)', verdictOf((() => {
    const raw = JSON.parse(fs.readFileSync(path.join(w.dataDir, 'auto-resume.json'), 'utf8'));
    return !!raw.fires?.[w.SID] && (raw.fires[w.SID].fails || []).some((f) => f.key === w.SPARE);
  })()), fs.readFileSync(path.join(w.dataDir, 'auto-resume.json'), 'utf8').slice(0, 400));
  // 2026-09-08: the DISARM on this reading is GONE, and that is the fix, not a
  // regression. The session is walled on 5h; this reading is about 7d at 50 %
  // and says NOTHING about the wall — dropping the wait on it silently broke a
  // promise the user switched on. (For claude it was merely useless: readings
  // only arrive while a turn is running, and that turn's own `result` disarms
  // through 'turn completed normally'. For codex the app-server pushes them to
  // an IDLE thread, which is exactly how the 32 h stall's conversation lost its
  // wait.) The reading is now JUDGED instead: wrong bucket ⇒ nothing changes.
  ok('…while the promise SURVIVES a reading that cannot judge the wall (5h wall, 7d reading — the silent-disarm class)', w.ar.statusFor(w.SID).armed === true, JSON.stringify(w.ar.statusFor(w.SID)));
  ok('…and the arm records WHICH wall it is waiting on, so the edge can tell', w.ar.statusFor(w.SID).bucket === 'fiveHour');
  ok('…and no continue was spent on it (the edge refused; the breaker never had to)', w.fired.length === 1, 'fired=' + w.fired.length);
  ok('…and the reading said nothing in the conversation', w.notes.length === notesBefore, JSON.stringify(w.notes.slice(notesBefore)));

  // RESTART, state 1: the quarantine is still refused by a fresh module
  {
    const sessions2 = new Map(); const sent2 = [];
    const ar2 = create({
      dataDir: w.dataDir, activeSessions: sessions2, serverSetting: () => true, log: () => { },
      sendToSession: (id, s2, t) => { sent2.push(t); return true; }, fireIdentity: () => ({ key: w.SPARE, name: 'B-Stack Max' }),
    });
    const s2 = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
    sessions2.set(w.SID, s2);
    ar2.armIfEnabled(w.SID, s2, Date.now() + 60000, 'usage limit');
    ok('RESTART after a passive reading: a fresh module still refuses that identity', ar2.fireNow(w.SID, 'pool switched') === false && sent2.length === 0);
  }

  // POSITIVE CONTROL: work clears it — the completed turn, through the engine
  w.eng.noteTurnEnd(w.session);                        // no wall signals on this turn ⇒ 'turn completed normally'
  ok('POSITIVE CONTROL: a turn that completed normally DOES clear the whole memory', !w.ar._fires.has(w.SID) && w.ar.recentFireFailures(w.SID).length === 0);
  // RESTART, state 2: …and the cleared record does not come back from disk
  {
    const sessions3 = new Map(); const sent3 = [];
    const ar3 = create({
      dataDir: w.dataDir, activeSessions: sessions3, serverSetting: () => true, log: () => { },
      sendToSession: (id, s3, t) => { sent3.push(t); return true; }, fireIdentity: () => ({ key: w.SPARE, name: 'B-Stack Max' }),
    });
    const s3 = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
    sessions3.set(w.SID, s3);
    ar3.armIfEnabled(w.SID, s3, Date.now() + 60000, 'usage limit');
    ok('RESTART after the work: the fresh module has no quarantine to reload and the continue goes through', ar3.fireNow(w.SID, 'pool switched') === true && sent3.length === 1);
  }
}
{
  // (b) THE OTHER human-scale proof of work: the user typed. (ws-handler's own
  // call, replayed verbatim — §5 pins that the call site looks like this.)
  const w = mkWorld();
  w.ar.armIfEnabled(w.SID, w.session, Date.now() + 60000, 'usage limit');
  w.ar.fireNow(w.SID, 'pool switched');
  await new Promise((r) => setTimeout(r, 30));
  w.ar.noteFireOutcome(w.SID, false, 'limit rejection');
  ok('setup: a failed fire is remembered', w.ar.recentFireFailures(w.SID).length === 1);
  w.ar.noteRecovered(w.SID, 'user sent a prompt');
  ok("POSITIVE CONTROL: the user's own prompt clears it (a human at the keyboard is who the budget was protecting)", !w.ar._fires.has(w.SID));
}
{
  // (c) THE CODEX TWIN PRODUCER — same defect, same shape, the other harness
  const w = mkWorld();
  const SID2 = w.SID + '-cx';
  const cx = { backend: 'codex', mode: 'chat', host: null, _webuiId: SID2, _accountId: w.P, _autoResume: true, pty: { write() { } }, name: 'cx' };
  w.sessions.set(SID2, cx);
  w.ar.armIfEnabled(SID2, cx, Date.now() + 60000, 'usage limit');
  w.ar.fireNow(SID2, 'pool switched');
  await new Promise((r) => setTimeout(r, 30));
  w.ar.noteFireOutcome(SID2, false, 'limit rejection');
  const beforeCx = JSON.parse(JSON.stringify(w.ar._fires.get(SID2) || null));
  ok('setup (codex): the failed fire is remembered', !!beforeCx && beforeCx.fails.length === 1 && beforeCx.n === 1);
  w.codexReading(cx);                                  // rate_limits_updated, nothing exhausted
  ok('a fresh NON-LIMITED codex reading leaves the breaker record untouched too (the twin producer, not just the claude one)', JSON.stringify(w.ar._fires.get(SID2) || null) === JSON.stringify(beforeCx), JSON.stringify({ beforeCx, after: w.ar._fires.get(SID2) }));
  ok('…and it disarmed the wait exactly as before', w.ar.statusFor(SID2).armed === false);
  w.eng.recordCodexQuotaSignal(cx, { type: 'reset_credit_result', outcome: 'reset' });
  ok('a consumed codex RESET CREDIT is the same class: the limit moved, this conversation still produced nothing, so the quarantine stands (it self-expires in 10min, the same floor the credit itself paces on)', JSON.stringify(w.ar._fires.get(SID2) || null) === JSON.stringify(beforeCx), JSON.stringify(w.ar._fires.get(SID2)));
}
{
  // (d) THE LOOP RE-OPENS WITH THE FLAG IGNORED — the matrix control, driven
  // through the REAL producers. This is §1(c)'s world (attribution defect
  // still present, so the breaker is the only protection) with one addition:
  // a passive reading between every cycle, exactly as production sees them.
  async function driveWithReadings(w, cycles = 25) {
    w.reject({ oldAttribution: true });                 // the user's own prompt hit the wall
    let rounds = 0;
    for (let i = 0; i < cycles; i++) {
      const did = await w.tickFire();
      if (!did) break;
      rounds++;
      w.passiveReading();                              // a fresh non-rejected reading lands…
      w.reject({ oldAttribution: true });              // …and the CLI answers the continue with another rejection
    }
    return rounds;
  }
  const bad = mkWorld({ ignoreWorkedFlag: true });
  const nBad = await driveWithReadings(bad);
  ok('NEGATIVE CONTROL: with the classification dropped (the round-3 call), one reading per cycle wipes the breaker and the session re-fires without bound (≥10 billed continues)', nBad >= 10, 'fires=' + nBad);
  ok('…and the record is simply gone every time — nothing is left to refuse with', !bad.ar._fires.has(bad.SID) || (bad.ar._fires.get(bad.SID).fails || []).length === 0, JSON.stringify(bad.ar._fires.get(bad.SID)));
  const good = mkWorld();
  const nGood = await driveWithReadings(good);
  ok(`SHIPPED: the same world, the same readings, the classification honoured — at most ${FIRE_MAX_IMMEDIATE} continues and then the quarantine holds`, nGood >= 1 && nGood <= FIRE_MAX_IMMEDIATE, 'fires=' + nGood);
  ok('…because the identity that rejected our continue is still quarantined after every reading', good.ar.recentFireFailures(good.SID).length >= 1, JSON.stringify(good.ar.recentFireFailures(good.SID)));
}
{
  // (e) MUTATION CONTROL on the guard itself: the same module with `if (worked)`
  // removed must fail the leg above (a guard nobody can delete and turn red is
  // not a guard — the B-3185 rule).
  const src = read('src/server/auto-resume.js');
  // …and the copy runs from a tmpdir, so its RELATIVE requires (the PURE
  // fresh-window rule, the harness registry the resume verb comes from) are
  // re-pointed at the real files. The MUTATION is still exactly one line — the
  // control differs from the shipped module in the named dimension and in
  // nothing else, which is the whole point of a negative control.
  const mutated = editAnchor(src, 'if (worked) noteFireOutcome(id, true, why);', 'noteFireOutcome(id, true, why);', "src/server/auto-resume.js")
    .replace(/require\('\.\.\//g, `require('${path.join(REPO, 'src')}/`)
    .replace(/require\('\.\//g, `require('${path.join(REPO, 'src/server')}/`);   // same-folder requires too (B-9a2e's lazy ./sent-record.js on the deliver road): the copy differs in the one named line ONLY
  ok('MUTATION CONTROL: the guard is one identifiable line', mutated !== src && !/require\('\.\.?\//.test(mutated));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-armut-')); cleanup.push(dir);
  const modPath = path.join(dir, 'auto-resume-mutated.cjs');
  fs.writeFileSync(modPath, mutated);
  const mut = require(modPath);
  const run = (mod) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-armut-run-')); cleanup.push(d);
    const sessions = new Map(); const sent = [];
    const ar = mod.create({
      dataDir: d, activeSessions: sessions, serverSetting: () => true, log: () => { },
      sendToSession: (id, s, t) => { sent.push(t); return true; }, fireIdentity: () => ({ key: 'sub-a', name: 'Account A' }),
    });
    const s = { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, _autoResume: true };
    sessions.set('s1', s);
    ar.armIfEnabled('s1', s, Date.now() + 60000, 'usage limit');
    ar.fireNow('s1', 'pool switched');
    ar.noteFireOutcome('s1', false, 'limit rejection');
    ar.noteRecovered('s1', 'fresh non-rejected reading', { worked: false });
    return { kept: ar._fires.has('s1'), quarantined: ar.recentFireFailures('s1') };
  };
  const shipped = run(arMod), broken = run(mut);
  ok('…and with it removed a worked:false call wipes the record again (the pre-fix behaviour, reproduced from the product source)', broken.kept === false && broken.quarantined.length === 0, JSON.stringify(broken));
  ok('…while the shipped module keeps it (same call, same inputs)', shipped.kept === true && shipped.quarantined.length === 1, JSON.stringify(shipped));
}

// ── §4g THE NEW FIRE PATH, DRIVEN HERE (2026-09-08 r2) ─────────────────────
// The fresh-window edge is a SECOND producer of billed continues, and this is
// the suite that owns the billed rate. Round 1 shipped it with only source
// greps here (§5's three mentions), so nothing in either tier ever drove it:
// its own suite counted the WALL VERDICT (true whether or not a turn was
// spent), and a sustained loop went green — 3 continues per rolling hour, for
// the life of a watch that can stand for days.
// Driven through the REAL producer (`recordRateLimitEvent`, the record this
// instance sees ~20× per rejection), the REAL engine's shared reading edge and
// the REAL pool, with the scripted CLI answering every continue with another
// rejection. The measure is the only thing that costs money: `w.fired.length`.
{
  /** N passive readings that say the ARMED bucket is open, with the CLI
   *  rejecting whatever they buy. Returns the billed continues.
   *  THE CLOCK IS OURS between readings, and it has to be: the breaker's own
   *  backoff (0 / 60 s / 5 min) and its 10-min same-identity quarantine are
   *  wall-clock rules, so 40 readings inside one real second are bounded by
   *  the BACKOFF whatever the edge does — the control would read 1 against 1
   *  and prove nothing. Advancing 11 min after each rejection clears both and
   *  leaves the HOURLY CAP as the breaker's last word, which is exactly the
   *  measurement: with the edge un-guarded the readings keep buying turns up
   *  to that cap, with the guard they buy ONE. The jump stays inside the hour
   *  (3 fires = 33 min) so the fixture's own resets (R5 = +2 h) never pass. */
  async function driveFreshWindow(w, readings = 40) {
    const realNow = Date.now;
    let skew = 0;
    Date.now = () => realNow() + skew;
    try {
      w.reject();                                      // the user's own turn hit the 5h wall ⇒ armed on it
      for (let i = 0; i < readings; i++) {
        const before = w.fired.length;
        w.eng.recordRateLimitEvent(w.session, {        // …and the window reads OPEN on that very bucket
          type: 'rate_limit_event',
          rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.1, resetsAt: w.R5 },
        });
        await new Promise((r) => setTimeout(r, 5));    // the pre-fire gate is async
        if (w.fired.length > before) {
          w.reject();                                  // the CLI answers the continue with another rejection
          skew += 11 * 60e3;                           // …and time passes (see above)
        }
      }
      return w.fired.length;
    } finally { Date.now = realNow; }
  }
  const good = mkWorld();
  const nGood = await driveFreshWindow(good);
  ok('THE FRESH-WINDOW EDGE IS BOUNDED WHERE IT IS WIRED: 40 real readings that all say the armed window is open buy at most one continue per wall, not one per reading',
    nGood <= FIRE_MAX_IMMEDIATE, 'billed continues=' + nGood);
  ok('…and the wait is still standing afterwards (bounding the spend must not silently drop the promise)',
    good.ar.statusFor(good.SID).armed === true || verdictOf(good.ar._fires.has(good.SID)), JSON.stringify(good.ar.statusFor(good.SID)));
  // NEGATIVE CONTROL: the same world, the same 40 readings, against a copy of
  // the product module with ONLY the edge's single-shot guard removed — round
  // 1's code, reproduced from source, in the wiring it actually ships in.
  const src = read('src/server/auto-resume.js');
  const NEEDLE = "    if (r0 && r0.edgeSpent && r0.edgeSpent === wall) return { ...v, open: false, why: 'already-refuted', wallOpen: true, fired: false };";
  const rewired = src.replace(/require\('\.\.\//g, `require('${path.join(REPO, 'src')}/`);
  const mutated = editAnchor(rewired, NEEDLE, '    // PRE-FIX: no single-shot guard', "src/server/auto-resume.js");
  // THE SETUP ASSERT MUST SEE THE GUARD REPLACEMENT ITSELF. `mutated !== src`
  // was satisfied by the require-rewrite alone, so when this needle drifted
  // (r3 renamed `wallKeyOf(a)` to the hoisted `wall`) the "control" silently
  // became a copy of the SHIPPED module and only the outcome assert noticed —
  // an unpatched control is not a control, and its own setup line must say so.
  ok('control setup: the guard is one identifiable block and the copy resolves its own requires',
    mutated !== rewired && !/require\('\.\.\//.test(mutated) && !mutated.includes(NEEDLE));
  const mdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-aredge-')); cleanup.push(mdir);
  const mpath = path.join(mdir, 'auto-resume-preedge.cjs');
  fs.writeFileSync(mpath, mutated);
  const preMod = require(mpath);
  const bad = mkWorld({ arModule: preMod });
  const nBad = await driveFreshWindow(bad);
  ok('NEGATIVE CONTROL (round 1): without it the same readings keep buying turns until the hourly cap, and the cap is the ONLY thing left — every hour, for the life of the wait',
    nBad > nGood && nBad >= FIRE_MAX_IMMEDIATE, JSON.stringify({ preFix: nBad, shipped: nGood }));
}

// (§5 THE WIRING PINS — MOVED to the fast scripts/test-auto-resume-loop-pins.mjs — lane text-legs, B-94d3: a leg that reads only source text runs in every lane's gate)
{
  // §5's FUNCTIONAL checks stay here (they call the live instances — never a source grep)
  ok('the engine INSTANCE exports the new seams (functional call check, never a source grep — the 2.369.4 lesson)', gateOf(['fireIdentityFor', 'sessionBillingMember', 'readingSlotFor', 'wallKeyFor', 'sessionWalledMembers'].every((k) => typeof probe.eng[k] === 'function')) && typeof probe.eng.sessionReadingMember === 'undefined' && typeof probe.eng.corroborateReading === 'undefined'); // corroborateReading retired 2026-09-30 (the OTel org is a label)
  // ── round 2 ──
  ok('the auto-resume INSTANCE exports the breaker seams', verdictOf(['noteFireOutcome', 'recentFireFailures', 'canFire', 'noteNoPoolTarget'].every((k) => typeof probe.ar[k] === 'function')));
  ok('the module exports the two PURE notice rules (functional check)', typeof arMod.refusalNoticeFor === 'function' && typeof arMod.continueNoticeFor === 'function' && arMod.NO_TARGET_FRESH_MS > 0);
}

// ── §6 THE FROZEN JOURNAL'S SHAPE (2/s arm→switch→fire→reject) ─────────────
{
  // Replay the incident's cadence: a rejection every ~500ms for 2 minutes of
  // simulated time. The pre-fix code produced 240 continues here; the shipped
  // code must produce a handful and then stop talking.
  const w = mkWorld(); const cap = capture();
  let fires = 0;
  w.reject({});
  for (let i = 0; i < 240; i++) {
    if (await w.tickFire()) { fires++; w.reject({}); }
    else w.reject({});
  }
  const lines = cap.done();
  const continues = lines.filter((l) => /continued (immediately|automatically)/.test(l)).length;
  ok('journal replay (240 rejections at the incident\'s cadence): a handful of continues, not one per cycle', fires <= FIRE_MAX_IMMEDIATE + 1 && continues <= FIRE_MAX_IMMEDIATE + 1, JSON.stringify({ fires, continues }));
  ok('…and at most one in-chat card per distinct target, versus ~150 in the incident', w.notes.length <= 3, JSON.stringify(w.notes));
  ok('…while the journal still SAYS why it is waiting (silence is the other failure mode; with both fixes on there is nothing left to refuse, so the demotion + the arm ARE the explanation)', gateOf(lines.some((l) => /\[wall\] demoted \S+ 5h until \S+ \(1 walls \/ credential slot\)/.test(l))) && verdictOf(lines.some((l) => /armed for .*(5h|blocked|<)/.test(l))), lines.slice(-4).join(' | '));
  ok('…every account in the pool ends up honestly marked, none left reading "healthy" while rejecting', verdictOf([w.LINK, w.SPARE].every((id) => { const c = w.readCache(id); return c && (c.fiveHour.utilization === 1 || c.source === 'wall'); })) || w.eng.sessionWalledMembers(w.SID).size >= 1, JSON.stringify({ link: w.readCache(w.LINK), spare: w.readCache(w.SPARE) }));
}

// ── §B-73fe THE ARM NAMES ITS TARGET (owner 2026-09-17 "明明当前hit limit的账号7am就会reset 5h，但你却提示12pm") ──
// 02:30:43 PDT: the link (userP) hit its 5h (resets 7am) while its Fable
// sat at 98 % (2 % left < the 5 % floor, resets 9/20); every other member's
// Fable was spent and Member L's week rolled first (12pm). The wait is the MIN
// over members of the MAX over each member's dead resets — 12pm — which is
// right, and the card said only "已安排在 12pm 重置后自动继续". Now the arm
// carries its CAUSE and the card says whose reset it waits for and why the
// rejector's own earlier reset is not it. Fish Max plays Member L's part here.
{
  const cap = capture();
  const w = mkWorld({ healthy: false });
  const RL = Math.floor(Date.now() / 1000) + 9 * 3600;             // the soonest member's Fable week
  w.writeCache(w.LINK, { fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 1, status: 'limited', resetsAt: w.R5 }, sevenDay: { utilization: 0.5, resetsAt: w.R7 }, scopedWeekly: [{ name: 'Fable', utilization: 0.98, resetsAt: w.R7 }] });
  w.writeCache(w.FISH, { fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 0.05, resetsAt: w.R5 }, sevenDay: { utilization: 0.51, resetsAt: RL }, scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: RL }] });
  w.writeCache(w.SPARE, { fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: w.R5 }, sevenDay: { utilization: 0.5, resetsAt: w.R7 + 86400 }, scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: w.R7 + 86400 }] });
  w.reject({});
  await new Promise((r) => setTimeout(r, 40));
  const lines = cap.done();
  const st = w.ar.statusFor(w.SID);
  const L = (s) => new Date(s * 1000).toLocaleString();
  ok('B-73fe: the arm waits for the SOONEST member (Fish Max\'s Fable week) plus the one-minute landing grace (2026-09-18), not the rejector\'s own 5h — the wait itself was right', st.armed === true && st.resetsAt === (RL + 60) * 1000, JSON.stringify(st));
  ok('…and the arm CARRIES its cause: soonest = Fish Max / Fable @ RL, the same instant as the arm', !!(st.cause && st.cause.scope === 'pool' && st.cause.soonest && st.cause.soonest.id === w.FISH && st.cause.soonest.bucket && st.cause.soonest.bucket.label === 'Fable' && st.cause.soonest.bucket.resetsAt === st.resetsAt - 60 * 1000), JSON.stringify(st.cause)); // the cause names the STATED instant; the arm fires a minute after it
  const rj = st.cause && st.cause.rejector;
  ok('…rejector = userP with its OWN wall (5h @ R5, from the demotion) and the floor bucket that keeps it dead past it (Fable 2 % < 5 % @ R7)', !!(rj && rj.id === w.LINK && rj.ownWall && rj.ownWall.label === '5h' && rj.ownWall.resetsAt === w.R5 * 1000 && rj.floor && rj.floor.length === 1 && rj.floor[0].label === 'Fable' && rj.floor[0].remaining === 2 && rj.floor[0].line === 5 && rj.floor[0].resetsAt === w.R7 * 1000), JSON.stringify(rj));
  const text = arMod.armNoticeFor(st.reason, st.resetsAt, Date.now(), st.cause);
  ok('…the card names both: the rejector\'s own reset AND why it is not the target, then the member whose reset it waits for', text === `userP 的 5h 将在 ${L(w.R5)} 重置，但它的 Fable 仅剩 2%（低于 5% 门槛，视为用尽，${L(w.R7)} 重置）。最早可用的成员是 Fish Max（Fable ${L(RL)} 重置），已安排在重置约 1 分钟后自动继续；任一成员提前可用会立即继续（状态栏可取消）。`, text);
  ok('…the journal line says via whom', verdictOf(lines.some((l) => /armed for .* via Fish Max\/Fable\)/.test(l))), lines.filter((l) => /armed for/.test(l)).join(' | '));
  ok('…NEGATIVE CONTROL: a cause-less arm keeps the old sentence byte for byte', arMod.armNoticeFor('5h 0% < 10%', st.resetsAt, Date.now()) === `用量已达上限。已安排在 ${new Date(st.resetsAt).toLocaleString()} 重置后自动继续（状态栏可取消）。`);
  ok('…rejector === soonest reads as one member\'s own reset (no "but" clause, no second member)', verdictOf(/^Fish Max 的 Fable 将在 .+ 重置，重置约 1 分钟后自动继续这个任务（状态栏可取消）。$/.test(arMod.armNoticeFor('x', RL * 1000, Date.now(), { ...st.cause, rejector: { id: w.FISH, name: 'Fish Max', ownWall: { label: 'Fable', resetsAt: RL * 1000 }, floor: [] } }))));
  ok('…an unpooled (single-account) wall names its bucket and keeps the reset sentence', arMod.armNoticeFor('5h 0% < 10%', st.resetsAt, Date.now(), w.eng.armCauseFor({ usable: false, until: { label: '5h', resetsAt: RL } }, null, null, 0)) === `用量已达上限（5h）。已安排在 ${new Date(RL * 1000).toLocaleString()} 重置约 1 分钟后自动继续（状态栏可取消）。`); // the STATED instant (the cause's until), the arm itself is a minute later
  ok('…armCauseFor is null for a usable verdict and for a blocked pool verdict with no soonest (the arm then inherits or stays cause-less)', w.eng.armCauseFor({ usable: true }, null, null, 0) === null && w.eng.armCauseFor({ usable: false, soonest: null, rejector: null }, null, null, 0) === null);
  ok('…the chip payload carries the same structure (statusFor().cause === the arm\'s cause)', JSON.stringify(w.ar.statusFor(w.SID).cause) === JSON.stringify(st.cause));
}

// ── §7 THE OWNER'S 全B (2026-09-28): A REMOVED MEMBER WITH NOBODY TO TAKE OVER — STOP AND WAIT ──
// The owner, on "a member taken out of the pool while no other member can take its conversations": NOT kept
// running on it. The conversation finishes its current turn (never cut), is parked off the removed member (on the
// listed member usable soonest — the removed member serves nothing after that turn) and waits at a WALL: auto-
// resume's own arm, with the removal as its cause. A member becoming usable delivers the ONE continue (the wake →
// the pool pass → fireNow, through the pre-fire gate and the breaker) — never two. Real engine, real auto-resume.
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M7 = mutantCopies('arl-hold', REPO);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cacheOf = (u5, r5, u7, r7) => ({ fetchedAt: Date.now(), source: 'cli-usage', fiveHour: { utilization: u5, resetsAt: r5 }, sevenDay: { utilization: u7, resetsAt: r7 } });
  const setup = (engModule = null) => {
    const w = mkWorld({ engModule });
    // every OTHER member is spent: Fish Max already limited (R5); B-Stack Max's 5h resets in 10 min (it parks there)
    w.writeCache(w.SPARE, cacheOf(0.99, Math.floor(Date.now() / 1000) + 600, 0.35, w.R7));
    w.session._isStreaming = true; w.session._turnState = 'running'; // mid-turn when the owner takes its member out
    const cap = capture();
    w.am.updatePool(w.P, { members: [w.FISH, w.SPARE] }, { chooseMember: (from) => w.eng.decideDefaultTarget(w.P, from) || w.eng.fallbackDefaultTarget(w.P, from) });
    w.ev = w.eng.memberRemoved(w.P, [w.LINK]);
    w.lines1 = cap.done();
    return w;
  };
  const stop = (w) => { w.session._isStreaming = false; w.session._turnState = 'idle'; const cap = capture(); w.eng.noteTurnEnd(w.session); w.eng.noteTurnStopped(w.session); return cap.done(); };
  const w = setup();
  ok('§7 全B: taken out MID-TURN with nobody to take over ⇒ never cut — the link still names the removed member until its turn ends, nothing armed yet', w.linkNow() === w.LINK && !w.ar._armed.get(w.SID) && w.ev.held.length === 1 && w.ev.held[0].deferred === true, JSON.stringify({ on: w.nameOf(w.linkNow()), ev: w.ev.held }));
  stop(w);
  const a = w.ar._armed.get(w.SID);
  ok('§7 全B: at its stop it is PARKED off the removed member (on the member usable soonest, B-Stack Max) — the removed member serves nothing after that turn', w.linkNow() === w.SPARE, w.nameOf(w.linkNow()));
  ok('§7 全B: …ARMED with the removal as its cause — the turn it let finish did not disarm it (the result boundary\'s "turn completed normally")', !!a && !a.fired && !!a.cause && a.cause.kind === 'removed-member' && a.cause.member.id === w.LINK, JSON.stringify(a));
  ok('§7 全B: …the hold itself fires nothing (fired 0)', w.fired.length === 0);
  const card = a ? arMod.armNoticeFor(a.reason, a.resetsAt, Date.now(), a.cause) : '';
  ok('§7 全B: the card names the removal and the member it waits on — never "usage limit"', gateOf(/userP 已被移出账号池/.test(card)) && gateOf(/B-Stack Max/.test(card)) && !/用量已达上限/.test(card), card);
  ok('§7 全B: …the conversation is told it stopped and continues by itself', verdictOf(w.notices.some((t) => /userP was removed from the pool and no other member can take over — conversation "work" stopped after its turn and continues automatically when a member can serve it\.$/.test(t))), JSON.stringify(w.notices));
  // the member wake: Fish Max is usable again ⇒ the conversation moves onto it and gets ONE continue
  w.writeCache(w.FISH, cacheOf(0.1, w.R5, 0.3, w.R7));
  const capW = capture(); w.eng.onMemberReadingFresh(w.FISH, 'test'); await sleep(80); const lw = capW.done();
  ok('§7 全B: a member becomes usable ⇒ the conversation moves onto it and gets ONE continue', w.linkNow() === w.FISH && w.fired.length === 1, JSON.stringify({ on: w.nameOf(w.linkNow()), fired: w.fired.length, lines: lw.slice(-5) }));
  w.eng._memberWakeAt.clear();
  w.writeCache(w.SPARE, cacheOf(0.1, w.R5, 0.3, w.R7));
  w.eng.onMemberReadingFresh(w.SPARE, 'test 2'); w.eng.onMemberReadingFresh(w.FISH, 'test 3'); await sleep(80);
  ok('§7 全B: …further wakes never deliver a second continue (fired stays 1)', w.fired.length === 1, String(w.fired.length));
  // an IDLE conversation on the removed member: parked at once, NOT armed (nothing was running — nothing to continue)
  const wi = mkWorld();
  wi.writeCache(wi.SPARE, cacheOf(0.99, Math.floor(Date.now() / 1000) + 600, 0.35, wi.R7));
  const capI = capture(); wi.am.updatePool(wi.P, { members: [wi.FISH, wi.SPARE] }); wi.eng.memberRemoved(wi.P, [wi.LINK]); capI.done();
  ok('§7 全B: an IDLE conversation is parked off the removed member at once and NOT armed (its next message meets the wall like any quota wall)', wi.linkNow() === wi.SPARE && !wi.ar._armed.get(wi.SID) && wi.fired.length === 0, JSON.stringify({ on: wi.nameOf(wi.linkNow()), armed: !!wi.ar._armed.get(wi.SID) }));
  // WHO CAN UN-ARM IT: the disarm seams (noteRecovered / setEnabled) are called only by the engine, the human ws
  // toggle and the ONE typing sender — whose HTTP door (the For-you reply) refuses an agent token before it sends
  // (§7's census of the disarm seams' callers and the typing sender's agent refusal: MOVED to the fast scripts/test-auto-resume-loop-pins.mjs — lane text-legs, B-94d3: a leg that reads only source text runs in every lane's gate)
  // CONTROL: the engine without the hold (the r1 behaviour — "keeps serving") — the conversation stays on the removed member
  const esrc = read('src/server/usage-pool-engine.js');
  const h1 = "        if (ds && ds.reason === 'removed-hold') { holdRemoved(poolId, sid, s2, curFor, ds, now); continue; }\n";
  const h2 = "if (d && d.reason === 'removed-hold') { const h = holdRemoved(poolId, sid, s, on, d, now); if (h.held || h.deferred) out.held.push({ sid, on, to: h.to, deferred: h.deferred }); else out.stayed.push({ sid, on }); continue; } // 全B: stop and wait (a mid-turn one at its stop)";
  ok('§7 CONTROL: the patch (the hold removed from the pass and from memberRemoved) hits', esrc.split(h1).length === 2 && esrc.split(h2).length === 2);
  const wc = setup(M7.load('src/server/usage-pool-engine.js', editAnchor(editAnchor(esrc, h1, '', "src/server/usage-pool-engine.js"), h2, '', "src/server/usage-pool-engine.js"), 'nohold'));
  stop(wc);
  ok('§7 CONTROL: without it the conversation KEEPS BILLING the removed member after its turn, and nothing is armed', wc.linkNow() === wc.LINK && !wc.ar._armed.get(wc.SID), JSON.stringify({ on: wc.nameOf(wc.linkNow()) }));
  // CONTROL 2: auto-resume without the hold's exception — the result boundary's "turn completed normally" (a CLI that
  // announces no turn state stops right there) disarms the hold it just made
  const asrc = read('src/server/auto-resume.js');
  const x1 = "    if (a.cause && a.cause.kind === 'removed-member' && why === 'turn completed normally') return;\n";
  ok('§7 CONTROL 2: the patch (auto-resume without the hold\'s exception) hits', asrc.split(x1).length === 2);
  const arNo = M7.load('src/server/auto-resume.js', editAnchor(asrc, x1, '', "src/server/auto-resume.js"), 'noexception');
  const wx = mkWorld({ arModule: arNo });
  wx.writeCache(wx.SPARE, cacheOf(0.99, Math.floor(Date.now() / 1000) + 600, 0.35, wx.R7));
  wx.session._isStreaming = true; wx.session._turnState = 'running'; wx.session._turnStateSeen = false;
  { const c = capture(); wx.am.updatePool(wx.P, { members: [wx.FISH, wx.SPARE] }); wx.eng.memberRemoved(wx.P, [wx.LINK]); c.done(); }
  { wx.session._isStreaming = false; wx.session._turnState = undefined; const c = capture(); wx.eng.noteTurnEnd(wx.session); c.done(); } // the result boundary IS the stop
  ok('§7 CONTROL 2: …then a CLI without turn state loses the hold at its result boundary (parked, but nothing armed)', wx.linkNow() === wx.SPARE && !wx.ar._armed.get(wx.SID), JSON.stringify({ on: wx.nameOf(wx.linkNow()), armed: !!wx.ar._armed.get(wx.SID) }));
  const wy = setup(); wy.session._turnState = undefined;
  { wy.session._isStreaming = false; const c = capture(); wy.eng.noteTurnEnd(wy.session); c.done(); }
  ok('§7 全B: …with the exception the same CLI keeps it (armed at the result boundary)', wy.linkNow() === wy.SPARE && !!wy.ar._armed.get(wy.SID), JSON.stringify({ on: wy.nameOf(wy.linkNow()), armed: !!wy.ar._armed.get(wy.SID) }));
}

// ── §8 THE BULK RESUME (lane auto-resume-bulk, .349 — a fleet power user's dozens of wall-stopped sessions) ─────────
// «恢复所有因用量/过载停止的会话»: ONE owner press, N billed continues. Driven through the REAL module and the REAL
// spend guard (scratch ledger) over stub channels: ONE authorization names the whole batch at the press and each continue is
// asked again on its own before its deliver (the U2 cure's law 1), the continues go out PACED
// and earliest-stop-first through the harness's verb, a wall that has not reset is SKIPPED and said, the pre-fire gate
// decides each one at its moment. THE OWNER'S RULING 2026-11-18 (B): the press is the person's own act — ATTENDED: no
// hold, no stamp, the account's room untouched. A batch no door pressed is the gated twin: a refusal resumes NONE
// (all-or-nothing, the boundary exact), every hold settles.
{
  console.log('\n§8 the bulk resume: N continues under ONE spend authorization, paced, walls skipped, a refusal resumes none');
  const SG = require(path.join(REPO, 'src/server/spend-guard.js'));
  const PRESS = require(path.join(REPO, 'src/write-origin.js')).pressOf({ headers: { 'sec-fetch-site': 'same-origin' } });   // a door's press (the person's own act)
  const { CONTINUE_PROMPT_OVERLOAD } = arMod;
  const NOW0 = Date.now(), H = 3600e3;
  const PACE = 40;
  let world = 0;
  const mkWorld = ({ cap = 30, sessions, authorize = null, mod = arMod, sendOk = () => true } = {}) => {
    const dir = path.join(scratch('arl-bulk'), String(++world));
    fs.mkdirSync(dir, { recursive: true });
    const settings = { 'spend.unattendedPerIdentityHour': cap };
    const guard = SG.create({ dataDir: dir, serverSetting: (k) => settings[k], identityOf: (s) => (s && s._slot ? { key: s._slot, name: s._slot } : null), log: () => { } });
    const active = new Map(Object.entries(sessions));
    const sent = [], cleared = [];
    let batchCalls = 0, batchItems = 0, listChanges = 0;
    const calls = [];   // EVERY ask of the authorizer: which items, how many, for which reason (the press's, then each continue's own)
    const ar = mod.create({
      dataDir: dir, activeSessions: active, serverSetting: () => undefined, log: () => { },
      resumeVerb: () => ({ form: 'message', deliver: (session, text, d) => d.sendChatInput(session, text) }),
      sendToSession: (id, s, text, carried) => { if (!sendOk(id)) return false; sent.push({ id, text, at: Date.now(), note: carried && carried.note }); s._isStreaming = true; return true; },
      fireIdentity: (id, s) => (s && s._slot ? { key: s._slot, name: s._slot } : null),
      beforeFire: async (id, s) => { if (s._onGate) s._onGate.call(s, ar); return s._gate !== false; },
      wallVerdict: (id, s) => s._verdict || null,
      authorizeSpendBatch: authorize === 'absent' ? null : (items, reason) => { batchCalls++; batchItems = items.length; calls.push({ ids: items.map((it) => it.id).join(), n: items.length, reason }); if (authorize) return authorize(items); return guard.authorizeBatch({ reason, items: items.map((it) => ({ session: it.session, sessionId: it.id, identity: it.identity })) }); },
      noteBatchSpend: (id, s, identity, hold, reason) => guard.note({ reason, identity, hold }),
      releaseSpend: (id, s, hold) => guard.release({ hold }),
      clearStopped: (id, s) => { s._stoppedBy = null; cleared.push(id); },
      onListChange: () => { listChanges++; },
      bulkPaceMs: PACE,
    });
    const settle = async (rec) => { for (let i = 0; i < 200 && rec && !rec.done; i++) { await new Promise((r) => setTimeout(r, 15)); rec = ar.batchStatus(rec.batchId); } return rec; };
    const stamps = () => { const b = guard.snapshot().budget; return Object.values(b.identities || {}).flat().filter((x) => x && (x.reason === 'bulk-resume' || x.reason === 'auto-resume')).length; };
    const tally = () => (guard.snapshot().budget.attended || []).filter((x) => x && x.reason === 'bulk-resume').length;
    return { ar, guard, active, sent, cleared, settle, stamps, tally, counts: () => ({ batchCalls, batchItems, listChanges, calls }) };
  };
  const S = (slot, stoppedBy, extra = {}) => ({ backend: 'claude', mode: 'chat', name: extra.name || slot, _slot: slot, _stoppedBy: stoppedBy, pty: {}, _isStreaming: false, ...extra });
  const quota = (agoH, resetIn = -0.1) => ({ kind: 'quota', at: NOW0 - agoH * H, resetsAt: NOW0 + resetIn * H, said: "You've hit your limit" });

  // A — the batch
  const w = mkWorld({ sessions: {
    q1: S('A', quota(5)), q2: S('A', quota(3)), ov: S('B', { kind: 'overload', at: NOW0 - 4 * H }),
    walled: S('A', quota(2, +2)), busy: S('A', quota(6), { _isStreaming: true }),
    gateNo: S('B', quota(1), { _gate: false, _onGate: function () { this._verdict = { usable: false, blockedUntil: NOW0 + H }; } }), // the wall is still there only when the gate looks
  } });
  const plan = w.ar.stoppedPlan();
  ok('§8 the PLAN before anything runs: 4 eligible earliest-first (q1, ov, q2, gateNo); walled + busy skipped and named', plan.eligible.map((e) => e.id).join() === 'q1,ov,q2,gateNo' && plan.skipped.map((s) => s.id + ':' + s.why).sort().join() === 'busy:running,walled:walled', JSON.stringify(plan));
  const t0 = Date.now();
  let rec = w.ar.resumeBatch({ pressed: PRESS });
  ok('§8 the press answers at once with the batch (planned 4) — the continues run after it', gateOf(rec) && rec.planned === 4 && !rec.refused, JSON.stringify(rec));
  ok('§8 a SECOND press while it runs is refused by name (in-flight) — never a second batch', w.ar.resumeBatch().why === 'in-flight');
  rec = await w.settle(rec);
  const c = w.counts();
  // THE ASKS AS THEY ARE NOW (the hosted red of 2.369.412's prep run 2, placed by 主开发 2026-11-19 00:53Z): the U2 cure asks the
  // authorizer AGAIN before EACH continue (主开发's law 1 — what the account became while the batch ran), so the press's ONE
  // authorization is followed by one single-item ask per continue that reaches its deliver; this leg pinned the old one-call shape.
  // gateNo's gate still reads a wall: it is skipped BEFORE its re-ask, so it is never asked again
  ok('§8 ONE authorization at the press for the whole batch (all 4, earliest first), then EACH delivered continue asked again on its own (q1, ov, q2 — one item each, the press\'s reason); gateNo, skipped at its gate, is not asked again', w.sent.length === 3 && c.calls.length === 1 + w.sent.length && c.calls[0].ids === 'q1,ov,q2,gateNo' && c.calls[0].n === 4 && c.calls.slice(1).map((x) => x.ids).join('|') === w.sent.map((x) => x.id).join('|') && gateOf(c.calls.slice(1).every((x) => x.n === 1)) && verdictOf(c.calls.every((x) => x.reason === 'bulk-resume')), JSON.stringify(c));
  ok('§8 the continues went out EARLIEST STOP FIRST, one at a time, through the harness verb (q1, ov, q2)', w.sent.map((x) => x.id).join() === 'q1,ov,q2', JSON.stringify(w.sent.map((x) => x.id)));
  const gaps = w.sent.slice(1).map((x, i) => x.at - w.sent[i].at);
  ok(`§8 PACED: every gap ≥ the pace (${PACE} ms) — never a storm`, gaps.length === 2 && verdictOf(gaps.every((g) => g >= PACE - 5)), JSON.stringify(gaps));
  // a wall's continue is the module's own usage-limit words (bulkPromptFor — a string of the continue's form); CONTINUE_PROMPT is
  // the object of its PARTS, so the old `=== CONTINUE_PROMPT` was false by construction (red since the leg was written)
  const QUOTA_WORDS = arMod.bulkPromptFor('quota', null);
  ok('§8 an overload is continued with ITS words, a wall with the usage-limit words (q1 and q2: the module\'s bulkPromptFor, a continue of the release\'s form; never the overload\'s)', typeof QUOTA_WORDS === 'string' && gateOf(IS_CONTINUE(QUOTA_WORDS)) && QUOTA_WORDS !== CONTINUE_PROMPT_OVERLOAD && w.sent.find((x) => x.id === 'ov').text === CONTINUE_PROMPT_OVERLOAD && w.sent.find((x) => x.id === 'q1').text === QUOTA_WORDS && w.sent.find((x) => x.id === 'q2').text === QUOTA_WORDS, JSON.stringify(w.sent.map((x) => ({ id: x.id, text: String(x.text).slice(0, 90) }))));
  ok('§8 the gate that still reads a wall SKIPS that one and says until when (never retried blindly)', verdictOf(rec.skipped.some((s) => s.id === 'gateNo' && s.why === 'walled' && s.until === NOW0 + H)), JSON.stringify(rec.skipped));
  ok('§8 the outcome: resumed 3 · skipped 3 · refused none · nothing undelivered', gateOf(rec.done) && rec.resumed.length === 3 && rec.skipped.length === 3 && !rec.refused && !rec.failed.length, JSON.stringify(rec));
  ok('§8 ATTENDED (the owner\'s ruling 2026-11-18): the 3 delivered continues wrote NO ledger stamp and held nothing — 3 in the attended tally', w.stamps() === 0 && w.tally() === 3 && w.guard.snapshot().holdsOpen === 0, JSON.stringify({ stamps: w.stamps(), tally: w.tally(), open: w.guard.snapshot().holdsOpen }));
  ok('§8 a delivered continue CLEARS the mark (the turn starts) and the breaker remembers it fired', w.cleared.join() === 'q1,ov,q2' && !!(w.ar._fires.get('q1') && w.ar._fires.get('q1').last), JSON.stringify(w.cleared));
  ok('§8 ONE list broadcast at the end of the batch', w.counts().listChanges === 1, JSON.stringify(w.counts()));
  ok('§8 the batch ran in ~pace × (n−1), not n × a gate storm', Date.now() - t0 < 5000);

  // B — THE PRESS-LESS TWIN, ALL OR NOTHING: three continues on slot A against a cap of 2 ⇒ the WHOLE batch refused
  // (and the same three PRESSED at that cap: all land, attended — the cap is the automatic continues', not the person's)
  const mk3 = (cap) => mkWorld({ cap, sessions: { a1: S('A', quota(3)), a2: S('A', quota(2)), a3: S('A', quota(1)) } });
  const r2 = mk3(2);
  let rr = await r2.settle(r2.ar.resumeBatch());
  ok('§8 a refusal resumes NONE: 3 on slot A at an hour cap of 2 ⇒ refused by name (hour-cap, slot A), 0 delivered, 0 holds, 0 stamps', gateOf(rr.refused) && rr.refused.why === 'hour-cap' && gateOf(/A/.test(rr.refused.detail)) && r2.sent.length === 0 && r2.guard.snapshot().holdsOpen === 0 && r2.stamps() === 0, JSON.stringify({ rr, sent: r2.sent.length }));
  ok('§8 …the marks stay (nothing ran) — the person can raise the cap and press again', verdictOf([...r2.active.values()].every((s) => s._stoppedBy)));
  const r2p = mk3(2);
  const rp = await r2p.settle(r2p.ar.resumeBatch({ pressed: PRESS }));
  ok('§8 ATTENDED: the same 3 PRESSED at an hour cap of 2 all land — 0 stamps, 3 in the attended tally, and slot A\'s hour still whole for an automatic continue', !rp.refused && rp.resumed.length === 3 && r2p.stamps() === 0 && r2p.tally() === 3 && r2p.guard.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' } }).ok === true, JSON.stringify(rp));
  const r3 = mk3(3);
  rr = await r3.settle(r3.ar.resumeBatch());
  ok('§8 CONTROL (the boundary is exact): at a cap of 3 the same batch is authorized and all 3 land', !rr.refused && rr.resumed.length === 3 && r3.stamps() === 3, JSON.stringify(rr));
  // …and the hour already holds what this batch spent: a single unattended turn on A is now refused
  ok('§8 the batch COUNTS: after it, slot A\'s cap of 3 is spent — a single auto-resume authorization is refused', r3.guard.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' } }).why === 'hour-cap');

  // C — FAIL CLOSED
  const rT = mkWorld({ sessions: { a1: S('A', quota(3)) }, authorize: () => { throw new Error('boom'); } });
  rr = await rT.settle(rT.ar.resumeBatch());
  ok('§8 FAIL CLOSED: a gate that throws resumes none (gate-error)', gateOf(rr.refused) && rr.refused.why === 'gate-error' && rT.sent.length === 0, JSON.stringify(rr));
  const rA = mkWorld({ sessions: { a1: S('A', quota(3)) }, authorize: 'absent' });
  rr = await rA.settle(rA.ar.resumeBatch());
  ok('§8 FAIL CLOSED: no batch gate wired resumes none (no-gate) — there is no "absent means allow" for a batch', gateOf(rr.refused) && rr.refused.why === 'no-gate' && rA.sent.length === 0, JSON.stringify(rr));
  const rU = mkWorld({ sessions: { a1: S('A', quota(3)), x: S(null, quota(2)) } });
  rr = await rU.settle(rU.ar.resumeBatch());
  ok('§8 A CONVERSATION WHOSE SLOT CANNOT BE NAMED is said BEFORE the press (skipped «no-slot», by name) and never refuses the batch — a1 continues (the cure\'s should, 主开发 2026-11-18 20:16Z)', !rr.refused && rr.resumed.map((x) => x.id).join() === 'a1' && gateOf(rr.skipped.some((x) => x.id === 'x' && x.why === 'no-slot')) && rU.sent.length === 1, JSON.stringify(rr));

  // D — the `limit` field (at most this many, earliest first — the dialog sends none since the owner's ruling 2026-11-18)
  const rK = mkWorld({ sessions: { a1: S('A', quota(3)), a2: S('A', quota(2)), a3: S('B', quota(1)) } });
  rr = await rK.settle(rK.ar.resumeBatch({ limit: 1 }));
  ok('§8 `limit` 1 continues ONLY the earliest stop (a1), authorizes 1, leaves 2', rr.resumed.map((x) => x.id).join() === 'a1' && rr.left === 2 && rK.counts().batchItems === 1 && rK.stamps() === 1, JSON.stringify(rr));

  // E — an undelivered continue gives its hold back
  const rF = mkWorld({ sessions: { a1: S('A', quota(3)), a2: S('A', quota(2)) }, sendOk: (id) => id !== 'a1' });
  rr = await rF.settle(rF.ar.resumeBatch());
  ok('§8 a continue the channel refused is NOT charged — its hold goes back, the mark stays, it is counted as undelivered', rr.failed.map((x) => x.id).join() === 'a1' && rr.resumed.map((x) => x.id).join() === 'a2' && rF.stamps() === 1 && rF.guard.snapshot().holdsOpen === 0 && verdictOf(rF.active.get('a1')._stoppedBy), JSON.stringify(rr));

  // F — THE RE-ENTRY GUARD: the gate runs the pool's switch, which calls fireNow for an ARMED session
  const reentry = async (mod) => {
    const sess = S('A', quota(3), { _autoResume: true });
    const rw = mkWorld({ mod, sessions: { a1: sess } });
    rw.ar.armIfEnabled('a1', sess, Date.now() + 60e3, 'usage limit');
    sess._onGate = (ar) => { ar.fireNow('a1', 'pool switch inside the gate'); };
    const out = await rw.settle(rw.ar.resumeBatch());
    await new Promise((r) => setTimeout(r, 60));
    return { sent: rw.sent.length, batchResumed: out.resumed.length, out };
  };
  const re = await reentry(arMod);
  ok('§8 a fireNow raised INSIDE the batch\'s gate (the pool switch) delivers nothing — ONE continue for one stop, and it is the BATCH\'s (charged to the batch\'s authorization, counted in its outcome)', re.sent === 1 && re.batchResumed === 1, JSON.stringify(re));
  {
    const MD = path.join(scratch('arl-bulk-mut'));
    fs.mkdirSync(MD, { recursive: true });
    let src = read('src/server/auto-resume.js');
    const needle = '        let gate = true, gateP = null;\n        session._arFiring = true;\n';   // (lg-recovery U2 cure: the gate's own promise is kept)
    const applies = src.includes(needle);
    ok('§8 CONTROL: the re-entry patch applies to the real file', verdictOf(applies));
    if (applies) {
      src = src.replace(needle, '        let gate = true, gateP = null;\n').replace(/require\('\.\.\//g, `require('${path.join(REPO, 'src')}/`);
      const f = path.join(MD, 'auto-resume-mut.js'); fs.writeFileSync(f, src);
      const bad = await reentry(require(f));
      // (the post-gate `_isStreaming` re-check on both roads still keeps it to ONE send — defence in depth — but the
      // continue that goes out is then the pool switch's own auto-resume, and the batch's outcome misreports it)
      ok('§8 CONTROL: without the batch raising the in-flight flag the pool switch\'s own continue takes the turn from under the batch — the batch reports 0 resumed («already running») for the one continue that went out', bad.sent === 1 && bad.batchResumed === 0 && verdictOf(bad.out.skipped.some((x) => x.why === 'running')), JSON.stringify(bad));
    }
  }
}

// ── THE PAIR'S VERDICT (B-0220) ─────────────────────────────────────────────
{
  ok('PAIR: the held copies outlived this whole run (the AUDIT above walked src/ inside the window), and none of them is in the checkout',
    gateOf(Array.isArray(heldCopies)) && verdictOf(heldCopies.every((f) => fs.existsSync(f) && path.relative(REPO, f).startsWith('..' + path.sep))), JSON.stringify(heldCopies));
  fs.writeFileSync(HOLD + '.go', '1');
  const r = await held;
  ok('PAIR: …and the held run of test-new-member-wake is green too', r.code === 0 && verdictOf(/ALL PASS/.test(r.out)),
    r.out.split('\n').filter((l) => /✗|FAILED|Error/.test(l)).slice(0, 8).join(' | ') || r.out.slice(-400));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
