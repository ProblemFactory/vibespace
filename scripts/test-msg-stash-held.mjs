#!/usr/bin/env node
// test-msg-stash-held — r3003 (a) (主开发, lane hub-loop-stalls): data/msg-stash.json UNDER THE STORE-READ LAW (src/store-read-hold.js),
// through the REAL src/server/conversation-deliver.js and src/server/stash-handover.js over a scratch data folder of this suite's own
// (made-up entries). The unreadable file is a PLACED refusal of the read call (fs.readFileSync answers EIO for that one path, the next
// read only), never a mount, never a mode change; torn bytes are bytes written whole that do not parse. No vendor call; nothing else.
// Each law: its leg, and the RED (the release's read put back in a copy) where a line can be put back.
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const CD = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const SH = require(path.join(REPO, 'src/server/stash-handover.js'));
const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
const { renderMsgStash } = require(path.join(REPO, 'src/agent-routes.js'));
const { renderNotifStash } = require(path.join(REPO, 'src/job-model.js'));
const S = require(path.join(REPO, 'src/stash-summary.js'));
const M = mutantCopies('msg-stash-held', REPO);
const EIO = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
/** a PLACED refusal of the next `n` sync reads of `file` (EIO), then real reads */
const placeReads = (file, n = 1) => {
  const f = path.resolve(file), realS = fs.readFileSync; const seen = { sync: 0 };
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f && seen.sync < n) { seen.sync++; throw EIO(); } return realS.call(this, p, ...a); };
  return { seen, restore: () => { fs.readFileSync = realS; } };
};
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
/** a PLACED refusal of the next `n` sync writes of `file` (EIO) — the side copy's write failing while held */
const placeWrites = (file, n = 1) => {
  const f = path.resolve(file), realW = fs.writeFileSync; let seen = 0;
  fs.writeFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f && seen < n) { seen++; throw EIO(); } return realW.call(this, p, ...a); };
  return { restore: () => { fs.writeFileSync = realW; } };
};
const SIDE = 'msg-stash-held.json';   // r3326: the side copy beside the list
const modeOf = (f) => { try { return fs.statSync(f).mode & 0o777; } catch { return null; } };
/** the side copy's removal is OFF the loop: wait until it is gone (a bound, never a fixed sleep) */
const goneSide = async (F) => { const p = path.join(path.dirname(F), SIDE); for (let i = 0; i < 200 && fs.existsSync(p); i++) await sleep(2); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let dirN = 0;
const mk = () => { const d = path.join(scratch('msg-stash-held'), 'd' + (++dirN)); fs.mkdirSync(d, { recursive: true }); return d; };
const CA = 'c0ffee00-0000-4000-8000-0000000000a1', CB = 'c0ffee00-0000-4000-8000-0000000000b2', CC = 'c0ffee00-0000-4000-8000-0000000000c3';
const BEFORE = { [CA]: [{ source: 'agent', kind: 'peer', fromName: 'Ada', text: 'a message waiting for the next turn', ts: 1 }],
  [CB]: [{ source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a receipt waiting', ref: 'p-1', ts: 2 }] };
const BYTES = JSON.stringify(BEFORE);
const deps = (dir, extra = {}) => ({ dataDir: dir, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }) }, getHosts: () => null, getConvIndex: () => null,
  serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => { }, log: () => { }, ...extra });
const both = (j) => !!j && [CA, CB].every((c) => Array.isArray(j[c]) && j[c].length >= 1);
const heldStart = (Mod = CD, dir = mk(), bytes = BYTES) => { const F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, bytes); const pr = placeReads(F); let D = null; try { D = Mod.create(deps(dir)); } finally { pr.restore(); } return { D, F, dir, seen: pr.seen.sync }; };
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return (e && e.code) || 'threw'; } };

