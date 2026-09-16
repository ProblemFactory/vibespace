#!/usr/bin/env node
// THE OAUTH LOOPBACK FLOW, DUAL-MODE (docs/design-communication-panel.zh.md
// §12.4; gate row `test-oauth-loopback`).
//
//   · ephemeral mode binds a fresh loopback port and the consent URL carries it
//   · fixed mode binds the registered port + path; a request on another path is
//     not this flow's callback
//   · the `state` check on the REQUEST HANDLER and on PASTE-BACK, both carried
//     verbatim from src/gmail-sync.js and pinned by their exact source lines
//   · a PRE-BOUND fixed port ⇒ a NAMED refusal naming the port + the paste-back
//     fallback, never an opaque EADDRINUSE — and paste-back then completes
//   · the port is released on completion, cancel and timeout alike
//
// No machine-global name: the fixed port under test is a FREE port (the
// registry's literal is the product's; the test never binds it), and the
// callback URL is BUILT from that port so the literal appears nowhere here.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { freePorts } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OL = require(path.join(REPO, 'src/oauth-loopback.js'));
const R = require(path.join(REPO, 'src/integration-registry.js'));

const get = (url) => new Promise((resolve) => {
  http.get(url, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); })
    .on('error', (e) => resolve({ status: 0, body: String(e.message) }));
});
const portFree = (port) => new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', () => resolve(false));
  s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
});
const hold = (port) => new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(port, '127.0.0.1', () => resolve(s)); });

const [P_FIXED, P_BUSY, P_CANCEL, P_TIMEOUT] = await freePorts(4);
const quiet = { warn() {}, log() {}, error() {} };

