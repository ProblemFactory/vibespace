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
  const mediator = CM.create({ log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)) } });
  const kk = Kk.create({
    dataDir: path.join(W, 'data'), homeDir: KH, env: () => kenv, serverSetting: HEADLESS_SETTING, liveKeys: () => live,
    runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }),
    mediator,
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
  const dialogs = Dmod.create({
    keeper: kk,
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
  const close = async () => {
    dialogs.shutdown();
    kk.shutdown();
    await mediator.shutdown();
    eng.close();
    srv.closeIdleConnections?.();
    srv.closeAllConnections?.();
    await new Promise((r) => srv.close(() => r()));
  };
  return { W, KEY, mediator, kk, prof, eng, grants, totp, logins, dialogs, cli, logs, traced, audited, vaultAuditRaw, vaultAudit, close };
}

try {
  ok(!('DBUS_SESSION_BUS_ADDRESS' in BASE_ENV), 'D-Bus session bus address is unset in the heavy suite environment');
  let w;
  try { w = await world('main'); } catch (e) { skip(`the keeper could not launch Chrome here: ${e && e.message}`); w = null; }
  if (w) {
    const SITE = pages.origin;
    const SITE2 = pages2.origin;
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

      // Plant B3 pre-fill input capture + cross-navigation window.name + console.log BEFORE filling
      const pre = await run(['eval', "window.__b3 = ''; document.querySelector('#p').addEventListener('input', (e) => { window.__b3 = e.target.value; window.name = 'stash:' + e.target.value; console.log('cstash:' + e.target.value); }); 'armed'"]);
      ok(pre.code === 0, 'pre-fill input listener planted before login fill', pre);

      pages.clear();
      r = await run(['login']);
      ok(r.code === 0 && /Filled the user name and the password/.test(r.out) && /NOT submitted/.test(r.out) && /Step: password\./.test(r.out) && /Receipt vr-[0-9a-f]{12}\./.test(r.out) && pages.received().length === 0,
        'login without --submit fills username + password (Step: password) and does NOT submit the form', r);

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
      const mg = await w.mediator.grantFor({ profileId: w.prof.id, browserKey: w.KEY, upstream: upUrl1, targetIds: [pageTarget.targetId] });
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

      // Allowed verb (`click`) submits the form → 303 redirect to /welcome lifts liveFill, and Layer 2 scrubs stashed secret
      const clickSub = await run(['click', 'button[type=submit]']);
      const gotClick = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/welcome\b/.test(u.out); }, 4000);
      ok(clickSub.code === 0 && gotClick && gotClick.body.username === USER && gotClick.body.password === PW,
        'allowed verb `click` submits the unmasked real password to /done/one and navigates to /welcome', { clickCode: clickSub.code, gotClick: gotClick && { user: gotClick.body.username } });

      const snapAfter = await run(['snapshot']);
      ok(snapAfter.code === 0 && /Signed in/.test(snapAfter.out), 'after cross-document navigation to /welcome, snapshot is allowed again', snapAfter.out);
      const winNameAfter = await run(['eval', 'window.name']);
      ok(winNameAfter.code === 0 && winNameAfter.out.includes(`[vault:${LOGIN_NAME}]`) && !winNameAfter.out.includes(PW) && !winNameAfter.err.includes(PW),
        'Layer 2 scrubber: post-navigation `eval window.name` replaces stashed password with [vault:web-login:...]', winNameAfter);
      const medAfter = await medRpc.call('Runtime.evaluate', { expression: 'window.name', returnByValue: true }, medSid);
      ok(!medAfter.msg.error && medAfter.raw.includes(`[vault:${LOGIN_NAME}]`) && !medAfter.raw.includes(PW),
        'Layer 2 scrubber (cdp-mediator WS): upstream frame carrying stashed password in window.name is scrubbed to [vault:web-login:...]', medAfter.msg);
      await medRpc.close();
      await run(['eval', "window.name = ''; 'cleared'"]);

      // Direct `login --submit --json` road on /one
      pages.clear();
      await run(['open', `${SITE}/one`]);
      r = await run(['login', SITE, '--user', USER, '--submit', '--json']);
      const j = (() => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return null; } })();
      const gotOne = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      ok(r.code === 0 && j && j.success && eq(j.data.filled, ['username', 'password']) && j.data.step === 'password' && j.data.submitted === true && /^vr-[0-9a-f]{12}$/.test(j.data.receipt) && gotOne && gotOne.body.username === USER && gotOne.body.password === PW,
        'login --submit --json submits the real username + password to /done/one and returns {filled, step:"password", submitted:true, receipt}', { j, gotOne: gotOne && { user: gotOne.body.username } });
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
        ok(r.code === 0 && j && j.success && j.data.submitted === true && rec && rec.body.username === USER && rec.body.password === PW,
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

      // 7b. Unsubmitted signup stays pending past 250 ms (no blind 60 ms timer), then confirms when clicked and accepted
      pages.clear();
      await run(['open', `${SITE}/signup-check`]);
      const rWait = await run(['login', SITE, '--new-user', 'wait@example.test', '--generate']);
      await sleep(250);
      const recBeforeClick = readLoginRec('wait@example.test');
      ok(rWait.code === 0 && recBeforeClick && recBeforeClick.pending === 'register' && recBeforeClick.submittedAt === null,
        'signup without --submit stays pending after 250 ms (no unconditional 60 ms confirmation timer)', { pending: recBeforeClick && recBeforeClick.pending });
      const rClick = await run(['click', 'button[type=submit]']);
      const confirmedNav = await until(() => { const rec = readLoginRec('wait@example.test'); return rec && !rec.pending && rec.submittedAt > 0 ? rec : null; }, 4000);
      const gotWait = pages.received().find((x) => x.path === '/done/signup-check' && x.body.email === 'wait@example.test');
      ok(rClick.code === 0 && !!confirmedNav && gotWait && gotWait.body.password === confirmedNav.password,
        'submitting via `click` to 200 + /welcome navigation confirms the pending vault-minted login', { confirmed: !!confirmedNav });

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
      ok(useRows.length >= 10 && useRows.every((l) => /^vr-[0-9a-f]{12}$/.test(l.receipt || '') && String(l.purpose || '').includes(SITE)),
        `THE USE LAW: all ${useRows.length} successful fills recorded a vault-use line with purpose + receipt`, useRows.length);

      // RED mutant control: a copy of browser-login-fill.js that includes the secret value in its return object is caught by sweepSurfaces
      const lfSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8');
      const lfAnchor = "return { ok: true, filled: loginId || (curForm && curForm.id) || 'login', step: resolvedStep, submitted };";
      const lfMutSrc = lfSrc.replace(lfAnchor, "return { ok: true, filled: loginId || 'login', leaked: entries.map((x) => x[0]).join(','), step: resolvedStep, submitted };")
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