console.log('§1 a stash that could not be read is HELD: nothing is written over it; what comes meanwhile is ACCEPTED beside it (the side copy), and both come back whole');
{
  // CONTROL: the read answers ⇒ the stop keeps both conversations' entries
  const d0 = mk(), F0 = path.join(d0, 'msg-stash.json'); fs.writeFileSync(F0, BYTES);
  const D0 = CD.create(deps(d0)); D0.flush();
  ok(both(readJson(F0)) && D0.stashHeld() === null && !fs.existsSync(path.join(d0, SIDE)), 'CONTROL: the stash read at the start ⇒ the stop keeps both conversations\' waiting entries, nothing held, no side copy', readJson(F0));
  const { D, F, dir, seen } = heldStart();
  const held = D.stashHeld();
  ok(seen === 1 && !!held && held.code === 'EIO' && /could not be read/.test(D.stashUnreadWords() || ''), `PLANT: the start's one read answered EIO ⇒ HELD (${held && held.code}), its words say so`, held);
  D.flush();
  ok(fs.readFileSync(F, 'utf8') === BYTES, 'HELD: the hub stop (deliver.flush) writes NOTHING over the list — its bytes as they were', fs.readFileSync(F, 'utf8').slice(0, 80));
  // r3326 (a): every entry stashed while held — with a ref or without — is ACCEPTED as when the list reads: memory AND the side copy
  const evs = []; D.onStash((ev, cid) => evs.push(ev + ':' + cid));
  const st1 = D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'a message stashed while held' });
  const st2 = D.stashFor(CC, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a receipt while held', ref: 'p-2' });
  const side = readJson(path.join(dir, SIDE)) || {};
  const sideQ = side[CC] || [];
  ok(st1 && st1.stored === true && st2 && st2.stored === true && evs.filter((x) => x === 'stashed:' + CC).length === 1 && !evs.includes('unwritten:' + CC), 'HELD: an entry without a ref AND one with a ref are accepted — «stored»; the ref\'d producer hears «stashed» after its bytes are on disk', { st1, st2, evs });
  ok(fs.readFileSync(F, 'utf8') === BYTES && sideQ.length === 2 && sideQ.every((e) => typeof e.sid === 'string' && e.sid) && sideQ[1].ref === 'p-2' && typeof side.__gen === 'string', `HELD: both in the side copy beside the list (${SIDE}: ${sideQ.length}, each with its acceptance id, the copy's generation ${side.__gen}); the list untouched`, side);
  ok(modeOf(path.join(dir, SIDE)) === 0o600, `the side copy holds people's messages: 0600 from its create (${(modeOf(path.join(dir, SIDE)) || 0).toString(8)})`);
  // a road that DECIDES from the stash (a receipt's fate, a dedupe) is told «unknown»: stashPeek throws the hold's refusal
  ok(codeOf(() => D.stashPeek(CB)) === 'msg_stash_unread', 'HELD: stashPeek (a road that decides from the stash) is refused by name — it decides nothing', codeOf(() => D.stashPeek(CB)));
  // the read again answers ⇒ LIFTED: what the list held, then what was accepted meanwhile — ONE write, the side copy removed after it
  const lifted = await D.stashReadAgain();
  await goneSide(F);
  const after = readJson(F);
  ok(lifted === true && D.stashHeld() === null && both(after) && after[CC] && after[CC].length === 2 && after[CC][0].text === 'a message stashed while held' && after[CC][1].ref === 'p-2' && D.stashPeek(CB).length === 1,
    'LIFTED: both conversations\' entries are back, the two accepted while held after them — on disk in the list, peek answers again', after);
  ok(!fs.existsSync(path.join(dir, SIDE)) && Array.isArray(after.__sideMerged) && after.__sideMerged.includes(side.__gen) && modeOf(F) === 0o600, `LIFTED: the list names the copy merged (__sideMerged ${JSON.stringify(after.__sideMerged)}), then the copy is removed; the list 0600 too`, { exists: fs.existsSync(path.join(dir, SIDE)) });
  // RED: the release's held write (nothing written while held) — the entry has no home but memory
  const SRC0 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const NOSIDE = M.load('src/server/conversation-deliver.js', anchored(SRC0, '    const toSide = !!stashHold.held();', '    if (stashHold.held()) return false; const toSide = false;', 'no-side-copy'), 'no-side-copy');
  const r = heldStart(NOSIDE);
  const rs = r.D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'a message stashed while held' });
  ok(rs && rs.stored === false && !fs.existsSync(path.join(r.dir, SIDE)), 'RED: no side copy — the entry is kept in memory only (a restart loses it)', rs);
}

console.log('§2 a restart while held reads the same file again; the RED: the release\'s read');
{
  const { F, dir } = heldStart();
  const pr = placeReads(F); let D2 = null; try { D2 = CD.create(deps(dir)); } finally { pr.restore(); }
  D2.flush();
  ok(!!D2.stashHeld() && fs.readFileSync(F, 'utf8') === BYTES, 'a restart while the file still fails to read: held again, the file untouched by the stop', D2.stashHeld());
  // RED: the release's read put back (any failure ⇒ the empty stash) — the stop writes the file over
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const OLD = M.load('src/server/conversation-deliver.js', anchored(SRC, "    if (stashHold.start(a0) === 'data') stash = a0.value; }", "    if (a0.state === 'data') stash = a0.value; }", 'stash-old-read'), 'stash-old-read');   // stale-pins: kept — the release's read (any failure an empty stash), planted back as the RED
  const r = heldStart(OLD);
  r.D.flush();
  ok(!both(readJson(r.F)), `RED: the release's read — a failed read is an empty stash and the stop writes it over (${fs.readFileSync(r.F, 'utf8').slice(0, 40)})`, readJson(r.F));
}

