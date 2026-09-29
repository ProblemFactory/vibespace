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
import v8 from 'node:v8';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { freePorts } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
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

// ── ⑥ A CANCEL DURING THE EXCHANGE (channels lane R5 verify r7 + r8): the exchange is handed `cancelled()` + `flowId` and consults it before writing — THROWING to refuse ⇒ {ok:false, cancelled}; an exchange that RESOLVED has landed its consent, so the report is ok:true with the late cancel CARRIED (r8: the loopback cannot undo a write; r7 said {ok:false, "nothing was connected"} over a token on disk) ──
{
  const ol = OL.createOAuthLoopback({ now: () => Date.now(), log: quiet });
  let release; const hold = new Promise((r) => { release = r; }); const seen = []; const dones = [];
  const st = await ol.begin({ id: 'g', mode: 'ephemeral', buildConsentUrl: ({ redirectUri, state }) => `https://x/?r=${encodeURIComponent(redirectUri)}&state=${state}`, onDone: (r) => { dones.push(r); }, exchange: async (args) => { seen.push({ before: args.cancelled(), flowId: args.flowId }); await hold; seen.push({ after: args.cancelled() }); return { access_token: 'u' }; } });
  const state = new URL(st.consentUrl).searchParams.get('state');
  const landing = get(`${st.redirectUri}/?state=${state}&code=c1`); await sleep(30);
  ok(seen.length === 1 && seen[0].before === null && seen[0].flowId === st.flowId, 'the exchange is handed the flow id and a cancelled() that reads null while the flow is live');
  ok(ol.cancel(st.flowId, 'cancelled') === true, 'the flow is cancelled while its exchange is in flight');
  release(); await landing; await sleep(30);
  const s = ol.status(st.flowId);
  ok(seen.length === 2 && seen[1].after === 'cancelled', 'cancelled() inside the exchange reads the cancel that landed meanwhile (the exchange checks it before storing anything)');
  ok(s && s.done === true && s.ok === true && s.error === null && s.cancelled === 'cancelled', `r8: an exchange that RESOLVED after the cancel is a landed consent — the report is ok:true with the cancel carried (ok ${s && s.ok}, cancelled ${s && s.cancelled}, error ${s && s.error})`);
  ok(dones.length === 1 && dones[0].ok === true && dones[0].cancelled === 'cancelled' && dones[0].result && dones[0].result.access_token === 'u', 'onDone carries {ok:true, cancelled} + the result — the record door reads ok as landed, the pending path refuses the carried cancel itself');
  // the door's shape: an exchange that consults cancelled() and THROWS ⇒ {ok:false, cancelled} with the exchange's own sentence
  { let rel; const h2 = new Promise((r) => { rel = r; });
    const st3 = await ol.begin({ id: 'g3', mode: 'ephemeral', buildConsentUrl: ({ state: s3 }) => `https://x/?state=${s3}`, onDone: (r) => { dones.push(r); }, exchange: async (args) => { await h2; const c = args.cancelled(); if (c) throw new Error(`the Gmail sign-in was ${c} while it was being completed — nothing was connected`); return { access_token: 'v' }; } });
    const l3 = get(`${st3.redirectUri}/?state=${new URL(st3.consentUrl).searchParams.get('state')}&code=c3`); await sleep(30);
    ok(ol.cancel(st3.flowId, 'cancelled') === true, 'the door-shaped flow is cancelled while its exchange is in flight'); rel(); await l3; await sleep(30);
    const s3 = ol.status(st3.flowId); const d3 = dones[dones.length - 1];
    ok(s3 && s3.done === true && s3.ok === false && s3.cancelled === 'cancelled' && /was cancelled while it was being completed/.test(s3.error || ''), `an exchange that consulted cancelled() and refused ends {ok:false, cancelled} with ITS sentence (${s3 && s3.error})`);
    ok(d3 && d3.ok === false && d3.cancelled === 'cancelled' && d3.result === null, 'onDone carries {ok:false, cancelled} for the refused exchange'); }
  const st2 = await ol.begin({ id: 'g2', mode: 'ephemeral', buildConsentUrl: ({ state: s2 }) => `https://x/?state=${s2}`, onDone: (r) => { dones.push(r); }, exchange: async () => ({ access_token: 'u' }) });
  await get(`${st2.redirectUri}/?state=${new URL(st2.consentUrl).searchParams.get('state')}&code=c2`); await sleep(30);
  ok(dones.length === 3 && dones[2].ok === true && dones[2].cancelled === null, 'a flow that was not cancelled reports cancelled: null');
  ol.stopAll();
}

