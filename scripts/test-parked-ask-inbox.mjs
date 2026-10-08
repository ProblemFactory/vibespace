#!/usr/bin/env node
// LANE PARKED-ASK-INBOX (owner 2026-10-07: "那个'等你操作'的状态会进 inbox 或者窗口闪烁提醒吗？"; a fleet user's
// conversation sat 22 h on a Bash permission ask on a hidden desktop — the blink was on a desktop nobody looked at,
// the For-you tray said nothing). A MAIN conversation's own ask unanswered for 60 s is ONE For-you item, resolved by
// its answer — the twin of the helper's (src/server/helper-asks.js).
//
// Fast, in-process, no network:
//   ① THE TABLE (src/main-ask.js MAIN_ASK_KINDS — a row per kind, en/zh/ja; the locale files hold the same words) +
//     THE PRODUCER CENSUS (every `permission.kind` a normalizer writes has a row; a planted new kind ⇒ RED)
//   ② the REAL engine (src/server/main-asks.js) over the REAL claude normalizer through the live gate: a Bash ask
//     open 60 s ⇒ ONE item (words, origin agent, kind action, urgency high, the action naming the request + session);
//     answered at 30 s ⇒ none; answered after filing ⇒ resolved; withdrawn ⇒ resolved; kill (forget) ⇒ resolved;
//     a focused, attached window still files
//   ③ the restart: the rebuilt card at 40 s ⇒ ONE item at 60 s from the ASK's instant; an item filed before a restart
//     + a renamed conversation ⇒ still ONE item (keyed by the ask)
//   ④ AskUserQuestion + ExitPlanMode + a codex-shaped stub normalizer (no pending level: the permission-op trigger)
//   ⑤ wiring pins (install, the two forget sites, one item per ask, the card-action reply refusal, the jump)
//   ⑥ THREE PATCHED-COPY CONTROLS (scripts/mutant-copy.mjs): filed twice ⇒ RED; never resolved ⇒ RED; a
//     visible-window skip ⇒ RED
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const M = require(path.join(REPO, 'src/main-ask.js'));
const H = require(path.join(REPO, 'src/helper-ask.js'));
const N = require(path.join(REPO, 'src/normalizers.js'));
const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
const { MessageWindow } = require(path.join(REPO, 'src/message-window.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const MA = require(path.join(REPO, 'src/server/main-asks.js'));
const MAIN_ASKS_SRC = read('src/server/main-asks.js');
const quiet = { log() {}, warn(m) { console.error('    warn:', m); } };

// ── ① THE TABLE + THE PRODUCER CENSUS ──
console.log('① the table + the producer census');
const PRODUCERS = ['src/message-manager.js', 'src/codex-message-manager.js', 'src/acp-message-manager.js'];
/** Every `kind` a normalizer writes into a permission record: the object literal(s) assigned to `…permission = …;`
 *  (brace-balanced to the statement's end — a ternary of two literals counts both) + `permission.kind = '…'`. */
function askKindsIn(src) {
  const kinds = new Set();
  const re = /\bpermission\s*=\s*(?!=)/g;
  let m;
  while ((m = re.exec(src))) {
    // the record's OWN keys only (depth 1 of each literal): a nested `{ kind: 'allow_always' }` (ACP's suggestions) is not an ask kind
    for (let i = m.index + m[0].length, depth = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '{' || c === '(' || c === '[') depth++; else if (c === '}' || c === ')' || c === ']') depth--; else if (c === ';' && depth <= 0) break;
      if (depth === 1 && /[\s,{]/.test(c)) { const k = /^kind:\s*'(\w+)'/.exec(src.slice(i + 1, i + 40)); if (k) kinds.add(k[1]); }
    }
  }
  for (const k of src.matchAll(/\bpermission\.kind\s*=\s*'(\w+)'/g)) kinds.add(k[1]);
  return kinds;
}
const census = (files) => { const out = new Set(); for (const src of Object.values(files)) for (const k of askKindsIn(src)) out.add(k); return out; };
const realFiles = Object.fromEntries(PRODUCERS.map((f) => [f, read(f)]));
const seen = census(realFiles);
const missing = [...seen].filter((k) => !Object.prototype.hasOwnProperty.call(M.RECORD_KINDS, k));
ok('the census reads the producers: user_input + approval (+ the claude no-kind tool permission)', seen.has('user_input') && seen.has('approval'), [...seen]);
ok('every permission kind a normalizer writes has a row in RECORD_KINDS', missing.length === 0, missing);
const planted = { ...realFiles, 'src/codex-message-manager.js': realFiles['src/codex-message-manager.js'].replace("permission.kind = 'user_input';", "permission.kind = 'user_input';\n    } else if (method === 'item/x/requestReview') {\n      permission.kind = 'review';") };
const plantedMissing = [...census(planted)].filter((k) => !Object.prototype.hasOwnProperty.call(M.RECORD_KINDS, k));
ok('CONTROL: a planted new ask kind (codex requestReview → kind review) without a row ⇒ the census is RED', planted['src/codex-message-manager.js'] !== realFiles['src/codex-message-manager.js'] && plantedMissing.join() === 'review', plantedMissing);
ok('the plan row is the tool the product names (chat-renderers ExitPlanMode)', M.PLAN_TOOLS.every((t) => read('src/lib/chat-renderers.js').includes(`${t}: t(`)));
ok('ONE clock: MAIN_ASK_INBOX_MS is the helper\'s constant (60 s)', M.MAIN_ASK_INBOX_MS === H.HELPER_ASK_INBOX_MS && M.MAIN_ASK_INBOX_MS === 60000);
const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
const rowsOk = Object.entries(M.MAIN_ASK_KINDS).every(([, r]) => r.en && r.zh && r.ja && zh.includes(`${JSON.stringify(r.en)}: ${JSON.stringify(r.zh)}`) && ja.includes(`${JSON.stringify(r.en)}: ${JSON.stringify(r.ja)}`));
ok('every row has en/zh/ja words and the locale files hold the same zh/ja', rowsOk && Object.keys(M.MAIN_ASK_KINDS).sort().join() === 'command,plan,question,tool,tool-bare');
const words = (perm) => M.inboxItemFor(M.mainAskOf(perm), { name: 'docusign', sessionId: 's1' });
ok('words: a Bash ask names the command', words({ requestId: 'r', toolName: 'Bash', input: { command: 'rm -rf ./ds-out && ./sign.sh' } }).text === 'docusign is waiting for you: permission to run `rm -rf ./ds-out && ./sign.sh`');
ok('words: another tool names the tool + its first words; a multi-line subject says there is more', words({ requestId: 'r', toolName: 'WebFetch', input: { url: 'https://example.com/a' } }).text === 'docusign is waiting for you: permission to use WebFetch (https://example.com/a)' && / …\`$/.test(words({ requestId: 'r', toolName: 'Bash', input: { command: 'ls\nrm x' } }).text));
ok('words: a question names the question; the plan names the plan', words({ requestId: 'r', toolName: 'AskUserQuestion', kind: 'user_input', questions: [{ question: 'Which database?' }] }).text === 'docusign is waiting for you: a question: Which database?' && words({ requestId: 'r', toolName: 'ExitPlanMode', input: { plan: 'x' } }).text === 'docusign is waiting for you: the plan awaits your approval');
const w0 = words({ requestId: 'r', toolName: 'Bash', input: { command: 'rm -rf ./ds-out' } });
ok('the detail carries the whole request + the way out (answer, or Stop it); the action names the request + the session; i18n = the row key', /^Bash: rm -rf \.\/ds-out\n/.test(w0.detail) && /Open the conversation and answer.*or Stop it\.$/.test(w0.detail) && w0.action.type === 'main-ask' && w0.action.requestId === 'r' && w0.action.sessionId === 's1' && w0.i18n.text.key === M.MAIN_ASK_KINDS.command.en);
ok('a settled or stale permission is no ask', M.mainAskOf({ requestId: 'r', resolved: 'allowed' }) === null && M.mainAskOf({ requestId: 'r', stale: true }) === null);

// ── the rig ──
const TU = 'toolu_01PARKEDxInbox', RID = 'b3f1e2a4-6c5d-4e7f-8a9b-0c1d2e3f4a5b';
const tool = (id, name, input) => ({ type: 'assistant', uuid: 'a-' + id, message: { id: 'msg_' + id, role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } });
const ask = (rid, id, name, input) => ({ type: 'control_request', request_id: rid, request: { subtype: 'can_use_tool', tool_name: name, input, tool_use_id: id } });
const allow = (rid) => ({ type: 'control_response', response: { subtype: 'success', request_id: rid, response: { behavior: 'allow', updatedInput: {} } } });
const cancel = (rid) => ({ type: 'control_cancel_request', request_id: rid });
const BASH = { command: 'bash -c "rm -rf ./ds-out && ./sign.sh"' };
let seq = 0;
function rig(mod = MA, { name = 'docusign', persisted = new Map() } = {}) {
  const dataDir = scratchDir('parked-ask-inbox-' + (++seq));
  const todos = new UserTodoManager({ dataDir, onChange: () => {}, expirySweepMs: 0 });
  const act = new Map();
  mod.install({ userTodos: todos, sessionKeyFor: (s, id) => `claude:${id}`, activeSessions: act, log: quiet, readAskedAt: (s) => persisted.get(s._webuiId) || null, persistAskedAt: (s, map) => persisted.set(s._webuiId, { ...map }) });
  const mk = (id, nm = name) => { const s = { _webuiId: id, name: nm, backend: 'claude', _normalizer: new MessageManager(id), _historyLoaded: true }; act.set(id, s); return s; };
  const items = (id, status = null) => todos._state.items.filter((i) => i.sessionKey === `claude:${id}` && i.action && i.action.type === 'main-ask' && (!status || i.status === status));
  return { todos, act, mk, items, persisted };
}
const feed = (s, ...recs) => { for (const r of recs) N.feedLive(s, r); };

// ── ② THE REAL ENGINE OVER THE REAL NORMALIZER ──
console.log('② a permission ask, the real engine');
function scenarios(mod) {
  const out = {};
  { // open 60 s ⇒ ONE item
    const R = rig(mod); const s = R.mk('sess-a'); const t0 = Date.now();
    feed(s, tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH));
    mod.sync(s, t0 + 59_000); const at59 = R.items('sess-a').length;
    mod.sync(s, t0 + 60_500); mod.sync(s, t0 + 61_000); mod.sync(s, t0 + 120_000);
    const it = R.items('sess-a', 'open');
    out.filed = { at59, open: it.length, all: R.items('sess-a').length, text: it[0]?.text, origin: it[0]?.origin, kind: it[0]?.kind, urgency: it[0]?.urgency, action: it[0]?.action, persisted: R.persisted.get('sess-a') };
    feed(s, allow(RID)); // answered after filing
    out.answeredAfter = { open: R.items('sess-a', 'open').length, done: R.items('sess-a', 'done').length, by: R.items('sess-a')[0]?.resolvedBy };
  }
  { // answered at 30 s ⇒ none
    const R = rig(mod); const s = R.mk('sess-b'); const t0 = Date.now();
    feed(s, tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH));
    mod.sync(s, t0 + 30_000); feed(s, allow(RID)); mod.sync(s, t0 + 61_000); mod.sync(s, t0 + 300_000);
    out.answered30 = R.items('sess-b').length;
  }
  { // withdrawn after filing ⇒ resolved
    const R = rig(mod); const s = R.mk('sess-c'); const t0 = Date.now();
    feed(s, tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH)); mod.sync(s, t0 + 61_000);
    const before = R.items('sess-c', 'open').length; feed(s, cancel(RID));
    out.withdrawn = { before, open: R.items('sess-c', 'open').length };
  }
  { // kill ⇒ resolved; a late sync files nothing
    const R = rig(mod); const s = R.mk('sess-d'); const t0 = Date.now();
    feed(s, tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH)); mod.sync(s, t0 + 61_000);
    const before = R.items('sess-d', 'open').length; const n = mod.forget(s); mod.sync(s, t0 + 200_000);
    out.killed = { before, n, open: R.items('sess-d', 'open').length, all: R.items('sess-d').length };
  }
  { // a focused, attached window on the active desktop still files (no "visible ⇒ skip")
    const R = rig(mod); const s = R.mk('sess-e'); s.clients = new Set([{ focused: true, visible: true }]); s._clientCount = 1; const t0 = Date.now();
    feed(s, tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH)); mod.sync(s, t0 + 61_000);
    out.visible = R.items('sess-e', 'open').length;
  }
  { // ③ the restart at 40 s: the rebuilt card, the clock from the ASK's instant
    const R = rig(mod); const s1 = R.mk('sess-f'); const t0 = Date.now();
    feed(s1, tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH));
    const stamped = R.persisted.get('sess-f')?.[RID];
    const R2 = rig(mod, { persisted: R.persisted }); R2.todos._state.items = R.todos._state.items; // the same store across the restart
    const s2 = { _webuiId: 'sess-f', name: 'docusign', backend: 'claude', _historyLoaded: true };
    const mm = new MessageManager('sess-f'); for (const r of [tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH)]) mm.processLive(r); // the rebuilt card
    s2._normalizer = mm; R2.act.set('sess-f', s2);
    mod.sync(s2, t0 + 40_000); const at40 = R2.items('sess-f').length;
    mod.sync(s2, t0 + 60_500); const at60 = R2.items('sess-f', 'open').length;
    mod.sync(s2, t0 + 90_000);
    out.restart40 = { stamped: Math.abs((stamped || 0) - t0) < 5000, at40, at60, all: R2.items('sess-f').length };
  }
  { // an item filed BEFORE a restart + the conversation renamed meanwhile ⇒ still ONE item (keyed by the ask)
    const R = rig(mod); const s1 = R.mk('sess-g'); const t0 = Date.now();
    feed(s1, tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH)); mod.sync(s1, t0 + 61_000);
    const before = R.items('sess-g', 'open').length;
    const R2 = rig(mod, { persisted: R.persisted }); R2.todos._state.items = R.todos._state.items;
    const s2 = { _webuiId: 'sess-g', name: 'docusign · signing run', backend: 'claude', _historyLoaded: true };
    const mm = new MessageManager('sess-g'); for (const r of [tool(TU, 'Bash', BASH), ask(RID, TU, 'Bash', BASH)]) mm.processLive(r);
    s2._normalizer = mm; R2.act.set('sess-g', s2);
    mod.sync(s2, t0 + 90_000); mod.sync(s2, t0 + 200_000);
    out.renamed = { before, open: R2.items('sess-g', 'open').length, all: R2.items('sess-g').length };
  }
  return out;
}
const S = scenarios(MA);
ok('59 s: nothing; 60 s: ONE item (later syncs file nothing more)', S.filed.at59 === 0 && S.filed.open === 1 && S.filed.all === 1, S.filed);
ok('the item: the conversation + the command, origin agent, kind action, urgency high, action = the request + the session', S.filed.text === 'docusign is waiting for you: permission to run `bash -c "rm -rf ./ds-out && ./sign.sh"`' && S.filed.origin === 'agent' && S.filed.kind === 'action' && S.filed.urgency === 'high' && S.filed.action?.type === 'main-ask' && S.filed.action?.requestId === RID && S.filed.action?.sessionId === 'sess-a', S.filed);
ok('the first-seen instant is persisted (session meta mainAskedAt)', S.filed.persisted && Number.isFinite(S.filed.persisted[RID]));
ok('answered after filing ⇒ the item is resolved (done, by agent)', S.answeredAfter.open === 0 && S.answeredAfter.done === 1 && S.answeredAfter.by === 'agent', S.answeredAfter);
ok('answered at 30 s ⇒ no item ever', S.answered30 === 0, S.answered30);
ok('withdrawn by the CLI (control_cancel_request) ⇒ resolved', S.withdrawn.before === 1 && S.withdrawn.open === 0, S.withdrawn);
ok('kill (forget) ⇒ resolved; a late sync files nothing', S.killed.before === 1 && S.killed.n === 1 && S.killed.open === 0 && S.killed.all === 1, S.killed);
ok('a focused, attached window still files (no visible ⇒ skip)', S.visible === 1, S.visible);
console.log('③ the restart');
ok('restart at 40 s + the rebuilt card ⇒ nothing at 40 s, ONE item at 60 s from the ASK\'s instant', S.restart40.stamped && S.restart40.at40 === 0 && S.restart40.at60 === 1 && S.restart40.all === 1, S.restart40);
ok('an item filed before the restart + a renamed conversation ⇒ still ONE item (the same key)', S.renamed.before === 1 && S.renamed.open === 1 && S.renamed.all === 1, S.renamed);

// ── ④ the other kinds ──
console.log('④ a question, the plan, a codex-shaped normalizer');
{
  const R = rig(); const s = R.mk('sess-q'); const t0 = Date.now();
  const Q = { questions: [{ question: 'Which database should the migration target?', header: 'DB', options: [{ label: 'pg' }, { label: 'sqlite' }] }] };
  feed(s, tool('toolu_Q', 'AskUserQuestion', Q), ask('rq', 'toolu_Q', 'AskUserQuestion', Q)); MA.sync(s, t0 + 61_000);
  const s2 = R.mk('sess-p'); feed(s2, tool('toolu_P', 'ExitPlanMode', { plan: '1. migrate' }), ask('rp', 'toolu_P', 'ExitPlanMode', { plan: '1. migrate' })); MA.sync(s2, t0 + 61_000);
  ok('AskUserQuestion ⇒ "a question: …"', R.items('sess-q', 'open')[0]?.text === 'docusign is waiting for you: a question: Which database should the migration target?', R.items('sess-q').map((i) => i.text));
  ok('ExitPlanMode ⇒ "the plan awaits your approval"', R.items('sess-p', 'open')[0]?.text === 'docusign is waiting for you: the plan awaits your approval', R.items('sess-p').map((i) => i.text));
  const mw = new MessageWindow('x'); mw._emit({ op: 'edit', id: 'a', fields: { permission: {} } }); mw._emit({ op: 'create', message: { permission: {} } }); mw._emit({ op: 'edit', id: 'a', fields: { status: 'x' } });
  ok('MessageWindow counts the ops that carry a permission (the codex / ACP trigger)', mw.permissionOpsVersion === 2, mw.permissionOpsVersion);
  // a codex-shaped stub normalizer: no pendingAsks(), no pending level — its permission ops reach the engine through feedLive
  const card = { id: 'c1', role: 'tool', ts: t0, permission: { requestId: 'cx1', toolName: 'Bash', input: { command: 'cargo test' }, kind: 'approval', resolved: null } };
  const stub = { messages: [], messageIndex: new Map(), _permOps: 0, get permissionOpsVersion() { return this._permOps; },
    processLive(msg) { if (msg.open) { this.messages.push(card); this.messageIndex.set(card.id, card); } if (msg.settle) card.permission = { ...card.permission, resolved: 'allowed' }; this._permOps++; } };
  const sx = { _webuiId: 'sess-x', name: 'codex run', backend: 'codex', _normalizer: stub, _historyLoaded: true }; R.act.set('sess-x', sx);
  N.feedLive(sx, { open: true }); MA.sync(sx, Date.now() + 61_000);
  const filed = R.items('sess-x', 'open').map((i) => i.text);
  N.feedLive(sx, { settle: true }); // no explicit sync: the gate's permission-op trigger must tell the engine
  ok('a codex approval (stub normalizer, pendingAsksOf over its cards) files "permission to run `cargo test`"', filed.join() === 'codex run is waiting for you: permission to run `cargo test`', filed);
  ok('…and its answer (a permission op through feedLive, no pending level) resolves it', R.items('sess-x', 'open').length === 0 && R.items('sess-x', 'done').length === 1);
}

// ── ⑤ wiring pins ──
console.log('⑤ wiring');
const server = read('server.js'), ss = read('src/server/session-stdout.js'), ws = read('src/ws-handler.js');
ok('server.js installs main-asks with the store, the key, the live sessions and the meta clock (mainAskedAt)', /require\('\.\/src\/server\/main-asks'\)\.install\(\{ userTodos, sessionKeyFor: .*readAskedAt: .*mainAskedAt.*persistAskedAt: .*mainAskedAt: map/.test(server));
ok('the exit path and the kill path forget the conversation\'s own asks beside the helpers\'', /require\('\.\/main-asks'\)\.forget\(session\)/.test(ss) && /require\('\.\/server\/main-asks'\)\.forget\(session\)/.test(ws));
ok('one item per ask (user-todos ACTION_IDENTITY main-ask → requestId)', /'main-ask': 'requestId'/.test(read('src/user-todos.js')));
ok('a typed reply never "answers" it (inbox-reply CARD_ACTION_TYPES) and the click lands on its card in its window (goToWindow switches the desktop)', /CARD_ACTION_TYPES = Object\.freeze\(\['helper-ask', 'main-ask'\]\)/.test(read('src/inbox-reply.js')) && /item\?\.action\?\.type === 'main-ask'\) && item\.action\.requestId/.test(read('src/lib/user-todos-actions.js')) && /if \(hasWindow\) app\.goToWindow\(s\.webuiId\)/.test(read('src/lib/user-todos-actions.js')));
ok('the normalizers tell a second observer (main asks) beside the helpers\' slot', /function addAsksObserver\(fn\)/.test(read('src/normalizers.js')) && /addAsksObserver\(\(session\) => sync\(session\)\)/.test(MAIN_ASKS_SRC));

// ── ⑥ PATCHED-COPY CONTROLS ──
console.log('⑥ controls');
const MUT = mutantCopies('parked-ask-inbox', REPO);
const patch = (from, to) => { if (!MAIN_ASKS_SRC.includes(from)) throw new Error('control anchor gone: ' + from.slice(0, 60)); return MAIN_ASKS_SRC.replace(from, to); };
const twice = MUT.load('src/server/main-asks.js', patch("  if (openItemsOf(key).some((it) => String(it.action.requestId) === ask.requestId)) return true;\n", ''), 'filed-twice');
const T = scenarios(twice);
ok('CONTROL filed twice (no "an open item for this request IS the filing"): the renamed restart files a SECOND item ⇒ the leg is RED on it', T.renamed.all === 2 && T.renamed.open === 2, T.renamed);
const never = MUT.load('src/server/main-asks.js', patch('    resolveItems(session, live); // resolve before filing', '    // resolve before filing'), 'never-resolved');
const U = scenarios(never);
ok('CONTROL never resolved: answered after filing and withdrawn both leave the item open ⇒ RED on it', U.answeredAfter.open === 1 && U.withdrawn.open === 1, { a: U.answeredAfter, w: U.withdrawn });
const skip = MUT.load('src/server/main-asks.js', patch("        const still = mainAsksOf(session)", "        if (session._clientCount > 0 || (session.clients && session.clients.size)) return; // a planted \"visible ⇒ skip\"\n        const still = mainAsksOf(session)"), 'visible-skip');
const V = scenarios(skip);
ok('CONTROL visible-window skip: the focused, attached window files nothing ⇒ RED on it', V.visible === 0 && V.filed.open === 1, { visible: V.visible });
MA.install({ userTodos: null, sessionKeyFor: null, activeSessions: null, log: quiet }); // the real module's deps back to inert

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
