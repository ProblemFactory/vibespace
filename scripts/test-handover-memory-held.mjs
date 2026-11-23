#!/usr/bin/env node
// test-handover-memory-held — r3003 (c) (主开发, lane hub-loop-stalls): data/stash-handover.json (a delivered hand-over's originals,
// kept 24 h for a frame the wrapper hands back) UNDER THE STORE-READ LAW (src/store-read-hold.js), through the REAL
// src/server/stash-handover.js and src/server/conversation-deliver.js over a scratch data folder of this suite's own (made-up
// messages). The unreadable file is a PLACED refusal of the read call (fs.readFileSync answers EIO for that one path, the next read
// only), never a mount, never a mode change; torn bytes are bytes written whole that do not parse. No vendor call; nothing else.
// Each law: its leg, and the RED (the release's line put back in a copy) where a line can be put back.
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
const { CLEARED_TEXT } = require(path.join(REPO, 'src/record-clear.js'));
const M = mutantCopies('handover-memory-held', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf8');
const EIO = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
/** a PLACED refusal of the next `n` sync reads of `file` (EIO), then real reads */
const placeReads = (file, n = 1) => {
  const f = path.resolve(file), realS = fs.readFileSync; const seen = { sync: 0 };
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f && seen.sync < n) { seen.sync++; throw EIO(); } return realS.call(this, p, ...a); };
  return { seen, restore: () => { fs.readFileSync = realS; } };
};
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let dirN = 0;
const mk = () => { const d = path.join(scratch('handover-memory-held'), 'd' + (++dirN)); fs.mkdirSync(path.join(d, 'session-buffers'), { recursive: true }); return d; };
const CID = 'c0ffee00-0000-4000-8000-0000000000c9';
const FIRST = 'the first hand-over\'s message', SECOND = 'the second hand-over\'s message';
/** one life of the hub: the REAL deliver ladder and hand-over view, wired as server.js wires them (the frame restorer, the redactor) */
const rig = (dir, Mod = SH, jobs = null) => {
  const s = { name: 'Agent One', backend: 'claude', backendSessionId: CID, claudeSessionId: CID, mode: 'chat', _isStreaming: false, buffer: '', sockName: 'cw-w1', socketPath: path.join(dir, 'cw-w1') };
  const sessions = new Map([['w1', s]]);
  const logs = [];
  let view = null;
  const deliver = CD.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (c) => (c === CID ? { name: 'Agent One', socketPath: '/nowhere' } : null), postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) },
    getHosts: () => ({ get: () => null, deviceBounded: async () => ({ peerPost: async () => ({ ok: false, reason: 'no live inbox for this conversation on this machine' }) }) }),
    getConvIndex: () => ({ ownerHost: () => null }),
    authorizeSpend: (req) => ({ ok: true, identity: { key: 'acct', name: 'Work' }, hold: { k: 1 }, reason: req.reason }), noteSpend: () => { }, releaseSpend: () => { },
    onStashChange: () => { view && view.changed(); }, emitPeerCard: () => { }, log: () => { } });
  const jm = jobs || new JobManager({ dataDir: dir, log: () => { }, broadcast: () => { }, onStash: () => { view && view.changed(); } });
  view = Mod.create({ activeSessions: sessions, getDeliver: () => deliver, getJobs: () => jm, broadcastSessions: () => { }, renderMsgStash, renderNotifStash, debounceMs: 10,
    log: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) }, dataDir: dir });
  deliver.registerFrameRestorer((c, t, m) => view.restoreHandedOver(c, t, m)); deliver.registerRedactor((m, sc) => view.redactDelivered(m, sc));   // server.js's two lines
  const stop = () => { deliver.flush(); jm.shutdown?.(); };
  return { deliver, jm, view, logs, stop };
};
const fileOf = (dir) => path.join(dir, SH.DELIVERED_FILE);
/** the first life: one hand-over delivered, its record on disk */
async function firstLife(dir, Mod = SH) {
  const R = rig(dir, Mod);
  R.deliver.stashFor(CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: FIRST });
  const r1 = await R.view.handOver('w1');
  R.stop();
  return { id: r1 && r1.id, ok: !!(r1 && r1.ok), bytes: fs.readFileSync(fileOf(dir), 'utf8') };
}
/** a life whose ONE read of the hand-over memory is refused (EIO) */
function heldLife(dir, Mod = SH, jobs = null) { const pr = placeReads(fileOf(dir)); let R = null; try { R = rig(dir, Mod, jobs); } finally { pr.restore(); } return { R, seen: pr.seen.sync }; }
const waitFor = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(20); } return !!fn(); };

