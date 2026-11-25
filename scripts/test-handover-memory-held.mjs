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
const FIRST = 'the first hand-over\'s message', SECOND = 'the second hand-over\'s message', THIRD = 'the third hand-over\'s message';
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
  const stop = () => { deliver.flush(); jm.shutdown?.(); view.close(); };   // r3772: the view's stop stops its hold too
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
  R.deliver.stashFor(CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: THIRD });
  const r3 = await R.view.handOver('w1');
  const untouched = fs.readFileSync(fileOf(d), 'utf8') === f.bytes;
  ok(seen === 1 && !!R.view.memoryHeld() && /could not be read/.test(R.view.memoryUnreadWords() || ''), 'HELD: the start\'s one read refused ⇒ the memory is held (its facts and words say so)', R.view.memoryHeld());
  ok(r2 && r2.ok && r3 && r3.ok && untouched, 'HELD: the next two hand-overs are delivered and NOTHING is written over the file (its bytes as they were)', { r2, r3, untouched });
  ok(R.logs.filter((l) => /kept in memory only until it reads/.test(l)).length === 1, 'HELD: TWO hand-overs while held, ONE journal line a hold says the records kept in memory only (a count, no words)', R.logs);
  const lifted = await R.view.memoryReadAgain();
  const j = readJson(fileOf(d)) || {};
  ok(lifted === true && !R.view.memoryHeld() && !!j[f.id] && !!j[r2.id] && !!j[r3.id] && Object.keys(j).indexOf(f.id) < Object.keys(j).indexOf(r2.id), 'LIFTED: every record on disk, the file\'s first, memory\'s after it', Object.keys(j));
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

// r3772's follow — the copies of the tree before it, each a line put back
const KEEP_TWICE = (src) => anchored(src, "        try { if (typeof d.stashPeek === 'function' && d.stashPeek(cid).some(", "        try { if (false && typeof d.stashPeek === 'function' && d.stashPeek(cid).some(", 'second-echo-kept-again');
const HAND_OUT_SECOND = (src) => anchored(anchored(src, '        if (ours && rec.restored) {\n', '        if (false) {\n', 'second-echo-not-handled'), '        } else if (ours) {\n', '        } else if (ours && !rec.restored) {\n', 'restored-goes-as-itself');
const echoOf = (d, id) => ((readJson(fileOf(d)) || {})[id] || {}).text;

console.log('§3b THE SAME FRAME ECHOED TWICE while held (a Stop AND a queue removal both report it): kept once; at the lift the original back ONCE, no frame handed out');
{
  const run = async (Mod = SH) => {
    const d = mk(); const f = await firstLife(d); const echo = echoOf(d, f.id);
    const { R } = heldLife(d, Mod);
    const n1 = R.deliver.restoreFrame(CID, echo, { kind: null }), n2 = R.deliver.restoreFrame(CID, echo, { kind: null });
    const kept = R.deliver.stashKeptCount(CID);
    await R.view.memoryReadAgain();
    const after = R.deliver.stashEntries(CID);
    const out = { n1, n2, kept, firsts: after.filter((e) => e && e.text === FIRST).length, frames: after.filter((e) => e && e.text === echo).length };
    R.stop(); return out;
  };
  const g = await run();
  ok(g.n1 === 1 && g.n2 === 1 && g.kept === 1 && g.firsts === 1 && g.frames === 0, `two echoes while held: kept ONCE (${g.kept}); at the lift the original back once (${g.firsts}), no frame handed out (${g.frames})`, g);
  const r = await run(M.load('src/server/stash-handover.js', HAND_OUT_SECOND(KEEP_TWICE(SRC)), 'echo-twice-release'));
  ok(r.kept === 2 && r.firsts === 1 && r.frames === 1, `RED: the unit's tip before the follow — kept twice, the second handed out after the restore: the same message twice (${r.firsts} original + ${r.frames} frame)`, r);
}

