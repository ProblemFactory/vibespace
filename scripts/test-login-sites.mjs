#!/usr/bin/env node
// test-login-sites — ONE LOGIN, SEVERAL SITES (lane login-request-card; the owner 2026-11-17: «这两个login其实是同一个，似乎没法让agent复用
// （在已有login上添加新的网站）»; 主开发's word 20:05Z — the shape, Q1–Q3, the hub side on the release). FAST, in-process: the PURE rules
// (src/browser-login.js — sitesOf / userOnSite / loginResources / addSiteVerdict / removeSiteVerdict / mergeVerdict / siteWords and
// the fill's verdict over them) and THE STORE (src/server/browser-logins.js addSite / removeSite / merge / siteWordsFor / resolveFill)
// over a REAL vault engine on scratch data and the grants store in memory. Every law a leg with a red control by mutation:
// a site added but not on the login's list never fills; a pair of site and user in two logins is refused; the four rows, each with a
// leg; a merge loses no grant and widens none; the secret never in an audit line; today's one-site logins read as they are.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info.slice(0, 900) : JSON.stringify(info).slice(0, 900)); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const loadMutated = (rel, mutate, requireOf = null) => { const file = path.join(REPO, rel); const m = { exports: {} }; const base = createRequire(file); new Function('module', 'exports', 'require', '__filename', '__dirname', mutate(read(rel)))(m, m.exports, requireOf ? (id) => requireOf(id, base) : base, file, path.dirname(file)); return m.exports; };
const BL = require(path.join(REPO, 'src/browser-login.js'));
const GM = require(path.join(REPO, 'src/grant-model.js'));

const LMS = 'https://lms.school.test', SSO = 'https://sso.school.test', PORTAL = 'https://portal.school.test', OTHER = 'https://lms-school.example';
const rec = (o = {}) => BL.recordOf({ v: 1, schema: 2, rev: 1, origin: LMS, username: 'jdoe', current: { password: 'Pw!' + 'x'.repeat(12), source: 'owner', strength: 'unknown', setAt: 1 }, previous: null, pending: null, ...o });

console.log('① THE PURE RULES — the sites of a login, the user each signs in under, the four rows');
{
  const one = rec();
  ok(JSON.stringify(BL.loginResources({ origin: LMS, user: 'jdoe' }, LMS)) === JSON.stringify(BL.grantResources(LMS, 'jdoe')), 'a login with ONE site asks today\'s three rows — every existing grant reads as it is', BL.loginResources({ origin: LMS, user: 'jdoe' }, LMS));
  const two = rec({ origins: [SSO], siteUsers: { [SSO]: 'JDoe@School.test' } });
  ok(JSON.stringify(BL.sitesOf(two)) === JSON.stringify([{ origin: LMS, user: 'jdoe' }, { origin: SSO, user: 'JDoe@School.test' }]) && BL.userOnSite(two, SSO) === 'JDoe@School.test' && BL.userOnSite(two, PORTAL) === null,
    'its sites: the first, then each added one with the name it signs in under there (law 3); a site not on its list has no user', BL.sitesOf(two));
  ok(JSON.stringify(BL.loginResources({ ...two, user: 'jdoe' }, SSO)) === JSON.stringify([`${LMS}#jdoe`, `${SSO}#jdoe@school.test`, `${SSO}#*`, '*']), 'on an added site the fill asks FOUR rows: the login\'s own, that site\'s own (the name it signs in under), «any account on that site», «any site» (Q1)');
  ok(BL.recordOf({ ...two, siteUsers: { [PORTAL]: 'x', [SSO]: 'jdoe' } }).siteUsers === undefined, 'a per-site name is kept only for a site ON the list, and only when it differs from the login\'s own');
  ok(BL.registrableOf('lms.school.test') === 'school.test' && BL.registrableOf('a.b.co.uk') === 'b.co.uk' && BL.registrableOf('127.0.0.1') === '127.0.0.1', 'a host\'s registrable domain (the small public-suffix list the grant model keeps)');
  const sameDomain = BL.siteWords(one, SSO), lookalike = BL.siteWords(one, OTHER);
  const puny = BL.siteWords(one, 'https://xn--lms-school-ep9a.test', { decode: () => 'lms‐school.test' });
  ok(!sameDomain.lookalike && lookalike.lookalike && lookalike.lookalike.domain === 'lms-school.example' && lookalike.lookalike.loginDomains.join() === 'school.test' && puny.unicode === 'lms‐school.test' && puny.ascii === 'xn--lms-school-ep9a.test',
    'A LOOK-ALIKE IS SAID (主开发\'s addition 1): a site under ANOTHER registrable domain than every site of the login names both domains; a host that is not plain ASCII is shown with its ASCII form beside it', { sameDomain, lookalike, puny });
}

