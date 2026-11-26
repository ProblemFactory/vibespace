#!/usr/bin/env node
// test-store-write-census-scenes — the HEAVY twin of test-store-write-census (B-7e49, lane bl-tests-e, 主开发 r2522): its legs
// that RUN the product, moved VERBATIM — the real store writer's thread, the store hold's ladders, the persistence route's scenes,
// stalls placed in each main-thread rename / fsync, mutant copies of the product. The fast file keeps every census and every pin
// over the tree's text (a census is in every lane's gate) and pins (§T) that this file holds these legs. Selected, as a heavy row,
// by the files its legs load (the store writer, the store hold, the persistence route, the desktop records, the device alerts, the
// decision journal …), and run in every whole heavy tier. In-process: no child, no browser.
//   ⑩ THE MEASURED HOLDS AFTER 2.369.412 — its legs (its one pin over the tree's text stays in the fast file)
//   ⑪ THE STORE HOLD — its driven legs (a)–(g), (i), (m) (its census (h), its (j)/(k) block and its two pins stay in the fast file)
//   ⑭ B-0248 (c) — the conversation list, the bookmarks and the custom themes off the loop, whole
// Run: node scripts/test-store-write-census-scenes.mjs
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker, verdictOf } from './lib/check.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const CHK = checker();   // B-7e49 r3655 (3): a twin takes the shared checker (scripts/lib/check.mjs), never an inline helper of its own
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof n} — the arguments are swapped`); return CHK.ok(c === true || (c !== false && verdictOf(c)), n, d); };   // the condition coerced as the shared guard does (a promise or a function is red by name)

// ── ⑩ THE MEASURED HOLDS AFTER 2.369.412 (主开发 2026-11-20 03:10Z — the owner's hub, the first hour of the new build: 23 holds of
// 1–3 s, the main thread asleep on the storage in a temp + rename): each site off the loop through the store writer, with what the
// family requires — the HOLD of a store that cannot be read (never written over), the FLUSH at the stop, and the READERS of the file
// that must see a write that has not landed yet. Stand-ins for the storage (an fs error thrown for that one file, a writer that
// records), the real modules; bytes compared, no clock.
console.log('⑩ the measured holds after 2.369.412: each site off the loop, with its hold, its flush and its readers');
{
  const { scratchDir, anchored } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const readSrc = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const roots = [];
  const failingRead = (file, code, fn) => { const rf = fs.readFileSync; fs.readFileSync = function (f, ...a) { if (String(f) === file) throw Object.assign(new Error(`${code}: a stand-in i/o error`), { code }); return rf.call(this, f, ...a); }; try { return fn(); } finally { fs.readFileSync = rf; } };
  const recordingWriter = () => { const st = { dirty: [], flushed: [] }; return { st, W: { dirty: (f, o) => { st.dirty.push({ f, o }); }, flushSync: (files) => { st.flushed.push(files); return { written: [], left: [] }; }, pending: () => false } }; };
  try {
    // (a) src/desktop-serve.js — the desktop app records (data/desktop-apps.json; 3 of the 23)
    {
      const DSRC = readSrc('src/desktop-serve.js'), DD = require(path.join(REPO, 'src/desktop-display.js'));
      const quietDs = { log() { }, warn() { }, error() { } };
      const noApps = { catalogRows: () => [], refreshCatalog: async () => { }, witnessRows: () => [] };
      const SEED = JSON.stringify({ apps: { 'da-1': { id: 'da-1', state: 'stopped', appId: 'x' }, 'da-2': { id: 'da-2', state: 'launching', appId: 'x', label: 'x', pids: {}, starts: {}, lastInputAt: 1, startedAt: 1 } } });   // da-2: a bring-up the last process died in
      const SAVE_G = "    if (held) { if (!heldSaveSaid) { heldSaveSaid = true; log.warn?.(`[desktop] a ${STORE_FILE} write was refused: ${heldWords()}`); } return false; }\n";
      const PROD_G = "const storeBytes = () => { if (held) throw";
      const HOLD_G = "    holdStore(a);   // unreadable, or bytes that are not the store: HELD (never started empty over it)\n";
      ok([SAVE_G, PROD_G, HOLD_G].every((x) => DSRC.split(x).length === 2), 'control setup: the record file\'s save guard, producer guard and hold are found once each in desktop-serve.js');
      const display0 = { ...DD, hostFacts: async () => ({ hostId: null, bins: {}, browsers: {}, office: { exec: null, path: null, program: null, confinement: null, modules: null }, at: Date.now() }) };   // no host probe (r3655 should 1: its display-server fact is left out, not written null — the product reads it only as `f.<it> && f.<it>.www`, so absent IS null; a literal naming the program made the host class derive «desktop» for a suite that runs no display)
      const install = (Mod, d, W) => Mod.install({ dataDir: d, env: () => ({ HOME: d, PATH: process.env.PATH }), display: display0, registryRows: [], log: quietDs, now: Date.now, tickMs: 3600e3, apps: noApps, writer: W, unreadRetry: { firstMs: 15, maxMs: 30 } });
      const scene = async (Mod, name, { lift = true } = {}) => {
        const d = scratchDir('ds-held-' + name); roots.push(d); const F = path.join(d, 'desktop-apps.json'); fs.writeFileSync(F, SEED);
        const { st, W } = recordingWriter();
        const installedAt = Date.now();   // the record's clock in the file is 1: any clock at or after the install is the lift's
        const ds = failingRead(F, 'EIO', () => install(Mod, d, W));
        const out = { held0: ds.held() };
        if (out.held0) { try { await ds.launch({ appId: 'x' }); out.launch = 'ran'; } catch (e) { out.launch = e && e.code; } } else out.launch = 'not asked (not held: a launch would probe the machine)';
        try { ds.reshapeStore(() => 1); out.reshape = 'ran'; } catch (e) { out.reshape = e && e.code; }
        ds.markDirty(); ds.commit();   // a tick's commit while held (the hub marks rows it owns)
        out.queuedWhileHeld = st.dirty.length;
        out.heldBytes = st.dirty.map((x) => { try { return x.o.produce(); } catch (e) { return e.code; } });
        out.bytesKept = fs.readFileSync(F, 'utf8') === SEED;
        if (lift) {
          for (let i = 0; i < 200 && ds.held(); i++) await new Promise((r) => setTimeout(r, 10));
          out.lifted = !ds.held();
          // THE LIFT GIVES WHAT THE BOOT GIVES (主开发's read wf_3c7fc92a-819): the record left in `starting` gets its verdict, and the
          // live records' idle clocks start again at the lift (nobody could reach a window while held)
          for (let i = 0; i < 300 && ds._store().apps['da-2'] && ds._store().apps['da-2'].state === 'launching'; i++) await new Promise((r) => setTimeout(r, 10));
          const d2 = ds._store().apps['da-2'] || {};
          out.adopted = d2.state; out.clockAtLift = Number(d2.lastInputAt) >= installedAt;
          out.records = out.lifted ? ds.reshapeStore((s0) => Object.keys(s0.apps).sort().join(',')) : null;
          const last = st.dirty[st.dirty.length - 1];
          out.queued = last ? { name: last.o.name, rank: last.o.rank, urgent: last.o.urgent, bytes: JSON.parse(last.o.produce()) } : null;
          out.fileAtCall = fs.readFileSync(F, 'utf8') === SEED;   // the writer's, not the call's: nothing written here
        }
        const nf = st.flushed.length;   // the reshape above flushed already: only what the STOP flushes counts
        ds.shutdown();
        out.flushed = st.flushed.slice(nf).some((fl) => Array.isArray(fl) && fl.includes(F));
        return out;
      };
      const r = await scene(require(path.join(REPO, 'src/desktop-serve.js')), 'real');
      ok(r.held0 && r.launch === 'desktop_apps_unread' && r.reshape === 'desktop_apps_unread' && r.queuedWhileHeld === 0 && r.bytesKept, '⑩a desktop-apps.json that could not be read (EIO): HELD — a launch and a migration refused BY NAME, a commit writes nothing, the bytes untouched (the release started EMPTY and wrote that over the file)', r);
      ok(r.lifted && r.adopted !== 'launching' && r.clockAtLift && r.records === 'da-1,da-2' && r.queued && r.queued.name === 'desktop-apps.write' && r.queued.rank === 0 && r.queued.urgent === true && r.queued.bytes.apps && r.queued.bytes.apps['da-1'] && r.fileAtCall && r.flushed, '⑩a …read again off the loop: the hold lifts, its records are back — the record left in «launching» gets the boot\'s verdict, the idle clocks start again at the lift; a commit hands the bytes to the STORE WRITER (rank 0, urgent — nothing written at the call), and the STOP lands what is owed', r);
      const ADOPT_A = "    adoptAll().catch((e) => log.warn?.(`[desktop] the adoption after the lift failed:";
      const STOPF_A = "    if (writer && typeof writer.flushSync === 'function') { try { const r = writer.flushSync([storeFile]);";
      ok([ADOPT_A, STOPF_A].every((x) => DSRC.split(x).length === 2), 'control setup: the lift\'s adoption and the stop\'s flush are found once each');
      const xa = await scene(mutantCopies('swc-ds-noadopt', REPO).load('src/desktop-serve.js', anchored(DSRC, ADOPT_A, "    Promise.resolve().catch((e) => log.warn?.(`[desktop] the adoption after the lift failed:", 'ds-no-lift-adoption'), 'ds-no-lift-adoption'), 'no-lift-adoption');
      ok(xa.lifted && xa.adopted === 'launching', 'CONTROL (the lift\'s adoption cut, in a copy): the record left in «launching» is never judged — no verdict, no teardown (red)', xa);
      const xf = await scene(mutantCopies('swc-ds-nostopflush', REPO).load('src/desktop-serve.js', anchored(DSRC, STOPF_A, "    if (false) { try { const r = writer.flushSync([storeFile]);", 'ds-no-stop-flush'), 'ds-no-stop-flush'), 'no-stop-flush');
      ok(xf.lifted && !xf.flushed, 'CONTROL (the stop\'s flush cut, in a copy): the stop lands nothing (red)', xf);
      // a boot migration's reshape that does NOT land: the migration throws by name (EVSNOTONDISK) and runs again at the next boot
      const RESH_A = "      if (miss) throw Object.assign(new Error(`the desktop app records' reshape is not on disk yet (${miss.why}) — tried again at the next boot`), { code: 'EVSNOTONDISK' });";
      ok(DSRC.split(RESH_A).length === 2, 'control setup: the reshape\'s not-on-disk throw is found once');
      const reshScene = async (Mod, name) => {
        const d = scratchDir('ds-resh-' + name); roots.push(d); const F = path.join(d, 'desktop-apps.json'); fs.writeFileSync(F, SEED);
        const W = { dirty() { }, pending: () => true, flushSync: (files) => ({ written: [], left: (files || []).map((f) => ({ file: f, why: 'held by the storage (a stand-in)' })) }) };
        const ds = install(Mod, d, W);
        let code = null; try { ds.reshapeStore(() => 1); } catch (e) { code = e && e.code; }
        ds.shutdown();
        return { code };
      };
      const rs = await reshScene(require(path.join(REPO, 'src/desktop-serve.js')), 'real');
      ok(rs.code === 'EVSNOTONDISK', '⑩a a boot migration\'s reshape that does not land THROWS by name (EVSNOTONDISK): the runner never records a reshape the file never got', rs);
      const rsx = await reshScene(mutantCopies('swc-ds-resh', REPO).load('src/desktop-serve.js', anchored(DSRC, RESH_A, '      /* MUTANT: an unlanded reshape returns */', 'ds-resh-no-throw'), 'ds-resh-no-throw'), 'no-throw');
      ok(rsx.code === null, 'CONTROL (the throw cut, in a copy): the unlanded reshape returns — the migration would be recorded (red)', rsx);
      // the producer ALONE keeps the held file (the save's own guard cut, in a copy): the queued write refuses at its write (EHELD)
      const p1 = await scene(mutantCopies('swc-ds-save-cut', REPO).load('src/desktop-serve.js', anchored(DSRC, SAVE_G, '    /* MUTANT: no save guard */\n', 'ds-save-cut'), 'ds-save-cut'), 'save-cut', { lift: false });
      ok(p1.queuedWhileHeld > 0 && p1.heldBytes.every((b) => b === 'EHELD'), '⑩a the record file\'s PRODUCER refuses while held too: with the save\'s guard cut, a queued write makes no bytes (EHELD) — never the empty store', p1);
      const x1 = await scene(mutantCopies('swc-ds-hold-cut', REPO).load('src/desktop-serve.js', anchored(DSRC, HOLD_G, '    /* MUTANT: the release — an unreadable file starts EMPTY */\n', 'ds-hold-cut'), 'ds-hold-cut'), 'hold-cut', { lift: false });
      ok(!x1.held0 && x1.heldBytes.some((b) => typeof b === 'string' && JSON.parse(b).apps && !Object.keys(JSON.parse(b).apps).length), 'CONTROL (the hold cut, in a copy — the release): the unreadable file starts EMPTY and its first commit hands the EMPTY store to the writer, over the file — RED', x1);
      const x2 = await scene(mutantCopies('swc-ds-guards-cut', REPO).load('src/desktop-serve.js', anchored(anchored(DSRC, SAVE_G, '    /* MUTANT: no save guard */\n', 'ds-save-cut2'), PROD_G, 'const storeBytes = () => { if (false) throw', 'ds-prod-cut'), 'ds-guards-cut'), 'guards-cut', { lift: false });
      ok(x2.held0 && x2.heldBytes.some((b) => typeof b === 'string' && !Object.keys(JSON.parse(b).apps).length), 'CONTROL (both guards cut, in a copy): a commit while held makes the EMPTY store\'s bytes for the writer — RED', x2);
      // the hub's keeper hands its writer in (the device agent hands none: it writes at the call, off the hub's loop)
    }
    // (b) src/server/device-alerts.js — the device alerts' dedup ledger (data/device-alerts.json; 1 of the 23)
    {
      const DASRC = readSrc('src/server/device-alerts.js');
      const HOLD_A = "    else if (a.state !== 'missing') holdLedger(a);   // a missing file is the first run; anything else HOLDS\n";
      const PROD_A = "  const produce = () => { if (held) throw";
      ok([HOLD_A, PROD_A].every((x) => DASRC.split(x).length === 2), 'control setup: the ledger\'s hold and its producer guard are found once each in device-alerts.js');
      const SEEN = JSON.stringify({ version: 1, seen: { 'pair:dev-old:1': 1 } });
      const scene = async (Mod, name, { lift = true } = {}) => {
        const d = scratchDir('da-held-' + name); roots.push(d); const F = path.join(d, 'device-alerts.json'); fs.writeFileSync(F, SEEN);
        const { st, W } = recordingWriter(); const filed = [];
        const todos = { add: (k, it) => { filed.push(it.text); return { id: 'u' + filed.length }; } };
        const da = failingRead(F, 'EIO', () => Mod.create({ userTodos: todos, dataDir: d, log: () => { }, writer: W, unreadRetry: { firstMs: 15, maxMs: 30 } }));
        const out = { held0: da.held ? da.held() : false };
        const r1 = da.file('pairing-minted', { machine: 'm1', deviceId: 'dev-new', generation: 1, by: 'userL', from: '10.0.0.9' });
        out.filedWhileHeld = !!(r1 && r1.filed) && filed.length === 1;
        out.queuedWhileHeld = st.dirty.length;
        out.heldBytes = st.dirty.map((x) => { try { return JSON.parse(x.o.produce()); } catch (e) { return e.code; } });
        out.bytesKept = fs.readFileSync(F, 'utf8') === SEEN;
        if (lift) {
          for (let i = 0; i < 200 && da.held(); i++) await new Promise((r) => setTimeout(r, 10));
          out.lifted = !da.held();
          const last = st.dirty[st.dirty.length - 1];
          out.written = last ? { name: last.o.name, mode: last.o.mode, keys: Object.keys(JSON.parse(last.o.produce()).seen).sort().join(',') } : null;
          out.fileAtCall = fs.readFileSync(F, 'utf8') === SEEN;
        }
        return out;
      };
      const r = await scene(require(path.join(REPO, 'src/server/device-alerts.js')), 'real');
      ok(r.held0 && r.filedWhileHeld && r.queuedWhileHeld === 0 && r.bytesKept, '⑩b device-alerts.json that could not be read (EIO): HELD — an alert is STILL FILED (a security event is never kept from the person), the ledger written over by nothing (the release read it as «first run» and wrote an EMPTY ledger over it)', r);
      ok(r.lifted && r.written && r.written.name === 'device-alerts.write' && r.written.mode === 0o600 && r.written.keys === 'pair:dev-new:1,pair:dev-old:1' && r.fileAtCall, '⑩b …read again off the loop: the file\'s keys and the one filed meanwhile MERGED and handed to the store writer (mode 0600 — nothing written at the call)', r);
      const x = await scene(mutantCopies('swc-da-hold-cut', REPO).load('src/server/device-alerts.js', anchored(DASRC, HOLD_A, '    /* MUTANT: the release — a failed read is the first run */\n', 'da-hold-cut'), 'da-hold-cut'), 'hold-cut', { lift: false });
      ok(!x.held0 && x.heldBytes.some((b) => b && b.seen && !b.seen['pair:dev-old:1']), 'CONTROL (the hold cut, in a copy — the release): the unreadable ledger starts EMPTY and the first filing hands that ledger to the writer, over the file — every alert it told is told again (red)', x);
    }
    // (c) src/server/decision-engine.js — the month's journal tail (Settings › Spending's readout; 1 of the 23): A READ THAT CAN WAIT
    // ON STORAGE IS NOT MADE ON THE MAIN THREAD — after the engine's start (whose day-counter rebuild keeps its read at the call: once,
    // before any call can spend — B-a85f), a status opens NO byte of the journal on the loop; the month arrives off the loop.
    // ITS RED CONTROL (主开发 r4841, lane bl-loop-a): the release's synchronous tail reader `journalTail` is `journalRead` since line 933
    // (B-f276: it tells «not there» from «unread» and indexes the lines) — the mutant is the tip's own code made wrong in that one way:
    // the status asks the month from the tip's synchronous reader in its own turn, and goes red because the journal is opened on the loop
    {
      const DESRC = readSrc('src/server/decision-engine.js');
      const OFF_A = "      monthP = journalTailOffLoop()\n";
      ok(DESRC.split(OFF_A).length === 2, 'control setup: the month\'s off-loop read is found once in decision-engine.js');
      const scene = async (Mod, name) => {
        const d = scratchDir('de-tail-' + name); roots.push(d);
        const J = path.join(d, 'decision-journal.jsonl'); fs.writeFileSync(J, JSON.stringify({ at: Date.now(), usd: 0.25, outcome: 'ok', use: 'x' }) + '\n');
        const { W } = recordingWriter();
        let clock = Date.now();
        const eng = Mod.create({ dataDir: d, log: { log() { }, warn() { } }, writer: W, now: () => clock });
        await new Promise((r) => setTimeout(r, 30)); clock += 61000;   // past the start's own read and its 60 s memo: the next status refreshes
        const os0 = fs.openSync; let syncOpens = 0;
        fs.openSync = function (f, ...a) { if (String(f) === J) syncOpens++; return os0.call(this, f, ...a); };
        let month = null;
        try { for (let i = 0; i < 200 && !(month = eng.status().month); i++) await new Promise((r) => setTimeout(r, 10)); }
        finally { fs.openSync = os0; }
        return { syncOpens, usd: month ? month.usd : null };
      };
      const r = await scene(require(path.join(REPO, 'src/server/decision-engine.js')), 'real');
      ok(r.syncOpens === 0 && r.usd === 0.25, '⑩c the month so far: a status opens NO byte of the journal on the loop — the figure (0.25) is the off-loop reads\' (the start\'s own, then the refresh after the 60 s memo)', r);
      const x = await scene(mutantCopies('swc-de-tail', REPO).load('src/server/decision-engine.js', anchored(DESRC, OFF_A, "      monthP = Promise.resolve(journalRead().rows || null)   // MUTANT: the release's road by the tip's own synchronous reader — the tail read at the call\n", 'de-sync-tail'), 'de-sync-tail'), 'sync-tail');
      ok(x.syncOpens >= 1, 'CONTROL (the release\'s read, in a copy): a status reads the journal\'s 2 MB tail ON the loop (red)', x);
      // a journal that could not be READ is NO FIGURE (null), never a $0 month (主开发's read wf_3c7fc92a-819): the journal's path a folder
      const ERR_A = "    } catch (e) { if (e && e.code === 'ENOENT') return []; return null; } finally { if (fh) await fh.close().catch(() => { }); }";
      ok(DESRC.split(ERR_A).length === 2, 'control setup: the off-loop read\'s error answer is found once');
      const errScene = async (Mod, name) => {
        const d = scratchDir('de-err-' + name); roots.push(d); fs.mkdirSync(path.join(d, 'decision-journal.jsonl'));
        const { W } = recordingWriter();
        const eng = Mod.create({ dataDir: d, log: { log() { }, warn() { } }, writer: W });
        await new Promise((r) => setTimeout(r, 200));
        return { month: eng.status().month };
      };
      const er = await errScene(require(path.join(REPO, 'src/server/decision-engine.js')), 'real');
      ok(er.month === null, '⑩c an UNREADABLE journal (EISDIR) answers NO figure (null), never a $0 month', er);
      const erx = await errScene(mutantCopies('swc-de-err', REPO).load('src/server/decision-engine.js', anchored(DESRC, ERR_A, "    } catch { return []; } finally { if (fh) await fh.close().catch(() => { }); }   /* MUTANT: the release — any error is an empty journal */", 'de-err-empty'), 'de-err-empty'), 'err-empty');
      ok(erx.month && erx.month.usd === 0, 'CONTROL (the release\'s answer, in a copy): the unreadable journal shows a $0 month (red)', erx);
    }
  } finally { for (const d of roots) fs.rmSync(d, { recursive: true, force: true }); }
}