console.log('§3c A RESTORE THAT THROWS at the lift: (i) after its messages landed — they are back ONCE, the frame taken out, the job notifications OWED and put back once; (ii) with nothing landed — the frame goes as itself, the record spent on disk, said by a count');
{
  // line 886's small follow (主开发 r3995): THE RESTORE SAYS HOW FAR IT GOT — the leg counts the ORIGINALS too, never only the frames
  const run = async (Mod = SH, { msg = true, throwsOnce = true } = {}) => {
    const d = mk(); const f = await firstLife(d);
    const j = readJson(fileOf(d)); j[f.id].jobs = [{ jobId: 'jb-r1', jobName: 'nightly', text: 'a job result', at: 5 }]; if (!msg) j[f.id].msg = []; fs.writeFileSync(fileOf(d), JSON.stringify(j));
    const echo = j[f.id].text;
    let calls = 0, landedJobs = 0;
    const jobs = { peekNotifs: () => [], restoreNotifs: (c, js) => { calls++; if (!throwsOnce || calls === 1) throw new Error('the jobs store refused (placed)'); landedJobs += js.length; return js.length; }, afterNotifsLanded: () => { }, shutdown: () => { } };
    const { R } = heldLife(d, Mod, jobs);
    R.deliver.restoreFrame(CID, echo, { kind: null });
    await R.view.memoryReadAgain(); await sleep(30);
    const after = R.deliver.stashEntries(CID);
    const out = { frames: after.filter((e) => e && e.text === echo && !(e.about && e.about.handover)).length, firsts: after.filter((e) => e && e.text === FIRST).length, calls, landedJobs,
      said: R.logs.filter((l) => /1 kept frame whose originals could not all be restored/.test(l)).length, spentOnDisk: !!((readJson(fileOf(d)) || {})[f.id] || {}).restored };
    R.stop(); return out;
  };
  const g = await run();
  ok(g.firsts === 1 && g.frames === 0 && g.calls === 2 && g.landedJobs === 1, `(i) the jobs store throws AFTER the messages landed: the message back ONCE (${g.firsts}), no frame handed out (${g.frames}), the job result OWED and put back once (${g.landedJobs})`, g);
  const PROPAGATES = M.load('src/server/stash-handover.js', anchored(SRC, "      try { k += jm.restoreNotifs(cid, rec.jobs); }\n      catch (e) { if (!(k > 0)) throw e; jobsThrew = e; rec.jobsOwed = true; }\n", "      k += jm.restoreNotifs(cid, rec.jobs);\n", 'restore-throws-whole'), 'restore-throws-whole');
  const r1 = await run(PROPAGATES);
  ok(r1.firsts === 1 && r1.frames === 1, `RED: the follow's first form (a throw after the messages landed reaches the caller) — the message back AND the frame handed out: the same message twice (${r1.firsts} + ${r1.frames})`, r1);
  const n = await run(SH, { msg: false, throwsOnce: false });
  ok(n.frames === 1 && n.firsts === 0 && n.said === 1 && n.spentOnDisk, `(ii) nothing landed (the jobs store refuses, no messages in the record): the frame goes as itself (${n.frames}), ONE count line, the record spent ON DISK (a restart never restores it again)`, n);
  const OLD = M.load('src/server/stash-handover.js', anchored(SRC, "          try { k = restoreHandedOver(cid, text, { kind: e.kind || null }); } catch (err) { threw = err; }\n", "          if (typeof d.drainStash === 'function') d.drainStash(cid, new Set([e]));\n          try { k = restoreHandedOver(cid, text, { kind: e.kind || null }); } catch (err) { threw = err; }\n", 'frame-out-before-restore'), 'frame-out-before-restore');
  const r = await run(OLD, { msg: false, throwsOnce: false });
  ok(r.frames === 0, `RED: the frame taken out BEFORE its originals are restored — a throw with nothing landed leaves it out: the job result lost (${r.frames})`, r);
}

