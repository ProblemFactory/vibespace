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
const modeOf = (f) => { try { return fs.statSync(f).mode & 0o777; } catch { return null; } };
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

console.log('§1 a stash that could not be read is HELD: nothing is written over it; what comes meanwhile is KEPT IN MEMORY (r3720), and it all comes back at the lift');
{
  // CONTROL: the read answers ⇒ the stop keeps both conversations' entries
  const d0 = mk(), F0 = path.join(d0, 'msg-stash.json'); fs.writeFileSync(F0, BYTES);
  const D0 = CD.create(deps(d0)); D0.flush();
  ok(both(readJson(F0)) && D0.stashHeld() === null, 'CONTROL: the stash read at the start ⇒ the stop keeps both conversations\' waiting entries, nothing held', readJson(F0));
  const { D, F, dir, seen } = heldStart();
  const held = D.stashHeld();
  ok(seen === 1 && !!held && held.code === 'EIO' && /could not be read/.test(D.stashUnreadWords() || ''), `PLANT: the start's one read answered EIO ⇒ HELD (${held && held.code}), its words say so`, held);
  D.flush();
  ok(fs.readFileSync(F, 'utf8') === BYTES, 'HELD: the hub stop (deliver.flush) writes NOTHING over the list — its bytes as they were', fs.readFileSync(F, 'utf8').slice(0, 80));
  // r3720: every entry stashed while held — with a ref or without — is TAKEN into memory, its producer told «taken, not on disk»
  const evs = []; D.onStash((ev, cid) => evs.push(ev + ':' + cid));
  const st1 = D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'a message stashed while held' });
  const st2 = D.stashFor(CC, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a receipt while held', ref: 'p-2' });
  ok(st1 && st1.stored === false && st2 && st2.stored === false && /taken, not on disk/.test(st1.why || '') && /lost if VibeSpace restarts before that list reads again/.test(st1.why || '') && evs.includes('unwritten:' + CC), `HELD: an entry without a ref AND one with a ref are TAKEN — «${st1 && st1.why}»`, { st1, st2, evs });
  ok(fs.readFileSync(F, 'utf8') === BYTES && D.stashEntries(CC).length === 2 && !fs.readdirSync(dir).some((n) => n !== 'msg-stash.json' && n.startsWith('msg-stash')), `HELD: both in memory (${D.stashEntries(CC).length}); no file of any kind beside the list; the list untouched`, fs.readdirSync(dir));
  ok(codeOf(() => D.stashPeek(CB)) === 'msg_stash_unread', 'HELD: stashPeek (a road that decides from the stash) is refused by name — it decides nothing', codeOf(() => D.stashPeek(CB)));
  const lifted = await D.stashReadAgain();
  const after = readJson(F);
  ok(lifted === true && D.stashHeld() === null && both(after) && after[CC] && after[CC].length === 2 && after[CC][0].text === 'a message stashed while held' && after[CC][1].ref === 'p-2' && D.stashPeek(CB).length === 1 && modeOf(F) === 0o600,
    'LIFTED: both conversations\' entries are back, the two taken while held after them — ONE write to the list (0600), peek answers again', after);
  // RED: a held write that writes the list over (the release's shape: no hold)
  const SRC0 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const OVER = M.load('src/server/conversation-deliver.js', anchored(SRC0, "    if (!stashHold.writable('a write of the messages waiting for conversations')) { landingOwed = true; return false; }", '', 'list-written-over-while-held'), 'list-written-over-while-held');
  const r = heldStart(OVER);
  r.D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'a message stashed while held' });
  ok(!both(readJson(r.F)), 'RED: a write that does not ask the hold — the list is written over with memory alone (both conversations\' entries gone)', readJson(r.F));
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

console.log('§5b r3299 row 2c / r3329 (4) / r3720 (6): what memory keeps while held is never lost SILENTLY — the journal COUNTS every entry, never names one');
{
  const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
  const logs = [];
  const pr = placeReads(F); let D = null; try { D = CD.create(deps(dir, { log: (...a) => logs.push(a.join(' ')) })); } finally { pr.restore(); }
  for (let i = 1; i <= 5; i++) D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'secret words ' + i });
  const said = logs.filter((l) => /taken into memory only this hold/.test(l));
  D.flush();
  const stop = logs.filter((l) => /taken this hold and not handed out/.test(l));
  ok(said.length >= 2 && !said.concat(stop).some((l) => l.includes('secret words') || l.includes(CC)) && /\b1 entry taken/.test(said[0]) && said.some((l) => /\b4 entries taken/.test(l)) && stop.length === 1 && /\b5 entries taken this hold and not handed out are lost/.test(stop[0]), `ROW 2c: the journal counts every entry kept in memory only — at the first, at each doubling, the whole count at the stop — no word, no conversation («${stop[0]}»)`, said.concat(stop));
}

{
  // r3728 (the verifier's row): THE STOP COUNTS WHAT MEMORY STILL HOLDS UNHANDED — four taken while held, three handed out at the next
  // prompt, the stop says ONE is lost. RED: the hold's count of acceptances (it says four)
  const run = (Mod = CD) => {
    const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
    const logs = [];
    const pr = placeReads(F); let D = null; try { D = Mod.create(deps(dir, { log: (...a) => logs.push(a.join(' ')) })); } finally { pr.restore(); }
    for (let i = 1; i <= 3; i++) D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'handed ' + i });
    D.stashFor(CB, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'still waiting' });
    const took = D.drainStash(CC);
    D.flush();
    const stop = logs.filter((l) => /lost with this process/.test(l));
    return { took: (took || []).length, stop };
  };
  const g = run();
  ok(g.took === 3 && g.stop.length === 1 && /\b1 entry taken this hold and not handed out is lost/.test(g.stop[0]), `the stop counts what memory still holds unhanded: four taken, three handed out, «${g.stop[0]}»`, g);
  const SRC6 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const BYTAKEN = M.load('src/server/conversation-deliver.js', anchored(SRC6, "    const unhanded = isHeld() ? Object.keys(stash).filter(isConvName).reduce((n, c) => n + (Array.isArray(stash[c]) ? stash[c].length : 0), 0) : 0;", '    const unhanded = isHeld() ? memOnly : 0;', 'stop-counts-acceptances'), 'stop-counts-acceptances');
  const r = run(BYTAKEN);
  ok(r.stop.length === 1 && /\b4 entries taken this hold and not handed out are lost/.test(r.stop[0]), `RED: the hold's count of acceptances says four where one is lost («${r.stop[0]}»)`, r);
}

