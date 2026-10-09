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
// Fast: in-process, scratch dirs only, no browser, no display.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
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
  return {
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
  ok(same(P.PIN_CHOICES, [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }]) && same(P.PIN_BOUNDS, { minW: 320, maxW: 7680, minH: 240, maxH: 4320 }), 'the menu rows (1920×1080, 1280×720, then Auto) and the bounds');
  ok(!/require\(|import /.test(read(PIN_REL).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'src/desktop-pin.js imports nothing (PURE)');
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
      if (P.pinOf(opts.pin)) rec.pin = P.pinOf(opts.pin); // src/desktop-serve.js launch's stamp
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
}

console.log('④ the keeper + route + window seams (source)');
{
  const ds = read('src/desktop-serve.js'), keeper = read('src/server/desktop-app-keeper.js'), routes = read('src/routes/desktop-apps.js'), wt = read('src/routes/window-targets.js'), win = read('src/lib/desktop-app-window.js'), view = read('src/lib/xpra-view.js');
  ok(/function setPin\(id, pin\) \{\n    const rec = store\.apps\[id\];[\s\S]{0,200}if \(p\) rec\.pin = p; else delete rec\.pin;\n    commit\(\);/.test(ds), 'desktop-serve setPin is the one writer: the fact set or removed, then commit() (saved + broadcast — a restart restores it, every client hears it)');
  ok(/if \(pinOf\(opts\.pin\)\) rec\.pin = pinOf\(opts\.pin\);/.test(ds) && /\.\.\.\(pinOf\(rec\.pin\) \? \{ pin: rec\.pin \} : \{\}\) \}; \/\/ lane e2b: the pin rides the relaunch/.test(ds), 'the launch stamps opts.pin; the relaunch\'s opts carry rec.pin (the real keeper; the heavy suite drives it)');
  ok(/'keep-alive', 'pin', 'relaunch'/.test(ds) && /if \(op === 'pin'\) \{ const v = parsePin\(p\.pin\);/.test(ds) && /acc\(\)\.call\(ro\.hostId, 'pin', \{ id, pin \}\)/.test(keeper), 'the `pin` op (a paired machine\'s window) and the hub keeper\'s setPin routing to it');
  ok(/router\.post\('\/api\/desktop\/apps\/:id\/pin'[\s\S]{0,300}pinVerdict\(\{ record: ctx\.keeper\.get\(req\.params\.id\), who: 'user',/.test(routes), 'the user route (the window menu) judges who: \'user\' — any window');
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
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 7, label: 'desktop-pin' })) ok(x.pass, x.name, x.detail);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
