#!/usr/bin/env node
// test-agentd-watch-guard — THE DEVICE AGENT'S WATCHES NEVER END IT (lane bl-machines-b, 主开发 2026-11-19, found by the readers
// of the hub's watch hotfix). A watch can fail AFTER it was armed (the machine's limit of file watches), and an 'error' event
// with no listener ends the process. On Linux node's own recursive watch is worse: a subfolder refused later THROWS from
// node's callback past every listener (node 24) or is swallowed at arming (node 22) — so the agent walks the tree itself.
// FAST, PURE + source text:
//   §1 armWatch (src/agentd/watch-guard.js), the native recursive road (macOS / Windows), over a stand-in fs and fake timers:
//      the listener AT ONCE; a late error closes, drops, says once per feature and falls back to a SWEEP (the feature's own
//      kick every 60 s, its timer unref'd); a refusal at arming said and swept; a missing folder silent; endWatches.
//   §2 THE LINUX TREE: one plain watch per folder, each in a try with its own listener; a 'rename' arms the new subfolder; a
//      new subfolder refused by the limit is caught, said, swept; a folder gone drops its watch; a link is not followed.
//      A REAL tree of folders on this machine (node's FSWatcher) armed the same way.
//   §3 src/opencode-events.js (it rides the bundle): a store watch that errors or closes LEAVES the list (the 10 s list
//      refresh takes its place) and a later connect arms it again.
//   §4 THE CENSUS BY MEANING (acorn tokens of every file of the daemon's require closure): every watch of an `fs` binding —
//      a member (fs.watch / fs.watchFile / fs.promises.watch, called or as a value), a destructured one, an inline required
//      one — is armWatch's own, carries its 'error' listener in the same statement, or is a named row; the hub's watch door
//      is required by no module of the closure.
//   §5 the wiring in agentd.js.
//   CONTROLS (14): no listener · no sweep · endWatches without its close loop · the arm-time catch removed · the tree's
//      catch removed · the store's dead watch kept · the reconnect without its lost check · a planted destructured watch ·
//      an inline required one · an alias · one destructured from the fs binding · a recursive one with its listener · a
//      second bare watch in a named row's file · a watch-door require.
// Run: node scripts/test-agentd-watch-guard.mjs
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { anchored, scratch } from './scratch.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
const acorn = require('acorn');
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1500) : '')); } };
const rd = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const GUARD_SRC = rd('src/agentd/watch-guard.js'), OE_SRC = rd('src/opencode-events.js');
const modOf = (text) => { const m = { exports: {} }; new Function('module', 'exports', 'require', 'setInterval', 'clearInterval', text)(m, m.exports, require, setInterval, clearInterval); return m.exports; };
const WG = require(path.join(REPO, 'src/agentd/watch-guard.js'));
const OE = require(path.join(REPO, 'src/opencode-events.js'));
const ENOSPC = () => Object.assign(new Error('ENOSPC: System limit for number of file watchers reached'), { code: 'ENOSPC' });
const emitSafely = (w, e) => { try { w.emit('error', e); return null; } catch (x) { return x; } };
/** Fake timers: the sweep's interval is recorded (and whether it was unref'd), never armed for real; tick() runs it once. */
const fakeTimers = () => { const t = { live: new Set(), setInterval: (fn, ms) => { const h = { fn, ms, unrefd: false, unref() { h.unrefd = true; } }; t.live.add(h); return h; }, clearInterval: (h) => { t.live.delete(h); }, tick: () => { for (const h of [...t.live]) h.fn(); } }; return t; };
const mkWatcher = (made, dir, cb) => { const w = new EventEmitter(); w.dir = dir; w.cb = cb; w.closed = false; w.close = () => { w.closed = true; }; made.push(w); return w; };
/** A stand-in fs for the native road: watch() hands back an EventEmitter, or throws on the asked form with the asked code. */
const standIn = ({ recursiveThrows = null, plainThrows = null } = {}) => {
  const made = [];
  return { made, watch(dir, a, b) {
    const recursive = !!(a && typeof a === 'object' && a.recursive);
    if (recursive && recursiveThrows) throw Object.assign(new Error(recursiveThrows), { code: recursiveThrows });
    if (!recursive && plainThrows) throw Object.assign(new Error(plainThrows), { code: plainThrows });
    const w = mkWatcher(made, dir, typeof a === 'function' ? a : b); w.recursive = recursive; return w;
  } };
};
const ctxOf = (F, T, lines, { said = new Set(), platform = 'darwin' } = {}) => ({ fs: F, log: (m) => lines.push(m), said, setInterval: T.setInterval, clearInterval: T.clearInterval, platform });

