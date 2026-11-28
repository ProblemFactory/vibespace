#!/usr/bin/env node
// A STORED MESSAGE KEEPS LEARNING — PURE (lane channel-record-revisions, owner 2026-10-13: userW recalled a Lark message
// and VibeSpace never marked it). The fold, the record's `rv` line, the recheck PLAN (cadence, budget, the 24 h / 7 d
// windows, woken-for first), the capability row per adapter (`how: none` legs), the registry's normalizing wrapper,
// the agent's words — each with a RED control. The chrome legs: scripts/test-channel-revisions-ui.mjs (heavy).
// ⑦ (lane channel-recall-engine-leg, B-e8e1) the ENGINE leg, in-process: the REAL engine over the fake adapter (its
// revisions file = the vendor's answer by id), a deliver stub, an injected clock — a message a wake carried is recalled
// ⇒ ONE stashed note; again / after a restart ⇒ nothing; a recall nobody was woken for ⇒ nothing; a message carried
// twice ⇒ still one; a SCOPE DIGEST writes the woken-for rows of every conversation it carried. Patched-copy controls.
// ⑦h (lane stash-pending-live) the CARRY: a group's hit parked while nobody ran, carried to the first member back, is on
// the ledger ONCE — its recall is noted ONCE. ⑦d–⑦g (lane channel-recall-ledger, B-70d2) EVERY ROAD writes the ledger: a refused wake stashed, the FREE next-turn
// stash (was: no row — its recall told nobody), one message reaching two conversations by two roads, a chatty
// next-turn watch beside an older wake (the fair bound keeps the wake's row). ⑧ THE LEDGER DOOR CENSUS (acorn): every
// delivery call of the engine (families inlined) and src/server/channel*.js names `noteDelivered(` after it, or a
// NOT_A_ROAD row says why it carries no inbound message; one door, the only `wokeFor` writer. ⑨ the key + the fair cap.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Rev = require(path.join(REPO, 'src/channel-revisions.js'));
const R = require(path.join(REPO, 'src/channel-record.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const J = (x) => JSON.stringify(x);
const H = 3600e3, T = 1_800_000_000_000;

console.log('① the fold: the record is the ORIGINAL, every version kept');
const rec = { vendorId: 'm1', at: T - 5 * 60e3, text: 'first words' };
const rv = (editedAt, text, extra = {}) => R.validateSide({ k: 'rv', msg: 'm1', at: editedAt + 10, src: 'recheck', editedAt, text, ...extra }).side;
const vs = Rev.foldVersions(rec, [rv(T - 60e3, 'third words'), rv(T - 120e3, 'second words'), rv(T - 90e3, 'second words')]);
ok(vs.map((v) => v.text).join('|') === 'first words|second words|third words' && vs[0].original === true && rec.text === 'first words', 'oldest → newest, the original first (a repeat of the previous text dropped); the record object is never touched', J(vs));
ok(Rev.foldVersions(rec, []).length === 1 && Rev.foldVersions(rec, [{ k: 'fx', msg: 'm1' }]).length === 1, 'no rv line = one version (the original)');
const fx = (at, facts) => R.validateSide({ k: 'fx', msg: 'm1', at, src: 'recheck', facts }).side;
ok(Rev.recalledAtOf([fx(T - 30e3, Rev.recallFacts()), fx(T - 10e3, Rev.recallFacts()), fx(T - 50e3, Rev.editFacts(T - 60e3))]) === T - 30e3 && Rev.recalledAtOf([fx(T, Rev.editFacts(T))]) === null, 'recalledAt = the EARLIEST recall learned; an edit is no recall');
ok(Rev.editedAtOf(Rev.editFacts(T - 5)) === T - 5 && Rev.editedAtOf([]) === 0, 'editedAtOf reads the folded edit instant');
// RED control: a fold that overwrote the original (the newest text in place of the record's) is caught by the same check
const overwrite = (r, xs) => [{ at: r.at, text: xs.length ? xs[xs.length - 1].text : r.text, original: true }];
ok(overwrite(rec, [rv(T - 60e3, 'third words')])[0].text !== 'first words', 'RED CONTROL: an overwriting fold loses the original — the leg above would be red on it');

console.log('② the record\'s rv line');
const big = 'x'.repeat(9000);
const vb = R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', editedAt: T, text: big, blocks: [{ k: 'p', runs: [{ k: 't', text: big }] }] });
ok(gateOf(vb.ok) && !vb.side.blocks && vb.side.truncated === true && Buffer.byteLength(JSON.stringify(vb.side)) <= R.SIDE_LINE_MAX_BYTES, 'a version past the line bound drops its tree first, then cuts the text (truncated) — the line stays ≤ 8 KiB', J({ ok: vb.ok, bytes: vb.ok && Buffer.byteLength(JSON.stringify(vb.side)) }));
ok(!R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', text: 'x' }).ok && !R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', editedAt: T }).ok, 'a version without its instant or its text is refused by name', J([R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', text: 'x' }).code]));
ok(R.sideKey(rv(T - 60e3, 'a')) === R.sideKey(rv(T - 60e3, 'a')) && R.sideKey(rv(T - 60e3, 'a')) !== R.sideKey(rv(T - 61e3, 'a')), 'one version per instant (a re-learned edit is a no-op by its key)');
ok(gateOf(R.SIDE_KINDS.includes('rv')) && Rev.compactVersionLines(Array.from({ length: 30 }, (_, i) => rv(T - (30 - i) * 1000, `v${i}`))).length === Rev.VERSIONS_KEPT, `the store's trim keeps the newest ${Rev.VERSIONS_KEPT} versions`);

console.log('③ the recheck plan');
const it = (key, at, o = {}) => ({ key, at, ...o });
const items = [it('c\na', T - 2 * H), it('c\nb', T - 23 * H), it('c\nold', T - 25 * H), it('c\nwoke', T - 3 * 24 * H, { wokeAt: T - 2 * 24 * H }), it('c\nwokeOld', T - 9 * 24 * H, { wokeAt: T - 8 * 24 * H }), it('c\ngone', T - H, { recalled: true })];
const p1 = Rev.planRecheck({ now: T, items });
ok(p1.join() === 'c\nwoke,c\na,c\nb'.replace(/\\n/g, '\n'), 'windows: < 24 h fresh, a woken-for message for 7 d (first), never past them; a recalled message is done', J(p1));
ok(Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 30 * 60e3]]) }).join() === ['c\nwoke', 'c\nb'].join(), 'cadence: at most one request per message per hour');
ok(gateOf(Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 30e3]]), forced: true }).includes('c\na')) && !Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 2e3]]), forced: true }).includes('c\na'), `the owner's Refresh re-asks after ${Rev.RECHECK_FORCED_MS / 1000} s (never a flood)`);
// B-dfa4 cure (the verdict's should): the plan's order is TOTAL — the key decides an exact tie (no woke, never checked,
// the same instant), so the rows' read order (the engine's kept fresh set since B-dfa4 U3) never changes what is picked
{
  const tie = Array.from({ length: Rev.RECHECK_PER_PASS + 4 }, (_, i) => it(`c\nt${String(i).padStart(2, '0')}`, T - 60e3));
  const fwd = Rev.planRecheck({ now: T, items: tie }), back = Rev.planRecheck({ now: T, items: tie.slice().reverse() });
  ok(fwd.length === Rev.RECHECK_PER_PASS && fwd.join() === back.join() && fwd.join() === tie.slice(0, Rev.RECHECK_PER_PASS).map((x) => x.key).join(), 'B-dfa4 cure: an exact tie is picked by key — the same items read in either order pick the same ones', J({ fwd, back }));
  const RSRC = fs.readFileSync(path.join(REPO, 'src/channel-revisions.js'), 'utf8');
  const KEYED = " || (b.at - a.at) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));";
  ok(RSRC.split(KEYED).length === 2, 'control setup: the plan\'s key tiebreak is present once');
  const Old = mutantCopies('rev-tiebreak', REPO).load('src/channel-revisions.js', editAnchor(RSRC, KEYED, ' || (b.at - a.at));', "src/channel-revisions.js"), 'no-tiebreak');   // stale-pins: kept (the old sort, restored by the red control)
  const of = Old.planRecheck({ now: T, items: tie }), ob = Old.planRecheck({ now: T, items: tie.slice().reverse() });
  ok(of.join() !== ob.join(), 'RED CONTROL: without the key the read order decides the tie — the leg above is red on it', J({ of, ob }));
}
const many = Array.from({ length: 50 }, (_, i) => it(`c\nm${i}`, T - i * 60e3));
ok(Rev.planRecheck({ now: T, items: many }).length === Rev.RECHECK_PER_PASS && Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR - 3).fill(T - 60e3) }).length === 3 && Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR).fill(T - 60e3) }).length === 0, `budget: ≤ ${Rev.RECHECK_PER_PASS} a pass, ≤ ${Rev.RECHECK_PER_HOUR} an account-hour (the sliding hour)`);
ok(Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR).fill(T - H - 1) }).length === Rev.RECHECK_PER_PASS, 'spent instants older than the hour free their room');
// RED control: a plan without the hour gap asks the same message every pass
const noGap = (o) => Rev.planRecheck({ ...o, last: new Map() });
ok(verdictOf(noGap({ now: T, items, last: new Map([['c\na', T - 60e3]]) }).includes('c\na')), 'RED CONTROL: a plan that ignores `last` re-asks a message a minute later — the cadence leg is red on it');

console.log('④ the capability row per adapter');
const mods = { lark: require(path.join(REPO, 'src/channels/lark.js')), slack: require(path.join(REPO, 'src/channels/slack.js')), gmail: require(path.join(REPO, 'src/channels/gmail.js')), webhook: require(path.join(REPO, 'src/channels/webhook.js')), agents: require(path.join(REPO, 'src/channels/agents.js')) };
const rowOf = (m) => CH.revisionsOf((m.adapter || m).caps);
ok(J(rowOf(mods.lark)) === J({ recall: true, edit: true, how: 'byid' }) && J(rowOf(mods.slack)) === J({ recall: true, edit: true, how: 'absent' }), 'Lark answers by id; Slack by absence (a deleted message vanishes)');
ok(verdictOf(['gmail', 'webhook', 'agents'].every((k) => rowOf(mods[k]).how === 'none' && !rowOf(mods[k]).recall && !rowOf(mods[k]).edit)), 'Gmail / webhook / agents: revisions none — nothing is rechecked');
ok(CH.revisionsOf({}).how === 'none' && !CH.METHOD_GATES.revisionOf({}) && verdictOf(CH.METHOD_GATES.revisionOf({ revisions: { recall: true, edit: false, how: 'absent' } })), 'a missing row fails closed (none); the method is declared by the row');
const bad = (rv2) => { try { CH.validateCaps('webhook', { ...(mods.webhook.adapter || mods.webhook).caps, revisions: rv2 }); return null; } catch (e) { return e.message; } };
ok(gateOf(/how must be/.test(bad({ recall: true, edit: true, how: 'poll' }) || '')) && gateOf(/never be learned/.test(bad({ recall: true, edit: false, how: 'none' }) || '')) && verdictOf(/learns nothing/.test(bad({ recall: false, edit: false, how: 'byid' }) || '')), 'a broken row is refused by name at load', J([bad({ how: 'poll', recall: true, edit: true })]));

