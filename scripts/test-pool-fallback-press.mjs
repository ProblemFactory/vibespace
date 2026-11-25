#!/usr/bin/env node
// THE CONVERSATION's OWN PRESS (row B-d578, the fallback member — 主开发 r3918; its round's cure r4199), lane lg-providers: the strip's
// fact (the engine's fallbackFactOf) and the two doors that name ONE conversation, through the REAL engine on a real AccountManager,
// provider store and vault on a scratch dir, and the REAL account routes (create() on a handler map):
//   «Move to» — the open fallback ask's Allow once for ONE conversation (the tree's one verdict of a person; a field present but empty,
//     a list, «always» with a conversation: refused by name; pressed twice: one entry, one move, «already on its way»; the For-you
//     item's count drawn again at once; its own page request still passes);
//   «Move back» — F3b's press for ONE conversation (a bearer refused; one not on the pool's fallback refused by name; a move back
//     queued offers no second press);
//   THE PUSH — the strip's facts told through the session list's ONE notify point, debounced, only on a change.
// Each red copy is LOADED and RUN. Split from test-pool-fallback (r4199 (7)): these scenes have their own row and reading.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const M = mutantCopies('pool-fallback-press', REPO);
// a press's move lands after its awaited refusal check (the managed settings read): read the moves once the queue and the moves
// in flight are EMPTY — the fact itself, at most 3 s (a fixed settle raced the load on the box: line 893's lesson)
const landed = async (w, ms = 3000) => { for (let t = 0; t < ms && (w.eng._fbQueue.size || w.eng._fbInFlight.size); t += 25) await w.settle(); await w.settle(); };

