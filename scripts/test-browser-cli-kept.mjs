#!/usr/bin/env node
// B-7a30 unit 1' (the owner's hub witness, 2026-11-17: 23.8 s held in 16 holds — the keeper's cliJudge stat'ed each stamped record's
// CLI file and, on a mismatch, read the pinned install's package.json and stat'ed its candidates, on EVERY list(), digest and
// commit). THE LAW (主开发): a browser's CLI judgment is a KEPT FACT (src/server/browser-keeper.js) — set by the keeper's own acts
// (a launch, an adoption), judged again OFF the loop by one async judge on the keeper's own timer; a VIEW reads what the last judge
// found, a DOOR (a command about to run) judges fresh, bounded. In-process, a real keeper, no server, no driver:
//   ① THE COUNT: one list() makes 0 sync fs calls on a CLI file or the CLI folders at 5 and at 50 stamped records
//      CONTROL: today's keeper with the release's lines planted back (c39de1224's sync cliJudge as the view) — its calls grow
//      with the records ⇒ ① RED (a patched copy: no git object is read — test-architecture §75)
//   ② a view never shows a CLI as fine before it was judged since the boot: `checking` (the CLI row's words «checking…»), and
//      the first judge that lands redraws it (one notification)
//      CONTROL: a keeper whose view answers an unjudged record as fine ⇒ ② RED
//   ③ a judgment that changes notifies ONCE; one that changes nothing sends nothing
//      CONTROL: a keeper that notifies at every judge ⇒ ③ RED
//   ④ THE DOOR: a stall PLACED in the judge's file check (never load) — the /resolve door answers `unconfirmed` by name past the
//      bound (5 s in the product, ACT_MS here); while a judge hangs a second door is refused at once with no second check; a view
//      says `checking`; released, the door answers; the runtime refuses a call carrying it by name, nothing spawned
//      CONTROL: a door without the bound never answers over the stall ⇒ ④ RED
//   ⑤ wiring pins: the heal reads the door, an `info` read goes on, a view asks for THE pass (never a judge per record)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('cli-kept');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const ACT_MS = 150; // the doors' bound handed to the keeper here (cliActMs = 5 s in the product)
const SETTLE_MS = 350; // the judges' notifications are batched (250 ms): waited out before a count
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const CM = await import('../src/lib/browser-cli-model.js');
const MUT = mutantCopies('cli-kept', REPO);
const kSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
const cut = (text, anchor, by, what) => { ok(verdictOf(text.includes(anchor)), `control setup: ${what} is where the control cuts`); return editAnchor(text, anchor, by, "the text handed to cut()"); };
const idOf = (p) => { const st = fs.statSync(p); return `${st.dev}:${st.ino}:${st.size}:${Math.round(st.mtimeMs)}`; };
// every sync fs call naming a CLI file or a CLI folder while `fn` runs
const SYNC = Object.keys(fs).filter((k) => k.endsWith('Sync') && typeof fs[k] === 'function');
// (held open until `fn`'s promise settles: the judges a list STARTS are counted to their end)
async function cliCalls(fn, prefixes) {
  const real = {}; const hits = []; let all = 0;
  for (const k of SYNC) { real[k] = fs[k]; fs[k] = function (a, ...r) { all++; const s = typeof a === 'string' ? a : ''; if (prefixes.some((x) => s.startsWith(x)) || s.includes('/browser-tools/')) hits.push(k + ' ' + s); return real[k].call(this, a, ...r); }; }
  try { await fn(); } finally { for (const k of SYNC) fs[k] = real[k]; }
  return { n: hits.length, all, hits: hits.slice(0, 6) };
}
// THE RELEASE'S LINES (c39de1224's cliJudge, verbatim but for knownVersionAt inlined) planted back as the view — a patched copy
const RELEASE_VIEW = `  function cliOptOf(rec) {
    const c = rec && rec.cli;
    if (!c || !c.version || !isLocalRec(rec)) return null;
    const knownVersionAt = (p) => { const m = p ? cliVersions.get(p) : null; return m && m.id === cliIdOf(p) ? m.version : null; };
    if (c.path && usableExe(c.path) && (!c.id || cliIdOf(c.path) === c.id)) return { path: c.path };
    const cands = [];
    const cur = typeof bf.binPath === 'function' ? bf.binPath() : null;
    if (cur) cands.push({ path: cur, version: knownVersionAt(cur), how: 'current' });
    try { const i = installedCliOf(c.version); if (i.ok) cands.push({ path: i.path, version: c.version, how: 'installed' }); } catch { /* not a version */ }
    const onPath = typeof bfPath.binPath === 'function' ? bfPath.binPath() : null;
    if (onPath && onPath !== cur) cands.push({ path: onPath, version: knownVersionAt(onPath), how: 'path' });
    const v = VERBS.cliForBrowser({ want: c.version, candidates: cands, current: cur ? knownVersionAt(cur) : null });
    if (v.ok) return v.path ? { path: v.path } : null;
    return { gone: v.error };
  }
`;
/** A real keeper in its own scratch world. `stall` PLACES a stall in the judge's file check (until released). */
function world(Kmod, tag, { stall = null, product = false, onPath = false } = {}) {
  const W = path.join(ROOT, 'w-' + tag); const H = path.join(W, 'home'); const D = path.join(W, 'data'); const BIN = path.join(W, 'bin'); const CLI = path.join(W, 'cli');
  for (const d of [path.join(H, '.agent-browser'), D, BIN, CLI]) fs.mkdirSync(d, { recursive: true });
  const cliFile = path.join(CLI, 'agent-browser'); fs.writeFileSync(cliFile, '#!/bin/sh\necho 0.38.1\n', { mode: 0o755 });
  const pathCli = path.join(BIN, 'agent-browser'); if (onPath) fs.writeFileSync(pathCli, '#!/bin/sh\necho 0.38.1\n', { mode: 0o755 }); // the current CLI a launch stamps
  const rtE = { PATH: BIN, HOME: H };
  const msgs = [];
  const kp = Kmod.create({ dataDir: D, homeDir: H, env: () => rtE, liveKeys: () => new Set(), runtime: F.createBrowserRuntime({ env: rtE }), ...(product ? {} : { facts: F.createBrowserFacts({ env: rtE }) }), log: quiet, tickMs: 3600e3, install: false,
    broadcast: (m) => msgs.push(m), cliEveryMs: 0, cliActMs: ACT_MS, ...(stall ? { cliFileFact: stall.fileFact } : {}) });
  const cliFile2 = path.join(CLI, 'agent-browser-2'); fs.writeFileSync(cliFile2, '#!/bin/sh\necho 0.38.1\n', { mode: 0o755 });
  // the records are LIVE (state ready): a stopped browser runs no CLI, so it carries no judgment either way
  const stamp = (n, id, file = cliFile) => { const ids = []; for (let i = 0; i < n; i++) { const pr = kp.createProfile({ label: `Cli ${tag} ${i} ${path.basename(file)}` }, { owner: { kind: 'instance', id: null } }); kp._reg().browsers[pr.id] = { profileId: pr.id, state: 'ready', launch: 'attach', pid: 0, cli: { version: '0.38.1', path: file, id, at: 1 }, startedAt: 1 }; ids.push(pr.id); } return ids; };
  const sent = () => msgs.filter((m) => m && m.type === 'browser-profiles-updated').length;
  return { kp, W, D, BIN, CLI, cliFile, cliFile2, pathCli, stamp, sent, done: () => { try { kp.shutdown && kp.shutdown(); } catch { /* none */ } } };
}
function staller() {
  const pend = []; let on = null, checks = 0;
  return { fileFact: async (p) => { checks++; if (on && p === on) await new Promise((r) => pend.push(r)); let exe = false, id = null; try { fs.accessSync(p, fs.constants.X_OK); exe = true; id = idOf(p); } catch { exe = false; id = null; } return { exe, id }; },
    on: (file) => { on = file; }, release: () => { on = null; for (const f of pend.splice(0)) f(); }, checks: () => checks };
}

