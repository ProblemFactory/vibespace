#!/usr/bin/env node
// test-vault-login-chrome — lane vault-login-chrome (heavy, run ALONE, D-Bus unset). HOTFIX 2.369.364 (fixups r2): the vault
// login fill on standard Chrome that 2.369.363 shipped is WITHDRAWN — its post-ship acceptance (accept-r1) found the origin gate
// read from the page's own script world, a fallback that put the secret in a Runtime.evaluate string, and the agent's own read
// roads past the mask. On REAL headless Chrome (`chromium` provider — the watch's kernel fact `false`) with a REAL vault holding a
// GRANTED login of the page's own site and its paired two-step entry, `vibespace-browser login` is refused BY NAME before
// anything is read:
//   ① the watch records standard Chrome and the road row reads `standard` (fills: false, withdrawn in 2.369.364); RED control
//     (the vault still EMPTY, on /plain — no form, nothing that could be typed): a watch copy without the road gate reads the
//     tab through the withdrawn reader (Runtime.evaluate on its socket); the real watch on the same tab sends nothing
//   ② every page (/one, /two, /totp, /react, /plain) × the verb's shapes (login · --submit --json · <origin> --user --submit ·
//     --new-user --generate --submit · --generate) ⇒ exit 1 `[login_fill_withdrawn]` (the JSON shape too), the hub's words
//   ③ 0 vault reads (secretGet / secretNames / the use-writer noteUse never called; planFill / noteFill never called; no
//     vault-use or vault-totp-use line), the hub-side reader + writer (src/server/browser-login-fill.js) never called, 0 CDP
//     Input.* / Runtime.evaluate commands on the watch's socket, the pages received nothing, /one's password box is empty, and
//     accept-r1's four eval roads past the old mask (prototype getter · FormData · a listener installed before · delete
//     el.value) read nothing — the fill never happened
//   ④ the zero-leak sweep over every output surface (CLI stdout/stderr, hub logs, dialog trace, browser audit, vault audit)
// fixups r2 item 5: the fixture server closes its open connections (Chrome keeps them alive), so this suite exits with its verdict.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { startLoginPages } from './fixtures/login-pages.mjs';

const HEADLESS_SETTING = (k) => (k === 'browser.noDisplayMode' ? 'headless' : undefined);
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const Kk = require('../src/server/browser-keeper.js');
const Ff = require('../src/browser-facts.js');
const D = require('../src/server/browser-dialogs.js');
const L = require('../src/server/browser-logins.js');
const LF = require('../src/server/browser-login-fill.js');
const BL = require('../src/browser-login.js');
const VE = require('../src/server/vault-engine.js');
const GS = require('../src/server/grants-store.js');
const VT = require('../src/server/vault-totp.js');
const T = require('../src/totp.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000, step = 25) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }

const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && k !== 'DBUS_SESSION_BUS_ADDRESS')
);
const ROOT = scratch('vlogin-chrome');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => { cleanup(); process.exit(130); });

const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null; try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { }
if (!ver) { skip(`no real agent-browser resolves on PATH past the shim (PATH=${BASE_ENV.PATH || ''})`); console.log(`\nALL PASS (${pass}, ${skipped} skipped)`); process.exit(0); }
console.log(`agent-browser: ${REAL_AB} (${ver})`);

const pwOf = (tag) => [tag, crypto.randomBytes(6).toString('hex'), 'Vq', String(crypto.randomInt(10, 99))].join('-');
const encodingsOf = (s) => {
  const b = Buffer.from(String(s), 'utf8');
  return [String(s), b.toString('hex'), b.toString('base64'), b.toString('base64url')];
};
const sweepSurfaces = (surfaces, secrets) => {
  const needles = secrets.flatMap(encodingsOf).filter((x) => x && x.length >= 6);
  const hits = [];
  for (const [name, text] of Object.entries(surfaces)) {
    const str = String(text || '');
    for (const n of needles) if (str.includes(n)) hits.push(`${name} leaked ${n.slice(0, 4)}…`);
  }
  return hits;
};

const MUT = mutantCopies('vlogin-chrome', REPO);
const pages = await startLoginPages();

