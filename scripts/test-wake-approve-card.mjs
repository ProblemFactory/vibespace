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
// ACCEPTANCE ROUND 2 (主开发 — «a decision row has TWO verbs and no other closer; the stamp names only a person's decision; every
// writer of a wake watch is behind the person verdict»):
//   ⑦ A DECISION ROW HAS TWO VERBS — the store (src/user-todos.js over THE registry's decide: 'person' rows): ✓ Mark done /
//     ✕ Dismiss refused by name (decision_row), «Mark all seen» passes it by (`decisions`), a reply never decides, its end
//     (expired) and its decision (allowed / denied) close it; a decided one is FINAL (reopen / re-stamp ⇒ decision_final) and a
//     re-file beside it is a new item (its stamp permanent); an item of any other row closes and reopens as before. RED CONTROL:
//     the store as the base shipped it — ✓ closed the wake item «done» (the silent Deny), «Mark all seen» closed it, ↺ reopened
//     a decided record and its stamp was gone
//   ⑧ …AND EVERY DOOR DRAWS THEM — the tray row (user-todos-row.js: the tray, the mini inbox, the chat's card) and the For-you
//     window (inbox-window-layout itemView): an open decision row's verbs are Approve / Deny and no ✓ / ✕; a decided one has
//     no ↺; the window's second verb is «Deny»; a non-decision row keeps its closers (the control)
//   ⑨ EVERY WRITER OF A WAKE WATCH ASKS THE PERSON VERDICT — the watchers / assignment / rule doors of src/routes/channels.js
//     over a stub engine: a wake row from a vsst_ ⇒ 403 human_only, from a bare write ⇒ 403 cross_site (the engine never
//     asked); a next-turn row (an agent's non-wake write), a removal ⇒ as before; this page ⇒ written. THE WRITER CENSUS: every
//     route calling a watch writer asks it first; every setGrain call inside the engine is named (the agent's own road writes
//     next-turn only — a wake is its ASK); no other file calls a writer. RED COPIES: the route file without its gate (a vsst_
//     wake write ⇒ 200, the census names every door), a planted engine writer
// Run: node scripts/test-wake-approve-card.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import Module, { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** a module from `source` compiled AT `rel`'s own path (the real file, or a RED copy) — its requires resolve, nothing is written */
function moduleFrom(rel, source) {
  const real = path.join(REPO, rel);
  const m = new Module(real + '#red', null);
  m.filename = real; m.paths = Module._nodeModulePaths(path.dirname(real));
  m._compile(source, real);
  return m.exports;
}
const registryFrom = (source) => moduleFrom('src/foryou-actions.js', source);

// ── ① ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① THE CARD MODEL — item → its state, its buttons, its stamp');
{
  const filed = FA.decisionCard(wr(), { now: NOW });
  ok(filed.state === 'filed' && JSON.stringify(filed.buttons) === '["approve","deny"]' && filed.stamp === null && filed.waiting === null, 'filed: open, the owner looking ⇒ Approve + Deny, no stamp', filed);
  const P = (ts) => ({ resolvedFact: { decidedBy: 'person', decidedAt: ts } });   // the decide route's mark (round 2)
  const appr = FA.decisionCard(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 41), ...P(at(2026, 10, 27, 9, 41)) }), { now: NOW });
  ok(appr.state === 'approved' && !appr.buttons.length && appr.stamp === 'approved by you · 09:41', 'approved from either door ⇒ «approved by you · 09:41», no button', appr);
  const den = FA.decisionCard(wr({ status: 'done', resolvedBy: 'denied', resolvedAt: at(2026, 10, 27, 9, 52), ...P(at(2026, 10, 27, 9, 52)) }), { now: NOW });
  ok(den.state === 'denied' && !den.buttons.length && den.stamp === 'denied by you · 09:52', 'denied ⇒ «denied by you · 09:52», no button', den);
  const old = FA.decidedStamp(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 26, 23, 7), ...P(at(2026, 10, 26, 23, 7)) }), { now: NOW });
  ok(!!old && old.text === 'approved by you · 10/26 23:07' && old.time === '10/26 23:07' && old.verb === 'approved by you', 'a decision of another day names its day: «approved by you · 10/26 23:07»', old);
  const exp = FA.decisionCard(wr({ status: 'done', resolvedBy: 'expired', resolvedAt: at(2026, 10, 27, 10, 0) }), { now: NOW });
  ok(exp.state === 'expired' && !exp.buttons.length && exp.stamp === 'expired · the agent can ask again', 'expired ⇒ its final state «expired · the agent can ask again», no button (never «by you», never «ask-over»)', exp);
  const expOther = { id: 'ut-n', sessionKey: 'claude:c1', text: 'budget notice', status: 'done', resolvedBy: 'expired', action: null, kind: 'notice' };
  ok(FA.settledWords(expOther) === 'expired', 'an item of any other row that expired keeps its plain «expired»', FA.settledWords(expOther));
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
  ok(FA.decidedStamp(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 41), ...P(at(2026, 10, 27, 9, 41)) }), { t: zh, now: NOW }).text === '你已批准 · 09:41', 'the page\'s words: «你已批准 · 09:41» (zh)');
  // ROUND 2 (minor): «by you» is a fact the RECORD carries — the person verdict's mark, at the time it records
  const late = FA.decidedStamp(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 43), ...P(at(2026, 10, 27, 9, 41)) }), { now: NOW });
  ok(!!late && late.text === 'approved by you · 09:41', 'the stamp\'s time is the one the mark records (decidedAt 09:41), whatever the store\'s resolve time', late);
  const unmarked = wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 41) });
  const um = FA.decisionCard(unmarked, { now: NOW });
  ok(FA.decidedStamp(unmarked, { now: NOW }) === null && um.state === 'approved' && um.stamp === 'approved' && !/by you/.test(um.stamp), 'a record WITHOUT the mark (decidedBy null — decided before the verdict stood, by a bearer or a curl on the base route) keeps its old words «approved · 2 min ago»: no «by you»', um);
  ok(FA.decidedStamp(wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: at(2026, 10, 27, 9, 41), resolvedFact: { decidedBy: 'user', decidedAt: at(2026, 10, 27, 9, 41) } }), { now: NOW }) === null, '…nor one marked by anyone but the person verdict');
  const RED_FA = registryFrom(read('src/foryou-actions.js').replace("  if (!fact || fact.decidedBy !== 'person') return null;\n", '').replace('Number(fact.decidedAt) || ', ''));   // the base: no mark asked, the store's time
  const redSt = RED_FA.decidedStamp(unmarked, { now: NOW });
  ok(read('src/foryou-actions.js').includes("  if (!fact || fact.decidedBy !== 'person') return null;\n") && !!redSt && /by you/.test(redSt.text), `RED CONTROL: the base's stamp (no mark asked) — a record decidedBy null says «${redSt && redSt.text}»`, redSt);
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
  ok(JSON.stringify(FA.DECISION_ROWS) === JSON.stringify(['channel-watch-request']), 'round 2: DECISION_ROWS (two verbs, no other closer) = the person rows that DRAW their verbs — the wake request; open-channel\'s item is a door to the Reach dialog and the Outbox\'s pointer shares its type (its producer retracts it)', FA.DECISION_ROWS);
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
  const RED = { ...FA, ROWS: FA.ROWS.map((r) => (r.type === 'channel-watch-request' ? { ...r, identity: null } : r)), isDecisionRow: () => false };   // + the store as the base shipped it (no decision row)
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
  const writes = [];
  const wrote = (what) => async (...a) => { writes.push({ what, a }); return { ok: true }; };
  mod.setup({ getEngine: () => ({ decideRequest: async (id, approve, by, opts) => { calls.push({ id, approve, by, person: !!(opts && opts.person) }); return { ok: true, request: { id, status: approve ? 'approved' : 'denied' } }; },
    setWatchers: wrote('setWatchers'), setGrain: wrote('setGrain'), setAssignment: wrote('setAssignment'), setScopeAssignment: wrote('setScopeAssignment') }) });
  const app = express(); app.use(express.json()); app.use(mod.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const own = `http://127.0.0.1:${srv.address().port}`;
  const post = async (verdict, headers = {}, body = {}) => { const r = await fetch(`${own}/api/channels/reach-requests/wr-mh2k1-a1b2c3/${verdict}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, code: j && j.code, error: j && j.error }; };
  const send = async (method, p, headers = {}, body = {}) => { const r = await fetch(own + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, code: j && j.code, error: j && j.error }; };
  return { own, calls, writes, post, send, close: () => new Promise((r) => srv.close(r)) };
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
    ok(S.calls.length === 2 && S.calls.every((c) => c.person === true), 'round 2: the route hands the engine the person verdict\'s mark ({person: true}) — the record says decidedBy \'person\' + the time, the only record «by you» may name', S.calls);
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

// ── ⑦ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑦ A DECISION ROW HAS TWO VERBS — the store: no generic closer, «Mark all seen» passes it by, a decision is final');
const tryIt = (fn) => { try { const v = fn(); return v && v.id ? v.status + ':' + v.resolvedBy : 'ok'; } catch (e) { return e.code || ('threw: ' + e.message); } };
function lawScene(registry) {
  const { m, done } = storeWith(registry);
  try {
    const a = fileWake(m, 'wr-l1');
    const other = m.add('claude:c-ops', { text: 'Which branch should I deploy?', by: 'agent', origin: 'agent' });   // any other row: its closers stay
    const r = {};
    r.markDone = tryIt(() => m.setStatus(a.id, 'done', 'user'));                   // ✓ Mark done (the card's, the tray's)
    r.afterMark = m.get(a.id).status + ':' + m.get(a.id).resolvedBy;
    r.dismiss = tryIt(() => m.setStatus(a.id, 'dismissed', 'user'));               // ✕ Dismiss
    const many = m.setStatusMany([a.id, other.id], 'dismissed', 'user');              // «Mark all seen» on their band
    r.seenAll = { changed: many.changed, decisions: many.decisions || null };
    m.resolveByReply(a.id, 'approve');                                                 // a typed «approve»
    r.afterReply = m.get(a.id).status;
    r.answered = m.resolveAnswered([a.id], 'denied', { decidedBy: 'person', decidedAt: 1 }).length;   // THE decide route's close
    const dec = { status: m.get(a.id).status, by: m.get(a.id).resolvedBy, fact: m.get(a.id).resolvedFact || null };
    r.reopen = tryIt(() => m.setStatus(a.id, 'open', 'user'));                       // ↺ / the 6 s Undo
    r.restamp = tryIt(() => m.setStatus(a.id, 'dismissed', 'user'));
    r.kept = { status: m.get(a.id).status, by: m.get(a.id).resolvedBy, fact: !!m.get(a.id).resolvedFact };
    r.dec = dec;
    // its producer files the SAME request again after the decision (the same id, the same words)
    const o2 = fileWake(m, 'wr-l1');
    r.refile = { fresh: o2.id !== a.id, first: m.get(a.id).status + ':' + m.get(a.id).resolvedBy, second: m.get(o2.id).status };
    // the Outbox's pointer (open-channel — a door, no decision row): its producer retracts it as it always did
    const ptr = m.add('channels', { text: 'Proposals awaiting approval in Team', by: 'agent', origin: 'channels', action: { type: 'open-channel', adapterId: 'fake-poll', convId: 'oc_teamA', key: 'fake-poll/oc_teamA' } });
    r.pointer = tryIt(() => m.setStatus(ptr.id, 'done', 'system'));
    // its END: an item that expires (the store's sweep)
    const e = fileWake(m, 'wr-l2', 'Ops room 2');
    m.get(e.id).expiresAt = Date.now() - 1; r.expired = m.expireDue(Date.now() + 1) + ':' + m.get(e.id).resolvedBy;
    // the control: any other row closes and reopens as it always did
    r.other = [m.get(other.id).status, tryIt(() => m.setStatus(other.id, 'open', 'user')), tryIt(() => m.setStatus(other.id, 'done', 'user'))];
    return r;
  } finally { done(); }
}
{
  const hasLaw = typeof FA.isDecisionRow === 'function' && typeof FA.offersClosers === 'function' && Array.isArray(FA.DECISION_ENDS);
  ok(hasLaw && FA.isDecisionRow(wr()) && !FA.offersClosers(wr()) && JSON.stringify(FA.DECISION_ENDS) === '["allowed","denied","expired"]', 'THE registry names a decision row (decide: \'person\') and its only ends — allowed / denied (its two verbs), expired (its end)', hasLaw && FA.DECISION_ENDS);
  const g = lawScene(FA);
  ok(g.markDone === 'decision_row' && g.dismiss === 'decision_row' && g.afterMark === 'open:null', `✓ Mark done / ✕ Dismiss on a wake request's item are refused BY NAME (${g.markDone} / ${g.dismiss}) — it stays open (was: a silent Deny whose record read «✓ done»)`, g);
  ok(Array.isArray(g.seenAll.decisions) && g.seenAll.decisions.length === 1 && g.seenAll.changed.length === 1 && !g.seenAll.changed.includes(g.seenAll.decisions[0]), `«Mark all seen» passes the decision row by (listed in \`decisions\` — the page says «1 decision left for you») and marks the rest (${g.seenAll.changed.length})`, g.seenAll);
  ok(g.afterReply === 'open', 'a typed reply («approve») never answers a decision — the item stays open', g.afterReply);
  ok(g.answered === 1 && g.dec.status === 'done' && g.dec.by === 'denied' && !!g.dec.fact && g.dec.fact.decidedBy === 'person', 'its decision closes it: «denied», with the person verdict\'s mark', g.dec);
  ok(g.reopen === 'decision_final' && g.restamp === 'decision_final' && g.kept.status === 'done' && g.kept.by === 'denied' && g.kept.fact, `a decision is FINAL: reopening it (the old ↺ / the 6 s Undo) and re-stamping it are refused by name (${g.reopen} / ${g.restamp}); the record keeps «denied by you»`, g.kept);
  ok(g.refile.fresh && g.refile.first === 'done:denied' && g.refile.second === 'open', 'the same request filed again after its decision is a NEW item beside it — the decided record keeps its stamp (never reopened under the new filing)', g.refile);
  ok(g.pointer === 'done:system', 'CONTROL: the Outbox\'s pointer item (open-channel — a door, no decision row) is retracted by its producer as before', g.pointer);
  ok(g.expired === '1:expired', 'its END closes it — the expiry sweep (\'expired\': the agent can ask again)', g.expired);
  ok(g.other[0] === 'dismissed' && g.other[1] === 'open:null' && g.other[2] === 'done:user', 'CONTROL: an item of any other row is closed by «Mark all seen», reopened by ↺ and closed by ✓ as before', g.other);
  // RED CONTROL: the store as the base shipped it (no decision row)
  const r = lawScene({ ...FA, isDecisionRow: () => false });
  ok(r.markDone === 'done:user' && (!r.seenAll.decisions || !r.seenAll.decisions.length) && r.reopen === 'open:null', `RED CONTROL: the base's store — ✓ Mark done closed the wake item «${r.markDone}» (the silent Deny), «Mark all seen» took it with the rest, ↺ reopened a decided record (${r.reopen}: its «denied by you» gone)`, r);
}

// ── ⑧ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑧ …AND EVERY DOOR DRAWS THEM — the tray row (the tray, the mini inbox, the chat\'s card) and the For-you window');
{
  const noop = () => {};
  const mkEl = () => ({ dataset: {}, className: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], appendChild: noop, addEventListener: noop, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: {} });
  globalThis.window = globalThis.window || globalThis; globalThis.addEventListener = globalThis.addEventListener || noop; globalThis.removeEventListener = globalThis.removeEventListener || noop;
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: noop, removeItem: noop };
  globalThis.document = globalThis.document || { createElement: mkEl, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, lang: 'en' }, body: mkEl(), head: mkEl() };
  const R = await import(pathToFileURL(path.join(SRC, 'lib', 'user-todos-row.js')).href);
  const L = await import(pathToFileURL(path.join(SRC, 'lib', 'inbox-window-layout.js')).href);
  const tt = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));
  const rctx = { t: tt, nameFor: () => 'Channels', wordsOf: (i) => i.text, detailOf: (i) => i.detail || '', replyState: () => ({ show: false }), optionsOf: () => [] };
  const verbsOf = (html) => ({ answer: [...html.matchAll(/data-answer="(\w+)"[^>]*>(?:<span class="ut-decide-ico"[^>]*>.*?<\/span>)?([^<]*)</g)].map((m) => m[2]), closers: [...html.matchAll(/class="ut-act (ut-done|ut-dismiss|ut-reopen)"/g)].map((m) => m[1]) });
  const open = R.renderRow({ item: wr({ detail: 'Approve writes: wake ops-agent now (a billed turn)' }), resolved: false, band: 5 }, rctx).innerHTML;
  const vo = verbsOf(open);
  ok(JSON.stringify(vo.answer) === '["Approve","Deny"]' && vo.closers.length === 0, `the tray row (and the chat's card — one renderer) of an open wake request: its verbs are ${JSON.stringify(vo.answer)} and NO ✓ / ✕ (${JSON.stringify(vo.closers)})`, vo);
  const decided = wr({ status: 'done', resolvedBy: 'allowed', resolvedAt: NOW - 60e3, resolvedFact: { decidedBy: 'person', decidedAt: NOW - 60e3 } });
  const dh = R.renderRow({ item: decided, resolved: true, tail: true }, rctx).innerHTML;
  ok(verbsOf(dh).closers.length === 0 && /approved by you · /.test(dh), 'its decided record: «approved by you · HH:MM» and NO ↺ (a decision is final)', verbsOf(dh));
  const plain = { id: 'ut-p', sessionKey: 'claude:c-ops', text: 'Which branch should I deploy?', status: 'open', urgency: 'normal', origin: 'agent', createdAt: NOW - 60e3 };
  const ph = R.renderRow({ item: plain, resolved: false, band: 5 }, rctx).innerHTML;
  const pr = R.renderRow({ item: { ...plain, status: 'done', resolvedBy: 'user', resolvedAt: NOW }, resolved: true, tail: true }, rctx).innerHTML;
  ok(JSON.stringify(verbsOf(ph).closers) === '["ut-done","ut-dismiss"]' && JSON.stringify(verbsOf(pr).closers) === '["ut-reopen"]', 'CONTROL: any other row keeps ✓ / ✕ while open and ↺ once resolved', { open: verbsOf(ph).closers, resolved: verbsOf(pr).closers });
  const ictx = (item) => ({ t: tt, words: item.text, detail: item.detail || '', name: 'Channels', origin: { origin: 'channels', label: 'Channels' }, notice: false, reply: { show: false }, ago: () => '', expires: () => '', resolvedBy: () => '', closers: FA.offersClosers ? FA.offersClosers(item) : undefined });
  const w1 = L.itemView(wr(), ictx(wr())).actions, w2 = L.itemView(decided, ictx(decided)).actions, w3 = L.itemView(plain, ictx(plain)).actions;
  ok(JSON.stringify(w1) === '["proposal-approve","proposal-reject","copy"]' && JSON.stringify(w2) === '["copy"]', `the For-you window: an open wake request's verbs ${JSON.stringify(w1)} (no Mark done / Dismiss), its decided record ${JSON.stringify(w2)} (no Reopen)`, { w1, w2 });
  ok(JSON.stringify(w3) === '["done","dismiss","copy"]', 'CONTROL: any other item\'s verbs in the window are as before', w3);
  const IW = read('src/lib/inbox-window.js');
  ok(/'proposal-reject': \(it\) => \(isDecisionRow\(it\) \? actBtn\('proposal-reject', UI_ICONS\.close, t\('Deny'\)/.test(IW) && /closers: offersClosers\(it\)/.test(IW), 'the window asks THE registry: its second verb says «Deny» on a decision row (Approve / Deny on every door), and its verbs are offersClosers\'');
  // RED CONTROL: the base's verbs (no closers flag asked) — Mark done / Dismiss beside Approve / Reject, Reopen on the decided record
  const b1 = L.itemView(wr(), { ...ictx(wr()), closers: undefined }).actions, b2 = L.itemView(decided, { ...ictx(decided), closers: undefined }).actions;
  ok(b1.includes('done') && b1.includes('dismiss') && b2.includes('reopen'), `RED CONTROL: the base's window — ${JSON.stringify(b1)} on the open request, ${JSON.stringify(b2)} on the decided one`, { b1, b2 });
}

// ── ⑨ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑨ EVERY WRITER OF A WAKE WATCH ASKS THE PERSON VERDICT — the watchers / assignment / rule doors');
const WAKE = { principal: { kind: 'agent', id: 'c-ops' }, notify: 'wake', delivery: 'wake', mode: 'all', dailyWakeCap: 5 };
const LEGACY = { principal: { kind: 'agent', id: 'c-ops' }, notify: 'wake', mode: 'all' };   // no delivery = a wake
const DIGEST = { principal: { kind: 'agent', id: 'c-ops' }, notify: 'digest', delivery: 'wake', digestMinutes: 30, mode: 'all' };
const NEXT = { principal: { kind: 'agent', id: 'c-ops' }, notify: 'wake', delivery: 'next-turn', mode: 'all', origin: 'agent' };
const ASSIGN = { principal: { kind: 'agent', id: 'c-ops' }, authority: 'draft' };
const DOORS_W = [
  ['PUT', '/api/channels/fake-poll/fake-poll-ops/watchers', (rows) => ({ watchers: rows })],
  ['PUT', '/api/channels/adapters/fake-poll/watchers', (rows) => ({ watchers: rows })],
  ['PUT', '/api/channels/adapters/fake-poll/patterns/p1/watchers', (rows) => ({ watchers: rows })],
  ['POST', '/api/channels/adapters/fake-poll/patterns', (rows) => ({ pattern: { match: 'any', rules: [{ kind: 'title', value: 'Ops' }] }, access: [], watchers: rows })],
  ['PUT', '/api/channels/adapters/fake-poll/patterns/p1', (rows) => ({ watchers: rows })],
];
const DOORS_A = [
  ['PUT', '/api/channels/fake-poll/fake-poll-ops/assignment'],
  ['PUT', '/api/channels/adapters/fake-poll/assignment'],
  ['POST', '/api/channels/adapters/fake-poll/patterns'],
  ['PUT', '/api/channels/adapters/fake-poll/patterns/p1'],
];
async function wakeDoors(mod) {
  const S = await serve(mod);
  try {
    const out = { vsst: [], bare: [], digest: [], legacy: [], next: [], removal: [], page: [], assignVsst: [], assignBare: [], assignPage: [], writesAfterRefusals: 0 };
    for (const [m, p, body] of DOORS_W) {
      out.vsst.push((await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, body([WAKE]))));
      out.bare.push((await S.send(m, p, {}, body([WAKE]))));
      out.digest.push((await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, body([DIGEST]))));
      out.legacy.push((await S.send(m, p, { Authorization: 'Bearer jbt_0123456789abcdef' }, body([LEGACY]))));
    }
    for (const [m, p] of DOORS_A) {
      out.assignVsst.push((await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, { assignment: ASSIGN })));
      out.assignBare.push((await S.send(m, p, {}, { assignment: ASSIGN })));
    }
    out.writesAfterRefusals = S.writes.length;
    for (const [m, p, body] of DOORS_W) {
      out.next.push((await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, body([NEXT]))));
      out.removal.push((await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, body([]))));
      out.page.push((await S.send(m, p, { 'Sec-Fetch-Site': 'same-origin' }, body([WAKE]))));
    }
    for (const [m, p] of DOORS_A) out.assignPage.push((await S.send(m, p, { 'Sec-Fetch-Site': 'same-origin' }, { assignment: ASSIGN })));
    out.writes = S.writes.length;
    return out;
  } finally { await S.close(); }
}
const GATE_LINE = /^    if \(wakeRefused\(req, res, [^\n]*\)\) return;\n/gm;
{
  const g = await wakeDoors(routerFrom(REAL_SRC));
  const all = (xs, st, code) => xs.length > 0 && xs.every((r) => r.status === st && (code === undefined || r.code === code));
  ok(all(g.vsst, 403, 'human_only') && g.vsst.every((r) => /a wake \(a billed turn\) is the owner's to set/.test(r.error || '')), `a WAKE row from an agent's vsst_ on every watchers door (${DOORS_W.length}: a conversation, the account, a rule's list, a new rule, a rule rewritten) ⇒ 403 human_only, said by name`, g.vsst);
  ok(all(g.bare, 403, 'cross_site'), 'a bare write (curl on an instance whose sign-in is off) ⇒ 403 cross_site', g.bare);
  ok(all(g.digest, 403, 'human_only') && all(g.legacy, 403, 'human_only'), 'a DIGEST (a paced wake) and a row that never said its delivery (it reads wake) ⇒ refused the same way', { digest: g.digest, legacy: g.legacy });
  ok(all(g.assignVsst, 403, 'human_only') && all(g.assignBare, 403, 'cross_site'), `a pre-split ASSIGNMENT (its watcher row IS a wake) on its ${DOORS_A.length} doors ⇒ refused the same way`, { v: g.assignVsst, b: g.assignBare });
  ok(g.writesAfterRefusals === 0, `…and the engine never asked to write (${g.writesAfterRefusals} writes)`);
  ok(all(g.next, 200) && all(g.removal, 200), 'an agent\'s NON-wake write (a next-turn row) and a removal ([]) are as they were — written', { next: g.next, removal: g.removal });
  ok(all(g.page, 200) && all(g.assignPage, 200) && g.writes === DOORS_W.length * 3 + DOORS_A.length, `this instance's own page ⇒ written (the owner's Notify…) — ${g.writes} writes`, { page: g.page, assignPage: g.assignPage, writes: g.writes });
  // RED CONTROL: the route file as the base shipped it (no gate)
  const cuts = (REAL_SRC.match(GATE_LINE) || []).length;
  const r = await wakeDoors(routerFrom(REAL_SRC.replace(GATE_LINE, '')));
  ok(cuts === 7 && all(r.vsst, 200) && all(r.bare, 200) && all(r.assignVsst, 200), `RED CONTROL: the base's doors (the ${cuts} gates cut) — an agent's vsst_ and a bare curl WRITE a wake on every door (${r.vsst.map((x) => x.status).join(', ')})`, { vsst: r.vsst.map((x) => x.status), bare: r.bare.map((x) => x.status) });
}
/** THE WRITER CENSUS — every route calling a watch writer asks the gate before it; every setGrain call inside the engine is named
 *  with its road; no other file calls a writer. → problems (empty = green) */
const WRITERS = /engine\(\)\.(setWatchers|setAssignment|setScopeAssignment|setGrain)\(/;
const ENGINE_SETGRAIN = {   // the enclosing function → why it may write without the gate (it is never a route)
  agentWatch: 'the agent\'s own road: next-turn only — a wake returns fileWatchRequest (its ASK) before this write',
  agentUnwatch: 'a removal (the agent\'s own row filtered out) — never a wake',
  decideWatchRequest: 'THE decision: behind the decide route\'s person verdict',
  setAccess: 'access only (no watchers)', setWatchers: 'a route\'s writer (the gate is the route\'s)', setAssignment: 'a route\'s writer (the gate is the route\'s)', setScopeAssignment: 'a route\'s writer (the gate is the route\'s)',
};
function writerProblems(files) {
  const out = [];
  const R = files['src/routes/channels.js'] || '';
  const heads = [...R.matchAll(/^router\.(get|put|post|patch|delete)\('([^']+)'/gm)];
  heads.forEach((h, k) => {
    const body = R.slice(h.index, k + 1 < heads.length ? heads[k + 1].index : R.length);
    const w = body.match(WRITERS);
    if (!w) return;
    const call = body.slice(w.index, body.indexOf('\n', w.index));
    if (w[1] === 'setGrain' && !/watchers/.test(call)) return;   // an access-only grain write
    const g = body.indexOf('if (wakeRefused(req, res, ');
    if (g < 0 || g > w.index) out.push(`${h[1].toUpperCase()} ${h[2]}: calls ${w[1]} without asking the person verdict for a wake row first`);
  });
  const E = files['src/server/channels-access.js'] || '';
  for (const m of E.matchAll(/(?<![\w.]|function )setGrain\(/g)) {   // every CALL (its own definition is not one)
    const before = E.slice(0, m.index);
    const fn = [...before.matchAll(/(?:async )?function (\w+)\(/g)].pop();
    const name = fn ? fn[1] : '?';
    if (!ENGINE_SETGRAIN[name]) out.push(`src/server/channels-access.js ${name}(): writes a grain (setGrain) — a writer the census does not know`);
  }
  const aw = E.slice(E.indexOf('async function agentWatch('));
  const wakeAsk = aw.indexOf("if (d === 'wake') return withRoad(await fileWatchRequest("), direct = aw.indexOf('setGrain(');
  if (!(wakeAsk >= 0 && direct > wakeAsk)) out.push('agentWatch: its direct write is not behind the wake ask (a wake must return fileWatchRequest first)');
  for (const [rel, s] of Object.entries(files)) {
    if (rel === 'src/routes/channels.js' || rel === 'src/server/channels-access.js') continue;
    if (/\.(setWatchers|setAssignment|setScopeAssignment)\(/.test(s) || /\.setGrain\([^)]*watchers/.test(s)) out.push(`${rel}: calls a watch writer — the only doors are src/routes/channels.js's (each behind the person verdict)`);
  }
  return out;
}
{
  const p = writerProblems(SRC_FILES);
  ok(!p.length, 'THE WRITER CENSUS: every route of src/routes/channels.js calling a watch writer asks the person verdict first; every setGrain inside the engine is named with its road; no other file writes a watch', p);
  const red = writerProblems({ ...SRC_FILES, 'src/routes/channels.js': REAL_SRC.replace(GATE_LINE, '') });
  ok(red.length === 7 && red.every((x) => /without asking the person verdict/.test(x)), `RED COPY: the base's routes — the census names each door by name (${red.length}): ${red.map((x) => x.split(':')[0]).join(' · ')}`, red);
  const planted = writerProblems({ ...SRC_FILES, 'src/server/channels-access.js': SRC_FILES['src/server/channels-access.js'].replace('  /** Approve = EXACTLY the frozen row', '  async function wakeEveryone(a, g, rows) { return setGrain(a, g, { watchers: rows }); }\n  /** Approve = EXACTLY the frozen row') });
  ok(planted.some((x) => /wakeEveryone\(\): writes a grain/.test(x)), 'RED COPY: a writer planted in the engine is named', planted);
  const other = writerProblems({ ...SRC_FILES, 'src/server/automation-engine.js': SRC_FILES['src/server/automation-engine.js'] + '\nasync function x(eng) { return eng.setWatchers("a", { kind: "account" }, []); }\n' });
  ok(other.some((x) => /automation-engine\.js: calls a watch writer/.test(x)), 'RED COPY: a second file calling a writer is named', other);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
