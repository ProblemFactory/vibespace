#!/usr/bin/env node
/**
 * Round 32 (`vault-login` Shape S + `fixups-r32` #1, #2, #4, #5) exhaustive generated table & regression nails:
 *   - Leg 1 (`R32-Del`): Deletion & truthful-words census — deleted post-restart Vault-hydration symbols no longer
 *     exist anywhere in the repository; `hydratePersistedScrubs` is the sole restore helper touching `logins`; zero
 *     login/fence/guard refusal sentences claim `"the owner has already been told"` without `blocked()`.
 *   - Leg 2 (`R32-Table`): Generated 6-axis exhaustive table:
 *       `fence (none / live / postLiftHeld / unknown)`
 *       × `guards (0 / 1 / 2)`
 *       × `check (mem / throw)`
 *       × `page (clean / putback)`
 *       × `url (same / moved / moved_between)`
 *       × `conn (connected / same_proc_reconnect / hub_restart)`
 *     Expected verdict for every cell is computed by the short law-based pure function `expectedVerdictForCell`
 *     below (never hand-listed per cell), impossible world states are pruned by name with counts printed, and every
 *     surviving cell is driven through the real engine (`fake-kernel` + `relay` + `cdp-mediator` + `browser-keeper`
 *     + `vault-engine` + `browser-logins` + `browser-dialogs` + `routes/browser`).
 *   - Leg 3 (`R32-Stash`): Same-process RAM stash & browser identity laws — 0 login identity on disk; stash returned
 *     ONLY to the exact same browser instance (`DEVTOOLS_ID` UUID + `keeper.browserOf` PID/starttime), never applied
 *     to a replacement browser; dropped immediately on `disarm`, `removeProfile`, `dropLeaseTabs`, and `shutdown()`;
 *     stale persisted fences dropped on `url-changed` across cold Hub restart.
 *   - Leg 4 (`R32-Doors`): Both exit doors work live on a Shape S fenced tab (`tab new` / `tab <other>` and `reload`
 *     / navigation), while cross-origin requests from the fenced tab are blocked until reload/navigation.
 *   - Leg 5 (`R32-NavSeq`): `fixups-r32` Law 5 — in-flight `recheckPostLiftOnTab` held across `Page.frameNavigated`
 *     never false-fences a reloaded clean document and never hands a stale `{ ok: true }` to a new document's guard.
 *   - Leg 6 (`R32-Compat`): Bidirectional disk compatibility (legacy `{ fences, guards }` -> Shape S fenced; `.399`
 *     `4d63ec1b4` release `normalizeRegistry` driven with Shape S record) + door-level `catch` fail-closed defense.
 *   - Exported `runR32Mutants`: `M1` (`mutate31.py`), `M3` (`mutate31.py`), and `M3b` (sibling-guard clear on retire)
 *     all RED on the table's cells & pure law oracle.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_PATH = fileURLToPath(import.meta.url);
const quiet = { log() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// lane chrome-157 (the round-32 take-over): NO PLANTED VALUE IN A FAILURE TEXT. Every value this file types is `Xx6!y1`-shaped (or the
// vault's own password); a failing cell's detail carries the doors' answers, so a LEAK would print the very bytes it caught. Both
// entry points hand their `ok` a scrubbed detail: each planted value becomes «a typed value», by the file's own text (a value added
// later is covered without a list to keep).
const PLANTED = [...new Set([...fs.readFileSync(SELF_PATH, 'utf8').matchAll(/'([A-Z][a-z]6![a-z]\d)'/g)].map((m) => m[1]).concat(['r32-table-vault-pw']))];
const PLANTED_RE = new RegExp(PLANTED.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const scrubText = (s) => String(s).replace(PLANTED_RE, '«a typed value»');
const scrubbedOk = (ok) => (c, label, detail) => ok(c, scrubText(label), detail === undefined ? undefined : scrubText(JSON.stringify(detail)));

// ── Law-based pure oracle (`go-shape-s.md` + `fixups-r32.md` #1/#2/#4/#5) ───────────────────────────────────────────
export function expectedVerdictForCell({ fence, guards, check, page, url, conn }) {
  const activeGuards = url === 'same' ? guards : (url === 'moved_between' ? 1 : 0);
  // Stated SPA rule (`fixups-r32` §"记录在案"): a guard protects ONLY its `urlAtFill`; once an unfenced tab
  // moves URL within the document (`activeGuards === 0 && guards > 0`), a `<8B` value put back at the new URL is readable.
  const readableAtMovedUrl = fence === 'none' && guards > 0 && activeGuards === 0 && page === 'putback';
  // Law S1 (Shape S): Hub restart ends all rechecks; any tab with a fence or active guard at stop time fences until top-frame nav.
  if (conn === 'hub_restart') {
    if (fence !== 'none' || activeGuards > 0) {
      return { status: 409, code: 'login_fill_live', flavor: 'until_nav', readableAtMovedUrl: false };
    }
    return { status: 200, code: null, flavor: 'allow', readableAtMovedUrl };
  }
  // Law S2: Same-process reconnect restores RAM stash to the same browser, obeying identical in-memory laws as `connected`.
  if (fence === 'live') return { status: 409, code: 'login_fill_live', flavor: 'live', readableAtMovedUrl: false };
  if (fence === 'unknown') return { status: 409, code: 'login_fill_live', flavor: 'until_nav', readableAtMovedUrl: false };
  // Law 1: Guard retirement is NOT a check — `postLiftHeld` stays `until_nav` when activeGuards === 0.
  if (activeGuards === 0) {
    return fence === 'postLiftHeld'
      ? { status: 409, code: 'login_fill_live', flavor: 'until_nav', readableAtMovedUrl: false }
      : { status: 200, code: null, flavor: 'allow', readableAtMovedUrl };
  }
  // Law 4: Uncheckable != empty — throwing check fails closed (`login_check_failed`) on both doors; next read rechecks.
  if (check === 'throw') return { status: 409, code: 'login_check_failed', flavor: 'check_failed', readableAtMovedUrl: false };
  if (page === 'putback') return { status: 409, code: 'login_fill_live', flavor: 'rearmed', readableAtMovedUrl: false };
  return { status: 200, code: null, flavor: 'allow', readableAtMovedUrl: false };
}

export function generateR32Table() {
  const FENCES = ['none', 'live', 'postLiftHeld', 'unknown'];
  const GUARDS = [0, 1, 2];
  const CHECKS = ['mem', 'throw'];
  const PAGES = ['clean', 'putback'];
  const URLS = ['same', 'moved', 'moved_between'];
  const CONNS = ['connected', 'same_proc_reconnect', 'hub_restart'];
  const cells = [];
  const pruned = {};
  const prune = (why) => { pruned[why] = (pruned[why] || 0) + 1; };
  let generated = 0;

  for (const fence of FENCES) {
    for (const guards of GUARDS) {
      for (const check of CHECKS) {
        for (const page of PAGES) {
          for (const url of URLS) {
            for (const conn of CONNS) {
              generated++;
              if (fence === 'postLiftHeld' && guards === 0) { prune('postLiftHeld_requires_guard'); continue; }
              if (url === 'moved_between' && guards !== 2) { prune('moved_between_requires_two_guards'); continue; }
              if (fence === 'live' && url === 'moved') { prune('live_fence_lifts_on_same_doc_nav'); continue; }
              if (fence === 'none' && guards === 0 && page === 'putback') { prune('unfilled_tab_cannot_putback'); continue; }
              const id = `${fence}|g${guards}|${check}|${page}|${url}|${conn}`;
              cells.push({ id, fence, guards, check, page, url, conn, expected: expectedVerdictForCell({ fence, guards, check, page, url, conn }) });
            }
          }
        }
      }
    }
  }
  const prunedCount = Object.values(pruned).reduce((a, b) => a + b, 0);
  return { generated, prunedCount, pruned, cells };
}

// ── Shared test world helpers ────────────────────────────────────────────────────────────────────────────────────────
async function startKernelRelay(WebSocket, WebSocketServer, fk, initialUuid = '11111111-2222-4333-8444-555555555555') {
  const state = {
    uuid: initialUuid,
    hook: null,
    watchSenders: new Set(),
  };
  let relayPort = 0;
  const relayHttp = http.createServer((rq, res) => {
    http.get({ host: '127.0.0.1', port: fk.port, path: rq.url }, (upRes) => {
      let body = '';
      upRes.setEncoding('utf8');
      upRes.on('data', (d) => { body += d; });
      upRes.on('end', () => {
        res.writeHead(upRes.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(body.replaceAll(`127.0.0.1:${fk.port}`, `127.0.0.1:${relayPort}`));
      });
    }).on('error', () => { res.writeHead(502); res.end(); });
  });
  const wss = new WebSocketServer({ noServer: true });
  relayHttp.on('upgrade', (rq, sock, head) => {
    const upWs = new WebSocket(`ws://127.0.0.1:${fk.port}/devtools/browser/fake-kernel`);
    upWs.setMaxListeners(0);
    upWs.once('open', () => {
      wss.handleUpgrade(rq, sock, head, (clientWs) => {
        clientWs.setMaxListeners(0);
        const sendToClient = (obj) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            try { clientWs.send(JSON.stringify(obj)); } catch { /* gone */ }
          }
        };
        const sessionsOnConn = new Map();
        const pendingAttach = new Map();
        const senderEntry = { clientWs, sendToClient, sessionsOnConn };
        state.watchSenders.add(senderEntry);
        upWs.on('message', (raw) => {
          const s = String(raw);
          try {
            const m = JSON.parse(s);
            if (m && m.id != null && pendingAttach.has(m.id)) {
              const reqTid = pendingAttach.get(m.id);
              pendingAttach.delete(m.id);
              if (m.result && m.result.sessionId) sessionsOnConn.set(reqTid, String(m.result.sessionId));
            }
          } catch { /* */ }
          if (clientWs.readyState === WebSocket.OPEN) {
            try { clientWs.send(s); } catch { /* gone */ }
          }
        });
        upWs.on('close', () => { state.watchSenders.delete(senderEntry); try { clientWs.close(); } catch { /* */ } });
        clientWs.on('message', async (raw) => {
          const text = String(raw);
          let msg = null;
          try { msg = JSON.parse(text); } catch { /* */ }
          if (msg && msg.sessionId && msg.params && msg.params.frameId) {
            sessionsOnConn.set(String(msg.params.frameId), String(msg.sessionId));
          }
          if (msg && msg.method === 'Target.attachToTarget' && msg.params && msg.params.targetId && msg.id != null) {
            pendingAttach.set(msg.id, String(msg.params.targetId));
          }
          if (state.hook && msg) {
            const handled = await state.hook(msg, { sendToClient, upWs, sessionsOnConn });   // (lane chrome-157: + which session is which tab on this connection)
            if (handled === true) return;
          }
          if (upWs.readyState === WebSocket.OPEN) {
            try { upWs.send(text); } catch { /* gone */ }
          }
        });
        clientWs.on('close', () => { state.watchSenders.delete(senderEntry); try { upWs.close(); } catch { /* */ } });
      });
    });
    upWs.on('error', () => { try { sock.destroy(); } catch { /* */ } });
  });
  await new Promise((r) => relayHttp.listen(0, '127.0.0.1', r));
  relayPort = relayHttp.address().port;
  return {
    port: relayPort,
    wsUrl: () => `ws://127.0.0.1:${relayPort}/devtools/browser/${state.uuid}`,
    state,
    emitTargetEvent(targetId, method, params) {
      for (const entry of state.watchSenders) {
        const sid = entry.sessionsOnConn.get(String(targetId));
        if (sid) entry.sendToClient({ method, params, sessionId: sid });
      }
    },
    dropSockets() {
      for (const c of wss.clients) { try { c.terminate(); } catch { /* */ } }
    },
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
  ws.on('message', (raw) => {
    let m = null;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const fn = pending.get(m.id);
      pending.delete(m.id);
      fn(m);
    }
  });
  const call = (method, params = {}, sessionId = undefined, timeoutMs = 2000) => new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); resolve({ id, timeout: true }); }, timeoutMs);
    if (timer.unref) timer.unref();
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    const payload = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    try { ws.send(JSON.stringify(payload)); } catch (e) { clearTimeout(timer); pending.delete(id); resolve({ id, error: { message: String(e) } }); }
  });
  const readPw = async (targetId) => {
    const att = await call('Target.attachToTarget', { targetId, flatten: true });
    const sid = att.result?.sessionId;
    if (!sid) return { ok: false, error: String(att.error?.message || 'no_session') };
    const iw = await call('Page.createIsolatedWorld', { frameId: targetId, worldName: 'r32_oracle' }, sid);
    if (iw.error || iw.timeout) {
      await call('Target.detachFromTarget', { sessionId: sid }).catch(() => {});
      return { ok: false, error: String(iw.error?.message || 'isolated_world_timeout') };
    }
    const r = await call('Runtime.evaluate', {
      expression: 'document.querySelector("#pw") ? document.querySelector("#pw").value : ""',
      contextId: iw.result?.executionContextId,
      returnByValue: true,
    }, sid);
    await call('Target.detachFromTarget', { sessionId: sid }).catch(() => {});
    if (r.error || r.timeout) return { ok: false, error: String(r.error?.message || 'eval_timeout') };
    return { ok: true, value: String(r.result?.result?.value ?? '') };
  };
  const writePw = async (targetId, val) => {
    const att = await call('Target.attachToTarget', { targetId, flatten: true });
    const sid = att.result?.sessionId;
    const iw = await call('Page.createIsolatedWorld', { frameId: targetId, worldName: 'r32_page' }, sid);
    await call('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector('#pw'); if (el) el.value = ${JSON.stringify(val)}; return 1; })()`,
      contextId: iw.result?.executionContextId,
      returnByValue: true,
    }, sid);
    await call('Target.detachFromTarget', { sessionId: sid }).catch(() => {});
  };
  return { ws, call, readPw, writePw, close() { try { ws.close(); } catch { /* */ } } };
}

