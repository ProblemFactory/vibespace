#!/usr/bin/env node
// AN ORG-WIDE SLACK INSTALL (lane slack-org-team-id — B-8ca4 + B-091e, parked by lane slack-grid-identity 2026-10-14).
// FAST: in process, over a LOOPBACK fake Slack — a node:http server on 127.0.0.1 (an ephemeral port) that judges
// `team_id` the way Slack judges an org-wide install's token (docs.slack.dev "Developing apps for Enterprise orgs"),
// the recorded answers of scripts/fixtures/slack-vendor.cjs behind it. The lane makes NO live Slack call; every id is a
// SHAPE (T0AB12CD3, E0XY98ZW7), every token is built at run time.
//   ⓐ THE RECORD LEARNS THE INSTALL KIND: auth.test `is_enterprise_install: true` with team_id a workspace / the org
//      itself / null ⇒ isEnterpriseInstall + enterprise + team + teamFrom (auth.test › oauth.v2.access ›
//      auth.teams.list); the consent's oauth.v2.access answer alone says it too; a workspace-level token ⇒ false and no
//      auth.teams.list; an org install with no workspace granted ⇒ refused by name, nothing written; a re-authorize
//      rewrites the stored record both ways
//   ⓑ a `workspace` method on an org record carries team_id (the fake refuses without it: missing_argument) and is
//      answered as the workspace record's is; an `org` method carries none
//   ⓒ a workspace-level record's requests are BYTE-IDENTICAL to a copy of slack.js without the seam (a record from
//      before this lane, and a new `isEnterpriseInstall: false` one); the org record's are not (the control has teeth)
//   ⓓ the refusal: missing_argument / team_access_not_granted on an org record ⇒ forbidden `org-team-not-granted` with
//      the door (Re-authorize), never the bare code; convCaps carries the why; the client's words en / zh / ja; the same
//      codes on a workspace-level record keep the base words
//   ⓔ THE METHOD_SCOPE CENSUS: every method slack.js sends (its api / page / walk / callSlack call sites) is a row and
//      every row is sent; `team_id` is written in ONE place; a planted call is RED, a call the census cannot read is RED
// SLACK_ORG_BASE=<a slack.js from before the lane> adds ⓒ's comparison against that file too (the lane's own proof).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { blank } from './vendor-response-census.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const CH = require(path.join(REPO, 'src/channels/index.js'));
const slack = require(path.join(REPO, 'src/channels/slack.js'));
const Manifest = require(path.join(REPO, 'src/channels/slack-manifest.js'));
const Words = require(path.join(REPO, 'src/channels/slack-words.js'));
const Caps = require(path.join(REPO, 'src/channel-caps.js'));
const OL = require(path.join(REPO, 'src/oauth-loopback.js'));
const { createSlackVendor, FX, TOKEN, WS_CLIENT_ID, WS_CLIENT_SECRET } = require(path.join(REPO, 'scripts/fixtures/slack-vendor.cjs'));
const MC = mutantCopies('slack-org-install', REPO);
const quiet = { log() {}, warn() {}, error() {} };

// ── the shapes ──
const ORG = 'E0XY98ZW7', WS1 = 'T0AB12CD3', WS2 = 'T0CD34EF5', WS_GONE = 'T0ZZ99YY8';
const ORG_TOKEN = ['xo', 'xp-1111111111-2222222222-5555555555-orgwidefixtureabcd'].join('');
const SCOPES = [...FX.scopesHeader.split(','), 'files:write', 'search:read'];
const WS_HELD = Object.freeze({ access_token: TOKEN, user: 'U0SELF001', team: 'T0ACME001', teamName: 'Acme', userId: 'T0ACME001/U0SELF001', label: 'Acme · @mart', scopes: SCOPES });   // a record from before this lane: no install kind
const ORG_HELD = Object.freeze({ ...WS_HELD, access_token: ORG_TOKEN, team: WS1, enterprise: ORG, isEnterpriseInstall: true, teamFrom: 'auth.teams.list', userId: `${ORG}/${WS1}/U0SELF001`, teamName: 'Workspace 1', label: 'Workspace 1 · @mart' });

