#!/usr/bin/env node
// WHO MAY HAVE A WEB LOGIN FILLED (the owner 2026-11-17: «这个界面逻辑有点问题 最上面那个选项会影响下面的表格内容，容易引起困惑。另外这里
// 配置apply之后似乎会直接对所有网站login生效？») — the PURE rules and the hub's real store, no browser, no network.
//   ① «BY WHAT» (src/browser-login.js byWhatOf — the fill's own rule, GM.admits over each scope's rows): a conversation admitted by THIS
//      login's row, by a group in the any-account row, by the star row; a group; Everyone. RED: the dialog as it was drew a subject the
//      fill admits through the star row UNTICKED — and a copy of lockedFor that keeps only its own scope loses the lock.
//   ② THE DIALOGS' MODEL (src/lib/login-grant-model.js): the roster from the hub's subjects, the keys, the locked rows per dialog, the
//      stored row, what Save sends (the same two routes; «除了» with a group / Everyone), the header's line, what a login holds.
//   ③ THE PICKER's LOCKED MAP (src/lib/principal-picker-model.js lockedMap).
//   ④ THE HUB's REAL STORE (src/server/browser-logins.js over the real vault engine and grants store): list({subjects}) answers
//      `byWhat` per login; the grant route takes the exceptions for a group or Everyone (and refuses them for a conversation).
//   ⑤ WHAT THE LOGIN HOLDS (主开发 20:28Z — the bound two-step code first, with a door to change or unbind it): BL.totpBoundRecord and
//      the store's bindTotp over the real vault — the password, its slots and `rev` untouched; refusals by name. RED: the only road
//      before was the add door, which cannot change the binding without the password. The row module still imports no dialog.
//   ⑦ THE WALK (主开发 00:28Z): ONE drawing (drawPlan) and what a person reads from it (pageSays) held equal to the fill's verdict for
//      every small case of the three rows — 2187 cases, 13122 subjects; RED controls = the follow-up's two faults compiled back in.
//   ⑥ THE CURE (主开发 22:41Z, three musts + shoulds): «by what» names Everyone and its Task Groups (RED: the empty-facts probe); the
//      dialog's plan — Everyone as ONE line, its own grant removable beside a wider one, a stopped conversation a wider row holds;
//      the agent's three refusals name the header's doors; the picker skips a locked row; a hidden press in the dialogs stays hidden.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : ''}`); } };
const BL = require('../src/browser-login.js');
const GM = require('../src/grant-model.js');
const M = await import(pathToFileURL(path.join(REPO, 'src/lib/login-grant-model.js')).href);
const PM = await import(pathToFileURL(path.join(REPO, 'src/lib/principal-picker-model.js')).href);
/** an in-memory copy of a src ES module with `from` replaced — its anchor exactly once */
async function esMutant(rel, from, to) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  if (src.split(from).length !== 2) throw new Error(`mutant: ${rel} holds ${JSON.stringify(from.slice(0, 60))} not exactly once`);
  return import('data:text/javascript;base64,' + Buffer.from(src.split(from).join(to)).toString('base64'));
}

const ORIGIN = 'https://shop.example.test', LOGIN = `${ORIGIN}#alice`;
const conv = (key) => ({ kind: 'conversation', key }), group = (id) => ({ kind: 'group', id }), everyone = { kind: 'everyone' };
const row = (resource, to, except = []) => ({ door: BL.DOOR, resource, to, except });
const subjects = { sessions: [{ subject: 'session:conv-a', name: 'A', groupIds: [] }, { subject: 'session:conv-b', name: 'B', groupIds: [] }, { subject: 'session:conv-c', name: 'C', groupIds: ['g1'] }, { subject: 'session:conv-d', name: 'D', groupIds: [] }], groups: [{ subject: 'group:g1', name: 'Shop work' }] };
const rows = { thisAccount: [row(LOGIN, [conv('conv-a')])], anyAccount: [row(`${ORIGIN}#*`, [group('g1')])], anySite: [row('*', [conv('conv-b'), conv('conv-a')])] };