const TWO_DOORS_RE = /reload or navigate this tab[\s\S]*open or switch to another tab/i;
const CROSS_ORIGIN_RE = /cross-origin requests from this page are blocked/i;

function matchesExpected(actual, expected, secrets) {
  const rawBlob = JSON.stringify(actual);
  const leaked = secrets.some((s) => rawBlob.includes(s));
  if (expected.readableAtMovedUrl) {
    return actual.resolveStatus === 200 && actual.med.ok === true && leaked === true;
  }
  if (leaked) return false;
  if (actual.resolveStatus !== expected.status) return false;
  if (expected.status === 200) {
    return actual.med.ok === true;
  }
  if (actual.resolveCode !== expected.code) return false;
  if (actual.med.ok !== false) return false;
  if (!actual.med.error.includes(expected.code)) return false;
  if (expected.flavor === 'until_nav') {
    if (!TWO_DOORS_RE.test(actual.resolveError) || !CROSS_ORIGIN_RE.test(actual.resolveError)) return false;
    if (!TWO_DOORS_RE.test(actual.med.error) || !CROSS_ORIGIN_RE.test(actual.med.error)) return false;
  }
  if (expected.flavor === 'check_failed') {
    if (!actual.followUpOk) return false;
  }
  return true;
}

/** Execute an array of table cells against a given `Dm` (`browser-dialogs`) + repo modules. */
export async function executeCellSet(cellsToRun, mods) {   // (exported: a slice of the table can be driven alone)
  const { express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, Dm, CM, Rm, startFakeKernel } = mods;
  const ORIGIN = 'https://r32table.example.test';
  const U0 = `${ORIGIN}/login`;
  const U1 = `${ORIGIN}/login/step2`;
  // All `< 8`-byte secrets so output masking never hides a real fence/guard leak!
  const PW_A = 'Pw6!a1';
  const PW_B = 'Pw6!b2';
  const PW_C = 'Pw6!c3';
  const PW_U = 'Pw6!u4';
  const ALL_SECRETS = [PW_A, PW_B, PW_C, PW_U];
  const VPW = 'r32-table-vault-pw';
  const KEY = 'bk-000032aa';
  const SID = 'sess-r32-table';
  const TOKEN = 'vsst_r32_tbl_' + crypto.randomBytes(8).toString('hex');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r32-tbl-'));
  const dataDir = path.join(tmpRoot, 'd');
  const homeDir = path.join(tmpRoot, 'h');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
  let clock = 1_767_000_000_000;

  const DOM = (url, val = '') => ({
    url,
    elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password', ...(val ? { value: val } : {}) }],
  });

  const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/seed`, mode: { standard: true, omitFilledPassword: true } });
  const relay = await startKernelRelay(WebSocket, WebSocketServer, fk);
  const rawWs = await openCdpClient(WebSocket, fk.wsUrl);

  const throwBudget = new Map();
  const origWipe = LF.wipeTabTypedInputs;
  LF.wipeTabTypedInputs = (opts, ...rest) => {
    const tid = opts && opts.targetId ? String(opts.targetId) : '';
    const left = tid ? (throwBudget.get(tid) || 0) : 0;
    if (left > 0) {
      if (left <= 1) throwBudget.delete(tid);
      else throwBudget.set(tid, left - 1);
      throw new Error('r32 injected sync check throw');
    }
    return origWipe(opts, ...rest);
  };

  const results = [];
  let med1 = null, med2 = null, srv1 = null, srv2 = null, dialogs1 = null, dialogs2 = null, keeper1 = null, keeper2 = null, vault1 = null, vault2 = null;

  try {
    med1 = CM.create({ log: quiet });
    await med1.listen();
    keeper1 = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med1 });
    vault1 = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
    await vault1.setup(VPW);
    const grants1 = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
    const logins1 = Lm.create({ vault: vault1, grants: () => grants1, now: () => clock, log: quiet.log });
    logins1.addOwn({ origin: ORIGIN, username: 'alice', password: PW_A }, { who: 'owner' });
    logins1.addOwn({ origin: ORIGIN, username: 'bob', password: PW_B }, { who: 'owner' });
    logins1.addOwn({ origin: ORIGIN, username: 'carol', password: PW_C }, { who: 'owner' });
    const unkEntry = logins1.addOwn({ origin: ORIGIN, username: 'unk', password: PW_U }, { who: 'owner' });
    const unkEntryName = unkEntry?.entry?.name || `web-login:${ORIGIN}#unk`;
    grants1.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

    // Partition cells by `conn`, with <= 24 tabs per profile (under the 32-tab per-profile cap).
    const profileBuckets = [];
    for (const conn of ['connected', 'same_proc_reconnect', 'hub_restart']) {
      const sub = cellsToRun.filter((c) => c.conn === conn);
      for (let i = 0; i < sub.length; i += 24) {
        profileBuckets.push({ conn, cells: sub.slice(i, i + 24), pid: null, prof: null, grantUrl: null });
      }
    }

    const bucketByPid = new Map();
    for (let bi = 0; bi < profileBuckets.length; bi++) {
      const b = profileBuckets[bi];
      const prof = keeper1.createProfile({ label: `R32_${b.conn}_${bi}`, sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      b.pid = prof.id;
      b.prof = prof;
      b.tids = [];
      for (const cell of b.cells) {
        const tid = fk.addTarget(U0);
        fk.setDom(tid, DOM(U0));
        cell.tid = tid;
        cell.pid = prof.id;
        b.tids.push(tid);
      }
      const g = await med1.grantFor({ profileId: prof.id, browserKey: KEY, upstream: relay.wsUrl(), targetIds: b.tids, mode: 'scope' });
      b.grantUrl = g.url;
      bucketByPid.set(prof.id, b);
    }

    const wrapKeeper = (k, medRef) => ({
      ...k,
      cdpEndpointFor: async (id) => (bucketByPid.has(id) ? { ok: true, url: relay.wsUrl() } : { ok: false }),
      leasesFor: () => [...bucketByPid.keys()].map((pid) => ({ profileId: pid, browserKey: KEY, sessionId: SID })),
      statusFor: () => ({ ephemeral: null, pin: profileBuckets[0]?.pid || null, leases: [...bucketByPid.keys()].map((pid, idx) => ({ profileId: pid, alias: `p${idx}`, isDefault: idx === 0 })) }),
      setFor: () => ({ defaultId: profileBuckets[0]?.pid || null, attachments: [...bucketByPid.values()].map((b, idx) => ({ profileId: b.pid, alias: `p${idx}`, label: b.prof.label, isDefault: idx === 0 })), handles: [...bucketByPid.keys()].map((_, idx) => `p${idx}`) }),
      resolveFor: (a = {}) => {
        // lane chrome-157 (the take-over): the route calls `resolveFor({ browserKey, handle, subagent, verb })` — ONE object, the handle
        // naming the attachment. The stand-in read a second argument nobody passes, so every cell's /resolve judged the FIRST bucket's
        // profile (the 207 red cells on 3a4d3982c + the builder's bytes); the posts now send the cell's profile as its handle.
        const want = a && a.handle ? String(a.handle) : (profileBuckets[0]?.pid || '');
        const b = bucketByPid.get(want) || profileBuckets[0];
        return { ok: true, kind: 'attachment', handle: b.pid, attachment: { profileId: b.pid, alias: b.pid, isDefault: true }, handles: [b.pid], isDefault: true };
      },
      attach: async (a = {}) => {
        const pid = a.profileId || a.ref || profileBuckets[0]?.pid;
        const b = bucketByPid.get(pid) || profileBuckets[0];
        const gUrl = medRef === med2 ? b.grantUrl2 : b.grantUrl;
        return { ok: true, profile: b.prof, browser: { state: 'ready' }, lease: { profileId: b.pid, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: gUrl, env: [`AGENT_BROWSER_CDP=${gUrl}`], pinTab: false, others: 0 };
      },
    });

    const keeperWrap1 = wrapKeeper(keeper1, med1);
    dialogs1 = Dm.create({
      keeper: keeperWrap1,
      logins: logins1,
      now: () => clock,
      holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
      leaseCountOf: () => 1,
      conversationOf: () => ({ cid: 'conv-r32-tbl', name: 'Agent R32' }),
      log: quiet,
    });
    const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent R32', cwd: tmpRoot, backendSessionId: 'conv-r32-tbl' }]]);
    Rm.setup({ keeper: keeperWrap1, activeSessions: sessions, dialogs: dialogs1, logins: logins1, tasksForSession: () => [] });
    const app1 = express();
    app1.use(express.json());
    app1.use(Rm.router);
    srv1 = await new Promise((r) => { const s = app1.listen(0, '127.0.0.1', () => r(s)); });
    let apiBase = `http://127.0.0.1:${srv1.address().port}`;

    const post = async (u, body) => {
      const r = await fetch(apiBase + u, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(body),
      });
      return { status: r.status, json: await r.json() };
    };

    const secretForCell = (c) => (c.guards === 2 ? PW_B : (c.guards === 1 ? PW_A : (c.fence === 'live' ? PW_C : PW_U)));

    const fillUserOnCells = async (subset, user) => {
      for (const c of subset) {
        dialogs1.noteActiveTab?.({ profileId: c.pid, browserKey: KEY }, c.tid);
        const r = await post('/api/agent/browser/fill-vault', {
          profile: c.pid,
          target: '#pw',
          spec: `r32table.example.test#${user}/password`,
          targetId: c.tid,
        });
        if (r.status !== 200) throw new Error(`setup fill failed on ${c.id} (${user}): ${r.status} ${JSON.stringify(r.json)}`);
      }
    };

    const liftViaCeiling = async (subset) => {
      if (!subset.length) return;
      clock += 16 * 60_000;
      for (const c of subset) dialogs1.liveFillOnTarget(c.pid, c.tid);
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        if (subset.every((c) => !dialogs1.liveFillOnTarget(c.pid, c.tid))) break;
        await sleep(12);
      }
      await sleep(50); // let 35ms postLiftTimer settle cleanly
    };

    const pushStateToU1 = async (subset) => {
      for (const c of subset) {
        const curVal = fk.readDomValues(c.tid).pw || '';
        fk.setDom(c.tid, DOM(U1, curVal));
        relay.emitTargetEvent(c.tid, 'Page.navigatedWithinDocument', { frameId: c.tid, url: U1 });
      }
      if (subset.length) await sleep(20);
    };

    // Setup one `<= 24`-tab profile bucket at a time so `LF`'s 64-target LRU map is never overflowed across unrelated buckets!
    const setupBucket = async (b) => {
      await dialogs1.arm(b.pid);
      for (const tid of b.tids) dialogs1.bindTab?.({ profileId: b.pid, browserKey: KEY }, tid);

      const guard1Cells = b.cells.filter((c) => c.guards >= 1);
      await fillUserOnCells(guard1Cells, 'alice');
      await liftViaCeiling(guard1Cells);

      await pushStateToU1(b.cells.filter((c) => c.url === 'moved_between'));

      const guard2Cells = b.cells.filter((c) => c.guards === 2);
      await fillUserOnCells(guard2Cells, 'bob');
      await liftViaCeiling(guard2Cells);

      const postLiftHeldCells = b.cells.filter((c) => c.fence === 'postLiftHeld');
      for (const c of postLiftHeldCells) {
        const triggerVal = c.url === 'moved_between' ? PW_B : PW_A;
        await rawWs.writePw(c.tid, triggerVal);
        await post('/api/agent/browser/resolve', { profile: c.pid, handle: c.pid, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: c.tid });
      }

      const unknownCells = b.cells.filter((c) => c.fence === 'unknown');
      if (unknownCells.length) {
        if (!logins1.list().entries.some((e) => e.user === 'unk')) {
          logins1.addOwn({ origin: ORIGIN, username: 'unk', password: PW_U }, { who: 'owner' });
        }
        await fillUserOnCells(unknownCells, 'unk');
        logins1.drop(unkEntryName, { who: 'owner' });
        for (const c of unknownCells) {
          try { LF.clearFilledSecretsForTarget(c.tid); } catch { /* */ }
          if (c.page === 'clean') await rawWs.writePw(c.tid, '');
        }
        clock += 16 * 60_000;
        for (const c of unknownCells) dialogs1.liveFillOnTarget(c.pid, c.tid);
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline) {
          if (unknownCells.every((c) => { const lf = dialogs1.liveFillOnTarget(c.pid, c.tid); return lf && lf.holdReason === 'unknown_typed'; })) break;
          await sleep(12);
        }
      }

      const liveCells = b.cells.filter((c) => c.fence === 'live');
      await fillUserOnCells(liveCells, 'carol');
      for (const c of liveCells) {
        if (c.page === 'clean') await rawWs.writePw(c.tid, '');
      }

      await pushStateToU1(b.cells.filter((c) => c.url === 'moved'));

      if (b.conn === 'hub_restart') {
        for (const c of b.cells.filter((x) => x.page === 'putback')) {
          await rawWs.writePw(c.tid, secretForCell(c));
        }
      } else if (b.conn === 'same_proc_reconnect') {
        // Same-process watch reconnect (`the watch changed hands` -> `canStashReconnect === true`) against identical browser UUID
        dialogs1.disarm(b.pid, 'the watch changed hands');
        await dialogs1.arm(b.pid);
        await sleep(50);
      }
    };

    // Evaluate `connected` and `same_proc_reconnect` buckets on Hub 1 one bucket at a time
    const evalBucket = async (b, medClient, { restartUnlockedPass = false } = {}) => {
      for (const c of b.cells) {
        const putVal = secretForCell(c);
        if (!restartUnlockedPass) {
          if (c.conn !== 'hub_restart') {
            await rawWs.writePw(c.tid, c.page === 'putback' ? putVal : '');
          }
          // lane chrome-157 (the take-over): «the check cannot look» holds for the WHOLE of this cell's two reads — every wipe of the tab throws
          // until both doors answered (the bucket's one clock can age a held fence past its ceiling, whose own wipe would spend a throw first)
          if (c.check === 'throw') throwBudget.set(c.tid, Number.MAX_SAFE_INTEGER);
        }

        const r1 = await post('/api/agent/browser/resolve', {
          profile: c.pid,
          handle: c.pid,
          wrapper: true,
          fenceCheckOnly: true,
          argv: ['get', 'value', '#pw'],
          targetId: c.tid,
        });

        // Re-plant put-back secret if Door 1 (`recheck`) legitimately wiped `#pw` so Door 2 (`cdp-mediator`) faces the exact same DOM state!
        if (!restartUnlockedPass && c.conn !== 'hub_restart' && c.page === 'putback' && c.check === 'mem'
          && (c.fence === 'none' || c.fence === 'postLiftHeld') && (c.url === 'same' || c.url === 'moved_between') && !c.nothingToCheck) {   // (Q7's cells: a check with nothing to look with cannot wipe — the hold keeps the value unread)
          const domAfterR1 = fk.readDomValues(c.tid).pw;
          if (domAfterR1 !== '') {
            results.push({ cell: c, pass: false, detail: { why: 'resolve_did_not_wipe_putback_dom', domAfterR1, r1 } });
            continue;
          }
          await rawWs.writePw(c.tid, putVal);
        }

        const medRes = await medClient.readPw(c.tid);
        throwBudget.delete(c.tid);

        let followUpOk = true;
        if (c.expected.flavor === 'check_failed') {
          // Law 4 second half: once the transient throw clears, the very next read rechecks cleanly!
          const rNext = await post('/api/agent/browser/resolve', {
            profile: c.pid,
            handle: c.pid,
            wrapper: true,
            fenceCheckOnly: true,
            argv: ['get', 'value', '#pw'],
            targetId: c.tid,
          });
          if (c.page === 'clean') {
            const medNext = await medClient.readPw(c.tid);
            followUpOk = rNext.status === 200 && medNext.ok === true;
          } else {
            const domWiped = fk.readDomValues(c.tid).pw === '';
            followUpOk = rNext.status === 409 && rNext.json?.code === 'login_fill_live' && domWiped
              && !JSON.stringify(rNext).includes(putVal);
          }
        }

        const actual = {
          resolveStatus: r1.status,
          resolveCode: r1.json?.code || null,
          resolveError: String(r1.json?.error || ''),
          med: medRes,
          followUpOk,
        };
        const pass = matchesExpected(actual, c.expected, ALL_SECRETS);
        if (restartUnlockedPass) {
          const prev = results.find((x) => x.cell.id === c.id);
          if (prev && !pass) {
            prev.pass = false;
            prev.detail = { why: 'failed_after_post_restart_vault_unlock', actual, expected: c.expected };
          }
        } else {
          results.push({ cell: c, pass, detail: pass ? null : { actual, expected: c.expected } });
        }
      }
    };

    for (const b of profileBuckets.filter((x) => x.conn !== 'hub_restart')) {
      await setupBucket(b);
      const mc = await openCdpClient(WebSocket, b.grantUrl);
      try {
        await evalBucket(b, mc);
      } finally {
        mc.close();
        dialogs1.disarm(b.pid);
      }
    }

    // Phase 6b: Cold Hub restart (`conn === 'hub_restart'`) — setup buckets, stop Hub 1, clear RAM secrets, boot Hub 2 LOCKED, then UNLOCKED
    const restartBuckets = profileBuckets.filter((x) => x.conn === 'hub_restart');
    if (restartBuckets.length) {
      for (const b of restartBuckets) {
        await setupBucket(b);
      }
      srv1.close(); srv1 = null;
      dialogs1.shutdown(); dialogs1 = null;
      keeper1.shutdown(); keeper1 = null;
      vault1.close(); vault1 = null;
      await med1.shutdown(); med1 = null;
      try { LF.clearAllFilledSecrets?.(); } catch { /* */ }

      clock += 2000;
      med2 = CM.create({ log: quiet });
      await med2.listen();
      keeper2 = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med2 });
      for (const b of restartBuckets) {
        b.prof = keeper2.profile(b.pid);
        const g2 = await med2.grantFor({ profileId: b.pid, browserKey: KEY, upstream: relay.wsUrl(), targetIds: b.tids, mode: 'scope' });
        b.grantUrl2 = g2.url;
      }
      vault2 = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
      // Boot LOCKED first (`vault2.state() === 'locked'`)!
      const grants2 = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
      const logins2 = Lm.create({ vault: vault2, grants: () => grants2, now: () => clock, log: quiet.log });
      const keeperWrap2 = wrapKeeper(keeper2, med2);
      dialogs2 = Dm.create({
        keeper: keeperWrap2,
        logins: logins2,
        now: () => clock,
        holdersOf: () => [{ browserKey: KEY, sessionId: SID }],
        leaseCountOf: () => 1,
        conversationOf: () => ({ cid: 'conv-r32-tbl', name: 'Agent R32' }),
        log: quiet,
      });
      Rm.setup({ keeper: keeperWrap2, activeSessions: sessions, dialogs: dialogs2, logins: logins2, tasksForSession: () => [] });
      const app2 = express();
      app2.use(express.json());
      app2.use(Rm.router);
      srv2 = await new Promise((r) => { const s = app2.listen(0, '127.0.0.1', () => r(s)); });
      apiBase = `http://127.0.0.1:${srv2.address().port}`;

      for (const b of restartBuckets) {
        await dialogs2.arm(b.pid);
        for (const tid of b.tids) dialogs2.bindTab?.({ profileId: b.pid, browserKey: KEY }, tid);
      }

      const medClients2 = new Map();
      for (const b of restartBuckets) {
        medClients2.set(b.pid, await openCdpClient(WebSocket, b.grantUrl2));
      }
      for (const b of restartBuckets) {
        await evalBucket(b, medClients2.get(b.pid), { restartUnlockedPass: false });
      }
      // Verify `blocked` count stayed 0 across all locked post-restart reads!
      const blockedAfterLockedReads = Number(vault2.state()?.blocked || 0);
      if (blockedAfterLockedReads !== 0) {
        for (const r of results) {
          if (r.cell.conn === 'hub_restart') {
            r.pass = false;
            r.detail = { why: 'locked_restart_incremented_blocked', blockedAfterLockedReads };
          }
        }
      }
      // Unlock `vault2` and re-verify every `hub_restart` cell still holds Shape S (`until_nav`)!
      await vault2.unlock(VPW);
      await sleep(30);
      for (const b of restartBuckets) {
        await evalBucket(b, medClients2.get(b.pid), { restartUnlockedPass: true });
      }
      for (const mc of medClients2.values()) mc.close();
    }
  } finally {
    LF.wipeTabTypedInputs = origWipe;
    rawWs.close();
    if (srv1) srv1.close();
    if (srv2) srv2.close();
    if (dialogs1) dialogs1.shutdown();
    if (dialogs2) dialogs2.shutdown();
    if (keeper1) keeper1.shutdown();
    if (keeper2) keeper2.shutdown();
    if (vault1) vault1.close();
    if (vault2) vault2.close();
    if (med1) await med1.shutdown();
    if (med2) await med2.shutdown();
    try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
    await relay.close();
    await fk.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  return results;
}

