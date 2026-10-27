#!/usr/bin/env node
// A WAKE REQUEST IS DECIDED BY A CLICK, AT EITHER DOOR, AND SAYS WHO AND WHEN (lane wake-approve-card — the owner's ruling
// 2026-10-27 on userW's report: an agent asked to be WOKEN by a chat, the Approve sat only in the For-you tray; «the chat that
// raised it ALSO shows the Approve / Deny card; the approval is still ONLY a click — never a typed «approve», never an agent's
// word»). The card itself is lane chat-needs-you-card's (src/lib/chat-needs-card.js, the ONE renderer); this suite is the
// delta, PURE + in-process (its chrome half: scripts/test-wake-approve-card-chrome.mjs):
//   ① THE CARD MODEL (src/foryou-actions.js decisionCard / decidedStamp): filed / approved / denied / expired / withdrawn /
//     a viewer who may not decide — its buttons, its stamp «approved by you · 09:41» (the same day) / «10/26 09:41» (a day
//     before); a row no person-only door decides keeps its own words. RED CONTROL: the base's record words (settledWords —
//     «approved», no who, no when)
//   ② THE KINDS TABLE — which owner decisions are a card in the chat that raised them, and which are not (and why), read off
//     THE registry: a wake request (wr-) and an access request (rq-) — a card, decided by a person only; the pool's cross-
//     provider ask — a card, its own door; a reset credit — the limit card's; the spend guard's ceilings — notices, nothing to
//     decide
//   ③ ONE ITEM PER REQUEST (identity 'id'): two open wake requests with the same words (two chats of one title) are TWO items,
//     each decidable on its own; a re-ask after a Deny is a NEW item and the denied one keeps its stamp. RED CONTROL: the row
//     as the base shipped it (identity null) — the second request MERGES into the first item (one card for two requests; the
//     older request decidable by nothing), and the re-ask REOPENS the denied record
//   ④ A CLICK IS THE ONLY APPROVAL — the decide route (POST /api/channels/reach-requests/:id/:verdict, the real router over a
//     stub engine): an agent's vsst_, a job's jbt_, an automation key's vsak_, a token in the body ⇒ 403 human_only; a bare
//     write with no browser (curl on an instance whose sign-in is off), another site, a foreign Origin ⇒ 403 cross_site; the
//     engine never asked; this page (Sec-Fetch-Site same-origin, or its own Origin) ⇒ decided. RED CONTROL: the route as the
//     base shipped it (the person verdict cut) — a vsst_ bearer and a bare curl DECIDE
//   ⑤ THE CENSUS — every `decide: 'person'` row has a door whose handler asks THE person verdict (routes/vault.js — never a
//     local copy) before the engine; the engine's decide is called from that route only (no agent route, no automation verb
//     names it); the viewer roles: every page's role is VIEWER_ROLE (one place asks it — chat-needs-card.js), a DEFERRED row
//     is named by no page, an unknown role may not decide. RED COPIES for each
//   ⑥ ONE RENDERER, NEVER STORED TWICE — the card writes no storage of its own and calls no route itself (its verbs are the
//     panel's rows): a textual census of src/lib/chat-needs-card.js with RED COPIES
// Run: node scripts/test-wake-approve-card.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'src');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };

const FA = require(path.join(SRC, 'foryou-actions.js'));
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();   // this machine's clock, as the page's is
const NOW = at(2026, 10, 27, 10, 5);
const wr = (o = {}) => ({ id: 'ut-aaaa000001', sessionKey: 'channels', text: 'ops-agent asks to be woken by Ops room', status: 'open', origin: 'channels', action: { type: 'channel-watch-request', id: 'wr-mh2k1-a1b2c3' }, createdAt: at(2026, 10, 27, 9, 30), resolvedAt: null, resolvedBy: null, ...o });

// ── ① ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① THE CARD MODEL — item → its state, its buttons, its stamp');
{
  const filed = FA.decisionCard(wr(), { now: NOW });
  ok(filed.state === 'filed' && JSON.stringify(filed.buttons) === '["approve","deny"]' && filed.stamp === null && filed.waiting === null, 'filed: open, the owner looking ⇒ Approve + Deny, no stamp', filed);
  const appr = FA.decisionCard(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 41) }), { now: NOW });
  ok(appr.state === 'approved' && !appr.buttons.length && appr.stamp === 'approved by you · 09:41', 'approved from either door ⇒ «approved by you · 09:41», no button', appr);
  const den = FA.decisionCard(wr({ status: 'done', resolvedBy: 'denied', resolvedAt: at(2026, 10, 27, 9, 52) }), { now: NOW });
  ok(den.state === 'denied' && !den.buttons.length && den.stamp === 'denied by you · 09:52', 'denied ⇒ «denied by you · 09:52», no button', den);
  const old = FA.decidedStamp(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 26, 23, 7) }), { now: NOW });
  ok(!!old && old.text === 'approved by you · 10/26 23:07' && old.time === '10/26 23:07' && old.verb === 'approved by you', 'a decision of another day names its day: «approved by you · 10/26 23:07»', old);
  const exp = FA.decisionCard(wr({ status: 'done', resolvedBy: 'expired', resolvedAt: at(2026, 10, 27, 10, 0) }), { now: NOW });
  ok(exp.state === 'expired' && !exp.buttons.length && exp.stamp === 'expired', 'expired ⇒ its final state, no button (never «by you»)', exp);
  const wd = FA.decisionCard(wr({ status: 'done', resolvedBy: 'agent', resolvedAt: at(2026, 10, 27, 10, 0) }), { now: NOW });
  ok(wd.state === 'withdrawn' && !wd.buttons.length && wd.stamp === 'withdrawn by the agent', 'withdrawn by the agent ⇒ its final state, no button', wd);
  const viewer = FA.decisionCard(wr(), { role: 'viewer', now: NOW });
  ok(viewer.state === 'waiting-owner' && !viewer.buttons.length && viewer.waiting === 'waiting for the owner — answer it in the conversation or in For you', 'a viewer who may not decide (the deferred role) ⇒ «waiting for the owner — …», NO buttons', viewer);
  const ghost = FA.decisionCard(wr(), { role: 'guest', now: NOW });
  ok(ghost.state === 'waiting-owner' && !ghost.buttons.length, 'a role the registry does not know may not decide (fail closed)', ghost);
  const exitAllowed = { id: 'ut-x', sessionKey: 'claude:c1', text: 'run `ls` on box?', status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 41), action: { type: 'exit-run-ask', askId: 'ask-1' } };
  ok(FA.decidedStamp(exitAllowed, { now: NOW }) === null && FA.decisionCard(exitAllowed, { now: NOW }).stamp === FA.settledWords(exitAllowed) && !/by you/.test(FA.decisionCard(exitAllowed, { now: NOW }).stamp), 'a row no person-only door decides keeps its own words (an exit ask: «approved · 2 min ago» as before — no «by you»)', FA.decisionCard(exitAllowed, { now: NOW }));
  ok(FA.decidedStamp(wr(), { now: NOW }) === null, 'an open request has no stamp');
  const zh = (s, p) => ({ 'approved by you': '你已批准', 'denied by you': '你已拒绝' }[s] || s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));
  ok(FA.decidedStamp(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 41) }), { t: zh, now: NOW }).text === '你已批准 · 09:41', 'the page\'s words: «你已批准 · 09:41» (zh)');
  // RED CONTROL: the base's record — the quiet line said settledWords + an age: no who, no when
  const base = FA.settledWords(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 41) }));
  ok(base === 'approved' && !/by you|09:41/.test(base), `RED CONTROL: the base's record words — «${base} · 2 min ago»: neither who decided nor when`, base);
}

// ── ② ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② THE KINDS TABLE — which owner decisions are a card in the chat that raised them (read off THE registry)');
{
  const row = (ty) => FA.ROW_OF[ty] || {};
  const KINDS_TABLE = [
    // [type | origin, card in the asking chat?, a person-only door?, why]
    ['channel-watch-request', 'card', true, 'THE wake request (wr-, userW\'s case): an agent asks to be WOKEN — billed turns — by a chat; filed under \'channels\' + about = the asking conversation'],
    ['open-channel', 'card', true, 'an access request (rq-): the SAME decide route; reach, not money — the card and the stamp come with the route'],
    ['pool-cross-provider', 'card', false, 'a conversation moved onto another provider\'s account: a card in that conversation (the chain); its own door (/api/accounts/pool-cross/asks — an agent bearer refused by name), not this lane\'s route'],
    ['reset-credit', 'owner', false, 'a «continue» on a reset credit: the limit wall card answers it in the chat (design-reset-credits) — never drawn twice'],
  ];
  for (const [ty, where, person, why] of KINDS_TABLE) {
    const s = FA.surfaceOf(ty), r = row(ty);
    ok(s.at === where && (r.decide === 'person') === person, `${ty}: ${where === 'card' ? 'a card in the chat that raised it' : 'answered by ' + (s.on || 'its own card')}${person ? ' · decided by a person only (its record: «approved by you · 09:41»)' : ''} — ${why}`, { s, decide: r.decide });
  }
  const spendNotice = { id: 'ut-s', sessionKey: 'accounts', text: 'Auto-resume skipped: the daily ceiling is reached', status: 'open', origin: 'spend', kind: 'notice' };
  ok(FA.needOf(spendNotice) === null && FA.surfaceOf(spendNotice).at === 'notice', 'the spend guard\'s ceilings (src/server/spend-guard.js — kind \'notice\'): no card — nothing to decide (the brief\'s pointer: the guard files NO wake request; the wake request is channels-access.js fileWatchRequest\'s)', FA.surfaceOf(spendNotice));
  ok(JSON.stringify([...FA.PERSON_DECIDES].sort()) === JSON.stringify(['channel-watch-request', 'open-channel']), 'PERSON_DECIDES = exactly the two rows the reach-requests route decides', FA.PERSON_DECIDES);
}

// ── ③ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ ONE ITEM PER REQUEST — N wake requests are N cards; a re-ask after a Deny is a new record');
const FA_PATH = require.resolve(path.join(SRC, 'foryou-actions.js'));
const UT_PATH = require.resolve(path.join(SRC, 'user-todos.js'));
/** the store over `registry` (the real one, or a RED copy installed for this load only) in a scratch dir */
function storeWith(registry) {
  const real = require.cache[FA_PATH].exports;
  delete require.cache[UT_PATH];
  require.cache[FA_PATH].exports = registry;
  try {
    const { UserTodoManager } = require(UT_PATH);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-wake-card-'));
    const m = new UserTodoManager({ dataDir: dir, onChange: () => {}, expirySweepMs: 0 });
    return { m, done: () => { try { m.stop(); } catch { } fs.rmSync(dir, { recursive: true, force: true }); } };
  } finally { require.cache[FA_PATH].exports = real; delete require.cache[UT_PATH]; }
}
const fileWake = (m, id, where = 'Ops room') => m.add('channels', { text: `ops-agent asks to be woken by ${where}`, detail: `Approve writes: wake ops-agent now (a billed turn) on every new message in ${where}, at most 20 wakes a day.`, urgency: 'normal', by: 'agent', sessionName: 'Channels', origin: 'channels', about: 'claude:c-ops', action: { type: 'channel-watch-request', id } });
function scene(registry) {
  const { m, done } = storeWith(registry);
  try {
    const a = fileWake(m, 'wr-a1');            // «Ops room» of the Lark account
    const b = fileWake(m, 'wr-b2');            // «Ops room» of the Slack workspace — the same words
    const open = m.snapshot().open.filter((i) => i.action && i.action.type === 'channel-watch-request');
    const cards = FA.needsOf(m.snapshot().open, ['claude:c-ops']).length;
    m.setStatus(a.id, 'done', 'denied');       // the owner denies the first …
    const c = fileWake(m, 'wr-c3');            // … and the agent asks again, the same words
    const denied = m.get(a.id);
    return { a, b, c, open, cards, denied, aDecidable: open.some((i) => i.action.id === 'wr-a1') };
  } finally { done(); }
}
{
  const g = scene(FA);
  ok(g.open.length === 2 && g.a.id !== g.b.id && g.cards === 2 && g.aDecidable, `two open wake requests with the same words ⇒ TWO items, two cards in the asking chat, the older (wr-a1) decidable on its own — ${g.open.length} items, ${g.cards} cards`, g.open.map((i) => [i.id, i.action.id]));
  ok(g.c.id !== g.a.id && g.denied.status === 'done' && g.denied.resolvedBy === 'denied' && g.denied.action.id === 'wr-a1', 'a re-ask after a Deny is a NEW item; the denied record keeps «denied» (and its request id)', { c: g.c.id, denied: g.denied });
  const RED = { ...FA, ROWS: FA.ROWS.map((r) => (r.type === 'channel-watch-request' ? { ...r, identity: null } : r)) };
  RED.ACTION_IDENTITY = Object.freeze(Object.fromEntries(RED.ROWS.filter((r) => r.identity).map((r) => [r.type, r.identity])));
  const r = scene(RED);
  ok(r.open.length === 1 && r.cards === 1 && !r.aDecidable && r.b.id === r.a.id, `RED CONTROL: the row as the base shipped it (identity null) — the second request MERGES into the first item: ${r.open.length} item / ${r.cards} card for two requests, the older (wr-a1) decidable by nothing`, r.open.map((i) => [i.id, i.action.id]));
  ok(r.c.id === r.a.id && r.denied.status === 'open' && r.denied.action.id === 'wr-c3', 'RED CONTROL: …and the re-ask REOPENS the denied record under the new request (its «denied» gone)', r.denied);
}