console.log('① «BY WHAT» — every scope that admits each subject, by the fill\'s own rule');
{
  const bw = BL.byWhatOf({ rows, subjects: BL.byWhatSubjects(subjects) });
  ok(JSON.stringify(bw['conversation:conv-a']) === '["this-account","any-site"]' && JSON.stringify(bw['conversation:conv-b']) === '["any-site"]' && JSON.stringify(bw['conversation:conv-c']) === '["any-account"]'
     && JSON.stringify(bw['group:g1']) === '["any-account"]' && !('conversation:conv-d' in bw) && !('everyone' in bw),
    'a conversation by THIS login\'s row (and the star row), one by the star row alone, one through its Task Group in the any-account row, the group itself; nobody else; Everyone not held', bw);
  // THE FILL'S OWN VERDICT for the same login — what «by what» must agree with
  const fillAdmits = (key, groupIds = []) => GM.admits(BL.grantResources(ORIGIN, 'alice').flatMap((r) => (r === LOGIN ? rows.thisAccount : r === `${ORIGIN}#*` ? rows.anyAccount : rows.anySite)), { conversationKey: key, groupIds }).ok;
  ok(['conv-a', 'conv-b'].every((k) => fillAdmits(k)) && fillAdmits('conv-c', ['g1']) && !fillAdmits('conv-d') && Object.keys(bw).filter((k) => k.startsWith('conversation:')).sort().join() === 'conversation:conv-a,conversation:conv-b,conversation:conv-c',
    '«by what» names exactly the conversations the FILL admits for this login (GM.admits over grantResources — the same call)');
  // RED: the dialog as it was — its ticks were THIS row's `to` alone, so B (admitted by the star row) showed UNTICKED
  const oldTicks = new Set(rows.thisAccount[0].to.map(GM.principalKey));
  const locked = M.lockedFor(bw, 'this-account');
  ok(fillAdmits('conv-b') && !oldTicks.has('conversation:conv-b') && locked.some((l) => l.key === 'agent:conv-b' && l.through === 'any-site'),
    'RED (the dialog as it was): the fill admits B through the star row, yet the old dialog drew B UNTICKED — now B is ticked and LOCKED «through: any site»', locked);
  const LM = await esMutant('src/lib/login-grant-model.js', '.filter((s) => SCOPES.indexOf(s) > at);', '.filter((s) => SCOPES.indexOf(s) === at);');
  ok(!LM.lockedFor(bw, 'this-account').some((l) => l.key === 'agent:conv-b'), 'RED: a copy of lockedFor that keeps only its own scope loses B\'s lock (the leg above goes red on it)');
}