// ── THE LOOPBACK FAKE ── its own reading of Slack's org methods (never the adapter's table)
const ORG_METHODS = new Set(['auth.test', 'auth.teams.list', 'oauth.v2.access', 'apps.manifest.create', 'team.info']);
const fake = { log: [], granted: [WS1, WS2], authTeam: WS1, flag: true, orgConsent: false, failWs: {}, vendor: null };
const freshVendor = () => { fake.vendor = createSlackVendor({ mode: { extraTokens: [ORG_TOKEN] } }); return fake.vendor; };
freshVendor();
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  const method = String(req.url || '').replace(/^\/api\//, '').replace(/\?.*$/, '');
  const auth = String(req.headers.authorization || '');
  const ct = String(req.headers['content-type'] || '');
  const form = /json/.test(ct) ? {} : Object.fromEntries(new URLSearchParams(raw));
  const who = auth === `Bearer ${ORG_TOKEN}` ? 'org' : auth.startsWith('Basic ') ? 'app' : 'workspace';
  fake.log.push({ method, raw, ct, who, teamId: form.team_id || null });
  const answer = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'x-oauth-scopes': SCOPES.join(','), ...headers }); res.end(JSON.stringify(body)); };
  if (who === 'org') {
    if (method === 'auth.test') return answer(200, { ok: true, url: 'https://org-fixture.enterprise.slack.com/', team: 'Org Fixture', user: 'mart', team_id: fake.authTeam, user_id: 'U0SELF001', enterprise_id: ORG, ...(fake.flag ? { is_enterprise_install: true } : {}) });
    if (method === 'auth.teams.list') return answer(200, { ok: true, teams: fake.granted.map((id, i) => ({ id, name: `Workspace ${i + 1}` })), response_metadata: { next_cursor: '' } });
    if (!ORG_METHODS.has(method)) {
      if (!form.team_id) return answer(200, { ok: false, error: 'missing_argument' });
      if (!fake.granted.includes(form.team_id)) return answer(200, { ok: false, error: 'team_access_not_granted' });
    }
  }
  if (who === 'workspace' && fake.failWs[method]) return answer(200, { ok: false, error: fake.failWs[method] });
  // a page of one bot message with no bot_profile name — the adapter names that bot with bots.info (the recorded pages have none)
  if (method === 'conversations.history' && form.channel === 'C0BOTPAGE') return answer(200, { ok: true, messages: [{ type: 'message', subtype: 'bot_message', bot_id: 'B0NOPROF1', text: 'build passed', ts: '1700000020.000120' }], has_more: false });
  if (method === 'files.getUploadURLExternal') return answer(200, { ok: true, upload_url: `${slack.FILES_ORIGIN}upload/v1/fixture`, file_id: 'F0UP00001' });
  if (method === 'files.completeUploadExternal') return answer(200, { ok: true, files: [{ id: 'F0UP00001', title: 'a.png' }] });
  const fwd = new URLSearchParams(raw);
  fwd.delete('team_id');   // the recorded answers never had it
  const r = await fake.vendor.fetchFn(slack.API + method, { method: 'POST', headers: { Authorization: auth, 'Content-Type': ct }, body: /json/.test(ct) ? raw : fwd.toString() });
  let body = await r.json();
  if (method === 'oauth.v2.access' && fake.orgConsent && body.ok) body = { ...body, team: null, enterprise: { id: ORG, name: 'Org Fixture' }, is_enterprise_install: true };
  answer(r.status, body, r.headers.get('retry-after') ? { 'Retry-After': r.headers.get('retry-after') } : {});
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
// the adapter's fetch: the Web API to the loopback fake; a files.slack.com URL to the recorded fixture in process
const loopFetch = (url, init) => { const u = String(url && url.url ? url.url : url); return u.startsWith(slack.API) ? fetch(`${BASE}/api/${u.slice(slack.API.length)}`, init) : fake.vendor.fetchFn(u, init); };