const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const PS = require(path.join(REPO, 'src/server/provider-store.js'));
const PSP = require(path.join(REPO, 'src/server/provider-spawn.js'));
const MP = require(path.join(REPO, 'src/model-providers.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));

const DATA = scratchDir('pool-fallback-press');
const vault = VE.create({ dataDir: DATA, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
await vault.setup('correct horse battery staple', {});
const store = PS.create({ dataDir: DATA, vault: () => vault, log: () => {} });
const KEY = ['sk-', 'pool', '-fall', 'back-', 'b7d2e9'].join('');   // built at runtime (never a token-shaped literal)
const ds = (await store.add({ preset: 'deepseek', key: KEY })).provider;
const wireAm = (AM, dir = DATA) => {
  const am = new AM({ dataDir: dir });
  am.setProviderLookup((a) => store.forAccount(a));
  am.setProviderSpawn(PSP.create({ providers: store, dataDir: dir }), (id, be, model) => PSP.modelFor(store, id, model, be));
  return am;
};
const login = (am, id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, subscriptionType: 'max' } }), { mode: 0o600 });

console.log('— the conversation\'s own press: its fact, its two doors, the push');
{
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const nowS = () => Math.floor(Date.now() / 1000);
  const cacheOf = (u5) => JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'on-demand', fiveHour: { utilization: u5, resetsAt: nowS() + 7200 }, sevenDay: { utilization: 0.4, resetsAt: nowS() + 3 * 86400 } });
  const EMPTY_MANAGED = path.join(scratchDir('pool-fallback-press-managed-none'), 'none');   // the machine's managed Claude settings folder, stood in EMPTY (never the test machine's own)
  const world = ({ engM = null, cross = null, bHealthy = false, pools = 1, managedDir = EMPTY_MANAGED, landingMs = 90e3, fb = null } = {}) => {
    const dir = scratchDir('pool-fallback-press-eng'), root = fs.mkdtempSync(path.join(dir, 'w-')), dataDir = path.join(root, 'data');
    const wam = wireAm(AccountManager, dataDir);
    wam.setProviderRows(() => MP.rosterRowsOf(store.thirdParty(), { usable: (p) => vault.state() === 'unlocked' && store.hasKey(p.id) }));
    const WA = wam.createSubscription({ name: 'Member A' }).id, WB = wam.createSubscription({ name: 'Member B' }).id;
    login(wam, WA); login(wam, WB);
    const poolIds = [];
    for (let i = 0; i < pools; i++) {
      const id = wam.createPool({ name: i ? 'Team ' + (i + 1) : 'Team', members: [WA, WB] }).id;
      wam.setPoolTarget(id, WA); wam.updatePool(id, { hot: true, fallbackProviders: fb || [ds.id], ...(cross ? { crossProvider: cross } : {}) });
      poolIds.push(id);
    }
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, WA + '.json'), cacheOf(1)); fs.writeFileSync(path.join(cacheDir, WB + '.json'), cacheOf(bHealthy ? 0.1 : 1));
    const sessions = new Map(), notices = [], sent = [], items = [], cards = [], metas = new Map(), clients = new Set(), statusFns = [];
    const meta = { mode: 'ok', held: [] }, lists = { n: 0 };   // lists: the session list's ONE notify point, asked (r3918 (e))
    const metaStore = {
      readSessionMeta: (k) => metas.get(k) || null,
      writeSessionMeta: (k, m, o = {}) => {
        if (o.durable && meta.mode === 'fail') return Promise.resolve(false);
        if (o.durable && meta.mode === 'hold') return new Promise((res) => meta.held.push(() => { metas.set(k, m); res(true); }));
        metas.set(k, m); return Promise.resolve(true);
      },
    };
    const todos = {
      add(key, it) { const id = 'ut-' + (items.length + 1); items.push({ ...it, id, key, status: 'open' }); return { id }; },
      setStatus(id, status, by) { const it = items.find((x) => x.id === id); if (it) { it.status = status; it.by = by; } return it; },
      redrawItem(pred, { text, detail, i18n } = {}) { const it = items.find((x) => x.status === 'open' && pred(x)); if (!it) return { ok: false }; if (text) it.text = text; if (detail) it.detail = detail; if (i18n) it.i18n = i18n; it.redrawn = (it.redrawn || 0) + 1; return { ok: true }; },
      openItems() { return items.filter((x) => x.status === 'open'); }, onStatus(fn) { statusFns.push(fn); },
      dismiss(id) { const it = items.find((x) => x.id === id); if (!it) return; it.status = 'done'; it.by = 'tray'; for (const f of statusFns) f(it, { status: 'done' }); },
    };
    const eng = (engM || require(path.join(REPO, 'src/server/usage-pool-engine.js'))).create({
      app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t, o) => notices.push({ k, t, o }), serverSetting: () => undefined, getAccounts: () => wam,
      getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
      getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
      getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { sent.push({ type: 'FIRE' }); } }),
      getQuotaProbe: () => null, getSessionMetaStore: () => metaStore, getUserTodos: () => todos, managedClaudeDir: managedDir, vaultState: () => vault.state(), fallbackLandingMs: landingMs,
      onSessionListChange: () => { lists.n++; },
    });
    eng.usageEstimator.burnFor = () => ({});
    eng.usageEstimator.predictVerdict = () => ({ state: 'on', n: 99 });
    const mk = (sid, pool = poolIds[0], extra = {}) => {
      const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: pool, name: sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } },
        _spawnModel: 'sonnet', _pickedModel: 'sonnet', _pickedModelAt: Date.now(), _lastPtyDataAt: Date.now() - 20 * 60e3, _isStreaming: false, _turnState: 'idle', _historyLoaded: true,
        _normalizer: { injectPeerCard: (c) => cards.push({ sid, ...c }) }, ...extra };
      sessions.set(sid, s); metas.set(s.sockName, { backend: 'claude', name: sid });
      if (!extra._heldPoolMember) wam.ensureSessionPoolLink(pool, sid, WA, { why: 'spawn' });
      return s;
    };
    const mute = (f) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return f(); } finally { console.log = o; console.warn = w; } };
    const settle = () => new Promise((r) => setTimeout(r, 25));
    const pass = async (pool = poolIds[0]) => { mute(() => { eng._poolAutoLast.clear(); eng._poolSwitchAt.clear(); eng.maybePoolAutoSwitchForPool(pool, { force: true }); }); await settle(); };
    const restarts = () => sent.filter((m) => m.type === 'pool-auto-switched').flatMap((m) => m.affected);
    const client = () => clients.add({ readyState: 1, send: (p) => sent.push(JSON.parse(p)) });
    return { am: wam, eng, A: WA, B: WB, P: poolIds[0], P2: poolIds[1], pools: poolIds, cacheDir, sessions, notices, sent, items, cards, metas, meta, mk, pass, settle, mute, restarts, client, todos, lists, dataDir };
  };
  const fbItems = (w) => w.items.filter((x) => x.action && x.action.type === 'pool-cross-provider' && x.action.fallback === true);
  const heal = (w) => fs.writeFileSync(path.join(w.cacheDir, w.A + '.json'), cacheOf(0.1));
  const wall = (w) => fs.writeFileSync(path.join(w.cacheDir, w.A + '.json'), cacheOf(1));
  const onFbRec = (w, sid, rec) => w.mk(sid, w.P, { claudeSessionId: 'cid-' + sid, _heldPoolMember: ds.id, _lastPtyDataAt: Date.now(), _poolFallback: { poolId: w.P, provider: ds.id, fromMember: w.A, toModel: 'deepseek-chat', at: Date.now() - 16 * 60e3, by: 'pool', ...rec } });
  const ENG = read('src/server/usage-pool-engine.js');
  // (B-d578 r3918) THE CONVERSATION's OWN PRESS: its fact (fallbackFactOf) and the two routes naming ONE conversation — through the REAL
  // routes (account-usage-routes create() on a handler map) and the REAL engine of the world; a bearer refused; only THAT conversation acts
  {
    const AURc = require(path.join(REPO, 'src/server/account-usage-routes.js'));
    const PAGEc = { 'sec-fetch-site': 'same-origin' };
    const BEARc = 'Bearer ' + ['demo', '-key-', '0002'].join(''), VSSTc = 'Bearer ' + ['vs', 'st_'].join('') + 'demo0002';
    const mountRoutes = (w, MOD = AURc) => {
      const handlers = new Map();
      const app = { get: (p, h) => handlers.set('GET ' + p, h), post: (p, h) => handlers.set('POST ' + p, h), put: (p, h) => handlers.set('PUT ' + p, h), delete: (p, h) => handlers.set('DELETE ' + p, h), patch: (p, h) => handlers.set('PATCH ' + p, h), use: () => { }, locals: {} };
      const root = scratchDir('pool-fallback-press-routes'); fs.mkdirSync(path.join(root, 'data'), { recursive: true });
      w.mute(() => MOD.create({ app, rootDir: root, HOST: '127.0.0.1', CLAUDE_CMD: 'claude', NODE_CMD: 'node', CLAUDE_SUBSCRIPTION_LOGIN_HELPER: '/dev/null', activeSessions: w.sessions, auth: { enabled: false }, engine: w.eng,
        serverSetting: () => undefined, recordUsageAttribution() { }, liveAccountIdSet: () => new Set(), buildClaudeSubscriptionLoginCommand: () => 'true', getAccounts: () => w.am, getHosts: () => null, getMounts: () => null,
        getTelemetry: () => ({ ingestRemote: () => 0, centralSummary: () => ({}) }), getUsageHistory: () => null, getLoginExpiryWatch: () => ({ sweep: () => ({ resolved: [] }) }) }));
      // the routes wired their OWN (empty) provider store — its lookup's start prune emptied every pool's list, its spawn knows no
      // provider: the world's own wiring back (as wireAm), then each pool's list as the world set it
      w.am.setProviderLookup((a) => store.forAccount(a));
      w.am.setProviderRows(() => MP.rosterRowsOf(store.thirdParty(), { usable: (p) => vault.state() === 'unlocked' && store.hasKey(p.id) }));
      w.am.setProviderSpawn(PSP.create({ providers: store, dataDir: w.dataDir }), (id, be, model) => PSP.modelFor(store, id, model, be));
      for (const id of w.pools) w.am.updatePool(id, { fallbackProviders: [ds.id] });
      const call = async (key, params, body, headers = {}) => { const h = handlers.get(key); if (!h) return { missing: key }; let out = null, code = 200; const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } }; await w.mute(async () => h({ params, body, headers, socket: {} }, res)); return { code, body: out }; };
      return { call };
    };
    // «Move to»: three conversations wait at every member's wall; the pool asks (Ask me first)
    const toScene = async (engM = null, MOD = AURc) => {
      const wC = world(engM ? { engM } : {}); const rt = mountRoutes(wC, MOD);   // mounted first: the scene runs on the world's own wiring
      wC.client(); for (let i = 0; i < 3; i++) wC.mk('cp' + i); await wC.pass();
      const it = fbItems(wC)[0], ask = it && it.action.askId, fCan = wC.eng.fallbackFactOf('cp0');
      const bearer = await rt.call('POST /api/accounts/pool-cross/asks/:askId', { askId: ask }, { answer: 'once', sid: 'cp0' }, { authorization: VSSTc });
      const notWaiting = await rt.call('POST /api/accounts/pool-cross/asks/:askId', { askId: ask }, { answer: 'once', sid: 'nope' }, PAGEc);
      const page = await rt.call('POST /api/accounts/pool-cross/asks/:askId', { askId: ask }, { answer: 'once', sid: 'cp0' }, PAGEc);
      await landed(wC);
      const q = [...wC.eng._fbAsks.values()].find((x) => x.askId === ask);
      return { ask, fCan, bearer: bearer.code, notWaiting: notWaiting.code + ':' + (notWaiting.body && notWaiting.body.code), page: page.code + ':' + (page.body && page.body.queued), moved: wC.restarts().map((t) => t.serverId), left: q ? [...q.sids.keys()].sort() : null };
    };
    const tc = await toScene();
    ok(!!(tc.ask && tc.fCan && tc.fCan.can && tc.fCan.can.askId === tc.ask && tc.fCan.can.sid === 'cp0' && !tc.fCan.on),
      '(r3918) a conversation waiting at every member\'s wall while its pool ASKS carries {can: the fallback and the open ask} — its strip\'s «Move to»', tc.fCan);
    ok(tc.bearer === 403 && tc.notWaiting === '409:not_waiting' && tc.page === '200:1' && eq(tc.moved, ['cp0']) && eq(tc.left, ['cp1', 'cp2']),
      '(r3918 (a) (f)) «Move to» BY REQUESTS: an agent\'s bearer is refused (the For-you road\'s own guard); a conversation not waiting is refused by name; the page\'s own request is the ask\'s Allow once for THAT conversation — it alone moves, the pool\'s other two still wait and the ask stays open for them', tc);
    // «Move back»: two conversations on the fallback, a member can take them NOW
    const backScene = async (MOD = AURc) => {
      const wD = world(); const rt = mountRoutes(wD, MOD);
      wD.client(); heal(wD); for (const sid of ['cb0', 'cb1']) onFbRec(wD, sid, { fromModel: 'sonnet' }); await wD.pass();
      const fOn = wD.eng.fallbackFactOf('cb0');
      const bearer = await rt.call('POST /api/accounts/:poolId/fallback/move-back', { poolId: wD.P }, { sids: ['cb0'] }, { authorization: BEARc });
      const notOn = await rt.call('POST /api/accounts/:poolId/fallback/move-back', { poolId: wD.P }, { sids: ['nope'] }, PAGEc);
      const page = await rt.call('POST /api/accounts/:poolId/fallback/move-back', { poolId: wD.P }, { sids: ['cb0'] }, PAGEc);
      await landed(wD);
      const moved = wD.restarts().map((t) => t.serverId);
      wall(wD); const fNo = wD.eng.fallbackFactOf('cb1');
      return { fOn, A: wD.A, bearer: bearer.code, notOn: notOn.code + ':' + (notOn.body && notOn.body.code), page: page.code + ':' + (page.body && page.body.queued), moved, fNo };
    };
    const bc = await backScene();
    ok(!!(bc.fOn && bc.fOn.on && bc.fOn.on.sid === 'cb0' && bc.fOn.on.back && bc.fOn.on.back.id === bc.A && !/@/.test(bc.fOn.on.back.name || '') && !bc.fOn.can),
      '(r3918) a conversation on its pool\'s fallback that a member can take NOW carries {on: the provider, back: that member BY NAME} — its strip\'s «Move back»', bc.fOn);
    ok(bc.bearer === 403 && bc.notOn === '409:not_on_fallback' && bc.page === '200:1' && eq(bc.moved, ['cb0']),
      '(r3918 (f)) «Move back» BY REQUESTS: a bearer is refused; a conversation not on the pool\'s fallback is refused by name; the page\'s own request moves THAT conversation back only — the other stays on the fallback', bc);
    ok(!!(bc.fNo && bc.fNo.on && !bc.fNo.on.back && bc.fNo.on.why), '(r3918 (d)) with no member able to take it, the fact carries NO member and says why — the strip draws no press', bc.fNo);
    // RED (loaded, run): an engine copy whose «Allow once» ignores the named conversation queues the whole pool
    const tx = await toScene(M.load('src/server/usage-pool-engine.js', anchored(ENG, "  if (sid) {\n    if (answer !== 'once') return { ok: false, status: 400, code: 'bad_args', error: 'one conversation is answered «once» only' };", "  if (false) {\n    if (answer !== 'once') return { ok: false, status: 400, code: 'bad_args', error: 'one conversation is answered «once» only' };", 'the named conversation ignored'), 'eng-once-all'));
    ok(tx.moved.length === 3, 'CONTROL (loaded, run): an engine copy whose answer ignores the named conversation moves all three — «Move to» would spend for conversations nobody pressed ⇒ the leg goes RED', tx.moved);
    const AURS = read('src/server/account-usage-routes.js');
    const bx = await backScene(M.load('src/server/account-usage-routes.js', anchored(AURS, '    const r = engine.fallbackMoveBack(poolId, sids);', '    const r = engine.fallbackMoveBack(poolId, null);', 'the press for the whole pool'), 'routes-back-all'));
    ok(bx.moved.length === 2, 'CONTROL (loaded, run): a routes copy whose press drops the named conversation moves the pool\'s every one back ⇒ the «Move back» leg goes RED', bx.moved);
    // (r4199 (1) (2) (3) (4) (5)) THE «MOVE TO» DOOR, BY REQUESTS — the tree's one verdict of a person; ONE conversation named by a
    // non-empty string; «always» never with a conversation; pressed twice: one entry, one move, the second told «already on its way»
    const VSAK = 'Bearer ' + ['vs', 'ak_'].join('') + 'demo0003';   // an automation key's shape (built at runtime)
    const doorScene = async () => {
      const w = world(); const rt = mountRoutes(w); w.client(); for (let i = 0; i < 3; i++) w.mk('cd' + i); await w.pass();
      const ask = (fbItems(w)[0] || { action: {} }).action.askId, post = (body, h = PAGEc) => rt.call('POST /api/accounts/pool-cross/asks/:askId', { askId: ask }, body, h);
      const auto = await post({ answer: 'once', sid: 'cd0' }, { authorization: VSAK });
      const always = await post({ answer: 'always', sid: 'cd0' });
      const empty = await post({ answer: 'once', sid: '' }), nul = await post({ answer: 'once', sid: null }), list1 = await post({ answer: 'once', sid: ['cd0'] }), list2 = await post({ answer: 'once', sid: ['cd0', 'cd1'] });
      const crossAfter = w.am.get(w.P).crossProvider || 'never', queuedAfterRefusals = w.eng._fbQueue.size;
      const first = await post({ answer: 'once', sid: 'cd0' });
      const item = fbItems(w).find((x) => x.status === 'open'), itemText = item ? item.text : null;   // redrawn at once (no pass between)
      const second = await post({ answer: 'once', sid: 'cd0' });   // a second page's press on the same conversation
      await landed(w);
      const moves = w.restarts().filter((t) => t.serverId === 'cd0').length;
      const forYou = await post({ answer: 'once' });   // the For-you item's own page request (no conversation named): the whole ask, still a person's
      await landed(w);
      return { auto: auto.code + ':' + (auto.body && auto.body.code), always: always.code + ':' + (always.body && always.body.code), empty: empty.code, nul: nul.code, list1: list1.code, list2: list2.code, crossAfter, queuedAfterRefusals,
        first: first.code + ':' + (first.body && first.body.queued), itemText, second: second.code + ':' + (second.body && second.body.already) + ':' + (second.body && second.body.state), moves,
        forYou: forYou.code + ':' + (forYou.body && forYou.body.queued), all: w.restarts().map((t) => t.serverId).sort() };
    };
    const dc = await doorScene();
    ok(dc.auto === '403:human_only' && dc.always.startsWith('400:') && dc.crossAfter === 'never' && dc.queuedAfterRefusals === 0,
      '(r4199 (1) (3)) «Move to» is under the tree\'s ONE verdict of a person: an automation key\'s shape is refused (human_only), not only an agent\'s or a job\'s; «always» with a conversation named is refused — the pool is never switched to «Move without asking» by one conversation\'s press; nothing queued', dc);
    ok(dc.empty === 400 && dc.nul === 400 && dc.list1 === 400 && dc.list2 === 400,
      '(r4199 (2) (3)) a conversation field PRESENT but empty (\'\', null) or a LIST (one id or two) is refused by name — never read as «the whole ask», never a list\'s first id', dc);
    ok(dc.first === '200:1' && dc.itemText === '2 conversations of Pool "Team" wait at every member\'s wall: move them to DeepSeek?' && dc.second === '200:1:already' && dc.moves === 1,
      '(r4199 (3) (4) (5)) the same press twice: ONE queue entry and ONE move; the second press is told «already on its way» (never «could not move it»); the For-you item\'s count drawn again AT ONCE for the two still waiting', dc);
    ok(dc.forYou === '200:2' && eq(dc.all, ['cd0', 'cd1', 'cd2']),
      '(r4199 (1)) the For-you item\'s own page request on the same route still passes: its Allow once queues the two still waiting — three moves in all, each once', dc);
    // (r4199 (4)) the ask SETTLED by the first page's press (its only conversation): the second page's press is still «already on its way»
    const lastScene = async () => {
      const w = world(); const rt = mountRoutes(w); w.client(); w.mk('cl0'); await w.pass();
      const ask = (fbItems(w)[0] || { action: {} }).action.askId, post = (body) => rt.call('POST /api/accounts/pool-cross/asks/:askId', { askId: ask }, body, PAGEc);
      const first = await post({ answer: 'once', sid: 'cl0' }), gone = ![...w.eng._fbAsks.values()].some((q) => q.askId === ask);
      const second = await post({ answer: 'once', sid: 'cl0' });
      return { first: first.code, gone, second: second.code + ':' + (second.body && second.body.state) };
    };
    const lc = await lastScene();
    ok(lc.first === 200 && lc.gone && lc.second === '200:already', '(r4199 (4)) the ask settled by the first press (its only conversation): a second page\'s press is told «already on its way» — never «the request is gone»', lc);
    // (r4204) «ALREADY» ONLY OF THE PLACE THE PRESS NAMED: a conversation moved BACK to a member a minute ago, not waiting, pressed
    // «Move to» from a stale page — where the ask is gone (the route) and where it is open for another conversation (the engine's answer)
    const staleScene = async (engM = null) => {
      const w = world(engM ? { engM } : {}); const rt = mountRoutes(w); w.client(); heal(w);
      onFbRec(w, 'cs0', { fromModel: 'sonnet' }); await w.pass();
      const back = await rt.call('POST /api/accounts/:poolId/fallback/move-back', { poolId: w.P }, { sids: ['cs0'] }, PAGEc);
      await landed(w);
      const moved = w.restarts().some((t) => t.serverId === 'cs0');
      const gone = await rt.call('POST /api/accounts/pool-cross/asks/:askId', { askId: 'ask-stale-gone' }, { answer: 'once', sid: 'cs0' }, PAGEc);
      const q = { askId: 'ask-stale-open', key: w.P + ':' + ds.id, poolId: w.P, pv: ds.id, sids: new Map([['cs9', Date.now()]]), todoId: null, n: 1 };
      const inAsk = w.mute(() => w.eng.answerFallbackAsk(q, 'once', Date.now(), { sid: 'cs0' }));
      return { back: back.code + ':' + (back.body && back.body.queued), moved, gone: gone.code + ':' + ((gone.body && (gone.body.state || gone.body.code)) || ''), inAsk: (inAsk.status || 200) + ':' + (inAsk.state || inAsk.code) };
    };
    const st = await staleScene();
    ok(st.back === '200:1' && st.moved && st.gone === '400:bad_args' && st.inAsk === '409:not_waiting',
      '(r4204) a conversation moved BACK to its member, not waiting, pressed «Move to» from a stale page is refused BY NAME — where the ask is gone and where one is open for another conversation — never told «already on its way» to a provider it is not going to', st);
    const stx = await staleScene(M.load('src/server/usage-pool-engine.js', anchored(anchored(ENG, 'if (way && way === q.pv) return', 'if (way) return', 'any move counted in the ask'), "if (way && /^pv-/.test(String(way))) return", 'if (way) return', 'any move counted where the ask is gone'), 'engine-already-anywhere'));
    ok(stx.gone === '200:already' && stx.inAsk === '200:already', 'CONTROL (loaded, run): an engine copy that says «already» of ANY move (the answer before r4204) tells the stale page the conversation is on its way to the provider — both roads ⇒ the leg goes RED', stx);
    // (r4199 (6)) «Move back» while that conversation's move back is QUEUED (in a turn: it waits for the stop): the fact offers no second
    // press and says where it is going; the strip's facts are pushed after the press
    const queuedBack = async () => {
      const w = world(); const rt = mountRoutes(w); w.client(); heal(w);
      onFbRec(w, 'cq0', { fromModel: 'sonnet' }); const s = w.sessions.get('cq0'); s._isStreaming = true; s._turnState = 'running';
      await w.pass(); const sig0 = w.eng._fbFactSig.get(w.P), before = w.eng.fallbackFactOf('cq0');
      const press = await rt.call('POST /api/accounts/:poolId/fallback/move-back', { poolId: w.P }, { sids: ['cq0'] }, PAGEc);
      const after = w.eng.fallbackFactOf('cq0'), sig1 = w.eng._fbFactSig.get(w.P);
      return { before: !!(before && before.on && before.on.back && !before.on.queued), press: press.code + ':' + (press.body && press.body.queued), after, pushed: sig1 !== sig0 };
    };
    const qb = await queuedBack();
    ok(!!(qb.before && qb.press === '200:1' && qb.after && qb.after.on && qb.after.on.queued === true && qb.after.on.back && qb.pushed),
      '(r4199 (6)) a conversation whose move back is QUEUED (its turn first) carries {on, back, queued} — the strip offers no second «Move back» and says it is on its way; the press pushed the strip\'s facts', qb);
    // (r3918 (e)) A CHANGE REACHES EVERY PAGE BY THE PAYLOAD's OWN PUSH — the strip's facts told through the session list's ONE notify
    // point (server.js: broadcastActiveSessions, the /ws frame carrying poolFallback), debounced, only when they move
    const quiet = () => new Promise((r) => setTimeout(r, 360));   // past the engine's one debounce (300 ms)
    const pushScene = async (engM = null, full = true) => {
      const wN = full ? world({ bHealthy: true }) : null; if (wN) { wN.client(); wN.mk('cn0'); await wN.pass(); }   // a member serves: no fact
      const wP = world(engM ? { engM } : {}); wP.client(); wP.mk('cq0'); wP.mk('cq1');
      await wP.pass();                                                  // every member out, the pool asks: {can} for both
      const P = wP.P, sig1 = wP.eng._fbFactSig.get(P); if (full) await quiet(); const n1 = wP.lists.n;
      await wP.pass(); const sig2 = wP.eng._fbFactSig.get(P), again = wP.eng.tellFallbackFacts(P);   // nothing moved — nothing to tell
      const q = [...wP.eng._fbAsks.values()][0];
      wP.meta.mode = 'hold';   // its move's record write is held: the move is ON ITS WAY while cq0 still waits at the wall
      const r = q ? wP.mute(() => wP.eng.answerCrossProviderAsk(q.askId, { answer: 'once', sid: 'cq0' })) : null;   // the strip's press: cq0 queued
      const sig3 = wP.eng._fbFactSig.get(P); if (full) await quiet(); const n3 = wP.lists.n;
      await wP.pass();
      return { n0: wN ? wN.lists.n : null, n1, n3, sig1: typeof sig1, same: sig2 === sig1, again, moved: sig3 !== sig2, queued: r && r.queued,
        f0: wP.eng.fallbackFactOf('cq0'), f1: wP.eng.fallbackFactOf('cq1'), reAsked: !!q && [...wP.eng._fbAsks.values()].some((x) => x.sids.has('cq0')) };
    };
    const pc = await pushScene();
    ok(pc.n0 === 0 && pc.n1 === 1 && pc.same && pc.again === false && pc.moved && pc.n3 === 2,
      '(r3918 (e)) the strip\'s facts reach every page by the live payload\'s own push: nothing to say tells nothing; the ask filed tells ONCE (the session list\'s notify point, debounced); a pass with no change tells nothing; the strip\'s press tells at once', pc);
    ok(!!(pc.queued === 1 && pc.f0 === null && pc.f1 && pc.f1.can),
      '(r3918) a conversation already on its way (its own press; the move waits for its record) carries NO «Move to» at the next pass — no second press — while the pool still asks about the other', { f0: pc.f0, f1: pc.f1, reAsked: pc.reAsked });
    const px = await pushScene(M.load('src/server/usage-pool-engine.js', anchored(ENG, 'tellFallbackStatus(poolId); tellFallbackFacts(poolId, now); }', 'tellFallbackStatus(poolId); }', 'the pass that tells no fact'), 'engine-no-fact-push'), true);   // (r4199 (8)) run WHOLE: its debounce waited, the BROADCAST counted
    ok(px.n1 === 0 && px.sig1 === 'undefined', 'CONTROL (loaded, run, r4199 (8)): an engine copy whose pass tells no fact asks the session list\'s notify point NOTHING after its debounce (the count the green leg reads) — the pages stay on the old strip ⇒ the push leg goes RED', px);
    const py = await pushScene(M.load('src/server/usage-pool-engine.js', anchored(ENG, '  if (_fbQueue.has(sid) || _fbInFlight.has(sid)) return null;', '', 'the fact that forgets a queued move'), 'engine-no-queued-check'), false);
    ok(!!(py.f0 && py.f0.can), 'CONTROL (loaded, run): an engine copy without the on-its-way check offers «Move to» again for the conversation already queued ⇒ the leg goes RED', py.f0);
  }
}

report();
