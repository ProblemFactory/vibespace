#!/usr/bin/env node
// THE POOL'S FALLBACK MEMBER (row B-d578, lane lg-providers — ruling r1516; the scene page r2733 / r2739): a Claude pool may
// list third-party providers as FALLBACK providers (`fallbackProviders`, never in `members`; absent = none), used only when
// EVERY member is out. A REAL AccountManager + provider store + vault + the provider spawn road on a scratch dir.
// UNIT F1 — THE LIST AND THE SPAWN ROAD (inert for a person: no page sets the list yet, the engine reads none):
//   §1 the list: kept deduped, listed by label, persisted; refused BY NAME with nothing written (not a list, not a third-party
//      provider, a record the store does not hold, one that does not serve Claude Code, more than 8, a pool of another harness);
//      a provider in `members` is refused by name (updatePool AND createPool).
//   §2 a provider removed leaves EVERY pool's list in the same act (providersChanged — the provider routes' every write);
//      no store wired ⇒ nothing pruned. CONTROL: a copy whose providersChanged does not prune keeps the gone id.
//   §3 the spawn road: the chooser's answer is a listed fallback ⇒ the provider's own road (pooled, the pool's id, poolTarget =
//      the provider, its env; NO per-session link) — also when every member is signed out (asked before the self-heal); not
//      listed ⇒ the members' road; the vault locked ⇒ the provider's refusal by name; a pool with no list asks its chooser where
//      it always did (after the default's heal). CONTROL: a copy without the early road throws «every member … signed out».
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();   // the ONE helper (the condition a boolean, the name a string — a swap throws)
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tried = (fn) => { try { fn(); return 'taken'; } catch (e) { return String(e && e.message); } };
const M = mutantCopies('pool-fallback', REPO);