console.log('② THE ADD, THE REMOVE, THE MERGE — PURE verdicts');
{
  const one = rec();
  const entries = [{ name: BL.entryName(LMS, 'jdoe'), origin: LMS, user: 'jdoe' }, { name: BL.entryName(PORTAL, 'jdoe'), origin: PORTAL, user: 'jdoe' }];
  const add = BL.addSiteVerdict({ rec: one, name: entries[0].name, site: SSO, user: 'JDoe@School.test', entries });
  ok(add.ok && add.record.origins.join() === SSO && add.record.siteUsers[SSO] === 'JDoe@School.test' && add.record.current.password === one.current.password, 'the add keeps the ONE secret and writes the site (and the name it signs in under there)', add);
  const shapes = ['https://*.school.test', `${SSO}/login`, 'sso.school.test', `${SSO}?a=1`, 'http://sso.school.test', LMS].map((x) => BL.addSiteVerdict({ rec: one, name: entries[0].name, site: x, entries }));
  ok(shapes.every((v) => v.ok === false) && shapes.slice(0, 5).every((v) => v.code === 'login_bad_origin') && shapes[5].code === 'login_site_exists', 'EXACTLY THE SITE: a pattern, a path, a bare host, a query, plain http off this machine — refused by name; the login\'s own site is no second site', shapes.map((v) => v.code));
  const clash = BL.addSiteVerdict({ rec: one, name: entries[0].name, site: PORTAL, entries });
  ok(clash.ok === false && clash.code === 'login_exists' && clash.other === entries[1].name, 'A PAIR OF SITE AND USER IN TWO LOGINS IS REFUSED — the other login named (merge them instead)', clash);
  const clashMut = loadMutated('src/browser-login.js', (s) => s.replace("  const other = (entries || []).find((e) => e && e.name !== name && holdsPair(e, o, there));", '  const other = null;')).addSiteVerdict({ rec: one, name: entries[0].name, site: PORTAL, entries });
  ok(clashMut.ok === true, 'RED CONTROL: without the one-pair-one-login rule the same add lands — two logins would answer one site and user', clashMut);
  const full = BL.addSiteVerdict({ rec: rec({ origins: Array.from({ length: 8 }, (_, i) => `https://s${i}.school.test`) }), name: entries[0].name, site: SSO, entries });
  ok(full.ok === false && full.code === 'login_sites_full', 'a login keeps at most nine sites (the first + eight) — said', full);
  const rm = BL.removeSiteVerdict(add.record, SSO), rmFirst = BL.removeSiteVerdict(add.record, LMS), rmGone = BL.removeSiteVerdict(add.record, PORTAL);
  ok(rm.ok && !rm.record.origins && !rm.record.siteUsers && rmFirst.code === 'login_site_first' && rmGone.code === 'login_site_absent', 'the REMOVE takes an added site and its name away; the first site is the login itself; a site not on it is said', { rm: rm.ok, rmFirst, rmGone });
  const keep = rec(), other = rec({ origin: SSO, username: 'jdoe@school.test', current: { password: 'Other!' + 'y'.repeat(10), source: 'owner', strength: 'unknown', setAt: 2 }, totpName: 'school-2fa', origins: [PORTAL] });
  const m = BL.mergeVerdict({ keep, keepName: entries[0].name, other, otherName: BL.entryName(SSO, 'jdoe@school.test'), entries: [entries[0], { name: BL.entryName(SSO, 'jdoe@school.test'), origin: SSO, user: 'jdoe@school.test', origins: [PORTAL] }] });
  ok(m.ok && m.record.current.password === keep.current.password && m.record.origins.join() === `${SSO},${PORTAL}` && m.record.siteUsers[SSO] === 'jdoe@school.test' && m.record.siteUsers[PORTAL] === 'jdoe@school.test' && m.record.totpName === 'school-2fa',
    'THE MERGE keeps the kept login\'s secret; the other\'s sites join under the name each signs in under; its two-step code comes along when the kept one has none (law 5)', m);
  const mClash = BL.mergeVerdict({ keep: rec({ origins: [SSO], siteUsers: { [SSO]: 'someone' } }), keepName: entries[0].name, other, otherName: 'x', entries: [] });
  ok(mClash.ok === false && mClash.code === 'login_merge_clash', 'a site on both logins under two names is refused — removed from one first', mClash);
}