console.log('§3 torn bytes: kept aside once, then the stash starts from what memory holds; the instant is remembered');
{
  const dir = mk(), F = path.join(dir, 'msg-stash.json'), TORN = BYTES.slice(0, 50);
  fs.writeFileSync(F, TORN);
  const D = CD.create(deps(dir));
  for (let i = 0; i < 200 && D.stashHeld(); i++) await sleep(10);   // the copy is made off the loop, then it lifts
  const t = D.stashTorn(), copies = fs.readdirSync(dir).filter((n) => n.startsWith('msg-stash.json.corrupt-'));
  const copyBytes = copies.length ? fs.readFileSync(path.join(dir, copies[0]), 'utf8') : null;
  ok(!D.stashHeld() && !!t && copies.length === 1 && copyBytes === TORN && t.copy === copies[0], `TORN: the bytes kept aside ONCE (${copies.join(', ')}), byte for byte; the lift names the copy`, { t, copies });
  const after = readJson(F);
  ok(!!after && Number.isFinite(after.__tornAt) && D.stashTornAt() === after.__tornAt, 'TORN: the stash written fresh carries the torn instant (`__tornAt`): a remover reading its silence knows what it could not have held', after);
  // the next start: the same instant read back (across a restart)
  const D3 = CD.create(deps(dir));
  ok(D3.stashTornAt() === after.__tornAt && !D3.stashHeld(), 'TORN: the next start reads the instant back — still known after a restart', D3.stashTornAt());
  // a second start over the SAME torn bytes makes no second copy
  const dir2 = mk(), F2 = path.join(dir2, 'msg-stash.json'); fs.writeFileSync(F2, TORN);
  fs.writeFileSync(path.join(dir2, 'msg-stash.json.corrupt-1'), TORN);
  const D4 = CD.create(deps(dir2));
  for (let i = 0; i < 200 && D4.stashHeld(); i++) await sleep(10);
  ok(!D4.stashHeld() && !!D4.stashTorn() && D4.stashTorn().copy === 'msg-stash.json.corrupt-1' && fs.readdirSync(dir2).filter((n) => n.startsWith('msg-stash.json.corrupt-')).length === 1, 'TORN: the same torn bytes already beside the store ARE their copy — it lifted, none made again', fs.readdirSync(dir2));
}

console.log('§4 a clear made while held reaches the entries when they come back (the stores that own the words judge them again)');
{
  const { D, F } = heldStart();
  // a store-backed judge (as the jobs and groups engines are): Ada's words were cleared while the stash was held
  D.registerStashJudge((e) => (e && e.fromName === 'Ada' ? { text: 'a message whose words were cleared' } : null));
  const liftedJ = await D.stashReadAgain();
  ok(liftedJ === true, 'the read again lifted (the judge\'s leg reads a lifted stash)');
  const a = (readJson(F) || {})[CA] || [];
  ok(a.length === 1 && a[0].text === 'a message whose words were cleared', 'LIFTED: the entry read back is judged again — a clear made while held reaches it', a);
}

console.log('§5 where the person meets it: the strip says the hold, the hand-over is refused by name (never «nothing waiting»)');
{
  const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
  fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true });
  const s = { name: 'Agent One', backend: 'claude', backendSessionId: CA, claudeSessionId: CA, mode: 'chat', _isStreaming: false, buffer: '', sockName: 'cw-w1', socketPath: path.join(dir, 'cw-w1') };
  const sessions = new Map([['w1', s]]);
  const pr = placeReads(F); let D = null; try { D = CD.create(deps(dir, { activeSessions: sessions })); } finally { pr.restore(); }
  const jm = new JobManager({ dataDir: dir, log: () => { }, broadcast: () => { }, onStash: () => { } });
  const view = SH.create({ activeSessions: sessions, getDeliver: () => D, getJobs: () => jm, broadcastSessions: () => { }, renderMsgStash, renderNotifStash, debounceMs: 10, log: { log() { }, warn() { } }, dataDir: dir });
  const sum = view.summaryFor(s);
  const words = S.stashSummaryWords(sum, (x, p) => (p ? x.replace(/\{(\w+)\}/g, (_, k) => p[k]) : x), { reachable: sum && sum.reachable });
  ok(!!sum && !!sum.stashUnread && sum.reachable === false && !!words && /could not be read just now/.test(words.head), `the STRIP while held: it says so in place («${words && words.head}»), no press`, sum);
  const r = await view.handOver('w1');
  ok(r && r.ok === false && r.code === 'msg_stash_unread' && SH.STATUS.msg_stash_unread === 503 && /could not be read/.test(r.error || ''), `the PRESS while held: refused by name (${r && r.code}, 503) — never «nothing is waiting»`, r);
  ok(/could not be read just now/.test(S.handOverRefusalWords({ code: 'msg_stash_unread' }, (x) => x).text), 'the press\'s refusal in the page\'s own words (stash-summary handOverRefusalWords)');
  jm.shutdown?.();
  // r3299 ROW 7: the ENDED rows' waiting fact carries the hold — every stopped row says it, never «nothing waiting»
  const wa = view.waitingAll();
  const WG = await import(new URL('../src/lib/wake-grant-rows.js', import.meta.url).href);
  const w0 = WG.waitingWords({ n: 0, stashUnread: true }), w2 = WG.waitingWords({ n: 2, stashUnread: true });
  ok(!!wa.__stashUnread && wa.__stashUnread.code === 'msg_stash_unread' && /could not be read just now/.test(w0) && /^2 notices are waiting for it · /.test(w2), `ROW 7: held, the ended rows' fact carries the hold (${JSON.stringify(wa.__stashUnread)}) — «${w0}»`, { wa, w0, w2 });
  const SA = require(path.join(REPO, 'src/sessions-assemble.js'));
  void SA;
  // a TORN lift: the strip names where the damaged bytes are kept — never «restore that copy»
  const tw = S.stashSummaryWords({ count: 0, items: [], stashTorn: { copy: 'msg-stash.json.corrupt-1' } }, (x, p) => (p ? x.replace(/\{(\w+)\}/g, (_, k) => p[k]) : x), { reachable: false });
  ok(!!tw && tw.head.includes('msg-stash.json.corrupt-1') && /Send again anything that should still reach them/.test(tw.head) && !/restore/i.test(tw.head), `the STRIP after torn bytes names the copy and what the person can do («${tw && tw.head}»)`);
}

