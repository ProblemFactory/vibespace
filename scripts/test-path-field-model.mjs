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
//      each invariant with its RED CONTROL: the rule removed in a copy of the model (an anchored edit of the shipped source) — the
//      same driver finds the scene by itself and prints its seed
//   ③ this machine's home (LAW 2: a failed read is read again, bounded) and New Session's footer (createRefusal lists «unanswered»)
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
const RANKS = { missing: { missing: true, pathLike: true }, resolved: { resolved: true, pathLike: true }, search: { pathLike: false }, empty: { empty: true } };
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
  { row: 'commit on a text the listing shows: committed at once (ok), nothing asked', start: A, evs: [[{ type: 'commit' }, { rank: 'resolved' }]], check: ({ fx }) => does(fx, 'commit')[0]?.as === 'ok' && does(fx, 'ask').length === 0 },
  { row: 'commit on a text not answered: OWED, asked at once (forced)', start: A, evs: [[{ type: 'commit', how: 'blur' }]], check: ({ s, fx }) => s.owed?.key === A && does(fx, 'ask').length === 1 && viewOf(s).kind === 'pending' },
  { row: 'owed + its complete reply + the tick: served ONCE as a create', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'listing' }, { tick: true }]], check: ({ s, fx }) => does(fx, 'commit').length === 1 && does(fx, 'commit')[0].as === 'create' && !s.owed },
  { row: 'owed + its complete reply, no tick: refused — «未生效：… tick …» (V1), the create row offered', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'listing' }]], check: ({ s, fx }) => does(fx, 'commit').length === 0 && s.err?.why === 'tick' && viewOf(s).status === 'unresolved' && viewOf(s).tick },
  { row: 'owed + a partial reply: still owed — «未生效：正在问这台机器…» (V1), its door hears «nothing yet»', start: A, evs: [[{ type: 'commit' }], [{ type: 'reply', key: A, kind: 'partial' }]], check: ({ s, fx }) => s.owed?.key === A && s.err?.kind === 'pending' && does(fx, 'settle')[0]?.result === 'owed' },
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
  const d = { text: pick(TEXTS), h: null, open: false, tick: false, createMode: R() < 0.2 ? 'never' : 'ask', destroyed: false, touched: false, now: 0 };
  let s = G.init(K(d.text, d.h));
  let net = null, owedRec = null, runReasks = 0;
  const seq = [], why = [];
  const env = () => {
    const cur = K(d.text, d.h);
    const rank = !d.text ? 'empty' : !/^[~/.]/.test(d.text) && !d.text.includes('/') ? 'search' : EXISTS[d.text] && listed.has(cur) ? 'resolved' : 'missing';
    return envOf(cur, { rank, homeKnown: homeKnown[d.h], tick: d.tick, createMode: d.createMode, file: isFile && d.text === '~/new', unreachable: unreachable[d.h] });
  };
  for (let i = 0; i < steps; i++) {
    d.now += Math.floor(R() * 4000);
    const roll = R();
    let ev = null;
    if (d.destroyed && R() < 0.5) ev = { type: pick(['typed', 'set', 'commit', 'refresh', 'opened', 'fired', 'reply']), which: 'soon', key: K(d.text, d.h), kind: 'listing' };
    else if (roll < 0.14) { d.text = pick(TEXTS); d.touched = true; ev = { type: 'typed', soon: R() < 0.8 }; }
    else if (roll < 0.22) { d.text = pick(TEXTS); d.touched = true; ev = { type: 'set', commit: R() < 0.4, how: 'set' }; }
    else if (roll < 0.32) { d.touched = true; ev = { type: 'commit', how: pick(['blur', 'enter', 'api']) }; }
    else if (roll < 0.52 && net) { const k = pick(['listing', 'partial', 'partial', 'failed']); if (k === 'listing') { listed.add(net.key); homeKnown[net.key.slice(net.key.lastIndexOf('\n') + 1) || null] = true; } ev = { type: 'reply', key: net.key, kind: k, err: k === 'failed' ? 'boom' : '' }; net = null; }
    else if (roll < 0.62 && (s.soon || s.reask)) ev = { type: 'fired', which: s.reask && (!s.soon || R() < 0.5) ? 'reask' : 'soon', connected: R() < 0.9 };
    else if (roll < 0.70) ev = { type: 'refresh' };
    else if (roll < 0.75) { d.open = R() < 0.5; if (d.open) d.touched = true; ev = { type: d.open ? 'opened' : 'closed' }; }
    else if (roll < 0.80) { d.h = d.h ? null : 'h-mac'; if (R() < 0.5) ev = { type: 'refresh' }; }   // the machine changed (with or without the door's refresh)
    else if (roll < 0.85) { d.text = pick(TEXTS); }   // a door rewrote the box: no event
    else if (roll < 0.89) { const picked = R() < 0.5; if (!picked) d.touched = true; ev = { type: 'pickerClosed', picked }; }
    else if (roll < 0.94) d.tick = !d.tick;
    else if (roll < 0.96) ev = { type: 'ensureFailed', words: 'EACCES' };
    else if (roll < 0.975 && !d.destroyed) { d.destroyed = true; ev = { type: 'destroyed' }; }
    if (!ev) continue;
    const e0 = env(), before = s, owedBefore = s.owed;
    EMITTED.add(ev.type);
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
      if (!STARTERS.has(ev.type)) fail(`I5 an ask on «${ev.type}», an event that starts none`);
      if (a.reask) { if (++runReasks > P.PARTIAL_REPLIES - 1) fail('I5 more partial replies than PARTIAL_REPLIES in one run'); } else runReasks = 0;
      net = { key: a.key };
      // I7 — A1
      if (!d.touched) fail('I7 a field built over a saved text, never touched, asked');
    }
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
  ok(`② THE LAW over ${SEEDS} seeds × 60 steps: I1–I8 hold after every step`, reds.length === 0, reds.slice(0, 2).map((r) => ({ seed: r.seed, why: r.why, seq: r.seq.join(' ') })));
  for (const r of reds.slice(0, 3)) console.log(`      red: PFM_SEED_ONLY=${r.seed} — ${r.why.join('; ')}`);
  console.log(`      (the law: ${SEEDS} seeds in ${Date.now() - t0} ms)`);
}
/* RED CONTROLS: each invariant's rule removed in a copy of the model (anchored edits of the shipped source); the same driver must find
   a seed that breaks exactly that invariant, within three times the law's seeds */
