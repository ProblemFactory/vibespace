#!/usr/bin/env node
// test-login-sites — ONE LOGIN, SEVERAL SITES (lane login-request-card; the owner 2026-11-17: «这两个login其实是同一个，似乎没法让agent复用
// （在已有login上添加新的网站）»; 主开发's word 20:05Z — the shape, Q1–Q3, the hub side on the release). FAST, in-process: the PURE rules
// (src/browser-login.js — sitesOf / userOnSite / loginResources / addSiteVerdict / removeSiteVerdict / mergeVerdict / siteWords and
// the fill's verdict over them) and THE STORE (src/server/browser-logins.js addSite / removeSite / merge / siteWordsFor / resolveFill)
// over a REAL vault engine on scratch data and the grants store in memory. Every law a leg with a red control by mutation:
// a site added but not on the login's list never fills; a pair of site and user in two logins is refused; the four rows, each with a
// leg; a merge loses no grant and widens none; the secret never in an audit line; today's one-site logins read as they are.
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info.slice(0, 900) : JSON.stringify(info).slice(0, 900)); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  // a REAL IDN label (Node 22's URL, the hosted runner's, refuses an invented punycode label — the test machine found it)
  const puny = BL.siteWords(one, 'https://xn--bcher-kva.example', { decode: () => 'bücher.example' });
  ok(!sameDomain.lookalike && gateOf(lookalike.lookalike) && lookalike.lookalike.domain === 'lms-school.example' && lookalike.lookalike.loginDomains.join() === 'school.test' && puny.unicode === 'bücher.example' && puny.ascii === 'xn--bcher-kva.example',
    'A LOOK-ALIKE IS SAID (主开发\'s addition 1): a site under ANOTHER registrable domain than every site of the login names both domains; a host that is not plain ASCII is shown with its ASCII form beside it', { sameDomain, lookalike, puny });
}

