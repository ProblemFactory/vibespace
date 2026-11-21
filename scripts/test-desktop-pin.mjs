#!/usr/bin/env node
// THE PINNED PIXEL SIZE (lane e2b, docs/design-agent-browser-v2 §E2.2, B-830d ②) — a desktop-app window (the agent's
// desktop browser first) may PIN an absolute framebuffer size: the record's fact `pin`, the X window IS the pin, the pane
// rescales the picture (contain-fit, upscaling allowed), pixel coordinates are the pin's.
//   ① PURE (src/desktop-pin.js): parsePin's table + bounds, pinVerdict by who, fitForPin (upscale allowed), the chip's
//      words en/zh/ja, defaultPinFor (E2c's default — E2c decides the mode)
//   ② the door: desktopAppNewVerdict takes --size (auto = unpinned, out of bounds refused by name, another row desktop_app_only)
//   ③ the REAL window-targets engine over a fake keeper: the launch carries the pin; `size` by the opener / another
//      conversation / on the user's own window; auto unpins; the fact written through keeper.setPin; a relaunch keeps it
//   ④ the keeper + route seams (source): setPin = the one writer (commit = save + broadcast), the launch stamp, the
//      relaunch carry, the `pin` op, the user route judges who 'user', the agent route = engine.setSize, the window re-fits in place
//   ⑤ the CLI against a stub server: `vibespace-window size <handle> WxH | auto`
//   ⑥ r2 — the relay's PIN FENCE (every viewer's display/geometry dropped while pinned) + the keeper's fit seams
//   ⑦ lane e2-canvas — THE HELLO GATE: a fake xpra with 6.5.4's rule (a packet read before its hello answer closes the
//      connection) behind the REAL bridge: a pinned window's viewer says hello ⇒ nothing else reaches xpra before it answers
//   CONTROLS (patched copies): a downscale-only fit ⇒ RED; a non-opener allowed ⇒ RED; --size still not_yet ⇒ RED;
//      the relay's pin fence removed ⇒ RED; the relay's hello gate removed ⇒ RED (the viewer dropped, 1005)
//   ⑧ lane launch-picture-size — THE ONE SIZE TABLE (SIZE_CHOICES: follow the pane / 1280×720 / 1920×1080 / 2560×1440 /
//      custom), launchPinOf, pinSupportVerdict over the REAL rung table (xpra 'client' + Xvfb 'fixed' hold a pin; Xvnc
//      'follows' / the shared desktop / no cell ⇒ pin_unsupported by name), pinMenuModel (the rows both windows word), and
//      THE CENSUS: no second list of sizes anywhere in src/ or data/bin/ — only the table and the two CLI help MIRRORS
//      (pinned to the table, order and all); the engine's `open --size` (born pinned, opener by pinVerdict, a bad size
//      refused before the keeper); the seams (the route judges `pin`, the launch's one stamp, the support verdict after the
//      rung is resolved, the Xvfb rung born at the pin); both CLIs (`vibespace-window open --size`, `vibespace-browser size`
//      / `open --size` — a refused size exits 2 with the server's words)
//   CONTROLS (lane launch-picture-size): a planted second list ⇒ the census RED; Xvnc admitted ⇒ the support leg RED
// Fast: in-process, scratch dirs only, no browser, no display.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const PIN_REL = 'src/desktop-pin.js', ENGINE_REL = 'src/server/window-targets-engine.js', DOOR_REL = 'src/browser-profiles.js';
const P = require(path.join(REPO, PIN_REL));
const B = require(path.join(REPO, DOOR_REL));
const ENGINE = require(path.join(REPO, ENGINE_REL));
const MUT = mutantCopies('desktop-pin', REPO);