console.log('① THE COUNT: sync fs calls on a CLI file for one list()');
async function countAt(Kmod, n, tag) {
  const X = world(Kmod, tag + '-' + n, { product: true }); // the hub's own runtime: the current CLI read off the pin's memo + PATH's
  X.stamp(n, '1:2:3:4'); // a stamp whose file does not match: the release's judge falls through to every candidate
  X.kp.list(); await X.kp.rejudgeClis(); // warm: every record judged once (off the loop)
  // one list() and a whole pass of the judge (the keeper's own tick), counted to the pass's end
  const c = await cliCalls(async () => { X.kp.list(); await X.kp.rejudgeClis(); }, [X.CLI, X.BIN]); // the CLI file, PATH's folder, and (by name) any browser-tools path
  X.done();
  return c;
}
{
  const a = await countAt(K, 5, 'now'), b = await countAt(K, 50, 'now');
  ok(a.n === 0 && b.n === 0, `① THE COUNT: one list() and a whole pass of the judge make ${a.n} sync fs calls on a CLI file or folder at 5 stamped records and ${b.n} at 50 — 0 (all sync calls of the list, other readers included: ${a.all} / ${b.all})`, { a, b });
  const vi = kSrc.indexOf('  function cliOptOf(rec) {'), vj = kSrc.indexOf("  /** THE DOORS' answer");
  ok(vi > 0 && vj > vi, 'control setup: the view (cliOptOf) is where the release\'s lines are planted');
  const KR = MUT.load('src/server/browser-keeper.js', kSrc.slice(0, vi) + RELEASE_VIEW + kSrc.slice(vj), 'release');
  const ra = await countAt(KR, 5, 'release'), rb = await countAt(KR, 50, 'release');
  ok(ra.n >= 5 && rb.n >= 50 && rb.n > ra.n, `CONTROL: the release's lines as the view — one list() makes ${ra.n} sync calls on a CLI file or folder at 5 records and ${rb.n} at 50 (${rb.hits.slice(0, 3).join(' | ')}): they grow with the records, ① is RED on it`, { ra, rb });
}

