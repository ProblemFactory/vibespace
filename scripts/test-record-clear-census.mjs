#!/usr/bin/env node
// test-record-clear-census — "CLEAR CONTENT…" THE READER CENSUS (verify r3 of lane-redact, 2026-09-28).
// The rule of the round: a class that keeps returning "one more derived copy" gets a CENSUS, not another
// example. Every code path that can carry one of the five stores' words to a client, an agent, a file or
// another machine is DERIVED FROM THE TREE by grep and judged against ONE declared table — a reader the
// table does not name is RED, a table row the tree no longer has is RED (a dead row), and every reader
// that serves record text must be exercised by the runtime walk (test-record-clear-walk.mjs, heavy) —
// asserted here statically by the walk's own probe list.
//   §A FILE OWNERSHIP     each store's data file is named by its OWNER module only (+ the declared
//                         one-shot migrations that rewrite it in place) — a raw `readFileSync` of a
//                         store file anywhere else is a reader the fold never sees
//   §B THE GROUP LOG      the ONE append-only store: every `store.readTail / findRecord / countSince /
//                         search / oldestRecord` call site in the tree is (i) inside channel-store.js
//                         itself, (ii) inside groups-engine's `readFolded` (the fold) or `clearMessages`
//                         (the clear's own lookup, which returns cleared copies), or (iii) inside a
//                         channels-engine function whose declared GATE (`known(` / an adapter record)
//                         stands before the call — and channels-engine never names the groups adapter
//   §C THE READER SURFACES every route whose handler touches a store instance (tasks / userTodos /
//                         sessionStatus / jm / the groups engine / recordClear / getTasks / the two
//                         stashes' accessors) — in EVERY file of the tree that registers a route (the
//                         list is derived, never typed: the merge onto .196 had added a route file the
//                         old hand list did not name), and through the same-file helpers a handler
//                         calls (a hand-over route reaches the jobs stash three calls deep) — classified:
//                         reads (record text at call time — the walk probes it) · folded (the group
//                         log through the fold — probed) · echo (a writer answering the live record it
//                         wrote / the caller's own words) · writes · meta (identity / counts, no text)
//                         · exception (named, with its reason)
//   §D THE BROADCASTS     the five stores' `-updated` frames, each built where declared (the walk
//                         captures them on a live client)
//   §E THE CLIs           every /api path a shipped agent CLI calls is a §C route (no CLI reaches a
//                         store another way)
//   §F THE DERIVED COPIES the holders the doors rewrite, pinned statement by statement, and the
//                         DECLARED EXCEPTIONS with their reasons
//   §G CONTROLS           six patched copies (verify r7: + a refusal sentence naming the job), each adding ONE raw reader (a route reading the group
//                         log by path · the group window's read without the fold · a route reading
//                         jobs.json off disk · an agent route returning the Activity log under a new
//                         path · a route in a file the old hand list never named, reaching the jobs
//                         stash through a helper) — the census over the file list with the copy in
//                         place goes RED on exactly the leg that owns that class
//   §H THE CLIENT         (verify r5) the page itself: every browser storage write by key (and none of IndexedDB / CacheStorage /
//                         cookies / window.name / the URL), every window title that reads a record's words (its layout record
//                         keeps a generic title), THE BELT (every text field of the five kinds a surface reads is worded through
//                         the cleared-aware words, or declared), the long-lived client caches, each surface's repaint on its
//                         store's broadcast — four patched copies as controls; the chrome half is test-record-clear-client
//   §I THE INTERPOLATION CENSUS (verify r8) every MESSAGE that embeds a record's words — a toast, a dialog, a title, a server
//                         notice, telemetry, an Error / a route sentence, a derived For-you / Activity / status record, a
//                         delivery + its chat card, the client's console, the JOURNAL (the server's console ring rides every
//                         incident) — over the WHOLE tree; every receiver classified, every record read of a class its sink
//                         allows; the absent sinks (Notification API, document.title, badge, push) stay absent; 18 controls; the one-level alias pass (verify r9)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('record-clear-census', ROOT);
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const J = JSON.stringify;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** code lines only: a whole-line `//` or `*` comment is not a reader */
const codeLines = (src) => src.split('\n').map((l, i) => ({ i: i + 1, l })).filter(({ l }) => !/^\s*(\/\/|\*|\/\*)/.test(l));

