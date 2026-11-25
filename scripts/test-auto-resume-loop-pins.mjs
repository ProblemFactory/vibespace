#!/usr/bin/env node
// THE AUTO-RESUME LOOP's SOURCE PINS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-auto-resume-loop.mjs
// (its loop / breaker / gate legs on the real modules and every patched-copy CONTROL stay there): §5 THE WIRING PINS (2.355.0 law: a
// fix nobody calls is not a fix — src/server/auto-resume.js, src/server/usage-pool-engine.js, server.js and their callers), the
// delayed notice site's wiring pin, the near-arm DRIFT guard (src/server/usage-pool-engine.js), and §7's census of the disarm seams'
// callers with the typing sender's agent refusal. Each reads the file BY NAME, so ci.mjs's affected rule selects this suite on a
// change of one of them.
// Run: node scripts/test-auto-resume-loop-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);   // a moved pin reads its file through require('fs')
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('— §2 / §3c the notice wiring and the near-arm drift guard (source pins)');
{
  ok('WIRING: the delayed notice site asks armNoticeFor with the arm\'s own reason AND its cause (B-73fe) — and hands the stored reset-credit offer beside it (design-reset-credits §5)', /notify\(id, s2, armNoticeFor\(reason, resets, Date\.now\(\), a\.cause\), offer \? \{ resetCredit: offer \} : undefined\)/.test(require('fs').readFileSync(path.join(REPO, 'src/server/auto-resume.js'), 'utf8')));
  const engSrc = read('src/server/usage-pool-engine.js');
  ok('DRIFT: the two near-arm reasons the wording keys on are the ones the engine writes', /armIfEnabled\(id, session, Date\.now\(\) \+ 45000, `switched to a usable account \(/.test(engSrc) && /armIfEnabled\?\.\(id, session, Date\.now\(\) \+ 45000, 'account usable again'\)/.test(engSrc));
}

// ── §5 WIRING PINS (2.355.0 law: a fix nobody calls is not a fix) ──────────
{
  const eng = read('src/server/usage-pool-engine.js');
  const srv = read('server.js');
  // executable lines only — a refuted mechanism must stay NAMED in comments
  const engCode = eng.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok('WIRING: a walled turn tells the breaker the fire failed, BEFORE anything re-arms or re-switches', /function onWalledTurn\(session, sigs(?:, said = null)?\) \{[\s\S]{0,600}noteFireOutcome\?\.\(id, false, 'limit rejection'\)[\s\S]{0,900}demoteWalledAccount\(session, sigs\)/.test(eng));
  ok('WIRING: server.js gives auto-resume its identity from the engine (the SAME fact the wall demotes)', /fireIdentity: \(id, s\) => \{ try \{ return fireIdentityFor\(s\); \}/.test(srv) && /fireIdentityFor,/.test(srv));
  ok('WIRING: fireIdentityFor IS wallKeyFor (no second opinion about which account a fire lands on)', /function fireIdentityFor\(session\) \{[\s\S]{0,200}const key = wallKeyFor\(session\);/.test(eng));
  // 2026-09-07 (the VALUE half of the same incident): a READING is keyed to the
  // credential slot too — turn-pinned by its own resolver. Keeping the two
  // halves on different keys is exactly what let a wiped member "report" for
  // five days. The refuted routing (orgVerifiedKey) may not survive in code.
  // 2026-09-08 (inc-mts8a8mr-ulmm): the reading half now ALSO hands its own
  // window to the resolver — the lag shadow and the window guard are strictly
  // ADDITIONAL evidence about which credentials produced it, so the pin widens
  // to allow the extra arguments while still requiring the same two resolvers.
  // (2026-09-09 r2: the banner's `key` became a `let`, because a rejection
  // RECORD of the same turn can PROVE the wall belongs elsewhere and the
  // banner — which states no time of its own — has to follow that proof or one
  // rejection marks two members. The pin therefore also demands that the ONLY
  // thing allowed to move it is that proven re-file, so a third way of choosing
  // the banner's target goes red here.)
  ok('WIRING: BOTH a rejection and a reading are keyed to the credential slot, each turn-pinned', /const slot = ev\.status === 'rejected' \? rejectionSlotFor\(session\) : readingSlotFor\(session[^;]*\);[\s\S]{0,300}key = \(slot && slot\.key\) \|\| usageCacheKeyFor\(session\);/.test(eng) && /const slot = rejectionSlotFor\(session\);\s*\n\s*const pinKey = slot\.key \|\| readingSlotFor\(session\)\.key \|\| usageCacheKeyFor\(session\)/.test(eng));
  ok('WIRING: …and the ONLY thing that may move the banner off that pin is a re-file this turn PROVED (the banner states no time, so it has no evidence of its own)',
    (() => {
      const b = eng.slice(eng.indexOf('const pinKey = slot.key || readingSlotFor(session).key'));
      const body = b.slice(0, b.indexOf('const nowSec = Math.floor(Date.now() / 1000);'));
      const assigns = (body.match(/(?<![.\w$])key\s*=(?!=)[^;]*/g) || []).filter((a) => !/^key\s*=\s*pinKey$/.test(a.trim()));
      return assigns.length === 1 && /^key\s*=\s*refile\.to$/.test(assigns[0].trim()) && /session\._turnWallRefile/.test(body) && /session\._turnWallRefuted/.test(body); // …and a REFUTED pin is never marked (lane-hot-switch): that branch archives and returns, it moves nothing
    })(), 'assignments between the pin and the write');
  ok('WIRING: the refuted resolver is GONE from executable code (comments keep the record)', !/\borgVerifiedKey\b/.test(engCode) && /REFUTED AND REMOVED: `orgVerifiedKey/.test(eng));
  // wallSlotFor is the FRESH reading. WHO MAY READ IT — each reader named by its function and its line's text; the count
  // follows from the names (lane readings-attribution-2, 主开发 2026-11-15T16:41Z: the law is «nothing resolves the slot per
  // RECORD», not a number):
  //  · wallKeyFor;
  //  · the rejection pin's no-signal fallback (rejectionSlotFor) and the reading pin's fresh rung (readingSlotFor, 2026-09-07);
  //  · noteOatFileGen (lane oat-identity-fix, verify r1 F1, int272): the token FILE generation the NEXT turn starts on — once
  //    per turn, its only caller inside noteTurnEnd (pinned below);
  //  · requestSlotFor's three answers of an account that cannot have moved since the request they name: a conversation with no
  //    pool (its fixed login), a held process (its held login), a hot conversation whose own rows show no move after its latest
  //    request-out (the link the ledger proves it had at the request) — per request, not per record.
  // A producer that asks fresh, per record, is a reader with no name here and goes red (noteTurnAsk's fallback was one).
  const turnEndBody = (() => { const i = eng.indexOf('function noteTurnEnd(session'); const j = i < 0 ? -1 : eng.indexOf('\nfunction ', i + 1); return i < 0 ? '' : eng.slice(i, j < 0 ? undefined : j); })();
  const fnBody = (src, name) => { const i = src.indexOf(`\nfunction ${name}(`); const j = i < 0 ? -1 : src.indexOf('\nfunction ', i + 1); return i < 0 ? '' : src.slice(i, j < 0 ? undefined : j); };
  const WALL_READERS = [
    ['wallKeyFor', /function wallKeyFor\(session\) \{ return wallSlotFor\(session\)\.key; \}/],
    ['rejectionSlotFor', /if \(first\) return \{ key: first\.key, slotOk: !!first\.slot, slotReason: 'turn-pinned' \};[\s\S]{0,60}return wallSlotFor\(session\);/],
    ['readingSlotFor', /const fresh = wallSlotFor\(session\);/],
    ['noteOatFileGen', /const key = wallSlotFor\(session\)\.key;/],
    ['requestSlotFor', /if \(!poolId \|\| accounts\.get\(poolId\)\?\.type !== 'pooled'\) \{ const w = wallSlotFor\(session\); return \{ key: w\.key, slotOk: !!w\.slotOk, reqAt: t \}; \}/],
    ['requestSlotFor', /if \(heldPoolMemberFor\(session, poolId\)\) \{ const w = wallSlotFor\(session\); return \{ key: w\.key, slotOk: !!w\.slotOk, reqAt: t \}; \}/],
    ['requestSlotFor', /\n    const w = wallSlotFor\(session\);\n    return \{ key: w\.key, slotOk: !!w\.slotOk, reqAt: t \};/],
  ];
  const wallReaders = (src) => {
    const want = {}; for (const [n] of WALL_READERS) want[n] = (want[n] || 0) + 1;
    const per = {}; for (const n of Object.keys(want)) per[n] = (fnBody(src, n).match(/wallSlotFor\(session\)/g) || []).length;
    const named = WALL_READERS.filter(([n, re]) => !re.test(fnBody(src, n))).map(([n]) => n);
    const total = (src.match(/wallSlotFor\(session\)/g) || []).length;   // the definition + its named readers, and nothing else
    return { ok: !named.length && Object.keys(want).every((n) => per[n] === want[n]) && /\nfunction wallSlotFor\(session\) \{/.test(src) && total === 1 + WALL_READERS.length, per, total, unnamedMissing: named };
  };
  const WR = wallReaders(eng);
  ok('WIRING: NOTHING resolves the slot per RECORD — the fresh slot\'s readers are NAMED (wallKeyFor; the two turn pins\' fresh rungs; noteOatFileGen, called only from noteTurnEnd; requestSlotFor\'s three answers fixed since the request) and nothing else reads it', WR.ok && (eng.match(/noteOatFileGen\(session\)/g) || []).length === 2 && /\bnoteOatFileGen\(session\)/.test(turnEndBody), JSON.stringify(WR));
  {
    // the CONTROL: a NINTH reader — a producer asking fresh, per record (noteTurnAsk's old fallback put back) — is red
    const CURE = 'const k = (requestSlotFor(session) || {}).key; if (!k) return;';
    const ninth = eng.includes(CURE) ? wallReaders(eng.split(CURE).join('const k = (requestSlotFor(session) || wallSlotFor(session)).key; if (!k) return;')) : null;
    ok('CONTROL: a ninth reader of the fresh slot (noteTurnAsk\'s per-record fallback put back) ⇒ the census is red', !!ninth && !ninth.ok && ninth.total === 9, JSON.stringify(ninth));
  }
  ok('WIRING: the READING pin dies with the turn, exactly like the rejection pin', /session\._turnWallSigs = \[\]; session\._turnWorkAfterSig = 0;[\s\S]{0,400}session\._turnReadingSlot = null;/.test(eng));
  // THE MECHANISM, NOT THE COUNT (r2). This used to require EXACTLY TWO call
  // sites carrying `slot:`, which froze HOW MANY claude rejection paths exist
  // rather than what each of them must do — and the r2 wall-attribution fix
  // added a third (the branch that archives a rejection instead of writing it,
  // where the session is still blocked and the signal must still be recorded).
  // The invariant is that no wall signal may resolve the slot FRESHLY: every
  // one of them carries the turn-pinned `slot` variable its own path already
  // took, because the link moves before the turn ends.
  {
    const calls = eng.match(/noteWallSignal\(session, \{[^}]*\}\)/g) || [];
    const withSlot = calls.filter((c) => /\bslot:/.test(c));
    ok('WIRING: every wall signal that states a slot verdict took it AT REJECTION TIME (the turn-pinned variable, never a fresh resolution)',
      calls.length >= 3 && withSlot.length >= 3 && withSlot.every((c) => /slot: !!slot\??\.slotOk/.test(c))
      && !calls.some((c) => /wallSlotFor\(|sessionBillingMember\(/.test(c))
      && /sigs\.some\(\(x\) => x && x\.slot && \(!x\.key \|\| ids\.has\(x\.key\)\)\)/.test(eng),
      `${calls.length} call sites, ${withSlot.length} stating a slot`);
    // …and the codex paths, which have no credential slot to state, say so by
    // carrying a LANE instead — so "no slot" is a shape, never an omission.
    ok('WIRING: …and a call site with no slot to state carries its lane instead (never nothing)',
      calls.filter((c) => !/\bslot:/.test(c)).every((c) => /\blane:/.test(c)),
      calls.filter((c) => !/\bslot:/.test(c) && !/\blane:/.test(c)).join(' | ').slice(0, 200));
  }
  ok('WIRING: EVERY decision — blocking and value — reads sessionBillingMember; the observation routes nothing', (eng.match(/sessionBillingMember\(/g) || []).length >= 6 && /acct = sessionBillingMember\(session, acct\)\.id \|\| acct;/.test(eng) && !/sessionReadingMember/.test(engCode) && !/sessionCurrentMember/.test(eng));
  ok('WIRING: the per-session switch excludes members that already rejected this conversation', /const rejected = \[\.\.\.sessionWalledMembers\(sid, now\)\];[\s\S]{0,400}exclude: rejected/.test(eng));
  ok('WIRING: the verdict cannot answer `usable` through a member that rejected this session', /const walled = session \? sessionWalledMembers\(session\._webuiId\) : new Set\(\);[\s\S]{0,600}walled\.has\(m\.id\) && v\.usable !== false/.test(eng));
  ok('WIRING: the near-arm ASSERTION re-reads the same store the verdict read (round 2 compared viaId to demoted.key — unreachable, and pinned as if it were the defence)', /const veto = nearArmVeto\(v\.viaId, sessionWalledMembers\(id\)\);/.test(eng) && !/v\.viaId === demoted/.test(eng) && /wall-usable-is-rejector/.test(eng));
  ok('…and it SAYS it is an assertion, next to the mechanism that actually protects (a branch that cannot fire must never read like a guard)', /ASSERTION, NOT PROTECTION/.test(eng) && /INVARIANT ASSERTION — deliberately NOT its protection/.test(eng) && /INVARIANT VIOLATED/.test(eng));
  // 2026-09-07: `readLogin` joined the signature (login-session expiry) and
  // 'all-logins-expired' joined the reason ladder — both are NAMED inputs /
  // NAMED outcomes of exactly the kind this pin exists to require, so the pin
  // now tolerates siblings while still forbidding a silent empty list.
  ok('WIRING: decidePoolSwitch takes the exclusion as a NAMED input and reports it (never a silent empty candidate list)', /exclude = null,[^)]*explain = false \}\)/.test(read('src/account-pool-auto.js')) && /excludedN \? 'all-rejected' :[\s\S]{0,120}'no-members'/.test(read('src/account-pool-auto.js')));
  ok('WIRING: session-schema documents the slot flag on the wall signals', /_turnWallSigs:[^\n]*\{at, resetsAtMs, bucket, scopedName, key, slot\}/.test(read('src/session-schema.js')), read('src/session-schema.js').split('\n').find((l) => /_turnWallSigs/.test(l)));
  const ar2src = read('src/server/auto-resume.js');
  ok('WIRING: the refusal notice is chosen by the REASON (the call site passes the check through; round 1 computed `chk` and dropped it)', /breakerNotice\(id, session, label \|\| key, kind, chk\)/.test(ar2src) && /function breakerNotice\(id, session, label, kind, chk\) \{[\s\S]{0,700}refusalNoticeFor\(\{[\s\S]{0,200}reason: chk && chk\.reason/.test(ar2src));
  ok('WIRING: a journal-only refusal spends no notice budget (the return is ABOVE the stamp)', /if \(!n\) return;[\s\S]{0,220}r\.notices\[n\.cls\] = now; save\(\);/.test(ar2src));
  ok('WIRING: the identity is re-resolved INSIDE deliver (after the gate) and re-checked before spending', /const deliver = \(\) => \{[\s\S]{0,1400}const ident2 = identityFor\(id, session\) \|\| ident;[\s\S]{0,400}const chk2 = canFire\(id, key2, kind, now2\);[\s\S]{0,200}if \(!chk2\.ok\)/.test(ar2src) && /recordBeforeDelivery\(id, key2, kind, origin\)/.test(ar2src) && /function recordBeforeDelivery\(id, key, kind, origin = null\) \{[\s\S]{0,400}noteFired\(id, key, kind, Date\.now\(\), origin\)/.test(ar2src) && /announce\(id, session, key2, kind, note, \{ carried: !!carried\.note \}\)/.test(ar2src));
  // 2026-09-08: `cause` joined the inputs — the immediate path has a second
  // caller now (the new-member wake), and `kind:'now'` can no longer stand in
  // for "a pool switch". Pinned here so the card keeps naming what unblocked it.
  // …and the ORIGIN of a reading-driven fire reaches the record it is spent on
  // (2026-09-08 r2): the single-shot rule keys on the WALL, so if `origin` were
  // dropped anywhere between noteQuotaReading and noteFired the guard would
  // never arm and the loop would be back, silently.
  ok('WIRING: a reading-driven fire carries its WALL to the record, and the shot is stamped AT THE DELIVERY (not at the rejection report — a caller that never reports one may not re-open the spend)',
    /const fired = fireNow\(id, head, \{ via: 'reading', wall \}\);/.test(ar2src)
    && /function fireNow\(id, why, \{ cause = null, via = null, wall = null \} = \{\}\)[\s\S]{0,400}attemptFire\(id, session, a, 'now', why, cause, via \? \{ via, wall \} : null\)/.test(ar2src)
    && /function noteFired\(id, key, kind, now, origin = null\) \{[\s\S]{0,1400}if \(origin && origin\.via === 'reading' && origin\.wall\) r\.edgeSpent = origin\.wall;/.test(ar2src)
    && !/if \(r\.last\.via === 'reading'/.test(ar2src));
  // ── round 3: the async gate cannot be read as an outcome ────────────────
  // `attemptFire` returns `true` for a gate that is merely IN FLIGHT, and the
  // production gate is ALWAYS a Promise (server.js → `async
  // beforeAutoResumeFire`). So the reading edge may not journal a continue from
  // that return value, and a VETO must leave something behind or every push
  // re-enters the gate for the life of the watch.
  ok('WIRING (r3): the reading edge hands its own head to the fire and journals NOTHING itself — the line is written by the code that delivers',
    /const head = `\$\{a\.watch \? 'watched' : 'armed'\} window reopened \(\$\{why\}\)`;\s*\n\s*const fired = fireNow\(id, head, \{ via: 'reading', wall \}\);/.test(ar2src)
    && !/if \(fired\) log\(/.test(ar2src));
  // The async branch is the TWO-ARG `then` (the spend work's P8 layer): the
  // rejection handler must see ONLY the gate's own failure, so the veto record
  // and the fail-closed arm are pinned TOGETHER — one expression, because they
  // live in one call and a merge that keeps either alone is the bug.
  ok('WIRING (r3): a gate VETO is recorded where it is known — the async branch (whose rejection arm never delivers), the sync branch, and it holds the reading edge per WALL',
    /gate\.then\(\s*\(g2\) => \{ if \(g2 === false\) noteGateRefusal\(id, kind, origin\); else deliver\(\); \},\s*\(e\) => \{ gateFailedClosed\(id, 'rejected', e\); \}/.test(ar2src)
    && /if \(gate === false\) noteGateRefusal\(id, kind, origin\);/.test(ar2src)
    && /function noteGateRefusal\(id, kind, origin\) \{[\s\S]{0,500}if \(origin && origin\.via === 'reading' && origin\.wall\) \{ r\.edgeHeld = \{ wall: origin\.wall, until: now \+ EDGE_HOLD_MS \}; changed = true; \}/.test(ar2src)
    // …and the disk write is conditional: the no-hold paths (timed tick,
    // pool-switch/wake fireNow) reach this on every attempt, so an
    // unconditional save() is the same unbounded-effect-on-a-polled-path
    // shape one layer down.
    && /if \(changed\) save\(\);/.test(ar2src)
    && /if \(r0 && r0\.edgeHeld && r0\.edgeHeld\.wall === wall && Date\.now\(\) < r0\.edgeHeld\.until\)/.test(ar2src));
  // …and the pruner knows the hold can still refuse. `save()` deletes breaker
  // records that "can no longer refuse anything" and runs on every arm, fire
  // and refusal, so a field only the READER knows about is dropped at the next
  // FIRE_WINDOW_MS boundary — measured, 27 gate asks per four hours instead of
  // 24, before this clause existed. Every refusing field owes this predicate a
  // clause; `edgeSpent` (r2) is the same rule's first instance.
  ok('WIRING (r3): every field that can REFUSE is in the save() liveness predicate, or the pruner deletes it',
    /\|\| \(!!r\.edgeSpent && armed\.has\(k\)\)/.test(ar2src)
    && /\|\| \(!!\(r\.edgeHeld && r\.edgeHeld\.until > now\) && armed\.has\(k\)\);/.test(ar2src));
  ok('WIRING: the continue card is chosen from the ARM + whether the gate moved us + the caller\'s named CAUSE, in one place', /const moved = !!key && !!key2 && key2 !== key;[\s\S]{0,600}const note = continueNoticeFor\(\{ kind, armReason: a2\.reason, label: label2, moved, cause \}\);/.test(ar2src));
  // 'all-logins-expired' (2026-09-07) is the same class of fact — nowhere for
  // this conversation to go — so the breaker must hear it too, or it re-fires
  // into a pool whose every other member needs a re-login.
  ok('WIRING: the pool hands its own no-target verdict to the breaker (the ONLY source of "no usable member left")', /const noWay = ds && \(ds\.reason === 'all-rejected' \|\| ds\.reason === 'no-members' \|\| ds\.reason === 'stuck'[^)]*\);\s*\n\s*if \(noWay\) try \{ getAutoResume\(\)\?\.noteNoPoolTarget\?\.\(sid, rejected\.length, ds\.reason\); \}/.test(eng) && /ds\.reason === 'all-logins-expired'/.test(eng));
  ok("WIRING: the verdict's SCOPE for an unpooled session is its own credential slot too (routing the verdict to the spawn-time org asks a different account whether this session may spend)", /function _wallScope\(session\) \{[\s\S]{0,220}return wallKeyFor\(session\);/.test(eng) && !/orgVerifiedKey\(session, usageCacheKeyFor\(session\), 'wall/.test(eng));
  // (acceptance r3: the floor is ONE SHARED probe per target — the in-flight promise every gate for it awaits, §4j)
  ok('WIRING: the immediate path cannot turn the pre-fire probe into a spawn per pool switch (60s floor per target, ONE shared in-flight probe; the RE-VERDICT always runs)', /const _preFireProbe = new Map\(\);/.test(eng) && /if \(p && \(p\.pending \|\| Date\.now\(\) - p\.at <= 60e3\)\) return p\.done/.test(eng) && /if \(target\) await preFireProbe\(target, session\);/.test(eng));
  // ── round 4: the classification table IS the audit ──────────────────────
  // The kb essay carries this table in prose; here it is executable. The file
  // set is DERIVED (walk src/, keep whatever mentions noteRecovered) rather
  // than hand-listed — a hand-written inventory is the tool this codebase has
  // watched fail four times (B-3185 r7). A new call site that does not say
  // which kind of evidence it has fails HERE, before it can silently re-open
  // the loop; a dead row fails too.
  const AUDIT = [
    // file                              why                               worked  because
    ['src/server/usage-pool-engine.js', 'turn completed normally', true],   //  the turn ended with real output: WORK
    ['src/server/user-input.js', 'user sent a prompt', true],               //  a human took the conversation over (THE typing path: ws chat-input + the For-you reply): WORK
    // 2026-09-08: the two READING producers no longer call noteRecovered
    // directly — they route through ONE shared edge (noteQuotaReadingForResume)
    // which keeps the round-4 classification for an un-armed session and asks
    // an ARMED one whether the reading says the wall is gone. So the census has
    // one row here with a non-literal `why` (it is the caller's word), and the
    // literal whys are pinned separately below, one per producer.
    ['src/server/usage-pool-engine.js', '<non-literal>', false],             //  the shared reading edge; its callers' whys are pinned below
    ['src/server/usage-pool-engine.js', 'codex reset credit consumed', false], // the LIMIT moved; the conversation produced nothing
    ['src/server/usage-pool-engine.js', 'codex reset credit consumed (by another conversation on this account)', false], // design-reset-credits r2: a FOLLOWER of a sibling's credit — the limit moved for it too; it produced nothing
    ['src/server/auto-resume.js', 'disabled', false],                       //  the feature was switched off under a live arm
    ['src/server/auto-resume.js', 'its stop is over: a turn ran after the promise', false],   // r3196 (lane bl-loop-b): the FIRE found the conversation went on (its stop fact cleared) — a disarm, never proof of work
  ];
  const walk = (d, out = []) => {
    for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) walk(rel, out);
      else if (e.name.endsWith('.js') && read(rel).includes('noteRecovered')) out.push(rel);
    }
    return out;
  };
  /** Every noteRecovered CALL in the product, with the classification it passes. */
  const callSites = [];
  for (const f of walk('src')) {
    const txt = read(f);
    const re = /noteRecovered(?:\?\.)?\(/g;
    let m;
    while ((m = re.exec(txt))) {
      let i = m.index + m[0].length, depth = 1;
      while (i < txt.length && depth > 0) { const c = txt[i]; if (c === '(') depth++; else if (c === ')') depth--; i++; }
      const args = txt.slice(m.index + m[0].length, i - 1);
      const why = (args.match(/'([^']*)'/) || [])[1];
      if (why === undefined) {
        // the DEFINITION is the only legitimate non-literal match; a CALL whose `why`
        // is not a single-quoted literal is recorded as such and fails the table
        // below as unlisted (round-4 verifier: silently skipping it handed an
        // unclassified caller the dangerous `worked = true` default)
        if (/function\s+noteRecovered\s*\($/.test(txt.slice(0, m.index + m[0].length))) continue;
        callSites.push({ file: f, why: '<non-literal>', worked: !/worked:\s*false/.test(args) });
        continue;
      }
      callSites.push({ file: f, why, worked: !/worked:\s*false/.test(args) });
    }
  }
  const keyOf = (c) => `${c.file}|${c.why}|${c.worked}`;
  const derived = new Set(callSites.map(keyOf));
  const table = new Set(AUDIT.map(([f, why, worked]) => `${f}|${why}|${worked}`));
  ok('AUDIT: every noteRecovered call site in src/ is classified in the table (an unclassified new caller fails here, not in production)', [...derived].every((k) => table.has(k)), 'unlisted: ' + [...derived].filter((k) => !table.has(k)).join(' ; '));
  ok('AUDIT: …and every row of the table is a real call site (no dead rows)', [...table].every((k) => derived.has(k)), 'dead rows: ' + [...table].filter((k) => !derived.has(k)).join(' ; '));
  ok('AUDIT: the derivation actually found them all — 2 that claim WORK, 5 that do not', callSites.length === AUDIT.length && callSites.filter((c) => c.worked).length === 2, JSON.stringify(callSites));
  // …and the ONE non-literal row is not a hole: its callers are enumerated
  // from the source with their own literal whys, so a NEW reading producer that
  // forgets to route through the shared edge is caught here rather than in
  // production (the round-4 rule, applied one level up).
  {
    const engSrc = read('src/server/usage-pool-engine.js');
    const whys = [...engSrc.matchAll(/noteQuotaReadingForResume\([^;]*?'([^']+)'\)/g)].map((m) => m[1]).sort();
    ok('AUDIT: every caller of the shared reading edge is enumerated with its own why', whys.join(' / ') === 'fresh non-limited codex reading / fresh non-rejected reading', JSON.stringify(whys));
    ok('AUDIT: …and the shared edge is the ONLY thing that turns a reading into a noteRecovered', /function noteQuotaReadingForResume\(session, snapshot, why\)/.test(engSrc));
  }
  ok('AUDIT: the two callers the loop breaker trusts are a completed TURN and the USER — nothing else may clear it', callSites.filter((c) => c.worked).map((c) => c.why).sort().join(' / ') === 'turn completed normally / user sent a prompt', JSON.stringify(callSites.filter((c) => c.worked)));
  ok('WIRING: the breaker is cleared ONLY under the classification, and the disarm below stays unconditional', /function noteRecovered\(id, why, \{ worked = true \} = \{\}\) \{[\s\S]{0,400}if \(worked\) noteFireOutcome\(id, true, why\);\s*\n\s*const a = armed\.get\(id\);/.test(ar2src) && !/^\s*noteFireOutcome\(id, true, why\);/m.test(ar2src));
}

console.log('— §7 the disarm seams\' callers and the typing sender\'s agent refusal (census + pin)');
{
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (/\.js$/.test(e.name)) files.push(r); } };
  walk('src'); files.push('server.js');
  const callers = files.filter((f) => f !== 'src/server/auto-resume.js' && /(?:autoResume|getAutoResume\(\)|\bar)\?*\.(?:noteRecovered|setEnabled)\?*\.?\(/.test(read(f).split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n'))).sort();
  ok('§7 全B: …the only callers of the disarm seams are the engine, the ws toggle and the typing sender (' + files.length + ' files read)', JSON.stringify(callers) === JSON.stringify(['src/server/usage-pool-engine.js', 'src/server/user-input.js', 'src/ws-handler.js']), JSON.stringify(callers));
  ok('§7 全B: …and the typing sender\'s HTTP door refuses an agent token first (the reply route)', /if \(isAgentBearer\(req\)\) return fail\(res, 'agent_forbidden'/.test(read('src/routes/user-todos-reply.js')) && !/noteRecovered|setEnabled|autoResume/.test(read('src/agent-routes.js')));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