console.log('§1 the native recursive road (macOS / Windows): the listener at once; a lost watch closes, says once, sweeps');
{
  const F = standIn(), T = fakeTimers(), lines = [], list = [];
  let kicks = 0; const kick = () => { kicks++; };
  const ctx = ctxOf(F, T, lines);
  const w = WG.armWatch(ctx, list, '/h/.claude/projects', kick, 'discovery-watch');
  ok(!!w && w.recursive && list.length === 1 && w.listenerCount('error') === 1 && T.live.size === 0, 'the recursive watch is armed, kept in its list, and carries its error listener the moment armWatch returns; no sweep while it lives');
  const thrown = emitSafely(w, ENOSPC());
  ok(thrown === null && w.closed && list.length === 0, 'an error AFTER arming throws nothing: that watcher is closed and dropped from its list', thrown && thrown.message);
  ok(lines.length === 1 && lines[0] === 'discovery-watch: the watch on /h/.claude/projects ended (ENOSPC) — it falls back to a sweep every 60 s', 'the agent\'s log says it once, with the feature, the folder, the cause and the sweep', lines);
  const [h] = [...T.live];
  ok(T.live.size === 1 && h.ms === WG.SWEEP_MS && WG.SWEEP_MS === 60000 && list.sweep === h && h.unrefd === true, 'THE FALLBACK IS REAL: the feature kicks itself every 60 s — one sweep a feature list, its timer UNREF\'D (it never holds the agent up)');
  T.tick(); T.tick();
  ok(kicks === 2, 'each sweep tick is the feature\'s own kick (discovery pushes discovery-dirty, usage walks)', kicks);
  emitSafely(WG.armWatch(ctx, list, '/h/.claude/sessions', kick, 'discovery-watch'), ENOSPC());
  ok(lines.length === 1 && T.live.size === 1, 'said ONCE per feature for the process (the said-set lives with the process), swept once', lines);
  WG.endWatches(ctx, list);
  ok(list.ended === true && T.live.size === 0 && list.length === 0 && WG.armWatch(ctx, list, '/h/x', kick, 'discovery-watch') === null, 'endWatches (the link\'s end) stops the sweep; an ended list arms nothing more');
}
{
  const F = standIn(), T = fakeTimers(), lines = [], list = [], ctx = ctxOf(F, T, lines);
  const a = WG.armWatch(ctx, list, '/h/a', () => { }, 'discovery-watch'), b = WG.armWatch(ctx, list, '/h/b', () => { }, 'discovery-watch');
  WG.endWatches(ctx, list);
  ok(a.closed && b.closed && list.length === 0 && emitSafely(a, ENOSPC()) === null && !lines.length && T.live.size === 0, 'endWatches closes every LIVE watcher; a late error on one (a walk still in flight) throws, says and sweeps nothing');
}
{
  const F = standIn({ recursiveThrows: 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM' }), T = fakeTimers(), list = [], lines = [];
  const w = WG.armWatch(ctxOf(F, T, lines), list, '/h/p', () => { }, 'usage-events-watch');
  ok(!!w && !w.recursive && !lines.length && emitSafely(w, ENOSPC()) === null && T.live.size === 1, 'no recursive watch on this platform: the plain fallback carries the same listener and the same sweep');
}
{
  const F = standIn({ recursiveThrows: 'ENOSPC' }), T = fakeTimers(), list = [], lines = [];
  const w = WG.armWatch(ctxOf(F, T, lines), list, '/h/p', () => { }, 'discovery-watch');
  ok(!!w && list.length === 1 && /the recursive watch on \/h\/p could not be armed \(ENOSPC\); its subfolders are not watched — it falls back to a sweep every 60 s$/.test(lines[0] || '') && T.live.size === 1, 'a recursive watch refused by the LIMIT (the plain one armed): its subfolders said lost, once, and swept', lines);
}
const bothRefused = (M) => { const F = standIn({ recursiveThrows: 'ENOSPC', plainThrows: 'ENOSPC' }), T = fakeTimers(), lines = []; let r, threw = null; try { r = M.armWatch(ctxOf(F, T, lines), [], '/h/p', () => { }, 'discovery-watch'); } catch (e) { threw = e; } return { r, threw, lines, swept: T.live.size }; };
{
  const b = bothRefused(WG);
  ok(b.threw === null && b.r === null && b.lines.length === 1 && /could not be armed \(ENOSPC\) — it falls back to a sweep every 60 s$/.test(b.lines[0]) && b.swept === 1, 'both forms REFUSED at arming by the limit: nothing thrown, said once, swept', b.lines);
  const F = standIn({ recursiveThrows: 'ENOENT', plainThrows: 'ENOENT' }), T = fakeTimers(), lines = [];
  ok(WG.armWatch(ctxOf(F, T, lines), [], '/gone', () => { }, 'discovery-watch') === null && !lines.length && T.live.size === 0, 'a folder that does not exist ⇒ null, nothing said, no sweep (as before)');
}
{
  const M = modOf(anchored(GUARD_SRC, /  w\.on\('error', \(e\) => \{\n    try \{ w\.close\(\); \} catch \{ \}[\s\S]*?\n  \}\);\n/, '', 'guard-without-listener'));
  const w = M.armWatch(ctxOf(standIn(), fakeTimers(), []), [], '/h/p', () => { }, 'discovery-watch');
  const thrown = emitSafely(w, ENOSPC());
  ok(!!thrown && (thrown.code === 'ENOSPC' || /Unhandled 'error' event/.test(thrown.message)), 'CONTROL: the guard without its listener — the late error THROWS out of the watcher (the agent would end) — RED', thrown && thrown.message);
  const M2 = modOf(anchored(GUARD_SRC, '  sweep(ctx, list, onChange);\n}', '}', 'guard-without-sweep')), T2 = fakeTimers();
  emitSafely(M2.armWatch(ctxOf(standIn(), T2, []), [], '/h/p', () => { }, 'discovery-watch'), ENOSPC());
  ok(T2.live.size === 0, 'CONTROL: the guard without its sweep — a lost watch leaves the feature with no kick at all — RED');
  const M3 = modOf(anchored(GUARD_SRC, '  for (const w of list.splice(0)) { try { w.close(); } catch { } }\n', '', 'endWatches-without-close')), L3 = [];
  const a3 = M3.armWatch(ctxOf(standIn(), fakeTimers(), []), L3, '/h/p', () => { }, 'discovery-watch'); M3.endWatches({}, L3);
  ok(!a3.closed, 'CONTROL: endWatches without its close loop leaves the live watcher open (a leak per re-dial) — RED');
  const M4 = modOf(anchored(GUARD_SRC, /    try \{ w = fs\.watch\(dir, onChange\); \} catch \(e\) \{\n[\s\S]*?\n      return null;\n    \}\n/, '    w = fs.watch(dir, onChange);\n', 'arm-time-catch-removed'));
  ok(!!bothRefused(M4).threw, 'CONTROL: the arm-time catch removed — a watch refused at arming THROWS out of armWatch — RED');
}

console.log('§2 THE LINUX TREE: one plain watch per folder, each in a try with its own listener');
/** A stand-in fs over a folder tree ({ name: subtree | null(file) | 'link' }): watch() never recursive here. */
const treeFs = (tree, { refuse = new Set(), unreadable = new Set() } = {}) => {
  const made = [], reads = [];
  const node = (dir) => { let n = tree; for (const p of dir.split('/').filter(Boolean)) { if (!n || typeof n !== 'object' || !(p in n)) return undefined; n = n[p]; } return n; };
  const statOf = (p) => { const n = node(p); if (n === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return { isDirectory: () => !!n && typeof n === 'object', isSymbolicLink: () => n === 'link' }; };
  return { made, tree, reads, lstatSync: statOf, statSync: statOf, watch(dir, a, b) {
    if (a && typeof a === 'object' && a.recursive) throw new Error('the tree road never asks node for a recursive watch');
    const n = node(dir); if (n === undefined || n === null || n === 'link') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    if (refuse.has(dir)) throw ENOSPC();
    return mkWatcher(made, dir, typeof a === 'function' ? a : b);
  }, readdirSync(dir) {
    reads.push(dir);
    if (unreadable.has(dir)) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const n = node(dir); if (n === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return Object.entries(n).map(([name, v]) => ({ name, isDirectory: () => !!v && typeof v === 'object', isSymbolicLink: () => v === 'link' }));
  } };
};
{
  const F = treeFs({ h: { proj: { a: { 'x.jsonl': null }, b: {}, ln: 'link', 'top.jsonl': null } } }), T = fakeTimers(), lines = [], list = [];
  let kicks = 0;
  const ctx = ctxOf(F, T, lines, { platform: 'linux' });
  const root = WG.armWatch(ctx, list, '/h/proj', () => { kicks++; }, 'discovery-watch');
  ok(!!root && root.dir === '/h/proj' && list.map((w) => w.dir).sort().join() === '/h/proj,/h/proj/a,/h/proj/b' && list.every((w) => w.listenerCount('error') === 1), 'the root and every subfolder get ONE plain watch each, with its listener at once; files and a symbolic link get none', list.map((w) => w.dir));
  F.tree.h.proj.c = { d: {} };
  root.cb('rename', 'c');
  ok(kicks === 1 && list.map((w) => w.dir).includes('/h/proj/c') && list.map((w) => w.dir).includes('/h/proj/c/d'), 'a \'rename\' in a folder kicks the feature and arms the NEW subfolder (and its own subfolders)', list.map((w) => w.dir));
  list.find((w) => w.dir === '/h/proj/a').cb('change', 'x.jsonl');
  ok(kicks === 2 && list.length === 5, 'a \'change\' kicks and arms nothing (a transcript growing never rescans)');
  const readsBefore = F.reads.length;
  F.tree.h.proj.a['y.jsonl'] = null; list.find((w) => w.dir === '/h/proj/a').cb('rename', 'y.jsonl');
  ok(F.reads.length === readsBefore && list.length === 5, 'a \'rename\' looks at the ONE entry it names: a new file reads no folder (a busy folder never pays a whole readdir per file)', F.reads.slice(readsBefore));
  delete F.tree.h.proj.b;
  const wb = list.find((w) => w.dir === '/h/proj/b'); wb.cb('rename', 'b');
  ok(wb.closed && !list.includes(wb) && !lines.length && T.live.size === 0, 'a folder that is gone drops its watch, quietly — its own event names it (a removal is no loss)');
  delete F.tree.h.proj.c;
  root.cb('rename', 'c');
  ok(!list.some((w) => w.dir === '/h/proj/c' || w.dir === '/h/proj/c/d') && list.map((w) => w.dir).sort().join() === '/h/proj,/h/proj/a', 'a folder moved away takes EVERY watch under it (its subfolders\' watches never linger on the old paths)', list.map((w) => w.dir));
}
{
  const F = treeFs({ h: { proj: { a: { deep: {} } } } }, { unreadable: new Set(['/h/proj/a']) }), T = fakeTimers(), lines = [], list = [];
  WG.armWatch(ctxOf(F, T, lines, { platform: 'linux' }), list, '/h/proj', () => { }, 'usage-events-watch');
  ok(list.map((w) => w.dir).sort().join() === '/h/proj,/h/proj/a' && lines.length === 1 && lines[0] === 'usage-events-watch: the folder /h/proj/a could not be read (EACCES); its subfolders are not watched — it falls back to a sweep every 60 s' && T.live.size === 1, 'a folder that cannot be READ (EACCES): its subfolders are said lost, once, and swept', lines);
  const lines2 = [];
  ok(WG.armWatch(ctxOf(treeFs({ h: { 'file.txt': null } }), fakeTimers(), lines2, { platform: 'linux' }), [], '/h/file.txt', () => { }, 'discovery-watch') === null && !lines2.length, 'a root that is a FILE ⇒ null, nothing said (the feeds watch folders)');
  const fb = WG.armWatch(ctxOf(treeFs({ h: { p: {} } }), fakeTimers(), [], { platform: 'freebsd' }), [], '/h/p', () => { }, 'discovery-watch');
  ok(!!fb && fb.dir === '/h/p', 'every platform but macOS and Windows takes the tree road (their recursive watch is node\'s own walker too)');
}
{
  const F = treeFs({ h: { proj: { a: {} } } }, { refuse: new Set(['/h/proj/n']) }), T = fakeTimers(), lines = [], list = [];
  const ctx = ctxOf(F, T, lines, { platform: 'linux' });
  const root = WG.armWatch(ctx, list, '/h/proj', () => { }, 'discovery-watch');
  F.tree.h.proj.n = {};
  let threw = null; try { root.cb('rename', 'n'); } catch (e) { threw = e; }
  ok(threw === null && !list.map((w) => w.dir).includes('/h/proj/n') && lines.length === 1 && lines[0] === 'discovery-watch: the watch on /h/proj/n could not be armed (ENOSPC) — it falls back to a sweep every 60 s' && T.live.size === 1, 'THE NODE-24 SCENE: a NEW subfolder refused by the limit after arming is caught HERE — nothing thrown, said once, swept (node\'s own recursive watch would throw past every listener)', { threw: threw && threw.message, lines });
  ok(emitSafely(list.find((w) => w.dir === '/h/proj/a'), ENOSPC()) === null && list.length === 1 && lines.length === 1, 'a tree watcher\'s own late error: closed, dropped, already said for this feature');
  const M5 = modOf(anchored(GUARD_SRC, /    try \{ w = fs\.watch\(dir, \(ev, name\) => \{ try \{ onChange\(\); \} catch \{ \} if \(ev === 'rename'\) named\(dir, name\); \}\); \} catch \(e\) \{\n[\s\S]*?\n      return null;\n    \}\n/, "    w = fs.watch(dir, (ev, name) => { try { onChange(); } catch { } if (ev === 'rename') named(dir, name); });\n", 'tree-catch-removed'));
  const F5 = treeFs({ h: { proj: {} } }, { refuse: new Set(['/h/proj/n']) }), list5 = [];
  const r5 = M5.armWatch(ctxOf(F5, fakeTimers(), [], { platform: 'linux' }), list5, '/h/proj', () => { }, 'discovery-watch');
  F5.tree.h.proj.n = {};
  let threw5 = null; try { r5.cb('rename', 'n'); } catch (e) { threw5 = e; }
  ok(!!threw5 && threw5.code === 'ENOSPC', 'CONTROL: the tree\'s catch removed — the refused subfolder THROWS out of the watcher\'s callback (the agent would end) — RED');
  const F6 = treeFs({ h: {} }), lines6 = [];
  ok(WG.armWatch(ctxOf(F6, fakeTimers(), lines6, { platform: 'linux' }), [], '/h/missing', () => { }, 'discovery-watch') === null && !lines6.length, 'a root that does not exist ⇒ null, nothing said (as before)');
}
{
  const dir = scratch('watch-guard'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'proj', 'sub'), { recursive: true });
  const T = fakeTimers(), list = [], lines = [];
  let thrown = null;
  try {
    WG.armWatch({ fs, log: (m) => lines.push(m), said: new Set(), setInterval: T.setInterval, clearInterval: T.clearInterval, platform: 'linux' }, list, dir, () => { }, 'discovery-watch');
    const n = list.length;
    thrown = emitSafely(list[0], ENOSPC());
    ok(n === 3 && thrown === null && list.length === 2 && lines.length === 1 && T.live.size === 1, 'a REAL tree on this machine: the walk arms node\'s plain FSWatcher on the root, proj and proj/sub; one\'s late error is caught the same way', { n, thrown: thrown && thrown.message, lines });
  } finally { WG.endWatches({ clearInterval: T.clearInterval }, list); fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('§3 src/opencode-events.js: a store watch that errors or closes leaves the list; a later connect arms it again');
const storeOver = (M) => {
  const made = [], warns = [];
  const watchImpl = (dir, opts, cb) => mkWatcher(made, dir, cb);
  return { made, warns, sw: M.createStoreWatch({ dirs: ['/oc/a', '/oc/b'], watchImpl, existsImpl: () => true, log: { warn: (m) => warns.push(m) } }) };
};
{
  const { sw, made, warns } = storeOver(OE);
  ok(sw.state().active && sw.state().watching.length === 2, 'two store watches armed: the lane reads healthy (the timed list refresh is off)');
  ok(emitSafely(made[0], ENOSPC()) === null && made[0].closed && sw.state().watching.join() === '/oc/b' && sw.state().lost === 1 && sw.state().active === false, 'one errors: closed, it LEAVES the list (and the state\'s watching list), and the lane reads UNHEALTHY at once — the dir still watched may be a stray one, the lost one the store the serve uses; the 10 s list refresh takes its place');
  made[1].emit('close');
  ok(!sw.state().active && sw.state().watching.length === 0 && sw.state().failed.map((f) => f.dir).join() === '/oc/a,/oc/b', 'the last one closes too: still unhealthy, both said');
  ok(warns.length === 2 && warns.every((m) => /^\[opencode-events\] store watch on \/oc\/[ab] ended \(.+\) — the timed list refresh takes its place/.test(m)), 'said once per lost watch', warns);
  made[0].emit('close'); emitSafely(made[0], ENOSPC()); sw.stop();
  ok(warns.length === 2, 'a watch already gone, and the lane\'s own stop, say nothing more');
}
{
  const { sw, made } = storeOver(modOf(anchored(OE_SRC, /      const lost = \(why\) => \{[\s\S]*?\n      w\.on\?\.\('close', \(\) => lost\('closed'\)\);\n/, "      w.on?.('error', (e) => { state.failed.push({ dir, reason: e.message }); });\n", 'store-watch-dead-kept')));
  emitSafely(made[0], ENOSPC()); emitSafely(made[1], ENOSPC());
  ok(sw.state().active === true, 'CONTROL: the dead watch KEPT in the list (the release\'s listener) — active stays true after both errors, so the 10 s refresh never returns — RED');
}
{
  const made = [], warns = [];
  const watchImpl = (dir, opts, cb) => { const w = mkWatcher(made, dir, cb); w.close = () => { if (w.closed) return; w.closed = true; w.emit('close'); }; return w; };
  const sw = OE.createStoreWatch({ dirs: ['/oc/a', '/oc/b'], watchImpl, existsImpl: () => true, log: { warn: (m) => warns.push(m) } });
  emitSafely(made[0], ENOSPC());
  sw.stop();
  ok(warns.length === 1 && made.every((w) => w.closed) && sw.state().watching.length === 0, 'a watcher whose close() emits \'close\' at once: the lost one says ONE word (it left the list before it was closed), and stop() — which empties the list before it closes — says none', warns);
}
const laneOver = async (M) => {
  const made = [];
  const lane = M.createLiveLane({ locator: { client: async () => null }, storeDirs: ['/oc/a'], watchImpl: (dir, opts, cb) => mkWatcher(made, dir, cb), existsImpl: () => true, log: { warn: () => { } } });
  await lane._armWatch('boot');
  emitSafely(made[0], ENOSPC());
  const deadActive = lane.state().watch.active;
  await lane._armWatch('connected');
  const r = { made: made.length, deadActive, activeAfter: lane.state().watch.active };
  lane.stop();
  return r;
};
{
  const r = await laneOver(OE);
  ok(r.deadActive === false && r.made === 2 && r.activeAfter === true, 'THE RECONNECT ROAD: the store\'s only watch lost ⇒ the lane reads unhealthy; the next `connected` arms it AGAIN (same dirs — it used to hand the dead watch back)', r);
  const r2 = await laneOver(modOf(anchored(OE_SRC, '      if (sameDirs(dirs, watchedDirs) && !lostSome) return watch;', '      if (sameDirs(dirs, watchedDirs)) return watch;', 'reconnect-without-lost-check'))); // stale-pins: kept — the control plants the checkpoint's own line
  ok(r2.made === 1 && r2.activeAfter === false, 'CONTROL: the reconnect without its lost check (the release\'s sameDirs) hands the dead watch back — never armed again — RED', r2);
}

console.log('§4 THE CENSUS BY MEANING: every watch of an fs binding in the daemon\'s require closure carries its listener');
function tokensOf(text) { const out = []; for (const t of acorn.tokenizer(text, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, locations: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true })) out.push(t); return out; }
const lab = (t) => (t ? t.type.label : '');
const isFsStr = (t) => !!t && lab(t) === 'string' && /^(node:)?fs(\/promises)?$/.test(t.value);
const WATCHES = /^(watch|watchFile)$/;
/** every watch of an fs binding in ONE file → [{ line, form }] (member: fs.watch / fs.promises.watch, called or as a value;
 *  destructured: { watch } = require('fs'); inline: require('fs').watch) — tokens, so a comment or a string never counts */
function watchSites(text) {
  const toks = tokensOf(text), fsNames = new Set(), out = [];
  for (let i = 3; i < toks.length; i++) {
    if (!(lab(toks[i]) === ')' && isFsStr(toks[i - 1]) && lab(toks[i - 2]) === '(' && toks[i - 3].value === 'require')) continue;
    const eq = toks[i - 4], left = toks[i - 5];
    if (eq && lab(eq) === '=' && left && lab(left) === 'name') fsNames.add(left.value);
    if (eq && lab(eq) === '=' && left && lab(left) === '}') {
      let d = 0, j = i - 5; for (; j >= 0; j--) { if (lab(toks[j]) === '}') d++; else if (lab(toks[j]) === '{') { d--; if (d === 0) break; } }
      for (let k = j + 1; k < i - 5; k++) if (lab(toks[k]) === 'name' && WATCHES.test(toks[k].value) && (lab(toks[k - 1]) === '{' || lab(toks[k - 1]) === ',')) out.push({ line: toks[k].loc.start.line, form: 'destructured' });
    }
    if (lab(toks[i + 1]) === '.' && toks[i + 2] && WATCHES.test(toks[i + 2].value)) out.push({ line: toks[i + 2].loc.start.line, form: 'inline' });
  }
  for (let i = 2; i < toks.length; i++) {   // `{ watch } = fs` — a watch destructured from an fs binding
    if (!(lab(toks[i]) === 'name' && fsNames.has(toks[i].value) && lab(toks[i - 1]) === '=' && lab(toks[i - 2]) === '}')) continue;
    let d = 0, j = i - 2; for (; j >= 0; j--) { if (lab(toks[j]) === '}') d++; else if (lab(toks[j]) === '{') { d--; if (d === 0) break; } }
    for (let k = j + 1; k < i - 2; k++) if (lab(toks[k]) === 'name' && WATCHES.test(toks[k].value) && (lab(toks[k - 1]) === '{' || lab(toks[k - 1]) === ',')) out.push({ line: toks[k].loc.start.line, form: 'destructured' });
  }
  for (let i = 2; i < toks.length; i++) {
    if (!(lab(toks[i]) === 'name' && WATCHES.test(toks[i].value) && lab(toks[i - 1]) === '.')) continue;
    const r = toks[i - 2];
    const viaPromises = r && r.value === 'promises' && lab(toks[i - 3]) === '.' && toks[i - 4] && fsNames.has(toks[i - 4].value);
    if (r && lab(r) === 'name' && (fsNames.has(r.value) || viaPromises)) out.push({ line: toks[i].loc.start.line, form: 'member' });
  }
  return out;
}
const walk = (read) => {
  const seen = new Set(), todo = ['src/agentd/agentd.js'], requires = [];
  while (todo.length) {
    const rel = todo.pop(); if (seen.has(rel)) continue;
    let text; try { text = read(rel); } catch { continue; }
    seen.add(rel);
    for (const m of text.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const q = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      requires.push({ from: rel, to: q });
      const hit = [q, q + '.js', q + '/index.js'].find((c) => { try { return fs.statSync(path.join(REPO, c)).isFile(); } catch { return false; } });
      if (hit) todo.push(hit);
    }
  }
  return { files: [...seen].sort(), requires };
};
const closure = walk(rd);
// its `watchImpl = fs.watch` defaults (two lines): the listener sits on the watcher it gets — only those lines are the row's
const ROWS = { 'src/opencode-events.js': { anchor: "w.on?.('error', (e) => lost((e && e.message) || 'error'));", line: /^\s*(?:function createStoreWatch\(|storeDirs = null, env = process\.env,).*\bwatchImpl = fs\.watch,/, count: 2 } };
// a RECURSIVE watch outside the guard is refused even with its listener: on Linux node's recursive walker throws past it
const judge = (rel, text) => { const lines = text.split('\n'); return watchSites(text).filter(({ line }) => { const l = lines[line - 1] || ''; if (rel === 'src/agentd/watch-guard.js') return false; if (/\brecursive\b/.test(l)) return true; return !/\.on\??\.?\('error'/.test(l) && !(ROWS[rel] && text.includes(ROWS[rel].anchor) && ROWS[rel].line.test(l)); }).map(({ line, form }) => `${rel}:${line} (${form}${/\brecursive\b/.test(lines[line - 1] || '') ? ', recursive' : ''})`); };
const bad = closure.files.flatMap((rel) => judge(rel, rd(rel)));
ok(closure.files.length > 100 && ['src/agentd/watch-guard.js', 'src/desktop-serve.js', 'src/opencode-events.js'].every((f) => closure.files.includes(f)), `the closure is the bundle's own require walk (${closure.files.length} files; the guard, desktop-serve and opencode-events among them)`);
ok(!bad.length, 'no watch of an fs binding in the closure without its error listener (armWatch\'s own, `.on(\'error\'` in the same statement, or a named row)', bad);
ok(watchSites(rd('src/desktop-serve.js')).length >= 1 && watchSites(rd('src/opencode-events.js')).length === 2, 'the census SEES the closure\'s real watches: desktop-serve\'s (its listener on the line) and opencode-events\' two `watchImpl = fs.watch` defaults');
ok(Object.entries(ROWS).every(([f, r]) => closure.files.includes(f) && rd(f).split(r.anchor).length === 2 && rd(f).split('\n').filter((l) => r.line.test(l)).length === r.count), 'every named row is live: its file in the closure, its listener line there once, exactly its own reference lines (a stale row is red)');
const AD = rd('src/agentd/agentd.js');
for (const [form, planted, label] of [['destructured', "\nconst { watch } = require('fs');\nwatch(d, kick);\n", 'destructured watch'], ['inline', "\nrequire('node:fs').watch(d, kick);\n", 'inline required watch'], ['member', '\nconst w = fs.watch;\nw(d, kick);\n', 'alias (fs.watch as a value)'], ['destructured', '\nconst { watch: w2 } = fs;\nw2(d, kick);\n', 'watch destructured from the fs binding'], ['member, recursive', "\nfs.watch(d, { recursive: true }, kick).on('error', () => { });\n", 'RECURSIVE watch (its listener on the line)']]) {
  const got = judge('src/agentd/agentd.js', AD + planted);
  ok(got.length === 1 && got[0].endsWith(`(${form})`), `CONTROL: a planted ${label} in agentd.js is named by the census`, got);
}
ok(judge('src/opencode-events.js', OE_SRC + '\nconst w2 = fs.watch(dir, () => {});\n').length === 1, 'CONTROL: a second bare watch planted in a named row\'s file is still named (the row covers its own lines only)');
const doorRequires = (reqs) => reqs.filter((r) => /(^|\/)watch-door(\.js)?$/.test(r.to)).map((r) => `${r.from} → ${r.to}`);
ok(!doorRequires(closure.requires).length, 'the hub\'s watch door (src/watch-door.js) is required by no module of the closure: the bundle carries the plain listener only', doorRequires(closure.requires));
ok(doorRequires(walk((rel) => rel === 'src/agentd/agentd.js' ? AD + "\nconst WD = require('../watch-door.js');\n" : rd(rel)).requires).length === 1, 'CONTROL: a planted require of the watch door in agentd.js is named');

console.log('§5 the wiring');
ok(!watchSites(AD).length, 'agentd.js arms no watch of its own (no fs binding\'s watch among its tokens)');
ok(/const \{ armWatch, endWatches \} = require\('\.\/watch-guard\.js'\);/.test(AD) && /const WATCH = \{ fs, log: \(m\) => log\(m\), said: new Set\(\) \};/.test(AD), 'the guard is required once, with the agent\'s own log and ONE said-set for the process');
ok((AD.match(/armWatch\(WATCH, watches, d, kick, 'discovery-watch'\);/g) || []).length === 1 && (AD.match(/armWatch\(WATCH, st\.watches, d, kick, 'usage-events-watch'\);/g) || []).length === 1, 'both feeds arm through it, each with its own kick as the sweep: discovery-watch and usage-events-watch');
ok(AD.includes('endWatches(WATCH, this._discoWatch);') && AD.includes('endWatches(WATCH, st.watches);'), 'the link\'s end ends both feeds through endWatches (their sweeps stop with the link)');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
