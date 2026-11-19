#!/usr/bin/env node
// test-agentd-watch-guard — THE DEVICE AGENT'S WATCHES NEVER END IT (lane bl-machines-b, 主开发 2026-11-19, found by the readers
// of the hub's watch hotfix). On Linux a recursive fs.watch adds one watch per new subfolder, so at the machine's limit of file
// watches the failure arrives AFTER the watch was armed, as the watcher's own 'error' event — and an 'error' event with no
// listener ends the process (the hub ended that way). FAST, PURE + source text:
//   §1 armWatch (src/agentd/watch-guard.js) over a stand-in fs and fake timers: the listener is on the watcher AT ONCE; an
//      error after arming throws nothing, closes that watcher, drops it from its list, says so ONCE per feature, and the
//      feature FALLS BACK TO A SWEEP (its own kick every 60 s — the hub has no sweep of its own for these pushes); a watch
//      refused at arming for any cause but a missing folder does the same; endWatches ends a feature on purpose (no word, no
//      sweep, a late error silent). A REAL fs.watch (node's FSWatcher) emitting 'error' is caught.
//      CONTROLS: the guard without its listener ⇒ the error throws (the agent would end); without its sweep ⇒ no kick.
//   §2 THE CENSUS over the daemon's require closure (what the device bundle carries): every reference to fs.watch /
//      watchFile / promises.watch is armWatch's own, carries its 'error' listener in the same statement, or is a named row
//      whose listener line is checked; the hub's watch door (src/watch-door.js) is required by no module of the closure.
//      CONTROLS: a planted bare watch and a planted watch-door require ⇒ named.
//   §3 the wiring: agentd.js arms no watch of its own — both feeds go through armWatch, and the link's end through endWatches.
// Run: node scripts/test-agentd-watch-guard.mjs
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { anchored, scratch } from './scratch.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1500) : '')); } };
const rd = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const GUARD_SRC = rd('src/agentd/watch-guard.js');
const modOf = (text) => { const m = { exports: {} }; new Function('module', 'exports', 'require', 'setInterval', 'clearInterval', text)(m, m.exports, require, setInterval, clearInterval); return m.exports; };
const WG = require(path.join(REPO, 'src/agentd/watch-guard.js'));

/** A stand-in fs: watch() hands back an EventEmitter (close() marks it), or throws on the asked form with the asked code. */
const standIn = ({ recursiveThrows = null, plainThrows = null } = {}) => {
  const made = [];
  return { made, watch(dir, a) {
    const recursive = !!(a && typeof a === 'object' && a.recursive);
    if (recursive && recursiveThrows) throw Object.assign(new Error(recursiveThrows), { code: recursiveThrows });
    if (!recursive && plainThrows) throw Object.assign(new Error(plainThrows), { code: plainThrows });
    const w = new EventEmitter(); w.closed = false; w.recursive = recursive; w.close = () => { w.closed = true; }; made.push(w); return w;
  } };
};
/** Fake timers: the sweep's interval is recorded, never armed for real; tick() runs it once. */
const fakeTimers = () => { const t = { live: new Set(), setInterval: (fn, ms) => { const h = { fn, ms, unref() { } }; t.live.add(h); return h; }, clearInterval: (h) => { t.live.delete(h); }, tick: () => { for (const h of [...t.live]) h.fn(); } }; return t; };
const ENOSPC = () => Object.assign(new Error('ENOSPC: System limit for number of file watchers reached'), { code: 'ENOSPC' });
const emitSafely = (w, e) => { try { w.emit('error', e); return null; } catch (x) { return x; } };
const ctxOf = (F, T, lines, said = new Set()) => ({ fs: F, log: (m) => lines.push(m), said, setInterval: T.setInterval, clearInterval: T.clearInterval });

