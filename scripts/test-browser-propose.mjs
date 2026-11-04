#!/usr/bin/env node
// LANE BROWSER-PROPOSE step 3 — A REFUSAL THE AGENT MEETS BECOMES ONE PROPOSAL (the owner, 2026-09-30: the agent PROPOSES,
// the user decides; D31 stands — nothing switches by itself). lane engine-spi-egress L3 (主开发's D1 / D5): the anti-bot
// backend left the core, and with it every plan that switched a browser (install it, add a site to its list, switch in
// place, a new profile on it) — a tier-2 claim is now ONE proposal that offers nothing, its card and its For-you notice
// saying the one sentence that is true with or without a browser plugin (D5). L4 brings plan kinds over an engine.
// In-process, on a scratch world: the REAL keeper over a fake agent-browser (tests' fixture) on the SHIPPED provider table,
// the REAL routes on port 0, the REAL proposal runner (src/server/browser-propose.js), the REAL handback announcer over a
// fake ladder, a REAL For-you store, a REAL normalizer per conversation (the card's ops), the shipped CLI.
//
//   ① an ephemeral conversation's tier-2 claim (the route): ONE proposal — state unavailable, plan none — ONE card op at
//      the claim's position, ONE For-you NOTICE (no Approve) carrying the card's words line for line (the claim + D5's
//      sentence); a second claim on the host: the SAME card (no op, no item); the agent's answer says why, never a workaround
//   ② the owner-only doors: an agent's bearer on Approve / Reject / GET ⇒ 403 agent_forbidden, nothing moved; no
//      /api/agent twin exists; the user's Approve ⇒ 409 proposal_unavailable (no `shown` ⇒ 400), Reject ⇒ 409
//      proposal_state; the PURE step still refuses an agent and a changed card (the site-reset proposals ride it)
//   ③ (verify r1 V1) a site the browser's site list refused reaches THIS agent by name (never another conversation's);
//      its claim names the site in the card's claim line
//   ⑥ a proposal the user REJECTED before the update (a record from the previous version): the agent hears it ONCE, at
//      its next navigation to the host; a claim while it is untold answers the rejection; after it, a NEW proposal
//   ⑧ a conversation on another machine: the proposal says why (remote); the plan's three whys (PURE)
//   ⑧b (verify r1) another conversation's 50+ cheap claims never evict a standing proposal (the bound drops what nobody waits on)
//   ⑨ a REBUILD places the card by time from the keeper's record, with its latest state, under the SAME id
//   ⑩ the shipped CLI: `blocked` prints the proposal; `open` of a sign-in refusal page prints the may-need-anti-bot hint
//      (step 2 end to end); the rejection note once; ⑩c the baseline intro line; ⑩b what the card draws
//   ⑪ SIX patched-copy controls (scripts/mutant-copy.mjs): no digest check, no actor check, every claim new, the Approve
//      route without the agent-bearer refusal, the audit answer without the lease check (V1), the plain newest-50 bound —
//      each makes a row above red
// Scratch dirs only (/tmp/vs-bprop-<pid>), port 0, no real browser, no vendor call, no real sign-in page.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');
const SW = require('../src/browser-switch.js');
const K = require('../src/server/browser-keeper.js');
const PR = require('../src/server/browser-propose.js');
const HB = require('../src/server/browser-handback.js');
const N = require('../src/normalizers.js');
const RT = require('../src/routes/browser.js');
const { UserTodoManager } = require('../src/user-todos.js');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
const quiet = { log() {}, warn() {}, error() {} };

// ── the scratch world ──
// the fake's daemons are reaped from its launch log at exit — by a hook registered BEFORE scratch()'s own, which removes
// the directory (and that log) at exit: registered after it, the reap read nothing and the conversations' fake browsers
// outlived the suite (measured: two `sleep 600`s per run, on the base too)
let fake = null;
process.on('exit', () => { try { if (fake) fake.reap(); } catch { /* the reap is best-effort */ } });
const ROOT = scratch('bprop');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin');
const AB = path.join(ROOT, 'ab-state');
fake = writeFakeAgentBrowser(BIN, AB);
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const servers = new Set();
process.on('exit', () => { for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
const cdpSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/146.0.7000.1' })); });
servers.add(cdpSrv);
const CDP_PORT = await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port)));

const keeper = K.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([...active.values()].map((s) => s._browserKey)), install: false, log: quiet, hostKnown: () => false });

