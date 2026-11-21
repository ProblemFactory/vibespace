#!/usr/bin/env node
// THE PATH FIELD'S MODEL (B-08d5; the coordinator's ruling 2026-11-19 22:19Z — five rounds of patches whose reads each found faults the
// round before made: the field's ask-and-answer logic became PURE src/path-field-model.js, and the state table became its test).
//   ① THE TABLE: each row — a state built by events, ONE event, the next state, the words — is a direct leg, read from ROWS below
//   ② THE LAW, SEEDED: random interleavings of the events (typed, Tab, set from outside, commit, the replies — complete / partial /
//      failed / for an older text / from another machine — the timers, refresh, the list opened and closed, the machine changed with
//      and without a refresh, the box rewritten by a door, the picker closed, the create failing, destroyed) over hundreds of seeds,
//      the INVARIANTS checked after EVERY step:
//        I1 LAW 1 — never «missing» nor a create tick for a text the machine has not answered COMPLETELY (its key, the home known)
//        I2 the pending words only while an ask for the text is out or due; «未生效：正在问这台机器…» only while its commit is owed
//        I3 never a commit while pending or unanswered: «ok» only for a text the machine's listing shows, «create» only on a complete
//           answer for its own key with the home known and the tick
//        I4 an owed commit lives while asks for its own text on its own machine are out or due; it is served at most once by a reply for
//           that text and machine; it ends when a run on it stops or fails (true words) or the text or machine changes (silently)
//        I5 at most PARTIAL_REPLIES partial replies a run; no ask without an event that starts one
//        I6 after «destroyed», no effect at all
//        I7 A1 — a field built over a saved text and never touched asks nothing (a closed refresh included)
//        I8 the words are a function of the state alone (the view of a copy is the view)
//        I9 THE DOORS (B-225c): every press is answered ONCE, by its own outcome — never by a commit for another text or machine, never
//           dropped while its text and machine are the field's, never left hanging (an owed commit holds every door still waiting)
//      each invariant with its RED CONTROL: the rule removed in a copy of the model (an anchored edit of the shipped source) — the
//      same driver finds the scene by itself and prints its seed
//   ②b THE EVENT CENSUS (every event handled is fired at a named site, every fire( names its event, the list closes in one place)
//   ②c THE DOORS' WIRING (B-225c's read): read from the page's text — every door made is handed to the model, answer( at exactly
//      three sites (a settle with «nothing», a commit with its info BEFORE onCommit, destroy() with the doors left), no door made on
//      a destroyed field — four RED CONTROLS (the old settle, a commit with no door, set() unguarded, onCommit first)
//   ③ this machine's home (LAW 2: a failed read is read again, bounded) and New Session's footer (createRefusal lists «unanswered»)
//   ④ THE TICK BELONGS TO THE PATH IT WAS GIVEN FOR (B-f3a1): PURE tickHolds over every road that moves the field's key — typing, a set
//      from outside, a refresh after a Task Group change (the bases), another machine, a chip that is not a «new» chip — each with its
//      RED CONTROL (the key check taken out: the tick carries); the consent made at use holds; the page's WIRING (every read through
//      tickNow, every give through giveTick with the path it is for); a refresh after a Task Group change asks again
//   ⑤ THE FIELD'S VALUE ANSWERS WHAT THE BOX AND THE LINE SHOW, OR NOTHING (B-5736): PURE valueFor (the box's text, a press ended with
//      nothing) with REDs; the page's wiring + RED; THE DOORS take the folder from their press's own answer (a source pin a door, a
//      planted raw read named) and every page that builds a field is a door of the table
// Run: node scripts/test-path-field-model.mjs   (PFM_SEED_ONLY=<seed> replays one seed of the law with its whole sequence)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(path.join(REPO, 'src', 'path-field-model.js'), 'utf8');
const load = (src) => { const mod = { exports: {} }; new Function('module', 'exports', 'require', src)(mod, mod.exports, require); return mod.exports; };
const P = load(SRC);   // the shipped source, compiled the way its controls are

let bad = 0, n = 0;
const ok = (name, cond, got) => { if (typeof name !== 'string') throw new TypeError('ok(name, cond, got): the leg\'s name first'); n++; if (!cond) bad++; console.log(`${cond ? 'ok ' : 'BAD'} ${name}${cond ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 900)}`); };

const K = (t, h = null) => P.keyOf(t, h);
const RANKS = { missing: { missing: true, pathLike: true }, resolved: { resolved: true, pathLike: true, literal: true }, completion: { resolved: true, pathLike: true, literal: false, path: '~/payments' }, search: { pathLike: false }, empty: { empty: true } };
const envOf = (cur, { rank = 'missing', homeKnown = true, tick = false, createMode = 'ask', folder = true, file = false, unreachable = false } = {}) =>
  ({ cur, rank: { ...RANKS[rank], file }, homeKnown, unreachable, tick, createMode, folder });

