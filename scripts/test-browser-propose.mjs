#!/usr/bin/env node
// LANE BROWSER-PROPOSE step 3 — A REFUSAL THE AGENT MEETS BECOMES ONE PROPOSAL WITH ONE APPROVE (the owner, 2026-09-30:
// the agent PROPOSES the backend switch, the user only presses Approve; D31 stands — nothing switches by itself).
// In-process, on a scratch world: the REAL keeper over a fake agent-browser (tests' fixture), the REAL routes on port 0,
// the REAL proposal runner (src/server/browser-propose.js) with a FAKE install runner, the REAL handback announcer's
// tell over a fake ladder, a REAL For-you store, a REAL normalizer per conversation (the card's ops), the shipped CLI.
//
//   ① an ephemeral conversation's tier-2 claim (the route): ONE proposal — plan new-profile (ephemeral), install needed —
//      ONE card op at the claim's position, ONE For-you item carrying the card's words line for line + the digest;
//      a second claim on the host: the SAME card (no op, no item); the agent's CLI answer says a card waits
//   ② the owner-only doors: an agent's bearer on Approve / Reject / GET ⇒ 403 agent_forbidden, nothing moved; no
//      /api/agent twin exists; a wrong `shown` ⇒ 409 proposal_changed, nothing ran; no `shown` ⇒ 400
//   ③ APPROVE runs exactly the frozen fields: the fake install (its progress ON THE CARD — 34 %), only the claim's host
//      added to browser.cloak.egressAllowlist, a NEW CloakBrowser profile "<name> · CloakBrowser" this conversation is
//      pinned + attached to, a CloakBrowser launch, the claim's page opened in its tab, the agent TOLD through the
//      handback's ONE ladder site with noWake (a claude turn: stashed for the next turn — never a wake); the card was
//      created ONCE and every later op is an in-place `edit` of its content (never a status ⇒ never a swap); the
//      For-you item is answered
//   ④ a named chromium profile the ladder admits ⇒ the IN-PLACE switch (switchBackend, the user's act): the same
//      directory on CloakBrowser, its tab reopened; the tell steered into a running turn when that is free
//   ⑤ a profile a NEWER Chromium wrote ⇒ a new profile (never a downgrade that destroys the directory); the words say so
//   ⑥ REJECT: the card says so, the item is answered; the agent's next navigation to the host prints the rejection ONCE;
//      a claim after that opens a NEW proposal (open again)
//   ⑦ a FAILED install: the card says the step + the error, the item re-opens, the broadcast names it; Approve again runs
//      the same frozen fields to done
//   ⑧ a conversation on another machine: a proposal that offers nothing (state unavailable), a notice, no Approve
//   ⑨ a REBUILD places the card by time from the keeper's record, with its latest state, under the SAME id
//   ⑩ the shipped CLI: `blocked` prints the proposal; `open` of a sign-in refusal page prints the hint (step 2 end to
//      end); the rejection note once
//   ③b (verify r1 V1) a site CloakBrowser's list refused reaches THIS agent by name (never another conversation's);
//      its claim is ONE card whose plan is only the site (its browser already is CloakBrowser); Approve adds exactly it
//   ⑦b (verify r1 V2) the proposing conversation ended before the press ⇒ refused session-gone, NOTHING ran (no install,
//      no site, no switch of a profile another conversation now uses); resumed ⇒ Approve again runs
//   ⑦d (verify r1 V3) a download with no sign of life for stallMs is SAID on the card (stalledSec), then plain again
//   ⑦c (verify r1 V2) a card that said CloakBrowser IS installed never downloads it: gone by the press ⇒ install_gone
//   ⑧b (verify r1) another conversation's 50+ cheap claims never evict an OPEN proposal (the bound drops what nobody waits on)
//   ⑦f (verify r1 V2) a switch card's "N other conversations" grew before the press ⇒ proposal_stale, nothing ran; a new card next
//   ⑪ TWELVE patched-copy controls (scripts/mutant-copy.mjs): no digest check, no actor check, every claim new, the runner
//      adding the whole domain, the tell without noWake, the Approve route without the agent-bearer refusal, the runner
//      adding the claimed host alone (V1), the audit answer without the lease check (V1), the runner without the
//      proposing-conversation pre-flight (V2), the runner installing whatever the card said (V2), the plain newest-50 bound, the runner without the sharers check (V2) — each makes a row above red
// Scratch dirs only (/tmp/vs-bprop-<pid>), port 0, no real browser, no vendor call, no real sign-in page.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
import { wiredCloak } from './fixtures/browser-switcher-views.mjs';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 5000, every = 10) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await pred(); if (v) return v; await sleep(every); } return pred(); };
const quiet = { log() {}, warn() {}, error() {} };

// ── the scratch world ──
const ROOT = scratch('bprop');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin');
const AB = path.join(ROOT, 'ab-state');
const fake = writeFakeAgentBrowser(BIN, AB);
fs.writeFileSync(path.join(BIN, 'npm'), `#!/bin/sh\nexit 0\n`, { mode: 0o755 }); // npm ON the keeper's PATH (the install verdict's fact) — the FAKE runner below installs
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const servers = new Set();
process.on('exit', () => { fake.reap(); for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
let cdpBrowser = 'Chrome/146.0.7000.1';
const cdpSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: cdpBrowser })); });
servers.add(cdpSrv);
const CDP_PORT = await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port)));

const settings = {};
const keeper = K.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: (k) => settings[k], liveKeys: () => new Set([...active.values()].map((s) => s._browserKey)), install: false, log: quiet, providers: wiredCloak, hostKnown: () => false, egressResolve: (h) => h });

// THE FAKE INSTALL RUNNER (the keeper's own is the pinned npm + `cloakbrowser install` + SHA check — test-browser-backend ⑤ /
// test-browser-share ⑧ gate it): progress in steps, then "installed" = the CloakBrowser program answers
const inst = { st: { running: false, percent: null, failed: false, error: null }, failNext: false, starts: 0 };
const fakeInstall = {
  start: async () => {
    inst.starts++;
    inst.st = { running: true, percent: 0, failed: false, error: null, step: 'binary' };
    (async () => {
      for (const p of [12, 34, 67, 100]) { await sleep(25); inst.st = { ...inst.st, percent: p }; if (p === 34 && inst.stallNext) { const ms = inst.stallNext; inst.stallNext = 0; await sleep(ms); } }
      await sleep(10);
      if (inst.failNext) { inst.failNext = false; inst.st = { running: false, percent: null, failed: true, error: 'binary: cloakbrowser install exited 1 — see install.log' }; return; }
      settings['browser.cloak.executablePath'] = fake.cloakExe;
      inst.st = { running: false, percent: 100, failed: false, error: null };
    })();
    return { ok: true, started: true };
  },
  progress: () => ({ ...inst.st }),
  exeOk: () => !!settings['browser.cloak.executablePath'] && fs.existsSync(settings['browser.cloak.executablePath']),
};

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
const ladder = { calls: [], stash: [], steerNext: false };
const deliver = {
  async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); if (ladder.steerNext && opts && opts.noWake) { ladder.steerNext = false; return { ok: true, lane: 'rpc-queue', steered: true }; } return opts && opts.noWake ? { ok: false, refused: 'no-wake', reason: 'no free lane' } : { ok: true, lane: 'message' }; },
  stashFor(cid, env) { ladder.stash.push({ cid, ...env }); return { stored: true, why: null }; },
};
const hb = HB.create({ keeper, deliver, activeSessions: active, userTodos: todos, sessionKeyFor: (s) => sessionKeyFor(s), log: quiet });
const broadcasts = [];
const runner = PR.create({
  keeper, activeSessions: active, userTodos: todos, sessionKeyFor: (s) => sessionKeyFor(s), serverSetting: (k) => settings[k],
  feedCard: (session, block) => N.feedProposalCard(session, block),
  patchSettings: (p) => Object.assign(settings, p),
  tell: (o) => hb.tellProposal(o),
  pinConversation: ({ sessionId, profileId }) => { const f = RT.sessionFacts(sessionId); if (!f || !f.browserKey) throw Object.assign(new Error('gone'), { code: 'session-gone' }); return RT.pinAnswer(keeper, f, profileId, { by: 'user', quiet: true }); },
  broadcast: (m) => broadcasts.push(m), install: fakeInstall, log: quiet, pollMs: 5, progressEveryMs: 0, stallMs: 150,
});
N.setProposalCardSource(({ session = null } = {}) => (session && session._browserKey ? runner.cardsFor(session._browserKey) : []));
const notices = [];
const app = express(); app.use(express.json());
RT.setup({ keeper, activeSessions: active, browserEnv: () => null, cloakPlan: () => B.cloakservePlan({ enabled: false }), forwards: () => [], notice: (sid, s, n) => notices.push({ sid, n }), persistPin: () => {}, tasksForSession: () => [],
  proposals: { filed: (r) => runner.filed(r), approve: (id, o) => runner.approve(id, o), reject: (id, o) => runner.reject(id, o), rejectionFor: (q) => runner.rejectionFor(q) } });