console.log('§6 the round wozyl97qk: the stop while held (the truth), the reserved names, one entry a slot, the owed wake, the hand-back, the park');
{
  // THE STOP WHILE HELD (r3720 (6)): an entry taken while held lives in memory only; the stop writes nothing; the next start (still held, or
  // reading) does not have it — its producer was told at acceptance, the journal counted it at the stop
  const { D, F, dir } = heldStart();
  const st = D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'accepted while held' });
  D.flush();
  const pr = placeReads(F); let D2 = null; try { D2 = CD.create(deps(dir)); } finally { pr.restore(); }
  const D3 = CD.create(deps(dir));
  ok(st && st.stored === false && fs.readFileSync(F, 'utf8') === BYTES && D2.stashEntries(CC).length === 0 && D3.stashEntries(CC).length === 0 && both(readJson(F)), 'THE STOP WHILE HELD, named: the entry taken while held is in no store after the restart — its producer was told «not on disk»; the list as it was');
}
{
  // THE RESERVED NAMES (r3329 (1)) are never a conversation — the list's __slots, __tornAt and any later `__…`: never counted, handed over,
  // trimmed or drawn
  const dir = mk(), F = path.join(dir, 'msg-stash.json');
  fs.writeFileSync(F, JSON.stringify({ ...BEFORE, __slots: { [CA]: { w: '["x"]' } }, __tornAt: 12345, __future: [{ text: 'a reserved name of a later release' }] }));
  const D = CD.create(deps(dir));
  const names = ['__slots', '__tornAt', '__future'];
  ok(!D.stashCids().some((c) => c.startsWith('__')) && D.stashTornAt() === 12345 && names.every((n) => D.stashEntries(n).length === 0 && D.stashCount(n) === 0), 'THE RESERVED NAMES are never a conversation: not counted, no entries', D.stashCids());
  D.flush();
  const j = readJson(F) || {};
  ok(j.__tornAt === 12345 && !('__future' in j) && both(j), 'a write keeps the list\'s own reserved names as its own (an unknown `__` name is never written back as a queue)', j);
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
  const NODUE = M.load('src/server/conversation-deliver.js', anchored(SRC2, "    step('the owed wakes', () => { const dueAt = clock.now(); for (const q of Object.values(retry)) for (const e of q) if (e && e.waitsHeld && (e.waitsHeld.stash || e.waitsHeld.by === 'stash-wake') && !e.inflight) e.nextAt = dueAt; scheduleRetry(); });\n", "    step('the owed wakes', () => { scheduleRetry(); });\n", 'lift-without-due'), 'lift-without-due');
  const red = await run(NODUE);
  ok(red.parked && red.aside && !red.went, 'RED: a lift that only arms the park leaves the wake set aside until its next minute\'s ask', red);
  // a LIVE conversation's paced wake posts to its inbox: the door does not hold it for the list (r3326, the round's over-defence)
  const { D } = heldStart();
  ok(D.heldWhyOf({ id: 'r-2', cid: CC, kind: 'notification', text: 'a paced wake', producer: 'jobs', owed: true, attempts: [] }) === null, 'a LIVE conversation\'s owed wake is not held for the list (it needs no claim)');
}
{
  // THE FOUR HAND-BACK DOORS ARE DONE AS AT THE RELEASE (r3720): a frame handed back from a gone wrapper while held — its words go to the
  // stash WITH its ref, TAKEN into memory (never refused: a refusal would drop words the wrapper already gave up), and the frame is handed back
  const QW = require(path.join(REPO, 'src/server/queued-wakes.js'));
  const run = (Mod = CD) => {
    const { D, dir } = heldStart(Mod);
    fs.mkdirSync(path.join(dir, 'qw'), { recursive: true }); const Q = QW.create({ dataDir: path.join(dir, 'qw'), log: () => { } });
    Q.noteWritten(CA, { text: 'a peer\'s words queued in a wrapper', kind: 'peer', fromName: 'Ada', holder: 'pid-1' });
    const backs = []; Q.onHandedBack((c, e) => backs.push(e && e.id));
    const stash = (e, w) => { D.stashFor(CA, { source: 'agent', kind: 'peer', fromName: w.fromName || null, text: w.text, ref: w.ref }); };   // the facade's heldBackStash, as at the release
    const back = Q.handBackGone(CA, stash, 'its process is gone');
    return { back: back.length, backs: backs.length, inMemory: D.stashEntries(CA).filter((e) => String(e.text || '').includes('a peer\'s words queued in a wrapper') && !!e.ref).length };
  };
  const g = run();
  ok(g.back === 1 && g.backs === 1 && g.inMemory === 1, `the hand-back while held: DONE — the words taken into memory with their ref (${g.inMemory}), the frame handed back`, g);
  const SRC3 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const REFUSE = M.load('src/server/conversation-deliver.js', anchored(SRC3, '    if (!stored && entry.ref && !stashHold.held()) {', '    if (!stored && entry.ref) {', 'refd-refused-while-held'), 'refd-refused-while-held');   // stale-pins: kept — the hold's refusal of a ref'd entry, planted back as the RED
  const r = run(REFUSE);
  ok(r.inMemory === 0 && r.back === 1, 'RED: a ref\'d entry refused while held — the hand-back drops the words the wrapper gave up (in no store)', r);
}
{
  // THE PARK's FALL WHILE HELD (r3720): a notice parked by the ladder reaches its bound while the list is held ⇒ it FALLS as at the
  // release — out of the park, into the stash's memory (its fall told «not on disk»); and a frame that may have landed is never posted again
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
  const mem = D.stashEntries(CC);
  ok(r0 && r0.parked === true && D.retryCount(CC) === 0 && mem.some((e) => String(e.text || '').endsWith('a notice parked for retry')) && fs.readFileSync(F, 'utf8') === BYTES, '(a) the bound reached while held: the entry FALLS as at the release — out of the park, into the stash\'s memory (the list untouched)', mem.map((e) => e.text));
  // a may-have-landed entry (in flight when the last process stopped) falls to the stash at the first sweep — NEVER posted again
  const dir2 = mk(), F2 = path.join(dir2, 'msg-stash.json'); fs.writeFileSync(F2, BYTES);
  fs.writeFileSync(path.join(dir2, 'msg-retry.json'), JSON.stringify({ [CC]: [{ id: 'rt-landed-1', cid: CC, text: 'a frame that may have landed', fromName: 'Background Work · job', kind: 'notification', spendReason: 'job-notification', producer: 'test', inflight: true, firstAt: now, attempts: [{ at: now, reason: 'posted' }], nextAt: now, retries: 0 }] }));
  posts = 0;
  const pr2 = placeReads(F2); let D2 = null; try { D2 = CD.create(deps(dir2, { activeSessions: sessions, retryClock: clock, peerMsg: { findPeer: (c) => (c === CC ? { name: 'Owner', socketPath: path.join(dir2, 'none.sock'), pid: process.pid } : null), postToPeer: async () => { posts++; return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) }, authorizeSpend: () => ({ ok: true, identity: { key: 'acct', name: 'Work' }, hold: { k: 1 } }), noteSpend: () => { }, releaseSpend: () => { } })); } finally { pr2.restore(); }
  await D2.noteTurnEnd(session);
  const mem2 = D2.stashEntries(CC);
  ok(posts === 0 && D2.retryCount(CC) === 0 && mem2.some((e) => String(e.text || '').includes('a frame that may have landed')), `a may-have-landed entry while held: handed to the stash's memory, NEVER posted again (posts ${posts})`, { posts, mem2: mem2.map((e) => e.text) });
}

