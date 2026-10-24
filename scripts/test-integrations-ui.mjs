#!/usr/bin/env node
// INTEGRATIONS & KEYS + THE CHANNEL ACCOUNT DIALOGS IN A BROWSER (docs/design-
// communication-panel.zh.md §14.5; docs/design-integrations-per-account.zh.md
// r4 §2.5 / §3 / §8.1, chunk 3; gate row `test-integrations-ui`, heavy tier —
// a real worktree server and headless chrome at 375×667).
//
// Since r4 the Integrations window holds ONLY the rows the registry does not bind per account (the six
// agent-browser key rows, and since 2.369.260 / .261 the Dropline row and the LLM plugin's)
// (a Lark / Gmail OAuth client is chosen where the ACCOUNT is added, exactly
// like a storage mount's), so ①–⑨ drive the browser rows and ⑩ drives the
// account card and its dialogs. What is measured:
//   ⓪ the window draws EXACTLY the registry's census (every row neither `bindsPerAccount` nor `bindsPerMachine`) — no Lark / Gmail / fake
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
//          `Google authorization` block, the Mailbox scope (Inbox by default);
//      (c) Lark with no preset preselects Custom: `Custom App ID` / `Custom
//          App Secret` inline, the callback URL as a read-only row whose Copy
//          copies EXACTLY the registry's URL, the three prerequisites;
//      (d) Connect before signing in is refused in the dialog and creates
//          NOTHING; (e) the consent runs IN the dialog (link row + paste box),
//          still nothing created; (f) `Connect` creates the record under the
//          chosen preset;
//      (g) the credential-first card: name, `Preset: …` chip, the HEALTH line
//          (`[Gmail] Connected · Inbox · polling · 3 conversations · last
//          sync …`), ✎ and ⋯; (h) 2026-09-26 (aggregated IM): EVERY
//          conversation is a ↳ row with no track step, the dot ok, and a
//          refresh override repaints page 2 in place;
//      (i) the ⋯ order is EXACTLY D6;
//      (j) Edit is prefilled, carries Re-authorize · Duplicate · Remove ·
//          Save in that order, and switching the client makes Save open
//          Re-authorize with the new client (the account is not re-pointed);
//      (k) Duplicate: `{name} (copy)`, the type read-only, client / query /
//          push claim copied, the copied / not-copied paragraph, its OWN
//          consent; the copy exists unauthorized (token NOT copied, nothing
//          assigned) before that consent lands; switched to a custom client it
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
//      (r) 2.369.195 FROM STORAGE (design §2.7): a Gmail STORAGE mount holding
//          its own custom Google client (seeded into the scratch data/ before
//          boot, sealed under its .mounts-key) is offered in the Connect
//          select as `From storage: mail archive (custom client …)`; chosen, the
//          custom inputs fold away and the copy note shows; the consent URL's
//          client_id IS the mount's; Connect creates a `Custom client`
//          account holding that id; its Re-authorize select offers the same
//          storage option; the mount's secret never reaches the page;
//      (q) PIXELS: each structural probe the mockups name (the type-first
//          dialog, the client select, the custom fields, the consent block,
//          the card head / health / error line / button, the ↳ rows, the
//          refusal) is inside the viewport and PAINTED — not one flat colour,
//          ink where it carries text (the mockups' check.py rule)
//      and nothing the page ever opened pointed at a vendor host.
//   ⑫ (lane oauth-relay-road, the owner 2026-10-22: one registered redirect per app) ①–⑪ run on an instance whose relay
//      pages are BLANK (the loopback / the route as before); ⑫ reboots with the relay pages at their DEFAULT and a fleet
//      relay (VIBESPACE_OAUTH_RELAY_URL): a custom Lark app's setup lists the relay pages to register once (no per-instance
//      callback row); Connect Google from a private address names the relay page as redirect_uri; the fold says the road
//      and why and names the ONE address an admin registers; the relay page (docs/slack-relay/relay.js as shipped, the admin
//      copy's data-allow) sends the stub's code to THIS instance's landing route; the dialog says connected; Connect makes it
//      ADDENDUM 1 (the owner 2026-10-22: the public page is never a company app's): ⑪'s pod — the Google company preset names
//      no relay page — says «no relay page yet» in its setup and its fold; ⑫'s preset shows ONLY its own page (the fleet's
//      here), never the public one; a custom app's public-page row reads «you may register if … no https address»
//   ⑬ (lane oauth-setup-instructions, the owner 2026-10-23: a self-hoster with their own Google / Lark / Slack app met the
//      redirect URIs only after a refusal) a LOCAL HUB on the public relay page: ⚙ → Integrations holds a Communication
//      group FIRST with one setup card per OAuth type (never a key card: ⓪'s census unchanged) — which client to create and
//      why, the exact addresses with Copy (the one used now marked), the console path + link, where the ID / secret go,
//      the vendor's refusal words; each company preset's card (never the public page); 375 px fit; the Connect dialog
//      shows the same card FOLDED, above the sign-in block, BEFORE the first attempt (nothing opened); Gmail's OAuth client
//      type: «Desktop app» asks Google for 127.0.0.1 on any port (CONTROL: not said / Web ride the public page). ⑪ + the
//      refusal fold's console lines (Google's words, the console path, the Desktop-client case for an https address);
//      ⑨ + the setup cards' controls inside 375 px.
//   ⑪ (lane pod-oauth-callback, study 2 B2) the server rebooted AS A POD (VIBESPACE_PUBLIC_URL + a company Lark preset
//      naming its brand): the chat's door opens Connect on Lark with the company app AND brand lark (CONTROL: a preset
//      naming no brand ⇒ feishu, the testers' form); Connect Google sends the browser back to the instance's own route;
//      the paste-back is LAST and FOLDED (its box not shown); unfolded: why, the exact address an admin adds, the other
//      road — which starts the same sign-in the copy-the-address way (an ephemeral loopback) with the loopback's words.
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
const LARK_CB = require(path.join(repo, 'src/channels/lark/manifest.js')).LARK_CALLBACK_URL;
const BROWSER_ROWS = ['cloak', 'cloud:browserbase', 'cloud:browserless', 'cloud:kernel', 'cloud:browseruse', 'cloud:agentcore'];
// int260 + int258 (voice P0's dropline row and D1's llm row — the Language model card — = cards 7 and 8): the window's cards are THE REGISTRY'S OWN CENSUS — every row that is not
// `bindsPerAccount` (an account-bound row's OAuth client is chosen where the account is added) — never a literal count;
// .293 (the .292 mirror's red): nor `bindsPerMachine` — R1b's remoteapp row is ONE paired machine's own sign-in, set on that machine's card: never listed, never a card;
// ①–⑨ still drive BROWSER_ROWS, which the census must hold.
const WINDOW_ROWS = R.rowIds().filter((id) => !R.bindsPerAccount(id) && !R.bindsPerMachine(id));
const sameSet = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
const SECRET40 = 'sk-' + 'Q7f3'.repeat(8) + 'ZZZ99';   // 40 chars
const PRESETS = JSON.stringify([
  { key: 'org1', label: 'Org 1', clientId: 'org1.apps.googleusercontent.com', clientSecret: 'org1-secret-000000' },
  { key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' },
]);
const CLUSTER_BB = JSON.stringify([{ id: 'cloud:browserbase', label: 'Cluster Browserbase', values: { apiKey: 'cluster-bb-key-12345678' } }]);
const CUSTOM_ID = 'dup-client.apps.googleusercontent.com';
const CUSTOM_SECRET = 'dup-custom-secret-000000';
const VENDOR_HOSTS = /google\.com|googleapis\.com|feishu\.cn|larksuite\.com|slack\.com/;

// ── throwaway worktree + WORKING-TREE overlay ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

// (r) FROM STORAGE: a Gmail storage mount holding its OWN custom Google client, written into the
// scratch server's data/ BEFORE it boots (sealed under that data dir's .mounts-key by the real MountManager)
const MOUNT_CID = '111122223333-mailfake.apps.googleusercontent.com';
const MOUNT_CSEC = 'GOCSPX-mail-MOUNT-s3cret-ui-7Q';   // fake, unmistakable in any byte stream
const MOUNT_EMAIL = 'archive.owner@example.test';
const MOUNT_ID = (() => {
  const { MountManager } = require(path.join(wt, 'src/mounts.js'));
  const mm = new MountManager({ dataDir: path.join(wt, 'data') });
  return mm.add({ type: 'gmail', name: 'mail archive', token: '{"access_token":"fake-at","refresh_token":"fake-rt"}', clientId: MOUNT_CID, clientSecret: MOUNT_CSEC, email: MOUNT_EMAIL });
})();
const MOUNT_OPTION = `From storage: mail archive (custom client ${MOUNT_CID.slice(0, 12)}…, ${MOUNT_EMAIL})`;
// lane oauth-relay-road: ①–⑪ run on an instance with NO relay page (Settings → Channels: the Lark / Gmail relay pages
// blank — the local hub's loopback and the pod's route as they were); ⑫ reboots with the relay pages at their defaults
const SETTINGS_FILE = path.join(wt, 'data', 'settings.json');
fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ 'channels.larkRelayUrl': '', 'channels.gmailRelayUrl': '' }));

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
  '--host-resolver-rules=MAP pod-road.example.test 127.0.0.1',   // ⑪: the page on a NAME (a browser that is not on the instance's loopback), served by this scratch server
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
  const load = async (url = `${base}/`) => {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: NO_POPUPS });
    await cdp('Page.navigate', { url });
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
    if (document.querySelectorAll('.integ-card').length >= ${WINDOW_ROWS.length}) return true;
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

