#!/usr/bin/env node
// LANE lark-refresh-stall (the owner's hub, measured from its journal: 2026-10-26 13:34 PT after 12–17 s loop holds in a
// row, and 2026-10-27 19:17:02 PT, 23.3 s after the canary's 5 368 840 ms hold (17:47:09 → 19:16:38) — both times `lark:
// the sign-in expired (revoked-elsewhere) … The refresh token has been revoked … can only be used once (20064)`; the owner:
// 「为啥我的 lark 登录失效了」). The token refresh POST ran under AbortSignal.timeout(20 s); the timer came due WHILE the loop
// was held and libuv runs due timers before it polls the sockets, so the abort won over the vendor's answer already in the
// socket — the single-use refresh token was spent, its successor dropped, the retry refused 20064 and said «signed in
// elsewhere».
//
// Over the REAL engine + the REAL Lark adapter + the REAL For-you store, against a FAKE Lark token endpoint on loopback
// that runs in a WORKER THREAD (it answers while the main loop is held). ONE synchronous hold of 21.5 s (Atomics.wait —
// never a busy loop) covers two accounts and a consent at once:
//   A  the endpoint ANSWERS during the hold  ⇒ the answer is read after it: the token rotated + persisted, no re-auth
//   B  the endpoint spends the token and CUTS the socket during the hold ⇒ a LOST answer, recorded; ONE retry of the old
//      token ⇒ 20064 ⇒ `refresh-lost` naming the stall (never `revoked-elsewhere`) — the log, the item, the row
//   X  (r2) a consent's single-use CODE exchanged across the same hold ⇒ the answer is read, its lifetime from the send
//   E  (r3) a request at the live bound's EDGE (2 s bound, 1 s of it run when the hold begins), answered DURING the hold ⇒
//      the late tick that crosses the bound defers its abort past the poll phase: the answer is READ (9221575b aborted it)
//   C  CONTROL: a real revoke elsewhere (20064, no lost answer before it) still says `revoked-elsewhere`
// Then the pieces without a hold: the live-time bound and its tick edges on a fake clock (R1), a lost answer / a request
// that never left by the request's own `sent` fact / a dropped bearer never handed back / a lifetime from the send (R2),
// the 15-min margin + the pass's own renew past the back-off gate (R3), the words and their units (R4), a landing that
// VERIFIES (R5 r2).
//
// RED on 6428c67e and on 60e29ad0 (run this file inside a `git archive` copy): the base dies `revoked-elsewhere`; 60e29ad0
// fails the r2 legs (the tick edges, the sent flag, the dropped bearer, the exchange, the words, the verifying landing);
// 9221575b fails the r3 legs (the edge's answer aborted, the dead waiters, the locked vault, the witness window, C3).
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import dc from 'node:diagnostics_channel';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (x) => typeof x === 'function';
const tryAsync = async (f) => { try { return await f(); } catch (e) { return { threw: e }; } };