const clock = 1_800_000_000_000;
const now = () => clock;
function mkTokens(held) {
  const st = { token: held ? { ...held } : null, writes: 0 };
  return { st, read: () => ({ token: st.token, why: st.token ? null : 'never-authenticated' }), write: async (t) => { st.token = t; st.writes++; }, clear: async () => { st.token = null; } };
}
function mkState() { const h = { s: {} }; return { read: () => ({ ...h.s }), write: async (p) => { h.s = { ...h.s, ...p }; } }; }
function mkAdapter({ mod = slack, held = null, record = { id: 'slack', label: 'Slack' }, deps = {} } = {}) {
  const tokens = mkTokens(held);
  const reg = CH.createChannelRegistry(); reg.register(mod.adapter);
  const a = reg.create('slack', record, { now, fetch: loopFetch, tokens, oauth: OL.createOAuthLoopback({ now, log: quiet }), state: mkState(), log: quiet, meter() {}, sleep: async () => {}, ...deps });
  return { a, tokens };
}

// THE SWEEP: one call of each adapter path, in order — every Web API method the adapter sends while reading and writing
const MSG_TS = '1700000012.000112';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
const SWEEP = [
  ['list', (a) => a.listConversations({})],
  ['convCaps', (a) => a.convCaps('C0GENERAL')],
  ['convCaps shared', (a) => a.convCaps('C0SHARED1')],
  ['reactions', (a) => a.reactions('C0GENERAL', { messageId: MSG_TS })],   // before a page fills the reaction cache
  ['history', (a) => a.history('C0GENERAL', { limit: 5 })],
  ['history (a nameless bot)', (a) => a.history('C0BOTPAGE', { limit: 5 })],
  ['thread', (a) => a.threadHistory('C0GENERAL', '1700000002.000102', { limit: 5 })],   // the recorded thread
  ['search', (a) => a.search({ query: 'quarterly' })],
  ['avatar', (a) => a.avatarImage('U0ALICE01')],
  ['react', (a) => a.react('C0GENERAL', { messageId: MSG_TS, key: 'eyes' })],
  ['unreact', (a) => a.unreact('C0GENERAL', { messageId: MSG_TS, key: 'eyes' })],
  ['prepareSend', (a) => a.prepareSend('C0GENERAL', { text: 'hello @Alice' })],
  ['send', (a) => a.send('C0GENERAL', { text: 'hello' })],
  ['send a file', (a) => a.send('C0GENERAL', { text: 'a file', attachments: [{ name: 'a.png', mime: 'image/png', kind: 'image', bytes: PNG.length, data: PNG }] })],
  ['attachment', (a) => a.fetchAttachment('C0GENERAL', { attachmentId: 'F0PLAN001' })],
];
async function sweep(mod, held) {
  freshVendor();
  const { a } = mkAdapter({ mod, held });
  const from = fake.log.length;
  const steps = [];
  for (const [name, fn] of SWEEP) {
    const at = fake.log.length;
    let out;
    try { await fn(a); out = { ok: true }; } catch (e) { out = { ok: false, code: e && e.code, why: e && e.detail && e.detail.why, error: e && e.detail && e.detail.error, message: String((e && e.message) || e) }; }
    steps.push({ name, out, reqs: fake.log.slice(at) });
  }
  return { steps, reqs: fake.log.slice(from) };
}
const wire = (reqs) => JSON.stringify(reqs.map((q) => [q.method, q.ct, q.raw]));
const scopeOf = (m) => slack.METHOD_SCOPE[m];

// the seam-less copy: slack.js with `withTeam` not called (the request as before the lane; the refusal words kept)
const SRC = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf8');
const SEAM = 'await callSlack(fetchFn, method, withTeam(method, params, held), { token: tok });';
const NOSEAM = SRC.includes(SEAM) ? require(MC.write('src/channels/slack.js', SRC.replace(SEAM, 'await callSlack(fetchFn, method, params, { token: tok });'), 'noseam')) : null;
ok(!!NOSEAM, 'the seam is the one callSlack line in api() (the copy without it loads)');