/* ═══ ① THE TABLE ═══ — each row: start key, the events that build the state (each [event, env]), ONE event, what must follow */
const A = K('~/a'), B = K('~/b'), AM = K('~/a', 'h-mac'), X = K('x'), E = K('');
const drive = (G, start, evs) => {
  let s = G.init(start), fx = [];
  for (const [ev, eo = {}] of evs) {
    const cur = ev.cur !== undefined ? ev.cur : s.key;
    const r = G.step(s, { now: 0, ...ev, cur, env: envOf(cur, eo) });
    s = r.state; fx = r.effects;
  }
  return { s, fx };
};
const does = (fx, what) => fx.filter((e) => e.do === what);
const viewOf = (s, eo = {}) => P.view(s, envOf(eo.cur !== undefined ? eo.cur : s.key, eo));
const ROWS = [
  { row: 'V8 built over a saved text (A1): nothing asked, QUIET (status pending — a form refuses)', start: A, evs: [], check: ({ s }) => viewOf(s).kind === 'quiet' && viewOf(s).status === 'pending' && !s.everAsked },
  { row: 'set from outside: asked at once, the pending words from the first paint (V7)', start: A, evs: [[{ type: 'set' }]], check: ({ s, fx }) => does(fx, 'ask').length === 1 && does(fx, 'ask')[0].key === A && viewOf(s).kind === 'pending' },
  { row: 'typed: the debounce armed, the pending words (V7)', start: A, evs: [[{ type: 'typed' }]], check: ({ s, fx }) => does(fx, 'arm')[0]?.which === 'soon' && does(fx, 'ask').length === 0 && viewOf(s).kind === 'pending' },
  { row: 'Tab: asked at once', start: A, evs: [[{ type: 'typed', soon: false }]], check: ({ fx }) => does(fx, 'ask').length === 1 },
  { row: 'a complete reply, the home known: «missing» with the create tick (V5)', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'listing' }]], check: ({ s }) => viewOf(s).kind === 'missing' && viewOf(s).tick },
  { row: 'a complete reply, the home UNKNOWN: «the machine did not answer», no tick (V6)', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'listing' }]], check: ({ s }) => viewOf(s, { homeKnown: false }).kind === 'unanswered' && !viewOf(s, { homeKnown: false }).tick },
  { row: 'a failed reply: «the machine did not answer» with its error (V6)', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'failed', err: 'boom' }]], check: ({ s }) => viewOf(s).kind === 'unanswered' && viewOf(s).answerErr === 'boom' },
  { row: 'a partial reply: still pending, the re-ask armed (450 ms)', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'partial' }]], check: ({ s, fx }) => viewOf(s).kind === 'pending' && does(fx, 'arm')[0]?.which === 'reask' && does(fx, 'arm')[0]?.ms === P.REASK_MS },
  { row: 'the third partial reply: the run stops — «did not answer», no re-ask', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'fired', which: 'reask' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'fired', which: 'reask' }], [{ type: 'reply', key: A, kind: 'partial' }]], check: ({ s, fx }) => viewOf(s).kind === 'unanswered' && does(fx, 'arm').length === 0 && s.answer.kind === 'gaveUp' },
  { row: 'a reply for ANOTHER text (an older ask) is not the field\'s answer', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: B, kind: 'listing' }]], check: ({ s }) => !s.answer && viewOf(s).kind === 'pending' },
  { row: 'the re-ask fires, same text and machine, on the page: asked again (same run)', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'fired', which: 'reask', connected: true }]], check: ({ fx }) => does(fx, 'ask')[0]?.reask === true },
  { row: 'the debounce fires OFF the page (a field a repaint replaced): no ask, ever', start: A, evs: [[{ type: 'typed' }], [{ type: 'fired', which: 'soon', connected: false }]], check: ({ fx }) => does(fx, 'ask').length === 0 },
  { row: 'the re-ask fires OFF the page: no ask; an owed commit dropped (moved)', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'fired', which: 'reask', connected: false }]], check: ({ s, fx }) => does(fx, 'ask').length === 0 && !s.owed && does(fx, 'settle')[0]?.result === 'moved' && !viewOf(s).err },
  { row: 'the box rewritten by a door mid-run (no event): the next event drops the owed commit, its pending words go', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'fired', which: 'reask', cur: B }]], check: ({ s, fx }) => !s.owed && does(fx, 'ask').length === 0 && !viewOf(s, { cur: B }).err && viewOf(s, { cur: B }).kind === 'quiet' },
  { row: 'B-225c: a press after a door rewrote the box under an OWED commit: the OLD press answered «moved» (nothing), the new one owed with its own door', start: A, evs: [[{ type: 'commit', door: 1 }], [{ type: 'commit', cur: B, door: 2 }]], check: ({ s, fx }) => does(fx, 'settle').some((e) => e.result === 'moved' && e.doors.join() === '1') && s.owed?.key === B && s.owed.doors.join() === '2' && does(fx, 'ask')[0]?.key === B },
  { row: 'B-225c: a second press on the SAME text while the first is owed JOINS it — the complete reply answers BOTH with one commit', start: A, evs: [[{ type: 'commit', door: 1 }], [{ type: 'commit', door: 2 }], [{ type: 'reply', key: A, kind: 'listing' }, { tick: true }]], check: ({ s, fx }) => does(fx, 'commit').length === 1 && does(fx, 'commit')[0].doors.join() === '1,2' && !s.owed },
  { row: 'B-225c: a set WITHOUT commit to another text while a press is owed answers that press «moved» (never left hanging)', start: A, evs: [[{ type: 'commit', door: 1 }], [{ type: 'set', cur: B }]], check: ({ s, fx }) => does(fx, 'settle').some((e) => e.result === 'moved' && e.doors.join() === '1') && !s.owed },
  { row: 'commit on a text the listing shows: committed at once (ok), nothing asked', start: A, evs: [[{ type: 'commit' }, { rank: 'resolved' }]], check: ({ fx }) => does(fx, 'commit')[0]?.as === 'ok' && does(fx, 'ask').length === 0 },
  { row: 'commit on a text not answered: OWED, asked at once (forced)', start: A, evs: [[{ type: 'commit', how: 'blur' }]], check: ({ s, fx }) => s.owed?.key === A && does(fx, 'ask').length === 1 && viewOf(s).kind === 'pending' },
  { row: 'owed + its complete reply + the tick: served ONCE as a create', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'listing' }, { tick: true }]], check: ({ s, fx }) => does(fx, 'commit').length === 1 && does(fx, 'commit')[0].as === 'create' && !s.owed },
  { row: 'owed + its complete reply, no tick: refused — «未生效：… tick …» (V1), the create row offered', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'listing' }]], check: ({ s, fx }) => does(fx, 'commit').length === 0 && s.err?.why === 'tick' && viewOf(s).status === 'unresolved' && viewOf(s).tick },
  { row: 'owed + a partial reply: still owed — «未生效：正在问这台机器…» (V1), its door hears «nothing yet»', start: A, evs: [[{ type: 'commit', door: 1 }], [{ type: 'reply', key: A, kind: 'partial' }]], check: ({ s, fx }) => s.owed?.key === A && s.err?.kind === 'pending' && does(fx, 'settle')[0]?.result === 'owed' && does(fx, 'settle')[0]?.doors.join() === '1' },
  { row: 'owed + the run STOPS: dropped — «未生效：这台机器没有回答» (V1), its door settled', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'fired', which: 'reask' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'fired', which: 'reask' }], [{ type: 'reply', key: A, kind: 'partial' }]], check: ({ s, fx }) => !s.owed && s.err?.kind === 'unanswered' && s.errRun === A && does(fx, 'settle')[0]?.result === 'dropped' },
  { row: 'owed + a plain FAILURE: dropped with the run\'s words (its error)', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'fired', which: 'reask' }], [{ type: 'reply', key: A, kind: 'failed', err: 'gone' }]], check: ({ s }) => !s.owed && s.err?.kind === 'unanswered' && s.err.err === 'gone' },
  { row: 'after the run ended unanswered, a later COMPLETE reply repaints only: the words go, nothing committed', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'failed' }], [{ type: 'opened' }], [{ type: 'reply', key: A, kind: 'listing' }]], check: ({ s, fx }) => !s.err && does(fx, 'commit').length === 0 && viewOf(s).kind === 'missing' },
  { row: 'the machine changed while a commit was owed: the old run ends (moved) — never served on the other machine', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'partial' }], [{ type: 'refresh', cur: AM }], [{ type: 'fired', which: 'soon' }], [{ type: 'reply', key: AM, kind: 'listing' }, { tick: true }]], check: ({ s, fx }) => !s.owed && does(fx, 'commit').length === 0 && !s.err },
  { row: 'refresh, closed, a complete answer: nothing asked, the answer stands (stale)', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'listing' }], [{ type: 'refresh' }]], check: ({ s, fx }) => does(fx, 'ask').length + does(fx, 'arm').length === 0 && s.answer.stale && viewOf(s).kind === 'missing' },
  { row: 'refresh on a field never asked (A1): nothing asked, quiet', start: A, evs: [[{ type: 'refresh' }]], check: ({ s, fx }) => does(fx, 'ask').length + does(fx, 'arm').length === 0 && viewOf(s).kind === 'quiet' },
  { row: 'refresh after a machine change (asked before): asked again, debounced', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'listing' }], [{ type: 'refresh', cur: AM }]], check: ({ s, fx }) => does(fx, 'arm')[0]?.which === 'soon' && s.soon === AM },
  { row: 'refresh with an ask for the text OUT: nothing restarted', start: A, evs: [[{ type: 'set' }], [{ type: 'refresh' }]], check: ({ fx }) => does(fx, 'ask').length + does(fx, 'arm').length === 0 },
  { row: 'refresh within REFRESH_AFTER_STOP_MS of a stop: nothing; after it: asked', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'failed', now: 1000 }], [{ type: 'refresh', now: 1000 + P.REFRESH_AFTER_STOP_MS - 1 }]], check: ({ s, fx }) => does(fx, 'arm').length === 0 && P.step(s, { type: 'refresh', cur: A, now: 1000 + P.REFRESH_AFTER_STOP_MS, env: envOf(A), open: false }).effects.some((e) => e.do === 'arm') },
  { row: 'refresh with the list OPEN: asked at once', start: A, evs: [[{ type: 'opened' }], [{ type: 'reply', key: A, kind: 'listing' }], [{ type: 'refresh', now: 5000 }]], check: ({ fx }) => does(fx, 'ask').length === 1 },
  { row: 'opened over a fresh complete answer (< 2 s): no ask; over a failure: asked', start: A, evs: [[{ type: 'set' }], [{ type: 'reply', key: A, kind: 'listing', now: 100 }], [{ type: 'opened', now: 500 }]], check: ({ s, fx }) => does(fx, 'ask').length === 0 && P.step({ ...s, answer: { ...s.answer, kind: 'failed' } }, { type: 'opened', cur: A, now: 600, env: envOf(A) }).effects.some((e) => e.do === 'ask') },
  { row: 'the picker closed WITHOUT a pick, the text unanswered: asked (debounced); with a pick: nothing', start: A, evs: [[{ type: 'pickerClosed', picked: false }]], check: ({ s, fx }) => does(fx, 'arm')[0]?.which === 'soon' && P.step(P.init(A), { type: 'pickerClosed', picked: true, cur: A, env: envOf(A) }).effects.length === 0 },
  { row: 'destroyed: every timer disarmed, the ask aborted; after it no effect at all', start: A, evs: [[{ type: 'typed' }], [{ type: 'destroyed' }]], check: ({ s, fx }) => does(fx, 'disarm')[0]?.which === 'all' && does(fx, 'abort').length === 1 && ['typed', 'set', 'commit', 'refresh', 'opened', 'fired', 'reply'].every((type) => P.step(s, { type, which: 'soon', key: A, kind: 'listing', cur: A, env: envOf(A) }).effects.length === 0) },
  { row: 'the create at use failed: «未生效：» with its words (V1)', start: A, evs: [[{ type: 'ensureFailed', words: 'EACCES' }]], check: ({ s }) => viewOf(s).status === 'unresolved' && s.err.why === 'ensure' && s.err.words === 'EACCES' },
  { row: 'commit on a text that is no path (a search): asked, then refused «not a path»', start: X, evs: [[{ type: 'commit' }, { rank: 'search' }], [{ type: 'reply', key: X, kind: 'listing' }, { rank: 'search' }]], check: ({ s }) => s.err?.why === 'notpath' && !s.owed },
  { row: 'commit on an empty box: committed as empty, nothing asked', start: E, evs: [[{ type: 'commit' }, { rank: 'empty' }]], check: ({ fx }) => does(fx, 'commit')[0]?.as === 'empty' && does(fx, 'ask').length === 0 },
  { row: 'a commit\'s pending words, the box rewritten since: not shown (the old run\'s)', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'partial' }]], check: ({ s }) => !viewOf(s, { cur: B }).err && viewOf(s).err?.kind === 'pending' },
];
console.log('── ① THE TABLE (each row a direct leg) ──');
for (const r of ROWS) { let got; try { got = drive(P, r.start, r.evs); } catch (e) { got = { error: String(e && e.stack || e).slice(0, 300) }; } let pass = false; try { pass = !got.error && !!r.check(got); } catch (e) { got.thrown = String(e).slice(0, 200); } ok(`① ${r.row}`, pass, got.error || got.thrown || { state: got.s, effects: got.fx }); }