const lark = require(path.join(REPO, 'src/channels/lark.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CC = require(path.join(REPO, 'src/channel-caps.js'));
const LoopBlame = require(path.join(REPO, 'src/server/loop-blame.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const zh = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const ja = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
const tOf = (dict) => (k, p) => fill(dict[k] !== undefined ? dict[k] : k, p);
// the For-you row's words, by the client's own rule (src/lib/user-todos-actions.js `said`, pinned below)
const saidBy = (t) => (l) => t(l.key, Object.fromEntries(Object.entries(l.params || {}).map(([k, v]) => [k, v && typeof v === 'object' && typeof v.key === 'string' ? t(v.key, v.params || undefined) : v])));
// ONE level of parentheses (full- or half-width) — never one inside another
const nestedParens = (s) => { let d = 0, max = 0; for (const ch of String(s)) { if (ch === '（' || ch === '(') max = Math.max(max, ++d); else if (ch === '）' || ch === ')') d--; } return max > 1; };

const ROOT = scratch('vs-lark-stall');
const CRED = { source: 'user', values: { appId: 'cli_stall0001', appSecret: 'stall-app-' + 'secret-0001' }, missing: [], why: null };
const quiet = { log() {}, warn() {}, error() {} };
const R20064 = { code: 20064, error: 'invalid_grant', error_description: 'The refresh token has been revoked. Please note that a refresh token can only be used once.' };
const jsonRes = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: new Map(), json: async () => body });

// ── the fake Lark token endpoint, OFF the main thread ────────────────────
// sab[0] = token POSTs received, sab[1] = the main loop is held now, sab[2] = answers / cuts made while it was held,
// sab[3] = r3's edge request (+1 when it arrives, +10 when it is answered while the loop is held)
const sab = new Int32Array(new SharedArrayBuffer(16));
const WORKER = `
const http = require('node:http');
const { parentPort, workerData } = require('node:worker_threads');
const sab = workerData.sab;
const plan = new Map(), spent = new Set(), posts = new Map();
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (res, status, body) => { const b = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) }); res.end(b); };
const R20064 = ${JSON.stringify(R20064)};
parentPort.on('message', (m) => {
  if (m.type === 'plan') { plan.set(m.rt, m.mode); parentPort.postMessage({ type: 'planned', rt: m.rt }); }
  if (m.type === 'posts') parentPort.postMessage({ type: 'posts', posts: Object.fromEntries(posts) });
});
const srv = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    const u = req.url;
    if (u.startsWith('/edge')) {
      Atomics.add(sab, 3, 1); Atomics.notify(sab, 3);
      for (let i = 0; i < 3000 && Atomics.load(sab, 1) !== 1; i++) await nap(5);
      await nap(300);
      if (Atomics.load(sab, 1) === 1) Atomics.add(sab, 3, 10);
      return send(res, 200, { code: 0, edge: 'read' });
    }
    if (u.startsWith('/open-apis/authen/v2/oauth/token')) {
      const body = JSON.parse(raw || '{}');
      const rt = String(body.refresh_token || body.code || '');   // a refresh by its token, a consent's exchange by its code
      posts.set(rt, (posts.get(rt) || 0) + 1);
      Atomics.add(sab, 0, 1); Atomics.notify(sab, 0);
      if (spent.has(rt)) return send(res, 400, R20064);
      const mode = plan.get(rt) || 'ok';
      if (mode === 'revoked') return send(res, 400, R20064);
      spent.add(rt);
      if (mode === 'answer-in-hold' || mode === 'cut-in-hold') {
        for (let i = 0; i < 3000 && Atomics.load(sab, 1) !== 1; i++) await nap(5);
        await nap(300);
        if (Atomics.load(sab, 1) === 1) Atomics.add(sab, 2, 1);
        if (mode === 'cut-in-hold') { req.socket.destroy(); return; }
      }
      return send(res, 200, { code: 0, access_token: 'u-new-' + rt, refresh_token: 'ur-new-' + rt, expires_in: 7200, refresh_token_expires_in: 604800, scope: 'im:message offline_access', token_type: 'Bearer' });
    }
    if (u.startsWith('/open-apis/auth/v3/tenant_access_token')) return send(res, 200, { code: 0, msg: 'ok', tenant_access_token: 't-stall', expire: 7200 });
    if (u.startsWith('/open-apis/authen/v1/user_info')) return send(res, 200, { code: 0, msg: 'success', data: { open_id: 'ou_X', name: 'Owner X', union_id: 'on_X' } });
    if (/u-bad/.test(String(req.headers.authorization || ''))) return send(res, 200, { code: 99991663, msg: 'Invalid access token for authorization. Please make a request with token attached.' });
    if (/u-5xx/.test(String(req.headers.authorization || ''))) return send(res, 503, { code: 500, msg: 'internal error' });
    return send(res, 200, { code: 0, msg: 'success', data: { items: [], has_more: false, page_token: '' } });
  });
});
srv.listen(0, '127.0.0.1', () => parentPort.postMessage({ type: 'port', port: srv.address().port }));
`;
const worker = new Worker(WORKER, { eval: true, workerData: { sab } });
const inbox = [];
const waiters = [];
worker.on('message', (m) => { inbox.push(m); for (const w of waiters.splice(0)) w(); });
const nextMsg = async (type) => { for (;;) { const i = inbox.findIndex((m) => m.type === type); if (i >= 0) return inbox.splice(i, 1)[0]; await new Promise((r) => waiters.push(r)); } };
const PORT = (await nextMsg('port')).port;
const planRt = async (rt, mode) => { worker.postMessage({ type: 'plan', rt, mode }); await nextMsg('planned'); };
const postsNow = async () => { worker.postMessage({ type: 'posts' }); return (await nextMsg('posts')).posts; };
const viaLoopback = (url, init) => globalThis.fetch(String(url).replace(/^https:\/\/open\.(feishu\.cn|larksuite\.com)/, `http://127.0.0.1:${PORT}`), init);

// ── the token store (the engine's door: a write lands only while the store holds the token it supersedes) ──
function mkTokens(token) {
  const st = { token, writes: 0 };
  return { st, read: () => ({ token: st.token, why: st.token ? null : 'never-authenticated' }),
    write: async (t, meta = {}) => { if (meta.supersedes !== undefined && String((st.token && st.token.refresh_token) || '') !== String(meta.supersedes || '')) return { superseded: true }; st.token = t; st.writes++; return { written: true }; },
    clear: async () => { st.token = null; } };
}
const tokenOf = (rt, leftMs) => ({ access_token: 'u-old-' + rt, expiresAt: Date.now() + leftMs, refresh_token: rt, refreshExpiresAt: Date.now() + 7 * 86400e3, scopes: ['im:message'], openId: 'ou_' + rt, name: 'Owner ' + rt, brand: 'feishu' });
const acctRec = (id, user, kind = 'lark', label = 'Lark / 飞书') => ({ id, kind, label, enabled: true, options: { brand: 'feishu' }, auth: { tokenEnc: 'held-sign-in', expiresAt: null, scopes: ['im:message'], user },
  lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null });

// ── ① THE HELD LOOP over the real engine: A answered, B lost, X a consent's code, C revoked elsewhere ──
console.log('\n① a refresh (and a consent\'s code exchange) in flight across a 21.5 s held loop — over the real engine + Lark adapter + For-you store');
{
  const dir = path.join(ROOT, 'engine');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [acctRec('la', 'Owner A'), acctRec('lb', 'Owner B'), acctRec('lc', 'Owner C')] }, null, 1));
  // every token inside the OLD 60 s margin, so the base refreshes on demand at its first request as the lane does at its renew;
  // each bearer dies DURING the hold (15 s), so nothing after it can lean on the old one
  const TOK = { la: mkTokens(tokenOf('ur-A', 15e3)), lb: mkTokens(tokenOf('ur-B', 15e3)), lc: mkTokens(tokenOf('ur-C', 15e3)) };
  await planRt('ur-A', 'answer-in-hold'); await planRt('ur-B', 'cut-in-hold'); await planRt('ur-C', 'revoked'); await planRt('code-X', 'answer-in-hold');
  const lines = [];
  const log = { log: (s) => lines.push(String(s)), warn: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) };
  const registry = CH.createChannelRegistry();
  const witCalls = [];   // r3: what the hub's witness was asked — the stall's length AND the hold's own windows
  registry.register({ ...lark.adapter, create: (rec, deps) => lark.adapter.create(rec, { ...deps, log, tokens: TOK[rec.id], resolveIntegration: () => CRED, fetch: viaLoopback,
    loopWitness: (ms, ws) => { witCalls.push({ id: rec.id, ms, ws: ws || null }); return has(deps.loopWitness) ? deps.loopWitness(ms, ws) : null; } }) });
  const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
  const eng = ENG.create({ dataDir: dir, registry, env: {}, broadcast: () => {}, log, userTodos, serverSetting: () => undefined });
  // X: a consent whose code is exchanged across the hold (the adapter's own exchange, handed to the consent machine)
  const TX = mkTokens(null);
  let consentOpts = null;
  const lx = lark.adapter.create({ id: 'lx', options: { brand: 'feishu' } }, { log: quiet, tokens: TX, resolveIntegration: () => CRED, fetch: viaLoopback, oauth: { begin: async (o) => { consentOpts = o; return { flowId: 'fx' }; } } });
  await lx.auth.begin();
  const items = () => userTodos.snapshot().open.filter((i) => i.sessionKey === 'channels' && i.action && i.action.type === 'channel-reauth');
  const itemOf = (id) => items().find((i) => i.action.adapterId === id) || null;
  const view = (id) => eng.digest({ scope: 'accounts' }).adapters.find((a) => a.id === id) || {};
  const rec = (id) => eng.adapterRecords().adapters.find((r) => r.id === id) || {};
  try {
    const pA = eng.pass('la', { force: true });
    const pB = eng.pass('lb', { force: true });
    const pX = consentOpts && has(consentOpts.exchange) ? consentOpts.exchange({ code: 'code-X', redirectUri: 'http://127.0.0.1:9/lark/cb' }).then((r) => ({ r }), (e) => ({ e })) : Promise.resolve({ e: new Error('no exchange') });
    for (let i = 0; i < 400 && Atomics.load(sab, 0) < 3; i++) await Atomics.waitAsync(sab, 0, Atomics.load(sab, 0), 50).value;
    const leftBefore = Atomics.load(sab, 0);
    // E (r3): the live bound's EDGE on a real socket — a 2 s bound (1 s ticks), the hold begins after ONE tick has run, the
    // answer goes into the socket during the hold; the first tick after it is late and crosses the bound
    const e0 = performance.now();
    const clkE = lark.liveDeadline(2000);
    const pE = globalThis.fetch(`http://127.0.0.1:${PORT}/edge`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' }, signal: clkE.signal })
      .then(async (r) => { const d = await r.json(); clkE.end(); return { d }; }, (e) => { clkE.end(); return { e }; });
    for (let i = 0; i < 400 && Atomics.load(sab, 3) < 1; i++) await Atomics.waitAsync(sab, 3, Atomics.load(sab, 3), 50).value;
    while (performance.now() - e0 < 1400) await sleep(20);
    const wallBefore = Date.now();
    // THE HELD LOOP — the one synchronous wait of this suite (Atomics.wait, the thread sleeps; 21.5 s > the old 20 s timer),
    // run inside a POLL-phase callback (an fs completion — the incident's shape: the next turn runs its timers first)
    let h0 = 0, heldFor = 0, edgeAt = 0;
    await new Promise((res) => fs.stat(REPO, () => {
      edgeAt = Math.round(performance.now() - e0);
      Atomics.store(sab, 1, 1);
      h0 = performance.now();
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 21500);
      heldFor = performance.now() - h0;
      Atomics.store(sab, 1, 0);
      res();
    }));
    const [, , x, eRes] = await Promise.all([pA, pB, pX, pE]);
    ok(leftBefore >= 3 && heldFor >= 21000 && Atomics.load(sab, 2) === 3, `the two refresh POSTs and the consent's exchange had LEFT before the hold (${leftBefore}), the loop was held ${Math.round(heldFor)} ms, and the endpoint answered A + X and cut B while it was held (${Atomics.load(sab, 2)} of 3)`);
    // E (r3): the answer already in the socket is READ before any abort — the crossing tick came late (after the hold), its
    // abort waits past the poll phase (r2 aborted in the timers phase: the rotated token of the incident, lost at the edge)
    ok(eRes && eRes.d && eRes.d.edge === 'read' && Atomics.load(sab, 3) === 11 && edgeAt >= 1050 && edgeAt <= 1950,
      `E (r3): a request at the live bound's EDGE (2 s bound, the hold began ${edgeAt} ms in — one tick run), answered DURING the hold, is READ after it (${eRes && eRes.e ? `aborted: ${String((eRes.e.cause && eRes.e.cause.message) || eRes.e.message).slice(0, 100)}` : 'answered'}; sab[3] ${Atomics.load(sab, 3)})`);
    // the engine's next pass of each (the base's retry road), then C — a refusal with no lost answer before it
    await eng.pass('la', { force: true }); await eng.pass('lb', { force: true });
    await eng.pass('lc', { force: true });
    const posts = await postsNow();

    // A: the answer that waited in the socket is READ — the rotated pair on the record, no re-auth, ONE POST
    ok(TOK.la.st.token && TOK.la.st.token.refresh_token === 'ur-new-ur-A' && TOK.la.st.token.access_token === 'u-new-ur-A' && !TOK.la.st.token.invalidGrantAt && posts['ur-A'] === 1,
      `A (answered during the hold): the answer is read AFTER the hold — the rotated token persisted, ONE refresh POST (${posts['ur-A']}), held ${TOK.la.st.token && TOK.la.st.token.refresh_token}`);
    ok(!rec('la').signinDead && !itemOf('la') && view('la').authState === 'ok',
      `A: no dead sign-in, no re-authorize item, the row says ok (signinDead ${JSON.stringify(rec('la').signinDead || null)}, item ${!!itemOf('la')})`);
    // X (r2): the consent's code is single-use too — the exchange's answer that waited in the socket is READ, and the token's
    // lifetime counts from the SEND (before the hold), never from the late read
    const tx = TX.st.token;
    ok(x && x.r && x.r.ok === true && tx && tx.access_token === 'u-new-code-X' && posts['code-X'] === 1,
      `X (r2): the consent's code exchanged across the hold — the answer read after it, the sign-in stored, ONE POST (${x && x.e ? `threw: ${String(x.e.message).slice(0, 120)}` : tx && tx.access_token})`);
    ok(tx && Number(tx.expiresAt) <= wallBefore + 7200e3 + 2000, `X (r2): its lifetime counts from the send — expiresAt − the instant before the hold = ${tx ? Math.round((tx.expiresAt - wallBefore) / 1000) : '-'} s (≤ 7200 + 2; the read came ${Math.round(heldFor / 1000)} s later)`);

    // B: the answer truly lost ⇒ recorded ⇒ ONE retry ⇒ 20064 ⇒ refresh-lost with the stall
    const dB = rec('lb').signinDead || {};
    const iB = itemOf('lb');
    ok(dB.cause === 'refresh-lost' && Number(dB.heldMs) >= 20000 && Number(dB.heldMs) <= 25000 && posts['ur-B'] === 2,
      `B (the socket cut during the hold): ONE try of the old token after the lost answer (${posts['ur-B']} POSTs), its 20064 is \`refresh-lost\` (${dB.cause}) with the stall it waited through (${dB.heldMs} ms) — never \`revoked-elsewhere\``);
    ok(TOK.lb.st.token && TOK.lb.st.token.invalidGrantCause === 'refresh-lost' && Number(TOK.lb.st.token.invalidGrantHeldMs) >= 20000 && !!TOK.lb.st.token.refreshLostAt,
      `B's token record: the lost answer (refreshLostAt) and the stamp's cause refresh-lost + its stall (${TOK.lb.st.token && TOK.lb.st.token.invalidGrantCause}, ${TOK.lb.st.token && TOK.lb.st.token.invalidGrantHeldMs})`);
    const p = iB && iB.i18n && iB.i18n.text.params;
    const zhItem = iB ? saidBy(tOf(zh))(iB.i18n.text) : '';
    const secs = p && p.cause && p.cause.params ? p.cause.params.seconds : null;
    // r2: the words say what was MEASURED — the stall's length, first; no cause word (the hub's witness saw no disk call: the
    // hold was a wait), no vendor name in the cause (the item's {kind} names it once), one level of parentheses
    ok(iB && iB.urgency === 'urgent' && p && p.cause && p.cause.key === 'the hub stalled {seconds} s while refreshing the sign-in, and its single-use refresh token was used up' && secs >= 20 && secs <= 25
      && zhItem.includes(`需要重新授权（hub 在刷新令牌时卡住了 ${secs} 秒，一次性刷新令牌已被用掉）`) && !/另一个 VibeSpace|NAS|磁盘/.test(zhItem) && zhItem.split('飞书').length === 2 && !nestedParens(zhItem),
      `B's For-you item (urgent) names the MEASURED stall first, no unmeasured cause, the vendor once, one level of parentheses: «${zhItem}»`);
    const vB = view('lb');
    const rowZh = CC.signinLineText(vB, { t: tOf(zh) });
    ok(vB.authState === 'expired' && vB.authCause === 'refresh-lost' && vB.authHeldMs >= 20000 && rowZh.includes('hub 在刷新令牌时卡住了') && !/另一个 VibeSpace|NAS|飞书/.test(rowZh),
      `B's row (the account view → the red line in zh): «${rowZh}»`);
    const logB = lines.find((s) => /lb: the sign-in expired \(refresh-lost; the hub's loop was held 2\d s while the refresh's answer waited\)/.test(s));
    const lostLine = lines.find((s) => /the token refresh's answer was lost after the request left .*the hub's loop was held 2\d s while it waited/.test(s));
    ok(!!logB && !!lostLine && !/disk/.test(logB + lostLine), `the hub log names the cause code and the stall (and no witness word it never measured): «${(logB || '').slice(0, 160)}» · «${(lostLine || '').slice(0, 160)}»`);
    ok(!lines.some((s) => /lb: the sign-in expired \(revoked-elsewhere/.test(s)), 'B is never logged `revoked-elsewhere`');
    // r3 (acceptance r2): the witness judges the HOLD's own window — the span the request's live clock measured — never the
    // instant the loss is recorded (up to 20 s of live waiting can lie between them)
    const wB = witCalls.find((c) => c.id === 'lb') || null;
    const spanB = wB && Array.isArray(wB.ws) ? wB.ws.find((w) => w.to - w.from >= 21000 && Math.abs(w.from - wallBefore) <= 1500) : null;
    ok(!!spanB, `r3: B's witness was handed the hold's own window (${wB ? JSON.stringify({ ms: wB.ms, ws: wB.ws && wB.ws.map((w) => ({ from: w.from - wallBefore, len: w.to - w.from })) }) : 'never asked'} — from relative to the hold's start)`);

    // C: CONTROL — no lost answer precedes the 20064 ⇒ revoked-elsewhere, as before
    const dC = rec('lc').signinDead || {};
    const iC = itemOf('lc');
    ok(dC.cause === 'revoked-elsewhere' && iC && iC.i18n.text.params.cause.key === 'your account signed in to this app from another VibeSpace' && posts['ur-C'] === 1,
      `CONTROL C (a real revoke elsewhere, no lost answer): \`revoked-elsewhere\` with its words, ONE POST (${dC.cause}, ${posts['ur-C']})`);
    ok(items().length === 2, `exactly two re-authorize items (B, C) — A is alive (${items().map((i) => i.action.adapterId).join(',')})`);
  } finally {
    try { eng.stop(); } catch { }
    try { userTodos.stop(); } catch { }
  }
}

