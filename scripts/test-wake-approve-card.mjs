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
//   ⑮ ROUND 7 — the vault-run card reads as FACTS (the owner: «这个卡片的可读性很差»): the shared fixture's three variants worded
//     by THE model (runCardOf) in en / zh / ja — headline → the command's own box → ≤ 4 rows, the deciding one first and marked
//     → 允许一次 (primary) · 拒绝 with the «Always» hint in their row → «技术细节»; every closed code with zh + ja words, an
//     unknown one monospace; a record WITHOUT facts draws today's prose byte for byte; a CARD WITH A DEADLINE SHOWS IT (a
//     fake clock at +0 / +50 / +61 s, the ticker), a late run card stays answerable, an end stays in words. RED CONTROL:
//     98b6fdf7 has no facts renderer, no deadline, and words an unanswered ask «expired (no answer in 60 s)». r8: the deadline
//     counts by the HUB's clock (noteHubClock / hubNow — a device 61 s fast or 45 s slow) and never withdraws an answer
//   ⑯ ROUND 8 — a store clips and says, never throws (facts strings 1 999 … 5 000: cmdCut + cmdFull + `cut`, every one filed;
//     the card's cut line and its fold); the late card's settles as vault-agent-own 4ff55fb4's door writes them
//     (scripts/fixtures/vault-run-late-settles.json) through the store and the reader, beside the ruled shape; an end this client
//     cannot classify «结果未知 · <code>»; the press reads a late Allow. RED CONTROL: 2a5e9ce8 threw from 2 001 characters and
//     skipped every late settle (the card stayed open with its buttons)
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
    .replace(/^    if \(wakeRefused\(req, res, (?:accountGrain|ruleGrain|convGrain)\(req\)\)\) return;[^\n]*\n/gm, '')
    .replace(/^    if \(wakeRefused\(req, res, \{ \.\.\.(?:accountGrain|ruleGrain|convGrain)\(req\), proposed: [^\n]*\}\)\) return;[^\n]*\n/gm, '');   // r8: the account access route names its whole new list
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
/** `parents` is ONE stack pushed and popped along the walk (a visitor reads it synchronously, never keeps it) — a copy per
 *  node made the census quadratic in the depth (835 ms of the suite's 2.1 s, measured r9) */
function walkAst(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parents) === false) return;
  parents.push(node);
  for (const k in node) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walkAst(c, visit, parents); } else if (v && typeof v.type === 'string') walkAst(v, visit, parents);
  }
  parents.pop();
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
const WH_GATE = /^ {2,4}if \(pathRefused\(req, res[^\n]*\)\) (?:return;|\{[^\n]*return; \})[^\n]*\n/gm;   // r9: + the join's judgement AT THE WRITE (a refusal that also writes its journal line)
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
  const withFor = (gf) => ({ ...old, resolvedFact: { grantedFor: gf, until: Date.now() + 7 * 3600e3 } });   // r7: its end is AHEAD of the clock the words read (a fixed NOW + 7 h passed on 2026-10-28)
  const words = (it) => [FA.settledWords(it, tI), ROW3.resolvedByText(it.resolvedBy, tI, it)];
  const r14c = { old: [...words(old), FA.decisionCard(old, { now: NOW }).stamp], h8: words(withFor('8h')), once: words(withFor('once')) };
  ok(J(r14c) === J({ old: ['allowed', 'allowed', 'allowed'], h8: ['allowed for 8 hours', 'allowed for 8 hours'], once: ['allowed once', 'allowed once'] }), 'a stored {resolvedBy: \'granted\'} with no duration (before .360 — either verb) reads «allowed» on the card, the tray and the For-you window; a record carrying `grantedFor` says «allowed for 8 hours» / «allowed once»', r14c);
  const ZH14 = read('src/lib/i18n-zh.js');
  ok(/\n {2}"allowed": "已允许",/.test(ZH14), 'zh: «allowed» = «已允许»');
  const DOOR = read('src/server/vault-run-door.js');
  ok(/const grantedFor = a === 'once' \? 'once' : '8h';\n {4}settleRequest\(q, 'granted', 'answered', \{ \.\.\.\(mark\(\) \|\| \{\}\), grantedFor, until \}\);\n {4}return \{ ok: true, outcome: a === 'once' \? 'granted-once' : 'granted', grantedFor, until \};/.test(DOOR) && !/'granted-8h'/.test(DOOR), 'r6: the door writes `granted` (the value every reader names) + `grantedFor` / `until` on the record, and answers the outcome the production client toasts (`granted-once` / `granted`) + the same `grantedFor` — never `granted-8h`');
} catch (e) { ok(false, '⑭ threw on this tree (an API it asks for is missing): ' + ((e && e.stack) || e)); }
function grantItem14() { return { id: 'ut-grt0000002', sessionKey: 'claude:c-ops', text: 'ops asks to use a stored secret', status: 'open', origin: 'vault', kind: 'action', action: { type: 'vault-grant-ask', askId: 'd'.repeat(32) }, createdAt: NOW - 30e3 }; }

