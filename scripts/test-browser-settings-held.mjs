#!/usr/bin/env node
// B-50e7 (主开发 r3332 / r3443 / r3747, lane bl-proposals): WHILE VIBESPACE's SETTINGS CANNOT BE READ the agent browser keeps the
// person's choices. The held view carries no browser.* or plugin.* row, so the release's readers fell to every default: a browser set
// never to stop was stopped at 15 minutes, the ephemeral release at 3, a person's takeover lapsed on the default time, a plugin's
// address list fell to its manifest's wider one, the exit check said «no address is set», the caps line showed the default ceiling as
// the person's, a start launched PATH's browser tool over the person's pin — and (r3747) the kept browsers' sweep removed sign-ins down
// to the default total, a conversation's spawn environment carried the default idle clock for its life, and the trace recorded for a
// person who had turned it off. THE LAW: held, each choice is THE LAST VALUE KNOWN in this process (memory only); nothing known (a start
// while held) ⇒ THE SAFE SIDE, scene by scene; the lift is the door answering null again — no restart. The settings held is a PLACED
// refusal: the door (settingsHeld, wired by production to the persistence router) answers held, and the read answers what the held view
// answers (no browser or plugin row, the hold's marker under Symbol.for('vibespace.settings-held')).
//   B1 held after a read: the clocks, the person's keep time, the cap keep the last values known (non-zero values: never the safe side's 0)
//   B2 held at a start (nothing known): no clock stops, releases or lapses anything (0); the cap is the product's default and SAID
//      unread; the exit check is refused by name; a plugin reaches no address, its refusal naming the hold and nothing of any list; a
//      launch uses the pin the last run kept, before PATH — only past the memo road's own check (a vanished program is never «installed»)
//   B3 the lift: the file's values again, with no restart
//   B4 production's names: the hub wires the keeper's, the kept store's and the spawn environment's door to the persistence router's
//   B5 the kept browsers' sweep (r3747 must 1): held ⇒ nothing removed, the bounds said unread; the lift ⇒ the person's bound applies
//   B6 the conversation's spawn environment (r3747 must 2): a start while held writes no default idle clock into it
//   B7 the action trace: held ⇒ the last choice known; nothing known ⇒ it records nothing and its frames' sweep waits
//   B8 a window takeover's clock: held ⇒ the last value known; nothing known ⇒ never lapses
//   B9 the egress proxy's journal line (r3443 hold 4): a COUNT of its list, never the list
//   B10 where a person looks: the browser panel says the hold for the bounds it cannot read
//   B11 «Reach tailnet hosts from browsers» (a plugin row of the agent browser's road): held ⇒ the last value known; nothing known ⇒
//       OFF, said by its own reason in en / zh / ja — never «the switch is off»
//   THE FOLLOW (主开发 r3941):
//   B12 the kept sweep asks the hold AGAIN after its measure: a hold that begins while the sizes are measured removes nothing
//   B13 what the hold turned off comes back at the LIFT, with no restart and no launch — ONE hook: the tailnet door opens on its kept
//       port, the trace arms the taps of the browsers already running
//   B14 the trace off by the hold is said by ITS reason (browser_settings_unread, the hold's words), never «off» with a «Turn on» door
//   B15 the two sweeps' journal line once a hold, not once a pass; the Sweep press's reply says the hold
//   B16 the keeper's journal says a person's own browser is kept with no end, never «0 h»
//   B17 (主开发 r4060, the small follow): a SECOND lift doubles no tap and no door; a person's own browsing tap is armed at the lift;
//       the open views are told at once; the Sweep press's toast says WHICH sweep waited and still gives what was removed; each
//       branch of the hub's hook in its own guard
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const ROOT = scratch('browser-settings-held');
const quiet = { log() { }, warn() { }, error() { } };
const PROXY = 'http://proxy.example.invalid:3128';   // a port-free loopback is not needed: a .invalid host, never dialed (the TLS stand-in refuses)
const CHECK = 'https://check.example.invalid/ip';
const PLUGIN = { engine: 'plug-x', label: 'Plug X', setting: 'plugin.plug-x.egressAllowlist', fallback: '.wide-manifest.example, a.example' };
const MARK = Symbol.for('vibespace.settings-held');
const MB = 1024 * 1024;

let worlds = 0;
/** the reader as production hands it while held: no browser or plugin row, and the hold's facts under the marker */
const heldView = (st) => (k) => (k === MARK ? (st.held || undefined) : st.held && /^(browser|plugin)\./.test(k) ? undefined : st.settings[k]);
/** a real keeper over a scratch world; `held` is the door's answer (null = the settings read) — the read answers the held view while held */
function world({ held = null, settings = {}, pinFile = null, log = quiet } = {}) {
  const W = path.join(ROOT, 'w' + (++worlds)), H = path.join(W, 'home'), D = path.join(W, 'data'), BIN = path.join(W, 'bin');
  for (const d of [path.join(H, '.agent-browser'), D, BIN]) fs.mkdirSync(d, { recursive: true });
  if (pinFile) { fs.mkdirSync(path.join(D, 'browser-tools'), { recursive: true }); fs.writeFileSync(path.join(D, 'browser-tools', 'cli-pin.json'), JSON.stringify(pinFile)); }
  const rtE = { PATH: BIN, HOME: H };
  const st = { held, settings: { ...settings } };
  const kp = K.create({ dataDir: D, homeDir: H, env: () => rtE, liveKeys: () => new Set(), runtime: F.createBrowserRuntime({ env: rtE }), facts: F.createBrowserFacts({ env: rtE }), log, tickMs: 3600e3, install: false,
    broadcast: () => { }, serverSetting: heldView(st), settingsHeld: () => st.held });
  return { kp, st, W, D, done: () => { try { if (kp.shutdown) kp.shutdown(); } catch { /* none */ } } };
}
/** a runnable stand-in program for the kept pin (a scratch file, never run here) */
function placedProgram(W) { const p = path.join(W, 'kept-pin', 'agent-browser'); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '#!/bin/sh\nexit 0\n'); fs.chmodSync(p, 0o755); return p; }
const HELD = { kind: 'unreadable', code: 'EIO' };
// the person's own values — non-zero, so «the last value known» is never mistaken for the safe side's 0 (r3747 should)
const PERSON = { 'browser.idleTimeoutMs': 600000, 'browser.idleReleaseAfterTurnMs': 420000, 'browser.takeoverIdleMs': 1200000, 'browser.humanKeepMs': 7200000, 'browser.maxRunning': 12, 'browser.exitCheckUrl': CHECK, [PLUGIN.setting]: 'a.example' };
const reads = (kp) => (typeof kp._heldReads === 'function' ? kp._heldReads() : null);
const pinReadOf = (kp) => { const r = reads(kp); return r && r.pinRead && typeof r.pinRead.then === 'function' ? r.pinRead : Promise.resolve(); };
const exitOf = async (w) => { const p = w.kp.createProfile({ label: 'Exit ' + worlds, proxy: PROXY }, { owner: { kind: 'instance', id: null } }); return w.kp.exitCheck(p.id, { tlsConnect: async () => { throw Object.assign(new Error('no network in this leg'), { code: 'ENETDOWN' }); }, deadlineMs: 500 }); };

