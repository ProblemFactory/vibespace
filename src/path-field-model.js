'use strict';
// THE PATH FIELD'S ASK-AND-ANSWER MODEL (B-08d5, lane bl-tests-a; the coordinator's ruling 2026-11-19 22:19Z: five rounds of patches,
// each read finding faults the round before made, change the SHAPE of the work). PURE: no DOM, no fetch, no timer. src/lib/path-field.js
// turns what happens — a key, a text set from outside, a reply, a timer, the picker, a destroy — into EVENTS and performs the EFFECTS
// this model returns; no verdict is decided outside it.
//   init(key)                 → the state of a field BUILT over a text (A1: nothing asked)
//   step(state, event)        → { state, effects }
//   view(state, env)          → { status, kind, err?, tick } — what the line and the verdict say (env = the ranking's verdict for the
//                               text: empty / resolved / path-like / missing, and whether the machine's home is known)
//   keyOf(text, machine)      → the field's KEY: its text on its machine (a relative text's moving bases are the coordinator's LEFT row)
//   askedOf(sent, reply)      → the probes a reply may mark ASKED (B-0f3d: only those sent and answered in time)
// The events (each carries `cur` = keyOf(the box's text now, the machine now), and `now` = the clock):
//   typed {soon?}        the person typed (debounced) or Tab completed (asked at once)
//   set {commit, how, door}  a text SET from outside (a pick, a chip, set(), setDerived): asked at once (LAW 1)
//   commit {how, door}   a commit pressed (leave, Enter, Create): judged now on a fresh complete answer, else OWED to its run
//                        (`door` = the press's own, B-225c: its outcome names it)
//   reply {key, kind, err}   an answer: kind 'listing' (complete) | 'partial' (the machine's budget ran out) | 'failed' (none)
//   fired {which, connected} a timer fired: 'soon' (the debounce) or 'reask' (the bounded run's)
//   refresh {}           the door's inputs moved (a group, the name, the machine)
//   opened / closed      the list opened or closed (opening asks)
//   pickerClosed {picked}    the picker closed (without a pick ⇒ the field's own text is asked again if it has no answer)
//   ensureFailed {words}     the create at use failed
//   destroyed            the field is gone: no effect ever after
// The effects: {do:'ask', key, reask} · {do:'arm', which, ms} · {do:'disarm', which} · {do:'paint'} · {do:'abort'} ·
//   {do:'commit', how, as: 'ok'|'create'|'empty', key, doors} · {do:'settle', result: 'refused'|'dropped'|'moved'|'quiet'|'owed', doors}
//   B-225c: every press (a commit, a set that commits) carries its DOOR; an owed commit holds the doors of every press on its text and
//   machine (a second press JOINS); each outcome names exactly the doors it answers — a press is answered once, by its own outcome
// The rules (each a law of the coordinator's; the table and the seeded law in scripts/test-path-field-model.mjs hold them):
//   LAW 1 — a text the machine has not answered for says the pending words ONLY while an ask for it is out or due; never «missing»,
//     a raw path or a create tick before a COMPLETE answer for (text, machine) with the home known. A1 — a field built over a saved
//     text asks nothing and is QUIET until touched, a commit, or a refresh with the list open.
//   LAW 2 — a failed or partial reply never ends asking for good: a partial reply is asked again BOUNDED (PARTIAL_REPLIES a run), then
//     the machine did not answer; a keystroke, a commit, a refresh or a reopening starts a new run.
//   THE OWED COMMIT (the coordinator's wording, 23:08Z): it lives while asks for ITS OWN text on its own machine are out or due; it is
//     served at most once by a complete reply for that text and machine; it ends with true words when a run on it stops or fails, and
//     silently when the text or the machine changes (a later complete reply repaints only). A new run on the SAME text and machine (the
//     list opened again, a refresh with the list open, the picker closed) KEEPS it: a person's Create press never vanishes by a broadcast.

/* a partial reply (the machine's budget ran out — a hung storage mount holds a file worker up to its deadline per ask) is asked again
   BOUNDED: three = the first reply and two re-asks REASK_MS apart, each reply its own budget (450 ms here, the 2.5 s guard for another
   machine): about 2.3 s here and 8.4 s for another machine before the line says so — never an ask loop on a page nobody touches */
