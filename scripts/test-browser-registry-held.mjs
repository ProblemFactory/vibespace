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
    return out;
  };
  const r = await scene(require(path.join(ROOT, 'src/server/browser-keeper.js')), 'held');
  ok(r.held && /could not be read/.test(r.words), 'browser-profiles.json unreadable at load: HELD, and its words say so', r);
  ok(r.create === 'store_unread' && r.registered === 'store_unread' && r.pin && r.pin.held === true, 'while held a create is refused by name, «is this folder a profile\'s» answers by name (the kept sweep\'s catch then keeps the folder), the create\'s pin ladder answers «held» — never «no longer exists»', r);
  ok(r.boot === 'held' && (asRoot || r.keptWhileHeld), 'the boot judges NOTHING on the held registry (no reconcile, no orphan census, no first commit) — nothing is written over the file', r);
  ok(r.lifted && r.profile && r.lifts === 1 && r.file === 1, 'read again OFF the loop: the hold lifts, the profile is back, the steps after the boot run once (onReadAgain), the file still holds its profile', r);
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
  const held = k.held(), b = await k.boot();
  const after = fs.readFileSync(F, 'utf8');
  try { k.shutdown(); } catch { }
  ok(held && b && b.held && after === '{"version": 1, "profiles": [', 'torn bytes: HELD — the boot judges nothing and the bytes stay as they are (no empty registry written over them)', { held, after });
  // a parse that is not a registry (an array, an object without profiles) is CORRUPT — it was a silent EMPTY registry
  const d2 = path.join(D, 'shape'), H2 = path.join(d2, 'home'); fs.mkdirSync(H2, { recursive: true });
  fs.writeFileSync(path.join(d2, 'browser-profiles.json'), JSON.stringify({ version: 1 }));
  const k2 = require(path.join(ROOT, 'src/server/browser-keeper.js')).create({ dataDir: d2, homeDir: H2, env: () => ({ HOME: H2 }), serverSetting: () => undefined, install: false, log: quiet, unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
  const h2 = k2.held(); try { k2.shutdown(); } catch { }
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
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'browser-registry-held ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