// The watch's socket, counted: every CDP command the hub sends to Chrome (the agent's own CLI talks to Chrome on its own),
// each TAGGED by its call stack — `login` = sent from the login road (`fillLogin`, src/server/browser-login-fill.js). The watch's
// own work keeps running beside a login (its passkey hook re-armed on every new document, its liveness probes `1`); those are
// not the login's, and the RED copy below proves the tag sees a login-road command when one is sent.
const WSBase = require('ws').WebSocket;
const LOGIN_ROAD = /browser-login-fill\.js|\bfillLogin\b/;
const countingWS = (sent) => class extends WSBase {
  send(data, ...rest) {
    try {
      const m = JSON.parse(String(data));
      if (m && m.method) { const lim = Error.stackTraceLimit; Error.stackTraceLimit = 60; const st = String(new Error().stack || ''); Error.stackTraceLimit = lim; sent.push({ method: m.method, login: LOGIN_ROAD.test(st), text: String(data) }); }
    } catch { }
    return super.send(data, ...rest);
  }
};
const loginRoad = (cmds) => cmds.filter((c) => c.login);
const inputs = (cmds) => cmds.filter((c) => /^Input\./.test(c.method));
const methodsOf = (cmds) => [...new Set(cmds.map((c) => c.method))];

async function world(tag, { Dmod = D } = {}) {
  const W = path.join(ROOT, tag);
  const KH = path.join(W, 'h'), KXD = path.join(W, 'x'), VD = path.join(W, 'vault');
  for (const d of [path.join(KH, '.agent-browser'), KXD, VD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(KH, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox' }), { mode: 0o600 });
  const hostBrowsers = path.join(process.env.HOME || '/root', '.agent-browser', 'browsers');
  const localBrowsers = path.join(KH, '.agent-browser', 'browsers');
  if (fs.existsSync(hostBrowsers) && !fs.existsSync(localBrowsers)) {
    try { fs.symlinkSync(hostBrowsers, localBrowsers); } catch { }
  }
  const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
  const KEY = 'bk-0000f1a1';
  const live = new Set([KEY]);
  const logs = [], traced = [], audited = [];
  const kk = Kk.create({
    dataDir: path.join(W, 'data'), homeDir: KH, env: () => kenv, serverSetting: HEADLESS_SETTING, liveKeys: () => live,
    runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }),
    log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)), error: (l) => logs.push(String(l)) },
    install: false, tickMs: 3600e3,
  });
  const prof = kk.createProfile({ label: 'Login ' + tag }, { owner: { kind: 'instance', id: null } });
  const eng = VE.create({ dataDir: VD, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
  const VPW = ['vault', crypto.randomBytes(4).toString('hex'), 'pass'].join('-');
  await eng.setup(VPW);
  const grants = GS.create({ memory: true });
  const totp = VT.create({ dataDir: VD, vault: eng, log: (l) => logs.push(String(l)) });
  const fy = [];
  const logins = L.create({
    vault: eng, grants: () => grants, totpCode: (n, o) => totp.codeForLogin(n, o),
    forYou: { add: (pid, it) => { fy.push({ pid, it }); return 'fy-' + fy.length; }, resolve() { } },
    log: (l) => logs.push(String(l)),
  });
  const TOKEN = 'vsst_vlogin_' + tag;
  const sessions = new Map([['sess-' + tag, {
    agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', _browserEnv: null,
    name: 'Chat ' + tag, cwd: W, backendSessionId: 'conv-1',
  }]]);
  const cdpSent = [];
  const dialogs = Dmod.create({
    keeper: kk, WebSocketImpl: countingWS(cdpSent),
    log: { warn: (l) => logs.push(String(l)), log: (l) => logs.push(String(l)) },
    leaseCountOf: (pid) => new Set(((kk.list().leases) || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => l.browserKey)).size,
    holdersOf: () => [{ browserKey: KEY, sessionId: 'sess-' + tag }],
    logins,
    conversationOf: () => ({ cid: 'conv-1', name: 'Chat ' + tag }),
  });
  kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
  const origAudit = kk.audit.bind(kk);
  kk.audit = (row) => { audited.push(row); return origAudit(row); };
  const R = require('../src/routes/browser.js');
  R.setup({ keeper: kk, activeSessions: sessions, dialogs, logins, tasksForSession: () => ['tg-1'], traceDialogAct: (act) => traced.push(act) });
  const app = express(); app.use(express.json());
  app.use(R.router);
  const srv = http.createServer(app); const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  await kk.attach({ profileId: prof.id, browserKey: KEY, sessionId: 'sess-' + tag, by: 'user' });
  const PASSWD = path.join(W, 'passwd.cjs');
  fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
  const env = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, VIBESPACE_API: `http://127.0.0.1:${port}`, VIBESPACE_SESSION_TOKEN: TOKEN, VIBESPACE_SESSION_CWD: W };
  const cli = (args, { timeoutMs = 45000 } = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env, cwd: W });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
  const vaultAuditRaw = () => { try { return fs.readFileSync(path.join(VD, VE.AUDIT_FILE), 'utf8'); } catch { return ''; } };
  const vaultAudit = () => vaultAuditRaw().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const close = async () => { dialogs.shutdown(); kk.shutdown(); eng.close(); await new Promise((r) => { srv.close(() => r()); srv.closeAllConnections(); }); };
  return { kk, prof, eng, grants, totp, logins, dialogs, cli, logs, traced, audited, cdpSent, vaultAuditRaw, vaultAudit, close };
}

