#!/usr/bin/env node
// THE DEVICE AGENT's OWN WRITES TAKE THEIR NAME ONLY AFTER ONE SYNC (row B-93e7, 主开发 r4381 / r4387, lane bl-machines-b). Before:
// 16 places of the agent on a paired machine wrote its own state by a temp and a rename with no sync, and its bundle took its name
// unsynced before `current` pointed at it: after a power cut the agent could come back unable to dial or to start. Now ONE door
// (src/agentd/durable-file.js, a device input) for every record, and the bundle's landing syncs in landBundle. Stand-ins only: a
// scratch root and home of this suite's own, refusals PLACED at the sync call (never a real full disk or a real mount).
//   ① the door's ORDER (a stale temp removed → opened exclusive at its mode → written whole → ONE sync → closed → renamed), the
//      mode kept. RED: a copy of the door with its sync cut
//   ② a RECORD's refused sync (placed EIO, then ENOTSUP): SAID once in the given log and the record still lands; a sync that answers
//      again re-arms the words; a write that fails throws, its temp gone and the record as it was
//   ③ the refusal's two classes (PURE): «failed» (the bytes may not be on disk) and «not offered» (the file system has no sync)
//   ④ self-retire's hook rewrite and ⑤ the mac helper's state — through the door, with each module's injected fs: the order, a
//      placed refusal said and landed. REDS: each module's release form (a temp written and renamed, no sync)
//   ⑥ THE AGENT ITSELF (a bundle built from the tree; a scratch root that trusts a test key; a placer preloaded into that process):
//      its allow list (`--write-policy`) — a refused sync said in its log, the file landed; the bundle's landing (`--land-upgrade`,
//      a stand-in release signed by the test key): the ORDER (the verdict's read, ONE sync, the name, `current`); a sync that FAILS
//      refuses the landing by name (VS-AGENTD-FAILED — the hub tries again; `current` untouched, nothing left); a sync NOT OFFERED is
//      said and the landing goes on. RED: the same bundle with its landing's sync cut
//   ⑦ the class: every device record goes through the door (its calls by file)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import './scratch.mjs';   // §113's order: the first import after node's own
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratchDir('dev-durable');
const MUT = mutantCopies('dev-durable', REPO);
const { ok, report } = checker();
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// a SPY of the file system over a real one: every call that matters, by its path; `refuse` places a code on every sync
function spyFs({ refuse = null } = {}) {
  const calls = [], fdPath = new Map();
  const f = Object.create(fs);
  f.unlinkSync = (p) => { calls.push(['unlink', String(p)]); return fs.unlinkSync(p); };
  f.openSync = (p, fl, m) => { const fd = m == null ? fs.openSync(p, fl) : fs.openSync(p, fl, m); fdPath.set(fd, String(p)); calls.push(['open', String(p), String(fl)]); return fd; };
  f.writeSync = (fd, ...a) => { calls.push(['write', fdPath.get(fd)]); return fs.writeSync(fd, ...a); };
  f.writeFileSync = (p, ...a) => { calls.push(['writeFile', String(p)]); return fs.writeFileSync(p, ...a); };
  f.fsyncSync = (fd) => { calls.push(['fsync', fdPath.get(fd)]); if (refuse) throw Object.assign(new Error(`${refuse}: placed by the suite`), { code: refuse }); return fs.fsyncSync(fd); };
  f.closeSync = (fd) => { calls.push(['close', fdPath.get(fd)]); return fs.closeSync(fd); };
  f.chmodSync = (p, m) => { calls.push(['chmod', String(p)]); return fs.chmodSync(p, m); };
  f.renameSync = (a, b) => { calls.push(['rename', String(a), String(b)]); return fs.renameSync(a, b); };
  return { f, calls };
}
/** THE ORDER of one write through `tmp` onto `file`: its bytes written, then ONE sync of the temp, then closed, then renamed */
function orderOf(calls, tmp, file) {
  const at = (pred) => calls.findIndex(pred);
  const lastWrite = calls.reduce((n, c, i) => ((c[0] === 'write' || c[0] === 'writeFile') && c[1] === tmp ? i : n), -1);
  const sync = at((c) => c[0] === 'fsync' && c[1] === tmp), close = at((c) => c[0] === 'close' && c[1] === tmp), rename = at((c) => c[0] === 'rename' && c[1] === tmp && c[2] === file);
  return { ok: lastWrite >= 0 && sync > lastWrite && rename > sync && (close < 0 || (close > sync && rename > close)), lastWrite, sync, close, rename };
}