console.log('§1 armWatch: the listener at once; a lost watch closes, says once per feature, and falls back to a sweep');
{
  const F = standIn(), T = fakeTimers(), lines = [], list = [];
  let kicks = 0; const kick = () => { kicks++; };
  const ctx = ctxOf(F, T, lines);
  const w = WG.armWatch(ctx, list, '/h/.claude/projects', kick, 'discovery-watch');
  ok(!!w && w.recursive && list.length === 1 && list[0] === w && w.listenerCount('error') === 1 && T.live.size === 0, 'the recursive watch is armed, kept in its list, and carries its error listener the moment armWatch returns; no sweep while it lives');
  const thrown = emitSafely(w, ENOSPC());
  ok(thrown === null && w.closed && list.length === 0, 'an error AFTER arming (the watch limit) throws nothing: that watcher is closed and dropped from its list', thrown && thrown.message);
  ok(lines.length === 1 && lines[0] === 'discovery-watch: the watch on /h/.claude/projects ended (ENOSPC) — it falls back to a sweep every 60 s', 'the agent\'s log says it once, with the feature, the folder, the cause and the sweep', lines);
  const [h] = [...T.live];
  ok(T.live.size === 1 && h.ms === WG.SWEEP_MS && WG.SWEEP_MS === 60000 && list.sweep === h, 'THE FALLBACK IS REAL: the feature now kicks itself every 60 s (one sweep per feature list)');
  T.tick(); T.tick();
  ok(kicks === 2, 'each sweep tick is the feature\'s own kick (discovery re-snapshots, usage walks) — what the watch would have pushed, at the sweep\'s pace', kicks);
  const w2 = WG.armWatch(ctx, list, '/h/.claude/sessions', kick, 'discovery-watch');
  emitSafely(w2, ENOSPC());
  ok(lines.length === 1 && T.live.size === 1, 'said ONCE per feature, swept once: a second watch of the same feature failing adds no line and no second sweep', lines);
  emitSafely(w, ENOSPC());
  ok(lines.length === 1 && T.live.size === 1, 'a second error on a watcher already dropped changes nothing');
  WG.endWatches(ctx, list);
  ok(list.ended === true && T.live.size === 0 && list.length === 0, 'endWatches (the link\'s end) stops the sweep and closes what is left');
  ok(WG.armWatch(ctx, list, '/h/.codex/sessions', kick, 'usage-events-watch') === null && list.length === 0, 'a feature ended on purpose arms nothing more');
}
{
  const F = standIn(), T = fakeTimers(), lines = [], list = [], ctx = ctxOf(F, T, lines);
  const a = WG.armWatch(ctx, list, '/h/.claude/projects', () => { }, 'discovery-watch'), b = WG.armWatch(ctx, list, '/h/.claude/sessions', () => { }, 'discovery-watch');
  WG.endWatches(ctx, list);
  ok(a.closed && b.closed && list.length === 0 && list.ended === true, 'endWatches closes every LIVE watcher of the feature (the link\'s end: no watcher leaks across a re-dial)');
  ok(emitSafely(a, ENOSPC()) === null && !lines.length && T.live.size === 0, 'a late error on a watcher endWatches closed (a recursive walk still in flight) throws nothing, says nothing, sweeps nothing', lines);
}
{
  const F = standIn({ recursiveThrows: 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM' }), T = fakeTimers(), list = [], lines = [];
  const w = WG.armWatch(ctxOf(F, T, lines), list, '/h/.claude/projects', () => { }, 'usage-events-watch');
  ok(!!w && !w.recursive && w.listenerCount('error') === 1 && emitSafely(w, ENOSPC()) === null && list.length === 0 && T.live.size === 1, 'where a recursive watch cannot be armed, the plain fallback carries the same listener and the same sweep');
}
{
  const F = standIn({ recursiveThrows: 'ENOSPC' }), T = fakeTimers(), list = [], lines = [];
  const w = WG.armWatch(ctxOf(F, T, lines), list, '/h/.claude/projects', () => { }, 'discovery-watch');
  ok(!!w && !w.recursive && list.length === 1 && lines.length === 1 && /the recursive watch on \/h\/\.claude\/projects could not be armed \(ENOSPC\); its subfolders are not watched — it falls back to a sweep every 60 s$/.test(lines[0]) && T.live.size === 1, 'a recursive watch refused by the LIMIT (the plain one armed, the top folder only): its subfolders are said lost, once, and swept', lines);
}
{
  const F = standIn({ recursiveThrows: 'ENOSPC', plainThrows: 'ENOSPC' }), T = fakeTimers(), list = [], lines = [];
  ok(WG.armWatch(ctxOf(F, T, lines), list, '/h/.claude/projects', () => { }, 'discovery-watch') === null && list.length === 0 && lines.length === 1 && /could not be armed \(ENOSPC\) — it falls back to a sweep every 60 s$/.test(lines[0]) && T.live.size === 1, 'a watch REFUSED at arming by the limit says so once and sweeps', lines);
}
{
  const F = standIn({ recursiveThrows: 'ENOENT', plainThrows: 'ENOENT' }), T = fakeTimers(), list = [], lines = [];
  ok(WG.armWatch(ctxOf(F, T, lines), list, '/gone', () => { }, 'discovery-watch') === null && list.length === 0 && !lines.length && T.live.size === 0, 'a folder that does not exist (ENOENT) ⇒ null, nothing kept, nothing said, no sweep (as before)');
}
{
  const dir = scratch('watch-guard'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const T = fakeTimers(), list = [], lines = [];
  let w = null, thrown = null;
  try {
    w = WG.armWatch({ fs, log: (m) => lines.push(m), said: new Set(), setInterval: T.setInterval, clearInterval: T.clearInterval }, list, dir, () => { }, 'discovery-watch');
    thrown = emitSafely(w, ENOSPC());
  } finally { try { w && w.close(); } catch { } fs.rmSync(dir, { recursive: true, force: true }); }
  ok(!!w && thrown === null && list.length === 0 && lines.length === 1 && T.live.size === 1, 'a REAL fs.watch (node\'s FSWatcher) emitting its error after arming is caught the same way', { thrown: thrown && thrown.message, lines });
}
{
  const bare = anchored(GUARD_SRC, /  w\.on\('error', \(e\) => \{[\s\S]*?\n  \}\);\n/, '', 'guard-without-listener');
  const M = modOf(bare), T = fakeTimers();
  const w = M.armWatch(ctxOf(standIn(), T, []), [], '/h/.claude/projects', () => { }, 'discovery-watch');
  const thrown = emitSafely(w, ENOSPC());
  ok(!!thrown && (thrown.code === 'ENOSPC' || /Unhandled 'error' event/.test(thrown.message)), 'CONTROL: the guard without its listener — the same late error THROWS out of the watcher (the agent would end) — RED', thrown && thrown.message);
  const noClose = anchored(GUARD_SRC, "  for (const w of list.splice(0)) { try { w.close(); } catch { } }\n", '', 'endWatches-without-close');
  const M3 = modOf(noClose), T3 = fakeTimers(), L3 = [];
  const a3 = M3.armWatch(ctxOf(standIn(), T3, []), L3, '/h/.claude/projects', () => { }, 'discovery-watch');
  M3.endWatches(ctxOf(standIn(), T3, []), L3);
  ok(!a3.closed, 'CONTROL: endWatches without its close loop leaves the live watcher open (a leak per re-dial) — RED');
  const noSweep = anchored(GUARD_SRC, '  sweep(ctx, list, onChange);\n}', '}', 'guard-without-sweep');
  const M2 = modOf(noSweep), T2 = fakeTimers();
  const w2 = M2.armWatch(ctxOf(standIn(), T2, []), [], '/h/.claude/projects', () => { }, 'discovery-watch');
  emitSafely(w2, ENOSPC());
  ok(T2.live.size === 0, 'CONTROL: the guard without its sweep — a lost watch leaves the feature with no kick at all (the silence the sweep cures) — RED');
}

console.log('§2 THE CENSUS: every watch in the daemon\'s require closure carries its error listener; the hub\'s door stays out');
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
// a reference to a watch that is not armWatch's own and carries no listener on its own line must be a named row
// its `watchImpl = fs.watch` defaults (two lines): the listener sits on the watcher it gets — only those lines are the row's
const ROWS = { 'src/opencode-events.js': { anchor: "w.on?.('error', (e) => { state.failed.push({ dir, reason: e.message });", line: /^\s*(?:function createStoreWatch\(|storeDirs = null, env = process\.env,).*\bwatchImpl = fs\.watch,/, count: 2 } };
const watchRefs = (rel, text) => text.split('\n').map((l, i) => ({ l, i })).filter(({ l }) => /\bfs\.watch\b|\bwatchFile\(|\bpromises\.watch\(/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l))
  .filter(({ l }) => rel !== 'src/agentd/watch-guard.js' && !/\.on\??\.?\('error'/.test(l) && !(ROWS[rel] && text.includes(ROWS[rel].anchor) && ROWS[rel].line.test(l))).map(({ i }) => `${rel}:${i + 1}`);
const sites = closure.files.flatMap((rel) => watchRefs(rel, rd(rel)));
ok(closure.files.length > 100 && ['src/agentd/watch-guard.js', 'src/desktop-serve.js', 'src/opencode-events.js'].every((f) => closure.files.includes(f)), `the closure is the bundle's (${closure.files.length} files; the guard, desktop-serve and opencode-events among them)`);
ok(!sites.length, 'no watch in the closure without its error listener (armWatch\'s own, `.on(\'error\'` in the same statement, or a named row)', sites);
ok(Object.entries(ROWS).every(([f, r]) => closure.files.includes(f) && rd(f).split(r.anchor).length === 2 && rd(f).split('\n').filter((l) => r.line.test(l)).length === r.count), 'every named row is live: its file is in the closure, its listener line is there once, and it covers exactly its own reference lines (a stale row is red)');
ok(watchRefs('src/opencode-events.js', rd('src/opencode-events.js') + '\n  const w2 = fs.watch(dir, () => {});\n').length === 1, 'CONTROL: a second bare watch planted in a named row\'s file is still named (the row covers its own lines only)');
ok(watchRefs('src/agentd/agentd.js', rd('src/agentd/agentd.js') + '\n            const w = fs.watch(d, kick);\n').length === 1, 'CONTROL: a planted bare watch in agentd.js is named by the same census');
const doorRequires = (reqs) => reqs.filter((r) => /(^|\/)watch-door(\.js)?$/.test(r.to)).map((r) => `${r.from} → ${r.to}`);
ok(!doorRequires(closure.requires).length, 'the hub\'s watch door (src/watch-door.js) is required by no module of the closure: the bundle carries the plain listener only', doorRequires(closure.requires));
ok(doorRequires(walk((rel) => rel === 'src/agentd/agentd.js' ? rd(rel) + "\nconst WD = require('../watch-door.js');\n" : rd(rel)).requires).length === 1, 'CONTROL: a planted require of the watch door in agentd.js is named');

console.log('§3 the wiring');
{
  const AD = rd('src/agentd/agentd.js');
  ok(!AD.split('\n').some((l) => !/^\s*(\/\/|\/\*|\*)/.test(l) && /\bfs\.watch\b/.test(l)), 'agentd.js arms no fs.watch of its own (no code line names it; its comments may)');
  ok(/const \{ armWatch, endWatches \} = require\('\.\/watch-guard\.js'\);/.test(AD) && /const WATCH = \{ fs, log: \(m\) => log\(m\), said: new Set\(\) \};/.test(AD), 'the guard is required once, with the agent\'s own log and ONE said-set for the process');
  ok((AD.match(/armWatch\(WATCH, watches, d, kick, 'discovery-watch'\);/g) || []).length === 1 && (AD.match(/armWatch\(WATCH, st\.watches, d, kick, 'usage-events-watch'\);/g) || []).length === 1, 'both feeds arm through it, each with its own kick as the sweep: discovery-watch and usage-events-watch');
  ok(AD.includes('endWatches(WATCH, this._discoWatch);') && AD.includes('endWatches(WATCH, st.watches);'), 'the link\'s end ends both feeds through endWatches (their sweeps stop with the link)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