console.log('② a view never shows a CLI as fine before it was judged');
async function firstLeg(Kmod, tag) {
  const X = world(Kmod, tag);
  const [id] = X.stamp(1, idOf(X.cliFile)); // its own file, matching: the judge will find it fine
  const v1 = X.kp.list().browsers[id].cli; const s0 = X.sent();
  await X.kp.rejudgeClis();
  await sleep(SETTLE_MS);
  const v2 = X.kp.list().browsers[id].cli; const sent = X.sent() - s0;
  X.done();
  return { v1, v2, sent };
}
{
  const KC = MUT.load('src/server/browser-keeper.js', cut(kSrc, '    return checking ? { checking: true } : k.j;', '    return k ? k.j : null;', 'the view\'s «checking» answer'), 'nochecking');
  // its verdict's word: the pass that ended without an await has its own RED control — the release-style `.finally` clear
  const KP = MUT.load('src/server/browser-keeper.js', cut(cut(kSrc, '    if (cliPass && !cliPass.done) return cliPass.p;', '    if (cliPass) return cliPass.p;', 'the keeper pass\'s «ended» test'),
    '      } finally { pass.done = true; if (cliPass === pass) cliPass = null; }', '      } finally { Promise.resolve().then(() => { if (cliPass === pass) cliPass = null; }); }', 'the keeper pass\'s own end'), 'stalepass');
  const [r, c, cp] = await Promise.all([firstLeg(K, 'first'), firstLeg(KC, 'first-control'), firstLeg(KP, 'first-stalepass')]);
  ok(gateOf(r.v1) && r.v1.checking === true && !r.v1.gone, '② a stamped record never judged since the boot: its view says `checking` — never «runs» unjudged', r.v1);
  ok(gateOf(r.v2) && !r.v2.checking && !r.v2.gone && r.sent === 1, `② …the first judge lands: the view redraws (no checking, not gone) with ONE notification (${r.sent}, batched)`, r);
  { const X = world(K, 'stopped'); const [sid] = X.stamp(1, idOf(X.cliFile)); X.kp._reg().browsers[sid].state = 'stopped'; const v = X.kp.list().browsers[sid].cli; X.done();
    ok(gateOf(v) && v.version === '0.38.1' && !v.checking && !v.gone, '② a STOPPED browser runs no CLI: its view says the version it last ran and no judgment either way (its next start stamps its own)', v); }
  const words = CM.cliRowWords({ table: '0.38.1', choice: { mode: 'path' }, onPath: { version: '0.38.1' }, inUse: { version: '0.38.1' }, install: {}, running: { previous: 0, gone: 0, checking: 1 } }, (s) => s);
  ok(verdictOf(/checking…/.test(words.text)), `② the CLI row says the page's own «checking…» for a running browser whose CLI is not judged yet (${JSON.stringify(words.text)})`);
  ok(gateOf(c.v1) && !c.v1.checking, `CONTROL: a keeper whose view answers an unjudged record as fine says ${JSON.stringify(c.v1)} — ② is RED on it`, c.v1);
  ok(gateOf(cp.v2) && cp.v2.checking === true, `CONTROL: a keeper whose pass is cleared one microtask after it ended (the .finally form) hands that finished pass to the next ask — the record is never judged (${JSON.stringify(cp.v2 && { checking: cp.v2.checking })}) — ② is RED on it`, cp);
}

