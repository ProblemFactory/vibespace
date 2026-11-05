#!/usr/bin/env node
// test-engine-distribution — lane fleet-plugin-catalog (the owner, 2026-11-05: 「为什么后面升浏览器内核每次都要重新 upgrade pod？
// 内核不是插件吗？把内核那套放到 admin 里，VibeSpace 去读它作为插件来更新和安装」). FAST, in-process: the REAL plugin loader over a
// RECORDING git (scripts/fixtures/git-repo.mjs — a local bare repository of the engine plugin at its commits), the REAL presets
// reader WATCHING a directory (cluster-presets `start()` — fs.watch, a 30 ms debounce), the REAL engine distribution, a fake
// kernel host on loopback (tiny tar.zst archives built here — never a real kernel, never a real host). Legs:
//   ① boot install at the cluster's pin, trusted by the cluster, the kernel preinstalled — the row's words
//   ② the admin edits fleet.json (a new sha) ⇒ the WATCH runs the job: ONE update to the new sha, trusted at it; the OLD package
//      untrusted the moment the pin moved (the update held at the git step); «Updated by the cluster · <old> → <new> · <when>»
//   ③ changes during a run ⇒ ONE queued re-run (never two runs at once)
//   ④ a failed update ⇒ journaled + ONE For-you notice, NOT retried until the next change (no loop); the next change retries it
//   ⑤ a tag ⇒ installed, never trusted, said by name; a change that leaves the engine alone ⇒ no git call
//   ⑥ default / preinstall flips: the default policy reads the new fact; preinstall false ⇒ the new kernel is DUE (nothing
//      fetched), true ⇒ downloaded now
//   ⑦ a browser runs the kernel ⇒ the new one WAITS beside it (.next-<tag>), the place untouched; it lands at the next start
//      with no browser on the old one — the card's and the panel's words
// ROUND 2 (主开发's acceptance of 88bda7ad6):
//   ⑤ (N1) a TAG with preinstall on ⇒ the untrusted package's kernel.json is not read, nothing fetched, nothing run (no measure),
//      the trusted kernel stays in its place; «waiting for your consent — its kernel is not fetched»
//   ⑧ (N2) a kernel waiting beside a running browser, then the cluster pins BACK ⇒ a start while the new pin installs lands nothing;
//      the run discards the waiting kernel (its folder gone, one line), the place keeps the planned one, nothing downloaded again
//   ⑨ (N3) LIGHT SCENES (a light distribution over a COPY of the pod's data/ — the loader as the snapshot saw it, no git, no watch):
//      a start meeting a landing in flight WAITS and runs the landed kernel, a measure in that window puts nothing back (no false
//      notice); a landing never starts while a start holds the place — and gives up after its bound, said
//   ⑩ (N4) the REAL /proc check: a program run from the kernel's place through a SYMLINKED data/ is seen (real paths); this user's
//      process whose exe cannot be read (EACCES) is judged by its argv[0] ⇒ in use, a place that cannot be resolved ⇒ in use
//   ⑪ (N5) a waiting kernel whose folder is not the recorded one ⇒ discarded WITH its folder; a `.next-` / `.unpack-` / `.part` the
//      record does not name (a stop between stageNext's rename and its save) ⇒ swept at boot, one line
// ROUND 3 (主开发's acceptance of 8934d6ddf):
//   ⑨ (r3) a landing never WAITS for a start: a held place ⇒ «not now» at once, no line
//   ⑫ (N1) THE INSTALL ROAD IS JUDGED AT ITS LANDING like the waiting road: a download in flight whose package lost the cluster's trust
//      or whose plan moved ⇒ discarded, never landed / staged / measured, one line — light scenes (the acceptance's probe) and the
//      REAL fleet road (a pin, then a rollback while the kernel host holds the archive)
//   ⑬ (N2) A START NEVER WAITS FOR A LANDING THAT CANNOT HAPPEN: starts beside a waiting kernel and a running browser return at once
//      with no line; a start during a landing in progress waits for it, said (journal + card); ONE bound for the whole ask
//   ⑭ (N3) a waiting kernel whose receipt cannot be read now (EACCES) is KEPT, said once, and lands once it reads again
//   ⑮ (N4) the cluster's repository holding ANOTHER plugin id: its own words on the panel, the rows and the boot line
//   ⑯ (N5) a tag pin the owner enabled: the line follows trust NOW
// ROUND 4 (主开发's acceptance of f4a3a002e):
//   ⑫ (N1) THE JUDGE IS ASKED LAST, inside the section — the acceptance's probe: the trust withdrawn / the plan moved INSIDE the
//      in-use scan (both roads) and at the first rename (the previous kernel aside) ⇒ not landed, not run, one line (the install
//      road's download discarded; the waiting road's kernel kept on a lapsed trust — r2's rule — and discarded on a moved plan);
//      the MEASURE runs no kernel whose package is not trusted now; the cluster's install of the package holds the ONE lock (a
//      landing asked meanwhile ⇒ «not now» at once)
//   ⑬ (N2) the engine card's «waiting for the new kernel to land» read THROUGH THE KEEPER (its engines view — GET
//      /api/browser/engines, Change build…, New profile…), never the distribution's export; every kernelFact field reaches it
//   ⑰ (N3) a plan that cannot be read at the landing (EIO) KEEPS the verified download beside the place, said once; the fleet's
//      ONE queued re-run lands it once it reads again
//   ⑱ (N4) a discard leaves a trace: the record, the card (through the keeper), ONE For-you notice when nobody watched
//   ⑲ (N5) the boot line says «kernel ready» only for a kernel in its place
//   ⑳ (主开发's ruling on the r3 acceptance's (b)) nothing proceeds beside a HALF-LANDED place: a start past its bound with the landing
//      still in progress is refused by name («the kernel is being replaced — try again in a moment»); the aside kernel is put back
//      by the next run (⑬ «one bound» now asserts the refusal too)
//   ㉑ (the ruling's (4)) judgeNow's 'moved' branch: a plan whose inputs keep moving is never landed on either road
// ROUND 5 (主开发's acceptance of cf33c614c):
//   ㉒ (m1) a REFUSED STAGING KEEPS WHAT WAITS: the trust withdrawn inside the in-use scan / at the waiting kernel's move aside ⇒ the
//      kernel already waiting stays byte for byte with its record, only the new download is discarded; the card (through the
//      keeper) says both
//   ㉓ (m2) a start is refused ONLY while the place is not whole: one during the clean-up of the previous kernel goes on (on the new
//      kernel); one whose bound passes before anything moved goes on (on the previous kernel) and the landing moves nothing it holds
//   ㉔ (m3) a start never waits behind a git clone: a plan write that begins during its in-use scan ⇒ «not now» at once, no words
//   ㉕ (m4) every step-aside has a leg: the measure answers the refusal (nothing run), the boot skips the id and goes on to the
//      next, a download asked meanwhile records no failure (no For-you notice)
// ROUND 6 (主开发's acceptance of 7f96d8357):
//   ㉖ (n1) a landing asks onPlace's WHOLE question in the turn it moves: a start past its bound that SPAWNED and dropped its hold
//      before the landing's last await ended (the acceptance's probe) — and one that did so DURING the landing's own in-use scan —
//      ⇒ the landing answers held, K2 stays in its place under the running browser, K3 keeps waiting; (n5) the staging's line says
//      WHICH: «a browser start holds the current kernel» / «a browser runs the current kernel»
//   ㉗ (n2) an EMPTY place with its kernel aside is not whole: the landing's own put-back (.removing → place) hangs ⇒ a start past
//      its bound is refused by name, the measure answers, the boot skips the id and goes on, a download records no failure
//   ㉘ (n3) the sweep never removes the ONLY copy of the kernel the record names: VibeSpace stops at each of the staging's three
//      points (after the move aside · at the put-back after a refusal · at the new rename) ⇒ the next boot puts K3 back at
//      .next-<tag> byte for byte; a put-back that fails ⇒ the record says it is gone (the card, kernelDue due again)
//   ㉙ (n5) the refusal's words in the person's language: humanRefusalText + buildRefusalWords under the en / zh / ja dictionaries
//   ㉒ (n4) the card names one version once: a second download of the waiting kernel is said as such
// ROUND 7 (主开发's acceptance of 33d0d0f21):
//   ㉚ (p1) «UNREADABLE» IS A THIRD ANSWER: VibeSpace stops with K3 only as .next-<tag>.prev, then its receipt answers EIO on every
//      read ⇒ on each road (the boot's sweep · a start's landNext · the cluster's download staged beside the place — r8: a
//      person's is ㉞'s) NOTHING moves and NOTHING is recorded — the .prev byte for byte, rec.next untouched, kernelDue staged, ONE
//      line; the next boot that reads it puts K3 back
//   ㉛ (p2) THE NOT-WHOLE WINDOW OPENS WHEN THE PUT-BACK IS ASKED: ㉗ with each of the put-back's two stats held instead of its
//      rename (.removing-<tag>, then the place) ⇒ the start refused by name, the measure answered, the boot skips the id and puts
//      the second engine back, the download records no failure
//   M28 (p4) asserts the mechanism (the start WAITED: its journal lines + the card's waitS), its bound ÷ 2 — never ±1 ms of it
// ROUND 8 (主开发's acceptance of f0adfe02b):
//   ㉜ (s1) THE PUT-BACK GIVES THREE ANSWERS TOO: K2 aside, the place EMPTY, K3 waiting — a start's landing whose put-back stat of
//      the place answers EIO (twice · with the trust withdrawn in it · with the plan moved to K2 in it) ⇒ nothing lands, nothing
//      moves, nothing is deleted: .removing-<tag> byte for byte, rec.aside K2, rec.next K3, ONE line; the next readable run (a
//      measure) puts K2 back
//   ㉝ (s2) THE SWEEP KEEPS A NAME ONLY WHILE IT CANNOT TELL: a copy of K2 left as .next-<tag>.prev beside K3 whole at .next-<tag>
//      ⇒ swept as a duplicate (one line); the same with .next-<tag>'s receipt answering EIO ⇒ both kept, one line
//   ㉞ (s3) AN UNKNOWN IS SAID WHERE THE PERSON LOOKS: ㉚'s scenes through the keeper's engines view ⇒ the card says «the waiting
//      kernel <v> could not be read (EIO) — it is kept beside its place …», never «it serves the next browser start» (the
//      Plugins line's words too); a PERSON's download under that unknown is set in the free slot (the .prev untouched), the card
//      says it waits again, and the next sweep removes the .prev as a duplicate while it still cannot be read
// RED controls (patched copies, scripts/mutant-copy.mjs): the trust kept at the old sha · no listener (the base's shape: a new
// pin waits for a restart) · two runs in parallel · a kernel swapped under a running browser · round 2: M5 the tip's untrusted
// kernel step · M6 the tip's landNext (no plan check) · M7 no critical section · M8a the place not realpath'd · M8b EACCES read as
// «not in use» · M9 no sweep and a discard that keeps the folder · round 3: M10 the r2 install landing (no judge) · M11 the r2
// onPlace order (holds waited for before the in-use check) · M12 a read error taken for «gone» · M13 the r2 other-id (the consent
// words) · M14 the r2 tag line (blind to trust) · round 4: M15 the r3 order (the judge before the scan only) · M16 a measure blind
// to trust · M17 the cluster's install outside the lock · M18 the r3 keeper (a hand-copied kernel fact) · M19 'unread' discarded
// on the install road · M20 a discard with no trace · M21 the r3 boot line · M22 the judge without its sha comparison · M23 a start
// that goes on past its bound beside a landing in progress · M24 judgeNow without its 'moved' branch · round 5: M25 the r4
// staging order (the waiting kernel deleted before the judge) · M26 the refusal keyed on the whole landing · M27 a landing that
// moves a held place · M28 a start's ask that waits behind a plan write · M29 the measure without its step-aside · M30 the boot
// without its step-aside · M31 a download refused beside a landing recorded as a failure · round 6: M32 the r5 check before the
// first rename (holds only) · M33 a hold taken during the scan not counted · M34 the landing's put-back outside the torn window ·
// M35 the r5 sweep (no aside kernel put back) · round 7: M36 the r6 tip's unread aside taken as gone (the sweep, landNext,
// stageNext act on it) · M37 the r6 tip's not-whole count taken only after the put-back's stats · round 8: M38 the r7 tip's
// landing (the aside copy deleted after an unknown put-back) · M39 the r7 sweep (the .prev kept whatever healAside answered) ·
// M40 the r7 person's download (nothing set beside an unread copy) · M41 the r7 card (kernelFact with no unread state).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e === undefined ? '' : ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700))); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(25); } };
const { gitRepoFixture, URL_HTTPS } = await import('./fixtures/git-repo.mjs');
const { mutantCopies } = await import('./mutant-copy.mjs');
const BM = await import('../src/lib/browser-build-model.js');
// r3 (N6): the words model's export feature-detected — a tree without it (the base) reds by name at ① and runs every other leg
const fpwOf = (M) => (p, f, t, w) => (typeof M.fleetPluginWords === 'function' ? M.fleetPluginWords(p, f, t, w) : { fact: '(no fleetPluginWords on this tree)', line: '(no fleetPluginWords on this tree)' });
const fpw = fpwOf(BM);
const BE = require('../src/browser-engines.js');
const KM0 = require('../src/server/browser-keeper.js'); // r4 (N2): the keeper — its engines view is the surface the card reads
const EID = 'vibespace.custom-browser';
if (process.platform !== 'linux' || process.arch !== 'x64') { console.log(`  … SKIP — the fixture kernel is a linux-x64 artifact (this is ${process.platform}-${process.arch})`); console.log('\nALL PASS (0)'); process.exit(0); }
const tW = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
const short = (s) => String(s).slice(0, 12);
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-engdist-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* gone */ } });

// ── the kernels: ustar built here, zstd by node — three different archives (K1 → K2 → K3) ──
function tarRawOf(entries) {
  const parts = [];
  for (const e of entries) {
    const h = Buffer.alloc(512), body = e.body == null ? Buffer.alloc(0) : Buffer.from(e.body);
    h.write(e.name, 0, 100, 'utf8'); h.write(((e.mode || 0o644).toString(8)).padStart(7, '0') + '\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write((e.type === '5' ? 0 : body.length).toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.write(e.type || '0', 156);
    h.write('ustar\0', 257); h.write('00', 263); h.fill(32, 148, 156);
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(h);
    if (e.type !== '5') parts.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}
const LAYOUT = { archiveFormat: 'tar.zst', stripComponents: 1, binaryRelPath: 'chrome', requiredFiles: ['chrome', 'resources.pak'] };
const kernelOf = (v) => { const top = `fixture-kernel-${v}`; return zlib.zstdCompressSync(tarRawOf([{ name: top + '/', type: '5', mode: 0o755 }, { name: `${top}/chrome`, body: `#!/bin/sh\necho "Chromium ${v}"\n`, mode: 0o755 }, { name: `${top}/resources.pak`, body: crypto.randomBytes(400) }])); };
const VER = { k1: '150.0.1.1-fx', k2: '150.0.2.2-fx', k3: '150.0.3.3-fx' };
const ARCH = Object.fromEntries(Object.entries(VER).map(([k, v]) => [`/${k}.tar.zst`, kernelOf(v)]));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const KSHA = Object.fromEntries(Object.keys(VER).map((k) => [k, sha(ARCH[`/${k}.tar.zst`])]));
const hits = [];
const hold = { url: null, gate: null, served: 0 }; // r3: the archive `url` is held after its first 100 bytes until released
const host = http.createServer((q, r) => { hits.push(q.url); const b = ARCH[q.url]; if (!b) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-length': b.length }); if (hold.url === q.url && hold.gate) { const g = hold.gate; r.write(b.subarray(0, 100)); hold.served++; g.then(() => r.end(b.subarray(100))); return; } r.end(b); });
const holdArchive = (url) => { let release; hold.gate = new Promise((res) => { release = res; }); hold.url = url; hold.served = 0; return () => { hold.url = null; hold.gate = null; release(); }; };
await new Promise((res) => host.listen(0, '127.0.0.1', res));
const resolveUrl = (u) => u.replace(/^https:\/\/kernels\.test/, `http://127.0.0.1:${host.address().port}`);
// each commit of the plugin names ITS kernel (kernel.json) — a kernel bump is a new pinned sha of the plugin
const kernelJson = (k) => ({ schemaVersion: 1, id: EID, version: VER[k], protocol: 1, layout: LAYOUT, platforms: { 'linux-x64': { url: `https://kernels.test/${k}.tar.zst`, sha256: KSHA[k], bytes: ARCH[`/${k}.tar.zst`].length, version: VER[k], binaryRelPath: 'chrome' } } });

// ── the plugin's repository: the engine plugin at three commits, each with its kernel (+ a tag on the second) ──
const man = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/vibespace-plugin.json'), 'utf8'));
const srvJs = fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/server.js'), 'utf8');
const FX = gitRepoFixture(path.join(ROOT, 'repo'), [{ files: { 'vibespace-plugin.json': { ...man, version: '0.1.1' }, 'server.js': srvJs, 'kernel.json': kernelJson('k1') } }, { files: { 'vibespace-plugin.json': { ...man, version: '0.1.2' }, 'kernel.json': kernelJson('k2') }, tag: 'v0.1.2' }, { files: { 'vibespace-plugin.json': { ...man, version: '0.1.3' }, 'kernel.json': kernelJson('k3') } }]);
const [shaA, shaB, shaC] = FX.shas;
const fetches = () => FX.calls().filter((c) => c.argv.includes('fetch'));

/** ONE pod: a presets dir the reader WATCHES, the real loader + engine registry, the engine distribution following the reader. */
async function pod(tag, { EDM = require('../src/server/engine-distribution.js'), LM = require('../src/server/plugin-loader.js'), boot = null } = {}) {
  const R0 = path.join(ROOT, tag), dir = path.join(R0, 'presets');
  fs.mkdirSync(path.join(R0, 'data', 'plugins'), { recursive: true }); fs.mkdirSync(dir, { recursive: true });
  // the admin's edit: a new fleet.json renamed into place (a kubelet `..data` swap is one rename too)
  let n = 0;
  const writeFleet = (o) => { const t = path.join(dir, `.fleet-${n++}.tmp`); fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, path.join(dir, 'fleet.json')); };
  if (boot) writeFleet(boot); // the cluster Secret as the pod starts (the boot read)
  const journal = [];
  const quiet = { log: (...a) => journal.push(a.join(' ')), warn: (...a) => journal.push(a.join(' ')), error: (...a) => journal.push(a.join(' ')) };
  const CP = require('../src/server/cluster-presets.js');
  const express = require(path.join(REPO, 'node_modules/express'));
  const app = express();
  let ED = null;
  const presets = CP.create({ dir, log: quiet, debounceMs: 30, pollMs: 60 * 60 * 1000 });
  await presets.start();
  const real = LM.create({ rootDir: R0, app, hostVersion: '2.369.380', log: quiet, agentEnv: () => ({ PATH: process.env.PATH }), gitBin: FX.WRAP, integrations: () => null, fleetEngine: () => { const f = presets.fleet(); return f && f.browserEngine ? f.browserEngine : null; }, fleetStatus: () => (ED ? ED.fleetView() : null) });
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  // the loader as the distribution sees it, with a HOLD on the git step and a count of installs in flight
  const gate = { hold: null, inflight: 0, max: 0, refs: [] };
  const loader = { install: async (o) => { gate.refs.push(o.ref); gate.inflight++; gate.max = Math.max(gate.max, gate.inflight); try { if (gate.hold) await gate.hold.p; return await real.install(o); } finally { gate.inflight--; } }, installRecord: (id) => real.installRecord(id), list: () => real.list(), isTrusted: (id) => real.isTrusted(id) };
  const holdGit = () => { let release; const p = new Promise((r) => { release = r; }); gate.hold = { p, release }; return () => { gate.hold = null; release(); }; };
  const reg = require('../src/server/browser-engines.js').create({ loader: real, dataDir: path.join(R0, 'data') });
  const todos = [];
  const use = { now: false };
  ED = EDM.create({ dataDir: path.join(R0, 'data'), engines: reg, loader, fleetFacts: () => presets.fleet(), resolveUrl, freeOf: async (d) => ({ free: 1e12, path: d }), userTodos: { add: (k, item) => { todos.push(item); return 'u' + todos.length; } }, log: quiet, kernelInUse: () => use.now });
  ED.follow?.(presets);
  const row = () => real.list().find((p) => p.id === EID);
  const regFile = () => JSON.parse(fs.readFileSync(path.join(R0, 'data', 'plugin-registry.json'), 'utf8'));
  const plan = () => require('../src/engine-kernel.js').kernelPlan({ kernelPath: reg.kernelPath(EID) });
  const receiptSha = () => { try { return JSON.parse(fs.readFileSync(plan().receipt, 'utf8')).sha256; } catch { return null; } };
  const close = () => { try { presets.stop(); } catch { /* gone */ } try { real.shutdown(); } catch { /* gone */ } try { srv.close(); } catch { /* gone */ } };
  return { R0, dir, writeFleet, journal, presets, real, loader, gate, holdGit, reg, ED, todos, use, row, regFile, plan, receiptSha, close };
}
const engineAt = (ref, over = {}) => ({ plugin: EID, default: false, preinstall: false, source: { git: URL_HTTPS, ref }, kernel: { url: '', sha256: '' }, ...over });
// round 2: a SNAPSHOT of a pod's data/ + the loader's facts at that moment, and a LIGHT distribution over a fresh copy of it
function snapshot(Q, name) { const dir = path.join(ROOT, `snap-${name}`); fs.cpSync(path.join(Q.R0, 'data'), dir, { recursive: true }); return { dir, row: JSON.parse(JSON.stringify(Q.row())), inst: Q.real.installRecord(EID), fleet: JSON.parse(JSON.stringify(Q.presets.fleet())) }; }
let lightN = 0;
function light(S, { EDM = require('../src/server/engine-distribution.js'), row = {}, inst = {}, fleet = null, inUse = () => false, io = null, link = false, prep = null, opts = {}, install = null, record = null, dir = null } = {}) {
  const R = dir || path.join(ROOT, `light-${lightN++}`); // r6: `dir` — a fresh distribution over the data a stopped one left (the next boot)
  if (dir) { /* reused as it is */ } else if (link) { fs.cpSync(S.dir, R + '-real', { recursive: true }); fs.symlinkSync(R + '-real', R); } else fs.cpSync(S.dir, R, { recursive: true }); // link: data/ reached through a SYMLINK
  const r = { ...S.row, ...row }, ins = { ...S.inst, ...inst }, fl = fleet || S.fleet, journal = [], todos = [];
  const quiet = { log: (...a) => journal.push(a.join(' ')), warn: (...a) => journal.push(a.join(' ')), error: (...a) => journal.push(a.join(' ')) };
  const loader = { isTrusted: () => r.trusted === true, list: () => [r], installRecord: record || (() => ins), install: install || (async () => { throw Object.assign(new Error('a light scene installs nothing'), { code: 'light' }); }) };
  const engines = { kernelPath: (id) => path.join(R, 'plugins-state', id, 'kernel', 'linux-x64', 'chrome') };
  const plan = require('../src/engine-kernel.js').kernelPlan({ kernelPath: engines.kernelPath(EID) });
  if (prep) prep({ R, plan });
  const ED = EDM.create({ dataDir: R, engines, loader, fleetFacts: () => fl, resolveUrl, freeOf: async (d) => ({ free: 1e12, path: d }), userTodos: { add: (k, item) => { todos.push(item); return 'u' + todos.length; } }, log: quiet, kernelInUse: inUse, ...(io ? { io } : {}), ...opts });
  const receipt = (dir = plan.targetDir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'install-receipt.json'), 'utf8')).sha256; } catch { return null; } };
  return { R, ED, journal, todos, plan, receipt, rec: () => ED._record().engines[EID] || {}, row: r, fleet: fl };
}
/** A browser START as the keeper asks it: r3's ONE ask (`beforeStart`), else (an older tree) its landNext, then its hold. */
const startOf = async (ED) => { if (typeof ED.beforeStart === 'function') return ED.beforeStart(EID); const landed = await ED.landNext(EID); const release = typeof ED.holdPlace === 'function' ? await ED.holdPlace(EID) : () => {}; return { landed, release }; };
/** A scene with no waiting kernel (the record's `next` and its folder gone) — the kernel in its place only. */
const noNext = ({ R, plan }) => { const f = path.join(R, 'browser-engines.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); delete j.engines[EID].next; fs.writeFileSync(f, JSON.stringify(j)); fs.rmSync(plan.nextDir, { recursive: true, force: true }); };
const later = []; // work a leg leaves running (a slowed landing) — awaited before the suite ends
const LAND_WAIT_MS = 30000; // the product's bound for a start's whole ask (its default), handed to it — the legs' controls read it
const trustedAt = (ref) => ({ row: { trusted: true, trustedBy: 'fleet' }, inst: { sha: ref, ref }, fleet: { relayUrl: '', browserEngine: engineAt(ref, { preinstall: true }) } });
// a program run FROM the kernel's place (the in-use check reads its /proc/<pid>/exe) — a copy of `sleep` named `sleep` (a multicall
// coreutils dispatches on argv[0]'s basename)
const SLEEP = (() => { for (const d of String(process.env.PATH || '').split(':')) { try { const p = path.join(d, 'sleep'); fs.accessSync(p, fs.constants.X_OK); return fs.realpathSync(p); } catch { /* next */ } } return null; })();
const kids = [];
process.on('exit', () => { for (const k of kids) { try { k.kill('SIGKILL'); } catch { /* gone */ } } });
async function runFrom(dir) { const exe = path.join(dir, 'sleep'); fs.copyFileSync(SLEEP, exe); fs.chmodSync(exe, 0o755); const k = spawn(exe, ['30'], { stdio: 'ignore' }); kids.push(k); await until(() => { try { return fs.readlinkSync(`/proc/${k.pid}/exe`).endsWith('/sleep'); } catch { return false; } }, 3000); return k; }
const ended = (k) => new Promise((r) => { if (k.exitCode !== null || k.signalCode) return r(); k.once('exit', () => r()); k.kill('SIGKILL'); });
const settled = async (Q) => { await sleep(40); if (typeof Q.ED.fleetSettled === 'function') await Q.ED.fleetSettled(); else await until(async () => { await sleep(80); return !Q.ED.fleetView().at || Q.gate.inflight ? null : true; }, 8000); }; // the run a change started (and its queued re-run) has ended
/** ONE leg that may THROW on another tree (a RED control run against the base / the round-1 tip) — said by name, the next leg runs. */
async function leg(name, fn) { try { await fn(); } catch (e) { ok(false, `${name} — threw on this tree`, String((e && e.message) || e).slice(0, 200)); } }

console.log('— ① boot: the cluster pins shaA ⇒ installed, trusted by the cluster, the kernel preinstalled');
const P = await pod('main', { boot: { relayUrl: '', browserEngine: engineAt(shaA, { preinstall: true }) } });
const b1 = await P.ED.bootFleet();
ok(typeof BM.fleetPluginWords === 'function', 'the words model has the cluster\'s plugin words (fleetPluginWords: the row\'s fact, the panel\'s line)');
const fact1 = fpw(P.row(), P.ED.fleetView(), tW).fact;
ok(b1.ok && b1.outcome === 'installed' && P.row().trustedBy === 'fleet' && P.row().enabled && P.row().install.sha === shaA && P.receiptSha() === KSHA.k1 && hits.filter((h) => h === '/k1.tar.zst').length === 1,
  'boot: the plugin at the cluster\'s full sha is installed and trusted by the cluster; preinstall ⇒ its kernel downloaded once (the receipt\'s sha256 = the fleet\'s)', { b1, row: P.row() && P.row().install, receipt: P.receiptSha() });
ok(fact1 === `Installed and trusted by the cluster · ${short(shaA)}`, `the row reads «${fact1}»`);
ok(P.journal.some((l) => l.includes(`fleet plugin: cluster pins ${short(shaA)} — installing ${EID}`)) && P.journal.some((l) => /fleet plugin: vibespace\.custom-browser's kernel 150\.0\.1\.1-fx \(1 MB\) — downloading/.test(l)),
  'every step journaled by name: «fleet plugin: cluster pins <sha> — installing …», «… kernel <version> (<size>) — downloading»', P.journal.filter((l) => /fleet plugin/.test(l)));

console.log('— ② the admin pins shaB in fleet.json ⇒ the WATCH runs the job: ONE update, trusted at shaB, no restart');
const f0 = fetches().length, refs0 = P.gate.refs.length;
const release2 = P.holdGit();
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaB) });
const held = await until(() => P.gate.inflight === 1);
const oldUntrusted = !!held && P.row().install.sha === shaA && P.row().trusted === false && P.row().trustedBy === null;
ok(oldUntrusted, 'the moment the cluster\'s pin moved (the update held at its git step), the installed package at the OLD sha is no longer trusted by the cluster', { held, row: P.row() && { sha: P.row().install.sha, trusted: P.row().trusted } });
release2();
const up = await until(() => P.ED.fleetView().outcome === 'updated' && P.ED.fleetView().to === shaB && !P.gate.inflight);
await settled(P); // the outcome is set before the run's kernel step — the step's words are read once the run ended
const fact2 = fpw(P.row(), P.ED.fleetView(), tW, () => 'WHEN').fact;
ok(!!up && P.gate.refs.length === refs0 + 1 && fetches().length === f0 + 1 && fetches().at(-1).argv.at(-1) === shaB && P.row().version === '0.1.2' && P.row().trustedBy === 'fleet' && P.regFile().trust[EID].sha === shaB && P.row().install.prevSha === shaA,
  'the presets watch ran the job: ONE git fetch of the new sha, the package at shaB installed and trusted by the cluster at shaB (no bootFleet, no restart)', { view: P.ED.fleetView(), refs: P.gate.refs.slice(refs0) });
