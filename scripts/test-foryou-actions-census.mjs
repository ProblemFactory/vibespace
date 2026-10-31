#!/usr/bin/env node
// THE FOR-YOU ACTION REGISTRY's CENSUS (lane chat-needs-you-card, amendment 1 — the owner's registry law, 2026-10-26: «这种不是
// 应该有个统一的注册表之类的吗» — every kind / category / origin / door family is ONE PURE registry row naming every surface + a
// census). PURE src/foryou-actions.js holds ONE row per action type; this suite holds the tree to it:
//   ① every type a producer files — an `action: { type: '…' }` literal OR constant (src/main-ask.js, src/browser-takeover-
//     request.js spell it as a constant), and every type the client branches on — is a row; every row is spelled by its
//     producer (or the module that builds it) — no dead row
//   ② THE DERIVED TABLES — ACTION_IDENTITY (the store's merge), WAIT_ACTIONS (band 2), CARD_ACTION_TYPES / ANSWER_ACTION_TYPES
//     (no typed reply) are the registry's: today's sets + the audit's fix, and no literal table is left in the three hosts
//   ③ the audit's two drifts: `vault-rotate` merges by its entry (RED: the base's text rule merged two entries' suggestions
//     into one item); `vault-use-failed` is a row (RED: the base's tables named it nowhere)
//   ④ every `handled` row has its branch in src/lib/user-todos-actions.js; every `card: 'row'` row is drawn by
//     src/lib/user-todos-row.js (or a module it imports); an `inbox-window` row only by the For-you window; a `none` row by neither
//   ⑤ every `chat` row is drawn by the chat's needs card (needsOf); every non-chat row names the chat card that owns it
//   ⑥ bandDoorsOf's types (src/vault-inventory.js) are rows; every row's fields are from their closed sets; a `filed` cli
//     prints the hub's line, a `wait` cli's note names the card
//   ⑦ THE RATCHET — scripts/id-branch-census.mjs counts the `foryou` family (the registry is its owner) and the baseline holds it
//   RED COPIES: a row removed ⇒ the census names the orphan type (a literal one, a constant one, a client-only one)
// Run: node scripts/test-foryou-actions-census.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FA = require(path.join(ROOT, 'src/foryou-actions.js'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const files = {};
const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const rel = path.posix.join(d, e.name); if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js')) files[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } };
walk('src');
files['server.js'] = read('server.js');
const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); // comment lines are no branch
const TYPE_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
/** the hub's files whose `action` is no For-you item's (a search card's own action) */
const NOT_INBOX = { 'src/search-card.js': 'a search result card\'s own action (the chat\'s search cards — never filed in For you)' };
/** the client modules that branch on an item's type (the evidence a type exists even when its producer builds it elsewhere) */
const CLIENT = ['src/lib/user-todos-actions.js', 'src/lib/user-todos-row.js', 'src/lib/inbox-window.js', 'src/lib/inbox-window-layout.js'];

// ── ① ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① every type a producer files or the client branches on is a row; every row is spelled where it is filed');
const filedTypes = (fl) => {
  const out = new Map();
  for (const [rel, src] of Object.entries(fl)) {
    if (rel.startsWith('src/lib/') || rel in NOT_INBOX) continue;
    for (const m of code(src).matchAll(/action:\s*\{\s*type:\s*(?:'([a-z][a-z0-9-]*)'|([A-Z][A-Z0-9_]*)\b)/g)) {
      const c = m[2] ? new RegExp(`const ${m[2]}\\s*=\\s*'([a-z][a-z0-9-]*)'`).exec(src) : null;
      const ty = m[1] || (c && c[1]) || `<unresolved ${m[2]}>`;
      if (!out.has(ty)) out.set(ty, rel);
    }
  }
  return out;
};
const clientTypes = (fl) => {
  const out = new Map();
  for (const rel of CLIENT) {
    const src = code(fl[rel] || '');
    for (const m of src.matchAll(/(?:\baction\??\.type\s*[!=]==?\s*'([a-z][a-z0-9-]*)'|'([a-z][a-z0-9-]*)'\s*[!=]==?\s*[\w.?]*\baction\??\.type\b)/g)) { const ty = m[1] || m[2]; if (TYPE_RE.test(ty) && !out.has(ty)) out.set(ty, rel); }   // an ITEM's action type (never a ws frame's `msg.type`)
  }
  return out;
};
const census = (rows, fl = files) => {
  const problems = [];
  const types = new Set(rows.map((r) => r.type));
  for (const [ty, rel] of filedTypes(fl)) if (!types.has(ty)) problems.push(`'${ty}' is filed by ${rel} — no row in src/foryou-actions.js`);
  for (const [ty, rel] of clientTypes(fl)) if (!types.has(ty)) problems.push(`'${ty}' is branched on by ${rel} — no row in src/foryou-actions.js`);
  for (const r of rows) {
    const where = [r.producer, r.builtIn].filter(Boolean);
    for (const w of where) if (fl[w] == null) problems.push(`row '${r.type}': its file ${w} does not exist`);
    const spelled = where.some((w) => { const s = code(fl[w] || ''); return s.includes(`'${r.type}'`) || new RegExp(`const [A-Z][A-Z0-9_]* = '${r.type}'`).test(s); });
    if (!spelled) problems.push(`row '${r.type}': spelled neither in ${where.join(' nor ')} — a dead row`);
  }
  return problems;
};
const P0 = census(FA.ROWS);
ok(P0.length === 0, `every filed type (${filedTypes(files).size}) and every client branch (${clientTypes(files).size}) is one of the ${FA.ROWS.length} rows; every row is spelled where it is filed`, P0);
ok(FA.ROWS.length === new Set(FA.ROWS.map((r) => r.type)).size && FA.ROWS.every((r) => TYPE_RE.test(r.type)), 'ONE row per type (no duplicate, every type kebab-case)');
ok([...filedTypes(files).keys()].includes('main-ask') && [...filedTypes(files).keys()].includes('browser-takeover'), 'the CONSTANT spellings are read (src/main-ask.js MAIN_ASK_ACTION, src/browser-takeover-request.js ACTION_TYPE)');
console.log('   RED COPIES — a row removed: the census names the orphan type');
for (const [ty, why] of [['channel-reauth', 'a literal producer spelling'], ['main-ask', 'a CONSTANT producer spelling'], ['vault-use-failed', 'a type only the client branches on (its producer passes the action through a helper)']]) {
  const p = census(FA.ROWS.filter((r) => r.type !== ty));
  ok(p.some((x) => x.startsWith(`'${ty}' is`)), `RED: '${ty}' removed is named (${why})`, p);
}
{ const fl = { ...files, 'src/server/new-door.js': "x.add('k', { origin: 'agent', text: 't', action: { type: 'ghost-ask', id } });\n" }; ok(census(FA.ROWS, fl).some((x) => /'ghost-ask' is filed by src\/server\/new-door\.js/.test(x)), 'RED: a NEW type a producer files is named until its row is written'); }
{ ok(census([...FA.ROWS, { type: 'phantom-ask', producer: 'src/server/vault-hooks.js' }]).some((x) => /row 'phantom-ask': spelled neither/.test(x)), 'RED: a row nobody files is a dead row'); }

// ── ② ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② the derived tables — today\'s sets, from the registry; no literal table left in their hosts');
const set = (a) => JSON.stringify([...a].sort());
ok(JSON.stringify(FA.ACTION_IDENTITY) === JSON.stringify(Object.fromEntries(FA.ROWS.filter((r) => r.identity).map((r) => [r.type, r.identity]))) && set(Object.entries(FA.ACTION_IDENTITY).map(([k, v]) => k + ':' + v)) === set(['exit-run-ask:askId', 'hub-act-ask:askId', 'automation-ask:askId', 'pool-cross-provider:askId', 'vault-run-ask:askId', 'vault-grant-ask:askId', 'secret-request:requestId', 'browser-proposal:id', 'app-install:id', 'browser-grant:profileId', 'browser-takeover:requestId', 'open-channel:key', 'channel-api-proposal:id', 'main-ask:requestId', 'vault-rotate:entry', 'channel-watch-request:id', 'channel-held-digest:id', 'hub-act-standing:askId' /* lane ledger-dedup-law: a background subject's ONE standing item per subject */]),
  'ACTION_IDENTITY = the rows\' identities: the 14 of before + vault-rotate → entry (the audit\'s fix) + channel-watch-request → id (lane wake-approve-card: N wake requests = N cards) + channel-held-digest → id (r6: one decision per held digest)', FA.ACTION_IDENTITY);
ok(set(FA.WAIT_ACTIONS) === set(['main-ask', 'helper-ask', 'exit-run-ask']), 'WAIT_ACTIONS = the rows that wait: main-ask, helper-ask, exit-run-ask (as before)', FA.WAIT_ACTIONS);
ok(set(FA.CARD_ACTION_TYPES) === set(['helper-ask', 'main-ask']) && set(FA.ANSWER_ACTION_TYPES) === set(['exit-run-ask', 'hub-act-ask', 'automation-ask', 'pool-cross-provider', 'vault-run-ask', 'vault-grant-ask', 'secret-request', 'channel-held-digest']), 'CARD_ACTION_TYPES (answer: card) and ANSWER_ACTION_TYPES (answer: buttons) = the sets of before + (r6) channel-held-digest — answered by its Deliver / Discard, never a typed reply');
const HOST = { store: read('src/user-todos.js'), att: read('src/attention-model.js'), reply: read('src/inbox-reply.js') };
ok(/const \{ ACTION_IDENTITY \} = require\('\.\/foryou-actions\.js'\);/.test(HOST.store) && !/const ACTION_IDENTITY = Object\.freeze/.test(HOST.store), 'src/user-todos.js reads ACTION_IDENTITY from the registry (no table of its own)');
ok(/const \{ WAIT_ACTIONS \} = require\('\.\/foryou-actions\.js'\);/.test(HOST.att) && !/const WAIT_ACTIONS = Object\.freeze/.test(HOST.att) && require(path.join(ROOT, 'src/attention-model.js')).WAIT_ACTIONS === FA.WAIT_ACTIONS, 'src/attention-model.js reads WAIT_ACTIONS from the registry');
ok(/const \{ ANSWER_ACTION_TYPES, CARD_ACTION_TYPES \} = require\('\.\/foryou-actions\.js'\);/.test(HOST.reply) && !/(?:CARD|ANSWER)_ACTION_TYPES = Object\.freeze/.test(HOST.reply), 'src/inbox-reply.js reads CARD_ACTION_TYPES and ANSWER_ACTION_TYPES from the registry');
{ const all = Object.entries(files).filter(([rel]) => rel !== 'src/foryou-actions.js').filter(([, s]) => /(?:ACTION_IDENTITY|WAIT_ACTIONS|CARD_ACTION_TYPES|ANSWER_ACTION_TYPES)\s*=\s*Object\.freeze/.test(s)).map(([rel]) => rel); ok(!all.length, 'no second copy of any of the four tables anywhere under src/', all); }

// ── ③ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ the audit\'s two drifts — a rotate suggestion merges by its entry; a failed use is a row');
{
  const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
  const twoEntries = (UM) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fyreg-')); const u = new UM({ dataDir: dir, onChange: () => {}, expirySweepMs: 0 }); try { const t = 'An agent stored «deploy key» — rotate it?'; const a = u.add('vault', { origin: 'vault', kind: 'notice', text: t, action: { type: 'vault-rotate', entry: 'apikey:a' } }); const b = u.add('vault', { origin: 'vault', kind: 'notice', text: t, action: { type: 'vault-rotate', entry: 'apikey:b' } }); return { a, b }; } finally { try { u.stop(); } catch { } fs.rmSync(dir, { recursive: true, force: true }); } };
  const r = twoEntries(UserTodoManager);
  ok(r.a.id !== r.b.id && !r.b.existing && r.b.action.entry === 'apikey:b', 'two rotate suggestions with the same words for two entries are TWO items (each its own Renew)', r);
  // RED: the base's store (no vault-rotate identity — merged by text): the second entry's suggestion REPLACED the first's action
  const tmp = path.join(os.tmpdir(), `vs-fyreg-store-${process.pid}.cjs`);
  fs.writeFileSync(tmp, HOST.store.replace("const { ACTION_IDENTITY } = require('./foryou-actions.js');", "const ACTION_IDENTITY = Object.fromEntries(Object.entries(require(" + JSON.stringify(path.join(ROOT, 'src/foryou-actions.js')) + ").ACTION_IDENTITY).filter(([k]) => k !== 'vault-rotate'));").replace(/require\('\.\/([^']+)'\)/g, (m, p) => `require(${JSON.stringify(path.join(ROOT, 'src', p))})`));
  try { const base = twoEntries(require(tmp).UserTodoManager); ok(base.a.id === base.b.id && base.b.existing, 'RED: the base\'s merge (by text) made them ONE item — the first entry\'s suggestion lost', base); }
  catch (e) { ok(false, 'RED control loads', String(e && e.message)); } finally { fs.rmSync(tmp, { force: true }); }
  ok(!!FA.ROW_OF['vault-use-failed'] && FA.ROW_OF['vault-use-failed'].handled && /by its text on purpose/.test(FA.ROW_OF['vault-use-failed'].merge || ''), 'vault-use-failed is a row (handled by the jump to its Vault row; it merges by its text ON PURPOSE — the head + its cause)');
  ok(census(FA.ROWS.filter((r) => r.type !== 'vault-use-failed')).some((x) => /'vault-use-failed' is branched on by src\/lib\/user-todos-actions\.js/.test(x)), 'RED: the base\'s tables named vault-use-failed nowhere — without its row the census names it');
}

// ── ④ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ handled ⇒ a branch in user-todos-actions.js; card ⇒ where For-you draws its verbs');
const ACT = code(files['src/lib/user-todos-actions.js']);
const branches = (src, ty) => new RegExp(`(?:\\.type\\s*[!=]==?\\s*'${ty}'|\\[[^\\]]*'${ty}'[^\\]]*\\]\\.includes\\()`).test(src);
{ const miss = FA.ROWS.filter((r) => r.handled && !branches(ACT, r.type)).map((r) => r.type); ok(!miss.length, `every handled row (${FA.ROWS.filter((r) => r.handled).length}) has its \`type ===\` branch in src/lib/user-todos-actions.js`, miss); }
const ROWJS = code(files['src/lib/user-todos-row.js']);
const rowImports = [...ROWJS.matchAll(/from '\.\/([\w-]+\.js)'/g)].map((m) => `src/lib/${m[1]}`);
const rowDraws = (ty) => ROWJS.includes(`'${ty}'`) || rowImports.some((f) => new RegExp(`export const [A-Z_]+ = '${ty}'`).test(files[f] || ''));
const WIN = code(files['src/lib/inbox-window.js'] + '\n' + files['src/lib/inbox-window-layout.js']);
{ const bad = FA.ROWS.filter((r) => (r.card === 'row' && !rowDraws(r.type)) || (r.card !== 'row' && rowDraws(r.type)) || (r.card === 'inbox-window' && !WIN.includes(`'${r.type}'`))).map((r) => `${r.type} (${r.card})`);
  ok(!bad.length, `card: 'row' ⇔ the row draws it (${FA.ROWS.filter((r) => r.card === 'row').length}; secret-request through vault-paste-box's SECRET_ACTION); 'inbox-window' ⇒ only the window (${FA.ROWS.filter((r) => r.card === 'inbox-window').map((r) => r.type).join(', ')}); 'none' ⇒ neither`, bad); }

// ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑤ every chat row is drawn by the chat\'s needs card; every other row names the card that owns it');
{
  const ME = 'claude:c0ffee';
  const items = FA.ROWS.map((r, k) => ({ id: 'ut-' + String(k).padStart(10, '0'), status: 'open', kind: 'action', origin: 'agent', text: r.type, createdAt: k + 1, sessionKey: r.scope === 'conversation' ? ME : 'grp', ...(r.scope === 'conversation' ? {} : { about: ME }), action: { type: r.type } }));
  const drawn = new Set(FA.needsOf(items, [ME]).map((e) => e.item.action.type));
  const bad = FA.ROWS.filter((r) => !!r.chat !== drawn.has(r.type)).map((r) => r.type);
  ok(!bad.length, `chat ⇔ drawn: ${FA.ROWS.filter((r) => r.chat).length} rows are cards in the chat, ${FA.ROWS.filter((r) => !r.chat).length} are not (${FA.ROWS.filter((r) => !r.chat).map((r) => r.type).join(', ')})`, bad);
  const own = FA.ROWS.filter((r) => !r.chat).filter((r) => { const f = /src\/lib\/[\w-]+\.js/.exec(r.owner || ''); return !f || !files[f[0]]; }).map((r) => r.type);
  ok(!own.length, 'every non-chat row names the chat card that answers it, by its file (S1, the permission card, the proposal / API / wall cards)', own);
  ok(FA.ROWS.filter((r) => r.chat).every((r) => FA.KINDS.includes(r.kind)), 'every chat row names its kind (the card\'s head and the chip say it)');
}

// ── ⑤b ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// lane needs-card-tail r10: THE ATTENTION DOCK — the strip above a chat's message box draws the NEWEST open need of the
// conversation as THE row (the same renderer, the same verbs). Its actions are census rows: every chat row can stand in it,
// and every container in which the row draws a verb (a <button>) is one the strip SHOWS (public/chat.css's whitelist) — a
// new kind of answer the row learns is never hidden in the strip by a stylesheet nobody re-read (RED: a planted one).
console.log('⑤b THE ATTENTION DOCK\'s actions — every chat row stands in the strip; every container the row draws a verb in is one the strip shows');
{
  const ME = 'claude:c0ffee';
  if (typeof FA.dockOf !== 'function') { ok(false, 'PURE dockOf exists (src/foryou-actions.js — THE ATTENTION DOCK)'); FA.dockOf = () => null; } // (RED copies: named, never a crash)
  const items = FA.ROWS.map((r, k) => ({ id: 'ut-' + String(k).padStart(10, '0'), status: 'open', kind: 'action', origin: 'agent', text: r.type, createdAt: k + 1, sessionKey: r.scope === 'conversation' ? ME : 'grp', ...(r.scope === 'conversation' ? {} : { about: ME }), action: { type: r.type } }));
  const bad = FA.ROWS.filter((r) => r.chat).filter((r) => { const one = items.filter((i) => i.action.type === r.type); const d = FA.dockOf(FA.needsOf(one, [ME]).map((e) => e)); return !d || d.newest.action.type !== r.type || d.n !== 1; }).map((r) => r.type);
  ok(!bad.length, `every chat row (${FA.ROWS.filter((r) => r.chat).length}) stands in the strip alone as its newest — dockOf over the conversation's needs`, bad);
  const CSS = read('public/chat.css');
  const shownOf = (css) => { const m = /\.cad-rows \.ut-item > \.ut-body > :not\(([^)]+)\) \{ display: none !important; \}/.exec(css); const app = /\.cad-rows \.ut-app-card > :not\(([^)]+)\) \{ display: none !important; \}/.exec(css); return { body: m ? m[1].split(',').map((x) => x.trim().replace(/^\./, '')) : [], app: app ? app[1].split(',').map((x) => x.trim().replace(/^\./, '')) : [] }; };
  /** every element the row source opens whose first content is a <button> (a template value between allowed) → its first class */
  const holders = (src) => [...src.matchAll(/<(?:div|span) class="([\w-]+)[^"]*"[^>]*>[^<]{0,80}<button/g)].map((m) => m[1]);
  // the containers whose buttons ANSWER nothing — named, with the reason (a new one is red until it is named here or shown)
  const NOT_ANSWERS = { 'ut-arts': 'an ask\'s --artifact chips: each opens a file the agent attached — they answer nothing; the card in the flow shows them' };
  const census = (rowSrc, css) => { const sh = shownOf(css); const hs = [...new Set(holders(rowSrc))]; return { hs, hidden: hs.filter((c) => !(c in NOT_ANSWERS) && !sh.body.includes(c) && !(sh.body.includes('ut-app-card') && sh.app.includes(c))) }; };
  const ROWSRC = read('src/lib/user-todos-row.js');
  const c0 = census(ROWSRC, CSS);
  ok(c0.hs.length >= 4 && c0.hidden.length === 0, `every container the row draws a verb in is SHOWN by the strip (${c0.hs.join(', ')})`, c0);
  { const planted = ROWSRC + "\nconst plantedHtml = (i, t) => `<div class=\"ut-new-answer\"><button type=\"button\" class=\"ut-act\">x</button></div>`;\n"; const c1 = census(planted, CSS); ok(c1.hidden.length === 1 && c1.hidden[0] === 'ut-new-answer', 'RED: a new answer container the row learns (planted) is named — the strip would hide its verbs', c1.hidden); }
  { const c2 = census(ROWSRC, CSS.replace('.ut-exit-answer, .ut-reconnect-row, .ut-app-card, ', '')); ok(c2.hidden.includes('ut-exit-answer'), 'RED: the strip\'s whitelist without the answer row (Allow / Deny / Approve) names it', c2.hidden); }
  // r12 (the r11 acceptance — the strip drew no reach pick yet its Allow / Always sent the pick made on another copy): A PRESS POINT
  // NEVER SENDS A SCOPE IT DOES NOT SHOW — every row whose answer carries a reach (the row module's drawsPick) stands in the strip
  // (a chat row) and the strip SHOWS the line that says it (scopeHtml's ut-ak-scope)
  const reachRows = (src) => [...src.matchAll(/const drawsPick = \(i\) => !!\(i && i\.action && i\.action\.type === '([\w-]+)'/g)].map((m) => m[1]);
  const scopeShown = (src, css) => { const said = (/const scopeHtml = [^\n]*<div class="([\w-]+)"/.exec(src) || [])[1] || null; return { said, shown: !!said && shownOf(css).body.includes(said) }; };
  const rr = reachRows(ROWSRC), sc = scopeShown(ROWSRC, CSS);
  ok(rr.length === 1 && rr.every((ty) => FA.ROWS.some((r) => r.type === ty && r.chat)) && sc.shown, `RED-able (r12 — 9f8b8d846: no such line): every row whose answer carries a reach (${rr.join(', ')}) stands in the strip, and the strip SHOWS the line that says the reach (${sc.said})`, { rr, sc });
  { const c3 = scopeShown(ROWSRC, CSS.replace('.ut-ak-scope, ', '')); ok(!!c3.said && !c3.shown, 'RED: the strip\'s whitelist without the reach line names it — the strip would answer with a reach it hides', c3); }
}

// ── ⑤c ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// lane needs-card-tail r10 ADDENDUM (the owner 2026-10-30: «有权限申请的时候窗口应该触发闪烁和 inbox 附近的弹窗»): a NEW item that waits
// for the owner announces itself (the window flashes, a card at the For-you button). r11 (the r10 acceptance — r10's own rule
// here, «every need announces», let bands 3–5 announce: Dropline's band-5 dictionary reminder, a plain question, a vault-rotate
// suggestion — past the owner's toast budget): ONE attention policy — the announce is the band 1–2 arrival's toast, grown; the
// registry keeps no rule of its own (no announceWorthy) and only words the card; WHICH arrival announces is attention-model's
// toastWorthy. Its rows: the acceptance's shapes by band; every registry row ⇔ its band; the card's clock = the item's deadline.
console.log('⑤c THE ANNOUNCE\'s rows — ONE policy (toastWorthy: bands 1–2, the owner\'s switches); bands 3–5 move a number only; the card\'s clock is the item\'s deadline');
{
  const AM = require(path.join(ROOT, 'src/attention-model.js'));
  const has = typeof FA.announceWords === 'function';
  ok(has && !('announceWorthy' in FA), 'RED-able (r11 — 7ec6c6dcf exports announceWorthy, «a need, never a notice»): the registry WORDS the announce (announceWords) and keeps no rule of its own — which arrival announces is the attention model\'s', Object.keys(FA).filter((k) => /announce/.test(k)));
  if (has) {
    const NOW = Date.now(), ann = (i, policy = null) => AM.toastWorthy(AM.rowOf(i, NOW), policy), band = (i) => AM.rowOf(i, NOW).band;
    const base = { status: 'open', kind: 'action', createdAt: NOW, sessionKey: 'claude:c0ffee' }, waitType = FA.WAIT_ACTIONS[0];
    // the acceptance's shapes (repro/accept-r10/announce-bands.cjs) — and a date inside the 48 h window, an agent's call held on the owner
    const shapes = [
      ['Dropline\'s dictionary reminder (a plugin\'s, urgency low — lane voice-dictionary-nag: «no badge, no toast»)', { ...base, id: 'p1', origin: 'plugin', plugin: 'voice-input', urgency: 'low', text: 'Dropline suggests adding to your dictionary: CLAUDE.md', sessionKey: 'voice' }, 5, false],
      ['an agent\'s plain question', { ...base, id: 'q1', origin: 'agent', text: 'which one?' }, 5, false],
      ['a vault-rotate suggestion', { ...base, id: 'v1', origin: 'vault', text: 'rotate', action: { type: 'vault-rotate', entry: 'x' } }, 4, false],
      ['a date inside 48 h', { ...base, id: 'd1', origin: 'agent', text: 'renew it', due: NOW + 3600e3 }, 3, false],
      ['a permission ask (an exit run, urgent)', { ...base, id: 'e1', origin: 'machines', urgency: 'urgent', text: 'run', action: { type: 'exit-run-ask', askId: 'a' } }, 1, true],
      [`an agent's call held on the owner (${waitType})`, { ...base, id: 'w1', origin: 'agent', text: 'held', action: { type: waitType, askId: 'b' } }, 2, true],
    ];
    for (const [what, it, b, want] of shapes) ok(band(it) === b && ann(it) === want, `${what}: band ${band(it)} ⇒ ${want ? 'ANNOUNCES (the toast, grown)' : 'moves a number only — no card, no flash, no pulse (7ec6c6dcf announced it: its panel asked its own rule first — the RED is test-user-todos-layout ㉘, the REAL arrival path)'}`, { band: band(it), toastWorthy: ann(it) });
    ok(!ann(shapes[4][1], { off: [1] }) && !ann(shapes[5][1], { off: [2] }), 'a band the owner switched off announces nothing (its rows fall to band 5\'s order — decision 4)');
    const items = FA.ROWS.map((r, k) => ({ id: 'ut-a' + String(k).padStart(9, '0'), status: 'open', kind: 'action', origin: 'agent', text: r.type, createdAt: k + 1, sessionKey: 'claude:c0ffee', action: { type: r.type } }));
    const off = items.filter((i) => ann(i) !== [1, 2].includes(band(i)));
    ok(items.length >= 20 && !off.length, `over every registry row (${items.length}): an arrival announces ⇔ its band is 1 or 2 (${items.filter((i) => ann(i)).length} rows do — an agent's call held on the owner) — the band decides, never the row`, off.map((i) => i.action.type));
    const one = items.find((i) => FA.needOf(i));
    const T0 = 1_800_000_000_000, W2 = (o, now) => FA.announceWords({ ...one, ...o }, { who: 'ops', what: 'run python3', now });
    const a = W2({ expiresAt: T0 + 42e3 }, T0), b = W2({ expiresAt: T0 + 5 * 60e3 }, T0), c = W2({ expiresAt: T0 - 1 }, T0), d = W2({ status: 'done', resolvedBy: 'ask-expired' }, T0), e = W2({}, T0);
    ok(a.clock === '42 s left' && a.left === 42 && !a.expired && b.clock === '5 min left' && c.expired && c.clock === 'expired' && d.expired && d.clock === 'expired' && e.clock === '' && e.left === null && a.who === 'ops' && a.what === 'run python3',
      `the clock is the item's deadline: «${a.clock}» · «${b.clock}» · past it «${c.clock}» · resolved as expired «${d.clock}» · none «${e.clock}»`, { a, b, c, d, e });
    const zh = { '{n} s left': '还剩 {n} 秒', expired: '已过期' }, tz = (k, p) => (zh[k] || k).replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : ''));
    ok(FA.announceWords({ ...one, expiresAt: T0 + 42e3 }, { now: T0, t: tz }).clock === '还剩 42 秒', 'the client\'s t() words the clock (zh: «还剩 42 秒»)');
  }
}

