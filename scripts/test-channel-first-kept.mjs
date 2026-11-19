#!/usr/bin/env node
// THE FIRST READ KEPT (B-dfa4 cut 2; gate row `test-channel-first-kept`). The panel's first screen (digest's `firstRead`:
// each account's head, the attention candidates and their tags) walked EVERY row of every account on each full digest —
// 146 ms on a stand-in store of the owner's shape (the panel's open, a broadcast that names no rows). It is now KEPT:
// each account's listed rows in the first screen's order, moved by the touch signal; the rows whose facts make them a
// candidate, re-judged at every read with the rows touched since and the rows whose outbox counts moved; the judge's own
// rows read fresh. The walk stays as the DEFINITION (`firstReadWalk`), and the engine's gates hook `firstReadParity()`
// answers both over the same instant and outbox.
//   ① PARITY: after every step — a row write (the heads move), a row made a candidate by its own facts, an unlisted and a
//      relisted row, a birth, an @-mention, an outbox proposal awaiting approval and then sent, a write whose touch fires
//      BEFORE the row changes (entry() outside an update), the clock past a wake's 24 h window, the clock gone back, a judge
//      label, a damaged row (its key not its own) and a proposal under its own key, a removal (a whole-map touch) — the kept answer is the walk's, field for
//      field (conversations, heads, attention, the candidate keys).
//   ② THE PRICE: across the row steps the kept read is NOT rebuilt (one build, then a rebuild only where the law says: the
//      clock gone back, a whole-map touch) and re-reads a handful of rows per read, never the 4 000 of another account.
//   ③ RED CONTROLS — an engine copy with ONE line gone each; its own step goes red (the kept answer ≠ the walk's): the touch
//      not kept · the outbox not compared · the clock gone back not rebuilt · the judge's rows not read · the damaged rows not
//      re-read; and the kept candidates not re-judged — the same answer (every kept key is judged at the read) but a set that
//      only grows (the clock never takes a row out), red against the price.
// Per-pid scratch (scripts/scratch.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const ROOT = scratch('chan-first-kept');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const J = (x) => JSON.stringify(x);
const H = 3600e3, T0 = Date.UTC(2026, 10, 18, 22, 0, 0);
const A = 'fake-poll', OTHER = 'other-account';
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' };
// the judge's switch ON (a stand-in decision engine: the plugin and its attention feature on, no judging road)
const decisionEngine = { settings: () => ({ pluginOn: true, features: { attention: true } }) };

