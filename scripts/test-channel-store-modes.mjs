#!/usr/bin/env node
// THE CHANNEL STORE IS THE OWNING ACCOUNT'S ALONE (the owner's decision, 2026-11-17; gate row `test-channel-store-modes`).
//
// Channel content stays PLAIN at rest: conversation heads, message bodies and attachments, like transcripts and the search
// index. Only an account's sign-in token and app secret are sealed under the vault's channels key. So the store's folder is
// closed to other OS accounts. Before this change the index and the message logs had no mode (the process default, 0644 under
// a 022 umask), while the same store's attachments, people and memos were already 0700 / 0600. On a machine with several OS
// accounts another account could read mail text.
//
// The laws, driven on REAL files in a per-pid scratch dir:
//   ① a fresh store's folders are 0700; its index and a message log are 0600;
//   ② an EXISTING store whose root was 0755 is 0700 after the open. The ROOT alone is stat'ed and chmod'ed, never a walk
//      (an instance holds some 200 000 conversation files). Every other call the open makes is the base's own, path for path;
//   ③ closing only TAKES bits away: an owner's bits are never granted, so a read-only root stays read-only (0555 → 0500),
//      and an already-closed root gets no chmod at all;
//   ④ a filesystem that refuses (EPERM) opens and writes normally and says so once.
// The RED CONTROL is the base's store: the same module with the change taken back out (a copy outside the tree,
// scripts/mutant-copy.mjs). It leaves 0755 / 0644.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';   // THE ONE guarded helper (test-ci-gate-tiers §7b: the unguarded only fall)
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();

const S = require(path.join(REPO, 'src/channel-store.js'));
const ROOT = scratch('chanmodes');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const MUTCS = mutantCopies('channel-store-modes', REPO);

process.umask(0o022);   // the box's usual umask: the base's process-default modes are then 0755 / 0644
const modeOf = (p) => fs.statSync(p).mode & 0o777;
const oct = (m) => (m == null ? 'none' : '0' + m.toString(8));
const NOW = 1_800_000_000_000;   // a fixed instant: the records' own time, never the wall clock
const rec = (conv, i) => ({ id: `a:${conv}:v${i}`, adapterId: 'a', convId: conv, vendorId: `v${i}`, at: NOW + i * 1000, author: { id: 'u', name: 'U', isSelf: false, isBot: false }, text: `m${i}`, mentions: [] });
const quiet = { warn() {}, log() {}, info() {} };

// THE BASE'S STORE: this module with the change taken back out. Each anchor is counted, so a moved line makes the control
// fail by name instead of passing by accident.
const BASE_SRC = (() => {
  let s = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const back = (a, b, n) => { const k = s.split(a).length - 1; if (k !== n) throw new Error(`control anchor «${a.slice(0, 60)}» seen ${k}×, not ${n}`); s = s.split(a).join(b); };
  back('fs.mkdirSync(msgsDir, { recursive: true, mode: 0o700 });', 'fs.mkdirSync(msgsDir, { recursive: true });', 1);   // stale-pins: kept (the base's line, restored by the red control)
  back('fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });', 'fs.mkdirSync(archiveDir, { recursive: true });', 1);   // stale-pins: kept (the base's line, restored by the red control)
  back('fs.mkdirSync(path.dirname(fp), { recursive: true, mode: 0o700 });', 'fs.mkdirSync(path.dirname(fp), { recursive: true });', 3);   // stale-pins: kept (the base's line, restored by the red control)
  back('debounceMs: FLUSH_DEBOUNCE_MS, mode: 0o600, ', 'debounceMs: FLUSH_DEBOUNCE_MS, ', 4);   // stale-pins: kept (the base's line, restored by the red control)
  back("fs.openSync(fp, 'a+', 0o600);", "fs.openSync(fp, 'a+');", 1);   // stale-pins: kept (the base's line, restored by the red control)
  const i = s.indexOf('  const rootClosed = fs.promises.stat(dir)'); if (i < 0) throw new Error('control anchor: the root close');
  const j = s.indexOf('return false; });', i); if (j < 0) throw new Error('control anchor: the root close\'s end');
  s = s.slice(0, i) + '  const rootClosed = Promise.resolve(null);' + s.slice(j + 'return false; });'.length);
  return s;
})();
const SB = require(MUTCS.write('src/channel-store.js', BASE_SRC, 'base'));

// a store's modes after an open, two appends, an index change and a close (the close writes the index: its flush)
const shape = async (SM, name) => {
  const st = SM.createChannelStore({ dir: path.join(ROOT, name), log: quiet });
  await st.rootClosed;
  st.appendRecords('a', 'c', [rec('c', 1), rec('c', 2)]);
  await st.index.update((ix) => { ix.conversations['a/c'] = { key: 'a/c', id: 'c', adapterId: 'a', tracked: true }; });
  st.close();
  return { root: modeOf(st.dir), msgs: modeOf(path.join(st.dir, 'msgs')), conv: modeOf(path.dirname(st.logPath('a', 'c'))), log: modeOf(st.logPath('a', 'c')), index: fs.existsSync(st.indexFile) ? modeOf(st.indexFile) : null };
};

console.log('① a fresh store');
{
  const fresh = await shape(S, 'fresh');
  ok(fresh.root === 0o700 && fresh.msgs === 0o700 && fresh.conv === 0o700, `a FRESH store's folders are 0700 — the root ${oct(fresh.root)}, msgs ${oct(fresh.msgs)}, a conversation's folder ${oct(fresh.conv)}`, JSON.stringify(fresh));
  ok(fresh.index === 0o600 && fresh.log === 0o600, `…its index and a message log are 0600 (index ${oct(fresh.index)}, log ${oct(fresh.log)})`, JSON.stringify(fresh));
  const base = await shape(SB, 'fresh-base');
  ok(base.root === 0o755 && base.index === 0o644 && base.log === 0o644, `RED CONTROL: the base's store leaves the root ${oct(base.root)}, the index ${oct(base.index)} and a log ${oct(base.log)} — another OS account could read the mail text`, JSON.stringify(base));
}

