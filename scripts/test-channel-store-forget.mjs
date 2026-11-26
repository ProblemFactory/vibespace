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
//   ⑥ A REMOVAL THAT FAILS (主开发 r2878; r2943 L1 + L5), placed for each folder in turn, and a LOOK that fails (EIO): the purge NOT
//      said done, the folder named with its code, kept in purge-pending.json; THE NEXT START REMOVES NOTHING (the mark only
//      remembers: listed); a PRESS finishes it. RED: the purge that swallows the failed removal; the look that swallows every code.
//   ⑦ THE PERSON IS TOLD: the removal names what is left and that the Channels panel lists it with «Try again» (or that it could
//      not be noted; a journal owed beside it in the same toast); the panel's line and its press; the add's note (zh, ja); the remove
//      road marks before the record leaves. RED: the dialog without its branch; the panel without its line.
//   r2943 (round wv0o00cct, THE NEW SHAPE — nothing deletes an account's data at a start or on a timer; it has
//   the ONE named exception (r4666 (2)): the poll times an entry notes owed («stamps») leave at a start, by its names only: test-channel-stamps-mark):
//   ⑧ L1 + L2: a start with adapters.json HELD (EIO placed) and the mark naming a LIVE account: nothing is removed, nothing runs by
//      itself; a press is refused by name. RED: the cure's start pass (a48ee5788), blind to the held records.
//   ⑨ L3: a RE-ADD under the marked id ends its mark (said once in the journal, the add's answer once), then a press: refused, the
//      live account's copy stands. RED: a re-add that leaves the mark; a press blind to the account's record.
//   ⑩ L4: the mark FAILING TO READ (EIO placed; torn bytes), then the purge of ANOTHER account: the first entry survives byte for
//      byte, nothing written over it, said once; read again later it is listed. RED: the cure's catch-all loader.
//   ⑪ L6: BAD IDS in the mark (a folder's own name, a path, a file's name): skipped, said once each, dropped; a press on one is
//      refused, another account's logs stand. RED: the id check without the folder's own names.
//   the follow (主开发 r3021, round w02dmd2um's smalls):
//   ⑫ (1) EVERY FOLDER OF THE STORE's OWN is made from ONE list (no folder literal under its root; the staged outbox files' name is
//      its module's) and is refused as an id: never listed, a press refused, the folder stands. RED: the cure's list (no outbox-files).
//   ⑬ (2) A REMOVAL IN FLIGHT (its mark written, its record not yet gone) and another records update: the mark stands, no re-add is
//      said, nothing joined. RED: the re-add's end blind to a removal in flight.
//   ⑭ (3) A RE-ADD WHOSE RECORD WRITE FAILS (placed): the mark is kept on disk and said; nothing joined. RED: the mark ended before the
//      record's write landed.
//   ⑮ (5) A SECOND PRESS while the first purge runs joins it (the same answer). (4) and (5)'s remove-road side are ⑦'s pins.
//   r3131 (round wm2wgs2kb's small commit): ⑯ (1) A RE-ADD DURING THE REMOVAL's PURGE (held open by a placed stall): after it settles
//      the live account is not counted gone (its new message is taken). RED: the follow's loop, blind to a record after it left. ⑭ (2)
//      the list road ends no mark while the record's write failed. ⑪ (3) an API log folder's name (mount_abc) is no account's id.
//   r3033 (bl-phone-ui's page, row 4): ⑦ pins the panel's plain names (a list by its name, the account by its service and label) + red;
//      ⑬ the mark keeps the name, never the login.
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
// the purge's three-way look (r2943 L5) — the anchor of two red controls
const LOOK = "    const look = async (q) => { try { await fs.promises.access(q); return 'present'; } catch (e) { const c = e && e.code; return c === 'ENOENT' || c === 'ENOTDIR' ? 'absent' : { code: c || 'error' }; } };";
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
  const KEEP = M.load('src/channel-store.js', anchored(anchored(SRC, '    for (const [k, q] of Object.entries(folders)) r[k] = await removeOne(q);', "    for (const [k, q] of Object.entries(folders)) r[k] = k === 'own' ? { state: 'absent' } : await removeOne(q);", 'the purge that leaves the own folder'), '    for (const [k, q] of Object.entries(folders)) {\n      const l = await look(q);', "    for (const [k, q] of Object.entries(folders)) {\n      const l = k === 'own' ? 'absent' : await look(q);", 'and its last look'), 'keep-own');
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
  const RS = M.load('src/channel-store.js', anchored(SRC, LOOK, "    const look = async (q) => (fs.existsSync(q) ? 'present' : 'absent');", 'the release\'s synchronous look'), 'purge-sync');
  const red = await syncLeg(RS, 'sync-red');
  ok(red.seen.includes('existsSync'), `⑤ RED CONTROL: a purge that looks with existsSync (the release's) — ${red.seen.length} synchronous calls — the leg above would go red`, red);
}