/* B-d833, the fourth shape (the model's part): a skipped reply (a dead entrance's mark) is no answer — not counted in the run, its line
   says when it is asked again, and ONE ask is armed for that time; L6 READ AT THE PRESS — an OWED press is served only by a LITERAL
   resolution, a completion ends it with true words and a second press (the line now shows it) uses it; the key holds the BASES */
{
  const KB = (t, b) => P.keyOf(t, null, b);
  ok('① keyOf: the same text on the same machine with OTHER bases is another key (a change of bases is a new question); textOf reads the text back', KB('./x', '["~/a"]') !== KB('./x', '["~/b"]') && P.textOf(KB('./x', '["~/a"]')) === './x' && P.textOf(K('~/a')) === '~/a');
  const env = envOf(A);
  let st = P.init(A); st = P.step(st, { type: 'set', commit: false, cur: A, now: 1, env }).state;
  const r1 = P.step(st, { type: 'reply', key: A, kind: 'skipped', until: 30001, now: 2, env, verdict: { kind: 'skipped', until: 30001 } });
  ok('① a skipped reply: NOT counted in the run, ONE ask armed for when the mark ends, the line says «skipped» with that time', r1.state.run.n === 0 && r1.effects.some((e) => e.do === 'arm' && e.which === 'retry' && e.ms === 29999) && P.view(r1.state, env).status === 'skipped' && P.view(r1.state, env).until === 30001, r1.effects);
  const r2 = P.step(r1.state, { type: 'fired', which: 'retry', connected: true, cur: A, now: 30001, env });
  ok('① …the armed time comes: asked ONCE (a new run)', r2.effects.filter((e) => e.do === 'ask').length === 1, r2.effects);
  let s3 = P.init(A); s3 = P.step(s3, { type: 'commit', door: 1, how: 'enter', cur: A, now: 1, env: envOf(A) }).state;
  const owedAsk = P.step(P.init(A), { type: 'commit', door: 1, how: 'enter', cur: A, now: 1, env: envOf(A) }).effects.find((e) => e.do === 'ask');
  ok('① a press asks with `press` (R-i: the machine sends a dead entrance\'s call once inside its window for it)', !!owedAsk && owedAsk.press === true, owedAsk);
  const comp = P.step(s3, { type: 'reply', key: A, kind: 'listing', now: 2, env: envOf(A, { rank: 'completion' }) });
  ok('① L6 at the press: an OWED press served by a COMPLETION is refused with true words (the path it would take named) — nothing committed', comp.effects.some((e) => e.do === 'settle' && e.result === 'refused' && (e.doors || []).includes(1)) && !comp.effects.some((e) => e.do === 'commit') && comp.state.err && comp.state.err.why === 'literal' && comp.state.err.path === '~/payments', comp.effects);
  const again = P.step(comp.state, { type: 'commit', door: 2, how: 'enter', cur: A, now: 3, env: envOf(A, { rank: 'completion' }) });
  ok('① …a SECOND press, the line now showing it: committed', again.effects.some((e) => e.do === 'commit' && e.as === 'ok' && (e.doors || []).includes(2)), again.effects);
  const lit = P.step(s3, { type: 'reply', key: A, kind: 'listing', now: 2, env: envOf(A, { rank: 'resolved' }) });
  ok('① …an owed press served by a LITERAL resolution (the text\'s own first candidate): committed at once', lit.effects.some((e) => e.do === 'commit' && e.as === 'ok' && (e.doors || []).includes(1)), lit.effects);
  let G0 = null; try { G0 = load(anchored(SRC, "        if (g === 'ok' && !rk.literal) {", "        if (false) {", 'L6 read at the commit')); } catch (e) { G0 = null; }
  const c0 = G0 && G0.step(G0.step(G0.init(A), { type: 'commit', door: 1, how: 'enter', cur: A, now: 1, env: envOf(A) }).state, { type: 'reply', key: A, kind: 'listing', now: 2, env: envOf(A, { rank: 'completion' }) });
  ok('① RED CONTROL: L6 read at the commit — the owed press COMMITS the completion the line never showed', !!c0 && c0.effects.some((e) => e.do === 'commit' && e.as === 'ok'), c0 && c0.effects);
  // (the fresh read's N1) an owed press ended by a FAILED stat says the machine ANSWERED, with its error (L5) — never «did not answer».
  // CONTROL: the plain end (the «did not answer» words)
  const failedEnd = (M2) => M2.step(M2.step(M2.init(A), { type: 'commit', door: 1, how: 'enter', cur: A, now: 1, env: envOf(A) }).state, { type: 'reply', key: A, kind: 'failed', err: 'ELOOP: too many symbolic links', now: 2, env: envOf(A), verdict: { kind: 'failed', err: 'ELOOP: too many symbolic links' } }).state.err;
  let G1 = null; try { G1 = load(anchored(SRC, " if (ev.verdict && ev.verdict.kind === 'failed') s.err = { kind: 'failed', err: String(ev.verdict.err || '') };", '', 'the failed end said as unanswered')); } catch (e) { G1 = null; }
  const fe = failedEnd(P), feC = G1 && failedEnd(G1);
  ok('① an owed press ended by a FAILED stat: the error is the machine\'s ANSWER (kind failed, its words) — CONTROL the plain end: «did not answer»', !!fe && fe.kind === 'failed' && /ELOOP/.test(fe.err) && !!feC && feC.kind === 'unanswered', { real: fe, control: feC });
  // (the read of the fourth shape, should 4 — M1's law BY BEHAVIOUR) an owed press (a pick) whose env was built BEFORE the reply (no verdict
  // then in hand: «missing») is judged on the verdict the reply carries — EXISTS ⇒ committed. CONTROL: the model reading the env alone
  const staleEnv = { cur: A, rank: { empty: false, resolved: false, missing: { path: P.textOf(A) }, pathLike: true }, homeKnown: true, unreachable: false, tick: false, createMode: 'ask', folder: true };
  const pickOn = (M2) => M2.step(M2.step(M2.init(A), { type: 'commit', door: 1, how: 'pick', cur: A, now: 1, env: staleEnv }).state, { type: 'reply', key: A, kind: 'listing', now: 2, env: staleEnv, verdict: { kind: 'exists', path: P.textOf(A), literal: true } }).effects;
  let G2 = null; try { G2 = load(anchored(SRC, "        const env2 = ev.verdict ? { ...(ev.env || {}), rank: rankAt(ev.env, ev.verdict) } : (ev.env || {});", '        const env2 = ev.env || {};', 'the env alone at a reply')); } catch (e) { G2 = null; }
  const pk = pickOn(P), pkC = G2 && pickOn(G2);
  ok('① an owed PICK whose env predates the reply: the reply\'s EXISTS verdict commits it (the one resolver in the model) — CONTROL the env alone: refused, nothing committed', pk.some((e) => e.do === 'commit' && e.as === 'ok' && (e.doors || []).includes(1)) && !!pkC && !pkC.some((e) => e.do === 'commit' && e.as === 'ok'), { real: pk, control: pkC });
  // (the box pre-runs r140/r142, the coordinator's r146) A BASES-ONLY MOVE IS A NEW QUESTION — ASKED at once, an owed press CARRIED (still
  // served only by a literal resolution), and BOUNDED: it joins the run's count, then ends by name
  const KB0 = P.keyOf('~/x', null, '["/h/g","~"]'), KB1 = P.keyOf('~/x', null, '["~/g","~"]');
  const envB = (k, rank = { empty: false, resolved: false, missing: { path: '~/x' }, pathLike: true }) => ({ cur: k, rank, homeKnown: true, unreachable: false, tick: false, createMode: 'ask', folder: true });
  const owedOn = (M2) => M2.step(M2.init(KB0), { type: 'commit', door: 1, how: 'pick', cur: KB0, now: 1, env: envB(KB0) }).state;
  const moved = (M2, v2 = { kind: 'exists', path: '~/x', literal: true }) => { const a = M2.step(owedOn(M2), { type: 'reply', key: KB0, kind: 'listing', now: 2, cur: KB1, env: envB(KB1), verdict: v2 }); const b = M2.step(a.state, { type: 'reply', key: KB1, kind: 'listing', now: 3, cur: KB1, env: envB(KB1), verdict: v2 }); return { asks: a.effects.filter((e) => e.do === 'ask'), dropped: a.effects.some((e) => e.do === 'settle' && e.result === 'moved'), committed: b.effects.some((e) => e.do === 'commit' && e.as === 'ok' && (e.doors || []).includes(1)), refused: b.effects.some((e) => e.do === 'settle' && e.result === 'refused'), why: b.state.err && b.state.err.why }; };
  let G3 = null; try { G3 = load(anchored(SRC, '    if (sameAsk(s.key, was)) {', '    if (false) {', 'the old drop on a bases-only move')); } catch (e) { G3 = null; }
  const m1 = moved(P), m1c = G3 && moved(G3);
  ok('① a bases-only move (the reply landed under the OLD spelling): ONE ask at once for the new spelling, the owed press CARRIED with it (press), committed by that ask\'s reply — CONTROL the old drop: the press dropped «moved», nothing committed, no ask', m1.asks.length === 1 && m1.asks[0].key === KB1 && m1.asks[0].press === true && !m1.dropped && m1.committed && !!m1c && m1c.dropped && !m1c.committed && m1c.asks.length === 0, { real: m1, control: m1c });
  const l6 = moved(P, { kind: 'exists', path: '~/xy', completed: true, literal: false });
  ok('① …a CARRIED press is still served only by a LITERAL resolution (L6): the moved question answered by a completion ⇒ refused (why literal), nothing committed', l6.refused && !l6.committed && l6.why === 'literal', l6);
  const every = (M2, n = 12) => { const Kn = (i) => P.keyOf('~/x', null, `["b${i}"]`); let st = M2.step(M2.init(Kn(0)), { type: 'commit', door: 1, how: 'pick', cur: Kn(0), now: 1, env: envB(Kn(0)) }).state, asks = 1; for (let i = 1; i <= n; i++) { const r = M2.step(st, { type: 'reply', key: Kn(i - 1), kind: 'listing', now: 1 + i, cur: Kn(i), env: envB(Kn(i)), verdict: { kind: 'exists', path: '~/x', literal: true } }); st = r.state; const a = r.effects.filter((e) => e.do === 'ask').length; asks += a; if (!a) break; } return { asks, end: st.answer && st.answer.err, owed: !!st.owed, words: st.err && st.err.err, view: M2.view(st, envB(Kn(n))).status }; };
  let G4 = null; try { G4 = load(anchored(SRC, '    if (s.run.n < PARTIAL_REPLIES) ask(', '    if (true) ask(', 'no bound on a rebase')); } catch (e) { G4 = null; }
  const ev1 = every(P), ev1c = G4 && every(G4);
  ok(`① EVERY reply moving the bases (the mutant world) ENDS by name inside the bound: ${ev1.asks} asks (PARTIAL_REPLIES ${P.PARTIAL_REPLIES}), the run «${ev1.end}», the press dropped with those words — CONTROL no bound: ${ev1c && ev1c.asks} asks in 12 replies, never ending`, ev1.asks === P.PARTIAL_REPLIES && ev1.end === P.UNSETTLED && !ev1.owed && ev1.words === P.UNSETTLED && !!ev1c && ev1c.asks > P.PARTIAL_REPLIES + 3, { ev1, ev1c });
  const fix = (() => { let st = owedOn(P); let r = P.step(st, { type: 'reply', key: KB0, kind: 'listing', now: 2, cur: KB1, env: envB(KB1), verdict: { kind: 'exists', path: '~/x', literal: true } }); const a1 = r.effects.filter((e) => e.do === 'ask').length; r = P.step(r.state, { type: 'reply', key: KB1, kind: 'listing', now: 3, cur: KB1, env: envB(KB1), verdict: { kind: 'exists', path: '~/x', literal: true } }); return { a1, a2: r.effects.filter((e) => e.do === 'ask').length, committed: r.effects.some((e) => e.do === 'commit') }; })();
  ok('① THE FIXPOINT: once the spelling is known, a reply no longer moves the key — one rebase ask, then the reply under the same spelling is JUDGED (no further ask)', fix.a1 === 1 && fix.a2 === 0 && fix.committed, fix);
  // (the lane's heavy run at aa84c835c, ⑩: my-mac's reply TAKEN, its home in the world, the open list never redrawn) a key that moves
  // on an EMPTY text (the list open on a paired machine, nothing to judge — no rebase, sameAsk is false there) is REDRAWN — painted,
  // nothing asked. CONTROL: the paint only with the rebase's ask (the shape before): nothing painted, the rows keep the old spelling
  const KE0 = P.keyOf('', 'h-mac', '["/Users/u/g","~"]'), KE1 = P.keyOf('', 'h-mac', '["~/g","~"]');
  const emptyMove = (M2) => { const r = M2.step(M2.init(KE0), { type: 'reply', key: KE0, kind: 'listing', now: 2, cur: KE1, env: envB(KE1, { empty: true, resolved: false, missing: null, pathLike: false }) }); return { paint: r.effects.some((e) => e.do === 'paint'), asks: r.effects.filter((e) => e.do === 'ask').length, key: r.state.key === KE1 }; };
  let G5 = null; try { G5 = load(anchored(SRC, "  if (moved && !s.destroyed) fx.push({ do: 'paint' });\n", '', 'the paint only with the rebase ask')); } catch (e) { G5 = null; }
  const em = emptyMove(P), emc = G5 && emptyMove(G5);
  ok('① a bases-only move on an EMPTY text (the list open on a paired machine, its home just landed) is REDRAWN — painted, nothing asked — CONTROL the paint only with the rebase ask: nothing painted', P.textOf(KE1) === '' && !P.sameAsk(KE0, KE1) && em.paint && em.asks === 0 && em.key && !!emc && !emc.paint, { real: em, control: emc });
}

