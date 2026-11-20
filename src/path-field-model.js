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
//   set {commit, how}    a text SET from outside (a pick, a chip, set(), setDerived): asked at once (LAW 1)
//   commit {how}         a commit pressed (leave, Enter, Create): judged now on a fresh complete answer, else OWED to its run
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
const REASK_MS = 450;
const DEBOUNCE_MS = 110;
const DEDUPE_MS = 2000;   // an ask for a text with a fresh COMPLETE answer younger than this is not sent again (a failure always is)
/* a door that refreshes on every broadcast (Task Detail: an agent's activity line) asks a text the machine gave up on again only this
   long after the stop — never three asks to a hung mount per broadcast; a keystroke, a commit or a reopening asks at once */
const REFRESH_AFTER_STOP_MS = 30e3;
const HOME_READ_FAILS = 3;

const keyOf = (text, machine) => String(text == null ? '' : text) + '\n' + (machine || '');
const textOf = (key) => { const k = String(key || '\n'); return k.slice(0, k.lastIndexOf('\n')); };

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
const lateOf = (d) => new Set(d && Array.isArray(d.probesLate) ? d.probesLate.map(String) : []);
/* which of the probes SENT a reply may mark ASKED (the field calls an asked-and-not-a-folder path «known absent» — a 新建 chip): only on
   a complete listing, never a late one */
function askedOf(sent, d) {
  if (!(d && d.listing && !d.partial)) return [];
  const late = lateOf(d);
  return (sent || []).map(String).filter((p) => !late.has(p));
}

function init(key = keyOf('', null)) {
  return { key, answer: null, everAsked: false, out: null, soon: null, reask: null, run: { key: null, n: 0 }, owed: null, err: null, errRun: null, open: false, destroyed: false };
}

const freshComplete = (s) => !!(s.answer && s.answer.key === s.key && s.answer.kind === 'complete' && !s.answer.stale);

/* the target-level verdict (what the TEXT is, before the «not applied» words and an unreachable machine) */
function gateOf(s, env = {}) {
  const r = env.rank || {}, key = env.cur !== undefined ? env.cur : s.key;   // the field's text and machine NOW (a door may have rewritten the box)
  if (r.empty || !textOf(key)) return 'empty';
  if (r.resolved) return 'ok';
  if (!(r.missing && r.pathLike)) return 'searching';
  const a = s.answer, mine = !!(a && a.key === key);
  // SOUGHT is never stored: an ask for THIS key is out, or due by a timer — the pending words are true exactly then
  return missingGate({ listed: mine && a.kind === 'complete', homeKnown: !!env.homeKnown, asked: mine && a.kind !== 'partial', sought: s.out === key || s.soon === key || s.reask === key });
}

/* what the line and the verdict say — a function of the state (and the ranking's verdict for the text) alone */
function view(s, env = {}) {
  const g = gateOf(s, env);
  const base = { kind: g, tick: g === 'missing', answerErr: g === 'unanswered' ? (s.answer && s.answer.err) || '' : '' };
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
function ask(s, fx, now, { force = false, reask = false } = {}) {
  if (!force && freshComplete(s) && now - s.answer.at < DEDUPE_MS) return;
  if (!reask) {   // a new run (the bound); one for ANOTHER text or machine ends what the old run owed
    s.run = { key: s.key, n: 0 };
    disarm(s, fx, 'reask');
    if (s.owed && s.owed.key !== s.key) drop(s, fx, false);
  }
  disarm(s, fx, 'soon');   // an ask now supersedes the debounce
  s.everAsked = true; s.out = s.key;
  fx.push({ do: 'ask', key: s.key, reask: !!reask });
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
  ask(s, fx, ev.now || 0, { force: true });
}

function step(s0, ev = {}) {
  if (!s0 || s0.destroyed) return { state: s0, effects: [] };
  const s = { ...s0, run: { ...s0.run } }; const fx = [];
  const now = ev.now || 0;
  // the field's text or machine moved under the model (a door rewrote the box without set(), the machine changed with no refresh):
  // the run moves on — what the old one owed is dropped, its pending words go, its timers no longer ask
  if (ev.cur !== undefined && ev.cur !== s.key) {
    s.key = ev.cur;
    if (s.owed && s.owed.key !== s.key) drop(s, fx, false);   // its doors answered «moved» (B-225c: only ITS doors — a new press is not among them)
    if (s.errRun && s.errRun !== s.key) s.errRun = null;
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
      const kind = ev.kind === 'listing' ? 'listing' : ev.kind === 'partial' ? 'partial' : 'failed';
      let run = 'done';
      if (kind === 'partial') { s.run = { key: s.key, n: (s.run.key === s.key ? s.run.n : 0) + 1 }; run = s.run.n < PARTIAL_REPLIES ? 'reask' : 'stop'; }
      else s.run = { key: s.key, n: 0 };
      s.answer = { key: s.key, at: now, kind: kind === 'listing' ? 'complete' : run === 'reask' ? 'partial' : run === 'stop' ? 'gaveUp' : 'failed', err: run === 'stop' ? '' : String(ev.err || ''), stale: false };
      if (s.owed && s.owed.key === s.key) {
        const g = gateOf(s, ev.env || {});
        if (g === 'ok' || g === 'missing' || g === 'empty' || g === 'searching') judge(s, fx, s.owed.how, ev.env || {}, s.owed.doors);   // the text is decided by this reply: served (or refused) once
        else if (run === 'reask') { if (s.owed.doors.length) { fx.push({ do: 'settle', result: 'owed', doors: s.owed.doors }); s.owed = { ...s.owed, doors: [] }; } s.err = { kind: 'pending' }; }   // still owed, inside its run (its door hears «nothing yet» once)
        else { drop(s, fx, true, s.answer.err); s.errRun = s.key; }   // the run ended unanswered: the commit with it, the true words
      } else if (kind === 'listing' && s.errRun === s.key) { s.err = null; s.errRun = null; }   // a later complete reply repaints only
      if (run === 'reask') { s.reask = s.key; fx.push({ do: 'arm', which: 'reask', ms: REASK_MS }); }
      fx.push({ do: 'paint' });
      break;
    }
    case 'fired': {
      const which = ev.which === 'reask' ? 'reask' : 'soon';
      const k = s[which]; if (!k) break;
      s[which] = null;
      if (which === 'soon') { if (k === s.key && ev.connected !== false) ask(s, fx, now); }   // off the page: no ask, ever
      else if (k === s.key && ev.connected !== false) ask(s, fx, now, { force: true, reask: true });
      else if (s.owed && s.owed.key === k) drop(s, fx, false);   // declined (moved, off the page): the run ends
      fx.push({ do: 'paint' });
      break;
    }
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
  return { state: s, effects: fx };
}

module.exports = { init, step, view, keyOf, textOf, missingGate, homeReader, askedOf, PARTIAL_REPLIES, REASK_MS, DEBOUNCE_MS, DEDUPE_MS, REFRESH_AFTER_STOP_MS, HOME_READ_FAILS };