// ── ① / ② / ③ THE DOOR ──
console.log('① the door: its order, its mode, its words');
const DF_REL = 'src/agentd/durable-file.js', DF_SRC = src(DF_REL);
const DF = require(path.join(REPO, DF_REL));
const DOOR = path.join(ROOT, 'door'); fs.mkdirSync(DOOR, { recursive: true });
const doorRun = (D, file, tmp, data, opts = {}) => { const s = spyFs(opts); const said = []; let r = null, threw = null; try { r = D.writeDurable({ fs: s.f, file, tmp, data, mode: 0o600, log: (m) => said.push(m), ...(opts.what ? { what: opts.what } : {}) }); } catch (e) { threw = e; } return { s, said, r, threw, ord: orderOf(s.calls, tmp, file) }; };
{
  const F1 = path.join(DOOR, 'rec.json'), T1 = F1 + '.7.tmp';
  fs.writeFileSync(T1, 'a stale temp', { mode: 0o666 });   // a stale temp at a LOOSER mode: removed, never written through
  const a = doorRun(DF, F1, T1, JSON.stringify({ a: 1 }));
  const unl = a.s.calls.findIndex((c) => c[0] === 'unlink' && c[1] === T1), opn = a.s.calls.findIndex((c) => c[0] === 'open' && c[1] === T1);
  ok(!a.threw && !!a.r && a.r.synced === true && a.ord.ok && unl >= 0 && opn > unl && a.s.calls[opn][2] === 'wx' && fs.readFileSync(F1, 'utf8') === '{"a":1}' && (fs.statSync(F1).mode & 0o777) === 0o600 && !fs.existsSync(T1) && a.said.length === 0,
    'THE ORDER: the stale temp removed, the temp opened EXCLUSIVE at its mode, written whole, synced ONCE, closed, renamed — the bytes and the mode 0600 landed, nothing said', { ord: a.ord, unlink: unl, open: opn, synced: a.r && a.r.synced });
  const DX = MUT.load(DF_REL, anchored(DF_SRC, 'try { fs.fsyncSync(fd); synced = true; SAID.delete(file); }', 'try { synced = true; SAID.delete(file); }', 'the door with its sync cut'), 'df-nosync');
  const x = doorRun(DX, path.join(DOOR, 'rec-x.json'), path.join(DOOR, 'rec-x.json.tmp'), 'x');
  ok(!x.ord.ok && x.ord.sync < 0, 'RED CONTROL (the door with its sync cut): the order check sees a name taken with no sync — red', x.ord);
}
console.log('② a record\'s refused sync is said and the record lands');
{
  const F2 = path.join(DOOR, 'dial.json'), T2 = F2 + '.tmp';
  const said = [];
  const w = (data, refuse) => { const s = spyFs({ refuse }); return DF.writeDurable({ fs: s.f, file: F2, tmp: T2, data, mode: 0o600, log: (m) => said.push(m), what: 'the dial file' }); };
  const a = w('one', 'EIO'), b = w('two', 'EIO');
  ok(a.synced === false && b.synced === false && fs.readFileSync(F2, 'utf8') === 'two' && said.length === 1 && /the dial file: its write could not be synced to disk \(EIO\)/.test(said[0]) && !fs.existsSync(T2),
    'a RECORD\'s refused sync (EIO, placed): SAID ONCE in the agent\'s log for two writes, and the record still lands (the newer bytes)', said);
  w('three', null); w('four', 'ENOTSUP');
  ok(said.length === 2 && /\(ENOTSUP\)/.test(said[1]) && fs.readFileSync(F2, 'utf8') === 'four', 'a sync that answers again RE-ARMS the words; a record\'s sync NOT OFFERED (ENOTSUP) is said and lands as well', said);
  const s5 = spyFs(); s5.f.writeSync = () => { throw Object.assign(new Error('ENOSPC: placed by the suite'), { code: 'ENOSPC' }); };
  let threw = null; try { DF.writeDurable({ fs: s5.f, file: F2, tmp: F2 + '.t5', data: 'five', mode: 0o600, log: () => { } }); } catch (e) { threw = e && e.code; }
  ok(threw === 'ENOSPC' && fs.readFileSync(F2, 'utf8') === 'four' && !fs.existsSync(F2 + '.t5'), 'a WRITE that fails throws (the caller\'s own catch and words): its temp removed, the record as it was', { threw });
}
console.log('③ a refused sync\'s two classes (PURE)');
{
  const T = [['EIO', 'failed'], ['ENOSPC', 'failed'], ['EDQUOT', 'failed'], ['EROFS', 'failed'], ['EBADF', 'failed'], ['', 'failed'], [null, 'failed'], ['ENOTSUP', 'not-offered'], ['EOPNOTSUPP', 'not-offered'], ['ENOSYS', 'not-offered'], ['EINVAL', 'not-offered'], ['EISDIR', 'not-offered']];   // EISDIR: Windows' «no flush on this volume» through libuv
  const bad = T.filter(([c, want]) => DF.syncRefusal(c == null ? null : { code: c }) !== want);
  ok(bad.length === 0, `the table: ${T.map(([c, w]) => `${c || '(none)'} → ${w}`).join(' · ')}`, bad);
}