const PARTIAL_REPLIES = 3;
const UNSETTLED = 'unsettled';   // the end of a run whose bases kept moving (the line says the machine's answer did not settle)
const REASK_MS = 450;
const DEBOUNCE_MS = 110;
const DEDUPE_MS = 2000;   // an ask for a text with a fresh COMPLETE answer younger than this is not sent again (a failure always is)
/* a door that refreshes on every broadcast (Task Detail: an agent's activity line) asks a text the machine gave up on again only this
   long after the stop — never three asks to a hung mount per broadcast; a keystroke, a commit or a reopening asks at once */
const REFRESH_AFTER_STOP_MS = 30e3;
const HOME_READ_FAILS = 3;

// (B-d833, its fourth shape — R-e: the verdict in hand is for the text, the MACHINE and the BASES: a change of bases under a relative
// text is a new key, asked like any other)
const keyOf = (text, machine, bases = '') => String(text == null ? '' : text) + '\n' + (machine || '') + (bases ? '\n' + bases : '');
const textOf = (key) => String(key || '').split('\n')[0];
/* the SAME question but for its bases (B-d833, the box pre-runs r140/r142): the same text on the same machine — only the bases' spelling
   (learned from a reply: this machine's home, a paired machine's home or listing) or their set moved */
const sameAsk = (a, b) => { const x = String(a || '').split('\n'), y = String(b || '').split('\n'); return x[0] !== '' && x[0] === y[0] && (x[1] || '') === (y[1] || ''); };

/* LAW 2 for this machine's HOME (PURE): read again after a read that failed — never a kept failure; one read in flight; bounded at
   HOME_READ_FAILS failed reads a page. → read(): a promise of the home ('' while unknown) */
function homeReader(fetchHome, { maxFails = HOME_READ_FAILS } = {}) {
  let inflight = null, fails = 0;
  return () => {
    if (inflight) return inflight;
    if (fails >= maxFails) return Promise.resolve('');
    inflight = Promise.resolve().then(fetchHome).then(
      (d) => { inflight = null; const home = d && typeof d.home === 'string' ? d.home : ''; if (!home) fails++; return home; },
      () => { inflight = null; fails++; return ''; });
    return inflight;
  };
}

/* may the line say «does not exist»? only about a COMPLETE listing for this text on this machine with the home known; else the
   machine did not answer (asked), the pending words (an ask out or due), or quiet (nothing asked: A1) */
function missingGate({ listed = false, homeKnown = false, asked = false, sought = false } = {}) {
  if (listed && homeKnown) return 'missing';
  if (asked) return 'unanswered';
  return sought ? 'pending' : 'quiet';
}

/* B-0f3d: a reply names the AUXILIARY probes that ran out of the machine's budget (`probesLate`, the field's own strings; the text's own
   path is decided inside the listing's race and is never among them) */
const lateOf = (d) => new Set([...(d && Array.isArray(d.probesLate) ? d.probesLate : []), ...(d && Array.isArray(d.probesFailed) ? d.probesFailed : [])].map(String));
/* B-d833: the reply's kind for the model — SKIPPED (a dead entrance's mark: the time it ends rides `until`), FAILED (the machine's own
   error about the text), a complete listing, a partial one (a source the verdict needs did not answer), or none */
const replyKind = (d) => (d && d.verdict && d.verdict.kind === 'skipped' ? 'skipped' : d && d.verdict && d.verdict.kind === 'failed' ? 'failed' : d && d.listing && !d.partial ? 'listing' : d && d.partial ? 'partial' : 'failed');
/* which of the probes SENT a reply may mark ASKED (the field calls an asked-and-not-a-folder path «known absent» — a 新建 chip): only on
   a complete listing, never a late one */
function askedOf(sent, d) {
  if (!(d && d.listing && !d.partial)) return [];
  const late = lateOf(d);
  return (sent || []).map(String).filter((p) => !late.has(p));
}

function init(key = keyOf('', null)) {
  return { key, answer: null, everAsked: false, out: null, soon: null, reask: null, retry: null, run: { key: null, n: 0 }, owed: null, err: null, errRun: null, open: false, destroyed: false };
}

/* THE ONE RESOLVER, held by the model too (the read of the fourth shape, 2026-11-20 11:34Z, its should 4): at a reply an owed press
   reads the text's resolution from the VERDICT THE REPLY CARRIES — an env built before it (the verdict then in hand was the older one)
   can never refuse an existing folder */
