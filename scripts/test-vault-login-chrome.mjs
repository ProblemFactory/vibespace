#!/usr/bin/env node
// test-vault-login-chrome — lane vault-login-chrome r3 (heavy, run ALONE, D-Bus unset):
// On standard Chrome (`chromium` provider, `w.kernel === false`), `vibespace-browser login [<origin>] [--user <name>] [--submit]`
// inspects the tab's form in an isolated world (`Page.createIsolatedWorld`, `grantUniveralAccess: false`) cross-checked against
// browser-truth URLs (`Page.getFrameTree` + `Target.getTargetInfo` + hub-tracked `e.url`), types secret values ONLY via CDP
// `Input.insertText` (0 secret bytes in `Runtime.evaluate`, no `.value` getter mask so site JS reads the real typed value), and
// enforces the two-layer R4 defense (`login_fill_live` read/script/capture fence before cross-document navigation + value-based
// output scrubbing across CLI audit and `cdp-mediator`):
//   ① RED baseline control (6428c67e's `!loginSinks(w)` guard) answers `login_no_form` on `/one`; `/plain` answers `login_no_form`.
//   ② One-step form (`/one`) + R4 two-layer defense: ungranted ⇒ `login_not_granted`; pre-fill `input` listener stashes value in
//     `window.__b3`, `window.name` and `console.log`; granted `login` (no `--submit`) fills username + password and refuses
//     `snapshot`, `screenshot`, `get value #p`, `eval`, B1–B4 bypass probes, `console`, `batch+eval`, and mediated raw CDP
//     (`Runtime.evaluate`, `Page.captureScreenshot`, `DOM.getOuterHTML`, `Debugger.enable`) with `[login_fill_live]`; allowed
//     `click` submits real password to `/done/one` → `/welcome`, lifts `liveFill`, and scrubs `window.name` / `console` / mediated
//     CDP WS frames to `[vault:web-login:...]`; `login --submit --json` submits directly.
//   ③ Multi-step form (`/two` → `/two/challenge/pwd` → `/totp`): email step leaves `snapshot` allowed, password step advances to
//     `/totp`, TOTP step computes and submits the exact vault 6-digit TOTP code (`vault-totp-use` `via: 'browser-login'`).
//   ④ Site submit roads & form-less button traps (`/react`, `/vanilla`, `/fd`, `/btn-traps`): site JS receives real password, and
//     Show/Back/`aria-pressed`/Create-account traps are never clicked.
//   ⑤ Browser-truth origin gate (`/spoof` main-world `window.String` override + `/iframe-host` cross-origin iframe) ⇒ `[login_phishing]`.
//   ⑥ Fail-closed `Input.insertText` (`/clear-trap`, `/focus-trap?when=focus`, `/focus-trap?when=input`) ⇒ `[login_failed]`, 0 posts,
//     0 `Debugger.getScriptSource` scripts carrying the secret before or after `HeapProfiler.collectGarbage`.
//   ⑦ Proven signup confirmation (`/signup-check`): HTTP 400 stays `pending`, unsubmitted stays `pending` past 250 ms until clicked,
//     and `?spa=1` (`200` POST + form unmount without navigation) confirms automatically with matching `new-password` pair.
//   ⑧ R4 ZERO-LEAKAGE SWEEP across CLI stdout/stderr, hub logs, dialog trace, browser audit, vault-audit.jsonl, and `data/` files
//     + RED mutant controls.
import fs from 'node:fs';
import os from 'node:os';
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
const WS = require('ws');
const Kk = require('../src/server/browser-keeper.js');
const CM = require('../src/server/cdp-mediator.js');
const Ff = require('../src/browser-facts.js');
const D = require('../src/server/browser-dialogs.js');
const BL = require('../src/browser-login.js');
const L = require('../src/server/browser-logins.js');
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
const SOCK_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-'));
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { } try { endRootedProcesses(SOCK_ROOT); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } try { fs.rmSync(SOCK_ROOT, { recursive: true, force: true }); } catch { } };
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
const sweepSurfaces = (surfaces, secrets, shortTokens = []) => {
  const needles = secrets.flatMap(encodingsOf).filter((x) => x && x.length >= 8);
  const shortRes = shortTokens.filter((x) => x && x.length >= 6).map((tok) => ({
    tok,
    re: new RegExp(`(?<![0-9A-Za-z])${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9A-Za-z])`),
  }));
  const hits = [];
  for (const [name, text] of Object.entries(surfaces)) {
    const str = String(text || '');
    for (const n of needles) if (str.includes(n)) hits.push(`${name} leaked ${n.slice(0, 4)}…`);
    for (const { tok, re } of shortRes) if (re.test(str)) hits.push(`${name} leaked short token ${tok.slice(0, 2)}…`);
  }
  return hits;
};

function walkDataFiles(dir, out = {}) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    if (ent.isSymbolicLink()) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) { walkDataFiles(full, out); continue; }
    if (!ent.isFile()) continue;
    try {
      const st = fs.statSync(full);
      if (st.size > 0 && st.size <= 4 * 1024 * 1024) out[`file:${path.relative(ROOT, full)}`] = fs.readFileSync(full, 'utf8');
    } catch { }
  }
  return out;
}

function openCdpRpc(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WS(wsUrl, { perMessageDeflate: false });
    let id = 0;
    const waits = new Map();
    const events = [];
    ws.on('message', (raw) => {
      const text = String(raw);
      let m; try { m = JSON.parse(text); } catch { return; }
      if (m.id && waits.has(m.id)) { const fn = waits.get(m.id); waits.delete(m.id); fn({ msg: m, raw: text }); }
      else if (m.method) events.push(m);
    });
    ws.once('error', reject);
    ws.once('open', () => resolve({
      ws,
      events,
      call: (method, params = {}, sessionId = undefined) => new Promise((r) => {
        const i = ++id;
        const timer = setTimeout(() => { if (waits.delete(i)) r({ msg: { error: { message: 'timeout' } }, raw: '' }); }, 5000);
        if (timer.unref) timer.unref();
        waits.set(i, (res) => { clearTimeout(timer); r(res); });
        ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
      }),
      close: () => new Promise((r) => {
        if (ws.readyState >= 2) return r();
        ws.once('close', () => r());
        try { ws.close(); } catch { r(); }
      }),
    }));
  });
}

const MUT = mutantCopies('vlogin-chrome', REPO);
const pages = await startLoginPages();
const pages2 = await startLoginPages();