function listRepoFiles(repoDir) {
  try {
    const out = execFileSync('git', ['ls-files'], { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const list = out.split('\n').map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list;
  } catch { /* non-git archive fallback */ }
  const walk = (rel) => {
    const abs = path.join(repoDir, rel);
    const ents = fs.readdirSync(abs, { withFileTypes: true });
    const acc = [];
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) acc.push(...walk(childRel));
      else if (e.isFile()) acc.push(childRel);
    }
    return acc;
  };
  return walk('');
}

/** lane chrome-157 (主开发's ruling Q3) — Leg 4b as a function of its modules, so its MUTANT (runR32Mutants) re-runs it over a
 *  patched browser-dialogs: returns { ok, leaked, premise, … } and says its two lines through `ok` (a mutant run passes a no-op). */
export async function runR32Q3Leg({ mods, ok }) {
  const { req, express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, CM, Rm, Dm, startFakeKernel } = mods;
  let out = { ok: false, leaked: -1, premise: false };
  try {
    const ORIGIN = 'https://r32q3.example.test';
    const U0 = `${ORIGIN}/login`;
    const PWQ = 'Qv6!q1';
    const KEY = 'bk-000032ee';
    const SID = 'sess-r32-q3';
    const TOKEN = 'vsst_r32_q3_' + crypto.randomBytes(8).toString('hex');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r32-q3-'));
    const dataDir = path.join(tmpRoot, 'd');
    const homeDir = path.join(tmpRoot, 'h');
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
    let clock = 1_768_000_000_000;
    const ML = req('./src/browser-mediation.js');
    const BLm = req('./src/browser-login.js');

    const fk = await startFakeKernel({ firstUrl: U0, mode: { standard: true, omitFilledPassword: true } });
    const tidF = fk.targets()[0].targetId;
    const tidO = fk.addTarget(`${ORIGIN}/other`);
    fk.setDom(tidF, { url: U0, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    const relay = await startKernelRelay(WebSocket, WebSocketServer, fk, 'eeeeeeee-1111-4222-8333-444444444444');
    const rawWs = await openCdpClient(WebSocket, fk.wsUrl);
    const med = CM.create({ log: quiet });
    await med.listen();
    const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med });
    const prof = keeper.createProfile({ label: 'Q3Prof', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
    const PID = prof.id;
    const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: relay.wsUrl(), targetIds: [tidF, tidO], mode: 'scope' });
    const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
    await vault.setup('r32-q3-pw');
    const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
    const logins = Lm.create({ vault, grants: () => grants, now: () => clock, log: quiet.log });
    logins.addOwn({ origin: ORIGIN, username: 'alice', password: PWQ }, { who: 'owner' });
    grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });
    const keeperWrap = {
      ...keeper,
      cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: relay.wsUrl() } : { ok: false }),
      leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID }],
      statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'q1', isDefault: true }] }),
      setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'q1', label: 'Q3Prof', isDefault: true }], handles: ['q1'] }),
      resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'q1', attachment: { profileId: PID, alias: 'q1', isDefault: true }, handles: ['q1'], isDefault: true }),
      attach: async () => ({ ok: true, profile: prof, browser: { state: 'ready' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: grant.url, env: [`AGENT_BROWSER_CDP=${grant.url}`], pinTab: false, others: 0 }),
    };
    const dialogs = Dm.create({ keeper: keeperWrap, logins, now: () => clock, holdersOf: () => [{ browserKey: KEY, sessionId: SID }], leaseCountOf: () => 1, log: quiet });
    const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent Q3', cwd: tmpRoot, backendSessionId: 'conv-q3' }]]);
    Rm.setup({ keeper: keeperWrap, activeSessions: sessions, dialogs, logins, tasksForSession: () => [] });
    const app = express(); app.use(express.json()); app.use(Rm.router);
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const apiBase = `http://127.0.0.1:${srv.address().port}`;
    const post = async (u, body) => {
      const r = await fetch(apiBase + u, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json() };
    };
    const medWs = await openCdpClient(WebSocket, grant.url);
    const frames = [];
    medWs.ws.on('message', (d) => { if (frames.length < 20000) frames.push(String(d)); });
    try {
      await dialogs.arm(PID);
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tidF);
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tidO);
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tidF);
      const fill = await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r32q3.example.test#alice/password', targetId: tidF });
      // the page copies what was typed into its title and its address — no navigation, so the fence stands
      fk.setTitle(tidF, `welcome ${PWQ}`, `${U0}?echo=${encodeURIComponent(PWQ)}`);
      await sleep(40);
      const forms = (s) => [s, encodeURIComponent(s)];
      const rawList = await rawWs.call('Target.getTargets', {}, undefined, 800);
      const premise = forms(PWQ).some((s) => JSON.stringify(rawList).includes(s));
      const fencedNow = Boolean(dialogs.liveFillOnTarget(PID, tidF));
      const att = await medWs.call('Target.attachToTarget', { targetId: tidF, flatten: true }, undefined, 800);
      const sidF = att && att.result && att.result.sessionId;
      const verbForms = [...BLm.LIVE_FILL_ALLOW_VERBS].flatMap((v) => (v === 'tab' ? [['tab', 'new', `${ORIGIN}/home`], ['tab', tidO]] : [[v]]));
      const answers = [];
      for (const argv of verbForms) {
        const r = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv, targetId: tidF });
        answers.push(JSON.stringify(r));
        dialogs.verbStarted(KEY, { profileId: PID, verb: argv[0] });
        for (const m of (ML.LIVE_FILL_VERB_METHODS[argv[0]] || [])) answers.push(JSON.stringify(await medWs.call(m, {}, sidF, 400)));
        for (const expression of ['document.title', 'location.href']) answers.push(JSON.stringify(await medWs.call('Runtime.evaluate', { expression, returnByValue: true }, sidF, 400)));
        answers.push(JSON.stringify(await medWs.call('Target.getTargets', {}, undefined, 400)));
        answers.push(JSON.stringify(await medWs.call('Target.getTargetInfo', { targetId: tidF }, undefined, 400)));
        dialogs.verbEnded(KEY, { profileId: PID });
      }
      // (主开发 2026-11-15 item 2) THE FENCED PAGE'S EVENTS — each carries the typed value; the argued list lets none reach the agent
      // (a same-document address move is left out ON PURPOSE: it lifts a live fence by the standing SPA rule — the oracle's
      // readableAtMovedUrl — so that address is the documented trade-off, not a fenced read)
      const enc = encodeURIComponent(PWQ);
      for (const [m, prm] of [
        ['DOM.characterDataModified', { nodeId: 7, characterData: `x ${PWQ}` }],
        ['DOMStorage.domStorageItemAdded', { storageId: { securityOrigin: ORIGIN, isLocalStorage: true }, key: 'k', newValue: PWQ }],
        ['Network.requestWillBeSent', { requestId: 'q3-1', loaderId: 'L1', documentURL: U0, request: { url: `${ORIGIN}/beacon?v=${enc}`, method: 'GET', headers: {} }, timestamp: 1, wallTime: 1, initiator: { type: 'script' }, type: 'Fetch', frameId: tidF }],
        ['Console.messageAdded', { message: { source: 'console-api', level: 'log', text: PWQ } }],
        ['Page.frameNavigated', { frame: { id: 'CH11D0', parentId: tidF, loaderId: 'L2', url: `https://child.example.test/?v=${enc}`, securityOrigin: 'https://child.example.test', mimeType: 'text/html' } }],
        ['Runtime.executionContextCreated', { context: { id: 990, origin: 'https://child.example.test', name: PWQ, uniqueId: 'u990', auxData: { isDefault: true, type: 'default', frameId: 'CH11D0' } } }],
      ]) relay.emitTargetEvent(tidF, m, prm);
      // the CLOSED readers of the unjudged classes: refused on the fenced tab
      const closedAnswers = [];
      for (const [m, prm, viaSession] of [['FindInPage.findFirst', { text: PWQ }, true], ['HeadlessExperimental.beginFrame', { screenshot: { format: 'png' } }, true], ['Cast.startTabMirroring', { sinkName: 'q3-sink' }, true], ['Target.openDevTools', { targetId: tidF }, false]]) {
        const r = await medWs.call(m, prm, viaSession ? sidF : undefined, 600);
        closedAnswers.push({ m, refused: Boolean(r && r.error && /login_fill_live/.test(String(r.error.message || r.error.data || JSON.stringify(r.error)))) });
        answers.push(JSON.stringify(r));
      }
      const closedRefused = closedAnswers.every((x) => x.refused);
      // A DIALOG the fenced page opens with the typed value in its words: the admitted verb's answer and the CLI's long-poll
      // a CONFIRM (held for an answer — an alert on a browser without holds is the browser's own, told only as a note) and an alert
      relay.emitTargetEvent(tidF, 'Page.javascriptDialogOpening', { url: U0, message: `confirm ${PWQ}`, type: 'confirm', hasBrowserHandler: false, defaultPrompt: '' });
      // …and as THIS kernel says a dialog: a js-dialog SURFACE (a kernel's native dialog event is ignored by name — one source)
      fk.openSurface({ targetId: tidF, kind: 'js-dialog', origin: ORIGIN, frameOrigin: ORIGIN, title: `asks ${PWQ}`, message: `prompt ${PWQ}`, hold: true });
      await sleep(80);
      answers.push(JSON.stringify(await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, argv: ['click', '@e1'], targetId: tidF })));
      answers.push(JSON.stringify(await post('/api/agent/browser/audit', { profile: PID, handle: PID, argv: ['click', '@e1'], targetId: tidF, dialog: true })));   // the CLI's own after-verb answer: the dialog fact + its notes
      try { const r = await fetch(`${apiBase}/api/agent/browser/dialog?profile=${encodeURIComponent(PID)}&wait=0`, { headers: { authorization: `Bearer ${TOKEN}` } }); answers.push(await r.text()); } catch (e) { answers.push(String(e && e.message)); }
      answers.push(JSON.stringify(await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, argv: ['click', '@e1'], targetId: tidF })));
      fk.setTitle(tidF, `still ${PWQ}`, `${U0}?again=${encodeURIComponent(PWQ)}`);
      await sleep(40);
      const seen = answers.concat(frames).join('\n');
      const leaked = forms(PWQ).filter((s) => seen.includes(s)).length;
      // WHERE (names only, never a value): which answer forms and which frames' methods carried it
      const leakAt = { answers: answers.map((a, i) => (forms(PWQ).some((s) => a.includes(s)) ? `${i}:${(a.match(/"method":"([A-Za-z.]+)"|"code":"([a-z_]+)"/) || [])[1] || (a.match(/"code":"([a-z_]+)"/) || [])[1] || (a.match(/"result":\{"(\w+)/) || [])[1] || '?'}` : null)).filter(Boolean).slice(0, 12),
        frames: [...new Set(frames.filter((f) => forms(PWQ).some((s) => f.includes(s))).map((f) => { try { const o = JSON.parse(f); return o.method || (o.result ? 'reply:' + Object.keys(o.result).join(',') : 'reply'); } catch { return '?'; } }))].slice(0, 12) };
      out = { ok: Boolean(fill.status === 200 && fencedNow && premise && sidF && leaked === 0 && closedRefused), closedAnswers, leaked, premise, fencedNow, fill: fill.status, answers: answers.length, frames: frames.length };
      ok(fill.status === 200 && fencedNow && premise && sidF && leaked === 0 && closedRefused,
        `R32-Q3 (an admitted verb returns nothing the fenced document controls): ${verbForms.length} verb forms admitted on a fenced tab whose page copies the typed value into its title and address — the value's bytes in none of ${answers.length} answers (the closed readers refused, a dialog with it in its words) and ${frames.length} mediator frames (its page's events with it dropped)`,
        { fill: fill.status, fencedNow, premise, attached: Boolean(sidF), leaked, leakAt, closedAnswers });
      ok(premise, 'R32-Q3 CONTROL: the kernel\'s own listing (its raw socket, no mediator) carries the typed value in the title and the address — the leg\'s page really copied it');
    } finally {
      medWs.close();
      rawWs.close();
      srv.close();
      dialogs.shutdown();
      keeper.shutdown();
      vault.close();
      await med.shutdown();
      try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
      await relay.close();
      await fk.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  } catch (e) {
    ok(false, 'R32-Q3 (an admitted verb returns nothing the fenced document controls)', String(e && e.stack || e));
  }
  return out;
}