console.log('③ THE FILL\'S RULE — a site not on the login\'s list never fills; the four rows, each with a leg (PURE fillVerdict)');
{
  const L = { name: BL.entryName(LMS, 'jdoe'), origin: LMS, user: 'jdoe', origins: [SSO], siteUsers: { [SSO]: 'jdoe@school.test' } };
  const facts = { conversationKeys: ['conv-a'] };
  const row = (resource) => ({ door: BL.DOOR, resource, to: [{ kind: 'conversation', key: 'conv-a' }] });
  const verdict = (FV, tab, spec, rows) => FV({ tabOrigin: tab, spec: BL.parseVaultFillSpec(spec, { tabOrigin: tab }), entries: [L], grantRows: (r) => rows.filter((x) => x.resource === r), facts, vaultState: 'unlocked' });
  const fv = BL.fillVerdict;
  const legs = [
    ['the LOGIN\'s own row', row(`${LMS}#jdoe`)], ['the SITE\'s own row (what a merged login\'s grants named)', row(`${SSO}#jdoe@school.test`)],
    ['«any account on this site»', row(`${SSO}#*`)], ['«any site»', row('*')],
  ];
  for (const [name, r] of legs) {
    const v = verdict(fv, SSO, `${SSO.replace('https://', '')}#jdoe@school.test/password`, [r]);
    const res = r.resource;
    const muted = loadMutated('src/browser-login.js', (s) => s.replace('function loginResources(e, origin) {', `function loginResources(e, origin) { return loginResources0(e, origin).filter((x) => x !== ${JSON.stringify(res)}); }\nfunction loginResources0(e, origin) {`)).fillVerdict;
    const vr = verdict(muted, SSO, `${SSO.replace('https://', '')}#jdoe@school.test/password`, [r]);
    ok(v.ok && v.entry.name === L.name && v.user === 'jdoe@school.test' && vr.ok === false && vr.code === 'login_not_granted', `ON THE ADDED SITE ${name} admits the login (and the name typed is the site's own) — RED CONTROL: that row dropped from the four, refused`, { v: v.ok ? 'ok' : v, vr: vr.code });
  }
  const none = verdict(fv, SSO, `${SSO.replace('https://', '')}#jdoe@school.test/password`, []);
  ok(none.ok === false && none.code === 'login_not_granted', 'no row ⇒ refused by name');
  const siteRowOnFirst = verdict(fv, LMS, `${LMS.replace('https://', '')}#jdoe/password`, [row(`${SSO}#jdoe@school.test`)]);
  ok(siteRowOnFirst.ok === false, 'NONE WIDENED: a site\'s own row (a merged login\'s old grant) never admits the login on its OTHER sites', siteRowOnFirst);
  const offList = verdict(fv, PORTAL, `${PORTAL.replace('https://', '')}#jdoe/password`, [row('*')]);
  const offMut = loadMutated('src/browser-login.js', (s) => s.replace("function userOnSite(e, origin) { const s = sitesOf(e).find((x) => x.origin === origin); return s ? s.user : null; }", 'function userOnSite(e, origin) { const s = sitesOf(e)[0]; return s ? s.user : null; }')).fillVerdict;
  const offR = verdict(offMut, PORTAL, `${PORTAL.replace('https://', '')}#jdoe/password`, [row('*')]);
  ok(offList.ok === false && offList.code === 'login_no_entry' && offR.ok === true, 'A SITE ADDED BUT NOT ON THE LOGIN\'S LIST NEVER FILLS (even «any site» finds no login there) — RED CONTROL: a site lookup that ignores the list fills it', { offList, offR: offR.ok });
  const tabMismatch = verdict(fv, LMS, `${SSO.replace('https://', '')}#jdoe@school.test/password`, [row('*')]);
  ok(tabMismatch.ok === false && tabMismatch.code === 'login_phishing', 'the fence stays: a tab on another site than the one named is refused (login_phishing)', tabMismatch);
}

