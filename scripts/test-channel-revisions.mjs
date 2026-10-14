#!/usr/bin/env node
// A STORED MESSAGE KEEPS LEARNING — PURE (lane channel-record-revisions, owner 2026-10-13: userW recalled a Lark message
// and VibeSpace never marked it). The fold, the record's `rv` line, the recheck PLAN (cadence, budget, the 24 h / 7 d
// windows, woken-for first), the capability row per adapter (`how: none` legs), the registry's normalizing wrapper,
// the agent's words — each with a RED control. The chrome legs: scripts/test-channel-revisions-ui.mjs (heavy).
// ⑦ (lane channel-recall-engine-leg, B-e8e1) the ENGINE leg, in-process: the REAL engine over the fake adapter (its
// revisions file = the vendor's answer by id), a deliver stub, an injected clock — a message a wake carried is recalled
// ⇒ ONE stashed note; again / after a restart ⇒ nothing; a recall nobody was woken for ⇒ nothing; a message carried
// twice ⇒ still one; a SCOPE DIGEST writes the woken-for rows of every conversation it carried. Patched-copy controls.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Rev = require(path.join(REPO, 'src/channel-revisions.js'));
const R = require(path.join(REPO, 'src/channel-record.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
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
ok(vb.ok && !vb.side.blocks && vb.side.truncated === true && Buffer.byteLength(JSON.stringify(vb.side)) <= R.SIDE_LINE_MAX_BYTES, 'a version past the line bound drops its tree first, then cuts the text (truncated) — the line stays ≤ 8 KiB', J({ ok: vb.ok, bytes: vb.ok && Buffer.byteLength(JSON.stringify(vb.side)) }));
ok(!R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', text: 'x' }).ok && !R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', editedAt: T }).ok, 'a version without its instant or its text is refused by name', J([R.validateSide({ k: 'rv', msg: 'm1', at: T, src: 'recheck', text: 'x' }).code]));
ok(R.sideKey(rv(T - 60e3, 'a')) === R.sideKey(rv(T - 60e3, 'a')) && R.sideKey(rv(T - 60e3, 'a')) !== R.sideKey(rv(T - 61e3, 'a')), 'one version per instant (a re-learned edit is a no-op by its key)');
ok(R.SIDE_KINDS.includes('rv') && Rev.compactVersionLines(Array.from({ length: 30 }, (_, i) => rv(T - (30 - i) * 1000, `v${i}`))).length === Rev.VERSIONS_KEPT, `the store's trim keeps the newest ${Rev.VERSIONS_KEPT} versions`);

console.log('③ the recheck plan');
const it = (key, at, o = {}) => ({ key, at, ...o });
const items = [it('c\na', T - 2 * H), it('c\nb', T - 23 * H), it('c\nold', T - 25 * H), it('c\nwoke', T - 3 * 24 * H, { wokeAt: T - 2 * 24 * H }), it('c\nwokeOld', T - 9 * 24 * H, { wokeAt: T - 8 * 24 * H }), it('c\ngone', T - H, { recalled: true })];
const p1 = Rev.planRecheck({ now: T, items });
ok(p1.join() === 'c\nwoke,c\na,c\nb'.replace(/\\n/g, '\n'), 'windows: < 24 h fresh, a woken-for message for 7 d (first), never past them; a recalled message is done', J(p1));
ok(Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 30 * 60e3]]) }).join() === ['c\nwoke', 'c\nb'].join(), 'cadence: at most one request per message per hour');
ok(Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 30e3]]), forced: true }).includes('c\na') && !Rev.planRecheck({ now: T, items, last: new Map([['c\na', T - 2e3]]), forced: true }).includes('c\na'), `the owner's Refresh re-asks after ${Rev.RECHECK_FORCED_MS / 1000} s (never a flood)`);
const many = Array.from({ length: 50 }, (_, i) => it(`c\nm${i}`, T - i * 60e3));
ok(Rev.planRecheck({ now: T, items: many }).length === Rev.RECHECK_PER_PASS && Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR - 3).fill(T - 60e3) }).length === 3 && Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR).fill(T - 60e3) }).length === 0, `budget: ≤ ${Rev.RECHECK_PER_PASS} a pass, ≤ ${Rev.RECHECK_PER_HOUR} an account-hour (the sliding hour)`);
ok(Rev.planRecheck({ now: T, items: many, spent: Array(Rev.RECHECK_PER_HOUR).fill(T - H - 1) }).length === Rev.RECHECK_PER_PASS, 'spent instants older than the hour free their room');
// RED control: a plan without the hour gap asks the same message every pass
const noGap = (o) => Rev.planRecheck({ ...o, last: new Map() });
ok(noGap({ now: T, items, last: new Map([['c\na', T - 60e3]]) }).includes('c\na'), 'RED CONTROL: a plan that ignores `last` re-asks a message a minute later — the cadence leg is red on it');