app.use(RT.router);
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
servers.add(srv);
const API = `http://127.0.0.1:${srv.address().port}`;
const j = async (method, p, body, headers = {}) => { const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const as = (s) => ({ Authorization: 'Bearer ' + s.agentToken });
const settle = async (id) => until(() => { const e = keeper.proposalEntry(id); return e && ['done', 'failed'].includes(e.proposal.state) ? e : null; }, 8000);

// ═══ ① the claim ══════════════════════════════════════════════════════════════
console.log('— ① a tier-2 claim is ONE proposal: one card at the claim\'s position, one For-you item');
const SIGNIN = 'https://accounts.google.com/v3/signin/identifier?TL=AInv3nt3d0b';
let r = await j('POST', '/api/agent/browser/blocked', { url: SIGNIN, why: 'sign-in-refused', evidence: 'the page says: This browser or app may not be secure', tier: 2 }, as(sB));
const idB = r.json && r.json.claim && r.json.claim.id;
const eB = idB ? keeper.proposalEntry(idB) : null;
ok(r.status === 200 && eB && eB.proposal.state === 'open' && eB.proposal.install === 'needed' && eB.proposal.plan.kind === 'new-profile' && eB.proposal.plan.why === 'ephemeral' && eB.proposal.plan.label === 'Mail triage · CloakBrowser' && eB.proposal.site === 'accounts.google.com' && eB.proposal.digest === SW.proposalDigest(eB.proposal),
  'the claim files ONE proposal: a new CloakBrowser profile for this conversation (its browser is the temporary one), CloakBrowser installed first, the site = the claim\'s host, a digest over the frozen fields', eB && eB.proposal);
ok(r.json.proposal && r.json.proposal.id === idB && r.json.proposal.state === 'open' && /a card in the user's chat now waits for their Approve/.test(r.json.next) && /do NOT work around the refusal \(no copied session, no other browser/.test(r.json.next) && !('digest' in r.json.proposal), 'the agent\'s answer: the card waits for the user\'s Approve — tell them in one sentence, do not work around it (no digest handed to the agent)', r.json);
const opsB0 = cardOps('sess-b', idB);
const card0 = opsB0[0] && opsB0[0].message;
ok(opsB0.length === 1 && opsB0[0].op === 'create' && card0.role === 'system' && card0.noticeKind === 'browser-proposal' && card0.content[0].type === 'browser_proposal' && card0.content[0].digest === eB.proposal.digest && card0.content[0].state === 'open', 'ONE card op: a VibeSpace notice keyed by the claim id, carrying the frozen block (structure, never markup)', opsB0);
const itemB = todos.get(eB.proposal.itemId || '');
const L = SW.proposalLines(SW.proposalCardBlock(eB));
ok(itemB && itemB.origin === 'browser' && itemB.kind === 'action' && itemB.action.type === 'browser-proposal' && itemB.action.id === idB && itemB.action.shown === eB.proposal.digest && itemB.i18n.detail.length === 1 + L.plan.length && itemB.i18n.detail.every((l, i) => l.key === [L.claim, ...L.plan][i].key) && itemB.detail.split('\n').length === 1 + L.plan.length,
  'ONE For-you item (origin browser): its Approve names the proposal + the digest; its words are the card\'s claim + plan, line for line', itemB);
ok(L.plan.some((l) => /about \{mb\} MB is downloaded once from its maker/.test(l.key) && l.params.mb >= 200) && L.plan.some((l) => /Open a new CloakBrowser profile "\{label\}"/.test(l.key)) && L.plan.some((l) => /\{host\} is added, and — because \{vendor\}'s sign-in page loads its parts from them — also \{also\}/.test(l.key)) && L.plan.some((l) => /The agent is told when it is done/.test(l.key)), 'the card\'s plan words: the download (about 217 MB, from the record), the new profile, the host + the sign-in page\'s own sites NAMED (verify r1 V1), the agent told', L.plan.map((l) => SW.lineText(l)));
r = await j('POST', '/api/agent/browser/blocked', { url: SIGNIN, why: 'sign-in-refused', tier: 2 }, as(sB));
ok(r.status === 200 && r.json.claim.id === idB && r.json.duplicate === true && cardOps('sess-b', idB).length === 1 && todos.snapshot().open.filter((i) => i.action && i.action.type === 'browser-proposal').length === 1 && /the same card still waits/.test(r.json.next) && !/you are told when they decide/.test(r.json.next) && /if they reject it, your next navigation to accounts\.google\.com says so/.test(r.json.next), 'a second claim on the host while the proposal stands ⇒ the SAME card: no op, no second item, the agent told not to ask again — and (verify r1) how each answer reaches it: an approval told, a rejection at its next navigation (never "told when they decide")', r.json);

// ═══ ② the owner-only doors ════════════════════════════════════════════════════
console.log('— ② owner-only: an agent never decides; Approve names the card it was pressed on');
for (const [m, p] of [['POST', `/api/browser/proposals/${idB}/approve`], ['POST', `/api/browser/proposals/${idB}/reject`], ['GET', `/api/browser/proposals/${idB}`]]) {
  const x = await j(m, p, m === 'POST' ? { shown: eB.proposal.digest } : undefined, as(sB));
  ok(x.status === 403 && x.json.code === 'agent_forbidden', `${m} ${p.replace(idB, ':id')} with the agent's bearer ⇒ 403 agent_forbidden`, x);
}
ok(keeper.proposalEntry(idB).proposal.state === 'open' && inst.starts === 0, '…and nothing moved (still open, no install started)');
const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
const propRoutes = [...rsrc.matchAll(/router\.(get|post)\('(\/api\/browser\/proposals\/[^']*)', [^\n]*\n([^\n]*)\n/g)];
ok(propRoutes.length === 3 && propRoutes.every((m) => /refuseHost/.test(m[3])) && propRoutes.every((m) => rsrc.slice(m.index, m.index + 400).includes('refuseAgentBearer(req, res, PROPOSAL_IS_USERS)')) && !/\/api\/agent\/browser\/proposal/.test(rsrc), 'CENSUS: every proposal route refuses an agent\'s bearer by name, and no /api/agent twin exists', propRoutes.map((m) => m[2]));
r = await j('POST', `/api/browser/proposals/${idB}/approve`, { shown: 'pd-00000000' });
ok(r.status === 409 && r.json.code === 'proposal_changed' && keeper.proposalEntry(idB).proposal.state === 'open' && inst.starts === 0, 'an Approve naming ANOTHER card ⇒ 409 proposal_changed: nothing ran', r.json);
r = await j('POST', `/api/browser/proposals/${idB}/approve`, {});
ok(r.status === 400 && r.json.code === 'shown_required', 'an Approve naming no card ⇒ 400 shown_required');

// ═══ ③ Approve: exactly the frozen fields ══════════════════════════════════════
console.log('— ③ Approve runs exactly what the card showed: install, the one site, a new CloakBrowser profile, the page, the agent told');
const launches0 = fake.launches().length;
r = await j('POST', `/api/browser/proposals/${idB}/approve`, { shown: eB.proposal.digest });
ok(r.status === 200 && r.json.ok && r.json.started && r.json.proposal.state === 'approved', 'the user\'s Approve with the card\'s digest ⇒ started', r.json);
const doneB = await settle(idB);
const pB = doneB && doneB.proposal;
ok(pB && pB.state === 'done' && pB.outcome.code === 'new-profile' && pB.outcome.newProfile && pB.outcome.label === 'Mail triage · CloakBrowser' && pB.outcome.siteAdded && pB.outcome.told === 'stashed', 'done: a new CloakBrowser profile, the site added, the agent told (stashed for its next turn)', pB);
ok(inst.starts === 1 && settings['browser.cloak.executablePath'] === fake.cloakExe, '(a) the install ran once (the card\'s words were its confirm — no second dialog)');
const GOOGLE_ALSO = SW.signinDependenciesOf('accounts.google.com').also;
ok(settings['browser.cloak.egressAllowlist'] === ['accounts.google.com', ...GOOGLE_ALSO].join(',') && GOOGLE_ALSO.includes('www.gstatic.com') && GOOGLE_ALSO.includes('ssl.gstatic.com') && eB.proposal.alsoSites.join() === GOOGLE_ALSO.join() && L.plan.some((l) => l.params && l.params.also === GOOGLE_ALSO.join(', ') && l.params.vendor === 'Google'),
  '(b) verify r1 V1: the claim\'s host + EXACTLY the sites Google\'s sign-in page loads from (frozen on the proposal, named on the card) were added — nothing else', settings['browser.cloak.egressAllowlist']);
const newP = keeper.profileByRef('Mail triage · CloakBrowser');
const L1 = fake.launches().slice(launches0);
const O1 = fake.opens().filter((o) => o.url === SIGNIN);
ok(newP && newP.provider === 'cloak' && Number.isInteger(newP.fingerprintSeed) && keeper.pinFor(sB._browserKey) && keeper.pinFor(sB._browserKey).profileId === newP.id && keeper.leasesFor(sB._browserKey).some((l) => l.profileId === newP.id), '(c) the new profile is CloakBrowser (a seed minted), this conversation is pinned to it and holds its lease', { newP, pin: keeper.pinFor(sB._browserKey) });
ok(L1.length === 1 && L1[0].exe === fake.cloakExe && /--fingerprint=\d+/.test(L1[0].args) && /--proxy-server=http:\/\/127\.0\.0\.1:\d+/.test(L1[0].args) && O1.some((o) => o.verb === 'tab new' && o.session === 'vs-' + sB._browserKey), '(c) CloakBrowser launched (its program, its seed, the egress proxy) and the claim\'s page opened in THIS conversation\'s tab', { L1, O1 });
const tellCall = ladder.calls.find((c) => /Approved: your browser is now CloakBrowser/.test(c.text));
const stashed = ladder.stash.find((s) => /Approved: your browser is now CloakBrowser/.test(s.text));
ok(tellCall && tellCall.opts.noWake === true && tellCall.opts.kind === 'notification' && tellCall.opts.spendReason === 'browser-handback' && tellCall.cid === sB.claudeSessionId && stashed && stashed.kind === 'notification' && new RegExp('Re-run the sign-in at ' + SIGNIN.replace(/[?.]/g, '\\$&')).test(stashed.text) && /new — sign in there once/.test(stashed.text), '(d) the agent TOLD through the handback\'s ONE ladder site with noWake (never a wake) — a claude turn cannot join for free, so the words wait for its next turn', { tellCall, stashed });
const opsB = cardOps('sess-b', idB);
ok(opsB.filter((o) => o.op === 'create').length === 1 && opsB.slice(1).every((o) => o.op === 'edit' && Object.keys(o.fields).join() === 'content') && opsB.some((o) => o.op === 'edit' && o.fields.content[0].progress && o.fields.content[0].progress.step === 'install' && o.fields.content[0].progress.percent === 34) && opsB.at(-1).fields.content[0].state === 'done',
  'THE CARD: created ONCE; every change an in-place `edit` of its content (never a status — never a swap); the download\'s progress streamed onto it (34 %); it ends done', opsB.map((o) => o.op + ':' + (o.op === 'edit' ? o.fields.content[0].state + '/' + JSON.stringify(o.fields.content[0].progress) : 'create')));
ok(todos.get(itemB.id).status === 'done', 'the For-you item is answered (the user\'s press)');
ok(broadcasts.some((m) => m.type === 'browser-proposal-updated' && m.id === idB && m.state === 'done'), 'every change is broadcast (the pressing client toasts a failure by it)');

// ═══ ③b verify r1 V1: what CloakBrowser's list refused reaches THE agent by name; its claim asks for exactly that site ═══
console.log('— ③b a site the page was refused reaches the agent by name (its own browser only); its claim is ONE card that adds exactly that site');
{
  const pxOf = (l) => new URL(/--proxy-server=(http:\/\/127\.0\.0\.1:\d+)/.exec(l.args || '')[1]);
  const viaProxy = (px, url) => new Promise((resolve) => { const u = new URL(url); const q = http.request({ host: px.hostname, port: px.port, method: 'GET', path: url, headers: { host: u.host } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }); q.on('error', (e) => resolve({ status: 0, body: e.message })); q.end(); });
  const t0 = Date.now() - 1;
  const refused = await viaProxy(pxOf(L1[0]), 'http://cdn.unknown-vendor.example/app.js'); // REFUSED by the proxy before any upstream (nothing leaves)
  ok(refused.status === 403 && /cdn\.unknown-vendor\.example is not in the egress allowlist/.test(refused.body), 'the page\'s part from a site not on the list is refused by CloakBrowser\'s proxy (403, by name)', refused);
  let au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, profile: newP.id, since: t0 }, as(sB));
  ok(au.status === 200 && au.json.egressRefused && JSON.stringify(au.json.egressRefused.hosts) === '["cdn.unknown-vendor.example"]' && /vibespace-browser blocked --url https:\/\/cdn\.unknown-vendor\.example\/ --why egress-refused --tier 2/.test(au.json.egressRefused.text), 'the agent\'s next verb answer names the refused site and the ONE command that asks the user for it', au.json);
  au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, profile: newP.id, since: t0 }, as(sA));
  ok(au.status === 200 && !au.json.egressRefused, 'another conversation (no lease on that browser) is never told its refusals', au.json);
  au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, profile: newP.id, since: Date.now() + 60000 }, as(sB));
  ok(au.status === 200 && !au.json.egressRefused, 'a refusal from before the verb started is not this verb\'s', au.json);
  // the agent's claim naming it: its browser already IS CloakBrowser ⇒ the SITE plan (nothing switched, nothing installed)
  const launches1 = fake.launches().length, starts1 = inst.starts;
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://cdn.unknown-vendor.example/', why: 'egress-refused', tier: 2 }, as(sB));
  const eS = keeper.proposalEntry(r.json.claim.id);
  const LS = SW.proposalLines(SW.proposalCardBlock(eS));
  ok(eS && eS.proposal.state === 'open' && eS.proposal.plan.kind === 'site' && eS.proposal.plan.profileId === newP.id && /let your CloakBrowser browser open cdn\.unknown-vendor\.example/.test(r.json.next) && /its page needs \{host\}, which CloakBrowser's site list refused/.test(LS.claim.key) && LS.plan.some((l) => /already is CloakBrowser — only its site list changes/.test(l.key)) && todos.get(eS.proposal.itemId).i18n.text.key === 'The agent asks you to let CloakBrowser open {site}',
    'its claim is ONE card asking to let CloakBrowser open that site (the site plan: its browser already is CloakBrowser)', { p: eS && eS.proposal, next: r.json.next });
  const before = settings['browser.cloak.egressAllowlist'];
  await j('POST', `/api/browser/proposals/${eS.id}/approve`, { shown: eS.proposal.digest });
  const dS = await settle(eS.id);
  const toldS = ladder.stash.find((x) => /Approved: CloakBrowser may now open cdn\.unknown-vendor\.example/.test(x.text));
  ok(dS && dS.proposal.state === 'done' && dS.proposal.outcome.code === 'site-added' && settings['browser.cloak.egressAllowlist'] === before + ',cdn.unknown-vendor.example' && fake.launches().length === launches1 && inst.starts === starts1 && toldS,
    'Approve adds EXACTLY that site — nothing launched, nothing installed — and the agent is told it may re-open the page', { p: dS && dS.proposal, allow: settings['browser.cloak.egressAllowlist'] });
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://cdn.unknown-vendor.example/', why: 'egress-refused', tier: 2 }, as(sB));
  ok(keeper.proposalEntry(r.json.claim.id).proposal.state === 'unavailable' && keeper.proposalEntry(r.json.claim.id).proposal.plan.why === 'already-cloak', 'a claim on a site the list now admits offers nothing (already CloakBrowser, already listed)', keeper.proposalEntry(r.json.claim.id).proposal);
}