async function world(tag, { Dmod = D } = {}) {
  const W = path.join(ROOT, tag);
  const KH = path.join(W, 'h'), KXD = path.join(SOCK_ROOT, tag.slice(0, 2)), VD = path.join(W, 'vault');
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
  const mediator = CM.create({ log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)) } });
  const kk = Kk.create({
    dataDir: path.join(W, 'data'), homeDir: KH, env: () => kenv, serverSetting: HEADLESS_SETTING, liveKeys: () => live,
    runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }),
    mediator,
    log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)), error: (l) => logs.push(String(l)) },
    install: false, tickMs: 3600e3,
  });
  const prof = kk.createProfile({ label: 'Login ' + tag, sharing: 'instance' }, { owner: { kind: 'instance', id: null } });
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
  const dialogs = Dmod.create({
    keeper: kk,
    log: { warn: (l) => logs.push(String(l)), log: (l) => logs.push(String(l)) },
    forYou: { add: (pid, it) => { fy.push({ pid, it }); return 'fy-' + fy.length; }, resolve() { } },
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
  const close = async () => {
    dialogs.shutdown();
    kk.shutdown();
    await mediator.shutdown();
    eng.close();
    srv.closeIdleConnections?.();
    srv.closeAllConnections?.();
    await new Promise((r) => srv.close(() => r()));
  };
  return { W, KEY, VPW, mediator, kk, prof, eng, grants, totp, logins, fy, dialogs, cli, logs, traced, audited, vaultAuditRaw, vaultAudit, close };
}

try {
  ok(!('DBUS_SESSION_BUS_ADDRESS' in BASE_ENV), 'D-Bus session bus address is unset in the heavy suite environment');
  let w;
  try { w = await world('main'); } catch (e) { skip(`the keeper could not launch Chrome here: ${e && e.message}`); w = null; }
  if (w) {
    const SITE = pages.origin;
    const SITE2 = pages2.origin;
    const allowedUseOrigins = new Set([SITE]);
    const USER = 'alice@example.test';
    const USER2 = 'bob@example.test';
    const PW = pwOf('chrome-pw');
    const PW2 = pwOf('other-pw');
    const SEED_BYTES = crypto.randomBytes(20);
    const SEED_B32 = T.base32Encode(SEED_BYTES);
    const trackedSecrets = [PW, PW2, SEED_B32];
    const trackedShortTokens = [];
    const cliTranscripts = [];
    const run = async (args) => { const r = await w.cli(args); cliTranscripts.push(`${args.join(' ')}\nOUT:${r.out}\nERR:${r.err}`); return r; };
    const upstreamWsUrl = async () => { const ep = await w.kk.cdpEndpointFor(w.prof.id); return typeof ep === 'string' ? ep : (ep && ep.url) || ''; };

    console.log('① RED baseline control (2.369.364 withdrawal) + /plain non-login page');
    {
      const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
      const anchor = 'const road = BL().roadVerdict(w.kernel);';
      const oldD = dsrc.replace(anchor, "const road = !w.kernel ? { ok: false, code: 'login_fill_withdrawn', error: 'withdrawn in 2.369.364' } : BL().roadVerdict(w.kernel);");
      ok(oldD !== dsrc && BL.ROADS.standard.fills === true, 'control anchor found in src/server/browser-dialogs.js and ROADS.standard.fills === true');
      const D364 = MUT.load('src/server/browser-dialogs.js', oldD, 'base364');
      let r = await run(['open', `${SITE}/one`]);
      ok(r.code === 0, 'opened loopback /one in real Chrome', r);
      ok(w.dialogs.kernelFactOf(w.prof.id) === false, 'watch probed VibeSpace.getVersion and recorded standard Chrome (kernelFactOf === false)');
      const wOld = D364.create({
        keeper: { cdpEndpointFor: (pid) => w.kk.cdpEndpointFor(pid), onLease: () => () => { } },
        log: { warn() { }, log() { } }, logins: w.logins, holdersOf: () => [{ browserKey: w.KEY, sessionId: 'sess-main' }],
      });
      await wOld.arm(w.prof.id);
      const redRes = await wOld.fillLogin({ profileId: w.prof.id, browserKey: w.KEY }, { origin: SITE });
      wOld.shutdown();
      ok(!redRes.ok && redRes.code === 'login_fill_withdrawn' && /2\.369\.364/.test(redRes.error), 'RED on 2.369.364: withdrawn standard-Chrome gate refuses login_fill_withdrawn before inspecting the tab', redRes);

      r = await run(['open', `${SITE}/plain`]);
      const rp = await run(['login']);
      ok(r.code === 0 && rp.code === 1 && /\[login_no_form\]/.test(rp.err), 'a non-login page (/plain with a Search input) ⇒ [login_no_form]', rp);
    }

    console.log('② One-step form (/one) + R4 two-layer defense (live_fill fence + mediated CDP fence + post-nav scrubber)');
    {
      const LOGIN_NAME = `web-login:${SITE}#${USER}`;
      ok(w.totp.addEntry({ seed: SEED_B32, name: 'google-like' }, { who: 'owner' }).ok, 'owner sealed a two-step TOTP entry in the vault');
      ok(w.logins.addOwn({ origin: SITE, username: USER, password: PW, totpName: 'google-like' }).ok, 'owner sealed the web login paired with the two-step entry');
      await run(['open', `${SITE}/one`]);
      let r = await run(['login']);
      ok(r.code === 1 && /\[login_not_granted\]/.test(r.err), 'before grant ⇒ exit 1 [login_not_granted]', r);
      ok(w.logins.grant(LOGIN_NAME, 'this-account', 'session:conv-1').ok, 'owner granted the login to this conversation');

      // Plant B3 pre-fill input capture + same-origin localStorage + console.log BEFORE filling (cleaned up before fence lifts)
      const pre = await run(['eval', "window.__b3 = ''; document.querySelector('#p').addEventListener('input', (e) => { window.__b3 = e.target.value; localStorage.setItem('vs_b3', e.target.value); console.log('cstash:' + e.target.value); }); 'armed'"]);
      ok(pre.code === 0, 'pre-fill input listener planted before login fill', pre);

      pages.clear();
      r = await run(['login']);
      ok(r.code === 0 && /Filled the user name and the password/.test(r.out) && /NOT submitted/.test(r.out) && /Step: password\./.test(r.out) && /Receipt vr-[0-9a-f]{12}\./.test(r.out) && pages.received().length === 0,
        'login without --submit fills username + password (Step: password) and does NOT submit the form', r);

      // r5 MAJOR A: 5000-node AX frame scrubs in < 20 ms without blocking the hub's event loop while fence is active
      {
        const { performance } = require('node:perf_hooks');
        const axNodes = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), r: 't', n: i === 4999 ? `lbl:${PW}` : `item-${i}` }));
        const axFrame = JSON.stringify({ id: 501, result: { nodes: axNodes } });
        w.dialogs.scrubCdpFrame(w.prof.id, JSON.stringify({ id: 1, result: { nodes: [] } }));
        const tAx0 = performance.now();
        const axOut = w.dialogs.scrubCdpFrame(w.prof.id, axFrame);
        const axMs = performance.now() - tAx0;
        ok(axMs < 20 && !axOut.includes(PW) && axOut.includes(`[vault:${LOGIN_NAME}]`) && w.dialogs.hasScrubSecrets(w.prof.id) === true,
          `r5 MAJOR A: 5000-node AX frame scrubs in ${axMs.toFixed(2)} ms (< 20 ms) while liveFill is active`, { axMs });
      }

      // Layer 1 (CLI): every reading / scripting / capture / bypass road is refused [login_fill_live] while filled
      const snap = await run(['snapshot']);
      ok(snap.code === 1 && /\[login_fill_live\]/.test(snap.err) && !snap.out.includes(PW) && !snap.err.includes(PW),
        'snapshot while filled secret is live ⇒ exit 1 [login_fill_live]', snap);
      const shotPath = path.join(ROOT, 'main', 'one-filled.png');
      const shot = await run(['screenshot', shotPath]);
      const shotBytes = fs.existsSync(shotPath) ? fs.readFileSync(shotPath) : Buffer.alloc(0);
      ok(shot.code === 1 && /\[login_fill_live\]/.test(shot.err) && !shotBytes.includes(Buffer.from(PW, 'utf8')),
        'screenshot while filled secret is live ⇒ exit 1 [login_fill_live] (0 secret bytes)', { code: shot.code, err: shot.err });
      const gv = await run(['get', 'value', '#p']);
      const evPlain = await run(['eval', 'document.querySelector("#p").value']);
      const evB1 = await run(['eval', "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(document.querySelector('#p'))"]);
      const evB2 = await run(['eval', "new FormData(document.querySelector('#f')).get('password')"]);
      const evB3 = await run(['eval', 'window.__b3']);
      const evB4 = await run(['eval', "(delete document.querySelector('#p').value, document.querySelector('#p').value)"]);
      const conLive = await run(['console']);
      const batLive = await run(['batch', 'click #u', 'eval document.querySelector("#p").value']);
      const waitFnLive = await run(['wait', '--fn', 'document.querySelector("#p").value.length > 0']);
      for (const [label, res] of [
        ['get value #p', gv],
        ['eval el.value', evPlain],
        ['B1 prototype value getter', evB1],
        ['B2 FormData.get', evB2],
        ['B3 pre-fill input listener var', evB3],
        ['B4 delete own getter', evB4],
        ['console', conLive],
        ['batch carrying eval', batLive],
        ['wait --fn <js>', waitFnLive],
      ]) {
        ok(res.code === 1 && /\[login_fill_live\]/.test(res.err) && !res.out.includes(PW) && !res.err.includes(PW),
          `${label} while filled secret is live ⇒ exit 1 [login_fill_live] and 0 secret bytes`, { label, code: res.code, err: res.err });
      }

      // Layer 1 (Mediated raw CDP + RED control on DOMSnapshot.captureSnapshot):
      const upUrl1 = await upstreamWsUrl();
      const rawUp = await openCdpRpc(upUrl1);
      const tList = await rawUp.call('Target.getTargets');
      const pageTarget = ((tList.msg.result && tList.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').startsWith(`${SITE}/one`));
      let rawSnapHasPw = false;
      if (pageTarget) {
        const upAtt = await rawUp.call('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
        const upSid = upAtt.msg.result && upAtt.msg.result.sessionId;
        const upSnap = await rawUp.call('DOMSnapshot.captureSnapshot', { computedStyles: [] }, upSid);
        rawSnapHasPw = Boolean(upSnap && upSnap.raw && upSnap.raw.includes(PW));
        await rawUp.call('Target.detachFromTarget', { sessionId: upSid });
      }
      await rawUp.close();
      ok(!!pageTarget && rawSnapHasPw === true, 'RED control (real Chrome): unmediated DOMSnapshot.captureSnapshot on live-filled tab returns the password in strings');
      const MED_KEY_1 = 'bk-0000f1b1', MED_KEY_2 = 'bk-0000f1b2', MED_KEY_3 = 'bk-0000f1b3';
      const mg = await w.mediator.grantFor({ profileId: w.prof.id, browserKey: MED_KEY_1, upstream: upUrl1, targetIds: [pageTarget.targetId] });
      const medRpc = await openCdpRpc(mg.url);
      const medAtt = await medRpc.call('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
      const medSid = medAtt.msg.result && medAtt.msg.result.sessionId;
      for (const [m, p] of [
        ['Runtime.evaluate', { expression: "document.querySelector('#p').value", returnByValue: true }],
        ['Page.captureScreenshot', {}],
        ['DOM.getOuterHTML', {}],
        ['DOMSnapshot.captureSnapshot', { computedStyles: [] }],
        ['IndexedDB.requestData', { securityOrigin: SITE, databaseName: 'x', objectStoreName: 'y', indexName: '', skipCount: 0, pageSize: 1 }],
        ['IO.read', { handle: '1' }],
        ['Debugger.enable', {}],
        ['FutureDomain.readSecret', {}],
      ]) {
        const mr = await medRpc.call(m, p, medSid);
        ok(!!(mr.msg.error && /login_fill_live/.test(mr.msg.error.message)) && !mr.raw.includes(PW),
          `mediated CDP census fence refuses ${m} with login_fill_live while filled secret is live`, mr.msg);
      }
      await medRpc.close();

      // Layer 2 scrubber (CLI + cdp-mediator WS) on an unfenced second tab WHILE Tab 1's liveFill is active, plus r5 MINOR E check
      const tn2 = await run(['tab', 'new', `${SITE}/plain`]);
      const rawUp2 = await openCdpRpc(upUrl1);
      const tList2 = await rawUp2.call('Target.getTargets');
      const plainTarget = ((tList2.msg.result && tList2.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').startsWith(`${SITE}/plain`));
      let medTab2Ok = false;
      if (plainTarget) {
        const mg2 = await w.mediator.grantFor({ profileId: w.prof.id, browserKey: MED_KEY_2, upstream: upUrl1, targetIds: [plainTarget.targetId] });
        const medRpc2 = await openCdpRpc(mg2.url);
        const att2 = await medRpc2.call('Target.attachToTarget', { targetId: plainTarget.targetId, flatten: true });
        const sid2 = att2.msg.result && att2.msg.result.sessionId;
        const mr2 = await medRpc2.call('Runtime.evaluate', { expression: "'stash:' + (localStorage.getItem('vs_b3') || '')", returnByValue: true }, sid2);
        medTab2Ok = Boolean(!mr2.msg.error && mr2.raw.includes(`[vault:${LOGIN_NAME}]`) && !mr2.raw.includes(PW));
        await medRpc2.close();
      }
      const cliTab2 = await run(['eval', "(() => { const v = localStorage.getItem('vs_b3') || ''; localStorage.removeItem('vs_b3'); return 'stash:' + v; })()"]);
      ok(tn2.code === 0 && cliTab2.code === 0 && cliTab2.out.includes(`[vault:${LOGIN_NAME}]`) && !cliTab2.out.includes(PW) && !cliTab2.err.includes(PW),
        'Layer 2 scrubber (CLI): unfenced second tab eval while Tab 1 fence is live replaces stashed secret with [vault:web-login:...]', cliTab2);
      ok(medTab2Ok,
        'Layer 2 scrubber (cdp-mediator WS): upstream frame on unfenced second tab while Tab 1 fence is live is scrubbed to [vault:web-login:...]');
      const swBack = await run(['tab', pageTarget.targetId]);
      const clPlain = plainTarget ? await run(['tab', 'close', plainTarget.targetId]) : { code: 0 };
      // Also open an opener-less tab while a verb is in flight (`r5 MINOR E` exact shape) and verify Tab 1 stays fenced
      w.dialogs.verbStarted(w.KEY, { profileId: w.prof.id, verb: 'wait' });
      const opLess = await rawUp2.call('Target.createTarget', { url: `${SITE}/plain` });
      await sleep(80);
      w.dialogs.verbEnded(w.KEY, { profileId: w.prof.id });
      const opLessTid = opLess.msg.result && opLess.msg.result.targetId;
      const tab1StillFenced = await run(['eval', 'document.querySelector("#p").value']);
      if (opLessTid) await rawUp2.call('Target.closeTarget', { targetId: opLessTid });
      await rawUp2.close();
      ok(swBack.code === 0 && clPlain.code === 0 && tab1StillFenced.code === 1 && /\[login_fill_live\]/.test(tab1StillFenced.err) && !tab1StillFenced.out.includes(PW) && !tab1StillFenced.err.includes(PW),
        'r5 MINOR E: switching/closing tabs and an opener-less tab appearing mid-verb never unfence live-filled Tab 1', { swCode: swBack.code, clCode: clPlain.code, code: tab1StillFenced.code, err: tab1StillFenced.err });

      // r5 MINOR G: drive REAL agent-browser through cdp-mediator (mg3.url) during live fill (`check`, `select`, `click` succeed; `eval` refused)
      const mg3 = await w.mediator.grantFor({ profileId: w.prof.id, browserKey: MED_KEY_3, upstream: upUrl1, targetIds: [pageTarget.targetId] });
      const medHome = path.join(w.W, 'med-home'), medXdg = path.join(w.W, 'med-xdg');
      fs.mkdirSync(medHome, { recursive: true });
      fs.mkdirSync(medXdg, { recursive: true, mode: 0o700 });
      const medAbEnv = {
        ...BASE_ENV, HOME: medHome, XDG_RUNTIME_DIR: medXdg,
        AGENT_BROWSER_SESSION: 'med-r5', AGENT_BROWSER_NAMESPACE: 'medr5',
        AGENT_BROWSER_CDP: mg3.url, AGENT_BROWSER_IDLE_TIMEOUT_MS: '1500',
      };
      const runMedAb = (verb, args) => new Promise((resolve) => {
        if (verb) w.dialogs.verbStarted(MED_KEY_3, { profileId: w.prof.id, verb });
        const c = spawn(REAL_AB, args, { env: medAbEnv, cwd: w.W });
        let out = '', err = '';
        c.stdout.on('data', (d) => { out += d; });
        c.stderr.on('data', (d) => { err += d; });
        const t = setTimeout(() => c.kill('SIGKILL'), 20000);
        c.on('exit', (code) => {
          clearTimeout(t);
          if (verb) w.dialogs.verbEnded(MED_KEY_3, { profileId: w.prof.id });
          cliTranscripts.push(`med-ab ${args.join(' ')}\nOUT:${out}\nERR:${err}`);
          resolve({ code, out, err });
        });
      });
      const medCheck = await runMedAb('check', ['check', '#rem']);
      const medEval = await runMedAb('eval', ['eval', 'document.querySelector("#p").value']);
      const medSelect = await runMedAb('select', ['select', '#role', 'admin']);
      const clickSub = await runMedAb('click', ['click', 'button[type=submit]']);
      const gotClick = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/welcome\b/.test(u.out); }, 4000);
      ok(medEval.code !== 0 && /login_fill_live/.test(medEval.out + medEval.err) && !medEval.out.includes(PW) && !medEval.err.includes(PW) &&
        medCheck.code === 0 && medSelect.code === 0 && clickSub.code === 0 &&
        gotClick && gotClick.body.username === USER && gotClick.body.password === PW && gotClick.body.remember === 'yes' && gotClick.body.role === 'admin',
        'r5 MINOR G: real agent-browser through cdp-mediator during liveFill refuses `eval` [login_fill_live] and allows `check`, `select`, and `click` (submitting real form to /welcome)',
        { medEvalCode: medEval.code, medCheckCode: medCheck.code, medSelectCode: medSelect.code, clickCode: clickSub.code, gotRole: gotClick && gotClick.body.role, medCheckErr: medCheck.err.slice(0, 180) });

      const snapAfter = await run(['snapshot']);
      ok(snapAfter.code === 0 && /Signed in/.test(snapAfter.out), 'after cross-document navigation to /welcome, snapshot is allowed again', snapAfter.out);
      ok(w.dialogs.hasScrubSecrets(w.prof.id) === true, 'r6 MAJOR A\': profile scrub set stays armed across navigation until browser stop');

      // Direct `login --submit --json` road on /one + r6 MAJOR A' mediated POST-body read & bfcache `back` re-arm
      pages.clear();
      await run(['open', `${SITE}/one`]);
      r = await run(['login', SITE, '--user', USER, '--submit', '--json']);
      const j = (() => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return null; } })();
      const gotOne = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/welcome\b/.test(u.out); }, 4000);
      ok(r.code === 0 && j && j.success && eq(j.data.filled, ['username', 'password']) && j.data.step === 'password' && j.data.submitted === true && /^vr-[0-9a-f]{12}$/.test(j.data.receipt) && gotOne && gotOne.body.username === USER && gotOne.body.password === PW,
        'login --submit --json submits the real username + password to /done/one and returns {filled, step:"password", submitted:true, receipt}', { j, gotOne: gotOne && { user: gotOne.body.username } });

      pages.clear();
      await run(['open', `${SITE}/one?direct=1`]);
      const MED_KEY_4 = 'bk-0000f1b4';
      const mg4 = await w.mediator.grantFor({ profileId: w.prof.id, browserKey: MED_KEY_4, upstream: upUrl1, targetIds: [pageTarget.targetId] });
      const medRpc4 = await openCdpRpc(mg4.url);
      const medAtt4 = await medRpc4.call('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
      const medSid4 = medAtt4.msg.result && medAtt4.msg.result.sessionId;
      await medRpc4.call('Network.enable', { maxPostDataSize: 65536 }, medSid4);
      const rDir = await run(['login', SITE, '--user', USER, '--submit', '--json']);
      await until(() => pages.received().find((x) => x.path === '/done/one-direct'), 4000);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/done\/one-direct\b/.test(u.out); }, 4000);
      const postEv = medRpc4.events.find((ev) => ev.method === 'Network.requestWillBeSent' && String(ev.params?.request?.url || '').endsWith('/done/one-direct') && ev.params?.request?.method === 'POST');
      const postReqId = postEv && postEv.params && postEv.params.requestId;
      const medPostRes = postReqId ? await medRpc4.call('Network.getRequestPostData', { requestId: postReqId }, medSid4) : null;
      const medPostStr = medPostRes ? medPostRes.raw : '';
      ok(Boolean(rDir.code === 0 && postReqId && medPostStr.includes(`[vault:${LOGIN_NAME}]`) && !medPostStr.includes(PW) && !JSON.stringify(postEv).includes(PW)),
        'r6 MAJOR A\' (real Chrome): Network.getRequestPostData on the login POST after navigation is masked by the mediator ([vault:...], 0 secret bytes)',
        { hasReqId: !!postReqId, masked: medPostStr.includes(`[vault:${LOGIN_NAME}]`), err: medPostRes?.msg?.error });

      const rBack = await run(['back']);
      await sleep(120);
      const gvAfterBack = await run(['get', 'value', '#p']);
      const medEvalAfterBack = await medRpc4.call('Runtime.evaluate', { expression: 'document.querySelector("#p") && document.querySelector("#p").value', returnByValue: true }, medSid4);
      await medRpc4.close();
      const rReloadAfterBack = await run(['reload']);
      ok(rBack.code === 0 && gvAfterBack.code === 1 && /\[login_fill_live\]/.test(gvAfterBack.err) &&
        !gvAfterBack.out.includes(PW) && !gvAfterBack.err.includes(PW) &&
        medEvalAfterBack.msg && medEvalAfterBack.msg.error && /login_fill_live/.test(String(medEvalAfterBack.msg.error.message || '')) &&
        !medEvalAfterBack.raw.includes(PW) && rReloadAfterBack.code === 0,
        'r6 MAJOR A\' (real Chrome): `back` restoring /one from bfcache re-arms liveFill (`get value #p` and mediated `Runtime.evaluate` refused [login_fill_live], 0 secret bytes), and `reload` clears it',
        { backCode: rBack.code, gvCode: gvAfterBack.code, medErr: medEvalAfterBack.msg && medEvalAfterBack.msg.error });
    }

    console.log('③ Google-like multi-step form (/two → /two/challenge/pwd → /totp): email step → password step → exact TOTP step');
    {
      pages.clear();
      await run(['open', `${SITE}/two`]);
      // Email-only fill (without --submit) does NOT arm liveFill secret fence because username is public metadata
      const rEmailNoSub = await run(['login']);
      const snapEmail = await run(['snapshot']);
      ok(rEmailNoSub.code === 0 && snapEmail.code === 0, 'step 1 email-only fill leaves snapshot permitted (no secret filled yet)');

      await run(['open', `${SITE}/two`]);
      const r1 = await run(['login', '--submit', '--json']);
      const j1 = (() => { try { return JSON.parse(r1.out.trim().split('\n').pop()); } catch { return null; } })();
      const seenId = await until(() => pages.received().find((x) => x.path === '/seen/two-id'), 4000);
      ok(r1.code === 0 && j1 && j1.success && eq(j1.data.filled, ['username']) && j1.data.step === 'email' && j1.data.submitted === true && seenId && seenId.body.identifier === USER,
        'step 1 (/two): fills ONLY the visible email field (step:"email") and clicks Next', { j1, seenId });

      const r2 = await run(['login', '--submit', '--json']);
      const j2 = (() => { try { return JSON.parse(r2.out.trim().split('\n').pop()); } catch { return null; } })();
      const doneTwo = await until(() => pages.received().find((x) => x.path === '/done/two'), 4000);
      ok(r2.code === 0 && j2 && j2.success && eq(j2.data.filled, ['password']) && j2.data.step === 'password' && j2.data.submitted === true && doneTwo && doneTwo.body.identifier === USER && doneTwo.body.Passwd === PW,
        'step 2 (/two/challenge/pwd): fills ONLY the visible password field (step:"password") and submits to /totp', { j2 });

      await until(async () => { const u = await w.cli(['get', 'url']); return /\/totp\b/.test(u.out); }, 4000);
      const tBefore = Date.now();
      const r3 = await run(['login', '--submit', '--json']);
      const tAfter = Date.now();
      const j3 = (() => { try { return JSON.parse(r3.out.trim().split('\n').pop()); } catch { return null; } })();
      const doneTotp = await until(() => pages.received().find((x) => x.path === '/done/totp'), 4000);
      const gotCode = doneTotp ? String(doneTotp.body.code || '') : '';
      const hmacFn = (alg, key, msg) => crypto.createHmac(String(alg).toLowerCase(), key).update(msg).digest();
      const validCodes = new Set([tBefore - 30000, tBefore, tAfter, tAfter + 30000].map((ts) => T.totp(SEED_BYTES, { now: ts, hmac: hmacFn }).code));
      if (gotCode) trackedShortTokens.push(gotCode);
      ok(r3.code === 0 && j3 && j3.success && eq(j3.data.filled, ['otp']) && j3.data.step === 'totp' && j3.data.submitted === true && validCodes.has(gotCode),
        'step 3 (/totp): computes and submits the exact vault 6-digit TOTP code matching SEED_BYTES', { j3, matchedVaultSeed: validCodes.has(gotCode) });

      const totpUses = w.vaultAudit().filter((l) => l.event === 'vault-totp-use');
      ok(totpUses.length === 1 && totpUses[0].via === 'browser-login' && totpUses[0].ok === true,
        'vault-totp-use audit row recorded once (on the /totp step only) with via:"browser-login"', totpUses);
      const shortCdpFrame = JSON.stringify({ id: Number(gotCode || 123456), params: { timestamp: Number(`357162.${gotCode || '123456'}`), nodeId: Number(gotCode || 123456) } });
      const scrubbedShort = w.dialogs.scrubCdpFrame(w.prof.id, shortCdpFrame);
      ok(scrubbedShort === shortCdpFrame && w.dialogs.scrubText(w.prof.id, `Order #${gotCode} shipped`) === `Order #${gotCode} shipped`,
        'r4 MAJOR 3 (MIN_MASK_BYTES = 8): 6-digit TOTP fill leaves CDP JSON frames and ordinary numbers byte-identical');
    }

    console.log('④ Site submit roads (/react, /vanilla, /fd) + form-less button traps (/btn-traps)');
    {
      for (const [route, donePath, label] of [
        ['/react', '/done/react', 'controlled input (/react, VALUE_TRACKER)'],
        ['/vanilla', '/done/vanilla', 'vanilla JS submit reading pw.value (/vanilla)'],
        ['/fd', '/done/fd', 'FormData(e.target) submit (/fd)'],
      ]) {
        pages.clear();
        await run(['open', `${SITE}${route}`]);
        const r = await run(['login', '--submit', '--json']);
        const j = (() => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return null; } })();
        const rec = await until(() => pages.received().find((x) => x.path === donePath), 4000);
        ok(r.code === 0 && j && j.success && j.data && j.data.submitted === true && rec && rec.body.username === USER && rec.body.password === PW,
          `${label}: submits the real unmasked credentials`, { route, submitted: j && j.data.submitted });
      }

      pages.clear();
      await run(['open', `${SITE}/btn-traps`]);
      const rb = await run(['login', '--submit', '--json']);
      const jb = (() => { try { return JSON.parse(rb.out.trim().split('\n').pop()); } catch { return null; } })();
      const doneBtn = await until(() => pages.received().find((x) => x.path === '/done/btn-traps'), 4000);
      const trapsClicked = pages.received().filter((x) => x.path.startsWith('/trap/'));
      ok(rb.code === 0 && jb && jb.success && jb.data.submitted === true && trapsClicked.length === 0 && doneBtn && doneBtn.body.username === USER && doneBtn.body.password === PW && doneBtn.body.pwType === 'password',
        'form-less /btn-traps skips Back, Show password, aria-pressed toggle, and Create account, clicking Sign in with input type kept as password', { trapsClicked, pwType: doneBtn && doneBtn.body.pwType });
    }

    console.log('⑤ Browser-truth origin gate & anti-phishing (/spoof window.String override + /iframe-host cross-origin iframe)');
    {
      ok(w.logins.addOwn({ origin: SITE2, username: USER2, password: PW2 }).ok, 'owner sealed a second login on SITE2');
      ok(w.logins.grant(`web-login:${SITE2}#${USER2}`, 'this-account', 'session:conv-1').ok, 'owner granted SITE2 login');
      pages.clear(); pages2.clear();
      const usesBefore = w.vaultAudit().filter((l) => l.event === 'vault-use' && String(l.purpose || '').includes(SITE2)).length;

      await run(['open', `${SITE}/spoof?target=${encodeURIComponent(SITE2)}`]);
      const rs = await run(['login', SITE2, '--user', USER2, '--submit']);
      const usesAfterSpoof = w.vaultAudit().filter((l) => l.event === 'vault-use' && String(l.purpose || '').includes(SITE2)).length;
      ok(rs.code === 1 && /\[login_phishing\]/.test(rs.err) && pages.received().length === 0 && usesAfterSpoof === usesBefore,
        'main-world window.String origin forgery (/spoof claiming SITE2) ⇒ exit 1 [login_phishing], 0 posts, 0 vault uses', rs);

      await run(['open', `${SITE}/iframe-host?src=${encodeURIComponent(`${SITE2}/one`)}`]);
      await sleep(300);
      const ri1 = await run(['login']);
      const ri2 = await run(['login', SITE2, '--user', USER2, '--submit']);
      ok(ri1.code === 1 && /\[login_phishing\]/.test(ri1.err) && ri2.code === 1 && /\[login_phishing\]/.test(ri2.err) && pages2.received().length === 0,
        'cross-origin embedded sign-in iframe (/iframe-host embedding SITE2/one) ⇒ exit 1 [login_phishing], 0 posts', { ri1: ri1.err, ri2: ri2.err });

      // Cross-SITE Site-Isolated OOP iframe (`localhost` inside `127.0.0.1`) ⇒ [login_phishing]
      await run(['open', `${SITE}/iframe-host?src=${encodeURIComponent(`http://localhost:${pages2.port}/one`)}`]);
      await sleep(350);
      const rOop = await run(['login']);
      ok(rOop.code === 1 && /\[login_phishing\]/.test(rOop.err) && pages2.received().length === 0,
        'cross-site Site-Isolated OOP iframe (localhost inside 127.0.0.1) ⇒ exit 1 [login_phishing], 0 posts', rOop.err);

      // about:srcdoc and same-origin framed login forms ⇒ honest [login_in_frame] («inside a frame»), never [login_no_form]
      await run(['open', `${SITE}/srcdoc-login`]);
      const rSrcdoc = await run(['login']);
      await run(['open', `${SITE}/iframe-host?src=${encodeURIComponent(`${SITE}/one`)}`]);
      await sleep(250);
      const rSameFrame = await run(['login']);
      ok(rSrcdoc.code === 1 && /\[login_in_frame\]/.test(rSrcdoc.err) && /inside a frame/.test(rSrcdoc.err) && rSameFrame.code === 1 && /\[login_in_frame\]/.test(rSameFrame.err),
        'about:srcdoc and same-origin framed login forms refuse [login_in_frame] ("inside a frame"), never [login_no_form]', { rSrcdoc: rSrcdoc.err, rSameFrame: rSameFrame.err });

      // r5 MAJOR B (real Chrome two-tab frame isolation): Tab 1 has /one top-level form, Tab 2 embeds same-origin newsletter email iframe; switching to Tab 1 and running `login` (no origin) fills & submits Tab 1!
      pages.clear();
      await run(['open', `${SITE}/one`]);
      await run(['tab', 'new', `${SITE}/iframe-host?src=${encodeURIComponent(`${SITE}/embed-email`)}`]);
      await sleep(250);
      const rawUp5 = await openCdpRpc(await upstreamWsUrl());
      const tList5 = await rawUp5.call('Target.getTargets');
      await rawUp5.close();
      const tInfos5 = (tList5.msg.result && tList5.msg.result.targetInfos) || [];
      const t5One = tInfos5.find((t) => t.type === 'page' && String(t.url || '').startsWith(`${SITE}/one`));
      const t5Emb = tInfos5.find((t) => t.type === 'page' && String(t.url || '').includes('/iframe-host'));
      const sw5 = t5One ? await run(['tab', t5One.targetId]) : { code: 1 };
      const rTwoTabB = await run(['login', '--user', USER, '--submit']);
      const gotTwoTabB = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      if (t5Emb) await run(['tab', 'close', t5Emb.targetId]);
      ok(sw5.code === 0 && rTwoTabB.code === 0 && gotTwoTabB && gotTwoTabB.body.username === USER && gotTwoTabB.body.password === PW,
        'r5 MAJOR B (real Chrome two tabs): newsletter email iframe on Tab 2 never shadows or refuses active Tab 1 plain login', { swCode: sw5.code, code: rTwoTabB.code, err: rTwoTabB.err });
    }

    console.log('⑥ Fail-closed Input.insertText & 0 secrets in Debugger.getScriptSource (/clear-trap & /focus-trap)');
    {
      pages.clear();
      await run(['open', `${SITE}/clear-trap`]);
      // Attach diagnostic observer to record every parsed script on this tab before & after fail-closed fills + GC
      const diag = await openCdpRpc(await upstreamWsUrl());
      const tl = await diag.call('Target.getTargets');
      const pt = ((tl.msg.result && tl.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').startsWith(`${SITE}/clear-trap`));
      const att = await diag.call('Target.attachToTarget', { targetId: pt.targetId, flatten: true });
      const dsid = att.msg.result.sessionId;
      const scriptIds = new Set();
      await diag.call('Debugger.enable', {}, dsid);
      for (const ev of diag.events) if (ev.method === 'Debugger.scriptParsed' && ev.params && ev.params.scriptId) scriptIds.add(ev.params.scriptId);

      const rc = await run(['login', SITE, '--user', USER, '--submit']);
      ok(rc.code === 1 && /\[login_failed\]/.test(rc.err) && pages.received().length === 0,
        '/clear-trap (hostile input handler clears password) fails closed [login_failed] with 0 posts', rc);

      await run(['open', `${SITE}/focus-trap?when=focus`]);
      const rf1 = await run(['login', SITE, '--user', USER, '--submit']);
      await run(['open', `${SITE}/focus-trap?when=input`]);
      const rf2 = await run(['login', SITE, '--user', USER, '--submit']);
      ok(rf1.code === 1 && /\[login_failed\]/.test(rf1.err) && rf2.code === 1 && /\[login_failed\]/.test(rf2.err) && pages.received().length === 0,
        '/focus-trap (focus stolen on focus and on input) fails closed [login_failed] with 0 posts', { rf1: rf1.err, rf2: rf2.err });

      for (const ev of diag.events) if (ev.method === 'Debugger.scriptParsed' && ev.params && ev.params.scriptId) scriptIds.add(ev.params.scriptId);
      let preGcHits = 0;
      for (const scId of scriptIds) {
        const sr = await diag.call('Debugger.getScriptSource', { scriptId: scId }, dsid);
        const src = sr.msg.result && sr.msg.result.scriptSource ? String(sr.msg.result.scriptSource) : '';
        if (src.includes(PW)) preGcHits++;
      }
      await diag.call('HeapProfiler.collectGarbage', {}, dsid);
      let postGcHits = 0;
      for (const scId of scriptIds) {
        const sr = await diag.call('Debugger.getScriptSource', { scriptId: scId }, dsid);
        const src = sr.msg.result && sr.msg.result.scriptSource ? String(sr.msg.result.scriptSource) : '';
        if (src.includes(PW)) postGcHits++;
      }
      await diag.call('Debugger.disable', {}, dsid);
      await diag.close();
      ok(scriptIds.size > 0 && preGcHits === 0 && postGcHits === 0,
        `0 Debugger.getScriptSource scripts carry the password across ${scriptIds.size} parsed scripts (before and after GC)`, { parsed: scriptIds.size, preGcHits, postGcHits });

      // Cross-origin iframe stealing focus on a 1 ms timer gets 0 bytes (`inert` iframes during typing window)
      pages.clear(); pages2.clear();
      await run(['open', `${SITE}/one-with-thief?src=${encodeURIComponent(`http://localhost:${pages2.port}/thief-frame`)}`]);
      await sleep(300);
      const rThief = await run(['login', SITE, '--user', USER, '--submit']);
      const doneThief = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      const thiefHits = pages2.received().filter((x) => x.path === '/seen/iframe-thief');
      ok(rThief.code === 0 && doneThief && doneThief.body.password === PW && thiefHits.length === 0,
        'cross-site iframe stealing focus every 1 ms receives 0 characters (iframes marked inert during typing)', { rThiefCode: rThief.code, thiefHits });
    }

    console.log('⑦ Proven signup confirmation (/signup-check: HTTP 400 stays pending, unsubmitted stays pending, 200 nav & SPA unmount confirm)');
    {
      ok(w.logins.grant(`web-login:${SITE}#x`, 'any-account', 'session:conv-1').ok, 'owner granted any-account registration on SITE');
      const readLoginRec = (u) => {
        const g = w.eng.secretGet(`web-login:${SITE}#${u}`);
        if (!g || !g.ok || !g.value) return null;
        const rec = BL.recordOf(g.value.toString('utf8'));
        if (rec && rec.password) trackedSecrets.push(rec.password);
        if (rec && rec.previous && rec.previous.password) trackedSecrets.push(rec.previous.password);
        return rec;
      };

      // 7a. Server rejects signup with HTTP 400 → stays pending (NOT confirmed!)
      pages.clear();
      await run(['open', `${SITE}/signup-check`]);
      const rRej = await run(['login', SITE, '--new-user', 'reject@example.test', '--generate', '--submit']);
      const gotRej = await until(() => pages.received().find((x) => x.path === '/done/signup-check' && x.body.email === 'reject@example.test'), 4000);
      await sleep(250);
      const recRej = readLoginRec('reject@example.test');
      ok(rRej.code === 0 && gotRej && gotRej.body.match === true && recRej && recRej.pending === 'register' && recRej.submittedAt === null,
        'HTTP 400 rejected signup: both new-password fields matched at submit, and entry stays pending (not confirmed)', { pending: recRej && recRej.pending, submittedAt: recRej && recRej.submittedAt });

      // 7b. Unsubmitted signup stays pending past 250 ms (no blind 60 ms timer), then confirms when clicked and accepted (×3 consecutive signups — r10 flake gate)
      pages.clear();
      await run(['open', `${SITE}/signup-check`]);
      const rWait = await run(['login', SITE, '--new-user', 'wait@example.test', '--generate']);
      await sleep(250);
      const recBeforeClick = readLoginRec('wait@example.test');
      ok(rWait.code === 0 && recBeforeClick && recBeforeClick.pending === 'register' && recBeforeClick.submittedAt === null,
        'signup without --submit stays pending after 250 ms (no unconditional 60 ms confirmation timer)', { pending: recBeforeClick && recBeforeClick.pending });
      const clickRepResults = [];
      for (const [idx, waitUser] of ['wait@example.test', 'wait-rep2@example.test', 'wait-rep3@example.test'].entries()) {
        if (idx > 0) {
          await run(['open', `${SITE}/signup-check`]);
          const rf = await run(['login', SITE, '--new-user', waitUser, '--generate']);
          if (rf.code !== 0) { clickRepResults.push({ waitUser, fillCode: rf.code, confirmed: false }); continue; }
        }
        const rClick = await run(['click', 'button[type=submit]']);
        const confirmedNav = await until(() => { const rec = readLoginRec(waitUser); return rec && !rec.pending && rec.submittedAt > 0 ? rec : null; }, 4000);
        const gotWait = pages.received().find((x) => x.path === '/done/signup-check' && x.body.email === waitUser);
        clickRepResults.push({
          waitUser,
          clickCode: rClick.code,
          confirmed: Boolean(confirmedNav),
          pwMatched: Boolean(confirmedNav && gotWait && gotWait.body.password === confirmedNav.password),
        });
      }
      ok(clickRepResults.length === 3 && clickRepResults.every((x) => x.clickCode === 0 && x.confirmed && x.pwMatched),
        'submitting via `click` to 200 + /welcome navigation confirms the pending vault-minted login (×3)', { reps: clickRepResults });

      // 7c. SPA signup (?spa=1: 200 POST + form unmount in-DOM without URL navigation) confirms automatically
      pages.clear();
      await run(['open', `${SITE}/signup-check?spa=1`]);
      const rSpa = await run(['login', SITE, '--new-user', 'spa@example.test', '--generate', '--submit']);
      const confirmedSpa = await until(() => { const rec = readLoginRec('spa@example.test'); return rec && !rec.pending && rec.submittedAt > 0 ? rec : null; }, 4000);
      const gotSpa = pages.received().find((x) => x.path === '/done/signup-check' && x.body.email === 'spa@example.test');
      ok(rSpa.code === 0 && !!confirmedSpa && gotSpa && gotSpa.body.password === confirmedSpa.password && pages.received().filter((x) => x.path === '/done/signup-mismatch').length === 0,
        'SPA signup (?spa=1: 200 POST + form unmount without navigation) confirms automatically with matching password pair', { confirmed: !!confirmedSpa });

      // 7d. Signup without --submit followed by a plain link click (#termsLink → /plain) stays pending (r4 MAJOR 2)
      pages.clear();
      await run(['open', `${SITE}/signup-check`]);
      const rLinkFill = await run(['login', SITE, '--new-user', 'linkonly@example.test', '--generate']);
      const rLinkClick = await run(['click', '#termsLink']);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/plain\b/.test(u.out); }, 4000);
      await sleep(200);
      const recLinkOnly = readLoginRec('linkonly@example.test');
      ok(rLinkFill.code === 0 && rLinkClick.code === 0 && recLinkOnly && recLinkOnly.pending === 'register' && recLinkOnly.submittedAt === null,
        'r4 MAJOR 2: signup without --submit followed by plain link click (#termsLink) stays pending (never false-confirmed)', { pending: recLinkOnly && recLinkOnly.pending, submittedAt: recLinkOnly && recLinkOnly.submittedAt });

      // 7e. 200-JSON-{error} same-doc answer (+ history.pushState) with password inputs still filled never confirms
      pages.clear();
      await run(['open', `${SITE}/signup-check?jsonerr=1`]);
      const rJsonErr = await run(['login', SITE, '--new-user', 'jsonerr@example.test', '--generate', '--submit']);
      await until(() => pages.received().find((x) => x.path === '/done/signup-check' && x.body.email === 'jsonerr@example.test'), 4000);
      await sleep(250);
      const recJsonErr = readLoginRec('jsonerr@example.test');
      ok(rJsonErr.code === 0 && recJsonErr && recJsonErr.pending === 'register' && recJsonErr.submittedAt === null,
        'r4 MAJOR 2: 200-JSON-{ok:false} response (+ pushState) with password inputs still filled stays pending', { pending: recJsonErr && recJsonErr.pending, submittedAt: recJsonErr && recJsonErr.submittedAt });

      // 7f. SPA login (/spa-login: 200 POST + form unmount + pushState) lifts liveFill fence automatically
      pages.clear();
      await run(['open', `${SITE}/spa-login`]);
      const rSpaLogin = await run(['login', SITE, '--user', USER, '--submit']);
      await until(() => pages.received().find((x) => x.path === '/done/spa-login'), 4000);
      const snapSpaOk = await until(async () => { const s = await run(['snapshot']); return s.code === 0 && /Signed in SPA/.test(s.out) ? s : null; }, 4000);
      ok(rSpaLogin.code === 0 && !!snapSpaOk,
        'r4 MINOR 7: SPA login (200 POST + unmounted password input + pushState) lifts liveFill so snapshot succeeds', { code: rSpaLogin.code, lifted: !!snapSpaOk });

      // 7g. r5 MAJOR C (Break 4): 200 {ok:false,error} where site JS clears password + pushState + later cross-doc nav ⇒ stays pending, 0 notices
      pages.clear();
      const fy7g = w.fy.length;
      await run(['open', `${SITE}/signup-check?jsonerr=1&clearerr=1`]);
      const rC1 = await run(['login', SITE, '--new-user', 'jsonerr-clear@example.test', '--generate', '--submit']);
      await until(() => pages.received().find((x) => x.path === '/done/signup-check' && x.body.email === 'jsonerr-clear@example.test'), 4000);
      await sleep(250);
      await run(['open', `${SITE}/plain`]);
      await sleep(200);
      const recC1 = readLoginRec('jsonerr-clear@example.test');
      ok(rC1.code === 0 && recC1 && recC1.pending === 'register' && recC1.submittedAt === null && w.fy.length === fy7g,
        'r5 MAJOR C.1 (real Chrome): 200 {error} that clears password fields + pushState + later navigation stays pending:register (0 notices)',
        { pending: recC1 && recC1.pending, notices: w.fy.length - fy7g });

      // 7h. r5 MAJOR C (Break 5): same-origin email-availability POST 200 (fired by fill's `change` event) + plain link click ⇒ stays pending, 0 notices
      pages.clear();
      const fy7h = w.fy.length;
      await run(['open', `${SITE}/signup-check?emailcheck=1`]);
      const rC2 = await run(['login', SITE, '--new-user', 'emailavail@example.test', '--generate']);
      const gotEmailAvail = await until(() => pages.received().find((x) => x.path === '/seen/email-avail' && x.body.email === 'emailavail@example.test'), 4000);
      const rC2Link = await run(['click', '#termsLink']);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/plain\b/.test(u.out); }, 4000);
      await sleep(200);
      const recC2 = readLoginRec('emailavail@example.test');
      ok(rC2.code === 0 && !!gotEmailAvail && rC2Link.code === 0 && recC2 && recC2.pending === 'register' && w.fy.length === fy7h,
        'r5 MAJOR C.2 (real Chrome): same-origin email-availability POST 200 + plain link click stays pending:register (0 notices)',
        { gotEmailAvail: !!gotEmailAvail, pending: recC2 && recC2.pending, notices: w.fy.length - fy7h });

      // 7i. r5 MAJOR C (required checkbox): --submit blocked by required #tos checkbox (0 signup POSTs) ⇒ submitted:false + later nav stays pending
      pages.clear();
      const fy7i = w.fy.length;
      await run(['open', `${SITE}/signup-check?reqcheck=1`]);
      const rC3 = await run(['login', SITE, '--new-user', 'reqblock@example.test', '--generate', '--submit', '--json']);
      const jC3 = (() => { try { return JSON.parse(rC3.out.trim().split('\n').pop()); } catch { return null; } })();
      const c3Posts = pages.received().filter((x) => x.path === '/done/signup-check');
      await run(['open', `${SITE}/plain`]);
      await sleep(200);
      const recC3 = readLoginRec('reqblock@example.test');
      ok(rC3.code === 0 && jC3 && jC3.success && jC3.data.submitted === false && c3Posts.length === 0 && recC3 && recC3.pending === 'register' && w.fy.length === fy7i,
        'r5 MAJOR C.3 (real Chrome): --submit blocked by required checkbox reports submitted:false (0 POSTs) and stays pending:register on later nav',
        { submitted: jC3 && jC3.data.submitted, posts: c3Posts.length, pending: recC3 && recC3.pending, notices: w.fy.length - fy7i });

      // 7j. r5 MAJOR C (change-password 200 {error} + clear) + pending provenance + second login usedPassword:'pending'
      pages.clear();
      const fy7j = w.fy.length;
      const chgOldPw = pwOf('chg-own');
      trackedSecrets.push(chgOldPw);
      w.logins.addOwn({ origin: SITE, username: 'chgowner@example.test', password: chgOldPw });
      w.logins.grant(`web-login:${SITE}#chgowner@example.test`, 'this-account', 'session:conv-1');
      await run(['open', `${SITE}/change-pw?jsonerr=1`]);
      const rC4 = await run(['login', SITE, '--user', 'chgowner@example.test', '--generate', '--submit']);
      await until(() => pages.received().find((x) => x.path === '/done/change-pw'), 4000);
      await sleep(250);
      const recC4 = readLoginRec('chgowner@example.test');
      const rowC4 = w.logins.list().entries.find((e) => e.name === `web-login:${SITE}#chgowner@example.test`);
      pages.clear();
      await run(['open', `${SITE}/one`]);
      const rC4Second = await run(['login', SITE, '--user', 'chgowner@example.test', '--submit', '--json']);
      const jC4Second = (() => { try { return JSON.parse(rC4Second.out.trim().split('\n').pop()); } catch { return null; } })();
      const gotC4Second = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      ok(rC4.code === 0 && recC4 && recC4.pending === 'change' && recC4.previous && recC4.previous.password === chgOldPw && w.fy.length === fy7j &&
        rowC4 && rowC4.pending === 'change' && rowC4.source === 'owner' &&
        rC4Second.code === 0 && jC4Second && jC4Second.data.usedPassword === 'pending' && gotC4Second && gotC4Second.body.password === recC4.password,
        'r5 MAJOR C.4 + pending change (real Chrome): change-password 200 {error} + cleared fields stays pending:change (source:"owner", 0 notices); second login reports & types pending password',
        { pending: recC4 && recC4.pending, rowSource: rowC4 && rowC4.source, usedPassword: jC4Second && jC4Second.data.usedPassword });

      // 7k. r5 MAJOR C (sendBeacon Ping control): sendBeacon POST + plain link click stays pending, 0 notices
      pages.clear();
      const fy7k = w.fy.length;
      await run(['open', `${SITE}/signup-check?beacon=1`]);
      const rC5 = await run(['login', SITE, '--new-user', 'beacon@example.test', '--generate']);
      const rC5Link = await run(['click', '#termsLink']);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/plain\b/.test(u.out); }, 4000);
      await sleep(200);
      const recC5 = readLoginRec('beacon@example.test');
      ok(rC5.code === 0 && rC5Link.code === 0 && recC5 && recC5.pending === 'register' && w.fy.length === fy7k,
        'r5 MAJOR C.5 (real Chrome): sendBeacon Ping POST + link click stays pending:register (0 notices)',
        { pending: recC5 && recC5.pending, notices: w.fy.length - fy7k });

      // 7l. r6 MAJOR B' (real Chrome): disabled input wiped & counted, while <input type="range"> + <input type="color"> verify empty
      await run(['open', `${SITE}/disable-widgets`]);
      const rB6 = await run(['login', SITE, '--user', USER]);
      const rB6Lock = await run(['click', '#lockBtn']);
      const upUrlB6 = await upstreamWsUrl();
      const rawB6 = await openCdpRpc(upUrlB6);
      const tListB6 = await rawB6.call('Target.getTargets');
      const tgtB6 = ((tListB6.msg.result && tListB6.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').includes('/disable-widgets'));
      let b6WipeRes = null, b6DomCheck = null;
      if (tgtB6) {
        const attB6 = await rawB6.call('Target.attachToTarget', { targetId: tgtB6.targetId, flatten: true });
        const sidB6 = attB6.msg.result && attB6.msg.result.sessionId;
        const lfB6 = w.dialogs.liveFillOnTarget(w.prof.id, tgtB6.targetId);
        const LF = require('../src/server/browser-login-fill.js');
        const fidsB6 = [...(lfB6?.secretFieldIds || []), ...(lfB6?.userFieldIds || [])];
        b6WipeRes = await LF.wipeTabTypedInputs({ call: async (m, p) => (await rawB6.call(m, p, sidB6)).msg, targetId: tgtB6.targetId, fieldIds: fidsB6 });
        const chk = await rawB6.call('Runtime.evaluate', {
          expression: '({ pwDisabled: document.getElementById("p").disabled, pwLen: document.getElementById("p").value.length, rangeVal: document.getElementById("vol").value, colorVal: document.getElementById("tint").value })',
          returnByValue: true,
        }, sidB6);
        b6DomCheck = chk.msg?.result?.result?.value || null;
        await rawB6.call('Target.detachFromTarget', { sessionId: sidB6 });
      }
      await rawB6.close();
      await run(['open', `${SITE}/plain`]);
      ok(rB6.code === 0 && rB6Lock.code === 0 && b6WipeRes && b6WipeRes.ok === true && b6WipeRes.wiped >= 2 && b6WipeRes.verifiedEmpty === true &&
        b6DomCheck && b6DomCheck.pwDisabled === true && b6DomCheck.pwLen === 0 && b6DomCheck.rangeVal === '50',
        'r6 MAJOR B\' (real Chrome): wipeTabTypedInputs clears disabled password input (pwLen 0) and reports verifiedEmpty:true alongside <input type="range"> & <input type="color">',
        { b6WipeRes, b6DomCheck });

      // 7m. r6 MINOR C' (real Chrome): cross-origin form action => submitted:true; hashed SPA => submitted:"unknown"; > 64 KB signup => pendingReason + confirmOwn
      pages2.clear();
      await run(['open', `${SITE}/xform?action=${encodeURIComponent(`${SITE2}/done/xform?back=${encodeURIComponent(`${SITE}/welcome`)}`)}`]);
      const rXform6 = await run(['login', SITE, '--user', USER, '--submit', '--json']);
      const jXform6 = (() => { try { return JSON.parse(rXform6.out.trim().split('\n').pop()); } catch { return null; } })();
      const gotXform6 = await until(() => pages2.received().find((x) => x.path === '/done/xform'), 4000);

      pages.clear();
      await run(['open', `${SITE}/hash-spa`]);
      const rHash6 = await run(['login', SITE, '--user', USER, '--submit']);
      const rHash6JsonPass = await (async () => {
        await run(['open', `${SITE}/hash-spa`]);
        const rr = await run(['login', SITE, '--user', USER, '--submit', '--json']);
        try { return JSON.parse(rr.out.trim().split('\n').pop()); } catch { return null; }
      })();
      const gotHash6 = await until(() => pages.received().find((x) => x.path === '/done/hash-spa'), 4000);

      pages.clear();
      await run(['open', `${SITE}/big-signup`]);
      const rBig6 = await run(['login', SITE, '--new-user', 'big70k@example.test', '--generate', '--submit', '--json']);
      const jBig6 = (() => { try { return JSON.parse(rBig6.out.trim().split('\n').pop()); } catch { return null; } })();
      const recBig6 = readLoginRec('big70k@example.test');
      if (recBig6 && recBig6.password) trackedSecrets.push(recBig6.password);
      await until(() => pages.received().find((x) => x.path === '/done/big-signup'), 4000);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/welcome\b/.test(u.out); }, 4000);
      await sleep(150);
      const rowBig6Before = w.logins.list().entries.find((e) => e.name === `web-login:${SITE}#big70k@example.test`);
      const confBig6 = w.logins.confirmOwn(`web-login:${SITE}#big70k@example.test`, { who: 'owner' });
      const rowBig6After = w.logins.list().entries.find((e) => e.name === `web-login:${SITE}#big70k@example.test`);

      ok(rXform6.code === 0 && jXform6?.data?.submitted === true && gotXform6 && gotXform6.body.password === PW &&
        rHash6.code === 0 && !/NOT submitted|press its button/.test(rHash6.out) &&
        rHash6JsonPass?.data?.submitted === 'unknown' && rHash6JsonPass?.data?.submittedReason === 'the site\'s request did not carry the password in a readable form' && !!gotHash6 &&
        rBig6.code === 0 && jBig6?.data?.submitted === 'unknown' && jBig6?.data?.submittedReason === 'the request body was too large to read' &&
        rowBig6Before && rowBig6Before.pending === 'register' && rowBig6Before.pendingReason === 'the request body was too large to read' &&
        confBig6.ok === true && rowBig6After && rowBig6After.pending === null,
        'r6 MINOR C\' (real Chrome): cross-origin form action => submitted:true; hashed SPA => submitted:"unknown" (no "press its button"); > 64 KB signup => pendingReason "the request body was too large to read" + owner confirmOwn clears pending',
        { xformSub: jXform6?.data?.submitted, hashSub: rHash6JsonPass?.data, bigSub: jBig6?.data, rowBig6Before, rowBig6After });

      // 7n. r6 MINOR D' (real Chrome): owner re-save (`addOwn`) of a pending entry clears `pending` (`source: 'owner'`)
      const d6OwnPw = pwOf('d6-chrome-own');
      trackedSecrets.push(d6OwnPw);
      const saveOwn6 = w.logins.addOwn({ origin: SITE, username: 'beacon@example.test', password: d6OwnPw }, { who: 'owner' });
      w.logins.grant(`web-login:${SITE}#beacon@example.test`, 'this-account', 'session:conv-1');
      const rowD6 = w.logins.list().entries.find((e) => e.name === `web-login:${SITE}#beacon@example.test`);
      pages.clear();
      await run(['open', `${SITE}/one`]);
      const rD6Login = await run(['login', SITE, '--user', 'beacon@example.test', '--submit', '--json']);
      const jD6Login = (() => { try { return JSON.parse(rD6Login.out.trim().split('\n').pop()); } catch { return null; } })();
      const gotD6 = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      ok(saveOwn6.ok === true && rowD6 && rowD6.pending === null && rowD6.source === 'owner' &&
        rD6Login.code === 0 && jD6Login?.data?.usedPassword !== 'pending' && gotD6 && gotD6.body.password === d6OwnPw,
        'r6 MINOR D\' (real Chrome): owner re-save (`addOwn`) clears pending (source:"owner") and subsequent login fills owner password without pending notice',
        { rowD6, usedPassword: jD6Login?.data?.usedPassword });

      // 7o. r7 MAJOR 1 (real Chrome): third-party analytics POST leaves proven submit true (no false origin on row); cross-origin credential write records `origins` fact
      pages.clear();
      pages2.clear();
      await run(['open', `${SITE}/signup-big-err?ok=1&analytics=${encodeURIComponent(`${SITE2}/collect`)}`]);
      const rAn7Ok = await run(['login', SITE, '--new-user', 'an7ok@example.test', '--generate', '--submit', '--json']);
      const jAn7Ok = (() => { try { return JSON.parse(rAn7Ok.out.trim().split('\n').pop()); } catch { return null; } })();
      const recAn7Init = readLoginRec('an7ok@example.test');
      if (recAn7Init && recAn7Init.password) trackedSecrets.push(recAn7Init.password);
      const confirmedAn7 = await until(() => { const rec = readLoginRec('an7ok@example.test'); return rec && !rec.pending ? rec : null; }, 4000);
      const rowAn7Ok = w.logins.list().entries.find((e) => e.name === `web-login:${SITE}#an7ok@example.test`);

      pages2.clear();
      await run(['open', `${SITE}/signup-xcred?api=${encodeURIComponent(`${SITE2}/done/xcred`)}&analytics=${encodeURIComponent(`${SITE2}/collect-x`)}`]);
      const rXcred7 = await run(['login', SITE, '--new-user', 'xcred7@example.test', '--generate', '--submit', '--json']);
      const jXcred7 = (() => { try { return JSON.parse(rXcred7.out.trim().split('\n').pop()); } catch { return null; } })();
      const recXcred7 = readLoginRec('xcred7@example.test');
      if (recXcred7 && recXcred7.password) trackedSecrets.push(recXcred7.password);
      const gotXcred7 = await until(() => pages2.received().find((x) => x.path === '/done/xcred'), 4000);
      const rowXcred7 = w.logins.list().entries.find((e) => e.name === `web-login:${SITE}#xcred7@example.test`);
      ok(rAn7Ok.code === 0 && jAn7Ok?.data?.submitted === true && !jAn7Ok?.data?.submittedReason &&
        Boolean(confirmedAn7) && rowAn7Ok && !rowAn7Ok.pending && !rowAn7Ok.pendingReason && !rowAn7Ok.origins &&
        rXcred7.code === 0 && jXcred7?.data?.submitted === true && !jXcred7?.data?.submittedReason && Boolean(gotXcred7) &&
        rowXcred7 && !rowXcred7.pendingReason && Array.isArray(rowXcred7.origins) && rowXcred7.origins.includes(SITE2),
        'r7 MAJOR 1 (real Chrome): cross-origin analytics POST never poisons proven submit or writes false origin; cross-origin credential write answers submitted:true and records destination in row.origins',
        { anSub: jAn7Ok?.data, rowAn7Ok, xcredSub: jXcred7?.data, rowXcred7 });

      // 7p. r7 MINOR 3 (real Chrome): hidden mirror + re-mounted <input type="text" value=SECRET> wiped & counted with 0 secret bytes in Runtime.evaluate
      await run(['open', `${SITE}/hidden-remount`]);
      const rM3 = await run(['login', SITE, '--user', USER]);
      const rM3Show = await run(['click', '#showBtn']);
      const upUrlM3 = await upstreamWsUrl();
      const rawM3 = await openCdpRpc(upUrlM3);
      const tListM3 = await rawM3.call('Target.getTargets');
      const tgtM3 = ((tListM3.msg.result && tListM3.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').includes('/hidden-remount'));
      let m3WipeRes = null, m3DomCheck = null, m3EvalLeaked = false;
      if (tgtM3) {
        const attM3 = await rawM3.call('Target.attachToTarget', { targetId: tgtM3.targetId, flatten: true });
        const sidM3 = attM3.msg.result && attM3.msg.result.sessionId;
        const lfM3 = w.dialogs.liveFillOnTarget(w.prof.id, tgtM3.targetId);
        const LF = require('../src/server/browser-login-fill.js');
        const fidsM3 = [...(lfM3?.secretFieldIds || []), ...(lfM3?.userFieldIds || [])];
        const m3Exprs = [];
        m3WipeRes = await LF.wipeTabTypedInputs({
          call: async (m, p) => {
            if (m === 'Runtime.evaluate' && p && p.expression) m3Exprs.push(String(p.expression));
            return (await rawM3.call(m, p, sidM3)).msg;
          },
          targetId: tgtM3.targetId,
          fieldIds: fidsM3,
          secretValues: [PW],
        });
        m3EvalLeaked = m3Exprs.some((ex) => ex.includes(PW));
        const chkM3 = await rawM3.call('Runtime.evaluate', {
          expression: '({ hmLen: document.getElementById("hm").value.length, hmAttrLen: (document.getElementById("hm").getAttribute("value") || "").length, t2Len: document.getElementById("t2").value.length, t2AttrLen: (document.getElementById("t2").getAttribute("value") || "").length })',
          returnByValue: true,
        }, sidM3);
        m3DomCheck = chkM3.msg?.result?.result?.value || null;
        await rawM3.call('Target.detachFromTarget', { sessionId: sidM3 });
      }
      await rawM3.close();
      await run(['open', `${SITE}/plain`]);
      ok(rM3.code === 0 && rM3Show.code === 0 && m3WipeRes && m3WipeRes.ok === true && m3WipeRes.wiped >= 3 && m3WipeRes.verifiedEmpty === true &&
        m3EvalLeaked === false && m3DomCheck && m3DomCheck.hmLen === 0 && m3DomCheck.hmAttrLen === 0 && m3DomCheck.t2Len === 0 && m3DomCheck.t2AttrLen === 0,
        'r7 MINOR 3 (real Chrome): wipeTabTypedInputs clears .value and @value on hidden mirror + re-mounted <input type="text" value=SECRET> with 0 secret bytes in Runtime.evaluate',
        { m3WipeRes, m3EvalLeaked, m3DomCheck });

      // 7q. r7 MINOR 6 (real Chrome): GET with Authorization header after submit => 'unknown' (Bearer) or true (Basic carrying password), never "press its button"
      pages.clear();
      await run(['open', `${SITE}/get-auth?mode=bearer`]);
      const rGetBearerTxt = await run(['login', SITE, '--user', USER, '--submit']);
      await run(['open', `${SITE}/get-auth?mode=bearer`]);
      const rGetBearerJson = await run(['login', SITE, '--user', USER, '--submit', '--json']);
      const jGetBearer = (() => { try { return JSON.parse(rGetBearerJson.out.trim().split('\n').pop()); } catch { return null; } })();
      await run(['open', `${SITE}/get-auth?mode=basic`]);
      const rGetBasicJson = await run(['login', SITE, '--user', USER, '--submit', '--json']);
      const jGetBasic = (() => { try { return JSON.parse(rGetBasicJson.out.trim().split('\n').pop()); } catch { return null; } })();
      const gotGetAuth = pages.received().filter((x) => x.path === '/api/hdr' && x.hasAuth);
      ok(rGetBearerTxt.code === 0 && !/NOT submitted|press its button/.test(rGetBearerTxt.out) &&
        jGetBearer?.data?.submitted === 'unknown' && jGetBearer?.data?.submittedReason === 'the site\'s request did not carry the password in a readable form' &&
        jGetBasic?.data?.submitted === true && !jGetBasic?.data?.submittedReason && gotGetAuth.length >= 3,
        'r7 MINOR 6 (real Chrome): GET with Authorization header answers submitted:"unknown" (Bearer, no "press its button") and submitted:true (Basic carrying password)',
        { bearer: jGetBearer?.data, basic: jGetBasic?.data, hdrReqs: gotGetAuth.length });

      // 7r. r7 MINOR 7 + MINOR 5 + MINOR 4 (real Chrome): 70 KB {ok:false,"error":"email taken"} + nav stays pending; confirmOwn on non-pending => login_not_pending; addAgent -> addOwn same password keeps agent-typed
      pages.clear();
      await run(['open', `${SITE}/signup-big-err`]);
      const rErr70k = await run(['login', SITE, '--new-user', 'err70k@example.test', '--generate', '--submit', '--json']);
      const recErr70k = readLoginRec('err70k@example.test');
      if (recErr70k && recErr70k.password) trackedSecrets.push(recErr70k.password);
      await until(() => pages.received().find((x) => x.path === '/done/signup-70k-err'), 4000);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/welcome\b/.test(u.out); }, 4000);
      await sleep(200);
      const rowErr70k = w.logins.list().entries.find((e) => e.name === `web-login:${SITE}#err70k@example.test`);
      const confNonPend = w.logins.confirmOwn(`web-login:${SITE}#${USER}`, { who: 'owner' });
      const ag7Pw = pwOf('r7-ag-same');
      trackedSecrets.push(ag7Pw);
      const addAg7 = w.logins.addAgent({ origin: SITE, username: 'agprov7@example.test', password: ag7Pw }, { owner: 'conv-1', actor: 'Chat One' });
      const addOwnSame7 = w.logins.addOwn({ origin: SITE, username: 'agprov7@example.test', password: ag7Pw }, { who: 'owner' });
      const rowAgProv7 = w.logins.list().entries.find((e) => e.name === `web-login:${SITE}#agprov7@example.test`);
      ok(rErr70k.code === 0 && rowErr70k && rowErr70k.pending === 'register' &&
        confNonPend && confNonPend.ok === false && confNonPend.code === 'login_not_pending' &&
        addAg7.ok === true && addOwnSame7.ok === true && rowAgProv7 && rowAgProv7.source === 'agent-typed',
        'r7 MINOR 7 + 5 + 4 (real Chrome): 70 KB {ok:false,"error":"email taken"} + /welcome nav stays pending:register; confirmOwn on non-pending refuses login_not_pending; addAgent -> addOwn same password preserves agent-typed',
        { rowErr70k, confNonPend, rowAgProv7 });

      // 7s. r8 MAJOR A + B + C + MINOR F + G + H (real Chrome)
      {
        const { performance } = require('node:perf_hooks');
        const LF = require('../src/server/browser-login-fill.js');

        // MAJOR A: srcdoc iframe drafts survive ceiling wipe while secret-holding control in iframe is wiped & counted
        await run(['open', `${SITE}/iframe-draft?secretInFrame=1`]);
        const rMajA = await run(['login', SITE, '--user', USER]);
        const rawA = await openCdpRpc(await upstreamWsUrl());
        const tListA = await rawA.call('Target.getTargets');
        const tgtA = ((tListA.msg.result && tListA.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').includes('/iframe-draft'));
        let wipeA = null, frameCheckA = null;
        if (tgtA) {
          const attA = await rawA.call('Target.attachToTarget', { targetId: tgtA.targetId, flatten: true });
          const sidA = attA.msg.result && attA.msg.result.sessionId;
          const lfA = w.dialogs.liveFillOnTarget(w.prof.id, tgtA.targetId);
          const fidsA = [...(lfA?.secretFieldIds || []), ...(lfA?.userFieldIds || [])];
          wipeA = await LF.wipeTabTypedInputs({
            call: async (m, p) => (await rawA.call(m, p, sidA)).msg,
            targetId: tgtA.targetId,
            fieldIds: fidsA,
            secretValues: [PW],
          });
          const chkA = await rawA.call('Runtime.evaluate', {
            expression: '(() => { const d = document.getElementById("draftFrame").contentDocument; return { ed: d.getElementById("ed").textContent, c: d.getElementById("c").value, ta: d.getElementById("ta").value, fsec: d.getElementById("fsec").value, fsecAttr: d.getElementById("fsec").getAttribute("value") || "" }; })()',
            returnByValue: true,
          }, sidA);
          frameCheckA = chkA.msg?.result?.result?.value || null;
          await rawA.call('Target.detachFromTarget', { sessionId: sidA });
        }
        await rawA.close();
        await run(['open', `${SITE}/plain`]);
        ok(rMajA.code === 0 && wipeA && wipeA.ok === true && wipeA.verifiedEmpty === true && wipeA.wiped >= 3 &&
          frameCheckA && frameCheckA.ed === 'Draft paragraph the person wrote' &&
          frameCheckA.c === 'my half-written comment' && frameCheckA.ta === 'a longer note in a textarea' &&
          frameCheckA.fsec === '' && frameCheckA.fsecAttr === '',
          'r8 MAJOR A (real Chrome): srcdoc editor iframe drafts survive wipeTabTypedInputs intact while secret-holding iframe control is wiped and counted',
          { wipeA, frameCheckA });

        // MAJOR B + MAJOR C: 4 × 16 KB textareas + 3 targets wipes in < 200 ms without erasing textareas; hidden 'x'×20000 + PW is caught & wiped at ceiling and keeps SPA fence live
        const pwEx1 = pwOf('r8-b-ex1'), pwEx2 = pwOf('r8-b-ex2');
        trackedSecrets.push(pwEx1, pwEx2);
        await run(['open', `${SITE}/big-textareas?longHidden=1`]);
        const rMajBC = await run(['login', SITE, '--user', USER]);
        const rawBC = await openCdpRpc(await upstreamWsUrl());
        const tListBC = await rawBC.call('Target.getTargets');
        const tgtBC = ((tListBC.msg.result && tListBC.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').includes('/big-textareas'));
        let wipeBC = null, bcMs = 9999, domCheckBC = null;
        if (tgtBC) {
          const attBC = await rawBC.call('Target.attachToTarget', { targetId: tgtBC.targetId, flatten: true });
          const sidBC = attBC.msg.result && attBC.msg.result.sessionId;
          const lfBC = w.dialogs.liveFillOnTarget(w.prof.id, tgtBC.targetId);
          const fidsBC = [...(lfBC?.secretFieldIds || []), ...(lfBC?.userFieldIds || [])];
          const t0BC = performance.now();
          wipeBC = await LF.wipeTabTypedInputs({
            call: async (m, p) => (await rawBC.call(m, p, sidBC)).msg,
            targetId: tgtBC.targetId,
            fieldIds: fidsBC,
            secretValues: [PW, pwEx1, pwEx2],
          });
          bcMs = performance.now() - t0BC;
          const chkBC = await rawBC.call('Runtime.evaluate', {
            expression: '({ taLens: ["ta1","ta2","ta3","ta4"].map((k) => document.getElementById(k).value.length), hbLen: document.getElementById("hb").value.length, hbAttrLen: (document.getElementById("hb").getAttribute("value") || "").length })',
            returnByValue: true,
          }, sidBC);
          domCheckBC = chkBC.msg?.result?.result?.value || null;
          await rawBC.call('Target.detachFromTarget', { sessionId: sidBC });
        }
        await rawBC.close();

        await run(['open', `${SITE}/big-textareas?longHidden=1`]);
        const rSpaBC = await run(['login', SITE, '--user', USER, '--submit', '--json']);
        await until(() => pages.received().find((x) => x.path === '/done/spa'), 4000);
        await sleep(200);
        const rEvalBC = await run(['eval', '1+1']);
        await run(['open', `${SITE}/plain`]);
        ok(rMajBC.code === 0 && wipeBC && wipeBC.ok === true && wipeBC.verifiedEmpty === true && bcMs < 200 &&
          domCheckBC && Array.isArray(domCheckBC.taLens) && domCheckBC.taLens.every((n) => n === 16384) &&
          domCheckBC.hbLen === 0 && domCheckBC.hbAttrLen === 0 &&
          rSpaBC.code === 0 && rEvalBC.code !== 0 && /login_fill_live/.test(rEvalBC.err || rEvalBC.out),
          `r8 MAJOR B + C (real Chrome): 4×16 KB textareas × 3 targets wipes in ${bcMs.toFixed(1)} ms (< 200 ms) preserving textareas, wipes hidden "x"×20000+secret, and keeps SPA fence live`,
          { bcMs, wipeBC, domCheckBC, evalCode: rEvalBC.code, evalErr: rEvalBC.err });

        // MINOR F(a/b/c) + MINOR G + MINOR H on real Chrome (/exfil-f-g)
        const mkR8Login = (uTag) => {
          const u = `${uTag}@example.test`;
          const p = pwOf(`r8-${uTag}`);
          trackedSecrets.push(p);
          const nm = `web-login:${SITE}#${u}`;
          w.logins.addOwn({ origin: SITE, username: u, password: p });
          w.logins.grant(nm, 'this-account', 'session:conv-1');
          return { u, nm };
        };
        const runExfilMode = async (mode, uTag) => {
          const { u, nm } = mkR8Login(uTag);
          await run(['open', `${SITE}/exfil-f-g?mode=${encodeURIComponent(mode)}&o2=${encodeURIComponent(SITE2)}&o3=${encodeURIComponent(SITE2)}`]);
          const r = await run(['login', SITE, '--user', u, '--submit', '--json']);
          const j = (() => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return null; } })();
          await sleep(180);
          const row = w.logins.list().entries.find((e) => e.name === nm);
          await run(['open', `${SITE}/plain`]);
          return { r, data: j?.data || null, row };
        };
        pages.clear(); pages2.clear();
        const f8a = await runExfilMode('big70k', 'f8a');
        const f8b = await runExfilMode('flood70', 'f8b');
        const f8c = await runExfilMode('beacon', 'f8c');
        const g8 = await runExfilMode('big1m2_an', 'g8');
        const h8 = await runExfilMode('widget_auth', 'h8');
        const gotBeacon = pages2.received().some((x) => x.path === '/done/exfil-beacon');
        ok(f8a.data?.submitted === true && Array.isArray(f8a.row?.origins) && f8a.row.origins.includes(SITE2) &&
          f8b.data?.submitted === true && Array.isArray(f8b.row?.origins) && f8b.row.origins.includes(SITE2) &&
          f8c.data?.submitted === true && gotBeacon && ((Array.isArray(f8c.row?.origins) && f8c.row.origins.includes(SITE2)) || f8c.row?.beaconUnreadable === true) &&
          g8.data?.submitted === 'unknown' && g8.data?.submittedReason === 'the request body was too large to read' &&
          h8.data?.submitted === false && !h8.data?.submittedReason,
          'r8 MINOR F + G + H (real Chrome): 70 KB 3p exfil, 70-POST analytics flood, and sendBeacon record destination (never evicted); 1.15 MB unreadable 3p write + analytics reports unknown/too-large; 3p widget Authorization keeps blocked submit false',
          { f8a: { sub: f8a.data, origins: f8a.row?.origins }, f8b: { sub: f8b.data, origins: f8b.row?.origins }, f8c: { sub: f8c.data, origins: f8c.row?.origins, beaconUnreadable: f8c.row?.beaconUnreadable, gotBeacon }, g8: g8.data, h8: h8.data });
      }

      // 7t. r9 MAJOR 1 + MAJOR 2 + MINOR 3 (real Chrome)
      {
        const LF = require('../src/server/browser-login-fill.js');

        // r9 MAJOR 1: 6-char short password (< 8 B) + <input type="hidden"> mirror + vault lock mid-fence => hidden mirror still wiped & then cleared
        const pw6R9 = ('k' + crypto.randomBytes(3).toString('hex')).slice(0, 6);
        trackedShortTokens.push(pw6R9);
        w.logins.addOwn({ origin: SITE, username: 'short6r9@example.test', password: pw6R9 });
        w.logins.grant(`web-login:${SITE}#short6r9@example.test`, 'this-account', 'session:conv-1');
        await run(['open', `${SITE}/r9-short-lock`]);
        const rShortR9 = await run(['login', SITE, '--user', 'short6r9@example.test']);
        w.eng.lock(); // lock vault WHILE the short-password fence on /r9-short-lock is live!
        const rawR9_1 = await openCdpRpc(await upstreamWsUrl());
        const tListR9_1 = await rawR9_1.call('Target.getTargets');
        const tgtR9_1 = ((tListR9_1.msg.result && tListR9_1.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').includes('/r9-short-lock'));
        let hmLenBefore = -1, wipeR9_1 = null, hmCheckAfter = null, remClearedAfterWipe = false;
        if (tgtR9_1) {
          const att = await rawR9_1.call('Target.attachToTarget', { targetId: tgtR9_1.targetId, flatten: true });
          const sid = att.msg.result && att.msg.result.sessionId;
          const pre = await rawR9_1.call('Runtime.evaluate', { expression: 'document.getElementById("hm").value.length', returnByValue: true }, sid);
          hmLenBefore = pre.msg?.result?.result?.value ?? -1;
          const lf1 = w.dialogs.liveFillOnTarget(w.prof.id, tgtR9_1.targetId);
          const fids1 = [...(lf1?.secretFieldIds || []), ...(lf1?.userFieldIds || [])];
          wipeR9_1 = await LF.wipeTabTypedInputs({
            call: async (m, p) => (await rawR9_1.call(m, p, sid)).msg,
            targetId: tgtR9_1.targetId,
            fieldIds: fids1,
            secretValues: [], // locked vault returns []
          });
          const post = await rawR9_1.call('Runtime.evaluate', {
            expression: '({ hmLen: document.getElementById("hm").value.length, hmAttr: document.getElementById("hm").getAttribute("value") })',
            returnByValue: true,
          }, sid);
          hmCheckAfter = post.msg?.result?.result?.value || null;
          remClearedAfterWipe = LF.hasRememberedSecrets(w.prof.id) === false;
          await rawR9_1.call('Target.detachFromTarget', { sessionId: sid });
        }
        await rawR9_1.close();
        await w.eng.unlock(w.VPW);
        await run(['open', `${SITE}/plain`]);
        ok(rShortR9.code === 0 && hmLenBefore === 6 && wipeR9_1 && wipeR9_1.ok === true && wipeR9_1.verifiedEmpty === true && wipeR9_1.wiped >= 3 &&
          hmCheckAfter && hmCheckAfter.hmLen === 0 && !hmCheckAfter.hmAttr && remClearedAfterWipe === true,
          'r9 MAJOR 1 (real Chrome): vault lock mid-fence retains per-tab target so 6-char hidden mirror is wiped at ceiling (hmLen 6 -> 0) and then cleared',
          { hmLenBefore, wipeR9_1, hmCheckAfter, remClearedAfterWipe });

        // r9 MAJOR 2: 0-byte body-less & disk-File 3p unreadable beacons leave blocked submit false & row clean; same-origin unreadable disk-File beacon => unknown + row flagged until next confirmed login
        const bPwR9 = pwOf('r9-beacon-chrome');
        trackedSecrets.push(bPwR9);
        const bUserR9 = 'beaconr9@example.test';
        const bNameR9 = `web-login:${SITE}#${bUserR9}`;
        w.logins.addOwn({ origin: SITE, username: bUserR9, password: bPwR9 });
        w.logins.grant(bNameR9, 'this-account', 'session:conv-1');
        const dummyBeaconFile = path.join(w.W, 'beacon-dummy.bin');
        fs.writeFileSync(dummyBeaconFile, 'beacon-disk-file-payload');

        const attachBeaconFile = async () => {
          const raw = await openCdpRpc(await upstreamWsUrl());
          try {
            const tl = await raw.call('Target.getTargets');
            const tg = ((tl.msg.result && tl.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').includes('/r9-beacon'));
            if (tg) {
              const att = await raw.call('Target.attachToTarget', { targetId: tg.targetId, flatten: true });
              const sid = att.msg.result && att.msg.result.sessionId;
              await raw.call('DOM.enable', {}, sid);
              const doc = await raw.call('DOM.getDocument', {}, sid);
              const q = await raw.call('DOM.querySelector', { nodeId: doc.msg.result.root.nodeId, selector: '#fb' }, sid);
              await raw.call('DOM.setFileInputFiles', { nodeId: q.msg.result.nodeId, files: [dummyBeaconFile] }, sid);
              await raw.call('Target.detachFromTarget', { sessionId: sid });
            }
          } finally { await raw.close(); }
        };

        pages.clear(); pages2.clear();
        await run(['open', `${SITE}/r9-beacon?mode=empty3p&o2=${encodeURIComponent(SITE2)}`]);
        const rBEmpty = await run(['login', SITE, '--user', bUserR9, '--submit', '--json']);
        const jBEmpty = (() => { try { return JSON.parse(rBEmpty.out.trim().split('\n').pop()); } catch { return null; } })();
        await sleep(150);
        const rowAfterEmpty = w.logins.list().entries.find((e) => e.name === bNameR9);

        await run(['open', `${SITE}/r9-beacon?mode=file3p&o2=${encodeURIComponent(SITE2)}`]);
        await attachBeaconFile();
        const rB3p = await run(['login', SITE, '--user', bUserR9, '--submit', '--json']);
        const jB3p = (() => { try { return JSON.parse(rB3p.out.trim().split('\n').pop()); } catch { return null; } })();
        await sleep(150);
        const rowAfter3p = w.logins.list().entries.find((e) => e.name === bNameR9);

        await run(['open', `${SITE}/r9-beacon?mode=filesame&o2=${encodeURIComponent(SITE2)}`]);
        await attachBeaconFile();
        const rBSame = await run(['login', SITE, '--user', bUserR9, '--submit', '--json']);
        const jBSame = (() => { try { return JSON.parse(rBSame.out.trim().split('\n').pop()); } catch { return null; } })();
        await sleep(150);
        const rowAfterSame = w.logins.list().entries.find((e) => e.name === bNameR9);

        pages.clear();
        await run(['open', `${SITE}/one`]);
        const rBClean = await run(['login', SITE, '--user', bUserR9, '--submit', '--json']);
        const jBClean = (() => { try { return JSON.parse(rBClean.out.trim().split('\n').pop()); } catch { return null; } })();
        await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
        const rowAfterClean = w.logins.list().entries.find((e) => e.name === bNameR9);
        await run(['open', `${SITE}/plain`]);

        ok(jBEmpty?.data?.submitted === false && !jBEmpty?.data?.submittedReason && !rowAfterEmpty?.beaconUnreadable &&
          jB3p?.data?.submitted === false && !jB3p?.data?.submittedReason && !rowAfter3p?.beaconUnreadable &&
          jBSame?.data?.submitted === 'unknown' && jBSame?.data?.submittedReason === 'a beacon could not be read' && rowAfterSame?.beaconUnreadable === true &&
          jBClean?.data?.submitted === true && !rowAfterClean?.beaconUnreadable,
          'r9 MAJOR 2 (real Chrome): 0-byte & 3p unreadable File beacons keep blocked submit false & row clean; same-origin unreadable File beacon reports unknown + beaconUnreadable:true, cleared on next confirmed login',
          { empty: jBEmpty?.data, b3p: jB3p?.data, bSame: jBSame?.data, rowSame: rowAfterSame?.beaconUnreadable, rowClean: rowAfterClean?.beaconUnreadable });

        // r9 MINOR 3: lowercasing username input on real Chrome fills & submits cleanly without field_cleared
        const lcPwR9 = pwOf('r9-lc-user');
        trackedSecrets.push(lcPwR9);
        w.logins.addOwn({ origin: SITE, username: 'Alice.MixedR9@Example.TEST', password: lcPwR9 });
        w.logins.grant(`web-login:${SITE}#alice.mixedr9@example.test`, 'this-account', 'session:conv-1');
        pages.clear();
        await run(['open', `${SITE}/r9-lowercase-user`]);
        const rLcR9 = await run(['login', SITE, '--user', 'Alice.MixedR9@Example.TEST', '--submit', '--json']);
        const jLcR9 = (() => { try { return JSON.parse(rLcR9.out.trim().split('\n').pop()); } catch { return null; } })();
        const gotLcR9 = await until(() => pages.received().find((x) => x.path === '/done/one' && x.body.username === 'alice.mixedr9@example.test'), 4000);
        await run(['open', `${SITE}/plain`]);
        ok(rLcR9.code === 0 && jLcR9?.data?.submitted === true && Boolean(gotLcR9) && gotLcR9.body.password === lcPwR9,
          'r9 MINOR 3 (real Chrome): input handler lowercasing mixed-case email on each keystroke fills & submits cleanly',
          { code: rLcR9.code, sub: jLcR9?.data, gotUser: gotLcR9 && gotLcR9.body.username });
      }

      // 7u. r10 MAJOR + MINOR 1 (real Chrome)
      {
        const LF = require('../src/server/browser-login-fill.js');

        // r10 MAJOR: Road B (superseded isolated-world context on the same tab across document reload) releases old context immediately, and Road A (socket drop down() + url-changed re-arm + vault lock) leaves 0 remembered secrets
        await run(['open', `${SITE}/one?r10=1`]);
        const rMaj10_1 = await run(['login', SITE, '--user', USER]);
        const findOneTarget = () => {
          const wt = w.dialogs._watches.get(w.prof.id);
          if (!wt) return null;
          for (const e of wt.targets.values()) {
            if (e && e.liveFill && String(e.url || '').includes('/one')) return e;
          }
          return null;
        };
        const tEntry1 = findOneTarget();
        const oneTid = tEntry1 ? tEntry1.targetId : '';
        const ctx1 = Number(tEntry1?.liveFill?.isoContextId) || 0;
        const ctx1Remembered = ctx1 > 0 && LF.hasRememberedContext(ctx1) === true;

        // Drop watch socket (down()), navigate same tab to /one?r10=2 so Chrome mints a new isolated-world context on the next login
        w.dialogs._watches.get(w.prof.id)?.ws?.close();
        await until(() => !w.dialogs._watches.has(w.prof.id), 1500);
        const rawMaj10 = await openCdpRpc(await upstreamWsUrl());
        try {
          if (oneTid) {
            const att = await rawMaj10.call('Target.attachToTarget', { targetId: oneTid, flatten: true });
            const sid = att.msg.result && att.msg.result.sessionId;
            await rawMaj10.call('Runtime.evaluate', { expression: `location.href = ${JSON.stringify(`${SITE}/one?r10=2`)}` }, sid);
            await sleep(180);
            await rawMaj10.call('Target.detachFromTarget', { sessionId: sid });
          }
        } finally {
          await rawMaj10.close();
        }
        const rMaj10_2 = await run(['login', SITE, '--user', USER]);
        const ctx2 = Number(findOneTarget()?.liveFill?.isoContextId) || 0;
        const oldCtxReleased = ctx1Remembered && ctx2 > ctx1 && LF.hasRememberedContext(ctx1) === false && LF.hasRememberedContext(ctx2) === true;

        // Road A: drop watch socket (down()), navigate tab away to /plain while unwatched, re-arm (url-changed), then lock vault -> 0 remembered secrets
        w.dialogs._watches.get(w.prof.id)?.ws?.close();
        await until(() => !w.dialogs._watches.has(w.prof.id), 1500);
        const rawMaj10b = await openCdpRpc(await upstreamWsUrl());
        try {
          if (oneTid) {
            const att = await rawMaj10b.call('Target.attachToTarget', { targetId: oneTid, flatten: true });
            const sid = att.msg.result && att.msg.result.sessionId;
            await rawMaj10b.call('Runtime.evaluate', { expression: `location.href = ${JSON.stringify(`${SITE}/plain`)}` }, sid);
            await sleep(180);
            await rawMaj10b.call('Target.detachFromTarget', { sessionId: sid });
          }
        } finally {
          await rawMaj10b.close();
        }
        await w.dialogs.arm(w.prof.id, { budgetMs: 3000 });
        w.eng.lock();
        const remAfterLock = LF.hasRememberedSecrets(w.prof.id) || LF.hasRememberedContext(ctx2);
        await w.eng.unlock(w.VPW);
        ok(rMaj10_1.code === 0 && rMaj10_2.code === 0 && oldCtxReleased && remAfterLock === false,
          'r10 MAJOR (real Chrome): second login on same tab releases superseded isolated-world context immediately, and socket-drop + url-changed + vault lock clears all remembered secrets',
          { c1: rMaj10_1.code, c2: rMaj10_2.code, ctx1, ctx2, oldCtxReleased, remAfterLock });

        // r10 MINOR 1: OTP-only fence on /totp with vault locked wipes #totpPin at ceiling and lifts with 0 false notices
        const otpSeedR10 = crypto.randomBytes(20);
        const otpSeedB32R10 = T.base32Encode(otpSeedR10);
        const otpPwR10 = pwOf('r10-otp-chrome');
        trackedSecrets.push(otpSeedB32R10, otpPwR10);
        w.totp.addEntry({ seed: otpSeedB32R10, name: 'totp-r10' }, { who: 'owner' });
        w.logins.addOwn({ origin: SITE, username: 'otpr10@example.test', password: otpPwR10, totpName: 'totp-r10' });
        w.logins.grant(`web-login:${SITE}#otpr10@example.test`, 'this-account', 'session:conv-1');

        const fyBeforeOtp10 = w.fy.length;
        await run(['open', `${SITE}/totp`]);
        const rOtpFill10 = await run(['login', SITE, '--user', 'otpr10@example.test']);
        const snapHeld10 = await run(['snapshot']);
        const otpFenceHeldBefore = snapHeld10.code === 1 && /\[login_fill_live\]/.test(snapHeld10.err);
        let otpDomLenBefore = -1, otpFenceLifted = false, otpDomLenAfter = -1, snapAfter10 = null;
        try {
          const rawOtp = await openCdpRpc(await upstreamWsUrl());
          try {
            const tl = await rawOtp.call('Target.getTargets');
            const tg = ((tl.msg.result && tl.msg.result.targetInfos) || []).find((t) => t.type === 'page' && String(t.url || '').includes('/totp'));
            const sid = tg ? (await rawOtp.call('Target.attachToTarget', { targetId: tg.targetId, flatten: true })).msg?.result?.sessionId : null;
            if (sid) {
              const ev0 = await rawOtp.call('Runtime.evaluate', { expression: 'document.getElementById("totpPin").value.length', returnByValue: true }, sid);
              otpDomLenBefore = ev0.msg?.result?.result?.value ?? -1;
            }
            const wtOtp = w.dialogs._watches.get(w.prof.id);
            for (const e of (wtOtp ? wtOtp.targets.values() : [])) {
              if (e && e.liveFill && String(e.url || '').includes('/totp')) e.liveFill.at = Date.now() - (10 * 60 * 1000 + 1000);
            }
            w.eng.lock();
            otpFenceLifted = Boolean(await until(() => w.dialogs.liveFillVerdictFor({ profileId: w.prof.id, browserKey: w.KEY }, { verb: 'snapshot' }).ok === true, 2000));
            if (sid) {
              const ev1 = await rawOtp.call('Runtime.evaluate', { expression: 'document.getElementById("totpPin").value.length', returnByValue: true }, sid);
              otpDomLenAfter = ev1.msg?.result?.result?.value ?? -1;
              await rawOtp.call('Target.detachFromTarget', { sessionId: sid });
            }
          } finally {
            await rawOtp.close();
          }
          snapAfter10 = await run(['snapshot']);
        } finally {
          await w.eng.unlock(w.VPW);
          await run(['open', `${SITE}/plain`]);
        }
        const otpNoticesCount = w.fy.length - fyBeforeOtp10;
        ok(Boolean(rOtpFill10.code === 0 && otpFenceHeldBefore === true && otpDomLenBefore === 6 && otpFenceLifted === true && otpDomLenAfter === 0 && snapAfter10 && snapAfter10.code === 0 && otpNoticesCount === 0),
          'r10 MINOR 1 (real Chrome): OTP-only fence on /totp with vault locked wipes #totpPin at ceiling and lifts cleanly with 0 false notices',
          { fillCode: rOtpFill10.code, otpFenceHeldBefore, otpDomLenBefore, otpFenceLifted, otpDomLenAfter, snapAfterCode: snapAfter10 && snapAfter10.code, notices: otpNoticesCount });
      }

      // 7v. r11 F1/F2/F3 + F-D (real Chrome: streaming POST + Bearer SSE while fenced, 20 MiB chunked + gzipped-small watch stays open, preReadBodies 0 after fence, colliding executionContextId = 2 across two tabs)
      {
        const zlib = require('zlib');
        const LF = require('../src/server/browser-login-fill.js');
        const gz20M = zlib.gzipSync(Buffer.alloc(20 * 1048576, 0x41));
        const oneMb = Buffer.alloc(1048576, 0x61);
        let streamRes = null, streamEnded = false, sawChunkWhileStreamOpen = false;
        let sseOpen = false, sawSseWhileOpen = false;
        let streamCredReqCount = 0;
        const r11Srv = http.createServer((req, res) => {
          const u = new URL(req.url || '/', 'http://127.0.0.1');
          if (u.pathname === '/login') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<!doctype html><form action="/auth" method="post"><input id="u" name="email" type="email" autocomplete="username"><input id="p" name="password" type="password" autocomplete="current-password"><button id="go" type="submit">Sign in</button></form>');
            return;
          }
          if (u.pathname === '/signup-stream') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(`<!doctype html><form id="f" action="/api/reg-stream" method="post"><input id="u" name="email" type="email" autocomplete="username"><input id="p" name="password" type="password" autocomplete="new-password"><button id="go" type="submit">Create account</button></form><script>document.getElementById('f').addEventListener('submit',async(ev)=>{ev.preventDefault();const uEl=document.getElementById('u'),pEl=document.getElementById('p');const body=JSON.stringify({email:uEl.value,password:pEl.value});uEl.value='';pEl.value='';const r=await fetch('/api/reg-stream'+location.search,{method:'POST',headers:{'Content-Type':'application/json'},body});await r.text();});</script>`);
            return;
          }
          if (u.pathname === '/api/reg-stream') {
            streamCredReqCount++;
            req.resume();
            const enc = u.searchParams.get('enc') || 'chunked';
            const verdict = u.searchParams.get('verdict') || 'reject';
            const [part1, part2] = verdict === 'accept'
              ? ['{"ok":true,', '"user":"accepted"}']
              : ['{"errors":[{"mes', 'sage":"Invalid credentials"}]}'];
            if (enc === 'gzip') {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Transfer-Encoding': 'chunked', 'Cache-Control': 'no-store' });
              res.flushHeaders?.();
              const gz = zlib.createGzip();
              gz.pipe(res);
              gz.write(part1);
              gz.flush(zlib.constants.Z_SYNC_FLUSH, () => {
                setTimeout(() => { try { gz.end(part2); } catch {} }, 20);
              });
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked', 'Cache-Control': 'no-store' });
              res.flushHeaders?.();
              res.write(part1);
              setTimeout(() => { try { res.end(part2); } catch {} }, 20);
            }
            return;
          }
          if (u.pathname === '/plain') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<!doctype html><h1>Plain</h1>');
            return;
          }
          if (u.pathname === '/stream') {
            streamEnded = false;
            streamRes = res;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
            res.flushHeaders?.();
            res.write('chunk-0\n');
            const safety = setTimeout(() => { streamEnded = true; try { res.end('timeout\n'); } catch {} }, 2500);
            if (safety.unref) safety.unref();
            res.on('close', () => clearTimeout(safety));
            return;
          }
          if (u.pathname === '/stream-seen') {
            if (streamRes && !streamEnded) {
              sawChunkWhileStreamOpen = true;
              streamEnded = true;
              try { streamRes.end('chunk-1\n'); } catch {}
            }
            res.writeHead(204);
            res.end();
            return;
          }
          if (u.pathname === '/sse') {
            sseOpen = true;
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            res.flushHeaders?.();
            res.write('data: ping-r11\n\n');
            res.on('close', () => { sseOpen = false; });
            return;
          }
          if (u.pathname === '/sse-seen') {
            if (sseOpen) sawSseWhileOpen = true;
            res.writeHead(204);
            res.end();
            return;
          }
          if (u.pathname === '/chunk20') {
            req.resume();
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Transfer-Encoding': 'chunked' });
            let sent = 0;
            const pump = () => {
              while (sent < 20) {
                sent++;
                if (!res.write(oneMb)) { res.once('drain', pump); return; }
              }
              res.end();
            };
            pump();
            return;
          }
          if (u.pathname === '/gzip20') {
            req.resume();
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'gzip', 'Content-Length': String(gz20M.length) });
            res.end(gz20M);
            return;
          }
          req.resume();
          const body = '{"ok":true}';
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) });
          res.end(body);
        });
        const r11Port = await freePort();
        await new Promise((r) => r11Srv.listen(r11Port, '127.0.0.1', r));
        const r11Origin = `http://127.0.0.1:${r11Port}`;
        const r11OriginB = `http://localhost:${r11Port}`;
        allowedUseOrigins.add(r11Origin);
        allowedUseOrigins.add(r11OriginB);
        const pwR11A = pwOf('r11a-chrome');
        const pwR11B = pwOf('r11b-chrome');
        trackedSecrets.push(pwR11A, pwR11B);
        w.logins.addOwn({ origin: r11Origin, username: 'r11a@example.test', password: pwR11A });
        w.logins.addOwn({ origin: r11OriginB, username: 'r11b@example.test', password: pwR11B });
        w.logins.grant(`web-login:${r11Origin}#r11a@example.test`, 'this-account', 'session:conv-1');
        w.logins.grant(`web-login:${r11Origin}#r11a@example.test`, 'any-account', 'session:conv-1');
        w.logins.grant(`web-login:${r11OriginB}#r11b@example.test`, 'this-account', 'session:conv-1');

        try {
          let pageProbe = null, ctxA = 0, ctxB = 0, bClearedOnLock = false, aKeptOnLock = false, preReadAfterEnd = -1;
          let tidA = '', tidB = '', origTid = '';
          let rFillR11A = { code: 1 }, rFillB = { code: 1 };
          const rawR11 = await openCdpRpc(await upstreamWsUrl());
          try {
            const origTargets = ((await rawR11.call('Target.getTargets')).msg?.result?.targetInfos || []).filter((t) => t.type === 'page');
            origTid = String(origTargets[0]?.targetId || '');

            // Two fresh tabs via `tab new` across cross-site origins on the same browser profile => Site Isolation gives both ctxId === 2
            await run(['tab', 'new', `${r11Origin}/login?tab=a`]);
            await sleep(150);
            rFillR11A = await run(['login', r11Origin, '--user', 'r11a@example.test']);
            const wt11 = w.dialogs._watches.get(w.prof.id);
            let eTabA = null;
            for (const e of (wt11 ? wt11.targets.values() : [])) {
              if (e && e.liveFill && String(e.url || '').includes('?tab=a')) { eTabA = e; break; }
            }
            tidA = eTabA ? eTabA.targetId : '';
            ctxA = Number(eTabA?.liveFill?.isoContextId) || 0;

            if (tidA) {
              const attA = await rawR11.call('Target.attachToTarget', { targetId: tidA, flatten: true });
              const sidA = attA.msg?.result?.sessionId;
              const expr = `(async () => {
                const sr = await fetch('/stream', { method: 'POST', body: 's=1' });
                const rdr = sr.body.getReader();
                const c0 = await rdr.read();
                const firstText = new TextDecoder().decode(c0.value || new Uint8Array());
                await fetch('/stream-seen', { method: 'POST' });
                while (!(await rdr.read()).done) {}

                const ac = new AbortController();
                const er = await fetch('/sse', { headers: { Authorization: 'Bearer tok-r11' }, signal: ac.signal });
                const erdr = er.body.getReader();
                const e0 = await erdr.read();
                const sseText = new TextDecoder().decode(e0.value || new Uint8Array());
                await fetch('/sse-seen', { method: 'POST' });
                ac.abort();

                const bChunk = (await (await fetch('/chunk20', { method: 'POST', body: 'c=1' })).arrayBuffer()).byteLength;
                const bGzip = (await (await fetch('/gzip20', { method: 'POST', body: 'g=1' })).arrayBuffer()).byteLength;
                return { firstText: firstText.trim(), sseOk: sseText.includes('ping-r11'), bChunk, bGzip };
              })()`;
              const evRes = await rawR11.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sidA);
              pageProbe = evRes.msg?.result?.result?.value || null;
              await rawR11.call('Target.detachFromTarget', { sessionId: sidA });
            }
            const watchOpenAfterBig = w.dialogs._watches.get(w.prof.id)?.state === 'open';
            const fenceAliveAfterBig = Boolean(w.dialogs._watches.get(w.prof.id)?.targets.get(tidA)?.liveFill);

            await run(['tab', 'new', `${r11OriginB}/login?tab=b`]);
            await sleep(150);
            rFillB = await run(['login', r11OriginB, '--user', 'r11b@example.test']);
            let eTabB = null;
            for (const e of (wt11 ? wt11.targets.values() : [])) {
              if (e && e.liveFill && String(e.url || '').includes('?tab=b')) { eTabB = e; break; }
            }
            tidB = eTabB ? eTabB.targetId : '';
            ctxB = Number(eTabB?.liveFill?.isoContextId) || 0;
            if (eTabB && eTabB.liveFillTimer) { clearTimeout(eTabB.liveFillTimer); eTabB.liveFillTimer = null; }
            if (eTabB) eTabB.liveFill = null; // Tab B has no fence-end clear road -> lock must clear Tab B despite colliding ctxId!
            w.eng.lock();
            bClearedOnLock = !LF.valuesForTarget(tidB, ctxB).includes(pwR11B) && !LF.valuesForTarget(tidA, ctxA).includes(pwR11B);
            aKeptOnLock = LF.valuesForTarget(tidA, ctxA).includes(pwR11A);
            await w.eng.unlock(w.VPW);
            if (tidB) await run(['tab', 'close', tidB]);
            if (tidA) {
              await run(['tab', tidA]);
              await run(['open', `${r11Origin}/plain`]);
              preReadAfterEnd = eTabA?.authNet?.preReadBodies?.size ?? 0;
            }
            if (origTid) await run(['tab', origTid]);
            if (tidA) await run(['tab', 'close', tidA]);

            ok(Boolean(
              rFillR11A.code === 0 && rFillB.code === 0 &&
              pageProbe && pageProbe.firstText === 'chunk-0' && sawChunkWhileStreamOpen === true &&
              pageProbe.sseOk === true && sawSseWhileOpen === true &&
              pageProbe.bChunk === 20 * 1048576 && pageProbe.bGzip === 20 * 1048576 &&
              watchOpenAfterBig === true && fenceAliveAfterBig === true &&
              ctxA > 0 && ctxB === ctxA && bClearedOnLock === true && aKeptOnLock === true &&
              preReadAfterEnd === 0
            ), 'r11 F1/F2/F3 + F-D (real Chrome): streaming POST + Bearer SSE deliver while open during fence, 20 MiB chunked + gzipped-small keep watch open, preReadBodies clears to 0, and colliding executionContextId across two tabs isolates & clears unfenced tab on lock', {
              fillA: rFillR11A.code, fillB: rFillB.code, pageProbe, sawChunkWhileStreamOpen, sawSseWhileOpen,
              watchOpenAfterBig, fenceAliveAfterBig, ctxA, ctxB, bClearedOnLock, aKeptOnLock, preReadAfterEnd,
            });

            // r12 MAJOR (real Chrome ×2): credential sign-up POSTs over the streamResourceContent + dataReceived road
            // (two-flush chunked JSON & two-flush Z_SYNC_FLUSH gzip JSON, both a rejected error body and an accepted ok body)
            await run(['tab', 'new', `${r11Origin}/plain`]);
            await sleep(120);
            const curTargetsR12 = ((await rawR11.call('Target.getTargets')).msg?.result?.targetInfos || []).filter((t) => t.type === 'page' && String(t.url || '').startsWith(r11Origin));
            const tidR12 = String(curTargetsR12[0]?.targetId || '');
            for (let rep = 1; rep <= 2; rep++) {
              const runCredStreamCase = async (enc, verdict) => {
                const uName = `r12-${enc}-${verdict}-${rep}@example.test`;
                const entryName = `web-login:${r11Origin}#${uName}`;
                await run(['open', `${r11Origin}/signup-stream?enc=${enc}&verdict=${verdict}&rep=${rep}`]);
                const rSub = await run(['login', r11Origin, '--new-user', uName, '--generate', '--submit']);
                const g0 = w.eng.secretGet(entryName);
                const rec0 = g0 && g0.value ? BL.recordOf(g0.value.toString('utf8')) : null;
                if (rec0 && rec0.password) trackedSecrets.push(rec0.password);
                if (verdict === 'accept') {
                  await until(() => {
                    const g = w.eng.secretGet(entryName);
                    const rec = g && g.value ? BL.recordOf(g.value.toString('utf8')) : null;
                    return Boolean(rec && !rec.pending);
                  }, 2500);
                } else {
                  await sleep(200); // > checkSpaFinish 60 ms window: rejected stream body must keep pending:'register'
                }
                const gEnd = w.eng.secretGet(entryName);
                const recEnd = gEnd && gEnd.value ? BL.recordOf(gEnd.value.toString('utf8')) : null;
                await run(['open', `${r11Origin}/plain`]);
                return { code: rSub.code, pending: (recEnd && recEnd.pending) || null };
              };
              const cRej = await runCredStreamCase('chunked', 'reject');
              const cAcc = await runCredStreamCase('chunked', 'accept');
              const gRej = await runCredStreamCase('gzip', 'reject');
              const gAcc = await runCredStreamCase('gzip', 'accept');
              ok(Boolean(
                cRej.code === 0 && cRej.pending === 'register' &&
                cAcc.code === 0 && cAcc.pending === null &&
                gRej.code === 0 && gRej.pending === 'register' &&
                gAcc.code === 0 && gAcc.pending === null &&
                streamCredReqCount >= rep * 4
              ), `r12 MAJOR §7v.${rep}/2 (real Chrome streamResourceContent + dataReceived credential road): two-flush chunked & gzip JSON answers reject error bodies (pending kept) and confirm ok bodies`, {
                rep, cRej, cAcc, gRej, gAcc, streamCredReqCount,
              });
            }
            if (origTid) await run(['tab', origTid]);
            if (tidR12 && tidR12 !== origTid) await run(['tab', 'close', tidR12]);
          } finally {
            await rawR11.close();
          }
        } finally {
          await w.eng.unlock(w.VPW).catch(() => {});
          r11Srv.closeIdleConnections?.();
          r11Srv.closeAllConnections?.();
          await new Promise((r) => r11Srv.close(() => r()));
        }
      }
    }

    console.log('⑧ R4 zero-leakage sweep across all output surfaces + data/ files + RED mutant control');
    {
      const dataFiles = walkDataFiles(path.join(w.W, 'data'));
      const surfaces = {
        cli: cliTranscripts.join('\n'),
        hubLogs: w.logs.join('\n'),
        dialogTrace: JSON.stringify(w.traced),
        browserAudit: JSON.stringify(w.audited),
        vaultAudit: w.vaultAuditRaw(),
        ...dataFiles,
      };
      const uniqueSecrets = [...new Set(trackedSecrets.filter(Boolean))];
      const uniqueShort = [...new Set(trackedShortTokens.filter(Boolean))];
      const hits = sweepSurfaces(surfaces, uniqueSecrets, uniqueShort);
      ok(hits.length === 0 && Object.keys(dataFiles).length > 0,
        `ZERO LEAKAGE: 0 occurrences across ${uniqueSecrets.length} secrets + ${uniqueShort.length} TOTP codes over CLI, hub logs, dialog trace, browser audit, vault-audit.jsonl, and ${Object.keys(dataFiles).length} data/ files`, hits);

      const useRows = w.vaultAudit().filter((l) => l.event === 'vault-use' && l.door === 'browser-login' && l.outcome === 'ok');
      ok(useRows.length >= 10 && useRows.every((l) => /^vr-[0-9a-f]{12}$/.test(l.receipt || '') && [...allowedUseOrigins].some((orig) => String(l.purpose || '').includes(orig))),
        `THE USE LAW: all ${useRows.length} successful fills recorded a vault-use line with purpose + receipt`, useRows.length);

      // RED mutant control: a copy of browser-login-fill.js that includes the secret value in its return object is caught by sweepSurfaces
      const lfSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8');
      const lfAnchor = "return { ok: true, filled: loginId || (curForm && curForm.id) || 'login', step: resolvedStep, submitted, contextId: ctxId };";
      const lfMutSrc = lfSrc.replace(lfAnchor, "return { ok: true, filled: loginId || 'login', leaked: entries.map((x) => x[0]).join(','), step: resolvedStep, submitted, contextId: ctxId };")
        .replace('entries[i][1] = null; // drop reference as soon as read', 'entries[i][0] = val;');
      ok(lfMutSrc !== lfSrc, 'RED mutant anchor found in src/server/browser-login-fill.js');
      const LFm = MUT.load('src/server/browser-login-fill.js', lfMutSrc, 'leakfill');
      const mutRes = await LFm.fillVaultLogin({
        call: async (m, p) => {
          if (m === 'Page.getFrameTree') return { result: { frameTree: { frame: { id: 'F1', url: `${SITE}/one`, securityOrigin: SITE } } } };
          if (m === 'Target.getTargetInfo') return { result: { targetInfo: { targetId: 'T1', url: `${SITE}/one` } } };
          if (m === 'Page.createIsolatedWorld') return { result: { executionContextId: 11 } };
          if (m === 'Runtime.evaluate') {
            const ex = String((p && p.expression) || '');
            if (ex.includes('isoOrigin')) return { result: { result: { value: { ok: true, isoOrigin: SITE, isoHref: `${SITE}/one`, actionOrigin: SITE, fields: [{ fieldId: 'vs-f-0', tag: 'input', domType: 'password', type: 'password', visible: true }] } } } };
            if (ex.includes('window.vsLoginSnap =')) return { result: { result: { value: { ok: true, fields: [{ fieldId: 'vs-f-0', tag: 'input', domType: 'password', type: 'password', visible: true }] } } } };
            return { result: { result: { value: { ok: true } } } };
          }
          return { result: {} };
        },
        origin: SITE,
        trackedUrl: `${SITE}/one`,
        values: { 'vs-f-0': PW },
        form: { id: 'f', pageOrigin: SITE, frameOrigin: SITE, step: 'password', fields: [{ fieldId: 'vs-f-0', type: 'password' }] },
      });
      const mutHits = sweepSurfaces({ mutantReturn: JSON.stringify(mutRes) }, [PW]);
      ok(mutHits.length > 0, 'RED CONTROL: a mutant fillVaultLogin that leaks the secret into its return surface is caught by sweepSurfaces', mutHits);
    }

    await w.close();
  }
} finally {
  await pages.close();
  await pages2.close();
  cleanup();
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
