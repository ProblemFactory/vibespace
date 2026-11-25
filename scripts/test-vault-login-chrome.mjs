#!/usr/bin/env node
// test-vault-login-chrome — lane vault-login r25 PIVOT («agent locates, hub fills») on REAL headless Chrome:
//   vibespace-browser fill <@ref|selector> --vault [new:]<entry>/<field> [--generate] [--user <name>]
//
// Identical hub-side isolated-world CDP primitive as the custom kernel, driven through the REAL agent-browser binary,
// REAL browser-keeper, REAL vault-engine, REAL browser-logins, REAL browser-dialogs, REAL routes, REAL Vault-window UI
// (`src/lib/vault-login-row.js`), and shipped CLI (under Mart's 2026-11-10 Ruling A: 3 honest promises + accidental-leak/phishing fences):
//   ① `vibespace-browser login` is retired (`[login_retired]`); `snapshot -i` -> `fill @ref --vault` fills one-step (`/one`),
//      Google-like two-step controlled (`/two`) + paired TOTP (`/totp`) forms via short-socket `queryAXTree` and
//      main-world `input.value` (Ruling 4 & 5a), refusing accidental `eval` / `get value` / `screenshot` with `409 [login_fill_live]`
//      before submit and carrying ZERO secret in `Runtime.evaluate` strings or agent output.
//   ② Non-navigating SPA submit (`/spa`) sends `input.value`, then Hub wipes `#sp.value === ''` and lifts `409` accidental-read fence (Ruling 4).
//   ③ `new:<site>#bob/password --generate` (`/register`) + `L2` real Chrome clicks on `.vw-login-confirm` & `.vw-login-discard`
//      against `GET/POST /api/vault/web-logins` for `rev >= 2` password changes and post-floor re-registrations (Ruling 1 & 5 + L2).
//   ④ Origin/field/grant gates & accidental-leak/phishing guards on REAL Chrome: `L5`+`N5` accidental focus-steal guards
//      (`[login_form_changed]`, 0 `Input.insertText`, 0 decoy chars/events), `<iframe>` (`[login_in_frame]`), `<input type="text">`
//      (`[login_bad_field]`), `L4` two-tab `@ref` isolation (`[target_not_found]`, 0 `Input.insertText`, background tab untouched),
//      cross-origin page (`[login_phishing]`), `L1`+`N4` accidental cross-origin leak fence (`urlencoded`, `json`, `multipart/form-data`,
//      `text/plain`, `GET ?q=btoa(pw)`, fail-closed `application/octet-stream` & scan caps -> `BlockedByClient`, harmless `FormData` allowed,
//      same-origin all 5 allowed), `N1` fail-closed fence across mode flips, the SHAPE S leg with the persisted hold (a cold restart holds the tab waiting for the vault; once it opens the tab follows its kind), and `M1` `vault_locked` (`423`, 0 CDP calls).
//   ⑤ Zero-secret & zero-digest byte sweep across all output surfaces AND all files on disk (Ruling 5c / RULE 5′) +
//      6 named RED mutants (`origin-gate-removed`, `read-fence-removed`, `mask-wipe-removed`, `multipart-branch-removed`,
//      `secretNames-without-rev`, `async-focus-seam`) on REAL Chrome.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses, driverArgs } from './scratch.mjs';
import { DRIVER } from './scratch.mjs';   // the ONE sentence a driver-less skip begins with (主开发 r2095)
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { startLoginPages } from './fixtures/login-pages.mjs';

const HEADLESS_SETTING = (k) => (k === 'browser.noDisplayMode' ? 'headless' : undefined);
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const CM = require('../src/server/cdp-mediator.js');
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
const VRm = require('../src/routes/vault.js');
const esbuild = require('esbuild');

let pass = 0, fail = 0, skipped = 0;
const SUITE_LOG_FILE = process.env.VAULT_LOGIN_CHROME_LOG || '';
if (SUITE_LOG_FILE) {
  try { fs.writeFileSync(SUITE_LOG_FILE, ''); } catch {}
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  console.log = (...a) => { origLog(...a); try { fs.appendFileSync(SUITE_LOG_FILE, a.map(String).join(' ') + '\n'); } catch {} };
  console.error = (...a) => { origErr(...a); try { fs.appendFileSync(SUITE_LOG_FILE, a.map(String).join(' ') + '\n'); } catch {} };
}
const ok = (c, n, extra) => {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); }
  return !!c;
};
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000, step = 25) {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = await fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}

const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && k !== 'DBUS_SESSION_BUS_ADDRESS')
);
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null;
try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { }
if (!ver) {
  console.error(`SKIPPED: ${DRIVER.skip} no agent-browser on PATH (PATH=${BASE_ENV.PATH || ''})`);
  process.exit(2);
}

const VAULT_UI_BUNDLE = esbuild.buildSync({
  stdin: {
    contents: `import { loadLogins, loginExtras } from './src/lib/vault-login-row.js';
import { loginHeld, showLoginGrantPicker, showAnySiteDialog, showAnyAccountDialog } from './src/lib/vault-login-grants.js';
const DOORS = { held: loginHeld, grant: showLoginGrantPicker, anySite: showAnySiteDialog, anyAccount: showAnyAccountDialog };   // the Vault window's (its «Use for…» opens)
window.__mountVaultRows = async () => {
  const root = document.getElementById('rows');
  root.textContent = '';
  const data = await loadLogins();
  window.__lastLoginsData = data;
  for (const e of (data && data.entries) || []) {
    const rowDiv = document.createElement('div');
    rowDiv.dataset.entry = e.name;
    rowDiv.dataset.user = e.user || '';
    const { box, doors } = loginExtras({ entry: e.name }, data, { refresh: () => window.__mountVaultRows(), doors: DOORS });
    rowDiv.append(box, ...doors);
    root.append(rowDiv);
  }
  window.__vaultRowsReady = true;
};
window.__mountVaultRows();`,
    resolveDir: REPO,
    sourcefile: 'vault-ui-test-entry.js',
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
}).outputFiles[0].text;
const VAULT_UI_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Vault Web Logins UI</title></head><body><div id="rows"></div><script>${VAULT_UI_BUNDLE}</script></body></html>`;

const ROOT = scratch('vlogin-chrome');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  try { endRootedProcesses(ROOT); } catch { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => { cleanup(); process.exit(130); });

console.log(`agent-browser: ${REAL_AB} (${ver})`);

const pwOf = (tag) => [tag, crypto.randomBytes(6).toString('hex'), 'Vq', String(crypto.randomInt(10, 99))].join('-');
const secretNeedles = (v) => {
  if (!v) return [];
  const b = Buffer.from(String(v), 'utf8');
  const raw = b.toString('utf8');
  const d256 = crypto.createHash('sha256').update(b).digest();
  const d1 = crypto.createHash('sha1').update(b).digest();
  const d512 = crypto.createHash('sha512').update(b).digest();
  return [
    raw, encodeURIComponent(raw),
    b.toString('hex'), b.toString('base64'), b.toString('base64url'),
    d256.toString('hex'), d256.toString('hex').toUpperCase(), d256.toString('base64'), d256.toString('base64url'),
    d1.toString('hex'), d1.toString('base64'),
    d512.toString('hex'), d512.toString('base64'),
  ].filter((x) => x && x.length >= 6);
};
const walkFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walkFiles(p) : e.isFile() ? [p] : [];
  });
};

const WSBase = require('ws').WebSocket;
const countingWS = (sent, recv = null) => class extends WSBase {
  constructor(url, opts) {
    super(url, opts);
    if (Array.isArray(recv)) {
      this.on('message', (data) => {
        try {
          const s = typeof data === 'string' ? data : data.toString('utf8');
          const m = JSON.parse(s);
          if (m && m.method) { const ti = (m.method === 'Target.targetCreated' || m.method === 'Target.targetInfoChanged') && m.params && m.params.targetInfo && m.params.targetInfo.type === 'iframe' ? m.params.targetInfo : null; recv.push({ method: m.method, bytes: s.length, ...(ti ? { frame: { id: String(ti.targetId || ''), url: String(ti.url || '').slice(0, 300), parent: ti.parentFrameId ? String(ti.parentFrameId) : null } } : {}) }); } // B-5f2e round 2
        } catch { }
      });
    }
  }
  send(data, ...rest) {
    try {
      const m = JSON.parse(String(data));
      if (m && m.method) sent.push({ method: m.method, params: m.params || {}, text: String(data) });
    } catch { }
    return super.send(data, ...rest);
  }
};

const foreignBodyLeakedSecret = (rows, sec) => {
  const needles = secretNeedles(sec);
  for (const x of Array.isArray(rows) ? rows : []) {
    const hay = [x?.path || '', x?.search || '', x?.raw || '', JSON.stringify(x?.body || {})].join('\n');
    if (needles.some((ndl) => hay.includes(ndl))) return true;
  }
  return false;
};

// B-21cc, ALSO CURED: the ref is read with the TREE's parser — anywhere in the bracket after the name («[required, ref=e3]»); a
// bracket exactly «[ref=…]» found no ref on an attributed field, and the legs' CSS fallbacks would have hidden the miss.
// Its box run (int361 r1187, 0e1096d9d): a label regex matches a whole LINE, so /Account/i also matched the heading «Sign in with
// your account» [level=1, ref=e18] — whose attributed bracket the old finder could not read, so it skipped the heading BY ACCIDENT.
// A finder of fields says so: it returns the ref of a field or a button, never of a structural line (a heading, a frame, a text).
const STRUCTURAL_ROLES = new Set(['heading', 'iframe', 'paragraph', 'text', 'statictext', 'generic', 'img', 'image', 'list', 'listitem', 'region', 'group', 'document', 'main', 'navigation', 'banner', 'contentinfo', 'separator']);
const findRef = (snapOut, labelRe) => {
  const PV = require(path.join(REPO, 'src/browser-verbs.js'));
  for (const line of String(snapOut || '').split('\n')) {
    if (!labelRe.test(line)) continue;
    const r = PV.parseSnapshotRefs(line)[0];
    if (r && r.ref && !STRUCTURAL_ROLES.has(r.role)) return r.ref;
  }
  return null;
};

const MUT = mutantCopies('vlogin-chrome', REPO);
const pages = await startLoginPages();
const evilPages = await startLoginPages();
const evilPagesN4 = await startLoginPages();
const evilPagesN1 = await startLoginPages();
const evilPagesRapid = await startLoginPages();

async function world(tag) {
  const W = path.join(ROOT, tag);
  const KH = path.join(W, 'h'), KXD = path.join(W, 'x'), VD = path.join(W, 'vault'), KD = path.join(W, 'data');
  for (const d of [path.join(KH, '.agent-browser'), KXD, VD, KD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(KH, '.agent-browser', 'config.json'), JSON.stringify({ args: driverArgs('--no-sandbox', '--ignore-certificate-errors'), ...(process.env.VS_CHROME && fs.existsSync(process.env.VS_CHROME) ? { executablePath: process.env.VS_CHROME } : {}) }), { mode: 0o600 });   // (lane chrome-157: VS_CHROME — a Chrome for Testing build for the real-browser claim, as the other chrome suites take it)   // (主开发's must-hold, a form posting to a sibling host: *.example.com — IANA's reserved name — resolves to loopback in this scratch browser only, its https served with a certificate the scene makes; no lookup and no request leaves the box)
  const hostBrowsers = path.join(process.env.HOME || '/root', '.agent-browser', 'browsers');
  const localBrowsers = path.join(KH, '.agent-browser', 'browsers');
  if (fs.existsSync(hostBrowsers) && !fs.existsSync(localBrowsers)) {
    try { fs.symlinkSync(hostBrowsers, localBrowsers); } catch { }
  }
  const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
  const KEY = 'bk-0000f1a1';
  const live = new Set([KEY]);
  const logs = [], traced = [], audited = [];
  const med = CM.create({ log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)) } });
  await med.listen();
  const fencesByDialogs = new WeakMap();
  let lastFence = null;
  const origSetLoginFence = med.setLoginFence.bind(med);
  med.setLoginFence = (f) => { lastFence = f; return origSetLoginFence(f); };
  const kk = Kk.create({
    dataDir: KD, homeDir: KH, env: () => kenv, serverSetting: HEADLESS_SETTING, liveKeys: () => live,
    runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }),
    log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)), error: (l) => logs.push(String(l)) },
    install: false, tickMs: 3600e3, mediator: med,
  });
  const subWatchKeeper = { ...kk, mediator: () => null };
  const prof = kk.createProfile({ label: 'Login ' + tag }, { owner: { kind: 'instance', id: null } });
  const eng = VE.create({ dataDir: VD, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
  const VPW = ['vault', crypto.randomBytes(4).toString('hex'), 'pass'].join('-');
  await eng.setup(VPW);
  const grants = GS.create({ memory: true });
  const totp = VT.create({ dataDir: VD, vault: eng, log: (l) => logs.push(String(l)) });
  const fy = [];
  const logins = L.create({
    vault: eng, grants: () => grants, totpCode: (n, o) => totp.codeForLogin(n, o),
    forYou: { add: (pid, it) => { const id = 'fy-' + (fy.length + 1); fy.push({ id, pid, it, status: 'open' }); return id; }, resolve: (id) => { const r = fy.find((x) => x.id === id); if (r) r.status = 'done'; } },
    log: (l) => logs.push(String(l)),
  });
  const TOKEN = 'vsst_vlogin_' + tag;
  const sessions = new Map([['sess-' + tag, {
    agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', _browserEnv: null,
    name: 'Chat ' + tag, cwd: W, backendSessionId: 'conv-1',
  }]]);
  const cdpSent = [], cdpRecv = [], watchEvents = [];
  const holdersRef = { list: [{ browserKey: KEY, sessionId: 'sess-' + tag }] };
  const dialogs = D.create({
    keeper: kk, WebSocketImpl: countingWS(cdpSent, cdpRecv),
    log: { warn: (l) => logs.push(String(l)), log: (l) => logs.push(String(l)) },
    leaseCountOf: (pid) => new Set(((kk.list().leases) || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => l.browserKey)).size,
    holdersOf: () => holdersRef.list,
    logins,
    conversationOf: () => ({ cid: 'conv-1', name: 'Chat ' + tag }),
  });
  if (lastFence) fencesByDialogs.set(dialogs, lastFence);
  dialogs.onChange((ev) => watchEvents.push(ev));
  kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
  const origAudit = kk.audit.bind(kk);
  kk.audit = (row) => { audited.push(row); return origAudit(row); };
  const R = require('../src/routes/browser.js');
  const swapDialogs = (nextDialogs) => {
    if (!fencesByDialogs.has(nextDialogs) && lastFence) fencesByDialogs.set(nextDialogs, lastFence);
    const f = fencesByDialogs.get(nextDialogs);
    if (f) origSetLoginFence(f);
    kk.setStuckSource((bk) => nextDialogs.stuckForKey(bk));
    R.setup({ keeper: kk, activeSessions: sessions, dialogs: nextDialogs, logins, tasksForSession: () => ['tg-1'], traceDialogAct: (act) => traced.push(act) });
  };
  swapDialogs(dialogs);
  const app = express(); app.use(express.json({ limit: '50mb' }));
  VRm.registerVaultRoutes(app, { vault: eng, activeSessions: sessions, logins, who: () => 'owner', log: (l) => logs.push(String(l)) });
  app.get('/vault-ui-test', (_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(VAULT_UI_HTML); });
  app.use(R.router);
  const srv = http.createServer(app); const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const apiUrl = `http://127.0.0.1:${port}`;
  await kk.attach({ profileId: prof.id, browserKey: KEY, sessionId: 'sess-' + tag, by: 'user' });
  const PASSWD = path.join(W, 'passwd.cjs');
  fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
  const env = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, VIBESPACE_API: apiUrl, VIBESPACE_SESSION_TOKEN: TOKEN, VIBESPACE_SESSION_CWD: W };
  const cli = (args, { timeoutMs = 45000 } = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env, cwd: W });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
  const vaultAuditRaw = () => { try { return fs.readFileSync(path.join(VD, VE.AUDIT_FILE), 'utf8'); } catch { return ''; } };
  const close = async () => { dialogs.shutdown(); kk.shutdown(); await med.shutdown(); eng.close(); await new Promise((r) => { srv.close(() => r()); srv.closeAllConnections(); }); };
  return { W, VD, KD, VPW, apiUrl, token: TOKEN, kk, subWatchKeeper, prof, eng, grants, totp, logins, fy, dialogs, swapDialogs, holdersRef, watchEvents, cli, logs, traced, audited, cdpSent, cdpRecv, vaultAuditRaw, close };
}

