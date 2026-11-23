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
// UNIT F2 — THE MOVE THERE (the real engine on the same stores):
//   §4 the PURE rule (a fallback takes its own default model); scene 1 (never: nothing moves, ONE item a pool and provider, its
//      count kept, Allow once moves them at once — the record written first, no prompt, the resume lands on the provider and takes
//      the record, the sweep leaves it, the spend guard's identity is the provider); scenes 2 + 6 (allow: 6 a minute hub-wide, a
//      press at once and uncounted, one toast a batch); scene 5 (a turn in flight waits); the record held / failed; a member that
//      can serve wins; the vault locked. CONTROLS: no pace; a restart before the record; a card a conversation.
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
  // A REFUSED WRITE CHANGES NOTHING (round wokm0ktwv (1)): refused for its priority, the list / switch / hot named in the same save stay off
  // the record — in memory, and on disk after the next unrelated save
  const refusedPri = tried(() => am.updatePool(P, { fallbackProviders: [ds.id], crossProvider: 'allow', hot: true, priority: ['not-a-member'] }));
  const memNow = { fb: am.get(P).fallbackProviders, cross: am.get(P).crossProvider, hot: am.get(P).hot };
  am.updatePool(P, {});
  const diskNow = wireAm(AccountManager).get(P);
  ok(refusedPri === 'not a member of this pool: not-a-member' && memNow.fb === undefined && memNow.cross === 'never' && memNow.hot === false && diskNow.fallbackProviders === undefined && diskNow.crossProvider === 'never' && diskNow.hot === false,
    'a write REFUSED for its priority changes nothing: the list, the switch and hot named with it are not on the record — in memory, nor on disk after the next unrelated save', { refusedPri, memNow, disk: { fb: diskNow.fallbackProviders, cross: diskNow.crossProvider, hot: diskNow.hot } });
  const NOBACK = '    } catch (e) { for (const k of Object.keys(a)) delete a[k]; Object.assign(a, was); throw e; }';
  const half = wireAm(M.load('src/accounts.js', anchored(ACC, NOBACK, '    } catch (e) { throw e; }', 'a refused write that keeps what it set'), 'no-rollback').AccountManager, scratchDir('pool-fallback-norollback'));
  const hA = half.createSubscription({ name: 'H' }).id; login(half, hA);
  const hP = half.createPool({ name: 'H', members: [hA] }).id;
  tried(() => half.updatePool(hP, { fallbackProviders: [ds.id], priority: ['not-a-member'] }));
  ok(eq(half.get(hP).fallbackProviders, [ds.id]), 'CONTROL: a copy that keeps what it set before the refusing check leaves the list on the live record ⇒ the leg above goes RED', half.get(hP).fallbackProviders);
  // a provider id ALREADY on the record (a save an older hub took) is dropped by the next save, never refused; a NEW one is refused
  am.get(P).members = [A, 'pv-older-hub-1'];
  const legacy = tried(() => am.updatePool(P, { members: [A, 'pv-older-hub-1'] }));
  ok(legacy === 'taken' && eq(am.get(P).members, [A]) && tried(() => am.updatePool(P, { members: [A, ds.id] })) === 'a provider is never a pool member — list it as a fallback provider',
    'a provider id ALREADY in the members (an older hub\'s save) is not refused — the member\'s own «Exclude from pool» re-sends the list — and this save drops it; a NEW provider in members is refused by name', { legacy, members: am.get(P).members });
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
  // ONE PRUNE AT A START (round wokm0ktwv (2)): a crash between the removal's two files leaves a pool naming a gone provider on disk —
  // the store's lookup wired at the next start prunes it
  const crash = (await store.add({ preset: 'deepseek', key: KEY, label: 'Crashed away' })).provider;
  am.updatePool(P, { fallbackProviders: [ds.id, crash.id] });
  await store.remove(crash.id);   // the provider's file written … and the hub dies before providersChanged
  const boot = wireAm(AccountManager);
  ok(eq(boot.get(P).fallbackProviders, [ds.id]) && eq(wireAm(AccountManager).get(P).fallbackProviders, [ds.id]), 'a crash between the removal\'s two writes: the next START (the store\'s lookup wired) prunes the gone provider — on disk too', boot.get(P).fallbackProviders);
  am.updatePool(P, { fallbackProviders: [ds.id] });
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
  let calls = 0, peeks = 0;
  const chooser = (to) => (pid, how = {}) => { if (how.fallbackOnly) peeks++; else calls++; return to; };
  const r1 = am.resolveForSpawn(P, 'claude', { sessionKey: 'claude:fb-1', chooseMember: chooser(ds.id) });
  const link1 = am.sessionPoolLinkPath(P, 'claude:fb-1');
  ok(r1.kind === 'provider' && r1.pooled === true && r1.id === P && r1.poolTarget === ds.id && r1.localEnv.ANTHROPIC_BASE_URL === 'https://api.deepseek.com/anthropic' && r1.localEnv.ANTHROPIC_AUTH_TOKEN === KEY && !fs.existsSync(link1) && peeks === 1 && calls === 0,
    'the chooser\'s PEEK (fallbackOnly) names the listed fallback ⇒ the provider\'s own road: pooled, the POOL\'s id (billed to the pool), poolTarget = the provider (ws-create holds it), its address and key in the env, NO per-session link; the ordinary ask never ran',
    { kind: r1.kind, pooled: r1.pooled, id: r1.id, poolTarget: r1.poolTarget, base: r1.localEnv && r1.localEnv.ANTHROPIC_BASE_URL, link: fs.existsSync(link1), calls, peeks });
  calls = 0; peeks = 0;
  const r2 = am.resolveForSpawn(P, 'claude', { sessionKey: 'claude:fb-2', chooseMember: chooser(A) });
  ok(r2.kind === 'subscription' && r2.poolTarget === A && r2.sessionLink === true && fs.existsSync(am.sessionPoolLinkPath(P, 'claude:fb-2')) && calls === 1 && peeks === 1, 'a member answer keeps the members\' road (its link written): one peek, then the ordinary ask ONCE, where it always was', { kind: r2.kind, poolTarget: r2.poolTarget, calls, peeks });
  const r3 = am.resolveForSpawn(P, 'claude', { chooseMember: chooser(ds.id) });
  ok(r3.kind === 'subscription' && r3.poolTarget === A, 'no conversation (the pool DEFAULT) never takes the fallback road');
  const Q = 'pool-q-signedout';
  am._state.accounts.push({ id: Q, name: 'All out', type: 'pooled', backend: 'claude', members: [B], auto: true, priority: [], hot: false, fallbackProviders: [ds.id] });
  const r4 = am.resolveForSpawn(Q, 'claude', { sessionKey: 'claude:fb-4', chooseMember: chooser(ds.id) });
  const r4b = tried(() => am.resolveForSpawn(Q, 'claude', { sessionKey: 'claude:fb-4b', chooseMember: chooser(B) }));
  calls = 0; peeks = 0;
  const r4c = tried(() => am.resolveForSpawn(Q, 'claude', { sessionKey: 'claude:fb-4c', chooseMember: chooser(B) }));
  ok(r4.kind === 'provider' && r4.poolTarget === ds.id && /every member of pool "All out" is signed out/.test(r4b) && /signed out/.test(r4c) && peeks === 1 && calls === 0,
    'EVERY member signed out: the fallback the chooser\'s peek names still starts (asked before the self-heal); a member answer is refused as before — and then the conversation\'s ORDINARY ask never ran (no proving mark, no line for a start that does not start: round wokm0ktwv (3))', { r4: r4.kind, r4b, calls, peeks });
  const other = (await store.add({ preset: 'deepseek', key: KEY, label: 'Unlisted' })).provider;
  const r4d = am.resolveForSpawn(P, 'claude', { sessionKey: 'claude:fb-4d', chooseMember: chooser(other.id) });
  am.get(P).fallbackProviders = [ds.id, 'pv-gone-by-hand'];   // a dangling id (a hand edit) on the record
  const r4e = am.resolveForSpawn(P, 'claude', { sessionKey: 'claude:fb-4e', chooseMember: chooser('pv-gone-by-hand') });
  ok(r4d.kind === 'subscription' && r4d.poolTarget === A && r4e.kind === 'subscription' && eq(am.poolFallbacksOf(P), [ds.id]) && eq(rowOf(am, P).fallbackProviders, [{ id: ds.id, label: 'DeepSeek' }]),
    'a provider the pool does NOT list (another of the hub\'s), or a gone one still named on the record, is never its road: the members\' road; the list and the row leave the gone one out', { r4d: r4d.kind, r4e: r4e.kind, live: am.poolFallbacksOf(P) });
  am.updatePool(P, { fallbackProviders: [ds.id] });
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

