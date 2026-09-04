#!/usr/bin/env node
// Stranded writes under a DISCONNECTED mount point (2.369.15, real OneDrive
// incident: the task store's generated TASK.md recreated
// <mp>/WestcliffCourses/AIContext/.vibespace/ on the bare directory while the
// storage was down; rclone then refused every reconnect with "is not empty,
// use --allow-non-empty" — which would only have HIDDEN the files).
// Three layers, all functional against real temp dirs + wiring pins:
//   ① connect quarantines leftovers to a sibling <mp>.stranded-<ts>/ (never
//      deletes, never merges) and broadcasts a server-notice naming it;
//   ② mounts.shadowedBy(p) = the registered storage whose mount point holds
//      p but is not mounted (files.js refuses ops under it with 503);
//   ③ the TASK.md mirror skips shadowed context folders and retries on
//      mounts-updated.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
const P = MountManager.prototype;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stranded-'));

// ── ① quarantine on connect ──
{
  const mp = path.join(tmp, 'OneDrive');
  fs.mkdirSync(path.join(mp, 'Courses', 'AIContext', '.vibespace'), { recursive: true });
  fs.writeFileSync(path.join(mp, 'Courses', 'AIContext', '.vibespace', 'TASK.md'), 'generated');
  fs.writeFileSync(path.join(mp, '.hidden'), 'dotfile');
  const notices = [];
  const fake = { broadcast: (m) => notices.push(m) };
  const dest = await P._ensureMountpointDir.call(fake, mp, { quarantine: true });
  ok(typeof dest === 'string' && dest.startsWith(mp + '.stranded-'), 'leftovers moved to a SIBLING <mp>.stranded-<ts>/ (never inside the mount point)', dest);
  ok(fs.existsSync(mp) && fs.readdirSync(mp).length === 0, 'the mount point is recreated EMPTY (rclone can now mount)');
  ok(fs.readFileSync(path.join(dest, 'Courses', 'AIContext', '.vibespace', 'TASK.md'), 'utf8') === 'generated' && fs.existsSync(path.join(dest, '.hidden')), 'every byte survives, dotfiles included — nothing deleted');
  const n = notices.find((m) => m.type === 'server-notice');
  ok(n && n.level === 2 && n.text.includes(dest) && /Nothing was deleted/.test(n.text), 'a level-2 server-notice names the quarantine path (silent-failure rule)', JSON.stringify(n));
  ok(/Courses, \.hidden|\.hidden, Courses/.test(n?.text || ''), 'the notice lists what was moved');
  // idempotent: an empty mount point is a no-op with no notice
  notices.length = 0;
  const again = await P._ensureMountpointDir.call(fake, mp, { quarantine: true });
  ok(again === null && notices.length === 0, 'an EMPTY mount point is a no-op (no move, no notice)');
  // default (edit-time caller) never quarantines — the user may point a record at a populated dir
  fs.writeFileSync(path.join(mp, 'keep.txt'), 'x');
  const edit = await P._ensureMountpointDir.call(fake, mp);
  ok(edit === null && fs.existsSync(path.join(mp, 'keep.txt')) && notices.length === 0, 'without {quarantine:true} (mount-point EDIT path) nothing is moved — only connect quarantines');
  const src = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
  ok((src.match(/_ensureMountpointDir\(mp, \{ quarantine: true \}\)/g) || []).length === 2, 'BOTH connect paths (rclone _mountInner + cephfs) quarantine — a kernel mount would silently SHADOW leftovers');
  ok(!/rm -rf|rmSync\([^)]*recursive: true[^)]*\)[^\n]*stranded/.test(src), 'no recursive delete anywhere near the quarantine (never-delete stance)');
}

