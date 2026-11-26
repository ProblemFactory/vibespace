#!/usr/bin/env node
// test-login-change-password — B-ab6c (the owner 2026-11-26, lane login-request-card, 主开发 r5018 / r5023): A STORED WEBSITE LOGIN's
// PASSWORD CHANGED DIRECTLY. The release changed it only by Add… with the same site and user name, in silence (src/server/browser-logins.js
// addOwn updated in place; the form never said so). Now the PERSON's form says what it means (`expect`):
//   ① the add door: 'new' (the Add dialog, the new-login card) refuses a site and user name that name a login already here
//     (login_would_update, with the site and user, NOTHING written — the form says it before the save); 'update' (Change password…)
//     saves only over the login that is there — the old password kept as previous, the grants and the two-step binding untouched,
//     a pending generated candidate dropped (as the release does) — and never creates one (login_gone); absent: the release's road
//   ② «Use the previous password»: the person's swap (current ⇄ previous, rev+1), pressed again it is undone; a login with none is
//     refused by name (login_no_previous); a row shown before a change is refused (card_changed); one audit line, never a value
//   ③ the routes and the card carry `expect`; the swap's route is a person's (the press verdict)
//   ④ (主开发 r5200, the round's must) WHOSE a login is stands: a login a conversation saved itself (its OWNER: it fills with no grant
//     row) stays its own through Change password… / the update card, the swap and the Add door's update; a new one is nobody's
// REDs: copies of the door with each new line planted back to the release's (scripts/mutant-copy.mjs, anchored: a gone anchor fails
// by name). The REAL vault engine over a scratch data folder, the REAL grants store in memory, a stand-in of For you. No vendor call.
// Run: node scripts/test-login-change-password.mjs
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const BL = require(path.join(REPO, 'src/browser-login.js'));
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const LG_REL = 'src/server/browser-logins.js', BL_REL = 'src/browser-login.js';
const LGSRC = fs.readFileSync(path.join(REPO, LG_REL), 'utf8'), BLSRC = fs.readFileSync(path.join(REPO, BL_REL), 'utf8');
const M = mutantCopies('login-change-password', REPO);
const quiet = { log() {}, warn() {}, error() {} };
const pw = (tag) => `${tag}#${crypto.randomBytes(6).toString('hex')}`;   // made-up passwords, built at run time
const SITE = 'https://shop.example.test', USER = 'alice', NAME = BL.entryName(SITE, USER);

let n = 0;
async function world(Lmod) {
  const dataDir = path.join(scratch('login-change-password'), `w${++n}`);
  fs.mkdirSync(dataDir, { recursive: true });
  let clock = 1_750_000_000_000;
  const eng = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
  await eng.setup(`Vault#${crypto.randomBytes(6).toString('hex')}`);
  eng.secretPut('totp:shop-2fa', ['JBSWY3DP', 'EHPK3PXP'].join(''));
  const grants = GS.create({ memory: true });
  const audits = [];
  const realAudit = eng.audit ? eng.audit.bind(eng) : null;
  eng.audit = (what, o) => { audits.push({ what, o }); try { realAudit && realAudit(what, o); } catch { } };
  const items = new Map(); let seq = 0;
  const forYou = { add(p, it) { const id = `ut-cp${++seq}`; items.set(id, { id, status: 'open', ...it }); return id; }, resolve(id) { const it = items.get(id); if (it) it.status = 'done'; }, list({ status } = {}) { return [...items.values()].filter((x) => !status || x.status === status); } };
  const logins = Lmod.create({ vault: eng, grants: () => grants, forYou, now: () => (clock += 1000), log: () => {} });
  const rec = (name = NAME) => { const g = eng.secretGet(name); return g && g.value ? BL.recordOf(g.value.toString('utf8')) : null; };
  return { eng, grants, logins, rec, audits, dataDir };
}
const Lm = require(path.join(REPO, LG_REL));

