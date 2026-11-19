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
import { scratch } from './scratch.mjs';
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
    out.pin = (() => { try { return k.pinForCreate({ priorKey: 'vs-bk-aaaaaaaaaaaa', resume: true }); } catch (e) { return { threw: e && e.code }; } })();
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
    out.file = (() => { try { fs.chmodSync(F, 0o644); return JSON.parse(fs.readFileSync(F, 'utf8')).profiles.filter((p) => p && p.id === 'bp-0000b001').length; } catch (e) { return '(' + (e.code || 'unparsed') + ')'; } })();   // the ORIGINAL profile on disk
    out.rewritten = (() => { try { return typeof JSON.parse(fs.readFileSync(F, 'utf8')).host === 'string'; } catch { return false; } })();   // the owed boot's commit stamps the writer
    return out;
  };
  const r = await scene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'held');
  ok(r.held && /could not be read/.test(r.words), 'browser-profiles.json unreadable at load: HELD, and its words say so', r);
  ok(r.create === 'store_unread' && r.registered === 'store_unread' && r.pin && r.pin.held === true, 'while held a create is refused by name, «is this folder a profile\'s» answers by name (the kept sweep\'s catch then keeps the folder), the create\'s pin ladder answers «held» — never «no longer exists»', r);
  ok(r.boot === 'held' && (asRoot || r.keptWhileHeld), 'the boot judges NOTHING on the held registry (no reconcile, no orphan census, no first commit) — nothing is written over the file', r);
  ok(r.lifted && r.profile && r.lifts === 1 && r.file === 1 && r.rewritten, 'read again OFF the loop: the hold lifts, the profile is back, the OWED boot runs (its commit re-saves the file — the writer stamped), the steps after the boot run once (onReadAgain), the file still holds its profile', r);
  // its read r1 (N3a): a copy whose read skips the owed boot — the file is never re-saved by the boot (nothing judged after the read)
  const OWED = '    if (bootOwed) { bootOwed = false; try { await boot(); }';
  ok(KSRC.split(OWED).length === 2, 'control setup: the anchor of the control «the owed boot at the read» is in browser-keeper.js');
  const ro = await scene(MJ.load('src/server/browser-keeper.js', KSRC.replace(OWED, '    if (false) { bootOwed = false; try { await boot(); }'), 'registry-no-owed-boot'), 'held-no-owed-boot');
  ok(ro.lifted && !ro.rewritten, 'CONTROL (the owed boot cut, in a copy): the read lifts the hold but the boot\'s path never runs over what it read', { lifted: ro.lifted, rewritten: ro.rewritten });
  // CONTROL: the release's load (any failure ⇒ an empty registry) — the boot's commit writes the EMPTY registry over the file
  const LOADH = "    else { reg = B.normalizeRegistry(null); if (a.state !== 'missing') holdRegistry(a); }";
  ok(KSRC.split(LOADH).length === 2, 'control setup: the anchor of the control «the release\'s load» is in browser-keeper.js');
  const rx = await scene(MJ.load('src/server/browser-keeper.js', KSRC.replace(LOADH, "    else { reg = B.normalizeRegistry(null); }   /* MUTANT: the release — any failure is an empty registry */"), 'registry-release'), 'held-release', { lift: false });
  ok(!rx.held && rx.boot === 'ran' && (asRoot || rx.file === 0), 'CONTROL (the release\'s load, in a copy): no hold — the boot runs on the EMPTY registry and writes over the file (the original profile gone from it)', rx);
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
    return bodyOf(F) === (asRoot ? '(a folder)' : BODY);
  };
  const g1 = await saveScene(KSRC.replace(cref + '\n', ''), 'save-guard-only');
  const g0 = await saveScene(KSRC.replace(cref + '\n', '').replace(SAVEG, '    /* MUTANT: no save guard */'), 'save-guard-cut');
  ok(g1 && (asRoot || !g0), 'the save\'s held check is its FIRST line: with the create\'s refusal cut, nothing is written over the held file; CONTROL (the guard cut too, in a copy): the new registry is written over it', { g1, g0 });
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
  const heldKeeper = { held: () => true, heldWords: () => 'browser-profiles.json could not be read', ephemeralFor: () => null, profileDirRegistered: () => { throw Object.assign(new Error('held'), { code: 'store_unread' }); } };
  const sweepOf = async (Mod, name) => { const d = path.join(D, name); fs.mkdirSync(d, { recursive: true }); const ks = Mod.create({ dataDir: d, keeper: heldKeeper, log: quiet, sweepEveryMs: 0 }); const r = await ks.sweep(); try { ks.stop && ks.stop(); } catch { } return r; };
  const sw = await sweepOf(KM, 'kept-held'), swx = await sweepOf(MJ.load('src/server/browser-kept.js', KP.replace(SW, '    /* MUTANT: the sweep runs on a held registry */'), 'kept-no-held'), 'kept-held-mut');
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
  ok(WC.includes("if (pinOwed) { session._browserPinOwed = pinOwed; try { require('./server/browser-keeper.js').keeper()?.owePin?.(bk.key, pinOwed); }") && WC.includes('browserPinOwed: session._browserPinOwed || undefined,')
    && WC.includes('spawnPinWitness = { owed: pinOwed, at: Date.now() };') && WC.includes('integrationOn && !pin.held)') && WC.includes('kp.pinVerdictForCreate({ facts: pinFacts, hint, formGroups })'),
    'a create while held OWES its pin: under its key (the keeper judges it at the read, whatever became of the session) and in its record; a keyless one in its start witness; both roads judge through ONE verdict');
  ok(BR.includes("_browserPinOwed: meta.browserPinOwed && typeof meta.browserPinOwed === 'object'") && MP.includes('browserKeeper.owePin?.(s._browserKey, { ...s._browserPinOwed, restored: true })') && MP.indexOf('browserKeeper.owePin?.(s._browserKey, { ...s._browserPinOwed, restored: true })') < MP.indexOf('Promise.resolve(gate).catch(() => null).then(() => browserKeeper.boot())') && MP.includes('browserKeeper.onOwedPin?.((key, res) => {')
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
  const K1 = 'bk-0000bbbb', KF = 'bk-0000cccc', KW = 'bk-0000dddd', KH = 'bk-0000ffff', KS = 'bk-00001111';
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
    ].map((x) => !!(x && x.owed));
    k.onOwedPin((key, res) => order.push(`${key.slice(-4)}:${res.pin ? res.pin.profileId + '/' + res.pin.origin : 'none'}`));
    k.onReadAgain(() => { order.push('lift'); });
    await k.boot().catch(() => null);
    unplant(F, BODY5);
    const keep = setInterval(() => { }, 1000);
    try { for (let i = 0; i < 300 && !order.includes('lift'); i++) await new Promise((r) => setTimeout(r, 10)); } finally { clearInterval(keep); }
    await flush();
    const pf = (x) => { const v = k.pinFor(x); return v ? `${v.profileId}/${v.origin}/${v.at === 1 ? 'at1' : 'now'}` : null; };
    Object.assign(out, { k1: pf(K1), kf: pf(KF), parent: pf(PARENT), kr: pf(KR), kh: pf(KH), ks: pf(KS), kw: pf(KW), cap1: k.groupCapOf(K1), capS: k.groupCapOf(KS), order });
    try { k.shutdown(); } catch { }
    return out;
  };
  const o = await owedScene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'owed');
  ok(o.held && o.owe.every(Boolean), 'while held each create OWES its pin', o);
  ok(o.k1 === 'bp-0000b001/chosen/now' && o.cap1 === 2, 'at the read the New Session pick is pinned under the conversation\'s key — though no session was there to ask (r2 M3) — and its Task Group cap is stamped (r2 S4); the resume\'s weaker facts did not replace it', o);
  ok(o.kf === 'bp-0000b001/conversation/at1' && o.kw === null, 'a fork made while held takes its parent\'s pin as the keeper\'s copy (the parent\'s row verbatim — r2 M1r); nothing to pick pins nothing', o);
  ok(o.parent === 'bp-0000b001/chosen/at1' && o.kr === 'bp-0000b002/chosen/now', 'r3 M4: a RESTORED record\'s facts never re-judge a key that has its pin (judged before, or pinned since by the person); a resume\'s own explicit pick still ranks over its pin', o);
  ok(o.kh === 'bp-0000b001/task-group/now' && o.ks === 'bp-0000b001/instance/now' && o.capS === 1, 'r3 S10 / S8: the owed road takes the dialog\'s hint (its value IS the group\'s default: task-group, not chosen); the instance default and the group cap are the START\'s (the setting is empty now, the group\'s cap is 2 now)', o);
  const ri = o.order.indexOf('read-again');
  ok(ri > 0 && o.order.slice(0, ri).length === 7 && o.order[o.order.length - 1] === 'lift', 'the owed pins are judged right after the read\'s load — BEFORE the owed boot (r2 S3) — and told to the sessions\' copies (r2 N11)', o.order);
  const JUDGE = "    if (!heldReg) { try { judgeOwedPins(); } catch (e) { log.warn?.(`[browser] the pins the creates owed after the read: ${e && e.message}`); } }\n";
  const BOOTL = "    if (bootOwed) { bootOwed = false; try { await boot(); } catch (e) { log.warn?.(`[browser] the boot's path after the read failed: ${e && e.message}`); } }\n";
  const BOOTJ = "    if (owedPins.size) { try { judgeOwedPins(); }";
  const FORK = "      if (pin.profileId && pin.origin === 'conversation' && f.fork && f.forkParentKey && f.forkParentKey !== browserKey) out = copyPin(";
  const KEEP = "    if (owed && owed.restored && pinFor(browserKey)) {", HINT = "pin = pinVerdictForCreate({ facts: f, hint: owed.hint || null,", CAPV = "owed.cap !== undefined ? { value: owed.cap } : {}";
  ok([JUDGE, BOOTL, BOOTJ, FORK, KEEP, HINT, CAPV].every((x) => KSRC.split(x).length === 2), 'control setup: the read\'s judge, the owed boot, the boot\'s judge, the fork\'s copy, the restored keep, the hint and the start\'s cap are found once');
  const mut = (pairs, tag) => MJ.load('src/server/browser-keeper.js', pairs.reduce((t, [a, b]) => t.replace(a, b), KSRC), tag);
  const ox = await owedScene(mut([[JUDGE, ''], [BOOTJ, '    if (false) { try { judgeOwedPins(); }']], 'owed-not-judged'), 'owed-not-judged');
  const of = await owedScene(mut([[FORK, '      if (false) out = copyPin(']], 'owed-no-fork-copy'), 'owed-no-fork-copy');
  const okp = await owedScene(mut([[KEEP, '    if (false) {']], 'owed-no-restored-keep'), 'owed-no-restored-keep');
  const oh = await owedScene(mut([[HINT, 'pin = pinVerdictForCreate({ facts: f, hint: null,'], [CAPV, '{}']], 'owed-no-hint-no-cap'), 'owed-no-hint-no-cap');
  const oa = await owedScene(mut([[JUDGE, ''], [BOOTL, BOOTL + JUDGE]], 'owed-after-boot'), 'owed-after-boot');
  ok(ox.k1 === null && ox.kf === null && of.kf === null && of.k1 === 'bp-0000b001/chosen/now', 'CONTROLS: a read that judges no owed pin leaves the pick and the fork unpinned for good (r2 M3); a judge with no fork copy leaves the fork unpinned (r2 M1r) — each RED', { ox, of });
  ok(okp.parent === 'bp-0000b002/chosen/now' && oh.kh === 'bp-0000b001/chosen/now' && oh.capS === 2, 'CONTROLS: without the restored keep the stale facts REVERT the pin (r3 M4); without the hint the group\'s default reads as the person\'s own pick, and without the start\'s cap the group\'s cap of today is stamped (r3 S10 / S8) — each RED', { okp, oh });
  const ra = oa.order.indexOf('read-again');
  ok(ra === 0, 'CONTROL: the judge moved after the owed boot — the read-again line comes first, the pins after (r3 S10: the «before the owed boot» half) — RED', oa.order);
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
    out.file = (() => { try { return JSON.parse(fs.readFileSync(F, 'utf8')).profiles.length; } catch (e) { return '(' + (e.code || 'unparsed') + ')'; } })();
    return out;
  };
  const f1 = await faultScene(KSRC.replace(HEAD, FAULT), 'load-fault', (k) => /load-threw/.test(String(k.heldWords() || '')));
  ok(KSRC.split('heldReg = was; ').length === 2, 'control setup: the catch\'s hold kept (heldReg = was) is found once');
  const f0 = await faultScene(KSRC.replace(HEAD, FAULT).replace(REHOLD, '}').replace('heldReg = was; ', ''), 'load-fault-no-rehold', (k, lifts) => lifts > 0);   // the r2-era catch: it only says the throw
  ok(f1.held0 && f1.heldAfter && /load-threw/.test(f1.words) && f1.lifts === 0 && f1.file === 1, 'a load that throws at the read (the read again DID come: its words say load-threw): the store is HELD again, nothing judged, the file keeps its profile', f1);
  ok(f0.lifts === 1 && f0.file === 0, 'CONTROL (no re-hold, in a copy): the owed boot runs over the EMPTY registry and commits it — every profile gone from the file — RED', f0);
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'browser-registry-held ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