/** lane chrome-157 (主开发's ruling Q6) — Leg 5 (a check belongs to its document) as a function of its modules, so its MUTANT re-runs
 *  it over a patched browser-dialogs: returns { ok, … } and says its line through `ok` (a mutant run passes a no-op). */
export async function runR32NavSeqLeg({ mods, ok }) {
  const { express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, CM, Rm, Dm, startFakeKernel } = mods;
  let out = { ok: false };
  try {
    const ORIGIN = 'https://r32navseq.example.test';
    const U0 = `${ORIGIN}/login`;
    const PW1 = 'Nv6!a1';
    const PW2 = 'Nv6!b2';
    const KEY = 'bk-000032dd';
    const SID = 'sess-r32-nav';
    const TOKEN = 'vsst_r32_nav_' + crypto.randomBytes(8).toString('hex');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r32-nav-'));
    const dataDir = path.join(tmpRoot, 'd');
    const homeDir = path.join(tmpRoot, 'h');
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
    let clock = 1_768_000_000_000;

    const fk = await startFakeKernel({ firstUrl: U0, mode: { standard: true, omitFilledPassword: true } });
    const tidA = fk.targets()[0].targetId;
    const tidB = fk.addTarget(U0);
    fk.setDom(tidA, { url: U0, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    fk.setDom(tidB, { url: U0, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    const relay = await startKernelRelay(WebSocket, WebSocketServer, fk, 'dddddddd-1111-4222-8333-444444444444');
    const rawWs = await openCdpClient(WebSocket, fk.wsUrl);
    const med = CM.create({ log: quiet });
    await med.listen();
    const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med });
    const prof = keeper.createProfile({ label: 'NavSeqProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
    const PID = prof.id;
    const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: relay.wsUrl(), targetIds: [tidA, tidB], mode: 'scope' });
    const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
    await vault.setup('r32-nav-pw');
    const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
    const logins = Lm.create({ vault, grants: () => grants, now: () => clock, log: quiet.log });
    logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW1 }, { who: 'owner' });
    logins.addOwn({ origin: ORIGIN, username: 'bob', password: PW2 }, { who: 'owner' });
    grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

    const keeperWrap = {
      ...keeper,
      cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: relay.wsUrl() } : { ok: false }),
      leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID }],
      statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'n1', isDefault: true }] }),
      setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'n1', label: 'NavSeqProf', isDefault: true }], handles: ['n1'] }),
      resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'n1', attachment: { profileId: PID, alias: 'n1', isDefault: true }, handles: ['n1'], isDefault: true }),
      attach: async () => ({ ok: true, profile: prof, browser: { state: 'ready' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: grant.url, env: [`AGENT_BROWSER_CDP=${grant.url}`], pinTab: false, others: 0 }),
    };
    const dialogs = Dm.create({ keeper: keeperWrap, logins, now: () => clock, holdersOf: () => [{ browserKey: KEY, sessionId: SID }], leaseCountOf: () => 1, log: quiet });
    const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent Nav', cwd: tmpRoot, backendSessionId: 'conv-nav' }]]);
    Rm.setup({ keeper: keeperWrap, activeSessions: sessions, dialogs, logins, tasksForSession: () => [] });
    const app = express(); app.use(express.json()); app.use(Rm.router);
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const apiBase = `http://127.0.0.1:${srv.address().port}`;
    const post = async (u, body) => {
      const r = await fetch(apiBase + u, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json() };
    };

    try {
      await dialogs.arm(PID);
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tidA);
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tidB);

      // Half A: `tidA` has guard + putback `PW1`; hold `Page.createIsolatedWorld` mid-check while `tidA` reloads to clean `U0`
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tidA);
      await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r32navseq.example.test#alice/password', targetId: tidA });
      clock += 16 * 60_000;
      dialogs.liveFillOnTarget(PID, tidA);
      await sleep(65);
      await rawWs.writePw(tidA, PW1);

      // lane chrome-157 (the take-over): EVERY WAIT OF THIS LEG IS BOUNDED — an unbounded wait for a CDP method the check never
      // sends hung the leg for ever (two runs of the builder's, 25 h and 29 h); a bound that passes fails the leg BY NAME with the
      // methods the relay did see (names only — never a parameter, so never a value)
      const bounded = (pr, ms, what) => Promise.race([pr, sleep(ms).then(() => { throw new Error(typeof what === 'function' ? what() : what); })]);
      const seenA = [], seenB = [];
      let releaseHoldA = null;
      let heldOnceA = false;
      const enteredHoldA = new Promise((r) => {
        relay.state.hook = async (msg, ctx = {}) => {
          if (seenA.length < 40 && msg && msg.method) seenA.push(msg.method);
          // the check's FIRST call on tab A: a fresh isolated world, or (measured: the check reuses the world it already has) its first
          // evaluation on the session that is tab A's on this connection
          const sidA = ctx.sessionsOnConn ? ctx.sessionsOnConn.get(tidA) : null;
          const firstA = (msg.method === 'Page.createIsolatedWorld' && msg.params?.frameId === tidA) || (sidA && msg.sessionId === sidA && (msg.method === 'Runtime.evaluate' || msg.method === 'Runtime.callFunctionOn'));
          if (!heldOnceA && firstA) {
            heldOnceA = true;
            r();
            await new Promise((res) => { releaseHoldA = res; });
          }
          return false;
        };
      });
      const inFlightReadA = post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tidA });
      await bounded(enteredHoldA, 5000, () => `half A: the in-flight check never sent its first call (an isolated world or an evaluation on its tab's session) within 5 s — the relay saw: ${[...new Set(seenA)].join(' ') || 'nothing'}`);
      // Same-URL top-frame reload occurs BEFORE the old check finishes (old check still sees `PW1` if evaluated, or finishes after nav)
      relay.emitTargetEvent(tidA, 'Page.frameNavigated', { frame: { id: tidA, url: U0, securityOrigin: ORIGIN } });
      await sleep(15);
      releaseHoldA();
      relay.state.hook = null;
      const rA1 = await bounded(inFlightReadA, 15000, 'half A: the in-flight read never answered within 15 s');
      await rawWs.writePw(tidA, '');
      const rA2 = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tidA });

      // Half B: `tidB` starts a clean check (`#pw === ''`), pauses mid-check; `tidB` navigates, fills `bob` (`PW2`), lifts, and puts `PW2` back!
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tidB);
      await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r32navseq.example.test#alice/password', targetId: tidB });
      clock += 16 * 60_000;
      dialogs.liveFillOnTarget(PID, tidB);
      await sleep(65);
      await rawWs.writePw(tidB, '');

      let releaseHoldB = null;
      let heldOnceB = false;
      const enteredHoldB = new Promise((r) => {
        relay.state.hook = async (msg, ctx = {}) => {
          if (seenB.length < 40 && msg && msg.method) seenB.push(msg.method);
          // the check's FIRST call on tab B: a fresh isolated world, or (measured: the check reuses the world it already has) its first
          // evaluation on the session that is tab B's on this connection
          const sidB = ctx.sessionsOnConn ? ctx.sessionsOnConn.get(tidB) : null;
          const firstB = (msg.method === 'Page.createIsolatedWorld' && msg.params?.frameId === tidB) || (sidB && msg.sessionId === sidB && (msg.method === 'Runtime.evaluate' || msg.method === 'Runtime.callFunctionOn'));
          if (!heldOnceB && firstB) {
            heldOnceB = true;
            r();
            await new Promise((res) => { releaseHoldB = res; });
          }
          return false;
        };
      });
      const inFlightCleanCheckB = post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'title'], targetId: tidB });
      await bounded(enteredHoldB, 5000, () => `half B: the in-flight check never sent its first call (an isolated world or an evaluation on its tab's session) within 5 s — the relay saw: ${[...new Set(seenB)].join(' ') || 'nothing'}`);
      relay.state.hook = null; // let subsequent fill/lift CDP calls proceed freely while the first check is still paused!

      relay.emitTargetEvent(tidB, 'Page.frameNavigated', { frame: { id: tidB, url: U0, securityOrigin: ORIGIN } });
      await sleep(15);
      await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r32navseq.example.test#bob/password', targetId: tidB });
      clock += 16 * 60_000;
      dialogs.liveFillOnTarget(PID, tidB);
      await sleep(65);
      await rawWs.writePw(tidB, PW2);

      // New read arrives on `tidB` while old doc's clean check is STILL suspended in flight, then old check resumes!
      const newDocReadPromise = post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tidB });
      await sleep(15);
      releaseHoldB();
      await bounded(inFlightCleanCheckB, 15000, 'half B: the paused clean check never answered within 15 s');
      const rBNewDoc = await bounded(newDocReadPromise, 15000, 'half B: the new document\'s read never answered within 15 s');
      const domBAfter = fk.readDomValues(tidB).pw;

      out = { ok: Boolean(rA1.status === 200 && rA2.status === 200 && !dialogs.liveFillOnTarget(PID, tidA) && rBNewDoc.status === 409 && rBNewDoc.json?.code === 'login_fill_live' && domBAfter === '' && !JSON.stringify(rBNewDoc).includes(PW2)), rA1: rA1.status, rA2: rA2.status, rBNewDoc: rBNewDoc.status };
      ok(
        rA1.status === 200 && rA2.status === 200 && !dialogs.liveFillOnTarget(PID, tidA)
          && rBNewDoc.status === 409 && rBNewDoc.json?.code === 'login_fill_live'
          && domBAfter === '' && !JSON.stringify(rBNewDoc).includes(PW2),
        'R32-NavSeq (Law 5 postLiftCheckingNavSeq): in-flight check across same-URL reload never false-fences clean new doc (200), and stale clean check across nav+fill+lift+putback rechecks new doc (409 login_fill_live, 0 leaks)',
        { rA1: rA1.status, rA2: rA2.status, rBNewDoc, domBAfter },
      );
    } finally {
      relay.state.hook = null;
      rawWs.close();
      srv.close();
      dialogs.shutdown();
      keeper.shutdown();
      vault.close();
      await med.shutdown();
      try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
      await relay.close();
      await fk.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  } catch (e) {
    ok(false, 'R32-NavSeq (Law 5 postLiftCheckingNavSeq)', String(e && e.stack || e));
  }
  return out;
}