// ── B1 — HELD AFTER A READ: the last values known ────────────────────────────────────────────────────────────────────────────
console.log('B1 the settings read, then held: the clocks, the person\'s keep time and the cap keep the person\'s last values');
{
  const w = world({ settings: PERSON });
  const r0 = reads(w.kp), rel0 = w.kp.idleReleaseAfterMs(), tko0 = w.kp.takeoverIdleMs();
  ok(!!(rel0 === 420000 && tko0 === 1200000), 'B1 — the scene: readable, the person\'s 7 minutes for the release and 20 for the takeover stand', { rel0, tko0, r0 });
  w.st.held = HELD;
  const r1 = reads(w.kp), rel1 = w.kp.idleReleaseAfterMs(), tko1 = w.kp.takeoverIdleMs();
  ok(!!(rel1 === 420000 && tko1 === 1200000), 'B1 — THE LAW (held: the last value known): the ephemeral release and the takeover keep the person\'s 7 and 20 minutes — RED: they fall to 3 minutes and the default lapse', { rel1, tko1 });
  ok(!!(r1 && r1.idleMs === 600000 && r1.cap === 12 && r1.capUnread === false), 'B1 — THE LAW: the idle sweep keeps the person\'s 10 minutes and the ceiling the person\'s 12 (not unread: it is known) — RED: 15 minutes and 6', r1);
  ok(!!(r1 && r1.humanKeepMs === 7200000), 'B1 — THE LAW (r3747 must 3): a person\'s own browser keeps the person\'s 2 hours away — RED: the default 12 hours', r1 && { humanKeepMs: r1.humanKeepMs });
  w.done();
}

// ── B2 — HELD AT A START: nothing known ⇒ the safe side ──────────────────────────────────────────────────────────────────────
console.log('B2 the settings held at the keeper\'s birth (nothing known): the safe side, scene by scene');
{
  const W0 = path.join(ROOT, 'pin-' + worlds), prog = placedProgram(W0);
  const w = world({ held: HELD, settings: PERSON, pinFile: { version: '0.38.1', path: prog } });
  await pinReadOf(w.kp);   // the kept pin is read once at the keeper's birth, off the loop — the leg waits for THAT read, never a clock
  const r = reads(w.kp), rel = w.kp.idleReleaseAfterMs(), tko = w.kp.takeoverIdleMs();
  ok(!!(rel === 0 && tko === 0), 'B2 — THE LAW (scenes 2, 3: no release, no lapse by a default clock): with nothing known the release and the takeover are «never» — RED: 3 minutes and the default', { rel, tko });
  ok(!!(r && r.idleMs === 0), 'B2 — THE LAW (scene 1): the idle sweep stops nothing by a default clock — RED: 15 minutes', r);
  ok(!!(r && r.humanKeepMs === 0), 'B2 — THE LAW (r3747 must 3): a person\'s own browser never lapses on the default 12 hours (0 = never) — RED: 12 hours', r && { humanKeepMs: r.humanKeepMs });
  let sf = null; try { sf = w.kp.statusFor('conv-held'); } catch (e) { sf = { threw: String(e && e.message).slice(0, 80) }; }
  const m = sf && sf.cap && sf.cap.machine;
  ok(!!(r && r.capUnread === true && m && m.unread === true && m.code === 'browser_settings_unread'), 'B2 — THE LAW (scene 6, r3443 hold 3): the ceiling is SAID unread — the launches count against the product\'s default and no number is the person\'s — RED: the default shown as the person\'s', { reads: r, machine: m });
  ok(!!(sf && sf.settingsHeld && sf.settingsHeld.code === 'browser_settings_unread'), 'B2 — THE LAW (point 9): the browsers\' status says the settings hold where the person looks (the held words\' row) — RED: nothing said', sf && { settingsHeld: sf.settingsHeld });
  const ex = await exitOf(w);
  ok(!!(ex && ex.ok === false && ex.code === 'browser_settings_unread' && ex.status === 503 && !/no exit check address is set/.test(String(ex.error || ''))), 'B2 — THE LAW (scene 5): the exit check is refused BY NAME, its address unread — never «no exit check address is set» — RED: exit_url_unset', ex && { code: ex.code, status: ex.status, error: String(ex.error || '').slice(0, 120) });
  const v = r && typeof r.egress === 'function' ? r.egress(PLUGIN, 'a.example') : null, v2 = r && typeof r.egress === 'function' ? r.egress(PLUGIN, 'x.wide-manifest.example') : null;
  ok(!!(v && v.allow === false && v2 && v2.allow === false && /settings cannot be read/.test(String(v.why)) && !/example/.test(String(v.why) + String(v2.why))), 'B2 — THE LAW (scene 4, r3443 hold 4): a plugin reaches NO address — not its manifest\'s wider list — and its refusal names the hold and nothing of any list — RED: the manifest\'s list admits', { v, v2 });
  let pin = null; try { pin = w.kp.cliPin(); } catch (e) { pin = { threw: String(e && e.message).slice(0, 80) }; }
  ok(!!(pin && pin.path === prog && pin.installed === true && pin.held === true), 'B2 — THE LAW (scene 7): a launch uses the pin the last run kept, before PATH\'s tool — RED: PATH', pin && { mode: pin.mode, path: pin.path, held: pin.held });
  // r3747 should 1: the kept pin is said «installed» only past the check the memo's road makes — its program gone ⇒ never «installed»
  fs.rmSync(prog, { force: true });
  let gone = null; try { gone = w.kp.cliPin(); } catch (e) { gone = { threw: String(e && e.message).slice(0, 80) }; }
  ok(!!(gone && gone.installed === false && gone.path === null && gone.mode === 'path' && gone.held === true && /not a runnable file/.test(String(gone.why))), 'B2 — the kept pin\'s program VANISHED: it is never said «installed» (the memo road\'s own check, one stat) — PATH answers, and the why says so', gone && { mode: gone.mode, path: gone.path, installed: gone.installed, why: gone.why });
  // B3 — THE LIFT: the door answers null again; the next read is the file's — no restart
  w.st.held = null; w.st.settings['browser.idleTimeoutMs'] = 300000;
  const r3 = reads(w.kp);
  ok(!!(r3 && r3.idleMs === 300000 && r3.capUnread === false && r3.cap === 12 && r3.humanKeepMs === 7200000), 'B3 — THE LAW (lifted with no restart): the settings read again, the keeper reads the person\'s values', r3);
  w.done();
}

