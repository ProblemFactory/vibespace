#!/usr/bin/env node
/**
 * Round 29 regression nails for `vault-login` (`go-r29` — Compulsory 1 & 2, Items 3–5, and 2 Minor Items):
 *   - R29-1a: Compulsory 1-1 — ONE pure verdict `loginFillChannelVerdict` (`src/browser-mediation.js`) shared by
 *     `precheckVaultFill` AND `fillVaultField` (even when `prechecked: true`), admitting ONLY local mediated channels
 *     (`mode === 'mediated'` or `'scope'`, with `proxy`, `!external`, `!remote`, `!remoteSession`, `hasCdp`) and
 *     refusing every other channel with `409 login_channel_unmediated` (`0` `Input.insertText` calls).
 *   - R29-1b: Compulsory 1-2 — `vibespace-vault request --kind login` (`src/server/vault-paste-door.js`) refuses
 *     `409 login_channel_unmediated` BEFORE any For-you card (`userTodos`) is created on ephemeral, paired-machine
 *     remote, external raw-CDP, and remote-session channels; admits `200` (`1` card) when attached/pinned to an
 *     authorized local mediated profile; non-login kinds (`api-key`) still return `200`.
 *   - R29-1c: Compulsory 1-3 — Actionable refusal words tailored to THIS conversation: explains why (temporary
 *     browser, unmediated CDP, sign-in lost when closed), lists ONLY local mediated named profiles this conversation
 *     is already authorized to use (`vibespace-browser use <profile>`), and when 0 are authorized explains how to
 *     request authorization (`vibespace-ask` / `Who can use it → Change…`) while warning not to create duplicate
 *     profiles when restricted ones exist.
 *   - R29-1d: Compulsory 1-4 — Dynamic exhaustive grid census derived from `leaseRoadVerdict`'s `mode` and `why`
 *     literals in `src/browser-mediation.js` × profile kinds (auto-RED if a new `mode` or `why` is added without a row).
 *   - R29-1e: Compulsory 1-5 + Minor Item 2 — `data/bin/vibespace-browser`, `docs/agent/browser-manual.md`, and
 *     `docs/kb-bugfix-invariants.md` state the channel law and the `< 8`-byte 6-digit OTP raw non-console / post-lift
 *     `Runtime.consoleAPICalled` boundary.
 *   - R29-1f: Compulsory 1-6 — Real `browser-keeper` `P5` concurrent raw-WS `awaitPromise` read attack across
 *     managed ephemeral, subagent child handle, paired-machine remote, external raw-CDP, remote session, and
 *     unproxied (`no-proxy`) channels (`409 login_channel_unmediated`, `0` `Input.insertText`, `""` on raw WS),
 *     paired with positive local mediated control (`200` fill + `login_fill_live` abort on concurrent mediated read).
 *   - R29-2: Compulsory 2 — Untouched browser sessions behave identically to `master`: unfenced `Target.sendMessageToTarget`
 *     is forwarded on `scope` grant (`{"result":{}}`), refused when fenced; sessionless `Browser.getVersion` succeeds
 *     both unfenced and while another tab is fenced.
 *   - R29-3: Item 3 — Full fence restoration across Hub restart: `B.loadState` preserves `mode`, `typedSlot: 'otp'`,
 *     `typedPrevious`, `unknownTyped`, and `also` (incl. `at`); `two-logins` (`< 8`-byte + `>= 8`-byte) wipes both on
 *     restart ceiling; `otp` fence across unlocked restart and cold-locked `+11 min` restart never mislabels as
 *     `unknown_typed` and wipes the `t0` 6-digit TOTP code on unlock.
 *   - R29-4: Item 4 — "Value has left the page": `wipeNode` dispatches `input` + `change` + `blur`, and zero-plaintext
 *     salted-hash `postLiftGuards` re-arm `409 login_fill_live` in `P2c` (ceiling wipe) and `P2e` (same-origin submit
 *     wipe) when the site re-injects password or 6-digit OTP into the DOM, lifting cleanly on top-frame navigation.
 *   - R29-5a & R29-5b: Item 5 — Deterministic nails killing all 12 previously surviving mutants (`M01, M02, M03, M10`
 *     from Reader A + `M2, M4, M5, M6, M8, M10, M11, M13` from Reader B).
 *   - R29-6: Minor Item 1 — `totpCode` returning `{ ok: false, code: 'paced' }` (21st OTP fill in 1 min via real
 *     `vault-totp.js`) maps to `429 code_paced` instead of `409 login_no_otp`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
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
// B-518e (R29-4 / R29-5b, red on the hosted runner at ×1.38–1.40): a step waits on the FACT it needs — asked a bounded COUNT of
// times — never a fixed sleep raced against the product's timers; the bound only ends a wait that never comes. The asks come
// from ONE pool for the child (1500): a wait takes at most 300 of what is left, so a broken road that fails several waits keeps
// the child's run inside the parent's 30 s kill (every leg still prints its red), and a wait after one that ran out still has
// asks of its own — its red is its own, never a side effect of an earlier wait's
let askPool = 1500;
const until = async (fn, { tries = 300, step = 10 } = {}) => {
  const n = Math.max(1, Math.min(tries, askPool));
  for (let k = 0; k < n; k++) { askPool = Math.max(0, askPool - 1); if (await fn()) return true; await sleep(step); }
  return Boolean(await fn());
};
const ALLOWED_ROAD_MODES = new Set(['mediated', 'scope', null]);

export function inspectLeaseRoadSource(medSrc, BM = {}) {
  const lrvMatch = String(medSrc || '').match(/function\s+leaseRoadVerdict\s*\([\s\S]*?\n\}/);
  const lrvBody = lrvMatch ? lrvMatch[0] : '';
  const whyLiterals = [...new Set([...lrvBody.matchAll(/\bwhy\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|([^\s,}]+))/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]))];
  const modeRaw = [...lrvBody.matchAll(/\bmode\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|([^\s,}]+))/g)].map((m) => {
    if (m[1] !== undefined) return { literal: true, raw: m[1] };
    if (m[2] !== undefined) return { literal: true, raw: m[2] };
    if (m[3] !== undefined) return { literal: true, raw: m[3] };
    return { literal: false, raw: m[4] };
  });
  const modeValues = [...new Set(modeRaw.map((tok) => {
    if (tok.literal) return tok.raw;
    if (tok.raw === 'null') return null;
    if (Object.prototype.hasOwnProperty.call(BM, tok.raw)) return BM[tok.raw];
    return tok.raw;
  }))];
  const illegalModes = modeValues.filter((m) => !ALLOWED_ROAD_MODES.has(m));
  return { lrvBody, whyLiterals, modeValues, illegalModes };
}

async function startKernelRelay(fk) {
  const { WebSocketServer, WebSocket } = createRequire(import.meta.url)('ws');
  const state = {
    upstreamCalls: [],
    hook: null,
    attachedByTarget: new Map(),
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
        const closeClient = () => {
          try { clientWs.terminate(); } catch { /* gone */ }
        };
        upWs.on('message', (raw) => {
          const str = String(raw);
          try {
            const m = JSON.parse(str);
            if (m.method === 'Target.attachedToTarget' && m.params?.sessionId && m.params?.targetInfo?.targetId) {
              const tid = m.params.targetInfo.targetId;
              if (!state.attachedByTarget.has(tid)) state.attachedByTarget.set(tid, new Set());
              state.attachedByTarget.get(tid).add({ clientWs, sessionId: m.params.sessionId });
            }
          } catch { /* raw */ }
          if (clientWs.readyState === WebSocket.OPEN) {
            try { clientWs.send(str); } catch { /* gone */ }
          }
        });
        upWs.on('close', () => { try { clientWs.close(); } catch { /* gone */ } });
        clientWs.on('close', () => {
          for (const set of state.attachedByTarget.values()) {
            for (const row of [...set]) if (row.clientWs === clientWs) set.delete(row);
          }
          try { upWs.close(); } catch { /* gone */ }
        });
        clientWs.on('message', async (raw) => {
          const str = String(raw);
          let m = null;
          try { m = JSON.parse(str); } catch { m = null; }
          if (m && m.method) {
            state.upstreamCalls.push({ id: m.id, method: m.method, sessionId: m.sessionId || null, params: m.params || {} });
          }
          if (m && typeof state.hook === 'function') {
            const hRes = await state.hook(m, { sendToClient, closeClient, upWs });
            if (hRes === true) return;
          }
          if (upWs.readyState === WebSocket.OPEN) {
            try { upWs.send(str); } catch { /* gone */ }
          }
        });
      });
    });
    upWs.on('error', () => { try { sock.destroy(); } catch { /* gone */ } });
  });
  await new Promise((r) => relayHttp.listen(0, '127.0.0.1', r));
  relayPort = relayHttp.address().port;
  const wsPath = new URL(fk.wsUrl).pathname;
  return {
    port: relayPort,
    wsUrl: `ws://127.0.0.1:${relayPort}${wsPath}`,
    state,
    emitTargetEvent(targetId, method, params) {
      const set = state.attachedByTarget.get(targetId);
      let count = 0;
      if (!set) return 0;
      for (const { clientWs, sessionId } of [...set]) {
        if (clientWs.readyState === WebSocket.OPEN) {
          try {
            clientWs.send(JSON.stringify({ method, params, sessionId }));
            count++;
          } catch { /* gone */ }
        }
      }
      return count;
    },
    dropClientSockets() {
      for (const ws of wss.clients) {
        try { ws.terminate(); } catch { /* gone */ }
      }
    },
    async close() {
      for (const ws of wss.clients) { try { ws.terminate(); } catch { /* gone */ } }
      await new Promise((r) => relayHttp.close(() => r()));
    },
  };
}