// ── ② shadowedBy predicate ──
{
  const base = path.join(tmp, 'mounts');
  const rec = { id: 'od', name: 'OneDrive', type: 'onedrive' };
  const gm = { id: 'g', name: 'Mail', type: 'gmail' };
  const cred = { id: 'c', name: 'Keys', type: 'rclone', kind: 'credential' };
  const mk = (live) => ({ _state: { mounts: [rec, gm, cred] }, mountBase: base, _liveMounts: () => live,
    pathOf: P.pathOf, isMounted: P.isMounted, _kindOf: P._kindOf, shadowedBy: P.shadowedBy, gmail: { status: () => null } });
  const down = mk('');
  const mp = path.join(base, 'OneDrive');
  ok(down.shadowedBy(path.join(mp, 'Courses', 'x.md')) === rec, 'a path UNDER an unmounted storage resolves to that record');
  ok(down.shadowedBy(mp) === rec, 'the mount point itself is shadowed too');
  ok(down.shadowedBy(path.join(base, 'OneDriveX', 'a')) === null, 'prefix must be a whole path segment (OneDriveX is not OneDrive)');
  ok(down.shadowedBy(path.join(base, 'Mail', 'a.eml')) === null && down.shadowedBy(path.join(base, 'Keys')) === null, 'gmail folders and credential-only records never shadow (they are not filesystems)');
  ok(down.shadowedBy('') === null && down.shadowedBy(null) === null, 'empty/null path → null');
  const up = mk(`rclone ${mp} fuse.rclone rw,nosuid 0 0\n`);
  ok(up.shadowedBy(path.join(mp, 'Courses', 'x.md')) === null, 'a MOUNTED storage does not shadow (writes reach it)');
  const spaced = { id: 's', name: 'My Drive', type: 'drive', customPath: path.join(base, 'My Drive') };
  const sp = mk(`rclone ${path.join(base, 'My\\040Drive')} fuse.rclone rw 0 0\n`); sp._state.mounts.push(spaced);
  ok(sp.shadowedBy(path.join(base, 'My Drive', 'f')) === null, '/proc/mounts \\040 space escaping is honored through isMounted(m, live)');
}

// ── ③ the TASK.md mirror honors the predicate ──
{
  const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const shadowRoot = path.join(tmp, 'mounts', 'OneDrive');
  const okRoot = path.join(tmp, 'local-ctx'); fs.mkdirSync(okRoot, { recursive: true });
  let shadowOn = true;
  const tg = new TaskGroupManager({ dataDir, onChange: () => {}, readUserState: () => ({}), getSetting: () => undefined,
    isPathShadowed: (p) => (shadowOn && String(p).startsWith(shadowRoot)) ? { name: 'OneDrive' } : null });
  const a = tg.create({ title: 'stranded', contextDir: path.join(shadowRoot, 'Courses', 'AIContext') });
  const b = tg.create({ title: 'local', contextDir: okRoot });
  ok(!fs.existsSync(shadowRoot), 'a context folder on a DISCONNECTED storage gets NO TASK.md (the tree is not recreated on the bare mount point)');
  ok(fs.existsSync(path.join(okRoot, '.vibespace', 'TASK.md')), 'an ordinary context folder still gets its TASK.md');
  shadowOn = false; // storage came back
  fs.mkdirSync(path.join(shadowRoot, 'Courses', 'AIContext'), { recursive: true });
  tg.syncAllContextMd();
  ok(fs.existsSync(path.join(shadowRoot, 'Courses', 'AIContext', '.vibespace', 'TASK.md')), 'syncAllContextMd() after the mount returns writes the skipped file (retry-on-mounts-updated)');
  ok(typeof a.id === 'string' && typeof b.id === 'string', 'task ops never break over a shadowed folder');
  fs.mkdirSync(path.join(tmp, 'data2'), { recursive: true });
  const tgNoDep = new TaskGroupManager({ dataDir: path.join(tmp, 'data2'), onChange: () => {}, readUserState: () => ({}), getSetting: () => undefined });
  ok(typeof tgNoDep._isPathShadowed === 'function' && tgNoDep._isPathShadowed('/x') === null, 'the dep is optional (harness/older wiring) — defaults to never-shadowed');
}

// ── wiring pins (the 2.331.0 lesson: a pure fix with an unstaged call site is dead) ──
{
  const sv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/isPathShadowed: \(p\) => \{ try \{ return mounts\.shadowedBy\(p\); \} catch \{ return null; \} \}/.test(sv), 'server.js hands the task store a LAZY shadow getter (mounts wire up later — TDZ-safe like getPortForwards)');
  ok(/onMountsUpdated: \(\) => tasks\.syncAllContextMd\(\)/.test(sv), 'server.js wires mounts-updated → syncAllContextMd');
  const w = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/msg\?\.type === 'mounts-updated'\) \{ try \{ onMountsUpdated\?\.\(\);/.test(w), 'the wiring tees every mounts-updated broadcast into the resync');
  ok(/^try \{ onMountsUpdated\?\.\(\); \}/m.test(w), 'and resyncs ONCE right after mounts exist (the boot regen ran unguarded before them)');
  const fj = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
  ok(/const shadow = mounts\.shadowedBy\?\.\(p\);[\s\S]{0,200}status\(503\)/.test(fj), 'files.js refuses every op under a disconnected storage\'s mount point with 503 (no more writing into the bare dir from the explorer/editor)');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