// a spy that counts the calls of obj[name] (the module objects and the vault engine are plain objects)
const spyOn = (obj, names) => { const n = Object.fromEntries(names.map((k) => [k, 0])); for (const k of names) { const f = obj[k]; obj[k] = function (...a) { n[k]++; return f.apply(this, a); }; } return n; };
const lastJson = (r) => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return null; } };

try {
  ok(!('DBUS_SESSION_BUS_ADDRESS' in BASE_ENV), 'D-Bus session bus address is unset in the heavy suite environment');
  let w;
  try { w = await world('main'); } catch (e) { skip(`the keeper could not launch Chrome here: ${e && e.message}`); w = null; }
  if (w) {
    const SITE = pages.origin;
    const USER = 'alice@example.test';
    const PW = pwOf('chrome-pw');
    const SEED_B32 = T.base32Encode(crypto.randomBytes(20));
    const cliTranscripts = [];
    const run = async (args) => { const r = await w.cli(args); cliTranscripts.push(`${args.join(' ')}\nOUT:${r.out}\nERR:${r.err}`); return r; };
    const lf = spyOn(LF, ['inspectTabLoginForm', 'fillVaultLogin']);

    console.log('① standard Chrome, the road row + RED control (the vault still empty, /plain: nothing that could be typed)');
    {
      let r = await run(['open', `${SITE}/plain`]);
      ok(r.code === 0, 'opened loopback /plain in real Chrome', r);
      ok(w.dialogs.kernelFactOf(w.prof.id) === false, 'the watch probed VibeSpace.getVersion and recorded standard Chrome (kernelFactOf === false)');
      const road = BL.roadVerdict(w.dialogs.kernelFactOf(w.prof.id));
      ok(!road.ok && road.code === 'login_fill_withdrawn' && road.road === 'standard' && road.withdrawnIn === '2.369.364' && BL.ROADS.standard.fills === false, 'the road row for this browser: standard — fills:false, withdrawn in 2.369.364', road);
      const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
      const noGate = dsrc.replace('    if (!road.ok) return road;\n', '    if (false) return road;\n');
      ok(noGate !== dsrc, 'control anchor (the road gate) found in src/server/browser-dialogs.js');
      const Dng = MUT.load('src/server/browser-dialogs.js', noGate, 'nogate');
      const redSent = [];
      const wRed = Dng.create({
        keeper: { cdpEndpointFor: (pid) => w.kk.cdpEndpointFor(pid), onLease: () => () => { } }, WebSocketImpl: countingWS(redSent),
        log: { warn() { }, log() { } }, logins: w.logins, holdersOf: () => [{ browserKey: 'bk-0000f1a1', sessionId: 'sess-main' }],
      });
      await wRed.arm(w.prof.id);
      const i0 = lf.inspectTabLoginForm, s0 = redSent.length;
      const redRes = await wRed.fillLogin({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { origin: SITE });
      const redCalls = redSent.slice(s0);
      wRed.shutdown();
      const redLogin = loginRoad(redCalls);
      ok(!redRes.ok && redRes.code !== 'login_fill_withdrawn' && lf.inspectTabLoginForm > i0 && redLogin.some((c) => c.method === 'Runtime.evaluate') && lf.fillVaultLogin === 0,
        'RED: a watch copy without the road gate READS the standard-Chrome tab through the withdrawn reader — a Runtime.evaluate tagged as the login road\'s on its socket (no form, so nothing typed)', { code: redRes.code, inspect: lf.inspectTabLoginForm - i0, login: methodsOf(redLogin), all: methodsOf(redCalls) });
      const c0 = w.cdpSent.length, i1 = lf.inspectTabLoginForm;
      r = await run(['login']);
      const win = w.cdpSent.slice(c0);
      ok(r.code === 1 && /\[login_fill_withdrawn\]/.test(r.err) && lf.inspectTabLoginForm === i1 && loginRoad(win).length === 0 && inputs(win).length === 0,
        `the real watch on the same tab: [login_fill_withdrawn], the reader never called, 0 commands from the login road and 0 Input.* on its socket (the watch's own beside it: ${win.length} — ${methodsOf(win).join(', ') || 'none'})`, { r, login: loginRoad(win).map((c) => c.method) });
    }

    console.log('② a GRANTED login of the page\'s own site in the vault — every page × every shape refused by name');
    const reads = spyOn(w.eng, ['secretGet', 'secretNames', 'noteUse']);
    const plans = spyOn(w.logins, ['planFill', 'noteFill']);
    const lf0 = { ...lf }, c0 = w.cdpSent.length;
    {
      ok(w.totp.addEntry({ seed: SEED_B32, name: 'google-like' }, { who: 'owner' }).ok, 'the owner sealed a two-step entry in the vault');
      ok(w.logins.addOwn({ origin: SITE, username: USER, password: PW, totpName: 'google-like' }).ok, 'the owner sealed the web login of this site, paired with the two-step entry');
      ok(w.logins.grant(`web-login:${SITE}#${USER}`, 'this-account', 'session:conv-1').ok, 'the owner granted the login to this conversation');
      for (const k of Object.keys(reads)) reads[k] = 0;   // the owner's own seal above is not the agent's road
      pages.clear();
      const SHAPES = [['login'], ['login', '--submit', '--json'], ['login', SITE, '--user', USER, '--submit'], ['login', SITE, '--new-user', 'bob@example.test', '--generate', '--submit'], ['login', '--generate']];
      const PAGES = [['/one', SHAPES], ['/two', SHAPES.slice(0, 2)], ['/totp', SHAPES.slice(0, 2)], ['/react', SHAPES.slice(0, 2)], ['/plain', SHAPES.slice(0, 2)]];
      const bad = []; let n = 0;
      for (const [p, shapes] of PAGES) {
        const o = await run(['open', `${SITE}${p}`]);
        if (o.code !== 0) { bad.push({ p, open: o.err }); continue; }
        for (const args of shapes) {
          const r = await run(args); n++;
          const j = args.includes('--json') ? lastJson(r) : null;
          const named = r.code === 1 && /\[login_fill_withdrawn\]/.test(r.err) && /withdrawn in 2\.369\.364/.test(r.err) && /vibespace-vault request/.test(r.err) && /ask-human/.test(r.err) && /nothing was read from the vault and nothing was typed/.test(r.err);
          const jsonOk = !args.includes('--json') || (j && j.success === false && j.data === null && j.code === 'login_fill_withdrawn');
          if (!named || !jsonOk) bad.push({ p, args, code: r.code, err: r.err.slice(0, 300), j });
        }
      }
      ok(bad.length === 0 && n === 13, `${n} logins on 5 pages (one-step, Google-like identifier, two-step code, controlled, plain) ⇒ each exit 1 [login_fill_withdrawn] with the hub's words; --json says {success:false, code:"login_fill_withdrawn"}`, bad);
    }

    console.log('③ what the refusal did NOT do');
    {
      ok(reads.secretGet === 0 && reads.secretNames === 0 && reads.noteUse === 0, '0 vault reads: secretGet / secretNames never called, the use-writer noteUse never called', reads);
      ok(plans.planFill === 0 && plans.noteFill === 0, 'the logins module was never asked: planFill / noteFill never called', plans);
      const uses = w.vaultAudit().filter((l) => l.event === 'vault-use' || l.event === 'vault-totp-use');
      ok(uses.length === 0, 'no vault-use / vault-totp-use line in the vault audit', uses);
      ok(lf.inspectTabLoginForm === lf0.inspectTabLoginForm && lf.fillVaultLogin === 0, 'the hub-side Chrome reader and writer (src/server/browser-login-fill.js) were never called', lf);
      const sent = w.cdpSent.slice(c0);
      ok(loginRoad(sent).length === 0 && inputs(sent).length === 0, `0 commands from the login road (no Runtime.evaluate of its reader, no Input.*) on the watch's socket across the refusals — the watch's own beside them: ${sent.length} (${methodsOf(sent).join(', ') || 'none'})`, { login: loginRoad(sent).map((c) => c.method), inputs: inputs(sent).map((c) => c.method) });
      ok(sweepSurfaces({ cdp: w.cdpSent.map((c) => c.text).join('\n') }, [PW, SEED_B32]).length === 0 && w.cdpSent.length > 0, `no command the hub sent to Chrome (${w.cdpSent.length} in all) carries the password or the two-step seed, in any encoding`);
      ok(pages.received().length === 0, 'the pages received nothing (no identifier, no password, no code was posted)', pages.received().map((x) => x.path));
      await run(['open', `${SITE}/one`]);
      // accept-r1's capture road: a listener the agent installs BEFORE the login (its own `eval`)
      const cap = await run(['eval', "(() => { window.__vsCap = []; document.addEventListener('input', (e) => { try { window.__vsCap.push(String(e.target.value)); } catch { } }, true); return 'armed'; })()"]);
      await run(['login', '--submit']);
      const gv = await run(['get', 'value', '#p']), gu = await run(['get', 'value', '#u']);
      ok(cap.code === 0 && gv.code === 0 && gv.out.trim() === '' && gu.code === 0 && gu.out.trim() === '', '/one after a refused login --submit: its user and password boxes are empty (nothing was typed)', { cap: cap.out, gv: gv.out, gu: gu.out });
      // accept-r1's four read roads past the 2.369.363 mask, on the agent's own `eval`: after a refused fill there is nothing to
      // read — each answers empty, 0 password occurrences (counts only, never a value)
      const ROADS4 = [
        ['the prototype getter', "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(document.querySelector('#p'))"],
        ['FormData', "String(new FormData(document.querySelector('#f')).get('password') || '')"],
        ['the listener installed before the login', "(window.__vsCap || []).join('')"],
        ['delete el.value', "(() => { const el = document.querySelector('#p'); delete el.value; return el.value; })()"],
      ];
      const roadOut = [];
      for (const [name, expr] of ROADS4) { const r = await run(['eval', expr]); roadOut.push({ name, code: r.code, empty: r.out.trim().replace(/^"(.*)"$/, '$1') === '', pw: (r.out + r.err).split(PW).length - 1 }); }
      ok(roadOut.every((x) => x.code === 0 && x.empty && x.pw === 0), "accept-r1's four eval roads (prototype getter · FormData · a listener installed before · delete el.value) read nothing: the fill never happened", roadOut);
    }

    console.log('④ the zero-leak sweep');
    {
      const surfaces = { cli: cliTranscripts.join('\n'), hubLogs: w.logs.join('\n'), dialogTrace: JSON.stringify(w.traced), browserAudit: JSON.stringify(w.audited), vaultAudit: w.vaultAuditRaw() };
      const hits = sweepSurfaces(surfaces, [PW, SEED_B32]);
      ok(hits.length === 0, '0 occurrences of the password or the two-step seed (raw, hex, base64, base64url) across CLI stdout/stderr, hub logs, dialog trace, browser audit and the vault audit', hits);
      ok(sweepSurfaces({ control: `x${Buffer.from(PW).toString('hex')}x` }, [PW]).length >= 1, 'the sweep itself sees a planted encoding (its control)');
    }

    await w.close();
  }
} finally {
  await pages.close();
  cleanup();
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