// ── the conversations: a REAL normalizer each (the card's ops), a stable conversation id ──
const active = new Map();
const opsOf = new Map();
function mkSession(id, bk, name, extra = {}) {
  const mm = N.createMessageManager('claude', id);
  const ops = [];
  mm.onOp((op) => ops.push(op));
  opsOf.set(id, ops);
  const s = { agentToken: 'vsst_' + id.replace(/[^a-z0-9]/g, '').padEnd(24, 'x').slice(0, 24), _browserKey: bk, name, webuiName: name, mode: 'chat', claudeSessionId: 'c0ffee00-0000-4000-8000-' + bk.slice(3).padStart(12, '0'), _normalizer: mm, _historyLoaded: true, backend: 'claude', ...extra };
  active.set(id, s);
  return s;
}
const sA = mkSession('sess-a', 'bk-0000a0a0', 'Portal work');
const sB = mkSession('sess-b', 'bk-0000b0b0', 'Mail triage');
const sR = mkSession('sess-r', 'bk-0000c0c0', 'Remote one', { hostId: 'dev-1' });
const cardOps = (sid, id) => opsOf.get(sid).filter((o) => (o.op === 'create' && o.message && o.message.id === `${sid}:bp:${id}`) || (o.op === 'edit' && o.id === `${sid}:bp:${id}`));

// the For-you store, the fake ladder, the REAL handback announcer, the REAL runner
const todos = new UserTodoManager({ dataDir: DATA, expirySweepMs: 0 });
const sessionKeyFor = (s) => 'claude:' + s.claudeSessionId;
const deliver = {
  async deliverToConversation(cid, text, opts) { return opts && opts.noWake ? { ok: false, refused: 'no-wake', reason: 'no free lane' } : { ok: true, lane: 'message' }; },
  stashFor() { return { stored: true, why: null }; },
};
const hb = HB.create({ keeper, deliver, activeSessions: active, userTodos: todos, sessionKeyFor: (s) => sessionKeyFor(s), log: quiet });
const broadcasts = [];
const runner = PR.create({
  keeper, activeSessions: active, userTodos: todos, sessionKeyFor: (s) => sessionKeyFor(s),
  feedCard: (session, block) => N.feedProposalCard(session, block), tell: (o) => hb.tellProposal(o), broadcast: (m) => broadcasts.push(m), log: quiet,
});
N.setProposalCardSource(({ session = null } = {}) => (session && session._browserKey ? runner.cardsFor(session._browserKey) : []));
const app = express(); app.use(express.json());
RT.setup({ keeper, activeSessions: active, browserEnv: () => null, forwards: () => [], notice: () => {}, persistPin: () => {}, tasksForSession: () => [],
  proposals: { filed: (r) => runner.filed(r), approve: (id, o) => runner.approve(id, o), reject: (id, o) => runner.reject(id, o), rejectionFor: (q) => runner.rejectionFor(q) } });
