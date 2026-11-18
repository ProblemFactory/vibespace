'use strict';
// WHY A SESSION STOPPED — A FACT OF THE SESSION (lane auto-resume-bulk, .349; userW's fleet, 2026-10-23: dozens of
// its conversations stopped the same day on usage walls with auto-resume off, and nobody will open and resume them one
// by one). Before this nothing remembered it: the wall machine's `_turnWallSigs` die with the turn, and the auto-resume
// core's armed map is filled only when auto-resume is ON (`armIfEnabled` returns at its first line otherwise) — so a
// session the wall took with the feature off looked exactly like one that had finished its work.
//
// THE FACT: `stoppedBy: { kind: 'quota' | 'overload', at, resetsAt?, memberId?, said }` on the session (persisted in its
// session-meta, carried on the live list), written at the turn end that stopped it and CLEARED by the next turn that
// runs. Everything here is PURE — the verdict from signals the core ALREADY has (never a second parser), the still-
// walled rule the bulk resume skips by, the batch's plan, and the words the card / the filter / the dialog print.
//   quota     the wall machine's own walled-turn verdict (usage-pool-engine onWalledTurn: a turn whose wall signals the
//             turn end confirmed) — its stated reset and the slot it landed on ride along, nothing is re-read
//   overload  a turn the harness ended because the model was overloaded, from a field the harness already TYPES:
//             claude's synthetic assistant record carries `error`, an enum the CLI fills from the HTTP status (2.1.308:
//             529 or `overloaded_error` → "overloaded", 429 → "rate_limit"), declared on the stream union in
//             src/record-shape.js; codex's task_failed carries `codexErrorInfo` (app-server 0.153.4 `serverOverloaded`).
//             WHICH values mean "overloaded" is the HARNESS's declared row (`quota.overloadErrors`, read through
//             harnesses.overloadErrorsOf) — handed in here, never a backend id. No text is matched.
// PURE: imports nothing. Words go through the caller's `t` (the client's dictionaries hold zh/ja; test-stopped-by pins
// every key below in src/lib/i18n-zh.js and src/lib/i18n-ja.js).

const STOP_KINDS = Object.freeze(['quota', 'overload']);
const SAID_MAX = 200;
const canon = (x) => String(x || '').toLowerCase().replace(/[_-]/g, '');
const num = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);

/** The harness's own line, bounded — one line, ≤ SAID_MAX characters. */
function boundSaid(text) {
  if (typeof text !== 'string') return null;
  const one = text.replace(/\s+/g, ' ').trim();
  if (!one) return null;
  return one.length > SAID_MAX ? one.slice(0, SAID_MAX - 1) + '…' : one;
}

/** Does this TYPED error say the model was overloaded? `declared` = the harness's quota.overloadErrors (compared
 *  case- and separator-insensitively, like codex-quota canonInfo: one variant, two spellings). */
function isOverloadError(declared, error) {
  if (!error || !Array.isArray(declared) || !declared.length) return false;
  const c = canon(error);
  return declared.some((d) => canon(d) === c);
}

/** THE VERDICT at a turn end. `walled` = the wall machine's walled-turn classification (it outranks everything: a turn
 *  the wall ended is a quota stop whatever else it said); else the turn's LAST typed error decides overload; else null
 *  (the turn ended for any other reason — nothing to mark). */
/** A wall's lane / bucket / scoped name, as the at-wall arm names them (a short word, or null) — kept so the switch's arm is
 *  the arm the wall would have made (the fresh-window edge needs the bucket to open a watch). */
const wallWord = (x) => (typeof x === 'string' && x && x.length <= 64 && /^[\w .:/+-]+$/.test(x) ? x : null);
function stopVerdict({ walled = false, resetsAt = 0, memberId = null, lastError = null, overloadErrors = [], said = null, at = Date.now(), lane = null, bucket = null, scopedName = null } = {}) {
  if (walled) {
    const out = { kind: 'quota', at: num(at) || Date.now(), resetsAt: num(resetsAt) || null, memberId: memberId ? String(memberId) : null, said: boundSaid(said), lane: wallWord(lane), bucket: wallWord(bucket), scopedName: wallWord(scopedName) };
    return out;
  }
  if (isOverloadError(overloadErrors, lastError)) return { kind: 'overload', at: num(at) || Date.now(), said: boundSaid(said) };
  return null;
}