// ═══ ⑥ A REMOVAL THAT FAILS (主开发 r2878 + r2943: L1, L5) ═══
console.log('⑥ a folder whose removal or LOOK failed: not said done, named, kept in the mark; the next start removes nothing; a press finishes it');
const markF = (dir) => path.join(dir, 'purge-pending.json');
const readMark = (dir) => { try { return JSON.parse(fs.readFileSync(markF(dir), 'utf8')); } catch { return null; } };
const turns = (ms) => new Promise((z) => setTimeout(z, ms));
async function failLeg(mod, tag, which, how = 'rm') {
  const dir = tmp(tag), o = open(mod, dir);
  await fill(o.st, o.w, dir, A);
  const target = { logs: path.join(dir, 'msgs', A), files: path.join(dir, 'attachments', A), own: path.join(dir, A) }[which];
  const fn = how === 'rm' ? 'rm' : 'access', code = how === 'rm' ? 'EBUSY' : 'EIO';
  const r0 = fs.promises[fn]; let failed = 0;
  fs.promises[fn] = async function (q, ...x) { if (path.resolve(String(q)) === target) { failed++; const e = new Error(`${code}: placed`); e.code = code; throw e; } return r0.call(this, q, ...x); };
  let r; try { r = await o.st.purgeAccount(A); } finally { fs.promises[fn] = r0; }
  await o.w.durable(markF(dir));
  const mark = readMark(dir);
  const afterFail = left(dir, A);
  shut(o);
  // THE NEXT START (L1): nothing removes it by itself — the folder stands, the panel's list shows it
  const o2 = open(mod, dir);
  await turns(50);   // the cure's start pass ran at the open's next turn (⑧ holds its red)
  const afterStart = left(dir, A);
  const listed = o2.st.pendingList().find((x) => x.id === A) || null;
  const again = await o2.st.purgeAccount(A);   // A PRESS («Try again»): the purge once more
  await o2.w.durable(markF(dir));
  const mark2 = readMark(dir);
  shut(o2);
  return { failed, done: r.done, left: (r.left || []).map((x) => x.what), code: (r.left || [])[0] ? r.left[0].code : null, marked: !!(mark && mark.ids && mark.ids[A] && Array.isArray(mark.ids[A].left) && mark.ids[A].left.includes(which)), afterFail, afterStart, listed, pressDone: again.done === true, afterPress: left(dir, A), cleared: !!(mark2 && mark2.ids && !mark2.ids[A]) };
}
for (const [which, how] of [['logs', 'rm'], ['files', 'rm'], ['own', 'rm'], ['files', 'look']]) {
  const r = await failLeg(CS, `fail-${which}-${how}`, which, how);
  const code = how === 'rm' ? 'EBUSY' : 'EIO';
  ok(r.failed >= 1 && r.done === false && r.left.includes(which) && r.code === code && r.marked && r.afterFail.length === 1 && r.afterStart.length === 1 && !!r.listed && Array.isArray(r.listed.left) && r.listed.left.includes(which) && r.pressDone && r.afterPress.length === 0 && r.cleared, `⑥ the ${which} folder's ${how === 'rm' ? 'removal' : 'LOOK'} failed (${code} placed): the purge NOT said done, ${which} named (${r.code}), kept in the mark (${r.marked}); the next start removed NOTHING (left after it: ${r.afterStart.join(' ')}) and listed it (${!!r.listed}); a press finished it (left after it: ${r.afterPress.join(' ') || 'nothing'}; the mark ended: ${r.cleared})`, r);
}
{
  const SWL = M.load('src/channel-store.js', anchored(SRC, "      try { await fs.promises.rm(q, { recursive: true, force: true }); } catch (e) { return { state: 'left', code: (e && e.code) || 'error' }; }\n      const l1 = await look(q);\n      return l1 === 'absent' ? { state: 'removed' } : { state: 'left', code: l1 === 'present' ? 'still-there' : l1.code };", "      try { await fs.promises.rm(q, { recursive: true, force: true }); } catch { /* reported below */ }\n      return { state: 'removed' };", 'the purge that swallows a failed removal (the release\'s)'), 'swallow');
  const red = await failLeg(SWL, 'fail-red', 'own');
  ok(red.done === true && red.afterFail.length === 1, `⑥ RED CONTROL: the purge that swallows the failed removal says DONE with the folder still there (${red.afterFail.join(' ')}) — the leg above would go red`, red);
  const SWK = M.load('src/channel-store.js', anchored(SRC, LOOK, "    const look = async (q) => { try { await fs.promises.access(q); return 'present'; } catch { return 'absent'; } };", 'the look that swallows every code (the cure a48ee5788\'s)'), 'look-swallow');
  const rk = await failLeg(SWK, 'look-red', 'files', 'look');
  ok(rk.done === true && rk.afterFail.length === 1, `⑥ RED CONTROL: a look that swallows every code (a failing mount reads as «not there») says DONE with the folder still there (${rk.afterFail.join(' ')}) — the leg above would go red`, rk);
}