console.log('§5b r3299 row 2c / r3329 (4): an entry kept in memory only (its side copy could not be written) is never lost SILENTLY — the journal counts EVERY one, never a word');
{
  const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
  const logs = [];
  const pr = placeReads(F); let D = null; try { D = CD.create(deps(dir, { log: (...a) => logs.push(a.join(' ')) })); } finally { pr.restore(); }
  const pw = placeWrites(path.join(dir, SIDE + '.tmp'), 99);   // the side copy's every write refused (EIO) while held
  const r1 = D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'secret words one' });
  for (let i = 2; i <= 5; i++) D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'secret words ' + i });
  ok(r1 && r1.stored === false && /could not be read, so this one is kept in memory until they read/.test(r1.why || ''), `the producer hears it: not stored, in memory until the list reads, its cause the hold (${r1 && r1.why})`, r1);
  const said = logs.filter((l) => /kept in memory only/.test(l));
  D.flush(); pw.restore();
  const stop = logs.filter((l) => /kept in memory only this hold/.test(l));
  ok(said.length >= 2 && !said.some((l) => l.includes('secret words')) && /\b1 entry is kept/.test(said[0]) && said.some((l) => /\b4 entries are kept/.test(l)) && stop.length === 1 && /\b5 entries kept in memory only this hold are lost/.test(stop[0]), `ROW 2c: the journal counts every entry kept in memory only — at the first, at each doubling, the whole count at the stop — never a word of a message («${stop[0]}»)`, said.concat(stop));
}