/** A persisted / relayed value, re-validated (a meta written by an older or newer build must not reach a card raw). */
function normalizeStoppedBy(x) {
  if (!x || typeof x !== 'object' || !STOP_KINDS.includes(x.kind) || !num(x.at)) return null;
  const out = { kind: x.kind, at: num(x.at), said: boundSaid(x.said) };
  if (x.kind === 'quota') { out.resetsAt = num(x.resetsAt) || null; out.memberId = x.memberId ? String(x.memberId) : null; out.lane = wallWord(x.lane); out.bucket = wallWord(x.bucket); out.scopedName = wallWord(x.scopedName); }
  return out;
}

/** THE LIVE LIST'S FACT (server.js activeSessionsPayload): the session's stop re-validated, with its auto-continue state for
 *  the card's switch — `status` = the auto-resume core's statusFor(id) ({resume, enabled, armed, watch}). No switch
 *  (`autoResume: null`) where it can promise nothing: a harness that cannot continue a turn (no `resume`), and an OVERLOAD
 *  (auto-continue waits for a usage limit's reset — it never arms on an overload). `waiting` = HOW the core waits for this
 *  stop: 'timed' (armed — it continues at the reset), 'early' (a watch with its bucket — the reset is beyond the waiting
 *  bound, it continues only if a reading says the limit cleared early), false (nothing can continue it). null when not stopped. */
function liveFactOf(sb, status = null) {
  const f = normalizeStoppedBy(sb);
  if (!f) return null;
  const can = !!(status && status.resume) && f.kind === 'quota';
  const waiting = !can ? false : status.watch ? (status.bucket ? 'early' : false) : status.armed ? 'timed' : false;
  return { ...f, autoResume: can ? !!status.enabled : null, waiting, waitBoundMs: can && Number(status.maxWaitMs) > 0 ? Number(status.maxWaitMs) : null };   // the server's bound (the card's optimistic paint)
}

/** THE FILTER PREDICATE — the sidebar's «stopped by a limit or overload» filter and the bulk resume's candidate set. */
function isStoppedBy(row) { return !!(row && normalizeStoppedBy(row.stoppedBy)); }

/** IS THE WALL STILL STANDING? The bulk resume SKIPS a session whose wall has not reset (and says until when) — it never
 *  retries one blindly. `verdict` = the pool's live answer for this session ({usable: true|false|undefined,
 *  blockedUntil}) — it outranks the stored reset in BOTH directions (a pool with a free member serves a quota-stopped
 *  conversation now; an overloaded conversation on an account that has since walled waits like any other). With no
 *  verdict, a quota stop waits out its own stated reset; an overload has no reset to wait for. */
function stillWalled(sb, verdict = null, now = Date.now()) {
  const f = normalizeStoppedBy(sb);
  if (!f) return { walled: false, until: null };
  if (verdict && verdict.usable === true) return { walled: false, until: null };
  if (verdict && verdict.usable === false) {
    const until = num(verdict.blockedUntil) || (f.kind === 'quota' ? f.resetsAt : null) || null;
    return { walled: true, until: until && until > now ? until : null };
  }
  if (f.kind === 'quota' && f.resetsAt && f.resetsAt > now) return { walled: true, until: f.resetsAt };
  return { walled: false, until: null };
}

/** THE BATCH'S PLAN. rows: [{id, name, stoppedBy, live, streaming, canResume, quarantined, verdict}] → who is resumed,
 *  in which order (EARLIEST STOP FIRST), and who is skipped and why. Skip reasons:
 *    walled       its wall has not reset (`until` = when it does, null = not known)
 *    running      it is already running a turn — nothing to resume
 *    gone         no live process to continue (a resume of a stopped process is a respawn, not a continue)
 *    no-verb      its harness declares no resume verb (capsOf(backend).autoResume says never-armed)
 *    quarantined  the loop breaker: a continue onto this identity was just rejected again */