// ── ⓐ the record learns the install kind ──
console.log('ⓐ the record learns the install kind');
async function paste(token, { held = null, set = {} } = {}) {
  Object.assign(fake, { granted: [WS1, WS2], authTeam: WS1, flag: true }, set);
  freshVendor();
  const { a, tokens } = mkAdapter({ held });
  const f = await a.auth.begin();
  const from = fake.log.length;
  let r, err = null;
  try { r = await a.auth.finish(f.flowId, token); } catch (e) { err = e; }
  return { r, err, tok: tokens.st.token, writes: tokens.st.writes, reqs: fake.log.slice(from) };
}
{
  const ms = (q) => q.map((x) => x.method).join();
  const p1 = await paste(ORG_TOKEN, { set: { authTeam: WS1 } });
  ok(p1.tok && p1.tok.isEnterpriseInstall === true && p1.tok.enterprise === ORG && p1.tok.team === WS1 && p1.tok.teamFrom === 'auth.test' && p1.tok.userId === `${ORG}/${WS1}/U0SELF001` && ms(p1.reqs) === 'auth.test',
    `auth.test is_enterprise_install + a workspace team_id ⇒ the record: isEnterpriseInstall, enterprise ${ORG}, team ${WS1} from auth.test — ONE request (${ms(p1.reqs)})`, JSON.stringify(p1.tok && { ...p1.tok, access_token: '…' }));
  for (const [what, set] of [['the org itself', { authTeam: ORG }], ['null', { authTeam: null }], ['the org, with no is_enterprise_install', { authTeam: ORG, flag: false }]]) {
    const p = await paste(ORG_TOKEN, { set });
    const tl = p.reqs.filter((q) => q.method === 'auth.teams.list');
    ok(p.tok && p.tok.isEnterpriseInstall === true && p.tok.team === WS1 && p.tok.teamFrom === 'auth.teams.list' && p.tok.teamName === 'Workspace 1' && p.tok.label === 'Workspace 1 · @mart' && ms(p.reqs) === 'auth.test,auth.teams.list' && tl.length === 1 && tl[0].teamId === null && tl[0].raw === 'limit=100',
      `auth.test's team_id = ${what} ⇒ the workspace is the first auth.teams.list names (${WS1}, "Workspace 1"); requests ${ms(p.reqs)}`, JSON.stringify(p.tok && { ...p.tok, access_token: '…' }));
  }
  const p5 = await paste(ORG_TOKEN, { set: { authTeam: null, granted: [] } });
  const e5 = p5.err || (p5.r && p5.r.ok === false ? p5.r : null);
  const m5 = String((e5 && (e5.message || e5.error)) || '');
  ok(e5 && !p5.tok && p5.writes === 0 && /no workspace is granted/.test(m5) && /Re-authorize/.test(m5) && /nothing was connected/.test(m5),
    `an org install no workspace is granted to ⇒ refused by name, nothing written ("${m5.slice(0, 120)}")`);
  const p6 = await paste(TOKEN);
  ok(p6.tok && p6.tok.isEnterpriseInstall === false && !('teamFrom' in p6.tok) && p6.tok.team === 'T0ACME001' && p6.tok.userId === 'T0ACME001/U0SELF001' && ms(p6.reqs) === 'auth.test',
    `a workspace-level token ⇒ isEnterpriseInstall false, no teamFrom, ONE auth.test and no auth.teams.list (${ms(p6.reqs)})`);
  // a re-authorize rewrites the stored record — it learns the later fact, both ways
  const p7 = await paste(ORG_TOKEN, { held: { ...WS_HELD, access_token: ORG_TOKEN }, set: { authTeam: null } });
  ok(p7.tok && p7.tok.isEnterpriseInstall === true && p7.tok.team === WS1 && p7.writes === 1, 'a record stored without the field, re-authorized after the app went org-wide ⇒ the stored record now says org-wide + its workspace');
  const p8 = await paste(TOKEN, { held: ORG_HELD });
  ok(p8.tok && p8.tok.isEnterpriseInstall === false && !('teamFrom' in p8.tok) && p8.tok.team === 'T0ACME001', 'an org record re-authorized with a workspace-level token ⇒ the whole record rewritten (false, no teamFrom)');
  // the consent path: oauth.v2.access answers is_enterprise_install + team null; auth.test here names a workspace and no flag
  Object.assign(fake, { granted: [WS1, WS2], authTeam: WS2, flag: false, orgConsent: true });
  freshVendor();
  const sign = (s) => crypto.createHmac('sha256', 'org-install-fixture').update(String(s)).digest('base64url');
  const { a: ca, tokens: ct } = mkAdapter({ record: { id: 'slack', label: 'Slack', credentialKey: 'custom' }, deps: { credentialKey: 'custom', resolveIntegration: () => ({ source: 'user', values: Object.fromEntries([['clientId', WS_CLIENT_ID], ['clientSecret', WS_CLIENT_SECRET]]) }), consent: { sign } } });
  const cf = await ca.auth.begin({ origin: 'https://hub.example.test' });
  const back = fake.vendor.allow(cf.consentUrl, { token: ORG_TOKEN });
  const from = fake.log.length;
  const cr = await ca.auth.finish(cf.flowId, back);
  const creqs = fake.log.slice(from);
  ok(cr && cr.ok === true && ct.st.token && ct.st.token.isEnterpriseInstall === true && ct.st.token.team === WS2 && ct.st.token.teamFrom === 'auth.test' && creqs.map((q) => q.method).join() === 'oauth.v2.access,auth.test',
    `the consent path: oauth.v2.access says is_enterprise_install (team null) while auth.test says neither ⇒ the record is org-wide, its workspace auth.test's ${WS2} (${creqs.map((q) => q.method).join()})`, JSON.stringify(cr && cr.error));
  fake.orgConsent = false;
}