console.log('④ THE STORE over a REAL vault engine — the add, the fill on the added site, the merge, the remove, the audit lines');
{
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const GS = require(path.join(REPO, 'src/server/grants-store.js'));
  const Lm = require(path.join(REPO, 'src/server/browser-logins.js'));
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-login-sites-'));
  process.on('exit', () => { try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { } });
  const eng = VE.create({ dataDir: DATA, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
  await eng.setup('Sites#' + crypto.randomBytes(6).toString('hex'));
  const world = (mutate = null) => {
    const grants = GS.create({ memory: true });
    const M = mutate ? loadMutated('src/server/browser-logins.js', mutate) : Lm;
    return { grants, logins: M.create({ vault: eng, grants: () => grants, totpCode: (n) => (n === 'school-2fa' ? { ok: true, code: '482910' } : { ok: false }), forYou: { add() { return null; }, resolve() { }, list() { return []; } }, log: () => { } }) };
  };
  const PW1 = 'LmsPw!' + crypto.randomBytes(8).toString('hex'), PW2 = 'SsoPw!' + crypto.randomBytes(8).toString('hex');
  const audit = () => (fs.existsSync(path.join(DATA, 'vault-audit.jsonl')) ? fs.readFileSync(path.join(DATA, 'vault-audit.jsonl'), 'utf8') : '');
  const fill = (lg, tab, spec, conv) => lg.resolveFill({ tabOrigin: tab, spec, conv, actor: conv, facts: { conversationKeys: [conv] } });
  // the owner's picture: one account saved twice — for the school's course site, and (today, through the login card) for its sign-in site
  const run = async (mutate = null) => {
    for (const n of (eng.secretNames() || []).map((x) => x.name).filter((n) => n.startsWith('web-login:'))) eng.secretDrop(n);
    const w = world(mutate);
    eng.secretPut('totp:school-2fa', 'JBSWY3DPEHPK3PXP');
    w.logins.addOwn({ origin: LMS, username: 'jdoe', password: PW1, totpName: 'school-2fa' }, { who: 'owner' });
    w.logins.addOwn({ origin: SSO, username: 'jdoe@school.test', password: PW2 }, { who: 'owner' });
    w.logins.grant(BL.entryName(LMS, 'jdoe'), 'this-account', 'session:conv-a');
    w.logins.grant(BL.entryName(SSO, 'jdoe@school.test'), 'this-account', 'session:conv-m');
    return w;
  };
  const w = await run();
  const words = w.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), PORTAL);
  ok(words.ok && words.site === PORTAL && !words.lookalike && words.widens.login.length === 1 && GM.principalKey(words.widens.login[0]).includes('conv-a'), 'THE WORDS BEFORE THE PRESS name, by their grants, who may then have the login filled on the new site (Q1 — the grant follows the login)', words);
  const a0 = audit().length;
  const add = w.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: PORTAL }, { who: 'owner' });
  const line = audit().slice(a0);
  ok(add.ok && add.site === PORTAL && /"event":"vault-web-login-site-added"/.test(line) && line.includes(PORTAL) && !line.includes(PW1), 'THE PERSON\'S ADD writes the site through the store\'s one writer — ONE audit line, never the secret', { add, line });
  const f1 = fill(w.logins, PORTAL, 'portal.school.test#jdoe/password', 'conv-a');
  const fOtp = fill(w.logins, PORTAL, 'portal.school.test#jdoe/otp', 'conv-a');
  ok(f1.ok && f1.value === PW1 && f1.name === BL.entryName(LMS, 'jdoe') && fOtp.ok && fOtp.value === '482910', 'ONE ACCOUNT, TYPED ONCE (law 1): the login fills on its added site with its one secret; the bound two-step code serves that site too (law 5)', { f1: f1.ok ? 'ok' : f1, fOtp: fOtp.ok ? 'ok' : fOtp });
  const fOff = fill(w.logins, 'https://elsewhere.school.test', 'elsewhere.school.test#jdoe/password', 'conv-a');
  ok(fOff.ok === false, 'a site not on the login\'s list fills nothing', fOff);
  // THE MERGE: the sign-in site's login joins the course site's — its grant row stays on its site
  const m0 = audit().length;
  const mg = w.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
  const mline = audit().slice(m0);
  const gone = !eng.hasEntry(BL.entryName(SSO, 'jdoe@school.test'));
  const viaOwn = fill(w.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
  const userThere = fill(w.logins, SSO, 'sso.school.test#jdoe@school.test/user', 'conv-m');
  const notWidened = fill(w.logins, LMS, 'lms.school.test#jdoe/password', 'conv-m');
  ok(mg.ok && gone && /"event":"vault-web-login-merged"/.test(mline) && !mline.includes(PW1) && !mline.includes(PW2) && viaOwn.ok && viaOwn.value === PW1 && userThere.value === 'jdoe@school.test' && notWidened.ok === false,
    'A MERGE LOSES NO GRANT AND WIDENS NONE (law 6): the other login is gone, its grant still admits ITS site (the kept secret, the name it signs in under there), never the kept login\'s first site; one audit line, no secret', { mg, gone, viaOwn: viaOwn.ok ? 'ok' : viaOwn, notWidened: notWidened.ok });
  // THE REMOVE: an added site leaves, and its own row with it (a later login holding that pair must not inherit it)
  const rmv = w.logins.removeSite(BL.entryName(LMS, 'jdoe'), SSO, { who: 'owner' });
  const after = fill(w.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
  ok(rmv.ok && rmv.grantRemoved === `${SSO}#jdoe@school.test` && after.ok === false && /"event":"vault-web-login-site-removed"/.test(audit()), 'THE REMOVE: the site leaves the login and its own grant row goes with it — one audit line', { rmv, after: after.ok });
  const listed = w.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe'));
  ok(listed && Array.isArray(listed.sites) && listed.sites.map((x) => x.origin).join() === PORTAL && !JSON.stringify(listed).includes(PW1), 'the owner\'s list names each login\'s added sites (the row\'s sites line lands on lane cli-update-needs-nothing\'s row) — never a secret', listed && listed.sites);
  // (last: the red control's world re-makes both logins in the same vault)
  const wr = await run((s) => s.replace("        const d = vault.secretDrop(otherName);", "        const d = vault.secretDrop(otherName); try { const g = store(); for (const r of [`${BL.parseName(otherName).origin}#${BL.parseName(otherName).user}`]) g.remove(BL.DOOR, r, 'user'); } catch { }"));
  wr.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
  const lost = fill(wr.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
  ok(lost.ok === false, 'RED CONTROL: a merge that takes the other login\'s grant row with it locks out the conversation the person had granted — the leg above would read it', lost);
}

console.log('⑤ THE DOORS — the person\'s only; the words in three languages are the page side\'s (lane cli-update-needs-nothing\'s row)');
{
  const routes = read('src/routes/vault.js');
  ok(["app.get('/api/vault/web-logins/site-words', noStoreL(person(", "app.post('/api/vault/web-logins/sites', noStoreL(person(", "app.post('/api/vault/web-logins/sites/remove', noStoreL(person(", "app.post('/api/vault/web-logins/merge', noStoreL(person("].every((x) => routes.includes(x)),
    'the add, the remove, the merge and the words before an add are the person\'s doors (THE person verdict — a bearer is refused by name)');
}

console.log(fail ? `✗ test-login-sites: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
