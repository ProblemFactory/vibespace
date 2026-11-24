#!/usr/bin/env node
// test-held-words — THE FAMILY's HELD CODES ON THE PAGE, a census (B-f276 family, 主开发 r3032 unit A, lane bl-phone-ui).
// A store whose file could not be read is HELD (src/store-read-hold.js and the older holds): its route answers the store's code with
// 503 and the HUB's own sentence — English, the file's name, the read's error code. The page says it in its OWN words, from ONE table
// in its refusal pass (src/lib/utils.js HELD_WORDS, beside heldWordsOf; the older holds keep their own branches there), and a list
// hold the census classed with no row takes ONE generic sentence (HELD_GENERIC; HELD_CODE_RE is the pattern codes are FOUND by). This suite:
//   ①b THE ENDING (主开发 r3123, a must of this unit): every code of the tree whose name ends in unread / unreadable, WHATEVER its
//     status, has a class — a LIST HOLD the step words (a row, an older branch, or HELD_GENERIC: the generic sentence) or one it must
//     LEFT_ALONE (a hold worded by its own door, or no list hold at all: a vault's key, a proxy login, a browser's tabs, a state word); a code
//     of that ending with no class is red by name. The step words ONLY the classed list holds: a new code keeps its own words until judged.
//   ① THE CENSUS — every code a route of the tree answers with 503 (read from the source: `status(503).json({… code: '…'`, an error
//     carrying `status: 503` and its `code`, every caller of the store-read hold's create({ code })) is CLASSIFIED: a row of the table,
//     an older hold's own branch, the generic one by the pattern, a list hold its OWN door words (OWN_DOOR below), or NOT A HOLD with its
//     why (NOT_HELD below). A new code with none is RED by name; a NOT_HELD or OWN_DOOR row naming no live code is DEAD (red); a not-held code that matches the pattern is red (it would be worded
//     as a held list).
//   ② THE WORDS — every row's sentence, the generic one and the phone Files card's have their zh and ja rows; none names a file.
//   ③ THE PASS, DRIVEN — the page's refusal words compiled from utils.js's own source (hostsHeldWords … refusalWords, `t` stood in):
//     a held answer of the family is worded by its code, the hub's sentence kept as `said`; an unknown held code takes the generic
//     sentence; another refusal and an answer that is no refusal pass as they came; heldWordsOf agrees; the codes moved under the table
//     (providers, pages, statuses) answer their units' own sentence functions (r3284).
//   ④ THE PHONE — the Files card (src/lib/phone-files.js) keeps the list's `unread` and says the held list in one sentence.
//   CONTROLS (each RED by name, over a copy in memory): a planted 503 code; a planted hold with a code of its own; the pattern cut; a
//   table row cut; a moved row re-pointed; the pass's fallback cut; the card's sentence cut.
// FAST, PURE: source text only — nothing runs, nothing is fetched.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dictEntries } from './i18n-extract.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker({ whole: true });   // r3928: a failing line's list printed whole, one item a line
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── the tree's server sources (src/ outside the page's src/lib, and server.js) ──
function serverFiles() {
  const out = ['server.js'];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) { if (rel !== 'src/lib' && e.name !== 'node_modules') walk(rel); continue; }
      if (/\.(?:c?js|mjs)$/.test(e.name)) out.push(rel);
    }
  };
  walk('src');
  return out;
}
const SOURCES = new Map(serverFiles().map((f) => [f, read(f)]));