// ═══ ④ a named chromium profile: the in-place switch ══════════════════════════════
console.log('— ④ a named chromium profile the version ladder admits ⇒ the in-place switch (the user\'s act)');
const portal = keeper.createProfile({ label: 'Portal' }, { owner: { kind: 'instance', id: null } });
await keeper.attach({ profileId: portal.id, browserKey: sA._browserKey, sessionId: 'sess-a' });
keeper.noteLeaseUrl(sA._browserKey, portal.id, 'https://portal.example/login');
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://portal.example/login', why: 'http-403', tier: 2 }, as(sA));
const idA = r.json.claim.id;
const eA = keeper.proposalEntry(idA);
ok(eA.proposal.plan.kind === 'switch' && eA.proposal.plan.profileId === portal.id && eA.proposal.plan.confirm === false && eA.proposal.install === 'installed' && eA.proposal.state === 'open', 'the plan is the in-place switch of "Portal" (Chromium 146 wrote it — CloakBrowser\'s 146 may open it), CloakBrowser already installed', eA.proposal);
ok(SW.proposalLines(SW.proposalCardBlock(eA)).plan.some((l) => /Switch this conversation's browser "\{label\}" to CloakBrowser\. Your logins in it stay in the profile/.test(l.key) && l.params.label === 'Portal'), 'the words say what it does: the same profile, the logins stay, the page reopened');
ladder.steerNext = true;
const allowBeforeA = settings['browser.cloak.egressAllowlist'];
r = await j('POST', `/api/browser/proposals/${idA}/approve`, { shown: eA.proposal.digest });
const doneA = await settle(idA);
const pp = keeper.profile(portal.id);
ok(doneA && doneA.proposal.state === 'done' && doneA.proposal.outcome.code === 'switched' && doneA.proposal.outcome.reopened === 1 && pp.provider === 'cloak' && pp.dir === portal.dir && doneA.proposal.outcome.told === 'steered', 'done: "Portal" runs on CloakBrowser in place (the same directory), its tab reopened, the agent told IN its running turn (the free steer)', { p: doneA && doneA.proposal, provider: pp.provider });
ok(settings['browser.cloak.egressAllowlist'] === allowBeforeA + ',portal.example' && !eA.proposal.alsoSites && inst.starts === 1, 'ONLY portal.example added (a vendor the sign-in table does not know stays one host); nothing installed again', settings['browser.cloak.egressAllowlist']);

// ═══ ⑤ a profile a newer Chromium wrote ═════════════════════════════════════════
console.log('— ⑤ a profile a NEWER Chromium wrote ⇒ a new profile, never a downgrade');
const sN = mkSession('sess-n', 'bk-0000d0d0', 'Bank chat');
const newer = keeper.createProfile({ label: 'Newer' }, { owner: { kind: 'instance', id: null } });
cdpBrowser = 'Chrome/151.0.7922.34';
await keeper.attach({ profileId: newer.id, browserKey: sN._browserKey, sessionId: 'sess-n' });
cdpBrowser = 'Chrome/146.0.7000.1';
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://shop.example/checkout', why: 'captcha', tier: 2 }, as(sN));
const eN = keeper.proposalEntry(r.json.claim.id);
const LN = SW.proposalLines(SW.proposalCardBlock(eN));
ok(eN.proposal.plan.kind === 'new-profile' && eN.proposal.plan.why === 'newer-profile' && eN.proposal.plan.wrote === 151 && eN.proposal.plan.profileLabel === 'Newer' && LN.plan.some((l) => /last written by Chromium \{wrote\}, newer than CloakBrowser's \{cloak\}/.test(l.key) && l.params.wrote === 151 && l.params.cloak === 146), '"Newer" was written by Chromium 151 ⇒ a new CloakBrowser profile, and the card says why (the directory would be destroyed)', eN.proposal);

// ═══ ⑥ Reject ══════════════════════════════════════════════════════════════════
console.log('— ⑥ Reject: the card says so; the agent hears it ONCE, at its next navigation to the host');
r = await j('POST', `/api/browser/proposals/${eN.id}/reject`, {});
const rj = keeper.proposalEntry(eN.id);
ok(r.status === 200 && rj.proposal.state === 'rejected' && rj.proposal.told === false && todos.get(rj.proposal.itemId).status === 'done' && cardOps('sess-n', eN.id).at(-1).fields.content[0].state === 'rejected', 'rejected: the card patched in place, the item answered, the agent not told yet', rj.proposal);
let au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, url: 'https://shop.example/cart', nav: { url: 'https://shop.example/cart', title: 'Cart' } }, as(sN));
ok(au.status === 200 && au.json.proposalRejected && au.json.proposalRejected.site === 'shop.example' && /the user rejected switching your browser to CloakBrowser for shop\.example/.test(au.json.proposalRejected.text) && keeper.proposalEntry(eN.id).proposal.told === true, 'the agent\'s next navigation to shop.example carries the rejection (told now)', au.json);
au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, url: 'https://shop.example/cart', nav: { url: 'https://shop.example/cart', title: 'Cart' } }, as(sN));
ok(au.status === 200 && !au.json.proposalRejected, '…ONCE: the next navigation carries nothing');
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://shop.example/checkout', why: 'captcha', tier: 2 }, as(sN));
ok(r.json.claim.id !== eN.id && keeper.proposalEntry(r.json.claim.id).proposal.state === 'open' && cardOps('sess-n', r.json.claim.id).length === 1, 'a claim after the told rejection opens a NEW proposal (open again: a new card)', r.json);
const eN2 = keeper.proposalEntry(r.json.claim.id);
// a claim while the rejection is NOT yet told answers the rejection itself (told now)
await j('POST', `/api/browser/proposals/${eN2.id}/reject`, {});
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://shop.example/checkout', why: 'captcha', tier: 2 }, as(sN));
ok(r.json.rejected === true && r.json.claim.id === eN2.id && /the user REJECTED switching your browser/.test(r.json.next) && keeper.proposalEntry(eN2.id).proposal.told === true, 'a claim while a rejection is untold ⇒ the agent is told the rejection instead (no new card)', r.json);