function planBatch(rows, { now = Date.now() } = {}) {
  const eligible = [], skipped = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.id) continue;
    const sb = normalizeStoppedBy(r.stoppedBy);
    if (!sb) continue;
    const base = { id: String(r.id), name: r.name || null, kind: sb.kind, at: sb.at };
    if (!r.live) { skipped.push({ ...base, why: 'gone', until: null }); continue; }
    if (r.streaming) { skipped.push({ ...base, why: 'running', until: null }); continue; }
    if (!r.canResume) { skipped.push({ ...base, why: 'no-verb', until: null }); continue; }
    const w = stillWalled(sb, r.verdict || null, now);
    if (w.walled) { skipped.push({ ...base, why: 'walled', until: w.until }); continue; }
    if (r.quarantined) { skipped.push({ ...base, why: 'quarantined', until: num(r.quarantined) || null }); continue; }
    eligible.push(base);
  }
  eligible.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { eligible, skipped };
}

// ── THE WORDS ────────────────────────────────────────────────────────────────
const plain = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const tOf = (tIn) => (typeof tIn === 'function' ? (s, p) => tIn(s, p) : plain);
/** The clock a word prints a time with: the CALLER's — the page hands page-time's stampAt (the ONE formatter a person reads,
 *  test-ui-language ⑦); this fallback (an ISO instant) is what a caller that hands none would see, never a hand-built hh:mm. */
const isoClock = (ms) => new Date(ms).toISOString();

/** The card's chip: {text, tip, toggle, cls}. «因用量停止 · 重置 14:00» / «模型过载 · 停于 13:42», and the auto-resume
 *  state beside it («自动继续：开/关»). `autoResumeOn` null = this harness cannot continue a turn (no toggle drawn). */
function chipWords(sb, tIn, { now = Date.now(), autoResumeOn = null, waiting = null, clock = isoClock } = {}) {
  const f = normalizeStoppedBy(sb);
  if (!f) return null;
  const t = tOf(tIn);
  let text;
  if (f.kind === 'quota') {
    text = !f.resetsAt ? t('Stopped by a usage limit')
      : f.resetsAt > now ? t('Stopped by a usage limit · resets {time}', { time: clock(f.resetsAt, now) })
        : t('Stopped by a usage limit · the limit has reset');
  } else {
    text = t('Model overloaded · stopped {time}', { time: clock(f.at, now) });
  }
  const toggle = autoResumeOn === null ? null : (autoResumeOn ? (waiting === false ? t('Auto-continue: on · not waiting for this limit') : waiting === 'early' ? t('Auto-continue: on · continues only if the limit clears early') : t('Auto-continue: on')) : t('Auto-continue: off'));
  const lines = [text];
  if (f.said) lines.push(t('The harness said: {said}', { said: f.said }));
  lines.push(t('This mark stays until the session runs again.'));
  return { text, tip: lines.join(' · '), toggle, cls: f.kind === 'quota' ? 'quota' : 'overload' };
}

/** The filter row's entry. */
function filterWords(n, tIn) { return tOf(tIn)('Stopped by a limit or overload ({n})', { n: Number(n) || 0 }); }

/** The «turn auto-resume on for every session» counts: «将开启 37 个会话；已开启 3 个». */
function autoResumeAllWords({ total = 0, on = 0 } = {}, tIn) {
  const t = tOf(tIn);
  const off = Math.max(0, (Number(total) || 0) - (Number(on) || 0));
  return {
    line: t('Will turn on {n} sessions; {m} already on', { n: off, m: Number(on) || 0 }),
    onButton: t('Turn auto-continue on for every session'),
    offButton: t('Turn it off for all'),
  };
}

/** The resume button's label — N = the stoppedBy set the person may act on; an empty set SAYS so (never a greyed hint). */
function resumeButtonWords(n, tIn, { waiting = 0 } = {}) {
  const t = tOf(tIn);
  if (n > 0) return t('Resume every session a usage limit or overload stopped ({n})', { n });
  // stopped sessions that cannot be resumed NOW (still inside a limit…) are not «none stopped»; ONE says so in the singular
  // (the follow-up's read: «None of the 1 stopped sessions» is no English, «1 个…都» no Chinese)
  return waiting === 1 ? t('The stopped session cannot be resumed now') : waiting > 1 ? t('None of the {m} stopped sessions can be resumed now', { m: waiting }) : t('No sessions stopped by a limit');
}
/** How many of the plan's skipped rows are STOPPED — a conversation that carries the mark but is RUNNING again is not
 *  (its row still says «already running» in the list below; the count is of the ones waiting). */
