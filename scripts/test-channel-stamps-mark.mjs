#!/usr/bin/env node
// test-channel-stamps-mark — B-360d (主开发 r4666 (2), lane bl-mail): THE REMOVAL's ROW FOR ITS POLL TIMES. A purge whose stamps answer is
// not «landed» notes «stamps» on the account's entry in purge-pending.json (the panel lists it with its Try again); ONLY the landing of
// a compaction made after that purge's ask ends the note; the note is read back at a start, so the promise holds across a restart.
// LAW (a): at a start NOTHING drops a stamp because its row or its account is missing or unread — only the names an entry notes owed;
// a held (torn) mark drops nothing. LAW (b): Try again stays the person's press (the route, unchanged); no timer of this unit's.
// FAST, in process — the real channel store; a stand-in store-writer thread (scripts/fixtures/store-stand-writer.cjs) that fails a
// file's write on demand; every wait is on a FACT (the mark's list, the writer's counts, a landing), bounded by BOUND_MS with a named
// HARNESS line at its expiry.
//   (m10a) the stamps write fails at the purge: the entry notes «stamps» (on disk too) and the list shows it; after the storage heals a
//          «Try again» (the store's purge again) answers true and its landing ends the row. CONTROL: a landing that does not end the
//          note — the row stays — red.
//   (m10b) a restart before the landing (the first life killed: no close): the start reads the note, the account's keys leave memory and
//          the compaction is asked at once; it lands with none of the names, the row ends. CONTROL: a start that ignores the note —
//          the names stay on disk and the row stays — red.
//   (m10c) LAW (a): a start over an account with no record and no entry keeps every stamp of it (nothing asked), and a torn mark drops
//          nothing. CONTROL: a start that drops the stamps of an account with no record — red.
//   (m10d) (r4699) an entry whose account was ADDED AGAIN under the same id between the purge and the start: not purged a second time —
//          its new stamps stand, nothing asked. CONTROL: a start blind to the account's record — red.
//   (m10e) r4995 M1: the accounts' records UNREAD at the start (a PLACED refusal of the read) with an entry noting the fetch times; the
//          records' hold lifts during the run; «Try again» lands and the row ENDS. CONTROL: the tip f26f47203's purge (its ask not
//          recorded for a note that came from disk) — the row stands — red.
//   (m10f) r4995 M2: the records UNREAD at the start (placed, not lifted) with an entry noting a LIVE account's id: every stamp kept,
//          nothing asked on the file, no row listed. CONTROL: the guard cut (an anchored edit) — the live account's stamps dropped.
//   (m10g) r4995 M2 + the small one: the fetch times' OWN file unread at the start (placed): nothing asked on it; the row says the held
//          family's sentence (stampsHeld) and the press answers it, never «erased at the next write». CONTROL: the guard cut — red.
//   (m10h) the page's words pinned: the stamps-only, the held and the mixed rows; purgeLeftText names the kind.
//   The mark's law «nothing removes an account's data at a start or on a timer» (test-channel-store-forget) has
//   the ONE named exception (r4666 (2)): the poll times an entry notes owed («stamps») leave at a start, by its names only.
// Run: node scripts/test-channel-stamps-mark.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import Module from 'node:module';
import './scratch.mjs';   // the build's §113 order: the scratch home first, after node's own
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));