// ── ⓪ the window keeps ONLY the registry's census (every row bound neither per account nor per machine) ──
{
  const g = await api('GET', '/api/integrations');
  const ids = ((g.json && g.json.integrations) || []).map((x) => x.id).sort();
  ok(BROWSER_ROWS.every((id) => WINDOW_ROWS.includes(id)) && WINDOW_ROWS.length > 0 && R.rowIds().some((id) => R.bindsPerAccount(id) && !WINDOW_ROWS.includes(id)) && R.rowIds().some((id) => R.bindsPerMachine(id) && !WINDOW_ROWS.includes(id)), `the census (${WINDOW_ROWS.join(', ')}) holds every browser row the legs below drive and leaves the account-bound and per-machine rows out`);
  ok(sameSet(ids, WINDOW_ROWS), `GET /api/integrations lists exactly the registry's census (${ids.join(', ')})`);
  ok(await p1.evaljs(OPEN(BB)), 'app.openIntegration(<a browser row>) opened the window');
  const cards = await p1.evaljs(`[...document.querySelectorAll('.integ-card')].map((c) => c.dataset.integ).sort()`);
  ok(sameSet(cards, WINDOW_ROWS), `the window draws exactly the census's cards — no Lark / Gmail / fake card (${cards.join(', ')})`);
  ok(!sameSet([...cards, 'lark'], WINDOW_ROWS) && !sameSet([...cards, 'remoteapp'], WINDOW_ROWS) && !sameSet(cards.slice(0, -1), WINDOW_ROWS), 'CONTROL: the card check is not vacuous — a leaked account-bound card (lark), a leaked per-machine card (remoteapp) and one registry row missing each fail it');
  ok(await p1.evaljs(`!document.querySelector('.integ-card[data-integ="lark"], .integ-card[data-integ="gmail"], .integ-card[data-integ="fake"]')`), 'no retired OAuth-client card anywhere on the page');
  // lane dropline-connect-door: the cards drawing a CONNECT BLOCK (a row's OAuth tier) = exactly the rows declaring `connect`
  // (by shape, never by id); on this plain-http server the block is never dead — it says the sentence the hub picked
  const CONNECT_ROWS = WINDOW_ROWS.filter((id) => R.rowById(id).connect);
  const blocks = await p1.evaljs(`(async () => { for (let i = 0; i < 60 && document.querySelectorAll('.integ-card .integ-connect .oauth-connect-btn').length < ${CONNECT_ROWS.length}; i++) await new Promise((r) => setTimeout(r, 100)); return [...document.querySelectorAll('.integ-card')].filter((c) => c.querySelector('.integ-connect .oauth-connect-btn')).map((c) => c.dataset.integ).sort(); })()`);
  ok(CONNECT_ROWS.length > 0 && sameSet(blocks, CONNECT_ROWS), `the window draws a Connect block on exactly the rows declaring connect (${blocks.join(', ')} vs ${CONNECT_ROWS.join(', ')})`);
  ok(!sameSet(blocks.slice(1), CONNECT_ROWS) && !sameSet([...blocks, BB], CONNECT_ROWS), 'CONTROL: the block census is not vacuous — a lost block and a block on a key-only row each fail it');
  for (const id of CONNECT_ROWS) {
    const st = (await api('GET', R.rowById(id).connect.status)).json || {};
    const why = await p1.evaljs(`(document.querySelector('.integ-card[data-integ="${id}"] .oauth-connect-words') || {}).textContent || ''`);
    ok(st.connectVia === null && !!st.connectWhy && why === R.rowById(id).connect.whys[st.connectWhy], `${id}: no https here (connectVia null) ⇒ the block says the hub's sentence for connectWhy=${st.connectWhy} (${why})`);
  }
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
  // Test the cloak row, waiting for THE verdict asked (a card keeps its last result drawn until the next one lands)
  // (the .197 integration) the drawn verdict is marked stale BEFORE the click, so two Passed in a row are two answers
  const cloakTestUntil = (want) => p1.evaljs(`(async () => { for (const o of ${CARD('cloak')}.querySelectorAll('.integ-test-result .integ-verdict')) o.dataset.stale = '1'; ${CARD('cloak')}.querySelector('.integ-test').click(); for (let i = 0; i < 60; i++) { const r = ${CARD('cloak')}.querySelector('.integ-test-result'); const v = r && r.querySelector('.integ-verdict'); if (v && !v.dataset.stale && v.textContent === ${JSON.stringify(want)}) return { verdict: v.textContent, caveat: !!r.querySelector('.integ-caveat'), err: (r.querySelector('.integ-test-error') || {}).textContent || '', text: r.textContent }; await new Promise((r) => setTimeout(r, 100)); } const r = ${CARD('cloak')}.querySelector('.integ-test-result'); return { verdict: null, text: r ? r.textContent : null }; })()`);
  // lane browser-dialog (the naive-user verifier, 2026-09-28) required the card and the switch dialog to say ONE thing about
  // an empty cloak key. lane-cloak (MEASURED 2026-09-28, the .197 integration) made that one thing "no key needed": the
  // free CloakBrowser build VibeSpace installs runs with no key and no sign-in, so a switch / a start no longer answers
  // backend_no_key for cloak (keyRequiredFor('cloak') === false; every cloud row still requires its key) — and the
  // shape check PASSES with no key, beside its caveat
  const SW = require(path.join(wt, 'src/browser-switch.js'));
  ok(SW.keyRequiredFor('cloak') === false && SW.keyRequiredFor('cloud:browseruse') === true, 'the switch rule (the dialog\'s side): cloak needs NO key, a cloud row still does');
  const t0 = await cloakTestUntil('Passed');
  ok(t0 && t0.verdict === 'Passed' && !t0.err && t0.caveat, `a cloak Test with NO key resolved draws Passed beside the caveat — the card agrees with the switch, which no longer refuses a keyless cloak (${JSON.stringify(t0 && (t0.err || t0.text)).slice(0, 160)})`);
  // a well-formed cb_ key saved the user's way (Set → password input → Save), then the shape check passes
  const saved = await p1.evaljs(`(async () => {
    const row = ${CARD('cloak')}.querySelector('.integ-field[data-field="licenseKey"]');
    row.querySelector('.integ-replace').click();
    const inp = row.querySelector('input[type="password"]');
    if (!inp) return { why: 'no password input after Set' };
    inp.value = 'cb_' + 'ShapeOnly0001';
    row.querySelector('.mounts-btn-primary').click();
    for (let i = 0; i < 60; i++) { const c2 = ${CARD('cloak')}; const m = c2 && c2.querySelector('.integ-field[data-field="licenseKey"] .integ-mask'); if (m && /••••/.test(m.textContent) && !c2.querySelector('input[type="password"]')) return { mask: m.textContent }; await new Promise((r) => setTimeout(r, 100)); }
    return { why: 'never re-rendered' };
  })()`);
  const t1 = saved && saved.mask ? await cloakTestUntil('Passed') : null;
  ok(t1 && t1.verdict === 'Passed' && t1.caveat, `a passing Test (cloak, a well-formed cb_ key saved) draws Passed WITH the caveat, never a bare tick (${JSON.stringify({ saved, t1: t1 && t1.text }).slice(0, 160)})`);
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
  ok(gone.wins === 1 && gone.threw === null && gone.after === gone.before && gone.cards === WINDOW_ROWS.length, `a focus id that is retired (lark / gmail) or unknown opens nothing new, highlights nothing new and throws nothing (${JSON.stringify(gone)})`);
}