app.use(RT.router);
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
servers.add(srv);
const API = `http://127.0.0.1:${srv.address().port}`;
const j = async (method, p, body, headers = {}) => { const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const as = (s) => ({ Authorization: 'Bearer ' + s.agentToken });
const WHY_NONE = /no switch can be offered \(this version of VibeSpace offers no one-click switch of browser\)/;
/** a record of the PREVIOUS version: the user rejected this proposal before the update, the agent not told yet */
const rejectedBefore = (id) => keeper.reshapeStore((reg) => { const e = reg.blocked.find((b) => b.id === id); e.proposal = { ...e.proposal, state: 'rejected', told: false, decided: { action: 'reject', by: 'user', at: 1 } }; e.proposal.digest = SW.proposalDigest(e.proposal); });

// ═══ ① the claim ══════════════════════════════════════════════════════════════
console.log('— ① a tier-2 claim is ONE proposal that offers nothing: one card at the claim\'s position, one For-you notice');
const SIGNIN = 'https://accounts.google.com/v3/signin/identifier?TL=AInv3nt3d0b';
let r = await j('POST', '/api/agent/browser/blocked', { url: SIGNIN, why: 'sign-in-refused', evidence: 'the page says: This browser or app may not be secure', tier: 2 }, as(sB));
const idB = r.json && r.json.claim && r.json.claim.id;
const eB = idB ? keeper.proposalEntry(idB) : null;
ok(r.status === 200 && eB && eB.proposal.state === 'unavailable' && eB.proposal.plan.kind === 'none' && eB.proposal.plan.why === 'unavailable' && eB.proposal.backend === null && eB.proposal.site === 'accounts.google.com' && eB.proposal.digest === SW.proposalDigest(eB.proposal),
  'the claim files ONE proposal: unavailable from birth (no plan kind switches a browser in this version), the site = the claim\'s host, a digest over the frozen fields', eB && eB.proposal);
ok(r.json.proposal && r.json.proposal.id === idB && r.json.proposal.state === 'unavailable' && WHY_NONE.test(r.json.next) && /Do not work around it/.test(r.json.next) && /tell them in ONE sentence which page refused you/.test(r.json.next) && !('digest' in r.json.proposal), 'the agent\'s answer: nothing can be offered and why — tell the user in one sentence, do not work around it (no digest handed to the agent)', r.json);
const opsB0 = cardOps('sess-b', idB);
const card0 = opsB0[0] && opsB0[0].message;
ok(opsB0.length === 1 && opsB0[0].op === 'create' && card0.role === 'system' && card0.noticeKind === 'browser-proposal' && card0.content[0].type === 'browser_proposal' && card0.content[0].digest === eB.proposal.digest && card0.content[0].state === 'unavailable', 'ONE card op: a VibeSpace notice keyed by the claim id, carrying the frozen block (structure, never markup)', opsB0);
const itemB = todos.get(eB.proposal.itemId || '');
const L = SW.proposalLines(SW.proposalCardBlock(eB));
const Lnone = L.none || {}; // (a build whose lines have no `none` row reads as a named ✗ below, never a TypeError)
ok(itemB && itemB.origin === 'browser' && itemB.kind === 'notice' && !itemB.action && itemB.i18n.detail.length === 2 && itemB.i18n.detail[0].key === L.claim.key && itemB.i18n.detail[1].key === Lnone.key && Lnone.key === (SW.NO_SWITCH_WORDS || {}).unavailable && itemB.detail.split('\n').length === 2,
  'ONE For-you NOTICE (origin browser, no Approve): its words are the card\'s claim + the one sentence, line for line', itemB);
ok(/refused to sign in this browser/.test(L.claim.key) && /^No switch can be offered: this version of VibeSpace cannot switch a browser for the agent yet\. If a site refuses this browser, install a browser plugin \(⚙ → Plugins → Install plugin…\) and choose it for this profile with Change build…\.$/.test(Lnone.key) && L.plan.length === 0, 'the card\'s words (D5): the claim, then the sentence true with or without a plugin — no plan line', { claim: L.claim.key, none: Lnone.key });
r = await j('POST', '/api/agent/browser/blocked', { url: SIGNIN, why: 'sign-in-refused', tier: 2 }, as(sB));
ok(r.status === 200 && r.json.claim.id === idB && r.json.duplicate === true && cardOps('sess-b', idB).length === 1 && todos.snapshot().open.filter((i) => i.origin === 'browser' && /refused its browser/.test(i.text)).length === 1 && WHY_NONE.test(r.json.next), 'a second claim on the host while the proposal stands ⇒ the SAME card: no op, no second item, the same answer', r.json);

// ═══ ② the owner-only doors ════════════════════════════════════════════════════
console.log('— ② owner-only: an agent never decides; the user\'s Approve of a proposal that offers nothing is refused by name');
const launches0 = fake.launches().length;
for (const [m, p] of [['POST', `/api/browser/proposals/${idB}/approve`], ['POST', `/api/browser/proposals/${idB}/reject`], ['GET', `/api/browser/proposals/${idB}`]]) {
  const x = await j(m, p, m === 'POST' ? { shown: eB.proposal.digest } : undefined, as(sB));
  ok(x.status === 403 && x.json.code === 'agent_forbidden', `${m} ${p.replace(idB, ':id')} with the agent's bearer ⇒ 403 agent_forbidden`, x);
}
const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
const propRoutes = [...rsrc.matchAll(/router\.(get|post)\('(\/api\/browser\/proposals\/[^']*)', [^\n]*\n([^\n]*)\n/g)];
ok(propRoutes.length === 3 && propRoutes.every((m) => /refuseHost/.test(m[3])) && propRoutes.every((m) => rsrc.slice(m.index, m.index + 400).includes('refuseAgentBearer(req, res, PROPOSAL_IS_USERS)')) && !/\/api\/agent\/browser\/proposal/.test(rsrc), 'CENSUS: every proposal route refuses an agent\'s bearer by name, and no /api/agent twin exists', propRoutes.map((m) => m[2]));
r = await j('POST', `/api/browser/proposals/${idB}/approve`, { shown: eB.proposal.digest });
ok(r.status === 409 && r.json.code === 'proposal_unavailable' && keeper.proposalEntry(idB).proposal.state === 'unavailable' && runner.running().length === 0, 'the user\'s Approve naming the card ⇒ 409 proposal_unavailable: nothing ran', r.json);
r = await j('POST', `/api/browser/proposals/${idB}/approve`, {});
ok(r.status === 400 && r.json.code === 'shown_required', 'an Approve naming no card ⇒ 400 shown_required');
r = await j('POST', `/api/browser/proposals/${idB}/reject`, {});
ok(r.status === 409 && r.json.code === 'proposal_state' && keeper.proposalEntry(idB).proposal.state === 'unavailable', 'a Reject of it ⇒ 409 proposal_state (there is nothing to decide)', r.json);
r = await j('GET', `/api/browser/proposals/${idB}`);
ok(r.status === 200 && r.json.proposal && r.json.proposal.id === idB && r.json.proposal.state === 'unavailable', 'the user reads the card (GET)', r.json);
ok(fake.launches().length === launches0 && keeper.list().profiles.length === 0, '…and nothing moved: no browser launched, no profile made');
// the PURE step still guards the proposals that DO run (a site reset rides the same record, card and routes)
const openP = { ...eB.proposal, state: 'open' };
ok(SW.proposalStep(openP, { event: 'approve', by: 'user', shown: 'pd-00000000' }).code === 'proposal_changed' && SW.proposalStep(openP, { event: 'approve', by: 'agent', shown: openP.digest }).code === 'agent_forbidden' && SW.proposalStep(openP, { event: 'approve', by: 'user', shown: openP.digest }).ok === true, 'the PURE step on an OPEN proposal: another card ⇒ proposal_changed, an agent ⇒ agent_forbidden, the user on this card ⇒ a transition');

// ═══ ③ verify r1 V1: what the browser's site list refused reaches THE agent by name ═══
console.log('— ③ a site the page was refused reaches the agent by name (its own browser only); its claim names that site');
{
  // the keeper's answer is stubbed for one profile (an engine's proxy refusing a host is test-browser-builds'): the ROUTE's rule
  // is under test — the refusals of a profile this conversation holds a lease on, since its verb began
  const pE = keeper.createProfile({ label: 'Wrapped' }, { owner: { kind: 'instance', id: null } });
  const u = await j('POST', '/api/agent/browser/use', { profile: pE.id }, as(sB));
  ok(u.status === 200, 'the conversation attaches the profile', u.json);
  const realRefusals = keeper.egressRefusals;
  keeper.egressRefusals = (pid, since) => (pid === pE.id && since > 0 ? ['cdn.unknown-vendor.example'] : []);
  try {
    let au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, profile: pE.id, since: Date.now() - 1 }, as(sB));
    ok(au.status === 200 && au.json.egressRefused && JSON.stringify(au.json.egressRefused.hosts) === '["cdn.unknown-vendor.example"]' && /^this browser's site list refused cdn\.unknown-vendor\.example while this page loaded/.test(au.json.egressRefused.text) && /Do not work around it/.test(au.json.egressRefused.text), 'the agent\'s next verb answer names the refused site, and says not to work around it', au.json);
    au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, profile: pE.id, since: Date.now() - 1 }, as(sA));
    ok(au.status === 200 && !au.json.egressRefused, 'another conversation (no lease on that browser) is never told its refusals', au.json);
  } finally { keeper.egressRefusals = realRefusals; }
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://cdn.unknown-vendor.example/', why: 'egress-refused', tier: 2, profile: pE.id }, as(sB));
  const eS = keeper.proposalEntry(r.json.claim.id);
  const LS = SW.proposalLines(SW.proposalCardBlock(eS));
  ok(eS && eS.proposal.state === 'unavailable' && LS.claim.key === 'The agent says its page needs {host}, which its browser\'s site list refused.' && LS.claim.params.host === 'cdn.unknown-vendor.example' && WHY_NONE.test(r.json.next), 'its claim is ONE card naming the site in its claim line (it offers nothing: the site list is the engine\'s own, ⚙ → Plugins)', { p: eS && eS.proposal, next: r.json.next });
  globalThis.__pE = pE;
}