const CONTROLS = [
  ['I1', '«missing» on any answer, complete or not', [["listed: mine && a.kind === 'complete'", 'listed: mine']]],
  ['I2', 'the pending words with nothing asked (the third commit\'s gate)', [["return sought ? 'pending' : 'quiet';", "return 'pending';"]]],
  ['I2', '«未生效：正在问…» left standing when the run moves on', [["  else if (s.err && s.err.kind === 'pending') s.err = null;\n", '']]],
  ['I3', 'a create committed on a partial reply', [["else if (run === 'reask') { if (!(s.err && s.err.kind === 'pending')) fx.push({ do: 'settle', result: 'owed' }); s.err = { kind: 'pending' }; }", "else if (run === 'reask') { s.owed = null; fx.push({ do: 'commit', how: 'x', as: 'create' }); }"]]],
  ['I4', 'an owed commit served on whatever text or machine answers (the fourth commit\'s)', [['    if (s.owed && s.owed.key !== s.key) drop(s, fx, false);\n    if (s.errRun', '    if (s.errRun'], ["    if (s.owed && s.owed.key !== s.key) drop(s, fx, false);\n  }\n  disarm(s, fx, 'soon');", "  }\n  disarm(s, fx, 'soon');"], ['      if (s.owed && s.owed.key === s.key) {\n        const g', '      if (s.owed) {\n        const g']]],
  ['I4', 'an owed commit kept past a run that ended unanswered (the ruling\'s drop removed)', [['        else { drop(s, fx, true, s.answer.err); s.errRun = s.key; }', '        else { s.errRun = s.key; }']]],
  ['I5', 'the partial reply asked again for ever (the old loop)', [["run = s.run.n < PARTIAL_REPLIES ? 'reask' : 'stop';", "run = 'reask';"]]],
  ['I6', 'effects after «destroyed»', [['if (!s0 || s0.destroyed) return { state: s0, effects: [] };', 'if (!s0) return { state: s0, effects: [] };']]],
  ['I7', 'a closed refresh asks a field never asked (A1 broken)', [['if (!outOrDue && text && s.everAsked && (', 'if (!outOrDue && text && (']]],
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

console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''}`);
process.exit(bad ? 1 : 0);
