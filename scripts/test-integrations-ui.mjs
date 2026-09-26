#!/usr/bin/env node
// INTEGRATIONS & KEYS + THE CHANNEL ACCOUNT DIALOGS IN A BROWSER (docs/design-
// communication-panel.zh.md §14.5; docs/design-integrations-per-account.zh.md
// r4 §2.5 / §3 / §8.1, chunk 3; gate row `test-integrations-ui`, heavy tier —
// a real worktree server and headless chrome at 375×667).
//
// Since r4 the Integrations window holds ONLY the six agent-browser key rows
// (a Lark / Gmail OAuth client is chosen where the ACCOUNT is added, exactly
// like a storage mount's), so ①–⑨ drive the browser rows and ⑩ drives the
// account card and its dialogs. What is measured:
//   ⓪ the window draws EXACTLY the six browser cards — no Lark / Gmail / fake
//      card, and a deep link to a retired id opens nothing new
//   ① a browser row's SOURCE CHIP walks none → your own (PUT) → cluster
//      default (env injected + "use cluster") → none WITH A REASON (env
//      removed, server restarted) — each step on the real server, on the card
//   ③ REPLACE NEVER REVEALS: a 40-char secret typed into the card comes back
//      as `••••` + last 4; the plaintext appears nowhere on the page, in any
//      GET body, or on disk
//   ⑤ a PUT failure reaches the user as a TOAST with the field named
//   ⑥ the deep link `app.openIntegration('cloud:kernel')` lands on that card
//   ⑦ two clients see one change
//   ⑧ the Test button's wording follows `test.kind`; a verdict is NEVER drawn
//      without the caveat; a failed Test draws the words (only zero-network
//      Tests are clicked: cloak's shape check, a keyless cloud row's refusal)
//   ⑨ at 375×667 every control of every card is inside the viewport
//   ⑩ THE ACCOUNT CARD + DIALOGS (r4, the storage mount's grammar), against a
//      VENDOR STUB (scripts/fixtures/channels-vendor-stub.cjs preloaded into
//      the scratch server — ZERO vendor calls; the page's window.open is
//      stubbed so no consent page is ever loaded; the product's own loopback
//      receives the redirect the suite lands on it):
//      (a) ONE `Connect an account` entry, no per-kind buttons;
//      (b) the dialog is TYPE-FIRST; Gmail's `OAuth client` preselects
//          presets[0] (`Preset: Org 1`), lists `Custom (own client
//          id/secret)` and no Built-in, the registry hint under it, the
//          `Google authorization` block, the include query;
//      (c) Lark with no preset preselects Custom: `Custom App ID` / `Custom
//          App Secret` inline, the callback URL as a read-only row whose Copy
//          copies EXACTLY the registry's URL, the three prerequisites;
//      (d) Connect before signing in is refused in the dialog and creates
//          NOTHING; (e) the consent runs IN the dialog (link row + paste box),
//          still nothing created; (f) `Connect` creates the record under the
//          chosen preset;
//      (g) the credential-first card: name, `Preset: …` chip, the HEALTH line
//          (`[Gmail] Connected · label:INBOX · last poll …`), ✎ and ⋯; an
//          account tracking nothing says `Login only — …` with Track… and an
//          idle dot; (h) Track… ⇒ ↳ rows, the note gone, the dot ok;
//      (i) the ⋯ order is EXACTLY D6;
//      (j) Edit is prefilled, carries Re-authorize · Duplicate · Remove ·
//          Save in that order, and switching the client makes Save open
//          Re-authorize with the new client (the account is not re-pointed);
//      (k) Duplicate: `{name} (copy)`, the type read-only, client / query /
//          push claim copied, the copied / not-copied paragraph, its OWN
//          consent; the copy exists unauthorized (token NOT copied, nothing
//          tracked) before that consent lands; switched to a custom client it
//          becomes a sibling card with `Custom client`;
//      (l) a dead refresh token (the stub answers invalid_grant) draws the
//          storage error line with the mounts' sentence + `(refresh-refused)`
//          and the `Re-authorize Gmail…` button; the Re-authorize dialog is
//          the storage shape with the OAuth client select on top (the custom
//          client prefilled) and heals the account;
//      (m) Edit on the custom account prefills the SECRET (D3);
//      (n) Remove on a referenced account is refused BY NAME (the assignment,
//          its conversation and principal) with the Disconnect sentence; an
//          unreferenced account is removed;
//      (o) a second client repaints the accounts IN PLACE (no reload, no
//          /api/channels fetch);
//      (p) 375 px: no horizontal overflow on the panel or any dialog;
//      (q) PIXELS: each structural probe the mockups name (the type-first
//          dialog, the client select, the custom fields, the consent block,
//          the card head / health / error line / button, the ↳ rows, the
//          refusal) is inside the viewport and PAINTED — not one flat colour,
//          ink where it carries text (the mockups' check.py rule)
//      and nothing the page ever opened pointed at a vendor host.
//
// Everything is per-pid (scripts/scratch.mjs); the server gets a NAMED
// scratch HOME. Run: node scripts/test-integrations-ui.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('integ-ui');
const fakeHome = scratchHome('integ-ui-home', fs);
const chromeDir = scratch('integ-ui-chrome');
const stubDir = scratch('integ-ui-stub');
fs.mkdirSync(stubDir, { recursive: true });
const stubMode = (m) => fs.writeFileSync(path.join(stubDir, 'mode.json'), JSON.stringify(m));
stubMode({ email: 'ada@example.test', refresh: 'ok', expiresIn: 3600 });

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const R = require(path.join(repo, 'src/integration-registry.js'));
const LARK_CB = R.LARK_CALLBACK_URL;
const BROWSER_ROWS = ['cloak', 'cloud:browserbase', 'cloud:browserless', 'cloud:kernel', 'cloud:browseruse', 'cloud:agentcore'];
const SECRET40 = 'sk-' + 'Q7f3'.repeat(8) + 'ZZZ99';   // 40 chars
const PRESETS = JSON.stringify([
  { key: 'org1', label: 'Org 1', clientId: 'org1.apps.googleusercontent.com', clientSecret: 'org1-secret-000000' },
  { key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' },
]);
const CLUSTER_BB = JSON.stringify([{ id: 'cloud:browserbase', label: 'Cluster Browserbase', values: { apiKey: 'cluster-bb-key-12345678' } }]);
const CUSTOM_ID = 'dup-client.apps.googleusercontent.com';
const CUSTOM_SECRET = 'dup-custom-secret-000000';
const VENDOR_HOSTS = /google\.com|googleapis\.com|feishu\.cn|larksuite\.com/;

// ── throwaway worktree + WORKING-TREE overlay ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

let srv = null;
const STUB = path.join(repo, 'scripts/fixtures/channels-vendor-stub.cjs');
const bootServer = (extraEnv = {}) => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: process.env.VS_DEBUG_SERVER ? 'inherit' : 'ignore',
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_GDRIVE_CLIENTS: PRESETS,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${STUB}`.trim(), VS_VENDOR_STUB_DIR: stubDir, ...extraEnv },
});
srv = bootServer();

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=375,667', '--disable-background-timer-throttling', '--force-device-scale-factor=1',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

const base = `http://127.0.0.1:${PORT}`;
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/home`); return true; } catch { await sleep(250); } } return false; };
const waitDown = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`${base}/api/home`); await sleep(100); } catch { return true; } } return false; };
ok(await waitServer(), 'the worktree server booted (with the vendor stub preloaded)');
const api = async (method, p, body) => {
  // a request that races a boot's last socket reset is retried (never a request the server answered)
  for (let i = 0; ; i++) {
    try { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() }; }
    catch (e) { if (i >= 20) throw e; await sleep(250); }
  }
};

// ── PNG decode (the pixel probes; the mockups' check.py rule) ──
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8); const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported png'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error('png colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * bpp; const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0; const b = y ? out[(y - 1) * stride + x] : 0; const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}
/** check.py's verdict on one crop: not one flat colour (std > 2), and a text
 *  probe carries INK (< 98 % of its pixels share the dominant colour). */
function painted(img, r, textual) {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(img.w, Math.ceil(r.x + r.w)), y1 = Math.min(img.h, Math.ceil(r.y + r.h));
  if (x1 - x0 < 4 || y1 - y0 < 4) return { ok: false, why: `crop ${x1 - x0}×${y1 - y0}` };
  const counts = new Map(); let n = 0, sum = 0, sq = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.w + x) * img.bpp;
    for (let k = 0; k < 3; k++) { const v = img.px[i + k]; sum += v; sq += v * v; }
    const key = ((img.px[i] >> 5) << 6) | ((img.px[i + 1] >> 5) << 3) | (img.px[i + 2] >> 5);
    counts.set(key, (counts.get(key) || 0) + 1); n++;
  }
  const mean = sum / (n * 3), std = Math.sqrt(Math.max(0, sq / (n * 3) - mean * mean));
  const share = Math.max(...counts.values()) / n;
  return { ok: std > 2 && (!textual || share < 0.98), why: `std=${std.toFixed(1)} share=${share.toFixed(3)}` };
}

// ── CDP plumbing ──
const WebSocket = require('ws');
async function newPage() {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const tgt = await r.json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 900));
    if (r2.error) throw new Error('cdp error: ' + JSON.stringify(r2.error).slice(0, 400));
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) throw new Error('no value from page: ' + JSON.stringify(r2).slice(0, 600));
    return r2.result.result.value;
  };
  // no consent page is EVER loaded: the page's window.open records the URL and opens nothing
  const NO_POPUPS = "window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return {}; };";
  const load = async () => {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: NO_POPUPS });
    await cdp('Page.navigate', { url: `${base}/` });
    for (let i = 0; i < 160; i++) { try { if (await evaljs('!!(window.app && window.app.wm)')) return true; } catch {} await sleep(250); }
    return false;
  };
  /** PIXEL PROBES: scroll each selector into view, shoot, judge its crop. */
  const probe = async (label, sel, { textual = true } = {}) => {
    const rect = await evaljs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vw: window.innerWidth }; })()`);
    if (!rect) return ok(false, `PIXELS ${label}: ${sel} is drawn`, 'element MISSING');
    await sleep(80);
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    const img = decodePng(Buffer.from(shot.result.data, 'base64'));
    const inside = rect.x >= -1 && rect.x + rect.w <= rect.vw + 1;
    const v = painted(img, { x: rect.x, y: Math.max(0, rect.y), w: rect.w, h: Math.min(rect.h, img.h - Math.max(0, rect.y)) }, textual);
    ok(inside && v.ok, `PIXELS ${label}: inside the 375px viewport and painted (${v.why}${inside ? '' : `, x=${Math.round(rect.x)} w=${Math.round(rect.w)}`})`);
  };
  return { cdp, evaljs, load, probe, close: () => { try { ws.close(); } catch {} } };
}
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