// ═══ ⑦ a failed install, Approve again ═════════════════════════════════════════
console.log('— ⑦ a failed install: the step + the error on the card, the item re-opened; Approve again runs the same fields');
delete settings['browser.cloak.executablePath'];
const sF = mkSession('sess-f', 'bk-0000f0f0', 'Forms');
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://forms.example/x', why: 'captcha', tier: 2 }, as(sF));
const eF = keeper.proposalEntry(r.json.claim.id);
ok(eF.proposal.install === 'needed', 'CloakBrowser does not answer ⇒ install needed');
inst.failNext = true;
await j('POST', `/api/browser/proposals/${eF.id}/approve`, { shown: eF.proposal.digest });
const fF = await settle(eF.id);
ok(fF.proposal.state === 'failed' && fF.proposal.outcome.step === 'install' && /cloakbrowser install exited 1/.test(fF.proposal.outcome.error) && todos.get(fF.proposal.itemId).status === 'open' && broadcasts.some((m) => m.id === eF.id && m.state === 'failed' && /exited 1/.test(m.outcome.error)) && !settings['browser.cloak.egressAllowlist'].includes('forms.example'), 'failed while installing: named on the card and in the broadcast, the For-you item re-opened, nothing past the failed step ran (no site added)', fF.proposal);
await j('POST', `/api/browser/proposals/${eF.id}/approve`, { shown: eF.proposal.digest });
const dF = await settle(eF.id);
ok(dF.proposal.state === 'done' && inst.starts === 3 && keeper.profileByRef('Forms · CloakBrowser'), 'Approve again (the same digest — the same frozen fields) ⇒ installed, done', dF.proposal);

// ═══ ⑦b verify r1 V2: the conversation that proposed it ENDED before the press ═══════════════
console.log('— ⑦b the proposing conversation ended before the press: refused by name, NOTHING ran (no install, no site, no switch of a profile another conversation now uses)');
{
  const sE = mkSession('sess-e', 'bk-0000e0a0', 'Ended chat');
  const sO = mkSession('sess-o', 'bk-0000e0b0', 'Other chat');
  const shared = keeper.createProfile({ label: 'Shared' }, { owner: { kind: 'instance', id: null } });
  await keeper.attach({ profileId: shared.id, browserKey: sE._browserKey, sessionId: 'sess-e' });
  keeper.noteLeaseUrl(sE._browserKey, shared.id, 'https://shared.example/login');
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://shared.example/login', why: 'captcha', tier: 2 }, as(sE));
  const eE = keeper.proposalEntry(r.json.claim.id);
  ok(eE.proposal.plan.kind === 'switch' && eE.proposal.plan.others === 0, 'the card: switch "Shared" in place — no other conversation uses it (at the claim)', eE.proposal.plan);
  active.delete('sess-e'); // the conversation ends; another one now uses "Shared"
  await keeper.attach({ profileId: shared.id, browserKey: sO._browserKey, sessionId: 'sess-o' });
  const allow0 = settings['browser.cloak.egressAllowlist'], starts0 = inst.starts, launches0 = fake.launches().length;
  await j('POST', `/api/browser/proposals/${eE.id}/approve`, { shown: eE.proposal.digest });
  const fE = await settle(eE.id);
  ok(fE.proposal.state === 'failed' && fE.proposal.outcome.code === 'session-gone' && /not running any more — nothing was installed, added or switched/.test(fE.proposal.outcome.error) && keeper.profile(shared.id).provider === 'chromium' && settings['browser.cloak.egressAllowlist'] === allow0 && inst.starts === starts0 && fake.launches().length === launches0,
    'Approve after the proposing conversation ended ⇒ failed session-gone by name: "Shared" NOT switched under the other conversation, no site added, nothing installed or launched', { p: fE.proposal, provider: keeper.profile(shared.id).provider });
  delete settings['browser.cloak.executablePath'];
  const sG = mkSession('sess-g', 'bk-0000e0c0', 'Gone chat');
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://gone.example/in', why: 'captcha', tier: 2 }, as(sG));
  const eG = keeper.proposalEntry(r.json.claim.id);
  active.delete('sess-g');
  const starts1 = inst.starts;
  await j('POST', `/api/browser/proposals/${eG.id}/approve`, { shown: eG.proposal.digest });
  const fG = await settle(eG.id);
  ok(eG.proposal.install === 'needed' && fG.proposal.state === 'failed' && fG.proposal.outcome.code === 'session-gone' && inst.starts === starts1 && !String(settings['browser.cloak.egressAllowlist']).includes('gone.example'), '…and a new-profile proposal whose conversation ended downloads nothing (the 217 MB are not fetched for a conversation that is gone)', fG.proposal);
  active.set('sess-e', sE); // resumed (the same conversation, its key): Approve again runs
  settings['browser.cloak.executablePath'] = fake.cloakExe;
  await j('POST', `/api/browser/proposals/${eE.id}/approve`, { shown: eE.proposal.digest });
  const sE1 = await settle(eE.id);
  ok(sE1.proposal.state === 'failed' && sE1.proposal.outcome.code === 'proposal_stale' && keeper.profile(shared.id).provider === 'chromium', 'resumed — but "Other chat" joined "Shared" after the card (which said no other conversation) ⇒ proposal_stale, still nothing switched (⑦f)', sE1.proposal);
  try { await keeper.detach({ profileId: shared.id, browserKey: sO._browserKey, by: 'user' }); } catch { /* gone */ }
  await j('POST', `/api/browser/proposals/${eE.id}/approve`, { shown: eE.proposal.digest });
  const dE = await settle(eE.id);
  ok(dE.proposal.state === 'done' && keeper.profile(shared.id).provider === 'cloak', 'the conversation resumed and the card true again (the other conversation left) ⇒ Approve again runs the same frozen card to done', dE.proposal);
  await keeper.stop(shared.id, { why: 'user' }).catch(() => {}); // the machine's browser ceiling (6) is shared with the rows below
}