/** ① the PURE tables — re-run on the patched copies below. */
function pureChecks(PP) {
  const parse = [
    ['1920x1080', { w: 1920, h: 1080 }], ['1600×900', { w: 1600, h: 900 }], ['1280X720', { w: 1280, h: 720 }], [' 1024 x 768 ', { w: 1024, h: 768 }],
    ['auto', null], ['AUTO', null], [{ w: 800, h: 600 }, { w: 800, h: 600 }], ['320x240', { w: 320, h: 240 }], ['7680x4320', { w: 7680, h: 4320 }],
  ];
  const refused = [['319x240', 'size_out_of_bounds', /width 319/], ['320x239', 'size_out_of_bounds', /height 239/], ['7681x1080', 'size_out_of_bounds', /width 7681/], ['1920x4321', 'size_out_of_bounds', /height 4321/],
    ['big', 'bad-size', /WxH/], ['', 'bad-size', /WxH/], ['1920', 'bad-size', /WxH/], ['-1x5', 'bad-size', /WxH/], ['1.5x2', 'bad-size', /WxH/]];
  const parseOk = parse.every(([s, want]) => { const v = PP.parsePin(s); return v.ok && same(v.pin, want); });
  const refuseOk = refused.every(([s, code, re]) => { const v = PP.parsePin(s); return !v.ok && v.code === code && re.test(v.error); });
  const mine = { id: 'da-1', origin: 'agent-browser', by: { sessionId: 'S-A' } }, users = { id: 'da-2' };
  const who = {
    opener: PP.pinVerdict({ facts: { sessionId: 'S-A' }, record: mine, who: 'agent', size: '1600x900' }),
    other: PP.pinVerdict({ facts: { sessionId: 'S-B' }, record: mine, who: 'agent', size: '1600x900' }),
    agentOnUsers: PP.pinVerdict({ facts: { sessionId: 'S-A' }, record: users, who: 'agent', size: '1600x900' }),
    userOnAny: PP.pinVerdict({ record: users, who: 'user', size: '1280x720' }),
    userOnAgents: PP.pinVerdict({ record: mine, who: 'user', size: 'auto' }),
    badFirst: PP.pinVerdict({ facts: { sessionId: 'S-B' }, record: mine, who: 'agent', size: '10x10' }),
    noRecord: PP.pinVerdict({ who: 'user', size: '1280x720' }),
  };
  const up = PP.fitForPin({ w: 1600, h: 900 }, { width: 3200, height: 1800 });
  const down = PP.fitForPin({ w: 1600, h: 900 }, { width: 700, height: 500 });
  const tall = PP.fitForPin({ w: 1280, h: 720 }, { w: 640, h: 720 });
  const DA = require(path.join(REPO, 'src/desktop-apps.js'));
  const pol = (backend, via) => DA.fitPolicyOf({ backend, via });
  const support = {
    xpra: PP.pinSupportVerdict(pol('xpra', 'xpra'), { backend: 'xpra', via: 'xpra' }),
    xvfb: PP.pinSupportVerdict(pol('vnc-display', 'Xvfb+x11vnc'), { backend: 'vnc-display', via: 'Xvfb+x11vnc' }),
    xvnc: PP.pinSupportVerdict(pol('vnc-display', 'Xvnc'), { backend: 'vnc-display', via: 'Xvnc' }),
    shared: PP.pinSupportVerdict(pol('desktop-singleton', 'Xtigervnc'), { backend: 'desktop-singleton', via: 'Xtigervnc' }),
    none: PP.pinSupportVerdict(null, {}),
  };
  const refusedBy = (v, re) => !v.ok && v.code === 'pin_unsupported' && re.test(v.error) && /the picture follows the pane/.test(v.error) && /Follow the pane/.test(v.error);
  return {
    support, supportOk: support.xpra.ok && support.xvfb.ok && refusedBy(support.xvnc, /vnc-display \(Xvnc\)/) && refusedBy(support.shared, /desktop-singleton \(Xtigervnc\)/) && refusedBy(support.none, /this display backend/),
    parseOk, refuseOk, who,
    whoOk: who.opener.ok && same(who.opener.pin, { w: 1600, h: 900 }) && !who.other.ok && who.other.code === 'not_your_window' && !who.agentOnUsers.ok && who.agentOnUsers.code === 'not_your_window'
      && who.userOnAny.ok && same(who.userOnAny.pin, { w: 1280, h: 720 }) && who.userOnAgents.ok && who.userOnAgents.pin === null && !who.badFirst.ok && who.badFirst.code === 'size_out_of_bounds' && !who.noRecord.ok && who.noRecord.code === 'not-found',
    up, down, tall,
    upscale: !!up && up.scale === 2 && up.x === 0 && up.y === 0,
    downOk: !!down && Math.abs(down.scale - 0.4375) < 1e-9 && down.x === 0 && down.y === Math.floor((500 - 900 * 0.4375) / 2),
    letterbox: !!tall && tall.scale === 0.5 && tall.x === 0 && tall.y === 180,
    noPin: PP.fitForPin(null, { width: 10, height: 10 }) === null && PP.fitForPin({ w: 10, h: 10 }, null) === null,
    chips: [PP.pinChipText({ w: 1920, h: 1080 }, 'en'), PP.pinChipText({ w: 1920, h: 1080 }, 'zh'), PP.pinChipText({ w: 1280, h: 720 }, 'ja'), PP.pinChipText(null, 'en'), PP.pinChipText({ w: 1, h: 1 }, 'en'), PP.pinChipText({ w: 1920, h: 1080 }, 'xx')],
    defaults: [PP.defaultPinFor('pixels'), PP.defaultPinFor('tree'), PP.defaultPinFor(undefined), PP.defaultPinFor('auto')],
  };
}
console.log('① PURE (src/desktop-pin.js)');
{
  const r = pureChecks(P);
  ok(r.parseOk, 'parsePin: WxH with x / X / ×, spaces trimmed, {w,h}, the bound edges 320×240 and 7680×4320 accepted; auto = null');
  ok(r.refuseOk, 'parsePin: out of bounds refused by name (size_out_of_bounds, naming the side), not WxH refused bad-size');
  ok(r.whoOk, 'pinVerdict: the opener on its own window ✓, another conversation ✗ not_your_window, an agent on the user\'s window ✗, the user on any ✓ (auto ⇒ null), a bad size refused before who', r.who);
  ok(r.upscale, 'fitForPin UPSCALES: 1600×900 in 3200×1800 ⇒ scale 2 (a pin always rescales — never capped at 1)', r.up);
  ok(r.downOk && r.letterbox, 'fitForPin: contain + centred (700×500 ⇒ 0.4375, y offset whole px; 1280×720 in 640×720 ⇒ 0.5 letterboxed at y 180)', { down: r.down, tall: r.tall });
  ok(r.noPin, 'fitForPin: no pin / no pane ⇒ null (the caller keeps its own fit)');
  ok(same(r.chips, ['1920×1080 (pinned)', '1920×1080（钉住）', '1280×720（固定）', '', '', '1920×1080 (pinned)']), 'pinChipText: "1920×1080 (pinned)" / 钉住 / 固定; unpinned or invalid ⇒ ""; an unknown language ⇒ en', r.chips);
  ok(same(r.defaults, [{ w: 1920, h: 1080 }, null, null, null]), 'defaultPinFor (E2c calls it): pixels ⇒ 1920×1080, tree / none ⇒ unpinned', r.defaults);
  ok(same(P.SIZE_CHOICES.map((c) => [c.id, c.pin, !!c.custom]), [['pane', null, false], ['1280x720', { w: 1280, h: 720 }, false], ['1920x1080', { w: 1920, h: 1080 }, false], ['2560x1440', { w: 2560, h: 1440 }, false], ['custom', null, true]])
    && Object.isFrozen(P.SIZE_CHOICES) && P.SIZE_CHOICES.every((c) => Object.isFrozen(c) && (!c.pin || Object.isFrozen(c.pin))) && same(P.PIN_BOUNDS, { minW: 320, maxW: 7680, minH: 240, maxH: 4320 }),
  'THE size table (lane launch-picture-size): follow the pane / 1280×720 / 1920×1080 / 2560×1440 / custom, frozen — and the bounds');
  ok(!/require\(|import /.test(read(PIN_REL).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'src/desktop-pin.js imports nothing (PURE)');
}

// ⑧ lane launch-picture-size — THE ONE SIZE TABLE: the launch's choice, which rungs hold a pin, the menu rows, the census
/** THE CENSUS — every tracked src/ + data/bin/ file whose CODE (comments stripped) names two or more of the table's sizes in a
 *  machine form ('1280x720', '1920×1080', {w: 2560, h: 1440}) is a LIST: only the table and the CLI help mirrors may hold one,
 *  and a mirror must say the table's fixed rows in its order. `texts` = {rel: source} (the control plants into a copy). */
const SIZE_HOME = 'src/desktop-pin.js', SIZE_MIRRORS = ['data/bin/vibespace-window', 'data/bin/vibespace-browser'];
function sizeCensus(PP, texts) {
  const fixed = PP.SIZE_CHOICES.filter((c) => c.pin);
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const lists = [], mirrors = {};
  for (const [rel, src] of Object.entries(texts)) {
    const code = strip(src);
    const hits = fixed.filter(({ pin: { w, h } }) => new RegExp(`\\b${w}\\s*[x×X]\\s*${h}\\b|\\bw:\\s*${w},\\s*h:\\s*${h}\\b|\\bwidth:\\s*${w},\\s*height:\\s*${h}\\b`).test(code));
    if (hits.length >= 2) lists.push(rel);
    if (SIZE_MIRRORS.includes(rel)) { const m = /const SIZE_HELP = '([^']*)';/.exec(src); mirrors[rel] = m ? m[1] : null; }
  }
  const want = fixed.map((c) => c.id).join(' | ') + ' | your own WxH';
  const strays = lists.filter((f) => f !== SIZE_HOME && !SIZE_MIRRORS.includes(f));
  return { lists, strays, mirrors, want, ok: !strays.length && SIZE_MIRRORS.every((f) => mirrors[f] === want) };
}
const trackedTexts = () => {
  const out = {};
  const files = require('child_process').execFileSync('git', ['-C', REPO, 'ls-files', 'src', 'data/bin'], { encoding: 'utf8' }).split('\n').filter((f) => f && (/\.(?:js|mjs|cjs)$/.test(f) || /^data\/bin\/[^./]+$/.test(f)));
  for (const f of files) { try { out[f] = read(f); } catch { } }
  return out;
};
console.log('⑧ lane launch-picture-size — THE ONE SIZE TABLE');
{
  const L = [['', null], [null, null], ['pane', null], ['1280x720', { w: 1280, h: 720 }], ['1920x1080', { w: 1920, h: 1080 }], ['2560x1440', { w: 2560, h: 1440 }], ['1600x900', { w: 1600, h: 900 }], ['auto', null]];
  const lOk = L.every(([c, want]) => { const v = P.launchPinOf(c); return v.ok && same(v.pin, want); });
  const lc = P.launchPinOf('custom'), lb = P.launchPinOf('100x100');
  ok(lOk && !lc.ok && lc.code === 'bad-size' && lc.error === P.parsePin('custom').error && !lb.ok && lb.code === 'size_out_of_bounds', 'launchPinOf: pane / \'\' / null ⇒ none, a table id ⇒ its pin, a typed WxH ⇒ parsed, `custom` with no size and an out-of-bounds size refused in parsePin\'s OWN words', { lc, lb });
  const r = pureChecks(P);
  ok(r.supportOk, 'pinSupportVerdict over the REAL rung table: xpra (client) and Xvfb+x11vnc (keeper-fixed) hold a pin; Xvnc (follows), the shared desktop and an unknown rung ⇒ pin_unsupported naming the backend, that the picture follows the pane, and the way out', r.support);
  const m0 = P.pinMenuModel(null), m1 = P.pinMenuModel({ w: 1920, h: 1080 }), m2 = P.pinMenuModel({ w: 1600, h: 900 });
  ok(same(m0.map((x) => [x.kind, x.id, x.checked]), [['size', '1280x720', false], ['size', '1920x1080', false], ['size', '2560x1440', false], ['custom', 'custom', false], ['auto', 'auto', true]])
    && m1.find((x) => x.checked).id === '1920x1080' && m2.find((x) => x.checked).kind === 'custom' && same(m2.find((x) => x.kind === 'custom').pin, { w: 1600, h: 900 }),
  'pinMenuModel: the table\'s sizes in its order, Custom…, Auto — ✓ on the current (unpinned ⇒ Auto; a custom pin ⇒ Custom… carrying its size)', { m0, m2 });
  const c = sizeCensus(P, trackedTexts());
  ok(c.ok && same(c.lists.slice().sort(), [SIZE_HOME, ...SIZE_MIRRORS].sort()), `THE CENSUS: no second list of sizes in src/ or data/bin/ — only the table and the two CLI help mirrors, each saying "${c.want}"`, c);
  const ui = read('src/lib/pin-size-ui.js'), launcher = read('src/lib/desktop-app-launcher.js'), win = read('src/lib/desktop-app-window.js'), live = read('src/lib/browser-live-window.js');
  ok(/import \{ SIZE_CHOICES, launchPinOf \} from '\.\.\/desktop-pin\.js';/.test(launcher) && /for \(const c of SIZE_CHOICES\) \{/.test(launcher) && /pinMenuModel\(cur\)\.map\(/.test(ui)
    && /const pinItems = \(\) => pinSizeItems\(pinOf\(rec && rec\.pin\), /.test(win) && /const pinItems = \(\) => pinSizeItems\(fixedNow\(\), /.test(live),
  'the Apps dialog\'s select draws its options from SIZE_CHOICES; both windows\' Pin size… rows come from pinMenuModel (pin-size-ui pinSizeItems)');
  ok(/validate: \(v\) => \{ const r = parsePin\(v\); return !r\.ok \? r\.error :/.test(ui) && /await showInputDialog\(\{/.test(ui) && !/\bprompt\(/.test(ui),
    'Custom… is a showInputDialog (never a native prompt) refused INLINE in parsePin\'s own words');
}

/** ② the door — re-run on the not_yet copy below. */
function doorChecks(BB) {
  const d = (x) => BB.desktopAppNewVerdict({ label: 'Site login', backend: 'desktop-app', ...x });
  const v = { pinned: d({ size: '1600x900' }), auto: d({ size: 'auto' }), none: d({}), big: d({ size: '9000x900' }), junk: d({ size: 'wide' }), profile: BB.desktopAppNewVerdict({ label: 'x', size: '1600x900' }) };
  return { v, ok: v.pinned.ok && same(v.pinned.pin, { w: 1600, h: 900 }) && v.auto.ok && v.auto.pin === null && v.none.ok && v.none.pin === null
    && !v.big.ok && v.big.code === 'size_out_of_bounds' && /--size: width 9000/.test(v.big.error) && !v.junk.ok && v.junk.code === 'bad-size' && !v.profile.ok && v.profile.code === 'desktop_app_only' };
}
console.log('② the door (desktopAppNewVerdict)');
{
  const r = doorChecks(B);
  ok(r.ok, 'the door takes --size: 1600x900 ⇒ pin, auto / absent ⇒ null, out of bounds / not WxH refused by name, on a profile row desktop_app_only', r.v);
  ok(/\[--size WxH\]/.test(B.DESKTOP_APP_DOOR) && !('size' in B.NOT_YET_FLAGS) && !('mode' in B.NOT_YET_FLAGS), 'the door\'s words name --size WxH; --mode is no longer not_yet either (lane e2c)');
}

const SESS_A = { agentToken: 'vsst_A', _browserKey: 'bk-0000000a', claudeSessionId: 'aaaaaaaa-1111-4000-8000-0000000000a1', backendSessionId: 'aaaaaaaa-1111-4000-8000-0000000000a1', backend: 'claude', name: 'A', mode: 'chat' };
const SESS_B = { agentToken: 'vsst_B', _browserKey: 'bk-0000000b', claudeSessionId: 'bbbbbbbb-2222-4000-8000-0000000000b2', backendSessionId: 'bbbbbbbb-2222-4000-8000-0000000000b2', backend: 'claude', name: 'B', mode: 'chat' };
const REGISTRY = [{ id: 'chromium', label: 'Chromium', exec: 'chromium', browser: 'chromium', category: 'browser', available: true }, { id: 'gedit', label: 'gedit', exec: 'gedit', available: true }];
/** The REAL engine over a fake keeper in the desktop-serve shape (launch stamps opts.pin; setPin = the one writer; relaunch carries it). */
function world(ENG, sub) {
  const dir = scratch('da-pin-' + sub); fs.mkdirSync(dir, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
  const sessions = new Map([['w-A', SESS_A], ['w-B', SESS_B]]);
  const records = new Map(); const launches = []; const pins = []; let n = 0;
  const keeper = {
    listApps: () => [...records.values()], get: (id) => records.get(id) || null, sessionPids: (rec) => Object.values(rec.pids).filter(Boolean), x11EnvFor: () => null, registry: () => REGISTRY,
    launch: async (body, opts = {}) => {
      launches.push({ body, opts }); await new Promise((r) => setTimeout(r, 5));
      const row = REGISTRY.find((r) => r.id === body.appId);
      const rec = { id: opts.id || `da-${++n}`, label: row.label, appId: row.id, browser: row.browser || undefined, state: 'launching', display: ':77', pids: { app: 4242 }, starts: { app: 9 }, backend: 'xpra', startedAt: 1 };
      if (row.browser && opts.origin === 'agent-browser') { rec.origin = 'agent-browser'; rec.by = { sessionId: opts.by.sessionId }; if (opts.label) rec.label = opts.label; }
      const p0 = P.pinOf(body.pin) || P.pinOf(opts.pin); if (p0) rec.pin = p0; // src/desktop-serve.js launch's ONE stamp (the body's pin, else the door's / a relaunch's)
      records.set(rec.id, rec); return rec;
    },
    setPin: async (id, pin) => { pins.push({ id, pin }); await new Promise((r) => setTimeout(r, 2)); const r = records.get(id); const p = P.pinOf(pin); if (p) r.pin = p; else delete r.pin; return { ...r }; },
    stop: async (id) => { const r = records.get(id); if (r) r.state = 'exited'; return r; },
    noteInput: () => { },
    // the Scale ▸ relaunch as src/desktop-serve.js runs it: the successor's opts carry origin/by/label AND the pin
    relaunch: async (id) => { const old = records.get(id); const next = await keeper.launch({ appId: old.appId }, { ...(old.origin === 'agent-browser' ? { origin: old.origin, by: old.by, label: old.label } : {}), ...(P.pinOf(old.pin) ? { pin: old.pin } : {}), id: `${id}-r` }); old.replacedBy = next.id; old.state = 'exited'; return { app: next }; },
  };
  const engine = ENG.create({ keeper, dataDir: path.join(dir, 'data'), env: () => ({}), activeSessions: sessions, broadcast: () => { }, bins: { xdotool: null, gdbus: null }, log: { warn() { }, log() { } }, procExe: () => null });
  return { records, launches, pins, keeper, engine, fA: engine.factsForToken('vsst_A'), fB: engine.factsForToken('vsst_B') };
}
const codeOf = async (p) => { try { await p; return null; } catch (e) { return e.code || String(e.message); } };
console.log('③ the REAL engine over a fake keeper');
{
  const W = world(ENGINE, 'eng');
  const r = await W.engine.openAgentBrowser(B.desktopAppNewVerdict({ label: 'Site', backend: 'desktop-app', size: '1600x900' }), W.fA);
  ok(same(W.launches[0].opts.pin, { w: 1600, h: 900 }) && same(W.records.get(r.handle).pin, { w: 1600, h: 900 }), '`new … --size 1600x900` ⇒ the keeper\'s launch opts carry the pin ⇒ the record\'s fact', W.launches[0].opts);
  const r0 = await W.engine.openAgentBrowser(B.desktopAppNewVerdict({ label: 'Plain', backend: 'desktop-app' }), W.fA);
  ok(!('pin' in W.launches[1].opts) && !('pin' in W.records.get(r0.handle)), 'no --size ⇒ no pin in the opts, none on the record (tree mode stays unpinned)');
  const a = await W.engine.setSize(r.handle, '1280x720', W.fA);
  ok(same(a, { handle: r.handle, pin: { w: 1280, h: 720 } }) && same(W.pins.slice(-1)[0], { id: r.handle, pin: { w: 1280, h: 720 } }) && same(W.records.get(r.handle).pin, { w: 1280, h: 720 }), 'the OPENER: `size <h> 1280x720` ⇒ written through keeper.setPin (the one writer), answered from the keeper\'s record', a);
  const other = await codeOf(W.engine.setSize(r.handle, '1920x1080', W.fB));
  const n = W.pins.length;
  ok(other === 'not_your_window' && W.pins.length === n && same(W.records.get(r.handle).pin, { w: 1280, h: 720 }), 'another conversation ⇒ not_your_window, nothing written', other);
  const g = await W.keeper.launch({ appId: 'gedit' }, {});
  const usersWin = await codeOf(W.engine.setSize(g.id, '1280x720', W.fA));
  ok(usersWin === 'not_your_window', 'an agent on a window it did not open (the user\'s gedit) ⇒ not_your_window — the user pins it from its menu', usersWin);
  const bad = await codeOf(W.engine.setSize(r.handle, '100x100', W.fA));
  const gone = await codeOf(W.engine.setSize('da-nope', '1280x720', W.fA));
  ok(bad === 'size_out_of_bounds' && gone === 'not-found', 'a bad size ⇒ refused by name; an unknown handle ⇒ not-found', { bad, gone });
  const rl = await W.keeper.relaunch(r.handle);
  ok(same(rl.app.pin, { w: 1280, h: 720 }) && rl.app.origin === 'agent-browser', 'a relaunch KEEPS the pin (the successor\'s opts carry it, beside origin/opener/label)', rl.app);
  const off = await W.engine.setSize(rl.app.id, 'auto', W.fA);
  ok(off.pin === null && !('pin' in W.records.get(rl.app.id)), '`size <h> auto` ⇒ unpinned (the fact removed — the window fits the pane again)', off);
  // lane launch-picture-size: `vibespace-window open <app> --size WxH` — born pinned; the opener's right by pinVerdict
  const n0 = W.launches.length;
  const o1 = await W.engine.open({ appId: 'gedit', size: '1280x720' }, W.fA);
  ok(same(W.launches[n0].body.pin, { w: 1280, h: 720 }) && same(W.records.get(o1.handle).pin, { w: 1280, h: 720 }) && o1.attached === true, '⑧ `open gedit --size 1280x720` ⇒ the keeper\'s launch body carries the pin ⇒ the window is BORN pinned (and attached)', W.launches[n0]);
  const o2 = await W.engine.open({ appId: 'gedit', size: 'auto' }, W.fA);
  ok(!('pin' in W.launches[n0 + 1].body) && !('pin' in W.records.get(o2.handle)), '⑧ `--size auto` ⇒ no pin (it fits the pane)');
  const n1 = W.launches.length;
  const o3 = await codeOf(W.engine.open({ appId: 'gedit', size: '9x9' }, W.fA));
  const o4 = await codeOf(W.engine.open({ appId: 'gedit', size: 'wide' }, W.fA));
  ok(o3 === 'size_out_of_bounds' && o4 === 'bad-size' && W.launches.length === n1, '⑧ a bad size ⇒ refused by name BEFORE the keeper is asked (nothing launched)', { o3, o4 });
}

console.log('④ the keeper + route + window seams (source)');
{
  const ds = read('src/desktop-serve.js'), keeper = read('src/server/desktop-app-keeper.js'), routes = read('src/routes/desktop-apps.js'), wt = read('src/routes/window-targets.js'), win = read('src/lib/desktop-app-window.js'), view = read('src/lib/xpra-view.js');
  ok(/function setPin\(id, pin\) \{\n    const rec = store\.apps\[id\];[\s\S]{0,200}const p = stampPin\(rec, pin\);\n    commit\(\);/.test(ds) && /function stampPin\(rec, pin\) \{ const p = pinOf\(pin\); if \(p\) rec\.pin = p; else delete rec\.pin; return p; \}/.test(ds) && (ds.match(/\brec\.pin = /g) || []).length === 1 && (ds.match(/delete rec\.pin\b/g) || []).length === 1, 'desktop-serve setPin is the one writer: the fact set or removed, then commit() (saved + broadcast — a restart restores it, every client hears it)');
  ok(/const pinAsked = pv\.pin \|\| pinOf\(opts\.pin\);/.test(ds) && /stampPin\(rec, pinAsked\);/.test(ds) && /\.\.\.\(pinOf\(rec\.pin\) \? \{ pin: rec\.pin \} : \{\}\) \}; \/\/ lane e2b: the pin rides the relaunch/.test(ds), 'the launch stamps opts.pin; the relaunch\'s opts carry rec.pin (the real keeper; the heavy suite drives it)');
  ok(/'keep-alive', 'pin', 'relaunch'/.test(ds) && /if \(op === 'pin'\) \{ const v = parsePin\(p\.pin\);/.test(ds) && /acc\(\)\.call\(ro\.hostId, 'pin', \{ id, pin \}\)/.test(keeper), 'the `pin` op (a paired machine\'s window) and the hub keeper\'s setPin routing to it');
  ok(/router\.post\('\/api\/desktop\/apps\/:id\/pin'[\s\S]{0,300}pinVerdict\(\{ record: ctx\.keeper\.get\(req\.params\.id\), who: 'user',/.test(routes), 'the user route (the window menu) judges who: \'user\' — any window');
  // lane launch-picture-size: the launch's `pin` — judged at the route (before a paired machine is asked), the support verdict
  // once the rung is resolved (a relaunch never re-judged), the Xvfb rung born at the pin, the codes by status
  const launchRoute = (routes.split("router.post('/api/desktop/apps', async (req, res) => {")[1] || '').split('\n});')[0];
  ok(/const pv = parsePin\(req\.body && req\.body\.pin !== undefined && req\.body\.pin !== '' \? req\.body\.pin : null\);\n  if \(!pv\.ok\) return fail\(res, \{ code: pv\.code, message: pv\.error \}\);/.test(launchRoute)
    && /code === 'bad-size' \|\| code === 'size_out_of_bounds' \|\| code === 'pin_unsupported'/.test(routes),
  '⑧ POST /api/desktop/apps judges `pin` in parsePin\'s words before any machine is asked; bad-size / size_out_of_bounds / pin_unsupported answer 400');
  const lsrc = (ds.split('  async function launch(body, opts = {}) {')[1] || '').split('\n  function startDeferred')[0];
  ok(lsrc.indexOf('const pv = parsePin(') > -1 && lsrc.indexOf('const pv = parsePin(') < lsrc.indexOf('const resolved = resolve(') && lsrc.indexOf('if (pv.pin) { const sv = pinSupportVerdict(M.fitPolicyOf({ backend: resolved.backend, via: resolved.via }, backends)') > lsrc.indexOf('const resolved = resolve(')
    && lsrc.indexOf('pinSupportVerdict(') < lsrc.indexOf('store.apps[id] = rec;') && /geometry: bornGeometry\(rec\),/.test(ds) && /return p && pol && pol\.mode === 'fixed' \? `\$\{p\.w\}x\$\{p\.h\}` : geometry;/.test(ds),
  '⑧ desktop-serve launch: the body\'s pin parsed first, the support verdict on it right after the rung is resolved and before the record exists (the door\'s / a relaunch\'s opts.pin keep e2b\'s road); a keeper-fixed rung\'s X server is born at the pin');
  const eng = read(ENGINE_REL);
  ok(/const pv = PIN\.pinVerdict\(\{ facts, record: \{ id: String\(appId \|\| 'the app'\), by: \{ sessionId: facts\.sessionId \} \}, who: 'agent', size: b\.size \}\);/.test(eng) && /'bad-size': 400, size_out_of_bounds: 400, pin_unsupported: 400, not_your_window: 403/.test(wt),
    '⑧ the engine\'s open judges --size by pinVerdict (the caller IS the opener); the agent routes answer the size codes 400 / 403');
  ok(/router\.post\('\/api\/agent\/window\/size'[\s\S]{0,200}refuseHost\(req, res\)[\s\S]{0,200}agentFacts\(req, res, engine\)[\s\S]{0,200}engine\.setSize\(h,/.test(wt), 'the agent route sits behind the agent belt and calls engine.setSize (the opener verdict is the engine\'s)');
  ok(/view\?\.setPin\?\.\(pinOf\(rec\.pin\)\);/.test(win) && /pinChipText\(rec\.pin, resolveLang\(\)\)/.test(win) && /label: t\('Pin size…'\), children: pinItems\(\)/.test(win) && !/setFixedSize\([^)]*pin/i.test(win), 'the window: every record re-fits the view IN PLACE + the chip "(pinned)" + the menu Pin size… — never setFixedSize');
  ok(/const pf = pinNow \? fitForPin\(\{ w: pinNow\.w \/ drawRatio, h: pinNow\.h \/ drawRatio \}, paneSize\(\)\) : null;/.test(view) && /if \(client\) client\.setPin\(n\);/.test(view), 'the view scales a pinned stage with fitForPin (upscale allowed) and hands the pin to the client');
}

console.log('⑤ the CLI against a stub server');
{
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const j = body ? JSON.parse(body) : {}; seen.push({ url: req.url, j }); res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/agent/window/size' && j.size === 'auto') return res.end(JSON.stringify({ handle: j.handle, pin: null }));
      if (req.url === '/api/agent/window/size' && j.size === '9x9') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'width 9 is outside 320–7680 pixels', code: 'size_out_of_bounds' })); }
      if (req.url === '/api/agent/window/size') return res.end(JSON.stringify({ handle: j.handle, pin: { w: 1600, h: 900 } }));
      // lane launch-picture-size: the agent's open --size and the browser's fixed size (the stub answers as the routes do)
      const P2 = require(path.join(REPO, PIN_REL));
      if (req.url === '/api/agent/window/open') { const v = P2.parsePin(j.size === undefined ? null : j.size); if (!v.ok) { res.statusCode = 400; return res.end(JSON.stringify({ error: v.error, code: v.code })); } return res.end(JSON.stringify({ handle: 'da-9', app: { label: 'gedit', display: ':9', state: 'launching', ...(v.pin ? { pin: v.pin } : {}) }, attached: true, next: 'vibespace-window snapshot da-9' })); }
      if (req.url === '/api/agent/browser/size') { const v = P2.parsePin(j.size); if (!v.ok) { res.statusCode = 400; return res.end(JSON.stringify({ error: v.error, code: v.code })); } return res.end(JSON.stringify({ ok: true, fixed: v.pin, applied: j.check ? 'check' : 'now' })); }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${srv.address().port}`;
  const home = scratch('da-pin-home'); fs.mkdirSync(home, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { } });
  const BIN = path.join(home, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const run = (bin, args) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin', bin), ...args], { env: { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_' + 't'.repeat(24), VIBESPACE_SESSION_CWD: home, LANG: 'C.UTF-8' }, cwd: home, timeout: 20000 }, (e, out, err) => resolve({ code: e ? (e.code ?? 1) : 0, out, err })));
  const a = await run('vibespace-window', ['size', 'da-7', '1600x900']);
  ok(a.code === 0 && same(seen.slice(-1)[0], { url: '/api/agent/window/size', j: { handle: 'da-7', size: '1600x900' } }) && /pinned da-7 to 1600×900/.test(a.out) && /click --at/.test(a.out), '`vibespace-window size da-7 1600x900` ⇒ POST /api/agent/window/size {handle, size}; the answer names the pixels', a);
  const b = await run('vibespace-window', ['size', 'da-7', 'auto']);
  ok(b.code === 0 && /unpinned da-7/.test(b.out), '`size da-7 auto` ⇒ unpinned', b);
  const c = await run('vibespace-window', ['size', 'da-7', '9x9']);
  ok(c.code !== 0 && /size_out_of_bounds/.test(c.err), 'a refusal is printed with its code', c);
  const d = await run('vibespace-window', ['size', 'da-7']);
  ok(d.code !== 0 && /vibespace-window size <handle> <WxH\|auto>/.test(d.err + d.out), 'no size ⇒ the usage line', d);
  // lane launch-picture-size: `vibespace-window open <app> --size WxH`
  const o = await run('vibespace-window', ['open', 'gedit', '--size', '1280x720']);
  ok(o.code === 0 && same(seen.slice(-1)[0], { url: '/api/agent/window/open', j: { appId: 'gedit', size: '1280x720' } }) && /picture pinned at 1280×720/.test(o.out), '⑧ `vibespace-window open gedit --size 1280x720` ⇒ POST …/open {appId, size}; the line says the picture is pinned', o);
  const o2 = await run('vibespace-window', ['open', 'gedit', '--size', '9x9']);
  ok(o2.code === 2 && /width 9 is outside 320–7680 pixels \[size_out_of_bounds\]/.test(o2.err), '⑧ a refused size ⇒ the server\'s words (parsePin\'s) and exit 2', o2);
  const o3 = await run('vibespace-window', ['open', 'gedit', '--size']);
  ok(o3.code === 2 && /--size WxH \(1280x720 \| 1920x1080 \| 2560x1440 \| your own WxH\)/.test(o3.err), '⑧ `--size` with no size ⇒ the usage line naming the table, exit 2', o3);
  const h = await run('vibespace-window', ['help']);
  ok(/open <app-id> \[--title <t>\] \[--size WxH\]/.test(h.out + h.err) && /--size fixes its picture \(1280x720 \| 1920x1080 \| 2560x1440 \| your own WxH\)/.test(h.out + h.err), '⑧ the window CLI\'s help names --size and the table', h.out.slice(0, 200));
  // lane launch-picture-size: `vibespace-browser size <WxH|auto>` (the CDP rung's fixed size)
  const b1 = await run('vibespace-browser', ['size', '1920x1080']);
  ok(b1.code === 0 && same(seen.slice(-1)[0], { url: '/api/agent/browser/size', j: { size: '1920x1080' } }) && /picture size fixed at 1920×1080/.test(b1.out), '⑧ `vibespace-browser size 1920x1080` ⇒ POST /api/agent/browser/size; it says the size is fixed', b1);
  const b2 = await run('vibespace-browser', ['size', 'auto']);
  ok(b2.code === 0 && /picture size unfixed/.test(b2.out), '⑧ `size auto` ⇒ unfixed (the page follows the view again)', b2);
  const b3 = await run('vibespace-browser', ['size', '1x1']);
  ok(b3.code === 2 && /width 1 is outside 320–7680 pixels \[size_out_of_bounds\]/.test(b3.err), '⑧ a refused size ⇒ parsePin\'s words, exit 2', b3);
  const nSeen = seen.length;
  const b4 = await run('vibespace-browser', ['open', 'https://example.com/', '--size', '9x9']);
  ok(b4.code === 2 && /nothing was opened/.test(b4.err) && seen.length === nSeen + 1 && seen[nSeen].j.check === true, '⑧ `open <url> --size 9x9` ⇒ judged BEFORE the open (one check call), refused with exit 2 — nothing opened', { b4, seen: seen.slice(nSeen) });
  const bh = await run('vibespace-browser', ['help']);
  ok(/size <WxH\|auto>/.test(bh.out + bh.err) && /open <url> --size WxH/.test(bh.out + bh.err) && /1280x720 \| 1920x1080 \| 2560x1440 \| your own WxH/.test(bh.out + bh.err), '⑧ the browser CLI\'s help names `size`, `open … --size` and the table');
  srv.close();
}

console.log('⑥ the relay\'s PIN FENCE (stream-relay-xpra strip { pinned } — r2: the keeper owns a pinned window\'s geometry)');
const RELAY_REL = 'src/server/stream-relay-xpra.js';
const rpkt = (type, { flags = 0x10, level = 0, index = 0, tail = Buffer.from([0]) } = {}) => { const t = Buffer.from(type); const payload = Buffer.concat([Buffer.from([192 + 2, 128 + t.length]), t, tail]); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = flags; h[2] = level; h[3] = index; h.writeUInt32BE(payload.length, 4); return Buffer.concat([h, payload]); };
function fenceChecks(XR) {
  const geo = () => Buffer.concat([rpkt('display-configure'), rpkt('configure-window')]);
  const chunk = Buffer.concat([geo(), rpkt('key-action'), rpkt('damage-sequence')]);
  const active = XR.xpraInputSieve().strip(chunk, true, { pinned: true });
  const free = XR.xpraInputSieve().strip(chunk, true, { pinned: false });
  const w1 = XR.xpraInputSieve(); w1.strip(geo(), false, { pinned: true }); const afterPinnedWatch = w1.strip(Buffer.alloc(0), true);
  const w2 = XR.xpraInputSieve(); w2.strip(geo(), false); const replayPinned = w2.strip(Buffer.alloc(0), true, { pinned: true });
  const w3 = XR.xpraInputSieve(); w3.strip(geo(), false); const replayFree = w3.strip(Buffer.alloc(0), true);
  const kept = rpkt('key-action').length + rpkt('damage-sequence').length;
  return {
    activeDrops: active.pinCut === 2 && !!active.relay && active.relay.length === kept,
    freeKeeps: free.pinCut === 0 && !!free.relay && free.relay.length === chunk.length,
    watchNotHeld: afterPinnedWatch.relay === null, replayDropped: replayPinned.relay === null,
    replayFree: !!replayFree.relay && replayFree.replayedKinds.includes('window geometry') && replayFree.replayedKinds.includes('display size'),
  };
}
{
  const r = fenceChecks(require(path.join(REPO, RELAY_REL)));
  ok(r.activeDrops, 'pinned: an ACTIVE viewer\'s display-configure + configure-window are dropped (pinCut 2), its input and damage acks still relayed');
  ok(r.watchNotHeld && r.replayDropped, 'pinned: a Watch viewer\'s geometry is dropped, never held — and nothing held before the pin replays at a takeover');
  ok(r.freeKeeps && r.replayFree, 'unpinned: today\'s rule — an active viewer\'s geometry relayed, a Watch viewer\'s held and replayed at its takeover (x5)');
  const ds = read('src/desktop-serve.js'), wiring = read('src/server/window-live-wiring.js'), dsp = read('src/desktop-display.js');
  ok(/\(M\.keeperFits\(M\.fitPolicyOf\(rec, backends\)\) \|\| !!pinOf\(rec\.pin\)\)/.test(ds) && /if \(pin && !xpraRoot && \(size\.w !== pin\.w \|\| size\.h !== pin\.h\)\) \{ \/\/ a keeper-fitted \(no-xpra\) rung/.test(ds) && /const target = xpraRoot \? \{ w: pin\.w, h: pin\.h \} : rec\.fb;/.test(ds), 'the keeper owns a pinned window\'s geometry: fitApplies takes a pin on every rung; on the xpra rung NO xrandr (r3) — the plan maximises the main window to the PIN; xrandr --fb only on a keeper-fitted rung');
  ok(/if \(p && fitApplies\(rec\)\) scheduleFit\(id, `pinned \$\{p\.w\}x\$\{p\.h\}`, 0\);/.test(ds) && /\['--fb', `\$\{Number\(w\)\}x\$\{Number\(h\)\}`\]/.test(dsp), 'setPin fits at once (a launch\'s ready, a restart\'s adopt and the belt go through fitApplies too)');
  ok(/pinned: \(id\) => \(!own\(id\) && keeper\.get\(id\) && keeper\.get\(id\)\.pin\) \|\| null,/.test(wiring), 'the stream wiring hands the bridge the keeper\'s record pin');
  // r3: the bridge ASKS xpra for the pin (its own desktop_size packet, rencodeplus) — byte-exact against the suite's packet shape
  const XR = require(path.join(REPO, RELAY_REL));
  const pk = XR.pinDesktopPacket({ w: 1600, h: 900 });
  ok(same([...XR.rencodePlus(['ping', 0])], [...rpkt('ping')]) && XR.xpraPacketType(pk.subarray(8)) === 'desktop_size' && pk[0] === 0x50 && pk[1] === 0x10 && pk.readUInt32BE(4) === pk.length - 8, 'r3: rencodePlus writes the suite\'s own packet bytes (P / rencodeplus / size); the pin packet is a desktop_size');
  ok(same([...XR.rencodePlus([1600, 900, 43, 44, -5, 'ab', {}]).subarray(8)], [199, 63, 0x06, 0x40, 63, 0x03, 0x84, 43, 62, 44, 62, 0xfb, 130, 97, 98, 102]), 'r3: ints fixed 0..43 / INT1 / INT2, a short string, an empty dict — python-rencode\'s codes');
  const rx = read(RELAY_REL);
  ok(/relayUp\(pinDesktopPacket\(p\)\)/.test(rx) && /=== 'desktop_size'\) \{ assertPin\('xpra answered'\)/.test(rx) && /assertPin\('after the held hello'\)/.test(rx) && /onDesktopSize\?\.\(id, p\.w, p\.h, viewerId\)/.test(rx), 'r3: the bridge asks after the hello (and the held hello), when the pin changes, and when xpra answers another desktop_size — then the keeper re-fits');
  ok(/const plan = clamps\.length \? \{ \.\.\.plan0, clamps, settled: false \} : plan0;/.test(ds) && /for \(const c of plan\.clamps \|\| \[\]\) args\.push\('windowsize', '--sync', String\(c\.id\), String\(c\.w\), String\(c\.h\)\)/.test(dsp), 'r3: a pinned window\'s other top-levels larger than the pin are clamped into it (the screenshot\'s box = the pin)');
  ok(/\/\^Xpra-CorralWindow-\(0x\[0-9a-f\]\+\)\$\/i\.exec/.test(ds) && /clamps\.push\(\{ id: client\.id, w: target\.w, h: target\.h \}\)/.test(ds), 'r3: xpra\'s corral — the client window inside it is sized to the pin too (measured: the corral alone left Chrome at its first size)');
  const RR = require(path.join(REPO, 'src/window-reach.js'));
  const wins = [{ id: 1, x: 0, y: 0, w: 1600, h: 900, cls: 'chrome', mapped: true }, { id: 2, x: 0, y: 0, w: 2033, h: 2284, cls: 'chrome', mapped: true }];
  const pp = RR.pixelPlan(wins, { pin: { w: 1600, h: 900 } }), pu = RR.pixelPlan(wins);
  ok(pp.ok && pp.w === 1600 && pp.h === 900 && pu.w === 2033 && pu.h === 2284, 'r3: a PINNED window\'s pixel plan (the screenshot\'s box) is the pin — another top-level at 2033×2284 never widens it; unpinned unchanged', { pp: [pp.w, pp.h], pu: [pu.w, pu.h] });
  ok(/R\.pixelPlan\(r\.windows, \{ pin: PIN\.pinOf\(rec\.pin\) \}\)/.test(read(ENGINE_REL)), 'r3: the engine hands the record\'s pin to the pixel plan');
  ok(/mapped: xpraRoot \? null : visible \? visible\.has\(r\.id\) : null/.test(ds), 'r3: a pinned window on the xpra rung is fitted mapped or not (no viewer ⇒ xpra leaves it unmapped)');
}

// ⑦ LANE e2-canvas (int243 2026-10-09, THE SECOND E2 CHROME PATH — a desktop-app window shown on every client with no canvas):
// xpra 6.5.4 answers a hello on a thread (server/core.py _process_hello → verify_auth → GLib.idle_add(hello_oked), which creates
// the connection's source) and a packet it reads from a connection with NO source yet is invalid (server/base.py
// handle_invalid_packet ⇒ proto.close(), no disconnect packet). The bridge asked xpra for a pinned window's size right behind
// the viewer's hello, so xpra dropped the viewer whenever that ask won the race (the browser: 'No Status Received' (1005)), and
// every reconnect raced the same way. A FAKE xpra with that rule (it answers the hello ANSWER_MS later) behind the REAL bridge.
const DS_REL = 'src/server/desktop-stream.js', RELAYS_REL = 'src/server/stream-relays.js';
async function helloGateChecks(S, XR) {
  const ANSWER_MS = 120;
  const WebSocket = require('ws');
  const waitFor = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };
  const fake = new WebSocket.WebSocketServer({ host: '127.0.0.1', port: 0, handleProtocols: (ps) => (ps.has('binary') ? 'binary' : false) });
  await new Promise((r) => fake.on('listening', r));
  const seen = { hellos: 0, early: [], after: [] };
  fake.on('connection', (c) => {
    let answered = false, asked = false;
    c.on('message', (m) => {
      const b = Buffer.from(m);
      for (let i = 0; i + 8 <= b.length;) { // one ws message may carry several packets (the bridge relays a group as one)
        const n = b.readUInt32BE(i + 4), type = XR.xpraPacketType(b.subarray(i + 8, i + 8 + n)); i += 8 + n;
        if (type === 'hello' && !asked) { asked = true; seen.hellos++; setTimeout(() => { if (c.readyState !== 1) return; answered = true; c.send(XR.rencodePlus(['hello', {}])); }, ANSWER_MS); }
        else if (!answered) { seen.early.push(type); c.terminate(); return; } // handle_invalid_packet: proto.close(), no disconnect packet
        else seen.after.push(type);
      }
    });
  });
  const ID = 'da-e2canvas-pinned';
  const stream = S.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => (id === ID ? { kind: 'xpra', port: fake.address().port } : null), pinned: (id) => (id === ID ? { w: 1920, h: 1080 } : null), log: { log() {}, warn() {}, error() {} } });
  const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => { const id = S.upgradeId(req.url.split('?')[0]); if (!id) { socket.destroy(); return; } stream.handleUpgrade(req, socket, head, id); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const viewer = new WebSocket(`ws://127.0.0.1:${srv.address().port}${S.streamPath(ID)}?viewer=wl-e2canvas`);
  const got = []; let closeCode = null;
  viewer.on('message', (m) => got.push(Buffer.from(m)));
  viewer.on('close', (code) => { closeCode = code; });
  const opened = await new Promise((r) => { viewer.on('open', () => r(true)); viewer.on('error', () => r(false)); });
  if (opened) viewer.send(XR.rencodePlus(['hello', {}])); // the client's hello already carries the pin (xpra-client fitTarget)
  await waitFor(() => closeCode !== null || got.length > 0, ANSWER_MS + 3000);
  await waitFor(() => closeCode !== null || seen.after.length > 0, 1000); // what waited for the answer reaches xpra
  const r = { opened, open: viewer.readyState === 1 && closeCode === null, closeCode, answered: got.some((b) => b.length > 8 && XR.xpraPacketType(b.subarray(8)) === 'hello'), hellos: seen.hellos, early: seen.early.slice(), after: seen.after.slice() };
  try { viewer.close(); } catch { }
  await new Promise((res) => setTimeout(res, 50));
  srv.close(); fake.close();
  return r;
}
{
  const r = await helloGateChecks(require(path.join(REPO, DS_REL)), require(path.join(REPO, RELAY_REL)));
  ok(r.opened && r.hellos === 1 && r.early.length === 0, `e2-canvas: a PINNED window's viewer says hello ⇒ xpra hears NOTHING else before it answers (early: ${JSON.stringify(r.early)})`, r);
  ok(r.answered && r.open && r.closeCode === null, 'e2-canvas: so xpra keeps the connection — the viewer gets the answer and stays open (no 1005, a view that can paint)', r);
  ok(same(r.after, ['desktop_size']), `e2-canvas: the bridge's pin ask waited for the answer and went up right after it (after: ${JSON.stringify(r.after)})`, r);
}

console.log('CONTROLS (patched copies)');
{
  const ps = read(PIN_REL);
  const downOnly = ps.replace('const scale = Math.min(pw / pin.w, ph / pin.h),', 'const scale = Math.min(1, pw / pin.w, ph / pin.h),');
  ok(downOnly !== ps, 'control (a) planted: fitForPin capped at 1 (downscale only)');
  ok(!pureChecks(MUT.load(PIN_REL, downOnly, 'down-only')).upscale, 'CONTROL (a): a downscale-only fit ⇒ the upscale leg goes RED');
  const anyone = ps.replace('if (opener && facts && opener === facts.sessionId) return { ok: true, pin: p.pin };', 'return { ok: true, pin: p.pin };');
  ok(anyone !== ps, 'control (b) planted: pinVerdict admits any agent');
  ok(!pureChecks(MUT.load(PIN_REL, anyone, 'any-agent')).whoOk, 'CONTROL (b): a non-opener allowed ⇒ the who leg goes RED');
  const bs = read(DOOR_REL);
  const notYet = bs.replace("const NOT_YET_FLAGS = Object.freeze({});", "const NOT_YET_FLAGS = Object.freeze({ size: 'E2b (a pinned pixel size)' });");
  ok(notYet !== bs, 'control (c) planted: --size still not_yet');
  ok(!doorChecks(MUT.load(DOOR_REL, notYet, 'size-not-yet')).ok, 'CONTROL (c): --size still refused not_yet ⇒ the door leg goes RED');
  const rs = read(RELAY_REL);
  const leaky = rs.replace('      if (life || pin || (!allowInput', '      if (life || (!allowInput');
  ok(leaky !== rs, 'control (d) planted: the relay forgets the pin fence');
  ok(!fenceChecks(MUT.load(RELAY_REL, leaky, 'pin-fence-leak')).activeDrops, 'CONTROL (d): a pinned window\'s viewer geometry relayed ⇒ the fence leg goes RED');
  // (e) e2-canvas: the hello gate removed (the bridge's pin ask goes up right behind the hello, as on f1e317418) — a closed
  // world of copies (desktop-stream → stream-relays → the patched relay), each requiring the next by absolute path
  const gateLine = "if (!answered) { if (helloUp) { owed.push(out); return; } helloUp = true; } ";
  const ungated = rs.replace(gateLine, '');
  ok(ungated !== rs && rs.split(gateLine).length === 2, 'control (e) planted: the relay forgets the hello gate');
  const relayCopy = MUT.write(RELAY_REL, ungated, 'no-hello-gate');
  const relaysSrc = read(RELAYS_REL), dsSrc = read(DS_REL);
  const relaysCopy = MUT.write(RELAYS_REL, relaysSrc.replace("require('./stream-relay-xpra.js')", `require(${JSON.stringify(relayCopy)})`), 'no-hello-gate');
  const dsMut = dsSrc.replace("require('./stream-relays.js')", `require(${JSON.stringify(relaysCopy)})`);
  ok(dsMut !== dsSrc && relaysSrc.includes("require('./stream-relay-xpra.js')"), 'control (e): the copies chain desktop-stream → stream-relays → the patched relay');
  const re = await helloGateChecks(MUT.load(DS_REL, dsMut, 'no-hello-gate'), require(path.join(REPO, RELAY_REL)));
  ok(re.early.includes('desktop_size') && !re.open && re.closeCode === 1005, `CONTROL (e): the pin ask behind the hello ⇒ xpra drops the viewer (early ${JSON.stringify(re.early)}, close ${re.closeCode}) ⇒ the gate leg goes RED`, re);
  // (f) lane launch-picture-size: a SECOND LIST planted in the launcher ⇒ the census goes RED (by the file it names)
  const texts = trackedTexts();
  const lrel = 'src/lib/desktop-app-launcher.js';
  const planted = { ...texts, [lrel]: texts[lrel] + "\nconst SIZES = ['1280x720', '1920x1080']; // a second list\n" };
  const cf = sizeCensus(P, planted);
  ok(!cf.ok && same(cf.strays, [lrel]), 'CONTROL (f): a second list of sizes planted in the launcher ⇒ the census RED, naming it', cf.strays);
  const mirrorOff = { ...texts, 'data/bin/vibespace-window': texts['data/bin/vibespace-window'].replace("const SIZE_HELP = '1280x720 | 1920x1080 | 2560x1440 | your own WxH';", "const SIZE_HELP = '1920x1080 | 1280x720 | your own WxH';") };
  ok(!sizeCensus(P, mirrorOff).ok, 'CONTROL (f2): a help mirror out of step with the table (order / a row missing) ⇒ the census RED');
  // (g) pinSupportVerdict admitting Xvnc's 'follows' (a fit the viewer moves) ⇒ the support leg RED
  const xv = ps.replace("if (policy && (policy.mode === 'client' || policy.mode === 'fixed')) return { ok: true };", "if (policy && (policy.mode === 'client' || policy.mode === 'fixed' || policy.mode === 'follows')) return { ok: true };");
  ok(xv !== ps, 'control (g) planted: Xvnc admitted');
  ok(!pureChecks(MUT.load(PIN_REL, xv, 'xvnc-pins')).supportOk, 'CONTROL (g): Xvnc\'s follows admitted ⇒ the support leg goes RED');
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 7, label: 'desktop-pin' })) ok(x.pass, x.name, x.detail);
}

// ═══ B-dbb4 (the coordinator's r756 / r772): THE APP'S WINDOWS THE IMAGE DOES NOT SHOW ARE NAMED — never a silent stay ═══
// userW's report (fb-43b1db9bb4, its record not read past its cut): a sign-in popup a desktop-app Chromium opened was «not
// followed». The image is pixelPlan's union of MAPPED named top-levels right/below the main's origin or over it, cut to a pin:
// a popup up-left of the main, an unmapped one the corral map does not reach, or one beyond the pin is left out SILENTLY.
// Unit 1: every screenshot answer names each (title, size, where, why) with a recipe — PURE, the real engine over a fake
// keeper, and the real route + the shipped CLI (a non-latin-1 title through the header).
{
  console.log('\n§DBB4 the app\'s windows the image does not show are named');
  const R = require(path.join(REPO, 'src/window-reach.js')), UN = require(path.join(REPO, 'src/window-unshown.js')), WT = require(path.join(REPO, 'src/window-targets.js')), ROUTES = require(path.join(REPO, 'src/routes/window-targets.js')), express = require('express');
  const dir = scratch('da-pin-dbb4'); fs.mkdirSync(dir, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
  const repo = REPO;
  const main = { id: 1, title: 'App', cls: 'chromium', x: 600, y: 400, w: 1200, h: 800, mapped: true };
  const pop = { id: 2, title: 'Sign in – Google Accounts', cls: 'chromium', x: 0, y: 0, w: 500, h: 600, mapped: true }; // up-left, not over the main
  const helper = { id: 3, cls: 'chromium', x: -10, y: -10, w: 15, h: 15, mapped: true }; // Chrome's own 15×15: no window a person sees
  const hidden = { id: 4, title: 'Hidden', cls: 'chromium', x: 700, y: 500, w: 400, h: 300, mapped: false }; // unmapped, no corral
  const over = { id: 5, title: 'Over', cls: 'chromium', x: 650, y: 450, w: 500, h: 400, mapped: true }; // a popup OVER the main: a member
  const pinned = { id: 7, title: 'App', cls: 'chromium', x: 0, y: 0, w: 1600, h: 900, mapped: true }; // the pinned browser (1600×900) IS the main
  const big = { id: 6, title: 'Big', cls: 'chromium', x: 1400, y: 700, w: 500, h: 400, mapped: true }; // over the main, reaching past its pinned box
  const p1 = R.pixelPlan([pop, helper, hidden, over, main]);
  const u1 = UN.unshownOf([pop, helper, hidden, over, main], p1);
  ok(u1.length === 2 && u1[0].id === 2 && u1[0].why === 'outside' && u1[0].x === -600 && u1[0].y === -400 && u1[1].id === 4 && u1[1].why === 'unmapped' && !u1.some((x) => x.id === 3 || x.id === 5 || x.id === 1),
    'unshownOf: the popup up-left of the main (outside, at -600,-400 of the image) and the unmapped window are named; Chrome\'s 15×15 helper, the popup OVER the main (a member) and the main itself never', u1);
  const pPin = R.pixelPlan([big, pinned], { pin: { w: 1600, h: 900 } });
  const uPin = UN.unshownOf([big, pinned], pPin);
  ok(uPin.length === 1 && uPin[0].id === 6 && uPin[0].why === 'clipped' && uPin[0].x === 1400 && uPin[0].y === 700, 'unshownOf: a popup over the pinned main that reaches past the pin\'s box is named clipped', { uPin, main: pPin.main, w: pPin.w, h: pPin.h });
  ok(UN.unshownOf([over, main], R.pixelPlan([over, main])).length === 0 && UN.unshownText([], 'da-x') === '' && UN.unshownOf([main], { ok: false }).length === 0, 'CONTROL: nothing left out ⇒ nothing named, no words; a plan that failed names nothing');
  const words = UN.unshownText(u1, 'da-pop');
  ok(words.startsWith('this app has 2 more window(s) this image does not show — «Sign in – Google Accounts» 500x600 at -600,-400 of this image: it sits up-left of the main window without covering it') && words.includes('its own handle `da-pop.w2`') && words.includes('«Hidden» 400x300 at 100,100 of this image: it has no pixels on the display yet') && words.includes('`vibespace-window watch da-pop`') && words.includes('A window\'s own handle makes it the subject: `vibespace-window screenshot <its handle>`') && !/alt\+tab|move it yourself/.test(words),
    'unshownText: each window by title, size and place, why the image leaves it out, and ITS OWN HANDLE (unit 2: the agent chooses it as the subject); an unmapped one waits for the user\'s live view', words);
  ok(UN.subHandle('da-pop', 0x2a00004) === 'da-pop.w2a00004' && UN.SUB_RE.exec('da-pop.w2a00004')[1] === 'da-pop' && parseInt(UN.SUB_RE.exec('da-pop.w2a00004')[2], 16) === 0x2a00004 && !UN.SUB_RE.test('da-pop'), 'unit 2: a window\'s handle is `<handle>.w<hex X id>` and reads back (the route\'s handle rule already admits it)');
  ok(UN.UNSHOWN_MIN_PX === 100, 'the smallest window named is 100×100 (Chrome\'s helper is 15×15)');
  // THE ENGINE over a fake xpra keeper: the screenshot answer carries {unshown, note}; CONTROL: the popup moved over the main
  const recP = { id: 'da-pop', label: 'Pop', exec: 'x', state: 'ready', display: ':96', pids: { app: 4545 }, backend: 'xpra', startedAt: Date.now(), readyAt: Date.now() };
  let rowsP = [pop, helper, main].map((w) => ({ ...w }));
  const keeperP = { listApps: () => [recP], get: (id) => (id === recP.id ? recP : null), sessionPids: () => [4545], x11EnvFor: () => ({ DISPLAY: ':96' }), windows: async () => ({ ok: true, windows: rowsP.map((w) => ({ ...w })) }) };
  const shotsP = [], clicksP = [];
  const wtP = { ...WT, probeInputBackends: async () => ({ rows: [{ backend: 'xtest', ok: true }], injection: { backend: 'xtest' }, ours: true }), probeA11y: async () => ({ ok: true, apps: 1 }),
    windowShot: async ({ out, plan }) => { shotsP.push({ main: plan.main && plan.main.id, w: plan.w, h: plan.h, origin: plan.origin }); fs.writeFileSync(out, 'png'); return { ok: true, w: plan.w, h: plan.h, lit: 9, bytes: 3 }; },
    displayGeometry: async () => ({ ok: true, w: 4000, h: 3000 }),
    injectClick: async (o) => { clicksP.push({ x: o.x, y: o.y }); return { ok: true, did: { verb: 'click' } }; } };
  const sessP = new Map([['s1', { agentToken: 'vsst_dbb4', name: 'alpha', backend: 'claude', backendSessionId: 'conv-dbb4' }]]);
  const EP = ENGINE.create({ keeper: keeperP, dataDir: path.join(dir, 'dbb4-engine'), env: () => ({}), activeSessions: sessP, wt: wtP, bins: { xdotool: '/bin/true' }, log: { warn() { }, log() { } }, groupsOf: () => [], modeProbeMs: 0 });
  const fP = { sessionId: 's1', session: sessP.get('s1'), browserKey: null, name: 'alpha' };
  EP.grantReach('da-pop', { kind: 'session', id: 's1' }); EP.setShareMode('da-pop', 'pixels'); EP.attach('da-pop', fP);
  try {
    const sh = await EP.screenshot('da-pop', fP);
    ok(sh.windows === 1 && Array.isArray(sh.unshown) && sh.unshown.length === 1 && sh.unshown[0].id === 2 && sh.unshown[0].why === 'outside' && typeof sh.note === 'string' && sh.note.includes('«Sign in – Google Accounts» 500x600 at -600,-400'),
      'the engine\'s screenshot NAMES the popup its image leaves out (unshown + the words) — the image itself unchanged (1 window, the origin the main\'s)', { windows: sh.windows, unshown: sh.unshown, note: sh.note });
    ok(/"verb":"screenshot"[^\n]*"unshown":1/.test(fs.readFileSync(EP.auditFile, 'utf8')), 'audited: the screenshot\'s unshown count');
    // UNIT 2 (r772): the window's OWN handle is the call's subject — its image, its origin, its --at; CONTROL the app's own handle
    const sub = await EP.screenshot('da-pop.w2', fP);
    ok(!!(sub.subject && sub.subject.id === 2 && sub.subject.handle === 'da-pop.w2' && sub.windows === 1 && sub.w === 500 && sub.h === 600 && sub.originX === 0 && sub.originY === 0 && !sub.unshown),
      'unit 2: `screenshot da-pop.w2` is THAT window\'s own image (500×600, its origin 0,0; the subject named) — never the main window\'s', { subject: sub.subject, w: sub.w, h: sub.h, o: [sub.originX, sub.originY], shot: shotsP[shotsP.length - 1] });
    await EP.act('da-pop.w2', fP, { verb: 'click', at: '10,20' });
    await EP.act('da-pop', fP, { verb: 'click', at: '10,20' });
    ok(clicksP.length === 2 && clicksP[0].x === 10 && clicksP[0].y === 20 && clicksP[1].x === 610 && clicksP[1].y === 420, 'unit 2: `click da-pop.w2 --at 10,20` lands on the POPUP (its origin 0,0 + 10,20); CONTROL: the app\'s own handle maps the same point through the main window (600,400 + 10,20)', clicksP);
    let gone = null; try { await EP.screenshot('da-pop.w99', fP); } catch (e) { gone = e; }
    let tree = null; try { await EP.act('da-pop.w2', fP, { verb: 'click', ref: '@e1' }); } catch (e) { tree = e; }
    ok(!!(gone && gone.code === 'window_gone' && /da-pop\.w99 is gone/.test(gone.message) && tree && tree.code === 'window_subject_pixels'), 'unit 2: a window that is not the app\'s (or gone) is refused window_gone by name, never the main window\'s image; a tree verb on a chosen window is refused by name (window_subject_pixels)', { gone: gone && [gone.code, gone.message], tree: tree && tree.code });
    // ── THE CURE (round wudero5nj): a call on a window's own handle acts on THAT window or is refused by name ──
    const keysP = [], typedP = [];
    wtP.injectKey = async (o) => { keysP.push({ window: o.window, focus: o.focus }); return { ok: true, did: { verb: 'key' } }; };
    wtP.injectType = async (o) => { typedP.push({ window: o.window, focus: o.focus, text: o.text }); return { ok: true, did: { verb: 'type' } }; };
    // M3: keys and text on a chosen window go to ITS X window and focus inside it (the popup at 0,0: its centre-ish 20,20)
    await EP.act('da-pop.w2', fP, { verb: 'key', chord: 'Return' });
    await EP.act('da-pop.w2', fP, { verb: 'type', text: 'hi' });
    ok(keysP.length === 1 && keysP[0].window === 2 && keysP[0].focus.x === 20 && keysP[0].focus.y === 20 && typedP.length === 1 && typedP[0].window === 2 && typedP[0].focus.x === 20,
      'M3: a key and a text on `da-pop.w2` go to the POPUP\'s X window (window 2) with the pointer inside it — never the main window that holds X focus', { keysP, typedP });
    // M2: under a TREE share a text on a chosen window still goes by its keys into THAT window — never the app's focused field
    EP.setShareMode('da-pop', 'tree');
    await EP.act('da-pop.w2', fP, { verb: 'type', text: 'tree' });
    EP.setShareMode('da-pop', 'pixels');
    ok(typedP.length === 2 && typedP[1].window === 2 && typedP[1].text === 'tree', 'M2: under a TREE share `type da-pop.w2` types into the popup by its keys (window 2) — the tree road (the app\'s focused field) is never taken for a chosen window', typedP);
    // M1: the window list unreadable (a bounded read timed out, a record still launching) ⇒ refused by name, NOTHING done
    const rowsKeep = rowsP; const clicks0 = clicksP.length;
    const winsKeep = keeperP.windows; keeperP.windows = async () => ({ ok: false, error: 'the gate: the list timed out' });
    let u1 = null, u2 = null; try { await EP.screenshot('da-pop.w2', fP); } catch (e) { u1 = e; } try { await EP.act('da-pop.w2', fP, { verb: 'click', at: '10,20' }); } catch (e) { u2 = e; }
    keeperP.windows = async () => { throw new Error('the gate: the helper died'); };
    let u3 = null; try { await EP.act('da-pop.w2', fP, { verb: 'key', chord: 'Return' }); } catch (e) { u3 = e; }
    keeperP.windows = winsKeep; rowsP = rowsKeep;
    ok(!!(u1 && u1.code === 'window_list_unreadable' && /^da-pop\.w2: the app's window list could not be read just now \(the gate: the list timed out\) — nothing was done/.test(u1.message) && u2 && u2.code === 'window_list_unreadable' && u3 && u3.code === 'window_list_unreadable' && clicksP.length === clicks0 && keysP.length === 1),
      'M1: the window list answering not-ok, or throwing ⇒ a screenshot, a click and a key on `da-pop.w2` are refused window_list_unreadable naming THAT handle — no click, no key (never the main\'s image, never display coordinates)', { u1: u1 && [u1.code, u1.message], u2: u2 && u2.code, u3: u3 && u3.code, clicks: clicksP.length - clicks0 });
    // RED CONTROLS: an engine copy with today's fall-through (the list's not-ok answers null) / no subject focus / the tree road
    const ES = read(ENGINE_REL);
    const fall = ES.replace("if (!r || !r.ok) { if (sub != null) throw unreadable(r && r.error); return null; }", 'if (!r || !r.ok) return null;').replace("if (sub != null) throw (e && ['window_gone', 'window_list_unreadable', 'window_subject_shared'].includes(e.code) ? e : unreadable(e && e.message));\n      return null;", 'return null;').replace("if (!plan || !plan.ok || !plan.subject) throw refuse('window_unshowable',", "if (false) throw refuse('window_unshowable',"); // stale-pins: kept (a RED control plants the pre-cure text)
    const noFocus = ES.replace("const dw = subjectWin(px) || dialogWindow(px, lease); // lane window-dialog-member", "const dw = dialogWindow(px, lease); // lane window-dialog-member"); // stale-pins: kept (a RED control plants the pre-cure text)
    const treeRoad = ES.replace("if (!body.ref && (pixelShare || sub != null)) return injected(", "if (!body.ref && pixelShare) return injected("); // stale-pins: kept (a RED control plants the pre-cure text)
    ok(fall !== ES && noFocus !== ES && treeRoad !== ES, 'controls planted: the fall-through, the key without its subject window, the tree road for a chosen window');
    const runCopy = async (src, tag, fn) => {
      const EC = MUT.load(ENGINE_REL, src, tag);
      const E2 = EC.create({ keeper: keeperP, dataDir: path.join(dir, 'dbb4-' + tag), env: () => ({}), activeSessions: sessP, wt: wtP, bins: { xdotool: '/bin/true' }, log: { warn() { }, log() { } }, groupsOf: () => [], modeProbeMs: 0 });
      E2.grantReach('da-pop', { kind: 'session', id: 's1' }); E2.setShareMode('da-pop', 'pixels'); E2.attach('da-pop', fP);
      try { return await fn(E2); } catch (e) { return { threw: e && e.code }; }
    };
    const cR = clicksP.length;
    const red1 = await runCopy(fall, 'fall-through', async (E2) => { keeperP.windows = async () => ({ ok: false }); try { await E2.act('da-pop.w2', fP, { verb: 'click', at: '10,20' }); return { clicked: clicksP.length - cR }; } finally { keeperP.windows = winsKeep; } });
    const kR = keysP.length;
    const red2 = await runCopy(noFocus, 'no-subject-focus', async (E2) => { await E2.act('da-pop.w2', fP, { verb: 'key', chord: 'Return' }); return keysP[kR] || null; });
    const tR = typedP.length;
    const red3 = await runCopy(treeRoad, 'tree-road', async (E2) => { E2.setShareMode('da-pop', 'tree'); await E2.act('da-pop.w2', fP, { verb: 'type', text: 'x' }); return { typed: typedP.length - tR }; });
    ok(!!(red1 && red1.clicked === 1), 'RED CONTROL of M1: today\'s fall-through — the list unreadable, the click on `da-pop.w2` is SENT (at display coordinates) and answered', red1);
    ok(!!(red2 && red2.window == null), 'RED CONTROL of M3: without the subject window the key carries no window — X focus decides (the main, on xpra with a viewer)', red2);
    ok(!!(red3 && (red3.threw || red3.typed === 0)), 'RED CONTROL of M2: the tree road for a chosen window never types into it (the app\'s focused field, or a refusal of the tree\'s own)', red3);
    // RULED: on a SHARED desktop (a rung that does not own its display) no window has a handle of its own
    const recS = { id: 'da-sh', label: 'Shared', exec: 'x', state: 'ready', display: ':0', pids: { app: 4646 }, backend: 'desktop-singleton', startedAt: Date.now(), readyAt: Date.now() };
    const keeperS = { ...keeperP, listApps: () => [recP, recS], get: (id) => (id === recP.id ? recP : id === recS.id ? recS : null) };
    const ES2 = ENGINE.create({ keeper: keeperS, dataDir: path.join(dir, 'dbb4-shared'), env: () => ({}), activeSessions: sessP, wt: wtP, bins: { xdotool: '/bin/true' }, log: { warn() { }, log() { } }, groupsOf: () => [], modeProbeMs: 0 });
    ES2.grantReach('da-sh', { kind: 'session', id: 's1' }); ES2.setShareMode('da-sh', 'pixels'); ES2.attach('da-sh', fP);
    let sh1 = null; try { await ES2.screenshot('da-sh.w2', fP); } catch (e) { sh1 = e; }
    const shWords = UN.unshownText([{ id: 2, title: 'Terminal', x: -600, y: 0, w: 500, h: 400, why: 'outside' }], 'da-sh', { handles: false });
    ok(!!(sh1 && sh1.code === 'window_subject_shared' && /use the app's own handle da-sh/.test(sh1.message) && !/own handle `/.test(shWords) && /shared with the user's own windows/.test(shWords)),
      'RULED: on a SHARED desktop (desktop-singleton: it does not own its display) a typed window handle is refused window_subject_shared (use the app\'s own handle), and unit 1\'s words give no window a handle there', { sh1: sh1 && [sh1.code, sh1.message], shWords });
    // a window of ANOTHER app (an id this app's display does not list) is refused window_gone — the list is the app's own display's
    let fo = null; try { await EP.screenshot('da-pop.w7', fP); } catch (e) { fo = e; }
    ok(!!(fo && fo.code === 'window_gone' && /da-pop\.w7 is gone/.test(fo.message)), 'a window id this app\'s display does not hold (another app\'s, a closed one) is refused window_gone naming THAT handle', fo && [fo.code, fo.message]);
    ok(UN.titleOf({ title: 'Sign\u0007in\u001b[31m\u0085x' }) === 'Sign in [31m x' && UN.titleOf({ cls: 'chromium' }) === 'chromium', 'ONE title helper: every control character (C0, DEL, C1) a space, the class when there is no title', UN.titleOf({ title: 'Sign\u0007in\u001b[31m\u0085x' }));
    const auditRows = fs.readFileSync(EP.auditFile, 'utf8').split('\n').filter((l) => l.includes('"verb":"key"') && l.includes('"subject":"da-pop.w2"'));
    ok(auditRows.length >= 1, 'the audit row of a call on a chosen window carries its subject (da-pop.w2)', fs.readFileSync(EP.auditFile, 'utf8').split('\n').filter((l) => l.includes('"verb":"key"')).slice(-3));
    // ── r946: THE TABLE, NOT A LIST — every verb the CLI has × every record kind × the subject's state. Each cell is «acted on
    // that window» or «refused by name, nothing injected, nothing recorded as done»; a CLI verb nobody wrote a cell for is red by
    // its name. The audit row of every cell carries the window's own handle as its subject (one assertion over the table) ──
    const CLI_SRC = read('data/bin/vibespace-window');
    const CLI_VERBS = [...new Set([...CLI_SRC.matchAll(/if \(verb === '([a-z]+)'\)/g)].map((m) => m[1]))];
    const NO_HANDLE = new Set(['list', 'open']); // they take no handle: no cell
    const PIXEL_VERBS = new Set(['screenshot', 'click', 'type', 'key', 'scroll']);
    const OTHER_CODE = { attach: 'window_subject_verb', detach: 'window_subject_verb', size: 'window_subject_verb', mode: 'window_subject_verb', stop: 'window_subject_verb', watch: 'window_subject_verb', snapshot: 'window_subject_pixels', text: 'window_subject_verb' };
    // B-4be3 (moved onto the train): `text @ref` goes through the ACT's door, as snapshot goes through the one door — the record kind
    // is judged first (a shared desktop has no window handles), then the verb: neither is a pixel verb
    const AFTER_KIND = new Set(['snapshot', 'text']);
    const unwritten = CLI_VERBS.filter((v) => !NO_HANDLE.has(v) && !PIXEL_VERBS.has(v) && !(v in OTHER_CODE));
    ok(CLI_VERBS.length >= 14 && unwritten.length === 0, `the table's verbs are the CLI's own (${CLI_VERBS.length}: ${CLI_VERBS.join(' ')}) — a verb nobody wrote a cell for is red by name`, unwritten);
    const scrollsP = []; wtP.injectScroll = async (o) => { scrollsP.push({ x: o.x, y: o.y }); return { ok: true, did: { verb: 'scroll', direction: o.direction, by: o.by } }; };
    const CALL = { screenshot: (E, h) => E.screenshot(h, fP), click: (E, h) => E.act(h, fP, { verb: 'click', at: '10,20' }), type: (E, h) => E.act(h, fP, { verb: 'type', text: 't' }), key: (E, h) => E.act(h, fP, { verb: 'key', chord: 'Return' }), scroll: (E, h) => E.act(h, fP, { verb: 'scroll', direction: 'down' }),
      snapshot: (E, h) => E.snapshot(h, fP), text: (E, h) => E.act(h, fP, { verb: 'text', ref: '@e1' }), attach: (E, h) => E.attach(h, fP), detach: (E, h) => E.detach(h, fP), size: (E, h) => E.setSize(h, '800x600', fP), mode: (E, h) => E.setLaunchMode(h, 'pixels', fP), stop: (E, h) => E.stopOwn(h, fP), watch: (E, h) => E.watch(h, fP) };
    // the record kinds: an app on a rung that owns its display (xpra), the person's own desktop (a record of origin «desktop»), a tree share
    const recDk = { id: 'da-dsk', label: 'Desktop', exec: 'x', state: 'ready', origin: 'desktop', display: ':0', pids: { app: 4747 }, backend: 'xpra', startedAt: Date.now(), readyAt: Date.now() };
    const recV = { id: 'da-vnc', label: 'OnePane', exec: 'x', state: 'ready', display: ':95', pids: { app: 4848 }, backend: 'vnc-display', startedAt: Date.now(), readyAt: Date.now() };
    const recSh = { id: 'da-shr', label: 'Shared', exec: 'x', state: 'ready', display: ':0', pids: { app: 4949 }, backend: 'desktop-singleton', startedAt: Date.now(), readyAt: Date.now() };
    const RECS = { 'da-pop': recP, 'da-dsk': recDk, 'da-vnc': recV, 'da-shr': recSh };
    let tableUnreadable = false;
    const vncRows = [{ id: 2, x: 0, y: 0, w: 500, h: 600, mapped: true }, { id: 1, title: 'App', cls: 'x', x: 600, y: 400, w: 1200, h: 800, mapped: true }]; // the subject listed with no class, name or title
    const keeperT = { ...keeperP, listApps: () => Object.values(RECS), get: (id) => RECS[id] || null, windows: async (id) => (tableUnreadable ? { ok: false, error: 'the table: unreadable' } : id === 'da-vnc' ? { ok: true, windows: vncRows.map((w) => ({ ...w })) } : keeperP.windows(id)) };
    const tableRun = async (E, label) => {
      const cells = [], miss = [];
      const KIND_REC = { xpra: 'da-pop', tree: 'da-pop', desktop: 'da-dsk', onepane: 'da-vnc', shared: 'da-shr' };
      for (const kind of Object.keys(KIND_REC)) for (const state of ['found', 'unreadable', 'gone', 'launching']) for (const verb of CLI_VERBS.filter((v) => !NO_HANDLE.has(v))) {
        const base0 = KIND_REC[kind], recK = RECS[base0];
        const h = base0 + (state === 'gone' ? '.w99' : '.w2');
        if (!CALL[verb]) { miss.push(verb); continue; }
        E.setShareMode('da-pop', kind === 'tree' ? 'tree' : 'pixels');
        tableUnreadable = state === 'unreadable';
        if (state === 'launching') recK.state = 'launching';
        const lastOf = { click: clicksP[clicksP.length - 1], key: keysP[keysP.length - 1], type: typedP[typedP.length - 1], scroll: scrollsP[scrollsP.length - 1], screenshot: shotsP[shotsP.length - 1] };
        const before = { inj: clicksP.length + keysP.length + typedP.length + scrollsP.length + shotsP.length, audit: fs.readFileSync(E.auditFile, 'utf8').length };
        let res = null, err = null; try { res = await CALL[verb](E, h); } catch (e) { err = e; }
        tableUnreadable = false; recK.state = 'ready';
        const after = clicksP.length + keysP.length + typedP.length + scrollsP.length + shotsP.length;
        const rows = fs.readFileSync(E.auditFile, 'utf8').slice(before.audit).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        // the door's order (r989): the lease, the record kind, the verb's kind, the record's state, the window (its plan OK)
        const sharedKind = kind === 'desktop' || kind === 'shared';
        const want = OTHER_CODE[verb] && !AFTER_KIND.has(verb) ? OTHER_CODE[verb] : sharedKind ? 'window_subject_shared' : AFTER_KIND.has(verb) ? OTHER_CODE[verb] : state === 'launching' ? 'window_not_ready' : state === 'unreadable' ? 'window_list_unreadable' : state === 'gone' ? 'window_gone' : kind === 'onepane' ? 'window_unshowable' : 'acted';
        // r989 (4): an «acted» cell judges the injection went to the SUBJECT's own window (the popup at 0,0, 500×600), never the main's
        const last = { click: clicksP[clicksP.length - 1], key: keysP[keysP.length - 1], type: typedP[typedP.length - 1], scroll: scrollsP[scrollsP.length - 1], screenshot: shotsP[shotsP.length - 1] }[verb];
        const toSubject = verb === 'click' ? !!last && last !== lastOf.click && last.x === 10 && last.y === 20 : verb === 'key' || verb === 'type' ? !!last && last !== lastOf[verb] && last.window === 2 : verb === 'scroll' ? !!last && last !== lastOf.scroll && last.x === 250 && last.y === 300 : verb === 'screenshot' ? !!(res && res.subject && res.subject.id === 2 && res.subject.handle === h && last && last.main === 2) : false;
        const acted = !err && after > before.inj && toSubject;
        const pass = want === 'acted' ? acted : (!!err && err.code === want && after === before.inj && !rows.some((r) => r.ok === true));
        const own = rows.filter((r) => r.verb === verb || r.by === 'subject'); // the cell's OWN rows (a share switch between cells audits its own)
        const subjOk = own.length >= 1 && own.every((r) => r.subject === h);
        cells.push({ cell: `${kind}·${state}·${verb}`, want, got: err ? err.code : acted ? 'acted' : 'acted elsewhere', pass, subjOk, rows: rows.length });
      }
      E.setShareMode('da-pop', 'pixels');
      return { cells, miss, label };
    };
    const ET = ENGINE.create({ keeper: keeperT, dataDir: path.join(dir, 'dbb4-table'), env: () => ({}), activeSessions: sessP, wt: wtP, bins: { xdotool: '/bin/true' }, log: { warn() { }, log() { } }, groupsOf: () => [], modeProbeMs: 0 });
    for (const id of Object.keys(RECS)) { ET.grantReach(id, { kind: 'session', id: 's1' }); ET.setShareMode(id, 'pixels'); try { ET.attach(id, fP); } catch { /* the record's own rule */ } }
    const T1 = await tableRun(ET, 'the cure');
    const bad = T1.cells.filter((c) => !c.pass), noSubj = T1.cells.filter((c) => !c.subjOk);
    console.log(`  · r946 the table: ${T1.cells.length} cells (${CLI_VERBS.length - NO_HANDLE.size} verbs × 5 kinds × 4 states); refused ${T1.cells.filter((c) => c.want !== 'acted').length}, acted ${T1.cells.filter((c) => c.want === 'acted').length}`);
    ok(T1.cells.length >= 240 && bad.length === 0 && T1.miss.length === 0, 'r946 + r989 THE TABLE: every CLI verb × record kind (an app owning its display, the person\'s own desktop, a tree share, a rung that cannot show one window alone, a shared rung) × subject state (found, the list unreadable, gone since the list, still launching) — each cell acted on THAT window, or refused by name with nothing injected and nothing recorded as done', bad.slice(0, 12));
    ok(noSubj.length === 0, 'r946: the audit row of EVERY cell carries the window\'s own handle as its subject (one assertion over the table)', noSubj.slice(0, 12));
    // RED CONTROLS: the door taken out of one verb (screenshot); a record kind's early return put back before the door
    const EST = read(ENGINE_REL);
    const noDoor = EST.replace("const door = await subjectDoor(handle0, facts, 'screenshot', { subjectVerb: true }); // B-dbb4 (r946): the one door — before the desktop record's own early return", "const door = { ...splitSubject(handle0), plan: null };"); // stale-pins: kept (a RED control plants the pre-door text)
    const earlyBack = EST.replace("  async function screenshot(handle0, facts) {\n", "  async function screenshot(handle0, facts) {\n    { const r0 = liveAny(splitSubject(handle0).handle); if (r0 && r0.origin === 'desktop') return { handle: r0.id, file: null, w: 1, h: 1, coords: 'display', planted: 'the early return before the door' }; }\n");
    ok(noDoor !== EST && earlyBack !== EST, 'controls planted: screenshot without the door; the desktop record\'s early return put back before it');
    const tableCopy = async (src, tag) => { const EC = MUT.load(ENGINE_REL, src, tag); const E2 = EC.create({ keeper: keeperT, dataDir: path.join(dir, 'dbb4-table-' + tag), env: () => ({}), activeSessions: sessP, wt: wtP, bins: { xdotool: '/bin/true' }, log: { warn() { }, log() { } }, groupsOf: () => [], modeProbeMs: 0 }); for (const id of Object.keys(RECS)) { E2.grantReach(id, { kind: 'session', id: 's1' }); E2.setShareMode(id, 'pixels'); try { E2.attach(id, fP); } catch { /* */ } } return tableRun(E2, tag); };
    const R1 = await tableCopy(noDoor, 'no-door'), R2 = await tableCopy(earlyBack, 'early-back');
    const tRed1 = R1.cells.filter((c) => !c.pass && c.cell.endsWith('·screenshot')), tRed2 = R2.cells.filter((c) => !c.pass && c.cell.startsWith('desktop·') && c.cell.endsWith('·screenshot'));
    ok(tRed1.length > 0, `RED CONTROL: screenshot without the door — its cells go red by name (${tRed1.map((c) => c.cell).slice(0, 4).join(', ')})`, tRed1.slice(0, 4));
    ok(tRed2.length > 0, `RED CONTROL: the desktop record's early return before the door — the person's own desktop's screenshot cells go red (${tRed2.map((c) => c.cell).slice(0, 4).join(', ')})`, tRed2.slice(0, 4));
    // r1472/r1486 (the box's test-window-targets red at 5b4176f46, «a revoke AFTER the act was issued: that act stands»): THE LEASE
    // IS READ AT THE CALL — synchronously, before the verb's promise is handed back — for the app's own handle too, and the verbs use
    // the door's read (never a second read after its wait): a revoke issued right after a call cannot refuse it. Each of the door's
    // three verbs is CALLED with a facts spy; the read is counted at the moment the call returns. RED CONTROL: 5b4176f46's code (the door
    // returns nothing for the app's own handle, each verb reads the lease after the wait) — no read at the call
    {
      const leaseAtCall = async (Emod, tag) => {
        const E4 = Emod.create({ keeper: keeperT, dataDir: path.join(dir, 'dbb4-call-' + tag), env: () => ({}), activeSessions: sessP, wt: wtP, bins: { xdotool: '/bin/true' }, log: { warn() { }, log() { } }, groupsOf: () => [], modeProbeMs: 0 });
        E4.grantReach('da-pop', { kind: 'session', id: 's1' }); E4.setShareMode('da-pop', 'pixels'); try { E4.attach('da-pop', fP); } catch { /* the record's own rule */ }
        const out = {};
        for (const [verb, call] of [['screenshot', (f) => E4.screenshot('da-pop', f)], ['act', (f) => E4.act('da-pop', f, { verb: 'click', at: { x: 5, y: 5 } })], ['snapshot', (f) => E4.snapshot('da-pop', f)]]) {
          let reads = 0;
          const spy = new Proxy(fP, { get(t, k) { if (k === 'sessionId') reads++; return t[k]; } });
          const p = call(spy); const atCall = reads;
          await p.catch(() => { /* the verb's own answer — only WHEN the lease was read is judged here */ });
          out[verb] = atCall;
        }
        return out;
      };
      const SRC = read(ENGINE_REL);
      const PLAIN = "    if (sub == null) { const { rec, lease } = requireLease(handle, facts, verb); return { handle, sub: null, rec, lease }; }";
      const SNAP = "    const { rec, lease } = await subjectDoor(handle, facts, 'snapshot', { subjectVerb: true, tree: true }); // B-dbb4 (r946): the one door — a tree verb on a window's handle is refused; r1486: its lease read at the call, never again after the wait";
      const ACTS = "    const { handle, sub, rec, lease } = door; // r1486: the door's lease read (at the call), never a second read after its wait";
      const n = (x) => SRC.split(x).length - 1;
      ok(n(PLAIN) === 1 && n(SNAP) === 1 && n(ACTS) === 2 && !/await subjectDoor\([^\n]*\n[^\n]*requireLease\(/.test(SRC), 'r1486 PIN: the door reads the lease for the app\'s own handle too, and snapshot / act / screenshot take the door\'s read — no requireLease after its wait', { PLAIN: n(PLAIN), SNAP: n(SNAP), ACTS: n(ACTS) });
      let rel = anchored(SRC, PLAIN, '    if (sub == null) return { handle, sub: null };', 'r1486: the door\'s plain-handle read taken away'); // stale-pins: kept (r1486's RED CONTROL rebuilds 5b4176f46's lines on purpose)
      rel = anchored(rel, SNAP, "    await subjectDoor(handle, facts, 'snapshot', { subjectVerb: true, tree: true }); // B-dbb4 (r946): the one door — a tree verb on a window's handle is refused\n    const { rec, lease } = requireLease(handle, facts, 'snapshot');", 'r1486: snapshot reads after the wait'); // stale-pins: kept (r1486's RED CONTROL rebuilds 5b4176f46's lines on purpose)
      const DESKBACK = "\n    if (rec.origin === 'desktop') return desktopScreenshot(rec, facts);";
      rel = anchored(rel, ACTS + DESKBACK, "    const { handle, sub } = door;\n    const { rec, lease } = requireLease(handle, facts, 'screenshot');" + DESKBACK, 'r1486: screenshot reads after the wait'); // stale-pins: kept (r1486's RED CONTROL rebuilds 5b4176f46's lines on purpose)
      rel = anchored(rel, ACTS, "    const { handle, sub } = door;\n    const { rec, lease } = requireLease(handle, facts, verb || 'act');", 'r1486: act reads after the wait'); // stale-pins: kept (r1486's RED CONTROL rebuilds 5b4176f46's lines on purpose)
      const [nowC, relC] = [await leaseAtCall(ENGINE, 'now'), await leaseAtCall(MUT.load(ENGINE_REL, rel, 'r1486-read-after-wait'), 'release')];
      ok(Object.values(nowC).every((x) => x >= 1), `r1486: snapshot / act / screenshot read the lease AT THE CALL — an act issued before a revoke stands, as in the release (reads at the call: ${JSON.stringify(nowC)})`, nowC);
      ok(Object.values(relC).every((x) => x === 0), `r1486 RED CONTROL: 5b4176f46's code reads it only after the door's wait — a revoke issued right after the call lands first (reads at the call: ${JSON.stringify(relC)})`, relC);
    }
    // THROUGH THE REAL ROUTE AND THE SHIPPED CLI: the header carries a title outside latin-1 (escaped), the CLI prints the words
    const appP = express(); appP.use(express.json()); ROUTES.setup({ engine: EP }); appP.use(ROUTES.router);
    const srvP = await new Promise((res) => { const s0 = appP.listen(0, '127.0.0.1', () => res(s0)); });
    const tmpP = path.join(dir, 'dbb4-tmp'); fs.mkdirSync(tmpP, { recursive: true });
    const cliP = (...a) => new Promise((resolve) => execFile(process.execPath, [path.join(repo, 'data/bin/vibespace-window'), ...a], { cwd: tmpP, env: { PATH: process.env.PATH, HOME: dir, TMPDIR: tmpP, VIBESPACE_API: `http://127.0.0.1:${srvP.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_dbb4' }, encoding: 'utf8', timeout: 20000 }, (e, stdout, stderr) => resolve({ status: e ? e.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
    const c1 = await cliP('screenshot', 'da-pop');
    rowsP = [{ ...pop, x: 650, y: 450 }, helper, main].map((w) => ({ ...w })); // CONTROL: the popup now OVER the main
    const c2 = await cliP('screenshot', 'da-pop');
    const c3 = await cliP('screenshot', 'da-pop.w2'); // unit 2: the window's own handle through the route and the CLI
    srvP.close();
    ok(c1.status === 0 && c1.stdout.includes('this app has 1 more window(s) this image does not show — «Sign in – Google Accounts» 500x600 at -600,-400 of this image') && c1.stdout.includes('its own handle `da-pop.w2`') && c2.status === 0 && !/does not show/.test(c2.stdout),
      'the shipped CLI prints the words under the image line (the title with its en dash through the escaped header); CONTROL: the popup over the main ⇒ in the image, nothing said', { c1: c1.stdout.slice(-400) + c1.stderr.slice(-300), c2: c2.stdout.slice(-300) });
    ok(c3.status === 0 && c3.stdout.includes('this image is ONE window of the app: da-pop.w2 «Sign in – Google Accounts» — --at, keys and typing on this handle go to it') && c2.stdout.includes('2 windows of the app composed in this image'),
      'unit 2 through the route + the CLI: `screenshot da-pop.w2` says it is ONE window of the app (its title back through the escaped header); the app\'s own image counts the windows it composed (CONTROL: the popup over the main ⇒ 2)', { c3: c3.stdout.slice(-300) + c3.stderr.slice(-200), c2: c2.stdout.slice(-200) });
  } catch (e) { ok(false, '§DBB4: the engine / route / CLI legs threw', String((e && e.stack) || e).slice(0, 600)); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
