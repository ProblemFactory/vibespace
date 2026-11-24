#!/usr/bin/env node
// test-browser-registry-held — data/browser-profiles.json under the store-read law (lane bl-jobs, the remainder of B-f276, 主开发 00:38Z).
// The release's load read the registry in one try: ANY failure but an absent file started from an EMPTY registry, and the boot's
// first commit wrote that empty registry over every profile, run record, pin, lease, lineage row and login fence — and every reader
// that acts on an ABSENCE (the kept sweep, Housekeeping's orphans, a build's removal, the orphan census, the pin heal) acted on it.
// Now a failed read — and bytes that are not a registry — HOLD the store: nothing is written over the file, the acts refuse by name
// (`store_unread`), the absence-readers wait or fail closed, the file is read again off the loop, and the read runs the boot's path
// once. FAST, in-process: a real keeper over a scratch data folder (no browser is started), each leg against a copy that cuts it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const D = scratch('browser-registry-held'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
process.on('exit', () => { try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
const MJ = mutantCopies('browser-registry-held', ROOT);
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const plant = (F, body) => { if (asRoot) fs.mkdirSync(F); else { fs.writeFileSync(F, body); fs.chmodSync(F, 0o000); } };
// round wm6qxcqcw (4): a leg root cannot make red (root reads a 000 file — the stand-in is a folder, which no save's rename replaces)
// is SKIPPED BY NAME under root, never green by an early true
const rootSkip = (name) => console.log(`  ○ SKIPPED under root (by name, never a green): ${name} — root reads a 000 file, so the stand-in is a folder no save can replace`);
const unplant = (F, body) => { if (asRoot) { fs.rmdirSync(F); fs.writeFileSync(F, body); } else fs.chmodSync(F, 0o644); };
const bodyOf = (F) => { try { return fs.statSync(F).isDirectory() ? '(a folder)' : (fs.chmodSync(F, 0o644), fs.readFileSync(F, 'utf8')); } catch (e) { return '(' + e.code + ')'; } };
const quiet = { log() { }, warn() { }, error() { } };
const BODY = JSON.stringify({ version: 1, profiles: [{ id: 'bp-0000b001', label: 'work', provider: 'chromium', dir: '/var/empty/vs-work-profile', createdAt: 1 }], pins: { 'vs-bk-aaaaaaaaaaaa': { profileId: 'bp-0000b001', origin: 'chosen', at: 1 } }, leases: [], browsers: {} });
const KSRC = fs.readFileSync(path.join(ROOT, 'src/server/browser-keeper.js'), 'utf8');
const codeOf = async (fn) => { try { await fn(); return 'answered'; } catch (e) { return (e && e.code) || 'threw'; } };
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

console.log('§1 an UNREADABLE registry is HELD — nothing written over it, the acts refused by name, the boot judges nothing, the read lifts it');
{
  const scene = async (Mod, name, { lift = true } = {}) => {
    const d = path.join(D, name), H = path.join(d, 'home'); fs.mkdirSync(H, { recursive: true });
    const F = path.join(d, 'browser-profiles.json'); plant(F, BODY);
    const k = Mod.create({ dataDir: d, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, install: false, log: quiet, unreadRetry: { firstMs: 15, maxMs: 30 } });
    const out = { held: k.held ? k.held() : false, words: k.heldWords ? String(k.heldWords() || '') : '' };
    out.create = await codeOf(() => k.createProfile({ label: 'new one', provider: 'chromium' }));
    out.registered = await codeOf(() => k.profileDirRegistered('/var/empty/vs-work-profile'));
    out.attach = await codeOf(() => k.attach({ profileId: 'bp-0000b001', browserKey: 'vs-bk-aaaaaaaaaaaa' }));   // checkpoint 60's cure: by name, never «no profile»
    out.pin = (() => { try { return k.pinForCreate({ priorKey: 'vs-bk-aaaaaaaaaaaa', resume: true }); } catch (e) { return { threw: e && e.code }; } })();
    // piece 6 (browsers.stop) meets this law: the running browsers and the manager's stop refuse by name (never «none runs»)
    out.stopRows = (() => { try { const rows = k.stopRows(); return Array.isArray(rows) ? `listed ${rows.length}` : 'answered'; } catch (e) { return (e && e.code) || 'threw'; } })();
    out.managerStop = await codeOf(() => k.managerStop('bp-0000b001'));   // a refusal's code — or, in a copy without it, the code the stop itself answers
    const b = await k.boot().catch((e) => ({ threw: e && e.message }));
    out.boot = b && b.held ? 'held' : 'ran';
    out.keptWhileHeld = bodyOf(F) === (asRoot ? '(a folder)' : BODY);
    if (!asRoot) fs.chmodSync(F, 0o000);
    let lifts = 0; if (k.onReadAgain) k.onReadAgain(() => { lifts++; });
    if (lift) {
      unplant(F, BODY);
      const keep = setInterval(() => { }, 1000);
      try {
        for (let i = 0; i < 80 && k.held && k.held(); i++) await new Promise((r) => setTimeout(r, 10));
        for (let i = 0; i < 200 && !lifts; i++) await new Promise((r) => setTimeout(r, 10));   // the owed boot, then the waiters
      } finally { clearInterval(keep); }
      await flush();
      out.lifted = !(k.held && k.held()); out.profile = !!(k.profile && k.profile('bp-0000b001')); out.lifts = lifts;
    }
    try { k.shutdown(); } catch { }
    try { require(path.join(ROOT, 'src/store-writer.js')).storeWriter().flushSync(); } catch { }   // lane lg-store-writes (the store writer since U5b met this leg): the owed boot's commit LANDS before the file is read
    out.file = (() => { try { fs.chmodSync(F, 0o644); return JSON.parse(fs.readFileSync(F, 'utf8')).profiles.filter((p) => p && p.id === 'bp-0000b001').length; } catch (e) { return '(' + (e.code || 'unparsed') + ')'; } })();   // the ORIGINAL profile on disk
    out.rewritten = (() => { try { return typeof JSON.parse(fs.readFileSync(F, 'utf8')).host === 'string'; } catch { return false; } })();   // the owed boot's commit stamps the writer
    return out;
  };
  const r = await scene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'held');
  ok(r.held && /could not be read/.test(r.words), 'browser-profiles.json unreadable at load: HELD, and its words say so', r);
  ok(r.create === 'store_unread' && r.registered === 'store_unread' && r.attach === 'store_unread' && r.pin && r.pin.held === true, 'while held a create is refused by name, «is this folder a profile\'s» answers by name (the kept sweep\'s catch then keeps the folder), the create\'s pin ladder answers «held» — never «no longer exists»', r);
  ok(r.boot === 'held', 'the boot judges NOTHING on the held registry (no reconcile, no orphan census, no first commit)', r);
  // checkpoint 60's red cure, ALSO CURED: an ATTACH while held is refused by name — CONTROL: the refusal cut answers «no profile» (a false
  // answer: the registry is EMPTY because it is unread)
  const ATT = "    refuseIfHeld('attaching a browser');";
  ok(KSRC.split(ATT).length === 2, 'control setup: the attach\'s held refusal is found once');
  const ra = await scene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, ATT, '    /* MUTANT: no held refusal */', 'attach-held-cut'), 'attach-held-cut'), 'held-attach-cut', { lift: false });
  ok(r.attach === 'store_unread' && ra.attach === 'not-found', 'while held an attach is refused by name (store_unread); CONTROL (the refusal cut, in a copy): «no profile» for a profile that may exist — RED', { attach: r.attach, cut: ra.attach });

  // piece 6 (browsers.stop, re-landed for the next block — 主开发 r957/r968): the stop's two keeper doors under this law. While held the
  // registry is EMPTY because it is unread, so its running browsers are UNKNOWN and the manager's stop has no record to judge: each is
  // refused BY NAME. CONTROL (each refusal cut, in a copy): the list answers «none runs» and the stop runs on the empty registry — RED.
  const SR = "    refuseIfHeld('the running browsers');", MS = "    refuseIfHeld('the stop');";
  ok(KSRC.split(SR).length === 2 && KSRC.split(MS).length === 2, 'control setup: the stop\'s two held refusals are found once each');
  const rs = await scene(MJ.load('src/server/browser-keeper.js', anchored(anchored(KSRC, SR, '    ensureLoaded(); /* MUTANT: no held refusal */', 'rows-held-cut'), MS, '    /* MUTANT: no held refusal */', 'stop-held-cut'), 'stop-held-cut'), 'held-stop-cut', { lift: false });
  ok(r.stopRows === 'store_unread' && r.managerStop === 'store_unread', 'while held the running browsers (browsers.stop\'s rows, the list\'s browsers) and the manager\'s stop are refused by name (store_unread)', { rows: r.stopRows, stop: r.managerStop });
  ok(rs.stopRows === 'listed 0' && rs.managerStop === 'not-found', 'CONTROL (both refusals cut, in a copy): «none runs» from the EMPTY unread registry, and the stop RUNS on it — the keeper\'s own stop answers «no browser record» (not-found) for a profile that may be running — RED (round wztkervx5, lens 2: the cut copy\'s outcome asserted, not only «not store_unread»)', { rows: rs.stopRows, stop: rs.managerStop });
  if (asRoot) rootSkip('the held file is kept byte for byte (the boot wrote nothing over it)'); else ok(r.keptWhileHeld, 'nothing is written over the held file', r);
  ok(r.lifted && r.profile && r.lifts === 1 && r.file === 1 && r.rewritten, 'read again OFF the loop: the hold lifts, the profile is back, the OWED boot runs (its commit re-saves the file — the writer stamped), the steps after the boot run once (onReadAgain), the file still holds its profile', r);
  // its read r1 (N3a): a copy whose read skips the owed boot — the file is never re-saved by the boot (nothing judged after the read)
  const OWED = '    if (bootOwed) { bootOwed = false; try { await boot(); }';
  ok(KSRC.split(OWED).length === 2, 'control setup: the anchor of the control «the owed boot at the read» is in browser-keeper.js');
  const ro = await scene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, OWED, '    if (false) { bootOwed = false; try { await boot(); }', 'no-owed-boot'), 'registry-no-owed-boot'), 'held-no-owed-boot');
  ok(ro.lifted && !ro.rewritten, 'CONTROL (the owed boot cut, in a copy): the read lifts the hold but the boot\'s path never runs over what it read', { lifted: ro.lifted, rewritten: ro.rewritten });
  // CONTROL: the release's load (any failure ⇒ an empty registry) — the boot's commit writes the EMPTY registry over the file
  const LOADH = "    else { reg = B.normalizeRegistry(null); if (a.state !== 'missing') holdRegistry(a); }";
  ok(KSRC.split(LOADH).length === 2, 'control setup: the anchor of the control «the release\'s load» is in browser-keeper.js');
  const rx = await scene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, LOADH, "    else { reg = B.normalizeRegistry(null); }   /* MUTANT: the release — any failure is an empty registry */", 'release-load'), 'registry-release'), 'held-release', { lift: false });
  if (asRoot) rootSkip('CONTROL the release\'s load: the boot writes the empty registry over the file');
  ok(!rx.held && rx.boot === 'ran' && (asRoot ? true /* its file half: SKIPPED by name above */ : rx.file === 0), 'CONTROL (the release\'s load, in a copy): no hold — the boot runs on the EMPTY registry and writes over the file (the original profile gone from it)', rx);
  // CONTROL: the save's guard alone cut — a held registry's save writes (the boot is held here, so an act's commit is the road)
  const SAVEG = "    if (heldReg) { if (!heldSaveSaid) { heldSaveSaid = true; log.warn?.(`[browser] a ${STORE_FILE} write was refused: the file could not be read, and nothing is written over it until it reads`); } return false; }";
  ok(KSRC.split(SAVEG).length === 2, 'control setup: the anchor of the control «the save\'s guard» is in browser-keeper.js');
  // the save's guard on its own: a copy whose create no longer refuses — its commit still writes NOTHING while held; a second copy
  // that also cuts the guard writes the one new profile over the held file (every profile in it gone)
  const CREF = "    refuseIfHeld('creating a profile');";
  const cref = KSRC.split('\n').find((l) => l.startsWith(CREF));
  ok(!!cref, 'control setup: the create\'s refusal line is in browser-keeper.js');
  const saveScene = async (src, name) => {
    const d = path.join(D, name), H = path.join(d, 'home'); fs.mkdirSync(H, { recursive: true });
    const F = path.join(d, 'browser-profiles.json'); plant(F, BODY);
    const k = MJ.load('src/server/browser-keeper.js', src, name).create({ dataDir: d, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, install: false, log: quiet, unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    k.held(); await codeOf(() => k.createProfile({ label: 'new one', provider: 'chromium' }));
    try { k.shutdown(); } catch { }
    try { require(path.join(ROOT, 'src/store-writer.js')).storeWriter().flushSync(); } catch { }   // lane lg-store-writes: what the keeper handed the writer lands before the file is read (else a save over the held file could hide in the queue)
    return bodyOf(F) === (asRoot ? '(a folder)' : BODY);
  };
  const g1 = await saveScene(anchored(KSRC, cref + '\n', '', 'create-refusal-cut'), 'save-guard-only');
  // (the moved line's must 1: the registry's producer refuses while held too — the control cuts it with the save's guard)
  const g0 = await saveScene(anchored(anchored(anchored(KSRC, cref + '\n', '', 'create-refusal-cut'), SAVEG, '    /* MUTANT: no save guard */', 'save-guard-cut'), 'produce: () => { if (heldReg) throw Object.assign(', 'produce: () => { if (false) throw Object.assign(', 'save-producer-cut'), 'save-guard-cut');
  ok(g1, 'the save\'s held check is its FIRST line: with the create\'s refusal cut, nothing is written over the held file', { g1 });
  if (asRoot) rootSkip('CONTROL the save\'s guard cut too: the new registry is written over the held file'); else ok(!g0, 'CONTROL (the guard cut too, in a copy): the new registry is written over the held file — RED', { g0 });
}

console.log('§2 TORN bytes HOLD too — never set aside into an empty, writable registry (here an empty registry deletes folders)');
{
  const d = path.join(D, 'torn'), H = path.join(d, 'home'); fs.mkdirSync(H, { recursive: true });
  const F = path.join(d, 'browser-profiles.json'); fs.writeFileSync(F, '{"version": 1, "profiles": [');
  const k = require(path.join(ROOT, 'src/server/browser-keeper.js')).create({ dataDir: d, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, install: false, log: quiet, unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
  const held = k.held ? k.held() : false, b = await k.boot();   // (on the base there is no held(): a red line, never a TypeError)
  const after = fs.readFileSync(F, 'utf8');
  try { k.shutdown(); } catch { }
  ok(held && b && b.held && after === '{"version": 1, "profiles": [', 'torn bytes: HELD — the boot judges nothing and the bytes stay as they are (no empty registry written over them)', { held, after });
  // a parse that is not a registry (an array, an object without profiles) is CORRUPT — it was a silent EMPTY registry
  const d2 = path.join(D, 'shape'), H2 = path.join(d2, 'home'); fs.mkdirSync(H2, { recursive: true });
  fs.writeFileSync(path.join(d2, 'browser-profiles.json'), JSON.stringify({ version: 1 }));
  const k2 = require(path.join(ROOT, 'src/server/browser-keeper.js')).create({ dataDir: d2, homeDir: H2, env: () => ({ HOME: H2 }), serverSetting: () => undefined, install: false, log: quiet, unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
  const h2 = k2.held ? k2.held() : false; try { k2.shutdown(); } catch { }
  ok(h2, 'a registry without its profiles list is held (not a silent empty registry)');
}

console.log('§3 the kept sweep reads no absence while the registry is held');
{
  const KP = fs.readFileSync(path.join(ROOT, 'src/server/browser-kept.js'), 'utf8');
  const SW = "    { const k = kp(); if (k && typeof k.held === 'function' && k.held()) { log.warn?.('[browser-kept] the sweep waits — the profile registry is held'); return Promise.resolve({ held: true }); } }";
  const LV = "    if (typeof k.held === 'function' && k.held()) return true;   // the B-f276 remainder: a HELD registry knows no browser — treated live (nothing removed under it)";
  ok(KP.split(SW).length === 2 && KP.split(LV).length === 2, 'control setup: the anchors of the kept sweep\'s controls are in browser-kept.js');
  const KM = require(path.join(ROOT, 'src/server/browser-kept.js'));
  const heldKeeper = { held: () => true, heldWords: () => 'browser-profiles.json could not be read', ephemeralFor: () => null, profileDirRegistered: () => { throw Object.assign(new Error('held'), { code: 'store_unread' }); }, registeredDirs: () => { throw Object.assign(new Error('held'), { code: 'store_unread' }); } };   // r3786: the registered folders refused too (the reconcile then does not finish)
  const sweepOf = async (Mod, name, keeper = heldKeeper) => { const d = path.join(D, name); fs.mkdirSync(d, { recursive: true }); const ks = Mod.create({ dataDir: d, keeper, log: quiet, sweepEveryMs: 0 }); const r = await ks.sweep(); try { ks.stop && ks.stop(); } catch { } return r; };
  // the CONTROL's keeper answers its registered folders (r3786: so the reconcile finishes and ONLY the held check stands in the pass's way)
  const sw = await sweepOf(KM, 'kept-held'), swx = await sweepOf(MJ.load('src/server/browser-kept.js', anchored(KP, SW, '    /* MUTANT: the sweep runs on a held registry */', 'kept-no-held'), 'kept-no-held'), 'kept-held-mut', { ...heldKeeper, registeredDirs: () => [] });
  ok(sw && sw.held === true && !(swx && swx.held), 'the kept sweep makes NO pass while the registry is held (a named profile\'s folder, a running browser\'s caches); CONTROL (the check cut, in a copy): the pass runs', { sw, swx: swx && Object.keys(swx) });
  ok(/registeredDir\(dir\) \{\n    const k = kp\(\);\n    if \(!k \|\| typeof k\.profileDirRegistered !== 'function'\) return true;\n    try \{ return !!k\.profileDirRegistered\(dir\); \} catch \{ return true; \}/.test(KP),
    'WIRING: the kept sweep\'s «a registered folder» fails CLOSED on the keeper\'s refusal (the held registry throws store_unread there — §1)');
}

console.log('§4 WIRING: the route door, Housekeeping, a build\'s removal, the steps after the boot, the late key, the live fill');
{
  const RB = fs.readFileSync(path.join(ROOT, 'src/routes/browser.js'), 'utf8'), BT = fs.readFileSync(path.join(ROOT, 'src/server/browser-trace.js'), 'utf8');
  const BB = fs.readFileSync(path.join(ROOT, 'src/server/browser-builds-keeper.js'), 'utf8'), MP = fs.readFileSync(path.join(ROOT, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const BK = fs.readFileSync(path.join(ROOT, 'src/server/browser-key.js'), 'utf8'), BD = fs.readFileSync(path.join(ROOT, 'src/server/browser-dialogs.js'), 'utf8'), WC = fs.readFileSync(path.join(ROOT, 'src/ws-create.js'), 'utf8');
  ok(RB.includes("else if (typeof k.held === 'function' && k.held()) { res.status(503).json({ error: k.heldWords(), code: 'store_unread', unread: k.heldWords() }); return null; }") && /store_unread: 503/.test(RB)
    && RB.includes("if (typeof k.held === 'function' && k.held()) return 0;   // the B-f276 remainder: a held registry names no profile"),
    'every browser route answers 503 store_unread while held (keeperOr503), and the pin heal clears nothing');
  ok((BT.match(/refuseIfKeeperHeld\(\);/g) || []).length === 4 && BT.includes("if (keeper && typeof keeper.held === 'function' && keeper.held()) throw Object.assign(new Error('the profile registry is held"),
    'Housekeeping\'s orphan list, Forget and Adopt refuse by name, the panel says the hold, and the trace boot leaves the sessions open');
  ok(BB.includes("ctx.refuseIfHeld('removing a Chrome build')"), 'a Chrome build\'s removal refuses while held (no profile choosing it, no browser running it is known)');
  ok(MP.includes("if (r && r.held) { heldBoot = true;") && MP.includes('browserKeeper.onReadAgain?.(() => afterBoot())') && MP.includes('.then(() => { if (!heldBoot) return afterBoot(); });'),
    'the steps after the keeper\'s boot (pins, the pin heal, the recorder, the kept sweep) run once the registry reads');
  ok(BK.includes("if (k && typeof k.held === 'function' && k.held()) return refused(session, f.id, { ok: false, code: 'store_unread'") && WC.includes('if (pin.held) {') && WC.includes("pin.origin !== 'conversation' && !pin.held"),
    'the late key mints nothing while held; a create keeps the conversation\'s pin as it was (never «no longer exists», never re-pinned)');
  ok(BD.includes("catch (e) { if (e && e.code === 'store_unread') return { ok: false, code: 'store_unread', error: e.message }; st = null; }"), 'the live-fill verdict fails CLOSED on a held registry (it read «no fence»)');
  // its read r1: M1 — a create while held judges its pin ONCE THE REGISTRY READS (over its own facts); S1 — browser-env's own registry
  // reader is unknown (null, fail closed) for a parse that is not a registry; N1 — the trace routes' doors answer the hold by name
  const BE = fs.readFileSync(path.join(ROOT, 'src/server/browser-env.js'), 'utf8'), RT = fs.readFileSync(path.join(ROOT, 'src/routes/browser-trace.js'), 'utf8');
  // its read r2 (M3 / S5 / N11): the wiring of the OWED pin — the keyed create owes it under its key and its record carries the facts;
  // a keyless create's witness carries them; a restored conversation owes it again; the live session's copy follows the verdict
  const BR = fs.readFileSync(path.join(ROOT, 'src/server/boot-restore.js'), 'utf8');
  ok(WC.includes("if (pinOwed) { session._browserPinOwed = pinOwed; try { const ko = require('./server/browser-keeper.js').keeper()?.owePin?.(bk.key, pinOwed); if (ko && ko.kept) session._browserPinOwed = ko.kept; }") && WC.includes('browserPinOwed: session._browserPinOwed || undefined,')
    && WC.includes('spawnPinWitness = { owed: pinOwed, at: Date.now() };') && WC.includes('integrationOn && !pin.held)') && WC.includes('kp.pinVerdictForCreate({ facts: pinFacts, hint, formGroups })'),
    'a create while held OWES its pin: under its key (the keeper judges it at the read, whatever became of the session) and in its record; a keyless one in its start witness; both roads judge through ONE verdict');
  ok(BR.includes("_browserPinOwed: meta.browserPinOwed && typeof meta.browserPinOwed === 'object'") && (BR.match(/activeSessions\.set\(id, session\); oweRestoredPin\(session\);/g) || []).length === 2 && MP.includes('browserKeeper.owePin?.(s._browserKey, { ...s._browserPinOwed, restored: true })') && MP.indexOf('browserKeeper.owePin?.(s._browserKey, { ...s._browserPinOwed, restored: true })') < MP.indexOf('Promise.resolve(gate).catch(() => null).then(() => browserKeeper.boot())') && MP.includes('browserKeeper.onOwedPin?.((key, res) => {')
    && BK.includes('if (witness && typeof witness === \'object\' && witness.owed && k) witness = owedWitness(k, witness);'),
    'a restart before the read: the restored conversation owes its pin again BEFORE the keeper\'s boot (r3 S7: judged first in it); the live session\'s copy and record follow the verdict; the late key judges an owed witness');
  ok(WC.includes('if (kq && typeof kq.owedPending === \'function\' && !kq.owedPending(session._browserKey) && !kq.held()) {') && WC.indexOf('!kq.owedPending(session._browserKey)') > WC.indexOf('activeSessions.set(id, session);')
    && WC.indexOf('!kq.owedPending(session._browserKey)') < WC.indexOf('browserPinOwed: session._browserPinOwed || undefined,'),
    'r3 M4: a create whose owed pin was judged while it was still spawning takes the keeper\'s answer at its registration — before its record is written (no stale facts to re-judge)');

  ok(BE.includes("if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.profiles)) return null;"), 'browser-env\'s registry reader answers UNKNOWN (null — its sweep spares every folder) for a parse that is not a registry');
  ok((RT.match(/k\.held\(\)\) \{ res\.status\(503\)\.json\(\{ error: k\.heldWords\(\), code: 'store_unread'/g) || []).length === 1 && RT.includes("ctx.keeper.held()) { res.status(503).json({ error: ctx.keeper.heldWords(), code: 'store_unread'"),
    'the trace routes\' two doors (keeperOr503, traceOr503) answer the hold by name — never «no profile bp-…»');
}

console.log('§5 its reads r2 + r3: a create the held registry could not judge OWES its pin — keyed by its browser key, judged right after the read');
{
  const PARENT = 'bk-0000aaaa', KR = 'bk-0000eeee';   // both pinned to «work» in the file
  const K1 = 'bk-0000bbbb', KF = 'bk-0000cccc', KW = 'bk-0000dddd', KH = 'bk-0000ffff', KS = 'bk-00001111', KG = 'bk-00002222';
  const B0 = JSON.parse(BODY);
  const BODY5 = JSON.stringify({ ...B0, profiles: [...B0.profiles, { id: 'bp-0000b002', label: 'home', provider: 'chromium', dir: '/var/empty/vs-home-profile', createdAt: 2 }],
    pins: { [PARENT]: { profileId: 'bp-0000b001', origin: 'chosen', at: 1, by: 'user' }, [KR]: { profileId: 'bp-0000b001', origin: 'chosen', at: 1, by: 'user' } } });
  const owedScene = async (Mod, name) => {
    const d = path.join(D, name), H = path.join(d, 'home'); fs.mkdirSync(H, { recursive: true });
    const F = path.join(d, 'browser-profiles.json'); plant(F, BODY5);
    const order = [];
    const log = { log() { }, error() { }, warn(m) { if (/read again \(held since/.test(String(m))) order.push('read-again'); } };
    const k = Mod.create({ dataDir: d, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, install: false, log, unreadRetry: { firstMs: 15, maxMs: 30 }, taskGroupCap: () => 2 });
    const out = { held: k.held() };
    out.owe = [
      k.owePin(K1, { facts: { explicit: 'bp-0000b001' }, groupFacts: { cwd: '/w' } }),   // a New Session pick (the conversation stopped since: no session to ask)
      k.owePin(K1, { facts: { priorKey: K1, resume: true } }),   // its resume while still held: weaker facts never replace the pick
      k.owePin(KF, { facts: { fork: true, forkParentKey: PARENT } }),   // a fork of the pinned conversation
      k.owePin(PARENT, { restored: true, facts: { explicit: 'bp-0000b002' } }),   // r3 M4: a RESTORED record's stale facts — its key has a pin: kept
      k.owePin(KR, { facts: { explicit: 'bp-0000b002', priorKey: KR, resume: true } }),   // a resume's own explicit pick over its pin (the ladder's rank)
      k.owePin(KH, { facts: { explicit: 'bp-0000b001', taskGroupDefault: 'bp-0000b001' }, hint: 'task-group' }),   // r3 S10: the dialog's hint downgrades
      k.owePin(KS, { facts: { instanceRef: 'work' }, groupFacts: {}, cap: 1 }),   // r3 S8: the instance default and the cap AT THE START
      k.owePin(KW, { facts: {} }),   // nothing to pick
      k.owePin(KG, { facts: { explicit: 'bp-0000b001' }, formGroups: ['T-form'] }),   // r4 S14: the New Session FORM's pick — judged by the groups it sent (none admits it here)
    ].map((x) => !!(x && x.owed));
    k.onOwedPin((key, res) => order.push(`${key.slice(-4)}:${res.pin ? res.pin.profileId + '/' + res.pin.origin : 'none'}`));
    k.onReadAgain(() => { order.push('lift'); });
    await k.boot().catch(() => null);
    unplant(F, BODY5);
    const keep = setInterval(() => { }, 1000);
    try { for (let i = 0; i < 300 && !order.includes('lift'); i++) await new Promise((r) => setTimeout(r, 10)); } finally { clearInterval(keep); }
    await flush();
    const pf = (x) => { const v = k.pinFor(x); return v ? `${v.profileId}/${v.origin}/${v.at === 1 ? 'at1' : 'now'}` : null; };
    Object.assign(out, { k1: pf(K1), kf: pf(KF), parent: pf(PARENT), kr: pf(KR), kh: pf(KH), ks: pf(KS), kw: pf(KW), kg: pf(KG), cap1: k.groupCapOf(K1), capS: k.groupCapOf(KS), order });
    try { k.shutdown(); } catch { }
    return out;
  };
  const o = await owedScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'owed');
  ok(o.held && o.owe.every(Boolean), 'while held each create OWES its pin', o);
  ok(o.k1 === 'bp-0000b001/chosen/now' && o.cap1 === 2, 'at the read the New Session pick is pinned under the conversation\'s key — though no session was there to ask (r2 M3) — and its Task Group cap is stamped (r2 S4); the resume\'s weaker facts did not replace it', o);
  ok(o.kg === null, 'r4 S14: the owed road judges the New Session FORM\'s pick by the groups it sent — a pick they do not admit is never pinned (nor added to «Who can use it») at the read', o);
  ok(o.kf === 'bp-0000b001/conversation/at1' && o.kw === null, 'a fork made while held takes its parent\'s pin as the keeper\'s copy (the parent\'s row verbatim — r2 M1r); nothing to pick pins nothing', o);
  ok(o.parent === 'bp-0000b001/chosen/at1' && o.kr === 'bp-0000b002/chosen/now', 'r3 M4: a RESTORED record\'s facts never re-judge a key that has its pin (judged before, or pinned since by the person); a resume\'s own explicit pick still ranks over its pin', o);
  ok(o.kh === 'bp-0000b001/task-group/now' && o.ks === 'bp-0000b001/instance/now' && o.capS === 1, 'r3 S10 / S8: the owed road takes the dialog\'s hint (its value IS the group\'s default: task-group, not chosen); the instance default and the group cap are the START\'s (the setting is empty now, the group\'s cap is 2 now)', o);
  const ri = o.order.indexOf('read-again');
  ok(ri > 0 && o.order.slice(0, ri).length === 8 && o.order[o.order.length - 1] === 'lift', 'the owed pins are judged right after the read\'s load — BEFORE the owed boot (r2 S3) — and told to the sessions\' copies (r2 N11)', o.order);
  const JUDGE = "    if (!heldReg) { try { judgeOwedPins(); } catch (e) { log.warn?.(`[browser] the pins the creates owed after the read: ${e && e.message}`); } }\n";
  const BOOTL = "    if (bootOwed) { bootOwed = false; try { await boot(); } catch (e) { log.warn?.(`[browser] the boot's path after the read failed: ${e && e.message}`); } }\n";
  const BOOTJ = "    if (owedPins.size) { try { judgeOwedPins(); }";
  const FORK = "      if (pin.profileId && pin.origin === 'conversation' && f.fork && f.forkParentKey && f.forkParentKey !== browserKey) out = copyPin(";
  const KEEP = "    if (owed && owed.restored && pinFor(browserKey)", HINT = "pin = pinVerdictForCreate({ facts: f, hint: owed.hint || null,", CAPV = "owed.cap !== undefined ? { value: owed.cap } : {}";
  const FORMV = 'formGroups: Array.isArray(owed.formGroups) ? owed.formGroups : null })';
  ok([JUDGE, BOOTL, BOOTJ, FORK, KEEP, HINT, CAPV, FORMV].every((x) => KSRC.split(x).length === 2), 'control setup: the read\'s judge, the owed boot, the boot\'s judge, the fork\'s copy, the restored keep, the hint and the start\'s cap are found once');
  const mut = (pairs, tag) => MJ.load('src/server/browser-keeper.js', pairs.reduce((t, [a, b]) => anchored(t, a, b, tag), KSRC), tag);
  const ox = await owedScene(mut([[JUDGE, ''], [BOOTJ, '    if (false) { try { judgeOwedPins(); }']], 'owed-not-judged'), 'owed-not-judged');
  const of = await owedScene(mut([[FORK, '      if (false) out = copyPin(']], 'owed-no-fork-copy'), 'owed-no-fork-copy');
  const okp = await owedScene(mut([[KEEP, '    if (false']], 'owed-no-restored-keep'), 'owed-no-restored-keep');
  const oh = await owedScene(mut([[HINT, 'pin = pinVerdictForCreate({ facts: f, hint: null,'], [CAPV, '{}']], 'owed-no-hint-no-cap'), 'owed-no-hint-no-cap');
  const oa = await owedScene(mut([[JUDGE, ''], [BOOTL, BOOTL + JUDGE]], 'owed-after-boot'), 'owed-after-boot');
  const of2 = await owedScene(mut([[FORMV, 'formGroups: null })']], 'owed-no-form'), 'owed-no-form');
  ok(of2.kg === 'bp-0000b001/chosen/now', 'CONTROL (the owed road hands no form groups, in a copy): the form\'s pick is pinned as the person\'s own choice — RED (r4 S14)', of2);
  ok(ox.k1 === null && ox.kf === null && of.kf === null && of.k1 === 'bp-0000b001/chosen/now', 'CONTROLS: a read that judges no owed pin leaves the pick and the fork unpinned for good (r2 M3); a judge with no fork copy leaves the fork unpinned (r2 M1r) — each RED', { ox, of });
  ok(okp.parent === 'bp-0000b002/chosen/now' && oh.kh === 'bp-0000b001/chosen/now' && oh.capS === 2, 'CONTROLS: without the restored keep the stale facts REVERT the pin (r3 M4); without the hint the group\'s default reads as the person\'s own pick, and without the start\'s cap the group\'s cap of today is stamped (r3 S10 / S8) — each RED', { okp, oh });
  const ra = oa.order.indexOf('read-again');
  ok(ra === 0, 'CONTROL: the judge moved after the owed boot — the read-again line comes first, the pins after (r3 S10: the «before the owed boot» half) — RED', oa.order);
  // r4 S13: a restored record owes BEFORE the keeper loads (the wiring's microtask); the boot then finds the registry HELD — the facts
  // survive to the read and are judged then (a judge before the load met the hold and told «none»: the record cleared, the pick lost)
  const preScene = async (Mod, name) => {
    const d = path.join(D, name), H = path.join(d, 'home'); fs.mkdirSync(H, { recursive: true });
    const F = path.join(d, 'browser-profiles.json'); plant(F, BODY5);
    const told = [];
    const k = Mod.create({ dataDir: d, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, install: false, log: quiet, unreadRetry: { firstMs: 15, maxMs: 30 } });
    k.onOwedPin((key, res) => told.push(`${key.slice(-4)}:${res.pin ? res.pin.profileId : 'none'}`));
    const owe = k.owePin(KS, { restored: true, facts: { explicit: 'bp-0000b002' } });   // before ANY load
    await k.boot().catch(() => null);
    let lifts = 0; k.onReadAgain(() => { lifts++; });
    unplant(F, BODY5);
    const keep = setInterval(() => { }, 1000);
    try { for (let i = 0; i < 300 && !lifts; i++) await new Promise((r) => setTimeout(r, 10)); } finally { clearInterval(keep); }
    await flush();
    const v = k.pinFor(KS); const out = { owed: !!(owe && owe.owed), pin: v ? `${v.profileId}/${v.origin}` : null, told: told.join(' ') };
    try { k.shutdown(); } catch { }
    return out;
  };
  const LOADED = '    if (loaded && !heldReg) return judgeOwedPin(browserKey, owed);';
  const HELDG = '    if (pin.held) { owedPins.set(browserKey, owed); return { owed: true, kept: owed }; }';
  ok(KSRC.split(LOADED).length === 2 && KSRC.split(HELDG).length === 2, 'control setup: the owe\'s deferral and the judge\'s held guard are found once');
  const pr = await preScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'owed-pre-load');
  const prx = await preScene(mut([[LOADED, '    if (!heldReg) return judgeOwedPin(browserKey, owed);'], [HELDG, '']], 'owed-pre-load-cut'), 'owed-pre-load-cut');   // stale-pins: kept (the control plants r3's judge-at-once shape in a copy)
  ok(pr.owed && pr.pin === 'bp-0000b002/chosen' && pr.told === '1111:bp-0000b002', 'r4 S13: an owe made BEFORE the keeper loads survives a HELD boot and is judged at the read — told once, with its pin', pr);
  ok(prx.pin === null && prx.told === '1111:none', 'CONTROL (judged at once before the load, no held guard, in a copy): the verdict meets the hold and tells «none» — the record would be cleared, the pick lost — RED', prx);
  ok(KSRC.indexOf(BOOTJ) > KSRC.indexOf('  async function boot() {') && KSRC.indexOf(BOOTJ) < KSRC.indexOf('    const r = reconcile({ graceMs: 0 });'), 'r4 S13: the boot judges what restored conversations owe BEFORE its reconcile and adoption (the order, as written)');
  // a KEYLESS create's owed start record → the witness its late key restores (the create's own verdict; the start's cap and default)
  const BKm = require(path.join(ROOT, 'src/server/browser-key.js')), Bp = require(path.join(ROOT, 'src/browser-profiles.js'));
  const d5 = path.join(D, 'owed-witness'), H5 = path.join(d5, 'home'); fs.mkdirSync(H5, { recursive: true }); fs.writeFileSync(path.join(d5, 'browser-profiles.json'), BODY5);
  const k5 = require(path.join(ROOT, 'src/server/browser-keeper.js')).create({ dataDir: d5, homeDir: H5, env: () => ({ HOME: H5 }), serverSetting: () => undefined, install: false, log: quiet, taskGroupCap: () => 3 });
  const wPick = BKm.owedWitness(k5, { owed: { facts: { explicit: 'bp-0000b001' }, groupFacts: {}, cap: 1 }, at: 5 });
  const wInst = BKm.owedWitness(k5, { owed: { facts: { instanceRef: 'home' }, groupFacts: {}, cap: null }, at: 5 });
  const wFork = BKm.owedWitness(k5, { owed: { facts: { fork: true, forkParentKey: PARENT } }, at: 5 });
  const wNone = BKm.owedWitness(k5, { owed: { facts: { instanceRef: '' }, cap: null }, at: 5 });
  try { k5.shutdown(); } catch { }
  ok(Bp.isPinWitness(wPick) && wPick.profileId === 'bp-0000b001' && wPick.origin === 'chosen' && wPick.at === 5 && wPick.cap === 1 && Bp.isPinWitness(wInst) && wInst.profileId === 'bp-0000b002' && wInst.origin === 'instance' && wInst.cap === null
    && Bp.isPinWitness(wFork) && wFork.origin === 'conversation' && wFork.at === 1 && Bp.isEmptyPinWitness(wNone),
    'a keyless create\'s owed start record becomes the witness its late key restores: the start\'s pick, the START\'s instance default and cap (r3 S8 — the group\'s cap is 3 today), a fork\'s parent row verbatim, none = the empty witness', { wPick, wInst, wFork, wNone });
}

console.log('§6 its reads r2 (N17) + r3 (N19): a load that THROWS at the read holds the store again — never the owed boot over an empty registry');
{
  const HEAD = '  function loadFrom(read) {\n    let rawDoc = null;\n';
  const REHOLD = "holdRegistry({ code: 'load-threw', why: String((e && e.message) || e) }); return; }";
  ok(KSRC.split(HEAD).length === 2 && KSRC.split(REHOLD).length === 2, 'control setup: the load\'s head and the re-hold are found once');
  const FAULT = HEAD + "    if (read && typeof read.text === 'string') throw new Error('a planted load fault');   /* PLANTED: the read again's load throws */\n";
  const faultScene = async (src, name, until) => {
    const d = path.join(D, name), H = path.join(d, 'home'); fs.mkdirSync(H, { recursive: true });
    const F = path.join(d, 'browser-profiles.json'); plant(F, BODY);
    const k = MJ.load('src/server/browser-keeper.js', src, name).create({ dataDir: d, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, install: false, log: quiet, unreadRetry: { firstMs: 15, maxMs: 30 } });
    const held0 = k.held(); await k.boot().catch(() => null);
    let lifts = 0; k.onReadAgain(() => { lifts++; });
    unplant(F, BODY);
    const keep = setInterval(() => { }, 1000);
    try { for (let i = 0; i < 300 && !until(k, lifts); i++) await new Promise((r) => setTimeout(r, 10)); } finally { clearInterval(keep); }
    await flush();
    const out = { held0, heldAfter: k.held(), words: String(k.heldWords() || ''), lifts };
    try { k.shutdown(); } catch { }
    try { require(path.join(ROOT, 'src/store-writer.js')).storeWriter().flushSync(); } catch { }   // lane lg-store-writes (as §1 and §2): the owed boot's commit rides the store writer — it LANDS before the file is read (8 setImmediates were a race: red in one zone, 47fd700ed)
    out.file = (() => { try { return JSON.parse(fs.readFileSync(F, 'utf8')).profiles.length; } catch (e) { return '(' + (e.code || 'unparsed') + ')'; } })();
    return out;
  };
  const f1 = await faultScene(anchored(KSRC, HEAD, FAULT, 'load-fault'), 'load-fault', (k) => /load-threw/.test(String(k.heldWords() || '')));
  ok(KSRC.split('heldReg = was; ').length === 2, 'control setup: the catch\'s hold kept (heldReg = was) is found once');
  const f0 = await faultScene(anchored(anchored(anchored(KSRC, HEAD, FAULT, 'load-fault'), REHOLD, '}', 'no-rehold'), 'heldReg = was; ', '', 'no-kept-hold'), 'load-fault-no-rehold', (k, lifts) => lifts > 0);   // the r2-era catch: it only says the throw
  ok(f1.held0 && f1.heldAfter && /load-threw/.test(f1.words) && f1.lifts === 0 && f1.file === 1, 'a load that throws at the read (the read again DID come: its words say load-threw): the store is HELD again, nothing judged, the file keeps its profile', f1);
  ok(f0.lifts === 1 && f0.file === 0, 'CONTROL (no re-hold, in a copy): the owed boot runs over the EMPTY registry and commits it — every profile gone from the file — RED', f0);
  // THE MOVED LINE'S MUST 1, ITS CLASS (主开发 2026-11-19 22:38Z): the registry's bytes are made AT the write — a load that QUEUES
  // a save and then throws restores the hold and empties the registry; the queued write is refused while held (EHELD), never the
  // EMPTY registry over the held file. RED (anchored, in a copy): the producer's guard cut — the empty registry lands.
  const PRODG = 'produce: () => { if (heldReg) throw Object.assign(';
  ok(KSRC.split(PRODG).length === 2, 'control setup: the registry producer\'s held guard is found once');
  const QFAULT = HEAD + "    if (read && typeof read.text === 'string') { save(); throw new Error('a planted load fault after a queued save'); }   /* PLANTED: the load queues a save, then throws */\n";
  const fq = await faultScene(anchored(KSRC, HEAD, QFAULT, 'load-fault-queued'), 'load-fault-queued', (k) => /load-threw/.test(String(k.heldWords() || '')));
  const fqx = await faultScene(anchored(anchored(KSRC, HEAD, QFAULT, 'load-fault-queued'), PRODG, 'produce: () => { if (false) throw Object.assign(', 'no-producer-guard'), 'load-fault-queued-mut', (k) => /load-threw/.test(String(k.heldWords() || '')));
  ok(fq.heldAfter && /load-threw/.test(fq.words) && fq.file === 1, 'must 1\'s class: a read again whose load QUEUED a save and then threw — held again, and the queued write refused while held: the file keeps its profile', fq);
  ok(fqx.heldAfter && fqx.file === 0, 'CONTROL (the producer\'s guard cut, in a copy): the queued save lands the EMPTY registry over the held file — RED', fqx);
}

console.log('§7 round wm6qxcqcw (主开发 03:35Z): the hold is TOLD once in For you; the owes after a restart; the guards whose removal harms most');
{
  const lift = async (k, F, body, until) => { unplant(F, body); const keep = setInterval(() => { }, 1000); try { for (let i = 0; i < 300 && !until(); i++) await new Promise((r) => setTimeout(r, 10)); } finally { clearInterval(keep); } await flush(); };
  const mk = (Mod, d, H, extra = {}) => Mod.create({ dataDir: d, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, install: false, log: quiet, unreadRetry: { firstMs: 15, maxMs: 30 }, ...extra });
  const dirOf = (name) => { const d = path.join(D, name), H = path.join(d, 'home'); fs.mkdirSync(H, { recursive: true }); return { d, H, F: path.join(d, 'browser-profiles.json') }; };
  // (MUST) ONE For-you item when the hold begins — origin browser, under «Agent browser», its words keyed (zh / ja) — resolved at the read
  const NOTICE_KEY = "VibeSpace cannot read {file}, the file of your browser profiles, right now — so the agent browsers wait. Nothing is written over it, and VibeSpace reads it again by itself.";
  const TORN_KEY = "VibeSpace cannot use {file}, the file of your browser profiles: its bytes are not a whole profile list (torn or damaged) — so the agent browsers wait. Nothing is written over it, and reading it again will not mend it: put back a copy from a backup.";
  const DETAIL_KEY = "If this stays: the file is {path} — check that VibeSpace can read it (its storage answers, its permissions), or put back a copy from a backup; VibeSpace reads it again by itself.";
  const noticeScene = async (Mod, name) => {
    const { d, H, F } = dirOf(name); plant(F, BODY);
    const items = [], done = [];
    const userTodos = { add: (sk, o) => { items.push({ sk, o }); return { id: 'it-b' + items.length }; }, get: (id) => ({ id, status: 'open' }), setStatus: (id, st) => done.push(`${id}:${st}`) };
    const k = mk(Mod, d, H, { userTodos });
    const held = k.held(); await k.boot().catch(() => null); k.held();   // a second look while held files nothing more
    let lifts = 0; k.onReadAgain(() => { lifts++; });
    await lift(k, F, BODY, () => lifts > 0);
    const it = items[0] && items[0].o;
    const tx = (it && it.i18n && it.i18n.text) || {}, dt = (it && it.i18n && Array.isArray(it.i18n.detail) && it.i18n.detail[0]) || {};
    const out = { held, filed: items.length, group: items[0] && items[0].sk, origin: it && it.origin, head: it && it.sessionName, itemKey: it && it.itemKey, key: tx.key, file: tx.params && tx.params.file, code: tx.params && tx.params.code, kind: it && it.kind, urgency: it && it.urgency,
      detailKey: dt.key, detailPath: dt.params && dt.params.path, detailNamesFile: !!(it && typeof it.detail === 'string' && it.detail.includes(F)), done: done.join() };
    try { k.shutdown(); } catch { }
    return out;
  };
  const FILE_N = '    if (!heldSaid) { heldSaid = true; fileHeldNotice();', RES_N = '    resolveHeldNotice();   // round wm6qxcqcw: the notice the hold filed goes with it\n';
  ok(KSRC.split(FILE_N).length === 2 && KSRC.split(RES_N).length === 2, 'control setup: the notice\'s filing and its resolving are found once');
  const n1 = await noticeScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'notice');
  const n1x = await noticeScene(MJ.load('src/server/browser-keeper.js', anchored(anchored(KSRC, FILE_N, '    if (!heldSaid) { heldSaid = true;', 'notice-file-cut'), RES_N, '', 'notice-resolve-cut'), 'notice-cut'), 'notice-cut');
  ok(n1.held && n1.filed === 1 && n1.group === 'browser' && n1.origin === 'browser' && n1.head === 'Agent browser' && n1.itemKey === 'browser-registry-held' && n1.key === NOTICE_KEY && n1.file === 'browser-profiles.json' && n1.code === undefined && n1.kind === 'notice' && n1.urgency === 'normal' && n1.done === 'it-b1:done',
    'the hold is told ONCE in For you (origin browser, under «Agent browser», ONE item key, its words keyed with the file named and no raw code — r2 S3; a failed read is a notice) — and that item is resolved at the read', n1);
  ok(n1x.filed === 0 && n1x.done === '', 'CONTROL (no filing, no resolving, in a copy): the hold tells the person nothing — every agent browser stops unsaid — RED', n1x);
  for (const [key, what] of [[NOTICE_KEY, 'notice'], [TORN_KEY, 'torn notice'], [DETAIL_KEY, 'detail']]) for (const lang of ['zh', 'ja']) ok(fs.readFileSync(path.join(ROOT, `src/lib/i18n-${lang}.js`), 'utf8').includes(JSON.stringify(key) + ':'), `the ${what} has its ${lang} row`);
  // its read r2 (N2): the way out (the detail) is a leg — its key, the path named, the English detail naming the file
  const DET_A = 'detail: DET_TEXT(), ', DET_B = ', detail: [{ key: HELD_DETAIL, params: { path: storeFile } }]';
  ok(KSRC.split(DET_A).length === 2 && KSRC.split(DET_B).length === 2, 'control setup: the notice\'s two detail fields are found once');
  const nd = await noticeScene(MJ.load('src/server/browser-keeper.js', anchored(anchored(KSRC, DET_A, '', 'detail-cut-a'), DET_B, '', 'detail-cut-b'), 'notice-detail-cut'), 'notice-detail-cut');
  ok(n1.detailKey === DETAIL_KEY && n1.detailPath === path.join(D, 'notice', 'browser-profiles.json') && n1.detailNamesFile, 'the notice carries its way out: the detail keyed (zh / ja), the file\'s path named in it and in its English words', n1);
  ok(nd.filed === 1 && !nd.detailKey && !nd.detailNamesFile, 'CONTROL (the detail dropped, in a copy): the person reads why but not where the file is nor what to do — RED', nd);
  // its read r1 (M3) + r2 (S1): a run that STOPPED while held left its item open — through the REAL For-you store: the next start that
  // reads the file closes it (found by the ONE item key); one held again re-files the SAME item (the store matches the key), closed at the read
  const UTM = require(path.join(ROOT, 'src/user-todos.js')).UserTodoManager;
  const KREAL = require(path.join(ROOT, 'src/server/browser-keeper.js'));
  const TORN = '{"version": 1, "profiles": [{"id": "bp-0000b0';
  const toTorn = (F) => { if (asRoot) fs.rmdirSync(F); else fs.chmodSync(F, 0o644); fs.writeFileSync(F, TORN); };
  const heldItems = (store) => store.forSession('browser').filter((i) => i.itemKey === 'browser-registry-held');
  const prevRun = async (Mod, name) => {   // run one: held at its boot, files its item, STOPS while held
    const { d, H, F } = dirOf(name); plant(F, BODY);
    const store = new UTM({ dataDir: d, expirySweepMs: 0 });
    const k = mk(Mod, d, H, { userTodos: store }); k.held(); await k.boot().catch(() => null);
    try { k.shutdown(); } catch { }
    // its read r3 (M2): by its words' key (the item-key cut leaves those), among ALL its items (a copy may have closed it already)
    const id = store.idsWhere((i) => i.sessionKey === 'browser' && !!i.i18n && !!i.i18n.text && i.i18n.text.key === NOTICE_KEY)[0];
    return { d, H, F, store, id };
  };
  const staleScene = async (Mod, name, { held }) => {
    const { d, H, F, store, id } = await prevRun(Mod, name);
    if (!held) unplant(F, BODY);
    const k = mk(Mod, d, H, { userTodos: store });
    const h = k.held(); let again = null;
    let whileHeld = null;
    if (held) { let lifts = 0; k.onReadAgain(() => { lifts++; }); await k.boot().catch(() => null); again = heldItems(store).map((i) => i.id).join(); whileHeld = id && store.get(id) ? store.get(id).status : null; await lift(k, F, BODY, () => lifts > 0); }
    const old = id ? store.get(id) : null;
    const out = { held: h, filedByRunOne: !!id, runOneId: id || null, oldStatus: old && old.status, again, whileHeld, openAfter: heldItems(store).length };
    try { k.shutdown(); } catch { } try { store.stop(); } catch { }
    return out;
  };
  const KEYED = 'itemKey: HELD_ITEM_KEY, i18n:';
  ok(KSRC.split(KEYED).length === 2, 'control setup: the filing\'s item key is found once');
  const st1 = await staleScene(KREAL, 'stale-read', { held: false });
  const st2 = await staleScene(KREAL, 'stale-held', { held: true });
  const st1x = await staleScene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, KEYED, 'i18n:', 'item-key-cut'), 'item-key-cut'), 'stale-read-keycut', { held: false });
  ok(st1.filedByRunOne && !st1.held && st1.oldStatus === 'done' && st1.openAfter === 0 && st2.filedByRunOne && st2.held && !!st2.runOneId && st2.again === st2.runOneId && st2.whileHeld === 'open' && st2.oldStatus === 'done' && st2.openAfter === 0,
    'a For-you item a previous run left open (the real store): closed by a start that reads the file; a start held again keeps the SAME item OPEN while held (one open, run one\'s id) and closes it at the read', { st1, st2 });
  // its read r3 (N3): «never closed while held» — CONTROL: both close guards cut (the boot's and the close's own)
  const G_BOOT = '    if (!heldReg) closeStaleHeldNotices();   // its read r1 (M3) / r2 (S2): a boot that READ', G_OWN = '    if (heldReg || !userTodos || typeof userTodos.setStatus';
  ok(KSRC.split(G_BOOT).length === 2 && KSRC.split(G_OWN).length === 2, 'control setup: the two close guards are found once');
  const st2x = await staleScene(MJ.load('src/server/browser-keeper.js', anchored(anchored(KSRC, G_BOOT, '    closeStaleHeldNotices();   // its read r1 (M3) / r2 (S2): a boot that READ', 'close-guard-boot-cut'), G_OWN, '    if (!userTodos || typeof userTodos.setStatus', 'close-guard-own-cut'), 'close-guards-cut'), 'stale-held-guards-cut', { held: true });
  ok(st2x.held && st2x.whileHeld === 'done', 'CONTROL (both close guards cut, in a copy): a start held again closes the item while the store is still held — the person told the hold is over — RED', st2x);
  ok(st1x.filedByRunOne && st1x.oldStatus === 'open', 'CONTROL (the item key cut, in a copy): the start that reads the file cannot find the old item — it stays open over a registry that reads (the person told a hold that is over) — RED', st1x);
  // its read r2 (S2): a read again whose LOAD THROWS late (after the old in-load close) is held again — this hold's item stays OPEN
  const LATE = '    fileHost = reg.host || null;\n', OLDSPOT = "    else { reg = B.normalizeRegistry(null); if (a.state !== 'missing') holdRegistry(a); }\n";
  ok(KSRC.split(LATE).length === 2 && KSRC.split(OLDSPOT).length === 2, 'control setup: the load\'s late line and the old close\'s spot are found once');
  const LATE_FAULT = LATE + "    if (read && typeof read.text === 'string') throw new Error('a planted late load fault');   /* PLANTED: the read again's load throws late */\n";
  const lateScene = async (src, name) => {
    const { d, H, F } = dirOf(name); plant(F, BODY);
    const store = new UTM({ dataDir: d, expirySweepMs: 0 });
    const k = mk(MJ.load('src/server/browser-keeper.js', src, name), d, H, { userTodos: store });
    k.held(); await k.boot().catch(() => null);
    const id = (heldItems(store)[0] || {}).id;
    await lift(k, F, BODY, () => /load-threw/.test(String(k.heldWords() || '')));
    const it = id ? store.get(id) : null;
    const out = { filed: !!id, heldAfter: k.held(), words: /load-threw/.test(String(k.heldWords() || '')), status: it && it.status, open: heldItems(store).length };
    try { k.shutdown(); } catch { } try { store.stop(); } catch { }
    return out;
  };
  const lt = await lateScene(anchored(KSRC, LATE, LATE_FAULT, 'late-fault'), 'late-fault');
  const ltx = await lateScene(anchored(anchored(KSRC, LATE, LATE_FAULT, 'late-fault'), OLDSPOT, OLDSPOT + '    if (!heldReg) closeStaleHeldNotices();   /* MUTANT: the r1 close inside the load */\n', 'close-in-load'), 'late-fault-close-in-load');
  ok(lt.filed && lt.heldAfter && lt.words && lt.status === 'open' && lt.open === 1, 'a read again whose load throws late is held again (load-threw) — and the person\'s item stays OPEN (the close runs only after a load returned)', lt);
  ok(ltx.filed && ltx.heldAfter && ltx.status === 'done' && ltx.open === 0, 'CONTROL (the close back inside the load, in a copy): the store is held again but the item was closed — the person is told the hold is over — RED', ltx);
  // its read r2 (S4): TORN bytes never lift by themselves — the item ASKS the person (an action, high); a failed read is a notice; a hold
  // that turns torn at a read again re-files the same item raised
  const toUnread = (F) => { if (asRoot) { fs.rmSync(F, { force: true }); fs.mkdirSync(F); } else fs.chmodSync(F, 0o000); };   // a failed read again (EACCES; a folder as root)
  const wordsKey = (it) => (it && it.i18n && it.i18n.text && it.i18n.text.key) || null;
  const tornScene = async (Mod, name, { bootTorn }) => {   // its read r3 (M1): a MODULE — the plain scenes load the real keeper (an unchanged copy is refused)
    const { d, H, F } = dirOf(name); if (bootTorn) fs.writeFileSync(F, TORN); else plant(F, BODY);
    const store = new UTM({ dataDir: d, expirySweepMs: 0 });
    const k = mk(Mod, d, H, { userTodos: store });
    k.held(); await k.boot().catch(() => null);
    const first = heldItems(store)[0] || {};
    const out = { held: k.held(), kind0: first.kind, urgency0: first.urgency, words0: wordsKey(first) };
    if (!bootTorn) {
      toTorn(F);
      const keep = setInterval(() => { }, 1000);
      try {
        for (let i = 0; i < 100 && (heldItems(store)[0] || {}).kind !== 'action'; i++) await new Promise((r) => setTimeout(r, 10));   // reads again 15–30 ms apart
        await flush();
        const now = heldItems(store);
        Object.assign(out, { kind1: now[0] && now[0].kind, urgency1: now[0] && now[0].urgency, words1: wordsKey(now[0]), same: !!(now[0] && now[0].id === first.id), open1: now.length });
        // its read r3 (N2): a FAILED read after the torn bytes mends nothing — the ask stays raised (several reads again, 15–30 ms apart)
        toUnread(F); await new Promise((r) => setTimeout(r, 250)); await flush();
        const later = heldItems(store)[0] || {};
        Object.assign(out, { held2: k.held(), kind2: later.kind, urgency2: later.urgency, words2: wordsKey(later) });
      } finally { clearInterval(keep); }
    }
    try { k.shutdown(); } catch { } try { store.stop(); } catch { }
    if (!bootTorn && asRoot) { try { fs.rmSync(F, { recursive: true, force: true }); } catch { } }
    return out;
  };
  const RAISE = "kind: torn ? 'action' : 'notice', urgency: torn ? 'high' : 'normal'";
  ok(KSRC.split(RAISE).length === 2, 'control setup: the torn raise is found once');
  const AGAIN = "heldReg.state = a.state; heldMissingAt = 0; fileHeldNotice(); return; }";
  ok(KSRC.split(AGAIN).length === 2, 'control setup: the read again\'s re-file is found once');
  const tb = await tornScene(KREAL, 'torn-boot', { bootTorn: true });
  const tt = await tornScene(KREAL, 'turns-torn', { bootTorn: false });
  const tbx = await tornScene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, RAISE, "kind: 'notice', urgency: 'normal'", 'torn-raise-cut'), 'torn-raise-cut'), 'torn-boot-cut', { bootTorn: true });
  const ttx = await tornScene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, AGAIN, 'heldReg.state = a.state; heldMissingAt = 0; return; }', 'torn-again-cut'), 'torn-again-cut'), 'turns-torn-cut', { bootTorn: false });
  ok(tb.held && tb.kind0 === 'action' && tb.urgency0 === 'high' && tb.words0 === TORN_KEY, 'a boot over TORN bytes: held, and the item asks the person (an action, high) in words that say a read again will not mend it', tb);
  ok(tt.held && tt.kind0 === 'notice' && tt.urgency0 === 'normal' && tt.words0 === NOTICE_KEY && tt.kind1 === 'action' && tt.urgency1 === 'high' && tt.words1 === TORN_KEY && tt.same && tt.open1 === 1,
    'a failed read is a notice; the hold turning torn at a read again re-files the SAME item raised, in the torn words', tt);
  ok(tt.held2 && tt.kind2 === 'action' && tt.urgency2 === 'high' && tt.words2 === TORN_KEY, 'its read r3 (N2): a failed read after the torn bytes keeps the ask raised (nothing was mended)', tt);
  ok(tbx.held && tbx.kind0 === 'notice' && tbx.urgency0 === 'normal', 'CONTROL (no raise, in a copy): the torn file is a grey notice outside the badge — a state only the person can end, unasked — RED', tbx);
  ok(ttx.held && ttx.kind0 === 'notice' && ttx.kind1 === 'notice', 'CONTROL (the read again\'s re-file cut, in a copy): a hold that turns torn stays a grey notice — RED', ttx);
  // (1) a RESUME's explicit pick while held, then a restart still held: the restored owe is NEWER than the file's pin — judged, never the
  //     file's older pin kept over the person's newer pick; (2) a restored FORK is judged after its owed parent
  const PA = 'bk-00004444', FK = 'bk-00005555', KX = 'bk-00006666';
  const BODY7 = JSON.stringify({ ...JSON.parse(BODY), profiles: [...JSON.parse(BODY).profiles, { id: 'bp-0000b002', label: 'home', provider: 'chromium', dir: '/var/empty/vs-home-profile', createdAt: 2 }], pins: { [KX]: { profileId: 'bp-0000b001', origin: 'chosen', at: 1, by: 'user' } } });
  const restartScene = async (Mod, name) => {
    const { d, H, F } = dirOf(name); plant(F, BODY7);
    const k = mk(Mod, d, H);
    k.owePin(FK, { restored: true, facts: { fork: true, forkParentKey: PA } });   // restore order: the fork first
    k.owePin(PA, { restored: true, at: 5, facts: { explicit: 'bp-0000b002' } });
    k.owePin(KX, { restored: true, at: 5, facts: { explicit: 'bp-0000b002', priorKey: KX, resume: true } });   // newer than the file's pin (at 1)
    await k.boot().catch(() => null);
    let lifts = 0; k.onReadAgain(() => { lifts++; });
    await lift(k, F, BODY7, () => lifts > 0);
    const pf = (x) => { const v = k.pinFor(x); return v ? `${v.profileId}/${v.origin}` : null; };
    const out = { pa: pf(PA), fk: pf(FK), kx: pf(KX) };
    try { k.shutdown(); } catch { }
    return out;
  };
  const NEWER = '&& Number(pinFor(browserKey).at || 0) >= Number(owed.at || 0)) {', ORDER = '    for (const k of order) { const o = owedPins.get(k); if (o) judgeOwedPin(k, o); }';
  ok(KSRC.split(NEWER).length === 2 && KSRC.split(ORDER).length === 2, 'control setup: the owe-time compare and the parent-first order are found once');
  const r7 = await restartScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'restart-held');
  const r7a = await restartScene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, NEWER, ') {', 'restart-no-time'), 'restart-no-time'), 'restart-no-time');
  const r7b = await restartScene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, ORDER, '    for (const [k, o] of all) if (owedPins.has(k)) judgeOwedPin(k, o);', 'restart-no-order'), 'restart-no-order'), 'restart-no-order');
  ok(r7.kx === 'bp-0000b002/chosen' && r7.pa === 'bp-0000b002/chosen' && r7.fk === 'bp-0000b002/conversation', 'after a restart still held: the resume\'s newer explicit pick wins over the file\'s older pin (1); the restored fork is judged after its owed parent and copies its pin (2)', r7);
  ok(r7a.kx === 'bp-0000b001/chosen' && r7b.fk === null, 'CONTROLS: without the time compare the file\'s older pin is kept over the person\'s newer pick (1); in restore order the fork is judged first and copies nothing (2) — each RED', { r7a, r7b });
  // (5a) the orphan census and the tick while held: a daemon of ours that no record keeps is NOT ended (the held registry names none)
  const AB = '/opt/x/agent-browser-linux-x64', NOW7 = Date.now();
  const censusScene = async (Mod, name) => {
    const { d, H, F } = dirOf(name); plant(F, BODY);
    const CFG = path.join(d, 'browser-env'); fs.mkdirSync(CFG, { recursive: true });
    let rows = [{ pid: 9904, ppid: 1, starttime: 444, startedAt: NOW7 - 3 * 3600e3, argv: [AB], env: { AGENT_BROWSER_DAEMON: '1', AGENT_BROWSER_CONFIG: path.join(CFG, 'machine-ephemeral-bk-0000000d.json') } }];
    const ended = [];
    const k = mk(Mod, d, H, { liveKeys: () => new Set(), now: () => NOW7, daemonTable: async () => rows, endIdentity: async (pid, st) => { ended.push(`${pid}:${st}`); rows = []; return 'ended'; } });
    await k.boot().catch(() => null);
    await k.tick().catch(() => null);
    await k.orphanCensus('the tick', NOW7 + 3600e3, { force: true });
    const out = { held: k.held(), ended: ended.join() };
    if (!asRoot) fs.chmodSync(F, 0o644);
    try { k.shutdown(); } catch { }
    return out;
  };
  const CG = '    if (heldReg) return Promise.resolve(null);   // the B-f276 remainder: a held registry names no record', TG = "    if (heldReg) return;   // the B-f276 remainder: nothing is judged on a held registry\n";
  ok(KSRC.split(CG).length === 2 && KSRC.split(TG).length === 2, 'control setup: the census\'s and the tick\'s held guards are found once');
  const c7 = await censusScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'census-held');
  const c7x = await censusScene(MJ.load('src/server/browser-keeper.js', anchored(anchored(KSRC, CG, CG.replace('if (heldReg)', 'if (false)'), 'census-guard-cut'), TG, '', 'tick-guard-cut'), 'census-held-cut'), 'census-held-cut');
  ok(c7.held && c7.ended === '', 'while held the tick and the orphan census end NO daemon (the held registry names no record — every one would read «unkept»)', c7);
  ok(c7x.ended === '9904:444', 'CONTROL (both guards cut, in a copy): the census ENDS a live browser daemon on the held registry — RED', c7x);
  // (5b) ONE read in flight while the storage hangs; (5c) a «missing» answer right after an unreadable one is read once more
  const readScene = async (Mod, name, mode) => {
    const { d, H, F } = dirOf(name); plant(F, BODY);
    const realRead = fs.promises.readFile; let calls = 0, missingReads = 0;
    const k = mk(Mod, d, H);
    k.held();
    if (mode === 'missing') { fs.rmSync(F, { recursive: true, force: true }); }
    fs.promises.readFile = (f, ...a) => { if (String(f) !== F) return realRead.call(fs.promises, f, ...a); calls++; if (mode === 'hang') return new Promise(() => { }); if (mode === 'missing') { missingReads++; } return realRead.call(fs.promises, f, ...a); };
    let lifted = 0; k.onReadAgain(() => { lifted = missingReads; });
    const keep = setInterval(() => { }, 1000);
    try { for (let i = 0; i < 40 && !(mode === 'missing' && lifted); i++) await new Promise((r) => setTimeout(r, 10)); } finally { clearInterval(keep); fs.promises.readFile = realRead; }
    const out = { calls, liftedAfter: lifted, held: k.held() };
    try { k.shutdown(); } catch { }
    return out;
  };
  const SLOT = '    if (heldP) return;\n    const p = heldP = fs.promises.readFile(storeFile', MISS = "    if (a.state === 'missing' && !heldMissingAt) { heldMissingAt = now(); return; }\n";
  ok(KSRC.split(SLOT).length === 2 && KSRC.split(MISS).length === 2, 'control setup: the one slot and the read once more are found once');
  const h7 = await readScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'read-hang', 'hang');
  const h7x = await readScene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, SLOT, '    const p = heldP = fs.promises.readFile(storeFile', 'read-slot-cut'), 'read-hang-cut'), 'read-hang-cut', 'hang');
  ok(h7.calls === 1 && h7.held && h7x.calls > 2, 'ONE read in flight while the storage hangs (the next tries re-arm and wait); CONTROL (the slot cut, in a copy): a new read per try, each holding a pool thread — RED', { h7, h7x });
  // (3) the two other fence readers fail CLOSED on the hold, as liveFillVerdictFor does (a held registry is no «no fences»)
  const BDs = fs.readFileSync(path.join(ROOT, 'src/server/browser-dialogs.js'), 'utf8'), RBs = fs.readFileSync(path.join(ROOT, 'src/routes/browser.js'), 'utf8');
  ok(BDs.includes("catch (e) { if (e && e.code === 'store_unread') return Object.assign([], { held: true }); st = null; }") && BDs.includes("catch (e) { if (e && e.code === 'store_unread') return { targetId: targetId ? String(targetId) : null, origin: null, held: true, holdReason: 'store_unread' }; st = null; }")
    && RBs.includes('const checkActiveTabFence = !!(fencedTabs.held || (fencedTabs.length &&'), 'round wm6qxcqcw (3): fencedTargetsFor answers HELD (the route checks the active tab), liveFillOnTarget a held fence (its callers scrub / mask / refuse) — never «no fences»');
  const m7 = await readScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'read-missing', 'missing');
  const m7x = await readScene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, MISS, '', 'read-once-more-cut'), 'read-missing-cut'), 'read-missing-cut', 'missing');
  ok(m7.liftedAfter === 2 && m7x.liftedAfter === 1, 'a «missing» answer right after an unreadable one is read ONCE MORE before an empty start; CONTROL (cut, in a copy): the first «missing» starts empty — RED', { m7, m7x });
}