// ═══ ⑦f verify r1 V2: the card said how many OTHER conversations use the profile — more now ⇒ nothing runs ═══════════
console.log('— ⑦f a switch card named 0 other conversations on "Busy"; one attached before the press ⇒ nothing runs (proposal_stale); the next claim is a NEW card with the count as it stands');
{
  settings['browser.cloak.executablePath'] = fake.cloakExe;
  const sP = mkSession('sess-p', 'bk-0000e1a0', 'Busy chat');
  const sQ = mkSession('sess-q', 'bk-0000e1b0', 'Late chat');
  const busy = keeper.createProfile({ label: 'Busy' }, { owner: { kind: 'instance', id: null } });
  await keeper.attach({ profileId: busy.id, browserKey: sP._browserKey, sessionId: 'sess-p' });
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://busy.example/login', why: 'http-403', tier: 2 }, as(sP));
  const eP = keeper.proposalEntry(r.json.claim.id);
  await keeper.attach({ profileId: busy.id, browserKey: sQ._browserKey, sessionId: 'sess-q' });
  const allow0 = settings['browser.cloak.egressAllowlist'];
  await j('POST', `/api/browser/proposals/${eP.id}/approve`, { shown: eP.proposal.digest });
  const fP = await settle(eP.id);
  ok(eP.proposal.plan.kind === 'switch' && eP.proposal.plan.others === 0 && fP.proposal.state === 'failed' && fP.proposal.outcome.code === 'proposal_stale' && /1 other conversation uses "Busy" now — this card said 0; nothing was switched/.test(fP.proposal.outcome.error) && keeper.profile(busy.id).provider === 'chromium' && settings['browser.cloak.egressAllowlist'] === allow0,
    'the card said no other conversation uses "Busy"; one attached before the press ⇒ failed proposal_stale by name — "Busy" NOT switched under it, no site added', fP.proposal);
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://busy.example/login', why: 'http-403', tier: 2 }, as(sP));
  const eP2 = keeper.proposalEntry(r.json.claim.id);
  ok(r.json.claim.id !== eP.id && eP2.proposal.state === 'open' && eP2.proposal.plan.others === 1 && SW.proposalLines(SW.proposalCardBlock(eP2)).plan.some((l) => /One other conversation uses this browser too/.test(l.key)), 'the agent\'s next claim is a NEW card that says one other conversation uses it (a stale card is not the same card)', eP2.proposal);
  await keeper.stop(busy.id, { why: 'user' }).catch(() => {});
}

// ═══ ⑦c verify r1 V2: the card said "installed" — its Approve never downloads ═══════════════
console.log('— ⑦c a card that said CloakBrowser IS installed never downloads it (it went away after the card was drawn: refused by name)');
{
  settings['browser.cloak.executablePath'] = fake.cloakExe;
  const sI = mkSession('sess-i', 'bk-0000e0d0', 'Installed chat');
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://inst.example/in', why: 'captcha', tier: 2 }, as(sI));
  const eI = keeper.proposalEntry(r.json.claim.id);
  const LI = SW.proposalLines(SW.proposalCardBlock(eI));
  delete settings['browser.cloak.executablePath']; // the program goes away after the card was drawn
  const starts0 = inst.starts;
  await j('POST', `/api/browser/proposals/${eI.id}/approve`, { shown: eI.proposal.digest });
  const fI = await settle(eI.id);
  ok(eI.proposal.install === 'installed' && !LI.plan.some((l) => /downloaded once/.test(l.key)) && fI.proposal.state === 'failed' && fI.proposal.outcome.code === 'install_gone' && /this card did not include its download — nothing was downloaded/.test(fI.proposal.outcome.error) && inst.starts === starts0 && !String(settings['browser.cloak.egressAllowlist']).includes('inst.example'),
    'the card had no download line ⇒ its Approve downloads NOTHING: failed install_gone by name (nothing added either)', { p: fI.proposal, starts: inst.starts - starts0 });
  settings['browser.cloak.executablePath'] = fake.cloakExe; // installed again (Manage agents)
  await j('POST', `/api/browser/proposals/${eI.id}/approve`, { shown: eI.proposal.digest });
  const dI = await settle(eI.id);
  ok(dI.proposal.state === 'done' && inst.starts === starts0, '…installed again from Manage agents ⇒ Approve again runs the same card to done (still no download of its own)', dI.proposal);
  if (dI.proposal.outcome && dI.proposal.outcome.profileId) await keeper.stop(dI.proposal.outcome.profileId, { why: 'user' }).catch(() => {});
}

// ═══ ⑦d verify r1 V3: a download that shows no sign of life is SAID on the card ═══════════════
console.log('— ⑦d a download that stalls is said on the card (the runner\'s stall rule), and the card moves on when it resumes');
{
  delete settings['browser.cloak.executablePath'];
  const sS = mkSession('sess-s', 'bk-0000e5e5', 'Stall chat');
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://stall.example/in', why: 'captcha', tier: 2 }, as(sS));
  const eS = keeper.proposalEntry(r.json.claim.id);
  inst.stallNext = 600; // no percent change, no output, for 600 ms (the suite's stallMs is 150)
  await j('POST', `/api/browser/proposals/${eS.id}/approve`, { shown: eS.proposal.digest });
  const dS = await settle(eS.id);
  const opsS = cardOps('sess-s', eS.id).filter((o) => o.op === 'edit').map((o) => o.fields.content[0].progress).filter(Boolean);
  const stalledOp = opsS.find((pp) => pp.step === 'install' && Number.isFinite(pp.stalledSec));
  const after = stalledOp ? opsS.slice(opsS.indexOf(stalledOp) + 1).find((pp) => pp.step === 'install' && pp.stalledSec == null) : null;
  ok(dS.proposal.state === 'done' && stalledOp && stalledOp.percent === 34 && after && after.percent > 34, 'the card said the download was stuck at 34 % (stalledSec) and went back to plain progress when bytes came again; the run finished', opsS);
  if (dS.proposal.outcome && dS.proposal.outcome.profileId) await keeper.stop(dS.proposal.outcome.profileId, { why: 'user' }).catch(() => {});
}