// ── ⑥ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ bandDoorsOf\'s types are rows; every field from its closed set; the CLI line each row declares');
{
  const vi = code(files['src/vault-inventory.js']); const body = vi.slice(vi.indexOf('function bandDoorsOf('), vi.indexOf('\n}', vi.indexOf('function bandDoorsOf(')));
  const bt = [...body.matchAll(/type === '([a-z-]+)'/g)].map((m) => m[1]);
  ok(bt.length >= 4 && bt.every((t) => FA.ROW_OF[t]), `bandDoorsOf (src/vault-inventory.js) branches on rows only (${bt.join(', ')})`, bt);
  const SCOPES = ['conversation', 'about', 'group'];
  const badF = FA.ROWS.filter((r) => !FA.ANSWERS.includes(r.answer) || !FA.CARDS.includes(r.card) || typeof r.handled !== 'boolean' || typeof r.waits !== 'boolean' || typeof r.chat !== 'boolean' || !SCOPES.includes(r.scope) || !(r.identity === null || /^[a-zA-Z]+$/.test(r.identity))).map((r) => r.type);
  ok(!badF.length, 'every row\'s answer / card / scope from its closed set, booleans boolean, identity a field name or null', badF);
  const bins = {}; for (const r of FA.ROWS) if (r.cli) (bins[r.cli.bin] = bins[r.cli.bin] || []).push(r);
  const badC = [];
  for (const [bin, rows] of Object.entries(bins)) {
    let src = ''; try { src = read('data/bin/' + bin); } catch { badC.push(`${bin}: no such CLI`); continue; }
    for (const r of rows) {
      if (!['filed', 'wait', 'own'].includes(r.cli.line)) badC.push(`${r.type}: line ${r.cli.line}`);
      if (r.cli.line === 'filed' && !/console\.log\((?:answer|r|d)\.filed\)/.test(src)) badC.push(`${r.type}: ${bin} prints no hub line`);
      if (r.cli.line === 'wait' && !/card in this conversation|answer it on the card|answer on the card/.test(src)) badC.push(`${r.type}: ${bin}'s wait note names no card`);
    }
  }
  ok(!badC.length, `the CLI line of every row that names one (${Object.keys(bins).join(', ')}): 'filed' ⇒ the CLI prints the hub's line, 'wait' ⇒ its note names the card`, badC);
}

// ── ⑦ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑦ THE RATCHET — the foryou family in the literal-id branch census');
{
  const IB = await import(path.join(ROOT, 'scripts/id-branch-census.mjs'));
  const base = JSON.parse(read('scripts/fixtures/id-branch-baseline.json'));
  ok(IB.FAMILIES.foryou && JSON.stringify(IB.FAMILIES.foryou.ids) === JSON.stringify(FA.ROWS.map((r) => r.type)) && IB.FAMILIES.foryou.owners.some((o) => o.file === 'src/foryou-actions.js'), 'the foryou family\'s ids ARE the registry\'s types, the registry its owner');
  const now = IB.census(ROOT).counts.foryou;
  const j = IB.judge({ foryou: base.foryou || {} }, { foryou: now });
  ok(!!base.foryou && !j.rises.length, `the baseline holds the family (${IB.total(base.foryou)} branch lines) and nothing rose (${IB.total(now)} now) — test-architecture §78 keeps it falling only`, j.rises);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