console.log('§6 the round wozyl97qk: the stop while held (the truth), the reserved names, one entry a slot, the owed wake, the hand-back, the park');
{
  // THE STOP WHILE HELD (r3326): an entry accepted while held is in the side copy; the next start (still held) has it back in memory, and a
  // start at which the list READS merges it at once — nothing stranded, nothing twice
  const { D, F, dir } = heldStart();
  D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'accepted while held' });
  D.flush();
  const pr = placeReads(F); let D2 = null; try { D2 = CD.create(deps(dir)); } finally { pr.restore(); }
  ok(fs.readFileSync(F, 'utf8') === BYTES && !!D2.stashHeld() && D2.stashEntries(CC).length === 1 && D2.stashEntries(CC)[0].text === 'accepted while held', 'THE STOP WHILE HELD: a second start still held has the entry back from the side copy; the list untouched');
  D2.flush();
  const D3 = CD.create(deps(dir));
  await goneSide(F);
  const j = readJson(F) || {};
  ok(!D3.stashHeld() && both(j) && (j[CC] || []).length === 1 && j[CC][0].text === 'accepted while held' && !fs.existsSync(path.join(dir, SIDE)), 'A START THAT READS after a held stop: the side copy merged into the list at once, ONCE, then removed — nothing stranded', j);
}
{
  // THE RESERVED NAMES (r3329 (1)) are never a conversation — the list's __slots, __tornAt, __sideMerged and the side copy's __gen, __slots:
  // never counted, handed over, trimmed or drawn
  const dir = mk(), F = path.join(dir, 'msg-stash.json');
  fs.writeFileSync(F, JSON.stringify({ ...BEFORE, __slots: { [CA]: { w: '["x"]' } }, __tornAt: 12345, __sideMerged: ['g-old'], __future: [{ text: 'a reserved name of a later release' }] }));
  const D = CD.create(deps(dir));
  const names = ['__slots', '__tornAt', '__sideMerged', '__gen', '__future'];
  ok(!D.stashCids().some((c) => c.startsWith('__')) && D.stashTornAt() === 12345 && names.every((n) => D.stashEntries(n).length === 0 && D.stashCount(n) === 0), 'THE RESERVED NAMES are never a conversation: not counted, no entries', D.stashCids());
  D.flush();
  const j = readJson(F) || {};
  ok(Array.isArray(j.__sideMerged) && j.__sideMerged[0] === 'g-old' && !('__future' in j) && both(j), 'a write keeps the list\'s own reserved names as its own (an unknown `__` name is never written back as a queue)', j);
  const { D: H, dir: hd } = heldStart();
  H.stashFor(CA, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'one' });
  const side = readJson(path.join(hd, SIDE)) || {};
  ok(typeof side.__gen === 'string' && Object.keys(side).filter((k) => !k.startsWith('__')).join() === CA && !H.stashCids().some((c) => c.startsWith('__')), 'the side copy\'s generation is its own key, never a conversation', side);
}
{
  // ONE ENTRY A SLOT ACROSS THE LIFT: the file holds S's slot entry; while held wait-watch files it again in memory; the lift keeps ONE
  const dir = mk(), F = path.join(dir, 'msg-stash.json');
  fs.writeFileSync(F, JSON.stringify({ [CA]: [{ source: 'agent', fromName: 'VibeSpace', text: 'A waits for you (from the file)', slot: 'wait-watch', ts: 1 }] }));
  const pr = placeReads(F); let D = null; try { D = CD.create(deps(dir)); } finally { pr.restore(); }
  D.stashSlot(CA, 'wait-watch', { source: 'agent', fromName: 'VibeSpace', text: 'A waits for you (filed while held)' }, { set: ['A'] });
  await D.stashReadAgain();
  const slotted = ((readJson(F) || {})[CA] || []).filter((e) => e && e.slot === 'wait-watch');
  ok(slotted.length === 1 && slotted[0].text === 'A waits for you (filed while held)', `ONE ENTRY A SLOT: the slot entry made while held replaces the file's at the lift (${slotted.length})`, slotted);
}
{
  // MUST 1 — AN OWED WAKE MEETS THE HOLD: the park's door answers it held (set aside, owed), never «go» to a hand-over the hold refuses;
  // after the lift the door answers nothing (it goes). RED: the door without the stash's hold (the release's door)
  const ENDED = { id: 'r-1', cid: CA, kind: 'notification', text: 'a job result', producer: 'jobs', producers: ['jobs'], held: { why: 'ended' }, owed: true, attempts: [] };
  const { D } = heldStart();
  const heldNow = D.heldWhyOf(ENDED);
  await D.stashReadAgain();
  const after = D.heldWhyOf(ENDED);
  ok(/could not be read now/.test(heldNow || '') && after === null, `MUST 1: the park's door answers an owed wake held while the stash is held (${heldNow}), nothing after the lift (${after})`);
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const NODOOR = M.load('src/server/conversation-deliver.js', anchored(SRC, "    if (isEnded(e) && isHeld()) return { why: 'the messages waiting for conversations could not be read now (their file is held)', by: null, stash: true };", '', 'door-without-hold'), 'door-without-hold');   // stale-pins: kept — the release's door, planted back as the RED
  const r = heldStart(NODOOR);
  ok(r.D.heldWhyOf(ENDED) === null, 'RED: the door without the stash\'s hold answers «go» — the wake would reach a hand-over the hold refuses, and end «failed»');
  const dw = fs.readFileSync(path.join(REPO, 'src/server/delivery-wake.js'), 'utf8');
  ok(/if \(!claim\.ok && claim\.code === 'msg_stash_unread'\) return \{ ok: false, outcome: 'held', code: 'held'/.test(dw), 'MUST 1 (the belt): a hand-over refused by the stash\'s hold keeps the wake owed (outcome held), never «failed»');
}
{
  // MUST 1, THE REAL PARK (r3299 row 11): an ENDED conversation's owed wake met the hold and was set aside (`stash`, still owed); at the lift it
  // is due AT ONCE — never at its next minute's ask. RED: a lift that only arms the park (the wake sits out its 60 s step)
  const run = async (Mod = CD) => {
    const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
    let now = 1_700_000_000_000; const timers = [];
    const clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
    const fire = async () => { for (let k = 0; k < 6; k++) { const d = timers.filter((t) => !t.dead && !t.ran && t.at <= now); if (!d.length) break; for (const t of d) { t.ran = true; t.fn(); } for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); } };
    const pr = placeReads(F); let D = null;
    try { D = Mod.create(deps(dir, { retryClock: clock, authorizeSpend: () => ({ ok: true, identity: { key: 'acct', name: 'Work' }, hold: { k: 1 } }), noteSpend: () => { }, releaseSpend: () => { } })); } finally { pr.restore(); }
    const parked = D.parkEndedWake(CC, { producer: 'test-owed', spendReason: 'job-notification', reason: 'a job result for an ended conversation' });
    now += 5000; await fire();
    const a = D.retryPeek(CC).find((x) => x && x.producer === 'test-owed');
    const aside = !!(a && a.waitsHeld && a.waitsHeld.stash);
    now += 5000;
    await D.stashReadAgain(); await fire();
    const e = D.retryPeek(CC).find((x) => x && x.producer === 'test-owed');
    return { parked: !!(parked && parked.parked), aside, went: !e || !e.waitsHeld, waitsHeld: e ? e.waitsHeld || null : null };
  };
  const good = await run();
  ok(good.parked && good.aside && good.went, 'MUST 1, THE REAL PARK: an ENDED conversation\'s owed wake met the hold and was set aside (owed, `stash`); at the lift it is judged again AT ONCE', good);
  const SRC2 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const NODUE = M.load('src/server/conversation-deliver.js', anchored(SRC2, "    step('the owed wakes', () => { const dueAt = clock.now(); for (const q of Object.values(retry)) for (const e of q) if (e && e.waitsHeld && e.waitsHeld.stash && !e.inflight) e.nextAt = dueAt; scheduleRetry(); });\n", "    step('the owed wakes', () => { scheduleRetry(); });\n", 'lift-without-due'), 'lift-without-due');
  const red = await run(NODUE);
  ok(red.parked && red.aside && !red.went, 'RED: a lift that only arms the park leaves the wake set aside until its next minute\'s ask', red);
  // a LIVE conversation's paced wake posts to its inbox: the door does not hold it for the list (r3326, the round's over-defence)
  const { D } = heldStart();
  ok(D.heldWhyOf({ id: 'r-2', cid: CC, kind: 'notification', text: 'a paced wake', producer: 'jobs', owed: true, attempts: [] }) === null, 'a LIVE conversation\'s owed wake is not held for the list (it needs no claim)');
}
{
  // THE FOUR HAND-BACK DOORS ARE DONE AS AT THE RELEASE (r3326 (b)): a frame handed back from a gone wrapper while held — its words go to
  // the stash WITH its ref, accepted beside the list (on disk), and the frame is handed back («back» is true: its words are on disk)
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  const run = (Mod = CD) => {
    const { D, dir } = heldStart(Mod);
    fs.mkdirSync(path.join(dir, 'qw'), { recursive: true }); const Q = QW.create({ dataDir: path.join(dir, 'qw'), log: () => { } });
    Q.noteWritten(CA, { text: 'a peer\'s words queued in a wrapper', kind: 'peer', fromName: 'Ada', holder: 'pid-1' });
    const backs = []; Q.onHandedBack((c, e) => backs.push(e && e.id));
    const stash = (e, w) => { D.stashFor(CA, { source: 'agent', kind: 'peer', fromName: w.fromName || null, text: w.text, ref: w.ref }); };   // the facade's heldBackStash, as at the release
    const back = Q.handBackGone(CA, stash, 'its process is gone');
    const side = (readJson(path.join(dir, SIDE)) || {})[CA] || [];
    return { back: back.length, backs: backs.length, onDisk: side.filter((e) => String(e.text || '').includes('a peer\'s words queued in a wrapper') && !!e.ref).length };
  };
  const g = run();
  ok(g.back === 1 && g.backs === 1 && g.onDisk === 1, `the hand-back while held: DONE — the words on disk beside the list with their ref (${g.onDisk}), the frame handed back`, g);
  const SRC3 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const NOSIDE = M.load('src/server/conversation-deliver.js', anchored(SRC3, '    const toSide = !!stashHold.held();', '    if (stashHold.held()) return false; const toSide = false;', 'no-side-copy-hb'), 'no-side-copy-hb');
  const r = run(NOSIDE);
  ok(r.onDisk === 0, 'RED: no side copy — the ref\'d words are refused while held and the hand-back leaves them in no store (the first cure\'s loss)', r);
  ok(!/stashHeldFor|left live/.test(fs.readFileSync(path.join(REPO, 'src/server/queued-wakes.js'), 'utf8')), 'the queued wakes keep no state for the hold (the «left live» road left with the shape)');
}
{
  // THE PARK's FALL IS DURABLE (r3326 (b)): a notice parked by the ladder reaches its bound while the list is held ⇒ it FALLS as at the
  // release — out of the park, into the stash, on disk beside the list; and a frame that may have landed is never posted again
  const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
  let now = 1_700_000_000_000; const timers = []; let posts = 0;
  const clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
  const session = { claudeSessionId: CC, backendSessionId: CC, mode: 'chat', backend: 'claude', name: 'Owner', _isStreaming: true };
  const sessions = new Map([['w1', session]]);
  const mkD = () => CD.create(deps(dir, { activeSessions: sessions, retryClock: clock,
    peerMsg: { findPeer: (c) => (c === CC ? { name: 'Owner', socketPath: path.join(dir, 'none.sock'), pid: process.pid } : null), postToPeer: async () => { posts++; return { ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 }; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: () => ({ ok: true, identity: { key: 'acct', name: 'Work' }, hold: { k: 1 } }), noteSpend: () => { }, releaseSpend: () => { } }));
  const pr = placeReads(F); let D = null; try { D = mkD(); } finally { pr.restore(); }
  const r0 = await D.deliverToConversation(CC, 'a notice parked for retry', { fromName: 'Background Work · job', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test' } });
  session._isStreaming = false;
  for (let i = 0; i < 45 && D.retryCount(CC) > 0; i++) { now += 60 * 1000; await D.noteTurnEnd(session); }
  const side = (readJson(path.join(dir, SIDE)) || {})[CC] || [];
  ok(r0 && r0.parked === true && D.retryCount(CC) === 0 && side.some((e) => String(e.text || '').endsWith('a notice parked for retry')) && fs.readFileSync(F, 'utf8') === BYTES, '(a) the bound reached while held: the entry FALLS as at the release — out of the park, into the stash, on disk beside the list (the list untouched)', side);
  // a may-have-landed entry (in flight when the last process stopped) falls to the stash at the first sweep — NEVER posted again
  const dir2 = mk(), F2 = path.join(dir2, 'msg-stash.json'); fs.writeFileSync(F2, BYTES);
  fs.writeFileSync(path.join(dir2, 'msg-retry.json'), JSON.stringify({ [CC]: [{ id: 'rt-landed-1', cid: CC, text: 'a frame that may have landed', fromName: 'Background Work · job', kind: 'notification', spendReason: 'job-notification', producer: 'test', inflight: true, firstAt: now, attempts: [{ at: now, reason: 'posted' }], nextAt: now, retries: 0 }] }));
  posts = 0;
  const pr2 = placeReads(F2); let D2 = null; try { D2 = CD.create(deps(dir2, { activeSessions: sessions, retryClock: clock, peerMsg: { findPeer: (c) => (c === CC ? { name: 'Owner', socketPath: path.join(dir2, 'none.sock'), pid: process.pid } : null), postToPeer: async () => { posts++; return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) }, authorizeSpend: () => ({ ok: true, identity: { key: 'acct', name: 'Work' }, hold: { k: 1 } }), noteSpend: () => { }, releaseSpend: () => { } })); } finally { pr2.restore(); }
  await D2.noteTurnEnd(session);
  const side2 = (readJson(path.join(dir2, SIDE)) || {})[CC] || [];
  ok(posts === 0 && D2.retryCount(CC) === 0 && side2.some((e) => String(e.text || '').includes('a frame that may have landed')), `a may-have-landed entry while held: handed to the stash beside the list, NEVER posted again (posts ${posts})`, { posts, side2 });
}

{
  // THE PRODUCTION OBJECT (round wozyl97qk L3): server.js hands the ONE deliver to the channels wiring, which hands it to the engine and so to
  // channels-outbound (stashTornAt, onStashLift, stashPeek are asked of it) — a facade that dropped a name would go red here
  const sv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'), cw = fs.readFileSync(path.join(REPO, 'src/server/channels-wiring.js'), 'utf8'), ce = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const wiringCall = sv.slice(sv.indexOf("require('./src/server/channels-wiring.js').create({"), sv.indexOf("require('./src/server/channels-wiring.js').create({") + 1200);
  ok(/\n\s*deliver, serverSetting,/.test(wiringCall) && /const channels = createEngine\(\{[^\n]*\bdeliver\b/.test(cw) && /Object\.assign\(engineCtx, ChannelsOutbound\.create\(engineCtx\)\)/.test(ce),
    'PRODUCTION: server.js passes the one deliver object to the channels wiring → the engine → channels-outbound (no facade picking names)');
}

console.log('§7 ONE ENTRY, ONCE (r3329 (2)) — each way an entry could come twice');
{
  // (i) a crash after the list's merged write and before the side copy's removal: the list names the copy merged ⇒ the next start removes it
  // and merges nothing — even after the list drained the entries meanwhile; and a start that cannot read the list keeps the copy's entries
  // only until the list's lift, where the merged generation drops them
  const { D, F, dir } = heldStart();
  D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'accepted while held, once' });
  const sideBytes = fs.readFileSync(path.join(dir, SIDE), 'utf8');
  await D.stashReadAgain(); await goneSide(F);
  fs.writeFileSync(path.join(dir, SIDE), sideBytes);   // the crash: the copy still there after the merged write
  const D2 = CD.create(deps(dir)); await goneSide(F);
  const n2 = ((readJson(F) || {})[CC] || []).filter((e) => e.text === 'accepted while held, once').length;
  ok(n2 === 1 && !fs.existsSync(path.join(dir, SIDE)), `(i) the copy the list names merged: removed at the next start, never merged again (${n2} in the list)`);
  D2.drainStash(CC); D2.flush();
  fs.writeFileSync(path.join(dir, SIDE), sideBytes);
  const D3 = CD.create(deps(dir)); await goneSide(F);
  ok(D3.stashEntries(CC).length === 0 && !fs.existsSync(path.join(dir, SIDE)), '(i) …and after the list delivered it: the old copy brings nothing back (its generation is named merged)', D3.stashEntries(CC));
  fs.writeFileSync(path.join(dir, SIDE), sideBytes);
  const pr = placeReads(F); let D4 = null; try { D4 = CD.create(deps(dir)); } finally { pr.restore(); }
  const heldHad = D4.stashEntries(CC).length;
  await D4.stashReadAgain(); await goneSide(F);
  ok(heldHad === 1 && ((readJson(F) || {})[CC] || []).length === 0, `(i) …and when that start cannot read the list: the copy's entry waits in memory (${heldHad}), and the lift drops it — the list names its generation merged`, readJson(F));
}
{
  // (ii) a second start while held: the copy read back, the next entry after it, the lift merges each ONCE
  const { D, F, dir } = heldStart();
  D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'first life' }); D.flush();
  const pr = placeReads(F); let D2 = null; try { D2 = CD.create(deps(dir)); } finally { pr.restore(); }
  D2.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'second life' });
  await D2.stashReadAgain(); await goneSide(F);
  const q = ((readJson(F) || {})[CC] || []).map((e) => e.text);
  ok(q.join('|') === 'first life|second life', `(ii) a second start while held: each entry ONCE, in order (${q.join(', ')})`, q);
}
{
  // (iii) an entry DELIVERED at a conversation's next prompt while held is never met again at the lift
  const { D, F } = heldStart();
  D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'delivered while held' });
  const took = D.drainStash(CC);
  await D.stashReadAgain(); await goneSide(F);
  ok(Array.isArray(took) && took.length === 1 && !((readJson(F) || {})[CC] || []).length, '(iii) delivered at the next prompt while held: not in the list after the lift (the copy beside it was rewritten without it)', readJson(F));
  // and a producer's ref: an entry whose ref the list already holds is never added again
  const { D: E, F: G } = heldStart();
  E.stashFor(CB, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a receipt waiting', ref: 'p-1' });
  await E.stashReadAgain(); await goneSide(G);
  ok(((readJson(G) || {})[CB] || []).filter((e) => e.ref === 'p-1').length === 1, '(iv) a producer ref the list already holds: never added twice', readJson(G));
}