console.log('④ the capability row per adapter');
const mods = { lark: require(path.join(REPO, 'src/channels/lark.js')), slack: require(path.join(REPO, 'src/channels/slack.js')), gmail: require(path.join(REPO, 'src/channels/gmail.js')), webhook: require(path.join(REPO, 'src/channels/webhook.js')), agents: require(path.join(REPO, 'src/channels/agents.js')) };
const rowOf = (m) => CH.revisionsOf((m.adapter || m).caps);
ok(J(rowOf(mods.lark)) === J({ recall: true, edit: true, how: 'byid' }) && J(rowOf(mods.slack)) === J({ recall: true, edit: true, how: 'absent' }), 'Lark answers by id; Slack by absence (a deleted message vanishes)');
ok(['gmail', 'webhook', 'agents'].every((k) => rowOf(mods[k]).how === 'none' && !rowOf(mods[k]).recall && !rowOf(mods[k]).edit), 'Gmail / webhook / agents: revisions none — nothing is rechecked');
ok(CH.revisionsOf({}).how === 'none' && !CH.METHOD_GATES.revisionOf({}) && CH.METHOD_GATES.revisionOf({ revisions: { recall: true, edit: false, how: 'absent' } }), 'a missing row fails closed (none); the method is declared by the row');
const bad = (rv2) => { try { CH.validateCaps('webhook', { ...(mods.webhook.adapter || mods.webhook).caps, revisions: rv2 }); return null; } catch (e) { return e.message; } };
ok(/how must be/.test(bad({ recall: true, edit: true, how: 'poll' }) || '') && /never be learned/.test(bad({ recall: true, edit: false, how: 'none' }) || '') && /learns nothing/.test(bad({ recall: false, edit: false, how: 'byid' }) || ''), 'a broken row is refused by name at load', J([bad({ how: 'poll', recall: true, edit: true })]));

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
ok(/woken for at T \(Lark \/ Ops\) was recalled/.test(note) && !/\n/.test(note), 'the ONE next-turn note: our words, the time, the place — one line', note);


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
function mkEngine(ENGM, dataDir, { clock = dayStartClock() } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const REVS = path.join(dataDir, 'revisions.json');
  if (!fs.existsSync(REVS)) fs.writeFileSync(REVS, J({ revisions: {} }));
  const delivered = [], stashed = [], asked = [];
  const deliver = {
    deliverToConversation: async (cid, text, o) => { delivered.push({ cid, text, o }); return { ok: true, lane: 'message' }; },
    stashFor: (cid, e) => { stashed.push({ cid, ...e }); return { stored: true }; },
  };
  const registry = CH.createChannelRegistry();
  const fk = FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'], now: clock, revisionsFile: REVS });
  const mk0 = fk.create;
  fk.create = (record, deps) => { const a = mk0(record, deps); const by = a.revisionOf; a.revisionOf = (convId, o) => { asked.push(o && o.messageId); return by(convId, o); }; return a; };
  registry.register(fk);
  const eng = ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir, now: clock }), deliver, now: clock, log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }] });
  const recall = (...vids) => { const j = JSON.parse(fs.readFileSync(REVS, 'utf8')); for (const v of vids) j.revisions[v] = { state: 'recalled' }; fs.writeFileSync(REVS, J(j)); };
  const tail = (c) => { const m = eng.messages(A, c, { limit: 5 }); return m.records || m; };
  const recOf = () => eng.adapterRecords().adapters.find((r) => r.id === A);
  const woke = (c) => ((eng.store.index.live()[`${A}/${c}`] || {}).wokeFor || []);
  const recalled = (c, vid) => !!Rev.recalledAtOf(eng.store.readSide(A, c, { msgs: new Set([vid]) }).filter((x) => x && x.k === 'fx'));
  const notes = () => stashed.filter((x) => x.fromName === NOTE_FROM);
  // the cadence is one by-id ask per message per hour: the next pass an hour on re-reads what a wake carried
  const hourLater = async () => { clock.advance(61 * 60e3); return eng.pass(A, { force: true }); };
  return { eng, clock, delivered, stashed, asked, recall, tail, recOf, woke, recalled, notes, hourLater };
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
ok(J(d1.delivered) === J(['agent-1']) && d1.rows.length === 2 && d1.rows.every((x) => x.cid === 'agent-1' && Number(x.at) > 0) && d1.rows.map((x) => x.vid).join() === [d1.m7.vendorId, 'fake-poll-ops-m8'].join(), 'the wake: ONE delivery to agent-1, the woken-for ledger names both messages it carried, to whom, when', J({ delivered: d1.delivered, rows: d1.rows }));
const n1 = d1.first[0] || {};
ok(d1.first.length === 1 && n1.cid === 'agent-1' && n1.source === 'channel' && n1.kind === 'notification', 'the recall of a message the wake carried: exactly ONE note, stashed (the free lane, never a wake) for the conversation it woke', J(d1.first.map((x) => [x.cid, x.fromName, x.kind])));
ok(/was recalled by its sender/.test(n1.text || '') && (n1.text || '').includes(iso(d1.wakeAt)) && /Ops room/.test(n1.text || '') && !(n1.text || '').includes(String(d1.m7.text || '').slice(0, 24)) && !(n1.text || '').includes(d1.m7.vendorId), 'the note names the revision (recalled), the wake\'s time and the room — never the message\'s text or id', n1.text);
ok(d1.marked.every(Boolean) && d1.first.length === 1, 'a recall nobody was woken for (the same room\'s other message, a room nobody watches) is marked on its row — and adds NO note', J(d1.marked));
ok(d1.second === 1 && !d1.askedAgain.includes(d1.m7.vendorId), 'a second pass an hour on: the recalled message is done (never re-asked), still one note', J({ second: d1.second }));
ok(d1.restart.asked && d1.restart.notes === 0 && d1.restart.noted, 'after a restart the woken-for row re-asks the message, learns the recall AGAIN — and adds nothing (the record already says it; the row is marked noted on disk)', J(d1.restart));
ok(J(d1.stashedTo) === J(['agent-1']), 'nobody else hears anything (agent-2 was never woken)', J(d1.stashedTo));
{ // RED CONTROL: the recheck without its note call — the legs above go red
  const src = engineSource(REPO);
  const cut = src.replace('        await noteRecall(rec, convId, vid);\n', '');
  const c1 = await directLeg(MUT.load('src/server/channels-engine.js', cut, 'no-note'), 'direct-c');
  ok(cut !== src && c1.first.length === 0 && c1.marked[0], 'CONTROL: an engine whose recheck never calls the note path marks the recall and stashes NOTHING — the ONE-note leg is red on it', J({ notes: c1.first.length }));
}