{
  // THE PRODUCTION OBJECT (round wozyl97qk L3): server.js hands the ONE deliver to the channels wiring, which hands it to the engine and so to
  // channels-outbound (stashTornAt, onStashLift, stashPeek are asked of it) — a facade that dropped a name would go red here
  const sv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'), cw = fs.readFileSync(path.join(REPO, 'src/server/channels-wiring.js'), 'utf8'), ce = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const wiringCall = sv.slice(sv.indexOf("require('./src/server/channels-wiring.js').create({"), sv.indexOf("require('./src/server/channels-wiring.js').create({") + 1200);
  ok(/\n\s*deliver, serverSetting,/.test(wiringCall) && /const channels = createEngine\(\{[^\n]*\bdeliver\b/.test(cw) && /Object\.assign\(engineCtx, ChannelsOutbound\.create\(engineCtx\)\)/.test(ce),
    'PRODUCTION: server.js passes the one deliver object to the channels wiring → the engine → channels-outbound (no facade picking names)');
}

console.log('§7 ONE ENTRY, ONCE (r3329 (2)) — delivered while held, and a producer ref');
{
  // (iii) an entry DELIVERED at a conversation's next prompt while held is never met again at the lift
  const { D, F } = heldStart();
  D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'delivered while held' });
  const took = D.drainStash(CC);
  await D.stashReadAgain();
  ok(Array.isArray(took) && took.length === 1 && !((readJson(F) || {})[CC] || []).length, '(iii) delivered at the next prompt while held: not in the list after the lift (memory handed it out; the lift writes what memory still holds)', readJson(F));
  // and a producer's ref: an entry whose ref the list already holds is never added again
  const { D: E, F: G } = heldStart();
  E.stashFor(CB, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a receipt waiting', ref: 'p-1' });
  await E.stashReadAgain();
  ok(((readJson(G) || {})[CB] || []).filter((e) => e.ref === 'p-1').length === 1, '(iv) a producer ref the list already holds: never added twice', readJson(G));
}

console.log('§9 round w5nhhs3r7 (r3663): one ref two messages; a live wake while held');
const SRC9 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
{
  // (1) ONE REF, TWO MESSAGES: a refresh note waits in the list under the producer's one ref; while held a NEWER, different note under the
  // same ref is accepted; at the lift BOTH are there, the newer after — never dropped. RED: the merge by a ref alone
  const run = async (Mod = CD) => {
    const bytes = JSON.stringify({ ...BEFORE, [CC]: [{ source: 'agent', kind: 'notification', fromName: 'VibeSpace', text: 'refresh note A', ref: 'refresh-note', ts: 3 }] });
    const { D, F } = heldStart(Mod, mk(), bytes);
    D.stashFor(CC, { source: 'agent', kind: 'notification', fromName: 'VibeSpace', text: 'refresh note B', ref: 'refresh-note' });
    await D.stashReadAgain();
    return ((readJson(F) || {})[CC] || []).map((e) => e.text);
  };
  const g = await run();
  ok(g.join('|') === 'refresh note A|refresh note B', `(1) another text under the same ref survives the lift (${g.join(', ')})`, g);
  const BYREF = M.load('src/server/conversation-deliver.js', anchored(SRC9, '!(e.ref && same.has(keyOf(e)))', '!(e.ref && q0.some((x) => x && x.ref === e.ref))', 'merge-by-ref-alone'), 'merge-by-ref-alone');
  const r = await run(BYREF);
  ok(r.join('|') === 'refresh note A', `RED: the merge by a ref alone drops the newer note (${r.join(', ')})`, r);
}
{
  // (2) A LIVE CONVERSATION's OWED STASH-WAKE while the list is unread: its receipt waits in the list, the render cannot see it — the wake STAYS
  // OWED (set aside), never taken out as «carried»; after the lift it goes. RED: the hook without the unread list's «unknown»
  const run = async (Mod = CD) => {
    const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
    let now = 1_700_000_000_000; const timers = []; let posts = 0;
    const clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
    const fire = async () => { for (let k = 0; k < 6; k++) { const d = timers.filter((t) => !t.dead && !t.ran && t.at <= now); if (!d.length) break; for (const t of d) { t.ran = true; t.fn(); } for (let i = 0; i < 20; i++) await new Promise((res) => setImmediate(res)); } };
    const session = { claudeSessionId: CC, backendSessionId: CC, mode: 'chat', backend: 'claude', name: 'Owner', _isStreaming: false };
    const sessions = new Map([['w1', session]]);
    const mkD = (place) => { const pr = place ? placeReads(F) : null; try { return Mod.create(deps(dir, { activeSessions: sessions, retryClock: clock,
      peerMsg: { findPeer: (c) => (c === CC ? { name: 'Owner', socketPath: path.join(dir, 'none.sock'), pid: process.pid } : null), postToPeer: async () => { posts++; return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
      authorizeSpend: () => ({ ok: true, identity: { key: 'acct', name: 'Work' }, hold: { k: 1 } }), noteSpend: () => { }, releaseSpend: () => { } })); } finally { if (pr) pr.restore(); } };
    const D1 = mkD(false);
    D1.stashFor(CC, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a receipt for the next turn', ref: 'p-7' });
    const pk = D1.parkOwedWake(CC, { producer: 'stash-wake', key: 'p-7', meta: { ref: 'p-7' }, retryInMs: 60000, reason: 'paced' });
    D1.flush();
    const D2 = mkD(true);
    now += 120000; await fire();
    const owedHeld = D2.retryPeek(CC).some((x) => x && x.producer === 'stash-wake');
    await D2.stashReadAgain(); now += 1000; await fire();
    return { parked: !!(pk && pk.parked), owedHeld, posts, after: D2.retryPeek(CC).filter((x) => x && x.producer === 'stash-wake').length };
  };
  const g = await run();
  ok(g.parked && g.owedHeld && g.posts >= 1, `(2) a live conversation's owed stash-wake whose receipt waits in the unread list STAYS OWED while held, and goes after the lift (posts ${g.posts})`, g);
  const NOUNKNOWN = M.load('src/server/conversation-deliver.js', anchored(SRC9, "if (isHeld() && !(stash[cid] || []).some((x) => x && x.ref === ref)) return true;", '', 'stash-wake-silence-read-as-carried'), 'stash-wake-silence-read-as-carried');
  const r = await run(NOUNKNOWN);
  ok(r.parked && !r.owedHeld, 'RED: the hook that reads the unread list\'s silence — the owed wake is taken out as «carried» while held, and nobody is woken for the receipt after the lift', r);
}
console.log('§10 r3919 THE CLASS — every caller of the accept and of the peek reads the hold: the peek of memory, the hand-back, the refresh note, the lift that cannot merge, the census');
const SRC10 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
const RN = require(path.join(REPO, 'src/refresh-note.js'));
{
  // (a) THE PEEK OF MEMORY: while held the plain peek is refused (a road that decides from the stash's SILENCE decides nothing); `{memory:true}`
  // answers what memory holds — an entry found is evidence, a miss is no absence. The accept says TAKEN, never a failed write
  const { D } = heldStart();
  const st = D.stashFor(CC, { source: 'agent', kind: 'notification', fromName: 'VibeSpace browser', text: 'a hand-back', ref: 'bres-0a0b0c0d' });
  const plain = codeOf(() => D.stashPeek(CC)), mem = D.stashPeek(CC, { memory: true }), miss = D.stashPeek(CA, { memory: true });
  ok(st.stored === false && st.taken === true && /^taken, not on disk/.test(st.why) && !!plain && mem.length === 1 && mem[0].ref === 'bres-0a0b0c0d' && miss.length === 0, 'HELD: the accept answers TAKEN (stored:false, taken:true, its words); the plain peek is refused; the peek of memory finds memory\'s entry and finds nothing where memory holds nothing', { st, plain, mem: mem.length, miss: miss.length });
}
{
  // (b) THE HAND-BACK PRESSED TWICE WHILE HELD (a double press, a second owner tab, a retried POST): ONE frame — memory's first frame is the
  // evidence the dedupe reads. RED: the dedupe's plain peek (refused while held, read as nothing waiting): two frames, the agent reads it twice
  const HBSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-handback.js'), 'utf8');
  const press2 = async (HBm) => {
    const { D } = heldStart();
    const sess = { name: 'Agent One', backend: 'claude', backendSessionId: CC, claudeSessionId: CC, mode: 'chat' };
    const keeper = { continueState: async () => ({ ok: true, tabs: [{ url: 'https://example.test/a', title: 'A' }], currentIndex: 0, tookOver: false, own: false, rerun: null, userActs: [] }) };
    const hb = HBm.create({ keeper, deliver: D, activeSessions: new Map([['s1', sess]]), emitCard: () => true, notice: () => { }, log: { log() { }, warn() { } } });
    const a = await hb.continueFor({ sessionId: 's1', note: 'first press' });
    const b = await hb.continueFor({ sessionId: 's1', note: 'second press' });
    return { held: !!D.stashHeld(), a: a.ok, b: b.ok ? 'ok' : b.code, frames: D.stashPeek(CC, { memory: true }).filter((e) => /^bres-/.test(String(e.ref || ''))).length };
  };
  const g = await press2(require(path.join(REPO, 'src/server/browser-handback.js')));
  ok(g.held && g.a && g.b === 'already_handed_back' && g.frames === 1, `the hand-back pressed twice while the list is unread: the second refused already_handed_back — ONE frame (${g.frames})`, g);
  const r = await press2(M.load('src/server/browser-handback.js', anchored(HBSRC, 'deliver.stashPeek(cid, { memory: true })', 'deliver.stashPeek(cid)', 'dedupe-plain-peek'), 'dedupe-plain-peek'));   // stale-pins: kept — the RED puts the plain peek back
  ok(r.held && r.b === 'ok' && r.frames === 2, `RED: the dedupe's plain peek — refused while held, read as nothing waiting: two frames (${r.frames})`, r);
}
{
  // (c) THE REFRESH NOTE ACROSS THE HOLD: an earlier press's note waits IN the unread list; a newer press while held is TAKEN (counted, said) and
  // cannot take the old one out; at the lift the NEWEST stays, the older goes. RED: no replace at the lift — both, the stale note first
  const SHSRC = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf8');
  const runR = async (SHm) => {
    const dir = mk(), F = path.join(dir, 'msg-stash.json');
    fs.writeFileSync(F, JSON.stringify({ ...BEFORE, [CC]: [{ source: 'agent', kind: 'notification', fromName: RN.REFRESH_FROM, ref: RN.REFRESH_REF, text: 'refresh note A (an earlier press)', ts: 3 }] }));
    fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true });
    const s = { name: 'Owner', backend: 'claude', backendSessionId: CC, claudeSessionId: CC, mode: 'chat', _isStreaming: false, buffer: '', sockName: 'cw-r1', socketPath: path.join(dir, 'cw-r1') };
    const sessions = new Map([['r1', s]]);
    const pr = placeReads(F); let D = null; try { D = CD.create(deps(dir, { activeSessions: sessions })); } finally { pr.restore(); }
    const jm = new JobManager({ dataDir: dir, log: () => { }, broadcast: () => { }, onStash: () => { } });
    const view = SHm.create({ activeSessions: sessions, getDeliver: () => D, getJobs: () => jm, broadcastSessions: () => { }, renderMsgStash, renderNotifStash, debounceMs: 10, log: { log() { }, warn() { } }, dataDir: dir });
    const q = view.refreshLive('refresh note B (the newer press)');
    await D.stashReadAgain(); await sleep(20);
    const after = D.stashEntries(CC).filter((e) => RN.isRefreshEntry(e)).map((e) => e.text);
    jm.shutdown?.();
    return { queued: q.queued, notOnDisk: q.notOnDisk === true ? (q.takenCount || 0) : 0, after, disk: ((readJson(F) || {})[CC] || []).filter((e) => RN.isRefreshEntry(e)).length };
  };
  const g = await runR(SH);
  ok(g.queued === 1 && g.notOnDisk === 1 && g.after.length === 1 && /refresh note B/.test(g.after[0]), `the refresh note pressed while the list is unread: TAKEN and said (notOnDisk ${g.notOnDisk}); at the lift the newest stays, the older goes («${g.after.join(' | ')}»)`, g);
  const r = await runR(M.load('src/server/stash-handover.js', anchored(SHSRC, "  { const d0 = getDeliver(); if (d0 && typeof d0.onStashLift === 'function') d0.onStashLift(() => keepNewestRefresh()); }\n", '', 'no-refresh-replace-at-lift'), 'no-refresh-replace-at-lift'));
  ok(r.after.length === 2 && /refresh note A/.test(r.after[0]), `RED: no replace at the lift — the stale note and the new one, the stale first (${r.after.length})`, r);
}
{
  // (d) THE LIFT THAT CANNOT MERGE (a throw in the merge): HELD AGAIN — nothing written over the list, memory as it was, read again on its
  // ladder. RED: a catch that does not take the hold again — the next write covers the list with memory alone
  const THROWS = anchored(SRC10, '  function mergeQueues(base, incoming) {\n    let n = 0;\n', "  function mergeQueues(base, incoming) {\n    throw new Error('a planted merge failure');\n", 'merge-throws');
  const runM = async (src, name) => {
    const { D, F } = heldStart(M.load('src/server/conversation-deliver.js', src, name));
    D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'taken while held' });
    const lifted = await D.stashReadAgain();
    D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'after the failed lift' });
    return { lifted, held: !!D.stashHeld(), untouched: fs.readFileSync(F, 'utf8') === BYTES, mem: D.stashPeek(CC, { memory: true }).length };
  };
  const g = await runM(THROWS, 'merge-throws');
  ok(g.held && g.untouched && g.mem === 2, 'the lift whose merge throws: HELD AGAIN — the list\'s bytes as they were after another accept, memory\'s two entries kept', g);
  const r = await runM(anchored(THROWS, "      try { stashHold.start({ state: 'unreadable', error: { code: 'lift-merge-failed' } }); } catch (e2) { log('[deliver] the stash could not be held again:', e2 && e2.message); }\n", '', 'merge-throws-no-rehold'), 'merge-throws-no-rehold');
  ok(!r.held && !r.untouched, 'RED: a catch that does not hold again — the next write covers the list (its entries gone)', r);
}
{
  // (e) THE SOURCE PINS moved here from the heavy strip suite (r3919): the boot order, the stash's ONE start read, the facade's stop
  const sj = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const iDeliver = sj.indexOf("const deliver = require('./src/server/conversation-deliver.js').create("), iView = sj.indexOf("const stashView = require('./src/server/stash-handover.js').create("), iListen = sj.indexOf('hub.listen(PORT, HOST'), iRestore = sj.indexOf('restoreSessions();', iListen);
  ok(iDeliver > 0 && iView > iDeliver && iListen > iView && iRestore > iListen, 'THE BOOT ORDER: the ladder (its stash read synchronously at create), then the hand-over view, both before hub.listen; restoreSessions inside the listen callback', { iDeliver, iView, iListen, iRestore });
  ok(/let read0; try \{ read0 = \{ text: fs\.readFileSync\(stashFile, 'utf-8'\) \}; \} catch \(error\) \{ read0 = \{ error \}; \}/.test(SRC10), 'THE ONE START READ: the stash file read synchronously at create, its answer through store-read (never a JSON.parse that reads a failure as empty)');
  ok(/claimStash, claimedCount, restoreStash, registerFrameRestorer, restoreFrame, releasedAtBoot, flush: flushAtStop,/.test(SRC10), 'THE FACADE\'s STOP: `flush` is flushAtStop (the stop counts what memory holds unhanded while held)');
}
{
  // (f) THE CENSUS OF CALLERS (r3919): every call of the stash's accept (`stashFor(`) and of its peek (`stashPeek(`) in src and server.js has
  // a ROW — what it does with «taken, not on disk» and with a refused peek. A caller born without a row is RED until it is judged.
  // ITS REACH (r3988 should): it counts the TEXT of a call, per file — a caller that reaches the accept through a wrapper (end-proposals'
  // tellText, artifact-registry's note, a `deliver['stashFor']` spelling) is counted where the wrapper calls, not where it is called: a
  // mistake-guard over the doors, never a proof of every road
  const CALLERS = {
    // file: { accept: n, peek: n, plainPeek: n — the peeks that DECIDE from silence (refused while held, decide nothing) }
    'src/agent-routes.js': { accept: 1 },                 // says it: «queued in memory only — taken, not on disk …» to the sender
    'src/server/apps-engine.js': { accept: 1 },           // says it: the journal; the outcome waits in memory
    'src/server/artifact-registry.js': { accept: 1 },     // ignores it, rightly: a stored:false that is not queued:false is told
    'src/server/browser-handback.js': { accept: 4, peek: 1 },   // 177 / 418 say it (durable:false, why); 203 the journal; 480 told 'stashed' (true: it waits in memory); 407 peeks MEMORY (a hit is evidence)
    'src/server/channel-api-cards.js': { accept: 1 },     // 82 marks the receipt «not on disk» (r3919); r3988: its clearer asks the stash's own word (stashOnDisk), no peek
    'src/server/channels-engine.js': { accept: 6, peek: 1 },    // 6613 / 7126 / 8849 ignore it rightly (notes; memory holds them); 9145 / 9410 / 9853 read it right — not durable: the kept rows stay for a restart (errs toward again, never lost); 6606 peeks MEMORY for the digest's caps
    'src/server/channels-outbound.js': { accept: 1, peek: 1, plainPeek: 1 },   // 2413 the receipt's mark in its own field (r3919 must 1); 1516 the reconcile: a refused peek decides nothing
    'src/server/conversation-deliver.js': { accept: 4 },  // the ladder's own (a paced-out fall, the park's fall, a held-back hand-back; B-ef83 unit 1: the senders of a wake the gate could not judge told it waits): its journal counts them
    'src/server/design-engine.js': { accept: 1 },         // says it: stored:false + why to the comment's sender
    'src/server/doc-engine.js': { accept: 1 },            // says it: stored:false to the doc's comment
    'src/server/end-proposals.js': { accept: 1 },         // TAKEN is told (r3919 must 2) — said in the journal
    'src/server/stash-handover.js': { accept: 2, peek: 1, plainPeek: 1 },   // the refresh note (refreshLive): taken counted and SAID, the older note goes at the lift; the kept frame of a hand-over the held memory cannot see (restoreHandedOver, lines 835 + 886): its accept's throw is TOLD to its caller (it answers 0, the consumer stashes the frame as itself), its «taken» ignored rightly (the frame waits in memory as itself, judged at the lift); its twin check's plain peek decides nothing from a refusal (refused, the frame is kept again — the lift's «already restored» branch takes the copy out)
    'src/server/stdout/acp-events.js': { accept: 1 },     // a frame handed back, stashed as itself: memory holds it — ignores it rightly
    'src/server/stdout/codex-events.js': { accept: 1 },   // the same, codex
    'src/server/vault-paste-door.js': { accept: 2 },      // 143 says it (the journal), told; 504 told (it waits in memory)
    'src/server/window-request.js': { accept: 1 },        // says it: durable:false + why
  };
  const strip = (t) => t.split('\n').map((l) => (/^\s*(\*|\/\/)/.test(l) ? '' : l.replace(/\s\/\/.*$/, ''))).join('\n');
  const countIn = (t) => ({ accept: (strip(t).match(/\bstashFor\s*(?:\?\.)?\(/g) || []).length - (strip(t).match(/function stashFor\s*\(/g) || []).length,
    peek: (strip(t).match(/\bstashPeek\s*(?:\?\.)?\(/g) || []).length - (strip(t).match(/function stashPeek\s*\(/g) || []).length,
    memoryPeek: (strip(t).match(/\bstashPeek\s*(?:\?\.)?\([^()]*\{\s*memory:\s*true\s*\}\s*\)/g) || []).length });
  const walk = (dir, out = []) => { for (const n of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, n.name); if (n.isDirectory()) walk(f, out); else if (/\.(c|m)?js$/.test(n.name)) out.push(f); } return out; };
  const census = (texts) => {
    const bad = [];
    for (const [rel, t] of texts) {
      const c = countIn(t), row = CALLERS[rel] || null;
      if (!c.accept && !c.peek) { if (row) bad.push(`${rel}: a row with no caller left`); continue; }
      if (!row) { bad.push(`${rel}: ${c.accept} accept / ${c.peek} peek call(s) and no row — judge each: what it does with «taken, not on disk», and with a refused peek`); continue; }
      if (c.accept !== (row.accept || 0) || c.peek !== (row.peek || 0)) bad.push(`${rel}: ${c.accept} accept / ${c.peek} peek, its row says ${row.accept || 0} / ${row.peek || 0}`);
      else if (c.peek - c.memoryPeek !== (row.plainPeek || 0)) bad.push(`${rel}: ${c.peek - c.memoryPeek} plain peek(s) that decide from silence, its row says ${row.plainPeek || 0}`);
    }
    for (const rel of Object.keys(CALLERS)) if (!texts.has(rel)) bad.push(`${rel}: a row for a file that is gone`);
    return bad;
  };
  const texts = new Map();
  for (const f of [...walk(path.join(REPO, 'src')), path.join(REPO, 'server.js')]) { const t = fs.readFileSync(f, 'utf8'); if (/\bstash(For|Peek)\b/.test(t)) texts.set(path.relative(REPO, f).split(path.sep).join('/'), t); }
  const bad = census(texts);
  const n = Object.values(CALLERS).reduce((a, r) => a + (r.accept || 0) + (r.peek || 0), 0);
  ok(bad.length === 0 && n === 33, `THE CENSUS: ${n} calls of the accept and the peek in ${Object.keys(CALLERS).length} files, each with its row (29 accepts; 4 peeks — two of memory, two plain that decide nothing from a refusal)`, bad);
  const planted = new Map(texts); planted.set('src/server/a-new-producer.js', "deliver.stashFor(cid, { text: 'x' });");
  const planted2 = new Map(texts); planted2.set('src/server/channels-engine.js', texts.get('src/server/channels-engine.js').replace('deliver.stashPeek(cid, { memory: true })', 'deliver.stashPeek(cid)'));   // stale-pins: kept — the RED puts the plain peek back
  ok(census(planted).some((b) => /a-new-producer\.js: 1 accept/.test(b)) && census(planted2).some((b) => /channels-engine\.js: 1 plain peek/.test(b)), 'RED: a caller born without a row, and a memory peek turned into a plain one, are each named');
}
{
  // (g) r3988 (A) THE STASH's OWN WORD: an entry with a ref is IN THE FILE only after a write that LANDED holding it (stashOnDisk); a lift whose
  // write FAILS says no, and tells no landing listener; the next write that lands says yes and tells them ONCE.
  // RED: a write path that notes a FAILED write as landed — the word says «in the file» over memory
  const runW = async (Mod) => {
    const { D, F } = heldStart(Mod);
    let lands = 0; D.onStashLanded(() => { lands++; });
    D.stashFor(CC, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a receipt taken while held', ref: 'p-9' });
    const whileHeld = D.stashOnDisk(CC, 'p-9');
    const realW = fs.writeFileSync; let place = true;
    fs.writeFileSync = function (f, ...a) { if (place && typeof f === 'string' && f.endsWith('msg-stash.json.tmp')) { place = false; throw Object.assign(new Error('ENOSPC (placed)'), { code: 'ENOSPC' }); } return realW.call(this, f, ...a); };
    try { await D.stashReadAgain(); } finally { fs.writeFileSync = realW; }
    const afterFailed = { onDisk: D.stashOnDisk(CC, 'p-9'), lands, inFile: ((readJson(F) || {})[CC] || []).some((e) => e && e.ref === 'p-9') };
    const tick = () => new Promise((r) => setImmediate(r));   // r4023 (D)(i): the landing is told on the loop's NEXT turn, never inside the write
    D.flush(); const insideTheWrite = lands; await tick();
    const afterLanded = { onDisk: D.stashOnDisk(CC, 'p-9'), lands, insideTheWrite, inFile: ((readJson(F) || {})[CC] || []).some((e) => e && e.ref === 'p-9') };
    D.flush(); await tick();
    return { whileHeld, afterFailed, afterLanded, landsAfterSecond: lands };
  };
  const g = await runW(CD);
  ok(g.whileHeld === false && g.afterFailed.onDisk === false && g.afterFailed.lands === 0 && !g.afterFailed.inFile && g.afterLanded.onDisk === true && g.afterLanded.insideTheWrite === 0 && g.afterLanded.lands === 1 && g.afterLanded.inFile && g.landsAfterSecond === 1, 'THE STASH\'s WORD: taken while held — not in the file; the lift\'s write FAILS — still not (no landing told); the next write LANDS — in the file, the landing told ONCE on the next turn (never inside the write; not again for a write after it)', g);
  const r = await runW(M.load('src/server/conversation-deliver.js', anchored(SRC10, '    catch (e) {\n      landingOwed = true;\n', '    catch (e) {\n      noteLanded();\n      landingOwed = true;\n', 'failed-write-noted-as-landed'), 'failed-write-noted-as-landed'));
  ok(r.afterFailed.onDisk === true && !r.afterFailed.inFile, 'RED: a failed write noted as landed — the word says «in the file» over an entry in memory only', r);
}
{
  // (h) r3988 (A) ONE CLEARER, A CENSUS PIN: the mark leaves a record in exactly the two clearers (the Outbox's reconcile, the API cards'), and
  // each asks the stash's own word; no other line in src deletes the mark or writes it false. RED: a third clearer planted
  // r4023 (small): A PIN GUARDS A MISTAKE AND PROVES NOTHING — it reads text (a delete spelled another way, or through a helper, passes it); the
  // legs of the outbox and API cards suites are the proof of the clearers' behaviour
  const walk2 = (dir, out = []) => { for (const n of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, n.name); if (n.isDirectory()) walk2(f, out); else if (/\.(c|m)?js$/.test(n.name)) out.push(f); } return out; };
  const clearersOf = (texts) => {
    const found = {};
    for (const [rel, t] of texts) {
      const dels = (t.match(/delete\s+[\w.$\[\]'"]*\.notOnDisk\b/g) || []).length, falses = (t.match(/(?:\.notOnDisk\s*=\s*false|\bnotOnDisk\s*:\s*false)\b/g) || []).length;   // the MARK written false (a property), never a local of that name
      if (dels || falses) found[rel] = { dels, falses, asks: /\bstashOnDisk\s*\(/.test(t) };
    }
    return found;
  };
  const texts2 = new Map();
  for (const f of [...walk2(path.join(REPO, 'src')), path.join(REPO, 'server.js')]) { const t = fs.readFileSync(f, 'utf8'); if (/notOnDisk/.test(t)) texts2.set(path.relative(REPO, f).split(path.sep).join('/'), t); }
  const c = clearersOf(texts2);
  const want = ['src/server/channel-api-cards.js', 'src/server/channels-outbound.js'];
  const okSet = JSON.stringify(Object.keys(c).sort()) === JSON.stringify(want) && want.every((k) => c[k].dels === 1 && c[k].falses === 0 && c[k].asks);
  ok(okSet, `ONE CLEARER: the mark is deleted in exactly ${want.length} places (${want.join(', ')}), once each, each asking the stash's own word (stashOnDisk) — no line writes it false`, c);
  const planted = new Map(texts2); planted.set('src/server/a-third-clearer.js', 'if (rec.receiptDelivery) delete rec.receiptDelivery.notOnDisk;');
  const pc = clearersOf(planted);
  ok(!!pc['src/server/a-third-clearer.js'] && !pc['src/server/a-third-clearer.js'].asks && Object.keys(pc).length === 3, 'RED: a third clearer (one that does not ask the stash) is named', pc['src/server/a-third-clearer.js']);
}
console.log('§11 主开发 r5164 (2), a silence of the release: the start\'s release of a dead process\'s claims whose write FAILS is said by name (was an empty catch)');
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const CLAIMED = JSON.stringify({ [CA]: [{ source: 'agent', kind: 'peer', fromName: 'Ada', text: 'a message a dead process was handing over', ts: 1, ho: 'h-dead' }] });
  const releaseRun = (Mod) => {
    const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, CLAIMED);
    const logs = [], realRename = fs.renameSync; let refused = 0;
    // the plant: the start's rename of msg-stash.json refused (EIO); `refused` is its WITNESS (r5135 law 1)
    fs.renameSync = function (a, b, ...x) { if (path.resolve(String(b)) === path.resolve(F)) { refused++; throw Object.assign(new Error('EIO: i/o error, rename (placed)'), { code: 'EIO' }); } return realRename.call(this, a, b, ...x); };
    let D = null; try { D = Mod.create(deps(dir, { log: (...a) => logs.push(a.join(' ')) })); } finally { fs.renameSync = realRename; }
    const h = D.stashHealth();
    return { refused, said: logs.some((l) => /the release of the earlier hand-over claims of 1 conversation could not be saved to disk/.test(l)), durable: h.durable, kept: fs.readFileSync(F, 'utf8') === CLAIMED, waits: D.stashCount ? D.stashCount(CA) : null };
  };
  const r = releaseRun(CD);
  if (!(r.refused >= 1)) console.log(`  SKIP §11: the placed refusal was never read (${JSON.stringify(r)})`);
  else ok(r.said && r.durable === false && r.kept, '§11 the release\'s failed write is said BY NAME, the stash\'s health says «not durable», the file keeps the claims (the next start releases them again)', r);
  const rx = releaseRun(M.load('src/server/conversation-deliver.js', anchored(SRC, 'catch (e) { bootReleaseFailed = e; } }', 'catch { } }', 'the release\'s empty catch'), 'empty-catch'));
  if (!(rx.refused >= 1)) console.log(`  SKIP §11 RED: the placed refusal was never read (${JSON.stringify(rx)})`);
  else ok(!rx.said && rx.durable === true, '§11 RED CONTROL (the release\'s empty catch): nothing said, the health reads «durable» over a write that failed', rx);
}

console.log('§12 主开发 r5164 (2), a silence of the release: the stash\'s health while the list is HELD says «not durable» (it read only the last write\'s error)');
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const healthRun = (Mod) => { const { D, seen } = heldStart(Mod); const h0 = D.stashHealth(); D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'kept in memory while held' }); return { seen, held: !!D.stashHeld(), h0, h1: D.stashHealth() }; };
  const h = healthRun(CD);
  if (!(h.seen === 1 && h.held)) console.log(`  SKIP §12: the placed read refusal never held the list (${JSON.stringify(h)})`);
  else ok(h.h0.durable === false && h.h0.held === true && h.h1.durable === false && /could not be read/.test(h.h1.error || ''), '§12 HELD: the health reads «not durable» (held, its words) at the start and after an entry is kept in memory', h);
  const OLD = '  const stashHealth = () => ({ durable: !lastWriteError, error: lastWriteError ? lastWriteError.message : null, since: lastWriteError ? lastWriteError.at : null });\n';   // stale-pins: kept (the release's text — this red control's own)
  const i0 = SRC.indexOf('  const stashHealth = () => {'), i1 = SRC.indexOf('\n', i0) + 1;
  const hx = healthRun(M.load('src/server/conversation-deliver.js', anchored(SRC, SRC.slice(i0, i1), OLD, 'the release\'s health: the last error only'), 'health-old'));
  if (!(hx.seen === 1 && hx.held)) console.log(`  SKIP §12 RED: the placed read refusal never held the list (${JSON.stringify(hx)})`);
  else ok(hx.h1.durable === true, '§12 RED CONTROL (the release\'s health): «durable» while nothing is written', hx);
}

console.log('§13 主开发 r5164 (2): the hand-back whose note the stash REFUSES (a failed write, the list readable) — the real road answers stash_refused, and the page\'s words say a hand-back with its warning, no path');
{
  const TT = require(path.join(REPO, 'src/browser-tabs.js'));
  const refusedRun = async () => {
    const dir = mk(), F = path.join(dir, 'msg-stash.json'); fs.writeFileSync(F, BYTES);
    const D = CD.create(deps(dir));
    const sess = { name: 'Agent One', backend: 'claude', backendSessionId: CC, claudeSessionId: CC, mode: 'chat' };
    const keeper = { continueState: async () => ({ ok: true, tabs: [{ url: 'https://example.test/a', title: 'A' }], currentIndex: 0, tookOver: true, own: false, rerun: null, userActs: [] }) };
    const hb = require(path.join(REPO, 'src/server/browser-handback.js')).create({ keeper, deliver: D, activeSessions: new Map([['s1', sess]]), emitCard: () => true, notice: () => { }, log: { log() { }, warn() { } } });
    const realRename = fs.renameSync; let refused = 0;
    // the plant: the stash's rename refused (EIO) while the list reads — a ref'd entry's write that fails is taken back with a throw; `refused` is its WITNESS
    fs.renameSync = function (x, y, ...z) { if (path.resolve(String(y)) === path.resolve(F)) { refused++; throw Object.assign(new Error('EIO: i/o error, rename (placed)'), { code: 'EIO' }); } return realRename.call(this, x, y, ...z); };
    let v; try { v = await hb.continueFor({ sessionId: 's1', note: 'pick the blue one' }); } finally { fs.renameSync = realRename; }
    const routed = v && v.ok ? v : { error: String((v && (v.error || v.code)) || ''), code: v && v.code, handles: [] };   // src/routes/browser.js failVerdict's shape
    const w = TT.handBackAnswerWords(routed);
    return { refused, code: v && v.code, errorNamesFile: /msg-stash\.json/.test(String(v && v.error)), handedBack: w.handedBack, warn: w.warn, words: w.text, noPath: !/msg-stash|\.json|EIO/.test(w.text) };
  };
  const g = await refusedRun();
  if (!(g.refused >= 1)) console.log(`  SKIP §13: the placed refusal was never read (${JSON.stringify(g)})`);
  else ok(g.code === 'stash_refused' && g.handedBack && g.warn && /could not be queued/.test(g.words) && g.noPath, `§13 the real road: a refused stash write answers stash_refused (its error names the file: ${g.errorNamesFile}) — the page's words say HANDED BACK with a warning that the note was not queued, no path`, g);
}

console.log('§13b 主开发 r5235 (MUST): the hand-back refused BEFORE any act (the conversation has no id yet — the takeover NOT ended) — the real road answers its own code, and the page\'s words say NOT handed back');
{
  const TT = require(path.join(REPO, 'src/browser-tabs.js'));
  const HBSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-handback.js'), 'utf8');
  const earlyRun = async (HBm) => {
    const dir = mk(); const D = CD.create(deps(dir));
    const sess = { name: 'Agent Fresh', backend: 'claude', mode: 'chat' };   // its first reply has not come back: no conversation id
    let asked = 0;   // the WITNESS: the keeper's continueState (the act) is never reached on this road
    const keeper = { continueState: async () => { asked++; return { ok: true, tabs: [], currentIndex: 0, tookOver: true, own: false, rerun: null, userActs: [] }; } };
    const hb = HBm.create({ keeper, deliver: D, activeSessions: new Map([['s1', sess]]), emitCard: () => true, notice: () => { }, log: { log() { }, warn() { } } });
    const v = await hb.continueFor({ sessionId: 's1', note: 'a note before the first reply' });
    const routed = v && v.ok ? v : { error: String((v && (v.error || v.code)) || ''), code: v && v.code, handles: [] };   // src/routes/browser.js failVerdict's shape
    const w = TT.handBackAnswerWords(routed);
    return { asked, code: v && v.code, handedBack: w.handedBack, words: w.text };
  };
  const e = await earlyRun(require(path.join(REPO, 'src/server/browser-handback.js')));
  if (!(e.code && e.asked === 0)) console.log(`  SKIP §13b: the early road was not the one taken (${JSON.stringify(e)})`);
  else ok(e.code === 'no_conversation_id' && e.handedBack === false && /^Not handed back — this conversation has no id yet/.test(e.words), '§13b the refusal BEFORE any act answers no_conversation_id (the takeover not ended: the keeper never asked) — the page\'s words: NOT handed back, hand it back after the agent has answered once', e);
  const ex = await earlyRun(M.load('src/server/browser-handback.js', anchored(HBSRC, "code: !cid ? 'no_conversation_id' : 'unavailable', error: !cid ?", "code: 'stash_refused', error: !cid ?", 'the early refusal under the after-the-act code'), 'early-stash-refused'));   // stale-pins: kept (2e3d064a1's early code — this red control's own)
  if (!(ex.code && ex.asked === 0)) console.log(`  SKIP §13b RED: the early road was not the one taken (${JSON.stringify(ex)})`);
  else ok(ex.handedBack === true, '§13b RED CONTROL (2e3d064a1: the early refusal answered stash_refused): the page would say «handed back» while the takeover is still on', ex);
}

report();