/* ═══ ② THE LAW, SEEDED ═══ */
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TEXTS = ['~/a', '~/b', '~/new', 'x', ''];
const EXISTS = { '~/a': true, '~/b': true, '~/new': false };
const MACHINES = [null, 'h-mac'];
const STARTERS = new Set(['typed', 'set', 'commit', 'fired', 'refresh', 'opened']);
const EMITTED = new Set();   // every event type the seeded driver sent (the census below reads it)
function lawRun(G, seed, steps = 60) {
  const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)];
  const listed = new Set(), homeKnown = { null: R() < 0.7, 'h-mac': R() < 0.7 }, unreachable = { null: false, 'h-mac': R() < 0.1 }, isFile = R() < 0.3;   // the alphabet: an unreachable machine, a file where a folder is asked
  const d = { text: pick(TEXTS), h: null, b: '', open: false, tick: false, createMode: R() < 0.2 ? 'never' : 'ask', destroyed: false, touched: false, now: 0 };
  const KB = (t, h, b) => G.keyOf(t, h, b);   // the key with its BASES (B-d833: their spelling can move under the same text)
  let s = G.init(KB(d.text, d.h, d.b));
  let net = null, owedRec = null, runReasks = 0, doorSeq = 0;
  const pending = new Map();   // door → the key its press was for (the page's waiting presses)
  const seq = [], why = [];
  const env = () => {
    const cur = KB(d.text, d.h, d.b);
    const rank = !d.text ? 'empty' : !/^[~/.]/.test(d.text) && !d.text.includes('/') ? 'search' : EXISTS[d.text] && listed.has(cur) ? 'resolved' : 'missing';
    return envOf(cur, { rank, homeKnown: homeKnown[d.h], tick: d.tick, createMode: d.createMode, file: isFile && d.text === '~/new', unreachable: unreachable[d.h] });
  };
  for (let i = 0; i < steps; i++) {
    d.now += Math.floor(R() * 4000);
    const roll = R();
    let ev = null;
    if (d.destroyed && R() < 0.5) ev = { type: pick(['typed', 'set', 'commit', 'refresh', 'opened', 'fired', 'reply']), which: 'soon', key: KB(d.text, d.h, d.b), kind: 'listing' };
    else if (roll < 0.14) { d.text = pick(TEXTS); d.touched = true; ev = { type: 'typed', soon: R() < 0.8 }; }
    else if (roll < 0.22) { d.text = pick(TEXTS); d.touched = true; ev = { type: 'set', commit: R() < 0.4, how: 'set' }; if (ev.commit && !d.destroyed) ev.door = ++doorSeq; }
    else if (roll < 0.32) { d.touched = true; ev = { type: 'commit', how: pick(['blur', 'enter', 'api']) }; if (!d.destroyed) ev.door = ++doorSeq; }
    else if (roll < 0.52 && net) { const k = pick(['listing', 'partial', 'partial', 'failed']); if (k === 'listing') { listed.add(net.key); homeKnown[net.key.split('\n')[1] || null] = true;   /* (the machine is the key's SECOND part — the bases may follow it) */ } ev = { type: 'reply', key: net.key, kind: k, err: k === 'failed' ? 'boom' : '' }; net = null; }
    else if (roll < 0.62 && (s.soon || s.reask)) ev = { type: 'fired', which: s.reask && (!s.soon || R() < 0.5) ? 'reask' : 'soon', connected: R() < 0.9 };
    else if (roll < 0.70) ev = { type: 'refresh' };
    else if (roll < 0.75) { d.open = R() < 0.5; if (d.open) d.touched = true; ev = { type: d.open ? 'opened' : 'closed' }; }
    else if (roll < 0.80) { d.h = d.h ? null : 'h-mac'; if (R() < 0.5) ev = { type: 'refresh' }; }   // the machine changed (with or without the door's refresh)
    else if (roll < 0.83) { d.text = pick(TEXTS); }   // a door rewrote the box: no event
    else if (roll < 0.85) { d.b = d.b ? '' : '["~/g"]'; if (R() < 0.6) ev = { type: 'rekey' }; }   // B-d833: only the BASES moved (a reply re-spelled them) — said by the page's «rekey», or by the next event
    else if (roll < 0.89) { const picked = R() < 0.5; if (!picked) d.touched = true; ev = { type: 'pickerClosed', picked }; }
    else if (roll < 0.94) d.tick = !d.tick;
    else if (roll < 0.96) ev = { type: 'ensureFailed', words: 'EACCES' };
    else if (roll < 0.975 && !d.destroyed) { d.destroyed = true; ev = { type: 'destroyed' }; }
    if (!ev) continue;
    const e0 = env(), before = s, owedBefore = s.owed;
    EMITTED.add(ev.type);
    if (ev.door != null) pending.set(ev.door, e0.cur);
    const r = G.step(s, { ...ev, cur: e0.cur, now: d.now, env: e0 });
    s = r.state;
    seq.push(`${ev.type}${ev.kind ? ':' + ev.kind : ''}${ev.which ? ':' + ev.which : ''}@${JSON.stringify(e0.cur)}`);
    const e1 = env(), v = G.view(s, e1);
    const fail = (w) => { why.push(`step ${i} (${seq[seq.length - 1]}): ${w}`); };
    // I6 — after destroyed, nothing
    if (before.destroyed && r.effects.length) fail('I6 an effect after «destroyed»');
    // I1 — LAW 1
    if ((v.kind === 'missing' || v.tick) && !(s.answer && s.answer.key === e1.cur && s.answer.kind === 'complete' && e1.homeKnown)) fail('I1 «missing» / a create tick before a complete answer for the text');
    // I2 — the pending words true
    if (v.kind === 'pending' && !(s.out === e1.cur || s.soon === e1.cur || s.reask === e1.cur)) fail('I2 the pending words with no ask out or due');
    // I2b (the coordinator's r146, law 3) — NO «ASKING» WITHOUT AN ASK OUT: an owed press's «Asking the machine…» words (shown while the
    // field has not moved) stand only while an ask for that key is out or armed
    if (v.status === 'unresolved' && v.err && v.err.kind === 'pending' && e1.cur === s.key && !(s.out === s.key || s.soon === s.key || s.reask === s.key || s.retry === s.key)) fail('I2b the owed press\'s asking words with no ask out or due');
    if (v.err && v.err.kind === 'pending' && !(s.owed && s.owed.key === e1.cur)) fail('I2 «未生效：正在问这台机器…» with no commit owed');
    // I3 / I4 — commits
    for (const c of r.effects.filter((x) => x.do === 'commit')) {
      if (c.as === 'ok' && !e1.rank.resolved) fail('I3 committed «ok» for a text the listing does not show');
      if (c.as === 'create' && !(s.answer && s.answer.key === e1.cur && s.answer.kind === 'complete' && e1.homeKnown && e1.tick)) fail('I3 committed a create without a complete answer, the home and the tick');
      if (ev.type !== 'commit' && ev.type !== 'set') {   // a serve
        if (!owedRec || !owedBefore || ev.type !== 'reply' || ev.key !== owedRec.key || owedRec.key !== e0.cur) fail('I4 an owed commit served by something other than a reply for its own text on its own machine');
        else if (++owedRec.served > 1) fail('I4 an owed commit served twice');
      }
    }
    if (s.owed && s.owed !== owedBefore && (!owedBefore || owedBefore.key !== s.owed.key || ev.type === 'commit' || ev.type === 'set')) owedRec = { key: s.owed.key, served: 0 };
    // I4, RUN-AWARE (an owed commit ENDS WHEN ITS RUN ENDS): a reply that ended its run — a failure, or the bound's stop — leaves no owed
    // commit for that text on that machine alive
    if (ev.type === 'reply' && s.answer && s.answer.key === ev.key && (s.answer.kind === 'failed' || s.answer.kind === 'gaveUp') && s.owed && s.owed.key === ev.key) fail('I4 an owed commit alive after its run ended (a failure or the stop)');
    // I5 — the bound; no ask without a starting event
    for (const a of r.effects.filter((x) => x.do === 'ask')) {
      if (!STARTERS.has(ev.type) && !(G.sameAsk && G.sameAsk(e0.cur, before.key) && e0.cur !== before.key)) fail(`I5 an ask on «${ev.type}», an event that starts none (and no rebase)`);
      if (a.reask) { if (++runReasks > P.PARTIAL_REPLIES - 1) fail('I5 more partial replies than PARTIAL_REPLIES in one run'); } else runReasks = 0;
      net = { key: a.key };
      // I7 — A1
      if (!d.touched) fail('I7 a field built over a saved text, never touched, asked');
    }
    // I9 — THE DOORS (B-225c): each press answered once, by its own outcome; none hanging
    for (const x of r.effects.filter((y) => y.do === 'commit' || y.do === 'settle')) {
      for (const dd of x.doors || []) {
        if (!pending.has(dd)) { fail('I9 a press answered twice (or a door nobody pressed)'); continue; }
        const k = pending.get(dd);
        if (x.do === 'commit' && x.key !== k && !(G.sameAsk && G.sameAsk(x.key, k))) fail('I9 a press answered by a commit for another text or machine');   // (the same text and machine under re-spelled bases is the SAME question carried — r146 law 1)
        if (x.do === 'settle' && x.result === 'moved' && ev.type !== 'destroyed' && !(ev.type === 'fired' && ev.connected === false) && (k === e0.cur || (G.sameAsk && G.sameAsk(k, e0.cur)))) fail('I9 a press on the CURRENT text and machine dropped (it should have joined the owed commit)');
        pending.delete(dd);
      }
    }
    for (const [dd] of pending) if (!(s.owed && (s.owed.doors || []).includes(dd))) { fail('I9 a press left hanging (no owed commit holds its door)'); break; }
    // I8 — the words are a function of the state
    if (JSON.stringify(G.view(JSON.parse(JSON.stringify(s)), e1)) !== JSON.stringify(v)) fail('I8 the view of a copy of the state differs');
    if (why.length) break;
  }
  return { ok: !why.length, why, seq };
}
const SEEDS = 300, SEED0 = 4242;
if (process.env.PFM_SEED_ONLY) {
  const r = lawRun(P, Number(process.env.PFM_SEED_ONLY));
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.ok ? 0 : 1);
}
console.log('\n── ② THE LAW, SEEDED ──');
{
  const t0 = Date.now(), reds = [];
  for (let k = 0; k < SEEDS; k++) { const seed = SEED0 + k * 7919; const r = lawRun(P, seed); if (!r.ok) reds.push({ seed, ...r }); }
  ok(`② THE LAW over ${SEEDS} seeds × 60 steps: I1–I9 hold after every step`, reds.length === 0, reds.slice(0, 2).map((r) => ({ seed: r.seed, why: r.why, seq: r.seq.join(' ') })));
  for (const r of reds.slice(0, 3)) console.log(`      red: PFM_SEED_ONLY=${r.seed} — ${r.why.join('; ')}`);
  console.log(`      (the law: ${SEEDS} seeds in ${Date.now() - t0} ms)`);
}
/* RED CONTROLS: each invariant's rule removed in a copy of the model (anchored edits of the shipped source); the same driver must find
   a seed that breaks exactly that invariant, within three times the law's seeds */