ok(fact2 === `Updated by the cluster · ${short(shaA)} → ${short(shaB)} · WHEN`, `the row reads «${fact2}»`);
ok(P.ED.fleetView().kernel && P.ED.fleetView().kernel?.state === 'due' && P.ED.fleetView().kernel?.version === VER.k2 && !hits.includes('/k2.tar.zst') && P.receiptSha() === KSHA.k1,
  'shaB\'s kernel.json names K2 and preinstall is off ⇒ the kernel is DUE (the next browser start downloads it) — nothing fetched, K1 stays in its place', P.ED.fleetView().kernel);
ok(P.journal.some((l) => /\[presets\] changed .*browser engine changed/.test(l)) && P.journal.some((l) => l.includes(`fleet plugin: cluster pins ${short(shaB)} — updating ${EID} from ${short(shaA)}`)) && P.journal.some((l) => l.includes(`trusted by the cluster at ${short(shaB)}`)),
  'journaled: «[presets] changed …: browser engine changed», «fleet plugin: cluster pins <new> — updating … from <old>», «… trusted by the cluster at <new>»');
await settled(P);
const f2 = fetches().length;
P.writeFleet({ relayUrl: 'https://relay.fleet.test/relay/', browserEngine: engineAt(shaB) });
await until(() => P.presets.fleet().relayUrl === 'https://relay.fleet.test/relay/');
await settled(P);
ok(fetches().length === f2 && P.gate.refs.length === refs0 + 1, 'a presets change that leaves the engine alone (the relay page) ⇒ no run, no git call (never a re-pull)');

console.log('— ③ changes during a run ⇒ ONE queued re-run, never two at once');
const refs3 = P.gate.refs.length;
const release3 = P.holdGit();
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaA) });
await until(() => P.gate.inflight === 1);
P.writeFleet({ relayUrl: '', browserEngine: engineAt('v0.1.2') }); await until(() => P.presets.fleet().browserEngine.source.ref === 'v0.1.2'); await sleep(60);
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaB) }); await until(() => P.presets.fleet().browserEngine.source.ref === shaB); await sleep(60);
const midRefs = P.gate.refs.slice(refs3);
release3();
await until(() => P.gate.refs.length >= refs3 + 2 && !P.gate.inflight); await settled(P);
ok(midRefs.length === 1 && P.gate.refs.slice(refs3).join(',') === [shaA, shaB].join(',') && P.gate.max === 1 && P.row().install.sha === shaB && P.row().trustedBy === 'fleet',
  'three pins while a run is held at git ⇒ that run finishes, then ONE re-run takes the LATEST pin (shaA, then shaB — the tag between them never ran); at most one install in flight', { refs: P.gate.refs.slice(refs3), max: P.gate.max });

console.log('— ④ a failed update ⇒ journaled + ONE notice, retried at the next change only');
FX.setMode({ fail: 'auth' });
const f4 = fetches().length, t4 = P.todos.length;
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaA) });
const failed = await until(() => P.ED.fleetView().outcome === 'failed');
await sleep(150); // a loop would ask git again within milliseconds
ok(!!failed && fetches().length === f4 + 1 && P.todos.length === t4 + 1 && /the cluster's plugin could not be installed/.test(P.todos.at(-1).text) && /cluster's next change of the plugin \(or the next restart\)/.test(P.todos.at(-1).detail) && P.row().install.sha === shaB
  && P.journal.some((l) => l.includes(`fleet plugin: ${EID} could not be updated [`) && l.includes("tried again at the cluster's next change or the next restart")),
  'git refused ⇒ the run says it by name (journal + ONE For-you notice), the installed package stays; NO retry by itself (one fetch in 0.15 s)', { view: P.ED.fleetView(), fetches: fetches().length - f4 });
const failLine = fpw(null, P.ED.fleetView(), tW).line;
ok(/^The cluster's plugin vibespace\.custom-browser could not be installed: .*\[plugin_git_/.test(failLine || ''), `the panel line reads «${String(failLine).slice(0, 120)}…»`);
FX.setMode(null);
P.writeFleet({ relayUrl: 'https://relay2.fleet.test/relay/', browserEngine: engineAt(shaA) });
const retried = await until(() => P.ED.fleetView().outcome === 'updated' && P.row().install.sha === shaA);
ok(!!retried && fetches().length === f4 + 2 && P.row().trustedBy === 'fleet', 'the next presets change (here the credential\'s neighbour, the relay page) ⇒ the failed run is tried again ⇒ updated, trusted at the pin');
await settled(P);

console.log('— ⑤ a tag (preinstall on) ⇒ installed, never trusted, said by name — and NOTHING of it read, fetched, run or landed (r2 N1)');
const k2hits = () => hits.filter((h) => h === '/k2.tar.zst').length;
const h5 = k2hits(), m5 = JSON.stringify(P.ED._record().engines[EID].measured), j5 = P.journal.length;
ok(P.receiptSha() === KSHA.k1 && P.row().trustedBy === 'fleet', 'before: K1 in its place, the package at shaA trusted by the cluster');
P.writeFleet({ relayUrl: '', browserEngine: engineAt('v0.1.2', { preinstall: true }) });
await until(() => P.ED.fleetView().outcome === 'unpinned' && P.ED.fleetView().kernel); await settled(P);
const tagLine = fpw(null, P.ED.fleetView(), tW).line, tagFact = fpw(P.row(), P.ED.fleetView(), tW).fact;
ok(P.ED.fleetView().outcome === 'unpinned' && P.ED.fleetView().code === 'fleet_ref_not_sha' && !P.row().trusted && P.row().consentRequired && P.row().install.ref === 'v0.1.2'
  && P.journal.some((l) => l.includes('cluster pins «v0.1.2» — not a commit sha, so never trusted by the cluster')),
  'a tag pinned by the cluster ⇒ the package is installed but never trusted (the owner is asked), journaled by name', P.ED.fleetView());
const j5s = P.journal.slice(j5);
ok(k2hits() === h5 && P.receiptSha() === KSHA.k1 && P.ED.kernelFact(EID).sha256 === KSHA.k1 && JSON.stringify(P.ED._record().engines[EID].measured) === m5 && !j5s.some((l) => /kernel says|— downloading|is installed \(sha256/.test(l))
  && j5s.some((l) => l.includes(`fleet plugin: ${EID} is waiting for your consent — its kernel is not fetched`)) && P.ED.fleetView().kernel?.state === 'untrusted',
  'preinstall on + the untrusted package\'s kernel.json naming K2 ⇒ fetched nothing (/k2 not asked), K1 stays in its place and in the record, no binary run (the measure untouched) — journaled «… is waiting for your consent — its kernel is not fetched»', { fetched: k2hits() - h5, receipt: P.receiptSha() === KSHA.k1 ? 'K1' : P.receiptSha(), lines: j5s.filter((l) => /kernel|consent/.test(l)) });
ok(tagLine === 'The cluster names vibespace.custom-browser at «v0.1.2» — not a full commit sha, so the cluster does not trust it; review it and enable it in ⚙ → Plugins → vibespace.custom-browser · waiting for your consent — its kernel is not fetched', `the panel line reads «${tagLine}» (r3: the door by name)`);
ok(tagFact === 'waiting for your consent — its kernel is not fetched; enable it in ⚙ → Plugins → vibespace.custom-browser', `the row reads «${tagFact}» (r3: the door by name)`);
const due5 = await P.ED.kernelDue?.(EID);
let refused5 = null; try { await P.ED.installKernel(EID, { by: 'user' }); } catch (e) { refused5 = e; }
ok(due5?.due === false && due5?.untrusted === true && refused5 && refused5.code === 'engine_untrusted' && /waiting for your consent/.test(refused5.message) && k2hits() === h5 && P.receiptSha() === KSHA.k1,
  'every other door too: the kernel step\'s due check reads no plan for it, a «Download kernel» is refused by name (engine_untrusted) — nothing fetched', { due5, refused: refused5 && refused5.code });
const snapA = snapshot(P, 'tag'); // M5's fixture: the tag installed, K1 in its place
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaB) });
await until(() => P.ED.fleetView().outcome === 'updated' && P.row().trustedBy === 'fleet'); await settled(P);

console.log('— ⑥ default / preinstall flips');
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaB, { default: true }) });
await until(() => P.presets.fleet().browserEngine.default === true); await settled(P);
const pol = BE.defaultEngineOf({ own: undefined, fleet: P.presets.fleet().browserEngine }), polOwn = BE.defaultEngineOf({ own: 'default', fleet: P.presets.fleet().browserEngine });
ok(pol.value === `plugin:${EID}` && pol.source === 'fleet' && polOwn.value === 'default' && polOwn.source === 'user', '`default: true` read live by the policy NEW browsers take (the user\'s own value still wins)', { pol, polOwn });
const h6 = hits.length;
await until(() => P.ED.fleetView().kernel && P.ED.fleetView().kernel?.state === 'due');
const dueLine = fpw(null, P.ED.fleetView(), tW).line;
ok(P.ED.fleetView().kernel?.state === 'due' && P.ED.fleetView().kernel?.version === VER.k2 && hits.length === h6 && P.receiptSha() === KSHA.k1 && P.journal.some((l) => l.includes(`kernel ${VER.k2} (1 MB) is named — downloaded at the next browser start`)),
  'a new kernel with preinstall false ⇒ DUE: nothing fetched now, the place keeps K1 (the next browser start downloads it)', P.ED.fleetView().kernel);
ok(dueLine === `The cluster's plugin ${EID}: new kernel ${VER.k2} — downloaded at the next browser start, which still runs the current one`, `the panel line reads «${dueLine}»`);
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaB, { default: true, preinstall: true }) });
await until(() => P.receiptSha() === KSHA.k2); await settled(P);
ok(P.receiptSha() === KSHA.k2 && hits.filter((h) => h === '/k2.tar.zst').length === 1 && P.ED.kernelFact(EID).state === 'installed' && !P.ED.kernelFact(EID).next && P.ED.fleetView().kernel?.state === 'ready',
  'preinstall flipped on ⇒ the same pin\'s new kernel downloaded now (no browser runs the old one ⇒ it takes the place)', P.ED.kernelFact(EID));

console.log('— ⑦ a browser runs the kernel ⇒ the new one WAITS beside it and serves the next start');
P.use.now = true;
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaC, { default: true, preinstall: true }) });
await until(() => P.ED.kernelFact(EID).next); await settled(P);
const kf7 = P.ED.kernelFact(EID), nextDir = P.plan().nextDir;
const stagedLine = fpw(null, P.ED.fleetView(), tW).line;
const card = BM.engineNote({ id: EID, label: 'Fixture Browser Engine', installed: true, executable: true, measuredVersion: VER.k2, kernel: kf7 }, tW);
ok(kf7.state === 'installed' && kf7.sha256 === KSHA.k2 && kf7.next && kf7.next.sha256 === KSHA.k3 && P.receiptSha() === KSHA.k2 && fs.existsSync(path.join(nextDir, 'chrome')) && P.ED.fleetView().kernel?.state === 'staged'
  && P.journal.some((l) => l.includes('a browser runs the current kernel, so the new one waits beside it and serves the next browser start')),
  'downloaded while a browser runs K2 ⇒ the place is untouched (its receipt still K2), K3 waits at .next-<tag> (the record\'s `next`)', { kf7, next: fs.existsSync(nextDir) });
ok(stagedLine === `The cluster's plugin ${EID}: new kernel ${VER.k3} downloaded — a browser running the current kernel keeps it; the next browser start uses the new one`, `the panel line reads «${stagedLine}»`);
ok(card === `Fixture Browser Engine · measured ${VER.k2} · new kernel ${VER.k3} downloaded — it serves the next browser start`, `the engine card reads «${card}»`);
ok((await P.ED.landNext?.(EID)) === false && P.receiptSha() === KSHA.k2, 'a start while a browser still runs K2 ⇒ the waiting kernel does not land');
const snapC = snapshot(P, 'staged'); // ⑨–⑪'s fixture: K2 in its place, K3 waiting (planned: shaC, trusted by the cluster)
P.use.now = false;
const landed = await P.ED.landNext?.(EID);
ok(landed === true && P.receiptSha() === KSHA.k3 && !fs.existsSync(nextDir) && !P.ED.kernelFact(EID).next && P.ED.kernelFact(EID).sha256 === KSHA.k3 && P.ED.fleetView().kernel?.state === 'ready' && hits.filter((h) => h === '/k3.tar.zst').length === 1,
  'the next start with no browser on K2 ⇒ K3 takes the place (no second download), the record follows', P.ED.kernelFact(EID));

console.log('— ⑧ (r2 N2) a kernel waits, then the cluster pins BACK ⇒ it never lands; the run discards it');
P.use.now = true;
const h8 = k2hits();
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaB, { default: true, preinstall: true }) });
await until(() => P.ED.kernelFact(EID).next && P.ED.kernelFact(EID).next?.sha256 === KSHA.k2); await settled(P);
ok(P.receiptSha() === KSHA.k3 && P.ED.kernelFact(EID).next?.sha256 === KSHA.k2 && k2hits() === h8 + 1, 'pinned to shaB while a browser runs K3 ⇒ K2 downloaded and WAITING beside it');
const snapB = snapshot(P, 'pinned-back'); // M6's fixture: K3 in its place, K2 waiting
const rel8 = P.holdGit();
P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaC, { default: true, preinstall: true }) });
await until(() => P.gate.inflight === 1);
P.use.now = false;
const early8 = await P.ED.landNext?.(EID); // a browser start while the cluster's pin back is being installed
ok(early8 === false && P.receiptSha() === KSHA.k3 && P.ED.kernelFact(EID).next && P.ED.kernelFact(EID).next?.sha256 === KSHA.k2,
  'a start while the cluster\'s pin moved back (the package at shaB no longer trusted, shaC not yet installed) ⇒ the withdrawn K2 does NOT land');
rel8();
await until(() => P.ED.fleetView().to === shaC && !P.ED.kernelFact(EID).next); await settled(P);
const later8 = await P.ED.landNext?.(EID);
ok(!P.ED.kernelFact(EID).next && !fs.existsSync(P.plan().nextDir) && later8 === false && P.receiptSha() === KSHA.k3 && P.ED.kernelFact(EID).sha256 === KSHA.k3 && k2hits() === h8 + 1 && hits.filter((h) => h === '/k3.tar.zst').length === 1
  && P.journal.some((l) => l.includes(`waiting kernel ${VER.k2} is no longer the cluster's — discarded`)) && !fpw(null, P.ED.fleetView(), tW).line,
  'the run at shaC ⇒ the waiting K2 is discarded (the record cleared, .next-<tag> removed, «… is no longer the cluster\'s — discarded»); the next start lands nothing, K3 stays, nothing downloaded again, the panel says nothing', { kf: P.ED.kernelFact(EID), lines: P.journal.filter((l) => /waiting kernel/.test(l)) });

console.log('— ⑫ (r3 N1) the install road is judged AT ITS LANDING — the real fleet road: a pin, then a rollback while its kernel downloads');
const k3hits = () => hits.filter((h) => h === '/k3.tar.zst').length;
await leg('⑫ the real fleet road', async () => {
  P.use.now = false;
  const h2 = k2hits(), h3 = k3hits(), j0 = P.journal.length, m0 = JSON.stringify(P.ED._record().engines[EID].measured);
  const rel = holdArchive('/k2.tar.zst');
  P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaB, { default: true, preinstall: true }) }); // the admin pins shaB (K2), preinstall on
  const mid = await until(() => hold.served === 1 && P.ED.kernelFact(EID).state === 'downloading' && P.row().install.sha === shaB && P.row().trustedBy === 'fleet', 8000);
  P.writeFleet({ relayUrl: '', browserEngine: engineAt(shaC, { default: true, preinstall: true }) }); // …and rolls back while K2 downloads
  const lapsed = await until(() => P.presets.fleet().browserEngine.source.ref === shaC && P.row().trusted === false);
  const dueMid = await P.ED.kernelDue?.(EID);
  rel();
  await until(() => P.ED.fleetView().to === shaC && P.row().trustedBy === 'fleet' && P.ED.kernelFact(EID).state !== 'downloading', 8000); await settled(P);
  const js = P.journal.slice(j0), pl = P.plan();
  ok(!!mid && !!lapsed && dueMid?.untrusted === true && P.receiptSha() === KSHA.k3 && P.ED.kernelFact(EID).sha256 === KSHA.k3 && JSON.stringify(P.ED._record().engines[EID].measured) === m0 && k2hits() === h2 + 1 && k3hits() === h3
    && !P.ED.kernelFact(EID).next && !fs.existsSync(pl.nextDir) && !fs.existsSync(pl.unpackDir) && !fs.existsSync(pl.part)
    && js.filter((l) => l.includes(`kernel ${VER.k2} was downloaded for a package no longer trusted — discarded, never landed`)).length === 1 && !js.some((l) => l.includes(`kernel says "Chromium ${VER.k2}"`) || l.includes(`kernel ${VER.k2} is installed`)),
    'the cluster rolls back while K2 downloads (the package at shaB untrusted the moment the pin moved) ⇒ the finished K2 is DISCARDED at its landing — never landed, never staged, never run (the measure untouched), one line; the re-run at shaC finds K3 in its place: nothing downloaded again', { mid: !!mid, lapsed: !!lapsed, dueMid, place: P.receiptSha() === KSHA.k3 ? 'K3' : P.receiptSha() === KSHA.k2 ? 'K2' : P.receiptSha(), k3again: k3hits() - h3, lines: js.filter((l) => /150\.0\.2\.2|discarded/.test(l)) });
});
P.close();