// ── B4 — PRODUCTION's NAMES: the hub wires the door to the persistence router's ───────────────────────────────────────────────
console.log('B4 production\'s names: the hub hands the keeper, the kept store and the spawn environment the persistence router\'s settings hold');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const DOOR = /settingsHeld: \(\) => \(typeof persistenceRouter\.settingsHeld === 'function' \? persistenceRouter\.settingsHeld\(\) : null\)/;
  const segOf = (anchor, n) => { const at = src.indexOf(anchor); return at < 0 ? '' : src.slice(at, at + n); };
  ok(!!DOOR.test(segOf("require('./browser-keeper').create(", 12000)), 'B4 — the keeper the hub creates reads its settings hold from the persistence router (the door every holder receives)');
  ok(!!(DOOR.test(segOf("require('./browser-kept').create(", 600)) && DOOR.test(segOf("require('./browser-env').create(", 600))), 'B4 — r3747: the kept store and the hub\'s spawn environment are handed the SAME door');
  // the instance src/ws-create.js builds gets no door: it asks the reader's own marker, which the held view carries (src/routes/persistence.js)
  const per = fs.readFileSync(path.join(REPO, 'src/routes/persistence.js'), 'utf8'), wsc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8'), env = fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8');
  ok(!!(per.includes("const SETTINGS_HELD = Symbol.for('vibespace.settings-held');") && /Object\.defineProperty\(\{ \.\.\.require\('\.\.\/settings-held-strict\.js'\)\.strictValues\(\) \}, SETTINGS_HELD,/.test(per) && /require\('\.\/server\/browser-env(\.js)?'\)\.create\(/.test(wsc) && env.includes("() => serverSetting(Symbol.for('vibespace.settings-held')) || null")),
    'B4 — the second instance (src/ws-create.js) asks the reader\'s own hold marker, the one the held view carries', { wsCreate: /browser-env/.test(wsc) });
}

// ── B5 — THE KEPT BROWSERS' SWEEP (r3747 must 1) ───────────────────────────────────────────────────────────────────────────
console.log('B5 the kept browsers\' retention sweep: held ⇒ it waits (nothing removed); the lift ⇒ the person\'s bound');
{
  const KS = require('../src/server/browser-kept.js'), KB = require('../src/browser-kept.js');
  const D = path.join(ROOT, 'kept-' + (++worlds));
  fs.mkdirSync(D, { recursive: true });
  // the person keeps more than the default total (4096 MB): 8192 MB — two stopped browsers of 3000 MB each (6000 MB: over the default)
  const st = { held: HELD, settings: { [KB.TOTAL_SETTING]: 8192, [KB.PER_CONVERSATION_SETTING]: 4096 } };
  const bound = new Set(), sizes = new Map();
  let clock = 3_000_000_000;
  const fakeDu = (cmd, args, opts, cb) => { const paths = args.slice(args.indexOf('--') + 1); const out = paths.filter((p) => sizes.has(p)).map((p) => `${sizes.get(p)}\t${p}`).join('\n'); setImmediate(() => cb(null, out + '\n', '')); };
  const kept = KS.create({ dataDir: D, keeper: () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false, registeredDirs: () => [] }), liveKeys: () => new Set(),
    bindings: { keys: () => bound, boundKeys: () => bound, conversationOf: (bk) => (bound.has(bk) ? 'conv-' + bk : null) }, serverSetting: heldView(st), log: quiet, now: () => clock, sweepEveryMs: 0, thereEveryMs: 0, execFileImpl: fakeDu, settingsHeld: () => st.held });
  const kOld = 'bk-00005001', kNew = 'bk-00005002';
  for (const [i, k] of [kOld, kNew].entries()) {
    bound.add(k); clock = 3_000_000_000 + i * 1000;
    kept.noteStop(k, { why: 'turn-idle', hasDir: true, tabs: [{ url: 'https://' + k + '.example/' }] });
    const d = kept.dirOf(k); fs.mkdirSync(path.join(d, 'Default'), { recursive: true }); fs.writeFileSync(path.join(d, 'Default', 'Cookies'), 'made-up');
    sizes.set(d, 3000 * MB);
  }
  clock = 3_000_000_000 + 10_000;
  const both = () => kept.has(kOld) && kept.has(kNew) && fs.existsSync(path.join(kept.dirOf(kOld), 'Default', 'Cookies')) && fs.existsSync(path.join(kept.dirOf(kNew), 'Default', 'Cookies'));
  const h = await kept.sweep(), lh = kept.limits();
  ok(!!(h && h.held === true && both()), 'B5 — THE LAW (held at a start, the kept browsers over the DEFAULT total): the sweep waits — nothing removed, both sign-ins kept — RED: the least recently used is removed down to the default 4096 MB', { sweep: h && { held: h.held, removed: h.removed, limit: h.limit }, both: both() });
  ok(!!(lh && lh.unread === true && lh.code === 'browser_settings_unread'), 'B5 — THE LAW: the bounds the panel shows are SAID unread (the hold, never the default as the person\'s) — RED: the default bounds as the person\'s', lh);
  st.held = null;
  const l = await kept.sweep(), ll = kept.limits();
  ok(!!(l && !l.held && l.removed === 0 && l.limit === 8192 * MB && both() && !ll.unread), 'B5 — THE LAW (the lift, no restart): the next sweep applies the PERSON\'s bound (8192 MB) — nothing of theirs removed', l && { held: l.held, removed: l.removed, limit: l.limit, used: l.used });
  kept.shutdown();
}

