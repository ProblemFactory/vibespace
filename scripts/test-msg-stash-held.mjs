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

console.log('§1 a stash that could not be read is HELD: nothing is written over it, and it comes back whole');
{
  // CONTROL: the read answers ⇒ the stop keeps both conversations' entries
  const d0 = mk(), F0 = path.join(d0, 'msg-stash.json'); fs.writeFileSync(F0, BYTES);
  const D0 = CD.create(deps(d0)); D0.flush();
  ok(both(readJson(F0)) && D0.stashHeld() === null, 'CONTROL: the stash read at the start ⇒ the stop keeps both conversations\' waiting entries, nothing held', readJson(F0));
  const { D, F, seen } = heldStart();
  const held = D.stashHeld();
  ok(seen === 1 && !!held && held.code === 'EIO' && /could not be read/.test(D.stashUnreadWords() || ''), `PLANT: the start's one read answered EIO ⇒ HELD (${held && held.code}), its words say so`, held);
  D.flush();
  ok(fs.readFileSync(F, 'utf8') === BYTES, 'HELD: the hub stop (deliver.flush) writes NOTHING over the file — its bytes as they were', fs.readFileSync(F, 'utf8').slice(0, 80));
  // a new entry while held: no ref ⇒ kept in memory (never written over the file); a ref'd one ⇒ refused BY NAME to its producer
  D.stashFor(CC, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'a message stashed while held' });
  const refused = codeOf(() => D.stashFor(CC, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'a receipt while held', ref: 'p-2' }));
  ok(fs.readFileSync(F, 'utf8') === BYTES && refused === 'msg_stash_unread' && D.stashEntries(CC).length === 1, `HELD: a new entry lives in memory (1), nothing written over the file; a ref'd one is refused by name (${refused})`, { refused, mem: D.stashEntries(CC).length });
  // a road that DECIDES from the stash (a receipt's fate, a dedupe) is told «unknown»: stashPeek throws the hold's refusal
  ok(codeOf(() => D.stashPeek(CB)) === 'msg_stash_unread', 'HELD: stashPeek (a road that decides from the stash) is refused by name — it decides nothing', codeOf(() => D.stashPeek(CB)));
  // the read again answers ⇒ LIFTED: what the file held, then what memory took meanwhile — written once
  const lifted = await D.stashReadAgain();
  const after = readJson(F);
  ok(lifted === true && D.stashHeld() === null && both(after) && after[CC] && after[CC].length === 1 && after[CC][0].text === 'a message stashed while held' && D.stashPeek(CB).length === 1,
    'LIFTED: both conversations\' entries are back, the entry stashed while held after them — on disk, peek answers again', after);
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
  ok(fs.readdirSync(dir2).filter((n) => n.startsWith('msg-stash.json.corrupt-')).length === 1, 'TORN: the same torn bytes already beside the store ARE their copy — none made again', fs.readdirSync(dir2));
}

console.log('§4 a clear made while held reaches the entries when they come back (the stores that own the words judge them again)');
{
  const { D, F } = heldStart();
  // a store-backed judge (as the jobs and groups engines are): Ada's words were cleared while the stash was held
  D.registerStashJudge((e) => (e && e.fromName === 'Ada' ? { text: 'a message whose words were cleared' } : null));
  await D.stashReadAgain();
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
  // a TORN lift: the strip names where the damaged bytes are kept — never «restore that copy»
  const tw = S.stashSummaryWords({ count: 0, items: [], stashTorn: { copy: 'msg-stash.json.corrupt-1' } }, (x, p) => (p ? x.replace(/\{(\w+)\}/g, (_, k) => p[k]) : x), { reachable: false });
  ok(!!tw && tw.head.includes('msg-stash.json.corrupt-1') && /Send again anything that should still reach them/.test(tw.head) && !/restore/i.test(tw.head), `the STRIP after torn bytes names the copy and what the person can do («${tw && tw.head}»)`);
}

report();