console.log('③ a judgment that changes notifies once; one that changes nothing sends nothing');
async function notifyLeg(Kmod, tag) {
  const X = world(Kmod, tag);
  const [id] = X.stamp(1, idOf(X.cliFile));
  X.kp.list(); await X.kp.rejudgeClis(); X.kp.list(); await sleep(SETTLE_MS); // judged, a view drew «fine», the first landing's note sent
  const s0 = X.sent();
  await X.kp.rejudgeClis(); await sleep(SETTLE_MS);
  const same = X.sent() - s0;
  fs.rmSync(X.cliFile, { force: true }); // its CLI removed: the next judge finds it gone
  await X.kp.rejudgeClis(); await sleep(SETTLE_MS);
  const moved = X.sent() - s0 - same; const v = X.kp.list().browsers[id].cli;
  const s1 = X.sent(); await X.kp.rejudgeClis(); await sleep(SETTLE_MS);
  const again = X.sent() - s1;
  X.done();
  return { same, moved, again, gone: !!(v && v.gone) };
}
{
  const KN = MUT.load('src/server/browser-keeper.js', cut(kSrc, "      if (cliTold.has(id) && cliTold.get(id) !== shown) { cliTold.set(id, shown); cliChanged(); }", '      if (true) { cliTold.set(id, shown); cliChanged(); }', 'the landing\'s «moved what a view drew» test'), 'everyjudge');
  const [r, c] = await Promise.all([notifyLeg(K, 'notify'), notifyLeg(KN, 'notify-control')]); // two worlds, their settle waits overlapped
  ok(r.same === 0 && r.moved === 1 && r.again === 0 && verdictOf(r.gone), `③ a judge that found what the view drew sends nothing (${r.same}); its CLI removed — the next judge sends ONE notification (${r.moved}) and the view says gone; the next, the same answer: nothing (${r.again})`, r);
  ok(c.same > 0 || c.again > 0, `CONTROL: a keeper that notifies at every judge sends for judges that changed nothing (same ${c.same}, again ${c.again}) — ③ is RED on it`, c);
}

async function manyLeg(Kmod, tag) {
  const X = world(Kmod, tag);
  X.stamp(3, idOf(X.cliFile));
  X.kp.list(); await X.kp.rejudgeClis(); X.kp.list(); await sleep(SETTLE_MS); // judged; a view drew all three «fine»
  const s0 = X.sent();
  fs.rmSync(X.cliFile, { force: true }); // their one CLI removed
  await X.kp.rejudgeClis(); await sleep(SETTLE_MS);
  const sent = X.sent() - s0; X.done();
  return { sent };
}
{
  const KM = MUT.load('src/server/browser-keeper.js', cut(kSrc, "  const cliChanged = () => { if (cliNoteTimer) return; cliNoteTimer = setTimeout(() => { cliNoteTimer = null; notify(); }, 250); if (cliNoteTimer.unref) cliNoteTimer.unref(); };", '  const cliChanged = () => notify();', 'the judges\' batched notification'), 'notifyeach');
  const [m, mc] = await Promise.all([manyLeg(K, 'many'), manyLeg(KM, 'many-control')]);
  ok(m.sent === 1, `③ three records moved in ONE pass (their CLI removed) send ONE broadcast (${m.sent}) — never one per record`, m);
  ok(mc.sent >= 3, `CONTROL: a keeper that notifies at every landing sends ${mc.sent} broadcasts for that one pass — ③'s batching is RED on it`, mc);
}