// ⑦b the same message carried to the same conversation twice (a re-delivery five minutes on)
async function twiceLeg(ENGM, tag) {
  const w = mkEngine(ENGM, path.join(ROOT, tag));
  await w.eng.pass(A, { force: true });
  await w.eng.setGrain(A, { kind: 'conversation', convId: OPS }, { access: [acc(AGENT)], watchers: [{ principal: AGENT }] });
  const m8 = w.tail(OPS).slice(-1)[0];
  await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
  w.clock.advance(5 * 60e3);
  await w.eng.onFresh(w.recOf(), OPS, [m8], { origin: 'test' });
  const rows = w.woke(OPS).filter((x) => x.vid === m8.vendorId).map((x) => x.at);
  w.recall(m8.vendorId);
  await w.hourLater();
  const out = { wakes: w.delivered.length, rows, notes: w.notes().map((x) => x.text) };
  await w.eng.stop();
  return out;
}
const t1 = await twiceLeg(ENG, 'twice');
ok(t1.wakes === 2 && t1.rows.length === 2 && t1.notes.length === 1 && t1.notes[0].includes(iso(Math.min(...t1.rows))), 'a message carried to one conversation TWICE (two ledger rows): its recall is still ONE note — the first wake\'s time', J(t1));
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
ok(g1.held === 0 && g1.flushed.ok && g1.flushed.conversations === 2 && g1.flushed.cid === 'agent-1' && g1.delivered === 1, 'the digest window held both rooms\' hits, then ONE scope digest carried two conversations to agent-1', J(g1));
ok(J(g1.rows) === J(g1.want), 'the woken-for ledger of EVERY conversation the digest carried names its message and the conversation it woke (was: none — single-conversation wakes only)', J({ rows: g1.rows, want: g1.want }));
ok(g1.notes.length === 2 && g1.notes.every(([cid]) => cid === 'agent-1') && g1.notes.some(([, x]) => /Ops room/.test(x)) && g1.notes.some(([, x]) => /Announcements/.test(x)), 'both recalls after the digest: ONE note each, to the conversation the digest woke, naming its room', J(g1.notes));
{
  const src = engineSource(REPO);
  const line = '          noteWoken(e2, h.carried.hits, target.cid, t);';
  const cut = src.split('\n').filter((l) => !l.startsWith(line)).join('\n');
  const c3 = await digestLeg(MUT.load('src/server/channels-engine.js', cut, 'no-digest-ledger'), 'digest-c');
  ok(cut !== src && c3.delivered === 1 && c3.rows.every((r) => r === '') && c3.notes.length === 0, 'CONTROL: the digest without its ledger rows (the .262 engine) — delivered, recalled, and NOT ONE note', J({ rows: c3.rows, notes: c3.notes.length }));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
