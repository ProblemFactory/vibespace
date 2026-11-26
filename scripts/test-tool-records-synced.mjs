#!/usr/bin/env node
// test-tool-records-synced — B-bcb8 unit D, group one (lane bl-scratch, 主开发 r5211 / r5214): A RECORD A NODE TOOL UNDER data/bin
// WRITES IS ON DISK BEFORE ITS NAME POINTS AT IT. FAST: each tool's OWN CODE — its function read out of its text (acorn), run with the
// real file system and a PLACED sync (fs.fsyncSync answering a code, its asks recorded), or the real channels CLI as a child against a
// stand-in server on loopback with its file handle's sync placed by a preload. Every RED is the release's lines in a COPY of the text,
// run the same way: the record takes its name with NO sync asked (the witness that the copy ran: the new bytes landed). No vendor call.
//   ① the OpenCode serve's record (vibespace-opencode-op writeRecord): through the door and through its one-line fallback
//   ② the statusline's slot state (vibespace-usage writeSlotState): a CHANGE synced; an unchanged observation only refreshes (no sync);
//      ②b the real tool as a child over three renders (its own callers), and both callers handing the state read before
//   ③ a design folder's file (vibespace-design writeInside): its own exclusive temp synced; a link planted at the temp's name refused
//   ④ the channels CLI's attachment (the real CLI, a child): its handle synced before its close; a failed sync, nothing kept
import { scratchDir, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const AC = require(path.join(REPO, 'node_modules/acorn'));
const FCm = require(path.join(REPO, 'src/fd-close.js'));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const F = (...a) => new Function(...a);   // eslint-disable-line no-new-func
/** a top-level declaration of a tool's text, by its name (a function, or the const statement that binds it) */
const declOf = (text, name) => {
  const code = String(text).replace(/^#!.*/, '');
  const ast = AC.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration' && st.id && st.id.name === name) return code.slice(st.start, st.end);
    if (st.type === 'VariableDeclaration' && st.declarations.some((d) => d.id.type === 'Identifier' && d.id.name === name)) return code.slice(st.start, st.end);
  }
  return null;
};
/** the tool's one-line fallback, as it runs when no copy of the helper is beside it (FC null) */
const fallbackOf = (text) => { const inl = declOf(text, 'renameSyncedInline'); if (inl) return F('fs', `${inl}\nreturn renameSyncedInline;`)(fs); const d = declOf(text, 'renameSynced'); return d ? F('fs', 'FC', `${d}\nreturn renameSynced;`)(fs, null) : null; };
const errOf = (code) => Object.assign(new Error(`${code}: a placed sync`), { code });
const fdPath = (fd) => { try { return fs.readlinkSync(`/proc/self/fd/${fd}`); } catch { return ''; } };
/** THE PLACED SYNC: fs.fsyncSync records the file it is asked of, and answers `sync` (a code) or does its real work; stderr captured */
const placed = (fn, { sync = null } = {}) => {
  const fsy = fs.fsyncSync, ce = console.error, asked = [], said = [];
  fs.fsyncSync = function (fd) { asked.push(path.basename(fdPath(fd))); if (sync) throw errOf(sync); return fsy.call(this, fd); };
  console.error = (...a) => { said.push(a.join(' ')); };
  try { let r, threw = null; try { r = fn(); } catch (e) { threw = (e && e.code) || String(e); } return { r, threw, asked, said }; } finally { fs.fsyncSync = fsy; console.error = ce; }
};
const OLD = '{"the":"record from before"}';
let k = 0;
const freshDir = (tag) => scratchDir(`tool-records-${tag}-${++k}`);
const tmpLeft = (d) => fs.readdirSync(d).filter((n) => /\.tmp/.test(n));

console.log('① the OpenCode serve\'s record: through the door and its one-line fallback — a placed failed sync a failed write (said), a sync not done said and landed');
const OC = read('data/bin/vibespace-opencode-op');
const ocRun = (text, rs, sync) => {
  const d = freshDir('oc'), rec = path.join(d, 'opencode-serve.json');
  fs.writeFileSync(rec, OLD);
  const code = declOf(text, 'writeRecord');
  const p = placed(() => F('fs', 'BASE', 'RECORD', 'renameSynced', `${code}\nreturn writeRecord;`)(fs, d, rec, rs)({ port: 4096, pid: 77 }), { sync });
  return { ...p, file: fs.readFileSync(rec, 'utf8'), tmp: tmpLeft(d) };
};
{
  const roads = { door: FCm.renameSynced, fallback: fallbackOf(OC) };
  const seen = {};
  for (const [road, rs] of Object.entries(roads)) {
    const good = ocRun(OC, rs, null), eio = ocRun(OC, rs, 'EIO'), inval = ocRun(OC, rs, 'EINVAL');
    seen[road] = { good: good.asked, eio: [eio.file === OLD, eio.tmp, eio.said.length], inval: [inval.file, inval.said] };
    ok(!!rs && good.asked.join() === 'opencode-serve.json.tmp' && JSON.parse(good.file).port === 4096 && good.tmp.length === 0,
      `① ${road}: the record lands after ONE sync asked of its temp (the witness: the sync asked of opencode-serve.json.tmp)`, good);
    ok(eio.asked.join() === 'opencode-serve.json.tmp' && eio.file === OLD && eio.tmp.length === 0 && eio.threw === null && eio.said.length === 1 && /could not be written \(EIO\) — the record from before stands/.test(eio.said[0]),
      `① ${road}: a sync that FAILS (EIO, placed and asked) is a failed write — the record from before byte for byte, the temp gone, said once on stderr (the release swallowed it)`, eio);
    ok(inval.asked.length === 1 && JSON.parse(inval.file).port === 4096 && inval.said.length === 1 && /does not do a sync \(EINVAL\)/.test(inval.said[0]),
      `① ${road}: a sync the file system does not do (EINVAL) is said once and the record lands`, inval);
  }
  // RED: the release's writeRecord (its three lines, in a copy of the text)
  const REL = anchored(OC, `    renameSynced(RECORD + '.tmp', RECORD, JSON.stringify(r), { where: "this machine's OpenCode serve record", say: (l) => console.error(l) });\n`,
    "    const tmp = RECORD + '.tmp';\n    fs.writeFileSync(tmp, JSON.stringify(r));\n    fs.renameSync(tmp, RECORD);         // atomic, like every VibeSpace json write\n", 'the release\'s writeRecord');   // stale-pins: kept (the release's lines, the RED's copy)
  const x = ocRun(REL, FCm.renameSynced, 'EIO');
  ok(x.asked.length === 0 && JSON.parse(x.file).port === 4096, 'RED (the release\'s writeRecord, in a copy): the record replaced with NO sync asked of its temp — the placed failure never reached (the copy ran: its new bytes landed)', x);
}

console.log('② the statusline\'s slot state: a CHANGE of what it holds synced; an unchanged observation only refreshes its time (no sync)');
const US = read('data/bin/vibespace-usage');
const usRun = (text, rs, { prev, next, sync = null, fresh = false }) => {
  const d = freshDir('us'), f = path.join(d, '.slot-c1');
  if (prev) { fs.writeFileSync(f, JSON.stringify(prev)); fs.utimesSync(f, new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3)); }
  const before = prev ? fs.statSync(f).mtimeMs : 0;
  const code = declOf(text, 'writeSlotState');
  const p = placed(() => F('fs', 'path', 'CACHE_DIR', 'SLOT_STATE_MAX', 'renameSynced', `${code}\nreturn writeSlotState;`)(fs, path, d, 200, rs)(f, next, fresh, prev), { sync });
  return { ...p, file: fs.readFileSync(f, 'utf8'), moved: fs.statSync(f).mtimeMs > before, tmp: tmpLeft(d) };
};
{
  const A = { key: 'acct-a', fp: '10/1900000000|3/1900500000', win: { five: 1 }, at: 1 }, A2 = { ...A, at: 2 }, B = { key: 'acct-b', fp: '10/1900000000|3/1900500000', win: { five: 1 }, at: 3 }, Afp = { ...A, fp: '11/1900000000|3/1900500000', at: 4 }, Awin = { ...A, win: { five: 2 }, at: 5 };
  const roads = { door: FCm.renameSynced, fallback: fallbackOf(US) };
  for (const [road, rs] of Object.entries(roads)) {
    const first = usRun(US, rs, { prev: null, next: A, fresh: true }), same = usRun(US, rs, { prev: A, next: A2 }), key = usRun(US, rs, { prev: A, next: B }), fp = usRun(US, rs, { prev: A, next: Afp }), win = usRun(US, rs, { prev: A, next: Awin });
    ok(!!rs && first.asked.join() === '.slot-c1.tmp' && key.asked.join() === '.slot-c1.tmp' && fp.asked.join() === '.slot-c1.tmp' && win.asked.join() === '.slot-c1.tmp' && JSON.parse(key.file).key === 'acct-b' && JSON.parse(fp.file).fp === '11/1900000000|3/1900500000' && JSON.parse(win.file).win.five === 2,
      `② ${road}: what it holds CHANGED (a first state, a new key, a new fingerprint, a new window) takes its name after ONE sync of its temp`, { first: first.asked, key: key.asked, fp: fp.asked, win: win.asked });
    ok(same.asked.length === 0 && JSON.parse(same.file).at === 2 && same.moved && same.tmp.length === 0,
      `② ${road}: an observation that changes none of key, fingerprint, window asks NO sync — it refreshes the file, its time moved (the prune\'s last-seen)`, same);
    const eio = usRun(US, rs, { prev: A, next: B, sync: 'EIO' });
    ok(eio.asked.length === 1 && JSON.parse(eio.file).key === 'acct-a' && eio.tmp.length === 0 && eio.threw === null,
      `② ${road}: a change whose sync FAILS (EIO, placed and asked) leaves the state from before byte for byte, the temp gone (the statusline prints nothing of it)`, eio);
  }
  const TIP2 = `    if (!prev || prev.key !== st.key || percents(prev.fp) !== percents(st.fp) || !same(prev.win, st.win)) renameSynced(f + '.tmp', f, JSON.stringify(st), { where: "the statusline's slot state" });\n    else { fs.writeFileSync(f + '.tmp', JSON.stringify(st)); fs.renameSync(f + '.tmp', f); }   // the time's refresh\n`;
  // RED: the release's write (its two lines, in a copy) — a change replaced with NO sync asked
  const REL = anchored(US, TIP2, "    fs.writeFileSync(f + '.tmp', JSON.stringify(st));\n    fs.renameSync(f + '.tmp', f);\n", 'the release\'s writeSlotState');   // stale-pins: kept (the release's lines, the RED's copy)
  const x = usRun(REL, FCm.renameSynced, { prev: A, next: B, sync: 'EIO' });
  ok(x.asked.length === 0 && JSON.parse(x.file).key === 'acct-b', 'RED (the release\'s write, in a copy): a new key replaces the state with NO sync asked (the copy ran: its new key landed)', x);
  // RED (the rate rule, 主开发 r5214): a copy that syncs at EVERY observation — the unchanged one asks a sync
  const EVERY = anchored(US, TIP2, "    renameSynced(f + '.tmp', f, JSON.stringify(st), { where: \"the statusline's slot state\" });\n", 'a sync at every observation');
  const y = usRun(EVERY, FCm.renameSynced, { prev: A, next: A2 });
  ok(y.asked.join() === '.slot-c1.tmp' && JSON.parse(y.file).at === 2, 'RED (a sync at every observation, in a copy): the unchanged observation asks a sync — the rate rule broken (the copy ran: its refresh landed)', y);
}

  // ②b THE REAL TOOL (a child, its own callers): three statusline renders of one conversation — a first reading, the SAME reading
  // again, a new used percentage. The syncs asked of the slot file's temp are counted by a preload (the witness). RED: a copy whose
  // main caller no longer hands the state read before — every render asks a sync (the rate rule broken at the caller)
  const usageScene = async (cliPath, tag, plan) => {
    const d = freshDir('usage-' + tag), cache = path.join(d, 'cache'), slot = path.join(d, 'pool', 'sub-acct-a'), link = path.join(d, 'link');
    fs.mkdirSync(cache); fs.mkdirSync(slot, { recursive: true }); fs.symlinkSync(slot, link);
    const count = path.join(d, 'syncs.txt'), pre = path.join(d, 'pre.cjs');
    fs.writeFileSync(pre, `const fs = require('fs'), path = require('path'); const fsy = fs.fsyncSync; let n = 0; process.on('exit', () => { const door = Object.keys(require.cache).some((k) => k.endsWith('fd-close.js')) ? 1 : 0; try { fs.appendFileSync(${JSON.stringify(count)}, n + ' ' + door + '\\n'); } catch { } }); fs.fsyncSync = function (fd) { let p = ''; try { p = fs.readlinkSync('/proc/self/fd/' + fd); } catch { } if (path.basename(p).startsWith('.slot-')) n++; return fsy.call(this, fd); };\n`);
    // a reading: `used` the five-hour percentage; `slide` a NOT-STARTED five-hour window (its state not running) whose reset moves
    // with the clock at every render (B-8b12's shape)
    const reading = (used, slide) => ({ session_id: 'conv-1', rate_limits: { five_hour: slide ? { used_percentage: 0, resets_at: 1900000000 + slide, state: 'not_started' } : { used_percentage: used, resets_at: 1900000000 }, seven_day: { used_percentage: 3, resets_at: 1900500000 } } });
    const codes = [];
    const fps = [];
    for (const [used, slide] of plan) {
      codes.push(await new Promise((resolve) => {
        const ch = spawn(process.execPath, ['-r', pre, cliPath], { env: { PATH: process.env.PATH, HOME: d, VIBESPACE_USAGE_CACHE: cache, VIBESPACE_ACCOUNT_LINK: link } });
        const t = setTimeout(() => ch.kill('SIGKILL'), 20000); ch.stdout.resume(); ch.on('close', (code) => { clearTimeout(t); resolve(code); }); ch.stdin.end(JSON.stringify(reading(used, slide)));
      }));
      try { fps.push(JSON.parse(fs.readFileSync(path.join(cache, '.slot-conv-1'), 'utf8')).fp); } catch { fps.push(null); }
    }
    const rows = fs.existsSync(count) ? fs.readFileSync(count, 'utf8').trim().split('\n').map((l) => l.split(' ').map(Number)) : [];
    const syncs = rows.map((r) => r[0]), door = rows.map((r) => r[1]);
    const f = path.join(cache, '.slot-conv-1');
    return { codes, syncs, door, fps, state: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null };
  };
  const READINGS = [[10], [10], [11]], SLIDING = [[0, 1], [0, 2], [0, 3]];
  // BOTH callers hand the state read before (the main one is run above; the shadowed one — a re-point's reading kept on the previous
  // slot — is pinned by its text, every call of the four-argument shape): RED, a copy whose shadowed caller drops it
  const callers = (text) => { const all = [...String(text).matchAll(/writeSlotState\(sf, \{[^}]*\}, [^,()]+(?:, st)?\);/g)].map((m) => m[0]); return { all: all.length, withSt: all.filter((c) => c.endsWith(', st);')).length }; };
  const cs = callers(US), csRed = callers(anchored(US, 'writeSlotState(sf, { key: st.key, fp, win, at: Number(st.at) || Date.now() }, false, st);', 'writeSlotState(sf, { key: st.key, fp, win, at: Number(st.at) || Date.now() }, false);', 'the shadowed caller without the state read before'));   // stale-pins: kept (the release's caller, the RED's copy)
  ok(cs.all === 2 && cs.withSt === 2 && csRed.all === 2 && csRed.withSt === 1, `②b both callers of writeSlotState hand the state read before (${cs.withSt} of ${cs.all}); RED, the shadowed caller without it in a copy: ${csRed.withSt} of ${csRed.all}`, { cs, csRed });
  const real = await usageScene(path.join(REPO, 'data/bin/vibespace-usage'), 'real', READINGS);
  ok(real.codes.every((c) => c === 0) && real.syncs.join() === '1,0,1' && real.door.join() === '1,0,1' && !!real.state && real.state.key === 'sub-acct-a',
    `②b the real tool, its own callers: a first reading synced, the SAME reading again asks NO sync and never looks the door up, a new used percentage synced (syncs per render: ${real.syncs.join(', ')}; the door loaded: ${real.door.join(', ')})`, real);
  const slide = await usageScene(path.join(REPO, 'data/bin/vibespace-usage'), 'slide', SLIDING);
  ok(slide.codes.every((c) => c === 0) && slide.syncs.join() === '1,0,0' && slide.door.join() === '1,0,0',
    `②b a NOT-STARTED window whose reset slides with the clock between renders is no change: the first state synced, then 0 syncs and no door looked up (${slide.syncs.join(', ')})`, slide);
  // THE FINGERPRINT STAYS THE RELEASE's (主开发 r5314): stored after each render in its raw form (each window's own reset, a sliding
  // one included), and the value the lag shadow is handed is that same `fp` — the tool's text pinned at both. RED: 80b493d37's form
  // (the counting windows' resets in the fingerprint itself), in a copy: the stored fingerprint loses the reset
  const RAW = SLIDING.map(([, sl]) => `0/${1900000000 + sl}|3/1900500000`);
  const FP_REL = "function rlFingerprint(rl) {\n  const w = (x) => (x && typeof x === 'object') ? `${x.used_percentage}/${x.resets_at}` : '-';\n  return `${w(rl.five_hour)}|${w(rl.seven_day)}`;\n}";
  ok(slide.fps.join() === RAW.join() && US.includes(FP_REL) && US.includes('const fp = rlFingerprint(rl);') && /readingWindow: win, readingFingerprint: fp, prevFingerprint: st\.fp \|\| null,/.test(US),
    `②b the fingerprint is the RELEASE's: stored raw after each render (${slide.fps.join(' · ')}), its function the release's text, and the lag shadow handed that same fp`, { fps: slide.fps });
  {
    const d = freshDir('usage-red-counting'), cli = path.join(d, 'vibespace-usage');
    const FP_80B = "function rlFingerprint(rl) {\n  const counting = windowOf(rl);\n  const w = (x, reset) => (x && typeof x === 'object') ? `${x.used_percentage}/${reset || '-'}` : '-';\n  return `${w(rl.five_hour, counting.fiveHour)}|${w(rl.seven_day, counting.sevenDay)}`;\n}";
    fs.writeFileSync(cli, anchored(US, FP_REL, FP_80B, '80b493d37\'s counting fingerprint'));
    fs.copyFileSync(path.join(REPO, 'src/fd-close.js'), path.join(d, 'fd-close.js'));
    const x = await usageScene(cli, 'red-counting', SLIDING);
    ok(x.fps.every((v) => v === '0/-|3/1900500000') && x.fps.join() !== RAW.join(), `RED (80b493d37's counting fingerprint, in a copy): the stored fingerprint loses the reset (${x.fps.join(' · ')}) — what the shadow reads would change`, x);
  }
  {
    const d = freshDir('usage-red-raw'), cli = path.join(d, 'vibespace-usage');
    fs.writeFileSync(cli, anchored(US, "percents(prev.fp) !== percents(st.fp)", "!same(prev.fp, st.fp)", 'a changed test that reads the whole fingerprint'));
    fs.copyFileSync(path.join(REPO, 'src/fd-close.js'), path.join(d, 'fd-close.js'));
    const x = await usageScene(cli, 'red-raw', SLIDING);
    ok(x.syncs.join() === '1,1,1' && !!x.state, `RED (a changed test that reads the whole fingerprint, in a copy): the sliding reset makes every render a change — a sync each (${x.syncs.join(', ')}); the copy ran: its state landed`, x);
  }
  {
    const d = freshDir('usage-red-bin'), cli = path.join(d, 'vibespace-usage');
    fs.writeFileSync(cli, anchored(US, 'writeSlotState(sf, { key, fp, win, at: Date.now() }, !st, st);', 'writeSlotState(sf, { key, fp, win, at: Date.now() }, !st);', 'the main caller without the state read before'));   // stale-pins: kept (the release's lines, the RED's copy)
    fs.copyFileSync(path.join(REPO, 'src/fd-close.js'), path.join(d, 'fd-close.js'));
    const x = await usageScene(cli, 'red', READINGS);
    ok(x.syncs.join() === '1,1,1' && !!x.state && x.state.key === 'sub-acct-a', `RED (the main caller without the state read before, in a copy): every render asks a sync (${x.syncs.join(', ')}) — the copy ran: its state landed`, x);
  }

