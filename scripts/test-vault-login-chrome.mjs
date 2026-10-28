#!/usr/bin/env node
// test-vault-login-chrome — lane vault-login-chrome / vault-login-fill (heavy, run ALONE, D-Bus unset):
// On standard Chrome (`chromium` provider, `w.kernel === false`), `vibespace-browser login [<origin>] [--user <name>] [--submit]`
// inspects the current tab's form read-only (`src/server/browser-login-fill.js`, never reading `.value`) and types the vault
// login's secret values from the hub over CDP (`Input.insertText` + prototype value tracker support + `.value` getter mask):
//   ① RED baseline control (6428c67e's `!loginSinks(w)` guard) answers `login_no_form` on `/one`; `/plain` (a search box) answers
//     `login_no_form` on the real tree.
//   ② One-step form (`/one`): ungranted ⇒ `login_not_granted`; granted `login` (no `--submit`) fills username + password (`step:
//     'password'`), `snapshot` shows `••••`, `screenshot` renders masked dots (0 bytes of PW), `get value #p` and `eval
//     document.querySelector('#p').value` return `••••••••`; `login --submit --json` submits the real password to `/done/one`
//     and returns `{filled, step:'password', submitted:true, receipt}`.
//   ③ Google-like multi-step form (`/two` → `/two/challenge/pwd` → `/totp`) with a paired two-step entry:
//     step 1 fills only the email (`step: 'email'`), step 2 fills only the password (`step: 'password'`), step 3 computes and
//     fills the 6-digit TOTP code (`step: 'totp'`, ONE `vault-totp-use` line `via: 'browser-login'`).
//   ④ React/Closure controlled form (`/react`, `VALUE_TRACKER`): `login --submit` fills and submits the real credentials.
//   ⑤ R4 ZERO-LEAKAGE SWEEP across every output surface (CLI stdout/stderr, snapshot, get value, eval, hub logs, dialog trace,
//     browser audit, vault-audit.jsonl) + RED mutant control that leaks the password onto an output surface and is caught by the
//     same sweep function.
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
  const close = async () => { dialogs.shutdown(); kk.shutdown(); eng.close(); await new Promise((r) => srv.close(() => r())); };
  return { kk, prof, eng, grants, totp, logins, dialogs, cli, logs, traced, audited, vaultAuditRaw, vaultAudit, close };
}