// ── B6 — THE CONVERSATION's SPAWN ENVIRONMENT (r3747 must 2) ────────────────────────────────────────────────────────────────
console.log('B6 the spawn environment: a conversation started while held carries no default idle clock into its browser');
{
  const BE = require('../src/server/browser-env.js');
  const mk = ({ held, settings, door }) => {
    const W = path.join(ROOT, 'env-' + (++worlds)), H = path.join(W, 'home'); fs.mkdirSync(path.join(H, '.agent-browser'), { recursive: true });
    const st = { held, settings: { ...settings } };
    const be = BE.create({ dataDir: path.join(W, 'data'), homeDir: H, serverSetting: heldView(st), ...(door ? { settingsHeld: () => st.held } : {}), log: quiet, env: {}, socketDirBase: path.join(W, 'sock'), facts: { floor: async () => ({ state: 'ok' }) } });
    return { be, st };
  };
  const idleOf = (r) => { const p = ((r && r.pairs) || []).find((s) => String(s).startsWith('AGENT_BROWSER_IDLE_TIMEOUT_MS=')); return p ? String(p).split('=')[1] : null; };
  // (a) held at a start, the instance src/ws-create.js builds (no door handed: the reader's own marker answers)
  const a = mk({ held: HELD, settings: PERSON, door: false });
  const ra = a.be.envFor({ browserKey: 'bk-00006001' });
  ok(!!(idleOf(ra) === '0'), 'B6 — THE LAW (a start while held, nothing known): the spawn environment\'s idle clock is 0 (never) — the browser the conversation launches is not stopped by a default for its life — RED: 900000 (the default 15 minutes)', { idle: idleOf(ra), variant: ra && ra.variant });
  // (b) read, then held, through the hub's door
  const b = mk({ held: null, settings: PERSON, door: true });
  const rb0 = b.be.envFor({ browserKey: 'bk-00006002' }); b.st.held = HELD;
  const rb = b.be.envFor({ browserKey: 'bk-00006003' });
  ok(!!(idleOf(rb0) === '600000' && idleOf(rb) === '600000'), 'B6 — THE LAW (held after a read): a conversation started while held carries the person\'s last known 10 minutes — RED: the default 15', { before: idleOf(rb0), held: idleOf(rb) });
  b.st.held = null; b.st.settings['browser.idleTimeoutMs'] = 300000;
  const rl = b.be.envFor({ browserKey: 'bk-00006004' });
  ok(!!(idleOf(rl) === '300000'), 'B6 — the lift (no restart): the next start reads the file\'s value', { idle: idleOf(rl) });
}

// ── B7 — THE ACTION TRACE ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log('B7 the action trace: held ⇒ the last choice known; nothing known ⇒ it records nothing and its frames\' sweep waits');
{
  const TR = require('../src/server/browser-trace.js');
  const mk = (held, settings) => { const W = path.join(ROOT, 'trace-' + (++worlds)); fs.mkdirSync(path.join(W, 'home', '.agent-browser'), { recursive: true }); const st = { held, settings: { ...settings } }; return { tr: TR.create({ dataDir: path.join(W, 'data'), homeDir: path.join(W, 'home'), serverSetting: heldView(st), log: quiet, sweepEveryMs: 0 }), st }; };
  const a = mk(HELD, { 'browser.actionTrace': false, 'browser.traceBytesPerProfile': 2048 });
  const sw = await a.tr.sweep();   // row B-360d (r4522): the trace's sweep is off the loop — awaited
  let hk = null; try { hk = await a.tr.housekeeping(); } catch (e) { hk = { threw: String(e && e.message).slice(0, 120) }; }
  ok(!!(a.tr.enabled() === false), 'B7 — THE LAW (held at a start, nothing known): the trace records NOTHING — never the default «on» for a person who may have turned it off — RED: on', { enabled: a.tr.enabled() });
  ok(!!(sw && sw.held === true && sw.framesRemoved === 0), 'B7 — THE LAW: the frames\' size sweep WAITS (no frame removed on the default bound) — RED: it runs on the default 1 GB', sw && { held: sw.held, framesRemoved: sw.framesRemoved, limit: sw.limit });
  ok(!!(hk && hk.limits && hk.limits.settingsUnread && hk.limits.settingsUnread.code === 'browser_settings_unread' && hk.traceOn === false), 'B7 — THE LAW: the panel\'s answer says the bound unread (its code) and the trace off — RED: the default bound as the person\'s', hk && { limits: hk.limits && { settingsUnread: hk.limits.settingsUnread, bytesPerProfile: hk.limits.bytesPerProfile }, traceOn: hk.traceOn, threw: hk.threw });
  const b = mk(null, { 'browser.actionTrace': false, 'browser.traceBytesPerProfile': 2048 });
  const e0 = b.tr.enabled(), l0 = b.tr.bytesLimit(); b.st.held = HELD;
  const e1 = b.tr.enabled(), l1 = b.tr.bytesLimit();
  ok(!!(e0 === false && l0 === 2048 * MB && e1 === false && l1 === 2048 * MB), 'B7 — THE LAW (held after a read): the person\'s «off» and 2048 MB stand — RED: on and 1 GB', { e0, l0, e1, l1 });
  b.st.held = null; b.st.settings['browser.actionTrace'] = true;
  ok(!!(b.tr.enabled() === true), 'B7 — the lift (no restart): the trace reads the file\'s value', { enabled: b.tr.enabled() });
  a.tr.shutdown(); b.tr.shutdown();
}

// ── B8 — A WINDOW TAKEOVER's CLOCK ──────────────────────────────────────────────────────────────────────────────────────────
console.log('B8 a window takeover: held ⇒ the last value known; nothing known ⇒ it never lapses on the default time');
{
  const WTE = require('../src/server/window-targets-engine.js'), TK = require('../src/browser-takeover.js');
  const mk = (held, settings) => { const W = path.join(ROOT, 'win-' + (++worlds)); fs.mkdirSync(W, { recursive: true }); const st = { held, settings: { ...settings } }; return { wt: WTE.create({ keeper: {}, dataDir: W, env: () => ({}), activeSessions: new Map(), log: quiet, serverSetting: heldView(st) }), st }; };
  const a = mk(HELD, PERSON);
  ok(!!(a.wt.takeoverIdleMs() === 0), 'B8 — THE LAW (held at a start, nothing known): a window\'s takeover never lapses (0 = never) — RED: the default', { ms: a.wt.takeoverIdleMs(), dflt: TK.DEFAULT_TAKEOVER_IDLE_MS });
  const b = mk(null, PERSON);
  const t0 = b.wt.takeoverIdleMs(); b.st.held = HELD;
  ok(!!(t0 === 1200000 && b.wt.takeoverIdleMs() === 1200000), 'B8 — THE LAW (held after a read): the person\'s 20 minutes stand — RED: the default', { t0, held: b.wt.takeoverIdleMs() });
}

