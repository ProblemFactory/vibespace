#!/usr/bin/env node
// INTEGRATIONS & KEYS IN A BROWSER (docs/design-communication-panel.zh.md
// §14.5 + §17's `test-channels-e2e` Integrations leg + §19's P0 r7/r8 exit
// conditions; gate row `test-integrations-ui`, heavy tier — a real worktree
// server and headless chrome at 375×667).
//
// What is measured, in the order the design states it:
//   ① the fake row's SOURCE CHIP walks none → your own (PUT) → cluster
//      default (env injected + "use cluster") → none WITH A REASON (env removed,
//      server restarted) — each step on the real server, read off the card
//   ② the SETUP BLOCK is drawn ABOVE the fields; the fake card draws its
//      callback URL; the LARK card draws http://127.0.0.1:17865/lark/cb with
//      its three prerequisites, and its copy button copies EXACTLY that
//   ③ REPLACE NEVER REVEALS: a 40-char secret typed into the card comes back
//      as `••••` + last 4; the plaintext appears nowhere on the page, in any
//      GET body, or in a broadcast
//   ④ the delegating (gmail) dropdown resolves `prefer` on org1 + channels and
//      a saved choice overrides it; the chip reads `Cluster default · <label>`
//   ⑤ a PUT failure reaches the user as a TOAST with the field named
//   ⑥ the deep link `app.openIntegration('lark')` lands on that card
//   ⑦ two clients see one change
//   ⑧ the Test button's wording follows `test.kind`; a verdict is NEVER drawn
//      without the caveat; a failed Test draws the words; lark's Test is a
//      named refusal
//   ⑨ at 375×667 every control of every card is inside the viewport
//   ⑩ THE ACCOUNT MODEL (2026-09-22, the owner's mounts analogy — c2, the
//      wizard and the panel): a kind whose integration offers TWO credentials
//      draws the wizard's credential step (the row's default pre-picked) and
//      the CHOSEN key reaches the connect body; "Add account…" on a kind's
//      section mints a SECOND account, the two list as two sections with
//      distinct names and a credential chip each; re-authorize on the second
//      section posts to ITS id; a kind offering ONE credential skips the step
//      silently (rebooted with a single preset — the account minted under the
//      withdrawn one says so BY NAME, the other is untouched); the
//      Integrations chooser's caption reads "Default for new accounts"
//
// Everything is per-pid (scripts/scratch.mjs); the server gets a NAMED
// scratch HOME. Run: node scripts/test-integrations-ui.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('integ-ui');
const fakeHome = scratchHome('integ-ui-home', fs);
const chromeDir = scratch('integ-ui-chrome');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LARK_CB = 'http://127.0.0.1:17865/lark/cb';
const FAKE_CB = 'http://127.0.0.1:17865/fake/cb';
const SECRET40 = 'sk-' + 'Q7f3'.repeat(8) + 'ZZZ99';   // 40 chars
const PRESETS = JSON.stringify([
  { key: 'org1', label: 'Org 1', clientId: 'org1.apps.googleusercontent.com', clientSecret: 'org1-secret-000000' },
  { key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' },
]);
const CLUSTER_FAKE = JSON.stringify([{ id: 'fake', label: 'Cluster fake', values: { apiKey: 'cluster-fake-key-1234', region: 'cluster' } }]);

// ── throwaway worktree + WORKING-TREE overlay ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

let srv = null;
const bootServer = (extraEnv = {}) => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_GDRIVE_CLIENTS: PRESETS, ...extraEnv },
});
srv = bootServer();

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=375,667', '--disable-background-timer-throttling',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

