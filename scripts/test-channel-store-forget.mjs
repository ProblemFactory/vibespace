#!/usr/bin/env node
// test-channel-store-forget — ROW B-92fc (主开发 r2819; the independent verification's not-kept 2): «Forget its data» left the
// account's OWN folder (data/channels/<account>/: its authors' pictures, the people memo, the memos, the folder itself). THE LAW:
// after the forget says done, NO byte of that account is under the channels data — rows' logs, messages, attachments, memos,
// pictures, the people memo, and its folders — and a write that lands AFTER the purge makes nothing again. Nothing
// synchronous on the loop. A real createChannelStore over a temp folder with its own store writer:
//   ① THE LAW: an account with every kind of local copy, then `await purgeAccount`: nothing of it under msgs/, attachments/ or
//      its own folder; a second account untouched. RED: the purge that leaves the own folder (the release's).
//   ② LATE WRITERS after the purge — a picture, a picture's refusal, the people memo, both memos, a message, a side line, a
//      prepend, an attachment: each makes NOTHING. RED: the picture refusal's guard removed.
//   ③ A STALL in a picture fetch's window (held just before it makes its folder), the purge inside it, then the release: the
//      fetch makes nothing (its folder not made again). RED: the fetch blind to a purge after its waits.
//   ④ THE PEOPLE MEMO OWED at the purge (handed to the writer, not written yet): never written. RED: the purge that forgets
//      neither the memo's cache nor its owed write.
//   ⑤ NOTHING SYNCHRONOUS: the purge makes no synchronous fs call on the main thread. RED: the release's purge (rmSync).
//   ⑥ A REMOVAL THAT FAILS (主开发 r2878), placed for each folder in turn: the purge NOT said done, the folder named with its code,
//      kept in purge-pending.json; the NEXT START finishes it. RED: the purge that swallows the failure (the release's).
//   ⑦ THE PERSON IS TOLD: the panel names what is left and that it is tried again (zh, ja); the remove road answers purgeLeft and
//      writes the purge's mark before the record leaves. RED: the dialog without its branch.
// Run: node scripts/test-channel-store-forget.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
const M = mutantCopies('store-forget', REPO);
const { ok, report } = checker();
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'store-forget-'));
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const A = 'slack-a', B = 'slack-b';
// everything of an account under the channels data: its three folders (msgs/<seg>, attachments/<seg>, <seg>/)
const left = (dir, id) => ['msgs', 'attachments', ''].map((sub) => path.join(dir, sub, id)).filter((p) => fs.existsSync(p)).map((p) => path.relative(dir, p) || '.');
async function fill(st, w, dir, id) {
  st.appendRecords(id, 'c1', [{ vendorId: 'm1', at: 1, text: 'hello' }]);
  st.appendSide(id, 'c1', [{ msg: 'm1', kind: 'reaction', at: 2, by: 'u1', emoji: 'tada' }]);
  await st.attachmentPut(id, 'c1', 'f1', { msg: 'm1', data: Buffer.from('file'), mime: 'text/plain' });
  await st.avatarPut(id, 'u1', { data: Buffer.from('png'), mime: 'image/png' });
  st.avatarRefuse(id, 'u2', { code: 'no-picture', until: 9e12 });
  st.peopleWrite(id, { self: 'u0', people: { u1: { name: 'One' } } });
  st.searchMemoWrite(id, { v: 1, entries: [] }); st.feedMissWrite(id, { v: 1, rows: [] });
  for (const f of [path.join(dir, id, 'people.json'), path.join(dir, id, 'search-memo.json'), path.join(dir, id, 'feed-misses.json')]) await w.durable(f);
}
const open = (mod, dir) => { const w = SW.create({ log: quiet }); return { w, st: mod.createChannelStore({ dir, log: quiet, writer: w }) }; };
const shut = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };

// ═══ ① THE LAW ═══
console.log('① «forget its data»: nothing of the account under the channels data; a second account untouched');
async function lawLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  await fill(o.st, o.w, dir, A); await fill(o.st, o.w, dir, B);
  const before = left(dir, A);
  const r = await o.st.purgeAccount(A);
  shut(o);
  return { before, after: left(dir, A), other: left(dir, B), r };
}
{
  const r = await lawLeg(CS, 'law');
  ok(r.before.length === 3 && r.after.length === 0 && r.other.length === 3 && r.r.logs && r.r.files && r.r.own, `① after the purge nothing of the account is left (before: ${r.before.join(' ')}; after: ${r.after.join(' ') || 'nothing'}); the second account keeps its three folders (${r.other.join(' ')})`, r);
  const KEEP = M.load('src/channel-store.js', anchored(anchored(SRC, '    for (const [k, q] of Object.entries(folders)) r[k] = await removeOne(q);', "    for (const [k, q] of Object.entries(folders)) r[k] = k === 'own' ? { state: 'absent' } : await removeOne(q);", 'the purge that leaves the own folder'), '    for (const [k, q] of Object.entries(folders)) if (await there(q)) {', "    for (const [k, q] of Object.entries(folders)) if (k !== 'own' && await there(q)) {", 'and its last look'), 'keep-own');
  const red = await lawLeg(KEEP, 'law-red');
  ok(red.after.includes(A), `① RED CONTROL: the purge that leaves the account's own folder (the release's) — left: ${red.after.join(' ')} — the leg above would go red`, red);
}

// ═══ ② LATE WRITERS ═══
console.log('② every late writer after the purge makes nothing');
async function lateLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  await fill(o.st, o.w, dir, A);
  await o.st.purgeAccount(A);
  const st = o.st;
  await st.avatarPut(A, 'u3', { data: Buffer.from('late'), mime: 'image/png' });
  st.avatarRefuse(A, 'u4', { code: 'no-picture', until: 9e12 });
  st.peopleWrite(A, { self: 'u0', people: {} });
  st.searchMemoWrite(A, { v: 1, entries: [{ q: 'late', at: 3 }] }); st.feedMissWrite(A, { v: 1, rows: [] });
  st.appendRecords(A, 'c1', [{ vendorId: 'm9', at: 9, text: 'late' }]);
  st.appendSide(A, 'c1', [{ msg: 'm9', kind: 'reaction', at: 9, by: 'u1', emoji: 'x' }]);
  st.prependRecords(A, 'c1', [{ vendorId: 'm0', at: 0, text: 'older' }]);
  await st.attachmentPut(A, 'c1', 'f9', { msg: 'm9', data: Buffer.from('late'), mime: 'text/plain' });
  await new Promise((z) => setTimeout(z, 300));   // the writer's pace: anything owed would have landed
  shut(o);
  return { after: left(dir, A) };
}
{
  const r = await lateLeg(CS, 'late');
  ok(r.after.length === 0, `② a picture, a refusal, the people memo, both memos, a message, a side line, a prepend and an attachment after the purge: left ${r.after.join(' ') || 'nothing'}`, r);
  const RF = M.load('src/channel-store.js', anchored(SRC, "  function avatarRefuse(adapterId, author, { code, error = '', until }) {\n    if (goneAccounts.has(adapterId)) return null;   // B-92fc\n", "  function avatarRefuse(adapterId, author, { code, error = '', until }) {\n", 'the refusal blind to a purge'), 'refuse-blind');
  const red = await lateLeg(RF, 'late-red');
  ok(red.after.includes(A), `② RED CONTROL: a picture refusal blind to the purge — left: ${red.after.join(' ')} — the leg above would go red`, red);
}

// ═══ ③ A STALL IN A PICTURE FETCH's WINDOW ═══
console.log('③ a picture fetch held before it makes its folder, the purge inside it, then the release');
async function stallLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  await fill(o.st, o.w, dir, A);
  // the stall is placed BEFORE the fetch makes its folder: the purge removes everything, so only a late mkdir makes the folder again
  let release = null; const held = new Promise((z) => { release = z; }); let hit = false;
  const m0 = fs.promises.mkdir;
  fs.promises.mkdir = async function (f, ...x) { if (!hit && String(f).endsWith(`${path.sep}avatars`)) { hit = true; await held; } return m0.call(this, f, ...x); };
  let ans;
  try {
    const p = o.st.avatarPut(A, 'u5', { data: Buffer.from('slow'), mime: 'image/png' }).catch((e) => `threw ${(e && e.code) || e}`);
    for (let k = 0; k < 100 && !hit; k++) await new Promise((z) => setTimeout(z, 5));
    await o.st.purgeAccount(A);
    release();
    ans = await p;
  } finally { fs.promises.mkdir = m0; }
  shut(o);
  return { hit, ans: ans && ans.file ? 'written' : ans, after: left(dir, A) };
}
{
  const r = await stallLeg(CS, 'stall');
  ok(r.hit && r.ans !== 'written' && r.after.length === 0, `③ the fetch held before its folder while the account was purged: it answered ${JSON.stringify(r.ans)}; left ${r.after.join(' ') || 'nothing'}`, r);
  const SB = M.load('src/channel-store.js', anchored(SRC, "    const gone = async () => { if (!goneAccounts.has(adapterId)) return false; try { await fs.promises.rm(path.join(dir, safeSeg(adapterId)),", "    const gone = async () => { if (true) return false; try { await fs.promises.rm(path.join(dir, safeSeg(adapterId)),", 'the fetch blind to a purge after its waits'), 'stall-blind');
  const red = await stallLeg(SB, 'stall-red');
  ok(red.hit && red.after.includes(A), `③ RED CONTROL: a fetch blind to the purge after its waits — it ${red.ans}; left ${red.after.join(' ')} — the leg above would go red`, red);
}