console.log('② THE DIALOGS\' MODEL — one dialog, one resource; the wider rows locked «through»; what Save sends');
{
  const bw = BL.byWhatOf({ rows, subjects: BL.byWhatSubjects(subjects) });
  const roster = M.rosterFromSubjects(subjects);
  ok(roster.map((r) => r.key).join() === 'group:g1,agent:conv-a,agent:conv-b,agent:conv-c,agent:conv-d' && roster.find((r) => r.key === 'agent:conv-c').groupNames[0] === 'Shop work' && M.pickKeyOf('conversation:conv-a') === 'agent:conv-a' && M.pickKeyOf('everyone') === M.EVERYONE_KEY,
    'the picker\'s rows come from the hub\'s own subjects (the keys «by what» names): groups first, a conversation with its Task Group');
  const atLogin = M.lockedFor(bw, 'this-account'), atSite = M.lockedFor(bw, 'any-account'), atStar = M.lockedFor(bw, 'any-site');
  ok(atLogin.map((l) => `${l.key}>${l.through}`).sort().join() === 'agent:conv-a>any-site,agent:conv-b>any-site,agent:conv-c>any-account,group:g1>any-account' && atSite.map((l) => l.key).sort().join() === 'agent:conv-a,agent:conv-b' && atStar.length === 0,
    'in a login\'s dialog every subject a WIDER row admits is locked, through the narrowest wider row (A too: also the star row\'s); in the site\'s dialog only the star row\'s; in the star\'s none', { atLogin, atSite });
  const grants = [{ resource: LOGIN, scope: 'this-account', to: [conv('conv-a')], except: [] }, { resource: '*', scope: 'any-site', to: [conv('conv-b')], except: [] }];
  ok(JSON.stringify(M.rowAt(grants, LOGIN)) === JSON.stringify({ to: [conv('conv-a')], except: [] }) && M.rowAt(grants, `${ORIGIN}#*`).to.length === 0, 'the stored row is ONE resource\'s — never another scope\'s');
  const plan = M.savePlan({ to: [conv('conv-a'), group('g1')], except: [] }, { to: [group('g1'), conv('conv-d'), everyone], except: [conv('conv-c')] });
  ok(JSON.stringify(plan.grant) === JSON.stringify([{ subject: 'group:g1', except: ['session:conv-c'] }, { subject: 'session:conv-d' }, { subject: 'everyone', except: ['session:conv-c'] }]) && JSON.stringify(plan.ungrant) === '["conversation:conv-a"]',
    'Save sends the difference through the SAME two routes: a new conversation, Everyone and an existing group whose «除了» changed carry the exceptions; a removed one is ungranted by its key', plan);
  ok(M.savePlan({ to: [conv('conv-a')], except: [] }, { to: [conv('conv-a')], except: [] }).grant.length === 0, 'an unchanged pick sends nothing');
  const entries = [{ origin: ORIGIN, user: 'alice', grants }, { origin: ORIGIN, user: 'bob', grants: [{ resource: `${ORIGIN}#*`, scope: 'any-account', to: [group('g1')], except: [] }] }, { origin: 'https://mail.example.test', user: 'x', grants: [] }];
  const sum = M.wideSummary(entries);
  ok(M.sitesOf(entries).join() === 'https://mail.example.test,https://shop.example.test' && sum.anySite.length === 1 && sum.anySite[0].key === 'conv-b' && sum.anyAccountSites.join() === ORIGIN,
    'the header\'s line names what the wider rows hold — the star row\'s who, the sites with an any-account row; the any-account door chooses among the vault\'s sites', sum);
  const h = M.heldFacts({ totpName: 'shop-2fa', hasPrevious: true, previousReplacedAt: 5, pending: 'change', pendingCreatedAt: 7, password: 'never' });
  const h0 = M.heldFacts({ pendingCreatedAt: 7 });
  ok(h.totpName === 'shop-2fa' && h.hasPrevious && h.previousReplacedAt === 5 && h.pending === 'change' && h.pendingCreatedAt === 7 && !JSON.stringify(h).includes('never') && h0.totpName === '' && h0.pendingCreatedAt === 0,
    'what a login holds besides its secret — the two-step code by NAME (or none), the slots it keeps WITH WHEN — never a value', { h, h0 });
}

console.log('③ THE PICKER\'S LOCKED MAP');
{
  const door = { label: 'Any site…', run: () => 1 };
  const m = PM.lockedMap([{ key: 'agent:conv-b', why: 'through: any site', door }, { key: '' }, null, { key: 'group:g1', why: 'x', door: { label: 'no run' } }]);
  ok(m.size === 2 && m.get('agent:conv-b').door.label === 'Any site…' && m.get('group:g1').door === null && PM.lockedMap(null).size === 0,
    'locked entries by key (a door only with its press; unknown shapes dropped) — a caller that passes none gets none', [...m.keys()]);
  const PP = fs.readFileSync(path.join(REPO, 'src/lib/principal-picker.js'), 'utf8');
  ok(/if \(lockedNow\(\)\.has\(k\)\) return;/.test(PP) && /pp-chip-locked/.test(PP) && /if \(lk\.has\(k\)\) continue;/.test(PP),
    'the picker never picks or unpicks a locked key, draws it as a chip with NO ✕ (its why and its door), and never draws it twice');
}

