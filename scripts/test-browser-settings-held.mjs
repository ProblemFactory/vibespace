#!/usr/bin/env node
// B-50e7 (主开发 r3332 / r3443, lane bl-proposals): WHILE VIBESPACE's SETTINGS CANNOT BE READ the agent browser keeps the person's
// choices. The held view carries no browser.* or plugin.* row, so the release's keeper (src/server/browser-keeper.js) fell to every
// default: a browser set never to stop was stopped at 15 minutes, the ephemeral release at 3, a person's takeover lapsed on the default
// time, a plugin's address list fell to its manifest's wider one, the exit check said «no address is set», the caps line showed the
// default ceiling as the person's, a start launched PATH's browser tool over the person's pin. THE LAW: held, each choice is THE LAST
// VALUE THE KEEPER KNEW in this process (memory only); nothing known (a start while held) ⇒ THE SAFE SIDE, scene by scene; the lift
// is the door answering null again — no restart. The settings held is a PLACED refusal: the keeper's own door (settingsHeld, wired by
// production to the persistence router) answers held, and the read answers what the held view answers (no browser or plugin row).
//   B1 held after a read: the clocks, the cap, the engine keep the last values known
//   B2 held at a start (nothing known): no clock stops, releases or lapses anything (0); the cap is the product's default and SAID
//      unread; the exit check is refused by name (never «no address is set»); a plugin reaches no address, its refusal naming the
//      hold and nothing of any list; a launch uses the pin the last run kept, before PATH
//   B3 the lift: the file's values again, with no restart
//   B4 production's names: the hub wires the keeper's settingsHeld to the persistence router's
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
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const PROXY = 'http://proxy.example.invalid:3128';   // a port-free loopback is not needed: a .invalid host, never dialed (the TLS stand-in refuses)
const CHECK = 'https://check.example.invalid/ip';
const PLUGIN = { engine: 'plug-x', label: 'Plug X', setting: 'plugin.plug-x.egressAllowlist', fallback: '.wide-manifest.example, a.example' };

let worlds = 0;
/** a real keeper over a scratch world; `held` is the door's answer (null = the settings read) — the read answers the held view while held */
function world({ held = null, settings = {}, pinFile = null } = {}) {
  const W = path.join(ROOT, 'w' + (++worlds)), H = path.join(W, 'home'), D = path.join(W, 'data'), BIN = path.join(W, 'bin');
  for (const d of [path.join(H, '.agent-browser'), D, BIN]) fs.mkdirSync(d, { recursive: true });
  if (pinFile) { fs.mkdirSync(path.join(D, 'browser-tools'), { recursive: true }); fs.writeFileSync(path.join(D, 'browser-tools', 'cli-pin.json'), JSON.stringify(pinFile)); }
  const rtE = { PATH: BIN, HOME: H };
  const st = { held, settings: { ...settings } };
  const serverSetting = (k) => (st.held && /^(browser|plugin)\./.test(k) ? undefined : st.settings[k]);   // the held view: no browser or plugin row
  const kp = K.create({ dataDir: D, homeDir: H, env: () => rtE, liveKeys: () => new Set(), runtime: F.createBrowserRuntime({ env: rtE }), facts: F.createBrowserFacts({ env: rtE }), log: quiet, tickMs: 3600e3, install: false,
    broadcast: () => { }, serverSetting, settingsHeld: () => st.held });
  return { kp, st, D, done: () => { try { if (kp.shutdown) kp.shutdown(); } catch { /* none */ } } };
}
const HELD = { kind: 'unreadable', code: 'EIO' };
const PERSON = { 'browser.idleTimeoutMs': 0, 'browser.idleReleaseAfterTurnMs': 0, 'browser.takeoverIdleMs': 0, 'browser.maxRunning': 12, 'browser.exitCheckUrl': CHECK, [PLUGIN.setting]: 'a.example' };
const reads = (kp) => (typeof kp._heldReads === 'function' ? kp._heldReads() : null);
const exitOf = async (w) => { const p = w.kp.createProfile({ label: 'Exit ' + worlds, proxy: PROXY }, { owner: { kind: 'instance', id: null } }); return w.kp.exitCheck(p.id, { tlsConnect: async () => { throw Object.assign(new Error('no network in this leg'), { code: 'ENETDOWN' }); }, deadlineMs: 500 }); };

// ── B1 — HELD AFTER A READ: the last values known ────────────────────────────────────────────────────────────────────────────
console.log('B1 the settings read, then held: the clocks, the cap and the plugin list keep the person\'s last values');
{
  const w = world({ settings: PERSON });
  const r0 = reads(w.kp), rel0 = w.kp.idleReleaseAfterMs(), tko0 = w.kp.takeoverIdleMs();
  ok(!!(rel0 === 0 && tko0 === 0), 'B1 — the scene: readable, the person\'s 0 («never») stands for the release and the takeover', { rel0, tko0, r0 });
  w.st.held = HELD;
  const r1 = reads(w.kp), rel1 = w.kp.idleReleaseAfterMs(), tko1 = w.kp.takeoverIdleMs();
  ok(!!(rel1 === 0 && tko1 === 0), 'B1 — THE LAW (held: the last value known): the ephemeral release and the takeover keep the person\'s «never» — RED: they fall to 3 minutes and the default lapse', { rel1, tko1 });
  ok(!!(r1 && r1.idleMs === 0 && r1.cap === 12 && r1.capUnread === false), 'B1 — THE LAW: the idle sweep keeps «never» and the ceiling keeps the person\'s 12 (not unread: it is known) — RED: 15 minutes and 6', r1);
  w.done();
}