console.log('⑤ the registry wrapper normalizes the answer');
const mkMod = (answer, revisions = { recall: true, edit: true, how: 'byid' }) => {
  const base = (mods.webhook.adapter || mods.webhook);
  return { ...base, kind: 'rv-test', caps: { ...base.caps, kind: 'rv-test', revisions }, create: (rec, deps) => ({ ...base.create(rec, deps), revisionOf: async () => answer }) };
};
const wrap = async (answer, revisions) => { const reg = CH.createChannelRegistry(); const m = mkMod(answer, revisions); reg.register(m); const a = reg.create('rv-test', { id: 'rv-test', options: {} }, { now: () => T, log: { warn() {}, log() {} } }); return a.revisionOf('c', { messageId: 'm1' }); };
const w1 = await wrap({ state: 'edited', editedAt: T, text: 'new', blocks: 'nope', extra: 'x' });
const w2 = await wrap({ state: 'edited', editedAt: 'soon', text: 'new' });
const w3 = await wrap({ state: 'bogus' });
const w4 = await wrap({ state: 'recalled' }, { recall: false, edit: true, how: 'byid' });
ok(J(w1) === J({ state: 'edited', editedAt: T, text: 'new', blocks: null }) && w2.state === 'unknown' && w3.state === 'unknown' && w4.state === 'unknown', 'closed states, a finite time or no edit, no stray field, a recall the row does not declare is unknown', J([w1, w2, w3, w4]));

console.log('⑥ the agent\'s words');
const line = Rev.agentRevisionLine({ recalledAt: T, versions: [{}, {}, {}] }, { iso: () => 'T' });
ok(line === '[recalled at T — the content below is the kept copy] [edited: v3 of 3; --versions shows all]' && Rev.agentRevisionLine({}) === '', 'recalled over the kept content; edited with the --versions hint; nothing learned = no line', line);
const note = Rev.recallNoteText({ account: 'Lark', conversation: 'Ops', at: T }, { iso: () => 'T' });
ok(gateOf(/delivered to you at T \(Lark \/ Ops\) was recalled/.test(note)) && !/woken/.test(note) && !/\n/.test(note), 'the ONE next-turn note: our words, the time, the place — one line; "delivered", never "woken for" (every road)', note);


console.log('⑦ the ENGINE leg (B-e8e1): the woken-for recall note over the REAL engine and the fake adapter');
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const ROOT = scratchDir('chan-revisions');
const MUT = mutantCopies('chan-revisions', REPO);
const A = 'fake-poll', OPS = 'fake-poll-ops', ANN = 'fake-poll-announce';
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' };
const acc = (p) => ({ principal: p, authority: 'draft' });
const NOTE_FROM = 'Channels · recalls';
function dayStartClock() { const t0 = Date.now(); const day0 = Math.floor(t0 / 86400e3) * 86400e3 + 60e3; let skew = 0; const f = () => day0 + (Date.now() - t0) + skew; f.advance = (ms) => { skew += ms; }; return f; }
/** One engine over `dataDir` (a restart = a second one over the same dir, the same clock): the fake answers a stored
 *  message by id from its revisions file; every by-id ask is counted; the stub ladder delivers, the stub stash keeps. */
function mkEngine(ENGM, dataDir, { clock = dayStartClock(), refuse = false, roster = null, readMembership = null, log = null, heldBound = null, gate = null, answer = null, stashThrows = null, onTakeWait = null } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const REVS = path.join(dataDir, 'revisions.json');
  if (!fs.existsSync(REVS)) fs.writeFileSync(REVS, J({ revisions: {} }));
  const delivered = [], stashed = [], asked = [], refused = [], starts = [];
  const deliver = {
    // `refuse`: the ladder says no (the spend cap) — the engine stashes the refused block for the next turn
    // B-1ca5: `starts` = every ladder call (a billed turn's START); `gate(k)` = a promise the k-th call waits on (a STALL placed in
    // the window), `answer(k)` = a planted refusal for the k-th call, `stashThrows(cid, e)` = a planted stash failure
    deliverToConversation: async (cid, text, o) => { const k = starts.length; starts.push({ cid, text }); const g = gate ? gate(k) : null; if (g) await g; const a = answer ? answer(k) : null; if (a) { refused.push({ cid, text, o }); return a; } if (refuse) { refused.push({ cid, text, o }); return { ok: false, reason: 'the spend cap is reached', refused: 'cap' }; } delivered.push({ cid, text, o }); return { ok: true, lane: 'message' }; },
    stashFor: (cid, e) => { if (stashThrows && stashThrows(cid, e)) throw new Error('the stash refused (planted)'); stashed.push({ cid, ...e }); return { stored: true }; },
  };
  const registry = CH.createChannelRegistry();
  const fk = FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'], now: clock, revisionsFile: REVS });
  const mk0 = fk.create;
  fk.create = (record, deps) => { const a = mk0(record, deps); const by = a.revisionOf; a.revisionOf = (convId, o) => { asked.push(o && o.messageId); return by(convId, o); }; return a; };
  registry.register(fk);
  const eng = ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir, now: clock }), deliver, now: clock, log: log || { log() {}, warn() {}, error() {} }, liveSessions: () => (roster ? roster() : [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }]), readMembership, ...(heldBound ? { heldBound } : {}), ...(onTakeWait ? { onTakeWait } : {}) });
  const recall = (...vids) => { const j = JSON.parse(fs.readFileSync(REVS, 'utf8')); for (const v of vids) j.revisions[v] = { state: 'recalled' }; fs.writeFileSync(REVS, J(j)); };
  const tail = (c) => { const m = eng.messages(A, c, { limit: 5 }); return m.records || m; };
  const recOf = () => eng.adapterRecords().adapters.find((r) => r.id === A);
  const woke = (c) => ((eng.store.index.live()[`${A}/${c}`] || {}).wokeFor || []);
  const recalled = (c, vid) => !!Rev.recalledAtOf(eng.store.readSide(A, c, { msgs: new Set([vid]) }).filter((x) => x && x.k === 'fx'));
  const notes = () => stashed.filter((x) => x.fromName === NOTE_FROM);
  const blocks = () => stashed.filter((x) => x.fromName !== NOTE_FROM);   // the message blocks themselves (a stashed refusal, the free stash)
  // the cadence is one by-id ask per message per hour: the next pass an hour on re-reads what a wake carried
  const hourLater = async () => { clock.advance(61 * 60e3); return eng.pass(A, { force: true }); };
  return { eng, clock, delivered, refused, stashed, asked, starts, recall, tail, recOf, woke, recalled, notes, blocks, hourLater };
}
const iso = (ms) => new Date(ms).toISOString();

// ⑦a a wake carried two messages of the Ops room to agent-1; one of them, a message of the same room nobody was woken
// for, and one of a room nobody watches are recalled
async function directLeg(ENGM, tag) {
  const dataDir = path.join(ROOT, tag);
  const w = mkEngine(ENGM, dataDir);
  await w.eng.pass(A, { force: true });
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(AGENT)], watchers: [{ principal: AGENT }] });
  const [m6, m7, m8] = w.tail(OPS).slice(-3);
  const n8 = w.tail(ANN).slice(-1)[0];
  await w.eng.onFresh(w.recOf(), OPS, [m7, m8], { origin: 'test' });
  const rows = w.woke(OPS).map((x) => ({ ...x }));
  w.recall(m7.vendorId, m6.vendorId, n8.vendorId);
  await w.hourLater();
  const first = w.notes().map((x) => ({ ...x }));
  const marked = [w.recalled(OPS, m7.vendorId), w.recalled(OPS, m6.vendorId), w.recalled(ANN, n8.vendorId)];
  await w.hourLater();
  const second = w.notes().length;
  const askedAgain = w.asked.slice(-20);
  await w.eng.stop();
  // a RESTART over the same data: the in-memory "this one is done" is gone, so the woken-for row asks again (7 d)
  const w2 = mkEngine(ENGM, dataDir, { clock: w.clock });
  await w2.hourLater();
  const restart = { asked: w2.asked.includes(m7.vendorId), notes: w2.notes().length, noted: w2.woke(OPS).filter((x) => x.vid === m7.vendorId).every((x) => x.noted === true) };
  await w2.eng.stop();
  return { delivered: w.delivered.map((d) => d.cid), rows, first, marked, second, askedAgain, restart, m7, wakeAt: (rows.find((x) => x.vid === m7.vendorId) || {}).at, stashedTo: [...new Set([...w.stashed, ...w2.stashed].map((x) => x.cid))] };
}
const d1 = await directLeg(ENG, 'direct');
ok(J(d1.delivered) === J(['agent-1']) && d1.rows.length === 2 && gateOf(d1.rows.every((x) => x.cid === 'agent-1' && Number(x.at) > 0)) && d1.rows.map((x) => x.vid).join() === [d1.m7.vendorId, 'fake-poll-ops-m8'].join(), 'the wake: ONE delivery to agent-1, the woken-for ledger names both messages it carried, to whom, when', J({ delivered: d1.delivered, rows: d1.rows }));
const n1 = d1.first[0] || {};
ok(d1.first.length === 1 && n1.cid === 'agent-1' && n1.source === 'channel' && n1.kind === 'notification', 'the recall of a message the wake carried: exactly ONE note, stashed (the free lane, never a wake) for the conversation it woke', J(d1.first.map((x) => [x.cid, x.fromName, x.kind])));
ok(gateOf(/was recalled by its sender/.test(n1.text || '')) && gateOf((n1.text || '').includes(iso(d1.wakeAt))) && gateOf(/Ops room/.test(n1.text || '')) && !(n1.text || '').includes(String(d1.m7.text || '').slice(0, 24)) && !(n1.text || '').includes(d1.m7.vendorId), 'the note names the revision (recalled), the wake\'s time and the room — never the message\'s text or id', n1.text);
ok(gateOf(d1.marked.every(Boolean)) && d1.first.length === 1, 'a recall nobody was woken for (the same room\'s other message, a room nobody watches) is marked on its row — and adds NO note', J(d1.marked));
ok(d1.second === 1 && !d1.askedAgain.includes(d1.m7.vendorId), 'a second pass an hour on: the recalled message is done (never re-asked), still one note', J({ second: d1.second }));
ok(gateOf(d1.restart.asked) && d1.restart.notes === 0 && verdictOf(d1.restart.noted), 'after a restart the woken-for row re-asks the message, learns the recall AGAIN — and adds nothing (the record already says it; the row is marked noted on disk)', J(d1.restart));
ok(J(d1.stashedTo) === J(['agent-1']), 'nobody else hears anything (agent-2 was never woken)', J(d1.stashedTo));
{ // RED CONTROL: the recheck without its note call — the legs above go red
  const src = engineSource(REPO);
  const cut = src.replace('        await noteRecall(rec, convId, vid);\n', '');
  const c1 = await directLeg(MUT.load('src/server/channels-engine.js', cut, 'no-note'), 'direct-c');
  ok(cut !== src && c1.first.length === 0 && verdictOf(c1.marked[0]), 'CONTROL: an engine whose recheck never calls the note path marks the recall and stashes NOTHING — the ONE-note leg is red on it', J({ notes: c1.first.length }));
}