async function run(E, tag) {
  let t = T0;
  const e = E.create({ dataDir: path.join(ROOT, tag), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => t, log: quiet, censusTimer: () => ({ cancel() {} }), decisionEngine,
    liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }] });
  const ix = e.store.index;
  await ix.update(() => {
    for (let i = 0; i < 4000; i++) Object.assign(ix.entry(OTHER, `thr_${i}`), { title: `other ${i}`, kind: 'group', lastAt: T0 - 9 * H - i * 1000, unread: 0 });
    for (let i = 0; i < 40; i++) Object.assign(ix.entry(A, `own_${i}`), { title: `own ${i}`, kind: i % 4 ? 'group' : 'dm', lastAt: T0 - H - i * 60e3, unread: i % 3, readAt: T0 - 2 * H,
      ...(i % 10 === 0 ? { watchers: [{ principal: AGENT, mode: 'all', notify: 'wake', at: T0 - H }] } : {}),
      ...(i === 7 ? { stats: { hits7d: 1, msgs7d: 1, wakes: [{ at: T0 - 2 * H, ok: true, lane: 'message' }] } } : {}) });
  });
  ix.flush();
  const steps = [];
  const look = (why) => { let p; try { p = e.firstReadParity(); } catch (err) { steps.push({ why, same: false, threw: String((err && err.message) || err), walkAt: null }); return; } steps.push({ why, same: J(p.kept) === J(p.walk), walkAt: J(p.walk), cands: p.walk.cands.length, builds: p.stats.builds, rechecked: p.stats.rechecked, facts: p.stats.facts, diff: J(p.kept) === J(p.walk) ? null : { kept: p.kept.cands, walk: p.walk.cands, heads: J(p.kept.heads) === J(p.walk.heads) } }); };
  look('the first read (the build)');
  await ix.update(() => { ix.entry(A, 'own_33').lastAt = T0; });
  look('a row written newest (its account\'s head moves)');
  await ix.update(() => { ix.entry(A, 'own_21').watchers = [{ principal: AGENT, mode: 'all', notify: 'wake', at: T0 }]; });
  look('a row made a candidate by its own facts (a notification row)');
  await ix.update(() => { ix.entry(A, 'own_10').unlistedAt = T0; });
  look('a candidate unlisted');
  await ix.update(() => { delete ix.entry(A, 'own_10').unlistedAt; });
  look('relisted');
  await ix.update(() => { Object.assign(ix.entry(A, 'own_new'), { title: 'born', kind: 'dm', lastAt: T0 + 1000, unread: 1 }); });
  look('a row born');
  await ix.update(() => { const en = ix.entry(A, 'own_5'); en.atYouAts = [T0 - 600e3]; en.readAt = T0 - H; });
  look('an @-mention past the read line');
  await e.store.outbox.update((ob) => { ob.proposals['p-walk-1'] = { id: 'p-walk-1', key: `${A}/own_25`, state: 'awaiting-approval', at: T0 }; });
  look('an outbox proposal awaiting approval (no row touched)');
  await e.store.outbox.update((ob) => { ob.proposals['p-walk-1'].state = 'sent'; ob.proposals['p-walk-1'].updatedAt = T0 + 1; });
  look('the proposal sent');
  { const en = ix.entry(A, 'own_31'); en.watchers = [{ principal: AGENT, mode: 'all', notify: 'wake', at: T0 }]; }   // the touch fires BEFORE the write
  look('a write whose touch fired before the row changed (entry() outside an update)');
  t = T0 + 30 * H;
  look('the clock past the delivered wake\'s 24 h window (own_7 leaves by the clock alone)');
  t = T0 + H;
  look('the clock gone back (the window open again)');
  { const view = e.rows({ keys: [`${A}/own_12`] }).rows[0]; e.attention.label(`${A}/own_12`, view.lastAt, 'needs', view); }
  look('a judge label (a row only the judge makes a candidate)');
  await ix.update(() => { const rows = ix.rows(); rows[`${A}/own_14`].key = `${A}/own_14-moved`; ix.touch(`${A}/own_14`); });
  look('a damaged row (its key is not its own)');
  await e.store.outbox.update((ob) => { ob.proposals['p-walk-2'] = { id: 'p-walk-2', key: `${A}/own_14-moved`, state: 'awaiting-approval', at: T0 }; });
  look('an outbox proposal under the damaged row\'s own key (no map key of that name)');
  await ix.update(() => { const rows = ix.rows(); rows[`${A}/own_33`].adapterId = OTHER; ix.touch(`${A}/own_33`); });
  look('a head row moved to another account (its adapterId)');
  await ix.update((x) => { delete x.conversations[`${A}/own_2`]; });
  look('a removal (a whole-map touch)');
  try { await e.stop(); } catch { }
  try { e.store.close(); } catch { }
  return steps;
}

console.log('① the kept first read is the walk\'s, field for field, after every step');
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const got = await run(ENG, 'kept');
for (const s of got) ok(s.same === true, `${s.why}: the kept answer is the walk's (${s.cands} candidates)`, s.diff);
const steps = got.length;
ok(steps === 17, `seventeen steps (${steps})`, got.map((s) => s.why));
// every step's plant TOOK: the walk's own answer moved (a step that changed nothing would be a parity leg about nothing)
const still = got.slice(1).filter((s, i) => s.walkAt === got[i].walkAt).map((s) => s.why);
ok(still.length === 0, `every step changed the walk's own answer (the plants took): ${still.length ? still.join(' · ') : 'all seventeen'}`, still);

console.log('\n② the price: no rebuild but where the law says, a handful of rows re-read per read');
const at = (why) => got.find((s) => s.why.startsWith(why));
const b0 = got[0].builds;
ok(b0 === 1 && at('a write whose touch fired').builds === 1 && at('the clock past').builds === 1, `one build for the first read, none across the row, outbox, touch-before-write and clock-forward steps (${at('the clock past').builds})`, got.map((s) => [s.why.slice(0, 30), s.builds]));
ok(at('the clock gone back').builds === 2 && at('a removal').builds === 3, `rebuilt where the law says: the clock gone back (${at('the clock gone back').builds}), a whole-map touch (${at('a removal').builds})`, got.map((s) => s.builds));
const iClock = got.findIndex((s) => s.why.startsWith('the clock past'));
ok(got[iClock].facts < got[iClock - 1].facts, `the kept candidates are re-judged: the clock alone takes rows out of the kept set (${got[iClock - 1].facts} → ${got[iClock].facts}) — it never only grows`, got.map((s) => s.facts));
const per = (got[9].rechecked - got[0].rechecked) / 9;
ok(per > 0 && per < 40, `between the build and the clock steps each read re-read ${per.toFixed(1)} rows on average — never the 4 040 of the map`, got.map((s) => s.rechecked));