// ═══ ④ THE PEOPLE MEMO OWED ═══
console.log('④ the people memo owed at the purge is never written');
async function owedLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  o.st.peopleWrite(A, { self: 'u0', people: { u1: { name: 'One' } } });   // owed to the writer (paced), not written yet
  await o.st.purgeAccount(A);
  await new Promise((z) => setTimeout(z, 300));
  shut(o);
  return { after: left(dir, A) };
}
{
  const r = await owedLeg(CS, 'owed');
  ok(r.after.length === 0, `④ the people memo owed at the purge: left ${r.after.join(' ') || 'nothing'}`, r);
  const PB = M.load('src/channel-store.js', anchored(SRC, "    peopleCache.delete(adapterId);\n    memoForget(searchMemoFile(adapterId)); memoForget(feedMissFile(adapterId));\n    try { W().forget(peopleFile(adapterId)); } catch { }\n", "    memoForget(searchMemoFile(adapterId)); memoForget(feedMissFile(adapterId));\n", 'the purge that forgets the people memo neither in memory nor owed'), 'people-owed');
  const red = await owedLeg(PB, 'owed-red');
  ok(red.after.includes(A), `④ RED CONTROL: the purge that forgets neither the people memo's cache nor its owed write — left: ${red.after.join(' ')} — the leg above would go red`, red);
}

// ═══ ⑤ NOTHING SYNCHRONOUS ═══
console.log('⑤ the purge makes no synchronous fs call on the main thread');
const SYNC = Object.keys(fs).filter((k) => /Sync$/.test(k) && typeof fs[k] === 'function');
async function syncLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  await fill(o.st, o.w, dir, A);
  const seen = [], orig = {};
  for (const k of SYNC) { orig[k] = fs[k]; fs[k] = function (...a) { seen.push(k); return orig[k].apply(this, a); }; }
  try { await o.st.purgeAccount(A); } finally { for (const k of SYNC) fs[k] = orig[k]; }
  shut(o);
  return { seen };
}
{
  const r = await syncLeg(CS, 'sync');
  ok(r.seen.length === 0, `⑤ the purge: ${r.seen.length} synchronous fs calls on the main thread${r.seen.length ? ' (' + r.seen.join(' ') + ')' : ''}`, r);
  const RS = M.load('src/channel-store.js', anchored(SRC, "    const there = async (q) => { try { await fs.promises.access(q); return true; } catch { return false; } };", "    const there = async (q) => fs.existsSync(q);", 'the release\'s synchronous look'), 'purge-sync');
  const red = await syncLeg(RS, 'sync-red');
  ok(red.seen.includes('existsSync'), `⑤ RED CONTROL: a purge that looks with existsSync (the release's) — ${red.seen.length} synchronous calls — the leg above would go red`, red);
}

