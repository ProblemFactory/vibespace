#!/usr/bin/env node
// LANE lark-refresh-stall (the owner's hub, measured from its journal: 2026-10-26 13:34 PT after 12–17 s loop holds in a
// row, and 2026-10-27 19:17 PT 24 s after an 89.5-min NFS hold — both times `lark: the sign-in expired
// (revoked-elsewhere) … The refresh token has been revoked … can only be used once (20064)`; the owner: 「为啥我的 lark
// 登录失效了」). The token refresh POST ran under AbortSignal.timeout(20 s); the timer came due WHILE the loop was held and
// libuv runs due timers before it polls the sockets, so the abort won over the vendor's answer already in the socket —
// the single-use refresh token was spent, its successor dropped, the retry refused 20064 and said «signed in elsewhere».
//
// Over the REAL engine + the REAL Lark adapter + the REAL For-you store, against a FAKE Lark token endpoint on loopback
// that runs in a WORKER THREAD (it answers while the main loop is held). ONE synchronous hold of 21.5 s (Atomics.wait —
// never a busy loop) covers two accounts at once:
//   A  the endpoint ANSWERS during the hold  ⇒ the answer is read after it: the token rotated + persisted, no re-auth
//   B  the endpoint spends the token and CUTS the socket during the hold ⇒ a LOST answer, recorded; ONE retry of the old
//      token ⇒ 20064 ⇒ `refresh-lost` naming the stall (never `revoked-elsewhere`) — the log, the item, the row
//   C  CONTROL: a real revoke elsewhere (20064, no lost answer before it) still says `revoked-elsewhere`
// Then the pieces without a hold: the live-time bound (R1), a lost answer with no stall / a request that never left
// (R2), the 15-min margin + the pass's own renew (R3), the words in zh / ja (R4).
//
// RED on 6428c67e (run this file inside a `git archive` copy of the base): A dies `revoked-elsewhere` with an urgent
// item after two refresh POSTs; B says `revoked-elsewhere`; the margin is 60 s and no pass renews; no live bound exists.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
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