console.log('§8 the side copy\'s own bad days (r3326 (e))');
{
  // UNREADABLE at a start: its own hold — nothing written over it, the stash held until BOTH read; new entries live in memory only meanwhile
  const { D: D0, F, dir } = heldStart();
  D0.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'in the copy' }); D0.flush();
  const sideBytes = fs.readFileSync(path.join(dir, SIDE), 'utf8');
  const pr = placeReads(path.join(dir, SIDE)); let D = null; try { D = CD.create(deps(dir)); } finally { pr.restore(); }
  const st = D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'while the copy is unread' });
  const refused = codeOf(() => D.stashFor(CC, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a ref\'d one', ref: 'p-9' }));
  ok(!!D.stashHeld() && st && st.stored === false && refused === 'msg_stash_unread' && fs.readFileSync(path.join(dir, SIDE), 'utf8') === sideBytes && fs.readFileSync(F, 'utf8') === BYTES, 'UNREADABLE COPY: held until both read; nothing written over the copy or the list; a new entry in memory only, a ref\'d one refused by name', { st, refused });
  await D.stashReadAgain(); await goneSide(F);
  const q = ((readJson(F) || {})[CC] || []).map((e) => e.text);
  ok(!D.stashHeld() && q.join('|') === 'in the copy|while the copy is unread' && both(readJson(F)) && !fs.existsSync(path.join(dir, SIDE)), `UNREADABLE COPY, LIFTED: the list, the copy's entry, then memory's — ONE write, the copy removed (${q.join(', ')})`, readJson(F));
}
{
  // TORN copy: kept aside once (0600), the stash starts from what memory holds; its instant remembered (a receipt in it is unknown, never «handed»)
  const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
  const TORN = '{"' + CC + '": [{"text": "a cut';
  fs.writeFileSync(path.join(dir, SIDE), TORN);
  const D = CD.create(deps(dir));
  for (let i = 0; i < 200 && D.stashHeld(); i++) await sleep(10);
  await goneSide(F);
  const copies = fs.readdirSync(dir).filter((n) => n.startsWith(SIDE + '.corrupt-'));
  const t = D.stashTorn();
  ok(!D.stashHeld() && copies.length === 1 && fs.readFileSync(path.join(dir, copies[0]), 'utf8') === TORN && modeOf(path.join(dir, copies[0])) === 0o600 && !!t && t.copy === copies[0] && Number.isFinite(D.stashTornAt()) && both(readJson(F)), `TORN COPY: kept aside ONCE, byte for byte, 0600; named; the instant remembered; the list as it was (${copies.join(', ')})`, { copies, t });
}

report();