try {
  ok(!('DBUS_SESSION_BUS_ADDRESS' in BASE_ENV), 'D-Bus session bus address is unset in the heavy suite environment');
  let w = null;
  let launchErr = null;
  try { w = await world('main'); } catch (e) { launchErr = e; w = null; }
  if (!w) {
    await pages.close();
    await evilPages.close();
    await evilPagesN4.close();
    await evilPagesN1.close();
    await evilPagesRapid.close();
    cleanup();
    console.error(`SKIPPED: the keeper could not launch Chrome here (${launchErr && launchErr.message})`);
    process.exit(2);
  }
  {
    const SITE = pages.origin;
    const EVIL = evilPages.origin;
    const EVIL_N4 = evilPagesN4.origin;
    const EVIL_N1 = evilPagesN1.origin;
    const EVIL_RAPID = evilPagesRapid.origin;
    const bdSrcRapid = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
    const BD_M12_SHARED = MUT.load('src/server/browser-dialogs.js', editAnchor(editAnchor(bdSrcRapid,
      'const myActiveFill = !checkOnly ? {', 'const myActiveFill = false ? {', "src/server/browser-dialogs.js"),
      'if (myActiveFill) {\n          if (myActiveFill.crossNav) {', 'if (false && myActiveFill) {\n          if (myActiveFill.crossNav) {', "src/server/browser-dialogs.js"),
    'r26-active-fill-fence-removed');
    const USER = 'alice@example.test';
    const PW = pwOf('chrome-pw');
    const SEED_B32 = T.base32Encode(crypto.randomBytes(20));
    const cliTranscripts = [];
    const run = async (args) => { const r = await w.cli(args); cliTranscripts.push(`${args.join(' ')}\nOUT:${r.out}\nERR:${r.err}`); return r; };

    ok(w.totp.addEntry({ seed: SEED_B32, name: 'google-like' }, { who: 'owner' }).ok, 'owner sealed paired TOTP seed in vault');
    ok(w.logins.addOwn({ origin: SITE, username: USER, password: PW, totpName: 'google-like' }).ok, 'owner sealed web login for loopback site');
    ok(w.logins.grant(`web-login:${SITE}#${USER}`, 'any-account', 'session:conv-1').ok, 'owner granted site logins to conversation');

    console.log('① Retired `login` verb + `snapshot -i` -> `fill @ref --vault` on native (`/one`) and controlled two-step + TOTP (`/two` -> `/totp`)');
    {
      let r = await run(['open', `${SITE}/one`]);
      ok(r.code === 0 && w.dialogs.kernelFactOf(w.prof.id) === false, 'opened /one on real standard Chrome (kernelFactOf === false)', r);

      const ret = await run(['login']);
      ok(ret.code === 1 && /\[login_retired\]/.test(ret.err) && /fill @ref --vault/.test(ret.err), 'RULING 3: `vibespace-browser login` exits 1 [login_retired] teaching snapshot + fill --vault');

      const snap1 = await run(['snapshot', '-i']);
      const uRef = findRef(snap1.out, /User/i) || '#u';
      const pRef = findRef(snap1.out, /Password/i) || '#p';
      const subRef = findRef(snap1.out, /Sign in/i) || 'button[type=submit]';
      ok(snap1.code === 0 && uRef.startsWith('@') && pRef.startsWith('@'), 'snapshot -i discovered @refs for User and Password on real Chrome', { uRef, pRef, subRef });

      const fu = await run(['fill', uRef, '--vault', `${SITE}#${USER}/user`]);
      const fp = await run(['fill', pRef, '--vault', `${SITE}#${USER}/password`]);
      ok(fu.code === 0 && fp.code === 0 && /Receipt vr-[0-9a-f]{12}\./.test(fp.out) && !fp.out.includes(PW) && !fp.err.includes(PW),
        'RULING 5a: `fill @ref --vault` fills user and password via Hub AXTree backendNodeId with receipt and zero secret in output', { fu: fu.out.trim(), fp: fp.out.trim() });

      // Ruling 4: read fence blocks eval / get value / screenshot BEFORE submit!
      const evBlocked = await run(['eval', "document.querySelector('#p').value"]);
      const gvBlocked = await run(['get', 'value', '#p']);
      const ssBlocked = await run(['screenshot']);
      const forgedResolve = await fetch(`${w.apiUrl}/api/agent/browser/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${w.token}` },
        body: JSON.stringify({ handle: w.prof.label, argv: ['eval', "document.querySelector('#p').value"], wrapper: true, vaultFill: true, fillTicket: 'vft_forged_chrome_ticket_123456' }),
      });
      const forgedJson = await forgedResolve.json().catch(() => null);
      ok(evBlocked.code === 1 && /\[login_fill_live\]/.test(evBlocked.err)
        && gvBlocked.code === 1 && /\[login_fill_live\]/.test(gvBlocked.err)
        && ssBlocked.code === 1 && /\[login_fill_live\]/.test(ssBlocked.err)
        && forgedResolve.status === 409 && forgedJson?.code === 'login_fill_live',
        'RULING 4 + A2: eval, get value, screenshot, and forged /resolve {vaultFill:true} are refused 409 [login_fill_live] while filled password stands unsubmitted');

      pages.clear();
      const clk = await run(['click', subRef]);
      const gotOne = await until(() => pages.received().find((x) => x.path === '/done/one'));
      ok(clk.code === 0 && Boolean(gotOne) && gotOne.body.username === USER && gotOne.body.password === PW,
        'RULING 4: native form submit posts main-world input.value to /done/one', gotOne && { path: gotOne.path, u: gotOne.body.username, pwMatch: gotOne.body.password === PW });

      // Two-step Google-like controlled form (`/two`) -> `/totp`
      pages.clear();
      await run(['open', `${SITE}/two`]);
      const snap2a = await run(['snapshot', '-i']);
      const idRef = findRef(snap2a.out, /Email or phone/i) || '#identifierId';
      const next1Ref = findRef(snap2a.out, /\bNext\b/i) || '#idNext';
      await run(['fill', idRef, '--vault', `${SITE}#${USER}/user`]);
      await run(['click', next1Ref]);
      await until(async () => { const s = await w.cli(['snapshot', '-i']); return findRef(s.out, /Enter your password/i); });
      const snap2b = await run(['snapshot', '-i']);
      const pw2Ref = findRef(snap2b.out, /Enter your password/i) || 'input[name=Passwd]';
      const next2Ref = findRef(snap2b.out, /\bNext\b/i) || '#pwNext';
      const fp2 = await run(['fill', pw2Ref, '--vault', `${SITE}#${USER}/password`]);
      await run(['click', next2Ref]);
      const gotTwo = await until(() => pages.received().find((x) => x.path === '/done/two'));
      await until(async () => { const s = await w.cli(['snapshot', '-i']); return findRef(s.out, /Enter code/i); });
      const snapTotp = await run(['snapshot', '-i']);
      const otpRef = findRef(snapTotp.out, /Enter code/i) || '#totpPin';
      const otpNextRef = findRef(snapTotp.out, /\bNext\b/i) || '#totpNext';
      const fotp = await run(['fill', otpRef, '--vault', `${SITE}#${USER}/otp`]);
      await run(['click', otpNextRef]);
      const gotTotp = await until(() => pages.received().find((x) => x.path === '/done/totp'));
      const totpHmac = (alg, k, m) => crypto.createHmac(String(alg).toLowerCase(), Buffer.from(k)).update(Buffer.from(m)).digest();
      ok(fp2.code === 0 && fotp.code === 0 && Boolean(gotTwo) && gotTwo.body.identifier === USER && gotTwo.body.Passwd === PW
        && Boolean(gotTotp) && T.verify(T.base32Decode(SEED_B32).bytes, String(gotTotp.body.code || ''), { now: Date.now(), window: 1, hmac: totpHmac }).ok,
        'controlled two-step form (/two) + paired TOTP (/totp) filled via @ref and verified by server');
    }

    console.log('② Non-navigating SPA submit (`/spa`) wipes residual password, lifts 409 fence, and sends Network.disable (`Ruling 4` + `m2`)');
    {
      pages.clear();
      await run(['open', `${SITE}/spa`]);
      const sentSpa0 = w.cdpSent.length;
      await run(['fill', '#su', '--vault', `${SITE}#${USER}/user`]);
      await run(['fill', '#sp', '--vault', `${SITE}#${USER}/password`]);
      await run(['click', '#sgo']);
      const gotSpa = await until(() => pages.received().find((x) => x.path === '/done/spa'));
      await until(() => w.dialogs.liveFillVerdictFor({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { verb: 'eval', argv: ['eval', '1'] }).ok, 6000);
      const sentNetDis = w.cdpSent.slice(sentSpa0).filter((c) => c.method === 'Network.disable').length;
      await sleep(30);
      const recvMarkAfterLift = w.cdpRecv.length;
      const afterEval = await run(['eval', "fetch('/same/after-lift', { method: 'POST', body: 'ping=1' }).then(() => document.querySelector('#sp').value)"]);
      const gotAfterLift = await until(() => pages.received().find((x) => x.path === '/same/after-lift'));
      await sleep(30);
      const netEventsAfterLift = w.cdpRecv.slice(recvMarkAfterLift).filter((m) => /^Network\./.test(m.method)).length;
      ok(Boolean(gotSpa) && gotSpa.body.username === USER && gotSpa.body.password === PW
        && afterEval.code === 0 && afterEval.out.trim().replace(/^"(.*)"$/, '$1') === '',
        'RULING 4: SPA fetch receives input.value, then Hub wipes #sp.value === "" and lifts 409 fence',
        { gotSpa: Boolean(gotSpa), afterEval: afterEval.out.trim() });
      ok(sentNetDis >= 1 && Boolean(gotAfterLift) && netEventsAfterLift === 0,
        'm2 on real Chrome: lifting the live-fill fence sends Network.disable and delivers 0 Network.* events to hub on subsequent XHR',
        { sentNetDis, gotAfterLift: Boolean(gotAfterLift), netEventsAfterLift });
    }

    console.log('③ `new:<site>#bob/password --generate` + L2 real Chrome clicks on `.vw-login-confirm` & `.vw-login-discard` (`Ruling 1 & 5`)');
    let PW_BOB = '', PW_BOB_CHG1 = '', PW_BOB_CHG2 = '', PW_CAROL_1 = '', PW_CAROL_2 = '';
    {
      pages.clear();
      await run(['open', `${SITE}/register`]);
      await run(['fill', '#ru2', 'bob']);
      const gen = await run(['fill', '#rpw', '--vault', `new:${SITE}#bob/password`, '--generate']);
      const bobName = BL.entryName(SITE, 'bob');
      const bobRec = BL.recordOf(w.eng.secretGet(bobName).value.toString('utf8'));
      PW_BOB = bobRec?.pending?.password || '';
      const confFill = await run(['fill', '#rcpw', '--vault', `${SITE}#bob/password`]);
      await run(['click', '#rgo2']);
      const gotReg = await until(() => pages.received().find((x) => x.path === '/done/register'));
      const pCards = w.fy.filter((x) => x.status === 'open' && x.it?.action?.type === 'save-login' && x.it?.action?.pending === 'register');
      ok(gen.code === 0 && confFill.code === 0 && PW_BOB.length === 24 && bobRec?.current === null && bobRec?.pending?.kind === 'register'
        && Boolean(gotReg) && gotReg.body.password === PW_BOB && gotReg.body.confirm === PW_BOB && pCards.length === 1,
        'RULING 1 & 5: `new:... --generate` seals 24-char pending:"register", `/password` fills pending while current===null, and ONE Confirm/Discard card is filed');
      const cf = w.logins.confirmOwn(bobName, { rev: bobRec.rev, who: 'owner' });
      const bobConfirmed = BL.recordOf(w.eng.secretGet(bobName).value.toString('utf8'));
      ok(cf.ok && bobConfirmed?.current?.password === PW_BOB && bobConfirmed?.pending === null && pCards[0].status === 'done',
        'RULING 1: owner Confirm promotes pending -> current and resolves For-you card');

      // L2 on REAL Chrome: `--generate` password change (`rev >= 2`) -> real Chrome clicks `.vw-login-discard` & `.vw-login-confirm` in Vault window UI
      await run(['open', `${SITE}/register`]);
      const genChg1 = await run(['fill', '#rpw', '--vault', `${SITE}#bob/password`, '--generate']);
      const bobChg1Rec = BL.recordOf(w.eng.secretGet(bobName).value.toString('utf8'));
      PW_BOB_CHG1 = bobChg1Rec?.pending?.password || '';
      await run(['open', `${w.apiUrl}/vault-ui-test`]);
      await until(async () => {
        const ev = await w.cli(['eval', "Boolean(document.querySelector('div[data-user=\"bob\"] .vw-login-discard'))"]);
        return ev.out.trim() === 'true';
      });
      await run(['click', 'div[data-user="bob"] .vw-login-discard']);
      const discDone = await until(() => {
        const r = BL.recordOf(w.eng.secretGet(bobName).value.toString('utf8'));
        return r && r.pending === null ? r : null;
      });
      ok(genChg1.code === 0 && (bobChg1Rec?.rev ?? 0) >= 2 && Boolean(discDone) && discDone.current?.password === PW_BOB && discDone.pending === null,
        'L2 on real Chrome: clicking .vw-login-discard on rev>=2 password change clears pending without card_changed',
        { sealedRev: bobChg1Rec?.rev, afterRev: discDone?.rev });

      await run(['open', `${SITE}/register`]);
      const genChg2 = await run(['fill', '#rpw', '--vault', `${SITE}#bob/password`, '--generate']);
      const bobChg2Rec = BL.recordOf(w.eng.secretGet(bobName).value.toString('utf8'));
      PW_BOB_CHG2 = bobChg2Rec?.pending?.password || '';
      await run(['open', `${w.apiUrl}/vault-ui-test`]);
      await until(async () => {
        const ev = await w.cli(['eval', "Boolean(document.querySelector('div[data-user=\"bob\"] .vw-login-confirm'))"]);
        return ev.out.trim() === 'true';
      });
      await run(['click', 'div[data-user="bob"] .vw-login-confirm']);
      const confDone = await until(() => {
        const r = BL.recordOf(w.eng.secretGet(bobName).value.toString('utf8'));
        return r && r.pending === null ? r : null;
      });
      ok(genChg2.code === 0 && (bobChg2Rec?.rev ?? 0) >= 4 && Boolean(confDone)
        && confDone.current?.password === PW_BOB_CHG2 && confDone.previous?.password === PW_BOB && confDone.pending === null,
        'L2 on real Chrome: clicking .vw-login-confirm on rev>=2 password change promotes candidate -> current and rotates old current -> previous');

      // L2 on REAL Chrome: re-registration after floor rise (`carol` discard -> re-register at `rev >= 2` -> click `.vw-login-confirm`)
      const carolName = BL.entryName(SITE, 'carol');
      await run(['open', `${SITE}/register`]);
      await run(['fill', '#rpw', '--vault', `new:${SITE}#carol/password`, '--generate']);
      PW_CAROL_1 = BL.recordOf(w.eng.secretGet(carolName).value.toString('utf8'))?.pending?.password || '';
      await run(['open', `${w.apiUrl}/vault-ui-test`]);
      await until(async () => (await w.cli(['eval', "Boolean(document.querySelector('div[data-user=\"carol\"] .vw-login-discard'))"])).out.trim() === 'true');
      await run(['click', 'div[data-user="carol"] .vw-login-discard']);
      await until(() => !w.eng.hasEntry(carolName));
      await run(['open', `${SITE}/register`]);
      await run(['fill', '#rpw', '--vault', `new:${SITE}#carol/password`, '--generate']);
      const carolRec2 = BL.recordOf(w.eng.secretGet(carolName).value.toString('utf8'));
      PW_CAROL_2 = carolRec2?.pending?.password || '';
      await run(['open', `${w.apiUrl}/vault-ui-test`]);
      await until(async () => (await w.cli(['eval', "Boolean(document.querySelector('div[data-user=\"carol\"] .vw-login-confirm'))"])).out.trim() === 'true');
      await run(['click', 'div[data-user="carol"] .vw-login-confirm']);
      const carolConf2 = await until(() => {
        const g = w.eng.secretGet(carolName);
        const r = g.ok && g.value ? BL.recordOf(g.value.toString('utf8')) : null;
        return r && r.pending === null && r.current ? r : null;
      });
      ok((carolRec2?.rev ?? 0) >= 2 && Boolean(carolConf2) && carolConf2.current?.password === PW_CAROL_2,
        'L2 on real Chrome: re-registration after loginRevFloor rise (rev>=2) confirms cleanly via .vw-login-confirm click');
    }

    console.log('④ Origin/field gates & accidental-leak/phishing fences on REAL Chrome: L5+N5 focus guards, iframe, plain input, L4 two-tab @ref, phishing, L1+N4 accidental-leak caps, N2 3000-row AX, N1 hold, SHAPE S restart (held until it navigates; an unlock changes nothing), M1 0-CDP lock');
    {
      // L5 + N5 + Ruling 5a (Ruling A accidental focus-steal guard): Focus steal (`sync`, `queueMicrotask`, `setTimeout(..., 0)`, `MutationObserver` stripping `inert`) to `<input id="decoy" type="text">` on REAL Chrome!
      for (const mode of ['sync', 'microtask', 'timeout', 'mo-inert']) {
        await run(['open', `${SITE}/hijack-async?mode=${mode}`]);
        const ins0 = w.cdpSent.filter((c) => c.method === 'Input.insertText').length;
        const hj = await run(['fill', '#trap', '--vault', `${SITE}#${USER}/password`]);
        const ins1 = w.cdpSent.filter((c) => c.method === 'Input.insertText').length;
        const hjEval = await run(['eval', "JSON.stringify({ trap: document.getElementById('trap').value, decoy: document.getElementById('decoy').value, log: window.__decoyLog })"]);
        let parsedHj = null;
        try {
          const rawOut = hjEval.out.trim();
          const unwrapped = rawOut.startsWith('"') ? JSON.parse(rawOut) : rawOut;
          parsedHj = typeof unwrapped === 'string' ? JSON.parse(unwrapped) : unwrapped;
        } catch { parsedHj = null; }
        ok(hj.code === 1 && /\[login_form_changed\]/.test(hj.err) && ins1 === ins0
          && Boolean(parsedHj) && parsedHj.trap === '' && parsedHj.decoy === '' && Array.isArray(parsedHj.log) && parsedHj.log.length === 0,
          `L5 + N5 (${mode}): focus/inert hijack to <input type="text"> decoy refused [login_form_changed] on real Chrome with 0 Input.insertText and 0 decoy chars/events`,
          { mode, err: hj.err.trim(), insDelta: ins1 - ins0, parsedHj });
      }

      // Iframe (`/framed`) — Ruling 5b
      await run(['open', `${SITE}/framed`]);
      const snapF = await run(['snapshot', '-i']);
      const childPwRef = findRef(snapF.out, /Password/i);
      const frHost = await run(['fill', '#fhost', '--vault', `${SITE}#${USER}/password`]);
      const frChild = childPwRef ? await run(['fill', childPwRef, '--vault', `${SITE}#${USER}/password`]) : { code: 1, err: '[login_in_frame]' };
      ok(frHost.code === 1 && /\[login_in_frame\]/.test(frHost.err) && frChild.code === 1 && /\[login_in_frame\]/.test(frChild.err),
        'RULING 5b: targeting <iframe> selector or @ref inside child iframe refused [login_in_frame] on real Chrome',
        { childPwRef, frHost: frHost.err.trim(), frChild: frChild.err.trim() });
      ok(!/\[frame_other_site\]/.test(snapF.err), 'B-5f2e CONTROL: a frame of the page\'s own site (/framed — the driver lists its fields) is never said as another site\'s', { err: snapF.err.trim().slice(0, 400) });

      // ── B-5f2e LINE 2 (the coordinator's ruling 2026-11-19 20:18Z) — A FRAME OF ANOTHER SITE SAID BY NAME, on the real Chrome: the
      // stand-in frames a sign-in form from idp.example.com (another SITE than 127.0.0.1: the suite's one resolver rule maps it to this server), so Chrome runs
      // it in a process of its own. The watch must SEE its target with its parent (round 2's question) — else no sentence is true.
      {
        // ONE resolver rule (the driver cuts its args at every comma — src/browser-verbs.js driverArgsList): idp.example.com is
        // another SITE than 127.0.0.1 under the rule the suite already has
        const XS = SITE.replace('127.0.0.1', 'idp.example.com');
        const XO = new URL(XS).origin;
        await run(['open', `${SITE}/xframed?src=${encodeURIComponent(XS + '/xsignin')}`]);
        // the frame's hello reaching the page, waited for (bounded) — a slow box is never read as «the frame never loaded»
        const loaded = (await until(async () => { const r = await run(['eval', "(document.getElementById('got') || {}).textContent || ''"]); return /idp\.example\.com/.test(r.out) ? r : null; }, 20000, 300))
          || await run(['eval', "(document.getElementById('got') || {}).textContent || ''"]);
        ok(/idp\.example\.com/.test(loaded.out), 'B-5f2e: the stand-in ran — the frame from another site LOADED (its hello reached the page)', { out: loaded.out.trim() });
        const heard = w.cdpRecv.filter((x) => x.frame && /\/xsignin/.test(String(x.frame.url || '')));
        console.log('B-5f2e ROUND 2 ' + JSON.stringify(heard.slice(0, 4).map((x) => x.frame)));
        ok(heard.length > 0 && heard.some((x) => typeof x.frame.parent === 'string' && x.frame.parent.length > 0),
          'B-5f2e ROUND 2: the watch HEARD the frame\'s target (Target.targetCreated, type iframe) WITH ITS PARENT (parentFrameId) on this Chrome — no call of ours', heard.slice(0, 4).map((x) => x.frame));
        // r150 (2026-11-20) — MEASURED on this box (agent-browser 0.38.2, Chrome 151): the driver's snapshot LISTS this frame's fields under
        // its Iframe, and a fill / a click BY REF lands in it. The note must say what is TRUE FOR THE REPLY it rides — the words are
        // browser-stuck's own, by kind; never that the driver cannot see or type into the frame (2.369.413 said so: false)
        const STK = require(path.join(REPO, 'src/browser-stuck.js'));
        const said = (r, kind) => r.err.includes(`note: ${STK.otherSiteFrameText([XO], null, { kind })} [frame_other_site]`);
        const never = (r) => !/cannot see or type|cannot see|cannot reach/.test(r.err);   // stale-pins: kept — an absence check (the false sentence must not come back)
        const snapX = await run(['snapshot', '-i']);
        const uR = findRef(snapX.out, /Account/i), pR = findRef(snapX.out, /Password/i), gR = findRef(snapX.out, /Continue/i);
        ok(snapX.code === 0 && !!uR && !!pR && !!gR && said(snapX, 'listed') && !said(snapX, 'unlisted') && never(snapX),
          'B-5f2e (r150): snapshot -i on the page — the driver LISTS the frame\'s fields (Account, the secret box, Continue, each with its ref), and the note says so: fill and press them BY THEIR REFS, the vault does not fill there [frame_other_site]', { err: snapX.err.trim().slice(0, 700), out: snapX.out.slice(0, 400) });
        const fillX = await run(['fill', '#xu', 'alice-x']);
        ok(fillX.code !== 0 && /Element not found/.test(fillX.out + fillX.err) && said(fillX, 'selector') && never(fillX), 'B-5f2e (r150): a fill by a PAGE SELECTOR of the frame\'s field — the driver\'s «Element not found», then the recipe: the field\'s ref from snapshot -i', { err: fillX.err.trim().slice(0, 600) });
        const frameX = await run(['frame', '#xidp']);
        ok(frameX.code !== 0 && /Frame not found/.test(frameX.out + frameX.err) && said(frameX, 'selector') && never(frameX), 'B-5f2e (r150): the driver\'s `frame <css>` — «Frame not found», then the recipe: the field\'s ref', { err: frameX.err.trim().slice(0, 600) });
        // THE THREE ACTS BY REF LAND IN THE STAND-IN FRAME (measure 3 made a judging leg): the frame answers itself — on its button's click it
        // posts the LENGTHS of the two values to the page (never the values)
        const fillR = uR ? await run(['fill', uR, 'alice-ref']) : { code: 1, out: '', err: 'no ref' };
        const valR = uR ? await run(['get', 'value', uR]) : { code: 1, out: '', err: 'no ref' };
        const fillS = pR ? await run(['fill', pR, 'stand-pw']) : { code: 1, out: '', err: 'no ref' };   // a stand-in word (8 characters), never a credential
        const click = gR ? await run(['click', gR]) : { code: 1, out: '', err: 'no ref' };
        const ticket = (await until(async () => { const r = await run(['eval', "(document.getElementById('got') || {}).textContent || ''"]); return /t-9-8/.test(r.out) ? r : null; }, 10000, 300))
          || await run(['eval', "(document.getElementById('got') || {}).textContent || ''"]);
        ok(fillR.code === 0 && valR.code === 0 && /^alice-ref\s*$/.test(valR.out) && fillS.code === 0 && click.code === 0 && /t-9-8/.test(ticket.out),
          'B-5f2e (r150): BY REF the agent types into the frame of another site and presses its button — the Account box reads «alice-ref», and the frame\'s own ticket carries both lengths (9, 8)', { fillR: fillR.code, val: valR.out.trim(), fillS: fillS.code, click: click.code, ticket: ticket.out.trim() });
        const vaultX = await run(['fill', '#xp', '--vault', `${SITE}#${USER}/password`]);
        ok(vaultX.code !== 0 && /\[(target_not_found|login_in_frame)\]/.test(vaultX.err) && vaultX.err.includes(STK.otherSiteFrameText([XO], null, { kind: 'vault' })) && !/top-level tab/.test(vaultX.err) && never(vaultX),
          'B-5f2e (r150): the vault fill by CSS — refused as before, saying only what is true of the vault: it does not fill into another site\'s frame', { err: vaultX.err.trim().slice(0, 600) });
        const vaultR = pR ? await run(['fill', pR, '--vault', `${SITE}#${USER}/password`]) : { code: 1, err: '[login_in_frame]' };
        ok(vaultR.code !== 0 && /\[login_in_frame\]/.test(vaultR.err) && vaultR.err.includes(STK.otherSiteFrameText([XO], null, { kind: 'vault' })) && never(vaultR),
          'B-5f2e (r150): the vault fill BY REF of the frame\'s secret box — refused [login_in_frame], the vault\'s own words (nothing of the vault\'s fill into such a frame is built: the owner\'s decision)', { err: String(vaultR.err).trim().slice(0, 600) });
        // THE OTHER CASE: a frame of another site whose page has NO field — the listing shows the Iframe and nothing under it ⇒ «not listed»
        await run(['open', `${SITE}/xframed?src=${encodeURIComponent(XS + '/xnote')}`]);
        await until(async () => { const r = await run(['eval', "(document.getElementById('got') || {}).textContent || ''"]); return /idp\.example\.com/.test(r.out) ? r : null; }, 20000, 300);
        const snapN = await run(['snapshot', '-i']);
        ok(snapN.code === 0 && !findRef(snapN.out, /Account/i) && said(snapN, 'unlisted') && !said(snapN, 'listed') && never(snapN),
          'B-5f2e (r150): a frame of another site with NO field — its listing holds nothing under the Iframe, and the note says its fields are NOT listed (never «fill them by ref»)', { err: snapN.err.trim().slice(0, 600), out: snapN.out.slice(0, 300) });
        await run(['frame', 'main']);
        await run(['open', `${SITE}/plain`]);
        const snapP = await run(['snapshot', '-i']);
        ok(snapP.code === 0 && !/\[frame_other_site\]/.test(snapP.err), 'B-5f2e: the tab moved to a page with no such frame ⇒ the sentence is gone (the old page\'s frames are not said)', { err: snapP.err.trim().slice(0, 400) });
      }

      // B-21cc (agent feedback fb-2450b6f77a; 主开发 r1077): a sign-in page whose fields are REQUIRED. MEASURED here and printed: the
      // listing's own lines for the two fields. THE LAW: the vault fill takes the same targets as a plain fill — BY REF it lands (the
      // form posts the vault's values; the secret never in the agent's output); a ref the page navigated past is refused by the name the
      // plain fill's driver uses («Element not found: …» [target_not_found]). RED (judged on the box's own lines): today's scan — a
      // bracket exactly «[ref=…]» — reads no ref there, so the vault fill answered «not in the latest snapshot».
      {
        await run(['open', `${SITE}/required`]);
        const snapQ = await run(['snapshot', '-i']);
        const lineOf = (re) => String(snapQ.out || '').split('\n').find((l) => re.test(l)) || '';
        const uLine = lineOf(/Email address/i), pLine = lineOf(/Password/i);
        console.log(`  B-21cc MEASURE: the listing's lines for the two required fields: ${JSON.stringify([uLine.trim(), pLine.trim()])}`);
        const uQ = findRef(snapQ.out, /Email address/i), pQ = findRef(snapQ.out, /Password/i), cQ = findRef(snapQ.out, /Continue/i);
        const exact = (l) => /\[ref=([A-Za-z0-9_-]+)\]/.test(l);   // today's scan, restated
        ok(snapQ.code === 0 && !!uQ && !!pQ && !!cQ, 'B-21cc: snapshot -i lists both required fields and the button with their refs (the tree\'s parser)', { uLine, pLine, uQ, pQ, cQ });
        ok(!exact(uLine) && /\[(?=[^\]]*\bref=)[^\]]*,[^\]]*\]/.test(uLine), 'B-21cc MEASURED — the RED of today\'s scan: the real driver prints the required field\'s attributes and its ref in ONE bracket, where a bracket exactly «[ref=…]» reads no ref', { uLine, pLine });
        pages.clear();
        const qu = await run(['fill', uQ || '@e0', '--vault', `${SITE}#${USER}/user`]);
        const qp = await run(['fill', pQ || '@e0', '--vault', `${SITE}#${USER}/password`]);
        const qc = await run(['click', cQ || 'button[type=submit]']);
        const gotQ = await until(() => pages.received().find((x) => x.path === '/done/required'), 10000);
        ok(qu.code === 0 && qp.code === 0 && /Receipt vr-[0-9a-f]{12}\./.test(qp.out) && !qp.out.includes(PW) && !qp.err.includes(PW) && qc.code === 0 && Boolean(gotQ) && gotQ.body.username === USER && gotQ.body.password === PW,
          'B-21cc: the vault fill BY REF lands on the required fields — the form posts the vault\'s user and password, the receipt as today, the secret never in the agent\'s output', { qu: qu.err.trim().slice(0, 300), qp: qp.out.trim().slice(0, 200), posted: gotQ ? { u: gotQ.body.username, pwMatch: gotQ.body.password === PW } : null });
        // a ref the page NAVIGATED past: refused by the plain fill's name, nothing typed
        await run(['open', `${SITE}/required`]);
        const snapQ2 = await run(['snapshot', '-i']);
        const uQ2 = findRef(snapQ2.out, /Email address/i);
        const heardAt = w.cdpRecv.length;
        await run(['open', `${SITE}/required?again=1`]);
        await until(() => w.cdpRecv.slice(heardAt).some((x) => x.method === 'Page.frameNavigated'), 10000);   // the hub's watch heard the navigation
        const stale = await run(['fill', uQ2 || '@e0', '--vault', `${SITE}#${USER}/user`]);
        ok(!!uQ2 && stale.code === 1 && /\[target_not_found\]/.test(stale.err) && /Element not found: @e\d+ expired because the page navigated/.test(stale.err) && /snapshot -i/.test(stale.err),
          'B-21cc: a ref the page navigated past is refused [target_not_found] by the plain fill\'s name — «Element not found: … expired because the page navigated … snapshot -i»', { err: stale.err.trim().slice(0, 300) });
      }

      // Plain `<input type="text">` (`/plain`)
      await run(['open', `${SITE}/plain`]);
      const badMask = await run(['fill', '#q', '--vault', `${SITE}#${USER}/password`]);
      ok(badMask.code === 1 && /\[login_bad_field\]/.test(badMask.err), 'plain <input type="text"> refused [login_bad_field] on real Chrome');

      // L4: Two same-origin tabs on REAL Chrome — `@ref` from Tab 1's snapshot NEVER falls back to Tab 1 when Tab 2 is active!
      await run(['open', `${SITE}/one`]);
      const snapTab1 = await run(['snapshot', '-i']);
      const pRefTab1 = findRef(snapTab1.out, /Password/i) || '@e2';
      const tabNewRes = await run(['tab', 'new', `${SITE}/plain`]);
      const tabIds = [...String(tabNewRes.out || '').matchAll(/^\s*(t\d+)\b.*$/gm)].map((m) => ({ id: m[1], cur: /\[current\]/.test(m[0]) }));
      const tab1Id = (tabIds.find((x) => !x.cur) || { id: 't1' }).id;
      const tab2Id = (tabIds.find((x) => x.cur) || { id: 't2' }).id;
      const snapTab2 = await run(['snapshot', '-i']);
      const qRefTab2 = findRef(snapTab2.out, /Search/i);
      const insBeforeL4 = w.cdpSent.filter((c) => c.method === 'Input.insertText').length;
      const crossTabPw = await run(['fill', pRefTab1, '--vault', `${SITE}#${USER}/password`]);
      const crossTabUser = await run(['fill', pRefTab1, '--vault', `${SITE}#${USER}/user`]);
      const insAfterL4 = w.cdpSent.filter((c) => c.method === 'Input.insertText').length;
      await run(['tab', tab1Id]);
      await run(['tab', 'close', tab2Id]);
      const tab1Vals = await run(['eval', "document.getElementById('u').value + '|' + document.getElementById('p').value"]);
      ok(pRefTab1 !== qRefTab2 && crossTabPw.code === 1 && /\[target_not_found\]/.test(crossTabPw.err)
        && crossTabUser.code === 1 && /\[target_not_found\]/.test(crossTabUser.err)
        && insAfterL4 === insBeforeL4 && tab1Vals.out.trim().replace(/^"(.*)"$/, '$1') === '|',
        'L4 on real Chrome: stale @ref from background Tab 1 refused [target_not_found] on active Tab 2 with 0 Input.insertText and untouched Tab 1',
        { pRefTab1, qRefTab2, tab1Id, tab2Id, pwErr: crossTabPw.err.trim(), tab1Vals: tab1Vals.out.trim() });

      // Cross-origin page (`EVIL`)
      await run(['open', `${EVIL}/one`]);
      const phish = await run(['fill', '#p', '--vault', `${SITE}#${USER}/password`]);
      ok(phish.code === 1 && /\[login_phishing\]/.test(phish.err), 'cross-origin page refused [login_phishing] on real Chrome');

      // L1: Cross-origin exfiltration matrix + harmless multipart + fail-closed binary + same-origin allow matrix (`/exfil-matrix?dest=EVIL`)
      pages.clear();
      evilPages.clear();
      await run(['open', `${SITE}/exfil-matrix?dest=${encodeURIComponent(EVIL)}`]);
      const fxFill = await run(['fill', '#ep', '--vault', `${SITE}#${USER}/password`]);
      for (const btn of ['x-urlencoded', 'x-json', 'x-multipart', 'x-text', 'x-query', 'x-harmless-mp', 'x-binary']) {
        await run(['click', `#${btn}`]);
        await until(() => pages.received().find((x) => x.path === `/done/matrix-${btn}`), 6000);
      }
      const mRec = (k) => pages.received().find((x) => x.path === `/done/matrix-${k}`);
      const evilRowsL1 = evilPages.received();
      const evilPaths = evilRowsL1.map((x) => x.path);
      const evilLeakedPw = foreignBodyLeakedSecret(evilRowsL1, PW);
      const xoNotices = w.fy.filter((x) => x.it?.kind === 'notice' && /Blocked a cross-origin request/.test(x.it?.text || ''));
      ok(fxFill.code === 0
        && mRec('x-urlencoded')?.body?.ok === false
        && mRec('x-json')?.body?.ok === false
        && mRec('x-multipart')?.body?.ok === false
        && mRec('x-text')?.body?.ok === false
        && mRec('x-query')?.body?.ok === false
        && mRec('x-binary')?.body?.ok === false
        && mRec('x-harmless-mp')?.body?.ok === true
        && evilPaths.length === 1 && evilPaths[0] === '/steal/harmless-mp'
        && typeof evilRowsL1[0]?.raw === 'string' && evilRowsL1[0].raw.includes('benign-telemetry')
        && !evilLeakedPw
        && xoNotices.length === 1
        && w.logs.some((l) => /undecodable_body/.test(l)),
        'L1 + N5 on real Chrome: cross-origin urlencoded, nested JSON, FormData multipart, text/plain CRLF, GET base64 query, and binary all BlockedByClient (1 dedup notice, 0 secret/encoded bytes in evil .raw); harmless FormData allowed',
        { evilPaths, evilLeakedPw, notices: xoNotices.length });

      await run(['click', '#s-all']);
      const sameDone = await until(() => pages.received().find((x) => x.path === '/done/matrix-s-all'), 6000);
      await until(() => w.dialogs.liveFillVerdictFor({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { verb: 'eval', argv: ['eval', '1'] }).ok, 6000);
      const samePaths = pages.received().map((x) => x.path);
      const epAfterSame = await run(['eval', "document.getElementById('ep').value"]);
      ok(Boolean(sameDone?.body?.ok)
        && ['/same/urlencoded', '/same/json', '/same/multipart', '/same/text', '/same/query'].every((p) => samePaths.includes(p))
        && epAfterSame.code === 0 && epAfterSame.out.trim().replace(/^"(.*)"$/, '$1') === '',
        'L1 + RULING 4 on real Chrome: all 5 same-origin encodings succeed, then Hub wipes #ep.value === "" and lifts 409 fence',
        { sameDone: sameDone?.body, epAfterSame: epAfterSame.out.trim() });

      // N4 on REAL Chrome: all 7 scan-limit shapes (`/exfil-caps?dest=EVIL_N4`) fail closed on cross-origin (`BlockedByClient` + 1 notice) and pass on same-origin!
      pages.clear();
      evilPagesN4.clear();
      const noticesBeforeN4 = w.fy.filter((x) => x.it?.kind === 'notice' && /Blocked a cross-origin request/.test(x.it?.text || '')).length;
      await run(['open', `${SITE}/exfil-caps?dest=${encodeURIComponent(EVIL_N4)}`]);
      const capFill = await run(['fill', '#cp', '--vault', `${SITE}#${USER}/password`]);
      await run(['click', '#c-run']);
      const gotCaps = await until(() => pages.received().find((x) => x.path === '/done/caps'), 15000);
      const capNames = ['str', 'json', 'nested', 'lines', 'mp', 'b64', 'body'];
      const capBad = capNames.filter((k) => gotCaps?.body?.[k]?.xo !== false || gotCaps?.body?.[k]?.so !== true);
      const noticesAfterN4 = w.fy.filter((x) => x.it?.kind === 'notice' && /Blocked a cross-origin request/.test(x.it?.text || '')).length;
      ok(capFill.code === 0 && Boolean(gotCaps) && capBad.length === 0 && evilPagesN4.received().length === 0 && (noticesAfterN4 - noticesBeforeN4) === 1,
        'N4 on real Chrome: all 7 scan caps (string>262k, json>4096, nested>2048, lines>4096, multipart>256, b64>64, body>1MiB) fail closed on cross-origin (+1 dedup notice, 0 evil hits) and pass on same-origin',
        { capBad, evilHits: evilPagesN4.received().length, noticeDelta: noticesAfterN4 - noticesBeforeN4 });

      // N2 on REAL Chrome: 3,000-row table (`/table-large?rows=3000`) -> 0 `Accessibility.*` on `snapshot -i`, watch survives, `fill @ref --vault` uses `queryAXTree` with loop stall < 50 ms!
      pages.clear();
      await run(['open', `${SITE}/table-large?rows=3000`]);
      const axSnap0 = w.cdpSent.filter((c) => /^Accessibility\./.test(c.method)).length;
      const downSnap0 = w.watchEvents.filter((x) => x.kind === 'down').length;
      const snap3000 = await run(['snapshot', '-i']);
      const axSnapDelta = w.cdpSent.filter((c) => /^Accessibility\./.test(c.method)).length - axSnap0;
      const downSnap1 = w.watchEvents.filter((x) => x.kind === 'down').length;
      const luRef3000 = findRef(snap3000.out, /Email/i);
      const lpRef3000 = findRef(snap3000.out, /Password/i);
      ok(snap3000.code === 0 && axSnapDelta === 0 && downSnap1 === downSnap0 && Boolean(luRef3000) && Boolean(lpRef3000),
        'N2 on real Chrome: snapshot -i on 3,000-row table makes 0 Accessibility.* calls on hub and keeps watch open',
        { axSnapDelta, downDelta: downSnap1 - downSnap0, luRef3000, lpRef3000 });

      const fullAx0 = w.cdpSent.filter((c) => c.method === 'Accessibility.getFullAXTree').length;
      const eld = monitorEventLoopDelay({ resolution: 5 });
      eld.enable();
      const fu3000 = await run(['fill', luRef3000 || '#lu', '--vault', `${SITE}#${USER}/user`]);
      const fp3000 = await run(['fill', lpRef3000 || '#lp', '--vault', `${SITE}#${USER}/password`]);
      eld.disable();
      const maxLoopLagMs = Math.max(0, (eld.max / 1e6) - 5);
      const fullAxDelta = w.cdpSent.filter((c) => c.method === 'Accessibility.getFullAXTree').length - fullAx0;
      const downAfterFill3000 = w.watchEvents.filter((x) => x.kind === 'down').length;
      await run(['click', '#lgo']);
      const gotLarge3000 = await until(() => pages.received().find((x) => x.path === '/done/table-large'), 8000);
      ok(fu3000.code === 0 && fp3000.code === 0 && fullAxDelta === 0 && downAfterFill3000 === downSnap0 && maxLoopLagMs < 50
        && Boolean(gotLarge3000) && gotLarge3000.body.username === USER && gotLarge3000.body.password === PW,
        `N2 on real Chrome: fill @ref --vault on 3,000-row table resolves via dedicated queryAXTree (0 getFullAXTree, watch open, max loop lag ${maxLoopLagMs.toFixed(1)} ms < 50 ms)`,
        { fuCode: fu3000.code, fpCode: fp3000.code, fullAxDelta, downDelta: downAfterFill3000 - downSnap0, maxLoopLagMs: +maxLoopLagMs.toFixed(2) });

      // N2 oversize AX cap on REAL Chrome (`axMaxPayloadBytes: 16384` on 300 unlabelled inputs): refuses 409 [target_not_found] naming limit while watch stays open!
      await run(['open', `${SITE}/table-large?rows=300&unlabelled=1`]);
      w.dialogs.disarm(w.prof.id, 'n2-oversize-subwatch');
      {
        const ovEvs = [];
        const dOv = D.create({
          keeper: w.subWatchKeeper,
          log: { warn() {}, log() {} },
          holdersOf: () => w.holdersRef.list,
          leaseCountOf: () => 1,
          logins: w.logins,
          axMaxPayloadBytes: 16384,
        });
        dOv.onChange((ev) => ovEvs.push(ev));
        await dOv.arm(w.prof.id);
        const downOv0 = ovEvs.filter((x) => x.kind === 'down').length;
        await dOv.noteSnapshot({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { parsedRefs: [{ ref: '@e1', role: 'textbox', name: '', nth: 0 }] });
        const ovRes = await dOv.fillVaultField({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, {
          target: '@e1', spec: `${SITE}#${USER}/password`, facts: { conversationKeys: ['conv-1'] },
        });
        const downOv1 = ovEvs.filter((x) => x.kind === 'down').length;
        ok(!ovRes.ok && ovRes.code === 'target_not_found' && /limit|MiB/i.test(ovRes.error || '') && downOv1 === downOv0,
          'N2 on real Chrome: oversized AX reply on dedicated socket refuses target_not_found naming the safety limit while watch stays open',
          { ovRes, downDelta: downOv1 - downOv0 });
        dOv.shutdown();
      }
      await w.dialogs.arm(w.prof.id);

      // N1 on REAL Chrome (`/hold-large?dest=EVIL_N1`): `wipeMaxScanPositions: 1024` enters `holdReason=tooMuchText`; foreign POSTs stay BlockedByClient across hold AND `agent -> person -> agent` mode flip!
      pages.clear();
      evilPagesN1.clear();
      await run(['open', `${SITE}/hold-large?dest=${encodeURIComponent(EVIL_N1)}`]);
      w.dialogs.disarm(w.prof.id, 'n1-hold-subwatch');
      {
        let n1Holders = [{ browserKey: 'bk-0000f1a1', sessionId: 'sess-main' }];
        const n1Fy = [];
        const dN1 = D.create({
          keeper: w.subWatchKeeper,
          log: { warn: (l) => w.logs.push(String(l)), log: (l) => w.logs.push(String(l)) },
          holdersOf: () => n1Holders,
          leaseCountOf: () => n1Holders.filter((h) => !h.human).length,
          logins: w.logins,
          forYou: { add: (_pid, it) => { n1Fy.push(it); return `n1fy-${n1Fy.length}`; }, resolve() {} },
          wipeMaxScanPositions: 1024,
        });
        await dN1.arm(w.prof.id);
        const epN1 = await w.kk.cdpEndpointFor(w.prof.id);
        const wsN1 = new WSBase(epN1.url);
        await new Promise((r) => wsN1.once('open', r));
        let seqN1 = 0;
        const pendN1 = new Map();
        wsN1.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pendN1.has(m.id)) { const fn = pendN1.get(m.id); pendN1.delete(m.id); fn(m); } });
        const sendN1 = (method, params = {}, sid = undefined) => new Promise((r) => { const id = ++seqN1; pendN1.set(id, r); wsN1.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); });
        const tInfosN1 = (await sendN1('Target.getTargets')).result?.targetInfos || [];
        const tHold = tInfosN1.find((t) => t.type === 'page' && t.url.includes('/hold-large'));
        const sidHold = (await sendN1('Target.attachToTarget', { targetId: tHold.targetId, flatten: true })).result.sessionId;
        dN1.noteActiveTab({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, tHold.targetId);

        const fillN1 = await dN1.fillVaultField({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, {
          target: '#hp', spec: `${SITE}#${USER}/password`, facts: { conversationKeys: ['conv-1'] },
        });
        await sendN1('Runtime.evaluate', { expression: "document.getElementById('hsame').click()" }, sidHold);
        await until(() => {
          const lv = dN1.liveFillVerdictFor({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { verb: 'eval', argv: ['eval', '1'] });
          return lv && /too much text/i.test(lv.error || '') ? lv : null;
        }, 6000);
        const lvHoldN1 = dN1.liveFillVerdictFor({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { verb: 'eval', argv: ['eval', '1'] });

        const noticesBeforeHoldN1 = w.fy.filter((x) => x.it?.kind === 'notice' && /Blocked a cross-origin request/.test(x.it?.text || '')).length;
        pages.clear();
        await sendN1('Runtime.evaluate', { expression: "document.getElementById('hevil').click()" }, sidHold);
        const ev1 = await until(() => pages.received().find((x) => x.path === '/done/hold-evil'), 6000);

        // Flip `agent -> person -> agent` while hold stands
        n1Holders = [{ browserKey: 'bk-human-n1', human: true, input: 'user' }];
        await dN1.arm(w.prof.id);
        await sleep(50);
        pages.clear();
        await sendN1('Runtime.evaluate', { expression: "document.getElementById('hevil').click()" }, sidHold);
        const evPerson = await until(() => pages.received().find((x) => x.path === '/done/hold-evil'), 6000);

        n1Holders = [{ browserKey: 'bk-0000f1a1', sessionId: 'sess-main' }];
        await dN1.arm(w.prof.id);
        await sleep(50);
        pages.clear();
        await sendN1('Runtime.evaluate', { expression: "document.getElementById('hevil').click()" }, sidHold);
        const evBackAgent = await until(() => pages.received().find((x) => x.path === '/done/hold-evil'), 6000);
        const noticesAfterHoldN1 = w.fy.filter((x) => x.it?.kind === 'notice' && /Blocked a cross-origin request/.test(x.it?.text || '')).length;

        ok(Boolean(fillN1?.ok) && !lvHoldN1.ok && /too much text/i.test(lvHoldN1.error || '')
          && ev1?.body?.ok === false && evPerson?.body?.ok === false && evBackAgent?.body?.ok === false
          && evilPagesN1.received().length === 0 && (noticesAfterHoldN1 - noticesBeforeHoldN1) === 1,
          'N1 on real Chrome: during holdReason=tooMuchText and across agent->person->agent mode flip, foreign fetch() stays BlockedByClient (+1 dedup notice, 0 evil hits)',
          { lvHoldN1, ev1: ev1?.body, evPerson: evPerson?.body, evBackAgent: evBackAgent?.body, evilHits: evilPagesN1.received().length, noticeDelta: noticesAfterHoldN1 - noticesBeforeHoldN1 });

        // SHAPE S + THE PERSISTED HOLD on REAL Chrome (round 32, 主开发's ruling Q4 and the GO of 2026-11-15, amendment 1): AFTER A COLD
        // RESTART NO HOLD LIFTS UNCHECKED. Hub restart (watch down, the fill's memory cleared, a fresh LOCKED vault + logins) ⇒ the tab is
        // held WAITING FOR THE VAULT — its one sentence names the vault and the other tab, nothing typed in memory — and the page's foreign
        // fetch() is blocked; the vault is unlocked ⇒ the values come back by the row's names and the tab follows its KIND (here the
        // too-much-text hold the N1 leg left: the same hold, both doors named), still blocked.
        dN1.shutdown();
        LF.clearAllFilledSecrets();
        const engRestart = VE.create({ dataDir: w.VD, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false });
        const fyRestart = [];
        const loginsRestart = L.create({
          vault: engRestart,
          grants: () => w.grants,
          forYou: { add: (pid, it) => { fyRestart.push({ pid, it }); return 'fyr-' + fyRestart.length; }, resolve() {} },
          log: () => {},
        });
        const dRestart = D.create({
          keeper: w.subWatchKeeper, log: { warn() {}, log() {} },
          holdersOf: () => n1Holders, leaseCountOf: () => 1, logins: loginsRestart,
          forYou: { add: (pid, it) => { fyRestart.push({ pid, it }); return 'fyr-' + fyRestart.length; }, resolve() {} },
          wipeMaxScanPositions: 1024,
        });
        await dRestart.arm(w.prof.id);
        const lockedAtBoot = loginsRestart.isLocked();
        const lvLockedBoot = dRestart.liveFillVerdictFor({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { verb: 'eval', argv: ['eval', '1'] });
        const holdOf = () => { const lf = dRestart.liveFillOnTarget(w.prof.id, tHold.targetId); return lf ? { holdReason: lf.holdReason || '', typed: Array.isArray(lf.credSigs) ? lf.credSigs.length : -1 } : null; };
        const holdLocked = holdOf();
        pages.clear();
        await sendN1('Runtime.evaluate', { expression: "document.getElementById('hevil').click()" }, sidHold);
        const evPreUnlock = await until(() => pages.received().find((x) => x.path === '/done/hold-evil'), 6000);

        await engRestart.unlock(w.VPW);
        for (let i = 0; i < 100 && holdOf() && holdOf().holdReason === 'await_vault'; i++) await new Promise((r) => setTimeout(r, 30));   // (the vault's opening re-hydrates the names and checks the restored tab — asynchronously)
        const unlockedAfter = !loginsRestart.isLocked();
        const lvAfterUnlock = dRestart.liveFillVerdictFor({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { verb: 'eval', argv: ['eval', '1'] });
        const holdUnlocked = holdOf();
        const followsKind = Boolean(holdLocked && holdUnlocked && holdLocked.holdReason === 'await_vault' && holdLocked.typed === 0 && /too much text/.test(holdUnlocked.holdReason));
        pages.clear();
        await sendN1('Runtime.evaluate', { expression: "document.getElementById('hevil').click()" }, sidHold);
        const evPostUnlock = await until(() => pages.received().find((x) => x.path === '/done/hold-evil'), 6000);
        const wrongChangedNotice = fyRestart.some((x) => /login changed since filling/i.test(x.it?.text || ''));

        const twoDoorsAndBlock = (err) => /reload or navigate this tab/i.test(err || '')
          && /open or switch to another tab/i.test(err || '')
          && /cross-origin requests from this page are blocked/i.test(err || '');

        const awaitsVault = (err) => /checks this tab again once the vault is unlocked/i.test(err || '') && /open or switch to another tab/i.test(err || '');
        // 主开发's L2 (2026-11-15): a fence with no values blocks nothing it cannot match — before the unlock the page's own cross-origin
        // fetch() is NOT blocked (a page sending the value elsewhere by its own script is a said limit); once the vault opens and the
        // values are back, it is blocked again
        ok(lockedAtBoot === true && unlockedAfter === true
          && !lvLockedBoot.ok && awaitsVault(lvLockedBoot.error)
          && !lvAfterUnlock.ok && twoDoorsAndBlock(lvAfterUnlock.error)
          && evPreUnlock?.body?.ok !== false && evPostUnlock?.body?.ok === false
          && followsKind
          && evilPagesN1.received().length === 1 && wrongChangedNotice === false,
          'SHAPE S + the persisted hold on real Chrome: a cold restart holds the tab waiting for the vault (its sentence names the other tab first, then the vault; nothing typed in memory); with no values the page loads from other hosts (L2 — its own cross-origin fetch() passes: said); once the vault opens the tab follows its kind — the same too-much-text hold, both doors named — and the cross-origin fetch() is blocked again',
          { lockedAtBoot, unlockedAfter, holdLocked, holdUnlocked, followsKind, lvLockedBoot, lvAfterUnlock, evPreUnlock: evPreUnlock?.body, evPostUnlock: evPostUnlock?.body, evilHits: evilPagesN1.received().length, wrongChangedNotice });

        dRestart.shutdown();
        engRestart.close();
        wsN1.close();
      }
      await w.dialogs.arm(w.prof.id);

      // M1 on REAL Chrome: locked vault on wrong-origin tab (`EVIL`) refuses 423 [vault_locked] with ZERO CDP calls; invalid specs => HTTP 400 with 0 CDP calls!
      await run(['open', `${EVIL}/one`]);
      w.eng.lock();
      const cdpLocked0 = w.cdpSent.length;
      const lockedCli = await run(['fill', '#p', '--vault', `${SITE}#${USER}/password`]);
      const lockedHttpRes = await fetch(`${w.apiUrl}/api/agent/browser/fill-vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${w.token}` },
        body: JSON.stringify({ profile: w.prof.id, target: '#p', spec: `${SITE}#${USER}/password` }),
      });
      const lockedHttpJson = await lockedHttpRes.json();
      const cdpLockedDelta = w.cdpSent.length - cdpLocked0;
      ok(lockedCli.code === 1 && /\[vault_locked\]/.test(lockedCli.err)
        && lockedHttpRes.status === 423 && lockedHttpJson?.code === 'vault_locked'
        && cdpLockedDelta === 0,
        'M1 on real Chrome: locked vault on wrong-origin tab refuses 423 [vault_locked] across CLI and HTTP with ZERO CDP calls',
        { cliErr: lockedCli.err.trim(), httpStatus: lockedHttpRes.status, cdpLockedDelta });
      await w.eng.unlock(w.VPW);

      const cdpBad0 = w.cdpSent.length;
      const badHttp1 = await fetch(`${w.apiUrl}/api/agent/browser/fill-vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${w.token}` },
        body: JSON.stringify({ profile: w.prof.id, target: '#p', spec: `${SITE}#${USER}/user`, generate: true }),
      });
      const badHttp2 = await fetch(`${w.apiUrl}/api/agent/browser/fill-vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${w.token}` },
        body: JSON.stringify({ profile: w.prof.id, target: '#p', spec: `new:${SITE}#z/password`, generate: false }),
      });
      const cdpBadDelta = w.cdpSent.length - cdpBad0;
      ok(badHttp1.status === 400 && badHttp2.status === 400 && cdpBadDelta === 0,
        'M1 / Minor on real Chrome: invalid fill-vault spec shapes return HTTP 400 bad_request with ZERO CDP calls',
        { s1: badHttp1.status, s2: badHttp2.status, cdpBadDelta });

      // r26 Compulsory 2 + r27 Minor 1 on REAL Chrome: a continuously cross-site-jumping page (`SITE <-> EVIL_RAPID`),
      // 200 `fill --vault` requests against `#pw` (explicit lower bound `okOnShop >= 25`) PLUS a 200-request
      // fence-removed control (`BD_M12`: `myActiveFill` + `guardBeforeInsert` stripped) on the EXACT SAME `/rapid-jump` page
      // (`evilLandings === 0/200` with fence vs `evilLandings > 0` without fence under identical `insertDelayMs = 24`).
      const RAPID_INSERT_DELAY_MS = 24;
      const rapidInsertWS = (delayMs) => class extends WSBase {
        send(data, ...rest) {
          try {
            const m = JSON.parse(String(data));
            if (m && m.method === 'Input.insertText') {
              setTimeout(() => { try { super.send(data, ...rest); } catch {} }, delayMs);
              return;
            }
          } catch {}
          return super.send(data, ...rest);
        }
      };
      const enableTabFocusEmulation = async (urlPrefix) => {
        const epR = await w.kk.cdpEndpointFor(w.prof.id);
        const wsR = new WSBase(epR.url);
        await new Promise((r) => wsR.once('open', r));
        let seqR = 0;
        const pendR = new Map();
        wsR.on('message', (raw) => {
          try {
            const m = JSON.parse(String(raw));
            if (m && m.id && pendR.has(m.id)) { const fn = pendR.get(m.id); pendR.delete(m.id); fn(m); }
          } catch {}
        });
        const callR = (method, params = {}, sessionId = undefined) => new Promise((r) => {
          const id = ++seqR;
          pendR.set(id, r);
          wsR.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
        try {
          const tgts = await callR('Target.getTargets');
          const hit = (tgts?.result?.targetInfos || []).find((t) => t.type === 'page' && (String(t.url || '').startsWith(urlPrefix) || String(t.url || '').startsWith(EVIL_RAPID)));
          if (hit) {
            const att = await callR('Target.attachToTarget', { targetId: hit.targetId, flatten: true });
            const sid = att?.result?.sessionId;
            if (sid) {
              await callR('Emulation.setFocusEmulationEnabled', { enabled: true }, sid);
              await callR('Page.bringToFront', {}, sid);
            }
          }
        } finally {
          wsR.close();
        }
      };
      const runRapidJumpPass = async (tag, DialogsMod) => {
        pages.clear();
        evilPagesRapid.clear();
        pages.setStopBounce(false);
        evilPagesRapid.setStopBounce(false);
        w.dialogs.disarm(w.prof.id, `rapid-${tag}`);
        const dPass = DialogsMod.create({
          keeper: w.kk,
          WebSocketImpl: rapidInsertWS(RAPID_INSERT_DELAY_MS),
          log: { warn() {}, log() {} },
          leaseCountOf: () => 1,
          holdersOf: () => w.holdersRef.list,
          logins: w.logins,
          conversationOf: () => ({ cid: 'conv-1', name: 'Chat main' }),
        });
        await dPass.arm(w.prof.id);
        w.swapDialogs(dPass);
        const rapidUrl = `${SITE}/rapid-jump?evil=${encodeURIComponent(EVIL_RAPID)}&n=0`;
        await run(['open', `${SITE}/plain`]);
        const rapidTabRes = await run(['tab', 'new', rapidUrl]);
        const rapidTabIds = [...String(rapidTabRes.out || '').matchAll(/^\s*(t\d+)\b.*$/gm)].map((m) => ({ id: m[1], cur: /\[current\]/.test(m[0]) }));
        const rapidBackTabId = (rapidTabIds.find((x) => !x.cur) || { id: 't1' }).id;
        const rapidJumpTabId = (rapidTabIds.find((x) => x.cur) || { id: 't2' }).id;
        await enableTabFocusEmulation(`${SITE}/rapid-jump`);
        await until(() => evilPagesRapid.received().some((x) => x.path === '/rapid-catch'), 4000);
        let attempts = 0;
        let okCount = 0;
        let phishing = 0;
        let formChanged = 0;
        let missing = 0;
        let other = 0;
        for (let i = 0; i < 200; i++) {
          attempts++;
          const fr = await fetch(`${w.apiUrl}/api/agent/browser/fill-vault`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${w.token}` },
            body: JSON.stringify({ profile: w.prof.id, target: '#pw', spec: `${SITE}#${USER}/password` }),
          });
          const fj = await fr.json().catch(() => ({}));
          if (fr.status === 200 && fj?.ok) okCount++;
          else if (fj?.code === 'login_phishing') phishing++;
          else if (fj?.code === 'login_form_changed') formChanged++;
          else if (fj?.code === 'target_not_found') missing++;
          else other++;
          await sleep(10 + ((i * 7) % 13));
        }
        pages.setStopBounce(true);
        evilPagesRapid.setStopBounce(true);
        await sleep(160);
        await run(['tab', rapidBackTabId]);
        await run(['tab', 'close', rapidJumpTabId]);
        const shopHops = pages.received().filter((x) => x.path === '/rapid-jump').length;
        const evilHops = evilPagesRapid.received().filter((x) => x.path === '/rapid-catch').length;
        const evilCaught = evilPagesRapid.received().filter((x) => x.path === '/steal/rapid-caught');
        const leakedPw = foreignBodyLeakedSecret(evilPagesRapid.received(), PW);
        dPass.shutdown();
        evilPagesRapid.clear();
        console.log(`    [r27-rapid-jump:${tag}] attempts=${attempts} insertDelayMs=${RAPID_INSERT_DELAY_MS} evilLandings=${evilCaught.length}/200 okOnShop=${okCount} refusedPhishing=${phishing} refusedFormChanged=${formChanged} targetMissing=${missing} other=${other} shopHops=${shopHops} evilHops=${evilHops}`);
        return { attempts, evilLandings: evilCaught.length, leakedPw, okCount, phishing, formChanged, missing, other, shopHops, evilHops };
      };
      const rapidFenced = await runRapidJumpPass('fenced', D);
      const rapidUnfenced = await runRapidJumpPass('unfenced-control', BD_M12_SHARED);
      w.swapDialogs(w.dialogs);
      await w.dialogs.arm(w.prof.id);
      await run(['open', `${SITE}/plain`]);
      ok(rapidFenced.attempts === 200
        && rapidFenced.evilLandings === 0
        && !rapidFenced.leakedPw
        && rapidFenced.okCount >= 25
        && rapidFenced.shopHops >= 5
        && rapidFenced.evilHops >= 5
        && (rapidFenced.phishing + rapidFenced.formChanged) >= 1,
        `r26 Compulsory 2 + r27 Minor 1 (fenced): 200 fill --vault requests on /rapid-jump succeed >= 25 times on shop (okOnShop=${rapidFenced.okCount}) and land on foreign origin 0 / 200 times`,
        rapidFenced);
      ok(rapidUnfenced.attempts === 200
        && rapidUnfenced.okCount >= 25
        && rapidUnfenced.evilLandings > 0
        && rapidUnfenced.leakedPw === true,
        `r27 Minor 1 (unfenced control on SAME /rapid-jump page): stripping active-fill fence lands secret on foreign origin ${rapidUnfenced.evilLandings} / 200 times (> 0)`,
        rapidUnfenced);
    }

    console.log('⑤ Zero-secret & zero-digest sweep (memory/logs/CDP/disk) + 10 RED mutants on REAL Chrome');
    {
      const allSecrets = [w.VPW, PW, PW_BOB, PW_BOB_CHG1, PW_BOB_CHG2, PW_CAROL_1, PW_CAROL_2, SEED_B32];
      // Verify NO `Runtime.evaluate` sent by Hub ever carried any secret!
      const evalTexts = w.cdpSent.filter((c) => c.method === 'Runtime.evaluate' || c.method === 'Runtime.callFunctionOn').map((c) => c.text).join('\n');
      const evalLeaks = allSecrets.flatMap(secretNeedles).filter((n) => evalTexts.includes(n));
      ok(evalLeaks.length === 0, `zero secret/digest occurrences in ${w.cdpSent.length} Hub Runtime.evaluate/callFunctionOn payloads`, evalLeaks);

      const surfaces = {
        cli: cliTranscripts.join('\n'),
        hubLogs: w.logs.join('\n'),
        dialogTrace: JSON.stringify(w.traced),
        browserAudit: JSON.stringify(w.audited),
        vaultAudit: w.vaultAuditRaw(),
      };
      const surfHits = [];
      for (const [sName, txt] of Object.entries(surfaces)) {
        for (const sec of allSecrets) {
          for (const ndl of secretNeedles(sec)) if (String(txt).includes(ndl)) surfHits.push(`${sName}:${ndl.slice(0, 8)}`);
        }
      }
      ok(surfHits.length === 0, 'zero secret/digest occurrences across CLI stdout/stderr, hub logs, dialog trace, browser audit, and vault audit', surfHits);

      const diskFiles = [...walkFiles(w.VD), ...walkFiles(w.KD)];
      const diskHits = [];
      for (const f of diskFiles) {
        const raw = fs.readFileSync(f, 'utf8');
        for (const sec of allSecrets) {
          for (const ndl of secretNeedles(sec)) if (raw.includes(ndl)) diskHits.push(`${path.basename(f)}:${ndl.slice(0, 8)}`);
        }
      }
      ok(diskHits.length === 0, `RULING 5c / RULE 5′: zero raw/encoded/sha256/sha1/sha512 secret traces across ${diskFiles.length} hub data/vault files`, diskHits);

      // 10 Named RED Mutants against REAL Chrome (`origin-gate-removed`, `read-fence-removed`, `mask-wipe-removed`, `multipart-branch-removed`, `secretNames-without-rev`, `async-focus-seam`, `foreign-body-allow`, `n1-hold-relaxes-fetch`, `n2-snapshot-full-ax`, `n4-json-cap-open`)
      const lfSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8');
      const blSrc = fs.readFileSync(path.join(REPO, 'src/browser-login.js'), 'utf8');
      const bdSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
      const csSrc = fs.readFileSync(path.join(REPO, 'src/cdp-frame-scrub.js'), 'utf8');   // the credential scan (moved from browser-dialogs.js: the twin's worker, 主开发 r2445 — a browser-dialogs copy delegates to the REAL module)
      const veSrc = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');
      const LF_M1 = MUT.load('src/server/browser-login-fill.js', editAnchor(lfSrc, '  if (iso.origin !== wantOrigin) {', '  if (false && iso.origin !== wantOrigin) {', "src/server/browser-login-fill.js"), 'origin-gate-removed');
      const BL_M2 = MUT.load('src/browser-login.js', editAnchor(blSrc,
        "function liveFillVerdict({ verb = '', argv = [], batchVerbs = null, origin = '', holdReason = '' } = {}) {",
        "function liveFillVerdict() { return { ok: true }; }\nfunction _deadLiveFillVerdict({ verb = '', argv = [], batchVerbs = null, origin = '', holdReason = '' } = {}) {"
      , "src/browser-login.js"), 'read-fence-removed');
      const LF_M3 = MUT.load('src/server/browser-login-fill.js', editAnchor(editAnchor(lfSrc,
        "const wantSecretPw = Boolean(secret && slot !== 'otp');", 'const wantSecretPw = false;', "src/server/browser-login-fill.js", 'all'),
        'async function wipeTabTypedInputs(', 'async function wipeTabTypedInputs() { return { ok: true, wiped: 0 }; }\nasync function _deadWipeTabTypedInputs(', "src/server/browser-login-fill.js"),
      'mask-wipe-removed');
      const BD_M4 = MUT.load('src/cdp-frame-scrub.js', editAnchor(editAnchor(csSrc,
        "if (media.startsWith('multipart/') || (!media && /^--[^\\r\\n]{1,128}\\r?\\ncontent-disposition:/i.test(bodyText))) {", 'if (false) {', "src/cdp-frame-scrub.js"),
        "return { carries: false, undecodable: true, reason: `unsupported_content_type:${media || 'unknown'}` };", "return { carries: false, undecodable: false, reason: 'none' };", "src/cdp-frame-scrub.js"),
      'multipart-branch-removed');
      const VE_M5 = MUT.load('src/server/vault-engine.js', editAnchor(veSrc, ', ...(Number.isInteger(b.rev) && b.rev >= 1 ? { rev: b.rev } : {})', '', "src/server/vault-engine.js"), 'secretNames-without-rev');
      const LF_M8 = MUT.load('src/server/browser-login-fill.js', editAnchor(editAnchor(editAnchor(editAnchor(editAnchor(editAnchor(editAnchor(lfSrc,
        "if (typeof setTimeout === 'function') {", "if (false && typeof setTimeout === 'function') {", "src/server/browser-login-fill.js"),
        'try { node.inert = true; } catch {}', '/* inert prop disabled */', "src/server/browser-login-fill.js", 'all'),
        "try { if (node.setAttribute) node.setAttribute('inert', ''); } catch {}", '/* inert attr disabled */', "src/server/browser-login-fill.js", 'all'),
        "window.addEventListener('focusin', onTypingFocusGuard, true);", '/* focusin guard disabled */', "src/server/browser-login-fill.js"),
        "window.addEventListener('focus', onTypingFocusGuard, true);", '/* focus guard disabled */', "src/server/browser-login-fill.js"),
        "el.addEventListener('blur', onTargetBlurGuard, true);", '/* blur guard disabled */', "src/server/browser-login-fill.js"),
        "const ins = await send('Input.insertText', { text: val });", "await new Promise((r) => setTimeout(r, 25)); const ins = await send('Input.insertText', { text: val });", "src/server/browser-login-fill.js"),
      'async-focus-seam');
      const BD_M_EXFIL_ALLOW = MUT.load('src/server/browser-dialogs.js', editAnchor(bdSrc,
        'if (crossOrigin && (carries || undecodable)) {',
        'if (false && crossOrigin && (carries || undecodable)) {'
      , "src/server/browser-dialogs.js"), 'n5-foreign-body-allow');
      const BD_M_N1_HOLD = MUT.load('src/server/browser-dialogs.js', editAnchor(bdSrc,
        'const wantCred = Boolean(e.liveFill || e.credPreArming);',
        'const wantCred = Boolean((e.liveFill && !e.liveFill.holdReason) || e.credPreArming);'
      , "src/server/browser-dialogs.js"), 'n1-hold-relaxes-fetch');
      const BD_M_N2_AX = MUT.load('src/server/browser-dialogs.js', editAnchor(bdSrc,
        '      writeSnapshotRefs(w, e, specs, { seq, at });', // B-21cc (r2849): a NAMED note writes the tab's references here
        '      await call(w, \'Accessibility.getFullAXTree\', {}, e.sid);\n      writeSnapshotRefs(w, e, specs, { seq, at });'
      , "src/server/browser-dialogs.js"), 'n2-snapshot-full-ax');
      const BD_M_N4_CAP = MUT.load('src/cdp-frame-scrub.js', editAnchor(csSrc,
        "return { carries: false, undecodable: true, reason: 'json_too_many_nodes' };",
        "return { carries: false, undecodable: false, format: 'json' };"
      , "src/cdp-frame-scrub.js"), 'n4-json-cap-open');

      const ep = await w.kk.cdpEndpointFor(w.prof.id);
      const ws = new WSBase(ep.url);
      await new Promise((r) => ws.once('open', r));
      let seq = 0;
      const pend = new Map();
      const pausedListeners = [];
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        if (m.method === 'Fetch.requestPaused') {
          for (const fn of [...pausedListeners]) fn(m);
        }
        if (m.id && pend.has(m.id)) { const fn = pend.get(m.id); pend.delete(m.id); fn(m); }
      });
      const sendCdp = (method, params = {}, sessionId = undefined) => new Promise((resolve) => {
        const id = ++seq;
        pend.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
      const attachTabAt = async (wantUrl) => {
        const tInfo = await until(async () => {
          const r = await sendCdp('Target.getTargets');
          return (r.result?.targetInfos || []).find((t) => t.type === 'page' && t.url === wantUrl) || null;
        });
        const att = await sendCdp('Target.attachToTarget', { targetId: tInfo.targetId, flatten: true });
        return { tid: tInfo.targetId, sid: att.result.sessionId };
      };

      await run(['open', `${EVIL}/one`]);
      const evilAttach = await attachTabAt(`${EVIL}/one`);
      const realM1 = await LF.fillVaultElement({
        call: (m, p) => sendCdp(m, p, evilAttach.sid), browserCall: (m, p) => sendCdp(m, p),
        targetId: evilAttach.tid, trackedUrl: `${EVIL}/one`, origin: SITE, target: '#p', slot: 'current', value: 'Mut1#ChromeSecret', secret: true,
      });
      const mutM1 = await LF_M1.fillVaultElement({
        call: (m, p) => sendCdp(m, p, evilAttach.sid), browserCall: (m, p) => sendCdp(m, p),
        targetId: evilAttach.tid, trackedUrl: `${EVIL}/one`, origin: SITE, target: '#p', slot: 'current', value: 'Mut1#ChromeSecret', secret: true,
      });
      ok(!realM1.ok && realM1.code === 'login_phishing' && mutM1.ok === true,
        'MUTANT 1 RED on real Chrome (origin-gate-removed): real refuses cross-origin page [login_phishing]; mutant types secret into evil origin');

      const realM2 = BL.liveFillVerdict({ verb: 'eval', argv: ['eval', '1'], origin: SITE });
      const mutM2 = BL_M2.liveFillVerdict({ verb: 'eval', argv: ['eval', '1'], origin: SITE });
      ok(!realM2.ok && realM2.code === 'login_fill_live' && mutM2.ok === true,
        'MUTANT 2 RED (read-fence-removed): real blocks eval [login_fill_live]; mutant admits eval');

      await run(['open', `${SITE}/plain`]);
      const plainAttach = await attachTabAt(`${SITE}/plain`);
      const realM3 = await LF.fillVaultElement({
        call: (m, p) => sendCdp(m, p, plainAttach.sid), browserCall: (m, p) => sendCdp(m, p),
        targetId: plainAttach.tid, trackedUrl: `${SITE}/plain`, profileId: 'bp-mut3', origin: SITE, target: '#q', slot: 'current', value: 'Mut3#ChromePlain', secret: true,
      });
      const mutM3 = await LF_M3.fillVaultElement({
        call: (m, p) => sendCdp(m, p, plainAttach.sid), browserCall: (m, p) => sendCdp(m, p),
        targetId: plainAttach.tid, trackedUrl: `${SITE}/plain`, profileId: 'bp-mut3', origin: SITE, target: '#q', slot: 'current', value: 'Mut3#ChromePlain', secret: true,
      });
      await LF_M3.wipeTabTypedInputs({ call: (m, p) => sendCdp(m, p, plainAttach.sid), browserCall: (m, p) => sendCdp(m, p), targetId: plainAttach.tid, profileId: 'bp-mut3' });
      const plainLeft = await sendCdp('Runtime.evaluate', { expression: "document.getElementById('q').value", returnByValue: true }, plainAttach.sid);
      ok(!realM3.ok && realM3.code === 'login_bad_field' && mutM3.ok === true && plainLeft.result?.result?.value === 'Mut3#ChromePlain',
        'MUTANT 3 RED on real Chrome (mask-wipe-removed): real refuses <input type="text"> [login_bad_field]; mutant types into plain text and leaves it unwiped');

      // MUTANT 4 (L1 multipart-branch-removed) against real Chrome's FormData wire payload
      const exfilUrl = `${SITE}/exfil-matrix?dest=${encodeURIComponent(EVIL)}`;
      await run(['open', exfilUrl]);
      const exfilAttach = await attachTabAt(exfilUrl);
      await sendCdp('Network.enable', { maxPostDataSize: 65536 }, exfilAttach.sid);
      await sendCdp('Fetch.enable', { patterns: [{ urlPattern: `${EVIL}/steal/multipart*`, requestStage: 'Request' }] }, exfilAttach.sid);
      const mpPausedP = new Promise((resolve) => {
        const fn = (m) => {
          if (m.sessionId === exfilAttach.sid && String(m.params?.request?.url || '').includes('/steal/multipart')) {
            const idx = pausedListeners.indexOf(fn); if (idx >= 0) pausedListeners.splice(idx, 1);
            resolve(m.params);
          }
        };
        pausedListeners.push(fn);
      });
      const m4Sentinel = 'Mut4#ChromeFormData77';
      await sendCdp('Runtime.evaluate', {
        expression: `document.getElementById('ep').value = ${JSON.stringify(m4Sentinel)}; document.getElementById('x-multipart').click();`,
      }, exfilAttach.sid);
      const mpPaused = await Promise.race([mpPausedP, sleep(4000).then(() => null)]);
      if (mpPaused) await sendCdp('Fetch.failRequest', { requestId: mpPaused.requestId, errorReason: 'BlockedByClient' }, exfilAttach.sid);
      await sendCdp('Fetch.disable', {}, exfilAttach.sid);
      const mpHdrs = mpPaused?.request?.headers || {};
      const mpCtKey = Object.keys(mpHdrs).find((k) => k.toLowerCase() === 'content-type');
      const mpCt = mpCtKey ? mpHdrs[mpCtKey] : '';
      const mpPostData = String(mpPaused?.request?.postData || '');
      const realM4 = D.bodyCarriesCredential(mpPostData, [D.credSigOf(m4Sentinel)], mpCt);
      const mutM4 = BD_M4.bodyCarriesCredential(mpPostData, [BD_M4.credSigOf(m4Sentinel)], mpCt);
      ok(Boolean(mpPaused) && realM4 === true && mutM4 === false,
        'MUTANT 4 RED on real Chrome (L1 multipart-branch-removed): real detector catches Chrome FormData multipart wire body; mutant lets it pass',
        { mpCt, hasPost: mpPostData.length > 0, realM4, mutM4 });

      // MUTANT 5 (L2 secretNames-without-rev) clicked in real Chrome against Vault-window bundle
      {
        const dirM5 = path.join(ROOT, 'mut5-vault');
        fs.mkdirSync(dirM5, { recursive: true });
        const engM5 = VE_M5.create({ dataDir: dirM5, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false });
        await engM5.setup('Mut5#VaultPass');
        const gM5 = GS.create({ memory: true });
        const logM5 = L.create({ vault: engM5, grants: () => gM5, log: () => {} });
        logM5.addOwn({ origin: SITE, username: 'mut5bob', password: 'InitMut5!Password9' }, { who: 'owner' });
        logM5.grant(`web-login:${SITE}#mut5bob`, 'any-account', 'session:conv-m5');
        logM5.resolveFill({ tabOrigin: SITE, spec: `${SITE}#mut5bob/password`, generate: true, facts: { conversationKeys: ['conv-m5'] } });
        const appM5 = express(); appM5.use(express.json());
        let confirmResultsM5 = [];
        appM5.use('/api/vault/web-logins/confirm', (req, res, next) => {
          res.once('finish', () => confirmResultsM5.push({ status: res.statusCode, rev: req.body?.rev }));
          next();
        });
        VRm.registerVaultRoutes(appM5, { vault: engM5, logins: logM5, who: () => 'owner', log: () => {} });
        appM5.get('/vault-ui-test', (_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(VAULT_UI_HTML); });
        const srvM5 = http.createServer(appM5);
        const portM5 = await freePort();
        await new Promise((r) => srvM5.listen(portM5, '127.0.0.1', r));
        try {
          await run(['open', `http://127.0.0.1:${portM5}/vault-ui-test`]);
          await until(async () => (await w.cli(['eval', "Boolean(document.querySelector('div[data-user=\"mut5bob\"] .vw-login-confirm'))"])).out.trim() === 'true');
          await run(['click', 'div[data-user="mut5bob"] .vw-login-confirm']);
          await until(() => confirmResultsM5.length >= 1, 4000);
          const recAfterM5 = BL.recordOf(engM5.secretGet(BL.entryName(SITE, 'mut5bob')).value.toString('utf8'));
          ok(confirmResultsM5.length >= 1 && confirmResultsM5[0].rev === 1 && confirmResultsM5[0].status === 409 && recAfterM5?.pending?.kind === 'change',
            'MUTANT 5 RED on real Chrome (L2 secretNames-without-rev): clicking .vw-login-confirm posts stale rev=1 and fails 409 card_changed',
            { confirmResultsM5, pendingAfter: recAfterM5?.pending?.kind });
        } finally {
          engM5.close();
          await new Promise((r) => { srvM5.close(() => r()); srvM5.closeAllConnections(); });
        }
      }

      // N5 post-prepare macrotask (`post-prepare` & `post-replace`) on REAL Chrome with 25 ms pre-insert delay + MUTANT 8 RED
      const hjPostPrepUrl = `${SITE}/hijack-async?mode=post-prepare`;
      const hjPostRepUrl = `${SITE}/hijack-async?mode=post-replace`;
      const makeDelayedSend = (sid) => async (m, p) => {
        if (m === 'Input.insertText') await sleep(25);
        return sendCdp(m, p, sid);
      };
      await run(['open', `${SITE}/plain`]);
      await run(['open', hjPostPrepUrl]);
      const hjPost1 = await attachTabAt(hjPostPrepUrl);
      await sendCdp('Emulation.setFocusEmulationEnabled', { enabled: true }, hjPost1.sid);
      await sendCdp('Page.bringToFront', {}, hjPost1.sid);
      const realPostPrep = await LF.fillVaultElement({
        call: makeDelayedSend(hjPost1.sid), browserCall: (m, p) => sendCdp(m, p),
        targetId: hjPost1.tid, trackedUrl: hjPostPrepUrl, origin: SITE, target: '#trap', slot: 'current', value: 'N5#PostPrepareReal', secret: true,
      });
      const realPostPrepLog = await sendCdp('Runtime.evaluate', { expression: 'window.__decoyLog.length', returnByValue: true }, hjPost1.sid);

      await run(['open', `${SITE}/plain`]);
      await run(['open', hjPostRepUrl]);
      const hjPost2 = await attachTabAt(hjPostRepUrl);
      await sendCdp('Emulation.setFocusEmulationEnabled', { enabled: true }, hjPost2.sid);
      await sendCdp('Page.bringToFront', {}, hjPost2.sid);
      const realPostRep = await LF.fillVaultElement({
        call: makeDelayedSend(hjPost2.sid), browserCall: (m, p) => sendCdp(m, p),
        targetId: hjPostRepUrl ? hjPost2.tid : hjPost2.tid, trackedUrl: hjPostRepUrl, origin: SITE, target: '#trap', slot: 'current', value: 'N5#PostReplaceReal', secret: true,
      });
      const realPostRepLog = await sendCdp('Runtime.evaluate', { expression: 'window.__decoyLog.length', returnByValue: true }, hjPost2.sid);
      ok(!realPostPrep.ok && realPostPrep.code === 'login_form_changed' && realPostPrepLog.result?.result?.value === 0
        && !realPostRep.ok && realPostRep.code === 'login_form_changed' && realPostRepLog.result?.result?.value === 0,
        'N5 on real Chrome: post-prepare macrotask focus/click/select/strip-inert and node-replace attacks refuse [login_form_changed] with 0 decoy chars/events across 25 ms pre-insert seam',
        { prepCode: realPostPrep.code, prepEvents: realPostPrepLog.result?.result?.value, repCode: realPostRep.code, repEvents: realPostRepLog.result?.result?.value });

      // MUTANT 8 (L5+N5 async/post-prepare focus-seam) on real Chrome `/hijack-async?mode=post-prepare`
      await run(['open', `${SITE}/plain`]);
      await run(['open', hjPostPrepUrl]);
      const hjAttach2 = await attachTabAt(hjPostPrepUrl);
      await sendCdp('Emulation.setFocusEmulationEnabled', { enabled: true }, hjAttach2.sid);
      await sendCdp('Page.bringToFront', {}, hjAttach2.sid);
      const mutM8 = await LF_M8.fillVaultElement({
        call: (m, p) => sendCdp(m, p, hjAttach2.sid), browserCall: (m, p) => sendCdp(m, p),
        targetId: hjAttach2.tid, trackedUrl: hjPostPrepUrl, origin: SITE, target: '#trap', slot: 'current', value: 'Mut8#ChromeAsyncSeam', secret: true,
      });
      const mutM8Log = await sendCdp('Runtime.evaluate', { expression: 'window.__decoyLog.length', returnByValue: true }, hjAttach2.sid);
      ok((mutM8Log.result?.result?.value ?? 0) >= 1,
        'MUTANT 8 RED on real Chrome (L5+N5 async-focus-seam): without inert + capture focus/blur guards, secret leaks into decoy across async seam',
        { mutCode: mutM8.code, mutEvents: mutM8Log.result?.result?.value });

      // MUTANT 7 / N5 foreign-body allow mutant on real Chrome (`/exfil?dest=EVIL`): proves `foreignBodyLeakedSecret` goes RED!
      w.dialogs.disarm(w.prof.id, 'mut-r24-chrome');
      {
        evilPages.clear();
        pages.clear();
        const exUrl = `${SITE}/exfil?dest=${encodeURIComponent(EVIL)}`;
        await run(['open', exUrl]);
        w.dialogs.disarm(w.prof.id, 'mut-exfil-allow');
        const dAllow = BD_M_EXFIL_ALLOW.create({
          keeper: w.subWatchKeeper, log: { warn() {}, log() {} },
          holdersOf: () => w.holdersRef.list, leaseCountOf: () => 1, logins: w.logins,
        });
        await dAllow.arm(w.prof.id);
        const exAtt = await attachTabAt(exUrl);
        dAllow.noteActiveTab({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, exAtt.tid);
        await dAllow.fillVaultField({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, {
          target: '#ep', spec: `${SITE}#${USER}/password`, facts: { conversationKeys: ['conv-1'] },
        });
        await sendCdp('Runtime.evaluate', { expression: "document.getElementById('ego').click()" }, exAtt.sid);
        await until(() => evilPages.received().length >= 1, 6000);
        const leakedRed = foreignBodyLeakedSecret(evilPages.received(), PW);
        ok(leakedRed === true,
          'MUTANT 7 RED on real Chrome (N5 foreign-body-allow): intentional pass-through mutant trips foreignBodyLeakedSecret === true on evilPages .raw',
          { evilCount: evilPages.received().length, leakedRed });
        dAllow.shutdown();
        evilPages.clear();
      }

      // MUTANT 8b (N1 hold relaxes `wantCred`) on real Chrome (`/hold-large?dest=EVIL_N1`)
      {
        evilPagesN1.clear();
        pages.clear();
        const hlUrl = `${SITE}/hold-large?dest=${encodeURIComponent(EVIL_N1)}`;
        await run(['open', hlUrl]);
        w.dialogs.disarm(w.prof.id, 'mut-n1-hold');
        const dM10 = BD_M_N1_HOLD.create({
          keeper: w.subWatchKeeper, log: { warn() {}, log() {} },
          holdersOf: () => w.holdersRef.list, leaseCountOf: () => 1, logins: w.logins, wipeMaxScanPositions: 1024,
        });
        await dM10.arm(w.prof.id);
        const hlAtt = await attachTabAt(hlUrl);
        dM10.noteActiveTab({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, hlAtt.tid);
        await dM10.fillVaultField({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, {
          target: '#hp', spec: `${SITE}#${USER}/password`, facts: { conversationKeys: ['conv-1'] },
        });
        await sendCdp('Runtime.evaluate', { expression: "document.getElementById('hsame').click()" }, hlAtt.sid);
        await until(() => {
          const lv = dM10.liveFillVerdictFor({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { verb: 'eval', argv: ['eval', '1'] });
          return lv && /too much text/i.test(lv.error || '') ? lv : null;
        }, 6000);
        await sendCdp('Runtime.evaluate', { expression: "document.getElementById('hevil').click()" }, hlAtt.sid);
        await until(() => evilPagesN1.received().length >= 1, 6000);
        ok(evilPagesN1.received().length >= 1 && foreignBodyLeakedSecret(evilPagesN1.received(), PW) === true,
          'MUTANT 9 RED on real Chrome (N1 hold-relaxes-fetch): relaxing wantCred on holdReason lets foreign fetch() exfiltrate PW to evilPages',
          { evilCount: evilPagesN1.received().length });
        dM10.shutdown();
        evilPagesN1.clear();
      }

      // MUTANT 9b (N2 `noteSnapshot` sends `Accessibility.getFullAXTree` over watch socket on 3,000-row page -> 1009 watch drop!)
      {
        const tbUrl = `${SITE}/table-large?rows=3000`;
        await run(['open', tbUrl]);
        w.dialogs.disarm(w.prof.id, 'mut-n2-ax');
        const m12Sent = [], m12Evs = [];
        const dM12 = BD_M_N2_AX.create({
          keeper: w.subWatchKeeper, WebSocketImpl: countingWS(m12Sent), log: { warn() {}, log() {} },
          holdersOf: () => w.holdersRef.list, leaseCountOf: () => 1, logins: w.logins,
        });
        dM12.onChange((ev) => m12Evs.push(ev));
        await dM12.arm(w.prof.id);
        const tbAtt = await attachTabAt(tbUrl);
        await dM12.noteSnapshot({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { parsedRefs: [{ ref: '@e1', role: 'textbox', name: 'row 0', nth: 0 }], targetId: tbAtt.tid });
        await until(() => m12Evs.some((x) => x.kind === 'down'), 6000);
        const ax12 = m12Sent.filter((c) => c.method === 'Accessibility.getFullAXTree').length;
        const down12 = m12Evs.some((x) => x.kind === 'down');
        ok(ax12 >= 1 && down12 === true,
          'MUTANT 10 RED on real Chrome (N2 snapshot-full-ax): getFullAXTree over watch socket on 3,000-row table drops watch with 1009',
          { ax12, down12 });
        dM12.shutdown();
      }

      // MUTANT 10b (N4 `json_too_many_nodes` fails open)
      {
        const bigJson = JSON.stringify(Array.from({ length: D.SCAN_LIMITS.maxJsonNodes + 5 }, () => 0));
        const realCap = D.inspectRequestBody(bigJson, [D.credSigOf(PW)], 'application/json', { hasPostData: true });
        const mutCap = BD_M_N4_CAP.inspectRequestBody(bigJson, [BD_M_N4_CAP.credSigOf(PW)], 'application/json', { hasPostData: true });
        ok(realCap.undecodable === true && mutCap.undecodable === false,
          'MUTANT 11 RED (N4 json-cap-open): real fails closed at >4096 JSON nodes; mutant answers undecodable:false',
          { realCap, mutCap });
      }

      // MUTANT 12 RED on real Chrome (r26 Compulsory 2 `active-fill-fence-removed`):
      // When `#pw` focuses during `armAndPrepareTargetExpr` and jumps cross-origin (`mode=focus-jump`),
      // real `r26` holds the cross-origin Document navigation in `Fetch` across a 120 ms pre-insert socket delay (0 foreign landings),
      // whereas stripping `myActiveFill` + `guardBeforeInsert` (`r25` shape) types the secret into `EVIL_RAPID`!
      {
        const BD_M12 = BD_M12_SHARED;
        const delayInsertWS = () => class extends WSBase {
          send(data, ...rest) {
            try {
              const m = JSON.parse(String(data));
              if (m && m.method === 'Input.insertText') {
                setTimeout(() => { try { super.send(data, ...rest); } catch {} }, 120);
                return;
              }
            } catch {}
            return super.send(data, ...rest);
          }
        };
        const dirM12 = path.join(ROOT, 'mut12-vault');
        fs.mkdirSync(dirM12, { recursive: true });
        const engM12 = VE.create({ dataDir: dirM12, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false });
        await engM12.setup('Mut12#VaultPass');
        const gM12 = GS.create({ memory: true });
        const logM12 = L.create({ vault: engM12, grants: () => gM12, log: () => {} });
        const m12Secret = 'Mut12#CrossOriginJump9';
        logM12.addOwn({ origin: SITE, username: 'm12user', password: m12Secret }, { who: 'owner' });
        logM12.grant(`web-login:${SITE}#m12user`, 'any-account', 'session:conv-m12');
        pages.setStopBounce(false);
        evilPagesRapid.setStopBounce(false);
        const focusJumpUrl = `${SITE}/rapid-jump?evil=${encodeURIComponent(EVIL_RAPID)}&mode=focus-jump&n=1`;

        // Real r26 under 120 ms pre-insert delay: 0 landings on EVIL_RAPID
        evilPagesRapid.clear();
        await run(['open', `${SITE}/plain`]);
        await run(['open', focusJumpUrl]);
        w.dialogs.disarm(w.prof.id, 'mut12-real');
        const dReal12 = D.create({
          keeper: w.subWatchKeeper, WebSocketImpl: delayInsertWS(), log: { warn() {}, log() {} },
          holdersOf: () => w.holdersRef.list, leaseCountOf: () => 1, logins: logM12,
        });
        await dReal12.arm(w.prof.id);
        const fjAttReal = await attachTabAt(focusJumpUrl);
        await sendCdp('Emulation.setFocusEmulationEnabled', { enabled: true }, fjAttReal.sid);
        await sendCdp('Page.bringToFront', {}, fjAttReal.sid);
        dReal12.noteActiveTab({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, fjAttReal.tid);
        await dReal12.fillVaultField({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, {
          target: '#pw', spec: `${SITE}#m12user/password`, facts: { conversationKeys: ['conv-m12'] },
        });
        await sleep(100);
        const realM12Caught = evilPagesRapid.received().filter((x) => x.path === '/steal/rapid-caught');
        dReal12.shutdown();

        // Mutant 12 (r25 without activeFill / guardBeforeInsert) under the same 120 ms pre-insert delay: lands on EVIL_RAPID!
        evilPagesRapid.clear();
        await run(['open', `${SITE}/plain`]);
        await run(['open', focusJumpUrl]);
        const dMut12 = BD_M12.create({
          keeper: w.subWatchKeeper, WebSocketImpl: delayInsertWS(), log: { warn() {}, log() {} },
          holdersOf: () => w.holdersRef.list, leaseCountOf: () => 1, logins: logM12,
        });
        await dMut12.arm(w.prof.id);
        const fjAttMut = await attachTabAt(focusJumpUrl);
        await sendCdp('Emulation.setFocusEmulationEnabled', { enabled: true }, fjAttMut.sid);
        await sendCdp('Page.bringToFront', {}, fjAttMut.sid);
        dMut12.noteActiveTab({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, fjAttMut.tid);
        await dMut12.fillVaultField({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, {
          target: '#pw', spec: `${SITE}#m12user/password`, facts: { conversationKeys: ['conv-m12'] },
        });
        await until(() => evilPagesRapid.received().some((x) => x.path === '/steal/rapid-caught'), 3000);
        const mutM12Caught = evilPagesRapid.received().filter((x) => x.path === '/steal/rapid-caught');
        pages.setStopBounce(true);
        evilPagesRapid.setStopBounce(true);
        dMut12.shutdown();
        engM12.close();
        evilPagesRapid.clear();
        ok(realM12Caught.length === 0 && mutM12Caught.length >= 1 && JSON.stringify(mutM12Caught).includes(m12Secret),
          'MUTANT 12 RED on real Chrome (r26 active-fill-fence-removed): real holds cross-origin jump during prepare->insertText (0 foreign landings); r25 mutant types password into foreign origin',
          { realCaught: realM12Caught.length, mutCaught: mutM12Caught });
      }
      await w.dialogs.arm(w.prof.id);

      LF.clearAllFilledSecrets();
      LF_M1.clearAllFilledSecrets();
      LF_M3.clearAllFilledSecrets();
      LF_M8.clearAllFilledSecrets();
      ws.close();

      for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 11 })) {
        ok(r.pass, 'mutant-copy census: ' + r.name, r.pass ? undefined : r.detail);
      }

      // THE READERS' SIXTEEN SCENES (主开发's real-browser claim, 2026-11-15): what real Chrome does where the fake kernel assumed it
      // — the document id, the fragment, the title's timing, a GET form's order of events, the wrapped session, a busy tab, the
      // back-forward cache — on the suite's own scratch browser, with pages of the scenes' own loopback server.
      console.log('  — the readers\' scenes on real Chrome:');
      const { runReadersScenes } = await import('./fixtures/vl-chrome-scenes.mjs');
      await runReadersScenes({ w, ok, D, L, VE, LF, WSBase, until });
      await w.dialogs.arm(w.prof.id);
    }

    await w.close();
  }
} finally {
  await pages.close();
  await evilPages.close();
  await evilPagesN4.close();
  await evilPagesN1.close();
  await evilPagesRapid.close();
  cleanup();
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