// ═══ ⑦e verify r1 V7: the tell's LAST carrier (no stash on this ladder) — the zero-spend notice, rendered ═══════════
console.log('— ⑦e with no stash to take the words, the approved switch rides the zero-spend notice — and it RENDERS (the notice kind is known)');
{
  const { SessionStatusManager } = require('../src/session-status.js');
  const dN = path.join(ROOT, 'data-notice'); fs.mkdirSync(dN, { recursive: true });
  const ssm = new SessionStatusManager({ dataDir: dN });
  const hbN = HB.create({ keeper, deliver: { async deliverToConversation() { return { ok: false, refused: 'no-wake', reason: 'no free lane' }; } }, activeSessions: active, notice: (sid, sess, n) => ssm.pushNotice(sessionKeyFor(sess), n), log: quiet });
  const t = await hbN.tellProposal({ sessionId: 'sess-a', browserKey: sA._browserKey, text: 'Approved: your browser is now CloakBrowser; x.example is on its site list. Re-run the sign-in at https://x.example/ — re-read the page first.' });
  const pend = ssm.pendingNotices(sessionKeyFor(sA));
  const rendered = SessionStatusManager.renderNotices(pend);
  ok(t.told === 'noticed' && pend.length === 1 && pend[0].kind === 'browser-proposal' && /<system-reminder>\nApproved: your browser is now CloakBrowser; x\.example is on its site list/.test(rendered), 'told: noticed — the notice is queued under its own kind and renders the approved words for the next turn (never a wake, never dropped)', { t, rendered });
}

// ═══ ⑧ nothing to offer ════════════════════════════════════════════════════════
console.log('— ⑧ a conversation on another machine: a proposal that offers nothing — a sentence, no Approve');
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://x.example/a', why: 'captcha', tier: 2 }, as(sR));
const eR = r.status === 200 ? keeper.proposalEntry(r.json.claim.id) : null;
const itR = eR ? todos.get(eR.proposal.itemId || '') : null;
ok(eR && eR.proposal.state === 'unavailable' && eR.proposal.plan.why === 'remote' && itR && itR.kind === 'notice' && !itR.action && /no switch can be offered on this machine \(this conversation runs on another machine\)/.test(r.json.next), 'plan none (remote): state unavailable, a NOTICE item without buttons, the agent told why', { p: eR && eR.proposal, next: r.json && r.json.next });
r = await j('POST', `/api/browser/proposals/${eR.id}/approve`, { shown: eR.proposal.digest });
ok(r.status === 409 && r.json.code === 'proposal_unavailable', 'an Approve of it is refused by name (409 proposal_unavailable)');
// verify r1: a claim on a LOOPBACK site (a dev server here) — CloakBrowser's proxy never admits it, so a switch would make the page unreachable
r = await j('POST', '/api/agent/browser/blocked', { url: 'http://127.0.0.1:5173/login', why: 'http-403', tier: 2 }, as(sA));
const eL = keeper.proposalEntry(r.json.claim.id);
ok(eL && eL.proposal.state === 'unavailable' && eL.proposal.plan.why === 'never-admitted' && /CloakBrowser never opens 127\.0\.0\.1/.test(r.json.next) && !String(settings['browser.cloak.egressAllowlist']).split(',').includes('127.0.0.1'), 'verify r1: a loopback site offers nothing (never-admitted) — never a card promising "127.0.0.1 is added" to a list that can never admit it', { p: eL && eL.proposal, next: r.json.next });

// ═══ ⑧b verify r1: the claim store's bound never evicts another conversation's OPEN proposal ═══════════
console.log('— ⑧b a conversation\'s 50 cheap claims never evict ANOTHER conversation\'s open proposal (the store drops what nobody waits on first)');
{
  const sY = mkSession('sess-y', 'bk-0000f1f1', 'Payroll');
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://payroll.example/in', why: 'captcha', tier: 2 }, as(sY));
  const idY = r.json.claim.id, digY = keeper.proposalEntry(idY).proposal.digest, itY = keeper.proposalEntry(idY).proposal.itemId;
  const sX = mkSession('sess-x', 'bk-0000f2f2', 'Crawler');
  for (let i = 0; i < 60; i++) await j('POST', '/api/agent/browser/blocked', { url: `https://h${i}.example/`, why: 'http-403', tier: 1 }, as(sX));
  const eY = keeper.proposalEntry(idY);
  ok(eY && eY.proposal.state === 'open' && todos.get(itY).status === 'open' && runner.cardsFor(sY._browserKey).some((c) => c.id === idY), 'after 60 tier-1 claims by another conversation the open proposal is still there: its card, its For-you item, its Approve', eY && eY.proposal.state);
  const x = await j('POST', `/api/browser/proposals/${idY}/reject`, {});
  ok(x.status === 200, '…and it can still be decided (no 404)', x);
}

// ═══ ⑨ a rebuild places the card ═══════════════════════════════════════════════
console.log('— ⑨ a REBUILD places the card by time, with its latest state, under the same id');
await N.rebuildHistory(sB, 'sess-b', [], {});
const rebuilt = sB._normalizer.messages.find((m) => m.id === `sess-b:bp:${idB}`);
ok(rebuilt && rebuilt.noticeKind === 'browser-proposal' && rebuilt.content[0].state === 'done' && rebuilt.content[0].outcome.code === 'new-profile' && rebuilt.ts === keeper.proposalEntry(idB).at, 'the rebuilt conversation draws the proposal card from the keeper\'s record (state done), at the claim\'s instant', rebuilt && rebuilt.content[0]);
ok(N.browserCardsFor({ session: sB }).filter((c) => c.type === 'browser_proposal' && c.id === idB).length === 1, 'the card source names it once');

// ═══ ⑩ the shipped CLI ══════════════════════════════════════════════════════════
console.log('— ⑩ the shipped CLI: blocked prints the proposal, a sign-in refusal page prints the hint, the rejection once');
{
  const pw = path.join(ROOT, 'passwd.cjs'); fs.writeFileSync(pw, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(HOME)} });\n`);
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(CDP_PORT), VIBESPACE_API: API };
  const cli = (s, args) => new Promise((resolve) => execFile(process.execPath, ['--require', pw, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...cliEnv, VIBESPACE_SESSION_TOKEN: s.agentToken }, encoding: 'utf8', timeout: 30000, cwd: ROOT }, (err, so, se) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(so || ''), err: String(se || '') })));
  const sC = mkSession('sess-c', 'bk-0000e0e0', 'Calendar');
  const bl = await cli(sC, ['blocked', '--url', 'https://calendar.example/in', '--why', 'captcha', '--tier', '2']);
  ok(bl.status === 0 && /recorded your claim/.test(bl.out) && /a card in the user's chat now waits for their Approve/.test(bl.out) && /^proposal bl-[0-9a-f]{8}: open$/m.test(bl.out), 'vibespace-browser blocked --tier 2 prints the next step and the proposal', bl.out + bl.err);
  // the sign-in HINT end to end: the conversation attached to a profile, `open` of a page whose final url + title are Google's refusal
  const cal = keeper.createProfile({ label: 'Cal' }, { owner: { kind: 'instance', id: null } });
  let u = await cli(sC, ['use', 'Cal']);
  ok(u.status === 0, 'the conversation attaches a profile', u.out + u.err);
  const REFUSED = 'https://accounts.google.com/v3/signin/rejected?TL=AInv3nt3d0c';
  fs.writeFileSync(path.join(AB, 'titles.json'), JSON.stringify({ [REFUSED]: 'Couldn\'t sign you in', 'https://calendar.example/in': 'Calendar' }));
  const op = await cli(sC, ['open', REFUSED]);
  ok(op.status === 0 && /^hint: may-need-cloak — Google's sign-in page says this browser may not be secure — a hint from the page, not a detection/m.test(op.err) && /--why sign-in-refused --tier 2/.test(op.err), 'step 2 END TO END: `open` of the refusal page ⇒ the hint on stderr, printed like the 403/429 one', op.out + op.err);
  const op2 = await cli(sC, ['open', 'https://calendar.example/in']);
  ok(op2.status === 0 && !/hint:/.test(op2.err), 'an ordinary page carries no hint', op2.err);
  await j('POST', `/api/browser/proposals/${bl.out.match(/proposal (bl-[0-9a-f]{8})/)[1]}/reject`, {});
  const op3 = await cli(sC, ['open', 'https://calendar.example/in']);
  const op4 = await cli(sC, ['open', 'https://calendar.example/in']);
  ok(/note: the user rejected switching your browser to CloakBrowser for calendar\.example .*\[proposal_rejected\]/.test(op3.err) && !/proposal_rejected/.test(op4.err), 'after the Reject: the next `open` of the host prints the rejection note ONCE, the one after nothing', op3.err + ' ||| ' + op4.err);
  void cal;
}

// ═══ ⑩c verify r1 V7: the agent's baseline intro teaches the claim (one clause) ═══════════════
console.log('— ⑩c the baseline browser intro line names the ONE command a refused site takes (never a workaround)');
{
  const AR = require('../src/agent-routes.js');
  const iso = [...B.ISOLATED_VARIANTS].map((v) => { try { return AR.browserIntroLine(v); } catch { return ''; } }).find((l) => /THIS conversation's own browser/.test(l)) || '';
  ok(/a site that refuses the browser ⇒ `vibespace-browser blocked --url <u> --tier 2` \(the user approves the switch — never a workaround\)/.test(iso), 'the intro line (the isolated variant) carries the one clause: a refused site ⇒ `blocked --url <u> --tier 2`, the user approves, never a workaround', iso.slice(0, 600));
}

// ═══ ⑩b what the card draws ════════════════════════════════════════════════════
console.log('— ⑩b the card draws no character that is not drawn: the URL parsed (ASCII), the agent\'s words cleaned — what shows is what runs');
{
  const dH = path.join(ROOT, 'data-hidden'); fs.mkdirSync(dH, { recursive: true });
  const kH = K.create({ dataDir: dH, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB }), serverSetting: () => undefined, liveKeys: () => new Set(['bk-000d1dd0']), install: false, log: quiet, providers: wiredCloak, hostKnown: () => false });
  const RLO = String.fromCodePoint(0x202e), ZWSP = String.fromCodePoint(0x200b);
  const out = kH.blocked({ url: `https://hidden.example/a${RLO}gnp.exe?q=${ZWSP}1`, why: `sign${ZWSP}-in-refused`, evidence: `it said ${RLO}olleh`, sessionName: `Ops${RLO} desk`, tier: 2, browserKey: 'bk-000d1dd0', sessionId: 's' });
  const e = kH.proposalEntry(out.claim.id), b = SW.proposalCardBlock(e);
  const drawn = JSON.stringify([b.url, b.why, b.evidence, b.plan.label, SW.proposalLines(b).plan.map(SW.lineText)]);
  ok(e.proposal.url === 'https://hidden.example/a%E2%80%AEgnp.exe?q=%E2%80%8B1' && b.url === e.proposal.url && b.why === 'sign-in-refused' && b.evidence === 'it said olleh' && e.proposal.plan.label === 'Ops desk · CloakBrowser' && !/[​‮]/.test(drawn) && e.proposal.digest === SW.proposalDigest(e.proposal),
    'a bidi override / zero-width character the agent sent: the card\'s URL is the parsed one (percent-encoded, the page that reopens), its code, evidence and the new profile\'s label carry none', { url: e.proposal.url, why: b.why, evidence: b.evidence, label: e.proposal.plan.label });
  const odd = SW.proposalFor({ claim: { id: 'bl-0000abcd', host: 'odd.example', url: 'https://odd.example:99999/x' }, plan: { kind: 'new-profile', why: 'ephemeral', label: 'L' }, install: { install: 'present' } });
  ok(SW.proposalUrlOf('accounts.google.com/x') === 'https://accounts.google.com/x' && SW.proposalUrlOf('http://[') === '' && odd.url === 'https://odd.example/', 'proposalUrlOf: a bare host gets https://; a URL that does not parse reopens the site\'s root (never an empty page)', odd.url);
}