// ── ④ SELF-RETIRE's HOOK REWRITE ──
console.log('④ a retire\'s hook rewrite goes through the door');
const SR_REL = 'src/agentd/self-retire.js', SR_SRC = src(SR_REL);
const retireRun = async (SRm, refuse) => {
  const H = fs.mkdtempSync(path.join(ROOT, 'retire-')), HOOK = path.join(H, 'boot-hook.sh'), key = 'device-a';
  fs.writeFileSync(HOOK, ['#!/bin/sh', 'echo the person\'s own line', `# >>> vibespace-device ${key} >>>`, 'start the agent', `# <<< vibespace-device ${key} <<<`, ''].join('\n'), { mode: 0o755 });
  fs.chmodSync(HOOK, 0o755);
  const s = spyFs({ refuse }), said = [];
  const r = await SRm.runRetire([{ kind: 'hook', what: 'the container boot-hook block', file: HOOK, key }], { fs: s.f, supervisor: async () => true, uid: process.getuid(), log: (m) => said.push(m) });
  const real = fs.realpathSync(HOOK), tmp = `${real}.vs-tmp.${process.pid}`;
  return { r, said, ord: orderOf(s.calls, tmp, real), text: fs.readFileSync(HOOK, 'utf8'), mode: fs.statSync(HOOK).mode & 0o777, left: fs.readdirSync(H).filter((n) => n.includes('vs-tmp')).length };
}
{
  const SRm = require(path.join(REPO, SR_REL));
  const a = await retireRun(SRm, null);
  ok(a.r.done.length === 1 && a.ord.ok && !/vibespace-device/.test(a.text) && /the person's own line/.test(a.text) && a.mode === 0o755 && a.left === 0, 'the hook rewritten through the door: its block gone, the person\'s line kept, its own mode kept, ONE sync before its name', a.ord);
  const b = await retireRun(SRm, 'EIO');
  ok(b.r.done.length === 1 && !/vibespace-device/.test(b.text) && b.said.length === 1 && /could not be synced to disk \(EIO\)/.test(b.said[0]), 'a placed refusal of its sync (EIO): said in the agent\'s log, and the hook still rewritten', b.said);
  const RX = MUT.load(SR_REL, anchored(SR_SRC, "        DFILE.writeDurable({ fs, file: real, tmp: `${real}.vs-tmp.${process.pid}`, data: r.text, mode: 0o600, chmod: st.mode & 0o777, log, what: s.what });", "        { const tmp = `${real}.vs-tmp.${process.pid}`; fs.writeFileSync(tmp, r.text, { mode: 0o600 }); try { fs.chmodSync(tmp, st.mode & 0o777); fs.renameSync(tmp, real); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; } }", 'the release\'s rewrite'), 'sr-release');
  const x = await retireRun(RX, null);
  ok(!x.ord.ok && x.ord.sync < 0, 'RED CONTROL (self-retire\'s release form: written and renamed, no sync): red', x.ord);
}