// ── ⑪ THE STORE HOLD (lane lg-store-writes, B-225b — 主开发's shape of 2026-11-20 04:37Z, R1–R13): src/store-hold.js, the helper the
// persistence stores read and write through, its own legs ONCE. A held store has NO VALUE and its one write refuses by name; the
// kind (unreadable / damaged / not-allowed); the ladder (silent rungs, then said); the lift; `missing` writes nothing and creates
// EXCLUSIVELY (a file that appeared is adopted, never written over); every temp name carries the pid. Stand-ins for the storage.
console.log('⑪ the store hold: a store that could not be read has no value, and nothing is written over it');
{
  // (B-0248 (a)+(b): the persistence route's stores are the store writer's — these scenes read their files right after a door, as the
  // release's write at the call allowed: each route is handed the writer's contract AT THE CALL, a failure owed — scratch.mjs landingWriter)
  const { scratchDir, anchored, landingWriter } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const HSRC = fs.readFileSync(path.join(REPO, 'src/store-hold.js'), 'utf8');
  const HMOD = require(path.join(REPO, 'src/store-hold.js'));
  const roots = [];
  const failing = (file, code, fn) => { const rf = fs.readFileSync; fs.readFileSync = function (f, ...a) { if (String(f) === file) throw Object.assign(new Error(`${code}: a stand-in`), { code }); return rf.call(this, f, ...a); }; try { return fn(); } finally { fs.readFileSync = rf; } };
  const SEED = JSON.stringify({ v: 1, kept: 'the person\'s' });
  const valid = (j) => !!j && typeof j === 'object' && j.v === 1;
  const tried = (fn) => { try { fn(); return null; } catch (e) { return { code: e.code, status: e.status, held: e.held || null }; } };
  try {
    // (a) a read that FAILED (EIO): held, kind unreadable — no value; the read answers the refusal alone; the one write refuses
    const scene = (Mod, name, code, bytes = SEED) => {
      const d = scratchDir('hold-' + name); roots.push(d); const F = path.join(d, 'store.json'); fs.writeFileSync(F, bytes);
      const delays = [], saids = [];
      const h = Mod.create({ file: F, valid, log: { warn() { } }, schedule: (fn, ms) => { delays.push({ fn, ms }); return 0; }, onSaid: (x) => saids.push(x) });
      const r = code ? failing(F, code, () => h.readAtStart()) : h.readAtStart();
      const ans = tried(() => h.answer('a read'));
      const wr = tried(() => h.write({ v: 1, kept: 'EMPTY' }));
      return { F, h, r, held: h.held(), ans, wr, bytesKept: fs.readFileSync(F, 'utf8') === bytes, delays, saids };
    };
    const a = scene(HMOD, 'eio', 'EIO');
    ok(a.r === 'held' && a.held && a.held.kind === 'unreadable' && a.held.rung === 'silent' && a.ans && a.ans.code === 'store_unread' && a.ans.status === 503 && a.ans.held.kind === 'unreadable' && a.wr && a.wr.code === 'store_unread' && a.bytesKept, '⑪ a read that FAILED (EIO): HELD, kind unreadable, NO value — a read answers the refusal alone (503 store_unread with the file, kind and code), the one write refuses, the bytes untouched', a.held);
    const nb = scene(HMOD, 'eacces', 'EACCES'), dm = scene(HMOD, 'damaged', null, '{"v":1,"torn');
    ok(nb.held && nb.held.kind === 'not-allowed' && dm.held && dm.held.kind === 'damaged' && dm.bytesKept, '⑪ the kind: a permission is not-allowed, bytes read whole that are not the store are damaged (and kept as they are)', { nb: nb.held, dm: dm.held });
    // (b) THE LADDER: quick silent reads again (about 15 s), then said once; the hold lifts when the file reads
    const SIL = HMOD.SILENT_RUNGS_MS;
    ok(SIL.reduce((x, y) => x + y, 0) >= 10000 && SIL.reduce((x, y) => x + y, 0) <= 20000 && a.delays.length === 1 && a.delays[0].ms === SIL[0], '⑪ the ladder starts with the SILENT rungs (about 15 s in all), one read armed at a time', { SIL, first: a.delays[0] && a.delays[0].ms });
    {
      const d = scratchDir('hold-ladder'); roots.push(d); const F = path.join(d, 'store.json'); fs.writeFileSync(F, '{"torn');
      const delays = [], saids = [], lifts = [];
      const h = HMOD.create({ file: F, valid, log: { warn() { } }, schedule: (fn, ms) => { delays.push(ms); return 0; }, onSaid: (x) => saids.push(x.rung), onLift: (v) => lifts.push(v) });
      h.readAtStart();
      for (let i = 0; i < SIL.length; i++) await h.readAgain();
      const saidAfterSilent = saids.slice();
      fs.writeFileSync(F, SEED); const lifted = await h.readAgain();
      ok(JSON.stringify(saidAfterSilent) === '["said"]' && delays.length > SIL.length && delays[SIL.length] >= 30000 && lifted === true && !h.held() && h.answer().kept === 'the person\'s' && lifts.length === 1, '⑪ past the silent rungs the hold is SAID once (then 30 s doubling); a read again that answers lifts it — the value is the file\'s, the lift\'s hook runs once', { saidAfterSilent, delays, lifted });
    }
    // (c) MISSING writes nothing; the first real change CREATES the file exclusively; a file that APPEARED is adopted, never written over
    {
      const d = scratchDir('hold-missing'); roots.push(d); const F = path.join(d, 'store.json');
      const h = HMOD.create({ file: F, valid, log: { warn() { } }, schedule: () => 0 });
      const r = h.readAtStart(); const nothing = !fs.existsSync(F);
      fs.writeFileSync(F, SEED);   // a late mount: the real file arrives after the start read «missing»
      const ap = tried(() => h.write({ v: 1, kept: 'a first-run default' }));
      ok(r === 'missing' && nothing && ap && ap.code === 'store_appeared' && fs.readFileSync(F, 'utf8') === SEED && h.answer().kept === 'the person\'s', '⑪ «missing» writes NOTHING at the read; a real file that appeared later is READ and ADOPTED — the change refused by name, never a rename over it', ap);
      const d2 = scratchDir('hold-create'); roots.push(d2); const F2 = path.join(d2, 'store.json');
      const h2 = HMOD.create({ file: F2, valid, log: { warn() { } }, schedule: () => 0 }); h2.readAtStart();
      const wf = fs.writeFileSync, op = fs.openSync; const temps = [];
      fs.writeFileSync = function (f, ...x) { temps.push(String(f)); return wf.call(this, f, ...x); };
      fs.openSync = function (f, fl, ...x) { if (fl === 'w') temps.push(String(f)); return op.call(this, f, fl, ...x); };   // r5185: the door OPENS its temp (one descriptor, synced) — its name counted at the open
      try { h2.write({ v: 1, kept: 'born' }); } finally { fs.writeFileSync = wf; fs.openSync = op; }
      ok(JSON.parse(fs.readFileSync(F2, 'utf8')).kept === 'born' && temps.length === 1 && temps[0].includes(`.${process.pid}.tmp`), '⑪ the first real change creates the file (exclusive create), through a temp name that carries the PID (R10)', temps);
    }
    // REDs (anchored, in copies)
    const HOLD_A = "    held = { kind: kindOf(a), code: a.code || null, why: a.why || null, since: now(), rung: 'silent' };\n    tries = 0; arm();\n    return 'held';";
    const EXCL_A = "      try { fs.linkSync(tmp, file); linked = true; }";
    ok([HOLD_A, EXCL_A].every((x) => HSRC.split(x).length === 2), 'control setup: the hold and the exclusive create are found once each in src/store-hold.js');
    const xh = scene(mutantCopies('swc-hold-cut', REPO).load('src/store-hold.js', anchored(HSRC, HOLD_A, "    value = undefined; missing = false;   /* MUTANT: the release — a failed read starts EMPTY and is written over */\n    return 'data';", 'hold-cut'), 'hold-cut'), 'eio-red', 'EIO');
    ok(!xh.held && !xh.wr && !xh.bytesKept, 'CONTROL (the hold cut, in a copy — the release): the failed read starts EMPTY and the one write saves the defaults OVER the file (red)', { held: xh.held, wr: xh.wr });
    {
      const XM = mutantCopies('swc-excl-cut', REPO).load('src/store-hold.js', anchored(HSRC, EXCL_A, "      try { fs.renameSync(tmp, file); linked = true; }   /* MUTANT: a rename over whatever is there */", 'excl-cut'), 'excl-cut');
      const d = scratchDir('hold-missing-red'); roots.push(d); const F = path.join(d, 'store.json');
      const h = XM.create({ file: F, valid, log: { warn() { } }, schedule: () => 0 }); h.readAtStart();
      fs.writeFileSync(F, SEED);
      tried(() => h.write({ v: 1, kept: 'a first-run default' }));
      ok(fs.readFileSync(F, 'utf8') !== SEED, 'CONTROL (the exclusive create cut, in a copy): the first-run default is renamed OVER the real file that arrived late (red)');
    }
    // (c2) A FILESYSTEM WITHOUT HARD LINKS (a link refused by name — EPERM): the first change still creates the file (the rename after
    // a last look) and a file found there is still ADOPTED, never written over. RED (anchored, in a copy): the last look cut.
    {
      const noLink = (fn) => { const lk = fs.linkSync; fs.linkSync = function () { throw Object.assign(new Error('EPERM: operation not permitted, link (a stand-in)'), { code: 'EPERM' }); }; try { return fn(); } finally { fs.linkSync = lk; } };
      const nl = (Mod, tag, late) => {
        const d = scratchDir('hold-nolink-' + tag); roots.push(d); const F = path.join(d, 'store.json');
        const h = Mod.create({ file: F, valid, log: { warn() { } }, schedule: () => 0 }); h.readAtStart();
        if (late) fs.writeFileSync(F, SEED);
        const r = noLink(() => tried(() => h.write({ v: 1, kept: 'born' })));
        return { F, r, bytes: fs.existsSync(F) ? fs.readFileSync(F, 'utf8') : null, temps: fs.readdirSync(d).filter((x) => x.endsWith('.tmp')) };
      };
      const born = nl(HMOD, 'born', false), late = nl(HMOD, 'late', true);
      ok(!born.r && born.bytes && JSON.parse(born.bytes).kept === 'born' && !born.temps.length && late.r && late.r.code === 'store_appeared' && late.bytes === SEED && !late.temps.length, '⑪ a filesystem WITHOUT HARD LINKS (link refused, EPERM): the first change creates the file by the rename after a last look; a file found there is ADOPTED all the same — no temp left', { born: born.r, late: late.r });
      const LOOK_A = "        if (fs.existsSync(file)) throw appeared();\n";
      ok(HSRC.split(LOOK_A).length === 2, 'control setup: the last look before the rename is found once in src/store-hold.js');
      const xl = nl(mutantCopies('swc-look-cut', REPO).load('src/store-hold.js', anchored(HSRC, LOOK_A, "        /* MUTANT: no last look */\n", 'look-cut'), 'look-cut'), 'late-red', true);
      ok(!xl.r && xl.bytes !== SEED, 'CONTROL (the last look cut, in a copy): on a filesystem without links the first-run default is renamed OVER the file that arrived late (red)', xl.r);
    }
    // (d) THE CONVERSATION LIST ON THE HOLD (cut 2 — src/routes/persistence.js, data/user-state.json; R1–R3, R6): a list the start
    // could not read answers every door by NAME (503 store_unread — never a 200 with the defaults), nothing is written over it, and
    // isArchived is UNKNOWN (null — the deliveries' wake and the automation verbs refuse on it by name); the read again LIFTS it: the
    // list served, every page told (a user-state-updated frame). A list NOT THERE writes nothing at the read; its first change creates
    // it. RED (anchored, in a copy): the hold's answer cut — the release's read: the defaults served under the list's name.
    {
      const PREL = 'src/routes/persistence.js', PSRC = fs.readFileSync(path.join(REPO, PREL), 'utf8');
      const CID = 'aaaaaaaa-0000-4000-8000-0000000000d1', KEY = 'claude:' + CID;
      const LIST = JSON.stringify({ archivedSessions: [KEY], customNames: { [KEY]: 'the person\'s name' } });
      const fresh = () => { for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; return require(path.join(REPO, PREL)); };
      const listScene = (P, tag, { bytes = LIST, code = 'EIO' } = {}) => {
        const d = scratchDir('hold-list-' + tag); roots.push(d); const F = path.join(d, 'user-state.json');
        if (bytes != null) fs.writeFileSync(F, bytes);
        const sent = [];
        const boot = () => P.setup({ writer: landingWriter(), dataDir: d, wss: { clients: new Set([{ readyState: 1, send: (t) => sent.push(String(t)) }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
        if (code) failing(F, code, boot); else boot();
        const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
        const call = (method, p, body) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; } }; handler(method, p)({ body, query: {}, params: {}, headers: {} }, res, (e) => { status = 500; o = { error: String(e) }; }); return { status, body: o }; };
        return { F, d, sent, call, P };
      };
      const L = listScene(fresh(), 'eio');
      const g = L.call('get', '/api/user-state'), po = L.call('post', '/api/user-state', { archivedSessions: [], customNames: {} });
      const pa = L.call('patch', '/api/user-state', { customNames: {} }), ba = L.call('patch', '/api/user-state/batches', { batches: [{ batch: 'pgholdlist01:1', age: 0, ops: [] }] });
      const arch = L.P.router.isArchived(KEY), ar = L.P.router.archiveSession('claude:bbbbbbbb-0000-4000-8000-0000000000d2');
      ok(g.status === 503 && g.body && g.body.code === 'store_unread' && g.body.held && g.body.held.kind === 'unreadable' && g.body.held.file === 'user-state.json'
        && [po, pa].every((x) => x.status === 503 && x.body && x.body.code === 'store_unread') && ba.status === 503 && ba.body && ba.body.code === 'store_unread' && arch === null && ar && ar.ok === false && ar.code === 'store_unread'
        && fs.readFileSync(L.F, 'utf8') === LIST, '⑪ (d) a conversation list the start could NOT read: every door answers 503 store_unread BY NAME (the read, the whole doors, the ops door), isArchived is UNKNOWN (null), the archive verb refuses by name — and the file is untouched', { get: g.status, post: po.status, patch: pa.status, batches: ba.status, arch, ar });
      const lifted = await (async () => { for (let i = 0; i < 100; i++) { const r = L.call('get', '/api/user-state'); if (r.status === 200) return r; await new Promise((res) => setTimeout(res, 50)); } return null; })();
      ok(!!lifted && Array.isArray(lifted.body.archivedSessions) && lifted.body.archivedSessions.includes(KEY) && L.P.router.isArchived(KEY) === true && L.sent.some((t) => t.startsWith('{"type":"user-state-updated"') && t.includes(CID)) && fs.readFileSync(L.F, 'utf8').includes(CID),
        '⑪ (d) the read again (the first silent rung, ≈1 s) LIFTS it: the person\'s list is served, an archived conversation answers archived, every page is told (user-state-updated)', { lifted: lifted && lifted.status, frames: L.sent.length });
      const N = listScene(fresh(), 'missing', { bytes: null, code: null });
      const ng = N.call('get', '/api/user-state'), nothing = !fs.existsSync(N.F);
      const nw = N.call('patch', '/api/user-state', { customNames: { [KEY]: 'a first name' } });
      ok(ng.status === 200 && nothing && nw.status === 200 && JSON.parse(fs.readFileSync(N.F, 'utf8')).customNames[KEY] === 'a first name', '⑪ (d) a list NOT THERE: the defaults are served and NOTHING is written at the read; the first real change creates the file', { get: ng.status, nothing, write: nw.status });
      const ANS_A = "    const parsed = userStateHold.answer();\n";
      ok(PSRC.split(ANS_A).length === 2, 'control setup: the list\'s read through the hold\'s answer is found once in src/routes/persistence.js');
      const X = listScene(mutantCopies('swc-list-cut', REPO).load(PREL, anchored(PSRC, ANS_A, "    let parsed; try { parsed = userStateHold.answer(); } catch { parsed = undefined; }   /* MUTANT: the release — a list it could not read is served as the defaults */\n", 'list-cut'), 'list-cut'), 'eio-red');
      const xg = X.call('get', '/api/user-state');
      ok(xg.status === 200 && Array.isArray(xg.body.archivedSessions) && xg.body.archivedSessions.length === 0 && X.P.router.isArchived(KEY) === false, 'CONTROL (the hold\'s answer cut, in a copy — the release): the list it could not read is served as the DEFAULTS (an empty sidebar) and the archived conversation answers «not archived» — a delivery would wake it (red)', { get: xg.status, n: xg.body && xg.body.archivedSessions && xg.body.archivedSessions.length });
    }
    // (e) THE DESKTOPS, THE BOOKMARKS, THE CUSTOM THEMES ON THE HOLD (cut 3 — R1, R2, R10, R12): a store the START could not read
    // answers its doors 503 store_unread BY NAME and nothing is written over it (the release served the EMPTY layout, the four
    // default bookmarks, «no themes» — and the next save wrote them over the person's); the bookmarks are read ONCE (a cache); a
    // rollback point owed lands BEFORE the layouts.json write that replaces its state; every temp name carries the pid.
    // REDs (anchored, in copies): the layouts' answer cut (the empty layout served) · the flush's drain cut (layouts.json first).
    {
      const PREL = 'src/routes/persistence.js', PSRC = fs.readFileSync(path.join(REPO, PREL), 'utf8');
      const freshP = () => { for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; return require(path.join(REPO, PREL)); };
      const LAY = { current: null, autoSave: null, saved: {}, customGrids: [{ rows: 2, cols: 3 }], desktops: { d1: { autoSave: { windows: [{ winId: 'w1' }, { winId: 'w2' }] } } }, desktopMeta: [{ id: 'd1', name: 'the person\'s desktop' }] };
      const BMK = [{ label: 'the person\'s folder', path: '/srv/kept' }], THM = { mine: { css: { '--bg-window': '#101018' } } };
      const sceneE = (P, tag, held) => {
        const d = scratchDir('hold-e-' + tag); roots.push(d);
        const files = { layouts: path.join(d, 'layouts.json'), bookmarks: path.join(d, 'bookmarks.json'), themes: path.join(d, 'custom-themes.json') };
        fs.writeFileSync(files.layouts, JSON.stringify(LAY)); fs.writeFileSync(files.bookmarks, JSON.stringify(BMK)); fs.writeFileSync(files.themes, JSON.stringify(THM));
        const bytes = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, fs.readFileSync(f, 'utf8')]));
        P.setup({ writer: landingWriter(), dataDir: d, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
        const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
        const call = (method, p, body, params = {}) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; } }; handler(method, p)({ body, query: {}, params, headers: {} }, res, (e) => { status = 500; o = { error: String(e) }; }); return { status, body: o }; };
        const first = (method, p, body, params) => (held ? Object.values(files).reduceRight((fn, f) => () => failing(f, 'EIO', fn), () => call(method, p, body, params))() : call(method, p, body, params));
        return { d, files, bytes, call, first, P };
      };
      const E = sceneE(freshP(), 'eio', true);
      const lg = E.first('get', '/api/layouts'), bg = E.first('get', '/api/bookmarks'), tg = E.first('get', '/api/custom-themes');
      const la = E.call('post', '/api/layouts-autosave', { windows: [] }), lc = E.call('post', '/api/custom-grids', { rows: 1, cols: 1 }), bp = E.call('post', '/api/bookmarks', []), tp = E.call('post', '/api/custom-themes', { name: 'other', css: { '--bg-window': '#000000' } });
      let wl = null; try { E.P.router.writeLayouts({ current: null, autoSave: null, saved: {}, customGrids: [] }); } catch (e) { wl = e.code; }
      E.P.router.flushLayouts();
      const kept = Object.keys(E.files).every((k) => fs.readFileSync(E.files[k], 'utf8') === E.bytes[k]);
      ok([lg, bg, tg, la, lc, bp, tp].every((x) => x.status === 503 && x.body && x.body.code === 'store_unread') && lg.body.held.file === 'layouts.json' && bg.body.held.file === 'bookmarks.json' && tg.body.held.file === 'custom-themes.json' && wl === 'store_unread' && E.P.router.layoutsCached() === null && kept,
        '⑪ (e) the desktops, the bookmarks and the custom themes the start could NOT read: every door answers 503 store_unread BY NAME (the reads, the saves, a preset write), the flush writes nothing — the three files untouched', { lg: lg.status, bg: bg.status, tg: tg.status, la: la.status, lc: lc.status, bp: bp.status, tp: tp.status, wl, kept });
      // R12 — the bookmarks READ ONCE (a cache): a second GET reads no file
      const B = sceneE(freshP(), 'once', false);
      const b1 = B.call('get', '/api/bookmarks');
      let bookReads = 0; const rf = fs.readFileSync; fs.readFileSync = function (f, ...a) { if (String(f) === B.files.bookmarks) bookReads++; return rf.call(this, f, ...a); };
      let b2; try { b2 = B.call('get', '/api/bookmarks'); } finally { fs.readFileSync = rf; }
      ok(b1.status === 200 && b1.body[0].path === '/srv/kept' && b2.status === 200 && bookReads === 0, '⑪ (e) the bookmarks are read ONCE at the start and kept — a later GET reads no file (a read that fails mid-run can never serve the defaults)', { bookReads });
      // R10 — the rollback point owed lands BEFORE the layouts.json write that replaces its state; every temp carries the pid
      const order = (P2, tag) => {
        const S = sceneE(P2, tag, false);
        S.call('get', '/api/layouts');
        const next = JSON.parse(JSON.stringify(LAY)); next.desktops.d1.autoSave.windows = [{ winId: 'w1' }];   // a SHAPE change (a window gone)
        const renames = [], temps = [], rn = fs.renameSync, wf = fs.writeFileSync, op = fs.openSync;
        fs.renameSync = function (a, b) { renames.push(path.basename(String(b))); return rn.call(this, a, b); };
        fs.writeFileSync = function (f, ...x) { if (String(f).endsWith('.tmp')) temps.push(path.basename(String(f))); return wf.call(this, f, ...x); };
        fs.openSync = function (f, ...x) { if (String(f).endsWith('.tmp')) temps.push(path.basename(String(f))); return op.call(this, f, ...x); };   // r5185: the store hold's direct door OPENS its temp (one descriptor, synced)
        try { S.P.router.writeLayouts(next); S.P.router.flushLayouts(); } finally { fs.renameSync = rn; fs.writeFileSync = wf; fs.openSync = op; }
        return { renames, temps };
      };
      const o = order(freshP(), 'order');
      const iPoint = o.renames.findIndex((n) => /^layout-.*\.json$/.test(n) && !n.endsWith('.meta.json')), iLay = o.renames.indexOf('layouts.json');
      ok(iPoint >= 0 && iLay > iPoint && o.temps.length >= 3 && o.temps.every((t) => t.includes(`.${process.pid}.tmp`)), '⑪ (e) R10: the rollback point owed lands BEFORE the layouts.json write that replaces its state (in the flush, never «usually»), and every temp name carries the PID', o);
      // the ws layout doors (src/ws-handler.js — layout-sync and the four desktop doors) read through ONE guard: held ⇒ `layout-held`
      // REDs
      const ANS_L = "    const doc = layoutsHold.answer();", DRAIN_A = "    const upTo = handPointsOwed();   // (the points' callbacks are the writer's answer road: at the hub's stop they run inside its exit flush)\n";
      ok([ANS_L, DRAIN_A].every((x) => PSRC.split(x).length === 2), 'control setup: the layouts\' answer and the flush\'s drain are found once each in src/routes/persistence.js');
      const XE = sceneE(mutantCopies('swc-lay-cut', REPO).load(PREL, anchored(PSRC, ANS_L, "    let doc; try { doc = layoutsHold.answer(); } catch { doc = undefined; }   /* MUTANT: the release — the desktops it could not read are the EMPTY layout */", 'lay-cut'), 'lay-cut'), 'eio-red', true);
      const xl = XE.first('get', '/api/layouts');
      ok(xl.status === 200 && xl.body && Array.isArray(xl.body.customGrids) && xl.body.customGrids.length === 0 && !xl.body.desktops, 'CONTROL (the layouts\' answer cut, in a copy — the release): the desktops it could not read are served as the EMPTY layout (a page makes «Desktop 1» over them) (red)', xl.body);
      const xo = order(mutantCopies('swc-drain-cut', REPO).load(PREL, anchored(PSRC, DRAIN_A, "    const upTo = -1;   // MUTANT: no wait for the points (B-0248 (b)'s R10 by landing) — handed later by the drain\n", 'drain-cut'), 'drain-cut'), 'order-red');
      const xp = xo.renames.findIndex((n) => /^layout-.*\.json$/.test(n) && !n.endsWith('.meta.json'));
      ok(xp === -1 || xp > xo.renames.indexOf('layouts.json'), 'CONTROL (the flush\'s drain cut, in a copy): layouts.json is written while its rollback point is still owed (red)', xo.renames);
    }
    // (f) THE SETTINGS ON THE HOLD (cut 4 — R1, R2, R3, R11): a settings.json the START could not read answers its doors 503
    // store_unread BY NAME and nothing is written over it (the release read {} — the Settings page's next save wrote its defaults
    // over the person's, the spending caps included); the hub's readers get every row on its DEFAULT, a FROZEN object that is not the
    // cache, the hold's facts under Symbol.for('vibespace.settings-held'); the spend guard answers NOT NOW ('settings-unread', nothing
    // used up); the judge and the text-model client refuse by name; THE LIFT IS A SETTINGS CHANGE (its lift hooks, `settings-updated`,
    // every waiting turn judged again — noteLimitsWritten with no «before»). RED (anchored, in a copy): the hold's answer cut — the
    // release: the defaults handed to the spend guard as the settings, so an unattended turn runs on the DEFAULT caps.
    {
      const PREL = 'src/routes/persistence.js', PSRC = fs.readFileSync(path.join(REPO, PREL), 'utf8');
      const freshP = () => { for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; return require(path.join(REPO, PREL)); };
      const SYM = Symbol.for('vibespace.settings-held');
      const SET = { 'spend.unattendedPerIdentityHour': 2, 'appearance.theme': 'the person\'s' };
      const sceneF = (P, tag) => {
        const d = scratchDir('hold-f-' + tag); roots.push(d); const F = path.join(d, 'settings.json'); fs.writeFileSync(F, JSON.stringify(SET));
        const sent = [];
        P.setup({ writer: landingWriter(), dataDir: d, wss: { clients: new Set([{ readyState: 1, send: (t) => sent.push(String(t)) }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
        failing(F, 'EIO', () => P.router.readSettings());   // the START read fails
        const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
        const call = (method, p, body) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; } }; handler(method, p)({ body, query: {}, params: {}, headers: {} }, res, (e) => { status = 500; o = { error: String(e) }; }); return { status, body: o }; };
        return { d, F, sent, call, P };
      };
      const SG = require(path.join(REPO, 'src/server/spend-guard.js'));
      const guardOver = (P, d) => (fs.mkdirSync(path.join(d, 'g'), { recursive: true }), SG.create({ dataDir: path.join(d, 'g'), serverSetting: (k) => { try { return P.router.readSettings()[k]; } catch { return undefined; } }, log: () => { } }));
      const who = { key: 'k', name: 'acct-1' };
      const H = sceneF(freshP(), 'eio');
      const view = H.P.router.readSettings();
      const g = H.call('get', '/api/settings'), po = H.call('post', '/api/settings', { 'appearance.theme': 'a default' }), pa = H.call('patch', '/api/settings', { 'appearance.theme': 'a default' });
      let ps = null; try { H.P.router.patchSettings({ 'appearance.theme': 'a default' }); } catch (e) { ps = e.code; }
      const gv = guardOver(H.P, H.d).authorize({ reason: 'auto-resume', identity: who, cid: 'conv-f', now: Date.now() });
      ok([g, po, pa].every((x) => x.status === 503 && x.body && x.body.code === 'store_unread') && g.body.held.file === 'settings.json' && ps === 'store_unread'
        && Object.isFrozen(view) && JSON.stringify(Object.keys(view).sort()) === JSON.stringify(Object.keys(require(path.join(REPO, 'src/settings-held-strict.js')).strictValues()).sort()) && view['permissions.bypassAnswersAsks'] === false && view['pool.avoidOverageMembers'] === true && view[SYM] && view[SYM].kind === 'unreadable' && view['spend.unattendedPerIdentityHour'] === undefined
        && gv && gv.ok === false && gv.why === 'settings-unread' && !gv.hold && fs.readFileSync(H.F, 'utf8') === JSON.stringify(SET),
        '⑪ (f) settings the start could NOT read: GET / POST / PATCH answer 503 store_unread BY NAME, the internal patch refuses, the hub reads every row on its default — the rows that guard money, a safety ask, a vendor call or a person\'s file on their STRICT side (a FROZEN object, the hold under its symbol), the spend guard answers NOT NOW (settings-unread, no hold taken) — the file untouched', { get: g.status, post: po.status, patch: pa.status, ps, why: gv && gv.why });
      // THE LIFT IS A SETTINGS CHANGE: its lift hooks run, every page is told, every waiting turn is judged again (no «before»)
      let hooked = 0; H.P.router.onSettingsLift(() => { hooked++; });
      const rejudged = []; const off = SG.onLimitsWritten((prev, next) => rejudged.push([prev, next]));
      const lifted = await (async () => { for (let i = 0; i < 100; i++) { const r = H.call('get', '/api/settings'); if (r.status === 200) return r; await new Promise((res) => setTimeout(res, 50)); } return null; })();
      off();
      const gv2 = guardOver(H.P, H.d).authorize({ reason: 'auto-resume', identity: who, cid: 'conv-f', now: Date.now() });
      ok(!!lifted && lifted.body['appearance.theme'] === 'the person\'s' && hooked === 1 && H.sent.some((t) => t.startsWith('{"type":"settings-updated"')) && rejudged.some(([prev]) => prev === null) && gv2 && gv2.why !== 'settings-unread',
        '⑪ (f) the read again LIFTS it as a settings CHANGE: the person\'s settings served, the lift hooks run (the setting holds\' owed returns), every page told, every waiting turn judged again against the REAL limits', { lifted: lifted && lifted.status, hooked, rejudged: rejudged.length, why2: gv2 && gv2.why });
      // THE SETTING HOLDS (src/server/setting-holds.js) while the settings are held: a hold is KEPT at the start (never judged against
      // the defaults — the release ended every hold as «changed while the hub was down»), its return is OWED (no retry used, no notice),
      // a press is refused by name; AT THE LIFT what the start could not judge is judged and every owed return lands (atLift)
      {
        const SHM = require(path.join(REPO, 'src/server/setting-holds.js'));
        const ROW = 'spend.unattendedPerInstanceDay', T0 = Date.now();
        const dir = scratchDir('hold-f-holds'); roots.push(dir);
        fs.writeFileSync(path.join(dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds: { [ROW]: { key: ROW, value: 1600, before: 800, untilAt: T0 + 3600e3, at: T0 } } }));
        let heldNow = { kind: 'unreadable' }; const st = { [ROW]: 1600 }, owner = [], writes = [];
        const HS = SHM.create({ dataDir: dir, readSettings: () => (heldNow ? Object.freeze({}) : st), patchSettings: (p) => { if (heldNow) throw Object.assign(new Error('held'), { code: 'store_unread' }); writes.push(p); Object.assign(st, p); },
          userTodos: { add: (k, x) => { owner.push({ k, ...x }); return { id: 'n1' }; } }, log: () => { }, now: () => T0, writer: { dirty: () => { }, durable: async () => true }, setTimer: () => ({}), clearTimer: () => { }, settingsHeld: () => heldNow });
        await HS.start();
        const keptAtStart = HS.list().some((h) => h.key === ROW);
        const rh = await HS.returnHold(ROW, 'moment'), pr = await HS.take({ key: ROW, value: 2000, untilRel: 3600e3, shown: 1600 });
        heldNow = null;
        const landed = HS.atLift();
        ok(keptAtStart && rh && rh.code === 'settings-unread' && rh.owed === true && pr && pr.code === 'store_unread' && owner.length === 0 && landed === 1 && writes.length === 1 && writes[0][ROW] === 800,
          '⑪ (f) the setting holds while the settings are held: a hold is KEPT at the start (never judged against the defaults), its return is OWED (no retry, no notice), a press refused by name — at the LIFT the owed return lands (back to «before»)', { keptAtStart, rh, pr: pr && pr.code, owner: owner.length, landed, writes });
      }
      // (a should, taken) a start that read the settings «missing», then a migration wrote the file and the hub read it again
      // (reloadSettings): the store is THERE now — the next change REPLACES it, never an exclusive create that meets the very file it
      // read (409 store_appeared). RED: the re-read handed in as a plain set (the hold still «missing»), in a copy
      {
        const relScene = (P, tag) => {
          const d = scratchDir('hold-f-rel-' + tag); roots.push(d); const F = path.join(d, 'settings.json'); const sent = [];
          P.setup({ writer: landingWriter(), dataDir: d, wss: { clients: new Set([{ readyState: 1, send: (t) => sent.push(String(t)) }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
          P.router.readSettings();   // NOT THERE at the start
          fs.writeFileSync(F, JSON.stringify(SET));   // a migration writes it
          P.router.reloadSettings();
          let r; try { r = P.router.patchSettings({ 'appearance.theme': 'a later change' }); } catch (e) { r = { code: e.code || String(e) }; }
          return { code: r && r.code ? r.code : null, theme: JSON.parse(fs.readFileSync(F, 'utf8'))['appearance.theme'] };
        };
        const RL = relScene(freshP(), 'real');
        ok(RL.code === null && RL.theme === 'a later change', '⑪ (f) settings «missing» at the start, written by a migration and read again: the next change REPLACES the file (the store is there now — never refused as «appeared» over the file it read)', RL);
        const REL_A = "_settingsCache = v; _settingsRead = true; try { settingsHold.adoptRead(v); }";
        const RLX = relScene(mutantCopies('swc-reload-set', REPO).load(PREL, anchored(PSRC, REL_A, "_settingsCache = v; _settingsRead = true; try { settingsHold.set(v); }", 'reload-set'), 'reload-set'), 'red');
        ok(RLX.code === 'store_appeared', 'CONTROL (the re-read handed in as a plain set, in a copy): the hold stays «missing», so the next change is an exclusive create that meets the file it read — refused 409 store_appeared (red)', RLX);
      }
      // (cure 3) THE SPEND GUARD'S NOTICE while the settings are held: NONE in the hold's silent rungs (a read that answers on its next try
      // is no news — the page's strip waits the same), ONE past them, and the LIFT resolves it: the item closed, its stamp cleared. While
      // held no waiting frame is judged on the default caps (every one held, «*»). RED: the silent-rung wait cut, in a copy
      {
        const GSREL = 'src/server/spend-guard.js', GSSRC = fs.readFileSync(path.join(REPO, GSREL), 'utf8');
        const noticeScene = (M, tag) => {
          const items = []; let heldNow = { kind: 'unreadable', code: 'EIO', rung: 'silent' };
          const UT = { add: (k, x) => { const id = 'n' + (items.length + 1); items.push({ id, key: k, status: 'open', ...x }); return { id }; }, idsWhere: (f) => items.filter(f).map((i) => i.id), setStatus: (id, st) => { const it = items.find((x) => x.id === id); if (it) it.status = st; } };
          const dir = scratchDir('hold-f-notice-' + tag); roots.push(dir);
          const G = M.create({ dataDir: dir, serverSetting: (k) => (k === Symbol.for('vibespace.settings-held') ? heldNow : undefined), getUserTodos: () => UT, log: () => { } });
          const ask = () => G.authorize({ reason: 'auto-resume', identity: who, cid: 'conv-n', now: Date.now() });
          const a1 = ask(); const silent = items.length, overCap = G.waitingOverCap();
          heldNow = { ...heldNow, rung: 'said' }; const a2 = ask();
          const said = items.filter((i) => i.status === 'open' && i.itemKey === M.SETTINGS_ITEM).length;
          heldNow = null; M.noteLimitsWritten(null, null);
          return { why: [a1.why, a2.why], silent, said, open: items.filter((i) => i.status === 'open').length, items: items.length, overCap };
        };
        const N = noticeScene(SG, 'real');
        ok(N.why.every((w) => w === 'settings-unread') && N.silent === 0 && N.said === 1 && N.open === 0 && N.items === 1 && JSON.stringify(N.overCap) === '["*"]',
          '⑪ (f) the spend guard\'s notice of held settings: NONE while the hold is in its silent rungs (the turn still refused NOT NOW), ONE past them, and the LIFT resolves it (closed — never a stale «could not be read» after the settings read); no waiting frame is judged on the default caps (all held)', N);
        const SIL_A = " && !(v.why === 'settings-unread' && settingsSilent())) {";
        const XN = noticeScene(mutantCopies('swc-spend-silent', REPO).load(GSREL, anchored(GSSRC, SIL_A, ') {', 'spend-silent'), 'spend-silent'), 'red');
        ok(XN.silent === 1, 'CONTROL (the silent-rung wait cut, in a copy): the notice is filed at the FIRST refusal, inside the silent rungs — a read that answers a second later has already said «could not be read» (red)', XN);
      }
      // RED
      const VIEW_A = "    const h = settingsHold.held();\n    if (h) return heldSettingsView(h);\n    const v = settingsHold.answer();\n";
      ok(PSRC.split(VIEW_A).length === 2, 'control setup: the settings\' held view and the hold\'s answer are found once in src/routes/persistence.js');
      const X = sceneF(mutantCopies('swc-settings-cut', REPO).load(PREL, anchored(PSRC, VIEW_A, "    let v; try { v = settingsHold.answer(); } catch { v = undefined; }   /* MUTANT: the release — settings it could not read are {} */\n", 'settings-cut'), 'settings-cut'), 'eio-red');
      const xv = guardOver(X.P, X.d).authorize({ reason: 'auto-resume', identity: who, cid: 'conv-f', now: Date.now() });
      ok(xv && xv.why !== 'settings-unread', 'CONTROL (the hold\'s answer cut, in a copy — the release): the settings it could not read are handed to the spend guard as {} — the unattended turn is judged on the DEFAULT caps, never «not now» (red)', xv && { ok: xv.ok, why: xv.why });
    }
    // (g) THE DOORS THAT SPAN STORES + THE DAMAGED DOOR (cut 5 — R5, R8): the config export asks every named section's hold FIRST and
    // refuses WHOLE by name; its info says a held section «could not be read» (never a count); the import refuses WHOLE for a held
    // section that may answer later, and for a DAMAGED one is the person's whole replace (the bytes set aside under a dated name, the
    // section the store's first write); a bearer never replaces a damaged store; a damaged store may start EMPTY by the person's door.
    // RED (anchored, in a copy): the import's first ask cut — a section of the import lands while another is held (partly imported).
    {
      const PREL = 'src/routes/persistence.js', PSRC = fs.readFileSync(path.join(REPO, PREL), 'utf8');
      const freshP = () => { for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; return require(path.join(REPO, PREL)); };
      const sceneG = (P, tag, files, { onSettingsWrite = () => { } } = {}) => {
        const d = scratchDir('hold-g-' + tag); roots.push(d);
        for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(d, n), b);
        P.setup({ writer: landingWriter(), dataDir: d, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite });
        const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
        const call = async (method, p, body, { params = {}, headers = {} } = {}) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; }, set() { return res; }, setHeader() { } }; await handler(method, p)({ body, query: {}, params, headers }, res, (e) => { status = 500; o = { error: String(e) }; }); return { status, body: o }; };
        return { d, call, P, f: (n) => path.join(d, n) };
      };
      const SET = JSON.stringify({ 'appearance.theme': 'the person\'s' }), LAY = JSON.stringify({ current: null, autoSave: null, saved: {}, customGrids: [{ rows: 2, cols: 2 }] });
      const PAGE = { 'sec-fetch-site': 'same-origin' };   // the owner's page (a browser's own fetch)
      const IMP = (sections) => ({ file: { app: 'vibespace-config', version: 1, sections }, sections: Object.keys(sections), includeSensitive: [] });
      // a store that could not be READ (EIO at the start): the export and the import refuse WHOLE; the info says «could not be read»
      const G = sceneG(freshP(), 'eio', { 'settings.json': SET, 'layouts.json': LAY });
      failing(G.f('layouts.json'), 'EIO', () => { try { G.P.router.readLayouts(); } catch { } });
      const info = await G.call('get', '/api/config/export-info'), ex = await G.call('post', '/api/config/export', { sections: ['settings', 'layouts'] });
      const im = await G.call('post', '/api/config/import', IMP({ settings: { 'appearance.theme': 'an imported one' }, layouts: { current: null, autoSave: null, saved: {}, customGrids: [] } }));
      ok(info.status === 200 && info.body.sections.layouts.unread === true && info.body.sections.layouts.held.file === 'layouts.json' && typeof info.body.sections.settings.count === 'number'
        && ex.status === 503 && ex.body.code === 'store_unread' && ex.body.held[0].file === 'layouts.json' && im.status === 503 && im.body.code === 'store_unread'
        && fs.readFileSync(G.f('settings.json'), 'utf8') === SET && fs.readFileSync(G.f('layouts.json'), 'utf8') === LAY,
        '⑪ (g) a store the start could not READ: the export and the import refuse WHOLE by name (no section of the import lands — the settings untouched too), the export\'s info says the section could not be read', { info: info.body && info.body.sections.layouts, ex: ex.status, im: im.status });
      // a DAMAGED store: the import is the person's whole replace — set aside under a dated name, then the section lands; a bearer is refused
      const DMG = '{"customNames": {"claude:x": "torn';
      const D2 = sceneG(freshP(), 'dmg', { 'user-state.json': DMG });
      const bearer = await D2.call('post', '/api/config/import', IMP({ userState: { customNames: { 'claude:y': 'an imported name' } } }), { headers: { authorization: 'Bearer vsst_aaaa' } });
      const keptAfterBearer = fs.readFileSync(D2.f('user-state.json'), 'utf8') === DMG;
      // (cure 2: the tree's ONE verdict for a write from the owner's page — a header-less script is no person either)
      const script = await D2.call('post', '/api/config/import', IMP({ userState: { customNames: { 'claude:y': 'a script\'s name' } } }));
      const keptAfterScript = fs.readFileSync(D2.f('user-state.json'), 'utf8') === DMG;
      const person = await D2.call('post', '/api/config/import', IMP({ userState: { customNames: { 'claude:y': 'an imported name' } } }), { headers: PAGE });
      const aside = fs.readdirSync(D2.d).filter((n) => n.startsWith('user-state.json.damaged-'));
      ok(bearer.status === 403 && bearer.body.code === 'store_person_only' && keptAfterBearer && script.status === 403 && script.body.code === 'store_person_only' && script.body.why === 'no-browser' && keptAfterScript && person.status === 200 && Array.isArray(person.body.setAside) && person.body.setAside[0] === 'user-state.json'
        && aside.length === 1 && fs.readFileSync(path.join(D2.d, aside[0]), 'utf8') === DMG && JSON.parse(fs.readFileSync(D2.f('user-state.json'), 'utf8')).customNames['claude:y'] === 'an imported name',
        '⑪ (g) a DAMAGED store: the import is the person\'s whole replace FROM THE OWNER\'S PAGE — its bytes set aside under a dated name (kept whole), the section lands as the first write; a bearer AND a header-less script are refused by name (the tree\'s one verdict, src/write-origin.js) and nothing moves', { script: script.status, bearer: bearer.status, person: person.status, aside });
      {   // CONTROL (cure 2): the damaged door back on «no agent's sign-in» alone (the old line, in a copy) — a header-less script sets the
          // person's damaged bytes aside and replaces the store (red)
        const WHO_A = "    const why = require('../write-origin.js').ownerPageWhy(req);\n    if (why) {";
        const WHO_OLD = "    const why = require('../write-origin.js').pressBearer(req.headers) ? 'bearer' : null;\n    if (why) {";
        const XW = sceneG(mutantCopies('swc-damaged-who', REPO).load(PREL, anchored(PSRC, WHO_A, WHO_OLD, 'damaged-who'), 'damaged-who'), 'dmg-red', { 'user-state.json': DMG });
        const xs = await XW.call('post', '/api/config/import', IMP({ userState: { customNames: { 'claude:y': 'a script\'s name' } } }));
        ok(xs.status === 200 && fs.readFileSync(XW.f('user-state.json'), 'utf8') !== DMG, 'CONTROL (the damaged door asks only «no bearer», in a copy): a header-less script sets the person\'s damaged bytes aside and replaces the store (red)', { status: xs.status });
      }
      {   // cure 4: an import that REPLACES damaged settings is their LIFT — the lift hooks (the setting holds' owed returns) run once,
          // judged against what was imported; RED: the lift cut (in a copy) — the owed returns wait for a lift that never comes.
          // (主开发 r552, item 4) the settings WRITE hooks run ONCE: the import's write ran them (every stored spawn row pushed to the
          // running conversations once); the lift does not run them again over an empty «before». RED: the lift's afterWrite cut (in a
          // copy) — the write hooks run twice, the second time against no «before»
        const SDMG = '{"appearance.theme": "torn';
        const liftScene = async (P, tag) => {
          const befores = [];
          const S = sceneG(P, tag, { 'settings.json': SDMG }, { onSettingsWrite: (next, prev) => { befores.push(Object.keys(prev || {}).length); } }); let hooks = 0; S.P.router.onSettingsLift(() => { hooks++; });
          const r = await S.call('post', '/api/config/import', IMP({ settings: { 'appearance.theme': 'an imported one' } }), { headers: PAGE });
          const g = await S.call('get', '/api/settings');
          return { r, hooks, writes: befores.length, befores, theme: g.body && g.body['appearance.theme'], aside: fs.readdirSync(S.d).filter((n) => n.startsWith('settings.json.damaged-')).length };
        };
        const L = await liftScene(freshP(), 'dmg-settings');
        ok(L.r.status === 200 && JSON.stringify(L.r.body.setAside) === '["settings.json"]' && L.aside === 1 && L.hooks === 1 && L.theme === 'an imported one',
          '⑪ (g) an import that REPLACES damaged settings is their LIFT: the bytes set aside, the import lands, and the lift hooks run ONCE (the setting holds\' owed returns judged against what was imported, the waiting spend judged again)', L);
        ok(L.writes === 1, '⑪ (g) (主开发 r552) after that import the settings WRITE hooks ran ONCE (by the write) — the lift does not run them a second time over an empty «before» (every stored spawn row pushed to the running conversations once)', L);
        const LIFT_A = "    if (setAsideSaid.includes('settings.json')) settingsAgain('a person\\'s import replaced the damaged settings', { afterWrite: true });\n";
        const XL = await liftScene(mutantCopies('swc-import-lift', REPO).load(PREL, anchored(PSRC, LIFT_A, '', 'import-lift'), 'import-lift'), 'dmg-settings-red');
        ok(XL.r.status === 200 && XL.hooks === 0, 'CONTROL (the import\'s lift cut, in a copy): the damaged settings are replaced and NO lift hook runs — the owed returns wait for a lift that never comes (red)', XL);
        const XW2 = await liftScene(mutantCopies('swc-import-twice', REPO).load(PREL, anchored(PSRC, LIFT_A, LIFT_A.replace(", { afterWrite: true });", ");"), 'import-twice'), 'import-twice'), 'dmg-settings-twice');
        ok(XW2.r.status === 200 && XW2.hooks === 1 && XW2.writes === 2 && XW2.befores[1] === 0, 'CONTROL (the lift\'s afterWrite cut, in a copy): the write hooks run TWICE — the second time against an empty «before» (red)', XW2);
      }
      {   // an import that STOPS after it set a damaged store aside NAMES the set-aside: the bytes under a dated name, kept whole (the store's
          // first write made to fail here — an EIO stand-in on its create)
        const S = sceneG(freshP(), 'dmg-stop', { 'user-state.json': DMG });
        const lk = fs.linkSync; fs.linkSync = function (a, b, ...r) { if (String(b) === S.f('user-state.json')) throw Object.assign(new Error('EIO: a stand-in'), { code: 'EIO' }); return lk.call(this, a, b, ...r); };
        let st; try { st = await S.call('post', '/api/config/import', IMP({ userState: { customNames: { 'claude:y': 'an imported name' } } }), { headers: PAGE }); } finally { fs.linkSync = lk; }
        const aside = fs.readdirSync(S.d).filter((n) => n.startsWith('user-state.json.damaged-'));
        ok(st.status === 500 && JSON.stringify(st.body && st.body.setAside) === '["user-state.json"]' && /set aside under a dated name/.test(st.body.error) && aside.length === 1 && fs.readFileSync(path.join(S.d, aside[0]), 'utf8') === DMG,
          '⑪ (g) an import that STOPS after it set a damaged store aside says so: the answer names the set-aside (kept whole under a dated name) — never a bare failure that leaves the person looking for their file', { status: st.status, body: st.body });
      }
      // the person's EMPTY store for a damaged one; an unreadable one is not «damaged» (409)
      const E2 = sceneG(freshP(), 'empty', { 'bookmarks.json': '[{"label": "torn' });
      const em = await E2.call('post', '/api/stores/:file/empty', {}, { params: { file: 'bookmarks.json' }, headers: PAGE }), bg = await E2.call('get', '/api/bookmarks');
      const E3 = sceneG(freshP(), 'empty-eio', { 'bookmarks.json': '[]' });
      const ne = await (async () => { let r; const rf = fs.readFileSync; fs.readFileSync = function (f, ...a) { if (String(f) === E3.f('bookmarks.json')) throw Object.assign(new Error('EIO: a stand-in'), { code: 'EIO' }); return rf.call(this, f, ...a); }; try { r = await E3.call('post', '/api/stores/:file/empty', {}, { params: { file: 'bookmarks.json' } }); } finally { fs.readFileSync = rf; } return r; })();
      ok(em.status === 200 && em.body.empty === true && fs.readdirSync(E2.d).some((n) => n.startsWith('bookmarks.json.damaged-')) && bg.status === 200 && Array.isArray(bg.body) && bg.body.length === 4 && ne.status === 409 && ne.body.code === 'store_not_damaged' && fs.readFileSync(E3.f('bookmarks.json'), 'utf8') === '[]',
        '⑪ (g) the person\'s EMPTY store for a damaged one: set aside, then the defaults (nothing written until a change); a store that could not be READ is not damaged — refused 409, nothing moved', { em: em.status, bg: bg.status, ne: ne.status });
      const ASK_A = "      if (later.length) return res.status(503).json({ error: `the import was refused: ${later.map((h) => h.file).join(', ')} could not be read — nothing was imported`, code: 'store_unread', held: later });\n";
      ok(PSRC.split(ASK_A).length === 2, 'control setup: the import\'s first ask of every section\'s hold is found once in src/routes/persistence.js');
      const XG = sceneG(mutantCopies('swc-import-ask-cut', REPO).load(PREL, anchored(PSRC, ASK_A, "      /* MUTANT: no first ask */\n", 'import-ask-cut'), 'import-ask-cut'), 'eio-red', { 'settings.json': SET, 'layouts.json': LAY });
      failing(XG.f('layouts.json'), 'EIO', () => { try { XG.P.router.readLayouts(); } catch { } });
      try { await XG.call('post', '/api/config/import', IMP({ settings: { 'appearance.theme': 'an imported one' }, layouts: { current: null, autoSave: null, saved: {}, customGrids: [] } })); } catch { /* the held layouts' own refusal, thrown after the settings landed */ }
      ok(fs.readFileSync(XG.f('settings.json'), 'utf8') !== SET, 'CONTROL (the import\'s first ask cut, in a copy): the settings section lands while the desktops are held — a PART of the import, the rest refused (red)');
    }
    // (i) THE DATA FOLDER ITSELF UNREADABLE AT THE FIRST READ (round wyzvr7567's MUST 1): the folder check before a store's start read
    // throws (a stale or dead data mount: existsSync answers false on any stat error, then mkdirSync throws) — that IS the start read's
    // failure: the store is HELD (never «read and empty»), its bytes are kept, the spend guard's input says held; and a hold whose start
    // read never ran refuses every read, write and set BY NAME. REDS (anchored, in a copy): the flag set BEFORE the folder check — the
    // hold never starts, the spend guard is handed NO hold (it judges unattended turns on the DEFAULT caps: open); the hold's own
    // «not read» refusal cut — a store never read answers an empty value.
    {
      const PREL = 'src/routes/persistence.js', PSRC = fs.readFileSync(path.join(REPO, PREL), 'utf8');
      const freshP = () => { for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; return require(path.join(REPO, PREL)); };
      const SETI = JSON.stringify({ 'spend.unattendedPerIdentityHour': 2 });
      const staleScene = async (P, tag) => {
        const d = scratchDir('hold-i-' + tag); roots.push(d); const F = path.join(d, 'settings.json'); fs.writeFileSync(F, SETI);
        P.setup({ writer: landingWriter(), dataDir: d, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
        const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
        const call = async (method, p, body) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; }, set() { return res; }, setHeader() { } }; try { await handler(method, p)({ body, query: {}, params: {}, headers: {} }, res, (e) => { status = 500; o = { error: String(e && e.message || e) }; }); } catch (e) { status = 500; o = { error: String(e && e.message || e) }; } return { status, code: o && o.code, held: o && o.held };
        };
        const ex = fs.existsSync, mk = fs.mkdirSync;
        fs.existsSync = function (q, ...a) { if (String(q) === d) return false; return ex.call(this, q, ...a); };
        fs.mkdirSync = function (q, ...a) { if (String(q) === d) throw Object.assign(new Error('ESTALE: a stand-in stale data mount'), { code: 'ESTALE' }); return mk.call(this, q, ...a); };
        let g, w;
        try { g = await call('get', '/api/settings'); w = await call('post', '/api/settings', { 'appearance.theme': 'a save while held' }); }
        finally { fs.existsSync = ex; fs.mkdirSync = mk; }
        const h = P.router.settingsHeld();
        return { g, w, guard: h ? { kind: h.kind, code: h.code } : null, bytesKept: fs.readFileSync(F, 'utf8') === SETI };
      };
      const ri = await staleScene(freshP(), 'real');
      ok(ri.g.status === 503 && ri.g.code === 'store_unread' && ri.w.status === 503 && ri.w.code === 'store_unread' && !!ri.guard && ri.guard.kind === 'unreadable' && ri.guard.code === 'ESTALE' && ri.bytesKept,
        '⑪ (i) THE DATA FOLDER UNREADABLE AT THE FIRST READ (a stale mount: the folder check throws): the settings are HELD (unreadable, ESTALE) — the route answers 503 by name, a save is refused, the file\'s bytes are kept, and the spend guard\'s input says held (it refuses unattended turns)', ri);
      const FLAG_A = "    if (!_settingsRead) { let pre; try { ensureDir(dataDir); } catch (e) { pre = { error: e }; } settingsHold.readAtStart(pre); _settingsRead = true; }";
      const RX = mutantCopies('swc-flag-first', REPO).load(PREL, anchored(PSRC, FLAG_A, "    if (!_settingsRead) { _settingsRead = true; ensureDir(dataDir); settingsHold.readAtStart(); }", 'flag-first'), 'flag-first');   // stale-pins: kept — the replacement IS the old line (the control rebuilds it)
      const rx = await staleScene(RX, 'red');
      ok(rx.guard === null, 'CONTROL (the flag set before the folder check, in a copy — the unit as read): the start read never runs, the hold never starts — the spend guard is handed NO hold and judges unattended turns on the DEFAULT caps (red)', rx);
      // the hold helper's own refusal before its start read
      const notRead = (HM, tag) => {
        const d = scratchDir('hold-i2-' + tag); roots.push(d); const F = path.join(d, 'store.json'); fs.writeFileSync(F, '{"v":1}');
        const h = HM.create({ file: F, valid: (v) => !!v && typeof v === 'object', log: { warn() { } }, schedule: () => 0 });
        const tr = (fn) => { try { return { value: fn() }; } catch (e) { return { code: e.code, kind: e.held && e.held.kind, why: e.held && e.held.code }; } };
        return { answer: tr(() => h.answer('a read')), write: tr(() => h.write({ v: 2 })), set: tr(() => h.set({ v: 3 })), bytesKept: fs.readFileSync(F, 'utf8') === '{"v":1}' };
      };
      const SHREL = 'src/store-hold.js', SHSRC = fs.readFileSync(path.join(REPO, SHREL), 'utf8');
      const nr = notRead(require(path.join(REPO, SHREL)), 'real');
      ok(nr.answer.code === 'store_unread' && nr.answer.why === 'not read' && nr.write.code === 'store_unread' && nr.set.code === 'store_unread' && nr.bytesKept,
        '⑪ (i) a hold whose START read never ran refuses every read, write and set BY NAME (store_unread, «not read») — never an empty value under the store\'s name', nr);
      const NR_A = "  function answer(what = null) { if (!started) throw unreadError(file, NOT_READ(), what); if (held) throw unreadError(file, held, what); return value; }";
      const nrx = notRead(mutantCopies('swc-not-read', REPO).load(SHREL, anchored(SHSRC, NR_A, "  function answer(what = null) { if (held) throw unreadError(file, held, what); return value; }", 'not-read-cut'), 'not-read-cut'), 'red');   // stale-pins: kept — the replacement IS the old line (the control rebuilds it)
      ok(nrx.answer.code === undefined && nrx.answer.value === undefined, 'CONTROL (the «not read» refusal cut from answer, in a copy): a store never read answers an EMPTY value under its name (red)', nrx);
    }
    // (m) B-225b's SECOND HALF (主开发 r662): a layouts write the storage REFUSES is OWED — kept (memory is the truth), retried on the
    // hold's own ladder (src/store-hold.js flush), never dropped or swallowed; SAID once past the silent rungs on EVERY page
    // (`store-unsaved`), at once for a person's press; LIFTED when a write lands (`store-saved`); the two restore doors answer a refused
    // write BY NAME (503 store_unsaved) and their broadcast carries it (the restoring page never says «restored»); a stop's last flush
    // that fails is the journal's line by the store's name. The failure is PLACED (fs.writeFileSync refused for the store's temp name),
    // never a real mount. REDs (in a copy): the release's swallow — the restore answers success, nothing is said, nothing kept owed.
    {
      const SH = require(path.join(REPO, 'src/store-hold.js'));
      const refusedWrite = () => Object.assign(new Error('EIO: a stand-in refused write'), { code: 'EIO' });
      // THE HOLD ALONE: a stand-in scheduler (each rung fired by hand), a write that fails N times then lands
      const ladderScene = (fails, { press = false } = {}) => {
        const d = scratchDir('owed-' + fails + (press ? '-press' : '')); roots.push(d);
        const F = path.join(d, 'store.json'); fs.writeFileSync(F, JSON.stringify({ v: 0 }));
        const timers = [], said = [], saved = [];
        const H = SH.create({ file: F, schedule: (fn, ms) => { timers.push({ fn, ms }); return {}; }, onUnsaved: (u) => said.push(u), onSaved: (u) => saved.push(u), log: { warn() { } } });
        H.readAtStart();
        let left = fails, v = 1;
        const produce = () => { if (left > 0) { left--; throw refusedWrite(); } return [{ v }]; };
        const first = H.flush(produce, { press });
        const saidAtOnce = said.length;
        const delays = [];
        while (timers.length && delays.length < 12) { const t = timers.shift(); delays.push(t.ms); v++; t.fn(); }
        return { first, saidAtOnce, said, saved, delays, owed: H.owed(), disk: JSON.parse(fs.readFileSync(F, 'utf8')), v };
      };
      const cured = ladderScene(2), long = ladderScene(6), press = ladderScene(1, { press: true });
      ok(cured.first === false && cured.said.length === 0 && cured.saved.length === 0 && cured.owed === null && cured.disk.v === cured.v,
        '⑪ (m) a refused write the next rungs cure is OWED and retried (1 s, 2 s) and lands — NOTHING said, nothing lifted; the bytes that land are memory\'s latest', cured);
      ok(long.first === false && long.said.length === 1 && long.said[0].rung === 'said' && long.said[0].code === 'EIO' && long.said[0].file === 'store.json' && long.saved.length === 1 && long.owed === null && long.disk.v === long.v && JSON.stringify(long.delays.slice(0, 4)) === '[1000,2000,4000,8000]' && long.delays[4] >= 30000,
        '⑪ (m) a write the storage KEEPS refusing is owed on the hold\'s own ladder (the silent rungs, then 30 s up), SAID ONCE past the silent rungs (store, code), LIFTED once when a write lands — never dropped', { said: long.said, saved: long.saved, delays: long.delays });
      ok(press.first === false && press.saidAtOnce === 1 && press.saved.length === 1 && press.owed === null, '⑪ (m) a PRESS\'s refused write is said AT ONCE (a person\'s act never waits the silent rungs) and lifted when it lands', press);
      { const d = scratchDir('owed-held'); roots.push(d); const F = path.join(d, 'store.json'); fs.writeFileSync(F, '{"torn');
        const H = SH.create({ file: F, valid: (v) => !!v && typeof v === 'object', schedule: () => ({}), log: { warn() { } } }); H.readAtStart();
        let code = null; try { H.flush(() => [{ v: 1 }]); } catch (e) { code = e.code; }
        ok(code === 'store_unread' && H.owed() === null, '⑪ (m) a refusal BY NAME is no storage failure: a held store\'s flush throws store_unread and owes nothing', { code }); }
      // ROUND wg2vawd0o's FOLLOW (主开发 r721): nothing to write is no landing; a refusal BY NAME inside a flush ends the owed chain the
      // same as on the ladder's road; the page-facing facts carry no `why` (the raw error names a path under the data folder)
      {
        const SHREL = 'src/store-hold.js', SHSRC = fs.readFileSync(path.join(REPO, SHREL), 'utf8');
        const nothingScene = (M, tag) => {
          const d = scratchDir('owed-nothing-' + tag); roots.push(d); const F = path.join(d, 'store.json'); fs.writeFileSync(F, JSON.stringify({ v: 0 }));
          const timers = [], said = [], saved = [], warns = [];
          const H = M.create({ file: F, schedule: (fn) => { timers.push(fn); return {}; }, onUnsaved: (u) => said.push(u), onSaved: (u) => saved.push(u), log: { warn: (l) => warns.push(String(l)) } });
          H.readAtStart();
          let first = true;
          H.flush(() => { if (first) { first = false; throw refusedWrite(); } return null; }, { press: true });   // said at once, then nothing to write
          for (let i = 0; i < 12 && timers.length; i++) timers.shift()();   // bounded: a copy whose chain never ends re-arms
          return { said: said.length, saved: saved.length, owed: H.owed(), ends: warns.some((l) => /the owed write ends — nothing to write/.test(l)), again: warns.some((l) => /is written again/.test(l)), facts: said[0] || null };
        };
        const nt = nothingScene(SH, 'real');
        ok(nt.said === 1 && nt.saved === 0 && nt.owed === null && nt.ends && !nt.again && nt.facts && !('why' in nt.facts),
          '⑪ (m) nothing to write is NO landing: an owed write whose producer has nothing left ends quietly — no «written again», no lift said over nothing written; the said facts carry no `why`', nt);
        const XN = nothingScene(mutantCopies('swc-owed-nothing', REPO).load(SHREL, anchored(SHSRC, "if (!made) return { landed: false, nothing: true }; write(made[0], made[1]); return { landed: true };", "if (made) write(made[0], made[1]); return { landed: true };", 'owed-nothing'), 'owed-nothing'), 'red');   // stale-pins: kept (the OLD line, rebuilt for the red copy)
        ok(XN.saved === 1 && XN.again, 'CONTROL (nothing to write counted as landed, in a copy): «written again» and the lift said over a write that never happened — red', XN);
        const namedScene = (M, tag) => {
          const d = scratchDir('owed-named-' + tag); roots.push(d); const F = path.join(d, 'store.json');   // NOT THERE at the start: its first write is an exclusive create
          const timers = [];
          const H = M.create({ file: F, schedule: (fn) => { timers.push(fn); return {}; }, log: { warn() { } } });
          H.readAtStart();
          H.flush(() => { throw refusedWrite(); });   // owed
          fs.writeFileSync(F, JSON.stringify({ v: 'appeared' }));   // a file that appeared (a late mount)
          let code = null; try { H.flush(() => [{ v: 'memory' }]); } catch (e) { code = e.code; }
          const owedAfter = H.owed();
          for (let i = 0; i < 12 && timers.length; i++) timers.shift()();   // a stale rung, if one was left armed (bounded: a copy re-arms)
          return { code, owedAfter, disk: JSON.parse(fs.readFileSync(F, 'utf8')).v };
        };
        const nm = namedScene(SH, 'real');
        ok(nm.code === 'store_appeared' && nm.owedAfter === null && nm.disk === 'appeared', '⑪ (m) a refusal BY NAME inside a flush (a file appeared) ENDS the owed chain — its timer and its producer go, the same as on the ladder\'s road; the appeared file is kept', nm);
        const XNM = namedScene(mutantCopies('swc-owed-named', REPO).load(SHREL, anchored(SHSRC, "if (named(r.error)) { endOwed((r.error && r.error.message) || String(r.error)); throw r.error; }", "if (named(r.error)) throw r.error;", 'owed-named'), 'owed-named'), 'red');   // stale-pins: kept (the OLD line, rebuilt for the red copy)
        ok(XNM.code === 'store_appeared' && XNM.owedAfter !== null, 'CONTROL (the flush\'s named road without the clearing, in a copy): the owed chain stays armed over a store that was adopted — red', { owed: XNM.owedAfter });
        const PV = fs.readFileSync(path.join(REPO, 'src/routes/persistence.js'), 'utf8');
        ok((PV.match(/if \(!landed && !layoutsHold\.owed\(\)\) return res\.status\(409\)\.json\(restoreDropped\(\)\);/g) || []).length === 2 && /const restoreDropped = \(\) => \(\{ error: 'the restore was not made: layouts\.json appeared since VibeSpace started[^']*', code: 'store_appeared' \}\);/.test(PV),
          '⑪ (m) both restore doors: a write that ended BY NAME (a file appeared — the restore dropped, the file adopted) answers the store\'s own appeared refusal and broadcasts nothing — never «kept in memory and written again» (pins)');
      }
      // THE DESKTOPS (src/routes/persistence.js): the autosave's flush, a press's, the stop's, and the two restore doors
      const PREL = 'src/routes/persistence.js', PSRC = fs.readFileSync(path.join(REPO, PREL), 'utf8');
      const freshP = () => { for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; return require(path.join(REPO, PREL)); };
      // (B-0248 (a): the flush answers by callback — at once on the writer's contract at the call)
      const flushed = (R, o = {}) => { let got; R.flushLayouts(o, (ok) => { got = ok; }); return got; };
      // (r5185: the store hold's direct door OPENS its temp — one descriptor, synced — so the refusal is placed at the open too)
      const refusing = async (fn) => { const wf = fs.writeFileSync, op = fs.openSync; fs.writeFileSync = function (f, ...a) { if (/layouts\.json\.\d+\.tmp$/.test(String(f))) throw refusedWrite(); return wf.call(this, f, ...a); }; fs.openSync = function (f, ...a) { if (/layouts\.json\.\d+\.tmp$/.test(String(f))) throw refusedWrite(); return op.call(this, f, ...a); }; try { return await fn(); } finally { fs.writeFileSync = wf; fs.openSync = op; } };
      const tick = () => new Promise((r) => setImmediate(() => setImmediate(r)));
      const lay = (spec) => ({ current: null, autoSave: null, saved: {}, customGrids: [], desktops: Object.fromEntries(Object.entries(spec).map(([k, ws]) => [k, { autoSave: { windows: ws.map((w) => ({ winId: w })) } }])), desktopMeta: Object.keys(spec).map((k) => ({ id: k, name: k.toUpperCase() })) });
      const sceneM = async (P, tag) => {
        const d = scratchDir('owed-lay-' + tag); roots.push(d);
        const sent = []; const client = { readyState: 1, send: (x) => { try { sent.push(JSON.parse(x)); } catch { } } };
        P.setup({ writer: landingWriter(), dataDir: d, wss: { clients: new Set([client]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
        const R = P.router;
        const handler = (method, p) => { const l = R.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
        const call = async (method, p, body, params = {}) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; }, set() { return res; }, setHeader() { } }; await handler(method, p)({ body, query: {}, params, headers: {} }, res, (e) => { status = 500; o = { error: String(e) }; }); return { status, body: o }; };
        R.readLayouts(); R.writeLayouts(lay({ a: ['w1', 'w2'], b: ['w3'] })); R.flushLayouts(); await tick();
        R.writeLayouts(lay({ a: ['w1', 'w2', 'w3'], b: [] })); R.flushLayouts(); await tick();   // a shape change: one rollback point
        const F = path.join(d, 'layouts.json');
        return { R, sent, call, F, disk: () => JSON.parse(fs.readFileSync(F, 'utf8')), point: () => R.listLayoutHistory()[0] };
      };
      const M = await sceneM(freshP(), 'real');
      const W = (t) => M.sent.filter((x) => x.type === t);
      // the autosave: a refused flush is kept, nothing said in its silent rungs
      const before = fs.readFileSync(M.F, 'utf8');
      const auto = await refusing(() => { M.R.writeLayouts(lay({ a: ['w1', 'w2', 'w3', 'w4'], b: [] })); return flushed(M.R); });
      const heldAuto = await M.call('get', '/api/stores/held');
      ok(auto === false && fs.readFileSync(M.F, 'utf8') === before && W('store-unsaved').length === 0 && Array.isArray(heldAuto.body.unsaved) && heldAuto.body.unsaved.length === 0,
        '⑪ (m) the desktops: an autosave whose write the storage refuses is KEPT (the flush answers «not landed», the file holds the older desktops) and nothing is said in its silent rungs', { auto, words: W('store-unsaved'), unsaved: heldAuto.body.unsaved });
      // a press's flush: said at once on every page, listed for a page that was away; a landing lifts it
      const pr = await refusing(() => flushed(M.R, { press: true }));
      const heldNow = await M.call('get', '/api/stores/held');
      const u = W('store-unsaved')[0];
      const landedAfter = flushed(M.R);
      const heldAfter = await M.call('get', '/api/stores/held');
      ok(pr === false && !!u && u.file === 'layouts.json' && u.code === 'EIO' && u.rung === 'said' && !('why' in u) && heldNow.body.unsaved.length === 1 && heldNow.body.unsaved[0].file === 'layouts.json' && !('why' in heldNow.body.unsaved[0])
        && landedAfter === true && W('store-saved').length === 1 && W('store-saved')[0].file === 'layouts.json' && heldAfter.body.unsaved.length === 0 && (M.disk().desktops.a.autoSave.windows || []).length === 4,
        '⑪ (m) the desktops: a press\'s refused flush is SAID to every page at once (store-unsaved: the file, its code) and listed for a page that was away (GET /api/stores/held → unsaved); the next landing LIFTS it (store-saved) with memory\'s desktops on disk', { u, unsaved: heldNow.body.unsaved, landedAfter, saved: W('store-saved') });
      // the stop: a last flush that fails is the journal's line, by the store's name
      const errs = []; const ce = console.error; console.error = (...a) => errs.push(a.join(' '));
      let st; try { st = await refusing(() => { M.R.writeLayouts(lay({ a: ['w1'], b: ['w2', 'w3', 'w4'] })); return flushed(M.R, { stop: true }); }); } finally { console.error = ce; }
      ok(st === false && errs.some((l) => /\[layouts\] layouts\.json could NOT be written at the stop \(EIO\) — the desktops changed since .* are not on disk: the next start reads the older file/.test(l)),
        '⑪ (m) the hub\'s stop: a last flush the storage refuses is said in the journal BY THE STORE\'S NAME (the next start reads the older file)', errs);
      M.R.flushLayouts();   // (lands: the next scene starts clean)
      // the two restore doors: a refused write is answered BY NAME, its broadcast carries it — never «restored»
      const restoreScene = async (P, tag) => {
        const S = await sceneM(P, tag); const pt = S.point();
        const whole = await refusing(() => S.call('post', '/api/layout-history/:id/restore', { rid: 'r-whole' }, { id: pt.id }));
        S.R.flushLayouts();
        const one = await refusing(() => S.call('post', '/api/layout-history/:id/restore', { rid: 'r-one', desktopId: 'b' }, { id: pt.id }));
        S.R.flushLayouts();
        const told = S.sent.filter((x) => x.type === 'layout-restored');
        return { whole, one, told, unsavedWords: S.sent.filter((x) => x.type === 'store-unsaved').length };
      };
      const RS = await restoreScene(freshP(), 'restore');
      ok(RS.whole.status === 503 && RS.whole.body.code === 'store_unsaved' && /restored here, but NOT saved: layouts\.json could not be written \(EIO\)/.test(RS.whole.body.error) && RS.whole.body.unsaved.file === 'layouts.json'
        && RS.one.status === 503 && RS.one.body.code === 'store_unsaved'
        && RS.told.length === 2 && RS.told.every((x) => x.unsaved && x.unsaved.file === 'layouts.json' && x.unsaved.code === 'EIO') && RS.unsavedWords >= 2,
        '⑪ (m) the two restore doors (the whole point, one desktop) answer a refused write BY NAME (503 store_unsaved, the file and its code) and their broadcast carries it — the restoring page never says «restored»; the strip is told at once (a press)', RS);
      // RED: the release's swallow, in a copy — the restore answers success over a write that failed, nothing is said
      const SWALLOW_A = /^ {4}try \{ layoutsHold\.owe\(f\.doc, \{ name: 'layouts\.write'[^\n]*\n {4}catch \(e\) \{ if \(e && e\.code === 'store_appeared'\) layoutsAgain\([^\n]*\n/m;   // (B-0248 (a): the flush's hand-off to the writer)
      const XS = await restoreScene(mutantCopies('swc-owed-swallow', REPO).load(PREL, anchored(PSRC, SWALLOW_A, "      try { ensureDir(dataDir); layoutsHold.write(_layoutsCache); } catch (e) { /* MUTANT: the release's swallow */ }\n      return done(true);\n", 'owed-swallow'), 'owed-swallow'), 'restore-red');
      ok(XS.whole.status === 200 && XS.whole.body.success === true && XS.unsavedWords === 0 && XS.told.every((x) => !x.unsaved),
        'CONTROL (the release\'s swallow, in a copy): the restore answers SUCCESS over a write the storage refused and nothing is said — red', { whole: XS.whole, words: XS.unsavedWords });
    }
  } finally { for (const d of roots) fs.rmSync(d, { recursive: true, force: true }); }
}

// ⑭ B-0248 (c) (lane bl-loop-b, 主开发 r912): THE CONVERSATION LIST, THE BOOKMARKS AND THE CUSTOM THEMES OFF THE LOOP. Measured first
// (a probe, never lined — the real persistence router, a 500 ms stall placed in each rename / fsync): every write of these stores held
// the hub's loop for its rename (501 ms), before its own answer. Now each is THE STORE WRITER's (src/store-hold.js owe/after). LAWS:
// (a) a change is the PENDING state: two quick renames, the first still IN FLIGHT, both land, in order — RED: the second built on the
//     DISK's state loses the first; (b) every door answers AFTER the landing (the pages told at the landing, before the answer; an
//     import after every store it wrote) — RED: the PATCH door's answer at once, the import's answer before its stores; (c) the loop
//     no longer waits: a 300 ms stall placed in each main-thread rename / fsync, the real writer — RED: no writer (the release: the
//     write at the call); (d) the archive verb tells «archived» only once the list is on disk — RED: its wait cut; (e) the stop lands
//     every store moved here (the writer's exit flush) — RED: a change kept in memory only. Each RED an anchored edit, in a copy.
console.log('⑭ B-0248 (c): the conversation list, the bookmarks and the custom themes off the loop — each change built on the PENDING state, each answer after its landing');
{
  const { scratchDir, anchored } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const PREL = 'src/routes/persistence.js', PSRC = fs.readFileSync(path.join(REPO, PREL), 'utf8');
  const COREL = 'src/server/conversation-ops.js', COSRC = fs.readFileSync(path.join(REPO, COREL), 'utf8');
  const J = (x) => JSON.stringify(x);
  const roots = [];
  const quiet = { log() { }, warn() { }, error() { } };
  // A GATED WRITER — the store writer's contract (dirty / durable({answer}) / pending / flushSync / whyNotDurable), its storage HELD
  // by the leg: ONE write of a file in flight at a time, its bytes made when it starts (produce — the latest state), landed only when
  // the leg says so; then its waiters (a version at or before the landed one) are answered, then onWritten, then the next version
  // starts — made NOW. A failed landing keeps the change owed and answers its waiters false (the writer's own failure road)
  const gatedWriter = ({ lateProduce = false, durableMs = undefined, signalled = false } = {}) => {   // lateProduce: the bytes made at the LANDING (a writer busy with another store)
    const S = new Map(), names = [], landedLog = [], bounds = []; let over = false;
    const st = (f) => { if (!S.has(f)) S.set(f, { v: 0, wv: 0, flight: null, dirty: false, o: null, waiters: [] }); return S.get(f); };
    const start = (s) => { if (s.flight || !s.dirty) return; s.dirty = false; if (lateProduce) { s.flight = { v: s.v, bytes: null }; return; } const b = s.o.produce(); s.flight = { v: s.v, bytes: Array.isArray(b) ? b.join('') : String(b) }; };
    const W = {
      dirty(f, o) { names.push(o && o.name); const s = st(f); s.o = o; s.v++; s.dirty = true; start(s); },
      pending: (f) => { const s = S.get(f); return !!s && (s.dirty || !!s.flight); },
      durable(f, { answer = null } = {}) {
        if (over) { if (answer) answer(false); return Promise.resolve(false); }   // (exitOver: the exit's last pass is over — «not on disk» AT ONCE)
        const s = S.get(f); const done = (ok) => { if (answer) answer(ok); return ok; };
        if (!s || (!s.dirty && !s.flight)) return Promise.resolve(done(true));
        const want = s.v; return new Promise((res) => s.waiters.push({ want, cb: (ok) => res(done(ok)) }));
      },
      whyNotDurable: (f) => { const s = S.get(f); return s && s.why === 'queued' ? { why: 'queued', code: null } : { why: 'failed', code: 'EIO' }; },   // (timeout below: a write only QUEUED past the writer's bound)
      flushSync(files) { for (const f of files || [...S.keys()]) { const s = S.get(f); for (let i = 0; s && (s.flight || s.dirty) && i < 10; i++) land1(f, true); } return { written: [], left: [] }; },
      forget: (f) => { S.delete(f); },
      durableMs,   // (B-0248 r1353 (4): a door's own bound is the writer's — undefined ⇒ the product's 60 s)
      // THE ONE BOUND ON AN INJECTED CLOCK (r1389's small): the product hands its bounds here; a leg fires them by hand (fireBounds)
      onBound(fn, what) { const b = { fn, what, live: true }; bounds.push(b); return () => { b.live = false; }; },
      ...(signalled ? { exitStartedAt: () => 1 } : {}),   // (signalled: the stop's signal NOTED — the writer still writes)
    };
    function land1(gwFile, ok = true) {
      const s = S.get(gwFile); if (!s) return; if (!s.flight) start(s); const fl = s.flight; if (!fl) return;
      s.flight = null;
      if (ok) {
        if (fl.bytes === null) { const b = s.o.produce(); fl.bytes = Array.isArray(b) ? b.join('') : String(b); }
        if (s.o.makeDir) fs.mkdirSync(path.dirname(gwFile), { recursive: true });
        const gwTmp = gwFile + '.gw.tmp'; fs.writeFileSync(gwTmp, fl.bytes); fs.renameSync(gwTmp, gwFile); s.wv = fl.v; s.why = null; landedLog.push(path.basename(gwFile));
        const keep = []; for (const w of s.waiters) { if (w.want <= s.wv) w.cb(true); else keep.push(w); } s.waiters = keep;
        try { s.o.onWritten && s.o.onWritten(true, null); } catch { }
        start(s);
      } else {
        s.dirty = true; const ws = s.waiters; s.waiters = []; for (const w of ws) w.cb(false);
        try { s.o.onWritten && s.o.onWritten(false, Object.assign(new Error('EIO: a stand-in'), { code: 'EIO' })); } catch { }
      }
    }
    return { W, names, land: (ok = true) => { for (const f of [...S.keys()]) land1(f, ok); }, inFlight: () => [...S.values()].filter((s) => s.flight).length, log: () => landedLog.slice(),
      flying: () => [...S.entries()].filter(([, s]) => s.flight).map(([f]) => f), landOnly: (pred, ok = true) => { for (const f of [...S.keys()]) if (pred(f) && S.get(f).flight) land1(f, ok); },
      // the writer's BOUND passes while a write is still QUEUED (the real writer's durableMs): its waiters answer false, the write stays
      fireBounds: (pred = () => true) => { for (const b of bounds.slice()) if (b.live && pred(b.what)) { b.live = false; b.fn(); } },
      exitOver: () => { over = true; },
      timeout: (pred) => { for (const [f, s] of [...S.entries()]) if (pred(f) && (s.flight || s.dirty) && s.waiters.length) { s.why = 'queued'; const ws = s.waiters; s.waiters = []; for (const w of ws) w.cb(false); } } };
  };
  const fresh = (P) => { for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; return P(); };
  const setupP = (P, d, W, told, hooked) => {
    P.setup({ dataDir: d, wss: { clients: new Set([{ readyState: 1, send: (t) => told.push(JSON.parse(t)) }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, onUserStateWrite: (s) => hooked.push(s), writer: W });
    return P.router;
  };
  const handlerOf = (R, method, p) => { const l = R.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[l.route.stack.length - 1].handle; };
  const call = (R, method, p, { body = {}, params = {}, headers = {}, tap = null } = {}) => {
    const out = { status: 200, body: undefined, answered: false };
    const res = { status(c) { out.status = c; return res; }, json(x) { out.body = x; out.answered = true; if (tap) out.tapped = tap(); return res; }, set() { return res; }, setHeader() { }, headersSent: false };
    try { handlerOf(R, method, p)({ body, params, headers: { 'sec-fetch-site': 'same-origin', ...headers }, query: {} }, res, (e) => { if (e) out.err = String(e && e.message || e); }); } catch (e) { out.err = String(e && e.message || e); }
    return out;
  };
  const seed = (d) => {
    fs.writeFileSync(path.join(d, 'user-state.json'), J({ customNames: {}, archivedSessions: [] }));   // a list THERE (a store NOT there is born at the call — R6)
    fs.writeFileSync(path.join(d, 'bookmarks.json'), J([{ label: 'Home', path: '/home' }]));
    fs.writeFileSync(path.join(d, 'custom-themes.json'), J({}));
  };
  const disk = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
  try {
    // (a) + (b): THE PENDING STATE and THE ANSWER AFTER THE LANDING, through the router's own doors
    const lawScene = async (load, tag) => {
      const d = scratchDir('swc-pl-' + tag); roots.push(d); seed(d);
      const g = gatedWriter(), told = [], hooked = [];
      const R = setupP(fresh(load), d, g.W, told, hooked);
      call(R, 'get', '/api/user-state'); call(R, 'get', '/api/bookmarks'); call(R, 'get', '/api/custom-themes');   // the start reads
      for (let i = 0; i < 4 && g.inFlight(); i++) g.land();   // (the start read's own rewrite, if any, landed first: the scene starts with nothing in flight)
      told.length = 0; hooked.length = 0;
      const out = {};
      out.one = R.setCustomName('claude:a', 'one');            // handed to the writer: IN FLIGHT, held
      out.two = R.setCustomName('claude:b', 'two');            // the second, while the first is not on disk
      out.disk0 = disk(d, 'user-state.json').customNames;      // nothing on disk yet (the loop wrote nothing)
      out.getInFlight = (call(R, 'get', '/api/user-state').body || {}).customNames;   // what LEAVES the store is what landed (the doors build on the pending)
      out.readerInFlight = R.readUserState().customNames;
      const revsTold = () => told.filter((t) => t.type === 'user-state-updated').map((t) => t.state.stateRev);
      const patch = call(R, 'patch', '/api/user-state', { body: { starredSessions: ['claude:a'] }, tap: revsTold });   // a door's act: its answer waits
      out.inFlight = g.inFlight();
      g.land();                                                // the FIRST write lands: the first rename only
      out.disk1 = disk(d, 'user-state.json').customNames;
      out.answeredAt1 = patch.answered; out.toldAt1 = told.filter((t) => t.type === 'user-state-updated').length;
      g.land();                                                // the next — made at the first's landing, from the PENDING state
      const f2 = disk(d, 'user-state.json');
      out.disk2 = f2.customNames; out.star2 = f2.starredSessions; out.rev2 = f2.stateRev;
      out.patch = { status: patch.status, answered: patch.answered, rev: patch.body && patch.body.rev, toldAtAnswer: patch.tapped };
      out.getLanded = (call(R, 'get', '/api/user-state').body || {}).customNames;
      const us = told.filter((t) => t.type === 'user-state-updated');
      out.told = us.map((t) => ({ rev: t.state.stateRev, names: t.state.customNames }));
      out.hooked = hooked.map((s) => s.stateRev);
      out.names = [...new Set(g.names)];
      // the bookmarks and the custom themes: the same road (each change on the PENDING state; the answer and the pages' word at the landing)
      const bm = call(R, 'post', '/api/bookmarks', { body: [{ label: 'A', path: '/a' }] });
      const th1 = call(R, 'post', '/api/custom-themes', { body: { name: 'one', css: { '--a': '1' } } });
      const th2 = call(R, 'post', '/api/custom-themes', { body: { name: 'two', css: { '--b': '2' } } });   // while the first theme is in flight
      out.bmBefore = { answered: bm.answered, told: told.filter((t) => t.type === 'bookmarks-updated').length, onDisk: disk(d, 'bookmarks.json').length };
      out.thBefore = { answered: th1.answered || th2.answered, told: told.filter((t) => t.type === 'custom-themes-updated').length };
      for (let i = 0; i < 3; i++) g.land();
      out.bm = { answered: bm.answered, status: bm.status, told: told.filter((t) => t.type === 'bookmarks-updated').length, onDisk: disk(d, 'bookmarks.json').map((b) => b.label) };
      out.th = { answered: th1.answered && th2.answered, onDisk: Object.keys(disk(d, 'custom-themes.json')).sort(), frames: told.filter((t) => t.type === 'custom-themes-updated').map((t) => Object.keys(t.themes).sort().join(',')) };
      // a write the storage REFUSES: the door says so by name (503 not-durable), the change stays owed, and lands at the next try
      const xFrames = () => told.filter((t) => t.type === 'user-state-updated' && J(t.state.archivedFolders) === J(['/x'])).length;
      const fail = call(R, 'patch', '/api/user-state', { body: { archivedFolders: ['/x'] } });
      g.land(false);
      out.fail = { status: fail.status, code: fail.body && fail.body.code, framesAtFail: xFrames() };
      g.land(); out.failLanded = disk(d, 'user-state.json').archivedFolders; out.failFrames = xFrames();
      // the import spans stores: answered once every store it wrote landed
      const imp = call(R, 'post', '/api/config/import', { body: { file: { app: 'vibespace-config', sections: { bookmarks: [{ label: 'I', path: '/i' }], userState: { customNames: { 'claude:i': 'imported' } } } }, sections: ['bookmarks', 'userState'] } });
      out.impBefore = imp.answered;
      for (let i = 0; i < 3; i++) g.land();
      out.imp = { answered: imp.answered, status: imp.status, applied: imp.body && imp.body.applied };
      return out;
    };
    const real = await lawScene(() => require(path.join(REPO, PREL)), 'real');
    ok(real.one === true && real.two === true && J(real.disk0) === '{}' && real.inFlight === 1 && J(real.disk1) === J({ 'claude:a': 'one' }) && J(real.disk2) === J({ 'claude:a': 'one', 'claude:b': 'two' }) && J(real.star2) === J(['claude:a']),
      '⑭a two quick renames, the first IN FLIGHT: nothing on disk at the call (the loop wrote nothing), the first lands alone, the second lands WITH it (built on the pending state) — both, in order', real);
    ok(J(real.getInFlight) === '{}' && J(real.readerInFlight) === '{}' && J(real.getLanded) === J(real.disk2),
      '⑭b WHAT LEAVES THE STORE IS WHAT LANDED: while the renames are in flight the GET and the hub\'s readers (router.readUserState — the groups, isArchived) hand the state on disk; after the landing, the landed one', { inFlight: real.getInFlight, reader: real.readerInFlight, landed: real.getLanded });
    ok(Array.isArray(real.patch.toldAtAnswer) && real.patch.toldAtAnswer.includes(real.patch.rev), '⑭b the pages are told the landed state BEFORE the door answers (the frame of the answer\'s rev was sent when it answered)', real.patch);
    ok(real.answeredAt1 === false && real.toldAt1 === 1 && real.patch.answered && real.patch.status === 200 && real.patch.rev === real.rev2 && J(real.told.map((t) => t.rev)) === J([real.rev2 - 2, real.rev2]) && real.hooked.length === 2 && J(real.names) === J(['user-state.write']),
      '⑭b the door\'s answer waits for its landing (not answered while only the first rename is on disk); every page told what LANDED, once a landing (2 frames for 3 changes), before the answer; the write hook at each landing; the writer\'s row user-state.write', { at1: real.answeredAt1, toldAt1: real.toldAt1, patch: real.patch, told: real.told, hooked: real.hooked, names: real.names });
    ok(!real.bmBefore.answered && real.bmBefore.told === 0 && real.bmBefore.onDisk === 1 && !real.thBefore.answered && real.thBefore.told === 0 && real.bm.answered && real.bm.status === 200 && real.bm.told === 1 && J(real.bm.onDisk) === J(['A']) && real.th.answered && J(real.th.onDisk) === J(['one', 'two']),
      '⑭b the bookmarks and the custom themes: nothing told or answered before the landing; then told once and answered; two quick theme saves both land', { bmBefore: real.bmBefore, thBefore: real.thBefore, bm: real.bm, th: real.th });
    ok(J(real.th.frames) === J(['one', 'one,two']), '⑭b each theme frame tells what LANDED — «one» alone at the first landing, then «one,two» (never a theme still in flight)', real.th.frames);
    ok(real.fail.framesAtFail === 0 && real.failFrames === 1, '⑭b a write the storage refused is told NOTHING; its retry that lands is told exactly ONCE', { atFail: real.fail.framesAtFail, after: real.failFrames });
    ok(real.fail.status === 503 && real.fail.code === 'not-durable' && J(real.failLanded) === J(['/x']) && real.impBefore === false && real.imp.answered && real.imp.status === 200 && J(real.imp.applied) === J(['userState', 'bookmarks']),
      '⑭b a write the storage refuses is answered 503 not-durable BY NAME and stays owed (it lands at the next try); the import answers only once both its stores landed', { fail: real.fail, failLanded: real.failLanded, impBefore: real.impBefore, imp: real.imp });
    // RED (a): the second rename built on the DISK's state
    const DISK_A = "    const cur = readUserState();\n    const names = { ...(cur.customNames || {}) };\n";
    ok(PSRC.split(DISK_A).length === 2, 'control setup: the rename\'s read of the list is found once');
    const XA = await lawScene(() => mutantCopies('swc-pl-disk', REPO).load(PREL, anchored(PSRC, DISK_A, "    const cur = JSON.parse(require('fs').readFileSync(USER_STATE_FILE, 'utf8'));   // MUTANT: the DISK's state\n    const names = { ...(cur.customNames || {}) };\n", 'pl-disk-state')), 'disk');
    ok(J(XA.disk2) === J({ 'claude:b': 'two' }), 'CONTROL (the second rename built on the DISK\'s state, in a copy): it loses the first — only «two» lands (red)', XA.disk2);
    // RED (b): the PATCH door answered at once; the import answered before its stores
    const ANS_A = /^( {4}const rev = UO\.revOf\(_userStateCache\);[^\n]*\n {4}answerAfter\(userStateHold, res, \(\) => res\.json\(\{ success: true, rev, epoch: userStateEpoch\(\) \}\)\);[^\n]*\n)(?=  \}\);\n  \/\/ THE OPS DOOR)/m;
    const IMP_A = '    afterAll(movedOf(), (bad) => {\n';
    ok(PSRC.split(IMP_A).length === 2, 'control setup: the import\'s wait for its stores is found once');
    const XB = await lawScene(() => mutantCopies('swc-pl-now', REPO).load(PREL, anchored(anchored(PSRC, ANS_A, "    res.json({ success: true, rev: UO.revOf(_userStateCache), epoch: userStateEpoch() });   // MUTANT: answered at once\n", 'pl-answer-now'), IMP_A, '    afterAll([], (bad) => {   // MUTANT: answered before its stores\n', 'pl-import-now')), 'now');
    ok(XB.answeredAt1 === true && XB.impBefore === true, 'CONTROL (the PATCH door\'s answer at once, the import\'s before its stores — in a copy): both answered while their change is not on disk (red)', { at1: XB.answeredAt1, imp: XB.impBefore });
    // RED (a), THE MECHANISM: the change taken but the list in memory NOT moved to it (the next change built on the state the start read)
    const ACC_A = "accepted: () => { _userStateCache = st; _userStateFacts.commit(draft); } }); }\n";
    ok(PSRC.split(ACC_A).length === 2, 'control setup: the list\'s accepted (the pending state) is found once');
    const XM = await lawScene(() => mutantCopies('swc-pl-nopending', REPO).load(PREL, anchored(PSRC, ACC_A, "accepted: () => { _userStateFacts.commit(draft); } }); }   // MUTANT: the pending state never taken\n", 'pl-no-pending')), 'nopending');
    ok(J(XM.disk2) !== J({ 'claude:a': 'one', 'claude:b': 'two' }), 'CONTROL (the list in memory never moved to the pending state, in a copy): the quick renames do not both land — each change built on the state the start read (red)', XM.disk2);
    // RED: a theme edited IN PLACE (the fresh read's MUST — the release's edit of the set in memory)
    const TH_A = "    const data = { ...readCustomThemes() };\n    data[name] = { css, terminal: terminal || {} };\n";
    ok(PSRC.split(TH_A).length === 2, 'control setup: the theme save\'s copy is found once');
    const XT = await lawScene(() => mutantCopies('swc-pl-inplace', REPO).load(PREL, anchored(PSRC, TH_A, "    const data = readCustomThemes();   // MUTANT: edited in place\n    data[name] = { css, terminal: terminal || {} };\n", 'pl-theme-in-place')), 'inplace');
    ok(XT.th.frames[0] === 'one,two', 'CONTROL (a theme edited in place, in a copy): the FIRST landing tells «one,two» while the file holds «one» alone (red)', XT.th.frames);
    // RED: the readers handed the PENDING list
    const OUT_A = "  function userStateOut() { const st = readUserState(); return _userStateLandedSt || st; }\n";
    ok(PSRC.split(OUT_A).length === 2, 'control setup: the readers\' landed list is found once');
    const XO = await lawScene(() => mutantCopies('swc-pl-outpending', REPO).load(PREL, anchored(PSRC, OUT_A, "  function userStateOut() { return readUserState(); }   // MUTANT: the pending list\n", 'pl-out-pending')), 'outpending');
    ok(J(XO.getInFlight) === J({ 'claude:a': 'one', 'claude:b': 'two' }), 'CONTROL (the readers handed the pending list, in a copy): the GET shows both renames while neither is on disk (red)', XO.getInFlight);
    // RED: the hold answers BEFORE it tells (the store hold, in a copy loaded in its place)
    const SHREL = 'src/store-hold.js', SHSRC = fs.readFileSync(path.join(REPO, SHREL), 'utf8'), SHP = require.resolve(path.join(REPO, SHREL));
    const TELL_A = "    w.durable(file, { answer: (ok) => { if (ok) tell(); else notOnDiskOwed(press); answer(ok); } });\n";
    ok(SHSRC.split(TELL_A).length === 2, 'control setup: the hold\'s tell-then-answer is found once');
    const holdX = mutantCopies('swc-pl-answerfirst', REPO).load(SHREL, anchored(SHSRC, TELL_A, "    w.durable(file, { answer: (ok) => { if (!ok) notOnDiskOwed(press); answer(ok); if (ok) tell(); } });   // MUTANT: answered first\n", 'pl-answer-first'));
    const savedHold = require.cache[SHP];
    let XF;
    try { require.cache[SHP] = { id: SHP, filename: SHP, loaded: true, exports: holdX, children: [], paths: [] }; XF = await lawScene(() => require(path.join(REPO, PREL)), 'answerfirst'); }
    finally { if (savedHold) require.cache[SHP] = savedHold; else delete require.cache[SHP]; }
    ok(Array.isArray(XF.patch.toldAtAnswer) && !XF.patch.toldAtAnswer.includes(XF.patch.rev), 'CONTROL (the hold answering before it tells, in a copy): the door answers while no page has been told its state (red)', XF.patch);

    // (c) THE LOOP NO LONGER WAITS — the REAL store writer (its own thread), a stall PLACED in every main-thread rename / fsync of the
    // scene's folder (Atomics.wait inside the call: never load; the writer's thread has its own fs). RED: no writer — the release's
    // write at the call
    const SW = require(path.join(REPO, 'src/store-writer.js'));
    const STALL = 300, SAB = new Int32Array(new SharedArrayBuffer(4));
    const loopScene = async (load, tag) => {
      const d = scratchDir('swc-pl-loop-' + tag); roots.push(d); seed(d);
      const w = SW.create({ log: quiet, graceMs: 5000 });
      const told = [], hooked = [];
      const R = setupP(fresh(load), d, w, told, hooked);
      call(R, 'get', '/api/user-state');
      await new Promise((r) => w.durable(path.join(d, 'user-state.json'), { answer: r }));   // (the start read's rewrite, if any, landed)
      const oRen = fs.renameSync, oFsync = fs.fsyncSync;
      fs.renameSync = function (a, ...r) { if (String(a).startsWith(d)) Atomics.wait(SAB, 0, 0, STALL); return oRen.call(this, a, ...r); };
      fs.fsyncSync = function (...r) { Atomics.wait(SAB, 0, 0, STALL); return oFsync.apply(this, r); };
      let last = performance.now(), gap = 0, on = true;
      const tick = () => { const t = performance.now(); if (t - last > gap) gap = t - last; last = t; if (on) setTimeout(tick, 1); };
      setTimeout(tick, 1);
      const t0 = performance.now();
      let a, b;
      try {
        a = call(R, 'patch', '/api/user-state', { body: { customNames: { 'claude:l': 'loop' } } });
        b = call(R, 'post', '/api/bookmarks', { body: [{ label: 'L', path: '/l' }] });
        for (let i = 0; i < 400 && !(a.answered && b.answered); i++) await new Promise((r) => setTimeout(r, 5));   // a wait for WHAT HAPPENED: both answered
      } finally { fs.renameSync = oRen; fs.fsyncSync = oFsync; on = false; }
      await new Promise((r) => setTimeout(r, 5));
      const out = { gap: Math.round(gap), ms: Math.round(performance.now() - t0), answered: a.answered && b.answered, status: [a.status, b.status], onDisk: disk(d, 'user-state.json').customNames['claude:l'] || null, bm: disk(d, 'bookmarks.json').map((x) => x.label) };
      try { w.stop(); } catch { }
      return out;
    };
    const LR = await loopScene(() => require(path.join(REPO, PREL)), 'real');
    console.log(`  ⊙ ⑭c the loop's longest turn with ${STALL} ms placed in each main-thread rename / fsync: ${LR.gap} ms over ${LR.ms} ms (a rename and a bookmarks save, both answered after their landing)`);
    const NOW_A = "  const storeW = () => writer || require('../store-writer.js').storeWriter();\n";
    ok(PSRC.split(NOW_A).length === 2, 'control setup: the stores\' writer is found once');
    const XC = await loopScene(() => mutantCopies('swc-pl-nowriter', REPO).load(PREL, anchored(PSRC, NOW_A, '  const storeW = () => null;   // MUTANT: no writer — the write at the call (the release)\n', 'pl-no-writer')), 'nowriter');
    console.log(`  ⊙ ⑭c the red's own figure: no writer (the release's write at the call) ${XC.gap} ms; the tree ${LR.gap} ms`);
    // (r1053 (5): a fast suite on a busy machine — the bound is the red's own figure: under half of it, never a fixed 150 ms)
    ok(LR.answered && J(LR.status) === J([200, 200]) && LR.onDisk === 'loop' && J(LR.bm) === J(['L']) && LR.gap * 2 < XC.gap, `⑭c the loop no longer waits on the storage: with ${STALL} ms placed in each main-thread rename / fsync the longest turn is ${LR.gap} ms — under half the red's own ${XC.gap} ms; both acts answered after their landing, both on disk`, { tree: LR, red: XC.gap });
    ok(XC.gap >= STALL && XC.onDisk === 'loop', `CONTROL (no writer — the release's write at the call, in a copy): the loop is held ${XC.gap} ms (≥ ${STALL}) by the rename (red)`, XC);

    // (d) THE ARCHIVE VERB tells «archived» only once the list is ON DISK (an agent told so never asks again)
    const verbScene = async (CO, landed) => {
      const V = CO.automationVerbs({ activeSessions: new Map(), archive: () => ({ ok: true, already: false, landed }), deadOf: () => ({ conversationId: 'c-1', sessionKey: 'claude:c-1', name: 'one' }), isArchived: () => false });
      const p = V['conversations.archive']({ target: 'c-1' }, { caller: { conversationId: 'c-0', sessionKey: 'claude:c-0' }, keyId: 'k-1', reach: () => ({ ok: true, by: 'opener' }), scopes: [] });
      let settled = null; p.then((r) => { settled = r; }, (e) => { settled = { threw: String(e && e.message || e) }; });
      return { p, now: () => settled };
    };
    let release; const pend = new Promise((r) => { release = r; });
    const CO = require(path.join(REPO, COREL));
    const v1 = await verbScene(CO, pend);
    await new Promise((r) => setTimeout(r, 20)); const before = v1.now();
    release(true); await v1.p; const after1 = v1.now();
    const v2 = await verbScene(CO, Promise.resolve(false)); await v2.p; const notOn = v2.now();
    ok(before === null && after1 && after1.ok === true && after1.archived === true && notOn && notOn.ok === false && notOn.code === 'not-durable',
      '⑭d the archive verb waits for the list\'s landing: no answer while it is in flight, «archived» after; a list not on disk is answered not-durable BY NAME', { before, after: after1, notOn });
    const VERB_A = "      if (a.landed && !(await a.landed)) return { ok: false, code: 'not-durable',";
    ok(COSRC.split(VERB_A).length === 2, 'control setup: the verb\'s wait for the landing is found once');
    const COX = mutantCopies('swc-pl-verb', REPO).load(COREL, anchored(COSRC, VERB_A, "      if (false && a.landed && !(await a.landed)) return { ok: false, code: 'not-durable',", 'pl-verb-nowait'));
    let release2; const pend2 = new Promise((r) => { release2 = r; });
    const vx = await verbScene(COX, pend2); await new Promise((r) => setTimeout(r, 20)); const xBefore = vx.now(); release2(true);
    ok(xBefore && xBefore.ok === true && xBefore.archived === true, 'CONTROL (the verb\'s wait cut, in a copy): «archived» told while the list is not on disk (red)', xBefore);

    // (d') THE VERB ON THE REAL ROUTER: conversations.archive over archiveSession, the list's write held by the gated writer — no answer
    // while in flight; «archived» at the landing; a write the storage refuses ⇒ not-durable, and asked again ⇒ already_archived only once
    // it is on disk. RED: archiveSession's `landed` answered at once (in a copy)
    const realVerb = async (load, tag) => {
      const d = scratchDir('swc-pl-verb-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      call(R, 'get', '/api/user-state');
      const V = CO.automationVerbs({ activeSessions: new Map(), archive: (k) => R.archiveSession(k), deadOf: (t) => ({ conversationId: t, sessionKey: 'claude:' + t, name: t }), isArchived: (k) => R.isArchived(k) });
      const ask = (t) => { let r = null; const p = V['conversations.archive']({ target: t }, { caller: { conversationId: 'c-0', sessionKey: 'claude:c-0' }, keyId: 'k-1', reach: () => ({ ok: true, by: 'opener' }), scopes: [] }); p.then((x) => { r = x; }, (e) => { r = { threw: String(e && e.message || e) }; }); return { p, now: () => r }; };
      const tick = () => new Promise((r) => setTimeout(r, 15));
      const out = {};
      const a1 = ask('c-1'); await tick(); out.inFlight = a1.now(); out.isArchivedInFlight = R.isArchived('claude:c-1');
      g.land(); await a1.p; out.landed = a1.now(); out.onDisk = disk(d, 'user-state.json').archivedSessions.includes('claude:c-1');
      const a2 = ask('c-2'); await tick(); g.land(false); await a2.p; out.refused = a2.now();
      const a3 = ask('c-2'); await tick(); out.againInFlight = a3.now();
      g.land(); await a3.p; out.again = a3.now();
      return out;
    };
    const RV = await realVerb(() => require(path.join(REPO, PREL)), 'real');
    ok(RV.inFlight === null && RV.isArchivedInFlight === true && RV.landed && RV.landed.ok === true && RV.landed.archived === true && RV.onDisk && RV.refused && RV.refused.code === 'not-durable' && RV.againInFlight === null && RV.again && RV.again.ok === true && RV.again.archived === true,
      '⑭d THE VERB ON THE REAL ROUTER: no answer while the list is in flight (isArchived already true — the gate fails closed, r1053); «archived» at the landing, on disk; a refused write ⇒ not-durable; asked again, it waits, then «archived» once its own archive lands («already» is the landed list\'s, r1053 (2))', RV);
    const LAND_A = "    // its caller «archived» only after it (an agent told so never asks again)\n    return { ok: true, already: false, landed: landedOf(userStateHold) };\n";
    ok(PSRC.split(LAND_A).length === 2, 'control setup: archiveSession\'s landing promise is found once');
    const RVX = await realVerb(() => mutantCopies('swc-pl-landnow', REPO).load(PREL, anchored(PSRC, LAND_A, "    // its caller «archived» only after it (an agent told so never asks again)\n    return { ok: true, already: false, landed: Promise.resolve(true) };   // MUTANT: «landed» at once\n", 'pl-landed-now')), 'landnow');
    ok(RVX.inFlight && RVX.inFlight.archived === true, 'CONTROL (archiveSession\'s landing answered at once, in a copy): the verb says «archived» while the list is not on disk (red)', RVX.inFlight);

    // (f) THE BATCHES DOOR (the page's ops) and A WRITE OF THE FACTS ALONE, through the gated writer; (g) a store NOT THERE; (h) the start
    // read's own rewrite stays AT THE CALL (the boot's one-time migrations read the file after it)
    const moreScene = async (load, tag) => {
      const out = {};
      { const d = scratchDir('swc-pl-ops-' + tag); roots.push(d); seed(d);
        const g = gatedWriter(), told = [];
        const R = setupP(fresh(load), d, g.W, told, []);
        call(R, 'get', '/api/user-state');
        const frames = () => told.filter((t) => t.type === 'user-state-updated').length;
        const b1 = { batches: [{ batch: 'pgops01:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:x', value: true }] }] };
        const o1 = call(R, 'patch', '/api/user-state/batches', { body: b1 });
        const o2 = call(R, 'patch', '/api/user-state/batches', { body: b1 });   // the page's re-send of the SAME batch, while the first is in flight
        out.opsBefore = { a: o1.answered, b: o2.answered };
        g.land(); g.land();
        out.ops = { a: o1.answered && o1.status, b: o2.answered && o2.status, applied: o1.body && o1.body.applied, held: o2.body && o2.body.held, onDisk: disk(d, 'user-state.json').archivedSessions };
        const f0 = frames();
        const b2 = { batches: [{ batch: 'pgops02:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:x', value: true }] }] };   // another page's act on a slot already so: its FACTS alone
        const o3 = call(R, 'patch', '/api/user-state/batches', { body: b2 });
        out.factsOwed = g.inFlight(); out.factsBefore = o3.answered;
        g.land(); g.land();
        out.facts = { answered: o3.answered && o3.status, framesAdded: frames() - f0, applied: o3.body && o3.body.applied };
      }
      { const d = scratchDir('swc-pl-none-' + tag); roots.push(d);   // NOTHING there: the list's first change is its exclusive create, AT THE CALL
        const g = gatedWriter(), told = [];
        const R = setupP(fresh(load), d, g.W, told, []);
        call(R, 'get', '/api/user-state');
        const n1 = call(R, 'patch', '/api/user-state', { body: { customNames: { 'claude:n': 'new' } } });
        out.none = { answered: n1.answered && n1.status, onDisk: fs.existsSync(path.join(d, 'user-state.json')) ? disk(d, 'user-state.json').customNames : null, owed: g.inFlight(), frames: told.filter((t) => t.type === 'user-state-updated').length };
        const n2 = call(R, 'patch', '/api/user-state', { body: { customNames: { 'claude:n': 'next' } } });   // the file is THERE now: the writer's
        out.none.secondOwed = g.inFlight(); out.none.secondBefore = n2.answered; g.land(); out.none.second = n2.answered && disk(d, 'user-state.json').customNames['claude:n'];
      }
      { const d = scratchDir('swc-pl-rewrite-' + tag); roots.push(d);
        const LEGACY = '0a0b0c0d-1111-4222-8333-444455556666';   // a legacy ref (no «claude:»): the start read's normalizer rewrites the file
        fs.writeFileSync(path.join(d, 'user-state.json'), J({ archivedSessions: [LEGACY] }));
        const g = gatedWriter();
        const R = setupP(fresh(load), d, g.W, [], []);
        out.rewrite = { owed: g.inFlight(), onDisk: disk(d, 'user-state.json').archivedSessions, served: R.readUserState().archivedSessions };
      }
      return out;
    };
    const MR = await moreScene(() => require(path.join(REPO, PREL)), 'real');
    ok(!MR.opsBefore.a && !MR.opsBefore.b && MR.ops.a === 200 && MR.ops.b === 200 && J(MR.ops.applied) === J(['pgops01:1']) && J(MR.ops.held) === J(['pgops01:1']) && J(MR.ops.onDisk) === J(['claude:x']),
      '⑭f THE BATCHES DOOR: a batch and its re-send (held as its own duplicate) — NEITHER answered while the write that applied it is in flight; both after its landing; on disk once', MR.ops);
    ok(MR.factsOwed === 1 && MR.factsBefore === false && MR.facts.answered === 200 && MR.facts.framesAdded === 0,
      '⑭f a write of the FACTS alone (another page\'s act on a slot already so): handed to the writer, answered after its landing, and told to no page (no new state)', { owed: MR.factsOwed, before: MR.factsBefore, ...MR.facts });
    ok(MR.none.answered === 200 && J(MR.none.onDisk) === J({ 'claude:n': 'new' }) && MR.none.owed === 0 && MR.none.frames === 1 && MR.none.secondOwed === 1 && MR.none.secondBefore === false && MR.none.second === 'next',
      '⑭g a list NOT THERE: its first change is the exclusive create AT THE CALL (on disk at once, nothing owed, answered, told once); the next goes to the writer', MR.none);
    ok(MR.rewrite.owed === 0 && J(MR.rewrite.onDisk) === J(['claude:' + '0a0b0c0d-1111-4222-8333-444455556666']) && J(MR.rewrite.served) === J(MR.rewrite.onDisk),
      '⑭h the start read\'s own rewrite stays AT THE CALL: the legacy ref is normalized ON DISK when the start read returns (the boot\'s one-time migrations read the file after it) — nothing owed to the writer', MR.rewrite);
    const REW_A = "      try { userStateHold.write(_userStateCache, userStateText(_userStateCache)); }\n";
    ok(PSRC.split(REW_A).length === 2, 'control setup: the start read\'s rewrite is found once');
    const MRX = await moreScene(() => mutantCopies('swc-pl-rewriteowed', REPO).load(PREL, anchored(PSRC, REW_A, "      try { userStateHold.owe(_userStateCache, { name: 'user-state.write', bytes: userStateBytes }); }   // MUTANT: handed to the writer\n", 'pl-rewrite-owed')), 'rewriteowed');
    ok(MRX.rewrite.owed === 1 && J(MRX.rewrite.onDisk) !== J(MRX.rewrite.served), 'CONTROL (the start read\'s rewrite handed to the writer, in a copy): when the start read returns the file still holds the legacy ref — a migration reading it then reads the old list (red)', MRX.rewrite);

    // (l) r1053's MUST — THE WAKE'S GATE FAILS CLOSED: an archive whose write is IN FLIGHT already stops the wake (isArchived reads the
    // pending AND the landed list); an un-archive in flight still refuses until it lands. RED: the gate handed the landed list alone
    const DW = require(path.join(REPO, 'src/delivery-wake.js'));
    const wakeScene = async (load, tag) => {
      const d = scratchDir('swc-pl-wake-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      call(R, 'get', '/api/user-state');
      const key = 'claude:c-9', harness = { resumeContinues: 'nothing', headless: true };
      const out = {};
      R.archiveSession(key);   // the archive accepted: its write in flight
      out.archInFlight = R.isArchived(key); out.verdictInFlight = DW.deliveryResumeVerdict({ archived: R.isArchived(key), goal: 'none', queue: 0 }, harness).code || 'ok';
      g.land(); out.archLanded = R.isArchived(key);
      call(R, 'patch', '/api/user-state', { body: { archivedSessions: [] } });   // the person un-archives: in flight
      out.unarchInFlight = R.isArchived(key);
      g.land(); out.unarchLanded = R.isArchived(key);
      // r1053 (1): the reader that chooses what a turn is billed to reads the PENDING list
      call(R, 'patch', '/api/user-state', { body: { sessionConfigs: { [key]: { account: 'acct-new' } } } });   // (the field the wake's configAccountOf reads: `account`)
      out.cfgPending = ((R.readUserStatePending().sessionConfigs || {})[key] || {}).account || null;
      out.cfgLanded = ((R.readUserState().sessionConfigs || {})[key] || {}).account || null;
      g.land();
      return out;
    };
    const WK = await wakeScene(() => require(path.join(REPO, PREL)), 'real');
    ok(WK.archInFlight === true && WK.verdictInFlight === 'archived' && WK.archLanded === true && WK.unarchInFlight === true && WK.unarchLanded === false,
      '⑭l THE WAKE\'S GATE FAILS CLOSED (r1053\'s MUST): an archive IN FLIGHT already reads archived and the wake\'s own verdict refuses («archived»); an un-archive in flight still refuses until it lands', WK);
    const MPW = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
    const cfgLine = (MPW.split('\n').find((l) => /^  configAccountOf: \(key\) => \{/.test(l)) || '');
    ok(WK.cfgPending === 'acct-new' && WK.cfgLanded === null && /persistenceRouter\.readUserStatePending/.test(cfgLine) && /c\.account\b/.test(cfgLine),
      '⑭l the reader that chooses what a turn is billed to (readUserStatePending) sees the account a person just set while its write is in flight, the landed reader not yet — and the wake\'s configAccountOf reads THAT reader\'s `account` field (the pin on the wiring)', { pending: WK.cfgPending, landed: WK.cfgLanded });
    const GATE_A = "    try { pending = readUserState(); landed = userStateOut(); }\n";
    ok(PSRC.split(GATE_A).length === 2, 'control setup: the gate\'s two lists are found once');
    const WKX = await wakeScene(() => mutantCopies('swc-pl-gatelanded', REPO).load(PREL, anchored(PSRC, GATE_A, "    try { pending = userStateOut(); landed = pending; }   // MUTANT: the landed list alone\n", 'pl-gate-landed')), 'gatelanded');
    ok(WKX.archInFlight === false && WKX.verdictInFlight !== 'archived', 'CONTROL (the gate handed the landed list alone, in a copy): while the archive is in flight it reads «not archived» and the wake RESUMES the conversation the person just archived (red)', WKX);
    const WKP = await wakeScene(() => mutantCopies('swc-pl-gatepending', REPO).load(PREL, anchored(PSRC, GATE_A, "    try { pending = readUserState(); landed = pending; }   // MUTANT: the pending list alone\n", 'pl-gate-pending')), 'gatepending');
    ok(WKP.archInFlight === true && WKP.unarchInFlight === false, 'CONTROL (the gate handed the pending list alone, in a copy): while the person\'s un-archive is in flight it reads «not archived» — a wake would resume a conversation the disk still holds archived (red, the other direction)', WKP);

    // (m) r1053 (2): «ALREADY ARCHIVED» IS JUDGED FROM THE LANDED LIST — an archive on disk, then an UNRELATED change whose write the
    // storage refuses: asked again, the verb answers already_archived AT ONCE (never not-durable for what is on disk). RED: the
    // «already» road waiting on whatever the store owes now
    const alreadyScene = async (load, tag) => {
      const d = scratchDir('swc-pl-already-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      call(R, 'get', '/api/user-state');
      const V = CO.automationVerbs({ activeSessions: new Map(), archive: (k) => R.archiveSession(k), deadOf: (t) => ({ conversationId: t, sessionKey: 'claude:' + t, name: t }), isArchived: (k) => R.isArchived(k) });
      const ask = (t) => { let r = null; const p = V['conversations.archive']({ target: t }, { caller: { conversationId: 'c-0', sessionKey: 'claude:c-0' }, keyId: 'k-1', reach: () => ({ ok: true, by: 'opener' }), scopes: [] }); p.then((x) => { r = x; }, (e) => { r = { threw: String(e && e.message || e) }; }); return { p, now: () => r }; };
      const a1 = ask('c-5'); await new Promise((r) => setTimeout(r, 15)); g.land(); await a1.p;
      call(R, 'patch', '/api/user-state', { body: { archivedFolders: ['/unrelated'] } });   // an unrelated change…
      g.land(false);                                                                           // …whose write the storage refuses (kept, owed)
      const a2 = ask('c-5'); await new Promise((r) => setTimeout(r, 15));
      const out = { first: a1.now(), again: a2.now() };
      g.land(); await a2.p.catch(() => { });
      return out;
    };
    const AL = await alreadyScene(() => require(path.join(REPO, PREL)), 'real');
    ok(AL.first && AL.first.archived === true && AL.again && AL.again.code === 'already_archived', '⑭m «already archived» is judged from the landed list: with an unrelated write owed and failing, asking again answers already_archived AT ONCE', AL);
    const ALR_A = "        if (holds(userStateOut().archivedSessions) && (inFlight === undefined || holds(inFlight && inFlight.archivedSessions))) return { ok: true, already: true, landed: Promise.resolve(true) };\n";
    ok(PSRC.split(ALR_A).length === 2, 'control setup: the «already» road is found once');
    const ALX = await alreadyScene(() => mutantCopies('swc-pl-alreadywaits', REPO).load(PREL, anchored(PSRC, ALR_A, "        if (holds(userStateOut().archivedSessions) && (inFlight === undefined || holds(inFlight && inFlight.archivedSessions))) return { ok: true, already: true, landed: landedOf(userStateHold) };   // MUTANT: waits on what the store owes now\n", 'pl-already-waits')), 'alreadywaits');
    ok(ALX.again === null, 'CONTROL (the «already» road waiting on what the store owes now, in a copy): the verb gives no answer for an archive that IS on disk while an unrelated write fails (red)', ALX);

    // (n) THE NOT-DURABLE REPLY IS THE ROUTE'S OWN DOING (r1053 (5)): RED — a copy whose answer after the landing ignores the verdict
    const ANS_OK_A = "  const answerAfter = (hold, res, ok200) => hold.after((ok) => { exitSafe(res); if (ok) ok200(); else notOnDisk(res, hold); });\n";
    ok(PSRC.split(ANS_OK_A).length === 2, 'control setup: the doors\' answer after the landing is found once');
    const XN = await lawScene(() => mutantCopies('swc-pl-ignoreok', REPO).load(PREL, anchored(PSRC, ANS_OK_A, "  const answerAfter = (hold, res, ok200) => hold.after(() => { exitSafe(res); ok200(); });   // MUTANT: the landing's verdict ignored\n", 'pl-ignore-ok')), 'ignoreok');
    ok(XN.fail.status === 200, 'CONTROL (the doors\' answer ignoring the landing\'s verdict, in a copy): a write the storage refused is answered 200 «saved» (red) — the 503 not-durable is the route\'s own', XN.fail);

    // (o) THE IMPORT'S THREE UNHAPPY ROADS (r1053 (5)): a store not on disk; the groups not on disk (the tasks section's EVSNOTONDISK);
    // a wrong passphrase — each answered only once the stores the import wrote before it are settled, each by its own code
    const PAGE_HEADERS = { host: '127.0.0.1:1', origin: 'http://127.0.0.1:1', 'sec-fetch-site': 'same-origin' };   // the owner's page (the person verdict reads these; no request is made)
    const impScene = async (kind) => {
      const d = scratchDir('swc-pl-imp-' + kind); roots.push(d); seed(d);
      const g = gatedWriter();
      const P0 = fresh(() => require(path.join(REPO, PREL)));
      P0.setup({ dataDir: d, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, writer: g.W,
        getTasks: () => ({ unreadRefusal: () => null, importBundle: () => { throw Object.assign(new Error('the groups are not on disk yet (a stand-in)'), { code: 'EVSNOTONDISK' }); } }) });
      const R = P0.router;
      call(R, 'get', '/api/user-state');
      const sections = { userState: { customNames: { 'claude:i': 'imported' } }, ...(kind === 'tasks' ? { tasks: { tasks: {} } } : {}) };
      const body = { file: { app: 'vibespace-config', sections, ...(kind === 'pass' ? { sensitive: 'not-a-sealed-bundle' } : {}) }, sections: Object.keys(sections), ...(kind === 'pass' ? { includeSensitive: ['claudeCreds'], passphrase: 'wrong' } : {}) };
      const r = call(R, 'post', '/api/config/import', { body, headers: PAGE_HEADERS });
      const before = r.answered;
      g.land(kind !== 'store');
      return { kind, before, answered: r.answered, status: r.status, code: r.body && r.body.code, error: r.body && r.body.error && String(r.body.error).slice(0, 80), notOnDisk: r.body && r.body.notOnDisk };
    };
    const I1 = await impScene('store'), I2 = await impScene('tasks'), I3 = await impScene('pass');
    ok(!I1.before && I1.answered && I1.status === 503 && I1.code === 'not-durable' && J(I1.notOnDisk) === J(['user-state.json'])
      && !I2.before && I2.answered && I2.status === 503 && I2.notOnDisk === true
      && !I3.before && I3.answered && I3.status === 400 && /passphrase/i.test(I3.error || ''),
      '⑭o THE IMPORT\'S THREE UNHAPPY ROADS — a store not on disk (503 not-durable, named), the groups not on disk (503 EVSNOTONDISK), a wrong passphrase (400): none answered before the stores it wrote settled', { I1, I2, I3 });

    // (p) THE NUMBER (r1053 (4)): the conversation list's bytes and their making at the produce, on the main thread, for a stand-in of a
    // hub with thousands of conversations — printed (the line quotes it)
    {
      const d = scratchDir('swc-pl-size'); roots.push(d);
      const N = 5000, keyOf = (i) => `claude:${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;
      const big = { customNames: {}, sessionConfigs: {}, sessionModes: {}, starredSessions: [], archivedSessions: [], sessionGroups: {}, groupFolders: {} };
      for (let i = 0; i < N; i++) { const k = keyOf(i); big.customNames[k] = `conversation ${i} — a name of an ordinary length`; big.sessionConfigs[k] = { model: 'opus', effort: 'high', accountId: 'acct-' + (i % 7) }; if (i % 10 === 0) big.starredSessions.push(k); }
      for (let i = N; i < N * 5; i++) big.archivedSessions.push(keyOf(i));
      for (let gi = 0; gi < 40; gi++) big.sessionGroups['group ' + gi] = Array.from({ length: 100 }, (_, j) => keyOf((gi * 100 + j) % N));
      fs.writeFileSync(path.join(d, 'user-state.json'), J(big));
      const g = gatedWriter();
      let made = null;
      // (the making's MAIN-THREAD CPU time — the bytes are made on the main thread; a CPU reading, never a wall clock: a fast suite judges no
      // wall-clock span, and this one is printed only)
      const W2 = { ...g.W, dirty: (f, o) => { const c0 = process.threadCpuUsage(); const b = o.produce(); const c = process.threadCpuUsage(c0); const bytes = (Array.isArray(b) ? b : [b]).reduce((a, x) => a + Buffer.byteLength(x), 0); made = { cpuMs: Math.round((c.user + c.system) / 100) / 10, mb: Math.round(bytes / 1048576 * 100) / 100 }; g.W.dirty(f, { ...o, produce: () => b }); } };
      const R = setupP(fresh(() => require(path.join(REPO, PREL))), d, W2, [], []);
      call(R, 'get', '/api/user-state');
      R.setCustomName(keyOf(1), 'renamed');
      console.log(`  ⊙ ⑭p THE NUMBER: the conversation list of ${N} conversations (${N * 4} archived, ${N} configs, 40 groups of 100): ${made ? made.mb : '?'} MB made at the produce in ${made ? made.cpuMs : '?'} ms of main-thread CPU`);
      ok(!!made && made.mb > 0, '⑭p the conversation list\'s produce measured at a hub-sized stand-in (printed: its bytes and its making on the main thread)', made);
    }

    // (q) r1054 (7): THE RENAME VERB tells «renamed» once the list holding the name is on disk (as «archived»); not on disk ⇒ not-durable.
    // RED: the verb's wait cut (in a copy)
    const renameScene = async (COm, tag) => {
      const d = scratchDir('swc-pl-rename-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R = setupP(fresh(() => require(path.join(REPO, PREL))), d, g.W, [], []);
      call(R, 'get', '/api/user-state');
      const activeSessions = new Map([['sess-7', { backend: 'claude', backendSessionId: 'c-7', name: 'old', mode: 'chat' }]]);
      const deps = { activeSessions, setCustomName: (k, n) => R.setCustomName(k, n), writeSessionMeta: () => { }, readSessionMeta: () => null, broadcastActiveSessions: () => { }, getSessionKey: (x) => `${x.backend}:${x.backendSessionId}` };
      COm.provide({ rename: (data) => COm.renameSession(deps, data) });
      const V = COm.automationVerbs({ activeSessions, nameLanded: (k, n) => R.nameLanded(k, n) });
      const ask = (name) => { let r = null; const p = Promise.resolve(V['conversations.rename']({ target: 'c-7', name }, { caller: { conversationId: 'c-0', sessionKey: 'claude:c-0' }, keyId: 'k-1', reach: () => ({ ok: true, by: 'opener' }), scopes: [] })); p.then((x) => { r = x; }, (e) => { r = { threw: String(e && e.message || e) }; }); return { p, now: () => r }; };
      const tick = () => new Promise((r) => setTimeout(r, 15));
      const out = {};
      const a1 = ask('new name'); await tick(); out.inFlight = a1.now(); g.land(); await a1.p; out.landed = a1.now();
      out.onDisk = (disk(d, 'user-state.json').customNames || {})['claude:c-7'] || null;
      const a2 = ask('third name'); await tick(); g.land(false); await a2.p; out.refused = a2.now();
      g.land();
      COm.provide({ rename: undefined });
      return out;
    };
    const RN = await renameScene(CO, 'real');
    ok(RN.inFlight === null && RN.landed && RN.landed.ok === true && RN.landed.name === 'new name' && RN.onDisk === 'new name' && RN.refused && RN.refused.code === 'not-durable',
      '⑭q THE RENAME VERB (r1054 (7)): no answer while the list holding the name is in flight; «renamed» at its landing (on disk); a refused write ⇒ not-durable by name', RN);
    const REN_A = "      if (typeof nameLanded !== 'function' || !key) return done;\n";
    ok(COSRC.split(REN_A).length === 2, 'control setup: the rename verb\'s wait for the landing is found once');
    const RNX = await renameScene(mutantCopies('swc-pl-renamenow', REPO).load(COREL, anchored(COSRC, REN_A, "      return done;   // MUTANT: the verb's wait cut\n", 'pl-rename-now')), 'renamenow');
    ok(RNX.inFlight && RNX.inFlight.ok === true, 'CONTROL (the rename verb\'s wait cut, in a copy): «renamed» told while the list holding the name is not on disk (red)', RNX.inFlight);

    // (r) r1054 (8): A START READ WHOSE FLUSH LEAVES THE FILE UNWRITTEN starts the store HELD — the old bytes are never taken as its state.
    // RED: the flush's result ignored (the store hold, in a copy loaded in its place)
    const restartScene = async (tag) => {
      const d = scratchDir('swc-pl-restart-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R1 = setupP(fresh(() => require(path.join(REPO, PREL))), d, g.W, [], []);
      call(R1, 'get', '/api/user-state');
      R1.setCustomName('claude:r-1', 'kept in memory');   // owed to the writer, never landed
      const leftW = { ...g.W, pending: () => true, flushSync: (files) => ({ written: [], left: (files || []).map((f) => ({ file: f, why: 'held by the storage (a stand-in)' })) }) };
      const R2 = setupP(fresh(() => require(path.join(REPO, PREL))), d, leftW, [], []);   // a suite's restart in the same process
      const got = call(R2, 'get', '/api/user-state');
      return { status: got.status, code: got.body && got.body.code, names: got.body && got.body.customNames ? Object.keys(got.body.customNames) : null };
    };
    const RS = await restartScene('real');
    // r1092: a flush that THROWS (not only one that leaves the file) starts it held too
    const throwScene = async (tag) => {
      const d = scratchDir('swc-pl-throwflush-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R1 = setupP(fresh(() => require(path.join(REPO, PREL))), d, g.W, [], []);
      call(R1, 'get', '/api/user-state'); R1.setCustomName('claude:r-2', 'kept in memory');
      const throwW = { ...g.W, pending: () => true, flushSync: () => { throw Object.assign(new Error('the storage refused the flush (a stand-in)'), { code: 'EIO' }); } };
      const R2 = setupP(fresh(() => require(path.join(REPO, PREL))), d, throwW, [], []);
      const got = call(R2, 'get', '/api/user-state');
      return { status: got.status, code: got.body && got.body.code };
    };
    const RT = await throwScene('real');
    ok(RT.status === 503 && RT.code === 'store_unread', '⑭r …and a flush that THROWS starts the store HELD as well (what it owes is set before the call)', RT);
    ok(RS.status === 503 && RS.code === 'store_unread', '⑭r a start read whose flush LEAVES the file unwritten starts the store HELD (503 store_unread) — the older bytes on disk are never served as the list', RS);
    const LEFT_A = "    if (leftHere) {\n      started = true;\n";
    ok(SHSRC.split(LEFT_A).length === 2, 'control setup: the start read\'s check of its flush is found once');
    const holdL = mutantCopies('swc-pl-leftignored', REPO).load(SHREL, anchored(SHSRC, LEFT_A, "    if (false && leftHere) {   // MUTANT: the flush's result ignored\n      started = true;\n", 'pl-left-ignored'));
    const savedHold2 = require.cache[SHP];
    let RSX;
    try { require.cache[SHP] = { id: SHP, filename: SHP, loaded: true, exports: holdL, children: [], paths: [] }; RSX = await restartScene('leftignored'); }
    finally { if (savedHold2) require.cache[SHP] = savedHold2; else delete require.cache[SHP]; }
    ok(RSX.status === 200 && Array.isArray(RSX.names) && !RSX.names.includes('claude:r-1'), 'CONTROL (the flush\'s result ignored, in a copy): the restart serves the OLDER bytes on disk as the list — the change the process still owed is gone from it (red)', RSX);
    const OWED_A = "        owedHere = true;   // (r1092: set BEFORE the call — a flush that throws must not leave the old bytes read as the store's state)\n        const r = w.flushSync([file]);\n";
    ok(SHSRC.split(OWED_A).length === 2, 'control setup: what the start read owes, set before its flush, is found once');
    const holdT = mutantCopies('swc-pl-owedafter', REPO).load(SHREL, anchored(SHSRC, OWED_A, "        const r = w.flushSync([file]); owedHere = true;   // MUTANT: set after the call\n", 'pl-owed-after'));
    const savedHold3 = require.cache[SHP];
    let RTX;
    try { require.cache[SHP] = { id: SHP, filename: SHP, loaded: true, exports: holdT, children: [], paths: [] }; RTX = await throwScene('owedafter'); }
    finally { if (savedHold3) require.cache[SHP] = savedHold3; else delete require.cache[SHP]; }
    ok(RTX.status === 200, 'CONTROL (what it owes set AFTER the flush call, in a copy): a flush that throws leaves the OLDER bytes read as the list (red)', RTX);

    // (s) r1092 — THE LAW WHOLE: a door that tells «done» answers at once ONLY when the disk and what is owed agree. The archive verb: the
    // conversation archived ON DISK, the person's UN-ARCHIVE in flight, then an agent's archive — no reply while in flight, «archived»
    // at the landing, and the disk holds it. RED: the reply from the landed list alone («already», nothing written)
    const unarchScene = async (load, tag) => {
      const d = scratchDir('swc-pl-unarch-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      call(R, 'get', '/api/user-state');
      const V = CO.automationVerbs({ activeSessions: new Map(), archive: (k) => R.archiveSession(k), deadOf: (t) => ({ conversationId: t, sessionKey: 'claude:' + t, name: t }), isArchived: (k) => R.isArchived(k) });
      const ask = (t) => { let r = null; const p = V['conversations.archive']({ target: t }, { caller: { conversationId: 'c-0', sessionKey: 'claude:c-0' }, keyId: 'k-1', reach: () => ({ ok: true, by: 'opener' }), scopes: [] }); p.then((x) => { r = x; }, (e) => { r = { threw: String(e && e.message || e) }; }); return { p, now: () => r }; };
      const tick = () => new Promise((r) => setTimeout(r, 15));
      R.archiveSession('claude:c-6'); g.land();                                        // archived ON DISK
      call(R, 'patch', '/api/user-state', { body: { archivedSessions: [] } });         // the person's un-archive: in flight
      const a = ask('c-6'); await tick();
      const out = { inFlight: a.now() };
      g.land(); g.land(); await a.p;
      out.answer = a.now(); out.onDisk = disk(d, 'user-state.json').archivedSessions.includes('claude:c-6');
      return out;
    };
    const UA = await unarchScene(() => require(path.join(REPO, PREL)), 'real');
    ok(UA.inFlight === null && UA.answer && UA.answer.ok === true && UA.answer.archived === true && UA.onDisk === true,
      '⑭s THE LAW WHOLE (r1092): archived on disk, the person\'s un-archive in flight, then the agent\'s archive — no reply while in flight, «archived» at the landing, the disk holds it (the archive WRITTEN, never «already» over an owed un-archive)', UA);
    const UAR_A = "      if (holds(list)) {\n        const inFlight = userStateHold.inFlight();\n";
    ok(PSRC.split(UAR_A).length === 2, 'control setup: the archive\'s agree check is found once');
    const UAX = await unarchScene(() => mutantCopies('swc-pl-landedonly', REPO).load(PREL, anchored(PSRC, UAR_A, "      if (holds(userStateOut().archivedSessions)) return { ok: true, already: true, landed: Promise.resolve(true) };   // MUTANT: the landed list alone\n      if (holds(list)) {\n        const inFlight = userStateHold.inFlight();\n", 'pl-landed-only')), 'landedonly');
    ok(UAX.inFlight && UAX.inFlight.code === 'already_archived' && UAX.onDisk === false, 'CONTROL (the reply from the landed list alone, in a copy): «already archived» at once and NOTHING written — the un-archive lands and the disk no longer holds the archive the agent was told of (red)', UAX);

    // (t) THE SAME FOR THE NAME: the landed name A, a rename to B in flight, then the verb renames back to A — no reply until its own
    // write lands, the disk holds A. RED: «renamed» from the landed name alone
    const nameBackScene = async (load, tag) => {
      const d = scratchDir('swc-pl-nameback-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      call(R, 'get', '/api/user-state');
      const activeSessions = new Map([['sess-8', { backend: 'claude', backendSessionId: 'c-8', name: 'A', mode: 'chat' }]]);
      const deps = { activeSessions, setCustomName: (k, n) => R.setCustomName(k, n), writeSessionMeta: () => { }, readSessionMeta: () => null, broadcastActiveSessions: () => { }, getSessionKey: (x) => `${x.backend}:${x.backendSessionId}` };
      CO.provide({ rename: (data) => CO.renameSession(deps, data) });
      const V = CO.automationVerbs({ activeSessions, nameLanded: (k, n) => R.nameLanded(k, n) });
      const tick = () => new Promise((r) => setTimeout(r, 15));
      R.setCustomName('claude:c-8', 'A'); g.land();      // the landed name A
      R.setCustomName('claude:c-8', 'B');                // a rename to B: in flight
      let got = null; const p = Promise.resolve(V['conversations.rename']({ target: 'c-8', name: 'A' }, { caller: { conversationId: 'c-0', sessionKey: 'claude:c-0' }, keyId: 'k-1', reach: () => ({ ok: true, by: 'opener' }), scopes: [] })); p.then((x) => { got = x; });
      await tick();
      const out = { inFlight: got };
      g.land(); g.land(); await p;
      out.answer = got; out.onDisk = (disk(d, 'user-state.json').customNames || {})['claude:c-8'] || null;
      CO.provide({ rename: undefined });
      return out;
    };
    const NB = await nameBackScene(() => require(path.join(REPO, PREL)), 'real');
    ok(NB.inFlight === null && NB.answer && NB.answer.ok === true && NB.onDisk === 'A', '⑭t THE SAME FOR THE NAME: the landed name A, a rename to B in flight, the verb renames back to A — no reply until its own write lands, then «renamed»; the disk holds A', NB);
    const NBR_A = "    try { const inFlight = userStateHold.inFlight(); agree = nameIn(userStateOut()) === v && nameIn(readUserState()) === v && (inFlight === undefined || nameIn(inFlight) === v); } catch { agree = false; }\n";
    ok(PSRC.split(NBR_A).length === 2, 'control setup: the name\'s agree check is found once');
    const NBX = await nameBackScene(() => mutantCopies('swc-pl-namelanded', REPO).load(PREL, anchored(PSRC, NBR_A, "    try { agree = nameIn(userStateOut()) === v; } catch { agree = false; }   // MUTANT: the landed name alone\n", 'pl-name-landed')), 'namelanded');
    ok(NBX.inFlight && NBX.inFlight.ok === true, 'CONTROL (the landed name alone, in a copy): «renamed» told while the write of that name is still behind another one in flight (red)', NBX.inFlight);

    // (u) THE WAKE'S OWN REFUSAL says an un-archive not saved yet («archived; its un-archive is not saved yet»): the real src/server/
    // delivery-wake.js over the real router's readers. RED: the words cut (in a copy)
    const DWREL = 'src/server/delivery-wake.js', DWSRC = fs.readFileSync(path.join(REPO, DWREL), 'utf8');
    const wakeWordsScene = async (DWm, tag) => {
      const d = scratchDir('swc-pl-wakewords-' + tag); roots.push(d); seed(d);
      const g = gatedWriter();
      const R = setupP(fresh(() => require(path.join(REPO, PREL))), d, g.W, [], []);
      call(R, 'get', '/api/user-state');
      R.archiveSession('claude:c-11'); g.land();
      call(R, 'patch', '/api/user-state', { body: { archivedSessions: [] } });   // the person's un-archive: in flight
      const wk = DWm.create({ resumeLine: { submit: () => ({ ok: false, code: 'stand-in-line' }) }, seams: { keyOf: () => ({ sessionKey: 'claude:c-11' }), isArchived: (k) => R.isArchived(k), unarchiveOwed: (k) => R.unarchiveOwed(k), rowOf: () => ({}) }, getStashHandover: () => null });
      const a = await wk.onEndedWake('c-11', {});
      g.land();
      const b = await wk.onEndedWake('c-11', {});
      return { a, b };
    };
    const WW = await wakeWordsScene(require(path.join(REPO, DWREL)), 'real');
    ok(WW.a && WW.a.code === 'archived' && WW.a.why === 'archived; its un-archive is not saved yet' && WW.b && WW.b.code === 'stand-in-line',
      '⑭u the wake\'s own refusal while the person\'s un-archive is not on disk says so («archived; its un-archive is not saved yet»); once it lands, the wake goes on to the line', WW);
    const WW_A = "typeof seams.unarchiveOwed === 'function' && seams.unarchiveOwed(key) ?";
    ok(DWSRC.split(WW_A).length === 2, 'control setup: the wake\'s un-archive words are found once');
    const WWX = await wakeWordsScene(mutantCopies('swc-pl-wakewords', REPO).load(DWREL, anchored(DWSRC, WW_A, "false ?", 'pl-wake-words')), 'cut');
    ok(WWX.a && WWX.a.code === 'archived' && WWX.a.why === 'it is archived', 'CONTROL (the words cut, in a copy): the refusal says only «it is archived» while the person\'s page shows it un-archived (red)', WWX.a);

    // (i)–(k) B-0248 (a)+(b): THE DESKTOPS AND THEIR ROLLBACK POINTS — the release's 500 ms debounce kept, then an act; R10 by LANDING
    const L0 = { current: null, autoSave: null, saved: {}, customGrids: [], desktopMeta: [{ id: 'd0', name: 'One' }, { id: 'd1', name: 'Two' }], desktops: { d0: { autoSave: { windows: [{ winId: 'w0' }, { winId: 'w1' }, { winId: 'w2' }] } }, d1: { autoSave: { windows: [{ winId: 'w3', x: 0 }] } } } };
    const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
    const tick2 = () => new Promise((r) => setImmediate(() => setImmediate(r)));   // the next turn's hand-off (setImmediate) — exact, never a wall clock
    const layScene = async (load, tag) => {
      const d = scratchDir('swc-pl-lay-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const out = {};
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);   // a window closed: its rollback point, then the desktops
      R.writeLayouts(shape);
      await sleepMs(60); out.pointInFlight = g.inFlight(); out.layoutsAt60 = g.W.pending(LF);
      R.flushLayouts(); out.layoutsAfterDebounce = g.W.pending(LF);   // the debounce's own flush (its timing is THE BOUND's leg below): the point is not on disk yet
      g.land(); out.layoutsAfterPoint = g.W.pending(LF);                // the point landed, its header in flight
      g.land(); out.layoutsAfterHead = g.W.pending(LF);                 // the header landed: the desktops handed now
      g.land();
      out.order = g.log().slice(0, 3).map((f) => (/\.meta\.json$/.test(f) ? 'header' : /^layout-/.test(f) ? 'point' : f));
      out.onDisk = JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d0.autoSave.windows.map((w) => w.winId);
      const geo = JSON.parse(J(shape)); geo.desktops.d1.autoSave.windows[0].x = 40;   // a GEOMETRY change: no point
      R.writeLayouts(geo);
      await sleepMs(150); out.geoAt150 = g.W.pending(LF);   // (margins wide enough for a busy runner: 150 ms under the 500, 400 over it)
      await sleepMs(750); out.geoAt900 = g.W.pending(LF);
      g.land(); out.geoOnDisk = JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d1.autoSave.windows[0].x;
      return out;
    };
    const LY = await layScene(() => require(path.join(REPO, PREL)), 'real');
    ok(LY.pointInFlight >= 1 && LY.layoutsAt60 === false && LY.layoutsAfterDebounce === false && LY.layoutsAfterPoint === false && LY.layoutsAfterHead === true && J(LY.order) === J(['point', 'header', 'layouts.json']) && J(LY.onDisk) === J(['w1', 'w2']),
      '⑭i R10 BY LANDING: a window closed — its rollback point handed at the next turn; at the release\'s 500 ms debounce the desktops are NOT handed while the point (then its header) is not on disk; they land third: point, header, layouts.json', LY);
    ok(LY.geoAt150 === false && LY.geoAt900 === true && LY.geoOnDisk === 40, '⑭i THE BOUND: a window moved is handed to the writer at the release\'s own 500 ms debounce (not at 150 ms, by 900 ms) — the paced write waits no longer than the release\'s', { at150: LY.geoAt150, at900: LY.geoAt900, onDisk: LY.geoOnDisk });
    const WAIT_A = "    if (!pointsLeftUpTo(upTo)) { landLayouts(f); return; }\n";
    ok(PSRC.split(WAIT_A).length === 2, 'control setup: the desktops\' wait for their points is found once');
    const LYX = await layScene(() => mutantCopies('swc-pl-nowaitpoints', REPO).load(PREL, anchored(PSRC, WAIT_A, "    landLayouts(f); return;   // MUTANT: the desktops handed without waiting for their points\n", 'pl-no-wait-points')), 'nowait');
    ok(LYX.layoutsAfterDebounce === true, 'CONTROL (the desktops handed without waiting for their points, in a copy): layouts.json is handed while its rollback point is not on disk (red)', LYX);
    const DEB_A = "    _layoutsSaveTimer = setTimeout(flushLayouts, 500);\n  }\n";
    ok(PSRC.split(DEB_A).length === 2, 'control setup: writeLayouts\' 500 ms debounce is found once');
    const LYD = await layScene(() => mutantCopies('swc-pl-debounce1s', REPO).load(PREL, anchored(PSRC, DEB_A, "    _layoutsSaveTimer = setTimeout(flushLayouts, 1000);   // MUTANT: a debounce of 1 s\n  }\n", 'pl-debounce-1s')), 'debounce1s');
    ok(LYD.geoAt900 === false, 'CONTROL (a debounce of 1 s, in a copy): a window moved is NOT handed by 900 ms — past the release\'s 500 ms bound (red)', { at900: LYD.geoAt900 });

    // (j) THE LOOP NO LONGER WAITS for the desktops: the real store writer, 300 ms placed in each main-thread rename / fsync — RED: the
    // release's write at the call (in a copy)
    const layLoop = async (load, tag) => {
      const d = scratchDir('swc-pl-layloop-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const w = SW.create({ log: quiet, graceMs: 5000 });
      const R = setupP(fresh(load), d, w, [], []);
      R.readLayouts();
      const oRen = fs.renameSync, oFsync = fs.fsyncSync;
      fs.renameSync = function (a, ...r) { if (String(a).startsWith(d)) Atomics.wait(SAB, 0, 0, STALL); return oRen.call(this, a, ...r); };
      fs.fsyncSync = function (...r) { Atomics.wait(SAB, 0, 0, STALL); return oFsync.apply(this, r); };
      let last = performance.now(), gap = 0, on = true;
      const tick = () => { const t = performance.now(); if (t - last > gap) gap = t - last; last = t; if (on) setTimeout(tick, 1); };
      setTimeout(tick, 1);
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
      let onDisk = null;
      try {
        R.writeLayouts(shape);
        for (let i = 0; i < 300; i++) { await sleepMs(10); try { onDisk = JSON.parse(oReadFile(LF)).desktops.d0.autoSave.windows.length; } catch { onDisk = null; } if (onDisk === 2) break; }   // a wait for WHAT HAPPENED: the desktops on disk
      } finally { fs.renameSync = oRen; fs.fsyncSync = oFsync; on = false; }
      await sleepMs(5);
      const hd = path.join(d, 'layout-history'); const points = fs.existsSync(hd) ? fs.readdirSync(hd).filter((f) => !f.endsWith('.meta.json')).length : 0;
      try { w.stop(); } catch { }
      return { gap: Math.round(gap), onDisk, points };
    };
    const oReadFile = (f) => fs.readFileSync(f, 'utf8');
    const LL = await layLoop(() => require(path.join(REPO, PREL)), 'real');
    console.log(`  ⊙ ⑭j the loop's longest turn with ${STALL} ms placed in each main-thread rename / fsync, a window closed (its point and the desktops): ${LL.gap} ms`);
    const OWE_A = "    try { layoutsHold.owe(f.doc, { name: 'layouts.write', bytes: () => { _producedSeq = f.seq; return f.text; } }); }\n";   // (B-225b's remainder: the producer records which bytes the writer took)
    ok(PSRC.split(OWE_A).length === 2, 'control setup: the desktops\' hand-off to the writer is found once');
    const LLX = await layLoop(() => mutantCopies('swc-pl-layatcall', REPO).load(PREL, anchored(PSRC, OWE_A, "    try { layoutsHold.write(f.doc, f.text); }   // MUTANT: the release's write at the call\n", 'pl-layouts-at-call')), 'atcall');
    const HP_A = "  function handPoint(p, done, late) {\n    const w = storeW();\n";
    ok(PSRC.split(HP_A).length === 2, 'control setup: the point\'s hand-off is found once');
    const LLP = await layLoop(() => mutantCopies('swc-pl-pointsatcall', REPO).load(PREL, anchored(PSRC, HP_A, "  function handPoint(p, done, late) {\n    { fs.mkdirSync(path.dirname(p.pointFile), { recursive: true }); for (const [f, t] of [[p.pointFile, p.pointText], [p.metaFile, p.metaText]]) { const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, t); fs.renameSync(tmp, f); } done(true); return; }   // MUTANT: the release's points at the call\n    const w = storeW();\n", 'pl-points-at-call')), 'pointsatcall');
    console.log(`  ⊙ ⑭j the reds' own figures: the desktops at the call ${LLX.gap} ms, the points at the call ${LLP.gap} ms; the tree ${LL.gap} ms`);
    // (r1053's rule for a fast suite on a busy machine: judged against the red's own figure, under half of it)
    ok(LL.onDisk === 2 && LL.points === 1 && LL.gap * 2 < Math.min(LLX.gap, LLP.gap), `⑭j the loop no longer waits for the desktops or their point: the longest turn ${LL.gap} ms — under half of each red's own figure (${LLX.gap} / ${LLP.gap} ms); both on disk`, { tree: LL, desktopsAtCall: LLX.gap, pointsAtCall: LLP.gap });
    ok(LLX.gap >= STALL && LLX.onDisk === 2, `CONTROL (the release's write of the desktops at the call, in a copy): the loop is held ${LLX.gap} ms (≥ ${STALL}) by its rename (red)`, LLX);
    ok(LLP.gap >= STALL && LLP.points === 1, `CONTROL (the release's points at the call, in a copy): the loop is held ${LLP.gap} ms (≥ ${STALL}) by the point's renames (red)`, LLP);

    // (k) THE STOP lands a rollback point and the desktops IN ORDER, inside the writer's exit (the server's order: beginExit, the
    // rank-0 pass, the stores' own flushes — flushLayouts({stop}) —, the last pass): RED: the point's chain on a promise (never run
    // inside the exit's one synchronous run)
    const layStop = async (load, tag) => {
      const d = scratchDir('swc-pl-laystop-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const w = SW.create({ log: quiet, graceMs: 5000 });
      const R = setupP(fresh(load), d, w, [], []);
      R.readLayouts();
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
      R.writeLayouts(shape);   // …and the stop at once: before the next turn's drain and before the debounce
      try { w.beginExit(); w.exitFlush({ only: 'rank0' }); R.flushLayouts({ stop: true }); w.exitFlush({ debtMs: 0 }); } catch (e) { return { threw: String(e && e.message || e) }; }
      const hd = path.join(d, 'layout-history');
      const files = fs.existsSync(hd) ? fs.readdirSync(hd) : [];
      const out = { onDisk: JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d0.autoSave.windows.length, points: files.filter((f) => !f.endsWith('.meta.json')).length, heads: files.filter((f) => f.endsWith('.meta.json')).length };
      try { w.stop(); } catch { }
      return out;
    };
    const LS = await layStop(() => require(path.join(REPO, PREL)), 'real');
    ok(LS.onDisk === 2 && LS.points === 1 && LS.heads === 1, '⑭k the stop lands the rollback point, its header and the desktops (the window closed just before it) — all three on disk after the writer\'s exit', LS);
    const PT_A = "    w.durable(p.pointFile, { answer: (ok) => settle(p.pointFile, ok, () => {\n";
    const PT_B = "      w.durable(p.metaFile, { answer: (ok2) => settle(p.metaFile, ok2, () => end(true)) });\n    }) });\n";
    ok(PSRC.split(PT_A).length === 2 && PSRC.split(PT_B).length === 2, 'control setup: the point\'s answer road is found once');
    const LSX = await layStop(() => mutantCopies('swc-pl-pointpromise', REPO).load(PREL, anchored(anchored(PSRC, PT_A, "    w.durable(p.pointFile).then((ok) => settle(p.pointFile, ok, () => {   // MUTANT: a promise's .then\n", 'pl-point-promise-a'), PT_B, "      w.durable(p.metaFile, { answer: (ok2) => settle(p.metaFile, ok2, () => end(true)) });\n    }));\n", 'pl-point-promise-b')), 'promise');
    ok(LSX.onDisk === 3, 'CONTROL (the point\'s chain on a promise, in a copy): at the stop the header and the desktops are never handed — layouts.json keeps the window the person closed (red)', LSX);

    // (v) THE FLUSH'S BYTES ARE MADE AT THE FLUSH (the fresh read's MUST — R10): the writer busy elsewhere makes the desktops' bytes late;
    // meanwhile the socket's apply edits the cache IN PLACE — the desktops that land are the flush's, never the later change (whose
    // own flush waits for its own point). RED: the bytes made from the live object
    const lateScene = async (load, tag) => {
      const d = scratchDir('swc-pl-late-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter({ lateProduce: true });
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const geo = JSON.parse(J(L0)); geo.desktops.d1.autoSave.windows[0].x = 40;
      R.writeLayouts(geo);
      R.flushLayouts();                                        // the debounce's flush: the desktops owed, their bytes not made yet
      R.readLayouts().desktops.d1.autoSave.windows[0].x = 99;  // the socket's apply edits the cache in place (a later change)
      g.land();
      return { x: JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d1.autoSave.windows[0].x };
    };
    const LT = await lateScene(() => require(path.join(REPO, PREL)), 'real');
    ok(LT.x === 40, '⑭v the flush\'s bytes are made AT THE FLUSH: a writer that makes them late lands the desktops the flush saw (x 40), never the later in-place change (x 99) that its own flush, after its own point, writes', LT);
    const LTX = await lateScene(() => mutantCopies('swc-pl-livebytes', REPO).load(PREL, anchored(PSRC, OWE_A, "    try { layoutsHold.owe(f.doc, { name: 'layouts.write', bytes: (v) => JSON.stringify(v, null, 2) }); }   // MUTANT: the bytes from the live object\n", 'pl-live-bytes')), 'livebytes');
    ok(LTX.x === 99, 'CONTROL (the bytes made from the live object, in a copy): the desktops that land hold a later change made after the flush — ahead of that change\'s rollback point (red)', LTX);

    // (w) A FLUSH WAITS ONLY FOR THE POINTS HANDED UP TO ITS OWN CALL (the fresh read's should — never starved by shape changes in a
    // row): a point handed after the flush does not hold it. RED: every outstanding point counted
    const seqScene = async (load, tag) => {
      const d = scratchDir('swc-pl-seq-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const one = JSON.parse(J(L0)); one.desktops.d0.autoSave.windows.splice(0, 1);   // shape change 1: point 1
      let flushed = null; R.writeLayouts(one); await tick2();
      const p1 = g.flying().find((f) => /layout-history/.test(f));
      R.flushLayouts({}, (ok) => { flushed = ok; });           // the flush: it waits for point 1
      const two = JSON.parse(J(one)); two.desktops.d0.autoSave.windows.splice(0, 1);   // shape change 2: point 2, after the flush
      R.writeLayouts(two); await tick2();
      g.landOnly((f) => f === p1); g.landOnly((f) => /\.meta\.json$/.test(f) && f.startsWith(p1.replace(/\.json$/, '')));   // point 1 and its header land; point 2 still in flight
      return { handedWhilePoint2: g.W.pending(LF), point2InFlight: g.flying().some((f) => /layout-history/.test(f) && f !== p1), flushed };
    };
    const SQ = await seqScene(() => require(path.join(REPO, PREL)), 'real');
    ok(SQ.point2InFlight === true && SQ.handedWhilePoint2 === true, '⑭w a flush waits only for the points handed up to its own call: with point 1 landed and a LATER change\'s point 2 still in flight, the desktops are handed', SQ);
    const SEQ_A = "  const pointsLeftUpTo = (upTo) => { for (const id of _pointsOutIds) if (id <= upTo && !_pointsLate.has(id)) return true; return false; };\n";
    ok(PSRC.split(SEQ_A).length === 2, 'control setup: the flush\'s own mark is found once');
    const SQX = await seqScene(() => mutantCopies('swc-pl-allpoints', REPO).load(PREL, anchored(PSRC, SEQ_A, "  const pointsLeftUpTo = (upTo) => _pointsOutIds.size > 0;   // MUTANT: every outstanding point counted\n", 'pl-all-points')), 'allpoints');
    ok(SQX.handedWhilePoint2 === false, 'CONTROL (every outstanding point counted, in a copy): the desktops wait for a later change\'s point — shape changes in a row would starve them (red)', SQX);

    // (x) A STORE NOT THERE whose exclusive create the STORAGE refuses is KEPT on the hold's ladder (owed, said for a press) — never
    // dropped, never «appeared». RED: the storage's refusal answered as nothing kept
    const firstScene = async (load, tag) => {
      const d = scratchDir('swc-pl-first-' + tag); roots.push(d); seed(d);   // NO layouts.json
      const g = gatedWriter();
      const sent = [];
      const P0 = fresh(load);
      P0.setup({ dataDir: d, wss: { clients: new Set([{ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, writer: g.W });
      const R = P0.router;
      R.readLayouts();
      R.writeLayouts(JSON.parse(J(L0)));
      const wf = fs.writeFileSync, op = fs.openSync;
      fs.writeFileSync = function (f, ...a) { if (/layouts\.json\.\d+\.tmp$/.test(String(f))) throw Object.assign(new Error('EIO: a stand-in refused write'), { code: 'EIO' }); return wf.call(this, f, ...a); };
      fs.openSync = function (f, ...a) { if (/layouts\.json\.\d+\.tmp$/.test(String(f))) throw Object.assign(new Error('EIO: a stand-in refused write'), { code: 'EIO' }); return op.call(this, f, ...a); };   // r5185: the door opens its temp
      let landed = null;
      try { R.flushLayouts({ press: true }, (ok) => { landed = ok; }); } finally { fs.writeFileSync = wf; fs.openSync = op; }
      const held = call(R, 'get', '/api/stores/held');
      return { landed, unsaved: (held.body && held.body.unsaved || []).map((u) => u.file), said: sent.filter((x) => x.type === 'store-unsaved').map((x) => x.file) };
    };
    const FS1 = await firstScene(() => require(path.join(REPO, PREL)), 'real');
    ok(FS1.landed === false && J(FS1.unsaved) === J(['layouts.json']) && J(FS1.said) === J(['layouts.json']), '⑭x layouts.json NOT THERE and its first write refused by the storage (EIO): KEPT on the hold\'s ladder — owed, said at once for the press, listed as unsaved; never dropped, never «appeared»', FS1);
    // RED: the hold's keep cut (the store hold, in a copy loaded in its place) — the refused create throws to the flush, which drops it
    const FIRST_A = "      else if (!flush(() => [next, bytes])) { accepted?.(); return false; }\n";
    const SHREL_X = 'src/store-hold.js', SHSRC_X = fs.readFileSync(path.join(REPO, SHREL_X), 'utf8'), SHP_X = require.resolve(path.join(REPO, SHREL_X));
    ok(SHSRC_X.split(FIRST_A).length === 2, 'control setup: the hold\'s keep of a write refused at the call is found once');
    const holdFirstX = mutantCopies('swc-pl-firstdropped', REPO).load(SHREL_X, anchored(SHSRC_X, FIRST_A, "      else write(next, bytes);   // MUTANT: the storage's refusal thrown to the flush\n", 'pl-first-dropped'));
    const savedHoldX = require.cache[SHP_X];
    let FSX;
    try { require.cache[SHP_X] = { id: SHP_X, filename: SHP_X, loaded: true, exports: holdFirstX, children: [], paths: [] }; FSX = await firstScene(() => require(path.join(REPO, PREL)), 'dropped'); }
    finally { if (savedHoldX) require.cache[SHP_X] = savedHoldX; else delete require.cache[SHP_X]; }
    ok(FSX.landed === false && FSX.unsaved.length === 0 && FSX.said.length === 0, 'CONTROL (the storage\'s refusal answered as nothing kept, in a copy): the first desktops are neither owed nor said — a restart reads NOT THERE (red)', FSX);
    // RED (the second fresh read's small): the kept road's own answer cut — the hold asks a writer that owes nothing, which says «landed»
    const KEPT_A = "    if (owed && owed.produce) { if (press && owed.rung !== 'said') say(); answer(false); return; }\n";
    ok(SHSRC_X.split(KEPT_A).length === 2, 'control setup: the answer while the hold\'s own ladder owes is found once');
    const holdKeptX = mutantCopies('swc-pl-keptanswer', REPO).load(SHREL_X, anchored(SHSRC_X, KEPT_A, "    /* MUTANT: the kept road's answer cut */\n", 'pl-kept-answer'));
    let FKX;
    try { require.cache[SHP_X] = { id: SHP_X, filename: SHP_X, loaded: true, exports: holdKeptX, children: [], paths: [] }; FKX = await firstScene(() => require(path.join(REPO, PREL)), 'keptanswer'); }
    finally { if (savedHoldX) require.cache[SHP_X] = savedHoldX; else delete require.cache[SHP_X]; }
    ok(FKX.landed === true, 'CONTROL (the kept road\'s answer cut, in a copy): a first create the storage refused is answered «landed» — a restore would say «restored» over it (red)', FKX);

    // (y) A ROLLBACK POINT THE STORAGE REFUSES is LET GO (the release dropped it): said once, its header never handed, its bytes never
    // kept; the desktops' write goes on. RED: the failed point kept owed
    const failPointScene = async (load, tag) => {
      const d = scratchDir('swc-pl-failpt-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const warns = []; const cw = console.warn; console.warn = (...a) => warns.push(a.join(' '));
      let out;
      try {
        const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
        R.writeLayouts(shape); await tick2();
        const pf = g.flying().find((f) => /layout-history/.test(f));
        g.landOnly((f) => f === pf, false);                   // the storage refuses the point
        R.flushLayouts();                                     // the debounce's flush: the desktops' write goes on
        out = { pointOwed: g.W.pending(pf), header: g.flying().some((f) => /\.meta\.json$/.test(f)), handed: g.W.pending(LF), said: warns.filter((l) => /snapshot FAILED/.test(l)).length };
      } finally { console.warn = cw; }
      return out;
    };
    const FP = await failPointScene(() => require(path.join(REPO, PREL)), 'real');
    ok(FP.pointOwed === false && FP.header === false && FP.handed === true && FP.said === 1, '⑭y a rollback point the storage refuses is LET GO (no longer owed, its header never handed), said once, and the desktops\' write goes on', FP);
    const FORGET_A = "      try { w.forget(file); } catch { /* the writer's */ }\n";
    ok(PSRC.split(FORGET_A).length === 2, 'control setup: the failed point\'s release is found once');
    const FPX = await failPointScene(() => mutantCopies('swc-pl-keepfailed', REPO).load(PREL, anchored(PSRC, FORGET_A, "      /* MUTANT: the failed point kept owed */\n", 'pl-keep-failed')), 'keep');
    ok(FPX.pointOwed === true, 'CONTROL (the failed point kept owed, in a copy): its bytes — a whole layouts copy — stay owed for the life of the process (red)', FPX);

    // (z) A READ AGAIN WHOLE ends every flush still waiting (the fresh read's small): a file that appeared meanwhile — no waiter tells
    // «landed» for a change that was not made. RED: the generation's check cut
    const genScene = async (load, tag) => {
      const d = scratchDir('swc-pl-gen-' + tag); roots.push(d); seed(d);   // NO layouts.json at the start
      const LF = path.join(d, 'layouts.json');
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      R.writeLayouts(JSON.parse(J(L0))); await tick2();
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
      R.writeLayouts(shape); await tick2();                 // point 1 in flight: the first flush waits for it
      let a = null, b = null;
      R.flushLayouts({}, (ok) => { a = ok; });
      // a second shape change: point 2 — the second flush waits for ITS OWN mark (two waiting flushes, never one shared: ⑭ad)
      const shape2 = JSON.parse(J(shape)); shape2.desktops.d0.autoSave.windows.splice(0, 1);
      R.writeLayouts(shape2);
      R.flushLayouts({ press: true }, (ok) => { b = ok; });
      fs.writeFileSync(LF, J({ ...L0, desktopMeta: [{ id: 'd9', name: 'appeared' }] }));   // a file appears (a late mount)
      for (let i = 0; i < 6; i++) g.land();
      return { a, b, onDisk: JSON.parse(fs.readFileSync(LF, 'utf8')).desktopMeta.map((m) => m.id) };
    };
    const GN = await genScene(() => require(path.join(REPO, PREL)), 'real');
    ok(GN.a === false && GN.b === false && J(GN.onDisk) === J(['d9']), '⑭z a file that appeared while two flushes waited (each for its own point): BOTH answer not landed (the change was not made — read again whole), the file that appeared kept', GN);
    const GEN_A = "    if (f.gen !== _layoutsGen) return done(false);   // read again WHOLE meanwhile (a file appeared, a hold lifted): this change was not made\n";
    ok(PSRC.split(GEN_A).length === 2, 'control setup: the flush\'s generation check is found once');
    const GNX = await genScene(() => mutantCopies('swc-pl-nogen', REPO).load(PREL, anchored(PSRC, GEN_A, "      /* MUTANT: the generation's check cut */\n", 'pl-no-gen')), 'nogen');
    ok(GNX.b === true, 'CONTROL (the generation\'s check cut, in a copy): the second waiter writes its stale desktops over the file that appeared and answers «landed» for a restore that was dropped (red)', GNX);

    // (aa) A WRITE ONLY QUEUED PAST THE WRITER'S BOUND (the second fresh read's should): the restore door's 503 says it is QUEUED, by
    // name — never «could not be written (write failed)» — and the page-facing fact keeps the code «queued»; it lifts at its landing.
    // RED: the code dropped (the queued answer owed with no code)
    const holdIn = async (shx, run) => { const saved = require.cache[SHP_X]; try { require.cache[SHP_X] = { id: SHP_X, filename: SHP_X, loaded: true, exports: shx, children: [], paths: [] }; return await run(); } finally { if (saved) require.cache[SHP_X] = saved; else delete require.cache[SHP_X]; } };
    const queuedScene = async (load, tag) => {
      const d = scratchDir('swc-pl-queued-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter(); const told = [];
      const R = setupP(fresh(load), d, g.W, told, []);
      R.readLayouts();
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
      R.writeLayouts(shape); await tick2();
      for (let i = 0; i < 4 && g.flying().length; i++) g.land();   // the point and its header land
      R.flushLayouts(); for (let i = 0; i < 4 && g.flying().length; i++) g.land();
      const pt = R.listLayoutHistory()[0];
      const out = call(R, 'post', '/api/layout-history/:id/restore', { body: { rid: 'r-q' }, params: { id: pt.id } });
      await tick2();
      for (let i = 0; i < 4 && g.flying().some((f) => /layout-history/.test(f)); i++) g.landOnly((f) => /layout-history/.test(f));   // the restore's own point
      g.timeout((f) => f === LF);                                 // the writer's bound passes: layouts.json still queued
      await tick2();
      const restored = told.find((x) => x.type === 'layout-restored' && x.rid === 'r-q');
      const unsavedWords = told.filter((x) => x.type === 'store-unsaved');
      g.land();                                                   // it lands
      return { status: out.status, body: out.body, restoredUnsaved: restored && restored.unsaved, unsavedWords, saved: told.filter((x) => x.type === 'store-saved').length };
    };
    const QD = await queuedScene(() => require(path.join(REPO, PREL)), 'real');
    ok(QD.status === 503 && QD.body && QD.body.code === 'store_unsaved' && /layouts\.json is not on disk yet \(its write is still queued behind the storage\)/.test(QD.body.error) && !/could not be written/.test(QD.body.error)
      && QD.body.unsaved && QD.body.unsaved.code === 'queued' && QD.restoredUnsaved && QD.restoredUnsaved.code === 'queued' && QD.unsavedWords.length === 1 && QD.unsavedWords[0].code === 'queued' && QD.saved === 1,
      '⑭aa a restore whose write is only QUEUED past the writer\'s bound: 503 by name, said as queued (never «could not be written»), the page-facing fact keeps the code «queued» (the answer, its broadcast, the word), lifted at its landing', QD);
    const QCODE_A = "code: nd.code || (queued ? 'queued' : null),";
    ok(SHSRC_X.split(QCODE_A).length === 2, 'control setup: the queued answer\'s code is found once');
    const QDX = await holdIn(mutantCopies('swc-pl-queuednocode', REPO).load(SHREL_X, anchored(SHSRC_X, QCODE_A, "code: nd.code || null,   /* MUTANT: the queued code dropped */", 'pl-queued-nocode')), () => queuedScene(() => require(path.join(REPO, PREL)), 'nocode'));
    ok(QDX.status === 503 && /could not be written \(write failed\)/.test(QDX.body.error) && QDX.body.unsaved.code === null, 'CONTROL (the queued answer owed with no code, in a copy): the restore says «could not be written (write failed)» for a write only queued, and the pages get no code (red)', { error: QDX.body && QDX.body.error, unsaved: QDX.body && QDX.body.unsaved });

    // (ab) THE DESKTOPS WAIT FOR THEIR POINTS WITHIN ONE BOUND (主开发 r1353, the one design): a point only QUEUED past the writer's
    // bound no longer holds them — the desktops are handed; the late point stays handed, lands when it can, its header after it;
    // nothing let go, no «FAILED». REDs: the late release cut (waited for with no end: the desktops never handed); the wait again cut
    const queuedPointScene = async (load, tag, gw = {}) => {
      const d = scratchDir('swc-pl-qpt-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter(gw);
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const warns = []; const cw = console.warn; console.warn = (...a) => warns.push(a.join(' '));
      try {
        const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
        R.writeLayouts(shape); await tick2();
        const pf = g.flying().find((f) => /layout-history/.test(f) && !/\.meta\.json$/.test(f));
        R.flushLayouts();                                           // the debounce's flush: it waits for the point (within its bound)
        const handedInBound = g.W.pending(LF);
        g.timeout((f) => f === pf);                                 // the writer's bound passes: the point is only late
        const handedPastBound = g.W.pending(LF);
        g.landOnly((f) => f === LF);                                // the desktops land (the point still in flight)
        const desktopsLanded = J(JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d0.autoSave.windows.map((w) => w.winId));
        g.landOnly((f) => f === pf); g.landOnly((f) => /\.meta\.json$/.test(f));   // the late point lands, then its header
        return { handedInBound, handedPastBound, desktopsLanded, pointOnDisk: !!pf && fs.existsSync(pf), headerOnDisk: !!pf && fs.existsSync(pf.replace(/\.json$/, '.meta.json')), said: warns.filter((l) => /snapshot FAILED/.test(l)).length, order: g.log() };
      } finally { console.warn = cw; }
    };
    const QP = await queuedPointScene(() => require(path.join(REPO, PREL)), 'real');
    ok(QP.handedInBound === false && QP.handedPastBound === true && QP.desktopsLanded === J(['w1', 'w2']) && QP.pointOnDisk === true && QP.headerOnDisk === true && QP.said === 0,
      '⑭ab within ONE bound: the desktops wait for their point while it is merely slow; past the writer\'s bound (the point only late) they are handed and land — the late point stays handed, lands after, its header after it; nothing let go, no «FAILED»', QP);
    const LATE_A = "        late();\n        let inCall = true, overAtOnce = false;\n";
    ok(PSRC.split(LATE_A).length === 2, 'control setup: the late point\'s release is found once');
    const QPU = await queuedPointScene(() => mutantCopies('swc-pl-nolate', REPO).load(PREL, anchored(PSRC, LATE_A, "        let inCall = true, overAtOnce = false;   // MUTANT: the late release cut (waited for with no end)\n", 'pl-no-late')), 'nolate');
    ok(QPU.handedPastBound === false, 'CONTROL (the late release cut — the point waited for with no end, in a copy): past the bound the desktops are still not handed; a stalled storage would hold them unwritten and unsaid (red)', QPU);
    const REWAIT_A = "      if (why && why.why === 'queued' && !_layoutsStopping) {\n        late();\n        let inCall = true, overAtOnce = false;\n        w.durable(file, { answer: (ok2) => { if (inCall && !ok2) { overAtOnce = true; return; } settle(file, ok2, then); } });\n        inCall = false;\n        if (!overAtOnce) return;\n      }\n";
    ok(PSRC.split(REWAIT_A).length === 2, 'control setup: the late point\'s wait again is found once');
    const QPX = await queuedPointScene(() => mutantCopies('swc-pl-norewait', REPO).load(PREL, anchored(PSRC, REWAIT_A, "      /* MUTANT: the wait again cut */\n", 'pl-no-rewait')), 'norewait');
    ok(QPX.handedPastBound === true && QPX.pointOnDisk === false && QPX.said === 1, 'CONTROL (the point\'s wait again cut, in a copy): a point only late is let go as refused — never on disk, «FAILED» said (red)', QPX);
    // (ak) THE STOP'S SIGNAL NOTED IS NOT THE EXIT (the cure's read, its should): a point late inside the stop's hand-over wait (the writer
    // still writes) is waited for again — never forgotten, never unlinked after it lands. RED: the signal's note read as the exit
    const QK = await queuedPointScene(() => require(path.join(REPO, PREL)), 'signal', { signalled: true });
    ok(QK.handedPastBound === true && QK.pointOnDisk === true && QK.headerOnDisk === true && QK.said === 0, '⑭ak the stop\'s signal noted (the writer still writing) is not the exit: a point late then is waited for again and lands, its header after it — nothing forgotten', QK);
    const SIG_A = "      if (why && why.why === 'queued' && !_layoutsStopping) {\n";
    ok(PSRC.split(SIG_A).length === 2, 'control setup: only the stop\'s flush means exiting — found once');
    const QKX = await queuedPointScene(() => mutantCopies('swc-pl-signalexit', REPO).load(PREL, anchored(PSRC, SIG_A, "      if (why && why.why === 'queued' && !_layoutsStopping && !(typeof w.exitStartedAt === 'function' && w.exitStartedAt() != null)) {   // MUTANT: the signal's note read as the exit\n", 'pl-signal-exit')), 'signalexit', { signalled: true });
    ok(QKX.pointOnDisk === false && QKX.said === 1, 'CONTROL (the signal\'s note read as the exit, in a copy): a point late inside the hand-over wait is forgotten — never on disk (red)', QKX);
    // (al) A WAIT AGAIN THE WRITER ANSWERS «NOT ON DISK» AT ONCE is given up (its exit's last pass is over): let go and said, the desktops
    // handed — never a recursion. RED: the give-up cut (the wait again answers into itself until the stack is gone)
    const overScene = async (load, tag) => {
      const d = scratchDir('swc-pl-over-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const warns = []; const cw = console.warn; console.warn = (...a) => warns.push(a.join(' '));
      try {
        const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
        R.writeLayouts(shape); await tick2();
        const pf = g.flying().find((f) => /layout-history/.test(f) && !/\.meta\.json$/.test(f));
        R.flushLayouts();
        g.exitOver();
        let threw = null;
        try { g.timeout((f) => f === pf); } catch (e) { threw = String((e && e.message) || e).slice(0, 80); }
        return { threw, handed: g.W.pending(LF), said: warns.filter((l) => /snapshot FAILED/.test(l)).length };
      } finally { console.warn = cw; }
    };
    const OV = await overScene(() => require(path.join(REPO, PREL)), 'real');
    ok(OV.threw === null && OV.handed === true && OV.said === 1, '⑭al a wait again the writer answers «not on disk» AT ONCE (its exit is over) is given up: the point let go and said, the desktops handed, no recursion', OV);
    const GIVE_A = "        w.durable(file, { answer: (ok2) => { if (inCall && !ok2) { overAtOnce = true; return; } settle(file, ok2, then); } });\n";
    ok(PSRC.split(GIVE_A).length === 2, 'control setup: the give-up at once is found once');
    const OVX = await overScene(() => mutantCopies('swc-pl-nogiveup', REPO).load(PREL, anchored(PSRC, GIVE_A, "        w.durable(file, { answer: (ok2) => settle(file, ok2, then) });   // MUTANT: no give-up at once\n", 'pl-no-giveup')), 'nogiveup');
    ok(typeof OVX.threw === 'string' && /call stack/i.test(OVX.threw), 'CONTROL (the give-up cut, in a copy): the wait again answers into itself — the stack overflows (red)', OVX);

    // (am) A DROPPED CHANGE REPLIES «APPEARED» (r1478, round wg6jz85ye): a door past its bound whose change a read again WHOLE dropped
    // meanwhile (a file appeared where the start found none) is answered UNMARKED — its door says the appeared refusal (409), no
    // «queued» word, nothing owed. RED: the generation's check at the bound cut (the dropped change marked owed: 503 «queued»)
    const dropScene = async (load, tag) => {
      const d = scratchDir('swc-pl-drop-' + tag); roots.push(d); seed(d);   // NO layouts.json at the start
      const LF = path.join(d, 'layouts.json'), HD = path.join(d, 'layout-history');
      fs.mkdirSync(HD, { recursive: true }); fs.writeFileSync(path.join(HD, 'layout-x.json'), J({ at: 1, layouts: L0 }));   // a rollback point to restore
      const g = gatedWriter(); const told = [];
      const R = setupP(fresh(load), d, g.W, told, []);
      R.readLayouts();
      R.writeLayouts(JSON.parse(J(L0))); await tick2();
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
      R.writeLayouts(shape); await tick2();                       // point 1 in flight
      const p1 = g.flying().find((f) => /layout-history/.test(f) && !/\.meta\.json$/.test(f));
      R.flushLayouts();                                            // an autosave: it waits for point 1
      const out = call(R, 'post', '/api/layout-history/:id/restore', { body: { rid: 'r-drop' }, params: { id: 'layout-x.json' } });   // the door waits for its own point(s)
      fs.writeFileSync(LF, J({ ...L0, desktopMeta: [{ id: 'd9', name: 'appeared' }] }));   // a file appears (a late mount)
      g.landOnly((f) => f === p1); g.landOnly((f) => /\.meta\.json$/.test(f) && f.startsWith(p1.replace(/\.json$/, '')));   // the autosave meets the appeared file: read again WHOLE
      g.fireBounds((w) => w === 'door');                          // the door's bound: its change was dropped meanwhile
      const held = call(R, 'get', '/api/stores/held');
      return { status: out.status, code: out.body && out.body.code, words: told.filter((x) => x.type === 'store-unsaved').length, unsaved: (held.body && held.body.unsaved) || [], onDisk: JSON.parse(fs.readFileSync(LF, 'utf8')).desktopMeta.map((m) => m.id) };
    };
    const DP = await dropScene(() => require(path.join(REPO, PREL)), 'real');
    ok(DP.status === 409 && DP.code === 'store_appeared' && DP.words === 0 && DP.unsaved.length === 0 && J(DP.onDisk) === J(['d9']), '⑭am a door past its bound whose change a read again whole dropped replies the «appeared» refusal (409) — unmarked: no «queued» word, nothing owed, the appeared file kept', DP);
    const DGEN_A = "      if (gen === _layoutsGen) {\n";
    ok(PSRC.split(DGEN_A).length === 2, 'control setup: the door\'s generation check at its bound is found once');
    const DPX = await dropScene(() => mutantCopies('swc-pl-dropmarked', REPO).load(PREL, anchored(PSRC, DGEN_A, "      if (true) {   // MUTANT: the generation's check at the bound cut\n", 'pl-drop-marked')), 'dropmarked');
    ok(DPX.status === 503 && DPX.words === 1, 'CONTROL (the generation\'s check at the bound cut, in a copy): a dropped change is marked owed and «queued» — the door says «kept, written by itself» for a change that will never be written (red)', DPX);

    // (an) EVERY REPLY IS HANDED — THE WAITING COUNTER's ONE DECREMENT (r1478, round wg6jz85ye): a door past its bound is counted until
    // landLayouts hands its flush (no landing lifts a mark meanwhile); a road that ended a door's flush elsewhere would keep «not saved»
    // up for ever. The pin: ONE `_doorsWaiting--`, inside the reply's `handed`; ONE `.handed()` call, landLayouts' own over every reply;
    // flushLayouts never answers a flush itself. REDs (planted in copies): a road answering outside landLayouts; a second decrement
    const handedPin = (src) => {
      const body = (name) => { const i = src.indexOf('function ' + name + '('); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); };
      const fl = body('flushLayouts'), ll = body('landLayouts'), ba = body('boundedAnswer');
      return (src.match(/_doorsWaiting--/g) || []).length === 1 && /once\.handed = \(\) => \{[^\n]*_doorsWaiting--/.test(ba)
        && (src.match(/\.handed\(\)/g) || []).length === 1 && /for \(const a of f\.answers\) if \(a && typeof a\.handed === 'function'\) a\.handed\(\);/.test(ll)
        && (fl.match(/\banswer\(/g) || []).length === 0;
    };
    ok(handedPin(PSRC), '⑭an every reply is handed: the waiting counter has ONE decrement (the reply\'s handed), called ONCE (landLayouts over every reply), and flushLayouts never answers a flush itself — every road ends in landLayouts');
    const HND_A = "    if (answer) answer = boundedAnswer(answer, press, _layoutsGen);\n";
    const planted1 = anchored(PSRC, HND_A, HND_A + "    if (stop && answer && !_layoutsCache) { answer(true); return; }   // PLANTED: a road answering a flush outside landLayouts\n", 'handed-road');
    const planted2 = anchored(PSRC, "    if (f.gen !== _layoutsGen) return done(false);", "    if (f.gen !== _layoutsGen) { _doorsWaiting--; return done(false); }   // PLANTED: a second decrement", 'handed-twice');
    ok(!handedPin(planted1) && !handedPin(planted2), 'CONTROL (planted in a copy\'s text): a road that answers a flush outside landLayouts, and a second decrement of the counter — each red');

    // (ac) THE OWED WORDS LIFT ONLY AT A LANDING THAT LEAVES NOTHING NEWER OWED (the first fresh read's small; the second's should: its
    // leg): a press said «unsaved», then two changes; the first lands while the second is still owed — no «saved» until the second lands.
    // RED: lifted at any landing
    const liftScene = async (shx, tag) => holdIn(shx, async () => {
      const d = scratchDir('swc-pl-lift-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter(); const told = [];
      const R = setupP(fresh(() => require(path.join(REPO, PREL))), d, g.W, told, []);
      R.readLayouts();
      const geo = (x) => { const v = JSON.parse(J(L0)); v.desktops.d1.autoSave.windows[0].x = x; return v; };
      const W2 = (t) => told.filter((x) => x.type === t).length;
      R.writeLayouts(geo(1)); R.flushLayouts({ press: true }, () => { });
      g.land(false);                                              // refused: owed, said at once for the press
      const saidAtRefusal = W2('store-unsaved');
      R.writeLayouts(geo(2)); R.flushLayouts();                   // in flight (the writer's write again carries it)
      R.writeLayouts(geo(3)); R.flushLayouts();                   // owed behind it
      g.landOnly((f) => f === LF);
      const savedAtFirst = W2('store-saved');
      g.landOnly((f) => f === LF);
      return { saidAtRefusal, savedAtFirst, savedAtLast: W2('store-saved'), x: JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d1.autoSave.windows[0].x };
    });
    const LIFT = await liftScene(require(SHP_X), 'real');
    ok(LIFT.saidAtRefusal === 1 && LIFT.savedAtFirst === 0 && LIFT.savedAtLast === 1 && LIFT.x === 3, '⑭ac the owed words lift only at a landing that leaves nothing newer owed: a landing while a newer write is still owed says no «saved»; the last one does, once', LIFT);
    const LIFT_A = "onWritten: (ok, err) => { if (ok) { tell(); if (!(typeof w.pending === 'function' && w.pending(file))) landed(); } else failedAtWriter(err); } }";
    ok(SHSRC_X.split(LIFT_A).length === 2, 'control setup: the lift\'s check for a newer write is found once');
    const LIFTX = await liftScene(mutantCopies('swc-pl-liftany', REPO).load(SHREL_X, anchored(SHSRC_X, LIFT_A, "onWritten: (ok, err) => { if (ok) { tell(); landed(); } else failedAtWriter(err); } }   /* MUTANT: lifted at any landing */", 'pl-lift-any')), 'liftany');
    ok(LIFTX.savedAtFirst === 1, 'CONTROL (lifted at any landing, in a copy): «saved» is said while a newer write is still owed — a page would flicker «saved» then «unsaved» if it is refused (red)', LIFTX);

    // (ad) ONE WAITING COPY OF THE DESKTOPS A MARK (the second fresh read's small): flushes in a row behind the SAME point (window moves
    // while it is in flight) share one waiting flush — one write handed at its landing, the newest desktops, every answer told.
    // RED: each flush waits with its own copy
    const markScene = async (load, tag) => {
      const d = scratchDir('swc-pl-mark-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
      R.writeLayouts(shape); await tick2();                   // a point in flight
      const pf = g.flying().find((f) => /layout-history/.test(f) && !/\.meta\.json$/.test(f));
      const answers = [];
      for (const x of [11, 12, 13]) { const v = JSON.parse(J(shape)); v.desktops.d1.autoSave.windows[0].x = x; R.writeLayouts(v); R.flushLayouts({}, (ok) => answers.push(ok)); }
      const handedWhileWaiting = g.names.filter((n) => n === 'layouts.write').length;
      g.landOnly((f) => f === pf); g.landOnly((f) => /\.meta\.json$/.test(f));
      const handed = g.names.filter((n) => n === 'layouts.write').length;
      for (let i = 0; i < 4 && g.flying().length; i++) g.land();
      return { handedWhileWaiting, handed, answers, x: JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d1.autoSave.windows[0].x };
    };
    const MK = await markScene(() => require(path.join(REPO, PREL)), 'real');
    ok(MK.handedWhileWaiting === 0 && MK.handed === 1 && J(MK.answers) === J([true, true, true]) && MK.x === 13, '⑭ad three flushes behind the same point share ONE waiting copy of the desktops: one write handed at its landing (the newest desktops), every answer told «landed»', MK);
    const MERGE_A = "    if (q && q.upTo === upTo && q.gen === gen) { q.doc = doc; q.text = text; q.seq = seq; q.press = q.press || press; q.stop = q.stop || stop; if (answer) q.answers.push(answer); return; }\n";   // (B-225b's remainder: the merged flush keeps its bytes' seq)
    ok(PSRC.split(MERGE_A).length === 2, 'control setup: the shared waiting flush is found once');
    const MKX = await markScene(() => mutantCopies('swc-pl-nomerge', REPO).load(PREL, anchored(PSRC, MERGE_A, "    /* MUTANT: each flush waits with its own copy */\n", 'pl-no-merge')), 'nomerge');
    ok(MKX.handed === 3, 'CONTROL (each flush waiting with its own copy, in a copy): three whole copies of the desktops wait and are handed — one for each flush (red)', MKX);

    // (ae) A DOOR'S ANSWER WITHIN ITS BOUND (主开发 r1353 (4); its bound on an INJECTED clock, r1389): a restore whose own rollback point
    // stalls is answered at the door's bound — 503 by name, the store owed and QUEUED (said at once: a press), its broadcast carries it,
    // the desktops still waiting; at the point's own bound they are handed, and their landing says «saved». RED: the door's bound cut
    // (ai) — `older`: an OLDER write lands between the door's bound and its own hand-off (the cure's read, its MUST): no «saved» then
    const doorScene = async (load, tag, { older = false } = {}) => {
      const d = scratchDir('swc-pl-door-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter(); const told = [];
      const R = setupP(fresh(load), d, g.W, told, []);
      R.readLayouts();
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
      R.writeLayouts(shape); await tick2();
      for (let i = 0; i < 4 && g.flying().length; i++) g.land();   // the first point and its header land
      R.flushLayouts(); for (let i = 0; i < 4 && g.flying().length; i++) g.land();
      const pt = R.listLayoutHistory()[0];
      if (older) { const v = JSON.parse(J(shape)); v.desktops.d1.autoSave.windows[0].x = 9; R.writeLayouts(v); R.flushLayouts(); }   // an older autosave in flight
      const out = call(R, 'post', '/api/layout-history/:id/restore', { body: { rid: 'r-door' }, params: { id: pt.id } });
      const pointOut = g.flying().filter((f) => /layout-history/.test(f) && !/\.meta\.json$/.test(f)).length;   // the restore's own point: stalled
      g.fireBounds((w) => w === 'door');                          // the door's bound passes; the point never answered
      const atBound = { answered: out.answered, status: out.status, code: out.body && out.body.code, unsaved: out.body && out.body.unsaved, handed: older ? null : g.W.pending(LF) };
      const restored = told.find((x) => x.type === 'layout-restored' && x.rid === 'r-door');
      const words = told.filter((x) => x.type === 'store-unsaved').map((x) => x.code);
      let savedAtOlder = null;
      if (older) { g.landOnly((f) => f === LF); savedAtOlder = told.filter((x) => x.type === 'store-saved').length; }   // the OLDER write lands
      g.fireBounds((w) => w === 'point');                         // the point's own bound: late — the desktops handed
      const handedAtPointBound = g.W.pending(LF);
      for (let i = 0; i < 8 && g.flying().length; i++) g.land();   // the storage comes back
      return { pointOut, atBound, restoredUnsaved: restored && restored.unsaved, words, savedAtOlder, handedAtPointBound, saved: told.filter((x) => x.type === 'store-saved' && x.file === 'layouts.json').length, pointsSaved: told.filter((x) => x.type === 'store-saved' && x.file === 'layout-history').length, onDisk: JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d0.autoSave.windows.map((w) => w.winId) };
    };
    const DR = await doorScene(() => require(path.join(REPO, PREL)), 'real');
    ok(DR.pointOut >= 1 && DR.atBound.answered === true && DR.atBound.status === 503 && DR.atBound.code === 'store_unsaved' && DR.atBound.unsaved && DR.atBound.unsaved.code === 'queued' && DR.atBound.handed === false
      && DR.restoredUnsaved && DR.restoredUnsaved.code === 'queued' && J(DR.words) === J(['queued']) && DR.handedAtPointBound === true && DR.saved === 1 && DR.pointsSaved === 1 && J(DR.onDisk) === J(['w0', 'w1', 'w2']),
      '⑭ae a restore whose own point stalls is answered at the door\'s bound — 503 «not taken in time» (owed and queued, said at once, its broadcast carries it) while the desktops still wait; at the point\'s bound they are handed, land, and «saved» is said (once for the desktops; the late point\'s own landing clears the rollback points\' episode once — B-225b\'s remainder)', DR);
    const BOUND_A = "    if (answer) answer = boundedAnswer(answer, press, _layoutsGen);\n";
    ok(PSRC.split(BOUND_A).length === 2, 'control setup: the door\'s bound is found once');
    const DRX = await doorScene(() => mutantCopies('swc-pl-nobound', REPO).load(PREL, anchored(PSRC, BOUND_A, "    /* MUTANT: the door's bound cut */\n", 'pl-no-bound')), 'nobound');
    ok(DRX.atBound.answered === false, 'CONTROL (the door\'s bound cut, in a copy): the restore gets NO answer while its point stalls — «Restoring…» for as long as the storage does (red)', DRX.atBound);
    const DO = await doorScene(() => require(path.join(REPO, PREL)), 'older', { older: true });
    ok(DO.atBound.status === 503 && DO.savedAtOlder === 0 && DO.saved === 1 && DO.pointsSaved === 1 && J(DO.onDisk) === J(['w0', 'w1', 'w2']), '⑭ai an OLDER write landing between a door\'s bound and its own hand-off lifts nothing: no «saved» until the door\'s change itself lands (a kill between would lose the restore)', DO);
    const LIFTW_A = "    if (liftWaits && liftWaits()) {";
    ok(SHSRC_X.split(LIFTW_A).length === 2, 'control setup: the lift\'s wait for a door\'s change is found once');
    const DOX = await holdIn(mutantCopies('swc-pl-liftolder', REPO).load(SHREL_X, anchored(SHSRC_X, LIFTW_A, "    if (false) {   /* MUTANT: an older landing lifts the door's mark */", 'pl-lift-older')), () => doorScene(() => require(path.join(REPO, PREL)), 'olderx', { older: true }));
    ok(DOX.savedAtOlder === 1, 'CONTROL (the lift\'s wait cut, in a copy): the OLDER write\'s landing tells every page «saved» while the restore is still not on disk (red)', DOX);
    // (aj) ONE BOUND A POINT, ITS HEADER INSIDE IT (the cure's read, its should): the point landed, its header stalled — at the point's
    // own bound (from its hand-off) the desktops are handed; never a second, fresh bound for the header. RED: the point's own bound cut
    const headerScene = async (load, tag) => {
      const d = scratchDir('swc-pl-head-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
      R.writeLayouts(shape); await tick2();
      const pf = g.flying().find((f) => /layout-history/.test(f) && !/\.meta\.json$/.test(f));
      R.flushLayouts();
      g.landOnly((f) => f === pf);                                // the point lands; its header now in flight, stalled
      const handedAfterPoint = g.W.pending(LF);
      g.fireBounds((w) => w === 'point');                         // the point's ONE bound passes
      return { handedAfterPoint, handedAtBound: g.W.pending(LF), headerInFlight: g.flying().some((f) => /\.meta\.json$/.test(f)) };
    };
    const HB = await headerScene(() => require(path.join(REPO, PREL)), 'real');
    ok(HB.handedAfterPoint === false && HB.handedAtBound === true && HB.headerInFlight === true, '⑭aj one bound a point, its header inside it: the point landed and its header stalled — at the point\'s own bound the desktops are handed', HB);
    const ONEB_A = "    const unbound = onBound(() => late(), 'point');\n";
    ok(PSRC.split(ONEB_A).length === 2, 'control setup: the point\'s own bound is found once');
    const HBX = await headerScene(() => mutantCopies('swc-pl-nopointbound', REPO).load(PREL, anchored(PSRC, ONEB_A, "    const unbound = () => { };   // MUTANT: no bound of its own (each wait its own fresh bound)\n", 'pl-no-point-bound')), 'nopointbound');
    ok(HBX.handedAtBound === false, 'CONTROL (the point\'s own bound cut, in a copy): the header\'s stall holds the desktops past the point\'s bound — a second, fresh bound (red)', HBX);

    // (af) AT A STOP (主开发 r1353 (5)): the desktops are handed in the round after their point's — at the point's own write (landed or
    // not), never behind its header's; a point only late is never waited for again once stopping (the exit's pass is the last write).
    // REDs: the stop's release cut (the desktops wait for the header); the exit's guard cut (a late point waited for again)
    const stopPointScene = async (load, tag, how) => {
      const d = scratchDir('swc-pl-stoppt-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const warns = []; const cw = console.warn; console.warn = (...a) => warns.push(a.join(' '));
      try {
        const shape = JSON.parse(J(L0)); shape.desktops.d0.autoSave.windows.splice(0, 1);
        R.writeLayouts(shape); await tick2();
        const pf = g.flying().find((f) => /layout-history/.test(f) && !/\.meta\.json$/.test(f));
        R.flushLayouts({ stop: true });                             // the hub's stop flush: the point not tried yet
        const handedAtStop = g.W.pending(LF);
        if (how === 'land') g.landOnly((f) => f === pf);            // the exit's pass tries the point: it lands (its header now owed)
        else g.timeout((f) => f === pf);                            // …or its bound passes, still queued
        return { handedAtStop, handedAfterPoint: g.W.pending(LF), headerInFlight: g.flying().some((f) => /\.meta\.json$/.test(f)), pointOwed: !!pf && g.W.pending(pf), said: warns.filter((l) => /snapshot FAILED/.test(l)).length };
      } finally { console.warn = cw; }
    };
    const SP = await stopPointScene(() => require(path.join(REPO, PREL)), 'real', 'land');
    ok(SP.handedAtStop === false && SP.handedAfterPoint === true && SP.headerInFlight === true, '⑭af at the stop the desktops are handed in the round after their point\'s write — the point landed, its header still to come: the desktops go with it, never behind it', SP);
    const SGQ = await stopPointScene(() => require(path.join(REPO, PREL)), 'realq', 'queued');
    ok(SGQ.handedAfterPoint === true && SGQ.pointOwed === false && SGQ.said === 1, '⑭af at the stop a point still queued is not waited for again (the exit\'s pass is the last write): let go and said, the desktops handed', SGQ);
    const STOP_A = "      if (_layoutsStopping) late();   // (5) AT A STOP: its write was tried in the exit's pass, landed or not — the desktops go in the round after it\n";
    ok(PSRC.split(STOP_A).length === 2, 'control setup: the stop\'s release is found once');
    const SPX = await stopPointScene(() => mutantCopies('swc-pl-nostoprelease', REPO).load(PREL, anchored(PSRC, STOP_A, "      /* MUTANT: the stop's release cut */\n", 'pl-no-stop-release')), 'nostop', 'land');
    ok(SPX.handedAfterPoint === false, 'CONTROL (the stop\'s release cut, in a copy): the desktops wait behind the header\'s write — one exit round more, and none at all for a point the exit never answers (red)', SPX);
    const STOPQ_A = "      if (why && why.why === 'queued' && !_layoutsStopping) {\n";
    const SGX = await stopPointScene(() => mutantCopies('swc-pl-stoprewait', REPO).load(PREL, anchored(PSRC, STOPQ_A, "      if (why && why.why === 'queued') {   // MUTANT: waited for again at the stop\n", 'pl-stop-rewait')), 'stoprewait', 'queued');
    ok(SGX.pointOwed === true && SGX.said === 0, 'CONTROL (waited for again at the stop, in a copy): a queued point keeps the stop\'s desktops behind a wait the exit\'s last pass ends (red)', SGX);

    // (ag) THE IMPORT WAITS FOR THE DESKTOPS IT WROTE (the round's lens 3: a fix with no leg): a config import with a layouts section is
    // answered only once layouts.json landed. RED: the desktops' landing cut from the import's stores
    const importScene = async (load, tag) => {
      const d = scratchDir('swc-pl-imp-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter();
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      const geo = JSON.parse(J(L0)); geo.desktops.d1.autoSave.windows[0].x = 77;   // the same shape: no point
      const imp = call(R, 'post', '/api/config/import', { body: { file: { app: 'vibespace-config', sections: { layouts: geo } }, sections: ['layouts'] } });
      await tick2();
      const before = { answered: imp.answered, handed: g.W.pending(LF) };
      for (let i = 0; i < 4 && g.flying().length; i++) g.land();
      await tick2();
      return { before, answered: imp.answered, status: imp.status, x: JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d1.autoSave.windows[0].x };
    };
    const IM = await importScene(() => require(path.join(REPO, PREL)), 'real');
    ok(IM.before.answered === false && IM.before.handed === true && IM.answered === true && IM.status === 200 && IM.x === 77, '⑭ag a config import with a layouts section is answered only once layouts.json landed (in flight: no answer)', IM);
    const IMP_L = "['layouts', layoutsLanding], ";
    ok(PSRC.split(IMP_L).length === 2, 'control setup: the import\'s desktops landing is found once');
    const IMX = await importScene(() => mutantCopies('swc-pl-impnolayouts', REPO).load(PREL, anchored(PSRC, IMP_L, "/* MUTANT: the desktops' landing cut */ ", 'pl-imp-no-layouts')), 'nolayouts');
    ok(IMX.before.answered === true, 'CONTROL (the desktops\' landing cut from the import, in a copy): the import answers while layouts.json is still in flight (red)', IMX.before);

    // (ah) THE AUTOSAVES NOBODY WAITS ON KEEP ONE WAITER AT A TIME (the round's small; the cure's read: its bound dates the queued mark the
    // stop's journal line names): three debounced flushes, one durable wait; a door's flush its own. RED: one wait at a time cut
    const waiterScene = async (load, tag) => {
      const d = scratchDir('swc-pl-wait-' + tag); roots.push(d); seed(d);
      const LF = path.join(d, 'layouts.json'); fs.writeFileSync(LF, J(L0));
      const g = gatedWriter(); let waits = 0;
      const dur = g.W.durable; g.W.durable = (f, o) => { if (f === LF) waits++; return dur(f, o); };
      const R = setupP(fresh(load), d, g.W, [], []);
      R.readLayouts();
      for (const x of [5, 6, 7]) { const v = JSON.parse(J(L0)); v.desktops.d1.autoSave.windows[0].x = x; R.writeLayouts(v); R.flushLayouts(); }   // three autosaves
      const auto = waits;
      R.flushLayouts({}, () => { });
      const door = waits - auto;
      for (let i = 0; i < 4 && g.flying().length; i++) g.land();
      return { auto, door, x: JSON.parse(fs.readFileSync(LF, 'utf8')).desktops.d1.autoSave.windows[0].x };
    };
    const WT = await waiterScene(() => require(path.join(REPO, PREL)), 'real');
    ok(WT.auto === 1 && WT.door === 1 && WT.x === 7, '⑭ah the autosaves nobody waits on keep ONE durable wait at a time (its bound dates the queued mark the stop\'s line names); a flush that carries an answer has its own', WT);
    const SKIP_A = "      if (_autosaveWaiting) return;\n";
    ok(PSRC.split(SKIP_A).length === 2, 'control setup: the autosaves\' one wait is found once');
    const WTX = await waiterScene(() => mutantCopies('swc-pl-autowait', REPO).load(PREL, anchored(PSRC, SKIP_A, "      /* MUTANT: every autosave waits */\n", 'pl-auto-wait')), 'autowait');
    ok(WTX.auto === 3, 'CONTROL (one wait at a time cut, in a copy): every debounced autosave keeps a 60 s durable wait nobody reads (red)', WTX);

    // (e) THE STOP lands every store moved here: the REAL writer's exit (beginExit + exitFlush) right after three acts, before any landing
    const stopScene = async (load, tag) => {
      const d = scratchDir('swc-pl-stop-' + tag); roots.push(d); seed(d);
      const w = SW.create({ log: quiet, graceMs: 5000 });
      const R = setupP(fresh(load), d, w, [], []);
      call(R, 'get', '/api/user-state'); call(R, 'get', '/api/bookmarks'); call(R, 'get', '/api/custom-themes');
      await new Promise((r) => w.durable(path.join(d, 'user-state.json'), { answer: r }));
      R.setCustomName('claude:s', 'stop');
      call(R, 'post', '/api/bookmarks', { body: [{ label: 'S', path: '/s' }] });
      call(R, 'post', '/api/custom-themes', { body: { name: 'stop', css: { '--s': '1' } } });
      try { w.beginExit(); w.exitFlush(); } catch (e) { return { threw: String(e && e.message || e) }; }
      const out = { name: disk(d, 'user-state.json').customNames['claude:s'] || null, bm: disk(d, 'bookmarks.json').map((x) => x.label), th: Object.keys(disk(d, 'custom-themes.json')) };
      try { w.stop(); } catch { }
      return out;
    };
    const SR1 = await stopScene(() => require(path.join(REPO, PREL)), 'real');
    ok(SR1.name === 'stop' && J(SR1.bm) === J(['S']) && J(SR1.th) === J(['stop']), '⑭e the stop lands every store moved here: a rename, a bookmarks save and a theme save made just before it are on disk after the writer\'s exit flush', SR1);
    const KEEP_A = "    try { return userStateHold.owe(st, { name: 'user-state.write', bytes: userStateBytes, accepted: () => { _userStateCache = st; _userStateFacts.commit(draft); } }); }\n";
    ok(PSRC.split(KEEP_A).length === 2, 'control setup: the list\'s hand-off to the writer is found once');
    const XE = await stopScene(() => mutantCopies('swc-pl-memory', REPO).load(PREL, anchored(PSRC, KEEP_A, "    try { userStateHold.set(st); _userStateCache = st; _userStateFacts.commit(draft); return false; }   // MUTANT: kept in memory only\n", 'pl-memory-only')), 'memory');
    ok(XE.name === null, 'CONTROL (the change kept in memory only, in a copy): the stop lands nothing of it — the rename is lost (red)', XE);
  } finally { for (const d of roots) fs.rmSync(d, { recursive: true, force: true }); }
}

CHK.report();