console.log('\n③ red controls: one line gone each — its own step goes red');
const SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
const MC = mutantCopies('chan-first-kept', REPO);
const PLANTS = [
  ['no-touch', "store.index.onTouch((k) => { if (k === null) firstKept.built = false; else if (firstKept.built) firstKept.dirty.add(k); });", "store.index.onTouch((k) => { if (k === null) firstKept.built = false; });", 'a row written newest'],
  ['no-outbox', "      for (const [k, ob] of ctx.outbox) { seen.add(k); const f = obFact(ob); if (fk.ob.get(k) !== f) { fk.ob.set(k, f); again.add(k); } }", "      for (const [k] of ctx.outbox) seen.add(k);", 'an outbox proposal'],
  ['no-clock-back', "    if (!fk.built || !(t >= fk.t) || fk.dirty.size > (fk.at.size >> 3) + 256) {", "    if (!fk.built || fk.dirty.size > (fk.at.size >> 3) + 256) {", 'the clock gone back'],
  ['no-mass', "    if (!fk.built || !(t >= fk.t) || fk.dirty.size > (fk.at.size >> 3) + 256) {", "    if (!fk.built || !(t >= fk.t)) {", null],
  ['no-judge', "    for (const k of attention.judgedKeys()) keys.add(k);   // the judge's rows (a verdict or a label: judgedFor is null without one)", "", 'a judge label'],
  ['no-odd', "    for (const mk of firstKept.odd) keys.add(mk);", "", 'an outbox proposal under the damaged'],
];
for (const [tag, line, repl, step] of PLANTS) {
  ok(SRC.split(line).length === 2, `control setup (${tag}): the line is present once`);
  if (!step) continue;   // no-mass: judged by the burst below
  const c = await run(MC.load('src/server/channels-engine.js', SRC.replace(line, repl), tag), `ctl-${tag}`);
  const i = c.findIndex((x) => x.why.startsWith(step)), s = c[i];
  ok(i > 0 && c[i - 1].same === true && s.same === false, `RED CONTROL (${tag}): green up to «${step}…», where the kept answer differs from the walk's — red`, { before: c[i - 1] && c[i - 1].same, at: s });
}
// the kept set's pruning is the PRICE, not the answer (every kept key is judged again at the read): its control is the set's size
{
  const line = "      const again = new Set(fk.facts);";
  ok(SRC.split(line).length === 2, 'control setup (no-recheck): the line is present once');
  const c = await run(MC.load('src/server/channels-engine.js', SRC.replace(line, '      const again = new Set();'), 'no-recheck'), 'ctl-no-recheck');
  const i = c.findIndex((x) => x.why.startsWith('the clock past'));
  ok(i > 0 && c[i].same === true && c[i].facts >= c[i - 1].facts, `RED CONTROL (no-recheck): the kept set never re-judged keeps the rows the clock ended (${c[i - 1].facts} → ${c[i].facts}) — the same answer, a set that only grows, red against the price`, c.map((x) => x.facts));
}

// THE MASS WRITE: a burst of touched rows (more than an eighth of the map) is one walk, never as many array moves
{
  const burst = async (E, tag) => {
    const e = E.create({ dataDir: path.join(ROOT, tag), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => T0, log: quiet, censusTimer: () => ({ cancel() {} }), liveSessions: () => [] });
    const ix = e.store.index;
    await ix.update(() => { for (let i = 0; i < 3000; i++) Object.assign(ix.entry(A, `b_${i}`), { title: `b ${i}`, kind: 'group', lastAt: T0 - H - i }); });
    const p0 = e.firstReadParity();
    await ix.update(() => { for (let i = 0; i < 1500; i++) ix.entry(A, `b_${i}`).lastAt = T0 + i; });   // half the map written newest at once
    const p1 = e.firstReadParity();
    try { await e.stop(); } catch { } try { e.store.close(); } catch { }
    return { same: J(p1.kept) === J(p1.walk), builds: p1.stats.builds - p0.stats.builds };
  };
  const k = await burst(ENG, 'burst');
  ok(k.same && k.builds === 1, `a burst of 1 500 moved rows (half the map) is ONE rebuild by the walk (${k.builds}), the same answer`, k);
  const line = "    if (!fk.built || !(t >= fk.t) || fk.dirty.size > (fk.at.size >> 3) + 256) {";
  const c = await burst(MC.load('src/server/channels-engine.js', SRC.replace(line, '    if (!fk.built || !(t >= fk.t)) {'), 'no-mass-b'), 'burst-ctl');
  ok(c.same && c.builds === 0, `RED CONTROL (no-mass): without the rule the burst is 1 500 array moves, no rebuild (${c.builds}) — red against the price`, c);
}

report();