// ⑦b the same message carried to the same conversation twice (a re-delivery five minutes on)
// (B-43bc fourth cure, L1 RESTATED 2026-11-19: one message starts at most ONE billed turn to one RECEIVING conversation,
// whichever watcher row carries it — the second watcher of the same agent, the group it is a member of, hands NOTHING more.
// Two ledger rows for one message in one conversation still live in a STORED ledger written before that law: the leg
// plants the second row, and the recall is still ONE note, the first time)
async function twiceLeg(ENGM, tag) {
  const w = mkEngine(ENGM, path.join(ROOT, tag), { roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }] });
  await w.eng.pass(A, { force: true });
  const GRP0 = { kind: 'group', id: 'G' };
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(AGENT), acc(GRP0)], watchers: [{ principal: AGENT }] });
  const m8 = w.tail(OPS).slice(-1)[0];
  await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
  w.clock.advance(5 * 60e3);
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(AGENT), acc(GRP0)], watchers: [{ principal: GRP0 }] });
  await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });   // the group's round-robin picks agent-1: it has m8 — nothing handed
  const handedTwice = w.delivered.length;
  // the stored ledger of an older release: a second row for m8 in this conversation, five minutes on
  await w.eng.store.index.update(() => { const e2 = w.eng.store.index.entry(A, OPS, { create: false }); const r0 = e2 && (e2.wokeFor || []).find((x) => x && x.vid === m8.vendorId); if (r0) e2.wokeFor.push({ ...r0, at: Number(r0.at) + 5 * 60e3 }); }, { durable: true });
  const rows = w.woke(OPS).filter((x) => x.vid === m8.vendorId).map((x) => x.at);
  w.recall(m8.vendorId);
  await w.hourLater();
  const out = { wakes: w.delivered.length, handedTwice, rows, notes: w.notes().map((x) => x.text) };
  await w.eng.stop();
  return out;
}
const t1 = await twiceLeg(ENG, 'twice');
ok(t1.handedTwice === 1 && t1.wakes === 1 && t1.rows.length === 2 && t1.notes.length === 1 && verdictOf(t1.notes[0].includes(iso(Math.min(...t1.rows)))), 'a SECOND watcher of the same agent hands it nothing more (one wake: the receiver\'s mark); a stored ledger with TWO rows for that message (an older release\'s) still recalls ONE note — the first row\'s time', J(t1));
{
  const src = engineSource(REPO);
  const cut = src.replace('if (!due.some((d) => d.cid === w.cid)) due.push({ cid: w.cid, at: w.at });', 'due.push({ cid: w.cid, at: w.at });');
  const c2 = await twiceLeg(MUT.load('src/server/channels-engine.js', cut, 'per-row'), 'twice-c');
  ok(cut !== src && c2.notes.length === 2, 'CONTROL: a note per ledger ROW (the .262 loop) tells that conversation twice', J({ notes: c2.notes.length }));
}

// ⑦c a SCOPE DIGEST (an account-grain digest watcher): one block for two rooms; both messages recalled
async function digestLeg(ENGM, tag) {
  const w = mkEngine(ENGM, path.join(ROOT, tag));
  await w.eng.pass(A, { force: true });
  await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
  const o = w.tail(OPS).slice(-1)[0], a = w.tail(ANN).slice(-1)[0];
  await w.eng.onFresh(w.recOf(), OPS, [o], { origin: 'test' });
  await w.eng.onFresh(w.recOf(), ANN, [a], { origin: 'test' });
  const held = w.delivered.length;
  const f = await w.eng.flushScope(A, 'account', null, 'agent:agent-1');
  const rows = [OPS, ANN].map((c) => w.woke(c).map((x) => `${x.vid}>${x.cid}`).join());
  w.recall(o.vendorId, a.vendorId);
  await w.hourLater();
  const out = { held, flushed: { ok: f.ok, conversations: f.conversations, cid: f.cid }, delivered: w.delivered.length, rows, want: [`${o.vendorId}>agent-1`, `${a.vendorId}>agent-1`], notes: w.notes().map((x) => [x.cid, x.text]) };
  await w.eng.stop();
  return out;
}
const g1 = await digestLeg(ENG, 'digest');
ok(g1.held === 0 && gateOf(g1.flushed.ok) && g1.flushed.conversations === 2 && g1.flushed.cid === 'agent-1' && g1.delivered === 1, 'the digest window held both rooms\' hits, then ONE scope digest carried two conversations to agent-1', J(g1));
ok(J(g1.rows) === J(g1.want), 'the woken-for ledger of EVERY conversation the digest carried names its message and the conversation it woke (was: none — single-conversation wakes only)', J({ rows: g1.rows, want: g1.want }));
ok(g1.notes.length === 2 && gateOf(g1.notes.every(([cid]) => cid === 'agent-1')) && gateOf(g1.notes.some(([, x]) => /Ops room/.test(x))) && verdictOf(g1.notes.some(([, x]) => /Announcements/.test(x))), 'both recalls after the digest: ONE note each, to the conversation the digest woke, naming its room', J(g1.notes));
{
  const src = engineSource(REPO);
  const line = '          noteDelivered(e2, h.carried.hits, target.cid, t, pk, !!(ok || stashKept));';
  const cut = src.split('\n').filter((l) => !l.startsWith(line)).join('\n');
  const c3 = await digestLeg(MUT.load('src/server/channels-engine.js', cut, 'no-digest-ledger'), 'digest-c');
  ok(cut !== src && c3.delivered === 1 && gateOf(c3.rows.every((r) => r === '')) && c3.notes.length === 0, 'CONTROL: the digest without its ledger rows (the .262 engine) — delivered, recalled, and NOT ONE note', J({ rows: c3.rows, notes: c3.notes.length }));
}

// ⑦d–⑦g (lane channel-recall-ledger, B-70d2): THE LEDGER DOOR ON EVERY ROAD — a message that reached a conversation
// is remembered there whichever road carried it, so its recall is noted there once
const AGENT2 = { kind: 'agent', id: 'agent-2', name: 'Other' };
const rowsOf = (w, c) => w.woke(c).map((x) => `${x.vid}>${x.cid}`);
const legTable = [];

// ⑦d the wake ROAD refused (the spend cap): the block is stashed for the next turn — a delivery all the same
async function refusedLeg(ENGM, tag) {
  const w = mkEngine(ENGM, path.join(ROOT, tag), { refuse: true });
  await w.eng.pass(A, { force: true });
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(AGENT)], watchers: [{ principal: AGENT }] });
  const m8 = w.tail(OPS).slice(-1)[0];
  await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
  const rows = rowsOf(w, OPS);
  w.recall(m8.vendorId);
  await w.hourLater();
  await w.hourLater();
  const out = { refused: w.refused.map((x) => x.cid), delivered: w.delivered.length, blocks: w.blocks().map((x) => x.cid), rows, want: [`${m8.vendorId}>agent-1`], notes: w.notes().map((x) => x.cid) };
  await w.eng.stop();
  return out;
}
const r1 = await refusedLeg(ENG, 'refused');
ok(J(r1.refused) === J(['agent-1']) && r1.delivered === 0 && J(r1.blocks) === J(['agent-1']) && J(r1.rows) === J(r1.want), 'a REFUSED wake (the spend cap) whose block was stashed: the ledger names the message and the conversation it reached', J(r1));
ok(J(r1.notes) === J(['agent-1']), 'its recall: ONE note to that conversation, two passes on', J(r1.notes));
legTable.push(['a refused wake, stashed (wakeNow)', r1.notes.length]);

// ⑦e the FREE next-turn stash (a next-turn watch — the agent's own default): no billed turn, and now a ledger row
async function nextTurnLeg(ENGM, tag) {
  const dataDir = path.join(ROOT, tag);
  const w = mkEngine(ENGM, dataDir);
  await w.eng.pass(A, { force: true });
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, delivery: 'next-turn' }] });
  const [m6, m7, m8] = w.tail(OPS).slice(-3);
  await w.eng.onFresh(w.recOf(), OPS, [m7, m8], { origin: 'test' });
  const rows = rowsOf(w, OPS);
  w.recall(m7.vendorId, m6.vendorId);
  await w.hourLater();
  const first = w.notes().map((x) => ({ cid: x.cid, text: x.text }));
  const marked = [w.recalled(OPS, m7.vendorId), w.recalled(OPS, m6.vendorId)];
  await w.hourLater();
  const second = w.notes().length;
  const out = { billed: w.delivered.length, blocks: w.blocks().map((x) => x.cid), rows, want: [`${m7.vendorId}>agent-1`, `${m8.vendorId}>agent-1`], first, marked, second };
  await w.eng.stop();
  const w2 = mkEngine(ENGM, dataDir, { clock: w.clock });
  await w2.hourLater();
  out.restart = { asked: w2.asked.includes(m7.vendorId), notes: w2.notes().length };
  await w2.eng.stop();
  return out;
}
const e1 = await nextTurnLeg(ENG, 'next-turn');
ok(e1.billed === 0 && J(e1.blocks) === J(['agent-1']) && J(e1.rows) === J(e1.want), 'the FREE next-turn stash: no billed turn, ONE stashed block — and the ledger names both messages it handed (was: no row)', J(e1));
ok(e1.first.length === 1 && e1.first[0].cid === 'agent-1' && gateOf(/was recalled by its sender/.test(e1.first[0].text)) && gateOf(/Ops room/.test(e1.first[0].text)) && verdictOf(e1.marked.every(Boolean)), 'its recall: exactly ONE note to the conversation the stash reached; the recall nobody was handed is marked and adds nothing', J({ first: e1.first, marked: e1.marked }));
ok(e1.second === 1 && gateOf(e1.restart.asked) && e1.restart.notes === 0, 'a re-check an hour on and a restart (the 7 d row re-asks it): still ONE note', J({ second: e1.second, restart: e1.restart }));
legTable.push(['the free next-turn stash (stashHits)', e1.first.length]);
{ // RED CONTROL: the free stash without its door (= f57d1cbe9) — no row, so the recall tells nobody
  const src = engineSource(REPO);
  const cut = src.replace('if (e2) noteDelivered(e2, fresh, target.cid, now(), pk, !!durableS);', 'if (e2) void e2;');
  const c4 = await nextTurnLeg(MUT.load('src/server/channels-engine.js', cut, 'no-stash-door'), 'next-turn-c');
  ok(cut !== src && J(c4.blocks) === J(['agent-1']) && c4.rows.length === 0 && c4.first.length === 0 && verdictOf(c4.marked[0]), 'CONTROL: the free stash without the ledger door (the base engine) — handed, recalled, marked, and NOT ONE note', J({ rows: c4.rows, notes: c4.first.length }));
}

// ⑦f ONE message reaching TWO conversations by two roads (agent-1's next-turn watch, agent-2's wake) — and one nobody got
async function mixedLeg(ENGM, tag) {
  const w = mkEngine(ENGM, path.join(ROOT, tag));
  await w.eng.pass(A, { force: true });
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(AGENT), acc(AGENT2)], watchers: [{ principal: AGENT, delivery: 'next-turn' }, { principal: AGENT2 }] });
  const [m6, m8] = [w.tail(OPS).slice(-3)[0], w.tail(OPS).slice(-1)[0]];
  await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
  const rows = rowsOf(w, OPS).sort();
  w.recall(m8.vendorId, m6.vendorId);
  await w.hourLater();
  await w.hourLater();
  const out = { billed: w.delivered.map((x) => x.cid), blocks: w.blocks().map((x) => x.cid), rows, want: [`${m8.vendorId}>agent-1`, `${m8.vendorId}>agent-2`], notes: w.notes().map((x) => x.cid).sort() };
  await w.eng.stop();
  return out;
}
const x1 = await mixedLeg(ENG, 'mixed');
ok(J(x1.billed) === J(['agent-2']) && J(x1.blocks) === J(['agent-1']) && J(x1.rows) === J(x1.want), 'one message, two roads: agent-2 woken (billed), agent-1 handed it on its next turn (free) — one ledger row per conversation it reached', J(x1));
ok(J(x1.notes) === J(['agent-1', 'agent-2']), 'its recall: ONE note to EACH conversation that holds it, whichever road; the recall nobody got adds nothing', J(x1.notes));

