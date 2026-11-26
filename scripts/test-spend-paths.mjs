#!/usr/bin/env node
// THE SPEND CEILING (docs/design-account-hardening.md §4.4c, P9, owner
// decisions D2 / D3 / D6 / D8).
//
// WHAT IT GUARDS. Producers in this tree can start a BILLED turn with no
// per-occurrence owner action; §2's census derives them from the source and
// PRINTS what it walked (measured on this commit: 14 files carrying a turn-
// injection primitive, of which 5 make the decision — auto-resume, the Stop
// nudge, the delivery ladder for jobs and peer messages, and the codex reset
// credit — and 9 are allowlisted with a reason, one of them being the HUMAN
// path). Each of the five carried its own local floor — auto-resume's loop
// breaker, the Stop nudge's in-memory `_lastStopNudge`, the jobs engine's
// 30s flood floor — and not one of them was a bound on MONEY: they pace ONE
// producer, they are per SESSION (nine conversations can sit on one
// subscription) and they reset on every release restart. Measured on this
// instance's own transcripts — ALL 8,087 of them, not a recently-touched
// sample (that sample lies: `find -mtime -3` selects FILES, and a long-lived
// conversation's file carries records from months back):
//   603 Stop-nudge mini-turns across 72 conversations, 2026-07-10 → 2026-09-09
//   999 forced assistant records reading 536,353,861 cached tokens
//   peaks: 93 in a day, 184 in a rolling 72h, 21 on ONE conversation in ONE hour
// (this instance runs with stopNudgeStaleMinutes=0 AND stopNudgeCooldownMinutes=0,
// i.e. every-stop mode — which is exactly why the cooldown was never the bound.)
// REPLAYED through the real guard with the shipped D6 numbers, that history is
// refused 20 times (7 slots) to 55 times (one slot) out of 603: this ceiling is
// a BACKSTOP against bursts and loops, not a routine throttle, and saying
// otherwise would oversell it.
//
// THE LEGS
//   §1  the PURE rules (src/spend-authorizer.js): caps, windows, retryAfter,
//       overage, credential state, the two "fail closed" refusals
//   §2  THE CENSUS — grep-derived from the tracked source, PRINTED, with a
//       non-session allowlist that dies when it stops matching, a NEGATIVE
//       CONTROL (a synthetic producer in a scratch tree must be caught) and a
//       POSITIVE control (the same producer, gated, is clean)
//   §3  the ORCH guard: persistence across a restart, one journal line, one
//       inbox item, the 80% notice
//   §4  the REAL auto-resume + REAL pool engine: the ceiling refuses a continue
//       the loop breaker would have allowed, the arm survives, and an
//       owner-typed prompt is never counted
//   §4b  the hold is GIVEN BACK on both of deliver()'s non-delivering exits
//       (a failed send, no verb) — each with a patched-copy negative control
//   §5  the REAL delivery ladder: a refusal STASHES (nothing is lost) and an
//       allowed delivery is charged exactly once
//   §6  the REAL Stop-nudge route: the cooldown survives a restart, the exit
//       condition fires for a session that never reports, the ceiling refuses
//   §7  overage: unattended refused, the human path untouched, the panel says it
//   §8  the EDF reserve floor: voluntary refused, escape allowed
//   §9  FAIL CLOSED: an authorizer that throws spends nothing, at four sites
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import { gitEnvFrom } from './git-env.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
import { pathToFileURL } from 'node:url';
// the viewer's zone the For-you lines are read in (page-time prints in the page's zone = this process's when none is set —
// lane ui-language): pinned, so a UTC runner reads the same clock as this box
process.env.TZ = 'America/Los_Angeles';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const GIT_ENV = gitEnvFrom(process.env); // §2 asks git for the tracked source INSIDE `npm run build`
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
// r1563 (B-7e49 slice 1, lane bl-tests-e): THE TREE ONCE A RUN — every pass over the tracked server source (its census, the
// passed loop, the guard texts, the press files, the computed set, §26's two loops, the late census) read every file from disk
// again through an un-memoised read(), and the tracked list was asked of git six times. Now each text is read once (TEXT,
// this suite's own memo: repo-relative path → { t } or { e }) and the list once (TRACKED). read() keeps its old meaning (a
// failed read is ''); a census over a SCRATCH or mutant root still reads from disk (textAt); the pruneBudget leg keeps its own
// scope (git grep over every tracked file) and reads its hits through the memo.
const TEXT = new Map();
const textOf = (f) => { let r = TEXT.get(f); if (!r) { try { r = { t: fs.readFileSync(path.join(REPO, f), 'utf8') }; } catch (e) { r = { e }; } TEXT.set(f, r); } return r; };
const read = (f) => { const r = textOf(f); return r.e ? '' : r.t; };
// r1708 (B-7e49 slice 2, lane bl-tests-e): THE DICTIONARY PARSE ONCE A TEXT — six legs parsed zh / ja again through
// i18n-extract's dictEntries, whose decodeLit compiles a Function per literal (the profile: ~2.2 s of the suite's 18); the
// entries are kept per text here (the callers only spread and map them)
const DICT_ENTRIES = new Map();
const dictEntriesOnce = (dictEntries, text) => { let r = DICT_ENTRIES.get(text); if (r === undefined) DICT_ENTRIES.set(text, r = dictEntries(text)); return r; };
/** a file's text under `root`: the repo's through the memo (a failed read throws again), any other root's from disk */
const textAt = (root, f) => { if (root !== REPO) return fs.readFileSync(path.join(root, f), 'utf8'); const r = textOf(f); if (r.e) throw r.e; return r.t; };
const cleanup = [];
process.on('exit', () => { for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const tmpdir = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); cleanup.push(d); return d; };
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

const A = require(path.join(REPO, 'src/spend-authorizer.js'));
const guardMod = require(path.join(REPO, 'src/server/spend-guard.js'));
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const arMod = require(path.join(REPO, 'src/server/auto-resume.js'));
const deliverMod = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { decidePoolSwitch } = require(path.join(REPO, 'src/account-pool-auto.js'));
const { capsOf, notificationDelivery } = require(path.join(REPO, 'src/backend-caps.js')); // §5b reads the LANE off the caps row, never a backend id
// The sidecar caps a CURRENT codex wrapper writes: the rpc rung gates on
// `peerMessage`, and (B-d963) a notification is only written to a busy wrapper
// whose own advert names a verb table with 'steer' — a verb-less advert is a
// pre-2.369.63 build that would QUEUE it (a billed turn), and the ladder holds
// it instead. Fixture shape taken from data/bin/codex-chat-wrapper.js's caps.
const CURRENT_WRAPPER_CAPS = { peerMessage: true, inputQueue: true, queueVerbs: capsOf('codex').inputModes.queueVerbs.slice() };
const { setupAgentRoutes } = require(path.join(REPO, 'src/agent-routes.js'));

// ── NEGATIVE CONTROLS ARE PATCHED COPIES OF THE REAL MODULE ─────────────────
// A control written from memory tests the code I believe shipped; a control built
// by replacing ONE expression in the real file tests the code that did. The
// copy is written OUTSIDE the tree (scripts/mutant-copy.mjs: this process's
// scratch dir, its `require` re-bound on line 1 to the real module's path, so
// relative requires and the require cache are a sibling's) and §11 measures
// that while the copies exist. It used to be a SIBLING in src/server/
// (vs-spend-mut-*, gitignored): a SIGKILL stranded it and any suite scanning
// src/ beside this one counted it as product code (the B-0220 shape).
// ONE implementation, because r5 needed the same machinery for the guard that
// r4 needed for the ladder — and two hand-rolled sweeps is how the next one
// leaks.
const MUT = mutantCopies('spend', REPO);
sweepLegacy(REPO, ['src/server'], /^vs-spend-mut-(\d+)-/);   // what a pre-fix run stranded (dead PIDs only)
/** A copy of `rel` with each [from, to] applied. Returns {mod, hits} or {err}:
 *  a needle that no longer matches is an UNAPPLIED PATCH, i.e. a control that
 *  would pass by doing nothing. */
function mutantModule(rel, edits) {
  let src = read(rel), hits = 0;
  if (!src) return { err: 'could not read ' + rel };
  for (const [from, to] of edits) {
    if (!src.includes(from)) return { err: 'needle missing: ' + from.slice(0, 60) };
    src = src.split(from).join(to); hits++;
  }
  const f = MUT.write(rel, src);
  return { mod: require(f), hits, file: f };
}

// ── §1 THE PURE RULES ───────────────────────────────────────────────────────
console.log('\n§1 the pure decision (src/spend-authorizer.js)');
{
  const ID = { key: 'sub-a', name: 'A' };
  const L = A.BUDGET_DEFAULTS;
  ok('§1 D6 defaults are the shipped numbers (30/h · 200/day · 800/day instance · notice at 80% — raised from 12/60/200 on 2026-09-15, owner: the per-slot hour cap is shared by every conversation on the slot)',
    L.perIdentityHour === 30 && L.perIdentityDay === 200 && L.perInstanceDay === 800 && L.noticePct === 80, JSON.stringify(L));
  const lim = A.budgetLimits((k) => ({ 'spend.unattendedPerIdentityHour': 3, 'spend.unattendedPerIdentityDay': 0, 'spend.budgetNoticePct': -4 }[k]));
  ok('§1 a setting overrides its default, an EXPLICIT 0 is a choice, garbage falls back',
    lim.perIdentityHour === 3 && lim.perIdentityDay === 0 && lim.perInstanceDay === 800 && lim.noticePct === 80, JSON.stringify(lim));
  // A settings reader that answers `true` to everything (a harness stub, a
  // corrupted store) would set every ceiling to ONE by coercion — a value
  // nobody chose. Only a number is a number.
  // …and since B-0a33's follow-up ruling (2026-11-18) a cap that is no number is NO cap: refused and said, never a default either
  const boolLim = A.budgetLimits(() => true);
  ok('§1 a BOOLEAN is never a cap (Number(true) === 1 must not become the ceiling) — it is «no limit is set»: every turn nobody typed refused, never the default',
    boolLim.perIdentityHour === 0 && boolLim.perIdentityDay === 0 && boolLim.perInstanceDay === 0 && JSON.stringify(boolLim.unset) === '["perIdentityHour","perIdentityDay","perInstanceDay"]', JSON.stringify(boolLim));

  // The mechanism legs below pin the ARITHMETIC of a cap, so they hand the
  // authorizer an explicit fixture (the 2026-09-08 numbers) instead of
  // reading BUDGET_DEFAULTS — the defaults are the owner's knob and moved
  // once already (2.369.98: 12/60/200 → 30/200/800).
  const OLD = Object.freeze({ perIdentityHour: 12, perIdentityDay: 60, perInstanceDay: 200, noticePct: 80 });
  let st = A.emptyBudget();
  const now = 1_800_000_000_000;
  ok('§1 an empty ledger authorizes', A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: st, now }).ok === true);
  for (let i = 0; i < 12; i++) st = A.noteUnattendedSpend(st, { identity: ID, at: now + i }).state;
  const capped = A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: st, now: now + 100, limits: OLD });
  ok('§1 the 13th unattended turn in an hour is refused, by NAME', capped.ok === false && capped.why === 'hour-cap', JSON.stringify(capped.why));
  ok('§1 …and it says WHEN the window frees a slot (the oldest stamp + 1h), never a guess',
    capped.retryAfter === now + A.HOUR_MS, `${capped.retryAfter - now} vs ${A.HOUR_MS}`);
  ok('§1 …an hour later the same ledger authorizes again (rolling window, not a bucket)',
    A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: st, now: now + A.HOUR_MS + 1000, limits: OLD }).ok === true);
  ok('§1 a DIFFERENT identity is unaffected by the first one\'s hour (the unit is the credential slot)',
    A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: { key: 'sub-b', name: 'B' }, state: st, now: now + 100, limits: OLD }).ok === true);

  // the instance ceiling: 200 spends spread over 20 identities
  let inst = A.emptyBudget();
  for (let i = 0; i < 200; i++) inst = A.noteUnattendedSpend(inst, { identity: { key: 'sub-' + (i % 20), name: 'x' }, at: now + i }).state;
  const iv = A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: { key: 'sub-fresh', name: 'F' }, state: inst, now: now + 500, limits: OLD });
  ok('§1 the INSTANCE ceiling holds even for an identity that has spent nothing', iv.ok === false && iv.why === 'instance-cap', JSON.stringify(iv.why));

  ok('§1 FAIL CLOSED: an identity we cannot name is refused (a ceiling nobody can be charged against is not a ceiling)',
    A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: null, state: A.emptyBudget(), now }).why === 'identity-unknown');
  ok('§1 FAIL CLOSED: a reason outside the declared set is refused',
    A.authorizeUnattendedSpend({ reason: 'something-new', identity: ID, state: A.emptyBudget(), now }).why === 'unknown-reason');
  ok('§1 every declared reason says what it spends, and one of them is not a turn (the codex reset credit)',
    Object.values(A.SPEND_REASONS).every((r) => typeof r.what === 'string' && typeof r.turn === 'boolean')
    && A.SPEND_REASONS['codex-reset-credit'].turn === false && A.SPEND_REASONS['auto-resume'].turn === true);

  const cred = (serves) => A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: A.emptyBudget(), credential: { serves, state: 'wiped' }, now });
  ok('§1 a credential that CANNOT serve is refused (the turn would only buy a junk card)', cred('no').why === 'identity-cannot-serve');
  ok('§1 …but P6 holds: an UNKNOWN credential state is not a claim and does not block', cred('unknown').ok === true && cred('yes').ok === true);

  const ov = (inUse, policy) => A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: A.emptyBudget(), overage: { inUse }, overagePolicy: policy, now });
  ok('§1 D3b: while an account bills PAID OVERAGE every unattended turn is refused', ov('yes', 'refuse').why === 'overage-in-use');
  ok('§1 …an explicit opt-in allows it, and "unknown"/"no" never block', ov('yes', 'allow').ok === true && ov('unknown', 'refuse').ok === true && ov('no', 'refuse').ok === true);

  // the 80% notice
  let n = A.emptyBudget(); let warns = [];
  for (let i = 0; i < 12; i++) { const r = A.noteUnattendedSpend(n, { identity: ID, at: now + i, limits: OLD }); n = r.state; if (r.warn) warns.push(r.warn); }
  ok('§1 the 80% notice fires ONCE, at the crossing (10th of 12), naming the axis', warns.length === 1 && warns[0].scope === 'hour' && warns[0].used === 10, JSON.stringify(warns));
  ok('§1 …and its sentence names the account and both numbers', /A has used 10 of its 12 unattended turns this hour \(83%\)/.test(A.noticeText(warns[0])), A.noticeText(warns[0]));

  // ── RESERVATIONS (r5): an authorization binds until somebody says what
  // happened. The PURE half only has to answer "how much is in flight" — the
  // guard owns the list, because a hold must NOT survive a restart (the
  // in-flight delivery it stands for does not either).
  {
    const P1 = A.reservePending([], { id: 'h1', key: 'A', at: now });
    const P2 = A.reservePending(P1, { id: 'h2', key: 'B', at: now });
    ok('§1 a hold counts for its OWN identity and for the instance, never for a stranger',
      A.pendingCounts(P2, 'A', now).identity === 1 && A.pendingCounts(P2, 'A', now).instance === 2
      && A.pendingCounts(P2, 'C', now).identity === 0, JSON.stringify(A.pendingCounts(P2, 'A', now)));
    ok('§1 …releasing is by id and never mutates the caller\'s list',
      A.releasePending(P2, 'h1').length === 1 && P2.length === 2);
    ok('§1 …and an unknown id is a no-op (releasing is the money-SAFE half of the pair)',
      A.releasePending(P2, 'nope').length === 2);
    const exp = A.expirePending(P2, now + A.RESERVE_TTL_MS + 1);
    ok('§1 …while a hold nobody settled EXPIRES and is COUNTED (the census a grep cannot be)',
      exp.live.length === 0 && exp.expired.length === 2);
    // THE DECISION ITSELF: in-flight binds exactly like a charge, and the two
    // are reported apart — a panel that says "N of M today" must keep saying
    // turns that HAPPENED.
    const withHolds = A.authorizeUnattendedSpend({
      reason: 'auto-resume', identity: ID, state: A.emptyBudget(),
      limits: { ...A.BUDGET_DEFAULTS, perIdentityHour: 2 },
      pending: A.reservePending(A.reservePending([], { id: 'a', key: ID.key, at: now }), { id: 'b', key: ID.key, at: now }),
      now,
    });
    ok('§1 two authorizations in flight fill a cap of two, before either is charged',
      withHolds.ok === false && withHolds.why === 'hour-cap' && withHolds.counts.hour === 0 && withHolds.inFlight.identity === 2,
      JSON.stringify({ why: withHolds.why, counts: withHolds.counts.hour, inFlight: withHolds.inFlight }));
    ok('§1 …and it SAYS so, so the refusal is not mistaken for spend that happened',
      /\(\+2 in flight\)/.test(withHolds.detail) && /has spent 0/.test(withHolds.detail), withHolds.detail);
    ok('§1 …an EXPIRED hold binds nothing (the bound is a TTL, not a leak)',
      A.authorizeUnattendedSpend({
        reason: 'auto-resume', identity: ID, state: A.emptyBudget(),
        limits: { ...A.BUDGET_DEFAULTS, perIdentityHour: 2 },
        pending: A.reservePending([], { id: 'a', key: ID.key, at: now - A.RESERVE_TTL_MS - 1 }), now,
      }).ok === true);
    ok('§1 …and the instance ceiling counts holds from EVERY identity (that axis is not per-slot)',
      A.authorizeUnattendedSpend({
        reason: 'auto-resume', identity: ID, state: A.emptyBudget(),
        limits: { ...A.BUDGET_DEFAULTS, perInstanceDay: 1 },
        pending: A.reservePending([], { id: 'a', key: 'somebody-else', at: now }), now,
      }).why === 'instance-cap');
    ok('§1 …a hold list nobody passed is not a claim about anything (omitting it changes no decision)',
      JSON.stringify(A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: A.emptyBudget(), now }))
      === JSON.stringify(A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: A.emptyBudget(), pending: [], now })));
    // The TTL is a RELATION, not a taste: it has to outlive the delivery
    // ladder's own settle window (a frame waits up to SETTLE_TTL_MS for the
    // wrapper's verdict) and stay far inside the shortest window the caps
    // count, which is what lets pendingCounts answer one number per scope.
    ok('§1 RESERVE_TTL_MS outlives a settling frame and stays far inside the hour it is counted in',
      A.RESERVE_TTL_MS > 120 * 1000 && A.RESERVE_TTL_MS * 10 < A.HOUR_MS, String(A.RESERVE_TTL_MS));
  }
  const pruned = A.pruneBudget({ identities: { x: [now - A.DAY_MS - 1, now - 5] }, instance: [now - A.DAY_MS - 1], notices: {} }, now);
  ok('§1 pruning drops everything older than a day and keeps the rest', pruned.identities.x.length === 1 && pruned.instance.length === 0);
  const src = { identities: { x: [now] }, instance: [now], notices: {} };
  A.pruneBudget(src, now + A.DAY_MS + 1);
  ok('§1 …and it never mutates the caller\'s ledger (a refused authorization leaves no half-pruned state)', src.identities.x.length === 1);

  // DATED, because that is what the producer writes: src/rate-limit-capture.js
  // stamps `asOf` on the very line it merges the overage record.
  const ovRec = (extra = {}) => ({ overage: { inUse: true, asOf: now, ...extra } });
  ok('§1 overageState is THREE-state (yes / no / unknown), never a boolean', A.overageState(ovRec(), { now }).inUse === 'yes'
    && A.overageState({ overage: { inUse: false } }).inUse === 'no' && A.overageState({}).inUse === 'unknown' && A.overageState(null).inUse === 'unknown');
  ok('§1 …and it carries the SPEND figure when the payload has one', A.overageText({ ...ovRec(), spend: { used: 12.5, limit: 50 } }, { now }) === 'paid overage in use — $12.50 of $50.00 this period',
    A.overageText({ ...ovRec(), spend: { used: 12.5, limit: 50 } }, { now }));
  ok('§1 …and says nothing at all when overage is off or unknown', A.overageText({ overage: { inUse: false } }) === null && A.overageText({}) === null);
  // …and the SENTENCE runs on the same clock as the GATE: a text built with its
  // own Date.now() would say "paid overage in use" about a record the
  // authorizer has already expired — two faces of one record, disagreeing.
  ok('§1 …and it is silent about a record the authorizer has expired (one clock, both faces)',
    A.overageText({ overage: { inUse: true, asOf: now - A.OVERAGE_STALE_MS - 1 } }, { now }) === null
    && A.overageText({ ...ovRec(), spend: { used: 1, limit: 2 } }, { now }) !== null);

  // ── r2: THE CLAIM THAT BLOCKS IS THE ONE THAT NEEDS A DATE ────────────────
  // `asOf` was captured and never consulted, so a record that stopped being
  // refreshed refused every unattended turn FOREVER — including the continue
  // for an auto-resume-armed session, which is by definition idle and produces
  // no events to refresh it with — and `retryAfter` printed a reset instant in
  // the PAST. Measured on this instance: seven live records, ages up to 33 h on
  // a cache refreshed 4 minutes ago, and 0 of 7 carrying a `resetsAt`.
  {
    const ovAuth = (cache) => A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: A.emptyBudget(), overage: A.overageState(cache, { now }), now });
    const fresh = { overage: { inUse: true, asOf: now - 60e3 } };
    const aged = { overage: { inUse: true, asOf: now - A.OVERAGE_STALE_MS - 1 } };
    const ended = { overage: { inUse: true, asOf: now - 60e3, resetsAt: Math.floor((now - 3600e3) / 1000) } };
    const undated = { overage: { inUse: true } };
    ok('§1 a FRESH overage record still refuses (D3b is intact — this is the positive control)',
      ovAuth(fresh).ok === false && ovAuth(fresh).why === 'overage-in-use');
    ok('§1 …and it SAYS how old the evidence is (a refusal that never dates itself cannot be told from a stale file)',
      / \(last reported 1 min ago\)/.test(ovAuth(fresh).detail), ovAuth(fresh).detail);
    ok('§1 a STALE record neither blocks nor claims (P6) and says which rung expired it',
      ovAuth(aged).ok === true && A.overageState(aged, { now }).inUse === 'unknown'
      && A.overageState(aged, { now }).evidence === 'stale' && A.overageState(aged, { now }).stated === 'yes');
    ok('§1 …a record whose OWN resetsAt has passed describes a period that ENDED, so it is not a claim about now',
      ovAuth(ended).ok === true && A.overageState(ended, { now }).evidence === 'period-ended');
    ok('§1 …and an UNDATED record cannot claim the present either', ovAuth(undated).ok === true && A.overageState(undated, { now }).evidence === 'undated');
    ok('§1 NEGATIVE CONTROL: an expired claim never turns into a REFUSAL of a different kind — it simply stops blocking',
      ovAuth(aged).why === null && ovAuth(ended).why === null && ovAuth(undated).why === null);
    ok('§1 …and a still-future resetsAt keeps its retryAfter in the FUTURE (the old shape printed an instant in the past)',
      ovAuth({ overage: { inUse: true, asOf: now - 60e3, resetsAt: Math.floor((now + 3600e3) / 1000) } }).retryAfter > now);
    ok('§1 …while `inUse:no` is deliberately NOT date-bounded (it blocks nothing, so no decision changes)',
      A.overageState({ overage: { inUse: false, asOf: now - A.OVERAGE_STALE_MS * 4 } }, { now }).inUse === 'no');
  }
  ok('§1 the PURE module imports nothing (P1: one rule, no tier crossings)', !/^\s*(const|let|var)\s+\w+\s*=\s*require\(/m.test(read('src/spend-authorizer.js')));

  // ── r2: THE OFFERED RANGE AND THE ENFORCEABLE RANGE ARE ONE SET ───────────
  // Round 1 kept a flat `MAX_STAMPS = 4 * 200` while the settings schema
  // offered 2000 per identity/day and 10000 per instance/day and budgetLimits
  // clamped at 100000/1000000 — so every value the UI accepted above 800 was
  // silently unenforceable: 1500 charged spends against a 1000/day cap counted
  // 800 and authorized the 1501st. A setting that reads as a money bound and is
  // not one is worse than no setting.
  {
    const schema = read('src/lib/settings-schema.js');
    const maxOf = (key) => {
      const i = schema.indexOf(`'${key}': {`);
      if (i < 0) return null;
      const m = /max:\s*(\d+)/.exec(schema.slice(i, i + 400));
      return m ? Number(m[1]) : null;
    };
    const rows = { perIdentityHour: 'spend.unattendedPerIdentityHour', perIdentityDay: 'spend.unattendedPerIdentityDay', perInstanceDay: 'spend.unattendedPerInstanceDay' };
    const schemaMax = Object.fromEntries(Object.entries(rows).map(([k, key]) => [k, maxOf(key)]));
    ok('§1 the census can read all three schema rows (an unreadable schema would make the next assert vacuous)',
      Object.values(schemaMax).every((v) => Number.isFinite(v)), JSON.stringify(schemaMax));
    ok('§1 the authorizer\'s clamp IS the schema\'s own max, row for row — widening one without the other goes red here',
      Object.entries(schemaMax).every(([k, v]) => A.CAP_MAX[k] === v), JSON.stringify({ schemaMax, CAP_MAX: A.CAP_MAX }));
    // and the ledger can COUNT to the biggest cap the schema offers
    const bigLimits = { perIdentityHour: 200, perIdentityDay: 2000, perInstanceDay: 10000, noticePct: 0 };
    ok('§1 retention is a FUNCTION of the limits, so the biggest offered cap is reachable',
      A.stampCap(bigLimits) > bigLimits.perInstanceDay && A.stampCap(bigLimits) <= A.CAP_MAX.perInstanceDay + 128,
      String(A.stampCap(bigLimits)));
    // the reproduction, end to end, at a cap ABOVE the retired constant
    const L2 = { perIdentityHour: 1000, perIdentityDay: 1000, perInstanceDay: 1000, noticePct: 0 };
    let st2 = A.emptyBudget();
    for (let i = 0; i < 1000; i++) st2 = A.noteUnattendedSpend(st2, { identity: ID, at: now + i, limits: L2 }).state;
    const c2 = A.spendCounts(st2, ID.key, now + 1000);
    ok('§1 a 1000/hour cap really counts 1000 (the retired 800-stamp ledger topped out below every value above it)',
      c2.hour === 1000, JSON.stringify(c2));
    ok('§1 …and the 1001st is REFUSED (this authorized before: the ceiling could not be reached, so it never fired)',
      A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, state: st2, limits: L2, now: now + 1000 }).why === 'hour-cap');
    ok('§1 NEGATIVE CONTROL: the retired flat retention would still top out at 800 on that same ledger',
      st2.identities[ID.key].slice(-800).length === 800 && c2.hour > 800);
    ok('§1 …and the ledger stays BOUNDED (retention never exceeds the clamped instance cap plus head-room)',
      st2.identities[ID.key].length <= A.CAP_MAX.perInstanceDay + 128);
    // the clamp itself
    ok('§1 a setting ABOVE the schema max is clamped to it, never silently accepted as unenforceable',
      A.budgetLimits((k) => ({ 'spend.unattendedPerInstanceDay': 999999 }[k])).perInstanceDay === A.CAP_MAX.perInstanceDay);
  }
}

// ── §2 THE CENSUS ───────────────────────────────────────────────────────────
// Grep-derived from the TRACKED source, exactly like the writer-sweep and NUL
// censuses: the file set is a property (what git tracks under the server-side
// roots), never a hand-written list, and the set it walked is PRINTED.
//
// PER SITE, NOT PER FILE (r3). Rounds 1-2 computed ONE verdict per file and
// every primitive in it inherited that verdict, so a NEW producer added to any
// of the four files that already ask the gate was invisible — the same class as
// r2's "constructs the guard but never asks it", one level up, and those four
// files are exactly where the next producer is most likely to land. Reproduced
// verbatim on a scratch file holding a correctly gated Stop-nudge arbiter AND a
// new ungated `formatChatInput` producer: verdict `GATED`, unwired count 0.
//
// A SITE IS GATED WHEN A GATE CALL IS STILL IN SCOPE ABOVE IT — you ask before
// you spend, and the asking has to be in the same function. "In scope" is
// decided by INDENTATION, not by a byte window: a window big enough for the
// real code (measured: the delivery ladder's own gate sits 6,285 chars above
// its last rung) is bigger than most files, so it would call the scratch file
// above gated too and the control would be theatre. Three properties make the
// measurement match the code as written:
//   · comments are BLANKED first (offset-preserving, whole-line only — the
//     conservative rule §9 already uses). auto-resume's JSDoc says
//     `@param deps.authorizeSpend (id, session, identity) => …`, which satisfies
//     a call-shaped regex: r2's "a CALL, never a mention" rule was true of the
//     regex and false of the input it was run on.
//   · an anchor may be a call to a LOCALLY GATED HELPER — auto-resume asks
//     through `spendOk(…)` on the line directly above its send. Without this rung the
//     one correctly gated site in that file reads unwired, and a census that
//     reddens on correct code is a census somebody deletes.
//   · a one-line `const x = (() => {…})()` is not an enclosure. Deriving the
//     enclosing function from "the nearest header line above" picked exactly
//     such a sibling in agent-routes and mislaid the real Stop-nudge gate.
// HONEST BOUNDARY: `HEADER_LINE` is a heuristic, and an UNRECOGNISED header
// falls back to module level — i.e. only a column-0 closer ends the scope, so
// the error direction is PERMISSIVE (a gate can appear to cover a site it does
// not). That is deliberate: the opposite error reddens correct code, and a
// census that reddens on correct code is one somebody deletes. What the
// controls pin is the shape a new producer actually takes — a function beside
// a gated one, with a `}` between them.
const PRIMITIVES = [
  { id: 'user-frame', re: /formatChatInput\s*\(/g, why: 'composes a USER message frame for a live session' },
  { id: 'continue-send', re: /sendToSession\s*\(/g, why: 'hands a session a user turn it did not ask for (auto-resume\'s continue)' },
  { id: 'cli-inbox', re: /\b(postToPeer|postChannelEvent|peerPost|peerPostAnswer)\s*\(/g, why: "writes into the CLI's own cross-session inbox — idle ⇒ a billed turn (peerPostAnswer: the device's peer-post op's ONE body, a second exported road into the same inbox — B-95fc follow-up)" },
  { id: 'rpc-peer-frame', re: /type:\s*'peer-message'/g, why: "hands the wrapper a peer message — idle ⇒ turn/start" },
  { id: 'deliver-ladder', re: /deliverToConversation\s*\(/g, why: 'the delivery ladder itself (jobs notifications, agent messages)' },
  { id: 'stop-nudge', re: /block:\s*true/g, why: 'the Stop hook arbiter — block+reason IS an extra billed mini-turn' },
  { id: 'reset-credit', re: /type:\s*'codex-reset-credit'/g, why: 'consumes a stored reset credit (money already paid for)' },
  // lane reset-path: the SAME spend through ONE bounded codex app-server child when no conversation can carry it
  // (a person's click on Use… — billed-turn-free, but the credit is money and the census must SEE the site)
  { id: 'reset-credit-helper', re: /consumeResetCreditViaAppServer\s*\(/g, why: 'consumes a stored reset credit through the helper app-server (no conversation carries it)' },
  // lane worker-dispatch (2026-10-02): THE typing path's CALL — every caller is a site. The owner's two (the ws
  // chat-input case, the For-you Reply route) are ALLOW rows; an agent's dispatch typing `/compact` into an idle
  // worker (src/server/worker-dispatch.js) must be GATED at its own site — it asks the authorizer WITH a hold (reason
  // peer-compact, verify r1 ⑤: the compaction is a counted model call) before the compaction; the wake is the ladder's.
  { id: 'typed-send', re: /\bsendUserInput\s*\(/g, why: "types a frame into a live session through THE typing path (src/server/user-input.js) — anything but the owner's own keyboard / click is a turn nobody typed" },
  // lane automation-verbs (design q-046 L2): an automation key's conversations.open — src/server/conversation-ops.js runs
  // the owner's create handler against a headless socket for a caller with no window; every call site is a conversation
  // nobody typed into and must ask the authorizer first (reason automation-open)
  { id: 'headless-open', re: /\bcreateHeadless\s*\(/g, why: 'opens a conversation for an AUTOMATION (no window, nobody typing) — the headless create of src/server/conversation-ops.js' },
  // lane lg-providers U4 (B-d578): THE PROVIDER TEST — one non-interactive run of a harness's CLI that spends one short request
  // of a THIRD PARTY's own key; the census must SEE every caller (a timer or an agent calling it would be a spend nobody pressed)
  { id: 'provider-test', re: /\brunProviderTest\s*\(/g, why: 'runs a harness CLI once against a third-party provider with its own key (src/server/provider-test.js) — one short billed request' },
];
// GATED = the file ASKS THE GATE. It must be a CALL, never a mention: r2 found
// `src/server/usage-pool-engine.js` reported GATED because it CONSTRUCTS the
// guard (`require('./spend-guard.js').create({…})`) while its own producer —
// the codex reset credit — went through `authorizeSpend`, a dep server.js never
// passed. The census said "gated" about the one file that also happens to be
// where the guard is built, so the producer inside it was invisible. Matching
// the call shape means the construction line alone no longer satisfies it.
// lane auto-resume-bulk: the BATCH gate is a gate too — ONE authorization over the whole resume of every wall-stopped
// session (spend-guard authorizeBatch → the PURE authorizeUnattendedBatch; auto-resume's dep `authorizeSpendBatch`)
const GATED_RE = /(?:authorizeSpend|authorizeSpendBatch|spendGuard\.authorize|spendGuard\.authorizeBatch|authorizeUnattendedSpend|authorizeUnattendedBatch)\s*\(/g;
// A function HEADER line, and the name it declares. Only used to decide "which
// function is this anchor in", so an over-match costs precision, never safety.
const HEADER_LINE = /^(\s*)(?:(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>))/;
const HEADER_NAME = /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/;
// NOT a spend site — each entry says why, and an entry that stops matching
// anything FAILS (a dead allowlist row hides the next real producer). Keyed by
// (file, PRIMITIVE) since r3: a whole-file pass would re-open the hole this
// round closed — a new `formatChatInput` in src/jobs.js must still be caught by
// the row that excuses its `deliverToConversation` call.
const ALLOW = [
  { file: 'src/server/provider-test.js', prim: 'provider-test', why: "the PRIMITIVE's definition (lane lg-providers U4): it refuses any caller but by: 'human', a third party's address only, a key read from the vault, a child with empty homes — policy lives at its one caller, the route" },
  { file: 'src/routes/providers.js', prim: 'provider-test', why: "THE HUMAN PATH (lane lg-providers U4): POST /api/providers/:id/test asks personVerdict first (any Bearer ⇒ 403, another site ⇒ 403) — a person's press on the page, attended, never a timer, never an agent" },
  { file: 'src/ws-handler.js', prim: 'typed-send', why: "the ws chat-input case: the OWNER typing in a chat window (a per-occurrence owner action — never counted, D6)" },
  { file: 'src/routes/user-todos-reply.js', prim: 'typed-send', why: "the For-you Reply route: the OWNER clicking Reply (owner-only, agent tokens refused — design-user-inbox-reply D1.1)" },
  { file: 'src/server/design-engine.js', prim: 'typed-send', why: "the Design window's comment: the OWNER's click on an artboard element + their words (POST /api/design/comment — ownerOnly, an agent's bearer refused by name), typed as the owner's own message (origin design-comment, never counted) — lane design-chrome L4 B③, composed with lane worker-dispatch's typed-send row at the 2.369.202 integration" },
  { file: 'src/server/doc-engine.js', prim: 'typed-send', why: "the Doc window's comments: the OWNER's notes on a markdown file (POST /api/doc/comments — owner-only, an agent's bearer refused by name), typed as the owner's own message (origin doc-comment, never counted) — the Design window's comment path, cloned (lane doc-window)" },
  { file: 'src/server/user-input.js', prim: 'user-frame', why: 'THE HUMAN PATH: the ws chat-input case is the owner typing, and the For-you reply route (src/routes/user-todos-reply.js, owner-only, agent tokens refused) is the second caller of the SAME function — the owner clicking Reply. Owner-typed turns are never counted (D6) — this row IS that rule (design-user-inbox-reply D1.1). B-02a3: its origin \'group-handover\' (a person\'s press handing the group messages to the RUNNING turn) is written only mid-turn on a steering Enter door, and its money is asked at ITS OWN caller — src/server/stash-handover.js handOverGroups, a typed-send site gated by the authorizer under the attended reason group-handover' },
  { file: 'src/stop-nudge.js', prim: 'stop-nudge', why: "the PURE Stop verdict (B-a8f0): its `block: true` is a VALUE the stop-check route reads — the route's own `block: true, reason` answer in src/agent-routes.js is the site, gated by the spend authorizer right before it" },
  { file: 'src/adapters/claude-code.js', prim: 'user-frame', why: 'a FORMATTER: builds the frame, never sends it' },
  { file: 'src/adapters/codex.js', prim: 'user-frame', why: 'a FORMATTER: builds the frame, never sends it' },
  { file: 'src/adapters/acp.js', prim: 'user-frame', why: 'a FORMATTER: builds the frame, never sends it' },
  { file: 'src/server/local-index.js', prim: 'user-frame', why: "lane human-cli: the person's index writer asks each adapter's formatChatInput ONCE with placeholders (src/local-index.js FRAME_TEXT) to write the row's frame TEMPLATE — it sends nothing; the frame the CLI fills later is the OWNER typing at the machine (data/bin/vibespace refuses inside an agent session — never counted, D6)" },
  { file: 'src/peer-messaging.js', prim: 'cli-inbox', why: 'the PRIMITIVE (unix-socket write) — and, since B-95fc (round w00h341sv), the DEVICE half of a delivery the hub already authorized: the peer-post op\'s ONE body peerPostAnswer (src/agentd/agentd.js calls it). Policy lives at the ladder that calls it — this file has no idea who asked' },
  { file: 'src/agentd/agentd.js', prim: 'cli-inbox', why: 'the DEVICE half of a delivery the hub already authorized: the peer-post op calls the shared body peerPostAnswer by its own name (B-95fc follow-up: the census names that road too)' },
  { file: 'src/agentd/client.js', prim: 'cli-inbox', why: 'the hub-side RPC stub for that same op' },
  { file: 'src/server/jobs-wiring.js', prim: 'deliver-ladder', why: 'a pass-through that forwards to the gated ladder' },
  { file: 'src/jobs.js', prim: 'deliver-ladder', why: 'the jobs engine calls the gated ladder and stashes what it refuses (its own 30s floor is pacing, not money)' },
  // Two rows the per-SITE verdict made explicit. Both were covered before by
  // "this file asks the gate SOMEWHERE", which is the very inference r3 removed.
  { file: 'src/agent-routes.js', prim: 'deliver-ladder', why: 'agent messaging FORWARDS to the gated ladder (spendReason peer-message); the ladder authorizes every call, reason or not. The Stop nudge, in this same file, is gated at its own site' },
  { file: 'src/server/conversation-deliver.js', prim: 'deliver-ladder', why: "the ladder's OWN header — the gate is the first thing in its body, which is what makes every rung below it (the cli-inbox and rpc-peer-frame sites) report GATED" },
  // Channels P2 (design-communication-panel §7.4 / fence 2): the ONLY thing
  // that may open an unattended turn is the ladder, so the channels engine
  // FORWARDS to it with its own declared reason and adds nothing beside it —
  // no second budget, no second ledger, no second identity derivation. Its
  // per-assignment daily wake cap is PACING; the authorizer is the money bound.
  // Channels P3 (design §12.3): the built-in Agents adapter's `send` IS the
  // ladder — an approved outbox message to an agent session is the user's
  // own message (spendReason 'peer-message'); the adapter adds nothing beside
  // the ladder's own authorizer and reports its refusal as a typed failure.
  { file: 'src/channels/agents.js', prim: 'deliver-ladder', why: "the built-in Agents adapter sends through the gated ladder (spendReason 'peer-message' — an approved outbox message is the user's own); a refusal is a typed transport failure the outbox records, never a second attempt" },
  { file: 'src/server/channels-engine.js', prim: 'deliver-ladder', why: "the channels engine calls the gated ladder with spendReason 'channel-message' and stashes what it refuses (its per-assignment daily wake cap and the push coalescing window are pacing, not money)" },
  { file: 'src/server/channels-outbound.js', prim: 'deliver-ladder', why: "the channels engine's outbound family (lane dc-channels-seams: moved verbatim out of the engine) hands a decided proposal's receipt to the gated ladder with spendReason 'channel-receipt' (noWake unless the decider chose wake-now) and stashes what it refuses" },
  // B-2198 (int212): the raw-API receipt — the agent's NEXT turn, never a wake (noWake), forwarded to the gated ladder
  { file: 'src/server/channel-api-cards.js', prim: 'deliver-ladder', why: "the raw-API receipt FORWARDS to the gated ladder with noWake (spendReason 'channel-receipt' — it rides the agent's next turn, never opens one); a refusal is stashed, nothing beside the ladder" },
  // agent browser P3 (design-agent-browser-v2 §4.3.1): the handback announcer
  // FORWARDS to the gated ladder under its own declared reason
  // (spendReason 'browser-handback'); the ladder authorizes every call.
  { file: 'src/server/browser-handback.js', prim: 'deliver-ladder', why: "the browser handback announcer FORWARDS to the gated ladder (spendReason 'browser-handback'): the explicit handback and the ON-by-choice idle announcement are its only sites, a refusal is stashed and the zero-spend notice rides the next message" },
  // AGENT GROUPS (design-communication-panel §22, owner D2): a WAKE — an
  // @mention, an invite, a member on `always`, `send --wake` — is a billed
  // turn, and the engine's ONE site for it forwards to the gated ladder
  // (spendReason 'peer-message'). Everything else a group does is FREE: the
  // default next-turn mode rides the member's own next user turn as context.
  // desktop lane E (D3): the user's "Ask <agent> to take control" — FREE by default (the stash: the agent's next turn);
  // its "wake it now" is the ONE billed site, forwarded to the gated ladder under its own declared reason.
  { file: 'src/server/window-request.js', prim: 'deliver-ladder', why: "the window-control request FORWARDS its wake to the gated ladder (spendReason 'window-share-request'); the default is the free next-turn stash, a refused or undeliverable wake is stashed too, and a 30 s per-conversation floor is pacing, not money" },
  // 2026-09-27 (the owner: "我在界面里完全看不到'有消息在 queue'这件事情"): the strip's "Hand over now" — the user's click —
  // FORWARDS the whole stash as ONE message to the gated ladder under its own declared reason; a refusal leaves the stash as it was.
  { file: 'src/server/stash-handover.js', prim: 'deliver-ladder', why: "the stash hand-over FORWARDS the waiting notices as ONE message to the gated ladder (spendReason 'stash-handover' for a person's press, 'stash-retry' after a turn end, 'stash-reachable' once a conversation owed a wake runs again — B-6721); it drains only what was delivered, a refused or unreachable hand-over leaves the stash untouched and says why" },
  // lane reset-path: the helper module's own definition — the primitive; its ONE caller (the engine's
  // writeResetCreditViaHelper) asks the gate first, which is what makes the engine's site report GATED
  { file: 'src/codex-reset-helper.js', prim: 'reset-credit-helper', why: "the PRIMITIVE (one bounded codex app-server child); policy lives at its one caller, the engine's writeResetCreditViaHelper, which asks spendGuard.authorize first (test-vendor-whitelist §8 pins the order)" },
  { file: 'src/server/groups-engine.js', prim: 'deliver-ladder', why: "the agent-groups engine's ONE wake site FORWARDS to the gated ladder (spendReason 'peer-message'); a refusal is journaled and the message rides the member's next-turn report — the engine never stashes and never opens a turn beside the ladder" },
];

/** Blank whole-line comments, preserving every byte offset and line break.
 *  Deliberately conservative — a trailing `// …` is left alone — because a
 *  string-aware stripper would have to understand `'http://…'` and regex
 *  literals to avoid eating real code. The shape it must catch is the JSDoc
 *  block, and that is what it catches. */
function stripLineComments(src) {
  return src.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? ' '.repeat(l.length) : l)).join('\n');
}

/** Where the gate is in scope, for one file. */
function gateScopes(code) {
  const lines = code.split('\n');
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') starts.push(i + 1);
  const lineNo = (i) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= i) lo = m; else hi = m - 1; } return lo; };
  const bal = (l) => (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
  const headers = [];
  lines.forEach((l, n) => {
    const m = HEADER_LINE.exec(l);
    if (!m) return;
    const nm = HEADER_NAME.exec(l);
    headers.push({ line: n, indent: m[1].length, open: bal(l) > 0, name: (nm && (nm[1] || nm[2])) || null });
  });
  /** does a line between a and b close a block at or outside `ind`? */
  const closes = (a, b, ind) => {
    for (let n = a; n < b; n++) {
      const l = lines[n];
      if (!l.trim()) continue;
      const lead = l.length - l.trimStart().length;
      if (lead <= ind && /^[)}\]]/.test(l.trimStart())) return true;
    }
    return false;
  };
  /** the innermost function still OPEN at this line (null = module level) */
  const enclosing = (ln) => {
    for (let k = headers.length - 1; k >= 0; k--) {
      const h = headers[k];
      if (h.line > ln || !h.open) continue;      // below us, or a one-line declaration
      if (closes(h.line + 1, ln, h.indent)) continue;  // it already closed
      return h;
    }
    return null;
  };
  GATED_RE.lastIndex = 0;
  const gates = [...code.matchAll(GATED_RE)].map((m) => m.index);
  const helpers = new Set();
  for (const g of gates) { const h = enclosing(lineNo(g)); if (h && h.name) helpers.add(h.name); }
  const anchors = gates.map((i) => ({ i, kind: 'gate' }));
  for (const nm of helpers) for (const m of code.matchAll(new RegExp('\\b' + nm + '\\s*\\(', 'g'))) if (!gates.includes(m.index)) anchors.push({ i: m.index, kind: nm + '()' });
  anchors.sort((a, b) => a.i - b.i);
  const gateFor = (site) => {
    let via = null;
    for (const a of anchors) {
      if (a.i >= site) break;
      const h = enclosing(lineNo(a.i));
      if (!closes(lineNo(a.i) + 1, lineNo(site), h ? h.indent : 0)) via = a;
    }
    return via ? { kind: via.kind, line: lineNo(via.i) + 1 } : null;
  };
  return { gateFor, lineNo, helpers: [...helpers] };
}

/** The census, parameterized by ROOT so the negative control can run the very
 *  same code over a scratch tree (a census that cannot be driven over a tree
 *  with a known offender is a census nobody has ever seen go red).
 *  One row PER SITE: {file, prim, line, gated, via}. */
function censusOver(root, files) {
  const hits = [];
  for (const f of files) {
    let src = '';
    try { src = textAt(root, f); } catch { continue; }
    const code = stripLineComments(src);
    const S = gateScopes(code);
    for (const p of PRIMITIVES) {
      p.re.lastIndex = 0;
      for (const m of code.matchAll(p.re)) {
        const via = S.gateFor(m.index);
        hits.push({ file: f, prim: p.id, line: S.lineNo(m.index) + 1, gated: !!via, via: via ? `${via.kind}@${via.line}` : null });
      }
    }
  }
  return hits;
}
/** The RETIRED, file-granular verdict — kept as a live negative control so the
 *  blind spot r3 closed can be demonstrated rather than described. */
function fileGranularGated(root, f) {
  try { return new RegExp(GATED_RE.source).test(textAt(root, f)); } catch { return false; }
}
/** lane owner-press-attended r2 — a DEFERRED attended reason: declared in SPEND_REASONS before its ONE site exists (a
 *  census row, never prose). §2 lets it have no producer; §2b goes red the day its site exists while the row stands. */
const DEFERRED_ATTENDED = [
  { reason: 'held-deliver', door: 'POST /api/channels/reach-requests/:id/:verdict (decideRequest → decideHeld → flushScope / flushPending → wakeNow; a person door under personVerdict there)', wiredIn: 'wake-approve-card r10' },
];
const WO = require(path.join(REPO, 'src/write-origin.js'));
// §2c THE GUARD IS WIRED WHERE THE HUB BUILDS IT (B-02a3 cure, 主开发 12:19Z). §2 judges a site by the SHAPE of its gate call
// (`spendGuard.authorize(` in scope) — never by whether the guard that call reaches was ever handed in. The B-02a3 door at
// 869399b5c read its guard through a default getter that found nothing (`require('./usage-pool-engine.js').spendGuard`: the
// module exports only `create`), so in production every press was refused «not wired» while §2 called its site GATED. DERIVED:
// every function that TAKES the guard as a destructured parameter named authorizeSpend / getSpendGuard / spendGuard (a
// constructor: `function create({…})`, `function mountRoutes({…})`, `function setupAgentRoutes({…})`, any name) is handed it at
// EVERY site that builds it — a `require(…/<module>).<fn>(` call, or a call of the name a `const { <fn> } = require(…/<module>)`
// binds, anywhere in server.js or src/: the parameter is a key (or a shorthand) of that call's own argument, and a key whose value
// is the literal null / undefined / `() => null` hands NOTHING. THE READER'S MUST (the cure's read): the census read only the code
// its comment stripper left, and that stripper took a `/*` INSIDE a line comment (`// … /api/file/serve/* etc.`) for a block
// comment — server.js lines 143–579 were invisible to it (14 construction sites). stripJsComments below knows strings, template
// literals and regex literals: run over every tracked .js of src/, server.js, data/bin and scripts/, esbuild's whitespace-minified
// output was byte-identical before and after it (2359 files) — it removes comments and nothing else. Only files whose RAW text
// names a guard parameter (a taker) or a taker's module (a site) are stripped: stripping only removes text.
const GUARD_PARAMS = ['authorizeSpend', 'getSpendGuard', 'spendGuard'];
const GUARD_HINT = /authorizeSpend|getSpendGuard|spendGuard/;
function matchClose(t, open, a, b) { let d = 0; for (let j = open; j < t.length; j++) { if (t[j] === a) d++; else if (t[j] === b) { d--; if (d === 0) return j; } } return -1; }
/** A JavaScript text with its comments blanked (each comment byte a space, every line break kept): strings, template
 *  literals (with their `${…}` parts) and regex literals pass through untouched, so a `//` or `/*` inside one is never a comment. */
function stripJsComments(src) {   // (its locals never share a name with a clock span of this suite: the wall-clock census flows by NAME — an `end` here once flooded it, 2.369.412's first checkpoint)
  let out = '', i = 0, prevSig = '';
  const n = src.length, tpl = [];   // tpl: the brace depth of each open template `${…}`
  const blank = (x) => x.replace(/[^\n]/g, ' ');
  const regexMayStart = () => {
    if (!prevSig || /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig)) return true;
    const m = out.slice(-24).match(/([A-Za-z_$][\w$]*)\s*$/);   // the word before the slash, from the tail only
    return !!(m && /^(return|typeof|case|in|of|delete|void|throw|new|instanceof|yield|await|else|do)$/.test(m[1]));
  };
  const templateFrom = (j) => {   // j: the first char inside a template; to its upto or its next `${`
    while (j < n && src[j] !== '`') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '$' && src[j + 1] === '{') return { upto: j + 2, open: true }; j++; }
    return { upto: j + 1, open: false };
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i), upto = e < 0 ? n : e; out += blank(src.slice(i, upto)); i = upto; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2), upto = e < 0 ? n : e + 2; out += blank(src.slice(i, upto)); i = upto; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1; out += src.slice(i, j + 1); i = j + 1; prevSig = c; continue; }
    if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === 0)) {
      if (c === '}') tpl.pop();
      const r = templateFrom(i + 1); out += src.slice(i, r.upto); i = r.upto;
      if (r.open) { tpl.push(0); prevSig = '{'; } else prevSig = '`';
      continue;
    }
    if (tpl.length && c === '{') tpl[tpl.length - 1]++; else if (tpl.length && c === '}') tpl[tpl.length - 1]--;
    if (c === '/' && regexMayStart()) {   // a regex literal ends on its own line, its classes respected
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
      if (j < n && src[j] === '/') { out += src.slice(i, j + 1); i = j + 1; prevSig = 'x'; continue; }
    }
    out += c; if (!/\s/.test(c)) prevSig = c; i++;
  }
  return out;
}
const STRIPPED = new Map();
const stripCached = (raw) => { let x = STRIPPED.get(raw); if (x === undefined) { x = stripJsComments(raw); STRIPPED.set(raw, x); } return x; };
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SCANNED = new Map();   // a raw text → what one cheap pass over it found (every control hands the same strings back)
function scanOf(raw, stemRe) {
  let x = SCANNED.get(raw);
  if (!x) { x = { takes: GUARD_HINT.test(raw), stems: new Map() }; SCANNED.set(raw, x); }
  if (stemRe && !x.stems.has(stemRe.source)) x.stems.set(stemRe.source, new Set([...raw.matchAll(stemRe)].map((m) => m[1])));
  return x;
}
function guardWiring(texts) {
  const takers = [], sites = [], unwired = [];
  for (const f of Object.keys(texts).filter((x) => scanOf(texts[x]).takes)) {
    const t = stripCached(texts[f]);
    const heads = [];   // [name, the index of its destructured parameter's «{»]
    for (const m of t.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*\{/g)) heads.push([m[1], m.index + m[0].length - 1]);
    // (the verdict's should) an ARROW or a function EXPRESSION bound to a name — `const create = ({ spendGuard }) => …` — counts
    // when its destructured parameter list closes into `) =>` / `) {`; and a CLASS whose constructor destructures the guard (its
    // sites: `new X(` — a call of the bound name, read below like any other)
    for (const m of t.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*[\w$]*\s*)?\(\s*\{/g)) {
      const open = m.index + m[0].length - 1, close = matchClose(t, open, '{', '}');
      if (close > 0 && /^\s*(=\s*\{\s*\}\s*)?\)\s*(=>|\{)/.test(t.slice(close + 1, close + 40))) heads.push([m[1], open]);
    }
    for (const m of t.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)[^{]*\{/g)) {
      const b0 = m.index + m[0].length - 1, b1 = matchClose(t, b0, '{', '}'), body = t.slice(b0, b1 > 0 ? b1 : undefined), c = /\bconstructor\s*\(\s*\{/.exec(body);
      if (c) heads.push([m[1], b0 + c.index + c[0].length - 1]);
    }
    for (const [fn, open] of heads) {
      const close = matchClose(t, open, '{', '}');
      if (close < 0) continue;
      const params = t.slice(open + 1, close);
      for (const p of GUARD_PARAMS) if (new RegExp(`(^|[\\s,])${p}\\s*(=|,|:|$)`).test(params)) takers.push({ f, fn, p });
    }
  }
  const stemOf = (f) => f.split('/').pop().replace(/\.js$/, '');
  const stemRe = takers.length ? new RegExp(`/(${[...new Set(takers.map((tk) => reEsc(stemOf(tk.f))))].join('|')})(?:\\.js)?['"]`, 'g') : null;
  for (const tk of takers) {
    const stem = stemOf(tk.f);
    const req = `require\\(\\s*['"][^'"]*/${reEsc(stem)}(?:\\.js)?['"]\\s*\\)`;
    let n = 0;
    for (const f of Object.keys(texts).filter((x) => scanOf(texts[x], stemRe).stems.get(stemRe.source).has(stem))) {
      const t = stripCached(texts[f]), calls = [];
      for (const m of t.matchAll(new RegExp(`${req}\\.${reEsc(tk.fn)}\\(`, 'g'))) calls.push(m.index + m[0].length - 1);
      for (const m of t.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${req}\\s*[;,\\n]`, 'g'))) {   // const SH = require(…); SH.<fn>(
        for (const c of t.matchAll(new RegExp(`(^|[^.\\w$])${reEsc(m[1])}\\.${reEsc(tk.fn)}\\(`, 'g'))) calls.push(c.index + c[0].length - 1);
      }
      for (const m of t.matchAll(new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${req}`, 'g'))) {
        const b = m[1].split(',').map((x) => x.trim()).find((x) => x === tk.fn || new RegExp(`^${reEsc(tk.fn)}\\s*:`).test(x));
        if (!b) continue;
        const alias = b.includes(':') ? b.split(':')[1].trim() : tk.fn;
        for (const c of t.matchAll(new RegExp(`(^|[^.\\w$])${reEsc(alias)}\\(`, 'g'))) {
          if (/function\s*$/.test(t.slice(Math.max(0, c.index - 12), c.index + c[1].length))) continue;   // its own definition
          calls.push(c.index + c[0].length - 1);
        }
      }
      for (const open of calls) {
        const close = matchClose(t, open, '(', ')');
        const args = close > open ? t.slice(open + 1, close) : '';
        const keyed = new RegExp(`(^|[{,\\s])${tk.p}\\s*(:|,|\\})`).test(args);
        const empty = new RegExp(`(^|[{,\\s])${tk.p}\\s*:\\s*(null|undefined|\\(\\s*\\)\\s*=>\\s*(null|undefined))\\s*[,}]`).test(args)
          || new RegExp(`(^|[{,\\s])${tk.p}\\s*:\\s*(\\(\\s*\\)\\s*=>\\s*)?require\\([^)]*\\)\\s*\\.\\s*(${GUARD_PARAMS.join('|')})\\b`).test(args);   // the 869399b5c getter, moved to a site
        sites.push({ ...tk, at: f, wired: keyed && !empty }); n++;
        if (!keyed || empty) unwired.push(`${tk.f} ${tk.fn}({${tk.p}}) built at ${f} ${empty ? 'handed nothing' : 'without it'}`);
      }
    }
    if (!n) unwired.push(`${tk.f} ${tk.fn}({${tk.p}}) is built nowhere a census can read`);
  }
  return { takers, sites, unwired };
}
let TRACKED = null;   // r1563: git asked ONCE a run; a failure is kept and thrown again at every call (each caller keeps its own catch)
function trackedServerSource() {
  if (!TRACKED) {
    try {
      const out = execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'src', 'server.js', 'data/bin'], { env: GIT_ENV, maxBuffer: 64 * 1024 * 1024 }).toString();
      TRACKED = { files: out.split('\0').filter(Boolean)
        .filter((f) => f.endsWith('.js') && !f.startsWith('src/lib/')) };  // src/lib = the browser; it cannot spend
    } catch (e) { TRACKED = { err: e }; }
  }
  if (TRACKED.err) throw TRACKED.err;
  return TRACKED.files.slice();
}
{
  let files = [];
  let gitOk = true;
  try { files = trackedServerSource(); } catch (e) { gitOk = false; console.log('  · SKIP: git could not list the tracked source (' + e.message.split('\n')[0] + ')'); }
  if (gitOk) {
    ok('§2 census scope is non-vacuous and covers the known producers', files.length > 50
      && ['server.js', 'src/server/auto-resume.js', 'src/server/conversation-deliver.js', 'src/agent-routes.js', 'src/server/usage-pool-engine.js'].every((f) => files.includes(f)),
      `${files.length} tracked server-side files`);
    const hits = censusOver(REPO, files);
    const allowKey = (h) => h.file + '#' + h.prim;
    const allowSet = new Set(ALLOW.map((a) => a.file + '#' + a.prim));
    // lane owner-press-attended: the ATTENDED column — PER SITE (r2: it was per FILE, so stash-handover.js:334, the gated
    // stash-retry auto site, printed «attended: stash-handover»): the attended reasons spelled on the site's own line, or on
    // the `const paid = …` line(s) its `...paid` spreads
    const attendedAt = (h) => {
      const lines = read(h.file).split('\n');
      const at = h.line - 1;
      const own = lines[at] || '';
      let text = own;
      if (/\.\.\.paid\b/.test(own)) for (let k = at - 1; k >= Math.max(0, at - 8); k--) if (/\bconst paid = /.test(lines[k])) { text += '\n' + lines[k]; break; }
      return Object.keys(A.SPEND_REASONS).filter((r) => A.SPEND_REASONS[r].attended === true && text.includes(`spendReason: '${r}'`));
    };
    console.log('    producer SITES found (' + hits.length + ' in ' + new Set(hits.map((h) => h.file)).size + ' files):');
    for (const h of [...hits].sort((a, b) => (a.file + a.prim).localeCompare(b.file + b.prim)))
      console.log(`      ${h.gated ? 'GATED   ' : allowSet.has(allowKey(h)) ? 'allowed ' : 'UNWIRED '} ${h.file}:${h.line}  [${h.prim}]${h.via ? '  ← ' + h.via : ''}${attendedAt(h).length ? '  · attended: ' + attendedAt(h).join(', ') : ''}`);
    const unwired = hits.filter((h) => !h.gated && !allowSet.has(allowKey(h))).map((h) => `${h.file}:${h.line} [${h.prim}]`);
    ok('§2 every SITE that can open an unattended turn is under the authorizer (or allowlisted WITH a reason)', unwired.length === 0, unwired.join(', '));
    const deadAllow = ALLOW.filter((a) => !hits.some((h) => h.file === a.file && h.prim === a.prim));
    ok('§2 no dead allowlist entry (a row that matches nothing hides the next real producer)', deadAllow.length === 0, deadAllow.map((a) => a.file + '#' + a.prim).join(', '));
    ok('§2 every allowlist row states WHY, and names the ONE primitive it excuses', ALLOW.every((a) => typeof a.why === 'string' && a.why.length > 20 && PRIMITIVES.some((p) => p.id === a.prim)));
    // THE PAIR KEY IS LOAD-BEARING ON THE REAL TREE, not only on a fixture:
    // src/agent-routes.js holds a GATED site (the Stop nudge) and an allowed
    // one (the forward to the ladder), and src/server/conversation-deliver.js
    // the same. Under the retired file-granular verdict both files answered one
    // word for every site in them — which is the defect this round closed.
    const mixedFiles = [...new Set(hits.map((h) => h.file))]
      .filter((f) => hits.some((h) => h.file === f && h.gated) && hits.some((h) => h.file === f && !h.gated));
    ok('§2 …and files holding BOTH a gated and a non-gated site are reported per site (' + mixedFiles.join(', ') + ')',
      mixedFiles.length >= 2 && mixedFiles.every((f) => fileGranularGated(REPO, f)), mixedFiles.join(', '));
    const gatedFiles = [...new Set(hits.filter((h) => h.gated).map((h) => h.file))];
    // THE REASON TABLE, BOTH WAYS: every reason a producer passes must be
    // declared (an undeclared one is refused at runtime — §1 — so it would be a
    // silently dead producer), and every declared reason must have a producer
    // (a spare slot is what the next producer slides into without a decision).
    const passed = new Set();
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(/(?:spendReason|reason):\s*'([a-z-]+)'/g)) if (A.SPEND_REASONS[m[1]] || /^(auto-resume|stop-nudge|job-notification|peer-message|codex-reset-credit)$/.test(m[1])) passed.add(m[1]);
    }
    const undeclared = [...passed].filter((r) => !A.SPEND_REASONS[r]);
    ok('§2 every spend reason a producer passes is DECLARED', undeclared.length === 0, undeclared.join(', '));
    const unused = Object.keys(A.SPEND_REASONS).filter((r) => !passed.has(r) && !DEFERRED_ATTENDED.some((d) => d.reason === r));
    ok('§2 …and every DECLARED reason has a producer — or a DEFERRED census row naming the lane that wires it (' + [...passed].sort().join(', ') + '; deferred: ' + DEFERRED_ATTENDED.map((d) => `${d.reason} → ${d.wiredIn}`).join(', ') + ')', unused.length === 0, 'declared with no producer: ' + unused.join(', '));
    const stash334 = hits.find((h) => h.file === 'src/server/stash-handover.js' && /spendReason: 'stash-retry'/.test(read(h.file).split('\n')[h.line - 1] || ''));
    const stash335 = hits.find((h) => h.file === 'src/server/stash-handover.js' && /spendReason: 'stash-handover'/.test(read(h.file).split('\n')[h.line - 1] || ''));
    ok('§2 the attended column is PER SITE: the hand-over file\'s gated stash-retry site prints no attended reason, its press site prints stash-handover; the groups site reads its `const paid` line', !!stash334 && !!stash335 && attendedAt(stash334).length === 0 && attendedAt(stash335).join() === 'stash-handover'
      && hits.some((h) => h.file === 'src/server/groups-engine.js' && attendedAt(h).join() === 'owner-group-wake'), JSON.stringify({ s334: stash334 && attendedAt(stash334), s335: stash335 && attendedAt(stash335) }));

    { // §2c the guard is wired where the hub builds it — and its RED control is the B-02a3 door as 869399b5c built it
      const texts = Object.fromEntries(files.map((f) => [f, read(f)]));
      const W = guardWiring(texts);
      const names = [...new Set(W.takers.map((x) => x.f.split('/').pop()))].sort();
      ok(`§2c every function that TAKES the spend guard is handed it at every site that builds it (${W.sites.length} sites: ${names.join(', ')})`,
        W.unwired.length === 0 && ['stash-handover.js', 'conversation-deliver.js', 'worker-dispatch.js', 'agent-routes.js'].every((x) => names.includes(x)) && W.sites.length >= 6, W.unwired);
      const sj = texts['server.js'], key = "getSpendGuard: () => spendGuard";
      const kept = stripJsComments(sj || '');
      ok('§2c the census reads server.js WHOLE: its stripper keeps every line, and the constructions a `/*` inside a line comment once hid from it (the usage engine, the boot restore) are read',
        !!sj && kept.split('\n').length === sj.split('\n').length && kept.includes("require('./src/server/usage-pool-engine.js').create(") && kept.includes("require('./src/server/boot-restore.js').create("), { lines: sj && sj.split('\n').length, kept: kept.split('\n').length });
      const probe = "// a route like /api/file/serve/* etc.\nconst d = require('./stash-handover.js').create({ activeSessions });\n// the end */\n";
      const Wp = guardWiring({ ...texts, 'src/server/zz-census-probe.js': probe });
      ok('§2c RED CONTROL (the blind span): an unwired build after a line comment that holds «/*» is named', Wp.unwired.some((u) => /stash-handover\.js create\(\{getSpendGuard\}\) built at src\/server\/zz-census-probe\.js without it/.test(u)), Wp.unwired);
      const W3 = guardWiring({ ...texts, 'server.js': sj.replace(key, 'getSpendGuard: () => null') });
      ok('§2c RED CONTROL: a key that hands NOTHING (`getSpendGuard: () => null`) is named', W3.unwired.some((u) => /stash-handover\.js create\(\{getSpendGuard\}\) built at server\.js handed nothing/.test(u)), W3.unwired);
      const W5 = guardWiring({ ...texts, 'server.js': sj.replace(key, "getSpendGuard: () => require('./src/server/usage-pool-engine.js').spendGuard") });
      ok('§2c RED CONTROL: the 869399b5c getter moved to the site (`() => require(…usage-pool-engine.js).spendGuard` — a module export, never the instance) hands nothing', W5.unwired.some((u) => /stash-handover\.js create\(\{getSpendGuard\}\) built at server\.js handed nothing/.test(u)), W5.unwired);
      const probeVar = "const SH = require('./stash-handover.js');\nconst d = SH.create({ activeSessions });\n";
      const Wv = guardWiring({ ...texts, 'src/server/zz-census-probe.js': probeVar });
      ok('§2c RED CONTROL: a module bound to a name (`const SH = require(…); SH.create(…)`) is read — built there without the guard, it is named', Wv.unwired.some((u) => /stash-handover\.js create\(\{getSpendGuard\}\) built at src\/server\/zz-census-probe\.js without it/.test(u)), Wv.unwired);
      const Wn = guardWiring({ ...texts, 'src/server/zz-census-taker.js': 'function create({ activeSessions, spendGuard = null }) { return { activeSessions, spendGuard }; }\nmodule.exports = { create };\n' });
      ok('§2c RED CONTROL: a function that takes the guard and is built nowhere the census can read is named', Wn.unwired.some((u) => /zz-census-taker\.js create\(\{spendGuard\}\) is built nowhere a census can read/.test(u)), Wn.unwired);
      const Wa = guardWiring({ ...texts, 'src/server/zz-census-arrow.js': 'const create = ({ activeSessions, spendGuard = null }) => ({ activeSessions, spendGuard });\nmodule.exports = { create };\n',
        'src/server/zz-census-probe.js': "const d = require('./zz-census-arrow.js').create({ activeSessions });\n" });
      ok('§2c RED CONTROL (the verdict\'s should): an ARROW constructor that takes the guard (`const create = ({ spendGuard }) => …`), built without it, is named', Wa.unwired.some((u) => /zz-census-arrow\.js create\(\{spendGuard\}\) built at src\/server\/zz-census-probe\.js without it/.test(u)), Wa.unwired);
      const Wk = guardWiring({ ...texts, 'src/server/zz-census-class.js': 'class Door {\n  constructor({ activeSessions, getSpendGuard = () => null }) { this.g = getSpendGuard; }\n}\nmodule.exports = { Door };\n',
        'src/server/zz-census-probe.js': "const { Door } = require('./zz-census-class.js');\nconst d = new Door({ activeSessions });\n" });
      ok('§2c RED CONTROL (the verdict\'s should): a CLASS whose constructor takes the guard, built by `new` without it, is named', Wk.unwired.some((u) => /zz-census-class\.js Door\(\{getSpendGuard\}\) built at src\/server\/zz-census-probe\.js without it/.test(u)), Wk.unwired);
      const keyAR = 'serverSetting, spendGuard, scheduleCtxSync';
      if (sj.split(keyAR).length !== 2) throw new Error('the anchor of the control «the agent routes unwired» is not in server.js once');
      const W4 = guardWiring({ ...texts, 'server.js': sj.replace(keyAR, 'serverSetting, scheduleCtxSync') });
      ok('§2c RED CONTROL: a DESTRUCTURED constructor is read too — server.js calling setupAgentRoutes (bound by `const { setupAgentRoutes } = require(…)`) without the guard is named', W4.unwired.some((u) => /agent-routes\.js setupAgentRoutes\(\{spendGuard\}\) built at server\.js without it/.test(u)), W4.unwired);
      if (!sj || !sj.includes(key)) throw new Error('the anchor of the control «the B-02a3 door unwired» is not in server.js');
      const W2 = guardWiring({ ...texts, 'server.js': sj.replace(key, 'getSpendGuardX: () => spendGuard') });
      ok('§2c RED CONTROL: server.js building the stash door without its guard (869399b5c) is named unwired', W2.unwired.some((u) => /stash-handover\.js create\(\{getSpendGuard\}\) built at server\.js without it/.test(u)), W2.unwired);
    }
    ok('§2 the four wired consumers are all in the GATED set', ['src/server/auto-resume.js', 'src/server/conversation-deliver.js', 'src/agent-routes.js', 'src/server/usage-pool-engine.js'].every((f) => gatedFiles.includes(f)), gatedFiles.join(', '));
    // THE OWNER'S RULING (2026-09-27 — "告知agent发生了打断，交还时提醒它重新运行"): the takeover now TELLS the agent and the
    // handback reminds it to re-run — and neither grows a producer: browser-handback.js keeps its ONE ladder site (the
    // explicit handback, the re-run sentence rides its text), and the takeover moment is the ladder's DISPLAY-only card
    // path + a zero-spend notice (no rung, no stash, no authorizer — nothing that can open a turn)
    {
      const bh = hits.filter((h) => h.file === 'src/server/browser-handback.js');
      const bsrc = read('src/server/browser-handback.js');
      const tbody = bsrc.slice(bsrc.indexOf('  function announceTakeover('), bsrc.indexOf('  /** Which browser the user took'));
      ok('§2 the takeover tells for FREE: browser-handback.js still holds exactly ONE ladder site (the explicit handback — the census did not grow a producer) and the takeover moment calls no rung, no stash and no authorizer — only the display-only card path and a zero-spend notice',
        bh.length === 1 && bh[0].prim === 'deliver-ladder' && tbody.length > 400 && !/deliverToConversation|stashFor|authorizeSpend|spendReason/.test(tbody) && /const card = \{ fromName: FROM_NAME, text, kind: 'notification' \};/.test(tbody) && /emitCard\(sess\.s, card\)/.test(tbody) && /deliver\.emitPeerCard\(cid, card\)/.test(tbody) && /queueNotice\(sess, T\.takeoverNotice\(/.test(tbody)
          && /emitCard: \(session, card\) => require\('\.\.\/normalizers'\)\.feedPeerCard\(session, card\)/.test(read('src/server/mounts-plugins-wiring.js')),
        JSON.stringify(bh.map((h) => h.file + ':' + h.line + ' ' + h.prim)));
      // lane browser-resume B (§3.9, the owner's ruling 2): "Hand back and continue" — the between-turns hand-back files ONE
      // stash entry + ONE display-only card and NEVER opens a turn: no rung, no authorizer, no spend reason in its body; the
      // announcer's handback listener RETURNS before announce() for cause `continue` (no turn, no notice); the census above
      // still counts ONE ladder site in this file (the explicit handback)
      const cbody = bsrc.slice(bsrc.indexOf('  async function continueFor('), bsrc.indexOf('  let unsubInput = null'));
      ok('§2 LANE BROWSER-RESUME: "Hand back with a note" is FREE — continueFor holds no rung, no authorizer, no spend reason (only the stash + the display-only card), the announcer returns before announce() for `continue`, and browser-handback.js still has exactly ONE ladder site',
        bh.length === 1 && cbody.length > 400 && !/deliverToConversation|authorizeSpend|spendReason/.test(cbody) && /deliver\.stashFor\(cid, \{ source: 'agent', kind: 'notification', fromName: FROM_NAME, ref: id, text \}\)/.test(cbody) && /emitCard\(sess\.s, card\)/.test(cbody)
          && /if \(ev\.cause === 'continue'\) return;\n      announce\(ev\)/.test(bsrc) && require(path.join(REPO, 'src/browser-takeover.js')).announceVerdict({ cause: 'continue', announceIdle: true }).deliver === false,
        JSON.stringify({ sites: bh.length, body: cbody.length }));
    }

    // THE DESIGN WINDOW'S COMMENT (lane design-chrome L4 B③): the user's click on an artboard element + their words go
    // down THE typing sender (src/server/user-input.js — the owner's own message, never counted) or into the durable
    // stash; the engine names no spend reason, asks no authorizer and never calls the ladder — a design comment cannot
    // open a turn by itself, and the census finds no producer site in it
    {
      const dsrc = read('src/server/design-engine.js');
      ok('§2 LANE DESIGN-CHROME: the design comment opens no turn nobody typed — design-engine.js holds no ladder call, no authorizer, no spend reason and no frame formatter; its comment goes to the typing sender (sendUserInput, origin design-comment) or the stash (stashFor, source design-comment), and the census finds no producer site in it but that typing sender (its typed-send row is an ALLOW: the owner\'s own click — lane worker-dispatch\'s census, composed at the 2.369.202 integration)',
        !/deliverToConversation|authorizeSpend|spendReason|formatChatInput|peerPost|postToInbox/.test(dsrc)
          && /sendUserInput\(sessionId, line, \{ msgId: now\(\) \+ '-design', origin: 'design-comment', door: 'enter' \}\)/.test(dsrc)   // + the conversation's own Enter door (lane reply-door-follows-enter) — still the typing sender, the owner's words
          && /deliver\.stashFor\(cid, \{ source: 'design-comment', kind: 'peer', fromName: DESIGN_COMMENT_FROM, text: line \}\)/.test(dsrc)
          && hits.filter((h) => h.file === 'src/server/design-engine.js' || h.file === 'src/routes/design.js').every((h) => h.file === 'src/server/design-engine.js' && h.prim === 'typed-send' && ALLOW.some((a) => a.file === h.file && a.prim === h.prim)),
        JSON.stringify(hits.filter((h) => /design/.test(h.file))));
    }

    // lane automation-verbs (design q-046 L2, decision 5): an automation key's conversations.open is a conversation nobody
    // typed into — conversation-ops' ONE headless create sits under the authorizer (reason automation-open, the key its
    // identity, asked BEFORE the spawn), and a MUTANT copy without the call reads UNWIRED
    {
      const csrc = read('src/server/conversation-ops.js');
      const co = hits.filter((h) => h.file === 'src/server/conversation-ops.js');
      ok('§2 LANE AUTOMATION-VERBS: conversation-ops.js holds exactly ONE headless-open site and it is GATED (spendGuard.authorize, reason automation-open, before the spawn)',
        co.length === 1 && co[0].prim === 'headless-open' && co[0].gated === true && /spendGuard\.authorize\(\{ reason: 'automation-open', identity/.test(csrc), JSON.stringify(co));
      const from = "const g = spendGuard.authorize({ reason: 'automation-open', identity, sessionName: v.spec.name || null });";
      const mutDir = tmpdir('vs-spend-convops-');
      fs.mkdirSync(path.join(mutDir, 'src', 'server'), { recursive: true });
      fs.writeFileSync(path.join(mutDir, 'src/server/conversation-ops.js'), editAnchor(csrc, from, 'const g = { ok: true, hold: null };', "src/server/conversation-ops.js"));
      const mh = censusOver(mutDir, ['src/server/conversation-ops.js']);
      ok('§2 …MUTANT: the same file without the authorizer call reads its headless open UNWIRED', csrc.includes(from) && mh.length === 1 && mh[0].gated === false, JSON.stringify(mh));
    }

    // NEGATIVE CONTROL: a synthetic producer in a scratch tree.
    const scratch = tmpdir('vs-spend-census-');
    fs.mkdirSync(path.join(scratch, 'src', 'server'), { recursive: true });
    const producer = "'use strict';\nfunction notifyOwner(session, text) {\n  const { stdinPayload } = adapter.formatChatInput(text, 'x');\n  session.pty.write(stdinPayload + '\\n');\n}\nmodule.exports = { notifyOwner };\n";
    fs.writeFileSync(path.join(scratch, 'src/server/new-producer.js'), producer);
    const cHits = censusOver(scratch, ['src/server/new-producer.js']);
    ok('§2 NEGATIVE CONTROL: a NEW producer that opens a turn is CAUGHT by the same code, unwired',
      cHits.length === 1 && cHits[0].prim === 'user-frame' && cHits[0].gated === false, JSON.stringify(cHits));
    fs.writeFileSync(path.join(scratch, 'src/server/new-producer.js'),
      producer.replace('function notifyOwner(session, text) {', 'function notifyOwner(session, text) {\n  if (!authorizeSpend({ reason: \'job-notification\', session }).ok) return false;'));
    const cHits2 = censusOver(scratch, ['src/server/new-producer.js']);
    ok('§2 POSITIVE CONTROL: the same producer, wired to the authorizer, is clean',
      cHits2.length === 1 && cHits2[0].gated === true, JSON.stringify(cHits2));
    // r2's OWN blind spot, as a permanent control: a file that BUILDS the guard
    // and holds a producer that does not ask it must be caught. The round-1
    // regex matched the word `spendGuard` anywhere, so this file read GATED and
    // the assert below ("the wired consumers are all in the GATED set") was a
    // false green about the one producer that was in fact dead in production.
    fs.writeFileSync(path.join(scratch, 'src/server/new-producer.js'),
      "'use strict';\nconst spendGuard = require('./spend-guard.js').create({ dataDir: 'x' });\n"
      + "function notifyOwner(session, text) {\n  const { stdinPayload } = adapter.formatChatInput(text, 'x');\n  session.pty.write(stdinPayload + '\\n');\n}\nmodule.exports = { notifyOwner, spendGuard };\n");
    const cHits3 = censusOver(scratch, ['src/server/new-producer.js']);
    ok('§2 NEGATIVE CONTROL: a file that CONSTRUCTS the guard but never ASKS it is NOT gated (r2: this is how the reset credit hid)',
      cHits3.length === 1 && cHits3[0].gated === false, JSON.stringify(cHits3));
    ok('§2 …and the retired regex would have called that same file gated (the blind spot, kept as a control)',
      /authorizeSpend|spendGuard|spend-authorizer/.test(fs.readFileSync(path.join(scratch, 'src/server/new-producer.js'), 'utf8')));

    // ── r3's OWN BLIND SPOT: ONE gated producer + ONE new ungated producer in
    // the SAME file. Under the file-granular verdict this file answered GATED
    // and the new `formatChatInput` producer was reported nowhere — the exact
    // shape a future producer takes when it lands in one of the four files that
    // already ask the gate.
    const mixed = path.join(scratch, 'src/server/mixed.js');
    fs.writeFileSync(mixed, [
      "'use strict';",
      'function stopArbiter(s) {',
      "  if (!spendGuard.authorize({ reason: 'stop-nudge', session: s }).ok) return null;",
      "  return { block: true, reason: 'report your progress' };",
      '}',
      'function notifyOwner(session, text) {',
      "  const { stdinPayload } = adapter.formatChatInput(text, 'x');",
      "  session.pty.write(stdinPayload + '\\n');",
      '}',
      'module.exports = { stopArbiter, notifyOwner };',
    ].join('\n'));
    const mHits = censusOver(scratch, ['src/server/mixed.js']);
    const mGated = mHits.filter((h) => h.gated).map((h) => h.prim);
    const mUnwired = mHits.filter((h) => !h.gated).map((h) => h.prim);
    ok('§2 NEGATIVE CONTROL (r3): a NEW ungated producer beside a gated one in the SAME file is reported UNWIRED',
      mUnwired.length === 1 && mUnwired[0] === 'user-frame', JSON.stringify(mHits));
    ok('§2 …while the correctly gated site in that same file still reads GATED (the fix is precision, not a blanket refusal)',
      mGated.length === 1 && mGated[0] === 'stop-nudge', JSON.stringify(mHits));
    ok('§2 …and the RETIRED file-granular verdict calls that whole file gated (the blind spot, reproduced not described)',
      fileGranularGated(scratch, 'src/server/mixed.js') === true);

    // A gate that exists only in a JSDoc block is a MENTION. r2 made the regex
    // call-shaped; the input it ran on still carried `@param deps.authorizeSpend
    // (id, session, identity) => …`, which IS call-shaped — so src/server/
    // auto-resume.js would have read GATED even with its real gate deleted.
    fs.writeFileSync(path.join(scratch, 'src/server/doc-only.js'), [
      "'use strict';",
      '/**',
      ' * @param deps.authorizeSpend (id, session, identity) => {ok, why}',
      ' *        THE SPEND CEILING — every producer must ask it.',
      ' */',
      'function notifyOwner(session, text) {',
      "  const { stdinPayload } = adapter.formatChatInput(text, 'x');",
      "  session.pty.write(stdinPayload + '\\n');",
      '}',
      'module.exports = { notifyOwner };',
    ].join('\n'));
    const dHits = censusOver(scratch, ['src/server/doc-only.js']);
    ok('§2 NEGATIVE CONTROL (r3): a gate that exists only in a JSDoc block does not gate anything',
      dHits.length === 1 && dHits[0].gated === false, JSON.stringify(dHits));
    ok('§2 …and WITHOUT comment-stripping that same file reads gated (why the census blanks whole-line comments)',
      fileGranularGated(scratch, 'src/server/doc-only.js') === true);
  }

  // THE GROUPS ENGINE'S ROW EXCUSES THE FORWARD, NOT A BYPASS (§22): a patched
  // copy of the real engine that posts into the CLI inbox itself — skipping the
  // ladder and therefore the authorizer inside it — must read UNWIRED, and the
  // allowlist row (keyed by file AND primitive) must not cover it.
  if (gitOk) {
    const scratch2 = tmpdir('vs-spend-groups-');
    fs.mkdirSync(path.join(scratch2, 'src', 'server'), { recursive: true });
    const real = read('src/server/groups-engine.js');
    fs.writeFileSync(path.join(scratch2, 'src/server/groups-engine.js'), editAnchor(real, 'deliver.deliverToConversation(', 'peerMsg.postToPeer(', "src/server/groups-engine.js"));
    const gHits = censusOver(scratch2, ['src/server/groups-engine.js']);
    const allowSet2 = new Set(ALLOW.map((a) => a.file + '#' + a.prim));
    const gUnwired = gHits.filter((h) => !h.gated && !allowSet2.has(h.file + '#' + h.prim));
    ok('§2 NEGATIVE CONTROL (groups): the real engine patched to post into the CLI inbox BESIDE the ladder is reported UNWIRED',
      gUnwired.length === 1 && gUnwired[0].prim === 'cli-inbox', JSON.stringify(gHits));
    const realHits = censusOver(REPO, ['src/server/groups-engine.js']);
    ok('§2 …while the real engine holds exactly ONE site, the allowlisted forward to the ladder',
      realHits.length === 1 && realHits[0].prim === 'deliver-ladder' && allowSet2.has('src/server/groups-engine.js#deliver-ladder'), JSON.stringify(realHits));
  }
  // WIRING PIN — the census proves a file ASKS; these prove server.js HANDS it
  // the real guard (an unwired dep degrades to "allow", which is the shape a
  // test harness needs and production must never have).
  const srv = read('server.js');
  ok('§2 WIRING: the engine constructs the ONE guard and server.js re-exports it',
    /spendGuard,/.test(srv) && /const spendGuard = require\('\.\/spend-guard\.js'\)\.create\(\{/.test(read('src/server/usage-pool-engine.js')));
  ok('§2 WIRING: auto-resume is created WITH authorizeSpend + noteSpend',
    /authorizeSpend: \(id, s, identity, o\) => spendGuard\.authorize\(\{ reason: 'auto-resume'/.test(srv) && /noteSpend: \(id, s, identity, hold\) => spendGuard\.note\(/.test(srv));
  // …and it FORWARDS the two halves r5 added, because dropping either is a
  // silent behaviour change: without `hold` on the wire the pre-gate PROBE
  // reserves a slot and the charging call refuses its own request (measured at
  // cap 1/hour: zero continues ever fire), and without `releaseSpend` a send
  // that fails keeps that slot booked for the hold's whole TTL.
  ok('§2 WIRING: …and it forwards the PROBE flag and the release half (r5)',
    /hold: !!\(o && o\.hold\)/.test(srv) && /releaseSpend: \(id, s, hold\) => spendGuard\.release\(\{ hold \}\)/.test(srv));
  ok('§2 WIRING: the delivery ladder is created WITH authorizeSpend + noteSpend + releaseSpend',
    /authorizeSpend: \(req\) => spendGuard\.authorize\(req\), noteSpend: \(rec\) => spendGuard\.note\(rec\), releaseSpend: \(rec\) => spendGuard\.release\(rec\)/.test(srv));
  ok('§2 WIRING: the agent routes (the Stop nudge lives there) receive the guard', /setupAgentRoutes\(\{[^)]*spendGuard,/.test(srv));
  // THE ENGINE'S OWN PRODUCER (r2). The other three consumers get the guard
  // handed to them by server.js and have a pin each; the codex reset credit
  // lives INSIDE the file that constructs it, so its pin is that it asks the
  // module-local object DIRECTLY — never an injected dep. That dep was the
  // defect: `create()` declared `authorizeSpend = null` and server.js never
  // passed it, so the gate was dead in production while a harness that DID pass
  // it kept §9(d) green.
  {
    const eng = read('src/server/usage-pool-engine.js');
    ok('§2 WIRING: the codex reset credit asks the module-local guard, not an injected dep',
      /spendGuard\.authorize\(\{ reason: 'codex-reset-credit'/.test(eng) && /spendGuard\.note\(\{ reason: 'codex-reset-credit'/.test(eng));
    ok('§2 …and the engine takes NO authorizeSpend/noteSpend deps any more (a gate depending on a dep nobody passes is nobody\'s gate)',
      !/authorizeSpend\s*=\s*null/.test(eng) && !/noteSpend\s*=\s*null/.test(eng));
    ok('§2 …and the guard the reset credit asks is the one this file constructs',
      eng.indexOf("require('./spend-guard.js').create({") > 0
      && eng.indexOf("require('./spend-guard.js').create({") < eng.indexOf("spendGuard.authorize({ reason: 'codex-reset-credit'"));
  }
  ok('§2 WIRING: the two callers of the ladder TYPE themselves (jobs ⇒ job-notification, agent messaging ⇒ peer-message)',
    /spendReason: 'job-notification'/.test(read('src/jobs.js')) && /spendReason: 'peer-message'/.test(read('src/agent-routes.js')));
  ok('§2 WIRING: the ledger is FLUSHED on the routine restart path (a debounced-only write hands the next boot a fresh hour)',
    // lane hub-loop-stalls commit 2 round 3 (law 2): the store writer's exit begins first — the signal noted, beginExit, the
    // rank-0 flush — so the spend guard's flush sits further from `function shutdown()`; still on the routine restart path
    /spendGuard\.flush\(\)/.test(srv) && /function shutdown\(\)[\s\S]{0,1400}spendGuard\.flush\(\)/.test(srv));
  ok('§2 §ban-safety: the vendor whitelist is untouched by this change (design §7 — if it needed a change, the design is wrong)',
    !/spend-authorizer|spend-guard|spend-budget/.test(read('scripts/test-vendor-whitelist.mjs')));
}

// ── §2b THE ATTENDED LAW (lane owner-press-attended) ────────────────────────
// userW (measured 2026-10-28 00:33–00:48 PT): five presses of the strip's «Hand over now · starts a turn» were refused
// `hour-cap` (an agent's @-mention fan-out had spent the account's 30), and the sixth — after the cap was raised — was
// CHARGED. A per-occurrence press on a person's door is an ATTENDED turn: the ceiling neither refuses nor counts it.
// r2 (accept-r1: the 15th door — the For-you ✓ on a takeover request — and a header-less `curl` both pressed ATTENDED
// past a HAND-WRITTEN door table): THE FENCE IS DERIVED. An attended turn needs a PRESS, and only a door mints one
// (src/write-origin.js `pressOf(req)`: no bearer, and the strict page verdict). The census below reads the AST of the
// tracked server tree: (1) every attended `spendReason` literal is SELECTED on `isPress(pressed)` (its attended branch
// unreachable without it); (2) every `pressed` value anywhere is either minted (`pressOf(req)`) or passed through —
// never built from anything else; (3) from each attended site it WALKS BACK along every `pressed` hop — a call that
// hands it on (by property or by position), an object that carries it, a listener an emitter feeds — to the units that
// MINT it: the doors; (4) every door refuses every bearer before it mints. The hand-kept table below is a CONTROL (the
// derived doors must cover it), never the census.
console.log('\n§2b the attended law: a person\'s press is neither refused nor counted; the doors that can make one are DERIVED and each refuses every bearer');
const CONTROL_DOORS = [
  ['src/server/stash-handover.js', "app.post('/api/sessions/:id/stash/hand-over'"],
  ['src/routes/desktop-apps.js', "router.post('/api/desktop/apps/:id/reach/request'"],
  ['src/routes/desktop-apps.js', "router.post('/api/desktop/apps/:id/handback'"],
  ['src/routes/window-targets.js', "router.post('/api/window/desktop/:handle/resume'"],
  ['src/routes/channels.js', "router.post('/api/channel-groups'"],
  ['src/routes/channels.js', "router.post('/api/channel-groups/:id/:verb'"],
  ['src/routes/channels.js', "router.post('/api/channels/outbox/:id/approve'"],
  ['src/routes/channels.js', "router.post('/api/channels/outbox/:id/reject'"],
  ['src/routes/channels.js', "router.post('/api/channels/:adapterId/:convId/send'"],
  ['src/routes/channels.js', "router.post('/api/channels/:adapterId/:convId/propose'"],
  ['src/routes/browser.js', "router.post('/api/browser/handback'"],
  ['src/routes/browser.js', "router.post('/api/browser/takeovers/:id/done'"],
  ['src/routes/browser.js', "router.post('/api/browser/proposals/:id/approve'"],   // r3: the person's Approve (tellProposal) — r1's row, dropped by r2 (accept-r2 confirmed[1])
  ['server.js', "app.post('/api/user-todos/:id'"],   // r2: the 15th door (accept-r1 claim run (a))
  ['src/server/bulk-resume-routes.js', "app.post('/api/sessions/resume-stopped'"],   // the bulk press (the owner's ruling 2026-11-18: attended)
  ['src/server/browser-stream.js', 'onViewerMessage'],   // r2: the live view's own socket (its Hand back) — r3: the MESSAGE mints, never the handshake
];
// A door refuses EVERY bearer when its first act (after `try {` and the host guard — `refuseHost` / `forHost`, which only
// answer 501 for another machine) is `pressBearer(req.headers)` — or the file's own `refuseAgentBearer` WHEN that helper is
// the any-bearer refusal (src/routes/browser.js, src/routes/channels.js: its definition asks pressBearer).
const REFUSES_FIRST = /^\s*if \((?:pressBearer\(req\.headers\)|refusePressBearer\(req, res\)|refuseAgentBearer\(req, res[^)]*\))\)/;
const anyBearerHelper = (src) => /function refuseAgentBearer\([^)]*\) \{\s*if \(!isAgentBearer\(req\) && !pressBearer\(req\.headers\)\) return false;/.test(src);
/** A door's handler (line-read, the r1 reader — kept for the controls): does it refuse a bearer before anything else? */
function doorRefusesFirst(src, head) {
  const at = src.indexOf(head);
  if (at < 0 || src.indexOf(head, at + 1) >= 0) return { ok: false, why: at < 0 ? 'route not found' : 'route registered twice' };
  const body = src.slice(src.indexOf('\n', at) + 1).split('\n').filter((l) => l.trim() && !/^\s*\/\//.test(l));
  let i = 0;
  while (i < body.length && (/^\s*try \{\s*$/.test(body[i]) || /^\s*if \(refuseHost\(req, res\)\) return;/.test(body[i]) || /^\s*forHost\(req\);\s*$/.test(body[i]))) i++;
  const first = body[i] || '';
  const viaHelper = /refuseAgentBearer\(/.test(first);
  return { ok: REFUSES_FIRST.test(first) && (!viaHelper || anyBearerHelper(src)), why: first.trim().slice(0, 90) };
}

// ── THE PRESS CENSUS (AST) ──
const acornLib = require(path.join(REPO, 'node_modules/acorn'));
const kname = (k) => (k && (k.type === 'Identifier' ? k.name : k.type === 'Literal' ? String(k.value) : null));
const isFnNode = (n) => !!n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const calleeName = (c) => (c && c.callee ? (c.callee.type === 'Identifier' ? c.callee.name : c.callee.type === 'MemberExpression' && !c.callee.computed ? kname(c.callee.property) : null) : null);
function parseAst(src) { for (const sourceType of ['script', 'module']) { try { return acornLib.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); } catch { } } return null; }
function astVisit(node, fn, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parents);
  parents.push(node);
  for (const k in node) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') astVisit(c, fn, parents); } else if (v && typeof v.type === 'string') astVisit(v, fn, parents);
  }
  parents.pop();
}
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);
function fnNameOf(fn, parents) {
  if (fn.id && fn.id.name) return fn.id.name;
  const p = parents[parents.length - 1];
  if (!p) return null;
  if (p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
  if ((p.type === 'Property' || p.type === 'MethodDefinition') && p.value === fn) return kname(p.key);
  if (p.type === 'AssignmentExpression' && p.right === fn) return p.left.type === 'MemberExpression' ? kname(p.left.property) : p.left.type === 'Identifier' ? p.left.name : null;
  return null;
}
function routeHeadOf(fn, parents, src) {
  const p = parents[parents.length - 1];
  if (p && p.type === 'CallExpression' && p.arguments.includes(fn) && p.callee.type === 'MemberExpression' && VERBS.has(kname(p.callee.property)) && p.arguments[0] && p.arguments[0].type === 'Literal' && typeof p.arguments[0].value === 'string' && p.arguments[0].value.startsWith('/')) return src.slice(p.start, p.arguments[0].end);
  return null;
}
/** the innermost NAMED unit (a named function / method, or a route handler) enclosing parents' tail */
function unitOf(parents, src) {
  for (let i = parents.length - 1; i >= 0; i--) {
    const n = parents[i];
    if (!isFnNode(n)) continue;
    const ps = parents.slice(0, i);
    const head = routeHeadOf(n, ps, src); if (head) return { kind: 'route', name: head, fn: n };
    const nm = fnNameOf(n, ps); if (nm) return { kind: 'fn', name: nm, fn: n };
  }
  return { kind: 'module', name: '(module)', fn: null };
}
const innermostFn = (parents) => { for (let i = parents.length - 1; i >= 0; i--) if (isFnNode(parents[i])) return { fn: parents[i], at: i }; return null; };
const paramName = (p) => (p && p.type === 'Identifier' ? p.name : p && p.type === 'AssignmentPattern' && p.left.type === 'Identifier' ? p.left.name : null);
const patternHasPressed = (p) => { const o = p && p.type === 'AssignmentPattern' ? p.left : p; return !!(o && o.type === 'ObjectPattern' && o.properties.some((q) => q.type === 'Property' && kname(q.key) === 'pressed')); };
/** where a function takes the press: {i, mode: 'positional' | 'destructured'} or null */
function pressedParamOf(fn) {
  for (const [i, p] of (fn.params || []).entries()) { if (paramName(p) === 'pressed') return { i, mode: 'positional' }; if (patternHasPressed(p)) return { i, mode: 'destructured' }; }
  return null;
}
/** the value of an object literal's `pressed` (top level, or inside a spread / conditional object), null if it has none */
function pressedOfObject(o) {
  if (!o) return null;
  if (o.type === 'ObjectExpression') {
    for (const q of o.properties) if (q.type === 'Property' && kname(q.key) === 'pressed') return { value: q.value };
    for (const q of o.properties) if (q.type === 'SpreadElement' && q.argument.type !== 'Identifier') { const r = pressedOfObject(q.argument); if (r && r.value) return r; }
    const sp = o.properties.find((q) => q.type === 'SpreadElement' && q.argument.type === 'Identifier');
    return sp ? { ident: sp.argument.name } : null;
  }
  if (o.type === 'ConditionalExpression') return pressedOfObject(o.consequent) || pressedOfObject(o.alternate);
  if (o.type === 'LogicalExpression') return pressedOfObject(o.right);
  if (o.type === 'Identifier') return { ident: o.name };
  return null;
}
/** what a value handed on as the press IS: 'mint' (a door's pressOf(req), or its `press` const) | 'pass' (`pressed`,
 *  `x.pressed`, `x && x.pressed`) | 'none' (null) | 'BAD' (anything else — the press built from a body, a literal…) */
function pressKind(v) {
  if (!v) return 'none';
  if (v.type === 'Literal' && v.value === null) return 'none';
  if (v.type === 'CallExpression' && calleeName(v) === 'pressOf') return 'mint';
  if (v.type === 'Identifier') return v.name === 'press' ? 'mint' : v.name === 'pressed' ? 'pass' : v.name === 'undefined' ? 'none' : 'BAD';
  if (v.type === 'MemberExpression' && !v.computed && kname(v.property) === 'pressed') return 'pass';
  if (v.type === 'LogicalExpression' && v.operator === '&&') return pressKind(v.right);
  return 'BAD';
}
/** the attended branch's reachability with isPress(…) false: 'T' | 'F' | 'U' */
function unpressed(e) {
  if (!e) return 'U';
  if (e.type === 'CallExpression') return calleeName(e) === 'isPress' && e.arguments[0] && pressKind(e.arguments[0]) === 'pass' ? 'F' : 'U';
  if (e.type === 'UnaryExpression' && e.operator === '!') { const x = unpressed(e.argument); return x === 'T' ? 'F' : x === 'F' ? 'T' : 'U'; }
  if (e.type === 'LogicalExpression') {
    const a = unpressed(e.left), b = unpressed(e.right);
    if (e.operator === '&&') return a === 'F' || b === 'F' ? 'F' : a === 'T' && b === 'T' ? 'T' : 'U';
    if (e.operator === '||') return a === 'T' || b === 'T' ? 'T' : a === 'F' && b === 'F' ? 'F' : 'U';
  }
  return 'U';
}
const returns = (s) => !!s && (s.type === 'ReturnStatement' || (s.type === 'BlockStatement' && s.body.some((x) => x.type === 'ReturnStatement')));
/** is an attended site SELECTED on the press? — a conditional whose attended branch is unreachable unpressed, or an
 *  earlier `if (!isPress(pressed)) { …; return; }` in its function */
function siteFence(site) {
  const ps = site.parents;
  for (let i = ps.length - 1; i >= 0; i--) {
    const n = ps[i];
    if (isFnNode(n)) break;
    if (n.type === 'ConditionalExpression') {
      const child = ps[i + 1] || site.node;
      if (child !== n.consequent && child !== n.alternate) continue;
      if (unpressed(n.test) === (child === n.consequent ? 'F' : 'T')) return 'conditional';
    }
  }
  const f = innermostFn(ps);
  if (f && f.fn.body && f.fn.body.type === 'BlockStatement') {
    const top = ps[f.at + 2] || site.node;   // the function body's statement holding the site
    for (const st of f.fn.body.body) { if (st === top) break; if (st.type === 'IfStatement' && unpressed(st.test) === 'T' && returns(st.consequent)) return 'guard'; }
  }
  return null;
}
const ATT = Object.keys(A.SPEND_REASONS).filter((r) => A.SPEND_REASONS[r].attended === true).sort();
// the files the census reads: a `pressed` in CODE position (a property, an argument, a test — not the word in a comment), the
// press API, or an attended literal (a prefilter only: the AST decides; a site in any other file would hold its literal)
const PRESS_FILE_RE = new RegExp("\\bpressed\\b(?=\\s*(?:[,:})=?]|\\)|&&|\\|\\|))|\\bpressOf\\(|\\bisPress\\(|spendReason: '(?:" + Object.keys(A.SPEND_REASONS).filter((r) => A.SPEND_REASONS[r].attended === true).join('|') + ")'");
const astCache = new Map();
function collect(f, src) {
  // r1708: the cache keeps EVERY text it parsed for a file (a mutant's text no longer evicts the real one, which the next census
  // then parsed again)
  let byText = astCache.get(f); if (!byText) astCache.set(f, byText = new Map());
  const c = byText.get(src);
  if (c) return c;
  const ast = parseAst(src);
  const out = { src, ok: !!ast, funcs: [], calls: [], sites: [], props: [], decls: [], mints: [], assigns: [], aliases: [] };
  if (ast) astVisit(ast, (n, parents) => {
    if (isFnNode(n)) { const name = fnNameOf(n, parents); out.funcs.push({ f, n, name, pp: pressedParamOf(n), head: routeHeadOf(n, parents, src) }); }
    else if (n.type === 'CallExpression') { const name = calleeName(n); if (name) { out.calls.push({ f, n, name, member: n.callee.type === 'MemberExpression', parents: parents.slice() }); if (name === 'pressOf' && f !== 'src/write-origin.js') out.mints.push({ f, n, parents: parents.slice() }); } }
    else if (n.type === 'Property') {
      const k = kname(n.key), par = parents[parents.length - 1];
      if (k === 'spendReason' && n.value.type === 'Literal' && ATT.includes(n.value.value)) out.sites.push({ f, reason: n.value.value, node: n, parents: parents.slice(), line: src.slice(0, n.start).split('\n').length });
      if (k === 'pressed' && par && par.type === 'ObjectExpression') out.props.push({ f, n, parents: parents.slice() });
      if (par && par.type === 'ObjectExpression' && n.value.type === 'Identifier' && !n.computed) out.aliases.push({ key: k, target: n.value.name });
    } else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'press') out.decls.push({ f, n });
    else if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && kname(n.left.property) === 'pressed') out.assigns.push({ f, n });
  });
  byText.set(src, out);
  return out;
}
let PRESS_FILES = null;
function pressCensus(override = {}) {
  if (!PRESS_FILES) { let all = []; try { all = trackedServerSource(); } catch { all = []; } PRESS_FILES = all.filter((f) => PRESS_FILE_RE.test(read(f))); }
  const files = [...new Set([...PRESS_FILES, ...Object.keys(override)])];
  const C = files.map((f) => collect(f, override[f] !== undefined ? override[f] : read(f)));
  const srcOf = Object.fromEntries(C.map((c, i) => [files[i], c.src]));
  const bad = [];
  for (const [i, c] of C.entries()) if (!c.ok) bad.push(`${files[i]} does not parse`);
  const funcs = C.flatMap((c) => c.funcs), calls = C.flatMap((c) => c.calls), sites = C.flatMap((c) => c.sites), props = C.flatMap((c) => c.props);
  const mints = C.flatMap((c) => c.mints), decls = C.flatMap((c) => c.decls), assigns = C.flatMap((c) => c.assigns);
  const aliasOf = new Map();   // per file: function name → the object keys it is exported under (`create: createGroup`)
  for (const [i, c] of C.entries()) for (const a of c.aliases) { const k = files[i] + '#' + a.target; if (!aliasOf.has(k)) aliasOf.set(k, new Set()); aliasOf.get(k).add(a.key); }
  const unitAt = (f, parents) => unitOf(parents, srcOf[f]);
  const localFns = new Set(funcs.filter((x) => x.name).map((x) => x.f + '#' + x.name));
  const callsByName = new Map();
  for (const c of calls) { if (!callsByName.has(c.name)) callsByName.set(c.name, []); callsByName.get(c.name).push(c); }
  // (2) TAINT — the press universe: a file that holds the press API (`isPress` / `pressOf` — the token's own words), and
  // ANY object handed into a press-taking function. There, every `pressed` is minted or handed on, every `press` is a
  // door's pressOf(req), every `.pressed =` likewise. (A `pressed` boolean elsewhere — src/channel-drain.js's «the owner's
  // press re-lists» verdict field — is another word, never handed to a press-taker; the census does not read it.)
  const taint = [];
  const takersAll = new Set(funcs.filter((x) => x.pp && x.name).map((x) => x.name));
  const pressFile = new Set(files.filter((f, i) => /\bisPress\(|\bpressOf\(/.test(C[i].src) && f !== 'src/write-origin.js'));
  const intoTaker = (p) => { for (let i = p.parents.length - 1; i >= 0; i--) { const n = p.parents[i]; if (n.type === 'CallExpression') return takersAll.has(calleeName(n)); if (!/^(ObjectExpression|SpreadElement|ConditionalExpression|LogicalExpression|Property)$/.test(n.type)) return false; } return false; };
  for (const p of props) if ((pressFile.has(p.f) || intoTaker(p)) && pressKind(p.n.value) === 'BAD') taint.push(`${p.f}:${srcOf[p.f].slice(0, p.n.start).split('\n').length} pressed: ${srcOf[p.f].slice(p.n.value.start, p.n.value.end).slice(0, 60)}`);
  for (const d of decls) if (pressFile.has(d.f) && !(d.n.init && d.n.init.type === 'CallExpression' && calleeName(d.n.init) === 'pressOf')) taint.push(`${d.f}: a \`press\` that is not pressOf(req)`);
  for (const a of assigns) if (pressKind(a.n.right) === 'BAD') taint.push(`${a.f}: .pressed = ${srcOf[a.f].slice(a.n.right.start, a.n.right.end).slice(0, 60)}`);
  for (const fn of funcs.filter((x) => x.pp && x.pp.mode === 'positional' && x.name)) for (const c of calls.filter((x) => x.name === fn.name && (x.member || x.f === fn.f))) { const a = c.n.arguments[fn.pp.i]; if (a && pressKind(a) === 'BAD') taint.push(`${c.f}: ${fn.name}(…) hands \`${srcOf[c.f].slice(a.start, a.end).slice(0, 40)}\` as the press`); }
  // event carriers: an object that carries `pressed` into a call that is NOT a press-taking function (a listener fan-out)
  const takers = new Set(funcs.filter((x) => x.pp).map((x) => x.name));
  const carriers = [];
  for (const p of props) {
    let call = null;
    for (let i = p.parents.length - 1; i >= 0; i--) { const n = p.parents[i]; if (n.type === 'CallExpression') { call = n; break; } if (!/^(ObjectExpression|SpreadElement|ConditionalExpression|LogicalExpression|Property)$/.test(n.type)) break; }
    if (call && !takers.has(calleeName(call)) && ['pass', 'mint'].includes(pressKind(p.n.value))) carriers.push(p);
  }
  // (3) THE WALK, from each attended site back to the doors
  const doors = new Map();   // key → {f, unit, mints:[n]}
  const walks = {}, holes = [];
  const fenced = [];
  const walked = new Set();   // r3: every file the walk passed a press through
  const stateKey = (s) => `${s.f}#${s.fn.start}#${s.i}#${s.mode}`;
  const noteDoor = (f, parents, n) => { const u = unitAt(f, parents); const k = f + ' ' + (u.kind === 'route' ? u.name : u.name); if (!doors.has(k)) doors.set(k, { f, u, at: [], ps: [] }); doors.get(k).at.push(n); doors.get(k).ps.push(parents); return k; };
  const resolveIdent = (f, parents, name) => {   // an identifier handed on: a param of a named unit, a listener's param, or a local object — innermost scope outwards
    for (let at = parents.length - 1; at >= 0; at--) {
      const fn = parents[at];
      if (!isFnNode(fn)) continue;
      const ps = parents.slice(0, at);
      const idx = (fn.params || []).findIndex((p) => paramName(p) === name);
      if (idx >= 0) {
        const named = fnNameOf(fn, ps);
        if (named) return { state: { f, fn, name: named, i: idx, mode: 'object' } };
        const host = ps[ps.length - 1];
        if (host && host.type === 'CallExpression' && /^on[A-Z]/.test(calleeName(host) || '')) return { event: true };
        return { hole: `${name}: a param of an anonymous function that is no listener` };
      }
      let decl = null;
      astVisit(fn.body, (n) => { if (!decl && n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name && n.init) decl = n; });
      if (decl) { const r = pressedOfObject(decl.init); if (r && r.value) return { value: r.value }; return { hole: `${name}: a local that carries no press` }; }
    }
    return { hole: `${name}: not resolved` };
  };
  const handle = (f, parents, v, enqueue, from) => {   // a value handed on as the press, in unit (f, parents)
    const k = pressKind(v);
    if (k === 'mint') return noteDoor(f, parents, v);
    if (k === 'none') return null;
    if (k === 'BAD') { holes.push(`${from}: BAD press`); return null; }
    const leaf = v.type === 'LogicalExpression' ? v.right : v;
    if (leaf.type === 'Identifier') {   // `pressed` — the enclosing named unit must take it
      const inner = innermostFn(parents);
      const u = unitAt(f, parents);
      const fn = u.fn;
      if (!fn || !fn.params) { holes.push(`${from}: \`pressed\` outside a function`); return null; }
      const pp = pressedParamOf(fn);
      if (!pp) {   // a local `pressed` (a destructured param of an anonymous listener) → an event
        if (inner && inner.fn !== fn && pressedParamOf(inner.fn)) { enqueue({ event: true }); return null; }
        holes.push(`${from}: passes \`pressed\` its unit ${u.name} never receives`); return null;
      }
      enqueue({ f, fn, name: u.kind === 'fn' ? u.name : null, i: pp.i, mode: pp.mode });
      return null;
    }
    const obj = leaf.object;   // `x.pressed`
    if (obj && obj.type === 'Identifier') { const r = resolveIdent(f, parents, obj.name); if (r.state) enqueue(r.state); else if (r.event) enqueue({ event: true }); else if (r.value) handle(f, parents, r.value, enqueue, from); else holes.push(`${from}: ${r.hole}`); return null; }
    holes.push(`${from}: an unreadable press hop`); return null;
  };
  for (const s of sites) {
    const how = siteFence(s);
    fenced.push({ ...s, how });
    const inner = innermostFn(s.parents);
    const fn = inner && inner.fn;
    const pp = fn && pressedParamOf(fn);
    const reached = new Set();
    walks[`${s.reason}@${s.f}:${s.line}`] = reached;
    if (!pp) { holes.push(`${s.reason}@${s.f}:${s.line}: its function takes no press`); continue; }
    const seen = new Set();
    let eventDone = false;
    const queue = [{ f: s.f, fn, name: fnNameOf(fn, s.parents.slice(0, inner.at)), i: pp.i, mode: pp.mode }];
    const enqueue = (st) => { if (st.event) { if (!eventDone) { eventDone = true; for (const cp of carriers) { const d = handle(cp.f, cp.parents, cp.n.value, enqueue, `event carrier ${cp.f}`); if (d) reached.add(d); } } return; } queue.push(st); };
    while (queue.length) {
      const st = queue.shift();
      const k = stateKey(st); if (seen.has(k)) continue; seen.add(k);
      walked.add(st.f);
      if (!st.name) { holes.push(`${s.reason}: an unnamed unit takes the press (${st.f})`); continue; }
      const names = new Set([st.name, ...(aliasOf.get(st.f + '#' + st.name) || [])]);
      let callers = 0;
      for (const c of [...names].flatMap((nm) => callsByName.get(nm) || [])) {
        // an identifier call in ANOTHER file counts when that file defines no function of the name (a destructured family
        // member: channels-engine's `approve(id, o)` IS channels-outbound's approve)
        if (!c.member && c.f !== st.f && localFns.has(c.f + '#' + c.name)) continue;
        const a = c.n.arguments[st.i];
        if (!a) continue;
        const from = `${c.f}:${srcOf[c.f].slice(0, c.n.start).split('\n').length}`;
        if (st.mode === 'positional') { callers++; const d = handle(c.f, c.parents, a, enqueue, from); if (d) reached.add(d); continue; }
        const r = pressedOfObject(a);
        if (!r) continue;
        callers++;
        if (r.value) { const d = handle(c.f, c.parents, r.value, enqueue, from); if (d) reached.add(d); continue; }
        const id = resolveIdent(c.f, c.parents, r.ident);
        if (id.state) enqueue(id.state); else if (id.event) enqueue({ event: true }); else if (id.value) { const d = handle(c.f, c.parents, id.value, enqueue, from); if (d) reached.add(d); } else if (!/^(o|opts|options|args)$/.test(r.ident) || true) { /* an object handed whole that carries no press here */ }
      }
      if (!callers && st.mode !== 'object') { /* a press-taking unit nobody hands a press: its callers are the gated roads */ }
    }
  }
  // (2b) r3 — THE PRESS IS NEVER KEPT (the capability-token law: a press binds to its request): it rides ONE request's chain
  // as a call's argument; an object literal that carries a press anywhere else (a viewer record, a module table, a returned
  // record) or a `.pressed =` assignment keeps it past its act — r2's live view kept the HANDSHAKE's on `viewer.pressed`.
  // Read over the press universe: the files holding the press API and every file the walk passed a press through (a
  // `pressed` elsewhere — src/channel-drain.js's verdict field — is another word)
  const kept = [];
  const hostOf = (p) => { for (let i = p.parents.length - 1; i >= 0; i--) { const n = p.parents[i]; if (!/^(ObjectExpression|SpreadElement|ConditionalExpression|LogicalExpression|Property)$/.test(n.type)) return n; } return null; };
  for (const p of props) {
    if (!(pressFile.has(p.f) || walked.has(p.f))) continue;
    const h = hostOf(p);
    if (!h || (h.type !== 'CallExpression' && h.type !== 'NewExpression')) kept.push(`${p.f}:${srcOf[p.f].slice(0, p.n.start).split('\n').length} kept in a ${h ? h.type : 'module'}`);
  }
  for (const a of assigns) if (pressFile.has(a.f) || walked.has(a.f)) kept.push(`${a.f}:${srcOf[a.f].slice(0, a.n.start).split('\n').length} .pressed = …`);
  // (2c) r4 — A PRESS IS NEVER REPLAYED (accept-r3 claim 0, gap 2: a timer the callee arms INSIDE the door's chain,
  // re-posting the same press an hour later, stayed attended — the chain carries a press with no limit on time). A press
  // handed on inside a timer's call — setTimeout / setInterval / setImmediate / an injected `schedule`, by an arrow or a
  // .bind — is a REPLAY the code chose, never the person's act: red by name, over the same press universe. (An await, a
  // .then, a listener stay the act: a serial wake behind a slow member is the one act finishing late.)
  const TIMER_RE = /^(setTimeout|setInterval|setImmediate|schedule)$/;
  const timerOf = (parents) => { for (let i = parents.length - 1; i >= 0; i--) { const n = parents[i]; if ((n.type === 'CallExpression' || n.type === 'NewExpression') && TIMER_RE.test(calleeName(n) || '')) return calleeName(n); } return null; };
  const replayed = [];
  const lineOf = (f, n) => srcOf[f].slice(0, n.start).split('\n').length;
  for (const p of props) if ((pressFile.has(p.f) || walked.has(p.f)) && ['pass', 'mint'].includes(pressKind(p.n.value))) { const t = timerOf(p.parents); if (t) replayed.push(`${p.f}:${lineOf(p.f, p.n)} a press handed on inside ${t}(…)`); }
  for (const fn of funcs.filter((x) => x.pp && x.pp.mode === 'positional' && x.name)) for (const c of calls.filter((x) => x.name === fn.name && (x.member || x.f === fn.f) && (pressFile.has(x.f) || walked.has(x.f)))) { const a = c.n.arguments[fn.pp.i]; const t = a && ['pass', 'mint'].includes(pressKind(a)) ? timerOf(c.parents) : null; if (t) replayed.push(`${c.f}:${lineOf(c.f, c.n)} ${fn.name}(…) hands a press on inside ${t}(…)`); }
  // (4) every door refuses every bearer before it mints
  const doorVerdicts = [];
  for (const [k, d] of doors) {
    const src = srcOf[d.f];
    let ok0 = false, why = '';   // eslint-disable-line prefer-const
    if (d.u.kind === 'route') {
      let body = d.u.fn.body && d.u.fn.body.type === 'BlockStatement' ? d.u.fn.body.body : [];
      if (body[0] && body[0].type === 'TryStatement') body = body[0].block.body;
      const isHost = (st) => /^if \(refuseHost\(req, res\)\) return;|^forHost\(req\);/.test(src.slice(st.start, st.end));
      let j = 0; while (j < body.length && isHost(body[j])) j++;
      const first = body[j];
      const t = first ? src.slice(first.start, first.end) : '';
      const viaHelper = /^if \(refuseAgentBearer\(req, res/.test(t);
      const mintsOwnReq = d.at.every((m) => m.type !== 'CallExpression' || (m.arguments.length === 1 && m.arguments[0].type === 'Identifier' && m.arguments[0].name === 'req'));
      ok0 = !!first && first.type === 'IfStatement' && returns(first.consequent) && (/^if \((?:require\('[^']+'\)\.)?pressBearer\(req\.headers\)\)/.test(t) || (viaHelper && anyBearerHelper(src))) && d.at.every((m) => m.start > first.end) && mintsOwnReq;
      if (!mintsOwnReq) why = 'a press minted from something that is not this request';
      why = why || t.split('\n')[0].slice(0, 90);
    } else {
      // a SOCKET door (the live view) — r3: each Hand back MESSAGE mints its OWN press from the page the handshake proved
      // (`pressOf(viewer.page, …)`), behind, in its block, the refusal of a view a bearer opened; the handshake records the
      // bearer beside the page (`bearer: pressBearer(req.headers), page: pageOfUpgrade(req)`) and never a press
      const guarded = (n, parents) => { for (let i = parents.length - 1; i >= 0; i--) { const b = parents[i]; if (b.type !== 'BlockStatement') continue; const st = b.body.find((x) => x.start <= n.start && x.end >= n.end); for (const y of b.body) { if (y === st) break; if (y.type === 'IfStatement' && /\.bearer\b/.test(src.slice(y.test.start, y.test.end)) && returns(y.consequent)) return true; } return false; } return false; };
      const fromPage = (m) => m.type === 'CallExpression' && m.arguments[0] && m.arguments[0].type === 'MemberExpression' && kname(m.arguments[0].property) === 'page';
      const handshake = /\bbearer: pressBearer\(req\.headers\), page: pageOfUpgrade\(req\)/.test(src);
      const n = d.at.filter((m, i) => fromPage(m) && guarded(m, d.ps[i])).length;
      ok0 = handshake && d.at.length > 0 && n === d.at.length;
      why = `socket: ${d.at.length} mint(s) per message, ${n} from the handshake's page behind the bearer refusal${handshake ? '' : ' — the handshake records no bearer beside the page'}`;
    }
    doorVerdicts.push({ k, f: d.f, name: d.u.name, kind: d.u.kind, ok: ok0, why });
  }
  const reachedDoors = new Set(Object.values(walks).flatMap((x) => [...x]));
  const strayMints = mints.map((m) => noteDoor(m.f, m.parents, m.n)).filter((k) => !reachedDoors.has(k));
  return { files, sites, fenced, taint, kept, replayed, doors: doorVerdicts, walks, holes: [...new Set(holes)], strayMints: [...new Set(strayMints)], carriers: carriers.length, bad };
}
{
  const attended = ATT;
  const t0 = Date.now();
  const PC = pressCensus();
  const ms = Date.now() - t0;
  const deferred = new Map(DEFERRED_ATTENDED.map((d) => [d.reason, d]));
  const bySite = {};
  for (const s of PC.fenced) (bySite[s.reason] = bySite[s.reason] || []).push(s);
  console.log(`    the press census (${PC.files.length} files read, ${PC.sites.length} attended sites, ${PC.carriers} event carrier(s), ${ms} ms):`);
  for (const r of attended) {
    const ss = bySite[r] || [];
    if (!ss.length) { const d = deferred.get(r); console.log(`      ${r.padEnd(21)} ${d ? `DEFERRED — wired in ${d.wiredIn} (its door: ${d.door})` : 'NO SITE'}`); continue; }
    for (const s of ss) { const ds = [...(PC.walks[`${r}@${s.f}:${s.line}`] || [])]; console.log(`      ${r.padEnd(21)} ${s.f}:${s.line}  selected by isPress(pressed) (${s.how || 'NOT SELECTED'})  ← ${ds.length} door(s)`); }
  }
  const doorWord = (d) => (d.kind === 'route' ? d.name.replace(/^(?:app|router)\.(post|put|patch|delete|get)\('/, (m, v) => v.toUpperCase() + ' ').replace(/'$/, '') : 'socket · ' + d.name);
  console.log('    the DERIVED doors (each must refuse every bearer before it mints the press):');
  for (const d of PC.doors) console.log(`      ${d.ok ? 'refused first' : 'NOT REFUSED  '}  ${doorWord(d)} (${d.f})${d.ok ? '' : ' — ' + d.why}`);
  ok('§2b the census reads its files (none unparsed) and finds the attended sites', PC.bad.length === 0 && PC.sites.length >= 6, JSON.stringify(PC.bad));
  ok('§2b every attended reason is spelled at exactly ONE site — or has NONE and a DEFERRED census row naming the lane that wires it (' + attended.map((r) => `${r}${(bySite[r] || []).length ? '@' + bySite[r].map((s) => s.f.split('/').pop() + ':' + s.line).join('+') : deferred.has(r) ? ' deferred→' + deferred.get(r).wiredIn : ' NONE'}`).join(' · ') + ')',
    attended.every((r) => ((bySite[r] || []).length === 1 && !deferred.has(r)) || (!(bySite[r] || []).length && deferred.has(r))) && DEFERRED_ATTENDED.every((d) => attended.includes(d.reason)), JSON.stringify(Object.fromEntries(attended.map((r) => [r, (bySite[r] || []).length]))));
  ok('§2b every attended site is SELECTED on the press — its attended branch unreachable without isPress(pressed)', PC.fenced.length > 0 && PC.fenced.every((s) => s.how), JSON.stringify(PC.fenced.filter((s) => !s.how).map((s) => `${s.reason}@${s.f}:${s.line}`)));
  ok('§2b TAINT: every `pressed` anywhere is minted by a door (pressOf) or handed on — never built from a body, a record or a literal', PC.taint.length === 0, PC.taint.join(' | '));
  ok('§2b r3 THE PRESS IS NEVER KEPT: every press rides a call\'s argument down ONE request\'s chain — no record, viewer or table holds one, no `.pressed =`', PC.kept.length === 0, PC.kept.join(' | '));
  ok('§2b r4 A PRESS IS NEVER REPLAYED: no press is handed on inside a timer (setTimeout / setInterval / setImmediate / schedule) — a replay later is never the person\'s act', PC.replayed.length === 0, PC.replayed.join(' | '));
  ok('§2b THE WALK: every attended site reaches its doors along the press hops, with no unreadable hop', PC.holes.length === 0 && Object.values(PC.walks).every((x) => x.size > 0), PC.holes.join(' | '));
  ok('§2b THE FENCE: every DERIVED door refuses EVERY bearer before it mints the press (' + PC.doors.length + ' doors)', PC.doors.length >= 14 && PC.doors.every((d) => d.ok), JSON.stringify(PC.doors.filter((d) => !d.ok)));
  ok('§2b every press a door mints reaches an attended site (no decorative press)', PC.strayMints.length === 0, PC.strayMints.join(' | '));
  const derivedKeys = new Set(PC.doors.map((d) => d.f + ' ' + d.name));
  ok('§2b CONTROL (the hand-kept table — a control, never the census): the derived doors cover every row (' + CONTROL_DOORS.length + ', the 15th door and the live view included)', CONTROL_DOORS.every(([f, h]) => derivedKeys.has(f + ' ' + h)), JSON.stringify(CONTROL_DOORS.filter(([f, h]) => !derivedKeys.has(f + ' ' + h))));
  // MUTANT CONTROLS — the census over a patched copy of ONE file each (the rest from the cache)
  const t1 = Date.now();
  const srv = read('server.js');
  const noRefuse = srv.replace("  if (require('./src/write-origin.js').pressBearer(req.headers)) return res.status(403).json(", "  if (false) return res.status(403).json(");
  const m1 = pressCensus({ 'server.js': noRefuse });
  ok('§2b CONTROL: the For-you ✓ door without its bearer refusal reads NOT REFUSED (the 15th door, as b8d2d98e shipped it)', noRefuse !== srv && m1.doors.some((d) => d.f === 'server.js' && /user-todos/.test(d.name) && !d.ok));
  const ge = read('src/server/groups-engine.js');
  const unsel = ge.replace("const paid = self && isPress(pressed) ? { spendReason: 'owner-group-wake' }", "const paid = self ? { spendReason: 'owner-group-wake' }");
  const m2 = pressCensus({ 'src/server/groups-engine.js': unsel });
  ok('§2b CONTROL: an attended site selected on the author alone (the r1 shape) reads NOT selected on the press', unsel !== ge && m2.fenced.some((s) => s.reason === 'owner-group-wake' && !s.how));
  // (an agent route, planted as a small file beside the tree — the census reads it like any other)
  const m3 = pressCensus({ 'src/server/zz-forge.js': "const __forge = (ge, b) => ge.post({ group: b.group, from: b.from, text: b.text, pressed: true });\nmodule.exports = { __forge };\n" });
  ok('§2b CONTROL: a press that is not minted nor handed on (`ge.post({ …, pressed: true })`) is a TAINT', m3.taint.some((t) => /zz-forge\.js/.test(t)), m3.taint.join(' | '));
  const m3b = pressCensus({ 'src/server/zz-forge.js': "const router = require('express').Router();\nrouter.post('/api/agent/zz-forge', async (req, res) => { const { pressOf } = require('../write-origin.js'); res.json(await req.app.locals.groups.post({ group: req.body.group, from: 'user', text: 'x', pressed: pressOf({ headers: { 'sec-fetch-site': 'same-origin' } }) })); });\nmodule.exports = { router };\n" });
  ok('§2b CONTROL: an AGENT route that mints a press from a forged request (`pressOf({headers: …})`) is a door that is NOT REFUSED', m3b.doors.some((d) => /zz-forge/.test(d.name) && !d.ok), JSON.stringify(m3b.doors.filter((d) => /zz-forge/.test(d.name))));
  const m4 = pressCensus({ 'src/server/zz-held-deliver.js': "function deliverHeld(cid, { pressed = null } = {}) { return deliver.deliverToConversation(cid, 't', isPress(pressed) ? { spendReason: 'held-deliver' } : { spendReason: 'channel-message' }); }\nmodule.exports = { deliverHeld };\n" });
  const m4n = m4.sites.filter((s) => s.reason === 'held-deliver').length;
  ok('§2b CONTROL: the day a `held-deliver` site exists, its DEFERRED row is RED until retired (one site AND a deferred row)', m4n === 1 && deferred.has('held-deliver') && !(m4n === 0 && deferred.has('held-deliver')));
  const ch = read('src/routes/channels.js');
  const cut = ch.replace("router.post('/api/channel-groups/:id/:verb', async (req, res) => {\n  try {\n    if (refuseAgentBearer(req, res, PRESS_IS_OWNERS)) return;\n", "router.post('/api/channel-groups/:id/:verb', async (req, res) => {\n  try {\n");
  const m5 = pressCensus({ 'src/routes/channels.js': cut });
  ok('§2b CONTROL: the group verb route without its refusal reads NOT refused — in the derived census and in the r1 line reader', cut !== ch && m5.doors.some((d) => /channel-groups\/:id\/:verb/.test(d.name) && !d.ok) && !doorRefusesFirst(cut, "router.post('/api/channel-groups/:id/:verb'").ok && doorRefusesFirst(ch, "router.post('/api/channel-groups/:id/:verb'").ok);
  const br = read('src/routes/browser.js');
  const brOld = br.replace('if (!isAgentBearer(req) && !pressBearer(req.headers)) return false;', 'if (!isAgentBearer(req)) return false;');
  const m6 = pressCensus({ 'src/routes/browser.js': brOld });
  ok('§2b CONTROL: browser.js\'s refuseAgentBearer back at vsst_ / jbt_ only (6428c67e) — its hand-back door reads NOT refused (an automation key\'s vsak_ would press it)',
    brOld !== br && m6.doors.some((d) => /api\/browser\/handback/.test(d.name) && !d.ok));
  const bs = read('src/server/browser-stream.js');
  const bsOld = bs.replace("      if (viewer.bearer) { send(viewer.ws, { type: 'refused', code: 'agent_forbidden',", "      if (false) { send(viewer.ws, { type: 'refused', code: 'agent_forbidden',");
  const m7 = pressCensus({ 'src/server/browser-stream.js': bsOld });
  ok('§2b CONTROL: the live view\'s Hand back without its bearer refusal reads NOT refused (the socket door)', bsOld !== bs && m7.doors.some((d) => d.kind !== 'route' && /browser-stream/.test(d.f) && !d.ok));
  ok('§2b the bearer predicate refuses vsst_, jbt_ and vsak_ alike and no cookie request — and pressOf mints ONLY for a person on this page (never for a bearer, a header-less script, a cross-site page; never through JSON)',
    ['Bearer vsst_' + 'a'.repeat(32), 'Bearer jbt_' + 'b'.repeat(32), 'Bearer vsak_' + 'c'.repeat(43), 'bearer x'].every((h) => WO.pressBearer({ authorization: h }))
      && !WO.pressBearer({ cookie: 'vs_token=' + 'd'.repeat(48) }) && !WO.pressBearer({})
      && WO.isPress(WO.pressOf({ headers: { 'sec-fetch-site': 'same-origin' } })) && WO.isPress(WO.pressOf({ headers: { origin: 'http://h:1', host: 'h:1' } }))
      && !WO.pressOf({ headers: {} }) && !WO.pressOf({ headers: { 'sec-fetch-site': 'same-origin', authorization: 'Bearer vsak_x' } }) && !WO.pressOf({ headers: { 'sec-fetch-site': 'cross-site' } })
      && !WO.isPress(JSON.parse(JSON.stringify({ p: WO.pressOf({ headers: { 'sec-fetch-site': 'same-origin' } }) })).p) && !WO.isPress(true) && !WO.isPress({}));
  // r3 THE CAPABILITY LAW (accept-r2 claim 1 (b): r2's press was ONE module-level singleton — pressOf(reqA) === pressOf(reqB),
  // bound to nothing, so any callee holding it could hand it to an unrelated wake): a press is minted PER REQUEST, a frozen
  // {at, route, reqId}, and is a press only inside the chain of the request that minted it
  const bound = await (async () => {
    await null;   // a chain of its own: the mints below never become the suite's
    const page = (url) => ({ method: 'POST', url, headers: { 'sec-fetch-site': 'same-origin' } });
    const chain = async (url, ms) => { await null; const p = WO.pressOf(page(url)); await new Promise((r) => setTimeout(r, ms)); await null; return { p, mine: WO.isPress(p) }; };
    const [a, b] = await Promise.all([chain('/api/door-a', 15), chain('/api/door-b', 5)]);
    const atB = await (async () => { await null; const pb = WO.pressOf(page('/api/door-b')); return { a: WO.isPress(a.p), b: WO.isPress(pb) }; })();
    const timer = await (async () => { await null; const p = WO.pressOf(page('/api/door-t')); return new Promise((r) => setTimeout(() => r(WO.isPress(p)), 3)); })();
    return { a, b, atB, timer, outside: WO.isPress(a.p), copy: WO.isPress(Object.freeze({ ...a.p })) };
  })();
  ok('§2b r3 A PRESS IS MINTED PER REQUEST: two requests\' presses are two frozen {at, route, reqId} — each a press in its OWN chain across its awaits and timers; door A\'s press presented in door B\'s chain, outside any chain, or as a copy is NOT a press',
    bound.a.p !== bound.b.p && Object.isFrozen(bound.a.p) && JSON.stringify(Object.keys(bound.a.p).sort()) === '["at","reqId","route","toJSON"]' && bound.a.p.route === 'POST /api/door-a' && bound.b.p.route === 'POST /api/door-b' && bound.a.p.reqId !== bound.b.p.reqId
      && bound.a.mine === true && bound.b.mine === true && bound.timer === true && bound.atB.a === false && bound.atB.b === true && bound.outside === false && bound.copy === false && JSON.stringify({ p: bound.a.p }) === '{}',
    JSON.stringify({ a: bound.a.mine, b: bound.b.mine, atB: bound.atB, timer: bound.timer, outside: bound.outside, copy: bound.copy, routes: [bound.a.p.route, bound.b.p.route] }));
  // the r2 live view, re-planted: the HANDSHAKE's press kept on the viewer for every later Hand back on the socket
  const bsR2 = bs.replace('bearer: pressBearer(req.headers), page: pageOfUpgrade(req) });', 'bearer: pressBearer(req.headers), pressed: pressOf(req) });')
    .replace('agent = false, bearer = false, page = null }) {', 'agent = false, bearer = false, pressed = null }) {')
    .replace('agent: !!agent, bearer: !!bearer, page };', 'agent: !!agent, bearer: !!bearer, pressed };')
    .replace("v.expectWakes, pressOf(viewer.page, 'WS /api/browser/stream hand-back'));", 'v.expectWakes, viewer.pressed);');
  const m8 = pressCensus({ 'src/server/browser-stream.js': bsR2 });
  ok('§2b r3 CONTROL: e03ad393\'s live view (the HANDSHAKE\'s press kept on `viewer.pressed`, handed to every later Hand back) reads KEPT — and its door is no longer a per-message mint',
    bsR2 !== bs && (bsR2.match(/viewer\.pressed\)/g) || []).length === 1 && m8.kept.some((k) => /browser-stream\.js/.test(k)) && m8.doors.some((d) => /browser-stream/.test(d.f) && !d.ok), JSON.stringify({ kept: m8.kept, doors: m8.doors.filter((d) => /browser-stream/.test(d.f)) }));
  // r4 CONTROL (accept-r3 claim 0, gap 2 — the acceptor's plant P7): the group door's press re-posted an hour later from a
  // timer armed IN the request's chain, and the same press bound into a setImmediate — each red BY NAME
  const p7 = ch.replace("    switch (req.params.verb) {\n      case 'post':", "    if (req.params.verb === 'post' && press) setTimeout(() => ge.post({ group, from: OWNER, pressed: press, text: String(b.text || ''), consent: ownerConsent(b) }), 3600e3);\n    if (req.params.verb === 'post' && press) setImmediate(ge.post.bind(ge, { group, from: OWNER, pressed: press, text: 'again', consent: ownerConsent(b) }));\n    switch (req.params.verb) {\n      case 'post':");
  const m9 = pressCensus({ 'src/routes/channels.js': p7 });
  ok('§2b r4 CONTROL: a press re-posted from a timer armed in the door\'s own chain (the acceptor\'s P7, an hour later) and one bound into a setImmediate each read REPLAYED, by name',
    p7 !== ch && m9.replayed.length - PC.replayed.length === 2 && m9.replayed.some((x) => /channels\.js:\d+ .*setTimeout/.test(x)) && m9.replayed.some((x) => /channels\.js:\d+ .*setImmediate/.test(x)), JSON.stringify(m9.replayed));
  // THE ACCEPTED BLIND SPOT, NAMED (accept-r2 claim 1 (c)): a COMPUTED name — `WO['press' + 'Of']`, `o['press' + 'ed']` —
  // is no identifier the AST walk can follow; the grep beside it reads every server file for that spelling. (The brief's
  // `press\s*\+|\[['"]press` also matches four innocent lines — «Impress + the», `['press-allow'`, «press+release»,
  // `['press', 'granted'` — so the grep keys on a member ACCESS, `x['press…`, and on a 'press' string concatenated.)
  const COMPUTED_PRESS_RE = /[\w$)\]]\s*\[\s*['"`]press|['"`]press['"`]\s*\+|`press\$\{/;
  const computed = trackedServerSource().filter((f) => COMPUTED_PRESS_RE.test(read(f)));
  ok('§2b r3 THE BLIND SPOT the AST census cannot read (a computed-name access to the press) — the grep beside it finds NONE in the tree', computed.length === 0, 'computed press access in: ' + computed.join(' '));
  const planted = { 'zz-mint.js': "const WO = require('../write-origin.js'); const mint = WO['press' + 'Of'];", 'zz-hop.js': "const p = o['press' + 'ed'];", 'zz-tpl.js': "const p = o[`press${'ed'}`];" };
  const named = Object.entries(planted).filter(([, src]) => COMPUTED_PRESS_RE.test(src)).map(([f]) => f);
  ok('§2b r3 CONTROL: the grep is red BY NAME for each computed spelling (' + named.join(', ') + ') and silent on the four innocent lines',
    named.length === 3 && !['LibreOffice Writer / Calc / Impress + the Start Center', "Object.freeze(['press-allow', 'press-deny'])", 'emits `button-action` press+release pairs', "Object.freeze(['press', 'granted'])"].some((x) => COMPUTED_PRESS_RE.test(x)));
  console.log(`    the census's cost: ${ms} ms over the tree, ${Date.now() - t1} ms for 10 patched copies (one file re-read each)`);
  const emptyWalks = Object.entries(PC.walks).filter(([, x]) => x.size === 0).map(([k]) => k);
  if (emptyWalks.length) console.log('    walks that reached no door: ' + emptyWalks.join(', '));
  // THE PURE LAW over the measured ledger: 30 stamps this hour (peer-message), the default cap 30
  // int361 seam: clock-relative fixture (lane owner-press-attended, pinned) — the measured timeline (now 2026-10-28T07:47:34Z, the
  // stamps from 07:21:33Z, the next free 08:21:33Z) rides the REAL clock: the guard prunes its ledger with Date.now() (24 h), so a
  // fixed date went red on every tree a day later. T0 = Date.now() − 5 min on a whole second; every instant = T0 + its offset.
  const T0 = Math.floor((Date.now() - 5 * 60e3) / 1000) * 1000, at = (iso) => T0 + (Date.parse(iso) - Date.parse('2026-10-28T07:47:34Z'));
  const isoZ = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
  const now = at('2026-10-28T07:47:34Z');
  const st = [...Array(30)].map((_, i) => ({ at: at('2026-10-28T07:21:33Z') + i * 1e4, reason: 'peer-message' }));
  const full = { v: 1, identities: { k: st }, instance: st, notices: {} };
  const who = { key: 'k', name: 'acct-1' };
  const ask = (M, reason, extra = {}) => M.authorizeUnattendedSpend({ reason, identity: who, state: full, limits: M.budgetLimits(() => undefined), now, ...extra });
  const press = ask(A, 'stash-handover');
  const retry = ask(A, 'stash-retry');
  ok('§2b a FULL hour (30 stamps, cap 30) AUTHORIZES the press `stash-handover` as attended — and still refuses its automatic twin `stash-retry` (hour-cap, next free 08:21:33Z)',
    press.ok === true && press.attended === true && retry.ok === false && retry.why === 'hour-cap' && retry.retryAfter === at('2026-10-28T08:21:33Z'), JSON.stringify({ press: [press.ok, press.attended], retry: [retry.ok, retry.why] }));
  const others = Object.keys(A.SPEND_REASONS).filter((r) => A.SPEND_REASONS[r].turn && !A.SPEND_REASONS[r].attended);
  ok('§2b …every attended reason passes a full hour, every other turn reason is refused by it (' + others.length + ' gated)',
    attended.every((r) => ask(A, r).ok === true) && others.every((r) => ask(A, r).why === 'hour-cap'));
  const n = A.noteUnattendedSpend(full, { identity: who, at: now + 36000, reason: 'stash-handover' });
  ok('§2b …and the press is NEVER CHARGED: no stamp (30 stay 30), no 80 % notice — only the attended tally (1)',
    n.state.identities.k.length === 30 && n.state.instance.length === 30 && n.warn === null && n.state.attended.length === 1 && n.state.attended[0].reason === 'stash-handover');
  const over = ask(A, 'stash-handover', { overage: { inUse: 'yes', ageMs: 60000 } });
  ok('§2b only the BUDGET is exempt: paid overage still refuses a press (a press is not an opt-in to paying overage)', over.ok === false && over.why === 'overage-in-use');
  const M0 = mutantModule('src/spend-authorizer.js', [["  if (isAttended(reason)) return { ok: true, attended: true,", "  if (false) return { ok: true, attended: true,"]]);
  const p0 = M0.mod ? ask(M0.mod, 'stash-handover') : null;
  ok('§2b CONTROL (the 6428c67e law, a patched copy): without the attended line the same press is refused hour-cap — the measured refusal', !!p0 && p0.ok === false && p0.why === 'hour-cap', M0.err || JSON.stringify(p0 && [p0.ok, p0.why]));

  // THE REAL GUARD over the same ledger on disk: no hold, no stamp, the tally in the snapshot; the twin refused and journaled
  const dir = tmpdir('vs-spend-attended-');
  fs.writeFileSync(path.join(dir, 'spend-budget.json'), JSON.stringify({ v: 1, budget: full }));
  const lines = [], items = [];
  const g = guardMod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => ({ add: (k, it) => { items.push(it); return it; } }), log: (l) => lines.push(l) });
  const gv = g.authorize({ reason: 'stash-handover', identity: who, cid: 'conv-1', now });
  g.note({ reason: 'stash-handover', identity: gv.identity, hold: gv.hold || null, now: now + 1000 });
  const snap = g.snapshot();
  ok('§2b the REAL guard: a press on a full ledger is authorized with NO hold, charged NO stamp, and the snapshot counts it as attended',
    gv.ok === true && gv.attended === true && !gv.hold && snap.holdsOpen === 0 && (snap.budget.identities.k || []).length === 30 && snap.attended['stash-handover'] === 1, JSON.stringify({ gv: [gv.ok, gv.attended, gv.hold], stamps: (snap.budget.identities.k || []).length, att: snap.attended }));
  const r1 = g.authorize({ reason: 'stash-retry', identity: who, cid: 'conv-1', now: now + 2000 });
  g.authorize({ reason: 'stash-retry', identity: who, cid: 'conv-1', now: now + 3000 });
  g.authorize({ reason: 'stash-retry', identity: who, cid: 'conv-1', now: now + 4000 });
  g.authorize({ reason: 'stash-retry', identity: who, cid: 'conv-1', now: now + 5 * 60e3 + 3000 });
  const spoke = lines.filter((l) => /^\[spend\] refused stash-retry/.test(l));
  ok('§2b R4: the refusal journal NAMES the conversation and SAYS what its 5-min dedupe swallowed (2 lines for 4 refusals, the second "(+2 more …)")',
    r1.ok === false && spoke.length === 2 && spoke.every((l) => l.includes('for conversation conv-1')) && /\(\+2 more in the 5 min after the previous line\)$/.test(spoke[1]) && !/\(\+/.test(spoke[0]), JSON.stringify(spoke));
  // r2 (accept-r1: «(+N more)» was said only on the NEXT line — five refusals then silence journaled ONE line, the other
  // four never): a window that SWALLOWED refusals is FLUSHED when it ends, by ONE bounded timer (injected here)
  {
    const dir2 = tmpdir('vs-spend-flush-');
    fs.writeFileSync(path.join(dir2, 'spend-budget.json'), JSON.stringify({ v: 1, budget: full }));
    const lines2 = [], timers = [];
    const g2 = guardMod.create({ dataDir: dir2, serverSetting: () => undefined, log: (l) => lines2.push(l), schedule: (fn, ms) => { const t = { fn, ms, cancelled: false }; timers.push(t); return t; }, unschedule: (t) => { t.cancelled = true; } });
    for (let i = 0; i < 5; i++) g2.authorize({ reason: 'stash-retry', identity: who, cid: 'conv-2', now: now + i * 12000 });
    const before = lines2.filter((l) => /^\[spend\] refused stash-retry/.test(l)).length;
    const armed = timers.filter((t) => !t.cancelled);
    for (const t of armed) t.fn();
    const flushed = lines2.filter((l) => /^\[spend\] refused stash-retry/.test(l));
    ok('§2b r2 R4: five refusals in a minute then SILENCE ⇒ the swallowed four are journaled when the 5-min window ends — «(+4 more in the last 5 min)», no sixth refusal needed (ONE bounded timer, armed for the window\'s end)',
      before === 1 && timers.length === 1 && armed.length === 1 && armed[0].ms === 5 * 60e3 - 12000 && flushed.length === 2 && /\(\+4 more in the last 5 min\)$/.test(flushed[1]) && flushed[1].includes('for conversation conv-2'), JSON.stringify({ before, timers: timers.map((t) => t.ms), flushed }));
    g2.authorize({ reason: 'stash-retry', identity: who, cid: 'conv-2', now: now + 5 * 60e3 + 1000 });
    const after = lines2.filter((l) => /^\[spend\] refused stash-retry/.test(l));
    ok('§2b r2 R4 …and the next window\'s first refusal says no stale count (the flushed four are not said twice)', after.length === 3 && !/\(\+/.test(after[2]), JSON.stringify(after.slice(-1)));
  }
  const it = items[0];
  ok('§2b R2: the For-you refusal carries its words as STRUCTURE — the account, the cap and the next free slot as an INSTANT CLAUSE ({next:{at, key, gone}}, r2) — and its English line names the instant in UTC (Z), never a hub-zone clock',
    !!it && it.i18n && it.i18n.text.params.account === 'acct-1' && it.i18n.text.params.cap === 30 && it.i18n.text.params.next && it.i18n.text.params.next.at === at('2026-10-28T08:21:33Z') && /\{next\}/.test(it.i18n.text.key)
      && new RegExp('Next allowed after ' + isoZ(at('2026-10-28T08:21:33Z')) + '\\.').test(it.text) && !/\b(AM|PM)\b/.test(it.text), JSON.stringify(it && { text: it.text, i18n: it.i18n }));

  // THE OWNER'S CHANNELS SEND: the adapter's reason follows a PERSON's decision (P.userDecidedSend), never the drafter alone
  const P = require(path.join(REPO, 'src/channel-policy.js'));
  ok('§2b userDecidedSend: the user composed it, or pressed Approve on it ⇒ attended; an agent\'s draft sent by POLICY ⇒ not',
    P.userDecidedSend({ draftedBy: { kind: 'user' }, approvedBy: 'policy' }) && P.userDecidedSend({ draftedBy: { kind: 'agent', id: 'c' }, approvedBy: 'user' })
      && !P.userDecidedSend({ draftedBy: { kind: 'agent', id: 'c' }, approvedBy: 'policy' }) && !P.userDecidedSend(null) && !P.userDecidedSend({}));
  const sent = [];
  const ag = require(path.join(REPO, 'src/channels/agents.js')).create({ id: 'agents' }, { deliver: { deliverToConversation: async (cid, text, o) => { sent.push(o.spendReason); return { ok: true, lane: 'message' }; } } });
  const PRESS = WO.pressOf({ headers: { 'sec-fetch-site': 'same-origin' } });
  await ag.send('conv-x', { text: 'hi', idemKey: 'p-1', byUser: true, pressed: PRESS });
  await ag.send('conv-x', { text: 'hi', idemKey: 'p-2' });
  await ag.send('conv-x', { text: 'hi', idemKey: 'p-3', byUser: true });
  ok('§2b the Agents adapter sends a person\'s decision WITH its door\'s press as owner-channel-send (attended); a decision with no press (r2: a retry, a request with no page) and anything else as peer-message', JSON.stringify(sent) === JSON.stringify(['owner-channel-send', 'peer-message', 'peer-message']), JSON.stringify(sent));
  ok('§2b …and the outbound engine hands the adapter that decision and the press on its ONE send line', /e\.adapter\.send\(p\.convId, \{[^\n]*\.\.\.files, byUser: P\.userDecidedSend\(p\), pressed, /.test(read('src/server/channels-outbound.js')));

  // THE DOOR, LIVE: the REAL hand-over route over express — every bearer 403 by name, a cookie-less browser request reaches it
  const express = require(path.join(REPO, 'node_modules/express'));
  const http = require('node:http');
  const drive = async (mod) => {
    const app = express(); app.use(express.json());
    const logs = [], events = [];
    const ev0 = global.__vsEvent;
    global.__vsEvent = (k, v) => { events.push(`${k}:${v}`); };
    mod.create({ activeSessions: new Map(), getDeliver: () => null, renderMsgStash: () => ({ text: '', shown: [], rest: [] }), renderNotifStash: () => '', log: { log: (l) => logs.push(l), warn() {} } }).register(app);
    const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
    const hit = (auth, page = false) => new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: srv.address().port, path: '/api/sessions/s1/stash/hand-over', method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}), ...(page ? { 'sec-fetch-site': 'same-origin' } : {}) } }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => res({ status: r.statusCode, code: (() => { try { return JSON.parse(b).code; } catch { return null; } })() })); }); rq.end('{}'); });
    const out = { vsst: await hit('Bearer vsst_' + 'a'.repeat(32)), jbt: await hit('Bearer jbt_' + 'b'.repeat(32)), vsak: await hit('Bearer vsak_' + 'c'.repeat(43)), vsakPage: await hit('Bearer vsak_' + 'c'.repeat(43), true), bare: await hit(null), none: await hit(null, true), again: await hit(null, true) };
    await new Promise((r) => srv.close(r));
    global.__vsEvent = ev0;
    return { ...out, logs, events };
  };
  const live = await drive(require(path.join(REPO, 'src/server/stash-handover.js')));
  ok('§2b the REAL hand-over door: vsst_, jbt_ and vsak_ bearers are each 403 agent_forbidden (a page header beside one changes nothing); the person\'s page (Sec-Fetch-Site same-origin) reaches the route (404 no_session)',
    ['vsst', 'jbt', 'vsak', 'vsakPage'].every((k) => live[k].status === 403 && live[k].code === 'agent_forbidden') && live.none.status === 404 && live.none.code === 'no_session', JSON.stringify(live));
  ok('§2b r2 AN ATTENDED DOOR IS A PERSON\'S DOOR: a header-less request (no bearer, no Origin, no Sec-Fetch-Site — a script on a sign-in-off instance) is 403 not_a_person, by name',
    live.bare.status === 403 && live.bare.code === 'not_a_person', JSON.stringify(live.bare));
  ok('§2b R4: a press refused for a reason that is NOT the ceiling is journaled ONCE per (conversation, code) per 5 min and counted in telemetry EVERY time (2 presses ⇒ 1 line, 2 events)',
    live.logs.filter((l) => /^\[stash\] hand-over refused for conversation s1 — no_session: /.test(l)).length === 1 && live.events.filter((e) => e === 'stash-handover-refused:no_session').length === 2, JSON.stringify({ logs: live.logs, events: live.events }));
  const Mh = mutantModule('src/server/stash-handover.js', [["        if (pressBearer(req.headers)) return res.status(403)", "        if (/^Bearer\\s+(vsst_|jbt_)/i.test(String(req.headers.authorization || ''))) return res.status(403)"], ["        if (!press) return res.status(403)", "        if (false) return res.status(403)"]]);
  const old = Mh.mod ? await drive(Mh.mod) : null;
  ok('§2b CONTROL (the 6428c67e / b8d2d98e door, a patched copy): vsst_ / jbt_ were already 403, an automation key\'s vsak_ REACHED the press, and so did the header-less script — and the fence reader calls that door unfenced',
    !!old && old.vsst.status === 403 && old.jbt.status === 403 && old.vsak.status === 404 && old.bare.status === 404 && !doorRefusesFirst(fs.readFileSync(Mh.file, 'utf8'), "app.post('/api/sessions/:id/stash/hand-over'").ok, Mh.err || JSON.stringify(old));
}

// ── §3 THE ORCH GUARD ───────────────────────────────────────────────────────
console.log('\n§3 the guard: persisted counters, one journal line, one inbox item');
{
  const dataDir = tmpdir('vs-spend-guard-');
  const logs = [], inbox = [];
  const settings = { 'spend.unattendedPerIdentityHour': 2 };
  const mk = () => guardMod.create({
    dataDir, serverSetting: (k) => settings[k],
    identityOf: (s) => (s && s.id ? { key: s.id, name: s.id.toUpperCase() } : null),
    getUserTodos: () => ({ add: (key, item) => { inbox.push({ key, ...item }); return { id: 'ut-' + inbox.length }; } }),
    log: (...a) => logs.push(a.join(' ')),
  });
  let g = mk();
  const S = { id: 'sub-a', name: 'conv' };
  ok('§3 the first two unattended turns are authorized', g.authorize({ reason: 'auto-resume', session: S }).ok === true);
  g.note({ reason: 'auto-resume', session: S });
  g.note({ reason: 'auto-resume', session: S });
  const r3 = g.authorize({ reason: 'auto-resume', session: S, sessionName: 'my conversation' });
  ok('§3 the third is refused by the hour cap', r3.ok === false && r3.why === 'hour-cap');
  ok('§3 the refusal reaches the JOURNAL once, naming the reason, the identity and the session',
    logs.filter((l) => /refused auto-resume/.test(l)).length === 1 && /SUB-A/.test(logs.join('\n')) && /hour-cap/.test(logs.join('\n')), logs.join(' | '));
  g.authorize({ reason: 'auto-resume', session: S }); g.authorize({ reason: 'auto-resume', session: S });
  ok('§3 …and repeats inside the 5min floor stay out of the journal (the incident wrote ~150 identical cards)',
    logs.filter((l) => /refused auto-resume/.test(l)).length === 1);
  const refusals = inbox.filter((i) => /VibeSpace refused/.test(i.text));
  ok('§3 the refusal reaches the USER: exactly one "For you" item, in the accounts row, naming the ceiling',
    refusals.length === 1 && refusals[0].key === 'accounts' && /cap 2/.test(refusals[0].text) && /2\/2 this hour/.test(refusals[0].detail), JSON.stringify(refusals[0] || inbox[0] || {}).slice(0, 220));

  g.flush();
  ok('§3 the ledger is on disk', fs.existsSync(path.join(dataDir, 'spend-budget.json')));
  const g2 = mk();  // ← A RESTART
  ok('§3 THE COUNTERS SURVIVE A RESTART (a release restart that hands the spenders a fresh hour is not a ceiling)',
    g2.authorize({ reason: 'auto-resume', session: S }).why === 'hour-cap');
  ok('§3 …and a different identity is still free after that restart',
    g2.authorize({ reason: 'auto-resume', session: { id: 'sub-b' } }).ok === true);

  // the 80% notice reaches the inbox too
  const inbox0 = inbox.length;   // (the 80% notice already fired above, at 2 of 2)
  settings['spend.unattendedPerIdentityHour'] = 10;
  const g3 = mk();
  for (let i = 0; i < 8; i++) g3.note({ reason: 'stop-nudge', session: { id: 'sub-c' } });
  ok('§3 the 80% notice is filed once, in the inbox, naming the budget', inbox.length === inbox0 + 1 && /8 of its 10 unattended turns/.test(inbox[inbox.length - 1].text), inbox[inbox.length - 1]?.text);
  const before = inbox.length;
  g3.note({ reason: 'stop-nudge', session: { id: 'sub-c' } });
  ok('§3 …and NOT again inside the same window', inbox.length === before);
}

// ── §3b THE CREDENTIAL READER IS THE ACCOUNT'S, NOT THE SLOT'S (r2) ─────────
// `credentialStateOf` was wired to `memberLoginState`, which reads the
// credential FILE and is deliberately oat-blind: it answers for a credential
// SLOT, and re-pointing a symlink can never hand a long-lived token to a
// running CLI. Asked about an ACCOUNT it is wrong for a supported, spawnable
// configuration — B-211a `oatOnly`, where `resolveForSpawn` returns
// `{oatOnly:true, localEnv:{CLAUDE_CODE_OAUTH_TOKEN}}` and there is NO
// credential file at all. Every unattended producer was refused on such an
// account FOREVER (unlike the hour/day caps this refusal never expires), with a
// reason — "cannot authorize a request right now" — that is factually false
// about an account serving turns normally.
console.log('\n§3b an oat-only subscription serves turns, so the ceiling must not call it dead');
{
  const dataDir = tmpdir('vs-spend-oat-');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) {
    console.log('  · SKIP (pooled accounts are unsupported on ' + process.platform + ')');
  } else {
    const OAT = am.createSubscription({ name: 'OatOnly' }).id;
    am.setOat(OAT, 'sk-ant-oat01-' + 'z'.repeat(48));
    // NEGATIVE CONTROL: wiped credential file, no token — nothing can serve it
    const DEAD = am.createSubscription({ name: 'Wiped' }).id;
    fs.writeFileSync(path.join(am.subDir(DEAD), '.credentials.json'),
      JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() + 29 * 86400e3 } }), { mode: 0o600 });
    // the shape the product actually spawns — the whole reason this matters
    let spawn = null; try { spawn = am.resolveForSpawn(OAT, 'claude'); } catch (e) { spawn = { err: e.message }; }
    ok('§3b the account is SPAWNABLE with no credential file (oatOnly ⇒ the token rides spawn env)',
      spawn && spawn.oatOnly === true && !!spawn.localEnv?.CLAUDE_CODE_OAUTH_TOKEN, JSON.stringify(spawn).slice(0, 140));

    // THE ENGINE'S OWN READERS, both of them, on the same account
    const eng2 = engMod.create({
      app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} },
      rootDir: path.dirname(dataDir), USAGE_CACHE_DIR: path.join(dataDir, 'usage-cache'),
      activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1,
      broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined,
      getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
      getAutoResume: () => null, getQuotaProbe: () => null,
      getUserTodos: () => null,
    });
    ok('§3b the SLOT reader still calls it unusable — deliberately, and that is its correct answer about a slot',
      eng2.memberLoginState(OAT)?.usable === false, JSON.stringify(eng2.memberLoginState(OAT)));
    ok('§3b the ACCOUNT reader says it CAN serve, and names the channel',
      eng2.accountCredentialState(OAT)?.usable === true && eng2.accountCredentialState(OAT)?.state === 'oat',
      JSON.stringify(eng2.accountCredentialState(OAT)));
    ok('§3b NEGATIVE CONTROL: a wiped account with no token is still dead to BOTH readers',
      eng2.memberLoginState(DEAD)?.usable === false && eng2.accountCredentialState(DEAD)?.usable === false);
    ok('§3b …and a key that is not a claude subscription gets NO OPINION from either (P6)',
      eng2.accountCredentialState('__global__') === null && eng2.accountCredentialState('pool-x') === null);

    // and the GUARD, through the engine's own construction, refuses nothing
    for (const reason of Object.keys(A.SPEND_REASONS)) {
      const v = eng2.spendGuard.authorize({ reason, identity: { key: OAT, name: 'OatOnly' } });
      ok(`§3b the ceiling AUTHORIZES ${reason} on the oat-only account`, v.ok === true, v.why + ': ' + v.detail);
    }
    const vd = eng2.spendGuard.authorize({ reason: 'auto-resume', identity: { key: DEAD, name: 'Wiped' } });
    ok('§3b NEGATIVE CONTROL: the wiped account is still refused (the fix widens nothing else)',
      vd.ok === false && vd.why === 'identity-cannot-serve', JSON.stringify(vd).slice(0, 140));

    // WIRING PIN: the guard must be built with the ACCOUNT reader
    const engSrc = read('src/server/usage-pool-engine.js');
    ok('§3b WIRING: the guard is constructed with accountCredentialState, not memberLoginState',
      /credentialStateOf: \(key\) => accountCredentialState\(key\)/.test(engSrc));
    ok('§3b …and memberLoginState is still what SLOT validation asks (the two questions stay two)',
      /const st = memberLoginState\(linkedId\)/.test(engSrc));
  }
}

// ── §3d THE LEDGER IS PRUNED BEFORE ANYBODY CAN ANSWER THE LIMITS (r5) ──────
// The guard is CONSTRUCTED by the pool engine, and server.js builds that engine
// ~318 lines before `setupPersistence()` assigns `persistenceRouter.readSettings`
// — so while the ledger is read off disk, `serverSetting` answers `undefined`
// for every key and `A.budgetLimits()` hands back the DEFAULTS. Pruning is
// IRREVERSIBLE and it FORGIVES MONEY: an owner day cap of 500 with 500 same-day
// stamps on disk was cut to the default retention (264) on EVERY BOOT, and the
// guard then authorized 236 more unattended turns today. This instance restarts
// several times a day.
console.log('\n§3d the boot load prunes with the widest retention, not with limits nobody can answer');
{
  // THE ORDERING IS THE DEFECT — pinned on the real files, because the leg
  // below is only interesting while this stays true.
  const srv = read('server.js');
  const iEngine = srv.indexOf("require('./src/server/usage-pool-engine.js').create({");
  const iSetup = srv.indexOf('setupPersistence({');
  const iReader = srv.indexOf('persistenceRouter.readSettings ? persistenceRouter.readSettings()');
  ok('§3d server.js builds the guard BEFORE the settings reader exists (the shape that makes this a defect)',
    iEngine > 0 && iSetup > iEngine && iReader > 0 && /router\.readSettings\s*=/.test(read('src/routes/persistence.js')),
    JSON.stringify({ engineAt: iEngine, setupAt: iSetup }));

  // The production boot shape: a reader that answers NOTHING until setup runs.
  const mkBoot = (mod, dir, stamps) => {
    let ready = false;
    const settings = {
      'spend.unattendedPerIdentityHour': 200,   // out of the way: the DAY axis is what this measures
      'spend.unattendedPerIdentityDay': 1000,   // above the DEFAULT retention (864 since 2.369.98) so the pre-fix prune has something to forget
      'spend.unattendedPerInstanceDay': 1000,
    };
    fs.writeFileSync(path.join(dir, 'spend-budget.json'),
      JSON.stringify({ v: 1, budget: { v: 1, identities: { 'sub-A': stamps }, instance: stamps, notices: {} }, nudge: {} }));
    const g = mod.create({
      dataDir: dir, serverSetting: (k) => (ready ? settings[k] : undefined),
      identityOf: () => ({ key: 'sub-A', name: 'A' }), getUserTodos: () => null, log: () => { },
    });
    ready = true;                     // …and now setupPersistence() has run
    return g;
  };
  const now = Date.now();
  // 1000 spends spread across the last 20 h — the owner's day cap, exactly met
  const stamps = Array.from({ length: 1000 }, (_, i) => now - Math.round((i + 1) * (20 * 3600 * 1000 / 1000)));
  {
    const g = mkBoot(guardMod, tmpdir('vs-spend-boot-'), stamps);
    const v = g.authorize({ reason: 'auto-resume', identity: { key: 'sub-A', name: 'A' } });
    ok('§3d the whole day survives the restart: 1000 of 1000 counted, so the 1001st is REFUSED',
      v.ok === false && v.why === 'day-cap' && v.counts.day === 1000, JSON.stringify({ why: v.why, counts: v.counts }));
  }
  {   // NEGATIVE CONTROL: the same world with the pre-fix line restored
    const m = mutantModule('src/server/spend-guard.js', [[
      'state = A.pruneBudget(raw.budget || raw, Date.now(), A.LOAD_RETENTION);',
      'state = A.pruneBudget(raw.budget || raw, Date.now(), A.budgetLimits(serverSetting));']]);
    ok('§3d NEGATIVE CONTROL: the pre-fix line was re-applied to the copy (an unapplied patch is a green control)',
      !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const g = mkBoot(m.mod, tmpdir('vs-spend-boot-pre-'), stamps);
      const v = g.authorize({ reason: 'auto-resume', identity: { key: 'sub-A', name: 'A' } });
      ok('§3d NEGATIVE CONTROL: pruning with the DEFAULTS forgets 136 of them and authorizes the 1001st (retention 864 = 800 + headroom since 2.369.98)',
        v.ok === true && v.counts.day === A.stampCap(null) && A.stampCap(null) === 864,
        JSON.stringify({ ok: v.ok, day: v.counts.day, defaultCap: A.stampCap(null) }));
    }
  }
  // …and the wide retention is BOUNDED: it is the widest any offerable cap can
  // count, never "keep everything" (memory is the cost of the safe direction,
  // so the cost has to have a number).
  ok('§3d LOAD_RETENTION is the schema-max retention, not unbounded',
    A.stampCap(A.LOAD_RETENTION) === A.CAP_MAX.perInstanceDay + 64
    && A.stampCap(A.LOAD_RETENTION) > A.stampCap(null), String(A.stampCap(A.LOAD_RETENTION)));
  {
    const dir = tmpdir('vs-spend-boot-cap-');
    const many = Array.from({ length: 20000 }, (_, i) => now - i * 1000);
    fs.writeFileSync(path.join(dir, 'spend-budget.json'),
      JSON.stringify({ v: 1, budget: { v: 1, identities: { x: many }, instance: many, notices: {} } }));
    const g = guardMod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => null, log: () => { } });
    ok('§3d …so a 20,000-stamp ledger loads bounded (the safe direction costs memory, and the memory is capped)',
      g.snapshot().budget.identities.x.length <= A.CAP_MAX.perInstanceDay + 64, String(g.snapshot().budget.identities.x.length));
  }
}

// ── §3f B-3b0f: AN UNREADABLE LEDGER REFUSES; IT IS NEVER AN EMPTY ONE ───────
// The account-reset-door r4 panel (2026-11-11): create() wrapped JSON.parse in try { } catch { } and went on with an
// EMPTY budget when data/spend-budget.json was torn or a directory — three unattended continues were authorized as if no
// turn had been spent; and the next persist renamed that empty ledger OVER the file, so one restart made the forgiveness
// permanent. The law (the routing table, «A turn nobody typed»): all three money-gate layers fail CLOSED.
console.log('\n§3f B-3b0f: an unreadable ledger refuses every unattended turn by name, once in the tray, and is never written over');
{
  const LF = path.join;
  const ID = { key: 'sub-a', name: 'A' }, ID2 = { key: 'sub-b', name: 'B' };
  const TORN = '{"v":1,"budget":{"v":1,"identities":{"sub-a":[';
  const mk = (mod, dir, inbox, logs, settings = {}) => mod.create({
    dataDir: dir, serverSetting: (k) => settings[k],
    getUserTodos: () => ({ add: (key, item) => { inbox.push({ key, ...item }); return { id: 'ut-' + inbox.length }; } }),
    log: (...a) => logs.push(a.join(' ')),
  });
  const world = (setup) => { const dir = tmpdir('vs-spend-3f-'); setup(LF(dir, 'spend-budget.json')); return dir; };
  const now = Date.now();
  // (1) a TORN file: every unattended reason refused by name, for every account; ONE notice for the instance
  {
    const dir = world((f) => fs.writeFileSync(f, TORN));
    const inbox = [], logs = [];
    const g = mk(guardMod, dir, inbox, logs);
    const v1 = g.authorize({ reason: 'auto-resume', identity: ID, now });
    const v2 = g.authorize({ reason: 'peer-message', identity: ID2, now: now + 1000 });
    const v3 = g.authorize({ reason: 'job-notification', identity: ID, now: now + 2000 });
    ok('§3f a TORN ledger refuses every unattended reason BY NAME, on every account (never «allowed on an empty count»)',
      [v1, v2, v3].every((v) => v.ok === false && v.why === 'ledger-unreadable') && /could not be read \(not JSON\)/.test(v1.detail), JSON.stringify([v1.why, v2.why, v3.why, v1.detail]));
    const notes = inbox.filter((i) => i.origin === 'spend');
    ok('§3f …and the tray gets exactly ONE notice for the instance (not one per account), urgent, naming the file and its door',
      notes.length === 1 && notes[0].key === 'accounts' && notes[0].urgency === 'high' && /spend-budget\.json could not be read \(not JSON\)/.test(notes[0].detail)
        && notes[0].i18n && notes[0].i18n.door === 'ledger' && !/Unattended turns used/.test(notes[0].detail), JSON.stringify(notes.map((n) => [n.key, n.urgency, n.detail.slice(0, 120)])));
    ok('§3f …and the journal says it at load, before any refusal', /^\[spend\] data\/spend-budget\.json could not be read \(not JSON\)/.test(logs[0] || ''), logs[0]);
    ok('§3f …the snapshot says it (Diagnostics can read it)', g.snapshot().ledgerUnreadable && g.snapshot().ledgerUnreadable.error === 'not JSON');
    const att = g.authorize({ reason: 'owner-channel-send', identity: ID, now: now + 3000 });
    ok('§3f a person\'s press is not refused — the ceiling never counts it, so an unreadable count cannot decide it', att.ok === true && att.attended === true, JSON.stringify(att.why));
    g.note({ reason: 'owner-channel-send', identity: ID, now: now + 3000 });
    g.noteNudge('claude:c1', { at: now + 3000 });
    g.flush();
    ok('§3f THE FILE IS NEVER WRITTEN OVER: after a press, a nudge and the exit flush its bytes are the torn bytes', fs.readFileSync(LF(dir, 'spend-budget.json'), 'utf8') === TORN && !fs.existsSync(LF(dir, 'spend-budget.json.tmp')));
    const g2 = mk(guardMod, dir, [], []);   // ← A RESTART
    ok('§3f …so a RESTART still refuses (the release: the flush made an empty ledger the record, and the next boot authorized)',
      g2.authorize({ reason: 'auto-resume', identity: ID, now: now + 4000 }).why === 'ledger-unreadable');
    // (2) READ AGAIN: inside the re-read bound still refused; after it, the file's own stamps count — and the press made meanwhile is kept
    fs.writeFileSync(LF(dir, 'spend-budget.json'), JSON.stringify({ v: 1, budget: { v: 1, identities: { 'sub-a': [now - 60e3, now - 50e3] }, instance: [now - 60e3, now - 50e3], notices: {} }, nudge: {} }));
    const g3inbox = [], g3logs = [];
    const g3 = mk(guardMod, world((f) => fs.mkdirSync(f)), g3inbox, g3logs);   // (a fresh world for the directory below)
    ok('§3f NO SYNCHRONOUS RE-READ: a repaired file is not read inside authorize (the readers\' round) — still refused until the guard\'s own async re-read',
      g.authorize({ reason: 'auto-resume', identity: ID, now: now + 30e3 }).why === 'ledger-unreadable' && guardMod.LEDGER_RECHECK_MS === 60e3);
    const reread = await g.recheckLedger();
    const back = g.authorize({ reason: 'auto-resume', identity: ID, now: now + 70e3 });
    ok('§3f REPAIRED: the async re-read finds it — its two stamps count (2 this hour), the turn is allowed, the refusal ends',
      reread === true &&
      back.ok === true && back.counts.hour === 2 && g.snapshot().ledgerUnreadable === null && /reads again/.test(logs.join('\n')), JSON.stringify({ ok: back.ok, why: back.why, hour: back.counts && back.counts.hour }));
    ok('§3f …and the press made while it was unreadable is KEPT beside the file\'s stamps (a stamp is never dropped)',
      Object.values(g.snapshot().attended || {}).reduce((a, b) => a + (Number(b) || 0), 0) === 1, JSON.stringify(g.snapshot().attended));
    g.release({ hold: back.hold, now: now + 70e3 });
    g.flush();
    ok('§3f …and from then on it is written as before', /"sub-a"/.test(fs.readFileSync(LF(dir, 'spend-budget.json'), 'utf8')) && fs.readFileSync(LF(dir, 'spend-budget.json'), 'utf8') !== TORN);
    // (3) A DIRECTORY in its place (the panel's second scene): refused; removed by the owner ⇒ the count starts over
    const d3 = g3.authorize({ reason: 'stop-nudge', identity: ID, now });
    ok('§3f a DIRECTORY in the file\'s place refuses by name (EISDIR), and nothing is left beside it (no .tmp)',
      d3.ok === false && d3.why === 'ledger-unreadable' && /EISDIR/.test(d3.detail), d3.detail);
    g3.flush();
    ok('§3f …the flush writes nothing (no rename onto the directory, no stranded .tmp)', fs.statSync(g3._file).isDirectory() && !fs.existsSync(g3._file + '.tmp'));
    fs.rmSync(g3._file, { recursive: true, force: true });
    await g3.recheckLedger();
    const d3b = g3.authorize({ reason: 'stop-nudge', identity: ID, now: Date.now() + 61e3 });
    ok('§3f REMOVED by the owner: past the bound the count starts over — allowed, said in the journal, and the file is written again',
      d3b.ok === true && /was removed — the count starts over/.test(g3logs.join('\n')) && (g3.release({ hold: d3b.hold }), g3.flush(), fs.statSync(g3._file).isFile()), JSON.stringify({ why: d3b.why, logs: g3logs.slice(-2) }));
  }
  // (4) NOT A LEDGER: JSON that is no object — null, an array, a number — is unreadable too; NOTHING ON DISK is a fresh start
  for (const [label, text] of [['null', 'null'], ['an array', '[1,2]'], ['a number', '7'], ['an empty object', '{}'], ['a budget that is a string', '{"budget":"x"}'], ['a budget that is an array', '{"v":1,"budget":[]}']]) {
    const dir = world((f) => fs.writeFileSync(f, text));
    const v = mk(guardMod, dir, [], []).authorize({ reason: 'auto-resume', identity: ID, now });
    ok(`§3f a file holding ${label} is no ledger — refused by name`, v.ok === false && v.why === 'ledger-unreadable' && /not a ledger object/.test(v.detail), v.why);
  }
  {   // ONE For-you item across restarts (its itemKey), and it is RESOLVED the moment the file reads again
    const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
    const dir = world((f) => fs.writeFileSync(f, TORN));
    const store = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
    const mkS = () => guardMod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => store, log: () => { } });
    mkS().authorize({ reason: 'auto-resume', identity: ID, now });
    mkS().authorize({ reason: 'auto-resume', identity: ID, now: now + 1000 });   // ← a restart, still unreadable
    const open1 = (store.snapshot().open || []).filter((i) => i.itemKey === 'spend-ledger-unreadable');
    // IT UN-STICKS BY ITSELF (the readers' round): an idle hub — no unattended ask, no write — re-reads on its own timer
    const timers = [];
    const g = guardMod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => store, log: () => { }, schedule: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, unschedule: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } });
    const armed = timers.length === 1 && timers[0].ms === guardMod.LEDGER_RECHECK_MS;
    timers.shift().fn();   // a minute passes, still torn: it re-arms
    for (let i = 0; i < 20 && !timers.length; i++) await tick(5);
    const rearmed = timers.length === 1;
    fs.writeFileSync(LF(dir, 'spend-budget.json'), JSON.stringify({ v: 1, budget: { v: 1, identities: {}, instance: [], notices: {} }, nudge: {} }));
    timers.shift().fn();   // the next minute: the repaired file reads
    for (let i = 0; i < 40 && g.snapshot().ledgerUnreadable; i++) await tick(5);
    const open2 = (store.snapshot().open || []).filter((i) => i.itemKey === 'spend-ledger-unreadable');
    store.stop();
    ok('§3f the notice is ONE For-you item across a restart (its own itemKey), and the file reading again RESOLVES it — never a stale «refused» standing for 6 h',
      open1.length === 1 && open2.length === 0, JSON.stringify({ open1: open1.length, open2: open2.length }));
    ok('§3f IT UN-STICKS BY ITSELF: while unreadable the guard arms its own re-read (one timer, LEDGER_RECHECK_MS, re-armed while still torn) — an idle hub recovers within a minute of the repair; a timer, so a clock that steps back changes nothing',
      armed && rearmed && g.snapshot().ledgerUnreadable === null && timers.length === 0, JSON.stringify({ armed, rearmed, left: timers.length }));
  }
  {   // (r2, the follow-up's read S4) A READ THAT NEVER SETTLES (a hung mount) never ends the self-recheck, and is never joined
    const runHung = async (mod) => {
      const dir = world((f) => fs.writeFileSync(f, TORN));
      const timers = []; let reads = 0;
      mod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => null, log: () => { },
        schedule: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, unschedule: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
        readLedgerAsync: () => { reads++; return new Promise(() => { }); } });
      const out = [];
      for (let k = 0; k < 3; k++) { const t = timers.shift(); if (t) t.fn(); await tick(5); out.push({ reads, armed: timers.length }); }
      return out;
    };
    const r = await runHung(guardMod);
    ok('§3f (r2) A READ THAT NEVER SETTLES: the self-recheck stays armed at every tick, and the read in flight is never joined by a second (a hung mount\'s threads are not piled up)',
      r.every((x) => x.reads === 1 && x.armed === 1), JSON.stringify(r));
    const m = mutantModule('src/server/spend-guard.js', [['recheckTimer = schedule(() => { recheckTimer = null; recheckLedger().catch(() => false); if (unreadable) armRecheck(); }, LEDGER_RECHECK_MS);', 'recheckTimer = schedule(() => { recheckTimer = null; recheckLedger().catch(() => false).then(() => { if (unreadable) armRecheck(); }); }, LEDGER_RECHECK_MS);']]);
    ok('§3f (r2) CONTROL: the re-arm only after the read settled (the follow-up\'s first form) in a copy (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) { const rm = await runHung(m.mod); ok('§3f (r2) CONTROL: with it, one read that never settles ENDS the self-recheck — no timer is left armed — RED', rm[0].armed === 0, JSON.stringify(rm)); }
    // what is not a regular file (a FIFO in the ledger's place would hold the read for ever) is unreadable by name, never opened
    const dir = tmpdir('vs-spend-3f-notfile-');
    fs.mkdirSync(LF(dir, 'spend-budget.json'), { recursive: true });
    const gd = guardMod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => null, log: () => { }, schedule: () => null });
    await gd.recheckLedger();
    ok('§3f (r2) the default re-read never opens what is not a regular file: it stays unreadable, named «not a regular file»', gd.snapshot().ledgerUnreadable && gd.snapshot().ledgerUnreadable.error === 'not a regular file', JSON.stringify(gd.snapshot().ledgerUnreadable));
  }
  {
    const dir = tmpdir('vs-spend-3f-none-');
    const v = mk(guardMod, dir, [], []).authorize({ reason: 'auto-resume', identity: ID, now });
    ok('§3f NO FILE (ENOENT) is a first start, not a failure: allowed, nothing said', v.ok === true && v.why === null);
  }
  // (5) A READ ERROR that is not ENOENT (a file the hub may not read) — through the guard's read SEAM, never chmod (the readers'
  // round: a mode-0 file is readable by root, so the old leg could pass by skipping — a skip is not a pass)
  for (const code of ['EACCES', 'EIO']) {
    const dir = world((f) => fs.writeFileSync(f, '{"v":1,"budget":{"v":1,"identities":{},"instance":[],"notices":{}}}'));
    const g = guardMod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => null, log: () => { }, schedule: () => null, readLedgerSync: () => { throw Object.assign(new Error(code), { code }); } });
    const v = g.authorize({ reason: 'auto-resume', identity: ID, now });
    ok(`§3f a file the hub may not read (${code}, through the read seam) refuses by name`, v.why === 'ledger-unreadable' && new RegExp(code).test(v.detail), v.detail);
  }
  // (6) THE WORDS: rendered through the client's own renderer, en / zh / ja — no count line (there is none), the ledger door;
  // and the hand-over toast says it in words, never the bare `why`
  {
    const LY = await import(path.join(REPO, 'src/lib/user-todos-layout.js'));
    const { dictEntries } = await import('./i18n-extract.mjs');
    const dict = (f) => new Map([...dictEntriesOnce(dictEntries, read(f))].map((e) => [e.key, e.value]));
    const ZH = dict('src/lib/i18n-zh.js'), JA = dict('src/lib/i18n-ja.js');
    const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
    const T = { en: (k, p) => fill(k, p), zh: (k, p) => fill(ZH.has(k) ? ZH.get(k) : `«MISSING ${k}»`, p), ja: (k, p) => fill(JA.has(k) ? JA.get(k) : `«MISSING ${k}»`, p) };
    const v = { ok: false, why: 'ledger-unreadable', reason: 'auto-resume', identity: ID, limits: A.BUDGET_DEFAULTS, counts: { hour: 0, day: 0, instanceDay: 0 }, retryAfter: 0, detail: 'x' };
    const item = { i18n: A.refusalI18n(v, { sessionName: 'build-bot' }) };
    const out = Object.fromEntries(['en', 'zh', 'ja'].map((l) => { const said = (x) => LY.saidLine(x, T[l], { now, locale: l, timeZone: 'America/Los_Angeles' }); return [l, { text: LY.itemTextOf(item, said), lines: LY.itemDetailLinesOf(item, said) }]; }));
    console.log('    en: ' + out.en.text + ' / ' + out.en.lines.join(' / '));
    const all = (o) => o.text + '\n' + o.lines.join('\n');
    ok('§3f the notice, en: the producer, the conversation, «could not be read», the ledger door (repair or remove) — and NO count line',
      /the continue after a usage limit in «build-bot»: its record of turns nobody typed could not be read/.test(out.en.text) && /repair it, or remove it to start the count over/.test(all(out.en)) && !/Turns nobody typed:|0 of 30/.test(all(out.en)), all(out.en));
    ok('§3f …in zh and ja, every line in the language (no MISSING)', ['zh', 'ja'].every((l) => !/MISSING/.test(all(out[l])) && /spend-budget\.json/.test(all(out[l]))) && /账本读不出来/.test(out.zh.text) && /記録を読めない/.test(out.ja.text), all(out.zh) + ' || ' + all(out.ja));
    const SSm = require(path.join(REPO, 'src/stash-summary.js'));
    const toast = (l) => SSm.handOverRefusalWords({ code: 'spend_refused', why: 'ledger-unreadable', identity: ID }, T[l], { now }).text;
    ok('§3f the hand-over toast says it in words (en / zh / ja), never «the spend ceiling refused this turn (ledger-unreadable)»',
      /could not read its record of turns nobody typed/.test(toast('en')) && !/ledger-unreadable/.test(toast('en')) && ['zh', 'ja'].every((l) => !/MISSING/.test(toast(l))), toast('en'));
  }
  // RED CONTROLS — patched copies of the real modules
  {   // the release's load: an unreadable file is an empty budget
    const m = mutantModule('src/server/spend-guard.js', [['  if (loaded.error) {\n', '  if (false) {\n']]);
    ok('§3f CONTROL: the release\'s load re-applied to a copy (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const dir = world((f) => fs.writeFileSync(f, TORN));
      const g = mk(m.mod, dir, [], []);
      const v = g.authorize({ reason: 'auto-resume', identity: ID, now });
      if (v.hold) g.note({ reason: 'auto-resume', identity: ID, hold: v.hold, now });
      g.flush();
      ok('§3f CONTROL: with it, the torn ledger AUTHORIZES on an empty count and the flush writes the empty count over the file — RED',
        v.ok === true && fs.readFileSync(LF(dir, 'spend-budget.json'), 'utf8') !== TORN, JSON.stringify({ ok: v.ok }));
    }
  }
  {   // the write guard removed: the refusal alone, the file still written over
    const m = mutantModule('src/server/spend-guard.js', [['    if (unreadable) {   // B-3b0f: never written over', '    if (false) {   // B-3b0f: never written over']]);
    ok('§3f CONTROL: the write guard removed from a copy (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const dir = world((f) => fs.writeFileSync(f, TORN));
      const g = mk(m.mod, dir, [], []);
      g.noteNudge('claude:c1', { at: now }); g.flush();
      const g2 = mk(m.mod, dir, [], []);
      ok('§3f CONTROL: with it, one flush makes an empty ledger the record and the next boot AUTHORIZES — RED',
        fs.readFileSync(LF(dir, 'spend-budget.json'), 'utf8') !== TORN && g2.authorize({ reason: 'auto-resume', identity: ID, now }).ok === true);
    }
  }
  {   // the pure rule removed: the authorizer ignores `ledger`
    const m = mutantModule('src/spend-authorizer.js', [['  if (ledger && ledger.unreadable) return no(', '  if (false) return no(']]);
    ok('§3f CONTROL: the pure rule removed from a copy of the authorizer (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const args = { reason: 'auto-resume', identity: ID, state: A.emptyBudget(), limits: A.BUDGET_DEFAULTS, ledger: { unreadable: true, error: 'not JSON' }, now };
      ok('§3f CONTROL: the real rule refuses an unreadable ledger, the copy without it ALLOWS — RED', A.authorizeUnattendedSpend(args).why === 'ledger-unreadable' && m.mod.authorizeUnattendedSpend(args).ok === true);
    }
  }
}

// ── §3g B-23c3: A FIRST START IS TOLD APART FROM A RECORD THAT WENT ─────────
// bl-accounts batch 1's verdict (主开发 2026-11-18 00:49Z): spend-guard read ENOENT as «nothing spent yet», so a first boot, an rm, a
// cleanup script and a restore without the file looked the same — the count of turns nobody typed went back to zero in silence. The
// marker beside the ledger (data/spend-budget.born.json) tells them apart; removing the file stays the owner's door (B-3b0f) but a reset
// is SAID (the journal, ONE For-you item) and COUNTED (the marker, the snapshot), and the record is written at once.
console.log('\n§3g B-23c3: a first start is silent; a removed ledger or an older copy put back resets the count SAID and COUNTED');
{
  const LF = path.join;
  const ID = { key: 'sub-a', name: 'A' };
  const mk = (mod, dir, inbox, logs) => mod.create({ dataDir: dir, serverSetting: () => undefined,
    getUserTodos: () => ({ add: (key, item) => { inbox.push({ key, ...item }); return { id: 'ut-' + inbox.length }; } }),
    log: (...a) => logs.push(a.join(' ')) });
  const resets = (inbox) => inbox.filter((i) => i.itemKey === 'spend-ledger-reset');
  const said = (logs) => logs.some((l) => /reset #\d+ of this record/.test(l));
  const t3g = Date.now();
  // (1) A FIRST START: neither file — silent; the first write leaves the ledger and its marker at seq 1
  const dir = tmpdir('vs-spend-3g-');
  {
    const inbox = [], logs = []; const g = mk(guardMod, dir, inbox, logs);
    ok('§3g a FIRST START (no ledger, no marker) is silent: no notice, no reset line, nothing counted', resets(inbox).length === 0 && !said(logs) && g.snapshot().ledgerResets === 0, JSON.stringify(logs));
    g.note({ reason: 'auto-resume', identity: ID, now: t3g }); g.flush();
    const L1 = JSON.parse(fs.readFileSync(LF(dir, 'spend-budget.json'), 'utf8')), M1 = JSON.parse(fs.readFileSync(LF(dir, 'spend-budget.born.json'), 'utf8'));
    ok('§3g …its first write carries seq 1, and the marker beside it the same seq, its birth and no reset', L1.seq === 1 && M1.seq === 1 && M1.resets === 0 && M1.born > 0 && !M1.lastReset, JSON.stringify([L1.seq, M1]));
  }
  // (2) REMOVED: the ledger gone, the marker kept — the count starts over (the owner's door) but SAID and COUNTED, written at once
  fs.rmSync(LF(dir, 'spend-budget.json'));
  {
    const inbox = [], logs = []; const g = mk(guardMod, dir, inbox, logs);
    const r = resets(inbox);
    ok('§3g a REMOVED ledger (its marker stands): ONE notice in the tray, urgent, its words and the count of resets; the journal says it',
      r.length === 1 && r[0].key === 'accounts' && r[0].urgency === 'high' && /removed — the count started over/.test(r[0].text) && r[0].i18n && r[0].i18n.detail[0].params.n === 1
        && logs.some((l) => /was removed — the count starts over \(this data folder has kept one since .*\); reset #1 of this record/.test(l)), JSON.stringify([r.map((x) => x.text), logs]));
    ok('§3g …the count starts over (the door kept: an unattended turn is allowed on a zero count)', g.authorize({ reason: 'auto-resume', identity: ID, now: t3g + 1000 }).ok === true);
    ok('§3g …COUNTED (the snapshot and the marker: reset #1, removed) and the record written at once — a restart reads it whole',
      g.snapshot().ledgerResets === 1 && g.snapshot().ledgerLastReset && g.snapshot().ledgerLastReset.kind === 'removed' && fs.existsSync(LF(dir, 'spend-budget.json'))
        && JSON.parse(fs.readFileSync(LF(dir, 'spend-budget.born.json'), 'utf8')).resets === 1, JSON.stringify(g.snapshot().ledgerLastReset));
    const inbox2 = [], logs2 = []; mk(guardMod, dir, inbox2, logs2);
    ok('§3g …and the NEXT start is silent (a reset is said once, never at every boot)', resets(inbox2).length === 0 && !said(logs2), JSON.stringify(logs2));
  }
  // (3) AN OLDER COPY PUT BACK: the ledger's seq below the marker's — read (it is a record) but SAID and COUNTED
  {
    const g0 = mk(guardMod, dir, [], []);
    const older = fs.readFileSync(LF(dir, 'spend-budget.json'), 'utf8');
    g0.note({ reason: 'auto-resume', identity: ID, now: t3g + 2000 }); g0.flush(); g0.note({ reason: 'auto-resume', identity: ID, now: t3g + 3000 }); g0.flush();
    fs.writeFileSync(LF(dir, 'spend-budget.json'), older);   // a restore from an older backup
    const inbox = [], logs = []; const g = mk(guardMod, dir, inbox, logs);
    const r = resets(inbox);
    ok('§3g an OLDER COPY put back (its seq below the marker\'s): ONE notice and the journal name it — reset #2',
      r.length === 1 && /older copy/i.test(r[0].text) && r[0].i18n.detail[0].params.n === 2 && logs.some((l) => /OLDER copy \(write \d+ of \d+\).*reset #2/.test(l)), JSON.stringify([r.map((x) => x.text), logs]));
    ok('§3g …COUNTED (reset #2, older), and the next write numbers above the marker', g.snapshot().ledgerResets === 2 && g.snapshot().ledgerLastReset.kind === 'older' && g.snapshot().ledgerSeq > 0, JSON.stringify(g.snapshot().ledgerLastReset));
  }
  // (4) RED: the load as before (ENOENT = nothing spent yet; the marker never read) — a removed ledger resets in silence
  {
    const d2 = tmpdir('vs-spend-3g-red-');
    const g1 = mk(guardMod, d2, [], []); g1.note({ reason: 'auto-resume', identity: ID, now: t3g }); g1.flush();
    fs.rmSync(LF(d2, 'spend-budget.json'));
    const { anchored } = await import('./scratch.mjs');
    let gm = null, err = null;
    try { gm = require(MUT.write('src/server/spend-guard.js', anchored(read('src/server/spend-guard.js'), "    if (ld.missing && mk.mark) judgeGone({}, now);", "    if (false) judgeGone({}, now);", 'B-23c3: the marker never read'))); } catch (e) { err = e.message; }
    ok('§3g CONTROL: a copy whose load never reads the marker (the patch is anchored, it hit)', !!gm && !err, err || '');
    if (gm) {
      const inbox = [], logs = []; const g = mk(gm, d2, inbox, logs);
      ok('§3g CONTROL: that copy resets the count in SILENCE — no notice, no line, nothing counted (RED: the release\'s road)', resets(inbox).length === 0 && !said(logs) && g.snapshot().ledgerResets === 0, JSON.stringify(logs));
    }
  }
  // (5) THE OWNER'S DOOR FROM B-3b0f: an unreadable ledger removed while it is refused — said and counted the same way
  {
    const d3 = tmpdir('vs-spend-3g-door-');
    const g1 = mk(guardMod, d3, [], []); g1.note({ reason: 'auto-resume', identity: ID, now: t3g }); g1.flush();
    const M3 = JSON.parse(fs.readFileSync(LF(d3, 'spend-budget.born.json'), 'utf8'));
    fs.writeFileSync(LF(d3, 'spend-budget.born.json'), JSON.stringify({ ...M3, resets: 2 }));   // this folder's two earlier resets
    fs.writeFileSync(LF(d3, 'spend-budget.json'), '{"v":1,"budget":{');   // torn
    const inbox = [], logs = []; const g = mk(guardMod, d3, inbox, logs);
    ok('§3g a torn ledger is refused by name (B-3b0f, unchanged) — no reset is said while it is only unreadable', g.authorize({ reason: 'auto-resume', identity: ID, now: t3g + 1000 }).why === 'ledger-unreadable' && resets(inbox).length === 0);
    fs.rmSync(LF(d3, 'spend-budget.json'));
    const back = await g.recheckLedger();
    ok('§3g …removed by its owner (the stated door): the refusal ends, and the reset is SAID and COUNTED — #3, the marker read while the ledger could not be (its history kept)',
      back === true && resets(inbox).length === 1 && g.snapshot().ledgerResets === 3 && resets(inbox)[0].i18n.detail[0].params.n === 3 && g.authorize({ reason: 'auto-resume', identity: ID, now: t3g + 3 * 60e3 }).ok === true, JSON.stringify([back, resets(inbox).length, logs.slice(-2)]));
  }
  // (6) B-3b0f's road the other way (the reader's MUST): a torn ledger REPAIRED from an older copy — said and counted, never silent
  {
    const d4 = tmpdir('vs-spend-3g-repair-');
    const g1 = mk(guardMod, d4, [], []); g1.note({ reason: 'auto-resume', identity: ID, now: t3g }); g1.flush();
    const older = fs.readFileSync(LF(d4, 'spend-budget.json'), 'utf8');
    g1.note({ reason: 'auto-resume', identity: ID, now: t3g + 1000 }); g1.flush();
    fs.writeFileSync(LF(d4, 'spend-budget.json'), '{"v":1,"budget":{');   // torn
    const inbox = [], logs = []; const g = mk(guardMod, d4, inbox, logs);
    fs.writeFileSync(LF(d4, 'spend-budget.json'), older);   // repaired from an older backup
    const back = await g.recheckLedger();
    ok('§3g a torn ledger REPAIRED FROM AN OLDER COPY: it reads again, and the older copy is SAID and COUNTED (the release\'s road was silent)',
      back === true && resets(inbox).length === 1 && /older copy/i.test(resets(inbox)[0].text) && g.snapshot().ledgerLastReset.kind === 'older' && logs.some((l) => /OLDER copy \(write 1 of 2\)/.test(l)), JSON.stringify([back, resets(inbox).map((x) => x.text), logs.slice(-3)]));
  }
  // (7) A LEDGER WITH NO WRITE NUMBER that LACKS a turn the marker counted (a copy from before the marker, put back): its own words.
  //     B-ef83 (主开发 19:20Z: a reset notice only for a REAL loss): no number alone is no loss — §3h (2) holds the CURRENT one silent
  {
    const d5 = tmpdir('vs-spend-3g-unnumbered-');
    const g1 = mk(guardMod, d5, [], []); g1.note({ reason: 'auto-resume', identity: ID, now: t3g }); g1.flush();
    const L = JSON.parse(fs.readFileSync(LF(d5, 'spend-budget.json'), 'utf8')); delete L.seq;
    g1.note({ reason: 'auto-resume', identity: ID, now: t3g + 1000 }); g1.flush();   // a turn the copy does not hold
    fs.writeFileSync(LF(d5, 'spend-budget.json'), JSON.stringify(L));
    const inbox = [], logs = []; const g = mk(guardMod, d5, inbox, logs);
    ok('§3g a ledger with NO WRITE NUMBER that lacks a turn its marker counted: said in its own words, counted, the notice filed',
      resets(inbox).length === 1 && g.snapshot().ledgerLastReset.kind === 'unnumbered' && logs.some((l) => /carries no write number/.test(l)), JSON.stringify(logs));
  }
  // (8) AN UNREADABLE MARKER beside a readable ledger: said at load and HELD (the store-read law) — never set aside, never read as empty and written over
  {
    const d6 = tmpdir('vs-spend-3g-marker-');
    const g1 = mk(guardMod, d6, [], []); g1.note({ reason: 'auto-resume', identity: ID, now: t3g }); g1.flush();
    fs.writeFileSync(LF(d6, 'spend-budget.born.json'), '{"born":');   // torn
    const inbox = [], logs = []; const g = mk(guardMod, d6, inbox, logs);
    g.note({ reason: 'auto-resume', identity: ID, now: t3g + 1000 }); g.flush();
    ok('§3g an UNREADABLE MARKER: said at load and HELD — after a write its bytes are its own (never set aside, never written over), the ledger still written',
      logs.some((l) => /born\.json could not be read \(not JSON\) — it is held/.test(l)) && fs.readFileSync(LF(d6, 'spend-budget.born.json'), 'utf8') === '{"born":'
        && !fs.readdirSync(d6).some((f) => /born\.json\.(unreadable|corrupt)-/.test(f)) && JSON.parse(fs.readFileSync(LF(d6, 'spend-budget.json'), 'utf8')).seq > 1 && resets(inbox).length === 0, JSON.stringify(logs));
    fs.writeFileSync(LF(d6, 'spend-budget.born.json'), JSON.stringify({ born: t3g - 9e6, seq: 1, resets: 4 }));   // repaired
    g.note({ reason: 'auto-resume', identity: ID, now: t3g + 2000 }); g.flush();
    const M6 = JSON.parse(fs.readFileSync(LF(d6, 'spend-budget.born.json'), 'utf8'));
    ok('§3g …once it reads again its history is adopted (resets 4, its birth) and it is written with this write\'s number', M6.resets === 4 && M6.born === t3g - 9e6 && M6.seq > 1 && logs.some((l) => /born\.json reads again/.test(l)), JSON.stringify(M6));
  }
  // (9) THE NOTICE OUTLIVES A RESTART: the store not there at boot (as on a hub: it is built later) — owed in the marker, filed at the next boot
  {
    const d7 = tmpdir('vs-spend-3g-owed-');
    const g1 = mk(guardMod, d7, [], []); g1.note({ reason: 'auto-resume', identity: ID, now: t3g }); g1.flush();
    fs.rmSync(LF(d7, 'spend-budget.json'));
    const logs = []; const gNo = guardMod.create({ dataDir: d7, serverSetting: () => undefined, getUserTodos: () => null, log: (...a) => logs.push(a.join(' ')) });
    const owed = JSON.parse(fs.readFileSync(LF(d7, 'spend-budget.born.json'), 'utf8')).noticeOwed;
    const inbox = []; mk(guardMod, d7, inbox, []);   // ← the restart, before any unattended turn
    ok('§3g a reset whose notice the store could not take (no store at boot): OWED in the marker, and the next boot files it',
      gNo.snapshot().ledgerResets === 1 && owed && owed.kind === 'removed' && owed.n === 1 && resets(inbox).length === 1 && resets(inbox)[0].i18n.detail[0].params.n === 1
        && !JSON.parse(fs.readFileSync(LF(d7, 'spend-budget.born.json'), 'utf8')).noticeOwed, JSON.stringify([owed, resets(inbox).length]));
  }
}

// ── §3h B-ef83: ONE HUB PROCESS KEEPS THE LEDGER — and A RESET NOTICE ONLY FOR A REAL LOSS ──────────
// Two hub processes on one data folder each kept their own count from the same file (each allowed the caps in full, each wrote over
// the other's). The keeper holds data/spend-budget.lock; a LIVE holder (its pid answers with the identity it wrote) makes this process
// refuse every unattended turn by name and never write the ledger; a gone one is taken over, said. With it, 主开发's law (19:20Z): a
// reset is said only when a turn that still counts was lost — never for a crash between the boot's two writes, a downgrade to an
// older build and back, or a marker repaired by hand — and its notice ENDS when the last lost turn stops counting.
console.log('\n§3h B-ef83: one hub process keeps the ledger; a reset notice only for a real loss, and it ends');
{
  const LF = path.join;
  const ID = { key: 'sub-a', name: 'A' };
  const cp = require('node:child_process');
  const kids = [];
  // a live process of this suite's own: it ends when the suite's pipe to it closes (never an orphan when the suite is killed)
  const liveKid = () => { const c = cp.spawn(process.execPath, ['-e', "process.stdin.on('end', () => process.exit(0)); process.stdin.resume(); setInterval(() => {}, 1e6)"], { stdio: ['pipe', 'ignore', 'ignore'] }); kids.push(c); return c; };
  const ended = (c) => new Promise((res) => { if (c.exitCode !== null || c.signalCode) return res(); c.once('exit', () => res()); try { c.stdin.end(); } catch { } c.kill('SIGTERM'); });
  const PI = require(path.join(REPO, 'src/proc-identity.js'));
  const NS = (() => { try { return fs.readlinkSync('/proc/self/ns/pid'); } catch { return null; } })();
  const store = (inbox) => ({ add: (key, item) => { const it = { key, id: 'ut-' + (inbox.length + 1), status: 'open', ...item }; inbox.push(it); return { id: it.id }; }, idsWhere: (f) => inbox.filter((i) => f(i)).map((i) => i.id), setStatus: (id, st) => { const i = inbox.find((x) => x.id === id); if (i) i.status = st; } });
  // no timers unless a leg asks for them (a guard's heartbeat and retries are a leg's own business)
  const mk = (mod, dir, inbox, logs, extra = {}) => mod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => store(inbox), log: (...a) => logs.push(a.join(' ')), schedule: () => 0, unschedule: () => { }, lockSchedule: () => 0, lockUnschedule: () => { }, ...extra });
  const lockOf = (pid, ident, { host = os.hostname(), ns = NS } = {}) => JSON.stringify({ pid, host, ns, ident, at: Date.now() });
  const resets = (inbox) => inbox.filter((i) => i.itemKey === 'spend-ledger-reset');
  const said = (logs) => logs.some((l) => /reset #\d+ of this record/.test(l));
  const t3h = Date.now();
  const { anchored } = await import('./scratch.mjs');
  const SG = read('src/server/spend-guard.js');
  const copyOf = (from, to, why) => { try { return require(MUT.write('src/server/spend-guard.js', anchored(SG, from, to, why))); } catch (e) { return { err: e.message }; } };
  try {
    // (a) A LIVE HOLDER: another process's lock (its pid answers with the identity it wrote) — refused by name, never written
    const dA = tmpdir('vs-spend-3h-held-');
    { const g0 = mk(guardMod, dA, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: t3h }); g0.flush(); }
    const kid = liveKid();
    fs.writeFileSync(LF(dA, 'spend-budget.lock'), lockOf(kid.pid, PI.identityOf(kid.pid)));
    const before = fs.readFileSync(LF(dA, 'spend-budget.json'), 'utf8'), markerBefore = fs.readFileSync(LF(dA, 'spend-budget.born.json'), 'utf8');
    const inboxA = [], logsA = [], timers = [];
    const gA = mk(guardMod, dA, inboxA, logsA, { lockSchedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } });
    const vA = gA.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 1000 });
    gA.note({ reason: 'notify', identity: ID, now: t3h + 1100 }); gA.flush();
    ok('§3h a LIVE HOLDER of data/spend-budget.lock (another process, its identity answering): every unattended turn is refused BY NAME (ledger-held-elsewhere), said once in For you (urgent, its own item) and the journal',
      vA.ok === false && vA.why === 'ledger-held-elsewhere' && inboxA.filter((i) => i.itemKey === guardMod.HELD_ITEM).length === 1 && inboxA.find((i) => i.itemKey === guardMod.HELD_ITEM).urgency === 'high'
        && gA.snapshot().ledgerHeldBy && gA.snapshot().ledgerHeldBy.pid === kid.pid && logsA.some((l) => /kept by another VibeSpace process on this data folder \(pid \d+/.test(l)), JSON.stringify([vA.why, gA.snapshot().ledgerHeldBy, logsA.slice(0, 3)]));
    ok('§3h …this process NEVER writes the ledger nor its marker while held (their bytes after a note and a flush are the keeper\'s), and it judges no waiting frame (the keeper counted them — none pulled)',
      fs.readFileSync(LF(dA, 'spend-budget.json'), 'utf8') === before && fs.readFileSync(LF(dA, 'spend-budget.born.json'), 'utf8') === markerBefore && gA.waitingOverCap().length === 0
        && logsA.some((l) => /not written by this process while another keeps it/.test(l)));
    ok('§3h …and it asks again on its own (a timer of LOCK_RETRY_MS)', timers.some((t) => t.ms === guardMod.LOCK_RETRY_MS), JSON.stringify(timers.map((t) => t.ms)));
    // (b) THE TAKEOVER: the keeper wrote its last record and ended — the lock is this process's, and the record the other kept IS the record
    // the keeper's LAST record: one more turn it counted (a stamp as it writes them, half a second after the first)
    const theirs = JSON.parse(before);
    const one = (list) => (Array.isArray(list) && list.length ? [...list, typeof list[0] === 'number' ? t3h + 500 : { ...list[0], at: t3h + 500 }] : list);
    const kept = { ...theirs.budget, instance: one(theirs.budget.instance), identities: { ...theirs.budget.identities, [ID.key]: one(theirs.budget.identities[ID.key]) } };
    fs.writeFileSync(LF(dA, 'spend-budget.json'), JSON.stringify({ ...theirs, seq: (theirs.seq || 1) + 1, budget: kept }));
    await ended(kid);
    const tookA = gA.lockAgain(t3h + 2000);
    const vA2 = gA.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 2100 });
    const lockNow = JSON.parse(fs.readFileSync(LF(dA, 'spend-budget.lock'), 'utf8'));
    ok('§3h THE KEEPER ENDED: the lock is taken over (it names this process), the held item resolved, unattended turns allowed again — counted from the keeper\'s record PLUS the one noted meanwhile, never the file twice (3)',
      tookA === true && lockNow.pid === process.pid && gA.snapshot().ledgerHeldBy === null && vA2.ok === true && (vA2.counts ? vA2.counts.day === 3 : false)
        && inboxA.find((i) => i.itemKey === guardMod.HELD_ITEM).status === 'done' && logsA.some((l) => /keeps data\/spend-budget\.json now \(the process that kept it, pid \d+, ended\)/.test(l)),
      JSON.stringify([tookA, lockNow.pid, vA2.ok, vA2.counts, logsA.slice(-2)]));
    // (c) A RECYCLED NUMBER: a live pid whose identity is NOT the one the lock wrote — the lock is a dead one's: taken over at once, said
    const dC = tmpdir('vs-spend-3h-recycled-');
    const kidC = liveKid();
    const idC = PI.identityOf(kidC.pid);
    fs.writeFileSync(LF(dC, 'spend-budget.lock'), lockOf(kidC.pid, idC ? { ...idC, starttime: Number(idC.starttime) + 12345 } : null));
    const logsC = []; const gC = mk(guardMod, dC, [], logsC);
    ok('§3h a lock naming a LIVE pid with ANOTHER identity (the number given to another process): taken over at once, said — never a block for good',
      gC.snapshot().ledgerHeldBy === null && JSON.parse(fs.readFileSync(LF(dC, 'spend-budget.lock'), 'utf8')).pid === process.pid && gC.authorize({ reason: 'auto-resume', identity: ID, now: t3h }).ok === true
        && logsC.some((l) => /named a process that is gone \(pid \d+/.test(l)), JSON.stringify(logsC.slice(0, 2)));
    // (d) A DEAD HOLDER (its process ended without its exit): taken over at once
    const dD = tmpdir('vs-spend-3h-dead-');
    const kidD = liveKid();
    const identD = PI.identityOf(kidD.pid); await ended(kidD);
    fs.writeFileSync(LF(dD, 'spend-budget.lock'), lockOf(kidD.pid, identD));
    const gD = mk(guardMod, dD, [], []);
    ok('§3h a lock whose process is GONE: taken over at once', gD.snapshot().ledgerHeldBy === null && JSON.parse(fs.readFileSync(LF(dD, 'spend-budget.lock'), 'utf8')).pid === process.pid);
    // (e) ANOTHER MACHINE on a shared folder: live while its heartbeat (the lock's mtime) is fresh; gone past LOCK_STALE_MS of silence
    const dE = tmpdir('vs-spend-3h-host-');
    fs.writeFileSync(LF(dE, 'spend-budget.lock'), lockOf(4242, null, { host: 'another-machine.example', ns: 'pid:[1]' }));
    const t0E = Date.now();
    const gE = mk(guardMod, dE, [], []);
    const heldE = !!gE.snapshot().ledgerHeldBy;
    const soonE = gE.lockAgain(t0E + 1000);   // its mtime unchanged, but not for long: held
    const beatAt = new Date(Date.now() - 3600e3); fs.utimesSync(LF(dE, 'spend-budget.lock'), beatAt, beatAt);   // it BEATS (its mtime changes — whatever its clock says)
    const beatE = gE.lockAgain(t0E + guardMod.LOCK_STALE_MS + 5000);
    const tookE = gE.lockAgain(t0E + 2 * guardMod.LOCK_STALE_MS + 10000);   // silent past LOCK_STALE_MS of THIS clock since its last beat
    ok('§3h a lock of ANOTHER MACHINE is judged by its heartbeat on THIS clock: held while its mtime changes (an old timestamp from a slow clock still beats), taken over once it has not changed for LOCK_STALE_MS',
      heldE && soonE === false && beatE === false && tookE === true && gE.snapshot().ledgerHeldBy === null, JSON.stringify([heldE, soonE, beatE, tookE]));
    // (f) THE KEEPER'S OWN HEARTBEAT finds a lock that no longer names it — it stops writing at once
    const dF = tmpdir('vs-spend-3h-lost-');
    const tF = [];
    const gF = mk(guardMod, dF, [], [], { lockSchedule: (fn, ms) => { tF.push({ fn, ms }); return tF.length; } });
    const kidF = liveKid();
    fs.writeFileSync(LF(dF, 'spend-budget.lock'), lockOf(kidF.pid, PI.identityOf(kidF.pid)));
    const beatF = tF.find((t) => t.ms === guardMod.LOCK_BEAT_MS);
    if (beatF) beatF.fn();
    for (let i = 0; i < 200 && !gF.snapshot().ledgerHeldBy; i++) await new Promise((r) => setTimeout(r, 25));
    ok('§3h the keeper\'s HEARTBEAT finds the lock naming another live process: it stops keeping the ledger (refused by name) and asks again',
      !!beatF && !!gF.snapshot().ledgerHeldBy && gF.authorize({ reason: 'auto-resume', identity: ID, now: t3h }).why === 'ledger-held-elsewhere', JSON.stringify([!!beatF, gF.snapshot().ledgerHeldBy]));
    // (g) RED: a copy that never sees a live holder (the release: no lock) — the second process counts its own and writes over the keeper's
    const red = copyOf("    if (holderLive(h, text, mt, now)) return { took: false, holder: h || { torn: true } };", "    if (false) return { took: false, holder: h || { torn: true } };", 'B-ef83: no live holder seen');
    ok('§3h CONTROL: the anchored copy (no live holder seen) is built', !red.err, red.err || '');
    if (!red.err) {
      const dG = tmpdir('vs-spend-3h-red-');
      { const g0 = mk(guardMod, dG, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: t3h }); g0.flush(); }
      const kidG = liveKid();
      fs.writeFileSync(LF(dG, 'spend-budget.lock'), lockOf(kidG.pid, PI.identityOf(kidG.pid)));
      const b4 = fs.readFileSync(LF(dG, 'spend-budget.json'), 'utf8');
      const gG = mk(red, dG, [], []);
      const vG = gG.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 1000 }); gG.note({ reason: 'auto-resume', identity: ID, now: t3h + 1000 }); gG.flush();
      ok('§3h CONTROL: that copy allows the turn beside a live keeper and writes over its record (RED: two counts on one file)', vG.ok === true && fs.readFileSync(LF(dG, 'spend-budget.json'), 'utf8') !== b4);
    }
    // (h) THE EXIT releases the lock: a real hub-like process that keeps a ledger and exits leaves no lock behind
    const dH = tmpdir('vs-spend-3h-exit-');
    cp.execFileSync(process.execPath, ['-e', `const g = require(${JSON.stringify(path.join(REPO, 'src/server/spend-guard.js'))}).create({ dataDir: ${JSON.stringify(dH)} }); if (!require('fs').existsSync(${JSON.stringify(LF(dH, 'spend-budget.lock'))})) process.exit(3); process.exit(0);`], { stdio: 'ignore', timeout: 20000 });
    ok('§3h a process that kept the ledger and EXITED leaves no lock (released at its exit)', !fs.existsSync(LF(dH, 'spend-budget.lock')));
    // (i) A LOCK THAT IS THERE AND CANNOT BE READ (another user's, mode 000): HELD — never judged gone
    if (typeof process.getuid === 'function' && process.getuid() === 0) console.log('  · §3h (i) SKIP: root reads a mode-000 file');
    else {
      const dI = tmpdir('vs-spend-3h-unreadable-');
      fs.writeFileSync(LF(dI, 'spend-budget.lock'), lockOf(4243, null)); fs.chmodSync(LF(dI, 'spend-budget.lock'), 0o000);
      const gI = mk(guardMod, dI, [], []);
      const heldI = gI.snapshot().ledgerHeldBy, vI = gI.authorize({ reason: 'auto-resume', identity: ID, now: t3h });
      fs.chmodSync(LF(dI, 'spend-budget.lock'), 0o644);
      ok('§3h a lock that is there and CANNOT BE READ (another user\'s): held — refused by name, never set aside', !!heldI && vI.why === 'ledger-held-elsewhere' && fs.existsSync(LF(dI, 'spend-budget.lock')), JSON.stringify([heldI, vI.why]));
    }
    // (l) THE LOCK REMOVED BY HAND while this process keeps the ledger: made again at the next heartbeat — its record is still the
    // record, never read again (no stamp counted twice)
    const dL = tmpdir('vs-spend-3h-removed-lock-');
    const tL = [];
    const gL = mk(guardMod, dL, [], [], { lockSchedule: (fn, ms) => { tL.push({ fn, ms }); return tL.length; } });
    gL.note({ reason: 'auto-resume', identity: ID, now: t3h }); gL.flush();
    fs.rmSync(LF(dL, 'spend-budget.lock'));
    const beatL = tL.find((t) => t.ms === guardMod.LOCK_BEAT_MS);
    if (beatL) beatL.fn();
    for (let i = 0; i < 200 && !fs.existsSync(LF(dL, 'spend-budget.lock')); i++) await new Promise((r) => setTimeout(r, 25));
    const vL = gL.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 1000 });
    ok('§3h the lock REMOVED BY HAND while this process keeps the ledger: made again at the heartbeat, the count unchanged (1, never the file merged twice)',
      !!beatL && fs.existsSync(LF(dL, 'spend-budget.lock')) && JSON.parse(fs.readFileSync(LF(dL, 'spend-budget.lock'), 'utf8')).pid === process.pid && vL.ok === true && vL.counts && vL.counts.day === 1, JSON.stringify([!!beatL, vL.ok, vL.counts]));

    // ── B-ef83 SMALLS (round wfm9rn69h; the save itself is not moved, 主开发 r1293) ──
    // (b1) THE BOUND OF ONE RETRY against a live holder: ONE round of 5 synchronous calls on data/, counted on the fs module itself
    const dB1 = tmpdir('vs-spend-3h-bound-');
    fs.writeFileSync(LF(dB1, 'spend-budget.lock'), lockOf(4242, null, { host: 'another-machine.example', ns: 'pid:[1]' }));
    const gB1 = mk(guardMod, dB1, [], []);
    const SYNC1 = ['writeFileSync', 'linkSync', 'unlinkSync', 'readFileSync', 'statSync', 'lstatSync', 'renameSync', 'openSync', 'utimesSync', 'existsSync', 'readdirSync', 'mkdirSync', 'rmSync', 'copyFileSync'];
    const seen1 = [], orig1 = {};
    // the GUARD's calls only: node's own fs calls inside one of them (writeFileSync opens through openSync) are not the guard's
    let depth1 = 0;
    for (const k of SYNC1) { orig1[k] = fs[k]; fs[k] = function (...a) { const top = depth1 === 0; depth1++; try { if (top && String(a[0]).startsWith(dB1)) seen1.push(k); return orig1[k].apply(this, a); } finally { depth1--; } }; }
    let held1 = null;
    try { held1 = gB1.lockAgain(Date.now() + 1000); } finally { for (const k of SYNC1) fs[k] = orig1[k]; }
    ok('§3h THE BOUND of one retry against a live holder: ONE round of 5 synchronous calls on data/ (the temp\'s write, the refused link, the temp\'s unlink, the lock\'s read and stat)',
      held1 === false && seen1.join(',') === 'writeFileSync,linkSync,unlinkSync,readFileSync,statSync', JSON.stringify([held1, seen1]));
    // a folder that REFUSES the lock (EACCES), through the fs module itself — never chmod (root writes a mode-000 folder)
    const lockTmpIn = (d) => (p) => String(p).startsWith(LF(d, 'spend-budget.lock.')) && String(p).endsWith('.tmp');
    const refuseLock = (match) => { const w0 = fs.writeFileSync; fs.writeFileSync = function (p, ...a) { if (match(p)) throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); return w0.call(this, p, ...a); }; return () => { fs.writeFileSync = w0; }; };
    const unmadeSaid = (logs, how = '') => logs.some((l) => l.includes(`spend-budget.lock ${how}could not be made (EACCES: the folder refuses it) and no other process holds it — this process keeps the ledger without it`));
    // (m) AT BOOT: kept WITHOUT the lock, said by its code, asked again every LOCK_UNMADE_RETRY_MS — made once the folder lets it
    const bootUnmade = async (mod) => {
      const dM = tmpdir('vs-spend-3h-unmade-');
      const tM = [], logsM = [], inM = [];
      const undo = refuseLock(lockTmpIn(dM));
      let gM; try { gM = mk(mod, dM, inM, logsM, { lockSchedule: (fn, ms) => { tM.push({ fn, ms }); return tM.length; } }); } finally { undo(); }
      const vM = gM.authorize({ reason: 'auto-resume', identity: ID, now: t3h });
      const un0 = gM.snapshot().ledgerLockUnmade, note0 = typeof gM.ledgerNotice === 'function' ? gM.ledgerNotice() : null;
      const items0 = inM.filter((i) => i.itemKey === 'spend-ledger-unlocked');
      const open0 = items0.filter((i) => i.status === 'open').length;
      const rM = tM.find((x) => x.ms === guardMod.LOCK_UNMADE_RETRY_MS);
      if (rM) rM.fn();
      return { vM, un0, note0, items0: items0.length, open0, itemKey0: items0[0] && items0[0].i18n && items0[0].i18n.text && items0[0].i18n.text.key, closed: items0.length > 0 && items0.every((i) => i.status !== 'open'),
        said: unmadeSaid(logsM), retry: !!rM, made: fs.existsSync(LF(dM, 'spend-budget.lock')) && JSON.parse(fs.readFileSync(LF(dM, 'spend-budget.lock'), 'utf8')).pid === process.pid,
        un1: gM.snapshot().ledgerLockUnmade, note1: typeof gM.ledgerNotice === 'function' ? gM.ledgerNotice() : null, madeSaid: logsM.some((l) => /spend-budget\.lock is made now \(it could not be since .*: EACCES\)/.test(l)), beat: tM.some((x) => x.ms === guardMod.LOCK_BEAT_MS) };
    };
    const bm = await bootUnmade(guardMod);
    ok('§3h a lock the folder REFUSES at boot (EACCES) and nobody holds: the ledger is kept WITHOUT it (the release\'s road) — turns allowed, said by its code, asked again every LOCK_UNMADE_RETRY_MS',
      bm.vM.ok === true && !!bm.un0 && bm.un0.error === 'EACCES' && bm.said && bm.retry, JSON.stringify({ ok: bm.vM.ok, why: bm.vM.why, un0: bm.un0, said: bm.said, retry: bm.retry }));
    ok('§3h …the OWNER SEES it (r1648 (d)): ONE For-you item for the episode (its words translated by key) and the usage meter\'s state «unlocked»',
      bm.items0 === 1 && bm.open0 === 1 && /counts turns nobody typed without the lock of their record/.test(String(bm.itemKey0)) && !!bm.note0 && bm.note0.state === 'unlocked' && bm.note0.error === 'EACCES', JSON.stringify({ items: bm.items0, open: bm.open0, key: bm.itemKey0, note: bm.note0 }));
    ok('§3h …the folder lets it again: the retry MAKES the lock (this process\'s), said, its heartbeat follows, the episode\'s item CLOSES and the meter has nothing to say', bm.made && bm.un1 === null && bm.madeSaid && bm.beat && bm.closed && bm.note1 === null, JSON.stringify({ made: bm.made, un1: bm.un1, madeSaid: bm.madeSaid, beat: bm.beat, closed: bm.closed, note1: bm.note1 }));
    const redBoot = copyOf('    } else keepUnmade(lk.error, now0);\n', "    } else log(`[spend] data/spend-budget.lock could not be made (${lk.error}) — this process keeps the ledger without it`);\n", 'B-ef83 smalls: the release\'s boot road (never asked again)'); // stale-pins: kept — the RED plants the release's boot line
    ok('§3h CONTROL: the anchored copy (the release\'s boot road) is built', !redBoot.err, redBoot.err || '');
    if (!redBoot.err) { const br = await bootUnmade(redBoot); ok('§3h CONTROL: in that copy the refused lock is never asked again — never made, and the owner is told nothing (RED: a second process could take the lock and keep its own count)', !br.retry && !br.made && br.items0 === 0, JSON.stringify({ retry: br.retry, made: br.made, items: br.items0 })); }
    // (n) THE LOCK REMOVED while this process keeps the ledger, and the folder now refuses a new one (r1648 (b)): the release's
    // direction — every unattended turn REFUSED — by the TRUE reason (never «another process» nobody is), HEALED by the retry
    const removedRefused = async (mod) => {
      const dN = tmpdir('vs-spend-3h-removed-refused-');
      const tN = [], logsN = [];
      const gN = mk(mod, dN, [], logsN, { lockSchedule: (fn, ms) => { tN.push({ fn, ms }); return tN.length; } });
      gN.note({ reason: 'auto-resume', identity: ID, now: t3h }); gN.flush();
      fs.rmSync(LF(dN, 'spend-budget.lock'));
      const undo = refuseLock(lockTmpIn(dN));
      let vN = null, snapN = null, noteN = null;
      try {
        const beatN = tN.find((x) => x.ms === guardMod.LOCK_BEAT_MS);
        if (beatN) beatN.fn();
        for (let i = 0; i < 200 && !gN.snapshot().ledgerLockUnmade && !gN.snapshot().ledgerHeldBy; i++) await new Promise((r) => setTimeout(r, 25));
        vN = gN.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 1000 });
        snapN = gN.snapshot(); noteN = typeof gN.ledgerNotice === 'function' ? gN.ledgerNotice() : null;
        gN.flush();   // a write while held: the journal says WHY it is not written (r1801 (2))
      } finally { undo(); }
      // the folder writes again: the held retry takes the lock, the record read again (the file's 1)
      const retryN = tN.find((x) => x.ms === guardMod.LOCK_RETRY_MS);
      if (retryN) retryN.fn();
      const vN2 = gN.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 2000 });
      return { vN, vN2, unwritable: snapN && snapN.ledgerLockUnwritable, unmade: snapN && snapN.ledgerLockUnmade, noteN, healed: !!retryN && gN.snapshot().ledgerHeldBy === null && gN.snapshot().ledgerLockUnwritable === null,
        said: logsN.some((l) => l.includes('spend-budget.lock was removed and cannot be written again (EACCES: the folder refuses it)')), named: logsN.some((l) => /names another VibeSpace process/.test(l)),
        cause: snapN && snapN.ledgerHeldBy ? snapN.ledgerHeldBy.cause : null, writeSaid: logsN.some((l) => l.includes('is not written by this process while its lock cannot be written (EACCES)')), writeWrong: logsN.some((l) => l.includes('while another keeps it')) };
    };
    const rn = await removedRefused(guardMod);
    ok('§3h the lock REMOVED while this process keeps the ledger and the folder REFUSES a new one: every unattended turn REFUSED by the TRUE reason (ledger-lock-unwritable, its code) — never «another process keeps it»; the meter says «refused»',
      !!rn.vN && rn.vN.ok === false && rn.vN.why === 'ledger-lock-unwritable' && !!rn.unwritable && rn.unwritable.error === 'EACCES' && rn.unmade === null && rn.said && !rn.named && !!rn.noteN && rn.noteN.state === 'refused', JSON.stringify({ ok: rn.vN && rn.vN.ok, why: rn.vN && rn.vN.why, unwritable: rn.unwritable, unmade: rn.unmade, said: rn.said, named: rn.named, note: rn.noteN }));
    ok('§3h …the snapshot names the hold\'s cause («lock-unwritable»), and a write while held says why it is not written — never «while another keeps it» (r1801 (2) (5))', rn.cause === 'lock-unwritable' && rn.writeSaid && !rn.writeWrong, JSON.stringify({ cause: rn.cause, writeSaid: rn.writeSaid, writeWrong: rn.writeWrong }));
    ok('§3h …and it HEALS by itself: the folder writes again ⇒ the held retry takes the lock, the record read again (count 1), turns allowed — never held for ever', rn.healed && rn.vN2.ok === true && !!rn.vN2.counts && rn.vN2.counts.day === 1, JSON.stringify({ healed: rn.healed, ok: rn.vN2.ok, why: rn.vN2.why, counts: rn.vN2.counts }));
    const redLost = copyOf('      h = lk.holder || { lockUnwritable: lk.error };\n', '      h = lk.holder || { contended: true };\n', 'B-ef83 smalls: the release\'s lost-lock road'); // stale-pins: kept — the RED plants the release's lost-lock line
    ok('§3h CONTROL: the anchored copy (the release\'s lost-lock road) is built', !redLost.err, redLost.err || '');
    if (!redLost.err) { const lr = await removedRefused(redLost); ok('§3h CONTROL: in that copy the same scene refuses in the name of ANOTHER PROCESS nobody is (RED: ledger-held-elsewhere — the false name)', !!lr.vN && lr.vN.ok === false && lr.vN.why === 'ledger-held-elsewhere', JSON.stringify({ ok: lr.vN && lr.vN.ok, why: lr.vN && lr.vN.why })); }
    // (o) HELD, then the holder is GONE and the folder refuses a new lock (r1648 (c)): STILL held (the release's direction), by the TRUE
    // reason, and healed the moment the folder writes — never held in a gone process's name for ever
    const heldGoneRefused = (mod) => {
      const dO = tmpdir('vs-spend-3h-held-gone-refused-');
      { const g0 = mk(guardMod, dO, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: t3h }); g0.flush(); }
      fs.writeFileSync(LF(dO, 'spend-budget.lock'), lockOf(4242, null, { host: 'another-machine.example', ns: 'pid:[1]' }));
      const tO = [], logsO = [];
      const gO = mk(mod, dO, [], logsO, { lockSchedule: (fn, ms) => { tO.push({ fn, ms }); return tO.length; } });
      const held0 = !!gO.snapshot().ledgerHeldBy;
      fs.rmSync(LF(dO, 'spend-budget.lock'));   // the other machine's process ended and took its lock with it
      const undo = refuseLock(lockTmpIn(dO));
      let kept, vO;
      try { kept = gO.lockAgain(Date.now() + 1000); vO = gO.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 1000 }); } finally { undo(); }
      const unwritable = gO.snapshot().ledgerLockUnwritable, causeO = gO.snapshot().ledgerHeldBy ? gO.snapshot().ledgerHeldBy.cause : null;
      const healed = gO.lockAgain(Date.now() + 2000);
      const vO2 = gO.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 2000 });
      return { held0, kept, vO, vO2, unwritable, causeO, healed, said: logsO.some((l) => l.includes('the process that kept data/spend-budget.json is gone, and data/spend-budget.lock cannot be written (EACCES: the folder refuses it)')) };
    };
    const ho = heldGoneRefused(guardMod);
    ok('§3h HELD, then the holder is GONE and the folder refuses a new lock: STILL held, by the TRUE reason (ledger-lock-unwritable), said — never in the gone process\'s name',
      ho.held0 && ho.kept === false && ho.vO.ok === false && ho.vO.why === 'ledger-lock-unwritable' && !!ho.unwritable && ho.unwritable.error === 'EACCES' && ho.causeO === 'lock-unwritable' && ho.said, JSON.stringify({ held0: ho.held0, kept: ho.kept, ok: ho.vO.ok, why: ho.vO.why, unwritable: ho.unwritable, said: ho.said }));
    ok('§3h …and it HEALS: the folder writes again ⇒ the next retry takes the lock and the keeper\'s record (count 1) — turns allowed', ho.healed === true && ho.vO2.ok === true && !!ho.vO2.counts && ho.vO2.counts.day === 1, JSON.stringify({ healed: ho.healed, ok: ho.vO2.ok, why: ho.vO2.why, counts: ho.vO2.counts }));
    const redHeld = copyOf('    if (!lk.took && lk.holder) { heldBy = { ...heldOf(lk.holder, now), since: heldBy ? heldBy.since : now, saidWrite: heldBy ? heldBy.saidWrite : false }; return false; }\n', '    if (!lk.took) { if (lk.holder) heldBy = { ...heldOf(lk.holder, now), since: heldBy ? heldBy.since : now, saidWrite: heldBy ? heldBy.saidWrite : false }; return false; }\n', 'B-ef83 smalls: the release\'s held retry'); // stale-pins: kept — the RED plants the release's held retry
    ok('§3h CONTROL: the anchored copy (the release\'s held retry) is built', !redHeld.err, redHeld.err || '');
    if (!redHeld.err) { const hr = heldGoneRefused(redHeld); ok('§3h CONTROL: in that copy the gone holder keeps the process held in ITS name (RED: ledger-held-elsewhere — the false name)', hr.kept === false && hr.vO.why === 'ledger-held-elsewhere', JSON.stringify({ kept: hr.kept, why: hr.vO.why })); }
    // (q) THE ROOT FIX (round wm61ywdo4's MUST): a write error READS the lock first — a LIVE holder behind a folder that refuses the
    // temp write is still NAMED (held, ledger-held-elsewhere), never kept without the lock beside it
    const liveBehindRefused = (mod) => {
      const dQ = tmpdir('vs-spend-3h-live-refused-');
      fs.writeFileSync(LF(dQ, 'spend-budget.lock'), lockOf(4242, null, { host: 'another-machine.example', ns: 'pid:[1]' }));
      const undo = refuseLock(lockTmpIn(dQ));
      let gQ; try { gQ = mk(mod, dQ, [], []); } finally { undo(); }
      return { held: gQ.snapshot().ledgerHeldBy, unmade: gQ.snapshot().ledgerLockUnmade, v: gQ.authorize({ reason: 'auto-resume', identity: ID, now: t3h }) };   // held.cause: 'another-process'
    };
    const lq = liveBehindRefused(guardMod);
    ok('§3h THE ROOT FIX: a LIVE holder\'s lock behind a folder that refuses the temp write is still read and NAMED — held (ledger-held-elsewhere), never kept without the lock beside the keeper',
      !!lq.held && lq.held.cause === 'another-process' && lq.unmade === null && lq.v.ok === false && lq.v.why === 'ledger-held-elsewhere', JSON.stringify({ held: lq.held, unmade: lq.unmade, why: lq.v.why }));
    const redRoot = copyOf("        const cannot = !e || e.code !== 'EEXIST' ? String((e && e.code) || 'lock failed') : null;\n", "        if (!e || e.code !== 'EEXIST') return { took: false, error: String((e && e.code) || 'lock failed') };\n        const cannot = null;\n", 'B-ef83 smalls: the release\'s early return'); // stale-pins: kept — the RED plants the release's early return
    ok('§3h CONTROL: the anchored copy (the release\'s early return at a write error) is built', !redRoot.err, redRoot.err || '');
    if (!redRoot.err) { const rq = liveBehindRefused(redRoot); ok('§3h CONTROL: in that copy the process keeps the ledger WITHOUT the lock beside the LIVE keeper and allows the turn (RED: two counts on one budget)', rq.v.ok === true && !!rq.unmade && !rq.held, JSON.stringify({ ok: rq.v.ok, unmade: rq.unmade, held: rq.held })); }
    // (m2) r1801's MUST: AT A REAL BOOT the For-you store comes LATER than the guard — the episode's item is FILED once it answers (the
    // existing 60 s ask), never flagged as filed while nothing took it
    const bootNoStore = (mod) => {
      const dS = tmpdir('vs-spend-3h-unmade-nostore-');
      const tS = [], inS = []; let ready = false;
      const undo = refuseLock(lockTmpIn(dS));
      try {
        const gS = mk(mod, dS, inS, [], { getUserTodos: () => (ready ? store(inS) : null), lockSchedule: (fn, ms) => { tS.push({ fn, ms }); return tS.length; } });
        const before = inS.length;
        ready = true;   // the store exists now; the folder STILL refuses the lock
        const rS = tS.find((x) => x.ms === guardMod.LOCK_UNMADE_RETRY_MS);
        if (rS) rS.fn();
        const rS2 = tS.filter((x) => x.ms === guardMod.LOCK_UNMADE_RETRY_MS)[1];
        if (rS2) rS2.fn();   // a second ask files nothing more (ONCE an episode)
        return { before, open: inS.filter((x) => x.itemKey === 'spend-ledger-unlocked' && x.status === 'open').length, still: !!gS.snapshot().ledgerLockUnmade };
      } finally { undo(); }
    };
    const bs = bootNoStore(guardMod);
    ok('§3h THE MUST (r1801): the guard built BEFORE the For-you store — nothing filed then; the 60 s ask, the folder still refusing, files EXACTLY ONE item (a second ask none)', bs.before === 0 && bs.open === 1 && bs.still, JSON.stringify(bs));
    const redOrder = copyOf("    let ut = null; try { ut = getUserTodos(); } catch { ut = null; }\n    if (!ut || typeof ut.add !== 'function') return false;   // the store comes later in boot: the 60 s ask files it then\n", '    const ut = null;\n    unlockedFiled = true;\n', "B-ef83 r1801: the tip's order (the flag first)"); // stale-pins: kept — the RED plants the tip's order
    ok('§3h CONTROL: the anchored copy (the flag set before the filing) is built', !redOrder.err, redOrder.err || '');
    if (!redOrder.err) { const ro = bootNoStore(redOrder); ok('§3h CONTROL: in that copy the owner gets NO item at a real boot (RED: the flag set, nothing filed)', ro.open === 0, JSON.stringify(ro)); }
    // (p) r1801 (4): AN EARLIER RUN's item closes when a later boot makes the lock AT ONCE — once the store answers (the beat asks)
    {
      const dP = tmpdir('vs-spend-3h-unlocked-earlier-');
      const tP = [], inP = [{ key: 'accounts', id: 'ut-1', status: 'open', itemKey: 'spend-ledger-unlocked', text: 'an earlier run' }]; let readyP = false;
      const gP = mk(guardMod, dP, inP, [], { getUserTodos: () => (readyP ? store(inP) : null), lockSchedule: (fn, ms) => { tP.push({ fn, ms }); return tP.length; } });
      const openAtBoot = inP[0].status === 'open';
      readyP = true;
      const beatP = tP.find((x) => x.ms === guardMod.LOCK_BEAT_MS);
      if (beatP) beatP.fn();
      for (let i = 0; i < 200 && inP[0].status === 'open'; i++) await new Promise((r) => setTimeout(r, 25));
      ok('§3h an EARLIER RUN\'s «kept without the lock» item CLOSES when a later boot makes the lock at once — at the first beat after the store answers (r1801 (4))', openAtBoot && inP[0].status !== 'open' && !!gP.snapshot() && gP.snapshot().ledgerHeldBy === null, JSON.stringify({ openAtBoot, status: inP[0].status }));
    }
    // ── r2047's FOLLOW (round wt5inp00k) ──
    // (m3) THREE OUTCOMES: an add that THROWS (a full list) sets no filed mark — the next 60 s ask files it (exactly one item)
    const bootAddThrows = (mod) => {
      const dT = tmpdir('vs-spend-3h-unmade-addthrows-');
      const tT = [], inT = []; let throwOnce = true;
      const st = () => { const b = store(inT); return { ...b, add: (k, it) => { if (throwOnce) { throwOnce = false; throw new Error('the list is full'); } return b.add(k, it); } }; };
      const undo = refuseLock(lockTmpIn(dT));
      try {
        const gT = mk(mod, dT, inT, [], { getUserTodos: st, lockSchedule: (fn, ms) => { tT.push({ fn, ms }); return tT.length; } });
        const after = inT.filter((x) => x.itemKey === 'spend-ledger-unlocked').length;
        const rT = tT.find((x) => x.ms === guardMod.LOCK_UNMADE_RETRY_MS); if (rT) rT.fn();
        return { after, open: inT.filter((x) => x.itemKey === 'spend-ledger-unlocked' && x.status === 'open').length, unmade: !!gT.snapshot().ledgerLockUnmade };
      } finally { undo(); }
    };
    const bt = bootAddThrows(guardMod);
    ok('§3h r2047 (1): the episode item\'s add THREW at the boot — no filed mark; the next 60 s ask files it: exactly ONE item', bt.after === 0 && bt.open === 1 && bt.unmade, JSON.stringify(bt));
    const redThrow = copyOf("    if (!filed && !owedToRead) return false;   // the add threw: NOT filed — asked again at the next 60 s ask\n", '', "B-ef83 r2047 (1): a thrown add counted as filed"); // stale-pins: kept — the RED takes the third outcome out
    ok('§3h CONTROL: the anchored copy (a thrown add counted as filed) is built', !redThrow.err, redThrow.err || '');
    if (!redThrow.err) { const rt = bootAddThrows(redThrow); ok('§3h CONTROL: in that copy the owner gets NO item (RED: the thrown add marked filed)', rt.open === 0, JSON.stringify(rt)); }
    // (p2) r2047 (2): a boot that started HELD later takes the lock — an earlier run's «kept without the lock» item closes (the beat).
    // One scene, run on the guard and on its anchored copies (round w7yapjt1r): `beats` beats, each awaited until its own finally ran
    // (it arms the next beat); `setStatusThrows` = the store's first status writes throw
    const heldThenTake = async (mod, { beats = 1, setStatusThrows = 0 } = {}) => {
      const dH2 = tmpdir('vs-spend-3h-held-then-take-');
      fs.writeFileSync(LF(dH2, 'spend-budget.lock'), lockOf(4242, null, { host: 'another-machine.example', ns: 'pid:[1]' }));
      const tH2 = [], logsH2 = [], inH2 = [{ key: 'accounts', id: 'ut-1', status: 'open', itemKey: 'spend-ledger-unlocked', text: 'an earlier run' }]; let readyH2 = false, throwsLeft = setStatusThrows;
      const st = () => { const s0 = store(inH2); return { ...s0, setStatus: (id, s) => { if (throwsLeft > 0) { throwsLeft--; throw new Error('the store refused the write'); } return s0.setStatus(id, s); } }; };
      const gH2 = mk(mod, dH2, inH2, logsH2, { getUserTodos: () => (readyH2 ? st() : null), lockSchedule: (fn, ms) => { tH2.push({ fn, ms }); return tH2.length; } });
      const heldAtBoot = !!gH2.snapshot().ledgerHeldBy;
      fs.rmSync(LF(dH2, 'spend-budget.lock')); readyH2 = true;
      const tookH2 = gH2.lockAgain(Date.now() + 1000);
      const statuses = [];
      for (let k = 0; k < beats; k++) {
        const n0 = tH2.length, beat = tH2.filter((x) => x.ms === mod.LOCK_BEAT_MS).pop();
        if (beat) beat.fn();
        for (let i = 0; i < 200 && tH2.length === n0; i++) await new Promise((r) => setTimeout(r, 25));   // its finally armed the next beat
        statuses.push(inH2[0].status);
      }
      return { heldAtBoot, tookH2, statuses, status: inH2[0].status, closeSaid: logsH2.filter((l) => l.includes('could not close the inbox item')).length };
    };
    const h2 = await heldThenTake(guardMod);
    ok('§3h r2047 (2): a boot that started HELD takes the lock later — an earlier run\'s «kept without the lock» item CLOSES at the next beat', h2.heldAtBoot && h2.tookH2 === true && h2.status !== 'open', JSON.stringify(h2));
    const redTake = copyOf("    unlockedCloseOwed = true;   // r2047 (2): a boot that started HELD takes the lock — an earlier run's «kept without the lock» item is no longer true\n", '', "B-ef83 r2047 (2): the takeover owes no close"); // stale-pins: kept — the RED takes the takeover's owed close out
    ok('§3h CONTROL: the anchored copy (the takeover owes no close) is built', !redTake.err, redTake.err || '');
    if (!redTake.err) { const r2 = await heldThenTake(redTake); ok('§3h CONTROL: in that copy the earlier run\'s item stays OPEN after the beat (RED: the takeover\'s owed close taken out)', r2.tookH2 === true && r2.status === 'open', JSON.stringify(r2)); }
    // round w7yapjt1r: a status write that THROWS closed nothing — said, the close stays owed, the NEXT beat closes it
    const h2t = await heldThenTake(guardMod, { beats: 2, setStatusThrows: 1 });
    ok('§3h w7yapjt1r: the close\'s status write THREW — said in the journal, the item still open after that beat, CLOSED at the next (the owed mark kept)', h2t.statuses[0] === 'open' && h2t.statuses[1] !== 'open' && h2t.closeSaid === 1, JSON.stringify(h2t));
    const redSwallow = copyOf("    catch (e) { log(`[spend] could not close the inbox item ${itemKey}: ${(e && e.message) || e} — asked again at the next beat`); return false; }\n", "    catch { }\n", "B-ef83 w7yapjt1r: a thrown close answered true"); // stale-pins: kept — the RED swallows the thrown write as the release did
    ok('§3h CONTROL: the anchored copy (a thrown close swallowed, answered true) is built', !redSwallow.err, redSwallow.err || '');
    if (!redSwallow.err) { const rs = await heldThenTake(redSwallow, { beats: 2, setStatusThrows: 1 }); ok('§3h CONTROL: in that copy the item stays OPEN for good, unsaid (RED: the owed mark cleared by a close that closed nothing)', rs.statuses[1] === 'open' && rs.closeSaid === 0, JSON.stringify(rs)); }
    // (p3) r2047 (2): the lock LOST before the store answered — the held retry closes the earlier item once the store answers
    const lostBeforeStore = async (mod) => {
      const dL3 = tmpdir('vs-spend-3h-lost-before-store-');
      const tL3 = [], inL3 = [{ key: 'accounts', id: 'ut-1', status: 'open', itemKey: 'spend-ledger-unlocked', text: 'an earlier run' }]; let readyL3 = false;
      const gL3 = mk(mod, dL3, inL3, [], { getUserTodos: () => (readyL3 ? store(inL3) : null), lockSchedule: (fn, ms) => { tL3.push({ fn, ms }); return tL3.length; } });
      fs.writeFileSync(LF(dL3, 'spend-budget.lock'), lockOf(4242, null, { host: 'another-machine.example', ns: 'pid:[1]' }));   // another process's lock now
      const beatL3 = tL3.find((x) => x.ms === mod.LOCK_BEAT_MS); if (beatL3) beatL3.fn();
      for (let i = 0; i < 200 && !gL3.snapshot().ledgerHeldBy; i++) await new Promise((r) => setTimeout(r, 25));
      const heldNow = !!gL3.snapshot().ledgerHeldBy, stillOpen = inL3[0].status === 'open';
      readyL3 = true;
      const retryL3 = tL3.filter((x) => x.ms === mod.LOCK_RETRY_MS).pop(); if (retryL3) retryL3.fn();
      return { heldNow, stillOpen, retry: !!retryL3, status: inL3[0].status };
    };
    const l3 = await lostBeforeStore(guardMod);
    ok('§3h r2047 (2): the lock LOST before the store answered (another process took it) — the HELD retry closes the earlier run\'s item once the store answers', l3.heldNow && l3.stillOpen && l3.retry && l3.status !== 'open', JSON.stringify(l3));
    const redRetry = copyOf('lockAgain(); if (unlockedCloseOwed && closeItemsNow(UNLOCKED_ITEM)) unlockedCloseOwed = false; if (heldBy) armLockRetry(); }', 'lockAgain(); if (heldBy) armLockRetry(); }', "B-ef83 r2047 (2): the held retry closes nothing"); // stale-pins: kept — the RED takes the held retry's close out
    ok('§3h CONTROL: the anchored copy (the held retry closes nothing) is built', !redRetry.err, redRetry.err || '');
    if (!redRetry.err) { const r3 = await lostBeforeStore(redRetry); ok('§3h CONTROL: in that copy the earlier run\'s item stays OPEN after the held retry (RED: the retry\'s close taken out)', r3.heldNow && r3.retry && r3.status === 'open', JSON.stringify(r3)); }
    // round w7yapjt1r: a list that stays FULL (the add keeps throwing) — the episode's failure said ONCE, however many 60 s asks
    const addAlwaysThrows = (mod) => {
      const dF = tmpdir('vs-spend-3h-unmade-full-');
      const tF = [], inF = [], logsF = [];
      const st = () => ({ ...store(inF), add: () => { throw new Error('the list is full'); } });
      const undo = refuseLock(lockTmpIn(dF));
      try {
        const gF = mk(mod, dF, inF, logsF, { getUserTodos: st, lockSchedule: (fn, ms) => { tF.push({ fn, ms }); return tF.length; } });
        let asks = 0;
        for (let k = 0; k < 3; k++) { const r = tF.filter((x) => x.ms === mod.LOCK_UNMADE_RETRY_MS).pop(); if (r) { asks++; r.fn(); } }
        return { asks, said: logsF.filter((l) => l.includes('could not file the inbox item')).length, items: inF.length, unmade: !!gF.snapshot().ledgerLockUnmade };
      } finally { undo(); }
    };
    const af = addAlwaysThrows(guardMod);
    ok('§3h w7yapjt1r: a list that stays FULL — three 60 s asks, the failure said ONCE in the journal (the first of the episode), no item', af.asks === 3 && af.said === 1 && af.items === 0 && af.unmade, JSON.stringify(af));
    const redSaid = copyOf("      if (itemKey !== UNLOCKED_ITEM || !unlockedFailSaid) log('[spend] could not file the inbox item: ' + e.message);\n", "      log('[spend] could not file the inbox item: ' + e.message);\n", "B-ef83 w7yapjt1r: every failed ask said"); // stale-pins: kept — the RED says every failure, as the release did
    ok('§3h CONTROL: the anchored copy (every failed ask said) is built', !redSaid.err, redSaid.err || '');
    if (!redSaid.err) { const rf = addAlwaysThrows(redSaid); ok('§3h CONTROL: in that copy the journal says it at the boot\'s try AND at every ask (RED: one line a minute for the whole episode)', rf.asks === 3 && rf.said >= rf.asks && rf.said > af.said, JSON.stringify({ red: rf, guard: af })); }
    // (s) r2047 (5): THE LOCK REMADE BY ANOTHER PROCESS meanwhile (boot unmade; another hub made it): the 60 s ask finds it — HELD by
    // that process (its name), the ledger no longer kept without a lock, the episode's item closed
    {
      const dS2 = tmpdir('vs-spend-3h-unmade-other-made-');
      const tS2 = [], inS2 = [];
      const undo = refuseLock(lockTmpIn(dS2));
      try {
        const gS2 = mk(guardMod, dS2, inS2, [], { lockSchedule: (fn, ms) => { tS2.push({ fn, ms }); return tS2.length; } });
        const openBefore = inS2.filter((x) => x.itemKey === 'spend-ledger-unlocked' && x.status === 'open').length;
        fs.writeFileSync(LF(dS2, 'spend-budget.lock'), lockOf(4242, null, { host: 'another-machine.example', ns: 'pid:[1]' }));   // another process made it meanwhile
        const rS2 = tS2.find((x) => x.ms === guardMod.LOCK_UNMADE_RETRY_MS); if (rS2) rS2.fn();
        const v = gS2.authorize({ reason: 'auto-resume', identity: ID, now: t3h });
        const snap = gS2.snapshot();
        ok('§3h r2047 (5): the lock REMADE BY ANOTHER PROCESS while this one kept the ledger without it — HELD by that process (ledger-held-elsewhere, cause «another-process»), no longer kept without a lock, the episode\'s item closed',
          openBefore === 1 && v.ok === false && v.why === 'ledger-held-elsewhere' && !!snap.ledgerHeldBy && snap.ledgerHeldBy.cause === 'another-process' && snap.ledgerLockUnmade === null && inS2.filter((x) => x.itemKey === 'spend-ledger-unlocked' && x.status === 'open').length === 0,
          JSON.stringify({ openBefore, why: v.why, cause: snap.ledgerHeldBy && snap.ledgerHeldBy.cause, unmade: snap.ledgerLockUnmade }));
      } finally { undo(); }
    }
    // r2047 (3): RED controls for the earlier run's item closed at the first beat (p) and for the snapshot's cause
    const redCloseOwed = copyOf("      unlockedCloseOwed = true;   // r1801 (4): an earlier run's «kept without the lock» item closes (the store answers later in boot)\n", '', "B-ef83 r2047 (3): the boot's owed close taken out"); // stale-pins: kept — the RED takes the owed close out
    ok('§3h CONTROL: the anchored copy (no owed close at a boot that took the lock) is built', !redCloseOwed.err, redCloseOwed.err || '');
    if (!redCloseOwed.err) {
      const dPr = tmpdir('vs-spend-3h-unlocked-earlier-red-');
      const tPr = [], inPr = [{ key: 'accounts', id: 'ut-1', status: 'open', itemKey: 'spend-ledger-unlocked', text: 'an earlier run' }]; let readyPr = false;
      mk(redCloseOwed, dPr, inPr, [], { getUserTodos: () => (readyPr ? store(inPr) : null), lockSchedule: (fn, ms) => { tPr.push({ fn, ms }); return tPr.length; } });
      readyPr = true;
      const beatPr = tPr.find((x) => x.ms === guardMod.LOCK_BEAT_MS); if (beatPr) beatPr.fn();
      for (let i = 0; i < 40 && inPr[0].status === 'open'; i++) await new Promise((r) => setTimeout(r, 25));
      ok('§3h CONTROL: in that copy the earlier run\'s untrue item STAYS OPEN at the beat (RED: the (p) leg sees it)', inPr[0].status === 'open', inPr[0].status);
    }
    const redCause = copyOf("cause: heldBy.lockUnwritable ? 'lock-unwritable' : heldBy.lockUnreadable ? 'lock-unreadable' : 'another-process' }", "cause: 'another-process' }", "B-ef83 r2047 (3): the snapshot's cause flattened"); // stale-pins: kept — the RED flattens the cause
    ok('§3h CONTROL: the anchored copy (the snapshot\'s cause always «another-process») is built', !redCause.err, redCause.err || '');
    if (!redCause.err) { const rc2 = await removedRefused(redCause); ok('§3h CONTROL: in that copy the lock-unwritable hold reads as another process\'s in the snapshot (RED: the (n) leg\'s cause sees it)', rc2.cause === 'another-process', String(rc2.cause)); }
    // (r) r1801 (1): AT BOOT the folder refuses the temp write AND a lock is THERE but cannot be read: HELD (it may be a live keeper's) —
    // by THAT reason, never «another process (pid ?)»; healed by the retry once it reads
    const unreadableBehindRefused = async (mod) => {
      const dR = tmpdir('vs-spend-3h-unreadable-refused-');
      const kidR = liveKid(); const lockR = lockOf(kidR.pid, PI.identityOf(kidR.pid)); await ended(kidR);   // the lock of a process that ENDED (its identity proves it gone): STALE once it reads
      fs.writeFileSync(LF(dR, 'spend-budget.lock'), lockR);
      const lockPath = LF(dR, 'spend-budget.lock');
      const undoW = refuseLock(lockTmpIn(dR));
      const r0 = fs.readFileSync; fs.readFileSync = function (p, ...a) { if (String(p) === lockPath) throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); return r0.call(this, p, ...a); };
      const tR = [], logsR = [];
      let gR, v, snap, note;
      try {
        gR = mk(mod, dR, [], logsR, { lockSchedule: (fn, ms) => { tR.push({ fn, ms }); return tR.length; } });
        v = gR.authorize({ reason: 'auto-resume', identity: ID, now: t3h }); snap = gR.snapshot(); note = typeof gR.ledgerNotice === 'function' ? gR.ledgerNotice() : null;
      } finally { fs.readFileSync = r0; undoW(); }
      const healed = gR.lockAgain(Date.now() + 1000);
      const v2 = gR.authorize({ reason: 'auto-resume', identity: ID, now: t3h + 1000 });
      return { v, v2, cause: snap.ledgerHeldBy ? snap.ledgerHeldBy.cause : null, note, healed, said: logsR.some((l) => l.includes('data/spend-budget.lock is there and cannot be read (EACCES), and the folder refuses a new one')), named: logsR.some((l) => /kept by another VibeSpace process/.test(l)) };
    };
    const ur = await unreadableBehindRefused(guardMod);
    ok('§3h a lock THERE and UNREADABLE behind a folder that refuses the temp write: HELD (it may be a live keeper\'s) by THAT reason — ledger-lock-unreadable, the snapshot\'s cause, the meter «unreadable», the journal\'s words — never «another process (pid ?)» (r1801 (1))',
      ur.v.ok === false && ur.v.why === 'ledger-lock-unreadable' && ur.cause === 'lock-unreadable' && !!ur.note && ur.note.state === 'unreadable' && ur.said && !ur.named, JSON.stringify({ ok: ur.v.ok, why: ur.v.why, cause: ur.cause, note: ur.note, said: ur.said, named: ur.named }));
    ok('§3h …and it HEALS: the lock reads again (a process that ended) ⇒ the retry takes it over, turns allowed', ur.healed === true && ur.v2.ok === true, JSON.stringify({ healed: ur.healed, ok: ur.v2.ok, why: ur.v2.why }));
    const redUnread = copyOf(", ...(cannot ? { lockUnreadable: String(e2.code || 'unreadable') } : {}) } }; }", ' } }; }', "B-ef83 r1801 (1): the unreadable lock with no cause of its own"); // stale-pins: kept — the RED plants the tip's unnamed hold
    ok('§3h CONTROL: the anchored copy (no cause for the unreadable lock) is built', !redUnread.err, redUnread.err || '');
    if (!redUnread.err) { const uu = await unreadableBehindRefused(redUnread); ok('§3h CONTROL: in that copy the hold is said in the name of ANOTHER PROCESS (pid ?) (RED: the false name)', uu.v.ok === false && uu.v.why === 'ledger-held-elsewhere' && uu.named, JSON.stringify({ why: uu.v.why, named: uu.named })); }

    // ── THE LAW: A RESET NOTICE ONLY FOR A REAL LOSS ──
    // (1) A CRASH BETWEEN THE BOOT'S TWO WRITES, both orders. A: the marker (the reset said, the count restarted) landed, the
    // ledger's at-once write did not — the next boot meets a missing ledger beside a marker that counts nothing: SILENT
    const d1 = tmpdir('vs-spend-3h-crashA-');
    { const g0 = mk(guardMod, d1, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: t3h }); g0.flush(); }
    const M0 = fs.readFileSync(LF(d1, 'spend-budget.born.json'), 'utf8');
    fs.rmSync(LF(d1, 'spend-budget.json'));
    const in1 = []; mk(guardMod, d1, in1, []);
    ok('§3h (1) the real loss first: a removed ledger whose marker counted a turn that still counts — said once (reset #1)', resets(in1).length === 1);
    const L1 = fs.readFileSync(LF(d1, 'spend-budget.json'), 'utf8');
    fs.rmSync(LF(d1, 'spend-budget.json'));   // ← the crash: the reset's marker is on disk, the ledger's write never landed
    const in1b = [], lg1b = []; const g1b = mk(guardMod, d1, in1b, lg1b);
    ok('§3h (1) CRASH, order A (the marker landed, the ledger did not): the next boot says NOTHING — no second notice, still reset #1',
      resets(in1b).length === 0 && !said(lg1b) && g1b.snapshot().ledgerResets === 1 && lg1b.some((l) => /was removed — the count starts over; its marker records no turn nobody typed that still counts/.test(l)), JSON.stringify(lg1b));
    const redGone = copyOf("    if (marker && A.countLost(marker.counted, null, now)) { ledgerReset('removed', facts, now); return true; }", "    if (marker) { ledgerReset('removed', facts, now); return true; }", 'B-ef83: the release\'s rule (a marker beside no ledger = removed)');
    if (!redGone.err) {
      const d1r = tmpdir('vs-spend-3h-crashA-red-');
      fs.writeFileSync(LF(d1r, 'spend-budget.born.json'), fs.readFileSync(LF(d1, 'spend-budget.born.json'), 'utf8'));
      const in1r = []; mk(redGone, d1r, in1r, []);
      ok('§3h (1) CONTROL: with the release\'s rule the same disk files a SECOND, false notice (RED)', resets(in1r).length === 1);
    } else ok('§3h (1) CONTROL built', false, redGone.err);
    // order B: the reset's ledger landed (the count restarted), its marker did not — the old marker counts a turn the ledger lacks:
    // the loss the crash hid is said ONCE, now
    const d1B = tmpdir('vs-spend-3h-crashB-');
    fs.writeFileSync(LF(d1B, 'spend-budget.born.json'), M0);   // the marker from before the reset
    fs.writeFileSync(LF(d1B, 'spend-budget.json'), L1);       // the reset's ledger (the restarted count)
    const in1B = [], lg1B = []; const g1B = mk(guardMod, d1B, in1B, lg1B);
    ok('§3h (1) CRASH, order B (the ledger landed, the marker did not): the loss the crash hid is said ONCE now (reset #1, removed) — never missed',
      resets(in1B).length === 1 && g1B.snapshot().ledgerResets === 1 && g1B.snapshot().ledgerLastReset.kind === 'removed', JSON.stringify([resets(in1B).length, g1B.snapshot().ledgerLastReset, lg1B.slice(-2)]));
    // (2) A DOWNGRADE TO AN OLDER BUILD AND BACK: the older build writes no number (and never the marker), but its record is CURRENT —
    // it holds every turn the marker counted and its own: SILENT, numbered on
    const d2 = tmpdir('vs-spend-3h-downgrade-');
    { const g0 = mk(guardMod, d2, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: t3h }); g0.flush(); }
    const M2 = fs.readFileSync(LF(d2, 'spend-budget.born.json'), 'utf8');
    { const g0 = mk(guardMod, d2, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: t3h + 1000 }); g0.flush(); }   // the older build's turn
    const L2 = JSON.parse(fs.readFileSync(LF(d2, 'spend-budget.json'), 'utf8')); delete L2.seq;
    fs.writeFileSync(LF(d2, 'spend-budget.json'), JSON.stringify(L2)); fs.writeFileSync(LF(d2, 'spend-budget.born.json'), M2);   // as the older build left them
    const in2 = [], lg2 = []; const g2 = mk(guardMod, d2, in2, lg2);
    g2.note({ reason: 'auto-resume', identity: ID, now: t3h + 2000 }); g2.flush();
    ok('§3h (2) a DOWNGRADE and back (no write number, but every counted turn in it): SILENT — no notice, no reset; the journal says it, and it is numbered on',
      resets(in2).length === 0 && !said(lg2) && g2.snapshot().ledgerResets === 0 && lg2.some((l) => /carries no write number .* every turn nobody typed that still counts is in it: nothing is lost/.test(l))
        && JSON.parse(fs.readFileSync(LF(d2, 'spend-budget.json'), 'utf8')).seq > JSON.parse(M2).seq, JSON.stringify(lg2));
    const redNum = copyOf("    if (A.countLost(marker.counted, raw.budget || raw, now)) {", "    if (fileSeq === null || fileSeq < marker.seq || A.countLost(marker.counted, raw.budget || raw, now)) {", 'B-ef83: the release\'s rule (the write number decides)');
    if (!redNum.err) {
      const d2r = tmpdir('vs-spend-3h-downgrade-red-');
      fs.writeFileSync(LF(d2r, 'spend-budget.json'), JSON.stringify(L2)); fs.writeFileSync(LF(d2r, 'spend-budget.born.json'), M2);
      const in2r = []; mk(redNum, d2r, in2r, []);
      ok('§3h (2) CONTROL: with the release\'s rule the same files say «an older copy was put back» (RED: a false notice)', resets(in2r).length === 1);
    } else ok('§3h (2) CONTROL built', false, redNum.err);
    // (3) A MARKER REPAIRED BY HAND after an unreadable boot (a guess at its number, no count): SILENT
    const d3 = tmpdir('vs-spend-3h-repaired-');
    { const g0 = mk(guardMod, d3, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: t3h }); g0.flush(); }
    fs.writeFileSync(LF(d3, 'spend-budget.born.json'), '{"born":');   // torn
    { const g0 = mk(guardMod, d3, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: t3h + 1000 }); g0.flush(); }   // a boot with the marker held
    fs.writeFileSync(LF(d3, 'spend-budget.born.json'), JSON.stringify({ born: t3h - 9e6, seq: 99, resets: 0 }));   // repaired by hand: a guess
    const in3 = [], lg3 = []; const g3 = mk(guardMod, d3, in3, lg3);
    ok('§3h (3) a MARKER REPAIRED BY HAND (write 2 of a guessed 99, no count recorded): SILENT — the journal says it proves no loss',
      resets(in3).length === 0 && !said(lg3) && lg3.some((l) => /is write \d+ of 99 — its marker records no count to compare: nothing is lost/.test(l)), JSON.stringify(lg3));
    if (!redNum.err) {
      const d3r = tmpdir('vs-spend-3h-repaired-red-');
      fs.writeFileSync(LF(d3r, 'spend-budget.json'), fs.readFileSync(LF(d3, 'spend-budget.json'), 'utf8'));
      fs.writeFileSync(LF(d3r, 'spend-budget.born.json'), JSON.stringify({ born: t3h - 9e6, seq: 99, resets: 0 }));
      const in3r = []; mk(redNum, d3r, in3r, []);
      ok('§3h (3) CONTROL: with the release\'s rule the hand-repaired marker files «an older copy» (RED: a false notice)', resets(in3r).length === 1);
    }
    // (END) THE NOTICE ENDS when the last lost turn stops counting: its expiresAt is that instant; owed past it, it is not filed
    const dN = tmpdir('vs-spend-3h-end-');
    const lastStampT3h = t3h - 23 * 3600e3;
    { const g0 = mk(guardMod, dN, [], []); g0.note({ reason: 'auto-resume', identity: ID, now: lastStampT3h }); g0.flush(); }
    const MN = JSON.parse(fs.readFileSync(LF(dN, 'spend-budget.born.json'), 'utf8'));
    fs.rmSync(LF(dN, 'spend-budget.json'));
    const inN = []; mk(guardMod, dN, inN, []);
    ok('§3h (END) the reset\'s notice carries its END: the instant its last lost turn stops counting (a day past it)',
      resets(inN).length === 1 && MN.counted && resets(inN)[0].expiresAt === MN.counted.until && MN.counted.until === lastStampT3h + 24 * 3600e3, JSON.stringify([MN.counted, resets(inN)[0] && resets(inN)[0].expiresAt]));
    const dN2 = tmpdir('vs-spend-3h-end2-');
    fs.writeFileSync(LF(dN2, 'spend-budget.born.json'), JSON.stringify({ born: t3h - 9e7, seq: 3, resets: 1, noticeOwed: { kind: 'removed', n: 1, at: t3h - 9e7, until: t3h - 1000 } }));
    fs.writeFileSync(LF(dN2, 'spend-budget.json'), JSON.stringify({ v: 1, seq: 3, budget: { v: 1, identities: {}, instance: [], notices: {}, attended: [] } }));
    const inN2 = [], lgN2 = []; mk(guardMod, dN2, inN2, lgN2);
    ok('§3h (END) a notice OWED past its end (the store never took it in time) is not filed — untrue by then — and is cleared from the marker',
      resets(inN2).length === 0 && !JSON.parse(fs.readFileSync(LF(dN2, 'spend-budget.born.json'), 'utf8')).noticeOwed && lgN2.some((l) => /no longer said — the turns it lost no longer count/.test(l)), JSON.stringify(lgN2));
  } finally {
    for (const c of kids) { try { c.stdin.end(); } catch { } try { if (c.exitCode === null && !c.signalCode) c.kill('SIGKILL'); } catch { } }
  }
}

// ── §4 THE REAL AUTO-RESUME + THE REAL POOL ENGINE ──────────────────────────
console.log('\n§4 the real auto-resume: the ceiling refuses what the loop breaker would allow');
/** The world: one pooled member, one conversation, real symlinks, real engine
 *  (which constructs the real guard), real auto-resume wired exactly as
 *  server.js wires it. */
function mkWorld({ settings = {}, send = null, resumeVerb = null, arModule = arMod, gateHold = null } = {}) {
  const root = tmpdir('vs-spend-world-');
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3, subscriptionType: 'max' } }), { mode: 0o600 });
  const M1 = am.createSubscription({ name: 'Alpha' }).id; login(M1);
  const M2 = am.createSubscription({ name: 'Beta' }).id; login(M2);
  const P = am.createPool({ name: 'pool' }).id;
  am.setPoolTarget(P, M1);
  am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(Date.now() / 1000);
  const R5 = nowS + 3600, R7 = nowS + 3 * 86400;
  const writeCache = (id, c) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify(c));
  const healthy = (extra = {}) => ({ fetchedAt: Date.now(), source: 'on-demand', fiveHour: { utilization: 0.1, resetsAt: R5 }, sevenDay: { utilization: 0.2, resetsAt: R7 }, ...extra });
  writeCache(M1, healthy()); writeCache(M2, healthy());

  const sessions = new Map();
  const notices = [], noticeKeys = [], notes = [], fired = [], inbox = [];
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => { notices.push(t); noticeKeys.push(k); },
    serverSetting: (k) => settings[k], getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => ar, getQuotaProbe: () => null,
    getUserTodos: () => ({ add: (key, item) => { inbox.push({ key, ...item }); return { id: 'ut' }; } }),
  });
  // `send` stands in the delivery channel's ANSWER (§4b: a failed send is one
  // of deliver()'s two non-delivering exits); `resumeVerb` the descriptor's
  // verb (the other); `arModule` a patched copy for the negative controls.
  // Defaults are the shipped wiring: the registry's verb, a send that lands.
  const ar = arModule.create({
    dataDir, activeSessions: sessions, serverSetting: () => true, log: () => { },
    notify: (id, s2, text) => notes.push({ id, text }),
    sendToSession: (id, s2, text) => { if (send && !send(id, s2, text)) return false; fired.push({ id, text }); return true; },
    ...(resumeVerb ? { resumeVerb } : {}),
    beforeFire: (id, s2) => { try { const g = eng.beforeAutoResumeFire(id, s2); return gateHold ? gateHold.then(() => g) : g; } catch { return false; } },   // `gateHold` (r2988): the gate held on a promise
    fireIdentity: (id, s2) => { try { return eng.fireIdentityFor(s2); } catch { return null; } },
    // MIRRORS server.js, including r5's probe flag and release half — a harness
    // that drops `hold` makes the pre-gate probe reserve the slot the charging
    // call then needs, and NOTHING ever fires (measured).
    authorizeSpend: (id, s2, identity, o) => eng.spendGuard.authorize({ reason: 'auto-resume', session: s2, sessionId: id, sessionName: s2 && s2.name, identity, hold: !!(o && o.hold) }),
    noteSpend: (id, s2, identity, hold) => eng.spendGuard.note({ reason: 'auto-resume', session: s2, identity, hold }),
    releaseSpend: (id, s2, hold) => eng.spendGuard.release({ hold }),
  });
  // r2988: THE FIRE'S OWN STATE — `_arFiring` is set while a continue's pre-fire gate (a promise) is in flight and cleared once
  // its delivery ran: a wait on it, bounded, never a fixed sleep a loaded whole gate outlasts
  const settled = async (boundMs = 10000) => { for (const t0 = Date.now(); [...sessions.values()].some((x) => x && x._arFiring) && Date.now() - t0 < boundMs;) await tick(5); };
  const mkSession = (sid) => {
    const s = { backend: 'claude', mode: 'chat', _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, _autoResume: true, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: sid };
    sessions.set(sid, s); am.ensureSessionPoolLink(P, sid, M1); return s;
  };
  return {
    root, dataDir, am, eng, ar, sessions, P, M1, M2, notices, noticeKeys, notes, fired, inbox, writeCache, healthy, cacheDir,
    mkSession, settled,
    // An arm needs a reset in the FUTURE (armIfEnabled refuses a past one), and
    // the tick is driven with an explicit `now` past reset + GRACE_MS instead
    // of sleeping 15s.
    arm: (s) => ar.armIfEnabled(s._webuiId, s, Date.now() + 60_000, 'usage limit'),
    fireDue: async () => { ar.tick(Date.now() + 120_000); await tick(80); await settled(); },   // r2988: then until no gate is in flight
  };
}
const probe = mkWorld();
if (!probe) {
  console.log('  · SKIP (pooled accounts are unsupported on ' + process.platform + ')');
  console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
  process.exit(fail ? 1 : 0);
}
{
  const w = mkWorld({ settings: { 'spend.unattendedPerIdentityHour': 1 } });
  const s = w.mkSession('sess-1-1');
  // fire #1 — allowed
  w.arm(s); await w.fireDue();
  ok('§4 the first continue is delivered', w.fired.length === 1, JSON.stringify(w.fired.map((f) => f.id)));
  // r2988 (one UTC sighting in a whole gate, green alone: the leg above read [] — the continue was delivered and charged once, LATER
  // than the old fixed 80 ms; the ceiling then refused the second as it should): THE WAIT IS THE FIRE'S OWN STATE. RED by a HELD
  // promise, never by load: a second world whose pre-fire gate is held past those 80 ms — the fixed sleep reads no continue while
  // the gate is in flight; the wait on the fire's state reads it delivered once, the gate done
  {
    let open = null; const hold = new Promise((r) => { open = r; });
    const wh = mkWorld({ settings: { 'spend.unattendedPerIdentityHour': 1 }, gateHold: hold });
    const sh = wh.mkSession('sess-h-1');
    wh.arm(sh); wh.ar.tick(Date.now() + 120_000); await tick(80);
    const atSleep = wh.fired.length, firing = !!sh._arFiring;
    open(); await wh.settled();
    ok('§4 r2988 THE WAIT IS THE FIRE\'S OWN STATE: a pre-fire gate held past the old fixed 80 ms — that sleep reads NO continue while the gate is in flight (the whole gate\'s sighting, made by a held promise); the wait on the fire\'s state reads it delivered ONCE',
      atSleep === 0 && firing && wh.fired.length === 1 && !sh._arFiring, { atSleep, firing, fired: wh.fired.map((f) => f.id) });
  }
  // the loop breaker itself would allow a TIMED fire for a different arm, so
  // this next one is refused by the CEILING and by nothing else
  const s2 = w.mkSession('sess-2-2');
  ok('§4 control: the loop breaker has no objection to the second session (a fresh record, no failed fire)',
    w.ar.canFire('sess-2-2', w.M1, 'timed', Date.now()).ok === true);
  w.arm(s2); await w.fireDue();
  ok('§4 THE CEILING refuses it: the identity has spent its hour', w.fired.length === 1, JSON.stringify(w.fired.map((f) => f.id)));
  ok('§4 …and the PROMISE is kept: the session is still armed, so a later hour continues it', !!w.ar._armed.get('sess-2-2'));
  ok('§4 …and the refusal reached the user through the guard, not through a second card class',
    w.inbox.some((i) => /refused/.test(i.text) && /hour/.test(i.detail || '')) && !w.notes.some((n) => /预算/.test(n.text)), JSON.stringify(w.inbox.map((i) => i.text)));

  // the budget on disk counts exactly the delivered turn
  w.eng.spendGuard.flush();
  const led = JSON.parse(fs.readFileSync(path.join(w.dataDir, 'spend-budget.json'), 'utf8'));
  ok('§4 the ledger records exactly ONE spend, against the credential slot the continue landed on',
    (led.budget.identities[w.M1] || []).length === 1 && (led.budget.instance || []).length === 1, JSON.stringify(led.budget.identities));
  // §5c's rule, measured on THIS producer: auto-resume charges the slot its own
  // authorization resolved (`spendOk`'s out-param), so the guard is never asked
  // the identity question a second time at charge time.
  ok('§4 …and the guard never re-resolved the identity at CHARGE time (§5c\'s rule, on the real auto-resume)',
    w.eng.spendGuard.snapshot().chargesUnhinted === 0, String(w.eng.spendGuard.snapshot().chargesUnhinted));

  // OWNER-TYPED TURNS ARE NEVER COUNTED
  const before = (led.budget.instance || []).length;
  w.ar.noteRecovered('sess-2-2', 'user sent a prompt');
  w.eng.noteTurnEnd(w.sessions.get('sess-2-2'));
  w.eng.spendGuard.flush();
  const led2 = JSON.parse(fs.readFileSync(path.join(w.dataDir, 'spend-budget.json'), 'utf8'));
  ok('§4 an OWNER-TYPED prompt (and the turn end it produces) charges nothing (D6)', (led2.budget.instance || []).length === before);
}

// ── §4b THE HOLD IS GIVEN BACK ON EVERY EXIT THAT DOES NOT DELIVER (B-59b8) ─
// deliver() authorizes WITH a hold (the slot is reserved from the ceiling's
// answer to the send), and two of its exits deliver nothing: the channel
// refused the continue (`sendToSession` → false, "will retry") and the
// harness declares no resume verb at fire time. Each calls `giveBack()`. The
// merge verifier measured that deleting either call left this suite,
// test-auto-resume and test-auto-resume-loop all green — the release was
// unpinned. With the hour cap at ONE, a hold left booked IS the whole budget:
// the next continue on that slot is refused until the hold times out
// (A.RESERVE_TTL_MS, 3 min), so each leg below measures the release by the
// behaviour it buys — the SAME slot authorizes again — and by the guard's own
// census (`holdsOpen`). NEGATIVE CONTROL: a patched copy of auto-resume.js with
// that exit's `giveBack();` removed must FAIL its leg.
console.log('\n§4b a continue that is not delivered gives its hold back (failed send / no verb)');
{
  const harnessReg = require(path.join(REPO, 'src/harnesses/index.js'));
  const HOUR1 = { 'spend.unattendedPerIdentityHour': 1 };
  /** exit 1: the channel refuses the continue. Returns the measured facts. */
  async function failedSendLeg(arModule) {
    let sendOk = false;
    const w = mkWorld({ settings: HOUR1, send: () => sendOk, arModule });
    const s = w.mkSession('sess-send-1');
    w.arm(s); await w.fireDue();
    const snap = w.eng.spendGuard.snapshot();
    const a = w.ar._armed.get('sess-send-1');
    const r = { notDelivered: w.fired.length === 0, holdsOpen: snap.holdsOpen, stillArmed: !!a && !a.fired };
    // the same slot, the same (still armed) session, a channel that lands now
    sendOk = true; await w.fireDue();
    r.refired = w.fired.length === 1;
    const led = w.eng.spendGuard.snapshot().budget;
    r.charged = (led.identities[w.M1] || []).length;
    return r;
  }
  /** exit 2: a verb at arm time (armIfEnabled refuses a harness without one),
   *  none at fire time. */
  async function noVerbLeg(arModule) {
    let verbOn = true;
    const w = mkWorld({ settings: HOUR1, resumeVerb: (s2) => (verbOn ? harnessReg.resumeVerb(s2 && s2.backend) : null), arModule });
    const s = w.mkSession('sess-verb-1');
    const armedOk = !!w.arm(s) && !!w.ar._armed.get('sess-verb-1');
    verbOn = false; await w.fireDue();
    const snap = w.eng.spendGuard.snapshot();
    const r = { armedOk, notDelivered: w.fired.length === 0, holdsOpen: snap.holdsOpen, disarmed: !w.ar._armed.get('sess-verb-1') };
    // a second arm + fire on the SAME slot (the verb is back) must authorize
    verbOn = true;
    const s2 = w.mkSession('sess-verb-2');
    w.arm(s2); await w.fireDue();
    r.refired = w.fired.length === 1 && w.fired[0].id === 'sess-verb-2';
    return r;
  }
  const fs1 = await failedSendLeg(arMod);
  ok('§4b FAILED SEND: nothing was delivered (the channel refused the continue)', fs1.notDelivered, JSON.stringify(fs1));
  ok('§4b …the hold was GIVEN BACK (the guard holds nothing open)', fs1.holdsOpen === 0, JSON.stringify(fs1));
  ok('§4b …the session is STILL ARMED ("will retry" is a promise that stands)', fs1.stillArmed, JSON.stringify(fs1));
  ok('§4b …and the SAME slot, at an hour cap of ONE, authorizes the retry — which lands and is charged once',
    fs1.refired && fs1.charged === 1, JSON.stringify(fs1));
  const nv = await noVerbLeg(arMod);
  ok('§4b NO VERB: the session armed while its harness had a verb', nv.armedOk, JSON.stringify(nv));
  ok('§4b …nothing was delivered when the verb was gone at fire time', nv.notDelivered, JSON.stringify(nv));
  ok('§4b …the hold was GIVEN BACK (the guard holds nothing open)', nv.holdsOpen === 0, JSON.stringify(nv));
  ok('§4b …the arm is dropped (no verb = a promise nobody can keep; the shipped exit disarms)', nv.disarmed, JSON.stringify(nv));
  ok('§4b …and a second arm + fire on the SAME slot, at an hour cap of ONE, still authorizes and lands', nv.refired, JSON.stringify(nv));

  // NEGATIVE CONTROLS: each exit's own `giveBack();` removed in a patched copy
  const legFails = (r) => !(r.holdsOpen === 0 && r.refired);
  const mSend = mutantModule('src/server/auto-resume.js', [["could not deliver the continue prompt (will retry)`); giveBack(); return false; }", "could not deliver the continue prompt (will retry)`); return false; }"]]);
  ok('§4b CONTROL: the failed-send patch applies to the real file (a needle that misses would pass by doing nothing)', !mSend.err, mSend.err);
  if (mSend.mod) {
    const r = await failedSendLeg(mSend.mod);
    ok('§4b CONTROL: with the failed-send giveBack() removed the leg FAILS (the hold stays booked, the retry is refused)', legFails(r) && r.holdsOpen === 1 && !r.refired, JSON.stringify(r));
    const other = await noVerbLeg(mSend.mod);
    ok('§4b CONTROL: …and that patch leaves the no-verb leg green (each leg pins its OWN exit)', !legFails(other), JSON.stringify(other));
  }
  const mVerb = mutantModule('src/server/auto-resume.js', [["declares no resume verb — cannot continue`); giveBack(); armed.delete(id);", "declares no resume verb — cannot continue`); armed.delete(id);"]]);
  ok('§4b CONTROL: the no-verb patch applies to the real file', !mVerb.err, mVerb.err);
  if (mVerb.mod) {
    const r = await noVerbLeg(mVerb.mod);
    ok('§4b CONTROL: with the no-verb giveBack() removed the leg FAILS (the hold stays booked, the second arm is refused)', legFails(r) && r.holdsOpen === 1 && !r.refired, JSON.stringify(r));
    const other = await failedSendLeg(mVerb.mod);
    ok('§4b CONTROL: …and that patch leaves the failed-send leg green', !legFails(other), JSON.stringify(other));
  }
}

// ── §5 THE REAL DELIVERY LADDER ─────────────────────────────────────────────
console.log('\n§5 the delivery ladder: a refusal stashes, an allowed delivery is charged once');
{
  const dataDir = tmpdir('vs-spend-deliver-');
  const settings = { 'spend.unattendedPerIdentityHour': 1 };
  const guard = guardMod.create({
    dataDir, serverSetting: (k) => settings[k],
    identityOf: (s) => (s && s._acct ? { key: s._acct, name: s._acct } : null),
    getUserTodos: () => null, log: () => { },
  });
  const posted = [];
  const sessions = new Map([['w1', { backend: 'claude', mode: 'chat', claudeSessionId: 'cid-1', _acct: 'sub-a', pty: { write() { } } }]]);
  const deliver = deliverMod.create({
    dataDir, activeSessions: sessions,
    peerMsg: { findPeer: (cid) => ({ socketPath: '/tmp/x', name: 'peer' }), postToPeer: async (p, t) => { posted.push(t); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
    getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, emitPeerCard: () => { },
    authorizeSpend: (req) => guard.authorize(req), noteSpend: (rec) => guard.note(rec),
    log: () => { },
  });
  const r1 = await deliver.deliverToConversation('cid-1', 'hello', { spendReason: 'job-notification' });
  ok('§5 the first Background Work notification is delivered live', r1.ok === true && posted.length === 1, JSON.stringify(r1));
  const r2 = await deliver.deliverToConversation('cid-1', 'hello again', { spendReason: 'job-notification' });
  ok('§5 the second is REFUSED by the ceiling, with a reason the caller can read', r2.ok === false && r2.refused === 'spend' && /spend budget/.test(r2.reason), JSON.stringify(r2));
  ok('§5 …and nothing was posted for it (the CLI never saw a frame)', posted.length === 1);
  // NOTHING IS LOST: the caller stashes, and the stash is what the next
  // injection drains — the same words, riding a turn that was going to happen.
  deliver.stashFor('cid-1', { source: 'agent', text: 'hello again' });
  ok('§5 the refused message is STASHED and drains into the next injection (a refusal is not a dropped promise)',
    deliver.stashCount('cid-1') === 1 && deliver.drainStash('cid-1')[0].text === 'hello again');
  // lane notify-retry (2026-10-01): between the ok branch and the stash there is now the PARKED branch — a transient
  // miss on a live pid the ladder keeps (and retries under the SAME authorization); every other not-ok answer stashes
  ok('§5 the jobs engine stashes exactly this shape on a not-ok answer (source pin at the caller: ok → parked → stashed)',
    /if \(r && r\.ok\) \{[\s\S]{0,400}\} else if \(r && r\.parked === true\) \{[\s\S]{0,2000}\} else \{\s*\n\s*this\._stashNotif\(cid, job, ev,/.test(read('src/jobs.js')));
  const led = guard.snapshot();
  ok('§5 the ledger charged the delivered one ONLY', (led.budget.identities['sub-a'] || []).length === 1, JSON.stringify(led.budget.identities));
}

// ── §5b A DELIVERY THAT OPENS NO TURN IS NOT A SPEND (r2) ───────────────────
// The ladder charged a full unattended turn for EVERY accepted delivery,
// including a notification STEERED into a turn already running — which the
// wrapper folds into that turn (it carries only itself, the queue is untouched)
// and which therefore bills nothing. Twelve mid-turn Background Work
// notifications on one subscription exhausted the default 12/hour ceiling on
// zero turns, and the NEXT auto-resume continue — the one that does cost money
// — was refused with 'hour-cap'. Everything else still charges: claude's
// cli-inbox QUEUES a mid-turn delivery and runs it as its own billed turn, and
// a codex `peer` frame is thread/queue/add, likewise its own turn afterwards.
console.log('\n§5b a steered notification opens no turn, so it spends no budget');
{
  const mkLadder = () => {
    const dataDir = tmpdir('vs-spend-steer-');
    fs.mkdirSync(path.join(dataDir, 'session-buffers'), { recursive: true });
    // the wrapper sidecar the rpc rung gates on (caps.peerMessage)
    fs.writeFileSync(path.join(dataDir, 'session-buffers', 'w1.json'), JSON.stringify({ caps: CURRENT_WRAPPER_CAPS }));
    const settings = { 'spend.unattendedPerIdentityHour': 12 };
    const guard = guardMod.create({
      dataDir, serverSetting: (k) => settings[k],
      identityOf: () => ({ key: 'slot-A', name: 'Alpha' }),
      getUserTodos: () => null, log: () => { },
    });
    const frames = [];
    const S = {
      backend: 'codex', mode: 'chat', _webuiId: 'w1', backendSessionId: 'cid-1',
      _isStreaming: true, pty: { write: (x) => frames.push(String(x)) }, name: 'busy',
    };
    const sessions = new Map([['w1', S]]);
    const deliver = deliverMod.create({
      dataDir, activeSessions: sessions,
      peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) },
      getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, emitPeerCard: () => { },
      authorizeSpend: (req) => guard.authorize(req), noteSpend: (rec) => guard.note(rec), log: () => { },
    });
    const charged = () => (guard.snapshot().budget.identities['slot-A'] || []).length;
    return { deliver, guard, S, frames, charged };
  };
  // the LANE fact this is gated on, read off the caps row (never a backend id)
  ok('§5b codex declares the steer lane for notifications; claude does not',
    notificationDelivery(capsOf('codex')) === 'steer' && notificationDelivery(capsOf('claude')) === 'cli-inbox');

  {   // THE INCIDENT: three notifications into a session that is MID-TURN
    const L = mkLadder();
    for (let i = 0; i < 3; i++) await L.deliver.deliverToConversation('cid-1', 'job ' + i, { kind: 'notification', spendReason: 'job-notification' });
    ok('§5b all three are DELIVERED (this is not a refusal — the message rides the running turn)', L.frames.length === 3);
    ok('§5b …and the ledger charged NOTHING for them (they opened no turn)', L.charged() === 0, String(L.charged()));
    ok('§5b …so the auto-resume continue — a REAL billed turn — is still authorized',
      L.guard.authorize({ reason: 'auto-resume', session: L.S }).ok === true);
    ok('§5b the ladder SAYS it steered, so the caller and the journal can tell the two apart',
      (await L.deliver.deliverToConversation('cid-1', 'job 4', { kind: 'notification', spendReason: 'job-notification' })).steered === true);
  }
  {   // POSITIVE CONTROL 1: the same session, IDLE ⇒ turn/start ⇒ a billed turn
    const L = mkLadder(); L.S._isStreaming = false;
    await L.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    ok('§5b POSITIVE CONTROL: an IDLE target opens a turn, and it IS charged', L.charged() === 1, String(L.charged()));
  }
  {   // POSITIVE CONTROL 2 (restated — lane queued-is-not-woke, law 1 round 2, 主开发's ruling 2026-11-12): a HUMAN peer message
      // mid-turn queues as its own turn afterwards — its unit RESERVED at the send (a stamp named by the frame's id, counted
      // like a spent turn), the turn that carries it IS that unit (never free, never at the stdin write: the 2026-11-11 incident's three charges for turns that
      // never ran)
    const L = mkLadder();
    const r = await L.deliver.deliverToConversation('cid-1', 'hi', { kind: 'peer', spendReason: 'peer-message' });
    const atSend = L.charged();
    const settled = L.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued' });
    L.deliver.noteQueueItems('cid-1', [{ id: 'q1' }]);   // the wrapper's queue holds it (its queue_changed)
    const whileQueued = L.charged();
    L.deliver.noteTurnEnded('cid-1'); L.deliver.noteQueueItems('cid-1', []); L.deliver.noteTurnStarted('cid-1');   // its turn starts
    const carried = L.charged();
    L.deliver.noteTurnStarted('cid-1');
    ok('§5b POSITIVE CONTROL (law 1 round 2 — a RESERVATION): a human PEER message mid-turn is queued and its unit TAKEN at the send (counted like a spent turn); the wrapper\'s «queued», the turn that carries it and a later turn add nothing — ONE unit',
      r.ok === true && r.queued === true && atSend === 1 && settled === 'queued' && whileQueued === 1 && carried === 1 && L.charged() === 1, JSON.stringify({ r, atSend, settled, whileQueued, carried, after: L.charged() }));
  }
  {   // POSITIVE CONTROL 3: claude's cli-inbox lane is never treated as free
    const dataDir = tmpdir('vs-spend-steer-cl-');
    const guard = guardMod.create({ dataDir, serverSetting: () => 12, identityOf: () => ({ key: 'slot-A', name: 'Alpha' }), getUserTodos: () => null, log: () => { } });
    const sessions = new Map([['w1', { backend: 'claude', mode: 'chat', claudeSessionId: 'cid-1', _isStreaming: true, pty: { write() { } } }]]);
    const deliver = deliverMod.create({
      dataDir, activeSessions: sessions,
      peerMsg: { findPeer: () => ({ socketPath: '/tmp/x', name: 'p' }), postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) },
      getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, emitPeerCard: () => { },
      authorizeSpend: (req) => guard.authorize(req), noteSpend: (rec) => guard.note(rec), log: () => { },
    });
    await deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    ok('§5b POSITIVE CONTROL: claude MID-TURN is charged — its CLI queues the delivery and then runs it as its own billed turn',
      (guard.snapshot().budget.identities['slot-A'] || []).length === 1);
  }
  {   // THE SETTLEMENT: the prediction can be wrong, and the wrapper says so
    const L = mkLadder();
    await L.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    ok('§5b a predicted-free delivery is held UNSETTLED, not silently forgotten', L.deliver._unsettledCount('cid-1') === 1);
    ok('§5b …the wrapper answering `mode:steered` confirms it was free', L.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'steered' }) === 'free' && L.charged() === 0);
    await L.deliver.deliverToConversation('cid-1', 'job2', { kind: 'notification', spendReason: 'job-notification' });
    ok('§5b …but a steer that FELL BACK to the queue really did open a turn, and is charged THEN',
      L.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued' }) === 'charged' && L.charged() === 1);
    ok('§5b an unknown conversation settles to nothing (no phantom charges)', L.deliver.settleRpcDelivery('cid-nope', { ok: true, mode: 'queued' }) === null);
  }

  // ── §5c THE RESERVATION (lane queued-is-not-woke, law 1 round 2 — 主开发's panel, 2026-11-12): A FRAME QUEUED BEHIND A
  // RUNNING TURN TAKES ITS UNIT AT THE SEND. The panel drove the release with the real guard at cap 3: the hold went back at
  // «queued», every later authorize allowed again, and the wrapper ran eight billed turns («spent 8 … (cap 3)»). The law: an
  // owed charge is a RESERVATION — a stamp named by the frame's id, counted by every authorize like a spent turn, the
  // carrying turn that same unit (idempotent by the id), returned only when the frame is handed back or refused.
  {
    const A2 = require(path.join(REPO, 'src/spend-authorizer.js'));
    const id = { key: 'slot-R', name: 'R' };
    let st = A2.emptyBudget();
    st = A2.noteUnattendedSpend(st, { identity: id, reason: 'peer-message', rid: 'qw-1' }).state;
    st = A2.noteUnattendedSpend(st, { identity: id, reason: 'peer-message', rid: 'qw-1' }).state;
    ok('§5c a reservation is ONE unit by its id — a second note for the same id adds nothing (a crash between a carry and its persist never charges twice)', (st.identities['slot-R'] || []).length === 1 && st.identities['slot-R'][0].rid === 'qw-1');
    const back = A2.returnReservation(st, { rid: 'qw-1' });
    ok('§5c …returned by its id: the windows are empty again', back.returned === 1 && !(back.state.identities['slot-R'] || []).length && !(back.state.instance || []).some((t) => t && t.rid === 'qw-1'));
    ok('§5c …an id never stamped returns nothing', A2.returnReservation(st, { rid: 'qw-nope' }).returned === 0);
    // THE CEILING, driven: the REAL guard at 3 an hour, the REAL ladder, an Antigravity conversation in a turn
    const mk = () => {
      const dataDir = tmpdir('vs-spend-reserve-');
      fs.mkdirSync(path.join(dataDir, 'session-buffers'), { recursive: true });
      const settings = { 'spend.unattendedPerIdentityHour': 3 };
      const guard = guardMod.create({ dataDir, serverSetting: (k) => settings[k], identityOf: () => ({ key: 'slot-A', name: 'Alpha' }), getUserTodos: () => null, log: () => { } });
      const frames = [];
      const S = { backend: 'antigravity', mode: 'chat', backendSessionId: 'cid-r', name: 'busy', host: null, socketPath: path.join(dataDir, 'cw-w1'), _isStreaming: true, _turnStateSeen: true, pty: { write: (x) => frames.push(JSON.parse(String(x))) } };
      fs.writeFileSync(path.join(dataDir, 'session-buffers', 'w1.json'), JSON.stringify({ pid: process.pid, startedAt: Date.now(), mode: 'chat', backend: 'antigravity', caps: { peerMessage: true, notificationSteer: false } }));
      const deliver = deliverMod.create({
        dataDir, activeSessions: new Map([['w1', S]]), serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null, emitPeerCard: () => { },
        peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) },
        authorizeSpend: (req) => guard.authorize(req), noteSpend: (rec) => guard.note(rec), releaseSpend: (rec) => guard.release(rec), log: () => { },
      });
      const hour = () => (guard.snapshot().budget.identities['slot-A'] || []).length;
      return { guard, deliver, frames, hour };
    };
    {
      const L = mk();
      const rs = [];
      for (let i = 0; i < 8; i++) { const r = await L.deliver.deliverToConversation('cid-r', 'wake ' + i, { kind: 'peer', spendReason: 'peer-message' }); rs.push(r); if (r.ok) { L.deliver.noteQueueItems('cid-r', L.frames.map((_, k) => ({ id: 'q' + k }))); L.deliver.settleRpcDelivery('cid-r', { ok: true, mode: 'queued' }); } }
      ok('§5c THE CEILING: cap 3, a conversation in a turn — sends 1 to 3 queued, sends 4 and on REFUSED at the send by name (the hour cap), 3 frames written',
        rs.slice(0, 3).every((r) => r.ok && r.queued) && rs.slice(3).every((r) => !r.ok && r.refused === 'spend' && r.why === 'hour-cap') && L.frames.length === 3, JSON.stringify(rs.map((r) => r.ok ? 'Q' : r.why)));
      ok('§5c …the hour reads 3 while they wait', L.hour() === 3);
      for (const left of [['q1', 'q2'], ['q2'], []]) { L.deliver.noteTurnEnded('cid-r'); L.deliver.noteQueueItems('cid-r', left.map((id) => ({ id }))); L.deliver.noteTurnStarted('cid-r'); }
      ok('§5c …the turn ends: exactly 3 turns billed, the hour reads 3 (each carried turn is its reserved unit)', L.hour() === 3 && L.deliver.queuedEntries('cid-r').length === 0, String(L.hour()));
    }
    {
      const L = mk();
      for (let i = 0; i < 3; i++) { await L.deliver.deliverToConversation('cid-r', 'stop ' + i, { kind: 'peer', spendReason: 'peer-message' }); L.deliver.settleRpcDelivery('cid-r', { ok: true, mode: 'queued' }); }
      const before = L.hour();
      L.deliver.noteQueueItems('cid-r', []); for (const f of L.frames) L.deliver.noteHandedBack('cid-r', f.text, 'dropped by Stop before it was delivered');
      ok('§5c …Stop instead: 0 billed — the 3 reservations returned (the hour 3 → 0)', before === 3 && L.hour() === 0, JSON.stringify({ before, after: L.hour() }));
    }
  }

  // ── §5d THE RESERVATION, ROUND 3 (主开发's panel on 09f128868): a give-back never forgives a spent turn; a carried reservation
  // is CONVERTED (never returnable); ids never repeat; both bounds refuse — rows here, with caps ABOVE the defaults and a
  // ledger that holds spent stamps too
  {
    const A3 = require(path.join(REPO, 'src/spend-authorizer.js'));
    const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
    const big = (extra = {}) => { const dataDir = tmpdir('vs-spend-r3-'); const settings = { 'spend.unattendedPerIdentityHour': 5000, 'spend.unattendedPerIdentityDay': 1000, 'spend.unattendedPerInstanceDay': 10000, ...extra }; return { dataDir, guard: guardMod.create({ dataDir, serverSetting: (k) => settings[k], identityOf: () => ({ key: 'slot-B', name: 'Big' }), getUserTodos: () => null, log: () => { } }) }; };
    const id = { key: 'slot-B', name: 'Big' };
    const day = (g) => (g.snapshot().budget.identities['slot-B'] || []).length;
    // MUST 1: day cap 1 000, 900 spent, ONE queued wake handed back ⇒ exactly 100 allowed after it (the release forgave nothing)
    {
      // 900 turns spent across the day (the hour cap is clamped at 200, so they sit 2–22 h back), loaded from the guard's own file
      const dataDir = tmpdir('vs-spend-r3-must1-');
      const L3 = { perIdentityHour: 200, perIdentityDay: 1000, perInstanceDay: 10000 };
      let st = A3.emptyBudget(); const t0 = Date.now();
      for (let i = 0; i < 900; i++) st = A3.noteUnattendedSpend(st, { identity: id, reason: 'peer-message', at: t0 - 2 * 3600e3 - i * 60e3, limits: L3 }).state;
      fs.writeFileSync(path.join(dataDir, 'spend-budget.json'), JSON.stringify({ v: 1, budget: st }));
      const settings = { 'spend.unattendedPerIdentityHour': 200, 'spend.unattendedPerIdentityDay': 1000, 'spend.unattendedPerInstanceDay': 10000 };
      const guard = guardMod.create({ dataDir, serverSetting: (k) => settings[k], identityOf: () => id, getUserTodos: () => null, log: () => { } });
      const v = guard.authorize({ reason: 'peer-message', identity: id });
      guard.note({ reason: 'peer-message', identity: id, hold: v.hold, reservation: 'qw-r3-stop' });
      const returned = guard.release({ reservation: 'qw-r3-stop' });
      let allowed = 0;
      for (let i = 0; i < 400; i++) { const a = guard.authorize({ reason: 'peer-message', identity: id }); if (!a.ok) break; allowed++; guard.note({ reason: 'peer-message', identity: id, hold: a.hold }); }
      ok('§5d MUST 1: day cap 1 000, 900 spent, one Stop (a reservation returned) ⇒ EXACTLY 100 allowed after it — a give-back keeps what the largest caps could count and forgives no spent turn', returned === true && allowed === 100 && day(guard) === 1000, JSON.stringify({ returned, allowed, day: day(guard) }));
    }
    {
      let st = A3.emptyBudget();
      for (let i = 0; i < 950; i++) st = A3.noteUnattendedSpend(st, { identity: id, reason: 'peer-message', limits: { perIdentityDay: 2000, perIdentityHour: 5000, perInstanceDay: 10000 } }).state;
      st = A3.noteUnattendedSpend(st, { identity: id, reason: 'peer-message', rid: 'qw-x', limits: { perIdentityDay: 2000, perIdentityHour: 5000, perInstanceDay: 10000 } }).state;
      const back = A3.returnReservation(st, { rid: 'qw-x', limits: { perIdentityDay: 2000, perIdentityHour: 5000, perInstanceDay: 10000 } });
      ok('§5d a return drops ONLY its id: 950 spent stamps stay (never cut to the default retention)', back.returned === 1 && back.state.identities['slot-B'].length === 950, String(back.state.identities['slot-B'].length));
    }
    // THE CENSUS (round 4, MUST 2): EVERY file that can call the prune — src/, server.js, data/bin/, tools/, scripts/ (tests
    // aside) — and EVERY reference to it: a call keeps LOAD_RETENTION (never the live limits, never null, never none), and
    // no alias (a destructured or re-bound prune escapes a textual census); a mention after `//` or on a JSDoc ` *` line is prose
    {
      const roots = ['src', 'data/bin', 'tools', 'scripts'];
      // git grep reads EVERY tracked file under the roots (in C, ~20 ms); the files that name the prune are judged below. No git
      // (a tree without .git and no shim) ⇒ the same set walked from the disk
      let files = null, readBy = 'git grep over every tracked file';
      try { const out = execFileSync('git', ['-C', REPO, 'grep', '-n', 'pruneBudget', '--', ...roots, 'server.js'], { env: GIT_ENV, maxBuffer: 64 * 1024 * 1024 }).toString(); files = [...new Set(out.split('\n').filter(Boolean).map((l) => l.slice(0, l.indexOf(':'))))]; } catch { files = null; }
      if (!files) {
        readBy = 'a walk of the disk'; files = ['server.js'];
        const walk = (rel) => { let st; try { st = fs.statSync(path.join(REPO, rel)); } catch { return; } if (st.isDirectory()) { for (const n of fs.readdirSync(path.join(REPO, rel))) { if (n === 'node_modules' || n.startsWith('.')) continue; walk(path.join(rel, n)); } } else if (/\.(c|m)?js$/.test(rel) || (rel.startsWith('data/bin/') && !/\.\w+$/.test(rel))) files.push(rel); };
        for (const r of roots) walk(r);
      }
      const scanned = files.filter((rel) => !/^scripts\/(test-|fixtures\/)/.test(rel));
      const prose = (src, at) => { const line = src.slice(src.lastIndexOf('\n', at) + 1, at); return /\/\//.test(line) || /^\s*\*/.test(line); };
      const KEEP = new Set(['LOAD_RETENTION', 'A.LOAD_RETENTION']);
      const calls = [], bad = [];
      for (const rel of scanned) {
        let src; { const r = textOf(rel); if (r.e) continue; src = r.t; }
        const re = /\bpruneBudget\b/g; let m;
        while ((m = re.exec(src))) {
          const at = m.index, after = src.slice(at + 'pruneBudget'.length);
          if (prose(src, at)) continue;
          if (rel === 'src/spend-authorizer.js' && /function $/.test(src.slice(Math.max(0, at - 9), at))) continue;   // the definition
          if (rel === 'src/spend-authorizer.js' && /^\s*,/.test(after) && src.lastIndexOf('module.exports', at) > src.lastIndexOf('}', at)) continue;   // the export list
          if (!/^\s*\(/.test(after)) { bad.push({ rel, why: 'an alias or a reference', text: src.slice(Math.max(0, at - 30), at + 40) }); continue; }
          let depth = 0, k = at + src.slice(at).indexOf('(') + 1; const args = []; let cur = '';
          for (; k < src.length; k++) { const c = src[k]; if (c === '(' || c === '{' || c === '[') depth++; else if (c === ')' || c === '}' || c === ']') { if (depth === 0) break; depth--; } if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; } else cur += c; }
          args.push(cur.trim());
          calls.push({ rel, args });
          if (args.length !== 3 || !KEEP.has(args[2])) bad.push({ rel, why: args.length < 3 ? 'no retention' : 'not LOAD_RETENTION', text: 'pruneBudget(' + args.join(', ') + ')' });
        }
      }
      ok(`§5d CENSUS (round 4): src/, data/bin/, tools/, scripts/ (tests aside) and server.js read by ${readBy} — ${scanned.length} name the prune; every pruneBudget call (${calls.length}) keeps LOAD_RETENTION — none, null, the live limits and an alias are red`, scanned.includes('src/spend-authorizer.js') && scanned.includes('src/server/spend-guard.js') && calls.length >= 5 && bad.length === 0, JSON.stringify({ bad, scanned }));
      // the census reads what it claims: the panel's M8b / M8c / M8d, each in a copy of the text, is found
      const probe = (rel, src) => { const out = []; const re = /\bpruneBudget\b/g; let m; while ((m = re.exec(src))) { const after = src.slice(m.index + 11); if (!/^\s*\(/.test(after)) { out.push('alias'); continue; } const a = after.slice(after.indexOf('(') + 1); let d = 0, cur = '', args = []; for (const c of a) { if (c === '(' || c === '{' || c === '[') d++; else if (c === ')' || c === '}' || c === ']') { if (d === 0) break; d--; } if (c === ',' && d === 0) { args.push(cur.trim()); cur = ''; } else cur += c; } args.push(cur.trim()); if (args.length !== 3 || !KEEP.has(args[2])) out.push(args.join(',')); } return out; };
      ok('§5d CENSUS reads what it claims: a null third argument (M8b), a bare call in queued-wakes.js (M8c) and a destructured alias (M8d) are each found',
        probe('x', 'const s = pruneBudget(state, now, null);').length === 1 && probe('x', "void require('../spend-authorizer.js').pruneBudget({}, 0);").length === 1 && probe('x', 'const { pruneBudget: pb_ } = A; state = pb_(state, now);').includes('alias')
        && probe('x', 'const s = pruneBudget(state, now, limits());').length === 1 && probe('x', 'A.pruneBudget(state, Date.now(), A.LOAD_RETENTION)').length === 0);
      const sa = read('src/spend-authorizer.js').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/ .*$/, '')).join('\n');
      ok('§5d …and a stamp list is cut only to the retention: every stampCap call outside the prune\'s own body passes LOAD_RETENTION (the default constant aside)', (sa.match(/stampCap\(([^)]*)\)/g) || []).every((c) => /stampCap\((LOAD_RETENTION|limits|null)\)/.test(c)) && (sa.match(/stampCap\(LOAD_RETENTION\)/g) || []).length === 1 && (sa.match(/stampCap\(limits\)/g) || []).length === 2, JSON.stringify(sa.match(/stampCap\(([^)]*)\)/g)));
    }
    // MUST 2 (1): a CARRIED reservation is converted — a return after it returns nothing, across a guard reload too
    {
      const { dataDir, guard } = big();
      guard.note({ reason: 'peer-message', identity: id, reservation: 'qw-r3-c' });
      guard.note({ reason: 'peer-message', identity: id, reservation: 'qw-r3-c', carried: true });
      const before = day(guard);
      const back = guard.release({ reservation: 'qw-r3-c' });
      guard.flush();   // round 4: the guard's own debounce (as durable as any spent turn) — the reload reads what it wrote
      const g2 = guardMod.create({ dataDir, serverSetting: () => undefined, identityOf: () => id, getUserTodos: () => null, log: () => { } });   // a reload from the disk
      g2.note({ reason: 'peer-message', identity: id, reservation: 'qw-r3-c' });
      ok('§5d a carried reservation is CONVERTED: one unit, a return of its id returns nothing, and after a reload a repeated note of that id adds nothing (the converted mark reached the disk)', before === 1 && back === false && day(guard) === 1 && (g2.snapshot().budget.identities['slot-B'] || []).length === 1 && g2.reservationState('qw-r3-c') === 'converted', JSON.stringify({ before, back, after: day(guard), reloaded: (g2.snapshot().budget.identities['slot-B'] || []).length }));
    }
    // ids never repeat across processes (a boot tag per process): two frames are two units
    {
      const d = tmpdir('vs-spend-r3-ids-');
      const q1 = QW.create({ dataDir: d, writer: { dirty() { } } }), q2 = QW.create({ dataDir: d, writer: { dirty() { } } });
      const a = q1.noteWritten('cid-z', { text: 'one' }), b = q2.noteWritten('cid-z', { text: 'two' });
      ok('§5d frame ids never repeat across processes (each boot tags its ids): two frames, two ids — never one stamp for two turns', a.id !== b.id && !/^qw-0-/.test(a.id), JSON.stringify([a.id, b.id]));
    }
    // both bounds REFUSE (by name) — never drop the oldest owed frame
    {
      const q = QW.create({ dataDir: tmpdir('vs-spend-r3-bound-'), writer: { dirty() { } } });
      for (let i = 0; i < QW.PER_CONVERSATION_MAX; i++) q.noteWritten('cid-one', { text: 'n' + i });
      const perConv = q.full('cid-one');
      for (let c = 0; c < QW.MAX_ENTRIES / QW.PER_CONVERSATION_MAX - 1; c++) for (let i = 0; i < QW.PER_CONVERSATION_MAX; i++) q.noteWritten('cid-' + c, { text: 'm' + i });
      const hub = q.full('cid-new');
      ok(`§5d the bounds REFUSE by name — ${QW.PER_CONVERSATION_MAX} frames behind one turn, ${QW.MAX_ENTRIES} live on the hub — and nothing is dropped (${q.count()} held)`, /bound is 50/.test(perConv || '') && /bound is 500/.test(hub || '') && q.count() === QW.MAX_ENTRIES, JSON.stringify({ perConv, hub, n: q.count() }));
    }
    // the refusal names promised turns as promised
    {
      const { guard } = big({ 'spend.unattendedPerIdentityHour': 3 });
      for (let i = 0; i < 3; i++) guard.note({ reason: 'peer-message', identity: id, reservation: 'qw-p' + i });
      const v = guard.authorize({ reason: 'job-notification', identity: id });
      ok('§5d a refusal over reserved turns says them as PROMISED: «spent or promised 3 … 3 of them waiting behind running turns»', !v.ok && /has spent or promised 3 unattended turns this hour, 3 of them waiting behind running turns \(cap 3\)/.test(v.detail || ''), v.detail);
    }
  }
  // ── §5e THE RESERVATION, ROUND 4 (主开发's panel on 6ca9575ee): a prune never forgives (the owner lowers the caps, then raises
  // them); the send road writes like the release; a drain never stamps, a live carry always counts; the converted mark on both
  // lists; the words over promised turns
  {
    const A4 = require(path.join(REPO, 'src/spend-authorizer.js'));
    const ID4 = { key: 'slot-1', name: 'slot one' };
    // MUST 2 — the panel's d3b-lowered, both shapes: 1 500 spent across the day, one queued wake, the owner LOWERS both day caps
    // (500 / 800), Stop hands the frame back (and, the second shape, an attended press while lowered), the caps go back up
    for (const variant of ['Stop only', 'an attended press while lowered']) {
      const dir = tmpdir('vs-spend-r4-d3b-');
      const st4 = { 'spend.unattendedPerIdentityHour': 200, 'spend.unattendedPerIdentityDay': 2000, 'spend.unattendedPerInstanceDay': 2000 };
      const T0 = Date.now(), H = 3600e3;
      // 1 500 spent turns across the day, through the guard's own file (the panel's 1 500 notes, without 1 500 prunes)
      const spent = Array.from({ length: 1500 }, (_, i) => ({ at: T0 - 23 * H + i * 50e3, reason: 'job-notification' }));
      fs.writeFileSync(path.join(dir, 'spend-budget.json'), JSON.stringify({ v: 1, budget: { v: 1, identities: { 'slot-1': spent }, instance: spent, notices: {}, attended: [] } }));
      const g = guardMod.create({ dataDir: dir, serverSetting: (k) => st4[k], identityOf: () => ID4, log: () => { } });
      const v = g.authorize({ reason: 'peer-message', identity: ID4, now: T0 });
      g.note({ reason: 'peer-message', identity: v.identity, hold: v.hold, reservation: 'qw-l-1', now: T0 });
      const c = (now) => g.authorize({ reason: 'auto-resume', identity: ID4, hold: false, now }).counts.day;
      const atSend = c(T0 + 1);
      st4['spend.unattendedPerIdentityDay'] = 500; st4['spend.unattendedPerInstanceDay'] = 800;
      if (variant !== 'Stop only') g.note({ reason: 'owner-channel-send', identity: ID4, now: T0 + 500 });
      const ret = g.release({ reservation: 'qw-l-1', now: T0 + 1000 });
      const lowered = c(T0 + 1100);
      st4['spend.unattendedPerIdentityDay'] = 2000; st4['spend.unattendedPerInstanceDay'] = 2000;
      const raised = c(T0 + 1200);
      ok(`§5e MUST 2 (d3b, ${variant}): 1 500 spent + one reservation, the day caps lowered to 500 / 800, the reservation returned, the caps raised the same day ⇒ the day still reads 1 500 — allowed after the raise ${2000 - raised} = the unpruned ledger's (nothing forgiven; the release, which never returns the unit, says 499)`,
        atSend === 1501 && ret === true && lowered === 1500 && raised === 1500, JSON.stringify({ atSend, ret, lowered, raised, allowedAfterRaise: 2000 - raised }));
    }
    // MODERATE 3 — the panel's d4 burst: 30 queued wakes and their 30 carries write NOTHING inside the calls; the guard's own
    // debounce coalesces them (the release: one write per window)
    {
      const dir = tmpdir('vs-spend-r4-burst-');
      const g = guardMod.create({ dataDir: dir, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 200 })[k], identityOf: () => ID4, log: () => { } });
      const fsm = require('fs'); const origRename = fsm.renameSync, origST = global.setTimeout;
      let writes = 0, armed = 0;
      fsm.renameSync = function (a, b) { if (String(b).endsWith('spend-budget.json')) writes++; return origRename.apply(this, arguments); };
      global.setTimeout = function (fn, ms) { if (ms === 500) armed++; return origST.apply(this, arguments); };
      let inSends = 0, inCarries = 0; const rids = [];
      try {
        for (let i = 0; i < 30; i++) { const v = g.authorize({ reason: 'peer-message', identity: ID4 }); const w0 = writes; g.note({ reason: 'peer-message', identity: v.identity, hold: v.hold, reservation: 'qw-b-' + i }); inSends += writes - w0; rids.push('qw-b-' + i); }
        const armedAfterSends = armed;
        g.flush();
        const afterSends = writes;
        for (const rid of rids) { const w0 = writes; g.note({ reason: 'peer-message', identity: ID4, reservation: rid, carried: true }); inCarries += writes - w0; }
        const armedAfterCarries = armed - armedAfterSends;
        g.flush();
        ok('§5e MODERATE 3 (d4 burst): 30 queued wakes — 0 writes of spend-budget.json inside the send calls, ONE debounce armed (one write, the release\'s count); their 30 carries — 0 writes inside, one debounce; the hour 30',
          inSends === 0 && armedAfterSends === 1 && afterSends === 1 && inCarries === 0 && armedAfterCarries === 1 && writes === 2 && (g.snapshot().budget.identities['slot-1'] || []).length === 30, JSON.stringify({ inSends, armedAfterSends, afterSends, inCarries, armedAfterCarries, writes }));
      } finally { fsm.renameSync = origRename; global.setTimeout = origST; }
      const gsrc = read('src/server/spend-guard.js');
      const noteBody = gsrc.slice(gsrc.indexOf('  function note({'), gsrc.indexOf('  function release({'));
      ok('§5e …the guard\'s note() never writes in the call: no flush() in its body (round 3\'s two synchronous writes per wake are gone)', noteBody.length > 200 && !/\bflush\(\)/.test(noteBody) && /persist\(\);/.test(noteBody));
    }
    // MODERATE 4 — the panel's M7f both ways, and M7g
    {
      const L4 = { perIdentityHour: 200, perIdentityDay: 2000, perInstanceDay: 10000 };
      let st = A4.emptyBudget();
      const live = A4.noteUnattendedSpend(st, { identity: ID4, reason: 'peer-message', rid: 'qw-never', carried: true, limits: L4 });
      const drain = A4.noteUnattendedSpend(st, { identity: ID4, reason: 'peer-message', rid: 'qw-never', carried: true, drain: true, limits: L4 });
      ok('§5e MODERATE 4 (M7f): a LIVE carry of a frame never stamped adds exactly 1 (converted, counted in the window it runs in); a stash DRAIN of the same adds 0 (it rides somebody else\'s turn)',
        (live.state.identities['slot-1'] || []).length === 1 && live.state.identities['slot-1'][0].conv === true && live.state.instance.length === 1 && (drain.state.identities['slot-1'] || []).length === 0 && drain.state.instance.length === 0);
      st = A4.noteUnattendedSpend(st, { identity: ID4, reason: 'peer-message', rid: 'qw-g', limits: L4 }).state;
      // through the DISK, as every boot reads it: in memory the two lists share ONE stamp object (marking one marks both); a
      // reloaded ledger holds two — the mark must reach the instance's copy too (the panel's M7g survived in memory)
      st = JSON.parse(JSON.stringify(st));
      const drained = A4.noteUnattendedSpend(st, { identity: ID4, reason: 'peer-message', rid: 'qw-g', carried: true, drain: true, limits: L4 }).state;
      const conv = A4.noteUnattendedSpend(st, { identity: ID4, reason: 'peer-message', rid: 'qw-g', carried: true, limits: L4 }).state;
      const back = A4.returnReservation(conv, { rid: 'qw-g' });
      ok('§5e (M7g) the converted mark lands on BOTH lists of a RELOADED ledger (the identity\'s and the instance\'s copies): a return after the carry leaves both counts at 1; a drain of a stamp still there converts both too',
        conv.identities['slot-1'][0].conv === true && conv.instance[0].conv === true && back.returned === 0 && back.state.identities['slot-1'].length === 1 && back.state.instance.length === 1 && drained.identities['slot-1'][0].conv === true && drained.instance[0].conv === true);
    }
    // SMALL — a carry with no identity finds its reservation (never left «promised»); the words over promised turns
    {
      const L4 = { perIdentityHour: 3, perIdentityDay: 2000, perInstanceDay: 10000 };
      let st = A4.noteUnattendedSpend(A4.emptyBudget(), { identity: ID4, reason: 'peer-message', rid: 'qw-ni', limits: L4 }).state;
      st = A4.noteUnattendedSpend(st, { identity: null, reason: 'peer-message', rid: 'qw-ni', carried: true, limits: L4 }).state;
      ok('§5e SMALL: a carry with NO identity still converts its reservation (looked for under every identity) — never left «promised»', A4.reservationState(st, 'qw-ni') === 'converted' && A4.spendCounts(st, 'slot-1').promisedDay === 0 && st.identities['slot-1'].length === 1);
      let pr = A4.emptyBudget();
      pr = A4.noteUnattendedSpend(pr, { identity: ID4, reason: 'peer-message', limits: L4 }).state;
      for (let i = 0; i < 2; i++) pr = A4.noteUnattendedSpend(pr, { identity: ID4, reason: 'peer-message', rid: 'qw-pr' + i, limits: L4 }).state;
      const vp = A4.authorizeUnattendedSpend({ state: pr, identity: ID4, reason: 'job-notification', limits: L4 });
      let sp = A4.emptyBudget(); for (let i = 0; i < 3; i++) sp = A4.noteUnattendedSpend(sp, { identity: ID4, reason: 'peer-message', limits: L4 }).state;
      const vs = A4.authorizeUnattendedSpend({ state: sp, identity: ID4, reason: 'job-notification', limits: L4 });
      const tp = vp && A4.refusalText(vp), ts = vs && A4.refusalText(vs);
      const ip = vp && A4.refusalI18n(vp), is = vs && A4.refusalI18n(vs);
      const promisedLine = (r) => (r ? r.detail.filter((d) => d && d.key === 'Of these, {n} are messages waiting behind running turns — counted while they wait, given back only if they are known not to have run.') : []);
      ok('§5e SMALL: «Spent or promised by» over promised stamps (2 of 3 waiting), «Spent by» over spent ones; the For-you notice adds «Of these, 2 are messages waiting behind running turns …» beside its «Spent by» rows',
        !!vp && !vp.ok && /Spent or promised by: /.test(tp) && !!vs && !vs.ok && /Spent by: /.test(ts) && !/promised/.test(ts) && promisedLine(ip).length === 1 && promisedLine(ip)[0].params.n === 2 && promisedLine(is).length === 0, JSON.stringify({ tp, ts, ip: promisedLine(ip) }));
      const dz = read('src/lib/i18n-zh.js'), dj = read('src/lib/i18n-ja.js');
      ok('§5e …and the new line is in both dictionaries', dz.includes('"Of these, {n} are messages waiting behind running turns — counted while they wait, given back only if they are known not to have run.":') && dj.includes('"Of these, {n} are messages waiting behind running turns — counted while they wait, given back only if they are known not to have run.":'));
    }
    // SMALL — the 80 % notice on the carried path: a live carry whose stamp was gone crosses 80 % ⇒ the notice is filed
    {
      const dir = tmpdir('vs-spend-r4-80-');
      const g = guardMod.create({ dataDir: dir, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 5 })[k], identityOf: () => ID4, getUserTodos: () => null, log: () => { } });
      for (let i = 0; i < 3; i++) g.note({ reason: 'peer-message', identity: ID4 });
      const w = g.note({ reason: 'peer-message', identity: ID4, reservation: 'qw-80', carried: true });
      ok('§5e SMALL: the 80 % notice on the CARRIED path — a live carry of a never-stamped frame takes the hour to 4 of 5 and the guard answers the crossing (no early return)', !!w && w.scope === 'hour' && w.used === 4 && w.limit === 5, JSON.stringify(w));
    }
  }
  // ── r2 round 2: A MODE-LESS ANSWER IS NOT AN ANSWER ABOUT OUR FRAME ───────
  // Reproduced: a Stop landing between our write and the wrapper's reply emits
  // `peer_message_result {ok:false, text}` ABOUT AN EARLIER queued item, the
  // settlement shifted our pending entry on it, and the real answer — a
  // `thread/queue/add`, a BILLED turn — then found an empty queue and charged
  // nothing. The rule is the PRODUCER's, so the census below derives it.
  {
    const wrapper = read('data/bin/codex-chat-wrapper.js');
    const emitters = [...wrapper.matchAll(/emitTaskEvent\('peer_message_result', \{([^}]*)\}/g)].map((m) => m[1]);
    ok('§5b the wrapper has all six peer_message_result emitters (an unreadable census makes the next two vacuous)',
      emitters.length === 6, String(emitters.length));
    ok('§5b every ok:TRUE answer carries a `mode` — that is what makes it an answer about the frame we just wrote',
      emitters.filter((e) => /ok: true/.test(e)).length === 3 && emitters.filter((e) => /ok: true/.test(e)).every((e) => /mode: '/.test(e)));
    ok('§5b …and every ok:FALSE answer carries `text` and NO mode — two of the three are about a DIFFERENT, earlier message',
      emitters.filter((e) => /ok: false/.test(e)).length === 3
      && emitters.filter((e) => /ok: false/.test(e)).every((e) => /(?:^|[\s,])text\b/.test(e) && !/mode: '/.test(e)),
      JSON.stringify(emitters.filter((e) => /ok: false/.test(e))));
    const L = mkLadder();
    await L.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    ok('§5b a Stop dropping an EARLIER queued item settles nothing here (it is not about this frame)',
      L.deliver.settleRpcDelivery('cid-1', { ok: false, reason: 'dropped by Stop before it was delivered', text: 'older', mode: null }) === 'not-ours'
      && L.deliver._unsettledCount('cid-1') === 1);
    ok('§5b …so OUR answer still arrives, and a queue-add is charged (PRE-FIX: this stayed at 0 — a billed turn made free)',
      L.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued' }) === 'charged' && L.charged() === 1);
  }
  {   // …and the queue holds EVERY frame, so an earlier answer cannot take a later frame's entry
    const L = mkLadder();
    await L.deliver.deliverToConversation('cid-1', 'typed by a human', { kind: 'peer', spendReason: 'peer-message' });      // queued behind the turn: owed (law 1)
    await L.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });      // predicted free
    ok('§5b both frames are tracked, not only the predicted-free one (law 1 round 2: the peer frame\'s unit reserved at once)', L.deliver._unsettledCount('cid-1') === 2 && L.charged() === 1);
    ok('§5b the FIRST answer belongs to the first frame — «queued»: its reservation stands, no second unit',
      L.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued' }) === 'queued' && L.charged() === 1);
    ok('§5b …and the notification keeps its own answer: steered ⇒ still free',
      L.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'steered' }) === 'free' && L.charged() === 1);
  }
  {   // a STRANDED frame is dropped, never left to absorb a later message's answer
    const L = mkLadder();
    await L.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    // the wrapper died between our write and its reply; the suite winds the
    // clock forward rather than sleeping through the settle window
    ok('§5b a frame stranded past the settle window is dropped, not charged to the next message',
      L.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued', now: Date.now() + 121 * 1000 }) === null && L.charged() === 0);
    const L2 = mkLadder();
    await L2.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    ok('§5b …CONTROL: the same answer INSIDE the window charges it (the drop is the age, not the answer)',
      L2.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued', now: Date.now() + 119 * 1000 }) === 'charged' && L2.charged() === 1);
  }
  // WIRING PIN: the settlement is reachable from the consumer that already
  // reads this record — an unwired settle would make every fallback free.
  {
    const ce = read('src/server/stdout/codex-events.js');
    ok('§5b WIRING: the codex stdout consumer settles on peer_message_result, by PROPERTY ACCESS on the lazy ref',
      /peer_message_result[\s\S]{0,900}deliverRef\?\.settleRpcDelivery\?\.\(/.test(ce));
    ok('§5b …and the ladder gates on the CAPS ROW, never on a backend id',
      /notificationDelivery\(capsOf\(rpc\.s\.backend\)\) === 'steer'/.test(read('src/server/conversation-deliver.js')));
    // lane agy-peer-wake: antigravity rides the SAME rung, answered on the acp journal's `peer_result` — its consumer
    // settles EVERY answer the same way (an unwired twin would leave a predicted-free frame of that road free for ever)
    const ae = read('src/server/stdout/acp-events.js');
    ok('§5b WIRING (lane agy-peer-wake): the acp stdout consumer settles on EVERY peer_result, by PROPERTY ACCESS on the lazy ref',
      /msg\.kind === 'peer_result'\) \{[\s\S]{0,4000}?deliverRef\?\.settleRpcDelivery\?\.\(cid, \{ ok: msg\.ok !== false, mode: msg\.mode \|\| null \}\)/.test(ae));
    ok("§5b …and a harness whose 'steer' is a stop + a new turn (antigravity: steerJoinsTurn:false) is never on the predicted-free lane",
      notificationDelivery(capsOf('antigravity')) === 'queue' && capsOf('antigravity').peerDelivery === 'rpc-queue');
  }
}


// ── §5c THE CHARGE NAMES THE SLOT THE AUTHORIZATION MEASURED (r4) ───────────
// REPRODUCED before it was fixed. The ladder authorized against one credential
// slot and DEBITED a different one, because it threw the verdict's resolved
// identity away and handed `note()` a bare session to resolve a SECOND time:
//
//   const identity = session ? null : {...};                 // null on the local-session branch
//   charged = { reason: spendReason, session, identity };    // ⇒ note() re-resolves
//
// The rpc rung makes the window wide ON PURPOSE — the charge is DEFERRED to
// `settleRpcDelivery`, up to SETTLE_TTL_MS (120 s) later — and a codex
// session's slot follows the pool DEFAULT (the engine's per-session pass skips
// codex outright), which `maybePoolAutoSwitchForPool` re-decides on its own
// 30 s timer. So the answer to "who pays" is free to move between our frame and
// the wrapper's verdict, and it moved every time the pool did.
//
// The damage runs BOTH ways, which is why one ledger assertion is not enough:
// the AUTHORIZED account is debited nothing, so its ceiling never binds and it
// can be spent past indefinitely; and an account nobody asked is debited, so it
// starts refusing its own legitimate unattended turns.
// ── §5f B-0a33 (主开发 2026-11-13; the readers' money drives on 2.369.398): A RESERVATION IS COUNTED WHERE ITS TURN RUNS ──
// The ceiling was passed by queueing: a queued frame's unit sat in the windows of its SEND, so a long-held turn's queue ran
// later inside windows that had already spent their cap (10 billed unattended turns in one hour at a cap of 5; round 1: the
// same in a day). LAW: no window — no hour, no day — holds more billed unattended turns than its cap, whenever the turn a
// reservation pays for runs: a WAITING one counts in every window it may run in, a carried one where it ran, a given-up one
// where the hub stopped waiting; a waiting stamp nobody holds is let go, said truly; «given back once» unchanged.
console.log('\n§5f B-0a33: a reservation is counted where its turn runs — every window (hour, day) it waits through; the refusal says what waits and where');
{
  const QWf = require(path.join(REPO, 'src/server/queued-wakes.js'));
  const J = JSON.stringify;
  const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const ID = { key: 'slot-F', name: 'F' };
  const world = (hourCap, dayCap = 200, { files = {}, ut = null, log = () => { }, mod = guardMod } = {}) => {
    let vclock = 1_800_000_000_000; const dataDir = tmpdir('vs-spend-b0a33-');
    const settings = { 'spend.unattendedPerIdentityHour': hourCap, 'spend.unattendedPerIdentityDay': dayCap, 'spend.unattendedPerInstanceDay': 10000 };
    const g = mod.create({ dataDir, serverSetting: (k) => settings[k], identityOf: () => ID, getUserTodos: () => ut, log });
    const mkQ = (readFile = (fl) => { if (!(fl in files)) throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }); return files[fl]; }) => QWf.create({ dataDir, now: () => vclock, writer: { dirty: (file, o) => { files[file] = o.produce(); } }, readFile,
      noteSpend: (rec) => g.note({ ...rec, now: vclock }), releaseSpend: (rec) => g.release({ ...rec, now: vclock }), reservationState: (rid) => g.reservationState(rid), waitingReservations: () => g.waitingReservations(), stashHas: () => false, log: () => { } });
    const W = { g, files, clock: () => vclock, adv: (ms) => { vclock += ms; }, q: null, mkQ,
      send: (cid, text, behind = null) => { const v = g.authorize({ reason: 'peer-message', identity: ID, cid, now: vclock }); if (!v.ok) return null; return W.q.noteWritten(cid, { charged: { reason: 'peer-message', identity: ID, hold: v.hold }, text, holder: 4242, ...(behind ? { waitKey: behind.key, peerName: behind.name } : {}) }); },
      spend: () => { const v = g.authorize({ reason: 'peer-message', identity: ID, now: vclock }); if (v.ok) g.note({ reason: 'peer-message', identity: ID, hold: v.hold, now: vclock }); return v; },
      counts: () => g.authorize({ reason: 'peer-message', identity: ID, hold: false, now: vclock }).counts };
    W.q = mkQ();
    return W;
  };
  // (1) THE READER'S SCENE, through the REAL guard and the REAL queued-wakes on one clock (int359/acc-399/l23b/drivers/d2-money.cjs F2)
  {
    const W = world(5); const ids = [];
    for (let i = 0; i < 5; i++) { const e = W.send('c-f2', 'm' + i); ids.push(e.id); W.q.answer(e.id, { mode: 'queued' }); W.q.noteQueue('c-f2', ids.map((_, j) => ({ id: 'it-' + j })), 4242, { fresh: true }); }
    W.adv(3 * HOUR); let spent = 0, refused = null;
    for (let i = 0; i < 5; i++) { const v = W.spend(); if (v.ok) spent++; else refused = refused || v; }
    const runs = [];
    for (let i = 0; i < 5; i++) { W.adv(2 * MIN); W.q.noteTurnEnded('c-f2'); W.q.noteTurnStarted('c-f2'); W.q.noteQueue('c-f2', ids.slice(i + 1).map((_, j) => ({ id: 'it-' + (i + 1 + j) })), 4242, { fresh: true }); runs.push(W.g.reservationState(ids[i])); }
    const c = W.counts();
    ok('§5f F2 (the reader\'s scene, real guard + queued-wakes): cap 5/h, 5 frames queued behind a hung turn; 3 h later NO unattended turn is spent — the 5 still waiting hold this hour («spent or promised 5 …, 5 of them waiting behind running turns»); the turn ends and its 5 run ⇒ the hour holds 5, never 10 (the release: 5 spent, then 10)',
      spent === 0 && !!refused && refused.why === 'hour-cap' && /spent or promised 5 unattended turns this hour, 5 of them waiting behind running turns/.test(refused.detail) && J(runs) === J(['converted', 'converted', 'converted', 'converted', 'converted']) && c.hour === 5 && c.day === 5,
      J({ spent, detail: refused && refused.detail, runs, hour: c.hour, day: c.day }));
  }
  // (2) THE LAW as a property: seeded timelines on the PURE authorizer — frames queued behind running turns, unattended turns now,
  //     queues that run, Stops that hand back, the hub giving up unknown (that frame may have run at ANY moment it waited), hangs of
  //     a day and more. Every billed turn is placed where it ran; no hour window holds more than the hour cap and no rolling 24 h
  //     more than the day cap (the reader's d7 oracle: every sliding window, as spendCounts defines it).
  const law = (Am, seed, { hourCap = 4, dayCap = 14, days = 4 } = {}) => {
    let st = Am.emptyBudget(), vclock = 1_800_000_000_000, r = seed >>> 0;
    const rnd = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
    const L = { perIdentityHour: hourCap, perIdentityDay: dayCap, perInstanceDay: 10000, noticePct: 0 };
    const waiting = [], runs = []; let n = 0;
    const verdict = () => Am.authorizeUnattendedSpend({ reason: 'peer-message', identity: ID, state: st, limits: L, now: vclock });
    const end = vclock + days * DAY;
    while (vclock < end) {
      vclock += rnd() < 0.02 ? Math.floor((20 + rnd() * 10) * HOUR) : Math.floor(rnd() * 40 * MIN) + MIN;
      const v = verdict();
      const x = rnd();
      if (x < 0.30) { if (v.ok) { const u = { rid: 'r' + (++n), at: vclock }; st = Am.noteUnattendedSpend(st, { identity: ID, at: vclock, limits: L, reason: 'peer-message', rid: u.rid }).state; waiting.push(u); } }
      else if (x < 0.48) { if (v.ok) { st = Am.noteUnattendedSpend(st, { identity: ID, at: vclock, limits: L, reason: 'peer-message' }).state; runs.push(vclock); } }
      else if (x < 0.68) { for (const u of waiting.splice(0, Math.floor(rnd() * 3))) { st = Am.noteUnattendedSpend(st, { identity: ID, at: vclock, limits: L, reason: 'peer-message', rid: u.rid, carried: true }).state; runs.push(vclock); } }
      else if (x < 0.78) { const u = waiting.shift(); if (u) st = Am.returnReservation(st, { rid: u.rid, now: vclock }).state; }
      else if (x < 0.86) { const u = waiting.shift(); if (u) { st = Am.noteUnattendedSpend(st, { identity: ID, at: vclock, limits: L, reason: 'peer-message', rid: u.rid, ended: true }).state; runs.push(u.at + Math.floor(rnd() * (vclock - u.at + 1))); } }
    }
    runs.sort((a, b) => a - b);
    const worstIn = (ms) => { let w = 0; for (let i = 0, j = 0; i < runs.length; i++) { while (runs[j] <= runs[i] - ms) j++; w = Math.max(w, i - j + 1); } return w; };
    return { hour: worstIn(HOUR), day: worstIn(DAY), runs: runs.length };
  };
  const SEEDS = Array.from({ length: 40 }, (_, i) => 7919 * (i + 1));
  const tip = SEEDS.map((sd) => law(A, sd));
  ok('§5f THE LAW over 40 seeded timelines (4 days each, cap 4/h and 14/24 h, hangs of 20–30 h): no hour window and no rolling 24 h holds more billed unattended turns than its cap, wherever each queued frame ran',
    tip.every((x) => x.hour <= 4 && x.day <= 14) && tip.reduce((a, x) => a + x.runs, 0) > 1000 && tip.some((x) => x.hour === 4) && tip.some((x) => x.day === 14),
    J({ hour: Math.max(...tip.map((x) => x.hour)), day: Math.max(...tip.map((x) => x.day)), runs: tip.reduce((a, x) => a + x.runs, 0) }));
  // (3) the unit legs, on the pure authorizer
  const L5 = { perIdentityHour: 5, perIdentityDay: 200, perInstanceDay: 10000, noticePct: 0 };
  const cnt = (Am, st, vclock, L = L5) => Am.authorizeUnattendedSpend({ reason: 'peer-message', identity: ID, state: st, limits: L, now: vclock });
  const leg = (Am) => {
    const base0 = 1_800_000_000_000, o = {};
    // 1b — THE READER'S DAY SCENE (d8 ①b): day cap 5, five frames queue at 0 h and run at 20 h; at 24 h 01 the day still holds them
    const LD = { perIdentityHour: 200, perIdentityDay: 5, perInstanceDay: 10000, noticePct: 0 };
    let d1 = Am.emptyBudget(); for (let i = 0; i < 5; i++) d1 = Am.noteUnattendedSpend(d1, { identity: ID, at: base0 + i, limits: LD, reason: 'peer-message', rid: 'd1-' + i }).state;
    for (let i = 0; i < 5; i++) d1 = Am.noteUnattendedSpend(d1, { identity: ID, at: base0 + 20 * HOUR, limits: LD, reason: 'peer-message', rid: 'd1-' + i, carried: true }).state;
    o.dayAt2401 = cnt(Am, d1, base0 + 24 * HOUR + MIN, LD).ok; o.dayAt4401 = cnt(Am, d1, base0 + 44 * HOUR + MIN, LD).ok;
    // a: sent at t0, carried at t0+2h — counted where it RAN (the hour and the day)
    let a = Am.noteUnattendedSpend(Am.emptyBudget(), { identity: ID, at: base0, limits: L5, reason: 'peer-message', rid: 'a' }).state;
    o.aWait = cnt(Am, a, base0 + 90 * MIN).counts.hour;
    a = Am.noteUnattendedSpend(a, { identity: ID, at: base0 + 2 * HOUR, limits: L5, reason: 'peer-message', rid: 'a', carried: true }).state;
    o.aRan = cnt(Am, a, base0 + 2 * HOUR + 10 * MIN).counts.hour; o.aGone = cnt(Am, a, base0 + 3 * HOUR + 5 * MIN).counts.hour;
    o.aDay = [cnt(Am, a, base0 + 25 * HOUR).counts.day, cnt(Am, a, base0 + 26 * HOUR + 5 * MIN).counts.day];
    // b: still waiting 30 h later — in this hour AND this day; carried then — the hour and the day it ran; never carried —
    //    the 7-day bound read INSIDE the count (no prune ran)
    let b = Am.noteUnattendedSpend(Am.emptyBudget(), { identity: ID, at: base0, limits: L5, reason: 'peer-message', rid: 'b' }).state;
    const b30 = cnt(Am, b, base0 + 30 * HOUR).counts; o.b30 = [b30.hour, b30.day, Am.reservationState(b, 'b')];
    const bc = Am.noteUnattendedSpend(b, { identity: ID, at: base0 + 30 * HOUR, limits: L5, reason: 'peer-message', rid: 'b', carried: true }).state;
    const bcc = cnt(Am, bc, base0 + 30 * HOUR + MIN).counts; o.bRan = [bcc.hour, bcc.day];
    const b7 = Am.noteUnattendedSpend(Am.emptyBudget(), { identity: ID, at: base0, limits: L5, reason: 'peer-message', rid: 'b7' }).state;   // its own stamp (a carry converts a stamp IN PLACE)
    const b8 = cnt(Am, b7, base0 + 7 * DAY + HOUR).counts; o.b8d = [b8.hour, b8.day, b8.promisedHour];
    // c: the hub gave up at t0+2h, not knowing whether it ran — counted where it stopped waiting (that hour, that day); nothing returned by it
    let c = Am.noteUnattendedSpend(Am.emptyBudget(), { identity: ID, at: base0, limits: L5, reason: 'peer-message', rid: 'c' }).state;
    c = Am.noteUnattendedSpend(c, { identity: ID, at: base0 + 2 * HOUR, limits: L5, reason: 'peer-message', rid: 'c', ended: true }).state;
    o.cEnd = [cnt(Am, c, base0 + 2 * HOUR + MIN).counts.hour, cnt(Am, c, base0 + 3 * HOUR + 2 * MIN).counts.hour, cnt(Am, c, base0 + 25 * HOUR).counts.day, cnt(Am, c, base0 + 26 * HOUR + 5 * MIN).counts.day, Am.reservationState(c, 'c')];
    // d: an hour full of WAITING reservations promises no instant; with one spent turn among them, that turn's edge
    let d = Am.emptyBudget(); for (let i = 0; i < 5; i++) d = Am.noteUnattendedSpend(d, { identity: ID, at: base0 + i * MIN, limits: L5, reason: 'peer-message', rid: 'd' + i }).state;
    o.dAll = cnt(Am, d, base0 + 2 * HOUR).retryAfter;
    let d2 = Am.emptyBudget(); for (let i = 0; i < 4; i++) d2 = Am.noteUnattendedSpend(d2, { identity: ID, at: base0 + i * MIN, limits: L5, reason: 'peer-message', rid: 'e' + i }).state;
    d2 = Am.noteUnattendedSpend(d2, { identity: ID, at: base0 + 30 * MIN, limits: L5, reason: 'peer-message' }).state;
    o.dOne = cnt(Am, d2, base0 + 40 * MIN).retryAfter - (base0 + 30 * MIN + HOUR);
    // e (the reader's M10): a STASH DRAIN of a waiting stamp — the turn it rode ran at the drain: counted there, hour and day
    let e = Am.noteUnattendedSpend(Am.emptyBudget(), { identity: ID, at: base0, limits: L5, reason: 'peer-message', rid: 'e' }).state;
    e = Am.noteUnattendedSpend(e, { identity: ID, at: base0 + 30 * HOUR, limits: L5, reason: 'peer-message', rid: 'e', carried: true, drain: true }).state;
    const ec = cnt(Am, e, base0 + 30 * HOUR + MIN).counts; o.eDrain = [ec.hour, ec.day];
    // f (the reader's M11, looser): cap 1/h — a frame sent at 0 h runs at 23 h 30; another account's note at 24 h 05 prunes the
    //    ledger; a second turn of the first account at 24 h 10 is refused (the run is 40 minutes old)
    const L1 = { perIdentityHour: 1, perIdentityDay: 200, perInstanceDay: 10000, noticePct: 0 };
    let f = Am.noteUnattendedSpend(Am.emptyBudget(), { identity: ID, at: base0, limits: L1, reason: 'peer-message', rid: 'f' }).state;
    f = Am.noteUnattendedSpend(f, { identity: ID, at: base0 + 23 * HOUR + 30 * MIN, limits: L1, reason: 'peer-message', rid: 'f', carried: true }).state;
    f = Am.noteUnattendedSpend(f, { identity: { key: 'slot-G', name: 'G' }, at: base0 + 24 * HOUR + 5 * MIN, limits: L1, reason: 'peer-message' }).state;
    o.fM11 = cnt(Am, f, base0 + 24 * HOUR + 10 * MIN, L1).ok;
    return o;
  };
  const u = leg(A);
  ok('§5f THE DAY SAYS WHAT THE HOUR SAYS (the reader\'s d8 ①b): day cap 5, five frames queue at 0 h and run at 20 h — at 24 h 01 the day still holds them (refused; the release: free, ten in (20 h, 44 h]); at 44 h 01 it is free',
    u.dayAt2401 === false && u.dayAt4401 === true, J(u));
  ok('§5f a reservation sent at t0 and carried at t0+2h is counted where it RAN: the hour (1 at +2h10, 0 at +3h05) and the day (1 at +25h, 0 at +26h05); while it waited it held every hour (1 at +1h30)',
    u.aWait === 1 && u.aRan === 1 && u.aGone === 0 && J(u.aDay) === J([1, 0]), J(u));
  ok('§5f a frame still waiting 30 h after its send holds THIS hour AND this day (1, 1), still «reserved»; carried then, the hour and the day it ran (1, 1); never carried, the 7-day bound is read INSIDE the count — at 7 d + 1 h it holds no window and is no longer said to wait, with no prune run',
    J(u.b30) === J([1, 1, 'reserved']) && J(u.bRan) === J([1, 1]) && J(u.b8d) === J([0, 0, 0]), J(u));
  ok('§5f the hub gives up a waiting frame unknown: counted where it stopped waiting — that hour (1, then 0 at +3h02) and that day (1 at +25h, 0 at +26h05); still a unit, never returned by it',
    J(u.cEnd) === J([1, 0, 1, 0, 'reserved']), J(u));
  ok('§5f an hour full of WAITING reservations promises no instant (retryAfter 0 — they free a slot when they run or are given back); with one spent turn among them, the edge of THAT turn',
    u.dAll === 0 && u.dOne === 0, J(u));
  ok('§5f a STASH DRAIN of a waiting stamp is counted where the turn it rode ran — the hour and the day of the drain (1, 1)', J(u.eDrain) === J([1, 1]), J(u));
  ok('§5f a carry 23 h 30 after its send stays in its hour though another account\'s note prunes the ledger at 24 h 05: a second turn at 24 h 10 is refused at cap 1 (the prune keeps a stamp a day past its LAST instant)', u.fM11 === false, J(u));
  ok('§5f the waiting bound IS queued-wakes\' own: RESERVATION_WAIT_MAX_MS = LIVE_MAX_AGE_MS = 7 days',
    A.RESERVATION_WAIT_MAX_MS === 7 * DAY && /const LIVE_MAX_AGE_MS = 7 \* 24 \* 3600 \* 1000;/.test(read('src/server/queued-wakes.js')));
  // (4) queued-wakes settles where the hub stops waiting — through the REAL guard
  {
    const W = world(30); const e1 = W.send('c-ar', 'x'); W.q.answer(e1.id, { mode: 'queued' }); W.adv(2 * HOUR);
    W.q.dropConversation('c-ar', 'archived');
    const now1 = W.counts().hour; W.adv(HOUR + MIN); const later1 = W.counts().hour;
    const W2 = world(30); const e2 = W2.send('c-gone', 'y'); W2.q.answer(e2.id, { mode: 'queued' }); W2.adv(2 * HOUR);
    W2.q.handBackGone('c-gone', () => { }, 'its process is gone');
    const now2 = W2.counts().hour; W2.adv(HOUR + MIN); const later2 = W2.counts().hour;
    ok('§5f queued-wakes settles a frame it stops waiting for unknown — archived (1 → 0 an hour later), its process gone (1 → 0): the unit counted where the hub stopped, never a slot held for ever, never returned',
      now1 === 1 && later1 === 0 && now2 === 1 && later2 === 0 && W.g.reservationState(e1.id) === 'reserved' && W2.g.reservationState(e2.id) === 'reserved', J({ now1, later1, now2, later2 }));
  }
  // (5) A WAITING STAMP NOBODY HOLDS IS LET GO, AND SAID TRULY (MUST 2): at load and at each sweep
  {
    // the update reads a ledger whose 5 waiting stamps no queued entry holds (a release's unknown hand-backs; msg-queued.json lost)
    const W = world(5); W.q = null;
    for (let i = 0; i < 5; i++) W.g.note({ reason: 'peer-message', identity: ID, reservation: 'orphan-' + i, now: W.clock() });
    const before = W.counts();
    W.q = W.mkQ();   // the ladder loads: nothing on disk holds them
    const atLoad = W.counts(); W.adv(HOUR + MIN); const later = W.counts(); const v = W.spend();
    ok('§5f at LOAD: five waiting stamps no queued entry holds end as «given up» at once — counted in that hour only (5, then 0), no longer said to wait (promised 5 → 0), and the next unattended turn is allowed (the reader\'s d8 ⑥: refused for a week, «5 of them waiting» when nothing waits)',
      before.promisedHour === 5 && atLoad.hour === 5 && atLoad.promisedHour === 0 && later.hour === 0 && v.ok === true && ['orphan-0', 'orphan-4'].every((r) => W.g.reservationState(r) === 'reserved'), J({ before, atLoad, later, ok: v.ok }));
    // a live entry keeps its stamp waiting; a crash lost the entry after a carry (the store's write landed, the guard's did not) ⇒ the next sweep lets it go
    const W2 = world(30); const k = W2.send('c-held', 'z'); W2.q.answer(k.id, { mode: 'queued' });
    W2.q = W2.mkQ();   // a restart with its entry on disk: still held
    const held = W2.counts().promisedHour;
    W2.g.note({ reason: 'peer-message', identity: ID, reservation: 'crash-1', now: W2.clock() });   // a stamp whose entry is gone
    W2.q.ageOut();   // the sweep
    {
      const W3 = world(5); W3.q = null;
      for (let i = 0; i < 5; i++) W3.g.note({ reason: 'peer-message', identity: ID, reservation: 'unread-' + i, now: W3.clock() });
      W3.q = W3.mkQ(() => { throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); });   // the file is there and cannot be read
      W3.q.ageOut();
      const eio = W3.counts().promisedHour;
      const W4 = world(5); W4.q = null;
      for (let i = 0; i < 5; i++) W4.g.note({ reason: 'peer-message', identity: ID, reservation: 'bad-' + i, now: W4.clock() });
      W4.q = W4.mkQ(() => '{ "v": 2, "entries": [');   // torn on disk: unparsable
      const torn = W4.counts().promisedHour;
      // THE KEY IS THE PLACE (主开发 08:53Z): eight frames behind one conversation, one carried each hour, a refusal every ten
    // minutes ⇒ notices only at 0 h and after 6 h — never one per carried frame, never two open; a second conversation's wait
    // then gets its own at once
    {
      const notes = [];
      let clockOf5 = () => 0;
      const W5 = world(2, 200, { ut: { add: (key, it) => { if (it && it.i18n) notes.push({ key, filed: clockOf5(), exp: it.expiresAt }); return { id: 'p' + notes.length }; } } }); clockOf5 = W5.clock;
      const base0 = W5.clock(), A2 = { key: 'antigravity:cid-a', name: 'a-chat' }, B2 = { key: 'codex:cid-b', name: 'b-chat' };
      for (let i = 0; i < 8; i++) W5.g.note({ reason: 'peer-message', identity: ID, reservation: 'pa' + i, behind: A2, now: base0 });
      for (let m = 0; m < 480; m += 10) {
        if (m > 0 && m % 60 === 0) W5.g.note({ reason: 'peer-message', identity: ID, reservation: 'pa' + (m / 60 - 1), carried: true, now: W5.clock() });   // one frame carried each hour
        W5.g.authorize({ reason: 'job-notification', identity: ID, now: W5.clock() }); W5.adv(10 * MIN);
      }
      W5.g.note({ reason: 'peer-message', identity: ID, reservation: 'pa7', carried: true, now: W5.clock() });
      for (let i = 0; i < 2; i++) W5.g.note({ reason: 'peer-message', identity: ID, reservation: 'pb' + i, behind: B2, now: W5.clock() });
      W5.g.authorize({ reason: 'job-notification', identity: ID, now: W5.clock() });
      const row = notes.map((x) => [x.key, Math.round((x.filed - base0) / MIN)]);
      const twoOpen = notes.some((x, k) => notes.some((y, j) => j < k && y.key === x.key && x.filed < y.exp));
      ok('§5f THE KEY IS THE PLACE: eight frames behind one conversation, one carried each hour, a refusal every ten minutes ⇒ its notices at 0 h and 6 h 10 only — never one per carried frame, never two open for it; a second conversation\'s wait gets its own at once',
        J(row) === J([['antigravity:cid-a', 0], ['antigravity:cid-a', 370], ['codex:cid-b', 480]]) && !twoOpen, J({ row, twoOpen }));
    }
    ok('§5f an UNREADABLE msg-queued.json is not an empty one: a read error (EIO) or a torn file at load ⇒ the reconcile holds off (at load and at the sweep) — the five waiting stamps stand, counted, never freed by a read that failed', eio === 5 && torn === 5, J({ eio, torn }));
    }
    ok('§5f at each SWEEP: a stamp its live entry holds stays waiting (1 after a restart); one no entry holds (a crash between a carry and the guard\'s write) is given up at the sweep', held === 1 && W2.counts().promisedHour === 1 && W2.g.reservationState(k.id) === 'reserved', J({ held, after: W2.counts() }));
  }
  // (6) THE REFUSAL SAYS WHAT WAITS AND WHERE (MUST 3): the conversations named (at most three, then «and N more»), the door
  //     opens the first — the notice filed under its key — ONE notice per wait
  {
    const adds = [];
    const ut = { add: (key, it) => { if (it && it.i18n) adds.push({ key, it }); return { id: 'n' + adds.length }; } };   // the REFUSAL notices (the 80 % line carries no i18n)
    const W = world(4, 200, { ut });
    const convs = [['antigravity:cid-1', 'alpha-chat'], ['codex:cid-2', 'beta-chat'], ['antigravity:cid-3', 'gamma-chat'], ['opencode:cid-4', 'delta-chat']];
    for (const [key, name] of convs) { const e = W.send(key.split(':')[1], 'x', { key, name }); W.q.answer(e.id, { mode: 'queued' }); }
    W.adv(MIN); const v = W.g.authorize({ reason: 'job-notification', identity: ID, now: W.clock() });
    const first = adds.length;
    const n = adds[0] && adds[0].it;
    const words = n && n.i18n ? n.i18n.detail.map((d) => d.key) : [];
    const behindLine = n && n.i18n ? n.i18n.detail.find((d) => d.key === 'They wait behind {names} and {n} more conversations.') : null;
    ok('§5f the refusal held by waiting frames NAMES where they wait — «alpha-chat», «beta-chat», «gamma-chat» and 1 more — in the English line and the For-you notice, and its door opens that conversation (filed under its key), never only Settings → Spending',
      !v.ok && v.why === 'hour-cap' && first === 1 && adds[0].key === 'antigravity:cid-1' && n.sessionName === 'Spending' && /They wait behind «alpha-chat», «beta-chat», «gamma-chat» and 1 more conversations\./.test(n.text)
        && !!behindLine && behindLine.params.names === '«alpha-chat», «beta-chat», «gamma-chat»' && behindLine.params.n === 1 && words.includes('Open the conversation they wait behind: they run when its turn ends, or when you stop that turn there. Raising the limits in Settings → Spending would let more turns run meanwhile.') && n.i18n.door === 'waiting',
      J({ first, key: adds[0] && adds[0].key, text: n && n.text, words }));
    // THE SEAM WITH LAWS 2 + 3 (shape C, 主开发 15:30Z item 8): while a «messages waiting» item stands for the conversation the
    // frames wait behind, IT speaks — the spending notice is not filed; once that item is gone, the notice is filed as before
    {
      const adds2 = [], standing = [{ id: 'mw1', sessionKey: 'antigravity:cid-1', itemKey: 'messages-waiting:cid-1:1', status: 'open' }];
      const ut2 = { add: (key, it) => { if (it && it.i18n) adds2.push({ key, it }); return { id: 'n' + adds2.length }; }, snapshot: () => ({ open: standing.slice(), resolved: [] }) };
      const W2 = world(4, 200, { ut: ut2 });
      for (const [key, name] of convs) { const e = W2.send(key.split(':')[1], 'x', { key, name }); W2.q.answer(e.id, { mode: 'queued' }); }
      W2.adv(MIN); const v1 = W2.g.authorize({ reason: 'job-notification', identity: ID, now: W2.clock() });
      const held = adds2.length;
      standing.length = 0;
      W2.adv(MIN); const v2 = W2.g.authorize({ reason: 'job-notification', identity: ID, now: W2.clock() });
      ok('§5f THE SEAM WITH SHAPE C: while a «messages waiting» item stands for the conversation the frames wait behind, the refusal files NO spending notice for it (that item speaks for the turn); once it is gone, the notice is filed under its key',
        !v1.ok && held === 0 && !v2.ok && adds2.length === 1 && adds2[0].key === 'antigravity:cid-1', J({ held, after: adds2.map((x) => x.key) }));
    }
    // ITS JOURNAL LINE KEEPS THE NOTICE'S CADENCE (主开发 17:45Z): a refusal every ten minutes for twelve hours while the item
    // stands ⇒ ONE line per six hours (its own stamp), 0 notices; the item gone ⇒ the notice is filed AT ONCE (the held line
    // never moved the notice's own stamp)
    {
      const adds3 = [], lines = [], standing = [{ id: 'mw1', sessionKey: 'antigravity:cid-1', itemKey: 'messages-waiting:cid-1:1', status: 'open' }];
      const ut3 = { add: (key, it) => { if (it && it.i18n) adds3.push({ key, it }); return { id: 'n' + adds3.length }; }, snapshot: () => ({ open: standing.slice(), resolved: [] }) };
      const W3 = world(4, 200, { ut: ut3, log: (l) => { if (/is not filed — its «messages waiting» item stands/.test(l)) lines.push({ l, at: W3.clock() }); } });
      for (const [key, name] of convs) { const e = W3.send(key.split(':')[1], 'x', { key, name }); W3.q.answer(e.id, { mode: 'queued' }); }
      const base3 = W3.clock(); let refused = 0;
      for (let k = 0; k < 36; k++) { W3.adv(10 * MIN); if (!W3.g.authorize({ reason: 'job-notification', identity: ID, now: W3.clock() }).ok) refused++; }
      const inWindow = lines.length, noticesHeld = adds3.length;
      for (let k = 0; k < 36; k++) { W3.adv(10 * MIN); if (!W3.g.authorize({ reason: 'job-notification', identity: ID, now: W3.clock() }).ok) refused++; }
      const at = lines.map((x) => Math.round((x.at - base3) / MIN));
      standing.length = 0;
      W3.adv(MIN); const v3 = W3.g.authorize({ reason: 'job-notification', identity: ID, now: W3.clock() });
      ok('§5f THE SEAM\'S JOURNAL LINE KEEPS THE NOTICE\'S CADENCE: 36 refusals in six hours while the item stands ⇒ ONE line, 0 notices; 72 in twelve hours ⇒ two lines (at 10 min and 6 h 20), never one per refusal; the item gone ⇒ the notice is filed at once under its key',
        refused === 72 && inWindow === 1 && noticesHeld === 0 && J(at) === J([10, 380]) && lines.every((x) => /the spending notice at antigravity:cid-1 is not filed/.test(x.l)) && !v3.ok && adds3.length === 1 && adds3[0].key === 'antigravity:cid-1' && lines.length === 2,
        J({ refused, inWindow, noticesHeld, at, after: adds3.map((x) => x.key) }));
    }
    // B-44f3 (its remainder, round wf_98627db5-966): THE SEAM AT FOR YOU'S READ — a refusal while For you is HELD owes its notice; at
    // the read the seam is judged again over the READ list: the «messages waiting» item standing there speaks (no spending notice,
    // the journal line said at the read)
    {
      const heldSeam = (mod) => {
        let held = true; const waiters = [], adds4 = [], lines4 = [], standing = [];
        const ut4 = { add: (key, it) => { if (held) throw Object.assign(new Error('For you is held unread'), { code: 'todos-unread' }); if (it && it.i18n) adds4.push({ key, it }); return { id: 'n' + adds4.length }; },
          snapshot: () => ({ open: held ? [] : standing.slice(), resolved: [] }), isHeldUnread: () => held, whenRead: (fn) => { if (!held) { fn(); return true; } waiters.push(fn); return false; } };
        const W4 = world(4, 200, { ut: ut4, log: (l) => lines4.push(String(l)), mod });
        for (const [key, name] of convs) { const e = W4.send(key.split(':')[1], 'x', { key, name }); W4.q.answer(e.id, { mode: 'queued' }); }
        W4.adv(MIN); const v = W4.g.authorize({ reason: 'job-notification', identity: ID, now: W4.clock() });
        const owed = waiters.length;
        standing.push({ id: 'mw1', sessionKey: 'antigravity:cid-1', itemKey: 'messages-waiting:cid-1:1', status: 'open' });   // the READ list holds the waiting item
        held = false;
        const realNow = Date.now; Date.now = () => W4.clock();   // the read on the world's OWN clock (its notice's expiry is the world's; the real clock would pass it one day)
        try { for (const fn of waiters.splice(0)) fn(); } finally { Date.now = realNow; }
        return { refused: !v.ok && v.why, owed, filed: adds4.map((x) => x.key), said: lines4.filter((l) => /at For you's read: the spending notice at antigravity:cid-1 is not filed/.test(l)) };
      };
      const hs = heldSeam(guardMod);
      ok('§5f B-44f3 THE SEAM AT FOR YOU\'S READ: a refusal while For you is held owes its notice; at the read the «messages waiting» item standing in the READ list speaks — no spending notice filed, the journal line said (printed)',
        hs.refused === 'hour-cap' && hs.owed === 1 && hs.filed.length === 0 && hs.said.length === 1, J(hs));
      const { anchored } = await import('./scratch.mjs');   // the suite's own copy (imported once above — the cached module)
      let seamCut = null; try { seamCut = require(MUT.write('src/server/spend-guard.js', anchored(read('src/server/spend-guard.js'), '      if (o.waitKey && waitItemOpen(o.waitKey)) {', '      if (false) {', 'B-44f3: the seam not judged at the read'))); } catch (e) { seamCut = { err: e.message }; }
      const hx = seamCut && !seamCut.err ? heldSeam(seamCut) : seamCut;
      ok('§5f CONTROL (the seam not judged again at the read): the spending notice is filed beside the «messages waiting» item — two owner items for one stuck turn', !!hx && !hx.err && hx.filed.length === 1 && hx.filed[0] === 'antigravity:cid-1', J(hx));
    }
    // THE NOTICE DOES NOT GO SILENT WHILE THE WAIT STILL REFUSES (主开发 08:35Z): a 13-hour wait, a refusal every 61 minutes ⇒
    // notices at 0 h, after 6 h, after 12 h — and at no instant two open (each expires at its own 6-hour mark)
    {
      const notes = [];
      const ut2 = { add: (key, it) => { if (it && it.i18n) notes.push({ key, filed: clockOf2(), exp: it.expiresAt }); return { id: 'm' + notes.length }; } };
      let clockOf2 = () => 0;
      const W2 = world(1, 200, { ut: ut2 }); clockOf2 = W2.clock;
      const e = W2.send('cid-9', 'x', { key: 'antigravity:cid-9', name: 'one-chat' }); W2.q.answer(e.id, { mode: 'queued' });
      const base0 = W2.clock();
      for (let k = 0; k * 61 * MIN <= 13 * HOUR; k++) { W2.g.authorize({ reason: 'job-notification', identity: ID, now: W2.clock() }); W2.adv(61 * MIN); }
      const at = notes.map((x) => Math.round((x.filed - base0) / MIN));
      const overlap = notes.some((x, k) => k > 0 && x.filed < notes[k - 1].exp);
      ok('§5f ONE OPEN NOTICE PER WAIT, NEVER SILENT: a 13-hour wait refused every 61 minutes files its notice at 0 h, 6 h 06 and 12 h 12 — each filed only after the previous one expired, never two open at once, all under the conversation\'s key',
        J(at) === J([0, 366, 732]) && !overlap && notes.every((x) => x.key === 'antigravity:cid-9' && x.exp - x.filed === 6 * HOUR), J({ at, overlap }));
    }
    const dz = read('src/lib/i18n-zh.js'), dj = read('src/lib/i18n-ja.js');
    const keys = ['They wait behind {names}.', 'They wait behind {names} and {n} more conversations.', 'Open the conversation they wait behind: they run when its turn ends, or when you stop that turn there. Raising the limits in Settings → Spending would let more turns run meanwhile.', 'Of these, {n} are messages waiting behind running turns — counted while they wait, given back only if they are known not to have run.'];
    ok('§5f …every new line is in both dictionaries', keys.every((k) => dz.includes(J(k) + ':') && dj.includes(J(k) + ':')), J(keys.filter((k) => !dz.includes(J(k) + ':') || !dj.includes(J(k) + ':'))));
  }
  // (7) RED CONTROLS — patched copies of the real files, each round's rule taken out
  const MA = (edits) => mutantModule('src/spend-authorizer.js', edits);
  const mAtSend = MA([['  const since = (list, ms) => list.filter((t) => live(t) && countAt(t, now) > now - ms);', '  const since = (list, ms) => list.filter((t) => live(t) && stampAt(t) > now - ms);']]);
  const mDaySend = MA([['  const day = since(mine, DAY_MS);', '  const day = mine.filter((t) => stampAt(t) > now - DAY_MS);']]);
  const mNoRan = MA([['if (waitingStamp(t) || (!drain && t.end && !t.ran)) t.ran = at; t.conv = true;', 't.conv = true;']]);   // B-0a33 (1) put the given-up branch on this line
  const mDrain = MA([['if (waitingStamp(t) || (!drain && t.end && !t.ran)) t.ran = at; t.conv = true;', 'if ((waitingStamp(t) && !drain) || (!drain && t.end && !t.ran)) t.ran = at; t.conv = true;']]);
  const mPruneSend = MA([['list.filter((t) => lastStampAt(t) > cut || (waitingStamp(t) && stampAt(t) > now - RESERVATION_WAIT_MAX_MS))', 'list.filter((t) => stampAt(t) > cut || (waitingStamp(t) && stampAt(t) > now - RESERVATION_WAIT_MAX_MS))']]);
  const mNoEnd = MA([['for (const t of list) if (t && t.rid === ridKey && waitingStamp(t)) t.end = at; return', 'for (const t of list) if (false) t.end = at; return']]);
  const mNoAge = MA([['  const live = (t) => !(waitingStamp(t) && stampAt(t) <= now - RESERVATION_WAIT_MAX_MS);', '  const live = () => true;']]);
  const mNoNames = MA([['  const waits = promisedHere > 0 && Array.isArray(behind) && behind.length ? behind : null;', '  const waits = null;']]);
  const all = [mAtSend, mDaySend, mNoRan, mDrain, mPruneSend, mNoEnd, mNoAge, mNoNames];
  ok('§5f CONTROL: every patched copy was really built (an unapplied patch is a green control)', all.every((m) => m.mod && m.hits === 1), J(all.map((m) => m.err || m.hits)));
  const broke = (m, key) => SEEDS.find((sd) => { const x = law(m.mod, sd); return key === 'day' ? x.day > 14 : x.hour > 4; });
  ok('§5f CONTROL: every window counted at the SEND (the release) ⇒ THE LAW is RED (an hour holds more than its cap)', !!mAtSend.mod && broke(mAtSend, 'hour') !== undefined, mAtSend.err);
  ok('§5f CONTROL: the day counted at the send (round 0) ⇒ the reader\'s day scene is RED (free at 24 h 01) — MUST 1', !!mDaySend.mod && leg(mDaySend.mod).dayAt2401 === true, mDaySend.err || J(leg(mDaySend.mod)));
  ok('§5f CONTROL: a carry that keeps its send\'s instant ⇒ the run-hour leg RED and THE LAW RED', !!mNoRan.mod && leg(mNoRan.mod).aRan === 0 && broke(mNoRan, 'hour') !== undefined, mNoRan.err || J(leg(mNoRan.mod)));
  ok('§5f CONTROL: a stash drain that keeps its send\'s instant (the reader\'s M10) ⇒ the drain leg RED', !!mDrain.mod && J(leg(mDrain.mod).eDrain) !== J([1, 1]), mDrain.err || J(leg(mDrain.mod).eDrain));
  ok('§5f CONTROL: the prune by the SEND (the reader\'s M11, looser) ⇒ a second turn at 24 h 10 is ALLOWED at cap 1 — the leg RED', !!mPruneSend.mod && leg(mPruneSend.mod).fM11 === true, mPruneSend.err || J(leg(mPruneSend.mod).fM11));
  ok('§5f CONTROL: «ended» ignored ⇒ a frame the hub gave up holds every later hour (the give-up leg RED)', !!mNoEnd.mod && leg(mNoEnd.mod).cEnd[1] === 1, mNoEnd.err || J(leg(mNoEnd.mod).cEnd));
  ok('§5f CONTROL: the 7-day bound not read inside the count ⇒ a week-old waiting stamp still holds every window (MUST 2\'s age leg RED)', !!mNoAge.mod && leg(mNoAge.mod).b8d[0] === 1, mNoAge.err || J(leg(mNoAge.mod).b8d));
  { const mq = mutantModule('src/server/queued-wakes.js', [["  reconcile();   // B-0a33 round 1: at load — a ledger's waiting stamps no entry on disk holds end now\n", '']]);
    let held = null;
    if (mq.mod) { const W = world(5); W.q = null; for (let i = 0; i < 5; i++) W.g.note({ reason: 'peer-message', identity: ID, reservation: 'm-orphan-' + i, now: W.clock() }); const Q = mq.mod.create({ dataDir: tmpdir('vs-spend-b0a33-m-'), now: W.t, writer: { dirty() { } }, readFile: () => { throw new Error('none'); }, noteSpend: (rec) => W.g.note({ ...rec, now: W.clock() }), waitingReservations: () => W.g.waitingReservations(), log: () => { } }); void Q; held = W.counts().promisedHour; }
    ok('§5f CONTROL: no reconcile at load ⇒ the five orphans still wait (MUST 2\'s load leg RED)', !!mq.mod && held === 5, mq.err || J({ held })); }
  { let adds = 0; if (mNoNames.mod) { const ut = { add: () => { adds++; return { id: 'x' }; } }; void ut; }
    const v = mNoNames.mod ? (() => { let st = mNoNames.mod.emptyBudget(); const LL = { perIdentityHour: 2, perIdentityDay: 200, perInstanceDay: 10000, noticePct: 0 }; for (let i = 0; i < 2; i++) st = mNoNames.mod.noteUnattendedSpend(st, { identity: ID, at: 1, limits: LL, reason: 'peer-message', rid: 'w' + i, behind: { key: 'antigravity:c', name: 'alpha-chat' } }).state; const vv = mNoNames.mod.authorizeUnattendedSpend({ reason: 'peer-message', identity: ID, state: st, limits: LL, now: 2 }); return mNoNames.mod.refusalI18n(vv, { behind: mNoNames.mod.waitingBehind(st, ID.key, 2) }); })() : null;
    ok('§5f CONTROL: the refusal without its names ⇒ no «They wait behind» line and the Settings door again (MUST 3\'s leg RED)', !!v && !v.detail.some((d) => /They wait behind/.test(d.key)) && v.door === 'spending', mNoNames.err || J(v && v.detail.map((d) => d.key))); }
}

console.log('\n§5c the charge is debited to the identity the authorization resolved');
{
  // A patched copy of the REAL ladder, as a SIBLING of the original (its
  // relative requires — ../backend-caps.js, ./wrapper-files.js — resolve only
  // from src/server/). Unlinked on exit, swept by PID at start, gitignored.
  const delPath = 'src/server/conversation-deliver.js';
  const mutantLadder = (edits) => mutantModule(delPath, edits);

  /** The world: a real guard whose `identityOf` ANSWER MOVES, a real ladder and
   *  a mid-turn codex session (so the rpc rung withholds and the charge
   *  defers). `hourCap` 1 makes the ceiling observable in one delivery.
   *
   *  `livePeer` swaps the transport for rung 1 (the CLI inbox), the shipped
   *  rung that AWAITS and then charges immediately — see the leg below for why
   *  that option exists rather than a dead `postToPeer` nobody reaches. */
  const mkWorld = (ladderMod = deliverMod, hourCap = 1, { livePeer = false, backend = 'codex' } = {}) => {
    const dataDir = tmpdir('vs-spend-slot-');
    fs.mkdirSync(path.join(dataDir, 'session-buffers'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'session-buffers', 'w1.json'), JSON.stringify({ caps: CURRENT_WRAPPER_CAPS }));
    const settings = { 'spend.unattendedPerIdentityHour': hourCap };
    let live = { key: 'sub-AAA', name: 'AAA' };
    const guard = guardMod.create({
      dataDir, serverSetting: (k) => settings[k],
      identityOf: () => live, getUserTodos: () => null, log: () => { },
    });
    const S = {
      backend, mode: 'chat', _webuiId: 'w1', backendSessionId: 'cid-1',
      _isStreaming: true, pty: { write: () => { } }, name: 'busy',
    };
    const peerPosts = [];
    const deliver = ladderMod.create({
      dataDir, activeSessions: new Map([['w1', S]]),
      peerMsg: {
        // DEFAULT: no CLI-inbox peer, so the ladder falls to the rpc rung and
        // the charge is the DEFERRED one (settleRpcDelivery). With `livePeer`
        // the delivery instead rides rung 1, which AWAITS its transport and
        // then charges — the same rule on the other side of the ladder.
        findPeer: () => (livePeer ? { socketPath: '/tmp/x', name: 'peer' } : null),
        postChannelEvent: async () => ({ ok: false }),
        postToPeer: async (_p, t) => { await tick(5); peerPosts.push(t); return { ok: true }; },
      },
      getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined,
      emitPeerCard: () => { },
      authorizeSpend: (req) => guard.authorize(req), noteSpend: (rec) => guard.note(rec), log: () => { },
    });
    const led = () => { const b = guard.snapshot().budget.identities; return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.length])); };
    return { deliver, guard, S, led, peerPosts, repoint: (k) => { live = { key: k, name: k.slice(-3) }; } };
  };

  /** Three notifications; the pool re-points between each frame and the
   *  wrapper's own `peer_message_result`. Returns the ledger + each verdict. */
  const run = async (W) => {
    const verdicts = [];
    for (let i = 0; i < 3; i++) {
      W.repoint('sub-AAA');
      const r = await W.deliver.deliverToConversation('cid-1', 'job ' + i, { kind: 'notification', spendReason: 'job-notification' });
      W.repoint('sub-BBB');                                     // the 30 s pool timer, inside the 120 s settle window
      const settled = W.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued' });
      verdicts.push({ ok: r.ok === true, why: r.why || null, settled });
    }
    return { verdicts, led: W.led() };
  };

  {   // CONTROL FIRST: the flip is REAL — the guard's own answer moves.
    const W = mkWorld();
    const a = W.guard.authorize({ reason: 'job-notification', session: W.S }).identity.key;
    W.repoint('sub-BBB');
    const b = W.guard.authorize({ reason: 'job-notification', session: W.S }).identity.key;
    ok('§5c CONTROL: the identity really moves between two questions (an unmoved fixture proves nothing)',
      a === 'sub-AAA' && b === 'sub-BBB', `${a} → ${b}`);
  }

  {   // THE FIX: the charge follows the authorization, so the ceiling binds.
    const W = mkWorld();
    const r = await run(W);
    ok('§5c the FIRST delivery is charged to the slot it was AUTHORIZED on, not the one the pool moved to',
      r.led['sub-AAA'] === 1 && r.led['sub-BBB'] === undefined, JSON.stringify(r.led));
    ok('§5c …so the 1/hour ceiling binds on the account that was asked: #2 and #3 are refused, by NAME',
      r.verdicts[0].ok === true && r.verdicts[1].ok === false && r.verdicts[2].ok === false
      && r.verdicts[1].why === 'hour-cap', JSON.stringify(r.verdicts));
    ok('§5c …and an account nobody asked is debited NOTHING (it keeps its own unattended turns)',
      (W.guard.snapshot().budget.identities['sub-BBB'] || []).length === 0);
    ok('§5c the guard never had to resolve an identity at CHARGE time (the production counter for this shape)',
      W.guard.snapshot().chargesUnhinted === 0, String(W.guard.snapshot().chargesUnhinted));
  }

  {   // The same rule on a rung that CHARGES IMMEDIATELY but still awaits: the
      // window is the transport's, not the settle queue's.
      //
      // THE AWAIT HAS TO BE REACHED. This leg's first draft put the awaiting
      // `postToPeer` behind a `findPeer` that answered null, so the ladder ran
      // from the gate to the rpc rung's charge SYNCHRONOUSLY and the re-point
      // below landed after the money had already moved. MEASURED both ways:
      // an order probe on the real ladder printed `authorize → CHARGE → (the
      // driver re-points)` with `postToPeer` never called at all, and the leg
      // stayed GREEN with the product fix reverted while the four legs around
      // it went red. An assert that cannot fail is not an assert — so the rung
      // is now reached, and a CONTROL says so before the money is read.
    const W = mkWorld(deliverMod, 12, { livePeer: true, backend: 'claude' });
    W.repoint('sub-AAA');
    const p = W.deliver.deliverToConversation('cid-1', 'peer text', { kind: 'peer', spendReason: 'peer-message' });
    W.repoint('sub-BBB');                                       // moves DURING the transport await, BEFORE the charge
    const r = await p;
    ok('§5c CONTROL: the delivery really rode the AWAITING rung (a transport nobody called proves nothing)',
      r.ok === true && r.lane === 'message' && W.peerPosts.length === 1, JSON.stringify({ r, posts: W.peerPosts.length }));
    ok('§5c a peer message charged on delivery is charged to the authorized slot too (the transport await is the window)',
      W.led()['sub-AAA'] === 1 && W.led()['sub-BBB'] === undefined, JSON.stringify(W.led()));
    ok('§5c …and that rung never asked the guard to resolve an identity either',
      W.guard.snapshot().chargesUnhinted === 0, String(W.guard.snapshot().chargesUnhinted));
  }

  {   // NEGATIVE CONTROL: a patched copy of the REAL ladder with r3's shipped
      // line restored — the defect, reproduced end to end.
    // ONE DIMENSION AT A TIME (the negative-control law): the mutation restores
    // r3's IDENTITY expression and keeps r5's `hold`, so what changes between
    // the two worlds is the slot the charge names — nothing else. Dropping the
    // hold as well would make the copy differ in two ways at once and the
    // ladder would refuse its own second delivery for a reason that has nothing
    // to do with r4.
    const R3_LINE = 'charged = { reason: spendReason, session, identity };';
    const PRE = 'charged = { reason: spendReason, session, identity, hold: (v && v.hold) || null };';
    const FIX = 'charged = { reason: spendReason, session, identity: (v && v.identity) || identity, hold: (v && v.hold) || null };';
    const m = mutantLadder([[FIX, PRE]]);
    ok('§5c NEGATIVE CONTROL: the pre-fix line was re-applied to the copy (an unapplied patch is a green control)',
      !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const W = mkWorld(m.mod);
      const r = await run(W);
      ok('§5c NEGATIVE CONTROL: r3 authorizes THREE unattended turns against a cap of 1 — the authorized account is debited 0',
        r.verdicts.every((v) => v.ok) && r.led['sub-AAA'] === undefined, JSON.stringify({ v: r.verdicts.map((x) => x.ok), led: r.led }));
      ok('§5c NEGATIVE CONTROL: …and the account that was NEVER ASKED is debited all three (it now refuses its own turns)',
        r.led['sub-BBB'] === 3, JSON.stringify(r.led));
      ok('§5c NEGATIVE CONTROL: …and the guard SAYS it had to resolve the identity itself, three times',
        W.guard.snapshot().chargesUnhinted === 3, String(W.guard.snapshot().chargesUnhinted));
    }
    // …and that line is r3's, byte for byte — not a shape this suite invented.
    {
      let shipped = '';
      try { shipped = execFileSync('git', ['-C', REPO, 'show', '4ceba626:' + delPath], { env: GIT_ENV, maxBuffer: 64 * 1024 * 1024 }).toString(); } catch { }
      if (!shipped) console.log('  · SKIP: git could not read 4ceba626:' + delPath + ' (the pre-fix bytes)');
      else ok('§5c NEGATIVE CONTROL: the restored expression is byte-identical to the SHIPPED one (the control reproduces r3, not an invention)',
        shipped.includes(R3_LINE) && !shipped.includes(FIX)
        && PRE.startsWith(R3_LINE.slice(0, -3)) && !PRE.includes('v.identity'),
        JSON.stringify({ inShipped: shipped.includes(R3_LINE), pre: PRE }));
    }
  }

  {   // THE COUNTER IS NOT VACUOUS: a charge that really does arrive with no
      // identity must move it, or every "=== 0" above says nothing.
    const W = mkWorld();
    W.guard.note({ reason: 'peer-message', session: W.S });
    ok('§5c CONTROL: the unhinted counter is reachable — a charge carrying only a session moves it',
      W.guard.snapshot().chargesUnhinted === 1, String(W.guard.snapshot().chargesUnhinted));
  }


  // THE FOURTH PRODUCER, in the one shape where its own answer is not enough.
  // auto-resume normally hands the guard the identity IT re-resolved after the
  // pre-fire gate (`ident2`), so the guard's resolution never runs. But
  // `identityFor` is allowed to answer NOTHING — `fireIdentity` is an optional
  // dep and the engine's `fireIdentityFor` returns null for a session it cannot
  // place — and then BOTH calls fell through to the guard, which re-resolved
  // between them across `sendToSession`. The send is exactly where a stdout
  // consumer can kick the pool (every `noteLive` producer calls `kickPoolEval`
  // on the next line), so the window is real. `spendOk` now hands back the slot
  // its verdict measured.
  {
    const mkAr = (out) => {
      const dataDir = tmpdir('vs-spend-ar-slot-');
      let live = { key: 'sub-AAA', name: 'AAA' };
      const guard = guardMod.create({
        dataDir, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 12 }[k]),
        identityOf: () => live, getUserTodos: () => null, log: () => { },
      });
      const sessions = new Map();
      const fired = [];
      const ar = arMod.create({
        dataDir, activeSessions: sessions, serverSetting: () => true, log: () => { },
        // THE POOL MOVES DURING THE SEND — the frame is written, and the
        // consumer that reads its first record re-decides the pool.
        sendToSession: (id) => { fired.push(id); live = { key: 'sub-BBB', name: 'BBB' }; return true; },
        fireIdentity: () => null,                     // the dep answers nothing: the guard resolves
        authorizeSpend: (id, s, identity, o) => guard.authorize({ reason: 'auto-resume', session: s, sessionId: id, identity, hold: !!(o && o.hold) }),
        noteSpend: (id, s, identity, hold) => guard.note({ reason: 'auto-resume', session: s, identity, hold }),
        releaseSpend: (id, s, hold) => guard.release({ hold }),
      });
      const s = { backend: 'claude', mode: 'chat', _webuiId: 'a1', _autoResume: true, name: 'c' };
      sessions.set('a1', s);
      ar.armIfEnabled('a1', s, Date.now() + 60_000, 'usage limit');
      ar.tick(Date.now() + 120_000);
      return { guard, fired, led: () => { const b = guard.snapshot().budget.identities; return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.length])); } };
    };
    const W = mkAr();
    await tick(40);
    ok('§5c CONTROL: the continue is DELIVERED (an unfired producer proves nothing) and the pool moved during the send',
      W.fired.length === 1);
    ok('§5c auto-resume charges the slot ITS authorization resolved, even when its own dep could not name one',
      W.led()['sub-AAA'] === 1 && W.led()['sub-BBB'] === undefined, JSON.stringify(W.led()));
    ok('§5c …and the guard was never asked the identity question a second time',
      W.guard.snapshot().chargesUnhinted === 0, String(W.guard.snapshot().chargesUnhinted));
  }
  // THE RULE IS THE SAME AT EVERY PAIR, and the other three producers are
  // driven for it in their own sections (§4 auto-resume, §6 the Stop nudge,
  // §9 the codex reset credit) — each asserts `chargesUnhinted === 0` on its
  // own guard, which is the census a grep over five call sites cannot be:
  // "no await in between" is a property of an arrangement of code, not of the
  // question being asked once.
}

// ── §5g B-0a33's REMAINDERS (the owner's word via 主开发 2026-11-17: the gate may count MORE or refuse — never loosen) ──
// The 2.369.402 Known list, each built in the direction that counts more or refuses: (3) a null or blank cap stays a refusal
// and is SAID as itself; (2) a frame already waiting when a cap is lowered below it is taken back out of its wrapper's queue
// (held, said, never dropped) — the frames left run inside the cap; (1) a frame the hub gave up on is counted where it runs,
// or — still listed in its process's queue — taken back out so it does not run. One clock: the REAL guard + the REAL
// queued-wakes, and a stand-in wrapper queue that answers a take-back the way data/bin/codex-chat-wrapper.js does (a
// mode-less peer_message_result carrying the words).
console.log('\n§5g B-0a33\'s remainders: an empty cap is said as itself; a lowered cap takes waiting frames back; a given-up frame is counted where it runs or does not run');
{
  const QWm = require(path.join(REPO, 'src/server/queued-wakes.js'));
  const HOUR = 3600e3, DAY = 24 * HOUR, MIN = 60e3, SEC = 1e3;
  const IDg = { key: 'slot-g', name: 'G' };
  const mkWorld = (caps, { serves = true, qMod = QWm, gMod = guardMod } = {}) => {
    let CLOCK = Date.parse('2026-11-17T08:00:00Z');
    const dir = tmpdir('vs-spend-5g-');
    const settings = { 'spend.unattendedPerIdentityHour': 30, 'spend.unattendedPerIdentityDay': 2000, 'spend.unattendedPerInstanceDay': 10000, ...caps };
    const producers = {}, files = {};
    const writer = { dirty: (file, o) => { producers[file] = o.produce; } };
    const W = { dir, settings, ran: [], stash: [], backs: [], logs: [], queue: {}, pulls: [], serves, inbox: [] };
    W.now = () => CLOCK; W.setClock = (t) => { CLOCK = t; }; W.adv = (ms) => { CLOCK += ms; };
    W.mkG = () => gMod.create({ dataDir: dir, serverSetting: (k) => settings[k], identityOf: () => IDg, getUserTodos: () => ({ add: (k, i) => { W.inbox.push({ key: k, ...i }); return { id: 'ut-' + W.inbox.length }; } }), log: () => { }, schedule: () => null, unschedule: () => { } });
    const stashFn = (pe, w) => W.stash.push(w.text);
    // the stand-in wrapper: its queue per conversation; `remove` takes the item out and hands the words back (mode-less)
    W.pull = (cid, item, holder) => {
      W.pulls.push(item);
      if (!W.serves) return 'no-remove';   // its process is here and too old to serve «remove»
      const q = W.queue[cid] || [];
      const i = q.findIndex((x) => x.id === item);
      if (i < 0) return true;   // gone: it ran (the wrapper answers 'gone', nothing comes back)
      const [it] = q.splice(i, 1);
      W.q.noteHandedBack(cid, it.text, 'removed from the queue before it was delivered', stashFn);
      W.q.noteQueue(cid, q.map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });
      return true;
    };
    W.mkQ = (f) => qMod.create({ dataDir: dir, now: () => CLOCK, writer, readFile: (x) => { if (!(x in f)) { const e = new Error('none'); e.code = 'ENOENT'; throw e; } return f[x]; },
      noteSpend: (rec) => W.g.note({ ...rec, now: CLOCK }), releaseSpend: (rec) => W.g.release({ ...rec, now: CLOCK }), reservationState: (rid) => W.g.reservationState(rid),
      waitingReservations: () => W.g.waitingReservations(), waitingOverCap: () => W.g.waitingOverCap(CLOCK), pull: (cid, item, holder) => W.pull(cid, item, holder), stashHas: () => false, log: (...a) => W.logs.push(a.join(' ')) });
    W.g = W.mkG(); W.q = W.mkQ({});
    W.q.onHandedBack((cid, pe, x) => W.backs.push(x.reason || null));
    W.restart = ({ tornLedger = false } = {}) => { W.g.flush(); if (tornLedger) fs.writeFileSync(path.join(dir, 'spend-budget.json'), '{"v":1,"budget":{"identit'); for (const [fl, pr] of Object.entries(producers)) files[fl] = pr(); W.g = W.mkG(); W.q = W.mkQ({ ...files }); W.q.onHandedBack((cid, pe, x) => W.backs.push(x.reason || null)); };
    W.sendUnbound = (cid, text) => {   // a send whose queue item the hub has not seen listed yet
      const v = W.g.authorize({ reason: 'peer-message', identity: IDg, now: CLOCK }); if (!v.ok) return { refused: v.why };
      const e = W.q.noteWritten(cid, { charged: { reason: 'peer-message', identity: IDg, hold: v.hold }, text, holder: '4242' });
      W.q.answer(e.id, { mode: 'queued' });
      (W.queue[cid] = W.queue[cid] || []).push({ id: 'it-' + e.id, text });
      return e;
    };
    W.send = (cid, text) => {   // the ladder's send behind a running turn + the wrapper's queue_changed
      const v = W.g.authorize({ reason: 'peer-message', identity: IDg, now: CLOCK }); if (!v.ok) return { refused: v.why };
      const e = W.q.noteWritten(cid, { charged: { reason: 'peer-message', identity: IDg, hold: v.hold }, text, holder: '4242' });
      W.q.answer(e.id, { mode: 'queued' });
      (W.queue[cid] = W.queue[cid] || []).push({ id: 'it-' + e.id, text });
      W.q.noteQueue(cid, W.queue[cid].map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });
      return e;
    };
    W.runNext = (cid) => { W.q.noteTurnEnded(cid); W.q.noteTurnStarted(cid); const it = (W.queue[cid] || []).shift(); if (it) W.ran.push(CLOCK); W.q.noteQueue(cid, (W.queue[cid] || []).map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true }); return it; };
    W.spend = () => { const v = W.g.authorize({ reason: 'auto-resume', identity: IDg, now: CLOCK }); if (!v.ok) return v.why; W.g.note({ reason: 'auto-resume', identity: IDg, hold: v.hold, now: CLOCK }); W.ran.push(CLOCK); return true; };
    W.counts = () => W.g.authorize({ reason: 'auto-resume', identity: IDg, hold: false, now: CLOCK }).counts;
    W.maxIn = (win) => { const ts = W.ran.slice().sort((a, b) => a - b); let m = 0; for (let i = 0, j = 0; i < ts.length; i++) { while (j < ts.length && ts[j] < ts[i] + win) j++; m = Math.max(m, j - i); } return m; };
    return W;
  };
  // ── (3) A NULL OR BLANK CAP STAYS A REFUSAL, SAID AS ITSELF ──
  {
    const rows = [null, '', '  ', undefined, 0, -1, 'abc', true, false, 'off', '30', 12].map((x) => { const L = A.budgetLimits(() => x); return [x, L.perIdentityHour, (L.unset || []).includes('perIdentityHour')]; });
    ok('§5g (3) budgetLimits — A CAP THAT IS NOT A NUMBER IS NOT A CAP (the follow-up ruling): null, blank, a negative number, a text, a boolean are 0 AND named unset; only NO setting (undefined) is the default; an explicit 0 is a 0; «30» written as text is 30',
      JSON.stringify(rows) === JSON.stringify([[null, 0, true], ['', 0, true], ['  ', 0, true], [undefined, 30, false], [0, 0, false], [-1, 0, true], ['abc', 0, true], [true, 0, true], [false, 0, true], ['off', 0, true], ['30', 30, false], [12, 12, false]]), JSON.stringify(rows));
    const L = A.budgetLimits((k) => (k === 'spend.unattendedPerIdentityHour' ? null : undefined));
    const v = A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: IDg, state: A.emptyBudget(), limits: L });
    ok('§5g (3) a null hour cap REFUSES (never the default 30) and the refusal says «no cap is set», not «set to 0»', v.ok === false && v.why === 'hour-cap' && v.capUnset === true && /no cap is set for unattended turns per identity per hour/.test(v.detail) && !/set to 0/.test(v.detail), v.detail);
    const i = A.refusalI18n(v, { sessionName: 'ops' });
    const doorKeys = i.detail.map((d) => d.key);
    ok('§5g (3) …the notice reads its own row («no limit is set … — set a number») and the door that sets it, never «switched off — its limit is 0»',
      /no limit is set for turns nobody typed on \{account\} — set a number/.test(i.text.key) && doorKeys.includes(A.DOOR_LINK_WORDS.unset) && !/switched off/.test(i.text.key), JSON.stringify(i.text));
    const Li = A.budgetLimits((k) => (k === 'spend.unattendedPerInstanceDay' ? '' : undefined));
    const vi = A.authorizeUnattendedSpend({ reason: 'peer-message', identity: IDg, state: A.emptyBudget(), limits: Li });
    ok('§5g (3) a blank INSTANCE cap: refused, «on this instance»', vi.why === 'instance-cap' && /on this instance — set a number/.test(A.refusalI18n(vi, {}).text.key));
    const { dictEntries } = await import('./i18n-extract.mjs');
    const ZH = new Map([...dictEntriesOnce(dictEntries, read('src/lib/i18n-zh.js'))].map((e) => [e.key, e.value])), JA = new Map([...dictEntriesOnce(dictEntries, read('src/lib/i18n-ja.js'))].map((e) => [e.key, e.value]));
    const SSm = require(path.join(REPO, 'src/stash-summary.js'));
    const toast = SSm.handOverRefusalWords({ code: 'spend_refused', why: 'hour-cap', cap: 0, capUnset: true, identity: IDg }, (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m)), {});
    ok('§5g (3) the hand-over toast says it (no limit is set — set a number) with the Spending door; a 0 cap still says «switched off»',
      /no limit is set for turns nobody typed on G: set a number in its row: vibespace:\/\/settings\/spend\.unattendedPerIdentityHour\./.test(toast.text) && toast.door === 'spending'
        && /switched off/.test(SSm.handOverRefusalWords({ code: 'spend_refused', why: 'hour-cap', cap: 0, identity: IDg }, (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m)), {}).text), toast.text);
    const keys = [...A.REFUSAL_WORDS['cap-unset'], ...A.REFUSAL_WORDS['cap-unset-instance'], A.DOOR_WORDS.unset, A.DOOR_LINK_WORDS.unset, 'Not handed over — no limit is set for turns nobody typed on {account}: set a number in its row: {link}. The notices keep waiting.', 'Not handed over — no limit is set for turns nobody typed on this instance: set a number in its row: {link}. The notices keep waiting.', 'none — every turn nobody typed is held until a number is set'];
    ok('§5g (3) every new sentence is in zh and ja', keys.every((k) => ZH.has(k) && JA.has(k)), keys.filter((k) => !ZH.has(k) || !JA.has(k)).join(' | '));
    // A REQUEST THAT SETS A CAP TO NOTHING STORES NOTHING (the follow-up ruling): the REAL settings router — a PATCH {cap: null}
    // from the owner's page stores it BLANK (refused, said), never removes the key so the default comes back. THE PORT'S MEETING
    // (2.369.412's setting-holds): the server's own patchSettings keeps its door's contract — a null is the row's DEFAULT, what a
    // timed raise's return writes for a row that was at its default (else every turn nobody typed would be refused at the return)
    const routerRun = async (pmod) => {
      const express = require(path.join(REPO, 'node_modules/express'));
      const http = require('node:http');
      const dir = tmpdir('vs-spend-5g-patch-');
      const router = pmod.setup({ dataDir: dir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => null, getMounts: () => null, getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
      router.patchSettings({ 'spend.unattendedPerIdentityHour': 9, 'spend.unattendedPerIdentityDay': 90 });
      const app = express(); app.use(express.json()); app.use(router);
      const srv = await new Promise((res) => { const sv = app.listen(0, '127.0.0.1', () => res(sv)); });
      const patch = (body) => new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: srv.address().port, path: '/api/settings', method: 'PATCH', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } }, (r) => { r.resume(); r.on('end', res); }); rq.end(JSON.stringify(body)); });   // the owner's page (setting-doors pick 0 refuses any other)
      await patch({ 'spend.unattendedPerIdentityHour': null, 'ui.someOtherRow': null });
      const afterHttp = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
      router.patchSettings({ 'spend.unattendedPerIdentityDay': null });
      const afterAct = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
      await new Promise((r) => srv.close(r));
      return { afterHttp, afterAct };
    };
    // the meeting's scene: the REAL setting-holds over the REAL router — a timed raise of the hour cap from its default, then its return
    const HOURK = 'spend.unattendedPerIdentityHour';
    const holdRun = async (pmod) => {
      const dirH = tmpdir('vs-spend-5g-hold-');
      const rH = pmod.setup({ dataDir: dirH, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => null, getMounts: () => null, getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
      const SHm = require(path.join(REPO, 'src/server/setting-holds.js'));
      const H = SHm.create({ dataDir: dirH, readSettings: () => rH.readSettings(), patchSettings: (p) => rH.patchSettings(p), now: () => 1_900_000_000_000, writer: { dirty: () => { }, durable: async () => true }, setTimer: () => ({}), clearTimer: () => { } });
      const took = await H.take({ key: HOURK, value: 50, untilRel: 3600e3, shown: 30 });
      const during = A.budgetLimits((k) => rH.readSettings()[k]).perIdentityHour;
      await H.returnHold(HOURK, 'moment');
      const after = { ...rH.readSettings() };
      return { took: !!(took && took.ok), during, after, L: A.budgetLimits((k) => after[k]) };
    };
    {
      const { afterHttp, afterAct } = await routerRun(require(path.join(REPO, 'src/routes/persistence.js')));
      const L = A.budgetLimits((k) => afterAct[k]);
      ok('§5g (3) THE REAL ROUTER: a PATCH {hour cap: null} from the owner\'s page STORES nothing — blank, read «no limit is set» (refused), never the default; another row\'s null still removes it; the server\'s own patchSettings({day cap: null}) is its door\'s «the row\'s default» (the key removed)',
        afterHttp['spend.unattendedPerIdentityHour'] === '' && afterHttp['spend.unattendedPerIdentityDay'] === 90 && !Object.prototype.hasOwnProperty.call(afterAct, 'spend.unattendedPerIdentityDay') && L.perIdentityHour === 0 && L.perIdentityDay === A.BUDGET_DEFAULTS.perIdentityDay && JSON.stringify(L.unset) === '["perIdentityHour"]'
        && !Object.prototype.hasOwnProperty.call(afterHttp, 'ui.someOtherRow'), JSON.stringify({ afterHttp, afterAct }));
      // (r2, N4) THE ROUTER'S OWN RED COPY: the PATCH's cap rule back to «a null removes the key»
      const mr = mutantModule('src/routes/persistence.js', [['    const merged = { ...current, ...blankCaps({ ...patch }) };', '    const merged = { ...current, ...patch };'], ['if (v === null && !SPEND_CAP_KEYS.has(k)) delete merged[k]; }   // the cure:', 'if (v === null) delete merged[k]; }   // the cure:']]);   // stale-pins: kept (the OLD line is the copy compiled back in, never an anchor)
      ok('§5g (3) CONTROL: the PATCH\'s cap rules back to the release in a copy (both lines hit)', !mr.err && mr.hits === 2, mr.err || '');
      if (!mr.err) { const rm = await routerRun(mr.mod); const Lr = A.budgetLimits((k) => rm.afterHttp[k]); ok('§5g (3) CONTROL: with it, the PATCH REMOVES the cap — the default 30 comes back in silence — RED', !('spend.unattendedPerIdentityHour' in rm.afterHttp) && Lr.perIdentityHour === 30, JSON.stringify(rm.afterHttp)); }
      // THE MEETING: a timed raise of a cap at its default returns to the default — never «no limit is set»
      const hr = await holdRun(require(path.join(REPO, 'src/routes/persistence.js')));
      ok('§5g (3) THE PORT\'S MEETING (setting-holds): a timed raise of the hour cap from its default (30 → 50) RETURNS to the default — the key removed through patchSettings, the cap 30 again, never «no limit is set» (every turn nobody typed refused)',
        hr.took && hr.during === 50 && !Object.prototype.hasOwnProperty.call(hr.after, HOURK) && hr.L.perIdentityHour === 30 && !hr.L.unset, JSON.stringify(hr));
      const mh = mutantModule('src/routes/persistence.js', [["{ if (v === null && (!SPEND_CAP_KEYS.has(k) || Object.prototype.hasOwnProperty.call(patch, k))) delete merged[k]; }   // the internal door", "{ if (v === null && !SPEND_CAP_KEYS.has(k)) delete merged[k]; }   // the internal door"]]);
      ok('§5g (3) CONTROL: the follow-up\'s first rule (patchSettings keeps a cap\'s null) in a copy (the patch hit)', !mh.err && mh.hits === 1, mh.err || '');
      if (!mh.err) { const hm = await holdRun(mh.mod); ok('§5g (3) CONTROL: with it, the raise\'s return STORES null — the hour cap reads «no limit is set», every turn nobody typed refused — RED', hm.took && hm.after[HOURK] === null && hm.L.perIdentityHour === 0 && JSON.stringify(hm.L.unset) === '["perIdentityHour"]', JSON.stringify(hm)); }
      // THE CURE (主开发 04:23Z, round wrhah7kp5's MUST): the Settings page saves the WHOLE file by POST — a person's cleared cap is
      // stored BLANK there too, and no later internal patch (another row's write, a timed raise and its return) drops it
      const refusedSaid = (st) => { const L = A.budgetLimits((k) => st[k]); const v = A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: IDg, state: A.emptyBudget(), limits: L }); return !v.ok && v.why === 'hour-cap' && v.capUnset === true && /no cap is set for unattended turns per identity per hour/.test(v.detail); };
      // persistence.js keeps ONE module-level router: a second setup() of the same module adds handlers that never answer — every
      // page run takes its OWN copy of the module (byte-identical: `same`), as the mutant copies are
      const freshPR = (tag = 'page-real') => require(MUT.write('src/routes/persistence.js', read('src/routes/persistence.js'), tag, { same: true }));
      const pageRun = async (pmod, { file = null, shmod = null, wireNote = false, holds = null } = {}) => {
        const express = require(path.join(REPO, 'node_modules/express')), http = require('node:http');
        const dir = tmpdir('vs-spend-5g-page-');
        if (file) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(file));
        const notices = [], logs = [], late = { H: null };
        const router = pmod.setup({ dataDir: dir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => null, getMounts: () => null, getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: (data) => { if (wireNote && late.H) late.H.noteSettingsWrite(data); } });   // server.js: a write tells the holds
        const app = express(); app.use(express.json()); app.use(router);
        const srv = await new Promise((res) => { const sv = app.listen(0, '127.0.0.1', () => res(sv)); });
        const send = (method, body, headers = { 'sec-fetch-site': 'same-origin' }, at = '/api/settings') => new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: srv.address().port, path: at, method, headers: { 'content-type': 'application/json', ...headers } }, (r) => { r.resume(); r.on('end', () => res(r.statusCode)); }); rq.end(JSON.stringify(body)); });
        const disk = () => JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
        if (holds) fs.writeFileSync(path.join(dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds }));   // a store a previous run left
        const SHm = shmod || require(path.join(REPO, 'src/server/setting-holds.js'));
        const H = SHm.create({ dataDir: dir, readSettings: () => router.readSettings(), patchSettings: (q) => router.patchSettings(q), broadcast: (m) => notices.push(m), log: (m) => logs.push(String(m)), now: () => 1_900_000_000_000, writer: { dirty: () => { }, durable: async () => true }, setTimer: () => ({}), clearTimer: () => { } });
        late.H = H;
        return { router, send, disk, H, notices, logs, close: () => new Promise((r) => srv.close(r)) };
      };
      {
        const pg = await pageRun(freshPR());
        const posted = await pg.send('POST', { [HOURK]: null, 'spend.unattendedPerIdentityDay': 90, 'ui.someRow': 1 });   // the page: the whole file, the cleared field null
        const afterPost = pg.disk();
        pg.router.patchSettings({ 'ui.anotherRow': 2 });   // (1) a patch of another row (a plugin's write, a boot migration)
        const afterPatch = pg.disk();
        const took = await pg.H.take({ key: HOURK, value: 50, untilRel: 3600e3, shown: 0 });   // (2) a timed raise over the blank — its «now» is 0 (none)
        const during = A.budgetLimits((k) => pg.router.readSettings()[k]).perIdentityHour;
        await pg.H.returnHold(HOURK, 'moment');
        const afterHold = pg.disk(), back = pg.notices.find((m) => m && m.type === 'server-notice');
        await pg.close();
        ok('§5g (3) THE CURE: the Settings page\'s POST of a cleared hour cap stores it BLANK — «no limit is set», every unattended turn refused and said', posted === 200 && afterPost[HOURK] === '' && refusedSaid(afterPost), JSON.stringify(afterPost));
        ok('§5g (3) …(1) a later patch of ANOTHER row keeps the blank — still refused and said', afterPatch[HOURK] === '' && afterPatch['ui.anotherRow'] === 2 && refusedSaid(afterPatch), JSON.stringify(afterPatch));
        ok('§5g (3) …(2) a timed raise over the blank (its «now» read as none = 0: a raise) and its return — the blank comes back, still refused and said; the notice says «none» with the row\'s link, never an empty value',
          !!took && took.ok && took.before === '' && during === 50 && afterHold[HOURK] === '' && refusedSaid(afterHold) && !!back && back.i18n && back.i18n.key === '{label} is back to none — the hold ended: every turn nobody typed is held until a number is set: {link}' && /vibespace:\/\/settings\/spend\.unattendedPerIdentityHour/.test(back.i18n.params.link), JSON.stringify({ took, during, afterHold, back }));
      }
      {
        // a cap's NULL already on disk (an older build, a hand edit): a patch of another row never drops it, and (b) a tool's PATCH of an
        // unrelated row is not refused for a spend row nobody touched (the stored null is not rewritten under its feet)
        const pg = await pageRun(freshPR(), { file: { [HOURK]: null, 'ui.someRow': 1 } });
        pg.router.patchSettings({ 'ui.anotherRow': 2 });
        const afterPatch = pg.disk();
        const tool = await pg.send('PATCH', { 'ui.someRow': 3 }, { authorization: 'Bearer agent-key' });
        const afterTool = pg.disk();
        await pg.close();
        ok('§5g (3) THE CURE: a cap\'s stored NULL survives a patch of another row (the internal door drops only a null it carries) — refused and said', afterPatch[HOURK] === null && refusedSaid(afterPatch), JSON.stringify(afterPatch));
        ok('§5g (3) (b) a tool\'s PATCH of an UNRELATED row is not refused by a spend row nobody touched — the stored null stays as it was', tool === 200 && afterTool['ui.someRow'] === 3 && afterTool[HOURK] === null, JSON.stringify({ tool, afterTool }));
      }
      // RED COPIES (setup-checked anchors; a copy whose line is gone fails by name)
      {
        const PSRC = read('src/routes/persistence.js');
        const POSTB = "    blankCaps(data);   // B-0a33 cure:", PATCHI = "if (v === null && (!SPEND_CAP_KEYS.has(k) || Object.prototype.hasOwnProperty.call(patch, k))) delete merged[k]; }", PATCHB = "    const merged = { ...current, ...blankCaps({ ...patch }) };";
        ok('§5g (3) setup: the POST\'s blank, the internal door\'s carried-null rule and the PATCH\'s own-blank are each in persistence.js once', PSRC.split(POSTB).length === 2 && PSRC.split(PATCHI).length === 2 && PSRC.split(PATCHB).length === 2);
        const m1 = mutantModule('src/routes/persistence.js', [[POSTB, '    // no blank:']]);
        if (!m1.err) { const pg = await pageRun(m1.mod); await pg.send('POST', { [HOURK]: null }); const d1 = pg.disk(); await pg.close(); ok('§5g (3) CONTROL: without the POST\'s blank the cleared cap is stored NULL — the leg above goes red', d1[HOURK] === null, JSON.stringify(d1)); } else ok('§5g (3) CONTROL: the POST copy loads', false, m1.err);
        const m2 = mutantModule('src/routes/persistence.js', [[PATCHI, 'if (v === null) delete merged[k]; }']]);   // stale-pins: kept (the OLD line is the copy compiled back in, never an anchor)
        if (!m2.err) { const pg = await pageRun(m2.mod, { file: { [HOURK]: null, 'ui.someRow': 1 } }); pg.router.patchSettings({ 'ui.anotherRow': 2 }); const d2 = pg.disk(); await pg.close(); ok('§5g (3) CONTROL: with every null dropped, another row\'s patch removes the cap — the default 30 again, in silence — RED', !(HOURK in d2) && A.budgetLimits((k) => d2[k]).perIdentityHour === 30, JSON.stringify(d2)); } else ok('§5g (3) CONTROL: the patch copy loads', false, m2.err);
        // (b) has two guards since cure 2 — the PATCH never rewrites a stored null it does not carry, and the owner check reads null ≡ blank
        // for a cap: the copy compiles BOTH away (one alone stays green, the other holds)
        const m3 = mutantModule('src/routes/persistence.js', [[PATCHB, '    const merged = blankCaps({ ...current, ...patch });'], ["(JSON.stringify(cur[k]) === JSON.stringify(nxt[k]) || (nothing(k, cur[k]) && nothing(k, nxt[k])))", 'JSON.stringify(cur[k]) === JSON.stringify(nxt[k])']]);
        if (!m3.err) { const pg = await pageRun(m3.mod, { file: { [HOURK]: null, 'ui.someRow': 1 } }); const st = await pg.send('PATCH', { 'ui.someRow': 3 }, { authorization: 'Bearer agent-key' }); await pg.close(); ok('§5g (3) CONTROL (b): a PATCH that rewrites the stored null, under an owner check that tells null from blank, refuses the tool\'s unrelated PATCH (403, a spend row nobody touched) — RED', st === 403, String(st)); } else ok('§5g (3) CONTROL: the PATCH copy loads', false, m3.err);
      }
      // CURE 2 (主开发 04:51Z, round wk9kvj528 — THE LAW): a hold is live only while the row's RAW stored value is exactly what it wrote. THE
      // SCENE: a hold LOWERED the hour cap to 0 until a time; the person clears the field by hand (the page's POST stores the blank) — the
      // hold ends «changed by hand» and its return writes nothing over the person's «nothing»
      {
        const lawRun = async ({ shmod = null, wireNote = true } = {}) => {
          const pg = await pageRun(freshPR('page-law'), { shmod, wireNote });
          const took = await pg.H.take({ key: HOURK, value: 0, untilRel: 3600e3, shown: 30 });   // an agent's «lower to 0 for an hour», pressed
          const held = pg.disk()[HOURK];
          const posted = await pg.send('POST', { ...pg.disk(), [HOURK]: null });   // the owner clears the field by hand
          const r = await pg.H.returnHold(HOURK, 'moment');
          const d = pg.disk(); await pg.close();
          return { took: !!(took && took.ok), held, posted, r, d, list: pg.H.list(), logs: pg.logs };
        };
        const a = await lawRun({ wireNote: true }), b = await lawRun({ wireNote: false });
        ok('§5g (3) CURE 2 (the law): a hold at 0, then the page\'s POST of the cleared field — the write\'s note ends the hold «changed by hand (none)»; its moment writes nothing: the disk holds the blank, refused and said',
          a.took && a.held === 0 && a.posted === 200 && a.d[HOURK] === '' && refusedSaid(a.d) && a.list.length === 0 && a.logs.some((l) => /changed by hand \(none\)/.test(l)) && (a.r.none || a.r.changedByHand), JSON.stringify({ ...a, logs: a.logs.slice(-3) }));
        ok('§5g (3) …and with no write note at all, the return itself reads the RAW value: the blank is not the 0 it wrote — no write over it, the blank stays, refused and said',
          b.took && b.r.changedByHand === true && b.d[HOURK] === '' && refusedSaid(b.d), JSON.stringify({ r: b.r, d: b.d }));
        const SHSRC = read('src/server/setting-holds.js'), LIVE = "    if (!AS.holdIsLive(h, raw)) { endChangedByHand(key, said(raw)";
        ok('§5g (3) setup: the return\'s raw liveness is in setting-holds once', SHSRC.split(LIVE).length === 2);
        const mr2 = mutantModule('src/server/setting-holds.js', [[LIVE, "    if (!AS.holdIsLive(h, cur)) { endChangedByHand(key, said(raw)"]]);
        if (!mr2.err) { const c = await lawRun({ shmod: mr2.mod, wireNote: false }); ok('§5g (3) CONTROL: with liveness read through valueIn (a blank reads 0 = the hold\'s value), the return writes «before» back — the cap is absent, the default 30 runs again in silence — RED', !(HOURK in c.d) && A.budgetLimits((k) => c.d[k]).perIdentityHour === 30, JSON.stringify(c.d)); } else ok('§5g (3) CONTROL: the setting-holds copy loads', false, mr2.err);
      }
      // OWED (主开发 08:03Z, round w82yatchx — on the next line of these files): red copies for the two OTHER raw-liveness sites, and a
      // credentialed whole-file write that really CHANGES a cap is still refused
      {
        const noteRun = async (shmod = null) => {
          const pg = await pageRun(freshPR('page-note'), { shmod, wireNote: true });
          await pg.H.take({ key: HOURK, value: 0, untilRel: 3600e3, shown: 30 });
          await pg.send('POST', { ...pg.disk(), [HOURK]: null });   // the person clears the field by hand
          const listed = pg.H.list().length; await pg.close(); return { listed, logs: pg.logs };
        };
        const nr = await noteRun();
        ok('§5g (3) OWED: the settings-write note reads the RAW value — the cleared field ends the hold at 0 at once, «changed by hand (none)»', nr.listed === 0 && nr.logs.some((l) => /changed by hand \(none\)/.test(l)), JSON.stringify(nr));
        const SH3 = read('src/server/setting-holds.js'), NOTE = 'const raw = rawOf(next || {}, key); if (!AS.holdIsLive(holds[key], raw))';
        ok('§5g (3) setup: the write note\'s raw liveness is in setting-holds once', SH3.split(NOTE).length === 2);
        const mn = mutantModule('src/server/setting-holds.js', [[NOTE, 'const raw = valueIn(next || {}, key); if (!AS.holdIsLive(holds[key], raw))']]);
        if (!mn.err) { const c = await noteRun(mn.mod); ok('§5g (3) CONTROL: the write note through valueIn reads the blank as 0 = the hold\'s value — the hold stays live under the person\'s «nothing» — RED', c.listed === 1, JSON.stringify(c)); } else ok('§5g (3) CONTROL: the note copy loads', false, mn.err);
        const bootRun = async (shmod = null) => {
          const pg = await pageRun(freshPR('page-boot'), { shmod, file: { [HOURK]: '' }, holds: { [HOURK]: { key: HOURK, value: 0, before: 30, untilAt: 1_900_000_000_000 + 3600e3, at: 1_900_000_000_000 - 60e3 } } });
          await pg.H.start();
          const listed = pg.H.list().length, d = pg.disk(); await pg.close(); return { listed, d };
        };
        const br = await bootRun();
        ok('§5g (3) OWED: the BOOT reads the RAW value — a blank row under a hold at 0 (cleared while the hub was down) ends the hold; nothing is written over the blank', br.listed === 0 && br.d[HOURK] === '' && refusedSaid(br.d), JSON.stringify(br));
        const START = '      const cur = rawOf(readSettings() || {}, k);';
        ok('§5g (3) setup: the boot\'s raw liveness is in setting-holds once', SH3.split(START).length === 2);
        const mb = mutantModule('src/server/setting-holds.js', [[START, '      const cur = presentOf(k);']]);
        if (!mb.err) { const c = await bootRun(mb.mod); ok('§5g (3) CONTROL: the boot through presentOf reads the blank as 0 = the hold\'s value — the hold is re-armed and would write 30 back at its moment — RED', c.listed === 1, JSON.stringify(c)); } else ok('§5g (3) CONTROL: the boot copy loads', false, mb.err);
        const c1 = await pageRun(freshPR('page-cred3'), { file: { [HOURK]: 30, 'ui.someRow': 1 } }); const s1 = await c1.send('POST', { [HOURK]: null, 'ui.someRow': 1 }, { authorization: 'Bearer agent-key' }); const d1 = c1.disk(); await c1.close();
        const c2 = await pageRun(freshPR('page-cred4'), { file: { [HOURK]: '', 'ui.someRow': 1 } }); const s2 = await c2.send('POST', { [HOURK]: 50, 'ui.someRow': 1 }, { authorization: 'Bearer agent-key' }); const d2 = c2.disk(); await c2.close();
        ok('§5g (3) OWED: a credentialed whole-file write that really CHANGES a cap is still the owner\'s only — a number cleared (30 → nothing) and a blank set to a number (nothing → 50) are each refused 403, the file untouched',
          s1 === 403 && d1[HOURK] === 30 && s2 === 403 && d2[HOURK] === '', JSON.stringify({ s1, d1, s2, d2 }));
      }
      // CURE 2 (with it): the config import's blank rule (its RED copy), and a credentialed whole-file POST that re-sends an OLD stored null
      {
        const importOf = (settings) => ({ file: { app: 'vibespace-config', sections: { settings } }, sections: ['settings'] });
        const imp = await pageRun(freshPR('page-import')); const st = await imp.send('POST', importOf({ [HOURK]: null, 'ui.someRow': 1 }), undefined, '/api/config/import'); const di = imp.disk(); await imp.close();
        ok('§5g (3) CURE 2: a config import whose settings part clears the hour cap stores it BLANK — refused and said', st === 200 && di[HOURK] === '' && refusedSaid(di), JSON.stringify({ st, di }));
        const PSRC2 = read('src/routes/persistence.js'), IMPB = "typeof file.sections.settings === 'object') blankCaps(file.sections.settings);";
        ok('§5g (3) setup: the import\'s blank rule is in persistence.js once', PSRC2.split(IMPB).length === 2);
        const mi = mutantModule('src/routes/persistence.js', [[IMPB, "typeof file.sections.settings === 'object') void 0;"]]);
        if (!mi.err) { const g = await pageRun(mi.mod); await g.send('POST', importOf({ [HOURK]: null }), undefined, '/api/config/import'); const dg = g.disk(); await g.close(); ok('§5g (3) CONTROL: without the import\'s blank the cleared cap is imported NULL — the leg above goes red', dg[HOURK] === null, JSON.stringify(dg)); } else ok('§5g (3) CONTROL: the import copy loads', false, mi.err);
        const cp = await pageRun(freshPR('page-cred'), { file: { [HOURK]: null, 'ui.someRow': 1 } });
        const sc = await cp.send('POST', { [HOURK]: null, 'ui.someRow': 3 }, { authorization: 'Bearer agent-key' }); const dc = cp.disk(); await cp.close();
        ok('§5g (3) CURE 2: a credentialed whole-file POST that re-sends the OLD stored null of a cap is not refused for a row it did not change (a cap\'s null and blank are the same «nothing»)', sc === 200 && dc['ui.someRow'] === 3 && (dc[HOURK] === '' || dc[HOURK] === null), JSON.stringify({ sc, dc }));
        const SAME = "(JSON.stringify(cur[k]) === JSON.stringify(nxt[k]) || (nothing(k, cur[k]) && nothing(k, nxt[k])))";
        ok('§5g (3) setup: the owner check\'s null ≡ blank rule is in persistence.js once', PSRC2.split(SAME).length === 2);
        const ms = mutantModule('src/routes/persistence.js', [[SAME, 'JSON.stringify(cur[k]) === JSON.stringify(nxt[k])']]);
        if (!ms.err) { const g = await pageRun(ms.mod, { file: { [HOURK]: null, 'ui.someRow': 1 } }); const s2 = await g.send('POST', { [HOURK]: null, 'ui.someRow': 3 }, { authorization: 'Bearer agent-key' }); await g.close(); ok('§5g (3) CONTROL: with null and blank told apart, that POST is refused 403 for a spend row nobody touched — RED', s2 === 403, String(s2)); } else ok('§5g (3) CONTROL: the owner-check copy loads', false, ms.err);
      }
    }
    const m = mutantModule('src/spend-authorizer.js', [["      if (!Number.isFinite(n) || n < 0) { unset.push(field); return 0; }\n", "      if (!Number.isFinite(n) || n < 0) return v === null || (typeof v === 'string' && !v.trim()) ? 0 : dflt;\n"]]);
    ok('§5g (3) CONTROL: the release\'s reading re-applied to a copy (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const Lm = m.mod.budgetLimits((k) => (k === 'spend.unattendedPerIdentityHour' ? null : undefined));
      const vm = m.mod.authorizeUnattendedSpend({ reason: 'auto-resume', identity: IDg, state: m.mod.emptyBudget(), limits: Lm });
      const Lg = m.mod.budgetLimits((k) => (k === 'spend.unattendedPerIdentityHour' ? 'abc' : undefined));
      ok('§5g (3) CONTROL: with it, a null cap is a SILENT 0 — «switched off … its limit is 0», no «no cap is set» — and a text cap reads the DEFAULT 30 (the release) — RED', Lm.perIdentityHour === 0 && !Lm.unset && /switched off/.test(m.mod.refusalI18n(vm, {}).text.key) && !/no cap is set/.test(vm.detail) && Lg.perIdentityHour === 30);
    }
  }
  // ── (2) A CAP LOWERED BELOW WHAT ALREADY WAITS ──
  for (const lowered of [2, 0]) {
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 5 });
    const t0 = W.now();
    for (let i = 0; i < 5; i++) W.send('c1', 'l' + i);
    W.settings['spend.unattendedPerIdentityHour'] = lowered;
    W.q.rejudge();   // what the settings write's listener calls (wired below)
    const c0 = W.counts();
    W.setClock(t0 + 3 * HOUR); for (let i = 0; i < 5; i++) { W.runNext('c1'); W.adv(MIN); }
    const keep = lowered;
    ok(`§5g (2) cap 5 → ${lowered} with 5 waiting: the ${5 - keep} NEWEST are taken back out at once, their words ride the stash (never dropped), their units returned — the hour counts ${keep}`,
      JSON.stringify(W.stash.slice().sort()) === JSON.stringify(['l0', 'l1', 'l2', 'l3', 'l4'].slice(keep)) && c0.hour === keep && c0.promisedHour === keep && W.backs.filter((r) => r === QWm.PULL_WHY).length === 5 - keep, JSON.stringify({ stash: W.stash, hour: c0.hour, backs: W.backs }));
    ok(`§5g (2) …the frames left run inside the cap: worst hour of billed turns ${keep} (the release: 5)`, W.maxIn(HOUR) === keep && W.ran.length === keep, JSON.stringify({ worst: W.maxIn(HOUR), ran: W.ran.length }));
  }
  {
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 5 }, { serves: false });
    for (let i = 0; i < 3; i++) W.send('c1', 'n' + i);
    W.settings['spend.unattendedPerIdentityHour'] = 1;
    for (let i = 0; i < 5; i++) W.q.rejudge();
    const unheld = W.inbox.filter((x) => x.i18n && /could not be held/.test(x.i18n.text.key));
    ok('§5g (2) an agent that serves no «remove»: nothing is lost or returned; said ONCE per frame in the journal, and ONCE per frame WHERE THE PERSON LOOKS (a For-you line: it may run past the limit) — five sweeps, two lines',
      W.stash.length === 0 && W.counts().promisedHour === 3 && W.logs.filter((l) => /could not be asked back out now/.test(l)).length === 2 && unheld.length === 2 && unheld.every((x) => /past the limit/.test(x.i18n.text.key)), JSON.stringify({ logs: W.logs, inbox: W.inbox.map((x) => x.text) }));
    ok('§5g (2) PACED: five sweeps ask each frame ONCE (2 asks — never one sidecar read per frame per sweep)', W.pulls.length === 2, JSON.stringify(W.pulls));
    const { dictEntries } = await import('./i18n-extract.mjs');
    const ZH = new Map([...dictEntriesOnce(dictEntries, read('src/lib/i18n-zh.js'))].map((e) => [e.key, e.value])), JA = new Map([...dictEntriesOnce(dictEntries, read('src/lib/i18n-ja.js'))].map((e) => [e.key, e.value]));
    const UK = [...A.UNHELD_WORDS.cap, ...A.UNHELD_WORDS.ledger, A.UNHELD_WORDS.door];
    ok('§5g (2) …the For-you line\'s words are in zh and ja', UK.every((k) => ZH.has(k) && JA.has(k)), UK.filter((k) => !ZH.has(k) || !JA.has(k)).join(' | '));
  }
  // THE WIRING: a settings write reaches the REAL ladder (server.js's own wiring: the verdict rides waitingReservations),
  // which writes the wrapper's own remove verb for the bound item; the wrapper's answer is HELD in the stash — said as the
  // spending ceiling's, and never evicted by the stash's cap (30) however many wait
  const wiring = async ({ gMod = guardMod, dMod = deliverMod } = {}) => {
    const dataDir = tmpdir('vs-spend-5g-wire-');
    fs.mkdirSync(path.join(dataDir, 'session-buffers'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'session-buffers', 'w1.json'), JSON.stringify({ caps: CURRENT_WRAPPER_CAPS }));
    const settings = { 'spend.unattendedPerIdentityHour': 4 };
    const guard = gMod.create({ dataDir, serverSetting: (k) => settings[k], identityOf: () => IDg, getUserTodos: () => null, log: () => { } });
    const frames = [];
    const S = { backend: 'codex', mode: 'chat', _webuiId: 'w1', backendSessionId: 'cid-1', _isStreaming: true, pty: { write: (x) => frames.push(String(x)) }, name: 'busy' };
    const deliver = dMod.create({
      dataDir, activeSessions: new Map([['w1', S]]),
      peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) },
      getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, emitPeerCard: () => { },
      authorizeSpend: (req) => guard.authorize(req), noteSpend: (rec) => guard.note(rec), releaseSpend: (rec) => guard.release(rec),
      reservationState: (rid) => guard.reservationState(rid), waitingReservations: () => guard.waitingReservations(), log: () => { },
    });
    for (let i = 0; i < 30; i++) deliver.stashFor('cid-1', { source: 'agent', kind: 'peer', fromName: 'peer', text: 'older ' + i });   // a FULL stash
    await deliver.deliverToConversation('cid-1', 'a waiting note', { kind: 'peer', spendReason: 'peer-message' });
    deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued' });
    deliver.noteQueueItems('cid-1', [{ id: 'it-9', kind: 'peer' }], { fresh: true });
    const before = frames.length;
    settings['spend.unattendedPerIdentityHour'] = 0;
    gMod.noteLimitsWritten({ perIdentityHour: 4 }, { perIdentityHour: 0 });
    const asked = frames.slice(before).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
    if (asked.length) deliver.noteHandedBack('cid-1', 'a waiting note', 'removed from the queue before it was delivered');   // the wrapper's answer (codex-events)
    const q = deliver.stashEntries('cid-1') || [];
    return { asked, guard, q, frames: frames.slice(before) };
  };
  {
    const w = await wiring();
    ok('§5g (2) WIRING: the settings write\'s signal reaches the real ladder, which writes the wrapper\'s OWN remove verb for the bound item at once',
      w.asked.length === 1 && w.asked[0].type === 'queue-op' && w.asked[0].op === 'remove' && w.asked[0].id === 'it-9', JSON.stringify(w.frames));
    const held = w.q.filter((e) => e && e.text === 'a waiting note');
    const SSh = require(path.join(REPO, 'src/stash-summary.js'));
    ok('§5g (2) …its words are HELD in the stash and SAID as the spending ceiling\'s («the spending ceiling held them»), and a FULL stash (30) drops nothing for them — 31 entries, the oldest still there',
      held.length === 1 && held[0].held && held[0].held.kind === 'spend-cap' && held[0].held.capHeld === true && SSh.HELD_WHY[SSh.heldKeyOf(held[0].held)] === 'the spending ceiling held them' && w.q.length === 31 && w.q.some((e) => e && e.text === 'older 0'), JSON.stringify({ n: w.q.length, held: held.map((e) => e.held) }));
    ok('§5g (2) WIRING: src/routes/persistence.js writeSettings sends the signal (budgetLimits before and after) on every write', /function writeSettings\(data, out = null\) \{[\s\S]{0,2200}noteLimitsWritten\(spendOf\(prev\), spend\)/.test(read('src/routes/persistence.js')));
    ok('§5g (2) WIRING: server.js wires the guard\'s waitingReservations into the ladder (its answer carries the verdict — server.js unchanged)', /waitingReservations: \(\) => spendGuard\.waitingReservations\(\)/.test(read('server.js')) && Array.isArray(w.guard.waitingReservations().overCap));
    const mg = mutantModule('src/server/spend-guard.js', [["Object.defineProperty(rids, 'overCap', { get: () => overCapNow(Date.now()) }); ", '']]);
    ok('§5g (2) CONTROL: the verdict taken off the guard\'s waitingReservations answer in a copy (the patch hit)', !mg.err && mg.hits === 1, mg.err || '');
    if (!mg.err) { const wm = await wiring({ gMod: mg.mod }); ok('§5g (2) CONTROL: with it, the settings signal writes NO remove frame — the waiting frame would run past the cap — RED', wm.asked.length === 0, JSON.stringify(wm.frames)); }
    const md = mutantModule('src/server/conversation-deliver.js', [['        if (!q[i] || q[i].ho || q[i].slot || capHeld(q[i]) || keptE(q[i]) || !pass(q[i])) { i++; continue; }', '        if (!q[i] || q[i].ho || q[i].slot || keptE(q[i]) || !pass(q[i])) { i++; continue; }'], ['    over -= q.filter((e) => capHeld(e) && !e.ho && !e.slot).length;\n', '']]);
    ok('§5g (2) CONTROL: the held words\' exemption from the stash cap removed from a copy of the ladder (the patch hit)', !md.err && md.hits === 2, md.err || '');
    if (!md.err) { const wd = await wiring({ dMod: md.mod }); ok('§5g (2) CONTROL: with it, the full stash EVICTS the oldest entry to make room — a drop — RED', wd.q.length === 30 && !wd.q.some((e) => e && e.text === 'older 0'), String(wd.q.length)); }
  }
  {   // ASKED THE MOMENT IT CAN BE: a frame the hub could not yet name (no listing) is not paused once its item binds
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 5 });
    W.sendUnbound('c1', 'u0');
    W.settings['spend.unattendedPerIdentityHour'] = 0;
    W.q.rejudge();
    const pulledBefore = W.pulls.length;
    W.q.noteQueue('c1', W.queue.c1.map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });   // its item binds now
    ok('§5g (2) a frame not yet bound when the cap drops is asked back out the MOMENT its item binds (no 60 s pause for a take-back never sent)',
      pulledBefore === 0 && W.pulls.length === 1 && W.stash.length === 1 && W.stash[0] === 'u0', JSON.stringify({ pulledBefore, pulls: W.pulls, stash: W.stash }));
    const m = mutantModule('src/server/queued-wakes.js', [['if (!fresh && !again && e.pulled && (e.pulled.asked ? e.pulled.sig === base : e.pulled.sig === seen)) continue;', 'if (!fresh && e.pulled) continue;']]);
    ok('§5g (2) CONTROL: a frame marked once never asked again, in a copy (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const Wm = mkWorld({ 'spend.unattendedPerIdentityHour': 5 }, { qMod: m.mod });
      Wm.sendUnbound('c1', 'u0'); Wm.settings['spend.unattendedPerIdentityHour'] = 0; Wm.q.rejudge();
      Wm.q.noteQueue('c1', Wm.queue.c1.map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });
      ok('§5g (2) CONTROL: with it, the frame that binds is NEVER asked — the turn may end and run it past the cap — RED', Wm.pulls.length === 0 && Wm.stash.length === 0);
    }
  }
  {   // B-3b0f × (2): the ledger unreadable after a restart — no wait can be judged, every waiting frame is held
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 5 });
    for (let i = 0; i < 3; i++) W.send('c1', 'r' + i);
    W.restart({ tornLedger: true });
    W.q.noteQueue('c1', W.queue.c1.map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });   // the attach's queue-resync
    for (let i = 0; i < 5; i++) W.q.rejudge();
    ok('§5g (2) × B-3b0f: after a restart the ledger cannot be read — every frame still waiting is taken back out (held, never run uncounted), and said with THAT reason («the record … cannot be read»), never «a spending cap is now lower»',
      W.g.snapshot().ledgerUnreadable !== null && JSON.stringify(W.g.waitingOverCap()) === '["*"]' && W.stash.length === 3 && W.queue.c1.length === 0 && W.backs.filter((r) => r === QWm.PULL_WHY_LEDGER).length === 3 && !W.backs.includes(QWm.PULL_WHY), JSON.stringify({ stash: W.stash, left: W.queue.c1.length, backs: W.backs }));
    ok('§5g (2) × B-3b0f PACED: five more sweeps while the ledger stays unreadable ask nothing again (3 asks in all)', W.pulls.length === 3, JSON.stringify(W.pulls));
  }
  // ── r2 (the follow-up's own reader): the SHOULDs of a few lines ──
  {   // S2 — AN ASK THAT DID NOT LAND is asked ONCE more: a newer listing still holds the item, a pause after the ask
    const runLost = (qMod = QWm) => {
      const W = mkWorld({ 'spend.unattendedPerIdentityHour': 5 }, { qMod });
      W.send('c1', 'k0'); W.send('c1', 'k1');
      W.pull = (cid, item) => { W.pulls.push(item); return true; };   // the wrapper never reads it: the item stays listed
      W.settings['spend.unattendedPerIdentityHour'] = 1;
      W.q.rejudge();
      for (let i = 0; i < 4; i++) W.q.rejudge();   // paced: no second ask inside the pause
      const inPause = W.pulls.length;
      W.adv(2 * MIN); W.q.noteQueue('c1', W.queue.c1.map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });   // a newer listing still holds it
      W.q.rejudge();
      const again = W.pulls.length;
      W.adv(2 * MIN); W.q.noteQueue('c1', W.queue.c1.map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });
      for (let i = 0; i < 3; i++) W.q.rejudge();
      return { inPause, again, after: W.pulls.length };
    };
    const r = runLost();
    ok('§5g (2) r2 AN ASK THAT DID NOT LAND (the wrapper never read it): paced inside the pause, asked ONCE more when a newer listing still holds the item — never at every sweep after',
      r.inPause === 1 && r.again === 2 && r.after === 2, JSON.stringify(r));
    const m = mutantModule('src/server/queued-wakes.js', [['      const again = !!(e.pulled && e.pulled.asked && !e.pulled.again', '      const again = false && !!(e.pulled && e.pulled.asked && !e.pulled.again']]);
    ok('§5g (2) r2 CONTROL: the second ask removed from a copy (the follow-up\'s first form) (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) { const rm = runLost(m.mod); ok('§5g (2) r2 CONTROL: with it, a lost ask is NEVER asked again — the frame runs at the turn end past the lowered cap — RED', rm.again === 1, JSON.stringify(rm)); }
  }
  {   // S3 — while the ledger cannot be read, the old-agent line still NAMES the conversation the frame waits behind; one item per frame
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 5 }, { serves: false });
    for (let i = 0; i < 2; i++) {
      const v = W.g.authorize({ reason: 'peer-message', identity: IDg, now: W.now() });
      const e = W.q.noteWritten('c1', { charged: { reason: 'peer-message', identity: IDg, hold: v.hold }, text: 'w' + i, holder: '4242', waitKey: 'claude:c1', peerName: 'release-notes' });
      W.q.answer(e.id, { mode: 'queued' });
      (W.queue.c1 = W.queue.c1 || []).push({ id: 'it-' + e.id, text: 'w' + i });
    }
    W.restart({ tornLedger: true });
    W.q.noteQueue('c1', W.queue.c1.map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });
    for (let i = 0; i < 3; i++) W.q.rejudge();
    const lines = W.inbox.filter((x) => x.i18n && /could not be held/.test(x.i18n.text.key));
    ok('§5g (2) r2 THE LEDGER UNREADABLE: the old-agent line still names the conversation the frame waits behind («release-notes», filed under its key), ONE item per frame (its own itemKey — never merged by its words)',
      lines.length === 2 && lines.every((x) => x.key === 'claude:c1' && x.i18n.text.params && x.i18n.text.params.conversation === 'release-notes' && /record of turns nobody typed cannot be read/.test(x.i18n.text.key)) && new Set(lines.map((x) => x.itemKey)).size === 2 && lines.every((x) => /^spend-unheld:/.test(x.itemKey || '')),
      JSON.stringify(lines.map((x) => ({ key: x.key, itemKey: x.itemKey, p: x.i18n && x.i18n.text.params }))));
  }
  {   // (1) THE RIGHT REASON, WHOLE — the hand-over card says the ledger's reason for what the ledger held, never the cap's
    const SSh = require(path.join(REPO, 'src/stash-summary.js'));
    const k = SSh.heldKeyOf({ kind: 'spend-cap', why: 'ledger-unreadable', capHeld: true }), kc = SSh.heldKeyOf({ kind: 'spend-cap', why: 'cap-lowered', capHeld: true });
    const { dictEntries } = await import('./i18n-extract.mjs');
    const ZH = new Map([...dictEntriesOnce(dictEntries, read('src/lib/i18n-zh.js'))].map((e) => [e.key, e.value])), JA = new Map([...dictEntriesOnce(dictEntries, read('src/lib/i18n-ja.js'))].map((e) => [e.key, e.value]));
    ok('§5g (2) r2 THE RIGHT REASON ON THE CARD: what the ledger held says «the record of turns nobody typed could not be read» (zh/ja); a lowered cap keeps «the spending ceiling held them»',
      k === 'spend-ledger' && /record of turns nobody typed could not be read/.test(SSh.HELD_WHY[k]) && SSh.HELD_WHY[kc] === 'the spending ceiling held them' && ZH.has(SSh.HELD_WHY[k]) && JA.has(SSh.HELD_WHY[k]), JSON.stringify({ k, kc }));
    // B-ef83 smalls: what a restart's overlap held (another process kept the ledger) says THAT, never the cap's words
    const kh = SSh.heldKeyOf({ kind: 'spend-cap', why: 'ledger-held-elsewhere' });
    ok('§5g B-ef83 THE RIGHT REASON ON THE CARD: what another process\'s ledger held says «another VibeSpace process on this data folder kept the record…» (zh/ja), never «the spending ceiling held them»',
      kh === 'spend-held' && /another VibeSpace process on this data folder kept the record of turns nobody typed/.test(SSh.HELD_WHY[kh]) && ZH.has(SSh.HELD_WHY[kh]) && JA.has(SSh.HELD_WHY[kh]), JSON.stringify({ kh }));
    // B-ef83 r1648: a hold for a lock that cannot be written says THAT — on the card, in the agent's tail; the refusal's words and its door
    const kl = SSh.heldKeyOf({ kind: 'spend-cap', why: 'ledger-lock-unwritable' });
    ok('§5g B-ef83 r1648 the card for a frame held because the lock cannot be written: «VibeSpace could not write the lock of its record…» (zh/ja)', kl === 'spend-lock' && /could not write the lock of its record of turns nobody typed/.test(SSh.HELD_WHY[kl]) && ZH.has(SSh.HELD_WHY[kl]) && JA.has(SSh.HELD_WHY[kl]), JSON.stringify({ kl }));
    const JMt = require(path.join(REPO, 'src/job-model.js'));
    const tail = (why) => JMt.notifTailSentence([{ jobId: 'jb-1', text: 'x', ts: 1, held: { kind: 'spend-cap', why } }]);
    ok('§5g B-ef83 r1648 the AGENT\'s tail says the true cause of a spend hold (another process\'s ledger / the lock / the unreadable record), the ceiling only for the ceiling',
      /another VibeSpace process on this data folder kept the record/.test(tail('ledger-held-elsewhere')) && /could not write the lock of its record/.test(tail('ledger-lock-unwritable')) && /record of turns nobody typed could not be read/.test(tail('ledger-unreadable')) && /held by the spending ceiling/.test(tail('cap-lowered')) && !/spending ceiling/.test(tail('ledger-held-elsewhere')),
      JSON.stringify([tail('ledger-held-elsewhere'), tail('ledger-lock-unwritable'), tail('cap-lowered')]));
    const SAw = require(path.join(REPO, 'src/spend-authorizer.js'));
    const vLk = SAw.authorizeUnattendedSpend({ reason: 'auto-resume', identity: { key: 'k', name: 'K' }, state: SAw.emptyBudget(), ledger: { lockUnwritable: true, error: 'EACCES' } });
    const iLk = SAw.refusalI18n ? SAw.refusalI18n({ ...vLk, reason: 'auto-resume' }, { sessionName: 'c1' }) : null;
    ok('§5g B-ef83 r1648 THE TRUE REASON: a lock nobody holds and this process cannot write refuses by ledger-lock-unwritable (its code), its words and its door «lock» translated (zh/ja)',
      vLk.ok === false && vLk.why === 'ledger-lock-unwritable' && /EACCES/.test(String(vLk.detail)) && !!iLk && ZH.has(iLk.text.key) && JA.has(iLk.text.key) && /cannot write the lock of its record/.test(iLk.text.key) && read('src/spend-authorizer.js').includes("'ledger-lock-unwritable': 'lock'") && !!SAw.DOOR_WORDS && ZH.has(SAw.DOOR_WORDS.lock) && JA.has(SAw.DOOR_WORDS.lock),
      JSON.stringify({ why: vLk.why, detail: vLk.detail, key: iLk && iLk.text && iLk.text.key }));
    // r1801 (3): a HAND-OVER refused for the lock says THAT — never the ceiling, never a raw code (zh/ja); and the lockread card + tail
    const howW = (why) => SSh.handOverRefusalWords({ code: 'spend_refused', why }, (s) => s);
    const hU = howW('ledger-lock-unwritable'), hR = howW('ledger-lock-unreadable');
    ok('§5g B-ef83 r1801 (3) the hand-over refused for the lock has its OWN sentence (cannot write it / is there and cannot be read), never the ceiling\'s or a raw code; zh/ja',
      !!hU && /cannot write the lock of its record/.test(hU.text) && !!hR && /is there and cannot be read/.test(hR.text) && !/spend ceiling|ledger-lock/.test(hU.text + hR.text) && ZH.has(hU.text) && JA.has(hU.text) && ZH.has(hR.text) && JA.has(hR.text), JSON.stringify([hU && hU.text, hR && hR.text]));
    const kr = SSh.heldKeyOf({ kind: 'spend-cap', why: 'ledger-lock-unreadable' });
    ok('§5g B-ef83 r1801 (1) the card and the agent\'s tail for a hold by an unreadable lock say THAT (zh/ja)', kr === 'spend-lockread' && ZH.has(SSh.HELD_WHY[kr]) && JA.has(SSh.HELD_WHY[kr]) && /was there and could not be read/.test(tail('ledger-lock-unreadable')), JSON.stringify({ kr, tail: tail('ledger-lock-unreadable') }));
    // r1648 (d): the usage meter's note — its sentence for both states (zh/ja), nothing when there is nothing; and the payload carries it
    const USl = await import(path.join(REPO, 'src/lib/usage-source.js'));
    const nRef = USl.spendLedgerNote({ state: 'refused', error: 'EACCES' }), nUnl = USl.spendLedgerNote({ state: 'unlocked', error: 'EROFS' });
    ok('§5g B-ef83 r1648 (d) THE METER\'S NOTE: «Turns nobody typed are held — … (EACCES) …» / «… counted without the lock … (EROFS) …», none without a state; both sentences translated',
      /^Turns nobody typed are held — VibeSpace cannot write the lock of their record \(EACCES\)/.test(String(nRef)) && /^Turns nobody typed are counted without the lock of their record — the data folder refuses it \(EROFS\)/.test(String(nUnl)) && USl.spendLedgerNote(null) === null
        && ZH.has('Turns nobody typed are held — VibeSpace cannot write the lock of their record ({code}); they start again by themselves once it can') && JA.has('Turns nobody typed are counted without the lock of their record — the data folder refuses it ({code}); VibeSpace asks again every minute'),
      JSON.stringify([nRef, nUnl]));
    { const nUr = USl.spendLedgerNote({ state: 'unreadable', error: 'EACCES' });
      ok('§5g B-ef83 r1801 (1) the meter\'s note for a lock that is there and cannot be read (zh/ja)', /^Turns nobody typed are held — the lock of their record is there and cannot be read \(EACCES\)/.test(String(nUr)) && ZH.has('Turns nobody typed are held — the lock of their record is there and cannot be read ({code}); they start again by themselves once it reads') && JA.has('Turns nobody typed are held — the lock of their record is there and cannot be read ({code}); they start again by themselves once it reads'), String(nUr)); }
    {
      const { setupUsage } = require(path.join(REPO, 'src/usage-routes.js'));
      const tmpU = tmpdir('vs-spend-5g-usage-'), cacheU = path.join(tmpU, 'usage-cache'); fs.mkdirSync(cacheU, { recursive: true });
      const routesU = {};
      setupUsage({ app: { get: (pt, h) => { routesU[pt] = h; }, post() { }, locals: {} }, accounts: { list: () => ({ accounts: [] }), decisionList: () => ({ accounts: [] }), signinFactsSettled: async () => ({ since: 0, facts: new Map() }), displayReaderOf: () => null, subscriptionStatus: () => ({ loggedIn: false }), codexGlobalStatus: () => ({ loggedIn: false }) },   // B-360d (line 228): the stand-in carries the DECISION road in the real store's shapes (test-usage-link's, d229032f4)
        activeSessions: new Map(), serverSetting: () => null, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: path.join(tmpU, 'usage.json'), USAGE_CACHE_DIR: cacheU,
        CODEX_SESSIONS_DIR: path.join(tmpU, 'cx'), META_DIR: path.join(tmpU, 'meta'), AVAILABLE_MODELS: { claude: [] }, BUFFERS_DIR: path.join(tmpU, 'buf'), spendGuard: { ledgerNotice: () => ({ state: 'refused', error: 'EACCES', since: 1 }) } });
      const payU = await new Promise((resolve) => routesU['/api/usage']({}, { json: resolve }));
      ok('§5g B-ef83 r1648 (d) /api/usage carries the guard\'s ledger state (spendLedger) — the meter\'s note reads it; server.js hands the guard on its EXISTING setupUsage line',
        !!payU && !!payU.spendLedger && payU.spendLedger.state === 'refused' && /setupUsage\(\{ app, accounts, hosts, spendGuard, usageHistory,/.test(read('server.js')) && /spendLedgerNote\(this\._spendLedger, \{ t \}\)/.test(read('src/lib/usage-meter.js')),
        JSON.stringify(payU && payU.spendLedger));
    }
  }
  {   // S1 — ONLY A WRITE THAT MOVED THE LIMITS re-judges (an autosave of any other row asks nothing back out)
    const runSig = (gm) => {
      let calls = 0;
      const off = gm.onLimitsWritten(() => { calls++; });
      const L1 = A.budgetLimits((k) => ({ 'spend.unattendedPerIdentityHour': 5 })[k]), L1b = A.budgetLimits((k) => ({ 'spend.unattendedPerIdentityHour': 5 })[k]), L2 = A.budgetLimits((k) => ({ 'spend.unattendedPerIdentityHour': 2 })[k]);
      gm.noteLimitsWritten(L1, L1b); const same = calls;
      gm.noteLimitsWritten(L1, L2); const moved = calls;
      off();
      return { same, moved };
    };
    const r = runSig(guardMod);
    ok('§5g (2) r2 ONLY A MOVE RE-JUDGES: a settings write that leaves the limits as they were signals nothing; one that moves them signals', r.same === 0 && r.moved === 1, JSON.stringify(r));
    const m = mutantModule('src/server/spend-guard.js', [['  try { if (prev && next && JSON.stringify(prev) === JSON.stringify(next)) return; } catch { }\n', '']]);
    ok('§5g (2) r2 CONTROL: the move test removed from a copy (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) { const rm = runSig(m.mod); ok('§5g (2) r2 CONTROL: with it, every settings write re-judges every waiting frame — RED', rm.same === 1, JSON.stringify(rm)); }
  }
  {
    const m = mutantModule('src/server/queued-wakes.js', [["    if (!verdict) return 0;\n    let rids = [];", "    if (true) return 0;\n    let rids = [];"]]);
    ok('§5g (2) CONTROL: the re-judge removed from a copy of queued-wakes (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const W = mkWorld({ 'spend.unattendedPerIdentityHour': 5 }, { qMod: m.mod });
      const t0 = W.now();
      for (let i = 0; i < 5; i++) W.send('c1', 'l' + i);
      W.settings['spend.unattendedPerIdentityHour'] = 2; W.q.rejudge();
      W.setClock(t0 + 3 * HOUR); for (let i = 0; i < 5; i++) { W.runNext('c1'); W.adv(MIN); }
      ok('§5g (2) CONTROL: with it, 5 run in one hour at cap 2 (the reader\'s d8 ⑦) — RED', W.maxIn(HOUR) === 5 && W.stash.length === 0, String(W.maxIn(HOUR)));
    }
  }
  // ── (1) A FRAME THE HUB GAVE UP ON ──
  {   // ③b with the take-back: aged out at 7 days while its agent still lists it ⇒ taken back out, its words kept, it never runs
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 2 });
    const t0 = W.now(); W.send('c1', 'z');
    W.setClock(t0 + 7 * DAY + SEC); W.q.ageOut();
    W.adv(MIN); W.runNext('c1');
    ok('§5g (1) AGED OUT while its agent still lists it: taken back out at once — its words ride the stash, it never runs, nothing is left watched',
      W.ran.length === 0 && W.stash.length === 1 && W.stash[0] === 'z' && W.q.goneFor('c1').length === 0 && W.queue.c1.length === 0, JSON.stringify({ ran: W.ran.length, stash: W.stash, gone: W.q.goneFor('c1') }));
  }
  const scene3b = (opts) => {   // the reader's d8 ③b, with an agent that cannot take it back: it runs — counted where it ran
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 2 }, opts);
    const t0 = W.now(); W.send('c1', 'z');
    W.setClock(t0 + 7 * DAY + SEC); W.q.ageOut();   // its unit counted where the hub stopped waiting…
    W.adv(2 * HOUR); const s1 = W.spend();          // …two hours later its agent's turn ends:
    W.adv(MIN); W.runNext('c1'); W.adv(MIN); const s2 = W.spend(); const s3 = W.spend();
    return { W, s1, s2, s3 };
  };
  {
    const { W, s1, s2, s3 } = scene3b({ serves: false });
    ok('§5g (1) AGED OUT, no take-back (the reader\'s ③b): it runs two hours after the give-up and is COUNTED WHERE IT RAN — the next spend is refused, worst hour 2 at cap 2 (the release: 3)',
      s1 === true && s2 === 'hour-cap' && s3 === 'hour-cap' && W.maxIn(HOUR) === 2 && W.counts().hour === 2 && /ran in its agent after all — counted where it ran/.test(W.logs.join('\n')), JSON.stringify({ s1, s2, s3, worst: W.maxIn(HOUR), hour: W.counts().hour }));
  }
  {   // an UNBOUND frame (no queue item the hub could name) aged out: nothing can watch it — its unit is counted where the hub stopped
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 2 });
    const t0 = W.now(); W.sendUnbound('c1', 'q');
    W.setClock(t0 + 7 * DAY + SEC);
    const before = W.counts().hour;
    W.q.ageOut();
    ok('§5g (1) an UNBOUND frame aged out is COUNTED where the hub stopped waiting (its 7-day stamp counted in no window) — it may still run',
      before === 0 && W.counts().hour === 1 && W.q.goneFor('c1').length === 0, JSON.stringify({ before, after: W.counts().hour }));
    const m = mutantModule('src/server/queued-wakes.js', [["      if (!live(e) || !e.reserved) continue;\n      // idempotent by its id", "      continue;\n      // idempotent by its id"]]);
    ok('§5g (1) CONTROL: the count at the give-up removed from a copy (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const Wm = mkWorld({ 'spend.unattendedPerIdentityHour': 2 }, { qMod: m.mod });
      const tm = Wm.now(); Wm.sendUnbound('c1', 'q'); Wm.setClock(tm + 7 * DAY + SEC); Wm.q.ageOut();
      ok('§5g (1) CONTROL: with it, the aged-out frame is counted NOWHERE (0 this hour) — RED', Wm.counts().hour === 0);
    }
  }
  {
    const JL = await import(path.join(REPO, 'src/lib/jobs-layout.js'));
    const { dictEntries } = await import('./i18n-extract.mjs');
    const ZH = new Map([...dictEntriesOnce(dictEntries, read('src/lib/i18n-zh.js'))].map((e) => [e.key, e.value])), JA = new Map([...dictEntriesOnce(dictEntries, read('src/lib/i18n-ja.js'))].map((e) => [e.key, e.value]));
    const fill = (str, p) => String(str).replace(/\{(\w+)\}/g, (mm, x) => (p && p[x] !== undefined ? String(p[x]) : mm));
    const words = JL.heldText({ total: 2, byConversation: { c: { count: 2, reason: { kind: 'spend-cap', why: 'hour-cap', cap: 0, capUnset: true, identity: 'G' }, kinds: { 'spend-cap': 2 } } } }, { t: fill, cid: 'c' });
    const zero = JL.heldText({ total: 2, byConversation: { c: { count: 2, reason: { kind: 'spend-cap', why: 'hour-cap', cap: 0, identity: 'G' }, kinds: { 'spend-cap': 2 } } } }, { t: fill, cid: 'c' });
    const jobs = read('src/jobs.js');
    ok('§5g (3) Background Work\'s held line says an EMPTY cap as itself («no limit is set … — set a number»), never «hourly ceiling (0)»; a real 0 still says (0); the held record carries the flag; zh / ja',
      /no limit is set for turns nobody typed — set a number/.test(words) && !/ceiling \(0\)/.test(words) && /ceiling \(0\)/.test(zero) && /if \(r\.capUnset === true\) out\.capUnset = true;/.test(jobs) && ZH.has('no limit is set for turns nobody typed — set a number') && JA.has('no limit is set for turns nobody typed — set a number'), words);
  }
  const scene4 = (opts) => {   // the reader's d8 ④: the hub restarts, reads the holder dead (it is alive), then the agent re-states its queue
    const W = mkWorld({ 'spend.unattendedPerIdentityHour': 3 }, opts);
    const t0 = W.now();
    for (let i = 0; i < 3; i++) W.send('c1', 'b' + i);
    W.restart();
    const settled = W.q.bootSettle('c1', { alive: () => false, converted: (id) => W.g.reservationState(id), stash: (pe, w) => W.stash.push(w.text) });
    W.q.noteQueue('c1', W.queue.c1.map((x) => ({ id: x.id, kind: 'peer' })), '4242', { fresh: true });   // the attach's queue-resync
    W.setClock(t0 + 2 * HOUR); const spent = (() => { let n = 0; while (n < 10 && W.spend() === true) n++; return n; })();
    for (let i = 0; i < 3; i++) { W.runNext('c1'); W.adv(MIN); }
    return { W, settled, spent };
  };
  {
    const { W, settled, spent } = scene4({});
    ok('§5g (1) JUDGED GONE AT BOOT, alive after all (the reader\'s ④): its re-stated queue lists the three ⇒ each taken back out — none runs; the words wait ONCE (the three marked copies, never six)',
      JSON.stringify(settled) === JSON.stringify(['unknown', 'unknown', 'unknown']) && W.queue.c1.length === 0 && W.ran.length === spent && spent === 3 && W.maxIn(HOUR) === 3 && W.stash.length === 3 && W.stash.every((x) => x.startsWith(QWm.REPEAT_HEAD)) && W.q.goneFor('c1').length === 0,
      JSON.stringify({ settled, ran: W.ran.length, spent, worst: W.maxIn(HOUR), stash: W.stash.length, gone: W.q.goneFor('c1').length }));
  }
  {
    const { W, spent } = scene4({ serves: false });
    ok('§5g (1) …and with an agent that cannot take them back: they run — each COUNTED WHERE IT RAN (the hour holds the three spends and the three runs, and refuses the next)',
      spent === 3 && W.counts().hour === 6 && W.spend() === 'hour-cap' && W.logs.filter((l) => /counted where it ran/.test(l)).length === 3, JSON.stringify({ spent, hour: W.counts().hour, logs: W.logs.filter((l) => /counted/.test(l)) }));
  }
  {
    const m = mutantModule('src/server/queued-wakes.js', [["    if (!e || !Array.isArray(e.bind) || !e.bind.length) return;   // no queue item known", "    if (true) return;   // no queue item known"]]);
    ok('§5g (1) CONTROL: the give-up record removed from a copy of queued-wakes (the patch hit)', !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const { W, s2 } = scene3b({ serves: false, qMod: m.mod });
      ok('§5g (1) CONTROL: with it, the frame stays counted at the give-up, two hours back — its run\'s hour is free: the next spend is allowed, worst hour 3 at cap 2 — RED', s2 === true && W.maxIn(HOUR) === 3, JSON.stringify({ s2, worst: W.maxIn(HOUR) }));
    }
    const ma = mutantModule('src/spend-authorizer.js', [['if (waitingStamp(t) || (!drain && t.end && !t.ran)) t.ran = at;', 'if (waitingStamp(t)) t.ran = at;']]);
    ok('§5g (1) CONTROL: the guard\'s «counted where it ran» for a given-up stamp removed from a copy of the authorizer (the patch hit)', !ma.err && ma.hits === 1, ma.err || '');
    if (!ma.err) {
      let st = ma.mod.noteUnattendedSpend(ma.mod.emptyBudget(), { identity: IDg, reason: 'peer-message', rid: 'qw-e', at: 1000, limits: ma.mod.BUDGET_DEFAULTS }).state;
      st = ma.mod.noteUnattendedSpend(st, { identity: IDg, reason: 'peer-message', rid: 'qw-e', ended: true, at: 2000, limits: ma.mod.BUDGET_DEFAULTS }).state;
      const runAt = 2000 + 5 * HOUR;
      const realSt = A.noteUnattendedSpend(JSON.parse(JSON.stringify(st)), { identity: IDg, reason: 'peer-message', rid: 'qw-e', carried: true, at: runAt, limits: A.BUDGET_DEFAULTS }).state;
      const mutSt = ma.mod.noteUnattendedSpend(JSON.parse(JSON.stringify(st)), { identity: IDg, reason: 'peer-message', rid: 'qw-e', carried: true, at: runAt, limits: ma.mod.BUDGET_DEFAULTS }).state;
      ok('§5g (1) CONTROL: a given-up stamp seen running 5 h later — the real guard counts it in the run\'s hour, the copy leaves it in the give-up hour (the run\'s hour free) — RED',
        A.spendCounts(realSt, IDg.key, runAt + 1).hour === 1 && ma.mod.spendCounts(mutSt, IDg.key, runAt + 1).hour === 0);
    }
  }
}

// ── §5d AUTHORIZE AND CHARGE ARE NOT ONE INSTANT (r5) ───────────────────────
// The ladder authorizes SYNCHRONOUSLY and charges after an awaited transport,
// so N deliveries dispatched in one pass all read the same pre-charge counts
// and every one of them is authorized. Reachable in production: src/jobs.js
// fires `deliverToConversation` fire-and-forget from loops over `this.jobs`
// (run-completion and the boot catch-up pass), and `/api/agent/msg/send` is a
// concurrent HTTP route into the same ladder — while the 30 s `_notifyRate`
// floor is keyed PER CONVERSATION and does not serialise across them. Nine
// conversations can sit on ONE subscription, which is what makes the identity,
// not the conversation, the thing being over-spent.
console.log('\n§5d five deliveries dispatched in one pass cannot outrun the ceiling');
{
  const CIDS = ['cid-0', 'cid-1', 'cid-2', 'cid-3', 'cid-4'];
  /** Five DISTINCT conversations, five live local sessions, ONE credential slot
   *  (`identityOf` answers the same slot for all of them), and a transport that
   *  AWAITS — the shipped rung-1 shape. */
  const mkWorld = (guardModule = guardMod, ladderModule = deliverMod, hourCap = 2, { delayMs = 25, reachable = CIDS } = {}) => {
    const dataDir = tmpdir('vs-spend-race-');
    fs.mkdirSync(path.join(dataDir, 'session-buffers'), { recursive: true });
    const settings = { 'spend.unattendedPerIdentityHour': hourCap };
    const guard = guardModule.create({
      dataDir, serverSetting: (k) => settings[k],
      identityOf: () => ({ key: 'sub-A', name: 'Sub A' }), getUserTodos: () => null, log: () => { },
    });
    const activeSessions = new Map();
    CIDS.forEach((c, i) => activeSessions.set('w' + i, { name: 'S' + i, backendSessionId: c, mode: 'chat', backend: 'claude' }));
    const posted = [];
    const deliver = ladderModule.create({
      dataDir, activeSessions,
      peerMsg: {
        // `reachable` is what has an inbox; everything else falls through every
        // rung to the STASH — the ladder's normal fallback, and the exit that
        // opens no turn at all
        findPeer: (cid) => (reachable.includes(cid) ? { socketPath: '/tmp/none-' + cid, name: 'p-' + cid } : null),
        postToPeer: async (peer) => { await tick(delayMs); posted.push(peer.name); return { ok: true }; },
        postChannelEvent: async () => ({ ok: false }),
      },
      getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, emitPeerCard: () => { },
      authorizeSpend: (req) => guard.authorize(req), noteSpend: (rec) => guard.note(rec),
      releaseSpend: (rec) => guard.release(rec), log: () => { },
    });
    const charged = () => (guard.snapshot().budget.identities['sub-A'] || []).length;
    return { guard, deliver, posted, charged };
  };
  const send = (W, cid) => W.deliver.deliverToConversation(cid, 'hi', { kind: 'peer', spendReason: 'job-notification' });

  {   // THE INCIDENT: all five dispatched before any of them settles
    const W = mkWorld();
    const rs = await Promise.all(CIDS.map((c) => send(W, c)));
    ok('§5d the ceiling holds under concurrency: 2 delivered, 3 refused by the budget',
      rs.filter((r) => r.ok).length === 2 && rs.filter((r) => r.refused === 'spend').length === 3,
      JSON.stringify(rs.map((r) => (r.ok ? r.lane : r.why))));
    ok('§5d …and exactly the delivered ones were charged (a hold is not a stamp)',
      W.charged() === 2 && W.posted.length === 2, JSON.stringify({ charged: W.charged(), posted: W.posted.length }));
    ok('§5d …and nothing is left in flight afterwards (every hold was converted or given back)',
      W.guard.snapshot().holdsOpen === 0 && W.guard.snapshot().holdsExpired === 0,
      JSON.stringify(W.guard.snapshot()).slice(0, 160));
  }
  {   // CONTROL: the SAME world, one at a time — the answer must not depend on
      // how the caller happens to schedule its deliveries
    const W = mkWorld();
    let okc = 0;
    for (const c of CIDS) if ((await send(W, c)).ok) okc++;
    ok('§5d CONTROL: sequentially the same world delivers the same 2 (concurrency is not a new policy)',
      okc === 2 && W.charged() === 2, JSON.stringify({ okc, charged: W.charged() }));
  }
  {   // NEGATIVE CONTROL: the real guard with the reservation removed
    const m = mutantModule('src/server/spend-guard.js', [[
      `    if (v.ok && key && takeHold) {
      const hold = \`h\${++holdSeq}\`;
      pending = A.reservePending(pending, { id: hold, key, at: now });
      return { ...v, hold };
    }
`, '']]);
    ok('§5d NEGATIVE CONTROL: the pre-fix guard (no hold) was really built (an unapplied patch is a green control)',
      !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const W = mkWorld(m.mod);
      const rs = await Promise.all(CIDS.map((c) => send(W, c)));
      ok('§5d NEGATIVE CONTROL: without the hold all FIVE are authorized and charged against a cap of 2',
        rs.every((r) => r.ok) && W.charged() === 5, JSON.stringify({ ok: rs.filter((r) => r.ok).length, charged: W.charged() }));
    }
  }
  {   // A DELIVERY THAT REACHES NO RUNG OPENS NO TURN — the hold comes back, or
      // the stash rung (the ladder's normal fallback) would burn the ceiling on
      // messages that were merely queued for the next injection.
      // BOTH conversations here carry a LIVE local session, so both resolve to
      // the SAME credential slot: the unreachable one is what the identity
      // dimension is being measured on, not a second bucket (the ladder charges
      // a conversation it cannot see locally to a NAMED `__unattributed__`
      // bucket, and a leg that used it would prove nothing about this one).
    const W = mkWorld(guardMod, deliverMod, 1, { reachable: ['cid-1'] });
    const r0 = await send(W, 'cid-0');
    ok('§5d a delivery that reaches no rung is not a spend (it rides the next injection)',
      r0.ok === false && !r0.refused, JSON.stringify(r0));
    ok('§5d …and its hold was given back immediately', W.guard.snapshot().holdsOpen === 0 && W.charged() === 0);
    const r1 = await send(W, 'cid-1');
    ok('§5d …so the next REAL delivery on that same slot still has its budget (cap 1, first charge)',
      r1.ok === true && W.charged() === 1, JSON.stringify({ r1: r1.ok, charged: W.charged() }));
  }
  {   // NEGATIVE CONTROL for that: the ladder with its ONE release point removed
    const m = mutantModule('src/server/conversation-deliver.js', [[
      `      if (!money.settled && charged && charged.hold && releaseSpend) {
        try { releaseSpend(charged); } catch (e) { log('[deliver] releasing the spend hold failed:', e.message); }
      }
`, '']]);
    ok('§5d NEGATIVE CONTROL: the release point was really removed from the copy',
      !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const W = mkWorld(guardMod, m.mod, 1, { reachable: ['cid-1'] });
      await send(W, 'cid-0');
      const r1 = await send(W, 'cid-1');
      ok('§5d NEGATIVE CONTROL: without it a STASHED message keeps the slot booked and the real delivery is refused',
        r1.ok === false && r1.refused === 'spend' && W.charged() === 0, JSON.stringify({ r1, charged: W.charged() }));
    }
  }
}

// ── §5e A PROBE MUST NOT HOLD, AND A WITHHELD FRAME MUST BE GIVEN BACK ──────
console.log('\n§5e the two calls that must NOT consume the budget: the probe and the confirmed steer');
{
  // ① auto-resume asks the ceiling TWICE per fire — once before its pre-fire
  // gate (so a spent budget stops us before we pay for the gate's quota probe)
  // and once after, on the identity the continue actually lands on. If the
  // first call reserved, the second would refuse its own request.
  const mkAr = (arModule = arMod) => {
    const dataDir = tmpdir('vs-spend-probe-');
    const guard = guardMod.create({
      dataDir, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 1 }[k]),
      identityOf: () => ({ key: 'sub-A', name: 'A' }), getUserTodos: () => null, log: () => { },
    });
    const sessions = new Map();
    const fired = [];
    const ar = arModule.create({
      dataDir, activeSessions: sessions, serverSetting: () => true, log: () => { },
      sendToSession: (id) => { fired.push(id); return true; },
      fireIdentity: () => ({ key: 'sub-A', name: 'A' }),
      authorizeSpend: (id, s2, identity, o) => guard.authorize({ reason: 'auto-resume', session: s2, sessionId: id, identity, hold: !!(o && o.hold) }),
      noteSpend: (id, s2, identity, hold) => guard.note({ reason: 'auto-resume', session: s2, identity, hold }),
      releaseSpend: (id, s2, hold) => guard.release({ hold }),
    });
    const s = { backend: 'claude', mode: 'chat', _webuiId: 'a1', _autoResume: true, name: 'c' };
    sessions.set('a1', s);
    ar.armIfEnabled('a1', s, Date.now() + 60_000, 'usage limit');
    ar.tick(Date.now() + 120_000);
    return { guard, fired, charged: () => (guard.snapshot().budget.identities['sub-A'] || []).length };
  };
  {
    const W = mkAr();
    await tick(40);
    ok('§5e the continue IS delivered with a cap of 1 (the pre-gate PROBE took no slot)',
      W.fired.length === 1 && W.charged() === 1, JSON.stringify({ fired: W.fired.length, charged: W.charged() }));
    ok('§5e …and the charge converted its hold rather than leaving one behind',
      W.guard.snapshot().holdsOpen === 0 && W.guard.snapshot().holdsExpired === 0);
  }
  {   // NEGATIVE CONTROL: the real auto-resume with the probe asking for a hold
    const m = mutantModule('src/server/auto-resume.js', [[
      'if (!spendOk(id, session, ident, kind, null, { hold: false })) return false;',
      'if (!spendOk(id, session, ident, kind, null, { hold: true })) return false;']]);
    ok('§5e NEGATIVE CONTROL: the probe was really made to reserve in the copy',
      !m.err && m.hits === 1, m.err || '');
    if (!m.err) {
      const W = mkAr(m.mod);
      await tick(40);
      ok('§5e NEGATIVE CONTROL: a probe that holds makes the charging call refuse its OWN request — nothing ever fires',
        W.fired.length === 0 && W.charged() === 0, JSON.stringify({ fired: W.fired.length, charged: W.charged() }));
    }
  }

  // ② the rpc rung PREDICTS a steer into a turn already running and withholds
  // the charge. The hold stays open until the wrapper answers, because the
  // frame may still become a billed turn — and it is given back only when the
  // wrapper CONFIRMS the steer.
  const mkSteer = () => {
    const dataDir = tmpdir('vs-spend-steer-hold-');
    fs.mkdirSync(path.join(dataDir, 'session-buffers'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'session-buffers', 'w1.json'), JSON.stringify({ caps: CURRENT_WRAPPER_CAPS }));
    const guard = guardMod.create({
      dataDir, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 12 }[k]),
      identityOf: () => ({ key: 'slot-A', name: 'Alpha' }), getUserTodos: () => null, log: () => { },
    });
    const S = { backend: 'codex', mode: 'chat', _webuiId: 'w1', backendSessionId: 'cid-1', _isStreaming: true, pty: { write() { } }, name: 'busy' };
    const deliver = deliverMod.create({
      dataDir, activeSessions: new Map([['w1', S]]),
      peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) },
      getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, emitPeerCard: () => { },
      authorizeSpend: (req) => guard.authorize(req), noteSpend: (rec) => guard.note(rec),
      releaseSpend: (rec) => guard.release(rec), log: () => { },
    });
    return { guard, deliver, charged: () => (guard.snapshot().budget.identities['slot-A'] || []).length };
  };
  {
    const W = mkSteer();
    await W.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    ok('§5e a predicted-free frame keeps its hold OPEN while the wrapper has not answered (it may still open a turn)',
      W.guard.snapshot().holdsOpen === 1 && W.charged() === 0, JSON.stringify(W.guard.snapshot()).slice(0, 120));
    W.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'steered' });
    ok('§5e …and a CONFIRMED steer gives it back (it opened no turn, so it must not bind the ceiling)',
      W.guard.snapshot().holdsOpen === 0 && W.charged() === 0);
  }
  {
    const W = mkSteer();
    await W.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    W.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'queued' });
    ok('§5e CONTROL: a steer that fell back to the queue is a turn — the hold becomes a CHARGE, not a release',
      W.charged() === 1 && W.guard.snapshot().holdsOpen === 0, JSON.stringify({ charged: W.charged(), open: W.guard.snapshot().holdsOpen }));
  }
  {   // A MODE-LESS ANSWER IS NOT AN ANSWER ABOUT OUR FRAME (r2 round 2) and the
      // money half must not weaken that: two of the wrapper's three `ok:false`
      // emitters describe an EARLIER message, so consuming on them made a
      // billed `thread/queue/add` free. The frame therefore keeps its hold —
      // it is STRANDED, and the backstops are the settle sweep below and the
      // guard's own TTL, never a release we were not entitled to make.
    const W = mkSteer();
    const t0 = Date.now();
    await W.deliver.deliverToConversation('cid-1', 'job', { kind: 'notification', spendReason: 'job-notification' });
    const verdict = W.deliver.settleRpcDelivery('cid-1', { ok: false, text: 'a queued item Stop dropped' });
    ok('§5e CONTROL: a mode-less answer settles nothing, so the frame is neither charged nor released',
      verdict === 'not-ours' && W.charged() === 0 && W.guard.snapshot().holdsOpen === 1,
      JSON.stringify({ verdict, charged: W.charged(), open: W.guard.snapshot().holdsOpen }));
    // …and when a later answer sweeps the stranded frame, its hold goes back
    W.deliver.settleRpcDelivery('cid-1', { ok: true, mode: 'steered', now: t0 + 121 * 1000 });
    ok('§5e …and the stranded frame\'s hold is given back the moment we KNOW it was stranded',
      W.charged() === 0 && W.guard.snapshot().holdsOpen === 0, JSON.stringify(W.guard.snapshot()).slice(0, 120));
  }
  // THE TTL IS NOT AN OPINION: it must outlive the ladder's own settle window,
  // or a frame whose wrapper answers late finds its hold already expired — and
  // it must stay far below the shortest window the caps count, or one number
  // per scope (pendingCounts) would be a second, unwindowed accounting.
  ok('§5e the hold TTL outlives the ladder\'s settle window and stays inside the shortest cap window',
    A.RESERVE_TTL_MS > 120 * 1000 && A.RESERVE_TTL_MS < A.HOUR_MS / 2, String(A.RESERVE_TTL_MS));
  // THE DEFAULT IS THE SAFE DIRECTION, and the exception is explicit. A caller
  // that says nothing about `hold` gets one — a producer added later that
  // forgets the flag over-counts for one TTL (recoverable) instead of walking
  // through the ceiling (not).
  {
    const dir = tmpdir('vs-spend-default-hold-');
    const g = guardMod.create({ dataDir: dir, serverSetting: () => undefined, getUserTodos: () => null, log: () => { } });
    const v = g.authorize({ reason: 'peer-message', identity: { key: 'k', name: 'k' } });
    ok('§5e an authorize that says nothing about holding DOES hold', v.ok === true && !!v.hold && g.snapshot().holdsOpen === 1);
    const p2 = g.authorize({ reason: 'peer-message', identity: { key: 'k', name: 'k' }, hold: false });
    ok('§5e …and only an explicit probe does not', p2.ok === true && !p2.hold && g.snapshot().holdsOpen === 1);
  }
  // …and the ONLY site that asks for a probe is the one that asks twice about
  // the same intended turn. A second `hold: false` anywhere is a producer that
  // gave itself an exemption from the ceiling, which is the whole point.
  {
    let files = [];
    try { files = trackedServerSource(); } catch { }
    const probes = [];
    for (const f of files) {
      const code = stripLineComments(read(f));
      for (const m of code.matchAll(/hold:\s*false/g)) probes.push(`${f}:${code.slice(0, m.index).split('\n').length}`);
    }
    // lane worker-dispatch verify r1 ⑤ (2026-10-02): the lane's r0 added a SECOND hold-free probe here (a dispatch asking
    // about the wake before the worker's compaction) — refuted: a compaction is a model call nobody typed, and a probe
    // that holds nothing let it run uncounted (and a 3-minute window in which the wake was still unauthorized). The
    // dispatch now authorizes the compaction WITH a hold under its own reason (peer-compact) and notes it; its only
    // hold-free call is gone, so auto-resume's pre-gate question is again the ONE probe.
    // the manager design's piece 7 (2026-11-17, lane paced-wake-retry): the SECOND judged probe — a delivery's owed wake asks the
    // guard BEFORE the resume, which sends nothing and bills nothing; the turn it then opens is the hand-over, authorized WITH a hold
    // by the ladder under the same reason (stash-handover.js handOverWake's two literal sites) — nothing runs uncounted between the
    // question and the charge, which is exactly what refuted the dispatch's probe above
    const JUDGED_PROBES = ['src/server/auto-resume.js:', 'src/server/delivery-wake.js:'];
    ok('§5e every probe in the tracked server source is a JUDGED pre-gate question — auto-resume\'s, and a delivery\'s wake before its resume (piece 7); a dispatch\'s compaction is HELD + noted under peer-compact, never probed',
      probes.length === JUDGED_PROBES.length && JUDGED_PROBES.every((j) => probes.filter((x) => x.startsWith(j)).length === 1), probes.join(', ') || 'none found');
    const sh = read('src/server/stash-handover.js');
    const wakeBody = sh.slice(sh.indexOf('async function handOverWake('), sh.indexOf('function releaseWake('));
    ok('§5e …and the turn a delivery\'s probe precedes is CHARGED: handOverWake posts through the ladder (its own authorize + hold) under the delivery\'s reason, both spelled as literals',
      /d\.deliverToConversation\(cid, frame, \{ kind: 'notification', spendReason: 'peer-message'/.test(wakeBody) && /d\.deliverToConversation\(cid, frame, \{ kind: 'notification', spendReason: 'job-notification'/.test(wakeBody) && !/hold:\s*false/.test(wakeBody));
  }

  // EVERY CHARGE THAT BUILDS ITS OWN PAYLOAD MUST CARRY THE HOLD — a census,
  // not a promise. A producer that hands `note()` an object literal without
  // `hold` leaves its own reservation open for the whole TTL, so it refuses the
  // NEXT unattended turn on that slot for three minutes: money-safe, wrong, and
  // exactly the shape `holdsExpired` counts in production but no reviewer sees.
  // (A site that forwards a `rec` the ladder built is not a payload site — the
  // hold rides inside it, which is why the rule is about literals.)
  {
    let files = [];
    try { files = trackedServerSource(); } catch { }
    // optional chaining is the real shape at the Stop nudge (`spendGuard?.note?.(`)
    const NOTE_CALL = /(?:spendGuard|guard)\s*(?:\?\.|\.)\s*note\s*(?:\?\.)?\(\s*\{|noteSpend\s*\(\s*\{/g;
    const missing = [];
    let sites = 0;
    for (const f of files) {
      const code = stripLineComments(read(f));
      for (const m of code.matchAll(NOTE_CALL)) {
        // the call's own text: from the `{` to its matching `}` (these payloads
        // are one-liners in every producer; a depth walk keeps it honest)
        let i = code.indexOf('{', m.index), depth = 0, end = i;
        for (; end < code.length; end++) {
          if (code[end] === '{') depth++;
          else if (code[end] === '}') { depth--; if (!depth) break; }
        }
        const call = code.slice(i, end + 1);
        sites++;
        if (!/\bhold\b/.test(call)) missing.push(`${f}:${code.slice(0, m.index).split('\n').length}`);
      }
    }
    ok('§5e the charge census is non-vacuous (it found every producer that builds its own payload)',
      files.length > 50 && sites >= 3, `${sites} note-payload sites in ${files.length} files`);
    ok('§5e every charge that builds its own payload carries the hold it is converting',
      missing.length === 0, missing.join(', '));
    // CONTROL: the rule can go red — the same walk over a payload without it
    const scratch = "  spendGuard?.note?.({ reason: 'stop-nudge', session: s, identity: auth && auth.identity });";
    NOTE_CALL.lastIndex = 0;
    ok('§5e CONTROL: a payload WITHOUT the hold is caught by that same rule (r4\'s shipped line, verbatim)',
      NOTE_CALL.test(scratch) && !/\bhold\b/.test(scratch));
    NOTE_CALL.lastIndex = 0;
  }

  // …and the census the guard publishes is REACHABLE: an authorization nobody
  // converts or releases must be countable, or every "holdsExpired === 0"
  // above says nothing.
  {
    const dir = tmpdir('vs-spend-hold-census-');
    const g = guardMod.create({ dataDir: dir, serverSetting: () => undefined, identityOf: () => ({ key: 'k', name: 'k' }), getUserTodos: () => null, log: () => { } });
    const t0 = Date.now();
    g.authorize({ reason: 'peer-message', identity: { key: 'k', name: 'k' }, now: t0 });
    ok('§5e CONTROL: an authorization nobody settles is OPEN…', g.snapshot().holdsOpen === 1);
    g.authorize({ reason: 'peer-message', identity: { key: 'k', name: 'k' }, now: t0 + A.RESERVE_TTL_MS + 1000 });
    ok('§5e …and past the TTL it is counted as EXPIRED, not silently forgotten',
      g.snapshot().holdsExpired === 1, JSON.stringify(g.snapshot()).slice(0, 120));
  }
}

// ── §6 THE REAL STOP-NUDGE ROUTE ────────────────────────────────────────────
console.log('\n§6 the Stop nudge: a persisted cooldown, an exit condition, and the ceiling');
{
  const dataDir = tmpdir('vs-spend-nudge-');
  const settings = { 'agents.stopNudgeStaleMinutes': 0, 'agents.stopNudgeCooldownMinutes': 30, 'spend.unattendedPerIdentityHour': 12 };
  const statuses = new Map();
  const sessions = new Map();
  let guard;
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
  const mkGuard = () => guardMod.create({
    dataDir, serverSetting: (k) => settings[k],
    identityOf: () => ({ key: 'sub-a', name: 'Alpha' }), getUserTodos: () => null, log: () => { },
  });
  guard = mkGuard();
  setupAgentRoutes({
    app, activeSessions: sessions, tasks: { list: () => [], forSession: () => [] },
    sessionStatus: { snapshot: () => ({}), get: (k) => statuses.get(k) || null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => { }, history: () => [] },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => { }, forSession: () => [] },
    sessionStatusKey: (s, id) => `claude:${id}`,
    serverSetting: (k) => settings[k],
    spendGuard: { nudgeRec: (k) => guard.nudgeRec(k), noteNudge: (k, o) => guard.noteNudge(k, o), authorize: (r) => guard.authorize(r), note: (r) => guard.note(r) },
    scheduleCtxSync: () => { }, remoteCtxBaseFor: () => null,
  });
  const session = { agentToken: 'vsst_t', backend: 'claude', cwd: dataDir, name: 'conv' };
  sessions.set('s1', session);
  const stopCheck = () => {
    let out;
    routes['GET /api/agent/stop-check']({ headers: { authorization: 'Bearer vsst_t' }, query: {}, body: {} },
      { json: (o) => { out = o; return this; }, status: () => ({ json: (o) => { out = o; } }) });
    return out;
  };
  ok('§6 the first stop nudges', stopCheck().block === true);
  ok('§6 the cooldown holds inside the window', stopCheck().block === false);
  // A RESTART: the live session object is rebuilt (the field is gone), and the
  // persisted record must still hold the cooldown.
  delete session._lastStopNudge;
  guard.flush();
  guard = mkGuard();
  ok('§6 THE COOLDOWN SURVIVES A RESTART (this was an in-memory field only; the instance restarts several times a day)',
    stopCheck().block === false);
  ok('§6 …and the record is on disk under the session-status key', /"claude:s1"/.test(fs.readFileSync(path.join(dataDir, 'spend-budget.json'), 'utf8')));

  // THE EXIT CONDITION, on its OWN session so the count starts at zero (the
  // nudges above already left three unanswered ones on s1 — that IS the
  // mechanism, and reusing it would measure the fixture instead).
  settings['agents.stopNudgeCooldownMinutes'] = 0;   // the owner's own setting on this instance
  settings['agents.stopNudgeMaxUnanswered'] = 3;
  sessions.clear();
  const s2 = { agentToken: 'vsst_t', backend: 'claude', cwd: dataDir, name: 'conv2' };
  sessions.set('s2', s2);
  const n0 = [stopCheck(), stopCheck(), stopCheck()];
  ok('§6 with cooldown 0 it nudges every stop — until the exit condition', n0.every((r) => r.block === true), JSON.stringify(n0.map((r) => r.block)));
  ok('§6 the 4th nudge to a session that has NEVER reported a status is refused (D8 exit condition)', stopCheck().block === false);
  statuses.set('claude:s2', { at: Date.now(), state: 'working' });
  ok('§6 …and a single status report re-opens it (the counter measures "answered", not age)', stopCheck().block === true);

  // THE CEILING
  statuses.clear();
  settings['agents.stopNudgeMaxUnanswered'] = 0;    // exit condition off — isolate the ceiling
  settings['agents.stopNudgeCooldownMinutes'] = 0;
  settings['spend.unattendedPerIdentityHour'] = 1;
  guard.flush(); guard = mkGuard();
  const budgetState = guard.snapshot().budget.identities['sub-a'] || [];
  ok('§6 control: this identity has already spent its (now 1/hour) budget on the nudges above', budgetState.length >= 1);
  ok('§6 the ceiling refuses the nudge — silently to the AGENT (the hook has no "later"), never to the user',
    stopCheck().block === false);

  // §5c's RULE, measured on THIS producer. The route now hands the charge the
  // slot its own verdict resolved (`auth.identity`) instead of a bare session
  // for the guard to resolve a SECOND time. Nothing awaits between those two
  // lines TODAY — which is a property of this arrangement of the code, not of
  // the question being asked once, so it is measured rather than reasoned.
  // A FRESH GUARD WOULD MAKE THIS VACUOUS (its counter starts at 0), so the
  // leg first drives a nudge that IS charged and asserts the charge landed.
  settings['spend.unattendedPerIdentityHour'] = 12;
  guard.flush(); guard = mkGuard();
  const spentBefore = (guard.snapshot().budget.identities['sub-a'] || []).length;
  ok('§6 control: with budget again the nudge is delivered and CHARGED (an unreached charge proves nothing)',
    stopCheck().block === true && (guard.snapshot().budget.identities['sub-a'] || []).length === spentBefore + 1);
  ok('§6 …and the guard never re-resolved the identity at CHARGE time (§5c\'s rule, on the real Stop-nudge route)',
    guard.snapshot().chargesUnhinted === 0, String(guard.snapshot().chargesUnhinted));
}

// ── §7 OVERAGE ──────────────────────────────────────────────────────────────
console.log('\n§7 paid overage: refused for unattended spend, visible where the owner decides');
{
  const w = mkWorld({ settings: {} });
  const s = w.mkSession('sess-ov-1');
  // the member starts billing paid overage — the CLI's own record
  w.writeCache(w.M1, w.healthy({ overage: { inUse: true, status: 'allowed', asOf: Date.now() }, spend: { used: 4.25, limit: 20, pct: 21 } }));
  w.arm(s); await w.fireDue();
  ok('§7 D3b: the auto-continue is REFUSED while the account bills paid overage', w.fired.length === 0);
  ok('§7 …and the refusal names it (the panel word and the inbox word are the same)',
    w.inbox.some((i) => /paid overage/.test(i.text)), JSON.stringify(w.inbox.map((i) => i.text)));
  ok('§7 …the session stays armed (this is money, not a broken promise)', !!w.ar._armed.get('sess-ov-1'));

  // the opt-in
  const w2 = mkWorld({ settings: { 'spend.allowOverageTurns': true } });
  const s2 = w2.mkSession('sess-ov-2');
  w2.writeCache(w2.M1, w2.healthy({ overage: { inUse: true, asOf: Date.now() } }));
  w2.arm(s2); await w2.fireDue();
  ok('§7 with the explicit opt-in it continues (the setting is the consent)', w2.fired.length === 1);

  // the ONE reader, shared by the engine, the authorizer and the panels
  ok('§7 the engine exposes the ONE overage reader and it agrees with the raw cache',
    w.eng.overageState(w.eng.readRawUsageCache(w.M1)).inUse === 'yes' && w.eng.overageState(w.eng.readRawUsageCache(w.M2)).inUse === 'unknown');
  const um = read('src/lib/usage-meter.js'), ma = read('src/lib/manage-agents.js');
  ok('§7 PANEL: the usage popup renders the overage chip from that same PURE rule',
    // the NAMES, not the exact import line: r4 widened this import to bring in
    // `spendControlState` beside it, and a pin on the whole line makes adding
    // the next PURE verdict look like a regression
    /import \{[^}]*\boverageState\b[^}]*\} from '\.\.\/spend-authorizer\.js'/.test(um) && /overageChip\(overageState\(snap\)/.test(um));
  ok('§7 PANEL: Manage Agents — where the owner picks a switch target — renders it too (design §1.4: provenance reached one panel of four; since 2.369.189 as the credits chip on the row\'s identity line)',
    /overageChip\(overageState\(u\)/.test(ma) && /creditsSlotHtml\(/.test(ma));
  const chip = require(path.join(REPO, 'src/lib/usage-source.js'));
  // 2.369.189 (owner: "这啥玩意啊 不如显示个钱的图标"): the chip's face is the money icon + ONE
  // word; the sentence and the money moved into its tip (title + aria-label)
  const inUseChip = chip.overageChip(A.overageState({ overage: { inUse: true, asOf: Date.now() }, spend: { used: 4.25, limit: 20 } }));
  ok('§7 the chip says nothing when overage is DISABLED or unknown, and says the money when it is on — in its tip, the face is one word (an ENABLED-but-idle org gets the dim credits chip — §7c)',
    chip.overageChip(A.overageState({ overage: { inUse: false, status: 'rejected', disabledReason: 'org_level_disabled_until' } })) === null
    && chip.overageChip(A.overageState({})) === null
    && inUseChip.label === 'Credits' && inUseChip.money === '$4.25 / $20.00'
    && /^Using paid overage credits — .*billed pay-per-use\. Spent this period: \$4\.25 \/ \$20\.00\. Automatic turns are refused/.test(inUseChip.tip), JSON.stringify(inUseChip));
  ok('§7 …and it never claims "in use" about a record that stopped being refreshed (that chip tip promises a refusal that no longer happens) — only the dim credits chip, whose tip promises none',
    chip.overageChip(A.overageState({ overage: { inUse: true, asOf: Date.now() - A.OVERAGE_STALE_MS - 1 } }))?.kind === 'credits'
    && !/refused/.test(chip.overageChip(A.overageState({ overage: { inUse: true, asOf: Date.now() - A.OVERAGE_STALE_MS - 1 } })).tip));
}

// ── §7c USAGE CREDITS (B-ad05): visible before they are spent, NOT a spend verdict ──
// This instance idled every conversation on the one member whose org has extra
// usage ENABLED (`overage = {inUse:false}` with no status — every other member
// carries status:'rejected') for 14 h while its 5h/Fable read 100 %: served by
// credits, billed pay-per-use, chip hidden because `inUse` never turned true.
console.log('\n§7c usage credits: a dim chip before the bill, a last-resort rank, a 6 h parking notice — and no change to any spend verdict');
{
  const now = Date.now();
  const ID = { key: 'sub-cr', name: 'Alpha' };
  const allowed = { overage: { inUse: false, status: 'allowed', asOf: now } };
  const disabled = { overage: { inUse: false, status: 'rejected', disabledReason: 'org_level_disabled_until', asOf: now } };
  // the WIPED shape (final verifier): `inUse:false` with NO status — the vendor
  // omits `overageStatus` on a third of events and the pre-fix merge wiped
  // stored ones, so this is also an overage-DISABLED org's record after a
  // status-less event. It is 'unknown', never 'allowed'.
  const wiped = { overage: { inUse: false, asOf: now } };
  ok('§7c overageState.mode distinguishes allowed / disabled / inUse / unknown — and \'allowed\' needs POSITIVE evidence (a non-rejected status, or a dated inUse:true that ended or went stale); inUse:false with no status is unknown',
    A.overageState(allowed).mode === 'allowed' && A.overageState(disabled).mode === 'disabled'
    && A.overageState({ overage: { inUse: true, asOf: now } }, { now }).mode === 'inUse' && A.overageState({}).mode === 'unknown' && A.overageState(null).mode === 'unknown'
    && A.overageState(wiped, { now }).mode === 'unknown'
    && A.overageState({ overage: { inUse: false, status: 'allowed_warning', asOf: now } }, { now }).mode === 'allowed'
    && A.overageState({ overage: { inUse: true, asOf: now - 3600e3, resetsAt: Math.floor(now / 1000) - 60 } }, { now }).mode === 'allowed'
    && A.overageState({ overage: { inUse: true } }, { now }).mode === 'unknown', JSON.stringify({ wiped: A.overageState(wiped, { now }).mode }));
  ok('§7c overageAllowed is that one question, and it is NOT date-bounded (an org-level configuration, not a claim about the present) — and false for the wiped shape',
    A.overageAllowed(allowed) === true && A.overageAllowed(disabled) === false && A.overageAllowed({ overage: { inUse: false, status: 'allowed', asOf: now - A.OVERAGE_STALE_MS * 4 } }, { now }) === true && A.overageAllowed(wiped, { now }) === false);
  const chip = require(path.join(REPO, 'src/lib/usage-source.js'));
  const cr = chip.overageChip(A.overageState(allowed));
  ok('§7c the chip: a DIM "credits" chip for an allowed org (kind credits), today\'s chip for inUse, nothing for disabled / unknown',
    cr?.kind === 'credits' && cr.dim === true && cr.label === 'Credits' && /Extra usage is enabled on this org: requests past 100 % are billed pay-per-use/.test(cr.tip)
    && chip.overageChip(A.overageState({ overage: { inUse: true, asOf: now } }, { now }))?.kind === 'inUse'
    && chip.overageChip(A.overageState(disabled)) === null && chip.overageChip(A.overageState({})) === null, JSON.stringify(cr));
  // SPEND-GUARD UNCHANGED (pinned): a credits-allowed member changes no verdict
  const base = { reason: 'auto-resume', identity: ID, state: A.emptyBudget(), now };
  const withCredits = A.authorizeUnattendedSpend({ ...base, overage: A.overageState(allowed, { now }) });
  const withNone = A.authorizeUnattendedSpend({ ...base, overage: null });
  ok('§7c PURE: the authorizer answers IDENTICALLY with a credits-allowed record and with none (it refuses only once overage is IN USE)',
    withCredits.ok === true && withNone.ok === true && withCredits.why === withNone.why
    && A.authorizeUnattendedSpend({ ...base, overage: A.overageState({ overage: { inUse: true, asOf: now } }, { now }) }).why === 'overage-in-use');
  const w = mkWorld({ settings: {} });
  const s = w.mkSession('sess-cr-1');
  w.writeCache(w.M1, w.healthy({ overage: { inUse: false, status: 'allowed', asOf: now } }));
  w.arm(s); await w.fireDue();
  ok('§7c WORLD: the auto-continue FIRES on a credits-allowed member, and the inbox says nothing about it', w.fired.length === 1 && !w.inbox.some((i) => /overage|credits/i.test(i.text)), JSON.stringify(w.inbox.map((i) => i.text)));
  ok('§7c the engine\'s ALWAYS-ON credits reader names that member and no other',
    w.eng.creditsMemberIds([{ id: w.M1 }, { id: w.M2 }])?.has(w.M1) === true && !w.eng.creditsMemberIds([{ id: w.M1 }, { id: w.M2 }]).has(w.M2));
  // THE PARKING NOTICE through the real engine: the pool sits on the credits
  // member, every other member is spent — one notice per (pool, member) per 6 h
  const w2 = mkWorld({ settings: {} });
  const dead = (extra = {}) => w2.healthy({ fiveHour: { utilization: 1, resetsAt: Math.floor(Date.now() / 1000) + 3600 }, sevenDay: { utilization: 1, resetsAt: Math.floor(Date.now() / 1000) + 3 * 86400 }, ...extra });
  w2.writeCache(w2.M1, dead({ overage: { inUse: false, status: 'allowed', asOf: now } }));
  w2.writeCache(w2.M2, dead());
  w2.eng.maybePoolAutoSwitchForPool(w2.P, { force: true });
  w2.eng.maybePoolAutoSwitchForPool(w2.P, { force: true });
  const creditKeys = w2.noticeKeys.filter((k) => /^pool-credits-/.test(k));
  ok('§7c ENGINE: a pool parked on a spent credits member posts the parking notice — one KEY per (pool, member, 6 h bucket), so the server\'s per-key dedup makes it once per 6 h',
    creditKeys.length === 2 && creditKeys[0] === creditKeys[1] && creditKeys[0] === `pool-credits-${w2.P}-${w2.M1}-${Math.floor(Date.now() / (6 * 3600e3))}`, JSON.stringify(w2.noticeKeys));
  ok('§7c …the sentence names the member and the bill, and the pool is NOT reported as stuck',
    w2.notices.some((t) => /^Pool "pool" is running on Alpha's usage credits — requests past its quota are billed pay-per-use \(Alpha: spent: 5h 0%, 7d 0%\); every other member is out of quota\./.test(t))
    && !w2.noticeKeys.some((k) => /^pool-blocked-/.test(k)) && w2.am.poolCurrent(w2.P) === w2.M1, JSON.stringify(w2.notices));
  // …and the LAST-RESORT switch: current spent (no credits), the other member has credits
  const w3 = mkWorld({ settings: {} });
  w3.writeCache(w3.M1, dead());
  w3.writeCache(w3.M2, w3.healthy({ overage: { inUse: false, status: 'allowed', asOf: now } }));
  w3.eng.maybePoolAutoSwitchForPool(w3.P, { force: true });
  ok('§7c ENGINE: the last-resort switch lands on the credits member, says so in the switch notice and posts the parking notice',
    w3.am.poolCurrent(w3.P) === w3.M2 && w3.notices.some((t) => /auto-switched to Beta .*the last resort: Beta bills pay-per-use past its quota \(usage credits\)/.test(t))
    && w3.noticeKeys.some((k) => k === `pool-credits-${w3.P}-${w3.M2}-${Math.floor(Date.now() / (6 * 3600e3))}`), JSON.stringify(w3.notices));
  // the panels render the chip from the same PURE rule
  const ma2 = read('src/lib/manage-agents.js'), um2 = read('src/lib/usage-meter.js');
  ok('§7c PANEL: the roster renders the credits chip on the identity line (creditsSlotHtml → creditsChipHtml) and the popup beside the provenance line (the same creditsChipHtml, the money icon)',
    /const creditsSlotHtml = \(u\) => `<span class="acct-credits-slot">\$\{creditsChipHtml\(creditsChipFor\(u\), \{ esc: escHtml, icon: UI_ICONS\.money \}\)\}<\/span>`/.test(ma2)
    && /if \(ovc\) parts\.push\(creditsChipHtml\(ovc, \{ esc: escHtml, icon: UI_ICONS\.money \}\)(?: \+ \(ovc\.kind === 'inUse' && !turnsAllowed \? ` <button [^`]*data-door=\"settings:spend\.allowOverageTurns\"[^`]*` : ''\))?\);/.test(um2));
  // THE ORG FACTS SURVIVE THE IDENTITY REPAIR (final verifier, the fail-closed
  // census): repairSidecarsByApiPhase rebuilds a cache whose 7d contradicts the
  // account's API phase — and used to rebuild it WITHOUT `overage`/`spend`, so
  // the authorizer's only overage refusal read 'unknown' and every unattended
  // turn on an overage-billing account was ALLOWED until the next event.
  {
    const repair = require(path.join(REPO, 'src/reading-repair.js'));
    const rl = require(path.join(REPO, 'src/reading-lag.js'));
    const dd = path.join(tmpdir('vs-spend-orgfacts-'), 'data');
    for (const p of ['usage-anchors', 'usage-cache', 'archive']) fs.mkdirSync(path.join(dd, p), { recursive: true });
    const K = 'sub-kkkkkkkkkkkk', nowSec = Math.floor(now / 1000), H = 3600;
    const WA = nowSec + 3 * 86400, WF = nowSec + 6 * 86400 + 16 * H;
    const OV = { inUse: true, status: 'allowed', asOf: now - 3600e3, resetsAt: nowSec + 20 * 86400 }, SP = { used: 12.5, limit: 50, pct: 25 };
    const rec = (ts, u, resetsAt, source) => ({ ts, fetchedAt: ts, source, accountId: K, identityKey: 'org_kkkk', buckets: { fiveHour: { u: 0.2, resetsAt: nowSec + H }, sevenDay: { u, resetsAt }, scopedWeekly: [] }, prevFetchedAt: null, elapsedSec: null, costSince: null });
    fs.writeFileSync(path.join(dd, 'usage-anchors', 'anchors-org_kkkk.ndjson'), Array.from({ length: 5 }, (_, i) => rec(now - (30 - i * 5) * H * 1000, 0.2 + i * 0.02, WA, i ? 'rate-limit-event' : 'on-demand')).map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(dd, 'usage-cache', rl.windowSidecarName(K)), JSON.stringify({ sevenDay: WF, fiveHour: null, scoped: {}, at: now - 2 * H * 1000, source: 'on-demand' }));
    const mk = (extra) => JSON.stringify({ fetchedAt: now - H * 1000, source: 'on-demand', sevenDay: { utilization: 0.5, resetsAt: WF }, orgUuid: 'kkkk', overage: OV, spend: SP, ...extra });
    fs.writeFileSync(path.join(dd, 'usage-cache', K + '.json'), mk({}));
    const accts = [{ id: K, name: 'Member K', type: 'subscription', backend: 'claude' }];
    const r1 = repair.repairSidecarsByApiPhase({ dataDir: dd, accounts: accts, id: 'T-orgfacts' });
    const c1 = JSON.parse(fs.readFileSync(path.join(dd, 'usage-cache', K + '.json'), 'utf8'));
    const st1 = A.overageState(c1, { now });
    const gate = (c) => A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: { key: K, name: 'Member K' }, state: A.emptyBudget(), now, overage: A.overageState(c, { now }) });
    ok('§7c REPAIR (replaced): the rebuilt cache carries overage (inUse, status, resetsAt, asOf) and spend verbatim, overageState still reads in-use, and the authorizer still REFUSES overage-in-use',
      r1.counts.replaced === 1 && c1.sevenDay && rl.weeklyNear(c1.sevenDay.resetsAt, WA) === true && c1.overage && c1.overage.inUse === true && c1.overage.status === 'allowed' && c1.overage.resetsAt === OV.resetsAt && c1.overage.asOf === OV.asOf && c1.spend && c1.spend.used === 12.5 && c1.spend.limit === 50
      && st1.inUse === 'yes' && st1.mode === 'inUse' && gate(c1).ok === false && gate(c1).why === 'overage-in-use', JSON.stringify({ counts: r1.counts, ov: c1.overage, sp: c1.spend, st: st1.inUse, gate: gate(c1) }));
    // …and the EMPTIED branch (no anchor agrees wholly): a scoped foreign bucket on every anchor
    const dd2 = path.join(tmpdir('vs-spend-orgfacts2-'), 'data');
    for (const p of ['usage-anchors', 'usage-cache', 'archive']) fs.mkdirSync(path.join(dd2, p), { recursive: true });
    fs.writeFileSync(path.join(dd2, 'usage-anchors', 'anchors-org_kkkk.ndjson'), Array.from({ length: 5 }, (_, i) => ({ ...rec(now - (30 - i * 5) * H * 1000, 0.2 + i * 0.02, WA, i ? 'rate-limit-event' : 'on-demand'), buckets: { fiveHour: { u: 0.2, resetsAt: nowSec + H }, sevenDay: { u: 0.2 + i * 0.02, resetsAt: WA }, scopedWeekly: [{ name: 'Fable', u: 0.98, resetsAt: WF, asOf: now }] } })).map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(dd2, 'usage-cache', K + '.json'), mk({ scopedWeekly: [{ name: 'Fable', utilization: 0.98, resetsAt: WF }] }));
    const r2 = repair.repairSidecarsByApiPhase({ dataDir: dd2, accounts: accts, id: 'T-orgfacts2' });
    const c2 = JSON.parse(fs.readFileSync(path.join(dd2, 'usage-cache', K + '.json'), 'utf8'));
    ok('§7c REPAIR (emptied): the identity-only remnant STILL carries overage + spend, and the authorizer still refuses — an emptied reading is not an emptied bill',
      r2.counts.emptied === 1 && !c2.sevenDay && c2.overage && c2.overage.inUse === true && c2.overage.status === 'allowed' && c2.spend && c2.spend.used === 12.5 && gate(c2).why === 'overage-in-use', JSON.stringify({ counts: r2.counts, ov: c2.overage, gate: gate(c2) }));
  }
}


// ── §7b THE §1.4 ROW'S THIRD FIELD, AND A CENSUS THAT CAN SEE IT (r4) ───────
// r3 marked the design's §1.4 overage row **CLOSED** while naming THREE
// captured-and-unread fields — `cache.overage`, claude's `spend {used,limit,
// pct}` and codex's `spendControlReached`. Two of them got the one reader; the
// third kept exactly the two hits it shipped with, both in its WRITER
// (src/harnesses/codex-quota.js:57 and :75). That is not a money leak — a codex
// account past its spend control has its requests REJECTED rather than billed —
// but the leak the row itself describes is real for it: nothing marks a window
// spent, so `accountRemaining()` reads a friendly `utilization` and the panels
// draw friendly donuts for an account that cannot serve a single request.
//
// The record was the defect. So the fix is both halves: the field gets the SAME
// one reader (`spendControlState`, PURE, beside `overageState`), and the ROW
// becomes ENFORCEABLE — this census walks the fields the row claims and fails
// on any of them that no PURE reader in src/spend-authorizer.js reads.
console.log('\n§7b the three fields the §1.4 CLOSED row names each have ONE reader');
{
  const auth = read('src/spend-authorizer.js');
  // The three payload fields the row names, spelled as they appear on a cache
  // snapshot. Each must be READ by the PURE module — that is what "one reader"
  // means, and it is the claim the row makes.
  const CLAIMED = [
    { field: 'overage', re: /cache\.overage\b/, reader: 'overageState' },
    { field: 'spend', re: /cache\.spend\b/, reader: 'overageState' },
    { field: 'spendControlReached', re: /cache\.spendControlReached\b/, reader: 'spendControlState' },
  ];
  console.log('    §1.4 fields walked: ' + CLAIMED.map((c) => `${c.field}→${c.reader}`).join(', '));
  const unread = CLAIMED.filter((c) => !c.re.test(auth) || !new RegExp('function ' + c.reader + '\\s*\\(').test(auth));
  ok('§7b every field the CLOSED row names is read by a PURE reader in the authorizer',
    unread.length === 0, unread.map((c) => c.field).join(', '));
  // NEGATIVE CONTROL: the census must be able to SEE an unread field, or the
  // assert above is the r3 verdict again in a new spelling.
  {
    const preFix = auth.replace(/function spendControlState\s*\(/, 'function vsRetiredSpendControlState(');
    const wouldFail = CLAIMED.filter((c) => !c.re.test(preFix) || !new RegExp('function ' + c.reader + '\\s*\\(').test(preFix));
    ok('§7b NEGATIVE CONTROL: with the reader retired the census names exactly that field (r3\'s real state)',
      wouldFail.length === 1 && wouldFail[0].field === 'spendControlReached', wouldFail.map((c) => c.field).join(','));
  }
  // …and the ROW itself must name the readers, so the record cannot claim more
  // than the code does. A doc pin, deliberately: the row is what the next round
  // reads to decide what is left to build.
  {
    const doc = read('docs/design-account-hardening.md');
    const row = doc.split('\n').find((l) => /Overage is captured and discarded/.test(l)) || '';
    ok('§7b the §1.4 row exists and is a single table row (the census has something to check)', row.length > 200);
    ok('§7b …and its verdict names the reader of EVERY field it claims',
      CLAIMED.every((c) => row.includes(c.reader)),
      CLAIMED.filter((c) => !row.includes(c.reader)).map((c) => c.reader).join(', '));
    ok('§7b NEGATIVE CONTROL: r3\'s verdict text (one reader named) fails that check',
      !CLAIMED.every((c) => '**CLOSED 2026-09-08**: one reader (`overageState`, PURE) asked by the authorizer'.includes(c.reader)));
  }

  // THE DECISION, driven on the PURE rule.
  const ID = { key: 'k', name: 'A' };
  const scAuth = (cache, now = Date.now()) => A.authorizeUnattendedSpend({
    reason: 'auto-resume', identity: ID, state: A.emptyBudget(),
    spendControl: A.spendControlState(cache, { now }), now,
  });
  const now = Date.now();
  ok('§7b a codex account that has REACHED its spend control refuses unattended spend, by NAME',
    scAuth({ spendControlReached: true, fetchedAt: now }).why === 'spend-control-reached');
  ok('§7b …and the refusal says WHY a turn there is worthless (rejected, not billed)',
    /requests are rejected/.test(scAuth({ spendControlReached: true, fetchedAt: now }).detail));
  ok('§7b P6: `false` and a missing field are not claims and never block',
    scAuth({ spendControlReached: false, fetchedAt: now }).ok === true
    && scAuth({ fetchedAt: now }).ok === true && scAuth(null).ok === true);
  ok('§7b the state is THREE-state and keeps what the record STATED',
    A.spendControlState({ spendControlReached: true, fetchedAt: now }).reached === 'yes'
    && A.spendControlState({ spendControlReached: false, fetchedAt: now }).reached === 'no'
    && A.spendControlState({}).reached === 'unknown');
  // ONLY THE CLAIM THAT BLOCKS NEEDS A DATE — r2's rule, applied to the twin,
  // on the SAME constant (a second window for one physical fact is a twin).
  {
    const stale = { spendControlReached: true, fetchedAt: now - A.OVERAGE_STALE_MS - 1 };
    const undated = { spendControlReached: true };
    ok('§7b a STALE claim neither blocks nor claims, and says which rung expired it',
      scAuth(stale, now).ok === true && A.spendControlState(stale, { now }).reached === 'unknown'
      && A.spendControlState(stale, { now }).evidence === 'stale'
      && A.spendControlState(stale, { now }).stated === 'yes');
    ok('§7b …and an UNDATED one cannot claim the present either',
      scAuth(undated, now).ok === true && A.spendControlState(undated, { now }).evidence === 'undated');
    ok('§7b it uses the SAME staleness constant as its sibling (one physical fact, one window)',
      /staleMs = OVERAGE_STALE_MS/.test(auth.slice(auth.indexOf('function spendControlState'), auth.indexOf('function spendControlState') + 400)));
    ok('§7b `reached:no` is deliberately NOT date-bounded (it blocks nothing, so no decision changes)',
      A.spendControlState({ spendControlReached: false, fetchedAt: now - A.OVERAGE_STALE_MS * 4 }, { now }).reached === 'no');
  }
  // IT IS NOT THE OVERAGE CLASS: the money opt-in must not unlock it.
  ok('§7b the overage OPT-IN does not unlock it — that setting consents to SPENDING, not to being refused by the vendor',
    A.authorizeUnattendedSpend({
      reason: 'auto-resume', identity: ID, state: A.emptyBudget(), overagePolicy: 'allow',
      spendControl: A.spendControlState({ spendControlReached: true, fetchedAt: now }, { now }), now,
    }).why === 'spend-control-reached');

  // THE ORCH HALF: one cache read, one reader, reaching the real gate.
  {
    const dataDir = tmpdir('vs-spend-sc-');
    const caches = { 'cx-a': { spendControlReached: true, fetchedAt: Date.now() }, 'cx-b': { spendControlReached: false, fetchedAt: Date.now() } };
    const mk = (key) => guardMod.create({
      dataDir, serverSetting: () => undefined, identityOf: () => ({ key, name: key }),
      readCacheFor: (k) => caches[k] || null, getUserTodos: () => null, log: () => { },
    });
    const gA = mk('cx-a'), gB = mk('cx-b');
    ok('§7b the guard exposes the ONE reader and it agrees with the raw cache',
      gA.spendControlFor('cx-a').reached === 'yes' && gA.spendControlFor('cx-b').reached === 'no');
    ok('§7b …and a REAL authorize on that account is refused, while its sibling is allowed (the reader is REACHED)',
      gA.authorize({ reason: 'auto-resume', session: {} }).why === 'spend-control-reached'
      && gB.authorize({ reason: 'auto-resume', session: {} }).ok === true);
  }

  // BOTH PANELS say it — the same PURE verdict, so a chip can never disagree
  // with the gate (the §1.4 "provenance reached one panel of four" rule).
  {
    const um = read('src/lib/usage-meter.js'), ma = read('src/lib/manage-agents.js');
    const chip = require(path.join(REPO, 'src/lib/usage-source.js'));
    ok('§7b PANEL: the usage popup renders the spend-control chip from that same PURE rule',
      /spendControlChip\(spendControlState\(snap\)/.test(um) && /\bspendControlState\b/.test(um));
    ok('§7b PANEL: Manage Agents — where the owner picks a switch target — renders it too',
      /spendControlChip\(spendControlState\(u\)/.test(ma));
    ok('§7b the chip says nothing when the control is off or unknown, and names it when it is on',
      chip.spendControlChip({ reached: 'no' }) === null && chip.spendControlChip({ reached: 'unknown' }) === null
      && chip.spendControlChip(null) === null
      && /spend control reached/.test(chip.spendControlChip({ reached: 'yes' }).label));
  }
}

// ── §8 THE EDF RESERVE FLOOR ────────────────────────────────────────────────
console.log('\n§8 the EDF reserve floor (D2): a voluntary move stops at the floor, an escape does not');
{
  const NOW = 1_800_000_000, H = 3600, D = 86400;
  const acct = (u7, inSec, { u5 = 0 } = {}) => ({ fiveHour: { utilization: u5, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + inSec } });
  const members = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const run = (caches, opts = {}) => decidePoolSwitch({ currentId: 'b', members, readCache: (id) => caches[id] ?? null, nowSec: NOW, proactive: true, hot: true, explain: true, ...opts });
  const caches = { b: acct(0.54, 6 * D), a: acct(0.88, 12 * H) };
  ok('§8 CONTROL (the repurposed test-pool-auto:85-88 pin): with NO floor, an 88%-consumed member with the sooner deadline IS a proactive target',
    run(caches, { reserveFloorPct: 0 }).to === 'a');
  const held = run(caches, { reserveFloorPct: 15 });
  ok('§8 with the 15% floor it is not — and the verdict NAMES what it held back', held.to === null && held.reserveBlocked?.[0]?.id === 'a' && held.reserveFloorPct === 15, JSON.stringify(held).slice(0, 200));
  ok('§8 …the floor is measured on the WEEKLY budget, not on the 5h burst limiter (a member at 90% weekly / 20% 5h is a fine target)',
    run({ b: acct(0.54, 6 * D), a: acct(0.10, 12 * H, { u5: 0.80 }) }, { reserveFloorPct: 15 }).to === 'a');
  // P6: a member with NO weekly reading is not barred — and the leg is built so
  // only the floor can decide it (a soft-exhausted current member, one
  // candidate below the floor and one with no weekly bucket at all).
  const three = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const noWeekly = { fiveHour: { utilization: 0.5, resetsAt: NOW + 1800 } };
  const soft = decidePoolSwitch({
    currentId: 'b', members: three, nowSec: NOW, proactive: false, hot: true, reserveFloorPct: 15, explain: true,
    readCache: (id) => ({ b: acct(0.96, 6 * D), a: noWeekly, c: acct(0.88, 12 * H) })[id] ?? null,
  });
  ok('§8 …and an UNKNOWN weekly reading is never barred (P6: ignorance is not a claim) while the 12%-weekly sibling is',
    soft.to === 'a' && !(soft.reserveBlocked || []).some((m) => m.id === 'a'), JSON.stringify(soft).slice(0, 220));
  // THE ESCAPE: current member hard-dead, the only candidate is below the floor
  const esc = decidePoolSwitch({ currentId: 'b', members, readCache: (id) => ({ b: acct(0.999, 6 * D), a: acct(0.88, 12 * H) })[id] ?? null, nowSec: NOW, proactive: true, hot: true, reserveFloorPct: 15, explain: true });
  ok('§8 an ESCAPE from a hard-dead member ignores the floor (liveness beats efficiency) and SAYS where it landed',
    esc.to === 'a' && esc.toReserve?.id === 'a' && esc.reason === 'exhausted', JSON.stringify(esc).slice(0, 200));
  // the overage bar, same shape
  const ovr = run(caches, { reserveFloorPct: 0, overageIds: ['a'] });
  ok('§8 D3c: an overage member is barred from a voluntary move and named separately (dollars, not a spent window)',
    ovr.to === null && ovr.overageBlocked?.[0]?.id === 'a' && !ovr.reserveBlocked, JSON.stringify(ovr).slice(0, 160));
  const ovrEsc = decidePoolSwitch({ currentId: 'b', members, readCache: (id) => ({ b: acct(0.999, 6 * D), a: acct(0.2, 12 * H) })[id] ?? null, nowSec: NOW, proactive: true, hot: true, overageIds: ['a'], explain: true });
  ok('§8 …and the escape still uses it, saying so', ovrEsc.to === 'a' && ovrEsc.toOverage?.id === 'a');
  // the sentence
  const { poolBlockedNotice } = require(path.join(REPO, 'src/account-pool-auto.js'));
  const sentence = poolBlockedNotice(held, { poolName: 'All', currentName: 'B' });
  ok('§8 the blocked notice says the SPENDING limit, not "out of quota" (which prescribes waiting for a reset)',
    /held back by your spending limits/i.test(sentence) && /15% reserve floor/.test(sentence) && !/out of quota/.test(sentence), sentence);
  const quotaWall = poolBlockedNotice(run({ b: acct(0.99, 6 * D), a: acct(0.995, 12 * H) }, { reserveFloorPct: 15 }), { poolName: 'All', currentName: 'B' });
  ok('§8 CONTROL: a quota-emptied list still says the quota sentence, verbatim as before', /no member can serve it — B is spent:/.test(quotaWall), quotaWall);
  ok('§8 the engine reads both bars from SETTINGS and hands them to the pure decision',
    /reserveFloorPct: reserveFloorPct\(\), overageIds: overageMemberIds\(/.test(read('src/server/usage-pool-engine.js')));
  const w = mkWorld({ settings: {} });
  ok('§8 the shipped default floor is 15% (D2), read per decision', w.eng.reserveFloorPct() === 15);
  const w0 = mkWorld({ settings: { 'pool.reserveFloorPct': 0 } });
  ok('§8 …and 0 turns it off (the pre-2026-09 behaviour, one setting away)', w0.eng.reserveFloorPct() === 0);
}

// ── §9 FAIL CLOSED ──────────────────────────────────────────────────────────
console.log('\n§9 fail closed: an authorizer that throws spends nothing (P8)');
{
  // (a) auto-resume
  const root = tmpdir('vs-spend-fc-');
  const sessions = new Map();
  const fired = [];
  const ar = arMod.create({
    dataDir: root, activeSessions: sessions, serverSetting: () => true, log: () => { },
    sendToSession: (id, s, text) => { fired.push(id); return true; },
    fireIdentity: () => ({ key: 'k', name: 'K' }),
    authorizeSpend: () => { throw new Error('boom'); },
  });
  const s = { backend: 'claude', mode: 'chat', _webuiId: 'x1', _autoResume: true, name: 'c' };
  sessions.set('x1', s);
  ar.armIfEnabled('x1', s, Date.now() + 60_000, 'usage limit');
  ar.tick(Date.now() + 120_000);
  await tick(40);
  ok('§9 auto-resume: a throwing authorizer refuses the continue', fired.length === 0);
  ok('§9 …and the arm survives (the promise is intact; it is the money that is unavailable)', !!ar._armed.get('x1'));

  // (b) the delivery ladder
  const dd = tmpdir('vs-spend-fc2-');
  const posted = [];
  const deliver = deliverMod.create({
    dataDir: dd, activeSessions: new Map(),
    peerMsg: { findPeer: () => ({ socketPath: '/x' }), postToPeer: async () => { posted.push(1); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
    getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, emitPeerCard: () => { },
    authorizeSpend: () => { throw new Error('boom'); }, noteSpend: () => { }, log: () => { },
  });
  const r = await deliver.deliverToConversation('cid-x', 'hi', { spendReason: 'peer-message' });
  ok('§9 the ladder: a throwing authorizer delivers nothing and says why (the caller stashes)',
    r.ok === false && r.refused === 'spend' && posted.length === 0, JSON.stringify(r));

  // (c) THE PRE-FIRE GATE, THE THIRD LAYER — DRIVEN, not read.
  // P8 is "money gates fail CLOSED, at EVERY layer", and design §1.4 named two
  // (the engine's `catch { return true; }` and the server.js wiring lambda).
  // auto-resume has a THIRD, its own, and round 2 verified the fix by GREPPING
  // the two other files — so nothing ever drove this one. Measured on the real
  // module at that commit: `beforeFire` throwing ⇒ 1 billed continue delivered,
  // `beforeFire` returning a rejected promise ⇒ 1. It is masked in production
  // (the engine's body is wholly inside its own try/catch, and the wiring
  // lambda catches synchronous throws), but the mask lives in two other files
  // and making that lambda `async` — the natural refactor, since the callee
  // already is — removes both halves of it at once.
  {
    const gateRun = async (mod, beforeFire) => {
      const r2 = tmpdir('vs-spend-gate-');
      const sess = new Map(); const fires = [];
      const g = mod.create({
        dataDir: r2, activeSessions: sess, serverSetting: () => true, log: () => { },
        sendToSession: (gid) => { fires.push(gid); return true; },
        fireIdentity: () => ({ key: 'k', name: 'K' }), beforeFire,
      });
      const gs = { backend: 'claude', mode: 'chat', _webuiId: 'g1', _autoResume: true, name: 'c' };
      sess.set('g1', gs);
      g.armIfEnabled('g1', gs, Date.now() + 60_000, 'usage limit');
      g.tick(Date.now() + 120_000);
      await tick(60);
      return { fires: fires.length, armed: !!g._armed.get('g1') };
    };
    const refuses = await gateRun(arMod, () => false);
    const allows = await gateRun(arMod, () => true);
    ok('§9 CONTROL: the gate is REACHED — it answers `false` and nothing is sent, `true` and one continue is (an unreached gate proves nothing)',
      refuses.fires === 0 && allows.fires === 1, JSON.stringify({ refuses, allows }));
    const threw = await gateRun(arMod, () => { throw new Error('boom'); });
    const rejected = await gateRun(arMod, () => Promise.reject(new Error('boom')));
    ok('§9 a pre-fire gate that THROWS spends nothing (was: `catch { gate = true; }` ⇒ one billed continue)',
      threw.fires === 0, JSON.stringify(threw));
    ok('§9 …and one that returns a REJECTED PROMISE spends nothing (was: `.catch(() => deliver())` ⇒ one billed continue)',
      rejected.fires === 0, JSON.stringify(rejected));
    ok('§9 …and BOTH keep the session armed (a broken gate is not a broken promise — the next tick asks again)',
      threw.armed === true && rejected.armed === true, JSON.stringify({ threw, rejected }));

    // NEGATIVE CONTROL: a PATCHED COPY of the real module with the PRE-FIX
    // shapes restored (P12 — and the patch must be asserted to have landed, or
    // a control that silently stopped matching goes green forever). The copy is
    // loaded through the same `mutantModule` every other control here uses:
    // this module DOES have relative requires (`../auto-resume-signal.js`,
    // `../harnesses` — the generic resume verb), so a bare tmpdir copy would
    // not even load — the copy's `require` is re-bound to the real path
    // (scripts/mutant-copy.mjs). That is an assertion, not a note: the copy
    // loading at all proves the re-binding reached those requires.
    const arSrc = read('src/server/auto-resume.js');
    ok('§9 NEGATIVE CONTROL scope: the module HAS relative requires, so the copy must resolve them as the real module does (mutantModule re-binds its require)',
      /require\('\.\.?\//.test(arSrc));
    // the pre-fix bytes, byte-exact (git show 40ad936d:src/server/auto-resume.js
    // — the commit BOTH chains branched from, so it is the one shape that
    // predates the spend ceiling AND the generic resume verb)
    const MASTER_PROMISE = 'gate.then((g2) => { if (g2 !== false) deliver(); }).catch(() => deliver()).finally(() => { session._arFiring = false; });';
    const subs = [
      ["catch (e) { gateFailedClosed(id, 'threw', e); gate = false; }", 'catch { gate = true; }'],
      [`gate.then(
        (g2) => { if (g2 === false) noteGateRefusal(id, kind, origin); else deliver(); },
        (e) => { gateFailedClosed(id, 'rejected', e); },   // never deliver() from here
      )
        .catch((e) => { log(\`[auto-resume] \${id}: delivering the continue threw after the gate allowed it: \${(e && e.message) || e}\`); })
        .finally(() => { session._arFiring = false; });`, MASTER_PROMISE],
    ];
    const preM = mutantModule('src/server/auto-resume.js', subs);
    const preSrc = preM.file ? fs.readFileSync(preM.file, 'utf8') : '';
    ok('§9 NEGATIVE CONTROL: both pre-fix shapes were re-applied to the copy (an unapplied patch is a green control)',
      !preM.err && preM.hits === 2 && /catch \{ gate = true; \}/.test(preSrc) && preSrc.includes(MASTER_PROMISE),
      preM.err || `${preM.hits}/2 substitutions`);
    // …and they are the PRE-FIX bytes, byte for byte — not a shape this suite invented.
    {
      let masterSrc = '';
      try { masterSrc = execFileSync('git', ['-C', REPO, 'show', '40ad936d:src/server/auto-resume.js'], { env: GIT_ENV, maxBuffer: 64 * 1024 * 1024 }).toString(); } catch { }
      if (!masterSrc) console.log('  · SKIP: git could not read 40ad936d:src/server/auto-resume.js (the pre-fix bytes)');
      else ok('§9 …and both restored shapes are byte-identical to 40ad936d\'s (the control reproduces the SHIPPED defect, not an invented one)',
        masterSrc.includes('catch { gate = true; }') && masterSrc.includes(MASTER_PROMISE));
    }
    if (preM.mod) {
      const preThrew = await gateRun(preM.mod, () => { throw new Error('boom'); });
      const preRejected = await gateRun(preM.mod, () => Promise.reject(new Error('boom')));
      ok('§9 NEGATIVE CONTROL: the pre-fix copy DELIVERS a billed continue on both — one per broken gate (this is the defect, reproduced)',
        preThrew.fires === 1 && preRejected.fires === 1, JSON.stringify({ preThrew, preRejected }));
    }
  }

  // …and the other two layers, which are PINNED rather than driven: the engine
  // gate needs a whole pool world to reach and the server.js lambda is a
  // literal inside the boot wiring. Both are named here so a reader knows
  // which claim is a measurement and which is a read.
  ok('§9 the pre-fire gate fails CLOSED in the engine (was `catch { return true; }`)',
    /refusing the continue \(fail closed\)[\s\S]{0,200}return false;/.test(read('src/server/usage-pool-engine.js')));
  ok('§9 …and at the wiring site in server.js (one alone stayed green: a throw was answered with a billed turn at BOTH layers)',
    /beforeFire: \(id, s\) => \{ try \{ return beforeAutoResumeFire\(id, s\); \} catch \(e\) \{[^}]*return false; \} \}/.test(read('server.js')));
  const engSrc = read('src/server/usage-pool-engine.js');
  const gateAt = engSrc.indexOf('async function beforeAutoResumeFire');
  const gateEnd = engSrc.indexOf('\nfunction ', gateAt);   // the next top-level declaration
  const gateBody = gateAt >= 0 && gateEnd > gateAt ? engSrc.slice(gateAt, gateEnd) : '';
  // SCOPED, and comments stripped first: server.js has an UNRELATED and correct
  // `catch { return true; }` (the Integration master switch defaults ON), so the
  // control names the beforeFire wiring itself; and the fix's own comment QUOTES
  // the retired shape
  // (that is how the next reader learns what it replaced), and a census that
  // reads its own documentation as a violation would force the explanation out.
  const code = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok('§9 NEGATIVE CONTROL: master\'s shape (`catch { return true; }`) is gone from BOTH sites — read on the gate\'s own body, not a window',
    gateBody.length > 200 && !/catch \{ return true; \}/.test(code(gateBody)) && !/beforeAutoResumeFire\(id, s\); \} catch \{ return true; \}/.test(code(read('server.js'))));

  // (d) the codex reset credit — THE PRODUCTION SHAPE, with a positive control.
  // r2 found this leg vacuous TWICE OVER: it passed `{method:'task_failed',
  // params:{error:{message:…}}}`, which matches no branch at all (the engine
  // switches on `payload.type` and src/harnesses/codex-quota.js requires
  // `payload.codexErrorInfo` matching EXHAUSTION_RE), so `!WROTE` was true for
  // a reason unrelated to the ceiling — and mkWorld builds the engine exactly
  // as server.js does, i.e. WITHOUT the authorizeSpend dep the gate then
  // depended on. Both halves are now driven: the real exhaustion payload, and
  // a positive control proving the path is REACHED when the budget allows it.
  const resetPayload = () => ({ type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: Math.floor(Date.now() / 1000) + 7200 });
  // 2.369.157 (design-reset-credits §2): the credit rung is FORKED BY WARMTH — a
  // conversation mid-turn tries the credit before the pool switch, a cold one with
  // a healthy member switches first and never reaches the ceiling at all. The
  // world's conversation is therefore IN A TURN (the wall arrives mid-turn, which
  // is the production shape of `task_failed`); `cold` drives the other branch.
  const creditWorld = (hour, { cold = false } = {}) => {
    const w2 = mkWorld({ settings: { 'codex.limitResetCredit': 'auto', 'spend.unattendedPerIdentityHour': hour } });
    const wrote = [];
    // the stub wrapper says the consume LEFT (`reset_credit_sent`, lane reset-path): the charge is made on the SEND
    const s2 = { backend: 'codex', mode: 'chat', _webuiId: 'cx1', _accountId: w2.P, pty: { write: (x) => { wrote.push(String(x)); if (/"codex-reset-credit"/.test(String(x))) { try { w2.eng.recordCodexQuotaSignal(s2, { type: 'reset_credit_sent', idempotencyKey: JSON.parse(String(x)).idempotencyKey, attempt: 1 }); } catch { } } } }, name: 'cx',
      ...(cold ? { _isStreaming: false, _turnState: 'idle' } : { _isStreaming: true, _turnState: 'running', _lastPtyDataAt: Date.now() }) };
    w2.sessions.set('cx1', s2);
    // the wall comes LATER than the world's healthy readings (test-codex-pool's
    // rule): a wall stamped in the same millisecond loses the cache tie, the
    // switch rung then reads the member as healthy and moves nothing — and since
    // design-reset-credits r2 a cold switch that moved nothing asks the credit
    // rung at `after-switch`, so the tie made the cold leg flaky (1 in ~2 runs)
    { const t0 = Date.now(); while (Date.now() < t0 + 2) { } }
    w2.eng.recordCodexQuotaSignal(s2, resetPayload());
    return { w: w2, spent: wrote.some((x) => /codex-reset-credit/.test(x)) };
  };
  const allowed = creditWorld(100);
  ok('§9 POSITIVE CONTROL: the reset-credit path is REACHED — with budget the credit IS spent (an unreached path proves nothing)',
    allowed.spent === true);
  const denied = creditWorld(0);
  ok('§9 the codex reset credit is under the same ceiling (0/hour ⇒ no credit is spent), in the shape server.js builds',
    denied.spent === false);
  const coldW = creditWorld(100, { cold: true });
  coldW.w.eng.spendGuard.flush();
  ok('§9 a COLD conversation with a healthy pool member never reaches the ceiling: no credit, nothing charged (the switch rung comes first)',
    coldW.spent === false && (() => { try { return (JSON.parse(fs.readFileSync(path.join(coldW.w.dataDir, 'spend-budget.json'), 'utf8')).budget.instance || []).length === 0; } catch { return true; } })());
  // and the LEDGER agrees with the pty in both directions (an assertion about
  // the frame alone cannot tell "refused" from "charged but never written")
  allowed.w.eng.spendGuard.flush(); denied.w.eng.spendGuard.flush();
  const ledOf = (w2) => { try { return JSON.parse(fs.readFileSync(path.join(w2.dataDir, 'spend-budget.json'), 'utf8')); } catch { return { budget: { instance: [] } }; } };
  ok('§9 …and the ledger CHARGED the credit that was spent and charged nothing for the one refused',
    (ledOf(allowed.w).budget.instance || []).length === 1 && (ledOf(denied.w).budget.instance || []).length === 0,
    JSON.stringify({ allowed: (ledOf(allowed.w).budget.instance || []).length, denied: (ledOf(denied.w).budget.instance || []).length }));
  // §5c's rule on the FOURTH producer: the engine hands the charge the slot its
  // own verdict resolved (`av.identity`). The positive control above is what
  // makes this non-vacuous — a charge really happened on that guard.
  ok('§9 …and the guard never re-resolved the identity at CHARGE time (§5c\'s rule, on the real reset-credit path)',
    allowed.w.eng.spendGuard.snapshot().chargesUnhinted === 0, String(allowed.w.eng.spendGuard.snapshot().chargesUnhinted));
}

// ── §10 A LEDGER STAMP CARRIES ITS REASON (2026-09-15, design-background-work
//    §13 5b ②③): after the spend cap stashed every Background Work notification
//    nobody could say WHICH producer had spent the slot — the stamps were bare
//    timestamps. Now a stamp is {at, reason}; a bare-number ledger written by an
//    older build still loads and counts (implicit migration); the refusal and
//    the 80 % notice name the top producers of the window.
{
  const now = Date.now();
  const H = 3600 * 1000;
  // (a) a BARE-NUMBER ledger (an older build's) loads, prunes and counts
  const legacy = { v: 1, identities: { 'sub-L': [now - 10 * 60e3, now - 20 * 60e3, now - 30 * H] }, instance: [now - 10 * 60e3, now - 20 * 60e3, now - 30 * H], notices: {} };
  const pr = A.pruneBudget(legacy, now, null);
  ok('§10 a bare-number ledger prunes by age (the day-old stamp goes, the two live ones stay)', pr.identities['sub-L'].length === 2 && pr.instance.length === 2, JSON.stringify(pr.identities));
  const lc = A.spendCounts(legacy, 'sub-L', now);
  ok('§10 …and counts (hour 2, day 2) with an honest oldest instant', lc.hour === 2 && lc.day === 2 && lc.hourOldest === now - 20 * 60e3, JSON.stringify(lc));
  ok('§10 …its producers read as `unknown` (a legacy stamp names nobody, never a fabricated reason)', lc.producers.hour.unknown === 2 && Object.keys(lc.producers.hour).length === 1, JSON.stringify(lc.producers));
  // (b) a charge stamps {at, reason}; a mixed ledger counts both shapes together
  let st = A.noteUnattendedSpend(legacy, { identity: { key: 'sub-L', name: 'L' }, at: now, reason: 'job-notification' }).state;
  const last = st.identities['sub-L'][st.identities['sub-L'].length - 1];
  ok('§10 a charge writes {at, reason} beside the timestamp', last && last.at === now && last.reason === 'job-notification', JSON.stringify(last));
  ok('§10 a mixed (bare + typed) ledger counts every stamp once', A.spendCounts(st, 'sub-L', now).hour === 3 && A.spendCounts(st, 'sub-L', now).producers.hour['job-notification'] === 1, JSON.stringify(A.spendCounts(st, 'sub-L', now)));
  ok('§10 an undeclared reason is stored as null, never invented', A.noteUnattendedSpend(A.emptyBudget(), { identity: { key: 'x' }, at: now, reason: 'not-a-reason' }).state.identities.x[0].reason === null);
  // (c) the refusal names the producers that spent the window
  for (let i = 0; i < 9; i++) st = A.noteUnattendedSpend(st, { identity: { key: 'sub-L', name: 'L' }, at: now - i * 60e3, reason: 'job-notification', limits: { perIdentityHour: 12 } }).state;
  st = A.noteUnattendedSpend(st, { identity: { key: 'sub-L', name: 'L' }, at: now, reason: 'auto-resume', limits: { perIdentityHour: 12 } }).state;
  const v = A.authorizeUnattendedSpend({ reason: 'stop-nudge', identity: { key: 'sub-L', name: 'L' }, state: st, limits: { perIdentityHour: 12 }, now });
  ok('§10 the hour-cap refusal carries the window\'s producers (job-notification ×10, auto-resume ×1, unknown ×2)', v.ok === false && v.why === 'hour-cap' && v.producers['job-notification'] === 10 && v.producers['auto-resume'] === 1 && v.producers.unknown === 2, JSON.stringify(v.producers));
  const txt = A.refusalText(v);
  ok('§10 …and the sentence says who spent it, most first', /Spent by: job-notification ×10, unknown/.test(txt) === false && /Spent by: job-notification ×10, older builds \(no reason recorded\) ×2, auto-resume ×1\./.test(txt), txt);
  // (d) the 80 % notice names them too
  let w = null, s2 = A.emptyBudget();
  for (let i = 0; i < 8; i++) { const r = A.noteUnattendedSpend(s2, { identity: { key: 'sub-N', name: 'N' }, at: now - i, reason: i < 6 ? 'job-notification' : 'peer-message', limits: { perIdentityHour: 10, noticePct: 80 } }); s2 = r.state; if (r.warn) w = r.warn; }
  ok('§10 the 80 % notice carries and prints the top producers of its window', w && w.producers && w.producers['job-notification'] === 6 && /Top producers this hour: job-notification ×6, peer-message ×2\./.test(A.noticeText(w)), w && A.noticeText(w));
  // (e) the guard passes the reason through to the stamp (wiring pin + a real charge)
  const gsrc = read('src/server/spend-guard.js');
  ok('§10 WIRING PIN: spend-guard.note() hands its `reason` to the stamp', /A\.noteUnattendedSpend\(state, \{ identity, at: now, limits: limits\(\), reason, rid: reservation, carried: !!carried, drain: !!drain, ended: !!ended, behind, press \}\)/.test(gsrc));   // + the reservation's id (lane queued-is-not-woke round 2) + the press id (the attended bulk press's record)
  {
    const dir = tmpdir('vs-spend-reason-');
    const g = guardMod.create({ dataDir: dir, serverSetting: () => undefined, identityOf: () => ({ key: 'sub-G', name: 'G' }), getUserTodos: () => null, log: () => { } });
    const auth = g.authorize({ reason: 'job-notification', identity: { key: 'sub-G', name: 'G' } });
    g.note({ reason: 'job-notification', identity: auth.identity, hold: auth.hold });
    const stamps = g.snapshot().budget.identities['sub-G'] || [];
    ok('§10 a real guard charge lands as {at, reason:"job-notification"}', stamps.length === 1 && stamps[0].reason === 'job-notification' && Number.isFinite(stamps[0].at), JSON.stringify(stamps));
    g.flush();
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'spend-budget.json'), 'utf-8'));
    ok('§10 …and persists in that shape', onDisk.budget.identities['sub-G'][0].reason === 'job-notification');
  }
}

// ── §10r THE NOTICE NEVER LOSES A FACT IT CARRIED (lane owner-press-attended r2) ──
// accept-r1 MAJOR: r1 filed one generic sentence (`refusalI18n`) that every For-you surface renders IN PLACE OF the stored
// text — the producer, the conversation, «Spent by» and the counts were gone in every language, and a signed-out account
// was told to raise a limit. These legs read the notice RENDERED, through the client's own renderer (src/lib/user-todos-
// layout.js saidLine / itemTextOf / itemDetailLinesOf — what user-todos-actions' said() / wordsOf / detailLinesOf ARE),
// with the REAL zh / ja dictionaries — never refusalText.
console.log('\n§10r the For-you spend notice, rendered in en / zh / ja: every fact the stored sentence carried');
{
  const LY = await import(path.join(REPO, 'src/lib/user-todos-layout.js'));
  const { dictEntries } = await import('./i18n-extract.mjs');   // THE one dictionary entry parser (scripts/i18n-check.mjs's)
  const dict = (f) => new Map([...dictEntriesOnce(dictEntries, read(f))].map((e) => [e.key, e.value]));
  const ZH = dict('src/lib/i18n-zh.js'), JA = dict('src/lib/i18n-ja.js');
  const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const T = { en: (k, p) => fill(k, p), zh: (k, p) => fill(ZH.has(k) ? ZH.get(k) : `«MISSING ${k}»`, p), ja: (k, p) => fill(JA.has(k) ? JA.get(k) : `«MISSING ${k}»`, p) };
  const now = Date.parse('2026-10-28T07:47:34Z');
  const id = { key: 'acct-1', name: 'acct-1' };
  const render = (lang, item, at = now) => { const said = (l) => LY.saidLine(l, T[lang], { now: at, locale: lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'ja-JP', timeZone: 'America/Los_Angeles' }); return { text: LY.itemTextOf(item, said), lines: LY.itemDetailLinesOf(item, said) }; };
  // the REAL guard files the notice through a REAL store stand-in (the item the client receives)
  const fileWith = (seed, args, settings = {}, cred = null) => {
    const dir = tmpdir('vs-spend-notice-');
    const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
    const store = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });   // the REAL store: its i18n normaliser is what the client receives
    const g = guardMod.create({ dataDir: dir, serverSetting: (k) => settings[k], credentialStateOf: cred ? () => cred : null, getUserTodos: () => store });
    if (seed) seed(g);
    g.authorize({ hold: false, now, ...args });
    const it = (store.snapshot().open || []).find((x) => x.origin === 'spend' && x.i18n) || null;   // the refusal (the 80 % notice beside it files no i18n)
    store.stop();
    return it;
  };
  const seed = (g) => { for (let i = 0; i < 20; i++) g.note({ reason: 'job-notification', identity: id, now: now - 26 * 60e3 + i * 1000 }); for (let i = 0; i < 10; i++) g.note({ reason: 'peer-message', identity: id, now: now - 20 * 60e3 + i * 1000 }); };
  const hour = fileWith(seed, { reason: 'auto-resume', identity: id, sessionName: 'build-bot' });
  const out = Object.fromEntries(['en', 'zh', 'ja'].map((l) => [l, render(l, hour)]));
  console.log('    en: ' + out.en.text + '\n        ' + out.en.lines.join('\n        '));
  console.log('    zh: ' + out.zh.text + ' / ' + out.zh.lines.join(' / '));
  console.log('    ja: ' + out.ja.text + ' / ' + out.ja.lines.join(' / '));
  const has = (o, re) => re.test(o.text + '\n' + o.lines.join('\n'));
  ok('§10r hour-cap, en: the PRODUCER (the continue after a usage limit), the CONVERSATION («build-bot»), the account, the cap, the next free slot in the viewer\'s zone', has(out.en, /the continue after a usage limit/) && has(out.en, /«build-bot»/) && has(out.en, /acct-1 has used its 30 turns/) && has(out.en, /The next frees at 1:21 AM\./), out.en.text);
  ok('§10r …the COUNTS per window and ONE «Spent by» row per producer, most first (job-notification ×20, peer-message ×10) — and the Spending door', has(out.en, /30 of 30 this hour, 30 of 200 in 24 hours; this instance 30 of 800/) && out.en.lines.filter((l) => /^Spent by /.test(l)).join('|') === 'Spent by a Background Work notification: 20|Spent by a message from another session: 10' && has(out.en, /Held: the continue after a usage limit \(auto-resume\)/) && has(out.en, /Settings → Spending/), out.en.lines.join(' | '));
  ok('§10r …in zh: the producer, the conversation, the counts and each «Spent by» row, in Chinese', has(out.zh, /用量限制后的自动继续/) && has(out.zh, /「build-bot」/) && has(out.zh, /本小时 30\/30/) && has(out.zh, /由一条后台任务通知花掉：20/) && has(out.zh, /由一条来自其他会话的消息花掉：10/) && !has(out.zh, /MISSING/), out.zh.text + ' / ' + out.zh.lines.join(' / '));
  ok('§10r …in ja: the same facts in Japanese', has(out.ja, /使用制限後の自動続行/) && has(out.ja, /「build-bot」/) && has(out.ja, /この 1 時間 30\/30/) && has(out.ja, /バックグラウンド作業の通知による消費：20/) && !has(out.ja, /MISSING/), out.ja.text);
  const later = render('en', hour, Date.parse('2026-10-28T08:21:33Z') + 330 * 60e3);
  ok('§10r a next-free instant already PAST is said «The next is free now.» at render (the 6-hour notice at +330 min) — never the stale clock', /The next is free now\.$/.test(later.text) && !/01:21/.test(later.text), later.text);
  const out2 = fileWith(null, { reason: 'job-notification', identity: id, sessionName: 'nightly' }, {}, { usable: false, state: 'login expired' });
  const o2 = Object.fromEntries(['en', 'zh', 'ja'].map((l) => [l, render(l, out2)]));
  ok('§10r identity-cannot-serve names the LOGIN and its door — the Usage window — and says the limits cannot help (never «used its N turns», never «change the limits»)', has(o2.en, /acct-1 cannot answer a request right now \(login expired\) — sign it in again from the Usage window/) && has(o2.en, /Sign acct-1 in again from the Usage window/) && !has(o2.en, /Change the limits/) && has(o2.zh, /「用量」窗口/) && has(o2.ja, /「使用状況」ウィンドウ/), o2.en.text + ' | ' + o2.en.lines.join(' | '));
  const out3 = fileWith(null, { reason: 'job-notification', identity: id, sessionName: 'nightly' }, { 'spend.unattendedPerIdentityHour': 0 });
  const o3 = Object.fromEntries(['en', 'zh', 'ja'].map((l) => [l, render(l, out3)]));
  ok('§10r a cap of 0 says the turns are SWITCHED OFF for the account (never «used its 0 turns»), with the Spending door', has(o3.en, /turns nobody typed are switched off for acct-1/) && !has(o3.en, /used its 0/) && has(o3.en, /Settings → Spending/) && has(o3.zh, /acct-1 的无人输入轮次已关闭/) && has(o3.ja, /acct-1 では誰も入力していないターンがオフです/), o3.en.text);
  const out4 = fileWith(null, { reason: 'job-notification', identity: null, sessionName: 'nightly' });
  const o4 = render('en', out4);
  ok('§10r identity-unknown says the account could not be told and WHERE TO LOOK (the Usage window, the [spend] lines) — no empty account, no «limit»', has(o4, /could not tell which account the turn would bill/) && has(o4, /Account: not known/) && has(o4, /\[spend\] lines/) && !/ on \.| on $/.test(o4.text), o4.text + ' | ' + o4.lines.join(' | '));
  const sc = A.refusalI18n({ ok: false, why: 'spend-control-reached', reason: 'peer-message', identity: id, limits: A.BUDGET_DEFAULTS, counts: { hour: 1, day: 1, instanceDay: 1 } }, { sessionName: 'ops' });
  const o5 = render('en', { i18n: sc });
  ok('§10r spend-control-reached names the CONTROL and says it is the vendor\'s (never a VibeSpace limit)', has(o5, /acct-1 has reached its spend control/) && has(o5, /set with the account’s vendor/) && !has(o5, /Change the limits/), o5.text);
  ok('§10r THE TABLE IS WHOLE: every why has its row; the toast and the notice share it (a refusal with no account never says «the limit is reached» unless it WAS a cap)',
    ['hour-cap', 'day-cap', 'instance-cap', 'identity-cannot-serve', 'spend-control-reached', 'identity-unknown', 'overage-in-use', 'unknown-reason'].every((w) => A.REFUSAL_WORDS[w] && A.REFUSAL_WORDS[w].length === 2) && A.REFUSAL_WORDS['switched-off'] && A.REFUSAL_WORDS.other);
  // CONTROL — the r1 renderer's input (b8d2d98e's refusalI18n, recreated): one generic sentence, no producer, no counts
  const r1 = { text: { key: '{account} has used its {cap} turns nobody typed this hour — VibeSpace held the next one. The next frees at {time}.', params: { account: 'acct-1', cap: 30, time: { at: Date.parse('2026-10-28T08:21:33Z') } } }, detail: [{ key: 'Turns you type, and the buttons you press that say «starts a turn», are never counted. Change the limits in Settings → Spending.' }] };
  const r1o = render('en', { i18n: r1 });
  ok('§10r CONTROL (the b8d2d98e notice, as it was filed): rendered, it carries NO producer, NO conversation, NO counts, NO «Spent by»', !has(r1o, /continue after a usage limit|build-bot|30 of 30|Spent by/));
  // r3 (accept-r2 claim 0: three facts of the stored English were not in the rendered notice, one toast still said «the
  // limit is reached» for a refusal with no why, and the Copy of a 12-producer notice said 6 of them)
  {
    // (a) IN FLIGHT: a cap of 3 reached by 3 holds — the English said «has spent 0 (+3 in flight)», the notice now says it
    const fl = fileWith((g) => { for (let i = 0; i < 3; i++) g.authorize({ reason: 'job-notification', identity: id, sessionName: 'nightly', hold: true, now: now - 1000 + i }); }, { reason: 'job-notification', identity: id, sessionName: 'nightly' }, { 'spend.unattendedPerIdentityHour': 3 });
    const of = render('en', fl), ofz = render('zh', fl);
    ok('§10r r3 IN FLIGHT: a cap reached by holds says them — «(+3 in flight)» in the English, «Also in flight: 3 …» rendered (en / zh), beside «0 of 3 this hour»',
      !!fl && /\(\+3 in flight\)/.test(fl.text) && has(of, /Also in flight: 3 started and not yet answered/) && has(of, /Turns nobody typed: 0 of 3 this hour/) && has(ofz, /另有 3 个已开始/), fl && [fl.text, of.lines.join(' | ')].join(' ⇒ '));
    // (b) THE OVERAGE EVIDENCE: «(last reported 7 min ago)» — rendered as the INSTANT it was reported, in the viewer's zone
    const ovDir = tmpdir('vs-spend-notice-ovg-');
    const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
    const ovStore = new UserTodoManager({ dataDir: ovDir, expirySweepMs: 0 });
    const nowR = Date.now();   // the guard judges an overage reading's age on the real clock
    const ovg = guardMod.create({ dataDir: ovDir, serverSetting: () => undefined, readCacheFor: () => ({ overage: { inUse: true, asOf: nowR - 7 * 60e3, resetsAt: Math.round((nowR + 3 * 3600e3) / 1000) } }), getUserTodos: () => ovStore });
    ovg.authorize({ reason: 'job-notification', identity: id, sessionName: 'nightly', hold: false, now: nowR });
    const ov = (ovStore.snapshot().open || []).find((x) => x.origin === 'spend' && x.i18n); ovStore.stop();
    const oo = render('en', ov, nowR), ooj = render('ja', ov, nowR);
    // the tray prints an instant through page-time (lane ui-language, the reader's round: the date beyond today, the page's zone)
    const seenClock = (await import(pathToFileURL(path.join(REPO, 'src/lib/page-time.js')).href)).stampAt(nowR - 7 * 60e3, { now: nowR });
    ok('§10r r3 THE OVERAGE EVIDENCE: «last reported 7 min ago» is rendered as the instant — «Paid overage was last reported at ' + seenClock + '.» (the viewer\'s zone; ja too)',
      !!ov && /last reported 7 min ago/.test(ov.text) && oo.lines.includes(`Paid overage was last reported at ${seenClock}.`) && has(ooj, /有料の超過利用が最後に報告されたのは/), ov && oo.lines.join(' | '));
    // (c) identity-unknown: the English said «(instance 7/800)» — the instance's count is rendered with no account
    const iu = fileWith((g) => { for (let i = 0; i < 7; i++) g.note({ reason: 'peer-message', identity: id, now: now - 60e3 + i }); }, { reason: 'job-notification', identity: null, sessionName: 'nightly' });
    const ou = render('en', iu);
    ok('§10r r3 identity-unknown says the INSTANCE\'s count (no account): «Turns nobody typed on this instance: 7 of 800 in 24 hours.»',
      !!iu && /\(instance 7\/800\)/.test(iu.detail) && has(ou, /Turns nobody typed on this instance: 7 of 800 in 24 hours\./) && has(ou, /Account: not known/), iu && ou.lines.join(' | '));
    // (d) TWELVE PRODUCERS: the eye folds after six («And 6 more producers.»); the RECORD a Copy says carries all twelve
    const twelve = [...Object.keys(A.SPEND_REASONS).filter((r) => !A.SPEND_REASONS[r].attended), 'unknown'].slice(0, 12);   // every gated reason (11) + the legacy stamp
    const v12 = { ok: false, why: 'hour-cap', reason: 'auto-resume', identity: id, limits: A.BUDGET_DEFAULTS, counts: { hour: 78, day: 78, instanceDay: 78 }, retryAfter: now + 600e3, producers: Object.fromEntries(twelve.map((r, i) => [r, 12 - i])) };
    const sDir = tmpdir('vs-spend-notice-12-');
    const st12 = new UserTodoManager({ dataDir: sDir, expirySweepMs: 0 });
    st12.add('spend|twelve', { text: A.refusalText(v12, { sessionName: 'ops' }), origin: 'spend', kind: 'notice', i18n: A.refusalI18n(v12, { sessionName: 'ops' }) });
    const i12 = (st12.snapshot().open || []).find((x) => x.i18n); st12.stop();
    const said12 = (l) => LY.saidLine(l, T.en, { now, locale: 'en-US', timeZone: 'America/Los_Angeles' });
    const eye = LY.itemDetailLinesOf(i12, said12), rec = LY.itemRecordLinesOf(i12, said12);
    console.log(`    12 producers: the eye ${eye.filter((l) => /^Spent by /.test(l)).length} rows + «${eye.find((l) => /^And /.test(l))}», the record (Copy) ${rec.filter((l) => /^Spent by /.test(l)).length} rows`);
    ok('§10r r3 THE FOLD IS FOR THE EYE: twelve producers show six «Spent by» rows and «And 6 more producers.»; the RECORD (what Copy says — user-todos-actions recordOf) carries all twelve rows, through the real store',
      twelve.length === 12 && !!i12 && eye.filter((l) => /^Spent by /.test(l)).length === 6 && eye.includes('And 6 more producers.') && rec.filter((l) => /^Spent by /.test(l)).length === 12 && !rec.some((l) => /^And \d+ more/.test(l)) && i12.i18n.detail.length <= 12,
      JSON.stringify({ eye, rec }));
    // (e) THE TOAST WITH NO WHY (the authorizer threw — conversation-deliver fails closed with refused:'spend', no why)
    const SSm = require(path.join(REPO, 'src/stash-summary.js'));
    const nw = SSm.handOverRefusalWords({ code: 'spend_refused' }, T.en, { now });
    ok('§10r r3 a hand-over refused with NO why is not a cap — the toast says the check refused without saying why, never «the limit … is reached», and names no Spending door',
      !/limit/.test(nw.text) && /without saying why/.test(nw.text) && nw.door === null, JSON.stringify(nw));
    // (f) r4 (accept-r3 confirmed 0): THE AUTHORIZER THROWS — the REAL hand-over door over the REAL ladder whose authorizer
    // throws: the 429 body's `error` is SAID in the toast (quoted, en / zh / ja), and the log lines the toast names are the
    // ones WRITTEN («[deliver] spend authorizer threw …», «[stash] hand-over refused … spend_refused …»); no «[spend]» line
    {
      const express = require(path.join(REPO, 'node_modules/express'));
      const http = require('node:http');
      const logs = [], logFn = (...a) => logs.push(a.map(String).join(' '));
      const ladder = require(path.join(REPO, 'src/server/conversation-deliver.js')).create({ dataDir: tmpdir('vs-spr4-'), peerMsg: {}, getHosts: () => [], getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => { }, authorizeSpend: () => { throw new Error('settings store unreadable'); }, noteSpend: () => { }, releaseSpend: () => { }, log: logFn });
      const entry = { from: 'peer', text: 'a waiting note' };
      const d = { deliverToConversation: (...a) => ladder.deliverToConversation(...a), stashEntries: () => [entry] };
      const app = express(); app.use(express.json());
      require(path.join(REPO, 'src/server/stash-handover.js')).create({ activeSessions: new Map([['s1', { backendSessionId: 'cid-r4' }]]), getDeliver: () => d, renderMsgStash: () => ({ text: 'a waiting note', shown: [entry], rest: [] }), renderNotifStash: () => '', log: { log: logFn, warn() { } } }).register(app);
      const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
      const body = await new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: srv.address().port, path: '/api/sessions/s1/stash/hand-over', method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } }, (rs) => { let b = ''; rs.on('data', (c) => { b += c; }); rs.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } res({ status: rs.statusCode, ...(j || {}) }); }); }); rq.end('{}'); });
      await new Promise((r) => srv.close(r));
      const said = { en: SSm.handOverRefusalWords(body, T.en, { now }).text, zh: SSm.handOverRefusalWords(body, T.zh, { now }).text, ja: SSm.handOverRefusalWords(body, T.ja, { now }).text };
      ok('§10r r4 THE AUTHORIZER THROWS at the real door: 429 spend_refused with no why — the toast SAYS the reply\'s error, quoted (en / zh / ja), names [stash] and [deliver], never [spend]',
        body.status === 429 && body.code === 'spend_refused' && body.why === null && body.error === 'spend authorizer failed: settings store unreadable'
          && said.en.includes('“' + body.error + '”') && ['zh', 'ja'].every((l) => said[l].includes(body.error) && !/MISSING/.test(said[l])) && Object.values(said).every((x) => /\[stash\]/.test(x) && /\[deliver\]/.test(x) && !/\[spend\]/.test(x)),
        JSON.stringify({ body, said }));
      ok('§10r r4 …and every log line the toast names IS written: «[deliver] spend authorizer threw …» and «[stash] hand-over refused for conversation cid-r4 — spend_refused: spend authorizer failed: …»; no «[spend]» line exists for a throw',
        logs.some((l) => /^\[deliver\] spend authorizer threw .*settings store unreadable/.test(l)) && logs.some((l) => /^\[stash\] hand-over refused for conversation cid-r4 — spend_refused: spend authorizer failed: settings store unreadable/.test(l)) && !logs.some((l) => /^\[spend\]/.test(l)),
        JSON.stringify(logs));
    }
  }
}

// ── §10b PLACEMENT NEVER STARTS A TURN (2026-09-28, lane-pool-pin) ─────────
// The pool's placement acts added that day — the conversation's pin (setConversationPin,
// behind POST /api/accounts/:poolId/pin), the removed-member evict (memberRemoved) and
// "Move every conversation here now" (POST …/gather) — re-point links and, on a cold pool,
// ask a client to restart; none of them may start a billed turn by itself. Read off the
// code: none of their bodies reaches a turn producer (the real-engine legs in
// test-pool-auto count auto-resume's fireNow at zero for the pin and the evict).
console.log('\n§10b the pool\'s placement acts start no turn');
{
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const routes = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
  const bodyOf = (src, head, end = '\n}\n') => { const i = src.indexOf(head); if (i < 0) return null; const j = src.indexOf(end, i); return j < 0 ? null : src.slice(i, j); };
  const TURN = /fireNow|sendToSession|deliverToConversation|attemptFire|chat-input|\.pty\.write\(/;
  for (const [name, body] of [['setConversationPin', bodyOf(eng, 'function setConversationPin(')], ['memberRemoved', bodyOf(eng, 'function memberRemoved(')], ['holdRemoved (the owner\'s 全B hold: it ARMS auto-resume, the continue is auto-resume\'s own fire through the ceiling)', bodyOf(eng, 'function holdRemoved(')], ['the gather route', bodyOf(routes, "app.post('/api/accounts/pool/:id/gather'", '\n});\n')], ['the pin route', bodyOf(routes, "app.post('/api/accounts/:poolId/pin'", '\n});\n')]]) {
    ok(`§10b ${name} exists and reaches no turn producer (fireNow / sendToSession / the delivery ladder / a pty write)`, !!body && body.length > 200 && !TURN.test(body), body ? (body.match(TURN) || [''])[0] : 'missing');
  }
  const ctl = 'function setConversationPin(x) {\n  getAutoResume()?.fireNow?.(x);\n' + 'x'.repeat(220) + '\n}\n';
  ok('§10b CONTROL: a pin writer that nudged auto-resume is caught', TURN.test(bodyOf(ctl, 'function setConversationPin(')));
}

// ── §10c A NEXT-TURN WATCH IS NEVER BILLED: STORED HITS KEEP THEIR ROAD (lane boot-flush-next-turn) ──
// Found by lane channel-recall-ledger: a GROUP watch on the free next-turn road with no member live parks its hits as
// pending; the next boot's flush (`scheduleBootPending` → `flushPending` → `wakeNow`) delivered them as a BILLED wake
// (spendReason 'channel-message') on a watch that asked never to be woken. Now a pending row carries its `road`, and
// every door that starts a delivery from stored hits asks the engine's `pendingRoadOf` first. (1) THE ROAD CENSUS —
// grep-derived over the engine + its families: every reader of stored hits (`pendingOf(`) that STARTS a delivery calls
// `pendingRoadOf(` after it in the same function; the one that only CARRIES them (a direct wake started by fresh hits)
// is a named row; every pending-row writer names its road; the next-turn door parks on the next-turn road. Planted
// controls are RED. (2) THE PROBE as legs over the REAL engine (restart = a new engine over the same data dir; the boot
// flush is driven by the window the boot armed), each with a patched copy of the engine as its RED control. (3) THE CARRY
// (lane stash-pending-live): a hit parked while nobody was live reaches a member when it COMES LIVE — carried by the next
// hit or by the member's own turn (the hook's stash drain), once, on the conversation's chain, never billed.
console.log('\n§10c a next-turn watch\'s stored hits ride the free stash at boot — never a billed wake');
{
  const { engineSource } = await import('./channels-engine-src.mjs');
  const STARTS = ['flushPending', 'flushScopeNow', 'scheduleBootPending', 'parkedNextTurn'];   // parkedNextTurn: the carry's one read (lane stash-pending-live)
  const CARRIES = { wakeNow: 'a direct wake started by FRESH hits carries what is stored along (no turn of its own; a next-turn watch never reaches wakeNow — onFresh hands it to stashHits)' };
  function roadCensus(src) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/ \/\/ .*$/, '')));
    const fns = [];
    code.forEach((l, i) => { const m = l.match(/^  (?:async )?function (\w+)\(/); if (m) fns.push({ name: m[1], a: i, b: code.findIndex((x, j) => j > i && /^  }\s*$/.test(x)) }); });
    const fnOf = (i) => { let f = null; for (const x of fns) if (x.a <= i && x.b >= i) f = x; return f; };
    const rows = [], violations = [];
    code.forEach((l, i) => {
      if (/\bpendingOf\(/.test(l) && !/function pendingOf\(/.test(l)) {
        const f = fnOf(i), name = f ? f.name : '?';
        if (CARRIES[name]) { rows.push({ kind: 'carries', fn: name, line: i + 1 }); return; }
        const j = f ? code.findIndex((x, k) => k > i && k <= f.b && /\bpendingRoadOf\(/.test(x)) : -1;
        rows.push({ kind: 'starts', fn: name, line: i + 1, road: j > 0 ? j + 1 : null });
        if (j < 0) violations.push(`stored hits read in ${name}() at line ${i + 1} start a delivery with no road check`);
      }
      if (/\.pending\.push\(/.test(l)) { const f = fnOf(i); rows.push({ kind: 'writer', fn: f ? f.name : '?', line: i + 1 }); if (!/\broad\b/.test(l)) violations.push(`a pending row written in ${f ? f.name : '?'}() at line ${i + 1} names no road`); }
      if (/\bkeepPending\(/.test(l) && !/function keepPending\(/.test(l)) { const f = fnOf(i); if (f && f.name === 'stashHits') { rows.push({ kind: 'next-turn-park', line: i + 1 }); if (!/'next-turn'\)/.test(l)) violations.push(`stashHits parks hits at line ${i + 1} without the next-turn road`); } }
    });
    const sp = fns.find((x) => x.name === 'stashPending');
    if (!sp) violations.push('no stashPending (the flush\'s next-turn road)');
    else if (code.slice(sp.a, sp.b + 1).some((l) => /deliverToConversation\(|billedWake\(|wakeNow\(/.test(l))) violations.push('stashPending reaches the ladder');
    return { rows, violations };
  }
  const esrc = engineSource(REPO);
  const c = roadCensus(esrc);
  const starts = c.rows.filter((r) => r.kind === 'starts');
  console.log('    road census rows: ' + c.rows.map((r) => `${r.kind}:${r.fn || ''}@${r.line}${r.road ? '→road@' + r.road : ''}`).join(' · '));
  ok('§10c the census finds the four readers that start a delivery from stored hits (the boot flush, the scope digest, the boot scheduler, the carry), each asking the road after its read', JSON.stringify(starts.map((r) => r.fn).sort()) === JSON.stringify([...STARTS].sort()) && starts.every((r) => r.road), JSON.stringify(starts));
  ok('§10c the one reader that only CARRIES stored hits is the named row (wakeNow)', c.rows.filter((r) => r.kind === 'carries').map((r) => r.fn).join() === Object.keys(CARRIES).join());
  ok('§10c every pending-row writer names its road (keepPending, wakeNow\'s re-hold, releaseAside — lane wake-approve-card r8: a held decision\'s Deliver puts its hits back, each on the road it was parked on), and the next-turn door parks on the next-turn road (4 sites)', c.rows.filter((r) => r.kind === 'writer').length === 3 && c.rows.filter((r) => r.kind === 'writer').some((r) => r.fn === 'releaseAside') && c.rows.filter((r) => r.kind === 'next-turn-park').length === 4);   // B-1ca5 r432: + the stop's hold and the in-flight park (each still on the next-turn road)
  ok('§10c THE CENSUS: no stored hit starts a delivery without its road', c.violations.length === 0, JSON.stringify(c.violations));
  const ROAD_LINE = "        if (pendingRoadOf(item.watcher, pend) === 'next-turn') { results.push(await stashPending(rec, convId, item, p, pend)); continue; }\n";
  const SCOPE_ROAD = "        if (pendingRoadOf(item.watcher, pend) !== 'wake') continue;";
  const BOOT_ROAD = " && pendingRoadOf(item.watcher, pend) === 'wake') {";
  const BOOT_ROAD2 = "if (pendingRoadOf(item.watcher, pend) !== 'wake') { armBoot(";   // lane wake-approve-card r6: the scheduler's conversation branch reads the road too (a next-turn road is never asked about its age)
  const WAKE_PUSH = "e2.pending.push({ record: h.record, why: h.why || [], at: t, road: 'wake', for: pk });";
  const STASH_PARK = "if (!fromPending) await keepPending(rec, convId, hits, 0, pk, 'next-turn');";
  ok('§10c the controls\' anchors are present once each', [ROAD_LINE, SCOPE_ROAD, BOOT_ROAD, BOOT_ROAD2, WAKE_PUSH, STASH_PARK].every((a) => esrc.split(a).length === 2));
  const red = (mut, re, what) => { const v = roadCensus(mut).violations; ok(`§10c CONTROL: ${what} is RED (${v.join('; ')})`, v.some((x) => re.test(x))); };
  red(esrc.replace(ROAD_LINE, ''), /in flushPending\(\) .* no road check/, 'the boot flush without its road check');
  red(esrc.replace(SCOPE_ROAD, ''), /in flushScopeNow\(\) .* no road check/, 'the scope digest without its road check');
  red(esrc.replace(BOOT_ROAD, ') {').replace(BOOT_ROAD2, 'if (false) { armBoot('), /in scheduleBootPending\(\) .* no road check/, 'the boot scheduler without its road checks');
  red(esrc.replace('  function tick() {', "  async function flushAgain(rec, convId, pk) {\n    const en = store.index.peek(`${rec.id}/${convId}`), eff = wakeEffOf(en), pend = pendingOf(en, pk, eff);\n    return billedWake({ conv: `${rec.id}/${convId}` }, () => wakeNow(rec, convId, pend.hits, { fromPending: pend, pk }));\n  }\n  function tick() {"), /in flushAgain\(\) .* no road check/, 'a planted second door that bills stored hits');
  red(esrc.replace(WAKE_PUSH, "e2.pending.push({ record: h.record, why: h.why || [], at: t, for: pk });"), /names no road/, 'a pending row written without its road');
  red(esrc.replace(STASH_PARK, 'if (!fromPending) await keepPending(rec, convId, hits, 0, pk);'), /without the next-turn road/, 'the next-turn door parking on the default (wake) road');
  const CARRY_ROAD = "    return pendingRoadOf(w, pend) === 'next-turn' ? pend : null;";
  ok('§10c the carry\'s road anchor is present once', esrc.split(CARRY_ROAD).length === 2);
  red(esrc.replace(CARRY_ROAD, '    return pend;'), /in parkedNextTurn\(\) .* no road check/, 'the carry reading parked hits without its road check');

  // (2) THE PROBE, as legs over the real engine (lane channel-recall-ledger's probe/group-next-turn.mjs, copied)
  const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
  const CH = require(path.join(REPO, 'src/channels/index.js'));
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
  const RA = 'fake-poll', ROPS = 'fake-poll-ops', RG = { kind: 'group', id: 'g-team', name: 'Team' };
  const MEMBER = { cid: 'member-1', name: 'Member', groups: ['g-team'] };
  async function bootLeg(ENGM, { grain = 'conversation', delivery = 'next-turn', notify = null, legacy = false, switchTo = null, liveAtBoot = true } = {}) {
    const dataDir = tmpdir('vs-spend-road-');
    let live = [];
    const billed = [], stashed = [];
    const mk = () => { const reg = CH.createChannelRegistry(); reg.register(FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] }));
      return ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry: reg, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir }), log: { log() {}, warn() {}, error() {} }, liveSessions: () => live,
        deliver: { deliverToConversation: async (cid, text, o) => { billed.push({ cid, reason: o && o.spendReason }); return { ok: true, lane: 'message' }; }, stashFor: (cid, e) => { stashed.push({ cid, text: e.text }); return { stored: true }; } } }); };
    let eng = mk();
    await eng.pass(RA, { force: true });
    const site = grain === 'account' ? { kind: 'account' } : { kind: 'conversation', convId: ROPS };
    const watcher = { principal: RG, delivery, ...(notify ? { notify, digestMinutes: 30 } : {}) };
    await eng.setGrain(RA, site, { access: [{ principal: RG, authority: 'draft' }], watchers: [watcher] });
    const m = eng.messages(RA, ROPS, { limit: 3 }); const recs = (m.records || m).slice(-1);
    await eng.onFresh(eng.adapterRecords().adapters.find((r) => r.id === RA), ROPS, recs, { origin: 'test' });
    await eng.settleWakes();
    const pendNow = () => ((eng.store.index.live()[`${RA}/${ROPS}`] || {}).pending || []);
    const parked = { billed: billed.length, stashed: stashed.length, roads: pendNow().map((p) => (p.road === undefined ? null : p.road)) };
    if (legacy) await eng.store.index.update(() => { const e2 = eng.store.index.entry(RA, ROPS, { create: false }); for (const p of e2.pending) delete p.road; });   // a row an older version wrote
    if (switchTo) await eng.setGrain(RA, site, { access: [{ principal: RG, authority: 'draft' }], watchers: [{ ...watcher, delivery: switchTo }] });
    await eng.stop();
    live = liveAtBoot ? [MEMBER] : [];
    eng = mk();
    eng.start();
    const windows = eng.pendingWindows().filter((w) => w.kind === 'boot');
    // what each boot timer does (BOOT_PENDING_DELAY_MS later), now
    for (const w of windows) await (w.key.startsWith('scope:') ? eng.flushScope(RA, 'account', null, w.principal) : eng.flushPending(RA, ROPS, { kind: 'boot', pk: w.principal }));
    await eng.settleWakes();
    const out = { parked, windows: windows.map((w) => (w.key.startsWith('scope:') ? 'scope' : 'conversation')), billed: billed.length, reasons: billed.map((b) => b.reason), stashed: stashed.length, to: stashed.map((x) => x.cid), pending: pendNow().length };
    await eng.stop();
    return out;
  }
  const J = (x) => JSON.stringify(x);
  const p1 = await bootLeg(ENG);
  ok('§10c the probe: a next-turn GROUP watch with nobody live parks its hit on the next-turn road — nothing billed, nothing stashed', p1.parked.billed === 0 && p1.parked.stashed === 0 && J(p1.parked.roads) === '["next-turn"]', J(p1));
  ok('§10c …after a restart with a member live the boot flush STASHES it for that member: billed 0, stashed 1, pending 0', p1.billed === 0 && p1.stashed === 1 && p1.to[0] === MEMBER.cid && p1.pending === 0 && J(p1.windows) === '["conversation"]', J(p1));
  const p2 = await bootLeg(ENG, { liveAtBoot: false });
  ok('§10c nobody live at the boot flush either ⇒ the hit stays pending as it was (not re-parked, not billed)', p2.billed === 0 && p2.stashed === 0 && p2.pending === 1, J(p2));
  const p3 = await bootLeg(ENG, { legacy: true });
  ok('§10c a row an older version wrote (no road) on a next-turn watch is read by the watch\'s CURRENT mode ⇒ stashed, never billed', p3.billed === 0 && p3.stashed === 1 && p3.pending === 0, J(p3));
  const p4 = await bootLeg(ENG, { delivery: 'wake', legacy: true });
  ok('§10c POSITIVE: a WAKE watch\'s held hit (an old row, no road) is still woken at boot — billed 1, as it always was', J(p4.parked.roads) === '["wake"]' && p4.billed === 1 && J(p4.reasons) === '["channel-message"]' && p4.stashed === 0 && p4.pending === 0, J(p4));
  const p5 = await bootLeg(ENG, { switchTo: 'wake' });
  ok('§10c parked on the next-turn road, the watch then switched to wake ⇒ the stored hit still rides the free stash', p5.billed === 0 && p5.stashed === 1, J(p5));
  const p6 = await bootLeg(ENG, { delivery: 'wake', switchTo: 'next-turn' });
  ok('§10c held on the wake road, the watch then switched to next-turn ⇒ never billed (the mode NOW is the stricter)', p6.billed === 0 && p6.stashed === 1, J(p6));
  const p7 = await bootLeg(ENG, { grain: 'account', notify: 'digest' });
  ok('§10c a whole-account next-turn watch stored with a digest: the boot arms the conversation\'s flush, never a scope digest ⇒ stashed, billed 0', J(p7.parked.roads) === '["next-turn"]' && J(p7.windows) === '["conversation"]' && p7.billed === 0 && p7.stashed === 1, J(p7));
  // RED CONTROLS: patched copies of the engine without the road (the f57d1cbe9 behaviour)
  const noRoad = mutantModule('src/server/channels-engine.js', [[ROAD_LINE, '']]);
  const m1 = noRoad.mod ? await bootLeg(noRoad.mod) : null;
  ok('§10c CONTROL: the engine without the flush\'s road check BILLS the probe\'s hit at boot (billed 1 — the bug)', m1 && m1.billed === 1 && J(m1.reasons) === '["channel-message"]' && m1.stashed === 0, noRoad.err || J(m1));
  const noScope = mutantModule('src/server/channels-engine.js', [[SCOPE_ROAD + '   // THE ROAD (lane boot-flush-next-turn): next-turn hits wait for the boot flush\'s free stash, never a billed digest', ''], [BOOT_ROAD, ') {']]);
  const m7 = noScope.mod ? await bootLeg(noScope.mod, { grain: 'account', notify: 'digest' }) : null;
  ok('§10c CONTROL: without the scheduler\'s and the scope digest\'s road checks the whole-account leg arms a scope digest and BILLS it', m7 && J(m7.windows) === '["scope"]' && m7.billed === 1, noScope.err || J(m7));

  // (3) lane stash-pending-live: THE CARRY. Lane boot-flush-next-turn's probe/live-later.mjs (copied): a member comes live
  // WITHOUT a restart and a second hit arrives ⇒ on d035f7cfa `stashed 1, pending still 1` — the second hit alone, the
  // parked one waiting for a boot. Now the next hand-over to a live member carries what its watcher parked: a fresh hit
  // (ONE block, the parked first — the shape a wake carries held hits in), or the member's own turn with no hit at all
  // (`carryParked`, asked by the hook's stash drain). Read on the conversation's chain: one parked row is handed over ONCE
  // however many doors move in one tick. Nothing is billed on any leg.
  const M2 = { cid: 'member-2', name: 'Member 2', groups: ['g-team'] };
  const STRANGER = { cid: 'stranger-9', name: 'Stranger', groups: ['g-other'] };
  const linesOf = (text) => String(text).split('\n').filter((l) => /^from /.test(l));
  async function liveLeg(ENGM, { then = 'hit', delivery = 'next-turn', liveNow = [MEMBER], turnOf = MEMBER.cid, failStash = false } = {}) {
    const dataDir = tmpdir('vs-spend-carry-');
    let live = [], failing = false;
    const billed = [], stashed = [];
    const reg = CH.createChannelRegistry(); reg.register(FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] }));
    const eng = ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry: reg, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir }), log: { log() {}, warn() {}, error() {} }, liveSessions: () => live,
      deliver: { deliverToConversation: async (cid, text, o) => { billed.push({ cid, reason: o && o.spendReason }); return { ok: true, lane: 'message' }; }, stashFor: (cid, e) => { if (failing) throw new Error('ENOSPC: no space left on device'); stashed.push({ cid, lines: linesOf(e.text) }); return { stored: true }; } } });
    await eng.pass(RA, { force: true });
    await eng.setGrain(RA, { kind: 'conversation', convId: ROPS }, { access: [{ principal: RG, authority: 'draft' }], watchers: [{ principal: RG, delivery }] });
    const m = eng.messages(RA, ROPS, { limit: 3 }); const recs = (m.records || m);
    const [older, newer] = recs.slice(-2);
    const who = (r) => `from ${r.author && r.author.name} at`;
    const rec = eng.adapterRecords().adapters.find((r) => r.id === RA);
    await eng.onFresh(rec, ROPS, [older], { origin: 'test' });
    await eng.settleWakes();
    const pendNow = () => ((eng.store.index.live()[`${RA}/${ROPS}`] || {}).pending || []);
    const parked = { n: pendNow().length, billed: billed.length, stashed: stashed.length };
    live = liveNow; failing = failStash;
    let queued = null;
    if (then === 'hit') await eng.onFresh(rec, ROPS, [newer], { origin: 'test' });
    else if (then === 'turn') queued = eng.carryParked(turnOf);
    else if (then === 'turn-twice') queued = eng.carryParked(turnOf) + eng.carryParked(turnOf);
    else if (then === 'all-at-once') {   // the boot flush, a fresh hit and the member's turn, in one tick
      const a = eng.flushPending(RA, ROPS, { kind: 'boot' });
      const b = eng.onFresh(rec, ROPS, [newer], { origin: 'test' });
      queued = eng.carryParked(turnOf);
      await Promise.all([a, b]);
    }
    await eng.settleWakes();
    const all = stashed.flatMap((x) => x.lines);
    const out = { distinct: who(older) !== who(newer), parked, queued, billed: billed.length, stashed: stashed.length, to: stashed.map((x) => x.cid),
      blocks: stashed.map((x) => x.lines.map((l) => (l.startsWith(who(older)) ? 'P' : l.startsWith(who(newer)) ? 'F' : '?')).join('')),
      parkedOut: all.filter((l) => l.startsWith(who(older))).length, freshOut: all.filter((l) => l.startsWith(who(newer))).length,
      pending: pendNow().length, pendingIds: pendNow().map((p) => p.record && p.record.id), again: then === 'turn' ? eng.carryParked(turnOf) : null };
    await eng.stop();
    return out;
  }
  const c1 = await liveLeg(ENG);
  ok('§10c THE PROBE (live-later): parked while nobody was live, a member comes live and a second hit arrives ⇒ ONE block carries both, the parked first; pending 0, billed 0', c1.distinct && c1.parked.n === 1 && c1.parked.stashed === 0 && c1.stashed === 1 && c1.to[0] === MEMBER.cid && J(c1.blocks) === '["PF"]' && c1.pending === 0 && c1.billed === 0, J(c1));
  const c2 = await liveLeg(ENG, { then: 'turn' });
  ok('§10c no new hit: the member\'s OWN TURN carries it (carryParked queues 1) ⇒ stashed for that member, pending 0, billed 0; a second turn finds nothing', c2.queued === 1 && c2.stashed === 1 && c2.to[0] === MEMBER.cid && J(c2.blocks) === '["P"]' && c2.pending === 0 && c2.billed === 0 && c2.again === 0, J(c2));
  const c3 = await liveLeg(ENG, { then: 'turn-twice' });
  ok('§10c two turns asking in ONE tick (SessionStart + a prompt) ⇒ handed over ONCE (the second carry reads the chain after the first cleared it)', c3.queued === 2 && c3.stashed === 1 && c3.parkedOut === 1 && c3.pending === 0 && c3.billed === 0, J(c3));
  const c4 = await liveLeg(ENG, { then: 'all-at-once' });
  ok('§10c the boot flush, a fresh hit and the member\'s turn in ONE tick ⇒ the parked message is handed over ONCE, the fresh once; pending 0, billed 0', c4.parkedOut === 1 && c4.freshOut === 1 && c4.pending === 0 && c4.billed === 0, J(c4));
  const c5 = await liveLeg(ENG, { then: 'turn', liveNow: [MEMBER, STRANGER], turnOf: STRANGER.cid });
  ok('§10c the turn of a live session OUTSIDE the group carries nothing (nothing queued, the hit stays parked)', c5.queued === 0 && c5.stashed === 0 && c5.pending === 1 && c5.billed === 0, J(c5));
  const c6 = await liveLeg(ENG, { then: 'turn', liveNow: [], turnOf: MEMBER.cid });
  ok('§10c a turn of a member that is not live (not in the roster) carries nothing', c6.queued === 0 && c6.stashed === 0 && c6.pending === 1, J(c6));
  const c7 = await liveLeg(ENG, { then: 'turn', liveNow: [MEMBER, M2], turnOf: M2.cid });
  ok('§10c two members live: the carry goes to the member whose turn asked (member-2), not the round-robin\'s pick', c7.queued === 1 && c7.stashed === 1 && J(c7.to) === J([M2.cid]) && c7.pending === 0, J(c7));
  const c8 = await liveLeg(ENG, { then: 'turn', delivery: 'wake' });
  ok('§10c POSITIVE: a WAKE watch\'s held hit is no carry\'s — the member\'s turn queues nothing and it waits for its own wake (the road judge)', c8.parked.n === 1 && c8.queued === 0 && c8.stashed === 0 && c8.pending === 1 && c8.billed === 0, J(c8));
  const c9 = await liveLeg(ENG, { failStash: true });
  ok('§10c the stash refuses the carry (ENOSPC) ⇒ the parked row stays and the fresh hit is parked ONCE beside it (no duplicate), billed 0', c9.stashed === 0 && c9.pending === 2 && new Set(c9.pendingIds).size === 2 && c9.billed === 0, J(c9));
  // RED CONTROLS (patched copies of the engine)
  const CARRY_DEFER = "    if (!fromPending && !carry && !stopped && parkedNextTurn(en, w, pk)) return billedWake({ conv: `${rec.id}/${convId}` }, () => stashHits(rec, convId, hits, { item, pk, batch, carry: true, prefer }));\n";
  const noCarry = mutantModule('src/server/channels-engine.js', [[CARRY_DEFER, '']]);
  const k1 = noCarry.mod ? await liveLeg(noCarry.mod) : null;
  ok('§10c CONTROL: without the hit\'s carry the probe answers as on d035f7cfa — the second hit alone, the parked one still pending', k1 && k1.stashed === 1 && J(k1.blocks) === '["F"]' && k1.pending === 1, noCarry.err || J(k1));
  const CARRY_QUEUE = "        track(billedWake({ conv: key }, () => stashHits(rec, en.id, [], { item, pk, carry: true, prefer: cid })));";
  // (B-43bc: the wake site's hand-over mark — the watcher's name and the receiver's — is a SECOND lock on this double; the
  // control lifts it too, so it still shows what the chain alone holds)
  const STASH_MARK = '    const vS = judgeHits(rec.id, convId, pk, target.cid, all, { ranOut: true });\n';   // B-1ca5 part B: the stash reads the marks through the ONE verdict
  const offChain = mutantModule('src/server/channels-engine.js', [[CARRY_QUEUE, "        track(stashHits(rec, en.id, [], { item, pk, carry: true, prefer: cid }));"], [STASH_MARK, '    const vS = { deliver: all, wait: [], kept: [], spent: [], ticket: null };\n']]);   // the control lifts the marks at the stash's read (every record deliverable)
  const k3 = offChain.mod ? await liveLeg(offChain.mod, { then: 'turn-twice' }) : null;
  ok('§10c CONTROL: the turn\'s carry read OFF the conversation\'s chain hands the parked message over TWICE on two asks in one tick', k3 && k3.stashed === 2 && k3.parkedOut === 2, offChain.err || J(k3));

  // THROUGH THE REAL HOOK ROUTES: the member's SessionStart (task-context) asks; its first prompt (prompt-context) drains it
  const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
  const AR_ROUTES = require(path.join(REPO, 'src/agent-routes.js'));
  async function turnLeg(routesMod, { backend = 'claude' } = {}) {
    const dir = tmpdir('vs-spend-turn-');
    const CID = 'c0ffee00-0000-4000-8000-0000000000f6';   // a real conversation id's shape (the roster's cid = the stash key = the hook caller's)
    let live = [];
    const billed = [];
    const s = { agentToken: 'vsst_m1', backend, cwd: dir, name: 'member', backendSessionId: CID, claudeSessionId: CID, mode: 'chat' };
    const sessions = new Map([['m1', s]]);
    const ladder = deliverMod.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => {}, log: () => {} });
    const reg = CH.createChannelRegistry(); reg.register(FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] }));
    const eng = ENG.create({ dataDir: dir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry: reg, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir: dir }), log: { log() {}, warn() {}, error() {} }, liveSessions: () => live,
      deliver: { deliverToConversation: async (cid, text, o) => { billed.push({ cid, reason: o && o.spendReason }); return { ok: true, lane: 'message' }; }, stashFor: (cid, e) => ladder.stashFor(cid, e) } });
    const routes = {};
    const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
    routesMod.setupAgentRoutes({ app, activeSessions: sessions, tasks: new TaskGroupManager({ dataDir: dir, onChange: () => {}, getSetting: () => undefined }), deliver: ladder, getJobs: () => null, getChannels: () => eng,
      sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], dropNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
      SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
      userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
      sessionStatusKey: () => `${backend}:${CID}`, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null });
    const get = (p) => { let out; const res = { json: (o) => { out = o; return res; }, status: () => res }; const cl = console.log; console.log = () => {}; try { routes[`GET ${p}`]({ headers: { authorization: 'Bearer vsst_m1' }, query: {}, body: {} }, res); } finally { console.log = cl; } return (out && out.context) || ''; };
    await eng.pass(RA, { force: true });
    await eng.setGrain(RA, { kind: 'conversation', convId: ROPS }, { access: [{ principal: RG, authority: 'draft' }], watchers: [{ principal: RG, delivery: 'next-turn' }] });
    const m = eng.messages(RA, ROPS, { limit: 3 }); const older = (m.records || m).slice(-2, -1)[0];
    await eng.onFresh(eng.adapterRecords().adapters.find((r) => r.id === RA), ROPS, [older], { origin: 'test' });
    await eng.settleWakes();
    const pendNow = () => ((eng.store.index.live()[`${RA}/${ROPS}`] || {}).pending || []).length;
    const parked = pendNow();
    live = [{ cid: CID, name: 'member', groups: ['g-team'] }];   // the member comes live: its session starts
    const needle = `from ${older.author && older.author.name} at`;
    const ctx = [];
    ctx.push(get('/api/agent/task-context'));   // SessionStart (codex: the door answers '' before any drain)
    await eng.settleWakes();
    ctx.push(get('/api/agent/prompt-context'));
    await eng.settleWakes();
    ctx.push(get('/api/agent/prompt-context'));
    const out = { parked, inCtx: ctx.map((c) => c.split(needle).length - 1), pending: pendNow(), billed: billed.length, stashLeft: ladder.stashCount(CID) };
    await eng.stop();
    return out;
  }
  const t1 = await turnLeg(AR_ROUTES);
  ok('§10c THE MEMBER\'S TURN through the REAL hook routes: SessionStart asks, the FIRST prompt carries the parked message once, the next carries nothing; pending 0, billed 0', t1.parked === 1 && J(t1.inCtx) === '[0,1,0]' && t1.pending === 0 && t1.billed === 0 && t1.stashLeft === 0, J(t1));
  const t2 = await turnLeg(AR_ROUTES, { backend: 'codex' });
  ok('§10c …a harness without SessionStart (codex): its first prompt asks, the carry lands in the stash and rides the NEXT prompt (never lost, never billed)', t2.parked === 1 && J(t2.inCtx) === '[0,0,1]' && t2.pending === 0 && t2.billed === 0, J(t2));
  const noAsk = mutantModule('src/agent-routes.js', [['        carryParkedFor(caller2.conversationId);\n', '']]);
  const k4 = noAsk.mod ? await turnLeg(noAsk.mod) : null;
  ok('§10c CONTROL: the hook routes without the ask ⇒ the member\'s turns carry nothing and the hit stays parked (the d035f7cfa behaviour: it waits for a boot)', k4 && J(k4.inCtx) === '[0,0,0]' && k4.pending === 1, noAsk.err || J(k4));
}

// ── §11 THE TREE IS NEVER WRITTEN (B-59b8 r1 / B-0220) ──────────────────────
// Measured HERE, while every patched copy this run made still exists (the exit
// handler removes them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS in src/server/ (gitignored,
// so a plain `git status` never saw them) and any suite scanning src/ beside
// this one counted them as product code.
console.log('\n§11 the patched copies never touch the tree');
for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 8 })) ok('§11 ' + r.name, r.pass, r.detail);

// §12 lane webhook-l1-server: THE PER-PATH WAKE BUDGET (docs/design-webhook.zh.md §6) is wired on the ONE wake door —
// judged before the watcher's own pace and before the wake's ledger row (the bill); a refusal is a hold, never a turn
console.log('\n§12 the per-path wake budget on the wake door');
{
  const eng = read('src/server/channels-engine.js');
  const i = eng.indexOf('async function wakeNow(');
  const b = eng.indexOf('const budget = pathBudgetVerdict(rec, convId, en, t);', i);
  const p = eng.indexOf('const pace = F.paceVerdict(paceWakes, t, F.digestCap(w));', i);
  const r = eng.indexOf('const resId = await reserveWake(', i);
  ok('§12 wakeNow judges the per-path budget, THEN the watcher\'s pace, THEN reserves the wake row (the bill)', i > 0 && b > i && p > b && r > p, { i, b, p, r });
  ok('§12 a budget refusal is a HOLD (keepPending + the named refusal) — never a dropped hit, never a billed turn', /if \(!budget\.ok\) \{\n\s+if \(!fromPending\) await keepPending\(rec, convId, freshHits, newElided, pk\);\n\s+await noteRefusal\(rec, convId, budget\.why, t, item\);/.test(eng));
  const mut = eng.replace('const budget = pathBudgetVerdict(rec, convId, en, t);', '').replace('const pace = F.paceVerdict(paceWakes, t, F.digestCap(w));', 'const pace = F.paceVerdict(paceWakes, t, F.digestCap(w));\n    const budget = pathBudgetVerdict(rec, convId, en, t);');
  const mb = mut.indexOf('const budget = pathBudgetVerdict(', i), mp = mut.indexOf('const pace = F.paceVerdict(', i);
  ok('§12 CONTROL: the budget moved AFTER the pace is RED by the same order check', !(mb > i && mp > mb));
}

// §13 lane auto-resume-bulk (.349): «恢复所有因用量/过载停止的会话» — ONE press, N billed turns, ONE authorization over the
// WHOLE batch. THE OWNER'S RULING 2026-11-18 (B): the press IS THE PERSON'S OWN ACT — reason `bulk-resume` is ATTENDED (none
// of the N counted, no hold, no stamp; paid overage still refused BY NAME). The batch door's arithmetic is kept and driven on
// the press-less twin (`auto-resume`, gated — a batch no door pressed is N automatic continues): every slot's share and the
// instance total against charges AND holds, the first refusal refuses all, N holds that bind every concurrent producer, a
// refusal holds nothing and is said once. The census: the bulk site is a GATED row, without its batch gate UNWIRED.
console.log('\n§13 the bulk resume: one authorization for N turns (all or nothing)');
{
  const L = { perIdentityHour: 5, perIdentityDay: 50, perInstanceDay: 8, noticePct: 0 };
  const IA = { key: 'sub-a', name: 'A' }, IB = { key: 'sub-b', name: 'B' };
  const stamps = (k, n, now) => Array.from({ length: n }, (_, i) => ({ at: now - (i + 1) * 60e3, reason: 'auto-resume' }));
  const now = Date.now();
  const state = { v: 1, identities: { 'sub-a': stamps('sub-a', 2, now) }, instance: stamps('i', 2, now), notices: {} };
  const TWIN = 'auto-resume';   // the press-less twin: the batch door's arithmetic, on a gated reason
  const B = (groups, extra = {}) => A.authorizeUnattendedBatch({ reason: TWIN, groups, state, limits: L, now, ...extra });
  // THE ATTENDED PRESS (the owner's ruling 2026-11-18): far over every cap, it is still allowed — and the brakes that bind a press bind it
  ok('§13 PURE: `bulk-resume` is a row of the spend reasons marked ATTENDED', A.SPEND_REASONS['bulk-resume'] && A.SPEND_REASONS['bulk-resume'].attended === true);
  const att = (groups, extra = {}) => A.authorizeUnattendedBatch({ reason: 'bulk-resume', groups, state, limits: L, now, ...extra });
  ok('§13 PURE ATTENDED: 40 on A + 40 on B (A\'s hour 2 of 5, the instance\'s day 2 of 8) is ALLOWED — none counted against the caps', (() => { const v = att([{ identity: IA, n: 40 }, { identity: IB, n: 40 }]); return v.ok === true && v.attended === true; })());
  // FORM TWO (主开发 2026-11-18 16:20Z — «an ACCOUNT already in paid overage is still refused: the account, not the press»)
  ok('§13 PURE ATTENDED: paid overage in use on B refuses B BY NAME — and A\'s share goes on (the account, not the press)', (() => { const v = att([{ identity: IA, n: 3 }, { identity: IB, n: 2 }], { ofKey: (k) => (k === 'sub-b' ? { overage: { inUse: 'yes' } } : {}) }); return v.ok === true && v.attended === true && v.groups.length === 1 && v.refusedSlots.length === 1 && v.refusedSlots[0].identity.key === 'sub-b' && v.refusedSlots[0].why === 'overage-in-use' && v.refusedSlots[0].n === 2 && /B/.test(v.refusedSlots[0].detail); })());
  ok('§13 PURE ATTENDED: …EVERY account in overage ⇒ the press starts nothing, refused, each account named', (() => { const v = att([{ identity: IA, n: 1 }, { identity: IB, n: 1 }], { ofKey: () => ({ overage: { inUse: 'yes' } }) }); return v.ok === false && v.why === 'overage-in-use' && v.refusedSlots.map((r) => r.identity.key).join() === 'sub-a,sub-b'; })());
  // (4) THE BATCH LAYER FAILS CLOSED (主开发 20:16Z): handed the ledger, an unreadable budget refuses a gated batch BY NAME, as the
  // single authorizer does; an attended press passes, as the single one does. The control proves its plant first
  {
    const LEDGER = { unreadable: true, error: 'Unexpected token in JSON' };
    const tw = (ledger) => B([{ identity: IA, n: 1 }], ledger ? { ledger } : {});
    const plant = tw(null), red = tw(LEDGER);
    ok('§13 (4) CONTROL FIRST: the same twin batch with a READABLE ledger is allowed (the plant is the ledger fact alone)', plant.ok === true, JSON.stringify(plant));
    ok('§13 (4) the batch authorizer handed an UNREADABLE ledger refuses the gated batch BY NAME (ledger-unreadable), as the single one does', red.ok === false && red.why === 'ledger-unreadable' && /could not be read/.test(red.detail), JSON.stringify(red));
    ok('§13 (4) …an attended press passes it, exactly as the single authorizer does for an attended reason', att([{ identity: IA, n: 1 }], { ledger: LEDGER }).ok === true && A.authorizeUnattendedSpend({ reason: 'bulk-resume', identity: IA, state, limits: L, now, ledger: LEDGER }).ok === true);
  }
  // (3) THE RECORD OF A PRESS: one press row (when, how many, the batch id) beside its per-continue rows, FOLDED by account — a press
  // of 600 never pushes its own first rows or the day's earlier ones out. The control proves the cap is the plant first
  {
    let st = A.emptyBudget();
    for (let i = 0; i < 3; i++) st = A.noteUnattendedSpend(st, { identity: { key: 'Z' }, reason: 'held-deliver', at: now - 3600e3 + i }).state;
    st = A.notePressRow(st, { reason: 'bulk-resume', press: 'rb-600', n: 600, at: now });
    for (let i = 0; i < 600; i++) st = A.noteUnattendedSpend(st, { identity: { key: i % 2 ? 'sub-a' : 'sub-b' }, reason: 'bulk-resume', press: 'rb-600', at: now + i }).state;
    const rows = A.pruneBudget(st, now + 1000).attended, counts = A.producerCounts(rows), pressRow = rows.find((t) => t.press === 'rb-600' && t.planned === 600);
    let un = A.emptyBudget();
    for (let i = 0; i < 3; i++) un = A.noteUnattendedSpend(un, { identity: { key: 'Z' }, reason: 'held-deliver', at: now - 3600e3 + i }).state;
    for (let i = 0; i < 600; i++) un = A.noteUnattendedSpend(un, { identity: { key: 'sub-a' }, reason: 'bulk-resume', at: now + i }).state;
    ok('§13 (3) CONTROL FIRST: 600 UNFOLDED continues push the day\'s earlier rows out (the tally keeps ' + A.pruneBudget(un, now + 1000).attended.length + ' rows — the cap is the plant)', !A.pruneBudget(un, now + 1000).attended.some((t) => t.reason === 'held-deliver'));
    ok('§13 (3) a press of 600: ONE press row (600, its batch id) + one folded row per account; the day\'s 3 earlier rows kept; the counts say 600 continues and 3 presses of the other reason', rows.length === 6 && !!pressRow && counts['bulk-resume'] === 600 && counts['held-deliver'] === 3, JSON.stringify({ n: rows.length, counts }));
  }
  ok('§13 PURE CONTROL: the gated twin stays ALL OR NOTHING — overage on B refuses its whole batch', (() => { const v = B([{ identity: IA, n: 1 }, { identity: IB, n: 1 }], { ofKey: (k) => (k === 'sub-b' ? { overage: { inUse: 'yes' } } : {}) }); return v.ok === false && v.why === 'overage-in-use' && !v.refusedSlots; })());
  ok('§13 PURE CONTROL: the same 40 + 40 on the gated twin is refused by the hour cap', B([{ identity: IA, n: 40 }, { identity: IB, n: 40 }]).why === 'hour-cap');
  ok('§13 PURE: A holds 2 of 5 this hour ⇒ a share of 3 on A + 2 on B fits (instance 2 + 5 = 7 ≤ 8)', B([{ identity: IA, n: 3 }, { identity: IB, n: 2 }]).ok === true);
  const r1 = B([{ identity: IA, n: 4 }, { identity: IB, n: 1 }]);
  ok('§13 PURE: a share of 4 on A (2 + 4 > 5) refuses the WHOLE batch, naming the bucket and the slot', r1.ok === false && r1.why === 'hour-cap' && r1.identity && r1.identity.key === 'sub-a' && /this batch needs 4 more/.test(r1.detail) && r1.n === 5, JSON.stringify(r1));
  const r2 = B([{ identity: IA, n: 3 }, { identity: IB, n: 4 }]);
  ok('§13 PURE: each slot fits but the INSTANCE does not (2 + 7 > 8) ⇒ refused by the instance cap', r2.ok === false && r2.why === 'instance-cap', JSON.stringify(r2));
  ok('§13 PURE: the live HOLDS count like charges (3 holds on A ⇒ a share of 1 refuses)', B([{ identity: IA, n: 1 }], { pending: [{ id: 'h1', key: 'sub-a', at: now }, { id: 'h2', key: 'sub-a', at: now }, { id: 'h3', key: 'sub-a', at: now }] }).why === 'hour-cap');
  ok('§13 PURE FAIL CLOSED: an empty batch, a slot nobody can name, an undeclared reason — all refused', B([]).ok === false && B([{ identity: null, n: 1 }]).why === 'identity-unknown' && A.authorizeUnattendedBatch({ reason: 'nope', groups: [{ identity: IA, n: 1 }], state, limits: L, now }).why === 'unknown-reason');
  ok('§13 PURE: an overage slot in the batch refuses it (the per-slot facts ride ofKey)', B([{ identity: IA, n: 1 }, { identity: IB, n: 1 }], { ofKey: (k) => (k === 'sub-b' ? { overage: { inUse: 'yes' } } : {}) }).why === 'overage-in-use');
  // need = 1 IS the old rule: the single gate's boundary did not move
  const single = (n) => A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: IA, state: { v: 1, identities: { 'sub-a': stamps('a', n, now) }, instance: [], notices: {} }, limits: L, now });
  ok('§13 the SINGLE gate\'s boundary is unchanged by `need` (4 used of 5 ⇒ allowed; 5 used ⇒ refused)', single(4).ok === true && single(5).ok === false && single(5).why === 'hour-cap');

  // the guard: N holds, binding every concurrent producer; a refusal holds NOTHING and is said ONCE
  const dir = tmpdir('vs-spend-bulk-');
  const todos = [];
  const settings = { 'spend.unattendedPerIdentityHour': 3, 'spend.unattendedPerInstanceDay': 100 };
  const g = guardMod.create({ dataDir: dir, serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, getUserTodos: () => ({ add: (k, it) => { todos.push(it); } }), log: () => { } });
  const sess = (slot, id) => ({ session: { _slot: slot, name: id }, sessionId: id, sessionName: id });
  { // THE ATTENDED PRESS ON THE GUARD: no hold, nothing bound, no stamp — the attended tally sees each delivered continue
    const gA = guardMod.create({ dataDir: tmpdir('vs-spend-bulkatt-'), serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, getUserTodos: () => ({ add: () => { } }), log: () => { } });
    const many = Array.from({ length: 10 }, (_, i) => sess('A', 'p' + i));
    const vA = gA.authorizeBatch({ reason: 'bulk-resume', items: many });
    ok('§13 GUARD ATTENDED: a press of 10 on A (cap 3 an hour) is allowed with one row per item and NO hold — nothing booked', vA.ok === true && vA.attended === true && vA.holds.length === 10 && vA.holds.every((h) => h.hold === null && h.identity.key === 'A') && gA.snapshot().holdsOpen === 0, JSON.stringify({ ok: vA.ok, why: vA.why, holds: (vA.holds || []).length, open: gA.snapshot().holdsOpen }));
    for (const h of vA.holds) gA.note({ reason: 'bulk-resume', identity: h.identity, hold: h.hold });
    const b0 = gA.snapshot().budget;
    ok('§13 GUARD ATTENDED: the 10 delivered continues write NO stamp to the unattended ledger — 10 in the attended tally', (b0.identities.A || []).length === 0 && (b0.instance || []).length === 0 && (b0.attended || []).filter((x) => x.reason === 'bulk-resume').length === 10, JSON.stringify({ a: (b0.identities.A || []).length, att: (b0.attended || []).length }));
    const x3 = [0, 1, 2].map(() => gA.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' } }));
    ok('§13 GUARD ATTENDED: …and A\'s hourly room is whole for its OWN automatic continues (3 of 3 still authorized)', x3.every((x) => x.ok === true), JSON.stringify(x3.map((x) => x.why)));
  }
  { // the cure's should: a conversation with NO billing slot never refuses the whole PRESS — skipped by name, the rest held; the twin still fails closed whole
    const gU = guardMod.create({ dataDir: tmpdir('vs-spend-bulkun-'), serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, getUserTodos: () => ({ add: () => { } }), log: () => { } });
    const ghost = { session: { name: 'ghost' }, sessionId: 'g', sessionName: 'ghost' };
    const vU = gU.authorizeBatch({ reason: 'bulk-resume', items: [sess('A', 'a1'), ghost] }), tU = gU.authorizeBatch({ reason: TWIN, items: [sess('A', 'a1'), ghost] });
    ok('§13 GUARD ATTENDED: an item whose slot cannot be named is skipped (identity-unknown) and the press goes on with the named; the gated twin refuses whole', vU.ok === true && vU.holds.map((h) => h.sessionId).join() === 'a1' && vU.skipped.some((x) => x.sessionId === 'g' && x.why === 'identity-unknown') && tU.ok === false && tU.why === 'identity-unknown', JSON.stringify({ vU, tU }));
    // (3) on the guard: the press row and the folded continues, through note({press}) and notePress
    gU.notePress({ reason: 'bulk-resume', press: 'rb-g', n: 2 });
    gU.note({ reason: 'bulk-resume', identity: { key: 'A', name: 'A' }, hold: null, press: 'rb-g' }); gU.note({ reason: 'bulk-resume', identity: { key: 'A', name: 'A' }, hold: null, press: 'rb-g' });
    const attG = gU.snapshot().budget.attended || [];
    ok('§13 (3) GUARD: notePress writes ONE press row (2, rb-g); its two continues on A fold into one row counting 2; nothing stamped', attG.filter((t) => t.press === 'rb-g' && t.planned === 2).length === 1 && attG.filter((t) => t.press === 'rb-g' && t.key === 'A' && t.count === 2).length === 1 && (gU.snapshot().budget.identities.A || []).length === 0, JSON.stringify(attG));
  }
  { // 主开发 21:04Z: (b) the press's END says how many it delivered; (a) the presses of the day as the owner reads them; (f) a paced
    // press longer than a day keeps its rows — CONTROL FIRST: a press row nothing touched for 30 h IS pruned (the plant is the stamp)
    const H = 3600e3;
    let lone = A.notePressRow(A.emptyBudget(), { reason: 'bulk-resume', press: 'rb-lone', n: 1, at: now - 30 * H });
    ok('§13 (f) CONTROL FIRST: a press row with no continue for 30 h is pruned out of the day (what the stamp below prevents)', A.pressesOf(lone, { now }).length === 0);
    let st = A.notePressRow(A.emptyBudget(), { reason: 'bulk-resume', press: 'rb-long', n: 16, at: now - 30 * H });
    for (let h = 30; h >= 1; h -= 2) st = A.noteUnattendedSpend(st, { identity: { key: 'sub-a', name: 'A' }, reason: 'bulk-resume', press: 'rb-long', at: now - h * H }).state;
    st = A.notePressEnd(st, { press: 'rb-long', delivered: 15, at: now - H });
    const day = A.pressesOf(st, { now });
    ok('§13 (f)+(b) a paced press of 30 h keeps its press row and its folded row (pruned by the LAST continue): planned 16, delivered 15, A ×15', day.length === 1 && day[0].planned === 16 && day[0].delivered === 15 && day[0].byAccount.length === 1 && day[0].byAccount[0].name === 'A' && day[0].byAccount[0].n === 15, JSON.stringify(day));
    const running = A.pressesOf(A.notePressRow(A.emptyBudget(), { reason: 'bulk-resume', press: 'rb-run', n: 4, at: now }), { now });
    ok('§13 (b) a press not ended yet says delivered null (still running) — never a count it has not reached', running.length === 1 && running[0].delivered === null && running[0].planned === 4, JSON.stringify(running));
    const gP = guardMod.create({ dataDir: tmpdir('vs-spend-bulkpress-'), serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, getUserTodos: () => ({ add: () => { } }), log: () => { } });
    gP.notePress({ reason: 'bulk-resume', press: 'rb-p', n: 3 }); gP.note({ reason: 'bulk-resume', identity: { key: 'A', name: 'A' }, hold: null, press: 'rb-p' }); gP.note({ reason: 'bulk-resume', identity: { key: 'B', name: 'B' }, hold: null, press: 'rb-p' }); gP.notePressEnd({ press: 'rb-p', delivered: 2 });
    const pt = gP.pressesToday();
    ok('§13 (a) GUARD pressesToday: the press of the day — planned 3, delivered 2, A 1 · B 1 — the owner\'s spending view reads this', pt.length === 1 && pt[0].planned === 3 && pt[0].delivered === 2 && pt[0].byAccount.map((x) => x.name + ':' + x.n).sort().join() === 'A:1,B:1', JSON.stringify(pt));
  }
  { // (4) on the guard: an UNREADABLE budget file — the twin batch and its quiet preview refuse by name (control first: the file is unreadable)
    const dU = tmpdir('vs-spend-bulkled-');
    fs.writeFileSync(path.join(dU, 'spend-budget.json'), '{ not json');
    const gL = guardMod.create({ dataDir: dU, serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, getUserTodos: () => ({ add: () => { } }), log: () => { } });
    ok('§13 (4) CONTROL FIRST: the guard reads its budget file as UNREADABLE (the plant)', !!gL.snapshot().ledgerUnreadable, JSON.stringify(gL.snapshot().ledgerUnreadable));
    const tL = gL.authorizeBatch({ reason: TWIN, items: [sess('A', 'a1')] }), pL = gL.previewBatch({ reason: TWIN, items: [sess('A', 'a1')] });
    ok('§13 (21:55Z (1)) GUARD: an unreadable record answers the presses of the day with NULL — never an empty list read as «no presses»', gL.pressesToday() === null);
    ok('§13 (4) GUARD: the twin batch AND its quiet preview refuse BY NAME on the unreadable ledger (every layer of the money gate fails closed)', tL.ok === false && tL.why === 'ledger-unreadable' && pL.refusedSlots.length === 1 && pL.refusedSlots[0].why === 'ledger-unreadable', JSON.stringify({ tL: tL.why, pL }));
  }
  { // FORM TWO on the guard: B in paid overage — A's items go on, B's come back SKIPPED by name; the plan's preview is QUIET
    const logsB = [], todosB = [];
    const gB = guardMod.create({ dataDir: tmpdir('vs-spend-bulkov-'), serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, readCacheFor: (k) => (k === 'B' ? { overage: { inUse: true, asOf: Date.now() - 60e3 } } : null), getUserTodos: () => ({ add: (k, it) => { todosB.push(it); } }), log: (l) => logsB.push(String(l)) });
    const items = [sess('A', 'a1'), sess('B', 'b1'), sess('A', 'a2'), sess('B', 'b2')];
    const pv = gB.previewBatch({ reason: 'bulk-resume', items });
    const quiet = logsB.length === 0 && todosB.length === 0 && gB.snapshot().holdsOpen === 0;
    ok('§13 GUARD previewBatch: B named (overage-in-use, 2 conversations) — and QUIET: nothing held, nothing journalled, nothing filed', pv.refusedSlots.length === 1 && pv.refusedSlots[0].identity.key === 'B' && pv.refusedSlots[0].why === 'overage-in-use' && pv.refusedSlots[0].n === 2 && quiet, JSON.stringify({ pv, logsB, todosB }));
    const vB = gB.authorizeBatch({ reason: 'bulk-resume', items });
    // (2) where the instance ALLOWS turns in paid overage, the preview says so and names the account the press would bill as overage
    const gO = guardMod.create({ dataDir: tmpdir('vs-spend-bulkovok-'), serverSetting: (k) => (k === 'spend.allowOverageTurns' ? true : settings[k]), identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, readCacheFor: (k) => (k === 'B' ? { overage: { inUse: true, asOf: Date.now() - 60e3 } } : null), getUserTodos: () => ({ add: () => { } }), log: () => { } });
    const pvO = gO.previewBatch({ reason: 'bulk-resume', items });
    ok('§13 (2) GUARD previewBatch where paid overage is ALLOWED: nothing refused, overageAllowed, and B named as billed (2 continues) — the dialog\'s sentence and cost line read it', pvO.refusedSlots.length === 0 && pvO.overageAllowed === true && pvO.overageBilled.length === 1 && pvO.overageBilled[0].identity.key === 'B' && pvO.overageBilled[0].n === 2 && pv.overageAllowed === false && pv.overageBilled.length === 0, JSON.stringify({ pvO, pv }));
    ok('§13 GUARD ATTENDED FORM TWO: the press holds rows for A\'s two only; B\'s two come back skipped, by name and rule; the journal names B; no For-you item', vB.ok === true && vB.holds.map((h) => h.sessionId).join() === 'a1,a2' && vB.skipped.map((x) => `${x.sessionId}:${x.identity.key}:${x.why}`).join() === 'b1:B:overage-in-use,b2:B:overage-in-use' && logsB.some((l) => /bulk-resume: 2 on B left stopped — overage-in-use/.test(l)) && todosB.length === 0, JSON.stringify({ vB, logsB }));
  }
  const ok1 = g.authorizeBatch({ reason: TWIN, items: [sess('A', 'a1'), sess('A', 'a2'), sess('B', 'b1')] });
  ok('§13 GUARD: an allowed batch opens ONE hold per item, each on the slot it will bill', ok1.ok && ok1.holds.length === 3 && ok1.holds.filter((h) => h.identity.key === 'A').length === 2 && g.snapshot().holdsOpen === 3, JSON.stringify(ok1.holds));
  ok('§13 GUARD: …and those holds BIND a concurrent single producer (A has 2 held of 3 ⇒ one more fits, two do not)', (() => { const x = g.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' } }); const y = g.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' } }); g.release({ hold: x.hold }); return x.ok && !y.ok && y.why === 'hour-cap'; })());
  for (const h of ok1.holds) g.note({ reason: TWIN, identity: h.identity, hold: h.hold });
  ok('§13 GUARD (the twin): each delivered turn converts its hold into ONE stamp under its reason (no double count)', g.snapshot().holdsOpen === 0 && (g.snapshot().budget.identities.A || []).filter((s) => s.reason === TWIN).length === 2);
  const no = g.authorizeBatch({ reason: TWIN, items: [sess('A', 'a3'), sess('A', 'a4')] });
  ok('§13 GUARD: a batch that does not fit is refused WHOLE — no hold opened, its bucket + slot named', no.ok === false && no.why === 'hour-cap' && !no.holds && g.snapshot().holdsOpen === 0 && /A has spent 2/.test(no.detail), JSON.stringify(no));
  ok('§13 a refusal made by HOLDS alone promises no instant (retryAfter 0 — never «Next allowed after 12/31/1969»)', /Next allowed after 12\/31\/1969|1970/.test(todos.map((x) => x.text).join()) === false && A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: IA, state: A.emptyBudget(), limits: L, now, pending: Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, key: 'sub-a', at: now })) }).retryAfter === 0, JSON.stringify(todos.map((x) => x.text)));
  ok('§13 the refusal carries the bucket\'s numbers for the person\'s words: A has LEFT 1 of 3 this hour, the batch NEEDS 2', no.left === 1 && no.need === 2, JSON.stringify({ left: no.left, need: no.need }));
  // A RE-ASK OF ONE CONTINUE NAMES ITS CONVERSATION in the journal (the U2 cure's should): the batch's loop asks again before each
  // deliver with a batch of one — its refusal line said «for a batch of 1»
  {
    const logs9 = [];
    const g9 = guardMod.create({ dataDir: tmpdir('vs-spend-bulk9-'), serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, getUserTodos: () => ({ add: () => { } }), log: (l) => logs9.push(String(l)) });
    const full = g9.authorizeBatch({ reason: TWIN, items: [sess('A', 'x1'), sess('A', 'x2'), sess('A', 'x3')] });
    for (const h of full.holds || []) g9.note({ reason: TWIN, identity: h.identity, hold: h.hold });
    const solo = g9.authorizeBatch({ reason: TWIN, items: [sess('A', 'solo')] });
    ok('§13 GUARD: a refused batch of ONE names its conversation in the journal («for solo»), never «a batch of 1»', solo.ok === false && solo.why === 'hour-cap' && logs9.some((l) => /refused auto-resume for solo on A/.test(l)) && !logs9.some((l) => /a batch of 1\b/.test(l)), JSON.stringify(logs9));
  }
  // RENEWAL (U2 cure, the adversarial read's MUST 1): a batch opens its holds at once and delivers them paced behind bounded
  // gates — a batch longer than RESERVE_TTL_MS must not lose the holds it has not reached yet
  ok('§13 PURE renewPending: the named holds are re-stamped, the others and an unknown id untouched', (() => { const p0 = [{ id: 'h1', key: 'A', at: 1 }, { id: 'h2', key: 'A', at: 2 }]; const p1 = A.renewPending(p0, ['h2', 'nope'], 99); return p1[0].at === 1 && p1[1].at === 99 && p0[1].at === 2 && p1.length === 2; })());
  {
    const t0 = Date.now(), TTL = A.RESERVE_TTL_MS;
    const mk3 = () => guardMod.create({ dataDir: tmpdir('vs-spend-bulk3-'), serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, getUserTodos: () => ({ add: () => { } }), log: () => { } });
    const g3 = mk3(), b3 = g3.authorizeBatch({ reason: TWIN, items: [sess('A', 'r1'), sess('A', 'r2')], now: t0 });
    g3.renewHolds(b3.holds.map((h) => h.hold), t0 + TTL - 10000);
    const x1 = g3.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' }, now: t0 + TTL + 20000 }), x2 = g3.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' }, now: t0 + TTL + 20001 });
    ok('§13 GUARD: RENEWED batch holds outlive their first lifetime and still BIND (2 held of 3 ⇒ one more fits, a second does not)', b3.ok && x1.ok === true && x2.ok === false && x2.why === 'hour-cap', JSON.stringify({ x1: x1.ok, x2: x2.why }));
    const g4 = mk3(); g4.authorizeBatch({ reason: TWIN, items: [sess('A', 'r1'), sess('A', 'r2')], now: t0 });
    const y1 = g4.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' }, now: t0 + TTL + 20000 }), y2 = g4.authorize({ reason: 'auto-resume', identity: { key: 'A', name: 'A' }, now: t0 + TTL + 20001 });
    ok('§13 CONTROL: the same batch NOT renewed loses its holds past the lifetime — two more fit (the leg above would go red)', y1.ok === true && y2.ok === true);
  }
  // the notice leg on its own guard (the guard files ONE notice per slot and why per 6 h, whoever was refused first)
  const todos2 = [];
  const logs2 = [];
  const g2 = guardMod.create({ dataDir: tmpdir('vs-spend-bulk2-'), serverSetting: (k) => settings[k], identityOf: (s) => s && s._slot ? { key: s._slot, name: s._slot } : null, getUserTodos: () => ({ add: (k, it) => { todos2.push(it); } }), log: (l) => logs2.push(String(l)) });
  g2.authorizeBatch({ reason: TWIN, items: [sess('A', 'a1'), sess('A', 'a2'), sess('A', 'a3'), sess('A', 'a4')] });
  ok('§13 GUARD: a BATCH refusal is answered in the person\'s own dialog — NO For-you item (its words would say what the bucket used, not what the batch needs); the journal says it once', todos2.length === 0 && logs2.filter((l) => /refused auto-resume/.test(l)).length === 1 && logs2.some((l) => /this batch needs 4 more/.test(l)), JSON.stringify({ todos2, logs2 }));
  g2.authorizeBatch({ reason: TWIN, items: [sess('A', 'a1'), sess('A', 'a2'), sess('A', 'a3'), sess('A', 'a4')] });
  ok('§13 GUARD: …and a second press of the same refusal files nothing either', todos2.length === 0);
  const un = g.authorizeBatch({ reason: TWIN, items: [sess('B', 'b2'), { session: { name: 'ghost' }, sessionId: 'g', sessionName: 'ghost' }] });
  ok('§13 GUARD FAIL CLOSED: one conversation whose slot cannot be named refuses the batch (no hold for the others)', un.ok === false && un.why === 'identity-unknown' && g.snapshot().holdsOpen === 0, JSON.stringify(un));

  // the census: the bulk site is a GATED row; without its batch gate it reads UNWIRED
  const arSrc = read('src/server/auto-resume.js');
  const files = trackedServerSource();
  const rows = censusOver(REPO, files).filter((h) => h.file === 'src/server/auto-resume.js' && h.prim === 'continue-send');
  const bulkLine = arSrc.split('\n').findIndex((l) => /deliverContinue\(session, verb, prompt, \(s2, text\) => sentNoted\(s2, text, sendToSession\(e\.id/.test(l)) + 1;
  const bulkRow = rows.find((h) => h.line === bulkLine);
  ok('§13 CENSUS: auto-resume.js holds exactly TWO continue sites — the single continue and the bulk resume — both GATED', rows.length === 2 && rows.every((h) => h.gated), JSON.stringify(rows));
  ok('§13 CENSUS: …the bulk site is gated by its OWN batch authorization (authorizeSpendBatch), not by a neighbour', bulkRow && bulkRow.gated && /^gate@/.test(bulkRow.via) && /authorizeSpendBatch\(/.test(arSrc.split('\n')[Number(bulkRow.via.split('@')[1]) - 1]), JSON.stringify(bulkRow));
  const mDir = tmpdir('vs-spend-bulkmut-');
  fs.mkdirSync(path.join(mDir, 'src', 'server'), { recursive: true });
  const from = '      v = authorizeSpendBatch\n        ? authorizeSpendBatch(chosen.map(';
  const fromMoved = 'v2 = authorizeSpendBatch ? authorizeSpendBatch([{ id: e.id, session, identity: bill }], paid.spendReason) : null;';   // the per-continue re-ask on the slot that bills (lg-recovery U2 cure: every item, moved or not)
  fs.writeFileSync(path.join(mDir, 'src/server/auto-resume.js'), editAnchor(editAnchor(arSrc, from, '      v = authorizeSpendBatch\n        ? ((x) => ({ ok: true, holds: x }))(chosen.map(', "src/server/auto-resume.js"), fromMoved, 'v2 = ((x) => ({ ok: true, holds: x }))([{ sessionId: e.id, identity: bill, hold: null }], paid.spendReason);', "src/server/auto-resume.js"));
  const mRows = censusOver(mDir, ['src/server/auto-resume.js']).filter((h) => h.prim === 'continue-send');
  ok('§13 CENSUS MUTANT: the same file without its two batch gates (the batch\'s, the per-continue re-ask\'s) reads the bulk site UNWIRED (and the single one still GATED)', arSrc.includes(from) && arSrc.includes(fromMoved) && mRows.length === 2 && mRows.filter((h) => !h.gated).length === 1 && mRows.find((h) => !h.gated).line === bulkLine, JSON.stringify(mRows));
  ok('§13 WIRING: server.js hands the core the REAL batch gate and the batch charge, under the reason the core chose', /authorizeSpendBatch: \(items, reason\) => spendGuard\.authorizeBatch\(\{ reason, items: items\.map\(/.test(read('server.js')) && /renewSpend: \(holds\) => spendGuard\.renewHolds\(holds\)/.test(read('server.js')) && /noteBatchSpend: \(id, s, identity, hold, reason, press\) => spendGuard\.note\(\{ reason, session: s, identity, hold, press \}\)/.test(read('server.js')));
  ok('§13 WIRING (主开发 21:04Z): the press\'s end and the presses of the day to the bulk routes', /notePressEnd: \(batchId, delivered\) => spendGuard\.notePressEnd\(\{ press: batchId, delivered \}\)/.test(read('server.js')) && /bulk-resume-routes\.js'\)\.create\(\{ activeSessions, pressesToday: \(\) => spendGuard\.pressesToday\(\), /.test(read('server.js')) && /presses: \(\(\) => \{ try \{ return pressesToday \? pressesToday\(\) : \[\]; \}/.test(read('src/server/bulk-resume-routes.js')));
  ok('§13 WIRING (the cure): server.js hands the core the guard\'s QUIET preview (as the press would ask), the press record, and the press id on every charge', /previewSpendBatch: \(items\) => spendGuard\.previewBatch\(\{ reason: 'bulk-resume', items: items\.map\(/.test(read('server.js')) && /notePress: \(batchId, n, reason\) => spendGuard\.notePress\(\{ reason, press: batchId, n \}\)/.test(read('server.js')) && /noteBatchSpend: \(id, s, identity, hold, reason, press\) => spendGuard\.note\(\{ reason, session: s, identity, hold, press \}\)/.test(read('server.js')));
  ok('§13 THE PRESS (the owner\'s ruling 2026-11-18): the core selects the attended reason ONLY on the press its door minted (else the gated twin), and that reason rides the batch\'s authorization, every re-ask, every charge and the press record', /const paid = isPress\(pressed\) \? \{ spendReason: 'bulk-resume' \} : \{ spendReason: 'auto-resume' \};/.test(arSrc) && (arSrc.match(/paid\.spendReason/g) || []).length === 4);
  { const rt = read('src/server/bulk-resume-routes.js'), h = rt.indexOf("app.post('/api/sessions/resume-stopped'"), body = rt.slice(h, rt.indexOf('app.post(', h + 10));
    ok('§13 THE DOOR: POST /api/sessions/resume-stopped refuses EVERY bearer first, then the page, and mints the press it hands the batch (pressOf(req))', h > 0 && /try \{\s*(?:\/\/[^\n]*\n\s*)*if \(pressBearer\(req\.headers\)\) return res\.status\(403\)/.test(body) && /ar\.resumeBatch\(\{ limit, ids, pressed: pressOf\(req\) \}\)/.test(body)); }
  { // (21:55Z (1)) THE ROUTE: the presses of the day that THROW are said as null and journalled — never «no presses»; read ⇒ the list
    const R2 = require(path.join(REPO, 'src/server/bulk-resume-routes.js'));
    const logs2 = [], arP = { stoppedPlan: () => ({ eligible: [], skipped: [], total: 0, running: null }), bulkCounts: () => ({ total: 0, on: 0 }) };
    const thrown = R2.create({ activeSessions: new Map(), getAutoResume: () => arP, pressesToday: () => { throw new Error('the record could not be read'); }, log: (l) => logs2.push(String(l)) }).stopped();
    const fine = R2.create({ activeSessions: new Map(), getAutoResume: () => arP, pressesToday: () => [{ at: 1, press: 'rb-1', planned: 2, delivered: 2, byAccount: [] }] }).stopped();
    ok('§13 (21:55Z (1)) THE ROUTE: pressesToday throwing ⇒ `presses: null` and one journal line naming it; read ⇒ the list as it is', thrown.presses === null && logs2.some((l) => /the presses of the day could not be read: the record could not be read/.test(l)) && Array.isArray(fine.presses) && fine.presses.length === 1, JSON.stringify({ thrown: thrown.presses, logs2, fine: fine.presses }));
  }
  { // THE REAL DOOR, driven (the read's should): a person's page reaches the batch WITH a press; every bearer is refused first; a header-less local request is not a press
    const R = require(path.join(REPO, 'src/server/bulk-resume-routes.js'));
    const seen = [], routes = {};
    const arStub = { resumeBatch: (o) => { seen.push(WO.isPress(o && o.pressed)); return { ok: true, batchId: 'rb-door', planned: 0, done: true }; } };
    R.create({ activeSessions: new Map(), getAutoResume: () => arStub }).register({ get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } });
    const hit = (headers) => { let st = 200, body = null; const res = { status: (c) => { st = c; return res; }, json: (o) => { body = o; return res; } }; routes['POST /api/sessions/resume-stopped']({ headers, body: {}, socket: {} }, res); return { st, code: body && body.code }; };
    const page = hit({ 'sec-fetch-site': 'same-origin' });
    const bearers = ['vsst_t', 'jbt_t', 'vsak_t'].map((k) => hit({ authorization: 'Bearer ' + k, 'sec-fetch-site': 'same-origin' }));
    const bare = hit({});
    ok('§13 THE REAL DOOR: a person\'s page (same-origin) reaches the batch WITH a press (attended); vsst_ / jbt_ / vsak_ bearers are 403 agent_forbidden even beside a page header; a header-less request is 403 not_a_page — the batch never hears either', page.st === 200 && seen.join() === 'true' && bearers.every((b) => b.st === 403 && b.code === 'agent_forbidden') && bare.st === 403 && bare.code === 'not_a_page', JSON.stringify({ page, bearers, bare, seen }));
  }
}

// B-64c1 (主开发 r590/r599): THE ATTENDED TALLY HAS A READER — ⚙ Diagnostics report shows the turns a person pressed that the ceiling
// neither refused nor counted, by reason, the last 24 hours: COUNTS only (no conversation, no message). The guard's verdict is not
// touched: this is a read of snapshot().attended through the route the report already asks.
console.log('§B-64c1 the attended tally, worded for the Diagnostics report (a read only)');
{
  const okP = (n, c, facts) => { ok(n, c, JSON.stringify(facts)); if (c) console.log('      ' + JSON.stringify(facts)); };
  const W64 = await import(pathToFileURL(path.join(REPO, 'src/lib/attended-tally-words.js')).href);
  const fill = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const tEn = (k, p) => fill(k, p), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ZH = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, JA = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  // THE REAL GUARD: a person's presses (attended) on a fresh ledger — the tally the snapshot carries, then its words
  const dir64 = tmpdir('vs-spend-b64c1-');
  const g64 = guardMod.create({ dataDir: dir64, serverSetting: () => undefined, getUserTodos: () => ({ add: (k, it) => it }), log: () => { } });
  const who64 = { key: 'k64', name: 'Member Sixty-Four' }, t64 = Date.now();
  const press = (reason, cid, k) => { const v = g64.authorize({ reason, identity: who64, cid, now: t64 + k }); g64.note({ reason, identity: v.identity, hold: v.hold || null, now: t64 + k + 1 }); return v; };
  const vs = [press('owner-channel-send', 'conv-secret-a', 1), press('owner-channel-send', 'conv-secret-a', 2), press('owner-channel-send', 'conv-secret-b', 3), press('stash-handover', 'conv-secret-c', 4), press('stash-handover', 'conv-secret-c', 5)];
  const att = g64.snapshot().attended, html = W64.attendedSection(att, { t: tEn, esc });
  okP('B-64c1: five presses through the REAL guard are attended (no hold, never counted) and the snapshot tallies them by reason',
    vs.every((v) => v.ok === true && v.attended === true && !v.hold) && att['owner-channel-send'] === 3 && att['stash-handover'] === 2, { attended: att });
  okP('B-64c1: the section says the 24-hour count and a row per reason, largest first — COUNTS ONLY: no conversation id, no identity\'s name in the report',
    html.startsWith('<h2>Turns a person pressed (not counted)</h2><p><b>5 in the last 24 hours</b></p>') && html.indexOf('Your message to an agent from Channels') < html.indexOf('Waiting notices handed to a conversation now')
      && !/conv-secret|Sixty-Four|k64/.test(html) && /<td class="n">3<\/td>/.test(html) && /<td class="n">2<\/td>/.test(html),
    { html: html.replace(/<p class="dim">.*$/, '…') });
  const none = W64.attendedSection({}, { t: tEn, esc }), older = W64.attendedSection(undefined, { t: tEn, esc }), other = W64.attendedRows({ 'a-new-reason': 2, junk: 'x', zero: 0 }, tEn);
  okP('B-64c1: an empty tally says «None in the last 24 hours.»; a server that sends no tally (an older one) adds no section; a reason this page does not know is «Other (…)»; a count that is not a positive number is no row',
    /<b>None in the last 24 hours\.<\/b>/.test(none) && !/<table>/.test(none) && older === '' && other.length === 1 && other[0].words === 'Other (a-new-reason)' && other[0].n === 2, { none: none.slice(0, 90), older, other });
  // every word in zh AND ja (the section rendered with each dictionary: no English left)
  const allReasons = Object.fromEntries([...W64.ATTENDED_REASONS, 'a-new-reason'].map((r, i) => [r, i + 1]));
  const tOf = (D) => (k, p) => fill(D[k] || `«MISSING ${k}»`, p);
  const zh = W64.attendedSection(allReasons, { t: tOf(ZH), esc }), ja = W64.attendedSection(allReasons, { t: tOf(JA), esc }), zhNone = W64.attendedSection({}, { t: tOf(ZH), esc });
  okP('B-64c1: every word of the section is in the zh and ja dictionaries (the nine reasons, «Other», the head, «None», the why)',
    !/MISSING/.test(zh + ja + zhNone) && zh.includes('由人按下的轮次（不计入）') && zh.includes('过去 24 小时 55 次') && zh.includes('其他（a-new-reason）') && ja.includes('直近 24 時間で 55 回') && zhNone.includes('过去 24 小时没有。'),
    { zhHead: zh.slice(0, 80), jaHead: ja.slice(0, 80), missing: (zh + ja + zhNone).match(/«MISSING [^»]*»/g) || [] });
  // THE CENSUS: every reason the authorizer marks attended has its words here (a new attended reason is RED by name, never «Other»)
  const judge64 = (reasons) => Object.keys(reasons).filter((r) => reasons[r] && reasons[r].attended === true && !W64.ATTENDED_REASONS.includes(r)).sort();
  const planted = judge64({ ...A.SPEND_REASONS, 'a-planted-press': { turn: true, attended: true, what: 'x' } });
  okP('B-64c1 CENSUS: the nine attended reasons of src/spend-authorizer.js each have words — RED CONTROL: a planted attended reason is named',
    judge64(A.SPEND_REASONS).length === 0 && JSON.stringify([...W64.ATTENDED_REASONS].sort()) === JSON.stringify(ATT) && planted.length === 1 && planted[0] === 'a-planted-press', { reasons: ATT, planted });
  // THE ROUTE AND THE PAGE (a read only, the owner's page): the field rides the report's own query, behind the cookie gate
  const SRV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'), SF = fs.readFileSync(path.join(REPO, 'src/lib/setup-flows.js'), 'utf8'), AU = fs.readFileSync(path.join(REPO, 'src/auth.js'), 'utf8');
  const routeLine = SRV.split('\n').find((l) => l.includes("res.json({ ...(await telemetry.summary(")) || '';   // B-360d unit 2: the summary is awaited (its worker)
  const pins = {
    onlyWithDrift: /\.\.\.\(req\.query\.drift === '1' \? \{ driftLedger: driftLedgerRows\(\), attended: \(\(\) => \{ try \{ return spendGuard\.snapshot\(\)\.attended; \} catch \{ return null; \} \}\)\(\) \} : \{\}\)/.test(routeLine),
    behindTheCookieGate: !AU.includes("'/api/telemetry/summary'") && !/p\.startsWith\('\/api\/telemetry/.test(AU),
    afterTheEventsTables: SF.includes("<h2>${esc(t('By version'))}</h2><table>${kv(d.byVersion)}</table>\n    ${attendedSection(d.attended, { t, esc })}"),
    reportAsksDrift: SF.includes("fetchJson('/api/telemetry/summary?days=14&drift=1'),"),
    guardVerdictUntouched: !/attendedSection|attended-tally-words/.test(fs.readFileSync(path.join(REPO, 'src/server/spend-guard.js'), 'utf8')),
  };
  okP('B-64c1: the route gives `attended` only on the report\'s own query (drift=1), a read of the guard\'s snapshot; the route stands behind src/auth.js\'s cookie gate (the owner\'s page — no agent door); the section follows the events tables',
    Object.values(pins).every(Boolean), pins);
}

// ── §14 r3136 / r3146 / r3200: A USAGE READING THAT CANNOT BE TOLD HOLDS THE UNATTENDED TURN — never «no reading» ───────────
// Made-up accounts and readings; a failed read is a PLACED refusal of that one read call (EIO) for one file's inode, undone by the
// leg — never a mount or a mode. At the base (the writer's commit alone) every consumer below reads the mark as «no reading».
console.log('\n§14 r3136: a usage reading that cannot be told holds the unattended turn, said once, with the person\'s way out');
{
  const UW = require(path.join(REPO, 'src/usage-cache-write.js'));
  const UNREAD = UW.UNREAD_READING || Symbol('no unread mark at this tree');
  const FY = (() => { try { return require(path.join(REPO, 'src/server/usage-reading-for-you.js')); } catch { return null; } })();
  const refuse = (file) => {   // refuses the read of THAT file (its inode): a file put in its place reads
    const ino = fs.statSync(file).ino, real = fs.readFileSync;
    fs.readFileSync = function (p0, ...a) { if (typeof p0 === 'string' && path.resolve(p0) === path.resolve(file)) { let same = false; try { same = fs.statSync(p0).ino === ino; } catch { same = false; } if (same) throw Object.assign(new Error('a placed refusal'), { code: 'EIO' }); } return real.call(this, p0, ...a); };
    return () => { fs.readFileSync = real; };
  };
  const mkTodos = () => { const items = []; return { items,
    add: (key, it) => { const ex = items.find((x) => x.itemKey && x.itemKey === it.itemKey && x.status === 'open'); if (ex) { Object.assign(ex, it); return { id: ex.id }; } const x = { id: 'ut' + (items.length + 1), key, status: 'open', ...it }; items.push(x); return { id: x.id }; },   // a re-file updates its words (as the real store)
    idsWhere: (f) => items.filter(f).map((x) => x.id), setStatus: (id, st) => { const x = items.find((i) => i.id === id); if (x) x.status = st; }, forSession: (keys) => items.filter((x) => keys.includes(x.key)) }; };
  const now = Date.now(), nowS = Math.floor(now / 1000);
  const reading = (extra = {}) => ({ fetchedAt: now, source: 'on-demand', fiveHour: { utilization: 0.1, resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowS + 3 * 86400 }, ...extra });
  // (a) THE PURE RULE (r3146 (3))
  const ID = { key: 'sub-r3136a', name: 'Alpha' };
  const untold = { ...A.overageState(null), unread: true };
  const v1 = A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, overage: untold, now });
  const v2 = A.authorizeUnattendedSpend({ reason: 'outbox-wake-now', identity: ID, overage: untold, now });
  const v3 = A.authorizeUnattendedSpend({ reason: 'auto-resume', identity: ID, overage: A.overageState(null), now });
  ok('§14 (a) THE PURE RULE: an unattended turn on an account whose reading cannot be told is refused BY NAME (reading-unread); a person\'s press passes; a reading merely silent on overage («unknown») passes as before',
    v1.ok === false && v1.why === 'reading-unread' && v2.ok === true && v2.attended === true && v3.ok === true, JSON.stringify({ v1: v1.why, v2: v2.ok, v3: v3.ok }));
  // (b) THE GUARD, after torn bytes: overage not stated again — ONE notice across N refusals, no counter moved, closed at the lift
  const caches = {}, ut = mkTodos();
  const g = guardMod.create({ dataDir: tmpdir('vs-r3136-guard-'), serverSetting: () => undefined, identityOf: (s) => (s && s.id ? { key: s.id, name: s.id } : null), readCacheFor: (k) => (k in caches ? caches[k] : null), getUserTodos: () => ut, log: () => { } });
  const RK = 'sub-r3136t';
  caches[RK] = { fetchedAt: now, source: 'statusline', fiveHour: { utilization: 0.1, resetsAt: nowS + 3600 }, startedAgain: { at: now - 1000, setAside: 'r3136.json.corrupt-1', enumerated: false, overage: false, spendControl: false, resetCredits: false } };
  const rs = [1, 2, 3].map(() => g.authorize({ reason: 'auto-resume', session: { id: RK } }));
  const pressed = g.authorize({ reason: 'outbox-wake-now', session: { id: RK } });
  const told = ut.items.filter((i) => i.itemKey === 'spend-reading-unread:' + RK);
  ok('§14 (b) AFTER TORN BYTES, overage not stated again: three unattended turns refused by name, ONE notice for the account across the three, a person\'s press passes, and no counter moved for a refused turn',
    rs.every((r) => r.ok === false && r.why === 'reading-unread') && told.length === 1 && told[0].status === 'open' && pressed.ok === true && !!rs[2].counts && rs[2].counts.hour === 0 && rs[2].counts.day === 0,
    JSON.stringify({ whys: rs.map((r) => r.why), told: told.length, hour: rs[2].counts && rs[2].counts.hour }));
  caches[RK] = reading({ fetchedAt: now + 1, source: 'rate-limit-event', overage: { inUse: false, status: 'rejected', asOf: now + 1 } });
  if (typeof UW.noteWritten === 'function') UW.noteWritten(path.join(os.tmpdir(), RK + '.json'), '{}');
  const lifted = g.authorize({ reason: 'auto-resume', session: { id: RK } });
  ok('§14 (b) …a reading that states overage again lands: the notice is CLOSED by itself and the turn passes',
    told.length === 1 && told[0].status === 'done' && lifted.ok === true, JSON.stringify({ status: told[0] && told[0].status, lifted: lifted.why }));
  // (c) A READ THAT FAILS: the door's mark; the file's own item speaks (no guard notice); «never read» passes; the read again lifts
  const dir = tmpdir('vs-r3136-door-'), MK = 'sub-r3136m', f = path.join(dir, MK + '.json');
  fs.writeFileSync(f, JSON.stringify(reading()));
  let door = null, rm = [];
  { const undo = refuse(f); try { door = UW.readReading ? UW.readReading(f, MK) : null; caches[MK] = door; rm = [1, 2, 3].map(() => g.authorize({ reason: 'auto-resume', session: { id: MK } })); } finally { undo(); } }
  const guardTold = ut.items.filter((i) => i.itemKey === 'spend-reading-unread:' + MK);
  ok('§14 (c) A READ THAT FAILS: the door answers the UNREAD mark (never null), the turns are refused by name — and with NO producer\'s item open the guard files its OWN notice, once across the three (r3285: a hold is never without its word)',
    door === UNREAD && rm.every((r) => r.ok === false && r.why === 'reading-unread') && guardTold.length === 1, JSON.stringify({ door, whys: rm.map((r) => r.why), guardTold: guardTold.length }));
  const NK = 'sub-r3136n', door0 = UW.readReading ? UW.readReading(path.join(dir, NK + '.json'), NK) : undefined;
  caches[NK] = door0;
  const rn = g.authorize({ reason: 'auto-resume', session: { id: NK } });
  ok('§14 (c) «NEVER READ» IS NOT «UNREAD»: an account whose file is not there reads «no reading» (null, no mark) and its turn passes as before',
    door0 === null && rn.ok === true && (!UW.readingUnread || UW.readingUnread(NK) === null), JSON.stringify({ door0, rn: rn.why }));
  const door2 = UW.readReading ? UW.readReading(f, MK) : null; caches[MK] = door2;
  const rl = g.authorize({ reason: 'auto-resume', session: { id: MK } });
  ok('§14 (c) …the file reads again: the mark lifts at that read and the turn passes', !!door2 && door2 !== UNREAD && UW.readingUnread(MK) === null && rl.ok === true, JSON.stringify({ rl: rl.why }));
  // (d) THE WAY OUT (r3200): ONE For-you item an account while its file cannot be read; «Set it aside» renames it beside itself and a
  // file that STARTED AGAIN takes its place — the waiting reading (a wall) written over it at once, every other fact unknown
  const ut2 = mkTodos(), routes = {};
  const dir2 = tmpdir('vs-r3136-fy-'), K = 'sub-r3136fy', f2 = path.join(dir2, K + '.json');
  UW.writeCacheObject({ cacheDir: dir2, key: K, obj: reading({ fetchedAt: now - 60e3, overage: { inUse: false, status: 'rejected', asOf: now - 60e3 } }), source: 'on-demand', backend: 'claude' });
  const fy = FY ? FY.create({ app: { post: (p, h) => { routes[p] = h; } }, todos: () => ut2, cacheDir: dir2, nameOf: () => 'Gamma', isKnown: (k) => k === K, every: 0, backendOf: () => 'claude', readNow: (k) => UW.readReading(UW.cacheFileFor(dir2, k), k) }) : null;
  const bytes0 = fs.readFileSync(f2);
  let door3 = null, w1 = null, r = null, bearer = null;
  { const undo = refuse(f2); try {
    door3 = UW.readReading ? UW.readReading(f2, K) : null;
    var wordsAtMark = ut2.items.filter((i) => i.action && i.action.type === 'usage-reading-unread').map((i) => ({ key: i.i18n && i.i18n.text && i.i18n.text.key, account: i.i18n && i.i18n.text && i.i18n.text.params && i.i18n.text.params.account }));   // (the words as they are at the mark: a later re-file updates the item in place)
    w1 = UW.writeCacheObject({ cacheDir: dir2, key: K, obj: { fetchedAt: now, source: 'rate-limit-event', fiveHour: { utilization: 1, resetsAt: nowS + 3600, status: 'rejected' } }, measuredAt: now, source: 'rate-limit-event', backend: 'claude', refused: ['plan:5h'] });
    const route = FY && routes[FY.ROUTE];
    if (route) { const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; route({ params: { account: K }, headers: { authorization: 'Bearer r3136-agent' } }, res); bearer = res; }
    r = fy ? fy.setAside(K) : null;
  } finally { undo(); } }
  const items = ut2.items.filter((i) => i.action && i.action.type === 'usage-reading-unread');
  ok('§14 (d) THE WAY OUT IS SAID: a file whose read fails is told ONCE in For you — an action item (origin server, «Usage») naming the account by its name, with its own type and account; a write meanwhile is refused (owed)',
    door3 === UNREAD && !!w1 && w1.ok === false && items.length === 1 && items[0].origin === 'server' && items[0].sessionName === 'Usage' && items[0].action.account === K && wordsAtMark.length === 1 && wordsAtMark[0].key === (FY && FY.TEXT) && wordsAtMark[0].account === 'Gamma',
    JSON.stringify({ door3, w1: w1 && w1.ok, items: items.map((i) => ({ a: i.action, s: i.status })) }));
  ok('§14 (d) …the door is a PERSON\'s: a request carrying a bearer token is refused (403) and nothing is moved',
    !!bearer && bearer.code === 403 && bearer.body && bearer.body.ok === false, JSON.stringify(bearer && { code: bearer.code, body: bearer.body }));
  const aside = fs.readdirSync(dir2).filter((n) => n.startsWith(K + '.json.unreadable-'));
  let o = null; try { o = JSON.parse(fs.readFileSync(f2, 'utf8')); } catch { o = null; }
  const unk = o ? UW.restartUnknowns(o) : null;
  const five = o ? require(path.join(REPO, 'src/quota-model.js')).lanesOfReading(o).find((l) => l.lane === 'plan:5h') : null;
  ok('§14 (d) «Set it aside»: the file RENAMED beside itself (its bytes kept byte for byte, nothing deleted), a file that STARTED AGAIN in its place — the waiting wall written over it at once and stated, every other gating fact UNKNOWN (never «no reading») — the mark lifted, and the SAME item now says the way out of that state (r3285: refresh this account\'s usage)',
    !!r && r.ok === true && r.state === 'pass' && aside.length === 1 && fs.readFileSync(path.join(dir2, aside[0])).equals(bytes0) && !!o && !!o.startedAgain && o.startedAgain.setAside === aside[0]
      && Array.isArray(unk) && unk.includes('plan:7d') && unk.includes('overage') && !unk.includes('plan:5h') && !!five && five.usedPct >= 100 && UW.readingUnread(K) === null && items.length === 1 && items[0].status === 'open' && items[0].i18n.text.key === FY.TEXT_RESTART,
    JSON.stringify({ r, aside, unk, five: five && five.usedPct, status: items[0] && items[0].status }));
  const r2 = fy ? fy.setAside(K) : null;
  ok('§14 (d) …a press on a file that reads: «nothing to set aside», no file moved', !!r2 && r2.ok === true && r2.state === 'none' && fs.readdirSync(dir2).filter((n) => n.includes('.unreadable-')).length === 1, JSON.stringify(r2));
  // (e) THE ENGINE's GATE, an account bound DIRECTLY (r3146 (2)): a read that fails holds the fire; «never read» does not;
  // after torn bytes the lanes not stated again hold it
  const w = mkWorld();
  const sD = { backend: 'claude', mode: 'chat', _webuiId: 'sess-r3136d', claudeSessionId: 'cid-r3136d', _accountId: w.M2, _servedModel: 'claude-fable-5', _servedModelAt: now, pty: { write() { } }, name: 'direct' };
  w.sessions.set(sD._webuiId, sD);
  const fM2 = path.join(w.cacheDir, w.M2 + '.json');
  const qOpen = w.eng.quotaVerdictFor(w.M2, { session: sD });
  await tick(5);
  let qHeld = null; { const undo = refuse(fM2); try { qHeld = w.eng.quotaVerdictFor(w.M2, { session: sD }); } finally { undo(); } }
  await tick(5);
  fs.writeFileSync(fM2, '{"fiveHour":{"utilization":0.1,"resets');   // torn bytes; the next reading (five-hour only) starts the file again
  const tornAt = Date.now() + 1000;   // newer than every reading this world wrote (the identity group's freshest stands in for an older one)
  UW.writeCacheObject({ cacheDir: w.cacheDir, key: w.M2, obj: { fetchedAt: tornAt, source: 'statusline', fiveHour: { utilization: 0.1, resetsAt: nowS + 3600 } }, measuredAt: tornAt, source: 'statusline', backend: 'claude' });
  await tick(5);
  const qTorn = w.eng.quotaVerdictFor(w.M2, { session: sD });
  fs.rmSync(fM2, { force: true });
  await tick(5);
  const qNever = w.eng.quotaVerdictFor(w.M2, { session: sD });
  ok('§14 (e) THE DIRECT GATE: an account bound directly whose reading file cannot be read is NOT USABLE and nothing is known (the fire waits) — it was usable a moment before; after torn bytes the weekly lane not stated again holds it; a file NOT THERE is «no usage data» as before (not held)',
    qOpen.usable === true && qHeld && qHeld.usable === false && qHeld.readingUnread === true && qHeld.known === false && qTorn.usable === false && Array.isArray(qTorn.restarted) && qTorn.restarted.includes('plan:7d') && !qTorn.restarted.includes('plan:5h') && qNever.usable !== false && !qNever.readingUnread,
    JSON.stringify({ qOpen: qOpen.usable, qHeld, qTorn: qTorn && { u: qTorn.usable, r: qTorn.restarted }, qNever: qNever && { u: qNever.usable, why: qNever.reason } }));
  // (f) THE POOL's PICK: a member whose reading cannot be told is never a target (the escape goes to a measured member or none) —
  // B has LESS left than an unknown member is counted at, so a pick that reads the mark as «no reading» takes C
  const POOL = require(path.join(REPO, 'src/account-pool-auto.js'));
  const pc = { A: reading({ fiveHour: { utilization: 0.995, resetsAt: nowS + 3600 } }), B: reading({ fiveHour: { utilization: 0.65, resetsAt: nowS + 3600 } }), C: UNREAD };
  const dec = (cs) => POOL.decidePoolSwitch({ currentId: 'A', members: [{ id: 'A', name: 'A' }, { id: 'C', name: 'C' }, { id: 'B', name: 'B' }], readCache: (id) => (id in cs ? cs[id] : null), nowSec: nowS, hot: true });
  const dBoth = dec(pc), dOnlyHeld = dec({ A: pc.A, B: reading({ fiveHour: { utilization: 1, resetsAt: nowS + 3600, status: 'rejected' } }), C: UNREAD });
  ok('§14 (f) THE POOL: an exhausted current leaves for the MEASURED member, never the one whose reading cannot be told; with no measured way out the held member is still no target',
    !!dBoth && dBoth.to === 'B' && (!dOnlyHeld || dOnlyHeld.to !== 'C'), JSON.stringify({ both: dBoth && dBoth.to, onlyHeld: dOnlyHeld && (dOnlyHeld.to || dOnlyHeld.reason) }));
  const ranked = POOL.rankPoolMembers({ members: [{ id: 'B', name: 'B' }, { id: 'C', name: 'C' }], readCache: (id) => (id in pc ? pc[id] : null), nowSec: nowS }) || [];
  ok('§14 (f) …and the RANKED list the live evict path and the device\'s offline order walk never holds the member whose reading cannot be told (a measured member with less left stays)',
    Array.isArray(ranked) && ranked.some((r) => r.id === 'B') && !ranked.some((r) => r.id === 'C'), JSON.stringify(ranked.map((r) => r.id)));
  // (g) THE THREE HOLDS NO LEG HERE DRIVES, pinned by their lines (each absent at the base): the wall probe asks no vendor for an
  // account whose file cannot be read — AFTER the accounts list's hold (no list: no identity, no reading to ask); the automatic
  // reset-credit rung keeps the credit once the identity is known; the delivery wake waits on the reading's hold by name
  const ENG = read('src/server/usage-pool-engine.js'), WAKE = read('src/server/delivery-wake.js');
  const listAt = ENG.indexOf("{ const lh = !machineLoginKey(scope) ? accountsHeld() : null; if (lh) { sayHeldOnce('probe:' + id, lh,");
  const readingAt = ENG.indexOf("{ const a0 = accounts.get(scope); if (a0 && a0.type !== 'pooled' && readRawReading(scope) === usageWrite.UNREAD_READING) { sayHeldOnce('probe-reading:' + id,");
  const rungAt = ENG.indexOf("if (rc0 === usageWrite.UNREAD_READING || usageWrite.restartUnknowns(rc0).includes('resetCredits')) {");
  const held3 = { wallProbeAfterTheList: listAt > 0 && readingAt > listAt && readingAt - listAt < 600, rungAfterTheIdentity: rungAt > 0 && ENG.lastIndexOf('if (!ci.unknown) {', rungAt) > rungAt - 200,
    wakeWaitsByName: /limit = q \? \(q\.readingUnread \? \{ unread: true, why: `its account's usage reading cannot be told \(\$\{q\.reason\}\)` \}/.test(WAKE) };
  ok('§14 (g) THE THREE HOLDS BY THEIR LINES: the wall probe skips an account whose file cannot be read, asked after the accounts list; the reset-credit rung keeps the credit once the identity is known; the wake waits on the reading\'s hold by name',
    Object.values(held3).every(Boolean), JSON.stringify(held3));
}

// ── §15 r3285 (the round w19k650vo, ruled by 主开发): A HOLD IS NEVER WITHOUT ITS WORD, A DOOR ONLY FOR A KNOWN ACCOUNT, THE HOLDS DRIVEN ──
// Made-up accounts and readings; a failed read or rename is a PLACED refusal of that one call, undone by the leg.
console.log('\n§15 r3285: the item on the REAL For-you store, the press through the route, the pool and the three holds driven');
{
  const UW = require(path.join(REPO, 'src/usage-cache-write.js'));
  const FY = require(path.join(REPO, 'src/server/usage-reading-for-you.js'));
  const UT = require(path.join(REPO, 'src/user-todos.js'));
  const POOL = require(path.join(REPO, 'src/account-pool-auto.js'));
  const UNREAD = UW.UNREAD_READING;
  const now = () => Date.now(), nowS = () => Math.floor(Date.now() / 1000);
  const reading = (extra = {}) => ({ fetchedAt: Date.now(), source: 'on-demand', fiveHour: { utilization: 0.1, resetsAt: nowS() + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowS() + 3 * 86400 }, ...extra });
  const refuse = (file) => { const ino = fs.statSync(file).ino, real = fs.readFileSync; fs.readFileSync = function (p0, ...a) { if (typeof p0 === 'string' && path.resolve(p0) === path.resolve(file)) { let same = false; try { same = fs.statSync(p0).ino === ino; } catch { same = false; } if (same) throw Object.assign(new Error('a placed refusal'), { code: 'EIO' }); } return real.call(this, p0, ...a); }; return () => { fs.readFileSync = real; }; };
  const quiet = (fn) => { const w0 = console.warn, l0 = console.log; console.warn = () => { }; console.log = () => { }; try { return fn(); } finally { console.warn = w0; console.log = l0; } };
  // (a) THE REAL For-you store: the item filed though the store was NOT BUILT at the mark (the next tick files it); the guard keeps
  // its own notice back ONLY while that item is OPEN; a dismissed item is filed again; the label is the engine's, never the id
  const store = quiet(() => new UT.UserTodoManager({ dataDir: tmpdir('vs-r3285-todos-'), expirySweepMs: 0 }));
  let built = false, nameThrows = true;
  const dir = tmpdir('vs-r3285-cache-'), K = 'sub-r3285real', f = path.join(dir, K + '.json');
  fs.writeFileSync(f, JSON.stringify(reading()));
  const fy = FY.create({ todos: () => (built ? store : null), cacheDir: dir, nameOf: (k) => { if (nameThrows) throw new ReferenceError('the label helper is not there yet'); return k === K ? 'Delta' : null; }, isKnown: (k) => k === K || k === 'sub-r3285x', backendOf: () => 'claude', readNow: (k) => UW.readReading(UW.cacheFileFor(dir, k), k), every: 0 });
  const openOf = (k) => store.forSession([FY.ITEM_KEY]).filter((i) => i && i.status === 'open' && i.action && i.action.account === k);
  let undo = refuse(f);
  quiet(() => UW.readReading(f, K));                       // the mark, while For you is not built
  const before = (() => { built = true; return openOf(K).length; })();
  nameThrows = true; quiet(() => fy.tick());               // the tick files it — the label helper still throws: the opaque word
  const atTick = openOf(K).map((i) => ({ id: i.id, text: i.text }));   // (the store hands its live objects: the words as they are NOW)
  nameThrows = false; quiet(() => fy.tick());              // …and the next tick files it again with the engine's label
  const named = openOf(K).map((i) => ({ id: i.id, text: i.text }));
  ok('§15 (a) A HOLD IS NEVER WITHOUT ITS WORD: marked while the For-you store was not built — no item then; the next tick FILES it on the real store (the opaque word while the label helper is not there, never the id), and the tick after names the account by its label — ONE item',
    before === 0 && atTick.length === 1 && /an account/.test(atTick[0].text) && !atTick[0].text.includes(K) && named.length === 1 && named[0].id === atTick[0].id && /Delta/.test(named[0].text), JSON.stringify({ before, atTick: atTick.map((i) => i.text), named: named.map((i) => i.text) }));
  const notices = [];
  const g = guardMod.create({ dataDir: tmpdir('vs-r3285-guard-'), serverSetting: () => undefined, identityOf: (s) => (s && s.id ? { key: s.id, name: s.id } : null), readCacheFor: (k) => UW.readReading(UW.cacheFileFor(dir, k), k), readingItemOpen: (k, kind) => fy.noteHeld(k, kind), getUserTodos: () => ({ add: (key, it) => { notices.push(it); return { id: 'n' + notices.length }; }, idsWhere: () => [], setStatus: () => { } }), log: () => { } });
  const r1 = quiet(() => g.authorize({ reason: 'auto-resume', session: { id: K } }));
  const openBefore = openOf(K);
  store.setStatus(openBefore[0].id, 'done', 'user');      // a person dismisses the item while the file still cannot be read
  const r2 = quiet(() => g.authorize({ reason: 'auto-resume', session: { id: K } }));
  const openAgain = openOf(K);
  ok('§15 (a) THE GUARD keeps its own notice back ONLY while the producer\'s item is OPEN: refused by name, no guard notice; the item dismissed — the next refusal files it AGAIN (open) rather than leave the hold without a word',
    r1.ok === false && r1.why === 'reading-unread' && r2.ok === false && r2.why === 'reading-unread' && notices.filter((n) => /reading/.test(JSON.stringify(n))).length === 0 && openBefore.length === 1 && openAgain.length === 1 && openAgain[0].status === 'open', JSON.stringify({ r1: r1.why, r2: r2.why, notices: notices.length, again: openAgain.length }));
  undo();
  quiet(() => UW.readReading(f, K));                       // it reads again
  ok('§15 (a) …the file reads again: the item on the real store is RESOLVED by itself', openOf(K).length === 0, JSON.stringify(openOf(K).map((i) => i.status)));
  // (b) THE PRESS: a name that is not a known account is NOT FOUND by name; from the owner's page it SUCCEEDS through the route;
  // each of its three failure points answers its own words where the page's toast reads them (`error`), nothing lost
  const routes = {};
  const dir2 = tmpdir('vs-r3285-press-'), P = 'sub-r3285x', f2 = path.join(dir2, P + '.json');
  const fy2 = FY.create({ app: { post: (p, h) => { routes[p] = h; } }, todos: () => store, cacheDir: dir2, nameOf: () => 'Echo', isKnown: (k) => k === P, backendOf: () => 'claude', readNow: (k) => UW.readReading(UW.cacheFileFor(dir2, k), k), every: 0 });
  const press = (account, headers = { 'sec-fetch-site': 'same-origin' }) => { const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; quiet(() => routes[FY.ROUTE]({ params: { account }, headers }, res)); return res; };
  const unknown = ['made-up-account', '__models__', 'a.b.c'].map((n) => press(n));
  ok('§15 (b) THE PRESS\'s PATH: a made-up name, the folder\'s models file and a name with dots each answer NOT FOUND by name (404, its words in `error`) — nothing set aside',
    unknown.every((r) => r.code === 404 && r.body && r.body.code === 'not_found' && /no account/.test(r.body.error || '')) && fs.readdirSync(dir2).length === 0, JSON.stringify(unknown.map((r) => [r.code, r.body && r.body.code])));
  const seed = () => { fs.writeFileSync(f2, JSON.stringify(reading())); for (const n of fs.readdirSync(dir2)) if (n !== P + '.json') fs.rmSync(path.join(dir2, n), { force: true }); return fs.readFileSync(f2); };
  const failAt = (step, fn) => {   // step 'tmp' | 'aside' | 'place': the one call that fails
    const realW = fs.writeFileSync, realR = fs.renameSync, realO = fs.openSync;
    fs.writeFileSync = function (p0, ...a) { if (step === 'tmp' && String(p0) === f2 + '.tmp') throw Object.assign(new Error('a placed refusal'), { code: 'ENOSPC' }); return realW.call(this, p0, ...a); };
    // B-574d (r5075 (B)): the stub is made through the device's door (src/agentd/durable-file.js writeDurable: its own temp `<file>.tmp.<pid>.tmp`, opened exclusive) — the same refusal placed at that open
    fs.openSync = function (p0, ...a) { if (step === 'tmp' && String(p0).startsWith(f2 + '.tmp.')) throw Object.assign(new Error('a placed refusal'), { code: 'ENOSPC' }); return realO.call(this, p0, ...a); };
    fs.renameSync = function (from, to, ...a) { if (step === 'aside' && String(from) === f2 && String(to).includes('.unreadable-')) throw Object.assign(new Error('a placed refusal'), { code: 'EBUSY' }); if (step === 'place' && String(from) === f2 + '.tmp') throw Object.assign(new Error('a placed refusal'), { code: 'EXDEV' }); return realR.call(this, from, to, ...a); };
    try { return fn(); } finally { fs.writeFileSync = realW; fs.renameSync = realR; fs.openSync = realO; }
  };
  const outcomes = {};
  for (const step of ['tmp', 'aside', 'place']) {
    const bytes0 = seed(); const u = refuse(f2);
    let res = null; try { quiet(() => UW.readReading(f2, P)); res = failAt(step, () => press(P)); } finally { u(); }
    outcomes[step] = { code: res.code, error: res.body && res.body.error, kept: fs.existsSync(f2) && fs.readFileSync(f2).equals(bytes0), aside: fs.readdirSync(dir2).filter((n) => n.includes('.unreadable-')).length };
    quiet(() => UW.readReading(f2, P));
  }
  ok('§15 (b) EACH FAILURE POINT of the press answers its own words in `error` (500) and loses nothing: the new file not made — nothing moved; the old file not set aside — nothing moved; the new one not put in place — the old one put back',
    outcomes.tmp.code === 500 && /nothing was moved/.test(outcomes.tmp.error || '') && outcomes.tmp.kept && outcomes.tmp.aside === 0
      && outcomes.aside.code === 500 && /nothing was moved/.test(outcomes.aside.error || '') && outcomes.aside.kept && outcomes.aside.aside === 0
      && outcomes.place.code === 500 && /the old one was put back/.test(outcomes.place.error || '') && outcomes.place.kept && outcomes.place.aside === 0, JSON.stringify(outcomes));
  const bytesOk = seed(); const u2 = refuse(f2);
  let ok200 = null; try { quiet(() => UW.readReading(f2, P)); ok200 = press(P); } finally { u2(); }
  const asideOk = fs.readdirSync(dir2).filter((n) => n.startsWith(P + '.json.unreadable-'));
  const fy3routes = {};
  FY.create({ app: { post: (p, h) => { fy3routes[p] = h; } }, todos: () => store, cacheDir: dir2, nameOf: () => 'Hotel', isKnown: () => 'unconfirmed', backendOf: () => null, readNow: () => null, every: 0 });
  const r503 = (() => { const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; quiet(() => fy3routes[FY.ROUTE]({ params: { account: 'host-host-dial-x-1' }, headers: { 'sec-fetch-site': 'same-origin' } }, res)); return res; })();
  ok('§15 (b) …a file named for a machine the machines\' list cannot confirm (held) is NOT set aside — 503, refused by that name (machines_unread), never «no account»',
    r503.code === 503 && r503.body && r503.body.code === 'machines_unread' && /machines' list cannot be read/.test(r503.body.error || ''), JSON.stringify(r503.body));
  ok('§15 (b) FROM THE OWNER\'s PAGE the press SUCCEEDS through the route: 200 «pass», the old bytes kept beside it, a file that started again in its place',
    ok200.code === 200 && ok200.body && ok200.body.state === 'pass' && asideOk.length === 1 && fs.readFileSync(path.join(dir2, asideOk[0])).equals(bytesOk) && !!JSON.parse(fs.readFileSync(f2, 'utf8')).startedAgain, JSON.stringify({ code: ok200.code, body: ok200.body, asideOk }));
  // (c) THE POOL BRANCH of the pre-fire verdict: a pool whose only usable member is held — the continue waits
  const w = mkWorld();
  const sP = w.mkSession('sess-r3285p');
  w.writeCache(w.M2, w.healthy({ fiveHour: { utilization: 1, status: 'rejected', resetsAt: nowS() + 3600 } }));
  await tick(5);
  const vOpen = w.eng.quotaVerdictFor(w.P, { session: sP });
  await tick(5);
  let vHeld = null; { const u = refuse(path.join(w.cacheDir, w.M1 + '.json')); try { vHeld = w.eng.quotaVerdictFor(w.P, { session: sP }); } finally { u(); } }
  ok('§15 (c) THE POOL BRANCH: a pool whose ONLY usable member\'s reading cannot be told is NOT usable — the continue waits (it was usable through that member a moment before)',
    vOpen.usable === true && vHeld && vHeld.usable === false, JSON.stringify({ vOpen: vOpen.usable, vHeld: vHeld && { u: vHeld.usable, r: vHeld.reason } }));
  // (d) THE POOL's DECISION, held members: a start leaves a held default; a walled held member leaves; every member held — no target
  const pc = { A: UNREAD, B: reading({ fiveHour: { utilization: 0.3, resetsAt: nowS() + 3600 } }), C: UNREAD };
  const members = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }];
  const rd = (cs) => (id) => (id in cs ? cs[id] : null);
  const dStart = POOL.decidePoolSwitch({ currentId: 'A', members, readCache: rd(pc), nowSec: nowS(), hot: true, placing: true });
  const dWalled = POOL.decidePoolSwitch({ currentId: 'A', members, readCache: rd(pc), nowSec: nowS(), hot: true, exclude: ['A'] });
  const dAll = POOL.decidePoolSwitch({ currentId: 'A', members: [{ id: 'A', name: 'A' }, { id: 'C', name: 'C' }], readCache: rd(pc), nowSec: nowS(), hot: true, placing: true });
  ok('§15 (d) THE POOL\'s DECISION: a START leaves a held default for the measured member (held-unread); a held member that WALLED this conversation leaves as from any walled member (its escape named); with EVERY member held there is no target',
    !!dStart && dStart.to === 'B' && dStart.reason === 'held-unread' && !!dWalled && dWalled.to === 'B' && dWalled.escape === 'held-walled' && (!dAll || !dAll.to), JSON.stringify({ dStart, dWalled: dWalled && { to: dWalled.to, escape: dWalled.escape }, dAll: dAll && dAll.to }));
  // (e) THE WALL PROBE, driven: an account bound directly whose file cannot be read arms NO probe (its journal line), where a
  // readable wall with no reset arms the ladder
  const sD = { backend: 'claude', mode: 'chat', _webuiId: 'sess-r3285d', claudeSessionId: 'cid-r3285d', _accountId: w.M2, _autoResume: true, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'direct' };
  w.sessions.set(sD._webuiId, sD);
  w.writeCache(w.M2, w.healthy({ fiveHour: { utilization: 1, status: 'rejected' } }));   // a wall with no stated reset
  const said = [], l0 = console.log; console.log = (...a) => said.push(a.join(' '));
  let armedReadable = false, armedHeld = true;
  try {
    await tick(5); await w.eng.beforeAutoResumeFire(sD._webuiId, sD); armedReadable = !!sD._wallProbeTimer; try { clearTimeout(sD._wallProbeTimer); } catch { } sD._wallProbeTimer = null;
    await tick(5); const u = refuse(path.join(w.cacheDir, w.M2 + '.json'));
    try { await w.eng.beforeAutoResumeFire(sD._webuiId, sD); armedHeld = !!sD._wallProbeTimer; } finally { u(); }
    try { clearTimeout(sD._wallProbeTimer); } catch { } sD._wallProbeTimer = null;
  } finally { console.log = l0; }
  ok('§15 (e) THE WALL PROBE, driven: a readable wall with no reset arms the probe ladder; the same account whose file cannot be read arms NONE (a probe\'s answer could not be written) and says so',
    armedReadable === true && armedHeld === false && said.some((l) => /no wall probe — this account's usage reading file could not be read/.test(l)), JSON.stringify({ armedReadable, armedHeld, said: said.filter((l) => /wall/.test(l)).slice(0, 3) }));
  // (f) THE RESET-CREDIT RUNG, driven on a codex account: its file cannot be read — the credit is KEPT, no consume verb written
  const amC = new AccountManager({ dataDir: path.join(tmpdir('vs-r3285-cx-'), 'data') });
  const CX = amC.createCodexSubscription({ name: 'Foxtrot' }).id;
  const cxRoot = tmpdir('vs-r3285-cxroot-'), cxDir = path.join(cxRoot, 'data', 'usage-cache'); fs.mkdirSync(cxDir, { recursive: true });
  fs.writeFileSync(path.join(cxDir, CX + '.json'), JSON.stringify({ fetchedAt: Date.now(), source: 'codex-rate-limits', limitId: 'codex', spendControlReached: false, resetCredits: { availableCount: 2, at: Date.now() }, sevenDay: { usedPercent: 100, resetsAt: nowS() + 3600, windowMinutes: 10080 } }));
  const engC = engMod.create({ app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: cxRoot, USAGE_CACHE_DIR: cxDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, harnessSetting: () => 'auto', harnessDeclares: () => true, getAccounts: () => amC, getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null, getUserTodos: () => null });
  const writes = [];
  const sC = { backend: 'codex', mode: 'chat', _webuiId: 'sess-r3285c', _accountId: CX, pty: { write: (x) => { writes.push(String(x)); return true; } }, name: 'codex' };
  const saidC = []; const l1 = console.log; console.log = (...a) => saidC.push(a.join(' '));
  let rungHeld = null;
  try { const u = refuse(path.join(cxDir, CX + '.json')); try { rungHeld = engC.resetCreditRung(sC, { resetsAtSec: nowS() + 3600, lane: 'plan:7d', key: CX }); } finally { u(); } } finally { console.log = l1; }
  ok('§15 (f) THE RESET-CREDIT RUNG, driven: a codex account whose file cannot be read KEEPS its credit — the rung answers «skipped» by the reading\'s hold, and no consume verb is written to the conversation',
    rungHeld === 'skipped' && writes.length === 0 && saidC.some((l) => /kept \(reading-unread/.test(l)), JSON.stringify({ rungHeld, writes: writes.length, said: saidC.filter((l) => /reset-credit/.test(l)).slice(0, 2) }));
  // (g) THE GUARD's LISTENER reads a held account's file only at writes of THAT account (r3285 (7))
  let reads = 0;
  const HK = 'sub-r3285lis';
  const gL = guardMod.create({ dataDir: tmpdir('vs-r3285-lis-'), serverSetting: () => undefined, identityOf: (s) => (s && s.id ? { key: s.id, name: s.id } : null), readCacheFor: (k) => { if (k === HK) reads++; return k === HK ? { fetchedAt: Date.now(), startedAgain: { at: Date.now(), setAside: 'x', enumerated: false, overage: false, spendControl: false, resetCredits: false } } : null; }, getUserTodos: () => ({ add: () => ({ id: 'n' }), idsWhere: () => [], setStatus: () => { } }), log: () => { } });
  quiet(() => gL.authorize({ reason: 'auto-resume', session: { id: HK } }));
  const r0 = reads;
  for (let i = 0; i < 5; i++) UW.noteWritten(path.join(os.tmpdir(), 'sub-other-' + i + '.json'), '{}');
  const rOther = reads - r0;
  UW.noteWritten(path.join(os.tmpdir(), HK + '.json'), '{}');
  const rOwn = reads - r0 - rOther;
  ok('§15 (g) THE GUARD\'s LISTENER: five writes of OTHER accounts read the held account\'s file NOT once; a write of the held account reads it',
    rOther === 0 && rOwn >= 1, JSON.stringify({ rOther, rOwn }));
  // (h) r3349 — PRODUCTION's OWN known-name test (the engine's, as it hands the producer): an account, a global form, the PER-MACHINE
  // form the engine writes itself (`host-` + a machine id that holds dashes) while the REAL machines' list knows it, a removed
  // machine, the folder's models file, a made-up name; the list held ⇒ «unconfirmed»; the item's name is the machine's label
  {
    const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
    const hRoot = tmpdir('vs-r3349-'), hData = path.join(hRoot, 'data'); fs.mkdirSync(path.join(hData, 'usage-cache'), { recursive: true });
    const amH = new AccountManager({ dataDir: hData });
    const ACC = amH.createSubscription({ name: 'Golf' }).id;
    const hm = quiet(() => new HostManager({ dataDir: hData }));
    const HID = hm.add({ name: 'Lab box', transport: 'dial', deviceId: 'lab-r3349-1' });
    const engH = engMod.create({ app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: hRoot, USAGE_CACHE_DIR: path.join(hData, 'usage-cache'), activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => amH, getHosts: () => hm, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null, getUserTodos: () => null });
    const K = (k) => (typeof engH.usageReadingKnownOf === 'function' ? engH.usageReadingKnownOf(k) : null);   // (at the base: no such test — the machine's form red)
    const MK = 'host-' + HID;
    const seen = { account: K(ACC), global: K('__global__'), machine: K(MK), models: K('__models__'), madeUp: K('host-nobody-here'), label: typeof engH.usageReadingLabelOf === 'function' ? engH.usageReadingLabelOf(MK) : null };
    const realHeld = hm.held; hm.held = () => true;
    let unconfirmed = null, heldLabel = null; try { unconfirmed = K(MK); heldLabel = typeof engH.usageReadingLabelOf === 'function' ? engH.usageReadingLabelOf(MK) : null; } finally { hm.held = realHeld; }
    quiet(() => hm.remove(HID));
    const removed = K(MK);
    ok('§15 (h) PRODUCTION\'s OWN TEST: an account, the hub\'s own login and the per-machine form of a machine the REAL machines\' list knows (its id holds dashes) are known — that machine REMOVED is not, nor the folder\'s models file, nor a made-up name; with the machines\' list held the machine\'s form is «unconfirmed» (said, never set aside); the item names the machine by its label, never its file key',
      HID.includes('-') && seen.account === true && seen.global === true && seen.machine === true && seen.models === false && seen.madeUp === false && seen.label === 'Lab box'
        && unconfirmed === 'unconfirmed' && heldLabel === 'a paired machine' && removed === false, JSON.stringify({ HID, seen, unconfirmed, heldLabel, removed }));
  }
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