function waitingCount(skipped) { return (Array.isArray(skipped) ? skipped : []).filter((x) => x && x.why !== 'running').length; }

const SKIP_KEYS = Object.freeze({
  walled: 'still inside a limit',
  running: 'already running',
  gone: 'its process has ended',
  'no-verb': 'its harness cannot continue a turn',
  quarantined: 'a continue onto its account was just rejected',
  'no-answer': 'the quota check before it gave no answer',
  resumed: 'it has run again since',
  pending: 'a continue onto it is already on its way',
  'moved-refused': 'the account it moved to refused the spend',
  refused: 'the spend guard refused it now',   // U2 cure (law 1): the authorizer re-asked before THIS continue said no
  'account-refused': 'left stopped',            // form two (主开发 2026-11-18 16:20Z): the press is refused on ITS account — named
  'no-slot': 'its billing account could not be named',   // the cure's should: said before the press, never the whole press refused
});
/** The authorizer's OWN reasons (src/spend-authorizer.js `why`) in a person's words — a skipped row says WHICH rule refused
 *  it (U2 cure, law 1). A reason not listed says the skip alone (never a raw code). */
const REFUSED_KEYS = Object.freeze({
  'overage-in-use': 'its account is billing paid overage',
  'identity-cannot-serve': 'its account cannot serve a turn now',
  'spend-control-reached': 'its account reached the spend control set with its vendor',
  'hour-cap': 'its account used its turns nobody typed this hour',
  'day-cap': 'its account used its turns nobody typed today',
  'instance-cap': 'this VibeSpace used its turns nobody typed today',
});
/** …the same refusals with the ACCOUNT named (form two — 主开发 2026-11-18 16:20Z: «B is billing paid overage»). */
const REFUSED_NAMED_KEYS = Object.freeze({
  'overage-in-use': '{member} is billing paid overage',
  'identity-cannot-serve': '{member} cannot serve a turn now',
  'spend-control-reached': '{member} reached the spend control set with its vendor',
});
/** THE PRESSES OF THE DAY in a person's words (主开发 21:04Z (a)) — the spending view's lines: «14:02 — 30 planned, 28 continued»
 *  and, under each, the accounts it continued on. PURE: `presses` = the guard's pressesToday; `clock` the page's time words. */
function pressWords(presses, tIn, { now = Date.now(), clock = isoClock } = {}) {
  const t = tOf(tIn);
  const list = Array.isArray(presses) ? presses.filter((p) => p && Number(p.at) > 0) : [];
  if (!list.length) return null;
  return {
    head: t('Your presses today ({n})', { n: list.length }),
    rows: list.map((p) => ({
      line: p.delivered === null || p.delivered === undefined ? t('{time} — {planned} planned, still running', { time: clock(p.at, now), planned: p.planned }) : t('{time} — {planned} planned, {delivered} continued', { time: clock(p.at, now), planned: p.planned, delivered: p.delivered }),
      accounts: (Array.isArray(p.byAccount) ? p.byAccount : []).map((a) => t('{member}: {n}', { member: memberWords(a.name || a.key, t), n: a.n })),
    })),
  };
}
/** An account in a person's words: the machine's own login (its ledger key `__global__…`) is never shown as its key. */
function memberWords(m, tIn) { const t = tOf(tIn); return /^__global/.test(String(m || '')) ? t('This machine’s own login') : String(m || ''); }
/** The authorizer's reason in a person's words, or null (a reason not in the table) — the dialog's refusal line reads it. */
function refusedWords(why, tIn) { const k = REFUSED_KEYS[why]; return k ? tOf(tIn)(k) : null; }
/** One skipped row's words: «仍在限额内，至 14:00». */
function skipWords(s, tIn, { now = Date.now(), clock = isoClock } = {}) {
  const t = tOf(tIn);
  let why = t(SKIP_KEYS[s && s.why] || 'skipped');
  const named = s && s.member && s.reason ? REFUSED_NAMED_KEYS[s.reason] : null;   // the account BY NAME (form two)
  const r = s && s.reason ? REFUSED_KEYS[s.reason] : null;
  if (named) why = t('{why} ({reason})', { why, reason: t(named, { member: memberWords(s.member, t) }) });
  else if (r) why = t('{why} ({reason})', { why, reason: t(r) });
  return s && s.until ? t('{why} until {time}', { why, time: clock(s.until, now) }) : why;
}
/** THE SKIPPED ROWS GROUPED BY REASON (U2 cure: never cut with «and n more» — every row, under its reason with its count):
 *  [{key, words, n, head «仍在限额内 —— 8 个», rows}] in the order the reasons first appear. */
