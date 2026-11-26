#!/usr/bin/env node
// A KEPT SIGN-IN FOLDER's WAY OUT (row B-e381, 主开发 r4680 / r5260 / r5296) — its legs moved WORD FOR WORD out of
// scripts/test-codex-pool.mjs into a fast suite of their own (主开发 r5292: the split; test-codex-pool's row restated by its own alone
// reading). A removal whose heal could not move a pool off the removed member keeps that member's sign-in folder: the removal owes it
// in its own first write (accounts.json keptSignIns: id, harness, since, pools, the provider's code — no name), and only a person's act
// retries it — the kept folder's door (POST /api/accounts/kept/:id/wipe) and a person's later removal (the DELETE route sets retryKept
// for a person only) — never a start, never a timer; the wipe takes ONE folder, and only when no link reads it.
// Stand-in homes under the temp folder (removed at exit), made-up sign-in files; every red is a copy of today's module with ONE
// anchored plant, witnessed before it is judged (r5135 law 1: else a named «⊘ SKIP»).
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { waitEverySave } = require('./lib/accounts-landed.cjs');   // B-574d unit 1 (a): accounts.json is the store writer's — each save waited for (the suite's thread)
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
// every patched copy is written OUTSIDE the tree (scripts/mutant-copy.mjs: this process's scratch dir, `require` re-bound to the real
// module's path); the R-tree census at the end measures the placement while the copies exist
const MUTCP = mutantCopies('kept-signin-folder', REPO);
const copyOrig = new Map();
let copySeq = 0;
const copyPath = (origRel, tag) => { const p = MUTCP.pathFor(`${path.basename(origRel, '.js')}-${tag}-${++copySeq}`); copyOrig.set(p, origRel); return p; };
const writeCopy = (p, src) => MUTCP.write(copyOrig.get(p), src, null, { esm: false, name: path.basename(p, '.cjs') });

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok: the leg's name is a ${typeof n}, not a string — the arguments are swapped`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
waitEverySave(AccountManager);
// the scenes make their stand-in homes through e381Tmp: each folder is removed when the process exits
const e381Dirs = [];
const e381Tmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); e381Dirs.push(d); return d; };
process.on('exit', () => { for (const d of e381Dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
process.env.CODEX_HOME = path.join(e381Tmp('vs-kept-codex-home-'), 'shared-codex');   // keep _seedCodexDir off any real ~/.codex

// ── B-e381 (kept) (主开发 r4680): A KEPT SIGN-IN FOLDER's WAY OUT ──
// A removal whose heal failed keeps the member's folder (B-e381 (2)); at the tip nothing remembered it and nothing ever wiped it later.
// Now (law 1) the removal writes an owed row (keptSignIns: id, harness, since, pools — no name) in the SAME store write that takes the
// record off the file; (law 4) the person's door (retryKeptWipe — POST /api/accounts/kept/:id/wipe) and every later removal retry it:
// the removal's own heal first, then that ONE folder deleted only when no link reads it (read fresh), else kept again and said; a folder
// already gone drops its row and says so; a held store drops nothing; a start does nothing. (law 2) The door refuses an agent's, a
// job's and an automation's sign-in by name. RED: the tip's form (the formed chain's follow) planted in a copy — no row is written,
// so nothing owes the folder, and there is no door.
console.log('\nB-e381 (kept) a kept sign-in folder is owed in the removal\'s own write, and cleared only on a person\'s act');
{
  const { anchored } = await import('./scratch.mjs');
  const SRCK = read('src/accounts.js');
  const PUSH = "      this._dropKept(id);\n      owedRow = { id, harness: this._acctBackend(a), since: Date.now(), pools: 0, ...(this._providerKeyOf(goneProvider) ? { provider: this._providerKeyOf(goneProvider) } : {}) };\n      this._keptRows().push(owedRow);\n";
  const TIPK = [
    [PUSH, '', "B-e381 (kept): the tip's form — no owed row is written"],
    ["      if (failed.length) { kept = { pools: failed.length, codes: [...new Set(failed.map((f) => f.code))] }; owedRow.pools = failed.length; }\n",
     "      if (failed.length) kept = { pools: failed.length, codes: [...new Set(failed.map((f) => f.code))] };\n", "B-e381 (kept): the tip's kept answer, no row to count"],   // stale-pins: kept (the red copy: the tip's own text, planted)
    ['  retryKeptWipe(id, opts = {}) {\n', '  noDoorAtTheTip(id, opts = {}) {\n', "B-e381 (kept): the tip has no door"],
  ].reduce((t, [from, to, why]) => anchored(t, from, to, why), SRCK);
  const tipF = copyPath('src/accounts.js', 'e381-kept-tip'); writeCopy(tipF, TIPK);
  const TipAM = waitEverySave(require(tipF).AccountManager);   // a copy's class is patched by its own call (its saves land before a read)
  const tipPlant = !TIPK.includes(PUSH) && typeof TipAM.prototype.retryKeptWipe !== 'function' && typeof TipAM.prototype.noDoorAtTheTip === 'function';   // r5135 law 1: the plant's witness
  const exists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
  const live = (p) => { try { fs.statSync(p); return true; } catch { return false; } };
  const MAT = require(path.join(REPO, 'src/account-material.js'));
  // the heal's re-point refused (placed: EACCES), as B-e381 (2)'s failRun — the one way a heal fails here
  const refused = (fn) => { const real = MAT.repointPoolSymlink; MAT.repointPoolSymlink = () => { throw Object.assign(new Error('placed: the link could not be moved'), { code: 'EACCES' }); }; try { return fn(); } finally { MAT.repointPoolSymlink = real; } };
  const world = (AM, tag, { extra = false, onChange = null } = {}) => {
    const d = e381Tmp('vs-kept-e381-' + tag + '-');
    const m = new AM({ dataDir: d, ...(onChange ? { onChange } : {}) });
    const sub = (name) => { const a = m.createSubscription({ name }); fs.writeFileSync(path.join(m.subDir(a.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + name, refreshToken: 'fake-rt', expiresAt: Date.now() + 3600e3, scopes: ['user:inference'] } })); return a.id; };
    const A = sub('ClK0'), B = sub('ClK1'), C = extra ? sub('ClK2') : null;
    const P = m.createPool({ name: 'ClKP', members: [A, B] }).id; m.setPoolTarget(P, A);
    const file = path.join(d, 'accounts.json');
    return { d, m, A, B, C, P, file, aDir: m.subDir(A), bDir: m.subDir(B), def: path.join(d, 'subs', P), onDisk: () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  const rowsOf = (j) => (j && Array.isArray(j.keptSignIns) ? j.keptSignIns : []);
  // (law 1) the failed removal: every write that has the record OFF the file carries the owed row — the first one included
  const failedRemoval = (AM, tag, opts) => {
    const w = world(AM, tag, opts);
    const writes = [], save0 = w.m._save;
    w.m._save = function (...a) { const r = save0.apply(this, a); try { writes.push(JSON.parse(fs.readFileSync(w.file, 'utf8'))); } catch { writes.push(null); } return r; };
    let ans = null; try { ans = refused(() => w.m.remove(w.A)); } finally { delete w.m._save; }
    const off = writes.filter((j) => j && !j.accounts.some((x) => x.id === w.A));
    return { ...w, ans, writes: writes.length, off: off.length, firstOffOwes: off.length > 0 && rowsOf(off[0]).some((r) => r.id === w.A && r.harness === 'claude'), everyOffOwes: off.length > 0 && off.every((j) => rowsOf(j).some((r) => r.id === w.A)) };
  };
  const k1 = failedRemoval(AccountManager, 'k1');
  const disk1 = rowsOf(k1.onDisk()).find((r) => r.id === k1.A) || null;
  ok('B-e381 (kept) LAW 1: the removal\'s FIRST write that takes the record off the file already carries the owed row (id, harness) — and so does every later one; the row on disk names no account', k1.firstOffOwes && k1.everyOffOwes && !!disk1 && disk1.pools === 1 && disk1.harness === 'claude' && !('name' in disk1) && !JSON.stringify(disk1).includes('ClK0') && JSON.stringify(k1.ans) === JSON.stringify({ keptFolder: { pools: 1, codes: ['EACCES'] } }), JSON.stringify({ writes: k1.writes, off: k1.off, first: k1.firstOffOwes, every: k1.everyOffOwes, disk1, ans: k1.ans }));
  // a START does nothing: a restart reads the row, the folder stands, the pool still reads it — nothing runs at a start or on a timer
  const m2 = new AccountManager({ dataDir: k1.d });
  await new Promise((r) => setTimeout(r, 50));
  const r2 = m2.keptSignIns();
  ok('B-e381 (kept): the owed row SURVIVES a restart, and a start does nothing — the folder still stands, the pool still reads it, the row is the same', r2.length === 1 && r2[0].id === k1.A && r2[0].pools === 1 && exists(k1.aDir) && live(k1.def) && path.basename(fs.readlinkSync(k1.def)) === k1.A && (m2.list().keptSignIns || []).length === 1, JSON.stringify({ r2, aDir: exists(k1.aDir), def: live(k1.def) }));
  // (law 4) THE DOOR, on the restarted store: kept again while the heal still fails; kept while a link still reads it whatever the heal
  // says (the links are read fresh); cleared once no link reads it; then nothing is owed
  const again = refused(() => m2.retryKeptWipe(k1.A));
  ok('B-e381 (kept) the door: the heal fails again — the folder is KEPT AGAIN and said ({kept: {pools: 1, codes: [EACCES]}}), the row stays', JSON.stringify(again) === JSON.stringify({ kept: { pools: 1, codes: ['EACCES'] } }) && exists(k1.aDir) && m2.keptSignIns().length === 1, JSON.stringify(again));
  m2._healPoolsAfterRemoval = () => [];   // a heal that SAYS it moved everything, while the pool's default still reads the folder
  let fresh = null; try { fresh = m2.retryKeptWipe(k1.A); } finally { delete m2._healPoolsAfterRemoval; }
  ok('B-e381 (kept) the door: a link that still reads the folder keeps it whatever the heal answered — the links are read fresh before any wipe', !!fresh && !!fresh.kept && fresh.kept.pools === 1 && exists(k1.aDir) && live(k1.def), JSON.stringify(fresh));
  const cleared = m2.retryKeptWipe(k1.A);
  const disk2 = JSON.parse(fs.readFileSync(k1.file, 'utf8'));
  ok('B-e381 (kept) the door: the heal moves the pool to the member that stays, NO link reads the folder, and ONLY THEN that one folder is deleted — {cleared}, the row gone from the file; the other member\'s folder untouched', JSON.stringify(cleared) === JSON.stringify({ cleared: true }) && !exists(k1.aDir) && exists(k1.bDir) && live(k1.def) && path.basename(fs.readlinkSync(k1.def)) === k1.B && m2.keptSignIns().length === 0 && rowsOf(disk2).length === 0, JSON.stringify({ cleared, aDir: exists(k1.aDir), bDir: exists(k1.bDir), rows: rowsOf(disk2) }));
  ok('B-e381 (kept) the door: asked again, nothing is owed under that id ({unknown}) — nothing deleted', JSON.stringify(m2.retryKeptWipe(k1.A)) === JSON.stringify({ unknown: true }) && exists(k1.bDir));
  // a folder ALREADY GONE: the row is dropped and said; an account that holds the id again (a config import brought its record back —
  // stood in by the store's own list) keeps its folder: nothing deleted, the row dropped
  const k3 = failedRemoval(AccountManager, 'k3');
  fs.rmSync(k3.aDir, { recursive: true, force: true });
  const gone = k3.m.retryKeptWipe(k3.A);
  ok('B-e381 (kept) the door: a folder already gone — the row is DROPPED and said ({gone}), the pool\'s link healed off the missing folder to the member that stays', JSON.stringify(gone) === JSON.stringify({ gone: true }) && k3.m.keptSignIns().length === 0 && rowsOf(k3.onDisk()).length === 0 && live(k3.def) && path.basename(fs.readlinkSync(k3.def)) === k3.B, JSON.stringify({ gone, def: live(k3.def) }));
  const k4 = failedRemoval(AccountManager, 'k4');
  k4.m._state.accounts.push({ id: k4.A, type: 'subscription', backend: 'claude', name: 'ClK0' });
  const held4 = k4.m.retryKeptWipe(k4.A);
  ok('B-e381 (kept) the door: an account holds that id again — NOTHING is deleted ({live}), the row dropped', JSON.stringify(held4) === JSON.stringify({ live: true }) && exists(k4.aDir) && k4.m.keptSignIns().length === 0, JSON.stringify(held4));
  // EVERY LATER REMOVAL retries each owed wipe (a person's act): another account removed — the kept folder is cleared with it, said in
  // a journal line that names no account
  const k5 = failedRemoval(AccountManager, 'k5', { extra: true });
  const lines = [], warn0 = console.warn;
  console.warn = (...a) => { lines.push(a.join(' ')); };
  try { k5.m.remove(k5.C, { retryKept: true }); } finally { console.warn = warn0; }   // (r5260) a PERSON's removal: its route sets retryKept
  const said = lines.filter((l) => /a kept sign-in folder \(claude\), retried at a removal: cleared/.test(l));
  ok('B-e381 (kept): the NEXT removal BY A PERSON (its route asks retryKept) retries the owed wipe — the pool moved to the member that stays, the kept folder deleted, the row gone; its journal line names no account', !exists(k5.aDir) && live(k5.def) && path.basename(fs.readlinkSync(k5.def)) === k5.B && k5.m.keptSignIns().length === 0 && rowsOf(k5.onDisk()).length === 0 && said.length === 1 && !said[0].includes(k5.A) && !said[0].includes('ClK'), JSON.stringify({ aDir: exists(k5.aDir), lines: lines.map((l) => l.slice(0, 120)) }));
  // a HELD store (the accounts file could not be read at the start) drops nothing: the door is refused by name, the folder and the
  // file's bytes stay
  const k6 = failedRemoval(AccountManager, 'k6');
  const before6 = fs.readFileSync(k6.file, 'utf8'), real6 = fs.readFileSync, f6 = path.resolve(k6.file);
  let m6 = null;
  fs.readFileSync = function (p, ...a) { if (path.resolve(String(p)) === f6) throw Object.assign(new Error('placed: EIO'), { code: 'EIO' }); return real6.call(this, p, ...a); };
  try { m6 = new AccountManager({ dataDir: k6.d }); } finally { fs.readFileSync = real6; }
  let heldErr = null; try { m6.retryKeptWipe(k6.A); } catch (e) { heldErr = e; }
  ok('B-e381 (kept): a HELD accounts store drops nothing — the door is refused by name (accounts_unread), the folder stands, the file\'s bytes unchanged', !!m6.held() && !!heldErr && heldErr.code === 'accounts_unread' && exists(k6.aDir) && fs.readFileSync(k6.file, 'utf8') === before6, JSON.stringify({ held: !!m6.held(), code: heldErr && heldErr.code }));
  // (law 2) THE DOOR's person check: an agent's, a job's and an automation's sign-in refused by name; another site refused; the person passes
  const AT = require(path.join(REPO, 'src/routes/account-tails.js'));
  const asked = (headers, body = {}) => { const out = {}; const res = { set() { return this; }, status(c) { out.code = c; return this; }, json(o) { out.body = o; return this; } }; out.passed = AT.keptFolderDoor({ headers, body, query: {}, socket: {} }, res); return out; };   // the page's verdict is its Sec-Fetch-Site (no host needed)
  const page = { 'sec-fetch-site': 'same-origin' };
  const agent = asked({ ...page, authorization: 'Bearer ' + ['vs', 'st_', 'k'.repeat(12)].join('') });
  const job = asked(page, { token: ['jb', 't_', 'k'.repeat(12)].join('') });
  const auto = asked({ ...page, authorization: 'Bearer ' + ['vs', 'ak_', 'k'.repeat(12)].join('') });
  const site = asked({ 'sec-fetch-site': 'cross-site' }), person = asked(page);
  const byName = (x) => x.passed === false && x.code === 403 && x.body && x.body.code === 'human_only' && /an agent's, a job's or an automation's sign-in cannot/.test(x.body.error || '');
  const AURK = read('src/server/account-usage-routes.js');
  ok('B-e381 (kept) LAW 2: the door refuses an agent\'s, a job\'s and an automation\'s sign-in BY NAME (403 human_only), another site (cross_site); a person on this page passes — and the wipe route asks it first', byName(agent) && byName(job) && byName(auto) && site.passed === false && site.code === 403 && site.body.code === 'cross_site' && person.passed === true && person.code === undefined && AURK.includes("app.post('/api/accounts/kept/:id/wipe', (req, res) => {\n  if (!AT.keptFolderDoor(req, res)) return;"), JSON.stringify({ agent, job, auto, site, person }));
  // (law 3) THE PAGE: one line per owed row, drawn in each of the three rosters on this machine only; every answer worded in en, zh, ja
  const MAK = read('src/lib/manage-agents.js'), ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js'), APPK = read('src/lib/app.js');
  const carried = APPK.includes('keptSignIns: Array.isArray(d.keptSignIns) ? d.keptSignIns : []') && APPK.includes('keptSignIns: Array.isArray(msg.keptSignIns) ? msg.keptSignIns : []');   // the page's list keeps the rows (its read and the push)
  const fnK = MAK.slice(MAK.indexOf('function keptFolderWords(r) {'), MAK.indexOf('\n}\n', MAK.indexOf('function keptFolderWords(r) {')));
  const drawK = MAK.slice(MAK.indexOf('  _drawKeptFolders(left, accts, be, refresh) {'), MAK.indexOf('\n  },\n', MAK.indexOf('  _drawKeptFolders(left, accts, be, refresh) {')));
  const keysK = [...(fnK + drawK).matchAll(/\bt\('([^']+)'/g)].map((x) => x[1]);
  const untranslated = keysK.filter((k) => !ZH.includes(JSON.stringify(k) + ':') || !JA.includes(JSON.stringify(k) + ':'));
  ok('B-e381 (kept) LAW 3: the line is drawn from the owed rows only (the page\'s list carries them, its read and the push), in the three rosters (local only), its button never greyed; its words and every answer (cleared, gone, held again, kept with why) in zh and ja', keysK.length >= 10 && untranslated.length === 0 && (MAK.match(/this\._drawKeptFolders\(left, accts, /g) || []).length === 3 && /accts\.keptSignIns/.test(drawK) && !/disabled/.test(drawK) && /needLine\(/.test(drawK) && carried, JSON.stringify({ keys: keysK.length, untranslated, carried }));
  // THE MEETING's TWO FAULTS (the round's should): a heal that FAILS and a landing that FAILS together — the act finishes, its owed
  // landing is thrown at the end, and it CARRIES the kept folder (the route's 503 hands it on); the owed row stands in memory, so the
  // page's line is drawn (the toast's catch has only the landing's words). A sign-in row (a stand-in oatEnc) takes the synchronous road.
  const twoFaults = (AM, tag) => {
    const w = world(AM, tag);
    w.m._state.accounts.find((x) => x.id === w.A).oatEnc = 'stand-in';   // a row that held a sign-in: its removal lands synchronously
    const save0 = w.m._save;
    w.m._save = function (o = {}) { if (o && o.now) throw Object.assign(new Error('accounts.json could not be written (placed: EIO) — the removal was not saved'), { code: 'not-durable', status: 503, signInSave: true }); return save0.call(this, o); };
    let thrown = null; try { refused(() => w.m.remove(w.A)); } catch (e) { thrown = e; } finally { delete w.m._save; }
    return { thrown: thrown && { code: thrown.code, landingOwed: !!thrown.landingOwed, keptFolder: thrown.keptFolder || null }, aKept: exists(w.aDir), owed: w.m.keptSignIns().map((r) => r.id === w.A && r.pools) };
  };
  const tf = twoFaults(AccountManager, 'two-faults');
  const MEET = "    if (owed) { if (kept) owed.keptFolder = kept; throw owed; }\n";
  const MEETX = anchored(SRCK, MEET, "    if (owed) throw owed;\n", "B-e381 (kept): the meeting without its kept folder");
  const meetF = copyPath('src/accounts.js', 'e381-kept-meet'); writeCopy(meetF, MEETX);
  const MeetAM = waitEverySave(require(meetF).AccountManager);
  const meetPlant = !MEETX.includes('owed.keptFolder = kept');   // r5135 law 1: the plant's witness
  ok('B-e381 (kept) THE MEETING: a heal that fails AND a landing that fails — the owed landing is thrown at the act\'s end CARRYING the kept folder ({pools: 1, codes: [EACCES]}), the folder stands, the row is owed in memory; the route hands it on its 503', !!tf.thrown && tf.thrown.code === 'not-durable' && tf.thrown.landingOwed && JSON.stringify(tf.thrown.keptFolder) === JSON.stringify({ pools: 1, codes: ['EACCES'] }) && tf.aKept && JSON.stringify(tf.owed) === '[1]' && AURK.includes('if (unlanded) return notDurable(res, unlanded, unlanded.keptFolder ? { keptFolder: unlanded.keptFolder } : {});'), JSON.stringify(tf));
  if (!meetPlant) console.log('  ⊘ SKIP B-e381 (kept) THE MEETING RED — the plant was not in force in its copy');
  else { const tfx = twoFaults(MeetAM, 'two-faults-red'); ok('B-e381 (kept) THE MEETING RED — the meeting without its clause (planted, witnessed): the same two faults throw the landing with NO kept folder — a later edit that drops it is red here', !!tfx.thrown && tfx.thrown.code === 'not-durable' && tfx.thrown.keptFolder === null && tfx.aKept, JSON.stringify(tfx)); }
  // THE KEEP NEVER READS EMPTY: the pool's own link cannot be read (placed EIO at readlink) — the retry counts it as READING and keeps
  // the folder; RED: the keep's first form, an unreadable link read as «no link», deletes the folder under it
  const READS_CATCH = "catch (e) { return !(e && (e.code === 'ENOENT' || e.code === 'EINVAL' || e.code === 'ENOTDIR')); } };";
  const READX = anchored(SRCK, READS_CATCH, 'catch (e) { return false; } };', "B-e381 (kept): an unreadable link read as no link");
  const readF = copyPath('src/accounts.js', 'e381-kept-read'); writeCopy(readF, READX);
  const ReadAM = waitEverySave(require(readF).AccountManager);
  const readPlant = !READX.includes(READS_CATCH) && READX.includes('catch (e) { return false; } };');
  const unread = (AM, tag) => {
    const w = failedRemoval(AM, tag);
    const real = fs.readlinkSync, at = path.resolve(w.def);
    fs.readlinkSync = function (p, ...a) { if (path.resolve(String(p)) === at) throw Object.assign(new Error('placed: EIO'), { code: 'EIO' }); return real.call(this, p, ...a); };
    let r = null; try { r = w.m.retryKeptWipe(w.A); } finally { fs.readlinkSync = real; }
    return { r, aKept: exists(w.aDir), rows: w.m.keptSignIns().length };
  };
  const ur = unread(AccountManager, 'unread');
  ok('B-e381 (kept) THE KEEP NEVER READS EMPTY: the pool\'s own link cannot be read (placed EIO) — it counts as READING, the folder is kept and said ({kept: {pools: 1}}), the row stays', !!ur.r && !!ur.r.kept && ur.r.kept.pools === 1 && ur.aKept && ur.rows === 1, JSON.stringify(ur));
  if (!readPlant) console.log('  ⊘ SKIP B-e381 (kept) THE KEEP RED — the plant was not in force in its copy');
  else { const urx = unread(ReadAM, 'unread-red'); ok('B-e381 (kept) THE KEEP RED — an unreadable link read as «no link» (planted, witnessed): the folder is DELETED while the pool\'s link may still name it', !!urx.r && urx.r.cleared === true && !urx.aKept, JSON.stringify(urx)); }
  // ── THE MUST (主开发 r5260): A START NEVER REACHES THE WIPE ──
  // remove() has callers that are no person's removal: the sign-in module's sweep of never-signed-in rows past their TTL (it runs
  // at EVERY START of the hub — its create — and at every sign-in press) discards them through remove(), and the relogin's
  // rollback does too. The retry of the other owed rows runs ONLY when the removal's route asks (retryKept). THE SCENE through the
  // module's OWN create over this store: a kept folder owed, a card left open past its time; the start's sweep discards the card's
  // row — the kept folder, the pool's link and the owed row are UNCHANGED. RED: the loop left in remove() (planted, witnessed).
  const CS = require(path.join(REPO, 'src/server/claude-signin.js'));
  const LOOP = '    if (opts.retryKept === true) for (const r of [...(this._state.keptSignIns || [])]) if (r.id !== id) {';
  const LOOPX = anchored(SRCK, LOOP, '    for (const r of [...(this._state.keptSignIns || [])]) if (r.id !== id) {', "B-e381 (kept): the retry left in remove() for every caller");   // stale-pins: kept (the red copy: the retry left in remove() for every caller, planted)
  const loopF = copyPath('src/accounts.js', 'e381-kept-loop'); writeCopy(loopF, LOOPX);
  const LoopAM = waitEverySave(require(loopF).AccountManager);
  const loopPlant = !LOOPX.includes('opts.retryKept === true');   // r5135 law 1: the plant's witness
  const startScene = (AM, tag) => {
    const w = failedRemoval(AM, tag);   // a kept folder owed: the heal failed at the person's removal
    const pend = w.m.createSubscription({ signinPending: true }).id;   // an «add account» card opened and left
    const said = [];
    CS.create({ accounts: w.m, tmpRoot: e381Tmp('vs-kept-signin-' + tag + '-'), now: () => Date.now() + CS.SIGNIN_TTL_MS + 60e3, log: (...a) => said.push(a.join(' ')) });   // THE HUB's START: the module's own create, its sweep past the card's time
    return { swept: !w.m.get(pend) && said.some((l) => /never-signed-in account row/.test(l)), aKept: exists(w.aDir), defA: live(w.def) && path.basename(fs.readlinkSync(w.def)) === w.A, rows: w.m.keptSignIns().map((r) => r.id === w.A && r.pools) };
  };
  const st1 = startScene(AccountManager, 'start');
  ok('B-e381 (kept) THE MUST — A START NEVER REACHES THE WIPE: the sign-in module\'s own create sweeps a card\'s row past its time (its discard goes through remove()) — the kept folder stands, the pool\'s link still reads it, the owed row is the same', st1.swept && st1.aKept && st1.defA && JSON.stringify(st1.rows) === '[1]', JSON.stringify(st1));
  if (!loopPlant) console.log('  ⊘ SKIP B-e381 (kept) THE MUST RED — the plant was not in force in its copy');
  else { const st1x = startScene(LoopAM, 'start-red'); ok('B-e381 (kept) THE MUST RED — the retry left in remove() (planted, witnessed): the same start re-points the pool and DELETES the kept folder with nobody pressing', st1x.swept && !st1x.aKept && !st1x.defA && JSON.stringify(st1x.rows) === '[]', JSON.stringify(st1x)); }
  // the callers, pinned: only the removal's route asks the retry; the discard and the relogin's rollback call remove() without it
  const srcAll = []; const walkSrc = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walkSrc(f); else if (e.name.endsWith('.js')) srcAll.push(f); } };
  walkSrc(path.join(REPO, 'src')); srcAll.push(path.join(REPO, 'server.js'));
  const askers = srcAll.map((f) => [path.relative(REPO, f), (fs.readFileSync(f, 'utf8').match(/retryKept\s*:/g) || []).length]).filter(([, n]) => n);   // (r5296) any value, not only a literal
  ok('B-e381 (kept): the retry\'s callers pinned — the option retryKept is set by the DELETE route alone (from the person\'s verdict); _retryKeptRow is called by remove() (under the ask) and the person\'s door only; the discard and the relogin\'s rollback call remove() bare', JSON.stringify(askers) === JSON.stringify([['src/server/account-usage-routes.js', 1]]) && AURK.includes('retryKept: AT.keptRetryAsked(req),') && (SRCK.match(/this\._retryKeptRow\(/g) || []).length === 2 && SRCK.includes(LOOP) && SRCK.includes('    this.remove(id);\n    return true;\n') && SRCK.includes('{ this.remove(created.id); return this._reloginMoveFailed('), JSON.stringify(askers));
  // «ALREADY GONE» ONLY ON «NO SUCH FILE» (the round's should): a folder that cannot be looked at (placed EACCES at its lstat) is
  // KEPT and said — never dropped as gone (an orphan with no row); RED: any failure read as gone
  const GONE = "return e && e.code === 'ENOENT' ? { gone: true } : { unread: (e && e.code) || 'error' };";
  const GONEX = anchored(SRCK, GONE, 'return { gone: true };', "B-e381 (kept): any failure read as gone");
  const goneF = copyPath('src/accounts.js', 'e381-kept-gone'); writeCopy(goneF, GONEX);
  const GoneAM = waitEverySave(require(goneF).AccountManager);
  const gonePlant = !GONEX.includes(GONE);
  const unlooked = (AM, tag) => {
    const w = failedRemoval(AM, tag); const real = fs.lstatSync, at = path.resolve(w.aDir);
    fs.lstatSync = function (p, ...a) { if (path.resolve(String(p)) === at) throw Object.assign(new Error('placed: EACCES'), { code: 'EACCES' }); return real.call(this, p, ...a); };
    let r = null; try { r = w.m.retryKeptWipe(w.A); } finally { fs.lstatSync = real; }
    return { r, aKept: exists(w.aDir), rows: w.m.keptSignIns().length };
  };
  const ul = unlooked(AccountManager, 'unlooked');
  ok('B-e381 (kept): a folder that cannot be looked at (placed EACCES) is KEPT and said with its code ({kept: {pools: 1, codes: [EACCES]}}) — the row stays, never dropped as gone', JSON.stringify(ul.r) === JSON.stringify({ kept: { pools: 1, codes: ['EACCES'] } }) && ul.aKept && ul.rows === 1, JSON.stringify(ul));
  if (!gonePlant) console.log('  ⊘ SKIP B-e381 (kept) GONE RED — the plant was not in force in its copy');
  else { const ulx = unlooked(GoneAM, 'unlooked-red'); ok('B-e381 (kept) GONE RED — any failure read as gone (planted, witnessed): the row is dropped while the folder stands — the orphan this unit ends', !!ulx.r && ulx.r.gone === true && ulx.aKept && ulx.rows === 0, JSON.stringify(ulx)); }
  // THE PROVIDER IN THE ROW (the round's should): the owed row keeps the CODE of the provider the member served (no name), and the
  // retry's heal is handed it — after a restart forgot the removal, a conversation is still never re-pointed to another provider
  const kp = failedRemoval(AccountManager, 'provider');
  const kpRow = rowsOf(kp.onDisk()).find((r) => r.id === kp.A) || {};
  ok('B-e381 (kept): the owed row keeps the provider\'s CODE the member served (no name), and the retry hands it to the heal', typeof kpRow.provider === 'string' && kpRow.provider.length > 0 && !JSON.stringify(kpRow).includes('ClK') && SRCK.includes('removedProvider: this._providerOfCode(row.provider, row.harness)'), JSON.stringify(kpRow));
  // ONE RULE FOR BOTH WIPES (the round's should): the person's removal ALSO asks the links' fresh read before its own wipe — the
  // pool's own link cannot be read (placed EIO) — the folder is kept and owed, the answer says so; RED: the removal's wipe without it
  const ONE = "      if (owedRow && !kept) { const reading = this._linksReading(id); if (reading) { kept = { pools: reading, codes: [] }; owedRow.pools = reading; } }\n";
  const ONEX = anchored(SRCK, ONE, '', "B-e381 (kept): the removal's own wipe without the links' read");
  const oneF = copyPath('src/accounts.js', 'e381-kept-one'); writeCopy(oneF, ONEX);
  const OneAM = waitEverySave(require(oneF).AccountManager);
  const onePlant = !ONEX.includes(ONE);
  const unreadAtRemoval = (AM, tag) => {
    const w = world(AM, tag); const real = fs.readlinkSync, at = path.resolve(w.def);
    fs.readlinkSync = function (p, ...a) { if (path.resolve(String(p)) === at) throw Object.assign(new Error('placed: EIO'), { code: 'EIO' }); return real.call(this, p, ...a); };
    let ans = null; try { ans = w.m.remove(w.A); } finally { fs.readlinkSync = real; }
    return { ans: JSON.stringify(ans ?? null), aKept: exists(w.aDir), rows: w.m.keptSignIns().map((r) => r.id === w.A && r.pools) };
  };
  const ua = unreadAtRemoval(AccountManager, 'one-rule');
  ok('B-e381 (kept) ONE RULE FOR BOTH WIPES: at the person\'s removal the pool\'s link cannot be read (placed EIO) — the folder is KEPT and owed, the answer says so ({keptFolder: {pools: 1, codes: []}})', ua.ans === JSON.stringify({ keptFolder: { pools: 1, codes: [] } }) && ua.aKept && JSON.stringify(ua.rows) === '[1]', JSON.stringify(ua));
  if (!onePlant) console.log('  ⊘ SKIP B-e381 (kept) ONE RULE RED — the plant was not in force in its copy');
  else { const uax = unreadAtRemoval(OneAM, 'one-rule-red'); ok('B-e381 (kept) ONE RULE RED — the removal\'s wipe without the links\' read (planted, witnessed): the folder is wiped while the pool\'s link could not be read, the answer silent', uax.ans === '{}' && !uax.aKept && JSON.stringify(uax.rows) === '[]', JSON.stringify(uax)); }
  // THE LINKS' READ, EACH BRANCH (lens three): a conversation's link alone still names the folder — kept; a pool's links folder that
  // cannot be read (placed EIO) — kept; RED: that folder's error read as empty
  const sessAlone = async (AM, tag) => {
    const w = world(AM, tag);
    w.m.ensureSessionPoolLink(w.P, 'sess-k', w.A, { why: 'spawn' });
    await new Promise((r) => setImmediate(r));   // the run's one listing (src/run-reads.js) ends: the heal lists the new link
    refused(() => w.m.remove(w.A));   // both re-points refused: the default and the conversation's link stay on the member
    w.m.setPoolTarget(w.P, w.B);   // the default moved off it by hand: only the conversation's link names it
    w.m._healPoolsAfterRemoval = () => [];   // a heal that moves nothing and says all is well
    let r1 = null; try { r1 = w.m.retryKeptWipe(w.A); } finally { delete w.m._healPoolsAfterRemoval; }
    const kept1 = exists(w.aDir);
    await new Promise((r) => setImmediate(r));
    const r2 = w.m.retryKeptWipe(w.A);   // the real heal moves the conversation's link to the member that stays
    return { r1, kept1, r2, gone2: !exists(w.aDir) };
  };
  const sa = await sessAlone(AccountManager, 'sess');
  ok('B-e381 (kept): a CONVERSATION\'s link alone still names the folder — kept ({kept: {pools: 1}}); once the heal moves it, the folder is cleared', !!sa.r1 && !!sa.r1.kept && sa.r1.kept.pools === 1 && sa.kept1 && JSON.stringify(sa.r2) === JSON.stringify({ cleared: true }) && sa.gone2, JSON.stringify(sa));
  const DIRC = "catch (e) { if (!(e && (e.code === 'ENOENT' || e.code === 'ENOTDIR'))) n++; }";
  const DIRX = anchored(SRCK, DIRC, 'catch (e) { }', "B-e381 (kept): a links folder's error read as empty");
  const dirF = copyPath('src/accounts.js', 'e381-kept-dir'); writeCopy(dirF, DIRX);
  const DirAM = waitEverySave(require(dirF).AccountManager);
  const dirPlant = !DIRX.includes(DIRC);
  const dirUnread = (AM, tag) => {
    const w = failedRemoval(AM, tag); w.m.setPoolTarget(w.P, w.B);   // the default moved off it: only the links folder is left to read
    const real = fs.readdirSync, at = path.resolve(w.m.poolLinksDir(w.P));
    fs.readdirSync = function (p, ...a) { if (path.resolve(String(p)) === at) throw Object.assign(new Error('placed: EIO'), { code: 'EIO' }); return real.call(this, p, ...a); };
    let r = null; try { r = w.m.retryKeptWipe(w.A); } finally { fs.readdirSync = real; }
    return { r, aKept: exists(w.aDir) };
  };
  const du = dirUnread(AccountManager, 'dir');
  ok('B-e381 (kept): a pool\'s links folder that cannot be read (placed EIO) COUNTS AS READING — the folder is kept and said', !!du.r && !!du.r.kept && du.r.kept.pools === 1 && du.aKept, JSON.stringify(du));
  if (!dirPlant) console.log('  ⊘ SKIP B-e381 (kept) LINKS FOLDER RED — the plant was not in force in its copy');
  else { const dux = dirUnread(DirAM, 'dir-red'); ok('B-e381 (kept) LINKS FOLDER RED — its error read as empty (planted, witnessed): the folder is deleted under links nobody read', !!dux.r && dux.r.cleared === true && !dux.aKept, JSON.stringify(dux)); }
  // THE REFERENCE GATE (lens three): an UNRELATED pool's failure keeps nothing — the folder is wiped, the answer {}; RED: every
  // pool's failure kept it
  const REF = 'if (refs) failed.push({ poolId: pool.id,';
  const REFX = anchored(SRCK, REF, 'failed.push({ poolId: pool.id,', "B-e381 (kept): every pool's failure keeps the folder");
  const refF = copyPath('src/accounts.js', 'e381-kept-ref'); writeCopy(refF, REFX);
  const RefAM = waitEverySave(require(refF).AccountManager);
  const refPlant = !REFX.includes(REF);
  const unrelated = (AM, tag) => {
    const w = world(AM, tag, { extra: true });
    const P2 = w.m.createPool({ name: 'ClKQ', members: [w.B, w.C] }).id; w.m.setPoolTarget(P2, w.C);   // a pool that never named the member
    const heal0 = w.m._healPoolsAfterRemoval.bind(w.m), pm0 = w.m.poolMembers.bind(w.m); let inHeal = false;
    w.m._healPoolsAfterRemoval = (...a) => { inHeal = true; try { return heal0(...a); } finally { inHeal = false; } };
    w.m.poolMembers = (id, ...a) => { if (inHeal && id === P2) throw Object.assign(new Error('placed: an unrelated pool failed'), { code: 'EIO' }); return pm0(id, ...a); };
    let ans = null; try { ans = w.m.remove(w.A); } finally { delete w.m._healPoolsAfterRemoval; delete w.m.poolMembers; }
    return { ans: JSON.stringify(ans ?? null), aWiped: !exists(w.aDir), rows: w.m.keptSignIns().length };
  };
  const ur2 = unrelated(AccountManager, 'unrelated');
  ok('B-e381 (kept): an UNRELATED pool\'s failure (placed) keeps nothing — the member\'s folder is wiped, the answer {}, nothing owed', ur2.ans === '{}' && ur2.aWiped && ur2.rows === 0, JSON.stringify(ur2));
  if (!refPlant) console.log('  ⊘ SKIP B-e381 (kept) REFERENCE RED — the plant was not in force in its copy');
  else { const ur2x = unrelated(RefAM, 'unrelated-red'); ok('B-e381 (kept) REFERENCE RED — every pool\'s failure kept the folder (planted, witnessed): an unrelated pool\'s error keeps it and owes it', ur2x.ans === JSON.stringify({ keptFolder: { pools: 1, codes: ['EIO'] } }) && !ur2x.aWiped && ur2x.rows === 1, JSON.stringify(ur2x)); }
  // THE ROW's ID (law 4, lens three): a row whose id has path parts or a leading dot is refused by name — nothing is touched
  const bad = world(AccountManager, 'badid');
  const badOf = (id) => { bad.m._state.keptSignIns = [{ id, harness: 'claude', since: Date.now(), pools: 1 }]; try { bad.m.retryKeptWipe(id); return null; } catch (e) { return e && e.code; } };
  const badCodes = ['../' + path.basename(bad.aDir), '.hidden', 'a/b'].map(badOf);
  ok('B-e381 (kept): a row whose id has path parts or a leading dot is refused by name (not-kept) — no folder is touched', badCodes.every((c) => c === 'not-kept') && exists(bad.aDir) && exists(bad.bDir), JSON.stringify(badCodes));
  // THE ANSWERS' WORDS, RUN (lens three): the page's keptFolderWords over each answer the door gives (its own text, a stand-in t)
  const KW = new Function('t', fnK + '\n}\nreturn keptFolderWords;')((s, v) => (v ? s.replace(/\{(\w+)\}/g, (m0, k) => (k in v ? v[k] : m0)) : s));
  const words = { cleared: KW({ cleared: true }), gone: KW({ gone: true }), live: KW({ live: true }), keptRead: KW({ kept: { pools: 1, codes: [] } }), keptDel: KW({ kept: { pools: 0, codes: ['EACCES'] } }), unknown: KW({ unknown: true }) };
  ok('B-e381 (kept): the page\'s answers RUN — cleared, already gone, held again, kept because a pool reads it, kept because it could not be deleted (with its code), nothing owed: each its own sentence', /^Cleared/.test(words.cleared) && /already gone/.test(words.gone) && /holds that folder again/.test(words.live) && /a pool still reads/.test(words.keptRead) && /could not be deleted \(EACCES\)/.test(words.keptDel) && /Nothing is owed/.test(words.unknown) && new Set(Object.values(words)).size === 6, JSON.stringify(words));
  // EVERY PAGE TOLD (lens three): the list the push carries holds the row while it is owed, and not once the door cleared it
  const seenRows = [];
  const kc = failedRemoval(AccountManager, 'push', { onChange: (l) => seenRows.push(((l && l.keptSignIns) || []).map((r) => r.id)) });
  const pushedOwed = seenRows.some((x) => x.includes(kc.A));
  const kcr = kc.m.retryKeptWipe(kc.A);
  ok('B-e381 (kept): every page is told — the pushed list holds the owed row, and the push after the door\'s clear holds it no more', pushedOwed && JSON.stringify(kcr) === JSON.stringify({ cleared: true }) && seenRows.length > 0 && !seenRows[seenRows.length - 1].includes(kc.A), JSON.stringify({ pushedOwed, last: seenRows[seenRows.length - 1], kcr }));
  // THE SECOND HARNESS (lens three): a CODEX member's removal keeps its folder (the heal refused), owes it under codex, and the door
  // clears its own Codex folder once the pool moves to the member that stays
  const cxKept = (AM, tag) => {
    const d = e381Tmp('vs-kept-cx-' + tag + '-'); const m = new AM({ dataDir: d });
    const sub = (name) => { const { id } = m.createCodexSubscription({ name }); fs.writeFileSync(path.join(m.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name } })); return id; };
    const A = sub('CxK0'), B = sub('CxK1'), aDir = m.codexSubDir(A), bDir = m.codexSubDir(B), def = path.join(d, 'codex-subs', '');
    const P = m.createPool({ name: 'CxKP', backend: 'codex', members: [A, B] }).id; m.setPoolTarget(P, A);
    const ans = refused(() => m.remove(A));
    const row = m.keptSignIns().find((r) => r.id === A) || null, keptAt = exists(aDir);
    const r = m.retryKeptWipe(A);
    const link = path.join(def, P);
    return { ans: JSON.stringify(ans ?? null), harness: row && row.harness, keptAt, r, aGone: !exists(aDir), bThere: exists(bDir), defB: live(link) && path.basename(fs.readlinkSync(link)) === B };
  };
  const cx = cxKept(AccountManager, 'codex');
  ok('B-e381 (kept): a CODEX member — the removal keeps its folder and owes it under codex; the door moves the pool to the member that stays and clears that Codex folder only', cx.ans === JSON.stringify({ keptFolder: { pools: 1, codes: ['EACCES'] } }) && cx.harness === 'codex' && cx.keptAt && JSON.stringify(cx.r) === JSON.stringify({ cleared: true }) && cx.aGone && cx.bThere && cx.defB, JSON.stringify(cx));
  // THE PERSON's RETRY (主开发 r5296): the removal's route sets retryKept only for a PERSON on this page — the tree's one verdict, as
  // the kept folder's own door asks — so a script's removal (no browser, or any bearer) stays the release's bare removal and never
  // wipes the OTHER owed folders the kept door refuses to that same caller; RED: the option set for every caller (planted, witnessed)
  const ATK = require(path.join(REPO, 'src/routes/account-tails.js'));
  const reqOf = (headers, body = {}) => ({ headers, body, query: {}, socket: {} });
  const RETRY = 'function keptRetryAsked(req) { try { return personVerdict(req).ok === true; } catch { return false; } }';
  const ATSRC = read('src/routes/account-tails.js');
  const RETRYX = anchored(ATSRC, RETRY, 'function keptRetryAsked(req) { return true; }', "B-e381 (kept): the retry set for every caller");   // stale-pins: kept (the red copy: the option set for every caller, planted)
  const atF = copyPath('src/routes/account-tails.js', 'e381-kept-retry'); writeCopy(atF, RETRYX);
  const ATX = require(atF);
  const retryPlant = !RETRYX.includes(RETRY) && typeof ATX.keptRetryAsked === 'function';   // r5135 law 1: the plant's witness
  const asksOf = (A) => ({ person: A.keptRetryAsked(reqOf({ 'sec-fetch-site': 'same-origin' })), script: A.keptRetryAsked(reqOf({})), agent: A.keptRetryAsked(reqOf({ 'sec-fetch-site': 'same-origin', authorization: 'Bearer ' + ['vs', 'st_', 'k'.repeat(12)].join('') })), job: A.keptRetryAsked(reqOf({ 'sec-fetch-site': 'same-origin' }, { token: ['jb', 't_', 'k'.repeat(12)].join('') })), site: A.keptRetryAsked(reqOf({ 'sec-fetch-site': 'cross-site' })) });
  const ak = asksOf(ATK);
  ok('B-e381 (kept) THE PERSON\'s RETRY: the removal\'s route asks the retry of the other owed folders only for a person on this page — a script\'s removal (no browser), an agent\'s or a job\'s sign-in and another site get the bare removal; the route sets the option from this verdict alone', ak.person === true && ak.script === false && ak.agent === false && ak.job === false && ak.site === false && AURK.includes('retryKept: AT.keptRetryAsked(req),'), JSON.stringify(ak));
  if (!retryPlant) console.log('  ⊘ SKIP B-e381 (kept) THE PERSON\'s RETRY RED — the plant was not in force in its copy');
  else { const akx = asksOf(ATX); ok('B-e381 (kept) THE PERSON\'s RETRY RED — the option set for every caller (planted, witnessed): a script\'s and an agent\'s removal ask the retry', akx.script === true && akx.agent === true, JSON.stringify(akx)); }
  // THE PROVIDER, LIVED (主开发 r5296): a pool whose members serve TWO providers; a member removed (the heal refused), the hub
  // restarted (the removal's provider forgotten in memory), the person's retry: the default and a conversation move to the member of
  // the SAME provider, never across; the provider is handed with its label (an unplaced mark says its words, never its raw code).
  // RED: the retry's heal handed no provider (planted, witnessed): they cross to the other provider's member
  const PROV = 'heal = { ...opts, removedProvider: this._providerOfCode(row.provider, row.harness) };';
  const PROVX = anchored(SRCK, PROV, 'heal = { ...opts, removedProvider: null };', "B-e381 (kept): the retry's heal with no provider");   // stale-pins: kept (the red copy: no provider handed, planted)
  const provF = copyPath('src/accounts.js', 'e381-kept-prov'); writeCopy(provF, PROVX);
  const ProvAM = waitEverySave(require(provF).AccountManager);
  const provPlant = !PROVX.includes(PROV);
  const PX = { id: 'pv-kept-x', kind: 'api', label: 'Provider X' }, PY = { id: 'pv-kept-y', kind: 'api', label: 'Provider Y' };   // invented providers
  const lookup = (acct) => (acct && /^ClKy/.test(acct.name || '') ? PY : PX);
  const mixed = async (AM, tag) => {
    const d = e381Tmp('vs-kept-mixed-' + tag + '-');
    const m = new AM({ dataDir: d }); m.setProviderLookup(lookup);
    const sub = (name) => { const a = m.createSubscription({ name }); fs.writeFileSync(path.join(m.subDir(a.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + name, refreshToken: 'fake-rt', expiresAt: Date.now() + 3600e3, scopes: ['user:inference'] } })); return a.id; };
    const A = sub('ClKx0'), B = sub('ClKy1'), C = sub('ClKx2');   // A and C serve provider X, B provider Y
    const P = m.createPool({ name: 'ClKM', members: [A, B, C] }).id; m.setPoolTarget(P, A);
    const link = m.ensureSessionPoolLink(P, 'sess-m', A, { why: 'spawn' });
    await new Promise((r) => setImmediate(r));   // the run's one listing ends: the heal lists the conversation's link
    refused(() => m.remove(A));   // the heal refused: the default and the conversation stay on A, the folder owed
    const m2 = new AM({ dataDir: d }); m2.setProviderLookup(lookup);   // THE RESTART: nothing of the removal is left in memory
    await new Promise((r) => setImmediate(r));
    const r = m2.retryKeptWipe(A);
    const at = (p) => { try { return path.basename(fs.readlinkSync(p)); } catch { return null; } };
    const role = (x) => (x === C ? 'C (X)' : x === B ? 'B (Y)' : x === A ? 'A' : String(x));
    const fp = m2._providerOfCode('pv-claude-subscription', 'claude') || {};
    return { r, def: role(at(path.join(d, 'subs', P))), conv: role(at(link)), labelX: (m2._providerOfCode('pv-kept-x', 'claude') || {}).label || null, labelFp: fp.label || null };
  };
  const mx = await mixed(AccountManager, 'mixed');
  ok('B-e381 (kept) THE PROVIDER, LIVED: two providers in one pool, a member removed, the hub restarted — the person\'s retry moves the default AND the conversation to the member of the SAME provider (C), never across (B); the provider is handed with its label', JSON.stringify(mx.r) === JSON.stringify({ cleared: true }) && mx.def === 'C (X)' && mx.conv === 'C (X)' && mx.labelX === 'Provider X' && typeof mx.labelFp === 'string' && mx.labelFp.length > 0 && mx.labelFp !== 'pv-claude-subscription', JSON.stringify(mx));
  if (!provPlant) console.log('  ⊘ SKIP B-e381 (kept) THE PROVIDER RED — the plant was not in force in its copy');
  else { const mxx = await mixed(ProvAM, 'mixed-red'); ok('B-e381 (kept) THE PROVIDER RED — the retry\'s heal handed no provider (planted, witnessed): the default and the conversation CROSS to the other provider\'s member', mxx.def === 'B (Y)' && mxx.conv === 'B (Y)', JSON.stringify(mxx)); }
  // THE KEEP's JOURNAL WORDS (the round's should): a folder kept because a link still names it or cannot be read says so — never «()»
  const warned = [], warnK = console.warn;
  console.warn = (...a) => { warned.push(a.join(' ')); };
  try { unreadAtRemoval(AccountManager, 'one-rule-words'); } finally { console.warn = warnK; }
  const keptLine = warned.find((l) => /sign-in folder is KEPT/.test(l)) || '';
  ok('B-e381 (kept): the keep\'s journal line names its cause when no code is — «(a link still names it or cannot be read)», never an empty «()»; no account named', /\(a link still names it or cannot be read\)/.test(keptLine) && !/\(\)/.test(keptLine) && !/ClK/.test(keptLine), keptLine);
  // RED — the tip's form: no row is written, so the folder is orphaned (nothing owes it, a restart knows nothing of it), and no door
  if (!tipPlant) console.log('  ⊘ SKIP B-e381 (kept) RED — the tip\'s form was not in force in its copy (the plant\'s witness failed)');
  else {
    const t1 = failedRemoval(TipAM, 'tip');
    const tm2 = new TipAM({ dataDir: t1.d });
    ok('B-e381 (kept) RED — the tip\'s form (planted, witnessed): the folder is KEPT but nothing owes it — no row in the file or after a restart, no door to clear it: an orphan', t1.ans && t1.ans.keptFolder && exists(t1.aDir) && rowsOf(t1.onDisk()).length === 0 && tm2.keptSignIns().length === 0 && typeof tm2.retryKeptWipe !== 'function', JSON.stringify({ ans: t1.ans, aDir: exists(t1.aDir), rows: rowsOf(t1.onDisk()) }));
  }
}

// ── R-tree THE PATCHED COPIES NEVER TOUCH THE TREE ── measured here, while every copy this run made still exists
console.log('\nR-tree the patched copies never touch the tree');
for (const r of copiesCensus(MUTCP.files, MUTCP.dir, REPO, { minCopies: 10 })) ok('R-tree ' + r.name, r.pass, r.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