// ── B9 — THE EGRESS PROXY's JOURNAL LINE (r3443 hold 4) ─────────────────────────────────────────────────────────────────────
console.log('B9 the egress proxy\'s start line in the journal: a COUNT of its list, never the list');
{
  const lines = [];
  const w = world({ settings: { ...PERSON, [PLUGIN.setting]: 'a.example, b.example' }, log: { log: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)), error() { } } });
  const r = reads(w.kp);
  let url = null; try { url = r && typeof r.egressStart === 'function' ? await r.egressStart('bp-0000e901', PLUGIN) : null; } catch (e) { url = { threw: String(e && e.message).slice(0, 120) }; }
  const line = lines.find((l) => l.includes('egress proxy of')) || '';
  ok(!!(typeof url === 'string' && /2 sites of its list/.test(line) && !/a\.example|b\.example/.test(line)), 'B9 — THE LAW (hold 4): the proxy\'s start line names how MANY sites its list has, never one of them — RED: the list in the journal', { url: typeof url === 'string' ? 'started' : url, line: line.replace(/a\.example|b\.example/g, '<site>').slice(0, 220) });
  try { if (r && typeof r.egressStop === 'function') r.egressStop('bp-0000e901'); } catch { /* closed */ }
  w.done();
}

// ── B10 — WHERE A PERSON LOOKS: the browser panel says the hold for the bounds it cannot read ─────────────────────────────────
console.log('B10 the browser panel: the kept bounds and the trace bound unread ⇒ the held words\' row, never a default number as the person\'s');
{
  const v = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  ok(!!(/import \{[^}]*\bheldWordsOf\b[^}]*\} from '\.\/utils\.js';/.test(v) && v.includes("if (v?.limits?.settingsUnread) { hint.textContent = heldWordsOf(v.limits.settingsUnread); return; }") && v.includes("section(t('Kept browsers'), kl.keptUnread ? heldWordsOf(kl.keptUnread)")),
    'B10 — the panel draws the held words\' row (browser_settings_unread, with its zh and ja) for the trace bound and the kept bounds the hub says unread');
}
// ── B11 — «REACH TAILNET HOSTS FROM BROWSERS» (the census of readers: a plugin row on the agent browser's road) ─────────────────
console.log('B11 the tailnet reach switch while held: the last value known; nothing known ⇒ off, said by its own reason');
{
  const { PluginManager } = require('../src/plugins.js'), TS = require('../src/plugins/tailscale.js'), TR = require('../src/tailnet-reach.js'), TD = require('../src/server/tailnet-door.js');
  const ROW = 'plugin.tailscale.reachBrowsers';
  // the store as production hands it: while held, the frozen view carries no plugin row and the hold's marker (src/routes/persistence.js)
  const mk = (held, settings) => { const D = path.join(ROOT, 'plug-' + (++worlds)); fs.mkdirSync(D, { recursive: true }); const st = { held, settings: { ...settings } };
    const pm = new PluginManager({ dataDir: D, plugins: [TS], settings: { read: () => (st.held ? Object.defineProperty({}, MARK, { value: st.held, enumerable: false }) : st.settings), patch: () => { } } });
    return { st, reach: () => { const v = pm._verbs.get('tailscale'); return v && typeof v.reach === 'function' ? v.reach() : null; } }; };
  const a = mk(HELD, {});
  const ra = a.reach();
  ok(!!(ra && ra.browsers === false && ra.browsersHeld === true), 'B11 — THE LAW (held at a start, nothing known): browsers reach NO tailnet machine by its name — never the default «on» for a person who may have turned it off — RED: on', ra && { browsers: ra.browsers, browsersHeld: ra.browsersHeld });
  const b = mk(null, { [ROW]: true });
  const rb0 = b.reach(); b.st.held = HELD;
  const rb = b.reach();
  ok(!!(rb0 && rb0.browsers === true && rb && rb.browsers === true && !rb.browsersHeld), 'B11 — THE LAW (held after a read): the person\'s «on» stands', { before: rb0 && rb0.browsers, held: rb && rb.browsers });
  // the verdicts and the words: the reason is the hold's own, in every language, never «Reach … is off»
  const UP = { up: true, mode: 'userspace', state: 'Running', read: true, loggedIn: true, browsers: false, browsersHeld: true, peers: [{ name: 'nas.example.ts.net', short: 'nas', ips: ['100.64.0.9'] }], self: null, suffix: 'example.ts.net', known: [], at: 1, ports: { socks: 1, http: 2 } };
  const lv = TR.launchFor(UP), dw = TR.downWhy(UP);
  const words = ['en', 'zh', 'ja'].map((l) => TR.WORDS[l] && TR.WORDS[l]['settings-held']), started = ['en', 'zh', 'ja'].map((l) => TR.WORDS[l] && TR.WORDS[l]['started-settings-held']);
  ok(!!(lv && lv.on === false && lv.why === 'settings-held' && dw === 'settings-held' && TR.WHYS.includes('settings-held') && TR.WHYS.includes('started-settings-held') && words.every((w) => typeof w === 'string' && w.includes('{host}')) && started.every((w) => typeof w === 'string' && w.includes('{host}')) && /settings cannot be read/.test(words[0]) && !/is off/.test(words[0])),
    'B11 — THE LAW: a launch while held starts without tailnet reach BY THE HOLD\'S OWN REASON (settings-held), its words in en / zh / ja — never «Reach tailnet hosts from browsers is off» — RED: «setting»', { launch: lv, down: dw, en: words[0] });
  const miss = TR.missFor('https://nas:8006/', { ...UP, browsers: true, browsersHeld: false }, { failed: true, cause: 'net::ERR_NAME_NOT_RESOLVED', launched: { arg: null, mode: 'userspace', why: 'settings-held' } });
  ok(!!(miss && miss.why === 'started-settings-held' && TD.LAUNCH_WHY && typeof TD.LAUNCH_WHY['settings-held'] === 'string'), 'B11 — after the lift, a browser that started while held is told why it has no tailnet road (started-settings-held), and the journal names the hold', miss && { why: miss.why, text: String(miss.text).slice(0, 160) });
}
// ══ THE FOLLOW (主开发 r3941): what the cure made, the row's own class ══════════════════════════════════════════════════════════
// ── B12 — THE KEPT SWEEP ASKS THE HOLD AGAIN AFTER ITS MEASURE ─────────────────────────────────────────────────────────────────
console.log('B12 the kept sweep: a hold that BEGINS while the sizes are measured — nothing removed on the default bounds');
{
  const KS = require('../src/server/browser-kept.js'), KB = require('../src/browser-kept.js');
  const D = path.join(ROOT, 'kept-mid-' + (++worlds)); fs.mkdirSync(D, { recursive: true });
  const st = { held: null, settings: { [KB.TOTAL_SETTING]: 8192, [KB.PER_CONVERSATION_SETTING]: 4096 } };
  const bound = new Set(), sizes = new Map(), lines = [];
  let clock = 4_000_000_000;
  // the PLACED hold: the settings become held while the measure's du answers (the await between the sweep's start and its plan)
  const fakeDu = (cmd, args, opts, cb) => { const paths = args.slice(args.indexOf('--') + 1); const out = paths.filter((p) => sizes.has(p)).map((p) => `${sizes.get(p)}\t${p}`).join('\n'); st.held = HELD; setImmediate(() => cb(null, out + '\n', '')); };
  const kept = KS.create({ dataDir: D, keeper: () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false, registeredDirs: () => [] }), liveKeys: () => new Set(),
    bindings: { keys: () => bound, boundKeys: () => bound, conversationOf: (bk) => (bound.has(bk) ? 'conv-' + bk : null) }, serverSetting: heldView(st), log: { log() { }, warn: (l) => lines.push(String(l)), error() { } }, now: () => clock, sweepEveryMs: 0, thereEveryMs: 0, execFileImpl: fakeDu, settingsHeld: () => st.held });
  const kOld = 'bk-00007001', kNew = 'bk-00007002';
  for (const [i, k] of [kOld, kNew].entries()) {
    bound.add(k); clock = 4_000_000_000 + i * 1000;
    kept.noteStop(k, { why: 'turn-idle', hasDir: true, tabs: [{ url: 'https://' + k + '.example/' }] });
    const d = kept.dirOf(k); fs.mkdirSync(path.join(d, 'Default'), { recursive: true }); fs.writeFileSync(path.join(d, 'Default', 'Cookies'), 'made-up');
    sizes.set(d, 3000 * MB);
  }
  clock = 4_000_000_000 + 10_000;
  const r = await kept.sweep();
  const both = kept.has(kOld) && kept.has(kNew) && fs.existsSync(path.join(kept.dirOf(kOld), 'Default', 'Cookies'));
  ok(!!(st.held && r && r.held === true && both), 'B12 — THE LAW (r3941 (1)): the sweep READ the settings at its start; the hold began during its measure — asked again after it, the pass removes nothing (both sign-ins kept) — RED: the least recently used removed down to the default 4096 MB', { sweep: r && { held: r.held, removed: r.removed, limit: r.limit }, both, heldNow: !!st.held });
  kept.shutdown();
}