// ═══ ⑦ THE PERSON IS TOLD (主开发 r2878 + r2943): what is left, where it is listed, its press, the add's note ═══
console.log('⑦ the person is told: the removal names what is left and where it is listed; the panel lists it with Try again; the add says what it took in');
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const DLG = read('src/lib/channel-account-dialogs.js'), PANEL = read('src/lib/channels-panel.js'), ROUTES = read('src/routes/channels.js'), AUTH = read('src/server/channels-auth.js'), ENG = read('src/server/channels-engine.js');
  const K = {
    left: 'Removed "{name}" — {left} could not be removed from disk now; the Channels panel lists it with Try again',
    unnoted: 'Removed "{name}" — {left} could not be removed from disk now, and VibeSpace could not note it to list it again',
    owed: 'Some of its saved data is not erased from disk yet either; it is erased when the disk takes the next write',
    line: 'The removed account {name}: {left} could not be removed from disk — nothing removes it by itself',
    local: 'its local copy',
    done: 'The rest of the removed account {name} was removed from disk',
    still: '{left} of the removed account {name} could still not be removed — it stays listed',
    joined: '"{name}" was added under the id of a removed account whose local copy was not all removed — what was left ({left}) is now part of this account',
  };
  const keys = [...Object.values(K), 'its messages', 'its fetched files', 'its pictures and memos', 'Try again'];   // stale-pins: kept (the person's words, read in the dialog, the panel and the tables)
  const tables = ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].map(read);
  const BR = '  if (r && Array.isArray(r.purgeLeft) && r.purgeLeft.length) {';
  const dlgPin = (src) => src.split(BR).length === 2 && src.indexOf(BR) < src.indexOf("  showToast(tr('Removed \"{name}\"', { name }));") && [K.left, K.unnoted, K.owed, K.joined, K.local].every((k) => src.includes(`tr('${k}'`)) && src.split('joinedToast(').length === 4 && src.includes("(r.journalOwed ? ' ' + tr(");
  ok(dlgPin(DLG) && tables.every((t) => keys.every((k) => t.includes(JSON.stringify(k) + ':'))), '⑦ the dialog answers purgeLeft before the plain «Removed»: what is left by kind and that the Channels panel lists it with Try again (or that it could not be noted), a journal owed in the same toast; the add\'s note at Connect and Duplicate; every word in the zh and ja tables');
  ok(!dlgPin(anchored(DLG, BR, '  if (false) {', 'the dialog without its leftover warning')), '⑦ RED CONTROL: the dialog without its purgeLeft branch — the pin above would go red');
  const LOOP = '    for (const pl of (d && d.purgeLeft) || []) into.appendChild(purgeLeftLine(pl));';
  const panelPin = (src) => src.split(LOOP).length === 2 && src.includes("fetchJson(`/api/channels/purge-left/${encodeURIComponent(p.id)}/retry`, { method: 'POST' })") && [K.line, K.done, K.still].every((k) => src.includes(`t('${k}'`)) && src.includes("btn(t('Try again'),");
  ok(panelPin(PANEL), '⑦ the panel\'s first screen draws one line for each removed account whose local copy is not all removed — what is left, and «Try again» (the route), its answer said');
  ok(!panelPin(anchored(PANEL, LOOP, '', 'the panel without its leftover line')), '⑦ RED CONTROL: the panel without its leftover line — the pin above would go red');
  // r3033 (bl-phone-ui's page, row 4): a person's line names a list by its PLAIN name and an account by its name — never a file, never an id
  const namesPin = (src) => !/\bt\((['"])\{file\}/.test(src) && !src.includes("t('Channels paused: {file}") && !src.includes("t('The channels are paused — {file}") && !src.includes("t('The channels are paused: {file}") && [...src.matchAll(/\{ what: ([^,}]+)/g)].every((m) => /^heldName\(/.test(m[1])) && src.includes("'purge-pending': t('The list of what removed accounts left on disk')") && src.includes("adapters: t('The channel accounts list')") && !/'[a-z-]+\.json': t\(/.test(src) && /t\('The removed account \{name\}: \{left\}[^']*', \{ name: removedName\(p\)/.test(src);   // stale-pins: kept (absence checks: the held lines' file-naming form is gone)
  ok(namesPin(PANEL), '⑦ (r3033) the panel\'s held lines name each list by its plain name (the purge mark: «The list of what removed accounts left on disk»), never its file (the table is keyed by the store\'s own name, no file name in the panel); the leftover line names the account by its service and label, never its id');
  ok(!namesPin(anchored(PANEL, '{ what: heldName(pausedNow[0]) }', '{ what: pausedNow[0] }', 'a held line naming the file')), '⑦ RED CONTROL: a held line that names the file — the pin above would go red');
  ok(/router\.post\('\/api\/channels\/purge-left\/:id\/retry'[^\n]*\n[^\n]*engine\(\)\.purgeAgain\(req\.params\.id\)/.test(ROUTES) && ENG.includes('purgeLeft: store.pendingList ? store.pendingList() : [],') && /async function purgeAgain\(adapterId\) \{[\s\S]{0,900}store\.adapters\.landed\(\)[\s\S]{0,500}const r = await store\.purgeAccount\(id\);/.test(AUTH), '⑦ the press: the route asks the engine\'s purgeAgain (the accounts\' file on disk first, then the store\'s guarded purge); the digest carries the list');
  const WORDS = read('src/lib/channel-words.js');
  const CODES = { 'not-pending': 'Nothing of that removed account is listed to try again', 'records-held': 'The accounts could not be read now — nothing was removed; try again once they read', 'record-stands': "An account with this id exists again — the data is that account's; nothing was removed", 'records-unwritten': "The accounts' file has a change that is not on disk yet — nothing was removed; try again in a moment", 'bad-id': "That is no account's id — nothing was removed" };   // stale-pins: kept (the person's words for the press's five refusals)
  const wordsPin = (src) => Object.keys(CODES).every((c) => src.includes(`    case '${c}': return t(`)) && tables.every((t) => Object.values(CODES).every((k) => t.includes(JSON.stringify(k) + ':')));
  ok(wordsPin(WORDS), '⑦ (r3021 (4)) the press\'s five refusals (not-pending, records-held, record-stands, records-unwritten, bad-id) are worded by their code in the person\'s language — zh and ja');
  ok(!wordsPin(anchored(WORDS, "    case 'records-held': return t(", "    case 'records-held-gone': return t(", 'a refusal without its words')), '⑦ RED CONTROL: a refusal code without its words (the server\'s English sentence on a zh or ja page) — the pin above would go red');
  ok(/const running = !!\(store\.purgeRunning && store\.purgeRunning\(id\)\);\n\s*if \(!running && !\(store\.pendingList/.test(AUTH), '⑦ (r3021 (5)) the press asks whether a purge of the id runs BEFORE its «not listed» refusal — a second press joins the running purge');
  ok(/await store\.purgeBegin\(rec\.id, \{ service: \(registry\.vendor\(rec\.kind\) \|\| \{\}\)\.label \|\| rec\.kind, label: rec\.label \|\| '' \}\)[\s\S]{0,800}await store\.adapters\.update\(\(a\) => \{ const i = a\.adapters\.indexOf\(rec\)/.test(AUTH) && /purgeLeft: purged\.left\.slice\(\), [^\n]*markUnwritten/.test(AUTH) && AUTH.split('const joined = await joinedNote(').length === 4, '⑦ the remove road writes the mark BEFORE the record leaves and answers purgeLeft (with markUnwritten); the three adds (connect, its flow, duplicate) answer what they took in');
}

// ═══ ⑧ L1 + L2: A START WITH THE ACCOUNTS' RECORDS HELD and the mark naming a LIVE account ═══
console.log('⑧ a start with adapters.json held and the mark naming a live account: nothing removed, nothing runs by itself; a press refused');
const SLACK = 'slack';
const READ0 = fs.readFileSync;
const restoreRead = () => { fs.readFileSync = READ0; };
const heldOpen = (mod, dir, file, opts = {}) => {   // the start's read of `file` fails (EIO placed): its family is HELD
  fs.readFileSync = function (q, ...x) { if (path.resolve(String(q)) === file) { const e = new Error('EIO: placed'); e.code = 'EIO'; throw e; } return READ0.call(this, q, ...x); };
  try { const w = SW.create({ log: quiet }); return { w, st: mod.createChannelStore({ dir, log: opts.log || quiet, writer: w, ...(opts.heldRetry ? { heldRetry: opts.heldRetry } : {}) }) }; } finally { if (!opts.keep) restoreRead(); }
};
async function heldStartLeg(mod, tag, red = false) {
  const dir = tmp(tag);
  { const o = open(CS, dir); await fill(o.st, o.w, dir, SLACK); shut(o); }   // a LIVE account «slack»: its record and its local copy
  fs.writeFileSync(path.join(dir, 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: SLACK, kind: 'slack', label: 'Slack', enabled: true }] }));
  fs.writeFileSync(markF(dir), JSON.stringify({ v: 1, ids: { [SLACK]: { at: 1, left: ['files'] } } }));   // a removal's remainder, re-added since
  const before = left(dir, SLACK);
  const o = heldOpen(mod, dir, path.join(dir, 'adapters.json'));
  await turns(200);
  for (let k = 0; red && k < 100 && left(dir, SLACK).length; k++) await turns(30);   // the red's start pass: its removal lands
  const afterStart = left(dir, SLACK);
  const held = o.st.adapters.held();
  const listed = o.st.pendingList().some((x) => x.id === SLACK);   // r3021 (6): left off until the records read
  const press = await o.st.purgeAccount(SLACK);
  const afterPress = left(dir, SLACK);
  shut(o);
  const mark = readMark(dir);
  return { before, afterStart, held, listed, refused: press.refused || null, afterPress, marked: !!(mark && mark.ids && mark.ids[SLACK]) };
}
{
  const r = await heldStartLeg(CS, 'held');
  ok(r.before.length === 3 && r.held && r.afterStart.length === 3 && !r.listed && r.refused === 'records-held' && r.afterPress.length === 3 && r.marked, `⑧ adapters.json HELD at the start (EIO placed), the mark naming the live account: NOTHING removed by itself (left after the start: ${r.afterStart.join(' ')}); not listed while the records are held (r3021 (6): ${r.listed}); a press refused by name (${r.refused}), nothing touched (${r.afterPress.join(' ')}); the mark kept (${r.marked})`, r);
  const OLD = M.load('src/channel-store.js', anchored(anchored(SRC, "    if (!recordsRead()) { notRemoving(adapterId); return refusedPurge('records-held',", "    if (false) { notRemoving(adapterId); return refusedPurge('records-held',", 'the purge blind to the held records'), '  acctWarmStart();   // B-dfa4 cut 3', "  setTimeout(() => { for (const id of Object.keys(pending.ids)) if (!recordOf(id)) purgeAccount(id).catch(() => { }); }, 0);\n  acctWarmStart();   // B-dfa4 cut 3", 'the start pass (a48ee5788)'), 'start-pass');
  const UNHID = M.load('src/channel-store.js', anchored(SRC, "      if (!recordsRead()) continue;", '', 'the list blind to the held records'), 'list-held');
  const ru = await heldStartLeg(UNHID, 'held-list-red');
  ok(ru.listed, `⑧ RED CONTROL (r3021 (6)): a list blind to the held records shows the live account as «a removed account» — the leg above would go red`, ru);
  const red = await heldStartLeg(OLD, 'held-red', true);
  ok(red.afterStart.length === 0, `⑧ RED CONTROL: the cure's start pass (a48ee5788: an id with no record in the held records' empty stand-in purged at the start) — the live account's local copy removed (left: ${red.afterStart.join(' ') || 'nothing'}) — the leg above would go red`, red);
}

// ═══ ⑨ L3: A RE-ADD UNDER THE MARKED ID, then a press ═══
console.log('⑨ a re-add under the marked id ends its mark (said once, answered once); a press then is refused and the live copy stands');
async function readdLeg(mod, tag) {
  const dir = tmp(tag), warns = [];
  const logw = { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } };
  { const o = open(CS, dir); await fill(o.st, o.w, dir, SLACK); shut(o); }   // the removed account's remainder (its own folder could not be removed)
  fs.writeFileSync(markF(dir), JSON.stringify({ v: 1, ids: { [SLACK]: { at: 1, left: ['own'] } } }));
  const w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, log: logw, writer: w });
  await st.adapters.update((a) => { a.adapters.push({ id: SLACK, kind: 'slack', label: 'Slack', enabled: true }); });   // THE RE-ADD: the same id
  const j1 = await st.joinedOf(SLACK), j2 = await st.joinedOf(SLACK);   // the add's answer: it waits for the end (after the record's write landed)
  await w.durable(markF(dir));
  const mark = readMark(dir);
  const listed = st.pendingList().some((x) => x.id === SLACK);
  const press = await st.purgeAccount(SLACK);
  const afterPress = left(dir, SLACK);
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return { ended: !!(mark && mark.ids && !mark.ids[SLACK]), j1, j2, said: warns.filter((x) => /the purge noted under this id ends/.test(x)).length, listed, refused: press.refused || null, afterPress };
}
{
  const r = await readdLeg(CS, 'readd');
  ok(r.ended && r.j1 && JSON.stringify(r.j1.left) === '["own"]' && r.j2 === null && r.said === 1 && !r.listed && r.refused === 'record-stands' && r.afterPress.length === 3, `⑨ a re-add under the marked id: its mark ENDED on disk (${r.ended}), said once in the journal (${r.said}), the add's answer took it once (${JSON.stringify(r.j1)}, then ${r.j2}); not listed; a press refused by name (${r.refused}) — the live account's copy stands (${r.afterPress.join(' ')})`, r);
  const NOEND = M.load('src/channel-store.js', anchored(SRC, 'for (const id of back) readded(id);', 'for (const id of back) goneAccounts.delete(id);', 'a re-add that leaves the mark'), 'readd-keeps-mark');
  const rn = await readdLeg(NOEND, 'readd-red');
  ok(!rn.ended, `⑨ RED CONTROL: a re-add that leaves the mark — it still names the live account after the add — the leg above would go red`, rn);
  const BLIND = M.load('src/channel-store.js', anchored(SRC, "    if (recordOf(adapterId)) { notRemoving(adapterId); return refusedPurge('record-stands',", "    if (false) { notRemoving(adapterId); return refusedPurge('record-stands',", 'a press blind to the record'), 'press-blind');
  const rb = await readdLeg(BLIND, 'press-red');
  ok(rb.afterPress.length < 3, `⑨ RED CONTROL: a press blind to the account's record removes the re-added account's local copy (left: ${rb.afterPress.join(' ') || 'nothing'}) — the leg above would go red`, rb);
}

// ═══ ⑩ L4: THE MARK FAILING TO READ, then the purge of another account ═══
console.log('⑩ the mark failing to read (EIO; torn bytes), then another account\'s purge: the first entry survives, nothing written over it, said once');
async function markHeldLeg(mod, tag, how) {
  const dir = tmp(tag), warns = [];
  const logw = { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } };
  const bytes = how === 'torn' ? '{"v":1,"ids":{"slack-a":{"at":1,"left":["fil' : JSON.stringify({ v: 1, ids: { [A]: { at: 1, left: ['files'] } } });
  fs.writeFileSync(markF(dir), bytes);
  // the EIO stays placed through the other account's purge (`keep`); the case below lifts it
  const o = heldOpen(mod, dir, how === 'eio' ? markF(dir) : path.join(dir, 'no-such-file'), { log: logw, keep: true, heldRetry: { firstMs: 150, maxMs: 300 } });
  let r = null, began = null;
  try {
    await fill(o.st, o.w, dir, B);
    began = await o.st.purgeBegin(B);
    r = await o.st.purgeAccount(B);
    await o.w.durable(markF(dir));
  } catch (e) { restoreRead(); throw e; }
  return { o, dir, bytes, began, r, warns };
}
async function markHeldCase(mod, tag, how) {
  const x = await markHeldLeg(mod, tag, how);
  restoreRead();   // the mark reads again from here (the EIO case): its hold lifts by itself
  const after = fs.readFileSync(markF(x.dir), 'utf8');
  let lifted = false;
  for (let k = 0; how === 'eio' && k < 100 && !lifted; k++) { lifted = x.o.st.pendingList().some((e) => e.id === A); if (!lifted) await turns(30); }
  shut(x.o);
  return { same: after === x.bytes, aKept: after.includes(`"${A}"`), began: x.began, done: x.r.done, markUnwritten: x.r.markUnwritten || null, said: x.warns.filter((l) => /purge-pending\.json could not be read/.test(l)).length, otherGone: left(x.dir, B).length === 0, lifted };
}
for (const how of ['eio', 'torn']) {
  const r = await markHeldCase(CS, `mark-${how}`, how);
  ok(r.same && r.began === false && r.done === true && r.markUnwritten === 'held' && r.said === 1 && r.otherGone && (how !== 'eio' || r.lifted), `⑩ the mark ${how === 'eio' ? 'failing to read (EIO placed)' : 'in torn bytes'}: HELD — the purge of another account ran (${r.otherGone}) and wrote nothing over it (the file byte for byte: ${r.same}; its mark not written: ${r.markUnwritten}), said once (${r.said})${how === 'eio' ? `; read again later, its entry is listed (${r.lifted})` : ''}`, r);
}
{
  const OLDL = M.load('src/channel-store.js', anchored(SRC, "  const pdLoad = loadJsonFamily(pendingFile, (v) => v && typeof v === 'object' && v.ids && typeof v.ids === 'object' && !Array.isArray(v.ids), () => ({ v: 1, ids: {} }), (v) => { pending = v; });\n  let pending = pdLoad.value;", "  const pdLoad = { blocked: null };\n  let pending = (() => { let v = null; try { v = JSON.parse(fs.readFileSync(pendingFile, 'utf8')); } catch { v = null; } return { v: 1, ids: v && v.ids && typeof v.ids === 'object' && !Array.isArray(v.ids) ? v.ids : {} }; })();", 'the cure\'s catch-all loader (a48ee5788)'), 'mark-catch-all');
  const red = await markHeldCase(OLDL, 'mark-red', 'eio');
  ok(!red.aKept, `⑩ RED CONTROL: the cure's catch-all loader (a failed read = nothing pending) — the other account's purge wrote over the mark and the first entry is GONE — the leg above would go red`, red);
}

// ═══ ⑪ L6: BAD IDS IN THE MARK ═══
console.log('⑪ bad ids in the mark: skipped, said once each, dropped; a press on one refused; another account\'s logs stand');
async function badIdLeg(mod, tag) {
  const dir = tmp(tag), warns = [];
  const logw = { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } };
  { const o = open(CS, dir); await fill(o.st, o.w, dir, B); await fill(o.st, o.w, dir, A); shut(o); }   // B: another account's logs under msgs/; A: a removed account's remainder
  fs.mkdirSync(path.join(dir, 'mount_abc'), { recursive: true }); fs.writeFileSync(path.join(dir, 'mount_abc', 'api.ndjson'), '{}\n');   // r3131 (3): a storage mount's API log (src/server/channel-api.js credDir)
  fs.writeFileSync(markF(dir), JSON.stringify({ v: 1, ids: { msgs: { at: 1, left: ['logs'] }, '../x': { at: 1, left: null }, 'index.json': { at: 1, left: null }, mount_abc: { at: 1, left: ['own'] }, [A]: { at: 1, left: ['files'] } } }));
  const w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, log: logw, writer: w });
  const ids = st.pendingList().map((x) => x.id);
  st.pendingList();   // a second read says nothing again
  await w.durable(markF(dir));
  const mark = readMark(dir);
  const bad = await st.purgeAccount('msgs');
  const api = await st.purgeAccount('mount_abc');
  const good = await st.purgeAccount(A);
  const r = { ids, said: warns.filter((l) => /which is no account's id/.test(l)).length, kept: mark ? Object.keys(mark.ids) : null, badRefused: bad.refused || null, apiRefused: api.refused || null, apiLog: fs.existsSync(path.join(dir, 'mount_abc', 'api.ndjson')), goodDone: good.done, otherLogs: fs.existsSync(path.join(dir, 'msgs', B)), aLeft: left(dir, A) };
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return r;
}
{
  const r = await badIdLeg(CS, 'bad');
  ok(JSON.stringify(r.ids) === JSON.stringify([A]) && r.said === 4 && JSON.stringify(r.kept) === JSON.stringify([A]) && r.badRefused === 'bad-id' && r.apiRefused === 'bad-id' && r.apiLog && r.goodDone && r.otherLogs && r.aLeft.length === 0, `⑪ four bad ids in the mark (a folder's own name «msgs», a path, a file's name, a storage mount's API log folder «mount_abc»): skipped — listed ${JSON.stringify(r.ids)} —, said once each (${r.said}), dropped (the mark keeps ${JSON.stringify(r.kept)}); a press on «msgs» and on «mount_abc» refused (${r.badRefused}, ${r.apiRefused}), the API log stands (${r.apiLog}); the good one finished (${r.goodDone}); another account's logs stand (${r.otherLogs})`, r);
  const IDOK = "const accountIdOk = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9@:+-]{0,79}$/.test(id) && !OWN_NAMES.has(id);";
  const OPEN = M.load('src/channel-store.js', anchored(SRC, IDOK, "const accountIdOk = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9@:+-]{0,79}$/.test(id);", 'the id check without the folder\'s own names'), 'bad-id-open');
  const red = await badIdLeg(OPEN, 'bad-red');
  ok(!red.otherLogs, `⑪ RED CONTROL: the id check without the folder's own names — a press on «msgs» removes every account's message logs (another account's logs stand: ${red.otherLogs}) — the leg above would go red`, red);
  const UNDER = M.load('src/channel-store.js', anchored(SRC, IDOK, "const accountIdOk = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_@:+-]{0,79}$/.test(id) && !OWN_NAMES.has(id);", 'the id check that lets an API log folder\'s name through (the follow\'s)'), 'bad-id-under');   // stale-pins: kept (the red control restores the follow's line)
  const ru = await badIdLeg(UNDER, 'bad-red-api');
  ok(!ru.apiLog, `⑪ RED CONTROL (r3131 (3)): the follow's id check, «_» allowed — a press on «mount_abc» removes a storage mount's API log (it stands: ${ru.apiLog}) — the leg above would go red`, ru);
}

// ═══ ⑫ r3021 (1): EVERY FOLDER OF THE STORE's OWN, made from ONE list and refused as an id ═══
console.log('⑫ every folder of the store\'s own is made from one list and refused as an id: never listed, a press refused, the folder stands');
{
  const OWN = CS.OWN_FOLDERS || {};
  const OF = require(path.join(REPO, 'src/channel-outbox-files.js'));
  const literals = [...SRC.matchAll(/path\.join\(dir, '([^'.]+)'/g)].map((m) => m[1]);   // a folder named under the root by a literal
  ok(Object.values(OWN).length >= 4 && OWN.outboxFiles === OF.DIR && !literals.length && /const OWN_NAMES = new Set\(Object\.values\(OWN_FOLDERS\)\);/.test(SRC), `⑫ ONE list of the store's own folders (${Object.values(OWN).join(', ')}), the staged outbox files' name its module's own (${OF.DIR}); no folder under the root named by a literal (${literals.join(' ') || 'none'}); the id check reads that list`);
  async function ownLeg(mod, tag) {
    const dir = tmp(tag), warns = [];
    const logw = { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } };
    { const o = open(CS, dir); await fill(o.st, o.w, dir, B); shut(o); }   // another account's copy: msgs/, attachments/, its own folder
    fs.mkdirSync(path.join(dir, OF.DIR, 'p-1'), { recursive: true }); fs.writeFileSync(path.join(dir, OF.DIR, 'p-1', '0'), 'a staged file');   // a staged outbox file
    const ids = {}; for (const n of Object.values(OWN)) ids[n] = { at: 1, left: ['own'] };
    fs.writeFileSync(markF(dir), JSON.stringify({ v: 1, ids }));
    const folders = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).filter((n) => n !== B);
    const w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, log: logw, writer: w });
    const listed = st.pendingList().map((x) => x.id);
    const refused = [];
    for (const n of Object.values(OWN)) { const r = await st.purgeAccount(n); refused.push(r.refused || null); }
    const standing = { staged: fs.existsSync(path.join(dir, OF.DIR, 'p-1', '0')), logs: fs.existsSync(path.join(dir, 'msgs', B)), files: fs.existsSync(path.join(dir, 'attachments', B)) };
    try { st.close(); } catch { } try { w.stop(); } catch { }
    return { folders, listed, refused, standing };
  }
  const r = await ownLeg(CS, 'own');
  ok(r.folders.every((n) => Object.values(OWN).includes(n)) && r.listed.length === 0 && r.refused.every((x) => x === 'bad-id') && r.standing.staged && r.standing.logs && r.standing.files, `⑫ every folder the store made under its root (${r.folders.join(' ')}) is one of the list; a mark naming each of them lists none (${JSON.stringify(r.listed)}); each press refused (${r.refused.join(' ')}); the staged outbox file and another account's copy stand`, r);
  const NOOUT = M.load('src/channel-store.js', anchored(SRC, 'const OWN_NAMES = new Set(Object.values(OWN_FOLDERS));', 'const OWN_NAMES = new Set([OWN_FOLDERS.msgs, OWN_FOLDERS.archive, OWN_FOLDERS.attachments]);', 'the cure\'s list (no staged outbox folder)'), 'own-no-outbox');
  const rn = await ownLeg(NOOUT, 'own-red');
  ok(rn.listed.includes(OF.DIR) && !rn.standing.staged, `⑫ RED CONTROL: the cure's list without the staged outbox folder — it is listed as a removed account and a press removes every account's staged files (staged file stands: ${rn.standing.staged}) — the leg above would go red`, rn);
}

