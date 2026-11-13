#!/usr/bin/env node
// THE WAIT WATCH (lane queued-is-not-woke laws 2 + 3, SHAPE C — 主开发's rulings 2026-11-13 13:35Z / 13:42Z; row B-580f; closes K6 of
// 2.369.398). Six reader rounds found every mechanism that KEPT or DEFINED «what waits» wrong on a new input. SHAPE C keeps
// nothing: the hub judges a wait only for a conversation in a RUNNING turn, and asks «not yet handed» of its own record at
// that moment (groups-engine readWaiting — the log, off the loop, and the marks through the next report's reach, plus the
// held frames; read only where a mark or a held frame's start is older than an hour). What is remembered is what was SHOWN:
//   the SENDER (1 h): ONE keyed stash slot per sender, replaced in place, never counted against the cap, never the same set
//   twice; the OWNER (4 h): ONE For-you item per conversation and turn, two end words; a sweep every five minutes.
// The REAL groups-engine + delivery ladder + channel store + user-todos; each harness's REAL normalizer for the card.
// Its walk against reader A's oracle (5 seeds × 3 000 steps) is scripts/test-wait-walk.mjs; the fleet day, test-wait-fleet.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const J = JSON.stringify;

const G = require(path.join(REPO, 'src/channel-groups.js'));
const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const WATCH = require(path.join(REPO, 'src/server/wait-watch.js'));
const WW = require(path.join(REPO, 'src/wait-words.js'));
const FA = require(path.join(REPO, 'src/foryou-actions.js'));
const N = require(path.join(REPO, 'src/normalizers.js'));
const C = require(path.join(REPO, 'src/backend-caps.js'));
const OF = require(path.join(REPO, 'src/server/owner-facts.js'));
const { renderMsgStash } = require(path.join(REPO, 'src/agent-routes.js'));
const { chipAsksOf } = require(path.join(REPO, 'src/helper-ask.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-wait-watch-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const MUT = mutantCopies('wait-watch', REPO);

const A = 'aaaaaaaa-0000-4000-8000-00000000000a';   // the sender (an agent)
const X = 'bbbbbbbb-0000-4000-8000-00000000000b';   // the addressee, in a turn
const Y = 'cccccccc-0000-4000-8000-00000000000c';   // a second addressee
const MIN = 60e3;
const tick = () => new Promise((r) => setImmediate(r));
const ROW = FA.ROWS.find((r) => r.producer === 'src/server/wait-watch.js');

function world(be = 'antigravity', { said = true, mods = {}, utDir = null, dir: dir0 = null, store = null } = {}) {
  const W = { skip: 0, sent: [] };
  const dir = dir0 || fs.mkdtempSync(path.join(ROOT, be + '-'));
  fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true });
  const st = store || createChannelStore({ dir: path.join(dir, 'channels') });
  const frames = [];
  const T_OPEN = Date.now() - 2 * MIN;
  const mk = (cid, name, wid) => {
    const S = { backend: be, mode: 'chat', name, host: null, socketPath: path.join(dir, 'cw-' + wid), _isStreaming: true, _turnStateSeen: true, _turnOpenedAt: T_OPEN, _turnOpenSaidAt: said && be !== 'claude' ? T_OPEN - 400 : null, pty: { write: (f) => frames.push(JSON.parse(String(f))) } };
    if (be === 'claude') S.claudeSessionId = cid; else S.backendSessionId = cid;
    if (be !== 'claude') fs.writeFileSync(path.join(dir, 'session-buffers', wid + '.json'), JSON.stringify({ pid: process.pid, startedAt: Date.now(), mode: 'chat', backend: be, threadId: cid, caps: be === 'codex' ? { peerMessage: true, queueVerbs: ['remove', 'steer', 'steer-all'] } : { peerMessage: true, notificationSteer: false } }));
    return S;
  };
  const S = mk(X, 'xray', 'w-x'), SY = mk(Y, 'yank', 'w-y');
  const sessions = new Map([['w-x', S], ['w-y', SY]]);
  const money = { auth: 0, notes: 0, releases: 0 };
  const deliver = DELIVER.create({
    dataDir: dir, activeSessions: sessions, serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null,
    peerMsg: { findPeer: (cid) => (be === 'claude' && (cid === X || cid === Y) ? { name: cid === X ? 'xray' : 'yank', socketPath: '/dev/null', pid: process.pid } : null), postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) },
    emitPeerCard: () => true,
    authorizeSpend: () => { money.auth++; return { ok: true, identity: { key: 'slot-1', name: 'slot one' }, hold: 'h' + money.auth }; },
    noteSpend: () => { money.notes++; }, releaseSpend: () => { money.releases++; }, log: () => { },
  });
  let t = Date.now();
  const vnow = () => { t = Math.max(t + 1, Date.now() + W.skip); return t; };
  const roster = [{ cid: A, name: 'alpha', groups: ['tg1'], reachability: null }, { cid: X, name: 'xray', groups: ['tg1'], reachability: null }, { cid: Y, name: 'yank', groups: ['tg1'], reachability: null }];
  W.mkEng = (mod = mods.GE || GE) => mod.create({ store: st, deliver, broadcast: (m) => W.sent.push(m), now: () => vnow(), roster: () => roster, groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
  W.eng = W.mkEng();
  W.utDir = utDir || fs.mkdtempSync(path.join(ROOT, 'ut-'));
  W.mkUt = () => new UserTodoManager({ dataDir: W.utDir, onChange: () => { } });
  W.ut = W.mkUt();
  Object.assign(W, { dir, st, deliver, S, SY, frames, money, sessions, logs: [], T_OPEN });
  W.mkWatch = (mod = mods.WATCH || WATCH, groups = () => W.eng) => mod.create({ activeSessions: sessions, getDeliver: () => deliver, getGroups: groups, getUserTodos: () => W.ut, sessionKeyOf: (s, id) => 'webui:' + id, now: () => Date.now() + W.skip, log: { log: (l) => W.logs.push(l) }, setTimer: () => null, clearTimer: () => { } });
  W.watch = W.mkWatch();
  W.at = async (min) => { W.skip = min * MIN; const r = await W.watch.sweep(); await tick(); return r; };
  W.mine = () => { const sn = W.ut.snapshot(); return [...sn.open, ...(sn.resolved || [])].filter((i) => String(i.itemKey || '').startsWith(WATCH.ITEM_KEY)); };
  W.open = () => W.mine().filter((i) => i.status === 'open');
  W.slot = (who = A) => (deliver.stashEntries(who) || []).filter((e) => e.slot === WATCH.SLOT);
  W.queueWakes = async (gid, texts, to = X) => {
    for (const text of texts) await W.eng.post({ group: gid, from: A, text, wake: true });
    const have = W.deliver.queuedEntries(to).length;
    for (let i = 0; i < texts.length; i++) { W.deliver.noteQueueItems(to, Array.from({ length: have - texts.length + i + 1 }, (_, k) => ({ id: 'q' + (k + 1), kind: 'peer', from: 'alpha' })), { fresh: true }); W.deliver.settleRpcDelivery(to, { ok: true, mode: 'queued' }); }
    await tick();
  };
  W.drain = async (left, to = X) => { W.deliver.noteTurnEnded(to); W.deliver.noteQueueItems(to, left.map((id) => ({ id, kind: 'peer', from: 'alpha' })), { fresh: true }); W.deliver.noteTurnStarted(to); await tick(); await tick(); };
  W.report = async (who = X) => { const rep = W.eng.reportsForTurn(who); if (rep && rep.marks) await W.eng.commitReports(who, rep.marks); await tick(); };
  W.r = (who = X, olderThan = 0) => W.eng.readWaiting(who, { now: Date.now() + W.skip, olderThan });
  return W;
}
const pair = async (W, text = 'hello', to = X) => (await W.eng.sendToAgent({ from: A, to, text, wake: false })).group.id;
const sum = (r) => r.groups.reduce((a, g) => a + (g.n || 0), 0);

console.log('LAW 2 — «NOT YET HANDED» IS ASKED OF THE HUB\'S OWN RECORD AT THAT MOMENT (nothing kept)');
{
  const W = world('antigravity');
  const gid = await pair(W);
  await W.queueWakes(gid, ['are you there?', 'still waiting', 'please reply']);
  const r = await W.r();
  ok('the reading: the quiet message and the three frames law 1 queued behind the turn (the marker moved at once; the frames still hold them) — 4, the oldest the first message\'s own instant, all alpha\'s',
    r.groups.length === 1 && r.groups[0].n === 4 && r.groups[0].senders[A].n === 4 && r.groups[0].oldest === r.groups[0].senders[A].oldest && r.groups[0].atLeast === false, J(r));
  await W.eng.post({ group: gid, from: X, text: 'working on it — progress line', wake: false });
  W.eng.read({ by: X, group: gid, limit: 50 });
  ok('NOT «answered», NOT «read by itself»: a progress post by the member and its own read of the group leave 4 not handed', sum(await W.r()) === 4);
  await W.drain(['q2', 'q3']);
  ok('a turn CARRIES the first frame (it held the quiet message too) ⇒ handed: 2 left', sum(await W.r()) === 2, J(await W.r()));
  const ge = read('src/server/groups-engine.js');
  ok('nothing is kept for it: no ledger file, no seq, no wait record, no told mark — the reading reads the log off the loop (readFoldedAsync over the store\'s async tail) through the report\'s own reach (reachFor)',
    !fs.existsSync(path.join(W.dir, 'channels', 'group-waits')) && !/waitsAt|waitTold|"waits":/.test(fs.readFileSync(path.join(W.dir, 'channels', 'groups.json'), 'utf8'))
      && /async function readWaiting\(cid[\s\S]*?await readFoldedAsync\(g0\.id[\s\S]*?const take = unreceivedFor\(g, cid\);/.test(ge) && /function unreceivedFor\(g, who\) \{\n    const mode = modeOf\(g, who\);\n    const reach = mode === 'mention' \? reachFor\(g, who\) : null;/.test(ge));
}
{
  const W = world('antigravity');
  const gid = await pair(W);
  W.skip = 30 * MIN;
  const before = W.eng.waitingReads();
  const r = await W.r(X, WW.SENDER_MS);
  ok('THE GATE IS THE MARK: a group whose mark is younger than an hour is not read at all (0 log reads) — a 30-minute message cannot be an hour old', r.reads === 0 && W.eng.waitingReads() === before && r.groups.length === 0, J(r));
  W.skip = 61 * MIN;
  const r2 = await W.r(X, WW.SENDER_MS);
  ok('…and at 61 minutes it is (one read): the gate is the persisted mark, so a restart changes nothing', r2.reads === 1 && r2.groups.length === 1, J(r2));
  void gid;
}
{
  const W = world('antigravity');
  const gid = await pair(W);
  await W.eng.setNotify({ by: X, group: gid, member: X, notify: 'mute' });
  const mute = await W.r();
  const W2 = world('antigravity'); const g2 = await pair(W2); await W2.eng.post({ group: g2, from: X, text: 'mine', wake: false });
  const own = (await W2.r()).groups[0];
  const W3 = world('antigravity'); const g3 = await pair(W3); await W3.eng.archive({ by: A, group: g3 });
  const arch = await W3.r();
  const W4 = world('antigravity'); await pair(W4); await W4.eng.onConversationEnded(X, { why: 'archived' });
  const ended = await W4.r();
  ok('nothing for a MUTED member (the report hands it nothing), an ARCHIVED group, an ENDED conversation; a member\'s OWN message never waits for it', mute.groups.length === 0 && arch.groups.length === 0 && ended.groups.length === 0 && own.n === 1 && !own.senders[X], J({ mute, arch, ended, own }));
}

console.log('LAW 1 — ONLY A CONVERSATION IN A RUNNING TURN; THE SENDER AT ONE HOUR, ONE KEYED ENTRY');
{
  const W = world('antigravity');
  W.S._isStreaming = false;
  const gid = await pair(W);
  await W.at(61); await W.at(241);
  ok('an IDLE conversation\'s quiet mail waits by design: nothing told, nothing filed — and not read', W.slot().length === 0 && W.open().length === 0 && W.eng.waitingReads() === 0);
  void gid;
}
{
  const W = world('antigravity');
  const gid = await pair(W);
  await W.queueWakes(gid, ['one', 'two', 'three']);
  await W.at(59);
  ok('the sender: nothing at 59 minutes', W.slot().length === 0);
  await W.at(61);
  const r = await W.r();
  const want = `(VibeSpace) Your group messages have not been handed yet: to xray (4, the oldest sent at ${OF.when(r.groups[0].oldest)}; in a turn since ${OF.when(W.S._turnOpenSaidAt)}).`;
  const e = W.slot()[0];
  ok('at 61 minutes ONE waiting entry in the sender\'s keyed slot: how many, the oldest, «in a turn since» (the record\'s opening), the zone named (owner-facts.when)', W.slot().length === 1 && e.text === want && e.whole === true && e.kind === 'notification', J({ got: e && e.text, want }));
  await W.eng.post({ group: gid, from: A, text: 'four', wake: false });
  await W.at(66); await W.at(71);
  ok('NEVER THE SAME SET TWICE: more messages to the same member ⇒ the entry is not filed again (one entry, its first words)', W.slot().length === 1 && W.slot()[0].text === want, J(W.slot().map((x) => x.text)));
  const took = W.deliver.drainStash(A);
  await W.at(76); await W.at(81);
  ok('…and once HANDED (drained into the sender\'s turn) the same set is not filed again — the slot remembers the set it handed, in the stash file', took.some((x) => x.slot === WATCH.SLOT) && W.slot().length === 0 && /"__slots"/.test(fs.readFileSync(path.join(W.dir, 'msg-stash.json'), 'utf8')), J(W.slot()));
  const gy = await pair(W, 'to yank', Y);
  await W.at(142);
  ok('a member JOINS the set (alpha\'s message to yank has waited an hour too) ⇒ filed again, naming both', W.slot().length === 1 && /to xray \(/.test(W.slot()[0].text) && /to yank \(1, sent at /.test(W.slot()[0].text), J(W.slot().map((x) => x.text)));
  await W.drain([]); await W.report(); await W.report(Y);
  await W.at(143);
  ok('the set EMPTIES (xray\'s frames carried and both reported) ⇒ the standing entry leaves', W.slot().length === 0, J(W.slot()));
  void gy;
}
{
  const W = world('claude');
  const gid = await pair(W);
  await W.at(61);
  ok('claude: a quiet message behind its turn waits for its next report and IS said — «in a turn», never «since» (no record states its opening)', W.slot().length === 1 && / in a turn\)\.$/.test(W.slot()[0].text) && !/since \d/.test(W.slot()[0].text.split('; ').pop()), J(W.slot().map((x) => x.text)));
  void gid;
}
{
  const W = world('antigravity');
  await pair(W);
  for (let i = 0; i < 30; i++) W.deliver.stashFor(A, { source: 'agent', kind: 'peer', fromName: 'peer-' + i, text: 'real entry ' + i });
  await W.at(61);
  const q = W.deliver.stashEntries(A);
  ok('the keyed slot is NEVER counted against the 30 and never evicts: 30 real entries + the waiting one, none lost', q.length === 31 && q.filter((e) => !e.slot).length === 30 && W.slot().length === 1, J(q.length));
  W.deliver.stashFor(A, { source: 'agent', kind: 'peer', fromName: 'peer-30', text: 'real entry 30' });
  const q2 = W.deliver.stashEntries(A);
  ok('…a 31st real entry drops the oldest REAL one (the cap as before), the waiting entry stays', q2.filter((e) => !e.slot).length === 30 && !q2.some((e) => e.text === 'real entry 0') && W.slot().length === 1);
  const pm = renderMsgStash(W.slot(), { maxBytes: 6144 });
  ok('…and its text reaches the sender\'s turn UNBROKEN (rendered whole, never cut to a 400-character line)', pm.text.includes(W.slot()[0].text), pm.text.slice(0, 300));
}

console.log('THE OWNER — ONE ITEM PER CONVERSATION AND TURN AT FOUR HOURS; TWO END WORDS');
{
  const W = world('antigravity');
  const gid = await pair(W);
  await W.queueWakes(gid, ['one', 'two', 'three']);
  await W.at(239);
  ok('no item at 239 minutes (the bound is 240 — a constant) and the sweep runs every five minutes', W.open().length === 0 && WW.OWNER_MS === 240 * MIN && WW.TICK_MS === 5 * MIN && WW.SENDER_MS === 60 * MIN);
  await W.at(241);
  const it = W.open()[0], r = await W.r();
  const words = WW.ownerWords({ name: 'xray', n: 4, since: r.groups[0].oldest, openedAt: W.S._turnOpenSaidAt, card: false });
  ok('at 241 minutes ONE item: «4 group messages have not been handed to xray yet — the oldest sent at T» + «Its turn opened at T2.», every instant a param the viewer\'s zone says; keyed by the conversation and the turn',
    !!it && it.text === words.text && J(it.i18n) === J(words.i18n) && it.itemKey === WATCH.ITEM_KEY + X + ':' + W.S._turnOpenSaidAt, J(it && { text: it.text, key: it.itemKey }));
  ok('its ONLY door opens the conversation (one jump button); its two end words', !!ROW && ROW.buttons.length === 1 && ROW.buttons[0].door === 'jump' && J(Object.keys(ROW.endWords)) === J(['handed', 'turn-ended']) && J(WATCH.OWN_ENDS) === J(['handed', 'turn-ended']));
  await W.eng.post({ group: gid, from: A, text: 'five', wake: false });
  await W.at(246);
  ok('a fifth message ⇒ the SAME item, drawn again: «5 group messages …»', W.mine().length === 1 && W.open()[0].id === it.id && W.open()[0].text.startsWith('5 group messages'), J(W.open().map((i) => i.text)));
  await W.drain(['q2', 'q3']); await W.drain(['q3']); await W.drain([]); await W.report();
  await W.at(251);
  const done = W.mine().find((i) => i.id === it.id);
  ok('every message handed ⇒ it ends «they were handed to it»', done.status !== 'open' && done.resolvedBy === 'handed' && FA.endWordsOf(ROW.type).handed === 'they were handed to it', J(done && done.resolvedBy));
}
{
  const W = world('antigravity');
  await pair(W);
  await W.at(241);
  const it = W.open()[0];
  W.S._isStreaming = false;
  await W.at(246);
  const done = W.mine().find((i) => i.id === (it && it.id));
  ok('the turn ENDS ⇒ it ends «the turn ended» (an idle conversation\'s mail waits by design)', !!done && done.resolvedBy === 'turn-ended' && FA.endWordsOf(ROW.type)['turn-ended'] === 'the turn ended', J(done && done.resolvedBy));
  W.sessions.delete('w-x');
  W.S._isStreaming = true; W.S._turnOpenSaidAt = W.T_OPEN + 300 * MIN;
  W.sessions.set('w-x', W.S);
  await W.at(500);
  ok('a NEW turn ⇒ a new item under the new turn\'s key (one per conversation and turn)', W.mine().length === 2 && W.open().length === 1 && W.open()[0].itemKey === WATCH.ITEM_KEY + X + ':' + W.S._turnOpenSaidAt, J(W.mine().map((i) => [i.itemKey, i.status])));
}
{
  const W = world('antigravity');
  await pair(W);
  await W.at(241);
  const it = W.open()[0];
  W.ut.setStatus(it.id, 'done', 'user');
  await W.at(246); await W.at(300);
  ok('a PERSON\'S ✕ stands for that turn: nothing filed again while it runs', W.open().length === 0 && W.mine().length === 1, J(W.mine().map((i) => [i.status, i.resolvedBy])));
  W.ut.setStatus(it.id, 'open', 'user');   // the Undo
  await W.eng.post({ group: (await W.eng.listFor(X))[0]?.id || W.mine()[0].action.cid, from: A, text: 'more', wake: false }).catch(() => null);
  await W.at(305);
  const re = W.open()[0];
  const r = await W.r();
  ok('an UNDO of the ✕ is drawn again at the next sweep (its own words compared — never a memory of them)', !!re && re.id === it.id && re.i18n.text.params.n === sum(r), J({ re: re && re.text, n: sum(r) }));
  // a restart: a new watch (no memory) and a new For-you store over the same disk
  W.ut.flush(); W.ut = W.mkUt(); W.watch = W.mkWatch();
  await W.at(310); await W.at(315);
  ok('A RESTART adopts the open item as this turn\'s (the same id, no second)', W.mine().length === 1 && W.open().length === 1 && W.open()[0].id === it.id, J(W.mine().map((i) => [i.id, i.status])));
  W.ut.setStatus(it.id, 'done', 'user'); W.ut.flush(); W.ut = W.mkUt(); W.watch = W.mkWatch();
  await W.at(320); await W.at(400);
  ok('…and a ✕\'d item too: the ✕ stands across the restart (two turns across a restart read as one — the kb says so)', W.open().length === 0 && W.mine().length === 1, J(W.mine().map((i) => [i.status, i.resolvedBy])));
}
{
  const W = world('antigravity');
  await pair(W);
  await W.at(241);
  ok('(an item filed)', W.open().length === 1);
  W.ut = W.mkUt(); W.watch = W.mkWatch();   // killed inside the For-you store's debounce: the item never reached its file
  await W.at(246);
  ok('a KILL inside the For-you debounce after a filing: the next sweep files it again — ONE item', W.mine().length === 1 && W.open().length === 1, J(W.mine().length));
  const it = W.open()[0];
  W.watch = W.mkWatch(WATCH, () => ({ ...W.eng, readWaiting: async () => { throw new Error('the reading failed'); } }));
  await W.at(500);
  ok('a reading NOT TAKEN (it failed) says nothing and ends nothing: the item stays open', W.open().length === 1 && W.open()[0].id === it.id);
  W.watch = W.mkWatch();
  await W.report();
  await W.at(505);
  ok('an open item whose conversation no longer waits ends at the next reading — «they were handed to it»', W.open().length === 0 && W.mine()[0].resolvedBy === 'handed');
}

console.log('THE BOUND — NO COUNT, «SINCE AT LEAST»');
{
  const W = world('antigravity');
  const gid = await pair(W);
  for (let i = 0; i < 2010; i++) W.st.appendRecords(G.GROUP_ADAPTER_ID, gid, [{ ...W.st.readTail(G.GROUP_ADAPTER_ID, gid, { limit: 1 })[0], vendorId: 'gm-bulk-' + i, at: Date.now() + i + 10, text: 'bulk ' + i }]);
  await W.st.groups.update((gr) => { gr.groups[gid].lastAt = Date.now() + 2020; });
  W.skip = 241 * MIN;
  const r = await W.r();
  await W.at(241);
  ok('a member far behind (its mark under 2 010 messages, the read\'s bound 2 000): NO count, its oldest the oldest the read SAW — «since at least» to the owner and the sender', r.groups[0].n === null && r.groups[0].atLeast === true && r.groups[0].senders[A].n === null
    && W.open()[0] && W.open()[0].text.startsWith('Group messages have not been handed to xray yet — since at least ') && /to xray \(since at least /.test((W.slot()[0] || {}).text || ''), J({ r: r.groups[0] && { n: r.groups[0].n, atLeast: r.groups[0].atLeast }, item: W.open()[0] && W.open()[0].text, slot: W.slot().map((x) => x.text) }));
  await W.queueWakes(gid, ['framed']);
  const r2 = await W.r();
  ok('…and a held frame reaching back past the bound says no count either', r2.groups[0].n === null && r2.groups[0].atLeast === true, J(r2.groups[0] && { n: r2.groups[0].n }));
}

console.log('THE CARD · NO BILLED TURN · NOTHING REACHES A CLIENT · THE WORDS · THE REMOVAL');
{
  const ASK_RECORDS = {
    'codex-events': [{ type: 'server_request', payload: { id: 7, method: 'item/commandExecution/requestApproval', params: { command: 'rm -rf build', cwd: '/w', itemId: 'i1' } } }],
    'acp-events': [{ type: 'acp', kind: 'permission_request', requestId: 'soft-1', sessionId: 's', toolCall: { toolCallId: 'tc-1', title: 'run_command', kind: 'execute', rawInput: { command: 'make' } }, options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }] }],
  };
  const rows = [];
  for (const be of Object.keys(C.BACKEND_CAPS).filter((b) => ASK_RECORDS[C.BACKEND_CAPS[b].streamProtocol])) {
    const Wc = world(be); const mm = N.createMessageManager(be, `sid-${be}`); mm.processLive(ASK_RECORDS[C.BACKEND_CAPS[be].streamProtocol][0]); Wc.S._normalizer = mm;
    await pair(Wc); await Wc.at(241);
    rows.push({ be, chip: chipAsksOf(Wc.S).length, slot: (Wc.slot()[0] || {}).text || '', item: (Wc.open()[0] || {}).detail || '' });
  }
  ok('the card, on every harness speaking codex-events or acp-events, through its REAL normalizer: «a waiting-for-you card is open in it» to the sender and the owner', rows.length >= 3 && rows.every((r) => r.chip > 0 && /a waiting-for-you card is open in it\)\.$/.test(r.slot) && /A waiting-for-you card is open in it\./.test(r.item)), J(rows));
}
{
  const W = world('antigravity');
  const gid = await pair(W);
  await W.queueWakes(gid, ['one']);
  const m0 = J(W.money), f0 = W.frames.length;
  await W.at(61); await W.at(241); await W.at(246);
  ok('no billed turn: the sweeps that told the sender and filed the item asked the spend gate for nothing and wrote no frame', J(W.money) === m0 && W.frames.length === f0 && W.slot().length === 1 && W.open().length === 1);
  const views = [J(W.eng.get(gid)), J(W.eng.read({ by: X, group: gid, limit: 50 }).group), J(W.eng.list ? W.eng.list() : null), ...W.sent.map((m) => J(m))];
  ok('nothing of the reading reaches a client: no view, read answer or broadcast carries it (the item and the sender\'s entry are its only surfaces)', views.every((v) => !/"senders"|"atLeast"|"waitsAt"|"waitTold"/.test(String(v))) && W.sent.length > 0, J(views.filter((v) => /"senders"|"atLeast"/.test(String(v))).map((v) => v.slice(0, 120))));
  const src = read('src/server/wait-watch.js') + read('src/wait-words.js');
  ok('…the watch and its words name no spend door and no wake', !/authorize|noteSpend|releaseSpend|spendGuard|wake:\s*true|\.post\(/.test(src));
}
{
  const BANNED = /\b(quiet|stuck|alive|hung|frozen|silent|idle|working|asleep|dead|unresponsive|nothing shown|no command|answered|read it)\b|卡住|卡顿|卡死|没反应|无响应|安静|假死|止まっ|固ま|応答なし|静か/i;
  const keys = [...Object.values(WW.OWNER_TEXT), ...Object.values(WW.OWNER_LINES), ...ROW.buttons.flatMap((b) => [b.label, b.title]), ...Object.values(ROW.endWords)];
  const dict = (rel) => { const s = read(rel); return keys.map((k) => { const m = new RegExp(J(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*("(?:[^"\\\\]|\\\\.)*")').exec(s); return m ? JSON.parse(m[1]) : null; }); };
  const zh = dict('src/lib/i18n-zh.js'), ja = dict('src/lib/i18n-ja.js');
  const said = [...keys, WW.senderEntry([{ name: 'x', n: 2, oldestText: 'T', openedText: 'T2', card: true }, { name: 'y', n: null, oldestText: 'T3', openedText: null }]), ...zh, ...ja];
  ok('THE WORDS say what the hub did (handed or not) — no verdict word in en / zh / ja; every key translated; zh says «hub» as the product does, never «中枢»', said.every((x) => x && !BANNED.test(x)) && zh.every(Boolean) && ja.every(Boolean) && !zh.some((x) => /中枢/.test(x)), J({ hits: said.filter((x) => x && BANNED.test(x)), missing: keys.filter((k, i) => !zh[i] || !ja[i]) }));
  const name = 'a {since} $& name';
  ok('…a name holding «{since}» or a «$» pattern cannot corrupt the stored English text', WW.ownerWords({ name, n: 2, since: 1_800_000_000_000 }).text.startsWith(`2 group messages have not been handed to ${name} yet`));
  const files = String(require('node:child_process').execFileSync('git', ['ls-files', '-z', 'src', 'server.js', 'data/bin'], { cwd: REPO })).split('\0').filter((f) => f && (/\.(js|mjs|cjs)$/.test(f) || f.startsWith('data/bin/')));
  const GONE = /group-waits|waitsAt|loadWaits|keptFrom|nothingBehind|setWaitRecord|waitRecord\(|noteStillWaiting|waitTold|waitsOf\(|refillWaits|migrateWaits|waitingFor\(|WAIT_READS_PER_MIN|readSeen|handedAtOnce|adoptOf|_turnQuietSince|_turnLifeBack|lifeWitness|quiet-turn|\/api\/turn-quiet|2026-11-waits-kept/;
  const left = files.filter((f) => { try { return GONE.test(read(f)); } catch { return false; } });
  if (/applyMarks|stampWaits|function keep\(/.test(read('src/server/groups-engine.js'))) left.push('src/server/groups-engine.js (the cut\'s keep / applyMarks / stampWaits)');
  if (/test-group-waits|group-waits/.test(read('scripts/ci.mjs'))) left.push('scripts/ci.mjs (a test-group-waits row)');
  ok('THE REMOVAL (the deletion list of the page, against the cut 9a9b3a65a and shape B): no ledger store, seq, load, kept instants, wait record, told mark, waitsOf, migration — none of shape B\'s definitions either; the cut\'s and shape B\'s end words gone',
    left.length === 0 && !fs.existsSync(path.join(REPO, 'src/server/group-waits.js')) && !fs.existsSync(path.join(REPO, 'scripts/test-group-waits.mjs')) && !/not delivered — the hub dropped them|the conversation or its group is gone|it was muted in that group|It is not in a turn now\./.test(read('src/foryou-actions.js') + read('src/lib/i18n-zh.js') + read('src/lib/i18n-ja.js') + read('src/wait-words.js')), J(left));
}

console.log('RED CONTROLS — patched copies, each rule taken out');
{
  const copy = (rel, edits) => { let src = read(rel); for (const [a, b] of edits) { if (!src.includes(a)) return { err: 'needle missing: ' + a.slice(0, 60) }; src = src.split(a).join(b); } return { mod: require(MUT.write(rel, src, 'm')) }; };
  const ma = copy('src/server/groups-engine.js', [['      if (!((Number(g0.lastAt) > fl0 && fl0 <= cut) || heldOf(m0).some((q) => fromOf(m0, q) <= cut))) continue;', '      if (!(Number(g0.lastAt) > fl0 || heldOf(m0).length)) continue;']]);
  { const W = world('antigravity', { mods: { GE: ma.mod } }); await pair(W); W.skip = 30 * MIN; const r = await W.r(X, WW.SENDER_MS);
    ok('CONTROL: the gate taken out ⇒ a 30-minute mark is read (the gate leg red)', !!ma.mod && r.reads === 1, ma.err || J(r)); }
  const mb = copy('src/server/groups-engine.js', [['      const take = unreceivedFor(g, cid);', '      const take = (r) => isMessage(r) && G.reachesReport(g, cid, r);']]);
  { const bare = async (mod) => {
      const st = createChannelStore({ dir: path.join(fs.mkdtempSync(path.join(ROOT, 'bare-')), 'channels') });
      const e = mod.create({ store: st, roster: () => [{ cid: A, name: 'alpha', groups: ['tg1'], reachability: null }, { cid: X, name: 'xray', groups: ['tg1'], reachability: null }], groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
      const gid = (await e.sendToAgent({ from: A, to: X, text: 'hello', wake: false })).group.id;
      await e.setNotify({ by: X, group: gid, member: X, notify: 'mention' });
      await e.post({ group: gid, from: X, text: 'a question for you', wake: false, awaitReply: true });
      await e.post({ group: gid, from: A, text: 'the answer', wake: false });
      return sum(await e.readWaiting(X, { olderThan: 0 }));
    };
    const bad = mb.mod ? await bare(mb.mod) : null, good = await bare(GE);
    ok('CONTROL: the reach without the report\'s `also` (an awaited reply reaches its `mention` asker) ⇒ the answer is not counted (the reach leg red); the tree counts it', !!mb.mod && bad === 0 && good === 1, mb.err || J({ bad, good })); }
  const mc = copy('src/server/conversation-deliver.js', [['    over -= q.filter((e) => e && e.slot && !e.ho).length;', '    void 0;']]);
  { const W = world('antigravity'); const dir = W.dir; void dir;
    const D2 = mc.mod && mc.mod.create({ dataDir: fs.mkdtempSync(path.join(ROOT, 'dm-')), activeSessions: new Map(), serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => true, log: () => { } });
    if (D2) { for (let i = 0; i < 30; i++) D2.stashFor(A, { source: 'agent', kind: 'peer', fromName: 'p' + i, text: 'real ' + i }); D2.stashSlot(A, 'waiting', { text: 'waiting' }, { set: [X] }); D2.stashFor(A, { source: 'agent', kind: 'peer', fromName: 'p30', text: 'real 30' }); }
    ok('CONTROL: the slot counted against the cap ⇒ a 31st real entry evicts TWO real ones (the cap leg red; the tree drops one)', !!D2 && D2.stashEntries(A).filter((e) => !e.slot).length === 29, mc.err || J(D2 && D2.stashEntries(A).length)); }
  const md = copy('src/server/conversation-deliver.js', [["    for (const e of took || []) if (e && e.slot) (slots[cid] || (slots[cid] = {}))[e.slot] = { handed: e.setKey || '[]', at: Date.now() };", '    void took;']]);
  { const W = world('antigravity', { mods: {} }); void W;
    const D3 = md.mod && md.mod.create({ dataDir: fs.mkdtempSync(path.join(ROOT, 'dm-')), activeSessions: new Map(), serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => true, log: () => { } });
    let again = null;
    if (D3) { D3.stashSlot(A, 'waiting', { text: 'w' }, { set: [X] }); D3.drainStash(A); again = D3.stashSlot(A, 'waiting', { text: 'w' }, { set: [X] }); }
    ok('CONTROL: a slot that forgets the set it handed ⇒ the same set is filed again after the drain (rule a red)', !!D3 && again && again.filed === true, md.err || J(again)); }
  const me = copy('src/server/wait-watch.js', [["        if (cid && !running.has(cid)) end(it, 'turn-ended');", '        void cid;']]);
  { const W = world('antigravity', { mods: { WATCH: me.mod } }); await pair(W); await W.at(241); W.S._isStreaming = false; await W.at(246);
    ok('CONTROL: a watch without the turn\'s end ⇒ the item stays open after the turn ended (the end leg red)', !!me.mod && W.open().length === 1, me.err || J(W.open().length)); }
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