// every stat / chmod / readdir call an open makes, by path — the same counting around the base's open and this one
const counted = async (SM, d) => {
  const calls = []; const P = fs.promises; const saved = [];
  const wrap = (obj, k, tag) => { const f = obj[k]; if (typeof f !== 'function') return; saved.push([obj, k, f]); obj[k] = function (p, ...a) { calls.push(`${tag} ${path.relative(d, String(p)) || '<root>'}`); return f.call(this, p, ...a); }; };
  for (const k of ['chmodSync', 'chmod', 'lchmodSync', 'statSync', 'stat', 'lstatSync', 'lstat', 'readdirSync', 'readdir', 'opendirSync']) wrap(fs, k, k);
  for (const k of ['chmod', 'stat', 'lstat', 'readdir', 'opendir']) wrap(P, k, 'promises.' + k);
  let st, closed;
  try { st = SM.createChannelStore({ dir: d, log: quiet }); closed = await st.rootClosed; } finally { for (const [o, k, f] of saved.reverse()) o[k] = f; }
  st.close();
  return { calls, closed };
};
// the calls in `a` that are not in `b` (multisets)
const minus = (a, b) => { const left = [...b]; return a.filter((x) => { const i = left.indexOf(x); if (i >= 0) { left.splice(i, 1); return false; } return true; }); };
const baseStore = (d) => { const st0 = SB.createChannelStore({ dir: d, log: quiet }); st0.appendRecords('a', 'c', [rec('c', 1)]); st0.appendRecords('a', 'd', [rec('d', 1)]); st0.close(); };

console.log('② an existing store');
{
  const dirE = path.join(ROOT, 'existing'), dirB = path.join(ROOT, 'existing-base');
  baseStore(dirE); fs.cpSync(dirE, dirB, { recursive: true });
  const preRoot = modeOf(dirE);
  const cb = await counted(SB, dirB);
  const cn = await counted(S, dirE);
  const added = minus(cn.calls, cb.calls), dropped = minus(cb.calls, cn.calls);
  ok(preRoot === 0o755 && modeOf(dirE) === 0o700 && cn.closed === true, `an EXISTING store whose root was ${oct(preRoot)} is ${oct(modeOf(dirE))} after the open (its close resolved ${cn.closed})`);
  ok(added.length === 2 && added.includes('promises.stat <root>') && added.includes('promises.chmod <root>') && !dropped.length,
    `…by the ROOT alone: what the open adds to the base's own calls is [${added.join(', ')}] — no file under it is visited (${cn.calls.length} calls = the base's ${cb.calls.length} + ${added.length})`, `added: ${added.join(' | ')} · dropped: ${dropped.join(' | ')}`);
  ok(modeOf(path.join(dirE, 'msgs', 'a', 'c.ndjson')) === 0o644, '…an existing log keeps its old bits: the root\'s 0700 is what closes it — nothing was walked');
}

console.log('③ closing only takes bits away');
{
  const dirC = path.join(ROOT, 'already-closed'); baseStore(dirC); fs.chmodSync(dirC, 0o700);
  const cc = await counted(S, dirC);
  ok(cc.closed === true && !cc.calls.some((c) => /chmod/.test(c)) && modeOf(dirC) === 0o700, `an already-closed root (0700) gets NO chmod — its one stat is the whole cost (${cc.calls.filter((c) => /<root>/.test(c)).join(', ')})`);
  const dirR = path.join(ROOT, 'read-only'); baseStore(dirR); fs.chmodSync(dirR, 0o555);
  const st = S.createChannelStore({ dir: dirR, log: quiet }); const closed = await st.rootClosed; st.close();
  const m = modeOf(dirR); fs.chmodSync(dirR, 0o700);   // the scratch dir's cleanup needs the write bit back
  ok(closed === true && m === 0o500, `a READ-ONLY root stays read-only: 0555 → ${oct(m)} — the owner's write bit is never granted, so the store's BLOCKED rung still holds`);
}

console.log('④ a filesystem that refuses');
{
  const said = []; const P = fs.promises; const f = P.chmod;
  P.chmod = () => Promise.reject(Object.assign(new Error('operation not permitted'), { code: 'EPERM' }));
  let st, closed, wrote;
  const dirX = path.join(ROOT, 'refused'); fs.mkdirSync(dirX, { mode: 0o755 }); fs.chmodSync(dirX, 0o755);
  try { st = S.createChannelStore({ dir: dirX, log: { warn: (...a) => said.push(a.join(' ')), log() {}, info() {} } }); closed = await st.rootClosed; wrote = st.appendRecords('a', 'c', [rec('c', 1)]); }
  finally { P.chmod = f; }
  ok(closed === false && !!wrote && wrote.appended === 1 && st.readTail('a', 'c', { limit: 5 }).length === 1, `a filesystem that REFUSES the chmod (EPERM): the store opens and writes normally (its close resolved ${closed})`);
  ok(said.filter((l) => /not closed to other accounts \(EPERM\)/.test(l)).length === 1, '…and the refusal is said ONCE, by its code', said.join(' | '));
  st.close();
}

console.log('⑤ the patched copy never touches the tree');
for (const r of copiesCensus(MUTCS.files, MUTCS.dir, REPO, { minCopies: 1 })) ok(r.pass === true, r.name + (r.pass ? '' : ' — ' + r.detail));

report();