const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const PS = require(path.join(REPO, 'src/server/provider-store.js'));
const PSP = require(path.join(REPO, 'src/server/provider-spawn.js'));
const MP = require(path.join(REPO, 'src/model-providers.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const ACC = read('src/accounts.js');

const DATA = scratchDir('pool-fallback');
const vault = VE.create({ dataDir: DATA, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
await vault.setup('correct horse battery staple', {});
const store = PS.create({ dataDir: DATA, vault: () => vault, log: () => {} });
const KEY = ['sk-', 'pool', '-fall', 'back-', 'b7d2e9'].join('');   // built at runtime (never a token-shaped literal)
const ds = (await store.add({ preset: 'deepseek', key: KEY })).provider;
const ds2 = (await store.add({ preset: 'deepseek', key: KEY, label: 'Router' })).provider;
const lab = (await store.add({ preset: 'other', key: KEY, baseUrl: 'http://127.0.0.1:9/v1', model: 'qwen3-coder', label: 'Lab', wire: 'openai-responses' })).provider;   // speaks Responses: Codex only
const wireAm = (AM, dir = DATA) => {
  const am = new AM({ dataDir: dir });
  am.setProviderLookup((a) => store.forAccount(a));
  am.setProviderSpawn(PSP.create({ providers: store, dataDir: dir }), (id, be, model) => PSP.modelFor(store, id, model, be));
  return am;
};
const login = (am, id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, subscriptionType: 'max' } }), { mode: 0o600 });
const am = wireAm(AccountManager);
const A = am.createSubscription({ name: 'Team Max' }).id; login(am, A);
const B = am.createSubscription({ name: 'Spare' }).id;   // never signed in
const P = am.createPool({ name: 'Team', members: [A] }).id;
const rowOf = (x, id) => x.list().accounts.find((r) => r.id === id);

console.log('— §1 the list: kept, listed by label, refused by name');
{
  ok(!('fallbackProviders' in am.get(P)) && eq(rowOf(am, P).fallbackProviders, []) && eq(am.poolFallbacksOf(P), []), 'a new pool lists no fallback provider: no field on the record (absent = none), an empty list on its row', { rec: am.get(P).fallbackProviders, row: rowOf(am, P).fallbackProviders });
  am.updatePool(P, { fallbackProviders: [ds.id, ds.id] });
  const reread = wireAm(AccountManager);
  ok(eq(am.get(P).fallbackProviders, [ds.id]) && eq(am.poolFallbacksOf(P), [ds.id]) && eq(rowOf(am, P).fallbackProviders, [{ id: ds.id, label: 'DeepSeek' }]) && eq(reread.get(P).fallbackProviders, [ds.id]),
    'a person\'s save keeps the list deduped, the row names each by its LABEL, and it survives a reload of the store', { rec: am.get(P).fallbackProviders, row: rowOf(am, P).fallbackProviders, reread: reread.get(P).fallbackProviders });
  const nine = [ds.id, ds2.id];
  for (let i = 0; i < 7; i++) nine.push((await store.add({ preset: 'deepseek', key: KEY, label: 'Extra ' + i })).provider.id);
  const builtIn = MP.PRESETS[0].id;
  const refusals = {
    notList: tried(() => am.updatePool(P, { fallbackProviders: ds.id })),
    account: tried(() => am.updatePool(P, { fallbackProviders: [A] })),
    builtIn: tried(() => am.updatePool(P, { fallbackProviders: [builtIn] })),
    gone: tried(() => am.updatePool(P, { fallbackProviders: ['pv-nobody-here'] })),
    unfit: tried(() => am.updatePool(P, { fallbackProviders: [lab.id] })),
    nine: tried(() => am.updatePool(P, { fallbackProviders: nine })),
    withCross: tried(() => am.updatePool(P, { crossProvider: 'allow', fallbackProviders: ['pv-nobody-here'] })),
  };
  ok(refusals.notList === 'fallbackProviders must be a list of provider ids' && refusals.account === 'not a third-party provider: ' + A && refusals.builtIn === 'not a third-party provider: ' + builtIn
    && refusals.gone === 'no such provider on this hub: pv-nobody-here' && refusals.unfit === 'Lab does not serve Claude Code — it cannot be this pool\'s fallback' && refusals.nine === 'a pool lists at most 8 fallback providers'
    && refusals.withCross === 'no such provider on this hub: pv-nobody-here',
    'each refusal BY NAME: not a list, an account id, a built-in provider, a record the store does not hold, one that does not serve Claude Code, nine of them', refusals);
  ok(eq(am.get(P).fallbackProviders, [ds.id]) && am.get(P).crossProvider === undefined, '…and a refused save writes NOTHING: the list as it was, the switch named in the same save untouched', { rec: am.get(P).fallbackProviders, cross: am.get(P).crossProvider });
  am._state.accounts.push({ id: 'pool-cx', name: 'Codex pool', type: 'pooled', backend: 'codex', members: null, auto: true, priority: [], hot: false });
  ok(tried(() => am.updatePool('pool-cx', { fallbackProviders: [ds.id] })) === 'a Codex pool takes no fallback provider — only a pool that places each conversation on its own takes one' && !('fallbackProviders' in am.get('pool-cx')), 'a pool of another harness takes no fallback provider (Claude pools only: a fallback needs each conversation placed on its own — the caps row planC)');
  const poolsBefore = am._state.accounts.length;
  const asMember = tried(() => am.updatePool(P, { members: [A, ds.id] })), asNewMember = tried(() => am.createPool({ name: 'Mixed', members: [A, ds.id] }));
  ok(asMember === 'a provider is never a pool member — list it as a fallback provider' && asNewMember === asMember && eq(am.get(P).members, [A]) && am._state.accounts.length === poolsBefore,
    'a provider named as a MEMBER is refused by name — on a save and on a new pool — nothing written (a fallback is listed apart)', { asMember, asNewMember, members: am.get(P).members });
  am.updatePool(P, { crossProvider: 'allow' });
  ok(eq(am.get(P).fallbackProviders, [ds.id]) && am.get(P).crossProvider === 'allow', 'a save that names only the switch leaves the list alone');
  am.updatePool(P, { fallbackProviders: [] });
  const emptied = !('fallbackProviders' in am.get(P)) && eq(rowOf(am, P).fallbackProviders, []) && am.get(P).crossProvider === 'allow';
  am.updatePool(P, { fallbackProviders: [ds.id] }); am.updatePool(P, { fallbackProviders: null });
  ok(emptied && !('fallbackProviders' in am.get(P)), 'an empty list or null removes the field (absent = none) and leaves the switch alone');
  am.updatePool(P, { crossProvider: 'never' });
}

console.log('— §2 a provider removed leaves every pool\'s list in the same act');
{
  const P2 = am.createPool({ name: 'Second', members: [A] }).id;
  am.updatePool(P, { fallbackProviders: [ds.id, ds2.id] }); am.updatePool(P2, { fallbackProviders: [ds2.id] });
  const bare = new AccountManager({ dataDir: DATA });   // no provider store wired: every record would read as gone
  await store.remove(ds2.id);
  bare.providersChanged();
  ok(eq(bare.get(P).fallbackProviders, [ds.id, ds2.id]) && eq(bare.get(P2).fallbackProviders, [ds2.id]), 'with NO provider store wired nothing is pruned (every record would read as gone)', { p: bare.get(P).fallbackProviders, p2: bare.get(P2).fallbackProviders });
  am.providersChanged();
  const reread = wireAm(AccountManager);
  ok(eq(am.get(P).fallbackProviders, [ds.id]) && !('fallbackProviders' in am.get(P2)) && eq(reread.get(P).fallbackProviders, [ds.id]) && !('fallbackProviders' in reread.get(P2)),
    'the removed provider leaves EVERY pool\'s list (the field goes where none is left) — on disk too', { p: am.get(P).fallbackProviders, p2: am.get(P2).fallbackProviders });
  const AUR = read('src/server/account-usage-routes.js'), PR = read('src/routes/providers.js');
  ok(AUR.includes("if (typeof accounts.providersChanged === 'function') accounts.providersChanged();") && PR.includes("const r = await providers.remove(String(req.params.id)") && PR.includes("    changed('remove', r.id);")
    && AUR.includes('fallbackProviders: req.body?.fallbackProviders }, { chooseMember: decide });'),
    'the hub\'s wiring: the remove door\'s every outcome calls the routes\' onChange, which asks the store to prune; the pool PATCH hands the list to the store');
  const NOPRUNE = '  providersChanged() { this.pruneFallbackProviders(); this._notify(); }';
  const ctl = wireAm(M.load('src/accounts.js', anchored(ACC, NOPRUNE, '  providersChanged() { this._notify(); }', 'a removal that prunes no pool'), 'no-prune').AccountManager, scratchDir('pool-fallback-noprune'));
  const cA = ctl.createSubscription({ name: 'C' }).id; login(ctl, cA);
  const cP = ctl.createPool({ name: 'C', members: [cA] }).id;
  const gone = (await store.add({ preset: 'deepseek', key: KEY, label: 'Gone soon' })).provider;
  ctl.updatePool(cP, { fallbackProviders: [ds.id, gone.id] });
  await store.remove(gone.id);
  ctl.providersChanged();
  ok(eq(ctl.get(cP).fallbackProviders, [ds.id, gone.id]), 'CONTROL: a copy whose providersChanged prunes nothing keeps the removed provider on the pool\'s list ⇒ the leg above goes RED', ctl.get(cP).fallbackProviders);
}

console.log('— §3 the spawn road: a listed fallback the chooser placed starts on the provider\'s own road');
{
  am.updatePool(P, { fallbackProviders: [ds.id] });
  let calls = 0;
  const chooser = (to) => () => { calls++; return to; };
  const r1 = am.resolveForSpawn(P, 'claude', { sessionKey: 'claude:fb-1', chooseMember: chooser(ds.id) });
  const link1 = am.sessionPoolLinkPath(P, 'claude:fb-1');
  ok(r1.kind === 'provider' && r1.pooled === true && r1.id === P && r1.poolTarget === ds.id && r1.localEnv.ANTHROPIC_BASE_URL === 'https://api.deepseek.com/anthropic' && r1.localEnv.ANTHROPIC_AUTH_TOKEN === KEY && !fs.existsSync(link1) && calls === 1,
    'the chooser answers the listed fallback ⇒ the provider\'s own road: pooled, the POOL\'s id (billed to the pool), poolTarget = the provider (ws-create holds it), its address and key in the env, NO per-session link; the chooser asked once',
    { kind: r1.kind, pooled: r1.pooled, id: r1.id, poolTarget: r1.poolTarget, base: r1.localEnv && r1.localEnv.ANTHROPIC_BASE_URL, link: fs.existsSync(link1), calls });
  calls = 0;
  const r2 = am.resolveForSpawn(P, 'claude', { sessionKey: 'claude:fb-2', chooseMember: chooser(A) });
  ok(r2.kind === 'subscription' && r2.poolTarget === A && r2.sessionLink === true && fs.existsSync(am.sessionPoolLinkPath(P, 'claude:fb-2')) && calls === 1, 'a member answer keeps the members\' road (its link written) — the chooser asked ONCE although the fallback road looked first', { kind: r2.kind, poolTarget: r2.poolTarget, calls });
  const r3 = am.resolveForSpawn(P, 'claude', { chooseMember: chooser(ds.id) });
  ok(r3.kind === 'subscription' && r3.poolTarget === A, 'no conversation (the pool DEFAULT) never takes the fallback road');
  const Q = 'pool-q-signedout';
  am._state.accounts.push({ id: Q, name: 'All out', type: 'pooled', backend: 'claude', members: [B], auto: true, priority: [], hot: false, fallbackProviders: [ds.id] });
  const r4 = am.resolveForSpawn(Q, 'claude', { sessionKey: 'claude:fb-4', chooseMember: chooser(ds.id) });
  const r4b = tried(() => am.resolveForSpawn(Q, 'claude', { sessionKey: 'claude:fb-4b', chooseMember: chooser(B) }));
  ok(r4.kind === 'provider' && r4.poolTarget === ds.id && /every member of pool "All out" is signed out/.test(r4b),
    'EVERY member signed out: the fallback the chooser placed still starts (asked before the self-heal) — and a member answer is refused as before', { r4: r4.kind, r4b });
  const P3 = am.createPool({ name: 'No list', members: [A] }).id;
  const r5 = am.resolveForSpawn(P3, 'claude', { sessionKey: 'claude:fb-5', chooseMember: chooser(ds.id) });
  ok(r5.kind === 'subscription' && r5.poolTarget === A, 'a provider the pool does NOT list is never its road: the members\' road (the chooser\'s answer is not servable there)', { kind: r5.kind, poolTarget: r5.poolTarget });
  // the order a pool with NO list asks its chooser in is the one it always had: after the default's heal
  const R = 'pool-r-heal';
  am._state.accounts.push({ id: R, name: 'Heal', type: 'pooled', backend: 'claude', members: [B, A], auto: true, priority: [], hot: false });
  am.setPoolTarget(R, A); fs.rmSync(am._poolLinkDir(am.get(R)), { force: true, recursive: true }); fs.symlinkSync(am.subDir(B), am._poolLinkDir(am.get(R)));   // the default left on the never-signed-in member
  let seen = null;
  am.resolveForSpawn(R, 'claude', { sessionKey: 'claude:fb-6', chooseMember: (pid, o) => { if (!o || !o.forDefault) seen = am.poolCurrent(pid); return A; } });
  ok(seen === A, 'a pool with NO fallback list asks its chooser where it always did — after the dead default was healed (the chooser sees the healed default)', { seen });
  await vault.lock('test', { quiet: true });
  let locked = null; try { am.resolveForSpawn(P, 'claude', { sessionKey: 'claude:fb-7', chooseMember: chooser(ds.id) }); } catch (e) { locked = e; }
  ok(!!locked && locked.code === 'vault_locked' && /unlock it to start a conversation on DeepSeek/.test(locked.message) && !fs.existsSync(am.sessionPoolLinkPath(P, 'claude:fb-7')),
    'the vault LOCKED: the provider\'s own refusal, by name — never a quiet start on a member that is out', locked ? { code: locked.code, message: locked.message } : null);
  const EARLY = '      if (opts.sessionKey && this._providerSpawn && this.poolFallbacksOf(id).length) {';
  const noRoad = wireAm(M.load('src/accounts.js', anchored(ACC, EARLY, '      if (false) {', 'no fallback road before the heal'), 'no-early-road').AccountManager);
  await vault.unlock('correct horse battery staple');
  const ctl4 = tried(() => noRoad.resolveForSpawn(Q, 'claude', { sessionKey: 'claude:fb-8', chooseMember: chooser(ds.id) }));
  ok(/every member of pool "All out" is signed out/.test(ctl4), 'CONTROL: a copy without the fallback road before the heal refuses the all-signed-out pool ⇒ the every-member-out leg goes RED', ctl4);
}

report();