console.log('— ① the add door says what the form means: new, update, or the release\'s road');
{
  const W = await world(Lm);
  const P1 = pw('One'), P2 = pw('Two'), P3 = pw('Three');
  const a = W.logins.addOwn({ origin: SITE, username: USER, password: P1, totpName: 'shop-2fa', expect: 'new' }, { who: 'owner' });
  ok(!!a.ok && a.updated === false && W.rec().current.password === P1, 'a NEW login with expect new is saved (nothing was there)', a);
  W.logins.grant(NAME, 'this-account', 'session:conv-cp1');
  const rowsBefore = JSON.stringify(W.grants.rowsOfDoor(BL.DOOR));
  const revBefore = W.rec().rev;
  const b = W.logins.addOwn({ origin: SITE, username: USER, password: P2, expect: 'new' }, { who: 'owner' });
  ok(!b.ok && b.code === 'login_would_update' && b.site === SITE && b.user === USER && b.name === NAME, 'expect new over a login already here: refused login_would_update, naming its site and user (the form says it BEFORE the save)', b);
  ok(W.rec().current.password === P1 && W.rec().rev === revBefore, '…and NOTHING was written: the current password and the rev as they were');
  const c = W.logins.addOwn({ origin: SITE, username: USER, password: P2, expect: 'update' }, { who: 'owner' });
  const r2 = W.rec();
  ok(!!c.ok && c.updated === true && r2.current.password === P2 && r2.previous && r2.previous.password === P1 && r2.rev === revBefore + 1, 'expect update: saved over the login that is there — the new one current, the old one kept as previous, rev+1', { ok: c.ok, updated: c.updated, rev: r2.rev });
  ok(r2.totpName === 'shop-2fa' && JSON.stringify(W.grants.rowsOfDoor(BL.DOOR)) === rowsBefore, '…the two-step binding and the grants untouched');
  const d = W.logins.addOwn({ origin: 'https://other.example.test', username: 'bob', password: P3, expect: 'update' }, { who: 'owner' });
  ok(!d.ok && d.code === 'login_gone' && W.rec(BL.entryName('https://other.example.test', 'bob')) === null, 'expect update for a login that is not there: refused login_gone — it never creates one', d);
  const e = W.logins.addOwn({ origin: SITE, username: USER, password: P3 }, { who: 'owner' });
  ok(!!e.ok && e.updated === true && W.rec().current.password === P3 && W.rec().previous.password === P2, 'no expect: the release\'s road (an update in place) for an older caller', e);
  const valueSeen = JSON.stringify(W.audits).includes(P1) || JSON.stringify(W.audits).includes(P2) || JSON.stringify([a, b, c, d, e]).includes(P2);
  ok(!valueSeen, 'no answer and no audit line carries a password');
}

console.log('— ② «Use the previous password»: the person\'s swap, undone by pressing again');
{
  const W = await world(Lm);
  const P1 = pw('One'), P2 = pw('Two');
  W.logins.addOwn({ origin: SITE, username: USER, password: P1, expect: 'new' }, { who: 'owner' });
  const none = W.logins.usePrevious(NAME, { who: 'owner' });
  ok(!none.ok && none.code === 'login_no_previous', 'a login that keeps no previous password: refused by name (the row shows no door then)', none);
  W.logins.addOwn({ origin: SITE, username: USER, password: P2, expect: 'update' }, { who: 'owner' });
  const rev0 = W.rec().rev;
  const s1 = W.logins.usePrevious(NAME, { rev: rev0, who: 'owner' });
  ok(!!s1.ok && W.rec().current.password === P1 && W.rec().previous.password === P2 && W.rec().rev === rev0 + 1, 'the swap: the previous one current, the current one previous, rev+1', s1);
  const s2 = W.logins.usePrevious(NAME, { rev: W.rec().rev, who: 'owner' });
  ok(!!s2.ok && W.rec().current.password === P2 && W.rec().previous.password === P1, 'pressed again: undone (the new one current again)', s2);
  const stale = W.logins.usePrevious(NAME, { rev: rev0, who: 'owner' });
  ok(!stale.ok && stale.code === 'card_changed' && W.rec().current.password === P2, 'a row shown before a change: refused card_changed, nothing swapped', stale);
  const used = W.audits.filter((x) => x.what === 'vault-web-login-previous-used');
  ok(used.length === 2 && used.every((x) => x.o && x.o.why === NAME && x.o.by === 'human') && !JSON.stringify(used).includes(P1) && !JSON.stringify(used).includes(P2), 'one audit line a swap — the entry and the person, never a value', used);
  W.eng.lock('test');
  const locked = W.logins.usePrevious(NAME, { who: 'owner' });
  ok(!locked.ok && locked.code === 'vault_locked', 'a locked vault: refused by name, nothing swapped', locked);
}