// ── B13 — THE LIFT: what the hold turned off comes back, no restart, no launch (ONE hook) ─────────────────────────────────────
console.log('B13 the lift: the tailnet door follows the road again and the trace arms the running browsers\' taps — nothing launched');
{
  // production's names: ONE lift hook in the hub's wiring tells both — the plugins (whose watch the tailnet door follows: its ONE road,
  // test-tailnet-browsers r4 N1) and the trace
  const src = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const at = src.indexOf("persistenceRouter.onSettingsLift(() => {\n    try { plugins.settingsLifted(); }");
  const seg = at < 0 ? '' : src.slice(at, at + 600);
  ok(!!(at >= 0 && seg.includes("browserTrace.settingsLifted()") && !src.includes('roadChanged')), 'B13 — the hub registers ONE settings-lift hook that tells the plugins (the door follows them) and arms the trace (r3941 (2)) — RED: no hook (a default reach and the trace come back only at a launch)', { found: at >= 0 });
  // (a) the tailnet door through its ONE follow: the REAL plugin host and the REAL door; the tunnel plugin a stand-in that answers its
  // reach through the host's own hold question (the real tailscale plugin needs its daemon). Held at a start the door stays closed; at the
  // lift the host's settingsLifted() reaches the door's follow and it opens on its KEPT port (a browser that survived the restart uses
  // that port's PAC) — the person's switch on by its default, no stored row, nothing launched
  const net = await import('node:net');
  const freePort = await new Promise((res) => { const sv = net.createServer(); sv.listen(0, '127.0.0.1', () => { const { port } = sv.address(); sv.close(() => res(port)); }); });
  const { PluginManager } = require('../src/plugins.js'), TD = require('../src/server/tailnet-door.js');
  const DD = path.join(ROOT, 'door-' + (++worlds)); fs.mkdirSync(DD, { recursive: true });
  fs.writeFileSync(path.join(DD, TD.STATE_FILE), JSON.stringify({ port: freePort }));
  const tst = { held: HELD };
  const UPR = { up: true, mode: 'userspace', state: 'Running', read: true, loggedIn: true, peers: [{ name: 'nas.example.ts.net', short: 'nas', ips: ['100.64.0.9'] }], self: null, suffix: 'example.ts.net', known: [], at: 1, ports: { socks: 1, http: 2 } };
  const TUN = { id: 'tun-standin', label: 'Tunnel stand-in', description: 'a made-up tunnel plugin', provides: ['tunnel'],
    create: (h) => ({ install() { }, start() { }, stop() { }, status() { return {}; }, reach: () => (typeof h.settingsHeld === 'function' && h.settingsHeld() ? { ...UPR, browsers: false, browsersHeld: true } : { ...UPR, browsers: true }) }) };
  const pm = new PluginManager({ dataDir: DD, plugins: [TUN], settings: { read: () => (tst.held ? Object.defineProperty({}, MARK, { value: tst.held, enumerable: false }) : {}), patch: () => { } } });
  const door = TD.follow(pm, { dataDir: DD, log: quiet });
  await door.synced();
  const p0 = door.port();
  tst.held = null;
  if (typeof pm.settingsLifted === 'function') pm.settingsLifted();
  await new Promise((r) => setImmediate(r)); await door.synced();
  const p1 = door.port();
  ok(!!(!p0 && p1 > 0), 'B13 — THE LAW (a): held at a start the door is closed; at the lift the plugin host tells its watchers and the door follows its road: open on its kept port, nothing launched — RED: it stays closed until a launch', { held: p0 || null, lifted: p1 || null });
  try { await door.close(); } catch { /* closed */ }
  // (b) the trace: held at a start its boot arms no tap; at the lift the hook's settingsLifted arms the running browser's tap
  const TR = require('../src/server/browser-trace.js');
  const W = path.join(ROOT, 'trace-lift-' + (++worlds)); fs.mkdirSync(path.join(W, 'home', '.agent-browser'), { recursive: true });
  const st = { held: HELD, settings: { 'browser.actionTrace': true } };
  let taps = 0;
  const KEY = 'bk-0000b001';
  const keeperStub = { _reg: () => ({ profiles: [], leases: [{ profileId: 'bp-0000b001', sessionId: 'sess-lift-1', browserKey: KEY }], browsers: { 'bp-0000b001': { state: 'ready' } } }), isEphemeral: () => true, holdersFor: (bk) => [{ ephemeral: true, child: false, browserKey: bk }], onLease: () => () => { }, addDigest() { }, browserOf: () => ({ state: 'ready' }) };
  const tr = TR.create({ dataDir: path.join(W, 'data'), homeDir: path.join(W, 'home'), keeper: keeperStub, bridge: { tap: async () => { taps++; return { ok: true, key: 'k-lift', untap() { } }; } }, serverSetting: heldView(st), log: quiet, sweepEveryMs: 0 });
  let b = null; try { b = await tr.boot(); } catch (e) { b = { threw: String(e && e.message).slice(0, 120) }; }
  const t0 = taps;
  st.held = null;
  let armed = null; try { armed = typeof tr.settingsLifted === 'function' ? await tr.settingsLifted() : null; } catch (e) { armed = { threw: String(e && e.message).slice(0, 120) }; }
  ok(!!(t0 === 0 && taps === 1 && armed === 1), 'B13 — THE LAW (b): held at a start the boot armed no tap; at the lift the running browser\'s tap is ARMED, with no launch and no lease — RED: nothing arms it', { boot: b && { armed: b.armed, threw: b.threw }, tapsAtBoot: t0, tapsAfterLift: taps, armed });
  tr.shutdown();
}