// ═══ ⑬ r3021 (2): A REMOVAL IN FLIGHT and another records update ═══
console.log('⑬ a removal in flight (its mark written, its record not yet gone) and another records update: the mark stands, no re-add said');
async function inFlightLeg(mod, tag) {
  const dir = tmp(tag), warns = [];
  const logw = { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } };
  fs.writeFileSync(path.join(dir, 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: SLACK, kind: 'slack', label: 'Slack', enabled: true }, { id: 'gmail', kind: 'gmail', label: 'Mail', enabled: true }] }));
  const w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, log: logw, writer: w });
  const began = await st.purgeBegin(SLACK, { service: 'Slack', label: 'Work', user: 'ada@example.com' });   // the remove road: the mark first (with the account's name), the record leaves after it
  await st.adapters.update((a) => { const g = a.adapters.find((x) => x.id === 'gmail'); g.lastPass = { at: 1 }; }, { paced: true });   // another account's stamp, in that window
  await st.adapters.landed(); await turns(50);
  await w.durable(markF(dir));
  const mark = readMark(dir);
  const j = await st.joinedOf(SLACK);
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return { began, kept: !!(mark && mark.ids && mark.ids[SLACK]), name: mark && mark.ids && mark.ids[SLACK] ? mark.ids[SLACK].name : null, said: warns.filter((l) => /added again under its id/.test(l)).length, joined: j };
}
{
  const r = await inFlightLeg(CS, 'inflight');
  ok(r.began && r.kept && r.said === 0 && r.joined === null, `⑬ a removal in flight and another records update: the removal's fresh mark stands on disk (${r.kept}), no re-add said (${r.said}), nothing joined (${JSON.stringify(r.joined)})`, r);
  ok(JSON.stringify(r.name) === JSON.stringify({ service: 'Slack', label: 'Work' }), `⑬ (r3033) the mark keeps the removed account's name as a person knows it — its service and label (${JSON.stringify(r.name)}), never its login`, r.name);
  const BLIND = M.load('src/channel-store.js', anchored(anchored(SRC, "if (a && !(removing.has(a.id) && removingRec.get(a.id) === a) && (goneAccounts.has(a.id) || (pending && pending.ids[a.id]))) back.push(a.id);", "if (a && (goneAccounts.has(a.id) || (pending && pending.ids[a.id]))) back.push(a.id);", 'the re-add blind to a removal in flight'), '      if (removing.has(id)) return;\n', '', 'and its end'), 'readd-blind');
  const rb = await inFlightLeg(BLIND, 'inflight-red');
  ok(!rb.kept && rb.said >= 1, `⑬ RED CONTROL: the re-add's end blind to a removal in flight — any records update ends the removal's fresh mark and says a re-add that did not happen — the leg above would go red`, rb);
}

