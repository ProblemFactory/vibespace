#!/usr/bin/env node
// test-registry-writes — B-574d «registries» (主开发 r4725, lane lg-group-parents). SIX HUB REGISTRIES NO LONGER WRITE BY THEIR OWN
// UNSYNCED TEMP + RENAME: after a power loss such a file could come back empty or torn, and its store was then held as damaged.
// FAST, in-process: each registry's REAL act over a scratch data folder; the faults are PLACED (a refused sync of the store's own
// temp; a stand-in writer thread that refuses its write) — never a mount, never a clock.
//   S  three registries written on a person's or an agent's act take a SYNCED replace through src/fd-close.js renameSynced (synchronous
//      by ruling: a rare write on an act, never a cadence) — app-proposals.json (apps-engine addHelper), plugin-registry.json
//      (plugin-loader setEnabled), feedback.json (feedback-store report):
//      S1 a sync — or a close — that FAILS (EIO placed at the fsync, or the close, of the store's own temp) is a failed write that
//         reaches the caller: a person's own Disable of a plugin and a helper's start REFUSE by name (write_failed, 主开发 r4765)
//         with nothing changed; feedback.json's report answers write_failed. The old file stands byte for byte, no temp is left.
//         RED: the release's writeJsonAtomic (an anchored copy) asks no sync and the new bytes take the name — the fault this cures
//      S2 a file system with no sync (EINVAL placed) lands the write and says it ONCE a run (two acts, one line)
//   W  three registries written at a cadence go through THE STORE WRITER (src/store-writer.js) — designs.json (design-engine: every
//      open, Rename, Remove, ask), doc-owners.json (doc-engine's owner memo: every lookup that sees an owner or a holder move) and
//      feedback-outbox.json (feedback-forward: every send attempt that backs off — 主开发 r4730):
//      W1 the act marks its file with the writer under its store-timing name; the bytes are made at the write and are the release's
//         bytes for the same acts; the module itself writes nothing of the store on the main loop (its own fs calls — the writer
//         here is a stand-in that records). RED: the release's save (an anchored copy) writes its own temp and renames it on the
//         loop, and marks nothing
//      W2 over a REAL writer on a stand-in thread: the write lands; a write the storage refuses is the writer's own line, the file
//         keeps its last landed bytes, and the store stays owed and lands once the storage answers again
//   O  the outbox's two landed writes (r4730: «nothing may be sent twice or lost»):
//      O1 a report QUEUED is on disk when enqueue returns (a crash after it never loses it). RED: the same enqueue paced
//      O2 A CRASH between a send and its removal's landing (the removal held on the writer's thread, the thread killed): the next
//         start sends that report again with the SAME origin key — the minted key landed before the first request named it — and
//         the maintainers' hub (its real receive) keeps ONE record. RED: the key paced — the next start mints another key and the
//         hub keeps the report twice
//      O3 a hub that comes back drains its queue: every send's removal goes to the writer — NO sync of the outbox on the hub's loop
//         (the stall class). RED: the synced-replace shape (b7f0a39fa: the outbox through renameSynced) syncs once a send on the loop
// Run: node scripts/test-registry-writes.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const quiet = { log() { }, info() { }, warn() { }, error() { } };
/** a copy of a product module compiled AS that module's file (its relative requires resolve as the real one's) */
const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Module(abs, null); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const bytes = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
let worldN = 0;   // every scene its own folder (a scratch NAME answers the same path in one run)
const temps = (dir, base) => fs.readdirSync(dir).filter((n) => n.startsWith(base + '.') && n.includes('tmp'));

/** THE PLACED SYNC (or CLOSE): the fsync of a descriptor opened on the store's OWN temp (`<file>.…tmp…`) answers `code` (null: lets
 *  it through) — or, `at: 'close'`, its close does (the descriptor closed first: a deferred write error arriving at the close);
 *  every such sync asked is counted */