// ── B2 — HELD AT A START: nothing known ⇒ the safe side ──────────────────────────────────────────────────────────────────────
console.log('B2 the settings held at the keeper\'s birth (nothing known): the safe side, scene by scene');
{
  const w = world({ held: HELD, settings: PERSON, pinFile: { version: '0.38.1', path: '/opt/kept-pin/agent-browser' } });
  await nap(50);   // the kept pin is read once at the keeper's birth, off the loop
  const r = reads(w.kp), rel = w.kp.idleReleaseAfterMs(), tko = w.kp.takeoverIdleMs();
  ok(!!(rel === 0 && tko === 0), 'B2 — THE LAW (scenes 2, 3: no release, no lapse by a default clock): with nothing known the release and the takeover are «never» — RED: 3 minutes and the default', { rel, tko });
  ok(!!(r && r.idleMs === 0), 'B2 — THE LAW (scene 1): the idle sweep stops nothing by a default clock — RED: 15 minutes', r);
  let sf = null; try { sf = w.kp.statusFor('conv-held'); } catch (e) { sf = { threw: String(e && e.message).slice(0, 80) }; }
  const m = sf && sf.cap && sf.cap.machine;
  ok(!!(r && r.capUnread === true && m && m.unread === true && m.code === 'browser_settings_unread'), 'B2 — THE LAW (scene 6, r3443 hold 3): the ceiling is SAID unread — the launches count against the product\'s default and no number is the person\'s — RED: the default shown as the person\'s', { reads: r, machine: m });
  ok(!!(sf && sf.settingsHeld && sf.settingsHeld.code === 'browser_settings_unread'), 'B2 — THE LAW (point 9): the browsers\' status says the settings hold where the person looks (the held words\' row) — RED: nothing said', sf && { settingsHeld: sf.settingsHeld });
  const ex = await exitOf(w);
  ok(!!(ex && ex.ok === false && ex.code === 'browser_settings_unread' && ex.status === 503 && !/no exit check address is set/.test(String(ex.error || ''))), 'B2 — THE LAW (scene 5): the exit check is refused BY NAME, its address unread — never «no exit check address is set» — RED: exit_url_unset', ex && { code: ex.code, status: ex.status, error: String(ex.error || '').slice(0, 120) });
  const v = r && typeof r.egress === 'function' ? r.egress(PLUGIN, 'a.example') : null, v2 = r && typeof r.egress === 'function' ? r.egress(PLUGIN, 'x.wide-manifest.example') : null;
  ok(!!(v && v.allow === false && v2 && v2.allow === false && /settings cannot be read/.test(String(v.why)) && !/example/.test(String(v.why) + String(v2.why))), 'B2 — THE LAW (scene 4, r3443 hold 4): a plugin reaches NO address — not its manifest\'s wider list — and its refusal names the hold and nothing of any list — RED: the manifest\'s list admits', { v, v2 });
  let pin = null; try { pin = w.kp.cliPin(); } catch (e) { pin = { threw: String(e && e.message).slice(0, 80) }; }
  ok(!!(pin && pin.path === '/opt/kept-pin/agent-browser' && pin.held === true), 'B2 — THE LAW (scene 7): a launch uses the pin the last run kept, before PATH\'s tool — RED: PATH', pin && { mode: pin.mode, path: pin.path, held: pin.held });
  // B3 — THE LIFT: the door answers null again; the next read is the file's — no restart
  w.st.held = null; w.st.settings['browser.idleTimeoutMs'] = 600000;
  const r3 = reads(w.kp);
  ok(!!(r3 && r3.idleMs === 600000 && r3.capUnread === false && r3.cap === 12), 'B3 — THE LAW (lifted with no restart): the settings read again, the keeper reads the person\'s values', r3);
  w.done();
}

// ── B4 — PRODUCTION's NAMES: the hub wires the keeper's settingsHeld to the persistence router's ────────────────────────────────
console.log('B4 production\'s names: the hub hands the keeper the persistence router\'s settings hold');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const at = src.indexOf("require('./browser-keeper').create("), seg = at < 0 ? '' : src.slice(at, at + 12000);
  ok(!!(at >= 0 && /settingsHeld: \(\) => \(typeof persistenceRouter\.settingsHeld === 'function' \? persistenceRouter\.settingsHeld\(\) : null\)/.test(seg)), 'B4 — the keeper the hub creates reads its settings hold from the persistence router (the door every holder receives)', { found: at >= 0 });
}
report();