console.log('§1 a hand-over memory that could not be read is HELD: nothing is written over it, and it comes back whole');
{
  const d0 = mk(); const f0 = await firstLife(d0);
  const R0 = rig(d0); R0.deliver.stashFor(CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: SECOND }); const r0 = await R0.view.handOver('w1'); R0.stop();
  ok(f0.ok && r0 && r0.ok && !!(readJson(fileOf(d0)) || {})[f0.id], 'CONTROL: the memory read at the start ⇒ after the next hand-over the first hand-over\'s record is still on disk');
  const d = mk(); const f = await firstLife(d);
  const { R, seen } = heldLife(d);
  R.deliver.stashFor(CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: SECOND });
  const r2 = await R.view.handOver('w1');
  const untouched = fs.readFileSync(fileOf(d), 'utf8') === f.bytes;
  ok(seen === 1 && !!R.view.memoryHeld() && /could not be read/.test(R.view.memoryUnreadWords() || ''), 'HELD: the start\'s one read refused ⇒ the memory is held (its facts and words say so)', R.view.memoryHeld());
  ok(r2 && r2.ok && untouched, 'HELD: the next hand-over is delivered and NOTHING is written over the file (its bytes as they were)', { r2, untouched });
  ok(R.logs.filter((l) => /kept in memory only until it reads/.test(l)).length === 1, 'HELD: ONE journal line a hold says the records kept in memory only (a count, no words)', R.logs);
  const lifted = await R.view.memoryReadAgain();
  const j = readJson(fileOf(d)) || {};
  ok(lifted === true && !R.view.memoryHeld() && !!j[f.id] && !!j[r2.id] && Object.keys(j).indexOf(f.id) < Object.keys(j).indexOf(r2.id), 'LIFTED: both records on disk, the file\'s first, memory\'s after it', Object.keys(j));
  R.stop();
  const NOHOLD = M.load('src/server/stash-handover.js', anchored(SRC, "    if (memHold && !memHold.writable('a write of the hand-over memory')) {   // HELD: never over a file that could not be read\n", '    if (false) {\n', 'persist-over-unread'), 'persist-over-unread');
  const dr = mk(); const fr = await firstLife(dr);
  const H = heldLife(dr, NOHOLD); H.R.deliver.stashFor(CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: SECOND }); await H.R.view.handOver('w1'); H.R.stop();
  ok(!(readJson(fileOf(dr)) || {})[fr.id], 'RED: a save that writes over the unread file ⇒ the first hand-over\'s record is gone (the release\'s loss)');
}

console.log('§2 a restart while held: held again, the file untouched');
{
  const d = mk(); const f = await firstLife(d);
  const a = heldLife(d); a.R.deliver.stashFor(CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: SECOND }); await a.R.view.handOver('w1'); a.R.stop();
  const b = heldLife(d); b.R.stop();
  ok(!!b.R.view.memoryHeld() && fs.readFileSync(fileOf(d), 'utf8') === f.bytes, 'a restart while still unreadable: held again; its stop leaves the bytes as they were');
}

console.log('§3 THE ECHO while held: a frame naming a hand-over the memory cannot see is KEPT as itself (not handed out), then judged at the lift');
{
  const d = mk(); const f = await firstLife(d);
  const echo = ((readJson(fileOf(d)) || {})[f.id] || {}).text;
  const { R } = heldLife(d);
  const n = R.deliver.restoreFrame(CID, echo, { kind: null });
  const visible = R.deliver.stashEntries(CID).filter((e) => e && e.text === echo).length;
  const onDisk = ((readJson(path.join(d, 'msg-stash.json')) || {})[CID] || []).filter((e) => e && e.about && e.about.handover === f.id).length;
  ok(typeof echo === 'string' && n === 1 && visible === 0 && R.deliver.stashKeptCount(CID) === 1 && onDisk === 1, `HELD: the frame is kept in the stash as itself, on disk, marked — not handed out (kept ${R.deliver.stashKeptCount(CID)}, visible ${visible})`, { n, visible, onDisk });
  await R.view.memoryReadAgain();
  const after = R.deliver.stashEntries(CID);
  ok(after.some((e) => e && e.text === FIRST && e.fromName === 'Ada') && !after.some((e) => e && e.about && e.about.handover) && R.deliver.stashKeptCount(CID) === 0, 'LIFTED: the hand-over\'s ORIGINAL is back as itself and the kept frame is gone', after.map((e) => e && e.text));
  ok(!!((readJson(fileOf(d)) || {})[f.id] || {}).restored, 'LIFTED: the record is marked restored (a second echo is never restored twice)');
  R.stop();
  const NOECHO = M.load('src/server/stash-handover.js', anchored(SRC, '    if (!rec && memHeld()) {\n', '    if (false) {\n', 'echo-without-hold'), 'echo-without-hold');
  const dr = mk(); const fr = await firstLife(dr);
  const echoR = ((readJson(fileOf(dr)) || {})[fr.id] || {}).text;
  const H = heldLife(dr, NOECHO);
  ok(H.R.deliver.restoreFrame(CID, echoR, { kind: null }) === 0, 'RED: a restore that cannot see the hold answers 0 — its caller keeps the frame as one notice for good');
  H.R.stop();
}