// ═══ ⑥ a rejection from the previous version ═══════════════════════════════════
console.log('— ⑥ a proposal rejected before the update: the agent hears it ONCE, at its next navigation to the host');
const sN = mkSession('sess-n', 'bk-0000d0d0', 'Shopper');
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://shop.example/checkout', why: 'captcha', tier: 2 }, as(sN));
const idN = r.json.claim.id;
rejectedBefore(idN);
let au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, url: 'https://shop.example/cart', nav: { url: 'https://shop.example/cart', title: 'Cart' } }, as(sN));
ok(au.status === 200 && au.json.proposalRejected && au.json.proposalRejected.site === 'shop.example' && /^the user rejected your proposal for shop\.example — do not work around the refusal/.test(au.json.proposalRejected.text) && keeper.proposalEntry(idN).proposal.told === true, 'the agent\'s next navigation to shop.example carries the rejection (told now)', au.json);
au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, url: 'https://shop.example/cart', nav: { url: 'https://shop.example/cart', title: 'Cart' } }, as(sN));
ok(au.status === 200 && !au.json.proposalRejected, '…ONCE: the next navigation carries nothing');
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://shop.example/checkout', why: 'captcha', tier: 2 }, as(sN));
ok(r.json.claim.id !== idN && keeper.proposalEntry(r.json.claim.id).proposal.state === 'unavailable' && cardOps('sess-n', r.json.claim.id).length === 1, 'a claim after the told rejection opens a NEW proposal (a new card)', r.json);
const idN2 = r.json.claim.id;
rejectedBefore(idN2);
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://shop.example/checkout', why: 'captcha', tier: 2 }, as(sN));
ok(r.json.rejected === true && r.json.claim.id === idN2 && /the user REJECTED your proposal for shop\.example/.test(r.json.next) && keeper.proposalEntry(idN2).proposal.told === true, 'a claim while a rejection is untold ⇒ the agent is told the rejection instead (no new card)', r.json);