let pass = 0, fail = 0;
const T0 = performance.now(), at = () => `[${((performance.now() - T0) / 1000).toFixed(1)} s]`;   // each leg's place in the suite's time (printed, never judged)
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call'); if (c) { pass++; console.log('  ✓ ' + n + ' ' + at()); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const ROOT = scratch('test-channel-stamps-mark');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(path.join(ROOT, 'stand'));
const STAND = SAND.path, failOn = SAND.failOn;
const DEB = 25;                      // the stamps' debounce every store here states (the hub's: the writer's 0.5 s)
const PACED = { floorMs: DEB };    // the writers' gap floor here (the hub's: store-pace's MIN_GAP_FLOOR_MS)
const ONE_PACE_MS = DEB * 6;         // one debounce + one gap of this suite's stated pace, with slack: a paced ask is due within it
console.log('(m10) B-360d: the removal\'s row for its poll times — noted, ended only by a landing, read back at a start');
{
  const CS_FILE = path.join(REPO, 'src/channel-store.js');
  const SRC = fs.readFileSync(CS_FILE, 'utf8');
  const loadCut = (cut) => {
    if (!cut) return CS;
    const cuts = Array.isArray(cut[0]) ? cut : [cut];
    let src = SRC;
    for (const c of cuts) { if (src.split(c[0]).length !== 2) throw new Error(`(m) a CONTROL's anchor is not in src/channel-store.js once: ${c[0].slice(0, 90)}`); src = src.replace(c[0], c[1]); }
    const m = new Module(CS_FILE, null); m.filename = CS_FILE; m.paths = Module._nodeModulePaths(path.dirname(CS_FILE)); m._compile(src, CS_FILE); return m.exports;
  };
  const T = Date.UTC(2026, 10, 21, 6, 0, 0);
  const BOUND_MS = 10000, START_BOUND_MS = DEB * 40;   // a fact not seen within BOUND_MS is a HARNESS line; a start's compaction lands within forty stated paces
  const text = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const settle = async (w, st, ms = 4000) => { const end = performance.now() + ms; while (performance.now() < end && w.pending(st.stamps.file)) await sleep(25); };
  const until = async (fact, ms = BOUND_MS) => { const end = performance.now() + ms; while (!fact() && performance.now() < end) await sleep(DEB); return !!fact(); };
  const listed = (st) => (st.pendingList() || []).find((x) => x.id === 'gone') || null;
  const markOnDisk = (dir) => { try { const v = JSON.parse(text(path.join(dir, 'purge-pending.json'))); return (v && v.ids && v.ids.gone) || null; } catch { return null; } };
  const names = (st) => ({ inSide: text(st.stamps.file).includes('"gone/'), inJournal: text(st.stamps.log).includes('"gone/'), keepOnDisk: text(st.stamps.file).includes('"keep/k3"') });
  // a first life: both accounts' rows and stamps, closed — the side file is THERE at the next start (no own-only life: the stand-in
  // thread hands no own numbers to a restarted one)
  const seed = async (dir) => {
    const w0 = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const s0 = CS.createChannelStore({ dir, log: quiet, writer: w0, stampsDebounceMs: DEB });
    await s0.index.update(() => { for (let i = 0; i < 30; i++) { s0.index.entry('gone', `g${i}`, { create: true }); s0.index.entry('keep', `k${i}`, { create: true }); } });
    for (let i = 0; i < 30; i++) { s0.stamps.set(`gone/g${i}`, { lastPollAt: T + i }); s0.stamps.set(`keep/k${i}`, { lastPollAt: T + i }); }
    s0.close(); w0.stop();
  };
  // the removal's own road on the store: the mark first, the rows out, the purge (its stamps' write FAILS — placed)
  const removeFailing = async (st, w) => {
    await st.purgeBegin('gone', { service: 'Gmail', label: 'work' });
    await st.index.update((ix) => { for (const k of Object.keys(ix.conversations)) if (k.startsWith('gone/')) delete ix.conversations[k]; }, { durable: true });
    failOn('poll-stamps.json', true);
    const pr = await st.purgeAccount('gone');
    const answer = await Promise.race([pr.stamps, sleep(BOUND_MS).then(() => 'timeout')]);
    const noted = await until(() => { const l = listed(st); return !!(l && l.left && l.left.includes('stamps')); });
    const notedOnDisk = await until(() => { const m = markOnDisk(st.dir); return !!(m && Array.isArray(m.left) && m.left.includes('stamps')); });
    return { answer, noted, notedOnDisk, left: (listed(st) || {}).left || null };
  };

  // (m10a) the note, and «Try again» after the heal ends it by its landing
  const NOLANDCLEAR = ['    stampsMarkLanded();   // r4666 (2)', '    // r4666 (2)'];
  const noteRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    await seed(dir);
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });
    let r = null;
    try {
      const a = await removeFailing(st, w);
      if (!a.noted) console.error(`  HARNESS (m10a ${tag}): the entry never noted «stamps» within ${BOUND_MS} ms`);
      failOn('poll-stamps.json', false);   // the storage heals
      const again = await st.purgeAccount('gone');   // the person's «Try again» reaches the store's purge again
      const againStamps = await Promise.race([again.stamps, sleep(BOUND_MS).then(() => 'timeout')]);
      const ended = await until(() => !listed(st) && !markOnDisk(dir), ONE_PACE_MS * 4);
      await settle(w, st);
      r = { ...a, againStamps, ended, listedAfter: listed(st), ...names(st) };
    } finally { failOn('poll-stamps.json', false); }
    w.stop();
    return r;
  };
  const na = await noteRun('note', null);
  ok(na.answer === false && na.noted && na.notedOnDisk && na.againStamps === true && na.ended && !na.inSide && !na.inJournal && na.keepOnDisk,
    `(m10a) THE ROW: the purge's stamps answered ${na.answer} (its write failed), the entry noted «stamps» in memory and on disk (${na.noted}, ${na.notedOnDisk}; left ${JSON.stringify(na.left)}); after the heal «Try again» answered ${na.againStamps} and its landing ended the row (${na.ended}) — no name in the side file or the journal`, na);
  const nac = await noteRun('note-c', NOLANDCLEAR);
  ok(nac.noted && nac.againStamps === true && !nac.ended && !!nac.listedAfter, `(m10a) CONTROL: a landing that does not end the note — the row stays after the names left the disk (${JSON.stringify(nac.listedAfter && nac.listedAfter.left)}) — red`, nac);

  // (m10b) a restart before the landing: the start reads the note
  const NOSTARTREAD = ['      const ask = stampsAskPurge();\n      for (const id of owed) stampsMarked.set(id, ask);', '      const ask = 0;'];
  const restartRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    await seed(dir);
    let r = null;
    try {
      { const w1 = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
        const s1 = CS.createChannelStore({ dir, log: quiet, writer: w1, stampsDebounceMs: DEB });
        const a = await removeFailing(s1, w1);
        r = { first: a };
        w1.stop();   // the KILL: no close — the side file and the journal on disk still hold the names
      }
      failOn('poll-stamps.json', false);
      const before = text(path.join(dir, 'poll-stamps.json')).includes('"gone/');
      const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
      const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });   // the START
      const listedAtStart = !!listed(st), askedAtOpen = w.pending(st.stamps.file);   // the start's ask is synchronous at the open
      const landed = await until(() => st.stamps.stats().compactions >= 1, START_BOUND_MS);
      const ended = await until(() => !listed(st) && !markOnDisk(dir), ONE_PACE_MS * 4);
      await settle(w, st);
      r = { ...r, before, listedAtStart, askedAtOpen, landed, ended, listedAfter: listed(st), ...names(st) };
      w.stop();
    } finally { failOn('poll-stamps.json', false); }
    return r;
  };
  const rs = await restartRun('restart', null);
  ok(rs.first.noted && rs.before && rs.listedAtStart && rs.landed && rs.ended && !rs.inSide && !rs.inJournal && rs.keepOnDisk,
    `(m10b) A RESTART BEFORE THE LANDING: the first life noted «stamps» (${rs.first.noted}) and was killed with the names on disk (${rs.before}); the start listed the row (${rs.listedAtStart}), asked the compaction at once and it landed (${rs.landed}) — no name in the side file (${rs.inSide}) or the journal (${rs.inJournal}), the other account kept; the row ended (${rs.ended})`, rs);
  const rsc = await restartRun('restart-c', NOSTARTREAD);
  ok(rsc.first.noted && !rsc.askedAtOpen && rsc.inSide && !!rsc.listedAfter, `(m10b) CONTROL: a start that ignores the note — nothing asked at the open (${rsc.askedAtOpen}), the names stay on disk (${rsc.inSide}) and the row stays — red`, rsc);

  // (m10c) LAW (a): a start drops nothing by a missing record or row; a torn mark drops nothing
  const DROPBYRECORD = ['    const owed = noted.filter((id) => !hasRecord(id));', "    const owed = [...new Set([...stampMap.keys()].map((k) => String(k).split('/')[0]))].filter((id) => !hasRecord(id));"];
  const lawRun = async (tag, cut, { torn = false } = {}) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    await seed(dir);   // 'gone' and 'keep': no account record for either, no entry for either
    if (torn) fs.writeFileSync(path.join(dir, 'purge-pending.json'), '{"v":1,"ids":{"gone":{"left":["stamps"');   // a mark cut short
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });
    const kept = [...Array(30).keys()].filter((i) => (st.stamps.get(`gone/g${i}`) || {}).lastPollAt === T + i).length;
    const asked = await until(() => w.pending(st.stamps.file) || st.stamps.stats().compactions > 0, ONE_PACE_MS);
    const r = { kept, asked };
    w.stop();
    return r;
  };
  const lw = await lawRun('law', null), lt = await lawRun('law-torn', null, { torn: true });
  ok(lw.kept === 30 && !lw.asked && lt.kept === 30 && !lt.asked, `(m10c) LAW (a): a start over an account with no record and no entry kept ${lw.kept} of its 30 stamps and asked nothing (${lw.asked}); over a torn mark ${lt.kept} of 30, nothing asked (${lt.asked})`, { lw, lt });
  const lwc = await lawRun('law-c', DROPBYRECORD);
  ok(lwc.kept < 30, `(m10c) CONTROL: a start that drops the stamps of an account with no record — ${lwc.kept} of 30 kept — red`, lwc);

  // r4995: THE PLACED REFUSAL of a read call (fs.readFileSync answers EIO for the named file while `refuseRead` says so)
  let refuseRead = null;
  const origRFS = fs.readFileSync;
  fs.readFileSync = function (f, ...a) { if (refuseRead && refuseRead(String(f))) throw Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' }); return origRFS.call(this, f, ...a); };
  const noteFile = (dir, live = false) => {
    fs.writeFileSync(path.join(dir, 'purge-pending.json'), JSON.stringify({ v: 1, ids: { gone: { at: T, left: ['stamps'], codes: { stamps: 'owed' }, name: { service: 'Gmail', label: 'work' } } } }));
    if (live) fs.writeFileSync(path.join(dir, 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'gone', kind: 'gmail', label: 'Mail', enabled: true }] }));
  };
  const openRefused = (M, dir, refuse, o = {}) => { const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED }); refuseRead = refuse; try { return { w, st: M.createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB, ...o }) }; } finally { refuseRead = null; } };
  const isAdapters = (f) => path.basename(f) === 'adapters.json', isSide = (f) => path.basename(f) === 'poll-stamps.json';

  // (m10e) r4995 M1: a note from disk, the records' hold lifted during the run, Try again ends the row
  const NOASKRECORD = ['    if (notedNow && (purgedStamps || stampsOnDisk)) stampsMarked.set(adapterId, Math.max(stampsMarked.get(adapterId) || 0, stampsAskOf));\n', ''];
  const liftRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    await seed(dir); noteFile(dir);
    fs.writeFileSync(path.join(dir, 'adapters.json'), JSON.stringify({ v: 1, adapters: [] }));   // the records are THERE (no record for 'gone'): unread only at this start — a file not there would stay held (a start judges absence)
    const { w, st } = openRefused(loadCut(cut), dir, isAdapters, { heldRetry: { firstMs: DEB, maxMs: DEB * 2 } });
    const listedHeld = !!listed(st);
    const lifted = await until(() => !!listed(st));   // the records' hold reads again on its own ladder: the row is listed
    const again = await st.purgeAccount('gone');
    const answer = await Promise.race([again.stamps, sleep(BOUND_MS).then(() => 'timeout')]);
    const ended = await until(() => !listed(st) && !markOnDisk(dir), ONE_PACE_MS * 4);
    await settle(w, st);
    const r = { listedHeld, lifted, answer, ended, listedAfter: listed(st), ...names(st) };
    w.stop();
    return r;
  };
  const le = await liftRun('lift', null);
  ok(!le.listedHeld && le.lifted && le.answer === true && le.ended && !le.inSide, `(m10e) M1: the records unread at the start (no row then: ${le.listedHeld}), their hold lifted (the row listed: ${le.lifted}); «Try again» answered ${le.answer} and its landing ENDED the row (${le.ended}) — no name on disk`, le);
  const lec = await liftRun('lift-c', NOASKRECORD);
  ok(lec.lifted && lec.answer === true && !lec.ended && !!lec.listedAfter, `(m10e) CONTROL: the tip's purge, its ask not recorded for a note from disk — the erasure landed and the row STANDS (${JSON.stringify(lec.listedAfter && lec.listedAfter.left)}) — red`, lec);

  // (m10f) r4995 M2: the records unread at the start — a LIVE account under a noted id loses nothing
  const NORECORDSGUARD = ['    if (noted.length && !recordsReadNow) warn(', '    if (false) warn('];   // the ONE guard of the records read, cut
  const unreadRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    await seed(dir); noteFile(dir, true);   // 'gone' is a LIVE account's id (its record is on disk) — unread at this start
    const { w, st } = openRefused(loadCut(cut), dir, isAdapters);   // no heldRetry: the hold stays for the check
    const kept = [...Array(30).keys()].filter((i) => (st.stamps.get(`gone/g${i}`) || {}).lastPollAt === T + i).length;
    const r = { kept, pending: w.pending(st.stamps.file), listed: !!listed(st) };
    w.stop();
    return r;
  };
  const ur = await unreadRun('unread', null);
  ok(ur.kept === 30 && !ur.pending && !ur.listed, `(m10f) M2: the accounts' records UNREAD at the start (a placed refusal) with an entry noting a live account's id — ${ur.kept} of its 30 stamps kept, nothing asked on the file (${ur.pending}), no row listed (${ur.listed})`, ur);
  const urc = await unreadRun('unread-c', NORECORDSGUARD);
  ok(urc.kept < 30, `(m10f) CONTROL: the records' guard cut — the live account's stamps dropped (${urc.kept} of 30 kept) — red`, urc);

  // (m10g) r4995 M2 + the small one: the fetch times' own file unread at the start
  const NOHELDGUARD = ['    else if (owed.length && (psLoad.blocked || ixLoad.blocked)) warn(', '    else if (false) warn('];
  const heldSideRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    await seed(dir); noteFile(dir);
    const sideBefore = fs.readFileSync(path.join(dir, 'poll-stamps.json'), 'utf8');
    const { w, st } = openRefused(loadCut(cut), dir, isSide);
    const pending = w.pending(st.stamps.file), row = listed(st);
    const again = await st.purgeAccount('gone');
    const answer = await Promise.race([again.stamps, sleep(BOUND_MS).then(() => 'timeout')]);
    await sleep(ONE_PACE_MS);
    const r = { pending, rowHeld: !!(row && row.stampsHeld), pressHeld: !!again.stampsHeld, answer, sideSame: fs.readFileSync(path.join(dir, 'poll-stamps.json'), 'utf8') === sideBefore };
    w.stop();
    return r;
  };
  const hs = await heldSideRun('heldside', null);
  ok(!hs.pending && hs.rowHeld && hs.pressHeld && hs.answer === false && hs.sideSame, `(m10g) the fetch times' OWN file unread at the start: nothing asked on it (${hs.pending}), the row carries the held family's sentence (${hs.rowHeld}), the press answers it (${hs.pressHeld}, stamps ${hs.answer}) — the file untouched`, hs);
  const hsc = await heldSideRun('heldside-c', NOHELDGUARD);
  ok(hsc.pending, `(m10g) CONTROL: the held family's guard cut — the start asks a compaction on a file it could not read (${hsc.pending}) — red`, hsc);

  // (m10h) the page's words, pinned
  { const PANEL = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf8'), DLG = fs.readFileSync(path.join(REPO, 'src/lib/channel-account-dialogs.js'), 'utf8');
    const ZH = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
    const K1 = "The removed account {name}: its conversations' fetch times are not erased from disk yet — Try again asks for it now";
    const K2 = "The removed account {name}: its conversations' fetch times are not erased from disk yet — their file could not be read at this start; they are erased after the next start that reads it";
    const pin = (p, d) => p.includes(`t("${K1}"`) && p.includes(`t("${K2}"`) && p.includes("owesStamps && Array.isArray(folders) && !folders.length ? stampsWords : owesStamps ? foldersWords + ' ' + stampsWords : foldersWords") && p.includes('else if (r.done && r.stampsHeld) showToast(') && /stamps: tr\("its conversations' fetch times"\)/.test(d) && [ZH, JA].every((x) => x.includes(JSON.stringify(K1) + ':') && x.includes(JSON.stringify(K2) + ':'));
    ok(pin(PANEL, DLG), '(m10h) the page: the stamps-only row, the held row and the mixed row (the folders\' sentence names the folders only, the fetch times\' sentence beside it); the press\'s held answer; purgeLeftText names the kind; zh and ja carry both sentences');
    ok(!pin(PANEL.replace('else if (r.done && r.stampsHeld) showToast(', 'else if (false) showToast('), DLG), '(m10h) CONTROL: the press without the held family\'s sentence — the pin above would go red');
  }

  // (m10d) r4699: an account added AGAIN under the id between the purge and the start keeps its new stamps
  const NORECORDCHECK = ['    const owed = noted.filter((id) => !hasRecord(id));', '    const owed = noted;'];
  const readdRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    await seed(dir);   // the account under the id 'gone' as it is NOW (added again): its rows and its new stamps
    // what the start finds: the entry its purge noted owing the poll times, and the record of the account added again under the id
    fs.writeFileSync(path.join(dir, 'purge-pending.json'), JSON.stringify({ v: 1, ids: { gone: { at: T, left: ['stamps'], codes: { stamps: 'owed' }, name: { service: 'Gmail', label: 'work' } } } }));
    fs.writeFileSync(path.join(dir, 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'gone', kind: 'gmail', label: 'Mail', enabled: true }] }));
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });
    const kept = [...Array(30).keys()].filter((i) => (st.stamps.get(`gone/g${i}`) || {}).lastPollAt === T + i).length;
    const asked = await until(() => w.pending(st.stamps.file) || st.stamps.stats().compactions > 0, ONE_PACE_MS);
    const r = { kept, asked };
    w.stop();
    return r;
  };
  const ra = await readdRun('readd', null);
  ok(ra.kept === 30 && !ra.asked, `(m10d) AN ACCOUNT ADDED AGAIN under the id between its purge and the start: not purged a second time — ${ra.kept} of its 30 new stamps kept, nothing asked (${ra.asked})`, ra);
  const rac = await readdRun('readd-c', NORECORDCHECK);
  ok(rac.kept < 30, `(m10d) CONTROL: a start blind to the account's record — ${rac.kept} of 30 new stamps kept — red`, rac);
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
