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
//   ⑤ ROUND wom600meg (主开发 r3029): THE MUST — a push mount removed while mount-tokens.json is held is REFUSED BY NAME (the record
//      and the token kept; after the lift the removal revokes; RED CONTROL: the guard cut drops the record while the token lives);
//      the machine's removal asks first (pin). THE HELPER: one in flight is the read AND its copy; the family's CEILING (24 held stores
//      over reads that never answer hold four); the live holds as a list + readAgainOf; a torn lift says so (the copy named; plugins.json
//      saves its empty shape once). THE SHOULDS TAKEN: every store's _save refuses on its own (RED: that line alone cut); ③'s red
//      control (`|| timer` cut ⇒ a timer a try); the helper's own legs (the missing two-step, stop, a throwing lift, no place for a copy);
//      the remount's auth words never match a held refusal (a mount refused while held reconnects after the lift).
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
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 10)); return !!fn(); };
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
    await s._hold.again(); await until(() => calls.includes('mount mnt-live0001'));   // (polled: the restore is fired at the lift)
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
  {
    console.log('⑤ round wom600meg MUST: a push mount removed while mount-tokens.json is held');
    const crypto = require('node:crypto'), sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
    const MMmod = require('../src/machine-mounts.js');
    const mk = (MM, tokens, rec, calls) => { const S = Object.create(MM.prototype); Object.assign(S, { _unread: null, _state: { mounts: [rec] }, hosts: { held: () => false, unreadWords: () => null }, mountTokens: tokens, _run: async (...a) => { calls.push('run ' + a[1]); }, _save: () => { calls.push('save'); }, _notify: () => { }, _pushTunnelOwned: new Map(), _pushRetryAt: new Map(), _pushDown: new Map(), _live: new Map() }); return S; };
    const plantT = (tag) => { const d = dirOf(tag), f = path.join(d, 'mount-tokens.json'), RAW = ['vs', 'mt_'].join('') + 'c'.repeat(48); const bytes = JSON.stringify({ tokens: [{ id: 'mtk-push0001', name: 'host:h-made', kind: 'reverse-mount', owner: 'h-made', tokenHash: sha(RAW), root: d, mode: 'ro', createdAt: 1, lastUsedAt: null }] }, null, 2); fs.writeFileSync(f, bytes); const un = refuse(f); let T = null; try { T = new MountTokens({ dataDir: d, log: quiet }); } finally { un(); } return { d, f, RAW, bytes, T }; };
    const rec = { id: 'mm-push0001', dir: 'push', hostId: 'h-made', folder: '/made/up/share', mode: 'ro', mountpoint: '/made/up/mp', method: 'rclone-webdav', tokenId: 'mtk-push0001', createdAt: 1 };
    const A = plantT('push-held'), calls = [], S = mk(MMmod.MachineMounts, A.T, { ...rec }, calls);
    const e = await S.unmount('mm-push0001').then(() => null, (x) => x);
    ok(!!e && e.code === 'tokens_unread' && e.status === 503 && calls.length === 0 && S._state.mounts.length === 1 && onDisk(A.f) === A.bytes, 'held: removing a push mount is REFUSED BY NAME before anything moves (no remote unmount, no save) — the record and the token both kept', { code: e && e.code, calls });
    ok(!!S.revokeHeldFor('h-made') && S.revokeHeldFor('h-other') === null, 'the machine\'s removal asks the same question (revokeHeldFor names the hold for a machine with a push mount, none for another)');
    await A.T._hold.again();
    const e2 = await S.unmount('mm-push0001').then(() => null, (x) => x);
    ok(!e2 && S._state.mounts.length === 0 && A.T.resolve(A.RAW) === null && !onDisk(A.f).includes('mtk-push0001'), 'after the lift the removal REVOKES: the token resolves no more and leaves the file; the record goes', e2 && e2.message);
    const B = plantT('push-held-ctl');
    const X = mutant('src/machine-mounts.js', [["    { const w = this._revokeHeldWords(rec); if (w) throw Object.assign(new Error(`removing a mount on a machine: ${w}`), { code: 'tokens_unread', status: 503 }); }", '']]);
    const S3 = mk(X.MachineMounts, B.T, { ...rec }, []);
    await S3.unmount('mm-push0001').catch(() => { });
    await B.T._hold.again();
    ok(S3._state.mounts.length === 0 && !!B.T.resolve(B.RAW), 'RED CONTROL — the guard cut (the release\'s road): the record is dropped while its token opens the folder again at the lift');
    stopOf(A.T); stopOf(B.T);
    const DP = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8'), ask = DP.indexOf('machineMounts.revokeHeldFor(hosts.findByDeviceId(deviceId)?.id)'), unm = DP.indexOf('await machineMounts.onMachineUnpaired(');
    ok(ask > 0 && unm > ask, 'THE MACHINE\'S REMOVAL (pin): unpairDialDevice asks revokeHeldFor BEFORE any side effect — its unmounts run inside a swallow');
  }
  const H = require('../src/store-read-hold.js'), SR = require('../src/store-read.js');
  {
    console.log('⑤ the helper: one in flight is the read AND its copy');
    const inFlight = async (Mod, tag) => {
      const d = dirOf(tag), f = path.join(d, 'z.json'); fs.writeFileSync(f, 'torn {');
      const rd = fs.promises.readdir, rf = fs.promises.readFile; let reads = 0, release = null;
      fs.promises.readdir = function (p, ...a) { if (String(p) === d && !release) return new Promise((r) => { release = () => r(rd.call(fs.promises, p, ...a)); }); return rd.call(fs.promises, p, ...a); };
      fs.promises.readFile = function (p, ...a) { if (String(p) === f) reads++; return rf.call(fs.promises, p, ...a); };
      let h = null, during = -1, up = false;
      try {
        h = Mod.create({ file: f, code: 'z', aside: (m) => f + '.corrupt-' + m, words: () => 'z' });
        h.start({ state: 'corrupt', why: 'did not parse' });
        await until(() => !!release);   // the copy's folder listing hangs
        await Promise.race([Promise.all([h.again(), h.again()]), new Promise((r) => setTimeout(r, 200))]);
        during = reads;
        if (release) release(); up = await until(() => !h.held());
      } finally { fs.promises.readdir = rd; fs.promises.readFile = rf; if (h) h.stop(); }
      return { during, up, copies: fs.readdirSync(d).filter((n) => n.startsWith('z.json.corrupt-')).length };
    };
    const fl = await inFlight(H, 'busy');
    ok(fl.during === 1 && fl.up && fl.copies === 1, 'while the copy\'s listing hangs, two more tries start NO second read (one pool thread a store, one copy of one content)', fl);
    const flx = await inFlight(mutant('src/store-read-hold.js', [['    if (busy || active >= CEILING) return false;', '    if (active >= CEILING) return false;']]), 'busy-ctl');
    ok(flx.during > 1, 'RED CONTROL (round w9jhivwdo (5)) — the in-flight mark cut: the tries start a second read while the copy hangs', flx);
  }
  {
    console.log('⑤ the helper: the family\'s ceiling on the shared pool');
    const ceiling = async (Mod, tag) => {
      const d = dirOf(tag), files = Array.from({ length: 24 }, (_, i) => path.join(d, `s${i}.json`)); files.forEach((x) => fs.writeFileSync(x, '{}'));
      const rf = fs.promises.readFile, pend = []; let started = 0, first = -1, second = -1;
      fs.promises.readFile = function (p, ...a) { if (files.includes(String(p))) { started++; return new Promise((_, no) => pend.push(() => no(Object.assign(new Error('EIO (placed)'), { code: 'EIO' })))); } return rf.call(fs.promises, p, ...a); };
      const hs = [];
      try {
        for (const x of files) { const h = Mod.create({ file: x, code: 'c', aside: (m) => x + '.corrupt-' + m, words: () => 'c' }); h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' }); hs.push(h); }
        const ps = hs.map((h) => h.again()); first = started;
        pend.splice(0).forEach((no) => no()); await Promise.all(ps);
        const ps2 = hs.slice(4, 12).map((h) => h.again()); second = started - first;
        pend.splice(0).forEach((no) => no()); await Promise.all(ps2);
      } finally { fs.promises.readFile = rf; pend.splice(0).forEach((no) => no()); hs.forEach((h) => h.stop()); }
      return { first, second };
    };
    const { first, second } = await ceiling(H, 'ceiling');
    const cx = await ceiling(mutant('src/store-read-hold.js', [['    if (busy || active >= CEILING) return false;', '    if (busy) return false;']]), 'ceiling-ctl');
    ok(cx.first === 24, 'RED CONTROL (round w9jhivwdo (5)) — the ceiling cut: twenty-four held stores hold twenty-four reads', cx);
    ok(H.CEILING === 4 && first === 4 && second === 4, 'twenty-four held stores over reads that never answer hold FOUR reads; the others wait their turn, ladders armed — and the ceiling frees with its reads (the next tries read four again)', { first, second });
  }
  {
    console.log('⑤ the helper (主开发 r3144): the copy of torn bytes is written WHOLE — a part name, synced, put in place only when whole');
    const wholeRun = async (Mod, tag) => {
      const d = dirOf(tag), f = path.join(d, 'w.json'), TORN = 'torn {"made": "up"'; fs.writeFileSync(f, TORN);
      const op = fs.promises.open, wf = fs.promises.writeFile; let failOnce = true;
      const enospc = () => Object.assign(new Error('ENOSPC: no space left on device (placed)'), { code: 'ENOSPC' });
      fs.promises.open = async function (p, ...a) { const fh = await op.call(fs.promises, p, ...a); if (failOnce && String(p).startsWith(d + path.sep) && String(p) !== f) { failOnce = false; fh.writeFile = async (b) => { await fh.write(Buffer.from(b).subarray(0, 3)); throw enospc(); }; } return fh; };
      fs.promises.writeFile = async function (p, data, o) { if (failOnce && String(p).startsWith(d + path.sep) && String(p) !== f) { failOnce = false; await wf.call(fs.promises, p, Buffer.from(data).subarray(0, 3), o); throw enospc(); } return wf.call(fs.promises, p, data, o); };
      let h = null, left = null, heldAfter = null;
      try {
        h = Mod.create({ file: f, code: 'w', aside: (m) => f + '.corrupt-' + m, words: () => 'w' });
        h.start({ state: 'corrupt', why: 'did not parse' });
        await until(() => !failOnce); await new Promise((r) => setTimeout(r, 50));
        left = fs.readdirSync(d).filter((n) => n !== 'w.json'); heldAfter = !!h.held();
      } finally { fs.promises.open = op; fs.promises.writeFile = wf; }
      await h.again();
      const copies = fs.readdirSync(d).filter((n) => n.startsWith('w.json.corrupt-'));
      const r = { left, heldAfter, up: !h.held(), copies: copies.length, whole: copies.some((n) => fs.readFileSync(path.join(d, n), 'utf8') === TORN), parts: fs.readdirSync(d).filter((n) => n.endsWith('.part')).length };
      h.stop(); return r;
    };
    const wr = await wholeRun(H, 'whole');
    ok(wr.left.length === 0 && wr.heldAfter && wr.up && wr.copies === 1 && wr.whole && wr.parts === 0, 'three bytes written then «no space»: NO file is left (no part, no short copy), the store stays held; the next try writes the copy WHOLE and lifts', wr);
    const wrx = await wholeRun(mutant('src/store-read-hold.js', [["      const w = await writeWhole(to, buf, log);   // r3144: whole under a part name, synced, put in place only when whole", "      const w = await fs.promises.writeFile(to, buf, { flag: 'wx', mode: 0o600 }).then(() => ({ ok: true }), (error) => ({ error }));"]]), 'whole-ctl');
    ok(wrx.left.length >= 1, 'RED CONTROL — the copy written straight to its dated name (the round\'s finding): a SHORT file is left at a copy\'s name for good', wrx);
  }
  {
    console.log('⑤ the helper: the live holds as a list; readAgainOf; a torn lift says so');
    const d = dirOf('list'), f = path.join(d, 'l.json'); fs.writeFileSync(f, '{"made": 1}');
    const h = H.create({ file: f, code: 'l', aside: (m) => f + '.corrupt-' + m, words: () => 'l' }); h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' });
    const L1 = H.holds(), row = L1.find((x) => x.file === 'l.json');
    ok(!!row && row.held === true && row.code === 'EIO' && row.torn === false && row.copy === null && typeof row.since === 'number' && Object.isFrozen(L1) && Object.isFrozen(row), 'a held store is ONE frozen row of the list (file, code, since, torn, copy, held)', row);
    const back = await H.readAgainOf('l.json');
    ok(back === true && !H.holds().some((x) => x.file === 'l.json'), 'readAgainOf(file) reads that one store again: lifted with its records, it leaves the list');
    h.stop();
    const d2 = dirOf('list-torn'), f2 = path.join(d2, 'm.json'); fs.writeFileSync(f2, 'torn {');
    const h2 = H.create({ file: f2, code: 'm', aside: (k) => f2 + '.corrupt-' + k, words: () => 'm' }); h2.start({ state: 'corrupt', why: 'did not parse' });
    await until(() => !h2.held());
    const r2 = H.holds().find((x) => x.file === 'm.json');
    ok(!!r2 && r2.held === false && r2.torn === true && /^m\.json\.corrupt-\d+/.test(String(r2.copy)) && !!h2.torn() && h2.torn().copy === r2.copy, 'a lift from TORN bytes stays listed (held false) with its copy\'s name, and torn() says it to its store', r2);
    h2.stop();
    ok(!H.holds().some((x) => x.file === 'm.json'), 'a stopped hold leaves the list');
    // round w9jhivwdo (3): two held stores of ONE base name in two folders — the base name matches neither; the row's key, its own
    const da = dirOf('dup-a'), db = dirOf('dup-b'), fa = path.join(da, 'dup.json'), fb = path.join(db, 'dup.json'); fs.writeFileSync(fa, '{}'); fs.writeFileSync(fb, '{}');
    const ha = H.create({ file: fa, code: 'd', aside: (m) => fa + '.corrupt-' + m, words: () => 'd' }), hb = H.create({ file: fb, code: 'd', aside: (m) => fb + '.corrupt-' + m, words: () => 'd' });
    ha.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' }); hb.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' });
    const rows = H.holds().filter((x) => x.file === 'dup.json');
    const byName = await H.readAgainOf('dup.json'), stillBoth = !!ha.held() && !!hb.held();
    const byRow = await H.readAgainOf(rows.find((x) => x.key === ha._key));
    ok(rows.length === 2 && rows[0].key !== rows[1].key && !rows.some((x) => /\//.test(JSON.stringify(x))) && byName === false && stillBoth && byRow === true && !ha.held() && !!hb.held(), 'two held stores of ONE base name in two folders: the shared base name matches NEITHER; a row (its opaque key) reads its own store again only — no row hands out a path', { rows, byName, byRow });
    ha.stop(); hb.stop();
    // round w9jhivwdo (4) — round wgbjnr750's MUST: a hold's code is the error's CODE or NAME, never its message (which may name a
    // path). The inputs that tell the cure from the base: an answer whose code IS a sentence with a path, and an error with no code
    // and no name whose message holds one (the base took the answer's code — store-read's codeOf falls to the message — as it was)
    const clampRun = (Mod) => {
      const dc = dirOf('code'), fc = path.join(dc, 'c.json'); fs.writeFileSync(fc, '{}');
      const nameless = new Error('read of /made/up/home/folder/c.json did not answer'); nameless.name = '';
      const inputs = [SR.storeAnswer({ error: new TypeError('could not read /made/up/home/folder/c.json') }), SR.storeAnswer({ error: Object.assign(new Error('EIO: i/o error, read /made/up/home/folder/c.json'), { code: 'EIO' }) }),
        { state: 'unreadable', code: 'could not read /made/up/home/folder/c.json', why: 'the read failed' }, SR.storeAnswer({ error: nameless })];
      return inputs.map((a) => { const h = Mod.create({ file: fc, code: 'c', aside: (m) => fc + '.corrupt-' + m, words: () => 'c' }); h.start(a); const r = Mod.holds().find((x) => x.key === h._key); h.stop(); return r ? r.code : null; });
    };
    const cl = clampRun(H), clx = clampRun(mutant('src/store-read-hold.js', [["  if (typeof c === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(c)) return c;", "  if (a && a.code) return String(a.code);   /* the base: the answer's code as it was */"]]));
    ok(cl.join() === 'TypeError,EIO,unreadable,unreadable' && !cl.some((c) => /\/|made|folder/.test(String(c))), 'a hold\'s code is the error\'s own code or name, clamped — a code that is a sentence with a path, and an error with no code and no name, both read «unreadable»: no path reaches the list', cl);
    ok(clx.some((c) => /\/made\/up/.test(String(c))), 'RED CONTROL — the clamp cut (the base, in a copy): the path reaches the list as the hold\'s code', clx);
    const dt = dirOf('tokens-torn-words'), ft = path.join(dt, 'mount-tokens.json'); fs.writeFileSync(ft, '{"tokens": [ torn');
    const st = new MountTokens({ dataDir: dt, log: quiet }); await lifted(st);
    ok(/^mount-tokens\.json\.corrupt-\d+/.test(String(st.tornCopy())), 'a TORN lift of the folder links names its copy for that run (GET /api/mount-tokens answers it; the Bridge tokens section says each push mount must be pushed again)', st.tornCopy());
    stopOf(st);
    const dp = dirOf('plugins-torn-save'), fp = path.join(dp, 'plugins.json'); fs.writeFileSync(fp, '{"plugins": { torn');
    const p1 = new PluginManager({ dataDir: dp, broadcast: quiet }); await lifted(p1);
    let saved = null; try { saved = JSON.parse(onDisk(fp)); } catch { }
    const p2 = new PluginManager({ dataDir: dp, broadcast: quiet });
    ok(!!saved && !!saved.plugins && Object.keys(saved.plugins).length === 0 && !p2._hold.held() && /^plugins\.json\.corrupt-\d+/.test(String(p1.tornCopy())), 'plugins.json (no remover): a lift from torn bytes SAVES its empty shape once — the next start reads it (no hold again; the one-time moves run)', saved);
    stopOf(p1); stopOf(p2);
  }
  for (const S of STORES) {
    console.log(`⑤ should taken: ${S.name}'s own _save refuses while held (no door in front)`);
    const run = (X) => { const d = dirOf(S.name + '-save'), f = path.join(d, S.name); const bytes = JSON.stringify(S.plant(d), null, 2); fs.writeFileSync(f, bytes); const un = refuse(f); let s = null; try { s = S.make(d, X); } finally { un(); } try { s._save(); } catch { } stopOf(s); return onDisk(f) === bytes; };
    ok(run(undefined), `${S.name}: its _save called while held writes NOTHING (the guard of every save road with no door: a plugin's own record, the tokens' debounced save, a later migration)`);
    ok(!run(mutant(S.rel, [S.cut[0]])), `${S.name}: RED CONTROL — that one line cut, the same _save writes over the file`);
  }
  {
    console.log('⑤ should taken: ③\'s red control; the helper\'s own paths');
    const d = dirOf('storm-ctl'), f = path.join(d, 'y.json'); fs.writeFileSync(f, '{}');
    const HX = mutant('src/store-read-hold.js', [['    if (stopped || !held || timer) return;', '    if (stopped || !held) return;']]);
    const st = globalThis.setTimeout, armed = [];
    globalThis.setTimeout = function (fn, ms, ...a) { const tm = st(fn, ms, ...a); if (String(fn).includes('again().catch(onErr)')) armed.push(ms); return tm; };
    const un = refuse(f); let h = null;
    try { h = HX.create({ file: f, code: 'y', aside: (m) => f + '.corrupt-' + m, words: () => 'y' }); h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' }); for (let i = 0; i < 3; i++) await h.again(); }
    finally { un(); globalThis.setTimeout = st; if (h) h.stop(); }
    ok(armed.length > 1, 'RED CONTROL for ③ — `|| timer` cut: every try arms a timer of its own (the storm ③ refuses)', armed);
    // the missing two-step: a «missing» right after a failed read is read once more
    const dm = dirOf('missing'), fm = path.join(dm, 'gone.json');
    const hm = H.create({ file: fm, code: 'g', aside: (m) => fm + '.corrupt-' + m, words: () => 'g' }); hm.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' });
    const m1 = await hm.again(), still = !!hm.held(), m2 = await hm.again();
    ok(m1 === false && still && m2 === true && !hm.held(), 'a file GONE right after a failed read is read once more before the hold lifts as empty (a storage coming back answers ENOENT first)', { m1, still, m2 });
    hm.stop();
    // stop(): nothing armed, nothing read
    const ds = dirOf('stopped'), fs1 = path.join(ds, 's.json'); fs.writeFileSync(fs1, '{}');
    const hs = H.create({ file: fs1, code: 's', aside: (m) => fs1 + '.corrupt-' + m, words: () => 's' }); hs.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' }); hs.stop();
    ok((await hs.again()) === false && !!hs.held() && !H.holds().some((x) => x.file === 's.json'), 'a stopped hold reads nothing more and leaves the list');
    // a lift whose hooks throw is said, and the hold is lifted all the same
    const dl = dirOf('lift-throws'), fl = path.join(dl, 't.json'); fs.writeFileSync(fl, '{}'); const said = [];
    const hl = H.create({ file: fl, code: 't', aside: (m) => fl + '.corrupt-' + m, words: () => 't', log: (l) => said.push(l), onLift: () => { throw new Error('a made-up hook failure'); } }); hl.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' });
    ok((await hl.again()) === true && !hl.held() && said.some((l) => /its lift's hooks failed: a made-up hook failure/.test(l)), 'a lift whose hooks throw is SAID in the journal, and the store is lifted all the same', said);
    hl.stop();
    // no place for the copy: the hold stands (the live file is the torn bytes' only copy)
    const dn = dirOf('no-place'), fn = path.join(dn, 'n.json'); fs.writeFileSync(fn, 'torn {');
    const hn = H.create({ file: fn, code: 'n', aside: (m) => path.join(dn, 'no-such-folder', 'n.json.corrupt-' + m), words: () => 'n' }); hn.start({ state: 'corrupt', why: 'did not parse' });
    await new Promise((r) => setTimeout(r, 100));
    const rn = H.holds().find((x) => x.file === 'n.json');
    ok(!!hn.held() && !!rn && rn.code === 'torn bytes, not copied' && rn.torn === true && fs.readFileSync(fn, 'utf8') === 'torn {', 'NO PLACE for the copy: the hold stands, said as torn bytes not copied — the live file is their only copy, untouched', rn);
    hn.stop();
    // the preMount should: a mount refused while the tokens are held reconnects after the lift — the sweep's remount waits for the
    // PERSON only on auth words, and a held refusal carries none
    const MSRC = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8'), m = MSRC.match(/if \(!mpOwn && \/([^\n]+?)\/i\.test\(err\)\) return;/);
    const AUTH = m ? new RegExp(m[1], 'i') : null, MW = require('../src/mount-error-words.js');
    const dw = dirOf('premount'), fw = path.join(dw, 'mount-tokens.json'); fs.writeFileSync(fw, '{"tokens": []}');
    const unw = refuse(fw); let tw = null; try { tw = new MountTokens({ dataDir: dw, log: quiet }); } finally { unw(); }
    const words = [tw.refusal ? '' : '', (() => { try { tw.has(['vs', 'mt_'].join('') + 'd'.repeat(48)); return ''; } catch (x) { return x.message; } })(), MW.wordsFor('tokens_unread', {}, { t: (s) => s, lang: 'en' }) || ''];
    ok(!!AUTH && words[1].length > 0 && !words.some((w) => w && AUTH.test(w)), 'THE preMount SHOULD (a reading made a leg): a held refusal\'s words match none of the remount\'s auth words — the sweep reconnects that mount after the lift, never left waiting for a press', words);
    stopOf(tw);
  }
  {
    console.log('⑥ B-f276 family unit 2 (the census, 主开发 r3115): mounts.json HELD — its silence removes nothing');
    // MS2: the client-swap check closes For-you items no memo names — while held its facts read EMPTY: it waits; the lift runs it
    const swapRun = async (X) => {
      const d = dirOf('swap'), f = path.join(d, 'mounts.json'); fs.writeFileSync(f, JSON.stringify(STORES[1].plant(d), null, 2));
      const un = refuse(f); let s = null; try { s = STORES[1].make(d, X); } finally { un(); }
      const calls = []; s.onClientSwaps = (facts, memos) => { calls.push(facts); return memos; };
      await s.clientSwapCheck(); const held = calls.length;
      await s._hold.again(); await until(() => calls.length > held);
      stopOf(s); return { held, after: calls.length };
    };
    const sw = await swapRun(undefined), swx = await swapRun(mutant('src/mounts.js', [["    if (this._hold.held()) return;   // B-f276 family unit 2 (the census's MS2): held, its facts read EMPTY — nothing filed, redrawn or closed; the lift runs the check\n", '']]));
    ok(sw.held === 0 && sw.after >= 1, 'MS2: the client-swap check WAITS while mounts.json is held (its facts read empty — no For-you item closed on them); the lift runs it', sw);
    ok(swx.held >= 1, 'RED CONTROL — the hold not asked (the release\'s road, in a copy): the check runs over the empty facts while held', swx);
    // MS1: the raw-API proposals' sweep ends a proposal whose credential is gone — a mount's lent client is UNKNOWN while held
    const cardsRun = (CARDS, held) => {
      const d = dirOf('cards'), rejected = [];
      const prop = { id: 'ap-made-0001', cred: 'mount:mnt-made0001', status: 'pending', at: Date.now(), principal: { kind: 'conversation', id: 'conv-made', name: 'made-up' }, method: 'GET', host: 'api.example.invalid', path: '/v1/made' };
      const c = CARDS.create({ dataDir: d, api: { ownerView: () => ({ ok: true, ...(held ? { mountsHeld: true } : {}), creds: [], proposals: [prop] }), reject: (id, o) => { rejected.push([id, o && o.reason]); } }, timer: false, log: { warn() { }, log() { } } });
      return c.sync().then(() => { c.stop(); return rejected; });
    };
    const CARDS = require('../src/server/channel-api-cards.js');
    const r1 = await cardsRun(CARDS, true), r2 = await cardsRun(CARDS, false);
    const CX = mutant('src/server/channel-api-cards.js', [["      if (!credIds.has(p.cred)) return mountsHeld && String(p.cred || '').startsWith('mount:') ? null : 'the account was removed';", "      if (!credIds.has(p.cred)) return 'the account was removed';"]]);
    const r3 = await cardsRun(CX, true);
    ok(r1.length === 0 && r2.some(([id, why]) => id === 'ap-made-0001' && /the account was removed/.test(String(why))), 'MS1: a raw-API proposal on a mount\'s lent client is NOT ended while mounts.json is held (unknown); a store that READ and lends no such client ends it as before', { held: r1, read: r2 });
    ok(r3.length === 1, 'RED CONTROL — the hold not asked (the release\'s road, in a copy): the held store\'s silence ends the proposal as «the account was removed»', r3);
    const CA = fs.readFileSync(path.join(REPO, 'src/server/channel-api.js'), 'utf8');
    ok(/const mountsHeld = \(\(\) => \{ try \{ const m = getMounts\(\); return !!\(m && typeof m\.unreadWords === 'function' && m\.unreadWords\(\)\); \}/.test(CA) && CA.includes("ok: true, ...(mountsHeld ? { mountsHeld: true } : {}), creds:"), 'the owner view says mounts.json is held (pin: the view the sweep reads)');
  }
  {
    console.log('⑦ B-f276 family unit 2 commit 3 (主开发 r3115 (2)): A REMOVER NEVER REMOVES WHAT A KEPT COPY OF TORN BYTES STILL NAMES');
    // the helper's question itself
    const dq = dirOf('copies-q'), fq = path.join(dq, 'q.json'); fs.writeFileSync(fq, '{}'); fs.writeFileSync(fq + '.corrupt-1700000000000', '{"items": [{"id": "keep-me"');
    const C = H.copiesOf({ file: fq, prefix: 'q.json.corrupt-' });
    const before = C.names('anything-at-all');   // not read yet: unknown keeps
    await C.refresh();
    const a1 = C.names('keep-me'), a2 = C.names('other');
    fs.unlinkSync(fq + '.corrupt-1700000000000'); await C.refresh();
    const a3 = C.names('keep-me');
    const rdq = fs.promises.readdir; fs.promises.readdir = function (p, ...x) { if (String(p) === dq) return Promise.reject(Object.assign(new Error('EIO (placed)'), { code: 'EIO' })); return rdq.call(fs.promises, p, ...x); };
    try { await C.refresh(); } finally { fs.promises.readdir = rdq; }
    const a4 = C.names('never-written');
    ok(before === true && a1 === true && a2 === false && a3 === false && a4 === true, 'copiesOf: an id a kept copy holds (as a JSON string) is NAMED, another is not; the copy cleared: not named; not read yet, or its folder did not answer: NAMED (unknown keeps)', { before, a1, a2, a3, a4 });
    // machine-mounts: the orphan token sweep — the restart-proof half (no mark: a list that READ, a copy beside it naming the token)
    const MMd = (d, revoked) => ({ dataDir: d, hosts: { get: () => null, findByDeviceId: () => null }, mountTokens: { list: () => [{ id: 'tok-made0001', kind: 'reverse-mount' }], revoke: (id) => revoked.push(id) }, broadcast() { }, log() { } });
    const mmRun = async (MOD, tag, copy) => {
      const d = dirOf(tag), f = path.join(d, 'machine-mounts.json'); fs.writeFileSync(f, '{"mounts": []}');
      if (copy) fs.writeFileSync(f + '.corrupt-1700000000000', '{"mounts": [{"id": "mm-made0001", "dir": "push", "tokenId": "tok-made0001"');
      const revoked = [], M = new MOD.MachineMounts(MMd(d, revoked)); clearInterval(M._sweep);
      try { await M.restore(); } catch { }
      return revoked;
    };
    const MMM = require('../src/machine-mounts.js');
    const m1 = await mmRun(MMM, 'mm-copy', true), m2 = await mmRun(MMM, 'mm-nocopy', false);
    const mx = await mmRun(mutant('src/machine-mounts.js', [["          if (this._copies().names(t.id)) { unknown++; continue; }", ""]]), 'mm-copy-ctl', true);
    ok(m1.length === 0 && m2.join() === 'tok-made0001', 'machine-mounts\' orphan sweep (a restart: no mark): a token a kept copy names is KEPT; with no copy it is revoked as today', { m1, m2 });
    ok(mx.join() === 'tok-made0001', 'RED CONTROL — the copies not asked (in a copy): the sweep revokes the token the kept copy names', mx);
    // hosts.json: the transcript caches (H1)
    const hRun = async (MOD, tag, copy) => {
      const d = dirOf(tag), f = path.join(d, 'hosts.json'); fs.writeFileSync(f, '{"hosts": []}');
      fs.mkdirSync(path.join(d, 'remote-jsonl', 'h-made0001'), { recursive: true }); fs.writeFileSync(path.join(d, 'remote-jsonl', 'h-made0001', 'a.jsonl'), '{}\n');
      if (copy) fs.writeFileSync(f + '.corrupt-1700000000000', '{"hosts": [{"id": "h-made0001", "name": "made-up"');
      const Hm = new MOD.HostManager({ dataDir: d });
      await Hm._copies().refresh(); Hm.sweepJsonlCache();
      return fs.existsSync(path.join(d, 'remote-jsonl', 'h-made0001'));
    };
    const HM = require('../src/hosts.js');
    const h1 = await hRun(HM, 'h-copy', true), h2 = await hRun(HM, 'h-nocopy', false);
    const hx = await hRun(mutant('src/hosts.js', [["      if (!live.has(d)) { if (this.namedByCopy(d)) continue; try {", "      if (!live.has(d)) { try {"]]), 'h-copy-ctl', true);
    ok(h1 === true && h2 === false, 'hosts.json (H1): a machine a kept copy names keeps its transcript cache; with no copy the cache is removed as today', { h1, h2 });
    ok(hx === false, 'RED CONTROL — the copies not asked (in a copy): the cache of the machine the copy names is removed');
    // the exit lists (H2)
    const prune = (EP, named) => { const set = []; const me = Object.create(EP.ExitProxyManager.prototype); Object.assign(me, { _grants: () => ({ rowsOfDoor: () => [{ resource: 'h-made0001:use', except: [] }, { resource: 'h-made0002:run', except: [] }], setMany: (rows) => { set.push(...rows.map((r) => r.resource)); return { ok: true }; } }), hosts: { held: () => false, namedByCopy: (id) => named.has(id) }, _hosts: () => [], log() { } }); me.pruneLists(); return set; };
    const EPm = require('../src/exit-proxy.js');
    const e1 = prune(EPm, new Set(['h-made0001'])), e2 = prune(EPm, new Set());
    const ex = prune(mutant('src/exit-proxy.js', [["return !ids.has(id) && !named(id);", "return !ids.has(id);"]]), new Set(['h-made0001']));
    ok(e1.join() === 'h-made0002:run' && e2.length === 2, 'the exit lists (H2): a machine a kept copy names keeps its two lists; the others are pruned as today', { e1, e2 });
    ok(ex.includes('h-made0001:use'), 'RED CONTROL — the copies not asked (in a copy): the named machine\'s lists are emptied', ex);
    // the desktop-app records (H3): a machine a kept copy names is «unavailable», never «not a paired machine» (the keeper drops on that)
    const daCall = async (DA, id) => { const A = DA.create({ hosts: { get: () => null, isLocal: () => false, namedByCopy: (x) => x === 'h-made0001', deviceBounded: async () => { throw new Error('never asked'); }, unreadWords: () => null }, install: false }); try { await A.call(id, 'status', {}); return 'ok'; } catch (e) { return e && e.code; } };
    const DAm = require('../src/server/desktop-access.js');
    const d1 = await daCall(DAm, 'h-made0001'), d2 = await daCall(DAm, 'h-made0002');
    const dx = await daCall(mutant('src/server/desktop-access.js', [["    if (!hostKnown(hostId)) throw namedByCopy(hostId) ? named('host_unavailable', 'this machine is no longer listed (the machines list was damaged and a kept copy still names it) — its records are kept, nothing is removed') : named('unsupported-host',", "    if (!hostKnown(hostId)) throw named('unsupported-host',"]]), 'h-made0001');
    ok(d1 === 'host_unavailable' && d2 === 'unsupported-host', 'the desktop-app records (H3): a machine a kept copy names is UNAVAILABLE (the keeper keeps its records); another unknown machine is «not a paired machine» as today', { d1, d2 });
    ok(dx === 'unsupported-host', 'RED CONTROL — the copies not asked (in a copy): «not a paired machine» — the keeper would drop its records', dx);
    // jobs: the keeper's release (J1) — a job no longer listed that a kept copy names is unknown
    const J = require('../src/browser-job-principal.js');
    const jm = { jobs: new Map(), namedByCopy: (id) => id === 'jb-made0001' };
    const JX = mutant('src/browser-job-principal.js', [["  if (!j && jm && typeof jm.namedByCopy === 'function') { try { if (jm.namedByCopy(String(jobId))) return 'unknown'; } catch { return 'unknown'; } }", ""]]);
    ok(J.jobRunningIn(jm, 'jb-made0001') === 'unknown' && J.jobRunningIn(jm, 'jb-made0002') === false && JX.jobRunningIn(jm, 'jb-made0001') === false, 'jobs (J1): a job no longer listed that a kept copy names is UNKNOWN (its handle kept); another is not running as today; RED CONTROL (in a copy): read as not running');
    const VJD = fs.readFileSync(path.join(REPO, 'src/server/vault-job-door.js'), 'utf8');
    ok(VJD.includes("keep: (x) => !!(jm && (jm.jobs.has(x) || (typeof jm.namedByCopy === 'function' && jm.namedByCopy(String(x)))))"), 'jobs (J3, pin): the vault-job row\'s prune keeps a job a kept copy names');
  }
  {
    console.log('⑧ round wxzvih2as: A PERSON\'s REMOVAL BEATS THE COPIES; the copies\' answer is never older than the newest copy made');
    const HMb = require('../src/hosts.js'), EPb = require('../src/exit-proxy.js');
    // (1) an old tear's copy names a dial machine; the person pairs it again (the same id, by design), then REMOVES it: its exit lists
    // are pruned, a restart keeps the removal, and paired again it starts at nobody — RED CONTROL: the removal not asked
    const removeRun = async (MOD, tag) => {
      const d = dirOf(tag), f = path.join(d, 'hosts.json'); fs.writeFileSync(f, JSON.stringify({ hosts: [] }));
      fs.writeFileSync(f + '.corrupt-1700000000000', '{"hosts": [{"id": "host-dial-made01", "transport": "dial", "name": "made-up"');
      const Hm = new MOD.HostManager({ dataDir: d });
      const id = Hm.add({ name: 'made-up', transport: 'dial', deviceId: 'made01' });
      await Hm._copies().refresh();
      const before = Hm.namedByCopy(id);
      await Hm.remove(id);
      const set = [], me = Object.create(EPb.ExitProxyManager.prototype);
      Object.assign(me, { _grants: () => ({ rowsOfDoor: () => [{ resource: id + ':use', except: [] }, { resource: id + ':run', except: [] }], setMany: (rows) => { set.push(...rows.map((r) => r.resource)); return { ok: true }; } }), hosts: Hm, _hosts: () => Hm.list(), log() { } });
      me.pruneLists();
      const H2 = new MOD.HostManager({ dataDir: d }); await H2._copies().refresh();
      const afterRestart = H2.namedByCopy(id);
      H2.add({ name: 'made-up', transport: 'dial', deviceId: 'made01' });
      return { id, before, pruned: set.sort().join(), afterRestart, readded: Array.isArray(H2._state.removedIds) && H2._state.removedIds.includes(id) };
    };
    const rm1 = await removeRun(HMb, 'remove-beats');
    const rmx = await removeRun(mutant('src/hosts.js', [["    if (Array.isArray(this._state.removedIds) && this._state.removedIds.includes(String(id))) return false;", ""]]), 'remove-beats-ctl');
    ok(rm1.before === true && rm1.pruned === `${rm1.id}:run,${rm1.id}:use` && rm1.afterRestart === false && rm1.readded === false, 'A PERSON\'s REMOVAL BEATS THE COPIES: a machine a kept copy names, paired again and then REMOVED, loses both exit lists; a restart keeps the removal; paired again it leaves the removed list (it starts at nobody)', rm1);
    ok(rmx.pruned === '' && rmx.afterRestart === true, 'RED CONTROL — the removal not asked (in a copy): the copy keeps the removed machine\'s exit lists, across a restart too', rmx);
    // (2) hosts.json held at the start (no copy then); the bytes tear meanwhile; the read again copies them aside ITSELF and lifts empty:
    // the first remover to ask is told NAMED (the answer invalidated by that copy) — RED CONTROL: the invalidation cut, a stale «not named»
    const staleRun = async (MOD, tag) => {
      const d = dirOf(tag), f = path.join(d, 'hosts.json'); fs.writeFileSync(f, JSON.stringify({ hosts: [{ id: 'host-made02', name: 'made-up', host: 'made.example.invalid', user: 'u' }] }));
      const un = refuse(f); let Hm = null; try { Hm = new MOD.HostManager({ dataDir: d }); } finally { un(); }
      await Hm._copies().refresh();
      fs.writeFileSync(f, '{"hosts": [{"id": "host-made02", "name": "made-up"');
      await Hm._unreadRetry(); await until(() => !Hm.unreadWords());
      const lifted = !Hm.unreadWords() && Hm.list().length === 0, named = Hm.namedByCopy('host-made02');
      await Hm._copies().refresh();
      return { lifted, named, namedRead: Hm.namedByCopy('host-made02') };
    };
    const st1 = await staleRun(HMb, 'stale-copies');
    const stx = await staleRun(mutant('src/hosts.js', [["ok = true; this._copies().invalidate(); } catch {", "ok = true; } catch {"]]), 'stale-copies-ctl');
    ok(st1.lifted && st1.named === true && st1.namedRead === true, 'THE COPIES\' ANSWER IS NEVER OLDER THAN THE NEWEST COPY MADE: a tear found by a read again in a running process — the first remover is told NAMED, and the copies read again name it', st1);
    ok(stx.lifted && stx.named === false, 'RED CONTROL — the store\'s own copy not followed by the invalidation (in a copy): the first remover reads the stale «not named» and would remove it', stx);
  }
} catch (e) {
  fail++; console.log('  ✗ the suite threw: ' + ((e && e.stack) || e));
} finally {
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