// page-side helpers (strings evaluated in the page)
const OPEN = (id) => `(async () => {
  window.app.openIntegration(${JSON.stringify(id)});
  for (let i = 0; i < 80; i++) {
    if (document.querySelectorAll('.integ-card').length >= ${BROWSER_ROWS.length}) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
})()`;
const CARD = (id) => `document.querySelector('.integ-card[data-integ="${id}"]')`;
const WAIT_CARD = (id, pred) => `(async () => {
  for (let i = 0; i < 60; i++) {
    const c = ${CARD(id)};
    if (c && (${pred})(c)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
})()`;
const chipOf = (p, id) => p.evaljs(`(${CARD(id)}.querySelector('.integ-chip') || {}).textContent || null`);
const BB = 'cloud:browserbase', BL = 'cloud:browserless';

const p1 = await newPage();
ok(await p1.load(), 'page 1 loaded the app at 375×667');

// ── ⓪ the window keeps ONLY the six browser rows ──
{
  const g = await api('GET', '/api/integrations');
  const ids = ((g.json && g.json.integrations) || []).map((x) => x.id).sort();
  ok(JSON.stringify(ids) === JSON.stringify(BROWSER_ROWS.slice().sort()), `GET /api/integrations lists exactly the six browser rows (${ids.join(', ')})`);
  ok(await p1.evaljs(OPEN(BB)), 'app.openIntegration(<a browser row>) opened the window');
  const cards = await p1.evaljs(`[...document.querySelectorAll('.integ-card')].map((c) => c.dataset.integ).sort()`);
  ok(JSON.stringify(cards) === JSON.stringify(BROWSER_ROWS.slice().sort()), `the window draws exactly the six browser cards — no Lark / Gmail / fake card (${cards.join(', ')})`);
  ok(await p1.evaljs(`!document.querySelector('.integ-card[data-integ="lark"], .integ-card[data-integ="gmail"], .integ-card[data-integ="fake"]')`), 'no retired OAuth-client card anywhere on the page');
}

// ── ① none (fresh instance) ──
{
  const r = await api('GET', `/api/integrations/${encodeURIComponent(BB)}`);
  ok(r.json.integration.source === 'none', 'fresh instance: the Browserbase row is none (route)');
  ok(await p1.evaljs(`${CARD(BB)}.classList.contains('integ-focus')`), 'the deep-linked card is highlighted');
  ok((await chipOf(p1, BB)) === 'Not configured', 'chip: Not configured');
  ok(await p1.evaljs(`/no default/.test((${CARD(BB)}.querySelector('.integ-why') || {}).textContent || '')`), 'and the card says WHY (no cluster default)');
  ok(await p1.evaljs(`${CARD(BB)}.querySelector('.integ-missing') !== null`), 'the required-missing field is marked');
}

// ── ③ Replace never reveals ──
{
  const done = await p1.evaljs(`(async () => {
    const c = ${CARD(BB)};
    const row = c.querySelector('.integ-field[data-field="apiKey"]');
    row.querySelector('.integ-replace').click();
    const inp = row.querySelector('input[type="password"]');
    if (!inp) return { why: 'no password input after Set' };
    inp.value = ${JSON.stringify(SECRET40)};
    row.querySelector('.mounts-btn-primary').click();
    for (let i = 0; i < 60; i++) {
      const c2 = ${CARD(BB)};
      const m = c2 && c2.querySelector('.integ-field[data-field="apiKey"] .integ-mask');
      if (m && /••••/.test(m.textContent) && !c2.querySelector('input[type="password"]')) return { mask: m.textContent, chip: c2.querySelector('.integ-chip').textContent };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { why: 'never re-rendered' };
  })()`);
  ok(done.mask === '••••ZZ99', `after Save the secret shows as its mask + last 4 (${JSON.stringify(done)})`);
  ok(done.chip === 'Your own', 'chip: Your own (source user)');
  ok(!(await p1.evaljs(`document.body.innerText.includes(${JSON.stringify(SECRET40)}) || document.body.innerHTML.includes(${JSON.stringify(SECRET40)})`)), 'THE PLAINTEXT IS NOWHERE ON THE PAGE (text or markup)');
  const g = await api('GET', '/api/integrations');
  ok(!g.text.includes(SECRET40), 'nor in the GET body');
  ok(await p1.evaljs(`${CARD(BB)}.querySelector('.integ-field[data-field="apiKey"] .integ-replace').textContent === 'Replace'`), 'the button now says Replace — there is no Reveal');
  const empty = await p1.evaljs(`(() => { const row = ${CARD(BB)}.querySelector('.integ-field[data-field="apiKey"]'); row.querySelector('.integ-replace').click(); const i = row.querySelector('input[type="password"]'); const v = i ? i.value : null; row.querySelector('.mounts-btn:not(.mounts-btn-primary)').click(); return v; })()`);
  ok(empty === '', 'Replace opens an EMPTY password input (never pre-filled with the value)');
  const stored = fs.readFileSync(path.join(wt, 'data/integrations.json'), 'utf-8');
  ok(!stored.includes(SECRET40), 'and the on-disk record holds ciphertext, not the plaintext');
  const mode = (fs.statSync(path.join(wt, 'data/integrations.json')).mode & 0o777).toString(8);
  ok(mode === '600', `the store file is 0600 (${mode})`);
}