function placeSync(file, code, { at = 'sync' } = {}) {
  const o = fs.openSync, s = fs.fsyncSync, c = fs.closeSync, fds = new Set(), asked = [];
  fs.openSync = function (p, ...a) { const fd = o.call(this, p, ...a); if (typeof p === 'string' && p.startsWith(file + '.') && p.includes('tmp')) fds.add(fd); return fd; };
  fs.fsyncSync = function (fd, ...a) { if (fds.has(fd)) { asked.push(fd); if (code && at === 'sync') throw Object.assign(new Error(`a placed ${code} at the sync`), { code }); } return s.call(this, fd, ...a); };
  fs.closeSync = function (fd, ...a) { const r = c.call(this, fd, ...a); if (fds.has(fd) && code && at === 'close') { fds.delete(fd); throw Object.assign(new Error(`a placed ${code} at the close`), { code }); } return r; };
  return { asked, restore: () => { fs.openSync = o; fs.fsyncSync = s; fs.closeSync = c; } };
}
/** console.warn (the four modules' «no sync» sink) captured around fn */
function warnsOf(fn) { const w0 = console.warn, out = []; console.warn = (...a) => out.push(a.join(' ')); try { return { r: fn(), out }; } finally { console.warn = w0; } }

// ── S: the four synced registries, each through its REAL act ──────────────────────────────────────────────────────────────────
const PLUG = (id) => JSON.parse(fs.readFileSync(path.join(REPO, `scripts/fixtures/${id}/vibespace-plugin.json`), 'utf8'));
const REGS = [
  { rel: 'src/server/apps-engine.js', base: 'app-proposals.json', tag: '[apps]',
    world: (M) => { const d = scratchDir('regw-apps-' + (++worldN)), lines = []; const e = M.create({ access: {}, dataDir: d, log: { ...quiet, warn: (...a) => lines.push(a.join(' ')) } }); return { d, file: path.join(d, 'app-proposals.json'), e, lines }; },
    act: (w, n) => w.e.addHelper({ host: 'local', sessionId: `helper-madeup-${n}`, request: 'install a made-up app' }),
    mark: (w, n) => `helper-madeup-${n}`,
    failed: (w, r, threw) => !!threw && threw.code === 'write_failed' && w.lines.some((l) => /app-proposals\.json not written: .*EIO/.test(l)),   // a helper's start refused by name (B-574d, r4765)
    putBack: true,
    tip: "function writeJsonAtomic(file, obj) { require('../fd-close.js').renameSynced(`${file}.${process.pid}.tmp`, file, JSON.stringify(obj, null, 2), { where: 'app-proposals.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[apps] ${w}`); } } }); }",
    rel0: 'function writeJsonAtomic(file, obj) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, file); }' },   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
  { rel: 'src/server/plugin-loader.js', base: 'plugin-registry.json', tag: '[plugins]',
    world: (M) => {
      const root = scratchDir('regw-plugins-' + (++worldN)), lines = [], ids = [];
      for (const fx of ['engine-plugin-egress', 'engine-plugin-user']) { const man = PLUG(fx), d = path.join(root, 'data', 'plugins', man.id); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/server.js'), path.join(d, 'server.js')); fs.writeFileSync(path.join(d, 'vibespace-plugin.json'), JSON.stringify(man)); ids.push(man.id); }
      const e = M.create({ rootDir: root, app: null, autoStart: false, hostVersion: '2.369.356', log: { ...quiet, warn: (...a) => lines.push(a.join(' ')) } });
      return { d: path.join(root, 'data'), file: path.join(root, 'data', 'plugin-registry.json'), e, lines, ids };
    },
    act: (w, n) => w.e.setEnabled(w.ids[n % 2], false),   // switched off (never started): acts 1 and 2 each add a registry row
    mark: (w, n) => w.ids[n % 2],
    failed: (w, r, threw) => !!threw && threw.status === 500 && !!threw.payload && threw.payload.code === 'write_failed' && w.lines.some((l) => /registry write failed: .*EIO/.test(l)),   // the person's own Disable refused by name (B-574d, r4765)
    putBack: true,
    tip: "  require('../fd-close.js').renameSynced(file + '.tmp', file, JSON.stringify(obj, null, 2), { where: 'plugin-registry.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[plugins] ${w}`); } } });",
    rel0: "  const tmp = file + '.tmp';\n  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));\n  fs.renameSync(tmp, file);" },   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
  { rel: 'src/server/feedback-store.js', base: 'feedback.json', tag: '[feedback]',
    world: (M) => { const d = scratchDir('regw-feedback-' + (++worldN)); return { d, file: path.join(d, 'feedback.json'), e: M.create({ dataDir: d, log: () => { } }), lines: [] }; },
    act: (w, n) => w.e.report({ text: `a made-up report ${n}`, about: 'vibespace-task' }, { session: { id: `sess-madeup-${n}`, name: `Made-up ${n}` } }),
    mark: (w, n) => `a made-up report ${n}`,
    failed: (w, r, threw) => !threw && !!r && r.ok === false && r.code === 'write_failed',
    tip: "  require('../fd-close.js').renameSynced(`${file}.tmp-${process.pid}`, file, JSON.stringify(obj), { where: 'feedback.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[feedback] ${w}`); } } });",
    rel0: '  const tmp = `${file}.tmp-${process.pid}`;\n  fs.writeFileSync(tmp, JSON.stringify(obj));\n  fs.renameSync(tmp, file);' },   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
];

/** one store's scene under a placed sync code: a first act lands (the old file), the second meets the placed sync */
function scene(R, M, code, at = 'sync') {
  const w = R.world(M);
  R.act(w, 1);
  const old = bytes(w.file);
  const p = placeSync(w.file, code, { at });
  let r, threw = null, said = [];
  try { const x = warnsOf(() => { try { return R.act(w, 2); } catch (e) { threw = e; return null; } }); r = x.r; said = x.out; } finally { p.restore(); }
  const now = bytes(w.file), tmp = temps(w.d, R.base);
  // a press that refused must have changed NOTHING: the next write (nothing placed) carries no trace of it
  let putBack = null; if (R.putBack) { try { R.act(w, 3); } catch { } putBack = !(bytes(w.file) || '').includes(R.mark(w, 2)); }
  return { w, r, threw, old, now, asked: p.asked.length, temps: tmp, said, putBack };
}

console.log('S1 a sync that FAILS is a failed write that reaches the caller; the old file stands (four registries, each through its real act)');
for (const R of REGS) {
  const M = require(path.join(REPO, R.rel));
  for (const at of ['sync', 'close']) {
    const t = scene(R, M, 'EIO', at);
    const facts = { at, asked: t.asked, threw: t.threw && (t.threw.code || (t.threw.payload && t.threw.payload.code)), oldKept: t.now === t.old, temps: t.temps, failedSaid: R.failed(t.w, t.r, t.threw), putBack: t.putBack, lines: t.w.lines.slice(-2) };
    console.log(`    ${R.base}: ${JSON.stringify(facts)}`);
    ok(!!t.old && !t.old.includes(R.mark(t.w, 2)) && t.asked === 1 && t.now === t.old && t.temps.length === 0 && R.failed(t.w, t.r, t.threw) && (!R.putBack || t.putBack === true),
      `S1 ${R.base} (${R.rel}): one sync of its own temp asked; an EIO placed at the ${at.toUpperCase()} fails the write to its caller — ${R.putBack ? 'the press REFUSED by name (write_failed) and nothing changed (the next write carries no trace of it)' : 'its answer write_failed'} —, the OLD file stands byte for byte, no temp left`, facts);
  }
  // RED: the release's writeJsonAtomic — its own unsynced temp + rename
  let red = null, why = null;
  try { red = scene(R, asModule(R.rel, anchored(srcOf(R.rel), R.tip, R.rel0, `s1-${R.base}-release`)), 'EIO'); } catch (e) { why = e.message; }
  const rf = red && { asked: red.asked, newTookName: !!red.now && red.now.includes(R.mark(red.w, 2)), failedSaid: R.failed(red.w, red.r, red.threw) };
  console.log(`    RED copy ${R.base}: ${JSON.stringify(rf || why)}`);
  ok(!!red && red.asked === 0 && rf.newTookName && !rf.failedSaid,
    `S1 RED CONTROL ${R.base}: the release's writeJsonAtomic asks no sync — under the same placed EIO the NEW bytes take the name and the caller hears nothing`, rf || why);
}

console.log('S2 a file system with no sync at all: the write lands, said ONCE a run');
for (const R of REGS) {
  const M = require(path.join(REPO, R.rel));
  const w = R.world(M);
  R.act(w, 1);
  const p = placeSync(w.file, 'EINVAL');
  let a, b;
  try { a = warnsOf(() => R.act(w, 2)); b = warnsOf(() => R.act(w, 3)); } finally { p.restore(); }
  const lines = [...a.out, ...b.out].filter((l) => l.startsWith(R.tag) && l.includes(`${R.base}: its file system does not do a sync (EINVAL)`));
  const doc = bytes(w.file) || '';
  const facts = { asked: p.asked.length, lines, landed: [2, 3].map((n) => doc.includes(R.mark(w, n))), temps: temps(w.d, R.base) };
  ok(p.asked.length === 2 && lines.length === 1 && facts.landed.every(Boolean) && facts.temps.length === 0,
    `S2 ${R.base}: two writes on a file system that does no sync (EINVAL) both land; «does not do a sync» is said ONCE a run, with the store's name and the code (no path)`, facts);
}

// ── W: the two writer registries ──────────────────────────────────────────────────────────────────────────────────────────────
const SW = require(path.join(REPO, 'src/store-writer.js'));
const DE = require(path.join(REPO, 'src/server/design-engine.js'));
const DOC = require(path.join(REPO, 'src/server/doc-engine.js'));
const timers = { setInterval: () => ({ unref() { } }), clearInterval: () => { }, setTimeout: () => ({ unref() { } }) };
const CID = '5b0c2e8a-7d1f-4c3e-9a61-0d2f8b7c6e15';
/** every write of the main process that names `base` (sync and promise roads), counted while fn runs */
async function mainWrites(base, fn) {
  const fsp = fs.promises, keep = { wf: fs.writeFileSync, rn: fs.renameSync, pwf: fsp.writeFile, prn: fsp.rename }, seen = [];
  const hit = (...ps) => ps.some((p) => typeof p === 'string' && path.basename(p).startsWith(base));
  fs.writeFileSync = function (p, ...a) { if (hit(p)) seen.push('writeFileSync ' + path.basename(p)); return keep.wf.call(this, p, ...a); };
  fs.renameSync = function (a, b, ...r) { if (hit(a, b)) seen.push('renameSync ' + path.basename(a)); return keep.rn.call(this, a, b, ...r); };
  fsp.writeFile = function (p, ...a) { if (hit(p)) seen.push('promises.writeFile ' + path.basename(p)); return keep.pwf.call(this, p, ...a); };
  fsp.rename = function (a, b, ...r) { if (hit(a, b)) seen.push('promises.rename ' + path.basename(a)); return keep.prn.call(this, a, b, ...r); };
  try { return { r: await fn(), seen }; } finally { fs.writeFileSync = keep.wf; fs.renameSync = keep.rn; fsp.writeFile = keep.pwf; fsp.rename = keep.prn; }
}
const fakeWriter = () => { const marked = []; return { marked, dirty: (file, o) => marked.push({ base: path.basename(file), name: o.name, produce: o.produce }), durable: async () => true }; };
const noIds = (s) => noKey(String(s || '').replace(/"dg[^"]*"/g, '"ID"'));
const designActs = async (e) => { e.register({ dir: '/scratch-made-up/design-w1', title: 'One' }); e.rename({ dir: '/scratch-made-up/design-w1', title: 'The name the person gave' }); e.register({ dir: '/scratch-made-up/design-w2', title: 'Two' }); };
const CID2 = '9e4a1b3c-2d5f-4e6a-8b7c-1f0e2d3c4b5a';
const docWorld = (M, d, writer) => { const live = new Map([['w1', { mode: 'chat', backend: 'claude', claudeSessionId: CID }]]); const e = M.create({ activeSessions: live, getDeliver: () => null, sendUserInput: null, artifacts: { ownerOf: () => null, holdersOf: () => [] }, dataDir: d, now: () => 7, log: () => { }, writer }); e._live = live; return e; };
const docActs = async (e) => { e.ownerOf({ path: '/w/BRIEF.md', from: 'w1' }); };
const FFW = require(path.join(REPO, 'src/server/feedback-forward.js'));
const FFM = require(path.join(REPO, 'src/feedback-forward-model.js'));
const TARGET = () => ({ url: 'https://hub.example.test', token: 'made-up' });
const fbRow = (n) => ({ id: `fb-madeup${n}`, text: `a made-up report ${n}`, about: 'vibespace-task', kind: 'other', at: 1000 + n, session: { id: `sess-${n}`, name: `Made-up ${n}` } });
const outbox = (M, d, writer, more = {}) => M.create({ dataDir: d, writer, target: TARGET, instance: () => ({ name: 'made-up', version: '0' }), backlog: () => [], fetch: async () => { throw new Error('no network in this suite'); }, now: () => 1000, setTimeout: () => ({ unref() { } }), clearTimeout: () => { }, log: () => { }, ...more });
const noKey = (s) => String(s || '').replace(/"fk_[A-Za-z0-9_-]+"/g, '"KEY"');
const W_REGS = [
  { name: 'designs.write', base: 'designs.json', rel: 'src/server/design-engine.js',
    make: (M, d, writer) => M.create({ dataDir: d, timers, log: () => { }, now: () => 1000, writer }), acts: designActs, settle: (e) => e.flush(),
    more: (e) => e.register({ dir: '/scratch-made-up/design-w3', title: 'Three' }),
    tip: [["  const W = () => writer || require('../store-writer.js').storeWriter();\n  function save() {\n    if (!hold.writable('a design list change')) return;   // held: nothing written over it\n    try { W().dirty(storeFile, { name: 'designs.write', produce: () => JSON.stringify({ designs: store.designs }, null, 2) }); }   // store-timing's row (src/timed-sync.js)\n    catch (e) { log('[design] registry save failed:', e.message); }\n  }\n  const flush = () => { try { return Promise.resolve(W().durable(storeFile)).then((ok) => !!ok, () => false); } catch { return Promise.resolve(false); } };\n",
      "  let saving = Promise.resolve();\n  const save = () => {\n    if (!hold.writable('a design list change')) return;   // held: nothing written over it\n    const snap = { designs: store.designs.map((r) => ({ ...r })) };\n    saving = saving.then(() => writeJsonAtomic(storeFile, snap)).catch((e) => log('[design] registry save failed:', e.message));\n    return saving;\n  };\n  const flush = () => saving;\n"],
      ['/** A folder as the caller names it → its normalized absolute posix path, or null. */', "async function writeJsonAtomic(file, obj) {\n  const tmp = file + '.tmp-' + process.pid;\n  await fs.promises.writeFile(tmp, JSON.stringify(obj, null, 2));\n  await fs.promises.rename(tmp, file);\n}\n\n/** A folder as the caller names it → its normalized absolute posix path, or null. */"]] },   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
  { name: 'doc-owners.write', base: 'doc-owners.json', rel: 'src/server/doc-engine.js',
    make: (M, d, writer) => docWorld(M, d, writer), acts: docActs, settle: async () => true,
    more: (e) => { e._live.set('w2', { mode: 'chat', backend: 'claude', claudeSessionId: CID2 }); e.ownerOf({ path: '/w/PLAN.md', from: 'w2' }); },   // a second owner seen: the memo moves
    tip: [["  function save() {\n    if (!file || (hold && !hold.writable('a document owner noted'))) return;   // held: nothing is written over the unread file\n    try { W().dirty(file, { name: 'doc-owners.write', makeDir: true, produce: () => JSON.stringify(m) }); }   // store-timing's row (src/timed-sync.js)\n    catch (e) { log('[doc] doc-owners.json not written:', e.message); }\n  }\n",
      "  const save = () => {\n    if (!file || (hold && !hold.writable('a document owner noted'))) return;   // held: nothing is written over the unread file\n    try { fs.mkdirSync(nodePath.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(m)); fs.renameSync(file + '.tmp', file); }\n    catch (e) { log('[doc] doc-owners.json not written:', e.message); }\n  };\n"]] },   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
  { name: 'feedback-outbox.write', base: 'feedback-outbox.json', rel: 'src/server/feedback-forward.js',
    make: (M, d, writer) => outbox(M, d, writer), acts: async (e) => { e.enqueue(fbRow(1)); e.enqueue(fbRow(2)); }, settle: async () => true,
    more: (e) => e.enqueue(fbRow(3)),
    tip: [[/  function save\(\{ land = false \} = \{\}\) \{[\s\S]*?\n  \}\n/, "  const save = () => { if (!hold.writable('the feedback outbox')) return false; try { writeJsonAtomic(file, state); return true; } catch (e) { log('[feedback] data/feedback-outbox.json not written:', e.message); return false; } };\n"],   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
      ['/** deps: dataDir;', 'function writeJsonAtomic(file, obj) {\n  const tmp = `${file}.tmp-${process.pid}`;\n  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });\n  fs.renameSync(tmp, file);\n}\n\n/** deps: dataDir;']] },   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
];

console.log('W1 the three cadence registries mark their file with THE STORE WRITER; the bytes are the release\'s; nothing written on the main loop');
for (const R of W_REGS) {
  const M = require(path.join(REPO, R.rel));
  const d = scratchDir('regw-w1-' + R.base.replace('.json', '')), fw = fakeWriter(), e = R.make(M, d, fw);
  const run = await mainWrites(R.base, async () => { await R.acts(e); await R.settle(e); });
  const last = fw.marked[fw.marked.length - 1];
  // the release's bytes for the same acts: its own save over another folder
  let rel = null, why = null;
  try {
    let code = srcOf(R.rel); for (const [a, b] of R.tip) code = anchored(code, a, b, `w1-${R.base}-release`);
    const RM = asModule(R.rel, code), d0 = scratchDir('regw-w1r-' + R.base.replace('.json', '')), fw0 = fakeWriter(), e0 = R.make(RM, d0, fw0);
    const r0 = await mainWrites(R.base, async () => { await R.acts(e0); await R.settle(e0); });
    rel = { seen: r0.seen, marked: fw0.marked.length, onDisk: bytes(path.join(d0, R.base)) };
  } catch (x) { why = x.message; }
  const made = last ? noIds(last.produce()) : null;
  const facts = { marks: fw.marked.map((x) => [x.base, x.name]), mainWrites: run.seen, sameBytes: !!rel && made === noIds(rel.onDisk), file: fs.existsSync(path.join(d, R.base)) };
  console.log(`    ${R.base}: ${JSON.stringify(facts)}`);
  ok(fw.marked.length > 0 && fw.marked.every((x) => x.base === R.base && x.name === R.name) && run.seen.length === 0 && facts.sameBytes && !facts.file,
    `W1 ${R.base} (${R.rel}): every act marks it with THE STORE WRITER as «${R.name}» (store-timing's row); the bytes made at the write are the release's for the same acts; no write of it on the main loop`, facts);
  console.log(`    RED copy ${R.base}: ${JSON.stringify(rel ? { seen: rel.seen, marked: rel.marked } : why)}`);
  ok(!!rel && rel.marked === 0 && rel.seen.some((s) => /rename/.test(s)),
    `W1 RED CONTROL ${R.base}: the release's save writes its own temp and renames it on the main loop (the leg sees it) and marks nothing`, rel ? { seen: rel.seen, marked: rel.marked } : why);
}

console.log('W2 over a REAL writer on a stand-in thread: lands; a refused write is said, the file keeps its last landing, the store stays owed and lands');
{
  const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(scratchDir('regw-stand'));
  const said = [], W = SW.create({ log: { ...quiet, warn: (l) => said.push(String(l)) }, workerPath: STAND.path });
  try {
    for (const R of W_REGS) {
      const M = require(path.join(REPO, R.rel)), d = scratchDir('regw-w2-' + R.base.replace('.json', '')), f = path.join(d, R.base), e = R.make(M, d, W);
      await R.acts(e);
      const a = await W.durable(f, { timeoutMs: 20000 }), first = bytes(f);
      STAND.failOn(R.base, true);
      R.more(e);
      const b = await W.durable(f, { timeoutMs: 20000 }), kept = bytes(f), owed = W.pending ? W.pending(f) : null;
      STAND.failOn(R.base, false);
      const c = await W.durable(f, { timeoutMs: 20000 }), last = bytes(f);
      const line = said.find((l) => l.includes(`${R.name} not written`) && l.includes('EIO'));
      const facts = { landed: a, refused: b, keptLast: kept === first, owedAfter: owed, landedLater: c, changed: last !== first, line };
      console.log(`    ${R.base}: ${JSON.stringify(facts)}`);
      ok(a === true && !!first && b === false && kept === first && owed === true && !!line && c === true && last !== first,
        `W2 ${R.base}: its write lands through the writer's thread; a write the storage refuses (EIO) is the writer's own line («${R.name} not written»), the file keeps its last landed bytes, and the store stays owed and lands once the storage answers`, facts);
    }
  } finally { try { W.stop(); } catch { } }
}


// ── O: the outbox's two landed writes (主开发 r4730: «nothing may be sent twice or lost») ──────────────────────────────────────────
const FF_REL = 'src/server/feedback-forward.js';
const KEYED = (key, queue = []) => JSON.stringify({ v: 1, key, queue, sent: 0, dropped: 0, refused: 0, fails: 0, holdUntil: 0, marksSince: 0, marksAt: 0, backfilled: true, pause: null, targetVersion: null, lost: [] });
console.log('O1 a report QUEUED is on disk when enqueue returns (a crash after it never loses it from the outbox)');
{
  const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(scratchDir('regw-o1-stand'));
  const W = SW.create({ log: quiet, workerPath: STAND.path });
  const scene1 = (M, tag) => {
    const d = scratchDir('regw-o1-' + tag), f = path.join(d, 'feedback-outbox.json');
    fs.writeFileSync(f, KEYED('fk_' + 'A'.repeat(43)));   // a key already on disk: the enqueue's own write is the only one asked
    const o = outbox(M, d, W);
    const r = o.enqueue(fbRow(11));
    const at = bytes(f);   // read in the SAME turn as the call's return — no wait, no clock
    o.stop();
    return { queued: !!r && r.queued === true, onDiskAtReturn: (at || '').includes('fb-madeup11') };
  };
  try {
    const tip = scene1(FFW, 'tip');
    let red = null, why = null;
    try { red = scene1(asModule(FF_REL, anchored(srcOf(FF_REL), "    save({ land: true });   // B-574d: a report queued is on disk before the call returns (a crash after it never loses it)\n", '    save();\n', 'o1-paced')), 'red'); } catch (e) { why = e.message; }
    console.log(`    facts: ${JSON.stringify({ tip, red: red || why })}`);
    ok(tip.queued && tip.onDiskAtReturn, 'O1 enqueue returns with the report ON DISK (the writer\'s synchronous flush of that one file, bounded)', tip);
    ok(!!red && red.queued && !red.onDiskAtReturn, 'O1 RED CONTROL: the same enqueue with its write paced returns before the report is on disk — a crash then would lose it from the outbox', red || why);
  } finally { try { W.stop(); } catch { } }
}

console.log('O2 a crash between a send and its removal\'s landing: the next start sends it again under the SAME origin key; the hub keeps ONE record');
{
  const FSm = require(path.join(REPO, 'src/server/feedback-store.js'));
  const keyIdOf = (k) => require('node:crypto').createHash('sha256').update(String(k)).digest('hex').slice(0, 16);
  const scene2 = async (M, tag) => {
    const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(scratchDir('regw-o2-stand-' + tag));
    const d = scratchDir('regw-o2-' + tag), f = path.join(d, 'feedback-outbox.json');
    const hubDir = scratchDir('regw-o2-hub-' + tag), hub = FSm.create({ dataDir: hubDir, log: () => { } });   // the maintainers' hub: its REAL receive (dedupe by origin key + id)
    // the outbox as a start that has no origin key yet finds it (a new instance's first send; a torn file's start): one report queued
    const row = fbRow(21);
    fs.writeFileSync(f, KEYED(null, [{ id: row.id, body: FFM.wireBody(row, { instance: 'made-up', version: '0' }), tries: 0, firstAt: 1 }]));
    const seen = [];
    const fetch = async (url, o) => {
      const key = o.headers['X-VibeSpace-Feedback-Origin'], disk = JSON.parse(bytes(f) || '{}');
      STAND.hold('feedback-outbox.json', 600000);   // THE CRASH, PLACED: from this request on, every write of the outbox waits on the thread
      const r = hub.receive(JSON.parse(o.body), { key: keyIdOf(key) });
      seen.push({ key, keyOnDisk: disk.key || null, duplicate: !!(r && r.duplicate), ok: !!(r && r.ok) });
      return { status: r && r.ok ? 200 : 400, headers: { get: () => null }, json: async () => r };
    };
    const life = async () => { const W = SW.create({ log: quiet, workerPath: STAND.path }); const o = outbox(M, d, W, { fetch }); const p = await o.pump(); o.stop(); W.stop(); return p; };   // W.stop(): the thread dies with what it owed
    const p1 = await life();
    STAND.unhold('feedback-outbox.json');
    const p2 = await life();
    STAND.unhold('feedback-outbox.json');
    const records = ((JSON.parse(bytes(path.join(hubDir, 'feedback.json')) || '{}').records) || []).filter((r) => r.origin && r.origin.id === row.id).length;   // the hub's own file (written before its answer)
    return { p1: p1 && p1.sent, p2: p2 && p2.sent, seen, records };
  };
  const tip = await scene2(FFW, 'tip');
  let red = null, why = null;
  try {
    let code = srcOf(FF_REL);
    code = anchored(code, 'keyOwed = !save({ land: true }); }   // B-574d: on disk before any request names it', 'save(); }', 'o2-key-paced');
    code = anchored(code, /          key\(\);   \/\/ B-574d: a NEW origin key[^\n]*\n[^\n]*\n/, '', 'o2-no-key-wait');
    red = await scene2(asModule(FF_REL, code), 'red');
  } catch (e) { why = e.message; }
  console.log(`    facts: ${JSON.stringify({ tip, red: red || why })}`);
  ok(tip.seen.length === 2 && tip.seen[0].key === tip.seen[0].keyOnDisk && tip.seen[1].key === tip.seen[0].key && tip.seen[1].duplicate && tip.records === 1,
    'O2 the minted origin key is ON DISK when the first request names it; the restart after the crash sends the report again under that SAME key and the hub answers it as the record it already made (duplicate) — ONE record', tip);
  ok(!!red && red.seen.length === 2 && red.seen[0].keyOnDisk === null && red.seen[1].key !== red.seen[0].key && red.records === 2,
    'O2 RED CONTROL: the key written paced — the request names a key not on disk, the restart mints ANOTHER and the hub keeps the report twice', red || why);
}


console.log('O3 a queue drained after the hub comes back: no sync of the outbox on the hub\'s loop (every removal is the writer\'s)');
{
  const scene3 = async (M, tag) => {
    const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(scratchDir('regw-o3-stand-' + tag));
    const d = scratchDir('regw-o3-' + tag), f = path.join(d, 'feedback-outbox.json');
    const q = [31, 32, 33, 34, 35].map((n) => { const row = fbRow(n); return { id: row.id, body: FFM.wireBody(row, { instance: 'made-up', version: '0' }), tries: 0, firstAt: n }; });
    fs.writeFileSync(f, KEYED('fk_' + 'C'.repeat(43), q));
    const W = SW.create({ log: quiet, workerPath: STAND.path });
    const ok200 = async () => ({ status: 200, headers: { get: () => null }, json: async () => ({ ok: true }) });
    const o = outbox(M, d, W, { fetch: ok200 });
    const p = placeSync(f, null);   // counts every sync of the outbox's own temp asked ON THIS THREAD (the writer's thread is another)
    let out = null;
    try { out = await o.pump(); } finally { p.restore(); o.stop(); W.stop(); }
    return { sent: out && out.sent, loopSyncs: p.asked.length };
  };
  const tip = await scene3(FFW, 'tip');
  let red = null, why = null;
  try {
    let code = srcOf(FF_REL);
    code = anchored(code, /  function save\(\{ land = false \} = \{\}\) \{[\s\S]*?\n  \}\n/, "  const save = () => { if (!hold.writable('the feedback outbox')) return false; try { writeJsonAtomic(file, state); return true; } catch (e) { log('[feedback] data/feedback-outbox.json not written:', e.message); return false; } };\n", 'o3-synced-save');   // stale-pins: kept — the b7f0a39fa shape: the red control's replacement, never an anchor
    code = anchored(code, '/** deps: dataDir;', "function writeJsonAtomic(file, obj) {\n  require('../fd-close.js').renameSynced(`${file}.tmp-${process.pid}`, file, JSON.stringify(obj), { mode: 0o600, where: 'feedback-outbox.json' });\n}\n\n/** deps: dataDir;", 'o3-synced-door');   // stale-pins: kept — the b7f0a39fa shape: the red control's replacement, never an anchor
    red = await scene3(asModule(FF_REL, code), 'red');
  } catch (e) { why = e.message; }
  console.log(`    facts: ${JSON.stringify({ tip, red: red || why })}`);
  ok(tip.sent === 5 && tip.loopSyncs === 0, 'O3 five queued reports drained: NO sync of the outbox on the hub\'s loop — each send\'s removal is the writer\'s, off the loop', tip);
  ok(!!red && red.sent === 5 && red.loopSyncs >= 5, 'O3 RED CONTROL: the synced-replace shape (the outbox through renameSynced, b7f0a39fa) syncs on the hub\'s loop once a send — a day\'s queue is a burst of syncs on the data folder', red || why);
}

report();