console.log('— REDs: the release\'s lines planted back in copies');
{
  const NEW_LINE = "    if (expect === 'new' && ex.rec) return named('login_would_update',";
  const RNew = require(M.write(LG_REL, anchored(LGSRC, NEW_LINE, "    if (false) return named('login_would_update',", 'the release add door (no expect new)'), 'no-expect-new'));
  const W1 = await world(RNew); const P1 = pw('One'), P2 = pw('Two');
  W1.logins.addOwn({ origin: SITE, username: USER, password: P1, expect: 'new' }, { who: 'owner' });
  const r1 = W1.logins.addOwn({ origin: SITE, username: USER, password: P2, expect: 'new' }, { who: 'owner' });
  ok(!!r1.ok && W1.rec().current.password === P2, 'RED (the release\'s add door): the same Add saves over the login in silence — its password changed with no word', r1);
  const GONE_LINE = "    if (expect === 'update' && !ex.rec) return named('login_gone',";
  const RGone = require(M.write(LG_REL, anchored(LGSRC, GONE_LINE, "    if (false) return named('login_gone',", 'an update that creates'), 'update-creates'));
  const W2 = await world(RGone);
  const r2 = W2.logins.addOwn({ origin: 'https://other.example.test', username: 'bob', password: P1, expect: 'update' }, { who: 'owner' });
  ok(!!r2.ok && W2.rec(BL.entryName('https://other.example.test', 'bob')) !== null, 'RED (an update that creates): Change password… on a login gone meanwhile makes a new one', r2);
  const SWAP_LINE = "    current: { password: str(prev.password), source: prev.source || 'owner', strength: prev.strength || 'unknown', setAt: now },";
  const BLX = M.write(BL_REL, anchored(BLSRC, SWAP_LINE, '    current: r.current,', 'a swap that keeps the current one'), 'swap-keeps');
  const RSwap = require(M.write(LG_REL, anchored(LGSRC, "const BL = require('../browser-login.js');", `const BL = require(${JSON.stringify(BLX)});`, 'the door over the swap copy'), 'swap-door'));
  const W3 = await world(RSwap);
  W3.logins.addOwn({ origin: SITE, username: USER, password: P1, expect: 'new' }, { who: 'owner' });
  W3.logins.addOwn({ origin: SITE, username: USER, password: P2, expect: 'update' }, { who: 'owner' });
  W3.logins.usePrevious(NAME, { who: 'owner' });
  ok(W3.rec().current.password === P2, 'RED (a swap that keeps the current one): «Use the previous password» changes nothing a person typed wrong');
}

console.log('— ④ WHOSE a login is stands through an update and a swap (主开发 r5200)');
const ownVia = (Wx, name = NAME, conv = 'conv-own') => { const r = Wx.logins.mayUseFor({ conversationKeys: [conv] }).find((x) => x.resource === name); return r && r.ok ? r.via : null; };
const ownRoad = async (Lmod) => {
  const W = await world(Lmod); const P1 = pw('One'), P2 = pw('Two');
  const s0 = W.logins.addAgent({ origin: SITE, username: USER, password: P1 }, { owner: 'conv-own', actor: 'conv-own' });   // the agent's OWN save (owner = its conversation)
  const o0 = ownVia(W);
  const u = W.logins.addOwn({ origin: SITE, username: USER, password: P2, expect: 'update' }, { who: 'owner' });   // Change password… / the update card
  const o1 = ownVia(W);
  const sw = W.logins.usePrevious(NAME, { rev: W.rec().rev, who: 'owner' });
  const o2 = ownVia(W);
  const plain = W.logins.addOwn({ origin: SITE, username: USER, password: P2 }, { who: 'owner' });   // the Add door's road (no expect) over it
  const o3 = ownVia(W);
  return { W, s0, u, sw, plain, o0, o1, o2, o3, P1 };
};
{
  const r = await ownRoad(Lm);
  ok(r.s0.ok && r.o0 === 'own' && r.u.ok && r.o1 === 'own' && r.sw.ok && r.o2 === 'own' && r.plain.ok && r.o3 === 'own',
    'a login a conversation SAVED ITSELF stays its own — it fills as its OWNER, with no grant row — through the update, «Use the previous password» and the Add door\'s update', { o0: r.o0, o1: r.o1, o2: r.o2, o3: r.o3 });
  const BOB = BL.entryName('https://other.example.test', 'bob');
  const fresh = r.W.logins.addOwn({ origin: 'https://other.example.test', username: 'bob', password: r.P1, expect: 'new' }, { who: 'owner' });
  ok(!!fresh.ok && ownVia(r.W, BOB) === null, '…and a NEW login a person adds is nobody\'s to fill until it is granted (no owner)');
  const UPD_LINE = '    const w = ex.rec ? writeEntry(n, rec) : writeEntry(n, rec, { actor: null, owner: null });';
  const rU = await ownRoad(require(M.write(LG_REL, anchored(LGSRC, UPD_LINE, '    const w = writeEntry(n, rec, { actor: null, owner: null });', 'an update that clears the owner'), 'update-clears-owner')));   // stale-pins: kept — the RED control plants the release's line back
  ok(rU.o0 === 'own' && rU.o1 === null, 'RED (today\'s line before the round: the update hands the writer an EMPTY owner): after the person typed the password it asked for, the conversation may no longer fill its own login', { o0: rU.o0, o1: rU.o1 });
  const SWAP_W = '    const w = writeEntry(name, rec);   // r5200: the swap changes the value only';
  const rS = await ownRoad(require(M.write(LG_REL, anchored(LGSRC, SWAP_W, '    const w = writeEntry(name, rec, { actor: null, owner: null });   //', 'a swap that clears the owner'), 'swap-clears-owner')));
  ok(rS.o1 === 'own' && rS.o2 === null, 'RED (a swap that clears the owner): «Use the previous password» takes the login away from the conversation that saved it', { o1: rS.o1, o2: rS.o2 });
}