const lark = require(path.join(REPO, 'src/channels/lark.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CC = require(path.join(REPO, 'src/channel-caps.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const zh = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const ja = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
const tOf = (dict) => (k, p) => fill(dict[k] !== undefined ? dict[k] : k, p);
// the For-you row's words, by the client's own rule (src/lib/user-todos-actions.js `said`, pinned below)
const saidBy = (t) => (l) => t(l.key, Object.fromEntries(Object.entries(l.params || {}).map(([k, v]) => [k, v && typeof v === 'object' && typeof v.key === 'string' ? t(v.key, v.params || undefined) : v])));

const ROOT = scratch('vs-lark-stall');
const CRED = { source: 'user', values: { appId: 'cli_stall0001', appSecret: 'stall-app-' + 'secret-0001' }, missing: [], why: null };
const quiet = { log() {}, warn() {}, error() {} };

// ── the fake Lark token endpoint, OFF the main thread ────────────────────
// sab[0] = token POSTs received, sab[1] = the main loop is held now, sab[2] = answers / cuts made while it was held
const sab = new Int32Array(new SharedArrayBuffer(16));
const WORKER = `
const http = require('node:http');
const { parentPort, workerData } = require('node:worker_threads');
const sab = workerData.sab;
const plan = new Map(), spent = new Set(), posts = new Map();
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (res, status, body) => { const b = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) }); res.end(b); };
const R20064 = { code: 20064, error: 'invalid_grant', error_description: 'The refresh token has been revoked. Please note that a refresh token can only be used once.' };
parentPort.on('message', (m) => {
  if (m.type === 'plan') { plan.set(m.rt, m.mode); parentPort.postMessage({ type: 'planned', rt: m.rt }); }
  if (m.type === 'posts') parentPort.postMessage({ type: 'posts', posts: Object.fromEntries(posts) });
});
const srv = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    const u = req.url;
    if (u.startsWith('/open-apis/authen/v2/oauth/token')) {
      const body = JSON.parse(raw || '{}');
      const rt = String(body.refresh_token || '');
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

// ── ① THE HELD LOOP over the real engine: A answered, B lost, C revoked elsewhere ──
console.log('\n① a refresh in flight across a 21.5 s held loop — over the real engine + Lark adapter + For-you store');
{
  const dir = path.join(ROOT, 'engine');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  const acct = (id, user) => ({ id, kind: 'lark', label: 'Lark / 飞书', enabled: true, options: { brand: 'feishu' }, auth: { tokenEnc: 'held-sign-in', expiresAt: null, scopes: ['im:message'], user },
    lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [acct('la', 'Owner A'), acct('lb', 'Owner B'), acct('lc', 'Owner C')] }, null, 1));
  // every token inside the OLD 60 s margin, so the base refreshes on demand at its first request as the lane does at its renew;
  // each bearer dies DURING the hold (15 s), so nothing after it can lean on the old one
  const TOK = { la: mkTokens(tokenOf('ur-A', 15e3)), lb: mkTokens(tokenOf('ur-B', 15e3)), lc: mkTokens(tokenOf('ur-C', 15e3)) };
  await planRt('ur-A', 'answer-in-hold'); await planRt('ur-B', 'cut-in-hold'); await planRt('ur-C', 'revoked');
  const lines = [];
  const log = { log: (s) => lines.push(String(s)), warn: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) };
  const registry = CH.createChannelRegistry();
  registry.register({ ...lark.adapter, create: (rec, deps) => lark.adapter.create(rec, { ...deps, log, tokens: TOK[rec.id], resolveIntegration: () => CRED, fetch: viaLoopback }) });
  const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
  const frames = [];
  const eng = ENG.create({ dataDir: dir, registry, env: {}, broadcast: (m) => frames.push(m), log, userTodos, serverSetting: () => undefined });
  const items = () => userTodos.snapshot().open.filter((i) => i.sessionKey === 'channels' && i.action && i.action.type === 'channel-reauth');
  const itemOf = (id) => items().find((i) => i.action.adapterId === id) || null;
  const view = (id) => eng.digest({ scope: 'accounts' }).adapters.find((a) => a.id === id) || {};
  const rec = (id) => eng.adapterRecords().adapters.find((r) => r.id === id) || {};
  try {
    const pA = eng.pass('la', { force: true });
    const pB = eng.pass('lb', { force: true });
    for (let i = 0; i < 400 && Atomics.load(sab, 0) < 2; i++) await Atomics.waitAsync(sab, 0, Atomics.load(sab, 0), 50).value;
    const leftBefore = Atomics.load(sab, 0);
    // THE HELD LOOP — the one synchronous wait of this suite (Atomics.wait, the thread sleeps; 21.5 s > the old 20 s timer)
    Atomics.store(sab, 1, 1);
    const h0 = performance.now();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 21500);
    const heldFor = performance.now() - h0;
    Atomics.store(sab, 1, 0);
    await Promise.all([pA, pB]);
    ok(leftBefore >= 2 && heldFor >= 21000 && Atomics.load(sab, 2) === 2, `the two refresh POSTs had LEFT before the hold (${leftBefore}), the loop was held ${Math.round(heldFor)} ms, and the endpoint answered A and cut B while it was held (${Atomics.load(sab, 2)} of 2)`);
    // the engine's next pass of each (the base's retry road), then C — a refusal with no lost answer before it
    await eng.pass('la', { force: true }); await eng.pass('lb', { force: true });
    await eng.pass('lc', { force: true });
    const posts = await postsNow();

    // A: the answer that waited in the socket is READ — the rotated pair on the record, no re-auth, ONE POST
    ok(TOK.la.st.token && TOK.la.st.token.refresh_token === 'ur-new-ur-A' && TOK.la.st.token.access_token === 'u-new-ur-A' && !TOK.la.st.token.invalidGrantAt && posts['ur-A'] === 1,
      `A (answered during the hold): the answer is read AFTER the hold — the rotated token persisted, ONE refresh POST (${posts['ur-A']}), held ${TOK.la.st.token && TOK.la.st.token.refresh_token}`);
    ok(!rec('la').signinDead && !itemOf('la') && view('la').authState === 'ok',
      `A: no dead sign-in, no re-authorize item, the row says ok (signinDead ${JSON.stringify(rec('la').signinDead || null)}, item ${!!itemOf('la')})`);

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
    ok(iB && iB.urgency === 'urgent' && p && p.cause && p.cause.key === "the hub stalled {seconds} s while refreshing the sign-in (NAS / disk), and its single-use refresh token was used up" && secs >= 20 && secs <= 25
      && zhItem.includes(`hub 在刷新令牌时卡住了 ${secs} 秒（NAS/磁盘），飞书的一次性刷新令牌已被用掉`) && !/另一个 VibeSpace/.test(zhItem),
      `B's For-you item (urgent) names the stall: «${zhItem}»`);
    const vB = view('lb');
    const rowZh = CC.signinLineText(vB, { t: tOf(zh) });
    ok(vB.authState === 'expired' && vB.authCause === 'refresh-lost' && vB.authHeldMs >= 20000 && rowZh.includes('hub 在刷新令牌时卡住了') && !/另一个 VibeSpace/.test(rowZh),
      `B's row (the account view → the red line in zh): «${rowZh}»`);
    const logB = lines.find((s) => /lb: the sign-in expired \(refresh-lost; the hub's loop was held 2\d s while the refresh's answer waited\)/.test(s));
    const lostLine = lines.find((s) => /the token refresh's answer was lost after the request left .*the hub's loop was held 2\d s while it waited/.test(s));
    ok(!!logB && !!lostLine, `the hub log names the cause code and the stall: «${(logB || '').slice(0, 160)}» · «${(lostLine || '').slice(0, 160)}»`);
    ok(!lines.some((s) => /lb: the sign-in expired \(revoked-elsewhere/.test(s)), 'B is never logged `revoked-elsewhere`');

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

// ── ② R1: the live-time bound — a held turn never fires; running time does ──
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
  }
  const src = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf-8');
  const refresh = src.slice(src.indexOf('  async function refreshAccessToken('), src.indexOf('  function bearerNow('));
  ok(/what: 'lark token refresh', liveMs: REFRESH_BOUND_MS,/.test(refresh) && !/AbortSignal\.timeout/.test(refresh), 'the refresh POST carries the live bound and no AbortSignal.timeout');
}

// ── ③ R2: a lost answer without a stall; a request that never left; a lost answer then a success ──
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
        return { ok: false, status: 400, json: async () => ({ code: 20064, error: 'invalid_grant', error_description: 'The refresh token has been revoked. Please note that a refresh token can only be used once.' }) };
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
  const cut = () => { const c = new Error('other side closed'); c.code = 'UND_ERR_SOCKET'; throw Object.assign(new TypeError('fetch failed'), { cause: c }); };
  const r1 = await run(cut);
  ok(r1.e1 && r1.e1.code === 'transport' && r1.e1.detail && r1.e1.detail.lost === true && !!r1.mid.refreshLostAt, `a socket cut after the send: transport, \`lost\`, recorded on the token (${r1.e1 && r1.e1.code}, refreshLostAt ${!!r1.mid.refreshLostAt})`);
  ok(r1.e2 && r1.e2.code === 'auth-expired' && r1.e2.detail.cause === 'refresh-lost' && r1.e2.detail.vendorCause === 'revoked-elsewhere' && r1.posts === 2 && r1.e3 && r1.e3.detail.cause === 'refresh-lost',
    `the ONE try after it: 20064 ⇒ refresh-lost (vendor said revoked-elsewhere), then nothing more is POSTed (${r1.posts} POSTs; the next call keeps the cause)`);
  ok(CC.signinCauseText('refresh-lost', { heldMs: 0, t: tOf(zh) }) === '刷新令牌的应答在途中丢失，飞书的一次性刷新令牌已被用掉', 'no stall measured: the words say the answer was lost on the way');
  const refused = () => { const c = new Error('connect ECONNREFUSED'); c.code = 'ECONNREFUSED'; throw Object.assign(new TypeError('fetch failed'), { cause: c }); };
  const r2 = await run(refused);
  ok(r2.e1 && r2.e1.code === 'transport' && !r2.mid.refreshLostAt && r2.e2 && r2.e2.detail.cause === 'revoked-elsewhere',
    `CONTROL: a request that never LEFT (ECONNREFUSED) records nothing, and a later 20064 stays revoked-elsewhere (${r2.e2 && r2.e2.detail.cause})`);
  // the refresh ran EARLY: a lost answer while the bearer still lives fails nothing — the request goes on with it, the refresh
  // is asked again after its pause, and that ONE try decides (here: 20064 ⇒ refresh-lost)
  {
    let clock = 1_800_000_000_000;
    const tok = mkTokens({ ...tokenOf('ur-early', 0), expiresAt: clock + 10 * 60e3, refreshExpiresAt: clock + 7 * 86400e3 });
    let n = 0; const bearers = [];
    const fetchFn = async (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : null;
      if (body && body.grant_type === 'refresh_token') { n++; if (n === 1) cut(); return { ok: false, status: 400, json: async () => ({ code: 20064, error: 'invalid_grant', error_description: 'The refresh token has been revoked. Please note that a refresh token can only be used once.' }) }; }
      bearers.push(init && init.headers && init.headers.Authorization);
      return { ok: true, status: 200, json: async () => ({ code: 0, data: { items: [], has_more: false } }) };
    };
    const a = lark.adapter.create({ id: 'le', brand: 'feishu' }, { now: () => clock, fetch: fetchFn, tokens: tok, resolveIntegration: () => CRED, log: quiet });
    const f1 = await a.listConversations({ limit: 5 }).then(() => null, (e) => e);
    const f2 = await a.listConversations({ limit: 5 }).then(() => null, (e) => e);
    const postsPaused = n;
    clock += 61e3;
    const f3 = await a.listConversations({ limit: 5 }).then(() => null, (e) => e);
    ok(f1 === null && f2 === null && postsPaused === 1 && bearers.slice(0, 2).every((b) => b === 'Bearer u-old-ur-early') && !!tok.st.token.refreshLostAt,
      `a lost answer with 10 min of bearer left: the requests go on with the bearer held (${bearers.length} sent), ONE refresh POST before the pause (${postsPaused}), the loss recorded`);
    ok(f3 && f3.code === 'auth-expired' && f3.detail.cause === 'refresh-lost' && n === 2, `after the pause the ONE try: 20064 ⇒ refresh-lost (${f3 && f3.detail && f3.detail.cause}, ${n} POSTs)`);
  }
  const okAfter = () => cut();
  okAfter.retry = 'ok';
  const r3 = await run(okAfter);
  ok(r3.e2 === null && r3.tok.refresh_token === 'ur-r' && !r3.tok.refreshLostAt && r3.posts === 2, `a lost answer whose ONE retry succeeds: the rotated token, the lost fact gone (${r3.tok.refresh_token}, ${r3.posts} POSTs)`);
}