// ── B14 — THE TRACE OFF BY THE HOLD, SAID BY ITS REASON ───────────────────────────────────────────────────────────────────────
console.log('B14 the trace while held: its refusal and its views say the hold, never «off» with a «Turn on» door');
{
  const TR = require('../src/server/browser-trace.js');
  const W = path.join(ROOT, 'trace-why-' + (++worlds)); fs.mkdirSync(path.join(W, 'home', '.agent-browser'), { recursive: true });
  const st = { held: HELD, settings: {} };
  const tr = TR.create({ dataDir: path.join(W, 'data'), homeDir: path.join(W, 'home'), bridge: { tap: async () => ({ ok: true, key: 'k', untap() { } }) }, serverSetting: heldView(st), log: quiet, sweepEveryMs: 0 });
  const w = await tr.watch({ sessionId: 'sess-why-1' });
  const held = typeof tr.traceHeld === 'function' ? tr.traceHeld() : null;
  ok(!!(w && w.ok === false && w.code === 'browser_settings_unread' && /settings cannot be read/.test(String(w.error)) && held && held.code === 'browser_settings_unread'), 'B14 — THE LAW (r3941 (3)): the trace\'s refusal while held is the hold\'s, by name — never trace_off «the action trace is off» — RED: trace_off', { watch: w, held });
  st.held = null;
  const w2 = await tr.watch({ sessionId: 'sess-why-2' });
  ok(!!(w2 && w2.ok === true && (typeof tr.traceHeld !== 'function' || tr.traceHeld() === null)), 'B14 — the control: read, the same call arms (the hold said nothing else)', { watch: w2 });
  tr.shutdown();
  const route = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8'), view = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8'), rep = fs.readFileSync(path.join(REPO, 'src/lib/browser-replay-window.js'), 'utf8'), words = fs.readFileSync(path.join(REPO, 'src/lib/browser-session-words.js'), 'utf8');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const KEYW = 'VibeSpace’s settings cannot be read right now, so the action trace records nothing until they can be read';
  ok(!!((route.match(/traceOn: tr\.enabled\(\), \.\.\.heldOf\(tr\)/g) || []).length === 4 && /browser_settings_unread: 503/.test(route)
    && view.includes('else if (off && held) sum.textContent = traceHeldText();') && view.includes('else if (st.off && st.offHeld) count.textContent = traceHeldText();') && view.includes("if (v && v.traceOn === false && v.traceUnread) hint.append(' ', needLine({ words: traceHeldText(), tone: 'off', doors: [] }));")
    && rep.includes("if (kind === 'trace-off' && st.traceHeld) empty.textContent = traceHeldText();") && words.includes(KEYW) && zh.includes(`"${KEYW}":`) && ja.includes(`"${KEYW}":`)),
    'B14 — every answer that says traceOn carries the hold (4 routes), and the three views say the hold\'s words with NO «Turn on…» door; the words in zh and ja — RED: «off» + a door Settings refuses');
}

// ── B15 — THE SWEEPS' JOURNAL ONCE A HOLD; THE SWEEP PRESS SAYS THE HOLD ─────────────────────────────────────────────────────────
console.log('B15 the two sweeps say their wait once a hold, not once a pass; the Sweep press\'s reply says the hold');
{
  const KS = require('../src/server/browser-kept.js'), TR = require('../src/server/browser-trace.js');
  const D = path.join(ROOT, 'kept-once-' + (++worlds)); fs.mkdirSync(D, { recursive: true });
  const st = { held: HELD, settings: {} }, kl = [], tl = [];
  const kept = KS.create({ dataDir: D, keeper: () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false, registeredDirs: () => [] }), liveKeys: () => new Set(), bindings: { keys: () => new Set(), boundKeys: () => new Set() }, serverSetting: heldView(st), log: { log() { }, warn: (l) => kl.push(String(l)), error() { } }, sweepEveryMs: 0, thereEveryMs: 0, settingsHeld: () => st.held });
  const W = path.join(ROOT, 'trace-once-' + worlds); fs.mkdirSync(path.join(W, 'home', '.agent-browser'), { recursive: true });
  const tr = TR.create({ dataDir: path.join(W, 'data'), homeDir: path.join(W, 'home'), serverSetting: heldView(st), log: { log() { }, warn: (l) => tl.push(String(l)), error() { } }, sweepEveryMs: 0 });
  const said = (a, re) => a.filter((l) => re.test(l)).length;
  for (let i = 0; i < 3; i++) { await kept.sweep(); await tr.sweep(); }   // row B-360d: one sweep at a time — each pass awaited (an un-awaited one would answer the next ask)
  const k1 = said(kl, /settings cannot be read/), t1 = said(tl, /settings cannot be read/);
  st.held = null; await kept.sweep(); await tr.sweep(); st.held = HELD; await kept.sweep(); await tr.sweep();
  const k2 = said(kl, /settings cannot be read/), t2 = said(tl, /settings cannot be read/);
  // (the trace's next hold KNOWS its bound from the read pass — its memo — so its sweep runs on the person's value and has nothing to say;
  // the kept sweep reads the door itself, so its next hold waits again and says it once more)
  ok(!!(k1 === 1 && t1 === 1 && k2 === 2 && t2 === 1), 'B15 — THE LAW: three passes while held say the wait ONCE for each sweep (never once a pass); after a read pass, the kept sweep\'s next hold says it once again — RED: once a pass', { kept: [k1, k2], trace: [t1, t2] });
  kept.shutdown(); tr.shutdown();
  const route = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8'), view = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  ok(!!(route.includes("res.json({ ok: true, ...(r.held || keptHeld ? { held: { code: 'browser_settings_unread', trace: !!r.held, kept: keptHeld } } : {}), removed: r.removed,") && view.includes('+ sweepHeldText(r.held), { duration: 8000 }); } else if (r) showToast(')),
    'B15 — the Sweep press while held: its reply carries the hold (the trace\'s and the kept sweep\'s), and the page says it — never «removed 0» as if it had looked');
}