// ── ⑮ ROUND 7 ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑮ ROUND 7 — the run card reads as facts in the viewer\'s language; a card with a deadline shows it; a late run card stays answerable');
try {
  const DICT = { zh: (await import(pathToFileURL(path.join(SRC, 'lib', 'i18n-zh.js')).href)).default, ja: (await import(pathToFileURL(path.join(SRC, 'lib', 'i18n-ja.js')).href)).default };   // the dictionaries the page loads
  const missed = new Set();
  const tOf = (l) => (s, p) => { const d = l === 'en' ? null : DICT[l]; if (d && !(s in d)) missed.add(`${l}: ${s}`); return String((d && d[s]) || s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m)); };
  const T = { en: tOf('en'), zh: tOf('zh'), ja: tOf('ja') };
  const FX = JSON.parse(read('scripts/fixtures/vault-run-card-facts.json'));
  const V = Object.fromEntries((FX.variants || []).map((v) => [v.name, v.facts]));
  // (a) THE CONTRACT (主开发 2026-10-27 + the 23:51Z correction; vault-agent-own's fixture bytes): every code from a closed table
  // the closed tables as the fixture's `codes` block echoes vault-run.js's exports (VR.ALWAYS_WHY / HOSTS_WHY / MASKING / CARD_SHAPES — int-C: read
  // VR.CARD_FACTS_CODES itself); 主开发's contract lists pinned beside them (a table that moved is red here before it is a raw code on a card)
  const C0 = FX.codes || {};
  const CONTRACT = { always: C0.always_why, hosts: C0.hosts_why, masking: C0.masking, shape: C0.shape, as: ['env', 'file', 'arg', 'stdin'] };
  const PINNED = { always: ['destination-unknown', 'program-writable', 'config-reads', 'card-too-long', 'redirect', 'brace-var', 'opaque-route', 'agent-template'], hosts: ['tool-names-none', 'opaque', 'config-driven'], masking: ['common-encodings'], shape: ['tool', 'line'] };
  const KEYS = ['v', 'who', 'tool', 'cmd', 'folder', 'secrets', 'env', 'hosts', 'shape', 'always', 'reason', 'templates', 'masking'];   // r8: v 2 (vault-agent-own r23 — + env, reason; the chunked folds)
  const REF_OK = (r) => /^vault:\/\/\S+$/.test(r) || /^[\w-]+:[0-9a-f]{6}$/.test(r);   // a reference, or the short id of one the door cannot name — never a value
  const shapeBad = Object.entries(V).flatMap(([n, f]) => [
    ...(J(Object.keys(f)) === J(KEYS) ? [] : [`${n}: keys ${Object.keys(f)}`]), ...(f.v === 2 ? [] : [`${n}: v ${f.v}`]),
    ...f.secrets.filter((s) => !(typeof s.name === 'string' && typeof s.entry === 'string' && REF_OK(s.ref) && s.as && CONTRACT.as.includes(s.as.kind) && typeof s.as.name === 'string')).map((s) => `${n}: secret ${J(s)}`),
    ...(f.hosts.known ? [] : CONTRACT.hosts.includes(f.hosts.why) ? [] : [`${n}: hosts.why ${f.hosts.why}`]), ...(CONTRACT.shape.includes(f.shape) ? [] : [`${n}: shape`]), ...(CONTRACT.masking.includes(f.masking) ? [] : [`${n}: masking`]),
    ...(f.always.offered || CONTRACT.always.includes(f.always.why) ? [] : [`${n}: always.why ${f.always.why}`]), ...(/^~|^\//.test(f.tool.path) && !/^\/home\//.test(f.tool.path) ? [] : [`${n}: tool.path ${f.tool.path}`])]);
  const pinOk = Object.entries(PINNED).every(([k, xs]) => J([...(CONTRACT[k] || [])].sort()) === J([...xs].sort()));
  ok(['hosts-unknown', 'hosts-known-always', 'config-reads', 'late'].every((n) => n in V) && FX.v === 2 && pinOk && !shapeBad.length, `the fixture scripts/fixtures/vault-run-card-facts.json (the SAME bytes as lane vault-agent-own's — r23 0cc421d4, v 2; int-C diffs them): its variants (hosts-unknown / hosts-known-always / config-reads / late), each {${KEYS.join(', ')}}, every reason a code of its closed tables (\`codes\` = the contract's lists), a secret {name, entry, ref, as}, a path home-relative`, { shapeBad, codes: FX.codes });
  const tables = { always: FA.RUN_ALWAYS_WHY, hosts: FA.RUN_HOSTS_WHY, masking: FA.RUN_MASKING, shape: FA.RUN_SHAPE };
  const cover = Object.entries(tables).map(([k, tb]) => [k, J(Object.keys(tb || {}).sort()) === J([...CONTRACT[k]].sort()), Object.values(tb || {}).filter((w) => !(w in DICT.zh) || !(w in DICT.ja))]);
  ok(cover.every(([, same, miss]) => same && !miss.length), 'EVERY CODE HAS ITS WORDS: the client\'s tables (runCardOf) name exactly the contract\'s closed lists — always.why ×8, hosts.why ×3, masking ×1, shape ×2 — each with an en key and its zh + ja entries', cover);
  // (b) THE RENDER: the row (the tray, the mini inbox, the chat card — ONE renderer) and its model, in three languages
  const run = (facts, x = {}) => ({ id: 'ut-run0000001', sessionKey: 'claude:c-ops', sessionName: 'ops', text: 'ops wants to run a command with a stored secret', detail: 'Program: … (the old clients\' prose)', status: 'open', urgency: 'urgent', kind: 'action', origin: 'vault', by: 'agent', createdAt: Date.now() - 5e3, expiresAt: Date.now() + 55e3, action: { type: 'vault-run-ask', askId: 'e'.repeat(32), always: !!(facts && facts.always && facts.always.offered), tool: 'x' }, ...(facts ? { facts } : {}), ...x });
  const rowHtml = (it, t, resolved = false) => ROW3.renderRow({ item: it, resolved, band: 1, ...(resolved ? { tail: true } : {}) }, { ...rctx3, t }).innerHTML;
  const cut = (h, cls) => { const i = h.indexOf(`<details class="ut-detail-exp ${cls}`); return i < 0 ? [h, ''] : [h.slice(0, i), h.slice(i)]; };
  const answersOf = (h) => [...h.matchAll(/data-answer="(\w+)"/g)].map((m) => m[1]);
  const facts1 = typeof ROW3.runFactsHtml === 'function';
  const look = {};
  for (const l of ['en', 'zh', 'ja']) {
    for (const [n, f] of Object.entries(V)) {
      const it = run(f), h = facts1 ? rowHtml(it, T[l]) : '', v = FA.runCardOf ? FA.runCardOf(it, { t: T[l] }) : null;
      const [body, fold] = cut(h, 'ut-run-fold');
      const ord = ['class="ut-text"', 'class="ut-deadline', 'class="ut-run-cmd"', 'class="ut-run-facts"', ' ut-run-answer"', ' ut-run-fold"'].map((c) => h.indexOf(c));
      look[`${l}/${n}`] = { headline: v && v.headline, order: ord.every((x, k) => x > 0 && (!k || x > ord[k - 1])), rows: (body.match(/class="ut-run-row/g) || []).length, first: (/data-fact="(\w+)"/.exec(body) || [])[1], warn: (/class="ut-run-row ut-run-warn" data-fact="(\w+)"/.exec(body) || [])[1] || null,
        answers: answersOf(h), primary: /ut-exit-allow ut-hub-once" data-answer="once"/.test(h), hint: ((/<span class="ut-run-hint">(.*?)<\/span><\/div>/.exec(h) || [])[1] || '').replace(/<[^>]+>/g, '|'),
        bodyClean: !/vault:\/\//.test(body) && !body.includes(f.tool.path === f.tool.name ? '\u0000' : `>${f.tool.path}<`) && !body.includes('common spellings') && !body.includes('常见写法') && !body.includes('Program: '),
        foldHas: f.secrets.every((s) => fold.includes(s.ref)) && fold.includes(f.tool.path) && fold.includes(T[l](FA.RUN_MASKING ? FA.RUN_MASKING['common-encodings'] : '').replace(/'/g, '&#39;')) && (!f.templates.length || fold.includes(T[l]('{n} bytes', { n: f.templates[0].bytes }))) };
    }
  }
  const z1 = look['zh/hosts-unknown'], z2 = look['zh/hosts-known-always'], z3 = look['zh/config-reads'], W1 = V['hosts-unknown'].who, D3 = V['config-reads'].always.directive;
  ok(!!z1 && z1.headline === `${W1} 想用「UniFi 账号」运行 unifi-api.sh` && z1.order && z1.rows === 4 && z1.first === 'hosts' && z1.warn === 'hosts' && J(z1.answers) === J(['once', 'deny']) && z1.primary && z1.hint === '不提供「总是允许」：发往何处未知' && z1.bodyClean && z1.foldHas,
    `the owner's card, zh: the headline «${W1} 想用「UniFi 账号」运行 unifi-api.sh» → the command in its own box → 4 fact rows, «发往» FIRST in the warning accent → 允许一次 (the primary accent) · 拒绝 with «不提供「总是允许」：发往何处未知» in the same row → «技术细节» holding the references, the full path, the masking sentence; the body holds none of them`, z1);
  ok(!!z2 && J(z2.answers) === J(['once', 'always', 'deny']) && z2.hint === '' && z2.warn === null && !!z3 && z3.hint === `不提供「总是允许」：它会读取一个本卡片无法显示的配置文件|${D3}|` && z3.warn === 'hosts' && z3.foldHas,
    'the other two variants: hosts known + «Always» offered ⇒ three verbs, no hint, nothing marked; config-reads ⇒ the hint names the reason and its directive (monospace), «发往» (its config decides) marked, the template in the fold', { z2, z3 });
  const l3 = ['en', 'ja'].map((l) => look[`${l}/hosts-unknown`]);
  ok(l3.every((x) => x && x.order && x.rows === 4 && x.warn === 'hosts' && x.bodyClean && x.foldHas) && l3[0].headline === `${W1} wants to run unifi-api.sh with “UniFi 账号”` && l3[1].headline === `${W1} が「UniFi 账号」を使って unifi-api.sh を実行しようとしています` && l3[0].hint === 'No «Always»: where it sends what it reads is unknown',
    'en / ja: the same order, the same marks, their own words', l3.map((x) => x && { headline: x.headline, hint: x.hint }));
  ok(missed.size === 0, `every word the card said in zh / ja was in its dictionary (no English fell through)`, [...missed]);
  // (c) A RECORD WITHOUT FACTS (an older door) renders today's prose UNCHANGED — the base's bytes, pinned
  const legacy = run(null, { detail: 'Program: /usr/bin/curl\nHosts: api.example.com' });
  const lh = rowHtml(legacy, tt3);
  const BASE_BODY = `<div class="ut-proposal-plan">Program: /usr/bin/curl\nHosts: api.example.com</div><div class="ut-exit-note">The output is scrubbed of the secret&#39;s common spellings; a command that re-encodes it can still show it — read the whole command before you allow it.</div><div class="ut-exit-answer ut-hub-answer"><button type="button" class="ut-act ut-action-exit ut-exit-allow ut-hub-once" data-answer="once">Allow once</button><button type="button" class="ut-act ut-action-exit ut-exit-deny ut-hub-deny" data-answer="deny">Deny</button></div>`;
  ok(lh.includes(`<div class="ut-text">${legacy.text}</div>`) && lh.includes(BASE_BODY) && !/ut-run/.test(lh), 'a record WITHOUT `facts` (an older door) draws today\'s words and prose byte for byte (98b6fdf7\'s), no facts card', lh.slice(0, 600));
  const RED_PROSE = facts1 ? rowHtml(run(V['hosts-unknown'], { detail: 'Program: ~/workspace/ops/office-net/unifi-api.sh — in a folder an agent can write' }), tt3) : '';
  ok(facts1 && !RED_PROSE.includes('Program: ') && RED_PROSE.includes('ut-run-cmd'), 'RED CONTROL (98b6fdf7 has no facts renderer): a record WITH facts never shows the prose — on the base it is the prose wall', facts1 ? 'facts drawn' : 'ROW3.runFactsHtml missing — the base draws the prose');
  // (d) codes the client has no words for: monospace, never a sentence; peer words escaped
  const odd = run({ ...V['hosts-unknown'], who: '<img src=x onerror=alert(1)>', cmd: '</pre><script>alert(1)</script>', secrets: [{ name: 'a <b>bold</b> · x', ref: 'vault://secrets/secret:k1/secret', as: { kind: 'pipe', name: 'Z' } }], hosts: { known: false, list: [], why: 'quantum-route' }, always: { offered: false, why: 'moon-phase', directive: null } });
  const oh = facts1 ? rowHtml(odd, tt3) : '';
  ok(facts1 && /<code class="ut-run-code">moon-phase<\/code>/.test(oh) && /<code class="ut-run-code">quantum-route<\/code>/.test(oh) && /<code class="ut-run-code">pipe<\/code>/.test(oh) && !/<img src=x|<script>|<b>bold/.test(oh) && oh.includes('&lt;img src=x'),
    'a code the client has no words for is drawn monospace (always.why, hosts.why, as.kind) — never a sentence; a name, a command, `who` escaped', oh.slice(0, 300));
  // (e) the stress shapes: a 300-char command, 4 entries, 3 hosts, an entry name of 40 CJK characters — nothing dropped
  const big = '账'.repeat(40);
  const stress = run({ ...V['hosts-known-always'], cmd: './x.sh ' + 'a1b2c3d4'.repeat(37), secrets: [big, 'B', 'C', 'D'].map((n, k) => ({ name: `${n} · f`, ref: `vault://secrets/secret:k${k}/secret`, as: { kind: 'env', name: `V${k}` } })), hosts: { known: true, list: ['a.example.com:443', 'b.example.com', '10.0.0.7:8443'] } });
  const sv = FA.runCardOf ? FA.runCardOf(stress, { t: tt3 }) : null;
  ok(!!sv && sv.cmd.length === 303 && sv.rows.length === 4 && sv.rows.find((r) => r.key === 'secrets').lines.length === 4 && sv.rows.find((r) => r.key === 'hosts').lines[0].filter((x) => x.mono).length === 3 && sv.headline.includes(big),
    'the stress shapes keep every fact: the 300-char command whole, 4 entries on 4 lines, 3 hosts, the 40-character name (the chrome leg LOOKS at it at 390 px)', sv && { cmd: sv.cmd.length, rows: sv.rows.map((r) => r.key + ':' + r.lines.length) });
  // (f) A CARD WITH A DEADLINE SHOWS IT (addendum B) — a fake clock at +0 / +50 / +61 s; the late run card (addendum C)
  const T0 = Date.now(), DAY = 24 * 3600e3;
  const ask = (type, x = {}) => ({ id: 'ut-ddl000000' + type.length, sessionKey: 'claude:c-ops', text: 'ops asks', status: 'open', kind: 'action', origin: 'vault', createdAt: T0, expiresAt: T0 + 60e3, action: { type, askId: 'f'.repeat(32), always: false }, ...x });
  const dl = (it, s, t = T.zh) => (FA.deadlineOf ? FA.deadlineOf(it, { t, now: T0 + s * 1000 }) : null);
  const clock = [0, 50, 61].map((s) => { const d = dl(ask('vault-run-ask'), s); return d && [d.state, d.warn, d.text]; });
  const hub61 = dl(ask('hub-act-ask'), 61), lateMark = dl(ask('vault-run-ask', { expiresAt: T0 + 86400e3, action: { type: 'vault-run-ask', askId: 'f'.repeat(32), late: true } }), 61), wake = dl(ask('channel-watch-request', { expiresAt: T0 + 7 * DAY }), 0), notice = dl(ask('vault-run-ask', { kind: 'notice' }), 0);
  const DUE = '按服务器时间已到期 — 等服务器确认';
  ok(J(clock) === J([['live', false, '60 秒内有效 · 按服务器时间还剩 60 秒'], ['live', true, '60 秒内有效 · 按服务器时间还剩 10 秒'], ['due', true, DUE]]) && hub61 && hub61.state === 'due' && hub61.text === DUE && lateMark && lateMark.state === 'late' && lateMark.text === '已超时 — agent 的命令被拒绝；现在允许 = 它下次运行这条命令时直接放行（1 次）' && wake === null && notice === null,
    'THE FAKE CLOCK (zh, the HUB\'s time — r8): +0 s «60 秒内有效 · 按服务器时间还剩 60 秒» · +50 s the warning accent «还剩 10 秒» · +61 s with no settle yet «按服务器时间已到期 — 等服务器确认» (the run card and a hub act alike — the client never infers «late» or «timed out» by its own clock); the server\'s `late` mark reads late whatever the clock; the 7-day wake ask keeps «expires in 7 d» (no ticker), a notice its own window', { clock, hub61, lateMark, wake, notice });
  const at = (s, type = 'vault-run-ask', x = {}) => ask(type, { createdAt: Date.now() - s * 1000, expiresAt: Date.now() - s * 1000 + 60e3, ...x });
  const drawn = (it) => { const h = rowHtml(it, T.zh); return { deadline: ((/<div class="ut-deadline[^"]*"[^>]*>([^<]*)</.exec(h) || [])[1]) || null, warn: /class="ut-deadline ut-deadline-warn"/.test(h), timedOut: /ut-timed-out/.test(ROW3.renderRow({ item: it, resolved: false, band: 1 }, { ...rctx3, t: T.zh }).className), answers: answersOf(h) }; };
  // r9 (the acceptance's low: a snapshot with no `todos.now` — an older hub — counted by the DEVICE's clock while saying «按服务器
  // 时间»): before any snapshot named the hub's time the line says whose clock it counts by; then the hub's (offset 0 here)
  const dev0 = drawn(at(0)), dev61 = drawn(at(61));
  ok(dev0.deadline === '60 秒内有效 · 按本机时间还剩 60 秒' && dev61.deadline === '按本机时间已到期 — 等服务器确认' && J(dev61.answers) === J(['once', 'deny']),
    `THE CLOCK FALLBACK (r9): no snapshot has said the hub's time yet ⇒ «${dev0.deadline}» / «${dev61.deadline}» — never «按服务器时间» on the device's own clock (db19b0a2: «按服务器时间还剩 60 秒»), the answers kept`, J({ dev0, dev61 }));
  if (typeof ROW3.noteHubClock === 'function') ROW3.noteHubClock(Date.now());   // a snapshot said the hub's time (this box's — offset 0)
  const d0 = drawn(at(0)), d50 = drawn(at(50)), d61 = drawn(at(61)), h61 = drawn(at(61, 'hub-act-ask')), l61 = drawn(at(61, 'vault-run-ask', { expiresAt: Date.now() + 86400e3, action: { type: 'vault-run-ask', askId: 'f'.repeat(32), always: true, late: true } }));
  ok(d0.deadline === '60 秒内有效 · 按服务器时间还剩 60 秒' && !d0.warn && d50.warn && /还剩 10 秒/.test(d50.deadline) && d61.deadline === DUE && !d61.timedOut && J(d61.answers) === J(['once', 'deny']) && !h61.timedOut && h61.deadline === DUE && h61.answers.includes('once') && h61.answers.includes('deny') && /^已超时/.test(l61.deadline || '') && J(l61.answers) === J(['once', 'deny']),
    'THE ROW (the tray, the chat card): the line under the question at +0 / +50 s (the accent under 15 s); at +61 s with no settle the answers STAY on the run card and a hub act alike (r8: only the producer\'s settle withdraws them — no `.ut-timed-out`); a card the server marked LATE offers 允许一次 / 拒绝 ONLY — never «Always», even when its filed card offered it (r8: its door refuses it)', { d0, d50, d61, h61, l61 });
  // the ticker: ONE page interval re-reads every line (a stub page: two lines, the run card's and a hub act's)
  const mkLine = (it) => { const ds = {}; const m = /data-deadline-at="(\d+)" data-deadline-from="(\d+)"/.exec(rowHtml(it, tt3)) || []; Object.assign(ds, { deadlineAt: m[1], deadlineFrom: m[2], state: 'live' }); const cl = new Set(); return { dataset: ds, textContent: '', classList: { toggle: (c, on) => (on ? cl.add(c) : cl.delete(c)), has: (c) => cl.has(c) }, closest: () => ({ classList: { toggle: (c, on) => (on ? cl.add('row:' + c) : cl.delete('row:' + c)) } }), cl }; };
  const lines = [mkLine(at(0)), mkLine(at(0, 'hub-act-ask'))];
  const counting = typeof ROW3.tickDeadlines === 'function' ? [ROW3.tickDeadlines({ querySelectorAll: () => lines }, Date.now() + 50e3), ROW3.tickDeadlines({ querySelectorAll: () => lines }, Date.now() + 61e3)] : null;
  ok(!!counting && J(counting) === J([2, 0]) && lines.every((x) => x.dataset.state === 'due' && ![...x.cl].some((c) => /timed-out/.test(c)) && x.cl.has('ut-deadline-warn')),
    'THE TICKER: at +50 s both lines count (2), at +61 s none (0 — the interval stops itself); both lines say «… 已到期 — 等服务器确认» and NO row loses its answers (r8)', counting && { counting, states: lines.map((x) => x.dataset.state), text: lines.map((x) => x.textContent), cls: lines.map((x) => [...x.cl]) });
  // r8 A CLOCK IS THE HUB'S: a device 61 s FAST (the hub's own `now` on the For-you read sets the tab's offset) still counts the
  // live ask from 60; a device 45 s SLOW reads the hub's end, not its own (RED: 2a5e9ce8 read Date.now() — the fast device drew
  // «timed out» with no answers from the start)
  const skew = typeof ROW3.noteHubClock === 'function' ? (() => {
    const hubFast = Date.now() - 61e3;   // this device reads 61 s AHEAD of the hub: the hub's now (its broadcast's `now`) is 61 s behind it
    ROW3.noteHubClock(hubFast, Date.now());
    const fast = drawn(ask('hub-act-ask', { createdAt: hubFast, expiresAt: hubFast + 60e3 }));   // stamped by the hub, just now
    const hubSlow = Date.now() + 45e3;   // …and 45 s BEHIND it: the hub refused 1 s ago, this device's own clock would say 44 s left
    ROW3.noteHubClock(hubSlow, Date.now());
    const slowLine = mkLine(ask('hub-act-ask', { createdAt: hubSlow - 61e3, expiresAt: hubSlow - 1e3 }));
    const slow = ROW3.tickDeadlines({ querySelectorAll: () => [slowLine] });
    ROW3.noteHubClock(Date.now(), Date.now());
    return { fast, slow, slowState: slowLine.dataset.state };
  })() : null;
  ok(!!skew && /按服务器时间还剩 (60|59) 秒/.test(skew.fast.deadline || '') && skew.fast.answers.includes('once') && skew.slow === 0 && skew.slowState === 'due',
    'r8 A CLOCK IS THE HUB\'S: a device 61 s ahead of the hub still shows a live 60 s ask «按服务器时间还剩 60 秒» with its answers; a device 45 s behind reads the hub\'s end (the line stops counting) — the countdown is advisory and says «按服务器时间»', skew);
  // (g) its END stays, in words: an ask nobody answered (the server's 'ask-expired') keeps its place «timed out — …»; a LATE
  // Allow records «let through once by you · waiting for it to run again · HH:MM»; the 24 h end of a late card «expired»
  const ended = { ...ask('vault-run-ask'), status: 'done', resolvedBy: 'ask-expired', resolvedAt: T0 + 60e3 };
  const lateAllow = { ...ask('vault-run-ask'), status: 'done', resolvedBy: 'allowed', resolvedAt: T0 + 90e3, resolvedFact: { decidedBy: 'person', decidedAt: T0 + 90e3, late: true } };
  const words = (it, l) => ({ status: ROW3.statusWords(it, T[l]), by: ROW3.resolvedByText(it.resolvedBy, T[l], it), card: FA.decisionCard(it, { t: T[l], now: T0 + 91e3 }).stamp });
  const e3 = ['en', 'zh', 'ja'].map((l) => words(ended, l)), la = words(lateAllow, 'zh'), late24 = words({ ...lateAllow, resolvedBy: 'expired', resolvedFact: null }, 'zh');
  ok(e3[0].status === 'timed out — the agent\'s command was refused (it may ask again)' && e3[1].status === '已超时 — agent 的命令被拒绝（它可能会再问）' && /^タイムアウト/.test(e3[2].status) && e3.every((x) => x.by === '' && x.card === x.status) && /^你已放行 1 次 · 等它重跑 · \d\d:\d\d$/.test(la.card) && la.by === la.card && /^已过期/.test(late24.card),
    'ITS END STAYS IN WORDS — an ask nobody answered (\'ask-expired\') reads «已超时 — agent 的命令被拒绝（它可能会再问）» on the row, the window and the chat card (en / ja too; RED: the base said «expired (no answer in 60 s)» — the raw outcome\'s words); a late Allow «你已放行 1 次 · 等它重跑 · HH:MM» (the person mark); the late card\'s 24 h end «已过期»', { e3, la, late24 });
} catch (e) { ok(false, '⑮ threw on this tree (an API it asks for is missing): ' + ((e && e.stack) || e)); }

// ── ⑯ ROUND 8 ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑯ ROUND 8 — a store clips and says, never throws; a late card offers what its door takes; an end this client cannot classify is said as one');
const DICT8 = { zh: (await import(pathToFileURL(path.join(SRC, 'lib', 'i18n-zh.js')).href)).default };
const Z = (x, p) => String(DICT8.zh[x] || x).replace(/\{(\w+)\}/g, (m0, k) => (p && p[k] != null ? String(p[k]) : m0));
const LS = JSON.parse(read('scripts/fixtures/vault-run-late-settles.json'));
try {
  const FX8 = JSON.parse(read('scripts/fixtures/vault-run-card-facts.json'));
  const base8 = FX8.variants[0].facts;
  // (a) THE STORE CLIPS: a facts string over the card's bound never throws — the door files its card (2a5e9ce8: `facts.cmd is
  // longer than 2000 characters` ⇒ the door's ask_unfiled ⇒ no card, the run failed — measured with vault-agent-own 4ff55fb4's door)
  const { m, done } = storeWith(FA);
  try {
    const sizes = [1999, 2000, 2001, 2973, 4096, 5000].map((n) => {
      const facts = { ...base8, cmd: 'curl ' + 'x'.repeat(n - 5), always: { ...base8.always, directive: n === 5000 ? 'd'.repeat(2311) : null } };
      try { const r = m.add('claude:r8-' + n, { text: 'run ' + n, origin: 'vault', action: { type: 'vault-run-ask', askId: 'a'.repeat(31) + (n % 10) }, facts }); const it = m.get(r.id); return [n, it.facts.cmd.length, it.facts.cmdCut === true, (it.facts.cmdFull || []).map((c) => c.length).join('+'), (it.facts.cut || []).join(','), (r.factsCut || []).join(',')]; } catch (e) { return [n, 'THROWS: ' + e.message]; }
    });
    ok(J(sizes) === J([[1999, 1999, false, '', '', ''], [2000, 2000, false, '', '', ''], [2001, 2000, true, '2000+1', '', ''], [2973, 2000, true, '2000+973', '', ''], [4096, 2000, true, '2000+2000+96', '', ''], [5000, 2000, true, '2000+2000+96', 'cmdFull,always.directive', 'cmdFull,always.directive']]) && FA.RUN_CMD_BODY_MAX === 2000 && FA.RUN_CMD_MAX === 4096,
      'THE STORE CLIPS AND SAYS, NEVER THROWS (the ONE bound — vault-agent-own r23\'s CARD_STRING_MAX, the shared contract: the body ≤ 2 000, the fold ≤ 4 096): 1 999 / 2 000 file whole; 2 001 / 2 973 / 4 096 are folded in the door\'s own shape — `cmd` its first 2 000, `cmdCut: true`, the whole in `cmdFull` chunks of ≤ 2 000; 5 000 (past the door\'s 4 096) and a 2 311-character directive are clipped and NAMED (`cut`, the returned record\'s `factsCut`) — every one filed (2a5e9ce8 threw from 2 001)', sizes);
    const kept0 = J(m.get(m.snapshot().open.find((i) => i.text === 'run 2973').id).facts);
    const again = m.add('claude:r8-2973', { text: 'run 2973', origin: 'vault', action: { type: 'vault-run-ask', askId: 'a'.repeat(31) + '3' }, facts: JSON.parse(kept0) });   // the door's own clip at the same bound
    const odd = [m.add('claude:r8-odd1', { text: 'odd 1', origin: 'vault', action: { type: 'vault-run-ask', askId: 'b'.repeat(32) }, facts: 'not an object' }), m.add('claude:r8-odd2', { text: 'odd 2', origin: 'vault', action: { type: 'vault-run-ask', askId: 'c'.repeat(32) }, facts: { ...base8, secrets: Array.from({ length: 64 }, (_, k) => ({ name: 'n'.repeat(400) + k, entry: 'e' + k, ref: 'vault://secrets/secret:k/secret', as: { kind: 'env', name: 'V' + k } })) } })];
    ok(J(m.get(again.id).facts) === kept0 && !again.factsCut && odd.every((r) => !!r.id) && odd.map((r) => (r.factsCut || []).join(',')).join('|') === 'facts|facts' && J(odd.map((r) => m.get(r.id).facts)) === J([{ dropped: 'not-an-object', cut: ['facts'] }, { dropped: 'too-large', cut: ['facts'] }]),
      'idempotent (facts already cut re-file as they are, nothing re-cut); a facts that is no object, or past 24 KB as a whole, is DROPPED and said (`factsCut: [facts]`) — the item still filed with a STUB that says why (r9: {dropped, cut} — no `v`, so the card draws its prose)', odd.map((r) => [r.factsCut, m.get(r.id).facts]));
    // r9 (THE STORE SAYS WHEN IT DROPS — the acceptance: a 24 KB drop said nowhere, a non-text cmd dropped silently, a bad key cut as
    // «» and the re-file losing that cut): every drop NAMED — on the card, in the fold, in the journal — and filing twice gives equal cuts
    const big = m.get(odd[1].id), bigHtml = ROW3.renderRow({ item: big, resolved: false, band: 1 }, { ...rctx3, t: Z }).innerHTML;
    const shapes = { cmdObject: { ...base8, cmd: { not: 'text' } }, snake: { ...base8, snake_case: 1 }, fields40: { ...base8, ...Object.fromEntries(Array.from({ length: 40 }, (_, k) => ['f' + k, 1])) } };
    const twice = Object.entries(shapes).map(([k, f], j) => { const r1 = m.add('claude:r9-' + k, { text: 'r9 ' + k, origin: 'vault', action: { type: 'vault-run-ask', askId: String(j).repeat(32) }, facts: f }); const f1 = m.get(r1.id).facts; const r2 = m.add('claude:r9b-' + k, { text: 'r9b ' + k, origin: 'vault', action: { type: 'vault-run-ask', askId: String(j + 5).repeat(32) }, facts: JSON.parse(J(f1)) }); return [k, f1.cut || null, m.get(r2.id).facts.cut || null]; });
    ok(!FA.runCardOf(big, { t: Z }) && /<div class="ut-run-cut ut-facts-dropped">事实太大，未保存 — 只显示文字<\/div>/.test(bigHtml)
      && J(twice.slice(0, 2)) === J([['cmdObject', ['cmd'], ['cmd']], ['snake', ['snake_case'], ['snake_case']]])
      && J(twice[2][1]) === J(Array.from({ length: 16 }, (_, k) => 'f' + (32 - Object.keys(base8).length + k))) && J(twice[2][2]) === J(twice[2][1]),   // the 33rd field on, each by name (the list's own bound: 16)
      `THE STORE SAYS WHEN IT DROPS (r9): a facts past 24 KB ⇒ the card's line «事实太大，未保存 — 只显示文字» above its text; a non-text cmd ⇒ cut «cmd»; a bad key / a 33rd field ⇒ cut by its OWN name (never «»); filing twice ⇒ equal cuts (db19b0a2: said nowhere; «cmd» silent; cut [""], the re-file losing it)`, J({ twice, line: (/ut-facts-dropped">([^<]*)</.exec(bigHtml) || [])[1] || null }));
    // the card: the body's command box holds the cut, a line says so, the fold holds it whole
    const it = m.get(m.snapshot().open.find((i) => i.text === 'run 2973').id);
    const h = ROW3.runFactsHtml(it, Z);
    const body = (/<pre class="ut-run-cmd">([^<]*)<\/pre>/.exec(h) || [])[1] || '', whole = (/<pre class="ut-run-cmd ut-run-cmd-full">([^<]*)<\/pre>/.exec(h) || [])[1] || '';
    const cutLine = (/<div class="ut-run-cut">([^<]*)</.exec(h) || [])[1] || null;
    ok(body.length === 2001 && body.endsWith('…') && whole.length === 2973 && cutLine === '命令共 2973 个字符，这里只显示前 2000 个 — 完整命令在「技术细节」里。' && h.indexOf('ut-run-cut') < h.indexOf('ut-run-facts') && h.indexOf('ut-run-cmd-full') > h.indexOf('ut-run-fold'),
      `the card: the body's box holds the first 2 000 drawn with «…»; under it «${cutLine}»; the «技术细节» fold holds the whole 2 973 reassembled (its own scrolling box)`, J({ body: body.length, whole: whole.length, cutLine }));
    // r8 — THE DOOR'S v 2 (vault-agent-own r23 0cc421d4): every fixture variant files BYTE-IDENTICAL; a long command in its chunked
    // fold too; its template text (`textFull`) reassembled, its `reason` and `env` in the fold; a late card after a RESTART
    // (`action.restartLost` — an Allow would mint nothing) says so and offers 拒绝 alone
    const same = FX8.variants.map((v) => { const r = m.add('claude:r8-v2-' + v.name, { text: 'v2 ' + v.name, origin: 'vault', action: { type: 'vault-run-ask', askId: v.name.padEnd(32, 'b') }, facts: v.facts }); return J(m.get(r.id).facts) === J(v.facts) && !r.factsCut; });
    const W2 = 'curl -d ' + 'z'.repeat(2965), T2 = 'tpl '.repeat(700);
    const long2 = {}; for (const [k, v] of Object.entries(FX8.variants[0].facts)) { if (k === 'cmd') Object.assign(long2, { cmd: W2.slice(0, 2000), cmdCut: true, cmdFull: [W2.slice(0, 2000), W2.slice(2000)] }); else long2[k] = v; }
    long2.templates = [{ label: 'CFG', bytes: T2.length, shown: true, text: T2.slice(0, 2000), textFull: [T2.slice(0, 2000), T2.slice(2000)] }];
    long2.env = [{ name: 'API_BASE', value: 'https://collector.example.net/x' }];
    long2.reason = { notOwn: true, away: [{ ref: 'vault://secrets/mint-token/token', forHost: 'auth.internal.example', host: 'api.external.example', unknown: false, keep: true }] };
    const r2 = m.add('claude:r8-v2-long', { text: 'v2 long', origin: 'vault', action: { type: 'vault-run-ask', askId: 'c'.repeat(32) }, facts: long2 });
    const it2 = m.get(r2.id), h2 = ROW3.runFactsHtml(it2, Z);
    const pres = [...h2.matchAll(/<pre class="ut-run-cmd ut-run-cmd-full">([^<]*)<\/pre>/g)].map((x) => x[1].length);
    ok(same.every(Boolean) && J(it2.facts) === J(long2) && J(pres) === J([2973, T2.length]) && h2.includes('为什么要问') && h2.includes('它用到了另一个对话存入的密钥') && h2.includes('是为 auth.internal.example 生成的 — 这次运行把它发往 api.external.example') && h2.includes('API_BASE=https://collector.example.net/x'),
      `THE DOOR'S v 2 (r23): its four fixture variants and a long command in its chunked fold file BYTE-IDENTICAL; the fold reassembles the whole command (2 973) and the template's text (${T2.length}), says WHY IT ASKS and the plain env`, J({ same, pres }));
    const lost = { ...it2, facts: FX8.variants.find((v) => v.name === 'late').facts, action: { type: 'vault-run-ask', askId: 'c'.repeat(32), always: true, late: true, lateAt: Date.now(), restartLost: true }, expiresAt: Date.now() + 86400e3, createdAt: Date.now() - 61e3 };
    const hl = ROW3.renderRow({ item: lost, resolved: false, band: 1 }, { ...rctx3, t: Z }).innerHTML;
    ok(J([...hl.matchAll(/data-answer="(\w+)"/g)].map((x) => x[1])) === J(['deny']) && hl.includes('之后服务器重启过，现在允许也不会放行任何东西') && /data-deadline-lost="1"/.test(hl),
      'a LATE card after a restart (r23 `action.restartLost` — the door would mint no pass) says «…之后服务器重启过，现在允许也不会放行任何东西 — 它下次运行时会再问» and offers 拒绝 alone (a card never offers what its door would not do)', hl.slice(0, 300));
  } finally { done(); }
} catch (e) { ok(false, '⑯ (a) threw on this tree: ' + ((e && e.message) || e)); }
try {
  // (b) THE LATE CARD'S SETTLES — scripts/fixtures/vault-run-late-settles.json (vault-agent-own 4ff55fb4's door, driven by this lane
  // through its store: the open late card + each settle as the door writes it, beside the RULED shape both lanes agreed)
  const WANT = { 'late-allow': ['allowed', '已放行 1 次 · 等它重跑', /^你已放行 1 次 · 等它重跑 · /], 'late-deny': ['denied', '已拒绝', /^你已拒绝 · /], 'late-24h-end': ['expired', '已过期 · 助手可以再次请求', null], 'late-lock': ['vault_locked', '回答前保险库已锁定', null] };
  const look8 = [];
  for (const st of LS.settles) {
    const [end, words, stampRe] = WANT[st.name];
    const s0 = storeWith(FA);
    try {
      const r = s0.m.add(LS.item.sessionKey, { text: LS.item.text, origin: LS.item.origin, kind: LS.item.kind, action: { ...LS.item.action }, expiresAt: Date.now() + 3600e3 });
      const went = s0.m.resolveAnswered([r.id], st.by, st.fact);   // the door's own call, as 4ff55fb4 makes it
      const kept = s0.m.get(r.id);
      const raw = { ...LS.item, status: 'done', resolvedBy: st.by, resolvedFact: st.fact };   // the same record as a store that did not map it kept it
      const ruled = { ...LS.item, status: 'done', resolvedBy: st.ruled.by, resolvedFact: st.ruled.fact, resolvedAt: Date.now() };
      const w = (x) => [ROW3.statusWords(x, Z), ROW3.resolvedByText(x.resolvedBy, Z, x), FA.settledWords(x, Z), typeof ROW3.endCodeOf === 'function' ? ROW3.endCodeOf(x) : '(no endCodeOf)'];
      look8.push({ name: st.name, went: went.length, kept: [kept.status, kept.resolvedBy], words: w(kept), raw: w(raw), ruledStamp: (FA.decidedStamp(ruled, { t: Z }) || {}).text || null, ruledWords: FA.settledWords(ruled, Z) });
      ok(went.length === 1 && kept.status === 'done' && kept.resolvedBy === end && w(kept)[1] === words && w(kept)[2] === words && w(raw)[1] === words && w(raw)[2] === words && !w(raw)[3] && (stampRe ? stampRe.test((FA.decidedStamp(ruled, { t: Z }) || {}).text || '') : FA.settledWords(ruled, Z) === words),
        `${st.name}: the door's settle (by «${st.by}», outcome «${st.fact.outcome}») CLOSES the card as «${end}» — «${words}» — and the same record kept unmapped reads the same; the ruled shape ${stampRe ? 'stamps «by you · HH:MM»' : 'reads the same'} (2a5e9ce8: the store skipped it — the card stayed open with its buttons after the door had answered)`, J(look8[look8.length - 1]));
    } finally { s0.done(); }
  }
} catch (e) { ok(false, '⑯ (b) threw on this tree: ' + ((e && e.message) || e)); }
try {
  // (c) AN END THIS CLIENT CANNOT CLASSIFY is said as one — «结果未知 · <code>» (the code monospace), never «完成», never a bare raw word;
  // the store refuses such a settle BY NAME in its journal (was: skipped in silence)
  const unk = { ...LS.item, status: 'done', resolvedBy: 'user', resolvedFact: { outcome: 'moon-phase' } };
  const meta = ROW3.renderRow({ item: unk, resolved: true, band: 1, tail: true }, { ...rctx3, t: Z }).innerHTML;
  const warns = []; const cw = console.warn; console.warn = (x) => warns.push(String(x));
  const s1 = storeWith(FA);
  let left = null;
  try { const r = s1.m.add(LS.item.sessionKey, { text: LS.item.text, origin: 'vault', action: { ...LS.item.action } }); s1.m.resolveAnswered([r.id], 'user', { outcome: 'moon-phase' }); left = s1.m.get(r.id).status; } finally { console.warn = cw; s1.done(); }
  ok(ROW3.statusWords(unk, Z) === '结果未知' && ROW3.endCodeOf(unk) === 'user' && ROW3.resolvedByText('user', Z, unk) === '' && FA.settledWords(unk, Z) === '结果未知' && /结果未知 · <code class="ut-end-code">user<\/code>/.test(meta) && !/完成/.test(meta) && left === 'open' && warns.some((x) => /is not one of its row's ends — the item stays open \(decision_row\)/.test(x)),
    'an end this client cannot classify (resolvedBy «user», an outcome no table names) reads «结果未知 · <code>user</code>» on the row (and the chat card / the window through endCodeOf) — never «完成», never the raw word as a sentence; the store refuses that settle and SAYS so in its journal', J({ meta: (/<div class="ut-meta">(.*?)<\/div>/.exec(meta) || [])[1], left, warns }));
} catch (e) { ok(false, '⑯ (c) threw on this tree: ' + ((e && e.message) || e)); }
try {
  // (d) the press: a LATE Allow's answer (r20b's {ok, outcome:'late-allowed'}) is never toasted «denied»
  const ACT8 = read('src/lib/user-todos-actions.js');
  ok(/r\.outcome === 'late-allowed' \? t\('let through once · waiting for it to run again'\) : r\.outcome === 'denied' \? t\('denied'\) : `\$\{t\('outcome unknown'\)\} · \$\{String\(r\.outcome \|\| ''\)\}`/.test(ACT8), 'the vault-run press reads a late Allow\'s outcome («已放行 1 次 · 等它重跑»), a Deny as «已拒绝», anything else as «结果未知 · <outcome>» (2a5e9ce8: everything not allowed/always toasted «已拒绝»)');
} catch (e) { ok(false, '⑯ (d) threw on this tree: ' + ((e && e.message) || e)); }

// ── ⑰ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑰ ROUND 9 — a store never states a length it cannot prove; an old ✓/✕ keeps its word; a value minted for no host is worded; the stamps and the toast say what happened');
const JA9 = (await import(pathToFileURL(path.join(SRC, 'lib', 'i18n-ja.js')).href)).default;
const JA = (x, p) => String(JA9[x] || x).replace(/\{(\w+)\}/g, (m0, k) => (p && p[k] != null ? String(p[k]) : m0));
try {
  // (a) THE 1 000-QUOTE ARGV (the acceptance's claim-run 1 through the real a1f79c42 door): a 2 035-byte argv whose quoting makes a
  // 5 037-char cmd — the door sends it whole in cmdFull (2000+2000+1037); the store keeps 4 096 and SAYS it cut the fold
  const FX9 = JSON.parse(read('scripts/fixtures/vault-run-card-facts.json'));
  const base9 = FX9.variants[0].facts;
  const whole = ('curl -d ' + "'a'\\''".repeat(1000) + ' https://api.example.test').slice(0, 5037);
  const chunks = (x) => { const o = []; for (let i = 0; i < x.length; i += 2000) o.push(x.slice(i, i + 2000)); return o; };
  const { m, done } = storeWith(FA);
  try {
    const file = (extra, k) => { const r = m.add('claude:r9-q' + k, { text: 'quotes ' + k, origin: 'vault', action: { type: 'vault-run-ask', askId: String(k).repeat(32) }, facts: { ...base9, cmd: whole.slice(0, 2000), cmdCut: true, cmdFull: chunks(whole), ...extra } }); return m.get(r.id); };
    const a = file({}, 1), b = file({ cmdLen: 5037 }, 2);
    const va = FA.runCardOf(a, { t: Z }), vb = FA.runCardOf(b, { t: Z });
    const foldA = va && va.fold ? (va.fold.find((x) => x.cmd) || {}).label : (JSON.stringify(va || {}).match(/"label":"(命令（前 \d+ 个字符）|完整命令)"/) || [])[1];
    ok(whole.length === 5037 && J((a.facts.cmdFull || []).map((c) => c.length)) === J([2000, 2000, 96]) && J(a.facts.cut) === J(['cmdFull'])
      && va && va.cut && va.cut.text === '命令超过 4096 个字符，完整命令未保存 — 请在保险库窗口查看运行记录。这里只显示前 2000 个。' && va.cut.n === null && va.cut.whole === false
      && vb && vb.cut && vb.cut.text === va.cut.text && vb.cut.n === null   // r12: a `cmdLen` no producer emits is no fact — read nowhere
      && /命令（前 4096 个字符）/.test(JSON.stringify(va)) && !/完整命令在「技术细节」里/.test(JSON.stringify(va)),
      `(a) A STORE NEVER STATES A LENGTH IT CANNOT PROVE: the fold cut at 4 096 ⇒ «${va && va.cut && va.cut.text}»; a hand-built \`cmdLen\` (r12: no producer emits one) changes nothing; the fold is titled «命令（前 4096 个字符）» (db19b0a2: «命令共 4096 个字符 … 完整命令在「技术细节」里。» — 941 characters nowhere)`, J({ a: va && va.cut, b: vb && vb.cut, foldA }));
    const c = file({}, 3), whole2 = whole.slice(0, 2973), d = m.get(m.add('claude:r9-q4', { text: 'quotes 4', origin: 'vault', action: { type: 'vault-run-ask', askId: '4'.repeat(32) }, facts: { ...base9, cmd: whole2.slice(0, 2000), cmdCut: true, cmdFull: chunks(whole2) } }).id);
    const vd = FA.runCardOf(d, { t: Z });
    ok(!!c && vd && vd.cut && vd.cut.text === '命令共 2973 个字符，这里只显示前 2000 个 — 完整命令在「技术细节」里。', '(a) CONTROL (green on both trees): a WHOLE fold (nothing cut, no cmdLen) states the chunks\' sum — the r8 line, unchanged', vd && vd.cut);
  } finally { done(); }
} catch (e) { ok(false, '⑰ (a) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (b) AN OLD ✓/✕ KEEPS ITS WORD (the acceptance, skep8-old-records.cjs): a decision-row record a person closed with the generic ✓ / ✕
  // BEFORE the decision law (resolvedBy 'user'), or the engine's 'system' — no outcome fact
  const NOW9 = Date.now();
  const rec = (type, status, by) => ({ id: 'ut-old9' + type.length + status.length + by.length, sessionKey: 'claude:c-a', text: 'an old ask', urgency: 'normal', origin: 'vault', status, resolvedBy: by, resolvedAt: NOW9 - 60e3, createdAt: NOW9 - 120e3, kind: 'action', action: { type, ...(type === 'channel-watch-request' ? { id: 'wr-1' } : { askId: 'a'.repeat(32) }) } });
  const olds = [rec('hub-act-ask', 'dismissed', 'user'), rec('vault-run-ask', 'done', 'user'), rec('channel-watch-request', 'done', 'system')];
  const seen = olds.map((it) => { const h = ROW3.renderRow({ item: it, resolved: true, band: 1, tail: true }, rctx3).innerHTML; return [FA.settledWords(it, tt3), ROW3.statusWords(it, tt3), ROW3.endCodeOf(it), /ut-end-code/.test(h), /outcome unknown/.test(h)]; });
  ok(J(seen.map((x) => x[0])) === J(['dismissed', 'done', 'done']) && seen.every((x) => !x[2] && !x[3] && !x[4]),
    `(b) AN OLD ✓/✕ KEEPS ITS WORD: pre-law records (resolvedBy user / system, no outcome) read ${seen.map((x) => `«${x[0]}»`).join(' / ')} — never «outcome unknown · user» (db19b0a2); «unknown» stays for an end nobody worded (⑯ (c))`, J(seen));
} catch (e) { ok(false, '⑰ (b) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (c) WORDS: r23's fixture variant 1 has a value minted for NO host (forHost null) — «是为 ? 生成的» before; the ja deny stamp; the
  // page's re-grant toast reads the write's own `wakes` (DEFECT 2 — a re-grant that re-activated 2 wakes toasted «nobody is woken»)
  const FX9 = JSON.parse(read('scripts/fixtures/vault-run-card-facts.json'));
  const v1 = FX9.variants.find((x) => JSON.stringify(x.facts.reason || {}).includes('"forHost":null')) || FX9.variants[1];
  const it = { id: 'ut-r9-host', sessionKey: 'claude:c1', text: 'run?', status: 'open', kind: 'action', origin: 'vault', createdAt: Date.now(), action: { type: 'vault-run-ask', askId: 'e'.repeat(32) }, facts: v1.facts };
  const why = (t) => JSON.stringify(FA.runCardOf(it, { t }) || {});
  const words = { zh: why(Z), en: why(tt3), ja: why(JA) };
  ok(!!v1 && !/为 \? 生成|minted for \?|\? 向け/.test(JSON.stringify(words)) && /不属于任何主机/.test(words.zh) && /is tied to no host/.test(words.en) && /どのホストにも紐づいていません/.test(words.ja),
    '(c) a value minted for NO host (r23 variant 1, forHost null) is worded — «不属于任何主机 …» / «is tied to no host …» / «…どのホストにも紐づいていません …» — never a raw «?»', J({ zh: (words.zh.match(/[^"]*不属于任何主机[^"]*/) || [])[0] || words.zh.slice(0, 200) }));
  const deny = { id: 'ut-r9-deny', sessionKey: 'claude:c1', text: 'wake?', status: 'done', kind: 'action', origin: 'channels', createdAt: Date.now() - 9e4, resolvedAt: Date.now() - 6e4, resolvedBy: 'denied', resolvedFact: { decidedBy: 'person', decidedAt: Date.now() - 6e4 }, action: { type: 'channel-watch-request', id: 'wr-9' } };
  const st = FA.decidedStamp(deny, { t: JA });
  ok(st && /^あなたが拒否しました · /.test(st.text), `(c) the ja person stamp of a deny says WHO: «${st && st.text}» (was «拒否済み» — pre-existing from r1)`, st);
  const FE = read('src/lib/channel-filter-editor.js');
  const ZH9 = DICT8.zh;
  ok(/const woke = r\.wakes && Array\.isArray\(r\.wakes\.reactivated\) \? r\.wakes\.reactivated\.length : 0;/.test(FE) && /woke \? t\('Access saved: \{list\} — this re-activated \{n\} wake\(s\) \(a billed turn each time one fires\)', \{ list: names, n: woke \}\)/.test(FE) && !!ZH9['Access saved: {list} — this re-activated {n} wake(s) (a billed turn each time one fires)'] && !!JA9['Access saved: {list} — this re-activated {n} wake(s) (a billed turn each time one fires)'],
    '(c) DEFECT 2: the page\'s access toast reads the write\'s own `wakes.reactivated` — «访问权限已保存：… — 这次重新启用了 2 个唤醒…» when it woke rows (the answer\'s words belted: test-channel-agent-watch ⑦ (a)), «…不会唤醒任何人» only when it woke none');
} catch (e) { ok(false, '⑰ (c) threw on this tree: ' + ((e && e.stack) || e)); }

console.log('⑱ ROUND 10 — a held decision ends only when its rule is gone: the route, the words and the page say which');
try {
  // (a) THE ROUTE: a Deliver the rule cannot take NOW (`not-in-effect` — its watcher not running / not woken by it) and one whose
  // rule is GONE (`rule-gone` — ended, discarded) are 409s with their facts (who, how many, why), never a 500 the page cannot word
  const pressHeld = async (mod, answer) => {
    mod.setup({ getEngine: () => ({ decideRequest: async () => answer }) });
    const app = express(); app.use(express.json()); app.use(mod.router);
    const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {   // the whole answer (listen()'s send keeps code / error only)
      const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/channels/reach-requests/wr-held/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' }, body: '{}' });
      let j = {}; try { j = await r.json(); } catch { }
      return { status: r.status, ...j };
    } finally { await new Promise((r) => srv.close(r)); }
  };
  const NIE = { ok: false, code: 'not-in-effect', why: 'not-running', agent: 'Worker', n: 30, error: 'Worker is not running — the 30 messages stay held: Deliver once it runs, or Discard them' };
  const GONE = { ok: false, code: 'rule-gone', why: 'access-removed', n: 30, error: 'the access they were held under was removed — 30 messages discarded, nothing was sent' };
  const a1 = await pressHeld(routerFrom(REAL_SRC), NIE), a2 = await pressHeld(routerFrom(REAL_SRC), GONE);
  ok(a1.status === 409 && a1.code === 'not-in-effect' && a1.why === 'not-running' && a1.agent === 'Worker' && a1.n === 30 && a2.status === 409 && a2.code === 'rule-gone' && a2.why === 'access-removed' && a2.n === 30,
    '(a) the decide route: a held Deliver its rule cannot take now ⇒ 409 `not-in-effect` (who, how many, why); one whose rule is gone ⇒ 409 `rule-gone` — never a 500', J({ a1, a2 }));
  const MAP10 = " || code === 'not-in-effect' || code === 'rule-gone'";
  const red = REAL_SRC.split(MAP10).length === 2 ? await pressHeld(routerFrom(REAL_SRC.replace(MAP10, '')), NIE) : null;
  ok(red && red.status === 500, 'RED CONTROL: answer3 without the two codes (8b46c196 had neither) — the same press ⇒ HTTP 500', red);
} catch (e) { ok(false, '⑱ (a) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (b) THE WORDS OF AN END: a held decision ended because its watcher's ACCESS was revoked (the row stands, inert) says so — the
  // registry (the chat card) and the tray row are one sentence in en / zh / ja; the removed rule keeps r9's words
  const ended = (why) => ({ id: 'ut-r10-' + why, sessionKey: 'channels', text: '30 messages for Worker held since …', status: 'done', kind: 'action', origin: 'channels', createdAt: Date.now() - 9e4, resolvedAt: Date.now() - 6e4, resolvedBy: 'discarded', resolvedFact: { n: 30, why }, action: { type: 'channel-held-digest', id: 'wr-r10' } });
  const both = (it, t) => [FA.settledWords(it, t), ROW3.resolvedByText(it.resolvedBy, t, it)];
  const seen = { en: both(ended('access-removed'), tt3), zh: both(ended('access-removed'), Z), ja: both(ended('access-removed'), JA), removed: both(ended('watch-removed'), tt3) };
  ok(J(seen.en) === J(['the access they were held under was removed — 30 messages discarded', 'the access they were held under was removed — 30 messages discarded'])
    && seen.zh[0] === seen.zh[1] && seen.zh[0] === '它们所依据的访问权限已撤销 — 已丢弃 30 条消息' && seen.ja[0] === seen.ja[1] && seen.ja[0] === '保留の根拠だったアクセス権が取り消されました — 30 件のメッセージを破棄しました'
    && J(seen.removed) === J(['the rule they were held for was removed — 30 messages discarded', 'the rule they were held for was removed — 30 messages discarded']),
    `(b) an end by a revoked access reads «${seen.en[0]}» / «${seen.zh[0]}» / «${seen.ja[0]}» on the card AND the tray row (8b46c196: «the rule … was removed» — the rule stood); a removed rule keeps «${seen.removed[0]}»`, J(seen));
} catch (e) { ok(false, '⑱ (b) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (c) THE PAGE: the press road (the chat card and the tray) toasts both refusals in the owner's language — who, how many, why
  const UA = read('src/lib/user-todos-actions.js');
  const KEYS10 = ['{agent} is not running — the {n} messages stay held: Deliver once it runs, or Discard them', '{agent} is not woken by this rule now (not in its group, or left out of it) — the {n} messages stay held: Deliver once it is, or Discard them', 'the access they were held under was removed — {n} messages discarded', 'the rule they were held for was removed — {n} messages discarded'];
  const branch = /if \(held && r && r\.code === 'not-in-effect'\) \{ showToast\(r\.why === 'not-running' \? t\('\{agent\} is not running/.test(UA) && /if \(held && r && r\.code === 'rule-gone'\) \{ showToast\(r\.why === 'access-removed' \? t\('the access they were held under was removed/.test(UA);
  const missing = KEYS10.filter((k) => !UA.includes(`t('${k}'`) || !(k in DICT8.zh) || !(k in JA9));
  ok(branch && !missing.length, `(c) the press road toasts \`not-in-effect\` («${Z(KEYS10[0], { agent: 'Worker', n: 30 })}») and \`rule-gone\` in the owner's language — ${KEYS10.length} keys, each with zh + ja`, J({ branch, missing }));
} catch (e) { ok(false, '⑱ (c) threw on this tree: ' + ((e && e.stack) || e)); }

// ── ⑲ ROUND 11 ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑲ ROUND 11 — ONE producer contract: the run card draws the facts as the producer carries them (the folds whole, whyAgain named, the cut point said, no live name); a rule\'s reach ends its held card by name');
// the legs' facts: GENERATED by the producer (vault-agent-own's cardFactsOf + the door's whyAgainOf — r12: by
// scripts/make-vault-run-card-legs.mjs, re-derived in ⑳ (a) wherever the tree carries the producer; never hand-written)
const LEGS = JSON.parse(read('scripts/fixtures/vault-run-card-legs.json'));
const LV = Object.fromEntries(LEGS.variants.map((v) => [v.name, v.facts]));
const runItem = (facts, x = {}) => ({ id: 'ut-r11-' + (x.k || 'a'), sessionKey: 'claude:c-ops', sessionName: 'Session 1', text: 'ops wants to run a command with a stored secret', status: 'open', urgency: 'urgent', kind: 'action', origin: 'vault', by: 'agent', createdAt: Date.now() - 5e3, expiresAt: Date.now() + 55e3, action: { type: 'vault-run-ask', askId: 'f'.repeat(32) }, facts, ...x });
try {
  // (a) THE CONTRACT IS THE PRODUCER'S EXPORT (vault-agent-own's CARD_FACTS_CODES): read from this tree's src/vault-run.js when it
  // exports it (the train), else the generated fixture's `codes` (the same export, copied by the generator); the client's
  // tables — whyAgain included — name exactly its lists, each word with zh + ja
  const VR = require(path.join(SRC, 'vault-run.js'));
  const CODES = VR.CARD_FACTS_CODES || LEGS.codes;
  const tables = { always: FA.RUN_ALWAYS_WHY, hosts: FA.RUN_HOSTS_WHY, masking: FA.RUN_MASKING, shape: FA.RUN_SHAPE, whyAgain: FA.RUN_WHY_AGAIN };
  const cover = Object.entries(tables).map(([k, tb]) => [k, J(Object.keys(tb || {}).sort()) === J([...(CODES[k] || [])].sort()), Object.values(tb || {}).filter((w) => !(w in DICT8.zh) || !(w in JA9))]);
  const fx = JSON.parse(read('scripts/fixtures/vault-run-card-facts.json')).codes;
  const sameAsShared = J([fx.always_why, fx.hosts_why, fx.masking, fx.shape]) === J([LEGS.codes.always, LEGS.codes.hosts, LEGS.codes.masking, LEGS.codes.shape]);
  ok(Object.keys(CODES).length === 5 && cover.every(([, same, miss]) => same && !miss.length) && sameAsShared && LEGS.variants.length >= 13,
    `(a) THE RENDERER PIN (owed to vault-agent-own): the client's tables name exactly CARD_FACTS_CODES (${VR.CARD_FACTS_CODES ? "this tree's export" : 'the generated copy of the producer\'s export'}) — always ×${CODES.always.length}, hosts ×${CODES.hosts.length}, masking ×1, shape ×2, whyAgain ×${(CODES.whyAgain || []).length} — each with zh + ja (704a0f4c: no whyAgain table)`, cover);
} catch (e) { ok(false, '⑲ (a) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (b) THE FOLDS (r25 clipFold): the producer's 2 100-character env value and 2 100-character secret name, filed through the
  // store (kept byte-identical — inside the bound) and drawn: the face says each is cut, the fold holds each WHOLE
  const { m, done } = storeWith(FA);
  try {
    const f = LV.fold, note = f.env[0], name = f.secrets[0];
    const it = m.get(m.add('claude:r11-fold', { text: 'fold', origin: 'vault', action: { type: 'vault-run-ask', askId: '1'.repeat(32) }, facts: f }).id);
    const v = FA.runCardOf(it, { t: Z });
    const wholeNote = note.valueFull.join(''), wholeName = name.nameFull.join('');
    const box = v && v.fold.find((x) => x.cmd === `${wholeNote}`);
    const envLine = v && v.fold.find((x) => x.label === '环境变量');
    const secLine = v && v.fold.find((x) => x.label === '密钥');
    const html = ROW3.runFactsHtml(it, Z);
    ok(J(it.facts) === J(f) && note.valueCut === true && wholeNote.length === 2100 && name.nameCut === true && wholeName.length === 2100
      && !!box && box.label === 'RUN_NOTE（完整的值）' && !!envLine && J(envLine.lines[0]) === J([{ mono: 'RUN_NOTE=' }, { aside: '（值共 2100 个字符 — 卡片上已截短，完整的值在下方）' }])
      && !!secLine && secLine.lines[0][0].text === wholeName && secLine.lines[0].some((x) => x.aside === '（卡片上已截短 — 这里是完整的）')
      && v.rows.find((r) => r.key === 'secrets').lines[0][0].text === 'UniFi 账号' && v.headline.length < 80 && html.includes(`<pre class="ut-run-cmd ut-run-cmd-full">${wholeNote}</pre>`),
      `(b) THE FOLDS DRAWN WHOLE: the producer's 2 100-character env value — the env line «RUN_NOTE= ${envLine && envLine.lines[0][1] && envLine.lines[0][1].aside}», its WHOLE in a box of its own «${box && box.label}»; the 2 100-character secret name whole in the fold, the face's headline and secrets row its entry head «UniFi 账号» (704a0f4c: a 2 000-character value with no marker, the 100 more characters nowhere)`, J({ store: J(it.facts) === J(f), box: !!box, envLine: envLine && envLine.lines, secHead: v && v.rows.find((r) => r.key === 'secrets') }).slice(0, 900));
    const d = m.get(m.add('claude:r11-dir', { text: 'dir', origin: 'vault', action: { type: 'vault-run-ask', askId: '2'.repeat(32) }, facts: LV['directive-long'] }).id);
    const vd = FA.runCardOf(d, { t: tt3 }), dirWhole = LV['directive-long'].always.directiveFull.join('');
    const hintDir = vd && (vd.always.hint.find((x) => x.mono != null) || {}).mono;
    ok(dirWhole.length > 2000 && !!hintDir && hintDir.length === 2001 && hintDir.endsWith('…') && vd.fold.some((x) => x.label === 'Its config directive (whole)' && x.cmd === dirWhole),
      `(b) the «Always» hint's directive past the bound: its clip + «…» beside the buttons (${hintDir && hintDir.length} characters), its WHOLE (${dirWhole.length}) under the fold`, J({ hint: hintDir && hintDir.slice(-12) }));
  } finally { done(); }
} catch (e) { ok(false, '⑲ (b) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (c) WHY IT ASKS AGAIN: each dimension the door's whyAgainOf names, worded in en / zh / ja on the card's face (the ONE
  // renderer: the tray row, the chat card and the For-you window); a code this client has no words for is drawn as a code
  const AG = ['fold', 'again-env', 'again-folder', 'again-secret-set', 'again-arg-space', 'again-args'];
  const said = Object.fromEntries(AG.map((n) => [LV[n].whyAgain.code, { en: (FA.runCardOf(runItem(LV[n]), { t: tt3 }) || {}).again, zh: (FA.runCardOf(runItem(LV[n]), { t: Z }) || {}).again, ja: (FA.runCardOf(runItem(LV[n]), { t: JA }) || {}).again }]));
  const words = (x) => (x || []).map((p) => p.text != null ? p.text : `[${p.code}]`).join('');
  const W = { 'arg-order': 'Asked again — it differs from the command you let through: its arguments are in another order', env: 'Asked again — it differs from the command you let through: its environment variable RUN_TAG changed' };
  const odd = FA.runCardOf(runItem({ ...LV['again-args'], whyAgain: { code: 'arg-weather' } }), { t: tt3 });
  const html = ROW3.runFactsHtml(runItem(LV['again-env']), Z);
  ok(J(Object.keys(said).sort()) === J([...LEGS.codes.whyAgain].sort()) && words(said['arg-order'].en) === W['arg-order'] && words(said.env.en) === W.env
    && words(said['arg-order'].zh) === '再次询问 — 与你放行过的命令不同：参数顺序不同' && words(said.env.zh) === '再次询问 — 与你放行过的命令不同：环境变量 RUN_TAG 变了' && words(said['arg-space'].ja) === '再確認 — 通したコマンドと違います：引数の間の空白が違います'
    && Object.values(said).every((x) => !/\[/.test(words(x.zh)) && !/\[/.test(words(x.ja))) && /\[arg-weather\]$/.test(words(odd.again))
    && html.includes('<div class="ut-run-again">再次询问 — 与你放行过的命令不同：环境变量 RUN_TAG 变了</div>') && FA.runCardOf(runItem(LV.ops), { t: tt3 }).again === null,
    `(c) WHY IT ASKS AGAIN — the door's ${Object.keys(said).length} dimensions named on the card's face: «${words(said['arg-order'].en)}» · «${words(said.env.zh)}» · «${words(said['arg-space'].ja)}»; an unknown code drawn as a code; a first ask says nothing (704a0f4c: no line — «mentions arg-order? false»)`, J(Object.fromEntries(Object.entries(said).map(([k, x]) => [k, words(x.zh)]))));
} catch (e) { ok(false, '⑲ (c) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (d) WHO IS THE FACTS' (主开发: «a fallback that reads the hub is a fact nobody produced»): the card's actor is `facts.who`;
  // facts that carry none say «an agent», never the record's live session name; a clipped who says it is clipped
  const v1 = FA.runCardOf(runItem(LV.ops), { t: tt3 });
  const { who, ...noWho } = LV.ops;
  const v2 = FA.runCardOf(runItem(noWho), { t: tt3 });
  const v3 = FA.runCardOf(runItem({ ...LV.ops, who: 'w'.repeat(2000), whoCut: true }), { t: tt3 });
  ok(/^ops watch wants to run unifi-api\.sh with “UniFi 账号”$/.test(v1.headline) && /^An agent wants to run/.test(v2.headline) && !/Session 1/.test(v2.headline) && v3.headline.startsWith('w'.repeat(2000) + '…'),
    `(d) THE ACTOR IS THE FACTS' WHO: «${v1.headline}»; facts with no who ⇒ «${v2.headline.slice(0, 40)}…» (704a0f4c: the record's live name «Session 1 …»); a clipped who drawn with «…»`, J({ v1: v1.headline, v2: v2.headline }));
} catch (e) { ok(false, '⑲ (d) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (e) r12 — NO `cmdLen` (主开发's ruling on the r11 acceptance's minor: no producer emits it — the r9 «cut at K» branch was
  // reached only by a hand-built field, and its kb example with it): a hand-built cmdLen changes nothing; a whole fold states its
  // sum, a store-cut fold «over 4096»; the renderer's source reads no cmdLen and the kb promises no «cut at»
  const f0 = LV['clip-5037'], whole = f0.cmdFull.join('');
  const card = (n, len, cut = null) => FA.runCardOf(runItem({ ...f0, cmdFull: (() => { const x = whole.slice(0, n), o = []; for (let i = 0; i < x.length; i += 2000) o.push(x.slice(i, i + 2000)); return o; })(), ...(len ? { cmdLen: len } : {}), ...(cut ? { cut } : {}) }), { t: tt3 });
  const a = card(3000, 3500), b = card(3000, null), c = card(4096, 5037, ['cmdFull']), d = card(4096, null, ['cmdFull']);
  const code = read('src/foryou-actions.js').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
  ok(J(a.cut) === J(b.cut) && b.cut.whole === true && b.cut.n === 3000 && J(c.cut) === J(d.cut) && /^The command is over 4096 characters/.test(d.cut.text) && !/cmdLen/.test(code)
    && !/cut at \{k\}/.test(read('src/foryou-actions.js')) && !/cut at 3000/.test(read('docs/kb-features.md')) && !('The command is {n} characters long — cut at {k}, so the whole command was not kept: see its run record in the Vault window. The card shows its first {m}.' in DICT8.zh),
    `(e) r12 — NO cmdLen: a hand-built cmdLen 3 500 over a 3 000 fold reads as the fold says («${a.cut.text.slice(0, 48)}…»), a store-cut fold «${d.cut.text.slice(0, 44)}…» with or without one; no code line reads cmdLen, no «cut at» key or kb example is left (1ad060a82: «3500 characters long — cut at 3000»)`, J({ a: a.cut, d: d.cut }));
} catch (e) { ok(false, '⑲ (e) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (f) THE MINOR's words: a held decision the rule no longer covers ended — the card and the tray row in en / zh / ja, and the
  // press road's toast for a Deliver that found it so (409 rule-gone, why 'not-covered')
  const ended = { id: 'ut-r11-nc', sessionKey: 'channels', text: '30 messages for Worker held since …', status: 'done', kind: 'action', origin: 'channels', createdAt: Date.now() - 9e4, resolvedAt: Date.now() - 6e4, resolvedBy: 'discarded', resolvedFact: { n: 30, why: 'not-covered' }, action: { type: 'channel-held-digest', id: 'wr-r11' } };
  const both = (t) => [FA.settledWords(ended, t), ROW3.resolvedByText(ended.resolvedBy, t, ended)];
  const seen = { en: both(tt3), zh: both(Z), ja: both(JA) };
  const UA = read('src/lib/user-todos-actions.js');
  const toast = /r\.why === 'not-covered' \? \(Number\(r\.convs\) > 1 \? t\('the rule no longer covers its \{m\} conversations — \{n\} messages discarded'[^\n]*: t\('the rule no longer covers this conversation — \{n\} messages discarded'/.test(UA);   // r12: a digest's every conversation
  ok(J(seen.en) === J(['the rule no longer covers this conversation — 30 messages discarded', 'the rule no longer covers this conversation — 30 messages discarded']) && seen.zh[0] === seen.zh[1] && seen.zh[0] === '规则已不再覆盖这个会话 — 已丢弃 30 条消息' && seen.ja[0] === seen.ja[1] && seen.ja[0] === 'ルールがこの会話を対象にしなくなりました — 30 件のメッセージを破棄しました' && toast,
    `(f) a held decision out of its rule's reach reads «${seen.en[0]}» / «${seen.zh[0]}» / «${seen.ja[0]}» on the card AND the tray row; the press road toasts it (704a0f4c: «settled»)`, J({ seen, toast }));
} catch (e) { ok(false, '⑲ (f) threw on this tree: ' + ((e && e.stack) || e)); }

// ── ⑳ ROUND 12 ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑳ ROUND 12 — the legs re-derived from the producer; a fold that did not arrive is said, never drawn whole; the folder and the program path folded; a held decision ends per conversation, said');
try {
  // (a) THE LEGS ARE THE PRODUCER'S, CHECKED (the r11 acceptance's minor: the generator lived outside the repo and nothing went
  // red when the producer drifted): scripts/make-vault-run-card-legs.mjs is the fixture's named author; on a tree that carries
  // the producer (the train) the legs are re-derived HERE and every variant + the codes must equal the fixture — a drift is RED
  // by name; a tree without one (this lane's own) says so by name
  const G = await import(pathToFileURL(path.join(REPO, 'scripts', 'make-vault-run-card-legs.mjs')).href);
  const named = fs.existsSync(path.join(REPO, 'scripts', 'make-vault-run-card-legs.mjs')) && /node scripts\/make-vault-run-card-legs\.mjs --write/.test(LEGS._) && G.LEGS_FILE === 'scripts/fixtures/vault-run-card-legs.json';
  const prod = G.producerOf(REPO);
  if (!prod.ok) ok(named, `(a) SKIP by name — this tree carries no producer (${prod.why}): the legs are re-derived where it does (the train; a variant or a code that moved is RED there); the fixture names its in-tree generator`, J({ named, why: prod.why }));
  else {
    const { legs } = G.legsOf(REPO);
    const mine = Object.fromEntries(LEGS.variants.map((v) => [v.name, J(v)])), now = Object.fromEntries(legs.variants.map((v) => [v.name, J(v)]));
    const drift = [...new Set([...Object.keys(mine), ...Object.keys(now)])].filter((k) => mine[k] !== now[k]);
    const moved = ['src/vault-run.js', 'src/server/vault-run-door.js'].filter((f) => LEGS.producer[f] !== legs.producer[f]);
    ok(named && G.factsPart(legs) === G.factsPart(LEGS),
      `(a) THE LEGS RE-DERIVED from this tree's producer = the fixture (codes + ${legs.variants.length} variants)${moved.length ? ` — the producer's ${moved.join(' + ')} moved (its hash), its facts did not` : ''}${drift.length ? ` — DRIFT: ${drift.join(', ')} (regenerate: node scripts/make-vault-run-card-legs.mjs --write)` : ''}`, J({ drift, codes: J(legs.codes) === J(LEGS.codes), moved }));
  }
} catch (e) { ok(false, '⑳ (a) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (b) A FOLD THAT DID NOT ARRIVE (the r11 acceptance, probe-producer-fold-seam.cjs: a *Cut without its *Full drew the 2 000-char
  // clip as «its whole value» with a wrong length): every such field is drawn as its clip + «…», said «cut — the rest is not
  // available» — no «whole» box, no length
  const strip = (f, drop) => { const x = JSON.parse(J(f)); drop(x); return x; };
  const fe = strip(LV.fold, (x) => { delete x.env[0].valueFull; delete x.secrets[0].nameFull; });
  const fd = strip(LV['directive-long'], (x) => { delete x.always.directiveFull; });
  const ff = strip(LV['folder-long'], (x) => { delete x.folderFull; delete x.tool.pathFull; });
  const ve = FA.runCardOf(runItem(fe), { t: tt3 }), vd = FA.runCardOf(runItem(fd), { t: tt3 }), vf = FA.runCardOf(runItem(ff), { t: tt3 }), vz = FA.runCardOf(runItem(fe), { t: Z });
  const LOST = '(cut — the rest is not available)';
  const envLine = ve.fold.find((x) => x.label === 'Environment').lines[0], secLine = ve.fold.find((x) => x.label === 'Secrets').lines[0];
  const folderRow = vf.rows.find((r) => r.key === 'folder').lines[0], progFold = vf.fold.find((x) => x.label === 'Program');
  ok(envLine[0].mono === 'RUN_NOTE=' + fe.env[0].value + '…' && envLine[1] && envLine[1].aside === LOST && !ve.fold.some((x) => /its whole value/.test(x.label)) && !/2100|2000 characters/.test(J(envLine))
    && secLine.some((x) => x.aside === LOST) && !secLine.some((x) => x.aside === '(shortened on the card — whole here)')
    && !vd.fold.some((x) => x.label === 'Its config directive (whole)')
    && folderRow[0].mono === ff.folder + '…' && folderRow[1] && folderRow[1].aside === LOST && !vf.fold.some((x) => x.label === 'Working folder (whole)') && progFold && progFold.cmd == null && progFold.lines[0].some((x) => x.aside === LOST)
    && vz.fold.find((x) => x.label === '环境变量').lines[0][1].aside === '（已截断 — 其余部分不可用）' && JA(LOST) === '（切り詰め — 残りは取得できません）',
    `(b) A *Cut WITHOUT ITS *Full is said, never drawn whole: the env value «RUN_NOTE=<2 000>… ${envLine[1] && envLine[1].aside}» (no «its whole value» box, no length), the secret name, the «Always» directive (no «whole» box), the folder and the program path — «${Z(LOST)}» (1ad060a82: the clip in a box titled «RUN_NOTE (its whole value)», «its value is 2000 characters»)`, J({ env: envLine, folder: folderRow }));
} catch (e) { ok(false, '⑳ (b) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (c) THE FOLDER AND THE PROGRAM PATH FOLDED (vault-agent-own r27 by this lane — the producer's clipFold; probe-producer-
  // unmarked-clips.cjs): a run in a 2 207-character folder, its program at the TAIL — through the store, drawn: the face's folder
  // its clip + «…» said, the program row relative to the WHOLE folder («run.sh»), the fold the folder and the path WHOLE in boxes
  // of their own; a 2 100-character reason reference whole on its line
  const { m, done } = storeWith(FA);
  try {
    const f = LV['folder-long'], folderWhole = f.folderFull.join(''), pathWhole = f.tool.pathFull.join('');
    const it = m.get(m.add('claude:r12-folder', { text: 'folder', origin: 'vault', action: { type: 'vault-run-ask', askId: '3'.repeat(32) }, facts: f }).id);
    const v = FA.runCardOf(it, { t: Z }), html = ROW3.runFactsHtml(it, Z);
    const fr = v.rows.find((r) => r.key === 'folder').lines[0], pr = v.rows.find((r) => r.key === 'program').lines[0];
    const fb = v.fold.find((x) => x.label === '工作文件夹（完整）'), pb = v.fold.find((x) => x.label === '程序');
    const ar = LV['away-ref-long'], refWhole = ar.reason.away[0].refFull.join('');
    const va = FA.runCardOf(runItem(ar), { t: tt3 }), why = va.fold.find((x) => x.label === 'Why it asks');
    ok(J(it.facts) === J(f) && f.folderCut === true && f.tool.pathCut === true && folderWhole.endsWith('/evil-tail') && pathWhole.endsWith('/evil-tail/run.sh')
      && fr[0].mono === f.folder + '…' && fr[1] && fr[1].aside === '（已截短 — 完整路径在「技术细节」里）' && pr[0].mono === 'run.sh'
      && fb && fb.cmd === folderWhole && pb && pb.cmd === pathWhole && html.includes(`<pre class="ut-run-cmd ut-run-cmd-full">${pathWhole}</pre>`)
      && ar.reason.away[0].refCut === true && refWhole.length === 2100 && why && why.lines.some((l) => l[0].mono === refWhole),
      `(c) THE FOLDER AND THE PATH FOLDED: a ${folderWhole.length}-character folder — the face «${fr[0].mono.slice(0, 16)}…${fr[0].mono.slice(-12)} ${fr[1] && fr[1].aside}», the program row «${pr[0].mono}» (relative to the WHOLE folder), the fold «${fb && fb.label}» + «${pb && pb.label}» WHOLE (…/evil-tail/run.sh); a ${refWhole.length}-character reason reference whole on its line (1ad060a82 + the train's producer: a 2 000-character folder, no «…», no tail)`, J({ face: [fr[0].mono.length, pr[0].mono], boxes: [fb && fb.cmd.length, pb && pb.cmd.length] }));
  } finally { done(); }
} catch (e) { ok(false, '⑳ (c) threw on this tree: ' + ((e && e.stack) || e)); }
try {
  // (d) THE HELD DECISION, PER CONVERSATION (M1 + M2 — the r11 acceptance's two majors; the engine legs: test-channel-agent-watch ⑩):
  // the card says what part was dropped («… — deliver or discard · the rule no longer covers 1 of 2 conversations — 30 held
  // messages dropped»), the record and the tray row say it after Deliver / Discard, a digest whose every conversation went says
  // «its 2 conversations», the press road toasts it — en / zh / ja, each key with zh + ja
  const KEYS12 = ['{n} messages for {agent} held since {date} — deliver or discard · the rule no longer covers {k} of {m} conversations — {d} held messages dropped',
    '{n} messages for {agent} held since {date} — deliver or discard · {k} of {m} conversations no longer wake {agent} — {d} held messages dropped',
    'the rule no longer covers {k} of {m} conversations — {d} held messages dropped', '{k} of {m} conversations no longer wake {agent} — {d} held messages dropped',
    'the rule no longer covers its {m} conversations — {n} messages discarded'];
  const drop = { n: 30, k: 1, of: 2, why: 'not-covered', agent: 'Worker' };
  const item = (by, fact) => ({ id: 'ut-r12-' + by, sessionKey: 'channels', text: '30 messages for Worker held since …', status: 'done', kind: 'action', origin: 'channels', createdAt: Date.now() - 9e4, resolvedAt: Date.now() - 6e4, resolvedBy: by, resolvedFact: fact, action: { type: 'channel-held-digest', id: 'wr-r12' } });
  const both = (it, t) => [FA.settledWords(it, t), ROW3.resolvedByText(it.resolvedBy, t, it)];
  const del = item('delivered', { n: 30, dropped: drop }), dis = item('discarded', { n: 30, dropped: { ...drop, why: 'watch-removed' } }), all = item('discarded', { n: 60, why: 'not-covered', convs: 2 });
  const seen = { en: [both(del, tt3), both(dis, tt3), both(all, tt3)], zh: [both(del, Z), both(all, Z)], ja: [both(del, JA)] };
  const SRVK = read('src/server/channels-access.js'), UA = read('src/lib/user-todos-actions.js');
  const keyed = KEYS12.filter((k) => !(k in DICT8.zh) || !(k in JA9) || !(SRVK.includes(`i18nKey('${k}')`) || UA.includes(`t('${k}'`) || read('src/foryou-actions.js').includes(`t('${k}'`)));
  const toast = /const droppedWords = d \? ' · ' \+ \(r\.dropped\.why === 'not-covered' \? t\('the rule no longer covers \{k\} of \{m\} conversations — \{d\} held messages dropped', d\) : t\('\{k\} of \{m\} conversations no longer wake \{agent\} — \{d\} held messages dropped', d\)\)/.test(UA) && /\+ droppedWords \+ skippedWords/.test(UA);
  const head = Z(KEYS12[0], { n: 30, agent: 'Worker', date: '2026-10-26 17:01 PT', k: 1, m: 2, d: 30 });
  ok(J(seen.en[0]) === J(Array(2).fill('delivered · the rule no longer covers 1 of 2 conversations — 30 held messages dropped'))
    && J(seen.en[1]) === J(Array(2).fill('discarded — nothing was sent · 1 of 2 conversations no longer wake Worker — 30 held messages dropped'))
    && J(seen.en[2]) === J(Array(2).fill('the rule no longer covers its 2 conversations — 60 messages discarded'))
    && J(seen.zh[0]) === J(Array(2).fill('已投递 · 规则已不再覆盖 2 个会话中的 1 个 — 已丢弃 30 条搁置的消息')) && J(seen.zh[1]) === J(Array(2).fill('规则已不再覆盖它的 2 个会话 — 已丢弃 60 条消息'))
    && seen.ja[0][0] === seen.ja[0][1] && seen.ja[0][0] === '配信済み · ルールが 2 件中 1 件の会話を対象にしなくなりました — 保留中のメッセージ 30 件を破棄しました'
    && head === '30 条给 Worker 的消息自 2026-10-26 17:01 PT 起被搁置 — 投递还是丢弃 · 规则已不再覆盖 2 个会话中的 1 个 — 已丢弃 30 条搁置的消息' && !keyed.length && toast,
    `(d) PER CONVERSATION, SAID: the open card «${head}»; the record and the tray row «${seen.en[0][0]}» / «${seen.zh[0][0]}» / «${seen.ja[0][0]}»; a digest whose every conversation went «${seen.en[2][0]}»; the press road toasts the part (1ad060a82: «delivered» for 60 with 30 of them dropped unsaid)`, J({ seen, keyed, toast }));
} catch (e) { ok(false, '⑳ (d) threw on this tree: ' + ((e && e.stack) || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