// ── ① EPHEMERAL: a fresh port, the consent URL carries it, the loopback lands ──
{
  const ol = OL.createOAuthLoopback({ log: quiet });
  const exchanges = [];
  const f = await ol.begin({
    id: 'gmail', mode: 'ephemeral',
    buildConsentUrl: ({ redirectUri, state }) => `https://accounts.example/o/oauth2?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
    exchange: async ({ code, redirectUri }) => { exchanges.push({ code, redirectUri }); return { refresh_token: 'rt-' + code }; },
  });
  ok(f.mode === 'ephemeral' && f.listening === true && f.port > 0 && f.redirectUri === `http://127.0.0.1:${f.port}`, `ephemeral: bound a fresh loopback port and redirect_uri is the bare origin (${f.redirectUri})`);
  ok(f.consentUrl.includes(encodeURIComponent(f.redirectUri)), 'ephemeral: the consent URL carries THAT redirect_uri');
  ok(f.refusal === null && f.pasteBack === true, 'ephemeral: no refusal, paste-back still offered (a remote browser takes it whatever the port did)');
  const state = new URL(f.consentUrl).searchParams.get('state');
  const bad = await get(`${f.redirectUri}/?state=wrong&code=stolen`);
  ok(bad.status === 400 && /state mismatch/.test(bad.body) && exchanges.length === 0, 'ephemeral: a callback with the WRONG state is refused (400 "state mismatch") and nothing is exchanged');
  ok(ol.status(f.flowId).running === true, '…and the flow is still running (a wrong state does not consume it)');
  const good = await get(`${f.redirectUri}/?state=${state}&code=abc123`);
  ok(good.status === 200 && /close this tab/.test(good.body), 'ephemeral: the right state lands a 200 that tells the user to close the tab');
  await sleep(30);
  const s1 = ol.status(f.flowId);
  ok(s1.done === true && s1.ok === true && exchanges.length === 1 && exchanges[0].code === 'abc123' && exchanges[0].redirectUri === f.redirectUri, `ephemeral: the code was exchanged ONCE with the same redirect_uri (${JSON.stringify(exchanges)})`);
  ok(s1.listening === false && (await portFree(f.port)), 'ephemeral: the port is RELEASED on completion');
  const replay = await get(`${f.redirectUri}/?state=${state}&code=abc123`);
  ok(replay.status === 0, 'ephemeral: a replayed callback finds nobody listening (the port was held for ONE flow)');
  const taken = ol.take(f.flowId);
  ok(taken && taken.ok && taken.result.refresh_token === 'rt-abc123' && ol.status(f.flowId) === null, 'take() hands the adapter its token record ONCE and forgets the flow');
}

// ── ② FIXED: the registered port + path; another path is not this callback ──
{
  const ol = OL.createOAuthLoopback({ log: quiet });
  const cb = `http://127.0.0.1:${P_FIXED}/lark/cb`;
  const exchanges = [];
  const f = await ol.begin({
    id: 'lark', mode: 'fixed', callbackUrl: cb, label: 'Lark',
    buildConsentUrl: ({ redirectUri, state }) => `https://accounts.example/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
    exchange: async ({ code }) => { exchanges.push(code); return { access_token: 'u-' + code }; },
  });
  ok(f.mode === 'fixed' && f.listening === true && f.port === P_FIXED && f.redirectUri === cb, `fixed: bound the REGISTERED port and redirect_uri is the registered URL byte for byte (${f.redirectUri})`);
  const state = new URL(f.consentUrl).searchParams.get('state');
  const wrongPath = await get(`http://127.0.0.1:${P_FIXED}/other?state=${state}&code=x`);
  ok(wrongPath.status === 404 && exchanges.length === 0, 'fixed: a request on ANOTHER path is not this flow\'s callback (404, nothing exchanged)');
  const wrongState = await get(`http://127.0.0.1:${P_FIXED}/lark/cb?state=nope&code=x`);
  ok(wrongState.status === 400 && /state mismatch/.test(wrongState.body) && exchanges.length === 0, 'fixed: the WRONG state is refused on the request handler too');
  const good = await get(`http://127.0.0.1:${P_FIXED}/lark/cb?state=${state}&code=lark-code-1`);
  await sleep(30);
  ok(good.status === 200 && exchanges.length === 1 && exchanges[0] === 'lark-code-1' && ol.status(f.flowId).ok === true, 'fixed: the right state on the registered path exchanges the code');
  ok((await portFree(P_FIXED)), 'fixed: the port is RELEASED on completion');
  // the default fixed target IS the registry's literal (imported, never spelled here)
  const t = OL.fixedTarget();
  ok(t.url === R.LARK_CALLBACK_URL && t.pathname === '/lark/cb' && t.port === Number(new URL(R.LARK_CALLBACK_URL).port), 'fixed: with no callbackUrl the target is the registry\'s ONE definition (LARK_CALLBACK_URL)');
  let refusedTarget = null; try { OL.fixedTarget('https://my-instance.example/lark/cb'); } catch (e) { refusedTarget = e.message; }
  ok(/loopback/.test(refusedTarget || ''), 'fixed: a non-loopback callback is refused by name (decision 4/21: the callback is a VibeSpace-owned loopback, never an instance address)');
}

// ── ③ PRE-BOUND PORT ⇒ NAMED REFUSAL + PASTE-BACK, never an opaque EADDRINUSE ──
{
  const holder = await hold(P_BUSY);
  const warned = [];
  const ol = OL.createOAuthLoopback({ log: { warn: (...a) => warned.push(a.join(' ')), log() {}, error() {} } });
  const cb = `http://127.0.0.1:${P_BUSY}/lark/cb`;
  const exchanges = [];
  let threw = null;
  let f = null;
  try {
    f = await ol.begin({
      id: 'lark', mode: 'fixed', callbackUrl: cb, label: 'Lark',
      buildConsentUrl: ({ redirectUri, state }) => `https://accounts.example/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
      exchange: async ({ code, redirectUri }) => { exchanges.push({ code, redirectUri }); return { access_token: 'u-' + code }; },
    });
  } catch (e) { threw = e; }
  ok(!threw && f, 'a pre-bound fixed port does NOT throw out of begin()', threw && threw.message);
  ok(f && f.refusal && f.refusal.code === OL.PORT_BUSY_CODE && f.refusal.port === P_BUSY && new RegExp(`Lark consent flow on port ${P_BUSY}`).test(f.refusal.message) && /paste-back/.test(f.refusal.message),
    `…it is a NAMED refusal that names the port and the paste-back fallback (${f && f.refusal && f.refusal.message})`);
  ok(f && f.listening === false && f.pasteBack === true && f.running === true, '…the flow is RUNNING without the port, on the paste-back path');
  ok(f && f.redirectUri === cb && f.consentUrl.includes(encodeURIComponent(cb)), '…and the consent URL still carries the REGISTERED redirect_uri (the vendor only redirects there)');
  ok(warned.some((w) => /port-busy|consent flow on port/.test(w)), 'the refusal is logged once with its reason');
  const state = new URL(f.consentUrl).searchParams.get('state');
  let pb = null; try { await ol.forwardCallback(f.flowId, `${cb}?state=forged&code=stolen`); } catch (e) { pb = e.message; }
  ok(pb === 'state mismatch — restart the flow' && exchanges.length === 0, 'PASTE-BACK: a pasted URL with the WRONG state is refused with gmail-sync\'s exact words, and nothing is exchanged');
  let nc = null; try { await ol.forwardCallback(f.flowId, `${cb}?state=${state}`); } catch (e) { nc = e.message; }
  ok(nc === 'no code in that URL', 'PASTE-BACK: a URL with the right state but no code is refused by name');
  const r = await ol.forwardCallback(f.flowId, `${cb}?state=${state}&code=pasted-code`);
  ok(r.ok === true && r.result.access_token === 'u-pasted-code' && exchanges.length === 1 && exchanges[0].redirectUri === cb, 'PASTE-BACK: the right state + code is exchanged with the registered redirect_uri — the flow completes with NO local port at all');
  let again = null; try { await ol.forwardCallback(f.flowId, `${cb}?state=${state}&code=second`); } catch (e) { again = e.message; }
  ok(again === 'no authorization in progress' && exchanges.length === 1, 'a finished flow accepts no second paste (one exchange per flow)');
  holder.close();
}

// ── ④ RELEASE ON CANCEL AND ON TIMEOUT ──
{
  const ol = OL.createOAuthLoopback({ log: quiet });
  const mk = (port, timeoutMs) => ol.begin({
    id: 'lark', mode: 'fixed', callbackUrl: `http://127.0.0.1:${port}/lark/cb`, timeoutMs,
    buildConsentUrl: ({ redirectUri, state }) => `https://x.example/a?r=${encodeURIComponent(redirectUri)}&state=${state}`,
    exchange: async () => ({}),
  });
  const c = await mk(P_CANCEL, 60000);
  ok(c.listening === true && !(await portFree(P_CANCEL)), 'cancel leg: the port is held while the flow runs');
  ok(ol.cancel(c.flowId) === true && ol.status(c.flowId).cancelled === 'cancelled' && ol.status(c.flowId).running === false, 'cancel() is terminal and says so');
  ok(await portFree(P_CANCEL), 'cancel releases the port');
  ok(ol.cancel(c.flowId) === false, 'cancelling twice is a no-op');

  const tmo = await mk(P_TIMEOUT, 120);
  ok(!(await portFree(P_TIMEOUT)), 'timeout leg: the port is held while the flow runs');
  await sleep(250);
  ok(ol.status(tmo.flowId).cancelled === 'timeout' && (await portFree(P_TIMEOUT)), 'the flow\'s own timeout releases the port and names the reason');

  // one flow per id: a second begin() for the same id supersedes the first
  const a = await mk(P_CANCEL, 60000);
  const b = await mk(P_CANCEL, 60000);
  ok(ol.status(a.flowId).cancelled === 'superseded' && ol.status(b.flowId).running === true && ol.runningFor('lark').flowId === b.flowId, 'a second begin() for the same id SUPERSEDES the first (one running flow per id, gmail-sync\'s rule) — and the port moved with it');
  ol.stopAll();
  ok(ol.status(b.flowId).cancelled === 'shutdown' && (await portFree(P_CANCEL)), 'stopAll() releases everything (the shutdown path)');

  // bad inputs are typed refusals, not stack traces
  let e1 = null; try { await ol.begin({ id: 'x', mode: 'osmosis', buildConsentUrl: () => '', exchange: async () => ({}) }); } catch (e) { e1 = e; }
  ok(e1 && e1.code === 'bad-request' && /mode must be one of/.test(e1.message), 'an unknown mode is a typed refusal');
}

// ── ⑤ THE TWO `state` CHECKS ARE THE GMAIL-SYNC LINES, VERBATIM ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/oauth-loopback.js'), 'utf-8');
  const gs = fs.readFileSync(path.join(REPO, 'src/gmail-sync.js'), 'utf-8');
  const HANDLER = "if (u.searchParams.get('state') !== state) { res.writeHead(400).end('state mismatch'); return; }";
  const PASTE = "if (u.searchParams.get('state') !== st.state) throw new Error('state mismatch — restart the flow');";
  ok(src.includes(HANDLER) && gs.includes(HANDLER), 'the request-handler `state` check is carried VERBATIM from src/gmail-sync.js');
  ok(src.includes(PASTE) && gs.includes(PASTE), 'the paste-back `state` check is carried VERBATIM from src/gmail-sync.js');
  const LIT = R.LARK_CALLBACK_URL;
  ok(!src.includes(LIT) && /LARK_CALLBACK_URL/.test(src), 'the Lark callback literal is IMPORTED from the registry, never spelled here (the registry census asserts the same from its side)');
  ok(!fs.readFileSync(new URL(import.meta.url).pathname, 'utf-8').includes(LIT), 'this suite never spells the literal either — every fixed port under test is a FREE one built at runtime');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