// ── ② R1: the live-time bound — a held turn never fires; running time does; its two edges (r2) ──
console.log('\n② R1: the refresh is bounded by LIVE loop time, never by a timer that came due across a hold');
{
  const LD = lark.liveDeadline;
  ok(has(LD) && lark.REFRESH_BOUND_MS === 20000, 'lark.liveDeadline exists; the refresh bound is 20 s of running time');
  if (has(LD)) {
    let skew = 0;
    const mono = () => performance.now() + skew;
    const d = LD(200, { tickMs: 20, mono });
    await sleep(70);
    skew += 5000;   // the loop "held" 5 s: the next tick sees a gap 250× its period
    await sleep(30);
    ok(!d.signal.aborted, 'a tick after a 5 s hold (25× the bound) does NOT fire — it counts one tick and the held rest');
    await sleep(400);
    ok(d.signal.aborted && /no answer in 0 s of running time \(the loop was held 5 s besides\)/.test(String(d.signal.reason && d.signal.reason.message)), `200 ms of RUNNING time fires it, naming the hold: «${d.signal.reason && d.signal.reason.message}»`);
    const held = d.end();
    ok(held >= 4900 && held <= 5100, `end() answers the held milliseconds (${held})`);
    const e = LD(10000, { tickMs: 20 });
    await sleep(60);
    ok(e.end() === 0 && !e.signal.aborted, 'a request answered in time: end() = 0 held, never aborted (the interval is cleared)');
    // r2 (acceptance r1's fake-clock drive): the tick accounting's two edges, driven tick by tick (a captured interval, a fake
    // monotonic clock — no real hold): a gap ≥ 1.5 ticks counts its EXCESS as held, and the bound fires on the first tick past
    // 20 s LIVE even when that tick came late. r3: each turn runs as libuv does — timers (the tick), poll (an answer that
    // waited in the socket: the request ends its clock), check (the immediates: a deferred abort)
    const drive = (gaps, answerOn = -1) => {
      let cb = null, mono2 = 0, wall = 0, at = null, read = null;
      const imm = [];
      const si = globalThis.setInterval, ci = globalThis.clearInterval, sim = globalThis.setImmediate;
      globalThis.setInterval = (f) => { cb = f; return { unref() {}, fake: true }; };
      globalThis.clearInterval = (h) => { if (h && h.fake) cb = null; else ci(h); };
      globalThis.setImmediate = (f, ...a) => { imm.push(() => f(...a)); return {}; };
      try {
        const dl = LD(20000, { tickMs: 1000, mono: () => mono2, wall: () => 1_800_000_000_000 + wall });
        for (let i = 0; i < gaps.length && at === null && read === null; i++) {
          mono2 += gaps[i]; wall += gaps[i];
          if (cb) cb();
          if (i === answerOn && !dl.signal.aborted) { dl.end(); read = wall; }
          for (const f of imm.splice(0)) f();
          if (dl.signal.aborted) at = wall;
        }
        return { at, read, held: dl.end(), wall, windows: has(dl.windows) ? dl.windows() : null };
      } finally { globalThis.setInterval = si; globalThis.clearInterval = ci; globalThis.setImmediate = sim; }
    };
    const rep = (n, v) => Array.from({ length: n }, () => v);
    const a5 = drive(rep(40, 1500));
    ok(a5.at === 30000 && a5.held === 10000, `a loop held 0.5 s of every 1.5 s turn: 20 s of running time is 30 s of wall — a vendor answering at 25 s is never cut off (fired at ${a5.at} ms, held ${a5.held} ms; r1 fired at 21 000 with held 0)`);
    const a2 = drive(rep(601, 2100));
    ok(a2.at === 42000, `a loop held EVERY turn (601 × 2.1 s), nothing in the socket: the bound still fires — in the 20th turn, after its poll phase (${a2.at} ms; r1 never fired in 21 min)`);
    const g = drive([500, 5368840, ...rep(40, 1000)]);
    ok(g.at === 5368840 + 500 + 19000 && g.held === 5367840, `the canary's 5 368 840 ms hold moves the bound by ONE tick — the poll after it reads the socket first (fired ${g.at - 5368840 - 500} ms after the hold, held ${g.held} ms)`);
    const late = drive([...rep(19, 1000), 5000, 1000]);
    ok(late.at === 24000, `a tick that comes LATE past 20 s of running time, nothing in the socket: the abort fires in that same turn, after its poll phase (at ${late.at} ms — r1 waited for an un-held tick)`);
    // r3 (acceptance r2: r2 aborted in the TIMERS phase, before the poll read an answer that came during the hold)
    ok(JSON.stringify(late.windows) === JSON.stringify([{ from: 1_800_000_000_000 + 19000, to: 1_800_000_000_000 + 24000 }]), `r3: the live clock says WHERE the loop was held — the late gap's own wall span (${JSON.stringify(late.windows)}) — the window the witness judges`);
    const lateRead = drive([...rep(19, 1000), 5000, 1000], 19);
    ok(lateRead.read === 24000 && lateRead.at === null && lateRead.held === 4000, `r3: the same late crossing tick with an answer IN THE SOCKET — the answer is READ, no abort (read at ${lateRead.read} ms, aborted at ${lateRead.at}, held ${lateRead.held} ms; 9221575b aborted at 24 000)`);
    const shortRead = drive([...rep(19, 1000), 1200, 1000], 19);
    ok(shortRead.read === 20200 && shortRead.at === null, `r3: a short hold (1.2 s, counted as running) that crosses the bound with an answer in the socket — read, never aborted (read at ${shortRead.read}, aborted at ${shortRead.at}; r1 and r2 aborted it)`);
  }
  const src = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf-8');
  const refresh = src.slice(src.indexOf('  async function refreshAccessToken('), src.indexOf('  function bearerNow('));
  ok(/what: 'lark token refresh', liveMs: REFRESH_BOUND_MS,/.test(refresh) && !/AbortSignal\.timeout/.test(refresh), 'the refresh POST carries the live bound and no AbortSignal.timeout');
  ok(/method: 'POST', what: 'lark token exchange', liveMs: REFRESH_BOUND_MS,/.test(src), 'r2: the consent\'s code exchange carries the same live bound (① X proves it across the hold)');
}