// ═══ ⑭ r3021 (3): A RE-ADD WHOSE RECORD WRITE FAILS ═══
console.log('⑭ a re-add whose record write fails (placed): the mark is kept on disk and said; nothing joined');
async function failAddLeg(mod, tag) {
  const dir = tmp(tag), warns = [];
  const logw = { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } };
  fs.writeFileSync(markF(dir), JSON.stringify({ v: 1, ids: { [SLACK]: { at: 1, left: ['own'] } } }));
  const ADF = path.join(dir, 'adapters.json');
  let failing = false;
  const w0 = SW.create({ log: quiet });
  // the placed failure: the store writer answers adapters.json's write FAILED (EIO) — every other file as it is
  const w = new Proxy(w0, { get(t, k) {
    if (k === 'durable') return (f, o) => (failing && f === ADF ? Promise.resolve(false) : t.durable(f, o));
    if (k === 'whyNotDurable') return (f) => (failing && f === ADF ? { why: 'failed', code: 'EIO' } : t.whyNotDurable(f));
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  const st = mod.createChannelStore({ dir, log: logw, writer: w });
  failing = true;
  let threw = null;
  try { await st.adapters.update((a) => { a.adapters.push({ id: SLACK, kind: 'slack', label: 'Slack', enabled: true }); }); } catch (e) { threw = (e && e.code) || 'error'; }
  const j = await st.joinedOf(SLACK);
  const listed = st.pendingList().some((x) => x.id === SLACK);   // r3131 (2): the panel's list, built at every broadcast — the record is in memory only
  await turns(30);
  failing = false;
  await w0.durable(markF(dir));
  const mark = readMark(dir);
  try { st.close(); } catch { } try { w0.stop(); } catch { }
  return { threw, kept: !!(mark && mark.ids && mark.ids[SLACK]), listed, said: warns.filter((l) => /its record's write failed/.test(l)).length, joined: j };
}
{
  const r = await failAddLeg(CS, 'failadd');
  ok(r.threw === 'EIO' && r.kept && r.said === 1 && r.joined === null && !r.listed, `⑭ a re-add whose record write fails (EIO placed: the add answered ${r.threw}): the mark is KEPT on disk (${r.kept}) — the list built after it too (r3131 (2): not listed, not ended: ${!r.listed}) —, said once (${r.said}), nothing joined (${JSON.stringify(r.joined)})`, r);
  const LISTEND = M.load('src/channel-store.js', anchored(SRC, "      if (recordOf(id)) { if (!ending.has(id) && adaptersOnDisk()) endMark(id, 'an account with this id has a record'); continue; }", "      if (recordOf(id)) { endMark(id, 'an account with this id has a record'); continue; }", 'the list road ending a mark on a record in memory only (the follow\'s)'), 'list-ends-early');   // stale-pins: kept (the red control restores the follow's line)
  const rl = await failAddLeg(LISTEND, 'failadd-list-red');
  ok(!rl.kept, `⑭ RED CONTROL (r3131 (2)): the follow's list road — the panel's list ends the mark while the re-added record is in memory only (its write failed) — the leg above would go red`, rl);
  const EARLY = M.load('src/channel-store.js', anchored(SRC, "      try { await landed(adaptersFile); } catch (e) { if (pending.ids[id]) warn(`[channels] ${id}: an account was added again under its id, but its record's write failed (${(e && e.code) || (e && e.message) || e}) — the purge noted under the id is kept`); return; }\n", '', 'the mark ended before the record\'s write landed'), 'end-early');
  const re = await failAddLeg(EARLY, 'failadd-red');
  ok(!re.kept, `⑭ RED CONTROL: the mark ended before the record's write landed — a failed record write leaves neither record nor mark — the leg above would go red`, re);
}

// ═══ ⑮ r3021 (5): A SECOND PRESS while the first purge runs ═══
console.log('⑮ a second press while the first purge runs joins it');
{
  const dir = tmp('second'), o = open(CS, dir);
  await fill(o.st, o.w, dir, A);
  const p1 = o.st.purgeAccount(A);
  const running = o.st.purgeRunning(A);
  const p2 = o.st.purgeAccount(A);
  const [r1, r2] = await Promise.all([p1, p2]);
  const after = o.st.purgeRunning(A);
  shut(o);
  ok(running && r1 === r2 && r1.done === true && !after && left(dir, A).length === 0, `⑮ a second press while the first purge runs (running: ${running}) JOINS it — the same answer (${r1 === r2}), one purge, done; not running after it (${after})`, { running, same: r1 === r2, after });
}

// ═══ ⑯ r3131 (1): A RE-ADD DURING THE REMOVAL's PURGE ═══
console.log('⑯ a re-add during the removal\'s purge (held open by a placed stall): after it settles the live account is not counted gone');
async function readdDuringLeg(mod, tag) {
  const dir = tmp(tag);
  fs.writeFileSync(path.join(dir, 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: SLACK, kind: 'slack', label: 'Slack', enabled: true }] }));
  const w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, log: quiet, writer: w });
  await fill(st, w, dir, SLACK);
  await st.purgeBegin(SLACK, { service: 'Slack', label: 'Slack' });   // the remove road: the mark, then the record leaves, then the purge
  await st.adapters.update((a) => { const i = a.adapters.findIndex((x) => x.id === SLACK); if (i >= 0) a.adapters.splice(i, 1); });
  const target = path.join(dir, SLACK), r0 = fs.promises.rm;
  let hit = false, release = null;
  const gate = new Promise((z) => { release = z; });
  fs.promises.rm = async function (q, ...x) { if (path.resolve(String(q)) === target && !hit) { hit = true; await gate; } return r0.call(this, q, ...x); };   // THE PURGE HELD OPEN at its own folder (placed)
  try {
    const p = st.purgeAccount(SLACK);
    for (let k = 0; k < 300 && !hit; k++) await turns(10);
    await st.adapters.update((a) => { a.adapters.push({ id: SLACK, kind: 'slack', label: 'Slack', enabled: true }); });   // THE RE-ADD, during the purge
    release();
    await p;
  } finally { fs.promises.rm = r0; release(); }
  await st.joinedOf(SLACK);   // the re-add's end: after the purge settled and the record's write landed
  const late = st.appendRecords(SLACK, 'c2', [{ vendorId: 'm9', at: 9, text: 'a new message' }]);
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return { hit, gone: late.gone === true, appended: late.appended };
}
{
  const r = await readdDuringLeg(CS, 'readd-during');
  ok(r.hit && !r.gone && r.appended === 1, `⑯ a re-add during the removal's purge (held open by a placed stall: ${r.hit}): after the purge settled the live account is NOT counted gone — its new message is taken (${r.appended})`, r);
  const ANYREM = M.load('src/channel-store.js', anchored(SRC, 'if (a && !(removing.has(a.id) && removingRec.get(a.id) === a) && (', 'if (a && !removing.has(a.id) && (', 'the follow\'s loop, blind to a record after it left'), 'readd-during-blind');   // stale-pins: kept (the red control restores the follow's line)
  const rr = await readdDuringLeg(ANYREM, 'readd-during-red');
  ok(rr.gone, `⑯ RED CONTROL: the follow's loop (it skips the id for the whole of its removal's purge) — the re-added account is still counted gone after the purge: its new message refused (gone: ${rr.gone}) — the leg above would go red`, rr);
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