console.log('③ a design folder\'s file: its own exclusive temp synced before the rename; a link planted at the temp\'s name refused');
const DS = read('data/bin/vibespace-design');
const dsRun = (text, FC, sync, { plant = false } = {}) => {
  const d = freshDir('ds'), fp = path.join(d, 'design.json'), outside = path.join(freshDir('ds-out'), 'elsewhere.txt');
  fs.writeFileSync(fp, OLD); fs.writeFileSync(outside, 'not the design folder\'s');
  if (plant) fs.symlinkSync(outside, path.join(d, `.design.json.tmp-${process.pid}`));
  const helpers = `${declOf(text, 'NOT_SYNCED')}\n${declOf(text, 'notSyncedWords')}\n${declOf(text, 'writeInside')}\nreturn writeInside;`;
  const die = (m) => { throw Object.assign(new Error(m), { code: 'DIE' }); };
  const p = placed(() => F('fs', 'path', 'die', 'FC', helpers)(fs, path, die, FC)(d, 'design.json', '{"title":"new"}'), { sync });
  return { ...p, file: fs.readFileSync(fp, 'utf8'), outside: fs.readFileSync(outside, 'utf8'), tmp: tmpLeft(d).filter((n) => !plant || !fs.lstatSync(path.join(d, n)).isSymbolicLink()) };
};
{
  for (const [road, FC] of Object.entries({ 'the helper\'s codes': FCm, 'the inline codes': null })) {
    const good = dsRun(DS, FC, null), eio = dsRun(DS, FC, 'EIO'), inval = dsRun(DS, FC, 'EINVAL'), link = dsRun(DS, FC, null, { plant: true });
    ok(good.asked.join() === `.design.json.tmp-${process.pid}` && good.file === '{"title":"new"}' && good.tmp.length === 0,
      `③ ${road}: the file lands after ONE sync asked of its own temp (the witness: the sync asked of .design.json.tmp-<pid>)`, good);
    ok(eio.threw === 'EIO' && eio.file === OLD && eio.tmp.length === 0, `③ ${road}: a sync that FAILS (EIO, placed) is a failed write — thrown, the file as it was, the temp gone`, eio);
    ok(inval.threw === null && inval.file === '{"title":"new"}' && inval.said.length === 1 && /design file design\.json: its file system does not do a sync \(EINVAL\)/.test(inval.said[0]),
      `③ ${road}: a sync the file system does not do (EINVAL) is said once and the file lands`, inval);
    ok(link.threw === 'EEXIST' && link.asked.length === 0 && link.outside === 'not the design folder\'s' && link.file === OLD,
      `③ ${road}: a link planted at the temp's name is refused (the exclusive create) — nothing written through it, the file as it was`, link);
  }
  const TIP3 = declOf(DS, 'writeInside');
  const body = TIP3.slice(TIP3.indexOf('  const fd = fs.openSync(tmp, \'wx\', 0o666);'), TIP3.indexOf('  fs.renameSync(tmp, fp);'));
  const REL = anchored(DS, body, "  fs.writeFileSync(tmp, text, { flag: 'wx' });\n", 'the release\'s writeInside');   // stale-pins: kept (the release's lines, the RED's copy)
  const x = dsRun(REL, FCm, 'EIO');
  ok(x.asked.length === 0 && x.file === '{"title":"new"}', 'RED (the release\'s writeInside, in a copy): the file replaced with NO sync asked of its temp (the copy ran: its new bytes landed)', x);
}