// ── the tree this census walks: every server-side module + the shipped agent tools (the client bundle reads
//    the broadcasts and routes below; src/lib/ is not a reader of the stores' files) ──
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['lib', 'node_modules'].includes(e.name)) walk(rel, out); }
    else if (/\.(c|m)?js$/.test(e.name)) out.push(rel);
  }
  return out;
}
const SERVER_FILES = ['server.js', ...walk('src')];
const CLI_FILES = fs.readdirSync(path.join(ROOT, 'data/bin')).filter((f) => /^vibespace-(task|ask|job|msg|channels|status)$/.test(f)).map((f) => 'data/bin/' + f);
/** the file list the census reads — `override` maps a rel path to another absolute path (the controls) */
const sources = (override = {}) => new Map([...SERVER_FILES, ...CLI_FILES].map((rel) => [rel, fs.readFileSync(override[rel] || path.join(ROOT, rel), 'utf8')]));

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §A FILE OWNERSHIP
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const STORE_FILES = [
  // token → the modules allowed to name it (the owner first; then the one-shot migrations that rewrite the SAME file in place)
  { token: 'task-groups.json', owners: ['src/task-groups.js'], inPlace: ['src/server/migrations.js', 'server.js'] },   // migrations: dormant plan archival; server.js: the home-rename rewrite of paths
  { token: 'user-todos.json', owners: ['src/user-todos.js'], inPlace: ['src/server/migrations.js'] },                 // migrations: a presence check
  { token: 'session-status.json', owners: ['src/session-status.js'], inPlace: [] },
  { token: "'jobs.json'", owners: ['src/jobs.js'], inPlace: [] },
  { token: 'jobs-archive.json', owners: ['src/jobs.js'], inPlace: [] },
  { token: 'job-notifications.json', owners: ['src/jobs.js'], inPlace: [] },
  { token: 'job-notifications-read', owners: ['src/jobs.js'], inPlace: [] },
  { token: 'msg-stash.json', owners: ['src/server/conversation-deliver.js'], inPlace: [] },
  { token: "'stash-handover.json'", owners: ['src/server/stash-handover.js'], inPlace: [] },   // the lane-redact merge onto 2.369.196: the hand-over memory (a delivered hand-over's originals + frame) is a copy of held words
  { token: "'groups.json'", owners: ['src/channel-store.js'], inPlace: [] },
  { token: "join(dir, 'msgs')", owners: ['src/channel-store.js'], inPlace: [] },
  { token: "'TASK.md'", owners: ['src/task-groups.js'], inPlace: [] },
  { token: "'task-groups-archive'", owners: ['src/task-groups.js'], inPlace: [] },   // 2.369.204: the Activity log's overflow, MOVED (append-only month files); clearProgress rewrites the one month a cleared entry sits in
];
function fileOwnership(src) {
  const rows = [];
  for (const { token, owners, inPlace } of STORE_FILES) {
    const named = [];
    for (const [rel, text] of src) if (codeLines(text).some(({ l }) => l.includes(token))) named.push(rel);
    const allowed = new Set([...owners, ...inPlace]);
    rows.push({ token, named, strangers: named.filter((f) => !allowed.has(f)), ownerPresent: owners.every((o) => named.includes(o)) });
  }
  return rows;
}
console.log('§A file ownership: a store\'s data file is named by its owner module only');
{
  const rows = fileOwnership(sources());
  for (const r of rows) ok(r.ownerPresent && !r.strangers.length, `${r.token} — named by ${r.named.join(', ')}${r.strangers.length ? ' (STRANGERS: ' + r.strangers.join(', ') + ')' : ''}`, r);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §B THE GROUP LOG (append-only): every store read is folded, the clear's own, or gated off the groups adapter
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const LOG_READ_RE = /\bstore\.(readTail|findRecord|countSince|search|oldestRecord)\s*\(/;
// lane dc-channels-seams: the engine's three family files (moved VERBATIM out of its create() — access, outbound, auth)
// answer to the engine's rows: one owner, four files
const ENGINE_FAMILY = new Set(['src/server/channels-access.js', 'src/server/channels-outbound.js', 'src/server/channels-auth.js']);
const iRel = (rel) => (ENGINE_FAMILY.has(rel) ? 'src/server/channels-engine.js' : rel);
const STORE_MODULES = new Set(['src/channel-store.js', 'src/server/groups-engine.js', 'src/server/channels-engine.js', ...ENGINE_FAMILY]);
/** the 2-space-indented function a line sits in (the engines define their verbs inside create()) */
function enclosing(lines, idx) {
  for (let k = idx; k >= 0; k--) {
    const m = /^\s{2}(?:async\s+)?function\s+(\w+)\s*\(/.exec(lines[k]) || /^\s{2}const\s+(\w+)\s*=\s*(?:async\s*)?\(/.exec(lines[k]);
    if (m) return { name: m[1], start: k };
  }
  return { name: '(top)', start: 0 };
}
// groups-engine: the ONLY functions that may read the log raw — the fold, and the clear's own lookup `originalsOf`
// (verify r4: shared by clearMessages and the held-entry judge the ladder asks at every stash write; neither SERVES an
// original — the clear returns cleared copies, the judge only matches a held report's lines against the 40-code-point witness)
const GROUPS_RAW_OK = new Set(['readFolded', 'originalsOf']);
// channels-engine: every function that reads a store log, with the GATE that stands before the read (a
// conversation this engine KNOWS = an adapter record + an index row — never the groups adapter)
const CHANNELS_GATES = {
  flushPushBatch: 'store.index.entry(rec.id',           // the adapter record's own conversation
  loadOlder: 'known(',
  storedHit: 'store.index.has(',                        // design 010: a vendor hit's "already stored?" — an index row first, then the conversation's oldest record / the id
  vendorSearch: 'store.index.has(',                     // design 010 S6 (lane channels-followups): the `storedAt` hint — an index row first, then the id's stored instant (no text)
  readAroundFor: 'ACL.canSee(',                         // design 010: the agent's --around — reach before the instant's look-up
  ownerRecordOf: { callers: ['attachment'] },           // a helper: every call site sits inside a gated function (attachment: known( before the call)
  attachment: 'known(',                                 // reads through ownerRecordOf (and, for an agent, the named message's record) after it
  agentAttachmentAnswer: 'stillSees(',                  // lane channel-attach-read: the agent's attachment answer — reach re-asked before the named message is read
  storedOf: { callers: ['messageFacts'] },              // lane message-facts: a helper — its one call site sits inside messageFacts, after known(
  messageFacts: 'known(',                               // lane message-facts (B-f066): the owner's Details on a message stored before its facts
  search: 'adapterRecords().adapters.find',
  markRead: 'known(',
  messages: 'known(',                                   // verify r1: the raw generic reader, gated since
  searchFor: 'adapterRecords().adapters',
  readFor: 'convFor(',
  estimateScope: 'adapterRecords().adapters.find',
  estimateFilter: 'known(',
  healSelfAt: 'store.index',
  // the .197 integration: the other lanes' readers (channel-threads' reactions / thread index, lane-pairing r6's reply
  // anchor), each with the gate that stands before its read
  onPushEvent: 'const p = pushRow(rec);',               // a push lane's own adapter record (the groups adapter has no push lane); the read only checks a message's membership
  threadIxOf: 'store.index',                            // the log of a conversation with an index row — else the caller's records alone
  react: 'convOr404(',
  unreact: 'convOr404(',
  storedRecord: 'store.index',                          // a reply's anchor: a KNOWN conversation's stored message
  newestStored: 'store.index',
  propose: 'convFor(',
  proposeReaction: 'convFor(',
  // lane lark-threads: "does the log hold this message" — a boolean, never a served record; asked by the change feed's
  // by-id fetch and rule 22's recheck, each over a conversation with an index row (the groups adapter has no feed and no
  // separate thread listing)
  msgHeld: { callers: ['fetchMissing', 'recheckOne'] },
  fetchMissing: 'store.index.peek(',
  recheckOne: 'store.index.peek(',
  // lane channel-avatars (int212): "is this person in OUR stored conversations" — a boolean, never a served record; the
  // tail is read only for a conversation with an index row (store.index.live() first)
  authorIsOurs: 'store.index',
};
function groupLogCensus(src) {
  const out = { outside: [], groupsRaw: [], channelsUngated: [], channelsUnknown: [], groupsNamed: false, sites: 0 };
  for (const [rel, text] of src) {
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (/^\s*(\/\/|\*)/.test(l) || !LOG_READ_RE.test(l)) return;
      out.sites++;
      if (!STORE_MODULES.has(rel)) { out.outside.push(`${rel}:${i + 1}`); return; }
      if (rel === 'src/channel-store.js') return; // the store's own internals (dedup, countSince over readTail)
      const fn = enclosing(lines, i);
      if (rel === 'src/server/groups-engine.js') { if (!GROUPS_RAW_OK.has(fn.name)) out.groupsRaw.push(`${fn.name}@${i + 1}`); return; }
      const gate = CHANNELS_GATES[fn.name];
      if (!gate) { out.channelsUnknown.push(`${fn.name}@${i + 1}`); return; }
      if (typeof gate === 'object') {
        // a HELPER: every call site of it must sit inside a declared, gated function, the gate before the call
        lines.forEach((cl, ci) => {
          if (ci === fn.start || /^\s*(\/\/|\*)/.test(cl) || !cl.includes(fn.name + '(')) return;
          const caller = enclosing(lines, ci);
          const g = CHANNELS_GATES[caller.name];
          if (!gate.callers.includes(caller.name) || typeof g !== 'string' || !lines.slice(caller.start, ci + 1).join('\n').includes(g)) out.channelsUngated.push(`${fn.name} called from ${caller.name}@${ci + 1} (not a declared gated caller)`);
        });
        return;
      }
      const before = lines.slice(fn.start, i + 1).join('\n');
      if (!before.includes(gate)) out.channelsUngated.push(`${fn.name}@${i + 1} (no ${gate} before the read)`);
    });
    if (iRel(rel) === 'src/server/channels-engine.js') out.groupsNamed = out.groupsNamed || codeLines(text).some(({ l }) => /GROUP_ADAPTER_ID|['"`]groups['"`]/.test(l));
  }
  return out;
}
console.log('§B the group log: every read folded, the clear\'s own, or gated off the groups adapter');
{
  const c = groupLogCensus(sources());
  ok(c.sites >= 15, `${c.sites} store-read call sites in the tree (the census saw the readers)`);
  ok(!c.outside.length, 'no store-log read outside channel-store / groups-engine / channels-engine', c.outside);
  ok(!c.groupsRaw.length, 'groups-engine reads the log raw ONLY inside readFolded (the fold) and originalsOf (the clear\'s own lookup, shared with the held-entry judge)', c.groupsRaw);
  { const ge = read('src/server/groups-engine.js'); ok(/const found = originalsOf\(gid, want\);/.test(ge) && /originalsOf\(gid, vids\)\.values\(\)\]\.filter\(Boolean\)\.map\(witnessOf\)/.test(ge), 'originalsOf has exactly its two callers: clearMessages (cleared copies out) and judgeHeldEntry (witnesses only, never a record kept)'); }
  ok(!c.channelsUnknown.length, 'every channels-engine reader is a declared function with a declared gate', c.channelsUnknown);
  ok(!c.channelsUngated.length, 'every channels-engine reader\'s gate stands before its read', c.channelsUngated);
  ok(!c.groupsNamed, 'channels-engine never names the groups adapter (a group log is not one of its conversations)');
  // the declared functions really read (a dead row would let a renamed reader hide behind it)
  const seen = new Set();
  for (const rel of ['src/server/channels-engine.js', ...ENGINE_FAMILY]) {
    const lines = read(rel).split('\n');
    lines.forEach((l, i) => { if (!/^\s*(\/\/|\*)/.test(l) && LOG_READ_RE.test(l)) seen.add(enclosing(lines, i).name); });
  }
  const callerOnly = new Set(Object.values(CHANNELS_GATES).filter((g) => typeof g === 'object').flatMap((g) => g.callers));
  const dead = Object.keys(CHANNELS_GATES).filter((f) => !seen.has(f) && !callerOnly.has(f));
  ok(!dead.length, 'every declared channels-engine reader still reads (no dead row)', dead);
  // groups-engine's public readers go through the fold: read(), readLog, reportFor's log, the wake's report
  const ge = read('src/server/groups-engine.js');
  ok(/records: readFolded\(rg\.group\.id, opts\)/.test(ge) && /const readLog = \(gid\) => readFolded\(gid/.test(ge) && /RC\.foldClears\(store\.readTail\(A, gid/.test(ge), 'read() and readLog (reports, wakes, unread) go through readFolded = RC.foldClears over the store read');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §C THE READER SURFACES — every route whose handler touches a store, grep-derived, classified
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const ROUTE_RE = /^\s*(?:app|router)\.(get|post|patch|put|delete)\(\s*(['"`])([^'"`]+)\2/;
/** EVERY file of the tree that registers a route — DERIVED (verify r3 on the merged tree: the old hand list — server.js,
 *  agent-routes, jobs-wiring, src/routes/* — did not name src/server/stash-handover.js, whose route reaches the jobs
 *  stash; fifteen route-registering files were outside the census's sight). */
const routeFilesOf = (src) => [...src].filter(([rel, text]) => rel.endsWith('.js') && text.split('\n').some((l) => ROUTE_RE.test(l))).map(([rel]) => rel);
const STORE_TOKENS = [/\btasks\.(?!filter\b|map\b|length\b|some\b|find\b)/, /\buserTodos\./, /\bsessionStatus\./, /\bjm\./, /\ba\.jm\b/, /\bgroupsEngine\(\)/, /\bge\./, /\bgetJobs\b/, /\brecordClear\./, /\bgroupReply\(/, /\bgetTasks\b/, /\bclearAsAgent\(/, /\bgetRecordClear\b/,
  // the two stashes' accessors (the jobs store's held notifications, the ladder's held entries) — a route that reaches
  // them through a helper is a reader of held words (the hand-over route)
  /\b(peekNotifs|drainNotifs|claimNotifs|spillNotifs|restoreNotifs|stashEntries|drainStash|claimStash|restoreStash|stashPeek)\(/];
/** The same-file functions (module-level or the 2-space verbs inside a create()) — name → [start, end) line. */
function fileFunctions(lines) {
  const fns = new Map();
  lines.forEach((l, i) => { const m = /^(?:\s{0,2})(?:async\s+)?function\s+(\w+)\s*\(/.exec(l) || /^(?:\s{0,2})const\s+(\w+)\s*=\s*(?:async\s*)?\(/.exec(l); if (m) fns.set(m[1], i); });
  const end = (i) => { const ind = /^\s*/.exec(lines[i])[0].length; for (let k = i + 1; k < lines.length; k++) { if (/^\s*$/.test(lines[k])) continue; const ind2 = /^\s*/.exec(lines[k])[0].length; if (ind2 <= ind && /^\s*(async\s+)?(function|const|let|app\.|router\.|\}|return)/.test(lines[k])) return k; } return lines.length; };
  return { has: (n) => fns.has(n), text: (n) => lines.slice(fns.get(n), end(fns.get(n))).join('\n') };
}
const CALL_DEPTH = 3;   // handler → verb → its helper → the store (the hand-over: register → handOver → handOverNow → entriesOf)
function routeCensus(src) {
  const rows = [];
  for (const rel of routeFilesOf(src)) {
    const text = src.get(rel);
    const lines = text.split('\n');
    const fns = fileFunctions(lines);
    const regs = [];
    lines.forEach((l, i) => { const m = ROUTE_RE.exec(l); if (m) regs.push({ i, method: m[1].toUpperCase(), path: m[3] }); });
    // a routes MODULE's registration call (`….registerEditorRoutes(app, …)`, lane dc-seams-server) ends the handler above it too
    const bounds = lines.map((l, i) => (ROUTE_RE.test(l) || /\.register\w*\(app\b/.test(l) ? i : -1)).filter((i) => i >= 0);
    const nextBound = (i) => { const b = bounds.find((x) => x > i); return b === undefined ? lines.length : b; };
    for (let k = 0; k < regs.length; k++) {
      // the handler = the text up to the next registration, PLUS every same-file function it calls (a bare `name(` —
      // never a method `x.name(`), to CALL_DEPTH: a store token anywhere in that makes the route a candidate
      const body0 = lines.slice(regs[k].i, nextBound(regs[k].i)).join('\n');
      let body = body0; const seen = new Set(); let frontier = [body0];
      for (let d = 0; d < CALL_DEPTH && frontier.length; d++) {
        const next = [];
        for (const b of frontier) for (const m of b.replace(/\.\.\./g, ' ').matchAll(/(?<![.\w$])(\w+)\(/g)) { const n = m[1]; if (seen.has(n) || !fns.has(n)) continue; seen.add(n); const t = fns.text(n); body += '\n' + t; next.push(t); }   // a spread (`...f(x)`) is a call too
        frontier = next;
      }
      if (STORE_TOKENS.some((t) => t.test(body))) rows.push({ key: `${regs[k].method} ${regs[k].path}`, file: rel, line: regs[k].i + 1 });
    }
  }
  return rows;
}
// THE TABLE: every store-touching route, by class. `reads` / `folded` rows are probed by the walk.
const ROUTES = {
  'GET /api/tasks': 'reads',
  'POST /api/tasks': 'echo',
  'PATCH /api/tasks/:id': 'echo',
  'DELETE /api/tasks/:id': 'writes',
  'POST /api/tasks/:id/bind': 'echo',
  'POST /api/tasks/:id/unbind': 'echo',
  'POST /api/tasks/:id/progress': 'echo',
  'GET /api/tasks/:id/progress': 'reads',               // 2.369.204: a page of the live list + data/task-groups-archive/ (the walk plants an archived line and reads it back cleared)
  'POST /api/tasks/:id/export': 'exception: the repo task file — a ONE-SHOT export to a path the user picks (last 30 notes, no detail); the product does not track the file, so a later clear cannot follow it (the user deletes or re-exports it)',
  'POST /api/tasks/import': 'writes',                   // declared: a file the user holds re-seeds an EMPTY group's log; an older file restores its own notes (a restore, not a leak)
  'GET /api/user-todos': 'reads',
  'POST /api/user-todos/:id': 'echo',
  'POST /api/machine-mounts/:id/remount': 'meta',
  'POST /api/hosts/:id/allow-exit': 'meta',
  'POST /api/agent/user-todo': 'reads',                 // list / show (+ add / resolve / clear = writes)
  'GET /api/session-status': 'reads',
  'POST /api/session-status': 'echo',
  'POST /api/agent/session-status': 'reads',            // show (+ set / clear = echo)
  'GET /api/session-status/history': 'reads',
  'GET /api/agent/task-context': 'reads',               // the SessionStart injection (Activity lines, the jobs digest, the held job notifications)
  'GET /api/agent/prompt-context': 'reads',             // the per-turn injection (Activity deltas, the jobs updates ring, the override notices, the group reports — folded)
  'GET /api/agent/stop-check': 'meta',                  // the Stop nudge: fixed words + the status entry's TIME
  'GET /api/agent/task': 'reads',
  'POST /api/agent/task-progress': 'echo',
  'POST /api/agent/task/progress-redact': 'writes',
  'POST /api/agent/task-backlog': 'meta',               // the backlog is not one of the five stores
  'POST /api/agent/group-admin': 'writes',              // audit entries into the Activity log; answers a brief (no progress)
  'GET /api/agent/msg/peers': 'reads',                  // another session's current status reason
  'POST /api/agent/msg/send': 'writes',
  'POST /api/agent/msg/dispatch': 'writes',            // lane worker-dispatch: `vibespace-msg dispatch` = send --wake --compact-first (the same post as send; the compaction types /compact, no record's text) — classified at the 2.369.202 integration
  'GET /api/agent/msg/groups': 'meta',                  // names + counts; no lastText
  'GET /api/agent/msg/read': 'folded',
  'POST /api/agent/msg/group': 'writes',
  'POST /api/agent/channels/request': 'meta',
  'GET /api/agent/jobs-docs': 'meta',
  'POST /api/agent/jobs': 'echo',
  'GET /api/agent/jobs': 'reads',
  'GET /api/agent/jobs/:ref': 'reads',
  'POST /api/agent/jobs/:ref/:act': 'echo',
  'GET /api/jobs': 'reads',
  'POST /api/jobs': 'echo',
  'GET /api/jobs/:id': 'reads',
  'POST /api/jobs/seen': 'meta',
  'POST /api/jobs/:id/:act': 'echo',
  'GET /api/jobs-escapes': 'meta',
  'POST /api/channels/reach-requests/:id/:verdict': 'meta',
  'GET /api/channel-groups': 'reads',                   // lastText (the sentence when the newest record was cleared)
  'GET /api/channel-groups/roster': 'meta',
  'GET /api/channel-groups/:id/messages': 'folded',
  'POST /api/channel-groups': 'echo',
  'POST /api/channel-groups/:id/:verb': 'echo',        // post answers the record as posted (the owner's own words)
  'GET /api/config/export-info': 'meta',
  'POST /api/config/export': 'reads',                   // the bundle is rendered from the live store; ONCE DOWNLOADED it is the user's own snapshot (declared: re-importing an older one restores its notes)
  'POST /api/config/import': 'writes',
  'POST /api/records/clear': 'writes',
  'POST /api/records/clear-many': 'writes',
  'POST /api/user-todos/:id/reply': 'reads',            // the quote block is built from the store record (the walk types a reply after the clear)
  'POST /api/user-todos/resolve-many': 'meta',
  'GET /api/user-todos/:id': 'reads',
  // ── verify r3 on the merged tree: the rows the DERIVED file list + the call closure add ──
  'POST /api/sessions/:id/stash/hand-over': 'writes',  // src/server/stash-handover.js: reads BOTH stashes (peekNotifs / stashEntries) and delivers them as ONE turn; answers counts; a hand-over after a clear carries the sentence (the walk hands over after its clear)
  'GET /api/agent/channels/list': 'meta',              // msgCaller: the caller's identity + its group ids (jobByToken / groupsForSession) — adapter conversations, never a store's text
  'GET /api/agent/channels/read': 'meta',
  'GET /api/agent/channels/attachment': 'meta',        // lane channel-attach-read: an attachment's bytes + who sent it where (the engine's attachment(); like read)
  'POST /api/agent/channels/:adapterId/:convId/refresh': 'meta',
  'POST /api/agent/channels/reply': 'meta',
  'POST /api/agent/channels/compose': 'meta',
  'POST /api/agent/channels/proposals/:id/withdraw': 'meta',
  'GET /api/agent/channels/search': 'meta',
  'GET /api/agent/channels/status': 'meta',
  'GET /api/agent/docs/:topic': 'meta',                // serveAgentDoc: jobByToken (a jbt_ caller's identity) — the manual text
  'POST /api/agent/pages/publish': 'meta',             // pageAuth: jobByToken
  'POST /api/agent/pages/unpublish': 'meta',           // lane agent-cli-fixes (B-f694): pageAuth: jobByToken — takes a page down; answers its path + name
  'POST /api/agent/pages/visibility': 'meta',
  'GET /api/agent/pages': 'meta',
  'POST /api/channels/:adapterId/:convId/propose': 'meta',   // wakeGuards / ownerPacer: the groups engine's pacer (a wake floor), no record
  'POST /api/channels/:adapterId/:convId/send': 'meta',
  'POST /api/channels/outbox/:id/approve': 'meta',
  'POST /api/channels/outbox/:id/reject': 'meta',
  'DELETE /api/mounts/:id': 'meta',                    // mounts-plugins-wiring: the browser keeper's deps (getTasks → group ids / browserProfileId) sit lexically after this registration
  // ── the .197 integration: the other lanes' routes the derived census now sees ──
  'POST /api/ports/kill-orphan': 'meta',               // server.js: ends a port's orphan pid; the store tokens are lane-pairing's ExitProxyManager construction (userTodos / tasks.groupsForSession) that sits lexically after this registration
  // B-2198 the raw API pass-through: the vendor's answer (never a store's text; belted at its door), the caller's own
  // credentials / docs / proposal / audit lines — no conversation store is read
  'POST /api/agent/channels/api': 'meta', 'GET /api/agent/channels/api/creds': 'meta', 'GET /api/agent/channels/api/docs': 'meta',
  'GET /api/agent/channels/api/proposals/:id': 'meta', 'GET /api/agent/channels/api/log': 'meta',
  'POST /api/agent/channels/react': 'meta',            // lane channel-threads: msgCaller (the caller's identity + group ids) → a reaction PROPOSAL; no store's text
  'POST /api/agent/channels/:adapterId/:convId/thread/:msg/refresh': 'meta',   // lane channel-threads: msgCaller → the thread walk; no store's text
  'GET /api/hosts/:id/exit-access': 'meta',            // lane-pairing: the exit lists + the roster (session names, Task Group ids + titles) — no record of the five kinds
  // ── lane design-core: the Design window's agent routes — agentCaller = jobByToken (a jbt_ caller's identity), the answer a design folder's files + the registry ──
  'POST /api/agent/design/register': 'meta',
  'POST /api/agent/design/changed': 'meta',
  'POST /api/agent/design/check': 'meta',
  'POST /api/agent/design/publish': 'meta',
  'GET /api/agent/designs': 'meta',
  // lane design-ask: the same agentCaller — `ask` puts the agent's OWN questions on its registry row, `preview` answers one artboard of the folder; no record of the five kinds
  'POST /api/agent/design/ask': 'meta',
  'POST /api/agent/design/preview': 'meta',
  'GET /api/agent/design/preview': 'meta',
  'GET /api/agent/design/systems': 'meta', 'GET /api/agent/design/system': 'meta', // lane design-systems-home: the design systems' names (belted) + ONE system's tokens.css — registry rows and a folder's file, no record
  // ── the 2.369.202 integration: lane jobs-browser's job principal — agentFacts → jobAgentFacts / refuseAgentBearer ask the
  //    jobs store jobByToken (a jbt_ caller's identity, as the other agent routes do), never a record's text ──
  'GET /api/agent/browser/profiles': 'meta',
  'POST /api/agent/browser/use': 'meta',
  'POST /api/agent/browser/resolve': 'meta',
  'POST /api/agent/browser/resume': 'meta',
  'POST /api/agent/browser/tab': 'meta',
  'POST /api/agent/browser/new-child': 'meta',
  'POST /api/agent/browser/audit': 'meta',
  'GET /api/agent/browser/dialog': 'meta',
  'POST /api/agent/browser/dialog': 'meta',
  'POST /api/agent/browser/direct': 'meta',
  'POST /api/agent/browser/passkey': 'meta', // lane browser-passkey: the page's passkey wait — status / cancel through the watch
  'POST /api/agent/browser/site-reset': 'meta',
  'GET /api/agent/browser/providers': 'meta',
  'POST /api/agent/browser/new': 'meta',
  'POST /api/agent/browser/detach': 'meta',
  'GET /api/agent/browser/status': 'meta',
  'POST /api/agent/browser/pin': 'meta',
  'GET /api/agent/browser/backend': 'meta',
  'POST /api/agent/browser/backend': 'meta',
  'POST /api/agent/browser/blocked': 'meta',
  'POST /api/agent/browser/site-hint': 'meta',
  'POST /api/browser/cli/install': 'meta',             // refuseAgentBearer: an agent's token (a jbt_ through jobByToken) refused by name before anything runs
  'GET /api/browser/session/:sessionId': 'exception: a job window\'s helper row names the JOB, its name read live off the jobs store at each GET (lane jobs-browser) — a cleared job (clearedAt) answers its id, so the clear is honoured at the read and nothing keeps the old name; the walk boots no browser keeper to list a job\'s window',
  'POST /api/agent/channels/watch': 'meta',            // lane channel-agent-watch: agentSession (the caller's identity + its groups) → its OWN watcher row / a wake request; no record's text
  'POST /api/agent/channels/unwatch': 'meta',
};
const CLASSES = new Set(['reads', 'folded', 'echo', 'writes', 'meta']);
console.log('§C the reader surfaces: every store-touching route is classified, every reader probed by the walk');
{
  const files = routeFilesOf(sources());
  ok(files.length >= 30 && files.includes('src/server/stash-handover.js') && files.includes('src/server/mounts-plugins-wiring.js') && files.includes('src/agent-routes.js'), `${files.length} route-registering files DERIVED from the tree (the old hand list named 4 + src/routes/*; stash-handover.js among the ${files.length})`, files);
  const rows = routeCensus(sources());
  const keys = new Set(rows.map((r) => r.key));
  const unknown = rows.filter((r) => !(r.key in ROUTES)).map((r) => `${r.key} (${r.file}:${r.line})`);
  const dead = Object.keys(ROUTES).filter((k) => !keys.has(k));
  ok(rows.length >= 75, `${rows.length} store-touching routes derived from the tree (through the call closure, depth ${CALL_DEPTH})`);
  ok(!unknown.length, 'every store-touching route is in the table', unknown);
  ok(!dead.length, 'every table row is still a route (no dead row)', dead);
  ok(Object.values(ROUTES).every((v) => CLASSES.has(v) || /^exception: .{40,}/.test(v)), 'every class is one of reads / folded / echo / writes / meta, or an exception with a reason of 40+ characters');
  // THE WALK exercises every reader: its probe list names each `reads` / `folded` route's path
  const walkSrc = read('scripts/test-record-clear-walk.mjs');
  const probed = (key) => { const p = key.split(' ')[1]; const re = new RegExp(p.split('/').map((seg) => (seg.startsWith(':') ? '[^/\'"`]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')); return re.test(walkSrc); };
  const unprobed = Object.entries(ROUTES).filter(([, v]) => v === 'reads' || v === 'folded').filter(([k]) => !probed(k)).map(([k]) => k);
  ok(!unprobed.length, `every reads / folded route is exercised by test-record-clear-walk (${Object.values(ROUTES).filter((v) => v === 'reads' || v === 'folded').length} readers)`, unprobed);
  console.log(`  · census rows: ${rows.length} routes — ${Object.values(ROUTES).filter((v) => v === 'reads').length} reads · ${Object.values(ROUTES).filter((v) => v === 'folded').length} folded · ${Object.values(ROUTES).filter((v) => v === 'echo').length} echo · ${Object.values(ROUTES).filter((v) => v === 'writes').length} writes · ${Object.values(ROUTES).filter((v) => v === 'meta').length} meta · ${Object.values(ROUTES).filter((v) => /^exception/.test(v)).length} exception`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §D THE BROADCASTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const BROADCASTS = [
  { type: 'tasks-updated', file: 'server.js', how: 'the whole list (in place)' },
  { type: 'user-todos-updated', file: 'server.js', how: 'the snapshot (open items whole, resolved previews derived per snapshot)' },
  { type: 'session-status-updated', file: 'server.js', how: 'the current records (the history is fetched)' },
  { type: 'jobs-updated', file: 'src/server/jobs-wiring.js', how: 'a dirty signal + the held digest (counts, kinds — no text)' },
  { type: 'channel-groups-updated', file: 'src/server/groups-engine.js', how: 'the group list (lastText), fresh records as posted, the cleared records as cleared' },
];
console.log('§D the broadcasts');
{
  const walkSrc = read('scripts/test-record-clear-walk.mjs');
  for (const b of BROADCASTS) {
    const src = read(b.file);
    ok(src.includes(`'${b.type}'`), `${b.type} is built in ${b.file} — ${b.how}`);
  }
  ok(/frames\.slice\(judgeFrames\)/.test(walkSrc) && /carries no word/.test(walkSrc), 'the walk captures every frame on a live client and judges them after the clear');
  // the per-session peer card (`msg`) is a delivery, not a store read: the words ride it AT DELIVERY (transcript class, declared)
  ok(read('src/server/conversation-deliver.js').includes('emitPeerCard'), 'the peer card is emitted by the delivery ladder at delivery time (declared: transcript class)');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §E THE CLIs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§E the CLIs reach the stores through census routes only');
{
  const routeKeys = new Set(Object.keys(ROUTES).map((k) => k.split(' ')[1]));
  const pathOf = (p) => p.replace(/\?.*$/, '');
  const matches = (p) => [...routeKeys].some((r) => { const re = new RegExp('^' + r.replace(/:\w+/g, '[^/]+') + '$'); return re.test(pathOf(p)); });
  for (const rel of CLI_FILES) {
    const text = read(rel);
    const paths = [...new Set((text.match(/['"`](\/api\/[a-z0-9\-/:${}]+)/gi) || []).map((m) => m.slice(1)))].map((p) => p.replace(/\$\{[^}]+\}/g, 'x'));
    const store = paths.filter((p) => /\/api\/agent\/(task|user-todo|session-status|jobs|msg)\b/.test(p));
    const off = store.filter((p) => !matches(p) && !matches(p.replace(/\/x$/, '')));
    if (rel.endsWith('vibespace-channels')) ok(store.length === 0, `${rel}: reaches none of the five stores (an adapter conversation is not a group log)`, store);
    else ok(store.length > 0 && !off.length, `${rel}: ${store.length} store paths, all census routes`, off);
  }
  ok(!CLI_FILES.some((rel) => /readFileSync\([^)]*(jobs|task-groups|user-todos|session-status|groups)\.json/.test(read(rel))), 'no shipped CLI reads a store file off disk');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §F THE DERIVED COPIES the doors rewrite (pins) + the declared exceptions
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const HOLDERS = [
  // [holder, file, the statement that rewrites / feeds it]
  ['TASK.md in every context folder', 'src/task-groups.js', 'this._syncTaskMd(t)'],
  ['the Activity diff snapshot holds no note text', 'src/task-groups.js', 'lastProgressAt:'],
  ['the For-you resolved preview is derived per snapshot', 'src/user-todos.js', 'resolved.map(previewOf)'],
  ['the status CURRENT record follows its history entry', 'src/session-status.js', 'clearHistory('],
  ['the status-override notice queued for the next turn', 'src/session-status.js', 'pendingNotices'],
  ['the jobs viewers\' event ring', 'src/jobs.js', 'e.name = CLEARED_TEXT;'],
  ['the jobs held notifications (data/job-notifications.json)', 'src/jobs.js', 'n.text = CLEARED_TEXT;'],
  ['the jobs spill files (data/job-notifications-read/*.md)', 'src/jobs.js', 'this._rewriteSpills(gone);'],
  ['the delivery ladder\'s stash (data/msg-stash.json) — a job\'s entries', 'src/jobs.js', 'this.d.redactStash('],
  ['the delivery ladder\'s stash — a group wake\'s report lines', 'src/server/groups-engine.js', 'deliver.redactStash('],
  // the lane-redact merge onto 2.369.196: master's stash hand-over keeps a delivered hand-over's ORIGINALS + frame for 24 h
  // (data/stash-handover.json) and restores them when the frame comes back — a copy the ladder's door now reaches
  ['the stash hand-over memory (data/stash-handover.json) — a delivered hand-over\'s originals + frame', 'src/server/stash-handover.js', 'function redactDelivered('],
  ['…a touched record keeps only its frame\'s digest', 'src/server/stash-handover.js', "if (typeof rec.text === 'string') { rec.textSha = frameSha(rec.text); delete rec.text; }"],
  ['…asked by the ladder\'s door after its own queue', 'src/server/conversation-deliver.js', 'for (const fn of redactors) { try { fn(match, scope || {}); }'],
  ['…registered on the ladder at boot', 'server.js', 'deliver.registerRedactor((match, scope) => stashView.redactDelivered(match, scope));'],
  ['…the jobs door names its ids (a jobs-store original has no ladder name)', 'src/jobs.js', '{ jobIds: [...gone] }'],
  // verify r3 on the merged tree: a clear racing a hand-over in flight (the record written after the delivery judges its own
  // entries), a spent record's frame naming a job as a whole token (the ladder form), the agent caller's ONE fork predicate
  ['…a clear that lands while a hand-over is in flight: the record written after the delivery judges its entries', 'src/server/stash-handover.js', 'if (readsCleared(tookMsg, tookJobs)) {'],
  ['…a spent record\'s frame names a job as a whole token (the ladder form: `(jb-…):`, `poll jb-….`)', 'src/server/stash-handover.js', 'if (namesJob(rec.text, id)) { hit = true; break; }'],
  ['the agent verbs\' caller asks the ONE fork predicate and owns records under its addressable id', 'src/agent-routes.js', 'conversationId: addressableId(s), pendingFork: liveForkPending(s) };'],
  // verify r4: a frame the wrapper hands BACK after the clear (a queued notification / wake dropped by Stop or removed from
  // the codex queue — an unbounded window, past a restart) re-entered the ladder's stash WHOLE; now EVERY entry is judged
  // at its write by the stores that own its words (store-backed, never a memory of past clears)
  ['a frame handed back after the clear: every entry is judged at the ladder\'s write', 'src/server/conversation-deliver.js', 'if (judgeEntry(entry)) log('],
  ['…a restore is a write, judged too', 'src/server/conversation-deliver.js', 'delete e.ho; judgeEntry(e);'],
  ['…the jobs engine\'s judge: a cleared job named by id, the frame not yet reading the sentence', 'src/jobs.js', 'judgeHeldEntry(e) {'],
  ['…registered on the ladder by the jobs wiring', 'src/server/jobs-wiring.js', 'deliver.registerStashJudge((e) => jm.judgeHeldEntry(e));'],
  ['…a job cleared AGAIN is stamped (reclearedAt): the judge fails closed on its sentence-reading frames, the in-flight rule reads the latest clear', 'src/jobs.js', 'if (j.clearedAt) { j.reclearedAt = at; liveChanged = true; }'],
  ['…the groups engine\'s judge: the group a report names + its cleared index, witnesses only', 'src/server/groups-engine.js', 'deliver.registerStashJudge(judgeHeldEntry);'],
  // verify r4: a device's own copy — a For-you item's arrival toast kept its words in localStorage for the Notifications tab
  ['a record\'s arrival toast in the device\'s toast history keeps the head + a ref (the tab words it live)', 'src/lib/utils.js', "_recordToast(history && typeof history.m === 'string' ? history.m : message, type, history && history.ref);"],
  ['…older builds\' entries cut back at every load', 'src/lib/user-todos-panel.js', "stripLegacyRecordToasts([t('Added to For you'), 'Added to For you']);"],
  ['the job\'s ask panel (interaction.pending)', 'src/record-clear.js', "['interaction.pending', 'drop']"],
  ['a covered run\'s finalize never re-stamps its last line', 'src/jobs.js', 'run.lastLine = job.clearedAt && !((run.startedAt || 0) > job.clearedAt) ? null'],
  ['a covered run\'s log tail is withheld and says so', 'src/jobs.js', 'out.logWithheld = true'],
  ['the job\'s For-you items (the cascade)', 'src/server/record-clear.js', 'userTodos.idsWhere((i) => i.jobId && gone.has(i.jobId))'],
  ['a published service\'s port-forward label (data/port-forwards.json, the Ports panel)', 'src/jobs.js', "label: 'service: ' + CLEARED_TEXT"],
  ['the group index + lastText', 'src/server/groups-engine.js', 'g.lastText = RC.CLEARED_TEXT; g.lastCleared = true;'],
  ['the group log fold every reader applies', 'src/record-clear.js', 'function foldClears('],
];
// verify r7: the modules whose `error` / `why` sentences reach an owner's surface (a toast) — none may interpolate a record's text
const SENTENCE_FILES = ['src/jobs.js', 'src/server/jobs-wiring.js', 'src/task-groups.js', 'src/user-todos.js', 'src/session-status.js', 'src/server/groups-engine.js', 'src/server/record-clear.js', 'src/routes/records-clear.js', 'src/routes/user-todos-reply.js', 'server.js', 'src/agent-routes.js'];
const RECORD_IN_SENTENCE = /\b(error|why|message)\s*:\s*`[^`]*\$\{\s*(job|j|item|it|rec|entry|p|st|h|msg)\.(name|note|text|reason|detail|lastText|lastLine)\b/;
const sentenceHits = (srcs) => { const out = []; for (const rel of SENTENCE_FILES) codeLines(srcs.get(rel) || '').forEach(({ i, l }) => { if (RECORD_IN_SENTENCE.test(l)) out.push(`${rel}:${i}`); }); return out; };
const EXCEPTIONS = [
  // append-only bytes on disk (declared by the design; no route serves them — §A/§B/§C above)
  ['data/channels/msgs/groups/<gid>.ndjson', 'the group log is append-only (channel-store invariant 1): the ORIGINAL line stays; every reader folds the replacement record'],
  ['data/job-logs/<id>/<run>/current.log', 'a run\'s log is the process\'s own output, kept until the 14-day GC; every snapshot withholds it for a covered run and says so'],
  // words already delivered
  ['agent transcripts / the CLI\'s stdin', 'what a turn was injected with, a wake delivered, a reply quoted — delivered words are the harness\'s record, out of the clear\'s reach by design — and SAID where the owner decides: the confirm dialog\'s .rc-copies line (verify r4)'],
  ['peer cards in a session window (`msg` frames)', 'emitted at delivery time from the delivery ladder; the chat view is a transcript surface'],
  ['incident bundles (data/incidents/*)', 'a frozen scene copies terminal / transcript tails verbatim (src/incident.js); the owner made the capture'],
  // the user's own files
  ['the repo task file (POST /api/tasks/:id/export)', 'a one-shot file written to a path the user picks (last 30 notes, no detail); the product does not track it, so no later clear can follow it'],
  ['a config bundle exported BEFORE the clear', 'the user\'s own snapshot; importing it restores what it holds (a restore, not a leak); a bundle exported after the clear carries the sentence + stamp and re-imports cleared'],
  // verify r4 (declared, LOW): the context folder's TASK.md the server could not write at the clear, and the copies agents make
  ['TASK.md in a context folder the server cannot write at the clear (its storage disconnected / the folder unwritable)', 'a disconnected storage is rewritten by syncAllContextMd when it reconnects; an unwritable folder never is (TASK.md writes never fail a task op) — the store and every reader are cleared'],
  ['.vibespace/TASK.md committed into a repo, and an agent\'s own notes in a context folder', 'a generated file an agent committed (a context folder inside a git work tree; none found in 46 agent worktrees on the dev machine, 2026-09-28) or a file an agent wrote itself — the agent\'s act, the transcript class'],
  ['TASK.md at a context folder the group no longer uses (contextDir changed / group removed)', 'a generated file the product stopped tracking with the change; the current folder\'s TASK.md is rewritten on every save'],
  // producers' own words
  ['a producer\'s own copy of a For-you headline (channels failureItem.text, login-expiry.json items[].text)', 'the producer\'s template + a label (an account, an adapter), not a record\'s words; a cleared item is no longer auto-retracted by text (the owner ticks it)'],
  // verify r8 ③ RETIRED the journal exception ("a job's name at adopt / orphan / publish time, a ladder entry's label when the
  // cap evicts it"): the server's console ring rides every incident captured later — the journal names a job by its id, an
  // evicted entry by its kind (census §I, the `journal` sink)
  ['a session\'s live vcs branch (session._vcs, the active-sessions frame, session-meta)', 'a fact about the machine (the checked-out branch), not the history row the clear replaced'],
  // verify r7 (the store inventory): the codex wrapper's mirror of its thread's queue
  ['a codex thread\'s queue as its wrapper mirrors it (data/session-buffers/<id>.json meta.queue, the buffer\'s queue_changed lines, the chat window\'s queue strip)', 'a notification or a wake the rpc-queue lane HANDED to the harness (ok:true — delivered, the transcript class): it runs into the agent\'s next turn; the owner\'s ✕ on the row hands it back to the ladder, where every write is judged (r4) and a cleared record\'s words come back as the sentence'],
  // verify r7 (held, declared): the program a job runs
  ['a job\'s COMMAND (cmd.argv / cwd — `vibespace-job show`, GET /api/jobs/:id)', 'the program, not a record\'s words (SHAPES.job keeps it by design; the Background Work panel never draws it): a clear keeps it, ✕ removes the job — proposal: the confirm dialog could say so for a job'],
  ['the in-memory identical-message floors (agent-routes _msgRate, the jobs engine\'s _notifyRate)', 'a DIGEST of the last text per pair / conversation, COMPARED for the identical-text floor and never served (verify r9 ⑥: they kept the TEXT, pruned only past 500 entries — the "forgotten after ten minutes" this row said was untrue; census §I pins the digest)'],
];
console.log('§F the derived copies the doors rewrite (pinned) and the declared exceptions');
{
  for (const [holder, file, stmt] of HOLDERS) ok(read(file).includes(stmt), `${holder} — ${file} has \`${stmt.slice(0, 60)}\``);
  // THE DOORS have exactly two kinds of caller: the owner module itself and the ONE entry point (src/server/record-clear.js) —
  // a device op, a route or a producer calling a door directly would be a second rule (the agentd op table has none)
  const DOORS = ['clearProgress(', 'clearItems(', 'clearHistory(', 'clearJobs(', 'clearMessages('];
  const OWNERS = { 'clearProgress(': 'src/task-groups.js', 'clearItems(': 'src/user-todos.js', 'clearHistory(': 'src/session-status.js', 'clearJobs(': 'src/jobs.js', 'clearMessages(': 'src/server/groups-engine.js' };
  for (const d of DOORS) {
    const callers = [...sources()].filter(([rel, text]) => codeLines(text).some(({ l }) => l.includes(d))).map(([rel]) => rel);
    ok(callers.every((rel) => rel === OWNERS[d] || rel === 'src/server/record-clear.js') && callers.includes('src/server/record-clear.js'), `the door ${d}) is called only by its owner and the ONE entry point`, callers);
  }
  const orchCallers = [...sources()].filter(([rel, text]) => codeLines(text).some(({ l }) => /\b(recordClear|getRecordClear\(\)|rc)\.(clear|clearMany)\(/.test(l))).map(([rel]) => rel);
  ok(orchCallers.every((rel) => ['src/routes/records-clear.js', 'src/agent-routes.js'].includes(rel)) && orchCallers.length === 2, 'the ONE entry point is used by the owner routes and the agent verbs only (no device op, no other route)', orchCallers);
  // verify r7: A REFUSAL SENTENCE NEVER CARRIES A RECORD'S WORDS — a surface toasts a route's `error` and the device's toast
  // history (the For-you Notifications tab) keeps EVERY toast: a double-click on a failed job's Start was refused as
  // `<job name> is already running`, and the name outlived the job's clear there (reproduced in chrome, r7/hooks/toast.mjs)
  { const hits = sentenceHits(sources()); ok(!hits.length && SENTENCE_FILES.every((f) => sources().has(f)), `no refusal sentence the store modules answer interpolates a record's text field (${SENTENCE_FILES.length} files: a job's name / note, an item's text, a reason, a note, a message's text)`, hits); }
  ok(EXCEPTIONS.every(([, why]) => why.length >= 40), `${EXCEPTIONS.length} declared exceptions, each with a reason`);
  for (const [what, why] of EXCEPTIONS) console.log(`  · exception: ${what} — ${why}`);
  // the two append-only holders are exactly what the walk finds still holding a word on disk
  const walkSrc = read('scripts/test-record-clear-walk.mjs');
  ok(walkSrc.includes('data\\/channels\\/msgs\\/groups\\/') && walkSrc.includes('data\\/job-logs\\/'), 'the walk\'s on-disk grep admits exactly the two append-only holders');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §G CONTROLS — a raw reader added to a patched copy makes the census go RED on its own leg
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§G controls: one added raw reader per class, each RED on its leg');
{
  // 1. a route reading the group log by path (routes/channels.js) — §B "no read outside the store modules"
  const rel1 = 'src/routes/channels.js';
  const src1 = read(rel1);
  const anchor1 = "router.get('/api/channel-groups/:id/messages'";
  ok(src1.includes(anchor1), 'control 1 anchor present');
  const mut1 = MUT.write(rel1, src1.replace(anchor1, "router.get('/api/channel-groups/:id/raw', (req, res) => { const store = groupsEngine().store; res.json({ records: store.readTail('groups', req.params.id, { limit: 50 }) }); });\n" + anchor1), 'raw-group-route');
  const c1 = groupLogCensus(sources({ [rel1]: mut1 }));
  ok(c1.outside.length === 1 && c1.outside[0].startsWith(rel1), 'CONTROL 1: a route reading the group log by path is RED under §B (a read outside the store modules)', c1.outside);
  // 2. the group window's read without the fold (groups-engine.js) — §B "raw only inside readFolded / clearMessages"
  const rel2 = 'src/server/groups-engine.js';
  const src2 = read(rel2);
  const anchor2 = 'records: readFolded(rg.group.id, opts)';
  ok(src2.includes(anchor2), 'control 2 anchor present');
  const mut2 = MUT.write(rel2, src2.replace(anchor2, 'records: store.readTail(A, rg.group.id, opts)'), 'read-unfolded');
  const c2 = groupLogCensus(sources({ [rel2]: mut2 }));
  ok(c2.groupsRaw.length === 1 && /^read@/.test(c2.groupsRaw[0]), 'CONTROL 2: read() served without the fold is RED under §B (a raw read outside readFolded / originalsOf)', c2.groupsRaw);
  // 3. a route reading jobs.json off disk (jobs-wiring.js) — §A ownership
  const rel3 = 'src/server/jobs-wiring.js';
  const src3 = read(rel3);
  const anchor3 = "app.get('/api/jobs', (req, res) => {";
  ok(src3.includes(anchor3), 'control 3 anchor present');
  const mut3 = MUT.write(rel3, src3.replace(anchor3, "app.get('/api/jobs/raw', (req, res) => { res.type('json').send(require('fs').readFileSync(path.join(dataDir, 'jobs.json'), 'utf8')); });\n  " + anchor3), 'raw-jobs-file');
  const c3 = fileOwnership(sources({ [rel3]: mut3 })).find((r) => r.token === "'jobs.json'");
  ok(c3.strangers.length === 1 && c3.strangers[0] === rel3, 'CONTROL 3: a route reading jobs.json off disk is RED under §A (a stranger names the store file)', c3);
  // 4. an agent route returning the Activity log under a new path (agent-routes.js) — §C "every store-touching route is in the table"
  const rel4 = 'src/agent-routes.js';
  const src4 = read(rel4);
  const anchor4 = "app.get('/api/agent/task', ";
  ok(src4.includes(anchor4), 'control 4 anchor present');
  const mut4 = MUT.write(rel4, src4.replace(anchor4, "app.get('/api/agent/task-raw', (req, res) => { const hit = agentSession(req, res); if (!hit) return; res.json({ tasks: tasks.list() }); });\n" + anchor4), 'raw-task-route');
  const rows4 = routeCensus(sources({ [rel4]: mut4 }));
  const unknown4 = rows4.filter((r) => !(r.key in ROUTES)).map((r) => r.key);
  ok(unknown4.length === 1 && unknown4[0] === 'GET /api/agent/task-raw', 'CONTROL 4: a new route serving the Activity log is RED under §C (a store-touching route the table does not name)', unknown4);
  // 5. a route in a file the OLD hand list never named, reaching the jobs stash three calls deep through a same-file
  //    helper (stash-handover.js: a GET of both stashes' entries) — §C "every store-touching route is in the table",
  //    seen only because the file list is derived and the handler's body is closed over the helpers it calls
  const rel5 = 'src/server/stash-handover.js';
  const src5 = read(rel5);
  const anchor5 = "    app.post('/api/sessions/:id/stash/hand-over', async (req, res) => {";
  ok(src5.includes(anchor5), 'control 5 anchor present');
  const mut5 = MUT.write(rel5, src5.replace(anchor5, "    app.get('/api/sessions/:id/stash/raw', (req, res) => { const s = activeSessions.get(String(req.params.id)); res.json(entriesOf(cidOf(s))); });\n" + anchor5), 'raw-stash-route');
  const rows5 = routeCensus(sources({ [rel5]: mut5 }));
  const unknown5 = rows5.filter((r) => !(r.key in ROUTES)).map((r) => r.key);
  ok(unknown5.length === 1 && unknown5[0] === 'GET /api/sessions/:id/stash/raw', 'CONTROL 5: a route in a file outside the old hand list, reading both stashes through a helper, is RED under §C', unknown5);
  const oldList = ['server.js', 'src/agent-routes.js', 'src/server/jobs-wiring.js', ...fs.readdirSync(path.join(ROOT, 'src/routes')).map((f) => 'src/routes/' + f)];
  ok(!oldList.includes(rel5), '…and the old hand list would never have read that file (the derived list is what sees it)');
    // 6. verify r7: a refusal sentence naming the job again (the pre-r7 jobs.js) — RED under §F's sentence census
  const rel6 = 'src/jobs.js', src6 = read(rel6), a6 = "return { error: `${job.id} is already running` };";
  ok(src6.split(a6).length === 2, 'control 6 anchor present once');
  const mut6 = MUT.write(rel6, src6.replace(a6, "return { error: `${job.name} is already running` };"), 'refusal-names-job');
  const h6 = sentenceHits(sources({ [rel6]: mut6 }));
  ok(h6.length === 1 && h6[0].startsWith(rel6 + ':'), 'CONTROL 6 (verify r7): a refusal sentence naming the job (`${job.name} is already running`) is RED under §F — the device toast history would keep the name past the clear', h6);
for (const row of copiesCensus(MUT.files, MUT.dir, ROOT, { minCopies: 6, label: '§G ' })) ok(row.pass, row.name, row.detail);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// §H THE CLIENT (verify r5 — four rounds found a copy one layer further out each time; the last layer is the page).
// Grep-derived over src/lib/** + src/client.js and judged against ONE table per question; the chrome half is
// test-record-clear-client (heavy): a sentinel in each of the five stores, every surface open on two clients, the clear,
// then the DOM + every storage + the JS heap + data/layouts.json + an incident captured after the clear.
//   H1 STORAGE   every browser storage write (localStorage / sessionStorage) by its key, classified; NO IndexedDB,
//                CacheStorage, service worker, cookie, window.name or URL write exists — and the ONE key that can name a
//                record keeps a {head, ref}, never its words (the r4 toast history)
//   H2 TITLES    every window title that reads a record's words belongs to a window whose LAYOUT RECORD keeps a generic
//                title (routes/persistence.js WORDLESS_TITLES — a title is persisted, relayed and snapshotted)
//   H3 THE BELT  every text field of the five kinds a surface reads (an Activity note, a For-you item's text, a status
//                reason, a job's name, a group message's text / last line) is read through the cleared-aware words on the
//                same line — or DECLARED here with the reason it cannot carry a cleared record's words
//   H4 CACHES    every long-lived Map / Set a surface keeps (module scope, the surface's own scope, a state field) is
//                declared with what it holds — a new cache of records is RED until it says how a clear reaches it
//   H5 REPAINT   each surface re-renders from the CURRENT record on its store's broadcast — the statement pinned
//   H6 CONTROLS  patched copies (a new storage key holding words · a title reading words on a window whose record
//                keeps it · a keyed renderer capturing `{ text: p.note }` at add time · a repaint that ignores the clear ·
//                verify r6: each r5 guard repaint a §H5 label claims, reverted — the row, and only it, goes red · each order
//                guard removed, and a new unguarded painter — H7 red on exactly that site)
//   H1b SERVER   (verify r6) every client write to the server's user state classified by key; the fold map proved wordless
//   H1c STORES   (verify r7) every SERVER-PERSISTED store a client's state reaches — SyncStores, persistence files, export
//                sections, telemetry / incidents / the opslog, the per-session sidecars — named with its gate or its reason
//   H2b RECORDS  (verify r7) the page's OWN layout records (presets, a desktop's cache, the last autosave): ONE wordless-title
//                table, the client's ONE capture applies it, every holder classified by where its record comes from
//   H7 ORDER     (verify r6) every client GET of a five-store route passes a guard ANCHORED AT THE CALL before it paints
//                (the latest render, a store generation, a re-check, a substitution, its own container) or declares it
//                carries counts / no words — the chrome half races every clear with stale answers (a real socket drop)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
function walkLib(dir = 'src/lib', out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walkLib(rel, out);
    else if (/\.js$/.test(e.name) && e.name !== 'build-version.js') out.push(rel);
  }
  return out;
}
const LIB_FILES = [...walkLib(), 'src/client.js'];
const libSources = (override = {}) => new Map(LIB_FILES.map((rel) => [rel, fs.readFileSync(override[rel] || path.join(ROOT, rel), 'utf8')]));
// ── H1 ──
const STORAGE = {
  // class: pref = a device preference / view state (sizes, fonts, filters, folds, tabs); ids = ids / keys only; owner = the
  // owner's own words (never a record's); ref = the one key that can name a record (a head + {kind, id}); plugin = a
  // plugin's own sandboxed storage; telemetry = event names / stacks; marker = a flag or a timestamp
  'src/lib/app.js|localStorage|\'vs-onboarded\'': ['marker', 'the onboarding wizard ran'],
  'src/lib/channel-window.js|localStorage|hideKey': ['marker', 'lane channel-threads: an account\'s "reactions can be read after one Re-authorize" note dismissed (a flag per adapter id — the .197 integration)'],
  'src/lib/app.js|localStorage|k': ['pref', 'CLIENT_PREF_KEYS — the per-device UI prefs (scale, font size)'],
  'src/lib/app.js|sessionStorage|key': ['marker', 'the once-per-version stale-bundle reload stamp (a time)'],
  'src/lib/appearance-panel.js|localStorage|\'termFontSize\'': ['pref', 'terminal font size'],
  'src/lib/appearance-panel.js|localStorage|\'termFontFamily\'': ['pref', 'terminal font'],
  'src/lib/appearance-panel.js|localStorage|key': ['pref', 'a UI pref percentage (scale / font size)'],
  'src/lib/browser-live-window.js|localStorage|\'vibespace.deviceTag\'': ['ids', 'a random device tag'],
  'src/lib/settings-ui.js|localStorage|SHOW_ADVANCED_KEY': ['pref', 'lane settings-tiers (B-df40 part 2): the Settings window\'s "Show advanced settings" switch (a "1" / "0" flag, never a record\'s words)'],
  'src/lib/browser-trace-view.js|localStorage|SHOW_FITS_KEY': ['pref', 'lane trace-fits: show the live view\'s page-size changes as rows (a "1" flag, never a record\'s words)'],
  'src/lib/channel-outbox.js|localStorage|DELIVER_KEY': ['pref', 'next-turn | wake-now (the Approve button\'s remembered delivery)'],
  'src/lib/code-editor.js|localStorage|\'editorSettings\'': ['pref', 'editor settings'],
  'src/lib/desktop-app-window.js|sessionStorage|prevKey': ['ids', 'a desktop-app pane key per app (this tab)'],
  'src/lib/desktop-manager.js|localStorage|\'toolbarScale\'': ['pref', 'toolbar scale'],
  'src/lib/desktop-manager.js|localStorage|\'taskbarHeight\'': ['pref', 'taskbar height'],
  'src/lib/docx-viewer.js|localStorage|ZOOM_PREF_KEY': ['pref', 'the Word viewer\'s zoom'],
  'src/lib/file-explorer.js|localStorage|\'fileExplorerSettings\'': ['pref', 'explorer view settings'],
  'src/lib/file-explorer.js|localStorage|\'fileExplorerColumns\'': ['pref', 'explorer columns'],
  'src/lib/file-explorer.js|localStorage|\'fileExplorerColumnWidths\'': ['pref', 'explorer column widths'],
  'src/lib/file-explorer.js|localStorage|\'fileExplorerGroupBy\'': ['pref', 'explorer grouping'],
  'src/lib/i18n.js|localStorage|STORAGE_KEY': ['pref', 'the device language'],
  'src/lib/layout.js|localStorage|\'termFontSize\'': ['pref', 'terminal font size'],
  'src/lib/layout.js|localStorage|\'termFontFamily\'': ['pref', 'terminal font'],
  'src/lib/layout.js|localStorage|\'toolbarScale\'': ['pref', 'toolbar scale'],
  'src/lib/layout.js|localStorage|\'taskbarHeight\'': ['pref', 'taskbar height'],
  'src/lib/manage-agents.js|localStorage|\'vibespace.quotaRefreshAck\'': ['marker', 'the quota-refresh explanation was acknowledged'],
  'src/lib/manage-agents.js|localStorage|\'vibespace.agentsTab\'': ['pref', 'the Agents dialog tab'],
  'src/lib/user-todos-actions.js|localStorage|\'vibespace.agentsTab\'': ['pref', 'the Agents dialog tab a Machines item opens on (lane device-upgrade-stuck) — a tab name, never an item\'s words'],
  'src/lib/manage-agents.js|localStorage|\'vibespace.agentsMachOpen\'': ['ids', 'which machine rows are expanded (host ids)'],
  'src/lib/plugin-client.js|localStorage|storagePrefix + String(k)': ['plugin', 'a trusted plugin module\'s own key-value storage (vsp_<id>_ prefix)'],
  'src/lib/plugin-client.js|localStorage|k': ['plugin', 'a sandboxed iframe plugin\'s storage bridge (prefix + its key)'],
  'src/lib/principal-picker.js|localStorage|RECENT_KEY': ['ids', 'recent principal picks (session / Task Group identities)'],
  'src/lib/resizer.js|localStorage|this.storageKey': ['pref', 'a resizer\'s size'],
  'src/lib/settings-ui.js|localStorage|\'vibespace.settingsNavFolds\'': ['pref', 'the Settings nav folds'],
  'src/lib/settings.js|localStorage|\'webui-settings\'': ['pref', 'the settings mirror'],
  'src/lib/setup-flows.js|localStorage|\'vs-onboarded\'': ['marker', 'the onboarding wizard ran'],
  'src/lib/sidebar-rail.js|localStorage|\'vibespace.railItem\'': ['pref', 'the active rail panel'],
  'src/lib/sidebar-state.js|localStorage|\'starredSessions\'': ['ids', 'starred session ids'],
  'src/lib/sidebar-state.js|localStorage|\'archivedSessions\'': ['ids', 'archived session ids'],
  'src/lib/sidebar-state.js|localStorage|\'archivedFolders\'': ['ids', 'archived folder keys'],
  'src/lib/design-changes.js|localStorage|storeKey': ['owner', 'lane design-changes: the Design window\'s pending changes per design on this device — the owner\'s own comments and the before / after of the texts they edited and the nudges they made (previews not yet sent), each with the quote of the artboard element it is about; never a store record of the five kinds'],
  'src/lib/doc-window-ui.js|localStorage|storeKey': ['owner', 'lane doc-window: the Doc window\'s comments strip per (host, path) on this device — the owner\'s own notes on a markdown file, each with the quote of the text it is about, until Send all; never a store record of the five kinds'],
  'src/lib/sidebar-state.js|localStorage|\'sessionCustomNames\'': ['owner', 'the names the owner typed for sessions (never a store record)'],
  'src/lib/machine-desktop.js|localStorage|RUNS_KEY': ['owner', 'design 014 D1: the owner\'s own last 3 "Run on its desktop…" lines per machine (typed by the owner, re-judged by desktopRunPlan before they are offered; never an agent\'s, never a record)'],
  'src/lib/sidebar-state.js|localStorage|\'sessionModes\'': ['ids', 'terminal | chat per session id'],
  'src/lib/sidebar-state.js|localStorage|\'sessionConfigs\'': ['pref', 'per-session model / effort / permission overrides'],
  'src/lib/sidebar-state.js|localStorage|\'sessionGroups\'': ['ids', 'legacy session groups (names the owner typed + ids)'],
  'src/lib/sidebar-state.js|localStorage|\'groupFolders\'': ['ids', 'legacy group folders'],
  'src/lib/sidebar-workbench.js|localStorage|\'wbRecentHost\'': ['ids', 'a host id'],
  'src/lib/sidebar-workbench.js|localStorage|storageKey': ['ids', 'a host id reset to \'\''],
  'src/lib/sidebar-workbench.js|localStorage|\'wbHistoryHost\'': ['ids', 'a host id'],
  'src/lib/sidebar.js|localStorage|\'vibespace.taskViewSort\'': ['pref', 'Task View sort'],
  'src/lib/sidebar.js|localStorage|\'sessionSort\'': ['pref', 'session sort'],
  'src/lib/sidebar.js|localStorage|\'collapsedFolders\'': ['ids', 'collapsed folder keys'],
  'src/lib/sidebar.js|localStorage|\'expandedFolders\'': ['ids', 'expanded folder keys'],
  'src/lib/sidebar.js|localStorage|\'vibespace.taskViewFilter\'': ['pref', 'Task View status filter'],
  'src/lib/sidebar.js|localStorage|\'statusFilter\'': ['pref', 'status filter'],
  'src/lib/sidebar.js|localStorage|\'backendFilter\'': ['pref', 'backend filter'],
  'src/lib/sidebar.js|localStorage|\'hostFilter\'': ['ids', 'host filter (host ids)'],
  'src/lib/sidebar.js|sessionStorage|AGENT_KIND_FILTER_KEY': ['pref', 'the agent-kind filter (this tab)'],
  'src/lib/telemetry-client.js|localStorage|PENDING_KEY': ['telemetry', 'unsent telemetry events: names / stacks / versions, never content (the module\'s privacy rule)'],
  'src/lib/channel-account-dialogs.js|localStorage|rememberKey(kind)': ['owner', 'the Slack app the owner made in step 1 of Connect (design 017): its id, its name and the workspace\'s name — never a token, never a record\'s words'],
  'src/lib/themes.js|localStorage|\'theme\'': ['pref', 'the theme'],
  'src/lib/usage-meter.js|localStorage|\'vibespace.usageAccountCodex\'': ['ids', 'the chosen usage account id'],
  'src/lib/usage-meter.js|localStorage|\'vibespace.usageAccount\'': ['ids', 'the chosen usage account id'],
  'src/lib/usage-meter.js|localStorage|\'vibespace.quotaRefreshAck\'': ['marker', 'the quota-refresh explanation was acknowledged'],
  'src/lib/user-todos-panel.js|localStorage|HISTORY_SEEN_KEY': ['marker', 'when the Notifications tab was last seen (a time)'],
  'src/lib/user-todos-panel.js|localStorage|NOTICE_FILTER_KEY': ['pref', 'the notices filter'],
  'src/lib/utils.js|localStorage|\'vibespace.toastHistory\'': ['ref', 'THE toast history: {m: the head, ref: {kind, id}} for a toast about a record — never its words (r4); a legacy entry is cut at load'],
};
const STORAGE_CLASSES = new Set(['pref', 'ids', 'owner', 'ref', 'plugin', 'telemetry', 'marker']);
const storageWrites = (srcs) => {
  const rows = [], other = [];
  for (const [rel, text] of srcs) {
    for (const m of text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*([^,]+?)\s*,/g)) rows.push(`${rel}|${m[1]}|${m[2]}`);
    for (const m of text.matchAll(/\bindexedDB\s*\.\s*open\b|\bcaches\s*\.\s*open\b|\bwindow\.name\s*=(?!=)|\bhistory\s*\.\s*(pushState|replaceState)\b|\bdocument\.cookie\s*=(?!=)|\bserviceWorker\s*\.\s*register\b|\b(localStorage|sessionStorage)\s*\[[^\]]+\]\s*=(?!=)/g)) other.push(`${rel}: ${m[0]}`);
  }
  return { rows: [...new Set(rows)], other };
};
console.log('§H the client (verify r5): storage · titles · the belt · caches · repaint');
{
  const { rows, other } = storageWrites(libSources());
  const unknown = rows.filter((r) => !(r in STORAGE)), dead = Object.keys(STORAGE).filter((k) => !rows.includes(k));
  ok(rows.length >= 60 && unknown.length === 0, `H1 every browser storage write is classified (${rows.length} keys over ${LIB_FILES.length} client files)`, unknown);
  ok(dead.length === 0, 'H1 no dead row (every classified key is still written)', dead);
  ok(Object.values(STORAGE).every(([c, why]) => STORAGE_CLASSES.has(c) && why.length >= 6), 'H1 every row names its class (pref / ids / owner / ref / plugin / telemetry / marker) and what it holds');
  ok(other.length === 0, 'H1 the client writes NO IndexedDB database, CacheStorage cache, service worker, cookie, window.name, URL or indexed storage slot', other);
  ok(Object.entries(STORAGE).filter(([, [c]]) => c === 'ref').map(([k]) => k).join() === "src/lib/utils.js|localStorage|'vibespace.toastHistory'", 'H1 exactly ONE key can name a record: the toast history');
  const utils = read('src/lib/utils.js');
  // B-3f5d ① (lane for-you-jobs): the entry may carry `seen: true` (shown while the user acted) — a flag, no words
  ok(/h\.unshift\(\{ m: String\(message\)\.slice\(0, 500\), type, ts: Date\.now\(\), \.\.\.\(ref && ref\.kind && ref\.id \? \{ ref: \{ kind: String\(ref\.kind\), id: String\(ref\.id\) \} \} : \{\}\), \.\.\.\(seen \? \{ seen: true \} : \{\}\) \}\);/.test(utils)
    && /_recordToast\(history && typeof history\.m === 'string' \? history\.m : message, type, history && history\.ref\);/.test(utils), 'H1 …and it keeps what the caller\'s `history.m` says (the head) + a {kind, id} ref');
  // a toast about a record passes `history` — every showToast in the surface files whose message reads a record's words
  const SURF = ['src/lib/task-log.js', 'src/lib/task-detail.js', 'src/lib/user-todos-panel.js', 'src/lib/user-todos-actions.js', 'src/lib/inbox-window.js', 'src/lib/session-props.js', 'src/lib/session-card.js', 'src/lib/sidebar-tasks.js', 'src/lib/jobs-panel.js', 'src/lib/channel-window.js', 'src/lib/channels-panel.js', 'src/lib/record-clear-ui.js'];
  const WORDISH = /\bwordsOf\(|\bdetailOf\(|\b(p|e|entry)\.(note|detail)\b|\b(i|it|item)\.(text|detail)\b|\b(st|h|rec|cur)\.(reason|detail)\b|\b(j|job)\.(name|note)\b|\brec\.text\b|\.lastText\b|\.lastLine\b|\.payload\b/;
  const bad = [];
  for (const rel of SURF) {
    const text = read(rel);
    for (const m of text.matchAll(/\bshowToast\(/g)) {
      let depth = 0, i = m.index + 'showToast'.length, end = i;
      for (; i < text.length; i++) { const c = text[i]; if (c === '(') depth++; else if (c === ')') { depth--; if (depth === 0) { end = i; break; } } }
      const args = text.slice(m.index, end + 1);
      if (WORDISH.test(args) && !/history: \{ m: /.test(args)) bad.push(`${rel}: ${args.slice(0, 120)}`);
    }
  }
  ok(bad.length === 0, 'H1 every toast whose message reads a record\'s words passes `history: {m, ref}` (the device history keeps the head + a ref)', bad);
}
// ── H1b (verify r6 — the owner's own path: toggling a job family's fold PERSISTED the job's name in the server's user
// state — GET /api/user-state, the user-state-updated broadcast to every client, a config export — and a clear never
// reached it) ── what the client persists ON THE SERVER: every write to /api/user-state is classified by the key it writes;
// the one key a record can shape (jobsPanelFolds) is PROVED on the real module to carry no words.
const USER_STATE = {
  'src/lib/jobs-panel.js|jobsPanelFolds': ['ids', 'session keys + a DIGEST of each job family (familyKey) — never the job\'s name; an older build\'s <session>|<name> key is dropped at load'],
  'src/lib/channels-panel.js|channelsPanelFolds': ['pref', 'the Channels panel\'s section folds (fixed part names)'],
  'src/lib/desktop-app-prefs.js|[key]': ['pref', 'the per-app frame / scale maps (catalog keys)'],
  'src/lib/desktop-app-launcher.js|patch': ['pref', 'the launcher\'s advanced-open flag + recent catalog ids'],
  'src/lib/sidebar-state.js|delta': ['owner', 'stars / archives (ids), the names the owner typed, modes, configs, legacy groups — the changed top-level keys'],
  'src/lib/sidebar-state.js|state': ['owner', 'the same document, whole (the pre-first-fetch path)'],
  'src/lib/window-share.js|[REACH_KEY]': ['ids', 'app → the principals a window is shared with'],
};
const userStateWrites = (srcs) => {
  const rows = [];
  for (const [rel, text] of srcs) {
    for (const m of text.matchAll(/\b(?:fetch|fetchJson|fj)\s*\(\s*'\/api\/user-state'/g)) {
      let d = 0, i = m.index + m[0].indexOf('('), end = i;
      for (; i < text.length; i++) { const ch = text[i]; if (ch === '(') d++; else if (ch === ')') { d--; if (d === 0) { end = i; break; } } }
      const args = text.slice(m.index, end + 1);
      if (!/method:\s*'(?:PATCH|POST)'/.test(args)) continue;
      const b = /body:\s*JSON\.stringify\(\s*(?:\{\s*(\[?\w+\]?)\s*:|(\w+)\s*\))/.exec(args);
      rows.push(`${rel}|${b ? b[1] || b[2] : '?'}`);
    }
    for (const m of text.matchAll(/\bpatchUserState\s*=\s*\(\s*(\w+)\s*\)\s*=>\s*fetch\(\s*'\/api\/user-state'/g)) rows.push(`${rel}|${m[1]}`);
  }
  return [...new Set(rows)];
};
const foldsCarryWords = async (layoutPath) => {
  const L = await import(pathToFileURL(layoutPath).href + '?v=' + Math.random());
  const W = ['H1B', 'SENTINEL', '9e2d'].join('-');
  const lay = L.foldTasks([{ id: 'jb-h1b', kind: 'task', name: `digest ${W} run`, state: 'failed', ownerSession: {}, createdAt: 1, run: { endedAt: 2 } }, { id: 'jb-h1c', kind: 'task', name: `export ${W}`, state: 'done', ownerSession: { conversationId: 'conv-h1b' }, createdAt: 1 }], {});
  const keys = [...lay.sessions.map((x) => x.key), ...lay.groups.map((g) => g.key)];
  return { keys, words: keys.filter((k) => k.includes(W)), valid: typeof L.isFoldKey === 'function' ? keys.every((k) => L.isFoldKey(k)) : false };
};
{
  const rows = userStateWrites(libSources());
  const unknown = rows.filter((r) => !(r in USER_STATE)), dead = Object.keys(USER_STATE).filter((k) => !rows.includes(k));
  ok(rows.length >= 7 && unknown.length === 0 && dead.length === 0, `H1b every client write to the server's user state is classified by its key (${rows.length})`, { unknown, dead });
  ok(Object.values(USER_STATE).every(([c, why]) => STORAGE_CLASSES.has(c) && why.length >= 20) && !Object.values(USER_STATE).some(([c]) => c === 'ref'), 'H1b every row names its class and what it holds — none can name a record');
  const f = await foldsCarryWords(path.join(ROOT, 'src/lib/jobs-layout.js'));
  ok(f.words.length === 0 && f.valid && f.keys.length === 4, 'H1b …and jobsPanelFolds, proved on the REAL jobs-layout: a job named with a sentinel folds to keys that carry no word (session keys + family digests), every one a key this build keeps', f);
  const jp = read('src/lib/jobs-panel.js');
  ok(/const foldsOf = \(m\) => \{[^\n]*if \(isFoldKey\(k\)\) out\[k\] = !!v; else dropped\+\+;/.test(jp) && /FOLDS = foldsOf\(msg\.state\.jobsPanelFolds\)\.folds;/.test(jp) && /if \(dropped && !foldsCleaned\) \{ foldsCleaned = true; fetch\('\/api\/user-state', \{ method: 'PATCH'/.test(jp), 'H1b …an older build\'s word-keyed fold is dropped wherever the map is read (the load and the broadcast) and the cleaned map written back once');
}
// ── H1c (verify r7 — the r6 ⑥ class, widened: EVERY SERVER-PERSISTED store a client's state reaches, not only user state)
// ── grep-derived: the SyncStores server.js declares, the files routes/persistence.js persists, the config export's sections,
// the capture stores a client posts to (the telemetry shards, the incident bundles), the console tee (the opslog) and the
// per-session sidecars — each named with the GATE that proves it holds no record's words after a clear (a census row, a
// runtime leg) or why none can reach it. A new store is RED until it says which; a row the tree no longer has is RED.
const SERVER_STORES = {
  // key: [class, what it holds + the gate]
  'sync:drafts': ['owner', 'data/drafts.json — the composer\'s draft per session: what the owner typed (the only writers are chat-input.js and utils.js clearDraft, pinned below); declared in CLIENT_EXCEPTIONS'],
  'sync:settings': ['pref', 'data/settings-sync.json — a dormant settings mirror (server code reads data/settings.json); schema keys, values the owner picked or typed'],
  'sync:uploads': ['ids', 'data/uploads-sync.json — the upload history: file names, paths, sizes'],
  'sync:stage': ['ids', 'data/stage-sync.json — the stage\'s hero / slot / grid / per-session workspace: openSpecs (H2: ids), bounds, scroll offsets (stage-manager _captureExtras) — no title'],
  'file:layouts.json': ['guarded', 'H2 + H2b: WORDLESS_TITLES at the write choke point, the first read and the client\'s capture; test-record-clear-client reads data/layouts.json after a save'],
  'file:layout-history': ['guarded', 'the rollback points: wordlessTitles on every snapshot (test-record-clear-stores §5b); the Restore list shows desktop names and counts'],
  'file:bookmarks.json': ['owner', 'the folders the owner bookmarked (paths)'],
  'file:custom-themes.json': ['pref', 'the owner\'s custom themes (color variables)'],
  'file:user-state.json': ['guarded', 'H1b: every client write classified by key; jobsPanelFolds proved wordless'],
  'file:settings.json': ['pref', 'schema-keyed settings: values the owner picked, free text the owner typed (agent instructions); no client write reads a record (settings.set is called with fixed keys)'],
  'export:settings': ['pref', 'the config export\'s copy of data/settings.json'],
  'export:customThemes': ['pref', 'the config export\'s copy of data/custom-themes.json'],
  'export:layouts': ['guarded', 'the config export\'s copy of the layout record (the choke point\'s, H2)'],
  'export:userState': ['guarded', 'the config export\'s copy of data/user-state.json (H1b)'],
  'export:bookmarks': ['owner', 'the config export\'s copy of data/bookmarks.json'],
  'export:tasks': ['guarded', 'the Task Groups store as it is: a cleared entry exports as cleared (test-record-clear-walk leg (f) re-imports it; its probe exports EVERY section after the clear, pinned below)'],
  'export:pricing': ['pref', 'the usage pricing table (rates)'],
  'export:clientPrefs': ['pref', 'the device prefs the client sends (app.js CLIENT_PREF_KEYS: theme, fonts, language, scale, usage-view choices)'],
  'capture:telemetry': ['telemetry', 'data/telemetry/*.ndjson — event names, stacks, versions (the client queue is H1\'s PENDING_KEY); test-record-clear-walk greps the shards after the clear; the diagnostics report reads them'],
  'capture:incidents': ['declared', 'data/incidents/<id>/ — the owner\'s capture: the client rings + snapshot (CLIENT_EXCEPTIONS; test-record-clear-client captures one after the clear) and the server scene incl. its console ring (the journal class) and frozen transcript tails (EXCEPTIONS)'],
  'tee:opslog': ['declared', 'VIBESPACE_OPSLOG_DIR — the console tee: the journal\'s lines (EXCEPTIONS: the clear\'s receipts are ids only; the walk greps a real server\'s journal)'],
  'sidecar:session-meta': ['guarded', 'data/session-meta/*.json — ids, model / effort picks, the CLI\'s own records, the channel witness, browser facts; the vcs branch is declared (EXCEPTIONS); the walk greps the whole data dir (a live session\'s meta) after the clear'],
  'sidecar:session-buffers': ['declared', 'data/session-buffers/<id>(.json) — the wrapper\'s own record: its output and, for a codex session, the thread\'s QUEUE (EXCEPTIONS: handed to the harness)'],
};
const SERVER_STORE_CLASSES = new Set(['owner', 'pref', 'ids', 'guarded', 'telemetry', 'declared']);
const serverStores = (srcs) => {
  const out = [];
  const srv = srcs.get('server.js') || '', per = srcs.get('src/routes/persistence.js') || '';
  for (const m of srv.matchAll(/\bnew SyncStore\('(\w+)'/g)) out.push('sync:' + m[1]);
  for (const m of per.matchAll(/\bpath\.join\(dataDir, '([\w.-]+)'\)/g)) out.push('file:' + m[1]);
  for (const m of per.matchAll(/\btake\('(\w+)'/g)) out.push('export:' + m[1]);
  if (/file\.sections\.clientPrefs = clientPrefs;/.test(per)) out.push('export:clientPrefs');
  if (/\bapp\.post\('\/api\/telemetry', /.test(srv)) out.push('capture:telemetry');
  if (/\bapp\.post\('\/api\/incident', /.test(srcs.get('src/server/incident-wiring.js') || '')) out.push('capture:incidents');
  if (/process\.env\.VIBESPACE_OPSLOG_DIR/.test(srcs.get('src/opslog.js') || '')) out.push('tee:opslog');
  if (/\bfunction writeSessionMeta\(/.test(srcs.get('src/server/session-stdout.js') || '')) out.push('sidecar:session-meta');
  if (/const BUFFERS_DIR = path\.join\(__dirname, 'data', 'session-buffers'\);/.test(srv)) out.push('sidecar:session-buffers');
  return [...new Set(out)];
};
{
  const rows = serverStores(sources());
  const unknown = rows.filter((r) => !(r in SERVER_STORES)), dead = Object.keys(SERVER_STORES).filter((k) => !rows.includes(k));
  ok(rows.length >= 20 && !unknown.length && !dead.length, `H1c every server-persisted store a client's state reaches is named with its gate or its reason (${rows.length}: ${rows.filter((r) => r.startsWith('sync:')).length} SyncStores, ${rows.filter((r) => r.startsWith('file:')).length} persistence files, ${rows.filter((r) => r.startsWith('export:')).length} export sections, capture / tee / sidecars)`, { unknown, dead });
  ok(Object.values(SERVER_STORES).every(([c, why]) => SERVER_STORE_CLASSES.has(c) && why.length >= 30), 'H1c every row names its class (owner / pref / ids / guarded / telemetry / declared) and what it holds');
  // the one store the owner TYPES into: nothing but the composer writes a draft
  const drafters = [...libSources()].filter(([, text]) => /\bsaveDraft\(/.test(text.replace(/export function saveDraft\(/, ''))).map(([rel]) => rel);
  ok(drafters.join() === 'src/lib/chat-input.js,src/lib/utils.js' && /export function clearDraft\(type, id\) \{\s*saveDraft\(type, id, ''\);/.test(read('src/lib/utils.js')), 'H1c …a composer draft is written by the composer only (chat-input.js; utils.js clearDraft writes \'\') — no surface puts a record\'s words into data/drafts.json', drafters);
  // the export leg: the walk's probe exports EVERY section the route offers, after the clear
  const walk = read('scripts/test-record-clear-walk.mjs');
  const secs = rows.filter((r) => r.startsWith('export:')).map((r) => r.slice(7));
  const probe = /name: 'POST \/api\/config\/export \{every section\} \(cookie\)', call: \(\) => raw\('\/api\/config\/export', \{ method: 'POST', body: \{ sections: (\[[^\]]*\]), clientPrefs: /.exec(walk);
  const probed = probe ? JSON.parse(probe[1].replace(/'/g, '"')) : [];
  ok(probe && secs.every((s) => probed.includes(s)), `H1c …and test-record-clear-walk's config-export probe exports every section the route offers (${secs.join(', ')}) — before and after the clear`, { probed, secs });
}
// ── H2 ──
const PERSIST = require(path.join(ROOT, 'src/routes/persistence.js'));
const TITLE_WORDS = /\b(p|e|entry)\.(note|detail)\b|\bwordsOf\(|\b(i|it|item)\.(text|detail)\b|\b(st|h|rec|cur)\.(reason|detail)\b|\b(j|job)\.(name|note|progress)\b|\brec\.text\b|\.lastText\b|\.lastLine\b|\.payload\b/;
const titleCensus = (srcs) => {
  const rows = [];
  for (const [rel, text] of srcs) {
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l) || !/\bsetTitle\(|createWindow\(\{[^}]*\btitle:/.test(l) || !TITLE_WORDS.test(l)) return;
      // the window's own openSpec action: the nearest `action: '…'` above the line in the same file
      let action = null;
      for (let k = i; k >= Math.max(0, i - 200) && !action; k--) { const m = /\baction: '(\w+)'/.exec(lines[k]); if (m) action = m[1]; }
      rows.push({ at: `${rel}:${i + 1}`, action, line: l.trim().slice(0, 140) });
    });
  }
  return rows;
};
{
  const rows = titleCensus(libSources());
  ok(rows.length >= 1 && rows.every((r) => r.action && Object.prototype.hasOwnProperty.call(PERSIST.WORDLESS_TITLES, r.action)), `H2 every window title that reads a record's words (${rows.length}) belongs to a window whose layout record keeps a generic title (WORDLESS_TITLES)`, rows);
  ok(rows.every((r) => /isCleared\(|clearedText\(|wordsOf\(|shownText\(/.test(r.line)), 'H2 …and draws a cleared record in this device\'s words', rows);
  const ws = read('src/ws-handler.js');
  ok(/layoutData\.desktops\[desktopId\]\.autoSave = \{ \.\.\.data\.state, updatedAt: Date\.now\(\) \};/.test(ws) && /writeLayouts\(layoutData\);\s*\/\/ Broadcast[^\n]*\n\s*const syncMsg = JSON\.stringify\(\{ type: 'layout-sync', seq: \+\+layoutSyncSeqRef\.value, desktopId, state: data\.state,/.test(ws), 'H2 the ws layout-sync handler writes a SHALLOW copy of the client\'s state (the same window objects) BEFORE it relays that state — the choke point\'s generic title is what other clients receive');
  // the five surfaces' openSpecs carry ids (+ a session's own name) — never a record's words
  const specs = [['src/lib/task-log.js', "const openSpec = { action: 'openTaskLog', taskId, tab: tab === 'backlog' ? 'backlog' : 'activity' };"], ['src/lib/task-detail.js', "const openSpec = { action: 'openTaskDetail', taskId };"],
    ['src/lib/session-props.js', "const openSpec = { action: 'openSessionProps', sessionKey: refKey, cwd: s0.cwd || '', name: s0.name || '' };"], ['src/lib/jobs-panel.js', "openSpec: { action: 'openJobInteract', jobId }"], ['src/lib/jobs-panel.js', "openSpec: { action: 'openJobs' }"],
    ['src/lib/channel-window.js', "openSpec: { action: 'openChannel', adapterId, convId },"], ['src/lib/inbox-window.js', "const spec = { action: 'openInbox' };"]];
  const missing = specs.filter(([f, s]) => !read(f).includes(s));
  ok(missing.length === 0 && /if \(itemId\) spec\.itemId = String\(itemId\);\s*if \(sessionKey\) spec\.sessionKey = String\(sessionKey\);/.test(read('src/lib/inbox-window.js')), 'H2 the surfaces\' openSpecs (persisted in data/layouts.json) carry ids and a session\'s own name — no Find text, no selected item\'s words', missing);
}
// ── H2b (verify r7 — THE PAGE'S OWN LAYOUT RECORDS: a named preset saved before a clear kept the Job input window's title
// — the job's name — in LayoutManager._savedPresets, and the record of a desktop the owner had switched away from kept it
// in DesktopManager._savedStates, long after the server's choke point wrote it generic; the chrome census's heap leg saw
// the first once a preset was saved) ── ONE table (PURE src/record-clear.js), read by the server's choke point and by the
// client's ONE capture (layout.js captureState); every site that keeps a layout record in the page is classified by where
// the record comes from — a capture (`captureState()` within the lines above), a record the SERVER sent (already generic),
// built without titles, or empty. A new holder is RED until it says which.
const RC = require(path.join(ROOT, 'src/record-clear.js'));
// userW inc-mun7qjmw-iksh (lane desktop-move): a desktop's held record has ONE writer (DesktopManager._setRecord —
// the `door`, its every CALL classified here) and a write MERGES (PURE src/lib/desktop-record.js): `merge` = a held
// record merged with the ONE capture's entries (captureWin / captureWindows / recordFor) and/or minus entries — every
// entry is a server record's or the wordless capture's
const HOLDER_RE = /\b_savedPresets\s*(?:\[[^\]]+\])?\s*=(?!=)|\b_savedStates\.set\(|\.\s*_setRecord\(|\b_lastSentJson\s*=(?!=)/;
const HOLDER_KINDS = new Set(['capture', 'server', 'titleless', 'empty', 'door', 'merge']);
const HOLDERS_H2B = [
  // [file, a unique snippet of the line, kind, why]
  ['src/lib/layout.js', 'this._savedPresets = {};', 'empty', 'the constructor'],
  ['src/lib/layout.js', 'this._lastSentJson = null;', 'empty', 'the constructor'],
  ['src/lib/layout.js', 'this._lastSentJson = json;', 'capture', 'the JSON of the autosave state captureState made (r5 held LOW — fixed by the capture, r7)'],
  ['src/lib/layout.js', "      this._savedPresets = data.saved || {};\n      this._currentName = data.current || null;\n\n", 'server', 'the boot read of GET /api/layouts (the choke point wrote it)'],
  ['src/lib/layout.js', "      this._savedPresets = data.saved || {};\n      this._currentName = data.current || null;\n    } catch {}", 'server', 'refresh() — the Presets dialog re-reads GET /api/layouts'],
  ['src/lib/layout.js', 'this._savedPresets[name] = state;', 'capture', 'savePreset: the state captureState made (the r7 finding)'],
  ['src/lib/desktop-manager.js', 'this._savedStates.set(desktopId, record);', 'door', '_setRecord: THE ONE writer of a held desktop record — every call below is classified'],
  ['src/lib/desktop-manager.js', 'this._setRecord(firstId, legacyState);', 'server', 'the legacy top-level autoSave the server sent at boot'],
  ['src/lib/desktop-manager.js', "if (id !== '__stage__' && dState.autoSave) { this._setRecord(id, dState.autoSave);", 'server', 'each desktop\'s autoSave the server sent at boot'],
  ['src/lib/desktop-manager.js', 'this._setRecord(desktopId, held.length ? mergeDesktopRecord({ record: state, remove: held }) : state);', 'server', 'cacheRemoteState / cacheShownState: a record the server RELAYED (its choke point made it generic in place, r5), minus this page\'s held closes'],
  ['src/lib/desktop-manager.js', 'this._setRecord(desktopId, state);', 'merge', 'noteSent: the record recordFor made (the held record merged with the ONE capture\'s entries) that just left this page'],
  ['src/lib/desktop-manager.js', 'this._setRecord(desk, mergeDesktopRecord({ record: st, remove: [winId] }));', 'merge', 'purgeClosedWindow: a held record minus the closed window'],
  ['src/lib/desktop-manager.js', 'this._setRecord(d, mergeDesktopRecord({ record: rec, built: lm.captureWindows(d)', 'merge', 'onSyncRefused: the record the server kept, merged with the ONE capture of the windows this page built there'],
  ['src/lib/desktop-manager.js', 'this._setRecord(this._activeId, currentState);', 'capture', 'switchTo: the record of the desktop being left (the r7 finding) — recordFor = the held record merged with the ONE capture'],
  ['src/lib/desktop-manager.js', 'this._setRecord(desktopId, mergeDesktopRecord({ record: this._savedStates.get(desktopId) || { windows: [] }, add: moved', 'merge', '_updateCachedDesktop: a move\'s target — its held record plus the moved windows\' captureWin entries'],
  ['src/lib/desktop-manager.js', 'this._setRecord(from, mergeDesktopRecord({ record: this._savedStates.get(from), remove: ids }));', 'merge', '_updateCachedDesktop: a move\'s source — its held record minus the moved windows'],
  ['src/lib/desktop-manager.js', 'this._setRecord(targetId, mergeDesktopRecord({ record: this._savedStates.get(targetId) || { windows: [] }, add: moving }));', 'merge', 'deleteDesktop: the target\'s held record plus the deleted desktop\'s own entries (each a server record\'s or the ONE capture\'s — lane desktop-move verify r1 ④)'],
  ['src/lib/stage-manager.js', 'dm._setRecord(this._prevDesktopId, dm.recordFor(this._prevDesktopId));', 'capture', 'entering the stage: the record of the desktop being left (recordFor = the held record merged with the ONE capture)'],
];
const holderSites = (srcs) => {
  const out = [];
  for (const [rel, text] of srcs) {
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l) || !HOLDER_RE.test(l)) return;
      const win = lines.slice(i, i + 4).join('\n') + '\n', above = lines.slice(Math.max(0, i - 16), i + 1).join('\n');
      const rows = HOLDERS_H2B.filter(([f, snip]) => f === rel && (snip.includes('\n') ? win.startsWith(snip) : l.includes(snip)));
      out.push({ at: `${rel}:${i + 1}`, rows, captured: /captureState\(\)|\brecordFor\(/.test(above), merged: /\bmergeDesktopRecord\(|\brecordFor\(/.test(above), line: l.trim().slice(0, 120) });
    });
  }
  return out;
};
const captureTitled = (layoutSrc) => { const i = layoutSrc.indexOf('  captureWin(win, id = win?.id) {'); // the ONE per-window capture captureState / captureWindows / recordFor all read (lane desktop-move)
  const body = i < 0 ? '' : layoutSrc.slice(i, layoutSrc.indexOf('\n  }\n', i)); return { wordless: /\btitle: wordlessTitleOf\(win\._openSpec, win\.title\),/.test(body), raw: /\btitle: win\.title\b/.test(body) }; };
{
  ok(PERSIST.WORDLESS_TITLES === RC.WORDLESS_TITLES && RC.wordlessTitleOf({ action: 'openJobInteract', jobId: 'jb-1' }, 'digest SENTINEL — needs your input') === 'Job input' && RC.wordlessTitleOf({ action: 'openTaskLog' }, 'census — Log') === 'census — Log' && RC.wordlessTitleOf(null, 'x') === 'x', 'H2b ONE table: the server\'s choke point and the client\'s capture read the same WORDLESS_TITLES (PURE src/record-clear.js); wordlessTitleOf keeps any other window\'s title');
  const ct = captureTitled(read('src/lib/layout.js'));
  ok(ct.wordless && !ct.raw && /import \{ wordlessTitleOf \} from '\.\.\/record-clear\.js';/.test(read('src/lib/layout.js')), 'H2b the client\'s ONE capture (layout.js captureState) records a record-titled window under its generic title — never `title: win.title`', ct);
  const sites = holderSites(libSources());
  const bad = sites.filter((s) => s.rows.length !== 1 || (s.rows[0][2] === 'capture' && !s.captured) || (s.rows[0][2] === 'merge' && !s.merged));
  ok(sites.length >= 12 && !bad.length, `H2b every site that keeps a layout record in the page (${sites.length}) is classified — a capture (captureState() above it), a record the server sent, built without titles, or empty`, bad);
  const used = new Set(sites.flatMap((s) => s.rows));
  ok(HOLDERS_H2B.every((r) => used.has(r)) && HOLDERS_H2B.every(([, , k, why]) => HOLDER_KINDS.has(k) && why.length >= 8), 'H2b no dead row; every row names its kind and why', HOLDERS_H2B.filter((r) => !used.has(r)).map(([f, s]) => `${f}: ${s.slice(0, 50)}`));
}
// ── H3 ──
// the .197 integration adds src/lib/stash-strip.js (lane stash-detail's previews of what waits for an agent — lane-redact's own note)
const SURFACE_FILES = ['src/lib/stash-strip.js', 'src/lib/task-log.js', 'src/lib/task-detail.js', 'src/lib/user-todos-panel.js', 'src/lib/user-todos-actions.js', 'src/lib/user-todos-row.js', 'src/lib/inbox-window.js', 'src/lib/inbox-window-layout.js', 'src/lib/session-props.js', 'src/lib/session-card.js', 'src/lib/sidebar-tasks.js', 'src/lib/jobs-panel.js', 'src/lib/jobs-layout.js', 'src/lib/channel-window.js', 'src/lib/channels-panel.js', 'src/lib/channel-groups-view.js', 'src/lib/record-clear-ui.js'];
// the TEXT fields of the five kinds (a clear REPLACES them with the stored English key — a surface must word it): the
// DROP fields (a detail, options, a reply, a job's brief / progress / last line) are null after a clear and draw nothing
const TEXT_FIELD = /\b(p|e|entry)\.note\b|\b(i|it|item)\.text\b|\b(st|h|rec|cur)\.reason\b|\b(j|job)\.name\b|\brec\.text\b|\b(r|g|c)\.lastText\b/;
const ACCESSOR = /\bisCleared\(|\bshownText\(|\bclearedText\(|\bwordsOf\(/;
const BELT = [
  // [file, a unique snippet of the line, why it cannot carry a cleared record's words to anyone]
  ['src/lib/task-log.js', 'const actSig = (p) => [keyOf(p), p.at, p.note,', 'a row SIGNATURE (never drawn): a cleared entry\'s sig changes, so its row is REBUILT from the record'],
  ['src/lib/task-log.js', ".map((p) => ({ kind: 'activity', groupId: taskId, id: p.id, at: p.at, words: p.note,", 'the confirm dialog\'s rows — only entries NOT cleared are offered (`!isCleared(p)` in the filter), spent at the answer'],
  ['src/lib/task-log.js', "if (p.id) items.push({ label: t('Clear content…'), action: () => clearRecords([{ kind: 'activity', groupId: taskId, id: p.id, at: p.at, words: p.note }]) });", 'the menu of an entry NOT cleared (menuItemsFor returns before it for a cleared one); the dialog is spent at the answer'],
  ['src/lib/task-log.js', '&& (matches(it.text) || matches(it.detail)));', 'a BACKLOG item (not a cleared kind)'],
  ['src/lib/task-log.js', "ti.className = 'task-detail-input'; ti.value = it.text;", 'a BACKLOG item (not a cleared kind)'],
  ['src/lib/task-log.js', 'txt.textContent = it.text;', 'a BACKLOG item (not a cleared kind)'],
  ['src/lib/task-log.js', '.filter((p) => (!state.session || p.session === state.session) && (matches(p.note) || matches(p.detail)));', 'the Copy-as-markdown FILTER (the Find text); the line it writes words a cleared entry (isCleared on the next line)'],
  ['src/lib/task-log.js', "&& (matches(it.text) || matches(it.detail)))", 'a BACKLOG item (not a cleared kind)'],
  ['src/lib/task-log.js', ".map((it) => `- [${it.status === 'done'", 'a BACKLOG item (not a cleared kind)'],
  ['src/lib/task-detail.js', 'row.innerHTML = `<summary>${stamp}${escHtml(p.note)}</summary>', 'the branch `if (p.detail && !isCleared(p))` — a cleared entry is always the plain row (a clear drops the detail)'],
  ['src/lib/task-detail.js', 'txt.textContent = item.text;', 'a BACKLOG item (not a cleared kind)'],
  ['src/lib/inbox-window-layout.js', 'const defaultText = (i) => [i.text, i.detail,', 'the PURE layout\'s fallback when no `text` is handed in; the window hands in the model\'s wordsOf'],
  ['src/lib/inbox-window-layout.js', "const title = String(ctx.words != null ? ctx.words : (i.text || ''));", 'itemView — the window passes ctx.words = the model\'s wordsOf (the fallback is for the PURE tests)'],
  ['src/lib/session-props.js', "const histMenu = (h, x, y) => showContextMenu(x, y, [{ label: t('Clear content…'), action: () => { clearRecords([{ kind: 'status', sessionKey: histKey, id: String(h.at), at: h.at, words: h.reason || h.branch || '' }]); } }]);", 'the menu of an entry NOT cleared (`clearable(h)` guards both doors); the dialog is spent at the answer'],
  ['src/lib/sidebar-tasks.js', "const prefill = cur.clearedAt ? '' : (cur.reason || '');", 'the status popover\'s prefill — a cleared reason is not offered back (`clearedAt` read directly); an UNTOUCHED prefill is re-read from the live record at Apply (verify r6), so one open across a clear is never re-filed'],
  ['src/lib/jobs-layout.js', 'const family = familyOf(j.name);', 'the family KEY; the panel draws a family equal to the stored key as clearedText()'],
  ['src/lib/channel-window.js', "const body = renderBlocks(blocksOfRecord(rec), { t, folds, foldKey: rec.vendorId || rec.id || '', fallbackText: rec.text || '' });", 'an ADAPTER conversation\'s system row (Lark / Gmail) — not a group message'],
  ['src/lib/channel-window.js', "t, folds, foldKey: rec.vendorId || rec.id || '', fallbackText: rec.text || '',", 'an ADAPTER conversation\'s row (Lark / Gmail) — not a group message'],
  ['src/lib/channel-window.js', "quoteTarget = { vid: rec.vendorId, who: (rec.author && (rec.author.name || rec.author.id)) || '', text: firstLine(rec.text || '', 80) };", 'lane reaction-hover: the Quote line above an ADAPTER conversation\'s composer (Lark / Gmail) — not a group message (msgBarActions gives a group row its ⋯ only)'],
  ['src/lib/channel-window.js', "const words = String((rec && rec.text) || '');", 'lane channel-touch-menu: Copy text in an ADAPTER conversation\'s message menu (Lark / Gmail; the touch …, a long press on the chrome, a right click) — not a group message (the group window\'s menu is msgMenu)'],
  ['src/lib/channel-window.js', "default: return rec.text || '';", 'a group system record of an UNKNOWN kind (create / invite / leave / kick / rename / archive are worded); renderGroupRecord appends the cleared sentence under a cleared one'],
  ['src/lib/channel-window.js', "const words = (rec.raw && rec.raw.kind && rec.raw.kind !== 'message') ? groupSysText(rec, nameOf) : (rec.text || '');", 'the menu of a message NOT cleared (both doors return on isCleared(rec)); the dialog is spent at the answer'],
  ['src/lib/channels-panel.js', 'const sig = JSON.stringify([\'g\', r.kind, r.id, r.adapterId, r.title, r.lastAt, r.unread, r.archived, r.pair, r.memberCount, r.sourceLabel, r.lastText,', 'a row SIGNATURE (never drawn): lastText + lastCleared rebuild the row'],
  ['src/lib/channels-panel.js', "last.textContent = r.lastText || '';", 'overwritten on the NEXT line with clearedText() when the group\'s last line was cleared (lastCleared)'],
  ['src/lib/channel-groups-view.js', "const text = String((rec && rec.text) || '');", 'B-ff04 groupBodyRuns: the group window calls it only for a record NOT cleared (renderGroupRecord draws clearedText() for a cleared one first)'],
  ['src/lib/channel-groups-view.js', "title: g.name || g.id, lastAt: num(g.lastAt || g.createdAt), lastText: g.lastText || '',", 'the PURE row model (data): the panel words lastCleared'],
  ['src/lib/channel-groups-view.js', "title: c.title || (typeof untitled === 'function' ? untitled(c.kind) : '') || c.id, lastAt: num(c.lastAt), lastText: c.lastText || '',", 'an ADAPTER conversation (not a group) — lark-search-poll words an untitled one (the .197 integration re-pinned the line)'],
];
const beltCensus = (srcs) => {
  const hits = [];
  for (const rel of SURFACE_FILES) {
    const text = srcs.get(rel) || fs.readFileSync(path.join(ROOT, rel), 'utf8');
    text.split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l) || !TEXT_FIELD.test(l) || ACCESSOR.test(l)) return;
      const row = BELT.find(([f, snip]) => f === rel && l.includes(snip));
      hits.push({ at: `${rel}:${i + 1}`, declared: !!row, line: l.trim().slice(0, 150) });
    });
  }
  return hits;
};
{
  const srcs = libSources();
  const hits = beltCensus(srcs);
  const undeclared = hits.filter((h) => !h.declared);
  ok(undeclared.length === 0, `H3 THE BELT: every text field of the five kinds a surface reads goes through the cleared-aware words on its line, or is declared (${hits.length} declared over ${SURFACE_FILES.length} surface files)`, undeclared);
  const dead = BELT.filter(([f, snip]) => !(srcs.get(f) || '').includes(snip));
  ok(dead.length === 0 && BELT.every(([, , why]) => why.length >= 20), 'H3 no dead declaration; every one says why', dead.map(([f, s]) => `${f}: ${s.slice(0, 60)}`));
  ok(hits.length === BELT.length, `H3 each declaration matches exactly one line (${hits.length} lines ↔ ${BELT.length} rows)`, { hits: hits.length, rows: BELT.length });
}
// ── H4 ──
const CACHES = {
  // `${file}|${name}`: what a long-lived Map / Set holds, and how a clear reaches it
  'src/lib/user-todos-actions.js|liveByKey': 'live facts per session key (mode, turn) — no words',
  'src/lib/user-todos-actions.js|keyByWebuiId': 'ids',
  'src/lib/user-todos-actions.js|drafts': 'the OWNER\'s own unsent reply text per item — never a record\'s words',
  'src/lib/user-todos-actions.js|fullById': 'the whole details this client saw — restoreDetails prunes to the ids the snapshot lists and a cleared item carries no detail (r3 + test-user-todos-layout ⑫)',
  'src/lib/user-todos-actions.js|detailLoads': 'id → an in-flight load (deleted on answer; ensureDetail re-checks isCleared after its GET)',
  'src/lib/user-todos-panel.js|folds': 'fold state per group (ids)',
  'src/lib/user-todos-panel.js|groupOpen': 'group key → open ids',
  'src/lib/task-log.js|picked': 'selected entry ids',
  'src/lib/task-log.js|openIds': 'expanded entry ids',
  'src/lib/task-log.js|userClosed': 'entry ids the user closed',
  'src/lib/inbox-window.js|tailIds': 'the resolved tail\'s ids',
  'src/lib/jobs-panel.js|EXPANDED': 'expanded job ids',
  'src/lib/channel-window.js|placed': 'vendor ids placed (an adapter conversation)',
  'src/lib/channel-window.js|folds': 'quote-fold state by key',
  'src/lib/stash-strip.js|by': 'a local (webui id → the broadcast\'s stash summary, per call — the .197 integration added the file)',
  'src/lib/channel-window.js|mailModes': 'lane channel-rich: a mail\'s Formatted / Plain choice by vendor id (a mode, never words)',
  'src/lib/channel-window.js|rxVisible': 'lane channel-threads: the vendor ids of the rows on screen (whose reactions to ask)',
  'src/lib/channel-window.js|rxAskedAt': 'lane channel-threads: when each message\'s reactions were last asked (vendor id → an instant)',
  'src/lib/channel-window.js|drawn': 'THE GROUP WINDOW: vendorId → the record behind a drawn row (its menu) — re-set from the broadcast\'s cleared records; an adapter window: vendor ids (Set)',
  'src/lib/channel-window.js|seen': 'vendor ids already drawn',
  'src/lib/channel-window.js|known': 'B-ff04: a member\'s conversation id → the last NAME the log knew it by (author / mention / raw.name) — names, never words',
  'src/lib/channel-window.js|clearedSeen': 'vendorId → a record a broadcast said was CLEARED (the sentence) — r5 ⑧',
  'src/lib/channels-panel.js|COLLAPSED': 'folded section keys',
  'src/lib/channels-panel.js|EXPANDED': 'expanded section keys',
  'src/lib/channels-panel.js|ends': 'list name → its end element (a sentinel / skeleton row — no words of a row)',
  'src/lib/channels-panel.js|aroundCache': 'design 010: the search dialog\'s around sheets — the vendor\'s records per found message, a local of ONE dialog (gone with it; never stored)',
  'src/lib/channels-panel.js|curBadges': 'lane channels-list-polish: account id → its badge spec (hue / internal / vendor glyph) of the last build — no words',
  'src/lib/channels-panel.js|chain': 'list name → how many pages read while its end stayed in view (a number)',
  'src/lib/channels-panel.js|chainTop': 'list name → the scroll box\'s scrollTop at its last page read (a number)',
  'src/lib/channels-panel.js|FOLD_LISTENERS': 'subscriber functions',
  'src/lib/channels-panel.js|rowMemo': 'key → {sig, el, r}: a row\'s signature holds lastText + lastCleared, so a cleared last line REPLACES the entry (and its row model)',
  'src/lib/channels-panel.js|memoSeen': 'keys drawn this pass',
  'src/lib/channels-panel.js|boxes': 'section containers by key',
  'src/lib/channels-panel.js|boxSeen': 'keys drawn this pass',
  'src/lib/session-props.js|ownedJobsMemo': 'conversation id → the owned-jobs rows of its last /api/jobs read (B-70f9 ②: id, name, clearedAt, state) — dropped on every jobs-updated (a clear\'s included) and re-asked; a cleared job paints clearedText() (G2, for-you-jobs verify r1)',
  'src/lib/session-props.js|browserSessionCounts': 'query → a count of browser sessions',
  'src/lib/sidebar-tasks.js|_pendingTaskBinds': 'webuiId → Task Group ids to bind',
  'src/lib/jobs-layout.js|ATTENTION_FAILED': 'a constant set of states',
  'src/lib/jobs-layout.js|RUNNING': 'a constant set of states',
  // locals of the PURE helpers at module level (one per call — they die with the call; declared so a NEW one is seen)
  'src/lib/user-todos-row.js|existing': 'a local of reconcileKeyed (DOM nodes by key, per call)',
  'src/lib/inbox-window-layout.js|ks': 'a local (keys, per call)',
  'src/lib/session-card.js|explicitIds': 'a local (Task Group ids, per render)',
  'src/lib/jobs-layout.js|sessions': 'a local of foldTasks (the fold model, per call over a fresh GET /api/jobs)',
  'src/lib/jobs-layout.js|live': 'a local of pruneFolds (keys, per call)',
  'src/lib/channels-panel.js|want': 'a local (keys, per call)',
  'src/lib/channels-panel.js|reading': 'list names with a page read in flight (design 008; a name, never a row)',
  'src/lib/channel-groups-view.js|adapterById': 'a local of the PURE row model (per call)',
  'src/lib/channel-groups-view.js|titles': 'a local (Task Group titles, per call)',
  'src/lib/channel-groups-view.js|ex': 'a local (ids, per call)',
  'src/lib/channel-groups-view.js|bySec': 'a local (picker sections, per call)',
  'src/lib/channel-groups-view.js|seen': 'a local (ids, per call)',
  'src/lib/channel-groups-view.js|named': 'a local (the member ids a text mentions, per call)',
};
const cacheCensus = (srcs) => {
  const rows = [];
  for (const rel of SURFACE_FILES) {
    const text = srcs.get(rel) || fs.readFileSync(path.join(ROOT, rel), 'utf8');
    text.split('\n').forEach((l) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      const m = /^(\s*)(?:(?:const|let|var)\s+(\w+)\s*=|this\.(\w+)\s*=|(\w+)\s*:)\s*new (Map|Set|WeakMap|WeakSet)\(/.exec(l);
      if (!m) return;
      const indent = m[1].length, name = m[2] || m[3] || m[4];
      if (indent > 4 && !m[3] && !m[4]) return;   // a local of a render function dies with the render
      if (m[2] && indent > 2) return;
      rows.push(`${rel}|${name}`);
    });
  }
  return [...new Set(rows)];
};
{
  const rows = cacheCensus(libSources());
  const unknown = rows.filter((r) => !(r in CACHES)), dead = Object.keys(CACHES).filter((k) => !rows.includes(k));
  ok(unknown.length === 0 && rows.length >= 25, `H4 every long-lived Map / Set a surface keeps is declared with what it holds (${rows.length})`, unknown);
  ok(dead.length === 0, 'H4 no dead declaration', dead);
}
// ── H5 ──
const REPAINT = [
  ['the Task Group log window', 'src/lib/task-log.js', /const onTasksMsg = \(msg\) => \{ if \(msg\.type === 'tasks-updated'\) refresh\(\); \};/],
  // verify r6: a row names EVERY statement its label claims — a list of patterns, each of which must hold (r5 wrote ③ as ONE
  // pattern `listener[\s\S]*|guard` — a top-level alternation that passed on the listener alone, so reverting the guard
  // kept H5 green; ④ and ⑤ pinned the listener only)
  ['the Task Group detail window (+ its Activity list under the typing guard, r5 ③)', 'src/lib/task-detail.js', [/const onTasksMsg = \(msg\) => \{ if \(msg\.type === 'tasks-updated'\) render\(\); \};/, /if \(_typing && _ae\.value\) \{ const pl = root\.querySelector\('\.task-detail-progress'\); if \(pl && !pl\.contains\(_ae\)\) \{ const st = pl\.scrollTop; fillProgress\(pl, task\); pl\.scrollTop = st; \} return; \}/]],
  ['the For-you model (every surface over it)', 'src/lib/user-todos-actions.js', /app\.ws\.onGlobal\(\(msg\) => \{ if \(msg\.type === 'user-todos-updated' && msg\.todos\) \{ liveSeen = true; setTodos\(msg\.todos\); \} \}\);/],
  ['the For-you popup + mini inbox (+ a live arrival toast, r5 ⑤)', 'src/lib/user-todos-panel.js', [/model\.on\('todos', \(next\) => apply\(next\)\);/, /for \(const el of document\.querySelectorAll\('#global-toasts > \.global-toast\[data-todo-id\]'\)\) \{\s*const it = byId\(el\.dataset\.todoId\);[\s\S]{0,240}?const want = `\$\{el\.dataset\.todoHead\} · \$\{nameFor\(it\.sessionKey, \[it\]\)\}: \$\{wordsOf\(it\)\}`;\s*if \(b\.textContent !== want\) b\.textContent = want;/]],
  ['the For-you window', 'src/lib/inbox-window.js', /model\.on\('todos', \(\) => render\(\), \{ signal \}\);/],
  // verify r7: a CLOSED popup holds no rows — every closer drops them (a draft kept first) and a render while closed drops them
  ['the For-you popup CLOSED (its rows leave with the close, verify r7)', 'src/lib/user-todos-panel.js', [/const hidePopup = \(\) => \{ popup\.classList\.add\('hidden'\); layout = null; dropRows\(\); \};/, /const dropRows = \(\) => \{ if \(!popup\.firstChild\) return; stashDrafts\(popup\); popup\.replaceChildren\(\); \};/, /onOutsidePress\(popup, hidePopup, \{/, /if \(popup\.classList\.contains\('hidden'\)\) \{ layout = null; dropRows\(\); return; \}/]],
  ['Session Properties (+ Now + history under the select guard, r5 ④)', 'src/lib/session-props.js', [/if \(!\['tasks-updated', 'session-status-updated', 'active-sessions', 'accounts-updated', 'user-state-updated'\]\.includes\(msg\.type\)\) return;/, /if \(root\.contains\(document\.activeElement\) && document\.activeElement\.tagName === 'SELECT'\) \{\s*const nv = root\.querySelector\('\.sp-now-value'\);\s*if \(nv\) \{ const h = nowHtml\(s\); if \(nv\.innerHTML !== h\) nv\.innerHTML = h; \}\s*const hl = root\.querySelector\('\.session-history-list'\);\s*if \(hl\) fillHistory\(hl, s\);\s*return;\s*\}/]],
  ['the sidebar session card\'s history (a named clear passes the change guard, r5 ②)', 'src/lib/sidebar-tasks.js', /const changed = sig !== this\._statusSig \|\| \(Array\.isArray\(msg\.cleared\) && msg\.cleared\.length > 0\);/],
  ['the Background Work window', 'src/lib/jobs-panel.js', /const off = app\.ws\.onGlobal\(\(msg\) => \{ if \(msg\.type === 'jobs-updated'\) render\(\); \}\);/],
  ['the Background Work rail panel (rebuilt on every jobs-updated)', 'src/lib/sidebar-rail.js', /if \(msg\.type === 'jobs-updated'\) \{\s*this\._railRefreshBadges\(\);\s*if \(this\._activeTab === 'jobs'\) \{ this\.listEl\.querySelector\('\.rail-panel-jobs'\)\?\.remove\(\); this\._renderRailPanel\(\); \}/],
  ['the Job input window (r5 ①)', 'src/lib/jobs-panel.js', /if \(msg\.type === 'jobs-updated' && \(msg\.id === jobId \|\| \(Array\.isArray\(msg\.cleared\) && msg\.cleared\.includes\(jobId\)\)\)\) render\(\);/],
  ['an agent group\'s window (the cleared rows in place + pages in flight, r5 ⑧; + the FIRST page in flight, verify r6)', 'src/lib/channel-window.js', [/if \(Array\.isArray\(msg\.cleared\)\) \{ for \(const c of msg\.cleared\) if \(c && c\.groupId === groupId && c\.record\) \{ drawn\.set\(c\.vendorId, c\.record\); clearedSeen\.set\(c\.vendorId, c\.record\); \} \}\s*if \(!group\) \{ if \(g\) group = g; return; \}/, /if \(Array\.isArray\(msg\.cleared\)\) patchCleared\(msg\.cleared\);/, /const g0 = groupGen;\s*const r = await fetchJson\(`\/api\/channel-groups\/[^\n]*\n\s*if \(!r \|\| r\.error\) return \{ error: r \|\| \{\} \};\s*if \(r\.group && groupGen === g0\) group = r\.group;/]],
  ['the Channels panel\'s group rows (+ a refresh never replaces a newer list, verify r6)', 'src/lib/channels-panel.js', [/if \(msg\.type === 'channel-groups-updated'\) \{\s*if \(!Array\.isArray\(msg\.groups\)\) return;\s*groups = msg\.groups; groupsGen\+\+;[^\n]*\n\s*if \(digest === null\) return;[^\n]*\n\s*draw\(\);/, /const g0 = groupsGen;[\s\S]{0,900}?if \(groupsGen !== g0\) \{/]],
];
const repaintCensus = (srcs) => REPAINT.filter(([, f, re]) => { const src = srcs.get(f) || fs.readFileSync(path.join(ROOT, f), 'utf8'); return !(Array.isArray(re) ? re : [re]).every((r) => r.test(src)); }).map(([n]) => n);
{
  const missing = repaintCensus(libSources());
  ok(missing.length === 0, `H5 each of the ${REPAINT.length} surfaces re-renders from the CURRENT record on its store's broadcast (the clear's frame included)`, missing);
}
// verify r7: the popup has ONE closer — a site that only hides it would leave its rows (the words) in the hidden DOM
const oneCloser = (src) => (src.match(/\bpopup\.classList\.add\('hidden'\)/g) || []).length === 1 && /const hidePopup = \(\) => \{ popup\.classList\.add\('hidden'\);/.test(src);
ok(oneCloser(read('src/lib/user-todos-panel.js')), 'H5 …the For-you popup has ONE closer (hidePopup — its rows leave with it): no other site hides the popup and leaves its rows (verify r7)');
// ── H7 ORDER (verify r6 — census adequacy: r5 ④'s latest-fill guard reverted on a copy turned NO gate red — not the
// census, not the chrome census, not the fix's own pin, which matched the catch branch's twin) ──
// Every client GET of a route that serves the five stores' words (/api/tasks, /api/user-todos, /api/session-status,
// /api/jobs, /api/channel-groups — grep-derived over src/lib/** + src/client.js, a write verb excluded by its `method`)
// is judged against ONE table: the guard its answer passes before it paints — the latest render wins (`latest`), a store
// generation says a broadcast landed meanwhile (`generation`), the record is asked isCleared again after the GET
// (`recheck`), a clear's records are substituted (`substitute`), the answer lands only in a container its own render
// made (`own-container`) — or a declaration that it carries counts / no record words. A NEW fetch of those routes is
// RED until it says which; a guard removed from a site is RED (the site matches no row).
const FIVE_ROUTE = /^[`'"]\/api\/(tasks|user-todos|session-status|jobs|channel-groups)(?=[/?`'"]|$)/;
const ORDER_KINDS = new Set(['latest', 'generation', 'recheck', 'substitute', 'own-container', 'counts', 'no-words']);
const ORDER = [
  // [file, a snippet of the call's line, THE GUARD — a pattern anchored AT the call (`^` = the call itself), so it names the
  // FIRST handling of the answer, never a twin further on (the r5 ④ lesson: its own pin matched the catch branch's copy);
  // [pre, post] when the generation is taken on the line before — or null for a declaration, the kind, why]
  ['src/lib/jobs-panel.js', "const [r] = await Promise.all([fetchJson('/api/jobs'), loadFolds(app)]);", /^[^\n]*\n\s*if \(seq !== renderSeq\) return;/, 'latest', 'the Background Work window: every render bumps renderSeq and an answer older than the newest render is dropped (r5 ⑧)'],
  ['src/lib/jobs-panel.js', "const [r] = await Promise.all([fetchJson('/api/jobs'), loadFolds(app)]);", /^[^\n]*\n\s*if \(!c\.isConnected\) return;/, 'own-container', 'the rail panel: every jobs-updated rebuilds it into a FRESH container (sidebar-rail) and an answer lands only in the container its render was made for'],
  ['src/lib/jobs-panel.js', 'const r = await fetchJson(`/api/jobs/${jobId}`);', /^[^\n]*\n\s*if \(seq !== renderSeq\) return;/, 'latest', 'the Job input window: the latest render paints (r5 ①)'],
  ['src/lib/jobs-panel.js', "fetchJson('/api/jobs?archived=1').then((r) => {", /^[^\n]*\n\s*if \(!box\.isConnected\) return;/, 'own-container', 'the archived list: its box is made by the render that fetched it, and every render replaces the list'],
  ['src/lib/jobs-panel.js', 'const r = await fetchJson(`/api/jobs/${j.id}?tail=60`);', null, 'own-container', 'an expanded card\'s detail: the answer paints only into the detail element the same call made, and every list render (a clear\'s jobs-updated included) replaces the card'],
  ['src/lib/chat-view.js', "fetchJson('/api/jobs').then((r) => { if (r && r.held) this._applyJobsHeld(r.held); })", null, 'counts', 'the held-notifications chip: the held digest\'s counts and reason codes — no job words'],
  ['src/lib/sidebar-rail.js', "const jb = await fetchJson('/api/jobs').catch(() => null);", null, 'counts', 'the rail badge: badgeCounts + the held digest\'s counts and reason codes — no job words'],
  ['src/lib/sidebar-rail.js', "fetchJson('/api/channel-groups').then((r) => { if (r && Array.isArray(r.groups)) this._railChanBadge(", null, 'counts', 'the rail badge: the groups\' unread counts — no message words'],
  ['src/lib/channel-group-dialogs.js', "const r = await fetchJson('/api/channel-groups/roster');", null, 'no-words', 'the invite roster: live sessions (ids + their own names) — no group message'],
  ['src/lib/user-todos-actions.js', 'const p = fetchJson(`/api/user-todos/${encodeURIComponent(id)}`).then((r) => {', /^[^\n]*\n(?:(?![^\n]*fullById\.set)[^\n]*\n){0,4}?\s*if \(isCleared\(byId\(id\)\) \|\| \(r && r\.item && isCleared\(r\.item\)\)\) return/, 'recheck', 'ensureDetail: the live record AND the answer are asked isCleared after the GET, before the detail is kept — a detail cleared while it was on its way is never kept'],
  ['src/lib/session-props.js', "fetchJson('/api/jobs').then((r) => {", /^[^\n]*\n\s*if \(gen !== ownedJobsGen\) return;/, 'generation', 'the owned-jobs list (B-70f9 ②): every jobs-updated bumps ownedJobsGen and drops the memo — a read begun before a clear is discarded, the repaint asks again (G2, for-you-jobs verify r1)'],
  ['src/lib/user-todos-actions.js', "if (connected) { const g0 = gen; fetchJson('/api/user-todos')", /^fetchJson\('\/api\/user-todos'\)\.then\(\(d\) => \{ if \(d\?\.todos && gen === g0\) setTodos\(d\.todos\);/, 'generation', 'the For-you reconnect resync: a list older than a snapshot the model applied meanwhile is dropped (r5 ⑧)'],
  ['src/lib/user-todos-actions.js', "fetchJson('/api/user-todos').then((d) => { if (d?.todos && !liveSeen) setTodos(d.todos); });", /^fetchJson\('\/api\/user-todos'\)\.then\(\(d\) => \{ if \(d\?\.todos && !liveSeen\) setTodos\(d\.todos\);/, 'generation', 'the For-you first load: dropped once any broadcast was applied (liveSeen)'],
  ['src/lib/channel-window.js', 'const r = await fetchJson(`/api/channel-groups/${encodeURIComponent(groupId)}/messages?${q}`);', /^[^\n]*\n(?:(?![^\n]*(?:innerHTML|textContent|appendChild))[^\n]*\n){0,4}?\s*return \{ n: place\(recs, \{ prepend \}\) \};/, 'substitute', 'a group page goes straight to place(), which draws every record a clear broadcast named from clearedSeen, never the page\'s copy (r5 ⑧; the substitution is pinned file-wide below)'],
  ['src/lib/channels-panel.js', "const [d, g] = await Promise.all([fetchJson('/api/channels'), fetchJson('/api/channel-groups'), loadFolds(app)]);", [/const g0 = groupsGen;\s*const \[d, g\] = await Promise\.all\(\[fetchJson\('\/api\/channels'\), $/, /^[^\n]*\n(?:(?![^\n]*groups = )[^\n]*\n){0,6}?\s*if \(groupsGen !== g0\) \{/], 'generation', 'the Channels panel: a refresh keeps its group list only when no broadcast landed while it waited (verify r6 ②)'],
  ['src/lib/session-card.js', 'fetch(`/api/session-status/history?sessionKey=${encodeURIComponent(keys)}`)', /^[^\n]*\n\s*\.then\(r => r\.json\(\)\)\.then\(d => \{\s*const hist = [^\n]*\n\s*if \(!hist\.length \|\| !histWrap\.isConnected\) return;/, 'own-container', 'the sidebar card\'s history: its container is made by the card render that fetched it, and a status frame (a clear\'s named one included, r5 ②) re-renders the card'],
  ['src/lib/session-props.js', 'fetch(`/api/session-status/history?sessionKey=${encodeURIComponent(keys)}`).then(r => {', /^[^\n]*\n(?:[^\n]*\n){0,3}?\s*\}\)\.then\(d => \{\s*if \(!histList\.isConnected \|\| histList\._fill !== my\) return;/, 'latest', 'Session Properties\' history: the latest fill paints (r5 ④)'],
  ['src/lib/sidebar-tasks.js', "return fetch('/api/session-status').then(", [/const gen = this\._statusGen \|\| 0;\s*return $/, /^fetch\('\/api\/session-status'\)\.then\(r => r\.ok \? r\.json\(\) : null\)\.then\(d => \{\s*if \(!d\?\.statuses \|\| \(this\._statusGen \|\| 0\) !== gen\) return;/], 'generation', 'the status mirror (the page load + the reconnect resync): dropped when a status frame landed meanwhile (verify r6 ②)'],
  ['src/lib/task-log.js', 'const r = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/progress?before=${encodeURIComponent(before)}&limit=100`).then((x) => (x.ok ? x.json() : null));', /^[^\n]*\n\s*if \(g0 !== older\.gen\) return;/, 'generation', 'the Task log\'s older entries (2.369.204): a clear that reached the archive bumps older.gen (the group\'s archiveClearedAt moved) and re-reads the held rows — a page begun before it is dropped'],
  ['src/lib/sidebar-tasks.js', "const res = await fetch('/api/tasks');", [/const gen = this\._tasksGen \|\| 0;\s*try \{\s*const res = await $/, /^[^\n]*\n(?:(?![^\n]*this\._tasks = )[^\n]*\n){0,3}?\s*if \(\(this\._tasksGen \|\| 0\) !== gen\) \{/], 'generation', 'the Task Group mirror: dropped when a tasks-updated landed meanwhile (R4 verify r1)'],
];
const callArgs = (text, open) => { let d = 0; for (let i = open; i < text.length; i++) { const c = text[i]; if (c === '(') d++; else if (c === ')') { d--; if (d === 0) return text.slice(open + 1, i); } } return ''; };
const orderSites = (srcs) => {
  const sites = [];
  for (const [rel, text] of srcs) {
    for (const m of text.matchAll(/\b(fetchJson|fetch)\s*\(/g)) {
      const open = m.index + m[0].length - 1;
      const args = callArgs(text, open);
      if (!FIVE_ROUTE.test(args.trimStart()) || /\bmethod\s*:\s*['"`](POST|PUT|PATCH|DELETE)/i.test(args)) continue;
      const ls = text.lastIndexOf('\n', m.index) + 1, le = text.indexOf('\n', m.index);
      sites.push({ rel, at: `${rel}:${text.slice(0, m.index).split('\n').length}`, line: text.slice(ls, le < 0 ? text.length : le), before: text.slice(Math.max(0, m.index - 400), m.index), after: text.slice(m.index, m.index + 1200) });
    }
  }
  return sites;
};
const substituteOk = (src) => /function place\(recs, \{ prepend = false \} = \{\}\) \{\s*const fresh = recs\.filter\(\(r\) => r && !seen\.has\(r\.vendorId\)\)\.map\(\(r\) => clearedSeen\.get\(r\.vendorId\) \|\| r\);/.test(src)
  && /drawn\.set\(c\.vendorId, c\.record\); clearedSeen\.set\(c\.vendorId, c\.record\);/.test(src);
const orderCensus = (srcs) => {
  const sites = orderSites(srcs);
  const unguarded = [], used = new Set();
  for (const s of sites) {
    const holds = (g) => !g || (Array.isArray(g) ? g[0].test(s.before) && g[1].test(s.after) : g.test(s.after));
    const rows = ORDER.filter(([f, snip, guard]) => f === s.rel && s.line.includes(snip) && holds(guard));
    if (rows.length !== 1) unguarded.push({ at: s.at, rows: rows.length, line: s.line.trim().slice(0, 140) });
    else used.add(rows[0]);
  }
  return { sites, unguarded, dead: ORDER.filter((r) => !used.has(r)).map(([f, snip]) => `${f}: ${snip.slice(0, 60)}`) };
};
{
  const { sites, unguarded, dead } = orderCensus(libSources());
  ok(sites.length >= 18 && unguarded.length === 0, `H7 ORDER: every client GET of a five-store route (${sites.length}) passes a guard before it paints — the latest render, a generation, a re-check, a substitution, its own container — or declares it carries no record words`, unguarded);
  ok(dead.length === 0, 'H7 no dead row', dead);
  ok(ORDER.every(([, , , kind, why]) => ORDER_KINDS.has(kind) && why.length >= 30) && ORDER.filter(([, , g]) => !g).every(([, , , kind]) => ['own-container', 'counts', 'no-words'].includes(kind)), 'H7 every row names its kind and why; a row with no guard pattern is a declaration (counts / no words / its own element)');
  ok(substituteOk(read('src/lib/channel-window.js')), 'H7 …and the group window\'s place() substitutes every record a clear named (the `substitute` row\'s guard, file-wide)');
}
const CLIENT_EXCEPTIONS = [
  ['a chat window\'s peer / notification cards and the chat transcript', 'delivered words — the transcript class (server §F); the chat view is a transcript surface'],
  ['the owner\'s own typed text: the Find box, an unsent reply (model.drafts), a composer draft (data/drafts.json)', 'the owner\'s words, not a record\'s — a Find that holds the words is the owner looking for them'],
  ['the clipboard after the For-you window\'s Copy / a task log\'s Copy as markdown', 'the owner\'s own act — the system clipboard is outside the page and the clear\'s reach'],
  ['a confirm dialog or a context menu open across another device\'s clear', 'transient (its answer is the store\'s: a clear of a cleared record answers already); the menus of a cleared record offer no clear'],
  ['the status popover\'s Reason box open across a clear', 'transient, like an open menu: the words stay in the box until it closes; Apply sends the LIVE reason for an untouched prefill (verify r6 — a cleared one is dropped) and a popover opened after the clear offers nothing (the belt row)'],
  ['the incident recorder\'s rings + scene', 'element descriptors, special keys, ws TYPES, console lines, window titles ≤ 60 chars — no surface logs a record\'s words (H3 covers console lines in the surface files) and the one title that names a record is redrawn on the clear (r5 ①); the chrome census captures an incident after the clear and greps it'],
  ['Chrome\'s own layout cache of a detached element', 'a <select> is its picker\'s anchor: a detached one stays listed in its block\'s cached AnchorMap until that block lays out again — the browser\'s, unreachable to the page (the heap judge never expands those nodes; its control proves it still sees a word the page holds)'],
  ['lane-stash-detail\'s strip previews + the hand-over card\'s expander (0e324b5f, NOT in this lane — TO RE-CENSUS AT INTEGRATION)', 'ride the `stash` fact recomputed per active-sessions frame and are patched by digest — no client cache; a cleared entry\'s text IS the sentence (r3 f3e; r6 probe-merged the branch: every lane suite green). Owed at integration: add src/lib/stash-strip.js to §H3\'s SURFACE_FILES, and word a cleared preview — previewWords prints the stored English key for a cleared entry\'s head and label on a zh / ja device (the r4 board-chip / r5 ⑨ class, LOW); the card\'s expander shows what the hand-over DELIVERED (the transcript class, in the normalizer\'s memory, replaced by the transcript\'s own record on a rebuild)'],
];
{
  ok(CLIENT_EXCEPTIONS.every(([, why]) => why.length >= 40), `§H ${CLIENT_EXCEPTIONS.length} declared client exceptions, each with a reason`);
  for (const [what, why] of CLIENT_EXCEPTIONS) console.log(`  · client exception: ${what} — ${why}`);
  const walkSrc = read('scripts/test-record-clear-client.mjs');
  ok(/heapHolds\(P1, 'A'\)/.test(walkSrc) && /heapHolds\(P2, 'A'\)/.test(walkSrc) && /localStorage', 'sessionStorage'\]/.test(walkSrc) && /indexedDB\.databases/.test(walkSrc) && /caches\.keys\(\)/.test(walkSrc) && /layoutsHave\('A'\)/.test(walkSrc) && /autoCaptureIncident\(/.test(walkSrc), '§H the chrome half greps the DOM, both storages, IndexedDB, CacheStorage, both clients\' heaps, data/layouts.json and an incident captured after the clear');
}
// ── H6 CONTROLS ──
console.log('§H6 controls: one client-side copy per class, each RED on its leg');
{
  // 1. a new storage key holding a record's words (the For-you window remembers the selected item's text)
  const r1 = 'src/lib/inbox-window.js', s1 = read(r1), a1 = "  const textOf = (i) => [";
  ok(s1.includes(a1), 'H6 control 1 anchor present');
  const m1 = MUT.write(r1, s1.replace(a1, "  const rememberLast = (i) => { try { localStorage.setItem('vibespace.inboxLast', model.wordsOf(i)); } catch { } };\n" + a1), 'storage-holds-words');
  const c1 = storageWrites(libSources({ [r1]: m1 }));
  ok(c1.rows.filter((r) => !(r in STORAGE)).join() === "src/lib/inbox-window.js|localStorage|'vibespace.inboxLast'", 'CONTROL 1: a new key holding the selected item\'s words is RED under H1 (an unclassified storage write)', c1.rows.filter((r) => !(r in STORAGE)));
  // 2. a window title reading a record's words on a window whose layout record KEEPS its title (the task log)
  const r2 = 'src/lib/task-log.js', s2 = read(r2), a2 = "    app.wm.setTitle(winInfo.id, task.title + ' — ' + t('Log'));\n\n    // Preserve focus";
  ok(s2.includes(a2), 'H6 control 2 anchor present');
  const m2 = MUT.write(r2, s2.replace(a2, "    app.wm.setTitle(winInfo.id, (task.progress || []).map((p) => (isCleared(p) ? clearedText() : p.note)).pop() + ' — ' + t('Log'));\n\n    // Preserve focus"), 'title-reads-words');
  const c2 = titleCensus(libSources({ [r2]: m2 }));
  const bad2 = c2.filter((r) => !Object.prototype.hasOwnProperty.call(PERSIST.WORDLESS_TITLES, r.action));
  ok(bad2.length === 1 && bad2[0].action === 'openTaskLog', 'CONTROL 2: a task log window titled by its newest note is RED under H2 (its layout record would keep the words)', bad2);
  // 3. THE r4 PATTERN in a keyed renderer: `{ text: p.note }` captured into a module Map when the row is added
  const r3 = 'src/lib/task-log.js', a3 = '  const buildActRow = (p) => {\n    const k = keyOf(p);';
  ok(s2.includes(a3), 'H6 control 3 anchor present');
  const m3 = MUT.write(r3, s2.replace(a3, a3 + '\n    CAPTURED.set(k, { text: p.note, at: p.at });').replace("import { escHtml, showToast, showContextMenu } from './utils.js';", "import { escHtml, showToast, showContextMenu } from './utils.js';\nconst CAPTURED = new Map();"), 'row-captures-text');
  const srcs3 = libSources({ [r3]: m3 });
  const u3 = beltCensus(srcs3).filter((h) => !h.declared), k3 = cacheCensus(srcs3).filter((r) => !(r in CACHES));
  ok(u3.length === 1 && /CAPTURED\.set\(k, \{ text: p\.note/.test(u3[0].line) && k3.join() === 'src/lib/task-log.js|CAPTURED', 'CONTROL 3: a row that captures `{ text: p.note }` into a module Map at add time is RED under H3 (the words, uncleared) AND H4 (an undeclared cache)', { belt: u3, caches: k3 });
  // 4. a repaint that ignores the clear (the Job input window listening to its own id only — the pre-r5 listener)
  const r4 = 'src/lib/jobs-panel.js', s4 = read(r4), a4 = "if (msg.type === 'jobs-updated' && (msg.id === jobId || (Array.isArray(msg.cleared) && msg.cleared.includes(jobId)))) render();";
  ok(s4.includes(a4), 'H6 control 4 anchor present');
  const m4 = MUT.write(r4, s4.replace(a4, "if (msg.type === 'jobs-updated' && msg.id === jobId) render();"), 'repaint-ignores-clear');
  const c4 = repaintCensus(libSources({ [r4]: m4 }));
  ok(c4.length === 1 && /Job input/.test(c4[0]), 'CONTROL 4: a Job input window that ignores its job\'s clear is RED under H5', c4);
  // 5. verify r6 (census adequacy): each r5 repaint a row's label CLAIMS, reverted on a copy, reddens exactly its own row —
  // ③ the detail window's typing guard, ④ Session Properties' select guard, ⑤ the live arrival toast's re-word loop
  const REV5 = [
    ['src/lib/task-detail.js', "if (_typing && _ae.value) { const pl = root.querySelector('.task-detail-progress'); if (pl && !pl.contains(_ae)) { const st = pl.scrollTop; fillProgress(pl, task); pl.scrollTop = st; } return; }", 'if (_typing && _ae.value) return;', /Task Group detail window/, 'repaint-detail-guard'],
    ['src/lib/session-props.js', "    if (root.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') {\n      const nv = root.querySelector('.sp-now-value');\n      if (nv) { const h = nowHtml(s); if (nv.innerHTML !== h) nv.innerHTML = h; }\n      const hl = root.querySelector('.session-history-list');\n      if (hl) fillHistory(hl, s);\n      return;\n    }\n", "    if (root.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;\n", /Session Properties/, 'repaint-props-guard'],
    ['src/lib/user-todos-panel.js', "      const want = `${el.dataset.todoHead} · ${nameFor(it.sessionKey, [it])}: ${wordsOf(it)}`;\n      if (b.textContent !== want) b.textContent = want;\n", '', /live arrival toast/, 'repaint-toast-reword'],
  ];
  for (const [rel, from, to, want, tag] of REV5) {
    const src = read(rel);
    ok(src.split(from).length === 2, `H6 control 5 (${tag}) anchor present once`);
    const c5 = repaintCensus(libSources({ [rel]: MUT.write(rel, src.replace(from, to), tag) }));
    ok(c5.length === 1 && want.test(c5[0]), `CONTROL 5 (verify r6): the r5 repaint reverted on a copy (${tag}) is RED under H5 on exactly its own row`, c5);
  }
  // 6. verify r6 (census adequacy — THE ORDER CLASS): each order guard of r5 / r6 removed on a copy leaves its site matched by
  // no H7 row — RED on exactly that site; and a NEW painter of a five-store GET is RED until the table names its guard
  const REV6 = [
    ['src/lib/session-props.js', "    }).then(d => {\n      if (!histList.isConnected || histList._fill !== my) return;\n", "    }).then(d => {\n      if (!histList.isConnected) return;\n", 'order-props-fill'],
    ['src/lib/jobs-panel.js', "    const r = await fetchJson(`/api/jobs/${jobId}`);\n    if (seq !== renderSeq) return;\n", "    const r = await fetchJson(`/api/jobs/${jobId}`);\n", 'order-interact-seq'],
    ['src/lib/jobs-panel.js', "    const [r] = await Promise.all([fetchJson('/api/jobs'), loadFolds(app)]);\n    if (seq !== renderSeq) return;\n", "    const [r] = await Promise.all([fetchJson('/api/jobs'), loadFolds(app)]);\n", 'order-jobswin-seq'],
    ['src/lib/user-todos-actions.js', "if (d?.todos && gen === g0) setTodos(d.todos);", 'if (d?.todos) setTodos(d.todos);', 'order-resync-gen'],
    ['src/lib/sidebar-tasks.js', "if (!d?.statuses || (this._statusGen || 0) !== gen) return;", 'if (!d?.statuses) return;', 'order-status-gen'],
    ['src/lib/inbox-window.js', "  const textOf = (i) => [", "  fetchJson('/api/user-todos').then((d) => { if (d && d.todos) model.replace?.(d.todos); });\n  const textOf = (i) => [", 'order-new-painter'],
  ];
  {
    const rel = 'src/lib/channel-window.js', src = read(rel), from = '.map((r) => clearedSeen.get(r.vendorId) || r);';
    ok(src.split(from).length === 2, 'H6 control 6 (order-page-unsubstituted) anchor present once');
    ok(!substituteOk(fs.readFileSync(MUT.write(rel, src.replace(from, ';'), 'order-page-unsubstituted'), 'utf8')), 'CONTROL 6 (verify r6): order-page-unsubstituted — a group window whose place() draws a page\'s copy as it came is RED under H7\'s substitution check');
  }
  for (const [rel, from, to, tag] of REV6) {
    const src = read(rel);
    ok(src.split(from).length === 2, `H6 control 6 (${tag}) anchor present once`);
    const r6 = orderCensus(libSources({ [rel]: MUT.write(rel, src.replace(from, to), tag) }));
    ok(r6.unguarded.length === 1 && r6.unguarded[0].at.startsWith(rel + ':'), `CONTROL 6 (verify r6): ${tag} — the site is RED under H7 (no row's guard holds for it), and only it`, r6.unguarded);
  }
  // 7. verify r6: the fold key spelled with the family again (the pre-r6 jobs-layout) is RED under H1b's real-module proof
  {
    const rel = 'src/lib/jobs-layout.js', src = read(rel), from = "    const gkey = sessionKey + '|' + familyKey(family);";
    ok(src.split(from).length === 2, 'H6 control 7 (fold-key-spells-family) anchor present once');
    const f7 = await foldsCarryWords(MUT.write(rel, src.replace(from, "    const gkey = sessionKey + '|' + family;"), 'fold-key-spells-family', { esm: true }));
    ok(f7.words.length === 2 && !f7.valid, 'CONTROL 7 (verify r6): a fold key spelled with the job family is RED under H1b (the persisted map would keep the name)', f7);
  }
  // 8. verify r6: a NEW user-state write (the For-you window remembering the selected item's words on the server) is RED
  {
    const rel = 'src/lib/inbox-window.js', src = read(rel), a = "  const textOf = (i) => [";
    const m8 = MUT.write(rel, src.replace(a, "  const rememberLast = (i) => fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inboxLast: model.wordsOf(i) }) });\n" + a), 'user-state-holds-words');
    const u8 = userStateWrites(libSources({ [rel]: m8 })).filter((r) => !(r in USER_STATE));
    ok(u8.join() === 'src/lib/inbox-window.js|inboxLast', 'CONTROL 8 (verify r6): a new server-side user-state key holding the selected item\'s words is RED under H1b (an unclassified write)', u8);
  }
  // 9. verify r7: the client's capture recording the raw title again (the pre-r7 captureState) is RED under H2b
  {
    const rel = 'src/lib/layout.js', src = read(rel), from = 'title: wordlessTitleOf(win._openSpec, win.title), type: win.type,';
    ok(src.split(from).length === 2, 'H6 control 9 (capture-keeps-title) anchor present once');
    const c9 = captureTitled(fs.readFileSync(MUT.write(rel, src.replace(from, 'title: win.title, type: win.type,'), 'capture-keeps-title', { esm: true }), 'utf8'));
    ok(!c9.wordless && c9.raw, 'CONTROL 9 (verify r7): a captureState that records `title: win.title` (every page-side layout record would keep the job\'s name) is RED under H2b', c9);
  }
  // 10. verify r7: a NEW page-side holder of layout records (a desktop cache built from the live windows, titles and all) is RED
  {
    const rel = 'src/lib/desktop-manager.js', src = read(rel), a = '  _updateCachedDesktop(desktopId, { from = null, ids = [], replaces = [] } = {}) {\n';
    ok(src.split(a).length === 2, 'H6 control 10 (new-titled-holder) anchor present once');
    const m10 = MUT.write(rel, src.replace(a, "  _snapshotAll() { for (const d of this._desktops) this._savedStates.set(d.id, { windows: [...this.app.wm.windows.values()].filter((w) => w._desktopId === d.id).map((w) => ({ winId: w.id, title: w.title, openSpec: w._openSpec })) }); }\n" + a), 'new-titled-holder', { esm: true });
    const bad10 = holderSites(libSources({ [rel]: m10 })).filter((s) => s.rows.length !== 1 || (s.rows[0][2] === 'capture' && !s.captured) || (s.rows[0][2] === 'merge' && !s.merged));
    ok(bad10.length === 1 && bad10[0].at.startsWith(rel + ':') && /_snapshotAll/.test(bad10[0].line), 'CONTROL 10 (verify r7): a new page-side holder of layout records (a desktop cache built from the live windows with their titles) is RED under H2b, and only it', bad10);
  }
  // 11. verify r7: a NEW server-persisted store a client writes (a SyncStore remembering the For-you window's last item) is RED
  {
    const rel = 'server.js', src = read(rel), a = "syncStores.stage = new SyncStore('stage', ";
    ok(src.split(a).length === 2, 'H6 control 11 (new-sync-store) anchor present once');
    const m11 = MUT.write(rel, src.replace(a, "syncStores.inboxLast = new SyncStore('inboxLast', path.join(__dirname, 'data', 'inbox-last.json'), wss);\n" + a), 'new-sync-store');
    const u11 = serverStores(sources({ [rel]: m11 })).filter((r) => !(r in SERVER_STORES));
    ok(u11.join() === 'sync:inboxLast', 'CONTROL 11 (verify r7): a new SyncStore a client writes is RED under H1c until it names its gate or its reason', u11);
  }
  // 12. verify r7: a NEW config-export section (the For-you items) is RED under H1c — and the walk's export probe no longer covers every section
  {
    const rel = 'src/routes/persistence.js', src = read(rel), a = "    take('pricing', ";
    ok(src.split(a).length === 2, 'H6 control 12 (new-export-section) anchor present once');
    const m12 = MUT.write(rel, src.replace(a, "    take('todos', () => null);\n" + a), 'new-export-section');
    const r12 = serverStores(sources({ [rel]: m12 }));
    ok(r12.filter((r) => !(r in SERVER_STORES)).join() === 'export:todos' && !/'todos'/.test(read('scripts/test-record-clear-walk.mjs').split("{every section}")[1].split('\n')[0]), 'CONTROL 12 (verify r7): a new export section is RED under H1c (and the walk\'s probe, which names every section, would not export it)', r12.filter((r) => !(r in SERVER_STORES)));
  }
  // 13. verify r7: the outside press only HIDING the popup again (its rows — a record cleared meanwhile — stay in the DOM)
  {
    const rel = 'src/lib/user-todos-panel.js', src = read(rel), from = '  onOutsidePress(popup, hidePopup, {';
    ok(src.split(from).length === 2, 'H6 control 13 (closer-keeps-rows) anchor present once');
    const m13 = MUT.write(rel, src.replace(from, "  onOutsidePress(popup, () => popup.classList.add('hidden'), {"), 'closer-keeps-rows', { esm: true });
    const c13 = repaintCensus(libSources({ [rel]: m13 }));
    ok(c13.length === 1 && /For-you popup CLOSED/.test(c13[0]) && !oneCloser(fs.readFileSync(m13, 'utf8')), 'CONTROL 13 (verify r7): an outside press that only hides the popup (the pre-r7 closer) is RED under H5 on exactly the closed-popup row, and the one-closer check', c13);
  }
  // …and no row can pass on half of what it claims again: a top-level `|` in a pattern is refused
  const topAlt = (src) => { let d = 0, cls = false; for (let i = 0; i < src.length; i++) { const c = src[i]; if (c === '\\') { i++; continue; } if (cls) { if (c === ']') cls = false; continue; } if (c === '[') cls = true; else if (c === '(') d++; else if (c === ')') d--; else if (c === '|' && d === 0) return true; } return false; };
  ok(REPAINT.every(([, , re]) => (Array.isArray(re) ? re : [re]).every((r) => !topAlt(r.source))) && topAlt('a[\\s\\S]*|b') && !topAlt('(a|b)c'), 'H5 no row\'s pattern is a top-level alternation (one that passes on half of the row\'s claim)');
  for (const row of copiesCensus(MUT.files, MUT.dir, ROOT, { minCopies: 26, label: '§H6 ' })) ok(row.pass, row.name, row.detail);
}

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
const I_BIN = fs.readdirSync(path.join(ROOT, 'data/bin'), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => 'data/bin/' + e.name);
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
const iSources = (override = {}) => new Map(I_FILES.map((rel) => [rel, fs.readFileSync(override[rel] || path.join(ROOT, rel), 'utf8')]));
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
const iIsLib = (rel) => rel.startsWith('src/lib/') || rel === 'src/client.js';
// [sink id, callee test (callee, rel, the text before the call), where its words go]
const I_SINKS = [
  ['toast', (c) => /(^|\.)showToast$/.test(c), 'a toast — and EVERY toast is kept in the device\'s toast history (localStorage vibespace.toastHistory → the For-you Notifications tab), past any clear'],
  ['dialog', (c) => /(^|\.)(showConfirmDialog|showInputDialog)$/.test(c), 'a confirm / input dialog, open until answered'],
  ['title', (c) => /(^|\.)(setTitle|createWindow)$/.test(c), 'a window title — the taskbar, data/layouts.json (§H2), an incident\'s scene'],
  ['notice', (c) => /(^|\.)serverNotice$/.test(c), 'a server notice: a toast on every device (→ every device\'s toast history)'],
  ['telemetry', (c, rel, before) => (iIsLib(rel) && /^(track|metric)$/.test(c)) || (c === 'record' && /(telemetry|getTelemetry\??\.?\(\)|\btel)\??\.$/.test(before)) || /(^|\.)telemetry\.record$/.test(c) || /^(global\.)?__vsEvent$/.test(c), 'data/telemetry → the Diagnostics window (errors, drift rows, by-event tables) — `global.__vsEvent(name, detail)` included (server.js: a telemetry event)'],
  ['error', (c) => /^(new )?(Error|TypeError|RangeError)$/.test(c), 'an Error: a route answers `{error: e.message}` (→ a client toast); an uncaught one → telemetry `server-error`'],
  ['todo', (c) => /(^|\.)(userTodos|todos)(\(\))?\.add$/.test(c) || /(^|\.)notifyUser$/.test(c), 'a For-you item — a DERIVED record when made from another record\'s words'],
  ['activity', (c) => /(^|\.)addProgress$/.test(c), 'an Activity entry'],
  ['status', (c) => /(^|\.)(pushNotice|setByAgent|setByUser|noteEvent)$/.test(c), 'a status entry / a notice queued for the agent\'s next turn'],
  ['peer', (c) => /(^|\.)(deliverToConversation|_notifyOwner|_deliverTo|postToPeer|emitPeerCard|injectPeerCard|feedPeerCard)$/.test(c), 'a delivery into a conversation (the agent\'s context + the chat card drawn for it)'],
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
const I_CHECK = {
  // `length`: the line prints a record's SIZE, never its words — every mention of the read is inside B(…) / byteLength(…) / .length
  length: (args, read) => { const r = iEsc(read); const code = iCode(args).replace(new RegExp(String.raw`\b(B|Buffer\.byteLength)\(\s*${r}\b[^)]*\)|${r}\.length\b`, 'g'), ''); return !new RegExp(String.raw`(?<![\w$.])${r}\b`).test(code); },
  ref: (args) => /history:\s*\{\s*m:/.test(args) && /ref:\s*\{\s*kind:/.test(args),
  live: (args) => /\b(isCleared|clearedText|shownText|wordsOf)\(/.test(args),
  cascade: (args) => /\bjobId\b/.test(args),
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
function iSpan(src, i, { stopAtComma = false } = {}) {
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
    if (j - i > 6000) break;
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
  return k < 0 ? src.length : k + 1 + iSpan(src, k + 1).length;
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
    const push = (abs, sink, args) => { const code = iCode(args); if (aRe.test(code)) out.push({ rel, line: src.slice(0, abs).split('\n').length, sink, read: d.read, args: code.replace(swap, d.read), alias: d.alias, defLine: src.slice(0, d.at).split('\n').length }); };
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
function interpCensus(srcs) {
  const rows = [];
  for (const [rel, src] of srcs) {
    const memo = I_MEMO.get(rel);
    if (memo && memo.src === src) { rows.push(...memo.rows); continue; }
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
      const line = src.slice(0, m.index).split('\n').length;
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
        const line = src.slice(0, m.index).split('\n').length;
        for (const read of iReads(obj)) rows.push({ rel, line, sink: 'notice', read, args: obj });
      }
      I_PROP.lastIndex = 0;
      while ((m = I_PROP.exec(src))) {
        if (iComment(src, m.index) || iInLiteral(src, m.index, m[0].length) || !/[{,(\n]\s*$/.test(src.slice(Math.max(0, m.index - 60), m.index))) continue;
        const val = iSpan(src, m.index + m[0].length, { stopAtComma: true });
        const line = src.slice(0, m.index).split('\n').length;
        for (const read of iReads(val)) rows.push({ rel, line, sink: 'sentence', read, args: val });
      }
    }
    rows.push(...iAliases(src, rel, W));   // verify r9: the one-level alias pass (a copy of a field into a local, to a sink in its block)
    I_MEMO.set(rel, { src, rows: rows.slice(at) });
  }
  return rows;
}
const iRecvOf = (read) => read.endsWith('()') ? read : read.replace(/\.[^.]+$/, '');
// every (file, receiver) a sink reads a text field of: one of the five kinds, a CARRIER, or what it is. For a record / a
// carrier the per-site class is in I_SITES. A (file, receiver) the table does not name is RED; a row the tree no longer has is RED.
const I_RECORD_KINDS = new Set([...RC.RECORD_KINDS, 'carrier']);
const I_RECV = {
  // ── the five kinds and their carriers ──
  'src/agent-routes.js|e': ['carrier', 'a stash entry drained into the agent\'s next turn (the ladder\'s and the jobs engine\'s) — drawn as the chat card of what the agent received'],
  'src/agent-routes/status.js|add': ['todo', 'the agent\'s OWN For-you item (vibespace-ask) — the record itself'],
  'src/agent-routes/status.js|s': ['session', 'the filing session\'s own name (a For-you item\'s label)'],
  'src/agent-routes.js|req.body': ['activity', 'the agent\'s OWN Activity note (vibespace-task progress) — the record itself'],
  'src/agentd/agentd.js|msg': ['carrier', 'the delivered text of the device\'s peer-post op (the ladder\'s rung ③)'],
  'src/jobs.js|job': ['job', 'the Background Work record'],
  'src/jobs.js|a': ['job', 'the job\'s notify ACTION (`job.action` — SHAPES `action.text`)'],
  'src/lib/jobs-panel.js|j': ['job', 'a job snapshot the panel drew'],
  'src/lib/jobs-panel.js|job': ['job', 'the job the Job input window drew'],
  'src/lib/user-todos-panel.js|nameFor()': ['todo', 'a For-you item\'s label (a Background Work item\'s is the job\'s name)'],
  'src/lib/user-todos-panel.js|wordsOf()': ['todo', 'a For-you item\'s words (the model\'s)'],
  'src/server/conversation-deliver.js|opts': ['carrier', 'the card label + text of a delivery (a job\'s `Background Work · <name>`)'],
  'src/server/conversation-deliver.js|shown[0]': ['carrier', 'the retry park\'s single landed entry at its card (notify-retry verify r2: the card is built AFTER the post from the words as they stand — a clear that reached it mid-flight already rewrote them to the sentence)'],
  'src/server/groups-engine.js|wc': ['group-message', 'a wake\'s card words: the message that woke it, or each message its report showed (B-9fd6)'],
  'src/server/groups-engine.js|rep': ['group-message', 'a wake REPORT (a line per group message)'],
  'src/server/session-brain.js|fact': ['status', 'the vcs event entry of a session\'s status history (its branch) — the record itself'],
  'src/agent-routes.js|u': ['carrier', 'the jobs UPDATE a turn is injected with (job events\' words) — the journal prints its SIZE'],
  'src/agent-routes.js|rep': ['group-message', 'a next-turn group REPORT (a line per group message) — the journal prints its SIZE'],
  'data/bin/codex-chat-wrapper.js|data': ['carrier', 'the task context the codex wrapper injects (Activity notes, a status) — its log prints the LENGTH'],
  'src/server/stdout/claude-stream-json.js|po': ['carrier', 'the sender name of a message the CLI received (a job\'s `Background Work · <name>`) — the live chat card'],
  // ── not a record: what each is ──
  'src/harnesses/claude-oat-expiry.js|a': ['account', 'an account / pool name'], 'server.js|h': ['host', 'a machine name'],
  'src/accounts.js|a': ['account', 'an account'], 'src/accounts.js|target': ['account', 'an account'],
  'src/browser-profiles.js|existing': ['browser profile', 'a profile label'], 'src/browser-profiles.js|profile': ['browser profile', 'a profile label'], 'src/browser-profiles.js|row': ['browser profile', 'a profile label'],
  'src/browser-switch.js|profile': ['browser profile', 'a profile label'], 'src/browser-trace.js|profile': ['browser profile', 'a profile label'],
  'src/channel-groups.js|c': ['member', 'B-ff04: a candidate MEMBER\'s name in the @ refusal (unknown / ambiguous-mention) — a session name, not a message'],
  'src/channel-groups.js|group': ['agent group', 'a group\'s NAME — the group, not a message (a rename\'s previous name, raw.from, is the cleared field)'],
  'src/channel-record.js|b': ['channel block', 'a render block\'s own kind word'], 'src/channel-record.js|BLOCK_LIMITS': ['constant', 'a length limit'],
  'src/desktop-fit.js|rec': ['desktop app', 'an app label'], 'src/desktop-apps.js|row': ['desktop app', 'an app label'], 'src/desktop-browser-app.js|row': ['desktop app', 'an app label'], // rv-desktop-apps F-S1: the window / browser families' own files
  'src/desktop-serve.js|rec': ['desktop app', 'an app label'], 'src/desktop-serve.js|row': ['desktop app', 'an app label / refusal reason'],
  'src/exit-proxy.js|session': ['session', 'the conversation the network / a command is lent to — its own name (lane-pairing exit access)'], 'src/exit-proxy.js|h': ['host', 'a machine name'], 'src/hosts.js|h': ['host', 'a machine name'],
  'src/lib/app.js|BACKEND_META[h.id]': ['harness', 'a harness label'], 'src/lib/app.js|BACKEND_META[msg.backend]': ['harness', 'a harness label'],
  'src/lib/app.js|lost': ['account', 'an account'], 'src/lib/app.js|msg': ['frame', 'a server-notice / backend-status frame\'s text (its producer is judged at the `notice` sink)'],
  'src/lib/browser-live-window.js|dw': ['words', 'a PURE outcome\'s sentence (browser-switcher-model)'],
  'src/lib/browser-live-window.js|sw': ['words', 'a PURE step\'s sentence (browser-new-profile-model machineStepWords: a paired machine with no browser — the machine\'s id + its one command; lane remote-profile-start)'],
  'src/lib/browser-profile-picker.js|r.pin': ['browser profile', 'a profile label'], 'src/lib/browser-build-dialog.js|view': ['browser profile', 'a profile label (Change build…, lane browser-admin)'], 'src/lib/browser-new-profile.js|o': ['browser profile', 'an install outcome\'s words (the New profile… dialog, lane browser-admin)'],
  'src/lib/browser-switcher.js|e': ['error', 'an Error\'s name'], 'src/lib/browser-switcher.js|w': ['words', 'a PURE outcome\'s sentence'],
  'src/lib/browser-trace-view.js|e': ['browser profile', 'a profile label'], 'src/lib/browser-trace-view.js|f': ['browser profile', 'a profile / its file'], 'src/lib/browser-trace-view.js|o': ['browser profile', 'an orphan profile dir'],
  'src/lib/browser-trace-view.js|res.profile': ['browser profile', 'a profile label'], 'src/lib/browser-trace-view.js|res': ['browser profile', 'the profile adopted from'], 'src/lib/browser-trace-view.js|r': ['browser profile', 'a profile label'],
  'src/lib/browser-trace-view.js|k': ['browser profile', 'a kept conversation browser\'s label (the session name it was kept for — lane browser-resume §3.9)'], 'src/server/browser-kept.js|e': ['browser profile', 'a kept conversation browser\'s label (the session name it was kept for — lane browser-resume §3.9)'],
  'src/lib/browser-who-dialog.js|r.profile': ['browser profile', 'a profile label'],
  'src/lib/channel-account-dialogs.js|k': ['channel account', 'an integration key label'], 'src/lib/channel-account-dialogs.js|v': ['channel account', 'an account name'],
  'src/lib/channel-group-dialogs.js|group': ['agent group', 'a group\'s name'], 'src/lib/channel-outbox.js|r': ['outbox proposal', 'a send\'s refusal reason'],
  'src/lib/channels-panel.js|r': ['count', 'a refresh answer\'s pending flag'], 'src/lib/channel-window.js|group': ['agent group', 'a group\'s name'], 'src/lib/channel-window.js|a': ['channel author', 'lane lark-threads: an author\'s vendor name / id in the "Set a name…" dialog\'s title (the vendor\'s, never a record\'s words)'], 'src/lib/channel-window.js|r2.proposal': ['outbox proposal', 'the channel\'s refusal of a send'],
  'src/lib/chat-view.js|msg.page': ['published page', 'a page\'s name'], 'src/lib/chat-view.js|r': ['codex sub-agent', 'an unresolved sub-agent\'s reason code'],
  'src/lib/desktop-app-launcher.js|end': ['desktop app', 'an app label'], 'src/lib/desktop-manager.js|desk': ['desktop', 'a desktop\'s name'], 'src/lib/file-explorer.js|bk': ['bookmark', 'a bookmark label'],
  'src/lib/integrations-window.js|v': ['integration', 'a key label'],
  'src/lib/manage-agents.js|a': ['account', 'an account'], 'src/lib/manage-agents.js|c.account': ['account', 'an account'], 'src/lib/manage-agents.js|fin.account': ['account', 'an account'],
  'src/lib/manage-agents.js|fin.movedTo': ['account', 'an account'], 'src/lib/manage-agents.js|last.account': ['account', 'an account'], 'src/lib/manage-agents.js|last': ['account', 'an account'],
  'src/lib/manage-agents.js|o': ['words', 'a PURE outcome\'s sentence'], 'src/lib/manage-agents.js|p': ['account', 'a pool'], 'src/lib/manage-agents.js|r2.account': ['account', 'an account'],
  'src/lib/manage-agents.js|r.account': ['account', 'an account'], 'src/lib/manage-agents.js|r.retargeted': ['account', 'an account'], 'src/lib/manage-agents.js|r': ['account', 'an account'], 'src/lib/manage-agents.js|sa': ['account', 'an account'],
  'src/lib/open-with.js|fv': ['file', 'a viewer verdict\'s app label'], 'src/lib/open-with.js|OFFICE_MODULES[fv.module]': ['file', 'an office module label'],
  'src/lib/plugin-client.js|def': ['plugin', 'a plugin window\'s label'], 'src/lib/plugin-client.js|d': ['plugin', 'a plugin\'s own notify text'],
  'src/lib/plugins-ui.js|meta': ['plugin', 'a plugin label'], 'src/lib/plugins-ui.js|p': ['plugin', 'a plugin label'], 'src/lib/plugins-ui.js|st': ['plugin', 'a plugin\'s status reason'],
  'src/lib/session-lifecycle.js|a': ['account', 'an account'], 'src/lib/session-props.js|s0': ['session', 'the session\'s own name'],
  'src/lib/settings-ui.js|schema': ['setting', 'a setting\'s label'], 'src/lib/sidebar-mounts.js|h': ['host', 'a machine name'], 'src/lib/sidebar-mounts.js|s': ['share', 'a share name'], 'src/lib/sidebar-mounts.js|t': ['mount token', 'a token name'],
  'src/lib/window-share.js|r': ['session', 'an agent\'s name'],
  'src/mount-providers/cloud.js|cb': ['mount', 'a storage label'], 'src/mounts.js|head': ['mount', 'a head file\'s name'], 'src/oauth-loopback.js|st': ['integration', 'a consent flow\'s label'],
  'src/office-open.js|fv': ['file', 'a viewer verdict\'s label'], 'src/office-open.js|row': ['file', 'an office row\'s label'], 'src/office-open.js|served': ['file', 'a machine\'s refusal reason'], 'src/office-open.js|want': ['file', 'an office row\'s label'],
  'src/opencode-serve.js|info.error': ['harness', 'the serve\'s error name'], 'src/quota-model.js|byHint': ['quota', 'a limit\'s name'], 'src/quota-model.js|c': ['quota', 'a limit\'s name'],
  'src/remote-fs.js|h': ['host', 'a machine name'], 'src/routes/browser-trace.js|p': ['browser profile', 'a profile label'], 'src/routes/browser-trace.js|rs': ['browser profile', 'a recording\'s file name'],
  // design 005 §2.B (B-fd1f): the refusal names the CALLER's own file (the name it gave, validated) — echoed to that caller
  'src/channel-policy.js|nm': ['caller', 'the caller\'s own attachment name (safeAttachmentName\'s result) in its refusal'], 'src/channel-policy.js|big': ['caller', 'the caller\'s own attachment (its name and size) in the too-large refusal'],
  'src/routes/channels.js|b': ['caller', 'the request body — the owner\'s own proposal / consent words, handed to the engine'],
  'src/routes/design.js|req.query': ['caller', 'the agent\'s own ?name= — the design system it asks for, handed to the engine (lane design-systems-home)'],
  'src/routes/desktop-apps.js|rec': ['desktop app', 'an app label'], 'src/routes/desktop-apps.js|row': ['desktop app', 'a machine\'s reason'], 'src/routes/desktop-apps.js|spec': ['desktop app', 'an app label'],
  'src/routes/files.js|shadow': ['mount', 'a storage name'],
  'src/server/browser-handback.js|sess.s': ['session', 'a session\'s name'], 'src/server/browser-propose.js|sess.s': ['session', 'a session\'s name'], 'src/server/browser-keeper.js|n': ['browser notice', 'the keeper\'s own notice (resources, a heal)'], 'src/server/browser-keeper.js|p': ['browser profile', 'a profile label'],
  'src/server/channel-api.js|e': ['channel', 'a vendor fetch error\'s name'], 'src/server/channel-api.js|p': ['outbox proposal', 'an API proposal\'s reject / failure reason'], 'src/mounts.js|c': ['mount', 'a storage mount\'s name'],
  'src/server/channels-engine.js|ctx': ['session', 'an agent session\'s name'], 'src/server/channels-engine.js|err': ['channel', 'a vendor error\'s detail'], 'src/server/channels-engine.js|fresh': ['outbox proposal', 'a decision reason'],
  'src/server/channels-engine.js|head': ['channel', 'a failing adapter\'s head sentence'], 'src/server/channels-engine.js|h': ['host', 'a machine name'], 'src/server/channels-engine.js|mod': ['channel', 'an adapter label'],
  'src/server/channels-engine.js|p.choice.fromMount': ['mount', 'a storage mount\'s name'], 'src/server/channels-engine.js|p': ['outbox proposal', 'a proposal\'s reason'], 'src/server/channels-engine.js|rec': ['channel', 'an account / adapter label'],
  'src/server/channels-engine.js|row': ['integration', 'an integration row label'], 'src/server/channels-engine.js|r': ['outbox proposal', 'a decision reason'], 'src/server/channels-engine.js|src': ['mount', 'a storage label'],
  'src/server/hooks-late.js|item': ['words', 'the late-hooks For-you line\'s own words (PURE src/hooks-late.js forYouItem: VibeSpace\'s sentence + the names of the running sessions it lists) — the source of a new For-you record, never a copy of one (lane hooks-create)'], 'src/server/hooks-late.js|h': ['words', 'a harness descriptor\'s constant label (Claude Code / Codex) in the journal line — never a record (lane hooks-create)'],
  'src/server/fd-gauge.js|w': ['words', 'the fd gauge\'s own sentence (handle counts by kind, the busiest folders) — never a record (lane-dead-bridge)'], 'src/server/fd-gauge.js|b': ['words', 'the EMFILE blame sentence (who ran out: this server / a mount\'s FUSE daemon / the machine) — never a record (lane-dead-bridge)'],
  'src/server/channels-engine.js|v': ['outbox proposal', 'a verdict reason'], 'src/server/channels-engine.js|w.principal': ['session', 'a watcher\'s name'],
  'src/server/groups-engine.js|g': ['agent group', 'a group\'s name'], 'src/server/groups-engine.js|group': ['agent group', 'a group\'s name'], 'src/server/groups-engine.js|rg.group': ['agent group', 'a group\'s name'],
  'src/server/helper-asks.js|session': ['session', 'a session\'s name'], 'src/server/integration-store.js|row': ['integration', 'an integration row label'], 'src/server/login-expiry-watch.js|a': ['account', 'an account'],
  'src/server/mounts-plugins-wiring.js|session': ['session', 'a session\'s name'], 'src/server/path-mounts.js|p': ['mount', 'a path mount\'s name'], 'src/server/plugin-install.js|a': ['plugin', 'a release asset'], 'src/server/plugin-install.js|asset': ['plugin', 'a release asset'],
  'src/server/spend-guard.js|identity': ['account', 'a billing identity'], 'src/server/stash-handover.js|r': ['delivery', 'the ladder\'s refusal reason'],
  'src/server/usage-pool-engine.js|a': ['account', 'an account / pool'], 'src/server/usage-pool-engine.js|cap': ['quota', 'a cap\'s name'], 'src/server/usage-pool-engine.js|desc': ['quota', 'a reset credit\'s description'],
  'src/server/usage-pool-engine.js|d': ['quota', 'a pool decision\'s reason'], 'src/server/usage-pool-engine.js|hit': ['account', 'a pool member'], 'src/server/usage-pool-engine.js|restartPending': ['account', 'an account'],
  'src/server/usage-pool-engine.js|row': ['account', 'a slot transition\'s from'], 'src/server/usage-pool-engine.js|session': ['session', 'a session\'s name'], 'src/server/usage-pool-engine.js|sh': ['account', 'a lag shadow\'s from'],
  'src/server/usage-pool-engine.js|v': ['quota', 'a reset-credit verdict\'s reason'], 'src/server/usage-pool-engine.js|wr': ['quota', 'a wall reading\'s detail'],
  // lane reset-path: the helper writer's refusal (the spend ceiling's sentence / why the helper cannot run) and the
  // usage menu's codex ⟳ toast (codexRefreshToast — the server's numbers and refusal words, never a record's text)
  'src/server/usage-pool-engine.js|hw': ['quota', 'the reset-credit helper writer\'s refusal detail'], 'src/lib/usage-meter.js|toast': ['quota', 'the codex refresh answer\'s one sentence'],
  'src/server/window-request.js|r': ['window', 'a share request\'s refusal reason'], 'src/server/window-request.js|s': ['session', 'a session\'s name'],
  'src/server/window-targets-engine.js|bRow': ['desktop app', 'an app label'], 'src/server/window-targets-engine.js|drec': ['desktop app', 'an app label'], 'src/server/window-targets-engine.js|e': ['window', 'a window\'s name'],
  'src/server/window-targets-engine.js|holder': ['session', 'a lease holder\'s name'], 'src/server/window-targets-engine.js|l': ['session', 'a lease\'s session name'], 'src/server/window-targets-engine.js|rec': ['desktop app', 'an app label'],
  'src/usage-routes.js|hMeta2': ['host', 'a machine name'], 'src/usage-routes.js|hMeta': ['host', 'a machine name'], 'src/weekly-lanes-unfold.js|lane': ['quota', 'a lane\'s name'],
  'src/spawn/ssh.js|h': ['host', 'a machine name'], 'src/spawn/dial.js|h': ['host', 'a machine name'], 'src/ws-handler.js|data': ['caller', 'the owner\'s own queued text (a refusal echoes its LENGTH to the owner who typed it)'],
  'src/ws-handler.js|h': ['host', 'a machine name'], 'src/ws-handler.js|wcaps': ['harness', 'a wrapper capability\'s reason'],
  // ── verify r8 ③: the journal's receivers (every server console / log line rides the incident ring) ──
  'data/bin/codex-chat-wrapper.js|r': ['harness', 'an app-server answer\'s reason / detail (an RPC refusal)'], 'data/bin/codex-chat-wrapper.js|st': ['harness', 'a steer answer\'s reason / detail (an RPC refusal)'],
  'src/accounts.js|to': ['account', 'a pool member (the deleted default\'s re-point target — lane pool-pin)'], 'src/accounts.js|pool': ['account', 'a pool'],
  'src/migration-runner.js|m': ['migration', 'a migration\'s own note'], 'src/normalizers.js|session': ['session', 'a session\'s name'],
  'src/normalizers.js|e': ['chat card', 'a rebuild queue entry — its `card` is a chat card the transcript already holds (peer / browser / group / proposal), never a For-you item\'s card (design 009 named that field `card` too)'],
  'src/port-forward.js|h': ['host', 'a machine name'], 'src/server/auto-cli-loop.js|it.pj': ['quota', 'a projection\'s label'],
  'src/server/auto-resume.js|chk': ['quota', 'a pre-fire check\'s reason'], 'src/server/auto-resume.js|ident': ['account', 'a billing identity'],
  'src/server/boot-restore.js|h': ['host', 'a machine name'], 'src/server/boot-restore.js|session': ['session', 'a session\'s name'],
  'src/server/browser-env.js|f': ['browser profile', 'a pin repoint\'s previous profile'], 'src/server/browser-keeper.js|rec': ['browser profile', 'a browser record\'s label'], 'src/server/browser-builds-keeper.js|p': ['browser profile', 'a profile label (rv-browser F7: Change build… moved out of the keeper)'], 'src/server/browser-builds-keeper.js|bc': ['browser profile', 'verify r2 (B5): a Chrome build change\'s from / to — build words ("Chrome 151.0.7922.34"), never a record\'s text'],
  'src/server/browser-keeper.js|v': ['browser profile', 'a resource verdict\'s reason'], 'src/server/browser-stream.js|next.switched': ['browser profile', 'the browser a view switched from'],
  'src/server/browser-trace.js|p': ['browser profile', 'a profile label'], 'src/server/channels-engine.js|choice.fromMount': ['mount', 'a storage mount\'s name'],
  'src/server/channels-engine.js|p1': ['outbox proposal', 'a proposal\'s decision reason'], 'src/server/channels-engine.js|s': ['channel', 'a channel state\'s reason'],
  'src/server/channels-engine.js|target': ['session', 'a wake target\'s name'], 'src/server/cli-cmd.js|e': ['harness', 'a CLI binary entry\'s name'],
  'src/server/conversation-deliver.js|e': ['delivery', 'a ladder stash entry at the eviction line: its sender name is printed only for kind `peer` (a session\'s own name); VibeSpace\'s own labels (a job\'s `Background Work · <name>`) print as their kind (verify r8 ③)'],
  'src/server/conversation-deliver.js|r': ['delivery', 'a rung\'s refusal reason'],
  // lane notify-retry (2026-10-01): the retry park's journal lines — the primitive's reason (timeout / a socket error code) and
  // the ceiling's own sentence at a re-judge (an account name + numbers); a parked entry's WORDS are in its `text`, which no
  // journal line prints (the fall line names the entry by id and kind)
  'src/server/conversation-deliver.js|v': ['delivery', 'the spend verdict at a parked delivery\'s re-judge: the ceiling\'s own detail (an account + numbers), never a record\'s words'],
  // notify-retry verify r1: a batch of parked entries posted as ONE frame — the entries' own stored text (a clear rewrote
  // the park's copies through redactStash, so a cleared one rides as the sentence under the head); `recorded` on the card
  'src/server/conversation-deliver.js|frame': ['delivery', 'the retry park\'s ONE frame of several parked entries: their STORED text joined (redactStash rewrites the park too — a cleared entry is the sentence) — the post and the card\'s `recorded`'],
  'src/server/conversation-deliver.js|attempt': ['delivery', 'a parked delivery\'s attempt record: the primitive\'s reason (timeout / a socket error code) + phase, never a record\'s words'],
  'src/jobs.js|r': ['delivery', 'the ladder\'s answer to a notification (a rung\'s refusal reason; the parked reason + phase)'], 'src/server/desktop-access.js|plan': ['desktop app', 'an install plan\'s label'],
  'src/server/desktop-app-keeper.js|rec': ['desktop app', 'an app label'], 'src/server/incident-wiring.js|req.body': ['caller', 'the owner\'s own incident note'],
  'src/server/session-stdout.js|session': ['session', 'a session\'s name'], 'src/server/spend-guard.js|v': ['quota', 'a spend verdict\'s detail'],
  'src/server/stdout/acp-events.js|msg': ['harness', 'an ACP frame\'s reason'], 'src/server/stdout/codex-events.js|msg.payload': ['harness', 'a codex event\'s reason'],
  'src/server/usage-pool-engine.js|b': ['quota', 'a bucket\'s label'], 'src/server/usage-pool-engine.js|dest': ['account', 'a pool member'], 'src/server/usage-pool-engine.js|lane': ['quota', 'a lane\'s name'],
  'src/server/usage-pool-engine.js|member': ['account', 'a pool member'], 'src/server/usage-pool-engine.js|probe': ['quota', 'a probe\'s reason'], 'src/server/usage-pool-engine.js|verdict': ['account', 'a pool verdict\'s member'],
  'src/server/user-input.js|caps': ['harness', 'a wrapper capability\'s reason'], 'src/task-groups.js|shadow': ['mount', 'the storage shadowing a context folder'],
  'src/server/session-brain.js|b': ['harness', 'a fallback banner\'s model (from → to)'], 'src/server/stdout/claude-stream-json.js|b': ['harness', 'a fallback banner\'s model (from → to)'],
  'src/server/session-stdout.js|death': ['harness', 'a CLI death\'s reason code'], 'src/ws-create.js|refusal': ['harness', 'a worktree refusal\'s reason code'],
  'src/ws-create.js|pin': ['browser profile', 'a pinned profile\'s label'], 'src/ws-create.js|session': ['session', 'a session\'s name'], 'src/ws-handler.js|session': ['session', 'a session\'s name'],
  // ── the .197 integration: the other lanes' receivers, each named by what it is ──
  'src/agentd/agentd.js|f': ['dial', 'the daemon\'s own dial attempt facts (a code + the network\'s detail) — lane-pairing, never a record'],
  'src/server/dial-pairing.js|facts': ['dial', 'where a dial came from (an address) — lane-pairing'],
  'src/server/exit-routes.js|row': ['session', 'an exit-access row\'s conversation name — lane-pairing'],
  'src/server/mounts-plugins-wiring.js|h': ['host', 'a machine name (the dial pairing\'s offline sentence)'],
  'src/lib/browser-live-window.js|r': ['browser profile', 'the browse answer\'s profile label (BROWSE YOURSELF)'],
  'src/lib/browser-live-window.js|x': ['browser profile', 'a Running row\'s profile label (BROWSE YOURSELF\'s Stop refusal)'],
  'src/routes/browser.js|p0': ['browser profile', 'a profile\'s label (the human Restart refused while he browses it — the .197 integration)'],
  'src/routes/browser.js|row': ['browser profile', 'a browser row\'s label (the Stop / Restart refused while he browses it)'],
  'src/lib/channel-thread-pane.js|r.proposal': ['channel proposal', 'the outbox engine\'s failure reason for a send (the channel\'s own error words) — no record of the five kinds'],
  'src/lib/manage-agents.js|said': ['pool verdict', 'the gather route\'s answer worded by PURE gatherWords (members and counts) — lane pool-pin'],
  'src/lib/session-lifecycle.js|r': ['account', 'a pool member row (the conversation\'s pin menu) — lane pool-pin'],
  'src/server/usage-pool-engine.js|wake': ['pool verdict', 'a member wake\'s own reason (the engine\'s verdict words)'],
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
  'src/routes/design.js|b': ['design comment', 'the USER\'s own comment text handed to the engine (it becomes the user\'s message) — lane design-core, no record of the five kinds'],
  // ── lane device-upgrade-stuck ──
  'src/server/device-upgrade-watch.js|w': ['host', 'the stuck-upgrade item\'s words — a machine name and two agent versions (itemOf), the machine\'s own record'],
  // ── verify r9: the receivers of the one-level alias pass (a field copied into a local, then handed to a sink) ──
  'src/agent-routes/status.js|req.body||{}': ['status', 'the caller\'s OWN status write (the owner\'s route / the agent\'s vibespace-status), destructured — the record itself'],
  'src/install-slot.js|s': ['desktop app', 'an install spec\'s label (packageInstallPlan, moved from desktop-apps.js — lane dc-apps-rows)'], 'src/lib/browser-switcher.js|st.view?.profile': ['browser profile', 'a profile label'],
  'src/lib/sidebar-mounts.js|cfg': ['mount', 'a storage mount\'s name'], 'src/lib/telemetry-client.js|e': ['error', 'an unhandled rejection\'s reason'],
  'src/lib/workflow-detail.js|opts': ['workflow', 'a workflow run\'s name'], 'src/routes/desktop-apps.js|req.query': ['caller', 'the install the caller asked for (a closed set, echoed clipped)'],
  'src/server/groups-engine.js|r': ['session', 'a resolved member\'s name'], 'src/window-reach.js|probe': ['window', 'an accessibility probe\'s reason'],
  // design 012 (Slack S1): a typed ChannelError of the Slack adapter — its `detail` carries the vendor's error CODE and the closed `why` (src/channels/slack-words.js), never a record's text
  'src/channels/slack.js|e': ['error', 'a typed ChannelError: detail.error is Slack\'s error code, detail.why a closed word'],
  // design 011 lane 3: the usage index owner's own words — no record text reaches it
  'src/server/usage-index.js|m': ['index worker', 'the usage index worker\'s own state message (a reason NAME, a SQLite error text)'], 'src/server/usage-index.js|a': ['index worker', 'the owner\'s own available() verdict (a reason NAME)'],
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
  'src/agentd/agentd.js|peer|msg.text': ['transcript', 'the device posts the delivered text into the CLI\'s inbox'],
  'src/jobs.js|peer|job.name': ['transcript', 'a job notification delivered into its owner / subscriber conversation (the card label `Background Work · <name>`); a HELD one is the stash the door rewrites'],
  'src/jobs.js|peer|a.text': ['transcript', 'the notify action\'s own text delivered to the owner conversation'],
  'src/jobs.js|todo|job.name': ['cascade', 'a For-you item filed by the job (failed / parked / missed / needs input) carries its jobId — the job\'s clear cascades to it'],
  'src/jobs.js|todo|a.text': ['cascade', 'the notify action\'s For-you item carries the jobId — cleared with the job'],
  'src/lib/jobs-panel.js|dialog|j.name': ['live', '"Remove job" names a cleared job in this device\'s words (r5 ⑨)'],
  'src/lib/jobs-panel.js|title|job.name': ['live', 'the Job input window\'s title, re-worded on every render + generic in every layout record (WORDLESS_TITLES)'],
  'src/lib/user-todos-panel.js|toast|nameFor()': ['ref', 'the arrival toast: the history keeps the head + {kind: todo, id} (r4 ⑤ / r5 ⑩)'],
  'src/lib/user-todos-panel.js|toast|wordsOf()': ['ref', 'the arrival toast: the history keeps the head + {kind: todo, id} (r4 ⑤)'],
  'src/server/conversation-deliver.js|peer|opts.fromName': ['transcript', 'the card drawn when a delivery REACHED the conversation (cardOk)'],
  'src/server/conversation-deliver.js|peer|opts.cardText': ['transcript', 'the card drawn when a delivery reached the conversation'],
  // notify-retry verify r2: the retry park's landing card is built AFTER the post from the entry's words AS THEY STAND (a clear
  // that reached it mid-flight already rewrote them to the sentence — redactStash rewrites the park); `recorded` = the frame
  'src/server/conversation-deliver.js|peer|shown[0].fromName': ['transcript', 'the parked delivery\'s landing card: the entry\'s name as it stands after any clear (the park is rewritten by the door)'],
  'src/server/conversation-deliver.js|peer|shown[0].cardText': ['transcript', 'the parked delivery\'s landing card: the entry\'s card text as it stands (dropped by a clear)'],
  'src/server/conversation-deliver.js|peer|shown[0].text': ['transcript', 'the parked delivery\'s landing card: the entry\'s words as they stand after any clear (a mid-flight clear = the sentence; the frame the CLI holds is `recorded`)'],
  'src/server/groups-engine.js|peer|rep.text': ['transcript', 'a wake report delivered to a member (a refused one rides the next report; a handed-back one is the stash the door rewrites)'],
  'src/server/groups-engine.js|peer|wc.text': ['transcript', 'a group message delivered to a member (the wake card\'s words — B-9fd6)'],
  'src/server/session-brain.js|status|fact.branch': ['own', 'the vcs entry\'s own write (the door drops its branch)'],
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
    for (const [what, re] of I_ABSENT) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(code))) mine.push(`${rel}:${code.slice(0, m.index).split('\n').length} (${what})`); }
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
  ok(J8.bad.length === 0, `I every read of a record / a carrier at a sink is of a class the sink allows AND shows it (${J8.recordSites.length}: ${[...new Set(J8.recordSites.map((s) => s.cls))].join(' / ')})`, J8.bad);
  ok(Object.values(I_RECV).every(([k, why]) => k && why.length >= 6) && Object.values(I_SITES).every(([c, why]) => I_CHECK[c] && why.length >= 20), 'I every receiver names what it is; every site class names why');
  { const al = rows.filter((r) => r.alias), defs = new Set(al.map((r) => `${r.rel}:${r.defLine}:${r.alias}`));
    ok(al.length >= 25 && defs.size >= 15 && al.every((r) => r.read && r.sink && I_RECV[`${iRel(r.rel)}|${iRecvOf(r.read)}`]), `I verify r9 — THE ONE-LEVEL ALIAS PASS: a text field COPIED into a local (\`const x = rec.<field>\` / \`const { field } = rec\`) and handed to a sink in its block is a read at that sink — ${defs.size} copies, ${al.length} sink reads, every one judged by the receiver + site tables above (a copy into an object's member or through two locals is declared)`, al.length); }
  ok(iAbsent(srcs).length === 0, `I the absent sinks stay absent — ${I_ABSENT.map(([w]) => w).join(', ')}: zero sites`, iAbsent(srcs));
  // the classes' own standing statements: the cascade reaches every item a job filed; the dialog says agents keep what they received
  ok(read('src/server/record-clear.js').includes('userTodos.idsWhere((i) => i.jobId && gone.has(i.jobId))') && /userTodos\.add\(sessKey, \{\s*origin: 'jobs', \/\/ B-328d\s*text, urgency: urgency \|\| 'normal', by: 'agent', jobId,/.test(read('src/server/jobs-wiring.js')), 'I `cascade`: a job\'s clear cascades to every For-you item carrying its jobId, and the ONE filing door (jobs-wiring notifyUser) stamps it');
  ok(read('src/lib/record-clear-ui.js').includes("copies.className = 'dialog-hint rc-copies';"), 'I `transcript`: the confirm dialog says an agent keeps what it already received (.rc-copies, r4 ③)');
  { const rail = read('src/lib/sidebar-rail.js');
    ok(/row\.service = owned\.get\(row\.port\)\.name; row\.serviceJob = owned\.get\(row\.port\)\.id;/.test(read('src/port-forward.js')) && rail.includes("(msg.type === 'jobs-updated' && Array.isArray(msg.cleared))) render();"), 'I verify r8 ④: a Ports scan row carries its service\'s job id, the page\'s scan cache is scrubbed on the clear (the carrier row above) and the panel re-renders');
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
  { const rel = 'src/lib/jobs-panel.js', m = plant(1, rel, "  if (r?.error) showToast(r.error, { error: true });\n  refresh?.();", "  if (r?.error) showToast(r.error, { error: true });\n  else showToast(t('{name}: done', { name: j.name }));\n  refresh?.();", 'toast-names-job', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs-panel\.js\|toast\|j\.name .*no class/.test(c.bad[0]), 'CONTROL 1 (verify r8): a toast naming the job with no history ref is RED — every toast outlives the clear in the device history', c.bad); }
  // 2. a refusal sentence naming a For-you item (an unclassified receiver in the store module)
  { const rel = 'src/user-todos.js', m = plant(2, rel, "    if (!hit) throw new Error(`no open item matching \"${ref}\" in this session`);", "    if (!hit) throw new Error(`no open item matching \"${ref}\" in this session`);\n    if (hit.status !== 'open') throw new Error(`\"${hit.text}\" is already resolved`);", 'sentence-names-item');
    const c = judge(rel, m); ok(c.unknownRecv.length === 1 && /^src\/user-todos\.js\|hit \(error/.test(c.unknownRecv[0]), 'CONTROL 2 (verify r8): an Error naming an item\'s text is RED (a receiver the census has not judged)', c.unknownRecv); }
  // 3. the browser's Notification API, carrying a job's name
  { const rel = 'src/lib/jobs-panel.js', m = plant(3, rel, "  if (r?.error) showToast(r.error, { error: true });\n  refresh?.();", "  if (r?.error) showToast(r.error, { error: true });\n  try { new Notification('Background Work'); } catch { }\n  refresh?.();", 'notification-api', true);
    const c = judge(rel, m); ok(c.absent.length === 1 && /jobs-panel\.js:\d+ \(the browser's Notification API\)/.test(c.absent[0]), 'CONTROL 3 (verify r8): a browser Notification is RED (an absent sink appeared)', c.absent); }
  // 4. telemetry carrying a job's name (the Diagnostics window keeps it)
  { const rel = 'src/jobs.js', m = plant(4, rel, "      try { this.d.getTelemetry?.()?.record?.({ kind: 'error', name: 'jobs-archive-write-failed', detail: e.message }); } catch { /* telemetry is optional */ }", "      try { this.d.getTelemetry?.()?.record?.({ kind: 'error', name: 'jobs-archive-write-failed', detail: e.message + ' ' + [...this.jobs.values()].map((job) => job.name).join() }); } catch { /* telemetry is optional */ }", 'telemetry-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|telemetry\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 4 (verify r8): telemetry carrying a job\'s name is RED (the Diagnostics window keeps it past the clear)', c.bad); }
  // 5. a WRAPPER hiding the toast: `say(j.name)` — the census follows a function that hands its parameter to a sink
  { const rel = 'src/lib/jobs-panel.js', m = plant(5, rel, "  if (r?.error) showToast(r.error, { error: true });\n  refresh?.();", "  const say = (m) => showToast(m);\n  if (r?.error) showToast(r.error, { error: true });\n  else say(j.name);\n  refresh?.();", 'wrapped-toast', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs-panel\.js\|toast\|j\.name/.test(c.bad[0]), 'CONTROL 5 (verify r8): a wrapper that hands a job\'s name to showToast is RED at its call', c.bad); }
  // 6. a server notice naming the job
  { const rel = 'src/jobs.js', from = "    try { this.d.notifyUser({ text: `${job.name} needs your input`,", m = plant(6, rel, from, "    try { serverNotice?.('job-ask', `${job.name} asks for input`); } catch { }\n" + from, 'notice-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|notice\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 6 (verify r8): a server notice naming the job is RED (a toast on every device)', c.bad); }
  // 7. the client console with an item's text (the incident recorder's ring keeps it)
  { const rel = 'src/lib/user-todos-panel.js', from = "        const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i)}`,", m = plant(7, rel, from, "        console.warn('[inbox] arrival', wordsOf(i));\n" + from, 'console-item-words', true);
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
  { const rel = 'src/jobs.js', from = "    try { this.d.notifyUser({ text: `${job.name} needs your input`,", m = plant(14, rel, from, "    global.__vsEvent?.('job-ask', job.name);\n" + from, 'vsevent-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|telemetry\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 14 (verify r8 ⑥): a telemetry event through global.__vsEvent naming the job is RED', c.bad); }
  { const rel = 'src/jobs.js', from = "    try { this.d.notifyUser({ text: `${job.name} needs your input`,", m = plant(15, rel, from, "    this.d.broadcast('server-notice', { type: 'server-notice', key: 'job-ask', text: `${job.name} asks` });\n" + from, 'notice-frame-names-job');
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs\.js\|notice\|job\.name .*no class/.test(c.bad[0]), 'CONTROL 15 (verify r8 ⑥): a server-notice FRAME naming the job, broadcast directly, is RED', c.bad); }
  // 16. verify r9 (the revert table: r8 ⑥'s third spelling — `window.__vsOp` as the console sink — reverted, NOTHING went red:
  //     no op breadcrumb in the tree reads a record, and controls 14 / 15 plant the other two spellings only). A breadcrumb
  //     rides the incident recorder's op ring into every incident captured later, like a console line.
  { const rel = 'src/lib/user-todos-panel.js', from = "        const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i)}`,", m = plant(16, rel, from, "        window.__vsOp?.('inbox-arrival', { id: i.id, words: wordsOf(i) });\n" + from, 'vsop-item-words', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /user-todos-panel\.js\|console\|wordsOf\(\)/.test(c.bad[0]), 'CONTROL 16 (verify r9): an op breadcrumb (window.__vsOp) carrying an item\'s words is RED (the incident recorder\'s op ring → an incident bundle)', c.bad); }
  // 17–18. verify r9 item 2(b): a text field COPIED into a local before the sink — r8's declared gap, now the alias pass
  { const rel = 'src/lib/jobs-panel.js', m = plant(17, rel, "  if (r?.error) showToast(r.error, { error: true });\n  refresh?.();", "  const nm = j.name;\n  if (r?.error) showToast(r.error, { error: true });\n  else showToast(t('{name}: done', { name: nm }));\n  refresh?.();", 'alias-names-job', true);
    const c = judge(rel, m); ok(c.bad.length === 1 && /jobs-panel\.js\|toast\|j\.name .*no class/.test(c.bad[0]), 'CONTROL 17 (verify r9): a job\'s name copied into a local and toasted is RED (the alias pass)', c.bad); }
  { const rel = 'src/lib/user-todos-panel.js', from = "        const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i)}`,", m = plant(18, rel, from, "        const { text: said } = i;\n        console.warn('[inbox] arrival', said);\n" + from, 'destructured-item-text', true);
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
  for (const row of copiesCensus(MUT.files, MUT.dir, ROOT, { minCopies: 46, label: '§I ' })) ok(row.pass, row.name, row.detail);
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
