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
 *     a persisted fence whose tab holds a NEW document after a cold Hub restart dropped (by document id, never address).
 *   - Leg 4 (`R32-Doors`): Both exit doors work live on a Shape S fenced tab (`tab new` / `tab <other>` and `reload`
 *     / navigation), while cross-origin requests from the fenced tab are blocked until reload/navigation.
 *   - Leg 5 (`R32-NavSeq`): `fixups-r32` Law 5 — in-flight `recheckPostLiftOnTab` held across `Page.frameNavigated`
 *     never false-fences a reloaded clean document and never hands a stale `{ ok: true }` to a new document's guard.
 *   - Leg 6 (`R32-Compat`): the one record kind — a shape that never shipped is not read (no fence, its scrub names
 *     stay), the one kind round-trips with exactly its six keys — + door-level `catch` fail-closed defense.
 *   - Exported `runR32Mutants`: `M1` (`mutate31.py`), `DOC` (an address move retires a guard) and one mutant per law,
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
/** The SECOND phase of a cold restart's cell (amendment 2): the vault is open, the values are back by the row's names — each kind
 *  follows its ordinary rules on its document (a still tab: the connected oracle, every check able to look); a fill whose entry is
 *  gone (the unknown cells' login was dropped) can never be checked: held until the tab is closed, saying so. */
