#!/usr/bin/env node
// test-store-read-three — row B-f276's family, unit 1 (主开发 r2930, lane bl-jobs; the verifier's page:
// /var/tmp/vibespace-lanes/lg-store-writes/verify/store-read-law-page.md): THREE STORES A FAILED READ COULD WRITE OVER —
// mounts.json (src/mounts.js), mount-tokens.json (src/webdav.js), plugins.json (src/plugins.js) — now under the store-read law
// through src/store-read-hold.js. FAST, in-process; MADE-UP rows in a scratch data folder of each leg's own; nothing outside it.
// THE REFUSAL IS PLACED: fs.readFileSync / fs.promises.readFile answer EIO for that ONE path (never a mount, never a mode change).
//   ① per store: a failed read at the start HOLDS — the list says why, the ordinary next save is REFUSED BY NAME (its code), and
//      the file is byte-for-byte what it was (no temp left); a START while held holds again; the read again LIFTS — the rows are
//      back and the next save keeps them. RED CONTROL: the store with its guards cut (an in-memory copy of its file) writes over
//      the file — the release's shape, NOT KEPT.
//   ② per store: torn bytes are kept aside ONCE per content (`<file>.corrupt-<ms>`, the same bytes, 0600), then it starts empty;
//      a second start over the same torn bytes finds their copy and makes none. RED CONTROL: the comparison cut copies at every start.
//   ③ the read again never storms: three failed tries leave ONE timer armed (30 s, the ladder's first rung).
//   ④ WHAT RUNS WHILE HELD (主开发 r2952 (3)), per store: mounts — the health sweep and the boot restore act on nothing (no mount,
//      no unmount, no daemon killed), the restore runs at the lift; tokens — a folder link is refused (fail closed), no sweep revokes,
//      the SAME token resolves after the lift (nothing re-minted); plugins — the boot replay starts nothing (replayed at the lift),
//      the service state says unread (the page's first-use offer asks nothing then: its pins); THE SECRET LENS — no token, no hash,
//      no sealed field in any word, journal line or refusal.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-srl3-'));
let n = 0;
const dirOf = (tag) => { const d = path.join(T, `${tag}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };
const RAW = fs.readFileSync;   // the real read (a check of the bytes on disk never meets the placed refusal)
const onDisk = (f) => RAW.call(fs, f, 'utf8');
/** the PLACED refusal: EIO for that one path, on both read roads, until undone */
const refuse = (file) => {
  const rf = fs.readFileSync, rp = fs.promises.readFile, eio = () => Object.assign(new Error(`EIO: i/o error, read '${path.basename(file)}' (placed)`), { code: 'EIO', errno: -5 });
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === file) throw eio(); return rf.call(fs, p, ...a); };
  fs.promises.readFile = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === file) return Promise.reject(eio()); return rp.call(fs.promises, p, ...a); };
  return () => { fs.readFileSync = rf; fs.promises.readFile = rp; };
};
/** a src file's IN-MEMORY copy with its anchors replaced (never written to disk): its requires resolve from its own folder */
const mutant = (rel, edits) => {
  const file = path.join(REPO, rel); let src = fs.readFileSync(file, 'utf8');
  for (const [a, b] of edits) { if (!src.includes(a)) throw new Error(`${rel}: the control's anchor is gone — ${a.slice(0, 80)}`); src = src.split(a).join(b); }
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports;
};
const quiet = () => { };
const { MountTokens } = require('../src/webdav.js');
const { MountManager } = require('../src/mounts.js');
const { PluginManager } = require('../src/plugins.js');
const PLUGIN_ID = Object.keys(new PluginManager({ dataDir: dirOf('plugins-probe'), broadcast: quiet }).defs())[0];   // defs() is keyed by id
const STORES = [
  { name: 'mount-tokens.json', rel: 'src/webdav.js', code: 'tokens_unread', key: 'mtk-made0001',
    plant: (d) => ({ tokens: [{ id: 'mtk-made0001', name: 'made-up share', kind: 'share', owner: null, tokenHash: 'h'.repeat(64), root: d, mode: 'ro', createdAt: 1, lastUsedAt: null }] }),
    make: (d, X = { MountTokens }) => new X.MountTokens({ dataDir: d, log: quiet }),
    save: (s, d) => s.mint({ name: 'second made-up share', root: d, mode: 'ro', kind: 'share' }),
    has: (s) => s.list().some((x) => x.id === 'mtk-made0001'), count: (s) => s.list().length,
    cut: [["    if (!this._hold.writable('a token change')) return;", ''], ["    this._hold.refuse('making a folder link');", '']], exp: 'MountTokens' },
  { name: 'mounts.json', rel: 'src/mounts.js', code: 'storage_unread', key: 'mnt-made0001',
    plant: () => ({ mounts: [{ id: 'mnt-made0001', name: 'made-up mount', type: 'webdav', origin: 'manual', mode: 'rw', customPath: null, expiresAt: null, desired: 'unmounted', createdAt: 1 }], shares: [] }),
    make: (d, X = { MountManager }) => new X.MountManager({ dataDir: d }),
    save: (s) => s.add({ type: 'webdav', name: 'second made-up mount', url: 'https://dav.example.invalid/', user: 'made-up', pass: 'made-up' }),
    has: (s) => s.list().some((x) => x.id === 'mnt-made0001'), count: (s) => s.list().length,
    cut: [["    if (!this._hold.writable('a storage change')) return;", ''], ["    this._hold.refuse('connecting storage');", '']], exp: 'MountManager' },
  { name: 'plugins.json', rel: 'src/plugins.js', code: 'plugins_unread', key: 'made-up-plugin',
    plant: () => ({ plugins: { 'made-up-plugin': { enabled: true, installedAt: 1 }, [PLUGIN_ID]: { enabled: true } } }),
    make: (d, X = { PluginManager }) => new X.PluginManager({ dataDir: d, broadcast: quiet }),
    save: (s) => s.setPrompted(PLUGIN_ID, true),
    has: (s) => !!s._state.plugins['made-up-plugin'], count: (s) => Object.keys(s._state.plugins).length,
    cut: [["    if (!this._hold.writable('a plugin change')) { if (loud) throw this._hold.refusal('this one-time move'); return; }", ''], ["    this._hold.refuse('remembering the first-use answer');", '']], exp: 'PluginManager' },
];
const tryCode = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const stopOf = (s) => { try { s && s._hold && s._hold.stop(); } catch { } };
const lifted = async (s, ms = 3000) => { const t0 = Date.now(); while (s._hold.held() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); return !s._hold.held(); };

try {
  for (const S of STORES) {
    console.log(`① ${S.name} (${S.rel}): one failed read at the start, then its ordinary save`);
    const d = dirOf(S.name), f = path.join(d, S.name), bytes = JSON.stringify(S.plant(d), null, 2);
    fs.writeFileSync(f, bytes);
    let un = refuse(f), s = null, s2 = null;
    try {
      s = S.make(d);
      const words = s.unreadWords();
      ok(!!s._hold.held() && typeof words === 'string' && words.includes(S.name) && S.count(s) === 0, `${S.name}: HELD at a failed read — no rows listed, and the list's words name the file`, { held: s._hold.held(), words });
      const e = tryCode(() => S.save(s, d));
      ok(!!e && e.code === S.code && e.status === 503 && e.message.includes(S.name), `${S.name}: its ordinary next save is REFUSED BY NAME (${S.code}, 503)`, e && { code: e.code, status: e.status, msg: e.message });
      ok(onDisk(f) === bytes && !fs.readdirSync(d).some((x) => /\.tmp$/.test(x)), `${S.name}: the file is byte-for-byte what it was — nothing written over it, no temp left`);
      s2 = S.make(d);
      ok(!!s2._hold.held() && onDisk(f) === bytes, `${S.name}: a START while held holds again (nothing was written, the same file is read)`);
    } finally { un(); }
    const back = await s._hold.again();
    ok(back === true && S.has(s), `${S.name}: the read again LIFTS — the rows are back`, { back, held: s._hold.held() });
    const e2 = tryCode(() => S.save(s, d));
    const after = onDisk(f);
    ok(!e2 && after.includes(S.key) && S.count(s) >= 2, `${S.name}: after the lift the ordinary save KEEPS the rows already there`, { error: e2 && e2.message, count: S.count(s) });
    stopOf(s); stopOf(s2);
    // RED CONTROL: the same leg against the store with its guards cut — the release's shape writes over the file
    const d3 = dirOf(S.name + '-ctl'), f3 = path.join(d3, S.name), bytes3 = JSON.stringify(S.plant(d3), null, 2);
    fs.writeFileSync(f3, bytes3);
    const X = mutant(S.rel, S.cut);
    un = refuse(f3); let c = null; try { c = S.make(d3, X); } finally { un(); }
    tryCode(() => S.save(c, d3)); stopOf(c);
    const lost = !onDisk(f3).includes(S.key);
    ok(lost, `${S.name}: RED CONTROL — its guards cut, the same leg writes over the file (NOT KEPT, the release's shape): the leg above can fail`);
  }

  for (const S of STORES) {
    console.log(`② ${S.name}: torn bytes are kept aside once per content`);
    const d = dirOf(S.name + '-torn'), f = path.join(d, S.name), torn = Buffer.from('{"made-up": [1, 2, ÿ torn');
    fs.writeFileSync(f, torn);
    const s = S.make(d);
    const was = s._hold.held();
    const up = await lifted(s);
    const asides = () => fs.readdirSync(d).filter((x) => x.startsWith(S.name + '.corrupt-'));
    const a1 = asides();
    ok(!!was && up && a1.length === 1 && /\.corrupt-\d+(-\d+)?$/.test(a1[0]) && fs.readFileSync(path.join(d, a1[0])).equals(torn) && (fs.statSync(path.join(d, a1[0])).mode & 0o777) === 0o600, `${S.name}: torn bytes HOLD until their copy is made — the copy holds the same bytes, 0600`, { was, up, a1 });
    const live = fs.readFileSync(f); let whole = false; try { JSON.parse(live.toString('utf8')); whole = true; } catch { }
    ok(S.count(s) === 0 && (live.equals(torn) || whole), `${S.name}: then it starts EMPTY (the live file is the torn bytes until a save replaces them whole)`);
    stopOf(s);
    fs.writeFileSync(f, torn);   // the SAME torn bytes met again at the next start (a store whose lift saved has replaced them)
    const s2 = S.make(d); await lifted(s2);
    ok(asides().length === 1, `${S.name}: a second start over the SAME torn bytes makes no second copy (kept aside ONCE per content)`, asides());
    const e = tryCode(() => S.save(s2, d)); stopOf(s2);
    let parsed = null; try { parsed = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
    ok(!e && !!parsed && asides().length === 1, `${S.name}: its next save writes a whole file; the copy of the torn bytes stays`, e && e.message);
  }
  {
    console.log('② RED CONTROL: the comparison with the copies already there cut');
    let k = 0;
    const H = mutant('src/store-read-hold.js', [['    for (const n of names.reverse()) {', '    for (const n of []) {']]);
    const d = dirOf('ctl-torn'), f = path.join(d, 'x.json'); fs.writeFileSync(f, 'torn {');
    for (let i = 0; i < 2; i++) { const h = H.create({ file: f, code: 'x', aside: (mark) => f + '.corrupt-' + mark, words: () => 'x' }); h.start({ state: 'corrupt', why: 'did not parse' }); const t0 = Date.now(); while (h.held() && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 20)); h.stop(); k++; }
    ok(k === 2 && fs.readdirSync(d).filter((x) => x.startsWith('x.json.corrupt-')).length === 2, 'RED CONTROL — the comparison cut, the same torn bytes are copied at EVERY start: the once-per-content leg above can fail');
  }

  {
    console.log('③ the read again never storms');
    const H = require('../src/store-read-hold.js');
    const d = dirOf('storm'), f = path.join(d, 'y.json'); fs.writeFileSync(f, '{}');
    const st = globalThis.setTimeout, armed = [];
    globalThis.setTimeout = function (fn, ms, ...a) { const t = st(fn, ms, ...a); if (String(fn).includes('again().catch(onErr)')) armed.push(ms); return t; };   // the hold's OWN timers (another leg's late timer is not counted)
    const un = refuse(f); let h = null;
    try {
      h = H.create({ file: f, code: 'y', aside: (mark) => f + '.corrupt-' + mark, words: () => 'y' });
      h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' });
      for (let i = 0; i < 3; i++) await h.again();
    } finally { un(); globalThis.setTimeout = st; }
    ok(!!h.held() && armed.length === 1 && armed[0] === 30000, 'three failed tries leave ONE timer armed, at the ladder\'s first rung (30 s) — never a storm', armed);
    h.stop();
  }
  {
    console.log('④ mounts.json while held: the sweep and the restore act on nothing; the restore runs at the lift');
    const d = dirOf('mounts-live'), f = path.join(d, 'mounts.json'), SEALED = 'sealed-made-up-' + 'value-31f2';
    const bytes = JSON.stringify({ mounts: [{ id: 'mnt-live0001', name: 'made-up live mount', type: 'webdav', origin: 'manual', mode: 'rw', customPath: null, expiresAt: null, desired: 'mounted', passEnc: SEALED, createdAt: 1 }], shares: [] }, null, 2);
    fs.writeFileSync(f, bytes);
    const calls = [], said = [], cw = console.warn; console.warn = (...a) => { said.push(a.join(' ')); };
    let un = refuse(f), s = null, refused = null;
    try {
      s = new MountManager({ dataDir: d });
      s.mount = async (id) => { calls.push('mount ' + id); }; s.unmount = (id) => { calls.push('unmount ' + id); }; s._killMountDaemon = async () => { calls.push('kill'); }; s.maybeUpgradePinnedRclone = () => { };
      await s._healthSweep(); await s.restore();
      refused = tryCode(() => s.add({ type: 'webdav', name: 'made-up', url: 'https://dav.example.invalid/', user: 'made-up', pass: 'made-up' }));
    } finally { un(); console.warn = cw; }
    ok(calls.length === 0 && s._restoreAsked === true && onDisk(f) === bytes, 'held: the health sweep and the boot restore mount, unmount and kill NOTHING (a live mount keeps serving), nothing is written; the restore is noted', { calls });
    const words = [s.unreadWords(), refused && refused.message, ...said].join('\n');
    ok(!!refused && !words.includes(SEALED), 'THE SECRET LENS: no sealed field of a mount in the list\'s words, the refusal or any journal line', said);
    await s._hold.again(); await new Promise((r) => setTimeout(r, 50));
    ok(calls.includes('mount mnt-live0001') && !s._restoreAsked, 'at the lift the boot restore runs (the mount desired up is connected then)', calls);
    stopOf(s);
  }
  {
    console.log('④ mount-tokens.json while held: links refused, nothing revoked, the same token after the lift');
    const crypto = require('node:crypto');
    const d = dirOf('tokens-live'), f = path.join(d, 'mount-tokens.json'), RAW = ['vs', 'mt_'].join('') + 'b'.repeat(48), HASH = crypto.createHash('sha256').update(RAW).digest('hex');
    const bytes = JSON.stringify({ tokens: [{ id: 'mtk-live0001', name: 'host:h-made', kind: 'reverse-mount', owner: 'h-made', tokenHash: HASH, root: d, mode: 'ro', createdAt: 1, lastUsedAt: null }] }, null, 2);
    fs.writeFileSync(f, bytes);
    const said = [];
    let un = refuse(f), s = null, gc = null, hasE = null, revE = null, res = 'unset';
    try {
      s = new MountTokens({ dataDir: d, log: (l) => said.push(l) });
      res = s.resolve(RAW); hasE = tryCode(() => s.has(RAW)); revE = tryCode(() => s.revoke('mtk-live0001'));
      const MMs = require('../src/machine-mounts.js').MachineMounts;
      gc = MMs.prototype.gcOrphanTokens.call({ _unread: null, _state: { mounts: [] }, mountTokens: s, log: (l) => said.push(l) });   // the orphan sweep over a HELD token store
    } finally { un(); }
    ok(res === null && !!hasE && hasE.code === 'tokens_unread' && !!revE && revE.code === 'tokens_unread' && gc === 0 && onDisk(f) === bytes, 'held: a folder link is refused (fail closed, «is it ours» refused by name), revoke refused, the orphan sweep revokes NOTHING, nothing is written', { res, has: hasE && hasE.code, rev: revE && revE.code, gc });
    const words = [s.unreadWords(), hasE && hasE.message, revE && revE.message, ...said].join('\n');
    ok(!words.includes(RAW) && !words.includes(HASH) && !words.includes(HASH.slice(0, 16)) && !/vsmt_/.test(words), 'THE SECRET LENS: no token, no hash, no part of either in the words, a refusal or a journal line', said);
    await s._hold.again();
    const back = s.resolve(RAW);
    ok(!!back && back.id === 'mtk-live0001' && s.list().length === 1, 'after the lift the SAME token resolves — nothing was minted over it, the live push mount is served again', back && back.id);
    stopOf(s);
  }
  {
    console.log('④ plugins.json while held: the boot replay starts nothing; the service state says unread');
    const d = dirOf('plugins-live'), f = path.join(d, 'plugins.json');
    const bytes = JSON.stringify({ plugins: { [PLUGIN_ID]: { enabled: true, desiredUp: true, promptedAt: 1 } } }, null, 2);
    fs.writeFileSync(f, bytes);
    const calls = [];
    let un = refuse(f), s = null, svc = null;
    try {
      s = new PluginManager({ dataDir: d, broadcast: quiet });
      s.refreshAll = () => { }; s.refreshStatus = async () => ({ });
      for (const [id, v] of s._verbs) { for (const k of ['start', 'bootReplay']) if (typeof v[k] === 'function') v[k] = () => { calls.push(k + ' ' + id); }; }
      s.bootReplay(); svc = s.serviceState(PLUGIN_ID);
    } finally { un(); }
    ok(calls.length === 0 && s._replayAsked === true && !!svc && svc.unread === true && onDisk(f) === bytes, 'held: the boot replay starts NO plugin over unread records; the service state says unread (never «not asked yet»)', { calls, svc });
    await s._hold.again();
    ok(calls.length > 0 && !s._replayAsked && !s.serviceState(PLUGIN_ID).unread, 'at the lift the boot replay runs; the service state reads its record again', calls);
    stopOf(s);
    const UI = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8'), SB = fs.readFileSync(path.join(REPO, 'src/lib/sidebar.js'), 'utf8');
    const g = UI.indexOf('if (st.unread) { if (needsService) showToast(pluginsHeldWords()'), dlg = UI.indexOf('const accepted = await this._harnessServiceDialog(meta, st);');
    ok(g > 0 && dlg > g && SB.includes('if (!svc || svc.unread || !svc.installed'), 'THE PAGE (pins): the first-use offer returns before its dialog while held (a «Not now» is never re-asked), and the sidebar\'s service hint is not drawn');
  }
} catch (e) {
  fail++; console.log('  ✗ the suite threw: ' + ((e && e.stack) || e));
} finally {
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