const base = `http://127.0.0.1:${PORT}`;
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/home`); return true; } catch { await sleep(250); } } return false; };
const waitDown = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`${base}/api/home`); await sleep(100); } catch { return true; } } return false; };
ok(await waitServer(), 'the worktree server booted');
const api = async (method, p, body) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() }; };

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
  const load = async () => {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `${base}/` });
    for (let i = 0; i < 160; i++) { try { if (await evaljs('!!(window.app && window.app.wm)')) return true; } catch {} await sleep(250); }
    return false;
  };
  return { cdp, evaljs, load, close: () => { try { ws.close(); } catch {} } };
}
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

// page-side helpers (strings evaluated in the page)
const OPEN = (id) => `(async () => {
  window.app.openIntegration(${JSON.stringify(id)});
  for (let i = 0; i < 80; i++) {
    const c = document.querySelector('.integ-card[data-integ="fake"]');
    if (c && document.querySelector('.integ-card[data-integ="lark"]') && document.querySelector('.integ-card[data-integ="gmail"]')) return true;
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

const p1 = await newPage();
ok(await p1.load(), 'page 1 loaded the app at 375×667');

// ── ① none (fresh instance) ──
{
  const r = await api('GET', '/api/integrations/fake');
  ok(r.json.integration.source === 'none', 'fresh instance: the fake row is none (route)');
  ok(await p1.evaljs(OPEN('fake')), 'app.openIntegration("fake") opened the window with every card');
  ok(await p1.evaljs(`${CARD('fake')}.classList.contains('integ-focus')`), 'the deep-linked card is highlighted');
  ok((await chipOf(p1, 'fake')) === 'Not configured', 'chip: Not configured');
  ok(await p1.evaljs(`/no default/.test((${CARD('fake')}.querySelector('.integ-why') || {}).textContent || '')`), 'and the card says WHY (no cluster default)');
  ok(await p1.evaljs(`${CARD('fake')}.querySelector('.integ-missing') !== null`), 'the required-missing field is marked');
}

// ── ② the setup block, ABOVE the fields, with a copyable callback URL ──
{
  const order = await p1.evaljs(`(() => { const c = ${CARD('fake')}; const s = c.querySelector('.integ-setup'), f = c.querySelector('.integ-fields'); return !!(s && f && (s.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING)); })()`);
  ok(order, 'the fake card draws its setup block ABOVE the fields');
  ok((await p1.evaljs(`${CARD('fake')}.querySelector('.integ-cb-url').textContent`)) === FAKE_CB, `the fake card draws ${FAKE_CB}`);
  ok((await p1.evaljs(`${CARD('lark')}.querySelector('.integ-cb-url').textContent`)) === LARK_CB, `THE LARK CARD DRAWS ${LARK_CB}`);
  ok((await p1.evaljs(`${CARD('lark')}.querySelectorAll('.integ-prereq li').length`)) === 3, 'and its three prerequisites');
  ok(await p1.evaljs(`/Redirect URLs/.test(${CARD('lark')}.querySelector('.integ-setup').textContent)`), 'and the note saying which console page the URL goes to');
  const copied = await p1.evaljs(`(async () => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
    ${CARD('lark')}.querySelector('.integ-copy').click();
    // the stub resolves synchronously, so \`__copied\` is set before the
    // handler's await resumes — the LABEL is what proves the copy settled
    for (let i = 0; i < 20 && ${CARD('lark')}.querySelector('.integ-copy').textContent !== 'Copied'; i++) await new Promise((r) => setTimeout(r, 50));
    return { copied: window.__copied, label: ${CARD('lark')}.querySelector('.integ-copy').textContent };
  })()`);
  ok(copied.copied === LARK_CB, `THE COPY BUTTON COPIES EXACTLY ${LARK_CB} (got ${JSON.stringify(copied.copied)})`);
  ok(copied.label === 'Copied', 'and says so on the button');
  ok(await p1.evaljs(`${CARD('gmail')}.querySelector('.integ-setup') === null`), 'a row with no setup draws no setup block (gmail)');
}

// ── ③ Replace never reveals ──
{
  const done = await p1.evaljs(`(async () => {
    const c = ${CARD('fake')};
    const row = c.querySelector('.integ-field[data-field="apiKey"]');
    row.querySelector('.integ-replace').click();
    const inp = row.querySelector('input[type="password"]');
    if (!inp) return { why: 'no password input after Set' };
    inp.value = ${JSON.stringify(SECRET40)};
    row.querySelector('.mounts-btn-primary').click();
    for (let i = 0; i < 60; i++) {
      const c2 = ${CARD('fake')};
      const m = c2 && c2.querySelector('.integ-field[data-field="apiKey"] .integ-mask');
      if (m && /••••/.test(m.textContent) && !c2.querySelector('input[type="password"]')) return { mask: m.textContent, chip: c2.querySelector('.integ-chip').textContent, pw: false };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { why: 'never re-rendered' };
  })()`);
  ok(done.mask === '••••ZZ99', `after Save the secret shows as its mask + last 4 (${JSON.stringify(done)})`);
  ok(done.chip === 'Your own', 'chip: Your own (source user)');
  ok(!(await p1.evaljs(`document.body.innerText.includes(${JSON.stringify(SECRET40)}) || document.body.innerHTML.includes(${JSON.stringify(SECRET40)})`)), 'THE PLAINTEXT IS NOWHERE ON THE PAGE (text or markup)');
  const g = await api('GET', '/api/integrations');
  ok(!g.text.includes(SECRET40), 'nor in the GET body');
  ok(await p1.evaljs(`${CARD('fake')}.querySelector('.integ-field[data-field="apiKey"] .integ-replace').textContent === 'Replace'`), 'the button now says Replace — there is no Reveal');
  // Replace opens an EMPTY password field
  const empty = await p1.evaljs(`(() => { const row = ${CARD('fake')}.querySelector('.integ-field[data-field="apiKey"]'); row.querySelector('.integ-replace').click(); const i = row.querySelector('input[type="password"]'); const v = i ? i.value : null; row.querySelector('.mounts-btn:not(.mounts-btn-primary)').click(); return v; })()`);
  ok(empty === '', 'Replace opens an EMPTY password input (never pre-filled with the value)');
  const stored = fs.readFileSync(path.join(wt, 'data/integrations.json'), 'utf-8');
  ok(!stored.includes(SECRET40), 'and the on-disk record holds ciphertext, not the plaintext');
}

// ── ⑧ Test: wording by kind; verdict never without the caveat; failure words; lark refusal ──
{
  ok((await p1.evaljs(`${CARD('fake')}.querySelector('.integ-test').textContent`)) === 'Check format (no network)', 'fake (shape-only): the button says "Check format (no network)"');
  ok((await p1.evaljs(`${CARD('lark')}.querySelector('.integ-test').textContent`)) === 'Test connection', 'lark (credential-exchange): the button says "Test connection"');
  const t1 = await p1.evaljs(`(async () => { ${CARD('fake')}.querySelector('.integ-test').click(); for (let i = 0; i < 60; i++) { const r = ${CARD('fake')}.querySelector('.integ-test-result'); if (r && r.querySelector('.integ-verdict')) return { verdict: r.querySelector('.integ-verdict').textContent, caveat: !!r.querySelector('.integ-caveat'), text: r.textContent }; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(t1 && t1.verdict === 'Passed' && t1.caveat, `a passing Test draws Passed WITH the caveat, never a bare tick (${JSON.stringify(t1 && t1.text).slice(0, 120)})`);
  await api('PUT', '/api/integrations/fake', { values: { apiKey: 'this-will-fail-key' } });
  await p1.evaljs(WAIT_CARD('fake', `(c) => /••••/.test((c.querySelector('.integ-mask') || {}).textContent || '')`));
  const t2 = await p1.evaljs(`(async () => { ${CARD('fake')}.querySelector('.integ-test').click(); for (let i = 0; i < 60; i++) { const r = ${CARD('fake')}.querySelector('.integ-test-result'); const v = r && r.querySelector('.integ-verdict'); if (v && v.textContent === 'Failed') return { err: (r.querySelector('.integ-test-error') || {}).textContent || '', caveat: !!r.querySelector('.integ-caveat') }; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  ok(t2 && /fail/.test(t2.err) && t2.caveat, `a failing Test draws the words on the card, beside the caveat (${JSON.stringify(t2)})`);
  const t3 = await p1.evaljs(`(async () => { ${CARD('lark')}.querySelector('.integ-test').click(); for (let i = 0; i < 60; i++) { const r = ${CARD('lark')}.querySelector('.integ-test-result'); const e = r && r.querySelector('.integ-test-error'); if (e) return e.textContent; await new Promise((r) => setTimeout(r, 100)); } return null; })()`);
  // Since P1a (2.369.106) the Lark runner IS wired: with no credential resolved the card carries the runner's own NAMED refusal (no key ⇒ no vendor call), not the pre-P1 `not-wired` line
  ok(t3 && /no credential resolved for Lark/.test(t3) && !/not wired/i.test(t3), `lark's Test with no credential is a NAMED refusal on the card, and never the retired not-wired line (${JSON.stringify(t3)})`);
  await api('PUT', '/api/integrations/fake', { values: { apiKey: SECRET40 } });
}

// ── ④ the delegating dropdown ──
{
  await p1.evaljs(WAIT_CARD('gmail', `(c) => !!c.querySelector('select.integ-preset')`));
  const v = await p1.evaljs(`${CARD('gmail')}.querySelector('select.integ-preset').value`);
  ok(v === 'channels', 'gmail on org1 + channels (no default) resolves to `prefer` = channels');
  ok((await chipOf(p1, 'gmail')) === 'Cluster default · Channels', 'chip reads `Cluster default · Channels`');
  ok(await p1.evaljs(`${CARD('gmail')}.querySelectorAll('input[type="radio"]').length === 0`), 'a delegating row draws a DROPDOWN, not the radio pair');
  await p1.evaljs(`(() => { const s = ${CARD('gmail')}.querySelector('select.integ-preset'); s.value = 'org1'; s.dispatchEvent(new Event('change')); return true; })()`);
  ok(await p1.evaljs(WAIT_CARD('gmail', `(c) => (c.querySelector('.integ-chip') || {}).textContent === 'Cluster default · Org 1'`)), 'choosing org1 in the dropdown: chip reads `Cluster default · Org 1`');
  const g = await api('GET', '/api/integrations/gmail');
  ok(g.json.integration.clusterKey === 'org1' && g.json.integration.source === 'cluster', 'the server resolves the SAVED choice over prefer (source cluster, clusterKey org1)');
  ok((await p1.evaljs(`${CARD('gmail')}.querySelector('select.integ-preset').value`)) === 'org1', 'and the dropdown shows it after the re-render');
}

// ── ⑤ a PUT failure toasts ──
{
  const toast = await p1.evaljs(`(async () => {
    const row = ${CARD('lark')}.querySelector('.integ-field[data-field="appId"]');
    row.querySelector('.integ-replace').click();
    const inp = row.querySelector('input'); inp.value = 'nope';
    row.querySelector('.mounts-btn-primary').click();
    for (let i = 0; i < 60; i++) { const t = document.querySelector('.global-toast-error .global-toast-body'); if (t) return t.textContent; await new Promise((r) => setTimeout(r, 100)); }
    return null;
  })()`);
  ok(toast && /appId/.test(toast) && /cli_/.test(toast), `a refused PUT is a TOAST naming the field and the rule (${JSON.stringify(toast)})`);
}

// ── ⑥ the deep link lands on the card ──
{
  await p1.evaljs(`window.app.openIntegration('lark'); 1`);
  await sleep(200);
  ok(await p1.evaljs(`${CARD('lark')}.classList.contains('integ-focus') && !${CARD('fake')}.classList.contains('integ-focus')`), 'openIntegration("lark") on the open window highlights THAT card and no other');
  ok(await p1.evaljs(`[...window.app.wm.windows.values()].filter((w) => w.type === 'integrations').length === 1`), 'the window is a singleton (a second open focused the first)');
  // lark's highlight from the step above is still fading (FOCUS_MS), so the
  // claim is "the highlighted SET is unchanged", not "nothing is highlighted"
  const gone = await p1.evaljs(`(() => {
    const focused = () => [...document.querySelectorAll('.integ-focus')].map((c) => c.dataset.integ).join(',');
    const before = focused();
    let threw = null; try { window.app.openIntegration('no-such-row'); } catch (e) { threw = String(e); }
    const wins = [...window.app.wm.windows.values()].filter((w) => w.type === 'integrations').length;
    return { before, after: focused(), threw, wins };
  })()`);
  ok(gone.wins === 1 && gone.threw === null && gone.after === gone.before && gone.before === 'lark', `a focus id that no longer exists opens nothing new, highlights nothing new and throws nothing (${JSON.stringify(gone)})`);
}

// ── ⑨ 375×667: every control inside the viewport ──
{
  const out = await p1.evaljs(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.integ-card button, .integ-card select, .integ-card input, .integ-card .integ-cb-url')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > 376 || r.left < -1) bad.push((el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right));
    }
    const cards = [...document.querySelectorAll('.integ-card')].map((c) => Math.round(c.getBoundingClientRect().width));
    return { bad, cards, n: document.querySelectorAll('.integ-card').length };
  })()`);
  ok(out.n >= 4 && !out.bad.length, `375×667: all ${out.n} cards, every control inside the viewport (offenders: ${out.bad.join(', ') || 'none'}; card widths ${out.cards.join('/')})`);
  ok(out.cards.every((w) => w <= 375), 'single column — no card wider than the viewport');
}

// ── ⑦ two clients see one change ──
const p2 = await newPage();
{
  ok(await p2.load() && await p2.evaljs(OPEN('fake')), 'page 2 loaded and opened the window');
  const set = await p1.evaljs(`(async () => {
    const row = ${CARD('fake')}.querySelector('.integ-field[data-field="region"]');
    row.querySelector('.integ-replace').click();
    const inp = row.querySelector('input'); inp.value = 'eu-west';
    row.querySelector('.mounts-btn-primary').click();
    return true;
  })()`);
  ok(set, 'page 1 saved region = eu-west through the card');
  ok(await p2.evaljs(WAIT_CARD('fake', `(c) => (c.querySelector('.integ-field[data-field="region"] .integ-plain') || {}).textContent === 'eu-west'`)), 'page 2 repainted the row from the integrations-updated broadcast (no reload, no click)');
}

// ── ① continued: cluster default (env injected + use cluster) → none WITH A REASON (env removed, restart) ──
{
  srv.kill('SIGKILL'); await waitDown();
  srv = bootServer({ VIBESPACE_INTEGRATIONS: CLUSTER_FAKE });
  ok(await waitServer(), 'rebooted WITH a cluster default for the fake row');
  ok(await p1.load() && await p1.evaljs(OPEN('fake')), 'page 1 reloaded and reopened the window');
  ok((await chipOf(p1, 'fake')) === 'Your own', 'USER > CLUSTER: the user\'s own key survives the injected default (chip still Your own)');
  ok(await p1.evaljs(`!${CARD('fake')}.querySelector('input[value="cluster"]').disabled`), 'the "Use cluster default" radio is now enabled');
  // "Clear my keys" through the card (confirm dialog) ⇒ lands on the cluster default
  const cleared = await p1.evaljs(`(async () => {
    ${CARD('fake')}.querySelector('.integ-clear').click();
    // the confirm modal is appended to body LAST; index.html carries static
    // dialogs with the same footer classes, so scope to the overlay and take
    // the newest — a bare \`.dialog-footer .btn-create\` clicks a hidden one
    for (let i = 0; i < 40; i++) { const b = [...document.querySelectorAll('.dialog-overlay .dialog-footer .btn-create')].pop(); if (b) { b.click(); break; } await new Promise((r) => setTimeout(r, 50)); }
    for (let i = 0; i < 60; i++) { const c = ${CARD('fake')}; const chip = c && c.querySelector('.integ-chip'); if (chip && /Cluster default/.test(chip.textContent)) return chip.textContent; await new Promise((r) => setTimeout(r, 100)); }
    return null;
  })()`);
  ok(cleared === 'Cluster default · Cluster fake', `"Clear my keys" lands on the CLUSTER default, chip = Cluster default · <label> (${JSON.stringify(cleared)})`);
  ok(await p1.evaljs(`${CARD('fake')}.querySelector('input[value="cluster"]').checked`), 'the cluster radio is checked');
  ok(await p1.evaljs(`/Provided by the cluster/.test(${CARD('fake')}.querySelector('.integ-fields').textContent)`), 'and the fields read "Provided by the cluster" — nothing to type');
  const use = await api('PUT', '/api/integrations/fake', { use: 'cluster' });
  ok(use.status === 200 && use.json.integration.source === 'cluster', "PUT {use:'cluster'} confirms the choice");
  ok(!fs.readFileSync(path.join(wt, 'data/integrations.json'), 'utf-8').includes('cluster-fake-key'), 'the cluster value was never written to disk');
  // env removed + restart ⇒ none WITH the reason, never the old value
  srv.kill('SIGKILL'); await waitDown();
  srv = bootServer();
  ok(await waitServer(), 'rebooted WITHOUT the cluster default');
  const r = await api('GET', '/api/integrations/fake');
  ok(r.json.integration.source === 'none' && /no longer provided/.test(r.json.integration.why) && r.json.integration.set.apiKey === false, `INJECT-THEN-REMOVE: none WITH A REASON on the route (${r.json.integration.why})`);
  ok(await p1.load() && await p1.evaljs(OPEN('fake')), 'page 1 reloaded');
  ok((await chipOf(p1, 'fake')) === 'Not configured', 'chip: Not configured');
  ok(await p1.evaljs(`/no longer provided/.test((${CARD('fake')}.querySelector('.integ-why') || {}).textContent || '')`), 'and the card says the cluster default this row used is no longer provided');
  ok(await p1.evaljs(`${CARD('fake')}.querySelector('input[value="cluster"]').disabled && /no longer provided|no default/.test(${CARD('fake')}.querySelector('.integ-radio-off').textContent)`), 'the "Use cluster default" radio is greyed WITH the reason');
}

// ── ⑩ THE ACCOUNT MODEL (2026-09-22, c2): the credential step, N accounts per kind, re-authorize by id ──
// The server runs with the two Gmail presets (PRESETS) and no cluster row;
// gmail's SAVED pick is org1 (④). Gmail's `auth.begin()` only builds a consent
// URL and listens on a free loopback port — no vendor is called (the flows are
// cancelled before any exchange).
{
  const PANEL = `(async () => {
    window.app.openChannels();
    for (let i = 0; i < 80; i++) { if (document.querySelector('.rail-panel-channels .chan-connect-btn[data-connect-kind="gmail"]')) return true; await new Promise((r) => setTimeout(r, 100)); }
    return false;
  })()`;
  // record every write the wizard makes (url + body) — the proof that the CHOSEN key reaches the connect body
  const PATCH = `(() => { const m = { posts: [] }; window.__wiz = m; const of = window.fetch; window.fetch = function (u, init, ...r) { if (/^\\/api\\/channels\\/adapters\\//.test(String(u)) && init && init.method === 'POST') m.posts.push({ url: String(u), body: (() => { try { return JSON.parse(init.body || '{}'); } catch { return null; } })() }); return of.call(this, u, init, ...r); }; return 1; })()`;
  const SECS = `[...document.querySelectorAll('.rail-panel-channels .chan-sec')].filter((s) => (s.dataset.adapter || '').startsWith('gmail')).map((s) => ({ id: s.dataset.adapter, name: (s.querySelector('.chan-sec-name') || {}).textContent || null, chip: (s.querySelector('.chan-cred-chip') || {}).textContent || null, title: s.querySelector('.chan-sec-head').title, notes: [...s.querySelectorAll('.chan-sec-note')].map((n) => n.textContent) }))`;
  const CANCEL = `(async () => { const d = document.querySelector('#chan-flow-dialog'); if (!d) return 'no dialog'; const b = [...d.querySelectorAll('.chan-flow-actions button')].find((x) => x.textContent.trim() === 'Cancel'); if (!b) return 'no cancel'; b.click(); for (let i = 0; i < 40; i++) { if (!document.querySelector('#chan-flow-dialog')) return 'closed'; await new Promise((r) => setTimeout(r, 100)); } return 'still open'; })()`;
  const MENU = (secIdx, item) => `(async () => { const s = [...document.querySelectorAll('.rail-panel-channels .chan-sec')].filter((x) => (x.dataset.adapter || '').startsWith('gmail'))[${secIdx}]; if (!s) return 'no section'; s.querySelector('.chan-sec-more').click(); await new Promise((r) => setTimeout(r, 150)); const m = document.querySelector('.context-menu'); if (!m) return 'no menu'; const it = [...m.querySelectorAll('.context-menu-item')].find((x) => x.textContent.trim() === ${JSON.stringify(item)}); if (!it) { const names = [...m.querySelectorAll('.context-menu-item')].map((x) => x.textContent.trim()).join('|'); m.remove(); return 'no item among ' + names; } it.click(); return 'ok'; })()`;
  const WAIT_DIALOG = (sel) => `(async () => { for (let i = 0; i < 60; i++) { if (document.querySelector('#chan-flow-dialog ' + ${JSON.stringify(sel)})) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`;

  ok(await p1.evaljs(PANEL), 'the Channels panel (its window on a phone) lists the Gmail connect entry');
  await p1.evaljs(PATCH);
  const gm0 = (await api('GET', '/api/channels')).json;
  const av = ((gm0 && gm0.available) || []).find((a) => a.kind === 'gmail');
  ok(av && av.credentials.length === 3 && av.credentials[2].key === 'own' && av.credentials[2].available === false && av.credentialDefault === 'cluster:org1', `FIXTURE: Gmail offers TWO credentials and the row's default is cluster:org1 (${JSON.stringify(av && { credentials: av.credentials.map((c) => c.key), credentialDefault: av.credentialDefault })})`);

  // (a) two offered ⇒ the CREDENTIAL step is drawn, the row's default pre-picked, nothing posted yet
  const step = await p1.evaljs(`(async () => {
    document.querySelector('.rail-panel-channels .chan-connect-btn[data-connect-kind="gmail"]').click();
    for (let i = 0; i < 40; i++) { if (document.querySelector('#chan-flow-dialog .chan-cred-list')) break; await new Promise((r) => setTimeout(r, 100)); }
    const d = document.querySelector('#chan-flow-dialog'); if (!d) return null;
    const radios = [...d.querySelectorAll('.chan-cred-item input[type="radio"]')];
    return { radios: radios.map((r) => ({ value: r.value, checked: r.checked, label: r.parentElement.querySelector('.chan-cred-label').textContent })), on: [...d.querySelectorAll('.chan-step')].findIndex((s) => s.classList.contains('chan-step-on')), flowInput: !!d.querySelector('.chan-flow-input'), posts: window.__wiz.posts.length };
  })()`);
  ok(step && step.radios.length === 3 && step.radios[0].value === 'cluster:org1' && step.radios[0].checked && step.radios[1].value === 'cluster:channels' && !step.radios[1].checked && step.radios[2].value === 'own' && !step.radios[2].checked, `two offered ⇒ the CREDENTIAL step: one radio per preset, the row's default (org1) pre-picked (${JSON.stringify(step)})`);
  ok(step && step.radios[0].label === 'Org 1' && step.radios[1].label === 'Channels' && step.radios[2].label === 'Own client' && step.on === 0 && !step.flowInput && step.posts === 0, 'each preset is named by its label, step 1 is current, no consent input yet and NOTHING was posted');
  // choose the OTHER preset → Continue → the SAME dialog is on the consent step; the chosen key is in the connect body
  const flow = await p1.evaljs(`(async () => {
    const d = document.querySelector('#chan-flow-dialog');
    d.querySelector('.chan-cred-item input[value="cluster:channels"]').click();
    [...d.querySelectorAll('.chan-flow-actions button')].find((b) => b.textContent.trim() === 'Continue').click();
    for (let i = 0; i < 60; i++) { if (document.querySelector('#chan-flow-dialog .chan-flow-input')) break; await new Promise((r) => setTimeout(r, 100)); }
    const d2 = document.querySelector('#chan-flow-dialog');
    return { same: d2 === d, flowInput: !!(d2 && d2.querySelector('.chan-flow-input')), credList: !!(d2 && d2.querySelector('.chan-cred-list')), on: d2 ? [...d2.querySelectorAll('.chan-step')].findIndex((s) => s.classList.contains('chan-step-on')) : -1, posts: window.__wiz.posts.slice() };
  })()`);
  ok(flow && flow.same && flow.flowInput && !flow.credList && flow.on === 1, `Continue moves the SAME dialog on to the consent step (${JSON.stringify(flow && { same: flow.same, flowInput: flow.flowInput, credList: flow.credList, on: flow.on })})`);
  ok(flow && flow.posts.length === 1 && /\/api\/channels\/adapters\/gmail\/connect$/.test(flow.posts[0].url) && flow.posts[0].body && flow.posts[0].body.credentialKey === 'cluster:channels' && flow.posts[0].body.newAccount === true, `the CHOSEN key reaches the connect body {credentialKey:'cluster:channels', newAccount:true} (${JSON.stringify(flow && flow.posts)})`);
  ok((await p1.evaljs(CANCEL)) === 'closed', 'Cancel ends the first account\'s consent flow (nothing exchanged)');
  const g1 = (await api('GET', '/api/channels')).json;
  const a1 = ((g1 && g1.adapters) || []).filter((a) => a.kind === 'gmail');
  ok(a1.length === 1 && a1[0].id === 'gmail' && a1[0].credentialKey === 'cluster:channels' && a1[0].credentialLabel === 'Channels' && !a1[0].flow, `the FIRST account keeps id === kind and is stamped with the chosen key (${JSON.stringify(a1.map((a) => ({ id: a.id, credentialKey: a.credentialKey, credentialLabel: a.credentialLabel })))})`);
  await sleep(600);
  const secs1 = await p1.evaljs(SECS);
  ok(secs1.length === 1 && secs1[0].id === 'gmail' && secs1[0].name === 'Gmail' && secs1[0].chip === 'Channels', `ONE section: a lone account keeps the kind's name; its chip names the credential because two are offered (${JSON.stringify(secs1)})`);

  // (b) "Add account…" on the kind's section → the credential step again → the default this time → a SECOND account
  ok((await p1.evaljs(MENU(0, 'Add account…'))) === 'ok', 'the section\'s ⋯ menu carries "Add account…"');
  ok(await p1.evaljs(WAIT_DIALOG('.chan-cred-list')), 'it opens the wizard at the credential step (two are offered)');
  const second = await p1.evaljs(`(async () => {
    const d = document.querySelector('#chan-flow-dialog');
    const picked = d.querySelector('.chan-cred-item input:checked').value;
    [...d.querySelectorAll('.chan-flow-actions button')].find((b) => b.textContent.trim() === 'Continue').click();
    for (let i = 0; i < 60; i++) { if (document.querySelector('#chan-flow-dialog .chan-flow-input')) break; await new Promise((r) => setTimeout(r, 100)); }
    return { picked, flowInput: !!document.querySelector('#chan-flow-dialog .chan-flow-input'), post: window.__wiz.posts[window.__wiz.posts.length - 1] };
  })()`);
  ok(second && second.picked === 'cluster:org1' && second.flowInput && second.post && /\/adapters\/gmail\/connect$/.test(second.post.url) && second.post.body.credentialKey === 'cluster:org1' && second.post.body.newAccount === true, `the default (org1) is pre-picked; Continue posts {credentialKey:'cluster:org1', newAccount:true} to the KIND's connect (${JSON.stringify(second)})`);
  ok((await p1.evaljs(CANCEL)) === 'closed', 'Cancel ends the second account\'s consent flow');
  const g2 = (await api('GET', '/api/channels')).json;
  const a2 = ((g2 && g2.adapters) || []).filter((a) => a.kind === 'gmail');
  const idB = a2.length === 2 ? a2[1].id : null;
  ok(a2.length === 2 && a2[0].id === 'gmail' && /^gmail:[0-9a-f]{8}$/.test(idB || '') && a2[0].credentialKey === 'cluster:channels' && a2[1].credentialKey === 'cluster:org1', `TWO accounts of one kind: the first keeps id === kind, the second is <kind>:<8 hex>, each under ITS key (${JSON.stringify(a2.map((a) => ({ id: a.id, credentialKey: a.credentialKey })))})`);
  await sleep(600);
  const secs2 = await p1.evaljs(SECS);
  ok(secs2.length === 2 && secs2[0].id === 'gmail' && secs2[1].id === idB && secs2[0].name === 'Gmail account 1' && secs2[1].name === 'Gmail account 2', `two SECTIONS with DISTINCT names, numbered in record order until the token names them (${JSON.stringify(secs2.map((s) => s.name))})`);
  ok(secs2.every((s) => s.title === 'Gmail · ' + s.name) && secs2[0].chip === 'Channels' && secs2[1].chip === 'Org 1', `each head's tooltip keeps the kind beside the account and each chip names ITS credential (${JSON.stringify(secs2.map((s) => [s.title, s.chip]))})`);

  // (c) Connect on a TOKEN-LESS account (verifier r1): the wizard's credential
  // step first, ITS OWN key pre-picked (never the row's default over it), the
  // chosen key posted to ITS /reauthorize — the server re-binds; a second
  // pass re-binds it back so (e) sees the fixture it expects
  const STEP = `(() => { const d = document.querySelector('#chan-flow-dialog'); if (!d) return null; const radios = [...d.querySelectorAll('.chan-cred-item input[type="radio"]')]; return { picked: (radios.find((r) => r.checked) || {}).value || null, values: radios.map((r) => r.value), on: [...d.querySelectorAll('.chan-step')].findIndex((s) => s.classList.contains('chan-step-on')), flowInput: !!d.querySelector('.chan-flow-input'), posts: window.__wiz.posts.length }; })()`;
  const CHOOSE = (key) => `(async () => { const d = document.querySelector('#chan-flow-dialog'); d.querySelector('.chan-cred-item input[value=' + JSON.stringify(${JSON.stringify(key)}) + ']').click(); [...d.querySelectorAll('.chan-flow-actions button')].find((b) => b.textContent.trim() === 'Continue').click(); for (let i = 0; i < 60; i++) { if (document.querySelector('#chan-flow-dialog .chan-flow-input')) break; await new Promise((r) => setTimeout(r, 100)); } const d2 = document.querySelector('#chan-flow-dialog'); return { same: d2 === d, flowInput: !!(d2 && d2.querySelector('.chan-flow-input')), posts: window.__wiz.posts.slice() }; })()`;
  await p1.evaljs(`window.__wiz.posts.length = 0; 1`);
  ok(a2[0].auth && a2[0].auth.tokenHeld === false && a2[0].credentialKey === 'cluster:channels', 'FIXTURE: the first account holds no token (its flow was cancelled) and is stamped channels while the row\'s default is org1');
  ok((await p1.evaljs(MENU(0, 'Connect'))) === 'ok', 'the first section\'s ⋯ menu carries the consent verb (Connect — it never connected)');
  ok(await p1.evaljs(WAIT_DIALOG('.chan-cred-list')), 'a token-less account opens at the CREDENTIAL step (two are offered) — not straight at consent');
  const st1 = await p1.evaljs(STEP);
  ok(st1 && st1.picked === 'cluster:channels' && st1.values.length === 3 && st1.on === 0 && st1.posts === 0, `the account's OWN key (channels) is pre-picked, not the row's default (org1); nothing posted yet (${JSON.stringify(st1)})`);
  const rb1 = await p1.evaljs(CHOOSE('cluster:org1'));
  ok(rb1 && rb1.same && rb1.flowInput && rb1.posts.length === 1 && rb1.posts[0].url === '/api/channels/adapters/gmail/reauthorize' && rb1.posts[0].body && rb1.posts[0].body.credentialKey === 'cluster:org1' && !('newAccount' in rb1.posts[0].body), `choosing org1 posts {credentialKey:'cluster:org1'} to ITS /reauthorize (no newAccount) and the SAME dialog moves on to consent (${JSON.stringify(rb1.posts)})`);
  const g3 = (await api('GET', '/api/channels')).json;
  const a3 = ((g3 && g3.adapters) || []).filter((a) => a.kind === 'gmail');
  ok(a3.length === 2 && a3[0].credentialKey === 'cluster:org1' && a3[0].flow && a3[0].flow.running === true && !a3[1].flow, `the server RE-BOUND the token-less first account to org1 and only ITS flow is running; the second is untouched (${JSON.stringify(a3.map((a) => ({ id: a.id, key: a.credentialKey, flow: !!a.flow })))})`);
  ok((await p1.evaljs(CANCEL)) === 'closed', 'Cancel ends it');
  await sleep(600);
  const secsRb = await p1.evaljs(SECS);
  ok(secsRb.length === 2 && secsRb[0].chip === 'Org 1', `the first section's chip follows the re-bind (${JSON.stringify(secsRb.map((x) => x.chip))})`);
  // …and back to channels, so the withdrawn-preset legs of (e) see the fixture they expect
  await p1.evaljs(`window.__wiz.posts.length = 0; 1`);
  ok((await p1.evaljs(MENU(0, 'Connect'))) === 'ok' && (await p1.evaljs(WAIT_DIALOG('.chan-cred-list'))), 'Connect again opens the credential step');
  const st2 = await p1.evaljs(STEP);
  ok(st2 && st2.picked === 'cluster:org1', 'now org1 — the account\'s current key — is pre-picked');
  const rb2 = await p1.evaljs(CHOOSE('cluster:channels'));
  ok(rb2 && rb2.flowInput && rb2.posts.length === 1 && rb2.posts[0].body.credentialKey === 'cluster:channels', 'choosing channels posts it to /reauthorize');
  ok((await p1.evaljs(CANCEL)) === 'closed', 'Cancel ends it');
  const g3b = (await api('GET', '/api/channels')).json;
  ok(((g3b && g3b.adapters) || []).find((a) => a.id === 'gmail').credentialKey === 'cluster:channels', 'the first account is back on channels');
  // the SECOND section: its consent verb targets ITS id (the colon encoded), never the kind's first
  await p1.evaljs(`window.__wiz.posts.length = 0; 1`);
  ok((await p1.evaljs(MENU(1, 'Connect'))) === 'ok' && (await p1.evaljs(WAIT_DIALOG('.chan-cred-list'))), 'the second section\'s Connect opens the credential step too (token-less, two offered)');
  const rb3 = await p1.evaljs(CHOOSE('cluster:org1'));
  ok(rb3 && rb3.flowInput && rb3.posts.length === 1 && rb3.posts[0].url === '/api/channels/adapters/' + encodeURIComponent(idB) + '/reauthorize' && rb3.posts[0].body.credentialKey === 'cluster:org1', `the POST went to /adapters/${idB}/reauthorize — ITS id, the colon encoded (${JSON.stringify(rb3.posts)})`);
  const g3c = (await api('GET', '/api/channels')).json;
  const a3c = ((g3c && g3c.adapters) || []).filter((a) => a.kind === 'gmail');
  ok(a3c.length === 2 && !a3c[0].flow && a3c[1].flow && a3c[1].flow.running === true && a3c[1].credentialKey === 'cluster:org1', `only the SECOND account's flow is running; the first is untouched (${JSON.stringify(a3c.map((a) => ({ id: a.id, flow: !!a.flow })))})`);
  ok((await p1.evaljs(CANCEL)) === 'closed', 'Cancel ends it');

  // (d) the Integrations chooser's caption: the pick is the DEFAULT for new accounts
  ok(await p1.evaljs(OPEN('gmail')), 'the Integrations window is open on the gmail card');
  ok((await p1.evaljs(`${CARD('gmail')}.querySelector('.integ-choice .plugin-cfg-label').textContent`)) === 'Default for new accounts', 'the delegating chooser\'s caption reads "Default for new accounts"');
  ok(await p1.evaljs(`${CARD('gmail')}.querySelector('select.integ-preset').value === 'org1'`), 'and its value is still the saved pick (nothing else there moved)');

  // (e) ONE offered ⇒ the step is skipped silently: reboot with a SINGLE preset
  srv.kill('SIGKILL'); await waitDown();
  srv = bootServer({ VIBESPACE_GDRIVE_CLIENTS: JSON.stringify([JSON.parse(PRESETS)[0]]) });
  ok(await waitServer(), 'rebooted with ONE Gmail preset (org1)');
  ok(await p1.load(), 'page 1 reloaded');
  ok(await p1.evaljs(`(async () => { window.app.openChannels(); for (let i = 0; i < 80; i++) { if ([...document.querySelectorAll('.rail-panel-channels .chan-sec')].filter((s) => (s.dataset.adapter || '').startsWith('gmail')).length === 2) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`), 'the panel lists the two Gmail accounts again');
  await p1.evaljs(PATCH);
  const g4 = (await api('GET', '/api/channels')).json;
  const a4 = ((g4 && g4.adapters) || []).filter((a) => a.kind === 'gmail');
  ok(a4.length === 2 && a4[0].credentials.length === 2 && a4[0].credentials[0].key === 'cluster:org1' && a4[0].credentials[1].key === 'own' && a4[0].credentials[1].available === false, `FIXTURE: Gmail now offers ONE preset + the listed-but-unavailable own (${JSON.stringify(a4[0] && a4[0].credentials)})`);
  ok((await p1.evaljs(MENU(1, 'Add account…'))) === 'ok', '"Add account…" from the second section');
  // r3 (owner: "为啥没有自定义选项 / lark 为啥没有这个选择 oauth client 的菜单"): the step is ALWAYS drawn — the one preset
  // pre-picked, `own` listed as unavailable (its row says the card must be filled first); Continue posts the preset
  ok(await p1.evaljs(WAIT_DIALOG('.chan-cred-list')), 'the wizard opens at the credential step even with one preset (own is listed beside it)');
  const drawn = await p1.evaljs(`(() => { const d = document.querySelector('#chan-flow-dialog'); const radios = [...d.querySelectorAll('.chan-cred-item input[type="radio"]')]; return { radios: radios.map((r) => ({ value: r.value, checked: r.checked, unavailable: r.parentElement.classList.contains('chan-cred-unavailable') })), on: [...d.querySelectorAll('.chan-step')].findIndex((s) => s.classList.contains('chan-step-on')), posts: window.__wiz.posts.length }; })()`);
  ok(drawn && drawn.radios.length === 2 && drawn.radios[0].value === 'cluster:org1' && drawn.radios[0].checked && drawn.radios[1].value === 'own' && !drawn.radios[1].checked && drawn.radios[1].unavailable && drawn.on === 0 && drawn.posts === 0, `one preset + unavailable own ⇒ the step is drawn, the preset pre-picked, nothing posted yet (${JSON.stringify(drawn)})`);
  const skip = await p1.evaljs(`(async () => { const d = document.querySelector('#chan-flow-dialog'); [...d.querySelectorAll('.chan-flow-actions button')].find((b) => b.textContent.trim() === 'Continue').click(); for (let i = 0; i < 60; i++) { if (document.querySelector('#chan-flow-dialog .chan-flow-input')) break; await new Promise((r) => setTimeout(r, 100)); } return { credList: !!document.querySelector('#chan-flow-dialog .chan-cred-list'), on: [...document.querySelectorAll('#chan-flow-dialog .chan-step')].findIndex((s) => s.classList.contains('chan-step-on')), posts: window.__wiz.posts.slice() }; })()`);
  ok(skip && !skip.credList && skip.on === 1 && skip.posts.length === 1 && skip.posts[0].body.credentialKey === 'cluster:org1' && skip.posts[0].body.newAccount === true, `Continue ⇒ the consent step; the preset rides the body (${JSON.stringify(skip)})`);
  ok((await p1.evaljs(CANCEL)) === 'closed', 'Cancel ends the third account\'s flow');
  const g5 = (await api('GET', '/api/channels')).json;
  const a5 = ((g5 && g5.adapters) || []).filter((a) => a.kind === 'gmail');
  ok(a5.length === 3 && a5[2].credentialKey === 'cluster:org1' && a5[0].credentialKey === 'cluster:channels' && a5[0].credential && a5[0].credential.whyCode === 'preset-gone', `a THIRD account under org1; the first still names the WITHDRAWN preset and its facts say preset-gone (${JSON.stringify(a5.map((a) => ({ id: a.id, key: a.credentialKey, why: a.credential && a.credential.whyCode })))})`);
  // the withdrawn credential is the ADAPTER'S OWN answer (§14.3), asked at the
  // start of its first pass — the tick fires 5 s after boot — and broadcast
  // on that pass's failure; the route reflects it first, the panel on the broadcast
  let st0 = null;
  for (let i = 0; i < 100; i++) { const g = (await api('GET', '/api/channels')).json; st0 = (((g && g.adapters) || []).find((a) => a.id === 'gmail') || {}).auth || null; if (st0 && st0.state === 'needs-credentials') break; await sleep(250); }
  ok(st0 && st0.state === 'needs-credentials' && st0.credentialKey === 'cluster:channels', `after its first pass the first account's auth is needs-credentials under ITS key (${JSON.stringify(st0)})`);
  let secs3 = [];
  for (let i = 0; i < 40; i++) { secs3 = await p1.evaljs(SECS); if (secs3[0] && secs3[0].notes.some((n) => /application credential missing/.test(n))) break; await sleep(250); }
  ok(secs3.length === 3 && secs3[0].notes.some((n) => /application credential missing/.test(n) && /channels/.test(n) && /no longer provided/.test(n)) && !secs3[1].notes.some((n) => /application credential missing/.test(n)) && !secs3[2].notes.some((n) => /application credential missing/.test(n)), `the withdrawn preset is said BY NAME on the account it minted, and the two org1 accounts' sections carry no such line (${JSON.stringify(secs3.map((s) => s.notes))})`);
}

p1.close(); p2.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