export function expectedVerdictAfterUnlock(cell) {
  if (cell.fence === 'none' && !cell.guards) return { status: 200, code: null, flavor: 'allow', readableAtMovedUrl: false };
  if (cell.fence === 'unknown') return { status: 409, code: 'login_fill_live', flavor: 'entry_gone', readableAtMovedUrl: false };
  return expectedVerdictForCell({ ...cell, check: 'mem', conn: 'connected' });
}
export function expectedVerdictForCell({ fence, guards, check, page, url, conn }) {
  // lane chrome-157 (the owner's sentence, 2026-11-15): A GUARD BELONGS TO ITS DOCUMENT — an address move inside the document keeps
  // it, so a value an ordinary single-page app puts back after an in-app move re-arms there as it does at the old address (the
  // address axis now proves that a move retires nothing; no cell is ever readable with the value in it)
  const activeGuards = guards;
  const readableAtMovedUrl = false;
  // Law S1 (Shape S) + 主开发's amendment 1: a hub restart ends every recheck, and NO HOLD LIFTS UNCHECKED — before the vault is
  // unlocked and the values are back, every tab with a fence or a guard at the stop is held, its sentence naming the vault and the
  // door that always works (another tab). After the unlock: expectedVerdictAfterUnlock.
  if (conn === 'hub_restart') {
    if (fence !== 'none' || activeGuards > 0) {
      return { status: 409, code: 'login_fill_live', flavor: 'await_vault', readableAtMovedUrl: false };
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
              const cell = { id, fence, guards, check, page, url, conn, expected: expectedVerdictForCell({ fence, guards, check, page, url, conn }) };
              if (conn === 'hub_restart') cell.expectedUnlocked = expectedVerdictAfterUnlock(cell);
              cells.push(cell);
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
    // (a browser-level event — no session — to every connection: Target.targetInfoChanged and its kind)
    emitBrowserEvent(method, params) { for (const entry of state.watchSenders) entry.sendToClient({ method, params }); },
    // lane chrome-157 (主开发's P2): the same event as a NON-flat session receives it — wrapped in Target.receivedMessageFromTarget on the
    // browser's own connection, the inner session the one each connection holds for the tab
    emitWrappedEvent(targetId, method, params) {
      for (const entry of state.watchSenders) {
        const sid = entry.sessionsOnConn.get(String(targetId));
        if (sid) entry.sendToClient({ method: 'Target.receivedMessageFromTarget', params: { sessionId: sid, targetId: String(targetId), message: JSON.stringify({ method, params, sessionId: sid }) } });
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
const AWAIT_VAULT_RE = /checks this tab again once the vault is unlocked[\s\S]*open or switch to another tab/i;   // (lane chrome-157, amendment 1: the one sentence of a restored hold)
const ENTRY_GONE_RE = /no longer in the vault[\s\S]*open or switch to another tab/i;   // (…and of one whose entry is gone)
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
  if (expected.flavor === 'await_vault' && (!AWAIT_VAULT_RE.test(actual.resolveError) || !AWAIT_VAULT_RE.test(actual.med.error))) return false;
  if (expected.flavor === 'entry_gone' && (!ENTRY_GONE_RE.test(actual.resolveError) || !ENTRY_GONE_RE.test(actual.med.error))) return false;
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
        const expNow = restartUnlockedPass && c.expectedUnlocked ? c.expectedUnlocked : c.expected;   // (amendment 2: a cold restart's two phases)
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
        if ((restartUnlockedPass || c.conn !== 'hub_restart') && c.page === 'putback' && (c.check === 'mem' || restartUnlockedPass)
          && (c.fence === 'none' || c.fence === 'postLiftHeld') && !c.nothingToCheck) {   // (every address — a guard belongs to its document, a move retires nothing; Q7's cells: a check with nothing to look with cannot wipe — the hold keeps the value unread)
          const domAfterR1 = fk.readDomValues(c.tid).pw;
          if (domAfterR1 !== '') {
            const why = { why: 'resolve_did_not_wipe_putback_dom', domAfterR1, r1, ...(restartUnlockedPass ? { phase: 'after_unlock' } : {}) };
            const prev = restartUnlockedPass ? results.find((x) => x.cell.id === c.id) : null;
            if (prev) { prev.pass = false; prev.detail = why; } else results.push({ cell: c, pass: false, detail: why });
            continue;
          }
          await rawWs.writePw(c.tid, putVal);
        }

        const medRes = await medClient.readPw(c.tid);
        throwBudget.delete(c.tid);

        let followUpOk = true;
        if (expNow.flavor === 'check_failed') {
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
        const pass = matchesExpected(actual, expNow, ALL_SECRETS);
        if (restartUnlockedPass) {
          const prev = results.find((x) => x.cell.id === c.id);
          if (prev && !pass) {
            prev.pass = false;
            prev.detail = { why: 'failed_after_post_restart_vault_unlock', actual, expected: expNow };
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
      await sleep(400);   // (the restored holds are checked when the vault opens: every tab's check, then its kind's rules)
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
      // the page copies what was typed into its TITLE (document.title — no navigation) and into its ADDRESS the way Chrome does it: a
      // move inside the document (history.pushState) — a live fence lifts there by the SPA rule, and the one check holds it
      fk.setTitle(tidF, `welcome ${PWQ}`, `${U0}?echo=${encodeURIComponent(PWQ)}`);
      relay.emitTargetEvent(tidF, 'Page.navigatedWithinDocument', { frameId: tidF, url: `${U0}?echo=${encodeURIComponent(PWQ)}` });
      await sleep(150);
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
      for (const [m, prm, viaSession] of [['FindInPage.findFirst', { text: PWQ }, true], ['FindInPage.findNext', {}, true], ['FindInPage.findPrev', {}, true], ['HeadlessExperimental.beginFrame', { screenshot: { format: 'png' } }, true], ['Cast.startTabMirroring', { sinkName: 'q3-sink' }, true], ['Target.openDevTools', { targetId: tidF }, false]]) {
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
      relay.emitTargetEvent(tidF, 'Page.navigatedWithinDocument', { frameId: tidF, url: `${U0}?again=${encodeURIComponent(PWQ)}` });
      await sleep(80);
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
    // (lane chrome-157: `logins.isLocked()` reads no secret — the vault's state; the behaviour census R32-VAULT-READS is the proof that bites)
    const restoreTouchesVaultDirectly = /\blogins\.(?!isLocked\b)/.test(rearmBody) || /\bhydrate(?!PersistedScrubs)/.test(rearmBody + '\n' + vaultOpenBody);

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
      const allowedFenceKeys = new Set(['targetId', 'urlAtFill', 'docId', 'origin', 'at', 'browserKey', 'hold', 'refs']);   // (the one record kind: its document's id, its hold's word, opaque refs into the names list — no login identity in a row)
      const diskZeroIdentity = Boolean(diskPid)
        && !Object.prototype.hasOwnProperty.call(diskPid, 'guards')
        && Array.isArray(diskPid.fences) && diskPid.fences.length === 3
        && diskPid.fences.every((f) => Object.keys(f).every((k) => allowedFenceKeys.has(k)));

      // (b) Watch socket drops (simulating custom-kernel mode switch), then DIFFERENT browser spawns under same `PID`
      // (`browserOf` chrome PID/starttime changes AND `DEVTOOLS_ID` UUID changes; `tidMovedDown` also navigated to `U_MOVED`)
      relay.dropSockets();
      await sleep(35);
      browserRec = { state: 'ready', pid: 41001, starttime: '950001', startedAt: clock + 10 };   // (it REUSES the process number — another browser all the same: item 8)
      relay.state.uuid = 'bbbbbbbb-1111-4222-8333-444444444444';
      fk.setDom(tidMovedDown, { url: U_MOVED, newDocument: true, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });   // (it NAVIGATED while down: a new document)
      await rawWs.writePw(tidGuard, '');
      vault.lock('test', { quiet: true });   // (the replacement comes up with the vault locked: the record alone can answer)
      await dialogs.arm(PID);

      const lfValuesCleared = (LF.valuesForTarget(tidFence) || []).length === 0 && (LF.valuesForTarget(tidGuard) || []).length === 0;
      const readTab = (t) => post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: t });
      // lane chrome-157 (主开发's amendment 1): no hold lifts unchecked — before the values are back BOTH tabs are held (the one whose
      // document changed while down too), with the words naming the vault and the door that always works…
      const rGuardLocked = await readTab(tidGuard);
      const rMovedLocked = await readTab(tidMovedDown);
      // …and once the vault is open the values come back BY NAME (never from the old browser's RAM stash) and each tab follows its
      // kind's ordinary rules: the guard on its document with a clean page reads; the tab on a new, clean document is lifted
      await vault.unlock('r32-stash-pw');
      await sleep(80);
      const rGuardDifferentBrowser = await readTab(tidGuard);
      const rMovedWhileDown = await readTab(tidMovedDown);

      // (c) `removeProfile` drops `PID_DROP` persisted fences & RAM secrets immediately; `disarm` drops `PID` fences & RAM secrets
      const hadDropSecretsBefore = (LF.valuesForTarget(tidDrop) || []).length > 0;
      keeper.removeProfile(PID_DROP);
      const dropCleared = (LF.valuesForTarget(tidDrop) || []).length === 0 && (keeper.loginFenceStateOf(PID_DROP).fences || []).length === 0;
      dialogs.disarm(PID);
      const disarmCleared = (keeper.loginFenceStateOf(PID).fences || []).length === 0;

      ok(
        diskZeroIdentity
          && lfValuesCleared
          && [rGuardLocked, rMovedLocked].every((r) => r.status === 409 && r.json?.code === 'login_fill_live' && AWAIT_VAULT_RE.test(String(r.json?.error || '')))
          && rGuardDifferentBrowser.status === 200
          && rMovedWhileDown.status === 200
          && hadDropSecretsBefore && dropCleared && disarmCleared,
        'R32-Stash (RAM stash & browser identity laws): 0 login identity in a row on disk, replacement browser never inherits old RAM stash/LF secrets (with the vault locked every tab is held, a changed document too; once it opens the values come back by name and each tab follows its rules), and removeProfile + disarm drop stash/fences immediately',
        { diskPid, diskZeroIdentity, lfValuesCleared, rGuardLocked: rGuardLocked.status, rMovedLocked: rMovedLocked.status, rGuardDifferentBrowser: rGuardDifferentBrowser.status, rMovedWhileDown: rMovedWhileDown.status, hadDropSecretsBefore, dropCleared, disarmCleared },
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
    // Seed Shape S persisted fence directly on `tid1` (cold restart state, Vault never even created/unlocked!) — the one record kind,
    // its document the tab's present one
    keeper.saveLoginFenceState(PID, {
      fences: [{ targetId: tid1, urlAtFill: U0, docId: fk.loaderIdOf(tid1), origin: ORIGIN, at: clock - 5000, browserKey: KEY, hold: 'live', refs: [] }],
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

      // Door 1 AFTER A COLD RESTART (主开发's amendment 1): `reload` is admitted (`200`), but no hold lifts unchecked — the reloaded
      // document stays held until the vault is unlocked and the values are back (this hub has no vault: it never opens), with the
      // sentence naming the vault and the door that always works (another tab); cross-origin requests stay blocked
      const rReload = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['reload'], targetId: tid1 });
      fk.setDom(tid1, { url: U0, newDocument: true, elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
      relay.emitTargetEvent(tid1, 'Page.frameNavigated', { frame: { id: tid1, loaderId: fk.loaderIdOf(tid1), url: U0, securityOrigin: ORIGIN } });
      await sleep(30);
      const rReadTab1AfterReload = await post('/api/agent/browser/resolve', { profile: PID, handle: PID, wrapper: true, fenceCheckOnly: true, argv: ['snapshot', '-i'], targetId: tid1 });
      const medTab1AfterReload = await medWs.readPw(tid1);

      ok(
        blockedBeforeReload
          && rTabNew.status === 200 && rTabSwitch.status === 200
          && rReadTab2.status === 200 && medTab2.ok === true
          && rReadTab1StillFenced.status === 409
          && rReload.status === 200
          && rReadTab1AfterReload.status === 409 && AWAIT_VAULT_RE.test(String(rReadTab1AfterReload.json?.error || '')) && medTab1AfterReload.ok === false,
        'R32-Doors (Both exit doors & cross-origin block): a restored tab blocks cross-origin requests, Door 2 (`tab new` / `tab` + other tab read) works while the tab stays fenced, and after a cold restart a reload (Door 1) does NOT lift it before the vault is back — its sentence names the vault and the other tab',
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

  // ── Legs 7–12 (lane chrome-157, round 32 take-over — the owner's B): THE CURES, one scene each (runR32CureLegs above) ──────────
  await runR32CureLegs({ mods: { req, express, WebSocket, WebSocketServer, LF, VE, GS, BK, Lm, CM, Rm, Dm, startFakeKernel }, ok });

  // ── Leg 6: Bidirectional disk compatibility (`go-shape-s.md` #4) + door-level `catch` fail-closed defense ──────────
  try {
    // (a) lane chrome-157 (the owner's sentence — 6): a record of a shape that never shipped is NOT READ — the r22–r31 rows (no docId)
    // and their `guards` give no fence at all (the scrub list's names are their own record and stay); the ONE kind round-trips with
    // exactly its fields. No released version reads a fence record (measured on master: none exists), so no release direction is owed.
    const legacyNormalized = BP.normalizeRegistry({
      profiles: [{ id: 'bp-11223344', label: 'Legacy', createdAt: 1000 }],
      loginFences: {
        'bp-11223344': {
          fences: [{ targetId: 'T-FENCE', urlAtFill: 'https://leg.example.test/login', origin: 'https://leg.example.test', at: 12345, browserKey: 'bk-1', loginId: 'web-login:https://leg.example.test#alice', user: 'alice', typedSlot: 'current', rev: 3, postLiftHeld: true }],
          guards: [{ targetId: 'T-GUARD', urlAtFill: 'https://leg.example.test/step2', origin: 'https://leg.example.test', at: 12346, browserKey: 'bk-1' }],
          scrubs: [{ name: 'web-login:https://leg.example.test#alice', at: 12345 }],
        },
      },
    });
    const legEntry = legacyNormalized.loginFences?.['bp-11223344'] || { fences: [], scrubs: [] };
    const oneKind = BP.normalizeRegistry({
      profiles: [{ id: 'bp-55667788', label: 'OneKind', createdAt: 1000 }],
      loginFences: { 'bp-55667788': { fences: [
        { targetId: 'T-ONE', urlAtFill: 'https://one.example.test/login', docId: 'L-T-ONE.1', origin: 'https://one.example.test', at: 777, browserKey: 'bk-1', user: 'never-kept', hold: 'value_shown', refs: ['n0011aabb', 'web-login:never-a-name'] },
        { targetId: 'T-UNKNOWN', urlAtFill: 'https://one.example.test/login', docId: '', origin: 'https://one.example.test', at: 778, hold: 'live', refs: [] },
        { targetId: 'T-NOWORD', urlAtFill: 'https://one.example.test/login', docId: 'L-T-NOWORD.1', origin: 'https://one.example.test', at: 779 },
        { targetId: 'T-BADWORD', urlAtFill: 'https://one.example.test/login', docId: 'L-T-BADWORD.1', origin: 'https://one.example.test', at: 780, hold: 'open' },
      ], scrubs: [] } },
    }).loginFences?.['bp-55667788'];
    // (lane chrome-157, the persisted hold: the one kind = its fields + its hold's WORD + opaque refs; a row WITH a word is read whatever
    // its document id — an empty one is «unknown», the same document — and a row without a word of the closed set is not read)
    const allowedKeys = ['targetId', 'urlAtFill', 'docId', 'origin', 'at', 'browserKey', 'hold', 'refs'];
    const legacyToShapeSOk = (legEntry.fences || []).length === 0
      && Array.isArray(legEntry.scrubs) && legEntry.scrubs.length === 1
      && Boolean(oneKind) && oneKind.fences.length === 2 && JSON.stringify(Object.keys(oneKind.fences[0]).sort()) === JSON.stringify([...allowedKeys].sort())
      && oneKind.fences[0].docId === 'L-T-ONE.1' && oneKind.fences[0].hold === 'value_shown' && JSON.stringify(oneKind.fences[0].refs) === JSON.stringify(['n0011aabb'])
      && oneKind.fences[1].targetId === 'T-UNKNOWN' && oneKind.fences[1].docId === '';

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
      legacyToShapeSOk && doorCatchOk,
      'R32-Compat (the one record kind & door catch): a record of a shape that never shipped gives no fence (its scrub names stay), the one kind {targetId, urlAtFill, docId, origin, at, browserKey, hold, refs} round-trips with no login identity — a row with a word read whatever its document id, one without a word of the closed set not read — and cdp-mediator rejects fail-closed on direct recheck rejection',
      { legacyToShapeSOk, legEntry, oneKind, medRejectRes },
    );
  } catch (e) {
    ok(false, 'R32-Compat (Disk compatibility & door catch)', String(e && e.stack || e));
  }

  return tableSummary;
}

// ── THE CURES (lane chrome-157, round 32 take-over — the owner's B: «防误操作不防 agent 故意攻击，除非能数学上证明防住», we defend against
// mistakes, not against an agent's deliberate attack, unless the defence can be proven to hold). One scene per cure; each is a
// mistake an ordinary site, a restart or a slow page makes BY ITSELF. Every leg answers its own result, so a mutant drives the same
// leg and must turn it red. ────────────────────────────────────────────────────────────────────────────────────────────────────
const CURE_PW = 'Cu6!r3';   // (short ON PURPOSE: under the mask's floor, so masking cannot hide a leak)
const CURE_VPW = 'r32-table-vault-pw';
const PW_EL = { id: 'pw', tag: 'input', type: 'password', name: 'Password' };
const b64State = (pw) => Buffer.from(JSON.stringify({ u: 'dana', p: pw })).toString('base64url');
const formSpelling = (pw) => new URLSearchParams([['a', pw]]).toString().slice(2);   // (how an HTML form writes it: «!» as %21)
const valueForms = (pw) => [...new Set([pw, encodeURIComponent(pw), formSpelling(pw), b64State(pw)])];

/** A fake kernel behind a relay, and a hub (mediator, keeper, vault, grants, logins, dialogs, routes) that can be STOPPED and
 *  started again on the same data — a restart; the For-you notices it files are counted. */
export async function cureScene(mods, label, KEY, { tabs = 1, unknownDoc = [] } = {}) {   // (exported: a reproducer or a measurement drives the same scene)
  const { express, WebSocket, WebSocketServer, VE, GS, BK, Lm, CM, Rm, Dm, LF, startFakeKernel } = mods;
  const ORIGIN = `https://${label}.example.test`;
  const U0 = `${ORIGIN}/login`;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vs-r32-${label}-`));
  const dataDir = path.join(tmpRoot, 'd');
  const homeDir = path.join(tmpRoot, 'h');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(homeDir, { recursive: true, mode: 0o700 });
  const clk = { t: 1_769_000_000_000 };
  const fk = await startFakeKernel({ firstUrl: `${ORIGIN}/seed`, mode: { standard: true, omitFilledPassword: true } });
  const relay = await startKernelRelay(WebSocket, WebSocketServer, fk);
  const raw = await openCdpClient(WebSocket, fk.wsUrl);
  const tids = [];
  for (let i = 0; i < Math.max(1, tabs); i++) { const t = fk.addTarget(U0); fk.setDom(t, { url: U0, elements: [PW_EL] }); tids.push(t); }
  const tid = tids[0];
  // (a tab whose document id is never read: its frame-tree answer does not come in time — the hub's 1.5 s bound — while `dropDoc`)
  const unknownSet = new Set(unknownDoc.map((i) => tids[i]).filter(Boolean));
  const ctl = { dropDoc: unknownSet.size > 0 };
  const droppedOnce = new Set();
  relay.state.hook = async (msg, { sessionsOnConn }) => {
    if (!ctl.dropDoc || msg.method !== 'Page.getFrameTree' || !msg.sessionId || droppedOnce.has(msg.sessionId)) return false;
    for (const [t, sid] of sessionsOnConn) if (sid === msg.sessionId && unknownSet.has(t)) { droppedOnce.add(msg.sessionId); return true; }   // (the watch's first look: no answer)
    return false;
  };
  // (the wipe of a tab told to be slow or crowded: 'throw' = the page never answers a check; 'too_much' = too much text to check)
  const wipeMode = new Map();
  const origWipe = LF.wipeTabTypedInputs;
  LF.wipeTabTypedInputs = (o, ...rest) => {
    const m = wipeMode.get(String((o && o.targetId) || ''));
    if (m === 'throw') throw new Error('the page does not answer');
    if (m === 'too_much') return Promise.resolve({ ok: true, wiped: 0, verifiedEmpty: false, tooMuchText: true });
    return origWipe(o, ...rest);
  };
  const SID = `sess-r32-${label}`;
  const TOKEN = `vsst_r32_${label}_` + crypto.randomBytes(6).toString('hex');
  // (the For-you store's own key rules, as the browser wiring gets them: a filing under an OPEN item's key is that item — nothing
  // raised again (`raises` counts the filings that raised one); `sweep(prefix)` resolves the open items whose key starts so)
  const notices = [];
  const tray = { raises: 0 };
  const forYou = {
    add: (_pid, item) => {
      const key = item && item.itemKey ? String(item.itemKey) : null;
      const open = key ? notices.find((x) => x.key === key && !x.resolved) : null;
      if (open) return open.id;
      const id = `n${notices.length + 1}`; tray.raises++;
      notices.push({ id, key, text: String((item && item.text) || ''), resolved: false });
      return id;
    },
    resolve: (id) => { const n = notices.find((x) => x.id === id); if (n) n.resolved = true; },
    sweep: (prefix) => { let k = 0; for (const n of notices) if (!n.resolved && n.key && n.key.startsWith(String(prefix))) { n.resolved = true; k++; } return k; },
  };
  let pid = null, prof = null;
  const hubs = [];
  async function start({ fresh = false, wrapLogins = null } = {}) {
    const med = CM.create({ log: quiet });
    await med.listen();
    const keeper = BK.create({ dataDir, homeDir, env: () => ({ HOME: homeDir }), liveKeys: () => new Set([KEY]), log: quiet, now: () => clk.t, install: false, mediator: med });
    const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clk.t });
    if (fresh) await vault.setup(CURE_VPW);
    const grants = GS.create({ dataDir, wss: { clients: new Set() }, log: quiet.log });
    const logins0 = Lm.create({ vault, grants: () => grants, now: () => clk.t, log: quiet.log });
    if (fresh) {
      logins0.addOwn({ origin: ORIGIN, username: 'dana', password: CURE_PW }, { who: 'owner' });
      grants.set('browser-login', `${ORIGIN}#*`, { to: [{ kind: 'everyone' }], except: [] });
      prof = keeper.createProfile({ label: `R32${label}`, sharing: 'owner' }, { owner: { kind: 'instance', id: null } });
      pid = prof.id;
    } else {
      prof = keeper.profile(pid);
    }
    const logins = wrapLogins ? wrapLogins(logins0) : logins0;
    const grant = await med.grantFor({ profileId: pid, browserKey: KEY, upstream: relay.wsUrl(), targetIds: [tid], mode: 'scope' });
    const kw = {
      ...keeper,
      cdpEndpointFor: async (id) => (id === pid ? { ok: true, url: relay.wsUrl() } : { ok: false }),
      leasesFor: () => [{ profileId: pid, browserKey: KEY, sessionId: SID }],
      statusFor: () => ({ ephemeral: null, pin: pid, leases: [{ profileId: pid, alias: 'c1', isDefault: true }] }),
      setFor: () => ({ defaultId: pid, attachments: [{ profileId: pid, alias: 'c1', label: 'R32', isDefault: true }], handles: ['c1'] }),
      resolveFor: () => ({ ok: true, kind: 'attachment', handle: 'c1', attachment: { profileId: pid, alias: 'c1', isDefault: true }, handles: ['c1'], isDefault: true }),
      attach: async () => ({ ok: true, profile: prof, browser: { state: 'ready' }, lease: { profileId: pid, browserKey: KEY, sessionId: SID, since: clk.t }, cdpUrl: grant.url, env: [], pinTab: false, others: 0 }),
    };
    const dialogs = Dm.create({ keeper: kw, logins, forYou, now: () => clk.t, holdersOf: () => [{ browserKey: KEY, sessionId: SID }], leaseCountOf: () => 1, log: quiet });
    Rm.setup({ keeper: kw, activeSessions: new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Agent R32', cwd: tmpRoot, backendSessionId: `conv-${label}` }]]), dialogs, logins, tasksForSession: () => [] });
    const app = express(); app.use(express.json()); app.use(Rm.router);
    const srv = await new Promise((r) => { const sv = app.listen(0, '127.0.0.1', () => r(sv)); });
    const post = async (u, body) => {
      const r = await fetch(`http://127.0.0.1:${srv.address().port}${u}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json() };
    };
    const h = { med, keeper, vault, grants, logins, dialogs, srv, post, grantUrl: grant.url, stopped: false };
    hubs.push(h);
    return h;
  }
  async function stop(h) {   // the hub's process ends: its memory goes with it
    if (!h || h.stopped) return;
    h.stopped = true;
    try { h.srv.close(); } catch { /* */ }
    try { h.dialogs.shutdown(); } catch { /* */ }
    try { h.keeper.shutdown(); } catch { /* */ }
    try { h.vault.close(); } catch { /* */ }
    try { await h.med.shutdown(); } catch { /* */ }
    try { LF.clearAllFilledSecrets?.(); } catch { /* */ }
  }
  const bind = (h, t = null) => { for (const x of (t ? [t] : tids)) h.dialogs.bindTab?.({ profileId: pid, browserKey: KEY }, x); h.dialogs.noteActiveTab?.({ profileId: pid, browserKey: KEY }, t || tid); };
  const fill = async (h, t = tid) => {
    await h.dialogs.arm(pid);
    bind(h, t);
    return h.post('/api/agent/browser/fill-vault', { profile: pid, target: '#pw', spec: `${label}.example.test#dana/password`, targetId: t });
  };
  const read = (h, t = tid) => h.post('/api/agent/browser/resolve', { profile: pid, handle: pid, wrapper: true, fenceCheckOnly: true, argv: ['get', 'value', '#pw'], targetId: t });
  const medRead = async (h, t = tid) => { const c = await openCdpClient(WebSocket, h.grantUrl); try { return await c.readPw(t); } finally { c.close(); } };
  /** The page goes to `url`: a NEW document (its own loaderId, Page.frameNavigated) or a move INSIDE the document. */
  const nav = async (url, { newDocument = true, keepValue = false, wait = 150 } = {}, t = tid) => {
    const cur = keepValue ? (fk.readDomValues(t).pw || '') : '';
    fk.setDom(t, { url, newDocument, elements: [{ ...PW_EL, ...(cur ? { value: cur } : {}) }] });
    const [bare, frag] = (() => { const i = url.indexOf('#'); return i < 0 ? [url, ''] : [url.slice(0, i), url.slice(i)]; })();   // (Chrome's own shape: the fragment rides apart, frame.urlFragment)
    if (newDocument) relay.emitTargetEvent(t, 'Page.frameNavigated', { frame: { id: t, loaderId: fk.loaderIdOf(t), url: bare, ...(frag ? { urlFragment: frag } : {}), securityOrigin: ORIGIN, mimeType: 'text/html' }, type: 'Navigation' });
    if (newDocument) relay.emitBrowserEvent('Target.targetInfoChanged', { targetInfo: { targetId: t, type: 'page', title: url, url, attached: true, canAccessOpener: false, browserContextId: 'ctx-1' } });   // (Chrome's own: the new document's title — the fake's is its address)
    else relay.emitTargetEvent(t, 'Page.navigatedWithinDocument', { frameId: t, url });
    if (wait) await sleep(wait);
  };
  const closeTab = async (t) => { await raw.call('Target.closeTarget', { targetId: t }, undefined, 800); await sleep(80); };
  const close = async () => {
    LF.wipeTabTypedInputs = origWipe;
    relay.state.hook = null;
    for (const h of hubs) await stop(h);
    raw.close();
    await relay.close();
    await fk.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  };
  const verdictOf = (r) => ({ status: r.status, code: (r.json && r.json.code) || null, doors: TWO_DOORS_RE.test(String((r.json && r.json.error) || '')), shown: /own address or title/.test(String((r.json && r.json.error) || '')), awaits: AWAIT_VAULT_RE.test(String((r.json && r.json.error) || '')), gone: /no longer in the vault/.test(String((r.json && r.json.error) || '')) });
  return { ORIGIN, U0, KEY, tid, tids, fk, relay, raw, notices, tray, ctl, wipeMode, clk, dataDir, start, stop, bind, fill, read, medRead, nav, closeTab, close, verdictOf, get pid() { return pid; } };
}

/** item 7 — A CHECK THAT KEEPS FAILING HAS A BOUND: a guard whose page put the value back and never answers the check is «try again»
 *  a bounded number of times, then held until it navigates (the refusal names both doors); a new document ends the hold. */
async function cureBound(mods) {
  const { LF } = mods;
  const s = await cureScene(mods, 'cbound', 'bk-0000c0a1');
  try {
    const h = await s.start({ fresh: true });
    const fill = await s.fill(h);
    s.clk.t += 16 * 60_000;
    h.dialogs.liveFillOnTarget(s.pid, s.tid);   // the ceiling: the fence lifts with its wipe, a guard is born
    for (let i = 0; i < 200 && h.dialogs.liveFillOnTarget(s.pid, s.tid); i++) await sleep(12);
    await sleep(60);
    const guardOnly = !h.dialogs.liveFillOnTarget(s.pid, s.tid) && Boolean(h.dialogs.hasPostLiftGuard(s.pid, s.tid));
    await s.raw.writePw(s.tid, CURE_PW);   // the page puts the value back…
    const orig = LF.wipeTabTypedInputs;
    LF.wipeTabTypedInputs = () => { throw new Error('the page does not answer'); };   // …and never answers a check
    // (M4: …and writes it into its address by a move inside the document: the hold that follows keeps the address AT THE FILL)
    await s.nav(`${s.ORIGIN}/login?typed=${encodeURIComponent(CURE_PW)}`, { newDocument: false, keepValue: true });
    const reads = [];
    try {
      for (let i = 0; i < 6; i++) { s.clk.t += 60_000; reads.push(s.verdictOf(await s.read(h))); }
    } finally { LF.wipeTabTypedInputs = orig; }
    const med = await s.medRead(h);
    const storeLeaks = storeHolds(s);
    const lc = await openCdpClient(mods.WebSocket, h.grantUrl);
    const listing = await lc.call('Target.getTargets', {}, undefined, 800);
    lc.close();
    const listingLeak = valueForms(CURE_PW).some((v) => JSON.stringify(listing).includes(v));
    const firstHold = reads.findIndex((r) => r.status === 409 && r.code === 'login_fill_live' && r.doors);
    const bounded = firstHold >= 1 && reads.slice(0, firstHold).every((r) => r.status === 409 && r.code === 'login_check_failed')
      && reads.slice(firstHold).every((r) => r.status === 409 && r.code === 'login_fill_live' && r.doors);
    await s.nav(`${s.ORIGIN}/login?again=1`);   // door 1: a new document
    const afterNav = s.verdictOf(await s.read(h));
    const ok = fill.status === 200 && guardOnly && bounded && med.ok === false && afterNav.status === 200 && !storeLeaks.length && !listingLeak;
    return { ok, fill: fill.status, guardOnly, reads, firstHold, medRefused: med.ok === false, afterNav, storeLeaks, listingLeak };
  } finally { await s.close(); }
}

/** items 1 and 2 — THE ONE CHECK: an ordinary site carries what was typed into its NEXT address by itself (a form that goes by GET; a
 *  router that keeps its form's state in the address, base64); at the lift, while the hub holds the value, the new address is
 *  compared with it — found ⇒ the tab stays fenced, the owner is told ONCE, and the navigation event the agent's own session
 *  receives names the address at the fill; a clean next document lifts it and the notice goes. */
async function cureNext(mods) {
  const { WebSocket } = mods;
  const s = await cureScene(mods, 'cnext', 'bk-0000c0a2', { tabs: 2 });
  try {
    const h = await s.start({ fresh: true });
    // (the pin that stays: a tab with NO fill pays nothing — its navigations never reach the check)
    await h.dialogs.arm(s.pid); s.bind(h);
    const BLm = mods.req ? mods.req('./src/browser-login.js') : null;
    let unfencedChecks = 0;
    const origVerdict = BLm && BLm.valueShownVerdict;
    if (BLm) BLm.valueShownVerdict = (...a) => { unfencedChecks++; return origVerdict(...a); };
    try {
      await s.nav(`${s.ORIGIN}/welcome?pw=${encodeURIComponent(CURE_PW)}`, {}, s.tids[1]);
      await s.nav(`${s.ORIGIN}/elsewhere`, { newDocument: false }, s.tids[1]);
    } finally { if (BLm) BLm.valueShownVerdict = origVerdict; }
    const fill = await s.fill(h);
    const ag = await openCdpClient(WebSocket, h.grantUrl);   // an ordinary agent: its own session on the tab
    const agFrames = [];
    ag.ws.on('message', (d) => { if (agFrames.length < 5000) agFrames.push(String(d)); });
    const att = await ag.call('Target.attachToTarget', { targetId: s.tid, flatten: true });
    const attached = Boolean(att && att.result && att.result.sessionId);
    // (M3: a form that goes by GET writes the value in the FORM spelling, beside a stray percent sign and a non-UTF-8 sequence elsewhere)
    const GET_URL = `${s.ORIGIN}/welcome?note=100%&x=%C3%28&pw=${formSpelling(CURE_PW)}`;
    await s.nav(GET_URL);   // a form that goes by GET
    const rawList = await s.raw.call('Target.getTargets', {}, undefined, 800);
    const premise = JSON.stringify(rawList).includes(formSpelling(CURE_PW));
    const heldGet = Boolean(h.dialogs.liveFillOnTarget(s.pid, s.tid));
    const readGet = s.verdictOf(await s.read(h));
    const medGet = await s.medRead(h);
    const medSaysShown = medGet.ok === false && /own address or title/.test(String(medGet.error || ''));
    await s.nav(`${s.ORIGIN}/welcome?state=${b64State(CURE_PW)}`);   // a router that keeps its form's state in the address
    const heldB64 = Boolean(h.dialogs.liveFillOnTarget(s.pid, s.tid));
    const readB64 = s.verdictOf(await s.read(h));
    // (P2: a NON-flat session receives the navigation wrapped in Target.receivedMessageFromTarget — the mask holds there too)
    s.relay.emitWrappedEvent(s.tid, 'Page.frameNavigated', { frame: { id: s.tid, loaderId: s.fk.loaderIdOf(s.tid), url: `${s.ORIGIN}/welcome?again=${encodeURIComponent(CURE_PW)}`, securityOrigin: s.ORIGIN, mimeType: 'text/html' }, type: 'Navigation' });
    await sleep(80);
    const wrappedSeen = agFrames.some((f) => f.includes('"Target.receivedMessageFromTarget"') && f.includes('Page.frameNavigated'));
    const toldOnce = s.notices.filter((n) => /own address or title/.test(n.text)).length === 1;
    await s.nav(`${s.ORIGIN}/home`);   // the site's clean next page
    const readClean = s.verdictOf(await s.read(h));
    const noticeGone = s.notices.filter((n) => /own address or title/.test(n.text)).every((n) => n.resolved);
    await sleep(50);
    ag.close();
    const navs = agFrames.filter((f) => f.includes('"Page.frameNavigated"'));
    const leaked = agFrames.filter((f) => valueForms(CURE_PW).some((v) => f.includes(v))).length;
    const ok = fill.status === 200 && attached && premise && heldGet && readGet.status === 409 && readGet.shown && medSaysShown && heldB64 && readB64.status === 409 && readB64.shown && toldOnce
      && readClean.status === 200 && noticeGone && navs.length >= 3 && navs[navs.length - 1].includes('/home') && leaked === 0 && wrappedSeen && unfencedChecks === 0;
    return { ok, fill: fill.status, attached, premise, wrappedSeen, unfencedChecks, heldGet, readGet, medSaysShown, heldB64, readB64, toldOnce, readClean, noticeGone, navEvents: navs.length, leaked };
  } finally { await s.close(); }
}

/** scene 16 of the real-browser claim — THE FRAGMENT: Chrome sends a navigation's fragment apart (frame.urlFragment); a page whose next
 *  address carries the value ONLY in its fragment is held all the same, and the agent's own navigation event carries none of it. */
async function cureFragment(mods) {
  const { WebSocket } = mods;
  const s = await cureScene(mods, 'cfrag', 'bk-0000c0b3');
  try {
    const h = await s.start({ fresh: true });
    const fill = await s.fill(h);
    const ag = await openCdpClient(WebSocket, h.grantUrl);
    const agFrames = [];
    ag.ws.on('message', (d) => { if (agFrames.length < 2000) agFrames.push(String(d)); });
    await ag.call('Target.attachToTarget', { targetId: s.tid, flatten: true });
    await s.nav(`${s.ORIGIN}/welcome#pw=${encodeURIComponent(CURE_PW)}`);
    const held = Boolean(h.dialogs.liveFillOnTarget(s.pid, s.tid));
    const read = s.verdictOf(await s.read(h));
    await sleep(40);
    ag.close();
    const leaked = agFrames.filter((f) => valueForms(CURE_PW).some((v) => f.includes(v))).length;
    const sawNav = agFrames.some((f) => f.includes('"Page.frameNavigated"'));
    return { ok: fill.status === 200 && held && read.status === 409 && read.shown && sawNav && leaked === 0, fill: fill.status, held, read, sawNav, leaked };
  } finally { await s.close(); }
}

/** item 4 — A RESTART OR A RECONNECT HOLDS BY THE DOCUMENT: a fill is live, the page moves its address INSIDE the document while
 *  nobody watches (the value still in its box); after a cold restart (the vault locked) and after a same-process reconnect the tab
 *  is held on both doors; a new document ends it. */
async function cureRestarts(mods) {
  const out = {};
  for (const mode of ['restart-move', 'reconnect-move']) {
    const s = await cureScene(mods, mode === 'restart-move' ? 'crst' : 'crcn', mode === 'restart-move' ? 'bk-0000c0a3' : 'bk-0000c0a4');
    try {
      const h1 = await s.start({ fresh: true });
      const fill = await s.fill(h1);
      let h = h1;
      if (mode === 'restart-move') {
        await s.stop(h1);
        await s.nav(`${s.ORIGIN}/login/step2`, { newDocument: false, keepValue: true });   // (nobody watches: no event reaches a hub)
        s.clk.t += 2000;
        h = await s.start();
        await h.dialogs.arm(s.pid);
        s.bind(h);
      } else {
        h1.dialogs.disarm(s.pid, 'the watch changed hands');
        await s.nav(`${s.ORIGIN}/login/step2`, { newDocument: false, keepValue: true });
        await h1.dialogs.arm(s.pid);
        await sleep(60);
      }
      const valueInBox = s.fk.readDomValues(s.tid).pw === CURE_PW;
      const r = s.verdictOf(await s.read(h));
      const med = await s.medRead(h);
      await s.nav(`${s.ORIGIN}/login?fresh=1`);   // door 1: a new document
      const afterNav = s.verdictOf(await s.read(h));
      if (mode === 'restart-move') {
        // (主开发's amendment 1) a COLD restart: held — the sentence names the vault — through the new document too, until the vault is
        // unlocked and the values are back; then the new document is checked (clean) and lifted
        await h.vault.unlock(CURE_VPW);
        await sleep(80);
        const afterUnlock = s.verdictOf(await s.read(h));
        out[mode] = { ok: fill.status === 200 && valueInBox && r.status === 409 && r.code === 'login_fill_live' && r.awaits && med.ok === false
          && afterNav.status === 409 && afterNav.awaits && afterUnlock.status === 200,
        fill: fill.status, valueInBox, read: r, medRefused: med.ok === false, afterNav, afterUnlock };
      } else {
        out[mode] = { ok: fill.status === 200 && valueInBox && r.status === 409 && r.code === 'login_fill_live' && r.doors && med.ok === false && afterNav.status === 200,
          fill: fill.status, valueInBox, read: r, medRefused: med.ok === false, afterNav };
      }
    } finally { await s.close(); }
  }
  return { ok: Object.values(out).every((x) => x.ok), ...out };
}

/** item 5 — THE WINDOW AFTER A RESTART: the watch is open but the fences are not back yet (the browser is slow to list its tabs);
 *  every road answers from the record meanwhile — the hub's verb and the agent's own CDP read. */
async function cureWindow(mods) {
  const s = await cureScene(mods, 'cwin', 'bk-0000c0a5');
  try {
    const h1 = await s.start({ fresh: true });
    const fill = await s.fill(h1);
    await s.stop(h1);
    s.clk.t += 2000;
    const h = await s.start();
    let held = false;
    s.relay.state.hook = async (msg, { upWs }) => {
      if (!held && msg.method === 'Target.getTargets') {
        held = true;
        setTimeout(() => { try { upWs.send(JSON.stringify(msg)); } catch { /* */ } }, 2500);
        return true;
      }
      return false;
    };
    const armP = h.dialogs.arm(s.pid);
    await sleep(150);
    const w = h.dialogs._watches.get(s.pid);
    const inWindow = Boolean(w && w.state === 'open' && !w.fencesRearmed);
    const r = s.verdictOf(await s.read(h));
    const med = await s.medRead(h);
    const stillWindow = Boolean(w && !w.fencesRearmed);
    await armP;
    s.relay.state.hook = null;
    const ok = fill.status === 200 && held && inWindow && stillWindow && r.status === 409 && r.code === 'login_fill_live' && med.ok === false;
    return { ok, fill: fill.status, delayed: held, inWindow, stillWindow, read: r, medRefused: med.ok === false, medGotValue: med.ok === true && med.value === CURE_PW };
  } finally { await s.close(); }
}

/** item 8 — A REPLACEMENT BROWSER THAT REUSES THE PROCESS NUMBER IS ANOTHER BROWSER (PURE, on THE one identity). */
function cureIdentity(BKx) {
  const f = BKx.browserIdentityOfRecord;
  const same = (a, b) => typeof a === 'string' && a !== '' && a === b;
  const U1 = 'ws://127.0.0.1:1/devtools/browser/aaaaaaaa-1111-4222-8333-444444444444';
  const U2 = 'ws://127.0.0.1:1/devtools/browser/bbbbbbbb-1111-4222-8333-444444444444';
  const UK = 'ws://127.0.0.1:1/kernel';   // (a kernel whose address names no browser id)
  const old = { state: 'ready', pid: 41001, starttime: '900001', startedAt: 1 };
  const reuse = { state: 'ready', pid: 41001, starttime: '950001', startedAt: 11 };
  const rows = {
    reconnectSame: same(f(old, U1), f(old, U1)),
    pidReuseOther: !same(f(old, U1), f(reuse, U2)),
    pidReuseOtherNoUuid: !same(f(old, UK), f(reuse, UK)),
    stoppedNobodys: f({ ...old, state: 'stopped' }, U1) === null,
  };
  return { ok: Object.values(rows).every(Boolean), ...rows };
}

/** item 9 — ON A RESTORE ONLY THE SCRUB LIST'S RE-HYDRATION READS THE VAULT: every call the restored hub makes into the web logins
 *  (the vault's one door for it) is recorded by a proxy, with whether hydratePersistedScrubs is on its stack — an alias of the logins
 *  object is the same proxy, so it is seen; the next fill's read is seen too (the census sees what happens). */
async function cureVaultReads(mods) {
  const s = await cureScene(mods, 'cvlt', 'bk-0000c0a6');
  try {
    const h1 = await s.start({ fresh: true });
    const fill = await s.fill(h1);
    await s.stop(h1);
    s.clk.t += 2000;
    // the record names the login whose values the scrub list masks (a value under the mask's floor is never named: one is written,
    // so the restore's re-hydration really reads)
    const recFile = path.join(s.dataDir, 'browser-profiles.json');
    const doc = JSON.parse(fs.readFileSync(recFile, 'utf8'));
    doc.loginFences[s.pid].scrubs = [{ name: 'web-login:https://cvlt.example.test#dana', at: s.clk.t - 1000 }];
    fs.writeFileSync(recFile, JSON.stringify(doc));
    const calls = [];
    let phase = 'restore';
    const wrapLogins = (l) => new Proxy(l, {
      get(t, k, rcv) {
        const v = Reflect.get(t, k, rcv);
        if (typeof v !== 'function') return v;
        return function (...a) { calls.push({ name: String(k), arg: typeof a[0] === 'string' ? a[0] : null, phase, inHydrate: /hydratePersistedScrubs/.test(String(new Error().stack)) }); return v.apply(t, a); };
      },
    });
    const h = await s.start({ wrapLogins });
    await h.dialogs.arm(s.pid);
    s.bind(h);
    await h.vault.unlock(CURE_VPW);
    await sleep(80);
    const restoreRead = s.verdictOf(await s.read(h));
    phase = 'after';
    await s.nav(`${s.ORIGIN}/login?fresh=1`);
    const fill2 = await h.post('/api/agent/browser/fill-vault', { profile: s.pid, target: '#pw', spec: `cvlt.example.test#dana/password`, targetId: s.tid });
    const SUBSCRIPTIONS = new Set(['onVaultOpen', 'onVaultLock', 'isLocked']);   // (isLocked: the vault's state, no secret)
    const recordNames = new Set(['web-login:https://cvlt.example.test#dana']);
    // (主开发's P3: inside the re-hydration only the record's OWN names are read — never another name, never a listing)
    const outside = calls.filter((c) => c.phase === 'restore' && (c.inHydrate ? !(c.name === 'scrubSecretsOf' && recordNames.has(c.arg)) : !SUBSCRIPTIONS.has(c.name))).map((c) => c.name + (c.inHydrate ? '@hydrate' : ''));
    const seenAfter = calls.some((c) => c.phase === 'after' && c.name === 'resolveFill');
    const hydrated = calls.some((c) => c.phase === 'restore' && c.inHydrate && c.name === 'scrubSecretsOf');
    const ok = fill.status === 200 && restoreRead.status === 409 && hydrated && outside.length === 0 && seenAfter;   // (the census's controls: the re-hydration's read and the next fill's are seen)
    return { ok, fill: fill.status, restoreRead, hydrated, restoreCalls: calls.filter((c) => c.phase === 'restore').map((c) => `${c.name}${c.inHydrate ? '@hydrate' : ''}`), outside, fill2: fill2.status, seenAfter };
  } finally { await s.close(); }
}

// ── THE HOLD TABLE (lane chrome-157, round 32's persisted hold — 主开发's GO 2026-11-15 + amendments 1–3): THE HOLD IS ONE STATE WITH
// ONE PERSISTED FORM, AND THE TABLE WALKS IT. hold kind (browser-login HOLD_WORDS) × the document id known / unknown × a same-process
// reconnect / a cold restart × the tab still / reloaded / gone to another page / closed; a cold restart in TWO phases (before the
// values are back; after), and per kind a cell whose entry is GONE when the vault opens. Per cell: closed at least as before, with
// the kind's words on both doors; the store grepped for every form of the value: nothing; the owner's notice open exactly while
// the hold stands. A CENSUS: the kinds are the source's own — a HOLD_* reason without its word, or a word without its producer, is red.
const HOLD_AFTERS = ['still', 'reload', 'other', 'closed'];
const HOLD_NOTICE_KINDS = new Set(['value_shown', 'too_much_text', 'unknown_typed']);   // (the kinds whose producer files the owner's notice)
const WORDS_RE = {
  live: /in progress or unsubmitted/, shown: /own address or title/, too_much: /too much text/, unknown: /can no longer verify/,
  await: /checks this tab again once the vault is unlocked[\s\S]*open or switch to another tab/, entry_gone: /no longer in the vault[\s\S]*open or switch to another tab/,
};
const valueSpellings = (pw) => [...new Set([pw, encodeURIComponent(pw), new URLSearchParams([['a', pw]]).toString().slice(2), b64State(pw)])];

/** The oracle: what a tab of kind `word` shows after `after`, by connection and phase. */
export function holdExpected(word, after, conn, phase, doc = 'known') {
  if (after === 'closed') return { state: 'gone' };
  if (doc === 'unknown' && (after === 'reload' || after === 'other')) after = 'still';   // (an unknown document id reads as the SAME document: a reload or another page is ruled as the tab still — more closed)
  const open = { state: 'open' }, held = (w) => ({ state: 'held', words: w });
  const ordinary = () => {   // (each kind's ordinary rules, the values in memory, the page as its producer left it)
    if (after === 'other') return open;
    if (after === 'reload') return word === 'value_shown' ? held('shown') : open;
    return { live: held('live'), held: open, guard: open, too_much_text: held('too_much'), unknown_typed: held('unknown'), value_shown: held('shown') }[word];
  };
  if (conn === 'reconnect') return ordinary();
  if (phase === 1) return held('await');
  if (phase === 'gone') return held('entry_gone');
  return ordinary();
}

/** Drive tab `t` of scene `s` on hub `h` into the hold `word`; true when it stands. The kinds share a scene, so the clock moves once. */
const HOLD_PRODUCERS = {
  live: async () => true,
  value_shown: async (s, h, t) => { await s.nav(`${s.ORIGIN}/welcome?pw=${encodeURIComponent(CURE_PW)}`, { wait: 0 }, t); return true; },
  guard: async () => true, held: async () => true, too_much_text: async () => true, unknown_typed: async () => true,
};
async function produceHolds(s, h, word, tabs) {
  for (const t of tabs) { const f = await s.fill(h, t); if (f.status !== 200) return { ok: false, why: 'fill ' + f.status }; }
  if (word === 'value_shown') { for (const t of tabs) await HOLD_PRODUCERS.value_shown(s, h, t); await sleep(150); }
  if (['guard', 'held', 'too_much_text', 'unknown_typed'].includes(word)) {
    if (word === 'too_much_text') for (const t of tabs) s.wipeMode.set(t, 'too_much');
    s.clk.t += 16 * 60_000;   // (the ceiling: the fence lifts with its wipe, a guard is born — or, too much text, the fence holds so)
    for (const t of tabs) h.dialogs.liveFillOnTarget(s.pid, t);
    for (let i = 0; i < 200; i++) { if (tabs.every((t) => { const lf = h.dialogs.liveFillOnTarget(s.pid, t); return word === 'too_much_text' ? lf && /too much/.test(lf.holdReason || '') : !lf; })) break; await sleep(12); }
    await sleep(300);   // (every lift's wipe and its guard settled before the page acts again)
    for (const t of tabs) s.wipeMode.delete(t);
    if (word === 'held' || word === 'unknown_typed') {
      for (const t of tabs) await s.raw.writePw(t, CURE_PW);   // (the page puts the value back)
      if (word === 'unknown_typed') for (const t of tabs) s.wipeMode.set(t, 'throw');
      for (const t of tabs) for (let k = 0; k < (word === 'held' ? 1 : 3); k++) { await s.read(h, t); await sleep(40); }
      for (const t of tabs) s.wipeMode.delete(t);
    }
  }
  await sleep(60);
  const kindOf = (t) => { const lf = h.dialogs.liveFillOnTarget(s.pid, t); if (!lf) return h.dialogs.hasPostLiftGuard(s.pid, t) ? 'guard' : 'none'; if (lf.valueShown) return 'value_shown'; if (/too much/.test(lf.holdReason || '')) return 'too_much_text'; if (lf.holdReason === 'unknown_typed') return 'unknown_typed'; return lf.postLiftHeld ? 'held' : 'live'; };
  const got = tabs.map(kindOf);
  return { ok: got.every((k) => k === word), got };
}
const storeHolds = (s) => {   // (every file of the scene's data folder, grepped for every spelling of the value)
  const hits = [];
  const walkDir = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) walkDir(p); else { let t = ''; try { t = fs.readFileSync(p, 'latin1'); } catch { continue; } if (valueSpellings(CURE_PW).some((v) => t.includes(v))) hits.push(path.relative(s.dataDir, p)); } } };
  try { walkDir(s.dataDir); } catch { /* */ }
  return hits;
};
async function observeHold(s, h, t, exp, word) {
  const rec = (() => { try { return JSON.parse(fs.readFileSync(path.join(s.dataDir, 'browser-profiles.json'), 'utf8')).loginFences?.[s.pid] || { fences: [] }; } catch { return { fences: [] }; } })();
  const key = `login-hold:${s.pid}:${t}|`;
  const noticeOpen = s.notices.some((n) => n.key === key && !n.resolved);
  if (exp.state === 'gone') return { ok: !rec.fences.some((f) => f.targetId === t) && !noticeOpen, rowGone: !rec.fences.some((f) => f.targetId === t), noticeOpen };
  const r = await s.read(h, t);
  const m = await s.medRead(h, t);
  const err = String((r.json && r.json.error) || '');
  const leaked = (m.ok && m.value === CURE_PW) || JSON.stringify(r).includes(CURE_PW);
  const wantNotice = exp.state === 'held' && HOLD_NOTICE_KINDS.has(word);
  const ok = !leaked && (exp.state === 'open'
    ? r.status === 200 && m.ok === true
    : r.status === 409 && r.json?.code === 'login_fill_live' && WORDS_RE[exp.words].test(err) && m.ok === false && WORDS_RE[exp.words].test(String(m.error || '')))
    && noticeOpen === wantNotice;
  return { ok, status: r.status, words: exp.words || null, wordsOk: exp.state === 'held' ? WORDS_RE[exp.words].test(err) : null, medOk: m.ok, leaked, noticeOpen, wantNotice };
}
async function actOn(s, t, after) {
  if (after === 'reload') { const u = s.fk.targets().find((x) => x.targetId === t)?.url || s.U0; await s.nav(u, { wait: 0 }, t); }
  else if (after === 'other') await s.nav(`${s.ORIGIN}/elsewhere`, { wait: 0 }, t);
  else if (after === 'closed') await s.closeTab(t);
}

/** One scene per (kind, connection): its tabs are the cells (document known / unknown × the four afters). */
async function holdScene(mods, word, conn, idx) {
  const docs = word === 'value_shown' ? ['known'] : ['known', 'unknown'];   // (pruned BY RULE: a value-shown hold follows a navigation, whose event names its document)
  const cells = docs.flatMap((doc) => HOLD_AFTERS.map((after) => ({ word, doc, conn, after })));
  const unknownIdx = cells.map((c, i) => (c.doc === 'unknown' ? i : -1)).filter((i) => i >= 0);
  const s = await cureScene(mods, `ch${idx}`, `bk-0000c1${String(idx).padStart(2, '0')}`, { tabs: cells.length, unknownDoc: unknownIdx });
  const out = [];
  try {
    const h1 = await s.start({ fresh: true });
    await h1.dialogs.arm(s.pid);
    s.bind(h1);
    // (P1: a document the tab reached by a navigation — the id renewed at each top-frame navigation is the one the fill keeps)
    for (const [i, c] of cells.entries()) if (c.doc === 'known') await s.nav(s.U0, { wait: 0 }, s.tids[i]);
    await sleep(120);
    const prod = await produceHolds(s, h1, word, s.tids);
    s.ctl.dropDoc = false;
    if (!prod.ok) return cells.map((c) => ({ cell: c, pass: false, detail: { why: 'producer', prod } }));
    const raisesBefore = s.tray.raises;
    const storeLeaks = [];
    if (conn === 'reconnect') {
      h1.dialogs.disarm(s.pid, 'the watch changed hands');
      for (const [i, c] of cells.entries()) await actOn(s, s.tids[i], c.after);
      await h1.dialogs.arm(s.pid); s.bind(h1); await sleep(120);
      for (const [i, c] of cells.entries()) { const o = await observeHold(s, h1, s.tids[i], holdExpected(word, c.after, conn, 0, c.doc), word); out.push({ cell: { ...c, phase: 0 }, pass: o.ok, detail: o }); }
      storeLeaks.push(...storeHolds(s));
    } else {
      await s.stop(h1);
      s.clk.t += 2000;
      const h2 = await s.start();
      await h2.dialogs.arm(s.pid); s.bind(h2); await sleep(120);
      const raisesAfterRestart = s.tray.raises;   // (amendment 3: a notice re-filed under its key raised nothing)
      for (const [i, c] of cells.entries()) await actOn(s, s.tids[i], c.after);
      await sleep(150);
      storeLeaks.push(...storeHolds(s));
      for (const [i, c] of cells.entries()) { const o = await observeHold(s, h2, s.tids[i], holdExpected(word, c.after, conn, 1, c.doc), word); out.push({ cell: { ...c, phase: 1 }, pass: o.ok && raisesAfterRestart === raisesBefore, detail: { ...o, raisesBefore, raisesAfterRestart } }); }
      await h2.vault.unlock(CURE_VPW);
      await sleep(400);
      for (const [i, c] of cells.entries()) { const o = await observeHold(s, h2, s.tids[i], holdExpected(word, c.after, conn, 2, c.doc), word); out.push({ cell: { ...c, phase: 2 }, pass: o.ok, detail: o }); }
      storeLeaks.push(...storeHolds(s));
    }
    if (storeLeaks.length) for (const r of out) { r.pass = false; r.detail = { ...r.detail, storeLeaks }; }
  } finally { await s.close(); }
  return out;
}

/** Every kind's entry GONE when the vault opens (dropped while the hub was down): held until the tab is closed, saying so, the
 *  notice following the hold. */
async function holdSceneGone(mods) {
  const BLm = mods.req('./src/browser-login.js');
  const words = BLm.HOLD_WORDS;
  const out = [];
  for (const [k, word] of words.entries()) {
    const s = await cureScene(mods, `cg${k}`, `bk-0000c2${String(k).padStart(2, '0')}`, { tabs: 1 });
    try {
      const h1 = await s.start({ fresh: true });
      await h1.dialogs.arm(s.pid); s.bind(h1);
      await s.nav(s.U0, { wait: 0 }, s.tid); await sleep(100);
      const prod = await produceHolds(s, h1, word, [s.tid]);
      if (!prod.ok) { out.push({ cell: { word, gone: true }, pass: false, detail: { why: 'producer', prod } }); continue; }
      await s.stop(h1);
      {   // (the owner deletes the entry while the hub is down — the vault's own writer, another life of it)
        const { VE, GS, Lm } = mods;
        const v = VE.create({ dataDir: s.dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => s.clk.t });
        await v.unlock(CURE_VPW);
        const g = GS.create({ dataDir: s.dataDir, wss: { clients: new Set() }, log: quiet.log });
        Lm.create({ vault: v, grants: () => g, now: () => s.clk.t, log: quiet.log }).drop(`web-login:https://cg${k}.example.test#dana`, { who: 'owner' });
        v.close();
      }
      s.clk.t += 2000;
      const h2 = await s.start();
      await h2.dialogs.arm(s.pid); s.bind(h2); await sleep(120);
      await h2.vault.unlock(CURE_VPW); await sleep(400);
      const o = await observeHold(s, h2, s.tid, holdExpected(word, 'still', 'cold', 'gone'), word);
      await s.closeTab(s.tid);
      const c2 = await observeHold(s, h2, s.tid, { state: 'gone' }, word);
      const leaks = storeHolds(s);
      out.push({ cell: { word, gone: true }, pass: o.ok && c2.ok && !leaks.length, detail: { held: o, afterClose: c2, leaks } });
    } finally { await s.close(); }
  }
  return out;
}

/** The census + the table; `only` = { words, conns, gone } narrows it for a mutant. */
export async function runR32HoldsTable(mods, { only = null } = {}) {
  const BLm = mods.req('./src/browser-login.js');
  const reasons = Object.entries(BLm).filter(([k, v]) => /^HOLD_[A-Z_]+$/.test(k) && typeof v === 'string');
  const unworded = reasons.filter(([, v]) => !(v in BLm.HOLD_WORD_OF_REASON) && !BLm.HOLD_PHASES.includes(v)).map(([k]) => k);
  const unproduced = BLm.HOLD_WORDS.filter((w) => !(w in HOLD_PRODUCERS));
  const census = { reasons: reasons.map(([k]) => k), words: [...BLm.HOLD_WORDS], unworded, unproduced, ok: reasons.length >= 3 && !unworded.length && !unproduced.length };
  const results = [];
  let idx = 0;
  for (const word of BLm.HOLD_WORDS) {
    for (const conn of ['reconnect', 'cold']) {
      idx++;
      if (only && ((only.words && !only.words.includes(word)) || (only.conns && !only.conns.includes(conn)))) continue;
      results.push(...await holdScene(mods, word, conn, idx));
    }
  }
  if (!only || only.gone) results.push(...await holdSceneGone(mods));
  const red = results.filter((r) => !r.pass);
  const byDim = {};
  for (const r of results) { const k = r.cell.gone ? 'entry gone' : `${r.cell.conn}${r.cell.conn === 'cold' ? ' phase ' + r.cell.phase : ''}`; byDim[k] = (byDim[k] || 0) + 1; }
  return { census, total: results.length, red: red.length, redCells: red.slice(0, 12).map((r) => ({ cell: r.cell, detail: r.detail })), byDim, ok: census.ok && results.length > 0 && red.length === 0 };
}

/** S1 + amendment 3 — THE OWNER'S NOTICE FOLLOWS ITS HOLD: it ends when the browser stops and when the profile is deleted (by its key,
 *  a past hub life's too); and the For-you store itself raises nothing when a notice is re-filed under its key. */
async function cureNotices(mods) {
  const out = {};
  for (const how of ['browser-stop', 'profile-deleted']) {
    const s = await cureScene(mods, how === 'browser-stop' ? 'cnst' : 'cnpd', how === 'browser-stop' ? 'bk-0000c0b1' : 'bk-0000c0b2');
    try {
      const h = await s.start({ fresh: true });
      await s.fill(h);
      await s.nav(`${s.ORIGIN}/welcome?pw=${encodeURIComponent(CURE_PW)}`);
      const openBefore = s.notices.some((n) => /own address or title/.test(n.text) && !n.resolved);
      if (how === 'browser-stop') h.dialogs.disarm(s.pid, 'the browser stopped'); else h.keeper.removeProfile(s.pid);
      await sleep(60);
      const openAfter = s.notices.some((n) => !n.resolved);
      out[how] = { ok: openBefore && !openAfter, openBefore, openAfter };
    } finally { await s.close(); }
  }
  {   // (the store's own rule, through the browser wiring's arguments)
    const { UserTodoManager } = mods.req('./src/user-todos.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r32-tray-'));
    try {
      let changes = 0;
      const m = new UserTodoManager({ dataDir: dir, onChange: () => { changes++; }, expirySweepMs: 0 });
      const item = { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Agent browser', text: 'the page on a tab put a filled password into its own address or title', detail: 'Open the browser live view and leave that page, or close the tab.', itemKey: 'login-hold:bp-1:T1|' };
      const a = m.add('browser', item);
      const c1 = changes, snap1 = JSON.stringify(m.get(a.id));
      const b = m.add('browser', item);
      out.refile = { ok: a.id === b.id && changes === c1 && JSON.stringify(m.get(a.id)) === snap1, sameId: a.id === b.id, raised: changes - c1 };
      try { m.stop(); } catch { /* */ }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  return { ok: Object.values(out).every((x) => x.ok), ...out };
}

/** S2 / S3 — THE CHECK'S VERDICT, pure: a value under the floor only as a whole component or the whole title; at or above it anywhere
 *  and in every spelling; one stray or non-UTF-8 percent sequence spoils nothing else; past a cap the answer is «cannot tell». */
function cureCheckRows(BLx) {
  const V = (vals, texts) => BLx.valueShownVerdict(vals, texts, { floor: 8 });
  const S = CURE_PW, L = ['Long', 'erPw6!', 'zz9'].join('');   // (built at runtime: a value at the floor and beyond)
  const rows = {
    shortAsSegmentShown: V([S], [`https://s.test/x/${encodeURIComponent(S)}/y`]) === 'shown',
    shortAsQueryValueShown: V([S], [`https://s.test/w?a=1&pw=${formSpelling(S)}`]) === 'shown',
    shortInBase64FieldShown: V([S], [`https://s.test/w?state=${b64State(S)}`]) === 'shown',
    shortWholeTitleShown: V([S], [S]) === 'shown',
    shortSubstringNotAlarm: V([S], [`https://s.test/archive/x${S}x`]) === 'clean',
    shortInTitleNotAlarm: V([S], [`Welcome back ${S}!`]) === 'clean',
    strayPercentSpoilsNothing: V([S], [`https://s.test/w?note=100%&x=%C3%28&pw=${formSpelling(S)}`]) === 'shown',
    longAnywhereShown: V([L], [`https://s.test/a/x${encodeURIComponent(L)}x`]) === 'shown',
    longFormSpellingShown: V([L], [`https://s.test/a?q=${formSpelling(L)}`]) === 'shown',
    longInTitleShown: V([L], [`hello ${L}`]) === 'shown',
    cleanIsClean: V([S, L], ['https://s.test/home', 'Home']) === 'clean',
    pastTextCapCannotTell: V([S], [`https://s.test/${'a'.repeat(BLx.CHECK_TEXT_CAP + 1)}`]) === 'unknown',
    pastPieceCapCannotTell: V([S], [`https://s.test/?${Array.from({ length: BLx.CHECK_PIECE_CAP + 2 }, (_, i) => `p${i}=QUJDREVGR0g${i % 10}`).join('&')}`]) === 'unknown',
    pastNodeCapCannotTell: V([S], [`https://s.test/?s=${Buffer.from(JSON.stringify(Array.from({ length: BLx.CHECK_NODE_CAP + 2 }, (_, i) => 'v' + i))).toString('base64url')}`]) === 'unknown',
  };
  return { ok: Object.values(rows).every(Boolean), ...rows };
}

const CURE_LEGS = {
  bound: { fn: cureBound, label: (r) => `R32-BOUND (item 7: a check that keeps failing has a bound): a put-back value whose check never answers is «try again» ${r.firstHold} times, then held until it navigates with both doors named (on both doors); a new document ends it` },
  notices: { fn: cureNotices, label: () => 'R32-NOTICES (S1 + amendment 3): the owner\'s notice of a hold ends with it when the browser stops and when the profile is deleted — by its key, a past hub life\'s too — and the For-you store raises nothing when a notice is re-filed under its key' },
  next: { fn: cureNext, label: (r) => `R32-NEXT (items 1+2, the one check): a GET form and a base64 router carry the typed value into the next address by themselves — the tab stays fenced and both doors say why, the owner is told once, the ${r.navEvents} navigation events the agent's own session got carry it in none of its forms; the clean next page lifts it and the notice goes` },
  fragment: { fn: cureFragment, label: () => 'R32-FRAGMENT (the real-browser claim\'s scene 16): a next address that carries the value ONLY in its fragment — Chrome sends it apart, frame.urlFragment — holds the tab with the value-shown words, and the agent\'s own navigation event carries none of it' },
  restarts: { fn: cureRestarts, label: () => 'R32-RESTARTS (item 4: held by the DOCUMENT, never the address): a live fill on a page that moved its address inside the document while nobody watched is held after a cold restart (vault locked) and after a reconnect, on both doors; after a reconnect a new document ends it, after a cold restart only once the vault is back and the new document is checked' },
  window: { fn: cureWindow, label: () => 'R32-WINDOW (item 5): the watch open, the fences not yet back (the browser slow to list its tabs) — the hub\'s verb and the agent\'s own CDP read are answered from the record' },
  holds: { fn: (mods) => runR32HoldsTable(mods), label: (r) => `R32-HOLDS (the persisted hold, 主开发's shape + amendments 1–3): ${r.total} cells (${Object.entries(r.byDim || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}) — kind × document known / unknown × reconnect / cold restart × still / reloaded / another page / closed: closed at least as before with the kind's words on both doors, nothing of the value in the store, the notice open exactly while the hold stands and raised once; census: ${(r.census && r.census.reasons || []).length} HOLD_* reasons, ${(r.census && r.census.words || []).length} words, each with its producer` },
  vaultReads: { fn: cureVaultReads, label: (r) => `R32-VAULT-READS (item 9, by behaviour, not by text): on a restore every call into the web logins is a subscription or runs inside hydratePersistedScrubs (${(r.restoreCalls || []).join(', ') || 'none'}); the census sees the next fill's read` },
};

/** The cure legs (all, or `only` one), each told through `ok` and answered as a result. */
export async function runR32CureLegs({ mods, ok, only = null }) {
  const out = {};
  const ident = cureIdentity(mods.BK);
  if (!only || only === 'check') {
    const cr = cureCheckRows(mods.req ? mods.req('./src/browser-login.js') : null);
    out.check = cr;
    ok(cr.ok, 'R32-CHECK (M3, S2, S3, pure): a value under the floor counts only as a whole component or the whole title (no false alarm on a substring), at or above it anywhere and in every spelling; a stray or non-UTF-8 percent sequence spoils nothing else; past each cap the answer is «cannot tell», which holds', cr);
  }
  if (!only || only === 'identity') {
    out.identity = ident;
    ok(ident.ok, 'R32-IDENTITY (item 8): a replacement browser that reuses the process number is another browser — with a new browser id and with none; a reconnect to the same one is the same; a stopped record is nobody\'s', ident);
  }
  for (const [k, leg] of Object.entries(CURE_LEGS)) {
    if (only && only !== k) continue;
    let r;
    try { r = await leg.fn(mods); } catch (e) { r = { ok: false, threw: String((e && e.stack) || e) }; }
    out[k] = r;
    ok(Boolean(r.ok), leg.label(r), r);
  }
  return out;
}

/** In-process mutant kills (`M1`, `DOC`, one per law) evaluated directly on the generated table's cells & pure law oracle. */
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
    const a4 = "          if (!wr || !wr.ok) {\n            return failedLook(g.lfSnap);\n          }";
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

  // MUTANT DOC (the cure of the twelve cells, lane chrome-157, round 32 take-over): A GUARD BELONGS TO ITS DOCUMENT. The mutant puts
  // back the old retirement by address — a guard whose tab moved inside the document is dropped unchecked — so a value the page puts
  // back after an in-app move is readable there. Replaces M3 (retiring is not a check) and M3b (ending one guard ends the others):
  // with no retirement left, both laws have no site; this one has, and every moved put-back cell must turn red under it.
  {
    const docAnchor = '          // (a guard belongs to its DOCUMENT: an address move inside the document keeps it — it ends with the document)\n';
    const docSrc = bdSrc.includes(docAnchor) ? bdSrc.replace(
      docAnchor,
      docAnchor + "          if (String(tabLoginUrlOf(e) || '').split('#')[0] !== String(g.lfSnap.urlAtFill || '').split('#')[0]) { const rest = e.postLiftGuards.filter((x) => x !== g); e.postLiftGuards = rest.length ? rest : null; continue; }   /* MUTANT DOC: a move retires the guard */\n",
    ) : bdSrc;
    if (docSrc !== bdSrc) {
      const DmDoc = MUT.load('src/server/browser-dialogs.js', docSrc, 'r32-doc-move-retires-guard');
      const sliceDoc = tableSpec.cells.filter((c) => c.conn === 'connected' && c.url === 'moved' && c.page === 'putback' && c.check === 'mem'
        && (c.fence === 'none' || c.fence === 'postLiftHeld') && c.guards >= 1 && !c.nothingToCheck);
      const resDoc = await executeCellSet(sliceDoc, { ...baseMods, Dm: DmDoc });
      const redDoc = resDoc.filter((r) => !r.pass).map((r) => r.cell.id);
      ok(redDoc.length === sliceDoc.length && redDoc.length > 0, `MUTANT DOC (an address move inside the document retires a guard) RED on the R32 table (${redDoc.length}/${sliceDoc.length} moved put-back cells RED)`, resDoc);
    } else {
      ok(false, 'MUTANT DOC: its anchor is gone in src/server/browser-dialogs.js (the guard loop\'s «a guard belongs to its DOCUMENT» line)');
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

  // ONE MUTANT PER LAW (主开发's ruling Q6, lane chrome-157). M1 (a throw poisons the check — an exception is could-not-look) and DOC (an
  // address move inside the document retires a guard) above count where they fit; the laws
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
    (s) => once(s, '      armLiveFillOnTab(w, e, {\n        targetId: e.targetId,\n        urlAtFill: f.urlAtFill || f.origin,', '      if (false) armLiveFillOnTab(w, e, {   /* MUTANT S1 */\n        targetId: e.targetId,\n        urlAtFill: f.urlAtFill || f.origin,'),
    tableSpec.cells.filter((c) => c.conn === 'hub_restart' && c.expected.flavor === 'await_vault'));
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
    ok(r && r.ok === false && r.premise === true, `MUTANT ${label} RED on the Q3 leg (the value's bytes in ${r ? r.leaked : '?'} of its 2 forms; the closed readers ${r && r.closedAnswers ? r.closedAnswers.filter((x) => x.refused).length : '?'} of 6 refused)`, r);
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

  // THE CURES' MUTANTS (lane chrome-157, round 32 take-over — the owner's B): each cure's law put back as it was, on the cure's own
  // leg; each FAILS BY NAME when its anchor is gone
  const cureMutant = async (label, file, src, tag, leg, red) => {
    if (!src) { ok(false, `MUTANT ${label}: its anchor is gone in ${file}`); return; }
    const X = MUT.load(file, src, tag);
    const r = await runR32CureLegs({ mods: file.endsWith('browser-keeper.js') ? { ...legMods(Dm0), BK: X } : file.endsWith('cdp-mediator.js') ? { ...legMods(Dm0), CM: X } : legMods(X), ok: silent, only: leg });
    const got = r[leg];
    ok(Boolean(got) && red(got), `MUTANT ${label} RED on the ${leg} leg`, got);
  };
  const bkSrc = fs.readFileSync(path.join(repoDir, 'src/server/browser-keeper.js'), 'utf8');
  await cureMutant('BOUND (a check that keeps failing answers «try again» for ever)', 'src/server/browser-dialogs.js',
    once(bdSrc, '  const FAILED_CHECKS_BOUND = 3;', '  const FAILED_CHECKS_BOUND = Infinity;   /* MUTANT BOUND */'), 'r32-cure-bound-none', 'bound',
    (r) => r.ok === false && r.guardOnly === true && r.firstHold === -1);
  await cureMutant('NEXT (the next address is never compared with the value)', 'src/server/browser-dialogs.js',
    once(bdSrc, "  function checkTexts(w, e, lf, texts, heldVals = null) {\n    if (!lf) return 'clean';\n", "  function checkTexts(w, e, lf, texts, heldVals = null) {\n    if (!lf) return 'clean';\n    return 'clean';   /* MUTANT NEXT */\n"),
    'r32-cure-next-unchecked', 'next', (r) => r.ok === false && r.premise === true && r.heldGet === false && r.leaked > 0);
  await cureMutant('RESTART-ADDRESS (a restart or a reconnect releases by the address)', 'src/server/browser-dialogs.js',
    once(once(bdSrc,
      '        if (!sameDocument(entry.docId, e.docId)) {\n',
      "        if (String(tabLoginUrlOf(e) || '').split('#')[0] !== String((entry.liveFill && entry.liveFill.urlAtFill) || '').split('#')[0]) { try { LF().clearFilledSecretsForTarget(stashedTid); } catch { /* */ } continue; }   /* MUTANT RESTART-ADDRESS */\n        if (!sameDocument(entry.docId, e.docId)) {\n") || '',
      "      // lane chrome-157 (主开发's amendment 1, 2026-11-15): AFTER A COLD RESTART NO HOLD LIFTS UNCHECKED — every row comes back\n",
      "      if (String(tabLoginUrlOf(e) || '').split('#')[0] !== String(f.urlAtFill || '').split('#')[0]) continue;   /* MUTANT RESTART-ADDRESS */\n      // lane chrome-157 (主开发's amendment 1, 2026-11-15): AFTER A COLD RESTART NO HOLD LIFTS UNCHECKED — every row comes back\n"),
    'r32-cure-restart-by-address', 'restarts', (r) => r.ok === false && r['restart-move'] && r['restart-move'].ok === false && r['reconnect-move'] && r['reconnect-move'].ok === false);
  await cureMutant('WINDOW (the state says open before the fences are back)', 'src/server/browser-dialogs.js',
    once(bdSrc, "  const fencesLive = (w) => Boolean(w && w.state === 'open' && w.fencesRearmed);", "  const fencesLive = (w) => Boolean(w && w.state === 'open');   /* MUTANT WINDOW */"),
    'r32-cure-window-open', 'window', (r) => r.ok === false && r.inWindow === true && r.medGotValue === true);
  await cureMutant('IDENTITY (a browser known by its process number alone)', 'src/server/browser-keeper.js',
    once(bkSrc, "  if (rec && rec.state && rec.state !== 'starting' && rec.state !== 'ready') return null;\n", "  if (rec && rec.state && rec.state !== 'starting' && rec.state !== 'ready') return null;\n  if (rec) return String(rec.pid);   /* MUTANT IDENTITY */\n"),
    'r32-cure-identity-pid-only', 'identity', (r) => r.ok === false && r.pidReuseOther === false);
  // THE PERSISTED HOLD'S MUTANTS (主开发's look at d8492de27 — M1/M2, amendments 1 and 3, P1, P3), each on its slice of the hold table
  const holdsMutant = async (label, src, tag, only, red) => {
    if (!src) { ok(false, `MUTANT ${label}: its anchor is gone in src/server/browser-dialogs.js`); return; }
    const X = MUT.load('src/server/browser-dialogs.js', src, tag);
    const r = await runR32HoldsTable(legMods(X), { only });
    ok(Boolean(r) && red(r), `MUTANT ${label} RED on the hold table (${r ? r.red : '?'} of ${r ? r.total : '?'} cells of its slice)`, r && r.redCells);
  };
  await holdsMutant('UNKNOWN-AS-OTHER (an unknown document id read as another document — M2)',
    once(bdSrc, '  const sameDocument = (a, b) => !a || !b || String(a) === String(b);', '  const sameDocument = (a, b) => Boolean(a) && Boolean(b) && String(a) === String(b);   /* MUTANT UNKNOWN-AS-OTHER */'),
    'r32-holds-unknown-as-other', { words: ['live'], conns: ['cold', 'reconnect'] }, (r) => r.red > 0 && r.redCells.some((x) => x.cell.doc === 'unknown'));
  await holdsMutant('COLD-UNCHECKED (after a cold restart a navigation lifts a hold unchecked — amendment 1)',
    once(bdSrc, "    if (lf.restored && why !== 'tab-closed' && why !== 'browser-stop' && why !== 'disarm') {", "    if (false && lf.restored) {   /* MUTANT COLD-UNCHECKED */"),
    'r32-holds-cold-unchecked', { words: ['live', 'value_shown'], conns: ['cold'] }, (r) => r.red > 0 && r.redCells.some((x) => x.cell.phase === 1 && (x.cell.after === 'reload' || x.cell.after === 'other')));
  await holdsMutant('NO-WORD (a row written without its hold word — the record forgets the hold)',
    once(bdSrc, '            hold: holdWordOf(lf),', '            hold: undefined,   /* MUTANT NO-WORD */'),
    'r32-holds-no-word', { words: ['value_shown'], conns: ['cold'] }, (r) => r.red > 0);
  await holdsMutant('RENEWAL (the document id not renewed at a top-frame navigation — P1)',
    once(bdSrc, "e.docId = String(p.frame.loaderId || '') || ('nav:' + (++docSeq));", "/* MUTANT RENEWAL */"),
    'r32-holds-no-renewal', { words: ['live'], conns: ['cold'] }, (r) => r.red > 0 && r.redCells.some((x) => x.cell.doc === 'known' && x.cell.phase === 2));
  await holdsMutant('REFILE (a notice re-filed at a restart without its key raises again — amendment 3)',
    once(bdSrc, "i18n: { text: i18nText, detail: i18nDetail }, itemKey: holdKeyOf(w.profileId, (e && e.targetId) || lf.targetId) }) || null;\n    } catch { /* optional */ }\n  }\n  function fileCeilingWipeNotice", "i18n: { text: i18nText, detail: i18nDetail } }) || null;   /* MUTANT REFILE */\n    } catch { /* optional */ }\n  }\n  function fileCeilingWipeNotice"),
    'r32-holds-refile-raises', { words: ['value_shown'], conns: ['cold'] }, (r) => r.red > 0 && r.redCells.some((x) => x.detail && x.detail.raisesAfterRestart > x.detail.raisesBefore));
  await cureMutant('VAULT-LIST (the re-hydration also lists the vault — P3)', 'src/server/browser-dialogs.js',
    once(bdSrc, "    const missing = new Set();\n    for (const s of [...names]) {", "    const missing = new Set();\n    try { if (logins && typeof logins.list === 'function') logins.list(); } catch { /* */ }   /* MUTANT VAULT-LIST */\n    for (const s of [...names]) {"),
    'r32-cure-vault-list', 'vaultReads', (r) => r.ok === false && Array.isArray(r.outside) && r.outside.includes('list@hydrate'));
  const cmSrc2 = fs.readFileSync(path.join(repoDir, 'src/server/cdp-mediator.js'), 'utf8');
  await cureMutant('WRAPPED (the navigation mask not put back into a wrapped session\'s message — P2)', 'src/server/cdp-mediator.js',
    once(cmSrc2, '            if (masked !== inner) ev = { ...ev, params: { ...ev.params, message: JSON.stringify(masked) } };', '            /* MUTANT WRAPPED: the re-wrap cut */'),
    'r32-cure-wrapped-unmasked', 'next', (r) => r.ok === false && r.wrappedSeen === true && r.leaked > 0);
  await cureMutant('PRESENT-ADDRESS (the bound\'s hold stamped with the present address — M4)', 'src/server/browser-dialogs.js',
    once(bdSrc, "        urlAtFill: base.urlAtFill || base.origin || BL().originOf(tabLoginUrlOf(e)) || '',", "        urlAtFill: tabLoginUrlOf(e) || base.urlAtFill || '',   /* MUTANT PRESENT-ADDRESS */"),
    'r32-cure-present-address', 'bound', (r) => r.ok === false && r.listingLeak === true);
  await cureMutant('NOTICE-STAYS (a stopped browser\'s hold notices are not ended by their key — S1)', 'src/server/browser-dialogs.js',
    once(bdSrc, "    sweepHoldNotices(`${HOLD_KEY}${pid}:`);   // (lane chrome-157: every hold notice of the profile ends with its holds, a past hub life's too)", '    /* MUTANT NOTICE-STAYS */'),
    'r32-cure-notice-stays', 'notices', (r) => r.ok === false && ((r['browser-stop'] && r['browser-stop'].openAfter) || (r['profile-deleted'] && r['profile-deleted'].openAfter)));
  await cureMutant('FRAGMENT (the check reads the address without its fragment)', 'src/server/browser-dialogs.js',
    once(bdSrc, "const navUrl = String(p.frame.url || '') + String(p.frame.urlFragment || '');", "const navUrl = String(p.frame.url || '');   /* MUTANT FRAGMENT */"),
    'r32-cure-fragment-dropped', 'fragment', (r) => r.ok === false && r.held === false);
  await cureMutant('VAULT-ALIAS (a restore reads the logins through an alias)', 'src/server/browser-dialogs.js',
    once(bdSrc, '    const prevStash = stashedTabFencesByProfile.get(w.profileId) || null;\n', "    { const L = logins; try { if (L && typeof L.resolveFill === 'function') L.resolveFill({ origin: '', spec: '' }); } catch { /* */ } }   /* MUTANT VAULT-ALIAS */\n    const prevStash = stashedTabFencesByProfile.get(w.profileId) || null;\n"),
    'r32-cure-vault-alias', 'vaultReads', (r) => r.ok === false && Array.isArray(r.outside) && r.outside.includes('resolveFill'));
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
