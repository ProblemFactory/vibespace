#!/usr/bin/env node
// THE D1 EXTRACTION IS PIXEL-IDENTICAL (docs/design-integrations-per-account.zh.md
// §6 D1 / §8.1 #12; lane integrations chunk 1). `_mountsDialog`, `oauthLinkRow`,
// `_wireOAuthConnect` and the throwing fetch wrapper moved out of
// src/lib/sidebar-mounts.js into src/lib/mounts-dialog.js so the channel
// account dialogs can use the SAME component. The owner's rule for the move:
// the storage side must render exactly as before.
//
// §0 provenance — scripts/fixtures/mounts-dialog-baseline/baseline.js holds
//    the four pre-extraction blocks BYTE FOR BYTE; proved against the git
//    object of 348aa226 (2.369.160) when the history is present, else SKIP
//    with evidence (a shallow CI clone has no parent commit)
// §1 headless chrome, file:// bundles, no server: the REAL storage dialogs
//    (Connect storage × drive / gmail-custom / onedrive consent in flight /
//    s3 advanced open; New submount; Import share link; chunk 3: Re-authorize
//    a Drive mount with its consent in flight) rendered twice — the
//    REAL mixin (A, through the shared module) and the same mixin with the
//    baseline blocks installed over it (B) — then compared: the dialog's
//    outerHTML identical AND the two screenshots identical PIXEL BY PIXEL
//    (decoded RGBA, not the PNG bytes)
// §2 the control: C = B with ONE character changed in the submit label (the
//    re-authorize dialog: in the provider's name) must
//    differ by pixels — proves the comparator can fail
// §3 D2 (chunk 4a): the storage Edit dialog — switching a Drive / Gmail
//    record's OAuth client IS a re-authorization. Save stores the other
//    fields, Re-authorize opens under the NEW client (its start carries the
//    new client, never `mountId`), the minted token lands WITH it; an
//    unchanged client is a plain save; a custom id without its secret is
//    refused inline. The CONTROL is a patched copy of sidebar-mounts.js with
//    the decision neutered (the pre-D2 silent save) — it must still PATCH the
//    new client beside the old token, and it must draw the Edit dialog
//    identically (D2 changes what Save does, not what Edit draws). The switch
//    dialog's skeleton equals the plain re-authorize dialog's. Screenshots:
//    MDLG_SHOT_DIR=<dir>.
//
//   node scripts/test-mounts-dialog-extract.mjs      (SKIPs without chrome)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { scratch, freePort, ONBOARDED_SOURCE } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
const require = createRequire(import.meta.url);

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const BASE_SHA = '348aa226';
const FIXTURE = path.join(REPO, 'scripts/fixtures/mounts-dialog-baseline/baseline.js');
let pass = 0, fail = 0, skip = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── §0 provenance ──
console.log('§0 the baseline fixture is the pre-extraction code, byte for byte');
const fixture = fs.readFileSync(FIXTURE, 'utf-8');
const region = (name) => { const m = new RegExp(`// BEGIN verbatim ${name}\\n([\\s\\S]*?)\\n// END verbatim ${name}`).exec(fixture); return m ? m[1] : null; };
const NAMES = [
  // name, the first line of the block in the old file, the block's last line
  ['oauthLinkRow', 'function oauthLinkRow(url) {', '}'],
  ['api', 'async function api(url, opts = {}) {', '}'],
  ['_mountsDialog', '    _mountsDialog(title, fields, submitLabel, onSubmit, opts = {}) {', '    },'],
  ['_wireOAuthConnect', '    _wireOAuthConnect(ctx, { tokenKey, backend, label, clientIdKey, clientSecretKey }) {', '    },'],
  // chunk 3: the storage re-authorize dialog's shape moved into the module (`reauthDialog`)
  ['_showDriveReauthDialog', '    _showDriveReauthDialog(m) {', '    },'],
];
for (const [n] of NAMES) ok(!!region(n), `the fixture carries the ${n} region`);
let blob = null;
try { blob = execFileSync('git', ['show', `${BASE_SHA}:src/lib/sidebar-mounts.js`], { cwd: REPO, env: gitEnvFrom(process.env), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); } catch {}
if (!blob) { skip++; console.log(`  - SKIP provenance: ${BASE_SHA} is not in this clone (git show failed — a shallow checkout); the pixel legs below still run`); }
else {
  const lines = blob.split('\n');
  for (const [n, first, last] of NAMES) {
    const i = lines.indexOf(first);
    const j = i < 0 ? -1 : lines.indexOf(last, i + 1);
    const orig = i < 0 || j < 0 ? null : lines.slice(i, j + 1).join('\n');
    ok(orig !== null && orig === region(n), `${n} in the fixture === ${BASE_SHA}:src/lib/sidebar-mounts.js (${orig ? orig.split('\n').length : 0} lines)`,
      orig === null ? 'the block was not found in the git object' : 'the fixture drifted from the original');
  }
}

// ── §1 chrome ──
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP §1–§2: no chrome/chromium'); console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`); process.exit(fail ? 1 : 0); }

const D = scratch('mdlg-extract');
const PROFILE = scratch('mdlg-extract-chrome');
fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
let chrome = null;
const cleanup = () => { try { chrome?.kill('SIGKILL'); } catch {} try { fs.rmSync(D, { recursive: true, force: true }); } catch {} try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

const entry = path.join(D, 'entry.js');
fs.writeFileSync(entry, `
import { installSidebarMounts } from ${JSON.stringify(path.join(REPO, 'src/lib/sidebar-mounts.js'))};
import { installBaseline } from ${JSON.stringify(FIXTURE)};
const [variant, scenario] = (location.hash.slice(1) || 'A:connect-drive').split(':');
const J = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
// chunk 4 (D2): the stub RECORDS every call (url, method, parsed body) and
// serves the two Edit dialogs' decrypted configs; a consent "lands" when the
// scenario sets window.__statusToken (the dialog's own 1.5 s status poll reads it)
window.__calls = [];
const CFG = {
  m1: { id: 'm1', name: 'team-drive', type: 'drive', clientPreset: 'acme', clientId: null, clientSecret: '', token: '{"access_token":"OLD"}', driveFolder: '', driveMode: null, teamDriveId: null, rootFolderId: null, customPath: null },
  g1: { id: 'g1', name: 'inbox', type: 'gmail', clientPreset: 'acme', clientId: null, clientSecret: '', token: '{"refresh_token":"OLD"}', syncCount: 200, labelIds: 'INBOX', query: '', groupBy: 'label-month', customPath: null },
};
window.fetch = async (url, opts = {}) => {
  const u = String(url);
  let body = null; try { body = opts.body ? JSON.parse(opts.body) : null; } catch {}
  window.__calls.push({ url: u, method: opts.method || 'GET', body });
  if (u.includes('/api/mounts/drive-defaults')) return J({ presets: [{ key: 'acme', label: 'Acme Workspace' }, { key: 'lab', label: 'Research Lab' }] });
  if (u.includes('/gdrive-auth/start') || u.includes('/gmail-auth/start')) return J({ url: 'https://login.example.test/oauth2/authorize?client_id=vs-test&state=s-1234&redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2F' });
  if (u.includes('/gdrive-auth/status')) return J(window.__statusToken ? { active: false, token: window.__statusToken } : { running: true });
  if (u.includes('/gmail-auth/status')) return J(window.__statusToken ? { running: false, token: window.__statusToken } : { running: true });
  for (const k of ['m1', 'g1']) if (u.endsWith('/api/mounts/' + k + '/config')) return J(CFG[k]);
  return J({});
};
window.open = () => null; // "popup blocked" — the cross-browser link row + paste-back render
function S() { this._hostsData = { hosts: [{ id: 'h1', name: 'Build box', host: 'build.example.test', user: 'dev', port: 22 }] }; }
installSidebarMounts(S);
S.prototype._renderMounts = () => {};
if (variant !== 'A') installBaseline(S);
if (variant === 'C') { const orig = S.prototype._mountsDialog; S.prototype._mountsDialog = function (title, fields, submitLabel, ...rest) { return orig.call(this, title, fields, submitLabel + '.', ...rest); }; }
// the re-authorize dialog has no submit label: its control changes ONE character of the provider's name
if (variant === 'C') { const origP = S.prototype._oauthProviderNames; S.prototype._oauthProviderNames = function (m) { const p = origP.call(this, m); return { ...p, signin: p.signin + '.' }; }; }
const s = new S();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setSel = (key, v) => { const el = s._lastMountsDialog.inputs[key]; el.value = v; el.dispatchEvent(new Event('change')); };
(async () => {
  try {
    if (scenario.startsWith('connect-')) {
      await s._showAddMountDialog();
      if (scenario === 'connect-drive') setSel('type', 'drive');
      if (scenario === 'connect-gmail-custom') { setSel('type', 'gmail'); setSel('gmailClientChoice', 'custom'); }
      if (scenario === 'connect-onedrive-consent') {
        setSel('type', 'onedrive');
        await sleep(30); // the block's visibility follows its token field through a MutationObserver
        const wraps = [...document.querySelectorAll('#mounts-dialog-overlay .mounts-drive-connect')].filter((w) => w.style.display !== 'none');
        wraps.find((w) => /OneDrive/.test(w.querySelector('button').textContent)).querySelector('button').click();
        for (let i = 0; i < 50 && !document.querySelector('#mounts-dialog-overlay .mounts-oauth-link'); i++) await sleep(20);
      }
      if (scenario === 'connect-s3-advanced') { setSel('type', 's3'); document.querySelector('#mounts-dialog-overlay details.mounts-advanced').open = true; }
    }
    if (scenario === 'add-child-drive') s._showAddChildDialog({ id: 'c1', name: 'team-drive', type: 'drive' });
    if (scenario === 'import-share') s._showImportShareDialog();
    if (scenario === 'reauth-drive') {
      // the consent in flight: the sign-in button pressed ⇒ the link row + the paste-back box
      s._showDriveReauthDialog({ id: 'm1', name: 'team-drive', type: 'drive' });
      document.querySelector('#mount-reauth-dialog .mounts-btn-primary').click();
      for (let i = 0; i < 50 && !document.querySelector('#mount-reauth-dialog .mounts-oauth-link'); i++) await sleep(20);
    }
    // chunk 4 — D2: the storage Edit dialog; switching the OAuth client IS a re-authorization
    let after = null;
    if (scenario.startsWith('edit-')) {
      const isG = scenario.includes('gmail');
      await s._showEditMountDialog(isG ? { id: 'g1', name: 'inbox', type: 'gmail', path: '/mnt/inbox' } : { id: 'm1', name: 'team-drive', type: 'drive', path: '/mnt/team-drive' });
      const f = document.querySelector('#mount-edit-dialog form');
      const set = (k, v) => { const el = f.querySelector('[name="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('change')); };
      if (scenario !== 'edit-drive-draw') {
        if (scenario === 'edit-switch-drive' || scenario === 'edit-switch-drive-inflight' || scenario === 'edit-switch-gmail') set('clientPreset', 'lab');
        if (scenario === 'edit-switch-drive-custom') { set('clientPreset', ''); set('clientId', 'cid-9.apps.example.test'); set('clientSecret', 'sec-9'); }
        if (scenario === 'edit-custom-nosecret') { set('clientPreset', ''); set('clientId', 'cid-9.apps.example.test'); }
        if (isG) set('query', 'is:starred'); else set('driveFolder', 'Docs2');
        const n0 = window.__calls.length;
        f.requestSubmit();
        for (let i = 0; i < 100 && document.getElementById('mount-edit-dialog') && !document.querySelector('#mount-edit-dialog .cfg-err')?.textContent; i++) await sleep(20);
        await sleep(100);
        const rd = document.getElementById('mount-reauth-dialog');
        after = { reauth: !!rd, editOpen: !!document.getElementById('mount-edit-dialog'), editErr: document.querySelector('#mount-edit-dialog .cfg-err')?.textContent || '', saveCalls: window.__calls.slice(n0), reauthHtml: null };
        if (rd) {
          rd.querySelector('.mounts-btn-primary').click();
          for (let i = 0; i < 50 && !rd.querySelector('.mounts-oauth-link'); i++) await sleep(20);
          after.reauthHtml = rd.outerHTML;
          if (scenario === 'edit-switch-drive-inflight') await sleep(100); // the consent stays in flight (the screenshot)
          else window.__statusToken = '{"access_token":"NEW"}';
          const landed = () => window.__calls.some((c) => c.url.endsWith('/drive-token') || (c.method === 'PATCH' && c.body && c.body.token));
          for (let i = 0; i < 200 && !landed(); i++) await sleep(20);
          await sleep(50);
        }
      }
    }
    await sleep(150);
    const dlg = scenario === 'edit-switch-drive-inflight' ? document.getElementById('mount-reauth-dialog')
      : scenario.startsWith('edit-') ? document.getElementById('mount-edit-dialog') : (document.getElementById('mounts-dialog-overlay') || document.getElementById('mount-reauth-dialog'));
    window.__state = { html: dlg?.outerHTML || null, after, calls: window.__calls };
  } catch (e) { window.__state = { error: e.message + ' | ' + e.stack }; }
})();
`);
try { execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [entry, '--bundle', `--outfile=${path.join(D, 'b.js')}`,
  '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--log-level=error'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { ok(false, 'the throwaway bundle builds (run `npm run build` once in a fresh worktree — src/lib/build-version.js is generated)', String(e.stderr || e.message).slice(0, 600)); process.exit(1); }
fs.writeFileSync(path.join(D, 't.html'), '<!doctype html><html data-theme="dark"><head><meta charset="utf-8">'
  + `<link rel="stylesheet" href="file://${path.join(REPO, 'public/style.css')}"></head>`
  + `<body><script src="file://${path.join(D, 'b.js')}"></script></body></html>`);
// §3's CONTROL (chunk 4, D2): a patched copy of sidebar-mounts.js with the
// client-switch decision neutered — the pre-D2 silent save. The legs below
// must tell the two apart, and the copy must draw the Edit dialog exactly as
// the real file does (D2 changes what Save DOES, not what Edit DRAWS).
const D2_MARKER = 'const sw = patch.token === undefined ? this._mountClientSwitch(';
const smSrc = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf-8');
const d2MarkerFound = smSrc.includes(D2_MARKER);
ok(d2MarkerFound, '§3 the D2 decision is where the control neuters it (sidebar-mounts.js carries the marker)');
const oldCopy = path.join(D, 'sidebar-mounts.old.js');
fs.writeFileSync(oldCopy, smSrc.replace(D2_MARKER, 'const sw = false ? this._mountClientSwitch(')
  .replace(/from '\.\/([^']+)'/g, (m0, f) => `from ${JSON.stringify(path.join(REPO, 'src/lib', f))}`)
  .replace(/from '\.\.\/([^']+)'/g, (m0, f) => `from ${JSON.stringify(path.join(REPO, 'src', f))}`));
const entryOld = path.join(D, 'entry-old.js');
fs.writeFileSync(entryOld, fs.readFileSync(entry, 'utf-8').replace(JSON.stringify(path.join(REPO, 'src/lib/sidebar-mounts.js')), JSON.stringify(oldCopy)));
try { execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [entryOld, '--bundle', `--outfile=${path.join(D, 'b-old.js')}`,
  '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--log-level=error'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { ok(false, 'the control bundle builds', String(e.stderr || e.message).slice(0, 600)); process.exit(1); }
fs.writeFileSync(path.join(D, 't-old.html'), fs.readFileSync(path.join(D, 't.html'), 'utf-8').replace(path.join(D, 'b.js'), path.join(D, 'b-old.js')));

const CDP_PORT = await freePort();
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox',
  '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=900,1400',
  '--allow-file-access-from-files', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); }
}
if (!target) { ok(false, 'chrome answered on its debugging port'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.value; };
await cdp('Page.enable');
// the §47 idiom (no app boots here — the page is a bare bundle — but one rule for every chrome suite)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 1400, deviceScaleFactor: 1, mobile: false });

// minimal PNG decoder (8-bit RGB/RGBA, non-interlaced — what Chrome writes)
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
const diffPixels = (a, b) => {
  if (a.w !== b.w || a.h !== b.h || a.bpp !== b.bpp) return Infinity;
  let n = 0; for (let i = 0; i < a.px.length; i += a.bpp) { for (let k = 0; k < a.bpp; k++) if (a.px[i + k] !== b.px[i + k]) { n++; break; } }
  return n;
};
const render = async (variant, scenario) => {
  // variant O = the §3 control bundle (the patched copy); it runs the A path of the entry
  await cdp('Page.navigate', { url: variant === 'O' ? `file://${path.join(D, 't-old.html')}#A:${scenario}` : `file://${path.join(D, 't.html')}#${variant}:${scenario}` });
  // a hash-only change would not reload; navigate via about:blank between shots
  let st = null;
  for (let i = 0; i < 100 && !st; i++) { await sleep(50); st = await evalJs('window.__state || null'); }
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  await cdp('Page.navigate', { url: 'about:blank' }); await sleep(50);
  return { st, png: Buffer.from(shot.data, 'base64') };
};

const SCENARIOS = ['connect-drive', 'connect-gmail-custom', 'connect-onedrive-consent', 'connect-s3-advanced', 'add-child-drive', 'import-share', 'reauth-drive'];
console.log('\n§1 the real storage dialogs, through the shared module (A) vs the pre-extraction blocks (B)');
const keep = path.join(D, 'shots'); fs.mkdirSync(keep, { recursive: true });
for (const sc of SCENARIOS) {
  const A = await render('A', sc), B = await render('B', sc), C = await render('C', sc);
  const good = A.st && A.st.html && B.st && B.st.html;
  ok(!!good, `${sc}: both variants rendered the dialog`, JSON.stringify({ A: A.st && (A.st.error || !!A.st.html), B: B.st && (B.st.error || !!B.st.html) }).slice(0, 400));
  if (!good) continue;
  if (sc === 'reauth-drive') ok(A.st.html.includes('mounts-oauth-link') && A.st.html.includes('127.0.0.1:53682') && A.st.html.includes('Sign in with Google'), `${sc}: the re-authorize consent is in flight — the sign-in button, the cross-browser link row and the paste-back box are drawn`);
  if (sc === 'connect-onedrive-consent') ok(A.st.html.includes('mounts-oauth-link') && A.st.html.includes('127.0.0.1:53682'), `${sc}: the consent is in flight — the cross-browser link row and the paste-back box are drawn`);
  ok(A.st.html === B.st.html, `${sc}: the dialog's outerHTML is identical (${A.st.html.length} chars)`);
  const pa = decodePng(A.png), pb = decodePng(B.png), pc = decodePng(C.png);
  const dAB = diffPixels(pa, pb), dAC = diffPixels(pa, pc);
  if (dAB) { fs.writeFileSync(path.join(keep, `${sc}.A.png`), A.png); fs.writeFileSync(path.join(keep, `${sc}.B.png`), B.png); }
  ok(dAB === 0, `${sc}: A and B are identical pixel by pixel (${pa.w}×${pa.h}, ${dAB} differing pixels)`);
  ok(dAC > 0 && dAC !== Infinity, `§2 control ${sc}: one character changed in the submit label ⇒ ${dAC} differing pixels`);
}
// ── §3 D2 (chunk 4): switching the OAuth client of a storage record IS a
// re-authorization — Save stores the other fields, then opens Re-authorize
// under the NEW client; the token minted there lands WITH the client. ──
console.log('\n§3 D2 — the storage Edit dialog: switching the OAuth client opens Re-authorize');
{
  const call = (st, re, method) => (st?.calls || []).filter((c) => re.test(c.url) && (!method || c.method === method));
  const saveCall = (af, re, method) => (af?.saveCalls || []).filter((c) => re.test(c.url) && (!method || c.method === method));
  // the Edit dialog draws the same before and after D2 (the control copy differs only in what Save does)
  const dA = await render('A', 'edit-drive-draw'), dO = await render('O', 'edit-drive-draw');
  ok(!!(dA.st?.html && dO.st?.html), 'edit-drive-draw: the storage Edit dialog rendered (real + control copy)', JSON.stringify({ A: dA.st?.error, O: dO.st?.error }).slice(0, 300));
  if (dA.st?.html && dO.st?.html) {
    ok(dA.st.html === dO.st.html && /Preset: Research Lab/.test(dA.st.html), `edit-drive-draw: the Edit dialog's outerHTML is identical to the control's (${dA.st.html.length} chars) — D2 draws nothing new`);
    const dd = diffPixels(decodePng(dA.png), decodePng(dO.png));
    ok(dd === 0, `edit-drive-draw: …and pixel-identical (${dd} differing pixels)`);
  }
  const sw = await render('A', 'edit-switch-drive');
  const af = sw.st?.after;
  ok(!!af, 'edit-switch-drive: the dialog saved', JSON.stringify(sw.st?.error || null));
  const p1 = saveCall(af, /\/api\/mounts\/m1$/, 'PATCH');
  ok(p1.length === 1 && p1[0].body.driveFolder === 'Docs2' && !('clientPreset' in p1[0].body) && !('token' in p1[0].body),
    'edit-switch-drive: Save stores the NON-client fields only (driveFolder), never the new client beside the old token', JSON.stringify(p1));
  ok(af?.reauth === true && af?.editOpen === false, 'edit-switch-drive: …then the Edit dialog closes and Re-authorize opens', JSON.stringify({ reauth: af?.reauth, editOpen: af?.editOpen }));
  ok(/Preset: Research Lab/.test(af?.reauthHtml || '') && /mounts-oauth-link/.test(af?.reauthHtml || '') && /Sign in with Google/.test(af?.reauthHtml || ''),
    'edit-switch-drive: the re-authorize dialog names the NEW client, and its consent is the storage block (Sign in with Google, the cross-browser link row)');
  const st1 = call(sw.st, /\/gdrive-auth\/start$/, 'POST');
  ok(st1.length === 1 && st1[0].body.clientPreset === 'lab' && !st1[0].body.mountId,
    'edit-switch-drive: the consent starts under the NEW client ({clientPreset:"lab"}, not the record\'s own via mountId)', JSON.stringify(st1));
  const fin1 = call(sw.st, /\/api\/mounts\/m1\/drive-token$/, 'POST');
  ok(fin1.length === 1 && fin1[0].body.token === '{"access_token":"NEW"}' && fin1[0].body.client?.clientPreset === 'lab',
    'edit-switch-drive: the minted token lands WITH the client in one write (drive-token {token, client})', JSON.stringify(fin1));
  const so = await render('O', 'edit-switch-drive');
  const pO = saveCall(so.st?.after, /\/api\/mounts\/m1$/, 'PATCH');
  ok(so.st?.after?.reauth === false && pO.length === 1 && pO[0].body.clientPreset === 'lab',
    '§3 control: the patched copy (the pre-D2 silent save) PATCHes clientPreset beside the old token and opens nothing — the legs above tell the two apart', JSON.stringify({ after: so.st?.after && { reauth: so.st.after.reauth }, pO }));
  const same = await render('A', 'edit-same-drive');
  const p2 = saveCall(same.st?.after, /\/api\/mounts\/m1$/, 'PATCH');
  ok(same.st?.after?.reauth === false && same.st?.after?.editOpen === false && p2.length === 1 && p2[0].body.driveFolder === 'Docs2' && !call(same.st, /-auth\/start$/).length,
    'edit-same-drive: an unchanged client ⇒ a plain save, no re-authorize, no consent', JSON.stringify({ after: same.st?.after && { reauth: same.st.after.reauth }, p2 }));
  const cu = await render('A', 'edit-switch-drive-custom');
  const st3 = call(cu.st, /\/gdrive-auth\/start$/, 'POST');
  const fin3 = call(cu.st, /\/api\/mounts\/m1\/drive-token$/, 'POST');
  ok(cu.st?.after?.reauth === true && st3.length === 1 && st3[0].body.clientId === 'cid-9.apps.example.test' && st3[0].body.clientSecret === 'sec-9',
    'edit-switch-drive-custom: a switch to a custom client starts the consent under that id + secret', JSON.stringify(st3));
  ok(fin3.length === 1 && fin3[0].body.client?.clientId === 'cid-9.apps.example.test' && fin3[0].body.client?.clientSecret === 'sec-9',
    'edit-switch-drive-custom: …and lands the custom client with the token', JSON.stringify(fin3));
  const ns = await render('A', 'edit-custom-nosecret');
  ok(ns.st?.after?.editOpen === true && /secret/i.test(ns.st?.after?.editErr || '') && !call(ns.st, /-auth\/start$/).length && !saveCall(ns.st?.after, /\/api\/mounts\/m1$/, 'PATCH').length,
    'edit-custom-nosecret: a custom client without its secret is refused inline, before any save or consent (a consent under rclone\'s built-in client would be wasted)', JSON.stringify(ns.st?.after && { editOpen: ns.st.after.editOpen, editErr: ns.st.after.editErr }));
  const gm = await render('A', 'edit-switch-gmail');
  const pg = saveCall(gm.st?.after, /\/api\/mounts\/g1$/, 'PATCH');
  const stg = call(gm.st, /\/gmail-auth\/start$/, 'POST');
  const fing = call(gm.st, /\/api\/mounts\/g1$/, 'PATCH').filter((c) => c.body?.token);
  ok(pg.length === 1 && pg[0].body.query === 'is:starred' && !('clientPreset' in pg[0].body), 'edit-switch-gmail: Save stores the non-client fields only', JSON.stringify(pg));
  ok(gm.st?.after?.reauth === true && /Sign in with Google/.test(gm.st?.after?.reauthHtml || '') && stg.length === 1 && stg[0].body.clientPreset === 'lab',
    'edit-switch-gmail: Re-authorize opens and Gmail\'s own consent starts under the new preset', JSON.stringify(stg));
  ok(fing.length === 1 && fing[0].body.clientPreset === 'lab' && fing[0].body.token === '{"access_token":"NEW"}',
    'edit-switch-gmail: the token lands with the preset in ONE PATCH', JSON.stringify(fing));
  // the switch dialog IS the storage re-authorize dialog — same skeleton (tags,
  // classes, the consent in flight), only the hint's words differ
  const inf = await render('A', 'edit-switch-drive-inflight'), plain = await render('A', 'reauth-drive');
  const skel = (h) => String(h || '').replace(/>[^<]*</g, '><');
  ok(!!inf.st?.html && /mounts-oauth-link/.test(inf.st.html) && skel(inf.st.html) === skel(plain.st?.html),
    'edit-switch-drive-inflight: the switch dialog has the plain re-authorize dialog\'s exact skeleton (same shared component; only the hint names the new client)');
  if (process.env.MDLG_SHOT_DIR) for (const [n, r] of [['edit-drive', dA], ['switch-reauth', inf], ['switch-landed', sw]]) fs.writeFileSync(path.join(process.env.MDLG_SHOT_DIR, `d2-${n}.png`), r.png);
}

// teardown: chrome writes into its profile until it is GONE — wait for the
// exit, then remove with retries (a bare rmSync right after SIGKILL left the
// profile dir behind: the 2.369.160 r2 ENOTEMPTY class)
try { ws.close(); } catch {}
if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
  const gone = new Promise((r) => chrome.once('exit', r));
  try { chrome.kill('SIGKILL'); } catch {}
  await Promise.race([gone, sleep(5000)]);
}
for (const dir of [PROFILE, D]) {
  for (let i = 0; i < 20 && fs.existsSync(dir); i++) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { await sleep(100); } }
}
ok(!fs.existsSync(PROFILE) && !fs.existsSync(D), 'teardown: the scratch bundle dir and the chrome profile are gone');
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