// ── ⑦ A FLOW'S END IS THE END OF WHAT IT HELD (client-from-mount verify r3): the exchange closure an adapter hands in
// captures the vendor client (gmail.js: the PLAINTEXT clientSecret — a storage mount's borrowed one) and this map kept
// every flow for the process lifetime (take() had no caller; cancel() left the record) — 10 000 begins pinned 10 000
// secrets. Pinned: the closure of a cancelled / timed-out / landed flow is COLLECTABLE at its end (a FinalizationRegistry
// over an object the closure holds, gc forced), the record still answers status() until FLOW_RETIRE_MS then retires,
// a cancelled flow never exchanges, and MAX_RUNNING_FLOWS bounds the live set (the oldest superseded by name). CONTROL:
// a copy without the two release lines keeps every closure. ──
console.log('\n⑦ a flow\'s end is the end of what it held (verify r3)');
{
  const gcNow = (() => { if (typeof global.gc === 'function') return global.gc; try { v8.setFlagsFromString('--expose-gc'); return vm.runInNewContext('gc'); } catch { return null; } })();
  let T = Date.now();
  const mkFlows = (mod) => mod.createOAuthLoopback({ log: quiet, now: () => T });
  const drive = async (ol) => {
    const collected = new Set();
    const reg = new FinalizationRegistry((tag) => collected.add(tag));
    let exchanges = 0;
    const begin = async (id, tag, timeoutMs = 600000) => { const captured = { secret: `plain-${tag}` }; reg.register(captured, tag); return ol.begin({ id, mode: 'ephemeral', timeoutMs, buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => { exchanges++; return { ok: true, held: captured.secret }; } }); };
    const c1 = await begin('c1', 'cancelled-1'), c2 = await begin('c2', 'cancelled-2');
    const t1 = await begin('t1', 'timeout', 30); await sleep(80);
    const d1 = await begin('d1', 'done'); await get(`${d1.redirectUri}/?state=${new URL(d1.consentUrl).searchParams.get('state')}&code=c`); for (let i = 0; i < 40 && !ol.status(d1.flowId).done; i++) await sleep(5);
    const live = await begin('live', 'running');
    ol.cancel(c1.flowId); ol.cancel(c2.flowId);
    for (let i = 0; i < 6; i++) { gcNow(); await sleep(15); }
    return { collected, ids: { c1, c2, t1, d1, live }, exchanges: () => exchanges };
  };
  if (!gcNow) ok(false, 'SKIP: no gc handle (v8 --expose-gc refused at runtime) — the closure-release leg cannot be judged');
  else {
    const ol = mkFlows(OL);
    const { collected, ids, exchanges } = await drive(ol);
    ok(['cancelled-1', 'cancelled-2', 'timeout', 'done'].every((t) => collected.has(t)) && !collected.has('running'), `the exchange closure of a CANCELLED / TIMED-OUT / LANDED flow is released at its end (collected: ${[...collected].sort().join(', ')}); the running flow keeps its own`);
    ok(['c1', 'c2', 't1', 'd1'].every((k) => ol.status(ids[k].flowId) !== null) && ol.status(ids.c1.flowId).cancelled === 'cancelled' && ol.status(ids.t1.flowId).cancelled === 'timeout' && ol.status(ids.d1.flowId).done === true, 'an ended flow still answers status() (the dialog polls it) …');
    const pb = await (async () => { try { await ol.forwardCallback(ids.c1.flowId, `http://127.0.0.1/?state=${new URL(ids.c1.consentUrl).searchParams.get('state')}&code=late`); return null; } catch (e) { return e; } })();
    ok(pb && pb.code === 'no-flow' && exchanges() === 1, `… a paste-back onto a cancelled flow is refused by name and nothing is exchanged (${exchanges()} exchange — the landed flow's)`);
    T += OL.FLOW_RETIRE_MS + 1000;
    ok(['c1', 'c2', 't1', 'd1'].every((k) => ol.status(ids[k].flowId) === null) && ol.status(ids.live.flowId) !== null && ol.status(ids.live.flowId).running === true, `… and is RETIRED from the map FLOW_RETIRE_MS (${OL.FLOW_RETIRE_MS / 60000} min) after its end; a running flow is not`);
    ol.stopAll();
    // the bound
    const olc = mkFlows(OL); const many = [];
    for (let i = 0; i <= OL.MAX_RUNNING_FLOWS; i++) many.push(await olc.begin({ id: `m${i}`, mode: 'ephemeral', buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}) }));
    ok(olc.status(many[0].flowId).cancelled === OL.CAUSE_OVER_LIMIT && olc.runningFor('m0') === null && many.slice(1).every((f) => olc.status(f.flowId).running === true), `begin() #${OL.MAX_RUNNING_FLOWS + 1} ends the OLDEST running flow by name (${OL.CAUSE_OVER_LIMIT} — verify r4: its own cause, never 'superseded') — ${OL.MAX_RUNNING_FLOWS} run at most`);
    olc.stopAll();
    // CONTROL: a copy without the release (the pre-r3 shape) keeps every closure
    const src = fs.readFileSync(path.join(REPO, 'src/oauth-loopback.js'), 'utf-8');
    const A = '    if (!st.exchanging) forget(st);\n', B = '      const cb = forget(st);   // verify r3: the exchange has returned — its closure (the client secret) is dropped here; r4: `onDone` with it\n';
    ok(src.split(A).length === 2 && src.split(B).length === 2, 'CONTROL setup: the two release lines are present once');
    const M = mutantCopies('oauth-loopback', REPO);
    const olm = mkFlows(require(M.write('src/oauth-loopback.js', src.replace(A, '').replace(B, '      const cb = st.onDone;\n'), 'no-forget')));
    const r = await drive(olm);
    ok(r.collected.size === 0, `CONTROL: a copy without the release keeps every closure after gc (${r.collected.size} collected) — the release check above would be red`);
    olm.stopAll();
    for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(c.pass, 'tree: ' + c.name, c.pass ? undefined : c.detail);
  }
}