/** lane chrome-157 (主开发 2026-11-15 item 2) — A FENCED TAB'S DIALOG IS TOLD TO AN AGENT WITHOUT ITS WORDS. The fake kernel of the legs
 *  cannot raise a HELD dialog on a fenced tab (measured: the watch records none there), so the dialog road is proven where it is
 *  decided: browser-dialogs' pure agentDialogOf over a confirm and a kernel's surface whose words carry the typed value — the block,
 *  the note, the sentence and the answer an agent is given hold none of it (a CONTROL: the same record without it does) — and its
 *  WIRING in the source (both openers mark a fenced tab's dialog; every agent road reads it). Returns { ok, … }. */
export async function runR32DialogLeg({ mods, repoDir, ok }) {
  const { req, Dm } = mods;
  const ST = req('./src/browser-stuck.js');
  const PWD = 'Dv6!d1';
  const at = { urlAtFill: 'https://r32q3.example.test/login' };
  const dlg = { id: 1, type: 'confirm', message: `confirm ${PWD}`, url: `https://r32q3.example.test/login?v=${PWD}`, defaultValue: PWD, openedAt: 1, fencedAt: at };
  const surf = { id: 's1', surface: true, kind: 'js-dialog', title: `asks ${PWD}`, message: `m ${PWD}`, origin: 'https://r32q3.example.test', frameOrigin: `https://f${PWD.length}.example.test`, fields: [{ label: PWD }], fencedAt: at };
  const A = Dm.agentDialogOf;
  const views = [ST.dialogBlock(A(dlg), { now: 2 }), ST.answeredNote({ dialog: A(dlg), by: 'user', how: 'accepted', at: 2 }), ST.dialogText(A(dlg), { now: 2 }), ST.answerDoneText(A(dlg), { accept: true }), A(surf)];
  const leaked = views.filter((v) => JSON.stringify(v).includes(PWD)).length;
  const control = JSON.stringify([ST.dialogBlock(dlg, { now: 2 }), ST.answeredNote({ dialog: dlg, by: 'user', how: 'accepted', at: 2 }), surf]).includes(PWD);
  const src = fs.readFileSync(path.join(repoDir, 'src/server/browser-dialogs.js'), 'utf8');
  const wired = /d\.fencedAt = \{ urlAtFill/.test(src) && /rec\.fencedAt = \{ urlAtFill/.test(src) && (src.match(/agentDialogOf\(/g) || []).length >= 7;
  const out = { ok: Boolean(leaked === 0 && control && wired), leaked, control, wired };
  ok(out.ok, `R32-Q3-DIALOG (a fenced tab's dialog told without its words): the block, the note, the sentence, the answer and a kernel's surface carry none of the typed value (${leaked} of 5 do), the same record without it does (control), both openers mark a fenced tab's dialog and every agent road reads the view`, out);
  return out;
}

export async function runR32LoginTable({ repoDir, ok: okRaw }) {
  const ok = scrubbedOk(okRaw);
  const req = createRequire(path.join(repoDir, 'package.json'));
  const express = req('express');
  const { WebSocket, WebSocketServer } = req('ws');
  const BP = req('./src/browser-profiles.js');
  const BM = req('./src/browser-mediation.js');
  const LF = req('./src/server/browser-login-fill.js');
  const VE = req('./src/server/vault-engine.js');
  const GS = req('./src/server/grants-store.js');
  const BK = req('./src/server/browser-keeper.js');
  const Lm = req('./src/server/browser-logins.js');
  const Dm = req('./src/server/browser-dialogs.js');
  const CM = req('./src/server/cdp-mediator.js');
  const Rm = req('./src/routes/browser.js');
  const { startFakeKernel } = await import(pathToFileURL(path.join(repoDir, 'scripts/fixtures/fake-kernel.mjs')).href);

  const tableSpec = generateR32Table();
  console.log(`⑪ Round 32 Shape S table & nails (generated=${tableSpec.generated} pruned=${tableSpec.prunedCount} executed=${tableSpec.cells.length} prunedByRule=${JSON.stringify(tableSpec.pruned)})`);

  // ── Leg 1: Deletion leg & truthful-words census (`go-shape-s.md` #5, #6, #7b) ────────────────────────────────────
  {
    const forbiddenNames = [
      'hydrateTab' + 'FenceSecrets',
      'fence' + 'SecretsOf',
      'slotSecrets' + 'AtRev',
      'HOLD_VAULT_' + 'LOCKED',
      'LOCKED_CHECK_' + 'TAB',
    ];
    const files = listRepoFiles(repoDir);
    const hits = [];
    for (const rel of files) {
      if (!/\.(c?m?js|ts|md|json)$/i.test(rel)) continue;
      let txt = '';
      try { txt = fs.readFileSync(path.join(repoDir, rel), 'utf8'); } catch { continue; }
      for (const sym of forbiddenNames) {
        if (txt.includes(sym)) hits.push(`${rel}:${sym}`);
      }
    }

    const bdSrc = fs.readFileSync(path.join(repoDir, 'src/server/browser-dialogs.js'), 'utf8');
    const rearmMatch = /async function rearmLoginFences\(w\)\s*\{[\s\S]*?\n  \}\n\n  function clearProfileLoginFencesOnStop/.exec(bdSrc);
    const rearmBody = rearmMatch ? rearmMatch[0] : '';
    const vaultOpenMatch = /unsubVaultOpen = logins\.onVaultOpen\(\(\) => \{[\s\S]*?\}\);/.exec(bdSrc);
    const vaultOpenBody = vaultOpenMatch ? vaultOpenMatch[0] : '';
    const restoreTouchesVaultDirectly = /\blogins\./.test(rearmBody) || /\bhydrate(?!PersistedScrubs)/.test(rearmBody + '\n' + vaultOpenBody);

    // Every `"the owner has already been told"` sentence in login modules must call `blocked(` right before returning it.
    const blSrc = fs.readFileSync(path.join(repoDir, 'src/server/browser-logins.js'), 'utf8');
    const untruthfulTold = /already been told|has been told/.test(bdSrc)
      || [...blSrc.matchAll(/BL\.LOCKED/g)].some((m) => !/blocked\s*\(/.test(blSrc.slice(Math.max(0, m.index - 260), m.index)));

    ok(
      hits.length === 0 && Boolean(rearmBody) && Boolean(vaultOpenBody) && !restoreTouchesVaultDirectly && !untruthfulTold,
      'R32-Del (Deletion & restore-vault census): 0 occurrences of deleted post-restart hydration symbols across tree, restore/unlock path touches logins ONLY via hydratePersistedScrubs, and 0 untruthful "owner has already been told" paths',
      { hits: hits.slice(0, 20), hasRearmBody: Boolean(rearmBody), hasVaultOpenBody: Boolean(vaultOpenBody), restoreTouchesVaultDirectly, untruthfulTold },
    );
  }

  // ── Leg 2: Generated 6-axis exhaustive table (`go-shape-s.md` #7a) ───────────────────────────────────────────────
  let tableSummary = { total: tableSpec.cells.length, redIds: [] };
  {
    const mods = { express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, Dm, CM, Rm, startFakeKernel };
    const cellResults = await executeCellSet(tableSpec.cells, mods);
    const red = cellResults.filter((r) => !r.pass);
    tableSummary = { total: cellResults.length, redIds: red.map((r) => r.cell.id) };
    if (red.length > 0) {
      console.log(`R32_TABLE_RED_COUNT=${red.length}/${cellResults.length}`);
      console.log(`R32_TABLE_RED_CELLS=${JSON.stringify(tableSummary.redIds)}`);
    }
    ok(
      cellResults.length === tableSpec.cells.length && red.length === 0,
      `R32-Table (Exhaustive 6-axis generated table): ${cellResults.length}/${tableSpec.cells.length} cells match pure law oracle (generated=${tableSpec.generated}, pruned=${tableSpec.prunedCount}: ${JSON.stringify(tableSpec.pruned)})`,
      red.length ? { redCount: red.length, firstTen: red.slice(0, 10).map((r) => ({ id: r.cell.id, detail: r.detail })) } : undefined,
    );
  }

  // ── Leg 3: Same-process RAM stash & browser identity laws (`go-shape-s.md` #1, #2) ───────────────────────────────
  try {
    const ORIGIN = 'https://r32stash.example.test';
    const U0 = `${ORIGIN}/login`;
    const U_MOVED = `${ORIGIN}/dashboard`;
    const PW_SHORT = 'St6!p1';
    const PW_GUARD = 'St6!g2';
    const KEY = 'bk-000032bb';
    const SID = 'sess-r32-stash';
    const TOKEN = 'vsst_r32_stash_' + crypto.randomBytes(8).toString('hex');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r32-stash-'));
    const dataDir = path.join(tmpRoot, 'd');
    const homeDir = path.join(tmpRoot, 'h');
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
    let clock = 1_767_500_000_000;

    const fk = await startFakeKernel({ firstUrl: U0, mode: { standard: true, omitFilledPassword: true } });
    const tidFence = fk.targets()[0].targetId;
    const tidGuard = fk.addTarget(U0);
    const tidMovedDown = fk.addTarget(U0);
    for (const t of [tidFence, tidGuard, tidMovedDown]) {
      fk.setDom(t, { url: U0, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    }
    const relay = await startKernelRelay(WebSocket, WebSocketServer, fk, 'aaaaaaaa-1111-4222-8333-444444444444');
    const rawWs = await openCdpClient(WebSocket, fk.wsUrl);
    const med = CM.create({ log: quiet });
    await med.listen();

    let browserRec = { state: 'ready', pid: 41001, starttime: '900001', startedAt: clock };   // (lane chrome-157, Q8: no `browser` sub-object — no record has one)
    const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med });
    const prof = keeper.createProfile({ label: 'StashProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
    const profDrop = keeper.createProfile({ label: 'DropProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
    const PID = prof.id;
    const PID_DROP = profDrop.id;
    const tidDrop = fk.addTarget(U0);
    fk.setDom(tidDrop, { url: U0, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });

    const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: relay.wsUrl(), targetIds: [tidFence, tidGuard, tidMovedDown], mode: 'scope' });
    const grantDrop = await med.grantFor({ profileId: PID_DROP, browserKey: KEY, upstream: relay.wsUrl(), targetIds: [tidDrop], mode: 'scope' });
    const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
    await vault.setup('r32-stash-pw');
    const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
    const logins = Lm.create({ vault, grants: () => grants, now: () => clock, log: quiet.log });
    logins.addOwn({ origin: ORIGIN, username: 'alice', password: PW_SHORT }, { who: 'owner' });
    logins.addOwn({ origin: ORIGIN, username: 'bob', password: PW_GUARD }, { who: 'owner' });
    grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });

    const keeperWrap = {
      ...keeper,
      browserOf: (id) => (id === PID ? browserRec : keeper.browserOf(id)),
      // lane chrome-157 (Q8): the ONE identity — the keeper module's pure function over the stand-in record and the watched url
      browserIdentityOf: (id, o = {}) => (id === PID ? BK.browserIdentityOfRecord(browserRec, o.url) : keeper.browserIdentityOf(id, o)),
      cdpEndpointFor: async (id) => ((id === PID || id === PID_DROP) ? { ok: true, url: relay.wsUrl() } : { ok: false }),
      leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID }, { profileId: PID_DROP, browserKey: KEY, sessionId: SID }],
      statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 's1', isDefault: true }] }),
      setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 's1', label: 'StashProf', isDefault: true }], handles: ['s1'] }),
      resolveFor: (a = {}) => {
        const useDrop = a && a.handle === PID_DROP;   // (lane chrome-157: the route's ONE object and its handle — see the table's stand-in)
        const p = useDrop ? profDrop : prof;
        return { ok: true, kind: 'attachment', handle: p.id, attachment: { profileId: p.id, alias: p.id, isDefault: true }, handles: [p.id], isDefault: true };
      },
      attach: async (a = {}) => {
        const useDrop = (a.profileId || a.ref) === PID_DROP;
        const p = useDrop ? profDrop : prof;
        const gUrl = useDrop ? grantDrop.url : grant.url;
        return { ok: true, profile: p, browser: { state: 'ready' }, lease: { profileId: p.id, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: gUrl, env: [`AGENT_BROWSER_CDP=${gUrl}`], pinTab: false, others: 0 };
      },
    };
    const dialogs = Dm.create({ keeper: keeperWrap, logins, now: () => clock, holdersOf: () => [{ browserKey: KEY, sessionId: SID }], leaseCountOf: () => 1, log: quiet });
    const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent Stash', cwd: tmpRoot, backendSessionId: 'conv-stash' }]]);
    Rm.setup({ keeper: keeperWrap, activeSessions: sessions, dialogs, logins, tasksForSession: () => [] });
    const app = express(); app.use(express.json()); app.use(Rm.router);
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const apiBase = `http://127.0.0.1:${srv.address().port}`;
    const post = async (u, body) => {
      const r = await fetch(apiBase + u, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json() };
    };

    try {
      await dialogs.arm(PID);
      await dialogs.arm(PID_DROP);
      for (const t of [tidFence, tidGuard, tidMovedDown]) dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, t);
      dialogs.bindTab?.({ profileId: PID_DROP, browserKey: KEY }, tidDrop);

      // Guard-only tab (`tidGuard`), live-fenced tab (`tidFence`), and fence-that-moves-while-down (`tidMovedDown`)
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tidGuard);
      await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r32stash.example.test#bob/password', targetId: tidGuard });
      clock += 16 * 60_000;
      dialogs.liveFillOnTarget(PID, tidGuard);
      await sleep(70);

      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tidFence);
      await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r32stash.example.test#alice/password', targetId: tidFence });
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tidMovedDown);
      await post('/api/agent/browser/fill-vault', { profile: PID, target: '#pw', spec: 'r32stash.example.test#alice/password', targetId: tidMovedDown });
      dialogs.noteActiveTab?.({ profileId: PID_DROP, browserKey: KEY }, tidDrop);
      await post('/api/agent/browser/fill-vault', { profile: PID_DROP, target: '#pw', spec: 'r32stash.example.test#alice/password', targetId: tidDrop });

      // (a) Check disk JSON directly: 0 login identity fields, no `guards` key, both fenced + guard-only merged into `fences`
      const diskRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'browser-profiles.json'), 'utf8'));
      const diskPid = diskRaw?.loginFences?.[PID];
      const allowedFenceKeys = new Set(['targetId', 'urlAtFill', 'origin', 'at', 'browserKey']);
      const diskZeroIdentity = Boolean(diskPid)
        && !Object.prototype.hasOwnProperty.call(diskPid, 'guards')
        && Array.isArray(diskPid.fences) && diskPid.fences.length === 3
        && diskPid.fences.every((f) => Object.keys(f).every((k) => allowedFenceKeys.has(k)));

      // (b) Watch socket drops (simulating custom-kernel mode switch), then DIFFERENT browser spawns under same `PID`
      // (`browserOf` chrome PID/starttime changes AND `DEVTOOLS_ID` UUID changes; `tidMovedDown` also navigated to `U_MOVED`)
      relay.dropSockets();
      await sleep(35);
      browserRec = { state: 'ready', pid: 52001, starttime: '950001', startedAt: clock + 10 };
      relay.state.uuid = 'bbbbbbbb-1111-4222-8333-444444444444';
      fk.setDom(tidMovedDown, { url: U_MOVED, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      await rawWs.writePw(tidGuard, '');
      await dialogs.arm(PID);

      const lfValuesCleared = (LF.valuesForTarget(tidFence) || []).length === 0 && (LF.valuesForTarget(tidGuard) || []).length === 0;
      const rGuardDifferentBrowser = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tidGuard });
      const rMovedWhileDown = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: tidMovedDown });

      // (c) `removeProfile` drops `PID_DROP` persisted fences & RAM secrets immediately; `disarm` drops `PID` fences & RAM secrets
      const hadDropSecretsBefore = (LF.valuesForTarget(tidDrop) || []).length > 0;
      keeper.removeProfile(PID_DROP);
      const dropCleared = (LF.valuesForTarget(tidDrop) || []).length === 0 && (keeper.loginFenceStateOf(PID_DROP).fences || []).length === 0;
      dialogs.disarm(PID);
      const disarmCleared = (keeper.loginFenceStateOf(PID).fences || []).length === 0;

      ok(
        diskZeroIdentity
          && lfValuesCleared
          && rGuardDifferentBrowser.status === 409 && rGuardDifferentBrowser.json?.code === 'login_fill_live'
          && TWO_DOORS_RE.test(String(rGuardDifferentBrowser.json?.error || ''))
          && rMovedWhileDown.status === 200
          && hadDropSecretsBefore && dropCleared && disarmCleared,
        'R32-Stash (RAM stash & browser identity laws): 0 login identity on disk, replacement browser never inherits old RAM stash/LF secrets (holds Shape S until nav, drops URL-changed tab), and removeProfile + disarm drop stash/fences immediately',
        { diskPid, diskZeroIdentity, lfValuesCleared, rGuardDifferentBrowser, rMovedWhileDown: rMovedWhileDown.status, hadDropSecretsBefore, dropCleared, disarmCleared },
      );
    } finally {
      rawWs.close();
      srv.close();
      dialogs.shutdown();
      keeper.shutdown();
      vault.close();
      await med.shutdown();
      try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
      await relay.close();
      await fk.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  } catch (e) {
    ok(false, 'R32-Stash (RAM stash & browser identity laws)', String(e && e.stack || e));
  }

  // ── Leg 4: Both exit doors work live + cross-origin Fetch blocked until reload (`go-shape-s.md` #3) ───────────────
  try {
    const ORIGIN = 'https://r32doors.example.test';
    const U0 = `${ORIGIN}/login`;
    const KEY = 'bk-000032cc';
    const SID = 'sess-r32-doors';
    const TOKEN = 'vsst_r32_doors_' + crypto.randomBytes(8).toString('hex');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r32-doors-'));
    const dataDir = path.join(tmpRoot, 'd');
    const homeDir = path.join(tmpRoot, 'h');
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
    let clock = 1_767_800_000_000;

    const fk = await startFakeKernel({ firstUrl: U0, mode: { standard: true, omitFilledPassword: true } });
    const tid1 = fk.targets()[0].targetId;
    const tid2 = fk.addTarget(`${ORIGIN}/home`);
    fk.setDom(tid1, { url: U0, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    fk.setDom(tid2, { url: `${ORIGIN}/home`, elements: [{ id: 'ok', tag: 'div', text: 'Tab 2 Ready' }] });

    const fetchActions = [];
    const relay = await startKernelRelay(WebSocket, WebSocketServer, fk, 'cccccccc-1111-4222-8333-444444444444');
    relay.state.hook = async (msg, { sendToClient }) => {
      if (msg.method === 'Fetch.failRequest' || msg.method === 'Fetch.continueRequest') {
        fetchActions.push({ method: msg.method, params: msg.params });
        sendToClient({ id: msg.id, result: {}, ...(msg.sessionId ? { sessionId: msg.sessionId } : {}) });
        return true;
      }
      return false;
    };

    const med = CM.create({ log: quiet });
    await med.listen();
    const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clock, install: false, mediator: med });
    const prof = keeper.createProfile({ label: 'DoorsProf', sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
    const PID = prof.id;
    // Seed Shape S persisted fence directly on `tid1` (cold restart state, Vault never even created/unlocked!)
    keeper.saveLoginFenceState(PID, {
      fences: [{ targetId: tid1, urlAtFill: U0, origin: ORIGIN, at: clock - 5000, browserKey: KEY }],
      scrubs: [],
    });
    const grant = await med.grantFor({ profileId: PID, browserKey: KEY, upstream: relay.wsUrl(), targetIds: [tid1, tid2], mode: 'scope' });
    const keeperWrap = {
      ...keeper,
      cdpEndpointFor: async (id) => (id === PID ? { ok: true, url: relay.wsUrl() } : { ok: false }),
      leasesFor: () => [{ profileId: PID, browserKey: KEY, sessionId: SID }],
      statusFor: () => ({ ephemeral: null, pin: PID, leases: [{ profileId: PID, alias: 'd1', isDefault: true }] }),
      setFor: () => ({ defaultId: PID, attachments: [{ profileId: PID, alias: 'd1', label: 'DoorsProf', isDefault: true }], handles: ['d1'] }),
      resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'd1', attachment: { profileId: PID, alias: 'd1', isDefault: true }, handles: ['d1'], isDefault: true }),
      attach: async () => ({ ok: true, profile: prof, browser: { state: 'ready' }, lease: { profileId: PID, browserKey: KEY, sessionId: SID, since: clock }, cdpUrl: grant.url, env: [`AGENT_BROWSER_CDP=${grant.url}`], pinTab: false, others: 0 }),
    };
    const dialogs = Dm.create({ keeper: keeperWrap, logins: null, now: () => clock, holdersOf: () => [{ browserKey: KEY, sessionId: SID }], leaseCountOf: () => 1, log: quiet });
    const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent Doors', cwd: tmpRoot, backendSessionId: 'conv-doors' }]]);
    Rm.setup({ keeper: keeperWrap, activeSessions: sessions, dialogs, logins: null, tasksForSession: () => [] });
    const app = express(); app.use(express.json()); app.use(Rm.router);
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const apiBase = `http://127.0.0.1:${srv.address().port}`;
    const post = async (u, body) => {
      const r = await fetch(apiBase + u, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json() };
    };
    const medWs = await openCdpClient(WebSocket, grant.url);

    try {
      await dialogs.arm(PID);
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tid1);
      dialogs.bindTab?.({ profileId: PID, browserKey: KEY }, tid2);
      dialogs.noteActiveTab?.({ profileId: PID, browserKey: KEY }, tid1);

      // Cross-origin request from Shape S fenced `tid1` is blocked (`BlockedByClient`)
      relay.emitTargetEvent(tid1, 'Fetch.requestPaused', {
        requestId: 'req-xorig-1',
        frameId: tid1,
        resourceType: 'XHR',
        request: { url: 'https://cdn.other-origin.example.test/api.json', method: 'GET', headers: {} },
      });
      await sleep(30);
      const blockedBeforeReload = fetchActions.some((a) => a.method === 'Fetch.failRequest' && a.params?.requestId === 'req-xorig-1' && a.params?.errorReason === 'BlockedByClient');

      // Door 2: `tab new` and `tab 1` allowed (`200`) even when active tab `tid1` is fenced; reading `tid2` works (`200`) while `tid1` stays fenced (`409`)
      const rTabNew = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['tab', 'new', `${ORIGIN}/home`], targetId: tid1 });
      const rTabSwitch = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['tab', '1'], targetId: tid1 });
      const rReadTab2 = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['snapshot', '-i'], targetId: tid2 });
      const medTab2 = await medWs.readPw(tid2);
      const rReadTab1StillFenced = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['snapshot', '-i'], targetId: tid1 });

      // Door 1: `reload` allowed (`200`) on `tid1`, and top-frame `Page.frameNavigated` lifts fence + unblocks cross-origin Fetch
      const rReload = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['reload'], targetId: tid1 });
      relay.emitTargetEvent(tid1, 'Page.frameNavigated', { frame: { id: tid1, url: U0, securityOrigin: ORIGIN } });
      await sleep(30);
      const rReadTab1AfterReload = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['snapshot', '-i'], targetId: tid1 });
      const medTab1AfterReload = await medWs.readPw(tid1);

      ok(
        blockedBeforeReload
          && rTabNew.status === 200 && rTabSwitch.status === 200
          && rReadTab2.status === 200 && medTab2.ok === true
          && rReadTab1StillFenced.status === 409
          && rReload.status === 200
          && rReadTab1AfterReload.status === 200 && medTab1AfterReload.ok === true,
        'R32-Doors (Both exit doors & cross-origin block): Shape S tab blocks cross-origin requests, Door 2 (`tab new` / `tab` + other tab read) works while original tab stays fenced, and Door 1 (`reload` + frameNavigated) lifts fence',
        { blockedBeforeReload, rTabNew: rTabNew.status, rTabSwitch: rTabSwitch.status, rReadTab2: rReadTab2.status, medTab2, rReadTab1StillFenced: rReadTab1StillFenced.status, rReload: rReload.status, rReadTab1AfterReload: rReadTab1AfterReload.status, medTab1AfterReload },
      );
    } finally {
      medWs.close();
      srv.close();
      dialogs.shutdown();
      keeper.shutdown();
      await med.shutdown();
      await relay.close();
      await fk.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  } catch (e) {
    ok(false, 'R32-Doors (Both exit doors & cross-origin block)', String(e && e.stack || e));
  }

  // ── Leg 4b (lane chrome-157, 主开发's ruling Q3): EVERY VERB ADMITTED ON A FENCED TAB, AGAINST A PAGE THAT COPIES THE TYPED VALUE INTO
  // ITS TITLE AND ITS ADDRESS — the value's bytes appear in no answer: the /resolve answer, every method the verb's in-flight allowance
  // names, the title / location reads, the listings (Target.getTargets / getTargetInfo) and every frame the mediator sends while the verbs
  // run. A CONTROL proves the premise: the kernel's own listing carries the value.
  await runR32Q3Leg({ mods: { req, express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, CM, Rm, Dm, startFakeKernel }, ok });
  await runR32DialogLeg({ mods: { req, Dm }, repoDir, ok });

  // ── Leg 5: `fixups-r32` Law 5 — In-flight `recheckPostLiftOnTab` held across `Page.frameNavigated` ─────────────────
  await runR32NavSeqLeg({ mods: { express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, CM, Rm, Dm, startFakeKernel }, ok });

  // ── Leg 6: Bidirectional disk compatibility (`go-shape-s.md` #4) + door-level `catch` fail-closed defense ──────────
  try {
    // (a) Legacy `{ fences, guards }` with extra login identity fields normalizes into Shape S fenced with 0 login identity
    const legacyNormalized = BP.normalizeRegistry({
      profiles: [{ id: 'bp-11223344', label: 'Legacy', createdAt: 1000 }],
      loginFences: {
        'bp-11223344': {
          fences: [{
            targetId: 'T-FENCE',
            urlAtFill: 'https://leg.example.test/login',
            origin: 'https://leg.example.test',
            at: 12345,
            browserKey: 'bk-1',
            loginId: 'web-login:https://leg.example.test#alice',
            user: 'alice',
            typedSlot: 'current',
            rev: 3,
            entryGen: 'lg-abcdef012345',
            also: [{ loginId: 'web-login:https://leg.example.test#bob', rev: 1 }],
            holdReason: 'post-lift',
            postLiftHeld: true,
          }],
          guards: [{
            targetId: 'T-GUARD',
            urlAtFill: 'https://leg.example.test/step2',
            origin: 'https://leg.example.test',
            at: 12346,
            browserKey: 'bk-1',
            loginId: 'web-login:https://leg.example.test#bob',
            rev: 2,
          }],
          scrubs: [{ name: 'web-login:https://leg.example.test#alice', at: 12345 }],
        },
      },
    });
    const legEntry = legacyNormalized.loginFences?.['bp-11223344'];
    const allowedKeys = new Set(['targetId', 'urlAtFill', 'origin', 'at', 'browserKey']);
    const legacyToShapeSOk = Boolean(legEntry)
      && !Object.prototype.hasOwnProperty.call(legEntry, 'guards')
      && Array.isArray(legEntry.fences) && legEntry.fences.length === 2
      && legEntry.fences.some((f) => f.targetId === 'T-FENCE')
      && legEntry.fences.some((f) => f.targetId === 'T-GUARD')
      && legEntry.fences.every((f) => Object.keys(f).every((k) => allowedKeys.has(k)));

    // (b) Drive `4d63ec1b4:src/browser-profiles.js` (`.399` release) if git object is available in `repoDir`
    let release399Ok = true;
    try {
      const src399 = execFileSync('git', ['show', '4d63ec1b4:src/browser-profiles.js'], {
        cwd: repoDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const tmpModDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r32-399-'));
      try {
        const p399 = path.join(tmpModDir, 'bp399.cjs');
        fs.writeFileSync(p399, src399);
        const BP399 = req(p399);
        const out399 = BP399.normalizeRegistry({
          profiles: [{ id: 'bp-11223344', label: 'NewDisk', createdAt: 1000 }],
          loginFences: {
            'bp-11223344': {
              fences: [{ targetId: 'T-NEW', urlAtFill: 'https://new.example.test/login', origin: 'https://new.example.test', at: 20000, browserKey: 'bk-1' }],
              scrubs: [],
            },
          },
        });
        // `.399` (`4d63ec1b4`) predates `vault-login` (`loginFences` was not in `.399`), so it preserves profiles cleanly without throwing.
        release399Ok = Array.isArray(out399.profiles) && out399.profiles.length === 1 && out399.profiles[0].id === 'bp-11223344';
      } finally {
        fs.rmSync(tmpModDir, { recursive: true, force: true });
      }
    } catch { /* git commit `4d63ec1b4` absent in standalone archive copy */ }

    // (c) Door-level `catch` defense in `cdp-mediator.js` even if `recheckPostLift` itself rejects directly
    const fkDoor = await startFakeKernel({ firstUrl: 'https://doorcatch.example.test/login', mode: { standard: true } });
    const tidDoor = fkDoor.targets()[0].targetId;
    const medDoor = CM.create({ log: quiet });
    await medDoor.listen();
    medDoor.setLoginFence({
      liveFillTarget: () => null,
      hasPostLiftGuard: () => true,
      recheckPostLift: () => Promise.reject(new Error('simulated direct rejection')),
    });
    const gDoor = await medDoor.grantFor({ profileId: 'bp-door', browserKey: 'bk-door', upstream: fkDoor.wsUrl, targetIds: [tidDoor], mode: 'scope' });
    const cDoor = await openCdpClient(WebSocket, gDoor.url);
    const medRejectRes = await cDoor.readPw(tidDoor);
    cDoor.close();
    await medDoor.shutdown();
    await fkDoor.close();
    const doorCatchOk = medRejectRes.ok === false && /login_check_failed/.test(medRejectRes.error) && BM.TOKEN_RE instanceof RegExp;

    ok(
      legacyToShapeSOk && release399Ok && doorCatchOk,
      'R32-Compat (Disk compatibility & door catch): legacy {fences, guards} merges into Shape S fenced with 0 login identity, 4d63ec1b4 normalizeRegistry loads Shape S disk cleanly, and cdp-mediator rejects fail-closed on direct recheck rejection',
      { legacyToShapeSOk, legEntry, release399Ok, medRejectRes },
    );
  } catch (e) {
    ok(false, 'R32-Compat (Disk compatibility & door catch)', String(e && e.stack || e));
  }

  return tableSummary;
}

/** In-process mutant kills (`M1`, `M3`, `M3b`) evaluated directly on the generated table's cells & pure law oracle. */
export async function runR32Mutants({ repoDir, ok: okRaw, MUT }) {
  const ok = scrubbedOk(okRaw);
  const req = createRequire(path.join(repoDir, 'package.json'));
  const express = req('express');
  const { WebSocket, WebSocketServer } = req('ws');
  const LF = req('./src/server/browser-login-fill.js');
  const VE = req('./src/server/vault-engine.js');
  const GS = req('./src/server/grants-store.js');
  const BK = req('./src/server/browser-keeper.js');
  const Lm = req('./src/server/browser-logins.js');
  const CM = req('./src/server/cdp-mediator.js');
  const Rm = req('./src/routes/browser.js');
  const { startFakeKernel } = await import(pathToFileURL(path.join(repoDir, 'scripts/fixtures/fake-kernel.mjs')).href);

  const bdSrc = fs.readFileSync(path.join(repoDir, 'src/server/browser-dialogs.js'), 'utf8');
  const tableSpec = generateR32Table();
  const baseMods = { express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, CM, Rm, startFakeKernel };

  // M1 RETIRED (lane chrome-157, the take-over): its synchronous throw can no longer reach the check's body — every wipe starts inside
  // a promise (law 4's cure: browser-dialogs.js, «an exception is could-not-look»), so «the promise registered after the body» harms
  // nothing now. LAW 4 is held by its own mutant: a check that could not look answers as if it had looked, clean.
  {
    const a4 = "          if (!wr || !wr.ok) {\n            return { ok: false, checkFailed: true, code: 'login_check_failed', error: 'VibeSpace could not check this tab — try again' };\n          }";
    const src4 = bdSrc.split(a4).length === 2 ? bdSrc.replace(a4, '          if (!wr || !wr.ok) { return { ok: true, refilled: false }; /* MUTANT LAW 4 */ }') : null;
    if (src4) {
      const Dm4 = MUT.load('src/server/browser-dialogs.js', src4, 'r32-law4-could-not-look-reads-as-looked');
      const slice4 = tableSpec.cells.filter((c) => c.conn === 'connected' && c.check === 'throw' && c.guards >= 1 && c.expected.flavor === 'check_failed');
      const res4 = await executeCellSet(slice4, { ...baseMods, Dm: Dm4 });
      const red4 = res4.filter((r) => !r.pass).map((r) => r.cell.id);
      ok(slice4.length > 0 && red4.length === slice4.length, `MUTANT LAW 4 (a check that could not look answers as if it looked, clean) RED on the table (${red4.length}/${slice4.length} cells RED)`, res4.filter((r) => r.pass).map((r) => r.cell.id));
    } else {
      ok(false, 'MUTANT LAW 4: its anchor is gone in src/server/browser-dialogs.js (the recheck\'s «could not look» answer)');
    }
  }

  // MUTANT M3 (`mutate31.py` exact M3: retiring a guard also drops `e.liveFill`)
  {
    const m3Src = bdSrc.replace(
      '    if (!e.postLiftGuards && e.postLiftTimer) { clearTimeout(e.postLiftTimer); e.postLiftTimer = null; }\n    if (changed && w && w.profileId) syncPersistedLoginFences(w.profileId);',
      "    if (!e.postLiftGuards && e.postLiftTimer) { clearTimeout(e.postLiftTimer); e.postLiftTimer = null; }\n    if (changed && w && w.profileId) syncPersistedLoginFences(w.profileId);\n    if (e.liveFill) clearLiveFillOnTab(w, e, 'url-changed', { audit: false, persist: true });",
    );
    if (m3Src !== bdSrc) {
      const DmM3 = MUT.load('src/server/browser-dialogs.js', m3Src, 'r32-m3-retire-clears-fence');
      const sliceM3 = tableSpec.cells.filter((c) => c.conn === 'connected' && c.fence === 'postLiftHeld' && c.url === 'moved');
      const resM3 = await executeCellSet(sliceM3, { ...baseMods, Dm: DmM3 });
      const redM3 = resM3.filter((r) => !r.pass).map((r) => r.cell.id);
      ok(redM3.length === sliceM3.length && redM3.length > 0, `MUTANT M3 RED on R32 table (${redM3.length}/${sliceM3.length} cells RED): ${redM3.join(', ')}`, resM3);
    } else {
      ok(false, 'MUTANT M3 RED on R32 table: anchor not found in src/server/browser-dialogs.js');
    }
  }

  // MUTANT M3b (`fixups-r32` #2 sibling guard law: retiring ONE guard clears sibling guards on the tab)
  {
    const m3bSrc = bdSrc.replace(
      '    const next = e.postLiftGuards.filter((x) => x !== guard);',
      '    const next = []; /* MUTANT M3b: sibling guards wiped on single-guard retire */',
    );
    if (m3bSrc !== bdSrc) {
      const DmM3b = MUT.load('src/server/browser-dialogs.js', m3bSrc, 'r32-m3b-retire-clears-sibling-guards');
      const sliceM3b = tableSpec.cells.filter((c) => c.conn === 'connected' && c.fence === 'none' && c.guards === 2 && c.url === 'moved_between' && c.page === 'putback');
      const resM3b = await executeCellSet(sliceM3b, { ...baseMods, Dm: DmM3b });
      const redM3b = resM3b.filter((r) => !r.pass).map((r) => r.cell.id);
      ok(redM3b.length === sliceM3b.length && redM3b.length > 0, `MUTANT M3b RED on R32 table (${redM3b.length}/${sliceM3b.length} cells RED): ${redM3b.join(', ')}`, resM3b);
    } else {
      ok(false, 'MUTANT M3b RED on R32 table: anchor not found in src/server/browser-dialogs.js');
    }
  }

  // Q7 (主开发's ruling, lane chrome-157 — the take-over): NO STATE ANSWERS «TRY AGAIN» WITHOUT BOUND. A guard with nothing in
  // memory to check with cannot be made by the live engine (a guard is born only with targets); the SCENARIO copy makes one (its
  // guard keeps an empty target set) and drives the guard cells through the real stack: the law says the tab is HELD until it
  // navigates (until_nav, both doors' words). Its MUTANT puts the old «try again» answer back ⇒ the same cells RED.
  {
    const qA = '      nextGuards.push({ id: ++postLiftGuardSeq, lfSnap, prebuiltTargets });';
    const qB = '          if (!g.prebuiltTargets || !Array.isArray(g.prebuiltTargets.targets) || !g.prebuiltTargets.targets.length) return holdUnknown(g.lfSnap);';
    const scen = bdSrc.split(qA).length === 2 ? bdSrc.replace(qA, '      nextGuards.push({ id: ++postLiftGuardSeq, lfSnap, prebuiltTargets: { targets: [] } });   /* SCENARIO Q7 */') : null;
    if (scen && scen.split(qB).length === 2) {
      const UNTIL_NAV = { status: 409, code: 'login_fill_live', flavor: 'until_nav', readableAtMovedUrl: false };
      const q7Cells = tableSpec.cells.filter((c) => c.conn === 'connected' && c.fence === 'none' && c.guards === 1 && c.url === 'same' && c.check === 'mem')
        .map((c) => ({ ...c, id: `${c.id}|q7`, expected: UNTIL_NAV, nothingToCheck: true }));
      const DmQ7 = MUT.load('src/server/browser-dialogs.js', scen, 'r32-q7-scenario-guard-nothing-to-check');
      const resQ7 = await executeCellSet(q7Cells, { ...baseMods, Dm: DmQ7 });
      ok(q7Cells.length > 0 && resQ7.length === q7Cells.length && resQ7.every((r) => r.pass), `Q7 CELL: a guard with nothing in memory to check with is HELD until the tab navigates (until_nav on both doors) — ${resQ7.filter((r) => r.pass).length}/${q7Cells.length}`, resQ7.filter((r) => !r.pass));
      const mutQ7 = scen.replace(qB, "          if (!g.prebuiltTargets || !Array.isArray(g.prebuiltTargets.targets) || !g.prebuiltTargets.targets.length) return { ok: false, checkFailed: true, code: 'login_check_failed', error: 'VibeSpace could not check this tab — try again' };   /* MUTANT Q7 */");
      const DmQ7m = MUT.load('src/server/browser-dialogs.js', mutQ7, 'r32-q7-mutant-try-again');
      const resQ7m = await executeCellSet(q7Cells, { ...baseMods, Dm: DmQ7m });
      const redQ7 = resQ7m.filter((r) => !r.pass).map((r) => r.cell.id);
      ok(redQ7.length === q7Cells.length && redQ7.length > 0, `MUTANT Q7 RED: «try again» put back for a guard with nothing to check — ${redQ7.length}/${q7Cells.length} cells RED`, resQ7m.filter((r) => r.pass).map((r) => r.cell.id));
    } else {
      ok(false, `Q7 CELL + MUTANT: an anchor is gone in src/server/browser-dialogs.js (${scen ? 'the Q7 branch' : 'the guard push'})`);
    }
  }

  // ONE MUTANT PER LAW (主开发's ruling Q6, lane chrome-157). M1 (a throw poisons the check — an exception is could-not-look), M3 (retiring
  // a guard lifts the fence — retiring is not a check) and M3b (ending one guard ends the others) above count where they fit; the laws
  // they do not reach get their own here, each RED by name on the table's cells or on the leg that states the law, and each FAILS BY
  // NAME when its anchor is gone.
  const legMods = (DmX) => ({ req, express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, CM, Rm, Dm: DmX, startFakeKernel });
  const silent = () => true;
  const cellMutant = async (label, tag, apply, slice) => {
    const src = apply(bdSrc);
    if (!src || src === bdSrc) { ok(false, `MUTANT ${label}: its anchor is gone in src/server/browser-dialogs.js`); return; }
    const DmX = MUT.load('src/server/browser-dialogs.js', src, tag);
    const res = await executeCellSet(slice, { ...baseMods, Dm: DmX });
    const red = res.filter((r) => !r.pass).map((r) => r.cell.id);
    ok(slice.length > 0 && red.length === slice.length, `MUTANT ${label} RED on the table (${red.length}/${slice.length} cells RED)`, res.filter((r) => r.pass).map((r) => r.cell.id));
  };
  const once = (s, a, b) => (s.split(a).length === 2 ? s.replace(a, b) : null);
  // LAW S1 — A RESTART HOLDS: the cold start arms the unknown-typed hold on every tab that carried a fence or a guard
  await cellMutant('S1 (a restart does not hold)', 'r32-law-s1-restart-no-hold',
    (s) => once(s, '      armLiveFillOnTab(w, e, {\n        targetId: e.targetId,\n        urlAtFill: f.urlAtFill || tabLoginUrlOf(e),', '      if (false) armLiveFillOnTab(w, e, {   /* MUTANT S1 */\n        targetId: e.targetId,\n        urlAtFill: f.urlAtFill || tabLoginUrlOf(e),'),
    tableSpec.cells.filter((c) => c.conn === 'hub_restart' && c.expected.flavor === 'until_nav'));
  // LAW — A VALUE PUT BACK RE-ARMS: a guard that finds the typed value again holds the tab
  await cellMutant('PUT-BACK (a value put back does not re-arm)', 'r32-law-putback-no-rearm',
    (s) => once(s, "        if (verdict.action === 'rearm_held' && lastSnap) {", "        if (false && verdict.action === 'rearm_held' && lastSnap) {   /* MUTANT PUT-BACK */"),
    tableSpec.cells.filter((c) => c.conn === 'connected' && c.fence === 'none' && c.guards === 1 && c.url === 'same' && c.check === 'mem' && c.page === 'putback'));
  // LAW 5 — A CHECK BELONGS TO ITS DOCUMENT: a navigation seen mid-check starts a fresh check (the NavSeq leg states it)
  {
    const NAV = '(e.navSeq || 0) !== startNavSeq';
    const n = bdSrc.split(NAV).length - 1;
    if (n >= 2) {
      const DmX = MUT.load('src/server/browser-dialogs.js', bdSrc.split(NAV).join('false /* MUTANT LAW 5 */'), 'r32-law5-check-outlives-its-document');
      const r = await runR32NavSeqLeg({ mods: legMods(DmX), ok: silent });
      ok(r && r.ok === false, `MUTANT LAW 5 (a check outlives its document — ${n} navigation checks cut) RED on the NavSeq leg`, r);
    } else {
      ok(false, 'MUTANT LAW 5: its anchor is gone in src/server/browser-dialogs.js (the navigation checks of the post-lift recheck)');
    }
  }
  // Q3 — A LISTING SHOWS A FENCED TAB BY ITS ID AND ITS ADDRESS AT THE FILL (the Q3 leg states it)
  {
    const src = once(bdSrc, '    frameStr = maskFencedTargetInfos(pid, frameStr);\n', '    /* MUTANT Q3: the listing rewrite cut */\n');
    if (src) {
      const DmX = MUT.load('src/server/browser-dialogs.js', src, 'r32-q3-listing-unmasked');
      const r = await runR32Q3Leg({ mods: legMods(DmX), ok: silent });
      ok(r && r.premise === true && r.leaked > 0, `MUTANT Q3 (the listing shows a fenced tab's title and present address) RED on the Q3 leg — the value's bytes in ${r ? r.leaked : '?'} of its 2 forms`, r);
    } else {
      ok(false, 'MUTANT Q3: its anchor is gone in src/server/browser-dialogs.js (the listing rewrite in scrubCdpFrame)');
    }
  }

  // Q3's OTHER CLOSURES (主开发 2026-11-15 item 2), each with its mutant on the Q3 leg: a fenced tab's events pass by the argued list
  // (the mediator's copy back on the old four-event drop ⇒ the page's events carry the value out), the unjudged classes' readers are
  // closed (let through ⇒ refused no more), a fenced tab's dialog is told without its words (given ⇒ the value in the answer).
  const cmSrc = fs.readFileSync(path.join(repoDir, 'src/server/cdp-mediator.js'), 'utf8');
  const legModsCM = (CMX, DmX = Dm0) => ({ ...legMods(DmX), CM: CMX });
  const Dm0 = req('./src/server/browser-dialogs.js');
  const q3Mutant = async (label, file, src, tag, mods) => {
    if (!src) { ok(false, `MUTANT ${label}: its anchor is gone in ${file}`); return; }
    const X = MUT.load(file, src, tag);
    const r = await runR32Q3Leg({ mods: mods(X), ok: silent });
    ok(r && r.ok === false && r.premise === true, `MUTANT ${label} RED on the Q3 leg (the value's bytes in ${r ? r.leaked : '?'} of its 2 forms; the closed readers ${r && r.closedAnswers ? r.closedAnswers.filter((x) => x.refused).length : '?'} of 4 refused)`, r);
  };
  await q3Mutant('Q3-EVENTS (a fenced tab\'s events on the old four-event drop)', 'src/server/cdp-mediator.js',
    once(cmSrc, '!M.liveFillEventAllowed(ev, evTid)', "['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded', 'Audits.issueAdded'].includes(ev.method) /* MUTANT Q3-EVENTS: the old four-name drop */"), 'r32-q3-events-old-drop', (X) => legModsCM(X));
  await q3Mutant('Q3-CLOSED (the unjudged classes\' readers let through)', 'src/server/cdp-mediator.js',
    once(once(cmSrc, "            const lfv = M.liveFillCdpVerdict(msg.method, { allowVerb: typeof allowVerb === 'string' ? allowVerb : null, params: msg.params || null, holdReason: (lf && lf.holdReason) || '' });\n            if (lfv.refuse) {", "            const lfv = M.liveFillCdpVerdict(msg.method, { allowVerb: typeof allowVerb === 'string' ? allowVerb : null, params: msg.params || null, holdReason: (lf && lf.holdReason) || '' });\n            if (M.LIVE_FILL_CLOSED_METHODS.has(msg.method)) lfv.refuse = false; /* MUTANT Q3-CLOSED */\n            if (lfv.refuse) {") || '', "            const lfv = M.liveFillCdpVerdict(pend.method, { allowVerb: typeof allowVerb === 'string' ? allowVerb : null, params: pend.params || null, holdReason: (lfNow && lfNow.holdReason) || '' });\n            if (lfv.refuse) {", "            const lfv = M.liveFillCdpVerdict(pend.method, { allowVerb: typeof allowVerb === 'string' ? allowVerb : null, params: pend.params || null, holdReason: (lfNow && lfNow.holdReason) || '' });\n            if (M.LIVE_FILL_CLOSED_METHODS.has(pend.method)) lfv.refuse = false; /* MUTANT Q3-CLOSED (its reply) */\n            if (lfv.refuse) {"),
    'r32-q3-closed-readers-open', (X) => legModsCM(X));
  {
    const srcD = once(bdSrc, 'function agentDialogOf(d) { return d && d.fencedAt ? {', 'function agentDialogOf(d) { return d; /* MUTANT Q3-DIALOG */ return d && d.fencedAt ? {');
    if (srcD) {
      const DmD = MUT.load('src/server/browser-dialogs.js', srcD, 'r32-q3-dialog-words-told');
      const r = await runR32DialogLeg({ mods: { req, Dm: DmD }, repoDir, ok: silent });
      ok(r && r.ok === false && r.leaked > 0 && r.control === true, `MUTANT Q3-DIALOG (a fenced tab's dialog told with its words) RED on the dialog leg (the typed value in ${r ? r.leaked : '?'} of its 5 views)`, r);
    } else {
      ok(false, 'MUTANT Q3-DIALOG: its anchor is gone in src/server/browser-dialogs.js (agentDialogOf)');
    }
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
  await runR32LoginTable({ repoDir, ok: okCli });
  console.log(`=== R32 TABLE SUMMARY: ${pass}/${pass + fail} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