console.log('④ THE HUB\'S REAL STORE — `byWhat` on the list; «除了» on the grant route');
{
  const VE = require('../src/server/vault-engine.js'), GS = require('../src/server/grants-store.js'), Lm = require('../src/server/browser-logins.js');
  const ROOT = scratch('lgd-model'); fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
  const eng = VE.create({ dataDir: ROOT, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
  await eng.setup(['Lgd', 'Model', String(process.pid), '#9'].join(''));
  const g = GS.create({ memory: true });
  const lg = Lm.create({ vault: eng, grants: () => g, log: () => { }, forYou: { add: () => 'fy-1', resolve() { } } });
  lg.addOwn({ origin: ORIGIN, username: 'alice', password: ['pw', String(process.pid), 'x'].join('-') }, { who: 'owner' });
  const name = `web-login:${LOGIN}`;
  const r1 = lg.grant(name, 'this-account', 'session:conv-a'), r2 = lg.grant(name, 'any-site', 'session:conv-b'), r3 = lg.grant(name, 'any-account', 'group:g1', { except: ['session:conv-c'] });
  const bad = lg.grant(name, 'this-account', 'session:conv-d', { except: ['session:conv-c'] });
  const list = lg.list({ subjects });
  const e = list.entries.find((x) => x.name === name) || {};
  const siteRow = (e.grants || []).find((x) => x.resource === `${ORIGIN}#*`) || {};
  ok(r1.ok && r2.ok && r3.ok && !bad.ok && bad.code === 'bad_except' && (siteRow.except || []).map(GM.principalKey).join() === 'conversation:conv-c',
    'the grant route takes the exceptions for a Task Group (the row keeps them: «除了» C) — and refuses them for a conversation by name (bad_except)', { siteRow, bad: bad.code });
  ok(e.byWhat && JSON.stringify(e.byWhat['conversation:conv-b']) === '["any-site"]' && JSON.stringify(e.byWhat['group:g1']) === '["any-account"]' && !('conversation:conv-c' in e.byWhat) && JSON.stringify(e.byWhat['conversation:conv-a']) === '["this-account"]',
    'the list answers `byWhat` per login, by the fill\'s own rule over the store: C, «除了» under its group, is admitted by NO row', e.byWhat);
  const r4 = lg.grant(name, 'any-account', 'group:g1', { except: [] });
  const after = ((lg.list({ subjects }).entries.find((x) => x.name === name) || {}).grants || []).find((x) => x.resource === `${ORIGIN}#*`) || {};
  ok(r4.ok && (after.except || []).length === 0 && (after.to || []).length === 1, 'a held group\'s «除了» changes through the same route (an empty list clears it) — no second row', after);
  ok(!('byWhat' in (lg.list().entries.find((x) => x.name === name) || {})), 'a list asked without subjects answers as before (no field)');
}

console.log('⑤ WHAT THE LOGIN HOLDS — its two-step code bound or unbound by name, nothing else touched');
{
  const base = BL.newRecord({ origin: ORIGIN, username: 'alice', password: ['pw', String(process.pid), 'y'].join('-'), source: 'owner', now: 1, rev: 3 });
  const bound = BL.totpBoundRecord(base, 'shop-2fa'), unbound = BL.totpBoundRecord(bound, null);
  const legacy = BL.totpBoundRecord({ ...base, totp: 'old-2fa' }, '');
  const same = (a, b) => a.rev === b.rev && JSON.stringify(a.current) === JSON.stringify(b.current) && JSON.stringify(a.previous) === JSON.stringify(b.previous) && JSON.stringify(a.pending) === JSON.stringify(b.pending);
  ok(bound.totpName === 'shop-2fa' && !('totpName' in unbound) && !('totpName' in legacy) && same(bound, base) && same(unbound, base) && BL.totpBoundRecord(base, '../x') === null && BL.totpBoundRecord(null, 'a') === null,
    'BL.totpBoundRecord binds a two-step name or unbinds it (the legacy spelling too); the password, its slots and rev stay; a non-name or a non-record ⇒ null');
  const VE = require('../src/server/vault-engine.js'), GS = require('../src/server/grants-store.js'), Lm = require('../src/server/browser-logins.js');
  const ROOT = scratch('lgd-held'); fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
  const eng = VE.create({ dataDir: ROOT, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
  const pw2 = ['Lgd', 'Held', String(process.pid), '#9'].join('');
  await eng.setup(pw2);
  const audits = [];
  const vault = new Proxy(eng, { get: (o, k) => (k === 'audit' ? (ev, x) => { audits.push([ev, x]); return o.audit?.(ev, x); } : o[k]) });
  const lg = Lm.create({ vault, grants: () => GS.create({ memory: true }), log: () => { }, forYou: { add: () => 'fy-1', resolve() { } } });
  const pw = ['pw', String(process.pid), 'z'].join('-');
  lg.addOwn({ origin: ORIGIN, username: 'alice', password: pw }, { who: 'owner' });
  lg.addOwn({ origin: ORIGIN, username: 'alice', password: pw + '2' }, { who: 'owner' });   // a previous password kept
  eng.secretPut('totp:shop-2fa', 'stand-in');   // the store reads names only
  const name = `web-login:${LOGIN}`;
  const recOf = () => BL.recordOf(eng.secretGet(name).value.toString('utf8'));
  const before = recOf();
  const entryOf = () => lg.list().entries.find((x) => x.name === name) || {};
  const r1 = lg.bindTotp(name, 'shop-2fa', { who: 'owner' });
  const mid = recOf(), e1 = entryOf();
  ok(r1.ok && r1.changed && e1.totpName === 'shop-2fa' && mid.current.password === pw + '2' && mid.previous.password === pw && mid.rev === before.rev && e1.hasPrevious,
    'bindTotp binds a two-step code the vault holds — the list names it; the password, the kept previous one and rev unchanged', { r1, rev: [before.rev, mid.rev] });
  ok(audits.some(([ev, x]) => ev === 'vault-web-login-totp' && x.why === name && x.totp === 'shop-2fa' && !JSON.stringify(x).includes(pw)), 'ONE audit line — the entry and the name, never a value', audits.map((a) => a[0]));
  const unknown = lg.bindTotp(name, 'not-here'), shaped = lg.bindTotp(name, 'a b'), gone = lg.bindTotp(`web-login:${ORIGIN}#nobody`, 'shop-2fa');
  ok(unknown.code === 'bad_totp' && shaped.code === 'bad_totp' && gone.code === 'not_found' && recOf().totpName === 'shop-2fa', 'refusals by name: a code the vault does not hold, a non-name (bad_totp); no such login (not_found) — nothing written', [unknown.code, shaped.code, gone.code]);
  const r2 = lg.bindTotp(name, null), r3 = lg.bindTotp(name, '');
  ok(r2.ok && r2.changed && !('totpName' in recOf()) && !('totpName' in entryOf()) && r3.ok && r3.changed === false && recOf().current.password === pw + '2',
    'bindTotp(null) UNBINDS it (the row then says «none»); unbinding again changes nothing; the password stays', { r2, r3 });
  const noPw = lg.addOwn({ origin: ORIGIN, username: 'alice', password: '', totpName: 'shop-2fa' });
  ok(noPw.code === 'value_required', 'RED (the road as it was): the add door was the only write of the binding, and it refuses without the password (re-saving with it would move the current password into previous)', noPw.code);
  eng.lock('test');
  ok(lg.bindTotp(name, 'shop-2fa').code === 'vault_locked', 'a locked vault refuses by name (vault_locked) — the dialog\'s refusal line gives Unlock…');
  const ROW = fs.readFileSync(path.join(REPO, 'src/lib/vault-login-row.js'), 'utf8');
  const imports = ROW.split('\n').filter((l) => /^import /.test(l)).map((l) => (/from '([^']+)'/.exec(l) || [])[1]).sort();
  ok(JSON.stringify(imports) === JSON.stringify(['./i18n.js', './utils.js', './vault-totp-row.js']) && !/agoText/.test(ROW.split('\n').filter((l) => /^import /.test(l)).join('\n')),
    'the row module imports no dialog and nothing new (the paste box and the login card bundle it with a stubbed utils.js) — the window hands it `held` and the openers', imports);
}

console.log('⑥ THE CURE (主开发 22:41Z): Everyone and its groups by «by what»; one dialog draws what holds; the agent sent to the doors that exist');
{
  // MUST 1 — the star row holds Everyone: «by what» names Everyone and every Task Group (the probe has a key no row can hold)
  const star = { thisAccount: [row(LOGIN, [conv('conv-a')])], anyAccount: [], anySite: [row('*', [everyone], [conv('conv-d')])] };
  const bw = BL.byWhatOf({ rows: star, subjects: BL.byWhatSubjects(subjects) });
  ok(JSON.stringify(bw.everyone) === '["any-site"]' && JSON.stringify(bw['group:g1']) === '["any-site"]' && JSON.stringify(bw['conversation:conv-b']) === '["any-site"]' && JSON.stringify(bw['conversation:conv-a']) === '["this-account","any-site"]' && !('conversation:conv-d' in bw),
    'the star row holds Everyone (except D): «by what» names Everyone, the Task Group and every conversation through «any site» — D, left out, nowhere', bw);
  const probe = BL.byWhatSubjects(subjects).find((x) => x.key === 'everyone');
  ok(!GM.admits(star.anySite, {}).ok && GM.admits(star.anySite, probe.facts).ok && !/^[A-Za-z0-9]/.test(BL.BY_WHAT_PROBE),
    'RED CONTROL (the probe as it was): Everyone probed with EMPTY facts is admitted by no row — the grant model counts an Everyone entry only for a caller with a key; the probe key starts with no letter or digit, so no row can hold it');
  const SUB6 = [{ key: 'everyone', groupIds: [] }, { key: 'group:g1', groupIds: [] }, { key: 'conversation:conv-a', groupIds: [] }, { key: 'conversation:conv-b', groupIds: [] }, { key: 'conversation:conv-c', groupIds: ['g1'] }, { key: 'conversation:conv-d', groupIds: [] }];
  // should (d): ONE line for Everyone — the subjects it covers through the same row are not drawn one by one (the one drawing: drawPlan)
  const plan = M.drawPlan({ byWhat: bw, scope: 'this-account', rows: { 'this-account': { to: [conv('conv-a')], except: [] }, 'any-account': null, 'any-site': { to: [everyone], except: [conv('conv-d')] } }, subjects: SUB6 });
  ok(plan.locked.length === 1 && plan.locked[0].key === 'everyone' && plan.locked[0].through === 'any-site' && JSON.stringify(plan.everyone.except) === '["conversation:conv-d"]' && plan.leftOut['conversation:conv-d'] === 'any-site',
    'in a login\'s dialog the star row\'s Everyone is ONE locked line «through: any site · 除了 D» — not a chip per conversation; D, which no row admits, is marked with the row that leaves it out', plan);
  // should (a): a subject with its OWN grant here AND a wider one is drawn ticked and removable, «also through» beside it
  ok(JSON.stringify(plan.selected) === '["conversation:conv-a"]' && plan.also['conversation:conv-a'] === 'any-site' && !plan.locked.some((l) => l.key === 'conversation:conv-a'),
    'A holds this login\'s own row AND the star row: removable here (its own grant stays once the wider one goes), «also through: any site»', plan.also);
  const mixed = M.drawPlan({ byWhat: { everyone: ['any-site'], 'group:g1': ['any-account'], 'conversation:conv-b': ['any-site'] }, scope: 'this-account', rows: { 'this-account': null, 'any-account': { to: [group('g1')], except: [] }, 'any-site': { to: [everyone], except: [] } }, subjects: SUB6 });
  ok(mixed.locked.map((l) => `${l.key}>${l.through}`).sort().join() === 'everyone>any-site,group:g1>any-account',
    'a subject through a NARROWER wider row (the group through «any account») keeps its own line beside Everyone\'s', mixed.locked);
  // should (b): a conversation a wider row holds that is not running is a subject too
  const stoppedRows = { thisAccount: [], anyAccount: [row(`${ORIGIN}#*`, [conv('conv-gone')])], anySite: [] };
  ok(JSON.stringify(BL.byWhatOf({ rows: stoppedRows, subjects: BL.byWhatSubjects(subjects) })['conversation:conv-gone']) === '["any-account"]',
    'a conversation the any-account row names that is not running is probed by its own key — the dialog draws it «not running now», locked');
  const exRows = { thisAccount: [row(LOGIN, [everyone], [conv('conv-gone')])], anyAccount: [], anySite: [row('*', [everyone])] };
  ok(JSON.stringify(BL.byWhatOf({ rows: exRows, subjects: BL.byWhatSubjects(subjects) })['conversation:conv-gone']) === '["any-site"]',
    'a stopped conversation a row names only in its «除了» is probed too — left out here, the star row still admits it (the dialog says «仍经由»)');
  // MUST 3: the agent's refusals name the doors that exist — «Use for…» only for that account, the header's two for the wider grants
  const entries = [{ name: `web-login:${LOGIN}`, origin: ORIGIN, user: 'alice', owner: null }];
  const words = (spec, grantRows, keys = ['conv-x']) => (BL.fillVerdict({ tabOrigin: ORIGIN, spec, entries, grantRows, facts: { conversationKeys: keys }, vaultState: 'unlocked' }) || {}).error || '';
  const notGranted = words(BL.parseVaultFillSpec('shop.example.test#alice/password'), () => []);
  const register = words(BL.parseVaultFillSpec('new:shop.example.test#bob/password', { generate: true }), () => []);
  const excepted = words(BL.parseVaultFillSpec('shop.example.test#alice/password'), (r) => (r === '*' ? [row('*', [everyone], [conv('conv-x')])] : []));
  const header = (w) => /«Any account on a site…»/.test(w) && /«Any site…»/.test(w);
  ok(header(notGranted) && /the login's «Use for…» for that account/.test(notGranted) && header(register) && !/Use for…/.test(register) && header(excepted),
    'the three refusals send the agent to the doors that exist — the login\'s «Use for…» for that account only, the Web logins header\'s «Any account on a site…» / «Any site…» for the wider grants', { notGranted, register, excepted });
  const PP = fs.readFileSync(path.join(REPO, 'src/lib/principal-picker.js'), 'utf8');
  ok(/if \(!r\.disabled && !lkNow\.has\(String\(r\.key\)\)\) visibleKeys\.push/.test(PP) && /pp-lock-door/.test(PP),
    'should (c): ↑/↓ and Enter skip a locked row; a locked list row carries its door as its chip does');
  const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  ok(/\.vw-login-grant-dialog \[hidden\], \.vw-login-site-pick \[hidden\], \.vw-login-totp-dialog \[hidden\] \{ display: none; \}/.test(CSS),
    'MUST 2: the dialogs are form windows outside the Vault window\'s `.vw [hidden]` — their own rule keeps a hidden press hidden (.vw-btn sets display)');
}

console.log('⑦ THE WALK (主开发 00:28Z): for EVERY small case of the three rows, what the page says about each subject equals the fill\'s verdict');
{
  // THE CASES: each of the three rows (this account · any account on the site · any site) is nobody, one conversation (A), Everyone
  // (with no «除了», or D, or M, or the Task Group G), or G (with no «除了», or M — its member — or D) — 9 × 9 × 9 = 729 cases, each
  // drawn as each of the three dialogs. THE SUBJECTS: Everyone, G, A, D, M (a member of G), S (a stranger).
  const A = conv('conv-a'), D = conv('conv-d'), Mm = conv('conv-m'), G = group('g1');
  const OPTIONS = [null, { to: [A], except: [] }, ...[[], [D], [Mm], [G]].map((ex) => ({ to: [everyone], except: ex })), ...[[], [Mm], [D]].map((ex) => ({ to: [G], except: ex }))];
  const SUBJ = { sessions: ['a', 'd', 'm', 's'].map((x) => ({ subject: `session:conv-${x}`, name: x.toUpperCase(), groupIds: x === 'm' ? ['g1'] : [] })), groups: [{ subject: 'group:g1', name: 'G' }] };
  const probes = BL.byWhatSubjects(SUBJ);
  const SUBJECTS = [{ key: 'everyone', groupIds: [] }, { key: 'group:g1', groupIds: [] }, ...['a', 'd', 'm', 's'].map((x) => ({ key: `conversation:conv-${x}`, groupIds: x === 'm' ? ['g1'] : [] }))];
  const RES = { 'this-account': LOGIN, 'any-account': `${ORIGIN}#*`, 'any-site': '*' };
  const walk = (Mod) => {
    let cases = 0, checks = 0, wrong = 0; const first = [];
    for (const ta of OPTIONS) for (const aa of OPTIONS) for (const as of OPTIONS) {
      const all = { 'this-account': ta, 'any-account': aa, 'any-site': as };
      const raw = (sc) => (all[sc] ? [row(RES[sc], all[sc].to, all[sc].except)] : []);
      const bw = BL.byWhatOf({ rows: { thisAccount: raw('this-account'), anyAccount: raw('any-account'), anySite: raw('any-site') }, subjects: probes });
      for (const scope of M.SCOPES) {
        const at = M.SCOPES.indexOf(scope);
        const rows = {};
        for (const sc of M.SCOPES) if (M.SCOPES.indexOf(sc) >= at) rows[sc] = all[sc] || (sc === scope ? { to: [], except: [] } : null);
        const plan = Mod.drawPlan({ byWhat: bw, scope, rows, subjects: SUBJECTS });
        cases++;
        for (const s of SUBJECTS) {
          // THE VERDICT: the fill's own (GM.admits over each row) — at this dialog's scope and wider, narrowest first
          const verdict = M.SCOPES.filter((sc) => M.SCOPES.indexOf(sc) >= at && (bw[s.key] || []).includes(sc));
          const page = Mod.pageSays(plan, s);
          const ownHere = (rows[scope].to || []).map(M.principalKeyOf).includes(s.key);
          let good = page.admitted === (verdict.length > 0) && (!page.admitted || page.through === verdict[0]);
          // the drawing ticks as THIS row's own exactly what the row holds — never a member admitted through its Task Group / Everyone
          if (good) good = plan.selected.includes(s.key) === ownHere;
          // a subject this row holds says ALSO the narrowest wider row that admits it — Everyone included (MUST 1)
          if (good && ownHere) good = (page.also || null) === (verdict.filter((sc) => sc !== scope)[0] || null);
          // Everyone admitted wider: the drawing names THAT row's exceptions (on its line, or beside its own chip)
          if (good && s.key === 'everyone' && verdict.some((sc) => sc !== scope)) {
            const x = verdict.find((sc) => sc !== scope);
            good = !!plan.everyone && plan.everyone.through === x && JSON.stringify([...plan.everyone.except].sort()) === JSON.stringify((rows[x].except || []).map(M.principalKeyOf).sort());
          }
          checks++;
          if (!good) { wrong++; if (first.length < 3) first.push({ scope, rows: all, subject: s.key, verdict, page }); }
        }
      }
    }
    return { cases, checks, wrong, first };
  };
  const w = walk(M);
  ok(w.cases === 2187 && w.checks === 13122 && w.wrong === 0, `THE INVARIANT, by exhaustion: ${w.cases} cases, ${w.checks} subjects — what the page says (admitted or not, through which row, «also» and the Everyone line's exceptions) equals the fill's verdict in every one`, w.first);
  // THE RED CONTROLS — this round's two faults, compiled back in
  const F1 = await esMutant('src/lib/login-grant-model.js', "if (held.has(k)) { if (w.length) plan.also[k] = w[0]; continue; }", "if (held.has(k)) { if (w.length && k !== 'everyone') plan.also[k] = w[0]; continue; }");
  const r1 = walk(F1);
  ok(r1.wrong > 0 && r1.first.some((f) => f.subject === 'everyone'), `RED CONTROL (MUST 1 — Everyone held here and wider, its «also through» not drawn): the walk names it (${r1.wrong} wrong)`, r1.first[0]);
  const F2 = await esMutant('src/lib/login-grant-model.js', "if (k !== 'everyone' && !outHere && plan.everyone", "if (k !== 'everyone' && plan.everyone");
  const r2 = walk(F2);
  ok(r2.wrong > 0 && r2.first.some((f) => f.page.admitted === false && f.verdict.length > 0), `RED CONTROL (MUST 2 — a conversation THIS row leaves out folded away while a wider row admits it): the page says «left out», the fill admits it (${r2.wrong} wrong)`, r2.first[0]);
  const F3 = await esMutant('src/lib/login-grant-model.js', "const held = new Set(keys(here.to)), exceptHere", "const held = new Set(Object.keys(byWhat).filter((x) => (byWhat[x] || []).includes(scope))), exceptHere");
  const r3 = walk(F3);
  ok(r3.wrong > 0, `RED CONTROL (the «also» test as it was — «by what»'s own scope stands for the row's own grant): a member admitted through its Task Group is drawn as this row's own chip; the walk names it (${r3.wrong} wrong)`, r3.first[0]);
  // the dialog draws from the plan and nothing else
  const G2 = fs.readFileSync(path.join(REPO, 'src/lib/vault-login-grants.js'), 'utf8');
  ok(/const plan = drawPlan\(\{ byWhat: byWhat \|\| \{\}, scope, rows: rowsBy, subjects \}\);/.test(G2) && /hint: hintOf\.get\(EVERYONE_KEY\) \|\|/.test(G2) && !/lockedFor\(|lockedPlan\(/.test(G2)
    && /\|\| \{\}\)\.grants \|\| \[\];/.test(G2),
    'WIRING: the dialog draws the plan — its locked lines, its hints, the Everyone row\'s own text («also through» + the exceptions) — and reads no other verdict; a login missing from the list falls back to NO rows (never another site\'s)');
}

console.log(fail ? `\nFAIL (${fail} failed, ${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