console.log('④ the channels CLI\'s attachment (the real CLI, a child): its handle synced before its close — a failed sync, nothing kept');
const cliScene = async (cliPath, tag, placeSync) => {
  const d = freshDir('cli-' + tag); const out = path.join(d, 'got.bin'), count = path.join(d, 'syncs.txt'), pre = path.join(d, 'pre.cjs');
  fs.writeFileSync(pre, `const fs = require('fs'); const fsp = fs.promises; const open = fsp.open; let n = 0; process.on('exit', () => { try { fs.writeFileSync(${JSON.stringify(count)}, String(n)); } catch { } });
fsp.open = async (...a) => { const h = await open.apply(fsp, a); if (String(a[0]).includes('.vibespace-attachment-')) { const s = h.sync.bind(h); h.sync = async () => { n++; ${placeSync ? `throw Object.assign(new Error('${placeSync}: a placed sync'), { code: '${placeSync}' });` : 'return s();'} }; } return h; };\n`);
  const body = Buffer.from('attachment bytes\n');
  const srv = http.createServer((req, res) => { req.resume(); res.writeHead(200, { 'content-length': body.length, 'x-vibespace-attachment': encodeURIComponent(JSON.stringify({ mime: 'application/octet-stream', from: 'a stand-in', conversation: { title: 'a stand-in' } })) }); res.end(body); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const env = { PATH: process.env.PATH, HOME: d, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vst_x' };
  const r = await new Promise((resolve) => {
    const ch = spawn(process.execPath, ['-r', pre, cliPath, 'attachment', 'acc/c1', 'm1', 'a1', '--out', out], { env }); let err = '';
    const t = setTimeout(() => { ch.kill('SIGKILL'); }, 30000);
    ch.stderr.on('data', (x) => { err += x; }); ch.on('close', (code) => { clearTimeout(t); resolve({ code, err }); });
  });
  srv.close();
  let syncs = -1; try { syncs = Number(fs.readFileSync(count, 'utf8')); } catch { }
  return { code: r.code, syncs, kept: fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null, parts: fs.readdirSync(d).filter((n) => n.endsWith('.part')), err: r.err.slice(0, 400) };
};
{
  const CLI = path.join(REPO, 'data/bin/vibespace-channels');
  const good = await cliScene(CLI, 'good', null), eio = await cliScene(CLI, 'eio', 'EIO'), inval = await cliScene(CLI, 'inval', 'EINVAL');
  ok(good.code === 0 && good.syncs === 1 && good.kept === 'attachment bytes\n', '④ the attachment lands after ONE sync of its handle (the witness: the preload counted the sync asked)', good);
  ok(eio.code === 1 && eio.syncs === 1 && eio.kept === null && eio.parts.length === 0 && /could not be put on disk \(EIO\) — nothing kept/.test(eio.err),
    '④ a sync that FAILS (EIO, placed and asked) is a failed fetch — exit 1, nothing kept, the part removed, said', eio);
  ok(inval.code === 0 && inval.syncs === 1 && inval.kept === 'attachment bytes\n' && /does not do a sync \(EINVAL\)/.test(inval.err), '④ a sync the file system does not do (EINVAL) is said once and the attachment lands', inval);
  // RED: the release's order (no sync before the close), in a copy beside its helpers
  const d = freshDir('cli-red-bin'); const cli = path.join(d, 'vibespace-channels');
  const T = read('data/bin/vibespace-channels');
  const block = T.slice(T.indexOf('      // B-bcb8 unit D (主开发 r5211 / r5214): the bytes are ON DISK before the name points at them'), T.indexOf('      { const saving = fh; fh = null; await saving.close(); }'));
  fs.writeFileSync(cli, anchored(T, block, '', 'the release\'s attachment (no sync)'));
  for (const [from, to] of [['src/cli-call.js', 'cli-call.js'], ['src/agent-cli-text.js', 'agent-cli-text.js'], ['src/fd-close.js', 'fd-close.js']]) fs.copyFileSync(path.join(REPO, from), path.join(d, to));
  const x = await cliScene(cli, 'red', 'EIO');
  ok(x.code === 0 && x.syncs === 0 && x.kept === 'attachment bytes\n', 'RED (the release\'s attachment, in a copy): it takes its name with NO sync of its handle — the placed failure never reached (the copy ran: the bytes landed)', x);
}

report();