// ⑦g a CHATTY next-turn watch beside an older wake: 45 handed to agent-2 after one wake of agent-1 — the bound (40)
// is fair, so agent-1's row stays and its recall is still noted (the newest-40 bound pushed it out)
async function capLeg(ENGM, tag) {
  const w = mkEngine(ENGM, path.join(ROOT, tag));
  await w.eng.pass(A, { force: true });
  const access = [acc(AGENT), acc(AGENT2)];
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access, watchers: [{ principal: AGENT }] });
  const m8 = w.tail(OPS).slice(-1)[0];
  await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access, watchers: [{ principal: AGENT2, delivery: 'next-turn' }] });
  const flood = Array.from({ length: 45 }, (_, i) => ({ ...m8, id: `${m8.id}-f${i}`, vendorId: `${m8.vendorId}-f${i}`, at: Number(m8.at) - (i + 1) * 60e3 }));
  await w.eng.onFresh(w.recOf(), OPS, flood, { origin: 'test' });
  const rows = w.woke(OPS);
  const per = { a1: rows.filter((x) => x.cid === 'agent-1').length, a2: rows.filter((x) => x.cid === 'agent-2').length, kept: rows.some((x) => x.vid === m8.vendorId && x.cid === 'agent-1') };
  w.recall(m8.vendorId);
  // ≤ 12 by-id asks a pass, never-checked first: the 39 handed rows go before m8 (asked at the first pass) — 4 passes
  for (let i = 0; i < 5; i++) await w.hourLater();
  const out = { blocks: w.blocks().map((x) => x.cid), n: rows.length, per, notes: w.notes().map((x) => x.cid) };
  await w.eng.stop();
  return out;
}
const k1 = await capLeg(ENG, 'cap');
ok(J(k1.blocks) === J(['agent-2']) && k1.n === 40 && k1.per.a1 === 1 && k1.per.a2 === 39 && verdictOf(k1.per.kept), 'a chatty next-turn watch (45 handed) beside one older wake: the ledger holds 40 — the chatty conversation lost its oldest, the wake\'s row stayed', J(k1));
ok(J(k1.notes) === J(['agent-1']), 'and the recall of the waking message is still noted to the conversation it woke', J(k1.notes));
{ // RED CONTROL: the newest-40 bound (the base door) pushes the wake's row out — its recall tells nobody
  const src = engineSource(REPO);
  const cut = src.replace('    en.wokeFor = Rev.capWokeRows(prev, WOKE_FOR_MAX, pend);\n', '    en.wokeFor = prev.slice(-WOKE_FOR_MAX);\n');   // B-1ca5's remainder: the cap now protects rows whose message still has a pending row
  const c5 = await capLeg(MUT.load('src/server/channels-engine.js', cut, 'newest-40'), 'cap-c');
  ok(cut !== src && !c5.per.kept && c5.notes.length === 0, 'CONTROL: the newest-40 bound drops the older wake\'s row under the chatty watch — and its recall adds NO note', J({ per: c5.per, notes: c5.notes }));
}
// ⑦h lane stash-pending-live: THE CARRY — a group's hit parked while none of its members ran (no road reached anyone, so
// no row) is carried to the first member that comes back, by its next hit or by its own turn (`carryParked`); the
// ledger door takes the carried message ONCE for that member (two asks in one tick hand it over once), so its recall
// is noted ONCE. The control is the engine without the hit's carry (d035f7cfa): the parked message reaches nobody
// before a boot — no row, and its recall is noted to no one.
const GRP = { kind: 'group', id: 'g-team', name: 'Team' };
async function carryLeg(ENGM, tag, how) {
  let live = [];
  const w = mkEngine(ENGM, path.join(ROOT, tag), { roster: () => live });
  await w.eng.pass(A, { force: true });
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP, delivery: 'next-turn' }] });
  const [m7, m8] = w.tail(OPS).slice(-2);
  await w.eng.onFresh(w.recOf(), OPS, [m7], { origin: 'test' });   // nobody live ⇒ parked on the next-turn road
  const parked = ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).length;
  const rows0 = rowsOf(w, OPS);
  live = [{ cid: 'member-1', name: 'Member', groups: ['g-team'] }];   // the first member comes back
  if (how === 'hit') await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
  else { w.eng.carryParked('member-1'); w.eng.carryParked('member-1'); }   // SessionStart + a prompt, one tick
  await w.eng.settleWakes();
  const rows = rowsOf(w, OPS);
  w.recall(m7.vendorId);
  await w.hourLater();
  await w.hourLater();
  const out = { parked, rows0, rows, want: [`${m7.vendorId}>member-1`, ...(how === 'hit' ? [`${m8.vendorId}>member-1`] : [])], billed: w.delivered.length, blocks: w.blocks().map((x) => x.cid), notes: w.notes().map((x) => x.cid) };
  await w.eng.stop();
  return out;
}
const h1 = await carryLeg(ENG, 'carry-hit', 'hit');
ok(h1.parked === 1 && h1.rows0.length === 0 && h1.billed === 0 && J(h1.blocks) === J(['member-1']) && J(h1.rows) === J(h1.want), 'the CARRY by a hit: parked (no row), then ONE block hands the parked + the fresh message to the member back — a ledger row for each, billed 0', J(h1));
ok(J(h1.notes) === J(['member-1']), 'the carried message recalled: ONE note to the member it was carried to', J(h1.notes));
const h2 = await carryLeg(ENG, 'carry-turn', 'turn');
ok(h2.parked === 1 && h2.billed === 0 && J(h2.blocks) === J(['member-1']) && J(h2.rows) === J(h2.want), 'the CARRY by the member\'s own turn (asked twice in one tick): ONE block, ONE ledger row, billed 0', J(h2));
ok(J(h2.notes) === J(['member-1']), '…and its recall: ONE note', J(h2.notes));
legTable.push(['a parked hit carried by the next hit (stashHits carry)', h1.notes.length], ['a parked hit carried by the member\'s turn (carryParked)', h2.notes.length]);
{ // RED CONTROL: the engine without the hit's carry (d035f7cfa) — the parked message reached nobody, so no note
  const src = engineSource(REPO);
  const DEFER = "    if (!fromPending && !carry && !stopped && parkedNextTurn(en, w, pk)) return billedWake({ conv: `${rec.id}/${convId}` }, () => stashHits(rec, convId, hits, { item, pk, batch, carry: true, prefer }));\n";
  const cut = src.replace(DEFER, '');
  const c6 = await carryLeg(MUT.load('src/server/channels-engine.js', cut, 'no-carry'), 'carry-hit-c', 'hit');
  ok(cut !== src && J(c6.rows) === J([`${c6.want[1].split('>')[0]}>member-1`]) && c6.notes.length === 0, 'CONTROL: without the carry the parked message reaches nobody before a boot — no ledger row, and its recall is noted to NO ONE', J({ rows: c6.rows, notes: c6.notes }));
}
legTable.unshift(['a billed wake (wakeNow)', d1.first.length], ['a scope digest\'s carried hits (flushScopeNow), per conversation', g1.notes.length / 2]);
console.log('  the leg table — road → notes for one recalled message it carried:');
for (const [road, n] of legTable) console.log(`    ${road} → ${n}`);
ok(legTable.length === 6 && verdictOf(legTable.every(([, n]) => n === 1)), 'every road the ledger door serves gives exactly ONE note per (message, conversation)', J(legTable));

console.log('⑧ THE LEDGER DOOR CENSUS (B-70d2): every delivery call names the ONE door after its hand-over');
const acorn = require('acorn');
const DOOR = 'noteDelivered';
const ROAD_CALLS = new Set(['stashFor', 'deliverToConversation']);
const ARRAY_WRITES = new Set(['push', 'unshift', 'splice', 'pop', 'shift', 'fill', 'sort', 'reverse', 'copyWithin']);
/** `<file> › <function>` of a call that hands a conversation something that is NOT an inbound message — the only
 *  delivery calls without the door (each row must still name a call: a dead row is RED). */