// ── ③ R2: a lost answer — by the request's own `sent` fact; a dropped bearer is never handed back; a lifetime from the send ──
console.log('\n③ R2: a lost answer is an UNKNOWN outcome — recorded, tried once, named truthfully');
{
  const run = async (first) => {
    const tok = mkTokens(tokenOf('ur-x', -1));
    let n = 0;
    const fetchFn = async (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : null;
      if (body && body.grant_type === 'refresh_token') {
        n++;
        if (n === 1) return first();
        if (first.retry === 'ok') return { ok: true, status: 200, json: async () => ({ code: 0, access_token: 'u-r', refresh_token: 'ur-r', expires_in: 7200 }) };
        return { ok: false, status: 400, json: async () => R20064 };
      }
      return { ok: true, status: 200, json: async () => ({ code: 0, data: { items: [], has_more: false } }) };
    };
    const a = lark.adapter.create({ id: 'lx', brand: 'feishu' }, { fetch: fetchFn, tokens: tok, resolveIntegration: () => CRED, log: quiet });
    const e1 = await a.listConversations({ limit: 5 }).then(() => null, (e) => e);
    const mid = { ...tok.st.token };
    const e2 = await a.listConversations({ limit: 5 }).then(() => null, (e) => e);
    const e3 = await a.listConversations({ limit: 5 }).then(() => null, (e) => e);
    return { e1, e2, e3, mid, tok: tok.st.token, posts: n };
  };
  const cause = (code, syscall) => Object.assign(new Error(`${syscall || 'x'} ${code}`), { code, ...(syscall ? { syscall } : {}) });
  const failWith = (c) => () => { throw Object.assign(new TypeError('fetch failed'), { cause: c }); };
  const r1 = await run(failWith(cause('UND_ERR_SOCKET')));
  ok(r1.e1 && r1.e1.code === 'transport' && r1.e1.detail && r1.e1.detail.lost === true && !!r1.mid.refreshLostAt, `a socket cut after the send: transport, \`lost\`, recorded on the token (${r1.e1 && r1.e1.code}, refreshLostAt ${!!r1.mid.refreshLostAt})`);
  ok(r1.e2 && r1.e2.code === 'auth-expired' && r1.e2.detail.cause === 'refresh-lost' && r1.e2.detail.vendorCause === 'revoked-elsewhere' && r1.posts === 2 && r1.e3 && r1.e3.detail.cause === 'refresh-lost',
    `the ONE try after it: 20064 ⇒ refresh-lost (vendor said revoked-elsewhere), then nothing more is POSTed (${r1.posts} POSTs; the next call keeps the cause)`);
  ok(CC.signinCauseText('refresh-lost', { heldMs: 0, t: tOf(zh) }) === '刷新令牌的应答在途中丢失，一次性刷新令牌已被用掉', 'no stall measured: the words say the answer was lost on the way (vendor-free)');
  const r2 = await run(failWith(cause('ECONNREFUSED', 'connect')));
  ok(r2.e1 && r2.e1.code === 'transport' && !r2.mid.refreshLostAt && r2.e2 && r2.e2.detail.cause === 'revoked-elsewhere',
    `CONTROL: a request that never LEFT (ECONNREFUSED on connect) records nothing, and a later 20064 stays revoked-elsewhere (${r2.e2 && r2.e2.detail.cause})`);
  // r2 (acceptance r1): «did it leave» is the REQUEST's own fact — undici's request:create (in the caller's context) and
  // client:sendHeaders (its first byte) — published here exactly as the global fetch publishes them
  const viaUndici = (sent, c) => async () => {
    const request = { method: 'POST', path: '/open-apis/authen/v2/oauth/token' };
    dc.channel('undici:request:create').publish({ request });
    if (sent) dc.channel('undici:client:sendHeaders').publish({ request, headers: '' });
    throw c ? Object.assign(new TypeError('fetch failed'), { cause: c }) : new Error('no answer in 20 s of running time');
  };
  const s1 = await run(viaUndici(false, null));
  ok(s1.e1 && s1.e1.detail && s1.e1.detail.lost === false && !s1.mid.refreshLostAt && s1.e2 && s1.e2.detail.cause === 'revoked-elsewhere',
    `r2: the live deadline's own abort while connect still waited (created, never sent — a starved threadpool's dns / connect): NEVER LEFT, nothing recorded, a later 20064 stays revoked-elsewhere (${s1.e2 && s1.e2.detail && s1.e2.detail.cause})`);
  const s2 = await run(viaUndici(true, cause('EHOSTUNREACH', 'read')));
  ok(s2.e1 && s2.e1.detail && s2.e1.detail.lost === true && !!s2.mid.refreshLostAt && s2.e2 && s2.e2.detail.cause === 'refresh-lost',
    `r2: EHOSTUNREACH AFTER the request's headers went out (a dead TCP keepalive) is a LOST answer — recorded, the 20064 after it is refresh-lost (${s2.e2 && s2.e2.detail && s2.e2.detail.cause})`);
  const s3 = await run(failWith(cause('EHOSTUNREACH', 'read')));
  ok(s3.e1 && s3.e1.detail && s3.e1.detail.lost === true && !!s3.mid.refreshLostAt, 'r2: …and so with no undici facts at all (a fetch undici never saw): only a connect / getaddrinfo failure never left');
  // a REAL request on loopback: a TLS server that resets the ClientHello — the request was created, its headers never sent
  {
    const tls = net.createServer((s) => { s.once('data', () => s.resetAndDestroy()); });
    await new Promise((r) => tls.listen(0, '127.0.0.1', r));
    const tport = tls.address().port;
    const tok = mkTokens(tokenOf('ur-tls', -1));
    const a = lark.adapter.create({ id: 'lt', brand: 'feishu' }, { fetch: (url, init) => globalThis.fetch(String(url).replace(/^https:\/\/open\.(feishu\.cn|larksuite\.com)/, `https://127.0.0.1:${tport}`), init), tokens: tok, resolveIntegration: () => CRED, log: quiet });
    const e = await a.listConversations({ limit: 5 }).then(() => null, (x) => x);
    tls.close();
    ok(e && e.code === 'transport' && e.detail && e.detail.lost === false && !tok.st.token.refreshLostAt,
      `r2: a REAL fetch whose TLS ClientHello was reset (the headers never left): never left — nothing recorded (${e && e.code}, lost ${e && e.detail && e.detail.lost}; r1 recorded it as lost)`);
  }
  // the refresh ran EARLY: a lost answer while the bearer still lives fails nothing — the request goes on with it, the refresh
  // is asked again after its pause, and that ONE try decides (here: 20064 ⇒ refresh-lost)
  const early = async ({ first, then = 'refuse', left = 10 * 60e3, disconnect = false, reauth = false, lateMs = 0 }) => {
    let clock = 1_800_000_000_000;
    const tok = mkTokens({ ...tokenOf('ur-early', 0), expiresAt: clock + left, refreshExpiresAt: clock + 7 * 86400e3 });
    let n = 0; const bearers = [];
    const fetchFn = async (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : null;
      if (body && body.grant_type === 'refresh_token') {
        n++;
        if (disconnect && n === 1) await tok.clear();   // the owner's Disconnect lands while the POST is in flight
        if (reauth && n === 1) tok.st.token = { ...tok.st.token, access_token: 'u-REAUTH', refresh_token: 'ur-REAUTH', expiresAt: clock + 2 * 3600e3 };
        if (n === 1 && first) return first();
        if (lateMs) { clock += lateMs; lateMs = 0; return jsonRes({ code: 0, access_token: 'u-late', refresh_token: 'ur-late', expires_in: 7200 }); }
        if (then === 'ok') return jsonRes({ code: 0, access_token: 'u-r2', refresh_token: 'ur-r2', expires_in: 7200 });
        return jsonRes(R20064, 400);
      }
      bearers.push(init && init.headers && init.headers.Authorization);
      return jsonRes({ code: 0, data: { items: [], has_more: false } });
    };
    const a = lark.adapter.create({ id: 'le', brand: 'feishu' }, { now: () => clock, fetch: fetchFn, tokens: tok, resolveIntegration: () => CRED, log: quiet });
    const call = () => a.listConversations({ limit: 5 }).then(() => null, (e) => e);
    const raw = () => a.apiBearer().then((b) => ({ b }), (e) => ({ e }));
    // the raw-API door's own send (src/server/channel-api.js run(): `token = await c.bearer()`, then ONE fetch with it)
    const wire = async () => { const r = await raw(); if (r.b) await fetchFn('https://open.feishu.cn/open-apis/im/v1/chats?page_size=1', { method: 'GET', headers: { Authorization: `Bearer ${r.b}` } }); return r; };
    return { a, call, raw, wire, tok, bearers, posts: () => n, tick: (ms) => { clock += ms; }, now: () => clock };
  };
  {
    const E = await early({ first: failWith(cause('UND_ERR_SOCKET')) });
    const f1 = await E.call(); const f2 = await E.call(); const postsPaused = E.posts();
    E.tick(61e3);
    const f3 = await E.call();
    ok(f1 === null && f2 === null && postsPaused === 1 && E.bearers.slice(0, 2).every((b) => b === 'Bearer u-old-ur-early') && !!E.tok.st.token.refreshLostAt,
      `a lost answer with 10 min of bearer left: the requests go on with the bearer held (${E.bearers.length} sent), ONE refresh POST before the pause (${postsPaused}), the loss recorded`);
    ok(f3 && f3.code === 'auth-expired' && f3.detail.cause === 'refresh-lost' && E.posts() === 2, `after the pause the ONE try: 20064 ⇒ refresh-lost (${f3 && f3.detail && f3.detail.cause}, ${E.posts()} POSTs)`);
  }
  {
    // r2 (acceptance r1's MAJOR, pause-dropped-bearer.cjs): a Disconnect lands while the refresh POST is in flight, then a 503 /
    // a cut — the raw-API door (apiBearer: no bearerNow re-read) used to send the DROPPED bearer
    // (the ruling, 11:10Z): DISCONNECTED ⇒ refused BY NAME and 0 requests on the wire with any bearer; SUPERSEDED by a landed
    // re-authorize ⇒ the store's NEW bearer on the wire, never the captured one
    for (const [how, first] of [['503', () => jsonRes({ code: 500, msg: 'internal' }, 503)], ['cut', failWith(cause('UND_ERR_SOCKET'))]]) {
      const E = await early({ first, disconnect: true });
      const r = await E.wire();
      const c = await E.call();
      ok(r.e && r.e.code === 'auth-expired' && r.e.detail && r.e.detail.tokenDropped === true && r.e.detail.why === 'disconnected' && !E.tok.st.token && E.bearers.length === 0 && c && E.posts() === 1,
        `r2: a Disconnect while the refresh was in flight + a ${how}: the raw-API door is REFUSED by name (${r.b ? `bearer=${r.b}` : `${r.e && r.e.code}: ${String(r.e && r.e.message).slice(0, 90)}`}), 0 requests on the wire (${E.bearers.length}: ${JSON.stringify(E.bearers)}), no second refresh (${E.posts()} POST)`);
    }
    const E = await early({ first: () => jsonRes({ code: 500, msg: 'internal' }, 503), reauth: true });
    const r = await E.wire();
    const c = await E.call();
    ok(r.b === 'u-REAUTH' && c === null && E.bearers.length === 2 && E.bearers.every((b) => b === 'Bearer u-REAUTH') && E.posts() === 1,
      `r2: a re-authorize landing while the refresh was in flight + a 503: the store's NEW bearer on the wire — the raw door and the next request (${JSON.stringify(E.bearers)}), never the captured one, no second refresh (${E.posts()} POST)`);
  }
  {
    // r2 (acceptance r1's renew attack e5): a refusal that does not kill the sign-in (HTTP 400, an unknown code) inside the
    // margin — the bearer still lives: the request goes on with it, the refresh waits its pause (r1: 2 POSTs a pass, every pass failed)
    const E = await early({ first: () => jsonRes({ code: 12345, msg: 'an unknown refusal' }, 400), then: 'ok' });
    const f1 = await E.call(); const f2 = await E.call(); const p1 = E.posts();
    E.tick(61e3);
    const f3 = await E.call();
    ok(f1 === null && f2 === null && p1 === 1 && f3 === null && E.posts() === 2 && E.tok.st.token.refresh_token === 'ur-r2', `r2: an unknown refusal inside the margin pauses like a 5xx — the requests go on (${p1} POST in the pause), the try after it rotates (${E.tok.st.token.refresh_token})`);
    // …but never with a bearer in its LAST minute (it would expire on the wire)
    const L = await early({ first: () => jsonRes({ code: 500, msg: 'internal' }, 503), left: 45e3 });
    const l1 = await L.call();
    ok(l1 && l1.code === 'transport' && L.bearers.length === 0, `r2: a bearer with 45 s left is never served from a failed refresh (${l1 && l1.code}, ${L.bearers.length} sent)`);
  }
  {
    // r2 (acceptance r1's late-answer attack): an answer READ 90 min after its send — the lifetime counts from the SEND
    const E = await early({ lateMs: 90 * 60e3 });
    const sentAt = E.now();
    await E.call();
    const t = E.tok.st.token;
    ok(t && t.access_token === 'u-late' && t.expiresAt === sentAt + 7200e3, `r2: an answer read 90 min late keeps the vendor's clock — expiresAt = the send + 7200 s (${t ? (t.expiresAt - sentAt) / 60e3 : '-'} min after the send; r1: 210)`);
  }
  const okAfter = failWith(cause('UND_ERR_SOCKET'));
  okAfter.retry = 'ok';
  const r3 = await run(okAfter);
  ok(r3.e2 === null && r3.tok.refresh_token === 'ur-r' && !r3.tok.refreshLostAt && r3.posts === 2, `a lost answer whose ONE retry succeeds: the rotated token, the lost fact gone (${r3.tok.refresh_token}, ${r3.posts} POSTs)`);
}