console.log('§3e THE DOUBLE ECHO IN THE TWO ORDERS NOT YET LEGGED (r3995): one while held and one after the lift; one restored in an earlier life and echoed again while held — the original once, no frame handed out');
{
  const order1 = async (Mod = SH) => {
    const d = mk(); const f = await firstLife(d); const echo = echoOf(d, f.id);
    const { R } = heldLife(d, Mod);
    R.deliver.restoreFrame(CID, echo, { kind: null });
    await R.view.memoryReadAgain();
    const n2 = R.deliver.restoreFrame(CID, echo, { kind: null });
    if (!n2) R.deliver.stashFor(CID, { source: 'agent', kind: 'notification', fromName: 'VibeSpace notices', text: echo });   // as the two stdout consumers do with a 0: the frame stashed as itself
    const after = R.deliver.stashEntries(CID);
    const out = { n2, firsts: after.filter((e) => e && e.text === FIRST).length, frames: after.filter((e) => e && e.text === echo).length };
    R.stop(); return out;
  };
  const g1 = await order1();
  ok(g1.firsts === 1 && g1.frames === 0 && g1.n2 > 0, `one echo while held, one after the lift: the original once (${g1.firsts}), no frame (${g1.frames}) — the second answered by the record (${g1.n2})`, g1);
  const r1 = await order1(M.load('src/server/stash-handover.js', anchored(SRC, "    if (rec.restored) { log.log?.(`[stash] ${cid}: hand-over ${m[1]} echoed again — already restored (${rec.restored})`); return rec.restored; }\n", '', 'second-echo-restores-again'), 'second-echo-restores-again'));
  ok(r1.frames === 1, `RED: a restore blind to «already restored» — the second echo answers 0 and the consumer stashes the frame as itself: the words twice (${r1.firsts} original + ${r1.frames} frame)`, r1);
  const order2 = async (Mod = SH) => {
    const d = mk(); const f = await firstLife(d); const echo = echoOf(d, f.id);
    const a = rig(d); a.deliver.restoreFrame(CID, echo, { kind: null }); a.stop();   // an EARLIER LIFE: read, restored, written
    const { R } = heldLife(d, Mod);
    R.deliver.restoreFrame(CID, echo, { kind: null });   // echoed again while this life's memory is unread: kept
    await R.view.memoryReadAgain();
    const after = R.deliver.stashEntries(CID);
    const out = { firsts: after.filter((e) => e && e.text === FIRST).length, frames: after.filter((e) => e && e.text === echo).length };
    R.stop(); return out;
  };
  const g2 = await order2();
  ok(g2.firsts === 1 && g2.frames === 0, `restored in an earlier life, echoed again while held: at the lift the record says restored — the kept copy taken out (frames ${g2.frames}), the original once (${g2.firsts})`, g2);
  const r2 = await order2(M.load('src/server/stash-handover.js', HAND_OUT_SECOND(SRC), 'earlier-life-copy-handed-out'));
  ok(r2.frames === 1, `RED: the restored record's copy handed out as itself (${r2.frames})`, r2);
}