/** every code a source answers with 503, and every code a store-read hold is created with → Map(code → [file, …]) */
function heldCodesOf(sources) {
  const at = new Map();
  const add = (code, f) => { if (!at.has(code)) at.set(code, new Set()); at.get(code).add(f); };
  for (const [f, src] of sources) {
    // the answer's own object (a template's ${…} may sit before its code; never past its closing brace into the next answer)
    for (const m of src.matchAll(/status\(503\)\.json\(\{(?:\$\{[^}]*\}|[^}])*?\bcode: '([A-Za-z0-9_-]+)'/g)) add(m[1], f);
    for (const m of src.matchAll(/\bstatus: 503\b[^;\n]{0,240}?\bcode: '([A-Za-z0-9_-]+)'/g)) add(m[1], f);
    for (const m of src.matchAll(/\bcode: '([A-Za-z0-9_-]+)'[^;\n]{0,60}?\bstatus: 503\b/g)) add(m[1], f);
    if (/require\(['"][./]*store-read-hold\.js['"]\)/.test(src)) for (const m of src.matchAll(/\.create\(\{[\s\S]{0,900}?\bcode: '([A-Za-z0-9_-]+)'/g)) add(m[1], f);
  }
  return at;
}

// ── the page's table, read from src/lib/utils.js ──
const UTILS = read('src/lib/utils.js');
function tableOf(src) {
  const i = src.indexOf('const HELD_WORDS = Object.freeze({'), j = i < 0 ? -1 : src.indexOf('\n});', i);
  const rows = i < 0 || j < 0 ? [] : [...src.slice(i, j).matchAll(/^ {2}'?([A-Za-z0-9_-]+)'?: \(\) =>/gm)].map((m) => m[1]);
  const re = /\nconst HELD_CODE_RE = \/(.+)\/([a-z]*);/.exec(src);
  // the older holds' own branches (heldWordsOf and refusalWords word these codes before the table is asked)
  const older = new Set([...src.matchAll(/d && d\.code === '([A-Za-z0-9_-]+)' \?/g), ...src.matchAll(/body\.code === '([A-Za-z0-9_-]+)'\) return \{ \.\.\.body, said: body\.error/g)].map((m) => m[1]));
  const g = /\nconst HELD_GENERIC = new Set\(\[([^\]]*)\]\);/.exec(src);
  const generic = new Set(g ? [...g[1].matchAll(/'([A-Za-z0-9_-]+)'/g)].map((m) => m[1]) : []);
  return { rows, pattern: re ? new RegExp(re[1], re[2]) : null, older, generic };
}

// NOT A HOLD: a 503 of the tree that is no store held unread — each with its why (a held list's words would be untrue there)
const NOT_HELD = {
  exit_answer_unreadable: 'a browser\'s exit check whose answer could not be read (src/server/browser-keeper.js, the profile\'s own proxy road) — not a list VibeSpace keeps; it is caught since that file holds the takeover requests through the store-read hold (r3261\'s second unit: the hold-create scan reads a nearby `.create({ allow … })` with this code) — its own sentence',
  unavailable: 'a door whose engine is not on this server (a feature off / not wired) — its own sentence',
  'not-durable': 'a person\'s act kept in memory, not on disk yet — channel-words / ws words «not on disk yet» (written later)',
  'todos-not-on-disk': 'B-0248 (lane bl-loop-b): a For-you act made, its write not on disk yet (the store writer still to land it) — the For-you handlers word it (src/lib/user-todos-actions.js, -panel.js), en / zh / ja',
  not_durable: 'the same as not-durable (the exit routes\' spelling)',
  no_engine: 'a browser engine plugin not installed',
  'no-engine': 'a browser engine plugin not installed (the other spelling)',
  not_running: 'a service / daemon not running — its start is the act',
  no_audit: 'the audit log engine absent',
  host_unavailable: 'a paired machine not answering — the machine\'s own state, not a list of VibeSpace\'s',
  transcript_reader_restarting: 'the transcript reader restarting — a moment\'s wait',
  'path-hung': 'the transcript pool remembers a conversation\'s file hung on its storage (row B-422c\'s probe, src/adapters/codex.js) — the person\'s storage, not a VibeSpace list; said as the reader\'s storage refusal (src/lib/reader-words.js)',
  storage_parked: 'a mount\'s network storage parked (the person\'s own storage, not a VibeSpace list) — mount-door\'s parked sentence',
  'storage-blocked': 'a mount root not answering (mount-door) — the person\'s storage, not a VibeSpace list',
  'still-reading': 'a summary still being read past its bound — a wait',
  pin_not_saved: 'a pin whose save the storage refused — its own words',
  parse_busy: 'the parser pool busy — a wait',
  offline: 'a machine or desktop offline',
  no_window_engine: 'no window engine on this machine',
  no_asks: 'the ask channel absent',
  'job-token': 'a job token not minted (the vault) — its own words',
  'grant-unavailable': 'the grants engine absent',
  finding: 'an attachment being found — a wait',
  engine_unwired: 'an engine not wired at this start',
  'count-failed': 'a usage count that failed — a retry',
  LOADING: 'the usage history still loading at the start — a wait',
  'not-on-disk': 'a person\'s start refused because its run could not be saved (a write, not a read)',
  proposal_door_not_ready: 'the proposal card not on this instance yet — the job\'s row says what to tick',
  write_never_started: 'a write to a machine that never started — not saved, said',
  write_unknown: 'a write to a machine that did not answer — it may have been saved, said',
  outbox_unread: 'internal to the feedback forwarder (its own outbox, its own retry) — no person\'s route answers it', // r3333 unit 3 (lane lg-group-parents): held stores no route answers (a pass waits; the family's notice names the hold)
  agent_door_unread: 'r3333 unit 1: the agent door\'s record held — the door refuses nobody (a fresh port this run); no route answers it',
  voice_suggestions_unread: 'r3333 unit 3: the voice suggestions\' ledger held — no word is proposed; a person\'s act goes on and its change waits — no route answers it',
  cli_unmeasured_memory_unread: 'r3333 unit 3: the unmeasured-CLI item\'s memory held — the tick waits; no route answers it',
  cli_model_catalog_unread: 'r3333 unit 3: the model catalog\'s ledger held — this run\'s reads stay in memory; no route answers it',
};

// A LIST HOLD WORDED BY ITS OWN DOOR (r3284: its own class, not «not a hold»): a 503 that IS a held list, whose own door words it — the
// step leaves it, so that door's words stand (classed so in ①b too)
const OWN_DOOR = {
  extract_journal_unread: 'r3333 unit 2: the files page words it by its own code (src/lib/file-explorer-ops.js fsErrorText, zh / ja) — an extraction refused while the journal is held',
  'signin-id-held': 'the data folder\'s own id file (src/auth.js, 主开发 r3336): no route refuses with it — the sign-in page and its 503 word the hold (src/signin-table.js signin-held-id-unread); the family\'s notice names the file by its plain name',
  maintenance_unread: 'r3333 unit 3: an operator\'s POST /api/maintenance (no page sends it) — the answer carries its own words',
  auto_resume_unread: 'its own door words it BY ITS MESSAGE (bulk-resume.js codeOf / answerWords) — a reworded message would lose that door\'s words',
};
function census(codes, table) {
  const red = [], held = [], generic = [];
  const has = (o, c) => Object.prototype.hasOwnProperty.call(o, c);
  for (const [code, files] of [...codes].sort(([a], [b]) => a.localeCompare(b))) {
    const row = table.rows.includes(code) || table.older.has(code), gen = table.generic.has(code), not = has(NOT_HELD, code), own = has(OWN_DOOR, code);
    if ((not || own) && (row || gen)) red.push(`${code}: listed ${own ? 'OWN_DOOR' : 'NOT_HELD'} but the step words it as a held list (${[...files].join(', ')})`);
    else if (row) held.push(code);
    else if (gen) generic.push(code);
    else if (!not && !own) red.push(`${code}: a 503 with no row, no older branch, not a classed list hold (HELD_GENERIC), not OWN_DOOR and not NOT_HELD (${[...files].join(', ')}) — classify it`);
  }
  const dead = [...Object.keys(NOT_HELD), ...Object.keys(OWN_DOOR)].filter((c) => !codes.has(c));
  return { red, held, generic, dead };
}

console.log('① THE CENSUS — every 503 code of the tree, classified');
const CODES = heldCodesOf(SOURCES), TABLE = tableOf(UTILS);
const C = census(CODES, TABLE);
ok(TABLE.rows.length >= 4 && !!TABLE.pattern && TABLE.older.size >= 4, 'control setup: the table, its pattern and the older holds\' branches are read from src/lib/utils.js', { rows: TABLE.rows, pattern: String(TABLE.pattern), older: [...TABLE.older] });
ok(['storage_unread', 'tokens_unread', 'plugins_unread', 'hosts-unread', 'store_unread'].every((c) => CODES.has(c)), 'control setup: the census finds the helper\'s three callers\' codes and the older holds\' 503s in the tree', [...CODES.keys()]);
ok(C.red.length === 0, `every 503 code of the tree is classified — ${C.held.length} worded by a row or an older branch (${C.held.join(', ')}), ${C.generic.length} by the generic sentence (${C.generic.join(', ')}), ${Object.keys(OWN_DOOR).length} worded by its own door, ${Object.keys(NOT_HELD).length} not a hold`, C.red);
ok(C.dead.length === 0, 'every NOT_HELD and OWN_DOOR row names a live 503 code (a dead row is red)', C.dead);
const LIVE_CODES = new Set([...CODES.keys(), ...endingsOf(SOURCES, TABLE.pattern).keys()]);   // a row's code answered with any status (automation_unread rides a held mark, not a 503)
ok(TABLE.rows.every((c) => LIVE_CODES.has(c)), 'every row of the table names a code the tree answers, whatever its status (no row for nothing)', TABLE.rows.filter((c) => !LIVE_CODES.has(c)));


// ①b THE ENDING (r3123): every code of the tree ending in unread / unreadable, whatever its status — classed by groups, each with its why
const LEFT_ALONE = [
  ['own', 'a job or For-you record of its own (its For-you item or its door words the hold)', ['archive-unread', 'archive_unread', 'groups-unread', 'notifs-unread', 'sweep-record-unread', 'todos_unread', 'task-groups-unread', 'queued-file-unread', 'usage-reading-unread', 'machines_unread' /* r3349: the reading file's set-aside door refused while the machines' list is held — the door's own words (its toast reads `error`) */]],
  ['own', 'a money store (the spend guard, the pool, the ledger, a reset credit): its refusal names the guard\'s own state — never a generic list sentence', ['settings-unread', 'spend-settings-unread', 'plans-unread', 'ledger-unreadable', 'ledger-lock-unreadable', 'lock-unreadable', 'spend-ledger-unreadable', 'slot-unreadable', 'attempts-unreadable', 'attempts_unread', 'limit_unread']],
  ['own', 'a store whose own door words its refusal BY ITS MESSAGE (bulk-resume.js codeOf / answerWords) — a reworded message would lose that door\'s words', ['auto_resume_unread']],
  ['own', 'r3333 unit 2: the extraction journal held — the files page words its refusal by its own code (fsErrorText, zh / ja)', ['extract_journal_unread']],
  ['own', 'r3333 unit 3: an operator\'s POST /api/maintenance refused while the banner\'s record is held — the answer carries its own words (no page sends it)', ['maintenance_unread']],
  ['not', 'r3333 unit 3: held stores no route answers — a pass waits (the voice proposals, the unmeasured-CLI tick) or the reads stay in memory (the model catalog)', ['voice_suggestions_unread', 'cli_unmeasured_memory_unread', 'cli_model_catalog_unread']],
  ['not', 'a row state, a batch item\'s why or a notice\'s key — no refusal code a route answers (the Vault window\'s unverified mark, the pages batch\'s per-item why, the setting holds\' notice key, the content stores\' `why` words)', ['marks_unread', 'pages-unread', 'setting-holds-unread', 'designs-unread', 'labels-unread', 'status-unread']],
  ['not', 'internal to the feedback forwarder (its own outbox, its own retry) — no person\'s route answers it', ['outbox_unread']],
  // r3857 (the moved MG1 chain, lane lg-group-parents): the migration ledger's codes, classed by who reads them
  ['own', 'r3857 (MG1): the migration ledger unread — a result row\'s code; the ledger\'s own For-you item words it in three languages (src/migration-runner.js LEDGER_WORDS), and the vault\'s restore answers its own migration_failed', ['ledger-unread']],
  ['not', 'r3857 (MG1): a migration\'s input unread — the error a migration throws; the runner\'s one failed road says it (the For-you failed item, the journal), no route answers it', ['migration-input-unread']],
  ['not', 'r3857 (MG1): the unread migration ledger\'s notice key (serverNotice) — its words are the ledger\'s For-you item\'s; no route answers it', ['migrations-ledger-unread']],
  ['not', 'r3333 unit 1: the agent door\'s record held — the door refuses nobody (a fresh port this run, the family\'s notice names the hold)', ['agent_door_unread']],
  // r3314: the units picked into the hotfix's trial after the chain
  ['own', 'a spend guard refusal\'s why (an unattended turn waits on an account whose usage reading cannot be read): the guard words it in its OWN table (src/spend-authorizer.js REFUSAL_WORDS, the owning lane\'s) — no page refusal code', ['reading-unread']],
  ['not', 'a door\'s or a decision\'s own why word — the webhook door\'s held `why` (its words ride `reason`), a pool switch\'s `reason` — no code a route answers', ['callers-unread', 'held-unread']],
  ['own', 'another store whose own door words its hold (its lane gives it a row of the table when its cure lands)', ['desktop_apps_unread', 'registry_unread', 'store-unreadable', 'store_unreadable', 'records-unreadable', 'kept-unreadable', 'signin-held-unread', 'signin-held-id-unread', 'template_unread', 'version-unread']],
  ['not', 'a state or fact word, not a list\'s refusal code (store-read\'s own states, a row\'s field)', ['unread', 'unreadable']],
  ['not', 'a key, a credential or a vault entry (the vault and its key files word it — a locked vault is never an unreadable list)', ['key-unreadable', 'key_unreadable', 'oat-unreadable', 'proxy_credential_unreadable', 'vault-reveal-unreadable', 'entry_unreadable', 'job_secrets_unreadable', 'job_secrets_record_unreadable', 'host-key-known-unreadable', 'table_unreadable', 'command_unreadable']],
  ['not', 'a machine\'s, a browser\'s or the system\'s own file or answer — not a list VibeSpace keeps', ['file_unreadable', 'folder_unreadable', 'mp_unreadable', 'realpath_unreadable', 'status-unreadable', 'strace-old-unread', 'own-file-unread', 'browser-project-config-unreadable', 'kernel_plan_unread', 'exit_answer_unreadable', 'reach_unreadable', 'window_list_unreadable', 'ref_unreadable', 'tabs_unreadable', 'current_tab_unreadable' /* B-21cc (lines 520 + 595): the vault fill's current tab, refused by its own words — a browser's answer, not a list */, 'builds_unreadable', 'browser_engine_environment_unread', 'relay_unreadable', 'members-unreadable', 'jump-unread', 'windows-unread', 'windows-policy-unread', 'harness_unread']],
  ['not', 'a verdict\'s input (a conversation\'s groups could not be read — the asking door words its refusal)', ['groups_unreadable']],
  // r3856 (the train 2.369.419's whole tier at 725162b8a): line 817 (B-d578, the fallback chain) brought it
  ['not', 'a pool verdict\'s own why (memberVerdictFor, src/server/usage-pool-engine.js): a LISTED fallback provider whose key cannot be read now (the vault locked, the key missing) — memberCanServe reads only its `ok`; the pin route words any why it does not know as «is not usable in the pool right now», and a fallback provider is never a member row a pin press names; the code itself reaches only the journal and the 409\'s protocol field — no list is held', ['fallback-key-unreadable']],
  ['not', 'the idle-paint freeze\'s own refusal reason (a tab\'s visibility read did not answer: that pass freezes nothing) — internal to the keeper\'s sweep, no route answers it', ['front_unread']],  // r4134 (the train 2.369.419's third pick, 7ad68a517): line 823 (lane bl-chat-c, r3245 (1)) brought it
  ['own', 'a LISTED live conversation\'s row state (its record could not be read at the hub\'s start; src/server/boot-restore.js gives the row `_remoteState: record-unread`) — the session card draws it with its OWN chip and tip (src/lib/session-card.js, «its record could not be read», zh / ja); no route answers it as a refusal (that row\'s attach and acts refuse by session-meta-unread, a classed code)', ['record-unread']],
  ['own', 'r3786: a kept browser\'s folder NOTE that could not be read at its start — not a list: the start is not kept and its own words say so (src/browser-kept.js startNoteText, the card\'s «Not kept…»)', ['kept_note_unreadable']],
];
const LEFT = new Map(LEFT_ALONE.flatMap(([kind, why, codes]) => codes.map((c) => [c, { kind, why }])));
function endingsOf(sources, pattern) {
  const at = new Map();
  if (!pattern) return at;
  for (const [f, src] of sources) for (const m of src.matchAll(/'([A-Za-z0-9_-]+)'/g)) if (pattern.test(m[1])) { if (!at.has(m[1])) at.set(m[1], new Set()); at.get(m[1]).add(f); }
  return at;
}
function endingCensus(found, table) {
  const red = [], step = [], left = [];
  for (const [code, files] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
    const worded = table.rows.includes(code) || table.older.has(code) || table.generic.has(code), leftAlone = LEFT.has(code);
    if (worded && leftAlone) red.push(`${code}: both worded by the step and classed to leave alone (${LEFT.get(code).kind})`);
    else if (worded) step.push(code);
    else if (leftAlone) left.push(code);
    else red.push(`${code}: a code ending in unread / unreadable with no class (${[...files].slice(0, 3).join(', ')}) — a list hold (a row or HELD_GENERIC) or one the step leaves alone (LEFT_ALONE, with its why)`);
  }
  return { red, step, left, dead: [...LEFT.keys()].filter((c) => !found.has(c)), deadGeneric: [...table.generic].filter((c) => !found.has(c)) };
}
console.log('①b THE ENDING — every code ending in unread / unreadable, whatever its status');
const ENDINGS = endingsOf(SOURCES, TABLE.pattern), E = endingCensus(ENDINGS, TABLE);
ok(ENDINGS.size >= 60 && TABLE.generic.size >= 10, 'control setup: the census finds the tree\'s codes of that ending (all statuses) and reads HELD_GENERIC from utils.js', { found: ENDINGS.size, generic: [...TABLE.generic] });
ok(E.red.length === 0, `every code of the tree ending in unread / unreadable has a class — ${E.step.length} worded by the step (a row, an older branch, HELD_GENERIC), ${E.left.length} the step leaves alone (${LEFT.size} classed: own words or no list hold)`, E.red);
ok(E.dead.length === 0 && E.deadGeneric.length === 0, 'every classed code names a live code of the tree (no dead class)', { dead: E.dead, deadGeneric: E.deadGeneric });

console.log('② THE WORDS — zh and ja for every sentence; no file named');
const rowSentences = (() => {
  const i = UTILS.indexOf('const HELD_WORDS = Object.freeze({'), j = UTILS.indexOf('\n});', i);
  const own = [...UTILS.slice(i, j).matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]);
  const gen = /export function heldGenericWords\(\) \{ return t\('((?:[^'\\]|\\.)*)'\); \}/.exec(UTILS);
  const plug = /export function pluginsHeldWords\(\) \{ return t\('((?:[^'\\]|\\.)*)'\); \}/.exec(UTILS);
  return [...own, gen && gen[1], plug && plug[1]].filter(Boolean).map((s) => s.replace(/\\'/g, "'"));
})();
const PHONE = read('src/lib/phone-files.js');
const PHONE_SENT = 'VibeSpace cannot read its storage list right now, so your storage is not shown here — it comes back by itself when the list reads.';
for (const lang of ['zh', 'ja']) {
  const keys = new Set(dictEntries(read(`src/lib/i18n-${lang}.js`)).map((e) => e.key));
  const missing = [...rowSentences, PHONE_SENT].filter((s) => !keys.has(s));
  ok(rowSentences.length >= 5 && missing.length === 0, `every held sentence (${rowSentences.length} of the table, the generic one, the phone card's) has its ${lang} row`, missing);
}
ok(rowSentences.every((s) => !/\.json\b|data folder|\(E[A-Z]+\)/.test(s)), 'no held sentence names a file, the data folder or a read\'s error code', rowSentences.filter((s) => /\.json\b|data folder|\(E[A-Z]+\)/.test(s)));

console.log('③ THE PASS, DRIVEN — utils.js\'s own refusal words, compiled from its source');
const passOf = (src) => {
  const i = src.indexOf('export function hostsHeldWords() {'), j = src.indexOf('\n}\n', src.indexOf('function refusalWords(body) {'));
  if (i < 0 || j < 0) return null;
  // eslint-disable-next-line no-new-func
  return new Function('t', `${src.slice(i, j + 2).replaceAll('export function', 'function')}\nreturn { refusalWords, heldWordsOf, providersHeldWords, pagesHeldWords, statusHeldWords };`)((k) => `«${k}»`);
};
const HUB = (code, file) => ({ error: `changing it: ${file} in VibeSpace's data folder could not be read (EIO); VibeSpace reads it again every few minutes.`, code });
const drive = (P) => {
  if (!P) return null;
  const out = {};
  for (const [code, file] of [['storage_unread', 'mounts.json'], ['tokens_unread', 'mount-tokens.json'], ['plugins_unread', 'plugins.json'], ['store-blocked', 'index.json'], ['providers_unread', 'providers.json'], ['pages_unread', 'published-pages.json'], ['status_unread', 'session-status.json'], ['TASK_GROUPS_UNREAD', 'task-groups.json'], ['records-unread', 'jobs.json'], ['frobs_unread', 'frobs.json']]) {
    const body = HUB(code, file), w = P.refusalWords(body);
    out[code] = { error: w.error, said: w.said, code: w.code, held: P.heldWordsOf(body) };
  }
  out.own = { providers_unread: P.providersHeldWords(), pages_unread: P.pagesHeldWords(), status_unread: P.statusHeldWords() };
  out.other = P.refusalWords({ error: 'no such mount', code: 'not-found' });
  out.success = P.refusalWords({ ok: true, code: 'records-unread', jobs: [] });
  return out;
};
const D = drive(passOf(UTILS));
const GEN = '«VibeSpace cannot read one of its saved lists right now — nothing was changed. Try again in a few minutes.»';
const word = (c) => (D && D[c] ? D[c].error : null);
ok(!!D && word('storage_unread') === '«VibeSpace cannot read its storage list right now — nothing was changed. Try again in a few minutes (it reads it again by itself).»'
  && word('tokens_unread') === '«VibeSpace cannot read its folder links right now — nothing was changed. Try again in a few minutes (it reads them again by itself).»'
  && /^«VibeSpace cannot read its plugins’ settings right now — nothing was changed/.test(word('plugins_unread') || '') && /^«Paused: a channels file could not be read/.test(word('store-blocked') || ''),
  'a held answer of the family is worded by its code, from the table: the storage list, the folder links, the plugins\' settings, the channels\' held files', D);
// r3284: the codes MOVED under the table (r3224 / r3233) answer their units' OWN sentence functions — a row re-pointed is red
const MOVED = ['providers_unread', 'pages_unread', 'status_unread'];
const movedOwn = (d) => !!d && MOVED.every((c) => !!d.own[c] && d[c].error === d.own[c] && d[c].held === d.own[c] && d[c].error !== GEN);
ok(movedOwn(D), 'the moved rows answer their units\' own sentences: providers_unread → providersHeldWords(), pages_unread → pagesHeldWords(), status_unread → statusHeldWords() — in the pass and in heldWordsOf', D && MOVED.map((c) => [c, D[c].error === D.own[c]]));
ok(!!D && ['TASK_GROUPS_UNREAD', 'records-unread'].every((c) => word(c) === GEN), 'a classed list hold with no row of its own (HELD_GENERIC) takes the ONE generic sentence — never the hub\'s English', D && { TASK_GROUPS_UNREAD: word('TASK_GROUPS_UNREAD'), records: word('records-unread') });
ok(!!D && word('frobs_unread') === HUB('frobs_unread', 'frobs.json').error, 'a code of that ending NOBODY classed keeps its own words through the step (the generic sentence never reaches an unjudged code — r3123)', D && D.frobs_unread);
ok(!!D && Object.keys(D).filter((k) => !['other', 'success', 'frobs_unread', 'own'].includes(k)).every((k) => D[k].said && /data folder/.test(D[k].said) && !/\.json|data folder|\(EIO\)/.test(D[k].error) && D[k].held === D[k].error),
  'the hub\'s own sentence is kept as `said` (the journal\'s), the page\'s carries no file name; heldWordsOf agrees with the pass', D);
ok(!!D && D.other.error === 'no such mount' && D.success.error === undefined && D.success.ok === true, 'another refusal passes as it came; an answer that is no refusal is not touched (a held code on a success is no refusal)', D && { other: D.other, success: D.success });

// r3123 (3): each code the census classes «left alone» keeps ITS OWN words through the step — the vault's unreadable key first
const LEFT_LEGS = [['key-unreadable', 'the vault key file .vault-key could not be read (EACCES) — unlock with the second password again'], ['proxy_credential_unreadable', 'the vault is locked — a person unlocks it, then starts the browser again'], ['unreadable', 'the read failed'], ['tabs_unreadable', 'the browser\'s tabs could not be read'], ['groups_unreadable', 'this conversation\'s groups could not be read'], ['store_unreadable', 'the grants could not be read']];
const leftThrough = (P) => (P ? LEFT_LEGS.map(([code, error]) => { const w = P.refusalWords({ error, code }); return { code, kept: w.error === error && w.said === undefined, held: P.heldWordsOf({ error, code }) }; }) : null);
const SK = leftThrough(passOf(UTILS));
ok(!!SK && SK.every((x) => x.kept && x.held === null), 'every code left alone keeps its own words through the step and heldWordsOf answers null for it — the vault\'s unreadable key, a proxy login, a bare «unreadable», a browser\'s tabs, a conversation\'s groups, a store worded by its own door', SK);

console.log('④ THE PHONE — the Files card says a held storage list');
const PH_KEEP = "fetchJson('/api/mounts').then((d) => ({ mounts: d && Array.isArray(d.mounts) ? d.mounts : [], held: !!(d && d.unread) }))";
const PH_SAY = `held.textContent = m.held ? t('${PHONE_SENT}') : '';`;
ok(PHONE.includes(PH_KEEP) && PHONE.includes(PH_SAY) && PHONE.includes('held.hidden = !m.held;'), 'the phone Files card keeps the list\'s `unread` and says the held list in one sentence under its chips (shown only while held)');

console.log('CONTROLS — each over a copy in memory, RED by name');
{
  const planted = new Map(SOURCES); planted.set('src/frobs.js', "res.status(503).json({ error: 'frobs gone', code: 'frob-gone' });\n");
  const P1 = census(heldCodesOf(planted), TABLE);
  ok(P1.red.some((r) => r.startsWith('frob-gone:')), 'CONTROL: a new 503 code with no row, no branch, not the pattern and not NOT_HELD is RED by name', P1.red);
  const planted2 = new Map(SOURCES); planted2.set('src/frobs2.js', "const HOLD = require('./store-read-hold.js');\nconst h = HOLD.create({ file, code: 'frob_bad', aside, words });\n");
  const P2 = census(heldCodesOf(planted2), TABLE);
  ok(P2.red.some((r) => r.startsWith('frob_bad:')), 'CONTROL: a new store-read hold created with a code of its own (not the pattern, no row) is RED by name', P2.red);
  const GSET = /\nconst HELD_GENERIC = new Set\(\[[^\]]*\]\);/.exec(UTILS)[0];
  const cut = tableOf(anchored(UTILS, GSET, GSET.replace("'TASK_GROUPS_UNREAD', ", ''), 'held-words: a classed list hold dropped'));
  const P3 = census(CODES, cut), E3 = endingCensus(ENDINGS, cut);
  ok(P3.red.some((r) => r.startsWith('TASK_GROUPS_UNREAD:')) && E3.red.some((r) => r.startsWith('TASK_GROUPS_UNREAD:')), 'CONTROL: a list hold dropped from HELD_GENERIC — its code is RED by name in both censuses (the 503s, the ending)', { P3: P3.red, E3: E3.red });
  const plantedE = new Map(SOURCES); plantedE.set('src/frobs3.js', "throw Object.assign(new Error('x'), { code: 'frob_unreadable', status: 409 });\n");
  const E4 = endingCensus(endingsOf(plantedE, TABLE.pattern), TABLE);
  ok(E4.red.some((r) => r.startsWith('frob_unreadable:')), 'CONTROL: a new code of that ending answered with ANOTHER status (409) and no class is RED by name (the census covers every status — r3123)', E4.red);
  const STEP = "HELD_GENERIC.has(c) ? heldGenericWords() : null; }";
  const today = leftThrough(passOf(anchored(UTILS, STEP, "c && HELD_CODE_RE.test(c) ? heldGenericWords() : null; }", 'held-words: the step as unit A had it (the pattern alone)')));   // stale-pins: kept — the step as unit A had it, planted as the RED control (r3123)
  ok(!!today && today.filter((x) => !x.kept).length >= 5 && !today.find((x) => x.code === 'key-unreadable').kept, 'CONTROL: the step as unit A had it (the pattern alone) rewords the codes left alone — the vault\'s unreadable key told as «one of its saved lists»: RED', today);
  const ROW = "  storage_unread: () => t('VibeSpace cannot read its storage list right now — nothing was changed. Try again in a few minutes (it reads it again by itself).'),   // mounts.json (src/mounts.js)\n";
  const D4 = drive(passOf(anchored(UTILS, ROW, '', 'held-words: a row cut')));
  ok(!!D4 && D4.storage_unread.error === GEN, 'CONTROL: the storage list\'s row cut — its own sentence is lost (the generic one stands in): the row\'s check above goes RED', D4 && D4.storage_unread);
  const FB = "  const fw = body && typeof body === 'object' && body.code && (body.error || body.ok === false) ? familyHeldWords(body.code) : null;";
  const D5 = drive(passOf(anchored(UTILS, FB, '  const fw = null;', 'held-words: the fallback cut')));
  ok(!!D5 && D5.storage_unread.error === HUB('storage_unread', 'mounts.json').error, 'CONTROL: the pass\'s fallback cut — the hub\'s English (the file\'s name, the read\'s error) reaches the page: RED', D5 && D5.storage_unread);
  const PROW = '  pages_unread: () => pagesHeldWords(),';
  const D6 = drive(passOf(anchored(UTILS, PROW, '  pages_unread: () => heldGenericWords(),', 'held-words: a moved row re-pointed')));
  ok(!!D6 && !movedOwn(D6) && D6.pages_unread.error === GEN, 'CONTROL: the pages\' row re-pointed at the generic sentence — the moved rows\' check above goes RED', D6 && D6.pages_unread);
  const PHX = anchored(PHONE, PH_SAY, "held.textContent = '';", 'held-words: the card\'s sentence cut');
  ok(!PHX.includes(PH_SAY), 'CONTROL: the Files card\'s sentence cut — ④ goes RED (a held list reads as no storage again)');
}

report();