// ═══ ⑧ nothing to offer, and why ════════════════════════════════════════════════
console.log('— ⑧ a conversation on another machine: the proposal says why; the plan\'s three whys');
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://x.example/a', why: 'captcha', tier: 2 }, as(sR));
const eR = r.status === 200 ? keeper.proposalEntry(r.json.claim.id) : null;
const itR = eR ? todos.get(eR.proposal.itemId || '') : null;
ok(eR && eR.proposal.state === 'unavailable' && eR.proposal.plan.why === 'remote' && itR && itR.kind === 'notice' && !itR.action && /no switch can be offered \(this conversation runs on another machine\)/.test(r.json.next) && /runs on another machine, and its browser is that machine's/.test((SW.proposalLines(SW.proposalCardBlock(eR)).none || {}).key), 'plan none (remote): state unavailable, a NOTICE item without buttons, the agent and the card told why', { p: eR && eR.proposal, next: r.json && r.json.next });
r = await j('POST', `/api/browser/proposals/${eR.id}/approve`, { shown: eR.proposal.digest });
ok(r.status === 409 && r.json.code === 'proposal_unavailable', 'an Approve of it is refused by name (409 proposal_unavailable)');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok(same(SW.proposalPlan({ remote: true }), { kind: 'none', why: 'remote' }) && same(SW.proposalPlan({ target: { kind: 'profile', host: 'dev-1', label: 'Box' } }), { kind: 'none', why: 'other-machine', profileLabel: 'Box' }) && same(SW.proposalPlan({ target: { kind: 'profile', host: null, label: 'Here' } }), { kind: 'none', why: 'unavailable' }) && same(SW.proposalPlan({}), { kind: 'none', why: 'unavailable' }) && same(SW.PROPOSAL_PLANS, ['none']), 'proposalPlan: remote / a paired machine\'s profile (named) / everything else unavailable — the one plan kind left is none');

// ═══ ⑧b verify r1: the claim store's bound never evicts another conversation's standing proposal ═══════════
console.log('— ⑧b a conversation\'s 50 cheap claims never evict ANOTHER conversation\'s standing proposal (the store drops what nobody waits on first)');
{
  const sY = mkSession('sess-y', 'bk-0000f1f1', 'Payroll');
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://payroll.example/in', why: 'captcha', tier: 2 }, as(sY));
  const idY = r.json.claim.id;
  rejectedBefore(idY); // a rejection not told yet: somebody (the agent) still waits on it — rank 3
  const sX = mkSession('sess-x', 'bk-0000f2f2', 'Crawler');
  for (let i = 0; i < 60; i++) await j('POST', '/api/agent/browser/blocked', { url: `https://h${i}.example/`, why: 'http-403', tier: 1 }, as(sX));
  const eY = keeper.proposalEntry(idY);
  ok(eY && eY.proposal.state === 'rejected' && eY.proposal.told === false && runner.cardsFor(sY._browserKey).some((c) => c.id === idY), 'after 60 tier-1 claims by another conversation the untold rejection is still there: its card, the agent still to be told', eY && eY.proposal.state);
  const x = await j('GET', `/api/browser/proposals/${idY}`);
  ok(x.status === 200, '…and it can still be read (no 404)', x);
}

// ═══ ⑨ a rebuild places the card ═══════════════════════════════════════════════
console.log('— ⑨ a REBUILD places the card by time, with its latest state, under the same id');
await N.rebuildHistory(sB, 'sess-b', [], {});
const rebuilt = sB._normalizer.messages.find((m) => m.id === `sess-b:bp:${idB}`);
ok(rebuilt && rebuilt.noticeKind === 'browser-proposal' && rebuilt.content[0].state === 'unavailable' && rebuilt.ts === keeper.proposalEntry(idB).at, 'the rebuilt conversation draws the proposal card from the keeper\'s record (state unavailable), at the claim\'s instant', rebuilt && rebuilt.content[0]);
ok(N.browserCardsFor({ session: sB }).filter((c) => c.type === 'browser_proposal' && c.id === idB).length === 1, 'the card source names it once');

// ═══ ⑩ the shipped CLI ══════════════════════════════════════════════════════════
console.log('— ⑩ the shipped CLI: blocked prints the proposal, a sign-in refusal page prints the hint, the rejection once');
{
  const pw = path.join(ROOT, 'passwd.cjs'); fs.writeFileSync(pw, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(HOME)} });\n`);
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(CDP_PORT), VIBESPACE_API: API };
  const cli = (s, args) => new Promise((resolve) => execFile(process.execPath, ['--require', pw, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...cliEnv, VIBESPACE_SESSION_TOKEN: s.agentToken }, encoding: 'utf8', timeout: 30000, cwd: ROOT }, (err, so, se) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(so || ''), err: String(se || '') })));
  const sC = mkSession('sess-c', 'bk-0000e0e0', 'Calendar');
  const bl = await cli(sC, ['blocked', '--url', 'https://calendar.example/in', '--why', 'captcha', '--tier', '2']);
  ok(bl.status === 0 && /recorded your claim/.test(bl.out) && /no switch can be offered/.test(bl.out) && /^proposal bl-[0-9a-f]{8}: nothing can be offered here$/m.test(bl.out), 'vibespace-browser blocked --tier 2 prints the next step and the proposal (nothing to offer)', bl.out + bl.err);
  // the sign-in HINT end to end: the conversation attached to a profile, `open` of a page whose final url + title are Google's refusal
  keeper.createProfile({ label: 'Cal' }, { owner: { kind: 'instance', id: null } });
  const u = await cli(sC, ['use', 'Cal']);
  ok(u.status === 0, 'the conversation attaches a profile', u.out + u.err);
  const REFUSED = 'https://accounts.google.com/v3/signin/rejected?TL=AInv3nt3d0c';
  fs.writeFileSync(path.join(AB, 'titles.json'), JSON.stringify({ [REFUSED]: 'Couldn\'t sign you in', 'https://calendar.example/in': 'Calendar' }));
  const op = await cli(sC, ['open', REFUSED]);
  ok(op.status === 0 && /^hint: may-need-anti-bot — Google's sign-in page says this browser may not be secure — a hint from the page, not a detection/m.test(op.err) && /--why sign-in-refused --tier 2/.test(op.err) && !/may-need-cloak/.test(op.err), 'step 2 END TO END: `open` of the refusal page ⇒ the may-need-anti-bot hint on stderr, printed like the 403/429 one (D3: the server\'s word, the CLI echoes it)', op.out + op.err);
  const op2 = await cli(sC, ['open', 'https://calendar.example/in']);
  ok(op2.status === 0 && !/hint:/.test(op2.err), 'an ordinary page carries no hint', op2.err);
  rejectedBefore(bl.out.match(/proposal (bl-[0-9a-f]{8})/)[1]);
  const op3 = await cli(sC, ['open', 'https://calendar.example/in']);
  const op4 = await cli(sC, ['open', 'https://calendar.example/in']);
  ok(/note: the user rejected your proposal for calendar\.example .*\[proposal_rejected\]/.test(op3.err) && !/proposal_rejected/.test(op4.err), 'a rejection untold: the next `open` of the host prints the rejection note ONCE, the one after nothing', op3.err + ' ||| ' + op4.err);
}

// ═══ ⑩c verify r1 V7: the agent's baseline intro teaches the claim (one clause) ═══════════════
console.log('— ⑩c the baseline browser intro line names the ONE command a refused site takes (never a workaround)');
{
  const AR = require('../src/agent-routes.js');
  const iso = [...B.ISOLATED_VARIANTS].map((v) => { try { return AR.browserIntroLine(v); } catch { return ''; } }).find((l) => /THIS conversation's own browser/.test(l)) || '';
  ok(/a site that refuses the browser ⇒ `vibespace-browser blocked --url <u> --tier 2` \(the user approves the switch — never a workaround\)/.test(iso), 'the intro line (the isolated variant) carries the one clause: a refused site ⇒ `blocked --url <u> --tier 2`, never a workaround', iso.slice(0, 600));
}

// ═══ ⑩b what the card draws ════════════════════════════════════════════════════
console.log('— ⑩b the card draws no character that is not drawn: the URL parsed (ASCII), the agent\'s words cleaned — what shows is what runs');
{
  const dH = path.join(ROOT, 'data-hidden'); fs.mkdirSync(dH, { recursive: true });
  const kH = K.create({ dataDir: dH, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB }), serverSetting: () => undefined, liveKeys: () => new Set(['bk-000d1dd0']), install: false, log: quiet, hostKnown: () => false });
  const RLO = String.fromCodePoint(0x202e), ZWSP = String.fromCodePoint(0x200b);
  const out = kH.blocked({ url: `https://hidden.example/a${RLO}gnp.exe?q=${ZWSP}1`, why: `sign${ZWSP}-in-refused`, evidence: `it said ${RLO}olleh`, sessionName: `Ops${RLO} desk`, tier: 2, browserKey: 'bk-000d1dd0', sessionId: 's' });
  const e = kH.proposalEntry(out.claim.id), b = SW.proposalCardBlock(e);
  const L2 = SW.proposalLines(b);
  const drawn = JSON.stringify([b.url, b.why, b.evidence, SW.lineText(L2.claim), L2.none ? SW.lineText(L2.none) : '']);
  ok(e.proposal.url === 'https://hidden.example/a%E2%80%AEgnp.exe?q=%E2%80%8B1' && b.url === e.proposal.url && b.why === 'sign-in-refused' && b.evidence === 'it said olleh' && !/[​‮]/.test(drawn) && e.proposal.digest === SW.proposalDigest(e.proposal),
    'a bidi override / zero-width character the agent sent: the card\'s URL is the parsed one (percent-encoded, the page that reopens), its code and evidence carry none', { url: e.proposal.url, why: b.why, evidence: b.evidence });
  const odd = SW.proposalFor({ claim: { id: 'bl-0000abcd', host: 'odd.example', url: 'https://odd.example:99999/x' }, plan: { kind: 'none', why: 'unavailable' } });
  ok(SW.proposalUrlOf('accounts.google.com/x') === 'https://accounts.google.com/x' && SW.proposalUrlOf('http://[') === '' && odd.url === 'https://odd.example/' && odd.state === 'unavailable', 'proposalUrlOf: a bare host gets https://; a URL that does not parse reopens the site\'s root (never an empty page)', odd);
}