// ═══ ⑪ controls ═════════════════════════════════════════════════════════════════
console.log('— ⑪ twelve patched-copy controls, each judged by a row above');
const M = mutantCopies('bprop-propose', REPO);
const swSrc = fs.readFileSync(path.join(REPO, 'src/browser-switch.js'), 'utf8');
{ // c1 — no digest check
  const cut = "    if (shown !== p.digest) return refuse('proposal_changed', 'the card you pressed is not this proposal as it stands — nothing ran; read it again');\n";
  ok(swSrc.includes(cut), 'c1: the digest check is where the control cuts it');
  const m = M.load('src/browser-switch.js', swSrc.replace(cut, ''), 'no-digest');
  const v = m.proposalStep({ ...eF.proposal, state: 'open' }, { event: 'approve', by: 'user', shown: 'pd-00000000' });
  ok(v.ok === true, 'CONTROL c1: without the digest check an Approve naming another card RUNS — ② "proposal_changed" would be red');
}
{ // c2 — no actor check
  const cut = "  if (human && by !== 'user') return refuse('agent_forbidden', 'approving or rejecting a proposal is the user\\'s act — an agent cannot decide its own proposal');\n";
  ok(swSrc.includes(cut), 'c2: the actor check is where the control cuts it');
  const m = M.load('src/browser-switch.js', swSrc.replace(cut, ''), 'no-actor');
  const v = m.proposalStep({ ...eF.proposal, state: 'open' }, { event: 'approve', by: 'agent', shown: eF.proposal.digest });
  ok(v.ok === true, 'CONTROL c2: without the actor check an AGENT\'s approve is a transition — the PURE refusal behind ② would be gone');
}
{ // c3 — every claim a new proposal (the keeper without claimVerdict's `same`)
  const kSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const cut = "    const cv = SW.claimVerdict({ existing: prior, tier: v.value.tier });";
  ok(kSrc.includes(cut), 'c3: the keeper asks claimVerdict where the control cuts it');
  const Km = M.load('src/server/browser-keeper.js', kSrc.replace(cut, "    const cv = v.value.tier === 2 ? 'new' : 'claim-only';"), 'always-new');
  const d3 = path.join(ROOT, 'data-c3'); fs.mkdirSync(d3, { recursive: true });
  const k3 = Km.create({ dataDir: d3, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB }), serverSetting: () => undefined, liveKeys: () => new Set(['bk-000c3c30']), install: false, log: quiet, providers: wiredCloak, hostKnown: () => false });
  k3.blocked({ url: 'https://dup.example/x', tier: 2, browserKey: 'bk-000c3c30', sessionId: 's' });
  k3.blocked({ url: 'https://dup.example/x', tier: 2, browserKey: 'bk-000c3c30', sessionId: 's' });
  ok(k3.proposalsFor('bk-000c3c30').length === 2, 'CONTROL c3: without the SAME-card rule a second claim makes a SECOND proposal (a second card) — ① "the SAME card" would be red');
}
{ // c4 — the runner adding the whole domain instead of the one host
  const pSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-propose.js'), 'utf8');
  const cut = "      const aw = SW.allowlistWith(setting('browser.cloak.egressAllowlist', ''), [p.site, ...(Array.isArray(p.alsoSites) ? p.alsoSites : [])]);";
  ok(pSrc.includes(cut), 'c4: the runner adds the site where the control cuts it');
  const Pm = M.load('src/server/browser-propose.js', pSrc.replace(cut, "      const aw = { list: '.' + p.site.split('.').slice(-2).join('.'), added: true };"), 'whole-domain');
  const set4 = {};
  const stubK = { onProposal: () => () => {}, cloakExecutable: () => ({ ok: true }), stepProposal: () => ({ ok: true }), proposalsFor: () => [], switchBackend: async () => ({ mode: 'switch', reopened: [] }) };
  const run4 = Pm.create({ keeper: stubK, activeSessions: new Map([['sess-c4', { _browserKey: 'bk-0000c4c4' }]]), patchSettings: (p) => Object.assign(set4, p), serverSetting: (k) => set4[k], install: { exeOk: () => true, progress: () => ({}), start: async () => ({}) }, log: quiet });
  await run4.run({ id: 'bl-0000c4c4', browserKey: 'bk-0000c4c4', proposal: { site: 'accounts.google.com', url: 'https://accounts.google.com/', plan: { kind: 'switch', profileId: 'bp-0000c4c4' } } });
  ok(set4['browser.cloak.egressAllowlist'] === '.google.com', 'CONTROL c4: a runner that adds the whole domain opens every google.com host — ③ "ONLY the claim\'s host" would be red');
}
{ // c5 — the tell without noWake
  const hSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-handback.js'), 'utf8');
  const cut = "    try { r = await viaLadder(cid, text, { noWake: true }); }";
  ok(hSrc.includes(cut), 'c5: the tell asks the ladder with noWake where the control cuts it');
  const Hm = M.load('src/server/browser-handback.js', hSrc.replace(cut, '    try { r = await viaLadder(cid, text); }'), 'wake');
  const calls5 = [];
  const h5 = Hm.create({ keeper, deliver: { async deliverToConversation(cid, text, o) { calls5.push(o); return { ok: true, lane: 'message' }; }, stashFor() {} }, activeSessions: active, log: quiet });
  const t5 = await h5.tellProposal({ sessionId: 'sess-a', browserKey: sA._browserKey, text: 'Approved: x' });
  ok(t5.told === 'steered' && calls5.length === 1 && !calls5[0].noWake, 'CONTROL c5: a tell without noWake reaches an idle conversation as a WAKE (a billed turn) — ③ "never a wake" would be red');
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
{ // c7 — verify r1 V1: the runner adding the claimed host ALONE (the pre-fix line) — the sign-in page's own sites refused
  const pSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-propose.js'), 'utf8');
  const cut = "      const aw = SW.allowlistWith(setting('browser.cloak.egressAllowlist', ''), [p.site, ...(Array.isArray(p.alsoSites) ? p.alsoSites : [])]);";
  const Pm = M.load('src/server/browser-propose.js', pSrc.replace(cut, "      const aw = SW.allowlistWith(setting('browser.cloak.egressAllowlist', ''), p.site);"), 'one-host');
  const set7 = {};
  const stubK = { onProposal: () => () => {}, cloakExecutable: () => ({ ok: true }), stepProposal: () => ({ ok: true }), proposalsFor: () => [], switchBackend: async () => ({ mode: 'switch', reopened: [] }) };
  const run7 = Pm.create({ keeper: stubK, activeSessions: new Map([['sess-c7', { _browserKey: 'bk-0000c7c7' }]]), patchSettings: (p) => Object.assign(set7, p), serverSetting: (k) => set7[k], install: { exeOk: () => true, progress: () => ({}), start: async () => ({}) }, log: quiet });
  await run7.run({ id: 'bl-0000c7c7', browserKey: 'bk-0000c7c7', proposal: { site: 'accounts.google.com', alsoSites: GOOGLE_ALSO, url: 'https://accounts.google.com/', plan: { kind: 'switch', profileId: 'bp-0000c7c7' } } });
  ok(set7['browser.cloak.egressAllowlist'] === 'accounts.google.com', 'CONTROL c7: a runner that adds the claimed host alone leaves the sign-in page\'s own sites refused — ③ "EXACTLY the sites Google\'s sign-in page loads from" would be red', set7);
}
{ // c8 — verify r1 V1: the audit answer without the lease check tells ANOTHER conversation what this browser was refused
  const cut = " && typeof k.leasesFor === 'function' && k.leasesFor(f.browserKey).some((l) => l.profileId === profileId)";
  ok(rsrc.includes(cut), 'c8: the audit answer asks for a lease where the control cuts it');
  const Rm = M.load('src/routes/browser.js', rsrc.replace(cut, ''), 'no-lease-check');
  const app8 = express(); app8.use(express.json());
  Rm.setup({ keeper, activeSessions: active, proposals: { rejectionFor: () => null } });
  app8.use(Rm.router);
  const s8 = await new Promise((rr) => { const s = app8.listen(0, '127.0.0.1', () => rr(s)); });
  servers.add(s8);
  const x8 = await (await fetch(`http://127.0.0.1:${s8.address().port}/api/agent/browser/audit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...as(sA) }, body: JSON.stringify({ verb: 'open', ok: true, profile: newP.id, since: 1 }) })).json();
  ok(!!(x8 && x8.egressRefused), 'CONTROL c8: without the lease check another conversation reads this browser\'s refusals — ③b "never told its refusals" would be red', x8);
}
{ // c9 — verify r1 V2: the runner without the pre-flight runs a gone conversation's card (the switch of a shared profile)
  const pSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-propose.js'), 'utf8');
  const cut = "      if (!sessionFor(entry)) return gone('nothing was installed, added or switched');\n";
  ok(pSrc.includes(cut), 'c9: the runner asks for the proposing conversation where the control cuts it');
  const cut2 = "      if (!sessionFor(entry)) return gone('CloakBrowser is installed, nothing else was added or switched');\n";
  const Pm = M.load('src/server/browser-propose.js', pSrc.replace(cut, '').replace(cut2, ''), 'no-preflight');
  const calls9 = [];
  const stubK = { onProposal: () => () => {}, cloakExecutable: () => ({ ok: true }), stepProposal: () => ({ ok: true }), proposalsFor: () => [], switchBackend: async (o) => { calls9.push(o); return { mode: 'switch', reopened: [] }; } };
  const run9 = Pm.create({ keeper: stubK, activeSessions: new Map(), patchSettings: () => {}, serverSetting: () => '', install: { exeOk: () => true, progress: () => ({}), start: async () => ({}) }, log: quiet });
  await run9.run({ id: 'bl-0000c9c9', browserKey: 'bk-0000c9c9', sessionId: 'sess-gone', proposal: { site: 'shared.example', url: 'https://shared.example/', plan: { kind: 'switch', profileId: 'bp-0000c9c9' } } });
  ok(calls9.length === 1, 'CONTROL c9: without the pre-flight a GONE conversation\'s Approve switches the profile — ⑦b "NOT switched under the other conversation" would be red', calls9);
}
{ // c10 — verify r1 V2: the runner that installs whatever the card said
  const pSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-propose.js'), 'utf8');
  const cut = "        if (p.install !== 'needed') return fail(";
  ok(pSrc.includes(cut), 'c10: the runner asks what the card said about the install where the control cuts it');
  const Pm = M.load('src/server/browser-propose.js', pSrc.replace(cut, "        if (false) return fail("), 'install-anyway');
  let starts10 = 0;
  const stubK = { onProposal: () => () => {}, cloakExecutable: () => ({ ok: true }), stepProposal: () => ({ ok: true }), proposalsFor: () => [], switchBackend: async () => ({ mode: 'switch', reopened: [] }) };
  const run10 = Pm.create({ keeper: stubK, activeSessions: new Map([['sess-c10', { _browserKey: 'bk-000c1010' }]]), patchSettings: () => {}, serverSetting: () => '', install: { exeOk: () => starts10 > 0, progress: () => ({ running: false }), start: async () => { starts10++; return {}; } }, log: quiet });
  await run10.run({ id: 'bl-000c1010', browserKey: 'bk-000c1010', sessionId: 'sess-c10', proposal: { site: 'x.example', url: 'https://x.example/', install: 'installed', plan: { kind: 'switch', profileId: 'bp-000c1010' } } });
  ok(starts10 === 1, 'CONTROL c10: a runner that installs whatever the card said downloads the 217 MB behind a card with no download line — ⑦c would be red', starts10);
}
{ // c11 — verify r1: the keeper's store with the plain newest-50 bound evicts an open proposal of another conversation
  const kSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const cut = "    const kept = SW.blockedKeep([...reg.blocked.filter((b) => !(mineOn(b) && !b.proposal)), entry]);";
  ok(kSrc.includes(cut), 'c11: the keeper bounds its claims through blockedKeep where the control cuts it');
  const Km = M.load('src/server/browser-keeper.js', kSrc.replace(cut, "    const kept = { keep: [...reg.blocked.filter((b) => !(mineOn(b) && !b.proposal)), entry].slice(-50), dropped: [] };"), 'slice-50');
  const d11 = path.join(ROOT, 'data-c11'); fs.mkdirSync(d11, { recursive: true });
  const k11 = Km.create({ dataDir: d11, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB }), serverSetting: () => undefined, liveKeys: () => new Set(['bk-000c1111', 'bk-000c2222']), install: false, log: quiet, providers: wiredCloak, hostKnown: () => false });
  const y = k11.blocked({ url: 'https://payroll.example/in', tier: 2, browserKey: 'bk-000c1111', sessionId: 'y' });
  for (let i = 0; i < 60; i++) k11.blocked({ url: `https://h${i}.example/`, tier: 1, browserKey: 'bk-000c2222', sessionId: 'x' });
  ok(!k11.proposalEntry(y.claim.id), 'CONTROL c11: the plain newest-50 bound drops the other conversation\'s OPEN proposal — ⑧b would be red');
}
{ // c12 — verify r1 V2: the runner without the sharers check switches a profile other conversations joined since the card
  const pSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-propose.js'), 'utf8');
  const cut = "      if (!p.plan || p.plan.kind !== 'switch' || typeof keeper.proposalOthers !== 'function') return null;";
  ok(pSrc.includes(cut), 'c12: the runner asks how many conversations use the profile now where the control cuts it');
  const Pm = M.load('src/server/browser-propose.js', pSrc.replace(cut, '      return null;'), 'no-others-check');
  const calls12 = [];
  const stubK = { onProposal: () => () => {}, cloakExecutable: () => ({ ok: true }), stepProposal: () => ({ ok: true }), proposalsFor: () => [], proposalOthers: () => 2, switchBackend: async (o) => { calls12.push(o); return { mode: 'switch', reopened: [] }; } };
  const run12 = Pm.create({ keeper: stubK, activeSessions: new Map([['sess-c12', { _browserKey: 'bk-000c1212' }]]), patchSettings: () => {}, serverSetting: () => '', install: { exeOk: () => true, progress: () => ({}), start: async () => ({}) }, log: quiet });
  await run12.run({ id: 'bl-000c1212', browserKey: 'bk-000c1212', sessionId: 'sess-c12', proposal: { site: 'x.example', url: 'https://x.example/', install: 'installed', plan: { kind: 'switch', profileId: 'bp-000c1212', others: 0 } } });
  ok(calls12.length === 1, 'CONTROL c12: without the check a card that said 0 others switches a profile 2 others now use — ⑦f would be red', calls12);
}
for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 12 })) ok(c.pass, c.name, c.detail);

todos.stop();
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? ` passed, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