// ── ④ R3: the margin and the pass's own renew ──
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
  // the engine's pass asks the adapter to renew, once per pass, on a connected account
  const dir = path.join(ROOT, 'renew');
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'rn', kind: 'rn', label: 'Renewing', enabled: true, auth: { tokenEnc: 'held-sign-in', expiresAt: null, scopes: [], user: 'u' },
    lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null }] }, null, 1));
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const m = fake.makeFakeAdapter({ kind: 'rn', receive: 'poll', sendAs: ['user'] });
  let renews = 0;
  const registry = CH.createChannelRegistry();
  registry.register({ kind: 'rn', caps: m.caps, create(rec, deps) { const impl = m.create(rec, deps); impl.auth = { ...(impl.auth || {}), async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; }, async renew() { renews++; return false; } }; return impl; } });
  const eng = ENG.create({ dataDir: dir, registry, env: {}, broadcast: () => {}, log: quiet, serverSetting: () => undefined });
  try {
    await eng.pass('rn', { force: true });
    await eng.pass('rn', { force: true });
    ok(renews === 2, `the engine's pass renews on its own, once per pass (${renews} of 2 passes)`);
  } finally { try { eng.stop(); } catch { } }
}

// ── ⑤ R4: the words, every language; the For-you renderer reads a words-param's own params ──
console.log('\n⑤ R4: the words name the stall');
{
  const mins = CC.signinLineText({ authState: 'expired', authCause: 'refresh-lost', authHeldMs: 89.5 * 60e3 }, { t: tOf(zh) });
  ok(mins === '登录失效 — 需要重新授权 · hub 在刷新令牌时卡住了 90 分钟（NAS/磁盘），飞书的一次性刷新令牌已被用掉', `the owner's 89.5-min hold, zh row: «${mins}»`);
  const jaRow = CC.signinLineText({ authState: 'expired', authCause: 'refresh-lost', authHeldMs: 13e3 }, { t: tOf(ja) });
  ok(/hub が 13 秒間止まり/.test(jaRow), `ja: «${jaRow}»`);
  const en = CC.signinLineText({ authState: 'expired', authCause: 'refresh-lost', authHeldMs: 5 * 60e3 + 20e3 });
  ok(/the hub stalled 5\.3 min while refreshing the sign-in \(NAS \/ disk\)/.test(en), `en: «${en}»`);
  for (const k of ["the hub stalled {minutes} min while refreshing the sign-in (NAS / disk), and its single-use refresh token was used up", "the hub stalled {seconds} s while refreshing the sign-in (NAS / disk), and its single-use refresh token was used up", "the answer to the sign-in's refresh was lost on the way, and its single-use refresh token was used up"]) ok(typeof zh[k] === 'string' && typeof ja[k] === 'string', `zh + ja carry «${k.slice(0, 48)}…»`);
  const acts = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-actions.js'), 'utf-8');
  ok(acts.includes("typeof v.key === 'string' ? t(v.key, v.params || undefined) : v"), 'the For-you renderer (`said`) fills a words-param with its own params — the rule this suite renders by');
  const ut = new UserTodoManager({ dataDir: path.join(ROOT, 'todos'), expirySweepMs: 0 });
  try {
    const it = ut.add('channels', { origin: 'channels', kind: 'action', text: 'x: sign-in expired — re-authorize', urgency: 'urgent', by: 'agent', i18n: { text: { key: '{account}: sign-in expired — re-authorize ({cause})', params: { account: 'x', cause: { key: 'k {seconds}', params: { seconds: 21, junk: { a: 1 } } } } } } });
    ok(JSON.stringify(it.i18n.text.params.cause) === JSON.stringify({ key: 'k {seconds}', params: { seconds: 21 } }), `the For-you store keeps a words-param's scalar params, nothing else (${JSON.stringify(it.i18n.text.params.cause)})`);
  } finally { try { ut.stop(); } catch { } }
}

await worker.terminate();
console.log(`\n${fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
