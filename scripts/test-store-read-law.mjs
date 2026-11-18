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
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const D = scratch('store-read-law'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
process.on('exit', () => { try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
const MJ = mutantCopies('store-read-law', ROOT);
// a read that FAILS while the file is there: mode 000 (EACCES) — under root, which reads it anyway, a folder in its place (EISDIR)
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const plant = (F, body) => { if (asRoot) fs.mkdirSync(F); else { fs.writeFileSync(F, body); fs.chmodSync(F, 0o000); } };
const unplant = (F, body) => { if (asRoot) { fs.rmdirSync(F); fs.writeFileSync(F, body); } else fs.chmodSync(F, 0o644); };
const bodyOf = (F) => { try { return fs.statSync(F).isDirectory() ? '(a folder)' : (fs.chmodSync(F, 0o644), fs.readFileSync(F, 'utf8')); } catch (e) { return '(' + e.code + ')'; } };

console.log('§1 hosts.json (src/hosts.js) — every paired machine and its dial token hash');
{
  const HSRC = fs.readFileSync(path.join(ROOT, 'src/hosts.js'), 'utf8');
  const LOAD = "    this._loadAnswer(SR.storeAnswer(read, { valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v) }));\n";
  ok(HSRC.split(LOAD).length === 2, 'control setup: hosts.js loads through storeAnswer once (the plant the control swaps)');
  const RELEASE = MJ.load('src/hosts.js', HSRC.replace(LOAD, "    try { this._state = JSON.parse(read.text); } catch { } if (!Array.isArray(this._state.hosts)) this._state.hosts = [];   /* MUTANT: the release — any failure starts EMPTY */\n"), 'release-load');
  const body = JSON.stringify({ hosts: [{ id: 'h-0001', name: 'build box', transport: 'dial', deviceId: 'dev-0001' }] });
  const scene = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'hosts.json'), CACHE = path.join(d, 'remote-jsonl', 'h-0001');
    plant(F, body);
    fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(path.join(CACHE, 'conv.jsonl'), '{}\n');   // a machine's transcript cache
    const H = new Mod.HostManager({ dataDir: d });
    const held = !!(H.unreadWords && H.unreadWords()), listedWhileHeld = H.list().length;
    let refused = null; try { H.reshapeStore((st) => st); } catch (e) { refused = e; }   // a change while held (the release: saved)
    H.sweepJsonlCache();   // its read r1 (M1): the boot's sweep, 60 s on — the held list must not make every machine's cache an orphan
    const cacheKept = fs.existsSync(CACHE);
    const ran = [], lifts = []; if (H.whenRead) H.whenRead(() => ran.push('swept')); H.onReadAgain = () => lifts.push(1);   // its read r1 (S5, S1)
    const ranWhileHeld = ran.length;
    let imp = null; try { imp = H.importBundle({ hosts: [] }); } catch (e) { imp = { threw: String(e && e.message) }; }   // its read r1 (S3)
    const kept = bodyOf(F) === (asRoot ? '(a folder)' : body);
    if (!asRoot) fs.chmodSync(F, 0o000);
    unplant(F, body);   // the storage answers again
    if (H._unreadRetry) await H._unreadRetry();
    return { held, listedWhileHeld, refused: refused ? { code: refused.code, msg: String(refused.message) } : null, kept, back: H.list().map((h) => h.id).join(), words: H.unreadWords ? H.unreadWords() : null, cacheKept, ranWhileHeld, ranAfter: ran.length, lifts: lifts.length, imp: imp && { skipped: !!imp.skipped, threw: imp.threw || null, warned: (imp.warnings || []).some((w) => /^the machines were not imported — hosts\.json/.test(w)) } };
  };
  const r = await scene({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-held');
  ok(r.held && r.listedWhileHeld === 0 && !!r.refused && r.refused.code === 'hosts-unread' && /^reshaping the machines store: hosts\.json in VibeSpace's data folder could not be read \((EACCES|EISDIR)\); VibeSpace reads it again every few minutes\. No machine is lost: nothing is written over it/.test(r.refused.msg), 'hosts.json whose read FAILS is HELD: no machine shown, a change refused BY NAME (what it was, why, that nothing is lost)', r);   // stale-pins: kept (the sentence is composed now — the runtime words are the same while no read waits)
  ok(r.kept && r.back === 'h-0001' && r.words === null, 'nothing was written over hosts.json while held; read again, its machines are back whole and the hold lifts', r);
  ok(r.cacheKept && r.ranWhileHeld === 0 && r.ranAfter === 1 && r.lifts === 1 && r.imp && r.imp.skipped && r.imp.warned && !r.imp.threw,
    'its read r1: while held the boot\'s cache sweep deletes NO machine\'s transcript cache (M1), a sweep that needs the machines waits and runs once they read (S5), the lift redraws every page\'s list (S1), an import skips the machines with its words — never a throw (S3)', r);
  const rx = await scene(RELEASE, 'hosts-release');
  ok(!rx.held && rx.listedWhileHeld === 0 && !(rx.refused && rx.refused.code === 'hosts-unread') && (asRoot || !rx.kept) && !rx.cacheKept, 'CONTROL (the release\'s load, in a copy): a failed read starts EMPTY — the cache sweep DELETES the machine\'s transcripts, nothing is refused, and the next save WRITES OVER hosts.json — every paired machine gone (under root the stand-in is a folder no save can replace)', rx);
  // torn bytes: kept aside (a copy), the list starts empty — as the release did, now through the law
  {
    const d = path.join(D, 'hosts-torn'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'hosts.json'), '{"hosts": [');
    const H = new (require(path.join(ROOT, 'src/hosts.js')).HostManager)({ dataDir: d });
    const asides = fs.readdirSync(d).filter((n) => /^hosts\.json\.corrupt-\d+$/.test(n));
    ok(!H.unreadWords() && H.list().length === 0 && asides.length === 1 && fs.readFileSync(path.join(d, asides[0]), 'utf8') === '{"hosts": [', 'torn bytes are KEPT aside (a copy) and the machines list starts empty — never a hold');
  }
  // «missing» right after an unreadable answer: read once more before anything is written there
  {
    const d = path.join(D, 'hosts-gone'); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'hosts.json'); plant(F, body);
    const H = new (require(path.join(ROOT, 'src/hosts.js')).HostManager)({ dataDir: d });
    if (asRoot) fs.rmdirSync(F); else fs.rmSync(F, { force: true });
    await H._unreadRetry();
    const heldAfterOne = !!H.unreadWords();
    await H._unreadRetry();
    ok(heldAfterOne && !H.unreadWords() && H.list().length === 0, 'a «missing» answer right after an unreadable one is READ ONCE MORE (the hold stands); missing again, the list starts empty', { heldAfterOne });
  }
  // its read r1 (M2): a try that meets a read IN FLIGHT, and a read that then fails, both leave the next try ARMED (the copy's order
  // returned first — the timer that called it had cleared itself, so one hung read ended the tries until a restart)
  const armScene = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'hosts.json'); plant(F, body);
    const H = new Mod.HostManager({ dataDir: d });
    const prf = fs.promises.readFile; let release = null;
    fs.promises.readFile = function (f, ...a) { if (String(f) === F) return new Promise((res, rej) => { release = () => rej(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' })); }); return prf.call(this, f, ...a); };
    let armedMeeting = false, armedAfter = false, armedAfterFail = false;
    try {
      const first = H._unreadRetry();   // its read hangs
      clearTimeout(H._unreadT); H._unreadT = null;   // the timer that fires the next try clears itself first
      await H._unreadRetry();   // …and meets the read in flight
      armedMeeting = !!H._unreadT;
      if (release) release(); await first;   // the hung read fails — the try armed by the meeting still stands
      armedAfter = !!H._unreadT;
      // its read r2 (X5): a try that meets NOTHING in flight and whose read fails at once arms the next too
      clearTimeout(H._unreadT); H._unreadT = null;
      fs.promises.readFile = function (f, ...a) { if (String(f) === F) return Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })); return prf.call(this, f, ...a); };
      await H._unreadRetry(); armedAfterFail = !!H._unreadT;
    } finally { fs.promises.readFile = prf; }
    clearTimeout(H._unreadT); H._unreadT = null; if (!asRoot) fs.chmodSync(F, 0o644);
    return { armedMeeting, armedAfter, armedAfterFail, held: !!H.unreadWords() };
  };
  const ar = await armScene({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-arm');
  ok(ar.held && ar.armedMeeting && ar.armedAfter && ar.armedAfterFail, 'its read r1 (M2) / r2 (X5): a try that meets a read in flight arms the next, so does the read that then fails, and so does a try whose own read fails at once — the tries never end while held', ar);
  const ARM = '    this._unreadRetrySoon();   // its read r1 (M2): the next try is armed FIRST (jobs.js\'s order) — a try that meets one in flight, or a read that fails, never ends the tries\n    if (this._unreadP) return;\n';
  ok(HSRC.split(ARM).length === 2, 'control setup: the anchor of the control «the next try armed first» is in hosts.js');
  const arx = await armScene(MJ.load('src/hosts.js', HSRC.replace(ARM, '    if (this._unreadP) return;   /* MUTANT: the first cut\'s order */\n    this._unreadRetrySoon();\n'), 'arm-order'), 'hosts-arm-mut');
  ok(arx.held && !arx.armedMeeting, 'CONTROL (the first cut\'s order, in a copy): the try that meets a read in flight arms NOTHING', arx);
  const ary = await armScene(MJ.load('src/hosts.js', HSRC.replace(ARM, '    if (this._unreadP) { this._unreadRetrySoon(); return; }   /* MUTANT: armed only on a meeting */\n'), 'arm-meeting-only'), 'hosts-arm-mut2');
  ok(ary.held && ary.armedMeeting && !ary.armedAfterFail, 'CONTROL (r2 X5 — armed only on a meeting, in a copy): a try whose own read fails arms NOTHING (the half-vacuous leg r2 named)', ary);
  // its read r2 (X2): an OLDER try whose torn-bytes copy lands after a NEWER try lifted the hold never lifts it again as empty
  const raceScene = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'hosts.json'); plant(F, body);
    const H = new Mod.HostManager({ dataDir: d });
    const prf = fs.promises.readFile, pcf = fs.promises.copyFile; let land = null;
    fs.promises.readFile = function (f, ...a) { if (String(f) === F) return Promise.resolve('{"hosts": ['); return prf.call(this, f, ...a); };   // try k reads torn bytes
    fs.promises.copyFile = function (src, ...a) { if (String(src) === F) return new Promise((res) => { land = res; }); return pcf.call(this, src, ...a); };   // …and its copy aside hangs
    let olderErr = null, after = null;
    try {
      const older = H._unreadRetry().catch((e) => { olderErr = String(e && e.message); });
      await new Promise((r) => setImmediate(r));
      fs.promises.readFile = prf; unplant(F, body);   // the storage answers whole
      await H._unreadRetry();   // try k+1 reads the machines and lifts the hold
      const lifted = H.list().map((h) => h.id).join();
      if (land) land(); await older;   // try k's copy lands
      after = { lifted, list: H.list().map((h) => h.id).join(), held: !!H.unreadWords(), olderErr };
    } finally { fs.promises.readFile = prf; fs.promises.copyFile = pcf; }
    clearTimeout(H._unreadT); H._unreadT = null; return after;
  };
  const raceHeld = async (Mod, name) => {   // its read r3 (Y4): the NEWER try reads EIO — the hold stands — then the older's copy lands
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'hosts.json'); plant(F, body);
    const H = new Mod.HostManager({ dataDir: d });
    const prf = fs.promises.readFile, pcf = fs.promises.copyFile; let land = null, out = null;
    fs.promises.readFile = function (f, ...a) { if (String(f) === F) return Promise.resolve('{"hosts": ['); return prf.call(this, f, ...a); };
    fs.promises.copyFile = function (src, ...a) { if (String(src) === F) return new Promise((res) => { land = res; }); return pcf.call(this, src, ...a); };
    try {
      const older = H._unreadRetry().catch(() => { });
      await new Promise((r) => setImmediate(r));
      fs.promises.readFile = function (f, ...a) { if (String(f) === F) return Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })); return prf.call(this, f, ...a); };
      await H._unreadRetry();   // the newer try: EIO — still held
      if (land) land(); await older;
      out = { held: !!H.unreadWords(), listed: H.list().length };
    } finally { fs.promises.readFile = prf; fs.promises.copyFile = pcf; }
    clearTimeout(H._unreadT); H._unreadT = null; if (!asRoot) { try { fs.chmodSync(F, 0o644); } catch { } } return out;
  };
  const rh = await raceHeld({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-race-held');
  const SEQ = '      if (!this._unread || mine !== this._unreadSeq) return;';
  const rhx = await raceHeld(MJ.load('src/hosts.js', HSRC.replace(SEQ, '      if (!this._unread) return;   /* MUTANT: the seq half cut */'), 'race-seq-half'), 'hosts-race-held-mut');
  ok(!!rh && rh.held && !!rhx && !rhx.held, 'its read r3 (Y4): the newer try read EIO (the hold stands) and the older try\'s copy lands — the hold STANDS; CONTROL (the seq half cut, in a copy): the older try lifts it as EMPTY', { rh, rhx });
  const rc = await raceScene({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-race');
  ok(!!rc && rc.lifted === 'h-0001' && rc.list === 'h-0001' && !rc.held && !rc.olderErr, 'its read r2 (X2): an older try whose copy of torn bytes lands AFTER a newer try lifted the hold changes nothing — the machines stay loaded', rc);
  const RACE = '      if (!this._unread || mine !== this._unreadSeq) return;   // its read r2 (X2): a newer try read meanwhile (and may have lifted) — its answer stands\n';
  ok(HSRC.split(RACE).length === 2, 'control setup: the anchor of the control «only the newest try lifts» is in hosts.js');
  const rcx = await raceScene(MJ.load('src/hosts.js', HSRC.replace(RACE, '      /* MUTANT: no re-check after the copy */\n'), 'no-race-check'), 'hosts-race-mut');
  ok(!!rcx && (rcx.list === '' || !!rcx.olderErr), 'CONTROL (no re-check after the copy, in a copy): the older try loads the machines list EMPTY over the lifted one (or throws on a hold already gone)', rcx);
  // the cure (主开发 23:20Z): the SAVE's own guard has its red control (it covers the timers' saves and the stop's flush — removing
  // only it left every leg green)
  {
    const saveH = (Mod, name) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'hosts.json'); plant(F, body);
      const H = new Mod.HostManager({ dataDir: d });
      H._state.hosts.push({ id: 'h-x', name: 'x', transport: 'ssh', host: 'x.invalid', user: 'u' });
      H._save();
      const kept = bodyOf(F) === (asRoot ? '(a folder)' : body);
      clearTimeout(H._unreadT); H._unreadT = null; if (!asRoot) { try { fs.chmodSync(F, 0o644); } catch { } }
      return kept;
    };
    const SAVEH = "    if (this._unread) { if (!this._unreadSaveSaid) { this._unreadSaveSaid = true; console.warn('[hosts] a hosts.json write was refused: the file could not be read, and nothing is written over it until it reads'); } return false; }\n";
    ok(HSRC.split(SAVEH).length === 2, 'control setup: the anchor of the control «the save\'s guard» is in hosts.js');
    const k = saveH({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-save-guard');
    const kx = saveH(MJ.load('src/hosts.js', HSRC.replace(SAVEH, '    /* MUTANT: no save guard */\n'), 'hosts-no-save-guard'), 'hosts-save-guard-mut');
    ok(k && (asRoot || !kx), 'the save itself refuses while held (a timer\'s save, the stop\'s flush); CONTROL (only that guard removed, in a copy): the save WRITES OVER the held file', { k, kx });
  }
  // the cure: the lift re-judges reach ONLY for what it read — a read with machines does, an empty lift (the file gone) does not
  {
    const reach = async (Mod, name, gone) => {
      const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
      const F = path.join(d, 'hosts.json'); plant(F, body);
      const H = new Mod.HostManager({ dataDir: d }); let n = 0; H.onReachChange = () => { n++; };
      if (gone) { if (asRoot) fs.rmdirSync(F); else fs.rmSync(F, { force: true }); await H._unreadRetry(); await H._unreadRetry(); }
      else { unplant(F, body); await H._unreadRetry(); }
      clearTimeout(H._unreadT); H._unreadT = null; return { lifted: !H.unreadWords(), n };
    };
    const RJ = "    if (a.state === 'data') this._reachChanged('hosts.json read');";
    ok(HSRC.split(RJ).length === 2, 'control setup: the anchor of the control «reach only for what was read» is in hosts.js');
    const withData = await reach({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-reach-data', false);
    const empty = await reach({ HostManager: require(path.join(ROOT, 'src/hosts.js')).HostManager }, 'hosts-reach-empty', true);
    const emptyX = await reach(MJ.load('src/hosts.js', HSRC.replace(RJ, "    this._reachChanged('hosts.json read');   /* MUTANT: every lift re-judges */"), 'hosts-reach-every'), 'hosts-reach-empty-mut', true);
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
        await H._unreadRetry();   // its read hangs: said and let go at the deadline
        const afterHung = { inFlight: !!H._unreadP, held: !!H.unreadWords(), words: String(H.unreadWords() || '') };
        await H._unreadRetry();   // the read still hangs: no second read
        const whileHung = calls;
        release(body); for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r));   // the storage answers — late
        out = { afterHung, whileHung, calls, lifted: !H.unreadWords(), list: H.list().map((h) => h.id).join() };
      } finally { fs.promises.readFile = HOLDS.prf; clearInterval(keep); clearTimeout(H._unreadT); H._unreadT = null; unplant(path.join(d, 'hosts.json'), body); }
      return out;
    };
    const back = await deadlineScene(require(path.join(ROOT, 'src/hosts.js')), 'hosts-deadline');
    ok(!!back && back.afterHung.held && !back.afterHung.inFlight && /a read of it is still waiting/.test(back.afterHung.words) && back.whileHung === 1 && back.calls === 1 && back.lifted && back.list === 'h-0001',
      'a read again that hangs is said and let go at its deadline (the words say a read waits), no second read starts while it hangs (one thread of the pool), and its LATE answer lifts the hold the moment it comes', back);
    const LATE = "if (this._unread && !this._unreadStopped && mine === this._unreadSeq) this._unreadJudge(late, mine)", CAP = "    if (this._hungP) { if (!this._hungSaid) {";
    ok(HSRC.split(LATE).length === 2 && HSRC.split(CAP).length === 2, 'control setup: the anchors of the controls «the late answer judged» and «one read at most» are in hosts.js');
    const backL = await deadlineScene(MJ.load('src/hosts.js', HSRC.replace(LATE, 'if (false) this._unreadJudge(late, mine)'), 'hosts-late-dropped'), 'hosts-deadline-late');
    ok(!!backL && !backL.lifted && backL.calls === 1, 'CONTROL (the late answer dropped, in a copy): the storage answered, and the hold stands — slow storage is held for ever', backL);
    const capLine = HSRC.split('\n').find((l) => l.startsWith(CAP));
    const backC = await deadlineScene(MJ.load('src/hosts.js', HSRC.replace(capLine + '\n', ''), 'hosts-no-cap'), 'hosts-deadline-cap');
    ok(!!backC && backC.whileHung === 2, 'CONTROL (the one-read cap cut, in a copy): each try while the first read hangs starts ANOTHER read (a thread of the pool each)', backC);
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
    const hx = watch(MJ.load('src/server/device-upgrade-watch.js', UW.replace(HG, '    /* MUTANT: judged while held */\n'), 'upw-no-held'), 'upw-held-mut', true);
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
    const l = lift(MW, 'upw-lift'), lx = lift(MJ.load('src/server/device-upgrade-watch.js', UW.replace(MAXH, 'now() - Number(g.at || 0) < goneAfterMs'), 'upw-from-begin'), 'upw-lift-mut');   // stale-pins: kept (the control plants the release's text in a copy)
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
    const gotx = run(MJ.load('src/server/hub-act-ask.js', HSA.replace(GUARD, '    /* MUTANT: no hold check */\n'), 'hub-act-no-held'));
    ok(got.standing === 1 && gotx.standing === 0, 'its read r3 (Y1): on a HELD hosts list the asker\'s boot re-judgement keeps the stored standing subject (its Deny with it); CONTROL (no hold check, in a copy): it is ENDED as «its machine is gone»', { got, gotx });
  }
  // its read r2 (X1): desktop-access answers a HELD list «unavailable» (the keeper marks offline) — never «not a paired machine»
  // (the keeper deletes a removed machine's desktop-app records on that code)
  {
    const ACC = require(path.join(ROOT, 'src/server/desktop-access.js'));
    const held = { unreadWords: () => 'hosts.json could not be read (EACCES)', get: () => { throw new Error('host not found'); }, deviceBounded: async () => { throw new Error('no device'); }, isLocal: () => false };
    const codeOf = async (A) => { try { await A.create({ hosts: held, log: { log() { }, warn() { } } }).call('h-0001', 'status', {}); return 'answered'; } catch (e) { return e && e.code; } };
    const got = await codeOf(ACC);
    const DSRC = fs.readFileSync(path.join(ROOT, 'src/server/desktop-access.js'), 'utf8'), NH = '    notHeld();\n    if (!hostKnown(hostId)) throw named(';
    ok(DSRC.split(NH).length === 2, 'control setup: the anchor of the control «a held list is unavailable» is in desktop-access.js');
    const gotx = await codeOf(MJ.load('src/server/desktop-access.js', DSRC.replace(NH, '    /* MUTANT: no hold check */\n    if (!hostKnown(hostId)) throw named('), 'no-held-check'));
    ok(got === 'host_unavailable' && gotx === 'unsupported-host', 'its read r2 (X1): a desktop call on a machine while hosts.json is HELD answers host_unavailable (the keeper marks it offline); CONTROL (no hold check, in a copy): «unsupported-host» — the code on which the keeper DELETES every machine\'s desktop-app records', { got, gotx });
  }
  const ER = fs.readFileSync(path.join(ROOT, 'src/server/exit-routes.js'), 'utf8');
  ok(/res\.json\(\{ hosts: list, key: \{ exists: k\.exists, path: k\.path, publicKey: k\.publicKey \}, \.\.\.\(hosts\.unreadWords && hosts\.unreadWords\(\) \? \{ unread: hosts\.unreadWords\(\) \} : \{\}\) \}\);/.test(ER)
    && /app\.delete\('\/api\/hosts\/:id', async \(req, res\) => \{\n  if \(hosts\.unreadWords && hosts\.unreadWords\(\)\) return res\.status\(503\)/.test(ER)
    && /app\.patch\('\/api\/hosts\/:id\/exit-access', async \(req, res\) => \{\n  if \(isAnyBearer\(req\)\) return res\.status\(403\)[^\n]*\n  if \(hosts\.unreadWords && hosts\.unreadWords\(\)\) return res\.status\(503\)/.test(ER),
  'WIRING: the machines list answers WHY it is empty; a removal and an exit-access change are refused BEFORE their side effects (the unpair teardown, the grants store) — an agent token still meets its own 403 first');
  const DP = fs.readFileSync(path.join(ROOT, 'src/server/dial-pairing.js'), 'utf8'), PS = fs.readFileSync(path.join(ROOT, 'src/routes/persistence.js'), 'utf8'), AU = fs.readFileSync(path.join(ROOT, 'src/server/account-usage-routes.js'), 'utf8');
  ok(/if \(hosts\.unreadWords && hosts\.unreadWords\(\)\) \{ holdDial\(socket, deviceId\); return null; \}\n  const want = hosts\.dialTokenHash\(deviceId\);/.test(DP) && /HTTP\/1\.1 503 Service Unavailable/.test(DP)
    && /if \(hostsHeld\) return res\.status\(503\)/.test(PS) && /const lists = r && r\.skipped \? null :/.test(PS)
    && (AU.match(/if \(hosts\.whenRead\) hosts\.whenRead\(sweep\); else sweep\(\);/g) || []).length === 2 && /hosts\.onReadAgain = \(\) => bcastAll\(\{ type: 'hosts-updated' \}\);/.test(ER),
  'WIRING (its read r1): a dial met while held is a 503 the device retries (never «pair again»), an export that asks for the machines is refused with its reason, an import adds no exit lists for machines it skipped, both token sweeps wait for the read, the lift is broadcast');
}

console.log('§2 machine-mounts.json (src/machine-mounts.js) — every mount of a paired machine, each push record\'s token id');
{
  const MSRC = fs.readFileSync(path.join(ROOT, 'src/machine-mounts.js'), 'utf8');
  const LOAD = '    this._loadAnswer(SR.storeAnswer(read, { valid: STORE_SHAPE }));\n';
  ok(MSRC.split(LOAD).length === 2, 'control setup: the anchor of the control «the release\'s load» is in machine-mounts.js (one storeAnswer call in the constructor)');
  const RELEASE = MJ.load('src/machine-mounts.js', MSRC.replace(LOAD, "    try { this._state = JSON.parse(read.text); } catch { try { if (fs.existsSync(this._file)) fs.copyFileSync(this._file, this._file + '.corrupt-' + Date.now()); } catch { } this._state = { mounts: [] }; this._migrateLegacy(); }   /* MUTANT: the release — any failure starts EMPTY and ingests the legacy stores */\n"), 'release-mounts');
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
    M.gcOrphanTokens();   // the boot's restore runs it 5 s on
    const revokedWhileHeld = revoked.slice();
    let refused = null; try { await M.unmount('mm-0001'); } catch (e) { refused = e; }
    const legacyKept = fs.existsSync(LEG) && !fs.existsSync(LEG + '.migrated');
    const kept = bodyOf(F) === (asRoot ? '(a folder)' : body);
    if (!asRoot) fs.chmodSync(F, 0o000);
    unplant(F, body);   // the storage answers again
    if (M._unreadRetry) await M._unreadRetry();
    await new Promise((r) => setImmediate(r));
    return { held, listedWhileHeld, revokedWhileHeld, refused: refused ? { code: refused.code, msg: String(refused.message) } : null, legacyKept, kept, back: M.list().map((m) => m.id).join(), words: M.unreadWords ? M.unreadWords() : null, revokedAfter: revoked.slice() };
  };
  const r = await scene(require(path.join(ROOT, 'src/machine-mounts.js')), 'mounts-held');
  ok(r.held && r.listedWhileHeld === 0 && r.revokedWhileHeld.length === 0 && !!r.refused && r.refused.code === 'mounts-unread' && /^removing a mount: machine-mounts\.json in VibeSpace's data folder could not be read \((EACCES|EISDIR)\); VibeSpace reads it again every few minutes\. No mount is lost: nothing is written over it/.test(r.refused.msg) && r.legacyKept,
    'machine-mounts.json unreadable at boot: HELD — no mount listed, the orphan-token sweep revokes NOTHING, a removal is refused by name, the legacy stores are not ingested over it', r);
  ok(r.kept && r.back === 'mm-0001' && r.words === null && r.revokedAfter.length === 0, 'nothing was written over machine-mounts.json while held; read again, its mount is back and the restore that runs then keeps its token (it has its record)', r);
  const rx = await scene(RELEASE, 'mounts-release');
  ok(!rx.held && rx.revokedWhileHeld.includes('tok-0001') && !(rx.refused && rx.refused.code === 'mounts-unread') && (asRoot || (!rx.legacyKept && !rx.kept)), 'CONTROL (the release\'s load, in a copy): a failed read starts EMPTY — the sweep REVOKES the push mount\'s token, and the legacy ingest WRITES OVER machine-mounts.json (under root the stand-in is a folder no save can replace)', rx);
  // torn bytes: kept aside (a copy), the list starts empty and the one-time ingest runs — as the release did, now through the law
  {
    const d = path.join(D, 'mounts-torn'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'machine-mounts.json'), '{"mounts": [');
    const M = new (require(path.join(ROOT, 'src/machine-mounts.js')).MachineMounts)(deps(d, [], []));
    clearInterval(M._sweep);
    const asides = fs.readdirSync(d).filter((n) => /^machine-mounts\.json\.corrupt-\d+$/.test(n));
    ok(!M.unreadWords() && M.list().length === 0 && asides.length === 1 && fs.readFileSync(path.join(d, asides[0]), 'utf8') === '{"mounts": [', 'torn bytes are KEPT aside (a copy) and the mounts list starts empty — never a hold');
  }
  // «missing» right after an unreadable answer: read once more before anything is written there
  {
    const d = path.join(D, 'mounts-gone'); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'machine-mounts.json'); plant(F, body);
    const M = new (require(path.join(ROOT, 'src/machine-mounts.js')).MachineMounts)(deps(d, [], []));
    clearInterval(M._sweep);
    if (asRoot) fs.rmdirSync(F); else fs.rmSync(F, { force: true });
    await M._unreadRetry();
    const heldAfterOne = !!M.unreadWords();
    await M._unreadRetry();
    ok(heldAfterOne && !M.unreadWords() && M.list().length === 0, 'a «missing» answer right after an unreadable one is READ ONCE MORE (the hold stands); missing again, the list starts empty', { heldAfterOne });
  }
  // its read r1 (M2): the next try armed FIRST — a try that meets a read in flight arms the next, and the read that then fails leaves it
  const armM = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'machine-mounts.json'); plant(F, body);
    const M = new Mod.MachineMounts(deps(d, [], [])); clearInterval(M._sweep);
    const prf = fs.promises.readFile; let release = null, armedMeeting = false, armedAfter = false, armedAfterFail = false;
    fs.promises.readFile = function (f, ...a) { if (String(f) === F) return new Promise((res, rej) => { release = () => rej(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' })); }); return prf.call(this, f, ...a); };
    try {
      const first = M._unreadRetry();
      clearTimeout(M._unreadT); M._unreadT = null;   // the timer that fires the next try clears itself first
      await M._unreadRetry(); armedMeeting = !!M._unreadT;
      if (release) release(); await first; armedAfter = !!M._unreadT;
      clearTimeout(M._unreadT); M._unreadT = null;   // its read r2 (X5): a try whose own read fails at once arms the next too
      fs.promises.readFile = function (f, ...a) { if (String(f) === F) return Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })); return prf.call(this, f, ...a); };
      await M._unreadRetry(); armedAfterFail = !!M._unreadT;
    } finally { fs.promises.readFile = prf; }
    clearTimeout(M._unreadT); M._unreadT = null; if (!asRoot) fs.chmodSync(F, 0o644);
    return { armedMeeting, armedAfter, armedAfterFail, held: !!M.unreadWords() };
  };
  const am = await armM(require(path.join(ROOT, 'src/machine-mounts.js')), 'mounts-arm');
  ok(am.held && am.armedMeeting && am.armedAfter && am.armedAfterFail, 'its read r1 (M2) / r2 (X5): a try that meets a read in flight arms the next, so does the read that then fails, and so does a try whose own read fails at once — the tries never end while held', am);
  const ARMM = '    this._unreadRetrySoon();   // its read r1 (M2): the next try is armed FIRST (jobs.js\'s order) — a try that meets one in flight, or a read that fails, never ends the tries\n    if (this._unreadP) return;\n';
  ok(MSRC.split(ARMM).length === 2, 'control setup: the anchor of the control «the next try armed first» is in machine-mounts.js');
  const amx = await armM(MJ.load('src/machine-mounts.js', MSRC.replace(ARMM, '    if (this._unreadP) return;   /* MUTANT: the first cut\'s order */\n    this._unreadRetrySoon();\n'), 'arm-order-mounts'), 'mounts-arm-mut');
  ok(amx.held && !amx.armedMeeting, 'CONTROL (the first cut\'s order, in a copy): the try that meets a read in flight arms NOTHING', amx);
  const amy = await armM(MJ.load('src/machine-mounts.js', MSRC.replace(ARMM, '    if (this._unreadP) { this._unreadRetrySoon(); return; }   /* MUTANT: armed only on a meeting */\n'), 'arm-meeting-only-mounts'), 'mounts-arm-mut2');
  ok(amy.held && amy.armedMeeting && !amy.armedAfterFail, 'CONTROL (r2 X5 — armed only on a meeting, in a copy): a try whose own read fails arms NOTHING', amy);
  // its read r2 (X2): an OLDER try whose torn-bytes copy lands after a NEWER try lifted the hold never loads the mounts EMPTY
  const raceM = async (Mod, name) => {
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'machine-mounts.json'); plant(F, body);
    const M = new Mod.MachineMounts(deps(d, [], [])); clearInterval(M._sweep);
    const prf = fs.promises.readFile, pcf = fs.promises.copyFile; let land = null, after = null, olderErr = null;
    fs.promises.readFile = function (f, ...a) { if (String(f) === F) return Promise.resolve('{"mounts": ['); return prf.call(this, f, ...a); };
    fs.promises.copyFile = function (src, ...a) { if (String(src) === F) return new Promise((res) => { land = res; }); return pcf.call(this, src, ...a); };
    try {
      const older = M._unreadRetry().catch((e) => { olderErr = String(e && e.message); });
      await new Promise((r) => setImmediate(r));
      fs.promises.readFile = prf; unplant(F, body);
      await M._unreadRetry();
      const lifted = M.list().map((m) => m.id).join();
      if (land) land(); await older;
      after = { lifted, list: M.list().map((m) => m.id).join(), held: !!M.unreadWords(), olderErr };
    } finally { fs.promises.readFile = prf; fs.promises.copyFile = pcf; }
    clearTimeout(M._unreadT); M._unreadT = null; return after;
  };
  const raceMHeld = async (Mod, name) => {   // its read r3 (Y4): the NEWER try reads EIO — the hold stands — then the older's copy lands
    const d = path.join(D, name); fs.mkdirSync(d, { recursive: true });
    const F = path.join(d, 'machine-mounts.json'); plant(F, body);
    const M = new Mod.MachineMounts(deps(d, [], [])); clearInterval(M._sweep);
    const prf = fs.promises.readFile, pcf = fs.promises.copyFile; let land = null, out = null;
    fs.promises.readFile = function (f, ...a) { if (String(f) === F) return Promise.resolve('{"mounts": ['); return prf.call(this, f, ...a); };
    fs.promises.copyFile = function (src, ...a) { if (String(src) === F) return new Promise((res) => { land = res; }); return pcf.call(this, src, ...a); };
    try {
      const older = M._unreadRetry().catch(() => { });
      await new Promise((r) => setImmediate(r));
      fs.promises.readFile = function (f, ...a) { if (String(f) === F) return Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })); return prf.call(this, f, ...a); };
      await M._unreadRetry();
      if (land) land(); await older;
      out = { held: !!M.unreadWords(), listed: M.list().length };
    } finally { fs.promises.readFile = prf; fs.promises.copyFile = pcf; }
    clearTimeout(M._unreadT); M._unreadT = null; if (!asRoot) { try { fs.chmodSync(F, 0o644); } catch { } } return out;
  };
  const rmh = await raceMHeld(require(path.join(ROOT, 'src/machine-mounts.js')), 'mounts-race-held');
  const SEQM = '      if (!this._unread || mine !== this._unreadSeq) return;';
  const rmhx = await raceMHeld(MJ.load('src/machine-mounts.js', MSRC.replace(SEQM, '      if (!this._unread) return;   /* MUTANT: the seq half cut */'), 'race-seq-half-mounts'), 'mounts-race-held-mut');
  ok(!!rmh && rmh.held && !!rmhx && !rmhx.held, 'its read r3 (Y4): the newer try read EIO (the hold stands) and the older try\'s copy lands — the hold STANDS; CONTROL (the seq half cut, in a copy): the older try lifts it as EMPTY', { rmh, rmhx });
  const rm2 = await raceM(require(path.join(ROOT, 'src/machine-mounts.js')), 'mounts-race');
  ok(!!rm2 && rm2.lifted === 'mm-0001' && rm2.list === 'mm-0001' && !rm2.held && !rm2.olderErr, 'its read r2 (X2): an older try whose copy of torn bytes lands AFTER a newer try lifted the hold changes nothing — the mount stays loaded', rm2);
  const RACEM = '      if (!this._unread || mine !== this._unreadSeq) return;   // its read r2 (X2): a newer try read meanwhile (and may have lifted) — its answer stands\n';
  ok(MSRC.split(RACEM).length === 2, 'control setup: the anchor of the control «only the newest try lifts» is in machine-mounts.js');
  const rmx = await raceM(MJ.load('src/machine-mounts.js', MSRC.replace(RACEM, '      /* MUTANT: no re-check after the copy */\n'), 'no-race-check-mounts'), 'mounts-race-mut');
  ok(!!rmx && (rmx.list === '' || !!rmx.olderErr), 'CONTROL (no re-check after the copy, in a copy): the older try loads the mounts EMPTY over the lifted list (or throws on a hold already gone)', rmx);
  const DPM = fs.readFileSync(path.join(ROOT, 'src/server/dial-pairing.js'), 'utf8'), ERM = fs.readFileSync(path.join(ROOT, 'src/server/exit-routes.js'), 'utf8');
  ok(/async function unpairDialDevice\(deviceId\) \{\n(?:  \/\/[^\n]*\n)*  if \(machineMounts\.unreadWords && machineMounts\.unreadWords\(\)\) throw /.test(DPM) && /res\.status\(e && e\.status === 503 \? 503 : 400\)/.test(ERM),
    'WIRING (its read r1, M3): removing a dial machine while machine-mounts.json is held is refused BEFORE any side effect (its push tokens would never be revoked) — 503 with the words');
  const SV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok(SV.includes("app.get('/api/machine-mounts', (req, res) => res.json({ mounts: machineMounts.list(), ...(machineMounts.unreadWords() ? { unread: machineMounts.unreadWords() } : {}) }));"), 'WIRING: the mounts list answers WHY it is empty while held (GET /api/machine-mounts `unread`)');
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'store-read-law ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