console.log('§4 a readable start judges an earlier life\'s kept frame (its lift never came)');
{
  const d = mk(); const f = await firstLife(d);
  const echo = ((readJson(fileOf(d)) || {})[f.id] || {}).text;
  const a = heldLife(d); a.R.deliver.restoreFrame(CID, echo, { kind: null }); a.R.stop();
  const R = rig(d);
  const done = await waitFor(() => R.deliver.stashEntries(CID).some((e) => e && e.text === FIRST));
  ok(done && !R.deliver.stashEntries(CID).some((e) => e && e.about && e.about.handover), 'a readable start: the original back as itself, the kept frame gone', R.deliver.stashEntries(CID).map((e) => e && e.text));
  R.stop();
}

console.log('§5 a clear made while held reaches the file\'s record at the lift');
{
  const match = (e) => (e && String(e.text || '').includes(FIRST) ? { text: CLEARED_TEXT } : null);
  const d = mk(); const f = await firstLife(d);
  ok(fs.readFileSync(fileOf(d), 'utf8').includes(FIRST), 'CONTROL: the record on disk carries the words before any clear');
  const { R } = heldLife(d);
  R.view.redactDelivered(match, {});
  await R.view.memoryReadAgain();
  ok(!fs.readFileSync(fileOf(d), 'utf8').includes(FIRST), 'a clear made while held: at the lift the file\'s record carries none of its words');
  R.stop();
  const NOCLEAR = M.load('src/server/stash-handover.js', anchored(SRC, '    if (memHeld()) clearsHeld.push({ match, scope });', '', 'clear-not-kept'), 'clear-not-kept');
  const dr = mk(); await firstLife(dr);
  const H = heldLife(dr, NOCLEAR); H.R.view.redactDelivered(match, {}); await H.R.view.memoryReadAgain();
  ok(fs.readFileSync(fileOf(dr), 'utf8').includes(FIRST), 'RED: a clear not kept for the lift ⇒ the file\'s record keeps the cleared words');
  H.R.stop();
}

console.log('§6 a put-back of job notifications the last process left in the file goes back at the lift, never while held');
{
  const d = mk();
  const rec = { cid: CID, msg: [], jobs: [{ jobId: 'jb-held1', jobName: 'nightly', text: 'a job result', at: 5 }], jobsOwed: true, at: Date.now(), text: 'a frame (hand-over ho-x-1)' };
  fs.writeFileSync(fileOf(d), JSON.stringify({ 'ho-x-1': rec }));
  const calls = [];
  const jobs = { peekNotifs: () => [], restoreNotifs: (c, js) => { calls.push([c, js.length]); return js.length; }, afterNotifsLanded: () => { }, shutdown: () => { } };
  const { R } = heldLife(d, SH, jobs);
  await sleep(60);
  const whileHeld = calls.length;
  await R.view.memoryReadAgain();
  const put = await waitFor(() => calls.length === 1);
  ok(whileHeld === 0 && put && calls[0][0] === CID && calls[0][1] === 1, `the file's put-back: nothing while held (${whileHeld}), put back ONCE at the lift`, calls);
  R.stop();
}

console.log('§7 TORN: kept aside once, byte for byte; the memory starts empty and names its copy');
{
  const d = mk(); const TORN = '{"ho-x-1": {"cid": "' + CID + '", "text": "a fr';
  fs.writeFileSync(fileOf(d), TORN);
  const R = rig(d);
  const lifted = await waitFor(() => !R.view.memoryHeld());
  const copies = fs.readdirSync(d).filter((n) => n.startsWith(SH.DELIVERED_FILE + '.corrupt-'));
  const t = R.view.memoryTorn();
  ok(lifted && copies.length === 1 && fs.readFileSync(path.join(d, copies[0]), 'utf8') === TORN && t && t.copy === copies[0], 'TORN: one copy beside the store, byte-equal; the lift names it', { copies, t });
  R.stop();
  fs.writeFileSync(fileOf(d), TORN);
  const R2 = rig(d); await waitFor(() => !R2.view.memoryHeld()); R2.stop();
  ok(fs.readdirSync(d).filter((n) => n.startsWith(SH.DELIVERED_FILE + '.corrupt-')).length === 1, 'the same torn bytes at a later start: no second copy');
}

console.log('§8 production: server.js hands the hand-over its data folder and wires its restorer and redactor to the ONE deliver');
{
  const sv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const call = sv.slice(sv.indexOf("require('./src/server/stash-handover.js').create({"), sv.indexOf("require('./src/server/stash-handover.js').create({") + 3000);
  ok(/dataDir: path\.join\(__dirname/.test(call) && /deliver\.registerFrameRestorer\(\(cid, text, meta\) => stashView\.restoreHandedOver\(cid, text, meta\)\)/.test(sv) && /deliver\.registerRedactor\(\(match, scope\) => stashView\.redactDelivered\(match, scope\)\)/.test(sv),
    'PRODUCTION: the view reads its file from the data folder; the deliver\'s frame restorer and redactor are the view\'s');
}

report();