// ── ⑤ THE MAC HELPER's STATE ──
console.log('⑤ the mac stream helper\'s state goes through the door');
const SM_REL = 'src/agentd/stream-mac.js', SM_SRC = src(SM_REL);
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const macRun = (SMm, refuse) => {
  const H = fs.mkdtempSync(path.join(ROOT, 'mac-')), P = SP.macHelperPaths(H);
  fs.mkdirSync(P.dir, { recursive: true });
  fs.writeFileSync(P.state, JSON.stringify({ version: 'v-suite-1' }));
  const s = spyFs({ refuse }), said = [];
  const h = SMm.createMacHelper({ execFile: () => { }, fs: s.f, home: H, log: (m) => said.push(m), version: 'v-suite-1' });
  const asked = h.rowAsked();
  let st = {}; try { st = JSON.parse(fs.readFileSync(P.state, 'utf8')); } catch { }
  return { asked, st, said, ord: orderOf(s.calls, P.state + '.tmp', P.state) };
};
{
  const SMm = require(path.join(REPO, SM_REL));
  const a = macRun(SMm, null);
  ok(a.asked === false && a.st.rowAsked === 'v-suite-1' && a.ord.ok, 'the helper\'s state written through the door (its row asked once): ONE sync before its name', a.ord);
  const b = macRun(SMm, 'EIO');
  ok(b.st.rowAsked === 'v-suite-1' && b.said.filter((m) => /could not be synced to disk \(EIO\)/.test(m)).length === 1, 'a placed refusal of its sync (EIO): said once in the agent\'s log, and the state still lands', b.said);
  const MX = MUT.load(SM_REL, anchored(SM_SRC, "DFILE.writeDurable({ fs, file: P.state, tmp: P.state + '.tmp', data: JSON.stringify(o), log, what: 'the mac screen helper\\'s state' });", "fs.writeFileSync(P.state + '.tmp', JSON.stringify(o)); fs.renameSync(P.state + '.tmp', P.state);", 'the release\'s writeState'), 'sm-release');   // stale-pins: kept — the release's form, put back as a red control
  const x = macRun(MX, null);
  ok(!x.ord.ok && x.ord.sync < 0, 'RED CONTROL (the mac helper\'s release writeState: written and renamed, no sync): red', x.ord);
}

