#!/usr/bin/env node
// test-data-folder-notice — B-8797 (lane hub-loop-stalls, 主开发 r5195): VIBESPACE'S OWN DATA FOLDER ON A NETWORK OR USER-SPACE
// DRIVE IS SAID, ONCE (src/server/data-folder-notice.js). In-process over placed mount tables (never a real mount), a stub landing
// walk that records every path it touches, and a REAL For-you store (src/user-todos.js) on a scratch folder:
//   ① THE VERDICT (PURE): a local disk ⇒ local; fuse.rclone / sshfs ⇒ user space; nfs4 ⇒ network; a bindfs VIEW ⇒ what it shows
//      (over nfs4: network, the view named); a symlinked folder lands where it points — and the walk never touches a component on
//      the network or FUSE mount; no table, a symlink loop ⇒ unknown. The verdict asks THE ONE VERDICT (src/local-index.js
//      netMountOf — the sync-fs witness's question for the same folder)
//   ② THE WORDS name the folder, the install's folder, the kind and the type — NEVER the mount's source (an account) nor options
//   ③ THE NOTICE: one item (origin server, notice, Storage); a second start, a dismissed item, a cleared item ⇒ nothing filed
//      again (the store's filedEver); RED (in a copy): the said-once question cut ⇒ the dismissed item is reopened
//   ④ BACK ON A LOCAL DISK ⇒ the open item is resolved (done); RED: the settle cut ⇒ it stays open
//   ⑤ FOR YOU HELD UNREAD ⇒ nothing asked, nothing filed until its read, then once; RED: the held wait cut ⇒ asked while held
//   ⑥ THE LOOK NEVER HOLDS THE START: arm() returns at once on an unref'd timer; a table that never answers ends at the bound,
//      unknown, nothing filed; RED: the bound cut ⇒ the look never ends
//   ⑦ THE SETTINGS FACT: GET /api/data-folder answers the verdict (never a source) and files nothing; the row is words (no press)
//   ⑧ THE WORDS' TABLES and THE WIRING (text pins): zh + ja rows; server.js creates the module and arms its look in the listen
// Run: node scripts/test-data-folder-notice.mjs
import './scratch.mjs';   // FIRST (B-ba47): a temp home of its own before any product code
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { anchored, scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const J = (x) => JSON.stringify(x);
const REL = 'src/server/data-folder-notice.js', SRC = read(REL);
const DFN = require(path.join(REPO, REL));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const M = mutantCopies('data-folder-notice', REPO);
const roots = [];
process.on('exit', () => { for (const d of roots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });

/** a PLACED mount table: rows [mountpoint, fstype, source] in mount order (the kernel's /proc/self/mountinfo shape) */
const table = (rows) => rows.map(([mp, fstype, source = 'none'], i) => `${20 + i} 1 0:${30 + i} / ${mp} rw,relatime - ${fstype} ${source} rw`).join('\n') + '\n';
const ACCT = 'gdrive-owner-account-7f3a';   // a mount SOURCE that names an account: it must never reach the words
const LOCAL = table([['/', 'ext4', '/dev/sda1']]);
const RCLONE = table([['/', 'ext4', '/dev/sda1'], ['/mnt/r', 'fuse.rclone', `${ACCT}:`]]);
const SSHFS = table([['/', 'ext4', '/dev/sda1'], ['/mnt/s', 'fuse.sshfs', `${ACCT}@host.example:/srv`]]);
const NFS = table([['/', 'ext4', '/dev/sda1'], ['/srv/nfs', 'nfs4', `filer.example:/export/${ACCT}`]]);
const VIEW = table([['/', 'ext4', '/dev/sda1'], ['/nfs', 'nfs4', `filer.example:/${ACCT}`], ['/home/u/ws', 'fuse.bindfs', '/nfs/ws']]);
const VIEW_EXT4 = table([['/', 'ext4', '/dev/sda1'], ['/data', 'ext4', '/dev/sdb1'], ['/home/u/ws', 'fuse.bindfs', '/data/ws']]);   // r5244: a view over a LOCAL disk
const RESERVED = table([['/', 'ext4', '/dev/sda1'], ['/mnt/r', 'fuse.sshfs', `${ACCT}@host.example:/srv`]]);   // the folder's mount now served by another program
/** a landing walk's stub: `links` (a symlink → its target); every path it is ASKED about is recorded */
const walker = (links = {}) => { const asked = []; return { asked, lstat: (p) => { asked.push(p); return { symlink: Object.prototype.hasOwnProperty.call(links, p) }; }, readlink: (p) => links[p] }; };
const v = (dataDir, mountinfo, links = {}, rootDir = null) => { const w = walker(links); return { ...DFN.verdictOf({ dataDir, rootDir, mountinfo, lstat: w.lstat, readlink: w.readlink }), asked: w.asked }; };
const noSource = (x) => !J(x).includes(ACCT);

console.log('① the verdict (PURE): local / user space / network / a view by what it shows / a symlink landed — never touching a remote component');
{
  const loc = v('/opt/vs/data', LOCAL), rc = v('/mnt/r/vs/data', RCLONE, {}, '/mnt/r/vs'), ss = v('/mnt/s/vs/data', SSHFS), nf = v('/srv/nfs/vs/data', NFS), vw = v('/home/u/ws/vs/data', VIEW);
  const ln = v('/opt/vs/data', RCLONE, { '/opt/vs/data': '/mnt/r/vsdata' });
  const loop = v('/opt/a/data', LOCAL, { '/opt/a': '/opt/b', '/opt/b': '/opt/a' }), none = v('/opt/vs/data', '');
  ok(loc.state === 'local' && loc.folder === '/opt/vs/data' && loc.install === '/opt/vs', 'a folder on the local disk is local (its install folder = its parent when none is handed)', loc);
  ok(rc.state === 'remote' && rc.kind === 'user-space' && rc.type === 'fuse.rclone' && rc.mount === '/mnt/r' && rc.install === '/mnt/r/vs' && rc.view === null && !rc.asked.some((p) => p.startsWith('/mnt/r')), 'fuse.rclone ⇒ a user-space drive, its mount and type named — the walk stopped at the mount, never touching it', rc);
  ok(ss.state === 'remote' && ss.kind === 'user-space' && ss.type === 'fuse.sshfs' && nf.state === 'remote' && nf.kind === 'network' && nf.type === 'nfs4' && !nf.asked.some((p) => p.startsWith('/srv/nfs')), 'fuse.sshfs ⇒ user space; nfs4 ⇒ a network drive (the walk never touches it)', { ss, nf });
  ok(vw.state === 'remote' && vw.kind === 'network' && vw.type === 'nfs4' && vw.view === 'fuse.bindfs' && vw.mount === '/home/u/ws', 'a bindfs VIEW is told by what it shows: over nfs4 ⇒ a network drive, the view named', vw);
  ok(ln.state === 'remote' && ln.type === 'fuse.rclone' && ln.folder === '/opt/vs/data' && ln.asked.includes('/opt/vs/data') && !ln.asked.some((p) => p.startsWith('/mnt/r')), 'a SYMLINKED folder lands where it points (an rclone mount) — named by its own path; the walk never touches the mount', ln);
  ok(loop.state === 'unknown' && none.state === 'unknown' && loop.why === 'a symlink loop' && none.why === 'no mount table', 'a symlink loop, or no mount table ⇒ unknown (nothing is said), each by its own why', { loop, none });
  const ve = v('/home/u/ws/vs/data', VIEW_EXT4), vew = DFN.wordsOf(ve);
  ok(ve.state === 'remote' && ve.kind === 'user-space' && ve.type === 'fuse.bindfs' && ve.view === 'fuse.bindfs' && ve.shows === 'ext4' && vew.text.includes('(fuse.bindfs)') && !vew.text.includes('(ext4)')
    && vew.i18n.detail.some((l) => l.key === DFN.VIEW_LOCAL && l.params.shows === 'ext4' && l.params.view === 'fuse.bindfs'),
    'r5244: a bindfs view over a LOCAL disk — the user-space drive IS the view: its type stays fuse.bindfs (never «ext4» as the drive a program serves), what it shows said in its own line', { ve, text: vew.text });
  const VX = M.load(REL, anchored(SRC, "    if (shows && NETWORK_FSTYPE.test(shows)) type = shows;\n", "    if (shows) type = shows;   /* MUTANT: the shown type for any view */\n", 'b8797-shown-type'), 'b8797-shown-type');
  const vx = VX.wordsOf(VX.verdictOf({ dataDir: '/home/u/ws/vs/data', mountinfo: VIEW_EXT4, lstat: walker().lstat, readlink: walker().readlink }));
  ok(vx.text.includes('(ext4)'), 'CONTROL (the shown type for any view, in a copy — the line as taken): «a drive served by a program in user space (ext4)» — red', vx.text);
  ok(SRC.split('LI.netMountOf(').length === 2 && SRC.split('LI.landedPathOf(').length === 2 && /require\('\.\.\/local-index\.js'\)\.netMountOf\(path\.resolve\(dataDir\), mi\)/.test(read('src/server/sync-fs-witness.js')),
    'THE ONE VERDICT: the look names the mount by src/local-index.js netMountOf — the sync-fs witness\'s own question for the same folder (its refresh)');
}

console.log('② the words: the folder, the install\'s folder, the kind and the type — never the mount\'s source');
{
  const rc = v('/mnt/r/vs/data', RCLONE, {}, '/mnt/r/vs'), vw = v('/home/u/ws/vs/data', VIEW, {}, '/home/u/ws/vs');
  const a = DFN.wordsOf(rc), b = DFN.wordsOf(vw);
  ok(a.text.includes('/mnt/r/vs/data') && a.text.includes('fuse.rclone') && a.i18n.text.key === DFN.TEXT_USER_SPACE && a.detail.includes('/mnt/r/vs') && Array.isArray(a.i18n.detail) && a.i18n.detail.length === 2
    && b.i18n.text.key === DFN.TEXT_NETWORK && b.text.includes('nfs4') && b.i18n.detail.length === 3 && b.detail.includes('fuse.bindfs'),
    'the words name the folder and its type (user space or network: each its whole sentence), the install\'s folder, a view when there is one; the detail is a list of lines', { a, b });
  ok(noSource(rc) && noSource(vw) && noSource(a) && noSource(b) && noSource(v('/srv/nfs/vs/data', NFS)) && noSource(DFN.wordsOf(v('/mnt/s/vs/data', SSHFS))), 'NEVER the mount\'s source (an rclone remote, an sshfs user at host, an NFS export): not in the verdict, not in the words');
  ok(!noSource({ planted: `${ACCT}:` }), 'CONTROL (a planted source string): the check reads it — red');
}

// a REAL For-you store on a scratch folder; the module over a placed table
const scratch = scratchDir('data-folder-notice'); roots.push(scratch);
let nS = 0;
const storeOf = () => { const d = path.join(scratch, String(++nS)); fs.mkdirSync(d, { recursive: true }); return new UserTodoManager({ dataDir: d, expirySweepMs: 0 }); };
const noticeOf = (mod, { store, mountinfo, dataDir = '/mnt/r/vs/data', rootDir = '/mnt/r/vs', links = {}, readMountinfo = null, boundMs = 2000, lookMs = 30000, app = null, logs = [] }) => {
  const w = walker(links);
  return mod.create({ dataDir, rootDir, getUserTodos: () => store, readMountinfo: readMountinfo || (async () => mountinfo), lstat: w.lstat, readlink: w.readlink, log: (l) => logs.push(l), boundMs, lookMs, app });
};
const items = (store) => store._state.items.filter((i) => i.sessionKey === DFN.ITEM_KEY);
const cut = (anchor, to, tag) => { ok(SRC.split(anchor).length === 2, `control setup: «${tag}»'s anchor is found once in ${REL}`); return M.load(REL, anchored(SRC, anchor, to, tag), tag); };

console.log('③ the notice: one item; a second start, a dismissed item, a cleared item ⇒ nothing filed again');
{
  const S = storeOf();
  await noticeOf(DFN, { store: S, mountinfo: RCLONE }).look();
  const one = items(S).map((i) => JSON.parse(J(i)));   // a SNAPSHOT (the store's own objects change below)
  await noticeOf(DFN, { store: S, mountinfo: RCLONE }).look();   // a second start
  const again = items(S).length;
  S.setStatus(one[0].id, 'dismissed', 'user');
  await noticeOf(DFN, { store: S, mountinfo: RCLONE }).look();
  const afterDismiss = items(S).map((i) => i.status);
  const S2 = storeOf();
  await noticeOf(DFN, { store: S2, mountinfo: RCLONE }).look();
  S2.clearItems(items(S2).map((i) => i.id));
  const beforeLook = J(items(S2));   // «Clear content» keeps the item's status and marks it cleared — the look must leave it exactly so
  await noticeOf(DFN, { store: S2, mountinfo: RCLONE }).look();
  const afterClear = items(S2).map((i) => ({ status: i.status, cleared: !!i.clearedAt })), clearSame = J(items(S2)) === beforeLook;
  ok(one.length === 1 && one[0].origin === 'server' && one[0].kind === 'notice' && one[0].sessionName === 'Storage' && one[0].itemKey === 'data-folder:/mnt/r:fuse.rclone' && one[0].status === 'open' && noSource(one[0]),
    'ONE item: origin server, a notice, «Storage», keyed by the mount and its type — and no source in it', one[0]);
  ok(again === 1 && J(afterDismiss) === J(['dismissed']) && afterClear.length === 1 && afterClear[0].cleared === true && clearSame,
    'SAID ONCE: a second start files nothing; a dismissed item stays dismissed; a cleared item is left exactly as the Clear left it (no new item) — the store\'s own record is the memory (filedEver)', { again, afterDismiss, afterClear, clearSame });
  const X = cut("      if (typeof t.filedEver === 'function' && t.filedEver(ITEM_KEY, key)) return;   // SAID ONCE: open, resolved, dismissed or cleared\n", "      /* MUTANT: no said-once question */\n", 'b8797-no-once');
  const SX = storeOf();
  await noticeOf(DFN, { store: SX, mountinfo: RCLONE }).look();
  SX.setStatus(items(SX)[0].id, 'dismissed', 'user');
  await noticeOf(X, { store: SX, mountinfo: RCLONE }).look();
  ok(items(SX).some((i) => i.status === 'open'), 'CONTROL (the said-once question cut, in a copy): the next start reopens the item the person dismissed — red', items(SX).map((i) => i.status));
}

{
  // the round's should: the folder's drive is now served by ANOTHER program (a new key) — the earlier drive's open notice is over
  const S = storeOf();
  await noticeOf(DFN, { store: S, mountinfo: RCLONE }).look();
  await noticeOf(DFN, { store: S, mountinfo: RESERVED }).look();
  const by = Object.fromEntries(items(S).map((i) => [i.itemKey, i.status]));
  const X = cut("      settleOthers(t, key);   // the round's should: a folder now on ANOTHER drive — the earlier drive's open notice is over\n", "      /* MUTANT: the earlier drive's notice kept */\n", 'b8797-keep-other');
  const SX = storeOf();
  await noticeOf(DFN, { store: SX, mountinfo: RCLONE }).look();
  await noticeOf(X, { store: SX, mountinfo: RESERVED }).look();
  ok(by['data-folder:/mnt/r:fuse.rclone'] === 'done' && by['data-folder:/mnt/r:fuse.sshfs'] === 'open' && items(S).length === 2, 'the folder now on another drive: its notice is filed and the EARLIER drive\'s open notice is resolved — never two open notices for one folder', by);
  ok(items(SX).filter((i) => i.status === 'open').length === 2, 'CONTROL (the earlier drive\'s notice kept, in a copy — the line as taken): two open notices for one folder — red');
}

console.log('④ back on a local disk: the open item is resolved');
{
  const S = storeOf();
  await noticeOf(DFN, { store: S, mountinfo: RCLONE }).look();
  await noticeOf(DFN, { store: S, mountinfo: LOCAL }).look();
  const st = items(S).map((i) => i.status);
  const X = cut("    if (v.state === 'local') settleOthers(t, null);   // the folder is on a local disk now: an open notice of an earlier start is over\n", "    /* MUTANT: no settle */\n", 'b8797-no-settle');
  const SX = storeOf();
  await noticeOf(DFN, { store: SX, mountinfo: RCLONE }).look();
  await noticeOf(X, { store: SX, mountinfo: LOCAL }).look();
  ok(J(st) === J(['done']) && items(S)[0].resolvedBy === 'agent', 'the folder back on a local disk: the open notice is resolved (done, by the hub)', items(S));
  ok(J(items(SX).map((i) => i.status)) === J(['open']), 'CONTROL (the settle cut, in a copy): the notice stays open after the folder came back — red');
}

console.log('⑤ For you held unread: nothing asked, nothing filed until its read — then once');
{
  const heldStore = () => { const s = { held: true, waits: [], asked: 0, added: [], isHeldUnread() { return this.held; }, whenRead(fn) { this.waits.push(fn); }, filedEver() { this.asked++; return false; }, add(k, o) { this.added.push(o.itemKey); return { id: 'x' }; }, forSession() { return []; }, setStatus() { } }; return s; };
  const H = heldStore();
  await noticeOf(DFN, { store: H, mountinfo: RCLONE }).look();
  const whileHeld = { asked: H.asked, added: H.added.length, waits: H.waits.length };
  H.held = false; for (const f of H.waits.splice(0)) f();
  ok(whileHeld.asked === 0 && whileHeld.added === 0 && whileHeld.waits === 1 && H.asked === 1 && J(H.added) === J(['data-folder:/mnt/r:fuse.rclone']), 'held: the said-once question is NOT asked of an empty held list, nothing filed — at the read, asked and filed ONCE', { whileHeld, after: { asked: H.asked, added: H.added } });
  const X = cut("    if (typeof t.isHeldUnread === 'function' && t.isHeldUnread()) { if (typeof t.whenRead === 'function') t.whenRead(() => tell(v), 'the data folder notice'); return; }\n", "    /* MUTANT: no held wait */\n", 'b8797-no-held-wait');
  const HX = heldStore();
  await noticeOf(X, { store: HX, mountinfo: RCLONE }).look();
  ok(HX.asked === 1 && HX.added.length === 1, 'CONTROL (the held wait cut, in a copy): the question is asked of the held (empty) list and the item filed — red', { asked: HX.asked, added: HX.added });
}

console.log('⑥ the look never holds the start: arm() at once on an unref\'d timer; a table that never answers ends at the bound');
{
  const S = storeOf();
  const ST = globalThis.setTimeout; let armed = null;
  globalThis.setTimeout = (fn, ms, ...a) => { const t = ST(fn, ms, ...a); if (ms === 30000) armed = t; return t; };
  let N;
  try { N = noticeOf(DFN, { store: S, mountinfo: RCLONE }); N.arm(); } finally { globalThis.setTimeout = ST; }
  const unref = !!armed && typeof armed.hasRef === 'function' && armed.hasRef() === false;
  N.stop();
  const logs = [];
  // a REF'D keeper while these looks wait: the module's bound timer is unref'd (as it must be in the hub), and a top-level await on
  // it alone would end this process with rc 13 (an unsettled await) — the keeper is the hub's other handles
  const keeper = ST(() => { }, 10000);
  const hung = await noticeOf(DFN, { store: S, readMountinfo: () => new Promise(() => { }), boundMs: 60, logs }).look();   // it ENDS (the bound's RED below never does)
  ok(unref && items(S).length === 0, 'arm(): the look is a timer 30 s on, UNREF\'D (it never holds the start nor the exit) — nothing looked at arm time', { unref });
  ok(!!hung && hung.state === 'unknown' && hung.why === 'no mount table' && items(S).length === 0 && logs.some((l) => /not known/.test(l)), 'a mount table that never answers: the look ends at its bound — unknown, nothing filed, said in the journal', { hung, logs });
  const X = cut("      const t = await Promise.race([Promise.resolve().then(() => readMountinfo()).catch(() => null), bound]);\n", "      const t = await Promise.resolve().then(() => readMountinfo()).catch(() => null);   /* MUTANT: no bound */\n", 'b8797-no-bound');
  const raced = await Promise.race([noticeOf(X, { store: S, readMountinfo: () => new Promise(() => { }), boundMs: 60 }).look(), new Promise((r) => ST(() => r('still waiting'), 400))]);
  clearTimeout(keeper);
  ok(raced === 'still waiting', 'CONTROL (the bound cut, in a copy): the look waits on the table for good — red', raced);
}

{
  // the round's should: a store that THROWS (its held question) — a journal line, never an unhandled rejection
  const throwing = { add() { }, isHeldUnread() { throw new Error('a store that throws'); }, forSession() { return []; } };
  const logs = [], r = await noticeOf(DFN, { store: throwing, mountinfo: RCLONE, logs }).look().then((x) => (x ? x.state : 'none'), () => 'rejected');
  const X = cut("    try { tellOnce(v); } catch (e) { log(`[data-folder] the notice could not be told: ${(e && e.message) || e}`); }\n", "    tellOnce(v);   /* MUTANT: unguarded */\n", 'b8797-unguarded');
  const rx = await noticeOf(X, { store: throwing, mountinfo: RCLONE }).look().then(() => 'resolved', () => 'rejected');
  ok(r === 'remote' && logs.some((l) => /could not be told: a store that throws/.test(l)), 'a store that throws: the look still ends (its verdict), the failure a journal line', { r, logs });
  ok(rx === 'rejected', 'CONTROL (the telling unguarded, in a copy): the look rejects — an unhandled rejection from the timer — red', rx);
}

console.log('⑦ the Settings fact: GET /api/data-folder answers the verdict (no source) and files nothing; the row is words');
{
  const S = storeOf();
  const routes = {};
  noticeOf(DFN, { store: S, mountinfo: RCLONE, app: { get: (p, h) => { routes[p] = h; } } });
  let body = null, status = 200;
  await routes['/api/data-folder']({}, { json: (x) => { body = x; }, status(c) { status = c; return this; } });
  ok(status === 200 && !!body && body.state === 'remote' && body.type === 'fuse.rclone' && body.folder === '/mnt/r/vs/data' && noSource(body) && !('source' in body) && items(S).length === 0,
    'GET /api/data-folder before the start\'s look: the verdict (no source), and NOTHING filed (the notice is the start\'s look\'s alone)', { status, body });
  const SCH = read('src/lib/settings-schema.js'), UI = read('src/lib/settings-ui.js');
  const g = SCH.indexOf("'mounts.mainThreadSyncGuard': {"), row = g < 0 ? '' : SCH.slice(g, SCH.indexOf('\n  },', g));
  const f0 = UI.indexOf('  _renderDataFolderFact(info) {'), body2 = f0 < 0 ? '' : UI.slice(f0, UI.indexOf('\n  }\n', f0));
  ok(/fact: 'data-folder'/.test(row) && UI.includes("if (schema.fact === 'data-folder') this._renderDataFolderFact(info);") && body2.includes("fetchJson('/api/data-folder')") && !/button|addEventListener|onclick/i.test(body2),
    'the Settings row «Never let the server wait on a storage mount» draws the fact as WORDS: its renderer reads GET /api/data-folder and has no press (no button, no listener)');
  ok(body2.includes("t('The folder reaches that drive through a {view} view.'") && body2.includes("t('The folder is a {view} view of a {shows} file system: the program that serves the view is what can stop answering.'") && body2.includes("v.why === 'a symlink loop'"),
    'r5244: the Settings line says the VIEW too (to a network drive, or over another file system), and a looping path by its own words');
  ok(SCH.split('data-folder').length === 2 && row.includes('data-folder'), 'no setting silences the notice: the schema\'s ONE mention is the guard row\'s fact');
}

console.log('⑧ the words\' tables and the wiring');
{
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js'), UI = read('src/lib/settings-ui.js'), SJ = read('server.js');
  const keys = [DFN.TEXT_NETWORK, DFN.TEXT_USER_SPACE, DFN.WHY, DFN.INSTALL, DFN.VIEW, "VibeSpace keeps its own records in {folder}, on this computer's own disk", 'Could not read where VibeSpace keeps its own records', 'Where VibeSpace keeps its own records ({folder}) is not known: the mount table could not be read', DFN.VIEW_LOCAL, "Where VibeSpace keeps its own records ({folder}) is not known: the folder's path loops on its own links"];
  const row = (T, k) => T.includes(`  ${J(k)}: `);
  ok(keys.every((k) => row(ZH, k) && row(JA, k)), 'every sentence has its zh and ja row', keys.filter((k) => !row(ZH, k) || !row(JA, k)));
  ok([DFN.TEXT_NETWORK, DFN.TEXT_USER_SPACE, DFN.WHY].every((k) => !k.includes("'") && UI.includes(`t('${k}'`)), 'the Settings fact says the notice\'s OWN sentences (one translation each)');
  const li = SJ.indexOf('hub.listen(PORT, HOST, () => {'), arm = SJ.indexOf('  dataFolder.arm();'), made = SJ.indexOf("const dataFolder = require('./src/server/data-folder-notice.js').create({ dataDir: path.join(__dirname, 'data'), rootDir: __dirname, getUserTodos: () => userTodos, app });");
  ok(made > 0 && li > made && arm > li && SJ.split('dataFolder.arm()').length === 2, 'server.js: the module made at wiring time (its route beside the others), its look armed in the listen (never before it)', { made, li, arm });
}

report();