const rankAt = (env, v) => { const r = (env && env.rank) || {}; return v && v.kind === 'exists' ? { ...r, empty: false, resolved: true, literal: !!v.literal, path: String(v.path || r.path || ''), missing: null } : r; };

const freshComplete = (s) => !!(s.answer && s.answer.key === s.key && s.answer.kind === 'complete' && !s.answer.stale);

/* the target-level verdict (what the TEXT is, before the «not applied» words and an unreachable machine) */
function gateOf(s, env = {}) {
  const r = env.rank || {}, key = env.cur !== undefined ? env.cur : s.key;   // the field's text and machine NOW (a door may have rewritten the box)
  if (r.empty || !textOf(key)) return 'empty';
  if (r.resolved) return 'ok';
  if (!(r.missing && r.pathLike)) return 'searching';
  const a = s.answer, mine = !!(a && a.key === key);
  if (mine && a.kind === 'skipped' && s.out !== key && s.soon !== key && s.reask !== key) return 'skipped';   // R-i: a dead entrance's mark, said with when it is asked again
  // SOUGHT is never stored: an ask for THIS key is out, or due by a timer — the pending words are true exactly then
  return missingGate({ listed: mine && a.kind === 'complete', homeKnown: !!env.homeKnown, asked: mine && a.kind !== 'partial', sought: s.out === key || s.soon === key || s.reask === key });
}

/* what the line and the verdict say — a function of the state (and the ranking's verdict for the text) alone */
function view(s, env = {}) {
  const g = gateOf(s, env);
  const base = { kind: g, tick: g === 'missing', answerErr: g === 'unanswered' ? (s.answer && s.answer.err) || '' : '', ...(g === 'skipped' ? { until: s.answer.until } : {}) };
  const moved = env.cur !== undefined && env.cur !== s.key;   // the box was rewritten under the field: the old run's pending words are not its
  if (s.err && !(moved && s.err.kind === 'pending')) return { ...base, status: 'unresolved', err: s.err };   // the «not applied» words first, the text's row below them
  if (env.unreachable) return { ...base, status: 'unreachable' };
  return { ...base, status: g === 'quiet' ? 'pending' : g };
}

/* ── the transitions ── */
/* an owed commit ENDS. ended (its run stopped or failed): the line says it was not applied, with the run's true words (its error when it
   gave one). moved (another text or machine, off the page): its «Asking the machine…» words go, nothing is said */