function skipGroups(rows, tIn) {
  const t = tOf(tIn);
  const by = new Map();
  for (const x of Array.isArray(rows) ? rows : []) {
    if (!x) continue;
    const key = `${x.why || ''}|${x.reason || ''}|${x.member || ''}`;   // one group per refused ACCOUNT (form two)
    let g = by.get(key);
    if (!g) { g = { key, words: skipWords({ why: x.why, reason: x.reason, member: x.member }, t), rows: [] }; by.set(key, g); }
    g.rows.push(x);
  }
  return [...by.values()].map((g) => ({ ...g, n: g.rows.length, head: t('{why} — {n}', { why: g.words, n: g.rows.length }) }));
}
/** The dialog's outcome line: «恢复了 29 个 · 跳过 8 个（仍在限额内）· 拒绝 0». `refused` = the number the spend guard
 *  refused (a refusal resumes NONE, so it is all of the planned set or 0); `stopped` = the ones a Stop left unstarted. */
function summaryWords({ resumed = 0, skipped = [], refused = 0, failed = 0, notReached = 0, stopped = 0 } = {}, tIn) {
  const t = tOf(tIn);
  const list = Array.isArray(skipped) ? skipped : [];
  const walled = list.filter((s) => s && s.why === 'walled').length;
  const other = list.length - walled;
  const parts = [t('Resumed {n}', { n: resumed })];
  parts.push(walled && !other ? t('skipped {n} (still inside a limit)', { n: walled })
    : walled ? t('skipped {n} ({w} still inside a limit)', { n: list.length, w: walled })
      : t('skipped {n}', { n: list.length }));
  parts.push(t('refused {n}', { n: refused }));
  if (failed) parts.push(t('could not deliver {n}', { n: failed }));
  if (stopped) parts.push(t('stopped {n}', { n: stopped }));
  if (notReached) parts.push(t('not reached {n}', { n: notReached }));
  return parts.join(' · ').replace(/） · /g, '）· '); // a full-width paren carries its own space
}

/** Every key the words above can print — test-stopped-by holds zh + ja to it. */
const WORD_KEYS = Object.freeze([
  'Stopped by a usage limit', 'Stopped by a usage limit · resets {time}', 'Stopped by a usage limit · the limit has reset',
  'Model overloaded · stopped {time}', 'Auto-continue: on', 'Auto-continue: off', 'The harness said: {said}',
  'This mark stays until the session runs again.', 'Stopped by a limit or overload ({n})', 'Auto-continue: on · not waiting for this limit', 'Auto-continue: on · continues only if the limit clears early',
  'Will turn on {n} sessions; {m} already on', 'Turn auto-continue on for every session', 'Turn it off for all',
  'Resume every session a usage limit or overload stopped ({n})', 'No sessions stopped by a limit', 'The stopped session cannot be resumed now', 'None of the {m} stopped sessions can be resumed now',
  ...Object.values(SKIP_KEYS), 'skipped', '{why} until {time}',
  'Resumed {n}', 'skipped {n} (still inside a limit)', 'skipped {n} ({w} still inside a limit)', 'skipped {n}', 'refused {n}', 'could not deliver {n}', 'not reached {n}',
  ...Object.values(REFUSED_KEYS), ...Object.values(REFUSED_NAMED_KEYS), 'This machine’s own login', 'Your presses today ({n})', '{time} — {planned} planned, {delivered} continued', '{time} — {planned} planned, still running', '{member}: {n}', '{why} ({reason})', '{why} — {n}', 'stopped {n}',
]);

module.exports = {
  STOP_KINDS, SAID_MAX, SKIP_KEYS, REFUSED_KEYS, REFUSED_NAMED_KEYS, WORD_KEYS,
  boundSaid, isOverloadError, stopVerdict, normalizeStoppedBy, liveFactOf, isStoppedBy, stillWalled, planBatch,
  chipWords, filterWords, autoResumeAllWords, resumeButtonWords, waitingCount, skipWords, skipGroups, summaryWords, refusedWords, memberWords, pressWords,
};
