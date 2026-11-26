#!/usr/bin/env node
// test-store-read-law — THE STORE-READ LAW over the read census's debt stores (lane bl-jobs, the remainder of B-f276, 2.369.411).
// src/store-read.js storeAnswer: a read that FAILED (EIO, EACCES, a timeout on network storage) is NO answer — the store is HELD:
// nothing is written over it, a person's change is refused by name, and it is read again off the main loop until it answers; torn
// bytes are kept aside before the store starts empty; a «missing» answer right after an unreadable one is read once more. One
// section a store, each against the release's load in a copy (scripts/mutant-copy.mjs). FAST, in-process: no server, no network.
// The ratchet beside it: scripts/test-store-write-census.mjs ⑧ (READ_DEBT_CAP falls as each store's row flips to `answer`).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 主开发 04:33Z (5): the closing count says how many legs were SKIPPED by name under root (a green over skipped legs is never a plain ALL PASS)
const SKIPPED = { n: 0 };
const { ok, report } = checker({ log: (l) => console.log(SKIPPED.n && /^\n(?:ALL PASS|\d+ FAILED)/.test(l) ? `${l} · ${SKIPPED.n} leg(s) skipped by name under root (each said above)` : l) });
const D = scratch('store-read-law'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
process.on('exit', () => { try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
const MJ = mutantCopies('store-read-law', ROOT);
// a read that FAILS while the file is there: mode 000 (EACCES) — under root, which reads it anyway, a folder in its place (EISDIR)
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const plant = (F, body) => { if (asRoot) fs.mkdirSync(F); else { fs.writeFileSync(F, body); fs.chmodSync(F, 0o000); } };
// store (5)'s round (主开发 02:33Z (4)): a leg root cannot make red (root reads a 000 file — the stand-in is a folder, which no save's
// rename replaces) is SKIPPED BY NAME under root, never green by an early true
const rootSkip = (name) => (SKIPPED.n++, console.log(`  ○ SKIPPED under root (by name, never a green): ${name} — root reads a 000 file, so the stand-in is a folder no save can replace`));
const unplant = (F, body) => { if (asRoot) { fs.rmdirSync(F); fs.writeFileSync(F, body); } else fs.chmodSync(F, 0o644); };
// r4362 (row B-3dbd's family, the flake census at 2.369.419): A TORN START IS JUDGED ONLY ONCE ITS HOLD HAS LIFTED — waited on the
// lift itself (the store's unreadWords() gone), never on a count of turns standing in for it: the copy aside is written, synced and
// linked OFF the loop, and 5000 turns are tens of ms while that I/O is pending. The bound is generous and its expiry is a NAMED failed
// line, never a silent read of a store still held (the form of test-store-read-three's r4213 cure). The placed leg after the torn
// hosts.json holds the copy at its link: the old wait ends with the store still held (red at will), the wait on the lift sees it lift.
const LIFT_MS = 20000;
const liftOf = async (store, what) => { const t0 = Date.now(); while (store.unreadWords() && Date.now() - t0 < LIFT_MS) await new Promise((r) => setTimeout(r, 20)); const up = !store.unreadWords(); if (!up) ok(false, `the torn start never lifted (${what}) — waited ${LIFT_MS} ms on its lift`, { words: store.unreadWords() }); return up; };
const bodyOf = (F) => { try { return fs.statSync(F).isDirectory() ? '(a folder)' : (fs.chmodSync(F, 0o644), fs.readFileSync(F, 'utf8')); } catch (e) { return '(' + e.code + ')'; } };

console.log('§1 hosts.json (src/hosts.js) — every paired machine and its dial token hash');
{
  const HSRC = fs.readFileSync(path.join(ROOT, 'src/hosts.js'), 'utf8');
  const LOAD = "    if (this._hold.start(a) !== 'held') this._loadAnswer(a);   // held: the machines list stays empty until the lift\n";   // 2b: the start through the family helper
  ok(HSRC.split(LOAD).length === 2, 'control setup: hosts.js starts its hold once (the plant the control swaps)');
  const RELEASE = MJ.load('src/hosts.js', anchored(HSRC, LOAD, "    try { this._state = JSON.parse(read.text); } catch { } if (!Array.isArray(this._state.hosts)) this._state.hosts = [];   /* MUTANT: the release — any failure starts EMPTY */\n", 'srl-37a'), 'release-load');
  const body = JSON.stringify({ hosts: [{ id: 'h-0001', name: 'build box', transport: 'dial', deviceId: 'dev-0001' }] });
  const scene = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'hosts.json'), CACHE = path.join(d, 'remote-jsonl', 'h-0001');
    plant(F, body);
    fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(path.join(CACHE, 'conv.jsonl'), '{}\n');   // a machine's transcript cache
    const H = new Mod.HostManager({ dataDir: d });
    const held = !!(H.unreadWords && H.unreadWords()), listedWhileHeld = H.list().length;
    let refused = null; try { H.reshapeStore((st) => st); } catch (e) { refused = e; }   // a change while held (the release: saved)
    if (typeof H._copies === 'function') await H._copies().refresh();   // (B-f276 family unit 2 commit 3: the sweep asks the kept copies — read first, as the boot's 60 s give them)
    H.sweepJsonlCache();   // its read r1 (M1): the boot's sweep, 60 s on — the held list must not make every machine's cache an orphan
    const cacheKept = fs.existsSync(CACHE);
    const ran = [], lifts = []; if (H.whenRead) H.whenRead(() => ran.push('swept')); H.onReadAgain = () => lifts.push(1);   // its read r1 (S5, S1)
    const ranWhileHeld = ran.length;
    let imp = null; try { imp = H.importBundle({ hosts: [] }); } catch (e) { imp = { threw: String(e && e.message) }; }   // its read r1 (S3)
    const kept = bodyOf(F) === (asRoot ? '(a folder)' : body);
    if (!asRoot) fs.chmodSync(F, 0o000);
    unplant(F, body);   // the storage answers again
    if (H.readAgain) await H.readAgain();
    return { held, listedWhileHeld, refused: refused ? { code: refused.code, msg: String(refused.message) } : null, kept, back: H.list().map((h) => h.id).join(), words: H.unreadWords ? H.unreadWords() : null, cacheKept, ranWhileHeld, ranAfter: ran.length, lifts: lifts.length, imp: imp && { skipped: !!imp.skipped, threw: imp.threw || null, warned: (imp.warnings || []).some((w) => /^the machines were not imported — hosts\.json/.test(w)) } };
  };
  const r = await scene({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-held');
  ok(r.held && r.listedWhileHeld === 0 && !!r.refused && r.refused.code === 'hosts-unread' && /^reshaping the machines store: hosts\.json in VibeSpace's data folder could not be read \((EACCES|EISDIR)\); VibeSpace reads it again every few minutes\. No machine is lost: nothing is written over it/.test(r.refused.msg), 'hosts.json whose read FAILS is HELD: no machine shown, a change refused BY NAME (what it was, why, that nothing is lost)', r);   // stale-pins: kept (the sentence is composed now — the runtime words are the same while no read waits)
  ok(r.kept && r.back === 'h-0001' && r.words === null, 'nothing was written over hosts.json while held; read again, its machines are back whole and the hold lifts', r);
  ok(r.cacheKept && r.ranWhileHeld === 0 && r.ranAfter === 1 && r.lifts === 1 && r.imp && r.imp.skipped && r.imp.warned && !r.imp.threw,
    'its read r1: while held the boot\'s cache sweep deletes NO machine\'s transcript cache (M1), a sweep that needs the machines waits and runs once they read (S5), the lift redraws every page\'s list (S1), an import skips the machines with its words — never a throw (S3)', r);
  const rx = await scene(RELEASE, 'hosts-release');
  ok(!rx.held && rx.listedWhileHeld === 0 && !(rx.refused && rx.refused.code === 'hosts-unread') && !rx.cacheKept, 'CONTROL (the release\'s load, in a copy): a failed read starts EMPTY — the cache sweep DELETES the machine\'s transcripts, nothing is refused', rx);
  if (asRoot) rootSkip('CONTROL hosts.json: the release\'s next save writes over the held file'); else ok(!rx.kept, 'CONTROL (the release\'s load, in a copy): the next save WRITES OVER hosts.json — every paired machine gone', rx);
  // 主开发 01:20Z (4): the waits for the read are BOUNDED and KEYED — a conversation's remote stop asked twice waits ONCE (the latest),
  // past the bound the oldest is let go (said); CONTROLS: a copy whose waits take no key, a copy with no bound
  {
    const BOUND = "    if (W.size > READ_WAITS_MAX) {", KEYED = "const k = key == null ? Symbol(what) : String(key), again = W.has(k);";
    ok(HSRC.split(BOUND).length === 2 && HSRC.split(KEYED).length === 2, 'control setup: the waits\' bound and key are found once');
    const waitsScene = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'hosts.json'); plant(F, body);
      const H = new Mod.HostManager({ dataDir: d });
      const ran = [], warn = console.warn; let said = 0; console.warn = (m, ...a) => { if (/the oldest is let go/.test(String(m))) said++; };
      try {
        for (let i = 0; i < 300; i++) H.whenRead(() => ran.push('sweep-' + i), 'a sweep');
        H.whenRead(() => ran.push('stop-a1'), 'the remote stop of conversation a', 'stop:a');
        H.whenRead(() => ran.push('stop-a2'), 'the remote stop of conversation a', 'stop:a');
      } finally { console.warn = warn; }
      unplant(F, body);
      if (H.readAgain) await H.readAgain();
      return { ran: ran.length, stops: ran.filter((x) => x.startsWith('stop-')).join(), first: ran[0], said };
    };
    const w = await waitsScene({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-waits');
    ok(w.ran === 256 && w.stops === 'stop-a2' && w.first === 'sweep-45' && w.said === 45, 'the waits for the read: a conversation\'s stop asked twice runs ONCE (the latest); 301 distinct waits keep the newest 256, the 45 let go said each', w);
    const wk = await waitsScene({ HostManager: MJ.load('src/hosts.js', anchored(HSRC, KEYED, 'const k = Symbol(what), again = false;   /* MUTANT: no key */', 'srl-87a'), 'waits-unkeyed').HostManager }, 'hosts-waits-unkeyed');
    const wb = await waitsScene({ HostManager: MJ.load('src/hosts.js', anchored(HSRC, BOUND, '    if (false) {   /* MUTANT: no bound */', 'srl-88a'), 'waits-unbound').HostManager }, 'hosts-waits-unbound');
    ok(wk.stops === 'stop-a1,stop-a2' && wb.ran === 301 && wb.said === 0, 'CONTROLS: waits with no key run a conversation\'s stop twice; waits with no bound keep every one — each RED', { wk, wb });
    // 主开发 04:33Z (3): a wait LET GO is named in the line, and a remote stop's is TOLD (its onLetGo: a server notice naming the
    // conversation the person was told «stops as soon as they read»); CONTROL: the onLetGo call cut
    const LETGO = '      if (w0.onLetGo) { try { w0.onLetGo(); }';
    ok(HSRC.split(LETGO).length === 2, 'control setup: the let-go\'s telling is found once');
    const letGoScene = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'hosts.json'); plant(F, body);
      const H = new Mod.HostManager({ dataDir: d });
      const told = [], lines = [], ran = [], warn = console.warn; console.warn = (m) => { lines.push(String(m)); };
      try {
        H.whenRead(() => ran.push('stop'), 'the remote stop of conversation conv-lg', 'stop:conv-lg', { onLetGo: () => told.push('conv-lg') });
        for (let i = 0; i < 256; i++) H.whenRead(() => ran.push('sweep'), `a sweep ${i}`);
      } finally { console.warn = warn; }
      unplant(F, body);
      if (H.readAgain) await H.readAgain();
      return { told: told.join(), named: lines.some((l) => /the oldest is let go \(it will not run at the read\): the remote stop of conversation conv-lg$/.test(l)), stopRan: ran.includes('stop'), ran: ran.length };
    };
    const lg = await letGoScene({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-waits-letgo');
    const lgx = await letGoScene({ HostManager: MJ.load('src/hosts.js', anchored(HSRC, LETGO, '      if (false) { try { w0.onLetGo(); }', 'waits-letgo-untold'), 'waits-letgo-untold').HostManager }, 'hosts-waits-letgo-mut');
    ok(lg.told === 'conv-lg' && lg.named && !lg.stopRan && lg.ran === 256, 'a remote stop LET GO past the bound: the line names it, and its onLetGo tells the person (it never runs at the read)', lg);
    ok(lgx.told === '' && lgx.named, 'CONTROL (the telling cut, in a copy): the stop is let go said only in the log — the person still believes the conversation stops — RED', lgx);
    const WSH = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8');
    const LGKEY = 'The session «{name}» on {machine} was not stopped — VibeSpace could not read its paired machines, and so many actions waited for them that its stop was let go. It may still be running there: stop it again once the machines read.';
    ok(/hosts\.whenRead\(remoteStop, `the remote stop of conversation \$\{data\.sessionId\}`, `stop:\$\{data\.sessionId\}`, \{ onLetGo: \(\) => notifyKillLetGo\(session\.name \|\| data\.sessionId, /.test(WSH)
      && WSH.includes("i18n: { key: i18nKey('" + LGKEY + "'), params: { name: String(name), machine: String(hostName) } }")
      && ['zh', 'ja'].every((lang) => fs.readFileSync(path.join(ROOT, `src/lib/i18n-${lang}.js`), 'utf8').includes(JSON.stringify(LGKEY) + ':')),
    'WIRING: the Terminate\'s remote stop that waits for the machines carries its onLetGo — a server notice naming the conversation and its machine (zh / ja rows)');
  }
  // 主开发 01:20Z (6): the boot's legacy dial-token migration while held WAITS for the read (said so — never «failed»), the legacy file
  // kept; at the read it runs; CONTROL: a copy with no held branch throws the hold at the boot (its line: «failed»)
  {
    const MIG = "\n    if (this._unread) { this.whenRead(() => { this._migrateDialTokensAtRead(file); }";   // from its line's start: the read-time method repeats the rest
    ok(HSRC.split(MIG).length === 2, 'control setup: the migration\'s held branch is found once');
    const migScene = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'hosts.json'), L = path.join(d, 'dial-tokens.json'); plant(F, body);
      fs.writeFileSync(L, JSON.stringify({ 'dev-0001': 'a'.repeat(64) }));
      const H = new Mod.HostManager({ dataDir: d });
      const lines = [], warn = console.warn; console.warn = (...a) => lines.push(a.join(' '));
      let r = null, threw = null; try { r = H.migrateDialTokenFile(L); } catch (e) { threw = e.code || String(e.message); } finally { console.warn = warn; }
      const keptWhileHeld = fs.existsSync(L);
      unplant(F, body);
      // 主开发 04:33Z (4): the run AT THE READ never reads the legacy file on the main loop (the folder that was failing) — counted
      let syncReads = 0; const rfs = fs.readFileSync, efs = fs.existsSync;
      fs.readFileSync = function (f, ...a) { if (String(f) === L) syncReads++; return rfs.call(this, f, ...a); };
      fs.existsSync = function (f, ...a) { if (String(f) === L) syncReads++; return efs.call(this, f, ...a); };
      try {
        if (H.readAgain) await H.readAgain();
        for (let i = 0; i < 200 && !(H.dialTokenHash && H.dialTokenHash('dev-0001')); i++) await new Promise((res) => setTimeout(res, 5));   // its async read
      } finally { fs.readFileSync = rfs; fs.existsSync = efs; }
      return { r, threw, said: lines.some((l) => /the dial-token migration \(dial-tokens\.json into hosts\.json\) waits for hosts\.json to read/.test(l)), keptWhileHeld, hash: H.dialTokenHash ? H.dialTokenHash('dev-0001') : null, syncReads };
    };
    const m = await migScene({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-mig');
    ok(m.r === false && !m.threw && m.said && m.keptWhileHeld && m.hash === 'a'.repeat(64) && m.syncReads === 0, 'the legacy dial-token migration while held waits for the read (its line says so), the legacy file kept; at the read the hash is in hosts.json — read OFF the main loop (no sync read of the legacy file)', m);
    const ms = await migScene({ HostManager: MJ.load('src/hosts.js', anchored(HSRC, MIG, "\n    if (this._unread) { this.whenRead(() => { try { this.migrateDialTokenFile(file); } catch { } }", 'mig-sync-at-read'), 'mig-sync-at-read').HostManager }, 'hosts-mig-sync');
    ok(ms.hash === 'a'.repeat(64) && ms.syncReads >= 2, 'CONTROL (the wait runs the boot\'s synchronous migration, in a copy): at the read the legacy file is stat\'d and read ON the main loop, in the folder that was failing — RED', ms);
    const mx = await migScene({ HostManager: MJ.load('src/hosts.js', anchored(HSRC, MIG, '\n    if (false) { this.whenRead(() => { this._migrateDialTokensAtRead(file); }', 'srl-146a'), 'mig-unheld').HostManager }, 'hosts-mig-unheld');
    ok(mx.threw === 'hosts-unread' && !mx.said, 'CONTROL (no held branch, in a copy): the migration throws the hold at the boot — its line was «failed» — RED', mx);
  }
  // torn bytes (2b, 主开发 r3790 decision 1): HELD while they are copied aside OFF the loop by the helper's keep (once a content), then
  // the list starts empty — the start makes NO synchronous copy; for that moment a lookup of a machine refuses by name
  {
    const d = path.join(D, 'hosts-torn'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'hosts.json'), '{"hosts": [');
    const H = new (require(path.join(ROOT, 'src/hosts.js')).HostManager)({ dataDir: d });
    const atStart = { held: !!H.unreadWords(), copies: fs.readdirSync(d).filter((n) => /^hosts\.json\.corrupt-\d+/.test(n)).length };
    let refused = null; try { H.get('h-0001'); } catch (e) { refused = e && e.code; }
    await liftOf(H, 'the torn hosts.json (2b)');   // r4362: waited on the lift itself (the copy lands off the loop), its expiry a named line
    const asides = fs.readdirSync(d).filter((n) => /^hosts\.json\.corrupt-\d+/.test(n));
    ok(atStart.held && atStart.copies === 0 && refused === 'hosts-unread' && !H.unreadWords() && H.list().length === 0 && asides.length === 1 && fs.readFileSync(path.join(d, asides[0]), 'utf8') === '{"hosts": [' && H.tornCopy() === asides[0], 'torn bytes (2b, decision 1): HELD while they are copied aside off the loop — no synchronous copy at the start, a lookup refused by name for that moment — then KEPT once and the machines list starts empty (tornCopy() names its copy)', { atStart, refused, asides });
    H._hold.stop();
  }
  // r4362 (主开发 r4340 law 3): THE RACE MADE RED AT WILL — the same torn hosts.json with the copy aside HELD at its link (a placed hold
  // on fs.promises.link, the keep's last step): the OLD wait, 5000 turns, ends with the store STILL HELD — a leg judged then read a
  // held store; released, the wait on the lift sees it lift, and the copy went through the held link
  {
    const d = path.join(D, 'hosts-torn-placed'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'hosts.json'), '{"hosts": [');
    const realLink = fs.promises.link; let release = null, linkAsked = 0; const gate = new Promise((r) => { release = r; });
    fs.promises.link = async (...a) => { linkAsked++; await gate; return realLink.apply(fs.promises, a); };
    let H = null, heldAfterTurns = null, lifted = false;
    try {
      H = new (require(path.join(ROOT, 'src/hosts.js')).HostManager)({ dataDir: d });
      for (let k = 0; k < 5000 && H.unreadWords(); k++) await new Promise((r) => setImmediate(r));   // the OLD wait, as it stood
      heldAfterTurns = !!H.unreadWords();
      release(); lifted = await liftOf(H, 'the placed torn hosts.json, its link released');
    } finally { release(); fs.promises.link = realLink; if (H) H._hold.stop(); }
    const asides = fs.readdirSync(d).filter((n) => /^hosts\.json\.corrupt-\d+/.test(n));
    ok(heldAfterTurns === true && lifted && linkAsked >= 1 && asides.length === 1, `PLACED (r4340 law 3): the copy aside held at its link — the old wait (5000 turns) ended with the store STILL HELD (red at will for a leg judged then); released, the wait on the lift saw it lift through the held link (${linkAsked} link asked, ${asides.length} copy)`, { heldAfterTurns, lifted, linkAsked, asides });
  }
  // 2b (主开发 r3648 / r3792): three laws this store proved on its own road are the FAMILY HELPER's now, proved there with their reds —
  // retired here: «missing» right after «unreadable» is read once more (test-store-read-three ⑤ «a file GONE right after a failed read
  // is read once more»); the next try armed FIRST, on a meeting and on a failed read — its read r1 (M2) / r2 (X5) (⑤ «the next try is
  // armed FIRST»); only the newest try lifts — its read r2 (X2) / r3 (Y4): the helper's ONE read in flight is the read AND its copy, so
  // no older try's copy can land after a newer try (⑤ «one in flight is the read AND its copy»)
  // the cure (主开发 23:20Z): the SAVE's own guard has its red control (it covers the timers' saves and the stop's flush — removing
  // only it left every leg green)
  {
    const saveH = (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'hosts.json'); plant(F, body);
      const H = new Mod.HostManager({ dataDir: d });
      H._state.hosts.push({ id: 'h-x', name: 'x', transport: 'ssh', host: 'x.invalid', user: 'u' });
      H._save(); H.flushThrottled();   // the meeting with B-48a4 (hub-loop-stalls): a save is the store writer's, QUEUED — what it owes is written NOW, so a write that slipped the guards would be on disk here
      const kept = bodyOf(F) === (asRoot ? '(a folder)' : body);
      if (H._hold) H._hold.stop(); if (!asRoot) { try { fs.chmodSync(F, 0o644); } catch { } }
      return kept;
    };
    const SAVEH = "    if (!this._hold.writable('a hosts.json write')) return false;   // (said once a hold, by the helper)\n";   // 2b: the guard asks the helper's hold
    ok(HSRC.split(SAVEH).length === 2, 'control setup: the anchor of the control «the save\'s guard» is in hosts.js');
    const k = saveH({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-save-guard');
    // the meeting with B-48a4: the queued write's PRODUCER refuses while held too (law 2: a write queued before a hold never lands
    // the held, empty list) — so the control removes BOTH guards, and a second one shows the producer's alone still keeps the file
    const PRODH = "produce: () => { if (this._unread) throw Object.assign(";
    ok(HSRC.split(PRODH).length === 2, 'control setup: the anchor of the control «the producer\'s guard» is in hosts.js');
    const k1 = saveH(MJ.load('src/hosts.js', anchored(HSRC, SAVEH, '    /* MUTANT: no save guard */\n', 'srl-267a'), 'hosts-no-save-guard'), 'hosts-save-guard-first');
    const kx = saveH(MJ.load('src/hosts.js', anchored(anchored(HSRC, SAVEH, '    /* MUTANT: no save guard */\n', 'srl-268a'), PRODH, 'produce: () => { if (false) throw Object.assign(', 'srl-268b'), 'hosts-no-guards'), 'hosts-save-guard-mut');
    if (asRoot) rootSkip('CONTROL hosts.json: both save guards removed, the save writes over the held file');
    ok(k && k1, 'the save itself refuses while held (a timer\'s save, the stop\'s flush), and the queued write\'s producer refuses too (the first guard removed: still kept)', { k, k1 });
    if (!asRoot) ok(!kx, 'CONTROL (both guards removed, in a copy): the save WRITES OVER the held file', { kx });
  }
  // the cure: the lift re-judges reach ONLY for what it read — a read with machines does, an empty lift (the file gone) does not
  {
    const reach = async (Mod, name, gone) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'hosts.json'); plant(F, body);
      const H = new Mod.HostManager({ dataDir: d }); let n = 0; H.onReachChange = () => { n++; };
      if (gone) { if (asRoot) fs.rmdirSync(F); else fs.rmSync(F, { force: true }); await H.readAgain(); await H.readAgain(); }
      else { unplant(F, body); await H.readAgain(); }
      H._hold.stop(); return { lifted: !H.unreadWords(), n };
    };
    const RJ = "    if (a.state === 'data') this._reachChanged('hosts.json read');";
    ok(HSRC.split(RJ).length === 2, 'control setup: the anchor of the control «reach only for what was read» is in hosts.js');
    const withData = await reach({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-reach-data', false);
    const empty = await reach({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-reach-empty', true);
    const emptyX = await reach(MJ.load('src/hosts.js', anchored(HSRC, RJ, "    this._reachChanged('hosts.json read');   /* MUTANT: every lift re-judges */", 'srl-287a'), 'hosts-reach-every'), 'hosts-reach-empty-mut', true);
    ok(withData.lifted && withData.n === 1 && empty.lifted && empty.n === 0 && emptyX.lifted && emptyX.n === 1, 'the lift re-judges reach for the machines it READ (once) and never for an empty lift (a prune over it cleared every exit list); CONTROL (every lift re-judges, in a copy): the empty lift re-judges', { withData, empty, emptyX });
  }
  // the cure: the read again has a DEADLINE — a read that has not answered is said and let go as the try's own; ONE read at most
  // (its read S3: each hung read holds a thread of the pool) — no second read while it hangs; and its read r2 (S5): its answer is
  // JUDGED WHEN IT COMES (a dropped late answer kept slow storage held for ever), the words saying a read waits meanwhile
  {
    const HOLDS = { prf: fs.promises.readFile };
    const deadlineScene = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'hosts.json'); plant(F, body);
      const H = new Mod.HostManager({ dataDir: d }); H._readMs = 30;
      let calls = 0, release = null;
      const hung = new Promise((r) => { release = r; });
      fs.promises.readFile = function (f, ...a) { if (String(f) === F) { calls++; return calls === 1 ? hung : HOLDS.prf.call(this, f, ...a); } return HOLDS.prf.call(this, f, ...a); };
      const keep = setInterval(() => { }, 1000);   // the deadline's timer is unref'd (the hub's own loop keeps it): the suite keeps the loop up
      let out = null;
      try {
        await H.readAgain();   // its read hangs: said and let go at the helper's bound (2b: hosts' own knob, _readMs)
        const afterHung = { waiting: !!(H._hold.held() || {}).waiting, held: !!H.unreadWords(), words: String(H.unreadWords() || '') };
        await H.readAgain();   // the read still hangs: no second read
        const whileHung = calls;
        release(body); for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r));   // the storage answers — late
        out = { afterHung, whileHung, calls, lifted: !H.unreadWords(), list: H.list().map((h) => h.id).join() };
      } finally { fs.promises.readFile = HOLDS.prf; clearInterval(keep); H._hold.stop(); unplant(path.join(d, 'hosts.json'), body); }
      return out;
    };
    const back = await deadlineScene(require(path.join(ROOT, 'src/hosts.js')), 'hosts-deadline');
    ok(!!back && back.afterHung.held && back.afterHung.waiting && /a read of it is still waiting/.test(back.afterHung.words) && back.whileHung === 1 && back.calls === 1 && back.lifted && back.list === 'h-0001',
      'a read again that hangs is said and let go at its deadline (the words say a read waits), no second read starts while it hangs (one thread of the pool), and its LATE answer lifts the hold the moment it comes', back);
    // 2b: its two controls («the late answer judged», «one read at most») are the HELPER's now, each with its red there —
    // test-store-read-three ⑤ «a read that hangs» (the in-flight mark cut; the answer dropped) and ⑤ «a read past its bound» (the bound cut)
  }
  // the cure (主开发 23:20Z): the device-upgrade watch files no «rerun its install command» while the machines are held — the
  // device's dials are answered «wait» there (its silence is the hub's)
  {
    const UW = fs.readFileSync(path.join(ROOT, 'src/server/device-upgrade-watch.js'), 'utf8'), HG = '    try { if (held()) { heldUntil = now(); return false; } } catch { }\n';
    ok(UW.split(HG).length === 2, 'control setup: the anchor of the control «the watch judges nothing while held» is in device-upgrade-watch.js');
    const watch = (Mod, name, isHeld) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      let t = 1_000_000; const filed = [];
      const W = Mod.create({ dataDir: d, userTodos: { add: (k, it) => { filed.push(it); return { id: 'it-' + filed.length, text: it.text }; } }, now: () => t, tickMs: 0, held: () => isHeld });
      W.begun({ hostKey: 'dial:dev-0001', machine: 'build box', from: '1.0.0', to: '1.0.1' });
      t += Mod.GONE_AFTER_MS + 1000;
      const r = W.sweep(); try { W.stop && W.stop(); } catch { }
      return { r, filed: filed.length };
    };
    const MW = require(path.join(ROOT, 'src/server/device-upgrade-watch.js'));
    const h = watch(MW, 'upw-held', true), f = watch(MW, 'upw-free', false);
    const hx = watch(MJ.load('src/server/device-upgrade-watch.js', anchored(UW, HG, '    /* MUTANT: judged while held */\n', 'srl-341a'), 'upw-no-held'), 'upw-held-mut', true);
    ok(h.filed === 0 && f.filed === 1 && hx.filed === 1, 'the device-upgrade watch files NOTHING while the machines are held (a silent device after its upgrade began is judged after the read) and files as before otherwise; CONTROL (judged while held, in a copy): «rerun its install command» filed', { h, f, hx });
    // its read S2: the silence is counted from the hold's END — the first sweep after the read (the device has not re-dialled yet)
    // files nothing; a device still silent a full window after the read is told
    const lift = (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      let t = 1_000_000, isHeld = true; const filed = [];
      const W = Mod.create({ dataDir: d, userTodos: { add: (k, it) => { filed.push(it); return { id: 'it-' + filed.length, text: it.text }; } }, now: () => t, tickMs: 0, held: () => isHeld });
      W.begun({ hostKey: 'dial:dev-0002', machine: 'build box', from: '1.0.0', to: '1.0.1' });
      t += Mod.GONE_AFTER_MS + 1000; W.sweep();   // held through the whole window
      isHeld = false; t += 30_000; W.sweep(); const atLift = filed.length;   // the first sweep after the read
      t += Mod.GONE_AFTER_MS; W.sweep(); const later = filed.length;          // still silent a full window after the read
      try { W.stop && W.stop(); } catch { }
      return { atLift, later };
    };
    const MAXH = 'now() - Math.max(Number(g.at || 0), heldUntil) < goneAfterMs';
    ok(UW.split(MAXH).length === 2, 'control setup: the anchor of the control «silence from the hold\'s end» is in device-upgrade-watch.js');
    const l = lift(MW, 'upw-lift'), lx = lift(MJ.load('src/server/device-upgrade-watch.js', anchored(UW, MAXH, 'now() - Number(g.at || 0) < goneAfterMs', 'srl-358a'), 'upw-from-begin'), 'upw-lift-mut');   // stale-pins: kept (the control plants the release's text in a copy)
    ok(l.atLift === 0 && l.later === 1 && lx.atLift === 1, 'its read S2: the first sweep after the read files nothing (the silence is counted from the hold\'s end) and a device silent a full window after it is told; CONTROL (counted from the upgrade\'s start, in a copy): the healthy device is told at the lift', { l, lx });
  }
  // its read r3 (Y1): the hub-act asker's re-judgement (boot + every sweep) on a HELD list ends NOTHING — a stored standing Deny is
  // never rewritten to «ask-over» as «its machine is gone»
  {
    const HSA = fs.readFileSync(path.join(ROOT, 'src/server/hub-act-ask.js'), 'utf8');
    const GUARD = "    if (hosts && typeof hosts.unreadWords === 'function' && hosts.unreadWords()) return 0;\n";
    ok(HSA.split(GUARD).length === 2, 'control setup: the anchor of the control «the asker judges nothing while held» is in hub-act-ask.js');
    const run = (Mod) => {
      let A = null; const calls = [];
      const item = () => ({ id: 'it-ha01', status: 'open', action: { type: A ? A.STANDING_TYPE : '(not yet)', askId: 'hs-ha01', hostId: 'h-0001', kind: 'run', by: 'job:jb-0000aaaa', machine: 'build box' } });
      const ut = { snapshot: () => ({ open: [item()] }), idsWhere: () => [], get: (id) => (id === 'it-ha01' ? item() : null), setStatus: (...a) => calls.push(['setStatus', ...a]), resolveAnswered: (...a) => calls.push(['resolveAnswered', ...a]), add: () => ({ id: 'it-new' }), onStatus: () => () => { } };
      const held = { unreadWords: () => 'hosts.json could not be read (EACCES)', get: () => { throw new Error('host not found'); } };
      A = Mod.create({ hosts: held, userTodos: ut, log: () => { } });
      A.reconcile();
      return { standing: A.standingList().length, calls: calls.map((c) => c[0]) };
    };
    const got = run(require(path.join(ROOT, 'src/server/hub-act-ask.js')));
    const gotx = run(MJ.load('src/server/hub-act-ask.js', anchored(HSA, GUARD, '    /* MUTANT: no hold check */\n', 'srl-377a'), 'hub-act-no-held'));
    ok(got.standing === 1 && gotx.standing === 0, 'its read r3 (Y1): on a HELD hosts list the asker\'s boot re-judgement keeps the stored standing subject (its Deny with it); CONTROL (no hold check, in a copy): it is ENDED as «its machine is gone»', { got, gotx });
  }
  // its read r2 (X1): desktop-access answers a HELD list «unavailable» (the keeper marks offline) — never «not a paired machine»
  // (the keeper deletes a removed machine's desktop-app records on that code)
  {
    const ACC = require(path.join(ROOT, 'src/server/desktop-access.js'));
    const held = { unreadWords: () => 'hosts.json could not be read (EACCES)', get: () => { throw new Error('host not found'); }, deviceBounded: async () => { throw new Error('no device'); }, isLocal: () => false };
    const codeOf = async (A) => { try { await A.create({ hosts: held, log: { log() { }, warn() { } } }).call('h-0001', 'status', {}); return 'answered'; } catch (e) { return e && e.code; } };
    const got = await codeOf(ACC);
    const DSRC = fs.readFileSync(path.join(ROOT, 'src/server/desktop-access.js'), 'utf8'), NH = '    notHeld();\n    if (!hostKnown(hostId)) throw namedByCopy(hostId) ? named(';   // (B-f276 family unit 2 commit 3: the line asks the kept copies too)
    ok(DSRC.split(NH).length === 2, 'control setup: the anchor of the control «a held list is unavailable» is in desktop-access.js');
    const gotx = await codeOf(MJ.load('src/server/desktop-access.js', anchored(DSRC, NH, '    /* MUTANT: no hold check */\n    if (!hostKnown(hostId)) throw namedByCopy(hostId) ? named(', 'srl-389a'), 'no-held-check'));
    ok(got === 'host_unavailable' && gotx === 'unsupported-host', 'its read r2 (X1): a desktop call on a machine while hosts.json is HELD answers host_unavailable (the keeper marks it offline); CONTROL (no hold check, in a copy): «unsupported-host» — the code on which the keeper DELETES every machine\'s desktop-app records', { got, gotx });
  }
  const ER = fs.readFileSync(path.join(ROOT, 'src/server/exit-routes.js'), 'utf8');
  ok(/res\.json\(\{ hosts: list, key: \{ exists: k\.exists, path: k\.path, publicKey: k\.publicKey \}, \.\.\.\(hosts\.unreadWords && hosts\.unreadWords\(\) \? \{ unread: hosts\.unreadWords\(\) \} : \{\}\)(?:, \.\.\.\(typeof hosts\.tornCopy === 'function' && hosts\.tornCopy\(\) \? \{ torn: hosts\.tornCopy\(\) \} : \{\}\))? \}\);/.test(ER)
    && /app\.delete\('\/api\/hosts\/:id', async \(req, res\) => \{\n  if \(hosts\.unreadWords && hosts\.unreadWords\(\)\) return res\.status\(503\)/.test(ER)
    && /app\.patch\('\/api\/hosts\/:id\/exit-access', async \(req, res\) => \{\n  if \(isAnyBearer\(req\)\) return res\.status\(403\)[^\n]*\n  if \(hosts\.unreadWords && hosts\.unreadWords\(\)\) return res\.status\(503\)/.test(ER),
  'WIRING: the machines list answers WHY it is empty; a removal and an exit-access change are refused BEFORE their side effects (the unpair teardown, the grants store) — an agent token still meets its own 403 first');
  const DP = fs.readFileSync(path.join(ROOT, 'src/server/dial-pairing.js'), 'utf8'), PS = fs.readFileSync(path.join(ROOT, 'src/routes/persistence.js'), 'utf8'), AU = fs.readFileSync(path.join(ROOT, 'src/server/account-usage-routes.js'), 'utf8');
  ok(/if \(hosts\.unreadWords && hosts\.unreadWords\(\)\) \{ holdDial\(socket, deviceId\); return null; \}\n  const want = hosts\.dialTokenHash\(deviceId\);/.test(DP) && /HTTP\/1\.1 503 Service Unavailable/.test(DP)
    && /if \(hostsHeld\) return res\.status\(503\)/.test(PS) && /const lists = r && r\.skipped \? null :/.test(PS)
    && (AU.match(/if \(hosts\.whenRead\) hosts\.whenRead\(sweep, `the token-copy sweep of account \$\{rid\} on every machine`, `token-sweep:\$\{rid\}`\); else sweep\(\);/g) || []).length === 2 && /hosts\.onReadAgain = \(\) => bcastAll\(\{ type: 'hosts-updated' \}\);/.test(ER),
  'WIRING (its read r1): a dial met while held is a 503 the device retries (never «pair again»), an export that asks for the machines is refused with its reason, an import adds no exit lists for machines it skipped, both token sweeps wait for the read, the lift is broadcast');
}

// ── 主开发 04:33Z (2): the hunt's standing — a reply or a teardown that ran ahead of hosts.json's QUEUED save (B-48a4's writer)
console.log('§1b a removal on disk before it is said or torn down: the graduate-dial removal\'s reply, a machine\'s own files');
{
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
  // (2a) the graduate-dial route's REMOVE branch: «removed» waits for hosts.json (as the graduation road does) — the route's own handler,
  //      compiled from the wiring over a stand-in machines store whose landing is placed (stalled / refused)
  const WSRC = fs.readFileSync(path.join(ROOT, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const GD0 = "app.post('/api/hosts/:id/graduate-dial', async (req, res) => {", GDW = "      if (typeof hosts.persisted === 'function' && !(await hosts.persisted())) return res.status(503).json({ error: 'the dial pairing is removed here, but hosts.json is not on disk yet";
  ok(WSRC.split(GD0).length === 2 && WSRC.split(GDW).length === 2, 'control setup: the graduate-dial route and its removal\'s wait for the disk are found once');
  const routeOf = (src, landing) => {
    const i = src.indexOf(GD0), j = src.indexOf('\n});\n', i); let handler = null; const calls = [];
    const hosts = { get: (id) => ({ id, name: 'old box', transport: 'ssh', dialRoot: '', deviceId: null }), sshArgs: () => [], sshEnv: () => ({}), ungraduateDial: (id) => calls.push(id), persisted: () => landing(), upgradeRunning: () => false };   // lane lg-remote-hardening's meeting: Remove dial-out first asks whether an upgrade runs (none here)
    new Function('app', 'hosts', 'agentdDials', 'bcastAll', 'require', 'fs', 'path', 'rootDir', 'graduateHostToDial', src.slice(i, j + 4))(   // eslint-disable-line no-new-func
      { post: (p, fn) => { handler = fn; } }, hosts, new Map(), () => { }, (m) => { throw new Error(`the removal road loads nothing (${m})`); }, fs, path, ROOT, null);
    return { handler, calls };
  };
  const ask = async (src, landing) => {
    const { handler, calls } = routeOf(src, landing); let sent = null;
    const res = { status(c) { this.c = c; return this; }, json(b) { sent = { status: this.c || 200, ...b }; return this; } };
    const p = handler({ params: { id: 'h-0002' }, body: { remove: true }, socket: {} }, res);
    return { p, calls, sent: () => sent };
  };
  let release = null;
  const st = await ask(WSRC, () => new Promise((r) => { release = r; }));   // the landing STALLS (a write queued behind others)
  await tick(); const beforeLanded = st.sent(); release(true); await st.p;
  const rf = await ask(WSRC, async () => false); await rf.p;                // the landing is REFUSED (its write failed / timed out)
  const rfx = await ask(anchored(WSRC, GDW, '      if (false) return res.status(503).json({ error: \'the dial pairing is removed here, but hosts.json is not on disk yet', 'graduate-remove-nowait'), async () => false); await rfx.p;
  ok(st.calls.join() === 'h-0002' && beforeLanded === null && !!st.sent() && st.sent().removed === true && !!rf.sent() && rf.sent().status === 503 && rf.sent().code === 'not_durable' && !rf.sent().removed,
    'a graduate-dial REMOVAL: no reply while hosts.json\'s save is still queued (stalled) — «removed» once it landed; a landing refused answers 503 not_durable, never «removed»', { beforeLanded, stalled: st.sent(), refused: rf.sent() });
  ok(!!rfx.sent() && rfx.sent().removed === true, 'CONTROL (the wait cut, in a copy): «removed» while hosts.json never carried it — a restart brings the pairing back — RED', rfx.sent());
  // (2b) src/hosts.js remove: the record LANDS first — the machine's own key file, its transcript cache and the removal listeners after it
  const HSRC1 = fs.readFileSync(path.join(ROOT, 'src/hosts.js'), 'utf8');
  const AFTER = '    return this._whenRemovalLands(id).then((landed) => {';
  ok(HSRC1.split(AFTER).length === 2, 'control setup: the removal\'s wait for its record to land is found once');
  const rmScene = async (Mod, name, landing) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const H = new Mod.HostManager({ dataDir: d });
    H._storeWriter = { dirty: () => { }, durable: () => Promise.resolve(true), whyNotDurable: () => null };
    const id = H.add({ name: 'lab box', user: 'u', host: 'lab.invalid' });
    const kf = path.join(H._sshDir, `${id}.key`); fs.mkdirSync(H._sshDir, { recursive: true }); fs.writeFileSync(kf, 'a key file', { mode: 0o600 });
    const rec = H._state.hosts.find((x) => x.id === id); rec.keyPath = kf;
    const cache = path.join(d, 'remote-jsonl', id); fs.mkdirSync(cache, { recursive: true }); fs.writeFileSync(path.join(cache, 'c.jsonl'), '{}\n');
    const heard = []; H.onRemoved((x) => heard.push(x));
    const state = () => ({ listed: H._state.hosts.some((x) => x.id === id), key: fs.existsSync(kf), cache: fs.existsSync(cache), heard: heard.length });
    H._removalRetryMs = 5;   // the suite's pace (the hub's: a minute)
    let rel = null, asks = 0;
    // 'stall': the one landing waits (released below); 'refused': refused twice, then made; 'back': refused, and the record comes back
    H._storeWriter.durable = landing === 'stall' ? () => { asks++; return new Promise((r) => { rel = r; }); } : () => { asks++; return Promise.resolve(landing === 'refused' && asks > 2); };
    const lines = [], warn = console.warn; console.warn = (m) => lines.push(String(m));
    let before = null, after = null, answer = null;
    try {
      const p = H.remove(id); await tick();
      before = state();
      if (landing === 'back') { H._state.hosts.push(rec); }
      if (rel) rel(true);
      answer = await Promise.race([p, new Promise((r) => setTimeout(() => r('(still waiting)'), 2000))]);
      after = state();
    } finally { console.warn = warn; }
    return { before, after, answer, asks, said: lines.some((l) => l.includes(`${id} is removed here, but hosts.json does not carry it yet`)), back: lines.some((l) => l.includes(`${id} is back in the machines list`)) };
  };
  const H0 = require(path.join(ROOT, 'src/hosts.js'));
  const rs = await rmScene(H0, 'hosts-rm-stall', 'stall'), rr = await rmScene(H0, 'hosts-rm-refused', 'refused'), rb = await rmScene(H0, 'hosts-rm-back', 'back');
  const rsx = await rmScene(MJ.load('src/hosts.js', anchored(HSRC1, AFTER, '    return Promise.resolve(true).then((landed) => {   /* MUTANT: the release order — torn down before the record lands */', 'remove-before-landed'), 'remove-before-landed'), 'hosts-rm-stall-mut', 'stall');
  ok(!!rs.before && !rs.before.listed && rs.before.key && rs.before.cache && rs.before.heard === 0 && !!rs.after && !rs.after.key && !rs.after.cache && rs.after.heard === 1 && rs.answer === true,
    'a machine removed while hosts.json\'s save is still QUEUED: gone from the list at once, its key file, its transcript cache and the removal listeners wait — all torn down once the record landed', rs);
  ok(!!rr.before && rr.before.key && rr.before.heard === 0 && rr.said && rr.asks === 3 && !!rr.after && !rr.after.key && !rr.after.cache && rr.after.heard === 1 && rr.answer === true,
    'its read r1 (S1, S3): a landing REFUSED is asked again (never given up — said once) and the teardown runs when it lands at the third ask', rr);
  ok(!!rb.after && rb.after.key && rb.after.cache && rb.after.heard === 0 && rb.answer === false && rb.back, 'its read r1 (S3): a record that comes BACK before its removal landed keeps its key file, its cache and its sign-ins (said)', rb);
  ok(!!rsx.before && !rsx.before.key && !rsx.before.cache && rsx.before.heard === 1, 'CONTROL (the release order, in a copy): the key file unlinked and the listeners told before the record landed — a restart brings the machine back keyless — RED', rsx);
}

console.log('§2 machine-mounts.json (src/machine-mounts.js) — every mount of a paired machine, each push record\'s token id');
{
  const MSRC = fs.readFileSync(path.join(ROOT, 'src/machine-mounts.js'), 'utf8');
  const LOAD = "    if (this._hold.start(a0) !== 'held') this._loadAnswer(a0); else this._state = { mounts: [] };   // held: no mount listed until the lift\n";   // 2b commit 3: the start through the family helper
  ok(MSRC.split(LOAD).length === 2, 'control setup: the anchor of the control «the release\'s load» is in machine-mounts.js (its hold started once in the constructor)');
  const RELEASE = MJ.load('src/machine-mounts.js', anchored(MSRC, LOAD, "    try { this._state = JSON.parse(read.text); } catch { try { if (fs.existsSync(this._file)) fs.copyFileSync(this._file, this._file + '.corrupt-' + Date.now()); } catch { } this._state = { mounts: [] }; this._migrateLegacy(); }   /* MUTANT: the release — any failure starts EMPTY and ingests the legacy stores */\n", 'srl-480a'), 'release-mounts');
  // ONE push record (a push mount is only re-owned at restore, never released on this machine — the scene runs nothing outside)
  const rec = { id: 'mm-0001', dir: 'push', hostId: 'h-0001', folder: '/srv/share', mode: 'ro', mountpoint: '/mnt/share', tokenId: 'tok-0001', createdAt: 1 };
  const body = JSON.stringify({ mounts: [rec] }), legacy = JSON.stringify({ mounts: [{ id: 'old-0001', hostId: 'h-0002', folder: '/x', mountpoint: '/y' }] });
  const deps = (d, revoked, logs) => ({ dataDir: d, hosts: { get: () => null, findByDeviceId: () => null }, mountTokens: { list: () => [{ id: 'tok-0001', kind: 'reverse-mount' }], revoke: (id) => revoked.push(id) }, broadcast() { }, log: (m) => logs.push(String(m)) });
  const scene = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'machine-mounts.json'), LEG = path.join(d, 'host-mounts.json');
    plant(F, body); fs.writeFileSync(LEG, legacy);
    const revoked = [], logs = [];
    const M = new Mod.MachineMounts(deps(d, revoked, logs));
    clearInterval(M._sweep);
    const held = !!(M.unreadWords && M.unreadWords()), listedWhileHeld = M.list().length;
    if (typeof M._copies === 'function') await M._copies().refresh();   // (B-f276 family unit 2 commit 3: the sweep asks the kept copies — restore reads them first)
    M.gcOrphanTokens();   // the boot's restore runs it 5 s on
    const revokedWhileHeld = revoked.slice();
    let refused = null; try { await M.unmount('mm-0001'); } catch (e) { refused = e; }
    const legacyKept = fs.existsSync(LEG) && !fs.existsSync(LEG + '.migrated');
    const kept = bodyOf(F) === (asRoot ? '(a folder)' : body);
    if (!asRoot) fs.chmodSync(F, 0o000);
    unplant(F, body);   // the storage answers again
    if (M.readAgain) await M.readAgain();
    await new Promise((r) => setImmediate(r));
    return { held, listedWhileHeld, revokedWhileHeld, refused: refused ? { code: refused.code, msg: String(refused.message) } : null, legacyKept, kept, back: M.list().map((m) => m.id).join(), words: M.unreadWords ? M.unreadWords() : null, revokedAfter: revoked.slice() };
  };
  const r = await scene(require(path.join(ROOT, 'src/machine-mounts.js')), 'mounts-held');
  ok(r.held && r.listedWhileHeld === 0 && r.revokedWhileHeld.length === 0 && !!r.refused && r.refused.code === 'mounts-unread' && /^removing a mount: machine-mounts\.json in VibeSpace's data folder could not be read \((EACCES|EISDIR)\); VibeSpace reads it again every few minutes\. No mount is lost: nothing is written over it/.test(r.refused.msg) && r.legacyKept,
    'machine-mounts.json unreadable at boot: HELD — no mount listed, the orphan-token sweep revokes NOTHING, a removal is refused by name, the legacy stores are not ingested over it', r);
  ok(r.kept && r.back === 'mm-0001' && r.words === null && r.revokedAfter.length === 0, 'nothing was written over machine-mounts.json while held; read again, its mount is back and the restore that runs then keeps its token (it has its record)', r);
  const rx = await scene(RELEASE, 'mounts-release');
  ok(!rx.held && rx.revokedWhileHeld.includes('tok-0001') && !(rx.refused && rx.refused.code === 'mounts-unread'), 'CONTROL (the release\'s load, in a copy): a failed read starts EMPTY — the sweep REVOKES the push mount\'s token', rx);
  if (asRoot) rootSkip('CONTROL machine-mounts.json: the release\'s legacy ingest writes over the held file'); else ok(!rx.legacyKept && !rx.kept, 'CONTROL (the release\'s load, in a copy): the legacy ingest WRITES OVER machine-mounts.json', rx);
  // torn bytes (2b commit 3, 主开发 r3790 decision 1): HELD while they are copied aside OFF the loop by the helper's keep (once a content),
  // then the list starts empty — no synchronous copy at the start; the one-time legacy ingest (the boot's road only) waits for the next
  // start, said
  {
    const d = path.join(D, 'mounts-torn'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'machine-mounts.json'), '{"mounts": [');
    const logs = [];
    const M = new (require(path.join(ROOT, 'src/machine-mounts.js')).MachineMounts)(deps(d, [], logs));
    clearInterval(M._sweep);
    const atStart = { held: !!M.unreadWords(), copies: fs.readdirSync(d).filter((n) => /^machine-mounts\.json\.corrupt-\d+/.test(n)).length };
    await liftOf(M, 'the torn machine-mounts.json (2b)');   // r4362: waited on the lift itself (the copy lands off the loop), its expiry a named line
    const asides = fs.readdirSync(d).filter((n) => /^machine-mounts\.json\.corrupt-\d+/.test(n));
    ok(atStart.held && atStart.copies === 0 && !M.unreadWords() && M.list().length === 0 && asides.length === 1 && fs.readFileSync(path.join(d, asides[0]), 'utf8') === '{"mounts": [' && logs.some((l) => /the one-time ingest of the legacy mount stores is not run mid-life/.test(l)), 'torn bytes (2b, decision 1): HELD while copied aside off the loop — no synchronous copy at the start — then KEPT once and the mounts list starts empty; the one-time legacy ingest waits for the next start (said)', { atStart, asides });
    M._hold.stop();
  }
  // B-f276 family unit 2 (主开发 r3081 — the law of r3019): TORN BYTES NEVER LIFT AS AN EMPTY LIST BY THEMSELVES. The lift is MARKED
  // (tornAt, saved at once); the REAL restore's first step, the orphan token sweep, revokes NOTHING minted before it (each push record
  // is unknown) — the release revoked every machine's token over the empty list; a PERSON's removal of a machine revokes its own
  {
    const run = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'machine-mounts.json'), '{"mounts": [ {"id": "mm-0001", "dir": "push", "hostId": "h-0001", "tokenId": "tok-0001"');   // torn: a push record cut mid-write
      const revoked = [], logs = [];
      const M = new Mod.MachineMounts(deps(d, revoked, logs)); clearInterval(M._sweep);
      await liftOf(M, `the torn push record (${name})`);   // 2b: HELD while its bytes are copied aside off the loop — the mark is the lift's (r4362: waited on the lift itself)
      const tornAt = M._state.tornAt;
      let saved = null; try { saved = JSON.parse(fs.readFileSync(path.join(d, 'machine-mounts.json'), 'utf8')); } catch { }
      try { await M.restore(); } catch { }
      return { M, revoked, tornAt, markSaved: !!saved && saved.tornAt === tornAt, copy: typeof M.tornCopy === 'function' ? M.tornCopy() : null, said: logs.filter((l) => /KEPT|revoked/.test(String(l))) };
    };
    const r = await run(require(path.join(ROOT, 'src/machine-mounts.js')), 'mounts-torn-sweep');
    ok(r.revoked.length === 0 && typeof r.tornAt === 'number' && r.markSaved && /^machine-mounts\.json\.corrupt-\d+$/.test(String(r.copy)) && r.said.some((l) => /minted before machine-mounts\.json's torn bytes are KEPT/.test(l)), 'TORN BYTES (r3081): the lift is MARKED, the mark saved at once; the REAL restore\'s orphan sweep revokes NOTHING minted before it (said once) — the copy named for the page', { revoked: r.revoked, tornAt: r.tornAt, markSaved: r.markSaved, copy: r.copy, said: r.said });
    r.M.mountTokens.list = () => [{ id: 'tok-0001', kind: 'reverse-mount', owner: 'h-0001' }, { id: 'tok-0002', kind: 'reverse-mount', owner: 'h-0002' }];
    await r.M.onMachineUnpaired('h-0001');
    ok(r.revoked.join() === 'tok-0001', 'a PERSON decides: removing that machine revokes ITS token (by owner) — the other machine\'s stays', r.revoked);
    // round wgbjnr750: THE TIME CUT — a true orphan minted AFTER the torn lift is revoked as before (only what the mark makes unknown
    // is kept); RED CONTROL: the cut read as «every token while marked»
    const tc = (M) => { const got = []; M.mountTokens.list = () => [{ id: 'tok-0003', kind: 'reverse-mount' }, { id: 'tok-0009', kind: 'reverse-mount', createdAt: (Number(M._state.tornAt) || 0) + 1000 }]; M.mountTokens.revoke = (id) => got.push(id); M.gcOrphanTokens(); return got; };
    const tcA = tc(r.M);
    const MSRCc = fs.readFileSync(path.join(ROOT, 'src/machine-mounts.js'), 'utf8');
    const rc = await run(MJ.load('src/machine-mounts.js', anchored(MSRCc, "          if (tornAt && !(Number(t.createdAt) > tornAt)) { unknown++; continue; }", "          if (tornAt) { unknown++; continue; }", 'srl-u2-time-cut'), 'time-cut-gone'), 'mounts-torn-time-ctl');
    ok(tcA.join() === 'tok-0009' && tc(rc.M).length === 0, 'THE TIME CUT (round wgbjnr750): a token minted after the torn lift is revoked as an orphan as before; one minted before it is kept — RED CONTROL (in a copy): the mark read as «every token»', { real: tcA });
    // round wgbjnr750: THE UN-PAIRING's refusal — after a torn lift, while mount-tokens.json is held, removing a machine is refused by
    // name (its tokens may have no record here, and a held store revokes nothing); RED CONTROL: that line cut
    r.M.mountTokens.unreadWords = () => 'mount-tokens.json in VibeSpace\'s data folder could not be read (EIO)';
    const rx2 = await run(MJ.load('src/machine-mounts.js', anchored(MSRCc, "    if (this._state.tornAt && this.mountTokens && typeof this.mountTokens.unreadWords === 'function' && this.mountTokens.unreadWords()) return this.mountTokens.unreadWords();", "    if (false) return null;", 'srl-u2-unpair'), 'unpair-unasked'), 'mounts-torn-unpair-ctl');
    rx2.M.mountTokens.unreadWords = r.M.mountTokens.unreadWords;
    ok(/could not be read/.test(String(r.M.revokeHeldFor('h-0001'))) && rx2.M.revokeHeldFor('h-0001') === null, 'THE UN-PAIRING (round wgbjnr750): after a torn lift with the folder links held, revokeHeldFor names the hold (the un-pairing refused before any side effect) — RED CONTROL (in a copy): no refusal');
    const MSRCt = fs.readFileSync(path.join(ROOT, 'src/machine-mounts.js'), 'utf8');
    const CUT2 = anchored(anchored(MSRCt, "          if (tornAt && !(Number(t.createdAt) > tornAt)) { unknown++; continue; }   // minted before the torn lift: its record is UNKNOWN — kept\n", '', 'srl-u2-torn-sweep'), "          if (this._copies().names(t.id)) { unknown++; continue; }", "          if (false) { unknown++; continue; }", 'srl-u2-torn-sweep-copies');
    const rx = await run(MJ.load('src/machine-mounts.js', CUT2, 'torn-sweep-unasked'), 'mounts-torn-sweep-ctl');
    ok(rx.revoked.includes('tok-0001'), 'RED CONTROL — neither the mark nor the kept copy asked (the release\'s road, in a copy): the same restore revokes the machine\'s token over the empty list', rx.revoked);
  }
  // 2b commit 3: «missing» right after «unreadable» read once more is the FAMILY HELPER's law now (test-store-read-three ⑤ «a file
  // GONE right after a failed read is read once more») — retired here
  // 主开发 23:21Z (the read of the cure): the lift's legacy ingest never reads the data folder SYNCHRONOUSLY on the loop — a lift with no
  // mounts (the file gone) leaves the legacy stores for the next start; the boot's road ingests them as before
  const liftIngest = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'machine-mounts.json'), LEG = path.join(d, 'host-mounts.json'); plant(F, body);
    const M = new Mod.MachineMounts(deps(d, [], [])); clearInterval(M._sweep);
    if (asRoot) fs.rmdirSync(F); else fs.rmSync(F, { force: true });
    fs.writeFileSync(LEG, JSON.stringify({ mounts: [{ id: 'old-0002', hostId: 'h-0003', folder: '/x', mountpoint: '/y' }] }));
    await M.readAgain(); await M.readAgain();   // «missing» read once more, then the lift
    M._hold.stop();
    return { lifted: !M.unreadWords(), legacyKept: fs.existsSync(LEG) && !fs.existsSync(LEG + '.migrated'), listed: M.list().length };
  };
  const li = await liftIngest(require(path.join(ROOT, 'src/machine-mounts.js')), 'mounts-lift-ingest');
  const LIFTA = "    this._loadAnswer(value ? { state: 'data', value } : { state: 'missing', setAside }, { atLift: true });\n";   // 2b: the lift is the helper's onLift
  ok(MSRC.split(LIFTA).length === 2, 'control setup: the anchor of the control «the lift ingests nothing» is in machine-mounts.js');
  const lix = await liftIngest(MJ.load('src/machine-mounts.js', anchored(MSRC, LIFTA, "    this._loadAnswer(value ? { state: 'data', value } : { state: 'missing', setAside });   /* MUTANT: the lift ingests */\n", 'srl-546a'), 'lift-ingests'), 'mounts-lift-ingest-mut');
  ok(li.lifted && li.legacyKept && li.listed === 0 && lix.lifted && !lix.legacyKept, 'a lift with no mounts leaves the legacy stores for the next start (no synchronous read of the data folder on the loop); CONTROL (the lift ingests, in a copy): it reads and renames them there', { li, lix });
  // the SAVE's guard has its own red control (it is what covers the timers' saves and every road that reaches _save)
  const saveScene = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'machine-mounts.json'); plant(F, body);
    const M = new Mod.MachineMounts(deps(d, [], [])); clearInterval(M._sweep);
    M._state.mounts.push({ id: 'mm-x', dir: 'push', hostId: 'h-x', folder: '/z', mountpoint: '/w', tokenId: 'tok-x' });
    M._save();
    const kept = bodyOf(F) === (asRoot ? '(a folder)' : body);
    M._hold.stop(); if (!asRoot) { try { fs.chmodSync(F, 0o644); } catch { } }
    return { kept };
  };
  const SAVEG = "    if (!this._hold.writable('a machine-mounts.json write')) return;   // (said once a hold, by the helper)\n";   // 2b: the guard asks the helper's hold
  ok(MSRC.split(SAVEG).length === 2, 'control setup: the anchor of the control «the save\'s guard» is in machine-mounts.js');
  const sv = await saveScene(require(path.join(ROOT, 'src/machine-mounts.js')), 'mounts-save-guard');
  const svx = await saveScene(MJ.load('src/machine-mounts.js', anchored(MSRC, SAVEG, '    /* MUTANT: no save guard */\n', 'srl-562a'), 'no-save-guard'), 'mounts-save-guard-mut');
  if (asRoot) rootSkip('CONTROL machine-mounts.json: the save\'s guard removed, the save writes over the held file');
  ok(sv.kept, 'the save itself refuses while held (a timer\'s save, any road)', { sv });
  if (!asRoot) ok(!svx.kept, 'CONTROL (only that guard removed, in a copy): the save WRITES OVER the held file', { svx });
  // the three other refusals (a push mount, a pull mount, a remount) — each by name
  {
    const d = path.join(D, 'mounts-refusals'); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'machine-mounts.json'); plant(F, body);
    const codeOf = async (p) => { try { await p(); return 'answered'; } catch (e) { return e && e.code; } };
    const three = async (Mod) => {
      const M = new Mod.MachineMounts(deps(d, [], [])); clearInterval(M._sweep);
      const got = [await codeOf(() => M.mountPush('h-0001', { folder: path.join(d, 'no-such-folder') })), await codeOf(() => M.mountPull('h-0001', { remotePath: '/r' })), await codeOf(() => M.remount('mm-0001'))];
      M._hold.stop();
      return got;
    };
    const got = await three(require(path.join(ROOT, 'src/machine-mounts.js')));
    // its read (S1): each refusal has its own control — a copy that cuts ONLY that guard answers anything but the hold's name there
    const GUARDS = ["    this._refuseIfUnread('adding a push mount');", "    this._refuseIfUnread('adding a mount');", "    this._refuseIfUnread('mounting again');"];
    const cut = [];
    for (const [k, g] of GUARDS.entries()) {
      ok(MSRC.split(g).length === 2, `control setup: the guard «${g.trim()}» stands once in machine-mounts.js`);
      cut.push((await three(MJ.load('src/machine-mounts.js', anchored(MSRC, g, '    /* MUTANT: this guard cut */', 'srl-583a'), `refusal-cut-${k}`)))[k]);
    }
    if (!asRoot) { try { fs.chmodSync(F, 0o644); } catch { } }
    ok(got.every((c) => c === 'mounts-unread'), 'a push mount, a pull mount and a remount are each refused BY NAME while held (mounts-unread)', got);
    ok(cut.every((c) => c !== 'mounts-unread'), 'CONTROLS (each guard cut alone, in a copy): that call is no longer refused by the hold\'s name', cut);
  }
  const SVM = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok((SVM.match(/catch \(e\) \{ res\.status\(e && e\.status === 503 \? 503 : 400\)\.json\(\{ \.\.\.require\('\.\/src\/mount-error-words\.js'\)\.errorBody\(e\), \.\.\.\(e && e\.status === 503 && e\.code \? \{ code: e\.code \} : \{\}\) \}\); \}/g) || []).length === 3,
    'WIRING (主开发 23:21Z; its read S2): the mount, unmount and remount routes keep a hold\'s status (503) and its name — machine-mounts.json\'s (mounts-unread) AND hosts.json\'s (hosts-unread, a machine looked up while the paired machines are held)');
  // 2b commit 3: the next try armed FIRST (its read r1, M2 / r2, X5) and only the newest try lifting (its read r2, X2 / r3, Y4) are the
  // FAMILY HELPER's laws now, proved there with their reds (test-store-read-three ⑤ «the next try is armed FIRST», «one in flight is the
  // read AND its copy») — retired here
  const DPM = fs.readFileSync(path.join(ROOT, 'src/server/dial-pairing.js'), 'utf8'), ERM = fs.readFileSync(path.join(ROOT, 'src/server/exit-routes.js'), 'utf8');
  ok(/async function unpairDialDevice\(deviceId\) \{\n(?:  if \(hosts\.held && hosts\.held\(\)\) throw [^\n]*\n)?(?:  \/\/[^\n]*\n)*  if \(machineMounts\.unreadWords && machineMounts\.unreadWords\(\)\) throw /.test(DPM) && /res\.status\(e && e\.status === 503 \? 503 : 400\)/.test(ERM),
    'WIRING (its read r1, M3): removing a dial machine while machine-mounts.json is held is refused BEFORE any side effect (its push tokens would never be revoked) — 503 with the words (the meeting with hosts.json\'s cure: its own belt, the held machines, may stand first)');
  const SV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok(SV.includes("app.get('/api/machine-mounts', (req, res) => res.json({ mounts: machineMounts.list(), ...(machineMounts.unreadWords() ? { unread: machineMounts.unreadWords() } : {}), ...(machineMounts.tornCopy?.() ? { torn: machineMounts.tornCopy() } : {}) }));"), 'WIRING: the mounts list answers WHY it is empty while held (GET /api/machine-mounts `unread`) — and a torn lift\'s copy (`torn`, B-f276 family unit 2)');
}