// ═══ ⑥ A REMOVAL THAT FAILS (主开发 r2878, round w8ar0zqri's must) ═══
console.log('⑥ a folder that could not be removed: not said done, named, kept in the mark; the next start finishes it');
async function failLeg(mod, tag, which) {
  const dir = tmp(tag), o = open(mod, dir);
  await fill(o.st, o.w, dir, A);
  const target = { logs: path.join(dir, 'msgs', A), files: path.join(dir, 'attachments', A), own: path.join(dir, A) }[which];
  const r0 = fs.promises.rm; let failed = 0;
  fs.promises.rm = async function (q, ...x) { if (path.resolve(String(q)) === target) { failed++; const e = new Error('EBUSY: resource busy or locked'); e.code = 'EBUSY'; throw e; } return r0.call(this, q, ...x); };
  let r; try { r = await o.st.purgeAccount(A); } finally { fs.promises.rm = r0; }
  const markF = path.join(dir, 'purge-pending.json');
  await o.w.durable(markF);
  let mark = null; try { mark = JSON.parse(fs.readFileSync(markF, 'utf8')); } catch { }
  const afterFail = left(dir, A);
  shut(o);
  const o2 = open(mod, dir);   // THE NEXT START: an id with no adapter record is purged again, off the loop
  for (let k = 0; k < 100 && fs.existsSync(target); k++) await new Promise((z) => setTimeout(z, 30));
  await new Promise((z) => setTimeout(z, 100)); await o2.w.durable(markF);
  let mark2 = null; try { mark2 = JSON.parse(fs.readFileSync(markF, 'utf8')); } catch { }
  const afterStart = left(dir, A);
  shut(o2);
  return { failed, done: r.done, left: (r.left || []).map((x) => x.what), code: (r.left || [])[0] ? r.left[0].code : null, marked: !!(mark && mark.ids && mark.ids[A]), afterFail, afterStart, cleared: !!(mark2 && mark2.ids && !mark2.ids[A]) };
}
for (const which of ['logs', 'files', 'own']) {
  const r = await failLeg(CS, `fail-${which}`, which);
  ok(r.failed >= 1 && r.done === false && r.left.includes(which) && r.code === 'EBUSY' && r.marked && r.afterFail.length === 1 && r.afterStart.length === 0 && r.cleared, `⑥ the ${which} folder could not be removed (EBUSY placed): the purge NOT said done, ${which} named (${r.code}), kept in the mark (${r.marked}); the next start finished it (left after it: ${r.afterStart.join(' ') || 'nothing'}; the mark cleared: ${r.cleared})`, r);
}
{
  const SWL = M.load('src/channel-store.js', anchored(SRC, "      try { await fs.promises.rm(q, { recursive: true, force: true }); } catch (e) { return { state: 'left', code: (e && e.code) || 'error' }; }\n      return (await there(q)) ? { state: 'left', code: 'still-there' } : { state: 'removed' };", "      try { await fs.promises.rm(q, { recursive: true, force: true }); } catch { /* reported below */ }\n      return { state: 'removed' };", 'the purge that swallows a failed removal (the release\'s)'), 'swallow');
  const red = await failLeg(SWL, 'fail-red', 'own');
  ok(red.done === true && red.afterFail.length === 1, `⑥ RED CONTROL: the purge that swallows the failed removal says DONE with the folder still there (${red.afterFail.join(' ')}) — the leg above would go red`, red);
}

// ═══ ⑦ THE PERSON IS TOLD (主开发 r2878): what could not be removed, by kind, and that it is tried again ═══
console.log('⑦ the panel names what could not be removed and that it is tried again; the remove road answers it and marks first');
{
  const DLG = fs.readFileSync(path.join(REPO, 'src/lib/channel-account-dialogs.js'), 'utf8');
  const KEY = 'Removed "{name}" — {left} could not be removed from disk now; VibeSpace tries again when it starts';
  const keys = [KEY, 'its messages', 'its fetched files', 'its pictures and memos'];   // stale-pins: kept (the panel's words, read in the dialog and its tables)
  const tables = ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8'));
  const BR = '  if (r && Array.isArray(r.purgeLeft) && r.purgeLeft.length) {';
  const pin = (src) => src.split(BR).length === 2 && src.indexOf(BR) < src.indexOf("  showToast(tr('Removed \"{name}\"', { name }));") && src.includes(`tr('${KEY}'`) && tables.every((t) => keys.every((k) => t.includes(JSON.stringify(k) + ':')));
  ok(pin(DLG), '⑦ the dialog answers purgeLeft with its own warning (what is left, by kind, and that VibeSpace tries again when it starts) before the plain «Removed»; its words are in the zh and ja tables');
  ok(!pin(anchored(DLG, BR, '  if (false) {', 'the dialog without its leftover warning')), '⑦ RED CONTROL: the dialog without its purgeLeft branch — the pin above would go red');
  const AUTH = fs.readFileSync(path.join(REPO, 'src/server/channels-auth.js'), 'utf8');
  ok(/if \(purged && Array\.isArray\(purged\.left\) && purged\.left\.length\) return \{ ok: true, removed: true, id: rec\.id, purgeLeft:/.test(AUTH) && /await store\.purgeBegin\(rec\.id\)[\s\S]{0,600}await store\.adapters\.update\(\(a\) => \{ const i = a\.adapters\.indexOf\(rec\)/.test(AUTH), '⑦ the remove road answers purgeLeft to the person, and writes the purge\'s mark BEFORE the record leaves');
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
