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
//   ⑨ EVERY WRITE THAT CHANGES WHAT A WAKE FIRES ON ASKS THE PERSON VERDICT (r2 + r4) — every route writing a grain asks the engine
//      whether the grain its PATH names HOLDS a wake (wakeHeldAt) and, held or a wake in the body, THE person verdict; the
//      WRITER CENSUS derives the engine's grain writers and fails a route that calls one without the gate first; RED: round 3's
//      gate (keyed on a `watchers` body) lets a vsst_ and a bare curl widen a held wake through all 10 doors of a held rule /
//      conversation (the rule's pattern, its watchExcept, the conversation's filter, …)
//     over a stub engine: a wake row from a vsst_ ⇒ 403 human_only, from a bare write ⇒ 403 cross_site (the engine never
//     asked); a next-turn row (an agent's non-wake write), a removal ⇒ as before; this page ⇒ written. THE WRITER CENSUS: every
//     route calling a watch writer asks it first; every setGrain call inside the engine is named (the agent's own road writes
//     next-turn only — a wake is its ASK); no other file calls a writer. RED COPIES: the route file without its gate (a vsst_
//     wake write ⇒ 200, the census names every door), a planted engine writer
// ACCEPTANCE ROUND 3 (主开发 — «a pointer item hides, never decides; a wake ask has a lifetime»; the owner's two vault asks and
// the hub-act ask «不在聊天里»):
//   ⑩ A POINTER HIDES — THE registry's `closer: 'hide'` rows (open-channel: the access request's item, the Outbox's pointer):
//     closersOf = ✕ Hide only (nothing once hidden); the store writes the person's close (✓ a stale page draws, «Mark all
//     seen») as a HIDE («hidden — nothing was decided», never «✓ done»), its producer's retraction stays its own, a decision
//     lands on a hidden pointer («approved by you»); the row draws ✕ «Hide» and no ↺, the window «hide»; the press toasts
//     with no Undo. RED CONTROL: a registry without the row's closer — ✓ records «done» by the user
//   ⑪ A WAKE ASK HAS A LIFETIME — the card's and the tray row's «expires in 7 d» (expiryWords; «… h» / «… min» near its end;
//     nothing for a closed ask or another row), the window's «expires in N d». RED CONTROL: the row without `showsExpiry`
//   ⑬ ROUND 4 — an Approve / Deny on an ask past its end ⇒ 409 `expired` (words + its date, zh / ja / en; RED: answer3 without
//     the mapping ⇒ 500); vault-grant-ask (Allow once / For 8 hours / Deny) is a DECISION ROW: its own ends, no ✓ / ✕, the
//     stamps «allowed once by you» / «allowed by you for 8 h» / «denied by you» (RED: the row as bec3e3f8 had it — ✓ closes it)
//   ⑭ ROUND 5 — «held» is read by THE reader that fires: F.grainAsFired reads a rule with the account's access (the reviewer's
//     fixture: a live rule wake; RED: round 4's F.grainOf(pa) drops it) and keeps every stored row (active or inert); the
//     ONE-READER CENSUS over the engine (held / write / view roads through readGrainHolder; RED COPIES); a record says only
//     what was decided — an old `granted` reads «allowed», `granted-8h` «allowed for 8 hours» (RED: 4b8896e7's words)
//   ⑨ (r5) the census's FILE LIST is derived from the engine (its grain writers + the entry fields it reads for wakes):
//     src/routes/webhook.js's path verbs ask the gate for the PATH (RED: the verbs as 4b8896e7 had them; a new routes file)
//   ⑫ THE VAULT'S TWO ASKS AND THE HUB-ACT ASK ARE CARDS IN THE ASKING CHAT, decided by a person — registry rows (chat, decide
//     'person', their own ends and stamps): the chat draws each where its producer files it (the run ask and the paste
//     request under the asking conversation's key, the hub-act ask `about` it); «allowed by you · HH:MM» / «always allowed by
//     you» / «stored · HH:MM» / «refused by you», only with the person verdict's mark; the store law per row's ends (a ✓ is
//     refused by name, the held ask's 60 s closes it, a decision is final); the row draws their own verbs and no ✓ / ✕; the
//     paste box says «wrong name or kind — refuse, the agent asks again». ⑤'s census holds their doors (THE person verdict
//     before the answer, the mark handed in). RED CONTROL: the rows as the base had them — the hub-act card filed as the base
//     filed it is drawn in no chat, ✓ closes a run ask «done», no stamp
// Run: node scripts/test-wake-approve-card.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import Module, { createRequire } from 'node:module';
import * as ACORN from 'acorn';   // r6: the writer census reads the route files over their AST
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
  ok(JSON.stringify([...FA.PERSON_DECIDES].sort()) === JSON.stringify(['channel-held-digest', 'channel-watch-request', 'hub-act-ask', 'open-channel', 'secret-request', 'vault-grant-ask', 'vault-run-ask']), 'PERSON_DECIDES = the reach-requests route\'s rows (+ r6: a held digest\'s Deliver / Discard) + (r3) the vault\'s run ask and paste request and the hub-act ask + (r4) the vault\'s grant request — each behind a person\'s door (⑤)', FA.PERSON_DECIDES);
  ok(JSON.stringify([...FA.DECISION_ROWS].sort()) === JSON.stringify(['channel-held-digest', 'channel-watch-request', 'hub-act-ask', 'secret-request', 'vault-grant-ask', 'vault-run-ask']), 'DECISION_ROWS (their own verbs, no other closer) = the person rows that DRAW their verbs — the wake request (r2), the vault\'s run ask and paste request and the hub-act ask (r3), the vault\'s grant request (r4: Allow once / For 8 hours / Deny), a held digest (r6: Deliver / Discard); open-channel is a POINTER (⑩: it hides)', FA.DECISION_ROWS);
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
const REACH = { server: ['src/routes/channels.js', "router.post('/api/channels/reach-requests/:id/:verdict'"], verdict: 'personVerdict(req)', engine: /engine\(\)\.decideRequest\(/, mark: '{ person: true }' };
const DOORS = {
  'channel-watch-request': { client: ['src/lib/user-todos-actions.js', '/api/channels/reach-requests/'], ...REACH },
  'open-channel': { client: ['src/lib/channel-reach-editor.js', 'reach-requests/'], ...REACH },
  // r6: a held digest (hits a boot found older than their window × 24) — Deliver / Discard on the same decide route
  'channel-held-digest': { client: ['src/lib/user-todos-actions.js', '/api/channels/reach-requests/'], ...REACH },
  // r3: the vault's two asks (the vault's own `person` wrapper = THE person verdict) and the hub-act ask
  'vault-run-ask': { client: ['src/lib/user-todos-actions.js', '/api/vault/run/asks/'], server: ['src/routes/vault.js', "app.post('/api/vault/run/asks/:askId'"], verdict: 'person((req)', engine: /run\.answer\(/, mark: 'person: true' },
  'secret-request': { client: ['src/lib/vault-paste-box.js', '/api/vault/secret-requests/'], server: ['src/routes/vault.js', "app.post('/api/vault/secret-requests/:id/answer'"], verdict: 'person((req)', engine: /paste\.answer\(/, mark: 'person: true' },
  'hub-act-ask': { client: ['src/lib/user-todos-actions.js', '/api/hub-acts/asks/'], server: ['src/server/exit-routes.js', "app.post('/api/hub-acts/asks/:askId'"], verdict: 'personVerdict(req)', engine: /hosts\.hubActs\.answer\(/, mark: 'person: true' },
  // r4: the vault's grant request (Allow once / For 8 hours / Deny) — the third vault card in the same chat
  'vault-grant-ask': { client: ['src/lib/user-todos-actions.js', '/api/vault/request/asks/'], server: ['src/routes/vault.js', "app.post('/api/vault/request/asks/:askId'"], verdict: 'person((req)', engine: /run\.answerRequest\(/, mark: 'person: true' },
};
/** THE person verdict each door's file asks — routes/vault.js's own, never a local copy */
const VERDICT_FROM = { 'src/routes/channels.js': /const \{ personVerdict \} = require\('\.\/vault\.js'\);/, 'src/server/exit-routes.js': /const \{ personVerdict \} = require\('\.\.\/routes\/vault\.js'\);/, 'src/routes/vault.js': /const person = \(fn\) => async \(req, res\) => \{\n    const v = personVerdict\(req\);/ };
function doorProblems(rows, files) {
  const out = [];
  for (const ty of rows) {
    const d = DOORS[ty];
    if (!d) { out.push(`'${ty}' is decided by a person only but names no door`); continue; }
    if (!String(files[d.client[0]] || '').includes(d.client[1])) out.push(`'${ty}': ${d.client[0]} no longer posts to ${d.client[1]}`);
    const s = String(files[d.server[0]] || ''), i = s.indexOf(d.server[1]);
    const line = i < 0 ? '' : s.slice(i, s.indexOf('\n', i));
    const body = i < 0 ? '' : (/\}\)\);(\s+\/\/.*)?$/.test(line) ? line : s.slice(i, s.indexOf('\n});', i)));   // a one-line door, else its block
    const v = body.indexOf(d.verdict), e = body.search(d.engine);
    if (i < 0) out.push(`'${ty}': its route ${d.server[1]} is gone`);
    else if (v < 0 || e < 0 || v > e) out.push(`'${ty}': ${d.server[0]} decides before (or without) asking THE person verdict`);
    else if (d.mark && !body.slice(e).includes(d.mark)) out.push(`'${ty}': ${d.server[0]} decides without handing in the person verdict's mark (${d.mark}) — its record could never say «by you»`);
  }
  for (const [f, re] of Object.entries(VERDICT_FROM)) if (Object.values(DOORS).some((d) => d.server[0] === f) && !re.test(String(files[f]))) out.push(`${f}: the person verdict is not routes/vault.js's (one verdict, never a local copy)`);
  return out;
}
{
  ok(doorProblems(FA.PERSON_DECIDES, SRC_FILES).length === 0, 'every `decide: \'person\'` row has a door that asks THE person verdict (routes/vault.js) BEFORE the engine decides', doorProblems(FA.PERSON_DECIDES, SRC_FILES));
  const cut = { ...SRC_FILES, 'src/routes/channels.js': SRC_FILES['src/routes/channels.js'].replace(VERDICT_LINES, '') };
  ok(doorProblems(FA.PERSON_DECIDES, cut).some((x) => /decides before \(or without\)/.test(x)), 'RED COPY: the route without its verdict is named');
  ok(doorProblems([...FA.PERSON_DECIDES, 'ghost-wake'], SRC_FILES).some((x) => /'ghost-wake' is decided by a person only but names no door/.test(x)), 'RED COPY: a person-decided row with no door is named');
  const local = { ...SRC_FILES, 'src/routes/channels.js': SRC_FILES['src/routes/channels.js'].replace("const { personVerdict } = require('./vault.js');", 'const personVerdict = () => ({ ok: true });') };
  ok(doorProblems(FA.PERSON_DECIDES, local).some((x) => /one verdict, never a local copy/.test(x)), 'RED COPY: a local verdict in place of routes/vault.js\'s is named');
  // r3: the hub-act door as the base had it (a bearer check only — a bare curl answered it) and a vault door that drops the mark
  const hubBase = { ...SRC_FILES, 'src/server/exit-routes.js': SRC_FILES['src/server/exit-routes.js'].replace("  const who = personVerdict(req);\n  if (!who.ok) return res.status(403)", "  if (isAnyBearer(req)) return res.status(403)") };
  ok(doorProblems(FA.PERSON_DECIDES, hubBase).some((x) => /'hub-act-ask': src\/server\/exit-routes\.js decides before \(or without\)/.test(x)), 'RED COPY (r3): the hub-act door as the base had it (a bearer check, no page verdict) is named', doorProblems(FA.PERSON_DECIDES, hubBase));
  const noMark = { ...SRC_FILES, 'src/routes/vault.js': SRC_FILES['src/routes/vault.js'].replace("by: 'user', person: true }); }));   // r3: «allowed by you · 09:41»", "by: 'user' }); }));") };
  ok(doorProblems(FA.PERSON_DECIDES, noMark).some((x) => /'vault-run-ask': .*without handing in the person verdict's mark/.test(x)), 'RED COPY (r3): the run ask\'s door without the mark is named (its record could never say «by you»)', doorProblems(FA.PERSON_DECIDES, noMark));
  const grantNoMark = { ...SRC_FILES, 'src/routes/vault.js': SRC_FILES['src/routes/vault.js'].replace("by: 'user', person: true }); }));   // r4: `person`", "by: 'user' }); }));   // r4: `person`") };
  ok(grantNoMark['src/routes/vault.js'] !== SRC_FILES['src/routes/vault.js'] && doorProblems(FA.PERSON_DECIDES, grantNoMark).some((x) => /'vault-grant-ask': .*without handing in the person verdict's mark/.test(x)), 'RED COPY (r4): the grant request\'s door as bec3e3f8 had it (no mark) is named', doorProblems(FA.PERSON_DECIDES, grantNoMark));
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
  ok(/'proposal-reject': \(it\) => \(isDecisionRow\(it\) \? actBtn\('proposal-reject', UI_ICONS\.close, t\('Deny'\)/.test(IW) && /closers: closersOf\(it, /.test(IW), 'the window asks THE registry: its second verb says «Deny» on a decision row (Approve / Deny on every door), and its closers are closersOf\'s (r3)');
  // RED CONTROL: the base's verbs (no closers flag asked) — Mark done / Dismiss beside Approve / Reject, Reopen on the decided record
  const b1 = L.itemView(wr(), { ...ictx(wr()), closers: undefined }).actions, b2 = L.itemView(decided, { ...ictx(decided), closers: undefined }).actions;
  ok(b1.includes('done') && b1.includes('dismiss') && b2.includes('reopen'), `RED CONTROL: the base's window — ${JSON.stringify(b1)} on the open request, ${JSON.stringify(b2)} on the decided one`, { b1, b2 });
}

// ── ⑨ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑨ EVERY WRITE THAT CHANGES WHAT A WAKE FIRES ON ASKS THE PERSON VERDICT (r2 + r4) — every grain-writing door');
const WAKE = { principal: { kind: 'agent', id: 'c-ops' }, notify: 'wake', delivery: 'wake', mode: 'all', dailyWakeCap: 5 };
const LEGACY = { principal: { kind: 'agent', id: 'c-ops' }, notify: 'wake', mode: 'all' };   // no delivery = a wake
const DIGEST = { principal: { kind: 'agent', id: 'c-ops' }, notify: 'digest', delivery: 'wake', digestMinutes: 30, mode: 'all' };
const NEXT = { principal: { kind: 'agent', id: 'c-ops' }, notify: 'wake', delivery: 'next-turn', mode: 'all', origin: 'agent' };
const ASSIGN = { principal: { kind: 'agent', id: 'c-ops' }, authority: 'draft' };
const ACC = [{ principal: { kind: 'agent', id: 'c-ops' }, authority: 'draft' }];
const MATCH_ALL = { match: 'any', rules: [{ kind: 'kind', value: 'group' }, { kind: 'kind', value: 'dm' }] };   // every conversation
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
/** r4: EVERY door that writes a grain, with a body that writes NO wake row (the reviewer's holes: a rule's pattern alone, its
 *  watchExcept alone, a conversation's filter — and the rest: an access list, a reach, a removal, an unassign, a next-turn row).
 *  `grain` = the grain its PATH names (`<adapter>|<kind>|<id>`) — `at(id)` swaps the rule / conversation id. */
const GRAIN_DOORS = (rule, conv) => [
  ['PUT', '/api/channels/adapters/fake-poll/access', { access: ACC }, 'fake-poll|account|'],
  ['PUT', '/api/channels/adapters/fake-poll/watchers', { watchers: [NEXT] }, 'fake-poll|account|'],
  ['PUT', '/api/channels/adapters/fake-poll/assignment', { assignment: null }, 'fake-poll|account|'],
  ['PUT', `/api/channels/adapters/fake-poll/patterns/${rule}/access`, { access: ACC }, `fake-poll|pattern|${rule}`],
  ['PUT', `/api/channels/adapters/fake-poll/patterns/${rule}/watchers`, { watchers: [] }, `fake-poll|pattern|${rule}`],
  ['PUT', `/api/channels/adapters/fake-poll/patterns/${rule}`, { pattern: MATCH_ALL }, `fake-poll|pattern|${rule}`],
  ['PUT', `/api/channels/adapters/fake-poll/patterns/${rule}`, { watchExcept: [] }, `fake-poll|pattern|${rule}`],
  ['DELETE', `/api/channels/adapters/fake-poll/patterns/${rule}`, {}, `fake-poll|pattern|${rule}`],
  ['PUT', `/api/channels/fake-poll/${conv}/assignment`, { assignment: null }, `fake-poll|conversation|${conv}`],
  ['PUT', `/api/channels/fake-poll/${conv}/access`, { access: ACC }, `fake-poll|conversation|${conv}`],
  ['PUT', `/api/channels/fake-poll/${conv}/watchers`, { watchers: [NEXT] }, `fake-poll|conversation|${conv}`],
  ['PUT', `/api/channels/fake-poll/${conv}/filter`, { filter: MATCH_ALL }, `fake-poll|conversation|${conv}`],
  ['PUT', `/api/channels/fake-poll/${conv}/reach`, { principal: { kind: 'agent', id: 'c-ops' }, level: 'visible' }, `fake-poll|conversation|${conv}`],
];
/** the real router over a stub engine whose grains in `held` HOLD a wake (THE engine's mark — wakeHeldAt); every write recorded */
function stubWith(mod, held) {
  const writes = [], asked = [];
  const wrote = (what) => async (...a) => { writes.push({ what, a }); return { ok: true }; };
  mod.setup({ getEngine: () => ({
    adapterRecords: () => ({ adapters: [{ id: 'fake-poll' }] }),   // r6: the gate asks only an engine that OWNS the adapter (the one wiring's)
    decideRequest: async () => ({ ok: true }),
    wakeHeldAt: (adapterId, grain) => { const k = `${adapterId}|${grain && grain.kind}|${(grain && (grain.id || grain.convId)) || ''}`; asked.push(k); return { held: held.has(k), rows: held.has(k) ? 1 : 0 }; },
    setWatchers: wrote('setWatchers'), setGrain: wrote('setGrain'), setAssignment: wrote('setAssignment'), setScopeAssignment: wrote('setScopeAssignment'),
    setAccess: wrote('setAccess'), removePattern: wrote('removePattern'), setFilter: wrote('setFilter'), setReach: wrote('setReach') }) });
  return { writes, asked };
}
async function listen(mod) {
  const app = express(); app.use(express.json()); app.use(mod.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const own = `http://127.0.0.1:${srv.address().port}`;
  const send = async (method, p, headers = {}, body = {}) => { const r = await fetch(own + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'DELETE' ? undefined : JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, code: j && j.code, error: j && j.error, wakeHeld: !!(j && j.wakeHeld) }; };
  return { send, close: () => new Promise((r) => srv.close(r)) };
}
async function wakeDoors(mod) {
  const st = stubWith(mod, new Set());   // r2's legs: no grain holds a wake — the BODY is what would write one
  const S = await listen(mod);
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
    out.writesAfterRefusals = st.writes.length;
    for (const [m, p, body] of DOORS_W) {
      out.next.push((await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, body([NEXT]))));
      out.removal.push((await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, body([]))));
      out.page.push((await S.send(m, p, { 'Sec-Fetch-Site': 'same-origin' }, body([WAKE]))));
    }
    for (const [m, p] of DOORS_A) out.assignPage.push((await S.send(m, p, { 'Sec-Fetch-Site': 'same-origin' }, { assignment: ASSIGN })));
    out.writes = st.writes.length;
    return out;
  } finally { await S.close(); }
}
const GATE_LINE = /^    if \(wakeRefused\(req, res, [^\n]*\)\) return;[^\n]*\n/gm;
{
  const g = await wakeDoors(routerFrom(REAL_SRC));
  const all = (xs, st, code) => xs.length > 0 && xs.every((r) => r.status === st && (code === undefined || r.code === code));
  ok(all(g.vsst, 403, 'human_only') && g.vsst.every((r) => /a wake \(a billed turn\) is the owner's to set/.test(r.error || '')), `a WAKE row from an agent's vsst_ on every watchers door (${DOORS_W.length}: a conversation, the account, a rule's list, a new rule, a rule rewritten) ⇒ 403 human_only, said by name`, g.vsst);
  ok(all(g.bare, 403, 'cross_site'), 'a bare write (curl on an instance whose sign-in is off) ⇒ 403 cross_site', g.bare);
  ok(all(g.digest, 403, 'human_only') && all(g.legacy, 403, 'human_only'), 'a DIGEST (a paced wake) and a row that never said its delivery (it reads wake) ⇒ refused the same way', { digest: g.digest, legacy: g.legacy });
  ok(all(g.assignVsst, 403, 'human_only') && all(g.assignBare, 403, 'cross_site'), `a pre-split ASSIGNMENT (its watcher row IS a wake) on its ${DOORS_A.length} doors ⇒ refused the same way`, { v: g.assignVsst, b: g.assignBare });
  ok(g.writesAfterRefusals === 0, `…and the engine never asked to write (${g.writesAfterRefusals} writes)`);
  ok(all(g.next, 200) && all(g.removal, 200), 'on a grain that holds NO wake, an agent\'s non-wake write (a next-turn row) and a removal ([]) are as they were — written', { next: g.next, removal: g.removal });
  ok(all(g.page, 200) && all(g.assignPage, 200) && g.writes === DOORS_W.length * 3 + DOORS_A.length, `this instance's own page ⇒ written (the owner's Notify…) — ${g.writes} writes`, { page: g.page, assignPage: g.assignPage, writes: g.writes });
  // RED CONTROL: the route file with no gate at all (round 1)
  const cuts = (REAL_SRC.match(GATE_LINE) || []).length;
  const r = await wakeDoors(routerFrom(REAL_SRC.replace(GATE_LINE, '')));
  ok(cuts === 13 && all(r.vsst, 200) && all(r.bare, 200) && all(r.assignVsst, 200), `RED CONTROL: the doors with the ${cuts} gates cut — an agent's vsst_ and a bare curl WRITE a wake on every door (${r.vsst.map((x) => x.status).join(', ')})`, { vsst: r.vsst.map((x) => x.status), bare: r.bare.map((x) => x.status) });
}
/** r3's gate, rebuilt from this file (the RED copy of round 4): the gate keyed on the BODY's rows only — a door with no rows to
 *  read has no gate; wakeRefused asks nothing of the grain. */
const R3_GATE_FN = 'function wakeRefused(req, res, rows) {\n  if (!wakeRowsOf(rows).length) return false;\n  const who = personVerdict(req);\n  if (who.ok) return false;\n  bad(res, 403, WAKE_REFUSED[who.code] || WAKE_REFUSED.cross_site, { code: who.code });\n  return true;\n}\n';
function r3Form(src) {
  const i = src.indexOf('function wakeRefused(req, res, at, rows = []) {'), j = i < 0 ? -1 : src.indexOf('\n}\n', i) + 3;   // r6: the gate reads the one wiring's engine (no argument)
  return (i < 0 ? src : src.slice(0, i) + R3_GATE_FN + src.slice(j))
    .replace(/if \(wakeRefused\(req, res, (?:accountGrain|ruleGrain|convGrain)\(req\), ([^\n]*)\)\) return;/g, 'if (wakeRefused(req, res, $1)) return;')
    .replace(/^    if \(wakeRefused\(req, res, (?:accountGrain|ruleGrain|convGrain)\(req\)\)\) return;[^\n]*\n/gm, '');
}
/** the r4 legs: EVERY grain door, its body writing no wake — on grains that HOLD one (rule p1, conversation fake-poll-ops) and on
 *  grains that do not (rule p2, conversation fake-poll-dev; the account holds none here) */
async function heldDoors(mod) {
  const HELD = new Set(['fake-poll|pattern|p1', 'fake-poll|conversation|fake-poll-ops']);
  const st = stubWith(mod, HELD);
  const S = await listen(mod);
  try {
    const out = { held: [], bare: [], page: [], free: [], writesRefused: 0, asked: [] };
    const heldDoorsOnly = GRAIN_DOORS('p1', 'fake-poll-ops').filter((d) => HELD.has(d[3]));
    for (const [m, p, body] of heldDoorsOnly) {
      out.held.push({ door: `${m} ${p}`, body: Object.keys(body).join(','), ...(await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, body)) });
      out.bare.push(await S.send(m, p, {}, body));
    }
    out.writesRefused = st.writes.length;
    out.asked = [...new Set(st.asked)];
    for (const [m, p, body] of heldDoorsOnly) out.page.push(await S.send(m, p, { 'Sec-Fetch-Site': 'same-origin' }, body));
    for (const [m, p, body] of GRAIN_DOORS('p2', 'fake-poll-dev')) out.free.push({ door: `${m} ${p}`, ...(await S.send(m, p, { Authorization: 'Bearer vsst_0123456789abcdef' }, body)) });
    out.writes = st.writes.length;
    out.nHeld = heldDoorsOnly.length;
    return out;
  } finally { await S.close(); }
}
{
  const g = await heldDoors(routerFrom(REAL_SRC));
  const all = (xs, st, code) => xs.length > 0 && xs.every((r) => r.status === st && (code === undefined || r.code === code));
  ok(g.nHeld === 10 && all(g.held, 403, 'human_only') && g.held.every((r) => r.wakeHeld && /this grain holds a wake \(a billed turn\)/.test(r.error || '')), `r4: on a grain that HOLDS a wake, EVERY write from an agent's vsst_ ⇒ 403 human_only «this grain holds a wake…» — ${g.nHeld} doors: ${g.held.map((r) => `${r.door} {${r.body}}`).join(' · ')}`, g.held.filter((r) => r.status !== 403));
  ok(all(g.bare, 403, 'cross_site') && g.writesRefused === 0, 'r4: …a bare curl (sign-in off) ⇒ 403 cross_site; the engine never asked to write', { bare: g.bare.map((x) => x.status), writes: g.writesRefused });
  ok(['fake-poll|pattern|p1', 'fake-poll|conversation|fake-poll-ops'].every((k) => g.asked.includes(k)) && g.asked.every((k) => /^fake-poll\|(account\||pattern\|p[12]|conversation\|fake-poll-(ops|dev))$/.test(k)), 'r4: the gate asks THE ENGINE about the grain its PATH names (account / rule / conversation) — never a body field', g.asked);
  ok(all(g.page, 200) && all(g.free, 200), `r4: this instance's page ⇒ written; the same ${g.free.length} writes on grains with NO wake ⇒ 200 for the agent (a non-wake grain stays the agent's to edit)`, { page: g.page.map((x) => x.status), free: g.free.filter((x) => x.status !== 200) });
  // RED CONTROL: round 3's routes (the gate keyed on the body) — the reviewer's three curls and every other hole WRITE
  const red = await heldDoors(routerFrom(r3Form(REAL_SRC)));
  const holes = red.held.filter((r) => r.status === 200);
  ok(r3Form(REAL_SRC) !== REAL_SRC && holes.length === red.nHeld && red.writesRefused === red.nHeld * 2, `RED CONTROL: round 3's gate (keyed on a \`watchers\` body) — a vsst_ and a bare curl WIDEN the held wake through all ${red.nHeld} doors (the reviewer's: the rule's pattern ⇒ ${red.held.find((r) => r.body === 'pattern').status}, its watchExcept ⇒ ${red.held.find((r) => r.body === 'watchExcept').status}, the conversation's filter ⇒ ${red.held.find((r) => /filter$/.test(r.door)).status})`, red.held.map((r) => `${r.door} {${r.body}} ${r.status}`));
}
/** THE WRITER CENSUS (r4 — 主开发: «keyed on the fact "this write can change a wake's reach", never on a body field»; r5: «the
 *  census scans every routes file that writes a grain the engine reads for wakes — derive the file list from the engine's
 *  writers, never a hand list»):
 *  ① THE ENGINE'S GRAIN WRITERS are DERIVED from src/server/channels-access.js — every function that writes a grain row (the
 *    grants store's one writer: setGrainRows / removeRule / setLevel; a stored filter) and every function that calls one;
 *  ② THE FIELDS THE ENGINE READS FOR WAKES off a conversation entry are DERIVED — what a rule matches over (convFacts) and
 *    what the per-path wake budget reads (pathBudgetVerdict) — and a function of any file that writes one on an index entry
 *    (inside `index.update`) is a grain writer of that file, as is every function of the file calling it;
 *  ③ THE FILE LIST is DERIVED: every file of src/ (the engine family aside) whose code calls an engine writer through a
 *    channels engine, or holds a writer of ②; in it every route calling one asks the gate FIRST, at its handler's own level
 *    (never inside a condition), naming the grain its path writes (adapters/:id → accountGrain, …/patterns → ruleGrain,
 *    /:adapterId/:convId → convGrain, /api/channels/webhook/… → pathGrain) — directly (`wakeRefused`) or through a local
 *    wrapper of it; the decide route and the agent's own watch answer to their own roads; a route whose AUTHORITY is a door
 *    elsewhere (the pairing's completion — the owner's code) names that door, which carries the gate; a writer called
 *    anywhere but a route is named;
 *  ④ every call of a writer INSIDE the engine is a named road (why it may write without the gate). → { routes, writers,
 *    fields, files, problems } */
const GRAIN_PRIMITIVE = /CG\.(setGrainRows|removeRule|setLevel)\(|filtersOf\(ix\)\[[^\]]+\]\s*=(?!=)|\.filterId\s*=(?!=)/;
const ENGINE_ROADS = {   // the enclosing function → why it may call a grain writer without the gate (it is never a route)
  agentWatch: 'the agent\'s own road: next-turn only — a wake returns fileWatchRequest (its ASK) before this write; the user\'s row is never replaced',
  agentUnwatch: 'a removal of the agent\'s OWN row — never another\'s, never a wake it did not ask for',
  decideRequest: 'THE decision: behind the decide route\'s person verdict (⑤)', decideWatchRequest: 'THE decision: behind the decide route\'s person verdict (⑤)',
  setAccess: 'a route\'s writer (the gate is the route\'s)', setWatchers: 'a route\'s writer (the gate is the route\'s)', setAssignment: 'a route\'s writer (the gate is the route\'s)', setScopeAssignment: 'a route\'s writer (the gate is the route\'s)',
};
/** writers a route may call without the gate — each answers to its own road */
const ROUTE_EXEMPT = { decideRequest: 'the decide route — its own person verdict, pinned in ⑤', agentWatch: 'the agent\'s own watch (next-turn; a wake is an ASK the owner approves)', agentUnwatch: 'the agent\'s own row removed' };
/** routes whose AUTHORITY is another door: that door must carry the gate */
const AUTHORITY_DOORS = { 'POST /api/channels/webhook/:slug/pair': { door: 'POST /api/channels/webhook/paths/:slug/pair-code', alsoAsks: 'heldAtCompletion', why: 'the pairing\'s completion (cookie-free) writes the caller the owner\'s code was minted for — the code is its authority; r6: it asks the path AS IT IS at completion too (a code a person did not mint is refused on a held path)' } };
/** names a writer shares with another engine (an exit's setAccess, an automation key's setReach): counted on a channels engine only */
/** the engine's functions (r4: `function` heads — an arrow const inside one stays part of its body) */
function fnsOf(text) {
  const heads = [...text.matchAll(/(?:async )?function (\w+)\(/g)];
  return heads.map((h, k) => ({ name: h[1], at: h.index, body: text.slice(h.index + h[0].length, k + 1 < heads.length ? heads[k + 1].index : text.length) }));
}
function grainWriters(E) {
  const fns = fnsOf(E);
  const W = new Set(fns.filter((f) => GRAIN_PRIMITIVE.test(f.body)).map((f) => f.name));
  for (let grew = true; grew;) { grew = false; for (const f of fns) if (!W.has(f.name) && [...W].some((w) => new RegExp(`(?<![\\w.])${w}\\(`).test(f.body))) { W.add(f.name); grew = true; } }
  return { W, fns };
}
/** ② the entry fields the engine reads for wakes — derived from its source */
function wakeReadFields(files) {
  const E = files['src/server/channels-access.js'] || '', G = files['src/server/channels-engine.js'] || '';
  const cf = /function convFacts\(en\) \{([^\n]*)\}/.exec(E);
  const pb = /function pathBudgetVerdict\([^)]*\) \{([\s\S]*?)\n  \}/.exec(G);
  const fieldsIn = (s) => [...String(s || '').matchAll(/\ben\.(\w+)\b/g)].map((m) => m[1]);
  return [...new Set([...fieldsIn(cf && cf[1]), ...fieldsIn(pb && pb[1])])].sort();
}
const grainOfPath = (p) => (/^\/api\/channels\/webhook\//.test(p) ? 'pathGrain' : /\/patterns(\/|'|$)/.test(p) ? 'ruleGrain' : /^\/api\/channels\/adapters\/:id\//.test(p) ? 'accountGrain' : /^\/api\/channels\/:adapterId\/:convId\//.test(p) ? 'convGrain' : null);
/** THE ROUTE SIDE OVER THE AST (lane wake-approve-card r6 — 主开发: the derivation missed an inline `en.participants =` inside a
 *  route's `index.update`, `entry.participants =`, `Object.assign(en, {participants})`, a two-hop helper — the helper's file
 *  joined, its calling route never named —, `ctx.getEngine().setWatchers(`, `const ce = engine(); ce.setWatchers(`): every
 *  candidate file is PARSED (acorn) and judged over identifiers, never one spelling. A WRITE is ① a call of an engine grain
 *  writer, whatever the receiver (a writer name another file also defines — `setAccess` of the exits, `setReach` of the
 *  automation keys — counts only on a receiver that resolves, through its local aliases, to a channels engine getter); ② inside
 *  a function handed to `<anything>.index.update(…)`, an assignment to a field the engine reads for wakes on ANY object, or an
 *  `Object.assign(x, {<field>…})`. A FUNCTION is a writer when it writes or calls a writer — its own file's, or another file's
 *  through `require` (a destructured binding or `M.fn`) — to a fixpoint; a ROUTE (`router|app.<verb>('/…', …)`) reaching one
 *  asks the gate FIRST, at its handler's own level, for the grain its path writes (directly or through a local wrapper of
 *  `wakeRefused`); a writer reached from no route is named. */
const PARSED = new Map(), SCANNED = new Map(), WRITES_MEMO = new WeakMap();   // memo by the file's TEXT (a RED copy re-reads one or two files, never the tree)
const PARSE = (src) => { if (PARSED.has(src)) return PARSED.get(src); let ast = null; for (const sourceType of ['module', 'script']) { try { ast = ACORN.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowImportExportEverywhere: true, allowAwaitOutsideFunction: true }); break; } catch { /* the other */ } } PARSED.set(src, ast); return ast; };
/** one pass over a file's text: the names it DEFINES (a function, a method, a property / binding holding one) and the names it
 *  CALLS (`name(`), and whether it updates an index — the census's candidate filter and its shared-name derivation */
function scanOf(src) {
  if (SCANNED.has(src)) return SCANNED.get(src);
  const defs = new Set(), calls = new Set();
  for (const m of src.matchAll(/(?:function\s+(\w+)\s*\(|\b(\w+)\s*[:=]\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)|^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{)/gm)) defs.add(m[1] || m[2] || m[3]);
  for (const m of src.matchAll(/\b(\w+)\(/g)) calls.add(m[1]);
  const v = { defs, calls, updates: src.includes('index.update('), requires: [...src.matchAll(/\brequire\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map((m) => m[1]) };
  SCANNED.set(src, v);
  return v;
}
function walkAst(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parents) === false) return;
  const next = parents.concat([node]);
  for (const k in node) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walkAst(c, visit, next); } else if (v && typeof v.type === 'string') walkAst(v, visit, next);
  }
}
const propName = (m) => (m && m.type === 'MemberExpression' ? (!m.computed && m.property.type === 'Identifier' ? m.property.name : m.property.type === 'Literal' ? String(m.property.value) : null) : null);
const isFn = (n) => n && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
/** the channels engine's getters (a receiver resolving to one of these is a channels engine — for the shared writer names only) */
const ENGINE_GETTER = /^(engine|getEngine|channelsEngine|getChannels|channels|chan|eng|e)$/;
/** the receiver's ROOT: the getter CALL it comes from (`engine()`, `ctx.getEngine()`, through a local alias `const ce = engine()`)
 *  → its name; a bare identifier no alias resolves (a parameter: another engine handed in) → null */
function resolveRoot(node, aliases, depth = 0) {
  if (!node || depth > 4) return null;
  if (node.type === 'CallExpression') return node.callee.type === 'Identifier' ? node.callee.name : propName(node.callee);
  if (node.type === 'AwaitExpression') return resolveRoot(node.argument, aliases, depth + 1);
  if (node.type === 'Identifier') return aliases.has(node.name) ? resolveRoot(aliases.get(node.name), aliases, depth + 1) : null;
  return null;
}
/** a route's registration call (`router|app.<verb>('/…', …)`) */
const isRouteCall = (n) => n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && /^(get|put|post|patch|delete|all)$/.test(propName(n.callee) || '') && n.callee.object.type === 'Identifier' && /^(router|app)$/.test(n.callee.object.name) && n.arguments[0] && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string' && n.arguments[0].value.startsWith('/');
/** inside one function: its own code — never a route it registers, nor a function it declares (each judged on its own) */
const ownCode = (root) => (n) => (n !== root && (isRouteCall(n) || n.type === 'FunctionDeclaration' || (n.type === 'VariableDeclarator' && isFn(n.init)))) ? false : true;
function writerCensus(files) {
  const out = [], routes = [], derived = new Set();
  const E = files['src/server/channels-access.js'] || '';
  const { W, fns } = grainWriters(E);
  const fields = wakeReadFields(files);
  const FIELDS = new Set(fields);
  const ENGINE_FAMILY = (rel) => /^src\/server\/channels-[a-z]+\.js$/.test(rel);
  const cand = Object.keys(files).filter((rel) => /^src\/.*\.js$/.test(rel) && !ENGINE_FAMILY(rel));
  // a writer name another file ALSO defines (a function, a method, a property) is SHARED — derived, never a hand list
  const SHARED = new Set([...W].filter((n) => cand.some((rel) => scanOf(files[rel]).defs.has(n))));
  const asts = new Map(), info = new Map();
  const astOf = (rel) => { if (!asts.has(rel)) asts.set(rel, PARSE(files[rel])); return asts.get(rel); };
  const resolveReq = (rel, spec) => { if (typeof spec !== 'string' || !spec.startsWith('.')) return null; const p = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)); return files[p] !== undefined ? p : files[p + '.js'] !== undefined ? p + '.js' : null; };
  /** one file's facts: its functions (name → node), its require bindings, aliases, routes */
  function factsOf(rel) {
    if (info.has(rel)) return info.get(rel);
    const ast = astOf(rel);
    const f = { fnNodes: new Map(), imports: new Map(), modules: new Map(), aliases: new Map(), routes: [], ok: !!ast };
    if (ast) walkAst(ast, (n) => {
      if (n.type === 'FunctionDeclaration' && n.id) f.fnNodes.set(n.id.name, n);
      if (n.type === 'VariableDeclarator' && n.init) {
        if (n.id.type === 'Identifier' && isFn(n.init)) f.fnNodes.set(n.id.name, n.init);
        const req = n.init.type === 'CallExpression' && n.init.callee.type === 'Identifier' && n.init.callee.name === 'require' && n.init.arguments[0] && n.init.arguments[0].type === 'Literal' ? resolveReq(rel, n.init.arguments[0].value) : null;
        if (req && n.id.type === 'Identifier') f.modules.set(n.id.name, req);
        if (req && n.id.type === 'ObjectPattern') for (const p of n.id.properties) if (p.type === 'Property' && p.key.type === 'Identifier' && p.value.type === 'Identifier') f.imports.set(p.value.name, { file: req, name: p.key.name });
        if (!req && n.id.type === 'Identifier' && !isFn(n.init)) f.aliases.set(n.id.name, n.init);
      }
      if (isRouteCall(n)) f.routes.push({ door: `${propName(n.callee).toUpperCase()} ${n.arguments[0].value}`, path: n.arguments[0].value, node: n });
    });
    info.set(rel, f);
    return f;
  }
  /** the DIRECT writes inside `node`: [{w, at}] — an engine writer call, a wake field written in an index update */
  const SIG = `${[...W].sort().join()}|${fields.join()}|${[...SHARED].sort().join()}`;
  function directWrites(rel, node) {
    const memo = WRITES_MEMO.get(node);
    if (memo && memo.has(SIG)) return memo.get(SIG);
    const f = factsOf(rel), hits = [];
    const own = ownCode(node);
    walkAst(node, (n, parents) => {
      if (!own(n)) return false;
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') {
        const m = propName(n.callee);
        if (m && W.has(m) && (!SHARED.has(m) || ENGINE_GETTER.test(resolveRoot(n.callee.object, f.aliases) || ''))) hits.push({ w: m, at: n.start });
      }
      const inUpdate = () => parents.some((p, i) => isFn(p) && parents[i - 1] && parents[i - 1].type === 'CallExpression' && propName(parents[i - 1].callee) === 'update' && propName(parents[i - 1].callee.object) === 'index');
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && FIELDS.has(propName(n.left) || '') && inUpdate()) hits.push({ w: `${propName(n.left)} =`, at: n.start, field: true });
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Object' && propName(n.callee) === 'assign' && n.arguments.slice(1).some((a) => a.type === 'ObjectExpression' && a.properties.some((p) => p.type === 'Property' && FIELDS.has(p.key.type === 'Identifier' ? p.key.name : String(p.key.value)))) && inUpdate()) hits.push({ w: 'Object.assign(…fields)', at: n.start, field: true });
    });
    if (!WRITES_MEMO.has(node)) WRITES_MEMO.set(node, new Map());
    WRITES_MEMO.get(node).set(SIG, hits);
    return hits;
  }
  /** the calls inside `node` of a function this file names (locally or through require): [{file, name, at}] */
  function callsIn(rel, node) {
    const f = factsOf(rel), calls = [];
    const own = ownCode(node);
    walkAst(node, (n) => {
      if (!own(n)) return false;
      if (n.type !== 'CallExpression') return;
      if (n.callee.type === 'Identifier') { const nm = n.callee.name; if (f.imports.has(nm)) calls.push({ ...f.imports.get(nm), at: n.start }); else if (f.fnNodes.has(nm)) calls.push({ file: rel, name: nm, at: n.start }); }
      else if (n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && f.modules.has(n.callee.object.name)) calls.push({ file: f.modules.get(n.callee.object.name), name: propName(n.callee), at: n.start });
    });
    return calls;
  }
  // ① the files to parse: those holding a write's spelling, then (to a fixpoint) those naming a writer they reach
  const writerFns = new Map();   // `${file}#${name}` → the first write it reaches ({w}) + every engine writer / field it ends in (`terms`)
  const queue = cand.filter((rel) => { const sc = scanOf(files[rel]); return sc.updates || [...W].some((n) => sc.calls.has(n)); });
  const seen = new Set(queue);
  for (let grew = true; grew;) {
    grew = false;
    for (const rel of [...seen]) {
      const f = factsOf(rel);
      if (!f.ok) continue;
      for (const [name, node] of f.fnNodes) {
        const key = `${rel}#${name}`;
        const ds = directWrites(rel, node);
        const vias = callsIn(rel, node).filter((c) => writerFns.has(`${c.file}#${c.name}`));
        if (!ds.length && !vias.length) continue;
        const terms = new Set([...ds.map((x) => x.w), ...vias.flatMap((c) => [...writerFns.get(`${c.file}#${c.name}`).terms])]);
        const had = writerFns.get(key);
        if (had && had.terms.size === terms.size) continue;
        writerFns.set(key, { w: ds[0] ? ds[0].w : `${vias[0].name}() → ${writerFns.get(`${vias[0].file}#${vias[0].name}`).w}`, terms });
        grew = true;
      }
    }
    // a file that REQUIRES a file holding a writer joins (its routes may reach it through the require)
    const writerFiles = new Set([...writerFns.keys()].map((k) => k.split('#')[0]));
    for (const rel of cand) {
      if (seen.has(rel)) continue;
      if (scanOf(files[rel]).requires.some((spec) => writerFiles.has(resolveReq(rel, spec)))) { seen.add(rel); grew = true; }
    }
  }
  const reachedByRoute = new Set();
  const wrappersOf = (rel) => {   // a local wrapper of the gate: its name → the grain it asks (an `…Grain` call inside its wakeRefused)
    const f = factsOf(rel), out2 = new Map();
    for (const [name, node] of f.fnNodes) walkAst(node, (n) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'wakeRefused') { let g = null; walkAst(n.arguments[2], (x) => { if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && /Grain$/.test(x.callee.name)) g = g || x.callee.name; }); out2.set(name, g); } });
    return out2;
  };
  for (const rel of seen) {
    const f = factsOf(rel);
    if (!f.ok) { out.push(`${rel}: does not parse — the census cannot read it`); continue; }
    const wraps = wrappersOf(rel);
    const gateIn = (fn) => {   // the gate at the handler's OWN level: an `if (<gate>) return;` in its body (or its top-level try's)
      if (!fn || !fn.body || fn.body.type !== 'BlockStatement') return null;
      const levels = [fn.body.body, ...fn.body.body.filter((st) => st.type === 'TryStatement').map((st) => st.block.body)];
      for (const list of levels) for (const st of list) {
        if (st.type !== 'IfStatement') continue;
        const c = st.test.type === 'CallExpression' ? st.test : null;
        if (!c || c.callee.type !== 'Identifier') continue;
        if (c.callee.name === 'wakeRefused') { let g = null; walkAst(c.arguments[2], (x) => { if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && /Grain$/.test(x.callee.name)) g = g || x.callee.name; }); if (g) return { at: st.start, grain: g }; continue; }   // keyed on the body only (no grain) is no gate for the grain
        if (wraps.has(c.callee.name)) return { at: st.start, grain: wraps.get(c.callee.name) };
      }
      return null;
    };
    for (const r of f.routes) {
      const handlers = r.node.arguments.slice(1).filter(isFn);
      const wrapped = r.node.arguments.slice(1).filter((a) => a.type === 'CallExpression').flatMap((a) => a.arguments.filter(isFn));
      const all = [...handlers, ...wrapped];
      const hits = all.flatMap((h) => [...directWrites(rel, h).map((x) => ({ ...x, terms: [x.w] })), ...callsIn(rel, h).filter((c) => writerFns.has(`${c.file}#${c.name}`)).map((c) => { reachedByRoute.add(`${c.file}#${c.name}`); const wf = writerFns.get(`${c.file}#${c.name}`); return { w: c.name, at: c.at, via: wf.w, terms: [...wf.terms] }; })]).sort((a, b) => a.at - b.at);
      if (!hits.length) continue;
      derived.add(rel);
      // exempt only when EVERY write it reaches ends in an exempt writer (the agent's own watch through a local helper)
      const exemptHit = (x) => x.terms.every((tm) => ROUTE_EXEMPT[tm]);
      if (hits.every(exemptHit)) continue;
      const first = hits.find((x) => !exemptHit(x));
      const auth = AUTHORITY_DOORS[r.door];
      if (auth) {
        const d = f.routes.find((x) => x.door === auth.door);
        const dGate = d ? d.node.arguments.slice(1).filter(isFn).map(gateIn).find(Boolean) : null;
        if (!dGate) out.push(`${rel} ${r.door}: its authority is ${auth.door}, which does not ask the gate`);
        if (auth.alsoAsks && !all.some((h) => { let found = false; walkAst(h, (x) => { if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && x.callee.name === auth.alsoAsks) found = true; }); return found; })) out.push(`${rel} ${r.door}: does not ask ${auth.alsoAsks}() — the path as it is at completion`);
        continue;
      }
      routes.push(r.door);
      const gate = all.map(gateIn).find(Boolean);
      const what = first.via ? `${first.w} (→ ${first.via})` : first.w;
      if (!gate) { out.push(`${r.door}: calls ${what} without asking the person verdict for the grain it writes (no gate at the handler's own level, or one keyed on the body only)`); continue; }
      if (gate.at > first.at) out.push(`${r.door}: asks the gate AFTER it calls ${what}`);
      const want = grainOfPath(r.path);
      if (gate.grain !== want) out.push(`${r.door}: its gate names ${gate.grain} — the path writes the ${want}`);
    }
  }
  // a writer reached from NO route (an engine road elsewhere, a timer, a helper nobody gates) is named
  const callers = new Map();
  for (const rel of seen) { const f = factsOf(rel); if (!f.ok) continue; for (const [name, node] of f.fnNodes) for (const c of callsIn(rel, node)) if (writerFns.has(`${c.file}#${c.name}`)) { const k = `${c.file}#${c.name}`; if (!callers.has(k)) callers.set(k, []); callers.get(k).push(`${rel}#${name}`); } }
  const routed = (k, depth = 0) => reachedByRoute.has(k) || (depth < 6 && (callers.get(k) || []).some((c) => writerFns.has(c) && routed(c, depth + 1)));
  for (const [k, v] of writerFns) {
    const [rel, name] = k.split('#');
    if (ROUTE_EXEMPT[name] || routed(k) || [...v.terms].every((tm) => ROUTE_EXEMPT[tm])) continue;
    out.push(`${rel} ${name}(): calls the grain writer ${v.w}${/\(\)|=$/.test(v.w) ? '' : '()'} outside a gated route`);
  }
  for (const f of fns) for (const w of W) if (w !== f.name && new RegExp(`(?<![\\w.])${w}\\(`).test(f.body) && !ENGINE_ROADS[f.name]) out.push(`src/server/channels-access.js ${f.name}(): calls the grain writer ${w}() — a road the census does not know`);
  for (const rel of seen) if (writerFns.size && [...writerFns.keys()].some((k) => k.startsWith(rel + '#'))) derived.add(rel);
  return { routes, writers: [...W].sort(), fields, files: [...derived].sort(), shared: [...SHARED].sort(), problems: out };
}
const WEBHOOK = 'src/routes/webhook.js';
const WH_SRC = SRC_FILES[WEBHOOK] || '';
const WH_GATE = /^ {2,4}if \(pathRefused\(req, res[^\n]*\)\) return;[^\n]*\n/gm;
{
  const c = writerCensus(SRC_FILES), c0 = c;
  const ch = c.routes.filter((r) => !/\/webhook\//.test(r)), wh = c.routes.filter((r) => /\/webhook\//.test(r));
  ok(!c.problems.length && ch.length === 13, `THE WRITER CENSUS (r4): the engine's grain writers, derived (${c.writers.join(', ')}); the ${ch.length} routes of src/routes/channels.js that call one each ask the gate FIRST for the grain their path writes: ${ch.join(' · ')}`, c.problems);
  ok(JSON.stringify(c.fields) === JSON.stringify(['authors', 'kind', 'options', 'participants', 'stats', 'title']) && c.files.includes(WEBHOOK) && c.files.includes('src/routes/channels.js') && wh.length === 5 && !c.problems.length, `r5: THE FILE LIST IS DERIVED — the fields the engine reads for wakes off an entry (${c.fields.join(', ')}: what a rule matches, the per-path budget) and the writers of the engine name ${c.files.length} files (${c.files.join(', ')}); src/routes/webhook.js's ${wh.length} path verbs each ask the gate for the PATH: ${wh.join(' · ')} (the pairing's completion answers to the gated pair-code)`, { files: c.files, fields: c.fields, wh, problems: c.problems });
  const r3 = writerCensus({ ...SRC_FILES, 'src/routes/channels.js': r3Form(REAL_SRC) });
  const bodyKeyed = (r3Form(REAL_SRC).match(/^    if \(wakeRefused\(req, res, [^\n]*\)\) return;/gm) || []).length;
  ok(r3.problems.length === 13 && r3.problems.every((x) => /without asking the person verdict for the grain it writes/.test(x)), `RED COPY: round 3's routes — the census names all ${r3.problems.length} doors (the ${13 - bodyKeyed} that never asked and the ${bodyKeyed} keyed on a body field): ${r3.problems.map((x) => x.replace(/: (calls|asks|its gate) .*$/, '').replace('/api/channels/', '…/')).join(' · ')}`, r3.problems);
  const nested = writerCensus({ ...SRC_FILES, 'src/routes/channels.js': REAL_SRC.replace("    if (wakeRefused(req, res, convGrain(req))) return;   // r4: a filter a wake fires on is the owner's\n", "    if (b.filter && b.filter.rules) { if (wakeRefused(req, res, convGrain(req))) return; }\n") });
  ok(nested.problems.some((x) => /^PUT \/api\/channels\/:adapterId\/:convId\/filter: calls setFilter without asking/.test(x)), 'RED COPY: a gate inside a condition on the body (the filter only when it has rules) is named', nested.problems);
  const wrongGrain = writerCensus({ ...SRC_FILES, 'src/routes/channels.js': REAL_SRC.replace("    if (wakeRefused(req, res, ruleGrain(req))) return;   // r4: removing a rule that holds a wake is a wake write\n", "    if (wakeRefused(req, res, accountGrain(req))) return;\n") });
  ok(wrongGrain.problems.some((x) => /DELETE \/api\/channels\/adapters\/:id\/patterns\/:pid: its gate names accountGrain — the path writes the ruleGrain/.test(x)), 'RED COPY: a gate asking about another grain than the one the path writes is named', wrongGrain.problems);
  const planted = writerCensus({ ...SRC_FILES, 'src/server/channels-access.js': SRC_FILES['src/server/channels-access.js'].replace('  /** Approve = EXACTLY the frozen row', '  async function wakeEveryone(a, g, rows) { return setGrain(a, g, { watchers: rows }); }\n  /** Approve = EXACTLY the frozen row') });
  ok(planted.problems.some((x) => /wakeEveryone\(\): calls the grain writer setGrain/.test(x)), 'RED COPY: a writer planted in the engine is named', planted.problems);
  const withPrim = SRC_FILES['src/server/channels-access.js'].replace('  /** Approve = EXACTLY the frozen row', "  function widenRule(id, p) { return CG.setGrainRows(CG.grainResource('pattern', id), { access: p }, 'agent'); }\n  /** Approve = EXACTLY the frozen row");
  const newRoute = REAL_SRC.replace("router.delete('/api/channels/adapters/:id/patterns/:pid',", "router.put('/api/channels/adapters/:id/patterns/:pid/widen', async (req, res) => {\n  try { forHost(req); scopeAnswer(res, await engine().widenRule(req.params.pid, req.body.access)); } catch (e) { fail(res, e); }\n});\nrouter.delete('/api/channels/adapters/:id/patterns/:pid',");
  const derived = writerCensus({ ...SRC_FILES, 'src/server/channels-access.js': withPrim, 'src/routes/channels.js': newRoute });
  ok(derived.writers.includes('widenRule') && derived.problems.some((x) => /^PUT \/api\/channels\/adapters\/:id\/patterns\/:pid\/widen: calls widenRule without asking/.test(x)), 'RED COPY: the writers are DERIVED — a new engine function writing grain rows (the one writer) joins the census by itself, and a route calling it with no gate is named', derived.problems);
  const other = writerCensus({ ...SRC_FILES, 'src/server/automation-engine.js': SRC_FILES['src/server/automation-engine.js'] + '\nasync function x(eng) { return eng.setFilter("a", "c", null); }\n' });
  ok(other.problems.some((x) => /automation-engine\.js x\(\): calls the grain writer setFilter\(\) outside a gated route/.test(x)), 'RED COPY: a second file calling a writer is named', other.problems);
  // r5 REDs: the webhook path verbs as 4b8896e7 had them (owner() alone), a gate after the write, a NEW routes file writing a wake field
  const cut = WH_SRC.replace(WH_GATE, '');
  const r4w = writerCensus({ ...SRC_FILES, [WEBHOOK]: cut });
  const named = r4w.problems.filter((x) => /webhook/.test(x));
  ok((WH_SRC.match(WH_GATE) || []).length === 7 && named.length === 6 && named.some((x) => /^PUT \/api\/channels\/webhook\/paths\/:slug: calls syncRow\b.* without asking/.test(x)) && named.some((x) => /its authority is POST \/api\/channels\/webhook\/paths\/:slug\/pair-code, which does not ask the gate/.test(x)), `RED COPY: the path verbs as 4b8896e7 had them (owner() only) — the census names all ${named.length}: ${named.map((x) => x.replace(/^src\/routes\/webhook\.js /, '').replace(/: (calls|its authority) .*$/, '').replace('/api/channels/webhook/', '…/')).join(' · ')}`, named);
  const late = writerCensus({ ...SRC_FILES, [WEBHOOK]: WH_SRC.replace("  if (pathRefused(req, res)) return;   // r5: disabled / ipAllow / wakesPerHour / title — what a held wake fires on\n", '').replace("    await syncRow(slug, ov.options);\n    res.json({ ok: true, path: pathView(st, slug) });\n  } catch (e) { bad(res, 500, (e && e.message) || 'failed', 'failed'); }\n});\n/** THE OWNER'S \"Send", "    await syncRow(slug, ov.options);\n    if (pathRefused(req, res)) return;\n    res.json({ ok: true, path: pathView(st, slug) });\n  } catch (e) { bad(res, 500, (e && e.message) || 'failed', 'failed'); }\n});\n/** THE OWNER'S \"Send") });
  ok(late.problems.some((x) => /^PUT \/api\/channels\/webhook\/paths\/:slug: asks the gate AFTER it calls syncRow/.test(x)), 'RED COPY: a path verb asking the gate only AFTER its write (inside its try, past the write) is named', late.problems.filter((x) => /webhook/.test(x)));
  const plantedFile = writerCensus({ ...SRC_FILES, 'src/routes/hooks-extra.js': "const router = require('express').Router();\nfunction touch(e, slug, o) { return e.store.index.update(() => { const en = e.store.index.entry('webhook', slug); en.options = o; }); }\nrouter.put('/api/channels/webhook/extra/:slug', async (req, res) => {\n  await touch(engine(), req.params.slug, req.body);\n  res.json({ ok: true });\n});\n" });
  ok(plantedFile.files.includes('src/routes/hooks-extra.js') && plantedFile.problems.some((x) => /^PUT \/api\/channels\/webhook\/extra\/:slug: calls touch\b.* without asking/.test(x)), 'RED COPY: a NEW routes file writing a field the engine reads for wakes (a path\'s options) joins the file list by itself — its route with no gate is named (never a hand list)', { files: plantedFile.files, problems: plantedFile.problems.slice(-2) });
  // r6 (主开发, attack (d)): ONE RED COPY PER SHAPE the line-spelled census missed — each a NEW routes file, each route NAMED
  const SHAPES = [
    ['an inline `en.participants =` inside a route\'s own index.update', { 'src/routes/hooks-p1.js': "const router = require('express').Router();\nrouter.put('/api/channels/webhook/p1/:slug', async (req, res) => {\n  await engine().store.index.update((ix) => { const en = ix.entries['webhook/' + req.params.slug]; en.participants = req.body.participants; });\n  res.json({ ok: true });\n});\n" }, /^PUT \/api\/channels\/webhook\/p1\/:slug: calls participants = without asking/],
    ['`entry.participants =` (not named en)', { 'src/routes/hooks-p1b.js': "const router = require('express').Router();\nrouter.put('/api/channels/webhook/p1b/:slug', async (req, res) => {\n  await engine().store.index.update((ix) => { const entry = ix.entries['webhook/' + req.params.slug]; entry.participants = req.body.participants; });\n  res.json({ ok: true });\n});\n" }, /^PUT \/api\/channels\/webhook\/p1b\/:slug: calls participants = without asking/],
    ['`Object.assign(en, {participants})`', { 'src/routes/hooks-p1c.js': "const router = require('express').Router();\nrouter.put('/api/channels/webhook/p1c/:slug', async (req, res) => {\n  await engine().store.index.update((ix) => { const en = ix.entries['webhook/' + req.params.slug]; Object.assign(en, { participants: req.body.participants }); });\n  res.json({ ok: true });\n});\n" }, /^PUT \/api\/channels\/webhook\/p1c\/:slug: calls Object\.assign\(…fields\) without asking/],
    ['a two-hop write through a helper MODULE (its calling route named, not only the helper\'s file)', { 'src/lib/path-facts.js': "function touchFacts(e, slug, p) { return e.store.index.update((ix) => { const en = ix.entries['webhook/' + slug]; en.participants = p; }); }\nmodule.exports = { touchFacts };\n", 'src/routes/hooks-p2.js': "const router = require('express').Router();\nconst PF = require('../lib/path-facts.js');\nrouter.put('/api/channels/webhook/p2/:slug', async (req, res) => {\n  await PF.touchFacts(engine(), req.params.slug, req.body.participants);\n  res.json({ ok: true });\n});\n" }, /^PUT \/api\/channels\/webhook\/p2\/:slug: calls touchFacts \(→ participants =\) without asking/],
    ['`ctx.getEngine().setWatchers(`', { 'src/routes/hooks-p3.js': "const router = require('express').Router();\nrouter.put('/api/channels/:adapterId/:convId/w3', async (req, res) => {\n  await ctx.getEngine().setWatchers(req.params.adapterId, req.params.convId, req.body.rows);\n  res.json({ ok: true });\n});\n" }, /^PUT \/api\/channels\/:adapterId\/:convId\/w3: calls setWatchers without asking/],
    ['`const ce = engine(); ce.setWatchers(`', { 'src/routes/hooks-p4.js': "const router = require('express').Router();\nrouter.put('/api/channels/:adapterId/:convId/w4', async (req, res) => {\n  const ce = engine();\n  await ce.setWatchers(req.params.adapterId, req.params.convId, req.body.rows);\n  res.json({ ok: true });\n});\n" }, /^PUT \/api\/channels\/:adapterId\/:convId\/w4: calls setWatchers without asking/],
  ];
  const shapes = SHAPES.map(([what, plant, re]) => { const c = writerCensus({ ...SRC_FILES, ...plant }); return { what, named: c.problems.some((x) => re.test(x)), joined: Object.keys(plant).every((f) => c.files.includes(f)), extra: c.problems.filter((x) => !c0.problems.includes(x)).slice(0, 3) }; });
  ok(shapes.every((x) => x.named && x.joined), `RED COPIES — the census over the AST names the ROUTE for every shape it missed (${shapes.length}): ${shapes.map((x) => x.what + (x.named ? ' ✓' : ' ✗')).join(' · ')}`, shapes);
  const shared = writerCensus({ ...SRC_FILES, 'src/routes/hooks-p6.js': "const router = require('express').Router();\nrouter.put('/api/exits/:id/access', async (req, res) => {\n  await exitProxy.setAccess(req.params.id, req.body, { by: 'user' });\n  res.json({ ok: true });\n});\n" });
  ok(c0.shared.includes('setAccess') && !shared.problems.some((x) => /hooks-p6|\/api\/exits\//.test(x)), `CONTROL: a writer NAME another engine also defines (derived: ${c0.shared.join(', ')}) counts only on a channels engine — an exit's setAccess is no channel write`, { shared: c0.shared, problems: shared.problems.filter((x) => /exits/.test(x)) });
}

// ── ⑩ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑩ A POINTER HIDES, NEVER DECIDES (r3) — an access request\'s item (and the Outbox\'s pointer): ✕ Hide only, the record «hidden»');
const J = (x) => JSON.stringify(x);
const tt3 = (x, p) => String(x).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));
const rctx3 = { t: tt3, nameFor: () => 'Channels', wordsOf: (i) => i.text, detailOf: (i) => i.detail || '', replyState: () => ({ show: false }), optionsOf: () => [] };
const ROW3 = await import(pathToFileURL(path.join(SRC, 'lib', 'user-todos-row.js')).href);
const rq = (o = {}) => ({ id: 'ut-rq00000001', sessionKey: 'channels', text: 'ops-agent requests access to Ops room', status: 'open', origin: 'channels', about: 'claude:c-ops', action: { type: 'open-channel', adapterId: 'lark', convId: 'oc_ops', key: 'lark/oc_ops' }, createdAt: NOW - 3600e3, resolvedAt: null, resolvedBy: null, ...o });
const plainItem = { id: 'ut-p', sessionKey: 'claude:c-ops', text: 'Which branch should I deploy?', status: 'open', urgency: 'normal', origin: 'agent', createdAt: NOW - 60e3 };
try {
  ok(J(FA.POINTER_ROWS) === '["open-channel"]' && FA.isPointer(rq()) && !FA.isDecisionRow(rq()) && FA.CLOSERS.includes('hide'), 'THE registry names its pointers (`closer: \'hide\'`): open-channel — the access request\'s item and the Outbox\'s pointer, each a door to where its question lives', FA.POINTER_ROWS);
  const cl = { open: FA.closersOf(rq()), hidden: FA.closersOf(rq({ status: 'dismissed', resolvedBy: 'hidden' })), decision: FA.closersOf(wr()), plain: FA.closersOf(plainItem), plainDone: FA.closersOf({ ...plainItem, status: 'done' }) };
  ok(J(cl) === J({ open: ['hide'], hidden: [], decision: [], plain: ['done', 'dismiss'], plainDone: ['reopen'] }), 'closersOf (one answer, every surface): a pointer ✕ Hide only and nothing once hidden; a decision row none; any other item ✓ ✕ / ↺', cl);
  const runStore = (registry) => {
    const { m, done } = storeWith(registry);
    try {
      const add = (o) => m.add('channels', { origin: 'channels', by: 'agent', sessionName: 'Channels', ...o });
      const p1 = add({ text: 'ops-agent requests access to Ops room', about: 'claude:c-ops', action: rq().action });
      m.setStatus(p1.id, 'done', 'user');   // ✓ — the button a stale page still draws
      const h1 = { ...m.get(p1.id) };
      const p2 = add({ text: 'Proposals awaiting approval in Ops room', action: { type: 'open-channel', adapterId: 'lark', convId: 'oc_ops', key: 'outbox-ptr' } });
      const many = m.setStatusMany([p2.id], 'dismissed', 'user');   // «Mark all seen»
      const p3 = add({ text: 'Proposals awaiting approval in Dev room', action: { type: 'open-channel', adapterId: 'lark', convId: 'oc_dev', key: 'lark/oc_dev' } });
      m.setStatus(p3.id, 'done', 'system');   // its producer retracts it
      const ans = m.resolveAnswered([p1.id], 'allowed', { decidedBy: 'person', decidedAt: NOW });   // decided in the Reach dialog while hidden
      return { h1: { status: h1.status, by: h1.resolvedBy, words: FA.settledWords(h1) }, many: { changed: many.changed.length, status: m.get(p2.id).status, by: m.get(p2.id).resolvedBy }, retracted: { status: m.get(p3.id).status, by: m.get(p3.id).resolvedBy }, answered: { ids: ans.length, status: m.get(p1.id).status, by: m.get(p1.id).resolvedBy, stamp: (FA.decidedStamp(m.get(p1.id), { now: NOW }) || {}).text || null } };
    } finally { done(); }
  };
  const g = runStore(FA);
  ok(g.h1.status === 'dismissed' && g.h1.by === 'hidden' && g.h1.words === 'hidden — nothing was decided', 'the person\'s ✓ on an access request\'s item is written as a HIDE — «hidden — nothing was decided», never «✓ done» (the request untouched)', g.h1);
  ok(g.many.changed === 1 && g.many.status === 'dismissed' && g.many.by === 'hidden', '«Mark all seen» hides a pointer too', g.many);
  ok(g.retracted.status === 'done' && g.retracted.by === 'system', 'CONTROL: its producer\'s own retraction stays its own (done · automatically — the Outbox pointer, test-channel-names F2)', g.retracted);
  ok(g.answered.ids === 1 && g.answered.status === 'done' && g.answered.by === 'allowed' && g.answered.stamp === 'approved by you · 10:05', 'a decision lands on a HIDDEN pointer (the Reach dialog decided it): «approved by you · 10:05» — the record says what was decided', g.answered);
  const red = runStore(registryFrom(read('src/foryou-actions.js').replace(", decide: 'person', closer: 'hide' },", ", decide: 'person' },")));
  ok(red.h1.status === 'done' && red.h1.by === 'user' && red.h1.words === 'done', 'RED CONTROL: the registry without the row\'s closer (the base) — ✓ records «done» by the user while the request stands open', red.h1);
  const L = await import(pathToFileURL(path.join(SRC, 'lib', 'inbox-window-layout.js')).href);
  const oh = ROW3.renderRow({ item: rq(), resolved: false, band: 5 }, rctx3).innerHTML;
  const hh = ROW3.renderRow({ item: rq({ status: 'dismissed', resolvedBy: 'hidden', resolvedAt: NOW }), resolved: true, tail: true }, rctx3).innerHTML;
  const rowV = { hide: /class="ut-act ut-dismiss ut-hide"[^>]*data-label="Hide">✕</.test(oh), done: /class="ut-act ut-done"/.test(oh), reopen: /ut-reopen/.test(hh), meta: (/<div class="ut-meta">([\s\S]*?)<\/div>/.exec(hh) || [])[1] || '' };
  ok(rowV.hide && !rowV.done && !rowV.reopen && /hidden — nothing was decided/.test(rowV.meta) && !/\bdone\b/.test(rowV.meta), 'the tray row (and the chat card — one renderer): an open access request draws ✕ «Hide» and no ✓; its hidden record «hidden — nothing was decided», no ↺', rowV);
  const ictx = (item) => ({ t: tt3, words: item.text, detail: '', name: 'Channels', origin: { origin: 'channels', label: 'Channels' }, notice: false, reply: { show: false }, ago: () => '', expires: () => '', resolvedBy: () => '', statusWords: (i) => ROW3.statusWords(i, tt3), closers: FA.closersOf(item) });
  const hiddenRq = rq({ status: 'dismissed', resolvedBy: 'hidden', resolvedAt: NOW });
  const wv = { open: L.itemView(rq(), ictx(rq())).actions, hidden: L.itemView(hiddenRq, ictx(hiddenRq)).actions, status: L.itemView(hiddenRq, ictx(hiddenRq)).meta.find((x) => x.kind === 'status').text };
  ok(J(wv) === J({ open: ['hide', 'copy'], hidden: ['copy'], status: 'hidden — nothing was decided' }), 'the For-you window: «Hide» in place of Mark done / Dismiss, nothing once hidden, its status «hidden — nothing was decided»', wv);
  const UA = read('src/lib/user-todos-actions.js');
  ok(/const hide = isPointer\(byId\(id\)\);/.test(UA) && /if \(ok && hide\) \{ showToast\(t\('Hidden — nothing was decided; it comes back while it is still open'\), \{ duration: 6000 \}\); return ok; \}/.test(UA), 'the press says it — «Hidden — nothing was decided; it comes back while it is still open» — with NO Undo (it comes back by itself)');
} catch (e) { ok(false, '⑩ threw on this tree (an API it asks for is missing): ' + ((e && e.message) || e)); }

// ── ⑪ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑪ A WAKE ASK HAS A LIFETIME (r3) — the card\'s and the tray row\'s «expires in 7 d»');
try {
  const DAY = 86400e3;
  const F7 = require(path.join(SRC, 'channel-filter.js'));
  const run = { ...wr(), action: { type: 'vault-run-ask', askId: 'a'.repeat(32) }, expiresAt: NOW + 60e3 };
  const words = { week: FA.expiryWords(wr({ expiresAt: NOW + 7 * DAY }), { now: NOW }), day6: FA.expiryWords(wr({ expiresAt: NOW + 7 * DAY }), { now: NOW + 6 * DAY }), h: FA.expiryWords(wr({ expiresAt: NOW + 23 * 3600e3 }), { now: NOW }), min: FA.expiryWords(wr({ expiresAt: NOW + 30 * 60e3 }), { now: NOW }),
    closed: FA.expiryWords(wr({ expiresAt: NOW + DAY, status: 'done', resolvedBy: 'denied' }), { now: NOW }), past: FA.expiryWords(wr({ expiresAt: NOW - 1 }), { now: NOW }), heldAsk: FA.expiryWords(run, { now: NOW }) };
  ok(J(words) === J({ week: 'expires in 7 d', day6: 'expires in 1 d', h: 'expires in 23 h', min: 'expires in 30 min', closed: null, past: null, heldAsk: null }), 'expiryWords: «expires in 7 d» at filing, «1 d» on day 6, hours and minutes near its end; nothing for a closed ask, a past end, or a row that says its own (a held ask\'s 60 s)', words);
  ok(F7.WATCH_REQUEST_TTL_MS === 7 * DAY && FA.ROW_OF['channel-watch-request'].showsExpiry === true, 'the lifetime is ONE number (src/channel-filter.js WATCH_REQUEST_TTL_MS = 7 days); the row says its end (`showsExpiry`)', F7.WATCH_REQUEST_TTL_MS);
  const html = ROW3.renderRow({ item: wr({ expiresAt: Date.now() + 7 * DAY - 60e3, createdAt: Date.now() - 60e3 }), resolved: false, band: 5 }, rctx3).innerHTML;
  ok(/expires in 7 d/.test(html) && ROW3.expiresText(Date.now() + 7 * DAY - 60e3, tt3) === 'expires in 7 d', 'the tray row (and the chat card — one renderer) says «expires in 7 d»; the For-you window\'s expiry words say days too', (/<div class="ut-meta">([\s\S]*?)<\/div>/.exec(html) || [])[1]);
  const RED = registryFrom(read('src/foryou-actions.js').replace(", ends: ['allowed', 'denied', 'expired'], showsExpiry: true },", ", ends: ['allowed', 'denied', 'expired'] },"));
  ok(RED.expiryWords(wr({ expiresAt: NOW + 7 * DAY }), { now: NOW }) === null, 'RED CONTROL: the row without `showsExpiry` (the base) — the card says nothing of its end');
} catch (e) { ok(false, '⑪ threw on this tree (an API it asks for is missing): ' + ((e && e.message) || e)); }

// ── ⑫ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑫ THE VAULT\'S TWO ASKS AND THE HUB-ACT ASK — cards in the asking chat, decided by a person, their own verbs (r3)');
try {
  const ME = ['claude:c-ops', 'webui:sess-ops'];   // the asking chat's keys (keysForWin)
  const askOf = { runAsk: { id: 'ut-run0000001', sessionKey: 'claude:c-ops', text: 'ops asks to run a command with a vault secret', status: 'open', urgency: 'urgent', origin: 'vault', kind: 'action', action: { type: 'vault-run-ask', askId: 'a'.repeat(32), always: true }, createdAt: NOW - 30e3, expiresAt: NOW + 30e3 },
    paste: { id: 'ut-sec0000001', sessionKey: 'claude:c-ops', text: 'ops asks you for a secret: UniFi UCG-Fiber local admin', status: 'open', urgency: 'high', origin: 'vault', kind: 'action', action: { type: 'secret-request', requestId: 'sr-0123456789ab', into: '', kind: 'password', conv: 'c-ops', scope: 'sess-ops' }, createdAt: NOW - 20e3 },
    hubAct: { id: 'ut-hub0000001', sessionKey: 'machines', about: 'claude:c-ops', text: 'ops wants to run a command on mac1', status: 'open', urgency: 'urgent', origin: 'machines', kind: 'action', action: { type: 'hub-act-ask', askId: 'b'.repeat(32), hostId: 'h1', machine: 'mac1', kind: 'run' }, createdAt: NOW - 10e3, expiresAt: NOW + 50e3 } };
  const rows = Object.fromEntries(['vault-run-ask', 'secret-request', 'hub-act-ask'].map((t) => { const r = FA.ROW_OF[t]; return [t, { chat: r.chat, card: r.card, decide: r.decide, scope: r.scope, stamp: r.stamp }]; }));
  ok(J(rows) === J({ 'vault-run-ask': { chat: true, card: 'row', decide: 'person', scope: 'conversation', stamp: 'allow' }, 'secret-request': { chat: true, card: 'row', decide: 'person', scope: 'conversation', stamp: 'store' }, 'hub-act-ask': { chat: true, card: 'row', decide: 'person', scope: 'about', stamp: 'allow' } }), 'THE registry rows: each a card in the chat (one renderer), decided by a person only; the run ask and the paste request filed under the asking conversation\'s own key, the hub-act ask `about` it', rows);
  const drawn = FA.needsOf(Object.values(askOf), ME).map((e) => e.item.action.type);
  ok(J(drawn) === J(['vault-run-ask', 'secret-request', 'hub-act-ask']), 'the asking chat draws all three where their producers file them (the hub-act ask by its `about`) — never the tray only', drawn);
  const HA = read('src/server/hub-act-ask.js');
  ok(/let about = null; try \{ about = P\.byKindOf\(by\) === 'agent' \? aboutOf\(by\) : null; \} catch \{ \}/.test(HA) && /\.\.\.\(about \? \{ about \} : \{\}\),/.test(HA) && /aboutOf: \(by\) => \{/.test(HA), 'src/server/hub-act-ask.js files an AGENT\'s act `about` the conversation that asked (wire()\'s aboutOf — test-hub-act-ask drives it on the real asker)');
  const mark = { decidedBy: 'person', decidedAt: NOW - 60e3 };
  const st = (it, by, fact = mark) => (FA.decidedStamp({ ...it, status: 'done', resolvedBy: by, resolvedAt: NOW, resolvedFact: fact }, { now: NOW }) || {}).text || null;
  const stamps = { once: st(askOf.runAsk, 'allowed'), always: st(askOf.runAsk, 'always'), deny: st(askOf.hubAct, 'denied'), hubOnce: st(askOf.hubAct, 'allowed'), stored: st(askOf.paste, 'stored'), refused: st(askOf.paste, 'denied'), expired: st(askOf.runAsk, 'ask-expired'), noMark: st(askOf.runAsk, 'allowed', null) };
  ok(J(stamps) === J({ once: 'allowed by you · 10:04', always: 'always allowed by you · 10:04', deny: 'denied by you · 10:04', hubOnce: 'allowed by you · 10:04', stored: 'stored · 10:04', refused: 'refused by you · 10:04', expired: null, noMark: null }), 'the decided stamps: «allowed by you · HH:MM» / «always allowed by you» / «denied by you» (the held asks), «stored · HH:MM» / «refused by you» (the paste request) — only with the person verdict\'s mark; an end is no stamp', stamps);
  const law = (registry) => {
    const { m, done } = storeWith(registry);
    try {
      const add = (it) => m.add(it.sessionKey, { origin: it.origin, by: 'agent', text: it.text, urgency: it.urgency, action: it.action, ...(it.about ? { about: it.about } : {}) });
      const tryS = (id, s2, by) => { try { m.setStatus(id, s2, by); return 'ok'; } catch (e) { return e.code || e.message; } };
      const a = add(askOf.runAsk), b = add(askOf.paste), c = add(askOf.hubAct);
      const r = { check: tryS(a.id, 'done', 'user'), seen: m.setStatusMany([b.id, c.id], 'dismissed', 'user').decisions.length, own: tryS(c.id, 'done', 'ask-over'), stored: m.resolveAnswered([b.id], 'stored', mark).length };
      r.reopen = tryS(b.id, 'open', 'user');
      r.expire = tryS(a.id, 'done', 'ask-expired');
      return r;
    } finally { done(); }
  };
  const g = law(FA);
  ok(J(g) === J({ check: 'decision_row', seen: 2, own: 'ok', stored: 1, reopen: 'decision_final', expire: 'ok' }), 'the store law per row\'s ends: ✓ on a run ask refused by name (decision_row), «Mark all seen» passes the paste request and the hub-act ask by; their producers\' own ends close them (ask-over, the 60 s, stored); a decision is final', g);
  // (a paste request's row appends its box as DOM nodes — the node stub gets an element that takes them, then is put back)
  const docCE = globalThis.document.createElement;
  const boxEl = () => { const e = docCE(); return Object.assign(e, { append() {}, querySelector: (q) => (q === ':scope > .ut-body' ? { append() {} } : null) }); };
  const cls = (it) => { globalThis.document.createElement = boxEl; let h; try { h = ROW3.renderRow({ item: it, resolved: false, band: 1 }, rctx3).innerHTML; } finally { globalThis.document.createElement = docCE; } return { closers: [...h.matchAll(/class="ut-act (ut-done|ut-dismiss|ut-reopen)/g)].map((x) => x[1]), own: [...h.matchAll(/data-answer="(\w+)"/g)].map((x) => x[1]) }; };
  const drawnV = { runAsk: cls(askOf.runAsk), paste: cls(askOf.paste), hubAct: cls(askOf.hubAct) };
  ok(drawnV.runAsk.closers.length === 0 && drawnV.paste.closers.length === 0 && drawnV.hubAct.closers.length === 0 && drawnV.runAsk.own.length >= 2 && drawnV.hubAct.own.length >= 2, 'the row (the tray, the chat card): the held asks draw their own Allow once / Always / Deny and NO ✓ / ✕; the paste request its box and NO ✓ / ✕', drawnV);
  const VBX = read('src/lib/vault-paste-box.js');
  ok(/const note = mk\('div', 'ut-secret-note', t\('Wrong name or kind\? Refuse — the agent can ask again with the right one\.'\)\);/.test(VBX) && /box\.append\(row, note, state\);/.test(VBX), 'the paste box (the tray row and the chat card — one box) says «Wrong name or kind? Refuse — the agent can ask again with the right one.»');
  const base = registryFrom(read('src/foryou-actions.js').replace(/(\{ type: '(?:vault-run-ask|hub-act-ask|secret-request)'[^\n]*?), decide: 'person', ends: \[[^\]]*\], stamp: '\w+' \}/g, '$1 }').replace("chat: true, kind: 'approval', scope: 'about' }", "chat: true, kind: 'approval', scope: 'group' }"));
  const baseHub = { ...askOf.hubAct }; delete baseHub.about;   // the base's hub-act ask: filed under Machines, naming no conversation
  const rb = law(base);
  const redV = { drawn: base.needsOf([askOf.runAsk, askOf.paste, baseHub], ME).map((e) => e.item.action.type), check: rb.check, stamp: (base.decidedStamp({ ...askOf.runAsk, status: 'done', resolvedBy: 'allowed', resolvedFact: mark }, { now: NOW }) || {}).text || null, decision: base.isDecisionRow(askOf.runAsk), scope: base.ROW_OF['hub-act-ask'].scope };
  ok(J(redV) === J({ drawn: ['vault-run-ask', 'secret-request'], check: 'ok', stamp: null, decision: false, scope: 'group' }), 'RED CONTROL: the rows as the base had them — the hub-act ask (filed as the base filed it) is drawn in no chat, ✓ closes a run ask «done», no «allowed by you»', redV);
} catch (e) { ok(false, '⑫ threw on this tree (an API it asks for is missing): ' + ((e && e.message) || e)); }

// ── ⑬ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑬ ROUND 4 — an ask past its end answers ONE way (409 «expired on <date>»); the vault\'s grant request is a decision row');
try {
  // (a) the decide route maps the engine's `expired` to a 409 (test-channel-agent-watch ④d drives the real engine both sides of the sweep)
  const END = NOW + 7 * 864e5;
  const pressExpired = async (mod) => {
    mod.setup({ getEngine: () => ({ decideRequest: async () => ({ ok: false, code: 'expired', expiredAt: END, error: 'this request expired on 2026-11-03 10:05 PT — the agent can ask again' }) }) });
    const S = await listen(mod);
    try { return await S.send('POST', '/api/channels/reach-requests/wr-x/approve', { 'Sec-Fetch-Site': 'same-origin' }); } finally { await S.close(); }
  };
  const e1 = await pressExpired(routerFrom(REAL_SRC));
  ok(e1.status === 409 && e1.code === 'expired' && /^this request expired on .* — the agent can ask again$/.test(e1.error || ''), 'the decide route: an ask past its end ⇒ 409 `expired` with its words (never a 500)', e1);
  const MAP = " || code === 'expired' || code === 'placement-not-offered' ? 409";
  const e0 = REAL_SRC.split(MAP).length === 2 ? await pressExpired(routerFrom(REAL_SRC.replace(MAP, " || code === 'placement-not-offered' ? 409"))) : null;
  ok(e0 && e0.status === 500, 'RED CONTROL: answer3 without the mapping (bec3e3f8) — the same press ⇒ HTTP 500', e0);
  // (b) the page words it in the owner's language, from its end
  const ACT = read('src/lib/user-todos-actions.js');
  ok(/\(r && r\.code === 'expired'\) \? t\('This request expired on \{date\} — the agent can ask again', \{ date: clockWords\(r\.expiredAt\) \}\)/.test(ACT), 'the page (the chat card and the tray — one press road) toasts «This request expired on {date} — the agent can ask again», its date from `expiredAt` (THE registry\'s clockWords)');
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  const KEYS = ['This request expired on {date} — the agent can ask again', 'allowed once by you', 'allowed by you for 8 h', 'allowed for 8 hours', 'allowed once'];
  const missing = KEYS.filter((k) => !ZH.includes(JSON.stringify(k) + ':') || !JA.includes(JSON.stringify(k) + ':'));
  ok(!missing.length, `the new words are in zh and ja (${KEYS.length} keys)`, missing);
  // (c) vault-grant-ask: THE third vault card in the same chat (Allow once / For 8 hours / Deny) is a DECISION ROW
  const grant = { id: 'ut-grt0000001', sessionKey: 'claude:c-ops', text: 'ops asks to use a stored secret', detail: 'Secret: bucket — vault://mounts/m1/secretKey', status: 'open', urgency: 'high', origin: 'vault', kind: 'action', action: { type: 'vault-grant-ask', askId: 'c'.repeat(32) }, createdAt: NOW - 30e3 };
  const row = FA.ROW_OF['vault-grant-ask'];
  ok(row.decide === 'person' && row.stamp === 'grant' && J(FA.endsOf(grant)) === J(['granted', 'denied', 'vault_locked', 'ask-changed', 'ask-over']) && FA.isDecisionRow(grant) && J(FA.closersOf(grant)) === '[]', 'THE registry: vault-grant-ask decided by a person, its own ends (Allow once / For 8 hours / Deny + a lock, a changed card, an ask that is over), no ✓ / ✕ (closersOf [])', { decide: row.decide, stamp: row.stamp, ends: FA.endsOf(grant) });
  const mark = { decidedBy: 'person', decidedAt: NOW - 60e3 };
  const st = (by, fact = mark) => (FA.decidedStamp({ ...grant, status: 'done', resolvedBy: by, resolvedAt: NOW, resolvedFact: fact }, { now: NOW }) || {}).text || null;
  const g8 = { ...mark, grantedFor: '8h', until: NOW + 7 * 3600e3 };   // r6: the record stays `granted` + its facts (grantedFor, until)
  const stamps = { once: st('granted', { ...mark, grantedFor: 'once', until: NOW + 7 * 3600e3 }), h8: st('granted', g8), deny: st('denied'), locked: st('vault_locked'), noMark: st('granted', { grantedFor: '8h', until: NOW + 7 * 3600e3 }), card: FA.decisionCard({ ...grant, status: 'done', resolvedBy: 'granted', resolvedFact: g8 }, { now: NOW }).state };
  ok(J(stamps) === J({ once: 'allowed once by you · 10:04', h8: 'allowed by you for 8 h · 10:04', deny: 'denied by you · 10:04', locked: null, noMark: null, card: 'approved' }), 'its stamps: «allowed once by you · HH:MM», «allowed by you for 8 h · HH:MM», «denied by you · HH:MM» — only with the person verdict\'s mark; a lock is no stamp', stamps);
  const lawG = (registry) => {
    const { m, done } = storeWith(registry);
    try {
      const it = m.add(grant.sessionKey, { origin: 'vault', by: 'agent', text: grant.text, urgency: 'high', action: grant.action });
      const tryS = (s2, by) => { try { m.setStatus(it.id, s2, by); return 'ok'; } catch (e) { return e.code || e.message; } };
      const r = { check: tryS('done', 'user'), seen: m.setStatusMany([it.id], 'dismissed', 'user').changed.length, status: m.get(it.id).status };
      r.granted = m.resolveAnswered([it.id], 'granted', { ...mark, grantedFor: '8h', until: NOW + 7 * 3600e3 }).length;   // r6: the For 8 hours end — `granted` + its facts
      r.reopen = tryS('open', 'user');
      return r;
    } finally { done(); }
  };
  const lg = lawG(FA);
  ok(J(lg) === J({ check: 'decision_row', seen: 0, status: 'open', granted: 1, reopen: 'decision_final' }), 'the store law: ✓ refused by name (decision_row — was a silent Deny with a dead Undo), «Mark all seen» passes it by, For 8 hours ends it, a decision is final', lg);
  const docCE = globalThis.document.createElement;
  const boxEl = () => { const e = docCE(); return Object.assign(e, { append() {}, querySelector: () => null }); };
  const drawG = (R, it) => { globalThis.document.createElement = boxEl; let h; try { h = R.renderRow({ item: it, resolved: false, band: 1 }, rctx3).innerHTML; } finally { globalThis.document.createElement = docCE; } return { closers: [...h.matchAll(/class="ut-act (ut-done|ut-dismiss|ut-reopen)/g)].map((x) => x[1]), own: [...h.matchAll(/data-answer="(\w+)"/g)].map((x) => x[1]) }; };
  const dv = drawG(ROW3, grant);
  ok(dv.closers.length === 0 && J(dv.own) === J(['once', '8h', 'deny']), `the row (the tray, the chat card — one renderer): its own three verbs ${J(dv.own)} and NO ✓ / ✕`, dv);
  // RED CONTROL: the row as bec3e3f8 had it (no decide) — ✓ / ✕ drawn, ✓ closes it «done» by the user (the press then denies it silently)
  const baseG = registryFrom(read('src/foryou-actions.js').replace(/(\{ type: 'vault-grant-ask'[^\n]*?scope: 'conversation'), decide: 'person', ends: \[[^\]]*\], stamp: 'grant' \}/, '$1 }'));
  const rg = lawG(baseG);
  ok(!baseG.isDecisionRow(grant) && J(baseG.closersOf(grant)) === J(['done', 'dismiss']) && rg.check === 'ok' && (baseG.decidedStamp({ ...grant, status: 'done', resolvedBy: 'granted', resolvedFact: mark }, { now: NOW }) || null) === null, 'RED CONTROL: the row as bec3e3f8 had it — ✓ / ✕ offered, ✓ closes the request «done» by the user, no «allowed by you for 8 h»', { closers: baseG.closersOf(grant), check: rg.check });
} catch (e) { ok(false, '⑬ threw on this tree (an API it asks for is missing): ' + ((e && e.stack) || e)); }

// ── ⑭ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑭ ROUND 5 — «held» is read by THE reader that fires (every stored wake row, active or inert); a record says only what was decided');
try {
  const F14 = require(path.join(SRC, 'channel-filter.js'));
  const W8 = { kind: 'agent', id: 'agent-1', name: 'Worker' }, O8 = { kind: 'agent', id: 'agent-2', name: 'Other' };
  const a8 = (p) => ({ principal: p, authority: 'draft' });
  // (a) PURE — the reviewer's fixture: the account's access [Worker, Other]; rule «Ops» with access [Other] and Notify Worker
  const acct = { access: [a8(W8), a8(O8)], watchers: [] };
  const rule = { id: 'pa-ops', pattern: { match: 'any', rules: [{ kind: 'title', value: 'Ops' }] }, createdAt: 1, access: [a8(O8)], watchers: [{ principal: W8, delivery: 'wake' }] };
  const ids = (xs) => xs.map((w) => w.principal.id);
  const live = F14.grainAsFired('pattern', rule, { account: acct });
  const off = F14.grainAsFired('pattern', rule, { account: { access: [a8(O8)], watchers: [] } });   // the owner took Worker off the account
  const fired = F14.effectiveGrants({ patterns: [rule], account: acct }, { title: 'Ops' });
  const r14a = { live: [ids(live.watchers), ids(live.stored), ids(live.inert)], off: [ids(off.watchers), ids(off.stored), ids(off.inert)], fired: fired ? fired.watchers.map((x) => `${x.source}:${x.watcher.principal.id}`) : [] };
  ok(J(r14a) === J({ live: [['agent-1'], ['agent-1'], []], off: [[], ['agent-1'], ['agent-1']], fired: ['pattern:agent-1'] }), 'THE ONE READER (F.grainAsFired): the rule read WITH the account\'s access — Worker\'s wake in effect (and effectiveGrants fires it, through the same reader); the account\'s access taken away — the row stays STORED, inert', r14a);
  ok(J(ids(F14.grainOf(rule).watchers)) === '[]', 'RED CONTROL: round 4\'s read of the rule (`F.grainOf(pa)` — no inherited access) drops the live wake: «not held»', ids(F14.grainOf(rule).watchers));
} catch (e) { ok(false, '⑭ (a) threw on this tree (an API it asks for is missing): ' + ((e && e.message) || e)); }
try {
  // (b) THE ONE-READER CENSUS over the engine's source: every road that asks «held», writes a grain or draws its lists reads it
  // through readGrainHolder (→ F.grainAsFired); none reads a holder through the narrower F.grainOf; «held» counts the STORED rows
  // r6: + the rows BELOW a grain (wakesBelow), a write's before / after (wakeRowsNow), the agent's watch list (agentWatchesFor)
  // and the engine's three boot censuses (orphanWatchers, capZeroDigests, deprecatedReceiptWakes — through eachRowInEffect)
  const ROADS = ['convGrainOf', 'readGrainHolder', 'grainReadAt', 'ownWakes', 'wakesBelow', 'wakeRowsNow', 'wakeNamesFilter', 'setGrain', 'grainView', 'storedWatcherFor', 'removePattern', 'setScopeAssignment', 'agentWatchesFor', 'orphanWatchers', 'eachRowInEffect', 'capZeroDigests', 'deprecatedReceiptWakes'];
  const oneReader = (E, FS, G = read('src/server/channels-engine.js')) => {
    const fns = fnsOf(E + '\n' + G), byName = Object.fromEntries(fns.map((f) => [f.name, f.body]));
    const bad = [];
    for (const n of ROADS) {
      const b = byName[n];
      if (b === undefined) { bad.push(`${n}: missing`); continue; }
      if (/\bF\.grainOf\(/.test(b)) bad.push(`${n}: reads a grain through F.grainOf (a narrower view)`);
      if (n !== 'readGrainHolder' && !/(?<![\w.])(readGrainHolder|grainReadAt|heldRead|eachRowInEffect)\(/.test(b)) bad.push(`${n}: never reaches the one reader`);
    }
    if (!/F\.grainAsFired\(/.test(byName.readGrainHolder || '')) bad.push('readGrainHolder: does not read through F.grainAsFired');
    if (!/wakesIn\(g\.stored\)/.test(byName.ownWakes || '')) bad.push('ownWakes: does not count every STORED wake row');
    if (!/(?<![\w.])ownWakes\(/.test(byName.wakeHeldAt || '') || !/(?<![\w.])wakesBelow\(/.test(byName.wakeHeldAt || '')) bad.push('wakeHeldAt: does not ask its own rows AND the rows below it');
    const eff = (/function effectiveGrants\([\s\S]*?\n\}\n/.exec(FS) || [''])[0];
    if ((eff.match(/grainAsFired\('(account|pattern|conversation)'/g) || []).length !== 3 || /\bgrainOf\(/.test(eff)) bad.push('effectiveGrants: its three grains are not read through grainAsFired');
    return bad;
  };
  const E14 = read('src/server/channels-access.js'), FS14 = read('src/channel-filter.js');
  const b14 = oneReader(E14, FS14);
  ok(!b14.length, `THE ONE-READER CENSUS: ${ROADS.length} roads of the engine (${ROADS.join(', ')}) read a grain through readGrainHolder → F.grainAsFired — the reader effectiveGrants fires with; «held» counts every stored wake row`, b14);
  const narrowSet = oneReader(E14.replace('    const rd = readGrainHolder(adapterId, kind, site.holder);\n', '    const rd = site.holder ? { ...F.grainOf(site.holder), inert: [] } : null;\n'), FS14);
  const activeOnly = oneReader(E14.replace('const own = wakesIn(g.stored);', 'const own = wakesIn(g.watchers);'), FS14);
  ok(narrowSet.some((x) => /^setGrain: reads a grain through F\.grainOf/.test(x)) && activeOnly.some((x) => /^ownWakes: does not count every STORED/.test(x)), 'RED COPIES: a writer reading the holder through F.grainOf (round 4\'s setGrain), a «held» counting only the rows in effect (round 4\'s — an inert wake read «not held») — each named', { narrowSet, activeOnly });
} catch (e) { ok(false, '⑭ (b) threw on this tree: ' + ((e && e.message) || e)); }
try {
  // (c) A RECORD SAYS ONLY WHAT WAS DECIDED: an old `granted` (Allow once and For 8 hours both wrote it before .360) ⇒ «allowed»;
  // r6: the record STAYS `granted` (every reader knows it) with its facts — `grantedFor` names the duration
  const tI = (x, p) => String(x).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));
  const old = { ...grantItem14(), status: 'done', resolvedBy: 'granted', resolvedAt: NOW };
  const withFor = (gf) => ({ ...old, resolvedFact: { grantedFor: gf, until: NOW + 7 * 3600e3 } });
  const words = (it) => [FA.settledWords(it, tI), ROW3.resolvedByText(it.resolvedBy, tI, it)];
  const r14c = { old: [...words(old), FA.decisionCard(old, { now: NOW }).stamp], h8: words(withFor('8h')), once: words(withFor('once')) };
  ok(J(r14c) === J({ old: ['allowed', 'allowed', 'allowed'], h8: ['allowed for 8 hours', 'allowed for 8 hours'], once: ['allowed once', 'allowed once'] }), 'a stored {resolvedBy: \'granted\'} with no duration (before .360 — either verb) reads «allowed» on the card, the tray and the For-you window; a record carrying `grantedFor` says «allowed for 8 hours» / «allowed once»', r14c);
  const ZH14 = read('src/lib/i18n-zh.js');
  ok(/\n {2}"allowed": "已允许",/.test(ZH14), 'zh: «allowed» = «已允许»');
  const DOOR = read('src/server/vault-run-door.js');
  ok(/const grantedFor = a === 'once' \? 'once' : '8h';\n {4}settleRequest\(q, 'granted', 'answered', \{ \.\.\.\(mark\(\) \|\| \{\}\), grantedFor, until \}\);\n {4}return \{ ok: true, outcome: a === 'once' \? 'granted-once' : 'granted', grantedFor, until \};/.test(DOOR) && !/'granted-8h'/.test(DOOR), 'r6: the door writes `granted` (the value every reader names) + `grantedFor` / `until` on the record, and answers the outcome the production client toasts (`granted-once` / `granted`) + the same `grantedFor` — never `granted-8h`');
} catch (e) { ok(false, '⑭ threw on this tree (an API it asks for is missing): ' + ((e && e.stack) || e)); }
function grantItem14() { return { id: 'ut-grt0000002', sessionKey: 'claude:c-ops', text: 'ops asks to use a stored secret', status: 'open', origin: 'vault', kind: 'action', action: { type: 'vault-grant-ask', askId: 'd'.repeat(32) }, createdAt: NOW - 30e3 }; }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