console.log('§8 主开发 r221 (2026-11-20 14:20Z): a removed profile\'s login values IN MEMORY go AT THE PRESS — never behind the registry\'s write');
{
  // THE STALL is placed in the landing: the process writer's afterLanding HOLDS every step riding browser-profiles.json (the storage
  // has not taken the write). The removal's memory-only credential drops (onProfileDropNow — browser-dialogs' login values) have run
  // when the call returns; what must match the disk (onProfileDrop: the grant row, the passkey store, the marked config) waits; the
  // storage answers — the held steps run, and the rest follows. RED: the tip's order (the memory drop behind the write), in a copy
  const W = require(path.join(ROOT, 'src/store-writer.js')).storeWriter();
  const mk8 = (Mod, name) => { const d = path.join(D, 'r221-' + name), H = path.join(d, 'home'); fs.mkdirSync(H, { recursive: true }); return Mod.create({ dataDir: d, homeDir: H, env: () => ({ HOME: H }), serverSetting: () => undefined, install: false, log: quiet }); };
  const dropScene = async (Mod, name) => {
    const k = mk8(Mod, name); await k.boot().catch(() => null);
    const p = k.createProfile({ label: 'to remove ' + name });
    try { W.flushSync(); } catch { }   // its creation on disk first (the stall is the REMOVAL's)
    const now = [], rides = [];
    if (typeof k.onProfileDropNow === 'function') k.onProfileDropNow((pid) => now.push(pid));
    k.onProfileDrop((pid) => rides.push(pid));
    const held = [], orig = W.afterLanding;
    W.afterLanding = (file, step) => { held.push(step); return new Promise(() => { }); };
    let threw = null; try { k.removeProfile(p.id); } catch (e) { threw = e && e.message; } finally { W.afterLanding = orig; }
    const during = { now: now.slice(), rides: rides.slice(), held: held.length, listed: k.list().profiles.some((x) => x.id === p.id) };
    for (const st of held) { try { st(); } catch { } }   // the storage answers
    const after = { now: now.slice(), rides: rides.slice() };
    try { W.flushSync(); } catch { } try { k.shutdown(); } catch { }
    return { id: p.id, threw, during, after };
  };
  const r = await dropScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'real');
  ok(!r.threw && r.during.held >= 1 && !r.during.listed && JSON.stringify(r.during.now) === JSON.stringify([r.id]) && r.during.rides.length === 0 && JSON.stringify(r.after.rides) === JSON.stringify([r.id]) && r.after.now.length === 1,
    'r221: while the storage HOLDS the removal\'s write, the profile\'s memory-only credential drops have RUN at the press (the login values gone while the write is still out) — what must match the disk waits for the landing, then runs once', r);
  const NOW_A = "    for (const fn of [...profileDropNowListeners]) { try { fn(id); } catch { /* best effort */ } }   // r221: a credential's MEMORY goes at the press — never behind the write\n";
  const rx = await dropScene(MJ.load('src/server/browser-keeper.js', anchored(KSRC, NOW_A, '', 'drop-now-cut'), 'drop-now-cut'), 'red');
  ok(rx.during.now.length === 0 && JSON.stringify(rx.after.rides) === JSON.stringify([rx.id]), 'CONTROL (the tip\'s order — the memory drop behind the write, in a copy): the removed profile\'s login values are still in memory while the write is out (red) — and the copy still ran the scene (its landing\'s listeners fired once)', rx);
  const BDS = fs.readFileSync(path.join(ROOT, 'src/server/browser-dialogs.js'), 'utf8');
  ok(/const clearLoginMemory = \(profileId\) => \{ const pid = String\(profileId \|\| ''\); if \(pid\) clearProfileLoginFencesOnStop\(pid, watches\.get\(pid\)\); \};/.test(BDS) && /unsubDrops\.push\(keeper\.onProfileDropNow\(clearLoginMemory\)\)/.test(BDS),
    'r221: the login watch hands its MEMORY clear (clearProfileLoginFencesOnStop — the values, the one-time codes, the in-flight asks, the scrub names) to the keeper\'s at-the-press listeners (a pin: the watch needs a browser)');
  // r346 (主开发 17:15Z — THE LAW: every road that cleared the login memory at the release still clears it): the keeper's lease-tabs drop
  // (dropLeaseTabs) deletes a profile's persisted fence state on TWO roads with no removal — its browser READY AGAIN and not adopted (a
  // fresh Chrome after a crash), and a browser REPLACED — and fires onProfileDrop: the dialogs' clear hangs on BOTH doors, so each road
  // clears the profile's login values in memory. RED: the tip's single subscription (the at-the-press door only), in a copy
  const LFM = require(path.join(ROOT, 'src/server/browser-login-fill.js'));
  const dlgScene = (DMod, tag) => {
    const nowL = new Set(), rideL = new Set();
    const keeper = { onProfileDropNow: (fn) => { nowL.add(fn); return () => nowL.delete(fn); }, onProfileDrop: (fn) => { rideL.add(fn); return () => rideL.delete(fn); }, loginFenceStateOf: () => ({ fences: [] }) };
    const d = DMod.create({ keeper, log: quiet });
    const pid = 'bp-r346' + tag, out = {};
    for (const road of ['ready-not-adopted', 'replaced', 'removal']) {
      const tid = `T-r346-${tag}-${road}`;
      LFM.rememberFilledSecrets(tid, 0, [`a login value (${road})`], pid);
      const before = LFM.valuesForTarget(tid).length;
      for (const fn of [...(road === 'removal' ? nowL : rideL)]) fn(pid);   // the lease-tabs drop, as either road fires it — or the removal's press (the at-the-press door)
      out[road] = { before, after: LFM.valuesForTarget(tid).length };
    }
    const doors = { now: nowL.size, ride: rideL.size };
    try { d.shutdown(); } catch { } try { LFM.clearFilledSecretsForProfile(pid); } catch { }
    return { ...out, doors, unsubscribed: nowL.size + rideL.size };
  };
  const dg = dlgScene(require(path.join(ROOT, 'src/server/browser-dialogs.js')), 'real');
  ok(dg['ready-not-adopted'].before === 1 && dg['ready-not-adopted'].after === 0 && dg.replaced.before === 1 && dg.replaced.after === 0 && dg.removal.before === 1 && dg.removal.after === 0 && dg.doors.now === 1 && dg.doors.ride === 1 && dg.unsubscribed === 0,
    'r346: the dialogs\' clear hangs on BOTH doors — a profile\'s browser ready again and not adopted, and a browser replaced (the lease-tabs drop) clear its login values in memory; the removal clears them at the press; the watch\'s end lets both go', dg);
  const BOTH_A = "  if (keeper && typeof keeper.onProfileDrop === 'function') unsubDrops.push(keeper.onProfileDrop(clearLoginMemory));\n";
  const dgx = dlgScene(MJ.load('src/server/browser-dialogs.js', anchored(BDS, BOTH_A, '', 'drop-door-cut'), 'drop-door-cut'), 'red');
  ok(dgx['ready-not-adopted'].after === 1 && dgx.replaced.after === 1 && dgx.removal.after === 0, 'CONTROL (the tip\'s single subscription — the at-the-press door only, in a copy): a fresh browser not adopted and a replaced browser leave the profile\'s login values in memory after the keeper deleted its fence state (red)', dgx);
  const KS8 = fs.readFileSync(path.join(ROOT, 'src/server/browser-keeper.js'), 'utf8');
  ok(/\(ev\.kind === 'browser-ready' && !ev\.adopted\)\)\) \{ dropLeaseTabs\(ev\.profileId\);/.test(KS8) && /if \(replaced\) \{ const n = dropLeaseTabs\(rec\.profileId\);/.test(KS8) && /function dropLeaseTabs\(profileId\) \{[\s\S]{0,700}for \(const fn of \[\.\.\.profileDropListeners\]\) \{ try \{ fn\(pid\); \}/.test(KS8),
    'r346: the keeper\'s two roads into the lease-tabs drop (a browser ready and not adopted; a replaced browser) fire the drop door the dialogs hang on (pins: the roads need a browser)');
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'browser-registry-held ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