console.log('— §4 the move there (unit F2): every member out, the switch, the hub queue, the record first');
{
  const L = require(path.join(REPO, 'src/account-pool-auto.js'));
  // THE PURE RULE 3 FOR A FALLBACK: its own model — the conversation's re-resolved there, else its default; neither ⇒ rule 1
  const P0 = { id: 'pv-claude-subscription', kind: 'subscription', label: 'Claude subscription' };
  const spent = { fetchedAt: Date.now() - 60e3, fiveHour: { utilization: 1, resetsAt: Math.floor(Date.now() / 1000) + 7200 }, sevenDay: { utilization: 0.5, resetsAt: Math.floor(Date.now() / 1000) + 3 * 86400 } };
  const pure = (fb, mode = 'allow') => L.decidePoolSwitch({ currentId: 'c', members: [{ id: 'c', name: 'Cur' }, { id: 'f', name: 'F' }], readCache: (id) => (id === 'c' ? spent : null), nowSec: Math.floor(Date.now() / 1000), hot: true, explain: true, providerOf: (id) => (id === 'c' ? P0 : fb), conversationModel: 'sonnet', crossProvider: mode });
  const withDefault = pure({ id: 'pv-router', label: 'Router', fallbackOnly: true, models: [{ id: 'router-1' }], defaultModel: 'router-1' });
  const noDefault = pure({ id: 'pv-router', label: 'Router', fallbackOnly: true, models: [{ id: 'router-1' }] });
  const notFallback = pure({ id: 'pv-router', label: 'Router', models: [{ id: 'router-1' }], defaultModel: 'router-1' });
  const offered = pure({ id: 'pv-router', label: 'Router', fallbackOnly: true, models: [{ id: 'router-1' }], defaultModel: 'router-1' }, 'never');
  ok(withDefault.to === 'f' && withDefault.switchMode === 'cold' && withDefault.cross.fallbackOnly && withDefault.cross.model === 'sonnet' && withDefault.cross.toModel === 'router-1'
    && noDefault.to === null && (noDefault.modelBlocked || []).some((x) => x.id === 'f') && notFallback.to === null && (notFallback.modelBlocked || []).some((x) => x.id === 'f')
    && offered.to === null && !!offered.crossOffer && offered.crossOffer.id === 'f' && offered.crossOffer.fallbackOnly && offered.crossOffer.toModel === 'router-1',
    'the PURE rule for a fallback: a model it does not list takes ITS default (sonnet → router-1; the offer too, under never); no default ⇒ named in modelBlocked; a provider that is no fallback keeps rule 1 as before',
    { withDefault: withDefault.cross, noDefault: noDefault.reason, notFallback: notFallback.reason });

  const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const nowS = () => Math.floor(Date.now() / 1000);
  const cacheOf = (u5) => JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'on-demand', fiveHour: { utilization: u5, resetsAt: nowS() + 7200 }, sevenDay: { utilization: 0.4, resetsAt: nowS() + 3 * 86400 } });
  const world = ({ engM = null, cross = null, bHealthy = false, pools = 1 } = {}) => {
    const dir = scratchDir('pool-fallback-eng'), root = fs.mkdtempSync(path.join(dir, 'w-')), dataDir = path.join(root, 'data');
    const wam = wireAm(AccountManager, dataDir);
    wam.setProviderRows(() => MP.rosterRowsOf(store.thirdParty(), { usable: (p) => vault.state() === 'unlocked' && store.hasKey(p.id) }));
    const WA = wam.createSubscription({ name: 'Member A' }).id, WB = wam.createSubscription({ name: 'Member B' }).id;
    login(wam, WA); login(wam, WB);
    const poolIds = [];
    for (let i = 0; i < pools; i++) {
      const id = wam.createPool({ name: i ? 'Team ' + (i + 1) : 'Team', members: [WA, WB] }).id;
      wam.setPoolTarget(id, WA); wam.updatePool(id, { hot: true, fallbackProviders: [ds.id], ...(cross ? { crossProvider: cross } : {}) });
      poolIds.push(id);
    }
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, WA + '.json'), cacheOf(1)); fs.writeFileSync(path.join(cacheDir, WB + '.json'), cacheOf(bHealthy ? 0.1 : 1));
    const sessions = new Map(), notices = [], sent = [], items = [], cards = [], metas = new Map(), clients = new Set();
    const meta = { mode: 'ok', held: [] };
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
      openItems() { return items.filter((x) => x.status === 'open'); }, onStatus() { },
    };
    const eng = (engM || require(path.join(REPO, 'src/server/usage-pool-engine.js'))).create({
      app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t, o) => notices.push({ k, t, o }), serverSetting: () => undefined, getAccounts: () => wam,
      getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
      getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
      getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { sent.push({ type: 'FIRE' }); } }),
      getQuotaProbe: () => null, getSessionMetaStore: () => metaStore, getUserTodos: () => todos,
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
    return { am: wam, eng, A: WA, B: WB, P: poolIds[0], P2: poolIds[1], pools: poolIds, cacheDir, sessions, notices, sent, items, cards, metas, meta, mk, pass, settle, mute, restarts, client };
  };
  const fbItems = (w) => w.items.filter((x) => x.action && x.action.type === 'pool-cross-provider' && x.action.fallback === true);

  // SCENE 1 — every member out, the switch 'never': nothing moves; ONE item a pool and provider with its live count
  const w1 = world();
  w1.client();
  for (const sid of ['s1', 's2', 's3', 's4']) w1.mk(sid);
  await w1.pass();
  const it1 = fbItems(w1);
  ok(w1.restarts().length === 0 && it1.length === 1 && it1[0].status === 'open' && it1[0].text === '4 conversations of Pool "Team" wait at every member\'s wall: move them to DeepSeek?' && it1[0].action.memberId === ds.id
    && !w1.items.some((x) => /^Moving "/.test(x.text || '')) && !!it1[0].i18n && it1[0].i18n.text.params.n === 4,
    'scene 1: A and B at their walls, the switch never ⇒ NOTHING moves; ONE For-you item for the pool and DeepSeek counting 4 (never four cards)', w1.items.map((x) => x.text));
  w1.sessions.delete('s4');
  await w1.pass();
  ok(fbItems(w1).length === 1 && fbItems(w1)[0].text === '3 conversations of Pool "Team" wait at every member\'s wall: move them to DeepSeek?' && fbItems(w1)[0].redrawn === 1, '…one conversation gone ⇒ the SAME item counts 3 (drawn again, not a second item)', fbItems(w1).map((x) => x.text));
  // NONE WAITS ⇒ the item goes (and that is no Deny: the next wall asks again)
  const w1b = world();
  w1b.client(); w1b.mk('n1'); w1b.mk('n2');
  await w1b.pass();
  const firstItem = fbItems(w1b)[0];
  fs.writeFileSync(path.join(w1b.cacheDir, w1b.B + '.json'), cacheOf(0.1));
  await w1b.pass();
  const settled = !!firstItem && firstItem.status === 'done' && firstItem.by === 'none-waits';
  fs.writeFileSync(path.join(w1b.cacheDir, w1b.B + '.json'), cacheOf(1));
  for (const sid of ['n1', 'n2']) w1b.am.ensureSessionPoolLink(w1b.P, sid, w1b.A, { why: 'spawn' });
  await w1b.pass();
  ok(!!firstItem && firstItem.text.startsWith('2 conversations') && settled && fbItems(w1b).filter((x) => x.status === 'open').length === 1,
    'none waits (B serves again and takes them) ⇒ the item is settled — and that is no Deny: at the next wall a new item asks', w1b.items.map((x) => `${x.text.slice(0, 16)}…:${x.status}:${x.by || ''}`));
  // ALLOW ONCE: a person's press — at once, outside the pace; the record on disk before each restart
  const ans = w1.eng.answerCrossProviderAsk(fbItems(w1)[0].action.askId, { answer: 'once' });
  await w1.settle();
  const r1 = w1.restarts();
  ok(ans.ok && ans.state === 'allowed' && ans.moving === 3 && r1.length === 3 && r1.every((t) => t.model === 'deepseek-chat' && !('message' in t) && !('prompt' in t) && !('text' in t))
    && ['s1', 's2', 's3'].every((sid) => { const m = w1.metas.get('cw-' + sid); return m && m.poolFallback && m.poolFallback.provider === ds.id && m.poolFallback.fromMember === w1.A && m.poolFallback.fromModel === 'sonnet' && m.poolFallback.toModel === 'deepseek-chat' && m.poolFallback.by === 'person'; })
    && w1.eng._fbMovedAt.length === 0 && fbItems(w1)[0].status === 'done' && !w1.sent.some((m) => m.type === 'FIRE'),
    'Allow once: the three move AT ONCE (a press: never counted by the pace), each restart asks for deepseek-chat and carries NO prompt (the move starts no turn); each record — pool, provider, member and model it came from — was written first; the item settled',
    { ans, restarts: r1.length, paced: w1.eng._fbMovedAt.length, meta: w1.metas.get('cw-s1') && w1.metas.get('cw-s1').poolFallback });
  // the RESUMED conversation lands on the fallback and takes the record (scene 8's half)
  const peek = w1.eng.poolChooserForModel(w1.P, { model: 'deepseek-chat', resumeOf: 'cid-s1', fallbackOnly: true }), peekNone = w1.eng.poolChooserForModel(w1.P, { model: 'sonnet', resumeOf: 'cid-nobody', fallbackOnly: true });
  ok(peek === ds.id && peekNone === null, 'the chooser\'s PEEK names the fallback a conversation was moved to (its carry), and nothing for one that was not (no decision made, nothing marked)', { peek, peekNone });
  const pick = w1.eng.poolChooserForModel(w1.P, { model: 'deepseek-chat', resumeOf: 'cid-s1' });
  const sp = w1.am.resolveForSpawn(w1.P, 'claude', { sessionKey: 'claude:s1b', chooseMember: () => pick });
  const s1b = w1.mk('s1b', w1.P, { claudeSessionId: 'cid-s1', _heldPoolMember: ds.id, _lastPtyDataAt: Date.now() });
  await w1.pass();
  const restored = BR.poolFallbackOf(w1.metas.get('cw-s1b'));
  const swept = w1.mute(() => w1.eng.sweepNonMemberLinks());
  ok(pick === ds.id && sp.kind === 'provider' && sp.poolTarget === ds.id && !!s1b._poolFallback && s1b._poolFallback.fromModel === 'sonnet' && !!restored && restored.provider === ds.id && restored.fromMember === w1.A && restored.fromModel === 'sonnet'
    && w1.cards.some((c) => c.sid === 's1b' && c.text === `Switched from Member A (${w1.am.memberProviderOf(w1.A).label}) to DeepSeek — model sonnet → deepseek-chat`) && !swept.some((x) => x && x.removed && x.removed.includes(ds.id)),
    'the resume starts on DeepSeek (the carry + the provider road); the resumed conversation takes the record into its own meta (boot-restore reads it back: on the fallback, its first member and model kept) and the line names DeepSeek by its label; the stale-member sweep leaves it there',
    { pick, kind: sp.kind, rec: restored, cards: w1.cards.filter((c) => c.sid === 's1b').map((c) => c.text), swept });
  const idn = w1.eng.fireIdentityFor(s1b);
  ok(!!idn && idn.key === ds.id && idn.name === 'DeepSeek', 'the spend guard\'s identity for the moved conversation is the PROVIDER (its slot): an automatic continue there is judged against DeepSeek\'s own ceilings, as a person\'s start on it would be', idn);

  // SCENE 2 + 6 — the switch 'allow': the hub queue, at most 6 a minute HUB-WIDE (two pools share it), idle first, one toast a batch
  const w2 = world({ cross: 'allow', pools: 2 });
  w2.client();
  for (let i = 0; i < 5; i++) w2.mk('a' + i, w2.P);
  for (let i = 0; i < 4; i++) w2.mk('b' + i, w2.P2);
  await w2.pass(w2.P); await w2.pass(w2.P2);
  const n2 = w2.restarts().length, toasts = w2.notices.filter((x) => /^pool-fallback-/.test(x.k));
  ok(n2 === 6 && w2.eng._fbMovedAt.length === 6 && w2.eng._fbQueue.size === 3 && toasts.length === 2 && toasts.map((x) => x.o.i18n.params.n).sort().join(',') === '1,5'
    && toasts.some((x) => x.t === 'Pool "Team": 5 conversations moved to DeepSeek — every member is out. Restarting them to apply it.') && fbItems(w2).length === 0,
    'scenes 2 + 6, allow: nine idle conversations over TWO pools ⇒ 6 restarts in the minute HUB-WIDE, 3 wait in the queue; ONE toast a pool for its batch, with its count; no item asked (allow)', { n2, queued: w2.eng._fbQueue.size, toasts: toasts.map((x) => x.t) });
  // a person's press in the middle goes at once and is not counted
  const waiting = [...w2.eng._fbQueue.values()][0];
  w2.eng.queueFallbackMove(waiting.poolId, waiting.sid, waiting.to, 'person');
  await w2.eng.pumpFallbackMoves(Date.now());
  ok(w2.restarts().length === 7 && w2.eng._fbMovedAt.length === 6 && w2.eng._fbQueue.size === 2, 'a person\'s press in the middle of the minute goes AT ONCE (7 restarts) and is not counted (the pace still reads 6)', { restarts: w2.restarts().length, paced: w2.eng._fbMovedAt.length });
  await w2.eng.pumpFallbackMoves(Date.now() + 61e3);
  ok(w2.restarts().length === 9 && w2.eng._fbQueue.size === 0, 'the next minute the queue takes the two left', { restarts: w2.restarts().length });

  // SCENE 5 — a turn in flight: skipped, moved at its end; the move writes no prompt
  const w5 = world({ cross: 'allow' });
  w5.client();
  const busy = w5.mk('t1', w5.P, { _isStreaming: true, _turnState: 'running' });
  await w5.pass();
  const before = w5.restarts().length;
  busy._isStreaming = false; busy._turnState = 'idle';
  await w5.eng.pumpFallbackMoves(Date.now());
  ok(before === 0 && w5.eng._fbQueue.size === 0 && w5.restarts().length === 1 && w5.restarts()[0].serverId === 't1' && !w5.sent.some((m) => m.type === 'FIRE'),
    'scene 5: a conversation in a turn is not moved (its turn finishes where it started); at its end it moves — and nothing continues a turn for it (no automatic continue fired by the move)', { before, after: w5.restarts().length });

  // THE RECORD FIRST (scene 8's other half): a held write ⇒ no restart yet; a failed write ⇒ no move, said in its line
  const w6 = world({ cross: 'allow' });
  w6.client();
  w6.meta.mode = 'hold';
  w6.mk('h1');
  await w6.pass();
  const heldNow = w6.restarts().length;
  w6.meta.held.splice(0).forEach((go) => go());
  await w6.settle();
  ok(heldNow === 0 && w6.restarts().length === 1 && w6.metas.get('cw-h1').poolFallback.provider === ds.id, 'the record write HELD ⇒ NO restart until it is on disk; then the restart', { heldNow, after: w6.restarts().length });
  const w7 = world({ cross: 'allow' });
  w7.client();
  w7.meta.mode = 'fail';
  w7.mk('f1');
  await w7.pass();
  ok(w7.restarts().length === 0 && !(w7.metas.get('cw-f1') || {}).poolFallback && w7.cards.some((c) => c.sid === 'f1' && c.text === 'Could not move to DeepSeek: the record of the move could not be saved — nothing moved; the pool tries again.'),
    'the record write FAILED ⇒ nothing moves, and the conversation\'s own line says so', w7.cards.map((c) => c.text));

  // NOT every member out: B can take it ⇒ B (the pool's own), never the fallback; the fallback's key unreadable ⇒ never offered
  const w8 = world({ cross: 'allow', bHealthy: true });
  w8.client(); w8.mk('m1');
  await w8.pass();
  ok(w8.am.poolCurrentFor(w8.P, 'm1') === w8.B && w8.eng._fbQueue.size === 0 && !w8.restarts().some((t) => t.model === 'deepseek-chat'), 'a member that can serve takes it: A at its wall, B healthy ⇒ the move goes to B, never to the fallback', w8.am.poolCurrentFor(w8.P, 'm1'));
  await vault.lock('test', { quiet: true });
  const w9 = world();
  w9.client(); w9.mk('k1');
  await w9.pass();
  const rows9 = w9.eng.fallbackRows(w9.am.get(w9.P));
  await vault.unlock('correct horse battery staple');
  ok(rows9.length === 0 && fbItems(w9).length === 0 && w9.restarts().length === 0, 'the vault LOCKED (the fallback\'s key unreadable): no fallback row, nothing offered, nothing moved — the conversation waits at the wall as before', { rows: rows9.length, items: w9.items.map((x) => x.text) });

  // RED CONTROLS
  const ENG = read('src/server/usage-pool-engine.js');
  const PACE = "    if (e.by !== 'person' && _fbMovedAt.length >= FALLBACK_MOVES_PER_MIN) continue;";
  const wPace = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, PACE, '', 'no pace'), 'eng-no-pace') });
  wPace.client(); for (let i = 0; i < 8; i++) wPace.mk('p' + i);
  await wPace.pass();
  ok(wPace.restarts().length === 8, 'CONTROL: a copy without the pace restarts all 8 in the minute ⇒ the 6-a-minute leg goes RED', wPace.restarts().length);
  const FIRST = '  const saved = await writeFallbackRecord(j.s2, record);';
  const wRec = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, FIRST, '  const saved = (writeFallbackRecord(j.s2, record), true);', 'restart before the record'), 'eng-no-record-first') });
  wRec.client(); wRec.meta.mode = 'fail'; wRec.mk('r1');
  await wRec.pass();
  ok(wRec.restarts().length === 1, 'CONTROL: a copy that restarts without waiting for the record moves the conversation with NO record on disk ⇒ the record-first legs go RED', wRec.restarts().length);
  const ONE = "        if (ds && ds.crossOffer && ds.crossOffer.fallbackOnly && /^pv-/.test(String(ds.crossOffer.id))) {";
  const wCards = world({ engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, ONE, '        if (false) {', 'a card a conversation'), 'eng-card-each') });
  wCards.client(); for (const sid of ['c1', 'c2', 'c3', 'c4']) wCards.mk(sid);
  await wCards.pass();
  ok(fbItems(wCards).length === 0 && wCards.items.filter((x) => /^Moving "/.test(x.text || '')).length === 4, 'CONTROL: a copy that files the old card a conversation asks FOUR times ⇒ the one-item leg goes RED', wCards.items.map((x) => x.text));
}

report();