// ── ⑧ THE END DROPS EVERY CLOSURE, THE MACHINE'S OWN ENDS ARE SAID, begin()'s EXITS (client-from-mount verify r4) ──
// r3 dropped `exchange` and KEPT `onDone`. Both adapters create the two in ONE scope — `const {clientId, clientSecret} =
// cred.values; … exchange: …, onDone: …` — and closures of one scope share one V8 context, so a kept onDone kept the
// plaintext secret exchange captured: a heap snapshot of the REAL Gmail adapter after a cancel still held it (30 min).
// Pinned here: (a) closures made the adapters' way are collectable after cancel / timeout / over-limit (a copy that keeps
// onDone at cancel is the control); (b) the REAL Gmail and Lark adapters: the secret they resolved is GONE from a heap
// snapshot after a cancel — searched by SHAPE (the secret is minted at runtime, never a string this file holds) — and
// present while running; (c) the timeout and the cap REPORT ONCE {ok:false, cancelled, error} and a caller's cancel /
// same-id supersede / stopAll report nothing; mid-exchange exactly one report (the exchange's); (d) a flow ended while
// begin() awaits its listener keeps no listener (same-tick double begin, ephemeral + fixed: the fixed port is free for
// the next begin), a `buildConsentUrl` that throws leaves no flow / listener / closure; a copy without the post-bind
// check is the control.
console.log('\n⑧ the end drops every closure; the machine\'s own ends are said; begin()\'s exits (verify r4)');
{
  const gcNow = (() => { if (typeof global.gc === 'function') return global.gc; try { v8.setFlagsFromString('--expose-gc'); return vm.runInNewContext('gc'); } catch { return null; } })();
  const listeners = () => process._getActiveHandles().filter((h) => h instanceof net.Server && h.listening).length;
  const src = fs.readFileSync(path.join(REPO, 'src/oauth-loopback.js'), 'utf-8');
  const M = mutantCopies('oauth-loopback-r4', REPO);
  // (a) closures the adapters' way: exchange AND onDone born in one scope that holds the captured object
  const driveScoped = async (mod) => {
    const ol = mod.createOAuthLoopback({ log: quiet });
    const collected = new Set(); const reg = new FinalizationRegistry((tag) => collected.add(tag));
    const reports = [];
    const begin = async (id, tag, timeoutMs = 600000) => {
      const captured = { secret: `plain-${tag}` }; reg.register(captured, tag);
      return ol.begin({ id, mode: 'ephemeral', timeoutMs, buildConsentUrl: ({ state }) => `https://x/?state=${state}`,
        exchange: async () => ({ ok: true, held: captured.secret }),
        onDone: (r) => { reports.push({ tag, r }); } });   // the adapters' shape: onDone in the SAME scope as exchange
    };
    const c = await begin('c', 'cancelled'); const t = await begin('t', 'timeout', 30); await sleep(80);
    for (let i = 0; i < mod.MAX_RUNNING_FLOWS; i++) await ol.begin({ id: `f${i}`, mode: 'ephemeral', buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}) });
    const o = await begin('o', 'over-limit');   // this one is the newest: the oldest filler goes — so make it the oldest instead:
    ol.cancel(c.flowId);
    for (let i = 0; i < 6; i++) { if (gcNow) gcNow(); await sleep(15); }
    return { ol, collected, reports, ids: { c, t, o } };
  };
  const K = '    if (!st.exchanging) forget(st);\n';
  ok(src.split(K).length === 2, '(a) CONTROL setup: the cancel-side release line is present once');
  const keep = require(M.write('src/oauth-loopback.js', src.replace(K, '    if (!st.exchanging) { const kept = st.onDone; forget(st); st.onDone = kept; }\n'), 'keeps-ondone'));
  if (!gcNow) ok(false, 'SKIP: no gc handle — the closure legs cannot be judged');
  else {
    const r = await driveScoped(OL);
    ok(r.collected.has('cancelled') && r.collected.has('timeout') && !r.collected.has('over-limit'), `(a) exchange + onDone born in one scope: the object they share is collected after cancel and timeout (${[...r.collected].sort().join(', ')}); the running flow keeps its own`);
    r.ol.stopAll();
    // CONTROL: the r3 shape — cancel keeps onDone
    const rk = await driveScoped(keep);
    ok(!rk.collected.has('cancelled'), `(a) CONTROL: a copy whose cancel keeps onDone keeps the secret exchange captured (collected: ${[...rk.collected].sort().join(', ') || 'none'}) — the check above would be red`);
    rk.ol.stopAll();
  }
  // (b) THE REAL ADAPTERS: the resolved secret is gone from the heap after a cancel — by shape, minted at runtime
  {
    const SHAPE = /GOCSPX-R4HEAP-[0-9a-f]{24}/g;
    const snapHits = () => { const f = path.join(M.dir, `heap-${Date.now()}.heapsnapshot`); v8.writeHeapSnapshot(f); const n = (fs.readFileSync(f, 'latin1').match(SHAPE) || []).length; fs.rmSync(f); return n; };
    const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
    const lark = require(path.join(REPO, 'src/channels/lark.js'));
    const [PL] = await freePorts(1);
    const memTokens = () => ({ read: () => ({ token: null, why: 'never-authenticated' }), write: async () => {}, clear: async () => {} });
    // a FLAT string (a `+` makes a cons string, which a snapshot names "(concatenated string)", its halves apart)
    const mint = () => Buffer.from('GOCSPX-R4HEAP-' + crypto.randomBytes(12).toString('hex'), 'utf8').toString('utf8');
    const cases = [
      { kind: 'gmail', mod: gmail, mode: 'ephemeral', resolve: () => ({ id: 'gmail', source: 'custom', values: { clientId: '123412341234-heap.apps.googleusercontent.com', clientSecret: mint() }, missing: [], why: null, credentialKey: 'custom' }) },
      { kind: 'lark', mod: lark, mode: 'fixed', resolve: () => ({ id: 'lark', source: 'custom', values: { appId: 'cli_heap', appSecret: mint() }, missing: [], why: null, credentialKey: 'custom' }) },
    ];
    const before = snapHits();
    for (const c of [...cases, { ...cases[0], control: true }]) {
      const ol = (c.control ? keep : OL).createOAuthLoopback({ log: quiet, fixedCallbackUrl: `http://127.0.0.1:${PL}/lark/cb` });
      const a = c.mod.create({ id: c.kind, kind: c.kind, options: {}, credentialKey: 'custom' }, { now: () => Date.now(), fetch: async () => { throw new Error('no vendor call'); }, tokens: memTokens(), oauth: ol, resolveIntegration: () => c.resolve(), onAuthDone: () => {}, log: quiet });
      const f = await a.auth.begin();
      const running = snapHits();
      ol.cancel(f.flowId, 'cancelled');
      const after = snapHits();
      if (c.control) ok(before === 0 && running >= 1 && after >= 1, `(b) CONTROL: the REAL ${c.kind} adapter over the copy that keeps onDone — the secret is STILL in the heap after a cancel (${after}); the checks above would be red`);
      else ok(before === 0 && running >= 1 && after === 0, `(b) the REAL ${c.kind} adapter (${c.mode}): its resolved client secret is in the heap while the sign-in runs (${running}) and GONE after a cancel (${after}; ${before} before any begin)`);
      ol.stopAll();
    }
  }
  // (c) the machine's own ends REPORT ONCE; a caller's ends report nothing; mid-exchange exactly the exchange's report
  {
    const ol = OL.createOAuthLoopback({ log: quiet });
    const mk = (id, extra = {}) => { const reports = []; return ol.begin({ id, mode: 'ephemeral', buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({ ok: true }), onDone: (r) => reports.push(r), ...extra }).then((f) => ({ f, reports })); };
    const t = await mk('t', { timeoutMs: 30 }); await sleep(80);
    ok(t.reports.length === 1 && t.reports[0].ok === false && t.reports[0].cancelled === OL.CAUSE_TIMEOUT && /not finished in time/.test(t.reports[0].error) && ol.status(t.f.flowId).error === t.reports[0].error, `(c) the TIMEOUT reports once {ok:false, cancelled:${OL.CAUSE_TIMEOUT}, error} and status() carries the same sentence ("${t.reports[0] && t.reports[0].error}")`);
    const c = await mk('c'); ol.cancel(c.f.flowId, 'cancelled');
    const s1 = await mk('s'); const s2 = await mk('s');
    const sh = await mk('sh'); ol.stopAll();
    await sleep(20);
    ok(c.reports.length === 0 && s1.reports.length === 0 && s2.reports.length === 0 && sh.reports.length === 0 && ol.status(s1.f.flowId).cancelled === 'superseded', '(c) a caller\'s cancel, a same-id supersede and stopAll report nothing (the caller\'s own acts)');
    const ol2 = OL.createOAuthLoopback({ log: quiet });
    const o = await ol2.begin({ id: 'oldest', mode: 'ephemeral', buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}), onDone: (r) => oRep.push(r) }); const oRep = [];
    for (let i = 0; i < OL.MAX_RUNNING_FLOWS; i++) await ol2.begin({ id: `f${i}`, mode: 'ephemeral', buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}) });
    await sleep(10);
    ok(oRep.length === 1 && oRep[0].cancelled === OL.CAUSE_OVER_LIMIT && /open sign-ins at 32/.test(oRep[0].error) && ol2.status(o.flowId).cancelled === OL.CAUSE_OVER_LIMIT, `(c) the CAP reports the evicted flow once by its own cause ("${oRep[0] && oRep[0].error}")`);
    // mid-exchange: the exchange's own return is the ONE report (the timeout's not a second)
    let rel; const holdX = new Promise((r) => { rel = r; }); const mRep = [];
    const m = await ol2.begin({ id: 'mid', mode: 'ephemeral', timeoutMs: 60, buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async ({ cancelled }) => { await holdX; const c2 = cancelled(); if (c2) throw new Error(`refused: ${c2}`); return { ok: true }; }, onDone: (r) => mRep.push(r) });
    const landing = get(`${m.redirectUri}/?state=${new URL(m.consentUrl).searchParams.get('state')}&code=c`);
    await sleep(120); rel(); await landing; await sleep(20);
    ok(mRep.length === 1 && mRep[0].ok === false && mRep[0].cancelled === OL.CAUSE_TIMEOUT && /refused: timeout/.test(mRep[0].error), `(c) the timeout landing MID-EXCHANGE: exactly one report, the exchange's own refusal (${mRep.length}: ${mRep[0] && mRep[0].error})`);
    ol2.stopAll();
  }
  // (d) begin()'s own exits
  {
    const [PF] = await freePorts(1);
    const mkOl = (mod) => mod.createOAuthLoopback({ log: quiet, fixedCallbackUrl: `http://127.0.0.1:${PF}/lark/cb` });
    const twice = async (ol, mode) => { const base = listeners(); const [a, b] = await Promise.all([ol.begin({ id: 'same', mode, buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}) }), ol.begin({ id: 'same', mode, buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}) })]); await sleep(10); const held = listeners() - base; ol.stopAll(); await sleep(20); return { a, b, held, left: listeners() - base }; };
    for (const mode of ['ephemeral', 'fixed']) {
      const ol = mkOl(OL);
      const r = await twice(ol, mode);
      const next = await ol.begin({ id: 'next', mode, buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}) });
      // (in fixed mode the older bind may WIN the port and close it at once, leaving the newer flow on paste-back: 0 held — the port is free for the next begin either way)
      ok(ol.status(r.a.flowId).cancelled === 'superseded' && ol.status(r.a.flowId).listening === false && r.held <= 1 && r.left === 0 && next.listening === true && !next.refusal, `(d) ${mode}: two same-tick begins of one id — the superseded flow never keeps the listener it was binding (${r.held} held, ${r.left} left after stopAll); the next begin binds${mode === 'fixed' ? ' the fixed port' : ''}`);
      ol.stopAll();
      const base = listeners();
      let threw = null; try { await ol.begin({ id: 'boom', mode, buildConsentUrl: () => { throw new Error('consent url refused'); }, exchange: async () => ({}) }); } catch (e) { threw = e; }
      ok(threw && /consent url refused/.test(threw.message) && listeners() - base === 0 && ol.runningFor('boom') === null, `(d) ${mode}: a buildConsentUrl that throws leaves no flow and no listener (${listeners() - base})`);
    }
    // CONTROL: a copy whose post-bind step ignores the flow's end (the r3 shape) keeps the listener — in fixed mode the port
    const B = "    const bound = () => { if (st.cancelled || st.done) { try { srv.close(); } catch {} return; } st.server = srv; st.listening = true; };\n";
    ok(src.split(B).length === 2, '(d) CONTROL setup: the post-bind check is present once');
    const olm = mkOl(require(M.write('src/oauth-loopback.js', src.replace(B, '    const bound = () => { st.server = srv; st.listening = true; };\n'), 'binds-after-end')));
    const rm = await twice(olm, 'fixed');
    const nextm = await olm.begin({ id: 'next', mode: 'fixed', buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}) });
    ok(rm.left === 1 && nextm.refusal && nextm.refusal.code === 'port-busy', `(d) CONTROL: a copy that binds after the end keeps ${rm.left} listener past stopAll and the next fixed begin is ${nextm.refusal && nextm.refusal.code} — the checks above would be red`);
    olm.stopAll();
    // the leaked control listener is closed by hand (it is nobody's flow now)
    for (const h of process._getActiveHandles()) if (h instanceof net.Server && h.listening && h.address() && h.address().port === PF) { try { h.close(); } catch {} }
  }
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, 'tree: ' + c.name, c.pass ? undefined : c.detail);
}