// ── ⓑ ⓒ the sweep: org record, workspace records, the copy without the seam ──
console.log('ⓑ a workspace method on an org record carries team_id; an org method none');
Object.assign(fake, { granted: [WS1, WS2], failWs: {} });
const wsLane = await sweep(slack, WS_HELD);
const orgLane = await sweep(slack, ORG_HELD);
const orgCopy = NOSEAM ? await sweep(NOSEAM, ORG_HELD) : null;
{
  const seen = [...new Set(orgLane.reqs.map((q) => q.method))];
  const wsSeen = seen.filter((m) => scopeOf(m) === 'workspace');
  const bad = orgLane.reqs.filter((q) => (scopeOf(q.method) === 'workspace' ? q.teamId !== WS1 : q.teamId !== null));
  ok(bad.length === 0 && wsSeen.length === Object.values(slack.METHOD_SCOPE).filter((v) => v === 'workspace').length, `the org record's ${orgLane.reqs.length} requests: every workspace method (${wsSeen.length}: ${wsSeen.join(', ')}) carries team_id=${WS1}; the org ones (${seen.filter((m) => scopeOf(m) === 'org').join(', ') || 'none'}) carry none`, JSON.stringify(bad.map((q) => [q.method, q.teamId])));
  for (const m of ['users.conversations', 'users.list', 'bots.info', 'search.messages']) ok(orgLane.reqs.some((q) => q.method === m && q.teamId === WS1), `${m} — on Slack's list of methods that REQUIRE team_id for an org-ready app — carries it`);
  const differ = orgLane.steps.filter((s, i) => s.out.ok !== wsLane.steps[i].out.ok);
  ok(differ.length === 0 && orgLane.steps.filter((s) => s.out.ok).length >= 14, `every step answers on the org record as on the workspace record (${orgLane.steps.filter((s) => s.out.ok).length}/${SWEEP.length} ok each; on both: ${orgLane.steps.filter((s) => !s.out.ok).map((s) => `${s.name} = ${s.out.code}/${s.out.why}`).join(', ') || 'none refused'})`, JSON.stringify(differ.map((s) => [s.name, s.out])));
  const refused = orgCopy ? orgCopy.steps.filter((s) => !s.out.ok && s.out.error === 'missing_argument') : [];
  ok(orgCopy && refused.length >= 8 && orgCopy.reqs.filter((q) => scopeOf(q.method) === 'workspace').every((q) => q.teamId === null),
    `CONTROL — the copy without the seam, same org record: no team_id, and the fake refuses missing_argument (${refused.length} steps: ${refused.map((s) => s.name).join(', ')})`);
  // the table the report carries: per method, the workspace record's request vs the org record's
  console.log('    method | scope | workspace record | org record | org record, no seam');
  for (const m of [...new Set([...wsLane.reqs, ...orgLane.reqs].map((q) => q.method))]) {
    const one = (L) => { const q = L ? L.reqs.find((x) => x.method === m) : null; return q ? (q.teamId ? `team_id=${q.teamId}` : 'no team_id') : '—'; };
    const refusedHere = orgCopy ? orgCopy.steps.some((s) => s.reqs.some((q) => q.method === m) && s.out.error === 'missing_argument') : false;
    console.log(`    ${m} | ${scopeOf(m) || '(no row)'} | ${one(wsLane)} | ${one(orgLane)} | ${one(orgCopy)}${refusedHere ? ' → missing_argument' : ''}`);
  }
}