// ═══ ⑩d round 2 (主开发's law E): every word the card says has a zh AND a ja entry ═══════════════════════
console.log('— ⑩d every key the proposal card says (proposalStateText\'s state lines included) is an entry in BOTH dictionaries');
{
  const { dictHasEntry } = await import('./i18n-check.mjs');
  const card = fs.readFileSync(path.join(REPO, 'src/lib/browser-proposal-card.js'), 'utf8');
  const keys = [...new Set([...card.matchAll(/i18nKey\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1].replace(/\\'/g, "'")))];
  const dicts = ['zh', 'ja'].map((l) => fs.readFileSync(path.join(REPO, `src/lib/i18n-${l}.js`), 'utf8'));
  const has = (d, k) => dictHasEntry(d, k) || d.includes(`  ${JSON.stringify(k)}:`); // a key with a double quote sits escaped (dictHasEntry matches raw)
  const missing = keys.filter((k) => !dicts.every((d) => has(d, k)));
  const state = card.slice(card.indexOf('export function proposalStateText'), card.indexOf('/** lane site-reset: a site-reset proposal'));
  ok(keys.length >= 10 && keys.includes('Done.') && /tt\(i18nKey\('Done\.'\)\)/.test(state) && missing.length === 0, `the card's ${keys.length} keys — every state line proposalStateText answers among them («Done.» too) — are entries in zh AND ja`, missing);
}

// ═══ ⑪ controls ═════════════════════════════════════════════════════════════════
console.log('— ⑪ six patched-copy controls, each judged by a row above');
const M = mutantCopies('bprop-propose', REPO);
const swSrc = fs.readFileSync(path.join(REPO, 'src/browser-switch.js'), 'utf8');
{ // c1 — no digest check
  const cut = "    if (shown !== p.digest) return refuse('proposal_changed', 'the card you pressed is not this proposal as it stands — nothing ran; read it again');\n";
  ok(swSrc.includes(cut), 'c1: the digest check is where the control cuts it');
  const m = M.load('src/browser-switch.js', swSrc.replace(cut, ''), 'no-digest');
  const v = m.proposalStep(openP, { event: 'approve', by: 'user', shown: 'pd-00000000' });
  ok(v.ok === true, 'CONTROL c1: without the digest check an Approve naming another card RUNS — ② "proposal_changed" would be red');
}
{ // c2 — no actor check
  const cut = "  if (human && by !== 'user') return refuse('agent_forbidden', 'approving or rejecting a proposal is the user\\'s act — an agent cannot decide its own proposal');\n";
  ok(swSrc.includes(cut), 'c2: the actor check is where the control cuts it');
  const m = M.load('src/browser-switch.js', swSrc.replace(cut, ''), 'no-actor');
  const v = m.proposalStep(openP, { event: 'approve', by: 'agent', shown: openP.digest });
  ok(v.ok === true, 'CONTROL c2: without the actor check an AGENT\'s approve is a transition — the PURE refusal behind ② would be gone');
}
{ // c3 — every claim a new proposal (the keeper without claimVerdict's `same`)
  const kSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const cut = "    const cv = SW.claimVerdict({ existing: prior, tier: v.value.tier });";
  ok(kSrc.includes(cut), 'c3: the keeper asks claimVerdict where the control cuts it');
  const Km = M.load('src/server/browser-keeper.js', kSrc.replace(cut, "    const cv = v.value.tier === 2 ? 'new' : 'claim-only';"), 'always-new');
  const d3 = path.join(ROOT, 'data-c3'); fs.mkdirSync(d3, { recursive: true });
  const k3 = Km.create({ dataDir: d3, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB }), serverSetting: () => undefined, liveKeys: () => new Set(['bk-000c3c30']), install: false, log: quiet, hostKnown: () => false });
  k3.blocked({ url: 'https://dup.example/x', tier: 2, browserKey: 'bk-000c3c30', sessionId: 's' });
  k3.blocked({ url: 'https://dup.example/x', tier: 2, browserKey: 'bk-000c3c30', sessionId: 's' });
  ok(k3.proposalsFor('bk-000c3c30').length === 2, 'CONTROL c3: without the SAME-card rule a second claim makes a SECOND proposal (a second card) — ① "the SAME card" would be red');
}
{ // c6 — the Approve route without the agent-bearer refusal
  const cut = "  if (refuseAgentBearer(req, res, PROPOSAL_IS_USERS)) return;\n  const pr = proposalsOr503(res); if (!pr) return;\n  if (!PROPOSAL_ID_RE.test(String(req.params.id || ''))) return res.status(400).json({ error: 'bad id', code: 'bad-request' });\n  const shown";
  ok(rsrc.includes(cut), 'c6: the Approve route refuses an agent\'s bearer where the control cuts it');
  const Rm = M.load('src/routes/browser.js', rsrc.replace(cut, "  const pr = proposalsOr503(res); if (!pr) return;\n  if (!PROPOSAL_ID_RE.test(String(req.params.id || ''))) return res.status(400).json({ error: 'bad id', code: 'bad-request' });\n  const shown"), 'no-bearer-refusal');
  const app6 = express(); app6.use(express.json());
  Rm.setup({ keeper, activeSessions: active, proposals: { approve: () => ({ ok: true, started: true }) } });
  app6.use(Rm.router);
  const s6 = await new Promise((rr) => { const s = app6.listen(0, '127.0.0.1', () => rr(s)); });
  servers.add(s6);
  const x6 = await fetch(`http://127.0.0.1:${s6.address().port}/api/browser/proposals/${idB}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...as(sB) }, body: JSON.stringify({ shown: 'pd-x' }) });
  ok(x6.status === 200, 'CONTROL c6: a route without the refusal lets an AGENT\'s bearer approve — ② "403 agent_forbidden" would be red', x6.status);
}
{ // c8 — verify r1 V1: the audit answer without the lease check tells ANOTHER conversation what this browser was refused
  const cut = " && typeof k.leasesFor === 'function' && k.leasesFor(f.browserKey).some((l) => l.profileId === profileId)";
  ok(rsrc.includes(cut), 'c8: the audit answer asks for a lease where the control cuts it');
  const Rm = M.load('src/routes/browser.js', rsrc.replace(cut, ''), 'no-lease-check');
  const app8 = express(); app8.use(express.json());
  const pE = globalThis.__pE;
  const k8 = Object.assign(Object.create(keeper), keeper, { egressRefusals: (pid) => (pid === pE.id ? ['cdn.unknown-vendor.example'] : []) }); // the same stubbed answer as ③
  Rm.setup({ keeper: k8, activeSessions: active, proposals: { rejectionFor: () => null } });
  app8.use(Rm.router);
  const s8 = await new Promise((rr) => { const s = app8.listen(0, '127.0.0.1', () => rr(s)); });
  servers.add(s8);
  const x8 = await (await fetch(`http://127.0.0.1:${s8.address().port}/api/agent/browser/audit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...as(sA) }, body: JSON.stringify({ verb: 'open', ok: true, profile: pE.id, since: 1 }) })).json();
  ok(!!(x8 && x8.egressRefused), 'CONTROL c8: without the lease check another conversation reads this browser\'s refusals — ③ "never told its refusals" would be red', x8);
}
{ // c11 — verify r1: the keeper's store with the plain newest-50 bound evicts a standing proposal of another conversation
  const kSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const cut = "    const kept = SW.blockedKeep([...reg.blocked.filter((b) => !(mineOn(b) && !b.proposal)), entry]);";
  ok(kSrc.includes(cut), 'c11: the keeper bounds its claims through blockedKeep where the control cuts it');
  const Km = M.load('src/server/browser-keeper.js', kSrc.replace(cut, "    const kept = { keep: [...reg.blocked.filter((b) => !(mineOn(b) && !b.proposal)), entry].slice(-50), dropped: [] };"), 'slice-50');
  const d11 = path.join(ROOT, 'data-c11'); fs.mkdirSync(d11, { recursive: true });
  const k11 = Km.create({ dataDir: d11, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB }), serverSetting: () => undefined, liveKeys: () => new Set(['bk-000c1111', 'bk-000c2222']), install: false, log: quiet, hostKnown: () => false });
  const y = k11.blocked({ url: 'https://payroll.example/in', tier: 2, browserKey: 'bk-000c1111', sessionId: 'y' });
  k11.reshapeStore((reg) => { const e = reg.blocked.find((b) => b.id === y.claim.id); e.proposal = { ...e.proposal, state: 'rejected', told: false }; });
  for (let i = 0; i < 60; i++) k11.blocked({ url: `https://h${i}.example/`, tier: 1, browserKey: 'bk-000c2222', sessionId: 'x' });
  ok(!k11.proposalEntry(y.claim.id), 'CONTROL c11: the plain newest-50 bound drops the other conversation\'s untold rejection — ⑧b would be red');
}
for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 6 })) ok(c.pass, c.name, c.detail);

todos.stop();
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? ` passed, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