console.log('④ THE DOOR: bounded, and never answers what it did not judge');
async function doorLeg(Kmod, tag) {
  const st = staller(); const X = world(Kmod, tag, { stall: st });
  const [id, id2] = X.stamp(2, idOf(X.cliFile));
  const [id3] = X.stamp(1, idOf(X.cliFile2), X.cliFile2); // a browser on ANOTHER CLI file
  X.kp.list(); await X.kp.rejudgeClis(); // judged fine before the stall
  st.on(X.cliFile);
  const t0 = Date.now();
  const sentinel = new Promise((r) => setTimeout(() => r('no answer'), ACT_MS * 6));
  const d1 = await Promise.race([X.kp.cliFactReady(id), sentinel]);
  const waited = Date.now() - t0;
  const checks1 = st.checks();
  const d2 = await Promise.race([X.kp.cliFactReady(id2), new Promise((r) => setTimeout(() => r('no answer'), ACT_MS * 6))]);
  const checks2 = st.checks();
  const d4 = await Promise.race([X.kp.cliFactReady(id3), new Promise((r) => setTimeout(() => r('no answer'), ACT_MS * 6))]); // another file: never refused for this one's hang
  const view = X.kp.list().browsers[id].cli;
  // its verdict's MUST: the SAME record re-stamped on ANOTHER file (the restart the refusal's remedy names) while the old judge hangs
  const rec = X.kp._reg().browsers[id]; const oldCli = rec.cli;
  rec.cli = { version: '0.38.1', path: X.cliFile2, id: idOf(X.cliFile2), at: 2 };
  const dR = await Promise.race([X.kp.cliFactReady(id), new Promise((r) => setTimeout(() => r('no answer'), ACT_MS * 6))]);
  rec.cli = oldCli;
  st.release(); await X.kp.rejudgeClis();
  const d3 = await X.kp.cliFactReady(id);
  X.done();
  return { d1, waited, checks1, d2, checks2, d4, dR, view, d3 };
}
{
  const r = await doorLeg(K, 'door');
  ok(gateOf(r.d1) && typeof r.d1.unconfirmed === 'string' && gateOf(/could not be checked within/.test(r.d1.unconfirmed)) && r.waited >= ACT_MS - 20, `④ a stall placed in the judge's file check: the /resolve door answers «unconfirmed» by name past the bound (after ${r.waited} ms, bound ${ACT_MS} ms) — never «runs» over a CLI nobody judged`, r.d1);
  ok(gateOf(r.d2) && typeof r.d2.unconfirmed === 'string' && r.checks2 === r.checks1, `④ while that judge hangs a second door is refused at once with NO second check (${r.checks1} → ${r.checks2})`, r);
  ok(gateOf(r.d4) && typeof r.d4 === 'object' && !r.d4.unconfirmed && !r.d4.gone && r.d4.version === '0.38.1', `④ a browser on ANOTHER CLI file is judged and answered meanwhile — a hang on one file never refuses the browsers (or the restart) on another (${JSON.stringify(r.d4)})`);
  ok(gateOf(r.dR) && typeof r.dR === 'object' && !r.dR.unconfirmed && !r.dR.gone && r.dR.version === '0.38.1', `④ (its verdict's must) the SAME record re-stamped on ANOTHER CLI file while its old judge hangs is judged and answered — the restart onto a healthy file is never refused for the old file's hang (${JSON.stringify(r.dR)})`);
  ok(gateOf(r.view) && r.view.checking === true, `④ while the judge hangs a view says «checking» (${JSON.stringify(r.view)})`);
  ok(gateOf(r.d3) && !r.d3.unconfirmed && !r.d3.gone && r.d3.version === '0.38.1', '④ released, the judge answers: the door says the CLI it runs', r.d3);
  const rt = F.createBrowserRuntime({ env: { PATH: '/nonexistent-b7a30', HOME: ROOT } });
  const ran = await rt.streamStatus('vs-b7a30', { cli: { unconfirmed: 'not judged in time' } });
  const sp = await rt.streamPort('vs-b7a30', { cli: { unconfirmed: 'not judged in time' } });
  ok(gateOf(ran) && ran.ok === false && ran.code === 'browser_cli_unconfirmed' && gateOf(/not judged in time/.test(ran.error)) && gateOf(sp) && sp.ok === false && sp.code === 'browser_cli_unconfirmed', `④ the runtime refuses a call that carries the door's «unconfirmed» by name before anything runs, and a live view's stream port keeps that name (${ran && ran.code} / ${sp && sp.code})`, { ran, sp });
  const KD = MUT.load('src/server/browser-keeper.js', cut(kSrc, '    const r = await Promise.race([job.p, new Promise((res) => { timer = setTimeout(() => setImmediate(() => res(CLI_UNANSWERED)), cliActMs); })]);', '    const r = await job.p;', 'the door\'s bound'), 'unbounded');
  const c = await doorLeg(KD, 'door-control');
  ok(c.d1 === 'no answer', `CONTROL: a door without the bound gives no answer over the stall (${JSON.stringify(c.d1)} after ${ACT_MS * 6} ms) — ④ is RED on it`, c.d1);
  const KO = MUT.load('src/server/browser-keeper.js', cut(kSrc, '((x.id === rec.profileId && x.sig === sig0) || (path0 && x.path === path0))', '(x.id === rec.profileId || (path0 && x.path === path0))', 'the stuck test\'s own-record clause'), 'stuck-any-stamp'); // stale-pins: kept — the old clause, planted back as this control's mutant
  const o = await doorLeg(KO, 'door-anystamp');
  ok(gateOf(o.dR) && verdictOf(o.dR.unconfirmed), `CONTROL (its verdict's must): «stuck» matching the record under ANY stamp refuses the restart onto another file (${JSON.stringify(o.dR)}) — ④ is RED on it`, o.dR);
  // the launch's stamp is bounded: the current CLI on a file that does not answer ⇒ unstamped within the bound (the browser follows the current CLI)
  const stampLeg = async (Kmod, tag) => {
    const st2 = staller(); const Y = world(Kmod, tag, { stall: st2, onPath: true });
    Y.kp.list(); await Y.kp.rejudgeClis(); await sleep(50); // its boot asked the current CLI's version once (answered)
    st2.on(Y.pathCli);
    const a = await Promise.race([Y.kp._cliNow(), new Promise((res) => setTimeout(() => res('no answer'), ACT_MS * 6))]);
    st2.release(); Y.done();
    return a;
  };
  const KN2 = MUT.load('src/server/browser-keeper.js', cut(kSrc, '    const v = await Promise.race([cliVersionAt(p), new Promise((res) => { timer = setTimeout(() => setImmediate(() => res(CLI_UNANSWERED)), cliActMs); })]);', '    const v = await cliVersionAt(p);', 'the launch stamp\'s bound'), 'stamp-unbounded');
  const [sa, sc] = await Promise.all([stampLeg(K, 'stamp'), stampLeg(KN2, 'stamp-control')]);
  ok(sa === null, `④ the launch's stamp over a stalled CLI file answers UNSTAMPED within the bound (${JSON.stringify(sa)}) — a launch never waits on it`, sa);
  ok(sc === 'no answer', `CONTROL: a launch stamp without the bound gives no answer over the stall (${JSON.stringify(sc)}) — RED on it`, sc);
}