// ── ⑧ Test: wording by kind; verdict never without the caveat; failure words (zero-network Tests only) ──
{
  ok((await p1.evaljs(`${CARD('cloak')}.querySelector('.integ-test').textContent`)) === 'Check format (no network)', 'cloak (shape-only): the button says "Check format (no network)"');
  ok((await p1.evaljs(`${CARD(BL)}.querySelector('.integ-test').textContent`)) === 'Test connection', 'Browserless (credential-exchange): the button says "Test connection" (never clicked — it would reach a vendor)');
  const t1 = await p1.evaljs(`(async () => { ${CARD('cloak')}.querySelector('.integ-test').click(); for (let i = 0; i < 60; i++) { const r = ${CARD('cloak')}.querySelector('.integ-test-result'); if (r && r.querySelector('.integ-verdict')) return { verdict: r.querySelector('.integ-verdict').textContent, caveat: !!r.querySelector('.integ-caveat'), text: r.textContent }; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(t1 && t1.verdict === 'Passed' && t1.caveat, `a passing Test (cloak, empty = the free tier) draws Passed WITH the caveat, never a bare tick (${JSON.stringify(t1 && t1.text).slice(0, 120)})`);
  const t2 = await p1.evaljs(`(async () => { ${CARD('cloud:browseruse')}.querySelector('.integ-test').click(); for (let i = 0; i < 60; i++) { const r = ${CARD('cloud:browseruse')}.querySelector('.integ-test-result'); const v = r && r.querySelector('.integ-verdict'); if (v && v.textContent === 'Failed') return { err: (r.querySelector('.integ-test-error') || {}).textContent || '', caveat: !!r.querySelector('.integ-caveat') }; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(t2 && /no key resolved/.test(t2.err) && t2.caveat, `a failing Test (a keyless cloud row — refused before any request) draws the words on the card, beside the caveat (${JSON.stringify(t2)})`);
}

// ── ⑤ a PUT failure toasts ──
{
  const toast = await p1.evaljs(`(async () => {
    const row = ${CARD(BL)}.querySelector('.integ-field[data-field="apiUrl"]');
    row.querySelector('.integ-replace').click();
    const inp = row.querySelector('input'); inp.value = 'nope';
    row.querySelector('.mounts-btn-primary').click();
    for (let i = 0; i < 60; i++) { const t = document.querySelector('.global-toast-error .global-toast-body'); if (t) return t.textContent; await new Promise((r) => setTimeout(r, 100)); }
    return null;
  })()`);
  ok(toast && /apiUrl/.test(toast) && /http\(s\) URL/.test(toast), `a refused PUT is a TOAST naming the field and the rule (${JSON.stringify(toast)})`);
  await p1.evaljs(`(() => { const row = ${CARD(BL)}.querySelector('.integ-field[data-field="apiUrl"]'); const b = row && row.querySelector('.mounts-btn:not(.mounts-btn-primary)'); if (b) b.click(); return 1; })()`);
}

// ── ⑥ the deep link lands on the card ──
{
  await p1.evaljs(`window.app.openIntegration('cloud:kernel'); 1`);
  await sleep(200);
  ok(await p1.evaljs(`${CARD('cloud:kernel')}.classList.contains('integ-focus')`), 'openIntegration("cloud:kernel") on the open window highlights THAT card');
  ok(await p1.evaljs(`[...window.app.wm.windows.values()].filter((w) => w.type === 'integrations').length === 1`), 'the window is a singleton (a second open focused the first)');
  const gone = await p1.evaljs(`(() => {
    const focused = () => [...document.querySelectorAll('.integ-focus')].map((c) => c.dataset.integ).join(',');
    const before = focused();
    const out = {};
    for (const id of ['lark', 'gmail', 'no-such-row']) { try { window.app.openIntegration(id); } catch (e) { out.threw = String(e); } }
    const wins = [...window.app.wm.windows.values()].filter((w) => w.type === 'integrations').length;
    return { before, after: focused(), threw: out.threw || null, wins, cards: document.querySelectorAll('.integ-card').length };
  })()`);
  ok(gone.wins === 1 && gone.threw === null && gone.after === gone.before && gone.cards === BROWSER_ROWS.length, `a focus id that is retired (lark / gmail) or unknown opens nothing new, highlights nothing new and throws nothing (${JSON.stringify(gone)})`);
}

// ── ⑨ 375×667: every control inside the viewport ──
{
  const out = await p1.evaljs(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.integ-card button, .integ-card select, .integ-card input')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > 376 || r.left < -1) bad.push((el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right));
    }
    const cards = [...document.querySelectorAll('.integ-card')].map((c) => Math.round(c.getBoundingClientRect().width));
    return { bad, cards, n: document.querySelectorAll('.integ-card').length };
  })()`);
  ok(out.n === BROWSER_ROWS.length && !out.bad.length, `375×667: all ${out.n} cards, every control inside the viewport (offenders: ${out.bad.join(', ') || 'none'}; card widths ${out.cards.join('/')})`);
  ok(out.cards.every((w) => w <= 375), 'single column — no card wider than the viewport');
}

// ── ⑦ two clients see one change ──
const p2 = await newPage();
{
  ok(await p2.load() && await p2.evaljs(OPEN(BL)), 'page 2 loaded and opened the window');
  const set = await p1.evaljs(`(async () => {
    const row = ${CARD(BL)}.querySelector('.integ-field[data-field="apiUrl"]');
    row.querySelector('.integ-replace').click();
    const inp = row.querySelector('input'); inp.value = 'https://eu.browserless.example';
    row.querySelector('.mounts-btn-primary').click();
    return true;
  })()`);
  ok(set, 'page 1 saved apiUrl through the card');
  ok(await p2.evaljs(WAIT_CARD(BL, `(c) => (c.querySelector('.integ-field[data-field="apiUrl"] .integ-plain') || {}).textContent === 'https://eu.browserless.example'`)), 'page 2 repainted the row from the integrations-updated broadcast (no reload, no click)');
}

// ── ① continued: cluster default (env injected + use cluster) → none WITH A REASON (env removed, restart) ──
{
  srv.kill('SIGKILL'); await waitDown();
  srv = bootServer({ VIBESPACE_INTEGRATIONS: CLUSTER_BB });
  ok(await waitServer(), 'rebooted WITH a cluster default for the Browserbase row');
  ok(await p1.load() && await p1.evaljs(OPEN(BB)), 'page 1 reloaded and reopened the window');
  ok((await chipOf(p1, BB)) === 'Your own', 'USER > CLUSTER: the user\'s own key survives the injected default (chip still Your own)');
  ok(await p1.evaljs(`!${CARD(BB)}.querySelector('input[value="cluster"]').disabled`), 'the "Use cluster default" radio is now enabled');
  const cleared = await p1.evaljs(`(async () => {
    ${CARD(BB)}.querySelector('.integ-clear').click();
    for (let i = 0; i < 40; i++) { const b = [...document.querySelectorAll('.dialog-overlay .dialog-footer .btn-create')].pop(); if (b) { b.click(); break; } await new Promise((r) => setTimeout(r, 50)); }
    for (let i = 0; i < 60; i++) { const c = ${CARD(BB)}; const chip = c && c.querySelector('.integ-chip'); if (chip && /Cluster default/.test(chip.textContent)) return chip.textContent; await new Promise((r) => setTimeout(r, 100)); }
    return null;
  })()`);
  ok(cleared === 'Cluster default · Cluster Browserbase', `"Clear my keys" lands on the CLUSTER default, chip = Cluster default · <label> (${JSON.stringify(cleared)})`);
  ok(await p1.evaljs(`${CARD(BB)}.querySelector('input[value="cluster"]').checked`), 'the cluster radio is checked');
  ok(await p1.evaljs(`/Provided by the cluster/.test(${CARD(BB)}.querySelector('.integ-fields').textContent)`), 'and the fields read "Provided by the cluster" — nothing to type');
  const use = await api('PUT', `/api/integrations/${encodeURIComponent(BB)}`, { use: 'cluster' });
  ok(use.status === 200 && use.json.integration.source === 'cluster', "PUT {use:'cluster'} confirms the choice");
  ok(!fs.readFileSync(path.join(wt, 'data/integrations.json'), 'utf-8').includes('cluster-bb-key'), 'the cluster value was never written to disk');
  srv.kill('SIGKILL'); await waitDown();
  srv = bootServer();
  ok(await waitServer(), 'rebooted WITHOUT the cluster default');
  const r = await api('GET', `/api/integrations/${encodeURIComponent(BB)}`);
  ok(r.json.integration.source === 'none' && /no longer provided/.test(r.json.integration.why) && r.json.integration.set.apiKey === false, `INJECT-THEN-REMOVE: none WITH A REASON on the route (${r.json.integration.why})`);
  ok(await p1.load() && await p1.evaljs(OPEN(BB)), 'page 1 reloaded');
  ok((await chipOf(p1, BB)) === 'Not configured', 'chip: Not configured');
  ok(await p1.evaljs(`/no longer provided/.test((${CARD(BB)}.querySelector('.integ-why') || {}).textContent || '')`), 'and the card says the cluster default this row used is no longer provided');
  await p1.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'integrations')) window.app.wm.closeWindow(w.id); return 1; })()`);
}

// ── ⑩ THE CHANNEL ACCOUNT CARD + DIALOGS (r4, the storage mount's grammar) ──
{
  console.log('\n⑩ the channel account card and its dialogs (the vendor stub answers every Google call)');
  const panelWait = (pred) => `(async () => { if (!document.querySelector('.rail-panel-channels')) window.app.openChannels(); for (let i = 0; i < 120; i++) { if ((${pred})()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`;
  const DLG = (kind) => `document.querySelector('.dialog-body[data-chan-dialog="${kind}"]')`;
  const WAIT_DLG = (kind) => `(async () => { for (let i = 0; i < 80; i++) { if (${DLG(kind)}) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`;
  const visibleLabels = (kind) => `[...${DLG(kind)}.querySelectorAll(':scope > label')].filter((l) => l.style.display !== 'none').map((l) => l.textContent)`;
  const accounts = async () => (((await api('GET', '/api/channels')).json || {}).adapters || []).filter((a) => a.kind === 'gmail' || a.kind === 'lark');
  const card = (id) => `document.querySelector('.rail-panel-channels .chan-account[data-adapter=${JSON.stringify(id)}]')`;
  /** Land the browser's redirect on the product's own loopback (the consent URL is the one the page was handed). */
  const followConsent = async (consentUrl) => {
    const u = new URL(consentUrl);
    const redirect = new URL(u.searchParams.get('redirect_uri'));
    redirect.searchParams.set('state', u.searchParams.get('state'));
    redirect.searchParams.set('code', 'stub-code-' + Date.now());
    const r = await fetch(redirect.toString());
    return r.status;
  };
  /** The consent link row inside a dialog's consent block (the cross-browser row). */
  const consentUrlIn = (sel) => `(async () => { for (let i = 0; i < 80; i++) { const i2 = document.querySelector(${JSON.stringify(sel)}); if (i2 && i2.value) return i2.value; await new Promise((r) => setTimeout(r, 100)); } return null; })()`;

  // (a) ONE entry
  ok(await p1.evaljs(panelWait(`() => !!document.querySelector('.rail-panel-channels [data-connect-account]')`)), 'the Channels panel (its window on a phone) draws the ONE `Connect an account` entry');
  const entry = await p1.evaljs(`(() => ({ text: document.querySelector('.rail-panel-channels [data-connect-account]').textContent, perKind: document.querySelectorAll('.rail-panel-channels [data-connect-kind]').length }))()`);
  ok(/^Connect an account \(Lark \/ 飞书, Gmail\)$|^Connect an account \(Gmail, Lark \/ 飞书\)$/.test(entry.text) && entry.perKind === 0, `the entry names the types and the per-kind buttons are retired (${JSON.stringify(entry)})`);
  ok((await accounts()).length === 0, 'FIXTURE: no account exists yet');

  // (b) type-first; Gmail's preset preselected
  await p1.evaljs(`document.querySelector('.rail-panel-channels [data-connect-account]').click(); 1`);
  ok(await p1.evaljs(WAIT_DLG('connect')), 'the entry opens the account dialog');
  const d0 = await p1.evaljs(`(() => { const d = ${DLG('connect')}; const first = d.querySelector(':scope > label'); const sel = d.querySelector(':scope > select'); return { title: d.closest('.dialog').querySelector('.dialog-header h3').textContent, firstLabel: first && first.textContent, firstIsType: first && first.nextElementSibling === sel, types: [...sel.options].map((o) => o.value) }; })()`);
  ok(d0.title === 'Connect an account' && d0.firstLabel === 'Type' && d0.firstIsType && d0.types.includes('gmail') && d0.types.includes('lark'), `TYPE-FIRST: the dialog's first field is Type (${JSON.stringify(d0)})`);
  await p1.evaljs(`(() => { const s = ${DLG('connect')}.querySelector(':scope > select'); s.value = 'gmail'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const gm = await p1.evaljs(`(() => {
    const d = ${DLG('connect')};
    const labels = ${visibleLabels('connect')};
    const client = [...d.querySelectorAll(':scope > select')].find((s) => s.style.display !== 'none' && [...s.options].some((o) => o.value === 'custom'));
    const hint = client && client.nextElementSibling;
    const block = [...d.querySelectorAll('.mounts-drive-connect')].find((b) => b.style.display !== 'none');
    const inputs = [...d.querySelectorAll(':scope > input')].filter((i) => i.style.display !== 'none' && i.type !== 'hidden');
    return { labels, clientValue: client && client.value, options: client ? [...client.options].map((o) => o.textContent) : [], hint: hint && hint.className === 'mounts-field-hint' ? hint.textContent : null, block: block ? block.querySelector('button').textContent : null, blocks: d.querySelectorAll('.mounts-drive-connect').length, query: (inputs.find((i) => i.value === 'label:INBOX') || {}).value || null, submit: d.querySelector('.dialog-actions .btn-create').textContent };
  })()`);
  ok(JSON.stringify(gm.labels) === JSON.stringify(['Type', 'Name', 'OAuth client', 'Google authorization', 'Include query']), `Gmail's fields in the storage order: Type → Name → OAuth client → Google authorization → the include query (${JSON.stringify(gm.labels)})`);
  ok(gm.clientValue === 'org1' && JSON.stringify(gm.options) === JSON.stringify(['Preset: Org 1', 'Preset: Channels', 'Custom (own client id/secret)']), `\`OAuth client\` preselects presets[0] and offers Preset × 2 + Custom, no Built-in (${JSON.stringify(gm)})`);
  ok(gm.hint === R.rowById('gmail').clientHint, 'the registry\'s clientHint is the .mounts-field-hint line under the select');
  ok(gm.block === 'Connect Google' && gm.query === 'label:INBOX' && gm.submit === 'Connect', `the \`Google authorization\` block (the storage .mounts-drive-connect, one per type, the other hidden), the include query, and .btn-create "Connect" (${JSON.stringify({ block: gm.block, blocks: gm.blocks, query: gm.query, submit: gm.submit })})`);
  await p1.probe('connect dialog (Gmail, preset)', '#mounts-dialog-overlay .dialog');
  await p1.evaljs(`(() => { const c = [...${DLG('connect')}.querySelectorAll(':scope > select')].find((s) => s.style.display !== 'none' && [...s.options].some((o) => o.value === 'custom')); c.dataset.probe = 'client'; return 1; })()`);
  await p1.probe('the OAuth client select', '[data-probe="client"]');

  // (c) Lark: no preset ⇒ Custom preselected, the custom fields inline, the callback row, the three prerequisites
  await p1.evaljs(`(() => { const s = ${DLG('connect')}.querySelector(':scope > select'); s.value = 'lark'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const lk = await p1.evaljs(`(() => {
    const d = ${DLG('connect')};
    const vis = (e) => e && e.style.display !== 'none';
    const labels = ${visibleLabels('connect')};
    const client = [...d.querySelectorAll(':scope > select')].find((s) => vis(s) && [...s.options].some((o) => o.value === 'custom'));
    const copy = [...d.querySelectorAll(':scope > .mounts-oauth-link')].find(vis);
    const hints = [];
    for (let n = copy && copy.nextElementSibling; n && n.className === 'mounts-field-hint'; n = n.nextElementSibling) hints.push(n.textContent);
    const pw = [...d.querySelectorAll(':scope > input[type="password"]')].find(vis);
    return { labels, clientValue: client && client.value, options: client ? [...client.options].map((o) => o.textContent) : [], cb: copy ? copy.querySelector('input').value : null, cbReadOnly: copy ? copy.querySelector('input').readOnly : null, copyBtn: copy ? copy.querySelector('button').textContent : null, hints, secretIsPassword: !!pw, block: ([...d.querySelectorAll('.mounts-drive-connect')].find(vis) || { querySelector: () => ({}) }).querySelector('button').textContent };
  })()`);
  ok(lk.clientValue === 'custom' && JSON.stringify(lk.options) === JSON.stringify(['Custom (own client id/secret)']), `Lark with no preset preselects Custom — the only entry (${JSON.stringify(lk.options)})`);
  ok(JSON.stringify(lk.labels) === JSON.stringify(['Type', 'Name', 'OAuth client', 'Custom App ID', 'Custom App Secret', 'Callback URL (register it on your app first)', 'Lark authorization', 'Brand']), `Custom unfolds IN PLACE: Custom App ID / Custom App Secret (the registry's labels), the callback row, the authorization block, the type's own field (${JSON.stringify(lk.labels)})`);
  ok(lk.cb === LARK_CB && lk.cbReadOnly === true && lk.copyBtn === 'Copy' && lk.secretIsPassword, `the callback URL is the oauthLinkRow-shaped READ-ONLY row + Copy with EXACTLY ${LARK_CB}; the secret input is a password field`);
  const larkRow = R.rowById('lark');
  ok(lk.hints.length === 4 && lk.hints[0] === larkRow.setup.callbackNote && larkRow.setup.prerequisites.every((p, i) => lk.hints[i + 1] === p), `the console note + the three prerequisites as hint lines (${JSON.stringify(lk.hints)})`);
  ok(lk.block === 'Connect Lark', 'the Lark authorization block');
  const copied = await p1.evaljs(`(async () => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
    const copy = [...${DLG('connect')}.querySelectorAll(':scope > .mounts-oauth-link')].find((e) => e.style.display !== 'none');
    copy.querySelector('button').click();
    for (let i = 0; i < 20 && !window.__copied; i++) await new Promise((r) => setTimeout(r, 50));
    return window.__copied;
  })()`);
  ok(copied === LARK_CB, `the callback row's Copy copies EXACTLY ${LARK_CB} (got ${JSON.stringify(copied)})`);
  await p1.probe('the custom fields + callback row (Lark)', `#mounts-dialog-overlay .dialog-body > .mounts-oauth-link[data-field="cb.lark"]`);

  // (d) Connect before the sign-in: refused IN the dialog, nothing created
  await p1.evaljs(`(() => { const s = ${DLG('connect')}.querySelector(':scope > select'); s.value = 'gmail'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const early = await p1.evaljs(`(async () => { const d = ${DLG('connect')}; d.querySelector('.dialog-actions .btn-create').click(); for (let i = 0; i < 40; i++) { const e = d.querySelector('.cfg-err'); if (e && e.textContent) return e.textContent; await new Promise((r) => setTimeout(r, 50)); } return null; })()`);
  ok(/Sign in first/.test(early || '') && /Connect Google/.test(early || ''), `Connect before signing in is refused in the dialog's .cfg-err (${JSON.stringify(early)})`);
  ok((await accounts()).length === 0, 'and NOTHING was created');

  // (e) the consent IN the dialog
  await p1.evaljs(`(() => { const d = ${DLG('connect')}; [...d.querySelectorAll('.mounts-drive-connect')].find((b) => b.style.display !== 'none').querySelector('button').click(); return 1; })()`);
  const url1 = await p1.evaljs(consentUrlIn('#mounts-dialog-overlay .mounts-drive-connect .mounts-oauth-link input'));
  ok(!!url1 && new URL(url1).searchParams.get('client_id') === 'org1.apps.googleusercontent.com', `the consent starts IN the dialog under the preselected preset (client_id org1) and the cross-browser link row carries its URL (${String(url1).slice(0, 80)}…)`);
  const flowUi = await p1.evaljs(`(() => { const b = [...${DLG('connect')}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none'); return { paste: !!b.querySelector('input[placeholder^="http://127.0.0.1"]'), status: b.querySelector('.mounts-field-hint').textContent, opened: (window.__opened || []).length }; })()`);
  ok(flowUi.paste && /Google sign-in page opened/.test(flowUi.status) && flowUi.opened === 1, `the storage block: the status sentence names Google, the paste-back box is drawn, and window.open was asked (and stubbed) once (${JSON.stringify(flowUi)})`);
  await p1.probe('the consent block in flight', `#mounts-dialog-overlay .mounts-drive-connect .mounts-oauth-link`);
  ok((await accounts()).length === 0, 'a running sign-in creates nothing either');
  ok((await followConsent(url1)) === 200, 'the redirect lands on the product\'s own loopback (the stub answers the token exchange)');
  const signed = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { const b = [...${DLG('connect')}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none'); const s = b && b.querySelector('.mounts-field-hint').textContent; if (/Connected/.test(s || '')) return s; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(/✓ Connected — finish with the “Connect” button below\./.test(signed || ''), `the block says the sign-in finished (${JSON.stringify(signed)})`);
  ok((await accounts()).length === 0, 'STILL nothing created — the record waits for Connect');

  // (f) Connect creates the record
  await p1.evaljs(`${DLG('connect')}.querySelector('.dialog-actions .btn-create').click(); 1`);
  let accts = [];
  for (let i = 0; i < 60 && !accts.length; i++) { accts = await accounts(); if (!accts.length) await sleep(100); }
  const A = accts[0];
  ok(accts.length === 1 && A.kind === 'gmail' && A.credentialKey === 'cluster:org1' && A.auth.tokenHeld && A.auth.user === 'ada@example.test', `Connect CREATED the account under the chosen preset, signed in as the stub's user (${JSON.stringify(accts.map((a) => ({ id: a.id, key: a.credentialKey, user: a.auth.user })))})`);
  ok(await p1.evaljs(`(async () => { for (let i = 0; i < 60; i++) { if (!document.querySelector('#mounts-dialog-overlay')) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`), 'and closed the dialog');

  // (g) the credential-first card; login-only
  ok(await p1.evaljs(panelWait(`() => { const c = ${card(A.id)}; return !!(c && c.querySelector('.chan-sec-health') && /last poll/.test(c.querySelector('.chan-sec-health').textContent) && c.querySelector('.chan-sec-empty')); }`)), 'the account card is drawn with its health line after its first pass');
  const c0 = await p1.evaljs(`(() => { const c = ${card(A.id)}; const h = c.querySelector('.chan-sec-head'); return { name: h.querySelector('.chan-sec-name').textContent, chip: (h.querySelector('.chan-cred-chip') || {}).textContent, dot: h.querySelector('.chan-dot').dataset.state, edit: !!h.querySelector('.mounts-icon-btn'), more: !!h.querySelector('.chan-sec-more'), tag: c.querySelector('.chan-sec-health .mounts-typetag').textContent, health: c.querySelector('.chan-sec-health-text').textContent, empty: c.querySelector('.chan-sec-empty').textContent, track: (c.querySelector('.chan-sec-empty button') || {}).textContent, rows: c.querySelectorAll('.chan-row').length }; })()`);
  ok(c0.name === 'Gmail · ada@example.test' && c0.chip === 'Preset: Org 1' && c0.edit && c0.more, `the head: name + login, the client chip "Preset: Org 1", ✎ and ⋯ (${JSON.stringify(c0)})`);
  ok(c0.tag === 'Gmail' && /^Connected · label:INBOX · last poll /.test(c0.health), `the HEALTH line in the storage detail-line grammar: [Gmail] Connected · label:INBOX · last poll … (${c0.health})`);
  ok(/^Login only — no conversation tracked yet/.test(c0.empty) && c0.track === 'Track…' && c0.dot === 'idle' && c0.rows === 0, `tracking nothing: the "Login only — …" wording + Track…, an idle dot, no rows (${JSON.stringify({ empty: c0.empty.slice(0, 40), dot: c0.dot })})`);
  await p1.probe('the card head', `.rail-panel-channels .chan-account[data-adapter="${A.id}"] .chan-sec-head`);
  await p1.probe('the health line', `.rail-panel-channels .chan-account[data-adapter="${A.id}"] .chan-sec-health`);
  await p1.probe('the login-only note', `.rail-panel-channels .chan-account[data-adapter="${A.id}"] .chan-sec-empty`);

  // (o) page 2 watches the accounts IN PLACE from here on
  ok(await p2.load() && await p2.evaljs(panelWait(`() => !!${card(A.id)}`)), 'page 2 opened the panel and sees the account');
  await p2.evaljs(`(() => { window.__marker = 'p2-alive'; window.__chanFetches = 0; const of = window.fetch; window.fetch = function (u, ...r) { if (/^\\/api\\/channels(\\?|$)/.test(String(u))) window.__chanFetches++; return of.call(this, u, ...r); }; return 1; })()`);

  // (h) Track… ⇒ ↳ rows
  await p1.evaljs(`${card(A.id)}.querySelector('.chan-sec-empty button').click(); 1`);
  const picker = await p1.evaljs(`(async () => { for (let i = 0; i < 60; i++) { const items = document.querySelectorAll('#chan-track-dialog .chan-track-item input[type="checkbox"]'); if (items.length >= 2) { items[0].click(); await new Promise((r) => setTimeout(r, 300)); items[1].click(); await new Promise((r) => setTimeout(r, 300)); return items.length; } await new Promise((r) => setTimeout(r, 100)); } return 0; })()`);
  ok(picker === 3, `Track… opens today's picker over the account's conversations (${picker} listed) and two are ticked`);
  await p1.evaljs(`(() => { const d = document.querySelector('#chan-track-dialog'); const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Done'); b.click(); return 1; })()`);
  ok(await p1.evaljs(panelWait(`() => { const c = ${card(A.id)}; return !!c && c.querySelectorAll('.chan-row.chan-row-tracked').length === 2 && !c.querySelector('.chan-sec-empty'); }`)), 'the two tracked conversations render as the account\'s CHILD rows; the login-only note is gone');
  const rows = await p1.evaljs(`(() => { const c = ${card(A.id)}; return { arrows: [...c.querySelectorAll('.chan-row-tracked .chan-row-line > .mounts-child-arrow')].map((a) => a.textContent), dot: c.querySelector('.chan-sec-head .chan-dot').dataset.state, count: c.querySelector('.chan-sec-count').textContent }; })()`);
  ok(rows.arrows.join('') === '↳↳' && rows.dot === 'ok' && rows.count === '2/3', `each child row leads with the storage ↳ arrow; the dot is ok; the count reads 2/3 (${JSON.stringify(rows)})`);
  await p1.probe('the ↳ tracked rows', `.rail-panel-channels .chan-account[data-adapter="${A.id}"] .chan-rows`);
  const p2rows = await p2.evaljs(panelWait(`() => { const c = ${card(A.id)}; return !!c && c.querySelectorAll('.chan-row-tracked').length === 2; }`));
  const p2state = await p2.evaljs(`({ marker: window.__marker, fetches: window.__chanFetches })`);
  ok(p2rows && p2state.marker === 'p2-alive' && p2state.fetches === 0, `page 2 repainted the card IN PLACE from the broadcast — no reload, no /api/channels fetch (${JSON.stringify(p2state)})`);

  // (i) the ⋯ order = D6
  const menu = await p1.evaljs(`(async () => { ${card(A.id)}.querySelector('.chan-sec-more').click(); await new Promise((r) => setTimeout(r, 200)); const m = document.querySelector('.context-menu'); const items = m ? [...m.children].map((e) => e.classList.contains('context-menu-separator') ? '‖' : e.textContent.trim()) : []; if (m) m.remove(); return items; })()`);
  const D6 = ['Open conversation window', 'Track…', 'Options', 'Push…', '‖', 'Re-authorize', 'Duplicate…', 'Disconnect', 'Remove…', '‖', 'Disable'];
  ok(JSON.stringify(menu) === JSON.stringify(D6), `the ⋯ is the storage row's order, EXACTLY D6 (${menu.join(' · ')})`);

  // (j) Edit: prefilled, the four buttons in order, switching the client ⇒ Save opens Re-authorize
  await p1.evaljs(`${card(A.id)}.querySelector('.chan-sec-head .mounts-icon-btn').click(); 1`);
  ok(await p1.evaljs(WAIT_DLG('edit')), '✎ opens the Edit dialog');
  const ed = await p1.evaljs(`(() => { const d = ${DLG('edit')}; const sels = [...d.querySelectorAll(':scope > select')]; return { title: d.closest('.dialog').querySelector('.dialog-header h3').textContent, name: d.querySelector(':scope > input').value, client: sels[0].value, labels: ${visibleLabels('edit')}, buttons: [...d.querySelectorAll('.dialog-actions button')].map((b) => b.textContent), query: [...d.querySelectorAll(':scope > input')].map((i) => i.value).includes('label:INBOX') }; })()`);
  ok(ed.title === 'Edit "Gmail · ada@example.test"' && ed.name === 'Gmail' && ed.client === 'org1' && ed.query, `every parameter prefilled — name, the client (org1), the query (${JSON.stringify(ed)})`);
  ok(JSON.stringify(ed.buttons) === JSON.stringify(['Re-authorize Gmail…', 'Duplicate…', 'Remove…', 'Save']), `the buttons: Re-authorize Gmail… · Duplicate… · Remove… · Save (${JSON.stringify(ed.buttons)})`);
  ok(ed.labels.includes('Sign-in') && ed.labels.includes('OAuth client'), 'the OAuth client field and the sign-in fact are drawn');
  await p1.evaljs(`(() => { const d = ${DLG('edit')}; const s = d.querySelector(':scope > select'); s.value = 'channels'; s.dispatchEvent(new Event('change')); [...d.querySelectorAll('.dialog-actions button')].pop().click(); return 1; })()`);
  ok(await p1.evaljs(WAIT_DLG('reauth')), 'switching the client and pressing Save OPENS Re-authorize (a token is bound to its client)');
  const re0 = await p1.evaljs(`(() => { const d = ${DLG('reauth')}; return { client: d.querySelector(':scope > select').value, title: d.closest('.dialog').querySelector('.dialog-header h3').textContent, btn: d.querySelector(':scope > .mounts-btn-primary').textContent }; })()`);
  ok(re0.client === 'channels' && re0.title === 'Re-authorize "Gmail · ada@example.test"' && re0.btn === 'Sign in with Google', `…with the NEW client preselected (${JSON.stringify(re0)})`);
  ok(((await accounts()).find((a) => a.id === A.id) || {}).credentialKey === 'cluster:org1', 'and the account was NOT re-pointed by the Save');
  await p1.evaljs(`document.querySelector('#chan-reauth-dialog .dialog-close').click(); 1`);

  // (k) Duplicate: settings copied, token not, its own consent; switched to a custom client
  await p1.evaljs(`(async () => { ${card(A.id)}.querySelector('.chan-sec-more').click(); await new Promise((r) => setTimeout(r, 200)); [...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent.trim() === 'Duplicate…').click(); return 1; })()`);
  ok(await p1.evaljs(WAIT_DLG('duplicate')), '⋯ Duplicate… opens the Duplicate dialog');
  const du = await p1.evaljs(`(() => { const d = ${DLG('duplicate')}; const inputs = [...d.querySelectorAll(':scope > input')]; const sels = [...d.querySelectorAll(':scope > select')]; return { title: d.closest('.dialog').querySelector('.dialog-header h3').textContent, name: inputs[0].value, type: inputs[1].value, typeRO: inputs[1].readOnly, client: sels[0].value, query: inputs.some((i) => i.value === 'label:INBOX'), push: sels.some((s) => [...s.options].some((o) => o.value === 'exclusive')), note: (d.querySelector(':scope > .mounts-note') || {}).textContent || '', block: d.querySelector('.mounts-drive-connect button').textContent, submit: d.querySelector('.dialog-actions .btn-create').textContent }; })()`);
  ok(du.title === 'Duplicate "Gmail · ada@example.test"' && du.name === 'Gmail (copy)' && du.type === 'Gmail' && du.typeRO && du.client === 'org1' && du.query && du.push, `name "{name} (copy)", the type READ-ONLY, the client / query / push claim copied (${JSON.stringify(du)})`);
  ok(/^Copied: the type, the OAuth client/.test(du.note) && /NOT copied: the token/.test(du.note) && du.block === 'Connect Google' && du.submit === 'Create & connect', 'the copied / not-copied paragraph, its OWN consent block and "Create & connect"');
  await p1.probe('the duplicate dialog', '#mounts-dialog-overlay .dialog');
  // switch the copy to a custom client; its first refresh will be refused (the stub's invalid_grant) — the dead-sign-in leg below
  await p1.evaljs(`(() => { const d = ${DLG('duplicate')}; const s = d.querySelector(':scope > select'); s.value = 'custom'; s.dispatchEvent(new Event('change')); const vis = [...d.querySelectorAll(':scope > input')].filter((i) => i.style.display !== 'none' && !i.readOnly); const id = vis.find((i) => i.placeholder && /googleusercontent/.test(i.placeholder)); const sec = d.querySelector(':scope > input[type="password"]'); id.value = ${JSON.stringify(CUSTOM_ID)}; sec.value = ${JSON.stringify(CUSTOM_SECRET)}; id.dispatchEvent(new Event('input')); sec.dispatchEvent(new Event('input')); return 1; })()`);
  stubMode({ email: 'ben@example.test', refresh: 'invalid_grant', expiresIn: 1 });
  await p1.evaljs(`${DLG('duplicate')}.querySelector('.mounts-drive-connect button').click(); 1`);
  const url2 = await p1.evaljs(consentUrlIn('#mounts-dialog-overlay .mounts-drive-connect .mounts-oauth-link input'));
  const copyRec = (await accounts()).find((a) => a.id !== A.id);
  ok(!!copyRec && copyRec.auth.tokenHeld === false && copyRec.label === 'Gmail (copy)' && copyRec.options.query === A.options.query, `the COPY exists unauthorized — the token is NOT copied, the settings are (${JSON.stringify(copyRec && { id: copyRec.id, tokenHeld: copyRec.auth.tokenHeld, query: copyRec.options.query })})`);
  const idx = (await api('GET', '/api/channels')).json.conversations.filter((c) => c.adapterId === (copyRec && copyRec.id));
  ok(idx.every((c) => !c.tracked && !c.assignment), 'nothing tracked or assigned on the copy');
  ok(!!url2 && new URL(url2).searchParams.get('client_id') === CUSTOM_ID, `its OWN consent runs under the custom client it was switched to (client_id ${url2 && new URL(url2).searchParams.get('client_id')})`);
  ok((await followConsent(url2)) === 200, 'the copy\'s redirect lands on the loopback');
  const dupSigned = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { const s = ${DLG('duplicate')}.querySelector('.mounts-drive-connect .mounts-field-hint').textContent; if (/Connected/.test(s)) return s; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(/Create & connect/.test(dupSigned || ''), `the block says the copy signed in (${JSON.stringify(dupSigned)})`);
  await p1.evaljs(`${DLG('duplicate')}.querySelector('.dialog-actions .btn-create').click(); 1`);
  const B = copyRec;
  ok(await p1.evaljs(panelWait(`() => !!${card(B.id)} && !document.querySelector('#mounts-dialog-overlay')`)), 'Create & connect closed the dialog; the SIBLING card appears');

  // (l) the dead sign-in: the storage error line + Re-authorize, and the dialog heals it
  ok(await p1.evaljs(panelWait(`() => { const c = ${card(B.id)}; return !!(c && c.querySelector('.mounts-errline')); }`)), 'the copy\'s first refresh was refused (invalid_grant) ⇒ its card draws the storage error line');
  const bad = await p1.evaljs(`(() => { const c = ${card(B.id)}; const e = c.querySelector('.mounts-errline'); const b = e.querySelector('.mounts-reauth-btn'); return { text: e.firstChild.textContent, btn: b && b.textContent, btnCls: b && b.className, chip: c.querySelector('.chan-cred-chip').textContent, dot: c.querySelector('.chan-sec-head .chan-dot').dataset.state }; })()`);
  const whyB = (((await accounts()).find((a) => a.id === B.id) || {}).auth || {}).why;
  ok(/^(refresh-refused|last-pass-refused)$/.test(whyB || '') && bad.text === `Couldn’t connect: connected but the sign-in has expired or been revoked — conversations come from cache while every fetch fails; re-authorize to fix (${whyB})`, `D8: the mounts' sentence VERBATIM (its nouns the channel's) + the channel's why code in brackets (${JSON.stringify(bad.text)})`);
  ok(bad.btn === 'Re-authorize Gmail…' && bad.btnCls === 'mounts-btn mounts-btn-primary mounts-reauth-btn' && bad.chip === 'Custom client' && bad.dot === 'bad', `the primary Re-authorize Gmail… button (the storage class), the "Custom client" chip, a bad dot (${JSON.stringify(bad)})`);
  await p1.probe('the error line + Re-authorize button', `.rail-panel-channels .chan-account[data-adapter="${B.id}"] .mounts-errline`);
  await p1.evaljs(`${card(B.id)}.querySelector('.mounts-reauth-btn').click(); 1`);
  ok(await p1.evaljs(WAIT_DLG('reauth')), 'the button opens Re-authorize');
  const re1 = await p1.evaljs(`(() => { const d = ${DLG('reauth')}; const kids = [...d.children].filter((e) => e.style.display !== 'none').map((e) => e.tagName === 'LABEL' ? 'label:' + e.textContent : e.tagName === 'SELECT' ? 'select' : e.tagName === 'BUTTON' ? 'button:' + e.textContent : e.tagName === 'INPUT' ? 'input' : e.className); const inputs = [...d.querySelectorAll(':scope > input')].filter((i) => i.style.display !== 'none'); return { order: kids, client: d.querySelector(':scope > select').value, hint: d.firstElementChild.textContent, id: inputs.map((i) => i.value)[0], secret: inputs.map((i) => i.value)[1] }; })()`);
  ok(re1.client === 'custom' && re1.id === CUSTOM_ID && re1.secret === CUSTOM_SECRET, `the OAuth client select on top carries the account's OWN custom client, prefilled (${JSON.stringify({ client: re1.client, id: re1.id })})`);
  ok(/^Google reported the saved sign-in as expired or revoked/.test(re1.hint) && re1.order[0] === 'mounts-field-hint' && re1.order[1] === 'label:OAuth client' && re1.order.includes('button:Sign in with Google'), `the storage shape: who reported the death → the client select → Sign in with Google (${JSON.stringify(re1.order)})`);
  await p1.probe('the re-authorize dialog', '#chan-reauth-dialog .dialog');
  stubMode({ email: 'ben@example.test', refresh: 'ok', expiresIn: 3600 });
  await p1.evaljs(`${DLG('reauth')}.querySelector(':scope > .mounts-btn-primary').click(); 1`);
  const url3 = await p1.evaljs(consentUrlIn('#chan-reauth-dialog .mounts-oauth-link input'));
  ok(!!url3 && new URL(url3).searchParams.get('client_id') === CUSTOM_ID, 'the re-authorize consent runs under the account\'s own client, with the cross-browser link row');
  ok(await p1.evaljs(`!!document.querySelector('#chan-reauth-dialog input[placeholder^="http://127.0.0.1"]')`), 'and the paste-back box');
  ok((await followConsent(url3)) === 200, 'the redirect lands on the loopback');
  ok(await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { if (!document.querySelector('#chan-reauth-dialog')) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`), 'the dialog closes when the new sign-in lands');
  ok(await p1.evaljs(panelWait(`() => { const c = ${card(B.id)}; return !!(c && !c.querySelector('.mounts-errline') && c.querySelector('.chan-sec-health')); }`)), 'the card heals: the error line is gone, the health line is back');

  // (m) Edit on the custom account prefills the SECRET (D3)
  await p1.evaljs(`${card(B.id)}.querySelector('.chan-sec-head .mounts-icon-btn').click(); 1`);
  ok(await p1.evaljs(WAIT_DLG('edit')), 'Edit on the custom account');
  const ec = await p1.evaljs(`(() => { const d = ${DLG('edit')}; const inputs = [...d.querySelectorAll(':scope > input')].filter((i) => i.style.display !== 'none'); return { client: d.querySelector(':scope > select').value, values: inputs.map((i) => i.value), labels: ${visibleLabels('edit')} }; })()`);
  ok(ec.client === 'custom' && ec.values.includes(CUSTOM_ID) && ec.values.includes(CUSTOM_SECRET) && ec.labels.includes('Custom OAuth client ID') && ec.labels.includes('Custom OAuth client secret'), `D3: the custom client id AND secret are prefilled with their real values (the storage edit rule) (${JSON.stringify(ec.labels)})`);
  ok(!(await p2.evaljs(`document.body.innerHTML.includes(${JSON.stringify(CUSTOM_SECRET)})`)), 'the secret never reached the OTHER client (it rides only the owner-only config route, never a broadcast)');
  ok(!(await api('GET', '/api/channels')).text.includes(CUSTOM_SECRET), 'nor the digest');
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay .dialog-close').click(); 1`);

  // (n) Remove: refused BY NAME while referenced; an unreferenced account goes
  const conv = (await api('GET', '/api/channels')).json.conversations.find((c) => c.adapterId === A.id && c.tracked);
  const asg = await api('PUT', `/api/channels/${encodeURIComponent(A.id)}/${encodeURIComponent(conv.id)}/assignment`, { assignment: { principal: { kind: 'agent', id: 'agent-7', name: 'Procurement agent' }, mode: 'all' } });
  ok(asg.status === 200, 'FIXTURE: one tracked conversation of the first account is assigned to an agent');
  const confirmNewest = `(async () => { for (let i = 0; i < 40; i++) { const b = [...document.querySelectorAll('.dialog-overlay .dialog-footer .btn-create')].pop(); if (b) { b.click(); return true; } await new Promise((r) => setTimeout(r, 50)); } return false; })()`;
  await p1.evaljs(`(async () => { ${card(A.id)}.querySelector('.chan-sec-more').click(); await new Promise((r) => setTimeout(r, 200)); [...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent.trim() === 'Remove…').click(); return 1; })()`);
  ok(await p1.evaljs(confirmNewest), 'Remove… asks first (the confirm dialog)');
  ok(await p1.evaljs(`(async () => { for (let i = 0; i < 60; i++) { if (document.querySelector('#chan-remove-refused')) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`), 'a referenced account is REFUSED — the "Cannot remove" dialog');
  const rf = await p1.evaljs(`(() => { const d = document.querySelector('#chan-remove-refused'); return { title: d.querySelector('.dialog-header h3').textContent, lead: d.querySelector('.chan-flow-refusal').textContent, refs: [...d.querySelectorAll('[data-ref-kind]')].map((e) => e.dataset.refKind + '|' + e.textContent), tail: [...d.querySelectorAll('p.dialog-hint')].map((p) => p.textContent).join(' ') }; })()`);
  ok(rf.title === 'Cannot remove "Gmail · ada@example.test"' && /still referenced/.test(rf.lead), `titled by the account's name (${rf.title})`);
  ok(rf.refs.length === 1 && rf.refs[0].startsWith('assignment|') && rf.refs[0].includes(conv.title) && rf.refs[0].includes('Procurement agent'), `each reference NAMED: the assignment, its conversation and its principal (${JSON.stringify(rf.refs)})`);
  ok(/^Disconnect only drops the token and keeps these/.test(rf.tail), 'and the Disconnect sentence');
  await p1.probe('the remove-refused dialog', '#chan-remove-refused .dialog');
  ok((await accounts()).some((a) => a.id === A.id), 'the referenced account is still there');
  await p1.evaljs(`document.querySelector('#chan-remove-refused .dialog-close').click(); 1`);
  await p1.evaljs(`(async () => { ${card(B.id)}.querySelector('.chan-sec-more').click(); await new Promise((r) => setTimeout(r, 200)); [...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent.trim() === 'Remove…').click(); return 1; })()`);
  ok(await p1.evaljs(confirmNewest), 'Remove… on the unreferenced copy, confirmed');
  let goneB = false;
  for (let i = 0; i < 60 && !goneB; i++) { goneB = !(await accounts()).some((a) => a.id === B.id); if (!goneB) await sleep(100); }
  ok(goneB && await p1.evaljs(panelWait(`() => !${card(B.id)}`)), 'an unreferenced account is removed — its card goes');
  ok(await p2.evaljs(panelWait(`() => !${card(B.id)}`)), 'and page 2 dropped it too');

  // (p) 375 px: no horizontal overflow on the panel and the dialogs
  const over = async (label) => {
    const o = await p1.evaljs(`(() => { const bad = []; for (const e of document.querySelectorAll('.rail-panel-channels *, .dialog-overlay .dialog *')) { const r = e.getBoundingClientRect(); if (!r.width) continue; if (r.right > 376.5 || r.left < -1) bad.push((e.className || e.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); } return { bad: bad.slice(0, 6), sw: document.documentElement.scrollWidth }; })()`);
    ok(!o.bad.length && o.sw <= 376, `375 px, ${label}: nothing overflows horizontally (${JSON.stringify(o)})`);
  };
  await over('the account card');
  await p1.evaljs(`document.querySelector('.rail-panel-channels [data-connect-account]').click(); 1`);
  await p1.evaljs(WAIT_DLG('connect'));
  await p1.evaljs(`(() => { const s = ${DLG('connect')}.querySelector(':scope > select'); s.value = 'lark'; s.dispatchEvent(new Event('change')); return 1; })()`);
  await over('the connect dialog (Lark, custom)');
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay .dialog-close').click(); 1`);

  // nothing the page ever opened pointed at a vendor, and every intercepted call was the stub's
  const opened = await p1.evaljs(`window.__opened || []`);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  ok(targets.every((t) => !VENDOR_HOSTS.test(t.url || '')), `no chrome target ever loaded a vendor page (${targets.map((t) => t.url).join(', ').slice(0, 200)}) — the ${opened.length} consent URLs went to the stubbed window.open`);
  const calls = fs.readFileSync(path.join(stubDir, 'calls.ndjson'), 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(calls.length > 0 && calls.some((c) => c.path === '/token') && calls.some((c) => c.host === 'gmail.googleapis.com'), `the vendor stub answered the token exchanges and the mailbox reads (${calls.length} calls)`);
}

p1.close(); p2.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