const CONTROLS = [
  ['I1', '«missing» on any answer, complete or not', [["listed: mine && a.kind === 'complete'", 'listed: mine']]],
  ['I2', 'the pending words with nothing asked (the third commit\'s gate)', [["return sought ? 'pending' : 'quiet';", "return 'pending';"]]],
  ['I2', '«未生效：正在问…» left standing when the run moves on', [["  else if (s.err && s.err.kind === 'pending') s.err = null;\n", '']]],
  ['I3', 'a create committed on a partial reply', [["else if (run === 'reask') { if (s.owed.doors.length) { fx.push({ do: 'settle', result: 'owed', doors: s.owed.doors }); s.owed = { ...s.owed, doors: [] }; } s.err = { kind: 'pending' }; }", "else if (run === 'reask') { s.owed = null; fx.push({ do: 'commit', how: 'x', as: 'create' }); }"]]],
  ['I4', 'an owed commit served on whatever text or machine answers (the fourth commit\'s)', [[/      if \(s\.owed && s\.owed\.key !== s\.key\) drop\(s, fx, false\);[^\n]*\n      if \(s\.errRun/, '      if (s.errRun'], ["    if (s.owed && s.owed.key !== s.key) drop(s, fx, false);\n  }\n  disarm(s, fx, 'soon');", "  }\n  disarm(s, fx, 'soon');"], ['      if (s.owed && s.owed.key === s.key) {\n        const env2', '      if (s.owed) {\n        const env2']]],
  ['I4', 'an owed commit kept past a run that ended unanswered (the ruling\'s drop removed)', [["        else { drop(s, fx, true, s.answer.err); if (ev.verdict && ev.verdict.kind === 'failed')", "        else { if (false && ev.verdict && ev.verdict.kind === 'failed')"]]],
  ['I5', 'the partial reply asked again for ever (the old loop)', [["run = s.run.n < PARTIAL_REPLIES ? 'reask' : 'stop';", "run = 'reask';"]]],
  ['I6', 'effects after «destroyed»', [['if (!s0 || s0.destroyed) return { state: s0, effects: [] };', 'if (!s0) return { state: s0, effects: [] };']]],
  ['I7', 'a closed refresh asks a field never asked (A1 broken)', [['if (!outOrDue && text && s.everAsked && (', 'if (!outOrDue && text && (']]],
  ['I9', 'a set that drops an owed commit silently (B-225c\'s first cure: its presses left hanging)', [["    case 'set':\n", "    case 'set':\n      if (s.owed) { s.owed = null; }\n"]]],
  ['I9', 'a press on the same text that does not JOIN the owed commit (the older press dropped)', [['  const doors = [...((s.owed && s.owed.key === s.key && s.owed.doors) || []), ...(ev.door != null ? [ev.door] : [])];\n  s.owed = null;\n', '  if (s.owed) drop(s, fx, false);\n  const doors = [...(ev.door != null ? [ev.door] : [])];\n']]],
  ['I2b', 'a rebase that asks nothing (an owed press keeps «Asking the machine…» with no ask out — the box pre-runs\' fault)', [['    if (s.run.n < PARTIAL_REPLIES) ask(s, fx, now, { force: true, reask: true, press: !!s.owed });', '    if (false) ask(s, fx, now);'], ['    else { s.answer = { key: s.key, at: now, kind: \'gaveUp\', err: UNSETTLED', '    if (false) { s.answer = { key: s.key, at: now, kind: \'gaveUp\', err: UNSETTLED']]],
  ['I8', 'the view reads something besides the state', [["return { ...base, status: g === 'quiet' ? 'pending' : g };", "return { ...base, status: g === 'quiet' ? 'pending' : g, seen: Math.random() };"]]],
];
for (const [inv, what, edits] of CONTROLS) {
  let G = null, err = '';
  try { G = load(edits.reduce((src, [from, to]) => anchored(src, from, to, `${inv} control`), SRC)); } catch (e) { err = String(e.message || e).slice(0, 300); }
  if (!G) { ok(`② RED CONTROL ${inv} (${what}): its anchors are in the model`, false, err); continue; }
  let found = null;
  for (let k = 0; k < SEEDS * 3 && !found; k++) { const seed = SEED0 + k * 7919; const r = lawRun(G, seed); if (!r.ok && r.why.some((w) => w.includes(inv + ' '))) found = { seed, tried: k + 1, why: r.why[0] }; }
  ok(`② RED CONTROL ${inv} — ${what}: the driver finds it${found ? ` (seed ${found.seed}, ${found.tried} seeds)` : ''}`, !!found, found || 'not found');
}

/* ═══ ②b THE EVENT CENSUS (the coordinator's MUST 1 on 9daebd507: the page never sent «closed», so the model held the list open for
   good — a verdict input held outside the model): every event type the model HANDLES is FIRED by the wiring at a named site, every type
   the wiring fires is handled, and the seeded driver EMITS each — read from the two files' own text. RED CONTROL: the wiring's «closed»
   removed ⇒ an event the model handles that nothing fires ═══ */
const WIRE = fs.readFileSync(path.join(REPO, 'src', 'lib', 'path-field.js'), 'utf8');
const census = (modelSrc, wireSrc) => {
  const handled = [...new Set([...modelSrc.matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]))];
  const sites = {};
  for (const m of wireSrc.matchAll(/fire\(\{ type: '([A-Za-z]+)'/g)) (sites[m[1]] = sites[m[1]] || []).push(wireSrc.slice(0, m.index).split('\n').length);
  const fired = Object.keys(sites);
  // every fire( call names its event as a literal (no computed type the census could not read), and the list closes in ONE place: the
  // page's own open flag is written false only inside close(), which fires «closed»
  const calls = (wireSrc.match(/\bfire\(/g) || []).length - (wireSrc.match(/function fire\(/g) || []).length;
  const literal = [...wireSrc.matchAll(/fire\(\{ type: '([A-Za-z]+)'/g)].length;
  const closes = (wireSrc.match(/st\.open = false/g) || []).length, inClose = /function close\(\) \{[^\n]*st\.open = false; fire\(\{ type: 'closed' \}\);/.test(wireSrc);
  return { handled, sites, notFired: handled.filter((t) => !fired.includes(t)), unhandled: fired.filter((t) => !handled.includes(t)), notEmitted: handled.filter((t) => !EMITTED.has(t)), calls, literal, closes, inClose };
};
{
  const c = census(SRC, WIRE);
  console.log('      the wiring\'s sites: ' + Object.entries(c.sites).map(([t, l]) => `${t} @ ${l.join('/')}`).join(' · '));
  ok(`②b every event the model handles (${c.handled.length}: ${c.handled.join(', ')}) is FIRED by src/lib/path-field.js at a named site, every one it fires is handled, and the seeded driver emits each`, c.handled.length >= 11 && !c.notFired.length && !c.unhandled.length && !c.notEmitted.length, c);
  ok(`②b …every fire( call names its event as a literal (${c.literal} of ${c.calls}), and the list closes in ONE place (the page's open flag written false ${c.closes}× — inside close(), which fires «closed»)`, c.calls >= 11 && c.literal === c.calls && c.closes === 1 && c.inClose, { calls: c.calls, literal: c.literal, closes: c.closes, inClose: c.inClose });
  const bypass = census(SRC, anchored(WIRE, '      close(); commit(\'enter\');', '      st.open = false; commit(\'enter\');', 'Enter closing the list itself'));
  ok('②b RED CONTROL: Enter closing the list ITSELF (not through close()) — the census sees a second write of the open flag', bypass.closes === 2, bypass.closes);
  const cut = census(SRC, anchored(WIRE, "fire({ type: 'closed' })", 'void 0', 'the wiring without «closed»'));
  ok('②b RED CONTROL: the wiring without its «closed» — the census names «closed» as handled and fired by nothing', cut.notFired.join() === 'closed', cut.notFired);
}

/* ═══ ②c THE DOORS' WIRING (B-225c's fresh read, its first SHOULD: I9 holds the doors the MODEL names, but the fault lived in the PAGE —
   a settle answered every waiting press with st.committed). Read from the page's own text: every press that makes a door hands it to the
   model in the same statement; a settle answers exactly its doors with «nothing»; a commit answers exactly its doors with the info,
   BEFORE onCommit (an onCommit that destroys the field never turns a taken press into «nothing»); only destroy() answers the doors left;
   a press on a destroyed field makes no door (fire() would never answer it). RED CONTROLS: the old settle (a «moved» press answered with
   the last committed path), commit() handing the model no door, set() without its destroyed guard, onCommit before the answer ═══ */
const bodyOf = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n  function ', i + head.length); return src.slice(i, j < 0 ? undefined : j); };
const doorWiring = (w) => {
  const made = (w.match(/waiters\.set\(door, res\)/g) || []).length;
  const handed = (w.match(/waiters\.set\(door, res\); fire\(\{ type: '(?:commit|set)'[^}\n]*\bdoor \}\)/g) || []).length;
  const calls = [...w.matchAll(/\banswer\(([^;\n]*?)\);/g)].map((m) => m[1]);
  const settle = w.includes("else if (e.do === 'settle') answer(e.doors, null);");
  const cm = bodyOf(w, 'function committed(e) {'), dy = bodyOf(w, 'function destroy() {');
  const order = cm.indexOf('answer(e.doors, info)') >= 0 && cm.indexOf('o.onCommit?.(info)') > cm.indexOf('answer(e.doors, info)');
  const guard = (head) => /^[^\n]*\{\n    if \(st\.destroyed\) return Promise\.resolve\(null\);/.test(bodyOf(w, head));
  const guards = { commit: guard('function commit(how = '), set: guard('function set(text, ') };
  return { made, handed, calls, settle, order, rest: dy.includes('answer([...waiters.keys()], null)'), guards };
};
{
  const d = doorWiring(WIRE);
  const sites = ['e.doors, null', 'e.doors, info', '[...waiters.keys()], null'];
  const good = (x) => x.made >= 2 && x.handed === x.made && x.settle && x.order && x.rest && x.guards.commit && x.guards.set && x.calls.length === 3 && sites.every((a) => x.calls.includes(a));
  ok(`②c every press that makes a door hands it to the model (${d.handed} of ${d.made}); answer( is called at exactly three sites (${d.calls.join(' · ')}): a settle with «nothing», a commit with its info BEFORE onCommit, destroy() with the doors left; commit() and set() make no door on a destroyed field`, good(d), d);
  const reds = [
    ['the old settle — a «moved» press answered with the last committed path', ["else if (e.do === 'settle') answer(e.doors, null);", "else if (e.do === 'settle') answer(e.doors, e.result === 'moved' ? st.committed : null);"]],
    ['commit() hands the model no door (its press would never be answered)', ["fire({ type: 'commit', how, door })", "fire({ type: 'commit', how })"]],
    ['set() without its destroyed guard (a press on a dead field hangs)', ["  function set(text, { commit: c = true, how = 'set', derived = null } = {}) {\n    if (st.destroyed) return Promise.resolve(null);", "  function set(text, { commit: c = true, how = 'set', derived = null } = {}) {"]],
    ['onCommit before the answer (an onCommit that destroys the field turns the taken press into «nothing»)', ["    answer(e.doors, info);", "    if (info) try { o.onCommit?.(info); } catch { }\n    answer(e.doors, info);"]],
  ];
  for (const [what, [from, to]] of reds) {
    let x = null, err = '';
    try { x = doorWiring(anchored(WIRE, from, to, what)); } catch (e) { err = String(e.message || e).slice(0, 200); }
    ok(`②c RED CONTROL: ${what} — the pin goes red`, !!x && !good(x), x || err);
  }
}

/* ═══ ③ this machine's home (LAW 2) · New Session's footer ═══ */
console.log('\n── ③ the home read · New Session\'s footer ──');
{
  const fakeHome = (plan) => { const f = () => { const st = plan[Math.min(f.calls++, plan.length - 1)]; return st === 'throw' ? Promise.reject(new Error('down')) : st === 'fail' ? Promise.resolve(null) : st === 'err' ? Promise.resolve({ error: 'the home read failed' }) : Promise.resolve({ home: '/home/me' }); }; f.calls = 0; return f; };
  const reread = async (G) => { const f = fakeHome(['fail', 'ok']); const read = G.homeReader(f); const a = await read(), b = await read(); return { a, b, calls: f.calls }; };
  const r2 = await reread(P);
  ok('③ LAW 2: the home\'s first read failed ⇒ the NEXT ask reads it again and gets it', r2.a === '' && r2.b === '/home/me' && r2.calls === 2, r2);
  const kinds = [];
  for (const k of ['err', 'throw']) { const f = fakeHome([k, 'ok']); const read = P.homeReader(f); kinds.push([await read(), await read(), f.calls]); }
  ok('③ …a 500\'s body and a thrown read are failures too: \'\', then read again', JSON.stringify(kinds) === JSON.stringify([['', '/home/me', 2], ['', '/home/me', 2]]), kinds);
  { const f = fakeHome(['ok']); const read = P.homeReader(f); const both = await Promise.all([read(), read()]); ok('③ …one read in flight at a time', f.calls === 1 && both.every((h) => h === '/home/me'), { calls: f.calls }); }
  { const f = fakeHome(['fail']); const read = P.homeReader(f); for (let i = 0; i < P.HOME_READ_FAILS + 3; i++) await read(); ok(`③ …BOUNDED: read ${P.HOME_READ_FAILS} times, then the page stops asking`, f.calls === P.HOME_READ_FAILS, { calls: f.calls }); }
  const kept = load(anchored(SRC, '(d) => { inflight = null; const home', '(d) => { const home', 'the kept failed promise'));
  const c2 = await reread(kept);
  ok('③ CONTROL: the kept failed promise — the second ask never reads the home', c2.b === '' && c2.calls === 1, c2);
  // B-0f3d: only the probes SENT and answered in time are marked asked (the field calls an asked-and-not-a-folder path «known absent»)
  const L0 = { listing: { dirs: {} } };
  ok('③ askedOf: only the probes SENT and answered in time; none on a partial or failed reply', P.askedOf(['~/a', '~/b'], { ...L0, probesLate: ['~/a'] }).join() === '~/b' && P.askedOf(['~/a'], { ...L0, partial: true }).length === 0 && P.askedOf(['~/a'], null).length === 0);
  const unfiltered = load(anchored(SRC, 'return (sent || []).map(String).filter((p) => !late.has(p));', 'return (sent || []).map(String);', 'askedOf without the late filter'));
  ok('③ CONTROL: askedOf without the late filter marks the late probe asked', unfiltered.askedOf(['~/a', '~/b'], { ...L0, probesLate: ['~/a'] }).includes('~/a'));
  const NSM = fs.readFileSync(path.join(REPO, 'src', 'lib', 'new-session-model.js'), 'utf8');
  const refusalOf = (src) => { const a = src.indexOf('export function createRefusal('), b = src.indexOf('\n}\n', a); if (a < 0 || b < a) throw new Error('createRefusal moved'); return new Function(`${src.slice(a, b + 2).replace(/^export /, '')}\nreturn createRefusal;`)(); };
  const said = { status: 'unanswered', text: '这台机器没有回答' };
  const rf = refusalOf(NSM)({ cwd: said });
  ok('③ New Session: a folder the machine did not answer for refuses Create with the line\'s words', !!rf && rf.row === 'cwd' && rf.text === said.text, rf);
  ok('③ CONTROL: without «unanswered» the footer lets Create run', refusalOf(anchored(NSM, " || st === 'unanswered'", '', 'the footer without unanswered'))({ cwd: said }) === null);
}

/* ═══ ④ THE TICK BELONGS TO THE PATH IT WAS GIVEN FOR (B-f3a1) ═══ */
{
  const TK = (t, h = null, b = '') => P.tickKey(t, h, b);
  const B0 = '["~/work/investor-relations"]', B1 = '["~/work/weekly-admin"]';
  const given = (key) => ({ on: true, key });
  const ROADS = [
    ['typing another text', TK('~/work/新项目'), TK('~/work/新项目2')],
    ['a set from outside (another path)', TK('~/work/新项目'), TK('~/work/另一个')],
    ['a refresh after a Task Group change under a RELATIVE text (the same words, another folder)', TK('./新文件夹', null, B0), TK('./新文件夹', null, B1)],
    ['another machine (the same text)', TK('~/work/新项目'), TK('~/work/新项目', 'h-mac')],
    ['a chip that is not a «new» chip (an existing folder)', TK('~/work/新项目'), TK('~/work/payments')],
  ];
  const carries = load(anchored(SRC, 'return !!(tick && tick.on && tick.key === cur);', 'return !!(tick && tick.on);', 'the tick read with no key'));
  for (const [road, k0, k1] of ROADS) {
    ok(`④ ${road}: the tick given for the old path no longer holds — the person is asked again`, P.tickHolds(given(k0), k0) === true && P.tickHolds(given(k0), k1) === false, { road });
    ok(`④ CONTROL (${road}): the key check taken out — the tick CARRIES to the other path`, carries.tickHolds(given(k0), k1) === true);
  }
  // an ABSOLUTE («~») text names the same folder under any Task Group: a group picked after its tick leaves the tick (New Session J5:
  // a «new» name chip ticked, then another group picked — Create makes the folder)
  const abs0 = TK('~/workspace/studio/测试2', null, B0), abs1 = TK('~/workspace/studio/测试2', null, B1);
  const overReach = load(anchored(SRC, "ABS_PATH_RE.test(t) ? '' : bases", 'bases', 'the bases in every key'));
  ok('④ an absolute («~») text keeps its tick across a Task Group change — the same path (the consent stands)', abs0 === abs1 && P.tickHolds(given(abs0), abs1) === true);
  ok('④ CONTROL: the bases in an absolute text\'s key too — a group picked drops a tick for the SAME folder (New Session J5 made nothing)', overReach.tickHolds(given(overReach.tickKey('~/workspace/studio/测试2', null, B0)), overReach.tickKey('~/workspace/studio/测试2', null, B1)) === false);
  ok('④ the consent made at use holds: a «new» chip / a «new» row picked gives the tick FOR the path it picks (its key)', P.tickHolds(given(TK('~/work/由名字新建')), TK('~/work/由名字新建')) === true);
  ok('④ no tick, or a tick turned off: nothing holds', P.tickHolds(null, A) === false && P.tickHolds({ on: false, key: A }, A) === false);
  // the page's WIRING (src/lib/path-field.js): every read through tickNow(), every give through giveTick() — with the path it is for
  const CL = fs.readFileSync(path.join(REPO, 'src', 'lib', 'path-field.js'), 'utf8');
  const assigns = CL.split('\n').filter((l) => /st\.tick\s*=(?!=)/.test(l) && !/const (giveTick|tickNow) = /.test(l));
  ok('④ WIRED: the tick is set only inside giveTick / tickNow (no bare `st.tick =` left)', assigns.length === 0, assigns);
  ok('④ WIRED: the model\'s env and the checkbox read tickNow(), which judges by the PATH\'s key (tickKey over the field\'s text, machine and bases)', /tick: tickNow\(\), createMode/.test(CL) && /data-act="tick"\$\{tickNow\(\) \? ' checked' : ''\}/.test(CL) && /tickHolds\(\{ on: st\.tick, key: st\.tickKey \}, tickKeyNow\(\)\)/.test(CL) && /const tickKeyNow = \(text = textNow\(\)\) => tickKey\(text, hk\(\), basesKey\(\)\);/.test(CL));
  ok('④ WIRED: the consent made at use is given FOR the path it picks (a «new» chip: giveTick(…, n.path); a «new» row: giveTick(!!r.isNew, r.path))', /giveTick\(!world\(hk\(\)\)\.L\.dirs\[n\.path\], n\.path\); set\(n\.path/.test(CL) && /giveTick\(!!r\.isNew, r\.path\);/.test(CL));
  // the small beside it: a relative text after a Task Group change ASKS AGAIN on refresh (the field asked before) — the model's rebase
  const KB0 = P.keyOf('./新文件夹', null, B0), KB1 = P.keyOf('./新文件夹', null, B1);
  let st = P.init(KB0); st = P.step(st, { type: 'set', commit: false, cur: KB0, now: 1, env: envOf(KB0) }).state;
  st = P.step(st, { type: 'reply', key: KB0, kind: 'listing', now: 2, cur: KB0, env: envOf(KB0) }).state;
  const rf = P.step(st, { type: 'refresh', cur: KB1, now: 3, env: envOf(KB1) });
  ok('④ a relative text after a Task Group change, asked before: the refresh ASKS AGAIN for the new bases (an ask or one armed)', rf.effects.some((e) => e.do === 'ask' && e.key === KB1) || rf.effects.some((e) => e.do === 'arm' && e.which === 'soon'), rf.effects);
}

/* ═══ ⑤ THE FIELD'S VALUE ANSWERS WHAT THE BOX AND THE LINE SHOW, OR NOTHING (B-5736) — PURE valueFor: the committed folder only
   while the PATH's key now (its text, its machine, a relative text's bases) is the key it came from (the press's own, or the box as its
   door's onCommit left it) and nothing took it back since (a press ended with nothing, a create that failed, the consent taken off);
   each with its RED. THE PAGE's wiring. THE DOORS: every door takes the folder from its press's own answer — a source pin a door, two
   planted raw-box reads named; every file under src/ that builds a field is a door of the table (the walk finds the six; a planted new
   door is named) ═══ */
console.log('\n── ⑤ the field\'s value · the doors take the press\'s answer ──');
{
  const C = { path: '/home/me/work/a', text: '~/work/a', exists: true };
  const K = (t, h = null, b = '["~/work"]') => P.tickKey(t, h, b);
  const at = (keys, voided = false) => ({ keys, voided });
  const rows = [
    ['the box holds the press\'s own text', K('~/work/a'), at([K('~/work/a'), K('~/work/a')]), C],
    ['the door\'s onCommit wrote the folder\'s path into the box', K('/home/me/work/a'), at([K('~/work/a'), K('/home/me/work/a')]), C],
    ['an absolute text under another Task Group (the same folder)', K('~/work/a', null, '["~/other"]'), at([K('~/work/a'), K('~/work/a')]), C],
    ['THE SCENE: the box\'s text changed, its press ended with nothing', K('~/work/b'), at([K('~/work/a'), K('~/work/a')], true), null],
    ['the box\'s text changed, no press yet', K('~/work/b'), at([K('~/work/a'), K('~/work/a')]), null],
    ['another machine picked, the same text (the line asks it)', K('~/work/a', 'h-mac'), at([K('~/work/a'), K('~/work/a')]), null],
    ['a relative text after a Task Group change (another folder)', K('./a', null, '["~/other"]'), at([K('./a'), K('./a')]), null],
    ['a press ended with nothing on the same text, or a failed create, or the consent taken off (the line says it)', K('~/work/a'), at([K('~/work/a'), K('~/work/a')], true), null],
    ['nothing committed', K('~/work/a'), at([K('~/work/a')]), null, null],
    ['the box emptied', K(''), at([K('~/work/a'), K('~/work/a')]), null],
  ];
  for (const [what, cur, x, want, c = C] of rows) { const got = P.valueFor(c, cur, x); ok(`⑤ value: ${what} ⇒ ${want ? 'the committed folder' : 'nothing'}`, got === want, { got }); }
  const noKey = load(anchored(SRC, "  return Array.isArray(at.keys) && at.keys.includes(String(cur == null ? '' : cur)) ? committed : null;", '  return committed;', 'B-5736 the key check'));
  ok('⑤ RED CONTROL: the value without the key check answers the LAST committed folder under a new text and on another machine (the row\'s scene)', noKey.valueFor(C, K('~/work/b'), at([K('~/work/a')])) === C && noKey.valueFor(C, K('~/work/a', 'h-mac'), at([K('~/work/a')])) === C);
  const noVoid = load(anchored(SRC, "  if (!committed || typeof committed !== 'object' || !at || at.voided) return null;", "  if (!committed || typeof committed !== 'object' || !at) return null;", 'B-5736 a press ended with nothing'));
  ok('⑤ RED CONTROL: the value that ignores what took it back answers the old folder while the line says it did not take', noVoid.valueFor(C, K('~/work/a'), at([K('~/work/a')], true)) === C);
  // THE PAGE (src/lib/path-field.js): value() reads valueFor over the path's key NOW; the keys are noted AFTER the door's onCommit; a
  // settle, a failed create and the consent taken off each take the value back
  const valueWiring = (w) => ({
    reads: w.includes('value: () => valueFor(st.committed, tickKeyNow(), st.valueAt),'),
    noted: (() => { const cm = bodyOf(w, 'function committed(e) {'); const x = cm.indexOf('o.onCommit?.(info)'), y = cm.indexOf('st.valueAt = valueAtAfter(st.valueAt, { info, keys: [tickKeyNow(keyText(e.key)), tickKeyNow()] })'); return x >= 0 && y > x; })(),
    settle: /if \(r\.effects\.some\(\(e\) => e\.do === 'settle'\)\) st\.valueAt = \{ \.\.\.\(st\.valueAt \|\| \{\}\), voided: true \};/.test(w),
    failedCreate: /if \(!r \|\| r\.error\) \{ if \(st\.valueAt\) st\.valueAt = \{ \.\.\.st\.valueAt, voided: true \}; fire\(\{ type: 'ensureFailed'/.test(w),
    untick: /const giveTick = \(on, text = textNow\(\)\) => \{[^\n]*if \(!st\.tick && st\.committed && st\.committed\.create && st\.valueAt\) st\.valueAt = \{ \.\.\.st\.valueAt, voided: true \};/.test(w),
    noTarget: bodyOf(w, 'function committed(e) {').includes("else if (e.as !== 'empty') st.valueAt = valueAtAfter(st.valueAt, { as: e.as });"),
  });
  const vw = valueWiring(WIRE);
  ok('⑤ WIRED: value() is valueFor over the path\'s key NOW; the keys are noted after the door\'s onCommit; a press answered «nothing», a failed create and the consent taken off take it back', Object.values(vw).every(Boolean), vw);
  const vw0 = valueWiring(anchored(WIRE, 'value: () => valueFor(st.committed, tickKeyNow(), st.valueAt),', 'value: () => st.committed,', 'B-5736 the old value'));   // stale-pins: kept (the old line, planted by its RED)
  ok('⑤ RED CONTROL: the old value() (the last committed folder, whatever the box says) — the pin goes red', !vw0.reads, vw0);
  const vw1 = valueWiring(anchored(WIRE, "    else if (e.as !== 'empty') st.valueAt = valueAtAfter(st.valueAt, { as: e.as });", '', 'B-5736 r1218 4 the commit whose target no longer takes'));
  // r1279 b: the take-back decided PURE — valueAtAfter at the model's «commit»: took / an empty box / a target that no longer takes
  const at0 = { keys: [K('~/work/a')], voided: false };
  const vrows = [
    ['a commit that took gives the value its keys', P.valueAtAfter(at0, { info: C, keys: [K('~/work/b')] }), { keys: [K('~/work/b')], voided: false }],
    ['an empty box has no value', P.valueAtAfter(at0, { as: 'empty' }), null],
    ['THE MODEL SAID «COMMIT» BUT THE TARGET NO LONGER TAKES (the press heard nothing): the value is taken back', P.valueAtAfter(at0, { as: 'ok' }), { keys: [K('~/work/a')], voided: true }],
    ['…and with nothing held before, nothing', P.valueAtAfter(null, { as: 'create' }), null],
  ];
  for (const [what, got, want] of vrows) ok(`⑤ valueAtAfter: ${what}`, JSON.stringify(got) === JSON.stringify(want), { got });
  const keepsIt = load(anchored(SRC, '  return at ? { ...at, voided: true } : null;', '  return at;', 'r1279 b the take-back'));
  ok('⑤ RED CONTROL (r1279 b): the copy that keeps the value when the target no longer takes — the old folder still answers', JSON.stringify(keepsIt.valueAtAfter(at0, { as: 'ok' })) === JSON.stringify(at0));
  ok('⑤ RED CONTROL (r1218 4): the copy whose «commit» with no target keeps the value — the pin goes red', !vw1.noTarget, vw1);
  // THE DOORS: the folder from the press's own answer (commit()'s info, or onCommit's), never the box's text
  const DOORS = [
    ['src/lib/app.js', 'New Session (Create)', [/const picked = await Promise\.resolve\(this\._cwdField\?\.commit\(\)\)[\s\S]{0,240}const cwd = String\(picked\.path \|\| ''\)\.trim\(\);/], []],
    ['src/lib/setup-flows.js', 'the first chat', [/const v = cwdInput\.value\.trim\(\) \? await cwdPf\.commit\(\) : null;[\s\S]{0,200}const cwd = v \? v\.path : undefined;/], [/cwd: cwdInput\.value/]],   // stale-pins: kept (a deliberate absence check: the raw read must stay gone)
    ['src/lib/mounts-dialog.js', 'the mounts dialog (Save)', [/const v = await pf\.commit\(\);[\s\S]{0,200}took\[k\] = v\.path;/, /\[k, k in took \? took\[k\] : el\.value\.trim\(\)\]/], [/\.map\(\(\[k, el\]\) => \[k, el\.value\.trim\(\)\]\)/]],   // stale-pins: kept (a deliberate absence check: the raw read must stay gone)
    ['src/lib/task-detail.js', 'Task Detail (the export / import file; the context rows act in onCommit)', [/const v = await repoPf\.commit\(\); if \(!v\) \{[^\n]*return null; \} return v; \};/, /const p = v\.path;[\s\S]{0,400}\/export`/, /onCommit: \(info\) => bind\.onCommit\(info\)/], [/v \? v\.path : repoInput\.value/]],   // stale-pins: kept (a deliberate absence check: the raw read must stay gone)
    ['src/lib/file-explorer.js', 'the Files window (acts in onCommit)', [/this\._pathField = pathField\(this\.pathInput, \{[\s\S]{0,600}onCommit/], []],
    ['src/lib/desktop-app-launcher.js', 'the desktop launcher (Run)', [/v = await cwdPf\.commit\(\);[\s\S]{0,700}cwd = v\.path;/, /if \(!live\(\) \|\| host !== asked\) return;/], [/cwdIn\.value\.trim\(\) \|\| undefined/, /cwd: cwdIn\.value/]],   // stale-pins: kept (a deliberate absence check: the raw read must stay gone)
  ];
  const doorVerdicts = (read) => DOORS.map(([f, door, must, never]) => { const src = read(f); const miss = must.filter((re) => !re.test(src)).length, raw = never.filter((re) => re.test(src)).length; return { door, ok: miss === 0 && raw === 0, miss, raw }; });
  const readSrc = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const dv = doorVerdicts(readSrc);
  ok(`⑤ THE DOORS take the folder from their press's own answer, never the box (${dv.map((d) => d.door).join(' · ')})`, dv.every((d) => d.ok), dv.filter((d) => !d.ok));
  const planted = doorVerdicts((f) => f === 'src/lib/desktop-app-launcher.js' ? anchored(readSrc(f), '    launch({ exec, args, cwd }, { exec, args, cwd: cwd || null });', '    launch({ exec, args, cwd: cwdIn.value.trim() || undefined }, { exec, args, cwd: cwd || null });', 'B-5736 a raw read planted in the launcher') : readSrc(f));   // stale-pins: kept (the old raw read, planted by its RED)
  ok('⑤ RED CONTROL: a raw box read planted in the launcher\'s Run — the door is named', planted.filter((d) => !d.ok).map((d) => d.door).join() === 'the desktop launcher (Run)', planted.filter((d) => !d.ok));
  const oldExport = doorVerdicts((f) => f === 'src/lib/task-detail.js' ? anchored(readSrc(f), "if (!v) { const vd = repoPf.verdict(); if (vd?.text) showToast(vd.text, vd.status === 'pending' ? {} : { type: 'error' }); return null; } return v; };", 'return v ? v : { path: repoInput.value.trim() }; };', 'B-5736 the export\'s old fallback') : readSrc(f));   // stale-pins: kept (the old line, planted by its RED)
  ok('⑤ RED CONTROL: Task Detail\'s old export fallback (the box\'s raw text after a press with nothing) — the door is named', oldExport.filter((d) => !d.ok).map((d) => d.door).join().startsWith('Task Detail'), oldExport.filter((d) => !d.ok));
  // r1218 (the narrow round's follow): THE PRODUCT'S OWN SUGGESTION IS MEANT; ONE guard for Run; Import's own words; the Save re-check
  const TD = readSrc('src/lib/task-detail.js'), LA = readSrc('src/lib/desktop-app-launcher.js'), MD = readSrc('src/lib/mounts-dialog.js');
  const suggestPin = (w, td) => ({
    field: /if \(createMode === 'ask' && typeof o\.suggests === 'string' && o\.suggests\.trim\(\) && input\.value === o\.suggests\) giveTick\(true, o\.suggests\.trim\(\)\);/.test(w),
    door: /createWhen: t\('Create this file when exporting'\), suggests: repoInput\.value \}\)/.test(td),
  });
  const sp = suggestPin(WIRE, TD);
  ok('⑤ r1218 1 WIRED: a door\'s own prefill (`suggests`) gives the «create» choice FOR that path while the box still holds it (the tick law drops it for any other text); Task Detail\'s export box passes its prefill', sp.field && sp.door, sp);
  const sp0 = suggestPin(WIRE, anchored(TD, ", suggests: repoInput.value })", ' })', 'B-5736 r1218 1 the prefill not meant'));
  ok('⑤ RED CONTROL (r1218 1): Task Detail without its suggestion — a first export refuses and asks for the tick (the step back)', !sp0.door, sp0);
  const P1 = P.tickKey('/ctx/grp/T-1.md', null, ''), typed = P.tickKey('/ctx/grp/other.md', null, '');
  ok('⑤ r1218 1: the suggestion\'s choice holds for its own path and never for a typed one (B-f3a1\'s tick law)', P.tickHolds({ on: true, key: P1 }, P1) === true && P.tickHolds({ on: true, key: P1 }, typed) === false);
  const importPin = (td) => /if \(v\.create\) \{ showToast\(t\('There is no file at \{path\} to import', \{ path: v\.display \|\| v\.path \}\), \{ type: 'error' \}\); return; \}/.test(td);
  ok('⑤ r1218 3: Import refuses the shared field\'s «create» answer by name, in its own words (no ask for a file that is not there)', importPin(TD));
  ok('⑤ RED CONTROL (r1218 3): the Import without its refusal — the pin goes red', !importPin(anchored(TD, "      if (v.create) { showToast(t('There is no file at {path} to import', { path: v.display || v.path }), { type: 'error' }); return; }\n", '', 'B-5736 r1218 3 Import\'s refusal')));
  const refreshPin = (td) => /if \(res\.ok\) \{ showToast\(t\('Exported to \{path\}', \{ path: d\.path \}\)\); repoPf\.refresh\(\); \}/.test(td);
  ok('⑤ r1218 3: a successful Export refreshes the shared field — an Import next asks again, never refused on the old «absent» answer', refreshPin(TD));
  ok('⑤ RED CONTROL (r1218 3): the Export without its refresh — the pin goes red', !refreshPin(anchored(TD, ' repoPf.refresh(); }', ' }', 'B-5736 r1218 3 the refresh after an export')));
  const guardPin = (la) => { const run = la.slice(la.indexOf('  runBtn.onclick = async () => {'), la.indexOf('  execIn.addEventListener(\'keydown\'')); const g = run.indexOf("if (runBtn.dataset.judging) { showToast(t('Asking the machine…')); return; }"); return g > 0 && g < run.indexOf('execIn.value.trim()') && g < run.indexOf('if (cwdIn.value.trim())') && (run.match(/runBtn\.dataset\.judging\)/g) || []).length === 1; };
  ok('⑤ r1218 2: ONE guard for Run, before the boxes are read — a press while the folder is judged says so, whatever the folder box holds', guardPin(LA));
  ok('⑤ RED CONTROL (r1218 2): the guard back inside the folder branch (an emptied box launches at once) — the pin goes red', !guardPin(anchored(anchored(LA, "    if (runBtn.dataset.judging) { showToast(t('Asking the machine…')); return; }\n", '', 'B-5736 r1218 2 the guard'), '      const asked = host;', '      if (runBtn.dataset.judging) return;\n      const asked = host;', 'B-5736 r1218 2 the old guard')));   // stale-pins: kept (the old guard, planted by its RED)
  const recheckPin = (md) => /for \(const \[k, el\] of Object\.entries\(inputs\)\) \{[^\n]*\n        const pf = el\._pathField;\n        if \(!pf \|\| !pf\.el\.isConnected \|\| pf\.el\.offsetParent === null\) continue;\n        if \(!el\.value\.trim\(\)\) \{ delete took\[k\]; continue; \}[^\n]*\n        if \(k in took && pf\.value\(\)\) continue;\n        const v = await pf\.commit\(\);/.test(md) && md.indexOf('if (k in took && pf.value()) continue;') < md.indexOf('const vals = Object.fromEntries(');
  ok('⑤ r1218 5: the mounts dialog\'s Save asks again, once, every field whose box moved while a later press was judged (its value is nothing) — before it saves', recheckPin(MD));
  ok('⑤ RED CONTROL (r1218 5): the Save without its re-check — the pin goes red', !recheckPin(anchored(MD, '        if (k in took && pf.value()) continue;\n', '        continue;\n', 'B-5736 r1218 5 the re-check')));
  ok('⑤ RED CONTROL (r1279 a): the re-check over the fields taken at the first pass only (one empty then and typed into later goes unjudged) — the pin goes red', !recheckPin(anchored(MD, '        if (k in took && pf.value()) continue;\n', '        if (!(k in took) || pf.value()) continue;\n', 'r1279 a every visible field')));
  // r1279 THE MUST: a refused export SAYS its error — the branch is code (a line comment once swallowed it, unseen by any gate)
  const errPin = (td) => /repoPf\.refresh\(\); \}[^\n]*\n\s*else showToast\(d\.code === 'TASK_GROUPS_UNREAD'/.test(td) && !/\/\/[^\n]*else showToast\(/.test(td);
  ok('⑤ r1279 THE MUST: Export\'s error branch is CODE — a refused export says its error (no line comment holds an «else showToast(»)', errPin(TD));
  ok('⑤ RED CONTROL (r1279): fa688554e\'s line — the else branch inside the success arm\'s comment — the pin goes red', !errPin(anchored(TD, '   // r1279: a refused export SAYS its error (a comment once swallowed this branch)', '', 'r1279 its note').replace(/\n\s*else showToast\(d\.code === 'TASK_GROUPS_UNREAD'/, " else showToast(d.code === 'TASK_GROUPS_UNREAD'")));
  // every file under src/ that builds a field is a door of the table: the walk FINDS the six (it can fail), a planted text is named
  const builds = (text) => /\bpathField\(/.test(text.replace(/^\s*import\s[^\n]*\n/gm, ''));
  const walkSrc = (extra = {}) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) walk(rel); else if (/\.js$/.test(e.name) && rel !== 'src/lib/path-field.js' && builds(readSrc(rel))) out.push(rel); } }; walk('src'); for (const [f, text] of Object.entries(extra)) if (builds(text)) out.push(f); return out; };
  const found = walkSrc(), notDoors = found.filter((f) => !DOORS.some(([g]) => g === f));
  ok(`⑤ the walk over src/ finds every door of the table (${found.length} files build a field) and no file that builds one is missing from it`, DOORS.every(([f]) => found.includes(f)) && notDoors.length === 0, { found, notDoors });
  const planted2 = walkSrc({ 'src/lib/zz-new-door.js': "import { pathField } from './path-field.js';\nconst pf = pathField(input, { kind: 'folder' });\n" }).filter((f) => !DOORS.some(([g]) => g === f));
  ok('⑤ RED CONTROL: a planted new page that builds a field (its import line stripped, its call read) is named', planted2.join() === 'src/lib/zz-new-door.js', planted2);
}

console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''}`);
process.exit(bad ? 1 : 0);