// ── ③b r3: a vault LOCKED while the refresh is in flight is named as locked — never «disconnected» (acceptance r2) ──
console.log('\n③b r3: a vault locked mid-refresh is `vault-locked` by name; a token the vendor rotated under the lock is kept for the unlock');
{
  const lockStore = (t) => { const st = { token: t, locked: false }; return { st, read: () => (st.locked ? { token: null, why: 'vault-locked' } : { token: st.token, why: st.token ? null : 'never-authenticated' }),
    write: async (x, meta = {}) => { if (st.locked) throw new Error('the vault is locked'); if (meta.supersedes !== undefined && String((st.token && st.token.refresh_token) || '') !== String(meta.supersedes || '')) return { superseded: true }; st.token = x; return { written: true }; }, clear: async () => { st.token = null; } }; };
  const held = () => ({ access_token: 'u-held', expiresAt: Date.now() + 10 * 60e3, refresh_token: 'ur-1', refreshExpiresAt: Date.now() + 86400e3, scopes: ['im:message'], openId: 'ou_v' });
  const mkV = (tokens, answer, pace = async () => {}) => { const reg = CH.createChannelRegistry(); reg.register(lark.adapter); const posts = [];
    const a = reg.create('lark', { id: 'lv' }, { fetch: async (url, init) => { const body = init && init.body ? JSON.parse(init.body) : null; if (body && body.grant_type === 'refresh_token') { posts.push(body.refresh_token); return answer(body.refresh_token); } return jsonRes({ code: 404 }, 404); }, tokens, resolveIntegration: () => CRED, log: quiet, pace, meter: () => {} });
    return { a, posts }; };
  const tryB = async (a) => { try { return { bearer: await a.apiBearer() }; } catch (e) { return { code: e.code, detail: e.detail || null }; } };
  const t5 = lockStore(held());
  const v5 = mkV(t5, () => { t5.st.locked = true; return jsonRes({ code: 500, msg: 'internal' }, 503); });
  const r5 = await tryB(v5.a);
  ok(r5.code === 'vault-locked' && !(r5.detail && r5.detail.tokenDropped), `a lock lands during the refresh POST, then a 503: the request hears \`vault-locked\` by name (${JSON.stringify(r5)}; 9221575b: auth-expired, tokenDropped, why disconnected)`);
  const tS = lockStore(held()); const spent = new Set();
  const vS = mkV(tS, (rt) => { if (spent.has(rt)) return jsonRes(R20064, 400); spent.add(rt); tS.st.locked = true; return jsonRes({ code: 0, access_token: 'u-rot', refresh_token: 'ur-rot', expires_in: 7200, refresh_token_expires_in: 604800 }); });
  const rS = await tryB(vS.a);
  tS.st.locked = false;
  const rS2 = await tryB(vS.a);
  ok(rS.code === 'vault-locked' && rS2.bearer === 'u-rot' && vS.posts.length === 1 && tS.st.token && tS.st.token.refresh_token === 'ur-rot' && !tS.st.token.invalidGrantAt,
    `the vendor ROTATED the token as the lock landed: vault-locked now, the rotated token written at the first read after the unlock — ONE POST, no 20064 (${JSON.stringify(rS)} → ${JSON.stringify(rS2)}, POSTs ${vS.posts.length}, store ${tS.st.token && tS.st.token.refresh_token}; 9221575b discarded it and the spent token met 20064)`);
  const tP = lockStore(held());
  const vP = mkV(tP, () => jsonRes({ code: 404 }, 404), async () => { tP.st.locked = true; });
  const rP = await tryB(vP.a);
  ok(rP.code === 'vault-locked' && vP.posts.length === 0, `a lock during the refresh's pace: vault-locked, nothing sent (${JSON.stringify(rP)}, POSTs ${vP.posts.length})`);
}