function drop(s, fx, ended, err = '') {
  const doors = (s.owed && s.owed.doors) || [];
  s.owed = null;
  if (ended) s.err = { kind: 'unanswered', err: String(err || '') };
  else if (s.err && s.err.kind === 'pending') s.err = null;
  fx.push({ do: 'settle', result: ended ? 'dropped' : 'moved', doors });
}
function disarm(s, fx, which) { if (s[which]) { s[which] = null; fx.push({ do: 'disarm', which }); } }
function armSoon(s, fx) { s.everAsked = true; s.soon = s.key; fx.push({ do: 'arm', which: 'soon', ms: DEBOUNCE_MS }); }
function ask(s, fx, now, { force = false, reask = false, press = false } = {}) {
  if (!force && freshComplete(s) && now - s.answer.at < DEDUPE_MS) return;
  if (!reask) {   // a new run (the bound); one for ANOTHER text or machine ends what the old run owed
    s.run = { key: s.key, n: 0 };
    disarm(s, fx, 'reask');
    if (s.owed && s.owed.key !== s.key) drop(s, fx, false);
  }
  disarm(s, fx, 'soon');   // an ask now supersedes the debounce
  s.everAsked = true; s.out = s.key;
  fx.push({ do: 'ask', key: s.key, reask: !!reask, ...(press ? { press: true } : {}) });   // (B-d833 R-i: a press is attended — the machine sends a dead entrance's call once inside its window)
}
/* judge a commit on the answer the field holds (env = the ranking's verdict after the reply merged) */
function judge(s, fx, how, env, doors = []) {
  const g = gateOf(s, env), r = env.rank || {};
  if (s.err && s.err.kind === 'pending') s.err = null;   // the commit is decided now: its «Asking the machine…» words go (the law found it, seed 455625)
  if (g === 'empty') { s.owed = null; fx.push({ do: 'commit', how, as: 'empty', key: s.key, doors }); return; }
  if (g === 'ok') { s.owed = null; fx.push({ do: 'commit', how, as: 'ok', key: s.key, doors }); return; }
  if (g === 'missing') {
    s.owed = null;
    const why = r.file && env.folder ? 'file' : env.createMode === 'never' ? 'never' : !env.tick ? 'tick' : null;
    if (why) { s.err = { kind: 'refused', why }; fx.push({ do: 'settle', result: 'refused', doors }); return; }
    fx.push({ do: 'commit', how, as: 'create', key: s.key, doors }); return;
  }
  // (B-225c's read: the two ends below are not reached today — commitFlow judges only a fresh complete answer or a resolved rank, and a
  // reply judges only ok / missing / empty / searching; they stay as the safe ends, never a «refused» for a text nobody answered)
  if (g === 'pending') { s.err = { kind: 'pending' }; s.owed = { key: s.key, how, doors: [] }; fx.push({ do: 'settle', result: 'owed', doors }); return; }   // its door hears «nothing yet»; judged again when its answer lands, inside its run
  if (g === 'unanswered') { s.owed = null; s.err = { kind: 'unanswered', err: (s.answer && s.answer.err) || '' }; fx.push({ do: 'settle', result: 'refused', doors }); return; }
  if (g === 'quiet') { s.owed = null; fx.push({ do: 'settle', result: 'quiet', doors }); return; }   // nothing asked for this text on this machine: nothing said
  s.owed = null; s.err = { kind: 'refused', why: 'notpath' }; fx.push({ do: 'settle', result: 'refused', doors });
}
function commitFlow(s, fx, ev) {
  const how = ev.how || 'api';
  // B-225c: a press on the SAME text and machine as an owed commit JOINS it (its doors answered by the one outcome — onCommit once); an
  // owed commit on another text or machine was already ended by the move (its doors answered «moved»: nothing, never an old path)
  const doors = [...((s.owed && s.owed.key === s.key && s.owed.doors) || []), ...(ev.door != null ? [ev.door] : [])];
  s.owed = null;
  s.err = null; s.errRun = null;
  if (!textOf(s.key)) { fx.push({ do: 'commit', how, as: 'empty', key: s.key, doors }); return; }
  const env = ev.env || {};
  if (freshComplete(s) || (env.rank && env.rank.resolved)) { judge(s, fx, how, env, doors); return; }   // the machine's listing already shows it, or a fresh complete answer: judged now
  s.owed = { key: s.key, how, doors };
  ask(s, fx, ev.now || 0, { force: true, press: true });
}