// ── ⑨ OPTIONAL SCOPES — THE ONE NARROWING RETRY + THE VENDOR'S ERROR REDIRECT (owner ruling 2026-09-28) ──
// Lark refuses a WHOLE consent that names a scope its app has not enabled (error 20027) ON ITS OWN PAGE — never
// redirected (the vendor's docs name only `?error=access_denied&state=`) — so the machine never hears it. The person
// presses "Sign in without …" (narrow): the SAME flow (state, listener) gets a consent URL without the optional
// scopes, ONCE; the exchange is told what was dropped. A FAKE AUTHORIZE ENDPOINT plays the vendor's page: a scope
// the fake app has not enabled ⇒ a 200 page reading 20027, no redirect; otherwise ⇒ 302 to redirect_uri with code.
console.log('\n⑨ optional scopes: the one narrowing retry against a fake authorize page; the vendor\'s error redirect ends the flow');
{
  const ENABLED = new Set(['im:message', 'im:chat:readonly']);   // the fake APP's enabled scopes
  const OPT = 'im:message.reactions:read';
  const authz = [];
  const fakeAuth = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const scopes = String(u.searchParams.get('scope') || '').split(' ').filter(Boolean);
    authz.push(scopes.slice());
    const missing = scopes.filter((x) => !ENABLED.has(x));
    if (missing.length) { res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<p>20027 the scope parameter contains permissions the current application has not enabled: ${missing.join(' ')}</p>`); return; }
    const to = new URL(u.searchParams.get('redirect_uri'));
    to.searchParams.set('code', 'code-' + authz.length); to.searchParams.set('state', u.searchParams.get('state'));
    res.writeHead(302, { Location: to.toString() }).end();
  });
  await new Promise((r) => fakeAuth.listen(0, '127.0.0.1', r));
  const AUTH = `http://127.0.0.1:${fakeAuth.address().port}/open-apis/authen/v1/authorize`;
  /** THE BROWSER: open the consent URL on the fake vendor page; a 302 is followed to the loopback (one hop). */
  const browse = async (consentUrl) => {
    const q = new URL(consentUrl).search;
    const page = await new Promise((resolve) => { http.get(AUTH + q, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location || null, body: b })); }).on('error', (e) => resolve({ status: 0, body: e.message })); });
    if (page.status === 302 && page.location) { const back = await get(page.location); await sleep(40); return { ...page, back }; }
    return page;
  };
  const [P9, P9b, P9c] = await freePorts(3);
  const run9 = async (OLm, port) => {
    const ol = OLm.createOAuthLoopback({ log: quiet });
    const ex = []; const done = [];
    const f = await ol.begin({
      id: 'lark', mode: 'fixed', callbackUrl: `http://127.0.0.1:${port}/lark/cb`, label: 'Lark', optionalScopes: [OPT, OPT, 7],
      buildConsentUrl: ({ redirectUri, state, without = [] }) => `https://accounts.example/open-apis/authen/v1/authorize?` + new URLSearchParams({ redirect_uri: redirectUri, state, scope: ['im:message', 'im:chat:readonly', OPT].filter((x) => !without.includes(x)).join(' ') }),
      exchange: async ({ code, narrowed }) => { ex.push({ code, narrowed }); return { ok: true }; },
      onDone: (r) => { done.push(r); },
    });
    return { ol, f, ex, done };
  };
  {
    const { ol, f, ex, done } = await run9(OL, P9);
    ok(JSON.stringify(f.optional) === JSON.stringify([OPT]) && f.narrowed === null && new URL(f.consentUrl).searchParams.get('scope').split(' ').includes(OPT), 'the flow names its optional scopes (deduped, strings only) and the FIRST consent asks for them', JSON.stringify([f.optional, f.narrowed]));
    const p1 = await browse(f.consentUrl);
    ok(p1.status === 200 && /20027/.test(p1.body) && !p1.location && ex.length === 0 && ol.status(f.flowId).running === true, 'the fake vendor refuses the whole consent ON ITS PAGE (200, 20027, no redirect) — nothing reaches the loopback, the flow is still running');
    const state0 = new URL(f.consentUrl).searchParams.get('state');
    const n1 = ol.narrow(f.flowId);
    const u1 = new URL(n1.consentUrl);
    ok(JSON.stringify(n1.narrowed) === JSON.stringify([OPT]) && !u1.searchParams.get('scope').split(' ').includes(OPT) && u1.searchParams.get('scope') === 'im:message im:chat:readonly' && u1.searchParams.get('state') === state0 && n1.listening === true && n1.flowId === f.flowId, 'narrow(): the SAME flow (same state, still listening) gets a consent URL without the optional scope — the base scopes kept', n1.consentUrl);
    let again = null; try { ol.narrow(f.flowId); } catch (e) { again = e; }
    ok(again && again.code === 'already-narrowed' && /already dropped im:message\.reactions:read once/.test(again.message), `narrow() is ONCE — the second is refused by name (${again && again.code})`);
    const p2 = await browse(n1.consentUrl);
    ok(p2.status === 302 && p2.back && p2.back.status === 200 && ex.length === 1 && JSON.stringify(ex[0].narrowed) === JSON.stringify([OPT]) && ol.status(f.flowId).ok === true && done.length === 1 && done[0].ok === true, 'the narrowed consent is granted (302 → the loopback) and the exchange is TOLD what was dropped (narrowed) — the account can say it, never a silent narrower consent', JSON.stringify(ex));
    let late = null; try { ol.narrow(f.flowId); } catch (e) { late = e; }
    ok(late && late.code === 'no-flow', 'a narrow on a finished flow is refused (no-flow)');
    ol.stopAll();
  }
  {
    // a flow with nothing optional cannot be narrowed; a narrowed flow's `build` closure goes with the flow's end
    const ol = OL.createOAuthLoopback({ log: quiet });
    const f = await ol.begin({ id: 'g', mode: 'ephemeral', buildConsentUrl: ({ state }) => `https://x/?state=${state}`, exchange: async () => ({}) });
    let e0 = null; try { ol.narrow(f.flowId); } catch (e) { e0 = e; }
    ok(e0 && e0.code === 'nothing-optional' && JSON.stringify(ol.status(f.flowId).optional) === '[]', 'a flow with no optional scopes answers nothing-optional (never a changed URL)');
    ol.stopAll();
  }
  {
    // THE VENDOR'S ERROR REDIRECT: `?error=access_denied&state=<ours>` (the person pressed Deny) ENDS the flow by name
    const { ol, f, ex, done } = await run9(OL, P9b);
    const st = new URL(f.consentUrl).searchParams.get('state');
    const r = await get(`http://127.0.0.1:${P9b}/lark/cb?error=access_denied&state=${st}`);
    await sleep(30);
    const s9 = ol.status(f.flowId);
    ok(r.status === 200 && /did not grant the sign-in \(access_denied\)/.test(r.body) && !/connected — you can close/.test(r.body) && ex.length === 0, 'the tab says the vendor did not grant it (access_denied) — never "connected"; nothing exchanged', r.body);
    ok(s9.done === true && s9.ok === false && s9.running === false && /Lark did not grant the sign-in \(access_denied\)/.test(s9.error || '') && done.length === 1 && done[0].ok === false && (await portFree(P9b)), 'the flow ENDS by name (done, the error sentence, reported once, the port released)', JSON.stringify(s9));
    const hostile = await (async () => { const x = await run9(OL, P9c); const st2 = new URL(x.f.consentUrl).searchParams.get('state'); const rr = await get(`http://127.0.0.1:${P9c}/lark/cb?error=${encodeURIComponent('<img src=x onerror=alert(1)>' + 'e'.repeat(5000))}&state=${st2}`); await sleep(30); const e = x.ol.status(x.f.flowId).error || ''; x.ol.stopAll(); return { body: rr.body, e }; })();
    ok(!/<img/.test(hostile.body) && !/<img/.test(hostile.e) && hostile.e.length < 200, 'a hostile error parameter is bounded and reduced to a code\'s alphabet before it is said (no markup, < 200 chars)', hostile.e);
    ol.stopAll();
  }
  // CONTROLS (patched copies, scratch only): no once-guard ⇒ a second narrow passes; no error branch ⇒ the pre-ruling
  // handler says "connected" over a denied consent and leaves the flow running until its timeout
  {
    const M9 = mutantCopies('oauth-narrow', REPO);
    const src9 = fs.readFileSync(path.join(REPO, 'src/oauth-loopback.js'), 'utf-8');
    const ONCE = "    if (st.narrowedGroups >= st.groups.length) {";   // lane lark-search-poll: the guard is per GROUP now
    const ERRB = "        if (verr) {";
    ok(src9.split(ONCE).length === 2 && src9.split(ERRB).length === 2, 'CONTROL setup: the once-guard and the error branch are each present once');
    const OLa = require(M9.write('src/oauth-loopback.js', src9.replace(ONCE, "    if (false) {"), 'narrow-twice'));
    const [Pa, Pb] = await freePorts(2);
    const a = await run9(OLa, Pa);
    a.ol.narrow(a.f.flowId); let twice = null; try { twice = a.ol.narrow(a.f.flowId); } catch { twice = null; }
    ok(!!twice, 'CONTROL: a copy without the once-guard narrows TWICE — the "ONCE" assert above would be red');
    a.ol.stopAll();
    const OLb = require(M9.write('src/oauth-loopback.js', src9.replace(ERRB, '        if (false) {'), 'no-error-branch'));
    const b = await run9(OLb, Pb);
    const rb = await get(`http://127.0.0.1:${Pb}/lark/cb?error=access_denied&state=${new URL(b.f.consentUrl).searchParams.get('state')}`);
    await sleep(30);
    ok(/connected — you can close this tab/.test(rb.body) && b.ol.status(b.f.flowId).running === true, 'CONTROL: a copy without the error branch answers "connected" over a DENIED consent and leaves the flow running — the two asserts above would be red');
    b.ol.stopAll();
    for (const c of copiesCensus(M9.files, M9.dir, REPO, { minCopies: 2, label: 'oauth-narrow: ' })) ok(c.pass, c.name, c.pass ? undefined : c.detail);
  }
  // ⑨b ORDERED GROUPS (lane lark-search-poll, owner decision 5: "one scope dropped per retry, each a click naming the
  // scope"): three groups, least valuable first — each narrow drops the NEXT group only, the next one is named, the
  // exchange hears everything dropped, and `already-narrowed` comes only once every group is gone
  {
    const RX = 'im:message.reactions:read', P2P = 'im:message.p2p_msg:get_as_user', S = 'search:message';
    const runG = async (port) => {
      const ol = OL.createOAuthLoopback({ log: quiet });
      const ex = [];
      const f = await ol.begin({
        id: 'lark-g', mode: 'fixed', callbackUrl: `http://127.0.0.1:${port}/lark/cb`, label: 'Lark', optionalScopes: [[RX], [P2P], [S], [RX]],
        buildConsentUrl: ({ redirectUri, state, without = [] }) => `https://accounts.example/open-apis/authen/v1/authorize?` + new URLSearchParams({ redirect_uri: redirectUri, state, scope: ['im:message', 'im:chat:readonly', RX, P2P, S].filter((x) => !without.includes(x)).join(' ') }),
        exchange: async ({ code, narrowed }) => { ex.push({ code, narrowed }); return { ok: true }; },
      });
      return { ol, f, ex };
    };
    const [G1, G2] = await freePorts(2);
    {
      // the fake app enabled the search and the single-chat read, NOT reactions ⇒ ONE press, the search kept
      ENABLED.add(P2P); ENABLED.add(S);
      const { ol, f, ex } = await runG(G1);
      ok(JSON.stringify(f.groups) === JSON.stringify([[RX], [P2P], [S]]) && JSON.stringify(f.nextNarrow) === JSON.stringify([RX]), 'the flow names its ORDERED groups (a repeated scope keeps its first place) and the scope the first press drops', JSON.stringify([f.groups, f.nextNarrow]));
      const p0 = await browse(f.consentUrl);
      const n1 = ol.narrow(f.flowId);
      const sc1 = new URL(n1.consentUrl).searchParams.get('scope').split(' ');
      ok(/20027/.test(p0.body) && JSON.stringify(n1.narrowed) === JSON.stringify([RX]) && !sc1.includes(RX) && sc1.includes(S) && sc1.includes(P2P) && JSON.stringify(n1.nextNarrow) === JSON.stringify([P2P]), 'the FIRST press drops the reactions read ONLY — the search and the single-chat read are still asked for; the next press would drop the single-chat read (named)', JSON.stringify(n1));
      const p1 = await browse(n1.consentUrl);
      ok(p1.status === 302 && ex.length === 1 && JSON.stringify(ex[0].narrowed) === JSON.stringify([RX]), 'an app that lacks only the reactions scope KEEPS the search: granted after one press, the exchange told exactly what was dropped', JSON.stringify(ex));
      ol.stopAll();
      ENABLED.delete(P2P); ENABLED.delete(S);
    }
    {
      // the fake app enabled NONE of them ⇒ three presses, each naming its scope, then refused by name
      const { ol, f, ex } = await runG(G2);
      const names = [];
      let last = f;
      for (let i = 0; i < 3; i++) { names.push((last.nextNarrow || []).join('+')); last = ol.narrow(f.flowId); const pg = await browse(last.consentUrl); if (pg.status === 302) break; }
      ok(JSON.stringify(names) === JSON.stringify([RX, P2P, S]) && JSON.stringify(last.narrowed) === JSON.stringify([RX, P2P, S]) && last.nextNarrow === null && ex.length === 1 && JSON.stringify(ex[0].narrowed) === JSON.stringify([RX, P2P, S]), 'three presses, least valuable first (reactions → the single-chat read → the search), each naming what it drops; the third consent is granted and the exchange hears all three', JSON.stringify({ names, last: last.narrowed, ex }));
      let over = null; try { ol.narrow(f.flowId); } catch (e) { over = e; }
      ok(over && (over.code === 'no-flow' || over.code === 'already-narrowed'), 'past the last group nothing narrows further', over && over.code);
      ol.stopAll();
    }
    {
      const ol = OL.createOAuthLoopback({ log: quiet });
      const f = await ol.begin({ id: 'lark-h', mode: 'ephemeral', optionalScopes: [[RX], [S]], buildConsentUrl: ({ state, without = [] }) => `https://x/?state=${state}&w=${without.join(',')}`, exchange: async () => ({}) });
      ol.narrow(f.flowId); ol.narrow(f.flowId);
      let e3 = null; try { ol.narrow(f.flowId); } catch (e) { e3 = e; }
      ok(e3 && e3.code === 'already-narrowed' && /already dropped every permission it can do without \(im:message\.reactions:read \+ search:message\)/.test(e3.message), 'after every group is gone the next press is refused by name, naming everything dropped', e3 && e3.message);
      ol.stopAll();
    }
  }
  await new Promise((r) => fakeAuth.close(r));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