// ── ④ R3: the margin and the pass's own renew — past the back-off gate (r2) ──
console.log('\n④ R3: the refresh runs early — a 15-min margin, renewed by the pass itself');
{
  ok(lark.REFRESH_MARGIN_MS >= 15 * 60e3, `REFRESH_MARGIN_MS = ${lark.REFRESH_MARGIN_MS} ms (≥ 15 min of the token's 2 h)`);
  const mk = (leftMs) => {
    const tok = mkTokens(tokenOf('ur-m', leftMs));
    const seen = [];
    const fetchFn = async (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : null;
      seen.push(body && body.grant_type === 'refresh_token' ? 'refresh' : new URL(url).pathname);
      if (body && body.grant_type === 'refresh_token') return { ok: true, status: 200, json: async () => ({ code: 0, access_token: 'u-m2', refresh_token: 'ur-m2', expires_in: 7200 }) };
      return { ok: true, status: 200, json: async () => ({ code: 0, data: { items: [], has_more: false } }) };
    };
    return { a: lark.adapter.create({ id: 'lm', brand: 'feishu' }, { fetch: fetchFn, tokens: tok, resolveIntegration: () => CRED, log: quiet }), seen, tok };
  };
  const m1 = mk(10 * 60e3);
  await m1.a.listConversations({ limit: 5 });
  ok(m1.seen[0] === 'refresh' && m1.tok.st.token.refresh_token === 'ur-m2', `a token with 10 min left is refreshed before the request (${m1.seen.join(' → ')})`);
  const m2 = mk(10 * 60e3);
  const r = m2.a.auth && has(m2.a.auth.renew) ? await m2.a.auth.renew() : undefined;
  ok(r === true && m2.seen.join() === 'refresh' && m2.tok.st.token.refresh_token === 'ur-m2', `auth.renew() inside the margin: ONE refresh, nothing else (${r}, ${m2.seen.join()})`);
  const m3 = mk(60 * 60e3);
  const r3 = m3.a.auth && has(m3.a.auth.renew) ? await m3.a.auth.renew() : undefined;
  ok(r3 === false && m3.seen.length === 0, `auth.renew() with an hour left: nothing (${r3}, ${m3.seen.length} requests)`);
  // the engine's pass asks the adapter to renew, once per pass, on a connected account — r2: never inside a back-off, and a
  // DEAD refusal it meets is that pass's failure (the item, the red line), never swallowed
  const dir = path.join(ROOT, 'renew');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ ...acctRec('rn', 'u', 'rn', 'Renewing'), options: {} }] }, null, 1));
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const m = fake.makeFakeAdapter({ kind: 'rn', receive: 'poll', sendAs: ['user'] });
  let renews = 0, renewDead = false, wit = null;
  const registry = CH.createChannelRegistry();
  registry.register({ kind: 'rn', caps: m.caps, create(rec, deps) { wit = deps.loopWitness || null; const impl = m.create(rec, deps); impl.auth = { ...(impl.auth || {}), async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; }, async renew() { renews++; if (renewDead) throw new CH.ChannelError('auth-expired', 'lark token refresh: The refresh token has been revoked. (20064)', { retryable: false, detail: { cause: 'revoked-elsewhere' } }); return false; } }; return impl; } });
  const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
  const eng = ENG.create({ dataDir: dir, registry, env: {}, broadcast: () => {}, log: quiet, userTodos, serverSetting: () => undefined });
  const rec = () => eng.adapterRecords().adapters.find((x) => x.id === 'rn') || {};
  try {
    await eng.pass('rn', { force: true });
    await eng.pass('rn', { force: true });
    ok(renews === 2, `the engine's pass renews on its own, once per pass (${renews} of 2 passes)`);
    renewDead = true;
    const pr = await eng.pass('rn', { force: true });
    const item = userTodos.snapshot().open.find((i) => i.action && i.action.type === 'channel-reauth' && i.action.adapterId === 'rn');
    ok(pr && pr.ok === false && rec().signinDead && rec().signinDead.cause === 'revoked-elsewhere' && item && item.urgency === 'urgent' && rec().lastPass && rec().lastPass.code === 'auth-expired',
      `r2: a DEAD refusal met by the renew (no due request) runs the request's ladder — the record, the urgent item, the red line (${JSON.stringify(rec().signinDead && rec().signinDead.cause)}, item ${!!item}; r1 swallowed it)`);
    const n0 = renews;
    const rr = await tryAsync(() => eng.refresh('rn', 'rn-ops', { origin: 'agent' }));
    ok(renews === n0, `r2: inside the back-off a request-driven pass makes no renew POST (renews ${n0} → ${renews}; the request: ${rr && (rr.code || (rr.threw && rr.threw.message) || JSON.stringify(rr)).toString().slice(0, 60)})`);
    // the hub's witness of a stall, handed to every adapter: loop-blame's slow sync fs calls over that window
    ok(has(wit), 'r2: the engine hands its adapters the stall witness (`loopWitness`)');
    if (has(wit)) {
      const nw = Date.now(), hold = [{ from: nw - 22500, to: nw - 1000 }];
      ok(wit(21500, hold) === null, '…which names nothing when no slow sync fs call fell in the window (this suite\'s hold was a wait)');
      LoopBlame.note({ at: nw - 22000, ms: 20900, fn: 'readFileSync', path: '/mnt/nas/x.jsonl', bytes: null, caller: 'src/x.js:1' });
      ok(wit(21500, hold) === 'disk', '…and names the disk when the slow sync fs calls it timed cover the stall');
      ok(wit(21500) === null && wit(21500, [{ from: nw - 90000, to: nw - 68500 }]) === null, 'r3: …only inside the HOLD\'s own window — no window, or a hold elsewhere, names nothing (9221575b judged the instant of the call)');
    }
  } finally { try { eng.stop(); } catch { } try { userTodos.stop(); } catch { } }
  const m4 = mk(30e3);
  const r4 = m4.a.auth && has(m4.a.auth.renew) ? await m4.a.auth.renew() : undefined;
  ok(r4 === false && m4.seen.length === 0, `r2: never in the bearer's last minute — the request's own refresh is the one try there (${r4}, ${m4.seen.length} requests)`);
}

// ── ④b r3: renew()'s dead refusal answers the pass's waiters; a vault locked under a call counts no failure (acceptance r2) ──
console.log('\n④b r3: a dead refusal at the renew answers the waiting requests with the dead sign-in; one press, one step');
{
  const dir = path.join(ROOT, 'renew-dead');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ ...acctRec('rd', 'u', 'rd', 'Renewing'), options: {} }, { ...acctRec('rp', 'u', 'rd', 'Pressed'), options: {} }, { ...acctRec('vl', 'u', 'rd', 'Locking'), options: {} }] }, null, 1));
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const m = fake.makeFakeAdapter({ kind: 'rd', receive: 'poll', sendAs: ['user'] });
  let clock = Date.now(); const now = () => clock;
  const dead = new Set(), locked = new Set(), hist = {};
  const DEAD = () => new CH.ChannelError('auth-expired', 'lark token refresh: The refresh token has been revoked. (20064)', { retryable: false, detail: { cause: 'revoked-elsewhere' } });
  const registry = CH.createChannelRegistry();
  registry.register({ kind: 'rd', caps: m.caps, create(rec, deps) {
    const impl = m.create(rec, deps); const h = impl.history;
    impl.history = async (...a) => { hist[rec.id] = (hist[rec.id] || 0) + 1; if (dead.has(rec.id)) throw DEAD(); if (locked.has(rec.id)) throw CH.notConnectedError('Locking', 'vault-locked'); return h.apply(impl, a); };
    impl.auth = { ...(impl.auth || {}), async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; }, async renew() { if (dead.has(rec.id)) throw DEAD(); return false; } };
    return impl;
  } });
  const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
  const eng = ENG.create({ dataDir: dir, registry, env: {}, broadcast: () => {}, log: quiet, userTodos, serverSetting: () => undefined, now });
  const rec = (id) => eng.adapterRecords().adapters.find((x) => x.id === id) || {};
  try {
    for (const id of ['rd', 'rp', 'vl']) { await eng.pass(id, { force: true }); await eng.pass(id, { force: true }); }
    clock += 10 * 60e3;
    dead.add('rd'); dead.add('rp');
    const h0 = hist.rd || 0;
    const ar = await tryAsync(() => eng.refresh('rd', 'rd-ops', { origin: 'agent' }));
    ok(ar && ar.code === 'auth-expired' && rec('rd').consecutiveFailures === 1 && (hist.rd || 0) === h0 && rec('rd').signinDead,
      `an agent's refresh whose pass met the dead refusal at the renew hears the DEAD sign-in (code ${ar && ar.code}; 9221575b: backoff, «retried in 30 s»), one failure (${rec('rd').consecutiveFailures}), no second pass (history ${h0} → ${hist.rd || 0})`);
    const p0 = hist.rp || 0;
    const pr = await tryAsync(() => eng.refresh('rp', 'rd-ops', { origin: 'refresh' }));
    ok(pr && pr.code === 'auth-expired' && rec('rp').consecutiveFailures === 1 && (hist.rp || 0) === p0,
      `the owner's ONE press climbs ONE step (failures ${rec('rp').consecutiveFailures}; 9221575b: 2 — a second pass ran the request; history ${p0} → ${hist.rp || 0})`);
    locked.add('vl');
    const vr = await tryAsync(() => eng.refresh('vl', 'rd-ops', { origin: 'agent' }));
    const vr2 = await tryAsync(() => eng.refresh('vl', 'rd-ops', { origin: 'agent' }));
    ok(vr && vr.code === 'vault-locked' && vr2 && vr2.code === 'vault-locked' && rec('vl').consecutiveFailures === 0 && !(rec('vl').lastPass && rec('vl').lastPass.code === 'vault-locked'),
      `a vault locked under the vendor call counts NO failure — the agent hears vault-locked twice, no back-off (${vr && vr.code}, ${vr2 && vr2.code}; failures ${rec('vl').consecutiveFailures}; 9221575b: 1 and «backoff»)`);
  } finally { try { eng.stop(); } catch { } try { userTodos.stop(); } catch { } }
}