console.log('ⓒ a workspace-level record: byte-identical to the copy without the seam');
{
  const wsCopy = await sweep(NOSEAM || slack, WS_HELD);
  const wsFalse = await sweep(slack, { ...WS_HELD, isEnterpriseInstall: false });
  const wsCopyF = await sweep(NOSEAM || slack, { ...WS_HELD, isEnterpriseInstall: false });
  ok(wsLane.reqs.length >= 18 && wire(wsLane.reqs) === wire(wsCopy.reqs) && wsLane.reqs.every((q) => q.teamId === null),
    `a record from before the lane (no field): ${wsLane.reqs.length} requests, method + content type + body byte-identical to the copy's, none with team_id`, `${wsLane.reqs.length} vs ${wsCopy.reqs.length}`);
  ok(wire(wsFalse.reqs) === wire(wsCopyF.reqs) && wire(wsFalse.reqs) === wire(wsLane.reqs), 'a new record saying isEnterpriseInstall: false — the same bytes');
  const stringy = await sweep(slack, { ...WS_HELD, isEnterpriseInstall: 'true' });
  ok(wire(stringy.reqs) === wire(wsLane.reqs), 'a record whose field is not the boolean true (the string "true") is not org-wide — the same bytes');
  ok(!!orgCopy && wire(orgLane.reqs) !== wire(orgCopy.reqs), 'CONTROL — the org record\'s requests are NOT the copy\'s (the comparison sees team_id)');
  if (process.env.SLACK_ORG_BASE) {
    const BASESRC = fs.readFileSync(process.env.SLACK_ORG_BASE, 'utf8');
    const B = require(MC.write('src/channels/slack.js', BASESRC, 'base'));
    const wsBase = await sweep(B, WS_HELD);
    ok(wire(wsBase.reqs) === wire(wsLane.reqs) && wsBase.steps.every((s, i) => s.out.ok === wsLane.steps[i].out.ok), `SLACK_ORG_BASE (${path.basename(process.env.SLACK_ORG_BASE)}): the base file's ${wsBase.reqs.length} requests for the same record are byte-identical to this tree's`);
  }
}