console.log('⑤ wiring');
{
  const heal = kSrc.slice(kSrc.indexOf('  function healBrowser(rec, p, seenBy'), kSrc.indexOf('  function healBrowser(rec, p, seenBy') + 6000);
  ok(gateOf(heal.includes("const c = await cliOptReady(rec); if (reg.browsers[p.id] !== rec || rec.state !== 'ready' || starting.has(p.id) || stopping.has(p.id) || switching.has(p.id)) return null;")) && gateOf(heal.includes('if (c && c.unconfirmed)')) && !heal.includes('const c = cliOptOf(rec)'), '⑤ the heal reads the DOOR (a fresh judge, bounded) — never the view; re-checked after the await (a stop or a start begun meanwhile wins); unconfirmed ⇒ no relaunch, no failure counted'); // stale-pins: kept — a deliberate absence check: the heal never reads the view any more
  ok(gateOf(kSrc.includes("return { unconfirmed: `this browser's CLI could not be judged (")) && gateOf(kSrc.includes("(r.code === 'browser_cli_gone' || r.code === 'browser_cli_unconfirmed') ? r.code : 'stream_unavailable'")) && verdictOf(kSrc.includes("throw namedError(r.code === 'browser_cli_unconfirmed' ? r.code :")), '⑤ a judge that throws fails CLOSED (unconfirmed, never «no stamp» ⇒ the current CLI); the stream ports and a launch keep the refusal\'s name');
  ok(verdictOf(kSrc.includes("if (!c || ((c.gone || c.unconfirmed) && m === 'info')) return opts;")), '⑤ an `info` read (liveness / adoption) goes on with the current CLI when the door is unconfirmed — it never restarts a daemon');
  const view = kSrc.slice(kSrc.indexOf('  function cliOptOf(rec) {'), kSrc.indexOf('  async function cliOptReady(rec) {'));
  ok(gateOf(view.includes('rejudgeClis()')) && !view.includes('startCliJudge(') && !/fs\.|usableExe|cliIdOf|installedCliOf\(/.test(view), '⑤ a view never checks a file and never starts a judge of its own — it asks for THE pass (one at a time, one judge at a time)');
}
for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { label: 'CONTROL: ' })) ok(verdictOf(r.pass), r.name, r.detail);
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