// ── ⑨ 375×667: every control inside the viewport ──
{
  const out = await p1.evaljs(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.integ-card button, .integ-card select, .integ-card input, .integ-setup-card button, .integ-setup-card a')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > 376 || r.left < -1) bad.push((el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right));
    }
    const cards = [...document.querySelectorAll('.integ-card')].map((c) => Math.round(c.getBoundingClientRect().width));
    return { bad, cards, n: document.querySelectorAll('.integ-card').length };
  })()`);
  ok(out.n === WINDOW_ROWS.length && !out.bad.length, `375×667: all ${out.n} cards, every control inside the viewport (offenders: ${out.bad.join(', ') || 'none'}; card widths ${out.cards.join('/')})`);
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
  ok(/^Connect an account \((?:Lark \/ 飞书|Gmail|Slack)(?:, (?:Lark \/ 飞书|Gmail|Slack)){2}\)$/.test(entry.text) && entry.perKind === 0, `the entry names the types and the per-kind buttons are retired (${JSON.stringify(entry)})`);
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
    return { labels, clientValue: client && client.value, options: client ? [...client.options].map((o) => o.textContent) : [], hint: hint && hint.className === 'mounts-field-hint' ? hint.textContent : null, block: block ? block.querySelector('button').textContent : null, blocks: d.querySelectorAll('.mounts-drive-connect').length, query: (inputs.find((i) => i.value === 'label:INBOX') || {}).value || null, scope: ([...d.querySelectorAll(':scope > select')].find((s) => s.style.display !== 'none' && [...s.options].some((o) => o.value === 'inbox')) || {}).value || null, submit: d.querySelector('.dialog-actions .btn-create').textContent };
  })()`);
  ok(JSON.stringify(gm.labels) === JSON.stringify(['Type', 'Name', 'OAuth client', 'Google authorization', 'Mailbox', 'OAuth client type']), `Gmail's fields in the storage order: Type → Name → OAuth client → Google authorization → the Mailbox scope (the labels / query fields fold away until chosen) → the OAuth client type (read at each sign-in — lane oauth-setup-instructions) (${JSON.stringify(gm.labels)})`);
  ok(gm.clientValue === 'org1' && JSON.stringify(gm.options) === JSON.stringify(['Preset: Org 1', 'Preset: Channels', MOUNT_OPTION, 'Custom (own client id/secret)']), `\`OAuth client\` preselects presets[0] and offers Preset × 2 + the storage mount's own client (r) + Custom, no Built-in (${JSON.stringify(gm)})`);
  ok(gm.hint === R.rowById('gmail').clientHint, 'the registry\'s clientHint is the .mounts-field-hint line under the select');
  ok(gm.block === 'Connect Google' && gm.scope === 'inbox' && gm.query === null && gm.submit === 'Connect', `the \`Google authorization\` block (the storage .mounts-drive-connect, one per type, the other hidden), the Mailbox scope on Inbox (the query field hidden), and .btn-create "Connect" (${JSON.stringify({ block: gm.block, blocks: gm.blocks, scope: gm.scope, query: gm.query, submit: gm.submit })})`);
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
  ok(/✓ Connected as ada@example\.test — finish with the “Connect” button below\./.test(signed || ''), `the block says the sign-in finished and NAMES who signed in (slack-landing-nologin: the consent may land in another browser profile) (${JSON.stringify(signed)})`);
  ok((await accounts()).length === 0, 'STILL nothing created — the record waits for Connect');

  // (f) Connect creates the record
  await p1.evaljs(`${DLG('connect')}.querySelector('.dialog-actions .btn-create').click(); 1`);
  let accts = [];
  for (let i = 0; i < 60 && !accts.length; i++) { accts = await accounts(); if (!accts.length) await sleep(100); }
  const A = accts[0];
  ok(accts.length === 1 && A.kind === 'gmail' && A.credentialKey === 'cluster:org1' && A.auth.tokenHeld && A.auth.user === 'ada@example.test', `Connect CREATED the account under the chosen preset, signed in as the stub's user (${JSON.stringify(accts.map((a) => ({ id: a.id, key: a.credentialKey, user: a.auth.user })))})`);
  ok(await p1.evaljs(`(async () => { for (let i = 0; i < 60; i++) { if (!document.querySelector('#mounts-dialog-overlay')) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`), 'and closed the dialog');

  // lane channels-fold-default: a section with nothing that needs the person starts folded (and Accounts with it) — the person opened it
  await api('PATCH', '/api/user-state', { channelsPanelFolds: { [`acct:${A.id}`]: false } });
  // (g) the credential-first card (2026-09-26, the aggregated IM: a linked account IS its conversations)
  ok(await p1.evaljs(panelWait(`() => { const c = ${card(A.id)}; return !!(c && c.querySelector('.chan-sec-health') && /last sync/.test(c.querySelector('.chan-sec-health').textContent) && c.querySelectorAll('.chan-row').length === 3); }`)), 'the account card is drawn with its health line and its conversations after its first pass');
  const c0 = await p1.evaljs(`(() => { const c = ${card(A.id)}; const h = c.querySelector('.chan-sec-head'); return { name: h.querySelector('.chan-sec-name').textContent, chip: (h.querySelector('.chan-cred-chip') || {}).textContent, dot: h.querySelector('.chan-dot').dataset.state, edit: !!h.querySelector('.mounts-icon-btn'), more: !!h.querySelector('.chan-sec-more'), tag: c.querySelector('.chan-sec-health .mounts-typetag').textContent, health: c.querySelector('.chan-sec-health-text').textContent, empty: !!c.querySelector('.chan-sec-empty'), rows: c.querySelectorAll('.chan-row').length }; })()`);
  ok(c0.name === 'Gmail · ada@example.test' && c0.chip === 'Preset: Org 1' && c0.edit && c0.more, `the head: name + login, the client chip "Preset: Org 1", ✎ and ⋯ (${JSON.stringify(c0)})`);
  ok(c0.tag === 'Gmail' && /^Connected · Inbox · polling · 3 conversations( · \d+ unread)? · last sync /.test(c0.health), `the HEALTH line in the storage detail-line grammar: [Gmail] Connected · Inbox · polling · 3 conversations · last sync … (${c0.health})`);
  ok(!c0.empty && c0.rows === 3 && c0.dot === 'ok', `no track step: every conversation of the account is a row at once, no login-only note, an ok dot (${JSON.stringify({ rows: c0.rows, dot: c0.dot })})`);
  await p1.probe('the card head', `.rail-panel-channels .chan-account[data-adapter="${A.id}"] .chan-sec-head`);
  await p1.probe('the health line', `.rail-panel-channels .chan-account[data-adapter="${A.id}"] .chan-sec-health`);

  // (o) page 2 watches the accounts IN PLACE from here on
  ok(await p2.load() && await p2.evaljs(panelWait(`() => !!${card(A.id)}`)), 'page 2 opened the panel and sees the account');
  await p2.evaljs(`(() => { window.__marker = 'p2-alive'; window.__chanFetches = 0; const of = window.fetch; window.fetch = function (u, ...r) { if (/^\\/api\\/channels(\\?|$)/.test(String(u))) window.__chanFetches++; return of.call(this, u, ...r); }; return 1; })()`);

  // (h) every conversation is a ↳ CHILD row; a refresh override repaints page 2 in place
  const rows = await p1.evaljs(`(() => { const c = ${card(A.id)}; return { arrows: [...c.querySelectorAll('.chan-row-child')].map((r) => (r.firstElementChild && r.firstElementChild.classList.contains('chan-av') ? 'av' : '') + (r.querySelector('.mounts-child-arrow') ? '↳' : '')), dot: c.querySelector('.chan-sec-head .chan-dot').dataset.state, count: c.querySelector('.chan-sec-count').textContent }; })()`);
  ok(rows.arrows.join(',') === 'av,av,av' && rows.dot === 'ok' && rows.count === '3', `each child row is a chat row led by its avatar (channels-list-polish: no ↳); the dot is ok; the count reads 3 (${JSON.stringify(rows)})`);
  await p1.probe('the ↳ conversation rows', `.rail-panel-channels .chan-account[data-adapter="${A.id}"] .chan-rows`);
  const firstConv = (await api('GET', '/api/channels')).json.conversations.find((c) => c.adapterId === A.id);
  const chipOfConv = `(() => { const r = document.querySelector('.rail-panel-channels .chan-row[data-conv="${A.id}/' + ${JSON.stringify(firstConv.id)} + '"]'); const c = r && r.querySelector('.chan-row-sub .chan-chip'); return c ? c.textContent + '|' + (r.title || '') : null; })()`;
  const chipBefore = await p2.evaljs(chipOfConv);
  const ov = await api('PUT', `/api/channels/${encodeURIComponent(A.id)}/${encodeURIComponent(firstConv.id)}/refresh`, { every: 'paused' });
  ok(ov.status === 200, `FIXTURE: one conversation's refresh is paused (${ov.status})`);
  const p2rows = await p2.evaljs(panelWait(`() => { const v = ${chipOfConv}; return !!v && v !== ${JSON.stringify(chipBefore)}; }`));
  const p2state = await p2.evaljs(`({ marker: window.__marker, fetches: window.__chanFetches })`);
  ok(p2rows && p2state.marker === 'p2-alive' && p2state.fetches === 0, `page 2 repainted the row's freshness pill IN PLACE from the broadcast — no reload, no /api/channels fetch (${JSON.stringify(p2state)})`);
  await api('PUT', `/api/channels/${encodeURIComponent(A.id)}/${encodeURIComponent(firstConv.id)}/refresh`, { every: null });

  // (i) the ⋯ order = D6
  const menu = await p1.evaljs(`(async () => { ${card(A.id)}.querySelector('.chan-sec-more').click(); await new Promise((r) => setTimeout(r, 200)); const m = document.querySelector('.context-menu'); const items = m ? [...m.children].map((e) => e.classList.contains('context-menu-separator') ? '‖' : e.textContent.trim()) : []; if (m) m.remove(); return items; })()`);
  // R4 (2026-09-27): the one hand-off verb became TWO operations, access first
  // lane account-policy-door (2.369.233): the account's policy door, Reach & policy…, right after Search messages… (oauth-field-parity D6_ORDER)
  const D6 = ['Open conversation window', 'Search messages…', 'Reach & policy…', 'Grant access…', 'Notify…', 'API access…', 'Conversations matching a rule…', 'Options', 'Push…', '‖', 'Re-authorize', 'Duplicate…', 'Disconnect', 'Remove…', '‖', 'Disable'];
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
  ok(idx.every((c) => !c.assignment), 'nothing assigned on the copy');
  ok(!!url2 && new URL(url2).searchParams.get('client_id') === CUSTOM_ID, `its OWN consent runs under the custom client it was switched to (client_id ${url2 && new URL(url2).searchParams.get('client_id')})`);
  ok((await followConsent(url2)) === 200, 'the copy\'s redirect lands on the loopback');
  const dupSigned = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { const s = ${DLG('duplicate')}.querySelector('.mounts-drive-connect .mounts-field-hint').textContent; if (/Connected/.test(s)) return s; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(/Create & connect/.test(dupSigned || ''), `the block says the copy signed in (${JSON.stringify(dupSigned)})`);
  await p1.evaljs(`${DLG('duplicate')}.querySelector('.dialog-actions .btn-create').click(); 1`);
  const B = copyRec;
  await api('PATCH', '/api/user-state', { channelsPanelFolds: { [`acct:${A.id}`]: false, [`acct:${B.id}`]: false } });   // lane channels-fold-default: opened by the person
  ok(await p1.evaljs(panelWait(`() => !!${card(B.id)} && !document.querySelector('#mounts-dialog-overlay')`)), 'Create & connect closed the dialog; the SIBLING card appears');

  // (l) the dead sign-in: the red line + Reconnect under the account (lane channel-reauth-visible — the owner 2026-10-23:
  // 「进来之后账号行下方显示登录失效需要 reauth」; it replaces D8's «Couldn't connect: …» sentence for a sign-in that died:
  // ONE sentence, one verb), and the dialog heals it
  ok(await p1.evaljs(panelWait(`() => { const c = ${card(B.id)}; return !!(c && c.querySelector('.chan-sec-reauth')); }`)), 'the copy\'s first refresh was refused (invalid_grant) ⇒ its card draws the dead sign-in\'s red line');
  const bad = await p1.evaljs(`(() => { const c = ${card(B.id)}; const e = c.querySelector('.chan-sec-reauth'); const b = e.querySelector('.chan-sec-reauth-btn'); return { text: e.querySelector('.chan-sec-reauth-text').textContent, errline: !!c.querySelector('.mounts-errline'), btn: b && b.textContent, btnCls: b && b.className, chip: c.querySelector('.chan-cred-chip').textContent, dot: c.querySelector('.chan-sec-head .chan-dot').dataset.state }; })()`);
  const whyB = (((await accounts()).find((a) => a.id === B.id) || {}).auth || {}).why;
  ok(/^(refresh-refused|last-pass-refused)$/.test(whyB || '') && /^Sign-in expired — re-authorize · the vendor refused the refresh token · since \d\d:\d\d$/.test(bad.text) && !bad.errline, `the red line says what, why (Google's invalid_grant) and since when — and no second «Couldn't connect» sentence beside it (lane channel-reauth-visible; was D8's mounts' sentence + the why code in brackets (${JSON.stringify(bad.text)})`);
  ok(bad.btn === 'Reconnect' && bad.btnCls === 'mounts-btn mounts-btn-primary chan-sec-reauth-btn' && bad.chip === 'Custom client' && bad.dot === 'bad', `the primary Reconnect button inline (the storage button class), the "Custom client" chip, a bad dot (${JSON.stringify(bad)})`);
  await p1.probe('the red line + Reconnect button', `.rail-panel-channels .chan-account[data-adapter="${B.id}"] .chan-sec-reauth`);
  await p1.evaljs(`${card(B.id)}.querySelector('.chan-sec-reauth-btn').click(); 1`);
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
  ok(await p1.evaljs(panelWait(`() => { const c = ${card(B.id)}; return !!(c && !c.querySelector('.mounts-errline') && !c.querySelector('.chan-sec-reauth') && c.querySelector('.chan-sec-health')); }`)), 'the card heals (lane channel-reauth-visible: the red line too — the good pass after the consent retracts it): the error line is gone, the health line is back');

  // (m) Edit on the custom account prefills the SECRET (D3)
  await p1.evaljs(`${card(B.id)}.querySelector('.chan-sec-head .mounts-icon-btn').click(); 1`);
  ok(await p1.evaljs(WAIT_DLG('edit')), 'Edit on the custom account');
  const ec = await p1.evaljs(`(() => { const d = ${DLG('edit')}; const inputs = [...d.querySelectorAll(':scope > input')].filter((i) => i.style.display !== 'none'); return { client: d.querySelector(':scope > select').value, values: inputs.map((i) => i.value), labels: ${visibleLabels('edit')} }; })()`);
  ok(ec.client === 'custom' && ec.values.includes(CUSTOM_ID) && ec.values.includes(CUSTOM_SECRET) && ec.labels.includes('Custom OAuth client ID') && ec.labels.includes('Custom OAuth client secret'), `D3: the custom client id AND secret are prefilled with their real values (the storage edit rule) (${JSON.stringify(ec.labels)})`);
  ok(!(await p2.evaljs(`document.body.innerHTML.includes(${JSON.stringify(CUSTOM_SECRET)})`)), 'the secret never reached the OTHER client (it rides only the owner-only config route, never a broadcast)');
  ok(!(await api('GET', '/api/channels')).text.includes(CUSTOM_SECRET), 'nor the digest');
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay .dialog-close').click(); 1`);

  // (n) Remove: refused BY NAME while referenced; an unreferenced account goes
  const conv = (await api('GET', '/api/channels')).json.conversations.find((c) => c.adapterId === A.id);
  const asg = await api('PUT', `/api/channels/${encodeURIComponent(A.id)}/${encodeURIComponent(conv.id)}/assignment`, { assignment: { principal: { kind: 'agent', id: 'agent-7', name: 'Procurement agent' }, mode: 'all' } });
  ok(asg.status === 200, 'FIXTURE: one conversation of the first account is assigned to an agent');
  const confirmNewest = `(async () => { for (let i = 0; i < 40; i++) { const b = [...document.querySelectorAll('.dialog-overlay .dialog-footer .btn-create')].pop(); if (b) { b.click(); return true; } await new Promise((r) => setTimeout(r, 50)); } return false; })()`;
  await p1.evaljs(`(async () => { ${card(A.id)}.querySelector('.chan-sec-more').click(); await new Promise((r) => setTimeout(r, 200)); [...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent.trim() === 'Remove…').click(); return 1; })()`);
  ok(await p1.evaljs(confirmNewest), 'Remove… asks first (the confirm dialog)');
  ok(await p1.evaljs(`(async () => { for (let i = 0; i < 60; i++) { if (document.querySelector('#chan-remove-refused')) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`), 'a referenced account is REFUSED — the "Cannot remove" dialog');
  const rf = await p1.evaljs(`(() => { const d = document.querySelector('#chan-remove-refused'); return { title: d.querySelector('.dialog-header h3').textContent, lead: d.querySelector('.chan-flow-refusal').textContent, refs: [...d.querySelectorAll('[data-ref-kind]')].map((e) => e.dataset.refKind + '|' + e.textContent), tail: [...d.querySelectorAll('p.dialog-hint')].map((p) => p.textContent).join(' ') }; })()`);
  ok(rf.title === 'Cannot remove "Gmail · ada@example.test"' && /still referenced/.test(rf.lead), `titled by the account's name (${rf.title})`);
  // R4 (2026-09-27): the compatibility write = one ACCESS row (+ its notification) — the reference is the access row
  ok(rf.refs.length === 1 && rf.refs[0].startsWith('access|') && rf.refs[0].includes(conv.title) && rf.refs[0].includes('Procurement agent'), `each reference NAMED: the access row, its conversation and its principal (${JSON.stringify(rf.refs)})`);
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

  // (r) FROM STORAGE (design §2.7): the storage mount's own client, borrowed without anyone seeing its secret
  console.log('  (r) from storage');
  const beforeR = (await accounts()).map((a) => a.id);
  await p1.evaljs(`document.querySelector('.rail-panel-channels [data-connect-account]').click(); 1`);
  ok(await p1.evaljs(WAIT_DLG('connect')), '(r) Connect an account opens');
  await p1.evaljs(`(() => { const s = ${DLG('connect')}.querySelector(':scope > select'); s.value = 'gmail'; s.dispatchEvent(new Event('change')); return 1; })()`);
  const clientSel = `[...${DLG('connect')}.querySelectorAll(':scope > select')].find((s) => s.style.display !== 'none' && [...s.options].some((o) => o.value === 'custom'))`;
  const pick = await p1.evaljs(`(() => { const c = ${clientSel}; const o = [...c.options].find((x) => x.textContent === ${JSON.stringify(MOUNT_OPTION)}); if (!o) return null; c.value = o.value; c.dispatchEvent(new Event('change')); return o.value; })()`);
  ok(pick === `mount:${MOUNT_ID}`, `(r) the select offers "${MOUNT_OPTION}" (value mount:<the mount's id>) and it is chosen (${pick})`);
  const rs = await p1.evaljs(`(() => {
    const d = ${DLG('connect')};
    const note = [...d.querySelectorAll(':scope > .mounts-note')].find((e) => e.style.display !== 'none');
    return { labels: ${visibleLabels('connect')}, note: note ? note.textContent : null, block: ([...d.querySelectorAll('.mounts-drive-connect')].find((b) => b.style.display !== 'none') || { querySelector: () => ({}) }).querySelector('button').textContent };
  })()`);
  ok(JSON.stringify(rs.labels) === JSON.stringify(['Type', 'Name', 'OAuth client', 'Google authorization', 'Mailbox', 'OAuth client type']) && /^The server copies this storage mount’s client id and secret onto the account — the secret never passes through this page\./.test(rs.note || '') && rs.block === 'Connect Google',
    `(r) chosen: no custom id / secret inputs, the note says the server copies the secret, the Google authorization block stays (${JSON.stringify(rs)})`);
  stubMode({ email: MOUNT_EMAIL, refresh: 'ok', expiresIn: 3600 });
  await p1.evaljs(`(() => { const d = ${DLG('connect')}; d.querySelector('.mounts-drive-connect .mounts-oauth-link')?.remove(); [...d.querySelectorAll('.mounts-drive-connect')].find((b) => b.style.display !== 'none').querySelector('button').click(); return 1; })()`);
  const urlR = await p1.evaljs(consentUrlIn('#mounts-dialog-overlay .mounts-drive-connect .mounts-oauth-link input'));
  ok(!!urlR && new URL(urlR).searchParams.get('client_id') === MOUNT_CID, `(r) THE consent URL's client_id is the storage mount's own client (${urlR ? new URL(urlR).searchParams.get('client_id') : null})`);
  ok(!(await p1.evaljs(`document.documentElement.outerHTML.includes(${JSON.stringify(MOUNT_CSEC)})`)), '(r) the mount\'s secret is nowhere in the page');
  ok((await followConsent(urlR)) === 200, '(r) the redirect lands on the loopback');
  const signedR = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { const b = [...${DLG('connect')}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none'); const s = b && b.querySelector('.mounts-field-hint').textContent; if (/Connected/.test(s || '')) return s; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(/Connected/.test(signedR || ''), `(r) signed in under the storage client (${JSON.stringify(signedR)})`);
  await p1.evaljs(`${DLG('connect')}.querySelector('.dialog-actions .btn-create').click(); 1`);
  let C = null;
  for (let i = 0; i < 60 && !C; i++) { C = (await accounts()).find((a) => !beforeR.includes(a.id)) || null; if (!C) await sleep(100); }
  ok(!!C && C.credentialKey === 'custom' && C.customClient && C.customClient.appId === MOUNT_CID && C.auth.tokenHeld && C.auth.user === MOUNT_EMAIL, `(r) Connect created a Custom-client account holding the MOUNT's client id, signed in (${JSON.stringify(C && { key: C.credentialKey, appId: C.customClient && C.customClient.appId, user: C.auth.user })})`);
  ok(!!C && await p1.evaljs(panelWait(`() => { const c = ${card(C ? C.id : '')}; return !!(c && c.querySelector('.chan-cred-chip') && c.querySelector('.chan-cred-chip').textContent === 'Custom client'); }`)), '(r) its card wears the Custom client chip');
  // its Re-authorize offers the same storage option
  await p1.evaljs(`(async () => { ${card(C.id)}.querySelector('.chan-sec-more').click(); await new Promise((r) => setTimeout(r, 200)); const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => /^(Re-authorize|Connect)$/.test(e.textContent.trim())); if (it) it.click(); return !!it; })()`);
  ok(await p1.evaljs(WAIT_DLG('reauth')), '(r) Re-authorize on the new account opens');
  const reR = await p1.evaljs(`(() => { const s = ${DLG('reauth')}.querySelector(':scope > select'); return { value: s.value, options: [...s.options].map((o) => o.textContent) }; })()`);
  ok(reR.value === 'custom' && reR.options.includes(MOUNT_OPTION) && reR.options[reR.options.length - 1] === 'Custom (own client id/secret)', `(r) the Re-authorize select offers the storage option too (the account's own custom client selected) (${JSON.stringify(reR)})`);
  await p1.evaljs(`document.querySelector('#chan-reauth-dialog .dialog-close').click(); 1`);
  const cfgR = await api('GET', '/api/channels/oauth/mount-clients?kind=gmail');
  ok(cfgR.status === 200 && cfgR.json.clients.some((x) => x.mountId === MOUNT_ID) && !cfgR.text.includes(MOUNT_CSEC) && !cfgR.text.includes(MOUNT_CID), '(r) the list route answers the mount without its secret or its whole id');
  ok(!(await api('GET', '/api/channels')).text.includes(MOUNT_CSEC) && !(await p2.evaljs(`document.body.innerHTML.includes(${JSON.stringify(MOUNT_CSEC)})`)), '(r) nor does the digest or the other client');
  await api('DELETE', `/api/channels/adapters/${encodeURIComponent(C.id)}`);
  ok(await p1.evaljs(panelWait(`() => !${card(C.id)}`)), '(r) FIXTURE: the borrowed-client account is removed again (the later legs see the accounts they made)');

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

  // (s) design 012 (Slack S1) + design 017 (lane slack-connect-easy) — THE SLACK CONNECT CARD AS THREE NUMBERED STEPS,
  // in 中文: no OAuth client to choose; ① opens Slack's app page and takes the setup token (a SECRET box), the wrong
  // token is refused in the dialog by name, the right one makes the app over the vendor stub's apps.manifest.create;
  // ② opens the app's own install page; a dialog closed and reopened resumes at ②; ③ + the dialog's Connect make the
  // account; the fallback fold's "Copy app setup" is the link's own JSON; inactive steps FOLDED (no greyed control) at
  // 375 and 860 px; the account card says where the copy lives (Q2) and the free plan's hidden history
  {
  console.log('  (s) Slack: the connect card as three steps (zh)');
  const FX_ = require(path.join(repo, 'scripts/fixtures/slack-vendor.cjs'));
  const SLACK_TOKEN = FX_.TOKEN, SETUP = FX_.CONFIG_TOKEN;
  await p1.evaljs(`localStorage.setItem('vibespace.lang', 'zh'); localStorage.removeItem('vs-paste-app:slack'); 1`);
  ok(await p1.load(), 'the page reloads in 中文');
  const openSlack = async () => {
    ok(await p1.evaljs(panelWait(`() => !!document.querySelector('.rail-panel-channels [data-connect-account]')`)), 'the Channels panel draws its Connect entry (zh)');
    await p1.evaljs(`document.querySelector('.rail-panel-channels [data-connect-account]').click(); 1`);
    ok(await p1.evaljs(WAIT_DLG('connect')), 'the connect dialog opens');
    await p1.evaljs(`(() => { const s = ${DLG('connect')}.querySelector(':scope > select'); s.value = 'slack'; s.dispatchEvent(new Event('change')); return 1; })()`);
  };
  const STEPS = `[...${DLG('connect')}.querySelectorAll('.chan-paste-steps')].find((x) => x.style.display !== 'none')`;
  const look = () => p1.evaljs(`(() => {
    const d = ${DLG('connect')}, w = ${STEPS};
    const vis = (e) => !!e && e.style.display !== 'none' && !e.hidden && e.getClientRects().length > 0;
    const client = [...d.querySelectorAll(':scope > select')].find((s) => vis(s) && [...s.options].some((o) => o.value === 'custom'));
    if (!w) return { client: !!client, steps: null };
    const dr = d.getBoundingClientRect();
    const btns = [...w.querySelectorAll('button')].filter(vis);
    return {
      client: !!client, clientValue: client ? client.value : null, notes: [...d.querySelectorAll(':scope > .mounts-note')].filter(vis).length,
      steps: [...w.querySelectorAll('.chan-paste-step')].map((x) => x.dataset.state).join(),
      titles: [...w.querySelectorAll('.chan-paste-step-title')].map((x) => x.textContent),
      text: w.innerText, made: (w.querySelector('.chan-paste-made') || {}).textContent || null,
      greyed: btns.filter((x) => x.disabled).length, small: btns.filter((x) => x.getBoundingClientRect().height < 36).map((x) => x.textContent),
      outside: [...w.querySelectorAll('.chan-paste-step, button, input')].filter(vis).filter((x) => { const r = x.getBoundingClientRect(); return r.left < dr.left - 1 || r.right > dr.right + 1; }).length,
      overflow: w.scrollWidth > w.clientWidth + 1,
      boxes: [...w.querySelectorAll('input.chan-paste-input')].map((i) => ({ type: i.type, auto: i.autocomplete, ph: i.placeholder, shown: vis(i) })),
    };
  })()`);
  const fit = (g, label) => ok(g.steps && g.greyed === 0 && !g.small.length && g.outside === 0 && !g.overflow, `${label}: no greyed control, every button ≥ 36 px, nothing outside the dialog (${JSON.stringify({ greyed: g.greyed, small: g.small, outside: g.outside, overflow: g.overflow })})`);
  const press = (step, label) => p1.evaljs(`(() => { const b = [...${STEPS}.querySelectorAll('.chan-paste-step[data-step="${step}"] button, .chan-paste-fallback button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  const fill = (step, v) => p1.evaljs(`(() => { const i = ${STEPS}.querySelector('.chan-paste-step[data-step="${step}"] input.chan-paste-input'); i.value = ${JSON.stringify(v)}; return 1; })()`);
  const statusOf = (step) => p1.evaljs(`(async () => { for (let i = 0; i < 60; i++) { const t = (${STEPS}.querySelector('.chan-paste-step[data-step="${step}"] .chan-paste-status') || {}).textContent || ''; if (t && !/正在/.test(t)) return t; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  await openSlack();
  const g0 = await look();
  ok(g0.client && g0.clientValue === 'paste' && g0.notes === 0 && g0.steps === 'open,folded,folded' && g0.titles.join('|') === '拿一个一次性的设置令牌|装进工作区|粘贴令牌，连接', `design 018: no preset ⇒ the Slack app field opens at "Another way" — three numbered steps, ① open, ② ③ FOLDED, in 中文 (${JSON.stringify({ client: g0.clientValue, steps: g0.steps, titles: g0.titles })})`);
  const sw = await p1.evaljs(`(async () => { const d = ${DLG('connect')}; const s = [...d.querySelectorAll(':scope > select')].find((x) => [...x.options].some((o) => o.value === 'paste')); const vis = (e) => !!e && e.style.display !== 'none' && !e.hidden && e.getClientRects().length > 0; const set = async (v) => { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 200)); }; await set('custom'); const out = { steps: vis(${STEPS}), cid: [...d.querySelectorAll('input')].some((i) => vis(i) && /^[0-9]/.test(i.placeholder || '')), btn: [...d.querySelectorAll('.mounts-drive-connect button')].some(vis), opts: [...s.options].map((o) => o.value).join() }; await set('paste'); out.back = vis(${STEPS}); return out; })()`);
  ok(sw && !sw.steps && sw.cid && sw.btn && sw.opts === 'custom,paste' && sw.back, `design 018: "Your workspace app" swaps the steps for Client ID / Secret and the Connect button; "Another way" brings the steps back (${JSON.stringify(sw)})`);
  ok(/Slack Tooling Tokens Vendor/.test(g0.text) && /12 小时/.test(g0.text) && g0.boxes[0].type === 'password' && g0.boxes[0].auto === 'off' && g0.boxes[0].ph === 'xoxe.xoxp-…' && g0.boxes[0].shown, 'step ① says what Generate Token adds and that the token expires in 12 hours; its box is a SECRET field');
  fit(g0, 'at 375 px');
  await p1.probe('Slack connect dialog (zh) — step 1 at 375 px', '#mounts-dialog-overlay .dialog');
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 860, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(150);
  fit(await look(), 'at 860 px');
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
  await sleep(150);
  const before = await p1.evaljs(`(window.__opened || []).length`);
  ok(await press(1, '打开 Slack 的应用页面') && (await p1.evaljs(`(window.__opened || []).slice(-1)[0]`)) === 'https://api.slack.com/apps' && (await p1.evaljs(`(window.__opened || []).length`)) === before + 1, 'step ①\'s button opens Slack\'s app page (the stubbed window.open got it)');
  await fill(1, SLACK_TOKEN);
  await press(1, '创建应用');
  const wrongBox = await statusOf(1);
  ok(/第 3 步/.test(wrongBox || '') && !(wrongBox || '').includes(SLACK_TOKEN.slice(5, 20)), `a User OAuth Token pasted into step ① is refused IN the dialog by name, the value never echoed (${wrongBox})`);
  await fill(1, SETUP);
  await press(1, '创建应用');
  let g1 = null;
  for (let i = 0; i < 60; i++) { g1 = await look(); if (g1.made) break; await sleep(100); }
  ok(g1.made && /VibeSpace/.test(g1.made) && g1.steps === 'folded,open,open' && (await p1.evaljs(`${STEPS}.querySelector('.chan-paste-step[data-step="1"] input').value`)) === '', `the setup token makes the app over the stub: ① folds to "${g1 && g1.made}", ② and ③ open, the box emptied`);
  const kept = await p1.evaljs(`localStorage.getItem('vs-paste-app:slack')`);
  ok(kept && JSON.parse(kept).appId === 'A0VIBEAPP1' && !kept.includes('xox'), `the browser remembers the made app — its id and name, never a token (${kept})`);
  fit(g1, 'step ② at 375 px');
  await p1.probe('Slack connect dialog (zh) — steps 2 and 3', '#mounts-dialog-overlay .dialog');
  ok(await press(2, '打开安装页面') && (await p1.evaljs(`(window.__opened || []).slice(-1)[0]`)) === 'https://api.slack.com/apps/A0VIBEAPP1/oauth', 'step ② opens the made app\'s own install page by its id');
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay .dialog-close').click(); 1`);
  await openSlack();
  const g2 = await look();
  ok(g2.steps === 'folded,open,open' && /VibeSpace/.test(g2.made || ''), `a dialog closed after step ① and opened again RESUMES at ② with the same app (${g2.steps}, ${g2.made})`);
  await fill(3, SETUP);
  await p1.evaljs(`${DLG('connect')}.querySelector('.dialog-actions .btn-create').click(); 1`);
  const wrong3 = await p1.evaljs(`(async () => { for (let i = 0; i < 60; i++) { const t = (${DLG('connect')}.querySelector('.cfg-err') || {}).textContent || ''; if (t) return t; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(/第 1 步/.test(wrong3 || '') && !(wrong3 || '').includes(SETUP.slice(10, 30)), `the setup token pasted into step ③ is refused by Connect, by name (${wrong3})`);
  // the fallback fold: the link and "Copy app setup" carry the same JSON
  await p1.evaljs(`(() => { window.__copied = null; if (navigator.clipboard) navigator.clipboard.writeText = (t) => { window.__copied = String(t); return Promise.resolve(); }; ${STEPS}.querySelector('.chan-paste-fallback').open = true; return 1; })()`);
  await press(0, '打开创建链接');
  await sleep(300);
  const link = await p1.evaljs(`(window.__opened || []).slice(-1)[0]`);
  await press(0, '复制应用配置');
  let copied = null;
  for (let i = 0; i < 30 && !copied; i++) { copied = await p1.evaljs(`window.__copied`); if (!copied) await sleep(100); }
  const linkJson = link && link.includes('manifest_json=') ? JSON.parse(decodeURIComponent(link.split('manifest_json=')[1])) : null;
  ok(linkJson && copied && JSON.stringify(JSON.parse(copied)) === JSON.stringify(linkJson) && !linkJson.oauth_config.scopes.bot, 'the fallback fold: "复制应用配置" copies exactly the JSON the create link carries (user scopes only)');
  await fill(3, SLACK_TOKEN);
  await p1.evaljs(`${DLG('connect')}.querySelector('.dialog-actions .btn-create').click(); 1`);
  const slackAcct = async () => (((await api('GET', '/api/channels')).json || {}).adapters || []).find((a) => a.kind === 'slack') || null;
  let acct = null;
  for (let i = 0; i < 60 && !acct; i++) { acct = await slackAcct(); if (!acct) await sleep(200); }
  ok(acct && acct.auth && acct.auth.state === 'connected' && acct.retention === 'purge-on-remove' && JSON.stringify(acct.policyModes) === '["review"]', `step ③ + Connect created the Slack account (connected, purge-on-remove, review only) — ${JSON.stringify(acct && { id: acct.id, state: acct.auth && acct.auth.state })}`);
  ok((await p1.evaljs(`localStorage.getItem('vs-paste-app:slack')`)) === null, 'connected: the remembered app is forgotten');
  const cardText = await p1.evaljs(`(async () => { for (let i = 0; i < 100; i++) { const c = document.querySelector('.rail-panel-channels .chan-account[data-adapter=${JSON.stringify((acct && acct.id) || 'slack')}]'); if (c && /免费版/.test(c.textContent)) return c.textContent; await new Promise((r) => setTimeout(r, 150)); } const c = document.querySelector('.rail-panel-channels .chan-account[data-adapter=${JSON.stringify((acct && acct.id) || 'slack')}]'); return c ? c.textContent : null; })()`);
  ok(/保存在这台服务器上/.test(cardText || '') && /Anthropic/.test(cardText || ''), 'the account card says where the copy lives and that agents\' reads go to the model provider (owner Q2), in 中文');
  ok(/免费版/.test(cardText || ''), 'and the setup report\'s free-plan fact (is_limited) — Slack hides older messages');
  await p1.probe('Slack account card (zh)', `.rail-panel-channels .chan-account[data-adapter=${JSON.stringify((acct && acct.id) || 'slack')}]`);
  const page = JSON.stringify(await p1.evaljs(`document.body.innerText + document.body.innerHTML`));
  ok(!page.includes(SLACK_TOKEN.slice(5, 20)) && !page.includes(SETUP.slice(10, 30)), 'neither token is drawn or kept ANYWHERE on the page');
  await p1.evaljs(`localStorage.removeItem('vibespace.lang'); 1`);
  }

  // nothing the page ever opened pointed at a vendor, and every intercepted call was the stub's
  const opened = await p1.evaljs(`window.__opened || []`);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  ok(targets.every((t) => !VENDOR_HOSTS.test(t.url || '')), `no chrome target ever loaded a vendor page (${targets.map((t) => t.url).join(', ').slice(0, 200)}) — the ${opened.length} consent URLs went to the stubbed window.open`);
  const calls = fs.readFileSync(path.join(stubDir, 'calls.ndjson'), 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(calls.length > 0 && calls.some((c) => c.path === '/token') && calls.some((c) => c.host === 'gmail.googleapis.com'), `the vendor stub answered the token exchanges and the mailbox reads (${calls.length} calls)`);
}

// ── ⑪ lane pod-oauth-callback (study 2 B2 — a pod's Connect dead-ended on the pod's own 127.0.0.1; the form said feishu
// while the company's app lives on Lark international; nobody walked the paste-the-address box): the scratch server
// rebooted AS A POD — an https address (VIBESPACE_PUBLIC_URL) + a company Lark preset that names its brand ──
{
  console.log('\n⑪ a pod\'s Connect: the brand from the preset, the route as redirect, the paste-back folded last');
  const POD = 'https://pod-road.example.test';
  srv.kill('SIGKILL'); await waitDown();
  srv = bootServer({ VIBESPACE_PUBLIC_URL: POD, VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'lark', key: 'co', label: 'Company app', values: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark' } }]) });
  ok(await waitServer(), 'rebooted as a pod: an https address + a company Lark preset that names its brand (lark)');
  // the page on a NAME (mapped to this server): the browser is NOT on the instance's loopback, as a person's is on a pod
  ok(await p1.load(`http://pod-road.example.test:${PORT}/`), 'page 1 reloaded on the pod\'s name (not the loopback)');
  const DLGC = `document.querySelector('.dialog-body[data-chan-dialog="connect"]')`;
  const openOn = async (kind) => p1.evaljs(`(async () => { document.querySelector('#mounts-dialog-overlay')?.remove(); window.app.openChannelConnect(${JSON.stringify(kind)}); for (let i = 0; i < 80; i++) { if (${DLGC}) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`);
  ok(await openOn('lark'), 'the chat\'s door (app.openChannelConnect) opens Connect an account on Lark');
  const f = await p1.evaljs(`(() => { const d = ${DLGC}; const sel = (k) => d.querySelector('[data-field="' + k + '"]') || [...d.querySelectorAll('select')].find((s) => s.dataset.key === k); const type = d.querySelector('select'); const brand = [...d.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'feishu') && [...s.options].some((o) => o.value === 'lark') && s.style.display !== 'none'); const client = [...d.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'co')); return { type: type && type.value, brand: brand ? brand.value : null, client: client ? client.value : null }; })()`);
  ok(f.type === 'lark' && f.client === 'co' && f.brand === 'lark', `the form shows the company app AND its brand: lark, not feishu (${JSON.stringify(f)})`);
  // CONTROL: the same dialog over a digest whose preset names no brand (the pre-lane wire) says feishu — the check above can go red
  await p1.evaljs(`(() => { if (!window.__f0) { window.__f0 = window.fetch; window.fetch = async (u, o) => { const r = await window.__f0(u, o); if (!String(u).includes('/api/channels?scope=accounts')) return r; const j = await r.json(); for (const k of j.kinds || []) for (const p of k.presets || []) delete p.facts; return new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } }); }; } return 1; })()`);
  await openOn('lark');
  const f0 = await p1.evaljs(`(() => { const d = ${DLGC}; const brand = [...d.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'feishu') && [...s.options].some((o) => o.value === 'lark') && s.style.display !== 'none'); return brand ? brand.value : null; })()`);
  ok(f0 === 'feishu', `CONTROL: a preset that names no brand leaves the form at feishu (the testers' form) — the brand check can go red (${f0})`);
  await p1.evaljs(`(() => { if (window.__f0) { window.fetch = window.__f0; delete window.__f0; } return 1; })()`);
  // Gmail (its loopback is an ephemeral port — the other road binds no machine-wide one): the route, then the fold
  ok(await openOn('gmail'), 'Connect an account on Gmail');
  // addendum 1: the company preset names no relay page (and no fleet page here) — its setup says so, and offers no page
  const bare = await p1.evaljs(`(() => { const d = ${DLGC}; const vis = (e) => e && e.style.display !== 'none'; return { notes: [...d.querySelectorAll(':scope > .mounts-note')].filter((e) => vis(e) && /^prn\\d+\\.gmail$/.test(e.dataset.field)).map((e) => e.textContent), links: [...d.querySelectorAll(':scope > .mounts-oauth-link')].filter(vis).map((e) => e.querySelector('input').value) }; })()`);
  ok(bare.notes.length === 1 && bare.notes[0] === 'This company app has no relay page yet: a sign-in comes back to this VibeSpace’s own address. Your admin can give the app one relay page that serves every VibeSpace.' && !bare.links.some((v) => /github\.io/.test(v)),
    `addendum 1: a company preset with no relay page says so in its setup — and offers no public page (${JSON.stringify(bare)})`);
  const before = await p1.evaljs(`(window.__opened || []).length`);
  await p1.evaljs(`(() => { const b = [...${DLGC}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none'); b.querySelector('button.mounts-btn-primary').click(); return 1; })()`);
  const opened1 = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { if ((window.__opened || []).length > ${before}) return window.__opened.slice(-1)[0]; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  const r1 = opened1 ? new URL(opened1).searchParams.get('redirect_uri') : null;
  ok(r1 === `${POD}/api/channels/oauth/cb/gmail`, `Connect Google from the pod: the sign-in comes back to the instance's own route, never 127.0.0.1 (${r1})`);
  const FOLD = `[...${DLGC}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none').querySelector('details.mounts-oauth-paste')`;
  const fold = await p1.evaljs(`(async () => { for (let i = 0; i < 40; i++) { if (${FOLD}) break; await new Promise((r) => setTimeout(r, 100)); } const d = ${FOLD}; if (!d) return null; const kids = [...d.parentElement.children]; return { open: d.open, summary: d.querySelector('summary').textContent, last: kids[kids.length - 1] === d, boxVisible: !!d.querySelector('input') && (typeof d.querySelector('input').checkVisibility === 'function' ? d.querySelector('input').checkVisibility() : d.querySelector('input').getBoundingClientRect().height > 0) }; })()`);
  ok(fold && fold.open === false && fold.summary === 'The sign-in did not come back here by itself?' && fold.last && fold.boxVisible === false, `the paste-back is LAST and FOLDED under one line that says when it is needed — the box itself is not shown (${JSON.stringify(fold)})`);
  const inside = await p1.evaljs(`(() => { const d = ${FOLD}; d.open = true; const admin = d.querySelector('.mounts-oauth-admin'); const copy = admin && admin.nextElementSibling && admin.nextElementSibling.querySelector('input'); const other = d.querySelector('.mounts-oauth-other'); return { admin: admin ? admin.textContent : null, value: copy ? copy.value : null, other: other ? other.textContent : null, hint: [...d.querySelectorAll('.mounts-field-hint')].map((x) => x.textContent).join(' | ') }; })()`);
  // lane oauth-setup-instructions: the refusal fold carries the setup card's console lines — Google's own words, the path
  const notes = await p1.evaljs(`[...${FOLD}.querySelectorAll('.mounts-oauth-admin-note')].map((n) => n.textContent)`);
  ok(notes.length === 3 && /^If Google says “Error 400: redirect_uri_mismatch”/.test(notes[0]) && /under Google Cloud console → APIs & Services → Credentials → OAuth 2\.0 Client IDs → your client → Authorized redirect URIs\.$/.test(notes[1]) && /^An https address and Google still says “Error 400: redirect_uri_mismatch”\? The client is a Desktop app client/.test(notes[2]),
    `the refusal fold names Google's own error, WHERE the address goes, and — for an https address — the Desktop-client case (${JSON.stringify(notes).slice(0, 400)})`);
  ok(inside.admin && /^Google said this address is not allowed\? Add it to the app’s redirect URLs/.test(inside.admin) && inside.value === `${POD}/api/channels/oauth/cb/gmail` && inside.other === 'Sign in the other way: copy the last page’s address back here',
    `unfolded: why in a person's words, the exact address an admin adds to the app, and the other road (${JSON.stringify(inside).slice(0, 400)})`);
  const bareHints = await p1.evaljs(`[...${FOLD}.querySelectorAll(':scope > .mounts-field-hint')].map((h) => h.textContent)`);
  ok(bareHints.some((h) => /^This company app has no relay page yet, so this sign-in comes back to this VibeSpace’s own address \(pod-road\.example\.test\) — the app must list it, or your admin gives the app one relay page that serves every VibeSpace\./.test(h)),
    `addendum 1: the fold says WHY the route — the company app has no relay page yet (${JSON.stringify(bareHints).slice(0, 300)})`);
  await p1.probe('a pod\'s Connect Google: the route consent, the folded paste-back opened', `#mounts-dialog-overlay .mounts-oauth-paste`);
  const before2 = await p1.evaljs(`(window.__opened || []).length`);
  await p1.evaljs(`(() => { ${FOLD}.querySelector('.mounts-oauth-other').click(); return 1; })()`);
  const opened2 = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { if ((window.__opened || []).length > ${before2}) return window.__opened.slice(-1)[0]; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  const r2 = opened2 ? new URL(opened2).searchParams.get('redirect_uri') : null;
  const fold2 = await p1.evaljs(`(async () => { for (let i = 0; i < 40; i++) { const d = ${FOLD}; if (d && !d.querySelector('.mounts-oauth-admin')) return { summary: d.querySelector('summary').textContent, hint: [...d.querySelectorAll('.mounts-field-hint')].map((x) => x.textContent).join(' | ') }; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(r2 || '') && fold2 && fold2.summary === 'The sign-in page ended on an address that would not load?' && /starts with 127\.0\.0\.1/.test(fold2.hint),
    `the other road: the same sign-in the copy-the-address way (an ephemeral loopback), its fold saying why in a person's words (${r2}, ${JSON.stringify(fold2).slice(0, 300)})`);
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay')?.remove(); 1`);
  // CONTROL: the same page on the instance's own loopback IS a browser on this machine — its Connect keeps the loopback
  // (the local hub's road, as before) — so the route check above is about where the browser is
  ok(await p1.load(), 'page 1 back on 127.0.0.1');
  await openOn('gmail');
  const before3 = await p1.evaljs(`(window.__opened || []).length`);
  await p1.evaljs(`(() => { const b = [...${DLGC}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none'); b.querySelector('button.mounts-btn-primary').click(); return 1; })()`);
  const opened3 = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { if ((window.__opened || []).length > ${before3}) return window.__opened.slice(-1)[0]; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(opened3 ? new URL(opened3).searchParams.get('redirect_uri') : ''), `CONTROL: a browser on the instance's own loopback keeps the loopback road (a local hub) — the route above is the pod's (${opened3 && new URL(opened3).searchParams.get('redirect_uri')})`);
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay')?.remove(); 1`);
}

// ── ⑫ lane oauth-relay-road (the owner 2026-10-22: «不可能每次都让我手动加 redirect url 的» — one registered redirect per app,
// never one per pod): the relay pages at their DEFAULT + a FLEET relay; a browser on a private address rides the relay ──
{
  console.log('\n⑫ the relay road: the setup rows, the fold, the round trip through the relay page');
  const ADMIN = 'https://admin.fleet.example.test/relay/', PUBLIC = require(path.join(wt, 'src/consent-road.js')).RELAY_DEFAULT;
  srv.kill('SIGKILL'); await waitDown();
  fs.writeFileSync(SETTINGS_FILE, '{}');
  srv = bootServer({ VIBESPACE_OAUTH_RELAY_URL: ADMIN });
  ok(await waitServer(), 'rebooted with the relay pages at their defaults and a fleet relay page (VIBESPACE_OAUTH_RELAY_URL)');
  ok(await p1.load(), 'page 1 on 127.0.0.1 — a private address, which every relay page sends back');
  const DLGC = `document.querySelector('.dialog-body[data-chan-dialog="connect"]')`;
  const openOn = async (kind) => p1.evaljs(`(async () => { document.querySelector('#mounts-dialog-overlay')?.remove(); window.app.openChannelConnect(${JSON.stringify(kind)}); for (let i = 0; i < 80; i++) { if (${DLGC}) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`);
  ok(await openOn('lark'), 'Connect an account on Lark (no company app here: Custom)');
  const lk = await p1.evaljs(`(() => {
    const d = ${DLGC}; const vis = (e) => e && e.style.display !== 'none';
    const rows = [...d.querySelectorAll(':scope > .mounts-oauth-link')].filter(vis);
    const labelOf = (row) => { let l = row.previousElementSibling; while (l && l.tagName !== 'LABEL') l = l.previousElementSibling; return l ? l.textContent : null; };
    const last = rows[rows.length - 1]; const hints = [];
    for (let n = last && last.nextElementSibling; n && n.className === 'mounts-field-hint'; n = n.nextElementSibling) hints.push(n.textContent);
    return { rows: rows.map((r) => ({ label: labelOf(r), value: r.querySelector('input').value, field: r.dataset.field })), hints };
  })()`);
  ok(JSON.stringify(lk.rows.map((r) => r.value)) === JSON.stringify([ADMIN, PUBLIC]) && /^Redirect URL for this fleet’s VibeSpaces/.test(lk.rows[0].label || '') && lk.rows[1].label === 'A public relay page you may register if this VibeSpace has no https address' && !lk.rows.some((r) => /127\.0\.0\.1/.test(r.value)),
    `a custom Lark app's setup lists the relay pages (the fleet's; the public one — addendum 1: «you may register if this VibeSpace has no https address») — no per-instance callback row (${JSON.stringify(lk.rows)})`);
  ok(lk.hints[0] === R.rowById('lark').setup.callbackNote && lk.hints.length === 4, `…with the console note and the prerequisites under the last (${JSON.stringify(lk.hints).slice(0, 200)})`);
  await p1.probe('a custom Lark app\'s relay rows', `#mounts-dialog-overlay .dialog-body > .mounts-oauth-link[data-field="rp1.lark"]`);
  // a page NO relay sends back (a public http name, no https address here): the setup shows the road it really takes
  ok(await p1.load(`http://pod-road.example.test:${PORT}/`), 'page 1 reloaded on a public http name (no relay page sends it back)');
  ok(await openOn('lark'), 'Connect an account on Lark again');
  const lk2 = await p1.evaljs(`(() => { const d = ${DLGC}; return [...d.querySelectorAll(':scope > .mounts-oauth-link')].filter((e) => e.style.display !== 'none').map((r) => r.querySelector('input').value); })()`);
  ok(JSON.stringify(lk2) === JSON.stringify([R.rowById('lark').setup.callbackUrl]), `…its custom setup shows the road its sign-in takes (the loopback callback), not relay rows it would never ride (${JSON.stringify(lk2)})`);
  ok(await p1.load(), 'page 1 back on 127.0.0.1');
  // Gmail under the drive preset: the relay road
  ok(await openOn('gmail'), 'Connect an account on Gmail');
  // addendum 1: the company preset (no page of its own) shows ONLY its relay page — the fleet's — never the public one
  const pre = await p1.evaljs(`(() => { const d = ${DLGC}; const vis = (e) => e && e.style.display !== 'none'; const labelOf = (row) => { let l = row.previousElementSibling; while (l && l.tagName !== 'LABEL') l = l.previousElementSibling; return l ? l.textContent : null; }; return [...d.querySelectorAll(':scope > .mounts-oauth-link')].filter(vis).map((r) => ({ field: r.dataset.field, label: labelOf(r), value: r.querySelector('input').value })); })()`);
  ok(pre.length === 1 && /^prp\d+\.gmail$/.test(pre[0].field) && pre[0].value === ADMIN && pre[0].label === 'This company app’s redirect URL — its relay page, registered once by your admin' && !pre.some((r) => r.value === PUBLIC),
    `addendum 1: a company preset's setup shows ONLY its own relay page (the fleet's here) — the public page never (${JSON.stringify(pre)})`);
  await p1.probe('Connect Google under the company preset: its relay page only', `#mounts-dialog-overlay .dialog-body > .mounts-oauth-link[data-field^="prp"]`);
  const n0 = (((await api('GET', '/api/channels')).json || {}).adapters || []).filter((a) => a.kind === 'gmail').length;
  const before = await p1.evaljs(`(window.__opened || []).length`);
  await p1.evaljs(`(() => { const b = [...${DLGC}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none'); b.querySelector('button.mounts-btn-primary').click(); return 1; })()`);
  const opened = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { if ((window.__opened || []).length > ${before}) return window.__opened.slice(-1)[0]; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  const redirect = opened ? new URL(opened).searchParams.get('redirect_uri') : null;
  ok(redirect === ADMIN, `Connect Google from a private address: redirect_uri = the relay page (the fleet's here — one address for every instance), never 127.0.0.1 or a per-instance route (${redirect})`);
  const FOLD = `[...${DLGC}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none').querySelector('details.mounts-oauth-paste')`;
  const fold = await p1.evaljs(`(async () => { for (let i = 0; i < 40; i++) { if (${FOLD}) break; await new Promise((r) => setTimeout(r, 100)); } const d = ${FOLD}; if (!d) return null; d.open = true; const admin = d.querySelector('.mounts-oauth-admin'); return { summary: d.querySelector('summary').textContent, admin: admin && admin.textContent, value: admin && admin.nextElementSibling && admin.nextElementSibling.querySelector('input') && admin.nextElementSibling.querySelector('input').value, hints: [...d.querySelectorAll(':scope > .mounts-field-hint')].map((h) => h.textContent), other: (d.querySelector('.mounts-oauth-other') || {}).textContent || null }; })()`);
  ok(fold && fold.summary === 'The sign-in did not come back here by itself?' && fold.hints.some((h) => /^This sign-in comes back through the relay page admin\.fleet\.example\.test: one address, registered once on the app, serves every VibeSpace — the page sends your browser back here and keeps nothing\./.test(h)),
    `the fold says the ROAD and WHY in a person's words (${JSON.stringify(fold && fold.hints).slice(0, 300)})`);
  ok(fold && /^Google said this address is not allowed\? It is the relay page — add it ONCE to the app’s redirect URLs/.test(fold.admin || '') && fold.value === ADMIN && /^Sign in the other way/.test(fold.other || ''),
    `a refused sign-in: the fold names the ONE address missing (the relay page) with Copy, and keeps the other road (${JSON.stringify(fold).slice(0, 300)})`);
  await p1.probe('Connect Google through the relay page: the fold opened', `#mounts-dialog-overlay .mounts-oauth-paste`);
  // the relay page, as shipped, with the admin copy's data-allow — the vendor sends the browser there with the stub's code
  const vm = await import('node:vm');
  const rctx = { URL, URLSearchParams, atob }; rctx.globalThis = rctx; vm.createContext(rctx);
  vm.runInContext(fs.readFileSync(path.join(repo, 'docs/slack-relay/relay.js'), 'utf8'), rctx);   // the working tree's page (the overlay copies src / public only)
  const st = new URL(opened).searchParams.get('state');
  const d = rctx.VibeSpaceRelay.decide(`?code=stub-relay-code-12&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.modify&state=${encodeURIComponent(st)}`, ['fleet.example.test']);
  ok(d.act === 'redirect' && d.to.startsWith(`${base}/api/channels/oauth/cb/gmail?code=stub-relay-code-12&scope=`), `the relay page sends the browser to THIS instance's landing route with the query verbatim (${JSON.stringify(d).slice(0, 200)})`);
  const land = d.act === 'redirect' ? await fetch(d.to) : null;
  const page = land ? await land.text() : '';
  ok(land && land.status === 200 && /data-landing="ok"/.test(page), `the landing page says connected (${land && land.status})`);
  const signed = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { const b = [...${DLGC}.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none'); const s = b && b.querySelector('.mounts-field-hint').textContent; if (/Connected/.test(s || '')) return s; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(/✓ Connected as \S+@example\.test — finish with the “Connect” button below\./.test(signed || ''), `the dialog's poll reads the sign-in that landed through the relay (${JSON.stringify(signed)})`);
  await p1.evaljs(`${DLGC}.querySelector('.dialog-actions .btn-create').click(); 1`);
  let n1 = n0;
  for (let i = 0; i < 60 && n1 === n0; i++) { n1 = (((await api('GET', '/api/channels')).json || {}).adapters || []).filter((a) => a.kind === 'gmail').length; if (n1 === n0) await sleep(100); }
  ok(n1 === n0 + 1, `Connect makes the account — no per-instance address was registered anywhere (${n0} → ${n1})`);
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay')?.remove(); 1`);
}

// ── ⑬ lane oauth-setup-instructions (the owner 2026-10-23: «web application 的话，在集群外部署你是不是应该提供一下 redirect uri
// 有关的 instruction，不然用户会懵逼吧»): a LOCAL HUB on the relay setting's default (the public page), no fleet relay —
// ⚙ → Integrations holds one setup card per account type; the Connect dialog's fold names the client to create and the
// exact addresses BEFORE the first attempt; the account's OAuth client type decides the address Google is asked for ──
{
  console.log('\n⑬ the setup card: ⚙ → Integrations, the Connect dialog\'s fold before the first attempt, Gmail\'s client type');
  const PUBLIC = require(path.join(wt, 'src/consent-road.js')).RELAY_DEFAULT;
  const GLOOP = require(path.join(wt, 'src/channels/gmail/manifest.js')).GMAIL_LOOPBACK_URL;
  srv.kill('SIGKILL'); await waitDown();
  fs.writeFileSync(SETTINGS_FILE, '{}');
  srv = bootServer({});
  ok(await waitServer(), 'rebooted as a local hub: the relay settings at their default (the public page), no fleet relay');
  ok(await p1.load(), 'page 1 on 127.0.0.1 (the browser on the VibeSpace machine)');
  // the boot splash (#loading-screen) covers the page until boot is done — a PICTURE (the pixel probes, the shots) waits for it
  ok(await p1.evaljs(`(async () => { for (let i = 0; i < 150; i++) { const s = document.getElementById('loading-screen'); if (!s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0' || s.style.visibility === 'hidden') return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`), 'the boot splash is gone (a picture shows the page, not the splash)');
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay')?.remove(); 1`);
  ok(await p1.evaljs(OPEN(BB)), 'the Integrations window opened');
  const SETUP = (k) => `document.querySelector('.integ-setup-card[data-integ-setup="${k}"]')`;
  const sc = await p1.evaljs(`(async () => { for (let i = 0; i < 60; i++) { if (document.querySelectorAll('.integ-setup-card').length >= 3) break; await new Promise((r) => setTimeout(r, 100)); }
    const cards = [...document.querySelectorAll('.integ-setup-card')];
    return { kinds: cards.map((c) => c.dataset.integSetup), groups: [...new Set(cards.map((c) => c.closest('.integ-group') && c.closest('.integ-group').dataset.group))], first: (document.querySelector('.integ-group') || {}).dataset?.group || null, integCards: document.querySelectorAll('.integ-card').length, head: (document.querySelector('.integ-group[data-group="communication"] .integ-group-head') || {}).textContent || null };
  })()`);
  ok(sameSet(sc.kinds, ['lark', 'gmail', 'slack']) && JSON.stringify(sc.groups) === JSON.stringify(['communication']) && sc.first === 'communication' && sc.head === 'Communication' && sc.integCards === WINDOW_ROWS.length,
    `⚙ → Integrations: a Communication group FIRST with one setup card per OAuth account type (Lark, Gmail, Slack) — no key card added to the census (${JSON.stringify(sc)})`);
  const g = await p1.evaljs(`(() => {
    const c = ${SETUP('gmail')}; const fold = c.querySelector('details.oauth-setup-fold[data-who="custom"]'); const closed = !fold.open; fold.open = true;
    const tx = (s) => (fold.querySelector(s) || {}).textContent || null;
    return { closed, summary: fold.querySelector('summary').textContent, create: fold.querySelector('.oauth-setup-create').dataset.create, what: tx('.oauth-setup-create-what'), why: tx('.oauth-setup-why'), alt: tx('.oauth-setup-alt'), register: (fold.querySelector('.oauth-setup-register') || {}).firstChild?.textContent || null,
      rows: [...fold.querySelectorAll('.oauth-setup-row')].map((li) => ({ row: li.dataset.row, now: !!li.dataset.now, uri: (li.querySelector('code') || {}).textContent || null, words: li.querySelector('.oauth-setup-row-words').firstChild.textContent, copy: !!li.querySelector('button.integ-copy') })),
      links: [...fold.querySelectorAll('a.oauth-setup-console')].map((a) => [a.textContent, a.href, a.target, a.rel]), where: tx('.oauth-setup-where'), refusal: tx('.oauth-setup-refusal'), desktop: tx('.oauth-setup-refusal-desktop'), last: tx('.oauth-setup-last'), inactive: tx('.oauth-setup-inactive'),
      presets: [...c.querySelectorAll('details.oauth-setup-fold[data-who="preset"]')].map((d) => d.dataset.preset) };
  })()`);
  ok(g.closed && g.summary === 'Setting up your own Google app? What to create and the exact addresses to register' && g.create === 'web' && g.what === 'Create a Web application OAuth client.' && /^Why: a sign-in here comes back through a relay page/.test(g.why || '') && /A Desktop app client works too/.test(g.alt || ''),
    `the Gmail card, folded under one line: WHICH client — a Web application client (this hub signs in through the public relay page, an https address) — and the Desktop alternative for a browser on this machine (${JSON.stringify({ create: g.create, why: g.why })})`);
  const rk = g.rows.map((r) => `${r.row}${r.now ? '*' : ''}`).join(' ');
  ok(rk === 'public* own route loopback also' && g.rows[0].uri === PUBLIC && g.rows[1].uri === null && g.rows[2].uri === null && g.rows[2].words.includes('https://<host>/api/channels/oauth/cb/gmail') && g.rows[3].uri === GLOOP && g.rows[4].uri === R.rowById('gmail').redirect.also[0].uri && g.rows.filter((r) => r.uri).every((r) => r.copy),
    `the exact addresses, each with Copy: ① the public relay page (used now), ② your own copy (how), ③ your own https address (the template — this hub has none), this machine's FIXED address for a Web client, Drive's (${rk})`);
  ok(/^Register the ones you use, each exactly as written, under Google Cloud console → APIs & Services → Credentials → OAuth 2\.0 Client IDs → your client → Authorized redirect URIs:/.test(g.register || '') && JSON.stringify(g.links) === JSON.stringify([['Google Cloud console', 'https://console.cloud.google.com/apis/credentials', '_blank', 'noopener noreferrer']]),   // (en: the page's language here)
    'the console path, word for word, with its link (a new tab, no referrer)', JSON.stringify({ register: g.register, links: g.links }));
  ok(g.where === 'Then: Connect an account → OAuth client → Custom — enter the client ID and secret there.' && /^If Google says “Error 400: redirect_uri_mismatch”/.test(g.refusal || '') && /The client is a Desktop app client, which cannot take one/.test(g.desktop || '') && /paste the last page’s address into its fold/.test(g.last || '') && g.inactive === null,
    'where the client ID and secret go, Google\'s own refusal words (+ the Desktop-client case), the paste-back last resort');
  const pre = await p1.evaljs(`(() => { const d = ${SETUP('gmail')}.querySelector('details.oauth-setup-fold[data-preset="channels"]'); d.open = true; return { summary: d.querySelector('summary').textContent, rows: [...d.querySelectorAll('.oauth-setup-row')].map((li) => li.dataset.row), create: d.querySelector('.oauth-setup-create').dataset.create, where: d.querySelector('.oauth-setup-where').textContent }; })()`);
  ok(JSON.stringify(g.presets) === JSON.stringify(['org1', 'channels']) && pre.summary === 'Company app: Channels' && pre.create === 'preset' && !pre.rows.includes('public') && pre.where === 'The client ID and secret are set by your admin in the cluster presets.',
    `each company preset's card: nothing to create, set by your admin — and never the public page (${JSON.stringify(pre)})`);
  const copied = await p1.evaljs(`(async () => { const b = ${SETUP('gmail')}.querySelector('.oauth-setup-row[data-row="public"] button.integ-copy'); b.click(); for (let i = 0; i < 40; i++) { const tt = [...document.querySelectorAll('#global-toasts .global-toast-body')].map((x) => x.textContent); if (tt.some((x) => x.includes(${JSON.stringify(PUBLIC)}))) return { toast: tt.find((x) => x.includes(${JSON.stringify(PUBLIC)})), mark: b.dataset.copied || null }; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(copied && copied.toast === `Copied: ${PUBLIC}` && copied.mark === '1', `Copy copies the exact address — the toast names it (${JSON.stringify(copied)})`);
  const lark = await p1.evaljs(`(() => { const d = ${SETUP('lark')}.querySelector('details.oauth-setup-fold[data-who="custom"]'); d.open = true; return { create: d.querySelector('.oauth-setup-create').dataset.create, loop: (d.querySelector('.oauth-setup-row[data-row="loopback"] code') || {}).textContent || null, refusal: d.querySelector('.oauth-setup-refusal').textContent, links: [...d.querySelectorAll('a.oauth-setup-console')].map((a) => a.textContent) }; })()`);
  ok(lark.create === 'app' && lark.loop === LARK_CB && /^If Lark says “20029”/.test(lark.refusal) && JSON.stringify(lark.links) === JSON.stringify(['Lark', '飞书']), `the Lark card: its one kind of app, its registered loopback, 20029, both consoles (${JSON.stringify(lark)})`);
  // lane channel-row-notices (the owner: the Channels row's five-line install paragraph «很丑陋»): the push lane's STEPS live on the
  // account type's setup card under «Real-time push — optional» (the live lane's own declaration) — Lark's only; opened here
  // so the viewport check below measures its Copy buttons too
  const push = await p1.evaljs(`(() => {
    const d = ${SETUP('lark')}.querySelector('details.push-setup-fold[data-who="push"]'); if (!d) return null; const closed = !d.open; d.open = true;
    return { closed, summary: d.querySelector('summary').textContent, steps: [...d.querySelectorAll('.push-setup-step')].map((li) => ({ words: li.querySelector('.mounts-field-hint').textContent, code: (li.querySelector('code') || {}).textContent || null, copy: !!li.querySelector('button.integ-copy') })), after: (d.querySelector('.push-setup-after') || {}).textContent || null,
      others: ['gmail', 'slack'].map((k) => !!document.querySelector('.integ-setup-card[data-integ-setup="' + k + '"] details.push-setup-fold')) };
  })()`);
  ok(push && push.closed && push.summary === 'Real-time push — optional' && push.steps.length === 4 && push.steps[0].code === 'npm install @larksuiteoapi/node-sdk' && push.steps[0].copy && /restart VibeSpace/.test(push.steps[0].words) && push.steps[2].code === 'im:message.group_msg' && push.steps[3].code === null && /polling/.test(push.after || '') && push.others.every((x) => !x),
    `the Lark card carries the push lane's steps, folded under «Real-time push — optional»: the install command with Copy, the console steps, the scope, the bot — none on Gmail / Slack (${JSON.stringify(push)})`);
  await p1.probe('⚙ → Integrations: the Gmail setup card, opened', `.integ-setup-card[data-integ-setup="gmail"] .oauth-setup`);
  const fit = await p1.evaljs(`(() => { const bad = []; for (const el of document.querySelectorAll('.integ-setup-card button, .integ-setup-card a, .integ-setup-card code')) { const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue; if (r.right > 376 || r.left < -1) bad.push((el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); } return bad; })()`);
  ok(!fit.length, `375×667: every Copy button, console link and address of the setup cards inside the viewport (offenders: ${fit.join(', ') || 'none'})`);
  if (process.env.OAUTH_SETUP_SHOTS) { const s = await p1.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(process.env.OAUTH_SETUP_SHOTS, 'integrations-gmail-setup.png'), Buffer.from(s.result.data, 'base64')); }
  // the Connect dialog: the fold BEFORE the first attempt
  const DLGC = `document.querySelector('.dialog-body[data-chan-dialog="connect"]')`;
  const openOn = async (kind) => p1.evaljs(`(async () => { document.querySelector('#mounts-dialog-overlay')?.remove(); window.app.openChannelConnect(${JSON.stringify(kind)}); for (let i = 0; i < 80; i++) { if (${DLGC}) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`);
  ok(await openOn('gmail'), 'Connect an account on Gmail');
  const before = await p1.evaljs(`(window.__opened || []).length`);
  const dlg = await p1.evaljs(`(() => {
    const d = ${DLGC}; const vis = (e) => e && e.style.display !== 'none'; const s = [...d.querySelectorAll(':scope > select')].find((x) => vis(x) && [...x.options].some((o) => o.value === 'custom'));
    const presetFold = [...d.querySelectorAll(':scope > details.oauth-setup-fold')].filter(vis).map((f) => f.dataset.who);
    s.value = 'custom'; s.dispatchEvent(new Event('change'));
    const folds = [...d.querySelectorAll(':scope > details.oauth-setup-fold')].filter(vis);
    const f = folds[0]; const auth = [...d.querySelectorAll('.mounts-drive-connect')].find(vis);
    return { presetFold, who: folds.map((x) => x.dataset.who), open: f ? f.open : null, summary: f ? f.querySelector('summary').textContent : null, beforeAuth: !!(f && auth && (f.compareDocumentPosition(auth) & Node.DOCUMENT_POSITION_FOLLOWING)), rows: f ? [...f.querySelectorAll('.oauth-setup-row')].map((li) => li.dataset.row) : [] };
  })()`);
  ok(JSON.stringify(dlg.presetFold) === JSON.stringify(['preset']) && JSON.stringify(dlg.who) === JSON.stringify(['custom']) && dlg.open === false && dlg.summary === 'Setting up your own Google app? What to create and the exact addresses to register' && dlg.beforeAuth && dlg.rows.join(' ') === 'public own route loopback also',
    `the Connect form, BEFORE the first attempt: the company app shows its card, Custom shows the person's own — folded under one line, above the sign-in block, the same addresses (${JSON.stringify(dlg)})`);
  ok(await p1.evaljs(`(window.__opened || []).length`) === before, 'nothing was started to show it (no sign-in page opened)');
  await p1.evaljs(`(() => { const f = [...${DLGC}.querySelectorAll(':scope > details.oauth-setup-fold')].find((x) => x.style.display !== 'none'); f.open = true; return 1; })()`);
  await p1.probe('the Connect dialog: the setup fold opened (Custom)', `#mounts-dialog-overlay details.oauth-setup-fold[data-who="custom"][data-kind="gmail"] .oauth-setup`);
  if (process.env.OAUTH_SETUP_SHOTS) { const s = await p1.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.OAUTH_SETUP_SHOTS, 'connect-gmail-fold.png'), Buffer.from(s.result.data, 'base64')); }
  // Gmail's OAuth client type (an account option): what Google is asked for
  const kind = await p1.evaljs(`(() => { const d = ${DLGC}; const sel = [...d.querySelectorAll('select')].find((s) => JSON.stringify([...s.options].map((o) => o.value)) === JSON.stringify(['', 'web', 'desktop'])); if (!sel) return null; let l = sel.previousElementSibling; while (l && l.tagName !== 'LABEL') l = l.previousElementSibling; return { label: l && l.textContent, options: [...sel.options].map((o) => o.textContent), value: sel.value }; })()`);
  ok(kind && kind.label === 'OAuth client type' && JSON.stringify(kind.options) === JSON.stringify(['Not said', 'Web application', 'Desktop app']) && kind.value === '', `Gmail's form asks the OAuth client type: Not said / Web application / Desktop app (${JSON.stringify(kind)})`);
  const connectWith = async (type) => {
    const b0 = await p1.evaljs(`(window.__opened || []).length`);
    await p1.evaljs(`(() => { const d = ${DLGC}; const sel = [...d.querySelectorAll('select')].find((s) => JSON.stringify([...s.options].map((o) => o.value)) === JSON.stringify(['', 'web', 'desktop'])); sel.value = ${JSON.stringify(type)}; sel.dispatchEvent(new Event('change'));
      const vis = [...d.querySelectorAll(':scope > input')].filter((i) => i.style.display !== 'none' && !i.readOnly); const id = vis.find((i) => i.placeholder && /googleusercontent/.test(i.placeholder)); const sec = vis.find((i) => i.type === 'password');   // the type-first dialog holds every type's inputs: the VISIBLE ones
      id.value = ${JSON.stringify(CUSTOM_ID)}; sec.value = ${JSON.stringify(CUSTOM_SECRET)}; id.dispatchEvent(new Event('input')); sec.dispatchEvent(new Event('input'));
      const b = [...d.querySelectorAll('.mounts-drive-connect')].find((x) => x.style.display !== 'none'); const btn = b.querySelector('button.mounts-btn-primary'); btn.disabled = false; btn.click(); return 1; })()`);
    const u = await p1.evaljs(`(async () => { for (let i = 0; i < 80; i++) { if ((window.__opened || []).length > ${b0}) return window.__opened.slice(-1)[0]; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
    return u ? new URL(u).searchParams.get('redirect_uri') : null;
  };
  const rDesk = await connectWith('desktop');
  const rUnsaid = await connectWith('');
  const rWeb = await connectWith('web');
  ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(rDesk || '') && rDesk !== PUBLIC, `«Desktop app»: the sign-in asks Google for 127.0.0.1 on any port — never the relay page a Desktop client cannot take (${rDesk})`);
  ok(rUnsaid === PUBLIC && rWeb === PUBLIC, `CONTROL: not said (as before) and «Web application» ride the public relay page on this hub — the Desktop row above is the client type's doing (${rUnsaid} / ${rWeb})`);
  await p1.evaljs(`document.querySelector('#mounts-dialog-overlay')?.remove(); 1`);
}

p1.close(); p2.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