function step(s0, ev = {}) {
  if (!s0 || s0.destroyed) return { state: s0, effects: [] };
  const s = { ...s0, run: { ...s0.run } }; const fx = [];
  const now = ev.now || 0;
  // the field's text or machine moved under the model (a door rewrote the box without set(), the machine changed with no refresh):
  // the run moves on — what the old one owed is dropped, its pending words go, its timers no longer ask
  let rebased = false, rebasedFrom = null, moved = false;
  if (ev.cur !== undefined && ev.cur !== s.key) {
    const was = s.key; moved = true;
    s.key = ev.cur;
    if (sameAsk(s.key, was)) {
      // B-d833 (the box pre-runs): only the BASES moved under the same text — a NEW QUESTION, ASKED at once (below); an owed press is
      // CARRIED to it, never dropped («asking this machine…» with no ask out was the fault: the reply for the old spelling was dropped
      // as another text's and nothing asked again)
      if (s.owed && s.owed.key === was) s.owed = { ...s.owed, key: s.key };
      if (s.errRun === was) s.errRun = s.key;
      if (s.run.key === was) s.run = { ...s.run, key: s.key };   // the run's count carried with the question (joined below)
      rebased = true; rebasedFrom = s.key;
    } else {
      if (s.owed && s.owed.key !== s.key) drop(s, fx, false);   // its doors answered «moved» (B-225c: only ITS doors — a new press is not among them)
      if (s.errRun && s.errRun !== s.key) s.errRun = null;
    }
  }
  switch (ev.type) {
    case 'typed':
      s.err = null; s.errRun = null; s.open = true;
      if (ev.soon === false) ask(s, fx, now); else { disarm(s, fx, 'soon'); armSoon(s, fx); }
      fx.push({ do: 'paint' });
      break;
    case 'set':
      s.answer = null; s.err = null; s.errRun = null;
      disarm(s, fx, 'soon');
      if (ev.commit) commitFlow(s, fx, ev); else ask(s, fx, now);
      fx.push({ do: 'paint' });
      break;
    case 'commit':
      commitFlow(s, fx, ev);
      fx.push({ do: 'paint' });
      break;
    case 'reply': {
      if (ev.key !== s.key) { if (s.out === ev.key) s.out = null; break; }   // an answer for another text or machine is not the field's
      s.out = null;
      const kind = ev.kind === 'listing' ? 'listing' : ev.kind === 'partial' ? 'partial' : ev.kind === 'skipped' ? 'skipped' : 'failed';
      let run = 'done';
      if (kind === 'partial') { s.run = { key: s.key, n: (s.run.key === s.key ? s.run.n : 0) + 1 }; run = s.run.n < PARTIAL_REPLIES ? 'reask' : 'stop'; }
      else if (kind !== 'skipped') s.run = { key: s.key, n: 0 };   // (B-d833 R-i: a SKIPPED reply is no answer — not counted, the run kept)
      s.answer = { key: s.key, at: now, kind: kind === 'listing' ? 'complete' : kind === 'skipped' ? 'skipped' : run === 'reask' ? 'partial' : run === 'stop' ? 'gaveUp' : 'failed', err: run === 'stop' ? '' : String(ev.err || ''), stale: false , verdict: ev.verdict || null, until: Number(ev.until) || 0 };   // (B-d833 R-e: the verdict IN HAND for this key)
      if (s.owed && s.owed.key === s.key) {
        const env2 = ev.verdict ? { ...(ev.env || {}), rank: rankAt(ev.env, ev.verdict) } : (ev.env || {});
        const g = gateOf(s, env2), rk = env2.rank || {};
        // L6 READ AT THE PRESS (the coordinator's word, 03:38Z): an OWED press was made before the line showed anything — it is served
        // only by what the text names LITERALLY (its own first candidate, its link's target, an absolute text); a completion or a later
        // base ends the press with true words, and a second Enter (the line now shows it) uses it
        if (g === 'ok' && !rk.literal) { const d0 = s.owed.doors; s.owed = null; s.err = { kind: 'refused', why: 'literal', path: rk.path || '' }; fx.push({ do: 'settle', result: 'refused', doors: d0 }); }
        else if (g === 'ok' || g === 'missing' || g === 'empty' || g === 'searching') judge(s, fx, s.owed.how, env2, s.owed.doors);
        else if (kind === 'skipped') { drop(s, fx, true, ''); s.err = { kind: 'skipped', until: Number(ev.until) || 0 }; s.errRun = s.key; }   // a mark the press could not pass (its once is spent): said with when it is asked again   // the text is decided by this reply: served (or refused) once
        else if (run === 'reask') { if (s.owed.doors.length) { fx.push({ do: 'settle', result: 'owed', doors: s.owed.doors }); s.owed = { ...s.owed, doors: [] }; } s.err = { kind: 'pending' }; }   // still owed, inside its run (its door hears «nothing yet» once)
        else { drop(s, fx, true, s.answer.err); if (ev.verdict && ev.verdict.kind === 'failed') s.err = { kind: 'failed', err: String(ev.verdict.err || '') }; s.errRun = s.key; }   // the run ended unanswered (or the machine answered with an error — said so): the commit with it, the true words
      } else if (kind === 'listing' && s.errRun === s.key) { s.err = null; s.errRun = null; }   // a later complete reply repaints only
      if (run === 'reask') { s.reask = s.key; fx.push({ do: 'arm', which: 'reask', ms: REASK_MS }); }
      if (kind === 'skipped' && ev.until) { s.retry = s.key; fx.push({ do: 'arm', which: 'retry', ms: Math.max(0, Number(ev.until) - now) }); }   // R-i: ONE ask when the mark ends (a mount that came back heals with no key)
      fx.push({ do: 'paint' });
      break;
    }
    case 'fired': {
      const which = ev.which === 'reask' ? 'reask' : ev.which === 'retry' ? 'retry' : 'soon';
      const k = s[which]; if (!k) break;
      s[which] = null;
      if (which === 'soon') { if (k === s.key && ev.connected !== false) ask(s, fx, now); }   // off the page: no ask, ever
      else if (which === 'retry') { if (k === s.key && ev.connected !== false) ask(s, fx, now, { force: true }); }   // R-i: the mark ended — asked once, a new run
      else if (k === s.key && ev.connected !== false) ask(s, fx, now, { force: true, reask: true });
      else if (s.owed && s.owed.key === k) drop(s, fx, false);   // declined (moved, off the page): the run ends
      fx.push({ do: 'paint' });
      break;
    }
    case 'rekey':   // the page saw the key move with no act of its own (a reply re-spelled the bases): the rebase above asks it
      break;
    case 'refresh': {
      if (s.answer) s.answer = { ...s.answer, stale: true };
      if (s.open) ask(s, fx, now);
      else {
        const text = textOf(s.key), a = s.answer, mine = !!(a && a.key === s.key);
        const outOrDue = s.out === s.key || s.soon === s.key || s.reask === s.key;
        const ended = mine && (a.kind === 'failed' || a.kind === 'gaveUp');
        if (!outOrDue && text && s.everAsked && (!mine || (ended && now - a.at >= REFRESH_AFTER_STOP_MS))) armSoon(s, fx);   // A1: a field never asked stays quiet
      }
      fx.push({ do: 'paint' });
      break;
    }
    case 'opened':
      s.open = true; ask(s, fx, now); fx.push({ do: 'paint' });
      break;
    case 'closed':
      s.open = false; fx.push({ do: 'paint' });
      break;
    case 'pickerClosed':
      if (!ev.picked && textOf(s.key) && !freshComplete(s) && s.out !== s.key) { disarm(s, fx, 'soon'); armSoon(s, fx); }
      break;
    case 'ensureFailed':
      s.err = { kind: 'refused', why: 'ensure', words: String(ev.words || '') }; fx.push({ do: 'paint' });
      break;
    case 'destroyed':
      if (s.owed) drop(s, fx, false);   // its door answered, its «Asking the machine…» words with it (the law found it, seed 1500933)
      s.destroyed = true; s.soon = s.reask = s.out = null;
      fx.push({ do: 'disarm', which: 'all' }, { do: 'abort' });
      break;
    default: break;
  }
  // the rebased question is ASKED — once: not when an ask for it is already out or due, never on a destroyed field, never an empty text,
  // never on a field that has not asked yet (A1); a press it carries rides the ask (R-i). IT ENDS (the coordinator's r146, law 2): a
  // rebase JOINS the run's count (PARTIAL_REPLIES with the partial replies) — at the bound no ask: the run ends, said by name (UNSETTLED),
  // an owed press with it; a complete reply resets the count as before
  if (rebased && !s.destroyed && textOf(s.key) && s.everAsked && s.out !== s.key && s.soon !== s.key && s.reask !== s.key) {
    s.run = { key: s.key, n: (s.run.key === rebasedFrom ? s.run.n : 0) + 1 };
    if (s.run.n < PARTIAL_REPLIES) ask(s, fx, now, { force: true, reask: true, press: !!s.owed });   // (the SAME run: a re-ask)
    else { s.answer = { key: s.key, at: now, kind: 'gaveUp', err: UNSETTLED, stale: false, verdict: null }; if (s.owed) drop(s, fx, true, UNSETTLED); s.errRun = s.key; }
  }
  // a key that MOVED under the model is REDRAWN, whatever is asked (B-d833, the lane's own heavy run at aa84c835c, ⑩'s trace: my-mac's
  // reply was TAKEN and its home was in the world, but the text was EMPTY — the list open, nothing to judge, no rebase ask — so the reply
  // that re-spelled the bases was dropped as another key's and nothing painted: the rows kept the spelling from before that home)
  if (moved && !s.destroyed) fx.push({ do: 'paint' });
  return { state: s, effects: fx };
}

module.exports = { init, step, view, keyOf, textOf, sameAsk, missingGate, homeReader, askedOf, lateOf, replyKind, PARTIAL_REPLIES, UNSETTLED, REASK_MS, DEBOUNCE_MS, DEDUPE_MS, REFRESH_AFTER_STOP_MS, HOME_READ_FAILS };