console.log('— ⑫ (r3 N1) the install road is judged at its landing — light scenes (the acceptance\'s probe: K3 in its place, pin B names K2, trusted)');
/** installKernel(by fleet) of K2 over snapB (K3 in its place, nothing waiting), its archive HELD after 100 bytes; `mid(L)` happens
 *  while it is held — then it is released. → what landed, what was said. */
async function inFlight(EDM, mid, { inUse = () => false, by = 'fleet' } = {}) {
  const L = light(snapB, { EDM, prep: noNext, inUse });
  await L.ED.ready; // the record is read (K3 measured in ⑦) before it is compared
  const m0 = JSON.stringify(L.rec().measured);
  const rel = holdArchive('/k2.tar.zst');
  const job = L.ED.installKernel(EID, { by, wait: true });
  const held = await until(() => hold.served === 1 && L.ED.kernelFact(EID).state === 'downloading', 4000);
  await mid(L);
  const dueMid = await L.ED.kernelDue?.(EID);
  rel();
  const r = await job.catch((e) => ({ threw: e && e.code }));
  const out = { held: !!held, dueMid, r: { discarded: r && r.discarded, staged: !!(r && r.staged), measuredVersion: r && r.measuredVersion, threw: r && r.threw }, place: L.receipt() === KSHA.k3 ? 'K3' : L.receipt() === KSHA.k2 ? 'K2' : L.receipt(), kernel: (L.rec().kernel || {}).version || null,
    measured: JSON.stringify(L.rec().measured) === m0 ? 'untouched' : (L.rec().measured || {}).version, next: !!L.rec().next, nextDir: fs.existsSync(L.plan.nextDir), partials: [L.plan.unpackDir, L.plan.part].filter((f) => fs.existsSync(f)).length,
    lines: L.journal.filter((l) => /discarded, never landed|kernel says|is installed \(sha256|waits beside/.test(l)),
    trace: { rec: L.rec().discarded ? { why: L.rec().discarded.why, version: L.rec().discarded.version, by: L.rec().discarded.by } : null, fact: L.ED.kernelFact(EID).discarded || null, todos: L.todos.map((t) => t.text) } }; // r4 (N4)
  Object.defineProperty(out, 'L', { value: L }); // r4: the scene, for a leg reading it through the keeper
  return out;
}
const untrust = (L) => { L.row.trusted = false; L.row.trustedBy = null; }; // the cluster pinned back: its trust in the package at shaB lapsed (D2, live)
const replan = (L) => fs.writeFileSync(path.join(L.R, 'plugins', EID, 'kernel.json'), JSON.stringify(kernelJson('k3'))); // the plan moved to K3, trust kept
await leg('⑫ trust withdrawn mid-download', async () => {
  const x = await inFlight(undefined, untrust);
  ok(x.held && x.dueMid?.untrusted === true && x.r.discarded === 'untrusted' && x.place === 'K3' && x.kernel === VER.k3 && x.measured === 'untouched' && !x.next && !x.nextDir && !x.partials
    && x.lines.length === 1 && x.lines[0].includes(`kernel ${VER.k2} was downloaded for a package no longer trusted — discarded, never landed`),
    'the package\'s trust withdrawn while K2 downloads ⇒ K2 is discarded at its landing: K3 stays in its place and in the record, nothing measured (no binary run), nothing staged, the partials gone — «… downloaded for a package no longer trusted — discarded, never landed»', x);
});
await leg('⑫ the plan moved mid-download', async () => {
  const x = await inFlight(undefined, replan);
  ok(x.held && x.r.discarded === 'stale' && x.place === 'K3' && x.kernel === VER.k3 && x.measured === 'untouched' && !x.next && !x.nextDir && !x.partials
    && x.lines.length === 1 && x.lines[0].includes(`kernel ${VER.k2} was downloaded for a plan the cluster has moved away from (the kernel planned now is ${VER.k3}) — discarded, never landed`),
    'the plan moved while K2 downloads (the package still trusted) ⇒ K2 is discarded at its landing — never landed, never measured: «… downloaded for a plan the cluster has moved away from (the kernel planned now is …) — discarded, never landed»', x);
  const y = await inFlight(undefined, replan, { inUse: () => true });
  ok(y.held && y.r.discarded === 'stale' && !y.r.staged && y.place === 'K3' && !y.next && !y.nextDir && !y.partials && y.lines.length === 1,
    'the same with a browser running K3 ⇒ the stale K2 is never STAGED either (no .next-<tag>, no record of it) — the one judge runs before the landing AND the staging', y);
});

console.log('— ⑫ (r4 N1) the judge is asked LAST — inside the section, after the in-use scan (the acceptance\'s probe); the measure asks trust; the plan write holds the lock');
/** THE ACCEPTANCE'S PROBE: `mid(L)` happens INSIDE the landing's section — `at` 'scan': during the in-use scan (the install road's
 *  only call; the waiting road's 2nd — the 1st is landNext's «possible?»), 'rename': at the first rename (the previous kernel moved
 *  aside). The install road: K2 downloaded (by the fleet) over snapB's K3; the waiting road: snapC (K2 in its place, K3 waiting), a
 *  start's ONE ask. → what landed, what ran, what was said. */
async function inSection(EDM, road, mid, { at = 'scan' } = {}) {
  const S = {}; let calls = 0, fired = false;
  const fire = async () => { if (!fired) { fired = true; await mid(S.L); } };
  const inUse = async () => { calls++; if (at === 'scan' && (road === 'install' || calls === 2)) await fire(); return false; };
  const io = at === 'rename' ? { rename: async (a, b) => { if (a.endsWith('/linux-x64') && b.endsWith('/.removing-linux-x64')) await fire(); return fs.promises.rename(a, b); } } : null;
  const L = light(road === 'install' ? snapB : snapC, { EDM, inUse, io, prep: road === 'install' ? noNext : null }); S.L = L;
  await L.ED.ready;
  const m0 = JSON.stringify(L.rec().measured);
  let r;
  if (road === 'install') r = await L.ED.installKernel(EID, { by: 'fleet', wait: true }).catch((e) => ({ threw: e && e.code }));
  else { const st = await startOf(L.ED); st.release(); r = { landed: st.landed }; }
  const at0 = L.receipt();
  return { fired, r: { landed: r && r.landed, discarded: r && r.discarded, measuredVersion: r && r.measuredVersion, threw: r && r.threw }, place: at0 === KSHA.k3 ? 'K3' : at0 === KSHA.k2 ? 'K2' : at0 === KSHA.k1 ? 'K1' : at0, kernel: (L.rec().kernel || {}).version || null,
    measured: JSON.stringify(L.rec().measured) === m0 ? 'untouched' : (L.rec().measured || {}).version, next: L.rec().next ? L.rec().next.version : null, nextDir: fs.existsSync(L.plan.nextDir), aside: fs.existsSync(L.plan.removingDir),
    partials: [L.plan.unpackDir, L.plan.part].filter((f) => fs.existsSync(f)).length, lines: L.journal.filter((l) => /discarded|never landed|did not take its place|kernel says|took its place|is installed \(sha256/.test(l)) };
}
const replanTo = (k) => (L) => fs.writeFileSync(path.join(L.R, 'plugins', EID, 'kernel.json'), JSON.stringify(kernelJson(k))); // the plan moved (trust kept)
const neverRan = (x) => x.measured === 'untouched' && !x.lines.some((l) => /kernel says|took its place|is installed \(sha256/.test(l));
await leg('⑫ r4 install road: inside the scan', async () => {
  const a = await inSection(undefined, 'install', untrust), b = await inSection(undefined, 'install', replanTo('k3'));
  ok(a.fired && a.r.discarded === 'untrusted' && a.place === 'K3' && a.kernel === VER.k3 && neverRan(a) && !a.next && !a.partials && !a.aside && a.lines.length === 1 && a.lines[0].includes(`kernel ${VER.k2} was downloaded for a package no longer trusted — discarded, never landed`),
    'THE ACCEPTANCE\'S PROBE, the install road: the trust withdrawn INSIDE the in-use scan (after the judge before it) ⇒ K2 is NOT landed and NOT run (the judge asked again last, inside the section) — K3 stays, discarded, one line', a);
  ok(b.fired && b.r.discarded === 'stale' && b.place === 'K3' && neverRan(b) && !b.next && !b.partials && b.lines.length === 1 && b.lines[0].includes(`(the kernel planned now is ${VER.k3}) — discarded, never landed`),
    'the plan moved INSIDE the scan (kernel.json now names K3) ⇒ the same: not landed, not run, discarded, one line', b);
});
await leg('⑫ r4 waiting road: inside the scan', async () => {
  const a = await inSection(undefined, 'wait', untrust), b = await inSection(undefined, 'wait', replanTo('k1'));
  ok(a.fired && a.r.landed === false && a.place === 'K2' && a.kernel === VER.k2 && neverRan(a) && a.next === VER.k3 && a.nextDir && a.lines.length === 1 && a.lines[0].includes(`waiting kernel ${VER.k3} did not take its place — its package is no longer trusted; nothing ran, it waits`),
    'THE ACCEPTANCE\'S PROBE, the waiting road (a start\'s beforeStart, the trust withdrawn during the 2nd in-use call — onPlace\'s): K3 is NOT landed and NOT run, K2 stays; the verified K3 keeps waiting (r2: a lapsed trust deletes nothing — a trusted run judges it), one line', a);
  ok(b.fired && b.r.landed === false && b.place === 'K2' && neverRan(b) && !b.next && !b.nextDir && b.lines.length === 1 && b.lines[0].includes(`waiting kernel ${VER.k3} is no longer the cluster's — discarded (the kernel planned now is ${VER.k1}; never landed)`),
    'the plan moved INSIDE the scan (kernel.json now names K1) ⇒ not landed, not run, the waiting K3 discarded with its folder, one line', b);
});
await leg('⑫ r4 at the first rename', async () => {
  const a = await inSection(undefined, 'install', untrust, { at: 'rename' }), b = await inSection(undefined, 'install', replanTo('k3'), { at: 'rename' });
  ok(a.fired && a.r.discarded === 'untrusted' && a.place === 'K3' && a.kernel === VER.k3 && !a.aside && neverRan(a) && !a.partials && a.lines.length === 1,
    'the trust withdrawn AT THE FIRST RENAME (K3 already moved aside) ⇒ the judge asked LAST — between the renames, its sync half in the rename\'s own turn — refuses: K3 goes back in its place, K2 never lands, nothing runs, one line', a);
  ok(b.fired && b.r.discarded === 'stale' && b.place === 'K3' && !b.aside && neverRan(b) && b.lines.length === 1, 'the plan moved at the first rename ⇒ the same (K3 back, K2 discarded, one line)', b);
});
async function measureUntrusted(EDM) {
  const L = light(snapC, { EDM });
  await L.ED.ready;
  const m0 = JSON.stringify(L.rec().measured);
  untrust(L);
  const r = await L.ED.measure(EID, { force: true });
  return { r: { ok: r && r.ok, code: r && r.code }, measured: JSON.stringify(L.rec().measured) === m0 ? 'untouched' : (L.rec().measured || {}).version, ran: L.journal.filter((l) => /kernel says/.test(l)).length, said: L.journal.filter((l) => l.includes('kernel is not run for its version — its package is not trusted now')).length };
}
await leg('⑫ r4 the measure asks trust', async () => {
  const x = await measureUntrusted(undefined);
  ok(x.r.ok === false && x.r.code === 'engine_untrusted' && x.measured === 'untouched' && x.ran === 0 && x.said === 1,
    'the MEASURE (`--version` — a re-exec of the kernel) refuses a package not trusted NOW, even forced: engine_untrusted, nothing run, the record untouched, one line', x);
});
/** r4 (N1): the cluster's install of the package (its kernel.json, its trust) is a PLAN WRITE — it holds the landing's ONE lock: a
 *  start's landing asked while it runs is «not now» at once (no wait, no line) and nothing lands under it. */
async function lockScene(EDM) {
  let used = true, enter = null, release = null;
  const entered = new Promise((r) => { enter = r; }), gate = new Promise((r) => { release = r; });
  const L = light(snapC, { EDM, inUse: () => used, fleet: { relayUrl: '', browserEngine: engineAt(shaB) }, install: async () => { enter(); await gate; return { plugin: { id: EID }, sha: shaB }; } });
  const run = L.ED.syncFleet('change');
  await entered; used = false; // the browser on K2 ended while the cluster's install of the package runs
  const t0 = Date.now(); const l = await L.ED.landNext(EID); const ms = Date.now() - t0;
  const during = L.receipt() === KSHA.k2 ? 'K2' : L.receipt() === KSHA.k3 ? 'K3' : L.receipt();
  release(); await run;
  return { l, ms, during, lines: L.journal.filter((l2) => /took its place|waits for the new kernel/.test(l2)) };
}
await leg('⑫ r4 the plan write holds the lock', async () => {
  const x = await lockScene(undefined);
  ok(x.l === false && x.during === 'K2' && x.ms < LAND_WAIT_MS / 60 && !x.lines.length,
    `the cluster's install of the package holds the landing's ONE lock: a landing asked meanwhile is «not now» at once (${x.ms} ms, no line) — nothing lands while the plan is written`, x);
});

console.log('— ⑨ (r2 N3) a landing is ONE critical section with every start, measure and put-back');
await leg('⑨ a start meeting a landing', async () => { // a start meeting a landing in flight (the place EMPTY between its two renames — the second one slowed) waits, then runs what landed
  const slow = { ms: 0, at: 0 };
  const io = { rename: async (a, b) => { if (slow.ms && a.endsWith('/.next-linux-x64')) { slow.at = Date.now(); await sleep(slow.ms); } return fs.promises.rename(a, b); } };
  const L = light(snapC, { io, opts: { landWaitMs: 3000 } });
  slow.ms = 120;
  const A = L.ED.landNext(EID);
  await until(() => !fs.existsSync(L.plan.targetDir), 1000); // A moved K2 aside: the place is empty until its second rename
  const t0 = Date.now();
  const B = (async () => { const st = await startOf(L.ED); const r = L.receipt(); st.release(); return { l: st.landed, r, ms: Date.now() - t0, since: Date.now() - slow.at }; })();
  const C = L.ED.measure(EID);
  const [a, b, c] = await Promise.all([A, B, C]);
  ok(a === true && b.l === false && b.r === KSHA.k3 && b.since >= slow.ms / 2 && L.receipt() === KSHA.k3 && c.ok && c.version === VER.k3 && !L.rec().aside && !L.todos.length && !L.journal.some((l) => /set aside|could not be put back/.test(l)),
    'a second start during the landing WAITS for it (no false at once) and its place holds K3; a measure in the same window puts nothing back (no false «set aside» notice) and measures K3', { b, c: c && c.version, aside: L.rec().aside, todos: L.todos.length });
});
await leg('⑨ a start holding the place', async () => { // a start between its in-use check and its spawn HOLDS the place: no landing meanwhile; it spawned ⇒ the new kernel keeps waiting
  let used = false;
  const L = light(snapC, { inUse: () => used });
  const rel = await L.ED.holdPlace(EID, { leaseMs: 0 });
  const land = L.ED.landNext(EID);
  await sleep(80);
  const during = L.receipt();
  used = true; rel(); // the start spawned — a browser runs K2 now
  const l = await land;
  ok(during === KSHA.k2 && l === false && L.receipt() === KSHA.k2 && L.rec().next && L.rec().next.sha256 === KSHA.k3, 'a landing never starts while a start holds the place; once it spawned on K2 the landing sees it and K3 keeps waiting', { during, l });
  // r3 (N2): a landing never WAITS for a start — a held place (a browser starting ⇒ its kernel in use) ⇒ «not now» at once, no line
  const L2 = light(snapC, { opts: { holdWaitMs: LAND_WAIT_MS / 30 } }); // holdWaitMs: the r2 tree's own bound (it waited for holds), short so its RED run ends
  await L2.ED.holdPlace(EID, { leaseMs: 0 }); // a start that never reports its spawn
  const l2 = await Promise.race([L2.ED.landNext(EID), sleep(LAND_WAIT_MS / 60).then(() => 'still waiting for the start')]);
  ok(l2 === false && L2.receipt() === KSHA.k2 && L2.rec().next && !L2.journal.length,
    'a landing never WAITS for a start: a place a start holds ⇒ the waiting kernel does not land, answered at once, no journal line (it lands at a start with no browser on the old kernel)', { l2, lines: L2.journal });
});

console.log('— ⑩ (r2 N4) the real /proc check: real paths, fail closed');
const inUseOf = async (L) => (typeof L.ED._inUse === 'function' ? L.ED._inUse(EID) : 'no in-use check on this tree');
async function procScene(EDM, { link }) {
  const deny = { exe: null, real: false };
  const io = { readlink: (f) => (deny.exe && f === `/proc/${deny.exe}/exe` ? Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })) : fs.promises.readlink(f)), realpath: (f) => (deny.real ? Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })) : fs.promises.realpath(f)) };
  const L = light(snapC, { EDM, link, inUse: null, io });
  const k = await runFrom(L.plan.targetDir); // through the symlinked path when `link`
  return { L, k, deny };
}
if (!SLEEP) ok(false, 'a sleep program to run from the kernel\'s place (none on PATH)');
else await leg('⑩ the real /proc check', async () => {
  const { L, k, deny } = await procScene(undefined, { link: true });
  const seen = fs.readlinkSync(`/proc/${k.pid}/exe`);
  const use1 = await inUseOf(L), land1 = await L.ED.landNext(EID);
  ok(!seen.startsWith(L.plan.targetDir + '/') && use1 === true && land1 === false && L.receipt() === KSHA.k2, `data/ reached through a SYMLINK: /proc/<pid>/exe is the real path (${seen.slice(ROOT.length)}) — the place is realpath'd too ⇒ in use, nothing landed`);
  deny.exe = k.pid;
  const use2 = await inUseOf(L);
  deny.exe = null; deny.real = true;
  const use3 = await inUseOf(L);
  deny.real = false;
  await ended(k);
  deny.exe = process.pid; // this user's OTHER program, its exe unreadable: its argv[0] / name rule it out (systemd --user, sshd-session…)
  const use4 = await inUseOf(L), land4 = await L.ED.landNext(EID);
  deny.exe = null;
  ok(use2 === true && use3 === true && use4 === false && land4 === true && L.receipt() === KSHA.k3,
    'FAILS CLOSED: this user\'s program in the place whose exe answers EACCES ⇒ in use (its argv[0] is in the place); a place that cannot be resolved ⇒ in use; this user\'s other program answering EACCES (argv[0] / name not the kernel\'s) does not hold it ⇒ with the program ended, K3 lands', { use2, use3, use4, land4 });
});