// ── B16 — THE KEEPER's JOURNAL SAYS «NEVER», NOT «0 h» ────────────────────────────────────────────────────────────────────────
console.log('B16 a person\'s own browser kept with no end is said so in the journal');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ok(!!(src.includes("const keepWords = (ms, unit, name) => (Number(ms) > 0 ? `${Math.round(ms / unit)} ${name}` : 'with no end (never lapses)');") && src.includes("kept ' + keepWords(humanKeepOf(h), 3600000, 'h') + ' while away'") && !src.includes("Math.round(humanKeepOf(h) / 3600000) + ' h while away'")),   // stale-pins: kept (a deliberate absence check: the old «0 h» words are gone)
    'B16 — the journal line of a person\'s own browsing says «with no end (never lapses)» for a keep of 0, never «kept 0 h»');
}
// ── B17 — THE SMALL FOLLOW (主开发 r4060) ───────────────────────────────────────────────────────────────────────────────────────
console.log('B17 a second lift doubles nothing; a person\'s own tap at the lift; the views told at once; the toast says which sweep waited');
{
  const TR = require('../src/server/browser-trace.js');
  const W = path.join(ROOT, 'trace-lift2-' + (++worlds)); fs.mkdirSync(path.join(W, 'home', '.agent-browser'), { recursive: true });
  const st = { held: HELD, settings: { 'browser.actionTrace': true } };
  let taps = 0, humanTaps = 0; const sent = [];
  const KEY = 'bk-0000c001', PID = 'bp-0000c001', HKEY = 'hu-0000c0de';
  const keeperStub = { _reg: () => ({ profiles: [{ id: PID, recordMine: true }], leases: [{ profileId: 'bp-0000c002', sessionId: 'sess-lift2-1', browserKey: KEY }], browsers: { 'bp-0000c002': { state: 'ready' } } }), isEphemeral: () => true, holdersFor: (bk) => [{ ephemeral: true, child: false, browserKey: bk }], onLease: () => () => { }, addDigest() { }, browserOf: () => ({ state: 'ready' }),
    profile: (id) => (id === PID ? { id: PID, recordMine: true } : null), humanOf: (id) => (id === PID ? { browserKey: HKEY, state: 'driving' } : null) };
  const tr = TR.create({ dataDir: path.join(W, 'data'), homeDir: path.join(W, 'home'), keeper: keeperStub, broadcast: (m) => sent.push(m),
    bridge: { tap: async () => { taps++; return { ok: true, key: 'k-l2', untap() { } }; }, tapHuman: async () => { humanTaps++; return { ok: true, key: 'k-h2', untap() { } }; } }, serverSetting: heldView(st), log: quiet, sweepEveryMs: 0 });
  try { await tr.boot(); } catch { /* the leg reads the taps */ }
  st.held = null;
  const a1 = typeof tr.settingsLifted === 'function' ? await tr.settingsLifted() : null;
  const t1 = taps, h1 = humanTaps;
  const a2 = typeof tr.settingsLifted === 'function' ? await tr.settingsLifted() : null;
  ok(!!(t1 === 1 && h1 === 1 && taps === 1 && humanTaps === 1), 'B17 — THE LAW (r4060 (2), (4)): at the lift the running browser\'s tap AND the person\'s own browsing tap (they drive, it records their actions) are armed; a SECOND lift arms nothing twice — RED: the person\'s own tap waits for their next act', { first: { taps: t1, human: h1, armed: a1 }, second: { taps, human: humanTaps, armed: a2 } });
  ok(!!(sent.some((m) => m && m.type === 'browser-housekeeping-updated' && m.sweep && m.sweep.lifted === true) && sent.some((m) => m && m.type === 'browser-trace-status' && m.code === 'settings-lifted')), 'B17 — THE LAW (r4060 (3)): the open views are told at once — the panel and the replay pane by the housekeeping word, the conversation\'s cards and the live view\'s Actions pane by the lift\'s status', { sent: sent.map((m) => m && m.type + ':' + (m.code || (m.sweep && m.sweep.lifted ? 'lifted' : ''))).slice(0, 8) });
  tr.shutdown();
  // the views take it: the cards (onStatus), the live view (syncTrace), the replay pane (its housekeeping reload)
  const view = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8'), live = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8'), rep = fs.readFileSync(path.join(REPO, 'src/lib/browser-replay-window.js'), 'utf8');
  ok(!!(view.includes("const mine = msg.code === 'settings-lifted' ||") && live.includes("if (msg.type === 'browser-trace-status' && msg.code === 'settings-lifted') { syncTrace(); return; }") && rep.includes("m.type === 'browser-housekeeping-updated' && m.sweep) scheduleReload();")),
    'B17 — the four views re-read at the lift: the cards ask again, the live view\'s Actions pane re-syncs, the panel and the replay pane reload');
  // the Sweep press's toast, by WHICH sweep waited, with what was removed still said (the page's own words, zh and ja)
  const words = fs.readFileSync(path.join(REPO, 'src/lib/browser-session-words.js'), 'utf8'), zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const W3 = ['VibeSpace’s settings cannot be read right now, so the frames and the kept browsers wait until they can be read', 'VibeSpace’s settings cannot be read right now, so the kept browsers wait until they can be read', 'VibeSpace’s settings cannot be read right now, so the frames wait until they can be read'];
  ok(!!(W3.every((w) => words.includes(`'${w}'`) && zh.includes(`"${w}":`) && ja.includes(`"${w}":`)) && !words.includes('so the sweep removed nothing') && view.includes("showToast((n ? t('Sweep: removed the frames of {n} action(s) ({bytes}) and {r} recording(s) ({rbytes})'")),   // stale-pins: kept (a deliberate absence check: the old «removed nothing» words are gone)
    'B17 — THE LAW (r4060 (1)): the toast says WHICH sweep waited (frames, kept browsers, or both), and what WAS removed is still said first — never «removed nothing» when the recordings\' own bound or the unheld sweep removed');
  // the hub's one hook: each branch in its own guard (one that throws never stops the other)
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(!!wiring.includes("persistenceRouter.onSettingsLift(() => {\n    try { plugins.settingsLifted(); } catch (e) { console.warn('[plugins] the settings\\' lift could not be told — ' + (e && e.message)); }\n    try { if (browserTrace && typeof browserTrace.settingsLifted === 'function') browserTrace.settingsLifted(); } catch (e) {"),
    'B17 — the hub\'s lift hook runs each branch in its OWN guard: the plugins\' word throwing never keeps the trace from re-arming, nor the other way round');
}
report();
