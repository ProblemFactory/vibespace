#!/usr/bin/env node
// THE INTERPOLATION CENSUS — test-record-clear-census §I, split into this HEAVY twin (B-e601 r2, lane bl-ci, 2026-11-18, the
// coordinator's ruling: the fast tier keeps a count of at most 12 rows over 10 s; §I «memoised under ten seconds or goes heavy»).
// §I already memoises per file (I_MEMO, I_ABSENT_MEMO, I_MASK, the read cache): a CPU profile on the test machine put its ~5 s in
// one pass over the whole tree (~40 MB of sources) through two character-by-character transforms (iMask, iCode) and the nested
// function bodies of iWrappers — not in repeated reads. It moved here VERBATIM, with only what it reads from the suite above it:
// the tree's read cache, lineOf, the agent CLIs' list, iRel, RC and the patched-copy helpers. Its doc block follows.
// The checker: the suite's own ok(), guarded — a swapped call (a name that is not a string) throws.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { trackedFiles } from './tracked-files.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('record-clear-census-interp', ROOT);
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (typeof m !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof m} — the arguments are swapped`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const TREE = new Map();
const readTree = (abs) => { let t = TREE.get(abs); if (t === undefined) { t = fs.readFileSync(abs, 'utf8'); TREE.set(abs, t); } return t; };
const readAt = (override, rel) => (override[rel] ? fs.readFileSync(override[rel], 'utf8') : readTree(path.join(ROOT, rel)));
const read = (rel) => readTree(path.join(ROOT, rel));
/** the 1-based line of offset `at` in `src` — a newline index per text, built once (the census asked `src.slice(0, at).split('\n')`
 *  per site: quadratic in a file's size) */
const NL = new Map();
const lineOf = (src, at) => {
  let ix = NL.get(src);
  if (!ix) { ix = []; for (let k = src.indexOf('\n'); k >= 0; k = src.indexOf('\n', k + 1)) ix.push(k); NL.set(src, ix); }
  let lo = 0, hi = ix.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ix[mid] < at) lo = mid + 1; else hi = mid; }
  return lo + 1;
};
const CLI_FILES = trackedFiles(ROOT, 'data/bin').filter((f) => /^data\/bin\/vibespace-(task|ask|job|msg|channels|status)$/.test(f)); // B-abd8: git ls-files, not a working-tree walk
const ENGINE_FAMILY = new Set(['src/server/channels-access.js', 'src/server/channels-outbound.js', 'src/server/channels-auth.js']);
const iRel = (rel) => (ENGINE_FAMILY.has(rel) ? 'src/server/channels-engine.js' : rel);
const RC = require(path.join(ROOT, 'src/record-clear.js'));

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §I THE INTERPOLATION CENSUS (verify r8). Three rounds in a row found the SAME class one step further out: a MESSAGE that
// embeds a record's words at the moment it is made and then outlives the clear (r4 ⑤ the arrival toast's history, r5 ⑩ a
// toast label that is a job's name, r7 ④ a refusal naming the job; r7 added a census of refusal sentences over a HAND list
// of eleven files). This is the census of EVERY such message, grep-derived over the whole tree — server.js, src/** (the
// client included), data/bin/* — never a hand list:
//   FIELDS    the text fields a clear replaces, DERIVED from src/record-clear.js SHAPES (their leaf names), plus the
//             CARRIERS — the fields a door rewrites on a DERIVED copy of those words (each pinned to its door's statement)
//   SINKS     every call that turns words into a message that leaves the function — a toast (kept in every device's toast
//             history: the For-you Notifications tab), a confirm / input dialog, a window title (the taskbar, layouts.json,
//             an incident), a server notice (a toast on every device), telemetry (data/telemetry → the Diagnostics window),
//             an Error (a route's `{error: e.message}` → a toast; uncaught → telemetry), a route / engine SENTENCE (an
//             `error` / `why` / `message` property, `res.send`), a For-you item / an Activity entry / a status entry made
//             from other words (a DERIVED record), a delivery into a conversation (peer / agent messages and the chat card
//             drawn for them), the client's console (the incident recorder's ring → an incident bundle) — and every
//             same-file WRAPPER of one (a function that hands a parameter to a sink, or builds `{error|why|message}` from it)
//   ABSENT    the sinks the product does not have and must not grow unseen: the browser's Notification API, a service
//             worker's notification, document.title, the app badge, push — ZERO sites
//   RECEIVERS every (file, receiver) a sink reads a text field of is CLASSIFIED: one of the five kinds, a CARRIER (a derived
//             copy of their words), or what else it is (an account, a host, a browser profile…). A new one is RED.
//   CLASSES   a read of a record / carrier at a sink must be, by the sink's own rule: `ref` (a toast whose history keeps a
//             head + {kind, id}, worded live), `live` (re-worded from the current record — isCleared / clearedText / the
//             model's words — every time it is drawn), `cascade` (a derived record that carries its source's id and the
//             source's clear reaches it), `own` (the record's own write — the door clears it), `transcript` (delivered
//             into an agent's conversation: the agent keeps what it received, the confirm dialog says so). A toast allows
//             `ref` only; a notice, telemetry, an Error, a sentence and the console allow NOTHING (their words outlive the
//             clear on every device / in every log); a derived record `cascade` / `own`; a delivery `transcript`.
//   DECLARED  the journal (server console) and the agent CLIs' stdout are whole classes, each with a derived check
//   CONTROLS  patched copies: a toast naming the job, a sentence naming an item, a Notification, telemetry carrying a
//             job's name, a wrapper hiding a toast, a notice naming the job, a console line with an item's text, and the
//             finding of this round (the Ports clash sentence) — each RED on its own leg
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const I_PKG = JSON.parse(read('package.json'));
// GENERATED files are read at their sources: esbuild's --outfile targets in package.json + a file that says GENERATED on its first lines
const I_GENERATED = new Set([...Object.values(I_PKG.scripts || {}).join(' ').matchAll(/--outfile=(data\/bin\/[\w.-]+)/g)].map((m) => m[1]));
const I_BIN = trackedFiles(ROOT, 'data/bin'); // B-abd8: git ls-files — the .197 fix: an UNTRACKED data/bin artifact (rclone, rclone-dl.zip) is not a source file and never becomes an I_CLI "agent CLI"
for (const f of I_BIN) if (/^[^\n]*\n?[^\n]*\bGENERATED\b/.test(read(f).slice(0, 400))) I_GENERATED.add(f);
function walkAll(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkAll(rel, out); }
    else if (/\.(c|m)?js$/.test(e.name) && rel !== 'src/lib/build-version.js') out.push(rel);
  }
  return out;
}
const I_CLI = I_BIN.filter((f) => !/\.(c|m)?js$/.test(f) && !I_GENERATED.has(f));   // the agent CLIs (extension-less scripts)
const I_FILES = ['server.js', ...walkAll('src'), ...I_BIN.filter((f) => /\.(c|m)?js$/.test(f) && !I_GENERATED.has(f))];
const iSources = (override = {}) => new Map(I_FILES.map((rel) => [rel, readAt(override, rel)]));
const I_LEAF = (p) => p.split('.').pop().replace('[]', '');
const I_SHAPE_FIELDS = [...new Set(Object.values(RC.SHAPES).flatMap((s) => s.map(([p]) => I_LEAF(p))))];
// [field, what it carries, the door's file, the statement that rewrites it (or the declaration)]
const I_CARRIERS = [
  ['jobName', 'a held job notification\'s name (the jobs stash)', 'src/jobs.js', 'n.jobName = CLEARED_TEXT;'],
  ['sessionName', 'a Background Work For-you item\'s label (the job\'s name)', 'src/record-clear.js', "if (kind === 'todo' && record && record.origin === 'jobs') out.push({ path: 'sessionName', op: 'drop' });"],
  ['fromName', 'a ladder stash entry\'s sender label (`Background Work · <name>`) and the chat card\'s', 'src/jobs.js', "fromName: 'Background Work · ' + CLEARED_TEXT"],
  ['lastText', 'a group\'s last line', 'src/server/groups-engine.js', 'g.lastText = RC.CLEARED_TEXT; g.lastCleared = true;'],
  ['what', 'a job event-ring line (`announced: …`)', 'src/jobs.js', "e.what = 'announced: ' + CLEARED_TEXT;"],
  ['label', 'a published service\'s port forward (`service: <the job\'s name>`)', 'src/jobs.js', "label: 'service: ' + CLEARED_TEXT"],
  ['cardText', 'the chat card of a delivery (the transcript class; lane group-report-card: a group card rides `group` — its ring copy is re-worded by the groups door, src/normalizers.js redactGroupCards)', 'src/server/conversation-deliver.js', 'emitPeerCard?.(cid, { fromName: opts.fromName || null, text: opts.cardText || text, recorded: text, kind, ...(opts.channel ? { channel: opts.channel } : {}), ...(opts.group ? { group: opts.group } : {}) });'],
  // verify r8 ④: a Ports SCAN names a listener by its service's job (port-forward.js detect) and the page caches the scan
  ['service', 'a Ports scan row\'s tag: the listening service\'s JOB name (+ `serviceJob`, its id)', 'src/lib/sidebar-rail.js', 'for (const rows of this._portScanCache.values()) for (const p of rows) if (p && p.serviceJob && gone.has(String(p.serviceJob))) p.service = CLEARED_TEXT;'],
];
const I_FIELDS = [...new Set([...I_SHAPE_FIELDS, ...I_CARRIERS.map(([f]) => f)])];
const iCarrierMissing = (src = read) => I_CARRIERS.filter(([, , f, stmt]) => !src(f).includes(stmt));
// verify r8 ⑤: the Ports panel draws a carrier (a service's label / scan tag) — a cleared one in THIS device's words
// verify r9 ⑥: the msg flood floor's memory — two writes, each a digest, the identical-text test by digest
const iRateDigest = (ar) => ar.split('_msgRate.set(').length === 3 && !/_msgRate\.set\([^;\n]*\btext\s*\}/.test(ar) && ar.split('rate.h === _msgDigest(text)').length === 3;
const iNotifyDigest = (jb) => jb.split('this._notifyRate.set(').length === 2 && jb.includes('this._notifyRate.set(cid, { ts: now(), h: textDigest(text) });') && jb.includes('if (rate.h === textDigest(text) && rate.ts && now() - rate.ts < 600_000) {');
const iPortsWorded = (rail) => rail.includes("const svcWords = svcM ? (svcM[1] === CLEARED_TEXT ? clearedText() : svcM[1]) : null;") && rail.includes("<span class=\"ports-svc\">${escHtml(svcWords)}</span>") && rail.includes("escHtml(p.service === CLEARED_TEXT ? clearedText() : p.service)") && rail.includes("value: (svcM && svcM[1] !== CLEARED_TEXT ? svcM[1] : '')");
const I_FIELD_RE = new RegExp(String.raw`([A-Za-z_$][\w$]*(?:(?:\?\.|\.)[A-Za-z_$][\w$]*|\[[^\]\n]{0,60}\])*?)(?:\?\.|\.)(` + I_FIELDS.join('|') + String.raw`)\b(?!\s*\()`, 'g');
// the client's word functions: each returns a record's words (the model's, the dialog's, the PURE previews)
const I_WORD_FN = /\b(wordsOf|detailOf|shownText|recordWords|previewWords|nameFor|matchSnippet)\s*\(/g;
// THE ONE DOOR for a spend verdict's words (B-ef83 unit 2's door, line 1053: src/spend-words.js agentSpendWords): it hands a held
// verdict's CODE and any other verdict's OWN DETAIL, so a call of it reads its argument's detail — a text field (主开发 r5229: a row is
// judged on the code at its site; the door is another name for the read the release made, `R.detail || R.why`, never its end)
const I_DOOR_FN = /\bagentSpendWords\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
let I_DOOR_ON = true;   // the r5229 RED below reads two files without it
const iIsLib = (rel) => rel.startsWith('src/lib/') || rel === 'src/client.js';
// [sink id, callee test (callee, rel, the text before the call), where its words go]
const I_SINKS = [
  ['toast', (c) => /(^|\.)showToast$/.test(c), 'a toast — and EVERY toast is kept in the device\'s toast history (localStorage vibespace.toastHistory → the For-you Notifications tab), past any clear'],
  ['dialog', (c) => /(^|\.)(showConfirmDialog|showInputDialog)$/.test(c), 'a confirm / input dialog, open until answered'],
  ['title', (c) => /(^|\.)(setTitle|createWindow)$/.test(c), 'a window title — the taskbar, data/layouts.json (§H2), an incident\'s scene'],
  ['notice', (c) => /(^|\.)serverNotice$/.test(c), 'a server notice: a toast on every device (→ every device\'s toast history)'],
  ['telemetry', (c, rel, before) => (iIsLib(rel) && /^(track|metric)$/.test(c)) || (c === 'record' && /(telemetry|getTelemetry\??\.?\(\)|\btel)\??\.$/.test(before)) || /(^|\.)telemetry\.record$/.test(c) || /^(global\.)?__vsEvent$/.test(c), 'data/telemetry → the Diagnostics window (errors, drift rows, by-event tables) — `global.__vsEvent(name, detail)` included (server.js: a telemetry event)'],
  ['error', (c) => /^(new )?(Error|TypeError|RangeError)$/.test(c), 'an Error: a route answers `{error: e.message}` (→ a client toast); an uncaught one → telemetry `server-error`'],
  // lane job-notify-user r3: `this._forYou` is the engine's ONE For-you copy door (src/jobs.js) — a copy's fields ride its
  // argument (M.forYouCopy(job, …, { text: a.text })), and the door stamps the job's id on the one notifyUser call (pinned below)
  ['todo', (c) => /(^|\.)(userTodos|todos)(\(\))?\.add$/.test(c) || /(^|\.)(notifyUser|_forYou|_forYouDep|forYouDep)$/.test(c), 'a For-you item — a DERIVED record when made from another record\'s words'],   // r4: the door calls the dep it HOLDS (`this._forYouDep`); r6: held off the object graph, read into `forYouDep`
  ['activity', (c) => /(^|\.)addProgress$/.test(c), 'an Activity entry'],
  ['status', (c) => /(^|\.)(pushNotice|setByAgent|setByUser|noteEvent)$/.test(c), 'a status entry / a notice queued for the agent\'s next turn'],
  // B-95fc (the candidate's hosted red, 主开发 r594): the device's peer-post op hands its text to the SHARED body peerPostAnswer
  // (src/peer-messaging.js — it waits for the inbox, then posts): a peer delivery door by its own name, so the field read in its
  // argument is judged as the device's post always was
  ['peer', (c) => /(^|\.)(deliverToConversation|_notifyOwner|_deliverTo|postToPeer|peerPostAnswer|emitPeerCard|injectPeerCard|feedPeerCard)$/.test(c), 'a delivery into a conversation (the agent\'s context + the chat card drawn for it)'],
  ['console', (c, rel) => iIsLib(rel) && (/^console\.(warn|error)$/.test(c) || /^(window\.)?__vsOp$/.test(c)), 'the incident recorder\'s console ring (400 chars a line) and op ring (`window.__vsOp` breadcrumbs) → an incident bundle a capture writes, even after the clear'],
  ['sentence', (c, rel) => !iIsLib(rel) && /^(res|r|reply)(\.status\([^)]*\))?\.(send|end)$/.test(c), 'a route\'s text answer (→ a client toast)'],
  // verify r8 ③: the journal is NOT a class that reaches no client — every server console line rides the in-memory ring
  // (src/server/incident-wiring.js, 600 lines) that EVERY incident captured later copies into data/incidents/<id>/bundle.json
  // (Diagnostics → Incidents), an automatic freeze capture too; and a wrapper's log file. The agent-side tools
  // (data/bin/vibespace-*) are the CLI class: their output is the agent's.
  ['journal', (c, rel) => !iIsLib(rel) && !/^data\/bin\/vibespace-/.test(rel) && (/^console\.(log|warn|error|info)$/.test(c) || /^(log|this\.log|this\.d\.log|d\.log|deps\.log|ctx\.log|opts\.log)$/.test(c) || /^(log|this\.log|logger)\.(log|warn|info|error)$/.test(c)), 'the journal — journalctl / the opslog files AND the server\'s console ring every incident captured later copies (data/incidents/<id>/bundle.json, an automatic freeze capture too); a wrapper\'s log file'],
];
const I_ALLOWED = { toast: ['ref'], dialog: ['live'], title: ['live'], notice: [], telemetry: [], error: [], sentence: [], console: [], journal: ['length'], todo: ['cascade', 'own'], activity: ['own'], status: ['own'], peer: ['transcript'] };
const iEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// the SIZE forms of the class `length` — a mention of the read inside one of these is its size, never its words
const I_LENGTH_FORMS = Object.freeze([
  (r) => String.raw`\b(B|Buffer\.byteLength)\(\s*${r}\b[^)]*\)`,
  (r) => String.raw`${r}\.length\b`,
  (r) => String.raw`\bString\(\s*${r}\s*\)\.length\b`,   // r3664: the text wrapped in a string conversion, then its size (conversation-deliver.js's set-aside line)
]);
const iShowsLength = (forms) => (args, read) => { const r = iEsc(read); const code = iCode(args).replace(new RegExp(forms.map((f) => f(r)).join('|'), 'g'), ''); return !new RegExp(String.raw`(?<![\w$.])${r}\b`).test(code); };
const I_CHECK = {
  // `length`: the line prints a record's SIZE, never its words — every mention of the read is inside one of I_LENGTH_FORMS
  length: iShowsLength(I_LENGTH_FORMS),
  ref: (args) => /history:\s*\{\s*m:/.test(args) && /ref:\s*\{\s*kind:/.test(args),
  live: (args) => /\b(isCleared|clearedText|shownText|wordsOf)\(/.test(args),
  cascade: (args) => /\bjobId\b/.test(args) || /^\s*job\s*,\s*M\.forYouCopy\(job\b/.test(args),   // r3: `_forYou(job, M.forYouCopy(job, …))` — the door stamps the job's id
  own: () => true,
  transcript: () => true,
};
const I_ABSENT = [
  ['the browser\'s Notification API', /\bnew\s+Notification\s*\(|\bNotification\.requestPermission\b/],
  ['a service worker\'s notification', /\.showNotification\s*\(/],
  ['document.title', /\bdocument\.title\s*=(?!=)/],
  ['the app badge', /\b(setAppBadge|setClientBadge)\s*\(/],
  ['push', /\bpushManager\b|\bPushSubscription\b|\bweb-push\b/],
];
const I_CALLEE = /(?<![\w$])((?:new\s+)?(?:[A-Za-z_$][\w$]*(?:\(\))?(?:\?\.|\.))*[A-Za-z_$][\w$]*)\s*(?:\?\.)?\s*\(/g;
const I_PROP = /(?<![\w$.'"])(error|why|message)\s*:\s*(?![:/])/g;
/** a `/` that opens a REGEX literal (by what precedes it) — skipped whole, class brackets respected; returns its end or -1 */
function iRegexEnd(src, j) {
  if (src[j] !== '/' || src[j + 1] === '/' || src[j + 1] === '*') return -1;
  let k = j - 1; while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--;
  const prev = k < 0 ? '\n' : src[k];
  if (!/[(,=:[!&|?{};+\-*%~^<>\n]/.test(prev) && !/\b(return|typeof|case|in|of|void|delete|throw)$/.test(src.slice(Math.max(0, k - 8), k + 1))) return -1;
  let e = j + 1, cls = false;
  for (; e < src.length; e++) { const c = src[e]; if (c === '\n') return -1; if (c === '\\') { e++; continue; } if (cls) { if (c === ']') cls = false; continue; } if (c === '[') cls = true; else if (c === '/') break; }
  if (e >= src.length) return -1;
  e++; while (/[a-z]/.test(src[e] || '')) e++;
  return e;
}
/** the text of an argument / value from `i`: balanced, strings and templates respected (`stopAtComma` = one property value) */
function iSpan(src, i, { stopAtComma = false, max = 6000 } = {}) {
  let depth = 0, j = i; const stack = [];
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    const top = stack[stack.length - 1];
    if (top === '"' || top === "'") { if (c === top || c === '\n') stack.pop(); j++; continue; }
    if (top === '`') { if (c === '`') { stack.pop(); j++; continue; } if (c === '$' && src[j + 1] === '{') { stack.push('${'); depth++; j += 2; continue; } j++; continue; }
    if (c === '/' && src[j + 1] === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
    if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? src.length : e + 2; continue; }
    if (c === '/') { const e = iRegexEnd(src, j); if (e > 0) { j = e; continue; } }
    if (c === '"' || c === "'" || c === '`') { stack.push(c); j++; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; stack.push(c); j++; continue; }
    if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; stack.pop(); j++; continue; }
    if (stopAtComma && depth === 0 && (c === ',' || c === ';')) break;
    if (stopAtComma && depth === 0 && c === '\n' && !/([+?:|&(,]|=>)\s*$/.test(src.slice(i, j)) && !/^\s*[+?:|&.]/.test(src.slice(j + 1, j + 80))) break;
    j++;
    if (j - i > max) break;
  }
  return src.slice(i, j);
}
/** the CODE of a text: string literals emptied, a template's text dropped (its ${…} kept), comments dropped — a field
 *  NAMED in a sentence ('i18n.detail must be an array') is not a field READ */
function iCode(text) {
  let out = '', j = 0; const stack = [];
  while (j < text.length) {
    const c = text[j], top = stack[stack.length - 1];
    if (top === '"' || top === "'") { if (c === '\\') { j += 2; continue; } if (c === top || c === '\n') { stack.pop(); out += c; } j++; continue; }
    if (top === '`') { if (c === '\\') { j += 2; continue; } if (c === '`') { stack.pop(); out += c; j++; continue; } if (c === '$' && text[j + 1] === '{') { stack.push('${'); out += '${'; j += 2; continue; } j++; continue; }
    if (c === '/' && text[j + 1] === '/') { while (j < text.length && text[j] !== '\n') j++; continue; }
    if (c === '/' && text[j + 1] === '*') { const e = text.indexOf('*/', j + 2); j = e < 0 ? text.length : e + 2; continue; }
    if (c === '/') { const e = iRegexEnd(text, j); if (e > 0) { out += '/./'; j = e; continue; } }
    if (c === '"' || c === "'" || c === '`') { stack.push(c); out += c; j++; continue; }
    if (c === '{' || c === '(' || c === '[') stack.push(c);
    else if ((c === '}' || c === ')' || c === ']') && stack.length) stack.pop();
    out += c; j++;
  }
  return out;
}
const iComment = (src, idx) => { const ls = src.lastIndexOf('\n', idx) + 1; return /^\s*(\/\/|\*|\/\*)/.test(src.slice(ls, idx + 1)); };
/** a position-preserving mask of a source: the text of string literals, templates (their ${…} kept) and comments becomes
 *  spaces — a sink spelled INSIDE a literal (the source of a generated CLI, a sentence) is not a call */
function iMask(src) {
  const out = src.split(''); let j = 0; const stack = [];
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (j < src.length) {
    const c = src[j], top = stack[stack.length - 1];
    if (top === '"' || top === "'") { if (c === '\\') { blank(j, j + 2); j += 2; continue; } if (c === top || c === '\n') { stack.pop(); j++; continue; } blank(j, j + 1); j++; continue; }
    if (top === '`') { if (c === '\\') { blank(j, j + 2); j += 2; continue; } if (c === '`') { stack.pop(); j++; continue; } if (c === '$' && src[j + 1] === '{') { stack.push('${'); j += 2; continue; } blank(j, j + 1); j++; continue; }
    if (c === '/' && src[j + 1] === '/') { const e = src.indexOf('\n', j); const end = e < 0 ? src.length : e; blank(j, end); j = end; continue; }
    if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); const end = e < 0 ? src.length : e + 2; blank(j, end); j = end; continue; }
    if (c === '/') { const e = iRegexEnd(src, j); if (e > 0) { blank(j, e); j = e; continue; } }
    if (c === '"' || c === "'" || c === '`') { stack.push(c); j++; continue; }
    if (c === '{' || c === '(' || c === '[') stack.push(c);
    else if ((c === '}' || c === ')' || c === ']') && stack.length) stack.pop();
    j++;
  }
  return out.join('');
}
const I_MASK = new Map();
const iMasked = (src) => { let m = I_MASK.get(src); if (m === undefined) { m = iMask(src); I_MASK.set(src, m); } return m; };
const iInLiteral = (src, idx, len) => iMasked(src).slice(idx, idx + len) !== src.slice(idx, idx + len);
function iReads(text) {
  const code = iCode(text), out = new Set();
  I_FIELD_RE.lastIndex = 0; let f;
  while ((f = I_FIELD_RE.exec(code))) out.add(f[1].replace(/\s+/g, '') + '.' + f[2]);
  I_WORD_FN.lastIndex = 0;
  while ((f = I_WORD_FN.exec(code))) out.add(f[1] + '()');
  if (I_DOOR_ON) { I_DOOR_FN.lastIndex = 0; while ((f = I_DOOR_FN.exec(code))) out.add(f[1] + '.detail'); }
  return [...out];
}
function iSplitArgs(text) {
  const out = []; let depth = 0, cur = '', q = null;
  for (let j = 0; j < text.length; j++) {
    const c = text[j];
    if (q) { cur += c; if (c === '\\') { cur += text[++j] || ''; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
const iSink = (callee, rel, before) => I_SINKS.find(([, test]) => test(callee, rel, before));
const iParamRe = (p) => new RegExp(String.raw`(?<![\w$.])${p.replace(/\$/g, '\\$')}(?![\w$])`);
/** same-file WRAPPERS: a function that hands one of its PARAMETERS to a sink (or builds `{error|why|message}` from one) —
 *  a call of it is that sink, for the arguments in those positions */
function iWrappers(src, rel) {
  const out = new Map();
  const DEF = /(?<![\w$.])(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>|(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^()]*)\))/g;
  let m;
  while ((m = DEF.exec(src))) {
    if (iComment(src, m.index) || iInLiteral(src, m.index, m[0].length)) continue;
    const name = m[1] || m[4], params = (m[2] ?? m[3] ?? m[5] ?? '').split(',').map((p) => p.trim().replace(/=.*$/, '').replace(/[{}[\].\s]/g, '')).filter(Boolean);
    if (!params.length) continue;
    let k = m.index + m[0].length; while (/\s/.test(src[k])) k++;
    const body = src[k] === '{' ? '{' + iSpan(src, k + 1) + '}' : iSpan(src, k, { stopAtComma: true });
    if (!iIsLib(rel)) {
      const code = iCode(body);
      const idx = params.map((p, i) => { const e = p.replace(/\$/g, '\\$'); const valRe = new RegExp(String.raw`(?<![\w$.'"])(error|why|message)\s*:\s*[^,}]*(?<![\w$.])${e}(?![\w$])`); return (valRe.test(code) || (['error', 'why', 'message'].includes(p) && new RegExp(String.raw`[{,]\s*${e}\s*[,}]`).test(code))) ? i : -1; }).filter((i) => i >= 0);
      if (idx.length) { out.set(name, { sink: 'sentence', idx }); continue; }
    }
    I_CALLEE.lastIndex = 0; let c;
    while ((c = I_CALLEE.exec(body))) {
      const sink = iSink(c[1].replace(/\s+/g, ' '), rel, body.slice(Math.max(0, c.index - 60), c.index));
      if (!sink) continue;
      const args = iCode(iSpan(body, c.index + c[0].length));
      const idx = params.map((p, i) => (iParamRe(p).test(args) ? i : -1)).filter((i) => i >= 0);
      if (idx.length) { out.set(name, { sink: sink[0], idx }); break; }
    }
  }
  return out;
}
/** verify r9 item 2(b): THE ONE-LEVEL ALIAS PASS. r8 declared that §I does not follow a record's field copied into a local;
 *  a first try matched every `const x = …` naming a field (222 hits over common names). Restricted to a COPY — `const x =
 *  rec.<field>` (the right side HEADED by the read; String( / ( / ${ allowed) and `const { field } = rec` / `for (const
 *  { field } of …)` — and to a sink in the innermost block holding the copy, it is 165 copies and 19 that reach a sink
 *  (verify r9: r9/alias-strict.json): each is a read AT that sink — the row carries the SOURCE read and the sink's words with
 *  the alias spelled as its source (a class's check reads them), judged by the same receiver + site tables. A copy into an
 *  object's member, or through two locals, is declared (the broad pass, 115 sink-reaching copies judged by hand in verify r9) */
const I_ALIAS_DEF = /(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?![=>])\s*/g;
const I_ALIAS_DESTR = /(?<![\w$.])(?:(?:const|let|var)\s*\{([^{}]*)\}\s*=(?![=>])\s*|for\s*\(\s*(?:const|let|var)\s*\{([^{}]*)\}\s+of\s+)/g;
const I_ALIAS_HEAD = new RegExp(String.raw`^(?:String\(\s*|\(\s*|\$\{\s*)?([A-Za-z_$][\w$]*(?:(?:\?\.|\.)[A-Za-z_$][\w$]*|\[[^\]\n]{0,60}\])*?)(?:\?\.|\.)(` + I_FIELDS.join('|') + String.raw`)\b(?!\s*\()`);
/** the end of the innermost block holding `at` (the source's end at top level) */
function iBlockEnd(src, masked, at) {
  let d = 0, k = at;
  for (; k >= 0; k--) { const c = masked[k]; if (c === '}') d++; else if (c === '{') { if (d === 0) break; d--; } }
  return k < 0 ? src.length : k + 1 + iSpan(src, k + 1, { max: Infinity }).length;   // lane dialog-yield: a BLOCK's end is its closing brace — the 6000-char span cap cut openBuildDialog's scope 14 characters before its toast's `name`
}
function iAliases(src, rel, W) {
  const masked = iMasked(src), out = [], defs = [];
  const CALL = new RegExp(I_CALLEE.source, 'g'), PROP = new RegExp(I_PROP.source, 'g');
  let m;
  const DEF = new RegExp(I_ALIAS_DEF.source, 'g');
  while ((m = DEF.exec(masked))) {
    const rhs = iSpan(src, m.index + m[0].length, { stopAtComma: true });
    const h = I_ALIAS_HEAD.exec(iCode(rhs).trim());
    if (h) defs.push({ alias: m[1], at: m.index, end: m.index + m[0].length + rhs.length, read: h[1].replace(/\s+/g, '') + '.' + h[2] });
  }
  const DES = new RegExp(I_ALIAS_DESTR.source, 'g');
  while ((m = DES.exec(masked))) {
    const pat = src.slice(m.index, m.index + m[0].length).match(/\{([^{}]*)\}/)[1];
    const rhs = iSpan(src, m.index + m[0].length, { stopAtComma: !m[2] });
    const recv = iCode(rhs).trim().replace(/\s+/g, '').slice(0, 80);
    for (const part of pat.split(',')) {
      const pm = /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*(?:=[\s\S]*)?$/.exec(part);
      if (pm && I_FIELDS.includes(pm[1])) defs.push({ alias: pm[2] || pm[1], at: m.index, end: m.index + m[0].length + rhs.length, read: recv + '.' + pm[1] });
    }
  }
  for (const d of defs) {
    const scope = src.slice(d.end, iBlockEnd(src, masked, d.at)), aRe = iParamRe(d.alias);
    const swap = new RegExp(String.raw`(?<![\w$.])${d.alias.replace(/\$/g, '\\$')}(?![\w$])`, 'g');
    const push = (abs, sink, args) => { const code = iCode(args); if (aRe.test(code)) out.push({ rel, line: lineOf(src, abs), sink, read: d.read, args: code.replace(swap, d.read), alias: d.alias, defLine: lineOf(src, d.at) }); };
    let c;
    CALL.lastIndex = 0;
    while ((c = CALL.exec(scope))) {
      const abs = d.end + c.index;
      if (iComment(src, abs) || iInLiteral(src, abs, c[0].length)) continue;
      const callee = c[1].replace(/\s+/g, ' '), w = W.get(callee), direct = iSink(callee, rel, src.slice(Math.max(0, abs - 60), abs));
      const sink = direct || (w ? [w.sink] : null);
      if (!sink) continue;
      const whole = iSpan(scope, c.index + c[0].length);
      push(abs, sink[0], w && !direct ? iSplitArgs(whole).filter((_, i) => w.idx.includes(i)).join(', ') : whole);
    }
    if (!iIsLib(rel)) {
      PROP.lastIndex = 0;
      while ((c = PROP.exec(scope))) {
        const abs = d.end + c.index;
        if (iComment(src, abs) || iInLiteral(src, abs, c[0].length) || !/[{,(\n]\s*$/.test(src.slice(Math.max(0, abs - 60), abs))) continue;
        push(abs, 'sentence', iSpan(scope, c.index + c[0].length, { stopAtComma: true }));
      }
    }
  }
  return out;
}
/** every sink site × every text-field read in its words: {rel, line, sink, read, args} — per file, memoised on the
 *  file's text (a control re-scans only its patched copy) */
const I_MEMO = new Map();
let I_SCANS = 0;   // files scanned, not answered by the memo (the r5229 RED's witness)
function interpCensus(srcs) {
  const rows = [];
  for (const [rel, src] of srcs) {
    const memo = I_MEMO.get(rel);
    if (memo && memo.src === src && memo.door === I_DOOR_ON) { rows.push(...memo.rows); continue; }   // r5249: a memo filled with the door rule ON never answers a pass with it OFF
    I_SCANS++;
    const at = rows.length;
    const W = iWrappers(src, rel);
    I_CALLEE.lastIndex = 0; let m;
    while ((m = I_CALLEE.exec(src))) {
      const callee = m[1].replace(/\s+/g, ' '), w = W.get(callee);
      const sink = iSink(callee, rel, src.slice(Math.max(0, m.index - 60), m.index)) || (w ? [w.sink] : null);
      if (!sink || iComment(src, m.index) || iInLiteral(src, m.index, m[0].length)) continue;
      const whole = iSpan(src, m.index + m[0].length);
      if (/\bfunction\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
      if (!/new\s/.test(callee) && /^\s*\{/.test(src.slice(m.index + m[0].length + whole.length + 1, m.index + m[0].length + whole.length + 4))) continue;   // a method header `name(args) {`
      const args = w && !iSink(callee, rel, src.slice(Math.max(0, m.index - 60), m.index)) ? iSplitArgs(whole).filter((_, i) => w.idx.includes(i)).join(', ') : whole;
      const line = lineOf(src, m.index);
      for (const read of iReads(args)) rows.push({ rel, line, sink: sink[0], read, args, wrapped: !!w && !iSink(callee, rel, '') });
    }
    if (!iIsLib(rel)) {
      // a `server-notice` FRAME broadcast directly (not through serverNotice()) is the same sink: every device toasts its text
      const NOTICE_FRAME = /\btype:\s*'server-notice'/g;
      while ((m = NOTICE_FRAME.exec(src))) {
        if (iComment(src, m.index) || iInLiteral(src, m.index, 5)) continue;   // `type:` itself — the value IS a literal
        let k = m.index, depth = 0;
        for (; k > 0; k--) { const ch = src[k]; if (ch === '}') depth++; else if (ch === '{') { if (depth === 0) break; depth--; } }
        const obj = iSpan(src, k + 1);
        const line = lineOf(src, m.index);
        for (const read of iReads(obj)) rows.push({ rel, line, sink: 'notice', read, args: obj });
      }
      I_PROP.lastIndex = 0;
      while ((m = I_PROP.exec(src))) {
        if (iComment(src, m.index) || iInLiteral(src, m.index, m[0].length) || !/[{,(\n]\s*$/.test(src.slice(Math.max(0, m.index - 60), m.index))) continue;
        const val = iSpan(src, m.index + m[0].length, { stopAtComma: true });
        const line = lineOf(src, m.index);
        for (const read of iReads(val)) rows.push({ rel, line, sink: 'sentence', read, args: val });
      }
    }
    rows.push(...iAliases(src, rel, W));   // verify r9: the one-level alias pass (a copy of a field into a local, to a sink in its block)
    I_MEMO.set(rel, { src, door: I_DOOR_ON, rows: rows.slice(at) });
  }
  return rows;
}
const iRecvOf = (read) => read.endsWith('()') ? read : read.replace(/\.[^.]+$/, '');
// every (file, receiver) a sink reads a text field of: one of the five kinds, a CARRIER, or what it is. For a record / a
// carrier the per-site class is in I_SITES. A (file, receiver) the table does not name is RED; a row the tree no longer has is RED.
const I_RECORD_KINDS = new Set([...RC.RECORD_KINDS, 'carrier']);
const I_RECV = {
  'src/channel-store.js|fam': ['words', 'B-f276 (lane bl-windows): a channels family’s own FILE NAME (index.json, groups.json, poll-stamps.json …) in its hold’s Error — the store’s constant, never a record’s text'],
  'src/lib/telemetry-client.js|x': ['words', 'B-402f: a PURE verdict over a window error (windowErrorEntry) — the error\'s own message / place / stack, or the browser\'s ResizeObserver note\'s words; never a record\'s'],
  // ── the five kinds and their carriers ──
  'src/agent-routes.js|e': ['carrier', 'a stash entry drained into the agent\'s next turn (the ladder\'s and the jobs engine\'s) — drawn as the chat card of what the agent received'],
  'src/agent-routes/status.js|add': ['todo', 'the agent\'s OWN For-you item (vibespace-ask) — the record itself'],
  'src/browser-takeover-request.js|rec': ['takeover request', 'a takeover request (lane browser-takeover-queue) — its own store (data/browser-takeovers.json), not one of the five kinds a clear reaches: the agent\'s words answered back to the agent'],
  'src/lib/browser-takeover-queue.js|req': ['takeover request', 'a takeover request a «Waiting for you» row / the Reply dialog draws (lane browser-takeover-queue) — the request store\'s record, never a For-you item\'s words'],
  'src/agent-routes/status.js|s': ['session', 'the filing session\'s own name (a For-you item\'s label)'],
  'src/agent-routes.js|req.body': ['activity', 'the agent\'s OWN Activity note (vibespace-task progress) — the record itself'],
  'src/agentd/agentd.js|msg': ['carrier', 'the delivered text of the device\'s peer-post op (the ladder\'s rung ③)'],
  'src/jobs.js|job': ['job', 'the Background Work record'],
  'src/jobs.js|a': ['job', 'the job\'s notify ACTION (`job.action` — SHAPES `action.text`)'],
  'src/jobs.js|v.notice': ['words', 'a PURE verdict\'s sentence (src/job-notice.js noticeVerdict — lane job-notice-dedupe: the job\'s public URL + the relay\'s failure sentence + when it went down; the job\'s name rides the card label, never this text)'],
  'src/lib/jobs-panel.js|j': ['job', 'a job snapshot the panel drew'],
  'src/lib/jobs-panel.js|job': ['job', 'the job the Job input window drew'],
  'src/lib/user-todos-panel.js|nameFor()': ['todo', 'a For-you item\'s label (a Background Work item\'s is the job\'s name)'],
  'src/lib/user-todos-actions.js|row': ['todo', 'an ask\'s --artifact row (its name / path — lane foryou-attachments; a clear drops the item\'s artifacts: SHAPES todo)'],
  'src/lib/user-todos-panel.js|wordsOf()': ['todo', 'a For-you item\'s words (the model\'s)'],
  'src/server/conversation-deliver.js|opts': ['carrier', 'the card label + text of a delivery (a job\'s `Background Work · <name>`)'],
  'src/server/conversation-deliver.js|one': ['carrier', 'the retry park\'s single landed entry at its card (notify-retry verify r2: the card is built AFTER the post from the words as they stand — a clear that reached it mid-flight already rewrote them to the sentence)'],
  'src/server/groups-engine.js|wc': ['group-message', 'a wake\'s card words: the message that woke it, or each message its report showed (B-9fd6)'],
  'src/server/groups-engine.js|rep': ['group-message', 'a wake REPORT (a line per group message)'],
  'src/server/session-brain.js|fact': ['status', 'the vcs event entry of a session\'s status history (its branch) — the record itself'],
  'src/agent-routes.js|u': ['carrier', 'the jobs UPDATE a turn is injected with (job events\' words) — the journal prints its SIZE'],
  'src/agent-routes.js|rep': ['group-message', 'a next-turn group REPORT (a line per group message) — the journal prints its SIZE'],
  // bl-msg B-6edc (主开发 r337, the hosted red of line 32): the backlog edit's cap refusal names the cap it would pass
  'src/agent-routes.js|BACKLOG_CAPS': ['constant', 'the backlog caps table (src/task-groups.js BACKLOG_CAPS: an item\'s line and detail lengths) — a NUMBER inside the edit\'s refusal sentence («a detail holds at most 6000»), never a record\'s words'],
  'data/bin/codex-chat-wrapper.js|data': ['carrier', 'the task context the codex wrapper injects (Activity notes, a status) — its log prints the LENGTH'],
  'src/server/stdout/claude-stream-json.js|po': ['carrier', 'the sender name of a message the CLI received (a job\'s `Background Work · <name>`) — the live chat card'],
  // ── not a record: what each is ──
  'src/harnesses/claude-oat-expiry.js|a': ['account', 'an account / pool name'], 'server.js|h': ['host', 'a machine name'], 'src/server/task-groups-wiring.js|h': ['host', 'a machine name (the context sync\'s notices; «make room» 2026-11-17: moved whole out of server.js)'],
  'src/accounts.js|a': ['account', 'an account'], 'src/accounts.js|target': ['account', 'an account'],
  'src/server/account-usage-routes.js|row': ['account', 'a pool member\'s roster row (accounts.poolRoster) — its account name in the gather route\'s refusal (lane pool-silent-members acceptance r2)'],
  'src/lib/aes-fallback.js|key.algorithm': ['crypto key', 'the imported AES key\'s algorithm name (AES-CBC / AES-ECB) in a mismatch Error — a constant of the fallback, never a record (lane mac-ard-signin; int259 seam)'],
  'src/browser-profiles.js|f': ['launch fatal row', 'a fixed reason code of LAUNCH_FATALS (lane browser-tmpdir-socket-length)'],
  'src/home-verdict.js|r': ['tool row', 'a TOOL_ROWS row of the re-home (B-ba47): a fixed PROGRAM name (node, npm, …) a row names — none of the five kinds a clear reaches'],
  'src/browser-profiles.js|existing': ['browser profile', 'a profile label'], 'src/browser-profiles.js|profile': ['browser profile', 'a profile label'], 'src/browser-profiles.js|row': ['browser profile', 'a profile label'],
  'src/browser-switch.js|profile': ['browser profile', 'a profile label'], 'src/browser-trace.js|profile': ['browser profile', 'a profile label'],
  // lane browser-surfaces: a browser KERNEL's prompt (VibeSpace.surfaceOpened) — the page's words through ST.pageText, never one of the five kinds
  'src/browser-surfaces.js|a': ['browser surface', 'a kernel prompt\'s ANSWER label (page text) in THE sentence / the note / the verdict\'s refusal'],
  'src/browser-surfaces.js|f': ['browser surface', 'a kernel prompt\'s FIELD label / choices (page text) in THE sentence / the verdict\'s refusal'],
  'src/browser-surfaces.js|b': ['browser surface', 'a kernel prompt\'s block — its whitelisted detail (page text) on the bar\'s details fold'],
  'src/server/browser-dialogs.js|rec': ['browser surface', 'a kernel prompt\'s record — a suppressed prompt\'s kind + reason (the kernel\'s words) on its ONE journal line'],
  'src/channel-groups.js|c': ['member', 'B-ff04: a candidate MEMBER\'s name in the @ refusal (unknown / ambiguous-mention) — a session name, not a message'],
  'src/channel-groups.js|group': ['agent group', 'a group\'s NAME — the group, not a message (a rename\'s previous name, raw.from, is the cleared field)'],
  'src/channel-record.js|b': ['channel block', 'a render block\'s own kind word'], 'src/channel-record.js|BLOCK_LIMITS': ['constant', 'a length limit'],
  'src/desktop-fit.js|rec': ['desktop app', 'an app label'], 'src/desktop-apps.js|row': ['desktop app', 'an app label'], 'src/desktop-browser-app.js|row': ['desktop app', 'an app label'], // rv-desktop-apps F-S1: the window / browser families' own files
  'src/desktop-serve.js|rec': ['desktop app', 'an app label'], 'src/desktop-serve.js|row': ['desktop app', 'an app label / refusal reason'],
  'src/desktop-serve.js|busy': ['desktop app', 'lane remoteapp-r1a: the RemoteApp session already running on that machine — its app label + id in the rdp_session_busy refusal'], 'src/desktop-serve.js|rq': ['desktop app', 'lane remoteapp-r1a: a RemoteApp request\'s app name (the window label) in the launch journal line'],
  'src/lib/machine-desktop.js|r': ['desktop app', 'lane remoteapp-r1a: the started RemoteApp record\'s app label in the "Opening … through RemoteApp" toast'],
  'src/lib/remoteapp-card.js|m': ['host', 'lane remoteapp-r1b: the paired machine\'s own name (its GET /api/desktop/machines row) in the RemoteApp settings card\'s title, sentences and toasts — a machine name, never a record\'s words'],
  'src/exit-proxy.js|session': ['session', 'the conversation the network / a command is lent to — its own name (lane-pairing exit access)'], 'src/exit-proxy.js|h': ['host', 'a machine name'], 'src/hosts.js|h': ['host', 'a machine name'],
  'src/user-todos.js|w': ['words', 'B-44f3 (主开发 07:22Z, the same law as hosts.js|w0): the For-you store\'s wait that threw AFTER the read — ' + 'its own label (`w.label`, set by whenRead: String(label).slice(0, 80)) on the hub journal line «… (waited for the read) failed», as each caller of ' + 'UserTodoManager.whenRead hands it — 39 call lines read at 1fe08fafd (git grep -F \'whenRead(\' over src + server.js: 48, less the hosts store\'s 8 and the ' + 'definition), every label the hub\'s own fixed words: 34 literals (the boot reconciles, the held notices\' closes, the owed filings, the vault lock\'s withdraw, ' + 'the watch door, the queued file, the pool\'s waits …), the mounts adapter passing the browser dialogs\' literal through, migration-runner\'s registry id ' + '(`migration ${id}\'s failed notice` — a DEVICE/hub migration id, a code constant), mount-for-you\'s three (`… of ${m.id}` — the hub-minted mnt-<hex> id); ' + 'no conversation\'s name, no item\'s text, no path a person typed, no machine name — never a record\'s words'],
  'src/hosts.js|w0': ['words', 'the hosts store\'s wait LET GO past its bound (主开发 01:20Z (4), 04:33Z (3) — the stores chain): the wait\'s own label (`what`) on the hub journal line, as each caller of hosts.whenRead hands it — SEVEN callers in the tree, every one the hub\'s own fixed words: the re-adoption of remote sessions left running (server.js), the dial-token migration twice (hosts.js — its own file\'s name, dial-tokens.json), the pull mounts\' pair check (machine-mounts.js), the token-copy sweep of an account twice (account-usage-routes.js — the hub-minted id, checked /^(acct|sub|cxs)-[a-f0-9]+$/ first), the remote stop of a conversation (ws-handler.js — a live session\'s hub-minted id); no machine name a person gave, no path, no typed word — never a record\'s words'],
  'src/lib/app.js|BACKEND_META[h.id]': ['harness', 'a harness label'], 'src/lib/app.js|BACKEND_META[msg.backend]': ['harness', 'a harness label'],
  'src/lib/app.js|lost': ['account', 'an account'], 'src/lib/app.js|msg': ['frame', 'a server-notice / backend-status frame\'s text (its producer is judged at the `notice` sink)'],
  'src/lib/browser-live-window.js|dw': ['words', 'a PURE outcome\'s sentence (browser-switcher-model)'],
  'src/lib/browser-live-window.js|st.target': ['browser profile', 'the shown browser\'s profile label (B-53df: the Restart refusal\'s words name it)'],
  'src/lib/browser-live-window.js|sw': ['words', 'a PURE step\'s sentence (browser-new-profile-model machineStepWords: a paired machine with no browser — the machine\'s id + its one command; lane remote-profile-start)'],
  'src/lib/browser-profile-picker.js|r.pin': ['browser profile', 'a profile label'], 'src/lib/browser-build-dialog.js|view': ['browser profile', 'a profile label (Change build…, lane browser-admin)'],   'src/server/jobs-wiring.js|e': ['error', 'the For you store\'s refusal (lane job-notify-user r2: its code and its open COUNT — a number, never an item\'s text)'], 'src/lib/browser-switcher.js|w': ['words', 'a PURE outcome\'s sentence'],
  // lane owner-press-attended: the refused hand-over's toast (PURE stash-summary handOverRefusalWords — the route's code + the
  // 429 body's account name, cap and next free slot, never a notice's words); the handback verdict's `reason` is a spend
  // reason CODE (browser-handback | browser-handback-idle), compared, never shown
  'src/lib/stash-strip.js|w': ['words', 'a PURE outcome\'s sentence (handOverRefusalWords: a refusal code + an account name, a cap, a time)'],
  'src/server/browser-handback.js|verdict': ['words', 'a PURE verdict\'s spend-reason CODE (announceVerdict: which reason the ladder is asked under)'],
  'src/lib/browser-trace-view.js|e': ['browser profile', 'a profile label'], 'src/lib/browser-trace-view.js|f': ['browser profile', 'a profile / its file'], 'src/lib/browser-trace-view.js|o': ['browser profile', 'an orphan profile dir'],
  'src/lib/browser-trace-view.js|wordsOf()': ['words', 'a PURE refusal sentence by its code (B-53df restartRefusalWords: the row\'s label at most)'],
  'src/lib/browser-trace-view.js|res.profile': ['browser profile', 'a profile label'], 'src/lib/browser-trace-view.js|res': ['browser profile', 'the profile adopted from'], 'src/lib/browser-trace-view.js|r': ['browser profile', 'a profile label'],
  'src/lib/browser-trace-view.js|k': ['browser profile', 'a kept conversation browser\'s label (the session name it was kept for — lane browser-resume §3.9)'], 'src/server/browser-kept.js|e': ['browser profile', 'a kept conversation browser\'s label (the session name it was kept for — lane browser-resume §3.9)'],
  'src/lib/browser-who-dialog.js|r.profile': ['browser profile', 'a profile label'],
  'src/lib/user-todos-actions.js|r.browser': ['browser profile', 'a profile label (the For-you Restart of a browser that stopped answering — int220, lane browser-unresponsive)'],
  'src/lib/new-session-form.js|acc': ['channel account', 'lane new-session-form: the account ticked in the New Session form — its name in the toast that says its access row was not written'], 'src/lib/may-use-section.js|a': ['channel account', 'unit what-it-may-use: the account a tick in Session Properties\' «What it may use» takes back — its name in the toast that says its access row was not removed'], 'src/lib/channel-account-dialogs.js|v': ['channel account', 'an account name'],
  'src/lib/channel-group-dialogs.js|group': ['agent group', 'a group\'s name'], 'src/lib/channel-outbox.js|r': ['outbox proposal', 'a send\'s refusal reason'],
  'src/lib/channel-webhook.js|v': ['channel author', 'a webhook caller\'s registered name (the owner typed it; the author of its calls)'], 'src/lib/channel-webhook.js|o': ['outbox proposal', 'a send\'s outcome — the caller\'s name + the server\'s refusal reason'], // lane webhook-l2-ui
  'src/lib/channel-webhook.js|ck': ['channel author', 'the other VibeSpace\'s name its pairing code carries (its owner\'s reply name), worded in the join box\'s done toast'], 'src/routes/webhook.js|cv': ['channel author', 'the other VibeSpace\'s name its pairing code carries, named in the join\'s refusal sentence'], // lane webhook-pair-join
  'src/lib/channels-panel.js|r': ['count', 'a refresh answer\'s pending flag'], 'src/lib/channel-window.js|group': ['agent group', 'a group\'s name'], 'src/lib/channel-window.js|a': ['channel author', 'lane lark-threads: an author\'s vendor name / id in the "Set a name…" dialog\'s title (the vendor\'s, never a record\'s words)'], 'src/lib/channel-window.js|r2.proposal': ['outbox proposal', 'the channel\'s refusal of a send'],
  'src/lib/chat-view.js|msg.page': ['published page', 'a page\'s name'], 'src/lib/chat-view.js|r': ['codex sub-agent', 'an unresolved sub-agent\'s reason code'],
  'src/lib/chat-status-bar.js|p': ['account', 'the conversation\'s model provider\'s label (the owner named it), in the model badge\'s "does not serve" toast — lane models-at-session'],
  // lane lg-providers (主开发 r4464, box row 851 at 179edf1e1): the conversation strip's press reply (line 955, B-d578) — JUDGED: its words are
  // the product's own sentences (t keys) whose only parameters are counts and a model provider's label or id; the label is the owner's
  // (only a person's page writes it: src/routes/providers.js personVerdict) and providers are no kind a clear replaces
  'src/lib/chat-status-bar.js|m': ['words', 'the strip\'s press reply, toast specs built in _fbPress: the product\'s own sentences (fallbackPressToasts and two t keys), their only parameters counts and a model provider\'s label (labelOf — the owner named it, as |p) or its id; no record\'s words, nothing a peer typed'],
  'src/lib/desktop-app-launcher.js|end': ['desktop app', 'an app label'], 'src/lib/desktop-manager.js|w': ['words', 'the Rename door\'s dialog words — the PURE table\'s t() keys (lane desktop-doors-table r2 ④)'], 'src/lib/file-explorer.js|bk': ['bookmark', 'a bookmark label'],
  'src/lib/integrations-window.js|v': ['integration', 'a key label'],
  'src/lib/manage-agents.js|a': ['account', 'an account'], 'src/lib/manage-agents.js|c.account': ['account', 'an account'], 'src/lib/manage-agents.js|fin.account': ['account', 'an account'],
  'src/lib/manage-agents.js|fin.movedTo': ['account', 'an account'], 'src/lib/manage-agents.js|last.account': ['account', 'an account'], 'src/lib/manage-agents.js|last': ['account', 'an account'],
  'src/lib/manage-agents.js|p': ['account', 'a pool'], 'src/lib/manage-agents.js|r2.account': ['account', 'an account'],
  'src/lib/manage-agents.js|r.account': ['account', 'an account'], 'src/lib/manage-agents.js|r.retargeted': ['account', 'an account'], 'src/lib/manage-agents.js|r': ['account', 'an account'], 'src/lib/manage-agents.js|sa': ['account', 'an account'],
  'src/lib/manage-agents.js|m': ['words', 'r4124 (lane bl-scratch): a toast of the fallback press\'s reply (PURE fallbackPressToasts in the same file): the page\'s own translated sentences with counts («{n} conversations are queued to move back …») — no record\'s words'],
  'src/lib/open-with.js|fv': ['file', 'a viewer verdict\'s app label'], 'src/lib/open-with.js|OFFICE_MODULES[fv.module]': ['file', 'an office module label'],
  'src/lib/plugin-client.js|def': ['plugin', 'a plugin window\'s label'], 'src/lib/plugin-client.js|d': ['plugin', 'a plugin\'s own notify text'],
  'src/lib/plugins-ui.js|meta': ['plugin', 'a plugin label'], 'src/lib/plugins-ui.js|p': ['plugin', 'a plugin label'], 'src/lib/plugins-ui.js|st': ['plugin', 'a plugin\'s status reason'],
  'src/lib/session-lifecycle.js|a': ['account', 'an account'], 'src/lib/session-props.js|s0': ['session', 'the session\'s own name'],
  'src/lib/task-detail.js|info': ['path', 'lane task-group-context: the path field\'s commit (src/lib/path-field.js `info.text`) — the path the person typed into a Context row; never a record\'s words'],
  // 主开发 r2068 (the block's hosted run): four receivers other lanes' lines added, each read at its sink — none carries a record's words
  'src/lib/task-detail.js|vd': ['path', 'B-5736 (block line 155): the path field\'s own verdict (src/lib/path-field.js pathField().verdict().text — «… is not a folder», built from the path the person typed into the export box); never a record\'s words'],
  'src/lib/desktop-app-launcher.js|vd': ['path', 'B-5736 (block line 155): the working-folder field\'s own verdict (src/lib/path-field.js pathField().verdict().text — built from the folder the person typed); never a record\'s words'],
  'src/lib/sidebar-mounts.js|m': ['mount', 'B-323e (block line 291): a mount row\'s own name (or id) in the Disconnect refusal\'s Error — the mount\'s label, never a record\'s words'],
  'src/channel-store.js|fam': ['file', 'B-360d (block line 267): a channel store FAMILY — its own file\'s name under data/, in the journal and the store-appeared Error; never a record\'s words'],
  // B-0248 step 3 (lane lg-vault-env, r2212): the backlog by row names a row by its own text when a press meets it gone or changed
  'src/lib/task-log.js|was': ['backlog item', 'a Task Group backlog row as the page held it before a press (found by its own id): its text names the row in the refusal of the page («… was removed meanwhile» / «… was closed or reopened meanwhile»); a line of a group backlog, never one of the kinds a clear reaches'],
  'src/lib/task-log.js|ed': ['backlog item', 'an open backlog edit kept by its row (blEdits): the text of the row as the edit opened, named in the notice of a row gone or hidden meanwhile; a line of a group backlog, never one of the kinds a clear reaches'],
  'src/lib/user-todos-actions.js|card': ['setting', 'a proposed change\'s card (lane setting-doors pick 2, settingCardOf): card.label = the schema row\'s label in the press\'s toast — never an item\'s words'],
  'src/lib/settings-ui.js|schema': ['setting', 'a setting\'s label'], 'src/lib/sidebar-mounts.js|h': ['host', 'a machine name'], 'src/lib/sidebar-mounts.js|v': ['host', 'the Add-machine form\'s values — the name the person just typed, said back in the refusal «a machine named … already exists» (lane ui-language)'], 'src/lib/sidebar-mounts.js|s': ['share', 'a share name'], 'src/lib/sidebar-mounts.js|t': ['mount token', 'a token name'],
  'src/lib/window-share.js|r': ['session', 'an agent\'s name'],
  'src/lib/machine-desktop-handover.js|r.lease.holder': ['session', 'the conversation a machine\'s desktop was handed to (its name in the hand-over toast — lane desktop-handover)'],
  'src/mount-providers/cloud.js|cb': ['mount', 'a storage label'], 'src/mounts.js|head': ['mount', 'a head file\'s name'], 'src/mounts.js|p': ['mount', 'a VFS cache placement\'s reason word and dirs (lane vfs-cache-local)'], 'src/oauth-loopback.js|st': ['integration', 'a consent flow\'s label'],
  'src/office-open.js|fv': ['file', 'a viewer verdict\'s label'], 'src/office-open.js|row': ['file', 'an office row\'s label'], 'src/office-open.js|served': ['file', 'a machine\'s refusal reason'], 'src/office-open.js|want': ['file', 'an office row\'s label'],
  'src/opencode-serve.js|info.error': ['harness', 'the serve\'s error name'], 'src/quota-model.js|byHint': ['quota', 'a limit\'s name'], 'src/quota-model.js|c': ['quota', 'a limit\'s name'],
  'src/remote-fs.js|h': ['host', 'a machine name'], 'src/routes/browser-trace.js|p': ['browser profile', 'a profile label'], 'src/routes/browser-trace.js|rs': ['browser profile', 'a recording\'s file name'],
  // design 005 §2.B (B-fd1f): the refusal names the CALLER's own file (the name it gave, validated) — echoed to that caller
  'src/channel-policy.js|nm': ['caller', 'the caller\'s own attachment name (safeAttachmentName\'s result) in its refusal'], 'src/channel-policy.js|big': ['caller', 'the caller\'s own attachment (its name and size) in the too-large refusal'],
  'src/routes/channels.js|b': ['caller', 'the request body — the owner\'s own proposal / consent words, handed to the engine'],
  'src/routes/design.js|req.query': ['caller', 'the agent\'s own ?name= — the design system it asks for, handed to the engine (lane design-systems-home)'],
  'src/routes/desktop-apps.js|rec': ['desktop app', 'an app label'], 'src/routes/desktop-apps.js|row': ['desktop app', 'a machine\'s reason'], 'src/routes/desktop-apps.js|spec': ['desktop app', 'an app label'],
  'src/routes/files.js|shadow': ['mount', 'a storage name'],
  'src/routes/files.js|pk': ['mount', 'a PARKED storage name in its refusal (B-5ce7 cure: the refusal names it and its doors)'], 'src/mount-door.js|pk': ['mount', 'a PARKED storage name in the door\'s refusal (B-5ce7 cure)'],
  'src/server/browser-handback.js|sess.s': ['session', 'a session\'s name'], 'src/server/browser-propose.js|sess.s': ['session', 'a session\'s name'], 'src/server/browser-keeper.js|n': ['browser notice', 'the keeper\'s own notice (resources, a heal)'], 'src/server/browser-keeper.js|p': ['browser profile', 'a profile label'], 'src/server/browser-keeper.js|r': ['vault entry', 'B-8b87: a proxy login\'s vault entry NAME (proxy-login:<scheme>://<host>:<port>#<user>) in the «Move the password to the vault» journal line — no record\'s text'], 'src/browser-profiles.js|p': ['browser profile', 'a profile label (B-8b87: the proxy launch verdict\'s sentences)'], 'src/server/browser-keeper.js|src': ['browser profile', 'the label of the profile a copy is made from (lane browser-profile-clone)'], 'src/server/browser-keeper.js|out': ['browser profile', 'the new copy\'s label (lane browser-profile-clone)'], 'src/browser-clone.js|h': ['session', 'a lease holder\'s name in the source_leased refusal — the user\'s own conversation, said to the user (lane browser-profile-clone)'], 'src/server/browser-disk-run.js|p': ['browser profile', 'a profile label (lane browser-disk-sample: the disk sample\'s journal lines)'], 'src/server/browser-disk-run.js|n': ['browser notice', 'the disk sample\'s own For-you notice (src/browser-disk.js diskNotice)'],
  'src/server/channel-api.js|e': ['channel', 'a vendor fetch error\'s name'], 'src/interface/main.js|e': ['error', 'the interface process\'s LAST RESORT: an uncaught Error\'s own name and message, said once before exit 1 — the process holds no record (its graph has no store), and a start line is never in the words'], 'src/server/channel-api.js|p': ['outbox proposal', 'an API proposal\'s reject / failure reason'], 'src/mounts.js|c': ['mount', 'a storage mount\'s name'],
  'src/server/channels-engine.js|e': ['channel', 'a SecretBoxError\'s `reason` — a refusal CODE (key-unreadable:vault_locked), compared, never worded (lane vault-e2e-password-fix-r2)'],
  'src/server/channels-engine.js|ctx': ['session', 'an agent session\'s name'], 'src/server/channels-engine.js|err': ['channel', 'a vendor error\'s detail'], 'src/server/channels-engine.js|fresh': ['outbox proposal', 'a decision reason'],
  'src/server/channels-engine.js|h': ['host', 'a machine name'], 'src/server/channels-engine.js|mod': ['channel', 'an adapter label'],
  'src/server/channels-engine.js|p.choice.fromMount': ['mount', 'a storage mount\'s name'], 'src/server/channels-engine.js|p': ['outbox proposal', 'a proposal\'s reason'], 'src/server/channels-engine.js|rec': ['channel', 'an account / adapter label'],
  'src/server/channels-engine.js|row': ['integration', 'an integration row label'], 'src/server/channels-engine.js|r': ['outbox proposal', 'a decision reason'], 'src/server/channels-engine.js|src': ['mount', 'a storage label'],
  'src/server/ledger-shape-notice.js|w': ['words', 'the growth alarm\'s For-you notice — its own words (PURE noticeOf: a machine name, the shard\'s file name, its size / ratio, fixed sentences) — the source of a new For-you record, never a copy of one (lane ledger-dedup-law F4)'],
  'src/server/setting-holds.js|r': ['words', 'r3095 (lane bl-loop-b, 主开发 r3235): the setting holds\' notice lines (ceilingLines) — each spending ceiling\'s schema label, its value now and its default (numbers the hub reads from its own settings), its link, in the hub\'s fixed sentences; the source of a NEW For-you notice (the «could not be read» and the «did not parse» ones, lines 225 and 251), never a copy of a record\'s words'],
  'src/watch-door.js|it': ['words', 'the watch-limit For-you item\'s own words (PURE noticeItem in the same file: the limit\'s name and the command that raises it — no person\'s data, no path)'],
  'src/server/memory-pressure-watch.js|it': ['words', 'the memory-pressure For-you item\'s own words (PURE src/memory-pressure.js pressureItem: percent, GB, who started each process group, /tmp usage) — the source of a new For-you record, never a copy of one (lane browser-resource-care)'],
  'src/server/feedback-forward.js|w': ['words', 'the paused feedback forward\'s own words (PURE src/feedback-forward-model.js pauseWords: the target\'s URL as configured, the status its door answered, how many reports wait) — the source of a new For-you record, never a copy of one (lane feedback-forward-404)'],
  'src/server/csp-reports.js|w': ['words', 'the CSP notice\'s own words (PURE src/app-csp.js noticeWords: a directive, what it would block — a keyword or an origin + 3 path segments, never a value — and where it was seen) — the source of a new For-you record, never a copy of one (lane app-page-csp)'],
  'src/server/tls.js|p': ['words', 'the https plan\'s own words (PURE src/tls-plan.js: the owner\'s step — the tailnet\'s HTTPS certificates, the operator right) — the source of a new For-you record, never a copy of one (lane https-tailscale)'],
  // lane cli-self-measure: the hub's own check of a new Claude Code — its journal lines (the measurement's events, a variant's
  // verdict line, the ledger record's reason code) and the pool card's one calm line (PURE account-pool-auto poolCheckingNotice)
  'src/claude-oat-probe.js|ev': ['error', 'a measurement event — the error the CLI, a pipe or the mock raised, scrubbed of token shapes (journal, the forked child)'],
  'src/claude-oat-probe.js|r': ['words', 'a variant\'s verdict line — the measurement\'s own words (journal, the forked child)'],
  'src/server/cli-self-measure.js|full': ['words', 'the ledger record the hub just kept — its state + reason CODE (cli-caps words them), never an item\'s text'],
  'src/server/usage-pool-engine.js|ck': ['words', 'the pool card\'s calm line while a check runs (PURE account-pool-auto poolCheckingNotice) — the source of the notice, never a copy of a record'],
  // 主开发 r3640 (the candidate's hosted run 45405143191): the WHOLE list at the train's tip (a scratch copy printed it in full): three
  // receivers its lines added; one row gone dead (channel-account-dialogs.js k — its label now reaches the dialog through a local)
  'src/server/conversation-deliver.js|read': ['carrier', 'the retry park file\'s raw bytes at the boot\'s own read (data/msg-retry.json: parked deliveries\' words) — its set-aside journal line names how many bytes were kept, never their words'],
  'src/server/subagent-transcript.js|w': ['words', 'a PURE sentence (folderWords: the projects folder, or one project folder by its base name, did not answer — within N s) — a folder\'s name and a time, never a record\'s words'],
  'src/server/usage-pool-engine.js|w': ['words', 'the reset-credit hold\'s own For-you notice (heldNoticeWords: the engine\'s fixed sentence, its detail and its i18n keys) — the engine\'s words, never a record\'s'],
  // 主开发 r3575 / r3588 (the train 2.369.418's content): two receivers its lines added; two rows gone dead (manage-agents.js x — the fold's
  // could-not-compare names now gathered into a local before the toast, B-360d; browser-switcher.js st.view?.profile — the switch's words now a
  // local `said` before the toast, B-7aef's follow line 607): their words still reach those toasts through the locals, account names and a label
  'src/accounts.js|into': ['account', 'the same-account merge\'s TARGET row (B-360d accounts list): its own name in the merge\'s [accounts] journal lines — the credential file kept or not written over, the folded sign-in kept beside it; an account, never a cleared record'],
  'src/store-writer.js|f': ['path', 'the store writer\'s write in flight (l.inflight: its `name` is the store\'s own data file, s.file) — its base name in the [store-write] journal line of a dropped temp (B-574d); a data file, never a record\'s words'],
  'src/server/handed-sweep.js|a': ['path', 'r4124 (lane bl-scratch): a file of the handed records\' own folder (<buffers>/handed, written by data/bin/chat-wrapper.js; FILE_RE): its `name` is a conversation id or a hub id with .json / -torn / .<pid>.tmp, in the age sweep\'s journal line of a removal that failed — an id, never a person\'s words'],
  // 主开发 r3411 (the hotfix's mirror): two receivers its lines added
  'src/lib/held-lists.js|w': ['words', 'B-f276 unit B (line 700): «Read again now»\'s answer in the page\'s words — a PURE outcome\'s sentence (src/lib/held-lists-words.js heldPressWords: the press\'s refusal code, a count of lists still held, its tone); never a record\'s words, never the hub\'s English'],
  'src/server/delivery-wake.js|q': ['words', 'lines 664 + 699 (the usage reading file, commit 2): the pool engine\'s quota verdict for the delivery\'s payer (quotaVerdictFor) — its `reason` is the engine\'s OWN sentence (src/server/usage-pool-engine.js: «its usage reading could not be read — unknown until it reads again», or «… started again after damaged bytes — not stated again yet: <the limit lanes>»): a reading\'s state and lane names, never a record\'s words'],
  'src/server/cli-unmeasured-notice.js|it': ['words', 'the unmeasured-CLI For-you item\'s own words (PURE src/cli-caps.js cliUnmeasuredItem: the CLI version, the member names, the two ways out) — the source of a new For-you record, never a copy of one (lane pool-silent-members)'],
  'src/server/mount-health-watch.js|it': ['words', 'the wedged-mount For-you item\'s own words (PURE src/mount-health.js canaryItem: the mountpoint, the strikes, who presses it, what the server paused) — the source of a new For-you record, never a copy of one (lane fuse-canary-notice)'],
  'src/server/hooks-late.js|item': ['words', 'the late-hooks For-you line\'s own words (PURE src/hooks-late.js forYouItem: VibeSpace\'s sentence + the names of the running sessions it lists) — the source of a new For-you record, never a copy of one (lane hooks-create)'], 'src/server/hooks-late.js|h': ['words', 'a harness descriptor\'s constant label (Claude Code / Codex) in the journal line — never a record (lane hooks-create)'],
  'src/server/fd-gauge.js|w': ['words', 'the fd gauge\'s own sentence (handle counts by kind, the busiest folders) — never a record (lane-dead-bridge)'], 'src/server/fd-gauge.js|b': ['words', 'the EMFILE blame sentence (who ran out: this server / a mount\'s FUSE daemon / the machine) — never a record (lane-dead-bridge)'],
  'src/server/channels-engine.js|v': ['outbox proposal', 'a verdict reason'], 'src/server/channels-engine.js|w.principal': ['session', 'a watcher\'s name'],
  'src/server/groups-engine.js|g': ['agent group', 'a group\'s name'], 'src/server/groups-engine.js|group': ['agent group', 'a group\'s name'], 'src/server/groups-engine.js|rg.group': ['agent group', 'a group\'s name'],
  'src/server/helper-asks.js|session': ['session', 'a session\'s name'], 'src/server/integration-store.js|row': ['integration', 'an integration row label'], 'src/server/login-expiry-watch.js|a': ['account', 'an account'],
  'src/server/mounts-plugins-wiring.js|session': ['session', 'a session\'s name'], 'src/server/path-mounts.js|p': ['mount', 'a path mount\'s name'], 'src/server/plugin-install.js|a': ['plugin', 'a release asset'], 'src/server/plugin-install.js|asset': ['plugin', 'a release asset'],
  'src/server/spend-guard.js|identity': ['account', 'a billing identity'], 'src/server/spend-guard.js|b': ['session', 'a conversation\'s name — one that waiting frames wait behind (B-0a33: the refusal notice names it)'], 'src/server/stash-handover.js|r': ['delivery', 'the ladder\'s refusal reason'],
  'src/server/usage-pool-engine.js|p': ['account', 'a pool account — account-reset-door K1\'s sayBasisFlip prints its name in a [pool] journal line, as the spawn lines print |a\'s (the .397 train\'s seam)'],
  'src/server/usage-pool-engine.js|a': ['account', 'an account / pool'], 'src/server/usage-pool-engine.js|cap': ['quota', 'a cap\'s name'], 'src/server/usage-pool-engine.js|desc': ['quota', 'a reset credit\'s description'],
  'src/server/usage-pool-engine.js|d': ['quota', 'a pool decision\'s reason'], 'src/server/usage-pool-engine.js|hit': ['account', 'a pool member'], 'src/server/usage-pool-engine.js|restartPending': ['account', 'an account'],
  'src/server/usage-pool-engine.js|row': ['account', 'a slot transition\'s from'], 'src/server/usage-pool-engine.js|session': ['session', 'a session\'s name'], 'src/server/usage-pool-engine.js|sh': ['account', 'a lag shadow\'s from'],
  'src/server/usage-pool-engine.js|v': ['quota', 'a reset-credit verdict\'s reason'], 'src/server/usage-pool-engine.js|wr': ['quota', 'a wall reading\'s detail'],
  // lane reset-path: the helper writer's refusal (the spend ceiling's sentence / why the helper cannot run) and the
  // usage menu's codex ⟳ toast (codexRefreshToast — the server's numbers and refusal words, never a record's text)
  'src/server/usage-pool-engine.js|hw': ['quota', 'the reset-credit helper writer\'s refusal detail'], 'src/lib/usage-meter.js|toast': ['quota', 'the codex refresh answer\'s one sentence'], 'src/lib/usage-meter.js|w': ['quota', 'a wall\'s words (lane account-reset-door: account-wall-words over the pool\'s cause CODE — no record\'s words)'], 'src/lib/usage-meter.js|said': ['quota', 'a claim\'s answer in our own words (lane account-reset-door K2 round 2: claimAnsweredWords over the route\'s code and a wall\'s cause CODE — no record\'s words)'], 'src/lib/manage-agents.js|g': ['quota', 'one sentence per cause (lane account-reset-door: account-wall-words groupWalls over the pool\'s cause codes)'],
  'src/server/window-request.js|r': ['window', 'a share request\'s refusal reason'], 'src/server/window-request.js|s': ['session', 'a session\'s name'],
  'src/server/window-targets-engine.js|bRow': ['desktop app', 'an app label'], 'src/server/window-targets-engine.js|drec': ['desktop app', 'an app label'], 'src/server/window-targets-engine.js|e': ['window', 'a window\'s name'],
  'src/server/window-targets-engine.js|holder': ['session', 'a lease holder\'s name'], 'src/server/window-targets-engine.js|l': ['session', 'a lease\'s session name'], 'src/server/window-targets-engine.js|rec': ['desktop app', 'an app label'],
  'src/usage-routes.js|hMeta2': ['host', 'a machine name'], 'src/usage-routes.js|hMeta': ['host', 'a machine name'], 'src/weekly-lanes-unfold.js|lane': ['quota', 'a lane\'s name'],
  'src/spawn/ssh.js|h': ['host', 'a machine name'], 'src/spawn/dial.js|h': ['host', 'a machine name'], 'src/ws-handler.js|data': ['caller', 'the owner\'s own queued text (a refusal echoes its LENGTH to the owner who typed it)'],
  'src/ws-handler.js|h': ['host', 'a machine name'], 'src/ws-handler.js|wcaps': ['harness', 'a wrapper capability\'s reason'],
  'src/ws-handler.js|w': ['words', 'the withheld-signal sentence (B-5ee1, proc-identity withheldWords): the killed session\'s name or its machine, a pid number and a start minute — never a record\'s words'],
  'src/ws-handler.js|tn': ['words', 'the stop\'s notice to the person (B-c134 cure, PURE proc-identity treeNotice): the ended conversation\'s own name and the kernel\'s process names (comm), counted — never a record\'s words'],
  // ── verify r8 ③: the journal's receivers (every server console / log line rides the incident ring) ──
  'data/bin/codex-chat-wrapper.js|r': ['harness', 'an app-server answer\'s reason / detail (an RPC refusal)'], 'data/bin/codex-chat-wrapper.js|st': ['harness', 'a steer answer\'s reason / detail (an RPC refusal)'],
  'src/accounts.js|to': ['account', 'a pool member (the deleted default\'s re-point target — lane pool-pin)'], 'src/accounts.js|pool': ['account', 'a pool'],
  // lane pool-provider-latents (q-055 M2): a pool default a deletion left UNPLACED — its deleted member's name and provider label (the store's own refusal of a spawn that would read it)
  'src/lib/provider-roster.js|p': ['account', 'a third-party model provider\'s own label (the owner named it) in the roster\'s rename / new-key / remove dialogs — lane lg-providers U5'],
  'src/server/provider-spawn.js|p': ['account', 'a third-party model provider\'s own label (the owner named it in the wizard) in the spawn road\'s refusal sentences — lane lg-providers U2'],
  'src/accounts.js|ud': ['account', 'a pool default\'s UNPLACED mark (the deleted member\'s name)'], 'src/accounts.js|ud.provider': ['account', 'the UNPLACED mark\'s provider (its label)'],
  // lane vault-e2e-password: a key file the vault seals — its NAME is a STORE_KEYS constant (.accounts-key …), never a record's words
  'src/server/vault-engine.js|it': ['migration', 'a key file the vault seals (its constant name)'], 'src/server/vault-engine.js|k': ['migration', 'a STORE_KEYS row (a key file\'s constant name)'],
  'src/vault-run.js|x': ['run reference', 'lane vault-run-model: a reference scanRefs found in a run\'s command — `x.name` is the `--file NAME` the agent typed (an env variable\'s name), never a record\'s words'],
  'src/migration-runner.js|m': ['migration', 'a migration\'s own note'], 'src/normalizers.js|session': ['session', 'a session\'s name'],
  'src/normalizers.js|e': ['chat card', 'a rebuild queue entry — its `card` is a chat card the transcript already holds (peer / browser / group / proposal), never a For-you item\'s card (design 009 named that field `card` too)'],
  // lane stream-mic-road: a machine's AUDIO DEVICE names (the microphone road) — a device's own label, never a record's words
  'src/desktop-mic.js|st.mic': ['audio device', 'the virtual microphone\'s name the machine reports («CABLE Output», «VibeSpace Microphone»)'],
  'src/desktop-mic.js|target': ['audio device', 'the microphone endpoint the default pair sets (the machine\'s own device name)'],
  'src/desktop-mic.js|t.mic': ['audio device', 'the virtual microphone the voice is written to (the machine\'s device name)'],
  'src/desktop-mic.js|t.device': ['audio device', 'the render endpoint / speaker the voice is written to (the machine\'s device name)'],
  'src/lib/stream-mic-strip.js|r.device': ['audio device', 'the default microphone the machine now uses (its device name, in the 「设为默认麦克风」 toast)'],
  'src/mic-install.js|st.mic': ['audio device', 'the virtual microphone already installed (its device name, in the plan\'s refusal)'],
  'src/server/desktop-access.js|r.device': ['audio device', 'the default microphone the machine now uses (its device name, in the hub journal)'],
  'src/port-forward.js|h': ['host', 'a machine name'], 'src/server/auto-cli-loop.js|it.pj': ['quota', 'a projection\'s label'],
  // lane hub-sync-holds rank 16 (round 2): the mail walk's directory entry — its file name builds the folder path the walk's «could not be read» error names (the person's own mail folder, said on their own mount's row), never a record's words
  'src/gmail-sync.js|ent': ['mail folder', 'a directory entry of the person\'s own Gmail mount folder (its file name, in the walk\'s «the mail folder could not be read» error)'],
  'src/server/auto-resume.js|chk': ['quota', 'a pre-fire check\'s reason'], 'src/server/auto-resume.js|x.identity': ['account', 'the account an attended bulk press is refused on (form two) — its name in the journal'], 'src/server/spend-guard.js|r.identity': ['account', 'a refused account of an attended batch (form two)'], 'src/server/spend-guard.js|r': ['quota', 'a refused slot of an attended batch — its rule and the authorizer\'s detail'], 'src/server/auto-resume.js|h': ['quota', 'the model cap a stop fact names (modelCapHold — the vendor\'s cap name, never a person\'s text)'], 'src/server/auto-resume.js|ident': ['account', 'a billing identity'],
  // lane auto-resume-bulk (.349): the bulk resume's journal — the identity a continue landed on (re-resolved after the gate) and the batch's spend refusal
  'src/server/auto-resume.js|ident2': ['account', 'a billing identity (the bulk resume\'s continue, re-resolved after its gate)'], 'src/server/auto-resume.js|bill': ['account', 'the slot that BILLS a bulk resume\'s continue — its spend re-asked before each deliver (lg-recovery U2 cure)'], 'src/server/auto-resume.js|rec.refused': ['quota', 'the bulk resume\'s spend refusal (its bucket + the verdict\'s detail)'],
  'src/server/boot-restore.js|h': ['host', 'a machine name'], 'src/server/boot-restore.js|session': ['session', 'a session\'s name'],
  'src/server/boot-restore.js|tally': ['count', 'the re-probe tally — its `open` is the list of sock files still unanswered, never a For-you item\'s door (lane foryou-plugin-notices gave the item an `open` field, a SHAPES drop row)'],
  'src/server/browser-env.js|f': ['browser profile', 'a pin repoint\'s previous profile'], 'src/server/browser-keeper.js|rec': ['browser profile', 'a browser record\'s label'], 'src/server/browser-builds-keeper.js|p': ['browser profile', 'a profile label (rv-browser F7: Change build… moved out of the keeper)'], 'src/server/browser-builds-keeper.js|bc': ['browser profile', 'verify r2 (B5): a Chrome build change\'s from / to — build words ("Chrome 151.0.7922.34"), never a record\'s text'],
  'src/server/browser-keeper.js|engine': ['plugin', 'lane engine-spi-egress: an engine plugin\'s label (its manifest\'s) — the wrapped engine\'s proxy journal line'],
  'src/browser-builds.js|engine': ['plugin', 'lane engine-spi-egress L1b r2: an engine plugin\'s label (its manifest\'s) — the version ladder\'s sentence for an owner\'s program not measured yet'],
  'src/server/browser-keeper.js|v': ['browser profile', 'a resource verdict\'s reason'], 'src/server/browser-stream.js|next.switched': ['browser profile', 'the browser a view switched from'],
  'src/server/browser-trace.js|p': ['browser profile', 'a profile label'], 'src/server/channels-engine.js|choice.fromMount': ['mount', 'a storage mount\'s name'],
  'src/server/channels-engine.js|p1': ['outbox proposal', 'a proposal\'s decision reason'], 'src/server/channels-engine.js|s': ['channel', 'a channel state\'s reason'],
  'src/server/channels-engine.js|target': ['session', 'a wake target\'s name'], 'src/server/cli-cmd.js|e': ['harness', 'a CLI binary entry\'s name'],
  'src/server/conversation-deliver.js|e': ['delivery', 'a ladder stash entry at the eviction line: its sender name is printed only for kind `peer` (a session\'s own name); VibeSpace\'s own labels (a job\'s `Background Work · <name>`) print as their kind (verify r8 ③)'],
  'src/server/conversation-deliver.js|r': ['delivery', 'a rung\'s refusal reason'],
  // lane notify-retry (2026-10-01): the retry park's journal lines — the primitive's reason (timeout / a socket error code) and
  // the ceiling's own sentence at a re-judge (an account name + numbers); a parked entry's WORDS are in its `text`, which no
  // journal line prints (the fall line names the entry by id and kind)
  'src/server/conversation-deliver.js|v': ['delivery', 'the spend verdict at a parked delivery\'s re-judge, through the one door (agentSpendWords, line 1053\'s door; r5229 restated): a held verdict\'s code only, else the ceiling\'s own detail (an account + numbers), never a record\'s words'],
  // notify-retry verify r1: a batch of parked entries posted as ONE frame — the entries' own stored text (a clear rewrote
  // the park's copies through redactStash, so a cleared one rides as the sentence under the head); `recorded` on the card
  'src/server/conversation-deliver.js|frame': ['delivery', 'the retry park\'s ONE frame of several parked entries: their STORED text joined (redactStash rewrites the park too — a cleared entry is the sentence) — the post and the card\'s `recorded`'],
  'src/server/conversation-deliver.js|attempt': ['delivery', 'a parked delivery\'s attempt record: the primitive\'s reason (timeout / a socket error code) + phase, never a record\'s words'],
  'src/jobs.js|r': ['delivery', 'the ladder\'s answer to a notification (a rung\'s refusal reason; the parked reason + phase)'], 'src/server/desktop-access.js|plan': ['desktop app', 'an install plan\'s label'],
  'src/server/desktop-app-keeper.js|rec': ['desktop app', 'an app label'], 'src/server/incident-wiring.js|req.body': ['caller', 'the owner\'s own incident note'],
  'src/server/conversation-ops.js|g': ['quota', 'a spend verdict\'s words in an automation\'s refusal, through the one door (agentSpendWords, line 1053\'s door; r5229 restated): a held verdict\'s code only, else the authorizer\'s own sentence on the key\'s identity (lane automation-verbs)'], 'src/server/conversation-ops.js|v.spec': ['session', 'the opened conversation\'s name (an automation\'s judged spec) in the open\'s journal line'],
  'src/server/session-stdout.js|session': ['session', 'a session\'s name'], 'src/server/spend-guard.js|v': ['quota', 'a spend verdict\'s detail'], 'src/delivery-wake.js|probe': ['quota', 'the spend guard\'s probe verdict — its own refusal sentence, said to the sender and on the row (the manager design\'s piece 7)'],
  'src/server/stdout/acp-events.js|msg': ['harness', 'an ACP frame\'s reason'], 'src/server/stdout/codex-events.js|msg.payload': ['harness', 'a codex event\'s reason'],
  'src/server/usage-pool-engine.js|b': ['quota', 'a bucket\'s label'], 'src/server/usage-pool-engine.js|dest': ['account', 'a pool member'], 'src/server/usage-pool-engine.js|lane': ['quota', 'a lane\'s name'],
  'src/server/usage-pool-engine.js|member': ['account', 'a pool member'], 'src/server/usage-pool-engine.js|probe': ['quota', 'a probe\'s reason'], 'src/server/usage-pool-engine.js|verdict': ['account', 'a pool verdict\'s member'],
  'src/path-candidates.js|g': ['task group', 'lane path-field: a Task Group the person made — its NAME on a 任务组 / 由名字 chip of the path field (the person\'s own label, never a record\'s words)'],
  'src/server/user-input.js|caps': ['harness', 'a wrapper capability\'s reason'], 'src/task-groups.js|shadow': ['mount', 'the storage shadowing a context folder'],
  'src/server/session-brain.js|b': ['harness', 'a fallback banner\'s model (from → to)'], 'src/server/stdout/claude-stream-json.js|b': ['harness', 'a fallback banner\'s model (from → to)'],
  'src/server/session-stdout.js|death': ['harness', 'a CLI death\'s reason code'], 'src/ws-create.js|refusal': ['harness', 'a worktree refusal\'s reason code'],
  'src/ws-create.js|said': ['words', 'a PURE verdict\'s sentence (src/billing-pick.js helperNotice — unit «billing pick alive»: the conversation\'s name, the picked account\'s name, the machine — the helper-set-aside notice)'],   'src/ws-create.js|pin': ['browser profile', 'a pinned profile\'s label'], 'src/ws-create.js|session': ['session', 'a session\'s name'], 'src/ws-handler.js|session': ['session', 'a session\'s name'],
  // ── the .197 integration: the other lanes' receivers, each named by what it is ──
  'src/agentd/agentd.js|f': ['dial', 'the daemon\'s own dial attempt facts (a code + the network\'s detail) — lane-pairing, never a record'],
  // B-4d71 (lane bl-machines-b): the device agent's own retire, read into its journal (src/agentd/agentd.js retireOwnStart)
  'src/agentd/agentd.js|x': ['retire step', 'a step of the device agent\'s own retire in its journal line — `what` is the step\'s fixed word (src/agentd/self-retire.js retireSteps: «the dial config», «the systemd unit file»… — a string literal at every step, never a path, a unit name or a machine\'s name: those ride `file` / `args`); the same line\'s `why` (no census field) is an error code, a fixed phrase, the supervisor command\'s name, or an Error\'s own message when it has no code; never a record\'s words'],
  'src/server/dial-pairing.js|facts': ['dial', 'where a dial came from (an address) — lane-pairing'],
  'src/server/exit-routes.js|row': ['session', 'an exit-access row\'s conversation name — lane-pairing'],
  'src/server/mounts-plugins-wiring.js|h': ['host', 'a machine name (the dial pairing\'s offline sentence)'],
  'src/lib/browser-live-window.js|r': ['browser profile', 'the browse answer\'s profile label (BROWSE YOURSELF)'],
  'src/lib/browser-live-window.js|x': ['browser profile', 'a Running row\'s profile label (BROWSE YOURSELF\'s Stop refusal)'],
  'src/routes/browser.js|p0': ['browser profile', 'a profile\'s label (the human Restart refused while the person browses it — the .197 integration)'],
  'src/routes/browser.js|row': ['browser profile', 'a browser row\'s label (the Stop / Restart refused while the person browses it)'],
  // B-5f2e line 2 (lane bl-browser-b): the vault fill's refusal names the tab's frames of another site — the hub's own sentence
  'src/routes/browser.js|framed': ['frame origins', 'B-5f2e: the hub\'s OWN sentence about the tab\'s out-of-process frames (browser-stuck otherSiteFrameText: fixed words + each frame\'s web ORIGIN, scheme://host[:port] of the watch\'s kept iframe target url — no path, no title, no page text, no typed word) — answered to the asking agent\'s fill refusal only (its CLI\'s stderr), never a log, a journal, a toast or a kept card'],
  'src/lib/channel-thread-pane.js|r.proposal': ['channel proposal', 'the outbox engine\'s failure reason for a send (the channel\'s own error words) — no record of the five kinds'],
  'src/lib/manage-agents.js|said': ['pool verdict', 'the gather route\'s answer worded by PURE gatherWords (members and counts) — lane pool-pin'],
  'src/lib/session-lifecycle.js|r': ['account', 'a pool member row (the conversation\'s pin menu) — lane pool-pin'],
  'src/lib/session-lifecycle.js|sw': ['host', 'Locate in sidebar\'s switch record (lane think-tools-phone): the machine a Recent / History zone showed before Locate switched it to Local — `sw.name` is that machine\'s name (sidebar-workbench.js _locateSaid: the hosts list\'s name, else its id), never a record\'s words'],
  'src/server/usage-pool-engine.js|wake': ['pool verdict', 'a member wake\'s own reason (the engine\'s verdict words)'],
  'src/server/usage-pool-engine.js|lv': ['pool verdict', 'the pre-fire gate\'s last check — the link member\'s verdict reason (the engine\'s own words: buckets, a member\'s name) — lane pool-silent-members acceptance r3'],
  'src/server/usage-pool-engine.js|owed': ['account', 'the line a cross-provider switch owes the resumed conversation (q-053 P0b): the members\' and providers\' names and two model ids — the engine\'s own words'],
  'src/server/usage-pool-engine.js|out': ['pool verdict', 'a pin\'s placement reason (the engine\'s verdict words)'],
  'src/server/usage-pool-engine.js|ds': ['pool verdict', 'a per-session switch decision (member ids and numbers)'],
  'src/server/usage-pool-engine.js|s': ['session', 'the conversation a removed member held (its own name on the For-you item) — lane pool-pin'],
  // the 2.369.202 integration: lane reset-path's skip notices, judged by the receiver census .200 widened (r8/r9)
  'src/server/usage-pool-engine.js|nt': ['quota', 'the reset-credit skip notice (resetCreditSkipNotice: the engine\'s own sentence + its i18n, no record\'s text) — lane reset-path'],
  'src/server/usage-pool-engine.js|n': ['quota', 'the helper path\'s reset-credit skip notice (resetCreditSkipNotice, the same words) — lane reset-path'],
  'src/server/unexpected-exit.js|entry': ['session', 'the restarted conversation\'s own name on its For-you item (lane unexpected-exit — composed at the 2.369.202 integration)'],
  // lane desktop-apps-safety (composed at the 2.369.202 integration): the relaunch refusal names the driving conversation; the stop / close toasts name the app
  'src/desktop-fit.js|lease': ['session', 'the conversation driving the window, by its session name, in the relaunch refusal'],
  'src/lib/desktop-app-launcher.js|a': ['desktop app', 'an app label (the stop that asks LibreOffice first)'],
  'src/lib/desktop-app-window.js|rec': ['desktop app', 'the closed file\'s app label in the window\'s toast'],
  'src/server/groups-engine.js|c': ['group-message', 'a group REPORT card (lane group-report-card): each message a member\'s report carried, drawn at the injection — the ring copy is re-worded by the groups door\'s onCleared'],
  // ── lane custom-app (apps Layer 0) ──
  'src/app-serve.js|r.refused': ['app install', 'the root script\'s refusal (a code + the machine\'s own detail line) — never a record of the five kinds'],
  'src/server/apps-engine.js|p.by': ['session', 'a proposal\'s proposer — the session\'s name on the journal line'],
  'src/server/apps-engine.js|by': ['session', 'the proposer\'s session name on the For-you item it files'],
  'src/design-model.js|ref': ['design file', 'an image name an artboard references (a file of the design folder) in a verdict sentence — lane design-core, no record of the five kinds'],
  'src/routes/feedback.js|b': ['feedback', 'the agent\'s OWN report (text / about / kind) handed to the feedback store, validated there — lane agent-feedback, no record of the five kinds'],
  'src/routes/feedback.js|c': ['caller', 'the caller\'s facts the token resolved (session id + name, Task Group, harness, instance) handed to the feedback store — lane agent-feedback'],
  'src/routes/design.js|b': ['design comment', 'the USER\'s own comment text handed to the engine (it becomes the user\'s message) — lane design-core, no record of the five kinds'],
  // ── lane device-upgrade-stuck ──
  'src/server/device-upgrade-watch.js|w': ['host', 'the stuck-upgrade item\'s words — a machine name and two agent versions (itemOf), the machine\'s own record'],
  // ── lane host-stale-dialer (B-6136) ──
  'src/server/device-alerts.js|w': ['host', 'the three urgent device items\' words (itemOf, lane device-act-audit) — a machine name, an address, a sign-in handle, two agent versions: the machine\'s own record and the hub\'s own facts, never a record\'s text'],
  // ── lane hub-act-ask (design q-042 D4) ──
  'src/server/hub-act-ask.js|w': ['host', 'the held hub act\'s card words (P.cardOf) — who asked (a conversation\'s name or a `by`), a machine name, the act\'s summary the hub built itself (device-acts summaryOf, bounded and redacted): the hub\'s own act, never a record\'s text'],
  'src/server/hub-act-ask.js|v': ['host', 'the verdict\'s reason / kind (PURE hub-act-policy askVerdict: a closed word) in the refusal sentence — the machine\'s own list'],
  // ── design q-046 (lane automation-keys-core) ──
  'src/lib/vault-automation.js|key': ['host', 'an automation key\'s NAME (the owner\'s own words, typed in 铸造…) in a dialog\'s title — the key\'s own record, never a record\'s text'],
  'src/server/automation-engine.js|plan.record': ['host', 'a key\'s NAME in the mint refusal sentence (a second live key of that name) — the owner\'s own words'],
  'src/server/automation-engine.js|key': ['host', 'an automation key\'s NAME on its first-use card and its log line — the owner\'s own words, never a record\'s text'],
  'src/server/automation-engine.js|pick.works': ['host', 'B-3190 follow-up: the KEY granted to the caller now (its id and NAME) in the pick\'s «Task Groups unreadable» sentence — an automation key\'s name, the owner\'s own words, never a record\'s text'],
  // ── lane vault-window-v2 (design q-047 §3.4) ──
  'src/server/vault-hooks.js|words': ['host', 'the Vault window\'s two For-you cards\' words (PURE vault-inventory useFailCard / rotateCard): an entry\'s NAME (an automation key\'s, an agent-stored value\'s — the owner\'s or the store\'s own words), the asking conversation\'s name, counts — the source of a new For-you record, never a copy of one'],
  'src/server/automation-engine.js|caller': ['host', 'the asking CONVERSATION\'s name on the first-use card and its log line — the session list\'s own name (the hub\'s record), never a record\'s text'],
  'src/server/end-proposals.js|caller': ['host', 'the PROPOSING conversation\'s name on its proposal card — the automation engine\'s caller (the session list\'s own name), never a record\'s text'],
  'src/server/end-proposals.js|d': ['session', 'lane login-request-card\'s cure: a conversation row the card drew (the list builder\'s own name of a conversation) — named in the «declined» refusal toward the proposer, through the belt'],
  // ── lane vault-run-door (design q-043 §8 P0-f) ──
  'src/server/vault-run-door.js|caller': ['host', 'the asking CONVERSATION\'s name on the run card and its journal line — the session list\'s own name (the hub\'s record), never a record\'s text'],
  // lane vault-paste-request: a paste request's card (its words are the agent's own — bounded, hidden characters refused, secret
  // shapes «redacted» — plus the registry's names), the place it names, the integration store's refusal rule, a free entry's label
  'src/server/vault-paste-door.js|card': ['secret request', 'a paste request\'s CARD (PURE vault-paste cardOf): the agent\'s own words and purpose (bounded, hidden characters refused, secret shapes redacted) and the registry\'s row / field names — the request\'s own text, never a record\'s'],
  // lane totp-request-card: a two-step ask's proposed NAME rides the action as `totpName` — an entry's name (THE two-step name rule:
  // 1–120 letters, digits, «.», «_», «-»), the place the request names, never a record's text
  'src/server/vault-paste-door.js|v.target': ['vault entry', 'a two-step ask\'s proposed NAME (`totpName`, judged by THE two-step name rule — src/totp.js entryOf: 1–120 letters, digits, «.», «_», «-»): the entry the request names, never a record\'s text'],
  'src/server/vault-paste-door.js|e': ['integration rule', 'the integration store\'s refusal detail on a pasted value — the field\'s own validate complaint (a fixed rule\'s words, never the value, never a record\'s text)'],
  'src/server/vault-job-door.js|card': ['vault job card', 'a Background job\'s approval CARD (PURE src/vault-job.js askCardOf — lane vault-job-approval): the job\'s BELTED label (the engine\'s labelOf), its kind, the entry\'s Vault name and reference, the program\'s / script\'s paths, the folder and the command (secret shapes masked, hidden characters shown) — the card carries the job\'s jobId, so a job\'s Clear content clears it through the For-you door (src/server/record-clear.js cascade)'],
  'src/foryou-actions.js|wa': ['vault run', 'lane wake-approve-card r11: a run card\'s `facts.whyAgain` (the vault door\'s whyAgainOf — {code, name}): `name` is the NAME of the plain environment variable that changed between two runs (a variable name the command carries, never a value and never a record\'s text) worded in the card\'s «Asked again» line'],
  'src/lib/vault-file-row.js|r': ['vault entry', 'lane lg-vault-file: a FILE entry\'s NAME the owner typed (or its file\'s name) a moment ago in 添加 › 文件…, echoed by the add door in its toast — the entry\'s own name, never a record\'s text'],
  'src/lib/vault-paste-box.js|r': ['vault entry', 'a free entry\'s LABEL the owner typed a moment ago in 「其他密钥或密码…」, echoed by the add door in its toast — the entry\'s own name, never a record\'s text'],
  'src/lib/vault-totp-row.js|p': ['vault entry', 'lane vault-totp-add: a two-step entry\'s NAME from the add dialog\'s own plan (PURE addPlanOf — what the owner typed, or took from the link a moment ago) in its 已添加 toast — the entry\'s own name, never a record\'s text'],
  'src/server/vault-run-door.js|q': ['run reference', 'an agent\'s REQUEST (lane vault-manual-and-lock): its detail = the entry\'s label + reference and the purpose in the agent\'s own words (secret-shapes\'d) — the request\'s own text, never a record\'s'],
  'src/server/vault-run-door.js|rec': ['host', 'a running conversation\'s name in the lock\'s journal line (the session list\'s own name, kept on the run) — never a record\'s text'],
  'src/server/vault-run-door.js|shape': ['run reference', 'the TOOL\'s name (the basename argv[0] resolved to) on the run card\'s action — the agent\'s own command, never a record\'s words'],
  'src/lib/vault-window.js|r': ['run switch', 'the «Usable by agent runs» answer\'s `open` — a boolean choosing one of two fixed sentences, never a record\'s words'],
  'src/server/dial-health-watch.js|w': ['host', 'the second-dialer item\'s words — a machine name, an address, a time (itemOf), the machine\'s own record'],
  'src/server/host-key-watch.js|w': ['host', 'the host-key item\'s words — a machine name and the fingerprint it showed (itemOf), the machine\'s own record (lane lg-remote-hardening)'],
  'src/hosts.js|h0': ['host', 'the machine\'s own name in the pin\'s refusal (pinHostKeys: host-key-none-chosen / host-key-name / host-key-not-seen) — lane lg-remote-hardening'],
  'src/host-keys.js|h': ['host', 'the machine\'s own name in the pin\'s refusal by name (pinRefusal: host-key-name — an address no pin line can name; its door) — lane lg-remote-hardening'],
  'src/server/dial-health-watch.js|v': ['host', 'the verdict\'s refusing address (secondDialerVerdict) in the journal line — the machine\'s own dial record'],
  // ── verify r9: the receivers of the one-level alias pass (a field copied into a local, then handed to a sink) ──
  'src/agent-routes/status.js|req.body||{}': ['status', 'the caller\'s OWN status write (the owner\'s route / the agent\'s vibespace-status), destructured — the record itself'],
  'src/install-slot.js|s': ['desktop app', 'an install spec\'s label (packageInstallPlan, moved from desktop-apps.js — lane dc-apps-rows)'],
  'src/lib/sidebar-mounts.js|cfg': ['mount', 'a storage mount\'s name'], 'src/lib/telemetry-client.js|e': ['error', 'an unhandled rejection\'s reason'],
  'src/lib/workflow-detail.js|opts': ['workflow', 'a workflow run\'s name'], 'src/routes/desktop-apps.js|req.query': ['caller', 'the install the caller asked for (a closed set, echoed clipped)'],
  'src/server/groups-engine.js|r': ['session', 'a resolved member\'s name'], 'src/window-reach.js|probe': ['window', 'an accessibility probe\'s reason'],
  // design 012 (Slack S1): a typed ChannelError of the Slack adapter — its `detail` carries the vendor's error CODE and the closed `why` (src/channels/slack-words.js), never a record's text
  'src/channels/slack.js|e': ['error', 'a typed ChannelError: detail.error is Slack\'s error code, detail.why a closed word'],
  // design 011 lane 3: the usage index owner's own words — its two rows RETIRED with it (row B-360d unit 1: the Usage window answers from the ledger's cells)
  'src/store-writer.js|s': ['store writer', 'a store\'s queue row — its NAME is store-timing\'s constant («channels-index.write», src/timed-sync.js STORES) or the file\'s base name; never a record\'s text (lane hub-loop-stalls commit 2)'],
  'src/server/search-index.js|m': ['index worker', 'the search index worker\'s own state message (a reason NAME, a SQLite error text)'],
  // lane stream-p1b-screen: the screen source's journal line names its encoder — a fixed ladder label, never a record's words
  'src/agentd/stream-screen.js|plan.encoder': ['harness', 'the encoder ladder rung\'s fixed label (NVENC / AMF / Quick Sync / x264 — src/stream-plan.js ENCODER_LADDER)'],
  'src/agentd/stream-window-source.js|plan.encoder': ['harness', 'the encoder ladder rung\'s fixed label (NVENC / AMF / Quick Sync / x264 — src/stream-plan.js ENCODER_LADDER), the window source\'s start line (lane stream-p2w-build)'],
  // lane apple-signing: the hub's Mac screen helper push (src/server/desktop-webrtc.js pushMacHelper) — a push verdict's own words and the Mac agent's helper answer, never a record of the five kinds
  'src/server/desktop-webrtc.js|p': ['words', 'a helper push verdict\'s own sentence (`note`: the signed release that names the bytes, or «unsigned prebuilt» + its sha256) on the hub journal line — the hub\'s own words, never a record'],
  'src/server/desktop-webrtc.js|need': ['words', 'the Mac agent\'s helper answer — its `pending` is the judgment in progress on a pushed file (version, sha256, tries; src/agentd/stream-mac.js), read into the push\'s refusal sentence — a device fact, never a record'],
  // lane stream-mac-ax-respawn: the Mac injector's replacement line names the grant's two values, never a record's words
  'src/input-inject.js|r.replace': ['harness', 'THE RESPAWN RULE\'s verdict — the Accessibility grant\'s from / to (granted · denied · unknown — src/input-inject.js macRespawn)'],
  // lane voice-teach-skips: the settings list's 加入 toast names why Dropline skipped the word — the vendor's skip CODE
  'src/lib/voice-teach-ui.js|skip': ['vendor code', 'Dropline\'s skip reason for ONE dictionary word (review / refused mapped to fixed words, else the vendor\'s own short code) — never a record\'s text'],
  // lane vault-login: an existing web-login summary's pending kind ('register' | 'change' | null), compared to pick a fixed refusal
  'src/browser-login.js|dup': ['vault entry', 'an existing web-login entry summary\'s `pending` kind (\'register\' | \'change\' | null) compared to choose one of two fixed login_exists sentences — never a record\'s words'],
  // lane login-request-card: one login, several sites — another login's CLEAR name (the vault's names) in login_exists, and the person's own request
  'src/browser-login.js|other': ['vault entry', 'another web-login entry\'s clear name (web-login:<origin>#<user>, the vault\'s names) named in login_exists so the person can merge the two — never a record\'s words'],
  'src/server/browser-logins.js|h': ['vault entry', 'the login that already holds a (site, user) pair — its clear name (web-login:<origin>#<user>, the vault\'s names) named in login_exists at the doors that make a login, so the person changes it at that row — never a record\'s words'],
  'src/browser-login.js|third.e': ['vault entry', 'a third web-login entry\'s clear name named in the merge\'s login_exists — never a record\'s words'],
  'src/routes/vault.js|req.query': ['caller', 'the person\'s own ?name= / ?site= / ?user= — the login and the site an add is asked about, handed to the web-login store'],
  'src/routes/vault.js|b': ['caller', 'the request body — the person\'s own login name, site and the name it signs in under there, or the two logins to merge, handed to the web-login store'],
  // ALSO CURED (the train's own red at 7c30f13eb, met by this unit's heavy read — B-225b's page half): the held store's row in its
  // «Start {what} empty?» dialog — `what` = storeWhatOf(file), the store's OWN fixed name (src/lib/store-held.js), never a record's words
  'src/lib/store-held.js|row': ['held store', 'a held store\'s row: `what` is the store\'s own fixed name (storeWhatOf), its file the store\'s file name — never a record\'s words'],
  // 主开发 r2090 (B-23e5 line 262, the hosted run on 61a1c21f5): the terminal window's guard over its Ctrl+G panes asks «{name} has unsaved
  // changes…» — `d` = unsavedPane(): the unsaved panes' file names (each pane's own basename, joined), a person's own files, never a record's words
  'src/lib/external-editor.js|d': ['file', 'the unsaved Ctrl+G panes\' own file names (unsavedPane(), joined) in the close question — a person\'s files, never a record\'s words'],
  // ── 主开发 r2953 (box row 456 at the candidate c51494dbc): the thirteen sites the census met, as ten receivers, each followed to where its value is made ──
  'src/interface/index.js|e': ['error', 'the Error the sign-in table threw on one head (failed(e)): its code / class name in the journal — never a record\'s words'],
  'src/interface/signin.js|e': ['error', 'the Error the sign-in road\'s handle() rejected with: its code / class name in the journal'],
  'src/opencode-provider-config.js|p': ['provider', 'a third-party provider record of Manage agents (configOf): its label is the owner\'s own name for a provider configuration, a setting — none of the kinds a clear reaches'],
  'src/accounts.js|p': ['provider', 'r4124 (lane bl-scratch): a third-party provider record (Accounts.providerRecordOf, the pool\'s fallback list) — its label is the owner\'s own name for a provider configuration (a setting, as opencode-provider-config.js|p), in the refusal Error «… does not serve Claude Code» answered to the owner\'s own press — none of the kinds a clear reaches'],
  'src/server/account-usage-routes.js|x': ['account', 'an account\'s decision row (decisionList) in a fold that could not be judged: its sign-in facts\' reason code and the account\'s own name'],
  'src/server/cli-config-runner.js|whole': ['harness', 'the CLI-config helper\'s receipt for the plan as a whole (parseReceiptLines of its own stdout): the helper\'s refusal reason'],
  'src/server/cli-config-runner.js|x': ['harness', 'a per-harness receipt of the same helper: its own reason'],
  'src/hosts.js|x': ['harness', 'r4124 (lane bl-scratch): a paired machine\'s CLI-config receipt (HostManager.installNotLanded over parseReceiptLines of the shipped helper\'s stdout): its `reason` is the helper\'s own words about a file (a refusal, an error code) in the install\'s «did not land» sentence — the same receipt as the runner\'s two rows above, never a record\'s words'],
  'src/server/conversation-deliver.js|p': ['words', 'askOwedPace\'s verdict: the wake pacer\'s own why / rule, or the error that failed the pace — never a message\'s words'],
  'src/server/otel-ingest.js|t': ['words', 'the stash\'s trim plan: its `what` is made from counts only (`kept the newest N known lines inside 30 days and M unknown-org ones`)'],
  'src/server/spawn-priority.js|machine': ['host', 'a paired machine\'s record: the owner\'s name for the device (control bytes stripped, 64 characters)'],
  'src/usage-routes.js|acctMeta': ['account', 'the account\'s decision row (decisionRowOf): its sign-in facts\' reason code in the panel\'s why'],
  // B-ef83 lines 987 / 1041 (主开发 r4840, the second hosted proof of 2.369.420): the owed compaction's road in the dispatch — each
  // receiver read for what it HOLDS; none can hold a message's, a peer's or an item's words, so each is a row with that reason
  'src/server/worker-dispatch.js|o': ['session', 'an owed compaction\'s record (memory only): the one field a sink reads is `from`, the dispatching SENDER\'s conversation id (the dispatch route\'s own caller, a cid of ours), cut to 8 characters in its journal lines; the brief itself (`o.rec`, a group message) goes only to the groups engine\'s wake, never to a sink here. ONLY `from`: any other field of this record read at a sink (its name, the brief it carries) asks this row judged again (主开发 r4859)'],
  'src/server/worker-dispatch.js|pace': ['words', 'the wake pace\'s verdict (the groups engine\'s pacerFor → src/channel-groups.js paceVerdict): its `rule` / `reason` are the pace\'s own sentences (a rate floor, a wait in seconds) or `store-blocked` naming a file of ours — never a message\'s words'],
  // (the row `worker-dispatch.js|v` left at its meeting with B-ef83 unit 1's journal line, 主开发 r5161: the refused compaction's end now
  //  reads the verdict's CODE `v.why`, no text field, so the dispatch reads no text of a spend verdict at a sink)
  'src/server/worker-dispatch.js|woke': ['words', 'the groups engine\'s wake answer (wake → the delivery ladder, src/server/conversation-deliver.js): a reason of ours (a code, the pace\'s or the spend gate\'s sentence, the inbox socket\'s timeout or write failure) or an Error\'s message, and an Error carries no record\'s words by this census\'s own error rule — never a message\'s or an item\'s words'],
  // r5378 (lane bl-release, the first hosted proof of 2.369.422 at 4d78a1334, run 45914950208): the eleven site reads the train's
  // picked lines brought, each classed by reading its code at its site (the integrator's rcci-unclassified-by-line.tsv names the line)
  'src/accounts.js|member': ['account', 'r5378 (B-e381, line 2267): a pool member account record (_memberSignIn): its own name in the refusal of a member whose harness keeps no sign-in here — the sentence family of |target («pool member not logged in: » + target.name); every caller of ensureSessionPoolLink takes it into the hub\'s own journal: an account, never a person\'s or a peer\'s words'],
  'src/agentd/durable-file.js|e': ['error', 'r5378 (B-93e7, line 2150): the Error a durable write\'s fsync threw — its code or its class name only (e.code || e.name) in the one sentence refusedSyncWords says once to the device\'s own log; never its message, never a record'],
  'src/hosts.js|r': ['host', 'r5378 (B-93e7, line 2150): a paired machine\'s answer to the hub\'s own agent install script (installAgentdAnswer): `from` is the agent version that machine keeps running (VS-AGENTD-DEFERRED … from=<version>), said in the hub\'s journal, which the owner reads — a machine\'s fact, never a person\'s words'],
  'src/lib/browser-live-window.js|w': ['words', 'r5378 (B-574d, line 2308): the hand-back answer\'s words (PURE handBackAnswerWords, src/browser-tabs.js): fixed product sentences with no field of the answer in them, toasted on the person\'s own page'],
  'src/machine-mounts.js|e': ['error', 'r5378 (line 2236, the legacy mounts gap): the Error the legacy store\'s judging threw — its code or its class name only ((e.code || e.name) || «an error») in the hub\'s journal; never its message, never a record'],
  'src/server/usage-pool-engine.js|mw': ['words', 'r5378 (B-9369, line 2284): a conversation\'s per-session switch notice (PURE sessionMoveWords, the one table of keys): its English text and its i18n (key + params) for the hub\'s own notice — the pool, member and conversation names the release\'s sentence said, moved into the table, not widened'],
  'src/server/usage-pool-engine.js|dw': ['words', 'r5378 (B-9369, line 2284): the pool default\'s switch notice (PURE poolSwitchWords, the same table): its English text and its i18n (key + params) for the hub\'s own notice — the release\'s pool and member names, moved into the table, not widened'],
};
// the per-site class of every record / carrier read: `file|sink|read` → [class, why]
const I_SITES = {
  'src/agent-routes.js|peer|e.fromName': ['transcript', 'the drained stash entry\'s sender label on the card drawn for what the agent\'s turn received'],
  'src/agent-routes.js|peer|e.text': ['transcript', 'the drained entries — injected into the agent\'s context; the card shows what it received'],
  'src/agent-routes.js|peer|e.jobName': ['transcript', 'the drained job notification\'s name on the card of what the agent received'],
  'src/agent-routes/status.js|todo|add.text': ['own', 'the agent files its own item — the record the clear reaches'],
  'src/agent-routes/status.js|todo|add.detail': ['own', 'the agent files its own item'],
  'src/agent-routes/status.js|todo|add.options': ['own', 'the agent files its own item'],
  'src/agent-routes.js|activity|req.body.note': ['own', 'the agent\'s own Activity entry'],
  'src/agent-routes.js|activity|req.body.detail': ['own', 'the agent\'s own Activity entry'],
  'src/agentd/agentd.js|peer|msg.text': ['transcript', 'the device posts the delivered text into the CLI\'s inbox (through the shared body peerPostAnswer since B-95fc: it waits for the inbox, then posts)'],
  'src/jobs.js|peer|a.text': ['transcript', 'the notify action\'s own text delivered to the owner conversation'],
  'src/jobs.js|todo|job.name': ['cascade', 'a For-you item filed by the job (failed / parked / missed / needs input) carries its jobId — the job\'s clear cascades to it'],
  'src/jobs.js|todo|a.text': ['cascade', 'the notify action\'s For-you item carries the jobId — cleared with the job (r3: the --text rides `_forYou`, the one door)'],
  'src/lib/jobs-panel.js|dialog|j.name': ['live', '"Remove job" names a cleared job in this device\'s words (r5 ⑨)'],
  'src/lib/jobs-panel.js|title|job.name': ['live', 'the Job input window\'s title, re-worded on every render + generic in every layout record (WORDLESS_TITLES)'],
  'src/lib/user-todos-panel.js|toast|nameFor()': ['ref', 'the arrival toast: the history keeps the head + {kind: todo, id} (r4 ⑤ / r5 ⑩)'],
  'src/lib/user-todos-panel.js|toast|wordsOf()': ['ref', 'the arrival toast: the history keeps the head + {kind: todo, id} (r4 ⑤)'],
  'src/lib/user-todos-actions.js|toast|row.name': ['ref', 'the two toasts of an ask\'s attachment at open (lane foryou-attachments): gone, and its folder did not answer (B-23e5 (a), r2960): the history keeps the head + {kind: todo, id}'],
  'src/server/conversation-deliver.js|peer|opts.fromName': ['transcript', 'the card drawn when a delivery REACHED the conversation (cardOk)'],
  'src/server/conversation-deliver.js|peer|opts.cardText': ['transcript', 'the card drawn when a delivery reached the conversation'],
  // notify-retry verify r2: the retry park's landing card is built AFTER the post from the entry's words AS THEY STAND (a clear
  // that reached it mid-flight already rewrote them to the sentence — redactStash rewrites the park); `recorded` = the frame
  'src/server/conversation-deliver.js|peer|one.fromName': ['transcript', 'the parked delivery\'s landing card: the entry\'s name as it stands after any clear (the park is rewritten by the door)'],
  'src/server/conversation-deliver.js|peer|one.cardText': ['transcript', 'the parked delivery\'s landing card: the entry\'s card text as it stands (dropped by a clear)'],
  'src/server/conversation-deliver.js|peer|one.text': ['transcript', 'the parked delivery\'s landing card: the entry\'s words as they stand after any clear (a mid-flight clear = the sentence; the frame the CLI holds is `recorded`)'],
  'src/server/groups-engine.js|peer|rep.text': ['transcript', 'a wake report delivered to a member (a refused one rides the next report; a handed-back one is the stash the door rewrites)'],
  'src/server/groups-engine.js|peer|wc.text': ['transcript', 'a group message delivered to a member (the wake card\'s words — B-9fd6)'],
  'src/server/session-brain.js|status|fact.branch': ['own', 'the vcs entry\'s own write (the door drops its branch)'],
  'src/server/conversation-deliver.js|journal|read.text': ['length', 'r3640: the retry park\'s set-aside line names the bytes kept (their LENGTH), never their words'],
  'src/agent-routes.js|journal|u.text': ['length', 'the injection\'s held line names the jobs update\'s SIZE, never its words'],
  'src/agent-routes.js|journal|rep.text': ['length', 'the injection\'s held line names the report\'s SIZE, never its words'],
  'data/bin/codex-chat-wrapper.js|journal|data.context': ['length', 'the wrapper\'s log names the injected context\'s LENGTH, never its words'],
  'src/server/stdout/claude-stream-json.js|peer|po.name': ['transcript', 'the live card of a message the CLI received (its transcript holds it)'],
  // the .197 integration: lane group-report-card's report card (the agent's injection carried these words; the chat card's
  // ring copy in the session meta is re-worded by the groups door's clear — src/normalizers.js redactGroupCards)
  'src/server/groups-engine.js|peer|c.fromName': ['transcript', 'the sender of a group message a member\'s report carried — its card at the injection'],
  'src/server/groups-engine.js|peer|c.text': ['transcript', 'a group message a member\'s report carried (the agent received it; the card\'s ring copy re-words at the clear)'],
  // verify r9 — the alias pass's record reads
  'src/agent-routes.js|peer|req.body.text': ['transcript', 'the agent\'s own vibespace-msg text (copied into a local first) delivered into the target conversation, and its card'],
  'src/agent-routes/status.js|status|req.body||{}.reason': ['own', 'the caller\'s own status write — the record the clear reaches'],
  'src/agent-routes/status.js|status|req.body||{}.detail': ['own', 'the agent\'s own status write — the record the clear reaches'],
};
const iJudge = (rows) => {
  const unknownRecv = new Set(), bad = [], used = new Set(), usedSites = new Set(), bySink = {}, recordSites = [];
  for (const r of rows) {
    const rk = `${iRel(r.rel)}|${iRecvOf(r.read)}`;
    bySink[r.sink] = bySink[r.sink] || { sites: 0, record: 0 };
    bySink[r.sink].sites++;
    const kind = I_RECV[rk];
    if (!kind) { unknownRecv.add(`${rk} (${r.sink} @${r.line}: ${r.read})`); continue; }
    used.add(rk);
    if (!I_RECORD_KINDS.has(kind[0])) continue;
    bySink[r.sink].record++;
    const sk = `${iRel(r.rel)}|${r.sink}|${r.read}`, site = I_SITES[sk];
    usedSites.add(sk);
    recordSites.push({ ...r, cls: site && site[0] });
    if (!site) { bad.push(`${sk} @${r.line}: a ${kind[0]} read with no class`); continue; }
    if (!(I_ALLOWED[r.sink] || []).includes(site[0])) { bad.push(`${sk} @${r.line}: class '${site[0]}' is not allowed at a ${r.sink} (allowed: ${(I_ALLOWED[r.sink] || []).join(' / ') || 'none'})`); continue; }
    if (!I_CHECK[site[0]](r.args, r.read)) bad.push(`${sk} @${r.line}: claims '${site[0]}' but its words do not show it`);
  }
  return { unknownRecv: [...unknownRecv], bad, deadRecv: Object.keys(I_RECV).filter((k) => !used.has(k)), deadSites: Object.keys(I_SITES).filter((k) => !usedSites.has(k)), bySink, recordSites };
};
const I_ABSENT_MEMO = new Map();
const iAbsent = (srcs) => {
  const hits = [];
  for (const [rel, src] of srcs) {
    const memo = I_ABSENT_MEMO.get(rel);
    if (memo && memo.src === src) { hits.push(...memo.hits); continue; }
    const code = iCode(src), mine = [];   // the code keeps the line breaks of everything but a template's text
    for (const [what, re] of I_ABSENT) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(code))) mine.push(`${rel}:${lineOf(code, m.index)} (${what})`); }
    I_ABSENT_MEMO.set(rel, { src, hits: mine });
    hits.push(...mine);
  }
  return hits;
};
console.log('§I the interpolation census (verify r8): every message that embeds a record\'s words, grep-derived over the whole tree');
{
  ok(I_FIELDS.length >= 20 && ['name', 'text', 'note', 'reason', 'detail', 'lastLine', 'context', 'progress', 'from', 'branch'].every((f) => I_SHAPE_FIELDS.includes(f)), `I the text fields are DERIVED from record-clear SHAPES (${I_SHAPE_FIELDS.length}) + ${I_CARRIERS.length} carriers: ${I_FIELDS.join(', ')}`);
  ok(!I_FIELDS.includes('title'), 'I DECLARED (the brief): a Task Group\'s TITLE is not a record — `title` is no field of the five kinds, so a title interpolated anywhere is not in this census; an agent group\'s NAME is the group, not a message (a rename\'s previous name, raw.from, is the cleared field) — every `group.name` read is classified `agent group` below');
  const missingDoor = iCarrierMissing();
  ok(!missingDoor.length, 'I every CARRIER names the door statement that rewrites it (or the delivery that makes it the transcript\'s)', missingDoor.map(([f]) => f));
  ok(I_FILES.length > 400 && I_FILES.some((f) => f.startsWith('src/lib/')) && I_FILES.some((f) => f.startsWith('data/bin/')) && I_FILES.includes('server.js'), `I the file list is DERIVED: server.js + src/** (the client included) + data/bin/* (${I_FILES.length} files; ${I_GENERATED.size} generated read at their sources: ${[...I_GENERATED].join(', ')}; ${I_CLI.length} agent CLIs as a class)`);
  const srcs = iSources();
  const rows = interpCensus(srcs);
  const J8 = iJudge(rows);
  ok(rows.length >= 250 && J8.unknownRecv.length === 0, `I every (file, receiver) whose text field reaches a sink is classified (${rows.length} site reads, ${Object.keys(I_RECV).length} receivers)`, J8.unknownRecv);
  ok(J8.deadRecv.length === 0 && J8.deadSites.length === 0, 'I no dead row (every receiver and every site class is still in the tree)', { recv: J8.deadRecv, sites: J8.deadSites });
  // r5229 (主开发, the build machine's row 1110 at d1e3a09eb): THE ONE DOOR IS A READ. Line 1053's door (d80f170cd, moved d3d248366) took
  // these two sites' `R.detail || R.why` through agentSpendWords, which still hands a verdict's own detail (a held one's code only): the
  // receivers read their verdict's detail through the door, so their rows are RESTATED, not removed. RED (the census without the door
  // rule, over the same two files — every pass of interpCensus is the file's own, so their rows are the whole tree's for them): they read
  // nothing — the rows the release keeps would be dead, as they were at d1e3a09eb. r5249 (row 1111): the per-file memo answered the
  // door-OFF pass with the rows of the door-ON one; the memo now keys the door's switch too, and the RED carries its WITNESS (law 1):
  // the pass re-scanned both files, and the reader with the door off reads no detail from the door's call
  { const recvOf = (rs) => new Set(rs.map((r) => `${iRel(r.rel)}|${iRecvOf(r.read)}`));
    const door = recvOf(rows), RR = ['src/server/conversation-deliver.js|v', 'src/server/conversation-ops.js|g'];
    const two = new Map(['src/server/conversation-deliver.js', 'src/server/conversation-ops.js'].map((rel) => [rel, srcs.get(rel)]));
    const scans0 = I_SCANS;
    I_DOOR_ON = false; let bare, offReads; try { bare = recvOf(interpCensus(two)); offReads = iReads('refusal(x, agentSpendWords(g))'); } finally { I_DOOR_ON = true; }
    const scanned = I_SCANS - scans0, onReads = iReads('refusal(x, agentSpendWords(g))');
    const atDoor = [...two.values()].every((s) => /agentSpendWords\(\s*[vg]\s*\)/.test(s || ''));
    ok(atDoor && RR.every((k) => door.has(k)), 'I r5229 THE ONE DOOR IS A READ: the parked delivery\'s verdict (v) and the automation\'s refusal (g) read their verdict\'s detail through agentSpendWords — their rows stand, restated', [...door].filter((k) => RR.includes(k)));
    ok(scanned === 2 && !offReads.includes('g.detail') && onReads.includes('g.detail'), `I r5249 THE RED's PLANT IN FORCE: the door-off pass re-scanned both files (${scanned}, no memo answered it), and the reader reads the door's call as a detail only with the rule on`, { scanned, offReads, onReads });
    ok(RR.every((k) => !bare.has(k)), 'I r5229 RED (the census without the door rule, the same two files): neither receiver reads a text — the rows would be dead, as row 1110 read them at d1e3a09eb', [...bare].filter((k) => RR.includes(k)));
  }
  ok(J8.bad.length === 0, `I every read of a record / a carrier at a sink is of a class the sink allows AND shows it (${J8.recordSites.length}: ${[...new Set(J8.recordSites.map((s) => s.cls))].join(' / ')})`, J8.bad);
  ok(Object.values(I_RECV).every(([k, why]) => k && why.length >= 6) && Object.values(I_SITES).every(([c, why]) => I_CHECK[c] && why.length >= 20), 'I every receiver names what it is; every site class names why');
  // r3664 (the box's red at ebc6d0672): the class length's forms — a size spelled String(<read>).length is shown (the retry park's
  // set-aside line); the words wrapped without .length, or printed beside the size, are not
  const LEN_GOOD = '`set aside as ${path.basename(aside)} (${String(read.text).length} bytes kept); the retry park starts empty`';
  const LEN_WORDS = '`set aside: ${String(read.text)}`', LEN_BESIDE = '`${String(read.text).length} bytes kept: ${read.text}`';
  ok(I_CHECK.length(LEN_GOOD, 'read.text') && !I_CHECK.length(LEN_WORDS, 'read.text') && !I_CHECK.length(LEN_BESIDE, 'read.text'),
    'I the class length shows a size spelled String(<read>).length (r3664: the retry park\'s set-aside line) — and the words wrapped without .length, or printed beside the size, are RED');
  ok(!iShowsLength(I_LENGTH_FORMS.filter((f) => !/String/.test(f('x'))))(LEN_GOOD, 'read.text'), 'CONTROL (r3664): with that form cut, the set-aside line\'s size is RED — «claims length but its words do not show it», the box\'s red at ebc6d0672');
  { const al = rows.filter((r) => r.alias), defs = new Set(al.map((r) => `${r.rel}:${r.defLine}:${r.alias}`));
    ok(al.length >= 25 && defs.size >= 15 && al.every((r) => r.read && r.sink && I_RECV[`${iRel(r.rel)}|${iRecvOf(r.read)}`]), `I verify r9 — THE ONE-LEVEL ALIAS PASS: a text field COPIED into a local (\`const x = rec.<field>\` / \`const { field } = rec\`) and handed to a sink in its block is a read at that sink — ${defs.size} copies, ${al.length} sink reads, every one judged by the receiver + site tables above (a copy into an object's member or through two locals is declared)`, al.length); }
  ok(iAbsent(srcs).length === 0, `I the absent sinks stay absent — ${I_ABSENT.map(([w]) => w).join(', ')}: zero sites`, iAbsent(srcs));
  // the classes' own standing statements: the cascade reaches every item a job filed; the dialog says agents keep what they received
  ok(read('src/server/record-clear.js').includes('userTodos.idsWhere((i) => i.jobId && gone.has(i.jobId))') && /userTodos\.add\(sessKey, \{\s*origin: 'jobs', \/\/ B-328d\s*text, detail,\s*i18n: [^\n]*\n\s*urgency: urgency \|\| 'normal', by: 'agent', jobId,/.test(read('src/server/jobs-wiring.js')) && /_forYou\(job, c\) \{\n[\s\S]{0,2600}?\n\s*const forYouDep = FOR_YOU_DEPS\.get\(this\) \|\| null;\n\s*let v;\n\s*try \{ v = forYouDep \? forYouDep\(\{ words, fact: c\.fact, urgency: c\.urgency, \.\.\.\(job \? \{ jobId: job\.id,/.test(read('src/jobs.js')), 'I `cascade`: a job\'s clear cascades to every For-you item carrying its jobId, and the ONE filing door (jobs-wiring notifyUser) stamps it');
  ok(read('src/lib/record-clear-ui.js').includes("copies.className = 'dialog-hint rc-copies';"), 'I `transcript`: the confirm dialog says an agent keeps what it already received (.rc-copies, r4 ③)');
  { const rail = read('src/lib/sidebar-rail.js');
    ok(/row\.service = nameOf\(owned\.get\(row\.port\)\); row\.serviceJob = owned\.get\(row\.port\)\.id;/.test(read('src/port-forward.js')) && rail.includes("(msg.type === 'jobs-updated' && Array.isArray(msg.cleared))) render();"), 'I verify r8 ④: a Ports scan row carries its service\'s job id, the page\'s scan cache is scrubbed on the clear (the carrier row above) and the panel re-renders');
    ok(iPortsWorded(rail), 'I verify r8 ⑤: a cleared service reads the sentence in THIS device\'s words on the Ports forward row and the scan row, and never pre-fills a /svc/ path (it printed the stored English key to a zh owner)'); }
  // verify r9 ⑥: the agent-message flood floor (`msg send`) remembered the last TEXT per (sender, target) pair — a group
  // message's words in the server's memory, pruned only past 500 pairs, which no clear reaches; it keeps a DIGEST
  ok(iRateDigest(read('src/agent-routes.js')), 'I verify r9 ⑥: the msg flood floor keeps a digest of the last message, never its text (a cleared group message\'s words stayed in the server\'s memory)');
  ok(iNotifyDigest(read('src/jobs.js')), 'I verify r9 ⑥: …and the jobs engine\'s notify floor keeps a digest of the last notification per conversation, never its text (a cleared job\'s name + words stayed in the server\'s memory)');
  // the declared WHOLE classes, each with its derived check
  const routeFiles = [...srcs].filter(([, s]) => /\b(app|router)\.(get|post|put|patch|delete)\(/.test(s)).map(([rel]) => rel);
  // verify r8 ③: the journal is a SINK (above), not a declared class — the server's console ring is copied into every
  // incident captured later (an automatic freeze capture too); what is left declared is where the journal ALSO goes and no
  // clear can follow: journalctl and the opslog files — reached by no route (derived), holding no record's words (§I journal)
  const ring = read('src/server/incident-wiring.js');
  ok(routeFiles.length >= 20 && routeFiles.every((rel) => !/OPSLOG|journalctl/.test(iCode(srcs.get(rel)))) && /_srvConsoleRing\.push\(/.test(ring) && /out\.console = _srvConsoleRing\.slice\(-400\);/.test(ring) && I_SINKS.some(([id]) => id === 'journal'), `I the journal is judged as a SINK: the server's console ring rides every incident (incident-wiring \`out.console\`), so every console / log line is in the census above; journalctl + the opslog files are reached by no route file (${routeFiles.length}) and carry what the ring does`);
  const cliWrites = I_CLI.filter((f) => CLI_FILES.includes(f) && /writeFileSync|appendFileSync|createWriteStream|\bwriteFile\(/.test(read(f)));
  ok(I_CLI.length >= 10 && CLI_FILES.every((f) => I_CLI.includes(f)) && !cliWrites.length, `I DECLARED — an agent CLI's stdout is the agent's tool result (the transcript class): the ${CLI_FILES.length} CLIs that reach the five stores write no file`, cliWrites);
  console.log('  · THE INTERPOLATION CENSUS — sites × reads per sink (record / carrier reads in brackets):');
  for (const [id, , leaves] of I_SINKS) { const b = J8.bySink[id] || { sites: 0, record: 0 }; console.log(`    ${id.padEnd(9)} ${String(b.sites).padStart(3)} [${b.record}] — ${leaves}`); }
  for (const s of J8.recordSites) console.log(`    ${s.cls.padEnd(10)} ${s.sink.padEnd(8)} ${s.rel}:${s.line} ${s.read}`);
}
console.log('§I controls: one planted interpolation per class, each RED on its leg');
{
  const judge = (rel, mut) => { const srcs = iSources({ [rel]: mut }); return { ...iJudge(interpCensus(srcs)), absent: iAbsent(srcs) }; };
  const plant = (n, rel, from, to, tag, esm) => { const src = read(rel); ok(src.split(from).length === 2, `I control ${n} (${tag}) anchor present once`); return MUT.write(rel, src.replace(from, to), tag, esm ? { esm: true } : {}); };
  // 1. a toast naming the job (the r7 ④ shape, client-built) — no `history` ref
  { const rel = 'src/lib/jobs-panel.js', m = plant(1, rel, "  if (r?.error) showToast(r.error, { type: 'error' });\n  refresh?.();", "  if (r?.error) showToast(r.error, { type: 'error' });\n  else showToast(t('{name}: done', { name: j.name }));\n  refresh?.();", 'toast-names-job', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs-panel\.js\|toast\|j\.name .*no class/.test(c.bad[0]), 'CONTROL 1 (verify r8): a toast naming the job with no history ref is RED — every toast outlives the clear in the device history', c.bad); }
  // 2. a refusal sentence naming a For-you item (an unclassified receiver in the store module)
  { const rel = 'src/user-todos.js', m = plant(2, rel, "    if (!hit) throw new Error(`no open item matching \"${ref}\" in this session`);", "    if (!hit) throw new Error(`no open item matching \"${ref}\" in this session`);\n    if (hit.status !== 'open') throw new Error(`\"${hit.text}\" is already resolved`);", 'sentence-names-item');
    const c = judge(rel, m); ok(c.unknownRecv.length === 1 && /^src\/user-todos\.js\|hit \(error/.test(c.unknownRecv[0]), 'CONTROL 2 (verify r8): an Error naming an item\'s text is RED (a receiver the census has not judged)', c.unknownRecv); }
  // 3. the browser's Notification API, carrying a job's name
  { const rel = 'src/lib/jobs-panel.js', m = plant(3, rel, "  if (r?.error) showToast(r.error, { type: 'error' });\n  refresh?.();", "  if (r?.error) showToast(r.error, { type: 'error' });\n  try { new Notification('Background Work'); } catch { }\n  refresh?.();", 'notification-api', true);
    const c = judge(rel, m); ok(c.absent.length === 1 && /jobs-panel\.js:\d+ \(the browser's Notification API\)/.test(c.absent[0]), 'CONTROL 3 (verify r8): a browser Notification is RED (an absent sink appeared)', c.absent); }
  // 4. telemetry carrying a job's name (the Diagnostics window keeps it)
  { const rel = 'src/jobs.js', m = plant(4, rel, "      try { this.d.getTelemetry?.()?.record?.({ kind: 'error', name: 'jobs-archive-write-failed', detail: e.message }); } catch { /* telemetry is optional */ }", "      try { this.d.getTelemetry?.()?.record?.({ kind: 'error', name: 'jobs-archive-write-failed', detail: e.message + ' ' + [...this.jobs.values()].map((job) => job.name).join() }); } catch { /* telemetry is optional */ }", 'telemetry-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|telemetry\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 4 (verify r8): telemetry carrying a job\'s name is RED (the Diagnostics window keeps it past the clear)', c.bad); }
  // 5. a WRAPPER hiding the toast: `say(j.name)` — the census follows a function that hands its parameter to a sink
  { const rel = 'src/lib/jobs-panel.js', m = plant(5, rel, "  if (r?.error) showToast(r.error, { type: 'error' });\n  refresh?.();", "  const say = (m) => showToast(m);\n  if (r?.error) showToast(r.error, { type: 'error' });\n  else say(j.name);\n  refresh?.();", 'wrapped-toast', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs-panel\.js\|toast\|j\.name/.test(c.bad[0]), 'CONTROL 5 (verify r8): a wrapper that hands a job\'s name to showToast is RED at its call', c.bad); }
  // 6. a server notice naming the job
  { const rel = 'src/jobs.js', from = "    this._forYou(job, M.forYouCopy(job, 'ask'));", m = plant(6, rel, from, "    try { serverNotice?.('job-ask', `${job.name} asks for input`); } catch { }\n" + from, 'notice-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|notice\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 6 (verify r8): a server notice naming the job is RED (a toast on every device)', c.bad); }
  // 7. the client console with an item's text (the incident recorder's ring keeps it)
  { const rel = 'src/lib/user-todos-panel.js', from = "        const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i, { arrival: true })}`,", m = plant(7, rel, from, "        console.warn('[inbox] arrival', wordsOf(i));\n" + from, 'console-item-words', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /user-todos-panel\.js\|console\|wordsOf\(\)/.test(c.bad[0]), 'CONTROL 7 (verify r8): a client console line with an item\'s words is RED (the incident recorder\'s ring → an incident bundle)', c.bad); }
  // 8. THE FINDING of this round: the Ports clash sentence named the forward by its label — `service: <the job's name>`
  { const rel = 'src/port-forward.js', from = "    if (clash) throw new Error(`/svc/${name} is already mounted by the forward of ${clash.hostId === LOCAL_ID ? 'this machine' : clash.hostId}:${clash.targetHost ? clash.targetHost + ':' : ''}${clash.remotePort}`);", m = plant(8, rel, from, "    if (clash) throw new Error(`/svc/${name} is already mounted by ${clash.label || clash.id}`);", 'clash-names-label');
    const c = judge(rel, m); ok(c.unknownRecv.length === 1 && /^src\/port-forward\.js\|clash \(error @\d+: clash\.label\)/.test(c.unknownRecv[0]), 'CONTROL 8 (verify r8 ①): the pre-fix Ports clash sentence (`… mounted by service: <job name>`) is RED — a carrier read in an Error', c.unknownRecv); }
  // 9–10. the census subsumes the earlier rounds' examples: r7 ④'s refusal naming the job, r4 ⑤'s arrival toast keeping its words
  { const rel = 'src/jobs.js', m = plant(9, rel, "return { error: `${job.id} is already running` };", "return { error: `${job.name} is already running` };", 'r7-refusal-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|sentence\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 9 (verify r8): r7 ④ — a refusal sentence naming the job — is RED here too (§I subsumes §F\'s hand-listed sentence census)', c.bad); }
  { const rel = 'src/lib/user-todos-panel.js', m = plant(10, rel, ", { history: { m: head, ref: { kind: 'todo', id: i.id } } });", ');', 'r4-arrival-toast-words', true);
    const c = judge(rel, m); ok(c.bad.length === 2 && c.bad.every((b) => /user-todos-panel\.js\|toast\|(nameFor|wordsOf)\(\).*claims 'ref' but its words do not show it/.test(b)), 'CONTROL 10 (verify r8): r4 ⑤ — the arrival toast without its {head, ref} history — is RED (both of its record reads)', c.bad); }
  // 11. verify r8 ③: the pre-r8 journal line naming the job (rides the server's console ring into every later incident)
  { const rel = 'src/jobs.js', m = plant(11, rel, "this.d.log(`[jobs] adopted ${job.id} pid=${stamp.pid}`);", "this.d.log(`[jobs] adopted ${job.id} (${job.name}) pid=${stamp.pid}`);", 'journal-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|journal\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 11 (verify r8 ③): a journal line naming the job (the pre-r8 `adopted <id> (<name>)`) is RED — the console ring carries it into every incident captured after the clear', c.bad); }
  // 12. verify r8 ④: the Ports scan cache without its clear scrub (the job's name stays in the page, drawn on every re-render)
  { const rel = 'src/lib/sidebar-rail.js', stmt = I_CARRIERS.find(([f]) => f === 'service')[3], m = plant(12, rel, stmt, '/* the pre-r8 page: no scrub */', 'scan-cache-kept', true);
    const miss = iCarrierMissing((f) => (f === rel ? fs.readFileSync(m, 'utf8') : read(f)));
    ok(miss.length === 1 && miss[0][0] === 'service', 'CONTROL 12 (verify r8 ④): a page whose Ports scan cache is not scrubbed by the clear is RED (the carrier `service` names no door)', miss.map(([f]) => f)); }
  // 13. verify r8 ⑤: the pre-r8 Ports rows (the stored English key on a zh page, a /svc/ path pre-filled from it)
  { const rel = 'src/lib/sidebar-rail.js', src = read(rel);
    const pre = src.replace("${escHtml(svcWords)}", "${escHtml(svcM[1])}").replace("escHtml(p.service === CLEARED_TEXT ? clearedText() : p.service)", 'escHtml(p.service)').replace("value: (svcM && svcM[1] !== CLEARED_TEXT ? svcM[1] : '')", "value: (svcM?.[1] || '')");
    ok(pre !== src, 'I control 13 (ports-rows-english-key) anchors present');
    const m = MUT.write(rel, pre, 'ports-rows-english-key', { esm: true });
    ok(!iPortsWorded(fs.readFileSync(m, 'utf8')), 'CONTROL 13 (verify r8 ⑤): the pre-r8 Ports rows (the stored English key, the pre-filled path) are RED'); }
  // 14–15. verify r8 ⑥: the sink spellings the first cut missed — a telemetry event through `global.__vsEvent`, a `server-notice`
  //         FRAME broadcast directly (not through serverNotice())
  { const rel = 'src/jobs.js', from = "    this._forYou(job, M.forYouCopy(job, 'ask'));", m = plant(14, rel, from, "    global.__vsEvent?.('job-ask', job.name);\n" + from, 'vsevent-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|telemetry\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 14 (verify r8 ⑥): a telemetry event through global.__vsEvent naming the job is RED', c.bad); }
  { const rel = 'src/jobs.js', from = "    this._forYou(job, M.forYouCopy(job, 'ask'));", m = plant(15, rel, from, "    this.d.broadcast('server-notice', { type: 'server-notice', key: 'job-ask', text: `${job.name} asks` });\n" + from, 'notice-frame-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|notice\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 15 (verify r8 ⑥): a server-notice FRAME naming the job, broadcast directly, is RED', c.bad); }
  // 16. verify r9 (the revert table: r8 ⑥'s third spelling — `window.__vsOp` as the console sink — reverted, NOTHING went red:
  //     no op breadcrumb in the tree reads a record, and controls 14 / 15 plant the other two spellings only). A breadcrumb
  //     rides the incident recorder's op ring into every incident captured later, like a console line.
  { const rel = 'src/lib/user-todos-panel.js', from = "        const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i, { arrival: true })}`,", m = plant(16, rel, from, "        window.__vsOp?.('inbox-arrival', { id: i.id, words: wordsOf(i) });\n" + from, 'vsop-item-words', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /user-todos-panel\.js\|console\|wordsOf\(\)/.test(c.bad[0]), 'CONTROL 16 (verify r9): an op breadcrumb (window.__vsOp) carrying an item\'s words is RED (the incident recorder\'s op ring → an incident bundle)', c.bad); }
  // 17–18. verify r9 item 2(b): a text field COPIED into a local before the sink — r8's declared gap, now the alias pass
  { const rel = 'src/lib/jobs-panel.js', m = plant(17, rel, "  if (r?.error) showToast(r.error, { type: 'error' });\n  refresh?.();", "  const nm = j.name;\n  if (r?.error) showToast(r.error, { type: 'error' });\n  else showToast(t('{name}: done', { name: nm }));\n  refresh?.();", 'alias-names-job', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs-panel\.js\|toast\|j\.name .*no class/.test(c.bad[0]), 'CONTROL 17 (verify r9): a job\'s name copied into a local and toasted is RED (the alias pass)', c.bad); }
  { const rel = 'src/lib/user-todos-panel.js', from = "        const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i, { arrival: true })}`,", m = plant(18, rel, from, "        const { text: said } = i;\n        console.warn('[inbox] arrival', said);\n" + from, 'destructured-item-text', true);
    const c = judge(rel, m); ok(c.unknownRecv.length === 1 && /^src\/lib\/user-todos-panel\.js\|i \(console @\d+: i\.text\)/.test(c.unknownRecv[0]), 'CONTROL 18 (verify r9): an item\'s text DESTRUCTURED into a local and logged is RED (a receiver the census has not judged)', c.unknownRecv); }
  // 19. verify r9 ⑥: the pre-r9 flood floor (the last message's TEXT kept per pair)
  { const rel = 'src/agent-routes.js', src = read(rel);
    const pre = src.split('{ ts: Date.now(), h: _msgDigest(text) }').join('{ ts: Date.now(), text }').split('rate.h === _msgDigest(text)').join('rate.text === text');
    ok(pre !== src, 'I control 19 (rate-map-keeps-text) anchors present');
    const m = MUT.write(rel, pre, 'rate-map-keeps-text');
    ok(!iRateDigest(fs.readFileSync(m, 'utf8')), 'CONTROL 19 (verify r9 ⑥): the pre-r9 flood floor (the last message\'s text kept per pair) is RED'); }
  { const rel = 'src/jobs.js', src = read(rel);
    const pre = src.replace('this._notifyRate.set(cid, { ts: now(), h: textDigest(text) });', 'this._notifyRate.set(cid, { ts: now(), text });').replace('if (rate.h === textDigest(text) && rate.ts', 'if (rate.text === text && rate.ts');
    ok(pre !== src, 'I control 19b (notify-rate-keeps-text) anchors present');
    const m = MUT.write(rel, pre, 'notify-rate-keeps-text');
    ok(!iNotifyDigest(fs.readFileSync(m, 'utf8')), 'CONTROL 19b (verify r9 ⑥): the pre-r9 jobs notify floor (the last notification\'s text kept per conversation) is RED'); }
  // CONTROL 20 (B-95fc, the candidate's hosted red, 主开发 r594): the device's post through the SHARED body is judged by its own name —
  // ANOTHER record field put into peerPostAnswer's argument is RED by name (a read with no class), never unseen
  { const rel = 'src/agentd/agentd.js', m = plant(20, rel, "peerPostAnswer({ cid: msg.cid, text: msg.text, inboxWaitMs: msg.inboxWaitMs }", "peerPostAnswer({ cid: msg.cid, text: msg.text + ' (' + msg.name + ')', inboxWaitMs: msg.inboxWaitMs }", 'peer-post-names-a-record');
    const c = judge(rel, m); ok(c.bad.length === 1 && /agentd\.js\|peer\|msg\.name .*no class/.test(c.bad[0]), 'CONTROL 20 (B-95fc): another record field handed to the device\'s peer-post body (peerPostAnswer) is RED by name — the shared body is a peer delivery door', c.bad); }
  for (const row of copiesCensus(MUT.files, MUT.dir, ROOT, { minCopies: 20, label: '§I ' })) ok(row.pass, row.name, row.detail);   // §I's own copies (46 in the whole suite before the split, 26 by §H6's end)
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