// ── ⓓ the refusal names the door ──
console.log('ⓓ the refusal names the door');
{
  freshVendor();
  const { a } = mkAdapter({ held: { ...ORG_HELD, team: WS_GONE } });
  const e1 = await threw(() => a.listConversations({}));
  ok(e1 && e1.code === 'forbidden' && e1.retryable === false && e1.detail.why === 'org-team-not-granted' && e1.detail.error === 'team_access_not_granted' && e1.detail.team === WS_GONE && /whole organization/.test(e1.message) && e1.message.includes(WS_GONE) && /Re-authorize from a workspace the app is added to/.test(e1.message) && e1.message !== 'slack users.conversations: team_access_not_granted',
    `a workspace the org install is not granted (${WS_GONE}) ⇒ forbidden org-team-not-granted: "${e1 && e1.message}"`);
  const cc = await a.convCaps('C0GENERAL');
  ok(cc && cc.read === 'no' && cc.why === 'org-team-not-granted' && cc.threads.why === 'org-team-not-granted', 'convCaps on that record ⇒ read no, why org-team-not-granted (the conversation\'s card says the door)');
  const miss = orgCopy ? orgCopy.steps.find((s) => s.name === 'list') : null;
  ok(miss && miss.out.code === 'forbidden' && miss.out.why === 'org-team-not-granted' && miss.out.error === 'missing_argument' && /Re-authorize/.test(miss.out.message), `missing_argument on an org record (the copy without the seam) ⇒ the same words: "${miss && miss.out.message}"`);
  const en = Caps.sendWhyText('org-team-not-granted');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const tr = (src) => { const i = src.indexOf(`${JSON.stringify(en)}: "`); return i < 0 ? null : JSON.parse(src.slice(i + JSON.stringify(en).length + 2, src.indexOf('\n', i)).replace(/,\s*$/, '')); };
  ok(/whole organization/.test(en) && /Re-authorize/.test(en) && Words.WHYS.includes('org-team-not-granted') && Caps.threadWhyText('org-team-not-granted') === en,
    `the client's words: "${en}" (WHYS closed list; threads fall through to it)`);
  ok(/重新授权/.test(tr(zh) || '') && /再認可/.test(tr(ja) || ''), `zh 「${tr(zh)}」 · ja 「${tr(ja)}」`);
  // the same codes on a workspace-level record keep the base words
  fake.failWs = { 'users.conversations': 'team_access_not_granted' };
  const w1 = await threw(() => mkAdapter({ held: WS_HELD }).a.listConversations({}));
  fake.failWs = { 'users.conversations': 'missing_argument' };
  const w2 = await threw(() => mkAdapter({ held: WS_HELD }).a.listConversations({}));
  fake.failWs = {};
  ok(w1 && w1.code === 'forbidden' && w1.detail.why === 'team-access-not-granted' && w1.message === 'slack users.conversations: team_access_not_granted' && w2 && w2.code === 'vendor-error' && w2.detail.why === 'vendor' && w2.message === 'slack users.conversations: missing_argument',
    'a workspace-level record: team_access_not_granted / missing_argument keep the base words (team-access-not-granted, vendor)', JSON.stringify([w1 && w1.message, w2 && w2.message]));
}