const NOT_A_ROAD = {
  'channels-engine.js › reactionDigest': 'a reaction line on a message the AGENT sent — no inbound message reaches anyone',
  'channels-engine.js › noteRecall': 'the recall note itself — news about a message the ledger already holds',
  'channels-outbound.js › receiptNow': 'the Outbox receipt of a send from here — no inbound message',
  'channels-engine.js › noteSkips': 'lane judged-watch-state: the once-a-day not-a-hit line (a count + why) — it carries NO inbound message; what was skipped is owed and reaches the agent later through its own delivery road (onFresh → the ledger door)',
  'channel-api-cards.js › receiptFor': 'a raw-API proposal\'s receipt to the conversation that drafted it — no inbound message',
};
const ENGINE_SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
/** The engine + every src/server/channel*.js beside it (its families included, each under its own name). */
function censusFiles(engine = ENGINE_SRC) {
  const files = [{ name: 'channels-engine.js', src: engine }];
  for (const f of fs.readdirSync(path.join(REPO, 'src/server')).sort()) if (/^channels?-.*\.js$/.test(f) && f !== 'channels-engine.js') files.push({ name: f, src: fs.readFileSync(path.join(REPO, 'src/server', f), 'utf8') });
  return files;
}
/** Every delivery call (`.stashFor(` / `.deliverToConversation(`, any receiver) by its enclosing NAMED function. */
function ledgerCensus(files, notARoad = NOT_A_ROAD) {
  const roads = [], doors = [], writers = [], defs = [];
  for (const f of files) {
    const lineAt = (i) => f.src.slice(0, i).split('\n').length;
    const walk = (node, fn) => {
      if (Array.isArray(node)) { for (const x of node) walk(x, fn); return; }
      if (!node || typeof node.type !== 'string') return;
      let here = fn;
      if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && node.id) { here = node.id.name; if (here === DOOR) defs.push(f.name); }
      if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier' && node.init && /Function/.test(node.init.type)) { if (node.id.name === DOOR) defs.push(f.name); walk(node.init.params, node.id.name); walk(node.init.body, node.id.name); return; }
      if (node.type === 'CallExpression') {
        const c = node.callee.type === 'ChainExpression' ? node.callee.expression : node.callee;
        const name = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') ? c.property.name : null;
        if (ROAD_CALLS.has(name)) roads.push({ file: f.name, fn: here, via: name, at: node.start, line: lineAt(node.start) });
        if (name === DOOR && c.type === 'Identifier') doors.push({ file: f.name, fn: here, at: node.start });
        const o = c.type === 'MemberExpression' ? c.object : null;
        if (o && o.type === 'MemberExpression' && !o.computed && o.property.name === 'wokeFor' && ARRAY_WRITES.has(name)) writers.push({ file: f.name, fn: here, line: lineAt(node.start) });
      }
      if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && ((!node.left.computed && node.left.property.name === 'wokeFor') || (node.left.property.type === 'Literal' && node.left.property.value === 'wokeFor'))) writers.push({ file: f.name, fn: here, line: lineAt(node.start) });
      for (const k in node) { const v = node[k]; if (v && typeof v === 'object') walk(v, here); }
    };
    walk(acorn.parse(f.src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true }), null);
  }
  const red = [];
  const road = (r) => !Object.hasOwn(notARoad, `${r.file} › ${r.fn}`);
  for (const r of roads.filter(road)) if (!doors.some((d) => d.file === r.file && d.fn === r.fn && d.at > r.at)) red.push(`${r.file}:${r.line} ${r.fn || '(top level)'} hands over by ${r.via}( with no ${DOOR}( after it`);
  for (const k of Object.keys(notARoad)) if (!roads.some((r) => `${r.file} › ${r.fn}` === k)) red.push(`NOT_A_ROAD ${k} names no delivery call (a dead row)`);
  for (const w of writers) if (w.fn !== DOOR) red.push(`${w.file}:${w.line} ${w.fn || '(top level)'} writes wokeFor — only ${DOOR} may`);
  if (defs.length !== 1) red.push(`${DOOR} is defined ${defs.length} time(s), want 1`);
  return { red, roads: roads.filter(road), fns: [...new Set(roads.filter(road).map((r) => r.fn))].sort(), exempt: roads.filter((r) => !road(r)), writers };
}
const C0 = ledgerCensus(censusFiles());
console.log(`  census: ${C0.roads.length} delivery calls in ${C0.fns.length} roads (${C0.fns.join(', ')}) name ${DOOR}; ${C0.exempt.length} calls in ${Object.keys(NOT_A_ROAD).length} NOT_A_ROAD functions; ${C0.writers.length} wokeFor writer`);
ok(!C0.red.length && gateOf(C0.fns.includes('stashHits')) && gateOf(C0.fns.includes('wakeNow')) && gateOf(C0.fns.includes('flushScopeNow')) && C0.writers.length === 1, 'every delivery road (a billed / refused-and-stashed wake, the free stash, a scope digest) calls the ONE ledger door after its hand-over; the door is the only wokeFor writer', J({ red: C0.red, fns: C0.fns, writers: C0.writers }));
{ // RED CONTROLS: a planted road, the base free stash (no door), a dead NOT_A_ROAD row, a second wokeFor writer
  const src = ENGINE_SRC;
  const planted = src.replace('  async function stashHits(', "  async function plantedRoad(cid, hits) { deliver.stashFor(cid, { source: 'channel', kind: 'notification', fromName: 'Channels · planted', text: String(hits.length) }); }\n  async function stashHits(");
  const p1 = ledgerCensus(censusFiles(planted));
  ok(planted !== src && p1.red.length === 1 && verdictOf(/plantedRoad hands over by stashFor/.test(p1.red[0])), 'CONTROL: a PLANTED road (a new stashFor with no door) is RED by name', J(p1.red));
  const base = src.replace('if (e2) noteDelivered(e2, fresh, target.cid, now(), pk, !!durableS);', 'if (e2) void e2;');
  const p2 = ledgerCensus(censusFiles(base));
  ok(base !== src && p2.red.length === 1 && verdictOf(/stashHits hands over by stashFor/.test(p2.red[0])), 'CONTROL: the base engine\'s free stash (f57d1cbe9 — no door) is RED', J(p2.red));
  const p3 = ledgerCensus(censusFiles(), { ...NOT_A_ROAD, 'channels-engine.js › goneRoad': 'a road that no longer exists' });
  ok(p3.red.length === 1 && verdictOf(/goneRoad .*dead row/.test(p3.red[0])), 'CONTROL: a NOT_A_ROAD row naming no call is RED (a dead row)', J(p3.red));
  const second = src.replace('      if (!en || !Array.isArray(en.wokeFor)) return;\n', '      if (!en || !Array.isArray(en.wokeFor)) return;\n      en.wokeFor = en.wokeFor.filter(Boolean);\n');
  const p4 = ledgerCensus(censusFiles(second));
  ok(second !== src && p4.red.length === 1 && verdictOf(/noteRecall writes wokeFor/.test(p4.red[0])), 'CONTROL: a second wokeFor writer is RED', J(p4.red));
}

console.log('⑨ the ledger\'s key and its FAIR bound (PURE)');
ok(Rev.wokeKeyOf('om_1') === 'om_1' && Rev.wokeKeyOf(42) === '42' && Rev.wokeKeyOf('') === null && Rev.wokeKeyOf(null) === null && Rev.wokeKeyOf(undefined) === null && Rev.wokeKeyOf('x'.repeat(600)).length === 512, 'the key = the id the by-id recheck asks with, bounded; no id ⇒ no row', '');
{
  const row = (cid, at) => ({ vid: `${cid}-${at}`, cid, at });
  const one = [row('a1', 1), ...Array.from({ length: 45 }, (_, i) => row('a2', 10 + i))];
  const k = Rev.capWokeRows(one, 40);
  ok(k.length === 40 && k.filter((x) => x.cid === 'a1').length === 1 && k.filter((x) => x.cid === 'a2').map((x) => x.at)[0] === 16 && k[0].cid === 'a1', 'over the bound the conversation with the most rows loses its OLDEST; the lone wake row stays, the order is kept', J(k.slice(0, 3)));
  const halves = [...Array.from({ length: 30 }, (_, i) => row('a1', i)), ...Array.from({ length: 30 }, (_, i) => row('a2', 100 + i))];
  const h = Rev.capWokeRows(halves, 40);
  ok(h.filter((x) => x.cid === 'a1').length === 20 && h.filter((x) => x.cid === 'a2').length === 20 && verdictOf(h.every((x) => x.cid === 'a2' ? x.at >= 110 : x.at >= 10)), 'two conversations over the bound share it evenly, each keeping its newest', J(h.map((x) => x.at)));
  const small = [row('a1', 1), row('a2', 2)];
  ok(J(Rev.capWokeRows(small, 40)) === J(small) && Rev.capWokeRows(null, 40).length === 0, 'under the bound: unchanged', '');
  // RED control: the newest-N bound (the base door) loses the lone wake row
  ok(!one.slice(-40).some((x) => x.cid === 'a1'), 'CONTROL: the newest-40 bound drops the lone wake row the fair bound keeps', '');
}