console.log('§3d A FRAME FOR A HAND-OVER THE MEMORY DOES NOT KNOW, even after the read: kept while held, then handed out AS ITSELF — its mark dropped on disk too, the wrapper\'s own label');
{
  const LABEL = 'VibeSpace notices · the wrapper\'s label';
  const run = async (Mod = SH) => {
    const d = mk(); const f = await firstLife(d);
    const other = echoOf(d, f.id).split(f.id).join('ho-unknown-1');
    const { R } = heldLife(d, Mod);
    const n = R.deliver.restoreFrame(CID, other, { kind: null, fromName: LABEL });
    await R.view.memoryReadAgain();
    const seen = R.deliver.stashEntries(CID).filter((e) => e && e.text === other);
    const disk = ((readJson(path.join(d, 'msg-stash.json')) || {})[CID] || []).filter((e) => e && e.text === other);
    const out = { n, seen: seen.length, label: seen[0] && seen[0].fromName, marks: seen.filter((e) => e.about && e.about.handover).length, disk: disk.length, diskMarks: disk.filter((e) => e.about && e.about.handover).length };
    R.stop(); return out;
  };
  const g = await run();
  ok(g.n === 1 && g.seen === 1 && g.marks === 0 && g.disk === 1 && g.diskMarks === 0 && g.label === LABEL, 'kept while held; at the lift, not remembered: visible as itself with the wrapper\'s label, its mark gone in memory AND on disk', g);
  const r = await run(M.load('src/server/stash-handover.js', anchored(SRC, '        } else { delete e.about; unmarked++;', "        } else { if (typeof d.drainStash === 'function') d.drainStash(cid, new Set([e])); unmarked++;", 'unknown-frame-drained'), 'unknown-frame-drained'));
  ok(r.seen === 0, `RED: a drain on that road loses the frame (${r.seen})`, r);
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

console.log('§4b A READABLE START THAT FINDS TWO KEPT COPIES of an earlier life (a tree that kept a second echo): the original back once, no frame handed out');
{
  const run = async (Mod = SH) => {
    const d = mk(); const f = await firstLife(d); const echo = echoOf(d, f.id);
    const a = heldLife(d, M.load('src/server/stash-handover.js', KEEP_TWICE(SRC), 'kept-twice-earlier-life'));
    a.R.deliver.restoreFrame(CID, echo, { kind: null }); a.R.deliver.restoreFrame(CID, echo, { kind: null });
    const kept = a.R.deliver.stashKeptCount(CID); a.R.stop();
    const R = rig(d, Mod);
    await waitFor(() => R.deliver.stashEntries(CID).some((e) => e && e.text === FIRST)); await sleep(50);
    const after = R.deliver.stashEntries(CID);
    const out = { kept, firsts: after.filter((e) => e && e.text === FIRST).length, frames: after.filter((e) => e && e.text === echo).length };
    R.stop(); return out;
  };
  const g = await run();
  ok(g.kept === 2 && g.firsts === 1 && g.frames === 0, `two kept copies at a readable start: the original back once (${g.firsts}), no frame handed out (${g.frames})`, g);
  const r = await run(M.load('src/server/stash-handover.js', HAND_OUT_SECOND(SRC), 'restored-handed-out'));
  ok(r.firsts === 1 && r.frames === 1, `RED: the second copy meets a restored record and is handed out as itself (${r.frames})`, r);
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
  const NOCLEAR = M.load('src/server/stash-handover.js', anchored(SRC, '      clearsHeld.push({ match, scope });\n', '', 'clear-not-kept'), 'clear-not-kept');
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

console.log('§6b the lift puts back ONLY the file\'s put-backs — never memory\'s a second time');
{
  const run = async (Mod = SH) => {
    const d = mk();
    fs.writeFileSync(fileOf(d), JSON.stringify({ 'ho-x-1': { cid: CID, msg: [], jobs: [{ jobId: 'jb-held1', jobName: 'nightly', text: 'a job result', at: 5 }], jobsOwed: true, at: Date.now(), text: 'a frame (hand-over ho-x-1)' } }));
    const calls = [];
    const jobs = { peekNotifs: () => [], restoreNotifs: (c, js) => { calls.push(js.map((n) => n.jobId).join(',')); return js.length; }, afterNotifsLanded: () => { }, shutdown: () => { } };
    const { R } = heldLife(d, Mod, jobs);
    // a record memory made while held whose put-back has not landed (its landing never came in this life)
    R.view._delivered.set('ho-x-2', { cid: CID, msg: [], jobs: [{ jobId: 'jb-mem1', jobName: 'mine', text: 'a result memory keeps', at: 6 }], jobsOwed: true, at: Date.now(), text: 'a frame (hand-over ho-x-2)' });
    await R.view.memoryReadAgain();
    await waitFor(() => calls.length >= 1); await sleep(80);
    R.stop(); return calls;
  };
  const g = await run();
  ok(g.length === 1 && g[0] === 'jb-held1', `the file's put-back once, memory's not again (${g.join(' | ')})`, g);
  const r = await run(M.load('src/server/stash-handover.js', anchored(SRC, 'r.jobsOwed && r.jobs.length && (!only || only.has(r))', 'r.jobsOwed && r.jobs.length && (true || only)', 'put-back-every-record'), 'put-back-every-record'));
  ok(r.length === 2, `RED: no «only the file's» filter — memory's record put back at the lift as well (${r.join(' | ')})`, r);
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

{
  const sj = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const iDeliver = sj.indexOf("const deliver = require('./src/server/conversation-deliver.js').create("), iView = sj.indexOf("const stashView = require('./src/server/stash-handover.js').create("), iListen = sj.indexOf('hub.listen(PORT, HOST'), iRestore = sj.indexOf('restoreSessions();', iListen);
  ok(iDeliver > 0 && iView > iDeliver && iListen > iView && iRestore > iListen && /  if \(file\) \{\n    let read = null;\n    try \{ read = \{ text: fs\.readFileSync\(file, 'utf-8'\) \}; \} catch \(error\) \{ read = \{ error \}; \}/.test(SRC),
    'THE BOOT ORDER (a fast pin, r3772): the hand-over memory is read synchronously at create, after the deliver ladder and before hub.listen; restoreSessions runs inside the listen callback', { iDeliver, iView, iListen, iRestore });
}

console.log('§9 THE STOP STOPS THE HOLD: after close() no read again, no lift, no write');
{
  const run = async (Mod = SH) => {
    const d = mk(); const f = await firstLife(d);
    const { R } = heldLife(d, Mod);
    R.deliver.stashFor(CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: SECOND }); await R.view.handOver('w1');
    R.view.close();
    const lifted = await R.view.memoryReadAgain();
    const out = { lifted, untouched: fs.readFileSync(fileOf(d), 'utf8') === f.bytes };
    R.stop(); return out;
  };
  const g = await run();
  ok(g.lifted === false && g.untouched, 'closed while held: the read again does nothing, nothing is merged or written', g);
  const r = await run(M.load('src/server/stash-handover.js', anchored(SRC, '  function close() { closed = true; if (memHold) memHold.stop(); }', '  function close() { closed = true; }', 'stop-leaves-the-hold'), 'stop-leaves-the-hold'));   // stale-pins: kept — the release's stop, put back in the RED's copy
  ok(r.lifted === true && !r.untouched, 'RED: a stop that leaves the hold — a lift after it merges and writes over the file', r);
}

report();