// ── ④ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ A CLICK IS THE ONLY APPROVAL — the decide route, the real router over a stub engine');
const express = require('express');
const ROUTES = path.join(SRC, 'routes', 'channels.js');
/** the router module from `source` (the real file, or a RED copy) — compiled AT its own path, so its requires resolve */
function routerFrom(source) {
  const m = new Module(ROUTES + '#red', null);
  m.filename = ROUTES; m.paths = Module._nodeModulePaths(path.dirname(ROUTES));
  m._compile(source, ROUTES);
  return m.exports;
}
async function serve(mod) {
  const calls = [];
  mod.setup({ getEngine: () => ({ decideRequest: async (id, approve, by) => { calls.push({ id, approve, by }); return { ok: true, request: { id, status: approve ? 'approved' : 'denied' } }; } }) });
  const app = express(); app.use(express.json()); app.use(mod.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const own = `http://127.0.0.1:${srv.address().port}`;
  const post = async (verdict, headers = {}, body = {}) => { const r = await fetch(`${own}/api/channels/reach-requests/wr-mh2k1-a1b2c3/${verdict}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, code: j && j.code, error: j && j.error }; };
  return { own, calls, post, close: () => new Promise((r) => srv.close(r)) };
}
const REAL_SRC = read('src/routes/channels.js');
const VERDICT_LINES = "    const who = personVerdict(req);\n    if (!who.ok) return bad(res, 403, DECIDE_REFUSED[who.code] || DECIDE_REFUSED.cross_site, { code: who.code });\n";
{
  const S = await serve(routerFrom(REAL_SRC));
  try {
    for (const [what, h, body] of [
      ['an agent\'s vsst_ bearer', { Authorization: 'Bearer vsst_0123456789abcdef' }],
      ['a job\'s jbt_ bearer', { Authorization: 'Bearer jbt_0123456789abcdef' }],
      ['an automation key (vsak_)', { Authorization: 'Bearer vsak_' + 'A'.repeat(43) }],
      ['a vsst_ bearer that ALSO claims this page (Sec-Fetch-Site same-origin)', { Authorization: 'Bearer vsst_x', 'Sec-Fetch-Site': 'same-origin' }],
      ['a token in the body', {}, { token: 'vsst_x' }],
    ]) {
      const r = await S.post('approve', h, body);
      ok(r.status === 403 && r.code === 'human_only' && /only a person decides this/.test(r.error || ''), `${what} ⇒ 403 human_only, said by name`, r);
    }
    for (const [what, h] of [
      ['a bare write with no browser (curl on an instance whose sign-in is off)', {}],
      ['another site (Sec-Fetch-Site cross-site)', { 'Sec-Fetch-Site': 'cross-site' }],
      ['a same-site sibling (Sec-Fetch-Site same-site)', { 'Sec-Fetch-Site': 'same-site' }],
      ['a foreign Origin', { Origin: 'http://evil.example' }],
    ]) {
      const r = await S.post('approve', h);
      ok(r.status === 403 && r.code === 'cross_site', `${what} ⇒ 403 cross_site`, r);
    }
    const deny = await S.post('deny', { Authorization: 'Bearer vsst_x' });
    ok(deny.status === 403 && deny.code === 'human_only', 'Deny is refused the same way (a decision either way is a click)', deny);
    ok(S.calls.length === 0, `…and the engine was never asked — ${S.calls.length} decisions`, S.calls);
    const page = await S.post('approve', { 'Sec-Fetch-Site': 'same-origin' });
    const own = await S.post('deny', { Origin: S.own });
    ok(page.status === 200 && own.status === 200 && S.calls.length === 2 && S.calls[0].approve === true && S.calls[0].by === 'user' && S.calls[1].approve === false, 'this instance\'s own page (Sec-Fetch-Site same-origin / its own Origin) ⇒ decided, by \'user\'', { page, own, calls: S.calls });
  } finally { await S.close(); }
  // RED CONTROL: the route as the base shipped it (the person verdict cut)
  ok(REAL_SRC.split(VERDICT_LINES).length === 2, 'the RED copy\'s anchor is the route\'s verdict (exactly once)');
  const R = await serve(routerFrom(REAL_SRC.replace(VERDICT_LINES, '')));
  try {
    const a = await R.post('approve', { Authorization: 'Bearer vsst_0123456789abcdef' });
    const b = await R.post('approve', {});
    ok(a.status === 200 && b.status === 200 && R.calls.length === 2, `RED CONTROL: the base's route — an agent's vsst_ bearer and a bare curl both DECIDE (${a.status}, ${b.status}; ${R.calls.length} decisions)`, { a, b });
  } finally { await R.close(); }
}

// ── ⑤ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑤ THE CENSUS — person-only doors, the engine\'s one caller, the viewer roles');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
const SRC_FILES = Object.fromEntries(walk(SRC).map((f) => [path.relative(REPO, f), fs.readFileSync(f, 'utf8')]));
/** THE DOORS of the person-decided rows: the client branch's route, and the server handler that must ask the verdict */
const DOORS = {
  'channel-watch-request': { client: ['src/lib/user-todos-actions.js', '/api/channels/reach-requests/'], server: ['src/routes/channels.js', "router.post('/api/channels/reach-requests/:id/:verdict'"] },
  'open-channel': { client: ['src/lib/channel-reach-editor.js', 'reach-requests/'], server: ['src/routes/channels.js', "router.post('/api/channels/reach-requests/:id/:verdict'"] },
};
function doorProblems(rows, files) {
  const out = [];
  for (const ty of rows) {
    const d = DOORS[ty];
    if (!d) { out.push(`'${ty}' is decided by a person only but names no door`); continue; }
    if (!String(files[d.client[0]] || '').includes(d.client[1])) out.push(`'${ty}': ${d.client[0]} no longer posts to ${d.client[1]}`);
    const s = String(files[d.server[0]] || ''), i = s.indexOf(d.server[1]);
    const body = i < 0 ? '' : s.slice(i, s.indexOf('\n});', i));
    const v = body.indexOf('personVerdict(req)'), e = body.search(/engine\(\)\.decideRequest\(/);
    if (i < 0) out.push(`'${ty}': its route ${d.server[1]} is gone`);
    else if (v < 0 || e < 0 || v > e) out.push(`'${ty}': ${d.server[0]} decides before (or without) asking THE person verdict`);
  }
  if (!/const \{ personVerdict \} = require\('\.\/vault\.js'\);/.test(String(files['src/routes/channels.js']))) out.push('src/routes/channels.js: the person verdict is not routes/vault.js\'s (one verdict, never a local copy)');
  return out;
}
{
  ok(doorProblems(FA.PERSON_DECIDES, SRC_FILES).length === 0, 'every `decide: \'person\'` row has a door that asks THE person verdict (routes/vault.js) BEFORE the engine decides', doorProblems(FA.PERSON_DECIDES, SRC_FILES));
  const cut = { ...SRC_FILES, 'src/routes/channels.js': SRC_FILES['src/routes/channels.js'].replace(VERDICT_LINES, '') };
  ok(doorProblems(FA.PERSON_DECIDES, cut).some((x) => /decides before \(or without\)/.test(x)), 'RED COPY: the route without its verdict is named');
  ok(doorProblems([...FA.PERSON_DECIDES, 'ghost-wake'], SRC_FILES).some((x) => /'ghost-wake' is decided by a person only but names no door/.test(x)), 'RED COPY: a person-decided row with no door is named');
  const local = { ...SRC_FILES, 'src/routes/channels.js': SRC_FILES['src/routes/channels.js'].replace("const { personVerdict } = require('./vault.js');", 'const personVerdict = () => ({ ok: true });') };
  ok(doorProblems(FA.PERSON_DECIDES, local).some((x) => /one verdict, never a local copy/.test(x)), 'RED COPY: a local verdict in place of routes/vault.js\'s is named');
}
/** who calls the engine's decide: exactly routes/channels.js; no agent route and no automation verb names the decide road */
function decideCallers(files) {
  const callers = Object.entries(files).filter(([f, s]) => !/channels-(access|engine)\.js$/.test(f) && /\.decideRequest\(|\.decideWatchRequest\(|decideRequest\(/.test(s)).map(([f]) => f);
  const agentDoors = Object.entries(files).filter(([f, s]) => /^src\/agent-routes(\.js|\/)/.test(f) && /reach-requests|decideRequest|decideWatchRequest/.test(s)).map(([f]) => f);
  const verbs = /reach|decide|watch-request/.test((require(path.join(SRC, 'automation-keys.js')).VERBS || []).join(' ')) ? ['src/automation-keys.js'] : [];
  return { callers, agentDoors, verbs };
}
{
  const c = decideCallers(SRC_FILES);
  ok(JSON.stringify(c.callers) === '["src/routes/channels.js"]' && !c.agentDoors.length && !c.verbs.length, 'the engine\'s decide is called from the person\'s route ONLY — no agent route (/api/agent/…) and no automation verb names it', c);
  const planted = { ...SRC_FILES, 'src/agent-routes/channels-decide.js': "router.post('/api/agent/channels/reach-requests/:id/approve', async (req, res) => res.json(await eng.decideRequest(req.params.id, true, 'agent')));\n" };
  const p = decideCallers(planted);
  ok(p.agentDoors.includes('src/agent-routes/channels-decide.js') && p.callers.includes('src/agent-routes/channels-decide.js'), 'RED COPY: an agent route that decides is named', p);
}
/** the viewer roles: every page's role is asked in ONE place and is a declared, non-deferred row */
function roleProblems(viewers, files) {
  const out = [];
  if (!viewers[FA.VIEWER_ROLE] || viewers[FA.VIEWER_ROLE].deferred || !viewers[FA.VIEWER_ROLE].canDecide) out.push(`VIEWER_ROLE '${FA.VIEWER_ROLE}' must be a live row that decides`);
  for (const [f, s] of Object.entries(files)) {
    if (!f.startsWith('src/lib/')) continue;
    for (const m of s.matchAll(/_role = \(\) => ([^;\n]+)/g)) {
      const v = m[1].trim();
      if (f !== 'src/lib/chat-needs-card.js') out.push(`${f}: a page names a viewer role outside the one place (${v})`);
      const lit = /^'([^']*)'$/.exec(v);
      if (lit && !viewers[lit[1]]) out.push(`${f}: role '${lit[1]}' is no VIEWERS row`);
      else if (lit && viewers[lit[1]].deferred) out.push(`${f}: role '${lit[1]}' is DEFERRED — its row must lose \`deferred\` first`);
      else if (!lit && v !== 'VIEWER_ROLE') out.push(`${f}: the role is not the registry's VIEWER_ROLE (${v})`);
    }
  }
  if (!/decisionCard\(e\.item, \{ role: this\._role\(\), t \}\)/.test(String(files['src/lib/chat-needs-card.js']))) out.push('src/lib/chat-needs-card.js: the card no longer asks decisionCard with the page\'s role');
  return out;
}
{
  ok(roleProblems(FA.VIEWERS, SRC_FILES).length === 0 && FA.canDecide() && FA.canDecide('owner') && !FA.canDecide('viewer') && !FA.canDecide('nobody'), 'the viewer roles: the one role every page has today is \'owner\' (decides); \'viewer\' is DEFERRED (no page names it); an unknown role may not decide', roleProblems(FA.VIEWERS, SRC_FILES));
  ok(FA.VIEWERS.viewer && FA.VIEWERS.viewer.deferred === true && FA.VIEWERS.viewer.canDecide === false, 'the deferred surface is a REGISTRY ROW (VIEWERS.viewer — deferred), never prose');
  const named = { ...SRC_FILES, 'src/lib/chat-needs-card.js': SRC_FILES['src/lib/chat-needs-card.js'].replace('this._role = () => VIEWER_ROLE;', "this._role = () => 'viewer';") };
  ok(roleProblems(FA.VIEWERS, named).some((x) => /role 'viewer' is DEFERRED/.test(x)), 'RED COPY: a page naming the deferred role is named');
  const elsewhere = { ...SRC_FILES, 'src/lib/shared-view.js': "export class SharedView { constructor() { this._role = () => 'owner'; } }\n" };
  ok(roleProblems(FA.VIEWERS, elsewhere).some((x) => /outside the one place/.test(x)), 'RED COPY: a second place answering the role is named');
}

// ── ⑥ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ ONE RENDERER, NEVER STORED TWICE — the card is derived from the For-you item on every pass');
function cardStoreProblems(src) {
  const out = [];
  for (const [re, what] of [[/\blocalStorage\b|\bsessionStorage\b|indexedDB/, 'browser storage'], [/\bfetch(Json)?\(/, 'a route of its own'], [/userState|user-state/, 'the user state'], [/method:\s*'(POST|PUT|PATCH|DELETE)'/, 'a write']]) if (re.test(src)) out.push(`chat-needs-card.js: ${what}`);
  if (!/this\.app\.foryouRows\?\.wire\(card/.test(src)) out.push('chat-needs-card.js: the verbs are no longer the panel\'s rows (foryouRows.wire)');
  return out;
}
{
  const src = SRC_FILES['src/lib/chat-needs-card.js'];
  ok(cardStoreProblems(src).length === 0, 'src/lib/chat-needs-card.js keeps no copy (no storage, no user state) and calls no route of its own — its Approve / Deny are the tray row\'s (foryouRows.wire → the panel\'s one route)', cardStoreProblems(src));
  ok(cardStoreProblems(src + "\nlocalStorage.setItem('cn-cards', JSON.stringify([]));\n").some((x) => /browser storage/.test(x)), 'RED COPY: a card stored in the browser is named');
  ok(cardStoreProblems(src + "\nfetchJson('/api/channels/reach-requests/x/approve', { method: 'POST' });\n").some((x) => /a route of its own/.test(x)), 'RED COPY: a second decision road from the card is named');
  // the stamp is ONE spelling on both doors: the tray row words a resolved item through decidedStamp, as the card does
  const row = SRC_FILES['src/lib/user-todos-row.js'];
  ok(/const stamp = item \? decidedStamp\(item, \{ t \}\) : null;\s*if \(stamp\) return stamp\.text;/.test(row) && /const stamp = decidedStamp\(e\.item, \{ t \}\);/.test(src), 'the tray row (resolvedByText — the tray, the mini inbox, the For-you window) and the chat card both say decidedStamp\'s words');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