// ── ⑤ R4: the words — measured only, the length first, units, vendor-free; the For-you store keeps or refuses by name ──
console.log('\n⑤ R4: the words name the MEASURED stall');
{
  const span = has(CC.stallSpanOf) ? CC.stallSpanOf : () => null;
  const table = [[999, null], [1000, { seconds: 1 }], [59499, { seconds: 59 }], [59999, { minutes: 1 }], [90e3, { minutes: 1.5 }], [9.94 * 60e3, { minutes: 9.9 }], [5368840, { minutes: 89 }], [2 * 3600e3 - 1, { minutes: 120 }], [2 * 3600e3, { hours: 2 }], [129600000, { hours: 36 }], [2 * 86400e3, { days: 2 }], [30 * 86400e3, { days: 30 }]];
  const bad = table.filter(([ms, want]) => JSON.stringify(span(ms)) !== JSON.stringify(want));
  ok(!bad.length, `r2: the units — seconds under a minute, minutes under 2 h (one decimal under ten), hours from 2 h, days from 2 days (${table.map(([ms, w]) => `${ms}→${JSON.stringify(w)}`).join(' ')})`, JSON.stringify(bad.map(([ms, w]) => [ms, w, span(ms)])));
  const zhRow = CC.signinLineText({ authState: 'expired', authCause: 'refresh-lost', authHeldMs: 5368840 }, { t: tOf(zh) });
  ok(zhRow === '登录失效 — 需要重新授权 · hub 在刷新令牌时卡住了 89 分钟，一次性刷新令牌已被用掉', `the owner's MEASURED hold (5 368 840 ms), zh row: «${zhRow}»`);
  const zh36 = CC.signinLineText({ authState: 'expired', authCause: 'refresh-lost', authHeldMs: 129600000 }, { t: tOf(zh) });
  ok(zh36.includes('卡住了 36 小时'), `r2: 36 h is «36 小时», never «2160 分钟»: «${zh36}»`);
  const jaRow = CC.signinLineText({ authState: 'expired', authCause: 'refresh-lost', authHeldMs: 13e3 }, { t: tOf(ja) });
  ok(/hub が 13 秒間止まり/.test(jaRow) && !/Lark|（/.test(jaRow), `ja: «${jaRow}»`);
  const en = CC.signinLineText({ authState: 'expired', authCause: 'refresh-lost', authHeldMs: 5 * 60e3 + 20e3 });
  ok(/the hub stalled 5\.3 min while refreshing the sign-in, and its single-use/.test(en), `en: «${en}»`);
  // a cause word ONLY from the hub's witness of that window
  const disk = CC.signinLineText({ authState: 'expired', authCause: 'refresh-lost', authHeldMs: 5368840, authHeldWhy: 'disk' }, { t: tOf(zh) });
  ok(disk === '登录失效 — 需要重新授权 · hub 在刷新令牌时被 NAS/磁盘读写卡住了 89 分钟，一次性刷新令牌已被用掉', `r2: the witness named the disk ⇒ the words say it (no parentheses): «${disk}»`);
  const W = has(CC.stallWitnessOf) ? CC.stallWitnessOf : () => 'n/a';
  const at = 1_800_000_000_000;
  ok(W([{ at: at - 21000, ms: 20000 }], { heldMs: 21500, windows: [{ from: at - 22500, to: at }] }) === 'disk' && W([{ at: at - 21000, ms: 831 }], { heldMs: 12777, windows: [{ from: at - 13777, to: at }] }) === null && W([], { heldMs: 21500, windows: [{ from: at - 22500, to: at }] }) === null,
    'r2: the witness: slow sync fs calls covering ≥ half the stall ⇒ disk; the incident minute\'s 831 ms writeFileSync in a 12.8 s hold ⇒ nothing (on-CPU); none ⇒ nothing');
  // r3 (acceptance r2's two shapes): judged on the HOLD's own window, never the instant the loss was recorded
  const T0w = 1_700_000_000_000;
  const ringB = []; for (let t = T0w + 5000; t < T0w + 20000; t += 700) ringB.push({ at: t, ms: 400 });
  ok(W([{ at: T0w, ms: 30000 }], { heldMs: 29000, windows: [{ from: T0w, to: T0w + 30000 }] }) === 'disk' && W(ringB, { heldMs: 4000, windows: [{ from: T0w, to: T0w + 5000 }] }) === null && W([{ at: T0w, ms: 30000 }], { heldMs: 29000 }) === null,
    'r3: (a) a 30 s sync fs hold says disk whenever its loss is recorded; (b) a 5 s CPU hold with sync reads in the live wait AFTER it names nothing; no window ⇒ nothing');
  // every stall key: vendor-free and parenthesis-free in every language (the item's {kind} names the vendor; the item's own
  // parentheses wrap the cause — one level)
  const keys = [...['seconds', 'minutes', 'hours', 'days'].flatMap((u) => [CC.signinCauseText('refresh-lost', { heldMs: { seconds: 5e3, minutes: 5 * 60e3, hours: 5 * 3600e3, days: 5 * 86400e3 }[u], heldWhy: null, t: (k) => k }), CC.signinCauseText('refresh-lost', { heldMs: { seconds: 5e3, minutes: 5 * 60e3, hours: 5 * 3600e3, days: 5 * 86400e3 }[u], heldWhy: 'disk', t: (k) => k })]), CC.signinCauseText('refresh-lost', { heldMs: 0, t: (k) => k }), CC.signinCauseText('refused-at-first-use', { t: (k) => k })];
  // r3 (acceptance r2: a Latin «Feishu» planted in the zh hours key passed — the regex knew 飞书 and Lark only, while the ja
  // dictionary itself spells the vendor «Feishu»): every spelling, any case; the dictionaries' own vendor words are {kind}
  // values (the item names the vendor through the account's label) — exempt BY KEY, never by the regex missing a spelling
  const VENDOR_RE = /飞书|lark|feishu|[（()）]/i;
  const KIND_KEYS = ['Feishu'];
  const census = (zhD, jaD) => keys.filter((k) => !k || [k, zhD[k], jaD[k]].some((v) => typeof v !== 'string' || VENDOR_RE.test(v)));
  const dirty = census(zh, ja);
  ok(keys.length === 10 && new Set(keys).size === 10 && !dirty.length, `r2: the ${keys.length} cause keys carry zh + ja, no vendor name, no parentheses in any language`, JSON.stringify(dirty));
  const hoursKey = CC.signinCauseText('refresh-lost', { heldMs: 5 * 3600e3, heldWhy: null, t: (k) => k });
  const planted = census({ ...zh, [hoursKey]: `${zh[hoursKey]} Feishu` }, ja);
  ok(planted.length === 1 && planted[0] === hoursKey, `r3: the census knows the Latin spelling — «Feishu» planted in the zh hours key is named (${JSON.stringify(planted)})`);
  ok(KIND_KEYS.every((k) => !keys.includes(k) && VENDOR_RE.test(zh[k]) && VENDOR_RE.test(ja[k])), `r3: the dictionaries' own vendor words (zh «${zh.Feishu}», ja «${ja.Feishu}») are {kind} values — exempt by KEY (none is a cause key), and the census regex would name them`);
  const acts = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-actions.js'), 'utf-8');
  ok(acts.includes("typeof v.key === 'string' ? t(v.key, v.params || undefined) : v"), 'the For-you renderer (`said`) fills a words-param with its own params — the rule this suite renders by');
  const ut = new UserTodoManager({ dataDir: path.join(ROOT, 'todos'), expirySweepMs: 0 });
  try {
    const it = ut.add('channels', { origin: 'channels', kind: 'action', text: 'x: sign-in expired — re-authorize', urgency: 'urgent', by: 'agent', i18n: { text: { key: '{account}: sign-in expired — re-authorize ({cause})', params: { account: 'x', cause: { key: 'k {seconds}', params: { seconds: 21 } } } } } });
    ok(JSON.stringify(it.i18n.text.params.cause) === JSON.stringify({ key: 'k {seconds}', params: { seconds: 21 } }), `the For-you store keeps a words-param's scalar params (${JSON.stringify(it.i18n.text.params.cause)})`);
    let msg = '';
    try { ut.add('channels', { origin: 'channels', kind: 'action', text: 'y: sign-in expired — re-authorize', urgency: 'urgent', by: 'agent', i18n: { text: { key: '{account}: sign-in expired — re-authorize ({cause})', params: { account: 'y', cause: { key: 'k {seconds}', params: { seconds: 21, junk: { a: 1 } } } } } } }); } catch (e) { msg = e.message; }
    ok(/params\.cause\.params\.junk must be a string or a finite number \(object refused\)/.test(msg), `r2: …and REFUSES any other shape by name (r1 dropped it silently and the row said «{…}»): «${msg}»`);
  } finally { try { ut.stop(); } catch { } }
  // the producer files its words WITHOUT a refused shape (never a literal on the screen) — its store refusal is said
  const eng0 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  ok(/the For-you store refused the dead sign-in's cause words/.test(eng0) && /it = fileWith\(false\)/.test(eng0), 'r2: the producer (speakSignin) says a refusal in the log and files the item without the refused words');
}

// ── ⑥ R5 r2: a landing on a dead sign-in VERIFIES — never «works again» before a request answered, red ONCE with its own cause ──
console.log('\n⑥ R5: a consent that lands on a dead sign-in is «signed in — verifying» until its first request answers');
{
  const dir = path.join(ROOT, 'land');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [acctRec('ld', 'Owner D'), acctRec('lg', 'Owner G'), acctRec('lt', 'Owner T')] }, null, 1));
  const TOK = { ld: mkTokens(tokenOf('ur-D', 15e3)), lg: mkTokens(tokenOf('ur-G', 15e3)), lt: mkTokens(tokenOf('ur-T', 15e3)) };
  await planRt('ur-D', 'revoked'); await planRt('ur-G', 'revoked'); await planRt('ur-T', 'revoked');
  const lines = []; const T0 = performance.now(); const ms = () => Math.round(performance.now() - T0);
  const log = { log: (s) => lines.push(`${ms()} ${s}`), warn: (s) => lines.push(`${ms()} ${s}`), error: (s) => lines.push(`${ms()} ${s}`) };
  const depsOf = {};
  const registry = CH.createChannelRegistry();
  registry.register({ ...lark.adapter, create: (rec, deps) => { depsOf[rec.id] = deps; return lark.adapter.create(rec, { ...deps, log, tokens: TOK[rec.id], resolveIntegration: () => CRED, fetch: viaLoopback }); } });
  const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
  const frames = { ld: [], lg: [], lt: [] };
  const eng = ENG.create({ dataDir: dir, registry, env: {}, log, userTodos, serverSetting: () => undefined,
    broadcast: (m) => { if (m && m.type === 'channels-updated' && m.digest && m.digest.adapters) for (const a of m.digest.adapters) if (frames[a.id]) frames[a.id].push({ t: ms(), item: (itemOf(a.id) || {}).status || null, authState: a.authState, authVerifying: a.authVerifying === true, authCause: a.authCause, authSince: a.authSince, line: CC.signinLineText(a, { t: tOf(zh) }) }); } });
  const rec = (id) => eng.adapterRecords().adapters.find((r) => r.id === id) || {};
  const itemOf = (id) => (userTodos._state.items || []).find((i) => i.action && i.action.type === 'channel-reauth' && i.action.adapterId === id) || null;
  const settle = async (id, f) => { for (let i = 0; i < 200 && !f(rec(id)); i++) await sleep(25); await sleep(200); };
  try {
    await eng.pass('ld', { force: true }); await eng.pass('lg', { force: true }); await eng.pass('lt', { force: true });
    ok(rec('ld').signinDead && rec('lg').signinDead && itemOf('ld') && itemOf('ld').status === 'open', 'setup: both sign-ins dead (20064), their items open');
    const land = async (id, token) => {
      TOK[id].st.token = token;
      const nF = frames[id].length, nL = lines.length, t = ms();
      if (!(depsOf[id] && has(depsOf[id].onAuthDone))) return { frames: [], lines: [], t };
      await depsOf[id].onAuthDone(id, { ok: true });
      return { nF, nL, t };
    };
    // D: the NEW token the vendor refuses (99991663) at its first request
    const dl = await land('ld', { access_token: 'u-bad-D2', expiresAt: Date.now() + 2 * 3600e3, refresh_token: 'ur-D2', refreshExpiresAt: Date.now() + 7 * 86400e3, scopes: ['im:message'], openId: 'ou_ur-D', name: 'Owner ur-D', brand: 'feishu' });
    const atLanding = { item: (frames.ld[dl.nF] || {}).item || null, view: frames.ld[dl.nF] || null };
    await settle('ld', (r) => r.signinDead);
    const fD = frames.ld.slice(dl.nF);
    const states = fD.map((f) => (f.authState === 'ok' ? (f.authVerifying ? 'verifying' : 'ok') : f.authState)).filter((s, i, a) => i === 0 || a[i - 1] !== s);
    const dD = rec('ld').signinDead || {};
    ok(atLanding.view && atLanding.view.authState === 'ok' && atLanding.view.authVerifying && atLanding.view.line === '已登录 — 正在用第一个请求验证…' && atLanding.item === 'done',
      `the landing's own broadcast: the row green with the verifying word, the item resolved (${JSON.stringify(atLanding.view && { s: atLanding.view.authState, v: atLanding.view.authVerifying, line: atLanding.view.line })}, item ${atLanding.item})`);
    ok(JSON.stringify(states) === JSON.stringify(['verifying', 'expired']),
      `a refused first request turns the row red ONCE — never a plain «ok» before it, never back (${states.join(' → ')})`, JSON.stringify(fD.map((f) => [f.t - dl.t, f.authState, f.authVerifying])));
    const lastD = fD[fD.length - 1] || {};
    ok(dD.cause === 'refused-at-first-use' && lastD.authCause === 'refused-at-first-use' && /新的登录在第一次请求时就被拒绝了/.test(lastD.line || '') && Number(dD.since) === Number(atLanding.view && atLanding.view.authSince) && itemOf('ld') && itemOf('ld').status === 'open',
      `…with the refusal's OWN cause, \`since\` = the landing, the item filed again: «${lastD.line}» (since ${dD.since} vs the landing ${atLanding.view && atLanding.view.authSince})`);
    const logD = lines.slice(dl.nL).map((s) => s.replace(/^\d+ /, ''));
    ok(logD.some((s) => /ld: a new sign-in landed — verifying it with its first request/.test(s)) && !logD.some((s) => /ld: the sign-in works again/.test(s)) && logD.some((s) => /ld: the new sign-in \(landed .*\) was refused at its first request \(refused-at-first-use\)/.test(s)),
      `the log is honest — «verifying» at the landing, never «works again», the refusal named: ${JSON.stringify(logD.filter((s) => /ld:/.test(s)).map((s) => s.slice(0, 110)))}`);
    // G: a NEW token that works — «works again» only after its first requests answered
    const gl = await land('lg', { access_token: 'u-good-G2', expiresAt: Date.now() + 2 * 3600e3, refresh_token: 'ur-G2', refreshExpiresAt: Date.now() + 7 * 86400e3, scopes: ['im:message'], openId: 'ou_ur-G', name: 'Owner ur-G', brand: 'feishu' });
    await settle('lg', (r) => !r.signinVerifying && r.lastPass && r.lastPass.ok);
    const fG = frames.lg.slice(gl.nF).map((f) => (f.authState === 'ok' ? (f.authVerifying ? 'verifying' : 'ok') : f.authState)).filter((s, i, a) => i === 0 || a[i - 1] !== s);
    const logG = lines.slice(gl.nL).map((s) => s.replace(/^\d+ /, '')).filter((s) => /lg:/.test(s));
    const iLand = logG.findIndex((s) => /a new sign-in landed — verifying/.test(s)), iWorks = logG.findIndex((s) => /the sign-in works again \(the first requests with the new sign-in went through\)/.test(s));
    ok(JSON.stringify(fG) === JSON.stringify(['verifying', 'ok']) && iLand >= 0 && iWorks > iLand && rec('lg').lastPass && rec('lg').lastPass.ok === true,
      `a NEW token that works: verifying → ok after its pass answered, «works again» said then (${fG.join(' → ')}; ${JSON.stringify(logG.map((s) => s.slice(0, 90)))})`);
    // T (r3, acceptance r2 C3): a THIRD landing during the verifying window — L2's first request answered 503 (still verifying),
    // then L3 lands and the vendor refuses ITS first request: the verdict is L3's — `since` = L3's landing, the log names L3
    const tok3 = (at, rt) => ({ access_token: at, expiresAt: Date.now() + 2 * 3600e3, refresh_token: rt, refreshExpiresAt: Date.now() + 7 * 86400e3, scopes: ['im:message'], openId: 'ou_ur-T', name: 'Owner ur-T', brand: 'feishu' });
    const t2 = await land('lt', tok3('u-5xx-T2', 'ur-T2'));
    await settle('lt', (r) => r.signinVerifying && r.lastPass && r.lastPass.ok === false);
    const sinceL2 = Number((frames.lt[t2.nF] || {}).authSince) || null;
    const midT = { verifying: !!rec('lt').signinVerifying, dead: !!rec('lt').signinDead, code: rec('lt').lastPass && rec('lt').lastPass.code };
    await sleep(1100);
    const t3 = await land('lt', tok3('u-bad-T3', 'ur-T3'));
    const sinceL3 = Number((frames.lt[t3.nF] || {}).authSince) || null;
    await settle('lt', (r) => r.signinDead);
    const dT = rec('lt').signinDead || {};
    const logT = lines.slice(t3.nL).map((s) => s.replace(/^\d+ /, '')).filter((s) => /lt:/.test(s));
    ok(midT.verifying && !midT.dead && sinceL2 && sinceL3 && sinceL3 - sinceL2 >= 1000 && Number(dT.since) === sinceL3 && dT.cause === 'refused-at-first-use'
      && logT.some((s) => s.includes(`the new sign-in (landed ${new Date(sinceL3).toISOString()}) was refused at its first request`)) && !logT.some((s) => s.includes(new Date(sinceL2).toISOString()) && /was refused/.test(s)),
      `r3 C3: a third landing while the second verifies (its first request 503: ${JSON.stringify(midT)}) — L3's refusal is L3's verdict: since = L3's landing (${dT.since}; L2 ${sinceL2}, L3 ${sinceL3}; 9221575b: L2), the log names L3: ${JSON.stringify(logT.map((s) => s.slice(0, 120)))}`);
  } finally { try { eng.stop(); } catch { } try { userTodos.stop(); } catch { } }
  // the re-authorize dialog: a landing missed while the socket was down is read ONCE on reconnect; Escape on a running
  // sign-in asks first (the dialog-yield seam) — source facts here, the chrome leg in test-integrations-ui (l)
  const dlg = fs.readFileSync(path.join(REPO, 'src/lib/channel-account-dialogs.js'), 'utf-8');
  ok(/app\.ws\.onStateChange\(onState\)/.test(dlg) && /fetchJson\('\/api\/channels\?scope=accounts'\)\.then\(\(d\) => \{ if \(d && Array\.isArray\(d\.adapters\)\) judge/.test(dlg), 'r2: the dialog\'s watcher re-reads the account ONCE on every reconnect (a landing broadcast missed while the socket was down)');
  const md = fs.readFileSync(path.join(REPO, 'src/lib/mounts-dialog.js'), 'utf-8');
  ok(/escapeToClose: true, onEscape: \(\) => escapeAsk\(\) \}\)/.test(md) && /tr\('Cancel the sign-in\?'\)/.test(md) && /askFirst: showConfirmDialog/.test(dlg), 'r2: the re-authorize dialog\'s Escape on a RUNNING sign-in asks «Cancel the sign-in?» (onEscape, the OAT shape)');
  ok(/onClose: closed, escapeToClose: true/.test(md) && /onClose: \(\) => \{ if \(watcher\) \{ watcher\.off\(\); watcher = null; \} \}/.test(dlg), 'r3: every close of the dialog (✕, backdrop, Escape, its finish) tears its watcher down — the chrome count in test-integrations-ui (r)');
}

await worker.terminate();
console.log(`\n${fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
