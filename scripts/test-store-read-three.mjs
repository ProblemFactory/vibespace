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
// r4213 (the early hosted run of 2.369.419: a red then green): A TORN START IS READ ONLY ONCE ITS HOLD HAS LIFTED — waited on the lift
// itself (the hold's held() null), never on a count of turns standing in for it (5000 turns are tens of ms while the copy's I/O is
// pending, and the lift's copy is synced); the bound is generous, and its expiry is a NAMED failed line, never a parse of the torn fixture
const LIFT_MS = 20000;
const liftedOrSaid = async (s, what) => { const up = await lifted(s, LIFT_MS); if (!up) ok(false, `the torn start never lifted (${what}) — waited ${LIFT_MS} ms on its lift`, { held: s._hold.held() }); return up; };
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
    const mk = (MM, tokens, rec, calls) => { const S = Object.create(MM.prototype); Object.assign(S, { _state: { mounts: [rec] }, hosts: { held: () => false, unreadWords: () => null }, mountTokens: tokens, _run: async (...a) => { calls.push('run ' + a[1]); }, _save: () => { calls.push('save'); }, _notify: () => { }, _pushTunnelOwned: new Map(), _pushRetryAt: new Map(), _pushDown: new Map(), _live: new Map() }); return S; };
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
    ok(fl.during === 2 && fl.up && fl.copies === 1, 'while the copy\'s listing hangs, two more tries start NO second read (one pool thread a store, one copy of one content) — the try\'s own reads are 2: its read and the FILE\'s second look (r3986)', fl);
    const flx = await inFlight(mutant('src/store-read-hold.js', [['    if (busy || active >= CEILING) return false;', '    if (active >= CEILING) return false;']]), 'busy-ctl');
    ok(flx.during > 2, 'RED CONTROL (round w9jhivwdo (5)) — the in-flight mark cut: the tries start a second read while the copy hangs', flx);
  }
  {
    // 2b (主开发 r3648 / r3790): the two laws hosts.json and machine-mounts.json proved on their own roads (test-store-read-law M2/X5
    // and the read that hangs), proved HERE on the helper first, each with its red — so the stores' legs can be retired as they move
    console.log('⑤ the helper (2b): the next try is armed FIRST — by a try that meets a read in flight, and by a try whose read fails');
    const HSRC = fs.readFileSync(path.join(REPO, 'src/store-read-hold.js'), 'utf8');
    const ARM = HSRC.split('\n').find((l) => l.startsWith('    arm();   // the next try armed FIRST')) + '\n', BUSY = '    if (busy || active >= CEILING) return false;\n';
    ok(HSRC.split(ARM + BUSY).length === 2, 'control setup: the helper arms its next try on the line before its in-flight check (found once)');
    const armScene = async (Mod, tag) => {
      const d = dirOf(tag), f = path.join(d, 'a.json'); fs.writeFileSync(f, '{}');
      const st = globalThis.setTimeout, fns = [];
      // the hold's OWN rungs are caught (never left to fire): each one armed is counted, and fired by the leg when it chooses
      globalThis.setTimeout = function (fn, ms, ...a) { if (String(fn).includes('again().catch(onErr)')) { fns.push(fn); return { unref() { return this; }, ref() { return this; } }; } return st(fn, ms, ...a); };
      const rf = fs.promises.readFile, eio = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
      let phase = 'fail', reads = 0, failHung = null, h = null, out = null;
      fs.promises.readFile = function (p, ...a) { if (String(p) === f) { reads++; if (phase === 'hang') return new Promise((_, rej) => { failHung = rej; }); return Promise.reject(eio()); } return rf.call(fs.promises, p, ...a); };
      try {
        h = Mod.create({ file: f, code: 'a', aside: (m) => f + '.corrupt-' + m, words: () => 'a' });
        h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' });   // held: its first rung armed
        phase = 'hang'; const older = h.again();   // a try whose read hangs: the one read in flight
        await until(() => !!failHung);
        const beforeMeet = fns.length;
        fns[fns.length - 1]();   // the armed rung FIRES while that read is in flight: its try meets it
        await new Promise((r) => setImmediate(r));
        const meetArmed = fns.length > beforeMeet;
        phase = 'fail'; failHung(eio()); await older;   // the read in flight fails
        const beforeFail = fns.length;
        fns[fns.length - 1]();   // the next rung fires: its own read fails at once
        for (let k = 0; k < 5; k++) await new Promise((r) => setImmediate(r));
        out = { meetArmed, failArmed: fns.length > beforeFail, held: !!h.held(), reads };
      } finally { fs.promises.readFile = rf; globalThis.setTimeout = st; if (h) h.stop(); }
      return out;
    };
    const am = await armScene(H, 'arm-first');
    ok(!!am && am.meetArmed && am.failArmed && am.held && am.reads === 2, 'a try that meets a read in flight arms the next try, and so does a try whose own read fails: the tries never end while the store is held (two reads, never more)', am);
    const amx = await armScene(mutant('src/store-read-hold.js', [[ARM + BUSY, BUSY + '    arm();\n']]), 'arm-after-ctl');
    ok(!!amx && !amx.meetArmed, 'RED CONTROL — the next try armed AFTER the in-flight check (in a copy): the try that meets a read in flight arms nothing', amx);
    const amy = await armScene(mutant('src/store-read-hold.js', [[ARM + BUSY, '    if (busy || active >= CEILING) { arm(); return false; }\n']]), 'arm-meet-ctl');
    ok(!!amy && amy.meetArmed && !amy.failArmed, 'RED CONTROL — the next try armed only on a meeting (in a copy): a try whose own read fails arms nothing, and the tries end', amy);

    console.log('⑤ the helper (2b): a read that hangs — one read at most while it hangs, and its late answer is used');
    const LATE = '      if (!held || stopped) return false;\n      a = SR.storeAnswer(read, { valid });\n';
    ok(HSRC.split(LATE).length === 2, 'control setup: the read again judges its answer on the line after the read (found once)');
    const hungScene = async (Mod, tag) => {
      const d = dirOf(tag), f = path.join(d, 'b.json'), body = '{"rows": [1]}'; fs.writeFileSync(f, body);
      const rf = fs.promises.readFile; let reads = 0, release = null, lifts = 0, value = null, h = null, out = null;
      fs.promises.readFile = function (p, ...a) { if (String(p) === f) { reads++; if (!release) return new Promise((res) => { release = () => res(Buffer.from(body)); }); } return rf.call(fs.promises, p, ...a); };
      try {
        h = Mod.create({ file: f, code: 'b', aside: (m) => f + '.corrupt-' + m, words: () => 'b', onLift: (v) => { lifts++; value = v; } });
        h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' });
        const first = h.again();   // its read hangs
        await until(() => !!release);
        const second = await h.again(), third = await h.again();   // two more tries while it hangs
        const during = reads, heldDuring = !!h.held();
        release(); const late = await first;   // the storage answers, late
        out = { during, heldDuring, second, third, late, lifted: !h.held(), lifts, rows: value && Array.isArray(value.rows) ? value.rows.join() : null };
      } finally { fs.promises.readFile = rf; if (h) h.stop(); }
      return out;
    };
    const hg = await hungScene(H, 'hung');
    ok(!!hg && hg.during === 1 && hg.heldDuring && hg.second === false && hg.third === false && hg.late === true && hg.lifted && hg.lifts === 1 && hg.rows === '1', 'while a read hangs two more tries start NO second read (the store stays held); the storage answering late lifts the hold with its records', hg);
    const hgx = await hungScene(mutant('src/store-read-hold.js', [[BUSY, '    if (active >= CEILING) return false;\n']]), 'hung-busy-ctl');
    ok(!!hgx && hgx.during > 1, 'RED CONTROL — the in-flight mark cut (in a copy): each try while the read hangs starts another read', hgx);
    const hgy = await hungScene(mutant('src/store-read-hold.js', [[LATE, '      if (!held || stopped || read) return false;\n      a = SR.storeAnswer(read, { valid });\n']]), 'hung-late-ctl');
    ok(!!hgy && hgy.late === false && !hgy.lifted, 'RED CONTROL — the answer dropped (in a copy): the storage answers and the hold stands', hgy);
  }
  {
    // 2b (主开发 r3790): THE FAMILY's READ BOUND — the machines list's 60 s deadline, the helper's own now for every store on it: a read
    // past its bound is SAID once and let go as the try's own, the hold's facts carry `waiting`, no second read starts while it hangs,
    // and its answer is used the moment it comes. RED: the bound cut (in a copy) — the try waits on the hung read and nothing is said
    console.log('⑤ the helper (2b): a read past its bound — said once, let go, its late answer used');
    const HSRC2 = fs.readFileSync(path.join(REPO, 'src/store-read-hold.js'), 'utf8');
    const RACE = "    const first = await Promise.race([p, new Promise((r) => { tm = setTimeout(() => r(SLOW), ms); tm.unref?.(); })]);\n";
    ok(HSRC2.split(RACE).length === 2, 'control setup: the read\'s bound is found once in the helper');
    const boundScene = async (Mod, tag) => {
      const d = dirOf(tag), f = path.join(d, 'c.json'), body = '{"rows": [2]}'; fs.writeFileSync(f, body);
      const rf = fs.promises.readFile, said = []; let reads = 0, release = null, h = null, out = null;
      fs.promises.readFile = function (p, ...a) { if (String(p) === f) { reads++; if (!release) return new Promise((res) => { release = () => res(Buffer.from(body)); }); } return rf.call(fs.promises, p, ...a); };
      const keep = setInterval(() => { }, 1000);   // the helper's bound timer is unref'd (the hub's own loop keeps it): the scene keeps the loop up while a read hangs
      try {
        h = Mod.create({ file: f, code: 'c', aside: (m) => f + '.corrupt-' + m, words: (x) => (x.waiting ? 'a read waits' : 'read again soon'), log: (m) => said.push(m), readMs: () => 30 });
        h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed' });
        // (the leg's own bound on the try: the red's try never returns while the read hangs)
        const first = await Promise.race([h.again(), new Promise((r) => { const t = setTimeout(() => r('not let go'), 1500); t.unref?.(); })]);
        const facts = h.held(), words = h.words();
        const second = await Promise.race([h.again(), new Promise((r) => { const t = setTimeout(() => r('not let go'), 1500); t.unref?.(); })]);
        const during = reads;
        if (release) release();
        const up = await until(() => !h.held());
        out = { first, second, during, waiting: !!(facts && facts.waiting), words, saidOnce: said.filter((l) => /a read again has not answered in 0\.03 s/.test(l)).length, up };
      } finally { fs.promises.readFile = rf; clearInterval(keep); if (h) h.stop(); }
      return out;
    };
    const bd = await boundScene(H, 'bound');
    ok(!!bd && bd.first === false && bd.waiting && bd.words === 'a read waits' && bd.second === false && bd.during === 1 && bd.saidOnce === 1 && bd.up, 'a read past its bound is let go as the try\'s own (the try answers false), SAID once, carried in the hold\'s facts (`waiting`: the words say a read waits); no second read starts while it hangs; its late answer lifts the hold', bd);
    const bdx = await boundScene(mutant('src/store-read-hold.js', [[RACE, '    const first = await p;\n']]), 'bound-ctl');
    ok(!!bdx && bdx.first === 'not let go' && !bdx.waiting && bdx.saidOnce === 0, 'RED CONTROL — the bound cut (in a copy): the try waits on the hung read, and nothing says it', bdx);
    const LATEJ = '    p.then((late) => judge(late)).catch(onErr);\n';
    ok(HSRC2.split(LATEJ).length === 2, 'control setup: the let-go read\'s late answer is judged on one line (found once)');
    const bdy = await boundScene(mutant('src/store-read-hold.js', [[LATEJ, '']]), 'bound-late-ctl');
    ok(!!bdy && bdy.first === false && !bdy.up, 'RED CONTROL — the late answer not judged (in a copy): the storage answers after the bound and the hold stands', bdy);
  }
  {
    // r3986 (the verifier of 2b, row WAKE — in the release too): «TORN» IS A VERDICT ABOUT THE FILE, NEVER ABOUT ONE READ. By PLACED answers
    // of the read call only (the file on disk is the scene's): a WHOLE file whose read again answers zero bytes (ordinary, and late) or a
    // SHORT read stays HELD — nothing copied as torn — and the next true read brings its records; a file that IS torn on disk lifts as
    // today with the FILE's own bytes kept; a file truly of size zero lifts (its own size states it). RED: the release's verdict on one read
    console.log('⑤ the helper (r3986): «torn» is a verdict about the FILE — a read that answers bytes the file does not hold lifts nothing');
    const HSRC3 = fs.readFileSync(path.join(REPO, 'src/store-read-hold.js'), 'utf8');
    const CONFIRM = "        const look = fileConfirms(read.buf), lookMs = Number(typeof readMs === 'function' ? readMs() : readMs) || READ_MS;\n";   // r4039 (a): the second look, bounded
    ok(HSRC3.split(CONFIRM).length === 2, 'control setup: the torn verdict asks the file once (found once)');
    const RELEASE = mutant('src/store-read-hold.js', [[CONFIRM, "        const look = Promise.resolve(read.buf), lookMs = Number(typeof readMs === 'function' ? readMs() : readMs) || READ_MS;   /* MUTANT: the release — the verdict on ONE read, its own bytes kept */\n"], ["        if (fileBytes.length === 0 && !held.emptyOnce) {\n", "        if (false) {   /* MUTANT: the release — no second rung for an empty answer */\n"]]);
    const body = '{"rows": [1, 2]}';
    const tornScene = async (Mod, tag, { onDisk = body, answer = null, late = false } = {}) => {
      const d = dirOf(tag), f = path.join(d, 'w.json'); fs.writeFileSync(f, onDisk);
      const rf = fs.promises.readFile; let placed = answer !== null, release = null, value = null;
      fs.promises.readFile = function (p, ...a) {
        if (String(p) === f && placed) { placed = false; return late ? new Promise((res) => { release = () => res(answer); }) : Promise.resolve(answer); }
        return rf.call(fs.promises, p, ...a);
      };
      const keep = setInterval(() => { }, 1000);   // (a let-go read's bound timer is unref'd)
      let h = null, out = null;
      try {
        h = Mod.create({ file: f, code: 'w', aside: (m) => f + '.corrupt-' + m, words: () => 'w', onLift: (v) => { value = v; }, readMs: () => 30 });
        h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed (placed)' });
        const first = await h.again();
        if (late) { for (let k = 0; k < 200 && !release; k++) await new Promise((r) => setImmediate(r)); if (release) release(); await until(() => !h.held() || (h.held() && h.held().code === 'a read unlike the file'), 2000); }
        const copies = () => fs.readdirSync(d).filter((x) => x.startsWith('w.json.corrupt-'));
        const afterAnswer = { held: !!h.held(), code: h.held() ? h.held().code : null, copies: copies().length, copyBytes: copies().map((c) => fs.readFileSync(path.join(d, c), 'utf8')).join('|') };
        fs.promises.readFile = rf;
        if (h.held()) await h.again();   // the next TRUE read
        out = { first, afterAnswer, lifted: !h.held(), rows: value && Array.isArray(value.rows) ? value.rows.join() : null, onDisk: fs.readFileSync(f, 'utf8'), copiesAfter: copies().length, copyBytesAfter: copies().map((c) => fs.readFileSync(path.join(d, c), 'utf8')).join('|') };
      } finally { fs.promises.readFile = rf; clearInterval(keep); if (h) h.stop(); }
      return out;
    };
    const zero = await tornScene(H, 'torn-zero', { answer: Buffer.alloc(0) }), zeroLate = await tornScene(H, 'torn-zero-late', { answer: Buffer.alloc(0), late: true });
    const shortR = await tornScene(H, 'torn-short', { answer: Buffer.from('{"rows": [') });
    ok(zero.afterAnswer.held && zero.afterAnswer.copies === 0 && zero.lifted && zero.rows === '1,2' && zero.onDisk === body, 'a WHOLE file whose read again answers ZERO BYTES stays HELD — nothing copied as torn — and the next true read brings its records', zero);
    ok(zeroLate.afterAnswer.held && zeroLate.afterAnswer.copies === 0 && zeroLate.lifted && zeroLate.rows === '1,2', 'the same for the LATE answer of a let-go read (past its bound): held, nothing copied, the next true read brings the records', zeroLate);
    ok(shortR.afterAnswer.held && shortR.afterAnswer.code === 'a read unlike the file' && shortR.afterAnswer.copies === 0 && shortR.lifted && shortR.rows === '1,2', 'a SHORT read of a whole file (fewer bytes than the file holds) is a FAILED read: held, nothing copied, the records back at the next true read', shortR);
    const tornDisk = await tornScene(H, 'torn-disk', { onDisk: '{"rows": [', answer: null }), emptyDisk = await tornScene(H, 'torn-empty', { onDisk: '', answer: null });
    ok(!tornDisk.afterAnswer.held && tornDisk.afterAnswer.copies === 1 && tornDisk.afterAnswer.copyBytes === '{"rows": [' && tornDisk.rows === null, 'a file that IS torn on disk lifts as today — empty, the FILE\'s own bytes kept aside (one copy)', tornDisk);
    ok(emptyDisk.afterAnswer.held && emptyDisk.afterAnswer.code === 'empty, read once more' && emptyDisk.afterAnswer.copies === 0 && emptyDisk.lifted && emptyDisk.copiesAfter === 1 && emptyDisk.copyBytesAfter === '', 'a file truly of size ZERO (its own size states it, both looks agree) lifts as torn on its SECOND rung in a row (r4039 (b)) — its zero bytes kept', emptyDisk);
    const zeroX = await tornScene(RELEASE, 'torn-zero-ctl', { answer: Buffer.alloc(0) }), shortX = await tornScene(RELEASE, 'torn-short-ctl', { answer: Buffer.from('{"rows": [') });
    // r4039 (c): two reads of EQUAL length and different bytes are a failed read (a compare by length alone would pass); the LATE form
    // against the release's verdict; the empty file's two rungs, each with its red
    const sameLen = await tornScene(H, 'torn-same-length', { answer: Buffer.from('x'.repeat(body.length)) });
    const LENONLY = mutant('src/store-read-hold.js', [['again2.equals(buf) ? again2 : null', 'true ? again2 : null']]);
    const sameLenX = await tornScene(LENONLY, 'torn-same-length-ctl', { answer: Buffer.from('x'.repeat(body.length)) });
    ok(sameLen.afterAnswer.held && sameLen.afterAnswer.code === 'a read unlike the file' && sameLen.lifted && sameLen.rows === '1,2', 'r4039 (c): two reads of EQUAL length and different bytes are a FAILED read — held, nothing copied, the records back at the next true read', sameLen);
    ok(!sameLenX.afterAnswer.held && sameLenX.rows === null, 'RED CONTROL — the second look compared by length alone (in a copy): the whole file lifts EMPTY', sameLenX);
    const zeroLateX = await tornScene(RELEASE, 'torn-zero-late-ctl', { answer: Buffer.alloc(0), late: true });
    ok(!zeroLateX.afterAnswer.held && zeroLateX.afterAnswer.copyBytes === '', 'RED CONTROL — the release\'s verdict on ONE read, LATE (in a copy): the late zero-byte answer lifts the whole file EMPTY with a copy of nothing', zeroLateX);
    const EMPTY2 = "        if (fileBytes.length === 0 && !held.emptyOnce) {\n";
    const emptyX = await tornScene(mutant('src/store-read-hold.js', [[EMPTY2, '        if (false) {\n']]), 'torn-empty-ctl', { onDisk: '', answer: null });
    ok(!emptyX.afterAnswer.held && emptyX.afterAnswer.copies === 1, 'RED CONTROL — the empty file\'s second rung cut (in a copy): one empty moment empties the store at once', emptyX);
    // r4069: the empty answers' «read once more» mark is reset by ANY judged read between two empty ones — a read unlike the file, a
    // missing answer, a torn file of bytes whose copy failed: two empties NOT in a row lift nothing; two in a row still lift. The file on
    // disk is the scene's (empty; torn bytes for the one rung that asks them); the placed answers are the read call's only
    const rowScene = async (Mod, tag, between) => {
      const d = dirOf(tag), f = path.join(d, 'w.json'); fs.writeFileSync(f, '');
      const rf = fs.promises.readFile; let placed = null, badAside = false;
      fs.promises.readFile = function (p, ...a) { if (String(p) === f && placed) { const x = placed; placed = null; return x(); } return rf.call(fs.promises, p, ...a); };
      const keepT = setInterval(() => { }, 1000);
      let h = null, out = null;
      try {
        h = Mod.create({ file: f, code: 'w', aside: (m) => (badAside ? path.join(d, 'no-such-folder', 'w.json.corrupt-' + m) : f + '.corrupt-' + m), words: () => 'w', onLift: () => { }, readMs: () => 30 });
        h.start({ state: 'unreadable', code: 'EIO', why: 'the read failed (placed)' });
        await h.again();   // ① the first empty: held, read once more
        const one = h.held() ? h.held().code : null;
        if (between === 'unlike') placed = () => Promise.resolve(Buffer.from('{"rows": ['));
        if (between === 'missing') placed = () => Promise.reject(Object.assign(new Error('ENOENT: not there (placed)'), { code: 'ENOENT' }));
        if (between === 'copy-failed') { fs.writeFileSync(f, '{"rows": ['); badAside = true; }
        await h.again();   // ② the answer between
        const two = h.held() ? h.held().code : null;
        fs.writeFileSync(f, ''); badAside = false; placed = null;
        await h.again();   // ③ an empty again — NOT in a row with ①
        const three = { held: !!h.held(), code: h.held() ? h.held().code : null };
        await h.again();   // ④ the second empty IN A ROW
        out = { one, two, three, lifted: !h.held() };
      } finally { fs.promises.readFile = rf; clearInterval(keepT); if (h) h.stop(); }
      return out;
    };
    const NORESET = mutant('src/store-read-hold.js', [
      ["      if (a.state === 'missing' && !missingAt) { missingAt = now(); held.emptyOnce = false; return false; }", "      if (a.state === 'missing' && !missingAt) { missingAt = now(); return false; }   /* MUTANT: 5ed0769ee — no reset */"],
      ["          held.emptyOnce = false;   // r4069: a read unlike the file breaks the empty answers' row\n", ''],
      ["        if (fileBytes.length) held.emptyOnce = false;   // r4069: a torn file of bytes breaks it too (its copy may fail: it stays held)\n", '']]);
    const rowWant = { unlike: 'a read unlike the file', missing: null, 'copy-failed': 'torn bytes, not copied' };
    for (const between of Object.keys(rowWant)) {
      const r = await rowScene(H, 'empty-row-' + between, between), x = await rowScene(NORESET, 'empty-row-ctl-' + between, between);
      ok(!!r && r.one === 'empty, read once more' && !!r.two && (rowWant[between] === null || r.two === rowWant[between]) && r.three.held && r.three.code === 'empty, read once more' && r.lifted, `r4069: an empty file, then ${between === 'unlike' ? 'a read unlike the file' : between === 'missing' ? 'a missing answer' : 'a torn file of bytes whose copy failed'}, then empty again — the second empty is NOT in a row: still held, read once more; the next empty in a row lifts`, r);
      ok(!!x && !!x.two && !x.three.held, `RED CONTROL — the mark not reset there (5ed0769ee, in a copy): the two empties that are not in a row lift the store (${between})`, x);
    }
    // r4039 (c): THE FIRST READ AT A START — the caller's own read answered torn bytes while the file is whole: the start's road reads
    // the file again, and a placed empty answer there is a failed read too (held), then the next true read brings the records
    const startScene = async (tag, placed) => {
      const d = dirOf(tag), f = path.join(d, 's.json'); fs.writeFileSync(f, body);
      const rf = fs.promises.readFile; let once = placed !== null, value = null, h = null;
      fs.promises.readFile = function (p, ...a) { if (String(p) === f && once) { once = false; return Promise.resolve(placed); } return rf.call(fs.promises, p, ...a); };
      try {
        h = H.create({ file: f, code: 's', aside: (m) => f + '.corrupt-' + m, words: () => 's', onLift: (v) => { value = v; } });
        h.start({ state: 'corrupt', why: 'the caller read torn bytes (placed)' });
        await until(() => !h.held() || (h.held() && h.held().code === 'a read unlike the file'), 2000);
        const mid = { held: !!h.held(), copies: fs.readdirSync(d).filter((x) => x.startsWith('s.json.corrupt-')).length };
        fs.promises.readFile = rf;
        if (h.held()) await h.again();
        return { mid, lifted: !h.held(), rows: value && Array.isArray(value.rows) ? value.rows.join() : null };
      } finally { fs.promises.readFile = rf; if (h) h.stop(); }
    };
    const st0 = await startScene('start-torn-whole', null), st1 = await startScene('start-torn-whole-empty', Buffer.alloc(0));
    ok(!st0.mid.held && st0.mid.copies === 0 && st0.rows === '1,2' && st1.mid.held && st1.mid.copies === 0 && st1.rows === '1,2', 'r4039 (c): a FIRST read at a start that answered torn bytes of a whole file lifts with its records (the start reads the file again); a placed empty answer there is a failed read, held, then the records', { st0, st1 });
    // r4039 (a): THE SECOND LOOK HAS THE FIRST READ'S BOUND: a stat that hangs there is said (the waiting fact, the same line), then used
    const lookScene = async (Mod, tag) => {
      const d = dirOf(tag), f = path.join(d, 'l.json'); fs.writeFileSync(f, '{"rows": [');
      const st = fs.promises.stat, said = []; let release = null, h = null, value = 'unset';
      fs.promises.stat = function (p, ...a) { if (String(p) === f && !release) return new Promise((res, rej) => { release = () => st.call(fs.promises, p, ...a).then(res, rej); }); return st.call(fs.promises, p, ...a); };
      const keep = setInterval(() => { }, 1000);
      try {
        h = Mod.create({ file: f, code: 'l', aside: (m) => f + '.corrupt-' + m, words: (x) => (x.waiting ? 'a read waits' : 'l'), log: (m) => said.push(m), onLift: (v) => { value = v; }, readMs: () => 30 });
        h.start({ state: 'unreadable', code: 'EIO', why: 'placed' });
        const p = h.again();
        await until(() => !!release && !!(h.held() && h.held().waiting), 1500);
        const during = { waiting: !!(h.held() && h.held().waiting), words: h.words(), saidOnce: said.filter((l) => /a read again has not answered in 0\.03 s/.test(l)).length };
        if (release) release();
        await p; await until(() => !h.held(), 2000);
        return { during, lifted: !h.held(), copies: fs.readdirSync(d).filter((x) => x.startsWith('l.json.corrupt-')).length };
      } finally { fs.promises.stat = st; clearInterval(keep); if (h) h.stop(); }
    };
    const lk = await lookScene(H, 'look-bound');
    const LOOKRACE = "        let fileBytes = await Promise.race([look, new Promise((r) => { tmL = setTimeout(() => r(SLOW), lookMs); tmL.unref?.(); })]);\n";
    const lkx = await lookScene(mutant('src/store-read-hold.js', [[LOOKRACE, '        let fileBytes = await look;\n']]), 'look-bound-ctl');
    ok(lk.during.waiting && lk.during.words === 'a read waits' && lk.during.saidOnce === 1 && lk.lifted && lk.copies === 1, 'r4039 (a): a second look that hangs past the bound is SAID — the waiting fact (the words say a read waits) and the first read\'s own line, once — and its answer is used when it comes', lk);
    ok(!lkx.during.waiting && lkx.during.saidOnce === 0, 'RED CONTROL — the second look with no bound (in a copy): it hangs and nothing says it', lkx);
    ok(!zeroX.afterAnswer.held && zeroX.afterAnswer.copies === 1 && zeroX.afterAnswer.copyBytes === '' && !shortX.afterAnswer.held && shortX.afterAnswer.copyBytes === '{"rows": [', 'RED CONTROL — the release\'s verdict on ONE read (in a copy): the zero-byte answer lifts the whole file EMPTY with a copy of nothing, the short read lifts it with a copy of its half — the next save would write over every record', { zeroX, shortX });
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
    const wrx = await wholeRun(mutant('src/store-read-hold.js', [["      const w = await writeWhole(to, bytes, log);   // r3144: whole under a part name, synced, put in place only when whole", "      const w = await fs.promises.writeFile(to, bytes, { flag: 'wx', mode: 0o600 }).then(() => ({ ok: true }), (error) => ({ error }));"]]), 'whole-ctl');
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
    const saidN = [];
    const hn = H.create({ file: fn, code: 'n', aside: (m) => path.join(dn, 'no-such-folder', 'n.json.corrupt-' + m), words: () => 'n', log: (l) => saidN.push(l) }); hn.start({ state: 'corrupt', why: 'did not parse' });
    await until(() => H.holds().some((x) => x.file === 'n.json' && x.code === 'torn bytes, not copied'));   // r4039 (c): on its fact, never a fixed wait
    const rn = H.holds().find((x) => x.file === 'n.json');
    ok(!!hn.held() && !!rn && rn.code === 'torn bytes, not copied' && rn.torn === true && fs.readFileSync(fn, 'utf8') === 'torn {', 'NO PLACE for the copy: the hold stands, said as torn bytes not copied — the live file is their only copy, untouched', rn);
    ok(saidN.filter((l) => /n\.json: its torn bytes could not be kept aside \(ENOENT\) — it stays held, nothing is written over it, and it is read again/.test(l)).length === 1, 'r3986 (3): a copy that cannot be made is SAID in the journal by name (its error\'s code, never a path), once', saidN);
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
    const jm = { ready: true, jobs: new Map(), namedByCopy: (id) => id === 'jb-made0001' };   // r3571: a READY engine (one that cannot say yet answers unknown for every id)
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
    const staleRun = async (MOD, tag, cut = false) => {   // cut: the RED — the copies' invalidation cut on that store's own copies (2b: the keep that makes the copy is the helper's)
      const d = dirOf(tag), f = path.join(d, 'hosts.json'); fs.writeFileSync(f, JSON.stringify({ hosts: [{ id: 'host-made02', name: 'made-up', host: 'made.example.invalid', user: 'u' }] }));
      const un = refuse(f); let Hm = null; try { Hm = new MOD.HostManager({ dataDir: d }); } finally { un(); }
      await Hm._copies().refresh();
      if (cut) Hm._copies().invalidate = () => { };   /* RED: the helper's keep makes its copy and asks no read again of the copies */
      fs.writeFileSync(f, '{"hosts": [{"id": "host-made02", "name": "made-up"');
      await Hm.readAgain(); await until(() => !Hm.unreadWords());
      const lifted = !Hm.unreadWords() && Hm.list().length === 0, named = Hm.namedByCopy('host-made02');
      await Hm._copies().refresh();
      return { lifted, named, namedRead: Hm.namedByCopy('host-made02') };
    };
    const st1 = await staleRun(HMb, 'stale-copies');
    const stx = await staleRun(HMb, 'stale-copies-ctl', true);
    ok(st1.lifted && st1.named === true && st1.namedRead === true, 'THE COPIES\' ANSWER IS NEVER OLDER THAN THE NEWEST COPY MADE: a tear found by a read again in a running process — the first remover is told NAMED, and the copies read again name it', st1);
    ok(stx.lifted && stx.named === false, 'RED CONTROL — the copy not followed by the invalidation (cut on that store\'s copies): the first remover reads the stale «not named» and would remove it', stx);
    // ── round wjgchwl6a's follow (r3274) ──
    const H8 = require('../src/store-read-hold.js');
    // (1) THE GENERATION: a read already in flight when the invalidation comes (it listed the folder BEFORE the new copy) sets NOTHING, and
    // the awaited read settles after the follow-up. RED CONTROL: the generation checks cut (in a copy) — the old answer comes back
    const genRun = async (HM, tag) => {
      const d = dirOf(tag), f = path.join(d, 'made.json');
      fs.writeFileSync(f + '.corrupt-1700000000001', '{"items": [{"id": "made-old-01"}]}');
      const C = HM.copiesOf({ file: f, prefix: 'made.json.corrupt-' });
      await C.refresh();
      const rd = fs.promises.readdir, held = [];
      fs.promises.readdir = function (p, ...a) { const got = rd.call(fs.promises, p, ...a); return path.resolve(String(p)) !== d ? got : got.then((list) => new Promise((res) => held.push(() => res(list)))); };
      try {
        const first = C.refresh(); let settled = false; first.then(() => { settled = true; }, () => { settled = true; });   // read A: its listing taken, its answer held open
        await until(() => held.length === 1);
        fs.writeFileSync(f + '.corrupt-1700000000002', '{"items": [{"id": "made-new-02"}]}');   // the store's own copy, then its invalidation
        C.invalidate();
        held.shift()();   // A ends after the invalidation
        await until(() => held.length === 1);   // the follow-up read B is in flight (its answer held open)
        const during = C.names('made-new-02'), early = settled;
        held.shift()(); await first;
        return { during, early, after: C.names('made-new-02') };
      } finally { fs.promises.readdir = rd; }
    };
    const g1 = await genRun(H8, 'copies-gen');
    const gx = await genRun(mutant('src/store-read-hold.js', [["        if (g !== gen) return;   // invalidated meanwhile: the follow-up reads\n", ''], ["        if (g !== gen) return;   // the generation check: an old read never puts its answer back over an invalidation\n", '']]), 'copies-gen-ctl');
    ok(g1.during === true && g1.early === false && g1.after === true, 'THE GENERATION (round wjgchwl6a (1)): a read in flight across the invalidation sets nothing — the new copy\'s id is NAMED while the follow-up reads, and the awaited read settles only after it', g1);
    ok(gx.during === false, 'RED CONTROL — the generation checks cut (in a copy): the read that listed before the new copy puts its old answer back («not named»)', gx);
    // (3) + (7) THE SCAN: a string of ANY length is read whole (a long one never shifts the quotes' pairing in a one-line copy), and a key's
    // own list is left out (hosts' removed list). RED CONTROL: the old bounded match (in a copy) loses the id after the long string
    const oneLine = JSON.stringify({ hosts: [{ id: 'host-made-a', note: 'x'.repeat(300) }, { id: 'host-made-b' }], removedIds: ['host-made-gone'] });
    const sc = H8._idsOfText(oneLine, ['removedIds']);
    const scx = mutant('src/store-read-hold.js', [[String.raw`re = /"((?:[^"\\\n]|\\.)*)"/g`, String.raw`re = /"((?:[^"\\\n]|\\.){1,240})"/g`]])._idsOfText(oneLine, ['removedIds']);
    ok(sc.has('host-made-a') && sc.has('host-made-b') && !sc.has('x'.repeat(300)) && !sc.has('host-made-gone'), 'THE SCAN (round wjgchwl6a (3), (7)): a one-line copy\'s ids after a 300-character string are read; the long string and the removed list are no ids', [...sc]);
    ok(!scx.has('host-made-b'), 'RED CONTROL — the old bounded match (in a copy): after the long string the pairing shifts and the id is lost', [...scx]);
    // (2) AN IMPORT THAT DROPS A MACHINE is a person's removal: written into the removed list, so its exit lists go though a copy names it.
    // RED CONTROL: the import's note cut (in a copy) — the copy keeps the dropped machine's exit lists
    const importRun = async (MOD, tag) => {
      const d = dirOf(tag), f = path.join(d, 'hosts.json'); fs.writeFileSync(f, JSON.stringify({ hosts: [] }));
      fs.writeFileSync(f + '.corrupt-1700000000000', '{"hosts": [{"id": "host-dial-made03", "transport": "dial", "name": "made-up"');
      const Hm = new MOD.HostManager({ dataDir: d });
      const id = Hm.add({ name: 'made-up', transport: 'dial', deviceId: 'made03' });
      await Hm._copies().refresh();
      const before = Hm.namedByCopy(id), r = Hm.importBundle({ hosts: [] });
      const set = [], me = Object.create(EPb.ExitProxyManager.prototype);
      Object.assign(me, { _grants: () => ({ rowsOfDoor: () => [{ resource: id + ':use', except: [] }, { resource: id + ':run', except: [] }], setMany: (rows) => { set.push(...rows.map((x) => x.resource)); return { ok: true }; } }), hosts: Hm, _hosts: () => Hm.list(), log() { } });
      me.pruneLists();
      return { id, before, listed: Hm.list().length, pruned: set.sort().join(), skipped: !!(r && r.skipped) };
    };
    const im1 = await importRun(HMb, 'import-drops');
    const imx = await importRun(mutant('src/hosts.js', [["    { const now = new Set(hosts.map((r) => r && String(r.id))); for (const old of before) if (old && !now.has(String(old.id))) this._noteRemoved(old.id); for (const id of now) this._noteAdded(id); }\n", '']]), 'import-drops-ctl');
    ok(im1.before === true && im1.listed === 0 && !im1.skipped && im1.pruned === `${im1.id}:run,${im1.id}:use`, 'AN IMPORT THAT DROPS A MACHINE (round wjgchwl6a (2)) is a person\'s removal: a machine a kept copy names, dropped by the import, loses both exit lists', im1);
    ok(imx.pruned === '', 'RED CONTROL — the import\'s note cut (in a copy): the copy keeps the dropped machine\'s exit lists', imx);
    // (9) THE SCAN's TIME, measured on the machine that runs this (said, never judged by a clock here): a made-up jobs list of about 4 MiB,
    // written as src/jobs.js writes it (indent 1)
    { const big = JSON.stringify(Array.from({ length: 9000 }, (_, i) => ({ id: 'jb-' + String(i).padStart(8, '0'), kind: 'task', name: 'made-up job ' + i, cmd: { argv: ['sh', '-c', 'echo made-up '.repeat(20)] }, state: 'done', owner: { conversation: { backend: 'claude', id: 'conv-made-' + i } }, runs: [{ at: 1700000000000 + i, exit: 0 }] })), null, 1);
      const t0 = process.hrtime.bigint(), got = H8._idsOfText(big), ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const turns = H8._turnsOf(big), union = new Set(); let longest = 0;
      for (const p of turns) { const t1 = process.hrtime.bigint(); for (const x of H8._idsOfText(p)) union.add(x); longest = Math.max(longest, Number(process.hrtime.bigint() - t1) / 1e6); }
      console.log(`    (the ids' scan: ${(big.length / 1048576).toFixed(2)} MiB, ${got.size} strings, ${ms.toFixed(1)} ms here in one turn; in ${turns.length} turns the longest ${longest.toFixed(1)} ms)`);
      ok(turns.length >= 4 && turns.slice(0, -1).every((p) => p.endsWith('\n')) && turns.join('') === big && union.size === got.size && [...got].every((x) => union.has(x)), 'THE SCAN IN TURNS (round wjgchwl6a (9)): a copy of about 5 MiB is scanned in turns of whole lines, the loop given back between them — the same ids as one scan', { turns: turns.length });
      const HT = mutant('src/store-read-hold.js', [['const SCAN_TURN = 1024 * 1024;', 'const SCAN_TURN = 64 * 1024 * 1024;']]);
      ok(HT._turnsOf(big).length === 1, 'RED CONTROL — the turn at the copy\'s size (in a copy): the whole copy is scanned in one loop turn');
      ok(fs.readFileSync(path.join(REPO, 'src/store-read-hold.js'), 'utf8').includes('if (k + 1 < turns.length) await new Promise((r) => setImmediate(r)); }   // the loop is given back between turns'), 'THE SCAN IN TURNS (pin): the copies\' read gives the loop back between turns');
      ok(got.has('jb-00008999') && got.has('conv-made-8999'), 'THE SCAN reads a made-up jobs list of about 4 MiB whole (round wjgchwl6a (9): its time is said in the line above)', { size: got.size, bytes: big.length }); }
    // the reader table (r3230): mounts.json HELD — borrowing a mount's own sign-in client is refused BY NAME (storage_unread, 503 at the
    // channels' door), never «that storage mount no longer exists». RED CONTROL: the held branch cut (in a copy)
    { const borrow = (X, tag) => { const d = dirOf(tag), f = path.join(d, 'mounts.json'); fs.writeFileSync(f, JSON.stringify({ mounts: [], shares: [] }));
        const un = refuse(f); let m = null; try { m = new X.MountManager({ dataDir: d }); } finally { un(); }
        const e = tryCode(() => m.oauthClientIdOf('mnt-made0001')); const held = !!m.unreadWords(); stopOf(m); return { held, code: e && e.code, words: e && e.message }; };
      const b1 = borrow({ MountManager }, 'borrow-held');
      const bx = borrow(mutant('src/mounts.js', [["    if (!m) { const held = this.unreadWords(); if (held) throw refuse('storage_unread', held); throw refuse('mount-gone', 'that storage mount no longer exists'); }", "    if (!m) throw refuse('mount-gone', 'that storage mount no longer exists');"]]), 'borrow-held-ctl');
      ok(b1.held && b1.code === 'storage_unread' && /mounts\.json/.test(String(b1.words)), 'the reader table: mounts.json HELD — borrowing a mount\'s sign-in client is refused by name, never «that storage mount no longer exists»', b1);
      ok(bx.held && bx.code === 'mount-gone', 'RED CONTROL — the held branch cut (in a copy): the borrow is told the mount no longer exists', bx);
      const CA = fs.readFileSync(path.join(REPO, 'src/server/channels-auth.js'), 'utf8');
      ok(CA.includes("code === 'no-mounts' || code === 'storage_unread' ? 503 :"), 'the reader table (pin): the channels\' door answers the held refusal 503 (the family\'s status), never the 409 of a mount with no client'); }
    // ── THE MOVE, part one (r3192's owed rows; r3360): the hosts page's torn words, and a machine's mounts after a torn hosts lift ──
    { const MMv = require('../src/machine-mounts.js').MachineMounts;
      // a machine mount whose machine is NOT LISTED: named by a kept copy (after the copies are read) ⇒ `hostInCopy`; removed by the person,
      // or no copy ⇒ the old «removed machine» row. RED CONTROL: the flag never set (in a copy) — the mount reads as on a removed machine
      // part one's words follow (r3792): three answers — named (`hostInCopy`), not named (the old row), and UNKNOWN (`hostUnknown`: the
      // copies not read yet, a copy that cannot be read, more copies than the look reads), said neutrally; the page TOLD once they are read
      const flagRun = async (MMX, tag, { copy = true, removed = false, many = false, unreadable = false } = {}) => {
        const d = dirOf(tag), f = path.join(d, 'hosts.json'); fs.writeFileSync(f, JSON.stringify({ hosts: [] }));
        if (copy) fs.writeFileSync(f + '.corrupt-1700000000000', '{"hosts": [{"id": "host-dial-made04", "transport": "dial", "name": "made-up"');
        if (many) for (let k = 1; k <= 20; k++) fs.writeFileSync(f + '.corrupt-17000000' + String(10000 + k), '{"hosts": [{"id": "host-dial-other' + k + '"');   // twenty NEWER copies: the one that names made04 falls out of the look
        const un = unreadable ? refuse(f + '.corrupt-1700000000000') : () => { };
        try {
          const Hm = new HMb.HostManager({ dataDir: d });
          if (removed) { const id = Hm.add({ name: 'made-up', transport: 'dial', deviceId: 'made04' }); await Hm.remove(id); }
          const told = [];
          const mk = () => { const S = Object.create(MMX.prototype); Object.assign(S, { hosts: Hm, broadcast: (m) => told.push(m && m.type), _state: { mounts: [{ id: 'mm-made04', dir: 'push', hostId: 'host-dial-made04', folder: '/srv/made', mountpoint: '/mnt/made', mode: 'ro' }] } }); return S; };
          const row0 = mk().list()[0] || {};   // the copies' read still in flight (the start asked it)
          await Hm._copies().refresh();
          for (let k = 0; k < 8; k++) await new Promise((r) => setImmediate(r));   // (the tell's own turns)
          const row = mk().list()[0] || {};
          return { early: !!row0.hostInCopy, earlyUnknown: !!row0.hostUnknown, flag: !!row.hostInCopy, unknown: !!row.hostUnknown, told: told.filter((t) => t === 'machine-mounts-updated').length };
        } finally { un(); }
      };
      const fNamed = await flagRun(MMv, 'move-flag'), fNone = await flagRun(MMv, 'move-flag-none', { copy: false }), fGone = await flagRun(MMv, 'move-flag-removed', { removed: true });
      const fMany = await flagRun(MMv, 'move-flag-many', { many: true }), fUnr = await flagRun(MMv, 'move-flag-unread', { unreadable: true });
      const MMSRC = fs.readFileSync(path.join(REPO, 'src/machine-mounts.js'), 'utf8');
      const TELL = 'this._tellWhenCopiesRead(); return null; }', WHOLE = "    if (typeof h.copiesWhole === 'function' && !h.copiesWhole()) return null;   // more copies than the look reads: an older one may name it\n";
      ok(MMSRC.split(TELL).length === 2 && MMSRC.split(WHOLE).length === 2 && MMSRC.split('    if (named) return true;\n').length === 2, 'control setup: the unknown answer, its tell, the look\'s cut and the named answer are each found once in machine-mounts.js');
      const fx = await flagRun(mutant('src/machine-mounts.js', [['    if (named) return true;\n', '']]).MachineMounts, 'move-flag-ctl');
      ok(fNamed.flag === true && fNamed.early === false && fNone.flag === false && !fNone.unknown && fGone.flag === false && !fGone.unknown, 'THE MOVE (part one): a machine mount whose machine is not listed but a kept copy of the torn hosts list names carries hostInCopy (never «removed») — only once the copies are read; no copy, or the person\'s removal: the old row', { fNamed, fNone, fGone });
      ok(fx.flag === false, 'RED CONTROL — the flag never set (in a copy): the mount reads as on a removed machine, and its row offers «unmount to clean up»', fx);
      ok(fNamed.earlyUnknown && fNone.earlyUnknown && !fGone.earlyUnknown && !fGone.early && fNamed.told === 1 && !fNamed.unknown, 'THE WORDS FOLLOW (r3792): while the copies are not read yet a mount whose machine is not listed is UNKNOWN (hostUnknown: neither «removed» nor «may still name») — a person\'s removal is «removed» at once — and the page is TOLD once, when the copies are read', { fNamed, fNone, fGone });
      ok(fMany.unknown && !fMany.flag && fUnr.unknown && !fUnr.flag && fUnr.told === 0, 'THE WORDS FOLLOW: more copies than the look reads (an older one names the machine) is UNKNOWN, never «removed»; a copy that cannot be read is UNKNOWN, and nothing is told while none is read', { fMany, fUnr });
      const fxT = await flagRun(mutant('src/machine-mounts.js', [[TELL, 'return null; }']]).MachineMounts, 'move-flag-tell-ctl');
      const fxE = await flagRun(mutant('src/machine-mounts.js', [[TELL, 'return false; }']]).MachineMounts, 'move-flag-early-ctl');
      const fxW = await flagRun(mutant('src/machine-mounts.js', [[WHOLE, '']]).MachineMounts, 'move-flag-many-ctl', { many: true });
      ok(fxT.told === 0 && fxE.earlyUnknown === false && fxW.unknown === false, 'RED CONTROLS (each in a copy) — the tell cut: the page is never told the copies were read; the unknown answer cut (part one\'s road): the first moments draw the mount as on a removed machine; the look\'s cut not asked: a machine an older copy names is «removed»', { fxT, fxE, fxW });
      // r3813 (the verifier's two facts, same follow): a REMOUNT on a machine not listed is refused as «not in the machines list» — never
      // «start its daemon» (the page offers no Remount there); a PUSH UNMOUNT whose machine side was not reached SAYS so (not listed, or no
      // answer), its token revoked and its record dropped as before
      const sideRun = async (MMX, tag, { listed = false, run = null, method = 'rclone-webdav' } = {}) => {   // run: the machine's answer, in the product's real shape (r3982 (1): `_run` RESOLVES, it never throws)
        const d = dirOf(tag); fs.writeFileSync(path.join(d, 'machine-mounts.json'), JSON.stringify({ mounts: [
          { id: 'mm-push01', dir: 'push', hostId: 'host-made07', folder: '/srv/made', mountpoint: '/mnt/made', mode: 'ro', method, tokenId: 'tok-made07', createdAt: 1 },
          { id: 'mm-pull01', dir: 'pull', hostId: 'host-made07', remotePath: '/srv/r', mountpoint: path.join(d, 'pulled'), createdAt: 1 }] }));
        const revoked = [];
        // r4039 (g): a machine that does not reply, in the product's OWN shape — a DIAL record whose device is not dialed in: the real `_run`
        // answers for it (no stand-in of the run); a given `run` stands in for an ssh machine's own answers
        const hosts = { get: (id) => { if (listed) return run ? { id, name: 'made-up', transport: 'ssh', host: 'made.example.invalid', user: 'u' } : { id, name: 'made-up', transport: 'dial', deviceId: 'made07' }; throw Object.assign(new Error('host not found'), { code: 'host_not_found' }); }, findByDeviceId: () => null, held: () => false, deviceBounded: async () => { throw new Error('the device is not dialed in (placed)'); }, dataPlaneOn: () => false };
        const M = new MMX({ dataDir: d, hosts, mountTokens: { list: () => [], revoke: (t) => revoked.push(t) }, broadcast() { }, log() { } }); clearInterval(M._sweep);
        if (listed && run) M._run = run;   // (an ssh machine's answer; the dial machine's is the product's own road)
        let re = null; if (!listed) { try { await M.remount('mm-pull01'); re = 'answered'; } catch (e) { re = e && e.code; } }   // (a LISTED ssh machine reads as online: its remount would start a real pull — not asked here)
        const un = await M.unmount('mm-push01');
        return { re, side: un && un.machineSide, revoked: revoked.join(), left: M.list().map((m) => m.id).join() };
      };
      const sNL = await sideRun(MMv, 'side-not-listed'), sNR = await sideRun(MMv, 'side-no-answer', { listed: true });
      const sSSH = await sideRun(MMv, 'side-ssh-fails', { listed: true, run: async () => ({ code: 255, stdout: '', stderr: 'ssh: connect to host made.example.invalid port 22: Connection refused (placed)' }) });   // ssh's own failure
      const sOK = await sideRun(MMv, 'side-reached', { listed: true, run: async () => ({ code: 0, stdout: '', stderr: '' }) });   // reached: nothing to say
      // r4039 (d): the NET-USE road — a run killed, timed out or ended with no code of its own (`_run`'s own shape: `ended: 'no-code'`) never reached its end there
      const sNU = await sideRun(MMv, 'side-netuse-no-code', { listed: true, method: 'net-use', run: async () => ({ code: 1, stdout: '', stderr: 'Command failed (placed)', ended: 'no-code' }) });
      const sNUok = await sideRun(MMv, 'side-netuse-reached', { listed: true, method: 'net-use', run: async () => ({ code: 2, stdout: '', stderr: 'The network connection could not be found (placed)' }) });   // it ran there: its own code
      const NOCODE = "    if (r.refusal || r.code === 255 || r.ended === 'no-code' || r.code == null || /^device unreachable: /.test(String(r.stderr || ''))) return true;";
      const sNUx = await sideRun(mutant('src/machine-mounts.js', [[NOCODE, "    if (r.refusal || r.code === 255 || /^device unreachable: /.test(String(r.stderr || ''))) return true;"]]).MachineMounts, 'side-netuse-ctl', { listed: true, method: 'net-use', run: async () => ({ code: 1, stdout: '', stderr: 'Command failed (placed)', ended: 'no-code' }) });
      ok(sNU.side === 'not-reached' && sNUok.side === undefined && sNUx.side === undefined, 'r4039 (d): the net-use road — a run killed, timed out or with no code of its own is NOT REACHED; a run that ended with its own code reached the machine; RED (in a copy): the no-code end read as reached', { sNU, sNUok, sNUx });
      ok(sNL.re === 'machine_not_listed' && sNL.side === 'not-listed' && sNL.revoked === 'tok-made07' && sNL.left === 'mm-pull01' && sNR.side === 'not-reached' && sNR.revoked === 'tok-made07', 'r3813: a remount on a machine NOT LISTED is refused as such (machine_not_listed — never «start its daemon»); a push unmount there answers machineSide not-listed (and not-reached when the machine did not answer) — its token revoked, its record dropped', { sNL, sNR });
      ok(sSSH.side === 'not-reached' && sOK.side === undefined && sOK.revoked === 'tok-made07', 'r3982 (1): the machine side NOT REACHED is read from the run\'s OWN result — the device road\'s «device unreachable» and ssh\'s own failure (255) say not-reached; a run that answered says nothing', { sNR, sSSH, sOK });
      const NRL = "        if (this._notReached(r, { cannotFail: true })) side = 'not-reached';   // r3982 (1): the run RESOLVES on a machine that does not reply — its own result says so\n";
      const sRX = await sideRun(mutant('src/machine-mounts.js', [[NRL, '']]).MachineMounts, 'side-throw-only-ctl', { listed: true });
      ok(sRX.side === undefined, 'RED CONTROL — the release\'s read of a throw only (in a copy): the unreachable machine\'s own answer is read as reached, and the person is told plainly «Unmounted»', sRX);
      const MMS2 = fs.readFileSync(path.join(REPO, 'src/machine-mounts.js'), 'utf8');
      const RENL = "MW.refusal(this._hostListed(rec.hostId) ? 'machine_offline_start' : 'machine_not_listed')", SIDE = "    return { ok: true, ...(side ? { machineSide: side } : {}) };\n";
      ok(MMS2.split(RENL).length === 2 && MMS2.split(SIDE).length === 2, 'control setup: the remount\'s refusal and the unmount\'s answer are each found once in machine-mounts.js');
      const sX = await sideRun(mutant('src/machine-mounts.js', [[RENL, "MW.refusal('machine_offline_start')"], [SIDE, '    return { ok: true };\n']]).MachineMounts, 'side-ctl');
      ok(sX.re === 'machine_offline_start' && sX.side === undefined, 'RED CONTROLS (in a copy) — the release\'s words: «start its daemon» for a machine not listed, and an unmount that answers done with nothing said of the machine side', sX);
      const NR_L = 'Unmounted here — its machine is not in the list now, so the machine’s side was not reached; its link no longer opens anything', NR_R = 'Unmounted here — its machine did not answer, so the folder may still be mounted on that machine; its link no longer opens anything. Unmount it on that machine once it is back';   // r4039 (e)
      const MWS = fs.readFileSync(path.join(REPO, 'src/mount-error-words.js'), 'utf8'), NLW = 'this machine is not in the machines list now — pair it again before mounting here, or unmount this mount';
      const SMr = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8'), zhr = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), jar = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
      ok(SMr.includes("if (!m.live && !(m.errorParams && m.errorParams.held) && !h.notListed) {") && SMr.includes('if (pushGone && !h.notListed) {') && (SMr.match(/, notListed: true \}, m\)\);/g) || []).length === 3
        && SMr.includes(`r && r.machineSide === 'not-listed' ? tr('${NR_L}')`) && SMr.includes(`r && r.machineSide === 'not-reached' ? tr('${NR_R}')`) && MWS.includes(`machine_not_listed: i18nKey('${NLW}')`)
        && [NR_L, NR_R, NLW].every((w) => zhr.includes(`"${w}":`) && jar.includes(`"${w}":`)), 'r3813 (pins): the three sections of machines not listed offer no Remount; the unmount\'s toast says a machine side not reached; the refusal\'s words (zh, ja beside)');
      // r3982 (2): a PERSON's removal is «removed» at once — asked before the copies; more copies than the look reads never make it unknown
      const fGoneMany = await flagRun(MMv, 'move-flag-removed-many', { removed: true, many: true });
      const RBP = "    if (typeof h.removedByPerson === 'function' && h.removedByPerson(hostId)) return false;";
      const fGoneManyX = await flagRun(mutant('src/machine-mounts.js', [[RBP, '']]).MachineMounts, 'move-flag-removed-many-ctl', { removed: true, many: true });
      ok(!fGoneMany.unknown && !fGoneMany.flag && !fGoneMany.earlyUnknown, 'r3982 (2): a machine the person REMOVED is «removed» at once, even with more copies than the look reads', fGoneMany);
      ok(fGoneManyX.unknown === true, 'RED CONTROL — the removal asked after the copies (in a copy): over twenty copies, the removed machine is drawn as unknown', fGoneManyX);
      // r3982 (3): after a torn boot the one-time legacy ingest runs at the NEXT start — the lift marks it owed in the list it saves
      const legacyRun = async (MMX, tag, { dup = false, noLegacy = false } = {}) => {   // r4039 (f): dup — the list already holds that mount point; noLegacy — nothing to ingest
        const d = dirOf(tag), f = path.join(d, 'machine-mounts.json'), LEG = path.join(d, 'host-mounts.json'); fs.writeFileSync(f, '{"mounts": [');
        if (!noLegacy) fs.writeFileSync(LEG, JSON.stringify({ mounts: [{ id: 'old-made08', hostId: 'host-made08', folder: '/srv/old', mountpoint: '/mnt/old' }] }));
        const mkM = () => { const M = new MMX({ dataDir: d, hosts: { get: () => null, findByDeviceId: () => null, held: () => false }, mountTokens: { list: () => [], revoke() { } }, broadcast() { }, log() { } }); clearInterval(M._sweep); return M; };
        const M1 = mkM();
        if (!(await liftedOrSaid(M1, `the legacy ingest's torn start, ${tag}`))) { M1._hold.stop(); return { liftMissed: tag }; }   // the torn start: held while its copy is made, then the lift (r4213: waited on the lift)
        const afterLift = { legacyLeft: fs.existsSync(LEG), owed: !!(JSON.parse(fs.readFileSync(f, 'utf8')).legacyOwed) };
        if (dup) { M1._state.mounts.push({ id: 'mm-same08', dir: 'push', hostId: 'host-made08', folder: '/srv/same', mountpoint: '/mnt/old', tokenId: 'tok-same08', createdAt: 2 }); M1._save(); }   // a person's mount on that mount point meanwhile
        M1._hold.stop();
        const M2 = mkM();   // the next start: the list reads as data
        const next = { ingested: M2.list().some((m) => m.id === 'old-made08'), migrated: fs.existsSync(LEG + '.migrated'), markGone: !JSON.parse(fs.readFileSync(f, 'utf8')).legacyOwed, ids: M2.list().map((m) => m.id).sort().join() }; M2._hold.stop();
        return { ...afterLift, ...next };
      };
      const lg = await legacyRun(MMv, 'legacy-owed');
      const OWE = "    if (a.state !== 'data' && atLift) this._state.legacyOwed = true;\n";
      const lgx = await legacyRun(mutant('src/machine-mounts.js', [[OWE, '']]).MachineMounts, 'legacy-owed-ctl');
      ok(lg.legacyLeft && lg.owed && lg.ingested && lg.migrated, 'r3982 (3): after a torn boot the one-time ingest of the legacy mount stores is OWED (marked in the list the lift saves) and runs at the NEXT start', lg);
      ok(!lgx.ingested && !lgx.migrated, 'RED CONTROL — no mark (in a copy): the torn lift saves, the next start reads data, and the legacy store is never ingested', lgx);
      const lgN = await legacyRun(MMv, 'legacy-owed-none', { noLegacy: true }), lgD = await legacyRun(MMv, 'legacy-owed-dup', { dup: true });
      const PAID = "this._migrateLegacy(); this._save(); }   // r4039 (f)", SKIP = ".filter((r) => !have.has(r.id) && !(r.mountpoint && have.has(r.mountpoint)));";
      const lgNx = await legacyRun(mutant('src/machine-mounts.js', [[PAID, 'this._migrateLegacy(); }   // r4039 (f)']]).MachineMounts, 'legacy-owed-none-ctl', { noLegacy: true });
      const lgDx = await legacyRun(mutant('src/machine-mounts.js', [[SKIP, ';']]).MachineMounts, 'legacy-owed-dup-ctl', { dup: true });
      ok(lg.markGone && lgN.markGone && lgD.ids === 'mm-same08', 'r4039 (f): the owed mark is SAVED AWAY once it is paid — with no legacy store there too; the owed ingest SKIPS a record whose mount point the list already holds', { lg, lgN, lgD });
      ok(!lgNx.markGone && lgDx.ids === 'mm-same08,old-made08', 'RED CONTROLS (each in a copy) — the mark kept after its ingest (every start says it again); the owed ingest adding the same mount point twice', { lgNx, lgDx });
      // r3982 (4): the machines list's lift ORDER — the records loaded, THEN the waits run (a wait sees the machines)
      const orderRun = async (HMX, tag) => {
        const d = dirOf(tag), f = path.join(d, 'hosts.json'); fs.writeFileSync(f, JSON.stringify({ hosts: [{ id: 'host-made09', name: 'made-up', host: 'made.example.invalid', user: 'u' }] }));
        const un = refuse(f); let H = null; try { H = new HMX.HostManager({ dataDir: d }); } finally { un(); }
        const seen = []; H.whenRead(() => seen.push(H.list().length), 'a made-up wait');
        await H.readAgain(); for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r));
        H._hold.stop(); return { seen: seen.join() };
      };
      const LIFTLOAD = "    this._loadAnswer(value ? { state: 'data', value } : { state: 'missing' });\n", WAITS = "    for (const fn of waits) { try { fn(); } catch (e) { console.warn('[hosts] a wait for the machines failed:', e && e.message); } }\n";
      const od = await orderRun(HMb, 'lift-order'), odx = await orderRun(mutant('src/hosts.js', [[LIFTLOAD, ''], [WAITS, WAITS + LIFTLOAD]]), 'lift-order-ctl');
      ok(od.seen === '1', 'r3982 (4): the lift loads the records, THEN runs what waited for the machines — the wait sees the machine', od);
      ok(odx.seen === '0', 'RED CONTROL — the waits before the load (in a copy): a wait runs over the empty, held list', odx);
      // r3982 (5): the mounts' held words while a read is past the helper's bound
      const mw = MMv.prototype._heldWords.call({}, { code: 'EIO', waiting: 1 }), mw0 = MMv.prototype._heldWords.call({}, { code: 'EIO' });
      ok(/a read of it is still waiting for the storage to answer, and its answer is used the moment it comes/.test(mw) && !/still waiting/.test(mw0) && /reads it again every few minutes/.test(mw0), 'r3982 (5): machine-mounts.json\'s held words say a read waits while the helper\'s bound has let one go — and the ladder\'s words otherwise', { mw, mw0 });
      // the torn lift's copy, said: hosts.tornCopy() names it at boot; the route carries it; the page says it, and keeps the flagged mounts
      // out of «removed machines» (zh, ja beside)
      const dT = dirOf('move-torn'), fT = path.join(dT, 'hosts.json'); fs.writeFileSync(fT, '{"hosts": [{"id": "host-made05"');
      const HT = new HMb.HostManager({ dataDir: dT });
      await liftedOrSaid(HT, 'the torn hosts.json at boot');   // 2b: HELD while its bytes are copied aside off the loop — waited on the lift itself (r4213)
      const tc = HT.tornCopy();
      const ER = fs.readFileSync(path.join(REPO, 'src/server/exit-routes.js'), 'utf8'), SM = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
      const H1 = 'VibeSpace could not use its list of machines (the file was damaged), so it started empty. The old bytes are kept beside it as {name}. The mounts below are kept and their records are not removed. A device that pairs again gets its mounts back; an ssh machine added again counts as a new machine, so its old mounts stay below until you unmount them.';
      const SEC = 'Mounts on machines not in the list now — kept', ROWW = '(not listed now)';   // the words follow's neutral section (r3792)
      const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
      ok(typeof tc === 'string' && /^hosts\.json\.corrupt-\d+$/.test(tc) && fs.existsSync(path.join(dT, tc)) && HT.list().length === 0, 'THE MOVE: a torn hosts.json at boot — the list starts empty and tornCopy() names its kept copy', { tc });
      // H6 (r3451), in 2b: a torn hosts.json that STAYS torn is kept aside ONCE per content — the machines list's instance of the helper's
      // law, its red the helper's own (② «a second start over the SAME torn bytes makes no second copy», the comparison cut)
      const h6 = await (async () => { const d = dirOf('h6-once'), f = path.join(d, 'hosts.json'); fs.writeFileSync(f, '{"hosts": [{"id": "host-made06", "dialTokenHash": "' + 'f'.repeat(64) + '"');
        const named = [];
        for (let k = 0; k < 3; k++) { const H = new HMb.HostManager({ dataDir: d }); await liftedOrSaid(H, `H6, start ${k + 1} of the same torn hosts.json`); named.push(H.tornCopy()); H._hold.stop(); }   // r4213: waited on the lift
        return { copies: fs.readdirSync(d).filter((n) => n.startsWith('hosts.json.corrupt-')).length, named }; })();
      ok(h6.copies === 1 && h6.named.every((x) => x && x === h6.named[0]), 'H6 (r3451, 2b): a torn hosts.json that stays torn — three starts, ONE kept copy (the helper\'s keep, off the loop), and every start names it', h6);
      // r3986 (the verifier's WAKE row, the machines list's own scene; its red is the helper's ⑤ «the release's verdict on ONE read»): a
      // WHOLE hosts.json held at its start whose read again answers ZERO BYTES stays held — no copy of nothing — and the next true read
      // brings every machine; the file on disk is as it was (no save can write over it while held)
      const wake = await (async () => {
        const d = dirOf('wake-empty-read'), f = path.join(d, 'hosts.json');
        const whole = JSON.stringify({ hosts: [{ id: 'host-made10', name: 'made-up', host: 'made.example.invalid', user: 'u' }, { id: 'host-dial-made11', name: 'made-up dial', transport: 'dial', deviceId: 'made11', dialTokenHash: 'e'.repeat(64) }] });
        fs.writeFileSync(f, whole);
        const un = refuse(f); let Hw = null; try { Hw = new HMb.HostManager({ dataDir: d }); } finally { un(); }
        const rf = fs.promises.readFile; let once = true;
        fs.promises.readFile = function (p, ...a) { if (String(p) === f && once) { once = false; return Promise.resolve(Buffer.alloc(0)); } return rf.call(fs.promises, p, ...a); };
        try { await Hw.readAgain(); } finally { fs.promises.readFile = rf; }
        const afterEmpty = { held: !!Hw.unreadWords(), copies: fs.readdirSync(d).filter((n) => n.startsWith('hosts.json.corrupt-')).length };
        await Hw.readAgain();
        const back = Hw.list().map((h) => h.id).sort().join();
        Hw._hold.stop();
        return { afterEmpty, back, onDisk: fs.readFileSync(f, 'utf8') === whole };
      })();
      ok(wake.afterEmpty.held && wake.afterEmpty.copies === 0 && wake.back === 'host-dial-made11,host-made10' && wake.onDisk, 'r3986 (the verifier\'s WAKE, the machines list): a whole hosts.json held at its start whose read again answers ZERO BYTES stays held — no copy of nothing — and the next true read brings every machine; the file is as it was', wake);
      ok(ER.includes("...(typeof hosts.tornCopy === 'function' && hosts.tornCopy() ? { torn: hosts.tornCopy() } : {})") && SM.includes("if (hd && typeof hd.torn === 'string' && hd.torn) hlist.appendChild(") && SM.includes('!liveHostIds.has(m.hostId) && !m.hostInCopy') && SM.includes('!liveHostIds.has(m.hostId) && m.hostInCopy') && SM.includes('!liveHostIds.has(m.hostId) && !m.hostInCopy && !m.hostUnknown') && SM.includes('!liveHostIds.has(m.hostId) && !m.hostInCopy && m.hostUnknown') && SM.includes(`tr('${SEC}')`) && SM.includes(`tr('${ROWW}')`) && [SEC, ROWW].every((w) => zh.includes(`"${w}":`) && ja.includes(`"${w}":`)) && SM.includes(`tr('${H1}'`) && zh.includes(`"${H1}":`) && ja.includes(`"${H1}":`), 'THE MOVE (pins): GET /api/hosts carries the torn copy; the page says it (zh, ja) and keeps a flagged mount out of «removed machines», in its own section where the person\'s unmount stays theirs'); }
  }
} catch (e) {
  fail++; console.log('  ✗ the suite threw: ' + ((e && e.stack) || e));
} finally {
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