console.log('— ⑪ (r2 N5) no orphaned kernel folders');
const corrupt = ({ plan }) => { const f = path.join(plan.nextDir, 'install-receipt.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); fs.writeFileSync(f, JSON.stringify({ ...j, sha256: KSHA.k1 })); };
const lostNext = ({ R, plan }) => { const f = path.join(R, 'browser-engines.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); delete j.engines[EID].next; fs.writeFileSync(f, JSON.stringify(j)); fs.mkdirSync(path.join(plan.root, '.unpack-linux-x64'), { recursive: true }); fs.writeFileSync(path.join(plan.root, '.unpack-linux-x64', 'chrome'), 'x'); fs.writeFileSync(plan.part, 'x'); };
async function orphanScenes(EDM) {
  const A = light(snapC, { EDM, prep: corrupt });
  const la = await A.ED.landNext(EID);
  const B = light(snapC, { EDM, prep: lostNext });
  await B.ED.bootRestore();
  return { la, aNext: !!A.rec().next, aDir: fs.existsSync(A.plan.nextDir), aLine: A.journal.some((l) => l.includes('waiting kernel is not beside its place any more — discarded')),
    bLeft: ['.next-linux-x64', '.unpack-linux-x64', 'linux-x64.part'].filter((n) => fs.existsSync(path.join(B.plan.root, n))), bLines: B.journal.filter((l) => l.includes('leftover kernel files the record does not name were removed')), bPlace: B.receipt() };
}
const o11 = await orphanScenes().catch((e) => ({ threw: String(e && e.message) }));
ok(o11.la === false && !o11.aNext && !o11.aDir && o11.aLine, 'a waiting kernel whose folder\'s receipt is not the recorded one ⇒ discarded: the record cleared AND .next-<tag> removed (whoever clears rec.next removes the dir)', o11);
ok(o11.bLeft && !o11.bLeft.length && o11.bLines.length === 1 && o11.bLines[0].includes('.next-linux-x64') && o11.bLines[0].includes('.unpack-linux-x64') && o11.bLines[0].includes('linux-x64.part') && o11.bPlace === KSHA.k2,
  'a .next-<tag> the record does not name (a stop between stageNext\'s rename and its save) + a cut install\'s .unpack-<tag> and .part ⇒ swept at boot, ONE journal line; the kernel in its place untouched', o11);

console.log('— ⑬ (r3 N2) a start never waits for a landing that cannot happen');
/** Starts A, B, C beside a waiting kernel while a browser runs the old one: A's hold stands throughout (its spawn not reported). */
async function startsBeside(EDM) {
  const L = light(snapC, { EDM, inUse: () => true, opts: { landWaitMs: LAND_WAIT_MS, holdWaitMs: LAND_WAIT_MS / 30 } }); // holdWaitMs: the r2 tree's own bound, short so its RED run ends
  const A = await startOf(L.ED);
  const t0 = Date.now();
  const [B, C] = await Promise.all([startOf(L.ED).then((x) => ({ ...x, ms: Date.now() - t0 })), startOf(L.ED).then((x) => ({ ...x, ms: Date.now() - t0 }))]);
  A.release(); B.release(); C.release();
  return { b: { landed: B.landed, ms: B.ms }, c: { landed: C.landed, ms: C.ms }, lines: L.journal.slice(), place: L.receipt() === KSHA.k2 ? 'K2' : L.receipt(), next: (L.rec().next || {}).sha256 === KSHA.k3 };
}
await leg('⑬ starts beside a running browser', async () => {
  const x = await startsBeside(undefined);
  ok(x.b.landed === false && x.c.landed === false && x.b.ms < LAND_WAIT_MS / 60 && x.c.ms < LAND_WAIT_MS / 60 && !x.lines.length && x.place === 'K2' && x.next,
    `starts B and C beside a waiting kernel while a browser runs the old one and start A holds the place ⇒ each answered at once (${x.b.ms} / ${x.c.ms} ms — the bound is ${LAND_WAIT_MS / 1000} s), no journal line, nothing lands (K2 in its place, K3 waiting)`, x);
});
const slowNext = () => { const slow = { ms: 0, at: 0 }; return { slow, io: { rename: async (a, b) => { if (slow.ms && a.endsWith('/.next-linux-x64')) { slow.at = Date.now(); await sleep(slow.ms); } return fs.promises.rename(a, b); } } }; };
/** r4 (N2): THE KEEPER over a light scene — its engines view (what GET /api/browser/engines, Change build… and New profile… read):
 *  the registry's probe fact (a stub — the plugin's word) + withKernelFact over the scene's REAL engine distribution. */
function keeperOver(L, KM = KM0) {
  const d = `${L.R}-keeper`; fs.mkdirSync(d, { recursive: true });
  const engines = { rows: () => [{ id: EID, label: 'Fixture Browser Engine', family: 'chromium', version: '0.1.3' }], probe: async (id) => ({ ok: true, fact: { id, label: 'Fixture Browser Engine', installed: true, executable: true, version: null, protocol: 1, features: [] } }) };
  return KM.create({ dataDir: d, homeDir: d, env: () => ({ PATH: process.env.PATH, HOME: d }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() {}, warn() {}, error() {} }, hostKnown: () => false, userTodos: { add: () => 'u' }, engines, engineDistribution: L.ED, fleetFacts: () => null });
}
const viewRow = async (K) => ((await K.engineRowsView()) || []).find((e) => e.id === EID) || null;
async function landingScene(KM = KM0) {
  const { slow, io } = slowNext();
  const L = light(snapC, { io, opts: { landWaitMs: LAND_WAIT_MS } });
  const K = keeperOver(L, KM);
  slow.ms = 150;
  const A = L.ED.landNext(EID); // the fleet's run lands the waiting kernel (no bound of its own)
  await until(() => !fs.existsSync(L.plan.targetDir), 1000); // A moved K2 aside: the place is empty until its second rename
  const t0 = Date.now();
  const Bp = startOf(L.ED).then((x) => ({ ...x, ms: Date.now() - t0, since: Date.now() - slow.at }));
  const waiting = await until(() => L.ED.kernelFact(EID).landing, 1000); // the start waits now (the distribution knows it)…
  const row = await viewRow(K); // …and the SURFACE: the keeper's engines view, read in that window
  const card = row && typeof BM.engineNote === 'function' ? BM.engineNote(row, tW) : null;
  const [a, B] = await Promise.all([A, Bp]);
  B.release();
  const said = L.journal.filter((l) => l.includes(': a browser start waits for the new kernel to land (≤ 30 s)'));
  return { a, B: { landed: B.landed, ms: B.ms, since: B.since }, slowMs: slow.ms, waiting: !!waiting, during: row && row.kernel ? row.kernel.landing || null : null, card, said: said.length, place: L.receipt() === KSHA.k3 ? 'K3' : L.receipt(), after: !!L.ED.kernelFact(EID).landing };
}
await leg('⑬ a start during a landing', async () => {
  const x = await landingScene();
  ok(x.a === true && x.B.landed === false && x.B.since >= x.slowMs / 2 && x.B.ms < LAND_WAIT_MS && x.place === 'K3' && x.waiting && x.during && x.during.waitS === 30 && x.said === 1 && !x.after
    && x.card === `Fixture Browser Engine · measured ${VER.k2} · waiting for the new kernel to land (≤ 30 s)`,
    `a start during a landing in progress WAITS for it (${x.B.ms} ms) and runs what landed (K3), SAID: «… a browser start waits for the new kernel to land (≤ 30 s)» once — r4 (N2): the engine card read THROUGH THE KEEPER's engines view (GET /api/browser/engines, Change build…, New profile…) says «${x.card}» meanwhile`, x);
});
async function wholeFact(KM = KM0) {
  const L = light(snapC);
  await L.ED.ready;
  const row = await viewRow(keeperOver(L, KM));
  const fact = L.ED.kernelFact(EID), got = row && row.kernel ? row.kernel : {};
  return { missing: Object.keys(fact).filter((k) => !(k in got)), differ: Object.keys(fact).filter((k) => k in got && JSON.stringify(got[k]) !== JSON.stringify(fact[k])), keys: Object.keys(fact).length };
}
await leg('⑬ the fact carried whole', async () => {
  const x = await wholeFact();
  ok(x.keys >= 20 && !x.missing.length && !x.differ.length, `CENSUS: every field kernelFact returns (${x.keys} — r3's landing, r4's discarded among them) reaches the keeper's engines view unchanged — a field the keeper drops is RED here`, x);
});
await leg('⑬ one bound for the whole ask', async () => {
  const BOUND = 200;
  const { slow, io } = slowNext();
  const L = light(snapC, { io, opts: { landWaitMs: BOUND } });
  slow.ms = BOUND * 3;
  const A = L.ED.landNext(EID);
  await until(() => !fs.existsSync(L.plan.targetDir), 1000);
  const t0 = Date.now();
  // r4 (主开发's ruling): past its bound with the landing STILL in progress the start does not go on — it is refused by name
  const B = await startOf(L.ED).then((x) => { x.release(); return { ...x, ms: Date.now() - t0 }; }, (e) => ({ threw: e && e.code, msg: String(e && e.message), ms: Date.now() - t0, empty: !fs.existsSync(L.plan.targetDir) }));
  later.push(A); // the slowed landing ends in the background (awaited before the suite ends)
  const late = L.journal.filter((l) => l.includes('still taking its place after 0.2 s')), said = L.journal.filter((l) => l.includes('a browser start waits for the new kernel to land (≤ 0.2 s)'));
  ok(B.threw === 'engine_kernel_landing' && B.msg.startsWith('the kernel is being replaced — try again in a moment') && B.empty && B.ms >= BOUND / 2 && B.ms < 2 * BOUND && late.length === 1 && said.length === 1,
    `ONE bound for a start's whole ask (its landing's queue AND its hold — never per stage): a landing slowed past it ⇒ the start ends after ${B.ms} ms (the bound is ${BOUND} ms), said once («… still taking its place after 0.2 s») — r4: REFUSED BY NAME («${String(B.msg).slice(0, 60)}…»), never going on beside the half-landed place`, { B, lines: L.journal });
});

console.log('— ⑭ (r3 N3) only ENOENT is «gone»: a receipt that cannot be read now keeps the waiting kernel');
const ROOTUID = typeof process.getuid === 'function' && process.getuid() === 0;
async function unreadable(EDM) {
  const deny = { on: true };
  const io = ROOTUID ? { readFile: (f) => (deny.on && f.endsWith('/.next-linux-x64/install-receipt.json') ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EACCES' })) : fs.promises.readFile(f)) } : null; // root reads a 000 file: the seam stands in
  const L = light(snapC, { EDM, io, prep: ({ plan }) => { if (!ROOTUID) fs.chmodSync(path.join(plan.nextDir, 'install-receipt.json'), 0o000); } });
  const l1 = await L.ED.landNext(EID), l1b = await L.ED.landNext(EID);
  const kept = { l1, l1b, next: !!L.rec().next, dir: fs.existsSync(L.plan.nextDir), said: L.journal.filter((l) => l.includes(`waiting kernel ${VER.k3} could not be read now (EACCES) — it is kept`)).length, gone: L.journal.some((l) => l.includes('not beside its place any more')) };
  deny.on = false; try { fs.chmodSync(path.join(L.plan.nextDir, 'install-receipt.json'), 0o644); } catch { /* removed */ }
  const l2 = await L.ED.landNext(EID);
  return { ...kept, l2, place: L.receipt() === KSHA.k3 ? 'K3' : L.receipt() === KSHA.k2 ? 'K2' : L.receipt() };
}
await leg('⑭ an unreadable receipt', async () => {
  const x = await unreadable(undefined);
  ok(x.l1 === false && x.l1b === false && x.next && x.dir && x.said === 1 && !x.gone && x.l2 === true && x.place === 'K3',
    'a waiting kernel whose receipt answers EACCES (standing for EIO / ESTALE / EMFILE on a PVC) is KEPT — its record and its folder — said ONCE over two starts; once it reads again it lands (no download again)', x);
});

console.log('— ⑮ (r3 N4) the cluster\'s repository holds ANOTHER plugin — its own words, never the consent ones');
const OTHER = 'vibespace.other-engine';
const OTHER_WORDS = `The cluster's repository holds another plugin («${OTHER}»), not ${EID} — ${EID} is not installed from it and there is nothing to consent to; the cluster's admin corrects fleet.json`;
async function otherScene(EDM, BMx = BM) {
  const h = hits.length;
  const L = light(snapC, { EDM, prep: noNext, row: { trusted: false, trustedBy: null }, fleet: { relayUrl: '', browserEngine: engineAt(shaB, { preinstall: true }) }, install: async () => ({ plugin: { id: OTHER }, sha: shaB }) });
  const r = await L.ED.syncFleet('change');
  const v = L.ED.fleetView(), W = fpwOf(BMx);
  return { outcome: v.outcome, got: v.got, kernel: v.kernel, fetched: hits.length - h, place: L.receipt() === KSHA.k2 ? 'K2' : L.receipt(), line: W(null, v, tW).line, fact: W(L.row, v, tW).fact, factOther: W({ ...L.row, id: OTHER }, v, tW).fact,
    boot: typeof L.ED.bootLine === 'function' ? L.ED.bootLine(r) : '(no bootLine on this tree)', said: L.journal.filter((l) => /fleet plugin/.test(l) && /another plugin|consent/.test(l)) };
}
await leg('⑮ another plugin id', async () => {
  const x = await otherScene(undefined);
  ok(x.outcome === 'other-id' && x.got === OTHER && !x.kernel && x.fetched === 0 && x.place === 'K2' && x.line === OTHER_WORDS && x.fact === OTHER_WORDS && x.factOther === OTHER_WORDS
    && x.boot === `[plugins] the fleet's engine plugin ${EID}: other-id · kernel none — the cluster's repository holds another plugin («${OTHER}»), not ${EID}; there is nothing to consent to`
    && x.said.length === 1 && x.said[0].includes(`the cluster's repository holds another plugin («${OTHER}»), not ${EID}`) && ![x.line, x.fact, x.boot, ...x.said].some((w) => /waiting for your consent|waits for your consent/.test(String(w))),
    `the cluster's repository holds «${OTHER}», not ${EID} ⇒ the panel, both rows, the boot line and the journal say THAT — «${OTHER_WORDS}» — never «waiting for your consent» (nothing of ${EID} to consent to); nothing fetched`, x);
});

console.log('— ⑯ (r3 N5) a tag pin the owner enabled: the line follows trust NOW');
async function tagScene(BMx = BM) {
  const L = light(snapA, { row: { trusted: false, trustedBy: null }, inst: { ref: shaC, sha: shaC }, install: async () => ({ plugin: { id: EID }, sha: shaB }) });
  await L.ED.syncFleet('change');
  const W = fpwOf(BMx), before = W(null, L.ED.fleetView(), tW).line, factBefore = W(L.row, L.ED.fleetView(), tW).fact;
  L.row.trusted = true; L.row.trustedBy = 'user'; // the owner enabled it (⚙ → Plugins → its switch → the consent dialog)
  return { outcome: L.ED.fleetView().outcome, before, factBefore, after: W(null, L.ED.fleetView(), tW).line, factAfter: W(L.row, L.ED.fleetView(), tW).fact };
}
await leg('⑯ the tag line follows trust', async () => {
  const x = await tagScene();
  ok(x.outcome === 'unpinned' && x.before === `The cluster names ${EID} at «v0.1.2» — not a full commit sha, so the cluster does not trust it; review it and enable it in ⚙ → Plugins → ${EID} · waiting for your consent — its kernel is not fetched`
    && x.factBefore === `waiting for your consent — its kernel is not fetched; enable it in ⚙ → Plugins → ${EID}`
    && x.after === `The cluster names ${EID} at «v0.1.2» (not a full sha, so the cluster does not vouch for it); you enabled it yourself — its kernel follows your consent` && !x.factAfter,
    'a tag pin: before the owner\'s consent the line names the door («… enable it in ⚙ → Plugins → <id>»); once the owner enabled it the line says so («you enabled it yourself — its kernel follows your consent»), the row\'s consent words gone', x);
});

console.log('— ⑰ (r4 N3) a plan that cannot be read at the landing is a TRANSIENT on the install road too');
/** The fleet's run downloads K2 (trusted by the cluster at shaB, preinstall on, K3 in its place); the landing's read of kernel.json
 *  answers EIO ONCE (a PVC's transient) ⇒ the verified K2 is KEPT beside the place, said once; the run's ONE queued re-run judges it
 *  again — it reads now ⇒ K2 lands. Nothing downloaded twice. */
async function unreadPlan(EDM) {
  const deny = { left: 1 };
  const io = { readFile: (f) => (deny.left > 0 && f.endsWith(`/plugins/${EID}/kernel.json`) ? (deny.left--, Promise.reject(Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }))) : fs.promises.readFile(f)) };
  const h = k2hits();
  const L = light(snapB, { EDM, io, prep: noNext, ...trustedAt(shaB) });
  await L.ED.syncFleet('change');
  const at = L.receipt();
  return { denied: deny.left === 0, place: at === KSHA.k2 ? 'K2' : at === KSHA.k3 ? 'K3' : at, kernel: (L.rec().kernel || {}).version || null, next: !!L.rec().next, nextDir: fs.existsSync(L.plan.nextDir), fetched: k2hits() - h,
    kept: L.journal.filter((l) => l.includes(`kernel ${VER.k2} is downloaded`) && l.includes('could not be read now (EIO)') && l.includes('KEPT beside its place, never landed')).length,
    landed: L.journal.filter((l) => l.includes(`kernel ${VER.k2} took its place`)).length, discarded: L.journal.filter((l) => /discarded/.test(l)).length };
}
await leg('⑰ an unreadable plan at the landing', async () => {
  const x = await unreadPlan(undefined);
  ok(x.denied && x.kept === 1 && x.discarded === 0 && x.landed === 1 && x.place === 'K2' && x.kernel === VER.k2 && !x.next && !x.nextDir && x.fetched === 1,
    'kernel.json answering EIO at the landing (a transient — only ENOENT is a fact) KEEPS the verified K2 beside the place, said ONCE («… KEPT beside its place, never landed»); the fleet\'s ONE queued re-run judges it again and lands it — downloaded once', x);
});

console.log('— ⑱ (r4 N4) a discard leaves a trace: the record, the card, ONE For-you notice when nobody watched');
const traceOf = async (x) => { const row = await viewRow(keeperOver(x.L)); return { ...x.trace, card: row ? BM.engineNote(row, tW) : null }; };
async function discardTrace(EDM) {
  const a = await inFlight(EDM, untrust), b = await inFlight(EDM, replan, { by: 'user' });
  return { fleet: await traceOf(a), user: await traceOf(b) };
}
await leg('⑱ a discard leaves a trace', async () => {
  const x = await discardTrace(undefined), f = x.fleet, u = x.user;
  ok(f.rec && f.rec.why === 'untrusted' && f.rec.version === VER.k2 && f.fact && f.fact.why === 'untrusted' && f.todos.length === 1 && f.todos[0].endsWith(': its new browser kernel was discarded')
    && f.card === `Fixture Browser Engine · measured ${VER.k3} · its new kernel ${VER.k2} was discarded — its package was no longer trusted when it arrived`,
    `the cluster's download discarded (nobody watched) ⇒ the record keeps the outcome, the engine card (through the keeper) says «${f.card}», ONE For-you notice («${f.todos[0]}»)`, f);
  ok(u.rec && u.rec.why === 'stale' && u.rec.by === 'user' && !u.todos.length && u.card === `Fixture Browser Engine · measured ${VER.k3} · its new kernel ${VER.k2} was discarded — the cluster moved its pin while it downloaded`,
    `a person's own «Download kernel» discarded (the cluster moved its pin) ⇒ the card says why («${u.card}»); no For-you notice (they watched)`, u);
});

console.log('— ⑲ (r4 N5) the boot line says «kernel ready» only for a kernel in its place');
const SHAPES = [
  [{ ok: true, due: true, version: VER.k3 }, `kernel download due (${VER.k3})`],
  [{ ok: true, staged: true, version: VER.k3 }, `new kernel waiting beside the place (${VER.k3})`],
  [{ ok: true, id: EID, version: VER.k2, sha256: KSHA.k2, discarded: 'stale' }, 'kernel discarded (the cluster moved its pin while it downloaded)'],
  [{ ok: true, untrusted: false }, 'kernel follows your consent (you trust the package; the cluster does not)'],
  [{ ok: true, id: EID, version: VER.k2, sha256: KSHA.k2, measuredVersion: VER.k2 }, 'kernel ready'],
  [{ ok: true, present: true }, 'kernel ready'],
  [{ ok: true, untrusted: true }, 'kernel not fetched — it waits for your consent'],
];
const bootWords = (EDM) => SHAPES.map(([k]) => (typeof EDM.bootLine === 'function' ? EDM.bootLine({ plugin: EID, outcome: 'same', kernel: k }) : '(no bootLine on this tree)'));
await leg('⑲ the boot line\'s words', async () => {
  const got = bootWords(require('../src/server/engine-distribution.js'));
  const bad = SHAPES.map(([, w], i) => (got[i] === `[plugins] the fleet's engine plugin ${EID}: same · ${w}` ? null : got[i])).filter((g) => g !== null);
  ok(!bad.length && got.slice(0, 4).every((l) => !/kernel ready/.test(l)),
    'the boot line: due ⇒ «kernel download due», waiting ⇒ «new kernel waiting beside the place», discarded ⇒ «kernel discarded (why)», trusted by the owner only ⇒ «kernel follows your consent» — «kernel ready» ONLY for a kernel in its place', bad);
});

console.log('— ⑳ (r4, 主开发\'s ruling on r3 (b)) nothing proceeds beside a half-landed place; the aside kernel is put back by the next run');
/** The fleet's run lands K3 (snapC); its SECOND rename hangs (K2 aside, the place EMPTY), then fails, and the put-back fails too (K2
 *  stays aside). A start meanwhile (bound 0.2 s) ⇒ refused BY NAME, never beside the empty place; the next run (bootRestore) puts
 *  K2 back, then lands K3. */
async function halfLanded(EDM) {
  const BOUND = 200, st = { held: false, failBack: true };
  let hang = null; const gate = new Promise((r) => { hang = r; });
  const eio = () => Object.assign(new Error('EIO: i/o error, rename'), { code: 'EIO' });
  const io = { rename: async (a, b) => {
    if (a.endsWith('/.next-linux-x64') && !st.held) { st.held = true; await gate; throw eio(); }
    if (a.endsWith('/.removing-linux-x64') && st.failBack) { st.failBack = false; throw eio(); }
    return fs.promises.rename(a, b);
  } };
  const L = light(snapC, { EDM, io, opts: { landWaitMs: BOUND } });
  const A = L.ED.landNext(EID);
  await until(() => !fs.existsSync(L.plan.targetDir), 1000); // K2 moved aside: the place is EMPTY while the second rename hangs
  const t0 = Date.now();
  const B = await startOf(L.ED).then((x) => { x.release(); return { proceeded: true, ms: Date.now() - t0, empty: !fs.existsSync(L.plan.targetDir) }; }, (e) => ({ threw: e && e.code, msg: String(e && e.message), ms: Date.now() - t0, empty: !fs.existsSync(L.plan.targetDir) }));
  hang(); const a = await A; // the hung rename fails; its put-back fails too ⇒ K2 aside, nothing in its place
  const asideLeft = fs.existsSync(L.plan.removingDir) && !fs.existsSync(L.plan.targetDir);
  const r = await L.ED.bootRestore(); // THE NEXT RUN: the aside kernel back first, then the waiting kernel lands
  const at = L.receipt();
  return { bound: BOUND, B, a, asideLeft, putBack: L.journal.filter((l) => l.includes('previous kernel was put back in its place')).length, place: at === KSHA.k3 ? 'K3' : at === KSHA.k2 ? 'K2' : at, aside: fs.existsSync(L.plan.removingDir), landed: r.some((x) => x.landed) };
}
await leg('⑳ a half-landed place', async () => {
  const x = await halfLanded(undefined);
  ok(x.B.threw === 'engine_kernel_landing' && x.B.msg.startsWith('the kernel is being replaced — try again in a moment') && x.B.msg.includes('taking its place for more than 0.2 s') && x.B.empty
    && x.a === false && x.asideLeft && x.putBack === 1 && x.landed && x.place === 'K3' && !x.aside,
    `a start whose bound passes while the landing hangs between its renames (the place EMPTY) is REFUSED BY NAME («${String(x.B.msg).slice(0, 70)}…», ${x.B.ms} ms) — never spawned beside it; the landing failed with K2 set aside; the NEXT RUN put K2 back (one line) and landed K3`, x);
});

console.log('— ㉑ (r4, the ruling\'s (4)) judgeNow\'s \'moved\' branch: a plan whose inputs keep moving never lands');
/** The package's install record is rewritten at EVERY read (its contentHash moves): the verdict reads the plan three times, the
 *  inputs moved each time ⇒ its sync half (judgeNow) answers 'moved' in the rename's own turn — on both roads nothing lands or runs. */
async function movingPlan(EDM, road) {
  let n = 0;
  const S = road === 'install' ? snapB : snapC;
  const L = light(S, { EDM, prep: road === 'install' ? noNext : null, record: () => ({ ...S.inst, contentHash: `moving-${n++}` }) });
  await L.ED.ready;
  const m0 = JSON.stringify(L.rec().measured);
  let r;
  if (road === 'install') r = await L.ED.installKernel(EID, { by: 'fleet', wait: true }).catch((e) => ({ threw: e && e.code }));
  else { const st = await startOf(L.ED).catch((e) => ({ threw: e && e.code })); if (st.release) st.release(); r = { landed: st.landed, threw: st.threw }; }
  const at = L.receipt();
  return { reads: n, r: { discarded: r && r.discarded, landed: r && r.landed, threw: r && r.threw, measuredVersion: r && r.measuredVersion }, place: at === KSHA.k3 ? 'K3' : at === KSHA.k2 ? 'K2' : at,
    measured: JSON.stringify(L.rec().measured) === m0 ? 'untouched' : (L.rec().measured || {}).version, next: L.rec().next ? L.rec().next.version : null, lines: L.journal.filter((l) => /changed as it landed|took its place|is installed \(sha256|kernel says/.test(l)) };
}
await leg('㉑ judgeNow: moved', async () => {
  const a = await movingPlan(undefined, 'install'), b = await movingPlan(undefined, 'wait');
  ok(a.r.discarded === 'moved' && a.place === 'K3' && a.measured === 'untouched' && a.lines.length === 1 && a.lines[0].includes(`kernel ${VER.k2} was downloaded for a plan that changed as it landed — discarded, never landed`),
    'the install road: a plan whose inputs moved at every read ⇒ judgeNow answers \'moved\' in the rename\'s own turn — K2 never lands (judged afresh beside the place, moved again ⇒ discarded), nothing runs, one line', a);
  ok(b.r.landed === false && b.place === 'K2' && b.next === VER.k3 && b.measured === 'untouched' && b.lines.length === 1 && b.lines[0].includes(`waiting kernel ${VER.k3} did not take its place — its plan changed as it landed; nothing ran, it waits`),
    'the waiting road: the same ⇒ K3 does not land, nothing runs, it keeps waiting, one line', b);
});

console.log('— ㉒ (r5 m1) a refused staging keeps what waits — the kernel already beside the place, its record, the card says both');
/** A file tree's identity (each file's path + sha256) — a waiting kernel kept «byte for byte». */
const treeOf = (dir) => { const out = []; const walk = (d, rel) => { for (const n of fs.readdirSync(d).sort()) { const f = path.join(d, n), r = rel ? `${rel}/${n}` : n; if (fs.lstatSync(f).isDirectory()) walk(f, r); else out.push(`${r}:${sha(fs.readFileSync(f))}`); } }; try { walk(dir, ''); } catch { return null; } return `${sha(Buffer.from(out.join('\n'))).slice(0, 16)}:${out.length}`; };
/** snapC (K2 in its place, a browser on it, K3 waiting): a person's «Download kernel» fetches K3 again; the trust is withdrawn
 *  `at` 'scan' (inside the landing's in-use scan — the new download can only wait beside the place) or 'aside' (as the kernel
 *  already waiting is moved aside — between the staging's two asks). → what waits now, what the card says. */
async function refusedStaging(EDM, at = 'scan') {
  const S = {}; let fired = false;
  const inUse = async () => { if (at === 'scan' && !fired) { fired = true; untrust(S.L); } return true; };
  const io = at === 'aside' ? { rename: async (a, b) => { if (!fired && a.endsWith('/.next-linux-x64') && b.endsWith('/.next-linux-x64.prev')) { fired = true; untrust(S.L); } return fs.promises.rename(a, b); } } : null;
  const L = light(snapC, { EDM, inUse, io }); S.L = L;
  await L.ED.ready;
  const t0 = treeOf(L.plan.nextDir), n0 = L.rec().next ? L.rec().next.version : null;
  const r = await L.ED.installKernel(EID, { by: 'user', wait: true }).catch((e) => ({ threw: e && e.code }));
  const row = await viewRow(keeperOver(L));
  const at0 = L.receipt();
  return { fired, r: { discarded: r && r.discarded, staged: !!(r && r.staged), threw: r && r.threw }, n0, next: L.rec().next ? L.rec().next.version : null, kept: !!t0 && treeOf(L.plan.nextDir) === t0,
    place: at0 === KSHA.k2 ? 'K2' : at0 === KSHA.k3 ? 'K3' : at0, prev: fs.existsSync(`${L.plan.nextDir}.prev`), partials: [L.plan.unpackDir, L.plan.part].filter((f) => fs.existsSync(f)).length,
    trace: L.rec().discarded ? { why: L.rec().discarded.why, by: L.rec().discarded.by, version: L.rec().discarded.version } : null, todos: L.todos.length, card: row ? BM.engineNote(row, tW) : null, row };
}
const KEPT_CARD = `Fixture Browser Engine · measured ${VER.k2} · new kernel ${VER.k3} downloaded — it serves the next browser start · a second download of it was discarded — its package was no longer trusted when it arrived`; // r6 (n4): one version, one sentence
await leg('㉒ a refused staging keeps what waits', async () => {
  const a = await refusedStaging(undefined, 'scan'), b = await refusedStaging(undefined, 'aside');
  ok(a.fired && a.r.discarded === 'untrusted' && a.n0 === VER.k3 && a.next === VER.k3 && a.kept && a.place === 'K2' && !a.prev && !a.partials && a.trace && a.trace.why === 'untrusted' && a.trace.by === 'user' && !a.todos && a.card === KEPT_CARD,
    `the trust withdrawn INSIDE the in-use scan (a browser on K2 — the download can only wait beside it) ⇒ the judge, asked FIRST, refuses before anything beside the place is touched: the K3 already waiting stays byte for byte with its record (r2: a lapsed trust deletes nothing), only the new download is discarded — the card says both, naming the version once (r6 n4): «${a.card}»`, a);
  ok(b.fired && b.r.discarded === 'untrusted' && b.next === VER.k3 && b.kept && b.place === 'K2' && !b.prev && !b.partials && b.trace && b.trace.why === 'untrusted' && b.card === KEPT_CARD,
    'the trust withdrawn AS the waiting K3 is moved aside (between the staging\'s two asks) ⇒ the last ask refuses in the rename\'s own turn and K3 comes BACK beside the place, byte for byte, its record kept; nothing left aside', b);
});

console.log('— ㉓ (r5 m2) a start is refused ONLY while the place is not whole');
/** snapC's waiting K3 lands (the fleet's run, no bound of its own); the clean-up of the previous kernel (`.removing-<tag>`, K3
 *  already whole in its place) is HELD; a start meanwhile (bound 0.1 s) ⇒ it goes on, on K3. */
async function cleanupScene(EDM) {
  const BOUND = 100, S = {}; let rmIn = false, rmGo = null; const rmGate = new Promise((r) => { rmGo = r; });
  const io = { rm: async (f, o) => { if (f.endsWith('/.removing-linux-x64') && S.L && S.L.receipt() === KSHA.k3) { rmIn = true; await rmGate; } return fs.promises.rm(f, o); } };
  const L = light(snapC, { EDM, io, opts: { landWaitMs: BOUND } }); S.L = L;
  const A = L.ED.landNext(EID);
  const inCleanup = !!(await until(() => rmIn, 2000));
  const t0 = Date.now();
  const B = await startOf(L.ED).then((x) => { const at = L.receipt(); x.release(); return { proceeded: true, at: at === KSHA.k3 ? 'K3' : at === KSHA.k2 ? 'K2' : at, ms: Date.now() - t0 }; }, (e) => ({ threw: e && e.code, msg: String(e && e.message).slice(0, 80), ms: Date.now() - t0 }));
  rmGo(); const a = await A;
  return { bound: BOUND, inCleanup, B, a, place: L.receipt() === KSHA.k3 ? 'K3' : L.receipt(), removing: fs.existsSync(L.plan.removingDir), refused: L.journal.filter((l) => l.includes('is being replaced')).length };
}
/** snapC's waiting K3 lands; its FIRST ask of the judge (inside the section, nothing moved yet — kernel.json's read) is HELD past a
 *  start's bound ⇒ the start goes on, holding K2 whole; the landing, asked in the turn that would move the place, moves nothing it
 *  holds — K3 keeps waiting. */
async function heldScene(EDM) {
  const BOUND = 100; let n = 0, inRead = false, go = null; const gate = new Promise((r) => { go = r; });
  const io = { readFile: async (f) => { if (f.endsWith(`/plugins/${EID}/kernel.json`) && ++n === 2) { inRead = true; await gate; } return fs.promises.readFile(f); } };
  const L = light(snapC, { EDM, io, opts: { landWaitMs: BOUND } });
  const A = L.ED.landNext(EID);
  const held = !!(await until(() => inRead && L.ED.kernelFact(EID), 2000));
  const B = await startOf(L.ED).then((x) => ({ proceeded: true, release: x.release, at: L.receipt() === KSHA.k2 ? 'K2' : L.receipt() }), (e) => ({ threw: e && e.code }));
  go(); const a = await A;
  const under = L.receipt() === KSHA.k2 ? 'K2' : L.receipt() === KSHA.k3 ? 'K3' : L.receipt(); // what the place holds while B still holds it
  if (B.release) B.release();
  return { held, B: { proceeded: B.proceeded, threw: B.threw, at: B.at }, a, under, next: L.rec().next ? L.rec().next.version : null, nextDir: fs.existsSync(L.plan.nextDir), aside: fs.existsSync(L.plan.removingDir) };
}
await leg('㉓ the place not whole', async () => {
  const x = await cleanupScene(undefined), y = await heldScene(undefined);
  ok(x.inCleanup && x.B.proceeded && x.B.at === 'K3' && x.B.ms >= x.bound / 2 && x.a === true && x.place === 'K3' && !x.removing && !x.refused,
    `a start whose bound (${x.bound} ms) passes while the landing DELETES the previous kernel (K3 already whole in its place) goes on — on K3 (${x.B.ms} ms), never «being replaced»; the clean-up ends after it`, x);
  ok(y.held && y.B.proceeded && y.B.at === 'K2' && y.a === false && y.under === 'K2' && y.next === VER.k3 && y.nextDir && !y.aside,
    'a start whose bound passes BEFORE the landing moved anything goes on, holding K2 whole; the landing — asked in the turn that would move the place — moves nothing a start holds: K2 stays under it, K3 keeps waiting (a landing never moves a held place)', y);
});

console.log('— ㉔ (r5 m3) a start never waits behind a git clone');
/** snapC, a start's ONE ask (bound LAND_WAIT_MS / 150 handed to the product — r6: 0.2 s, the control waits it whole): the cluster's install of the package (a git clone —
 *  a plan write) begins DURING the start's in-use scan and is held ⇒ the start is «not now» at once, no landing words. */
async function cloneScene(EDM) {
  const BOUND = LAND_WAIT_MS / 150, S = {}; let calls = 0, enter = null, release = null;
  const entered = new Promise((r) => { enter = r; }), gate = new Promise((r) => { release = r; });
  const inUse = async () => { calls++; if (calls === 1) { S.run = S.L.ED.syncFleet('change'); await entered; return false; } return true; };
  const L = light(snapC, { EDM, inUse, fleet: { relayUrl: '', browserEngine: engineAt(shaB) }, install: async () => { enter(); await gate; return { plugin: { id: EID }, sha: shaB }; }, opts: { landWaitMs: BOUND } }); S.L = L;
  await L.ED.ready;
  let done = false, card = null;
  const t0 = Date.now();
  const p = startOf(L.ED);
  const watch = (async () => { while (!done) { const f = L.ED.kernelFact(EID); if (f.landing) card = f.landing; await sleep(5); } })();
  const st = await p; const ms = Date.now() - t0; done = true; await watch;
  const during = L.receipt() === KSHA.k2 ? 'K2' : L.receipt();
  st.release(); release(); await S.run;
  return { bound: BOUND, scanned: calls >= 1, l: st.landed, ms, card, during, said: L.journal.filter((l) => /waits for the new kernel to land|waits no longer/.test(l)) };
}
await leg('㉔ never behind a git clone', async () => {
  const x = await cloneScene(undefined);
  ok(x.scanned && x.l === false && x.ms < x.bound && !x.card && x.during === 'K2' && !x.said.length,
    `the cluster's install of the package (a git clone) begins DURING a start's in-use scan ⇒ the start is «not now» at once (${x.ms} ms — its bound is ${x.bound} ms): no wait in the writer queue, no «waiting for the new kernel to land» on the card, no journal line; nothing lands under the plan write`, x);
});

console.log('— ㉕ (r5 m4) every step-aside has a leg: the measure, the boot, a download asked beside a half-landed place');
const SECOND = 'vibespace.second-engine';
/** snapC + a SECOND engine whose previous kernel an earlier landing left aside (its place empty). The waiting K3 lands; its second
 *  rename HANGS (the place EMPTY — torn). Meanwhile (bound 0.1 s): a forced measure, the boot's restore, a download by the fleet
 *  (`only`: one of them — a control's). Each step is given LAND_WAIT_MS / 30 at most (ten bounds): a tree whose step does not
 *  step aside (an older one — its boot queues behind the landing this scene holds open) answers `{hung: true}` by name. */
async function stepsAside(EDM, only = null) {
  const asks = (k) => !only || only === k;
  const bounded = (p) => Promise.race([p, sleep(LAND_WAIT_MS / 30).then(() => ({ hung: true }))]);
  const BOUND = 100; let hang = null, held = false; const gate = new Promise((r) => { hang = r; });
  const io = { rename: async (a, b) => { if (!held && a.endsWith('/.next-linux-x64') && b.endsWith('/linux-x64')) { held = true; await gate; } return fs.promises.rename(a, b); } };
  const L = light(snapC, { EDM, io, opts: { landWaitMs: BOUND }, prep: ({ R, plan }) => {
    const p2 = require('../src/engine-kernel.js').kernelPlan({ kernelPath: path.join(R, 'plugins-state', SECOND, 'kernel', 'linux-x64', 'chrome') });
    fs.mkdirSync(path.dirname(p2.removingDir), { recursive: true }); fs.cpSync(plan.targetDir, p2.removingDir, { recursive: true });
    const f = path.join(R, 'browser-engines.json'), j = JSON.parse(fs.readFileSync(f, 'utf8')); j.engines[SECOND] = { kernel: { ...j.engines[EID].kernel } }; fs.writeFileSync(f, JSON.stringify(j));
  } });
  await L.ED.ready;
  const m0 = JSON.stringify(L.rec().measured);
  const A = L.ED.landNext(EID);
  const torn = !!(await until(() => held && !fs.existsSync(L.plan.targetDir), 2000));
  const m = !asks('measure') ? null : await bounded(L.ED.measure(EID, { force: true }).then((r) => ({ ok: r && r.ok, code: r && r.code }), (e) => ({ threw: e && e.code })));
  const ran = L.journal.filter((l) => /kernel says/.test(l)).length, measured = JSON.stringify(L.rec().measured) === m0 ? 'untouched' : 'changed';
  const b = !asks('boot') ? {} : await bounded(L.ED.bootRestore().then((out) => ({ out }), (e) => ({ threw: e && e.code })));
  const p2 = require('../src/engine-kernel.js').kernelPlan({ kernelPath: path.join(L.R, 'plugins-state', SECOND, 'kernel', 'linux-x64', 'chrome') });
  const second = fs.existsSync(p2.exe) && !fs.existsSync(p2.removingDir);
  const i = !asks('install') ? null : await bounded(L.ED.installKernel(EID, { by: 'fleet' }).then(() => ({ started: true }), (e) => ({ threw: e && e.code })));
  const failure = L.rec().failure ? L.rec().failure.code : null, todos = L.todos.length, failedLine = L.journal.filter((l) => /kernel download failed/.test(l)).length;
  const stillTorn = !fs.existsSync(L.plan.targetDir);
  hang(); const a = await bounded(A);
  return { torn, stillTorn, m, ran, measured, b: { threw: b.threw, hung: b.hung, out: b.out ? b.out.map((x) => x.id + (x.restored ? ':restored' : '')) : null }, second, i, failure, todos, failedLine, a, place: L.receipt() === KSHA.k3 ? 'K3' : L.receipt() };
}
await leg('㉕ every step-aside', async () => {
  const x = await stepsAside(undefined);
  ok(x.torn && x.stillTorn && x.m.ok === false && x.m.code === 'engine_kernel_landing' && !x.m.threw && x.ran === 0 && x.measured === 'untouched',
    'a forced MEASURE past its bound beside the half-landed place is ANSWERED (engine_kernel_landing, ok false) — never thrown, nothing run, the record untouched', x);
  ok(x.torn && !x.b.threw && !x.b.hung && Array.isArray(x.b.out) && x.b.out.includes(`${SECOND}:restored`) && !x.b.out.some((o) => o.startsWith(EID)) && x.second,
    `the BOOT's restore past its bound beside it SKIPS that engine (asked again at the next run) and GOES ON — the next engine's aside kernel is put back (${JSON.stringify(x.b.out)})`, x.b);
  ok(x.torn && x.i.threw === 'engine_kernel_landing' && !x.failure && !x.todos && !x.failedLine && x.a === true && x.place === 'K3',
    'a DOWNLOAD asked beside it (the fleet\'s) is refused by name and records NO failure — no failure on the card, no For-you notice, no «download failed» line; the landing then ends with K3 in its place', { i: x.i, failure: x.failure, todos: x.todos, failedLine: x.failedLine, a: x.a, place: x.place });
});

console.log('— ㉖ (r6 n1) a landing asks onPlace\'s WHOLE question in the turn it moves — a hold, a running program, a hold taken meanwhile');
/** snapC's waiting K3 lands (the fleet's run). `after` (the acceptance's probe): its first ask of the judge (kernel.json's 2nd read
 *  — nothing moved yet) is HELD past a start's bound (0.1 s); the start goes on, SPAWNS from K2 and drops its hold (the keeper's
 *  dropPlaceHold when the start settles) while the browser keeps running; then the read is let go. `scan`: the start goes on, spawns
 *  and drops its hold DURING the landing's own in-use scan before its first rename — a scan that listed /proc before the spawn. */
async function droppedScene(EDM, mode = 'after') {
  const BOUND = 100, S = { used: false, scans: 0 }; let n = 0, inRead = false, go = null; const gate = new Promise((r) => { go = r; });
  const io = mode === 'after' ? { readFile: async (f) => { if (f.endsWith(`/plugins/${EID}/kernel.json`) && ++n === 2) { inRead = true; await gate; } return fs.promises.readFile(f); } } : null;
  const spawned = (x) => { S.at = S.L.receipt() === KSHA.k2 ? 'K2' : S.L.receipt(); S.used = true; x.release(); return { proceeded: true }; };
  const inUse = async () => {
    S.scans++;
    if (mode === 'scan' && S.scans === 2) { S.B = await startOf(S.L.ED).then(spawned, (e) => ({ threw: e && e.code })); return false; } // listed before the spawn
    return mode === 'after' && S.used;
  };
  const L = light(snapC, { EDM, io, inUse, opts: { landWaitMs: BOUND } }); S.L = L;
  const A = L.ED.landNext(EID);
  if (mode === 'after') { S.held = !!(await until(() => inRead, 2000)); S.B = await startOf(L.ED).then(spawned, (e) => ({ threw: e && e.code })); go(); }
  const a = await A;
  const at = L.receipt();
  return { mode, held: mode === 'after' ? S.held : S.scans >= 2, B: S.B, startAt: S.at, a, place: at === KSHA.k2 ? 'K2' : at === KSHA.k3 ? 'K3' : at, next: L.rec().next ? L.rec().next.version : null,
    nextDir: fs.existsSync(L.plan.nextDir), aside: fs.existsSync(L.plan.removingDir), landedLine: L.journal.some((l) => l.includes('took its place')) };
}
/** The install road beside a place that is busy — `start`: a browser start HOLDS K2 (nothing runs yet) · `running`: a browser runs
 *  K2 — K3 downloaded by the fleet waits beside it; its line says which. */
async function busyWords(EDM, how) {
  const L = light(snapC, { EDM, prep: noNext, inUse: () => how === 'running' });
  await L.ED.ready;
  const B = how === 'start' ? await startOf(L.ED) : null;
  const r = await L.ED.installKernel(EID, { by: 'fleet', wait: true }).catch((e) => ({ threw: e && e.code }));
  if (B) B.release();
  return { staged: !!(r && r.staged), place: L.receipt() === KSHA.k2 ? 'K2' : L.receipt(), line: L.journal.find((l) => l.includes('is downloaded (sha256')) || null };
}
await leg('㉖ the whole question before the first rename', async () => {
  const x = await droppedScene(undefined, 'after'), y = await droppedScene(undefined, 'scan');
  ok(x.held && x.B && x.B.proceeded && x.startAt === 'K2' && x.a === false && x.place === 'K2' && x.next === VER.k3 && x.nextDir && !x.aside && !x.landedLine,
    'a start past its bound before anything moved SPAWNS from K2 and drops its hold before the landing\'s last await ends (the acceptance\'s probe) ⇒ the landing, asking onPlace\'s whole question in the turn it would move, sees the running browser: held — K2 stays in its place under it, K3 keeps waiting, no «took its place» line', x);
  ok(y.held && y.B && y.B.proceeded && y.startAt === 'K2' && y.a === false && y.place === 'K2' && y.next === VER.k3 && y.nextDir && !y.aside && !y.landedLine,
    'a start that spawns and drops its hold DURING the landing\'s own in-use scan (a scan that listed /proc before the spawn) ⇒ the hold TAKEN meanwhile counts: held — K2 stays, K3 keeps waiting', y);
  const h = await busyWords(undefined, 'start'), r = await busyWords(undefined, 'running');
  ok(h.staged && h.place === 'K2' && String(h.line).includes('— a browser start holds the current kernel, so the new one waits beside it') && !String(h.line).includes('a browser runs')
    && r.staged && r.place === 'K2' && String(r.line).includes('— a browser runs the current kernel, so the new one waits beside it'),
    `(n5) the staging's line says WHICH: a start's hold «${String(h.line).replace(/^.*— /, '')}» — a running browser «${String(r.line).replace(/^.*— /, '')}»`, { h, r });
});

console.log('— ㉗ (r6 n2) an EMPTY place with its kernel aside is not whole — the landing\'s own put-back is a rename of the place');
/** snapC with K2 moved ASIDE by an earlier landing (`.removing-<tag>`, the place EMPTY, the record's `aside`) + ㉕'s SECOND engine
 *  (its kernel aside too): the waiting K3 lands — its landing puts K2 BACK first, and that rename (.removing → place) HANGS.
 *  Meanwhile (bound 0.1 s), all at once: a start, a forced measure, the boot, a download by the fleet (`only`: one of them — a
 *  control's); each step given LAND_WAIT_MS / 30 at most (`{hung: true}` by name). */
async function putBackScene(EDM, only = null, { hold = 'rename' } = {}) {
  const asks = (k) => !only || only === k;
  const bounded = (p) => Promise.race([p, sleep(LAND_WAIT_MS / 30).then(() => ({ hung: true }))]);
  const BOUND = 100; let hang = null, held = false, armed = false; const gate = new Promise((r) => { hang = r; });
  const statAt = hold === 'removing' ? `/${EID}/kernel/.removing-linux-x64` : `/${EID}/kernel/linux-x64`; // r7 (p2): the put-back's first stat · its second (the place)
  const io = { rename: async (a, b) => { if (hold === 'rename' && !held && a.endsWith(`/${EID}/kernel/.removing-linux-x64`) && b.endsWith(`/${EID}/kernel/linux-x64`)) { held = true; await gate; } return fs.promises.rename(a, b); },
    stat: async (p) => { if (hold !== 'rename' && armed && !held && String(p).endsWith(statAt)) { held = true; await gate; } return fs.promises.stat(p); } };
  const L = light(snapC, { EDM, io, opts: { landWaitMs: BOUND }, prep: ({ R, plan }) => {
    const p2 = require('../src/engine-kernel.js').kernelPlan({ kernelPath: path.join(R, 'plugins-state', SECOND, 'kernel', 'linux-x64', 'chrome') });
    fs.mkdirSync(path.dirname(p2.removingDir), { recursive: true }); fs.cpSync(plan.targetDir, p2.removingDir, { recursive: true });
    fs.renameSync(plan.targetDir, plan.removingDir); // an earlier landing stopped between its renames: K2 aside, the place EMPTY
    const f = path.join(R, 'browser-engines.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.engines[SECOND] = { kernel: { ...j.engines[EID].kernel } }; j.engines[EID].aside = j.engines[EID].kernel; delete j.engines[EID].kernel; fs.writeFileSync(f, JSON.stringify(j));
  } });
  await L.ED.ready;
  const m0 = JSON.stringify(L.rec().measured);
  armed = true;
  const A = L.ED.landNext(EID);
  const inPutBack = !!(await until(() => held && !fs.existsSync(L.plan.targetDir), 2000));
  const t0 = Date.now(); // the four askers at once (each its own bound)
  const [s0, m, b, i] = await Promise.all([
    !asks('start') ? null : bounded(startOf(L.ED).then((x) => { const empty = !fs.existsSync(L.plan.targetDir); x.release(); return { proceeded: true, empty, ms: Date.now() - t0 }; }, (e) => ({ threw: e && e.code, msg: String(e && e.message).slice(0, 60), ms: Date.now() - t0 }))),
    !asks('measure') ? null : bounded(L.ED.measure(EID, { force: true }).then((r) => ({ ok: r && r.ok, code: r && r.code }), (e) => ({ threw: e && e.code }))),
    !asks('boot') ? {} : bounded(L.ED.bootRestore().then((out) => ({ out }), (e) => ({ threw: e && e.code }))),
    !asks('install') ? null : bounded(L.ED.installKernel(EID, { by: 'fleet' }).then(() => ({ started: true }), (e) => ({ threw: e && e.code }))),
  ]);
  const ran = L.journal.filter((l) => /kernel says/.test(l)).length, measured = JSON.stringify(L.rec().measured) === m0 ? 'untouched' : 'changed';
  const p2 = require('../src/engine-kernel.js').kernelPlan({ kernelPath: path.join(L.R, 'plugins-state', SECOND, 'kernel', 'linux-x64', 'chrome') });
  const second = fs.existsSync(p2.exe) && !fs.existsSync(p2.removingDir);
  const failure = L.rec().failure ? L.rec().failure.code : null, todos = L.todos.length, failedLine = L.journal.filter((l) => /kernel download failed/.test(l)).length;
  const stillEmpty = !fs.existsSync(L.plan.targetDir);
  hang(); const a = await bounded(A);
  return { hold, inPutBack, stillEmpty, s: s0, m, ran, measured, b: { threw: b.threw, hung: b.hung, out: b.out ? b.out.map((x) => x.id + (x.restored ? ':restored' : '')) : null }, second, i, failure, todos, failedLine, a, place: L.receipt() === KSHA.k3 ? 'K3' : L.receipt() === KSHA.k2 ? 'K2' : L.receipt() };
}
await leg('㉗ the put-back is a rename of the place', async () => {
  const x = await putBackScene(undefined);
  ok(x.inPutBack && x.stillEmpty && x.s && x.s.threw === 'engine_kernel_landing' && x.s.msg.startsWith('the kernel is being replaced') && x.s.ms >= 50,
    `a START past its bound (0.1 s) while the landing puts K2 back into the EMPTY place is refused by name (${x.s && x.s.ms} ms) — never beside the empty place`, x.s);
  ok(x.inPutBack && x.m && x.m.ok === false && x.m.code === 'engine_kernel_landing' && !x.m.hung && x.ran === 0 && x.measured === 'untouched',
    'a forced MEASURE beside the put-back is ANSWERED (engine_kernel_landing) — never left waiting on the put-back, nothing run', x.m);
  ok(x.inPutBack && !x.b.threw && !x.b.hung && Array.isArray(x.b.out) && x.b.out.includes(`${SECOND}:restored`) && !x.b.out.some((o) => o.startsWith(EID)) && x.second,
    `the BOOT skips that engine and GOES ON — the next engine's aside kernel is put back (${JSON.stringify(x.b.out)})`, x.b);
  ok(x.inPutBack && x.i && x.i.threw === 'engine_kernel_landing' && !x.failure && !x.todos && !x.failedLine && x.a === true && x.place === 'K3',
    'a DOWNLOAD by the fleet beside it is refused by name and records NO failure; once the put-back ends the landing lands K3', { i: x.i, failure: x.failure, todos: x.todos, a: x.a, place: x.place });
});

console.log('— ㉘ (r6 n3) the sweep never removes the ONLY copy of the kernel the record names');
/** snapC (K2 in its place, a browser on it, K3 waiting): a person's «Download kernel» fetches K3 again and VibeSpace STOPS (the io
 *  seam never answers) `at` 'aside' (right after the waiting K3 is moved aside) · 'back' (the trust withdrawn as it is moved aside —
 *  at the put-back after the refusal) · 'new' (at the rename of the new download). THE NEXT BOOT (a fresh distribution over the
 *  same data — the record as last saved): `failBack` ⇒ the put-back of the aside copy fails (EIO). → what waits, what is said. */
async function crashScene(EDM, at, { failBack = false } = {}) {
  const S = {}; let stopped = false;
  const stop = () => { stopped = true; return new Promise(() => {}); }; // the process ends here: nothing after it runs
  const io = { rename: async (a, b) => {
    if (a.endsWith('/.next-linux-x64') && b.endsWith('/.next-linux-x64.prev')) { await fs.promises.rename(a, b); if (at === 'aside') return stop(); if (at === 'back') untrust(S.L); return undefined; }
    if (at === 'back' && a.endsWith('/.next-linux-x64.prev') && b.endsWith('/.next-linux-x64')) return stop();
    if (at === 'new' && a.endsWith('/.unpack-linux-x64') && b.endsWith('/.next-linux-x64')) return stop();
    return fs.promises.rename(a, b);
  } };
  const L = light(snapC, { EDM, inUse: () => true, io }); S.L = L;
  await L.ED.ready;
  const t0 = treeOf(L.plan.nextDir), by = L.rec().next ? L.rec().next.by : null;
  L.ED.installKernel(EID, { by: 'user', wait: true }).catch(() => {}); // never settles — VibeSpace stopped
  const halted = !!(await until(() => stopped, 4000));
  const left = { next: fs.existsSync(L.plan.nextDir), prev: treeOf(`${L.plan.nextDir}.prev`) === t0 };
  const eio = () => Object.assign(new Error('EIO: i/o error, rename'), { code: 'EIO' });
  const N = light(snapC, { EDM, dir: L.R, inUse: () => true, io: failBack ? { rename: async (a, b) => { if (a.endsWith('/.next-linux-x64.prev')) throw eio(); return fs.promises.rename(a, b); } } : null });
  await N.ED.ready;
  const boot = await N.ED.bootRestore();
  const due = await N.ED.kernelDue(EID);
  const row = await viewRow(keeperOver(N));
  return { at, failBack, halted, left, by, boot: boot.map((x) => (x.swept ? `swept:${x.swept.join('+')}` : JSON.stringify(x))), next: N.rec().next ? N.rec().next.version : null, kept: !!t0 && treeOf(N.plan.nextDir) === t0,
    prev: fs.existsSync(`${N.plan.nextDir}.prev`), place: N.receipt() === KSHA.k2 ? 'K2' : N.receipt(), discarded: N.rec().discarded ? N.rec().discarded.why : null, todos: N.todos.length,
    due: { due: due.due, staged: !!due.staged, sha: due.sha256 === KSHA.k3 ? 'K3' : due.sha256 || null }, lines: N.journal.filter((l) => /waiting kernel .* (was put back|was lost)|leftover kernel files/.test(l)), card: row ? BM.engineNote(row, tW) : null };
}
await leg('㉘ the only copy is never swept', async () => {
  const waits = `new kernel ${VER.k3} downloaded — it serves the next browser start`;
  for (const at of ['aside', 'back', 'new']) {
    const x = await crashScene(undefined, at);
    ok(x.halted && !x.left.next && x.left.prev && x.next === VER.k3 && x.kept && !x.prev && x.place === 'K2' && x.due.staged && !x.discarded
      && x.lines.some((l) => l.includes(`waiting kernel ${VER.k3} was put back beside its place`)) && String(x.card).endsWith(waits),
      `VibeSpace stops at «${at}» (K3 only as .next-<tag>.prev, the record still naming it) ⇒ the next boot puts K3 BACK at .next-<tag> byte for byte — never swept as a leftover; the record, kernelDue (staged) and the card agree: it waits`, x);
  }
  const y = await crashScene(undefined, 'aside', { failBack: true });
  ok(y.halted && y.next === null && !y.kept && !y.prev && y.discarded === 'lost' && y.due.due === true && y.due.sha === 'K3' && y.place === 'K2' && y.todos === (y.by === 'user' ? 0 : 1)
    && y.lines.some((l) => l.includes(`waiting kernel ${VER.k3} was lost`)) && !String(y.card).includes('serves the next browser start') && String(y.card).endsWith(`its new kernel ${VER.k3} was discarded — VibeSpace stopped while setting it beside its place`),
    `…and when that put-back FAILS the record stops naming it in the same run — rec.next cleared, the discard recorded (the card: «${String(y.card).replace(/^.* · its/, 'its')}»), kernelDue due again — never a record naming a folder that is gone`, y);
});

console.log('— ㉚ (r7 p1) «unreadable» is a third answer — nothing moves, nothing is recorded, on every road');
/** ㉘'s stop at 'aside' (K3 only as .next-<tag>.prev, the record naming it), then a fresh distribution over that data whose reads of
 *  the .prev's receipt answer EIO, every time — `road`: 'sweep' (the boot: its sweep — a browser on K2) · 'land' (a start's
 *  landNext, no browser — nothing else asked first) · 'stage' (a person's «Download kernel» of K3 again beside the running browser;
 *  the trust withdrawn as anything would be moved aside — the acceptance's variant: a refusal at the last ask). Then THE NEXT BOOT
 *  that reads it (no EIO). */
async function unreadAside(EDM, road) {
  let stopped = false;
  const stop = () => { stopped = true; return new Promise(() => {}); };
  const L = light(snapC, { EDM, inUse: () => true, io: { rename: async (a, b) => { if (a.endsWith('/.next-linux-x64') && b.endsWith('/.next-linux-x64.prev')) { await fs.promises.rename(a, b); return stop(); } return fs.promises.rename(a, b); } } });
  await L.ED.ready;
  const prev = `${L.plan.nextDir}.prev`, t0 = treeOf(L.plan.nextDir);
  L.ED.installKernel(EID, { by: 'user', wait: true }).catch(() => {}); // never settles — VibeSpace stopped
  const halted = !!(await until(() => stopped, 4000));
  let eios = 0, N = null;
  const eio = (what) => { eios++; return Object.assign(new Error(`EIO: i/o error, ${what}`), { code: 'EIO' }); };
  const io = { readFile: async (f, ...r) => { if (String(f).includes('/.next-linux-x64.prev/')) throw eio('read'); return fs.promises.readFile(f, ...r); },
    rename: async (a, b) => { if (road.startsWith('stage') && a.endsWith('/.next-linux-x64') && b.endsWith('/.next-linux-x64.prev')) untrust(N); return fs.promises.rename(a, b); } };
  N = light(snapC, { EDM, dir: L.R, inUse: () => road !== 'land', io });
  await N.ED.ready;
  const r = road === 'sweep' ? await N.ED.bootRestore() : road === 'land' ? await N.ED.landNext(EID) : await N.ED.installKernel(EID, { by: road === 'stage-fleet' ? 'fleet' : 'user', wait: true }).catch((e) => ({ threw: e && e.code }));
  const rec = N.rec(), due = await N.ED.kernelDue(EID);
  const out = { road, halted, eios, r: road === 'sweep' ? r.map((x) => (x.swept ? `swept:${x.swept.join('+')}` : JSON.stringify(x))) : r && typeof r === 'object' ? { staged: r.staged, kept: r.kept, threw: r.threw, discarded: r.discarded } : r,
    prev: treeOf(prev) === t0 ? 'byte for byte' : fs.existsSync(prev) ? 'changed' : 'gone', nextDir: fs.existsSync(N.plan.nextDir), unpack: fs.existsSync(N.plan.unpackDir),
    next: rec.next ? `${rec.next.version}${rec.next.sha256 === KSHA.k3 ? ':K3' : ''}` : null, discarded: rec.discarded ? rec.discarded.why : null, failure: rec.failure ? rec.failure.code : null, todos: N.todos.length,
    due: { due: due.due, staged: !!due.staged, untrusted: !!due.untrusted }, place: N.receipt() === KSHA.k2 ? 'K2' : N.receipt(),
    said: N.journal.filter((l) => l.includes(`waiting kernel ${VER.k3} could not be read beside its place now (EIO)`)).length,
    acted: N.journal.filter((l) => /was lost|not beside its place any more|leftover kernel files .*\.next-linux-x64\.prev|is downloaded \(sha256/.test(l)) };
  const row = await viewRow(keeperOver(N)); // r8 (s3): what the person reads meanwhile
  out.card = row ? BM.engineNote(row, tW) : null; out.unread = (N.ED.kernelFact(EID).next || {}).unread || null;
  if (road === 'sweep') { const fb = await N.ED.bootFleet().catch((e) => ({ threw: e && e.code })); out.fleet = { run: fb && (fb.threw || fb.outcome), view: N.ED.fleetView().kernel || null, line: BM.fleetPluginWords({ id: EID }, N.ED.fleetView(), tW).line, said: N.journal.filter((l) => l.includes('could not be read beside its place now')).length }; } // r8 (s3): the cluster's run, the Plugins line
  if (road === 'stage') { // r8 (s3): the person's download set in the free slot — then the next sweep, the .prev still unreadable
    out.nextSha = N.receipt(N.plan.nextDir) === KSHA.k3 ? 'K3' : N.receipt(N.plan.nextDir); out.by = rec.next ? rec.next.by : null;
    const sw = await N.ED.bootRestore();
    out.after = { swept: sw.filter((x) => x.swept).map((x) => x.swept.join('+')), prev: fs.existsSync(prev), nextSha: N.receipt(N.plan.nextDir) === KSHA.k3 ? 'K3' : null, next: N.rec().next ? N.rec().next.version : null,
      lines: N.journal.filter((l) => /leftover kernel files|stays beside its place until the next sweep/.test(l)) };
  }
  if (road.startsWith('stage')) return out; // (the cluster's: its trust withdrawn — the next boot's put-back is ㉘'s)
  const M = light(snapC, { EDM, dir: L.R, inUse: () => true });
  await M.ED.ready; await M.ED.bootRestore();
  out.healed = treeOf(M.plan.nextDir) === t0 && !fs.existsSync(prev) && M.rec().next && M.rec().next.sha256 === KSHA.k3;
  return out;
}
let U = null; // ㉚'s four scenes — ㉞ reads them too
await leg('㉚ unreadable is a third answer', async () => {
  U = await Promise.all(['sweep', 'land', 'stage-fleet', 'stage'].map((road) => unreadAside(undefined, road)));
  const [a, b, c] = U;
  const still = (x) => x.halted && x.eios >= 1 && x.prev === 'byte for byte' && x.next === `${VER.k3}:K3` && !x.discarded && !x.failure && !x.todos && x.place === 'K2' && x.said === 1 && !x.acted.length;
  ok(still(a) && a.due.staged && !a.r.some((o) => o.includes('.next-linux-x64.prev')) && a.healed,
    `the BOOT's sweep beside a .next-<tag>.prev whose receipt answers EIO keeps it byte for byte (swept only ${JSON.stringify(a.r)}) — rec.next untouched, kernelDue staged, ONE line; the next boot that reads it puts K3 back`, a);
  ok(still(b) && b.r === false && b.due.staged && b.healed,
    'a START\'s landNext (no browser runs) meeting it lands nothing and drops nothing — rec.next untouched (never «not beside its place any more»), kernelDue staged, ONE line; the start goes on with K2; the next boot puts K3 back', b);
  ok(still(c) && c.due.staged && c.r && c.r.staged === false && c.r.kept === 'EIO' && !c.r.discarded && c.unpack && !c.nextDir,
    'the CLUSTER\'s DOWNLOAD of K3 again beside the running browser stages nothing over it — the .prev never removed, the new download left where it is (.unpack-<tag>), nothing moved aside, nothing discarded or recorded, ONE line (r8: a person\'s download is ㉞\'s)', c);
});

console.log('— ㉛ (r7 p2) the not-whole window opens when the put-back is ASKED — a stat that hangs is a rename that hangs');
await leg('㉛ the put-back\'s stats are inside the window', async () => {
  const xs = await Promise.all(['removing', 'place'].map((hold) => putBackScene(undefined, null, { hold })));
  for (const x of xs) {
    ok(x.inPutBack && x.stillEmpty && x.s && x.s.threw === 'engine_kernel_landing' && x.s.msg.startsWith('the kernel is being replaced')
      && x.m && x.m.ok === false && x.m.code === 'engine_kernel_landing' && x.ran === 0 && x.measured === 'untouched'
      && !x.b.threw && !x.b.hung && Array.isArray(x.b.out) && x.b.out.includes(`${SECOND}:restored`) && !x.b.out.some((o) => o.startsWith(EID)) && x.second
      && x.i && x.i.threw === 'engine_kernel_landing' && !x.failure && !x.todos && !x.failedLine && x.a === true && x.place === 'K3',
      `the landing's put-back HANGS at its ${x.hold === 'removing' ? 'first stat (.removing-<tag>)' : 'second stat (the EMPTY place)'} ⇒ a start past its bound is refused by name (${x.s && x.s.ms} ms), the measure answers engine_kernel_landing (nothing run), the boot skips the id and puts the second engine back (${JSON.stringify(x.b.out)}), the fleet's download is refused with no failure recorded; once it answers K3 lands`, x);
  }
});

console.log('— ㉜ (r8 s1) the put-back gives three answers too — a landing that cannot read the place moves nothing and deletes nothing');
/** snapC with K2 moved ASIDE by an earlier landing (.removing-<tag>, the place EMPTY, the record's `aside`), K3 waiting, no browser:
 *  a start's landNext — its landing puts K2 back first and that put-back's stat of the EMPTY place answers EIO (`eios` starts, one
 *  EIO each); `how` 'eio' · 'untrust' (the trust withdrawn in that stat — the acceptance's scene) · 'stale' (the plan moved to K2 in
 *  that stat). Then THE NEXT READABLE RUN (a forced measure). */
async function unreadPlace(EDM, how, { eios = 1 } = {}) {
  let left = 0, N = null;
  const io = { stat: async (p) => { if (left > 0 && String(p).endsWith(`/${EID}/kernel/linux-x64`)) { left--; if (how === 'untrust') untrust(N); if (how === 'stale') replanTo('k2')(N); throw Object.assign(new Error('EIO: i/o error, stat'), { code: 'EIO' }); } return fs.promises.stat(p); } };
  N = light(snapC, { EDM, io, prep: ({ R, plan }) => {
    fs.renameSync(plan.targetDir, plan.removingDir); // an earlier landing stopped between its renames: K2 aside, the place EMPTY
    const f = path.join(R, 'browser-engines.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.engines[EID].aside = j.engines[EID].kernel; delete j.engines[EID].kernel; fs.writeFileSync(f, JSON.stringify(j));
  } });
  await N.ED.ready;
  const t0 = treeOf(N.plan.removingDir);
  left = eios;
  const r = [];
  for (let i = 0; i < eios; i++) r.push(await N.ED.landNext(EID).catch((e) => ({ threw: e && e.code })));
  const rec = N.rec(), at = (sha) => (sha === KSHA.k3 ? 'K3' : sha === KSHA.k2 ? 'K2' : sha || null);
  const out = { how, eios, r, stats: eios - left, aside: treeOf(N.plan.removingDir) === t0 ? 'byte for byte' : fs.existsSync(N.plan.removingDir) ? 'changed' : 'gone', place: at(N.receipt()),
    rec: { kernel: rec.kernel ? at(rec.kernel.sha256) : null, aside: rec.aside ? at(rec.aside.sha256) : null, next: rec.next ? rec.next.version : null },
    said: N.journal.filter((l) => l.includes('kernel place could not be read (EIO)')).length, acted: N.journal.filter((l) => /took its place|did not take its place|discarded|was put back/.test(l)) };
  const m = await N.ED.measure(EID, { force: true });
  const rec2 = N.rec();
  out.then = { m: m && (m.ok ? 'ok' : m.code), place: at(N.receipt()), kernel: rec2.kernel ? at(rec2.kernel.sha256) : null, aside: !!rec2.aside, removing: fs.existsSync(N.plan.removingDir), back: N.journal.some((l) => l.includes('previous kernel was put back in its place')) };
  return out;
}
await leg('㉜ the put-back\'s three answers on the landing road', async () => {
  const xs = await Promise.all([['eio', 2], ['untrust', 1], ['stale', 1]].map(([how, eios]) => unreadPlace(undefined, how, { eios })));
  for (const x of xs) {
    ok(x.stats === x.eios && x.r.every((v) => v === false) && x.aside === 'byte for byte' && x.place === null && x.rec.kernel === null && x.rec.aside === 'K2' && x.rec.next === VER.k3 && x.said === 1 && !x.acted.length
      && x.then.place === 'K2' && x.then.kernel === 'K2' && !x.then.aside && !x.then.removing && x.then.back,
      `the landing's put-back cannot read the EMPTY place (EIO${x.eios > 1 ? ` at ${x.eios} starts` : ''}${x.how === 'untrust' ? ', the trust withdrawn in that stat' : x.how === 'stale' ? ', the plan moved to K2 in that stat' : ''}) ⇒ NOTHING lands, moves or is deleted — .removing-<tag> byte for byte, rec.aside K2, rec.next ${VER.k3}, ONE line; the next readable run (a measure) puts K2 back`, x);
  }
});

console.log('— ㉝ (r8 s2) the sweep keeps a name only while it cannot tell');
/** snapC (K2 in its place, a browser on it, K3 named and WHOLE at .next-<tag>) + a copy of K2 left as .next-<tag>.prev (a staging
 *  whose last rm failed — «the next sweep removes it»); `eio`: .next-<tag>'s receipt answers EIO on every read. Then the boot. */
async function dupAside(EDM, { eio = false } = {}) {
  const io = eio ? { readFile: async (f, ...r) => { if (String(f).includes('/.next-linux-x64/')) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return fs.promises.readFile(f, ...r); } } : null;
  const N = light(snapC, { EDM, inUse: () => true, io, prep: ({ plan }) => fs.cpSync(plan.targetDir, `${plan.nextDir}.prev`, { recursive: true }) });
  await N.ED.ready;
  const prev = `${N.plan.nextDir}.prev`, t0 = treeOf(N.plan.nextDir), p0 = treeOf(prev);
  const r = await N.ED.bootRestore();
  return { eio, swept: r.filter((x) => x.swept).map((x) => x.swept.join('+')), prev: treeOf(prev) === p0 ? 'kept' : fs.existsSync(prev) ? 'changed' : 'gone', next: treeOf(N.plan.nextDir) === t0 ? 'whole' : 'changed',
    rec: N.rec().next ? N.rec().next.version : null, place: N.receipt() === KSHA.k2 ? 'K2' : N.receipt(), lines: N.journal.filter((l) => /leftover kernel files|could not be read beside its place now/.test(l)) };
}
await leg('㉝ the sweep\'s keep-list is healAside\'s answer', async () => {
  const [a, b] = await Promise.all([dupAside(undefined), dupAside(undefined, { eio: true })]);
  ok(a.swept.length === 1 && a.swept[0] === '.next-linux-x64.prev' && a.prev === 'gone' && a.next === 'whole' && a.rec === VER.k3 && a.place === 'K2' && a.lines.length === 1 && a.lines[0].includes('leftover kernel files the record does not name were removed (.next-linux-x64.prev)'),
    'a copy left as .next-<tag>.prev beside the named K3 WHOLE at .next-<tag> (its receipt read) is a duplicate ⇒ the boot\'s sweep removes it, ONE line — K3 and the record untouched', a);
  ok(!b.swept.length && b.prev === 'kept' && b.next === 'whole' && b.rec === VER.k3 && b.lines.length === 1 && b.lines[0].includes(`waiting kernel ${VER.k3} could not be read beside its place now (EIO)`),
    '…the same with .next-<tag>\'s receipt answering EIO ⇒ healAside cannot tell — BOTH names kept, ONE line', b);
});

console.log('— ㉞ (r8 s3) an unknown is said where the person looks — the card, the Plugins line, the person\'s download');
await leg('㉞ the card says it; the person\'s download fetches it again', async () => {
  const [a, b, c, d] = U;
  const unreadWords = `the waiting kernel ${VER.k3} could not be read (EIO) — it is kept beside its place and asked again at the next start`;
  ok([a, b, c].every((x) => x.unread === 'EIO' && String(x.card).endsWith(` · ${unreadWords}`) && !String(x.card).includes('serves the next browser start')),
    `under ㉚'s unknown (the boot's sweep · a start · the cluster's download) the engine card read through the keeper says «${unreadWords}» — never «it serves the next browser start» while every start runs K2`, [a, b, c].map((x) => ({ road: x.road, unread: x.unread, card: x.card })));
  const fl = a.fleet || {};
  ok(fl.run === 'same' && fl.view && fl.view.state === 'staged' && fl.view.unread === 'EIO' && fl.said === 1 && fl.line === `The cluster's plugin ${EID}: its waiting kernel ${VER.k3} could not be read (EIO) — it is kept beside its place and asked again at the next start`,
    'the cluster\'s run over the same unknown (its own sweep asks again — still ONE line): the Plugins panel\'s fleet line (fleetView → fleetPluginWords) says the same of the cluster\'s waiting kernel', fl);
  ok(d.halted && d.said === 1 && d.r && d.r.staged === true && !d.r.kept && d.prev === 'byte for byte' && d.nextDir && d.nextSha === 'K3' && !d.unpack && d.next === `${VER.k3}:K3` && d.by === 'user'
    && !d.discarded && !d.failure && d.due.staged && !d.unread && String(d.card).endsWith(`new kernel ${VER.k3} downloaded — it serves the next browser start`)
    && d.after.swept.length === 1 && d.after.swept[0] === '.next-linux-x64.prev' && !d.after.prev && d.after.nextSha === 'K3' && d.after.next === VER.k3 && d.after.lines.length === 2,
    'a PERSON\'s «Download kernel» under that unknown is set in the free slot — the unread .prev untouched (byte for byte), rec.next the new K3, the card says it waits again; the next sweep, the .prev STILL unreadable, removes it as a duplicate of K3 whole at .next-<tag>', d);
});

console.log('— ㉙ (r6 n5) the refusal in the person\'s language — Browse yourself and the build doors');
await leg('㉙ the refusal\'s words', async () => {
  const HB = require('../src/browser-human.js');
  const dict = { en: null, zh: (await import('../src/lib/i18n-zh.js')).default, ja: (await import('../src/lib/i18n-ja.js')).default };
  const tOf = (d) => (s, p) => tW(d && Object.prototype.hasOwnProperty.call(d, s) ? d[s] : s, p);
  const want = { en: 'The browser kernel is being replaced — try again in a moment.', zh: '浏览器内核正在替换——请稍后再试。', ja: 'ブラウザのカーネルを置き換え中です。しばらくしてからもう一度お試しください。' };
  const got = Object.fromEntries(Object.keys(want).map((l) => [l, { human: HB.humanRefusalText('engine_kernel_landing', {}, tOf(dict[l])), build: BM.buildRefusalWords({ code: 'engine_kernel_landing' }, tOf(dict[l])) }]));
  ok(Object.keys(want).every((l) => got[l].human === want[l] && got[l].build === want[l]),
    'engine_kernel_landing worded on the client by code — humanRefusalText (Browse yourself) and buildRefusalWords (Change build…, New profile…) — in en / zh / ja', got);
});

// ═══ RED CONTROLS — each a patched copy, each the leg it breaks ═══
console.log('— RED controls');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const swap = (src, a, b, what) => { if (!src.includes(a)) throw new Error(`control anchor missing (${what}): ${a.slice(0, 80)}`); return src.replace(a, b); };
const MC = mutantCopies('engine-distribution', REPO);
const EDsrc = read('src/server/engine-distribution.js'), LDsrc = read('src/server/plugin-loader.js');
// the sweep's names kept while the record names a waiting kernel — r8 (s2): the .prev only while healAside cannot tell (the tip) ·
// r7: both, always · r6 and before: one
const KEEPU = 'const keep = rec.next ? [path.basename(plan.nextDir), ...(h.unknown ? [`${path.basename(plan.nextDir)}.prev`] : [])] : [];';
const KEEP2 = 'const keep = rec.next ? [path.basename(plan.nextDir), `${path.basename(plan.nextDir)}.prev`] : [];', KEEP1 = 'const keep = rec.next ? [path.basename(plan.nextDir)] : [];';
const bootA = { boot: { relayUrl: '', browserEngine: engineAt(shaA) } };
async function pinMoves(Q) { await Q.ED.bootFleet(); const rel = Q.holdGit(); Q.writeFleet({ relayUrl: '', browserEngine: engineAt(shaB) }); return rel; }
await leg('M1', async () => { // M1 — the trust kept at the old sha
  const LM = MC.load('src/server/plugin-loader.js', swap(LDsrc, 'inst.sha === f.ref && t.sha === f.ref && ', '', 'D2 sha'), 'trust-old-sha');
  const Q = await pod('m1', { LM, ...bootA }); const rel = await pinMoves(Q);
  await until(() => Q.gate.inflight === 1);
  const kept = Q.row().install.sha === shaA && Q.row().trusted === true;
  rel(); await settled(Q); Q.close();
  ok(kept, 'control M1: a loader whose D2 forgets the sha keeps the OLD package trusted after the cluster\'s pin moved — exactly what ② refuses (RED)');
});
await leg('M2', async () => { // M2 — no listener: the base's shape (a new pin waits for a restart)
  const EDM = MC.load('src/server/engine-distribution.js', swap(EDsrc, 'const off = presets.onChange(() => { fleetChanged().catch(() => {}); });', 'const off = () => {};', 'listener'), 'no-listener');
  const Q = await pod('m2', { EDM, ...bootA }); const rel = await pinMoves(Q); rel();
  const r0 = Q.gate.refs.length;
  const seen = await until(() => Q.presets.fleet().browserEngine.source.ref === shaB); // the reader HAS the new pin…
  await sleep(100); // …and nothing acts on it (with the listener the install is asked within milliseconds of the reader's change)
  const asked = Q.gate.refs.length > r0 || Q.row().install.sha === shaB;
  Q.close();
  ok(!!seen && !asked, 'control M2: with no presets listener (the base\'s shape) the pin change installs nothing until a restart — ② RED');
});
await leg('M3', async () => { // M3 — two runs in parallel
  const EDM = MC.load('src/server/engine-distribution.js', swap(EDsrc, 'if (fleetRun) { fleetAgain = true; return fleetRun; }', '', 'single flight'), 'parallel');
  const Q = await pod('m3', { EDM, ...bootA }); const rel = await pinMoves(Q);
  await until(() => Q.gate.inflight === 1);
  const r0 = Q.gate.refs.length;
  // r4: the cluster's install holds the landing's ONE lock, so two runs' installs never overlap — the second run is seen by what it
  // DOES: two changes while the first run is held ⇒ two more runs beside it ⇒ TWO more installs (each reading the pin it finds — the
  // tag the single flight skips, or the latest pin twice: a re-pull); the single flight takes them as ONE re-run (③)
  Q.writeFleet({ relayUrl: '', browserEngine: engineAt('v0.1.2') }); await until(() => Q.presets.fleet().browserEngine.source.ref === 'v0.1.2'); await sleep(60);
  Q.writeFleet({ relayUrl: '', browserEngine: engineAt(shaC) }); await until(() => Q.presets.fleet().browserEngine.source.ref === shaC); await sleep(60);
  rel();
  await until(() => Q.gate.refs.length - r0 >= 2 && !Q.gate.inflight, 3000); await sleep(200); await settled(Q);
  const refs = Q.gate.refs.slice(r0); Q.close();
  ok(refs.length >= 2, 'control M3: without the single flight two changes during a held run start two MORE runs beside it — two more installs (r4: queued behind the lock, each reading the pin it finds) where ③ allows ONE — ③ RED', { refs: refs.map(short) });
});
await leg('M4', async () => { // M4 — a kernel swapped under a running browser (a light scene over ⑦'s place: K2 in it, K3 planned)
  const EDM = MC.load('src/server/engine-distribution.js', swap(EDsrc, "    if (await inUse(sid, plan)) return 'a browser runs the current kernel';\n", '', 'in use'), 'swap-running'); // r6: placeBusy — onPlace's and landDir's one question
  const run = async (M) => { const L = light(snapC, { EDM: M, inUse: () => true, prep: noNext }); const r = await L.ED.installKernel(EID, { by: 'fleet', wait: true }); return { staged: !!(r && r.staged), place: L.receipt() === KSHA.k2 ? 'K2' : L.receipt() === KSHA.k3 ? 'K3' : L.receipt() }; };
  const good = await run(undefined), bad = await run(EDM);
  ok(good.staged && good.place === 'K2' && !bad.staged && bad.place === 'K3', 'control M4: without the in-use check the new kernel replaces the one a browser is running — ⑦ RED; the real one waits beside it', { good, bad });
});
await leg('M5', async () => { // M5 — the tip's kernel step for an untrusted package (no cluster-trust gate, no trust check in kernelDue / installKernel)
  let s = swap(EDsrc, 'if (!clusterTrusts(id)) {', 'if (false) {', 'fleet gate');
  s = swap(s, "    if (trustOf(sid) !== true) return { due: false, untrusted: true };\n", '', 'due gate');
  s = swap(s, "    if (trustOf(sid) === false) throw named('engine_untrusted'", "    if (false) throw named('engine_untrusted'", 'install gate');
  const EDM = MC.load('src/server/engine-distribution.js', s, 'untrusted-kernel');
  const run = async (M) => { const h = k2hits(); const L = light(snapA, { EDM: M }); await L.ED.syncFleet('change'); return { fetched: k2hits() - h, place: L.receipt() === KSHA.k1 ? 'K1' : L.receipt(), measured: (L.rec().measured || {}).version || null, judged: L.journal.some((l) => l.includes('downloaded for a package no longer trusted — discarded, never landed')) }; };
  const good = await run(undefined), bad = await run(EDM);
  ok(good.fetched === 0 && good.place === 'K1' && bad.fetched === 1,
    'control M5: the tip\'s kernel step over ⑤\'s tag (preinstall on) FETCHES the untrusted K2 — ⑤ RED (r3: the landing\'s judge still keeps it out of K1\'s place — a second line, never the first); the same scene with the real module fetches nothing', { good, bad });
});
await leg('M6', async () => { // M6 — the tip's landNext: the waiting kernel never compared with the plan
  const EDM = MC.load('src/server/engine-distribution.js', swap(swap(EDsrc, 'const lv = await landingVerdict(sid, rec.next.sha256);', "const lv = trustOf(sid) === true ? { ok: true } : { ok: false, why: 'untrusted' };", 'plan check'), 'const no = await landDir(sid, plan, plan.nextDir, rec.next.sha256);', 'const no = await landDir(sid, plan, plan.nextDir);', 'plan check in the section'), 'stale-lands');
  const back = { ...trustedAt(shaC), prep: ({ R }) => fs.writeFileSync(path.join(R, 'plugins', EID, 'kernel.json'), JSON.stringify(kernelJson('k3'))) };
  const run = async (M) => { const L = light(snapB, { EDM: M, ...back }); const l = await L.ED.landNext(EID); return { l, place: L.receipt(), dir: fs.existsSync(L.plan.nextDir) }; };
  const good = await run(undefined), bad = await run(EDM);
  ok(good.l === false && good.place === KSHA.k3 && !good.dir && bad.l === true && bad.place === KSHA.k2,
    'control M6: the tip\'s landNext over ⑧\'s pin back lands the WITHDRAWN K2 at the next start — ⑧ RED; the real one discards it', { good, bad });
});
await leg('M7', async () => { // M7 — no critical section: a landing in flight answers false at once, a start does not wait, a landing ignores the holds
  let s = swap(EDsrc, '    if (!g.landing && (g.holds > 0 || await inUse(sid, plan))) return false;', '    if (g.landing || g.writers) return false;', 'busy answers false');
  s = swap(s, '    while (g.landing) { if (!(await waitLanding(sid, g.landing, a))) break; }', '    while (false) { /* no wait */ }', 'start waits');
  s = swap(s, "    if (g.landing && g.torn) throw named('engine_kernel_landing',", "    if (false) throw named('engine_kernel_landing',", 'r4: no refusal either'); // r4: the shape M7 stands for had neither the wait nor the refusal
  s = swap(s, "    if (g.holds > 0) return heldWords(g);\n    if (await inUse(sid, plan)) return 'a browser runs the current kernel';\n    return g.holds > 0 ? heldWords(g) : g.taken !== t0 ?", "    if (await inUse(sid, plan)) return 'a browser runs the current kernel';\n    return false ? heldWords(g) : false ?", 'landing ignores holds'); // r6: placeBusy — onPlace's and landDir's one question: the shape M7 stands for asked no hold anywhere
  const EDM = MC.load('src/server/engine-distribution.js', s, 'no-critical-section');
  const slow = { ms: 0 };
  const io = { rename: async (a, b) => { if (slow.ms && a.endsWith('/.next-linux-x64')) await sleep(slow.ms); return fs.promises.rename(a, b); } };
  const L = light(snapC, { EDM, io }); slow.ms = 120;
  const A = L.ED.landNext(EID);
  await until(() => !fs.existsSync(L.plan.targetDir), 1000);
  const b = await (async () => { const l = await L.ED.landNext(EID); const rel = typeof L.ED.holdPlace === 'function' ? await L.ED.holdPlace(EID, { leaseMs: 0 }) : () => {}; const r = L.receipt(); rel(); return { l, r }; })();
  await A;
  const L2 = light(snapC, { EDM });
  const rel = await L2.ED.holdPlace(EID, { leaseMs: 0 }); const land = L2.ED.landNext(EID); await sleep(80); const during = L2.receipt(); rel(); await land;
  ok(b.l === false && b.r === null && during === KSHA.k3, 'control M7: with no critical section the second start finds the place EMPTY mid-landing (it would spawn nothing — or the kernel about to be deleted) and a landing swaps the kernel under a start that holds it — ⑨ RED', { b, during: during === KSHA.k3 ? 'K3' : during });
});
if (SLEEP) await leg('M8', async () => { // M8 — the tip's in-use check: the place not realpath'd (a), an unreadable exe read as «not in use» (b)
  const EDMa = MC.load('src/server/engine-distribution.js', swap(EDsrc, 'const heads = [...new Set([`${real}/`, `${plan.targetDir}/`])];', 'const heads = [`${plan.targetDir}/`];', 'real path'), 'not-canonical');
  const EDMb = MC.load('src/server/engine-distribution.js', swap(EDsrc, "        if (!e || (e.code !== 'EACCES' && e.code !== 'EPERM')) return null;\n", "        return '';\n", 'fail open'), 'fail-open');
  const a = await procScene(EDMa, { link: true });
  const la = await a.L.ED.landNext(EID), alive = a.k.exitCode === null; await ended(a.k);
  const b = await procScene(EDMb, { link: false }); b.deny.exe = b.k.pid;
  const lb = await b.L.ED.landNext(EID); await ended(b.k);
  const c = await procScene(undefined, { link: false }); c.deny.exe = c.k.pid;
  const lc = await c.L.ED.landNext(EID); await ended(c.k);
  ok(la === true && alive && a.L.receipt() === KSHA.k3 && lb === true && b.L.receipt() === KSHA.k3 && lc === false && c.L.receipt() === KSHA.k2,
    'control M8: (a) the place compared un-realpath\'d ⇒ K3 lands under the program run through the symlinked data/; (b) EACCES read as «not in use» ⇒ K3 lands under it — ⑩ RED; the real check keeps it waiting', { la, lb, lc });
});
await leg('M9', async () => { // M9 — a discard that keeps the folder (the tip's) and no sweep
  let s = swap(EDsrc, "    await fsp.rm(plan.nextDir, { recursive: true, force: true }).catch((e) => log.warn?.(`[browser] the waiting kernel at ${plan.nextDir} could not be deleted", "    if (false) await fsp.rm(plan.nextDir, { recursive: true, force: true }).catch((e) => log.warn?.(`[browser] the waiting kernel at ${plan.nextDir} could not be deleted", 'discard rm');
  s = swap(s, '      try { const gone = await sweepLeftovers(id, plan);', '      try { const gone = []; if (false) await sweepLeftovers(id, plan);', 'sweep');
  const o = await orphanScenes(MC.load('src/server/engine-distribution.js', s, 'orphans'));
  ok(o.aDir && o.bLeft && o.bLeft.length === 3, 'control M9: a discard that keeps .next-<tag> and a boot with no sweep leave every orphan on the disk (a whole kernel each in production) — ⑪ RED', o);
});
await leg('M10', async () => { // M10 — the r2 install landing: no judge on the install road
  let s = swap(EDsrc, "      const lv = await landingVerdict(sid, sha);\n      if (!lv.ok && lv.why !== 'unread') return discardDownload(sid, plan, kfact, lv);\n", '      const lv = { ok: true };\n', 'install judge');
  s = swap(s, 'const no = await landDir(sid, plan, plan.unpackDir, sha);', 'const no = await landDir(sid, plan, plan.unpackDir);', 'install judge in the section');
  const bad = await inFlight(MC.load('src/server/engine-distribution.js', s, 'install-unjudged'), untrust);
  ok(bad.place === 'K2' && bad.kernel === VER.k2 && !bad.r.discarded,
    'control M10: the r2 install road (no judge) over ⑫\'s scene lands the K2 whose trust was withdrawn mid-download in K3\'s place — ⑫ RED; the real one discards it (r4: the measure, asking trust now, no longer runs it either)', bad);
});
await leg('M11', async () => { // M11 — the r2 onPlace order: a landing waits for the starts' holds BEFORE it asks whether a browser runs the kernel
  let s = swap(EDsrc, '    if (!g.landing && (g.holds > 0 || await inUse(sid, plan))) return false;', '', 'possible first');
  s = swap(s, '    const busy = await placeBusy(sid, plan);\n    if (busy) return fn(false, busy);', "    for (const t0 = Date.now(); g.holds > 0 && Date.now() - t0 < 200;) await new Promise((r) => setTimeout(r, 20));\n    if (g.holds > 0) { log.warn?.(`[browser] ${who(sid)}: a browser start held its kernel's place for 0.2 s — the new kernel waits beside it`); return fn(false); }\n    if (await inUse(sid, plan)) return fn(false);", 'onPlace order');
  const bad = await startsBeside(MC.load('src/server/engine-distribution.js', s, 'holds-first'));
  ok(bad.b.landed === false && bad.lines.length >= 1 && bad.c.ms >= 300,
    `control M11: the r2 order (a landing waits for every start's hold — here its bound cut to 0.2 s — before it asks whether a browser runs the kernel) makes the starts queue behind each other: C waited for B's wait and its own (${bad.b.ms} / ${bad.c.ms} ms, ${bad.lines.length} lines) though nothing can land — ⑬ RED`, bad);
});
await leg('M12', async () => { // M12 — a read error taken for «gone» (r2: readJson's null / undefined)
  const bad = await unreadable(MC.load('src/server/engine-distribution.js', swap(EDsrc, '        if (rv.error) {', '        if (false) {', 'transient'), 'read-error-gone'));
  ok(!bad.next && !bad.dir && bad.gone && bad.place === 'K2',
    'control M12: a read error taken for «gone» deletes the verified waiting kernel and its record (a whole download again) — ⑭ RED', bad);
});
const BMsrc = read('src/lib/browser-build-model.js');
const bmMutant = async (src, tag) => import(pathToFileURL(MC.write('src/lib/browser-build-model.js', src, tag, { esm: true })).href);
await leg('M13', async () => { // M13 — the r2 other-id: the kernel step's consent words, the model with no words of its own
  const EDM = MC.load('src/server/engine-distribution.js', swap(EDsrc, "    if (fleetLast.outcome === 'other-id') {", '    if (false) {', 'other-id step'), 'other-id-consent');
  let b = swap(BMsrc, '    else if (other) line = other;\n', '', 'other line');
  b = swap(b, '  } else if (p && other && (p.id === f.plugin || p.id === f.got)) fact = other;\n  else if (p && consent', '  } else if (p && consent', 'other fact');
  const bad = await otherScene(EDM, await bmMutant(b, 'other-id-words'));
  ok(/waiting for your consent/.test(String(bad.line)) && /waiting for your consent/.test(String(bad.fact)) && /waits for your consent/.test(String(bad.boot)),
    'control M13: the r2 other-id says «waiting for your consent — its kernel is not fetched» on the panel, the row and the boot line for a package that is not even installed — ⑮ RED', bad);
});
await leg('M14', async () => { // M14 — the r2 tag line: blind to trust
  const b = swap(BMsrc, "    else if (f.outcome === 'unpinned' && f.trusted === true) line =", "    else if (false) line =", 'tag line');
  const bad = await tagScene(await bmMutant(b, 'tag-blind'));
  ok(bad.after === `The cluster names ${EID} at «v0.1.2» — not a full commit sha, so the cluster does not trust it; review it and enable it in ⚙ → Plugins → ${EID}`,
    'control M14: a tag line blind to trust still tells the owner to enable what they just enabled — ⑯ RED', bad);
});
await leg('M15', async () => { // M15 — the r3 order: the judge asked before the in-use scan only (none inside the section)
  let s = swap(EDsrc, '    let no = sha256 ? landingRefusal(sid, await landingVerdict(sid, sha256)) : null; // nothing moved yet', '    let no = null;', 'judge before the move');
  s = swap(s, '    if (sha256) no = landingRefusal(sid, await landingVerdict(sid, sha256)); // LAST — the rename below is issued in this same turn', '', 'judge last');
  const EDM = MC.load('src/server/engine-distribution.js', s, 'judge-stale');
  const a = await inSection(EDM, 'install', untrust), b = await inSection(EDM, 'wait', untrust);
  ok(a.place === 'K2' && !a.r.discarded && b.r.landed === true && b.place === 'K3',
    'control M15: the r3 order (the verdict taken BEFORE the in-use scan, nothing asked after it) lands the withdrawn package\'s kernel on both roads — the acceptance\'s probe; ⑫ r4 RED', { a: { place: a.place, discarded: a.r.discarded }, b: { landed: b.r.landed, place: b.place } });
});
await leg('M16', async () => { // M16 — a measure blind to trust (the r3 measure)
  const bad = await measureUntrusted(MC.load('src/server/engine-distribution.js', swap(EDsrc, '      if (trustOf(sid) !== true) {\n        if (!untrustedRunSaid.has(sid))', '      if (false) {\n        if (!untrustedRunSaid.has(sid))', 'measure trust'), 'measure-blind'));
  ok(bad.ran === 1 && bad.r.ok === true, 'control M16: a measure blind to trust RUNS the untrusted package\'s kernel (`--version`) — ⑫ r4 RED', bad);
});
await leg('M17', async () => { // M17 — the cluster's install outside the lock
  const bad = await lockScene(MC.load('src/server/engine-distribution.js', swap(EDsrc, 'const r = await planWrite(id, () => l.install({', 'const r = await (async (x) => x())(() => l.install({', 'plan write'), 'unlocked-install'));
  ok(bad.l === true && bad.during === 'K3', 'control M17: the cluster\'s install of the package outside the lock lets a landing land WHILE the plan is written — ⑫ r4 RED', bad);
});
const Ksrc = read('src/server/browser-keeper.js');
await leg('M18', async () => { // M18 — the r3 keeper: a hand-copied kernel fact
  const KM = MC.load('src/server/browser-keeper.js', swap(Ksrc, 'kernel: { ...k } };', 'kernel: { state: k.state, step: k.step, bytes: k.bytes, total: k.total, code: k.code, error: k.error, node: k.node, need: k.need, credential: k.credential || null, next: k.next || null } };', 'whole fact'), 'hand-copied');
  const a = await landingScene(KM), b = await wholeFact(KM);
  ok(a.waiting && !a.during && !/waiting for the new kernel to land/.test(String(a.card)) && b.missing.includes('landing') && b.missing.includes('discarded'),
    'control M18: the r3 keeper\'s hand-copied kernel fact drops `landing` (and r4\'s `discarded`) — the card never says «waiting for the new kernel to land» on any surface while a start waits — ⑬ RED', { card: a.card, missing: b.missing });
});
await leg('M19', async () => { // M19 — 'unread' discarded on the install road (r3)
  const bad = await unreadPlan(MC.load('src/server/engine-distribution.js', swap(EDsrc, "      if (!lv.ok && lv.why !== 'unread') return discardDownload(sid, plan, kfact, lv);", '      if (!lv.ok) return discardDownload(sid, plan, kfact, lv);', 'unread kept'), 'unread-discards'));
  ok(bad.discarded === 1 && bad.place === 'K3' && !bad.landed, 'control M19: an unreadable plan at the landing taken as a refusal DISCARDS the verified download (and the run queues nothing) — ⑰ RED', bad);
});
await leg('M20', async () => { // M20 — a discard with no trace (r3)
  const t = "    const rec = recOf(sid), by = kfact.by || 'user';\n";
  const a0 = EDsrc.indexOf(t), a1 = EDsrc.indexOf('    await save();\n', a0);
  if (a0 < 0 || a1 < 0) throw new Error('control anchor missing (discard trace)');
  const bad = await discardTrace(MC.load('src/server/engine-distribution.js', EDsrc.slice(0, a0) + EDsrc.slice(a1), 'no-trace'));
  ok(!bad.fleet.rec && !bad.fleet.todos.length && !/discarded/.test(String(bad.fleet.card)) && !/discarded/.test(String(bad.user.card)),
    'control M20: a discard with no trace (r3) leaves the record, the card and For-you silent — ⑱ RED', bad);
});
await leg('M21', async () => { // M21 — the r3 boot line
  const a0 = EDsrc.indexOf('const DISCARD_WORDS = '), a1 = EDsrc.indexOf('\nmodule.exports = ');
  if (a0 < 0 || a1 < 0) throw new Error('control anchor missing (bootLine)');
  const R3 = "function bootLine(r) {\n  if (!r || !r.plugin) return null;\n  const k = r.kernel;\n  const kw = !k ? '' : k.ok === false ? `not downloaded [${k.code}]` : k.otherId ? `none — the cluster's repository holds another plugin («${k.otherId}»), not ${r.plugin}; there is nothing to consent to` : k.untrusted ? 'not fetched — it waits for your consent' : 'ready';\n  return `[plugins] the fleet's engine plugin ${r.plugin}: ${r.outcome}${kw ? ` · kernel ${kw}` : ''}`;\n}\n";
  const got = bootWords(MC.load('src/server/engine-distribution.js', EDsrc.slice(0, a0) + R3 + EDsrc.slice(a1), 'boot-ready'));
  ok(got.slice(0, 4).every((l) => /· kernel ready$/.test(l)), 'control M21: the r3 boot line says «kernel ready» for a kernel only due, waiting beside the place, discarded, or trusted by the owner only — ⑲ RED', got.slice(0, 4));
});
await leg('M22', async () => { // M22 — the judge without its sha comparison (the acceptance's r3 (d): no control isolated it)
  const bad = await inFlight(MC.load('src/server/engine-distribution.js', swap(EDsrc, "      if (!p || p.sha256 !== sha256) return { ok: false, why: 'stale', p };\n", '', 'judge sha'), 'judge-no-sha'), replan);
  ok(bad.place === 'K2' && !bad.r.discarded, 'control M22: the judge without its sha comparison lands K2 although the plan moved to K3 mid-download — ⑫ «the plan moved» RED', bad);
});
await leg('M23', async () => { // M23 — the r4 hold: past its bound a start goes on beside a landing still in progress
  const bad = await halfLanded(MC.load('src/server/engine-distribution.js', swap(EDsrc, "    if (g.landing && g.torn) throw named('engine_kernel_landing',", "    if (false) throw named('engine_kernel_landing',", 'half-landed refusal'), 'goes-on'));
  ok(bad.B.proceeded === true && bad.B.empty === true, 'control M23: a start that goes on past its bound takes its hold and SPAWNS beside the EMPTY, half-landed place — ⑳ RED', bad.B);
});
await leg('M24', async () => { // M24 — judgeNow without its 'moved' branch
  const EDM = MC.load('src/server/engine-distribution.js', swap(EDsrc, "  const judgeNow = (sid, lv) => (trustOf(sid) !== true ? 'untrusted' : planKeyOf(sid) !== lv.key ? 'moved' : null);", "  const judgeNow = (sid, lv) => (trustOf(sid) !== true ? 'untrusted' : null);", 'moved branch'), 'no-moved');
  const a = await movingPlan(EDM, 'install'), b = await movingPlan(EDM, 'wait');
  ok(a.place === 'K2' && !a.r.discarded && b.r.landed === true && b.place === 'K3', 'control M24: judgeNow without its \'moved\' branch lands the kernel of a plan whose inputs moved under the verdict, on both roads — ㉑ RED', { a: { place: a.place, discarded: a.r.discarded }, b: { landed: b.r.landed, place: b.place } });
});
await leg('M25', async () => { // M25 — the r4 staging order: the waiting kernel deleted before the judge is asked
  const bad = await refusedStaging(MC.load('src/server/engine-distribution.js', swap(EDsrc, '    await ask();\n    let no = refusal(); // FIRST — nothing beside the place is touched yet\n    if (no) return { refused: no };\n', '    await fsp.rm(plan.nextDir, { recursive: true, force: true });\n    await ask();\n    let no = null;\n', 'judge first'), 'staging-order'), 'scan');
  // …and the r4 card (the waiting kernel's words INSTEAD of the discard's) over the real scene's row
  const good = await refusedStaging(undefined, 'scan');
  const BM4 = await bmMutant(swap(BMsrc, "  const verified = (e.integrity && e.integrity.verified === true ? ' · ' + t(i18nKey('verified')) : '') + (k && k.landing ? ' · ' + t(i18nKey('waiting for the new kernel to land (≤ {s} s)'), { s: String(k.landing.waitS) }) : kept + gone);", "  const verified = (e.integrity && e.integrity.verified === true ? ' · ' + t(i18nKey('verified')) : '') + (k && k.landing ? ' · ' + t(i18nKey('waiting for the new kernel to land (≤ {s} s)'), { s: String(k.landing.waitS) }) : kept || gone);", 'card both'), 'card-hides-discard');
  const card4 = good.row ? BM4.engineNote(good.row, tW) : null;
  ok(bad.r.discarded === 'untrusted' && bad.next === VER.k3 && !bad.kept && !/discarded/.test(String(card4)),
    `control M25: the r4 staging order (the folder of the kernel already waiting removed BEFORE the judge) deletes the verified K3 on a lapsed trust while its record still advertises it; the r4 card hides the discard behind the waiting kernel («${card4}») — ㉒ RED`, { kept: bad.kept, next: bad.next, card4 });
});
await leg('M26', async () => { // M26 — the refusal keyed on the whole landing (the amend's)
  const EDM = MC.load('src/server/engine-distribution.js', swap(EDsrc, "    if (g.landing && g.torn) throw named('engine_kernel_landing',", "    if (g.landing) throw named('engine_kernel_landing',", 'torn'), 'landing-keyed');
  const x = await cleanupScene(EDM), y = await heldScene(EDM);
  ok(x.B.threw === 'engine_kernel_landing' && y.B.threw === 'engine_kernel_landing',
    'control M26: the refusal keyed on the whole landing refuses a start while the previous kernel is only being DELETED (K3 whole in its place) and one before anything moved — ㉓ RED', { cleanup: x.B, held: y.B });
});
await leg('M27', async () => { // M27 — a landing that moves a held place
  const bad = await heldScene(MC.load('src/server/engine-distribution.js', swap(EDsrc, "    const busy = await placeBusy(sid, plan);\n    if (busy) return { ok: false, why: 'held', by: busy };\n", '', 'held'), 'moves-held')); // r6: the check re-anchored (placeBusy)
  ok(bad.B.proceeded && bad.under === 'K3', 'control M27: a landing that does not ask for a hold before its first rename moves K2 out from under a start that holds it (K3 lands under the hold) — ㉓ RED', bad);
});
await leg('M28', async () => { // M28 — a start's ask that waits behind a plan write (the amend's)
  const bad = await cloneScene(MC.load('src/server/engine-distribution.js', swap(EDsrc, '      else if (g.planning) { mine = false; prev.then(done); return LATE; }\n', '', 'plan write'), 'waits-behind-clone'));
  ok(bad.l === false && !!bad.card && bad.card.waitS === bad.bound / 1000 && bad.said.some((l) => l.includes('waits for the new kernel to land')) && bad.said.some((l) => l.includes('waits no longer')) && bad.ms >= bad.bound / 2,
    `control M28: a start's ask with no plan-write check WAITS in the writer queue behind the git clone — said («waits for the new kernel to land», then «waits no longer»), the card's «waiting for the new kernel to land (≤ ${bad.bound / 1000} s)» — and gives up at its bound (${bad.ms} ms) while nothing lands — ㉔ RED`, bad);
});
// r7: the scene controls M29–M37 run AT ONCE (each its own data dir, its own copy) — the suite stays in the fast tier
const ctl = [];
ctl.push(leg('M29', async () => { // M29 — the measure without its step-aside
  const bad = await stepsAside(MC.load('src/server/engine-distribution.js', swap(EDsrc, "    let rel; try { rel = await holdPlace(sid, { leaseMs: 0, ask: askOf('a measure') }); } catch (e) { return { ok: false, code: e.code, error: e.message }; }", "    const rel = await holdPlace(sid, { leaseMs: 0, ask: askOf('a measure') });", 'measure'), 'measure-throws'), 'measure');
  ok(bad.m.threw === 'engine_kernel_landing', 'control M29: a measure with no step-aside THROWS beside the half-landed place (its callers expect an answer) — ㉕ RED', bad.m);
}));
ctl.push(leg('M30', async () => { // M30 — the boot without its step-aside
  const bad = await stepsAside(MC.load('src/server/engine-distribution.js', swap(EDsrc, "      let rel; try { rel = await holdPlace(id, { leaseMs: 0, ask: askOf('the boot') }); } catch { continue; }", "      const rel = await holdPlace(id, { leaseMs: 0, ask: askOf('the boot') });", 'boot'), 'boot-throws'), 'boot');
  ok(bad.b.threw === 'engine_kernel_landing' && !bad.second, 'control M30: a boot with no step-aside THROWS at the half-landed engine — the next engine\'s aside kernel is never put back (and the fleet\'s run, which asks the boot first, dies) — ㉕ RED', { b: bad.b, second: bad.second });
}));
ctl.push(leg('M31', async () => { // M31 — a download refused beside a landing recorded as a failure
  const bad = await stepsAside(MC.load('src/server/engine-distribution.js', swap(EDsrc, "if (!e || e.code !== 'engine_kernel_landing') await noteFailure(sid, e, st.step, by); throw e; }", 'await noteFailure(sid, e, st.step, by); throw e; }', 'install'), 'install-fails'), 'install');
  ok(bad.i.threw === 'engine_kernel_landing' && bad.failure === 'engine_kernel_landing' && bad.todos === 1, 'control M31: a download refused beside a landing in progress recorded as a FAILURE — the card says it failed and a For-you notice is filed for a refusal that heals by itself — ㉕ RED', { i: bad.i, failure: bad.failure, todos: bad.todos });
}));
ctl.push(leg('M32', async () => { // M32 — the r5 check before the first rename: the holds only
  const bad = await droppedScene(MC.load('src/server/engine-distribution.js', swap(EDsrc, "    const busy = await placeBusy(sid, plan);\n    if (busy) return { ok: false, why: 'held', by: busy };\n", "    if (g.holds > 0) return { ok: false, why: 'held', by: 'a browser start holds the current kernel' };\n", 'whole question'), 'holds-only'), 'after');
  ok(bad.B && bad.B.proceeded && bad.a === true && bad.place === 'K3' && bad.landedLine,
    'control M32: the r5 check (the holds only) lands K3 under the browser a start spawned from K2 and stopped holding — the journal says it «waited for no browser» — ㉖ RED', bad);
}));
ctl.push(leg('M33', async () => { // M33 — a hold taken during the scan not counted
  const bad = await droppedScene(MC.load('src/server/engine-distribution.js', swap(EDsrc, " : g.taken !== t0 ? `${g.lastAsker || 'a browser start'} took the current kernel while it was checked` : null;", ' : null;', 'taken'), 'taken-blind'), 'scan');
  ok(bad.B && bad.B.proceeded && bad.a === true && bad.place === 'K3',
    'control M33: a hold taken and dropped DURING the landing\'s in-use scan not counted — the scan listed /proc before the spawn, K3 lands under the new browser — ㉖ RED', bad);
}));
ctl.push(leg('M34', async () => { // M34 — the landing's put-back outside the torn window (the r5 tip)
  const bad = await putBackScene(MC.load('src/server/engine-distribution.js', swap(EDsrc, '    const w = notWhole(sid); // r7 (p2)', '    const w = { end: () => {} };', 'put-back torn'), 'put-back-whole'), 'start'); // r7: re-anchored (restoreAside's count)
  ok(bad.s && bad.s.proceeded === true && bad.s.empty === true,
    'control M34: the landing\'s put-back outside the torn window lets a start past its bound take its hold and SPAWN beside the EMPTY place — ㉗ RED', bad.s);
}));
ctl.push(leg('M35', async () => { // M35 — the r5 sweep: the aside copy of the waiting kernel removed as a leftover
  const EDM = MC.load('src/server/engine-distribution.js', swap(swap(EDsrc, '    if (!rec || !rec.next) return known({ gone: true });', '    if (true) return known({ gone: true });', 'heal'), KEEPU, KEEP1, 'keep'), 'sweeps-only-copy'); // r7: re-anchored (healAside's answer; the sweep's two names)
  const bad = [];
  for (const at of ['aside', 'back', 'new']) bad.push(await crashScene(EDM, at));
  ok(bad.every((x) => x.halted && x.next === VER.k3 && !x.kept && !x.prev && x.due.staged && String(x.card).includes('serves the next browser start') && x.lines.some((l) => l.includes('.next-linux-x64.prev'))),
    'control M35: the r5 sweep removes the ONLY copy of K3 at all three stops («leftover kernel files the record does not name») while the record, kernelDue (staged) and the card still say it waits — ㉘ RED', bad.map((x) => ({ at: x.at, next: x.next, kept: x.kept, due: x.due, lines: x.lines })));
}));
ctl.push(leg('M36', async () => { // M36 — the r6 tip: healAside's «unreadable» taken as gone by its callers (the sweep keeps one name)
  const EDM = MC.load('src/server/engine-distribution.js', swap(swap(EDsrc, '      return { unknown: code };\n', '      return { gone: true };\n', 'unknown'), KEEPU, KEEP1, 'keep'), 'unread-is-gone');
  const [a, b, c] = await Promise.all(['sweep', 'land', 'stage-fleet'].map((road) => unreadAside(EDM, road)));
  ok(a.prev === 'gone' && a.next === `${VER.k3}:K3` && a.due.staged && a.r.some((o) => o.includes('.next-linux-x64.prev')),
    'control M36 (the sweep): the r6 tip\'s sweep deletes the ONLY copy of K3 after ONE unread receipt while the record and kernelDue (staged) still say it waits — ㉚ RED', a);
  ok(b.next === null && !b.discarded && b.acted.some((l) => l.includes('not beside its place any more')),
    'control M36 (landNext): the r6 tip\'s start drops the waiting K3 as «gone» on an unread receipt — no discard recorded — ㉚ RED', b);
  ok(c.prev === 'gone' && !c.nextDir && c.next === `${VER.k3}:K3`,
    'control M36 (stageNext): the r6 tip\'s staging removes the unread aside copy, then the refusal at the last ask leaves rec.next naming a folder that is gone — ㉚ RED', c);
}));
ctl.push(leg('M37', async () => { // M37 — the r6 tip: the not-whole count taken only after the put-back's stats
  let src = swap(EDsrc, '    const w = notWhole(sid); // r7 (p2)', '    const w = { end: () => {} };', 'asked');
  src = swap(src, '    const rec = recOf(sid);\n    try { await io.rename(plan.removingDir, plan.targetDir); }', '    { const late = notWhole(sid); w.end = late.end; } // counted only once the place answered ENOENT\n    const rec = recOf(sid);\n    try { await io.rename(plan.removingDir, plan.targetDir); }', 'late');
  const EDM = MC.load('src/server/engine-distribution.js', src, 'torn-after-stats');
  const xs = await Promise.all(['removing', 'place'].map((hold) => putBackScene(EDM, 'start', { hold })));
  ok(xs.every((x) => x.s && x.s.proceeded === true && x.s.empty === true),
    'control M37: the r6 tip\'s count taken only once the place answered ENOENT lets a start past its bound take its hold and SPAWN beside the EMPTY place while either stat hangs — ㉛ RED', xs.map((x) => ({ hold: x.hold, s: x.s })));
}));
ctl.push(leg('M38', async () => { // M38 — the r7 tip's landing: the aside copy deleted after an unknown put-back
  const EDM = MC.load('src/server/engine-distribution.js', swap(EDsrc, "    if (back && back.unknown) return { ok: false, why: 'unknown', code: back.unknown }; // r8 (s1): could not tell — nothing moves, nothing is deleted\n", '', 'landDir unknown'), 'rm-after-unknown');
  const [u, e] = await Promise.all([unreadPlace(EDM, 'untrust'), unreadPlace(EDM, 'eio')]);
  ok(u.aside === 'gone' && u.place === null && u.rec.aside === 'K2' && u.then.m === 'browser_engine_kernel_missing' && e.aside === 'gone' && e.place === 'K3' && e.rec.aside === 'K2',
    'control M38: the r7 tip\'s landing deletes .removing-<tag> — the ONLY copy of K2 — after a put-back that could not read the place: refused at the judge ⇒ NO kernel at all (measure: kernel missing) while rec.aside names a folder that is gone; landed ⇒ rec.aside stale — ㉜ RED', { untrust: { aside: u.aside, place: u.place, rec: u.rec, then: u.then }, eio: { aside: e.aside, place: e.place, rec: e.rec } });
}));
ctl.push(leg('M39', async () => { // M39 — the r7 sweep: the .prev kept whatever healAside answered
  const bad = await dupAside(MC.load('src/server/engine-distribution.js', swap(EDsrc, KEEPU, KEEP2, 'keep'), 'keep-always'));
  ok(bad.prev === 'kept' && !bad.swept.length && !bad.lines.length, 'control M39: the r7 sweep keeps a .next-<tag>.prev it read as a duplicate of K3 whole at .next-<tag> — for ever («the next sweep removes it» is false) — ㉝ RED', bad);
}));
ctl.push(leg('M40', async () => { // M40 — the r7 person's download: nothing set beside an unread copy
  const bad = await unreadAside(MC.load('src/server/engine-distribution.js', swap(EDsrc, "    const beside = !!(h.unknown && h.free && kfact.by === 'user'); // r8 (s3)", '    const beside = false;', 'beside'), 'no-door'), 'stage');
  ok(bad.r && bad.r.staged === false && bad.r.kept === 'EIO' && bad.unread === 'EIO' && bad.after.prev,
    'control M40: the r7 tip\'s person\'s download under an unknown sets nothing beside it (staged:false, kept) — the card keeps saying it could not be read and nothing the person does changes it — ㉞ RED', { r: bad.r, unread: bad.unread, after: bad.after });
}));
ctl.push(leg('M41', async () => { // M41 — the r7 card: kernelFact with no unread state
  const bad = await unreadAside(MC.load('src/server/engine-distribution.js', swap(EDsrc, 'stagedAt: r.next.stagedAt || null, unread: unreadNext(sid) } : null,', 'stagedAt: r.next.stagedAt || null } : null,', 'card'), 'card-blind'), 'sweep');
  ok(bad.said === 1 && String(bad.card).endsWith(`new kernel ${VER.k3} downloaded — it serves the next browser start`),
    'control M41: the r7 card says «… downloaded — it serves the next browser start» while its copy cannot be read and every start runs K2 (the journal alone says it) — ㉞ RED', { card: bad.card, said: bad.said });
}));
await Promise.all(ctl);
await Promise.all(later);
host.close();
console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