console.log('② THE ADD, THE REMOVE, THE MERGE — PURE verdicts');
{
  const one = rec();
  const entries = [{ name: BL.entryName(LMS, 'jdoe'), origin: LMS, user: 'jdoe' }, { name: BL.entryName(PORTAL, 'jdoe'), origin: PORTAL, user: 'jdoe' }];
  const add = BL.addSiteVerdict({ rec: one, name: entries[0].name, site: SSO, user: 'JDoe@School.test', entries });
  ok(gateOf(add.ok) && add.record.origins.join() === SSO && add.record.siteUsers[SSO] === 'JDoe@School.test' && add.record.current.password === one.current.password, 'the add keeps the ONE secret and writes the site (and the name it signs in under there)', add);
  const shapes = ['https://*.school.test', `${SSO}/login`, 'sso.school.test', `${SSO}?a=1`, 'http://sso.school.test', LMS].map((x) => BL.addSiteVerdict({ rec: one, name: entries[0].name, site: x, entries }));
  ok(gateOf(shapes.every((v) => v.ok === false)) && gateOf(shapes.slice(0, 5).every((v) => v.code === 'login_bad_origin')) && shapes[5].code === 'login_site_exists', 'EXACTLY THE SITE: a pattern, a path, a bare host, a query, plain http off this machine — refused by name; the login\'s own site is no second site', shapes.map((v) => v.code));
  const clash = BL.addSiteVerdict({ rec: one, name: entries[0].name, site: PORTAL, entries });
  ok(clash.ok === false && clash.code === 'login_exists' && clash.other === entries[1].name, 'A PAIR OF SITE AND USER IN TWO LOGINS IS REFUSED — the other login named (merge them instead)', clash);
  const clashMut = loadMutated('src/browser-login.js', (s) => s.replace("  const other = (entries || []).find((e) => e && e.name !== name && holdsPair(e, o, there));", '  const other = null;')).addSiteVerdict({ rec: one, name: entries[0].name, site: PORTAL, entries });
  ok(clashMut.ok === true, 'RED CONTROL: without the one-pair-one-login rule the same add lands — two logins would answer one site and user', clashMut);
  const full = BL.addSiteVerdict({ rec: rec({ origins: Array.from({ length: 8 }, (_, i) => `https://s${i}.school.test`) }), name: entries[0].name, site: SSO, entries });
  ok(full.ok === false && full.code === 'login_sites_full', 'a login keeps at most nine sites (the first + eight) — said', full);
  const rm = BL.removeSiteVerdict(add.record, SSO), rmFirst = BL.removeSiteVerdict(add.record, LMS), rmGone = BL.removeSiteVerdict(add.record, PORTAL);
  ok(gateOf(rm.ok) && !rm.record.origins && !rm.record.siteUsers && rmFirst.code === 'login_site_first' && rmGone.code === 'login_site_absent', 'the REMOVE takes an added site and its name away; the first site is the login itself; a site not on it is said', { rm: rm.ok, rmFirst, rmGone });
  const keep = rec(), other = rec({ origin: SSO, username: 'jdoe@school.test', current: { password: 'Other!' + 'y'.repeat(10), source: 'owner', strength: 'unknown', setAt: 2 }, totpName: 'school-2fa', origins: [PORTAL] });
  const m = BL.mergeVerdict({ keep, keepName: entries[0].name, other, otherName: BL.entryName(SSO, 'jdoe@school.test'), entries: [entries[0], { name: BL.entryName(SSO, 'jdoe@school.test'), origin: SSO, user: 'jdoe@school.test', origins: [PORTAL] }] });
  ok(gateOf(m.ok) && m.record.current.password === keep.current.password && m.record.origins.join() === `${SSO},${PORTAL}` && m.record.siteUsers[SSO] === 'jdoe@school.test' && m.record.siteUsers[PORTAL] === 'jdoe@school.test' && m.record.totpName === 'school-2fa',
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
    ok(gateOf(v.ok) && v.entry.name === L.name && v.user === 'jdoe@school.test' && vr.ok === false && vr.code === 'login_not_granted', `ON THE ADDED SITE ${name} admits the login (and the name typed is the site's own) — RED CONTROL: that row dropped from the four, refused`, { v: v.ok ? 'ok' : v, vr: vr.code });
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
  // (主开发 23:01Z (d)) the hardest cases of «exactly one of its own sites»: a suffix, a subdomain, another port, another scheme of a HELD site
  const near = ['https://sso.school.test.evil.test', 'https://a.sso.school.test', 'https://sso.school.test:8443', 'http://sso.school.test'];
  const nearV = (FV) => near.map((t) => ({ t, asHeld: verdict(FV, t, `${SSO.replace('https://', '')}#jdoe@school.test/password`, [row('*')]), asItself: verdict(FV, t, `${t.replace(/^https?:\/\//, '')}#jdoe@school.test/password`, [row('*')]) }));
  const nv = nearV(fv);
  ok(verdictOf(nv.every((x) => x.asHeld.ok === false && x.asItself.ok === false)), 'NEAR A HELD SITE IS NOT THE SITE: on a suffix, a subdomain, another port or another scheme of sso.school.test the login fills nothing — named as the held site (the fence) or as itself (no login there), even under «any site»', nv.map((x) => `${x.t}: ${x.asHeld.code} / ${x.asItself.code}`));
  const nearMut = loadMutated('src/browser-login.js', (src) => src.replace("function userOnSite(e, origin) { const s = sitesOf(e).find((x) => x.origin === origin); return s ? s.user : null; }", "function userOnSite(e, origin) { const s = sitesOf(e).find((x) => String(origin).includes(x.origin.replace(/^https?:\\/\\//, ''))); return s ? s.user : null; }")).fillVerdict;
  const nvR = nearV(nearMut);
  ok(verdictOf(nvR.some((x) => x.asItself.ok === true)), 'RED CONTROL: a site match by host text (not the exact origin) fills the login on a near site — the leg above would read it', nvR.map((x) => `${x.t}: ${x.asItself.ok}`));
}

console.log('④ THE STORE over a REAL vault engine — the add, the fill on the added site, the merge, the remove, the audit lines');
{
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const GS = require(path.join(REPO, 'src/server/grants-store.js'));
  const Lm = require(path.join(REPO, 'src/server/browser-logins.js'));
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-login-sites-'));
  process.on('exit', () => { try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { } });
  const eng = VE.create({ dataDir: DATA, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
  const UNLOCK = 'Sites#' + crypto.randomBytes(6).toString('hex');
  await eng.setup(UNLOCK);
  const world = (mutate = null, { now = null } = {}) => {   // now: the store's clock, injected where a leg orders two writes in time
    const grants = GS.create({ memory: true });
    const M = mutate ? loadMutated('src/server/browser-logins.js', mutate) : Lm;
    return { grants, logins: M.create({ vault: eng, grants: () => grants, totpCode: (n) => (n === 'school-2fa' ? { ok: true, code: '482910' } : { ok: false }), forYou: { add() { return null; }, resolve() { }, list() { return []; } }, log: () => { }, ...(now ? { now } : {}) }) };
  };
  const PW1 = 'LmsPw!' + crypto.randomBytes(8).toString('hex'), PW2 = 'SsoPw!' + crypto.randomBytes(8).toString('hex');
  const audit = () => (fs.existsSync(path.join(DATA, 'vault-audit.jsonl')) ? fs.readFileSync(path.join(DATA, 'vault-audit.jsonl'), 'utf8') : '');
  const fill = (lg, tab, spec, conv) => lg.resolveFill({ tabOrigin: tab, spec, conv, actor: conv, facts: { conversationKeys: [conv] } });
  // the owner's picture: one account saved twice — for the school's course site, and (today, through the login card) for its sign-in site
  const run = async (mutate = null, opts = {}) => {
    for (const n of (eng.secretNames() || []).map((x) => x.name).filter((n) => n.startsWith('web-login:'))) eng.secretDrop(n);
    const w = world(mutate, opts);
    eng.secretPut('totp:school-2fa', 'JBSWY3DPEHPK3PXP');
    w.logins.addOwn({ origin: LMS, username: 'jdoe', password: PW1, totpName: 'school-2fa' }, { who: 'owner' });
    w.logins.addOwn({ origin: SSO, username: 'jdoe@school.test', password: PW2 }, { who: 'owner' });
    w.logins.grant(BL.entryName(LMS, 'jdoe'), 'this-account', 'session:conv-a');
    w.logins.grant(BL.entryName(SSO, 'jdoe@school.test'), 'this-account', 'session:conv-m');
    return w;
  };
  const w = await run();
  const words = w.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), PORTAL);
  ok(gateOf(words.ok) && words.site === PORTAL && !words.lookalike && words.widens.login.length === 1 && verdictOf(GM.principalKey(words.widens.login[0]).includes('conv-a')), 'THE WORDS BEFORE THE PRESS name, by their grants, who may then have the login filled on the new site (Q1 — the grant follows the login)', words);
  const a0 = audit().length;
  const add = w.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: PORTAL }, { who: 'owner' });
  const line = audit().slice(a0);
  ok(gateOf(add.ok) && add.site === PORTAL && gateOf(/"event":"vault-web-login-site-added"/.test(line)) && gateOf(line.includes(PORTAL)) && !line.includes(PW1), 'THE PERSON\'S ADD writes the site through the store\'s one writer — ONE audit line, never the secret', { add, line });
  const f1 = fill(w.logins, PORTAL, 'portal.school.test#jdoe/password', 'conv-a');
  const fOtp = fill(w.logins, PORTAL, 'portal.school.test#jdoe/otp', 'conv-a');
  ok(gateOf(f1.ok) && f1.value === PW1 && f1.name === BL.entryName(LMS, 'jdoe') && gateOf(fOtp.ok) && fOtp.value === '482910', 'ONE ACCOUNT, TYPED ONCE (law 1): the login fills on its added site with its one secret; the bound two-step code serves that site too (law 5)', { f1: f1.ok ? 'ok' : f1, fOtp: fOtp.ok ? 'ok' : fOtp });
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
  ok(gateOf(mg.ok) && gateOf(gone) && gateOf(/"event":"vault-web-login-merged"/.test(mline)) && !mline.includes(PW1) && !mline.includes(PW2) && gateOf(viaOwn.ok) && viaOwn.value === PW1 && userThere.value === 'jdoe@school.test' && notWidened.ok === false,
    'A MERGE LOSES NO GRANT AND WIDENS NONE (law 6): the other login is gone, its grant still admits ITS site (the kept secret, the name it signs in under there), never the kept login\'s first site; one audit line, no secret', { mg, gone, viaOwn: viaOwn.ok ? 'ok' : viaOwn, notWidened: notWidened.ok });
  // THE REMOVE: an added site leaves, and its own row with it (a later login holding that pair must not inherit it)
  const rmv = w.logins.removeSite(BL.entryName(LMS, 'jdoe'), SSO, { who: 'owner' });
  const after = fill(w.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
  ok(gateOf(rmv.ok) && rmv.grantRemoved === `${SSO}#jdoe@school.test` && after.ok === false && verdictOf(/"event":"vault-web-login-site-removed"/.test(audit())), 'THE REMOVE: the site leaves the login and its own grant row goes with it — one audit line', { rmv, after: after.ok });
  const listed = w.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe'));
  ok(gateOf(listed) && gateOf(Array.isArray(listed.sites)) && listed.sites.map((x) => x.origin).join() === PORTAL && !JSON.stringify(listed).includes(PW1), 'the owner\'s list names each login\'s added sites (the row\'s sites line lands on lane cli-update-needs-nothing\'s row) — never a secret', listed && listed.sites);
  // (last: the red control's world re-makes both logins in the same vault)
  const wr = await run((s) => s.replace("        const d = vault.secretDrop(otherName);", "        const d = vault.secretDrop(otherName); try { const g = store(); for (const r of [`${BL.parseName(otherName).origin}#${BL.parseName(otherName).user}`]) g.remove(BL.DOOR, r, 'user'); } catch { }"));
  wr.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
  const lost = fill(wr.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
  ok(lost.ok === false, 'RED CONTROL: a merge that takes the other login\'s grant row with it locks out the conversation the person had granted — the leg above would read it', lost);

  // ── the cure (主开发 23:01Z) ──
  // MUST 1 — ONE PAIR, ONE LOGIN AT EVERY DOOR THAT MAKES A LOGIN: the person's add, an agent's add, the save card's new login
  const onePair = async (mutate = null) => {
    const v = await run(mutate);
    // the save card offered BEFORE the site joins the course login (a card already open when its pair becomes held)
    const offer = v.logins.offerOwnerSaveCard({ origin: PORTAL, username: 'jdoe', password: 'Typed!' + 'z'.repeat(10) });
    v.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: PORTAL }, { who: 'owner' });   // portal#jdoe is now a SITE of the course login
    const own = v.logins.addOwn({ origin: PORTAL, username: 'jdoe', password: 'Again!' + 'z'.repeat(10) }, { who: 'owner' });
    const agent = v.logins.addAgent({ origin: PORTAL, username: 'jdoe', password: 'Agent!' + 'z'.repeat(10) }, { owner: 'conv-x', actor: 'conv-x' });
    const card = offer.ok && offer.id ? v.logins.answerCard(offer.id, { approve: true, shown: offer.shown, who: 'owner' }) : offer;
    const fillNow = fill(v.logins, PORTAL, 'portal.school.test#jdoe/password', 'conv-a');
    return { own, agent, card, second: eng.hasEntry(BL.entryName(PORTAL, 'jdoe')), fillNow };
  };
  const p1 = await onePair();
  const names1 = [p1.own, p1.agent, p1.card].map((r) => r && r.other);
  ok(gateOf([p1.own, p1.agent, p1.card].every((r) => r && r.ok === false && r.code === 'login_exists')) && gateOf(names1.every((n) => n === BL.entryName(LMS, 'jdoe'))) && gateOf(/change its password at that login's row/.test(p1.own.error)) && gateOf(/--vault https:\/\/portal\.school\.test#jdoe\/password/.test(p1.agent.error)) && !p1.second && gateOf(p1.fillNow.ok) && p1.fillNow.value === PW1,
    'ONE PAIR, ONE LOGIN AT EVERY DOOR (must 1): a pair held as an ADDED site is refused login_exists at the person\'s add, an agent\'s add and the save card — each names the login that holds it (its row is the door; the agent is told the fill); no second login, the fill still types the one secret', { own: p1.own, agent: p1.agent, card: p1.card, second: p1.second });
  const p1r = await onePair((s) => s.replace('  function pairHolder(name, origin, user) {\n    if (vstate() !== \'unlocked\') return null;', '  function pairHolder(name, origin, user) {\n    return null;'));
  ok(p1r.own.ok === true && p1r.second === true, 'RED CONTROL: without the pair rule at those doors a SECOND login is written for a pair the first holds — the leg above would read it', { own: p1r.own, second: p1r.second });

  // MUST 2 — A MERGE NEVER DESTROYS THE ONLY COPY OF A SECRET; and it says what it changes, before the press and in its answer
  const pend = async (mutate = null) => {
    const v = await run(mutate);
    const other = BL.entryName(SSO, 'jdoe@school.test');
    // the pending value set the way an agent's change sets it: a fill with --generate on the login mints it, sealed before typing
    const g = v.logins.resolveFill({ tabOrigin: SSO, spec: 'sso.school.test#jdoe@school.test/password', conv: 'conv-m', actor: 'conv-m', facts: { conversationKeys: ['conv-m'] }, generate: true });
    const pendingNow = (v.logins.list().entries.find((e) => e.name === other) || {}).pending || null;
    const m = v.logins.merge(BL.entryName(LMS, 'jdoe'), other, { who: 'owner' });
    return { v, g, pendingNow, m, kept: eng.hasEntry(other) };
  };
  const pd = await pend();
  ok(gateOf(pd.pendingNow) && pd.m.ok === false && pd.m.code === 'login_pending_exists' && gateOf(/confirm or discard it at its row first/.test(pd.m.error)) && verdictOf(pd.kept),
    'A LOGIN WITH A PENDING VALUE IS NOT MERGED AWAY (must 2 — chosen: refused by name, what to do first said): the other login and its unconfirmed password stay', { pendingNow: pd.pendingNow, m: pd.m, g: pd.g && (pd.g.ok ? 'ok' : pd.g) });
  const pdr = await pend((s) => s.replace("    if (x.rec.pending) return named('login_pending_exists',", "    if (false) return named('login_pending_exists',"));
  ok(!pd.pendingNow || (pdr.m.ok === true && pdr.kept === false), 'RED CONTROL: a merge that ignores the pending value drops the only copy of that site\'s new password — the leg above would read it', { m: pdr.m, kept: pdr.kept });
  // the words: the other's two-step code dropped (both have one), the conversation that stored the other login loses its own fill
  {
    const v = await run();
    eng.secretPut('totp:sso-2fa', 'JBSWY3DPEHPK3PXQ');
    for (const n of [BL.entryName(SSO, 'jdoe@school.test')]) eng.secretDrop(n);
    const ag = v.logins.addAgent({ origin: SSO, username: 'jdoe@school.test', password: PW2 }, { owner: 'conv-d', actor: 'conv-d' });
    const words = v.logins.mergeWordsFor(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'));
    const mg2 = v.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    ok(gateOf(ag.ok) && gateOf(words.ok) && words.ownerLoses === 'conv-d' && words.joined.map((x) => x.origin).join() === SSO && words.widens.login.length === 1 && gateOf(GM.principalKey(words.widens.login[0]).includes('conv-a')) && gateOf(mg2.ok) && mg2.ownerLoses === 'conv-d',
      'THE MERGE SAYS WHAT IT CHANGES, before the press and in its answer: the sites that join, by name who may then have the kept login filled there (its own row), and the conversation that stored the other login and loses its own fill there', { words, mg2 });
    const v2 = await run();
    eng.secretPut('totp:sso-2fa', 'JBSWY3DPEHPK3PXQ');
    eng.secretDrop(BL.entryName(SSO, 'jdoe@school.test'));
    v2.logins.addOwn({ origin: SSO, username: 'jdoe@school.test', password: PW2, totpName: 'sso-2fa' }, { who: 'owner' });
    const w2 = v2.logins.mergeWordsFor(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'));
    const m3 = v2.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    const wr2 = (await run((s) => s.replace("    const dropsTotp = k.rec.totpName && x.rec.totpName && x.rec.totpName !== k.rec.totpName ? x.rec.totpName : null;", '    const dropsTotp = null;'))).logins;
    eng.secretPut('totp:sso-2fa', 'JBSWY3DPEHPK3PXQ'); eng.secretDrop(BL.entryName(SSO, 'jdoe@school.test'));
    wr2.addOwn({ origin: SSO, username: 'jdoe@school.test', password: PW2, totpName: 'sso-2fa' }, { who: 'owner' });
    const w2r = wr2.mergeWordsFor(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'));
    ok(gateOf(w2.ok) && w2.dropsTotp === 'sso-2fa' && gateOf(m3.ok) && m3.dropsTotp === 'sso-2fa' && !w2.ownerLoses && gateOf(w2r.ok) && !w2r.dropsTotp,
      'THE TWO-STEP CODE DROPPED when both logins have one is NAMED, before the press and in the answer — RED CONTROL: a plan that does not compare the two says nothing', { w2, m3: { ok: m3.ok, dropsTotp: m3.dropsTotp }, w2r });
  }

  // (a) THE LIST: each login's rows for EVERY site of it, each with the site it belongs to
  {
    const v = await run();
    v.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    v.logins.grant(BL.entryName(LMS, 'jdoe'), 'any-account', 'session:conv-q');
    const L = v.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe'));
    const keyed = (L.grants || []).map((g) => `${g.site}|${g.resource}`);
    ok(gateOf(keyed.includes(`${LMS}|${LMS}#jdoe`)) && gateOf(keyed.includes(`${SSO}|${SSO}#jdoe@school.test`)) && verdictOf(keyed.includes(`${LMS}|${LMS}#*`)),
      '(a) THE LIST answers a login\'s rows for EVERY site of it, each with its site — after a merge the other login\'s kept row is seen (and removable) at the kept login', keyed);
    const Lr = (await run((s) => s.replace("              ...(o && o.ok && o.rec ? BL.sitesOf(o.rec).slice(1).flatMap((x) => [...rowsAt(`${x.origin}#${BL.userOf(x.user)}`, x.origin), ...rowsAt(`${x.origin}#*`, x.origin)]) : []), ...wild],", '              ...wild],')));
    Lr.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    const LrE = Lr.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe'));
    ok(!(LrE.grants || []).some((g) => g.resource === `${SSO}#jdoe@school.test`), 'RED CONTROL: a list of the first site\'s rows only hides the merged row that still admits the login — the leg above would read it');
  }

  // (b) + the remove's real claim: after a remove, a NEW login for that pair inherits nothing; the row goes FIRST
  {
    const v = await run();
    v.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    v.logins.removeSite(BL.entryName(LMS, 'jdoe'), SSO, { who: 'owner' });
    v.logins.addOwn({ origin: SSO, username: 'jdoe@school.test', password: 'Fresh!' + 'q'.repeat(10) }, { who: 'owner' });
    const inh = fill(v.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
    const vr = await run((s) => s.replace("        const rr = g.remove(BL.DOOR, res, 'user');", "        const rr = { ok: true };   // the mutant: the site's row is never removed"));
    vr.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    vr.logins.removeSite(BL.entryName(LMS, 'jdoe'), SSO, { who: 'owner' });
    vr.logins.addOwn({ origin: SSO, username: 'jdoe@school.test', password: 'Fresh!' + 'q'.repeat(10) }, { who: 'owner' });
    const inhR = fill(vr.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
    ok(inh.ok === false && inh.code === 'login_not_granted' && inhR.ok === true, 'A REMOVED SITE\'S ROW IS GONE: a NEW login saved later for that pair inherits nothing (the conversation the merged row named is refused) — RED CONTROL: a remove that keeps the row hands the new login\'s secret to it', { inh: inh.ok ? 'ok' : inh.code, inhR: inhR.ok });
    const src = read('src/server/browser-logins.js');
    const rmBody = src.slice(src.indexOf('  function removeSite('), src.indexOf('  function mergePlan('));
    ok(rmBody.indexOf("g.remove(BL.DOOR, res, 'user')") > 0 && rmBody.indexOf("g.remove(BL.DOOR, res, 'user')") < rmBody.indexOf('const w = writeEntry(name,'), '(b) the remove takes the grant row FIRST, then writes the record — a stop between the two can lose a grant, never leave a row a later login inherits');
  }

  // (d) a dropped login's ADDED-site rows go with it — a new login for that pair inherits nothing
  {
    const v = await run();
    v.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    v.logins.drop(BL.entryName(LMS, 'jdoe'), { who: 'owner' });
    v.logins.addOwn({ origin: SSO, username: 'jdoe@school.test', password: 'Fresh!' + 'q'.repeat(10) }, { who: 'owner' });
    const inh = fill(v.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
    const vr = await run((s) => s.replace("    const own = [`${p.origin}#${p.user}`, ...(ex && ex.ok && ex.rec ? BL.sitesOf(ex.rec).slice(1).map((x) => `${x.origin}#${BL.userOf(x.user)}`) : [])];", '    const own = [`${p.origin}#${p.user}`];'));
    vr.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    vr.logins.drop(BL.entryName(LMS, 'jdoe'), { who: 'owner' });
    vr.logins.addOwn({ origin: SSO, username: 'jdoe@school.test', password: 'Fresh!' + 'q'.repeat(10) }, { who: 'owner' });
    const inhR = fill(vr.logins, SSO, 'sso.school.test#jdoe@school.test/password', 'conv-m');
    ok(inh.ok === false && inhR.ok === true, '(d) A DROPPED LOGIN\'S ADDED-SITE ROWS GO WITH IT: a new login for that pair inherits nothing — RED CONTROL: a drop that removes only the first site\'s row hands it on', { inh: inh.ok ? 'ok' : inh.code, inhR: inhR.ok });
  }

  // (d) a merge whose SECOND write fails leaves both logins as they were (the batch restores the first)
  {
    const v = await run();
    const failing = Object.create(eng); failing.secretDrop = () => ({ ok: false, code: 'not_written', error: 'disk full (test)' });
    const fl = (mutate) => (mutate ? loadMutated('src/server/browser-logins.js', mutate) : Lm).create({ vault: failing, grants: () => v.grants, forYou: { add() { return null; }, resolve() { }, list() { return []; } }, log: () => { } });
    const before = v.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe'));
    const mf = fl().merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    const afterL = v.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe'));
    const both = eng.hasEntry(BL.entryName(SSO, 'jdoe@school.test')) && !(afterL.sites && afterL.sites.length);
    const v3 = await run();
    const mfr = fl((s) => s.replace("        const d = vault.secretDrop(otherName);\n        if (d && d.ok === false) throw Object.assign(new Error(d.error || d.code), { code: d.code || 'not_written' });", "        const d = vault.secretDrop(otherName);")).merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
    const afterR = v3.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe'));
    ok(mf.ok === false && gateOf(/both logins are as they were/.test(mf.error)) && gateOf(both) && !(before.sites && before.sites.length) && mfr.ok === true && gateOf(afterR.sites) && afterR.sites.length === 1,
      '(d) A MERGE WHOSE SECOND WRITE FAILS leaves both logins as they were (the kept record restored by the batch) — RED CONTROL: a merge that ignores the failed drop leaves two logins holding one pair', { mf, both, mfr: mfr.ok });
  }

  // (c) THE LOCALHOST PRE-PASS (an agent names `localhost:<port>#…` with no scheme) asks the login's FOUR rows on the local site
  {
    const LOCAL = 'http://localhost';   // a login's origin only — no socket, and no port at all (§81 bans a fixed endpoint, also through a name)
    const pre = async (mutate = null) => {
      const v = await run(mutate);
      v.logins.addOwn({ origin: LOCAL, username: 'jdoe', password: 'Local!' + 'w'.repeat(10) }, { who: 'owner' });
      v.logins.grant(BL.entryName(LOCAL, 'jdoe'), 'any-account', 'session:conv-l');   // a row on the LOCAL site: http://localhost:<port>#*
      const mg = v.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(LOCAL, 'jdoe'), { who: 'owner' });
      const r = v.logins.resolveFill({ skipOrigin: true, spec: 'localhost#jdoe/password', conv: 'conv-l', actor: 'conv-l', facts: { conversationKeys: ['conv-l'] } });
      return { mg, r };
    };
    const c1 = await pre();
    const c1r = await pre((src) => src.replace("            const rs = BL.loginResources(e, there).flatMap((r) => rowsOf(r) || []);", "            const rs = BL.grantResources(e.origin, e.user).flatMap((r) => rowsOf(r) || []);"));   // stale-pins: kept — a red control whose mutant rebuilds the first site's three rows
    const c1t = await pre((src) => src.replace("httpMatches.some((e) => e.origin === httpLocal || (Array.isArray(e.origins) && e.origins.includes(httpLocal))) ? httpLocal : httpMatches[0].origin;", "httpMatches.some((e) => e.origin === httpLocal) ? httpLocal : httpMatches[0].origin;"));   // stale-pins: kept — a red control whose mutant rebuilds the old rewrite target
    ok(c1t.r.ok === false, 'RED CONTROL: a rewrite aimed at the matched login\'s FIRST site (not the local site it holds) refuses the fill — the leg below would read it', c1t.r.code);
    ok(gateOf(c1.mg.ok) && c1.r.ok === true && c1.r.name === BL.entryName(LMS, 'jdoe') && c1r.r.ok === false,
      '(c) THE LOCALHOST PRE-PASS asks the login\'s four rows on the local site: a merged login\'s row on the local site (http://localhost:<port>) admits it there — RED CONTROL: the first site\'s three rows refuse it', { r: c1.r.ok ? 'ok' : c1.r, red: c1r.r.ok ? 'ok' : c1r.r.code });
  }
  // (my adversarial read) A HAND SIGN-IN ON A HELD SITE offers the UPDATE of the login that holds it — or nothing, the same password
  {
    const handIn = async (mutate = null) => {
      const v = await run(mutate);
      v.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: PORTAL }, { who: 'owner' });
      const same = v.logins.offerOwnerSaveCard({ origin: PORTAL, username: 'jdoe', password: PW1 });
      const NEWPW = 'Hand!' + 'h'.repeat(12);
      const upd = v.logins.offerOwnerSaveCard({ origin: PORTAL, username: 'jdoe', password: NEWPW });
      const ans = upd.ok && upd.id ? v.logins.answerCard(upd.id, { approve: true, shown: upd.shown, who: 'owner' }) : upd;
      const f = fill(v.logins, LMS, 'lms.school.test#jdoe/password', 'conv-a');
      return { same, upd, ans, f, NEWPW, second: eng.hasEntry(BL.entryName(PORTAL, 'jdoe')) };
    };
    const hi = await handIn();
    ok(gateOf(hi.same.ok) && hi.same.same === true && gateOf(hi.upd.ok) && hi.upd.update === true && gateOf(hi.ans.ok) && hi.ans.updated === true && hi.ans.name === BL.entryName(LMS, 'jdoe') && gateOf(hi.f.ok) && hi.f.value === hi.NEWPW && !hi.second,
      'A HAND SIGN-IN ON A HELD SITE: the same password offers nothing; a new one offers the UPDATE of the login that holds the pair (saved there, one secret for every site) — never a new-login card the save would refuse', { same: hi.same, upd: hi.upd, ans: hi.ans });
    const hiR = await handIn((src) => src.replace("    if (holder) { const hx = open(holder.name); if (hx.ok && hx.rec) { n = holder.name; ex = hx; } }\n", ''));
    ok(hiR.same.same !== true && hiR.upd.update === false && hiR.ans.ok === false && hiR.ans.code === 'login_exists', 'RED CONTROL: an offer that looks only at the exact name files a new-login card for a held pair, and the press is refused — the leg above would read it', { same: hiR.same, ans: hiR.ans });
  }
  // (my adversarial read) A FAILED ROW REMOVE is read: removeSite refuses, the site and its row stay — never «removed» with the row left
  {
    const failRm = async (mutate = null) => {
      const v = await run();
      v.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'), { who: 'owner' });
      const failing = Object.create(v.grants); failing.remove = () => ({ ok: false, code: 'not_written', error: 'disk full (test)' });
      const st = (mutate ? loadMutated('src/server/browser-logins.js', mutate) : Lm).create({ vault: eng, grants: () => failing, forYou: { add() { return null; }, resolve() { }, list() { return []; } }, log: () => { } });
      const r = st.removeSite(BL.entryName(LMS, 'jdoe'), SSO, { who: 'owner' });
      const sites = (v.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe')).sites || []).map((x) => x.origin);
      return { r, onLogin: sites.includes(SSO), rowStays: v.grants.rowsFor(BL.DOOR, `${SSO}#jdoe@school.test`).length > 0 };
    };
    const fr = await failRm();
    const frR = await failRm((src) => src.replace("        if (!rr || rr.ok === false) return named((rr && rr.code) || 'not_written',", "        if (false) return named((rr && rr.code) || 'not_written',"));
    ok(fr.r.ok === false && fr.r.code === 'not_written' && gateOf(fr.onLogin) && gateOf(fr.rowStays) && frR.r.ok === true && !frR.onLogin && verdictOf(frR.rowStays),
      'A FAILED ROW REMOVE IS READ (the grants store answers {ok:false}, it never throws): the remove refuses and nothing changes — RED CONTROL: a remove that trusts it says «removed», the site gone, its row left for a later login', { fr, frR });
  }
  // (my adversarial read) THE KEPT LOGIN must hold a confirmed password: a registration waiting for confirmation is not merged into
  {
    const regMerge = async (mutate = null) => {
      const v = await run(mutate);
      v.logins.grant(BL.entryName(LMS, 'jdoe'), 'any-site', 'session:conv-n');
      const g = v.logins.resolveFill({ tabOrigin: PORTAL, spec: 'new:portal.school.test#jdoe/password', generate: true, conv: 'conv-n', actor: 'conv-n', facts: { conversationKeys: ['conv-n'] } });
      const m = v.logins.merge(BL.entryName(PORTAL, 'jdoe'), BL.entryName(LMS, 'jdoe'), { who: 'owner' });
      return { g, m, lmsStays: eng.hasEntry(BL.entryName(LMS, 'jdoe')) };
    };
    const rm = await regMerge();
    const rmR = await regMerge((src) => src.replace("    if (!k.rec.current) return named('login_pending_exists',", "    if (false) return named('login_pending_exists',"));
    ok(gateOf(rm.g.ok) && rm.m.ok === false && rm.m.code === 'login_pending_exists' && gateOf(/no confirmed password yet/.test(rm.m.error)) && gateOf(rm.lmsStays) && rmR.m.ok === true && !rmR.lmsStays,
      'A REGISTRATION WAITING FOR CONFIRMATION IS NOT THE KEPT LOGIN of a merge (the other\'s confirmed password would go) — refused by name; RED CONTROL: without the check the confirmed login is dropped', { g: rm.g.ok ? 'ok' : rm.g, m: rm.m, red: rmR.m.ok });
  }
  // (my adversarial read) THE WORDS NAME THE KEPT LOGIN'S OWNER — the conversation that stored it fills with no grant at all
  {
    const ownerWords = async (mutate = null) => {
      const v = await run(mutate);
      eng.secretDrop(BL.entryName(LMS, 'jdoe'));
      v.logins.addAgent({ origin: LMS, username: 'jdoe', password: PW1 }, { owner: 'conv-o', actor: 'conv-o' });
      return { mw: v.logins.mergeWordsFor(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test')), sw: v.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), PORTAL) };
    };
    const ow = await ownerWords();
    const owR = await ownerWords((src) => src.replace("principalsAt(`${kp.origin}#${kp.user}`), ...(km && km.owner ? { owner: km.owner } : {}) } };", "principalsAt(`${kp.origin}#${kp.user}`) } };"));
    ok(gateOf(ow.mw.ok) && ow.mw.widens.owner === 'conv-o' && gateOf(ow.sw.ok) && ow.sw.widens.owner === 'conv-o' && gateOf(owR.mw.ok) && owR.mw.widens.owner === undefined,
      'THE WORDS BEFORE A MERGE AND BEFORE AN ADD name the kept login\'s OWNER (it fills with no grant on every site) — RED CONTROL: a plan that names only the row\'s principals leaves it out', { mw: ow.mw.widens, sw: ow.sw.widens, red: owR.mw.widens });
  }
  // (my adversarial read) A LOCKED VAULT cannot read a login's sites: its remove is refused by name (their rows would stay behind)
  {
    const lockedDrop = async (mutate = null) => {
      const v = await run(mutate);
      eng.lock();
      const d = v.logins.drop(BL.entryName(LMS, 'jdoe'), { who: 'owner' });
      await eng.unlock(UNLOCK);
      return { d, stays: eng.hasEntry(BL.entryName(LMS, 'jdoe')) };
    };
    const ld = await lockedDrop();
    const ldR = await lockedDrop((src) => src.replace("    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then remove the login", "    if (false) return named('vault_locked', 'the vault is locked — unlock it, then remove the login"));
    ok(ld.d.ok === false && ld.d.code === 'vault_locked' && gateOf(ld.stays) && ldR.d.ok === true && !ldR.stays, 'A LOCKED VAULT\'S REMOVE IS REFUSED BY NAME (its sites cannot be read, so their rows could not go with it) — RED CONTROL: without it the login goes and its added sites\' rows stay', { d: ld.d, red: ldR.d });
  }
  // THE WORDS BEFORE «Use a login you already saved…» on the login card (src/lib/use-login-words.js — PURE, the page's `t` handed in),
  // over the store's REAL site-words answer: what the press does, BY NAME who may then have it filled there, a look-alike said
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-login-words-'));
    const load = async (mut) => { const src = read('src/lib/use-login-words.js'); const f = path.join(tmp, `w-${crypto.randomBytes(4).toString('hex')}.mjs`); fs.writeFileSync(f, mut ? mut(src) : src); return (await import(f)).useLoginWords; };
    const tr = (k, p = {}) => k.replace(/\{(\w+)\}/g, (_, n) => (n in p ? String(p[n]) : `{${n}}`));
    const v = await run();
    const near = v.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), PORTAL), far = v.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), OTHER);
    const UW = await load();
    const a = UW(near, { site: PORTAL, login: `${LMS} · jdoe`, t: tr }), b = UW(far, { site: OTHER, login: `${LMS} · jdoe`, t: tr });
    ok(gateOf(a[0].includes(PORTAL)) && gateOf(a[0].includes(`${LMS} · jdoe`)) && gateOf(/nothing is typed again/.test(a[0])) && gateOf(a.some((x) => /^Then it may be filled on .* by: .*conv-a/.test(x))) && !a.some((x) => /^Careful/.test(x)) && verdictOf(b.some((x) => /^Careful: lms-school\.example is not the domain of this login's other sites \(school\.test\)/.test(x))),
      'THE WORDS BEFORE THE PRESS on the login card (the page\'s, over the hub\'s real answer): what the press does, BY NAME who may then have it filled on that site (the login\'s own row: conv-a), and a look-alike said', { a, b });
    const must = (from, to) => (src) => { if (!src.includes(from)) throw new Error(`mutant anchor missing: ${from.slice(0, 80)}`); return editAnchor(src, from, to, "the text handed to must()"); };
    const PUSH = "    names.push(out2.length ? t('{who} (except {names})', { who: who.join(', '), names: out2.join(', ') }) : who.join(', '));";
    const WHO = "    for (const p of wd[k] || []) { if (!p || typeof p !== 'object') continue; const id = idOf(p); if (seen.has(id)) continue; seen.add(id); who.push(nameOf(p)); }";
    const UWr = await load(must(PUSH, ''));
    const ar = UWr(near, { site: PORTAL, login: `${LMS} · jdoe`, t: tr });
    ok(verdictOf(ar.some((x) => /^Nobody else may have it filled/.test(x))), 'RED CONTROL: words that leave out the grants say «nobody else» while conv-a may fill it — the leg above would read it', ar);
    // (主开发 12:17Z, the use door's MUST — the vault's law: a change that WIDENS who may use a login is said BY NAME before the press)
    // EVERY PRINCIPAL IS SAID: the hub names each as the Vault window's chips do (the pickers' subjects); a Task Group too — and one
    // whose name cannot be read is still said («Task group <id>»), never dropped into «Nobody else»
    const SUBJ = { sessions: [{ subject: 'session:conv-a', name: 'Course helper' }], groups: [{ subject: 'group:g-release', name: 'Release crew' }] };
    const conv = UW(v.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), PORTAL, { subjects: SUBJ }), { site: PORTAL, login: `${LMS} · jdoe`, t: tr }).join(' ');
    const WIKI = 'https://wiki.school.test';
    v.logins.addOwn({ origin: WIKI, username: 'jdoe', password: 'Wiki!' + 'w'.repeat(12) }, { who: 'owner' });
    v.logins.grant(BL.entryName(WIKI, 'jdoe'), 'this-account', 'group:g-release');   // ONLY a Task Group may fill this login
    const GW = (o) => v.logins.siteWordsFor(BL.entryName(WIKI, 'jdoe'), PORTAL, o);
    const gNamed = UW(GW({ subjects: SUBJ }), { site: PORTAL, login: `${WIKI} · jdoe`, t: tr }).join(' ');
    const gBare = UW(GW(), { site: PORTAL, login: `${WIKI} · jdoe`, t: tr }).join(' ');
    ok(gateOf(/by: Course helper/.test(conv)) && !conv.includes('conv-a') && gateOf(/by: Release crew\./.test(gNamed)) && gateOf(/by: Task group g-release\./.test(gBare)) && !/Nobody else/.test(gNamed + gBare),
      'EVERY PRINCIPAL SAID BY NAME BEFORE THE PRESS: the hub names the conversation («Course helper», not its id) and the Task Group («Release crew») as the Vault window\'s chips do; a group whose name cannot be read is still said — «Task group g-release», never «Nobody else»', { conv, gNamed, gBare });
    const UWold = await load(must(WHO, "    for (const p of wd[k] || []) { const n = p && p.kind === 'everyone' ? t('every conversation') : String((p && (p.name || p.key)) || ''); if (n) who.push(n); }"));
    const gOld = UWold(GW(), { site: PORTAL, login: `${WIKI} · jdoe`, t: tr }).join(' ');
    ok(verdictOf(/Nobody else may have it filled on/.test(gOld)), 'RED CONTROL: the old words (a name or a key, an empty one dropped) over a nameless group say «Nobody else» while the Task Group may fill it — the leg above would read it', gOld);
    // (主开发 13:02Z (1), as if a must — the owner asked for exceptions by name) AN EXCEPT ROW IS SAID AS AN EXCEPTION: «Release crew
    // (except Night shift)», read from the same public row through the same names call
    const SUBJ2 = { sessions: [...SUBJ.sessions, { subject: 'session:conv-night', name: 'Night shift' }], groups: SUBJ.groups };
    const wr = v.grants.set(BL.DOOR, `${WIKI}#jdoe`, { to: [{ kind: 'group', id: 'g-release' }], except: [{ kind: 'conversation', key: 'conv-night' }] }, 'user');
    const exW = UW(GW({ subjects: SUBJ2 }), { site: PORTAL, login: `${WIKI} · jdoe`, t: tr }).join(' ');
    ok(!!wr && wr.ok !== false && verdictOf(/by: Release crew \(except Night shift\)\./.test(exW)), 'AN EXCEPT ROW IS SAID AS AN EXCEPTION before the press: «Release crew (except Night shift)» — the same public row, the same names call', { wr, exW });
    const UWnoEx = await load(must("    const out2 = (ex[k] || []).filter((p) => p && typeof p === 'object').map(nameOf);", '    const out2 = [];'));
    const exR = UWnoEx(GW({ subjects: SUBJ2 }), { site: PORTAL, login: `${WIKI} · jdoe`, t: tr }).join(' ');
    ok(gateOf(/by: Release crew\./.test(exR)) && !/except/.test(exR), 'RED CONTROL: words that read only the row\'s principals name the whole group, the exception unsaid — the leg above would read it', exR);
    // (2) A RUNNING CONVERSATION WHOSE GRANT WAS WRITTEN UNDER ITS PAGE ID is named, never «not running»: the pickers' subjects carry it
    v.logins.grant(BL.entryName(WIKI, 'jdoe'), 'this-account', 'session:webui:pg-7');
    const SUBJ3 = { sessions: [...SUBJ2.sessions, { subject: 'session:conv-pg', name: 'Page helper', webuiId: 'pg-7' }], groups: SUBJ.groups };
    const pgW = UW(GW({ subjects: SUBJ3 }), { site: PORTAL, login: `${WIKI} · jdoe`, t: tr }).join(' ');
    ok(gateOf(/Page helper/.test(pgW)) && !/not running now \(webui:pg-7\)/.test(pgW) && verdictOf(/except Night shift/.test(pgW)), 'A RUNNING CONVERSATION GRANTED UNDER ITS PAGE ID is named («Page helper»), never «not running»; the exception still said', pgW);
    // the owner of a login that is not running is said as such — never a bare id
    const ownW = UW({ ok: true, user: 'jdoe', there: null, widens: { owner: 'conv-o' } }, { site: PORTAL, login: `${LMS} · jdoe`, t: tr }).join(' '), ownN = UW({ ok: true, user: 'jdoe', there: null, widens: { owner: 'conv-o', ownerName: 'Signup helper' } }, { site: PORTAL, login: `${LMS} · jdoe`, t: tr }).join(' ');
    ok(gateOf(/by: the conversation that saved it, not running now \(conv-o\)\./.test(ownW)) && verdictOf(/by: the conversation that saved it \(Signup helper\)\./.test(ownN)), 'THE OWNER who saved the login: by its name when running, «not running now» with its key when not — never a bare id', { ownW, ownN });
    // A SITE THE LOGIN HOLDS ALREADY is said with the name it signs in under THERE (the hub's `there`); a site it does not hold has none
    v.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: PORTAL, user: 'jd-portal' }, { who: 'owner' });
    const tw = v.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), PORTAL), tWords = UW(tw, { site: PORTAL, login: `${LMS} · jdoe`, t: tr });
    const tFar = v.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), OTHER);
    ok(gateOf(tw.ok) && tw.there === 'jd-portal' && gateOf(/is one of this login's sites already — it signs in there as jd-portal/.test(tWords[0])) && gateOf(tFar.ok) && tFar.there === null && verdictOf(/^It signs in there as jdoe\.$/.test(UW(tFar, { site: OTHER, login: `${LMS} · jdoe`, t: tr })[1])),
      'A SITE THE LOGIN HOLDS ALREADY is said with the name it signs in under there (the press then changes only who may fill it); on a new site the words say the name it will sign in under', { tw: tw.there, tWords, tFar: tFar.there });
    // RED CONTROL (the hub — LAST here: it re-makes the logins in the shared vault): a hub that does not name the principals leaves the
    // group's name unsaid even with the roster in hand — only its id
    const vb = await run((src) => src.replace("const roster = rosterOf(subjects), named2 = (list) => GM.namesNow(list, roster);", "const roster = rosterOf(subjects), named2 = (list) => list;"));
    vb.logins.addOwn({ origin: WIKI, username: 'jdoe', password: 'Wiki!' + 'w'.repeat(12) }, { who: 'owner' });
    vb.logins.grant(BL.entryName(WIKI, 'jdoe'), 'this-account', 'group:g-release');
    const gHub = UW(vb.logins.siteWordsFor(BL.entryName(WIKI, 'jdoe'), PORTAL, { subjects: SUBJ }), { site: PORTAL, login: `${WIKI} · jdoe`, t: tr }).join(' ');
    ok(!gHub.includes('Release crew') && verdictOf(gHub.includes('Task group g-release')), 'RED CONTROL: a hub that does not name the principals (no GM.namesNow over the pickers\' subjects) says the group by its id only — the leg above would read it', gHub);
    const wikiOn = async (mutate) => { const x = await run(mutate); x.logins.addOwn({ origin: WIKI, username: 'jdoe', password: 'Wiki!' + 'w'.repeat(12) }, { who: 'owner' }); x.grants.set(BL.DOOR, `${WIKI}#jdoe`, { to: [{ kind: 'group', id: 'g-release' }], except: [{ kind: 'conversation', key: 'conv-night' }] }, 'user'); x.logins.grant(BL.entryName(WIKI, 'jdoe'), 'this-account', 'session:webui:pg-7'); return UW(x.logins.siteWordsFor(BL.entryName(WIKI, 'jdoe'), PORTAL, { subjects: SUBJ3 }), { site: PORTAL, login: `${WIKI} · jdoe`, t: tr }).join(' '); };
    const hubEx = await wikiOn(must("        except: { login: named2(exceptAt(`${p.origin}#${p.user}`)), anyAccount: named2(exceptAt(`${w.site}#*`)), anySite: named2(exceptAt('*')) },   // each row's exceptions, named the same way\n", ''));
    const hubPg = await wikiOn(must("return cid ? { id: str(x.webuiId) || cid, name: str(x.name), backendSessionId: cid } : null;", "return cid ? { id: cid, name: str(x.name), backendSessionId: cid } : null;"));   // stale-pins: kept — a red control that rebuilds the roster keyed without the page id (the pre-follow-up line) on purpose
    ok(!/except/.test(hubEx) && gateOf(/not running now \(webui:pg-7\)/.test(hubPg)) && !/Page helper/.test(hubPg), 'RED CONTROLS (the hub, LAST): a hub that reads no exceptions leaves them unsaid; a roster keyed without the page id calls the running conversation «not running» — the legs above would read them', { hubEx, hubPg });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // (主开发 10:54Z, AS IF A MUST, with the first page door that adds a site) THE GRANT PICKER TOUCHES ONLY ITS OWN LOGIN'S ROWS ON ITS
  // OWN SITE: with added sites in the list, another login's «any account on this site» row rides this login's grants — the picker
  // reads the row at the login's FIRST site (where it writes), and a chip of another site's row names that site
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-own-row-'));
    const load = async (mut) => { const src = read('src/lib/use-login-words.js'); const f = path.join(tmp, `o-${crypto.randomBytes(4).toString('hex')}.mjs`); fs.writeFileSync(f, mut ? mut(src) : src); return await import(f); };
    const v = await run();
    v.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: SSO, user: 'jdoe' }, { who: 'owner' });   // jdoe on sso is the course login's
    eng.secretDrop(BL.entryName(SSO, 'jdoe@school.test'));
    v.logins.addOwn({ origin: SSO, username: 'bob', password: 'Bob!' + 'b'.repeat(12) }, { who: 'owner' });
    v.logins.grant(BL.entryName(SSO, 'bob'), 'any-account', 'session:conv-q');   // «any account on sso» — it reaches the course login there too
    v.logins.grant(BL.entryName(LMS, 'jdoe'), 'any-site', 'session:conv-z');   // a real «any site» row: its chip names no site (the leg below reads a row that exists)
    const A = v.logins.list().entries.find((e) => e.name === BL.entryName(LMS, 'jdoe'));
    const M = await load();
    const own = M.ownRowOf(A, 'any-account'), other = (A.grants || []).find((g) => g.resource === `${SSO}#*`);
    const R = await load((src) => editAnchor(src, "  return want ? ((e.grants || []).find((g) => g && !g.unknown && g.scope === scope && g.resource === want) || null) : null;", "  return want ? ((e.grants || []).find((g) => g && !g.unknown && g.scope === scope) || null) : null;", "src/lib/use-login-words.js"));
    const ownR = R.ownRowOf(A, 'any-account');
    ok(gateOf(other) && own === null && M.chipSiteOf(A, other) === 'sso.school.test' && gateOf((A.grants || []).some((g) => g.resource === '*')) && M.chipSiteOf(A, (A.grants || []).find((g) => g.resource === '*')) === null && gateOf(ownR) && ownR.resource === `${SSO}#*`,
      'THE GRANT PICKER READS ITS OWN ROW ON ITS OWN SITE: another login\'s «any account on sso» row rides this login\'s list, the picker\'s «any account» reads the course site\'s row (none here) and the chip of that row names sso — RED CONTROL: a first-scope match reads (and could untick) the other site\'s row', { own, ownR: ownR && ownR.resource, other: other && other.resource });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // (the readers' should) THE PICKER'S WIRING, PINNED: the Vault window's grant picker reads the login's OWN row (ownRowOf), a chip
  // of an added site's row names that site (chipSiteOf), and the site-words route hands the hub the pickers' subjects (every principal
  // named) — a source pin each, and patched copies that turn each one red
  {
    const pins = (row, routes) => [/const g = ownRowOf\(\{ origin: ownLogin\.origin, user: ownLogin\.user, grants: loginRows \}, sc\);/.test(GRANTS), /chipSiteOf\(entry, g\)/.test(row), /siteWordsFor\([^\n]*subjects: subjects\(\)/.test(routes)];   // the picker's own row: the grant dialog (src/lib/vault-login-grants.js — the release moved the picker there)
    const ROW = read('src/lib/vault-login-row.js'), RT = read('src/routes/vault.js'), WIRE = read('src/server/mounts-plugins-wiring.js');
    let GRANTS = read('src/lib/vault-login-grants.js');
    const real = pins(ROW, RT);
    const red = [
      (() => { const was = GRANTS, from = 'const g = ownRowOf({ origin: ownLogin.origin, user: ownLogin.user, grants: loginRows }, sc);'; if (!was.includes(from)) throw new Error('mutant anchor missing: the dialog\'s own-row read');
        GRANTS = was.replace(from, 'const g = loginRows.find((x) => x && !x.unknown && x.scope === sc);'); try { return pins(ROW, RT)[0]; } finally { GRANTS = was; } })(),   // stale-pins: kept — the release's first-scope read, rebuilt on purpose
      pins(ROW.replace(/chipSiteOf\(entry, g\)/g, 'null'), RT)[1],
      pins(ROW, RT.replace("{ user: String(req.query.user || ''), subjects: subjects() })", "{ user: String(req.query.user || '') })"))[2],   // stale-pins: kept — a red control that rebuilds the pre-cure route (no roster) on purpose
    ];
    const pageId = (w) => /sessions\.push\(\{ subject: `session:\$\{cid\}`[^\n]*webuiId: String\(s\._webuiId \|\| id\)/.test(w);
    real.push(pageId(WIRE)); red.push(pageId(WIRE.replace("webuiId: String(s._webuiId || id) /* lane login-request-card: a grant written under its page id names it too */, ", '')));
    ok(gateOf(real.every(Boolean)) && verdictOf(red.every((x) => x === false)), 'THE PICKER\'S WIRING, PINNED: its own row (ownRowOf), the added site\'s chip (chipSiteOf), the route\'s subjects to site-words, the subjects\' page id — RED CONTROLS: a first-scope match, a chip with no site, a route without the roster, subjects without the page id', { real, red });
  }
  // (AS IF A MUST) THE MERGE SAYS THE OTHER LOGIN'S PASSWORD IS NOT KEPT, and which of the two was set later — dates only
  {
    const pw = async (mutate = null) => {
      let clock = 1_790_000_000_000;   // the store's clock: the school's change is written a minute after the two logins
      const v = await run(mutate, { now: () => clock });
      clock += 60_000;
      v.logins.addOwn({ origin: SSO, username: 'jdoe@school.test', password: 'Newer!' + 'n'.repeat(12) }, { who: 'owner' });   // the school changed it later
      return v.logins.mergeWordsFor(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'));
    };
    const w1 = await pw();
    const w1r = await pw((src) => src.replace("...(m.ownerLoses ? { ownerLoses: m.ownerLoses } : {}), otherPassword: m.otherPassword, widens: m.widens };\n  }\n  function merge(", "...(m.ownerLoses ? { ownerLoses: m.ownerLoses } : {}), widens: m.widens };\n  }\n  function merge("));   // stale-pins: kept — a red control whose mutant REBUILDS the words without the password line
    ok(gateOf(w1.ok) && gateOf(w1.otherPassword) && w1.otherPassword.kept === false && w1.otherPassword.later === 'other' && w1.otherPassword.setAt > w1.otherPassword.keptSetAt && !JSON.stringify(w1).includes('Newer!') && gateOf(w1r.ok) && w1r.otherPassword === undefined,
      'THE MERGE SAYS, BEFORE THE PRESS, THE OTHER LOGIN\'S PASSWORD IS NOT KEPT and that IT was set later (dates only, no byte shown) — RED CONTROL: words without it', { w1: w1.otherPassword, red: w1r.otherPassword });
  }
  // (small) a drop that fails AFTER some grant rows went names them — lost permissions are said
  {
    const dropFail = async (mutate = null) => {
      const v = await run();
      v.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: PORTAL }, { who: 'owner' });
      v.logins.grant(BL.entryName(LMS, 'jdoe'), 'this-account', 'session:conv-z');
      const failing = Object.create(eng); failing.secretDrop = () => ({ ok: false, code: 'not_written', error: 'disk full (test)' });
      const st = (mutate ? loadMutated('src/server/browser-logins.js', mutate) : Lm).create({ vault: failing, grants: () => v.grants, forYou: { add() { return null; }, resolve() { }, list() { return []; } }, log: () => { } });
      return st.drop(BL.entryName(LMS, 'jdoe'), { who: 'owner' });
    };
    const df = await dropFail();
    const dfR = await dropFail((src) => src.replace("    if (r && r.ok === false) return named(r.code || 'not_written', `${r.error || 'not removed'} — the login was not removed${goneWords()}`);", "    if (r && r.ok === false) return named(r.code || 'not_written', r.error || 'not removed');"));   // stale-pins: kept — a red control whose mutant REBUILDS the bare «not removed»
    ok(df.ok === false && gateOf(/the login was not removed; its grant row https:\/\/lms\.school\.test#jdoe was removed already/.test(df.error)) && dfR.ok === false && !/removed already/.test(dfR.error), 'A DROP THAT FAILS after its grant rows went NAMES THEM («removed already») — RED CONTROL: the bare «not removed»', { df: df.error, red: dfR.error });
  }
  // (small) THE SAVE CARD on a held added site says the login's other sites change too
  {
    const items = [];
    const v = await run();
    v.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: PORTAL }, { who: 'owner' });
    const st = Lm.create({ vault: eng, grants: () => v.grants, forYou: { add(_p, it) { items.push(it); return { id: 'fy-1' }; }, resolve() { }, list() { return []; } }, log: () => { } });
    const o = st.offerOwnerSaveCard({ origin: PORTAL, username: 'jdoe', password: 'Hand!' + 'q'.repeat(12) });
    const it = items[0] || {};
    const d = (it.i18n && it.i18n.detail && it.i18n.detail[0]) || {};
    ok(gateOf(o.ok) && o.update === true && gateOf(/one of this login's sites/.test(d.key || '')) && gateOf(d.params) && gateOf(/lms\.school\.test/.test(d.params.sites)) && gateOf(/portal\.school\.test/.test(d.params.sites)) && verdictOf(/every one of them/.test(it.detail || '')),
      'THE SAVE CARD ON A HELD ADDED SITE says the update changes the login\'s ONE password on every one of its sites (named)', { key: d.key, params: d.params });
  }
  // (d) the four new verbs on a LOCKED vault — refused by name, nothing written
  {
    const v = await run();
    eng.lock();
    const r4 = [v.logins.siteWordsFor(BL.entryName(LMS, 'jdoe'), PORTAL), v.logins.addSite(BL.entryName(LMS, 'jdoe'), { site: PORTAL }), v.logins.removeSite(BL.entryName(LMS, 'jdoe'), SSO), v.logins.merge(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test')), v.logins.mergeWordsFor(BL.entryName(LMS, 'jdoe'), BL.entryName(SSO, 'jdoe@school.test'))];
    ok(verdictOf(r4.every((r) => r && r.ok === false && r.code === 'vault_locked' && /unlock it, then/.test(r.error))), '(d) THE NEW VERBS ON A LOCKED VAULT (the words, the add, the remove, the merge and its words) refuse vault_locked by name', r4.map((r) => r && r.code));
    await eng.unlock(UNLOCK);
  }
}

console.log('⑤ THE DOORS — the person\'s only; the words in three languages are the page side\'s (lane cli-update-needs-nothing\'s row)');
{
  const routes = read('src/routes/vault.js');
  ok(verdictOf(["app.get('/api/vault/web-logins/site-words', noStoreL(person(", "app.post('/api/vault/web-logins/sites', noStoreL(person(", "app.post('/api/vault/web-logins/sites/remove', noStoreL(person(", "app.post('/api/vault/web-logins/merge', noStoreL(person("].every((x) => routes.includes(x))),
    'the add, the remove, the merge and the words before an add are the person\'s doors (THE person verdict — a bearer is refused by name)');
}

console.log(fail ? `✗ test-login-sites: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