// ── ⑥ THE AGENT ITSELF ──
console.log('⑥ the agent itself: its allow list, and its bundle\'s landing');
const SIG = require(path.join(REPO, 'src/agentd-signature.js'));
const C = { crypto };
const K1 = SIG.generateKeyPair(C);
const bundle = path.join(ROOT, 'agentd-built.js');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', '--preserve-symlinks', `--outfile=${bundle}`, '--log-level=error'], { cwd: REPO });
const KEYS_RE = /\b(const|var|let) RELEASE_KEYS = \[[^\]]*\];/;
const built = fs.readFileSync(bundle, 'utf8').replace(KEYS_RE, (_, kw) => `${kw} RELEASE_KEYS = [];`);   // the scratch root's trust file decides
const realVersion = (/\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(built) || [])[1] || null;
ok(!!realVersion && /RELEASE_KEYS = \[\];/.test(built), '(the legs\' base: the agent built from the tree, its baked release keys emptied)', { realVersion });
// the PLACER, preloaded into the agent's process: it records the calls that matter by path, and refuses the sync of a path that
// holds `match` with `code`, and (closeCode) the close that follows such a sync — never a read's own close (one JSON record written at
// the process's exit). Its config is in its own text: no environment read
const placer = (rec, place) => {
  const file = path.join(ROOT, `placer-${crypto.randomBytes(4).toString('hex')}.cjs`);
  fs.writeFileSync(file, `'use strict';
const fs = require('fs'); const fdPath = new Map(); const synced = new Set(); const ev = []; const PLACE = ${JSON.stringify(place || null)};
const o = { openSync: fs.openSync, fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, renameSync: fs.renameSync, readFileSync: fs.readFileSync, symlinkSync: fs.symlinkSync, writeFileSync: fs.writeFileSync };
fs.openSync = function (p, ...a) { const fd = o.openSync.call(fs, p, ...a); fdPath.set(fd, String(p)); ev.push(['open', String(p), String(a[0] == null ? 'r' : a[0])]); return fd; };
fs.fsyncSync = function (fd) { const p = fdPath.get(fd) || ''; ev.push(['fsync', p]); synced.add(fd); if (PLACE && p.includes(PLACE.match)) throw Object.assign(new Error(PLACE.code + ': placed by the suite'), { code: PLACE.code }); return o.fsyncSync.call(fs, fd); };
fs.closeSync = function (fd) { const p = fdPath.get(fd) || '', wasSynced = synced.delete(fd); const r = o.closeSync.call(fs, fd); if (PLACE && PLACE.closeCode && wasSynced && p.includes(PLACE.match)) throw Object.assign(new Error(PLACE.closeCode + ': placed by the suite at the close'), { code: PLACE.closeCode }); return r; };
fs.renameSync = function (a, b) { ev.push(['rename', String(a), String(b)]); return o.renameSync.call(fs, a, b); };
fs.readFileSync = function (p, ...a) { if (typeof p === 'string') ev.push(['read', p]); return o.readFileSync.call(fs, p, ...a); };
fs.symlinkSync = function (a, b, ...r) { ev.push(['symlink', String(a), String(b)]); return o.symlinkSync.call(fs, a, b, ...r); };
process.on('exit', () => { try { o.writeFileSync.call(fs, ${JSON.stringify(rec)}, JSON.stringify(ev)); } catch { } });
`);
  return file;
};
const install = (name, text) => {
  const root = path.join(ROOT, name), inst = path.join(root, realVersion);
  fs.mkdirSync(inst, { recursive: true }); fs.writeFileSync(path.join(inst, 'agentd.js'), text);
  fs.symlinkSync(inst, path.join(root, 'current'));
  fs.mkdirSync(path.join(root, 'state'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(root, 'state', 'trusted-keys.json'), SIG.trustText([{ keyId: K1.keyId, publicKey: K1.publicKey }], { from: 'test', at: 'x' }), { mode: 0o600 });
  return root;
};
const agentLog = (root) => { try { return fs.readFileSync(path.join(root, 'state', 'agentd.log'), 'utf8'); } catch { return ''; } };
const run = (root, args, place) => {
  const rec = path.join(ROOT, `rec-${crypto.randomBytes(4).toString('hex')}.json`);
  const r = spawnSync(process.execPath, ['--require', placer(rec, place), path.join(root, realVersion, 'agentd.js'), ...args], { env: { ...process.env, VIBESPACE_AGENTD_ROOT: root, VIBESPACE_DEVICE_ROOT: root, VIBESPACE_AGENTD_VERSION: '' }, encoding: 'utf8', timeout: 30000 });
  let ev = []; try { ev = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch { }
  return { status: r.status, out: String(r.stdout || ''), err: String(r.stderr || ''), ev };
};
const curOf = (root) => { try { return path.basename(fs.realpathSync(path.join(root, 'current'))); } catch { return null; } };
const land = (root, version, place, { readOnly = false } = {}) => {
  const stub = Buffer.from(`/* a stand-in release ${version} */ module.exports = {};\n`);
  const stage = path.join(root, 'state', `stage-${version}.js`), mf = path.join(root, 'state', `stage-${version}.manifest.json`);
  fs.writeFileSync(stage, stub); fs.writeFileSync(mf, JSON.stringify(SIG.sign(K1.privateKeyPem, stub, version, C)));
  if (readOnly) fs.chmodSync(stage, 0o400);   // a bundle staged READ-ONLY (a hub image without owner-write): its sync needs no write access
  const r = run(root, ['--land-upgrade', stage, '--version', version, '--manifest', mf], place);
  const dir = path.join(root, version), tmp = path.join(dir, 'agentd.js.tmp'), name = path.join(dir, 'agentd.js');
  const iRead = r.ev.findIndex((e) => e[0] === 'read' && e[1] === tmp), iSync = r.ev.findIndex((e) => e[0] === 'fsync' && e[1] === tmp);
  const iName = r.ev.findIndex((e) => e[0] === 'rename' && e[1] === tmp && e[2] === name);
  const iCur = r.ev.findIndex((e, i) => i > iName && ((e[0] === 'rename' || e[0] === 'symlink') && String(e[2]) === path.join(root, 'current')));
  return { ...r, stub, dir, name, order: { read: iRead, sync: iSync, name: iName, current: iCur, ok: iRead >= 0 && iSync > iRead && iName > iSync && iCur > iName } };
};
if (realVersion) {
  // the allow list (`--write-policy`): a record of the agent's own, through the door
  {
    const root = install('policy', built);
    const r = run(root, ['--write-policy', 'none'], { match: 'policy.json', code: 'EIO' });
    let pol = null; try { pol = JSON.parse(fs.readFileSync(path.join(root, 'state', 'policy.json'), 'utf8')); } catch { }
    ok(r.status === 0 && !!pol && /policy\.json: its write could not be synced to disk \(EIO\)/.test(agentLog(root)), 'the agent\'s allow list (`--write-policy`) with its sync refused (EIO, placed): the file lands, and the refusal is said in the agent\'s own log', { status: r.status, policy: !!pol, err: r.err.slice(0, 160) });
  }
  // the bundle's landing
  const root = install('land', built);
  const a = land(root, '9.9.7', null);
  ok(a.status === 0 && /^VS-AGENTD-LANDED 9\.9\.7 /.test(a.out) && curOf(root) === '9.9.7' && fs.readFileSync(a.name).equals(a.stub) && a.order.ok, 'THE LANDING\'s ORDER (the ssh road, the agent\'s own landBundle): the verdict reads the bytes, then ONE sync of the temp, then its name, then `current`', { status: a.status, out: a.out.slice(0, 80), order: a.order });
  const b = land(root, '9.9.8', { match: 'agentd.js.tmp', code: 'EIO' });
  ok(b.status === 3 && /^VS-AGENTD-DEFERRED bundle-not-synced from=/.test(b.out) && curOf(root) === '9.9.7' && !fs.existsSync(b.dir) && /upgrade to 9\.9\.8 REFUSED — bundle-not-synced/.test(agentLog(root)),
    'a sync that FAILS (EIO, placed) REFUSES the landing by name: answered VS-AGENTD-DEFERRED (this version keeps running, the hub\'s next connect tries again — never a refusal for good), `current` untouched, nothing of it left, said in the agent\'s log', { status: b.status, out: b.out.slice(0, 120), current: curOf(root), left: fs.existsSync(b.dir) });
  const c = land(root, '9.9.9', { match: 'agentd.js.tmp', code: 'ENOTSUP' });
  ok(c.status === 0 && /^VS-AGENTD-LANDED 9\.9\.9 /.test(c.out) && curOf(root) === '9.9.9' && /offers no sync of the bundle \(ENOTSUP\)/.test(agentLog(root)), 'a sync the file system does NOT OFFER (ENOTSUP, placed): said once in the agent\'s log, and the landing goes on', { status: c.status, out: c.out.slice(0, 80), current: curOf(root) });
  const d = land(root, '9.9.10', null, { readOnly: true });
  ok(d.status === 0 && /^VS-AGENTD-LANDED 9\.9\.10 /.test(d.out) && curOf(root) === '9.9.10' && d.order.ok, 'a bundle staged READ-ONLY (0400) still lands: its sync opens it read-only on this platform (its fresh read: a read-write open would refuse every push)', { status: d.status, out: d.out.slice(0, 80) });
  const e = land(root, '9.9.11', { match: 'agentd.js.tmp', code: 'ENOTSUP', closeCode: 'EIO' });
  ok(e.status === 3 && /^VS-AGENTD-DEFERRED bundle-not-synced from=/.test(e.out) && curOf(root) === '9.9.10' && !fs.existsSync(e.dir), 'a sync NOT OFFERED whose CLOSE then fails (EIO, placed — a write-back error surfacing at the close) refuses the landing: a close that fails is never «not offered»', { status: e.status, out: e.out.slice(0, 120), current: curOf(root) });
  // the hub's side of the answer: a DEFERRED landing is no refusal for good, and no install
  {
    const HM = require(path.join(REPO, 'src/hosts.js'));
    const ans = HM.installAgentdAnswer('VS-AGENTD-DEFERRED bundle-not-synced from=2.3.4: its bytes could not be synced to disk (EIO)');
    const DPs = src('src/server/dial-pairing.js'), Hs = src('src/hosts.js');
    const notCached = DPs.indexOf('if (r && r.deferred) return;') > 0 && DPs.indexOf('if (r && r.deferred) return;') < DPs.indexOf('_agentdInstalled.set(hostId, version);');
    const resolves = Hs.indexOf('if (r.deferred) {') > 0 && Hs.indexOf('if (r.deferred) {') < Hs.indexOf("if (r.failed) return reject(");
    ok(!!ans && ans.deferred === 'bundle-not-synced' && ans.from === '2.3.4' && !ans.refused && !ans.failed && !SIG.REFUSALS.includes('bundle-not-synced') && notCached && resolves,
      'THE HUB hears it as DEFERRED: never a refusal for good (outside the signature\'s refusals — the stream road\'s `upgrade-failed` keeps its tries), the connect goes on with the old agent, and nothing is cached as installed (the next connect tries again)', { ans, inRefusals: SIG.REFUSALS.includes('bundle-not-synced'), notCached, resolves });
  }
  // RED: the same agent with its landing's sync cut — the name taken with no sync, and a refused sync never refuses
  const SYNC_CALL = /([A-Za-z_$][\w$]*)\.fsyncSync\(sfd\);/g;
  const nCut = (built.match(SYNC_CALL) || []).length;
  const rootX = install('land-cut', built.replace(SYNC_CALL, 'void sfd;'));
  const xa = land(rootX, '9.9.7', null), xb = land(rootX, '9.9.8', { match: 'agentd.js.tmp', code: 'EIO' });
  ok(nCut === 1 && !xa.order.ok && xa.order.sync < 0 && xb.status === 0 && curOf(rootX) === '9.9.8', 'RED CONTROL (the landing\'s sync cut from the built agent): its name taken with no sync, and the refused sync lands — red', { cuts: nCut, order: xa.order, refusedLanded: xb.status === 0 });
}

// ── ⑦ THE CLASS: every device record through the door ──
console.log('⑦ every device record goes through the door');
{
  const want = { 'src/agentd/agentd.js': 11, 'src/agentd/self-retire.js': 1, 'src/agentd/stream-mac.js': 2 };
  const seen = Object.fromEntries(Object.keys(want).map((f) => [f, (src(f).match(/\bDFILE\.writeDurable\(/g) || []).length]));
  ok(Object.keys(want).every((f) => seen[f] === want[f]), `the door's callers by file (${Object.entries(want).map(([f, n]) => `${path.basename(f)} ${n}`).join(' · ')}) — the 14 records B-93e7 named; the rename census holds every other device rename`, seen);
}
report();