console.log('— ③ the routes and the card carry what the form means');
{
  const RT = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
  ok(RT.includes("totpName: b.totpName || null, expect: b.expect === 'new' || b.expect === 'update' ? b.expect : null }"), 'the add route hands the door the form\'s `expect` (new | update, anything else the release\'s road)');
  ok(RT.includes("app.post('/api/vault/web-logins/use-previous', noStoreL(person((req) => { const b = bodyL(req); return logins.usePrevious(String(b.name || ''), { rev: b.rev, who: whoL(req) }); })));"), 'the swap\'s route is a PERSON\'s door (the press verdict), by name and rev — no value');
  ok(RT.includes("...(b.expect === 'new' || b.expect === 'update' ? { expect: b.expect } : {}) }"), 'the card\'s answer route carries `expect` to the paste door');
  const PD = fs.readFileSync(path.join(REPO, 'src/server/vault-paste-door.js'), 'utf8');
  ok(PD.includes("totpName: v.totpName, expect: l.expect === 'update' ? 'update' : 'new' }"), 'the new-login card saves with expect new (never a silent overwrite) unless the person pressed again (update)');
  const ROW = fs.readFileSync(path.join(REPO, 'src/lib/vault-login-row.js'), 'utf8');
  ok(ROW.includes("t('Change password…')") && ROW.includes("if (entry.hasPrevious) {") && ROW.includes("expect: 'update' });") && ROW.includes("if (r && r.code === 'login_would_update') { expect = 'update';"), 'the page: the row\'s Change password… door, the swap only where a previous one exists, the change form saves an update, the Add dialog turns to an update only after the server named one');
}

console.log('— ⑤ one ask, one set of words (主开发 r5287 must 3): an update ask says the card\'s words wherever it is answered');
{
  const VW = fs.readFileSync(path.join(REPO, 'src/lib/vault-window.js'), 'utf8'), IW = fs.readFileSync(path.join(REPO, 'src/lib/inbox-window.js'), 'utf8'), BX = fs.readFileSync(path.join(REPO, 'src/lib/vault-paste-box.js'), 'utf8'), FA = require(path.join(REPO, 'src/foryou-actions.js'));
  ok(VW.includes("deny: upd ? t('It still works') : t('Deny')") && VW.includes("paste: upd ? t('Change password') : t('Paste and save…')"), 'the Vault window\'s «Needs you» strip: an update ask\'s doors are «Change password» and «It still works» (the paste door opens the same box: secretBoxEl picks the update box)');
  ok(IW.includes("actBtn('secret-paste', UI_ICONS.check, t('Change password')") && IW.includes("actBtn('secret-deny', UI_ICONS.close, t('It still works')"), 'the For-you window: the same two words for the same ask');
  ok(BX.includes("item && item.action && item.action.update ? t('The agent is told the stored password still works')"), 'the toast after «It still works» says what was pressed, never «Refused»');
  const item = { action: { type: 'secret-request', update: NAME, requestId: 'sr-0123456789ab' }, resolvedBy: 'denied', resolvedFact: { decidedBy: 'person', decidedAt: Date.now() }, createdAt: Date.now() };
  const st = FA.decidedStamp(item), plain = FA.decidedStamp({ ...item, action: { type: 'secret-request', requestId: 'sr-0123456789ab' } });
  ok(!!st && st.verb === 'you said it still works' && !!plain && plain.verb === 'refused by you', 'the settled line: an update ask\'s «It still works» reads «you said it still works»; any other paste ask keeps «refused by you»', { st, plain });
}

report();