// ── ⓔ the METHOD_SCOPE census ──
console.log('ⓔ the METHOD_SCOPE census');
const CALL_RE = /\b(callSlack|api|page|walk)\(/g;
const FN_RE = /(?:async\s+)?function\s+(\w+)\s*\(/g;
const FORWARDERS = new Set(['api', 'page', 'walk']);   // the three that hand their own `method` argument on
/** {sent, unread}: the Web API methods a slack.js text sends — read off its call sites, comments and strings blanked
 *  first (the source's own text at the same offsets gives the literal). A method argument that is not a literal (or a
 *  ternary of two), the sign-in's two named constants, or a forwarder's own `method` is UNREAD — red, the census cannot vouch for it. */
function census(src) {
  const b = blank(src);
  const defs = [...b.matchAll(FN_RE)].map((m) => ({ at: m.index, name: m[1] }));
  const sent = new Set(), unread = [];
  for (const m of b.matchAll(CALL_RE)) {
    const at = m.index;
    if (/function\s+$/.test(b.slice(Math.max(0, at - 16), at)) || b[at - 1] === '.') continue;   // a definition / another object's method
    const args = src.slice(at + m[0].length, at + m[0].length + 240);
    const parts = args.split(',');
    const arg = (m[1] === 'walk' || m[1] === 'callSlack' ? parts[1] : parts[0]).split(')')[0].trim();
    const lit = /^'([a-z]+\.[A-Za-z.]+)'$/.exec(arg);
    const either = /^[\w.]+\s*\?\s*'([a-z]+\.[A-Za-z.]+)'\s*:\s*'([a-z]+\.[A-Za-z.]+)'$/.exec(arg);   // `tk ? 'a.b' : 'c.d'` — two literals
    const inside = defs.filter((d) => d.at < at).pop();
    if (lit) sent.add(lit[1]);
    else if (either) { sent.add(either[1]); sent.add(either[2]); }
    else if (arg === 'Manifest.EXCHANGE_METHOD') sent.add(Manifest.EXCHANGE_METHOD);
    else if (arg === 'req.method') sent.add(Manifest.CREATE_METHOD);
    else if (arg === 'method' && inside && FORWARDERS.has(inside.name)) continue;
    else unread.push(`${m[1]}(${arg})`);
  }
  return { sent, unread };
}
const judge = (src, table) => { const c = census(src); return { ...c, missing: [...c.sent].filter((m) => !Object.prototype.hasOwnProperty.call(table, m)), dead: Object.keys(table).filter((m) => !c.sent.has(m)) }; };
{
  const T = slack.METHOD_SCOPE;
  const j = judge(SRC, T);
  ok(j.unread.length === 0 && j.missing.length === 0 && j.dead.length === 0 && j.sent.size === Object.keys(T).length && j.sent.has('auth.teams.list') && j.sent.has(Manifest.CREATE_METHOD),
    `slack.js sends ${j.sent.size} Web API methods, every one a METHOD_SCOPE row and every row sent`, JSON.stringify({ unread: j.unread, missing: j.missing, dead: j.dead }));
  ok(Object.isFrozen(T) && Object.values(T).every((v) => v === 'workspace' || v === 'org') && ['auth.test', 'auth.teams.list', 'team.info', Manifest.EXCHANGE_METHOD, Manifest.CREATE_METHOD].every((m) => T[m] === 'org') && Object.values(T).filter((v) => v === 'workspace').length === 16,
    'the table is frozen, two words only; the sign-in, the org\'s own and team.info {team} are org — the other 16 workspace');
  // every Slack-method-shaped literal in the file is a row, or one of the two non-Web-API names (the upload POST, a file GET)
  const LIT = /'((?:auth|users|conversations|chat|reactions|bots|team|emoji|files|search|pins|stars|usergroups|dnd|apps|oauth)\.[A-Za-z]+(?:\.[A-Za-z]+)*)'/g;
  const lits = [...new Set([...SRC.matchAll(LIT)].map((m) => m[1]).filter((m) => !/\.(?:com|net|org)$/.test(m)))];
  const outside = lits.filter((m) => !(m in T));
  ok(outside.sort().join() === 'files.download,files.upload', `every method-shaped literal of slack.js is a row but the two that are no Web API method (${outside.join(', ')})`);
  const keys = (blank(SRC).match(/[{,]\s*team_id\s*:/g) || []).length;
  ok(keys === 1 && /function withTeam\(method, params, held\) \{[\s\S]{0,400}team_id: t\.team/.test(SRC), `team_id is WRITTEN in one place in slack.js — withTeam (${keys} object key)`);
  // RED controls
  const ANCHOR = "      await api('reactions.add', { channel: convId, timestamp: ts, name: String(key) }, { convId });\n";
  const planted = SRC.includes(ANCHOR) ? judge(SRC.replace(ANCHOR, ANCHOR + "      await api('pins.add', { channel: convId, timestamp: ts }, { convId });\n"), T) : null;
  ok(planted && planted.missing.join() === 'pins.add', `CONTROL — a planted api('pins.add', …): red (${planted ? planted.missing.join() || 'GREEN — the census missed it' : 'the anchor is gone'})`);
  const hidden = SRC.includes(ANCHOR) ? judge(SRC.replace(ANCHOR, ANCHOR + "      const pinMethod = 'pins.add';\n      await api(pinMethod, { channel: convId, timestamp: ts }, { convId });\n"), T) : null;
  ok(hidden && hidden.unread.join() === 'api(pinMethod)', `CONTROL — a call whose method is a variable: red as unread (${hidden ? hidden.unread.join() || 'GREEN' : 'the anchor is gone'})`);
  const { 'bots.info': _gone, ...lessT } = T;
  const short = judge(SRC, lessT);
  ok(short.missing.join() === 'bots.info', `CONTROL — the table without bots.info: red (${short.missing.join() || 'GREEN'})`);
  const extra = judge(SRC, { ...T, 'pins.list': 'workspace' });
  ok(extra.dead.join() === 'pins.list', `CONTROL — a row nothing sends (pins.list): red (${extra.dead.join() || 'GREEN'})`);
  const twice = (blank(SRC.replace("  const params = { channel: convId, text: Text.toMrkdwn(body, mentions) };", "  const params = { channel: convId, team_id: selfTeam(), text: Text.toMrkdwn(body, mentions) };")).match(/[{,]\s*team_id\s*:/g) || []).length;
  ok(twice === 2, `CONTROL — a second team_id written beside chat.postMessage's params: counted (${twice})`);
}

for (const c of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 1, label: 'slack-org-install: ' })) ok(c.pass, c.name, c.detail);
server.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