console.log('§2c the legacy mount stores (host-mounts.json, device-mounts.json → machine-mounts.json: src/machine-mounts.js _migrateLegacy) — a failed read is never «nothing there»');
{
  // 主开发 r4985 (lane lg-remote-hardening, slice legacy-mounts-gap): the one-time ingest told an I/O error from nothing (existsSync answers
  // false for a stat that FAILED too) and from torn bytes (one catch, -1, for both) — either way machine-mounts.json was saved without
  // that store's records and no later start ran the ingest again: every push or pull mount of it gone for good. Each leg places a refusal
  // of the READ CALL for one path (never a mode change or a mount)
  const MM = require(path.join(ROOT, 'src/machine-mounts.js'));
  const LSRC = fs.readFileSync(path.join(ROOT, 'src/machine-mounts.js'), 'utf8');
  const refusal = (code) => Object.assign(new Error(`${code}: a placed refusal of the read`), { code });
  /** a PLACED refusal of the read call for one path: fs.readFileSync throws `code`; `stat`: fs.existsSync answers false, as a failed stat does */
  const place = (file, { code = 'EIO', stat = false } = {}) => { const f = path.resolve(file), rs = fs.readFileSync, ex = fs.existsSync, seen = { n: 0 };
    fs.readFileSync = function (q, ...a) { if (typeof q === 'string' && path.resolve(q) === f) { seen.n++; throw refusal(code); } return rs.call(this, q, ...a); };
    if (stat) fs.existsSync = function (q) { if (typeof q === 'string' && path.resolve(q) === f) return false; return ex.call(this, q); };
    return { seen, restore: () => { fs.readFileSync = rs; fs.existsSync = ex; } }; };
  const PUSH = { id: 'mm-0101', hostId: 'h-0101', folder: '/srv/a', mode: 'ro', mountpoint: '/mnt/legacy-a', tokenId: 'tok-0101', createdAt: 11 };
  const PULL = { id: 'mm-0201', deviceId: 'dev-0201', remotePath: '/r', mountpoint: '/mnt/legacy-b', createdAt: 12 };
  const lay = (name, { hm = JSON.stringify({ mounts: [PUSH] }), dv = JSON.stringify({ mounts: [PULL] }) } = {}) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    if (hm != null) fs.writeFileSync(path.join(d, 'host-mounts.json'), hm); if (dv != null) fs.writeFileSync(path.join(d, 'device-mounts.json'), dv);
    return d; };
  const boot = (Mod, d, logs = [], revoked = []) => { const M = new Mod.MachineMounts({ dataDir: d, hosts: { get: () => null, findByDeviceId: () => null }, mountTokens: { list: () => [{ id: 'tok-0101', kind: 'reverse-mount' }], revoke: (id) => revoked.push(id) }, broadcast() { }, log: (m) => logs.push(String(m)) }); clearInterval(M._sweep); return M; };
  const holdsOf = (M) => (M && M._legacyHolds instanceof Map ? [...M._legacyHolds.values()] : []);
  const stopAll = (M) => { try { M._hold.stop(); } catch { } for (const h of holdsOf(M)) { try { h.stop(); } catch { } } };
  const ids = (M) => M.list().map((m) => m.id).sort().join(',');
  const savedOf = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'machine-mounts.json'), 'utf8')); } catch { return null; } };
  const stands = (d, n) => fs.existsSync(path.join(d, n)) && !fs.existsSync(path.join(d, n + '.migrated'));
  /** THE MIGRATING BOOT with host-mounts.json's read refused (`code`, `stat`) and device-mounts.json whole; the boot's token sweep run */
  const migrating = (Mod, name, opts = {}) => {
    const d = lay(name); const logs = [], revoked = [];
    const pl = place(path.join(d, 'host-mounts.json'), opts);
    let M; try { M = boot(Mod, d, logs, revoked); } finally { pl.restore(); }
    M.gcOrphanTokens();   // the boot's restore runs it 5 s on — while the store is held its push record's token reads as an orphan
    const saved = savedOf(d);
    return { M, d, logs, revoked, seen: pl.seen.n, listed: ids(M), hmStands: stands(d, 'host-mounts.json'), dvMigrated: fs.existsSync(path.join(d, 'device-mounts.json.migrated')),
      owed: !!(saved && saved.legacyOwed), held: holdsOf(M).some((h) => !!h.held()), code: (holdsOf(M).map((h) => h.held()).find(Boolean) || {}).code || null,
      advice: logs.filter((l) => /delete machine-mounts\.json/.test(l)).length, saidHeld: logs.some((l) => /host-mounts\.json could not be read \((EIO|EACCES)\) — held/.test(l)) };
  };
  // (a) THE MIGRATING BOOT: the pull store in and renamed; the push store HELD and OWED (the list saved with the mark), its token kept
  const A = migrating(MM, 'legacy-a');
  ok(A.seen >= 1 && A.listed === 'mm-0201' && A.dvMigrated && A.hmStands && A.held && A.code === 'EIO' && A.owed && A.revoked.length === 0 && A.advice === 0 && A.saidHeld,
    '(a) THE MIGRATING BOOT with host-mounts.json\'s read refused (EIO): device-mounts.json is ingested and renamed; host-mounts.json is HELD (said: held and read again — never the advice to delete a store) and OWED (the saved list carries the mark), stands under its own name, and the boot\'s token sweep revokes nothing of it', { listed: A.listed, held: A.held, code: A.code, owed: A.owed, revoked: A.revoked, advice: A.advice, saidHeld: A.saidHeld });
  stopAll(A.M);
  // (b) A SECOND START with no refusal: the owed ingest runs — the push record listed, the file renamed after the verified save, the mark gone
  const B2 = boot(MM, A.d);
  const savedB = savedOf(A.d);
  ok(ids(B2) === 'mm-0101,mm-0201' && fs.existsSync(path.join(A.d, 'host-mounts.json.migrated')) && !fs.existsSync(path.join(A.d, 'host-mounts.json')) && !!savedB && !savedB.legacyOwed,
    '(b) A SECOND START with no refusal runs the OWED ingest: the push record is listed, host-mounts.json is renamed only after the verified save, the mark is gone', { listed: ids(B2), saved: savedB && savedB.mounts && savedB.mounts.map((m) => m.id) });
  stopAll(B2);
  // (c) A LIFT MID-LIFE: the held store read again off the loop — its record listed at once, NOTHING renamed (the file stands under its own
  // name until a start's verified save), the mark kept for that start
  const C = migrating(MM, 'legacy-c');
  const lifted = holdsOf(C.M).length ? await holdsOf(C.M)[0].again() : false;
  const savedC = savedOf(C.d);
  ok(lifted === true && ids(C.M) === 'mm-0101,mm-0201' && C.hmStands && stands(C.d, 'host-mounts.json') && !!savedC && savedC.legacyOwed === true && savedC.mounts.some((m) => m.id === 'mm-0101'),
    '(c) A LIFT MID-LIFE: host-mounts.json read again off the loop — its push record listed at once and saved, the file STILL under its own name (nothing renamed while the ingest is not a start\'s), the mark kept', { lifted, listed: ids(C.M), saved: savedC && { owed: savedC.legacyOwed, ids: (savedC.mounts || []).map((m) => m.id) } });
  stopAll(C.M);
  const C2 = boot(MM, C.d, []);
  ok(ids(C2) === 'mm-0101,mm-0201' && fs.existsSync(path.join(C.d, 'host-mounts.json.migrated')) && !(savedOf(C.d) || {}).legacyOwed, '(c) …and the next start ingests it again (the record already listed is the same: no second copy), renames the file after its verified save, and drops the mark', { listed: ids(C2) });
  stopAll(C2);
  // (d) A REFUSED STAT (EACCES — existsSync answers false): HELD, never «nothing to do»
  const Dd = migrating(MM, 'legacy-d', { code: 'EACCES', stat: true });
  ok(Dd.held && Dd.code === 'EACCES' && Dd.owed && Dd.hmStands && Dd.revoked.length === 0, '(d) A REFUSED STAT (EACCES, existsSync false): host-mounts.json is HELD and OWED, never «nothing to do»', { held: Dd.held, code: Dd.code, owed: Dd.owed, listed: Dd.listed });
  stopAll(Dd.M);
  // THE LIFT's MEETING (主开发 r4985 (b)): while the store is held a person makes a mount on the SAME mount point as a held legacy record —
  // the live one (the person's newer act) wins at the lift and at the later start; the legacy record passed over is SAID by its store and
  // count, once a run, never dropped in silence
  const MEET = { id: 'mm-0909', dir: 'push', hostId: 'h-0909', folder: '/srv/new', mode: 'rw', mountpoint: '/mnt/legacy-a', tokenId: 'tok-0909', createdAt: 99 };
  const meeting = async (Mod, name) => {
    const E = migrating(Mod, name);
    E.M._state.mounts.push({ ...MEET }); E.M._save();   // the person's mount made while the store is held (the list's own record)
    const up = holdsOf(E.M).length ? await holdsOf(E.M)[0].again() : false;
    const atLift = { listed: ids(E.M), said: E.logs.filter((l) => /host-mounts\.json: 1 legacy mount record\(s\) passed over/.test(l)).length };
    stopAll(E.M);
    const logs2 = [], S = boot(Mod, E.d, logs2);
    const atStart = { listed: ids(S), said: logs2.filter((l) => /host-mounts\.json: 1 legacy mount record\(s\) passed over/.test(l)).length, renamed: fs.existsSync(path.join(E.d, 'host-mounts.json.migrated')) };
    stopAll(S);
    return { up, atLift, atStart };
  };
  const mt = await meeting(MM, 'legacy-meet');
  ok(mt.up === true && mt.atLift.listed === 'mm-0201,mm-0909' && mt.atLift.said === 1 && mt.atStart.listed === 'mm-0201,mm-0909' && mt.atStart.said === 1 && mt.atStart.renamed,
    'THE LIFT\'s MEETING (r4985 (b)): a mount the person made on a held legacy record\'s mount point WINS at the lift and at the later start; the legacy record passed over is said by its store and count, once each run — never dropped in silence', mt);
  // (e) TORN BYTES are told apart: kept in place under its own name with the present words (naming the kept file), no hold, not owed
  const tn = lay('legacy-e', { hm: '{"mounts": [' }); const logsE = [];
  const Et = boot(MM, tn, logsE); const savedE = savedOf(tn);
  ok(holdsOf(Et).every((h) => !h.held()) && stands(tn, 'host-mounts.json') && !(savedE && savedE.legacyOwed) && logsE.some((l) => l.includes('legacy store unreadable — kept in place') && l.includes(path.join(tn, 'host-mounts.json'))) && ids(Et) === 'mm-0201',
    '(e) TORN BYTES are told apart: host-mounts.json kept in place under its own name, said with the words that name the kept file; no hold, not owed (a person\'s file to fix)', { listed: ids(Et), owed: savedE && savedE.legacyOwed });
  stopAll(Et);
  // (f) A MISSING store is nothing to do: no hold, no mark, nothing said of it
  const mi = lay('legacy-f', { hm: null }); const logsF = [];
  const Ft = boot(MM, mi, logsF); const savedF = savedOf(mi);
  ok(holdsOf(Ft).length === 0 && !(savedF && savedF.legacyOwed) && !logsF.some((l) => /host-mounts\.json/.test(l)) && ids(Ft) === 'mm-0201', '(f) A MISSING host-mounts.json is nothing to do: no hold, no mark, nothing said of it', { listed: ids(Ft) });
  stopAll(Ft);
}
console.log('§5 job-notifications.json (src/jobs.js) — every job notice still waiting for its conversation');
{
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const LOADN = '    this._notifsAnswer(SR.storeAnswer(read, { valid: NOTIFS_SHAPE }));\n';
  ok(JSRC.split(LOADN).length === 2, 'control setup: the anchor of the control «the release\'s load» is in jobs.js (the notifications\' one storeAnswer call)');
  const RELEASE = MJ.load('src/jobs.js', anchored(JSRC, LOADN, '    try { this.releasedAtBoot = []; this._notifsFrom(JSON.parse(read.text)); } catch { }   /* MUTANT: the release — any failure is an empty map */\n', 'srl-677a'), 'release-notifs');
  const body = JSON.stringify({ 'conv-old': [{ ts: 1, jobId: 'jb-0n000001', text: 'done exit=0 ok (1m)' }] });
  const onDisk = (F) => { try { return Object.keys(JSON.parse(fs.readFileSync(F, 'utf8'))).sort().join(); } catch (e) { return '(' + (e.code || 'unparsed') + ')'; } };
  const scene = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'job-notifications.json'); plant(F, body);
    const filed = [], resolved = [];
    const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser: (n) => { filed.push(n); return { ok: true, id: 'it-n' + filed.length }; }, resolveNotice: (id) => resolved.push(id), log: () => { }, logsSweep: { bootDelayMs: 3600e3 } });
    J.init();
    const held = !!J._notifsUnread, waitingAtBoot = J.pendingNotifs.size;
    J.pendingNotifs.set('conv-new', [{ ts: 2, jobId: 'jb-0n000002', text: 'failed exit=3 (2m)' }]);   // a notice filed while held
    J.pendingNotifs.set('conv-old', [{ ts: 3, jobId: 'jb-0n000003', text: 'done exit=0 ok (3m)' }]);   // its read r1 (S2): one for a conversation the file also holds
    // its read r1 (M1): the job of the file's notice is CLEARED while held (Clear content… rewrote only what memory held)
    J.jobs.set('jb-0n000001', { id: 'jb-0n000001', kind: 'task', name: 'deploy prod', state: 'done', clearedAt: 5, owner: {}, access: { view: 'session', control: 'session' }, runs: [] });
    J._saveNotifs(); J._save();   // a delivery's own write, and the store's
    // its read r2 (M2): a CLEARED job's removal waits while the file is held (its notices there are judged by its record at the read)
    const rmd = J.rm(J.jobs.get('jb-0n000001')), rmKept = J.jobs.has('jb-0n000001');
    const kept = bodyOf(F) === (asRoot ? '(a folder)' : body);
    if (!asRoot) fs.chmodSync(F, 0o000);
    unplant(F, body);
    if (J._notifsRetry) await J._notifsRetry();
    const old = (J.pendingNotifs.get('conv-old') || []).map((n) => `${n.jobId}:${n.text}`);
    let fileOld0 = null; try { fileOld0 = ((JSON.parse(fs.readFileSync(F, 'utf8')) || {})['conv-old'] || []).some((n) => n && n.jobId === 'jb-0n000001'); } catch { }
    const out = { rmCode: rmd && rmd.code, rmKept, stableWords: filed.filter((n) => n && n.fact === 'notifs-unread').every((n) => n.words && n.words.params && !('when' in n.words.params)), held, waitingAtBoot, kept, waiting: [...J.pendingNotifs.keys()].sort().join(), file: onDisk(F), fileOld0, stillHeld: !!J._notifsUnread, old, said: filed.filter((n) => n && n.fact === 'notifs-unread').length, resolved: resolved.slice() };
    J.shutdown(); return out;
  };
  const r = await scene(require(path.join(ROOT, 'src/jobs.js')), 'notifs-held');
  ok(r.held && r.waitingAtBoot === 0 && r.kept, 'job-notifications.json unreadable at boot: HELD — nothing is written over it (a delivery\'s write and the store\'s refused)', r);
  ok(!r.stillHeld && r.waiting === 'conv-new,conv-old' && r.file === 'conv-new,conv-old', 'read again: the notices waiting in the file are BACK, and the one filed meanwhile waits beside them — both on disk', r);
  ok(r.old.length === 2 && r.old[1] === 'jb-0n000003:done exit=0 ok (3m)' && r.old[0].startsWith('jb-0n000001:') && !r.old[0].includes('done exit=0 ok (1m)'),
    'its read r1: the SAME conversation in the file and in memory — both notices, the file\'s first (S2); the file\'s notice of a job CLEARED while held takes the clear\'s words, never its old text (M1)', r.old);
  ok(r.said === 1 && r.resolved.join() === 'it-n1', 'its read r1 (M2): the hold is said ONCE in For you, and that item is resolved once the file reads', { said: r.said, resolved: r.resolved });
  ok(r.stableWords, 'its read r2 (S1): the item\'s words carry no time — a restart\'s re-filing during the same hold matches the open item by its words (ONE item a hold)');
  ok(r.rmCode === 'notifs-unread' && r.rmKept, 'its read r2 (M2): removing a CLEARED job while the file is held is refused by name — the record that judges its waiting notices stays', { rmCode: r.rmCode, rmKept: r.rmKept });
  const MERGE = '        const mine = merge ? (this.pendingNotifs.get(cid) || []).filter((n) => !list.includes(n)) : [];\n';
  const CLEAR = "        this._judgeNotifsIn(list, { boot: !merge });   // its read r2 (M1) / r4 (S1): ONE judge — the boot, the merge, a record's read again\n";
  ok(JSRC.split(MERGE).length === 2 && JSRC.split(CLEAR).length === 2, 'control setup: the anchors of the controls «the merge» and «the clear at the merge» are in jobs.js');
  const rm = await scene(MJ.load('src/jobs.js', anchored(JSRC, MERGE, '        const mine = [];   /* MUTANT: no merge */\n', 'srl-714a'), 'no-merge'), 'notifs-no-merge');
  ok(rm.old.length === 1, 'CONTROL (no merge, in a copy): the notice filed for conv-old while held is LOST at the read (the file\'s list replaced it)', rm.old);
  const RMH = "    if (this._notifsUnread && job && job.clearedAt) return { error: this._notifsClearedWords(job.id), code: 'notifs-unread' };   // the B-f276 remainder (5), its read r2 (M2)\n";
  ok(JSRC.split(RMH).length === 2, 'control setup: the anchor of the control «a cleared job\'s removal waits» is in jobs.js');
  const rr = await scene(MJ.load('src/jobs.js', anchored(JSRC, RMH, '', 'srl-718a'), 'rm-no-held'), 'notifs-rm-no-held');
  ok(!rr.rmKept && rr.old.some((x) => x === 'jb-0n000001:done exit=0 ok (1m)'), 'CONTROL (the removal\'s held check cut, in a copy): the cleared job is removed and its notice comes back from the file with its OLD words', { rmKept: rr.rmKept, old: rr.old });
  const rc = await scene(MJ.load('src/jobs.js', anchored(JSRC, CLEAR, '        /* MUTANT: no clear at the merge */\n', 'srl-720a'), 'no-clear-merge'), 'notifs-no-clear');
  ok(rc.old.some((x) => x === 'jb-0n000001:done exit=0 ok (1m)'), 'CONTROL (no clear at the merge, in a copy): the cleared job\'s old words come back with the file', rc.old);
  const rx = await scene(RELEASE, 'notifs-release');
  ok(!rx.held, 'CONTROL (the release\'s load, in a copy): a failed read is not held (an EMPTY map)', rx);
  if (asRoot) rootSkip('CONTROL job-notifications.json: the release\'s next save writes over the held file'); else ok(!rx.kept && rx.fileOld0 === false, 'CONTROL (the release\'s load, in a copy): the next save WRITES OVER the file — the file\'s own waiting notice (jb-0n000001 for conv-old) is gone', rx);
  // torn bytes at boot: HELD (the boot's main thread makes no new store write — test-store-write-census); the read again, off the
  // loop, copies them aside and lifts with none waiting
  {
    const d = path.join(D, 'notifs-torn'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'job-notifications.json'), '{"conv-a": [');
    const filedT = [];
    const J = new (require(path.join(ROOT, 'src/jobs.js')).JobManager)({ dataDir: d, broadcast() { }, notifyUser(n) { filedT.push(n); return { ok: true, id: 'it-t' + filedT.length }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 } });
    J.init();
    const asidesOf = () => fs.readdirSync(d).filter((n) => /^job-notifications\.json\.corrupt-\d+$/.test(n));
    const heldAtBoot = !!J._notifsUnread, asidesAtBoot = asidesOf().length;
    await J._notifsRetry();
    const asides = asidesOf();
    ok(heldAtBoot && asidesAtBoot === 0 && !J._notifsUnread && J.pendingNotifs.size === 0 && asides.length === 1 && fs.readFileSync(path.join(d, asides[0]), 'utf8') === '{"conv-a": [',
      'torn bytes at boot are HELD (no copy on the boot\'s thread); the read again copies them aside OFF the loop and lifts with no notice waiting', { heldAtBoot, asidesAtBoot, asides: asides.length });
    const lost = filedT.filter((n) => n && n.fact === 'notifs-lost');
    ok(lost.length === 1 && lost[0].words && lost[0].words.params && lost[0].words.params.file === asides[0], 'its read r2 (S2): the read again that found torn bytes SAYS the waiting notices were lost, naming the copy kept aside — never only a journal line', lost.map((n) => n.words));
    J.shutdown();
  }
  // its read r3: (M1) a read again that hangs keeps its ONE slot until it settles — no second read per try (a thread of the pool
  // each); (S1) the read waits while the job records that judge its notices are held; (S2) the hourly gc keeps a CLEARED record
  // while the notices are held (its record judges them)
  {
    const SLOT = '    const read = await p; clearTimeout(tm);\n', JUDGE = "    if (this._unread.store || this._unread.archive) { done();", GCK = '      return !(this._notifsUnread && job.clearedAt);';   // B-360d: the pass's `collectable` predicate
    ok(JSRC.split(SLOT).length === 2 && JSRC.split(JUDGE).length === 2 && JSRC.split(GCK).length === 2, 'control setup: the anchors of the r3 controls are in jobs.js');
    const r3 = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'job-notifications.json'); plant(F, body);
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 }, unreadRetry: { readMs: 20 } });
      J.init();
      // (M1) the read hangs
      const prf = fs.promises.readFile; let calls = 0, fail = null; const hung = new Promise((_, rj) => { fail = rj; });
      fs.promises.readFile = function (f, ...a) { if (String(f) === F) { calls++; return calls === 1 ? hung : prf.call(this, f, ...a); } return prf.call(this, f, ...a); };
      const keep = setInterval(() => { }, 1000);
      let whileHung = 0;
      try {
        const first = J._notifsRetry(); await new Promise((r) => setTimeout(r, 60));   // past the bound: said, still waited for
        await J._notifsRetry(); whileHung = calls;                                     // no second read while it hangs
        fail(Object.assign(new Error('the read failed'), { code: 'EACCES' })); await first;   // it settles — unreadable: the hold stands
      } finally { fs.promises.readFile = prf; clearInterval(keep); }
      // (S1) the records are held: a readable notices file is not merged
      const lifted0 = !J._notifsUnread;
      let waitedForRecords = null;
      if (!lifted0) { J._unread.store = { code: 'EACCES', at: Date.now() }; unplant(F, body); J._notifsMissingAt = 0; await J._notifsRetry(); waitedForRecords = !!J._notifsUnread; J._unread.store = null; }
      // (S2) the gc while held: a cleared, long-ended task is kept
      J._notifsUnread = J._notifsUnread || { code: 'EACCES', at: Date.now() };
      J.jobs.set('jb-0n000077', { id: 'jb-0n000077', kind: 'task', name: 'x', state: 'done', clearedAt: 5, owner: {}, access: { view: 'session', control: 'session' }, runs: [{ endedAt: 1 }] });
      await J._gc({ now: Date.now() });
      const gcKept = J.jobs.has('jb-0n000077');
      J._notifsUnread = null; J.shutdown();
      return { whileHung, waitedForRecords, gcKept };
    };
    const g = await r3(require(path.join(ROOT, 'src/jobs.js')), 'notifs-r3');
    ok(g.whileHung === 1 && g.waitedForRecords === true && g.gcKept, 'its read r3: a hung read keeps its one slot (no second read per try — M1), the read waits while the job records are held (S1), the gc keeps a cleared record while the notices are held (S2)', g);
    const gx = await r3(MJ.load('src/jobs.js', anchored(JSRC, SLOT, '    this._notifsP = null; const read = await p; clearTimeout(tm);   /* MUTANT: the slot freed at once */\n', 'srl-778a'), 'r3-slot'), 'notifs-r3-slot');
    const gj = await r3(MJ.load('src/jobs.js', anchored(JSRC, JUDGE, '    if (false) { done();', 'srl-779a'), 'r3-judge'), 'notifs-r3-judge');
    const gg = await r3(MJ.load('src/jobs.js', anchored(JSRC, GCK, '      return true; /* MUTANT: gc as before */', 'srl-780a'), 'r3-gc'), 'notifs-r3-gc');
    ok(gx.whileHung === 2 && gj.waitedForRecords === false && !gg.gcKept, 'CONTROLS (each cure cut alone, in a copy): a second read starts while the first hangs; the notices are merged while their records are held; the gc removes the cleared record', { gx, gj, gg });
  }
  // its read r4 (S1): the boot found the JOB RECORDS held (jobs.json unreadable) and read the notices UNJUDGED — when the records read
  // again, the waiting notice of a job cleared in an earlier process takes the clear (it reached the conversation with its old words)
  {
    const RJ = "      if (a.state === 'data') { try { this._judgeNotifs(); } catch (e) { this.d.log('[jobs] the waiting notices could not be judged again:', e && e.message); } }";
    ok(JSRC.split(RJ).length === 2, 'control setup: the anchor of the control «the records read again judge the notices» is in jobs.js');
    const recScene = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const JF = path.join(d, 'jobs.json'), jbody = JSON.stringify([{ id: 'jb-0n000031', kind: 'task', name: 'deploy prod', state: 'done', clearedAt: 5, owner: {}, access: { view: 'session', control: 'session' }, runs: [] }]);
      plant(JF, jbody);
      fs.writeFileSync(path.join(d, 'job-notifications.json'), JSON.stringify({ 'conv-r': [{ ts: 1, jobId: 'jb-0n000031', text: 'done exit=0 secret words (1m)' }] }));
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 } });
      J.init();
      const atBoot = (J.pendingNotifs.get('conv-r') || []).map((n) => n.text).join();
      unplant(JF, jbody);
      try { await J._unreadRetry('store'); } catch { }
      const after = (J.pendingNotifs.get('conv-r') || []).map((n) => n.text).join();
      J.shutdown(); return { storeHeldAtBoot: atBoot.includes('secret words'), after };
    };
    const rr = await recScene(require(path.join(ROOT, 'src/jobs.js')), 'notifs-rec-held');
    const rrx = await recScene(MJ.load('src/jobs.js', anchored(JSRC, RJ, '      /* MUTANT: no judge at the records\' read */', 'srl-802a'), 'no-judge-at-records'), 'notifs-rec-held-mut');
    ok(rr.storeHeldAtBoot && !rr.after.includes('secret words') && rrx.after.includes('secret words'), 'its read r4 (S1): once the held job records read again, the waiting notice of a cleared job takes the clear\'s words; CONTROL (no judge at the records\' read, in a copy): the old words stay and reach the conversation', { rr, rrx });
  }
  // 主开发 05:36Z — THE STASH'S OWN LAW at the records' read again: a notice that waited for the job records is HIDDEN from its
  // conversation's strip (peekNotifs) while they are held; when they read again (a whole read, or a gone file's second answer) it
  // shows — each conversation holding a notice of a job is TOLD, once (its strip follows; a held line's verdict may be known now too),
  // a conversation holding none is not; a gone end lets the notices go FOR GOOD (a later hold never hides them again)
  {
    const SAYR = "      for (const cid of told) { try { this.d.onStash?.(cid); } catch { } }";
    const LETGO = "      if (a.state !== 'data' && !this._recordsHeld()) for (const l of this.pendingNotifs.values()) for (const n of l || []) this._unjudged.delete(n);";
    ok(JSRC.split(SAYR).length === 2 && JSRC.split(LETGO).length === 2, 'control setup: the records\' read-again say and the gone end\'s let-go are found once each in jobs.js');
    const sayScene = async (Mod, name, { gone = false } = {}) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const JF = path.join(d, 'jobs.json'), jbody = JSON.stringify([{ id: 'jb-0n000041', kind: 'task', name: 'nightly', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [] }]);
      plant(JF, jbody);
      fs.writeFileSync(path.join(d, 'job-notifications.json'), JSON.stringify({ 'conv-s': [{ ts: 1, jobId: 'jb-0n000041', text: 'done exit=0 (1m)' }], 'conv-t': [{ ts: 2, text: 'a line no job names' }] }));
      const said = [];
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, onStash: (cid) => said.push(cid), logsSweep: { bootDelayMs: 3600e3 } });
      J.init();
      const hidden = J.peekNotifs('conv-s').length;
      said.length = 0;
      unplant(JF, jbody);
      if (gone) { fs.rmSync(JF, { force: true }); try { await J._unreadRetry('store'); } catch { } }   // a gone file: the hold stands until a SECOND answer says missing too
      try { await J._unreadRetry('store'); } catch { }
      const shown = J.peekNotifs('conv-s').length, held = !!J._unread.store;
      J._unread.archive = { code: 'EACCES', at: Date.now() };   // a LATER hold of the records (the archive)
      const rehidden = J.peekNotifs('conv-s').length === 0;
      J._unread.archive = null;
      J.shutdown(); return { hidden, shown, held, rehidden, said: said.slice().sort() };
    };
    const sw = await sayScene(require(path.join(ROOT, 'src/jobs.js')), 'notifs-say-read');
    const sg = await sayScene(require(path.join(ROOT, 'src/jobs.js')), 'notifs-say-gone', { gone: true });
    ok(sw.hidden === 0 && sw.shown === 1 && !sw.held && JSON.stringify(sw.said) === '["conv-s"]' && sg.hidden === 0 && sg.shown === 1 && !sg.held && JSON.stringify(sg.said) === '["conv-s"]',
      'the records read again (a whole read; a gone file\'s second answer): the notice that waited shows, and ITS conversation is told once — the other conversation (nothing of it changed) is not', { sw, sg });
    ok(!sg.rehidden, 'a gone end lets the notices go FOR GOOD: a later hold of the records never hides them again (its read\'s S2)', sg);
    const SAYCUT = MJ.load('src/jobs.js', anchored(JSRC, SAYR, '      /* MUTANT: the records\' read again tells nobody */', 'srl-say-cut'), 'records-say-cut');
    const swx = await sayScene(SAYCUT, 'notifs-say-read-mut'), sgx = await sayScene(SAYCUT, 'notifs-say-gone-mut', { gone: true });
    ok(swx.shown === 1 && swx.said.length === 0 && sgx.shown === 1 && sgx.said.length === 0, 'CONTROL (the say cut, in a copy): on both roads the notice shows but its conversation is never told — the strip keeps the old count until something else says — RED', { swx, sgx });
    const sgl = await sayScene(MJ.load('src/jobs.js', anchored(JSRC, LETGO, '      /* MUTANT: the gone end keeps the marks */', 'srl-letgo-cut'), 'records-letgo-cut'), 'notifs-say-letgo-mut', { gone: true });
    ok(sgl.shown === 1 && sgl.rehidden, 'CONTROL (the let-go cut, in a copy): after a gone end a later hold of the records hides the notice again, with no say — RED', sgl);
  }
  // its read r2 (M1): a clear made while the file was HELD, then a restart — the NEXT boot reads the file whole and judges it by the
  // record's clearedAt (in jobs.json); the release judged only at a read again in the same process
  {
    const bootScene = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'job-notifications.json'), JSON.stringify({ 'conv-b': [{ ts: 1, jobId: 'jb-0n000009', text: 'done exit=0 secret words (1m)' }] }));
      fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify([{ id: 'jb-0n000009', kind: 'task', name: 'deploy prod', state: 'done', clearedAt: 5, owner: {}, access: { view: 'session', control: 'session' }, runs: [] }]));
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 } });
      J.init();
      const t = (J.pendingNotifs.get('conv-b') || []).map((n) => n.text).join();
      J.shutdown(); return t;
    };
    const b = await bootScene(require(path.join(ROOT, 'src/jobs.js')), 'notifs-boot-clear');
    const bx = await bootScene(MJ.load('src/jobs.js', anchored(JSRC, CLEAR, '        /* MUTANT: no clear at the read */\n', 'srl-818a'), 'no-clear-boot'), 'notifs-boot-clear-mut');
    ok(b && !b.includes('secret words') && bx.includes('secret words'), 'its read r2 (M1): a BOOT that reads the file judges each notice by its job\'s clear (the old words never come back after a restart); CONTROL (no judge at the read, in a copy): the cleared words are back', { b, bx });
  }
  // ── store (5)'s cure (主开发 02:33Z, round wzt514l6z) ─────────────────────────────────────────────────────────────────────────────
  // (1) a SUBSCRIBER's notice whose record is missing while the job records are HELD waits — «unknown», never «gone» (the drain dropped
  //     it and saved: lost for good); (2) a notice the held records cannot judge waits for their first whole read (never delivered with a
  //     cleared job's old words); (3) each held-save guard alone (the notices' save, the store's save of the notices, the records' save),
  //     on the roads that reach them — the shutdown's save, a clear-all — and the refused removal of a cleared ARCHIVED job
  {
    const recHeld = async (Mod, name, { jobs = [], notices = {}, archive = null } = {}) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const JF = path.join(d, 'jobs.json'), jbody = JSON.stringify(jobs); plant(JF, jbody);
      const NF = path.join(d, 'job-notifications.json'); fs.writeFileSync(NF, JSON.stringify(notices));
      if (archive) fs.writeFileSync(path.join(d, 'jobs-archive.json'), JSON.stringify(archive));
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 }, viewerOf: () => null });
      J.init();
      return { J, JF, jbody, NF, onDisk: () => { try { return JSON.parse(fs.readFileSync(NF, 'utf8')); } catch (e) { return '(' + (e.code || 'unparsed') + ')'; } } };
    };
    // (1)
    const GONE = "    if (!rec) return sub ? (this._recordsHeld() ? (viewOf()?.held ? 'groups-unread' : 'unknown') : 'gone') : 'owner';\n";
    ok(JSRC.split(GONE).length === 2, 'control setup: the view verdict\'s held answer is found once');
    const subScene = async (Mod, name) => {
      const x = await recHeld(Mod, name, { notices: { 'conv-s': [{ ts: 1, jobId: 'jb-0s000001', text: 'done exit=0 (1m)', sub: true }] } });
      const held = !!x.J._unread.store; x.J.peekNotifs('conv-s'); x.J.drainNotifs('conv-s');
      const out = { held, waiting: (x.J.pendingNotifs.get('conv-s') || []).length, file: ((x.onDisk() || {})['conv-s'] || []).length };
      unplant(x.JF, x.jbody); x.J.shutdown(); return out;
    };
    const s1 = await subScene(require(path.join(ROOT, 'src/jobs.js')), 'notifs-cure-sub');
    const s1x = await subScene(MJ.load('src/jobs.js', anchored(JSRC, GONE, "    if (!rec) return sub ? 'gone' : 'owner';   /* MUTANT: the release's verdict */\n", 'srl-846a'), 'cure-sub-gone'), 'notifs-cure-sub-mut');
    ok(s1.held && s1.waiting === 1 && s1.file === 1, 'cure (1): a SUBSCRIBER\'s notice of a job whose record is missing while jobs.json is HELD waits — kept in memory and on disk (the drain neither prints nor drops it)', s1);
    ok(s1x.waiting === 0 && s1x.file === 0, 'CONTROL (the release\'s verdict, in a copy): «gone» — the drain drops it and SAVES: lost for good — RED', s1x);
    // (2)
    const WAITS = '  _waitsForRecords(n) { return !!n && this._recordsHeld() && this._unjudged.has(n); }\n';
    ok(JSRC.split(WAITS).length === 2, 'control setup: the notices\' wait for the records is found once');
    const clearScene = async (Mod, name) => {
      const x = await recHeld(Mod, name, { jobs: [{ id: 'jb-0c000001', kind: 'task', name: 'deploy prod', state: 'done', clearedAt: 5, owner: {}, access: { view: 'session', control: 'session' }, runs: [] }],
        notices: { 'conv-c': [{ ts: 1, jobId: 'jb-0c000001', text: 'done exit=0 secret words (1m)' }] } });
      const peekHeld = x.J.peekNotifs('conv-c').map((n) => n.text).join(), drained = x.J.drainNotifs('conv-c').map((n) => n.text).join(), keptHeld = (x.J.pendingNotifs.get('conv-c') || []).length;
      unplant(x.JF, x.jbody);
      try { await x.J._unreadRetry('store'); } catch { }
      const after = x.J.peekNotifs('conv-c').map((n) => n.text).join();
      x.J.shutdown(); return { peekHeld, drained, keptHeld, after };
    };
    const c2 = await clearScene(require(path.join(ROOT, 'src/jobs.js')), 'notifs-cure-clear');
    const c2x = await clearScene(MJ.load('src/jobs.js', anchored(JSRC, WAITS, '  _waitsForRecords(n) { return false; }   /* MUTANT: no wait */\n', 'srl-862a'), 'cure-clear-nowait'), 'notifs-cure-clear-mut');
    ok(c2.peekHeld === '' && c2.drained === '' && c2.keptHeld === 1 && c2.after && !c2.after.includes('secret words'), 'cure (2): while the job records are held the file\'s notice is neither peeked nor drained (it waits); once they read WHOLE it is judged — the cleared job\'s words, never its old ones', c2);
    ok(c2x.peekHeld.includes('secret words') || c2x.drained.includes('secret words'), 'CONTROL (no wait, in a copy): the cleared job\'s OLD words are delivered while its record is unread — RED', c2x);
    // (3) each held-save guard alone — the notices' own save, the store's save of the notices, the records' save — on the shutdown's
    //     save and a clear-all (both reach `_save`)
    const G_NOTIFS = "    if (this._notifsUnread) { if (!this._notifsSaveSaid) {";
    // lane lg-store-writes (the store writer under these guards since U4 met this tip): each guard wraps the writer's hand-off of its file
    const G_STORE_N = "      if (!this._notifsUnread) {   // the B-f276 remainder: a held notifications file is never written over";
    const G_RECORDS = "      if (!this._unread.store) {\n";
    ok([G_NOTIFS, G_STORE_N, G_RECORDS].every((x) => JSRC.split(x).length === 2), 'control setup: the three held-save guards are found once each');
    const nbody = JSON.stringify({ 'conv-g': [{ ts: 1, jobId: 'jb-0g000001', text: 'done exit=0 (1m)' }] });
    const guardScene = async (Mod, name, road) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const NF = path.join(d, 'job-notifications.json'); plant(NF, nbody);
      const JF = path.join(d, 'jobs.json'), jbody = JSON.stringify([{ id: 'jb-0g000002', kind: 'task', name: 'x', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [] }]); plant(JF, jbody);
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 } });
      J.init();
      J.pendingNotifs.set('conv-new', [{ ts: 2, jobId: 'jb-0g000003', text: 'failed exit=3 (2m)' }]);
      if (road === 'saveNotifs') J._saveNotifs();
      else if (road === 'shutdown') { J._dirty = true; }
      else if (road === 'clearAll') { J.jobs.set('jb-0g000004', { id: 'jb-0g000004', kind: 'task', name: 'y', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [] }); try { J.clearJobs([...J.jobs.keys()], { by: 'owner' }); } catch { } J._save(); }
      J.shutdown();
      const out = { notifsKept: bodyOf(NF) === (asRoot ? '(a folder)' : nbody), recordsKept: bodyOf(JF) === (asRoot ? '(a folder)' : jbody) };
      return out;
    };
    const J0 = require(path.join(ROOT, 'src/jobs.js'));
    const gN = await guardScene(J0, 'notifs-g-save', 'saveNotifs'), gS = await guardScene(J0, 'notifs-g-shutdown', 'shutdown'), gC = await guardScene(J0, 'notifs-g-clear', 'clearAll');
    ok(gN.notifsKept && gS.notifsKept && gS.recordsKept && gC.notifsKept && gC.recordsKept, 'the notices\' own save, the shutdown\'s save and a clear-all while BOTH files are held write over neither', { gN, gS, gC });
    if (asRoot) rootSkip('CONTROLS job-notifications.json / jobs.json: each held-save guard alone cut, its save writes over the held file');
    else {
      const xN = await guardScene(MJ.load('src/jobs.js', anchored(anchored(JSRC, G_NOTIFS, '    if (false) { if (!this._notifsSaveSaid) {', 'srl-891a'), "  _notifsBytes() { if (this._notifsUnread) throw", "  _notifsBytes() { if (false) throw", 'srl-891b'), 'g-notifs-cut'), 'notifs-g-save-mut', 'saveNotifs');
      const xS = await guardScene(MJ.load('src/jobs.js', anchored(anchored(JSRC, G_STORE_N, "      if (true) {   // MUTANT: the guard cut", 'srl-892a'), "  _notifsBytes() { if (this._notifsUnread) throw", "  _notifsBytes() { if (false) throw", 'srl-892b'), 'g-store-notifs-cut'), 'notifs-g-shutdown-mut', 'shutdown');
      const xR = await guardScene(MJ.load('src/jobs.js', anchored(anchored(JSRC, G_RECORDS, "      if (true) {   // MUTANT: the guard cut\n", 'srl-893a'), "  _recordsBytes() { if (this._unread && this._unread.store) throw", "  _recordsBytes() { if (false) throw", 'srl-893b'), 'g-records-cut'), 'notifs-g-clear-mut', 'clearAll');
      ok(!xN.notifsKept && !xS.notifsKept && xS.recordsKept && !xR.recordsKept && xR.notifsKept, 'CONTROLS (each save guard cut ALONE — with its file\'s producer guard, the moved line\'s must 1 — in a copy): the notices\' own save writes over the held notices; the shutdown\'s save writes over them through the store\'s save; a clear-all writes over the held job records — each RED, the other file kept', { xN, xS, xR });
    }
    // THE MOVED LINE'S MUST 1, ITS CLASS (主开发 2026-11-19 22:38Z): the bytes are made AT the write — a write QUEUED before a hold
    // came back never lands over the held file. Both files read at the boot, a change of each queued at the writer, then BOTH
    // holds stand (a stand-in: no road of the engine re-holds after a save today — the producers make it a law, not a fact of
    // the order); the writer lands what it owes: refused by name (EHELD), both files untouched. RED (anchored, in a copy): the two
    // producers' guards cut — the queued writes land over the held files.
    {
      const P_RECORDS = "  _recordsBytes() { if (this._unread && this._unread.store) throw", P_NOTIFS = "  _notifsBytes() { if (this._notifsUnread) throw";
      ok([P_RECORDS, P_NOTIFS].every((x) => JSRC.split(x).length === 2), 'control setup: the two producers\' held guards are found once each');
      const queuedScene = (Mod, name) => {
        const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
        const NF = path.join(d, 'job-notifications.json'), JF = path.join(d, 'jobs.json');
        const jbody = JSON.stringify([{ id: 'jb-0q000001', kind: 'task', name: 'x', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [] }]);
        fs.writeFileSync(NF, nbody); fs.writeFileSync(JF, jbody);
        const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 } });
        J.init();
        const read = !J._notifsUnread && !J._unread.store;
        J.pendingNotifs.set('conv-q', [{ ts: 3, jobId: 'jb-0q000002', text: 'queued before the hold' }]);
        J.jobs.set('jb-0q000003', { id: 'jb-0q000003', kind: 'task', name: 'queued', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [] });
        J._save();   // both files' writes QUEUED at the writer (their bytes not made yet)
        const hold = { code: 'EIO', why: 'a stand-in hold', at: 1 };
        J._unread.store = hold; J._notifsUnread = hold;   // …and the holds stand before the writer writes
        const W = require(path.join(ROOT, 'src/store-writer.js')).storeWriter();
        const lw = W.flushSync([JF, NF]);
        const out = { read, notifsKept: fs.readFileSync(NF, 'utf8') === nbody, recordsKept: fs.readFileSync(JF, 'utf8') === jbody, refused: (lw.left || []).filter((x) => /held/.test(x.why || '')).length };
        J._unread.store = null; J._notifsUnread = null; W.flushSync([JF, NF]);   // the holds lifted: what was owed lands (nothing left for the next scene)
        clearTimeout(J._unreadT && J._unreadT.store); J.shutdown();
        return out;
      };
      const q = queuedScene(require(path.join(ROOT, 'src/jobs.js')), 'queued-before-hold');
      ok(q.read && q.notifsKept && q.recordsKept && q.refused === 2, 'must 1\'s class: a write of jobs.json and of job-notifications.json QUEUED before their holds came back is refused at its write (EHELD, by name) — both held files untouched', q);
      const qx = queuedScene(MJ.load('src/jobs.js', anchored(anchored(JSRC, P_RECORDS, "  _recordsBytes() { if (false) throw", 'srl-qb-a'), P_NOTIFS, "  _notifsBytes() { if (false) throw", 'srl-qb-b'), 'queued-no-producer-guards'), 'queued-before-hold-mut');
      ok(!qx.notifsKept && !qx.recordsKept, 'CONTROL (the two producers\' guards cut, in a copy): the queued writes land over BOTH held files — RED', qx);
    }
    // (3) the refused removal of a cleared ARCHIVED job while the notices are held
    const RMA = "    if (this._notifsUnread && arch[i].clearedAt) return { error: this._notifsClearedWords(id), code: 'notifs-unread' };";
    ok(JSRC.split(RMA).length === 2, 'control setup: the archived removal\'s held check is found once');
    const archScene = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const NF = path.join(d, 'job-notifications.json'); plant(NF, nbody);
      fs.writeFileSync(path.join(d, 'jobs-archive.json'), JSON.stringify([{ id: 'jb-0a000001', kind: 'task', name: 'old', state: 'done', clearedAt: 5, owner: {}, access: { view: 'session', control: 'session' }, runs: [] }]));
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 } });
      J.init();
      const r = J.rmArchived('jb-0a000001');
      try { require(path.join(ROOT, 'src/store-writer.js')).storeWriter().flushSync(); } catch { }   // B-0248 step 3: a removal leaves the archive at its LANDING
      const out = { code: r && r.code, kept: (J.archive || []).some((x) => x && x.id === 'jb-0a000001') };
      unplant(NF, nbody); J.shutdown(); return out;
    };
    const a3 = await archScene(J0, 'notifs-rm-arch'), a3x = await archScene(MJ.load('src/jobs.js', anchored(JSRC, RMA, '    /* MUTANT: no held check */', 'srl-909a'), 'rm-arch-cut'), 'notifs-rm-arch-mut');
    ok(a3.code === 'notifs-unread' && a3.kept && a3x.code !== 'notifs-unread' && !a3x.kept, 'removing a cleared ARCHIVED job while the notices are held is refused by name (its record judges them at the read); CONTROL (the check cut, in a copy): the record goes — RED', { a3, a3x });
    // (3) the For-you ask again while a read HANGS: the boot's filing the store refused is asked again at the next try, though the one
    //     read slot is taken (r4 N4) — CONTROL: the ask below the slot check (as r3 had it) is never asked again while the read hangs
    const REASK = "    if (!this._notifsItem) { const v = this._forYou(null, M.forYouCopy(null, 'notifs-unread', { error: this._notifsUnread.code })); if (v && v.id) this._notifsItem = v.id; }\n    if (this._notifsP) return;\n";
    ok(JSRC.split(REASK).length === 2, 'control setup: the ask again above the slot check is found once');
    const hangScene = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const NF = path.join(d, 'job-notifications.json'); plant(NF, nbody);
      let accept = false; const filed = [];
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser: (n) => { if (!accept) return { ok: false, why: 'the For you store is full' }; filed.push(n); return { ok: true, id: 'it-h' + filed.length }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 } });
      J.init();
      const realRead = fs.promises.readFile;
      fs.promises.readFile = (f, ...a) => (String(f) === NF ? new Promise(() => { }) : realRead.call(fs.promises, f, ...a));   // the storage never answers
      try {
        J._notifsRetry().catch(() => { });   // the first try: its read hangs, holding the one slot
        await new Promise((r) => setImmediate(r));
        accept = true;   // the For you store has room again
        await J._notifsRetry();   // the next try, while the read still hangs
      } finally { fs.promises.readFile = realRead; }
      const out = { held: !!J._notifsUnread, slot: !!J._notifsP, filed: filed.filter((n) => n && n.fact === 'notifs-unread').length };
      J._unreadStopped = true; clearTimeout(J._notifsT); J._notifsT = null;
      unplant(NF, nbody); J.shutdown(); return out;
    };
    const h3 = await hangScene(J0, 'notifs-hang-reask');
    const h3x = await hangScene(MJ.load('src/jobs.js', anchored(JSRC, REASK, "    if (this._notifsP) return;\n    if (!this._notifsItem) { const v = this._forYou(null, M.forYouCopy(null, 'notifs-unread', { error: this._notifsUnread.code })); if (v && v.id) this._notifsItem = v.id; }   /* MUTANT: below the slot */\n", 'srl-934a'), 'reask-below-slot'), 'notifs-hang-reask-mut');
    ok(h3.held && h3.slot && h3.filed === 1 && h3x.slot && h3x.filed === 0, 'a refused For-you filing is asked again while the read HANGS (the slot taken) — filed once the store has room; CONTROL (the ask below the slot check, in a copy): never asked again while the read hangs — RED', { h3, h3x });
    // 主开发 04:33Z (1): the ARCHIVE's hold begins INSIDE the boot's judge — jobs.json read whole, the archive unreadable, loaded lazily by
    // the first notice of an archived job: that FIRST conversation's list waits too (peek empty), never out with a cleared job's old words
    const PRE = "    if (boot && !this.archive && !this.readOnly && list.some((n) => n && n.jobId && !this.jobs.has(n.jobId))) this._archiveAtBoot();\n";
    ok(JSRC.split(PRE).length === 2, 'control setup: the boot judge\'s archive load before the held check is found once');
    const archBoot = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'jobs.json'), '[]');   // the records read whole — the cleared job is ARCHIVED
      const AF = path.join(d, 'jobs-archive.json'), abody = JSON.stringify([{ id: 'jb-0a000001', kind: 'task', name: 'deploy prod', state: 'done', clearedAt: 5, owner: {}, access: { view: 'session', control: 'session' }, runs: [] }]); plant(AF, abody);
      fs.writeFileSync(path.join(d, 'job-notifications.json'), JSON.stringify({ 'conv-a1': [{ ts: 1, jobId: 'jb-0a000001', text: 'done exit=0 ok (1m)' }] }));
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 }, viewerOf: () => null });
      J.init();
      const out = { archHeld: !!(J._unread && J._unread.archive), peek: J.peekNotifs('conv-a1').map((n) => n.text).join(), waiting: (J.pendingNotifs.get('conv-a1') || []).length };
      J._unreadStopped = true; J.shutdown(); unplant(AF, abody); return out;
    };
    const ab = await archBoot(J0, 'notifs-arch-boot'), abx = await archBoot(MJ.load('src/jobs.js', anchored(JSRC, PRE, '', 'arch-preload-cut'), 'arch-preload-cut'), 'notifs-arch-boot-mut');
    ok(ab.archHeld && ab.peek === '' && ab.waiting === 1, 'the archive unreadable at the boot (jobs.json whole): the FIRST conversation\'s notice of an archived job WAITS for the records (peek empty, kept)', ab);
    ok(abx.peek === 'done exit=0 ok (1m)', 'CONTROL (the archive load before the held check cut, in a copy): the judge never knows the archive is held — the first list\'s notice goes out with the cleared job\'s old words — RED', abx);
    // 主开发 19:21Z (the move's range check, wkazpjzcs): peekNotifs JOINS TWO HOLDS — the release's (the Task Groups store held: an undecided
    // line stays queued) and this chain's (what the held job records cannot judge waits) — driven AT ONCE over the real engine (who may read
    // a job's notice is a privacy question): the records held AND the viewer held; A the file's (an owner's, judged at the boot while the
    // records are held: it WAITS), B a subscriber's with no record (undecided while the groups are held), C a subscriber's too, but CLAIMED
    // (a hand-over owns it: only its claim lets it past the held groups). The peek is the INTERSECTION (C); the drain of the peeked set
    // takes exactly it (its claim gone) and keeps A and B. Three controls, each anchor first
    const PEEK_REC = "    const q = (this.pendingNotifs.get(cid) || []).filter((n) => !this._waitsForRecords(n) && !this._waitsForLanding(n));\n";   // B-54b7: the peek's records filter beside the taken copies' (the cut below cuts both — this scene takes none)
    const PEEK_VIEW = "    return v && v.held ? q.filter((n) => n && (n.ho || this.printableNow(cid, n.jobId, v, { sub: n.sub === true }))) : q;";
    ok(JSRC.split(PEEK_REC).length === 2 && JSRC.split(PEEK_VIEW).length === 2, 'control setup: the peek\'s two filters are each found once');
    const twoHolds = async (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const JF = path.join(d, 'jobs.json'), jbody = '[]'; plant(JF, jbody);   // the job records HELD
      fs.writeFileSync(path.join(d, 'job-notifications.json'), JSON.stringify({ 'conv-2h': [{ ts: 1, jobId: 'jb-2h00000a', text: 'done exit=0 (1m)' }] }));
      const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, resolveNotice() { }, log: () => { }, logsSweep: { bootDelayMs: 3600e3 }, viewerOf: () => ({ held: true }) });   // the Task Groups store HELD
      J.init();
      const q = J.pendingNotifs.get('conv-2h') || [];
      const C = { ts: 3, jobId: 'jb-2h00000c', text: 'done exit=0 (3m)', sub: true };
      q.push({ ts: 2, jobId: 'jb-2h00000b', text: 'failed exit=1 (2m)', sub: true }, C);
      J.pendingNotifs.set('conv-2h', q);
      J.claimNotifs('conv-2h', [C], 'ho-2h');   // the claimed one: a hand-over in flight owns it (its own claim door)
      const tag = (l) => (l || []).map((n) => n.jobId.slice(-1)).join('');
      const peek = J.peekNotifs('conv-2h'), drained = J.drainNotifs('conv-2h', new Set(peek));
      const out = { held: !!J._unread.store, peek: tag(peek), drained: tag(drained), kept: tag(J.pendingNotifs.get('conv-2h')), claimLeft: drained.some((n) => n && n.ho) };
      J._unreadStopped = true; J.shutdown(); unplant(JF, jbody); return out;
    };
    const th = await twoHolds(J0, 'notifs-two-holds');
    const thR = await twoHolds(MJ.load('src/jobs.js', anchored(JSRC, PEEK_REC, "    const q = (this.pendingNotifs.get(cid) || []).slice();\n", 'peek-records-cut'), 'peek-records-cut'), 'notifs-two-holds-rec');   // stale-pins: kept — the control plants the older form in a copy
    const thV = await twoHolds(MJ.load('src/jobs.js', anchored(JSRC, PEEK_VIEW, '    return q;', 'peek-viewer-cut'), 'peek-viewer-cut'), 'notifs-two-holds-view');
    const thC = await twoHolds(MJ.load('src/jobs.js', anchored(JSRC, PEEK_VIEW, PEEK_VIEW.replace('(n.ho || this.printableNow(', '(this.printableNow('), 'peek-claim-cut'), 'peek-claim-cut'), 'notifs-two-holds-claim');
    // the move onto checkpoint 61: the missing record's verdict meets lane bl-windows' 'groups-unread' — CONTROL (the meeting cut: a plain
    // «unknown» under both holds, which checkpoint 61's printableNow prints): the undecided subscriber's line is peeked
    const thM = await twoHolds(MJ.load('src/jobs.js', anchored(JSRC, GONE, "    if (!rec) return sub ? (this._recordsHeld() ? 'unknown' : 'gone') : 'owner';\n", 'peek-meeting-cut'), 'peek-meeting-cut'), 'notifs-two-holds-meet');   // stale-pins: kept — the control plants the older form in a copy
    ok(th.held && th.peek === 'c' && th.drained === 'c' && th.kept === 'ab' && !th.claimLeft, 'the records AND the Task Groups held at once: the peek is the intersection of the two holds (only the claimed line), the drain of the peeked set takes exactly it — the file\'s waiting line and the undecided subscriber\'s stay queued', th);
    ok(thR.peek === 'ac' && thV.peek === 'bc' && thC.peek === '' && thM.peek === 'bc', 'CONTROLS (each in a copy): the records filter cut — the file\'s line the held records cannot judge is peeked; the viewer\'s held branch cut — the undecided subscriber\'s line is peeked; the claim\'s pass cut — the claimed line waits with the undecided; the missing record\'s held view said «unknown» (the meeting with checkpoint 61 cut) — the undecided line is peeked — each RED', { thR, thV, thC, thM });
    ok(thR.drained === 'c' && thR.kept === 'ab', 'and the DRAIN keeps its own guard: a peek that offers the file\'s waiting line (the records filter cut) still drains only the claimed one — the waiting line stays', thR);
    // 主开发 04:33Z (2c): the LADDER's retry judge over a subscriber's parked copy it cannot judge (the records held: «unknown») — the ladder
    // drops its copy on this answer and writes its file at once: the stash is ON DISK at once too, never only in memory until a tick
    const SAVE_R = "      this._saveNotifs();\n    }\n    return false;\n";
    ok(JSRC.split(SAVE_R).length === 2, 'control setup: the retry judge\'s save after its stash is found once');
    const retryScene = async (Mod, name) => {
      const x = await recHeld(Mod, name, { notices: {} });
      const owed = x.J.retryOwed('conv-r', { id: 'rt-0001', producer: 'jobs', firstAt: 1, meta: { subscriber: true, sub: true, jobId: 'jb-0r000001', jobName: 'nightly report', ev: { what: 'done exit=0 (1m)', at: 1 } } });
      const disk = x.onDisk(), out = { held: !!x.J._unread.store, owed, memory: (x.J.pendingNotifs.get('conv-r') || []).length, disk: ((disk && disk['conv-r']) || []).map((n) => n.jobId).join() };
      x.J._unreadStopped = true; x.J.shutdown(); unplant(x.JF, x.jbody); return out;
    };
    const rt = await retryScene(J0, 'notifs-retry-save'), rtx = await retryScene(MJ.load('src/jobs.js', anchored(JSRC, SAVE_R, "    }\n    return false;\n", 'retry-stash-nosave'), 'retry-stash-nosave'), 'notifs-retry-save-mut');
    ok(rt.held && rt.owed === false && rt.memory === 1 && rt.disk === 'jb-0r000001', 'the ladder\'s judge answers «not owed» for a copy the held records cannot judge — and the stash it makes instead is ON DISK at once (the ladder drops its own copy now)', rt);
    ok(rtx.owed === false && rtx.memory === 1 && rtx.disk === '', 'CONTROL (the save cut, in a copy): the stash is only in memory while the ladder already dropped its copy — a crash loses the notice for good — RED', rtx);
  }
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'store-read-law ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
