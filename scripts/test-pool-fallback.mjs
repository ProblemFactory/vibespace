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
// UNIT F3a — COMING BACK (§5, the same worlds): scene 4 (allow: back after the dwell with the FIRST model, no flap), scene 3 (never: its
//      line once, the pool's count, a press), scene 7 (removed: back at once / told / stuck), no record ⇒ never by itself. CONTROLS: no
//      dwell; the provider's model kept on the way back.
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
// B-574d (line 832 on the 2.369.418 train): accounts.json is the store writer's — a second store over the same data (a restart, a re-read)
// reads what the first one's saves wrote: each save waited for here (the suite's thread), the copies' classes too
const { waitEverySave } = require(path.join(REPO, 'scripts/lib/accounts-landed.cjs'));
const wireAm = (AM, dir = DATA) => {
  const am = new (waitEverySave(AM))({ dataDir: dir });
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
    && AUR.includes('fallbackProviders: req.body?.fallbackProviders, crossProviderOpened: req.body?.crossProviderOpened, fallbackProvidersOpened: req.body?.fallbackProvidersOpened }, { chooseMember: decide });'),
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
  // THE LOOKUP's FLAG, READ AT EACH PRUNE (the F2 cure on the store-read hold — the move onto 2.369.418, 主开发 r3534): the hub
  // hands accounts the provider store's LIVE answer, the expression below taken from src/server/account-usage-routes.js itself.
  // (a) A HELD START THAT LIFTS: providers.json's read refused at a start (a placed EIO, this process's fs only), a provider removed
  //     behind the store meanwhile; while held nothing is pruned, and once the read answers the removed provider leaves the pool.
  // (b) TORN BYTES: the hold keeps them aside and starts the list EMPTY (damaged) — nothing is pruned (the cure's «unreadable»).
  // CONTROLS: the taken form's VALUE read once at the start keeps the removed provider after the lift ((a) RED); a live flag that
  // forgets the torn list's state prunes both over torn bytes ((b) RED).
  const SRH = require(path.join(REPO, 'src/store-read-hold.js'));
  const AURk = read('src/server/account-usage-routes.js');
  const LIVE_EXPR = /setProviderLookup\(\(acct\) => providers\.forAccount\(acct\), (\{ clean: [^\n]*? \})\); \/\*/.exec(AURk)?.[1];
  const VALUE_EXPR = "{ clean: typeof providers.readClean === 'function' ? providers.readClean() : true }";   // the taken form's
  const NODMG_EXPR = "{ clean: typeof providers.readClean === 'function' ? () => providers.readClean() : true }";   // live, the torn state forgotten
  const optsOf = (expr, providers) => new Function('providers', 'return (' + expr + ');')(providers);
  const refuseReads = (file) => {
    const realSync = fs.readFileSync, realAsync = fs.promises.readFile;
    const eio = () => Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' });
    fs.readFileSync = function (p, ...rest) { if (String(p) === file) throw eio(); return realSync.call(this, p, ...rest); };
    fs.promises.readFile = function (p, ...rest) { if (String(p) === file) return Promise.reject(eio()); return realAsync.call(this, p, ...rest); };
    return () => { fs.readFileSync = realSync; fs.promises.readFile = realAsync; };
  };
  const lkScene = async (tag, expr, torn) => {
    const D = scratchDir('pool-fallback-lookup-' + tag), file = path.join(D, 'providers.json');
    const v = VE.create({ dataDir: D, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
    await v.setup('correct horse battery staple', {});
    const s0 = PS.create({ dataDir: D, vault: () => v, log: () => {} });
    const kept = (await s0.add({ preset: 'deepseek', key: KEY, label: 'Kept' })).provider, gone = (await s0.add({ preset: 'deepseek', key: KEY, label: 'Removed behind the store' })).provider;
    const am0 = new AccountManager({ dataDir: D }); am0.setProviderLookup((a) => s0.forAccount(a));
    const mA = am0.createSubscription({ name: 'H' }).id; login(am0, mA);
    const pool = am0.createPool({ name: 'H', members: [mA] }).id;
    am0.updatePool(pool, { fallbackProviders: [kept.id, gone.id] });
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    let lift = () => {}, am = null, s = null, whileHeld = null, after = null;
    try {
      if (torn) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').slice(0, 40));   // bytes that are no list
      else lift = refuseReads(file);
      s = PS.create({ dataDir: D, vault: () => v, log: () => {}, onLift: () => { try { am && am.providersChanged(); } catch { } } });
      am = new AccountManager({ dataDir: D });
      am.setProviderLookup((a) => s.forAccount(a), optsOf(expr, s));   // the start: the hub's wiring, as the routes give it
      whileHeld = [...(am.get(pool).fallbackProviders || [])];
      if (torn) { for (let i = 0; i < 100 && s.held(); i++) await new Promise((r) => setTimeout(r, 20)); }   // its copy made off the loop, then it lifts EMPTY
      else {
        fs.writeFileSync(file, JSON.stringify({ ...doc, providers: doc.providers.filter((r) => r.id !== gone.id) }, null, 2));   // removed behind the store
        lift();
        const row = SRH.holds().find((e) => e.held && e.file === 'providers.json');
        for (let i = 0; i < 20 && s.held(); i++) { if (row && (await SRH.readAgainOf(row))) break; await new Promise((r) => setTimeout(r, 30)); }
      }
      after = [...(am.get(pool).fallbackProviders || [])];
    } finally { lift(); }
    return { kept: kept.id, gone: gone.id, whileHeld, after, held: !!(s && s.held()), damaged: !!(s && s.damaged && s.damaged()) };
  };
  const la = await lkScene('lift', LIVE_EXPR, false), lb = await lkScene('torn', LIVE_EXPR, true);
  ok(!!LIVE_EXPR && eq(la.whileHeld, [la.kept, la.gone]) && !la.held && eq(la.after, [la.kept]),
    '(the move, r3534) A HELD START THAT LIFTS: while providers.json\'s read is refused nothing is pruned (its empty answer is no «every provider removed»); once it reads, the provider removed behind the store leaves the pool\'s list — the hub\'s own flag, read at each prune', la);
  // (line 817's small follow, round w82951b95 (1)) the pin above (§2's wiring) matches a call that stands in BOTH the route's change
  // callback and its lift callback, and this leg passes its OWN onLift — so a dropped lift call kept every leg green: the hub's
  // lift callback is pinned by its own head
  const LIFT_CALL = "onLift: () => { try { broadcastAll({ type: 'providers-changed', what: 'read', id: null }); } catch { } try { if (typeof accounts.providersChanged === 'function') accounts.providersChanged(); } catch { } } }";
  ok(AURk.split(LIFT_CALL).length === 2, '(line 817\'s follow) the hub\'s OWN lift callback (account-usage-routes, the provider store\'s onLift) asks accounts to prune once the list reads again — pinned by its head, once');
  ok(lb.damaged && !lb.held && eq(lb.whileHeld, [lb.kept, lb.gone]) && eq(lb.after, [lb.kept, lb.gone]),
    '(the move, r3534) TORN BYTES: the hold keeps them aside and starts the list empty — nothing is pruned (the cure\'s «unreadable»): the pool keeps both its providers', lb);
  const va = await lkScene('lift-value', VALUE_EXPR, false), nb = await lkScene('torn-nodamaged', NODMG_EXPR, true);
  ok(!va.held && eq(va.after, [va.kept, va.gone]), 'CONTROL: the taken form\'s VALUE read once at the start keeps the removed provider on the pool\'s list after the lift ⇒ (a) goes RED', va);
  ok(nb.damaged && !nb.held && eq(nb.after, []), 'CONTROL: a live flag that forgets the torn list\'s state prunes BOTH providers over torn bytes ⇒ (b) goes RED', nb);
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
  ok(r4d.kind === 'subscription' && r4d.poolTarget === A && r4e.kind === 'subscription' && eq(am.poolFallbacksOf(P), [ds.id]) && eq(rowOf(am, P).fallbackProviders, [{ id: ds.id, label: 'DeepSeek' }, { id: 'pv-gone-by-hand', label: 'pv-gone-by-hand', known: false }]),
    'a provider the pool does NOT list (another of the hub\'s), or a gone one still named on the record, is never its road: the members\' road; the LIVE list leaves the gone one out, and the row SHOWS it marked known:false (r3886 (C): the page lists it with its word, a save keeps it until the person unchecks it)', { r4d: r4d.kind, r4e: r4e.kind, live: am.poolFallbacksOf(P), row: rowOf(am, P).fallbackProviders });
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
  const EMPTY_MANAGED = path.join(scratchDir('pool-fallback-managed-none'), 'none');   // the machine's managed Claude settings folder, stood in EMPTY (never the test machine's own)
  const world = ({ engM = null, cross = null, bHealthy = false, pools = 1, managedDir = EMPTY_MANAGED, landingMs = 90e3, fb = null } = {}) => {
    const dir = scratchDir('pool-fallback-eng'), root = fs.mkdtempSync(path.join(dir, 'w-')), dataDir = path.join(root, 'data');
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
    return { am: wam, eng, A: WA, B: WB, P: poolIds[0], P2: poolIds[1], pools: poolIds, cacheDir, sessions, notices, sent, items, cards, metas, meta, mk, pass, settle, mute, restarts, client, todos };
  };
  const fbItems = (w) => w.items.filter((x) => x.action && x.action.type === 'pool-cross-provider' && x.action.fallback === true);

  // (r3945 (3)) THE ORDER OF USE: two keys of ONE vendor listed — the pool moves a conversation to the FIRST of the saved list that can
  // take it (fallbackRows walks the list; no reading ranks one key over another); the same two in the other order ⇒ the other
  const orderScene = async (fb) => { const w = world({ cross: 'allow', fb }); w.client(); w.mk('o1'); await w.pass(); const m = w.metas.get('cw-o1'); return m && m.poolFallback ? m.poolFallback.provider : null; };
  const dsB = (await store.add({ preset: 'deepseek', key: KEY, label: 'Second key' })).provider;   // a second DeepSeek key (ds2 was removed above)
  const oA = await orderScene([dsB.id, ds.id]), oB = await orderScene([ds.id, dsB.id]);
  await store.remove(dsB.id);   // the scenes below see the store as before
  ok(oA === dsB.id && oB === ds.id, '(r3945 (3)) two keys of one vendor listed: the pool moves a conversation to the FIRST of the saved list — the list\'s order is the order of use (the page stands its rows in it)', { oA, oB, ds: ds.id, dsB: dsB.id });

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
  ok(ans.ok && ans.state === 'allowed' && ans.queued === 3 && r1.length === 3 && r1.every((t) => t.model === 'deepseek-chat' && !('message' in t) && !('prompt' in t) && !('text' in t))
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
  w1.metas.set('cw-s1b', { ...w1.metas.get('cw-s1b'), heldPoolMember: ds.id });   // the create's origin write names where it is held (ws-create)
  await w1.pass();
  const restored = BR.poolFallbackOf(w1.metas.get('cw-s1b'));
  // (r3041 (d)) the reader checks the record against where the conversation is HELD: a record left in the meta of a conversation
  // still held on its member (the hub died between the send and the kill) is no record
  const notMoved = BR.poolFallbackOf({ ...w1.metas.get('cw-s1b'), heldPoolMember: w1.A }), noHold = BR.poolFallbackOf({ poolFallback: (w1.metas.get('cw-s1b') || {}).poolFallback });
  ok(notMoved === null && noHold === null && !!restored, '(d) boot-restore takes the record only on a conversation held ON its provider: the same record on one held on its member A — or on none — is no record (it never moved)', { notMoved, noHold });
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
  w5.mute(() => w5.eng.maybePoolAutoSwitch(busy, { stop: true }));   // the turn's STOP runs its own pass, which pumps (the road production takes)
  await w5.settle();
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

  // ── §4b THE CURE OF ROUND wuq1b1trm (主开发 r2939) ──
  // THE MUST: a pool-made move is judged against the pool's setting AT THE MOVE; a change of the setting empties its pool-made entries
  // (the hosted run of 2.369.419, r4213) the pass STARTS six moves and each lands only after its awaited refusal check (the managed
  // settings read): a count after one settle is a guess — the moves are read once nothing of the world is in flight, the fact
  // itself, at most 3 s; an expiry is said by its own named line, never read as the pool's refusal
  const flights = async (w, ms = 3000) => { for (let t = 0; t < ms && w.eng._fbInFlight.size; t += 25) await w.settle(); return w.eng._fbInFlight.size === 0; };
  const wS = world({ cross: 'allow' });
  wS.client(); for (let i = 0; i < 8; i++) wS.mk('q' + i);
  await wS.pass();
  const flownS = await flights(wS);   // the six LANDED while the pool is still «Move without asking»
  ok(flownS, 'the six moves the pass started LANDED within 3 s while the pool was still «Move without asking» (the harness\'s bound, read before the leg below)', { inFlight: wS.eng._fbInFlight.size, restarts: wS.restarts().length });
  const leftS = wS.eng._fbQueue.size;
  wS.am.updatePool(wS.P, { crossProvider: 'never' });   // the person turns the pool back — no purge called: the move itself must judge it
  await wS.eng.pumpFallbackMoves(Date.now() + 61e3);
  const wP = world({ cross: 'allow' });
  wP.client(); for (let i = 0; i < 8; i++) wP.mk('p' + i);
  await wP.pass();
  const pressed = [...wP.eng._fbQueue.values()][0];
  wP.eng.queueFallbackMove(pressed.poolId, pressed.sid, pressed.to, 'person');
  wP.eng._fbInFlight.clear();
  const pressedSid = pressed.sid, otherSid = [...wP.eng._fbQueue.keys()].find((k) => k !== pressedSid);
  wP.am.updatePool(wP.P, { crossProvider: 'never' }); const purged = wP.eng.purgePoolMadeMoves(wP.P);   // the PATCH route's own act (account-usage-routes)
  ok(leftS === 2 && wS.restarts().length === 6 && wS.eng._fbQueue.size === 0 && purged === 1 && wP.eng._fbQueue.has(pressedSid) && !wP.eng._fbQueue.has(otherSid)
    && read('src/server/account-usage-routes.js').includes("if (req.body?.crossProvider !== undefined && typeof engine.purgePoolMadeMoves === 'function') { try { engine.purgePoolMadeMoves(id); } catch { } }"),
    'THE MUST: the pool turned back to never ⇒ the two pool-made moves still queued are NOT made (judged against the setting at the move) and leave the queue; the setting\'s own door empties the pool\'s pool-made entries at once — a person\'s press stays (its own authority)',
    { leftS, restarts: wS.restarts().length, queue: wS.eng._fbQueue.size, purged, kept: wP.eng._fbQueue.has(pressedSid) });
  // THE MONEY LAW ITSELF (r4213, asked beside the cure): a move still IN FLIGHT when the setting turns back to never is NOT made and
  // leaves no record — its record's write held (the move on its way past its refusal check), the setting changed, then the write lands
  const wI = world({ cross: 'allow' });
  wI.client(); wI.meta.mode = 'hold'; wI.mk('if1');
  await wI.pass();
  for (let t = 0; t < 3000 && !wI.meta.held.length; t += 25) await wI.settle();   // the fact: its record's write is held (the move in flight)
  const heldI = wI.meta.held.length === 1 && wI.eng._fbInFlight.has('if1');
  wI.am.updatePool(wI.P, { crossProvider: 'never' });   // the person turns the pool back while the move is in flight
  wI.meta.mode = 'ok'; wI.meta.held.splice(0).forEach((go) => go());   // its record lands AFTER the setting changed
  const doneI = await flights(wI);
  ok(heldI && doneI && wI.restarts().length === 0 && !(wI.metas.get('cw-if1') || {}).poolFallback && wI.eng._fbQueue.size === 0,
    'THE MONEY LAW: a move still IN FLIGHT when the pool is turned back to never is NOT made — judged again after its record landed — and leaves NO record (the conversation stays where it was)',
    { heldI, doneI, restarts: wI.restarts().length, record: (wI.metas.get('cw-if1') || {}).poolFallback || null, queue: wI.eng._fbQueue.size });
  // (1) THE RECORD rides the moved conversation's own create (test-harness-spawn «THE REAL ROAD»); a record on a conversation that did not move is cleared
  const wN = world({ cross: 'allow' });
  wN.mk('nc1');   // no page open: the restart cannot be asked
  await wN.pass();
  ok(!(wN.metas.get('cw-nc1') || {}).poolFallback && wN.restarts().length === 0, '(1) a conversation that did NOT move (no page open to restart it) keeps no record of a move', wN.metas.get('cw-nc1'));
  // (2) AN UNREADABLE META IS NOT AN EMPTY ONE
  const wU = world({ cross: 'allow' });
  wU.client(); wU.mk('u1'); wU.metas.delete('cw-u1');   // its meta reads as nothing
  await wU.pass();
  ok(wU.restarts().length === 0 && !wU.metas.has('cw-u1') && wU.cards.some((c) => c.sid === 'u1' && /the record of the move could not be saved/.test(c.text)), '(2) a meta that reads as nothing is refused — never a whole new meta holding only the record — nothing moves, its line says so', { metas: [...wU.metas.keys()], cards: wU.cards.map((c) => c.text) });
  // (3) JUDGED AGAIN AFTER THE AWAITED WRITE; never queued or executed twice across the wait
  const wH = world({ cross: 'allow' });
  wH.client(); wH.meta.mode = 'hold'; wH.mk('h2');
  await wH.pass(); await wH.pass(); await wH.pass();
  const heldWrites = wH.meta.held.length;
  fs.writeFileSync(path.join(wH.cacheDir, wH.B + '.json'), cacheOf(0.1));   // B serves again while the write is held
  wH.meta.held.splice(0).forEach((go) => go());
  await wH.settle();
  ok(heldWrites === 1 && wH.restarts().length === 0 && !(wH.metas.get('cw-h2') || {}).poolFallback, '(3) a record write HELD across three passes is ONE write (the conversation never queued twice); B serving again before it lands ⇒ judged again after it landed: not moved, the record cleared', { heldWrites, restarts: wH.restarts().length, rec: (wH.metas.get('cw-h2') || {}).poolFallback });
  // (4) THE PROVIDER's REFUSALS BEFORE THE KILL — the machine's managed Claude settings name a key helper
  const mdir = fs.mkdtempSync(path.join(scratchDir('pool-fallback-managed'), 'm-')); fs.writeFileSync(path.join(mdir, 'managed-settings.json'), JSON.stringify({ apiKeyHelper: '/opt/org/key-helper' }));
  const wM = world({ cross: 'allow', managedDir: mdir });
  wM.client(); wM.mk('m2');
  await wM.pass();
  for (let i = 0; i < 12 && !wM.cards.some((c) => c.sid === 'm2'); i++) await wM.settle();   // the refusal is asked off the pass (an async check): its line, bounded
  ok(wM.restarts().length === 0 && !(wM.metas.get('cw-m2') || {}).poolFallback && wM.cards.some((c) => c.sid === 'm2' && c.text === 'DeepSeek cannot take this conversation: this machine\'s managed Claude settings keep a provider\'s key out — nothing moved'),
    '(4) the managed settings refuse the provider ⇒ asked BEFORE the kill: nothing restarted (the conversation never left stopped by the pool), no record, its line says why', wM.cards.map((c) => c.text));
  // (5) A PERSON's PRESS, PACED FOR THE BOX (r3041 MUST): at the head, uncounted, FOUR restarts OUT at a time — a slot is held until
  // that conversation's restart LANDS (its create asks the carry), never freed at the send
  const land = (w, t) => w.eng.poolChooserForModel(w.P, { model: t.model, resumeOf: t.backendSessionId, carryRecord: true });
  const pressTen = async (w) => { w.client(); for (let i = 0; i < 10; i++) w.mk('pb' + i); await w.pass(); const a = w.mute(() => w.eng.answerCrossProviderAsk(fbItems(w)[0].action.askId, { answer: 'once' })); await w.settle(); await w.settle(); return a; };
  const settleUntil = async (w, n, k = 8) => { for (let i = 0; i < k && w.restarts().length < n; i++) await w.settle(); };
  const wB = world();
  const ansB = await pressTen(wB);
  const atOnce = wB.restarts().length;
  let landed = 0, maxOut = atOnce, rounds = 0, recs = 0;
  while (landed < wB.restarts().length && rounds++ < 30) { if (land(wB, wB.restarts()[landed])) recs++; landed++; await wB.settle(); await wB.settle(); maxOut = Math.max(maxOut, wB.restarts().length - landed); }
  ok(ansB.queued === 10 && ansB.moved === false && atOnce === 4 && maxOut === 4 && wB.restarts().length === 10 && recs === 10 && wB.eng._fbLanding.size === 0 && wB.eng._fbMovedAt.length === 0 && wB.eng.PRESS_MOVES_AT_ONCE === 4,
    '(5) Allow once on 10 waiting conversations: the answer says 10 QUEUED; FOUR restarts out at a time — the next goes only as one LANDS (its create asks the carry), never at the send; all ten in the end, none counted by the pool\'s pace', { queued: ansB.queued, atOnce, maxOut, restarts: wB.restarts().length, recs, rounds });
  const wL = world({ landingMs: 250 });
  wL.client(); for (let i = 0; i < 6; i++) wL.mk('pl' + i);
  await wL.pass();
  wL.mute(() => wL.eng.answerCrossProviderAsk(fbItems(wL)[0].action.askId, { answer: 'once' }));
  await wL.settle();
  const firstL = wL.restarts().length;
  const saidL = [], logL = console.log; console.log = (m) => { saidL.push(String(m)); };
  try { await new Promise((r) => setTimeout(r, 700)); await settleUntil(wL, 6); } finally { console.log = logL; }
  ok(firstL === 4 && wL.restarts().length === 6 && saidL.filter((m) => /was not seen landing within/.test(m)).length >= 4,
    '(5) …a restart never seen landing holds its slot only to the bound: then the slot is freed AND SAID (the journal), and the next ones go', { firstL, after: wL.restarts().length, said: saidL.filter((m) => /landing/.test(m)).length });
  // (a) THE PRESS's WORDS (r3041): the answer counts what is QUEUED (the hub says each move as it is made, a refused one in its own
  // line); a singular; «Always» with nothing waiting says the pool now moves by itself
  const UTA = read('src/lib/user-todos-actions.js');
  ok(UTA.includes("n === 1 ? t('1 conversation is queued to move to the fallback — it restarts there when its turn is over; a refusal is said in its own line')")
    && UTA.includes("t('{n} conversations are queued to move to the fallback — each restarts there when its turn is over; a refusal is said in its own line', { n })")
    && UTA.includes("r.state === 'always' ? t('This pool now moves a conversation to its fallback by itself — none waits right now')") && !UTA.includes('Moving {n} conversations'),
    '(a) the press\'s toast says QUEUED (never «moving»), one conversation in the singular, and «Always» with none waiting says the pool now moves by itself');
  // (b) THE REFUSAL CHECK FAILS CLOSED (r3041): a check that throws refuses — nothing killed, said in the line in its own sentence; and
  // it asks with the conversation's OWN backend and the model its restart carries
  const MAN = require(path.join(REPO, 'src/managed-claude-settings.js')), realMH = MAN.managedHelperFact;
  const wX = world({ cross: 'allow' });
  wX.client(); wX.mk('x1');
  MAN.managedHelperFact = async () => { throw new Error('a placed throw'); };
  try { await wX.pass(); await wX.settle(); } finally { MAN.managedHelperFact = realMH; }
  ok(wX.restarts().length === 0 && !(wX.metas.get('cw-x1') || {}).poolFallback && wX.cards.some((c) => c.sid === 'x1' && c.text === 'DeepSeek cannot take this conversation now: its refusals could not be checked — nothing moved; the pool asks again later'),
    '(b) the provider\'s refusal check THROWS ⇒ refused (fails closed): nothing restarted, no record, the line says the check could not be made', wX.cards.map((c) => c.text));
  const wY = world({ cross: 'allow' });
  wY.client(); wY.mk('y1');
  const askedY = [], realPMF = wY.am.providerModelFor.bind(wY.am);
  wY.am.providerModelFor = (id, be, m) => { askedY.push({ id, be, m }); return realPMF(id, be, m); };
  await wY.pass(); await wY.settle();
  wY.am.providerModelFor = realPMF;
  const yR = wY.restarts().find((t) => t.serverId === 'y1');
  ok(!!yR && askedY.some((q) => q.id === ds.id && q.be === wY.sessions.get('y1').backend && q.m === yR.model),
    '(b) …the check asks the provider with the conversation\'s OWN backend and the model its restart carries (as the create will)', { askedY, restart: yR && yR.model });
  // (c) A REFUSED MOVE IS BACKED OFF (r3041): the pool does not queue it again (nor spend a slot, nor ask the check again) before its
  // time; a member serving it again ends the episode (the backoff and the said-once line cleared)
  let checksK = 0;
  const wK = world({ cross: 'allow', managedDir: mdir });
  wK.client(); wK.mk('k1');
  MAN.managedHelperFact = async (o) => { checksK++; return realMH(o); };
  try { await wK.pass(); await wK.settle(); const c1 = checksK; await wK.pass(); await wK.settle(); await wK.pass(); await wK.settle(); var kAfter = { c1, c3: checksK, queued: wK.eng._fbQueue.has('k1'), off: wK.eng._fbBackoff.has('k1') }; } finally { MAN.managedHelperFact = realMH; }
  fs.writeFileSync(path.join(wK.cacheDir, wK.B + '.json'), cacheOf(0.1));
  await wK.pass(); await wK.settle();
  ok(kAfter.c1 === 1 && kAfter.c3 === 1 && !kAfter.queued && kAfter.off && wK.cards.filter((c) => c.sid === 'k1' && /keep a provider's key out/.test(c.text)).length === 1 && !wK.eng._fbBackoff.has('k1'),
    '(c) refused once ⇒ backed off: two more passes queue nothing and ask the check NO more (one check, one line); B serving again ends the episode (the backoff cleared)', kAfter);
  // (r3148 (2)) the backoff of a conversation that is gone is dropped at the next pump (and the map is capped as the said-once one is)
  wK.eng._fbBackoff.set('gone-sid', { to: ds.id, n: 1, until: Date.now() + 36e5 });
  wK.eng.pumpFallbackMoves();
  ok(!wK.eng._fbBackoff.has('gone-sid') && /while \(_fbBackoff\.size > 4096\)/.test(read('src/server/usage-pool-engine.js')), '(r3148 (2)) a gone conversation keeps no backoff (dropped at the next pump); the map is capped at 4096 like the said-once map');
  // (r3148 (3) (4)) A PRESS REFUSED AGAIN says it again (the toast promised the line); a press's failed check promises no «asks again»
  const wPr = world({ managedDir: mdir });
  wPr.client(); wPr.mk('pr1');
  await wPr.pass();
  wPr.mute(() => wPr.eng.answerCrossProviderAsk(fbItems(wPr)[0].action.askId, { answer: 'once' })); await wPr.settle(); await wPr.settle();
  await wPr.pass();
  const again = fbItems(wPr).filter((x) => x.status === 'open');
  if (again.length) { wPr.mute(() => wPr.eng.answerCrossProviderAsk(again[0].action.askId, { answer: 'once' })); await wPr.settle(); await wPr.settle(); }
  const prLines = wPr.cards.filter((c) => c.sid === 'pr1' && /keep a provider's key out/.test(c.text)).length;
  ok(again.length === 1 && prLines === 2 && wPr.restarts().length === 0, '(r3148 (3)) a press refused AGAIN in the same episode says its line again (two presses, two lines, nothing restarted)', { again: again.length, prLines });
  const wPu = world();
  wPu.client(); wPu.mk('pu1');
  await wPu.pass();
  MAN.managedHelperFact = async () => { throw new Error('a placed throw'); };
  try { wPu.mute(() => wPu.eng.answerCrossProviderAsk(fbItems(wPu)[0].action.askId, { answer: 'once' })); await wPu.settle(); await wPu.settle(); } finally { MAN.managedHelperFact = realMH; }
  ok(wPu.cards.some((c) => c.sid === 'pu1' && c.text === 'DeepSeek cannot take this conversation now: its refusals could not be checked — nothing moved') && !wPu.cards.some((c) => /asks again/.test(c.text || '')),
    '(r3148 (4)) a PRESS whose check could not be made says so with no «the pool asks again» (under «never» nothing asks again)', wPu.cards.map((c) => c.text));
  // (r3148 (5)) A MOVE WITH NO BACKEND ID is refused before anything: no check, no record, nothing restarted, no slot held
  const wNb = world({ cross: 'allow' });
  wNb.client(); wNb.mk('nb1', wNb.P, { claudeSessionId: null });
  let checksNb = 0; MAN.managedHelperFact = async (o) => { checksNb++; return realMH(o); };
  try { await wNb.pass(); await wNb.settle(); } finally { MAN.managedHelperFact = realMH; }
  ok(wNb.restarts().length === 0 && checksNb === 0 && !(wNb.metas.get('cw-nb1') || {}).poolFallback && wNb.eng._fbInFlight.size === 0 && wNb.eng._fbLanding.size === 0 && wNb.cards.some((c) => c.sid === 'nb1' && /has no conversation of its own the provider could resume/.test(c.text)),
    '(r3148 (5)) a conversation with no backend id is refused BEFORE anything — no check asked, no record, nothing restarted, no slot held — and its line says why', { checksNb, inFlight: wNb.eng._fbInFlight.size, cards: wNb.cards.map((c) => c.text) });
  // (r3148 (1) (6)) the conversation lines are stored strings (no dictionary rows); the check and the restart name the backend ONE way
  const ENGs = read('src/server/usage-pool-engine.js'), ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  ok(!/i18nKey\('\{provider\} cannot take this conversation/.test(ENGs) && !ZH.includes('"{provider} cannot take this conversation') && !JA.includes('"{provider} cannot take this conversation')
    && ENGs.includes('fallbackRefusal(e.to, x.toModel, convBackend(j.s2))') && ENGs.includes("sendColdRestart(poolId, [{ serverId: sid, backend: convBackend(s2), backendSessionId: bsid,"),
    '(r3148 (1) (6)) the refusal lines are stored strings — no dictionary rows (a conversation\'s line stays English); the pre-kill check and the cold restart name the backend by ONE expression');
  // (6) THE BUTTON's WORDS: «Always» on the fallback item says it reaches ANY fallback this pool lists; its detail too
  ok(read('src/lib/user-todos-row.js').includes("act && act.fallback ? t('Always — to any fallback this pool lists') : t('Always for this pool')") && /to ANY fallback this pool lists/.test(fbItems(wB)[0].detail || ''),
    '(6) the fallback item\'s «Always» says it plainly — always, to ANY fallback this pool lists (the pool\'s one setting) — in its button and its detail');
  // (a) (b) (c) THE ITEM's ANSWERS: Always sets THIS pool only; Deny keeps the pool and provider quiet for 6 h; a tray dismissal is a Deny
  const wA = world({ pools: 2 });
  wA.client(); wA.mk('aa1'); wA.mk('aa2', wA.P2);
  await wA.pass(wA.P); await wA.pass(wA.P2);
  const itP = fbItems(wA).find((x) => x.action.poolId === wA.P), itP2 = fbItems(wA).find((x) => x.action.poolId === wA.P2);
  wA.eng.answerCrossProviderAsk(itP.action.askId, { answer: 'always' });
  await wA.settle();
  const alw = { p: wA.am.get(wA.P).crossProvider, p2: wA.am.get(wA.P2).crossProvider, moved: wA.restarts().some((t) => t.serverId === 'aa1') };
  wA.todos.dismiss(itP2.id);
  await wA.pass(wA.P2);
  const wD = world();
  wD.client(); wD.mk('dd1');
  await wD.pass();
  wD.eng.answerCrossProviderAsk(fbItems(wD)[0].action.askId, { answer: 'deny' });
  await wD.pass();
  ok(alw.p === 'allow' && alw.p2 === undefined && alw.moved && fbItems(wA).filter((x) => x.action.poolId === wA.P2 && x.status === 'open').length === 0
    && fbItems(wD).filter((x) => x.status === 'open').length === 0 && fbItems(wD).length === 1 && wD.restarts().length === 0,
    '(a) Always sets THIS pool\'s setting only and moves its conversations; (b) Deny moves nothing and the next pass files no item (6 h quiet); (c) the item dismissed in the tray is a Deny — the next pass files none', { alw, d: fbItems(wD).map((x) => x.status) });
  // (7) A LOCKED VAULT: the conversation's own line says the fallback waits for it
  await vault.lock('test', { quiet: true });
  const wV = world();
  wV.client(); wV.mk('v1');
  await wV.pass(); await wV.pass();
  const peekLocked = wV.eng.poolChooserForModel(wV.P, { model: 'deepseek-chat', resumeOf: 'cid-v1', fallbackOnly: true });
  await vault.unlock('correct horse battery staple');
  ok(wV.cards.filter((c) => c.sid === 'v1' && c.text === 'DeepSeek could take this conversation while every member is out, but the vault is locked — For you names what waits on it; Unlock… there and the pool can move it').length === 1 && wV.restarts().length === 0 && peekLocked === null,
    '(7) the vault LOCKED: nothing moves and the conversation\'s own line says ONCE that DeepSeek waits for the vault (its press: the vault\'s item in For you); the peek names nothing', wV.cards.map((c) => c.text));
  // (r3041 (c)) …ONCE AN EPISODE: the vault opened ends it; locked again, the line is said again (once)
  await wV.pass();
  await vault.lock('test', { quiet: true });
  try { await wV.pass(); await wV.pass(); } finally { await vault.unlock('correct horse battery staple'); }
  ok(wV.cards.filter((c) => c.sid === 'v1' && /but the vault is locked/.test(c.text)).length === 2, '(7) …once an EPISODE: the vault opened ends it; locked again, the line is said again — once', wV.cards.map((c) => c.text));
  // (8) THE MEMBER ABOUT TO RETURN: held near its login\'s end, near its limit, unknown ⇒ the pool\'s own member, never the provider; a wall a minute from its reset: the shape has no wait (F3a\'s dwell brings it back)
  const near = (w, how) => {
    if (how === 'unknown') fs.writeFileSync(path.join(w.cacheDir, w.B + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'on-demand' }));   // a reading that states no bucket: B is UNKNOWN, never «out»
    if (how === 'soft') fs.writeFileSync(path.join(w.cacheDir, w.B + '.json'), cacheOf(0.93));   // near its limit, above its hard floor
    if (how === 'login') { fs.writeFileSync(path.join(w.cacheDir, w.B + '.json'), cacheOf(0.1)); fs.writeFileSync(path.join(w.am.subDir(w.B), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 10 * 60e3, subscriptionType: 'max' } }), { mode: 0o600 }); }   // quota fine, its login about to end
  };
  const eight = {};
  for (const how of ['unknown', 'soft', 'login']) { const w = world({ cross: 'allow' }); w.client(); near(w, how); w.mk('e-' + how); await w.pass(); eight[how] = { on: w.am.poolCurrentFor(w.P, 'e-' + how) === w.B, fb: w.restarts().some((t) => t.model === 'deepseek-chat') || w.eng._fbQueue.size > 0 }; }
  // (r3041 (e)) A MEMBER MERELY HELD: B refused by the vendor (a 403 — the engine's 10-minute mark, tried again after it), A at its wall:
  // the settled shape holds B out of the candidates while its mark stands ⇒ the provider IS chosen (F3a's dwell brings it back)
  const wE = world({ cross: 'allow', bHealthy: true });
  wE.client(); const eb = wE.mk('e-onb'); wE.am.ensureSessionPoolLink(wE.P, 'e-onb', wE.B, { why: 'spawn' });
  wE.mute(() => wE.eng.notePoolAuthFailure(eb, 'e-onb', { status: 403, message: 'permission_error' }));
  wE.mk('e-held');
  await wE.pass();
  eight.held = { fb: wE.restarts().some((t) => t.serverId === 'e-held' && t.model === 'deepseek-chat') || wE.eng._fbQueue.has('e-held') };
  const wR = world({ cross: 'allow' });
  wR.client(); fs.writeFileSync(path.join(wR.cacheDir, wR.A + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'on-demand', fiveHour: { utilization: 1, resetsAt: nowS() + 60 }, sevenDay: { utilization: 0.4, resetsAt: nowS() + 3 * 86400 } }));
  wR.mk('r60');
  await wR.pass();
  const heldE = eight.held; delete eight.held;
  ok(Object.values(eight).every((x) => x.on && !x.fb) && heldE.fb && wR.restarts().some((t) => t.serverId === 'r60' && t.model === 'deepseek-chat'),
    '(8) B unknown, B near its limit, B\'s login near its end ⇒ the pool\'s OWN member takes it, never the provider; B merely HELD (the vendor\'s 10-minute mark) or A a minute from its reset with B spent ⇒ the provider IS chosen (the settled shape holds no wait — F3a\'s dwell brings it back)', { eight, heldE, r60: wR.restarts().map((t) => t.model) });
  // RED CONTROLS
  const ENG = read('src/server/usage-pool-engine.js');
  const FREE_AT_LANDING = "if (x.r && x.r.landing) x.r.landing.then(free, free); else free(); return x; }));";
  const wFS = world({ engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, FREE_AT_LANDING, 'free(); return x; }));', 'the slot freed at the send'), 'eng-free-at-send') });
  await pressTen(wFS); await settleUntil(wFS, 10);
  ok(wFS.restarts().length === 10, 'CONTROL: a copy that frees the press\'s slot at the SEND (not the landing) has all ten restarts out at once ⇒ (5) goes RED', wFS.restarts().length);
  const OPEN = "  } catch (err) { return { key: FALLBACK_REFUSED_UNCHECKED, params: {}, why: `its refusals could not be checked (${(err && err.message) || err})` }; }";
  const wXo = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, OPEN, '  } catch (err) { }', 'the check fails open'), 'eng-fails-open') });
  wXo.client(); wXo.mk('x1');
  MAN.managedHelperFact = async () => { throw new Error('a placed throw'); };
  try { await wXo.pass(); await wXo.settle(); } finally { MAN.managedHelperFact = realMH; }
  ok(wXo.restarts().length === 1, 'CONTROL: a copy whose refusal check fails OPEN on a throw kills the conversation for a create that refuses ⇒ (b) goes RED', wXo.restarts().length);
  const PACE = "    if (e.by !== 'person' && _fbMovedAt.length >= FALLBACK_MOVES_PER_MIN) continue;";
  const wPace = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, PACE, '', 'no pace'), 'eng-no-pace') });
  wPace.client(); for (let i = 0; i < 8; i++) wPace.mk('p' + i);
  await wPace.pass();
  ok(wPace.restarts().length === 8, 'CONTROL: a copy without the pace restarts all 8 in the minute ⇒ the 6-a-minute leg goes RED', wPace.restarts().length);
  const SET1 = "  if (by !== 'person' && crossProviderMode((accounts.get(poolId) || {}).crossProvider) !== 'allow') return { why: 'setting' };";
  const SET2 = "    if (e.by !== 'person' && crossProviderMode((accounts.get(e.poolId) || {}).crossProvider) !== 'allow') { _fbQueue.delete(e.sid); continue; }   // (r2939 MUST) the pool's setting is no longer 'allow': its own entries go";
  const wForce = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(anchored(ENG, SET1, '', 'the move forces allow'), SET2, '', 'the queue keeps the pool\'s entries'), 'eng-forced-allow') });
  wForce.client(); for (let i = 0; i < 8; i++) wForce.mk('f' + i);
  await wForce.pass();
  wForce.am.updatePool(wForce.P, { crossProvider: 'never' });
  await wForce.eng.pumpFallbackMoves(Date.now() + 61e3);
  ok(wForce.restarts().length === 8, 'CONTROL: a copy whose move forces the allow word (the setting not judged at the move) goes on moving after the pool said never ⇒ the MUST\'s leg goes RED', wForce.restarts().length);
  const SWEEP = "        if (on && !membership.includes(on) && !(poolFallbackSet(accounts.get(a.id)) || new Set()).has(on) && !(/^pv-/.test(String(on)) && s._poolFallback && s._poolFallback.poolId === a.id)) stale.add(on); // (B-d578) a conversation on a LISTED fallback provider is the pool's; (F3a) one on a REMOVED fallback with its record is the coming-back road's (judgeFallbackReturns), never the removed-member wall's";   // (F3a) the sweep's WHOLE line as F3a wrote it (its comment too: a part-line anchor left the rest as code in the copy)
  const wSw = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, SWEEP, '        if (on && !membership.includes(on)) stale.add(on);', 'the sweep takes a fallback for a removed member'), 'eng-sweep-takes') });
  wSw.mk('sw1', wSw.P, { claudeSessionId: 'cid-sw1', _heldPoolMember: ds.id, _lastPtyDataAt: Date.now() });
  const swept2 = wSw.mute(() => wSw.eng.sweepNonMemberLinks());
  ok(swept2.some((x) => x && Array.isArray(x.removed) && x.removed.includes(ds.id)), 'CONTROL: a copy of the stale-member sweep without the fallback\'s exemption takes the conversation on DeepSeek for a removed member ⇒ the sweep leg goes RED', swept2);
  ok(BR.poolFallbackOf({ poolFallback: { poolId: 'p', provider: 'acct-1' } }) === null && BR.poolFallbackOf({ poolFallback: 'x' }) === null && BR.poolFallbackOf({}) === null, 'boot-restore reads a malformed record — another kind of id, a string, none — as NO record (nothing guessed)');
  const FIRST = '  const saved = await writeFallbackRecord(j.s2, record);';
  // THE COPY (the record not waited for), its world's record write REFUSED (meta 'fail'); `stall` places a stall in the copy's AWAITED
  // refusal check (the window the box zone's load widened, run bf075c6b4-20261125015229-both: the copy's «cross-provider switch …/r1»
  // printed after the leg read 0); `wait`: the count is read once the copy's move has landed (at most 2 s), else after the pass alone
  const STALL_AT = '  const refused = await fallbackRefusal(e.to, x.toModel, convBackend(j.s2));';
  const recScene = async ({ stall = 0, wait = true, tag }) => {
    let text = anchored(ENG, FIRST, '  const saved = (writeFallbackRecord(j.s2, record), true);', 'restart before the record');
    if (stall) text = anchored(text, STALL_AT, `  const refused = await new Promise((r) => setTimeout(r, ${stall})).then(() => fallbackRefusal(e.to, x.toModel, convBackend(j.s2)));`, 'a placed stall in the awaited refusal check');
    const w = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', text, tag) });
    w.client(); w.meta.mode = 'fail'; w.mk('r1');
    await w.pass();
    if (wait) for (let i = 0; i < 80 && w.restarts().length === 0; i++) await w.settle();
    const m = w.metas.get('cw-r1');
    return { moved: w.restarts().length, record: !!(m && m.poolFallback) };
  };
  const rec0 = await recScene({ tag: 'eng-no-record-first' });
  ok(rec0.moved === 1 && rec0.record === false, 'CONTROL: a copy that restarts without waiting for the record moves the conversation with NO record on disk ⇒ the record-first legs go RED', rec0);
  // (r4002) THE CURE PROVEN BY ITS WINDOW: a PLACED 300 ms stall in the copy's awaited refusal check — the control still reads the
  // move and still shows no record on disk; its red: the same stalled copy read after the pass alone (the wait cut) reads 0, as the box zone did
  const recS = await recScene({ stall: 300, tag: 'eng-no-record-first-stalled' });
  ok(recS.moved === 1 && recS.record === false, '(r4002) the control through a PLACED 300 ms stall in the copy\'s awaited refusal check: it still reads the copy\'s move, and still no record on disk', recS);
  const recCut = await recScene({ stall: 300, wait: false, tag: 'eng-no-record-first-stalled-nowait' });
  ok(recCut.moved === 0, 'CONTROL (r4002): the same stalled copy read after the pass alone (the wait cut) reads 0 — the box zone\'s red, made on demand', recCut);
  const ONE = "        if (ds && ds.crossOffer && ds.crossOffer.fallbackOnly && /^pv-/.test(String(ds.crossOffer.id))) {";
  const wCards = world({ engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, ONE, '        if (false) {', 'a card a conversation'), 'eng-card-each') });
  wCards.client(); for (const sid of ['c1', 'c2', 'c3', 'c4']) wCards.mk(sid);
  await wCards.pass();
  ok(fbItems(wCards).length === 0 && wCards.items.filter((x) => /^Moving "/.test(x.text || '')).length === 4, 'CONTROL: a copy that files the old card a conversation asks FOUR times ⇒ the one-item leg goes RED', wCards.items.map((x) => x.text));
  // ── §5 COMING BACK (unit F3a): the new-conversation verdict, the DWELL, the FIRST model, the removal ──
  const onFb = (w, sid, { ago = 16 * 60e3, rec = true } = {}) => w.mk(sid, w.P, { claudeSessionId: 'cid-' + sid, _heldPoolMember: ds.id, _lastPtyDataAt: Date.now(),
    ...(rec ? { _poolFallback: { poolId: w.P, provider: ds.id, fromMember: w.A, fromModel: 'sonnet', toModel: 'deepseek-chat', at: Date.now() - ago, by: 'pool' } } : {}) });
  const heal = (w) => fs.writeFileSync(path.join(w.cacheDir, w.A + '.json'), cacheOf(0.1));
  const wall = (w) => fs.writeFileSync(path.join(w.cacheDir, w.A + '.json'), cacheOf(1));
  // SCENE 4 — allow: A resets and is confirmed ⇒ back on A with the FIRST model, through the queue, after the dwell; the line; NO FLAP
  const w10 = world({ cross: 'allow' });
  w10.client(); heal(w10); onFb(w10, 'b1');
  await w10.pass();
  const back = w10.restarts().find((t) => t.serverId === 'b1');
  const backRec = (w10.metas.get('cw-b1') || {}).poolFallback || {};
  const lbl = w10.am.memberProviderOf(w10.A).label;
  const b1r = w10.mk('b1r', w10.P, { claudeSessionId: 'cid-b1', _lastPtyDataAt: Date.now() });
  await w10.pass();
  ok(!!back && back.model === 'sonnet' && !!backRec.back && backRec.back.to === w10.A && w10.eng._fbMovedAt.length === 1 && w10.am.poolCurrentFor(w10.P, 'b1') === w10.A
    && w10.cards.some((c) => c.sid === 'b1r' && c.text === `Switched back from DeepSeek to Member A (${lbl}) — model deepseek-chat → sonnet`) && Number(b1r._poolFallbackDwell) > 0 && Number((w10.metas.get('cw-b1r') || {}).poolFallbackDwell) > 0,
    'scene 4, allow: A resets and is confirmed (the new-conversation verdict of its FIRST model) ⇒ the conversation moves BACK through the hub queue (a paced move), its record\'s `back` written first, the restart asks for the FIRST model (sonnet); the resumed one says «Switched back from DeepSeek to Member A … — model deepseek-chat → sonnet» and keeps the dwell\'s start (memory + its meta)',
    { back, rec: backRec.back, paced: w10.eng._fbMovedAt.length, cards: w10.cards.filter((c) => c.sid === 'b1r').map((c) => c.text) });
  wall(w10);
  const queuedBefore = w10.eng._fbQueue.size;
  await w10.pass();
  ok(!w10.eng._fbQueue.has('b1r') && !w10.restarts().some((t) => t.serverId === 'b1r'), 'NO FLAP: A walls again INSIDE the dwell ⇒ the conversation the pool just moved back is NOT moved onto the fallback again (nobody moves twice)', { queuedBefore, queue: [...w10.eng._fbQueue.keys()] });
  const w11 = world({ cross: 'allow' });
  w11.client(); heal(w11); onFb(w11, 'd1', { ago: 5 * 60e3 });
  await w11.pass();
  ok(w11.restarts().length === 0 && w11.eng._fbQueue.size === 0, 'inside its DWELL (5 of 15 minutes since the move there) the pool moves nobody back, A healthy or not', w11.restarts());
  // SCENE 3 — never: the conversation's own line once, the pool's count, a press at once (uncounted)
  const w12 = world();
  w12.client(); heal(w12); onFb(w12, 'n1');
  await w12.pass(); await w12.pass();
  const said = w12.cards.filter((c) => c.sid === 'n1' && c.text === `Member A (${w12.am.memberProviderOf(w12.A).label}) can serve again — Move back to Member A`);
  const st = w12.eng.fallbackStatus(w12.P);
  const press = w12.eng.fallbackMoveBack(w12.P);
  await w12.settle();
  ok(w12.restarts().filter((t) => t.serverId === 'n1').length === 1 && said.length === 1 && st.length === 1 && st[0].provider === ds.id && st[0].running === 1 && st[0].canReturn === 1 && press.queued === 1 && w12.eng._fbMovedAt.length === 0 && w12.restarts()[0].model === 'sonnet',
    'scene 3, never: nothing moves by itself — its own line says ONCE «Member A (…) can serve again — Move back to Member A»; the pool\'s row reads 1 on DeepSeek, 1 can come back; a press moves it back AT ONCE with its first model (never counted by the pace)',
    { said: said.length, st, press, restarts: w12.restarts() });
  // SCENE 7 — the provider removed while conversations run on it
  const w13 = world({ cross: 'allow' });
  w13.client(); heal(w13); onFb(w13, 'r1', { ago: 60e3 });
  w13.am.updatePool(w13.P, { fallbackProviders: [] });   // the removal's prune (F1): the provider left the list
  await w13.pass();
  const r1r = w13.mk('r1r', w13.P, { claudeSessionId: 'cid-r1', _lastPtyDataAt: Date.now() });
  await w13.pass();
  const swept7 = w13.mute(() => w13.eng.sweepNonMemberLinks());
  ok(w13.restarts().some((t) => t.serverId === 'r1' && t.model === 'sonnet') && w13.cards.some((c) => c.sid === 'r1r' && c.text === `DeepSeek was removed — this conversation moved back to Member A (${w13.am.memberProviderOf(w13.A).label}) — model deepseek-chat → sonnet`) && !swept7.some((x) => x && x.removed && x.removed.includes(ds.id)),
    'scene 7, allow: the provider removed (no longer listed) ⇒ back at once when a member can serve (no dwell — it is gone), with its first model and the line «DeepSeek was removed — this conversation moved back to Member A …»; the removed-member wall never takes it (its record makes it this road\'s)', { restarts: w13.restarts(), cards: w13.cards.map((c) => c.text) });
  const w14 = world();
  w14.client(); heal(w14); onFb(w14, 'r2');
  w14.am.updatePool(w14.P, { fallbackProviders: [] });
  await w14.pass();
  const w15 = world();
  w15.client(); onFb(w15, 'r3');
  w15.am.updatePool(w15.P, { fallbackProviders: [] });
  await w15.pass();
  const w16 = world({ cross: 'allow' });
  w16.client(); heal(w16); onFb(w16, 'x1', { rec: false });
  await w16.pass();
  ok(w14.restarts().length === 0 && w14.cards.some((c) => c.sid === 'r2' && c.text === `DeepSeek was removed — this conversation can move back to Member A (${w14.am.memberProviderOf(w14.A).label})`)
    && w15.restarts().length === 0 && w15.cards.some((c) => c.sid === 'r3' && c.text === 'DeepSeek was removed — this conversation cannot continue on DeepSeek: no member can serve now — Move back when one can')
    && w16.restarts().length === 0 && w16.cards.some((c) => c.sid === 'x1' && c.text === 'DeepSeek has no record of the model this conversation came from — the pool does not move it back by itself'),
    'scene 7, never: told it can move back to Member A (nothing moves); no member can serve ⇒ told it cannot continue there and waits; a conversation with NO record of its first model is never moved back by the pool (said once)',
    { w14: w14.cards.map((c) => c.text), w15: w15.cards.map((c) => c.text), w16: w16.cards.map((c) => c.text) });
  // ── THE CURE of round wyvftjajr (r3319) ──
  const until = async (w, fact, k = 40) => { for (let i = 0; i < k && !fact(); i++) await w.settle(); return fact(); };   // a wait on a FACT, bounded (never a fixed settle)
  const onFbRec = (w, sid, rec) => w.mk(sid, w.P, { claudeSessionId: 'cid-' + sid, _heldPoolMember: ds.id, _lastPtyDataAt: Date.now(), _poolFallback: { poolId: w.P, provider: ds.id, fromMember: w.A, toModel: 'deepseek-chat', at: Date.now() - 16 * 60e3, by: 'pool', ...rec } });
  // THE MUST: a record whose FIRST MODEL is unknown is no record on the pool's road — nothing moved, the no-record line said; the
  // press counts it apart (it cannot restore a model either); the verdict-only ask fails closed with no family
  const wNm = world({ cross: 'allow' });
  wNm.client(); heal(wNm); onFbRec(wNm, 'nm1', { fromModel: null });
  await wNm.pass(); await wNm.pass();
  const pressNm = wNm.eng.fallbackMoveBack(wNm.P);
  await wNm.settle();
  const askNoFam = wNm.eng.poolChooserForModel(wNm.P, { model: null, hinted: true, verdictOnly: true });
  ok(wNm.restarts().length === 0 && !wNm.eng._fbQueue.has('nm1') && wNm.cards.filter((c) => c.sid === 'nm1' && c.text === 'DeepSeek has no record of the model this conversation came from — the pool does not move it back by itself').length === 1
    && pressNm.queued === 0 && pressNm.noModel === 1 && askNoFam === null,
    '(r3319 MUST) a record with NO first model: the pool moves nothing back (no guess), its no-record line ONCE; a press counts it apart (noModel 1, nothing queued); the verdict-only ask with no family answers null', { restarts: wNm.restarts(), pressNm, askNoFam, cards: wNm.cards.map((c) => c.text) });
  // (1) «removed» READ AGAIN after the write: the provider listed again while the record's write was held ⇒ the dwell applies
  const wRl = world({ cross: 'allow' });
  wRl.client(); heal(wRl); onFbRec(wRl, 'rl1', { fromModel: 'sonnet', at: Date.now() - 60e3 });
  wRl.am.updatePool(wRl.P, { fallbackProviders: [] });
  wRl.meta.mode = 'hold';
  await wRl.pass();
  const heldRl = await until(wRl, () => wRl.meta.held.length > 0);
  wRl.am.updatePool(wRl.P, { fallbackProviders: [ds.id] });   // listed again during the write
  wRl.meta.mode = 'ok'; wRl.meta.held.splice(0).forEach((go) => go());
  await until(wRl, () => !wRl.eng._fbInFlight.has('rl1'));
  ok(heldRl && wRl.restarts().length === 0 && !((wRl.metas.get('cw-rl1') || {}).poolFallback || {}).back,
    '(r3319 (1)) the provider listed AGAIN while the move back\'s record was being written ⇒ not moved («removed» read again: the dwell applies), the record as it was (no `back`)', { restarts: wRl.restarts(), rec: (wRl.metas.get('cw-rl1') || {}).poolFallback });
  // (r3319 (8)) THE SETTING TURNED TO NEVER between the judgement and the record's landing ⇒ judged again: not moved, the record put back
  const wSn = world({ cross: 'allow' });
  wSn.client(); heal(wSn); onFbRec(wSn, 'sn1', { fromModel: 'sonnet' });
  wSn.meta.mode = 'hold';
  await wSn.pass();
  await until(wSn, () => wSn.meta.held.length > 0);
  wSn.am.updatePool(wSn.P, { crossProvider: 'never' });
  wSn.meta.mode = 'ok'; wSn.meta.held.splice(0).forEach((go) => go());
  await until(wSn, () => !wSn.eng._fbInFlight.has('sn1'));
  ok(wSn.restarts().length === 0 && !((wSn.metas.get('cw-sn1') || {}).poolFallback || {}).back,
    '(r3319 (8)) the pool turned back to never while the move back\'s record was being written ⇒ judged again after it landed: not moved, the record put back as it was', { restarts: wSn.restarts(), rec: (wSn.metas.get('cw-sn1') || {}).poolFallback });
  // (2) A TURN BEGAN during the record's write ⇒ the record is written back as it was FIRST, then the conversation queued again
  const wIt = world({ cross: 'allow' });
  wIt.client(); heal(wIt); const itC = onFbRec(wIt, 'it1', { fromModel: 'sonnet' });
  wIt.meta.mode = 'hold';
  await wIt.pass();
  await until(wIt, () => wIt.meta.held.length > 0);
  itC._isStreaming = true; itC._turnState = 'running';
  wIt.meta.mode = 'ok'; wIt.meta.held.splice(0).forEach((go) => go());
  await until(wIt, () => !wIt.eng._fbInFlight.has('it1'));
  ok(wIt.restarts().length === 0 && !((wIt.metas.get('cw-it1') || {}).poolFallback || {}).back && wIt.eng._fbQueue.has('it1'),
    '(r3319 (2)) a turn began while the move back\'s record was written ⇒ not moved, the record written back WITHOUT `back` first, then queued again (it waits for the stop)', { rec: (wIt.metas.get('cw-it1') || {}).poolFallback, queued: wIt.eng._fbQueue.has('it1') });
  // A FAILED RESTART (no page open): nothing moved and the record as it was — never half-moved
  const wNc = world({ cross: 'allow' });
  heal(wNc); const nc1 = onFbRec(wNc, 'nc1', { fromModel: 'sonnet' });
  const saidNc = [], logNc = console.log; console.log = (m) => { saidNc.push(String(m)); };
  try { await wNc.pass(); await until(wNc, () => saidNc.some((m) => /no connected client/.test(m)) && !wNc.eng._fbInFlight.has('nc1')); } finally { console.log = logNc; }
  ok(saidNc.some((m) => /nc1: .*waits — no connected client/.test(m)) && wNc.restarts().length === 0 && !((wNc.metas.get('cw-nc1') || {}).poolFallback || {}).back && nc1._heldPoolMember === ds.id && !(nc1._poolFallback || {}).back,
    'a move back whose restart cannot be made (no page open) moves nothing and leaves the record as it was (no `back`) — never half-moved', { rec: (wNc.metas.get('cw-nc1') || {}).poolFallback });
  // TWENTY that may come back in one pass go through the hub queue at its pace (≤ FALLBACK_MOVES_PER_MIN a minute, pool-made)
  const wTw = world({ cross: 'allow' });
  wTw.client(); heal(wTw); for (let i = 0; i < 20; i++) onFbRec(wTw, 'tw' + i, { fromModel: 'sonnet' });
  await wTw.pass();
  await until(wTw, () => wTw.restarts().length >= wTw.eng.FALLBACK_MOVES_PER_MIN);
  await wTw.settle();
  ok(wTw.restarts().length === wTw.eng.FALLBACK_MOVES_PER_MIN && wTw.eng._fbQueue.size === 20 - wTw.eng.FALLBACK_MOVES_PER_MIN,
    'twenty conversations that may come back in ONE pass: the hub queue moves ' + wTw.eng.FALLBACK_MOVES_PER_MIN + ' this minute (its pace), the rest wait their turn', { restarts: wTw.restarts().length, queued: wTw.eng._fbQueue.size });
  // (r3319 (7)) THE READ SIDE, by behaviour: a stamp in the future in a conversation's meta (a clock set back) is written back as NOW
  // at the pass's first read — the dwell then lasts one length from that read (the write side and the sweep: (r3338 (5)) below)
  const wSk = world({ cross: 'allow' });
  wSk.client(); heal(wSk);
  const skS = wSk.mk('sk1', wSk.P, { claudeSessionId: 'cid-sk1', _lastPtyDataAt: Date.now(), _poolFallbackDwell: Date.now() + 365 * 864e5 });
  await wSk.pass();
  wall(wSk);
  await wSk.pass();
  const skAt = skS._poolFallbackDwell, skHeld = !wSk.eng._fbQueue.has('sk1') && !wSk.restarts().some((t) => t.serverId === 'sk1');
  skS._poolFallbackDwell = skAt - wSk.eng.FALLBACK_DWELL_MS - 60e3;   // one dwell after that read
  await wSk.pass();
  ok(skHeld && skAt <= Date.now() && (wSk.eng._fbQueue.has('sk1') || wSk.restarts().some((t) => t.serverId === 'sk1')),
    '(r3319 (7)) a dwell stamp a year ahead in a conversation\'s meta is read back as NOW (held inside its dwell, never for the year) and the conversation goes to the fallback one dwell later — every member out, the pool allowing', { stampAhead: skAt - Date.now(), held: skHeld, queued: wSk.eng._fbQueue.has('sk1') });
  // ── THE SMALL of round wk877xcow (r3338) ──
  // (2) THE DEFAULT LAPSED / THE FAMILY UNKNOWN: never a silent stay on the metered provider — ONE line a conversation, counted apart
  // in the row and in a press's reply (each beside the no-model count)
  const wLp = world({ cross: 'allow' });
  wLp.client(); heal(wLp); onFbRec(wLp, 'lp1', { fromModel: 'sonnet' });
  const realServe = wLp.am.serveStateOf ? wLp.am.serveStateOf.bind(wLp.am) : () => null;
  wLp.am.serveStateOf = (id) => (id === wLp.A ? { state: 'lapsed', lastFail: Date.now() + 36e5, since: Date.now() } : realServe(id));
  await wLp.pass(); await wLp.pass();
  const stLp = wLp.eng.fallbackStatus(wLp.P), prLp = wLp.eng.fallbackMoveBack(wLp.P);
  const vLp = wLp.eng.fallbackBackVerdict(wLp.P, wLp.sessions.get('lp1')._poolFallback);
  wLp.am.serveStateOf = realServe;
  ok(vLp.why === 'default-lapsed' && wLp.restarts().length === 0 && wLp.cards.filter((c) => c.sid === 'lp1' && /cannot come back yet: the pool's default member has lapsed/.test(c.text)).length === 1
    && stLp.length === 1 && stLp[0].lapsed === 1 && stLp[0].canReturn === 0 && prLp.queued === 0 && prLp.lapsed === 1,
    '(r3338 (2)) the pool\'s default LAPSED: the conversation stays where it is (no guess) but is never silent — ONE line «… cannot come back yet: the pool\'s default member has lapsed …»; the row counts it (lapsed 1) and a press\'s reply too', { vLp, stLp, prLp });
  const wFu = world({ cross: 'allow' });
  wFu.client(); heal(wFu); onFbRec(wFu, 'fu1', { fromModel: 'mystery-model-9' });
  await wFu.pass(); await wFu.pass();
  const stFu = wFu.eng.fallbackStatus(wFu.P), prFu = wFu.eng.fallbackMoveBack(wFu.P);
  ok(wFu.restarts().length === 0 && wFu.cards.filter((c) => c.sid === 'fu1' && c.text === 'DeepSeek keeps this conversation for now — it cannot come back yet: VibeSpace cannot tell which family its first model mystery-model-9 belongs to').length === 1
    && stFu[0].familyUnknown === 1 && prFu.familyUnknown === 1 && prFu.queued === 0,
    '(r3338 (2)) the first model\'s FAMILY UNKNOWN: ONE line saying so, counted apart in the row and the press\'s reply', { stFu, prFu });
  // (4) a press over a conversation whose record names ANOTHER provider: counted in its reply, never skipped in silence
  const wOr = world({ cross: 'allow' });
  wOr.client(); heal(wOr); wOr.mk('or1', wOr.P, { claudeSessionId: 'cid-or1', _heldPoolMember: ds.id, _lastPtyDataAt: Date.now(), _poolFallback: { poolId: wOr.P, provider: 'pv-another-one', fromMember: wOr.A, fromModel: 'sonnet', toModel: 'x', at: Date.now() - 16 * 60e3, by: 'pool' } });
  const prOr = wOr.eng.fallbackMoveBack(wOr.P);
  ok(prOr.queued === 0 && prOr.otherRecord === 1, '(r3338 (4)) a press over a conversation whose record names ANOTHER provider: nothing queued, counted (otherRecord 1) for its reply', prOr);
  // (5) THE CLAMP and THE SWEEP, by behaviour: a stamp in the future is written as now; an entry older than one dwell (or in the future) is swept
  const wCl = world();
  const clS = wCl.mk('cl1', wCl.P, { claudeSessionId: 'cid-cl1', _lastPtyDataAt: Date.now() });
  const tCl = Date.now();
  wCl.eng.stampFallbackDwell(clS, tCl + 365 * 864e5);
  const dw = wCl.eng._fbDwell; dw.clear(); dw.set('old', Date.now() - wCl.eng.FALLBACK_DWELL_MS - 60e3); dw.set('future', Date.now() + 36e5); dw.set('fresh', Date.now() - 60e3);
  const sweptCl = wCl.eng.sweepFallbackDwell(Date.now());
  ok(clS._poolFallbackDwell <= Date.now() && clS._poolFallbackDwell >= tCl && sweptCl === 2 && [...dw.keys()].join() === 'fresh',
    '(r3338 (5)) a dwell stamp a year ahead is written as NOW (never longer than its length); the no-flap map\'s sweep drops an entry older than one dwell and one in the future, keeps a fresh one', { stamp: clS._poolFallbackDwell - tCl, swept: sweptCl, left: [...dw.keys()] });
  // (3) the member's own judgement runs under the FIRST model's family, explicit (the session adds only the walls)
  ok(read('src/server/usage-pool-engine.js').includes('return memberCanServe(poolId, to, s2, sid, now, fam) ? { to, why: null } : { to: null, why: \'no-member\' };'),
    '(r3338 (3)) the way back\'s member check is handed the FIRST model\'s family explicitly — the session adds only its walls, never its own model\'s family');
  // (F3b, r3316 (2)) THE ROW's COUNTS TELL THE CLIENTS ON A CHANGE ONLY: the same counts twice push once; a new conversation on the
  // fallback pushes again (the accounts list's own push — no new read the page polls)
  const wTl = world();
  wTl.client(); onFb(wTl, 'tl1');
  let toldTl = 0; const realNote = wTl.am.noteFallbackStatus.bind(wTl.am); wTl.am.noteFallbackStatus = () => { toldTl++; return realNote(); };
  wTl.eng._fbStatusSig.delete(wTl.P);
  wTl.eng.tellFallbackStatus(wTl.P); wTl.eng.tellFallbackStatus(wTl.P);
  const toldOnce = toldTl;
  onFb(wTl, 'tl2');
  wTl.eng.tellFallbackStatus(wTl.P);
  ok(toldOnce === 1 && toldTl === 2 && JSON.stringify(wTl.eng.fallbackStatus(wTl.P).map((r) => r.running)) === '[2]',
    '(F3b) the pool row\'s fallback counts tell the clients only when they CHANGE: the same counts twice push once, a second conversation on the fallback pushes again', { toldOnce, toldTl });
  { // (r3886 small) a pool's FIRST status with nothing on a fallback pushes NOTHING (a hub start no longer pushes every pool's list once)
    const wF0 = world(); wF0.client();
    let told0 = 0; const real0 = wF0.am.noteFallbackStatus.bind(wF0.am); wF0.am.noteFallbackStatus = () => { told0++; return real0(); };
    wF0.eng._fbStatusSig.delete(wF0.P);
    wF0.eng.tellFallbackStatus(wF0.P); const firstEmpty = told0;
    onFb(wF0, 'f01'); wF0.eng.tellFallbackStatus(wF0.P);
    ok(firstEmpty === 0 && told0 === 1, '(r3886 small) a pool\'s first status with nothing on a fallback pushes nothing; the first conversation on it pushes once', { firstEmpty, told0 });
  }
  // (r3338, with F3b) THE DWELL ACROSS A HUB RESTART: a conversation restored with the stamp its meta carries (boot-restore maps
  // meta.poolFallbackDwell → _poolFallbackDwell) is not put on the fallback again inside the dwell, every member out, the pool allowing
  const BRs = read('src/server/boot-restore.js');
  const wRs = world({ cross: 'allow' });
  wRs.client(); wall(wRs);
  const rs1 = wRs.mk('rs1', wRs.P, { claudeSessionId: 'cid-rs1', _lastPtyDataAt: Date.now(), _poolFallbackDwell: Date.now() - 60e3 });
  await wRs.pass(); await wRs.pass();
  ok((BRs.match(/_poolFallbackDwell: Number\(meta\.poolFallbackDwell\) \|\| null/g) || []).length === 2 && !wRs.eng._fbQueue.has('rs1') && !wRs.restarts().some((t) => t.serverId === 'rs1') && rs1._poolFallbackDwell > 0,
    '(r3338) the DWELL across a hub restart: a conversation restored from a meta carrying the stamp (both restore roads map it) is not moved onto the fallback inside its dwell — every member out, the pool allowing', { queued: wRs.eng._fbQueue.has('rs1') });
  // (r3338, with F3b) A PRESS's MOVE BACK holds its slot until it LANDS: six that can come back, a press ⇒ four out at once; each landing
  // (its resumed conversation seen) lets one more go; all six in the end
  const wPl = world();
  wPl.client(); heal(wPl); for (let i = 0; i < 6; i++) onFbRec(wPl, 'pl' + i, { fromModel: 'sonnet' });
  await wPl.pass();
  const prPl = wPl.eng.fallbackMoveBack(wPl.P);
  await until(wPl, () => wPl.restarts().length >= 4);
  const prPl2 = wPl.eng.fallbackMoveBack(wPl.P);   // (r3886 (F)) PRESSED TWICE: the same six, four out and two queued by the first press
  await wPl.settle();
  const firstPl = wPl.restarts().length;
  let maxPl = firstPl, landedPl = 0;
  for (let k = 0; k < 12 && landedPl < wPl.restarts().length; k++) {
    const t = wPl.restarts()[landedPl];
    wPl.mk(t.serverId + 'r', wPl.P, { claudeSessionId: t.backendSessionId, _lastPtyDataAt: Date.now() });   // the resumed conversation is seen
    landedPl++;
    await wPl.pass(); await until(wPl, () => wPl.restarts().length >= Math.min(6, landedPl + 4), 8);
    maxPl = Math.max(maxPl, wPl.restarts().length - landedPl);
  }
  ok(prPl.queued === 6 && firstPl === 4 && maxPl <= 4 && wPl.restarts().length === 6,
    '(r3338, F3b) a press\'s move BACK holds its slot until it LANDS: six queued, four out at once, the next only as one lands (its resumed conversation seen); all six in the end', { queued: prPl.queued, firstPl, maxPl, restarts: wPl.restarts().length });
  ok(prPl2.queued === 0 && prPl2.already === 6 && wPl.restarts().length === 6,
    '(r3886 (F)) PRESSED TWICE LANDS ONCE: the second press queues nothing and says the six already on their way (never «queued» again); six restarts in all, not twelve', { second: prPl2, restarts: wPl.restarts().length });
  { // RED (loaded, run): an engine copy whose press counts a conversation already on its way as queued again
    const wTw2 = world({ engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, "queueFallbackMove(poolId, sid, to, 'person', now); if (was) already++; else n++;", "queueFallbackMove(poolId, sid, to, 'person', now); n++;", 'pressed twice counted twice'), 'eng-press-twice') });
    wTw2.client(); heal(wTw2); for (let i = 0; i < 3; i++) onFbRec(wTw2, 'tw' + i, { fromModel: 'sonnet' });
    await wTw2.pass();
    wTw2.eng.fallbackMoveBack(wTw2.P); const again = wTw2.eng.fallbackMoveBack(wTw2.P);
    ok(again.queued === 3 && !again.already, 'CONTROL (loaded, run): an engine copy that counts the second press as queued again says three queued a second time ⇒ the PRESSED TWICE leg goes RED', again);
  }
  // RED CONTROLS of §5
  const DWELL = "    if (!removed && now - (Number(rec.at) || 0) < FALLBACK_DWELL_MS) continue;   // the DWELL: the pool moves nobody back inside it";
  const wDw = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, DWELL, '', 'no dwell'), 'eng-no-dwell') });
  wDw.client(); heal(wDw); onFb(wDw, 'dd1', { ago: 5 * 60e3 });
  await wDw.pass();
  ok(wDw.restarts().length === 1, 'CONTROL: a copy without the dwell moves it back at 5 minutes ⇒ the dwell leg goes RED', wDw.restarts());
  // (r3319) RED: the MUST's three guards cut — the pool moves a record with no first model back, with NO model
  const NM1 = "  if (!record || !record.fromModel) return { to: null, why: 'no-first-model' };   // (r3319 MUST) the target is never a guess";
  const NM1F = "  if (!fam) return { to: null, why: 'family-unknown' };\n";   // (r3338 (2)) with no first model there is no family either: cut with the guard
  const NM2 = " && s2._poolFallback.fromModel ? s2._poolFallback : null;   // (r3319 MUST)";
  const NM3 = "  if (!rec.fromModel) { console.log(`[pool] fallback back ${e.poolId}/${e.sid}: not moved — its first model is unknown (the target would be a guess)`); return { moved: false, why: 'no-first-model' }; }";
  const NM4 = "    if (verdictOnly && (!fam || (!staleDefault && memberServeLapsed(cur)))) return null;";
  const cutNm = anchored(anchored(anchored(anchored(anchored(ENG, NM1, '', 'no first-model guard'), NM1F, '', 'the verdict\'s family guard'), NM2, ' ? s2._poolFallback : null;   // (cut)', 'the judge takes any record'), NM3, '', 'the move back takes any record'), NM4, '', 'the verdict-only ask passes by the early returns');
  const wNmR = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', cutNm, 'eng-no-first-model') });
  wNmR.client(); heal(wNmR); onFbRec(wNmR, 'nm1', { fromModel: null });
  await wNmR.pass(); await until(wNmR, () => wNmR.restarts().length > 0, 12);
  ok(wNmR.restarts().length === 1 && !wNmR.restarts()[0].model, 'CONTROL: a copy without the MUST\'s guards moves a record with no first model back — with NO model (the saved configuration\'s guess) ⇒ the MUST\'s leg goes RED', wNmR.restarts());
  // (r3319 (8)) RED for NO FLAP: the dwell gate in the per-session pass cut ⇒ a conversation moved back is put on the fallback again inside its dwell
  const GATE = "if (!restartInFlight(s2, now) && now - dw >= FALLBACK_DWELL_MS) queueFallbackMove(poolId, sid, ds.to, 'pool', now);";
  const wNf = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, GATE, "if (!restartInFlight(s2, now)) queueFallbackMove(poolId, sid, ds.to, 'pool', now);", 'no dwell gate'), 'eng-no-flap-gate') });
  wNf.client(); heal(wNf); onFb(wNf, 'b1');
  await wNf.pass();
  const b1rN = wNf.mk('b1r', wNf.P, { claudeSessionId: 'cid-b1', _lastPtyDataAt: Date.now() });
  await wNf.pass();
  wall(wNf);
  await wNf.pass();
  ok(wNf.eng._fbQueue.has('b1r') || wNf.restarts().some((t) => t.serverId === 'b1r'), 'CONTROL: a copy without the dwell gate puts the conversation the pool just moved back onto the fallback again ⇒ the NO FLAP leg goes RED', { queue: [...wNf.eng._fbQueue.keys()], dwell: b1rN._poolFallbackDwell });
  const FIRST_MODEL = "toModel: rec.fromModel || null, fallbackOnly: false, back: true, removed: removed2 } };";
  const wF = world({ cross: 'allow', engM: M.load('src/server/usage-pool-engine.js', anchored(ENG, FIRST_MODEL, "toModel: rec.toModel || null, fallbackOnly: false, back: true, removed: removed2 } };", 'the provider\'s model kept on the way back'), 'eng-no-first-model') });
  wF.client(); heal(wF); onFb(wF, 'ff1');
  await wF.pass();
  ok(wF.restarts().length === 1 && wF.restarts()[0].model === 'deepseek-chat', 'CONTROL: a copy that keeps the provider\'s model on the way back restarts on deepseek-chat ⇒ the first-model leg goes RED', wF.restarts());

}

report();