// ── ⑧ B-43bc (lane lg-text-legs-3, the B-55dc residual): a member whose Task Groups are still being READ is never judged «not a
//    member» on that answer — the roster entry says so (`groupsUnread`), and a delivery first waits for the read
//    (readMembership, the roster's deciding door), then judges. Agent-1 hears the Ops room only through Task Group G. ──
console.log('⑧ B-43bc: a member still being read is read first — the wake and the recall note');
{
  const RP = require(path.join(REPO, 'src/server/roster-pass.js'));
  // the roster entry: `groupsUnread` only when the drawing door's answer is flagged (a read entry is byte-identical to before)
  const ans = (ids, unread) => { const a = ids.map((id) => ({ id })); if (unread) Object.defineProperty(a, 'unread', { value: true, enumerable: false }); return a; };
  const sess = new Map([['w1', { name: 'one', cwd: '/w/a' }], ['w2', { name: 'two', cwd: '/w/b' }]]);
  let asked = [];
  const tasksRP = { groupsForSession: ({ cwd }) => (cwd === '/w/a' ? ans(['G'], false) : ans([], true)), rev: () => 1,
    membershipRead: (a) => { asked.push(a.cwd); return a.cwd === '/w/b' ? Promise.resolve(true) : null; } };
  const R = RP.sessionRoster({ sessions: () => sess, tasks: () => tasksRP, addressableId: (s) => 'c-' + s.name, statusKey: (s, id) => 'claude:' + id });
  const built = R.build();
  ok(J(built[0]) === J({ cid: 'c-one', name: 'one', groups: ['G'], inherited: [], webuiId: 'w1', reachability: null })   /* lane lg-group-parents (restack 415): + the lineage beside the groups (a stand-in with no lineage reader answers []) */ && built[1].groupsUnread === true && J(built[1].groups) === '[]',
    'the roster entry of an answer still being read says `groupsUnread: true`; a read one is byte-identical to before', J(built));
  const n1 = await R.readUnread();
  const askedAll = asked.slice(); asked = [];
  const n2 = await R.readUnread(['c-one']);
  ok(n1 === 1 && J(askedAll) === J(['/w/a', '/w/b']) && n2 === 0 && J(asked) === J(['/w/a']),
    `readUnread asks every live member's (or the named ones') deciding door and counts the reads it waited for (${n1} of all; ${n2} for c-one alone, which needs none)`, J({ askedAll, asked }));

  // the ENGINE: the recall note and the wake over the REAL engine
  const GRP = { kind: 'group', id: 'G' };
  const mkWorld = (ENGM, tag, start, { stuck = false } = {}) => {
    const st = { state: start, reads: 0, said: [] };
    const roster = () => [{ cid: 'agent-1', name: 'Worker', groups: st.state === 'read' ? ['G'] : [], ...(st.state === 'unread' ? { groupsUnread: true } : {}) }, { cid: 'agent-2', name: 'Other', groups: [] }];
    // `stuck`: the decided read passes its bound (or the path waits its back-off) — the answer is still «reading» after it
    const readMembership = async () => { st.reads++; if (st.state !== 'unread' || stuck) return 0; st.state = 'read'; return 1; };
    const log = { log() {}, warn: (m) => { st.said.push(String(m)); }, error() {} };
    return { st, w: mkEngine(ENGM, path.join(ROOT, tag), { roster, readMembership, log }) };
  };
  async function noteLeg(ENGM, tag) {
    const { st, w } = mkWorld(ENGM, tag, 'read');
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m8 = w.tail(OPS).slice(-1)[0];
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    const woke = w.woke(OPS).map((x) => x.cid);
    st.state = 'unread';   // the member's Task Groups answer is being read again (a boot, a row edit)
    w.recall(m8.vendorId);
    await w.hourLater();
    const notes = w.notes().filter((x) => x.cid === 'agent-1').length;
    await w.eng.stop();
    return { woke, notes, reads: st.reads, state: st.state };
  }
  async function wakeLeg(ENGM, tag) {
    const { st, w } = mkWorld(ENGM, tag, 'read');
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m8 = w.tail(OPS).slice(-1)[0];
    st.state = 'unread';   // the hit lands while the member's Task Groups are still being read
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    const delivered = w.delivered.map((d) => d.cid);
    await w.eng.stop();
    return { delivered, reads: st.reads, state: st.state };
  }
  const nl = await noteLeg(ENG, 'unread-note');
  ok(gateOf(nl.woke.includes('agent-1')) && nl.notes === 1 && nl.reads >= 1 && nl.state === 'read',
    `the RECALL NOTE of a member still being read waits for the read, then is stashed (${nl.notes} note, ${nl.reads} read)`, J(nl));
  const wl = await wakeLeg(ENG, 'unread-wake');
  ok(J(wl.delivered) === J(['agent-1']) && wl.reads >= 1 && wl.state === 'read',
    `the WAKE of a member still being read waits for the read, then reaches it (${J(wl.delivered)}, ${wl.reads} read)`, J(wl));
  // RED CONTROLS: the engine without the read — the note and the wake are judged on the unread answer and lost
  const src = engineSource(REPO);
  const NOTE_READ = "    if (cand.length) await readFirst(cand);\n";
  const WAKE_READ = "    if (aud.length && (await readFirst(aud)) && stopped) return;\n";
  ok(src.split(NOTE_READ).length === 2 && src.split(WAKE_READ).length === 2, 'control setup: the two reads are present once each');
  const noRead = MUT.load('src/server/channels-engine.js', src.replace(NOTE_READ, '').replace(WAKE_READ, ''), 'no-unread-read');
  const nlR = await noteLeg(noRead, 'unread-note-red');
  const wlR = await wakeLeg(noRead, 'unread-wake-red');
  ok(gateOf(nlR.woke.includes('agent-1')) && nlR.notes === 0 && nlR.reads === 0, `RED CONTROL: without the read the recall note is judged on the unread answer at the moment — no note then (${nlR.notes})`, J(nlR));
  ok(wlR.delivered.length === 0 && wlR.reads === 0, `RED CONTROL: without the read the wake is judged on the unread answer at the moment — the member not reached then (${J(wlR.delivered)})`, J(wlR));

  // ── THE CURE (主开发 04:09Z; the third form 09:05Z, laws L1–L5): the read held PAST its bound (the stand-in read never lands).
  //    A delivery for a watcher that names THE member (its via row) is KEPT, SAID once, and arrives ONCE after the read lands
  //    (the store's signal → membershipChanged → heldPass); a recall in that window still delivers its note (its mark left
  //    unset until then). A group's OWN row is never kept (L2); one message is handed at most once a watcher, the mark read
  //    at the wake site (L1); a re-run keeps nothing new (L3); past the bound it is SAID (L4); a member the landed read
  //    excludes gets nothing (L5). ──
  const VIA = (cid) => ({ principal: { kind: 'agent', id: cid, name: cid }, via: 'G' });
  const RX_FROM = require(path.join(REPO, 'src/stash-summary.js')).REACTION_DIGEST_FROM;
  const pause = (ms) => new Promise((res) => setTimeout(res, ms));
  const waitFor = async (f, ms) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await pause(15); };
  // each member its own Task Groups answer: `read` (in G) · `unread` (being read; `carry`: it still carries G, the group it
  // knew) · `out` (read: not in G); a `stuck` member's read never lands (the bound passes, or its path waits a back-off)
  const mkWorld2 = (ENGM, tag, init, { bound = null } = {}) => {
    const st = { m: Object.fromEntries(Object.entries(init).map(([c, v]) => [c, { ...v }])), said: [], logged: [], warned: [] };
    const roster = () => Object.entries(st.m).map(([cid, v]) => ({ cid, name: cid, groups: v.state === 'read' || (v.state === 'unread' && v.carry) ? ['G'] : [], ...(v.state === 'unread' ? { groupsUnread: true } : {}) }));
    const readMembership = async (cids) => { let n = 0; for (const [cid, v] of Object.entries(st.m)) { if (Array.isArray(cids) && !cids.includes(cid)) continue; if (v.state !== 'unread' || v.stuck) continue; v.state = 'read'; n++; } return n; };
    const log = { log: (m) => { st.logged.push(String(m)); }, warn: (m) => { st.said.push(String(m)); st.warned.push(String(m)); }, error() {} };
    return { st, w: mkEngine(ENGM, path.join(ROOT, tag), { roster, readMembership, log, heldBound: bound }) };
  };
  const toCount = (w, cid) => w.delivered.filter((d) => d.cid === cid).length;
  // RECORDS handed (主开发 19:23Z: legs count records, not wakes) — the woken-for ledger's rows of ONE message for ONE receiver
  const recs = (w, cid, r, conv = OPS) => w.woke(conv).filter((x) => x && x.cid === cid && x.vid === Rev.wokeKeyOf(r.vendorId)).length;
  const handedN = (w, cid) => w.delivered.filter((d) => d.cid === cid).reduce((n, d) => n + Number((/: (\d+) messages?/.exec((d.o && d.o.cardText) || '') || [])[1] || 0), 0);
  const saidKept = (st, kind, cid) => st.said.filter((m) => m.includes(`a ${kind} judged on «still reading» for ${cid} — KEPT`)).length;
  const saidOver = (st, key, what) => st.said.filter((m) => m.includes(`${key}: past the kept bound`) && m.includes(`${what} kept for agent-1 DROPPED`)).length;
  async function keptWakeLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'out' } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [VIA('agent-1')] });
    const m8 = w.tail(OPS).slice(-1)[0];
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    const then = recs(w, 'agent-1', m8);
    const said = saidKept(st, 'wake', 'agent-1');
    st.m['agent-1'].state = 'read';   // the read lands
    await w.eng.membershipChanged();   // the store's signal (channels-wiring rosterChanged) runs the kept deliveries' look
    const after = recs(w, 'agent-1', m8);
    await w.eng.heldPass();   // a second look delivers nothing more
    const twice = recs(w, 'agent-1', m8);
    await w.eng.stop();
    return { then, said, after, twice };
  }
  async function keptNoteLeg(ENGM, tag) {
    const { st, w } = mkWorld(ENGM, tag, 'read', { stuck: true });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m8 = w.tail(OPS).slice(-1)[0];
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    st.state = 'unread';
    w.recall(m8.vendorId);
    await w.hourLater();
    const then = w.notes().filter((x) => x.cid === 'agent-1').length;
    const unmarked = w.woke(OPS).filter((x) => x.cid === 'agent-1').every((x) => !x.noted);
    const said = st.said.filter((m) => /a recall note judged on «still reading» for agent-1 — KEPT/.test(m)).length;
    st.state = 'read';
    await w.eng.heldPass();
    const after = w.notes().filter((x) => x.cid === 'agent-1').length;
    await w.eng.heldPass();
    const twice = w.notes().filter((x) => x.cid === 'agent-1').length;
    await w.eng.stop();
    return { then, unmarked, said, after, twice };
  }
  const kw = await keptWakeLeg(ENG, 'kept-wake');
  ok(kw.then === 0 && kw.said === 1 && kw.after === 1 && kw.twice === 1,
    `a WAKE for a via row whose member is still being read past the bound is KEPT (0 records then), SAID once, and the message reaches it ONCE after the read lands (${kw.after} record, ${kw.twice} in all)`, J(kw));
  const kn = await keptNoteLeg(ENG, 'kept-note');
  ok(kn.then === 0 && gateOf(kn.unmarked) && kn.said === 1 && kn.after === 1 && kn.twice === 1,
    `a RECALL in that window: no note then, its «noted» mark left UNSET, said once — the note arrives ONCE after the read lands (${kn.after})`, J(kn));
  // RED CONTROL: the engine without the holds (the first commit's form) — the wake and the note are DROPPED for good
  const HOLD_WAKE = '    holdUnreadWake(rec, convId, en, eff, aud, fresh0, owedFor);\n';
  const NOTE_STILL = ' && !still.has(String(w.cid))) { w.noted = true;';
  const NOTE_HOLD = "    if (still.size) holdFor('recall note', rec, convId, [...still], (h) => { const v = String(vid); const c0 = h.notes.get(v) || new Set(); for (const c of still) c0.add(c); h.notes.delete(v); h.notes.set(v, c0); });\n";
  ok(src.split(HOLD_WAKE).length === 2 && src.split(NOTE_STILL).length === 2 && src.split(NOTE_HOLD).length === 2, 'control setup: the wake hold, the note\'s unset mark and the note hold are present once each');
  const noHold = MUT.load('src/server/channels-engine.js', src.replace(HOLD_WAKE, '').replace(NOTE_STILL, ') { w.noted = true;').replace(NOTE_HOLD, ''), 'no-unread-hold');
  const kwR = await keptWakeLeg(noHold, 'kept-wake-red');
  const knR = await keptNoteLeg(noHold, 'kept-note-red');
  ok(kwR.after === 0 && kwR.said === 0, `RED CONTROL: without the hold the via row's wake is DROPPED for good and nothing is said (${kwR.after} after the read)`, J(kwR));
  ok(knR.after === 0 && !knR.unmarked && knR.said === 0, `RED CONTROL: without the hold the note's mark is written and the note is DROPPED for good (${knR.after} after the read)`, J(knR));

  // the locks the third form adds, each with its own control (the second form's group key; the mark; the re-run's asked set)
  const KEEP = '    const keep = [...pks].filter((pk) => pk && !given.has(pk));\n';
  const OLD_GROUP_KEEP = "    for (const it of e0.watchers) {\n      const p = it && it.watcher && it.watcher.principal;\n      if (!p || p.kind !== 'group') continue;\n      const gid = String(p.id);\n      let readIn = false;\n      try { readIn = (liveSessions() || []).some((x) => x && x.cid && !x.groupsUnread && Array.isArray(x.groups) && x.groups.map(String).includes(gid)); } catch { readIn = false; }\n      if (!readIn) pks.add(pkOf(p));\n    }\n    const keep = [...pks].filter((pk) => pk && (!given.has(pk) || /^group:[^>]+$/.test(pk)));\n";   // stale-pins: kept (the second form, restored by the red control)
  const MARK_READ = '      if (had.size) {\n';
  const ASKED = '      const ks = owedFor ? keep.filter((pk) => !!asked && asked.pks.has(pk)) : keep;\n';
  ok(src.split(KEEP).length === 2 && src.split(MARK_READ).length === 2 && src.split(ASKED).length === 2, 'control setup: the per-member keep, the wake site\'s mark and the re-run\'s asked set are present once each');
  const secondForm = (s) => editAnchor(s, KEEP, OLD_GROUP_KEEP, "the text handed to secondForm()");
  const noMark = (s) => editAnchor(s, MARK_READ, '      if (false) {\n', "the text handed to noMark()");
  const keepsAnew = (s) => editAnchor(s, ASKED, '      const ks = keep;\n', "the text handed to keepsAnew()");

  // L1 + L2 — a member being read again that still CARRIES its group: the group's round-robin wakes it now; nothing kept
  async function carriesLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true, carry: true }, 'agent-2': { state: 'out' } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const m8 = w.tail(OPS).slice(-1)[0];
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    const then = recs(w, 'agent-1', m8);
    st.m['agent-1'].state = 'read';
    await w.eng.membershipChanged();
    await w.eng.heldPass();
    const all = recs(w, 'agent-1', m8);
    await w.eng.stop();
    return { then, all };
  }
  const ca = await carriesLeg(ENG, 'carries');
  ok(ca.then === 1 && ca.all === 1, `L1 + L2: a member being read that still CARRIES its group is handed the message by the group's round-robin EXACTLY once (${ca.then} record then, ${ca.all} in all)`, J(ca));
  const caM = await carriesLeg(MUT.load('src/server/channels-engine.js', secondForm(src), 'second-form-group-key'), 'carries-second');
  const caR = await carriesLeg(MUT.load('src/server/channels-engine.js', noMark(secondForm(src)), 'second-form-no-mark'), 'carries-red');
  ok(caM.all === 1 && caR.all === 2, `RED CONTROL: the second form (the group's OWN key kept) with no mark hands it TWICE (${caR.all} records); with the mark at the wake site alone, once (${caM.all})`, J({ caM, caR }));

  // L2 — the group has NO live member now: its hits are the durable pending row (as on the release) — delivered ONCE, with
  // the group's next hit; nothing kept beside it
  async function groupPendingLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'out' } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const [m7, m8] = w.tail(OPS).slice(-2);
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    const pending = ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m8.id).length;
    st.m['agent-1'].state = 'read';
    await w.eng.membershipChanged();
    await w.eng.onFresh(w.recOf(), OPS, [m7], { origin: 'test' });   // the group's next hit carries its pending row
    const handed = handedN(w, 'agent-1');
    await w.eng.stop();
    return { pending, handed };
  }
  const gp = await groupPendingLeg(ENG, 'group-pending');
  const gpR = await groupPendingLeg(MUT.load('src/server/channels-engine.js', noMark(secondForm(src)), 'second-form-no-mark-2'), 'group-pending-red');
  ok(gp.pending === 1 && gp.handed === 2, `L2: a group with no live member keeps its hit as the durable PENDING row (${gp.pending}) — the next delivery hands the two messages once each (${gp.handed})`, J(gp));
  ok(gpR.handed === 3, `RED CONTROL: the second form keeps the group's key beside its pending row — the message handed TWICE (${gpR.handed} messages for 2)`, J(gpR));

  // L3 (+ L1) — a SECOND member goes unread between the first wake and the re-run: it was handed the message already and
  // gets nothing twice; the re-run keeps nothing it was not asked to deliver
  async function secondLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'read', stuck: true } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [VIA('agent-1'), VIA('agent-2')] });
    const m8 = w.tail(OPS).slice(-1)[0];
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });   // agent-2 reached, agent-1 kept
    const first = [recs(w, 'agent-1', m8), recs(w, 'agent-2', m8)];
    st.m['agent-2'].state = 'unread';   // the second member is being read again …
    st.m['agent-1'].state = 'read';   // … when the first member's read lands
    await w.eng.membershipChanged();
    st.m['agent-2'].state = 'read';
    await w.eng.membershipChanged();
    await w.eng.heldPass();
    const all = [recs(w, 'agent-1', m8), recs(w, 'agent-2', m8)];
    await w.eng.stop();
    return { first, all };
  }
  const sl = await secondLeg(ENG, 'second-unread');
  ok(J(sl.first) === '[0,1]' && J(sl.all) === '[1,1]', `L3: a second member going unread between the first wake and the re-run gets nothing twice — the message handed to agent-1 once after its read, to agent-2 once in all (${J(sl.all)} records)`, J(sl));
  const slM = await secondLeg(MUT.load('src/server/channels-engine.js', keepsAnew(src), 'keeps-anew'), 'second-anew');
  const slR = await secondLeg(MUT.load('src/server/channels-engine.js', noMark(keepsAnew(src)), 'keeps-anew-no-mark'), 'second-red');
  ok(J(slR.all) === '[1,2]' && J(slM.all) === '[1,1]', `RED CONTROL: a re-run that keeps anew (the second form) with no mark hands agent-2 the message TWICE (${J(slR.all)} records); with the mark at the wake site alone, once (${J(slM.all)})`, J({ slM, slR }));

  // L5 — the read lands and says NOT a member: the kept delivery reaches nobody
  async function wrongLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'out' } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [VIA('agent-1')] });
    const m8 = w.tail(OPS).slice(-1)[0];
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    const said = saidKept(st, 'wake', 'agent-1');
    st.m['agent-1'].state = 'out';   // the read lands: agent-1 left G
    await w.eng.membershipChanged();
    await w.eng.heldPass();
    const all = recs(w, 'agent-1', m8);
    await w.eng.stop();
    return { said, all };
  }
  const wr = await wrongLeg(ENG, 'wrong-recipient');
  // (engineSource inlines the access family — its wake-time judge is mutated in the same text)
  const STILL_JUDGE = '    let e = hasVia ? { ...e0, watchers: e0.watchers.filter((it) => F.memberStill(it.watcher, members, { rows: viaRows, repickRows: F.repickRowsOf(it, e0.access, grantRows) })) } : e0;';   // lane lg-group-parents (restack 415): the judge as merged — the chain's cure (D) hands the grain's access rows; B-1e96: + the conversation's grant rows (viaRows, the line above it; its comment follows the line); B-fbd6 line 999: + the re-pick's rows of the item's own save
  ok(src.split(STILL_JUDGE).length === 2, 'control setup: the wake-time membership judge (channels-access wakeEffOf) is present once');
  const wrR = await wrongLeg(MUT.load('src/server/channels-engine.js', src.replace(STILL_JUDGE, '    let e = e0;'), 'no-member-judge'), 'wrong-recipient-red');
  ok(wr.said === 1 && wr.all === 0, `L5: kept, said once — then the read lands and says NOT a member: the kept message reaches nobody (${wr.all} records)`, J(wr));
  ok(wrR.all >= 1, `RED CONTROL: without the wake-time membership judge the member the read excludes is handed it (${wrR.all} records)`, J(wrR));

  // L4 — past the bound it is SAID: one line a conversation and member until that member's hold clears
  async function boundLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'out' } }, { bound: { convs: 1, perConv: 2 } });
    await w.eng.pass(A, { force: true });
    for (const c of [ANN, OPS]) await w.eng.setGrain(A, { kind: 'conversation', convId: c }, { access: [acc(GRP)], watchers: [VIA('agent-1')] });
    const ops = w.tail(OPS).slice(-5), ann = w.tail(ANN).slice(-1);
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), ANN, ann, { origin: 'test' });   // kept in the first conversation …
    for (const r of ops.slice(0, 4)) await w.eng.onFresh(w.recOf(), OPS, [r], { origin: 'test' });   // … the second evicts it (1 conversation); 4 kept, 2 a conversation
    const r1 = { ann: saidOver(st, `${A}/${ANN}`, 'every delivery'), ops: saidOver(st, `${A}/${OPS}`, 'a wake') };
    st.m['agent-1'].state = 'read';
    await w.eng.membershipChanged();
    const handed = handedN(w, 'agent-1');
    st.m['agent-1'].state = 'unread';   // read again: the hold cleared, so past the bound it is said again
    for (const r of [ops[0], ops[1], ops[4]]) await w.eng.onFresh(w.recOf(), OPS, [r], { origin: 'test' });
    const r2 = saidOver(st, `${A}/${OPS}`, 'a wake');
    await w.eng.stop();
    return { r1, handed, r2 };
  }
  const bd = await boundLeg(ENG, 'kept-bound');
  ok(bd.r1.ann === 1 && bd.r1.ops === 1 && bd.handed === 2 && bd.r2 === 2,
    `L4: past the bound it is SAID — the evicted conversation once (${bd.r1.ann}), two drops in the kept one ONCE (${bd.r1.ops}); the 2 kept handed after the read (${bd.handed}); read again, said again (${bd.r2})`, J(bd));
  const SAY_OVER = '  function sayOver(key, what, cids) {\n';
  ok(src.split(SAY_OVER).length === 2, 'control setup: the bound\'s line is present once');
  const bdR = await boundLeg(MUT.load('src/server/channels-engine.js', src.replace(SAY_OVER, SAY_OVER + '    return;\n'), 'silent-bound'), 'kept-bound-red');
  ok(bdR.r1.ann === 0 && bdR.r1.ops === 0 && bdR.handed === 2, `RED CONTROL: a silent bound (the second form) drops the kept deliveries and says nothing (${J(bdR.r1)})`, J(bdR));

  // L1 RESTATED (主开发 19:23Z) — ONE billed turn to one RECEIVING conversation, whichever watcher row or road carries it.
  // THE SCENE: the group's own row AND agent-1's via row; agent-1 is being read and does not carry the group. The group's
  // round-robin finds nobody (its DURABLE pending row); the via row is kept; the read lands and the re-run hands agent-1 the
  // message; the next message's batch carries the group's pending row to the SAME agent — the receiver's mark leaves it out
  async function receiverLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'out' } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }, VIA('agent-1')] });
    const [m7, m8] = w.tail(OPS).slice(-2);
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    const pending = ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).filter((p) => p && p.record && p.record.id === m8.id).length;
    st.m['agent-1'].state = 'read';
    await w.eng.membershipChanged();   // the kept re-run hands agent-1 m8 (under the via row's name)
    await w.eng.onFresh(w.recOf(), OPS, [m7], { origin: 'test' });   // the next batch: the group's pending row reaches agent-1 too
    const out = { pending, m8: recs(w, 'agent-1', m8), m7: recs(w, 'agent-1', m7), left: ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).length };
    await w.eng.stop();
    return out;
  }
  const rv = await receiverLeg(ENG, 'receiver');
  const RECEIVER = 'receiver: cid ? markOf(adapterId, convId, `→${cid}`, h) : null';   // B-1ca5 part B: read in the ONE verdict's reader (judgeHits)
  ok(src.split(RECEIVER).length === 2, 'control setup: the receiver\'s mark is read through one function, present once');
  const rvR = await receiverLeg(MUT.load('src/server/channels-engine.js', src.replace(RECEIVER, 'receiver: null'), 'no-receiver-mark'), 'receiver-red');
  ok(rv.pending === 1 && rv.m8 === 1 && rv.m7 === 1 && rv.left === 0,
    `L1 RESTATED: the group's row and a via row, agent-1 being read and not carrying the group — the group's pending row (${rv.pending}) and the kept via row both lead to agent-1: m8 handed to it ONCE in all (${rv.m8} record), m7 once, the pending row cleared`, J(rv));
  ok(rvR.m8 === 2, `RED CONTROL: the receiver's mark cut — the group's pending row hands agent-1 the message it already has: ${rvR.m8} records`, J(rvR));

  // THE MARK'S BOUND FITS IT (the smalls of round w13lgr9dm): a name past its bound forgets the oldest record NOTHING WAITS
  // FOR — routine in a busy conversation, said as such (a journal line, never a warning), the last count said when the
  // window has passed (at the mark's next write — the engine's clock; a one-shot timer is the backstop); a record still
  // waiting (here: the group's pending row) is never the one forgotten while another can go
  async function forgetLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read' }, 'agent-2': { state: 'out' } }, { bound: { handedPer: 1, sayMs: 60e3 } });
    await w.eng.pass(A, { force: true });
    for (const c of [OPS, ANN]) await w.eng.setGrain(A, { kind: 'conversation', convId: c }, { access: [acc(GRP)], watchers: [VIA('agent-1')] });
    const [m6, m7, m8] = w.tail(OPS).slice(-3);
    for (const r of [m6, m7, m8]) await w.eng.onFresh(w.recOf(), OPS, [r], { origin: 'test' });   // each name holds one: m6, then m7 forgotten — nothing waits for them
    const first = st.logged.filter((m) => m.includes('the hand-over mark forgot')).length;
    w.clock.advance(61e3);   // the window passes; the evictions have stopped
    await w.eng.onFresh(w.recOf(), ANN, w.tail(ANN).slice(-1), { origin: 'test' });   // the mark's next write (new names: nothing forgotten) says the last count
    const lines = st.logged.filter((m) => m.includes('the hand-over mark forgot'));
    const out = { first, lines: lines.length, last: (/forgot (\d+) record/.exec(lines[lines.length - 1] || '') || [])[1] || null, routine: lines.every((m) => m.includes('nothing waits for any more — routine')), warned: st.warned.filter((m) => m.includes('the hand-over mark')).length, handed: [m6, m7, m8].map((r) => recs(w, 'agent-1', r)) };
    await w.eng.stop();
    return out;
  }
  const fg = await forgetLeg(ENG, 'mark-forget');
  ok(fg.first === 1 && fg.lines === 2 && fg.last === '3' && gateOf(fg.routine) && fg.warned === 0 && J(fg.handed) === '[1,1,1]',
    `the mark's routine forgetting is SAID as what it is — a journal line, never a warning (${fg.warned}); the first at once, the LAST count (${fg.last}) when the window ends (${fg.lines} lines)`, J(fg));
  const SAY_LATER = '    for (const kind of Object.keys(forgot)) { const f = forgot[kind]; if (f.n && now() - f.at >= HANDED_SAY_MS) sayForgotNow(kind); }\n';
  ok(src.split(SAY_LATER).length === 2, 'control setup: the last count\'s line at the next write is present once');
  const fgR = await forgetLeg(MUT.load('src/server/channels-engine.js', src.replace(SAY_LATER, ''), 'no-last-count'), 'mark-forget-red');
  ok(fgR.lines === 1, `RED CONTROL: without the last count's line the stopped burst's count is never said (${fgR.lines} line; the backstop timer is a minute away)`, J(fgR));

  // the scene with a mark of ONE record a name: the group's pending row still holds m8 when agent-1 is handed m7 — the
  // mark forgets m7 (nothing waits for it), never m8, so the pending row's carry still finds m8 handed
  async function waitingLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'out' } }, { bound: { handedPer: 1 } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }, VIA('agent-1')] });
    const [m7, m8] = w.tail(OPS).slice(-2);
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
    st.m['agent-1'].state = 'read';
    await w.eng.membershipChanged();
    await w.eng.onFresh(w.recOf(), OPS, [m7], { origin: 'test' });
    const out = { m8: recs(w, 'agent-1', m8), m7: recs(w, 'agent-1', m7), warned: st.warned.filter((m) => m.includes('STILL WAITING')).length };
    await w.eng.stop();
    return out;
  }
  const wt = await waitingLeg(ENG, 'mark-waiting');
  const OLDEST_FREE = "        for (const id of m.keys()) if (!wait.has(id) && typeof m.get(id) !== 'object') { victim = id; break; }   // the oldest record nothing waits for\n";
  ok(src.split(OLDEST_FREE).length === 2, 'control setup: the mark\'s choice of what nothing waits for is present once');
  // B-1ca5's remainder: THE DOOR reads the hand's durable ledger when the memory map forgot a mark — a control that wants the
  // second hand-over cuts the door too; with the door kept, the forgotten mark is no second hand-over
  const DOOR = '    return v === undefined ? ledgerMark(adapterId, convId, name, h) : markFrom(v);\n';
  ok(src.split(DOOR).length === 2, 'control setup: the door (the ledger read for a mark the memory map does not hold) is present once');
  const wtR = await waitingLeg(MUT.load('src/server/channels-engine.js', src.replace(OLDEST_FREE, '').replace(DOOR, '    return markFrom(v);\n'), 'oldest-forgotten'), 'mark-waiting-red');
  const wtD = await waitingLeg(MUT.load('src/server/channels-engine.js', src.replace(OLDEST_FREE, ''), 'oldest-forgotten-door'), 'mark-waiting-door');
  ok(wtD.m8 === 1, `THE DOOR (B-1ca5's remainder): even a mark forgotten whatever waits hands m8 ONCE — the ledger the hand wrote answers (${wtD.m8})`, J(wtD));
  ok(wt.m8 === 1 && wt.m7 === 1 && wt.warned === 0, `a mark of ONE record a name forgets m7, never m8 the group's pending row still holds — m8 handed ONCE (${wt.m8}), nothing waiting forgotten`, J(wt));
  ok(wtR.m8 === 2 && wtR.warned >= 1, `RED CONTROL: a mark that forgets its oldest whatever waits forgets m8 — the pending row hands it TWICE (${wtR.m8}), said as a warning`, J(wtR));

  // L1 RESTATED — THE OTHER ORDER: the pending carry first (the next message's batch comes before the read's signal), the
  // kept re-run after it — the receiver's mark leaves the kept message out
  async function otherOrderLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'out' } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }, VIA('agent-1')] });
    const [m7, m8] = w.tail(OPS).slice(-2);
    st.m['agent-1'].state = 'unread';
    await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });   // the group's pending row; the via row kept
    st.m['agent-1'].state = 'read';   // the read lands — its signal not yet run
    await w.eng.onFresh(w.recOf(), OPS, [m7], { origin: 'test' });   // the next batch FIRST: the group's carry hands agent-1 m8
    const first = recs(w, 'agent-1', m8);
    await w.eng.membershipChanged();   // then the kept re-run: m8 again for the via row
    const out = { first, m8: recs(w, 'agent-1', m8), m7: recs(w, 'agent-1', m7) };
    await w.eng.stop();
    return out;
  }
  const oo = await otherOrderLeg(ENG, 'receiver-other-order');
  const ooR = await otherOrderLeg(MUT.load('src/server/channels-engine.js', src.replace(RECEIVER, 'receiver: null'), 'no-receiver-mark-2'), 'receiver-other-order-red');
  ok(oo.first === 1 && oo.m8 === 1 && oo.m7 === 1, `L1 RESTATED, THE OTHER ORDER: the group's pending carry hands agent-1 m8 first (${oo.first}); the kept re-run after it hands nothing more — m8 ONCE in all (${oo.m8} record)`, J(oo));
  ok(ooR.m8 === 2, `RED CONTROL: the receiver's mark cut — the kept re-run hands m8 again: ${ooR.m8} records`, J(ooR));

  // THE SCOPE DIGEST'S HISTORY ROW COUNTS WHAT IT HANDED: o1 reached agent-1 through the group's wake, o2 did not; the
  // account digest carries o2 only, and its row on the conversation says 1. (B-1ca5 part B, round w5y5digbw item 7: the REAL
  // engine — the digest watches only after the group's wake handed o1, so its row of o1 is parked AFTER that hand-over and no
  // clear of the hand-over ever saw it: a carried row of a record the receiver already had, as production makes one)
  async function scopeRowLeg(ENGM, tag) {
    const w = mkEngine(ENGM, path.join(ROOT, tag), { roster: () => [{ cid: 'agent-1', name: 'Worker', groups: ['G'] }, { cid: 'agent-2', name: 'Other', groups: [] }] });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)] });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [{ principal: GRP }] });
    const [o1, o2] = w.tail(OPS).slice(-2);
    await w.eng.onFresh(w.recOf(), OPS, [o1], { origin: 'test' });   // the group's wake hands o1 to agent-1 (no digest watches yet)
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [] });
    await w.eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT)], watchers: [{ principal: AGENT, notify: 'digest', digestMinutes: 30 }] });
    await w.eng.onFresh(w.recOf(), OPS, [o1, o2], { origin: 'test' });   // the digest parks o1 (after its hand-over) and o2
    const f = await w.eng.flushScope(A, 'account', null, 'agent:agent-1');
    const rows = (((w.eng.store.index.live()[`${A}/${OPS}`] || {}).stats || {}).wakes || []).filter((x) => x && x.digest).map((x) => x.n);
    const out = { ok: !!(f && f.ok), n: f && f.n, rows, o1: recs(w, 'agent-1', o1), o2: recs(w, 'agent-1', o2), pending: ((w.eng.store.index.live()[`${A}/${OPS}`] || {}).pending || []).length };
    await w.eng.stop();
    return out;
  }
  const sr = await scopeRowLeg(ENG, 'scope-row');
  const ROW_N = '          e2.stats.wakes.push({ ...wk, n: h.carried.hits.length + h.carried.elided });';
  ok(src.split(ROW_N).length === 2, 'control setup: the scope digest\'s history row is present once');
  const srR = await scopeRowLeg(MUT.load('src/server/channels-engine.js', anchored(src, ROW_N, '          e2.stats.wakes.push({ ...wk, n: h.carried.ids.size + h.carried.elided });', 'row-counts-ids'), 'row-counts-ids'), 'scope-row-red');   // stale-pins: kept (the row as it counted before)
  ok(gateOf(sr.ok) && sr.n === 1 && J(sr.rows) === '[1]' && sr.o1 === 1 && sr.o2 === 1 && sr.pending === 0, `the scope digest carries only o2 (o1 the receiver already had) and its history row on the conversation counts what it HANDED (${J(sr.rows)}); its pending rows cleared`, J(sr));
  ok(J(srR.rows) === '[2]', `RED CONTROL: a row counting the carried ids says ${J(srR.rows)} for one record handed`, J(srR));

  // the DIGEST's hold and its bound — reactions on what agent-1 SENT here, while its Task Groups are being read
  async function digestLeg(ENGM, tag) {
    const { st, w } = mkWorld2(ENGM, tag, { 'agent-1': { state: 'read', stuck: true }, 'agent-2': { state: 'out' } }, { bound: { perConv: 2 } });
    await w.eng.pass(A, { force: true });
    await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(GRP)], watchers: [] });
    const sent = w.tail(OPS).slice(-3);
    await w.eng.store.index.update(() => { const e2 = w.eng.store.index.entry(A, OPS, { create: false }); e2.sentBy = { 'agent:agent-1': sent.map((r) => String(r.vendorId)) }; }, { durable: true });
    st.m['agent-1'].state = 'unread';
    const reacted = await Promise.all(sent.map((r) => w.eng.react(A, OPS, r.vendorId, 'rocket')));
    const lines = () => w.stashed.filter((x) => x.fromName === RX_FROM && x.cid === 'agent-1').length;
    await waitFor(() => saidKept(st, 'reaction digest', 'agent-1') > 0 || lines() > 0, 400);
    const then = lines();
    const said = saidKept(st, 'reaction digest', 'agent-1');
    const over = saidOver(st, `${A}/${OPS}`, 'a reaction digest');
    st.m['agent-1'].state = 'read';
    await w.eng.membershipChanged();
    await waitFor(() => lines() >= 2, 600);
    const after = lines();
    await w.eng.membershipChanged();
    await pause(300);
    const twice = lines();
    await w.eng.stop();
    return { ok: reacted.filter((r) => r && r.ok !== false).length, then, said, over, after, twice };
  }
  const dg = await digestLeg(ENG, 'kept-digest');
  ok(dg.ok === 3 && dg.then === 0 && dg.said >= 1 && dg.over === 1 && dg.after === 2 && dg.twice === 2,
    `the DIGEST: reactions on three messages agent-1 sent, while it is being read — KEPT (0 then, said), the third past the bound of 2 said ONCE, the 2 kept lines delivered ONCE after the read (${dg.after}, ${dg.twice} in all)`, J(dg));
  const DG_KEEP = '      if (unreadNow([cid])) { keptFor.push([String(vid), cid]); continue; }\n';
  const DG_HOLD = '    if (keptFor.length) holdDigestFor(rec, convId, keptFor);\n';
  ok(src.split(DG_KEEP).length === 2 && src.split(DG_HOLD).length === 2, 'control setup: the digest\'s keep and hold are present once each');
  const dgR = await digestLeg(MUT.load('src/server/channels-engine.js', src.replace(DG_KEEP, '').replace(DG_HOLD, ''), 'no-digest-hold'), 'kept-digest-red');
  ok(dgR.then === 0 && dgR.after === 0 && dgR.said === 0, `RED CONTROL: the digest without its hold judges the unread answer — the lines DROPPED for good, nothing said (${dgR.after} after the read)`, J(dgR));
  // (B-1ca5's take-race legs — the race, the digest first, both restarts, the stop and the deadline — live in
  //  scripts/test-channel-take-race.mjs since round w8ghfur9h, 主开发 r367: «a fast suite of their own»)
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