try {
  ok(!('DBUS_SESSION_BUS_ADDRESS' in BASE_ENV), 'D-Bus session bus address is unset in the heavy suite environment');
  let w;
  try { w = await world('main'); } catch (e) { skip(`the keeper could not launch Chrome here: ${e && e.message}`); w = null; }
  if (w) {
    const SITE = pages.origin;
    const USER = 'alice@example.test';
    const PW = pwOf('chrome-pw');
    const SEED_BYTES = crypto.randomBytes(20);
    const SEED_B32 = T.base32Encode(SEED_BYTES);
    const cliTranscripts = [];
    const run = async (args) => { const r = await w.cli(args); cliTranscripts.push(`${args.join(' ')}\nOUT:${r.out}\nERR:${r.err}`); return r; };

    console.log('① RED baseline control (6428c67e) + /plain non-login page');
    {
      const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
      const anchor = 'if (w.kernel && !loginSinks(w))';
      const oldD = dsrc.replace(anchor, 'if (!loginSinks(w))');
      ok(oldD !== dsrc, 'control anchor found in src/server/browser-dialogs.js');
      const D6428 = MUT.load('src/server/browser-dialogs.js', oldD, 'base6428');
      let r = await run(['open', `${SITE}/one`]);
      ok(r.code === 0, 'opened loopback /one in real Chrome', r);
      ok(w.dialogs.kernelFactOf(w.prof.id) === false, 'watch probed VibeSpace.getVersion and recorded standard Chrome (kernelFactOf === false)');
      // Evaluate the 6428c67e watch copy over the same live Chrome endpoint
      const wOld = D6428.create({
        keeper: { cdpEndpointFor: (pid) => w.kk.cdpEndpointFor(pid), onLease: () => () => { } },
        log: { warn() { }, log() { } }, logins: w.logins, holdersOf: () => [{ browserKey: 'bk-0000f1a1', sessionId: 'sess-main' }],
      });
      await wOld.arm(w.prof.id);
      const redRes = await wOld.fillLogin({ profileId: w.prof.id, browserKey: 'bk-0000f1a1' }, { origin: SITE });
      wOld.shutdown();
      ok(!redRes.ok && redRes.code === 'login_no_form' && /standard Chrome/.test(redRes.error), 'RED on 6428c67e: standard Chrome answers login_no_form before our hub-side reader', redRes);

      r = await run(['open', `${SITE}/plain`]);
      const rp = await run(['login']);
      ok(r.code === 0 && rp.code === 1 && /\[login_no_form\]/.test(rp.err), 'a non-login page (/plain with a Search input) ⇒ [login_no_form]', rp);
    }

    console.log('② One-step form (/one): grant check → fill (no submit) → masked snapshot / get value / eval → fill --submit');
    {
      ok(w.totp.addEntry({ seed: SEED_B32, name: 'google-like' }, { who: 'owner' }).ok, 'owner sealed a two-step TOTP entry in the vault');
      ok(w.logins.addOwn({ origin: SITE, username: USER, password: PW, totpName: 'google-like' }).ok, 'owner sealed the web login paired with the two-step entry');
      await run(['open', `${SITE}/one`]);
      let r = await run(['login']);
      ok(r.code === 1 && /\[login_not_granted\]/.test(r.err), 'before grant ⇒ exit 1 [login_not_granted]', r);
      ok(w.logins.grant(`web-login:${SITE}#${USER}`, 'this-account', 'session:conv-1').ok, 'owner granted the login to this conversation');

      pages.clear();
      r = await run(['login']);
      ok(r.code === 0 && /Filled the user name and the password/.test(r.out) && /NOT submitted/.test(r.out) && /Step: password\./.test(r.out) && /Receipt vr-[0-9a-f]{12}\./.test(r.out) && pages.received().length === 0,
        'login without --submit fills username + password (Step: password) and does NOT submit the form', r);

      const snap = await run(['snapshot']);
      ok(snap.code === 0 && snap.out.includes('••••') && !snap.out.includes(PW), 'snapshot of the filled password field shows •••• and never the password', snap.out);
      const shotPath = path.join(ROOT, 'main', 'one-filled.png');
      const shot = await run(['screenshot', shotPath]);
      const shotBytes = fs.existsSync(shotPath) ? fs.readFileSync(shotPath) : Buffer.alloc(0);
      ok(shot.code === 0 && shotBytes.length > 100 && !shotBytes.includes(Buffer.from(PW, 'utf8')),
        'screenshot of the filled password field renders a PNG with 0 occurrences of the password bytes', { code: shot.code, bytes: shotBytes.length, err: shot.err });
      const gv = await run(['get', 'value', '#p']);
      const ev = await run(['eval', 'document.querySelector("#p").value']);
      ok(gv.code === 0 && gv.out.trim() === LF.MASK && ev.code === 0 && ev.out.includes(LF.MASK) && !gv.out.includes(PW) && !ev.out.includes(PW),
        'get value #p and eval document.querySelector("#p").value return masked •••••••• (never the password)', { gv: gv.out, ev: ev.out });

      r = await run(['login', SITE, '--user', USER, '--submit', '--json']);
      const j = (() => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return null; } })();
      const gotOne = await until(() => pages.received().find((x) => x.path === '/done/one'), 4000);
      ok(r.code === 0 && j && j.success && eq(j.data.filled, ['username', 'password']) && j.data.step === 'password' && j.data.submitted === true && /^vr-[0-9a-f]{12}$/.test(j.data.receipt) && gotOne && gotOne.body.username === USER && gotOne.body.password === PW,
        'login --submit --json submits the real username + password to /done/one and returns {filled, step:"password", submitted:true, receipt}', { j, gotOne });
    }

    console.log('③ Google-like multi-step form (/two → /two/challenge/pwd → /totp): email step → password step → TOTP step');
    {
      pages.clear();
      await run(['open', `${SITE}/two`]);
      // Step 1: email / identifier
      const r1 = await run(['login', '--submit', '--json']);
      const j1 = (() => { try { return JSON.parse(r1.out.trim().split('\n').pop()); } catch { return null; } })();
      const seenId = await until(() => pages.received().find((x) => x.path === '/seen/two-id'), 4000);
      ok(r1.code === 0 && j1 && j1.success && eq(j1.data.filled, ['username']) && j1.data.step === 'email' && j1.data.submitted === true && seenId && seenId.body.identifier === USER,
        'step 1 (/two): fills ONLY the visible email field (step:"email") and clicks Next', { j1, seenId });

      // Step 2: password (now visible under /two/challenge/pwd)
      const r2 = await run(['login', '--submit', '--json']);
      const j2 = (() => { try { return JSON.parse(r2.out.trim().split('\n').pop()); } catch { return null; } })();
      const doneTwo = await until(() => pages.received().find((x) => x.path === '/done/two'), 4000);
      ok(r2.code === 0 && j2 && j2.success && eq(j2.data.filled, ['password']) && j2.data.step === 'password' && j2.data.submitted === true && doneTwo && doneTwo.body.identifier === USER && doneTwo.body.Passwd === PW,
        'step 2 (/two/challenge/pwd): fills ONLY the visible password field (step:"password") and submits to /totp', { j2, doneTwo: doneTwo && { ...doneTwo, body: { ...doneTwo.body, Passwd: '<ok>' } } });

      // Wait for navigation to /totp to settle
      await until(async () => { const u = await w.cli(['get', 'url']); return /\/totp\b/.test(u.out); }, 4000);
      const r3 = await run(['login', '--submit', '--json']);
      const j3 = (() => { try { return JSON.parse(r3.out.trim().split('\n').pop()); } catch { return null; } })();
      const doneTotp = await until(() => pages.received().find((x) => x.path === '/done/totp'), 4000);
      ok(r3.code === 0 && j3 && j3.success && eq(j3.data.filled, ['otp']) && j3.data.step === 'totp' && j3.data.submitted === true && doneTotp && /^\d{6}$/.test(String(doneTotp.body.code || '')),
        'step 3 (/totp): computes and fills the 6-digit TOTP code (step:"totp") and advances to /welcome', { j3, codeLen: doneTotp && String(doneTotp.body.code || '').length });

      const totpUses = w.vaultAudit().filter((l) => l.event === 'vault-totp-use');
      ok(totpUses.length === 1 && totpUses[0].via === 'browser-login' && totpUses[0].ok === true,
        'vault-totp-use audit row recorded once (on the /totp step only) with via:"browser-login"', totpUses);
    }

    console.log('④ Controlled React/Closure form (/react, VALUE_TRACKER)');
    {
      pages.clear();
      await run(['open', `${SITE}/react`]);
      const r = await run(['login', '--submit', '--json']);
      const j = (() => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return null; } })();
      const doneReact = await until(() => pages.received().find((x) => x.path === '/done/react'), 4000);
      ok(r.code === 0 && j && j.success && eq(j.data.filled, ['username', 'password']) && j.data.step === 'password' && j.data.submitted === true && doneReact && doneReact.body.username === USER && doneReact.body.password === PW,
        'controlled input (/react): prototype clear + CDP Input.insertText triggers VALUE_TRACKER and submits the real credentials', { j, doneReact: doneReact && { path: doneReact.path, user: doneReact.body.username } });
    }

    console.log('⑤ R4 zero-leakage sweep across all output surfaces + RED mutant control');
    {
      const surfaces = {
        cli: cliTranscripts.join('\n'),
        hubLogs: w.logs.join('\n'),
        dialogTrace: JSON.stringify(w.traced),
        browserAudit: JSON.stringify(w.audited),
        vaultAudit: w.vaultAuditRaw(),
      };
      const hits = sweepSurfaces(surfaces, [PW, SEED_B32]);
      ok(hits.length === 0, 'ZERO LEAKAGE: 0 occurrences of the password or TOTP seed across CLI stdout/stderr, snapshot, get value, eval, hub logs, dialog trace, browser audit, and vault-audit.jsonl', hits);

      const useRows = w.vaultAudit().filter((l) => l.event === 'vault-use' && l.door === 'browser-login' && l.outcome === 'ok');
      ok(useRows.length >= 6 && useRows.every((l) => /^vr-[0-9a-f]{12}$/.test(l.receipt || '') && l.purpose === `sign in at ${SITE}`),
        `THE USE LAW: all ${useRows.length} successful fills recorded a vault-use line with purpose + receipt`, useRows.length);

      // RED mutant control: a copy of browser-login-fill.js that includes the secret value in its return object is caught by sweepSurfaces
      const lfSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8');
      const lfAnchor = "return { ok: true, filled: loginId || (curForm && curForm.id) || 'login', step: resolvedStep, submitted };";
      const lfMutSrc = lfSrc.replace(lfAnchor, "return { ok: true, filled: loginId || 'login', leaked: entries.map((x) => x[0]).join(','), step: resolvedStep, submitted };")
        .replace('entries[i][1] = null; // drop reference as soon as read', 'entries[i][0] = val;');
      ok(lfMutSrc !== lfSrc, 'RED mutant anchor found in src/server/browser-login-fill.js');
      const LFm = MUT.load('src/server/browser-login-fill.js', lfMutSrc, 'leakfill');
      const mutRes = await LFm.fillVaultLogin({
        call: async (m) => (m === 'Runtime.evaluate' ? { result: { result: { value: { ok: true, pageOrigin: SITE, frameOrigin: SITE, fields: [{ fieldId: 'vs-f-0', type: 'password', visible: true }] } } } } : { result: {} }),
        origin: SITE,
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
  cleanup();
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