async function openCdpWs(WebSocket, cdpUrl, targetId = null) {
  const ws = new WebSocket(cdpUrl);
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (Number.isInteger(m.id) && pending.has(m.id)) {
      const r = pending.get(m.id);
      pending.delete(m.id);
      r(m);
    } else if (m.method) {
      events.push(m);
    }
  });
  const call = (method, params = {}, sessionId = undefined) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  let sid = null;
  let ctxId = null;
  if (targetId) {
    const att = await call('Target.attachToTarget', { targetId, flatten: true });
    sid = att.result?.sessionId || null;
  }
  const evalInDom = async (expression, extra = {}) => {
    if (!ctxId && sid && targetId) {
      const iw = await call('Page.createIsolatedWorld', { frameId: targetId, worldName: 'probe' }, sid);
      ctxId = iw.result?.executionContextId || null;
    }
    return call(
      'Runtime.evaluate',
      { expression, ...(ctxId ? { contextId: ctxId } : {}), returnByValue: true, ...extra },
      sid,
    );
  };
  return {
    ws,
    sid,
    ctxId,
    events,
    call,
    evalInDom,
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
    fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, pid: c.pid }) + '\\n');
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
if (a === 'close' && b === '--all') {
  const s = read();
  let closed = 0;
  if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch {} }
  try { fs.unlinkSync(f); } catch {}
  out({ success: true, data: { closed, failed: [], sessions: [] } });
  process.exit(0);
}
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') });
process.exit(1);
`;
  fs.writeFileSync(path.join(binDir, 'agent-browser'), script, { mode: 0o755 });
  return {
    reap() {
      try {
        const lines = fs.readFileSync(path.join(abStateDir, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean);
        for (const l of lines) {
          const row = JSON.parse(l);
          if (row && row.pid) {
            try { process.kill(row.pid, 'SIGKILL'); } catch { /* gone */ }
          }
        }
      } catch { /* none */ }
    },
  };
}

export async function runR29LoginNails({ repoDir, ok }) {
  const req = createRequire(path.join(repoDir, 'package.json'));
  const express = req('express');
  const { WebSocket } = req('ws');
  const B = req('./src/browser-profiles.js');
  const BF = req('./src/browser-facts.js');
  const BM = req('./src/browser-mediation.js');
  const BL = req('./src/browser-login.js');
  const LF = req('./src/server/browser-login-fill.js');
  const VE = req('./src/server/vault-engine.js');
  const VT = req('./src/server/vault-totp.js');
  const GS = req('./src/server/grants-store.js');
  const BK = req('./src/server/browser-keeper.js');
  const Lm = req('./src/server/browser-logins.js');
  const Dm = withCurrentTab(req('./src/server/browser-dialogs.js')); // B-21cc: each watch's keeper answers its current tab
  const CM = req('./src/server/cdp-mediator.js');
  const Rm = req('./src/routes/browser.js');
  const VPD = req('./src/server/vault-paste-door.js');
  const { UserTodoManager } = req('./src/user-todos.js');
  const { startFakeKernel } = await import(pathToFileURL(path.join(repoDir, 'scripts/fixtures/fake-kernel.mjs')).href);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r29-nails-'));
  const homeDir = path.join(tmpRoot, 'home');
  fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // R29-1a, 1b, 1c, 1d, 1e, 1f — THE LOGIN CHANNEL LAW (Option 甲)
    // ──────────────────────────────────────────────────────────────────────────
    const hasVerdictFn = typeof BM.loginFillChannelVerdict === 'function';
    const dlgSrc = fs.readFileSync(path.join(repoDir, 'src/server/browser-dialogs.js'), 'utf8');
    const medSrc = fs.readFileSync(path.join(repoDir, 'src/browser-mediation.js'), 'utf8');

    // R29-1d: Dynamic grid census parsed from `leaseRoadVerdict` in `src/browser-mediation.js`
    {
      const { whyLiterals, modeValues, illegalModes } = inspectLeaseRoadSource(medSrc, BM);

      const GRID = [
        // Admitted cells (ONLY local mediated channels: 'mediated' and 'scope')
        { key: 'mediated|mediated|local-instance', roadIn: { mediated: true, proxy: true, ephemeral: false, agent: true }, chIn: { proxy: true, external: false, remote: false, remoteSession: false, hasCdp: true }, wantOk: true, wantMode: 'mediated', wantWhy: 'mediated' },
        { key: 'scope|shared|local-owner', roadIn: { mediated: false, proxy: true, ephemeral: false, agent: true }, chIn: { proxy: true, external: false, remote: false, remoteSession: false, hasCdp: true }, wantOk: true, wantMode: 'scope', wantWhy: 'shared' },
        // Refused cells covering every leaseRoadVerdict mode/why × profile/session kinds
        { key: 'null|no-proxy|local-owner', roadIn: { mediated: false, proxy: false, ephemeral: false, agent: true }, chIn: { proxy: false }, wantOk: false, wantWhy: 'no-proxy' },
        { key: 'mediated|mediated|no-proxy-override', roadIn: { mediated: true, proxy: false, ephemeral: false, agent: true }, chIn: { proxy: false }, wantOk: false, wantWhy: 'no-proxy' },
        { key: 'null|ephemeral|managed-ephemeral', roadIn: { mediated: false, proxy: true, ephemeral: true, agent: true }, chIn: { proxy: true }, wantOk: false, wantWhy: 'ephemeral' },
        { key: 'null|ephemeral|child-handle', roadIn: { mediated: false, proxy: true, ephemeral: true, agent: true }, chIn: { proxy: true }, wantOk: false, wantWhy: 'ephemeral' },
        { key: 'null|remote|paired-machine', roadIn: { mediated: false, proxy: true, ephemeral: false, paired: true, agent: true }, chIn: { proxy: true, remote: true, profileLabel: 'LabProfile' }, wantOk: false, wantWhy: 'remote' },
        { key: 'null|remote|external-cdp', roadIn: { mediated: false, proxy: true, ephemeral: false, external: true, agent: true }, chIn: { proxy: true, external: true, profileLabel: 'ExtCdp' }, wantOk: false, wantWhy: 'external' },
        { key: 'null|remote|remote-session', roadIn: { mediated: false, proxy: true, ephemeral: false, remoteSession: true, agent: true }, chIn: { proxy: true, remoteSession: true }, wantOk: false, wantWhy: 'remote-session' },
        { key: 'scope|shared|no-cdp', roadIn: { mediated: false, proxy: true, ephemeral: false, agent: true }, chIn: { proxy: true, hasCdp: false, profileLabel: 'NoCdpProf' }, wantOk: false, wantWhy: 'no-cdp' },
        { key: 'null|human|browse-yourself', roadIn: { mediated: false, proxy: true, ephemeral: false, remote: false, agent: false }, chIn: { proxy: true }, wantOk: false, wantWhy: 'human' },
      ];

      const coveredWhys = new Set();
      const coveredModes = new Set();
      const mismatches = [];
      if (!hasVerdictFn) {
        mismatches.push('BM.loginFillChannelVerdict is missing');
      } else {
        for (const row of GRID) {
          const road = BM.leaseRoadVerdict(row.roadIn);
          coveredWhys.add(road.why);
          coveredModes.add(road.mode);
          const v = BM.loginFillChannelVerdict(road, row.chIn);
          if (Boolean(v && v.ok) !== row.wantOk) {
            mismatches.push({ key: row.key, road, got: v, expectedOk: row.wantOk });
          } else if (row.wantOk) {
            if (v.mode !== row.wantMode || v.why !== row.wantWhy || v.code !== null) {
              mismatches.push({ key: row.key, road, got: v });
            }
          } else if (v.code !== 'login_channel_unmediated' || v.why !== row.wantWhy || typeof v.error !== 'string' || !v.error.length) {
            mismatches.push({ key: row.key, road, got: v, wantWhy: row.wantWhy });
          }
        }
      }
      const uncoveredWhys = whyLiterals.filter((w) => !coveredWhys.has(w));
      const uncoveredModes = modeValues.filter((m) => !coveredModes.has(m));
      ok(
        hasVerdictFn
          && whyLiterals.length >= 6
          && illegalModes.length === 0
          && uncoveredWhys.length === 0
          && uncoveredModes.length === 0
          && mismatches.length === 0,
        'R29-1d (Channel Law 1-4 dynamic grid census): every mode & why literal in leaseRoadVerdict × profile kind is in {mediated, scope, null} and covered, admitting ONLY local mediated/scope channels and refusing every other cell with login_channel_unmediated',
        { whyLiterals, modeValues, illegalModes, uncoveredWhys, uncoveredModes, mismatches },
      );
    }

    // R29-1e + Minor Item 2: CLI help, agent manual, and KB invariants text check
    {
      const cliHelp = fs.readFileSync(path.join(repoDir, 'data/bin/vibespace-browser'), 'utf8');
      const manual = fs.readFileSync(path.join(repoDir, 'docs/agent/browser-manual.md'), 'utf8');
      const kb = fs.readFileSync(path.join(repoDir, 'docs/kb-bugfix-invariants.md'), 'utf8');
      const cliOk = /login_channel_unmediated/.test(cliHelp) && /local mediated named profile/i.test(cliHelp);
      const manualOk = /login_channel_unmediated/.test(manual) && /local mediated named/i.test(manual) && /temporary browser/i.test(manual);
      const kbChanOk = /login_channel_unmediated/.test(kb) && /loginFillChannelVerdict/.test(kb);
      const kbOtpOk = /6-digit OTP event boundary/.test(kb) && /MIN_MASK_BYTES\s*=\s*8/.test(kb) && /Runtime\.consoleAPICalled/.test(kb);
      ok(
        cliOk && manualOk && kbChanOk && kbOtpOk,
        'R29-1e + Minor 2 (Docs, CLI help, and KB invariants): vibespace-browser help, browser-manual.md, and kb-bugfix-invariants.md document login_channel_unmediated and the < 8-byte OTP raw non-console / post-lift console boundary',
        { cliOk, manualOk, kbChanOk, kbOtpOk },
      );
    }

    // R29-1a, 1b, 1c, 1f: Real keeper + fake-kernel + paste-door + P5 concurrent raw-WS attack across all 6 unmediated roads
    {
      const ORIGIN = 'https://chanr29.example.test';
      const PW_VAL = 'ChanLawSecret!2026_R29';
      const OTP_VAL = '619402';
      const binDir = path.join(tmpRoot, 'bin');
      const abState = path.join(tmpRoot, 'ab-state');
      const fakeAb = installFakeAgentBrowser(binDir, abState);
      const dataMed = path.join(tmpRoot, 'data-med');
      const dataBare = path.join(tmpRoot, 'data-bare');
      fs.mkdirSync(dataMed, { recursive: true, mode: 0o700 });
      fs.mkdirSync(dataBare, { recursive: true, mode: 0o700 });

      const fk = await startFakeKernel({
        firstUrl: `${ORIGIN}/login`,
        mode: { standard: true, omitFilledPassword: true },
      });
      const tid = fk.targets()[0].targetId;
      fk.setDom(tid, {
        url: `${ORIGIN}/login`,
        elements: [
          { id: 'u', tag: 'input', type: 'email', name: 'Email' },
          { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
          { id: 'otp', tag: 'input', type: 'text', name: 'Code' },
        ],
      });
      const relay = await startKernelRelay(fk);
      const med = CM.create({ log: quiet });
      await med.listen();

      const KEY_AGENT = 'bk-0000c29a';
      const KEY_NOAUTH = 'bk-0000c29b';
      const KEY_OWNER2 = 'bk-0000c29c';
      const KEY_BARE = 'bk-0000c29d';
      const liveSet = new Set([KEY_AGENT, KEY_NOAUTH, KEY_OWNER2, KEY_BARE]);
      const rtEnv = {
        FAKE_AB_STATE: abState,
        FAKE_CDP_URL: relay.wsUrl,
        FAKE_TARGET_ID: tid,
        PATH: `${binDir}:${process.env.PATH || '/usr/bin:/bin'}`,
        HOME: homeDir,
      };
      let clock = 1_765_000_000_000;
      const keeper = BK.create({
        dataDir: dataMed,
        homeDir,
        env: () => rtEnv,
        broadcast: () => {},
        serverSetting: (k) => ({ 'browser.idleTimeoutMs': 600_000 })[k],
        liveKeys: () => liveSet,
        runtime: BF.createBrowserRuntime({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        facts: BF.createBrowserFacts({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        hostKnown: (h) => h === 'lab-1',
        log: quiet,
        now: () => clock,
        install: false,
        mediator: med,
      });
      const bareKeeper = BK.create({
        dataDir: dataBare,
        homeDir,
        env: () => rtEnv,
        broadcast: () => {},
        serverSetting: (k) => ({ 'browser.idleTimeoutMs': 600_000 })[k],
        liveKeys: () => liveSet,
        runtime: BF.createBrowserRuntime({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        facts: BF.createBrowserFacts({ env: rtEnv, cmd: path.join(binDir, 'agent-browser') }),
        log: quiet,
        now: () => clock,
        install: false,
        mediator: null,
      });

      const vault = VE.create({ dataDir: dataMed, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      await vault.setup('r29-master-passphrase');
      const vtotp = VT.create({ dataDir: dataMed, vault, now: () => clock });
      vtotp.addEntry({ name: 'chan-2fa', seed: 'JBSWY3DPEHPK3PXP' });
      const grants = GS.create({ dataDir: dataMed, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({
        vault,
        grants: () => grants,
        totpCode: () => ({ ok: true, code: OTP_VAL }),
        now: () => clock,
        log: quiet.log,
      });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW_VAL, totpName: 'chan-2fa' }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      const dialogs = Dm.create({
        keeper,
        logins,
        holdersOf: Dm.holdersOfKeeper(keeper),
        leaseCountOf: (pid) => keeper.list().leases.filter((l) => l.profileId === pid).length,
        enableTimeoutMs: 1200,
        interceptTimeoutMs: 1200,
        now: () => clock,
        log: quiet,
      });
      const bareDialogs = Dm.create({
        keeper: bareKeeper,
        logins,
        holdersOf: Dm.holdersOfKeeper(bareKeeper),
        leaseCountOf: (pid) => bareKeeper.list().leases.filter((l) => l.profileId === pid).length,
        enableTimeoutMs: 1200,
        interceptTimeoutMs: 1200,
        now: () => clock,
        log: quiet,
      });
      // Dm.create automatically wires keeper.mediator().setLoginFence(...)!

      let srv = null;
      let srvBare = null;
      try {
        // Create profiles on `keeper`:
        // 1. Authorized local mediated (`sharing: 'instance'` & `sharing: 'owner'`) for KEY_AGENT, restricted from KEY_NOAUTH!
        const profShop = keeper.createProfile({ label: 'Shop Named', sharing: 'owner' }, { owner: { kind: 'session', id: KEY_AGENT } });
        const profSecret = keeper.createProfile({ label: 'Restricted Vault Prof', sharing: 'instance' }, { owner: { kind: 'session', id: KEY_OWNER2 } });
        const profRemote = keeper.createProfile({ label: 'Remote Lab', host: 'lab-1' }, { owner: { kind: 'instance', id: null } });
        const profExt = keeper.createProfile({ label: 'Ext Raw CDP', provider: 'cdp', cdpPort: relay.port }, { owner: { kind: 'instance', id: null } });
        const profBare = bareKeeper.createProfile({ label: 'Bare Unproxied' }, { owner: { kind: 'instance', id: null } });

        // Start managed ephemeral for KEY_AGENT
        const ephPairs = B.browserEnvFor({ browserKey: KEY_AGENT, variant: B.VARIANTS.N, idleMs: 600_000 });
        const ephStarted = await keeper.ensureEphemeral({ browserKey: KEY_AGENT, sessionId: 'sess-c29a', envPairs: ephPairs, sessionName: 'AgentA' });

        // R29-1a: ONE shared gate — both precheckVaultFill AND fillVaultField (even with prechecked: true!) call checkLoginChannelFor -> loginFillChannelVerdict
        const checkCallSites = (dlgSrc.match(/checkLoginChannelFor\s*\(/g) || []).length;
        const preEph = dialogs.precheckVaultFill({
          target: '#pw',
          spec: 'chanr29.example.test#alice/password',
          browserKey: KEY_AGENT,
          ephemeral: true,
          facts: { conversationKeys: [KEY_AGENT] },
        });
        const fillEphBypass = await dialogs.fillVaultField(
          { profileId: ephStarted.profile.id, browserKey: KEY_AGENT, ephemeral: true },
          { target: '#pw', spec: 'chanr29.example.test#alice/password', prechecked: true, facts: { conversationKeys: [KEY_AGENT] } },
        );
        const insertsAfter1a = relay.state.upstreamCalls.filter((c) => c.method === 'Input.insertText').length;
        ok(
          hasVerdictFn
            && checkCallSites >= 2
            && preEph && preEph.ok === false && preEph.code === 'login_channel_unmediated'
            && fillEphBypass && fillEphBypass.ok === false && fillEphBypass.code === 'login_channel_unmediated'
            && insertsAfter1a === 0,
          'R29-1a (Channel Law 1-1): ONE pure loginFillChannelVerdict shared by precheckVaultFill and fillVaultField (even when prechecked: true) refuses ephemeral with login_channel_unmediated and 0 Input.insertText calls',
          { hasVerdictFn, checkCallSites, preEph, fillEphBypass, insertsAfter1a },
        );

        // R29-1c: Actionable refusal words for THIS conversation (Case A: authorized local profiles exist; Case B: 0 authorized, restricted exist; Case C: 0 profiles exist)
        const chAgentEph = typeof keeper.loginChannelFor === 'function'
          ? keeper.loginChannelFor({ browserKey: KEY_AGENT, agentFacts: { browserKey: KEY_AGENT, conversationKeys: [KEY_AGENT], taskIds: [] }, action: 'fill' })
          : null;
        const chNoAuthEph = typeof keeper.loginChannelFor === 'function'
          ? keeper.loginChannelFor({ browserKey: KEY_NOAUTH, agentFacts: { browserKey: KEY_NOAUTH, conversationKeys: [KEY_NOAUTH], taskIds: [] }, action: 'fill' })
          : null;
        const chZeroProfs = hasVerdictFn
          ? BM.loginFillChannelVerdict({ mode: null, why: 'ephemeral' }, { proxy: true, usableProfiles: [], restrictedCount: 0, action: 'fill' })
          : null;
        const caseAOk = Boolean(
          chAgentEph && chAgentEph.ok === false && chAgentEph.code === 'login_channel_unmediated'
            && /temporary browser/i.test(chAgentEph.error)
            && /unmediated/i.test(chAgentEph.error)
            && /lost when the temporary browser closes/i.test(chAgentEph.error)
            && chAgentEph.error.includes('"Shop Named"')
            && chAgentEph.error.includes('vibespace-browser use "Shop Named"')
            && !chAgentEph.error.includes('Restricted Vault Prof')
            && !chAgentEph.error.includes('Remote Lab')
            && !chAgentEph.error.includes('Ext Raw CDP'),
        );
        const caseBOk = Boolean(
          chNoAuthEph && chNoAuthEph.ok === false && chNoAuthEph.code === 'login_channel_unmediated'
            && /No local named browser profile is currently authorized for this conversation/.test(chNoAuthEph.error)
            && /vibespace-ask/.test(chNoAuthEph.error)
            && /Who can use it/.test(chNoAuthEph.error)
            && /never create a duplicate profile/i.test(chNoAuthEph.error)
            && !chNoAuthEph.error.includes('Restricted Vault Prof'),
        );
        const caseCOk = Boolean(
          chZeroProfs && chZeroProfs.ok === false && chZeroProfs.code === 'login_channel_unmediated'
            && /vibespace-browser new <label>/.test(chZeroProfs.error),
        );
        ok(
          caseAOk && caseBOk && caseCOk,
          'R29-1c (Channel Law 1-3 actionable refusal words): explains temporary-browser/unmediated reason, lists ONLY authorized local mediated profiles (never restricted/remote/external), and guides vibespace-ask / Who can use it when 0 are authorized',
          { chAgentEph, chNoAuthEph, chZeroProfs },
        );

        // R29-1b: Refuse at `vibespace-vault request --kind login` BEFORE any For-you card is created!
        const todoDir = path.join(tmpRoot, 'todos');
        fs.mkdirSync(todoDir, { recursive: true, mode: 0o700 });
        const userTodos = new UserTodoManager({ dataDir: todoDir });
        let doorRemoteSession = false;
        let doorHandle = '';
        const pasteDoor = VPD.create({
          vault,
          userTodos,
          logins,
          loginChannel: typeof keeper.loginChannelFor === 'function'
            ? ({ caller }) => keeper.loginChannelFor({
              browserKey: caller.browserKey || KEY_AGENT,
              handle: doorHandle,
              remoteSession: doorRemoteSession,
              action: 'request',
              agentFacts: { browserKey: caller.browserKey || KEY_AGENT, conversationKeys: [caller.browserKey || KEY_AGENT], taskIds: [] },
            })
            : null,
        });
        const callerA = { conversationId: 'conv-c29a', scope: 'sess-c29a', sessionKey: 'sess-c29a', name: 'AgentA', browserKey: KEY_AGENT };
        // 1) Ephemeral (not attached to any named profile yet)
        const reqEph = pasteDoor.request({ caller: callerA, words: 'login for chanr29', purpose: 'sign in', kind: 'login', hosts: ORIGIN });
        // 2) Remote profile attached
        await keeper.attach({ profileId: profRemote.id, browserKey: KEY_AGENT, sessionId: 'sess-c29a' }).catch(() => {});
        const reqRem = pasteDoor.request({ caller: callerA, words: 'login for chanr29', purpose: 'sign in', kind: 'login', hosts: ORIGIN });
        try { keeper.detach({ profileId: profRemote.id, browserKey: KEY_AGENT, by: 'user' }); } catch { /* */ }
        // 3) External raw-CDP profile attached
        await keeper.attach({ profileId: profExt.id, browserKey: KEY_AGENT, sessionId: 'sess-c29a' }).catch(() => {});
        const reqExt = pasteDoor.request({ caller: callerA, words: 'login for chanr29', purpose: 'sign in', kind: 'login', hosts: ORIGIN });
        try { keeper.detach({ profileId: profExt.id, browserKey: KEY_AGENT, by: 'user' }); } catch { /* */ }
        // 4) Remote session
        doorRemoteSession = true;
        const reqRemSess = pasteDoor.request({ caller: callerA, words: 'login for chanr29', purpose: 'sign in', kind: 'login', hosts: ORIGIN });
        doorRemoteSession = false;
        const openCardsAfterRefusals = (userTodos.snapshot()?.open || []).length;
        // 5) Non-login kind (`api-key`) on ephemeral STILL works!
        const reqApiKey = pasteDoor.request({ caller: callerA, words: 'API token', purpose: 'call API', kind: 'api-key', name: 'CHAN_API_KEY' });
        const openCardsAfterApiKey = (userTodos.snapshot()?.open || []).length;
        // 6) Attach to authorized local mediated profile `profShop` -> `--kind login` now succeeds (1 login card)!
        const atShop = await keeper.attach({ profileId: profShop.id, browserKey: KEY_AGENT, sessionId: 'sess-c29a' });
        const reqLocalOk = pasteDoor.request({ caller: callerA, words: 'login for chanr29', purpose: 'sign in', kind: 'login', hosts: ORIGIN });
        const openCardsAfterLocal = (userTodos.snapshot()?.open || []).length;
        keeper.detach({ profileId: profShop.id, browserKey: KEY_AGENT, by: 'user' });
        userTodos._dirty = false; userTodos._letGo();   // B-0248: the list's owed write is the store writer's: its producer now gives nothing (the release cleared its own timer)

        ok(
          VPD.STATUS?.login_channel_unmediated === 409 && pasteDoor.statusOf('login_channel_unmediated') === 409
            && reqEph.ok === false && reqEph.code === 'login_channel_unmediated' && String(reqEph.words || '').includes('"Shop Named"')
            && reqRem.ok === false && reqRem.code === 'login_channel_unmediated'
            && reqExt.ok === false && reqExt.code === 'login_channel_unmediated'
            && reqRemSess.ok === false && reqRemSess.code === 'login_channel_unmediated'
            && openCardsAfterRefusals === 0
            && reqApiKey.ok === true && openCardsAfterApiKey === 1
            && reqLocalOk.ok === true && openCardsAfterLocal === 2,
          'R29-1b (Channel Law 1-2 request gate): vibespace-vault request --kind login refuses 409 login_channel_unmediated with 0 For-you cards on ephemeral/remote/external/remoteSession, admits api-key, and admits login once attached to an authorized local mediated profile',
          { reqEph, reqRem, reqExt, reqRemSess, openCardsAfterRefusals, reqApiKey, reqLocalOk, openCardsAfterLocal },
        );

        // R29-1f: Reviewer A's P5 concurrent raw-WS read scene against REAL keeper across all 6 unmediated roads + positive local mediated control
        const KEY_CHILD = `${KEY_AGENT}.1`;
        const KEY_REM = 'bk-0000c29f';
        const KEY_EXT = 'bk-0000c290';
        liveSet.add(KEY_REM);
        liveSet.add(KEY_EXT);
        const TOK_EPH = 'vsst_' + crypto.randomBytes(16).toString('hex');
        const TOK_CHILD = 'vsst_' + crypto.randomBytes(16).toString('hex');
        const TOK_REM = 'vsst_' + crypto.randomBytes(16).toString('hex');
        const TOK_EXT = 'vsst_' + crypto.randomBytes(16).toString('hex');
        const TOK_REMSESS = 'vsst_' + crypto.randomBytes(16).toString('hex');
        const TOK_BARE = 'vsst_' + crypto.randomBytes(16).toString('hex');
        keeper.setPin(KEY_REM, profRemote.id);
        keeper.setPin(KEY_EXT, profExt.id);
        const sessionsMed = new Map([
          ['sess-c29a', { agentToken: TOK_EPH, _browserKey: KEY_AGENT, _browserVariant: 'D', name: 'AgentA', cwd: tmpRoot, backendSessionId: 'conv-c29a' }],
          ['sess-child', { agentToken: TOK_CHILD, _browserKey: KEY_CHILD, _browserVariant: 'D', _subNormalizers: new Map([['sub-1', {}]]), name: 'ChildAgent', cwd: tmpRoot, backendSessionId: 'conv-child' }],
          ['sess-remprof', { agentToken: TOK_REM, _browserKey: KEY_REM, _browserVariant: 'D', name: 'RemProfAgent', cwd: tmpRoot, backendSessionId: 'conv-remprof' }],
          ['sess-ext', { agentToken: TOK_EXT, _browserKey: KEY_EXT, _browserVariant: 'D', name: 'ExtAgent', cwd: tmpRoot, backendSessionId: 'conv-ext' }],
          ['sess-rem', { agentToken: TOK_REMSESS, _browserKey: 'bk-0000c29e', _browserVariant: 'H', hostId: 'lab-1', name: 'RemAgent', cwd: tmpRoot, backendSessionId: 'conv-rem' }],
        ]);
        Rm.setup({ keeper, activeSessions: sessionsMed, dialogs, logins, tasksForSession: () => [] });
        const appMed = express();
        appMed.use(express.json());
        appMed.use(Rm.router);
        srv = await new Promise((r) => { const s = appMed.listen(0, '127.0.0.1', () => r(s)); });
        const baseMed = `http://127.0.0.1:${srv.address().port}`;

        const runP5Probe = async (baseUrl, token, body) => {
          const rawCdp = await openCdpWs(WebSocket, relay.wsUrl, tid);
          const insBefore = relay.state.upstreamCalls.filter((c) => c.method === 'Input.insertText').length;
          try {
            const pollExpr = `new Promise((resolve) => {
              setTimeout(() => {
                const pw = document.querySelector('#pw')?.value || '';
                const otp = document.querySelector('#otp')?.value || '';
                resolve(pw + '|' + otp);
              }, 80);
            })`;
            const readP = rawCdp.evalInDom(pollExpr, { awaitPromise: true });
            await sleep(15);
            const res = await fetch(`${baseUrl}/api/agent/browser/fill-vault`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
              body: JSON.stringify(body),
            });
            const json = await res.json();
            const rawRead = await readP;
            const insDelta = relay.state.upstreamCalls.filter((c) => c.method === 'Input.insertText').length - insBefore;
            return { status: res.status, code: json.code, error: json.error, insDelta, rawVal: rawRead?.result?.result?.value };
          } finally {
            rawCdp.close();
          }
        };

        // 1) Ephemeral (default bare verb with no attachment)
        const p5Eph = await runP5Probe(baseMed, TOK_EPH, { target: '#otp', spec: 'chanr29.example.test#alice/otp' });
        // 2) Child handle (subagent session resolving to ephemeral child browser)
        const p5Child = await runP5Probe(baseMed, TOK_CHILD, { target: '#otp', spec: 'chanr29.example.test#alice/otp' });
        // 3) Paired-machine remote profile (`profRemote.id` pinned, CLI prepare: true + direct fillVaultField)
        const p5Remote = await runP5Probe(baseMed, TOK_REM, { prepare: true, target: '#pw', spec: 'chanr29.example.test#alice/password' });
        const p5RemoteDirect = await dialogs.fillVaultField(
          { profileId: profRemote.id, browserKey: KEY_REM },
          { target: '#pw', spec: 'chanr29.example.test#alice/password', facts: { conversationKeys: [KEY_REM] } },
        );
        // 4) External raw-CDP profile (`profExt.id` pinned, CLI prepare: true + direct fillVaultField)
        const p5Ext = await runP5Probe(baseMed, TOK_EXT, { prepare: true, target: '#pw', spec: 'chanr29.example.test#alice/password' });
        const p5ExtDirect = await dialogs.fillVaultField(
          { profileId: profExt.id, browserKey: KEY_EXT },
          { target: '#pw', spec: 'chanr29.example.test#alice/password', facts: { conversationKeys: [KEY_EXT] } },
        );
        // 5) Remote session (`TOK_REMSESS`)
        const p5RemSess = await runP5Probe(baseMed, TOK_REMSESS, { prepare: true, target: '#pw', spec: 'chanr29.example.test#alice/password' });

        // Positive control on the SAME real keeper (`profShop` attached -> mediated `scope` grant):
        const atShop2 = await keeper.attach({ profileId: profShop.id, browserKey: KEY_AGENT, sessionId: 'sess-c29a' });
        await dialogs.arm(profShop.id);
        dialogs.noteActiveTab({ profileId: profShop.id, browserKey: KEY_AGENT }, tid);
        const medCdp = await openCdpWs(WebSocket, atShop2.cdpUrl, tid);
        // B-518e (also — the read's neighbour): the in-flight read resolves on the leg's WORD (a flag on the document both worlds
        // share), never on a 120 ms page timer raced against the HTTP fill; a word that never comes resolves it after a bounded
        // count of ticks. It is IN FLIGHT upstream before the fill starts (the relay saw it), never a 20 ms sleep
        const medPollP = medCdp.evalInDom(
          'new Promise((r) => { let n = 0; const t = () => ((document.__r29GoPos || ++n > 600) ? r(document.querySelector("#otp")?.value || "") : setTimeout(t, 5)); t(); })',
          { awaitPromise: true },
        );
        const sentUp = (mark) => relay.state.upstreamCalls.some((c) => c.method === 'Runtime.evaluate' && String(c.params?.expression || '').includes(mark));
        const posInFlight = await until(() => sentUp('__r29GoPos'));
        const posFillRes = await fetch(`${baseMed}/api/agent/browser/fill-vault`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${TOK_EPH}` },
          body: JSON.stringify({ profile: profShop.id, target: '#otp', spec: 'chanr29.example.test#alice/otp' }),
        });
        const posFillJson = await posFillRes.json();
        { const rawGo = await openCdpWs(WebSocket, relay.wsUrl, tid); await rawGo.evalInDom('document.__r29GoPos = true'); rawGo.close(); }   // the word: the fill has returned
        const medPollReply = await medPollP;
        medCdp.close();

        // Reset shared `tid` DOM before running Probe #6 (`no-proxy`) so `#otp` starts empty (`rawVal === "|"`):
        fk.setDom(tid, {
          url: `${ORIGIN}/login`,
          elements: [
            { id: 'u', tag: 'input', type: 'email', name: 'Email' },
            { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
            { id: 'otp', tag: 'input', type: 'text', name: 'Code' },
          ],
        });

        // 6) `no-proxy` (`bareKeeper` with `mediator: null`) — Note: Rm.setup uses module-level state, so spin up after med probes!
        await bareKeeper.attach({ profileId: profBare.id, browserKey: KEY_BARE, sessionId: 'sess-bare' });
        const sessionsBare = new Map([
          ['sess-bare', { agentToken: TOK_BARE, _browserKey: KEY_BARE, _browserVariant: 'D', name: 'BareAgent', cwd: tmpRoot, backendSessionId: 'conv-bare' }],
        ]);
        Rm.setup({ keeper: bareKeeper, activeSessions: sessionsBare, dialogs: bareDialogs, logins, tasksForSession: () => [] });
        const appBare = express();
        appBare.use(express.json());
        appBare.use(Rm.router);
        srvBare = await new Promise((r) => { const s = appBare.listen(0, '127.0.0.1', () => r(s)); });
        const p5NoProxy = await runP5Probe(`http://127.0.0.1:${srvBare.address().port}`, TOK_BARE, {
          profile: profBare.id,
          target: '#pw',
          spec: 'chanr29.example.test#alice/password',
        });

        const unmediatedProbes = [p5Eph, p5Child, p5Remote, p5Ext, p5RemSess, p5NoProxy];
        const allRefusedCleanly = unmediatedProbes.every(
          (p) => p.status === 409 && p.code === 'login_channel_unmediated' && p.insDelta === 0 && p.rawVal === '|',
        )
          && p5RemoteDirect && p5RemoteDirect.ok === false && p5RemoteDirect.code === 'login_channel_unmediated'
          && p5ExtDirect && p5ExtDirect.ok === false && p5ExtDirect.code === 'login_channel_unmediated';
        const posControlOk = posInFlight && posFillRes.status === 200
          && posFillJson.ok === true
          && Boolean(medPollReply?.error && /login_fill_live/.test(String(medPollReply.error.message || '')))
          && !JSON.stringify(medPollReply).includes(OTP_VAL);

        ok(
          allRefusedCleanly && posControlOk,
          'R29-1f (Channel Law 1-6 real keeper P5 scene): concurrent raw-WS read + fill-vault across ephemeral, child-handle, paired-remote, external-cdp, remote-session, and no-proxy all refuse 409 login_channel_unmediated with 0 Input.insertText, while local mediated profile fills (200) and aborts concurrent mediated read with login_fill_live',
          { unmediatedProbes, posInFlight, posFillStatus: posFillRes.status, posFillJson, medPollReply },
        );
      } finally {
        if (srvBare) await new Promise((r) => srvBare.close(() => r()));
        if (srv) await new Promise((r) => srv.close(() => r()));
        try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
        dialogs.shutdown();
        bareDialogs.shutdown();
        for (const e of keeper.ephemerals()) await keeper.stop(e.profileId).catch(() => {});
        for (const p of keeper.list().profiles) await keeper.stop(p.id).catch(() => {});
        for (const p of bareKeeper.list().profiles) await bareKeeper.stop(p.id).catch(() => {});
        keeper.shutdown();
        bareKeeper.shutdown();
        vault.close();
        await med.shutdown();
        await relay.close();
        await fk.close();
        fakeAb.reap();
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // R29-2 — COMPULSORY 2: UNTOUCHED BROWSER SESSIONS = MASTER
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://untouched29.example.test';
      const PW_VAL = 'UntouchedPw!2026_R29';
      const dataDir = path.join(tmpRoot, 'data-r29-2');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      const fk = await startFakeKernel({
        firstUrl: `${ORIGIN}/login`,
        mode: { standard: true, omitFilledPassword: true },
      });
      const tidA = fk.targets()[0].targetId;
      const tidB = fk.addTarget(`${ORIGIN}/other`);
      fk.setDom(tidA, { url: `${ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      fk.setDom(tidB, { url: `${ORIGIN}/other`, elements: [{ id: 'txt', tag: 'input', type: 'text', name: 'Note', value: 'hello-B' }] });
      const relay = await startKernelRelay(fk);
      const med = CM.create({ log: quiet });
      await med.listen();

      const keeper = BK.create({
        dataDir,
        homeDir,
        env: () => ({ HOME: homeDir }),
        log: quiet,
        install: false,
        mediator: med,
      });
      const prof = keeper.createProfile({ label: 'UntouchedScope' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const KEY = 'bk-0000a292';
      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
      await vault.setup('r29-2-pass');
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, totpCode: () => ({ ok: false, code: 'no_totp' }), log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW_VAL }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async () => ({ ok: true, url: relay.wsUrl }),
        browserOf: () => ({ state: 'ready', wsEndpoint: relay.wsUrl, cdpPort: relay.port }),
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        holdersOf: () => [{ browserKey: KEY, sessionId: 's-u29', ephemeral: false }],
        leaseCountOf: () => 1,
        enableTimeoutMs: 1200,
        interceptTimeoutMs: 1200,
        log: quiet,
      });
      // Dm.create automatically wires keeper.mediator().setLoginFence(...)!

      try {
        await dialogs.arm(PID);
        const grantScope = await med.grantFor({
          profileId: PID,
          browserKey: KEY,
          upstream: relay.wsUrl,
          targetIds: [tidA, tidB],
          mode: 'scope',
        });
        const wsScope = await openCdpWs(WebSocket, grantScope.url, tidB);
        const attA = await wsScope.call('Target.attachToTarget', { targetId: tidA, flatten: false });
        const sidA = attA.result && attA.result.sessionId;
        // 1) Unfenced scope session: Target.sendMessageToTarget & sessionless Browser.getVersion MUST succeed (identical to master!)
        const wholeProfileRefused = (x) => Boolean(x && x.error && /^method_refused: Target\.sendMessageToTarget/.test(String(x.error.message || '')) && /WHOLE profile/.test(String(x.error.message || '')));
        const sendUnfenced = await wsScope.call('Target.sendMessageToTarget', { sessionId: wsScope.sid, message: '{"id":1,"method":"Runtime.enable"}' });
        const verUnfenced = await wsScope.call('Browser.getVersion', {});

        // 2) Fence Tab A via real fillVaultField -> sessionless Browser.getVersion, Tab B reads, AND Tab B Target.sendMessageToTarget MUST still succeed, while Tab A Target.sendMessageToTarget is refused login_fill_live!
        const fillA = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#pw', spec: 'untouched29.example.test#alice/password', targetId: tidA, facts: { conversationKeys: [KEY] } },
        );
        const verWhileAFenced = await wsScope.call('Browser.getVersion', {});
        const readBWhileAFenced = await wsScope.evalInDom('document.querySelector("#txt").value');
        const sendBWhileAFenced = await wsScope.call('Target.sendMessageToTarget', { sessionId: wsScope.sid, message: '{"id":2,"method":"Runtime.enable"}' });
        const sendAWhileAFenced = await wsScope.call('Target.sendMessageToTarget', { sessionId: sidA, message: '{"id":3,"method":"Runtime.evaluate"}' });
        wsScope.close();

        ok(
          // (lane chrome-157, the rebase onto 2.369.402: the release's WHOLE-PROFILE LAW refuses every wrapped Target.sendMessageToTarget on
          // both roads — method_refused, before any fence — so «untouched parity» is the master's answer itself: the fence changes no
          // answer of an unfenced tab, and the fenced tab's wrapped call is refused and carries nothing)
          wholeProfileRefused(sendUnfenced)
            && Boolean(verUnfenced && verUnfenced.result && !verUnfenced.error)
            && Boolean(fillA && fillA.ok === true)
            && Boolean(verWhileAFenced && verWhileAFenced.result && !verWhileAFenced.error)
            && readBWhileAFenced?.result?.result?.value === 'hello-B'
            && wholeProfileRefused(sendBWhileAFenced) && String(sendBWhileAFenced.error.message) === String(sendUnfenced.error.message).replace('"id":1', '"id":2')
            && Boolean(sendAWhileAFenced && sendAWhileAFenced.error && /login_fill_live|method_refused/.test(String(sendAWhileAFenced.error.message || ''))),
          'R29-2 (Compulsory 2 untouched parity): an unfenced wrapped Target.sendMessageToTarget gets the master\'s answer (the whole-profile law\'s method_refused) before and while Tab A is fenced, sessionless Browser.getVersion & Tab B reads stay 200, and Tab A\'s wrapped call is refused',
          { sendUnfenced, verUnfenced, fillA, verWhileAFenced, readBWhileAFenced, sendBWhileAFenced, sendAWhileAFenced },
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
    // R29-4 — ITEM 4: "VALUE HAS LEFT THE PAGE" (`wipeNode` change/blur + `P2c`/`P2e` re-injection)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const lfSrc = fs.readFileSync(path.join(repoDir, 'src/server/browser-login-fill.js'), 'utf8');
      const wipeDispatchesChangeAndBlur = /const notifyWipedNode\s*=/.test(lfSrc) && /new Event\('change'/.test(lfSrc) && /\.blur\s*\(\s*\)/.test(lfSrc);

      const ORIGIN = 'https://item4r29.example.test';
      const PW_VAL = 'ReinjectPw!2026_R29';
      const OTP_VAL = '739184';
      const dataDir = path.join(tmpRoot, 'data-r29-4');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      let clock = 1_765_200_000_000;

      const fk = await startFakeKernel({
        firstUrl: `${ORIGIN}/login`,
        mode: { standard: true, omitFilledPassword: true },
      });
      const tidPw = fk.targets()[0].targetId;
      const tidOtp = fk.addTarget(`${ORIGIN}/otp`);
      fk.setDom(tidPw, {
        url: `${ORIGIN}/login`,
        elements: [
          { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
          { id: 'go', tag: 'button', type: 'submit', name: 'Sign in' },
        ],
      });
      fk.setDom(tidOtp, {
        url: `${ORIGIN}/otp`,
        elements: [
          { id: 'otp', tag: 'input', type: 'text', name: 'Code' },
          { id: 'go', tag: 'button', type: 'submit', name: 'Verify' },
        ],
      });
      const relay = await startKernelRelay(fk);
      const med = CM.create({ log: quiet });
      await med.listen();

      const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), log: quiet, now: () => clock, install: false, mediator: med });
      const prof = keeper.createProfile({ label: 'Item4Prof' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const KEY = 'bk-0000a294';
      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      await vault.setup('r29-4-pass');
      const vtotp = VT.create({ dataDir, vault, now: () => clock });
      vtotp.addEntry({ name: 'otp4', seed: 'JBSWY3DPEHPK3PXP' });
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({
        vault,
        grants: () => grants,
        totpCode: () => ({ ok: true, code: OTP_VAL }),
        now: () => clock,
        log: quiet.log,
      });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW_VAL, totpName: 'otp4' }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async () => ({ ok: true, url: relay.wsUrl }),
        browserOf: () => ({ state: 'ready', wsEndpoint: relay.wsUrl, cdpPort: relay.port }),
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        holdersOf: () => [{ browserKey: KEY, sessionId: 's-r294', ephemeral: false }],
        leaseCountOf: () => 1,
        liveFillMaxMs: 60_000,   // B-518e: the REAL ceiling out of reach — the scenes start it on the clock handed in (P2c)
        enableTimeoutMs: 1200,
        interceptTimeoutMs: 1200,
        now: () => clock,
        log: quiet,
      });
      // Dm.create automatically wires keeper.mediator().setLoginFence(...)!

      try {
        await dialogs.arm(PID);
        const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: relay.wsUrl, targetIds: [tidPw, tidOtp], mode: 'scope' });

        // Scene P2c (ceiling expiry + site re-injecting 6-digit OTP 10ms after wipe!)
        const rawOtp = await openCdpWs(WebSocket, relay.wsUrl, tidOtp);
        // (B-518e: the page COUNTS its re-injection — the fact the read waits on — and re-injects only once the leg OPENS it (the
        // control reads in the window first); its ticks are bounded by a count far above the scene: only a broken run ticks long)
        await rawOtp.evalInDom(`(() => {
          const el = document.querySelector('#otp');
          let stashed = '';
          let n = 0;
          globalThis.__r29Reinjected = 0;
          globalThis.__r29Stashed = false;
          globalThis.__r29Open = false;
          const tick = () => {
            if (++n > 3000) return;
            if (el.value) { stashed = el.value; globalThis.__r29Stashed = true; }
            else if (stashed && globalThis.__r29Open) { setTimeout(() => { el.value = stashed; globalThis.__r29Reinjected += 1; }, 55); return; }
            setTimeout(tick, 10);
          };
          tick();
        })()`);
        const fOtp = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#otp', spec: 'item4r29.example.test#alice/otp', targetId: tidOtp, facts: { conversationKeys: [KEY] } },
        );
        // THE CEILING ON THE CLOCK HANDED IN (B-518e): the clock passes it and ONE look starts the same expireLiveFillCeiling its
        // timer would (that answer is thrown away: it is the fence while the wipe runs); the wipe LIFTS the fence and leaves its
        // guard — waited for by those two facts, never a 300 ms sleep
        // (the site must have SEEN the filled value before the wipe — the page says so — or it has nothing to put back: with the
        // ceiling started at once, a wipe inside the page's first tick left it nothing; the gate's red on 759214214, UTC zone)
        const stashedOf = async (raw) => Boolean((await raw.evalInDom('globalThis.__r29Stashed === true'))?.result?.result?.value);
        const p2cStashed = await until(() => stashedOf(rawOtp));
        clock += 60_001;
        dialogs.liveFillOnTarget(PID, tidOtp);
        const p2cLifted = await until(() => dialogs.liveFillOnTarget(PID, tidOtp) === null && dialogs.hasPostLiftGuard(PID, tidOtp));
        const medOtp = await openCdpWs(WebSocket, grant.url, tidOtp);
        // CONTROL — THE WINDOW the old sleep raced (the hosted red): the site has not re-injected yet, so the agent's read here is
        // NOT refused and reads an empty box — a read that lands before the re-injection cannot be the leg's verdict
        const readWindow = await medOtp.evalInDom('document.querySelector("#otp").value');
        const windowOpen = !readWindow?.error && readWindow?.result?.result?.value === '';
        await rawOtp.evalInDom('globalThis.__r29Open = true');
        // the site re-injects 55 ms after the word — the read waits for THAT re-injection (the page's own count); the agent's
        // read then catches it and `postLiftGuards` re-arm
        const reinjectedOf = async (raw) => Number((await raw.evalInDom('globalThis.__r29Reinjected || 0'))?.result?.result?.value || 0);
        const p2cBack = await until(async () => (await reinjectedOf(rawOtp)) >= 1);
        const readP2cOtp = await medOtp.evalInDom('document.querySelector("#otp").value');
        const p2cRearmed = dialogs.liveFillOnTarget(PID, tidOtp);
        medOtp.close();
        rawOtp.close();

        // Scene P2e (same-origin failed submit + site re-injecting password 55ms after wipe, then top-frame navigation lifts!)
        const rawPw = await openCdpWs(WebSocket, relay.wsUrl, tidPw);
        await rawPw.evalInDom(`(() => {
          const el = document.querySelector('#pw');
          let stashed = '';
          let n = 0;
          globalThis.__r29Reinjected = 0;
          globalThis.__r29Stashed = false;
          const tick = () => {
            if (++n > 3000) return;
            if (el.value) { stashed = el.value; globalThis.__r29Stashed = true; }
            else if (stashed) { setTimeout(() => { el.value = stashed; globalThis.__r29Reinjected += 1; }, 55); return; }
            setTimeout(tick, 10);
          };
          tick();
        })()`);
        // (the ceiling is out of reach: only the submit wipes `#pw` in this scene)
        const fPw = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#pw', spec: 'item4r29.example.test#alice/password', targetId: tidPw, facts: { conversationKeys: [KEY] } },
        );
        // A same-origin credential submit, the road the dialogs WATCH (B-518e, the read: two bare Network events reached no wipe —
        // only a request the Fetch domain paused is a credential request — so the 180 ms ceiling had been this scene's wipe):
        // the fake kernel pauses it, the dialogs mark it, its end wipes `#pw`
        const p2eStashed = await until(() => stashedOf(rawPw));   // (the site has seen the value before the submit's wipe)
        const p2eSubmit = await fk.simulateSubmitRequest(tidPw, {
          url: `${ORIGIN}/api/login`,
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          postData: `pw=${encodeURIComponent(PW_VAL)}`,
          resourceType: 'Fetch',
        });
        // `wipeAfterSameOriginSubmit` wipes `#pw` -> the site re-injects 55 ms later -> the agent's read finds it and `postLiftGuards`
        // re-arm — the read waits for the re-injection itself (the page's count), never a 550 ms sleep (B-518e)
        const p2eBack = await until(async () => (await reinjectedOf(rawPw)) >= 1);
        const medPw = await openCdpWs(WebSocket, grant.url, tidPw);
        const readP2ePw = await medPw.evalInDom('document.querySelector("#pw").value');
        const p2eRearmed = dialogs.liveFillOnTarget(PID, tidPw);

        // Top-frame navigation to `/dashboard` clears `postLiftGuards` and lifts fence cleanly!
        fk.setDom(tidPw, { url: `${ORIGIN}/dashboard`, elements: [{ id: 'ok', tag: 'div', text: 'Welcome' }] });
        relay.emitTargetEvent(tidPw, 'Page.frameNavigated', {
          frame: { id: tidPw, url: `${ORIGIN}/dashboard`, securityOrigin: ORIGIN },
        });
        // the lift is waited for by ITS facts — the fence AND the guards gone (only a navigation, a closed tab or a new address end
        // the guards; a ceiling lift keeps them) — never a 60 ms sleep (B-518e)
        const navLifted = await until(() => dialogs.liveFillOnTarget(PID, tidPw) === null && !dialogs.hasPostLiftGuard(PID, tidPw));
        const afterNavFence = dialogs.liveFillOnTarget(PID, tidPw);
        const readAfterNav = await medPw.call('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, medPw.sid);
        medPw.close();
        rawPw.close();

        ok(
          wipeDispatchesChangeAndBlur
            && p2cStashed && p2cLifted && windowOpen && p2cBack && p2eStashed && p2eSubmit?.action === 'continue' && p2eBack && navLifted
            && fOtp.ok === true
            && Boolean(p2cRearmed)
            && Boolean(readP2cOtp?.error && /login_fill_live/.test(String(readP2cOtp.error.message || '')))
            && !JSON.stringify(readP2cOtp).includes(OTP_VAL)
            && fPw.ok === true
            && Boolean(p2eRearmed)
            && Boolean(readP2ePw?.error && /login_fill_live/.test(String(readP2ePw.error.message || '')))
            && !JSON.stringify(readP2ePw).includes(PW_VAL)
            && afterNavFence === null
            && readAfterNav?.result?.result?.value === `${ORIGIN}/dashboard`,
          'R29-4 (Item 4 value has left the page): wipeNode dispatches change+blur, postLiftGuards re-arm login_fill_live on P2c (OTP ceiling re-inject) and P2e (password submit re-inject) with 0 secret leaks, and top-frame navigation lifts cleanly',
          { wipeDispatchesChangeAndBlur, p2cStashed, p2cLifted, windowOpen, readWindow, p2cBack, p2eStashed, p2eSubmit, p2eBack, navLifted, p2cRearmed, readP2cOtp, p2eRearmed, readP2ePw, afterNavFence, readAfterNav },
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
    // R29-5a — KILL ALL 4 SURVIVING READER-A MUTANTS (`M01`, `M02`, `M03`, `M10`)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://muta29.example.test';
      const PW_VAL = 'MutAPassword!2026_R29';
      const dataDir = path.join(tmpRoot, 'data-r29-5a');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      const fk = await startFakeKernel({
        firstUrl: `${ORIGIN}/login`,
        mode: { standard: true, omitFilledPassword: true },
      });
      const tid = fk.targets()[0].targetId;
      fk.setDom(tid, { url: `${ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      const relay = await startKernelRelay(fk);

      // M02 & M03 isolated reply-gate probes on real `cdp-mediator.js`
      const medIso = CM.create({ log: quiet });
      await medIso.listen();
      let isoLive = false;
      let isoEpoch = 0;
      let useEpochFn = true;
      medIso.setLoginFence({
        liveFillTarget: () => (isoLive ? { at: Date.now() } : null),
        fillEpochOf: () => (useEpochFn ? isoEpoch : 0),
      });
      const gIso = await medIso.grantFor({ profileId: 'bp-0000a502', browserKey: 'bk-0000a502', upstream: relay.wsUrl, targetIds: [tid], mode: 'scope' });
      const wsIso = await openCdpWs(WebSocket, gIso.url, tid);

      // M02: start Runtime.evaluate at (isoEpoch=0, isoLive=false); advance isoEpoch=1 (isoLive stays false) before upstream replies -> MUST refuse login_fill_live!
      relay.state.hook = (m, { sendToClient }) => {
        if (m.method === 'Runtime.evaluate' && m.params?.expression === '"M02_PROBE"') {
          isoEpoch = 1;
          setTimeout(() => {
            sendToClient({ id: m.id, sessionId: m.sessionId, result: { result: { type: 'string', value: 'M02_LEAK' } } });
          }, 15);
          return true;
        }
        if (m.method === 'Runtime.evaluate' && m.params?.expression === '"M03_PROBE"') {
          isoLive = true;
          setTimeout(() => {
            sendToClient({ id: m.id, sessionId: m.sessionId, result: { result: { type: 'string', value: 'M03_LEAK' } } });
          }, 15);
          return true;
        }
        return false;
      };
      const m02Res = await wsIso.call('Runtime.evaluate', { expression: '"M02_PROBE"', returnByValue: true }, wsIso.sid);

      // M03: keep fillEpoch constant (0), start Runtime.evaluate while isoLive=false, flip isoLive=true before upstream replies -> MUST refuse login_fill_live!
      useEpochFn = false;
      isoLive = false;
      const m03Res = await wsIso.call('Runtime.evaluate', { expression: '"M03_PROBE"', returnByValue: true }, wsIso.sid);
      relay.state.hook = null;
      wsIso.close();
      await medIso.shutdown();

      // M01 & M10 full `cdp-mediator` + `browser-dialogs` probes
      const med = CM.create({ log: quiet });
      await med.listen();
      const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), log: quiet, install: false, mediator: med });
      const prof = keeper.createProfile({ label: 'MutAProf' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const KEY = 'bk-0000a510';
      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
      await vault.setup('r29-5a-pass');
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({ vault, grants: () => grants, totpCode: () => ({ ok: false, code: 'no_totp' }), log: quiet.log });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW_VAL }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });
      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async () => ({ ok: true, url: relay.wsUrl }),
        browserOf: () => ({ state: 'ready', wsEndpoint: relay.wsUrl, cdpPort: relay.port }),
        mediator: () => med,
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        holdersOf: () => [{ browserKey: KEY, sessionId: 's-5a', ephemeral: false }],
        leaseCountOf: () => 1,
        enableTimeoutMs: 1200,
        interceptTimeoutMs: 1200,
        log: quiet,
      });
      // Dm.create automatically wires keeper.mediator().setLoginFence(...)!

      try {
        await dialogs.arm(PID);
        const gFull = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: relay.wsUrl, targetIds: [tid], mode: 'scope' });
        const wsFull = await openCdpWs(WebSocket, gFull.url, tid);

        // M10: Start pre-fill in-flight Runtime.evaluate (180ms), then run a pre-insert FAILING fill (`#missing_m10` -> target_not_found, so armLiveFillOnTab never runs!).
        // Entry `bumpFillEpoch` MUST cut off the in-flight read with `login_fill_live`!
        // (B-518e, also: the in-flight read resolves on the leg's WORD after the failing fill, never on a 180 ms page timer raced
        // against it; it is IN FLIGHT upstream before the fill starts — the relay saw it — never a 25 ms sleep)
        const inflightM10P = wsFull.evalInDom(
          'new Promise((r) => { let n = 0; const t = () => ((document.__r29GoM10 || ++n > 600) ? r("M10_SURVIVED") : setTimeout(t, 5)); t(); })',
          { awaitPromise: true },
        );
        const m10InFlight = await until(() => relay.state.upstreamCalls.some((c) => c.method === 'Runtime.evaluate' && String(c.params?.expression || '').includes('__r29GoM10')));
        const failFillM10 = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#missing_m10', spec: 'muta29.example.test#alice/password', targetId: tid, facts: { conversationKeys: [KEY] } },
        );
        { const rawGo = await openCdpWs(WebSocket, relay.wsUrl, tid); await rawGo.evalInDom('document.__r29GoM10 = true'); rawGo.close(); }   // the word: the fill has returned
        const m10Res = await inflightM10P;

        // M01: Arm fence on `tid`, then send inbound `Runtime.evaluate({ expression: '"M01_INBOUND_PROBE"' })` — MUST be refused on INBOUND (0 upstream forwarding to `relay`!)
        const okFill = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#pw', spec: 'muta29.example.test#alice/password', targetId: tid, facts: { conversationKeys: [KEY] } },
        );
        const upBeforeM01 = relay.state.upstreamCalls.filter((c) => c.method === 'Runtime.evaluate' && c.params?.expression === '"M01_INBOUND_PROBE"').length;
        const m01Res = await wsFull.call('Runtime.evaluate', { expression: '"M01_INBOUND_PROBE"', returnByValue: true }, wsFull.sid);
        const upAfterM01 = relay.state.upstreamCalls.filter((c) => c.method === 'Runtime.evaluate' && c.params?.expression === '"M01_INBOUND_PROBE"').length;
        wsFull.close();

        ok(
          Boolean(m01Res?.error && /login_fill_live/.test(String(m01Res.error.message || '')))
            && upAfterM01 - upBeforeM01 === 0
            && Boolean(m02Res?.error && /login_fill_live/.test(String(m02Res.error.message || '')))
            && !JSON.stringify(m02Res).includes('M02_LEAK')
            && Boolean(m03Res?.error && /login_fill_live/.test(String(m03Res.error.message || '')))
            && !JSON.stringify(m03Res).includes('M03_LEAK')
            && m10InFlight && failFillM10.ok === false && failFillM10.code === 'target_not_found'
            && Boolean(m10Res?.error && /login_fill_live/.test(String(m10Res.error.message || '')))
            && !JSON.stringify(m10Res).includes('M10_SURVIVED')
            && okFill.ok === true,
          'R29-5a (Reader A mutants M01, M02, M03, M10): inbound fence forwards 0 Runtime.evaluate calls upstream (M01), reply epoch & liveFill gates each refuse independently (M02, M03), and entry bumpFillEpoch aborts pre-fill in-flight reads even on pre-insert target_not_found (M10)',
          { upDeltaM01: upAfterM01 - upBeforeM01, m01Res, m02Res, m03Res, m10InFlight, failFillM10, m10Res },
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
    // R29-5b + R29-6 — KILL ALL 8 SURVIVING READER-B MUTANTS (`M2, M4, M5, M6, M8, M10, M11, M13`) + MINOR 1 (`429 code_paced`)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const ORIGIN = 'https://mutb29.example.test';
      const LONG_ALICE = 'AliceMutBLong!2026';
      const SHORT_BOB = 'Sh!7';
      const dataDir = path.join(tmpRoot, 'data-r29-5b');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      let clock = 1_765_300_000_000;

      const fk = await startFakeKernel({
        firstUrl: `${ORIGIN}/login`,
        mode: { standard: true, omitFilledPassword: true },
      });
      const tidLock = fk.targets()[0].targetId;
      const tidM10 = fk.addTarget(`${ORIGIN}/gen`);
      const tidM11 = fk.addTarget(`${ORIGIN}/abort`);
      const tidM13 = fk.addTarget(`${ORIGIN}/hold`);
      fk.setDom(tidLock, {
        url: `${ORIGIN}/login`,
        elements: [
          { id: 'echo', tag: 'div', text: '' },
          { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
        ],
      });
      fk.setDom(tidM10, {
        url: `${ORIGIN}/gen`,
        elements: [
          { id: 'huge', tag: 'textarea', name: 'Blob', value: 'x'.repeat(5200) },
          { id: 'pw', tag: 'input', type: 'password', name: 'New password' },
        ],
      });
      fk.setDom(tidM11, {
        url: `${ORIGIN}/abort`,
        elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }],
      });
      fk.setDom(tidM13, {
        url: `${ORIGIN}/hold`,
        elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }],
      });
      const relay = await startKernelRelay(fk);

      const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      await vault.setup('r29-5b-pass');
      const vtotp = VT.create({ dataDir, vault, now: () => clock });
      vtotp.addEntry({ name: 'mutb-2fa', seed: 'JBSWY3DPEHPK3PXP' });
      const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins = Lm.create({
        vault,
        grants: () => grants,
        totpCode: (n, o) => vtotp.codeForLogin(n, o),
        now: () => clock,
        log: quiet.log,
      });
      logins.addOwn({ origin: ORIGIN, username: 'alice', password: LONG_ALICE, totpName: 'mutb-2fa' }, { who: 'owner' });
      logins.addOwn({ origin: ORIGIN, username: 'bob', password: SHORT_BOB }, { who: 'owner' });
      logins.addOwn({ origin: ORIGIN, username: 'genuser', password: ['InitialGen', 'UserPw!1'].join('') }   /* a token-shaped stand-in is built at runtime from its pieces, never a literal */, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

      // R29-6: Minor Item 1 — 21st OTP fill in 1 min via real `vault-totp.js` (`code: 'paced'`) returns `code_paced` (HTTP 429), NOT `login_no_otp`!
      let r29_6_twentieth = null;
      for (let i = 0; i < 20; i++) {
        r29_6_twentieth = logins.resolveFill({
          tabOrigin: ORIGIN,
          inFrame: false,
          spec: 'mutb29.example.test#alice/otp',
          conv: 'conv-pace-r29',
          facts: { conversationKeys: ['conv-pace-r29'] },
          checkOnly: false,
        });
      }
      const r29_6_twentyFirst = logins.resolveFill({
        tabOrigin: ORIGIN,
        inFrame: false,
        spec: 'mutb29.example.test#alice/otp',
        conv: 'conv-pace-r29',
        facts: { conversationKeys: ['conv-pace-r29'] },
        checkOnly: false,
      });
      const routesSrc = fs.readFileSync(path.join(repoDir, 'src/routes/browser.js'), 'utf8');
      ok(
        Boolean(r29_6_twentieth && r29_6_twentieth.ok === true)
          && Boolean(r29_6_twentyFirst && r29_6_twentyFirst.ok === false && r29_6_twentyFirst.code === 'code_paced')
          && /code_paced:\s*429/.test(routesSrc),
        'R29-6 (Minor Item 1 OTP pace code): 21st OTP fill within 1 minute via real vault-totp.js returns 429 code_paced instead of 409 login_no_otp',
        { r29_6_twentyFirst },
      );

      // Reader B `M8`: stale `rollbackGenerate` with older `expectedRev` MUST NOT delete a newer `pending`!
      const gen1 = logins.resolveFill({
        tabOrigin: ORIGIN,
        inFrame: false,
        spec: 'mutb29.example.test#genuser/password',
        generate: true,
        facts: { conversationKeys: ['conv-m8'] },
        checkOnly: false,
      });
      const discard1 = logins.discardPending(gen1.name, { who: 'owner' });
      const gen2 = logins.resolveFill({
        tabOrigin: ORIGIN,
        inFrame: false,
        spec: 'mutb29.example.test#genuser/password',
        generate: true,
        facts: { conversationKeys: ['conv-m8'] },
        checkOnly: false,
      });
      gen1.rollbackGenerate(); // stale rollback from gen1's rev!
      const genEntryAfterM8 = (logins.list().entries || []).find((x) => x.user === 'genuser');
      logins.discardPending(gen2.name, { who: 'owner' });

      // Reader B `M2`, `M4`, `M5`, `M6`, `M10`, `M11`, `M13`
      let lastWatchWs = null;
      class HookedWebSocket extends WebSocket {
        constructor(url, opts) {
          super(url, opts);
          lastWatchWs = this;
        }
      }
      const med5b = CM.create({ log: quiet });
      await med5b.listen();
      const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), log: quiet, now: () => clock, install: false, mediator: med5b });
      const prof = keeper.createProfile({ label: 'MutBProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      const PID = prof.id;
      const KEY = 'bk-0000b500';
      let triggerM11CrossNavOnSave = false;
      let m11WatchSid = null;
      const keeperWrap = {
        ...keeper,
        cdpEndpointFor: async () => ({ ok: true, url: relay.wsUrl }),
        browserOf: () => ({ state: 'ready', wsEndpoint: relay.wsUrl, cdpPort: relay.port }),
        saveLoginFenceState: (pid, st) => {
          const r = keeper.saveLoginFenceState(pid, st);
          if (triggerM11CrossNavOnSave && st && Array.isArray(st.fences) && st.fences.some((f) => f.targetId === tidM11)) {
            triggerM11CrossNavOnSave = false;
            if (lastWatchWs && m11WatchSid) {
              lastWatchWs.emit('message', Buffer.from(JSON.stringify({
                method: 'Page.frameStartedNavigating',
                sessionId: m11WatchSid,
                params: { frameId: tidM11, url: 'https://evil.example.test/phish' },
              })));
            }
          }
          return r;
        },
      };
      const dialogs = Dm.create({
        keeper: keeperWrap,
        logins,
        holdersOf: () => [{ browserKey: KEY, sessionId: 's-5b', ephemeral: false }],
        leaseCountOf: () => 1,
        liveFillMaxMs: 60_000,
        wipeMaxScanPositions: 4000,
        WebSocketImpl: HookedWebSocket,
        enableTimeoutMs: 1200,
        interceptTimeoutMs: 1200,
        now: () => clock,
        log: quiet,
      });

      try {
        await dialogs.arm(PID);

        // `M10`: `--generate` on `tidM10` (which has 5,200 chars in `#huge` -> `tooMuchText: true` -> `wr = { ok: true, verifiedEmpty: false }`)
        // when `Input.insertText` returns a CDP error -> MUST keep `tidM10` fenced AND keep `genuser`'s `pending`!
        relay.state.hook = (m, { sendToClient }) => {
          if (m.method === 'Input.insertText') {
            sendToClient({ id: m.id, sessionId: m.sessionId, error: { code: -32000, message: 'synthetic insertText error' } });
            return true;
          }
          return false;
        };
        const resM10 = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#pw', spec: 'mutb29.example.test#genuser/password', generate: true, targetId: tidM10, facts: { conversationKeys: [KEY] } },
        );
        relay.state.hook = null;
        const m10StillFenced = Boolean(dialogs.liveFillOnTarget(PID, tidM10));
        const m10PendingKept = Boolean((logins.list().entries || []).find((x) => x.user === 'genuser')?.pending);
        logins.discardPending(`web-login:${ORIGIN}#genuser`, { who: 'owner' });

        // `M11`: synchronous `Page.frameStartedNavigating` right inside `onBeforeInsert` (`saveLoginFenceState`) before `guardBeforeInsert({ stage: 'before-insert' })`!
        // `attemptedInsert` is `false` (0 chars typed) -> `clearLiveFillOnTab` MUST clear `e.liveFill` so `tidM11` does NOT stay stuck unreadable!
        const attSetM11 = relay.state.attachedByTarget.get(tidM11);
        m11WatchSid = attSetM11 && attSetM11.size ? [...attSetM11][0].sessionId : null;
        triggerM11CrossNavOnSave = true;
        const resM11 = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#pw', spec: 'mutb29.example.test#alice/password', targetId: tidM11, facts: { conversationKeys: [KEY] } },
        );
        triggerM11CrossNavOnSave = false;
        const m11FenceCleared = dialogs.liveFillOnTarget(PID, tidM11) === null
          && !(keeper.loginFenceStateOf(PID).fences || []).some((f) => f.targetId === tidM11);

        // `M2`, `M4`, `M5`, `M6`:
        // On `tidLock`, fill `alice/password` (`LONG_ALICE` >= 8B -> in `scrubByProfile`, so `svs.length === 1`) AND `bob/password` (`SHORT_BOB` < 8B -> NOT in `scrubByProfile`!).
        // Evict `tidLock` from `LF` (`LF.clearFilledSecretsForTarget(tidLock)`) and `vault.lock()`!
        // Now `sigs` = `[sig(LONG_ALICE), sig(SHORT_BOB)]` (`sigs.length === 2 > 0`), `svs` = `[LONG_ALICE]` (`svs.length === 1 > 0`), and `wipeTabTypedInputs` returns `{ ok: true, verifiedEmpty: true }` even while `#echo` holds `Sh!7`!
        const fLockAlice = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#pw', spec: 'mutb29.example.test#alice/password', targetId: tidLock, facts: { conversationKeys: [KEY] } },
        );
        const fLockBob = await dialogs.fillVaultField(
          { profileId: PID, browserKey: KEY },
          { target: '#pw', spec: 'mutb29.example.test#bob/password', targetId: tidLock, facts: { conversationKeys: [KEY] } },
        );
        const rawLock = await openCdpWs(WebSocket, relay.wsUrl, tidLock);
        await rawLock.evalInDom(`(() => { document.querySelector('#echo').textContent = ${JSON.stringify(SHORT_BOB)}; })()`);
        rawLock.close();
        LF.clearFilledSecretsForTarget(tidLock);
        vault.lock();

        // B-518e: a step's decision is waited for by its FACT — the fence's RECORD (what the keeper keeps; reading it starts no
        // check) leaves the word it had just before the step, or the fence is gone — never a fixed sleep
        const holdOf = (tid) => { const f = (keeper.loginFenceStateOf(PID).fences || []).find((x) => x.targetId === tid); return f ? String(f.hold || '') : 'gone'; };
        const m2m4Before = holdOf(tidLock);
        // CONTROL — the old 350 ms read point: a read taken at the first Runtime call after the submit begins (the relay's hook —
        // before the wipe has decided) finds the fence HELD and the record undecided: the old verdict («held») is green on nothing
        // there; the leg waits for the decision and judges its word
        const prevHook = relay.state.hook;
        let inWipe = null;
        relay.state.hook = async (m, x) => {
          if (!inWipe && m && /^Runtime\./.test(String(m.method || ''))) inWipe = { method: String(m.method), word: holdOf(tidLock), held: Boolean(dialogs.liveFillOnTarget(PID, tidLock)) };
          return typeof prevHook === 'function' ? prevHook(m, x) : undefined;
        };
        // Trigger `M4` (`wipeAfterSameOriginSubmit` while locked with `sigs.length === 2` & `svs.length === 1`):
        await fk.simulateSubmitRequest(tidLock, {
          url: `${ORIGIN}/api/login`,
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          postData: `pw=${encodeURIComponent(LONG_ALICE)}`,
          resourceType: 'Fetch',
        });
        const m2m4Decided = m2m4Before !== 'gone' && await until(() => holdOf(tidLock) !== m2m4Before);
        relay.state.hook = prevHook;
        const m2m4After = holdOf(tidLock);
        const m2m4Window = Boolean(inWipe && inWipe.word === m2m4Before && inWipe.held === true);
        const m2m4Held = Boolean(dialogs.liveFillOnTarget(PID, tidLock));

        // Dedicated `M5` probe (`expireLiveFillCeiling` timer firing while in-memory targets are missing):
        await vault.unlock('r29-5b-pass');
        dialogs.shutdown();
        const dialogsM5 = Dm.create({
          keeper: keeperWrap,
          logins,
          holdersOf: () => [{ browserKey: KEY, sessionId: 's-5b', ephemeral: false }],
          leaseCountOf: () => 1,
          liveFillMaxMs: 60_000,   // B-518e: the REAL timer out of reach — the ceiling starts on the clock handed in
          enableTimeoutMs: 1200,
          interceptTimeoutMs: 1200,
          now: () => clock,
          log: quiet,
        });
        let m5Held = false, m5Decided = false, m5Before = '', m5After = '';
        try {
          keeper.saveLoginFenceState(PID, { fences: [], scrubs: [] });
          await dialogsM5.arm(PID);
          await dialogsM5.fillVaultField(
            { profileId: PID, browserKey: KEY },
            { target: '#pw', spec: 'mutb29.example.test#alice/password', targetId: tidLock, facts: { conversationKeys: [KEY] } },
          );
          await dialogsM5.fillVaultField(
            { profileId: PID, browserKey: KEY },
            { target: '#pw', spec: 'mutb29.example.test#bob/password', targetId: tidLock, facts: { conversationKeys: [KEY] } },
          );
          LF.clearFilledSecretsForTarget(tidLock);
          vault.lock();
          m5Before = holdOf(tidLock);
          clock += 60_001;
          // the ceiling's `expireLiveFillCeiling` runs while in-memory targets are missing! — started on the clock handed in by ONE
          // look (the same function its timer calls; that answer is thrown away), and waited for by the record leaving its word
          // (read from the keeper), never a 240 ms sleep against a 140 ms timer that began before the inserts
          dialogsM5.liveFillOnTarget(PID, tidLock);
          m5Decided = m5Before !== 'gone' && await until(() => holdOf(tidLock) !== m5Before);
          m5After = holdOf(tidLock);
          m5Held = Boolean(dialogsM5.liveFillOnTarget(PID, tidLock));
        } finally {
          dialogsM5.shutdown();
        }

        ok(
          Boolean(genEntryAfterM8 && genEntryAfterM8.pending === 'change' && genEntryAfterM8.rev === gen2.rev)
            && resM10.ok === false && m10StillFenced && m10PendingKept
            && resM11.ok === false && resM11.code === 'login_phishing' && m11FenceCleared
            && fLockAlice.ok === true && fLockBob.ok === true
            && m2m4Window && m2m4Decided && m2m4After === 'unknown_typed' && m2m4Held && m5Decided && m5After === 'unknown_typed' && m5Held,
          'R29-5b (Reader B in-memory mutants M2, M4, M5, M8, M10, M11): missing in-memory targets hold across submit/ceiling (M2, M4, M5), stale-rev rollback preserves newer pending (M8), unconfirmed-empty post-insert error keeps fence+pending (M10), and pre-insert abort clears armed fence (M11)',
          { genEntryAfterM8, resM10, m10StillFenced, m10PendingKept, resM11, m11FenceCleared, m2m4Before, inWipe, m2m4After, m2m4Decided, m2m4Held, m5Before, m5After, m5Decided, m5Held },
        );
      } finally {
        try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
        dialogs.shutdown();
        keeper.shutdown();
        vault.close();
        await med5b.shutdown();
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
  await runR29LoginNails({ repoDir, ok: okCli });
  console.log(`=== R29 NAILS SUMMARY: ${pass}/${pass + fail} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
