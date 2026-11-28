#!/usr/bin/env node
// A CONVERSATION THE PRODUCT CAN RESUME IS NEVER FORGOTTEN BY A BOOT (lane dead-socket-keeps-chat-meta — the owner's
// 2026-10-30 incident: a local antigravity chat whose CLI died at 01:58 had a dead dtach socket at the 05:00 boot, and
// boot-restore's retireDeadSocket DELETED its meta — its window, sidebar row, name, folder and account link were gone though
// the conversation, resumable, was intact in the account's store). In-process, fast; every fixture synthetic:
//   §1 THE HOOK — every chat harness's descriptor answers the resumable id (store.resumeIdOf: claude's session uuid, codex's
//      thread, agy's conversation uuid, an ACP session); a store-less harness (shell) has none; a backend no harness answers
//      for keeps its generic id (it cannot be asked — never deleted on a guess)
//   §2 THE DEAD SOCKET — the REAL boot-restore over a scratch data dir (fake fuser / pgrep: every socket dead): the incident's
//      shape (a local agy chat with its account, name, folder) and a claude chat are kept STOPPED (<sock>.json.stopped:
//      status, stoppedAt, stopReason 'dead-socket-at-boot', every field kept); a shell and an id-less session are deleted; a
//      codex thread whose rollout is gone is deleted once its harness answered; a remote one is an orphan as before; the boot
//      trace's facts line says «4 stopped (kept: cw-…), 2 deleted (nothing to resume: cw-…)»
//   §3 THE READ-BACK — the kept metas are /api/sessions rows (stoppedSessions): stopped, why, name, folder, mode, account; the
//      NEXT boot reads them back from disk (a 2.369.365 copy with no reason too); a live session of the conversation
//      consumes its copy; a newer stop of a conversation supersedes the older copy
//   §4 THE RE-PROBE takes the same road — a socket the boot could not ask, settled dead by the re-probe, is kept the same way
//   §5 THE MERGE (routes/sessions mergeKeptStopped, PURE): a harness's own stopped row takes why / when / name / account; a
//      live row is untouched; a conversation no harness lists gets the meta's own row
//   §6 ANTIGRAVITY'S STORE.DISCOVER — each account root's index (conversation_summaries.db, synthetic): one row per top-level
//      conversation with its title, last-written time, folder and ACCOUNT; a sub-agent's row is no conversation; a running
//      one is live; the index read by a child ≤ once per root per CHECK_MS and again when it changed; never its preview
//   §7 THE DOORS (client): the sentence in zh + ja; the card, the resume bar, the tile and the resume-all offer say it; a
//      resume nobody gave an account goes to the account its row names
//   §8 THE BORROWED ID (r2) — a pending fork's copy never supersedes, nor is consumed through, its parent's (on ONE boot)
//   §9 THE HELD ACCOUNT (r2) — a resume that states no account goes to its row's, server-side, from every door (B-a5a4: a
//      kept agy meta naming none ran on the machine's own login — resumed there)
//   §10 B-a5a4 (the r2 reviewer's nine follow-ups): a deleted account on an account-bound harness refused; the seam before
//      the first sweep; ONE refusal sentence; a pending fork's copy swept by the next boot; item (2) (its remainder, 2.369.412):
//      a resume that RAN — its turn ended WELL — consumes its copy at once (a failed resume's error result keeps it: r1 lost it)
//   §11 B-a5a4 follow-up: ONE precedence for «which account holds it» (the page's merge rule, on a copy); the refusal names
//      that account; the Resume switch offers no account the server refuses; the rescue reads the server's message; the
//      deleted-account refusal DRIVEN through the real create (the error arrives, nothing spawns); the seam's wiring
// RED on 43d0f8d2d (2.369.364) and on d5b99bade (the 2.369.365 cut): every section by name (no hook, no reason, no
// read-back, no facts line, no agy discover, no words). No count is pinned here — the suite prints its own.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { scratchDir, scratchHome } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const J = JSON.stringify;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const section = async (title, fn) => { console.log('— ' + title); try { await fn(); } catch (e) { ok(false, title + ' — threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); } };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
/** server.js's turn-end entry (`const noteTurnEnd = …` at its top level) as a function over STAND-INS: its own source, cut out by
 *  acorn and run in a scope where the pool engine, the delivery ladder, the consume and console are recorders, and any other
 *  name it reaches is a recorder too (another unit may add a step: the law still reads). → ({consume, deliverThrows}) → {calls,
 *  warns, threw, S, M} | null (no such declaration) */
function serverTopOf(src) {
  try { return require('acorn').parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true }).body; } catch { return null; }
}
function turnEndEntryOf(src) {
  const body = serverTopOf(src);
  if (!body) return null;
  const inits = [];
  for (const n of body) if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id && d.id.name === 'noteTurnEnd' && d.init) inits.push(d.init);
  return inits.length === 1 ? entryRunner(src.slice(inits[0].start, inits[0].end)) : null;   // declared ONCE at the top level, or no law to read
}
/** the runner over an entry's TEXT (server.js's own, or a planted one — the law's red control) */
function entryRunner(text) {
  return ({ consume = () => Promise.resolve(null), deliverThrows = false } = {}) => {
    const calls = [], warns = [], S = { id: 'turn-end-stand-in' }, M = { type: 'result', subtype: 'success' };
    const stubs = {
      noteTurnEndEngine: (...a) => { calls.push(['engine', ...a]); },
      deliver: { noteTurnEnd: (...a) => { calls.push(['deliver', ...a]); if (deliverThrows) throw new Error('deliver down'); } },
      consumeKeptOf: (...a) => { calls.push(['consume', ...a]); const r = consume(); if (r && typeof r.catch === 'function') r.catch(() => { }); return r; },   // handled here first: an entry that dropped its own .catch fails by name, never as an unhandled rejection
      console: { warn: (...a) => { warns.push(a.map(String).join(' ')); }, log() { }, error() { } },
    };
    const scope = new Proxy(stubs, { has: (t, k) => typeof k === 'string' && (k in t || !(k in globalThis)), get: (t, k) => (typeof k !== 'string' ? undefined : k in t ? t[k] : (...a) => { calls.push(['other:' + k, ...a]); }) });
    const fn = new Function('scope', 'with (scope) { return (' + text + '); }')(scope);
    let threw = null;
    try { fn(S, M); } catch (e) { threw = e; }
    return { calls, warns, threw, S, M };
  };
}
const REAL = { log: console.log, warn: console.warn };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const UUID = (n) => `a9e10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CID = (n) => `c0ffee0${n}-0000-4000-8000-000000000000`;
const HOME = scratchHome('dsk-home', fs);
process.env.HOME = HOME; // before the transcript worker exists: it inherits the env it is born with
const BRm = require(path.join(REPO, 'src/server/boot-restore.js'));
const HARN = require(path.join(REPO, 'src/harnesses'));
const SS = require(path.join(REPO, 'src/session-store.js'));

/** A scratch data dir + fake fuser / pgrep (`body` = their shell line) first on PATH. */
function world(tag, body = 'exit 1') {
  const d = scratchDir('dsk-' + tag);
  const bin = path.join(d, 'bin'); fs.mkdirSync(bin, { recursive: true });
  for (const b of ['fuser', 'pgrep']) fs.writeFileSync(path.join(bin, b), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  const W = { d, bin, SOCK: path.join(d, 'sockets'), META: path.join(d, 'meta'), BUF: path.join(d, 'buffers') };
  for (const x of [W.SOCK, W.META, W.BUF]) fs.mkdirSync(x, { recursive: true });
  W.add = (n, meta) => { const sock = `cw-${n}-${1793300000000 + n}`; fs.writeFileSync(path.join(W.SOCK, sock), ''); fs.writeFileSync(path.join(W.META, sock + '.json'), J({ webuiSessionId: 'sess-' + sock.slice(3), createdAt: 1793300000000, ...meta })); return sock; };
  W.json = (f) => { try { return JSON.parse(fs.readFileSync(path.join(W.META, f), 'utf8')); } catch { return null; } };
  return W;
}
function api(W, { notes = [], active = new Map() } = {}) {
  const meta = (s) => { try { return JSON.parse(fs.readFileSync(path.join(W.META, s + '.json'), 'utf8')); } catch { return {}; } };
  return BRm.create({ rootDir: W.d, PORT: 0, BUFFERS_DIR: W.BUF, META_DIR: W.META, SOCKETS_DIR: W.SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
    activeSessions: active, sessionCounterRef: { value: 0 }, attachToDtach: () => {}, setupSessionPty: () => {},
    readSessionMeta: meta, writeSessionMeta: (s, m) => fs.writeFileSync(path.join(W.META, s + '.json'), J(m)), deleteSessionMeta: (s) => { try { fs.unlinkSync(path.join(W.META, s + '.json')); } catch {} },
    broadcastToSession: () => {}, broadcastActiveSessions: () => {}, refreshWebuiPids: () => {}, sbNoteServerOp: () => {}, getHosts: () => null, getDialBridge: () => null, getExitProxy: () => null, note: (l) => notes.push(l) });
}
const quiet = async (fn) => { const lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { await fn(); } finally { console.log = REAL.log; console.warn = REAL.warn; } return lines; };
const withPath = async (W, fn) => { const p0 = process.env.PATH; process.env.PATH = W.bin + ':' + p0; try { return await fn(); } finally { process.env.PATH = p0; } };
const AGY_META = { name: 'Kiln notes', cwd: '/srv/u/kiln-study', backend: 'antigravity', mode: 'chat', backendSessionId: UUID(1), accountId: 'agy-e0e0e0e0e0e0', taskIds: ['T-9'], effort: 'high' };

await section('§1 THE HOOK — the resumable id is each harness\'s own answer (store.resumeIdOf), never one generic rule', async () => {
  const rows = HARN.list().filter((h) => HARN.isBuiltin ? HARN.isBuiltin(h.id) : true);
  const chat = rows.filter((h) => h.kind === 'chat'), noStore = rows.filter((h) => !h.store);
  ok(chat.length >= 4 && verdictOf(chat.every((h) => typeof h.store?.resumeIdOf === 'function')), `§1 every chat harness declares store.resumeIdOf (${chat.map((h) => h.id).join(', ')})`, chat.map((h) => [h.id, typeof h.store?.resumeIdOf]));
  ok(noStore.length >= 1 && verdictOf(noStore.every((h) => h.kind !== 'chat')), `§1 a harness with NO store has nothing to resume — proven by its row (${noStore.map((h) => h.id).join(', ')}: store null, terminal only)`);
  const of = (backend, m) => BRm.resumeIdOf({ backend, ...m });
  ok(of('claude', { claudeSessionId: CID(1), backendSessionId: CID(2) }) === CID(1) && of('claude', { backendSessionId: CID(2) }) === CID(2), '§1 claude: its session uuid (claudeSessionId — spawn.conversationIdField), else the generic twin');
  ok(of('codex', { backendSessionId: 'thr-1', claudeSessionId: 'x' }) === 'thr-1', '§1 codex: the thread id (never a claude field)');
  ok(of('antigravity', { backendSessionId: UUID(1) }) === UUID(1) && of('antigravity', { backendSessionId: 'not-a-uuid' }) === null, '§1 antigravity: the conversation uuid `--conversation` takes — anything else is no id');
  ok(of('opencode', { backendSessionId: 'ses_abc' }) === 'ses_abc', '§1 an ACP harness (opencode): the session the wrapper loads');
  ok(of('shell', { backendSessionId: 'x' }) === null && of('claude', {}) === null, '§1 a shell, and a session that never learned its id: nothing to resume');
  ok(of('plugin-x', { backendSessionId: 'p-1' }) === 'p-1', '§1 a backend no registered harness answers for keeps its generic id — it cannot be asked, so it is never deleted on a guess');
});

let W2 = null, socks = {};
await section('§2 THE DEAD SOCKET — a local session that names a conversation is kept STOPPED, with everything it had', async () => {
  const W = W2 = world('boot');
  const pdir = path.join(HOME, '.claude', 'projects', SS.cwdToProjectDir('/srv/u/ledger')); fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(path.join(pdir, CID(1) + '.jsonl'), J({ type: 'user', sessionId: CID(1), cwd: '/srv/u/ledger', timestamp: '2026-10-30T09:00:00.000Z', message: { role: 'user', content: 'hello' } }) + '\n');
  socks = {
    labChat: W.add(1, AGY_META),
    ledgerChat: W.add(2, { name: 'Ledger', cwd: '/srv/u/ledger', backend: 'claude', mode: 'chat', claudeSessionId: CID(1), accountId: 'acct-x' }),
    goneThread: W.add(3, { name: 'Gone thread', cwd: '/srv/u/x', backend: 'codex', mode: 'chat', backendSessionId: 'thr-gone-1' }),
    plainTerm: W.add(4, { name: 'shell', cwd: '/srv/u', backend: 'shell', mode: 'terminal' }),
    noIdChat: W.add(5, { name: 'never spoke', cwd: '/srv/u', backend: 'claude', mode: 'chat' }),
    remoteChat: W.add(6, { name: 'remote one', cwd: '/srv/r', backend: 'claude', mode: 'chat', claudeSessionId: CID(6), host: 'h-1' }),
    acpChat: W.add(7, { name: 'ACP one', cwd: '/srv/a', backend: 'opencode', mode: 'chat', backendSessionId: 'ses_7' }),
  };
  const notes = [];
  const A = api(W, { notes });
  const lines = await withPath(W, () => quiet(async () => { await A.probeSockets(); A.restoreSessions(); await A.stoppedSettled(); }));
  W2.api = A; W2.notes = notes;
  const k = W.json(socks.labChat + '.json.stopped');
  ok(gateOf(k) && k.status === 'stopped' && k.stopReason === 'dead-socket-at-boot' && typeof k.stoppedAt === 'number' && !fs.existsSync(path.join(W.META, socks.labChat + '.json')),
    '§2 THE INCIDENT\'S SHAPE: a local antigravity chat whose socket died is kept STOPPED — status, stoppedAt, stopReason «dead-socket-at-boot» (2.369.364: deleted; .365: kept, no status / reason)', k);
  ok(gateOf(k) && k.name === AGY_META.name && k.cwd === AGY_META.cwd && k.accountId === AGY_META.accountId && k.backendSessionId === UUID(1) && J(k.taskIds) === J(['T-9']) && k.effort === 'high' && k.mode === 'chat',
    '§2 …with its name, folder, ACCOUNT, conversation, groups and effort — kept for the resume (no harness locate deletes it: agy\'s store names no file)', k);
  const c = W.json(socks.ledgerChat + '.json.stopped');
  ok(gateOf(c) && c.status === 'stopped' && c.stopReason === 'dead-socket-at-boot' && c.claudeSessionId === CID(1), '§2 a claude chat whose transcript exists: kept the same way', c);
  ok(W.json(socks.acpChat + '.json.stopped')?.stopReason === 'dead-socket-at-boot', '§2 an ACP agent\'s session (opencode) too — its store has no file to locate, and «cannot tell» never deletes (2.369.365\'s settle read locate\'s null as «no transcript» and deleted this one and the agy one seconds after the boot kept them)');
  ok(!W.json(socks.goneThread + '.json.stopped') && !W.json(socks.goneThread + '.json'), '§2 a codex thread whose rollout is gone: kept first, deleted once its harness answered «no transcript» (off the loop — .365\'s settle, asked with the hook\'s id)');
  ok(verdictOf([socks.plainTerm, socks.noIdChat].every((s) => !W.json(s + '.json') && !W.json(s + '.json.stopped'))), '§2 a shell and a session that never learned its id — NOTHING to resume — are deleted as before');
  ok(gateOf(W.json(socks.remoteChat + '.json.orphan')) && !W.json(socks.remoteChat + '.json.stopped'), '§2 a remote session is still an orphan for the re-adopt (B-1525, unchanged)');
  const fact = notes.find((l) => /^dead sockets: /.test(l)) || '';
  const keptNamed = (fact.match(/kept: ([^)]*)\)/) || [])[1] || '', delNamed = (fact.match(/nothing to resume: ([^)]*)\)/) || [])[1] || '';
  ok(gateOf(/^dead sockets: 3 stopped \(kept: cw-[^)]*\), 3 deleted \(nothing to resume: cw-[^)]*\)$/.test(fact)) && J(keptNamed.split(', ').sort()) === J([socks.labChat, socks.ledgerChat, socks.acpChat].sort()) && verdictOf([socks.plainTerm, socks.noIdChat, socks.goneThread].every((s) => delNamed.includes(s))),
    `§2 THE FACTS LINE (the boot trace's notes, ⚙ Diagnostics), said once the kept copies were looked for — the codex thread its harness answered «no transcript» for is said DELETED, never kept (r2): «${fact}»`, notes);
  ok(verdictOf(lines.some((l) => l.includes(`↳ local session meta kept as stopped (antigravity ${UUID(1).slice(0, 8)}…`))), '§2 the journal says which meta was kept');
});

await section('§3 THE READ-BACK — the kept metas are /api/sessions rows, and the NEXT boot reads them back', async () => {
  const W = W2;
  const rows = await W.api.stoppedSessions();
  const r = rows.find((x) => x.backendSessionId === UUID(1));
  ok(gateOf(r) && r.backend === 'antigravity' && r.sessionId === UUID(1) && r.status === 'stopped' && r.stopReason === 'dead-socket-at-boot' && r.name === AGY_META.name && r.cwd === AGY_META.cwd && r.mode === 'chat' && r.accountId === AGY_META.accountId && typeof r.stoppedAt === 'number' && r.kept === socks.labChat,
    '§3 the incident\'s session is a STOPPED row with why, when, its name, folder, mode and account (the sidebar\'s card, the window\'s history, the resume-all offer read it)', r);
  ok(rows.length === 3 && gateOf(rows.some((x) => x.backendSessionId === CID(1) && x.backend === 'claude')) && verdictOf(rows.some((x) => x.backendSessionId === 'ses_7')), '§3 …and the claude and ACP ones; the codex one its harness deleted is not listed', rows.map((x) => x.backend + ':' + x.backendSessionId));
  const B = api(W);
  const rows2 = await B.stoppedSessions();
  ok(rows2.length === 3 && J(rows2.map((x) => x.backendSessionId).sort()) === J(rows.map((x) => x.backendSessionId).sort()) && rows2.find((x) => x.backendSessionId === UUID(1))?.accountId === AGY_META.accountId,
    '§3 THE NEXT BOOT reads them back from disk (a fresh boot-restore over the same data dir, no socket at all)', rows2);
  // the manager design's piece 4: the resume verb judges ONE ended conversation by its kept record (the instance's own keptRecordOf)
  const kr = await W.api.keptRecordOf('claude:' + CID(1)), ka = await W.api.keptRecordOf('antigravity:' + UUID(1)), kn = await W.api.keptRecordOf('claude:nobody');
  ok(gateOf(kr) && kr.sockFile === socks.ledgerChat && kr.id === CID(1) && gateOf(kr.meta) && kr.meta.cwd === '/srv/u/ledger' && gateOf(ka) && ka.sockFile === socks.labChat && kn === null,
    '§3 piece 4: ONE conversation\'s kept record by its key — {sockFile, meta, id} for the claude and the antigravity ones, null for none', { kr: kr && kr.sockFile, ka: ka && ka.sockFile, kn });
  const kb = await B.keptRecordOf('claude:' + CID(1));
  const RLs = require(path.join(REPO, 'src/server/resume-line.js'));
  const F = RLs.keptFacts(kb, null);
  ok(gateOf(kb) && kb.sockFile === socks.ledgerChat && F.kept === true && F.mode === 'chat' && F.goal === 'unknown' && F.cwd === '/srv/u/ledger' && RLs.sidecarNameOf(kb) !== null,
    '§3 piece 4: the NEXT boot reads it back (its kept copies loaded first); its facts — kept, chat, its folder, the goal UNKNOWN with no wrapper sidecar here (never «none»)', { kb: kb && kb.sockFile, F });
  const old = 'cw-7-1793000000007';
  fs.writeFileSync(path.join(W.META, old + '.json.stopped'), J({ backend: 'claude', claudeSessionId: CID(7), name: 'Kept by .365', cwd: '/srv/u/old', mode: 'chat', stoppedAt: 1793000000000 }));
  const rows3 = await api(W).stoppedSessions();
  const o = rows3.find((x) => x.backendSessionId === CID(7));
  ok(gateOf(o) && o.status === 'stopped' && o.stopReason === 'dead-socket-at-boot' && o.name === 'Kept by .365', '§3 a copy 2.369.365 kept (stoppedAt, no status, no reason) reads back the same — its only producer was a dead socket', o);
  const active = new Map([['sess-live', { backend: 'antigravity', backendSessionId: UUID(1), name: 'Kiln notes' }]]);
  const rows4 = await api(W, { active }).stoppedSessions();
  await tick(50);
  ok(!rows4.some((x) => x.backendSessionId === UUID(1)) && !fs.existsSync(path.join(W.META, socks.labChat + '.json.stopped')), '§3 a conversation a live session runs again CONSUMES its copy (the resume took it — the row is the live one now)', rows4.map((x) => x.backendSessionId));
  const a = 'cw-8-1793000000008', b = 'cw-9-1793000000009';
  fs.writeFileSync(path.join(W.META, a + '.json.stopped'), J({ backend: 'codex', backendSessionId: 'thr-8', name: 'older', stoppedAt: 1000 }));
  fs.writeFileSync(path.join(W.META, b + '.json.stopped'), J({ backend: 'codex', backendSessionId: 'thr-8', name: 'newer', stoppedAt: 2000 }));
  const rows5 = await api(W).stoppedSessions();
  await tick(50);
  ok(rows5.filter((x) => x.backendSessionId === 'thr-8').length === 1 && rows5.find((x) => x.backendSessionId === 'thr-8').name === 'newer' && !fs.existsSync(path.join(W.META, a + '.json.stopped')),
    '§3 two stops of one conversation: the newer copy is the row, the older one goes', rows5.filter((x) => x.backendSessionId === 'thr-8'));
});

await section('§4 THE RE-PROBE takes the same road — a socket the boot could not ask, settled dead later, is kept STOPPED', async () => {
  const W = world('reprobe');
  const flag = path.join(W.d, 'dead-now');
  for (const b of ['fuser', 'pgrep']) fs.writeFileSync(path.join(W.bin, b), `#!/bin/sh\nif [ -f "${flag}" ]; then exit 1; fi\nexec sleep 3\n`, { mode: 0o755 });
  const sock = W.add(1, { ...AGY_META, backendSessionId: UUID(4), name: 'Asked later' });
  const notes = [], active = new Map();
  const A = api(W, { notes, active });
  const cap0 = process.env.VIBESPACE_PROBE_CAP_MS; process.env.VIBESPACE_PROBE_CAP_MS = '400';
  try {
    await withPath(W, () => quiet(async () => { await A.probeSockets(); A.restoreSessions(); }));
    const pend = A.probePending();
    ok(gateOf(pend.has(sock)) && active.size === 1, '§4 the boot had no answer for it: adopted ALIVE, probe-pending (B-92a4 — a non-answer is never a kill)', [...pend.keys()]);
    fs.writeFileSync(flag, '');
    await withPath(W, () => quiet(async () => { await A.reprobePending(); await A.stoppedSettled(); }));
    const k = W.json(sock + '.json.stopped');
    ok(gateOf(k) && k.status === 'stopped' && k.stopReason === 'dead-socket-at-boot' && k.name === 'Asked later' && k.accountId === AGY_META.accountId && active.size === 0,
      '§4 the re-probe settles it dead: retireDeadSocket\'s ONE road — kept STOPPED with its materials, the adopted session gone', k);
    ok(verdictOf(notes.some((l) => l === `dead sockets (re-probe 1): 1 stopped (kept: ${sock}), 0 deleted`)), '§4 the re-probe\'s facts line says what it kept', notes.filter((l) => /dead sockets/.test(l)));
    ok(verdictOf((await A.stoppedSessions()).some((x) => x.backendSessionId === UUID(4))), '§4 …and it is read back as a stopped row');
  } finally { if (cap0 === undefined) delete process.env.VIBESPACE_PROBE_CAP_MS; else process.env.VIBESPACE_PROBE_CAP_MS = cap0; }
});

await section('§5 THE MERGE — routes/sessions mergeKeptStopped (PURE): the kept meta over a harness\'s own rows', async () => {
  const { mergeKeptStopped } = require(path.join(REPO, 'src/routes/sessions.js'));
  const kept = []; // one push per row (a literal array of backend-keyed rows reads as a harness table to test-harness-add-census)
  kept.push({ backend: 'claude', sessionId: CID(1), backendSessionId: CID(1), status: 'stopped', stopReason: 'dead-socket-at-boot', stoppedAt: 5, name: 'Ledger', cwd: '/srv/u/ledger', mode: 'chat', accountId: 'acct-x', kept: 'cw-2-x' });
  kept.push({ backend: 'codex', sessionId: 'thr-l', backendSessionId: 'thr-l', status: 'stopped', stopReason: 'dead-socket-at-boot', stoppedAt: 6, name: 'kept name', accountId: 'acct-c', kept: 'cw-3-x' });
  kept.push({ backend: 'opencode', sessionId: 'ses_1', backendSessionId: 'ses_1', status: 'stopped', stopReason: 'dead-socket-at-boot', stoppedAt: 7, name: 'ACP one', cwd: '/srv/a', mode: 'chat', accountId: null, kept: 'cw-4-x' });
  const rows = [];
  rows.push({ backend: 'claude', sessionId: CID(1), backendSessionId: CID(1), status: 'stopped', name: '', cwd: '/srv/u/ledger', startedAt: 9 });
  rows.push({ backend: 'codex', sessionId: 'thr-l', backendSessionId: 'thr-l', status: 'live', name: 'running', startedAt: 8, webuiId: 'sess-1' });
  mergeKeptStopped(rows, kept);
  const c = rows.find((r) => r.backendSessionId === CID(1)), x = rows.find((r) => r.backendSessionId === 'thr-l'), o = rows.find((r) => r.backendSessionId === 'ses_1');
  ok(c.stopReason === 'dead-socket-at-boot' && c.stoppedAt === 5 && c.name === 'Ledger' && c.accountId === 'acct-x' && c.startedAt === 9, '§5 a harness\'s own STOPPED row takes why, when, the name the person knew and the account', c);
  ok(!x.stopReason && x.name === 'running' && !x.accountId, '§5 a LIVE row is the conversation running — the kept meta adds nothing', x);
  ok(gateOf(o) && o.status === 'stopped' && o.stopReason === 'dead-socket-at-boot' && o.sessionKey === 'opencode:ses_1' && rows.length === 3, '§5 a conversation no harness lists (an ACP agent\'s) is listed from the meta alone, keyed', o);
});

await section('§6 ANTIGRAVITY\'S STORE.DISCOVER — the account store\'s conversations, titled and dated, each with its account', async () => {
  const D = require(path.join(REPO, 'src/agy-discover.js'));
  const AS = require(path.join(REPO, 'src/agy-store.js'));
  const dd = scratchDir('dsk-agy-data');
  const mkIndex = (home, rows) => {
    const root = path.join(home, '.gemini', 'antigravity-cli'); fs.mkdirSync(root, { recursive: true });
    const db = new DatabaseSync(path.join(root, AS.SUMMARIES));
    db.exec("CREATE TABLE IF NOT EXISTS `conversation_summaries` (`conversation_id` text,`title` text NOT NULL DEFAULT \"\",`preview` text NOT NULL DEFAULT \"\",`step_count` integer NOT NULL DEFAULT 0,`last_modified_time` datetime NOT NULL,`workspace_uris` text NOT NULL,`status` text NOT NULL DEFAULT \"\",`parent_conversation_id` text NOT NULL DEFAULT \"\",`nesting_depth` integer NOT NULL DEFAULT 0,`last_user_input_time` datetime NOT NULL,PRIMARY KEY (`conversation_id`))");
    const ins = db.prepare('INSERT OR REPLACE INTO conversation_summaries (conversation_id, title, preview, last_modified_time, workspace_uris, nesting_depth, last_user_input_time) VALUES (?,?,?,?,?,?,?)');
    for (const r of rows) ins.run(r.id, r.title, 'PREVIEW-NEVER-READ', r.at, J(['file://' + encodeURI(r.cwd)]), r.depth || 0, r.at);
    db.close();
  };
  const acct = path.join(dd, 'agy-subs', 'agy-e0e0e0e0e0e0');
  mkIndex(acct, [{ id: UUID(1), title: 'Kiln glaze study', at: '2026-10-30 08:58:46.926677824+00:00', cwd: '/srv/u/kiln study' },
    { id: UUID(2), title: '', at: '2026-10-21 23:15:38.095028728+00:00', cwd: '/srv/u/kiln study', depth: 1 },
    { id: UUID(3), title: 'Older one', at: '2026-10-21 14:47:51.257754886+00:00', cwd: '/srv/u/other' }]);
  mkIndex(HOME, [{ id: UUID(5), title: 'On the machine login', at: '2026-10-29 10:00:00.000000000+00:00', cwd: '/srv/u/m' }]);
  fs.mkdirSync(path.join(dd, 'agy-subs', 'not-an-account'), { recursive: true });
  let runs = 0; const runChild = (...a) => { runs++; return D.runIndexChild(...a); };
  const active = new Map([['sess-live-3', { backend: 'antigravity', backendSessionId: UUID(3), name: 'Running', mode: 'chat' }]]);
  D._cache.clear();
  const t0 = 1793400000000;
  const rows = await D.discover({ activeSessions: active, harnessId: 'antigravity', dataDir: dd, now: t0, runChild });
  const r1 = rows.find((r) => r.backendSessionId === UUID(1));
  ok(gateOf(r1) && r1.backend === 'antigravity' && r1.sessionId === UUID(1) && r1.status === 'stopped' && r1.name === 'Kiln glaze study' && r1.startedAt === Date.parse('2026-10-30T08:58:46.926Z') && r1.cwd === '/srv/u/kiln study' && r1.accountId === 'agy-e0e0e0e0e0e0',
    '§6 THE RECOVERY DOOR: the owner\'s kind of conversation is a STOPPED row named by its title, dated by its last write, in its folder, under its ACCOUNT (the sidebar\'s Resume goes there)', r1);
  ok(!rows.some((r) => r.backendSessionId === UUID(2)), '§6 a sub-agent\'s row (nesting_depth 1) is no conversation of its own');
  const r3 = rows.find((r) => r.backendSessionId === UUID(3));
  ok(gateOf(r3) && r3.status === 'live' && r3.webuiId === 'sess-live-3' && r3.webuiName === 'Running', '§6 a conversation a session runs is LIVE, with its webui id (as codex\'s rows)', r3);
  const r5 = rows.find((r) => r.backendSessionId === UUID(5));
  ok(gateOf(r5) && r5.accountId === 'subscription' && r5.name === 'On the machine login', '§6 the machine\'s own login root is listed too — its account named the create\'s way («subscription» = the CLI\'s own login), so a resume goes to THAT store, never the default (r2)', r5);
  ok(rows[0].backendSessionId === UUID(1) && runs === 1, `§6 newest first; ONE child for every root whose index was not read yet (${runs})`);
  ok(!/preview/i.test(AS.SUMMARY_SQL) && !J(rows).includes('PREVIEW-NEVER-READ'), '§6 the index is asked for a list row only — never a preview, never a transcript');
  await D.discover({ activeSessions: active, harnessId: 'antigravity', dataDir: dd, now: t0 + 1000, runChild });
  await D.discover({ activeSessions: active, harnessId: 'antigravity', dataDir: dd, now: t0 + D.CHECK_MS + 1, runChild });
  ok(runs === 1, `§6 within CHECK_MS nothing is looked at; past it, an UNCHANGED index is not read again (children: ${runs})`);
  await tick(20);
  mkIndex(acct, [{ id: UUID(6), title: 'Brand new', at: '2026-10-31 01:00:00.000000000+00:00', cwd: '/srv/u/n' }]);
  const rows2 = await D.discover({ activeSessions: active, harnessId: 'antigravity', dataDir: dd, now: t0 + 2 * D.CHECK_MS + 2, runChild });
  ok(runs === 2 && verdictOf(rows2.some((r) => r.backendSessionId === UUID(6) && r.name === 'Brand new')), `§6 an index that CHANGED is read again — one child (${runs})`);
  ok(typeof HARN.get('antigravity').store.discover === 'function', '§6 the descriptor\'s store.discover is wired (routes/sessions iterates it like claude\'s and codex\'s)');
  const src = read('src/agy-discover.js').replace(/\/\/.*$/gm, '');
  ok(!/node:sqlite|DatabaseSync/.test(src) && verdictOf(/agy-summaries\.js/.test(src)), '§6 the hub never opens the db — data/bin/agy-summaries.js does, as a child (test-architecture §73)');
  D._cache.clear();
});

await section('§7 THE DOORS — every surface says why, and a resume goes to the account its row names', async () => {
  const W = await import(pathToFileURL(path.join(REPO, 'src/lib/stopped-why.js')).href);
  const row = { backend: 'antigravity', backendSessionId: UUID(1), sessionId: UUID(1), status: 'stopped', stopReason: 'dead-socket-at-boot', accountId: 'agy-e0e0e0e0e0e0' };
  const SENT = 'Its process ended while the server was down.';
  ok(W.stoppedWhyOf(row) === SENT && W.stoppedWhyOf({ ...row, status: 'live' }) === '' && W.stoppedWhyOf({ ...row, stopReason: undefined }) === '' && W.stoppedWhyOf({ ...row, stopReason: 'other' }) === '',
    '§7 THE SENTENCE: a stopped row a boot kept says why; a live one, a plain stopped one and an unknown reason say nothing');
  ok(W.stoppedWhyFor('antigravity', UUID(1), [row]) === SENT && W.stoppedWhyFor('antigravity', UUID(1), [{ ...row, status: 'live' }]) === '', '§7 a conversation\'s sentence comes from its row');
  W.noteStoppedRows([{ ...row, backendSessionId: UUID(9), sessionId: UUID(9) }]);
  ok(W.stoppedWhyFor('antigravity', UUID(9), []) === SENT, '§7 …or from the boot\'s own list (layout restoreState) before the sidebar has one');
  ok(W.keptAccountOf([row], 'antigravity', UUID(1)) === 'agy-e0e0e0e0e0e0' && W.keptAccountOf([{ ...row, accountId: null }], 'antigravity', UUID(1)) === undefined && W.keptAccountOf([{ ...row, status: 'live' }], 'antigravity', UUID(1)) === undefined,
    '§7 the account a resume goes to: the row\'s (a kept meta\'s, the agy index\'s root); none named = the old default road');
  const RAO = typeof W.resumeAccountOf === 'function' ? W.resumeAccountOf : () => '(no resumeAccountOf)'; // a base without it fails these legs BY NAME
  ok(RAO(undefined, [row], 'antigravity', UUID(1)) === 'agy-e0e0e0e0e0e0' && RAO('agy-ffffffffffff', [row], 'antigravity', UUID(1)) === 'agy-ffffffffffff' && RAO('', [row], 'antigravity', UUID(1)) === 'agy-e0e0e0e0e0e0' && RAO(null, [], 'antigravity', UUID(1)) === undefined,
    '§7 THE ONE ACCOUNT (r2, minor 1): the saved config\'s pick, else the row\'s, else the default — resumeAccountOf');
  W.noteStoppedRows([{ ...row, backendSessionId: UUID(8), sessionId: UUID(8), stoppedAt: 1111 }]);
  ok(W.stoppedWhyFor('antigravity', UUID(8), [{ ...row, backendSessionId: UUID(8), sessionId: UUID(8), stopReason: undefined, stoppedAt: 1111 }]) === SENT,
    '§7 the remembered reason still words the stop it was read for (same stoppedAt, a row that lost its reason)');
  ok(W.stoppedWhyFor('antigravity', UUID(8), [{ ...row, backendSessionId: UUID(8), sessionId: UUID(8), stopReason: undefined, stoppedAt: 2222 }]) === '',
    '§7 A LATER STOP for another reason is never worded «ended while the server was down» (r2, minor 2: the boot\'s reason is for ITS stop only)');
  ok(W.stoppedWhyFor('antigravity', UUID(8), [{ ...row, backendSessionId: UUID(8), sessionId: UUID(8), status: 'live' }]) === '' && W.stoppedWhyFor('antigravity', UUID(8), []) === '',
    '§7 …and a conversation seen running again has spent it: the page forgets the boot\'s reason');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [SENT, 'Resume interrupted sessions?', '{n} sessions were interrupted (the server or a machine restarted) and reopened as read-only history. Resume all of them now?', '{n} of them stopped because their process ended while the server was down.', 'Resume all {n}'];
  ok(verdictOf(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':'))), '§7 every new word has its zh and ja entry', keys.filter((k) => !zh.includes(J(k) + ':') || !ja.includes(J(k) + ':')));
  const card = read('src/lib/session-card.js'), cv = read('src/lib/chat-view.js'), lay = read('src/lib/layout.js'), lc = read('src/lib/session-lifecycle.js');
  const body = (src, head) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); };
  ok(verdictOf(/\$\{stoppedWhyOf\(s\) \? `<div class="session-card-sub session-card-why"/.test(card)), '§7 WIRING: the sidebar\'s card prints the sentence under a stopped row');
  ok(verdictOf(/stoppedWhyFor\(spec\.backend, spec\.backendSessionId, this\.app\?\.sidebar\?\._allSessions\)/.test(body(cv, '  _showResumeBar() {'))), '§7 WIRING: the read-only window\'s resume bar says it before «Session is read-only.»');
  ok(gateOf(/stoppedWhyFor\(/.test(body(lay, '  _paintPlaceholder(win) {'))) && gateOf(/t\('\{n\} of them stopped because their process ended while the server was down\.'/.test(body(lay, '  async _offerResumeAll(stopped) {'))) && verdictOf(/noteStoppedRows\(allSessions\)/.test(lay)),
    '§7 WIRING: the window\'s stopped tile and the resume-all offer say it (the boot\'s list noted first)');
  ok(verdictOf(/accountId: accountId !== undefined \? accountId : resumeAccountOf\(savedCfg\.account, this\.sidebar\?\._allSessions, backend, targetBackendId(?:, \{ bound: accountBound\(backend\) && !hostId \})?\)/.test(body(lc, '  resumeSession('))),
    '§7 WIRING: resumeSession — ONE place for every door (the card, its click, the resume bar, the tile, resume-all) — falls back to the row\'s account, never the harness default');
  ok(verdictOf(/pinned: \{ account: resumeAccountOf\(saved\.account, this\.sidebar\?\._allSessions, backend, backendSessionId(?:, \{ bound: accountBound\(backend\) && !hostId \})?\) \|\| ''/.test(body(lc, '  _resumeAccountVerdict('))),
    '§7 WIRING (r2, minor 1): the Resume press\'s verdict — and the create-failure re-check, which asks the same verdict — judges THAT account, not the default');
  const RA = require(path.join(REPO, 'src/resume-account.js'));
  const kRow = { backend: 'claude', backendSessionId: CID(3), sessionId: CID(3), status: 'stopped', stopReason: 'dead-socket-at-boot', accountId: 'sub-aaaaaaaaaaaa' };
  const accts = [{ id: 'sub-aaaaaaaaaaaa', name: 'Kept one', type: 'subscription', backend: 'claude', loggedIn: false, loginState: { state: 'wiped' } }, { id: 'sub-bbbbbbbbbbbb', name: 'Default one', type: 'subscription', backend: 'claude', loggedIn: true }];
  const v = RA.resumeAccountVerdict({ pinned: { account: RAO(undefined, [kRow], 'claude', CID(3)) || '', backend: 'claude' }, accounts: accts, defaults: { defaultAccountId: 'sub-bbbbbbbbbbbb' } });
  ok(gateOf(v) && v.ok === false && gateOf(v.account) && v.account.id === 'sub-aaaaaaaaaaaa' && verdictOf((v.doors || []).some((d) => d.kind === 'relogin' && d.accountId === 'sub-aaaaaaaaaaaa')),
    '§7 A SIGNED-OUT KEPT ACCOUNT is refused IN THE BAR with its doors (sign in again / switch) — never a create failing into a bare toast', v);
});

await section('§8 THE BORROWED ID (r2, major 1) — a pending fork\'s copy never supersedes, nor is consumed through, its parent\'s', async () => {
  const W = world('fork');
  const pdir = path.join(HOME, '.claude', 'projects', SS.cwdToProjectDir('/srv/u/fork')); fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(path.join(pdir, CID(2) + '.jsonl'), J({ type: 'user', sessionId: CID(2), cwd: '/srv/u/fork', timestamp: '2026-10-30T09:00:00.000Z', message: { role: 'user', content: 'hi' } }) + '\n');
  const parent = W.add(11, { name: 'Parent', cwd: '/srv/u/fork', backend: 'claude', mode: 'chat', claudeSessionId: CID(2), accountId: 'acct-parent' });
  const fork = W.add(12, { name: 'Fork of parent', cwd: '/srv/u/fork', backend: 'claude', mode: 'chat', claudeSessionId: CID(2), forkRequested: true, forkSourceId: CID(2), accountId: 'acct-fork' });
  const dupOld = W.add(13, { ...AGY_META, backendSessionId: UUID(7), name: 'Second window', createdAt: 1793300000200 });
  const dupNew = W.add(14, { ...AGY_META, backendSessionId: UUID(7), name: 'First window', createdAt: 1793300000100 });
  const notes = [], live8 = new Map();   // B-a5a4 (9): the legs below ask THIS boot (a next boot sweeps the pending fork's copy)
  const A = api(W, { notes, active: live8 });
  const liveAs = (m) => { live8.clear(); for (const [k, v] of m) live8.set(k, v); };
  await withPath(W, () => quiet(async () => { await A.probeSockets(); A.restoreSessions(); await A.stoppedSettled(); }));
  ok(W.json(parent + '.json.stopped')?.name === 'Parent' && W.json(fork + '.json.stopped')?.name === 'Fork of parent',
    '§8 a parent and its PENDING fork both dead: BOTH copies stay (acceptance r1: the fork\'s superseded the parent\'s — one copy, the fork\'s name and account)');
  const rows = await A.stoppedSessions();
  const mine = rows.filter((x) => x.backendSessionId === CID(2));
  ok(mine.length === 2 && J(mine.map((x) => x.name).sort()) === J(['Fork of parent', 'Parent']) && J(mine.map((x) => x.accountId).sort()) === J(['acct-fork', 'acct-parent']) && mine.find((x) => x.name === 'Fork of parent').forkPending === true && !mine.find((x) => x.name === 'Parent').forkPending,
    '§8 …two kept rows, two names, two accounts — the fork\'s says forkPending (its id is its PARENT\'s, borrowed)', mine);
  const { mergeKeptStopped } = require(path.join(REPO, 'src/routes/sessions.js'));
  const listed = mergeKeptStopped([], rows).filter((x) => x.backendSessionId === CID(2));
  ok(listed.length === 1 && listed[0].name === 'Parent' && listed[0].accountId === 'acct-parent',
    '§8 …and the sidebar\'s row of that conversation is the PARENT\'s, its name and its account (a pending fork names no conversation of its own)', listed);
  const pendingLive = new Map([['sess-fork', { backend: 'claude', claudeSessionId: CID(2), _forkRequested: true, _forkSourceId: CID(2), name: 'Fork of parent' }]]);
  liveAs(pendingLive); const rowsP = await A.stoppedSessions();
  await tick(50);
  ok(gateOf(rowsP.some((x) => x.backendSessionId === CID(2) && x.name === 'Parent')) && verdictOf(fs.existsSync(path.join(W.META, parent + '.json.stopped'))),
    '§8 a LIVE pending fork does not consume its stopped parent\'s copy (addressableId: a borrowed id is nobody\'s address)', rowsP.map((x) => x.name));
  const owner = new Map([['sess-p', { backend: 'claude', claudeSessionId: CID(2), name: 'Parent' }]]);
  liveAs(owner); const rowsO = await A.stoppedSessions();
  await tick(50);
  ok(!rowsO.some((x) => x.name === 'Parent') && !fs.existsSync(path.join(W.META, parent + '.json.stopped')) && verdictOf(fs.existsSync(path.join(W.META, fork + '.json.stopped'))),
    '§8 the PARENT running again consumes its own copy — never the fork\'s (keyed by its socket)', rowsO.map((x) => x.name));
  ok(W.json(dupOld + '.json.stopped')?.name === 'Second window' && !W.json(dupNew + '.json.stopped'),
    '§8 two copies of ONE conversation from one boot (one stop instant): the later-CREATED session\'s stays, whichever socket the readdir met first');
  const fact = notes.find((l) => /^dead sockets: /.test(l)) || '';
  ok(fact === `dead sockets: 3 stopped (kept: ${parent}, ${fork}, ${dupOld}), 0 deleted, 1 superseded (by a newer copy of the same conversation: ${dupNew})`,
    `§8 THE FACTS LINE names the superseded copy as such, never «kept» (r2, minor 3): «${fact}»`, notes);
  try { fs.rmSync(W.d, { recursive: true, force: true }); } catch { }
});

await section('§9 THE HELD ACCOUNT (r2, major 2) — a resume that states no account goes to its row\'s, SERVER-SIDE, from every door', async () => {
  const RS0 = require(path.join(REPO, 'src/routes/sessions.js'));
  const RS = { ...RS0, heldAccountOf: RS0.heldAccountOf || (() => '(no heldAccountOf)'), _noteSweptRows: RS0._noteSweptRows || (() => { }) }; // a base without them fails BY NAME
  const kept = (accountId, backend = 'antigravity', id = UUID(1)) => ({ backend, sessionId: id, backendSessionId: id, status: 'stopped', stopReason: 'dead-socket-at-boot', name: 'Kiln notes', cwd: '/srv/u/kiln-study', mode: 'chat', accountId, kept: 'cw-1-x' });
  const rowsOf = (...k) => RS.mergeKeptStopped([], k);
  ok(J(RS.heldAccountOf('antigravity', UUID(1), rowsOf(kept('agy-e0e0e0e0e0e0')))) === J({ accountId: 'agy-e0e0e0e0e0e0' }), '§9 heldAccountOf: a kept agy row names its account ⇒ that account');
  ok(verdictOf(/no transcript of this conversation was found on this machine/.test((RS.heldAccountOf('antigravity', UUID(1), rowsOf(kept(null))) || {}).refuse || '')), '§9 …an agy row naming none ⇒ REFUSED by name (a KEPT meta\'s row names \'subscription\' since B-a5a4 — §10 (4)) (store.accountBound — the default\'s store does not hold it)');
  ok(RS.heldAccountOf('claude', CID(1), rowsOf(kept(null, 'claude', CID(1)))) === null && RS.heldAccountOf('antigravity', UUID(1), [{ ...kept('agy-e0e0e0e0e0e0'), status: 'live' }]) === null && RS.heldAccountOf('antigravity', UUID(1), []) === null,
    '§9 …a claude row naming none, a live row, no row ⇒ nothing said (the default, as before)');
  ok(HARN.get('antigravity').store.accountBound === true && HARN.list().filter((h) => h.store && h.store.accountBound).map((h) => h.id).join() === 'antigravity',
    '§9 store.accountBound is a descriptor fact (antigravity only), never a backend branch');
  // the REAL create (src/ws-create.js) behind the REAL For-you reopen (src/server/inbox-reopen.js): the account it resolves
  const d = scratchDir('dsk-held');
  const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
  const registry = createAdapterRegistry({ chatWrapper: '/nonexistent/c.js', codexChatWrapper: '/nonexistent/x.js', acpWrapper: '/nonexistent/a.js', acpCommands: { antigravity: '/nonexistent/agy' }, ptyWrapper: '/nonexistent/p.js', buffersDir: d });
  const asked = [], noop = () => undefined;
  let throwWith = 'probe-stop';
  const accounts = new Proxy({ resolveForSpawn: (id, b) => { asked.push([id, b]); throw new Error(throwWith); }, get: (id) => ({ id, name: id }) }, { get: (t, k) => (k in t ? t[k] : noop) });   // r2: every account this world names exists (named by its id)
  const ctx = new Proxy({ adapterRegistry: registry, activeSessions: new Map(), WS_OPEN: 1, sessionCounterRef: { value: 1 }, hosts: null, accounts, os: require('os'), fs, path,
    SOCKETS_DIR: d, BUFFERS_DIR: d, NODE_CMD: process.execPath, cliCmds: { forSpawn: async (b, c) => c }, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    integrationEnabled: () => true, harnessDeclares: () => false, harnessSpawnSettings: () => ({}) }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handleCreate = require(path.join(REPO, 'src/ws-create.js')).createWsCreateHandler({ ctx, agentEnv: () => ({}), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null, getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p });
  const reopenOf = (rows) => { RS._noteSweptRows(rows); return require(path.join(REPO, 'src/server/inbox-reopen.js')).create({ getOpenConversation: () => (spec, by, { ws }) => handleCreate(ws, spec, new Set()),
    activeSessions: new Map(), discover: async (key) => rows.find((r) => r.sessionKey === key) || null, readUserState: () => ({}), log: () => { } }); };
  const item = { sessionKey: 'antigravity:' + UUID(1), sessionName: 'Kiln notes' };
  const withCwd = (k) => ({ ...k, cwd: d });
  let r = null;
  await quiet(async () => { r = await reopenOf(rowsOf(withCwd(kept('agy-e0e0e0e0e0e0')))).reopen(item); });
  ok(J(asked) === J([['agy-e0e0e0e0e0e0', 'antigravity']]), '§9 THE FOR-YOU REPLY reopens a kept agy conversation ON ITS ACCOUNT: the create resolves the row\'s account (acceptance r1: none — the default\'s store, a NEW conversation adopted)', { asked, r });
  asked.length = 0;
  r = null; await quiet(async () => { r = await reopenOf(rowsOf(withCwd(kept(null)))).reopen(item); });
  ok(gateOf(r) && r.ok === false && r.why === 'no transcript of this conversation was found on this machine — it cannot be reopened here' && asked.length === 0,
    '§9 …an agy row naming no account is refused with the OLD words — and nothing is spawned', { r, asked });
  asked.length = 0;
  const sent = [];
  RS._noteSweptRows(rowsOf(withCwd(kept('agy-e0e0e0e0e0e0'))));
  await quiet(async () => { await handleCreate({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', backend: 'antigravity', mode: 'chat', cwd: d, resume: true, resumeId: UUID(1), reqId: 'r-auto' }, new Set()); });
  ok(J(asked) === J([['agy-e0e0e0e0e0e0', 'antigravity']]), '§9 …and every other door that states none (an automation\'s open, a page\'s plain create) — the ONE seam is the create itself', asked);
  asked.length = 0;
  const sentPick = [];
  await quiet(async () => { await handleCreate({ readyState: 1, send: (t) => sentPick.push(JSON.parse(t)) }, { type: 'create', backend: 'antigravity', mode: 'chat', cwd: d, resume: true, resumeId: UUID(1), accountId: 'agy-ffffffffffff', reqId: 'r-pick' }, new Set()); });
  ok(asked.length === 0 && verdictOf(sentPick.some((m) => m.type === 'error' && m.code === 'resume-account-bound' && m.i18n && m.i18n.key === RS0.BOUND_ELSEWHERE && m.accountId === 'agy-e0e0e0e0e0e0' && m.message === RS0.BOUND_ELSEWHERE.replace('{name}', 'agy-e0e0e0e0e0e0'))),
    '§9 B-a5a4 r1 (1): an account the door STATES that is not the one the agy row names is REFUSED by name (the store of agy-ffff… does not hold it; the Resume bar\'s switch offered it) — nothing spawned', { asked, sentPick });
  asked.length = 0;
  await quiet(async () => { await handleCreate({ readyState: 1, send: () => { } }, { type: 'create', backend: 'antigravity', mode: 'chat', cwd: d, resume: true, resumeId: UUID(1), accountId: 'agy-e0e0e0e0e0e0', reqId: 'r-same' }, new Set()); });
  ok(J(asked) === J([['agy-e0e0e0e0e0e0', 'antigravity']]), '§9 …the account its row names, stated, goes as stated', asked);
  // §11 (4) THE DELETED ACCOUNT, DRIVEN (the follow-up — it had a source pin alone): the row names agy-dddd…, the accounts store
  // no longer knows it ⇒ the REAL create answers resume-account-gone by name and spawns nothing (never the default's store)
  asked.length = 0; throwWith = 'unknown account: agy-dddddddddddd';
  const sentGone = [], live = ctx.activeSessions.size;
  RS._noteSweptRows(rowsOf(withCwd(kept('agy-dddddddddddd'))));
  await quiet(async () => { await handleCreate({ readyState: 1, send: (t) => sentGone.push(JSON.parse(t)) }, { type: 'create', backend: 'antigravity', mode: 'chat', cwd: d, resume: true, resumeId: UUID(1), accountId: 'agy-dddddddddddd', reqId: 'r-gone' }, new Set()); });
  const errsGone = sentGone.filter((m) => m.type === 'error');
  ok(J(asked) === J([['agy-dddddddddddd', 'antigravity']]) && errsGone.length === 1 && errsGone[0].code === 'resume-account-gone' && errsGone[0].message === RS0.ACCT_GONE_BOUND && !sentGone.some((m) => m.type === 'created') && ctx.activeSessions.size === live,
    '§11 (4) a resume whose row\'s account was DELETED (agy) is refused resume-account-gone through the real create — the one error, nothing spawned, no degrade to the default login', { asked, sentGone, live: ctx.activeSessions.size });
  throwWith = 'probe-stop';
  RS._noteSweptRows(null);
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { }
});

await section('§10 B-a5a4 — the r2 reviewer\'s follow-ups: a deleted account on an account-bound harness, the seam before the first sweep, the copy consumed when the resume ran a turn, one sentence, a pending fork\'s copy swept', async () => {
  const RS = require(path.join(REPO, 'src/routes/sessions.js'));
  const IR = require(path.join(REPO, 'src/inbox-reopen.js'));
  // (6) ONE sentence: the PURE reopen module owns it, the seam reads it
  const RSRC = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8');
  ok(IR.NO_TRANSCRIPT_HERE === 'no transcript of this conversation was found on this machine — it cannot be reopened here' && gateOf(/const \{ NO_TRANSCRIPT_HERE \} = require\('\.\.\/inbox-reopen\.js'\);/.test(RSRC)) && !RSRC.includes("'no transcript of this conversation was found"),
    '§10 (6) the refusal is ONE constant (src/inbox-reopen.js) — routes/sessions reads it, spells it nowhere');
  // (1) a deleted account on a harness whose conversation lives in its account's own store is REFUSED, never degraded
  ok(gateOf(RS.acctGoneOf('antigravity')) && RS.acctGoneOf('antigravity').refuse === RS.ACCT_GONE_BOUND && RS.acctGoneOf('claude') === null,
    '§10 (1) acctGoneOf: an account-bound harness (antigravity) ⇒ refused by name; claude ⇒ the degrade to the default login, said, as before');
  const WSRC = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  ok(verdictOf(/const gone = \(\(\) => \{ try \{ return require\('\.\/routes\/sessions'\)\.acctGoneOf\(backend\); \} catch \{ return null; \} \}\)\(\);\n\s*if \(gone && gone\.refuse\) \{ ws\.send\(JSON\.stringify\(\{ type: 'error', reqId: data\.reqId, code: 'resume-account-gone'/.test(WSRC)),
    '§10 (1) WIRING: the deleted-account branch asks acctGoneOf BEFORE it degrades');
  // (3) the seam before the first sweep reads the kept copies themselves
  const keptRow = { backend: 'antigravity', sessionId: UUID(5), backendSessionId: UUID(5), status: 'stopped', accountId: 'agy-e0e0e0e0e0e0', kept: 'cw-5-x' };
  const h3 = await RS.heldAccountOfNow('antigravity', UUID(5), { rows: null, stopped: async () => [keptRow] });
  const h3b = await RS.heldAccountOfNow('antigravity', UUID(5), { rows: [], stopped: async () => [keptRow] });
  const h3c = await RS.heldAccountOfNow('antigravity', UUID(5), { rows: [{ ...keptRow, accountId: 'agy-0123456789ab' }], stopped: async () => [keptRow] });
  const h3d = await RS.heldAccountOfNow('antigravity', UUID(5), { rows: [keptRow], stopped: () => new Promise(() => { }), boundMs: 30 });
  ok(J(h3) === J({ accountId: 'agy-e0e0e0e0e0e0' }) && J(h3b) === J(h3) && J(h3d) === J(h3) && verdictOf(/held = await require\('\.\/routes\/sessions'\)\.heldAccountOfNow\(backend, data\.resumeId\);/.test(WSRC)),
    '§10 (3) the seam reads the kept copies AS THEY STAND, over the last sweep\'s rows (none yet, an empty one); a read-back that hangs is bounded — the sweep\'s rows then', { h3, h3b, h3d });
  ok(J(h3c) === J({ accountId: 'agy-0123456789ab' }), '§10 (3) …a sweep\'s STOPPED row naming its own account keeps it (the page\'s merge rule — §11 (1))', h3c);
  // (1) r1: an account the door STATES on an account-bound harness, not the row's, is refused (the seam's helper)
  const be = await RS.boundElsewhereOf('antigravity', UUID(5), 'agy-ffffffffffff', { rows: [], stopped: async () => [keptRow] });
  const be2 = await RS.boundElsewhereOf('antigravity', UUID(5), 'agy-e0e0e0e0e0e0', { rows: [], stopped: async () => [keptRow] });
  const be3 = await RS.boundElsewhereOf('claude', CID(5), 'sub-ffffffffffff', { rows: [{ ...keptRow, backend: 'claude', sessionId: CID(5), backendSessionId: CID(5), accountId: 'sub-aaaaaaaaaaaa' }], stopped: async () => [] });
  ok(gateOf(be) && be.refuse === RS.BOUND_ELSEWHERE && be.accountId === 'agy-e0e0e0e0e0e0' && be2 === null && be3 === null, '§10 (1) boundElsewhereOf: agy, another account stated ⇒ refused; the row\'s own ⇒ goes; claude (not account-bound) ⇒ never overridden', { be, be2, be3 });
  // (4) r1: the KEPT row of an agy meta that named no account says 'subscription' (one account for the seam AND the page's verdict)
  {
    const W4 = world('acct4');
    fs.writeFileSync(path.join(W4.META, 'cw-4-1.json.stopped'), J({ webuiSessionId: 'sess-4-1', backend: 'antigravity', mode: 'chat', name: 'Own login', cwd: '/srv/u/own', backendSessionId: UUID(6), accountId: null, status: 'stopped', stoppedAt: 1793300000600, stopReason: 'dead-socket-at-boot' }));
    fs.writeFileSync(path.join(W4.META, 'cw-4-2.json.stopped'), J({ webuiSessionId: 'sess-4-2', backend: 'claude', mode: 'chat', name: 'Claude own', cwd: '/srv/u/own', claudeSessionId: CID(6), status: 'stopped', stoppedAt: 1793300000600, stopReason: 'dead-socket-at-boot' }));
    let rows4 = [];
    await quiet(async () => { rows4 = await api(W4).stoppedSessions(); });
    const agy = rows4.find((x) => x.name === 'Own login'), cl = rows4.find((x) => x.name === 'Claude own');
    ok(gateOf(agy) && agy.accountId === 'subscription' && gateOf(cl) && cl.accountId === null && J(RS.heldAccountOf('antigravity', UUID(6), rows4)) === J({ accountId: 'subscription' }),
      '§10 (4) a kept agy meta that named no account: its ROW says \'subscription\' (the machine\'s own login) — the seam and the page\'s verdict read ONE account; a claude meta\'s null stays null', { agy: agy && agy.accountId, cl: cl && cl.accountId });
    try { fs.rmSync(W4.d, { recursive: true, force: true }); } catch { }
  }
  // (5) + the words: the create-failure rescue serves every chat harness; a server sentence is said in the reader's words
  const LSRC = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
  ok(gateOf(/if \(sessionMode === 'chat' && resumeId && !\/\^sess-\\d\/\.test\(resumeId\)\) \{/.test(LSRC)) && verdictOf(/\(msg\.message \? t\(msg\.message\) : ''\)/.test(LSRC)),
    '§10 (5) the failed-resume rescue (and its account re-check) is no longer claude\'s alone; (1) the refusal reaches the page translated (t(msg.message))');
  // (2) A RESUME THAT RAN CONSUMES ITS COPY AT ONCE: a turn that ended WELL (server.js's ONE turn-end entry) takes the copy, with no
  // /api/sessions sweep between — never a FAILED resume's end (r1 lost a failed resume's copy), never a pending fork's borrowed id
  {
    const WC = world('consume2');
    const k2 = (n, o) => ({ webuiSessionId: 'sess-2-' + n, backend: 'claude', mode: 'chat', name: 'Resumed ' + n, cwd: '/srv/u/two', status: 'stopped', stoppedAt: 1793300000700, stopReason: 'dead-socket-at-boot', accountId: 'sub-old-' + n, ...o });
    const put = (n, o) => fs.writeFileSync(path.join(WC.META, `cw-2-${n}.json.stopped`), J(k2(n, o)));
    put(1, { claudeSessionId: CID(8) }); put(2, { claudeSessionId: CID(9) });
    put(4, { backend: 'antigravity', claudeSessionId: undefined, backendSessionId: UUID(8), accountId: 'agy-0a0a0a0a0a0a' });
    put(5, { backend: 'codex', backendSessionId: 'thr-25', accountId: 'acct-c25' });
    const kept = (n) => fs.existsSync(path.join(WC.META, `cw-2-${n}.json.stopped`));
    const nextBoot = async () => { let r = []; await quiet(async () => { r = await api(WC).stoppedSessions(); }); return r; };
    // the CLI's own answer to a resume it cannot load (scripts/test-resume-breaker.mjs's stub — that suite's breaker reads it):
    // a stream-json error RESULT on stdout, then exit 1 — a «turn end» for the stdout consumer
    const FAILED = { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['No conversation found with session ID: ' + CID(8)] };
    const RAN = { type: 'result', subtype: 'success', is_error: false, session_id: CID(8) };
    const claudeS = { backend: 'claude', claudeSessionId: CID(8), backendSessionId: CID(8), name: 'Resumed 1' };
    const agyS = (stop) => ({ backend: 'antigravity', backendSessionId: UUID(8), _promptStopReason: stop });
    const forkLive = { backend: 'claude', claudeSessionId: CID(9), _forkRequested: true, _forkSourceId: CID(9), name: 'A fork of 2' };
    // CONTROL first (rule (b)): before any turn end, with no sweep, a next boot lists the stale rows, the old accounts on them
    const pre = await nextBoot();
    ok(gateOf(pre.some((x) => x.backendSessionId === CID(8) && x.accountId === 'sub-old-1')) && gateOf(pre.some((x) => x.backendSessionId === UUID(8))) && gateOf(pre.some((x) => x.backendSessionId === 'thr-25')) && verdictOf(kept(1)),
      '§10 (2) CONTROL: before any turn end and with no sweep, the copies stand — a next boot lists the old rows (the old accounts on them): the stale rows this cure removes are really there', pre.map((x) => x.name));
    const A2 = api(WC, { active: new Map([['sess-c', claudeS], ['sess-f', forkLive]]) });
    // a FAILED resume's end and an ACP prompt ended in 'error' — then another harness's session with the same id and a live pending
    // fork — while every copy still stands
    const gFail = await A2.consumeKeptOf(claudeS, FAILED), gAgyErr = await A2.consumeKeptOf(agyS('error'));
    const gOther = await A2.consumeKeptOf({ backend: 'codex', backendSessionId: CID(8) }), gFork = await A2.consumeKeptOf(forkLive, RAN);
    const mid = await nextBoot();
    ok(gFail === null && gAgyErr === null && gateOf(kept(1)) && gateOf(kept(4)) && gateOf(mid.some((x) => x.backendSessionId === CID(8) && x.accountId === 'sub-old-1' && x.name === 'Resumed 1')) && verdictOf(mid.some((x) => x.backendSessionId === UUID(8) && x.accountId === 'agy-0a0a0a0a0a0a')),
      '§10 (2) a FAILED resume keeps its copy: the CLI\'s error result («No conversation found…», is_error) and an ACP prompt ended in \'error\' consume nothing — the next boot still lists each row with its name and its account', { gFail, gAgyErr, mid: mid.map((x) => [x.name, x.accountId]) });
    ok(gOther === null && gFork === null && gateOf(kept(1)) && verdictOf(kept(2)), '§10 (2) another harness\'s session carrying the same id, and a live pending fork (a borrowed id), consume nothing', { gOther, gFork });
    // turns that ended WELL: a claude success result, an ACP end_turn, codex's task_complete (its one call — no record)
    const gRan = await A2.consumeKeptOf(claudeS, RAN), gAgy = await A2.consumeKeptOf(agyS('end_turn')), gCodex = await A2.consumeKeptOf({ backend: 'codex', backendSessionId: 'thr-25' });
    const after = await nextBoot();
    ok(gRan === 'cw-2-1' && gAgy === 'cw-2-4' && gCodex === 'cw-2-5' && !kept(1) && !kept(4) && !kept(5) && !after.some((x) => [CID(8), UUID(8), 'thr-25'].includes(x.backendSessionId)) && verdictOf(after.some((x) => x.backendSessionId === CID(9) && x.name === 'Resumed 2')),
      '§10 (2) a resume that RAN — its turn ended well (claude success, ACP end_turn, codex task_complete) — consumes its conversation\'s copy at once: the next boot lists no stale row for it; the untouched conversation\'s stays', { gRan, gAgy, gCodex, after: after.map((x) => x.name) });
    // PURE: the one predicate
    ok(gateOf(BRm.turnRan(RAN, claudeS)) && !BRm.turnRan(FAILED, claudeS) && !BRm.turnRan({ type: 'result', subtype: 'error_max_turns', is_error: false }, claudeS) && gateOf(BRm.turnRan(null, { backend: 'codex' }))
        && !BRm.turnRan(null, agyS('error')) && !BRm.turnRan(null, agyS('cancelled')) && gateOf(BRm.turnRan(null, agyS('end_turn'))) && verdictOf(BRm.turnRan(undefined, null)),
      '§10 (2) turnRan (PURE): a claude result proves the resume only as a success; an ACP prompt only when it ended neither in \'error\' nor \'cancelled\' (agy can cancel before its agent answered); codex\'s task_complete (no record) does');
    // the WIRING, as the LAWS it holds — by behaviour, never one line's text (another unit rewrites these lines around them:
    // the .412 block's third checkpoint went red on an exact pin of codex's call)
    // (a) server.js's ONE turn-end entry — ITS OWN SOURCE, read out of server.js and run over stand-ins: the delivery steps
    //     first and unchanged (the pool engine gets the session and the record, the ladder the session), the consume LAST with
    //     the record; a consume that throws or rejects is warned by name and skips nothing before it; a ladder that throws
    //     skips the consume no more than before
    const entry = turnEndEntryOf(read('server.js'));
    ok(typeof entry === 'function', '§10 (2) ANCHOR: server.js declares its turn-end entry `noteTurnEnd` once, at the top level (the law below runs its own source)');
    if (typeof entry === 'function') {
      const e1 = entry(), e2 = entry({ consume: () => { throw new Error('consume down'); } }), e3 = entry({ consume: () => Promise.reject(new Error('consume rejected')) }), e4 = entry({ deliverThrows: true });
      await tick(0);
      const kinds = (e) => e.calls.map((c) => c[0]);
      // the delivery steps (whatever their order — test-notify-retry pins that) ran with their arguments as before; the consume is LAST
      const steps = (e) => { const c = e.calls; const en = c.find((x) => x[0] === 'engine'), dl = c.find((x) => x[0] === 'deliver'), co = c[c.length - 1];
        return !!en && en[1] === e.S && en[2] === e.M && !!dl && dl[1] === e.S && !!co && co[0] === 'consume' && co[1] === e.S && co[2] === e.M && c.filter((x) => x[0] === 'consume').length === 1; };
      ok(gateOf(steps(e1)) && !e1.threw && !e1.warns.length, '§10 (2) LAW: the turn-end entry runs the pool engine (session, record) and the delivery ladder (session), and the kept-copy consume LAST with the record', kinds(e1));
      ok(gateOf(steps(e2)) && !e2.threw && gateOf(e2.warns.some((w) => w.includes('[kept] turn-end consume failed: consume down'))) && gateOf(steps(e3)) && !e3.threw && verdictOf(e3.warns.some((w) => w.includes('[kept] turn-end consume failed: consume rejected'))),
        '§10 (2) LAW: a consume that THROWS or REJECTS is warned by name and skips nothing before it — the engine and the ladder ran, nothing escapes the entry', { e2: [kinds(e2), e2.warns], e3: e3.warns });
      ok(gateOf(steps(e4)) && !e4.threw && verdictOf(e4.warns.some((w) => w.includes('deliver down'))), '§10 (2) LAW: a ladder that throws is warned and the consume still runs last (it skips nothing after it either)', [kinds(e4), e4.warns]);
      // RED CONTROL (rule (b)): the same runner over a PLANTED entry that consumes first and guards nothing — the law sees both
      const bad = entryRunner('(s, m) => { consumeKeptOf(s, m); noteTurnEndEngine(s, m); deliver.noteTurnEnd(s); }');
      const b1 = bad(), b2 = bad({ consume: () => { throw new Error('consume down'); } });
      ok(!steps(b1) && !!b2.threw && !b2.calls.some((x) => x[0] === 'engine'), '§10 (2) LAW RED CONTROL: a planted entry that consumes FIRST fails the order, and its unguarded throw skips the engine and escapes', [kinds(b1), kinds(b2), String(b2.threw)]);
    }
    // the consume the entry calls IS boot-restore's: server.js destructures consumeKeptOf from boot-restore's create, at its top level
    const TOP = serverTopOf(read('server.js')) || [], SVsrc = read('server.js');
    const wired = TOP.some((n) => n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.type === 'ObjectPattern' && d.id.properties.some((p) => p.key && p.key.name === 'consumeKeptOf' && p.value && p.value.name === 'consumeKeptOf')
      && d.init && /^require\('\.\/src\/server\/boot-restore\.js'\)\.create\(/.test(SVsrc.slice(d.init.start, d.init.end))));
    ok(verdictOf(wired), '§10 (2) WIRING: server.js takes consumeKeptOf from boot-restore\'s own create (a merge that drops it leaves every turn end a caught ReferenceError — nothing consumed, said only as a warning)');
    // (b) the consumers hand each turn end as their harness ends it — driven, records in, the engine stand-in's view out
    const sinks = () => ({ feedLive() { }, broadcastToSession() { }, broadcastActiveSessions() { }, readSessionMeta: () => null, writeSessionMeta() { }, updateSessionTodos() { } });
    const seenA = [], sA = { backend: 'opencode', backendSessionId: 'ses_a5a4', buffer: '', clients: new Map() };
    let feedA = null;
    require(path.join(REPO, 'src/server/stdout/acp-events.js')).create({ engine: { noteTurnEnd: (s) => seenA.push(s._promptStopReason) } }).attach(sA, 'pA', { onData: (cb) => { feedA = cb; } }, sinks());
    const ACP_ENDS = ['error', 'end_turn', 'cancelled', 'max_tokens', 'refusal'];
    for (const stop of ACP_ENDS) feedA(J({ type: 'acp', kind: 'prompt_end', stopReason: stop, ts: new Date().toISOString() }) + '\n');
    ok(J(seenA) === J(ACP_ENDS) && J(ACP_ENDS.map((x) => BRm.turnRan(null, { _promptStopReason: x }))) === J([false, true, false, true, true]) && verdictOf(BRm.turnRan(null, { _promptStopReason: null })),
      '§10 (2) ACP: each prompt_end is a turn end whose stop is STAMPED on the session before the entry sees it — error and cancelled prove no resume, end_turn / max_tokens / refusal ran (the conversation answered), an end naming none counts as ran', seenA);
    const seenC = [], sC = { backend: 'codex', backendSessionId: 'thr-a5a4', buffer: '', clients: new Map(), mode: 'chat' };
    let feedC = null;
    let endsC = 0;
    require(path.join(REPO, 'src/server/stdout/codex-events.js')).create({ engine: { noteTurnEnd: () => { endsC++; } } }).attach(sC, 'pC', { onData: (cb) => { feedC = cb; } }, sinks());
    for (const t of ['task_started', 'turn_aborted', 'task_failed', 'task_complete']) { feedC(J({ type: 'event_msg', payload: { type: t } }) + '\n'); seenC.push(endsC); }
    ok(J(seenC) === J([0, 0, 0, 1]) && gateOf(BRm.turnRan({ type: 'event_msg', payload: { type: 'task_complete' } }, sC)) && verdictOf(BRm.turnRan(undefined, sC)),
      '§10 (2) codex: only task_complete is a turn end (its record proves the turn ran); an aborted or failed turn calls nothing — the copy stays', seenC);
    const seenL = [], stub = () => { };
    const CL = require(path.join(REPO, 'src/server/stdout/claude-stream-json.js')).create({
      activeSessions: new Map(), CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result']), _seenStreamTypes: new Set(), USAGE_SCANNER_PATH: '/nonexistent', checkClaudeGoalStatus: stub,
      noteModelSeen: stub, sbSeenFirst: () => true, hosts: null, usageHistory: null,
      engine: new Proxy({ _vsuPending: new Map(), armWorkflowUsageWatcher: stub, kickPoolEval: stub, markLimitBanner: stub, maybeRepinLockedModel: stub, maybeStopOnFallback: stub, notePoolAuthFailure: stub, modelsMatch: () => false,
        noteServedModel: stub, noteModelFallback: stub, noteSessionProduced: stub, noteTurnEnd: (s, r) => seenL.push(r), recordRateLimitEvent: stub, resolveUsageKey: () => '__g__', usageEstimator: { noteLive: stub } },
        { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? stub : undefined) }),
    });
    const ptyL = { data: null, onData(cb) { ptyL.data = cb; }, onExit: stub };
    const sL = { mode: 'chat', backend: 'claude', cwd: '/srv/u/two', sockName: 'cw-a5a4-l', buffer: '', createdAt: Date.now(), _normalizer: { processLive: stub, listeners: [] } };
    await quiet(async () => {
      CL.attach(sL, 'pL', ptyL, { feedLive: stub, broadcastActiveSessions: stub, readSessionMeta: () => ({}), writeSessionMeta: stub, updateSessionTodos: stub, applyTaskToolUpdate: stub, emitTaskListTodos: stub, broadcastToSession: stub });
      ptyL.data(J(FAILED) + '\n'); ptyL.data(J(RAN) + '\n');
    });
    ok(seenL.length === 2 && gateOf(seenL[0]) && seenL[0].is_error === true && J(seenL[0].errors) === J(FAILED.errors) && gateOf(seenL[1]) && seenL[1].subtype === 'success' && !BRm.turnRan(seenL[0], sL) && verdictOf(BRm.turnRan(seenL[1], sL)),
      '§10 (2) claude: every result is a turn end that hands its OWN record — a failed resume\'s error result reaches the entry as such (turnRan refuses it), a success proves the resume', seenL.map((r) => r && [r.subtype, r.is_error]));
    ok(verdictOf(read('scripts/test-resume-breaker.mjs').includes("process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: [msg] }) + '\\\\n');")),
      '§10 (2) the failed-resume record above is the stub\'s own (test-resume-breaker: what the CLI answers to a resume it cannot load)');
    // (c) the consume's own failure is SAID (主开发's first should): an unlink refused for a reason other than «already gone» is warned
    //     by name — the copy forgotten here, the file left, the next boot lists it again; a copy already gone is no news
    put(6, { claudeSessionId: CID(6) }); put(7, { claudeSessionId: CID(5) }); put(8, { claudeSessionId: CID(3) });
    const A6 = api(WC);
    // a session on a PAIRED machine ends a turn well: its address names no machine, the copy is this machine's — nothing consumed;
    // the same conversation run HERE consumes it
    const SSH = { backend: 'claude', claudeSessionId: CID(3), host: 'gpu-box-1' }, DIAL = { backend: 'claude', claudeSessionId: CID(3), host: 'h-dial-1', _dialDeviceId: 'dev-1' };
    const gPaired = [await A6.consumeKeptOf(SSH, RAN), await A6.consumeKeptOf(DIAL, RAN)];
    const swept = await api(WC, { active: new Map([['sess-ssh', SSH], ['sess-dial', DIAL]]) }).stoppedSessions();   // the SWEEP road, the same predicate
    const keptPaired = kept(8) && swept.some((x) => x.backendSessionId === CID(3));
    const gHere = await A6.consumeKeptOf({ backend: 'claude', claudeSessionId: CID(3), host: 'local' }, RAN);
    ok(J(gPaired) === J([null, null]) && gateOf(keptPaired) && gHere === 'cw-2-8' && !kept(8) && gateOf(BRm.pairedSession(SSH)) && gateOf(BRm.pairedSession(DIAL)) && !BRm.pairedSession({ host: 'local' }) && !BRm.pairedSession({ backend: 'claude' }),
      '§10 (2) a session on a PAIRED machine (an ssh session\'s host, a dial session\'s host + device) consumes nothing — at a turn end OR in the sweep: the kept copy is this machine\'s socket and the address names no machine; the same conversation run here (host local) consumes it', { gPaired, gHere });
    await A6.stoppedSessions();
    fs.unlinkSync(path.join(WC.META, 'cw-2-7.json.stopped'));   // gone before its consume: ENOENT
    const realUnlink = fs.unlink;
    fs.unlink = (f, cb) => (String(f).endsWith('cw-2-6.json.stopped') ? cb(Object.assign(new Error('resource busy'), { code: 'EBUSY' })) : realUnlink(f, cb));
    let g6 = null, g7 = null;
    let said = [];
    try { said = await quiet(async () => { g6 = await A6.consumeKeptOf({ backend: 'claude', claudeSessionId: CID(6) }, RAN); g7 = await A6.consumeKeptOf({ backend: 'claude', claudeSessionId: CID(5) }, RAN); }); } finally { fs.unlink = realUnlink; }
    const next6 = await nextBoot();
    ok(g6 === 'cw-2-6' && g7 === 'cw-2-7' && gateOf(kept(6)) && gateOf(said.some((l) => l.includes('[kept] cw-2-6: its stopped copy could not be removed (EBUSY) — it stays on disk and the next boot reads it again'))) && !said.some((l) => l.includes('cw-2-7'))
        && verdictOf(next6.some((x) => x.backendSessionId === CID(6))),
      '§10 (2) an unlink the disk refuses (EBUSY) is WARNED by name — the copy forgotten, the file left, the next boot lists it again; a copy already gone (ENOENT) says nothing', { g6, g7, said });
    fs.rmSync(path.join(WC.META, 'cw-2-6.json.stopped'), { force: true });
    // MUTANTS RED — each plant proven first: the guard, spelled once; the consume, spelled once
    const BS2 = read('src/server/boot-restore.js'), GUARD = '  if (!turnRan(rec, session)) return null;\n';
    const TAKE = '  keptStopped.delete(k);\n';
    ok(BS2.split(GUARD).length === 2 && BS2.split(TAKE).length === 2, '§10 (2) ANCHORS: the turn-end guard and the consume, each spelled once (the controls below plant there)');
    if (BS2.split(GUARD).length === 2 && BS2.split(TAKE).length === 2) {
      const MM = mutantCopies('dead-socket-a5a4-2', REPO);
      const mk = (M3, live) => M3.create({ rootDir: WC.d, PORT: 0, BUFFERS_DIR: WC.BUF, META_DIR: WC.META, SOCKETS_DIR: WC.SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
        activeSessions: live, sessionCounterRef: { value: 0 }, attachToDtach: () => {}, setupSessionPty: () => {}, readSessionMeta: () => ({}), writeSessionMeta: () => {}, deleteSessionMeta: () => {},
        broadcastToSession: () => {}, broadcastActiveSessions: () => {}, refreshWebuiPids: () => {}, sbNoteServerOp: () => {}, getHosts: () => null, getDialBridge: () => null, getExitProxy: () => null, note: () => {} });
      put(3, { claudeSessionId: CID(7) });
      const s3 = { backend: 'claude', claudeSessionId: CID(7), backendSessionId: CID(7) };
      const gu = await mk(MM.load('src/server/boot-restore.js', editAnchor(BS2, GUARD, '', "src/server/boot-restore.js"), 'turn-end-unguarded'), new Map()).consumeKeptOf(s3, { ...FAILED, errors: ['No conversation found with session ID: ' + CID(7)] });
      const afterU = await nextBoot();
      ok(gu === 'cw-2-3' && !afterU.some((x) => x.backendSessionId === CID(7)), 'MUTANT RED: a consume without the turnRan guard takes a FAILED resume\'s copy (r1\'s loss again: its name and account gone)', { gu, rows: afterU.map((x) => x.name) });
      put(3, { claudeSessionId: CID(7) });
      const gm = await mk(MM.load('src/server/boot-restore.js', editAnchor(BS2, TAKE, '  return null;\n', "src/server/boot-restore.js"), 'turn-end-takes-nothing'), new Map()).consumeKeptOf(s3, { ...RAN, session_id: CID(7) });
      const afterM = await nextBoot();
      ok(gm === null && verdictOf(afterM.some((x) => x.backendSessionId === CID(7) && x.accountId === 'sub-old-3')), 'MUTANT RED: a boot-restore whose turn end takes nothing leaves the ended resume\'s stale row (and its old account) for the next boot', afterM.map((x) => x.name));
    }
    try { fs.rmSync(WC.d, { recursive: true, force: true }); } catch { }
  }
  // (9) a pending fork's copy an earlier boot kept is swept by the next boot; the parent's stays
  const W = world('fork9');
  const pf = { webuiSessionId: 'sess-9-1', backend: 'claude', mode: 'chat', name: 'Fork never named', cwd: '/srv/u/fork', claudeSessionId: CID(4), forkRequested: true, forkSourceId: CID(4), status: 'stopped', stoppedAt: 1793300000500, stopReason: 'dead-socket-at-boot' };
  const pp = { webuiSessionId: 'sess-9-2', backend: 'claude', mode: 'chat', name: 'Its parent', cwd: '/srv/u/fork', claudeSessionId: CID(4), status: 'stopped', stoppedAt: 1793300000400, stopReason: 'dead-socket-at-boot' };
  fs.writeFileSync(path.join(W.META, 'cw-9-1.json.stopped'), J(pf)); fs.writeFileSync(path.join(W.META, 'cw-9-2.json.stopped'), J(pp));
  const notes = [];
  let rows9 = [];
  await quiet(async () => { rows9 = await api(W, { notes }).stoppedSessions(); await tick(30); });
  ok(!rows9.some((x) => x.name === 'Fork never named') && gateOf(rows9.some((x) => x.name === 'Its parent')) && !fs.existsSync(path.join(W.META, 'cw-9-1.json.stopped')) && gateOf(fs.existsSync(path.join(W.META, 'cw-9-2.json.stopped'))) && gateOf(notes.some((l) => /^kept copies: a pending fork's copy swept \(nothing to resume: cw-9-1\)/.test(l))) && !notes.some((l) => /^dead sockets: /.test(l)),
    '§10 (9) the NEXT boot sweeps a pending fork\'s kept copy (its own id never arrived — nothing resumes it, nothing consumed it), says so; its parent\'s copy stays', { rows: rows9.map((x) => x.name), notes });
  const BSRC = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  const SWEEP = "      if (restoredForkPending(m)) { fs.promises.unlink(path.join(META_DIR, f)).catch((err) => saidUnlinkFailure(sockFile, err)); say(`kept copies: a pending fork's copy swept (nothing to resume: ${sockFile})`); continue; }\n";
  ok(BSRC.split(SWEEP).length === 2, '§10 (9) ANCHOR: the sweep, spelled once');
  try { fs.rmSync(W.d, { recursive: true, force: true }); } catch { }
});

await section('§11 B-a5a4 follow-up (主开发\'s reading of b4e2af305): one precedence, the account named, no door that always refuses, the rescue on the server\'s message', async () => {
  const RS = require(path.join(REPO, 'src/routes/sessions.js'));
  const RSRC = read('src/routes/sessions.js');
  const M = mutantCopies('dead-socket-keeps-chat-meta', REPO);
  // (1) ONE PRECEDENCE FOR ONE QUESTION: the seam answers what the page's merge (mergeKeptStopped) answers for the same rows,
  // over the sweep's rows AS DISCOVERED (r2: a merged row's account may be an older copy's). agy: the row names the account root
  // that lists it (B), the kept copy an older A ⇒ B, as the page says
  const ka = (accountId, o = {}) => ({ backend: 'antigravity', sessionId: UUID(7), backendSessionId: UUID(7), status: 'stopped', stopReason: 'dead-socket-at-boot', accountId, kept: 'cw-7-x', ...o });
  const sweep = [ka('agy-bbbbbbbbbbbb', { kept: undefined, stopReason: undefined })], keptA = [ka('agy-aaaaaaaaaaaa')];
  const pageSays = (rows, k, id) => { const m = RS.mergeKeptStopped(rows.map((r) => ({ ...r })), k).find((r) => r.backendSessionId === id); return m && m.status === 'stopped' ? m.accountId : null; };
  const seamOf = (Mod, rows, k = keptA, backend = 'antigravity', id = UUID(7)) => Mod.heldAccountOfNow(backend, id, { rows, stopped: async () => k });
  const s1 = await seamOf(RS, sweep);
  ok(gateOf(s1) && s1.accountId === 'agy-bbbbbbbbbbbb' && s1.accountId === pageSays(sweep, keptA, UUID(7)) && sweep[0].kept === undefined && sweep[0].stopReason === undefined,
    '§11 (1) ONE PRECEDENCE: the seam bills the account the page\'s merge names (the agy row\'s own root, B) — never the kept copy\'s A; the sweep\'s rows are merged on a COPY (untouched)', { s1, page: pageSays(sweep, keptA, UUID(7)), sweep0: sweep[0] });
  // the readers' claude scene (r2): a claude row carries no account of its own; a sweep merged an older copy (B) into it, the copy
  // kept since names A — over the DISCOVERED row the seam says A, as the page's next merge does; over the merged row B would win
  const kr = (accountId, o = {}) => ({ backend: 'claude', sessionId: CID(7), backendSessionId: CID(7), status: 'stopped', stopReason: 'dead-socket-at-boot', accountId, kept: 'cw-7-x', ...o });
  const discovered = [kr(null, { kept: undefined, stopReason: undefined })], keptNow = [kr('sub-aaaaaaaaaaaa')];
  const mergedOld = RS.mergeKeptStopped(discovered.map((r) => ({ ...r })), [kr('sub-bbbbbbbbbbbb')]);
  const s3 = await seamOf(RS, discovered, keptNow, 'claude', CID(7)), s3m = await seamOf(RS, mergedOld, keptNow, 'claude', CID(7));
  ok(gateOf(s3) && s3.accountId === 'sub-aaaaaaaaaaaa' && s3.accountId === pageSays(discovered, keptNow, CID(7)) && gateOf(s3m) && s3m.accountId === 'sub-bbbbbbbbbbbb',
    '§11 (1) r2: over the DISCOVERED claude row the seam takes the copy kept now (A, the page\'s next merge); over an already merged row the older copy (B) would win — so the sweep hands the seam its rows BEFORE the merge', { s3, s3m });
  // B-891e (the sweep's rows are built in its worker): the order lives in sessions-assemble — the stopped rows kept AS DISCOVERED,
  // then the kept copies merged — and the route hands the held keys' discovered rows to the seam (out.heldDisc)
  const ASM = fs.readFileSync(path.join(REPO, 'src/sessions-assemble.js'), 'utf8'), iD = ASM.indexOf('(discovered.get(k) || discovered.set(k, []).get(k)).push(seamFieldsOf(r))'), iM = ASM.indexOf('try { mergeKeptStopped(sessions, kept); }', Math.max(0, iD));
  ok(iD > 0 && iM > iD && gateOf(RSRC.includes('  const swept = rows === undefined ? _sweptStopped : rows;')) && verdictOf(RSRC.includes('_sweptStopped = Array.isArray(out.heldDisc) ? out.heldDisc : null;')), 'WIRING (§11 (1) r2/r3): the sweep keeps its rows as discovered BEFORE the merge, and the seam reads them by default (the held keys\' ones, handed back by the sweep)');
  // r3: the SWEEP's own order, driven — sweepMerge hands the seam the rows AS DISCOVERED, then merges the copies in
  RS.sweepMerge(discovered.map((r) => ({ ...r })), [kr('sub-bbbbbbbbbbbb')]);
  const s4 = await RS.heldAccountOfNow('claude', CID(7), { stopped: async () => keptNow });
  const SWM = '  _heldRows = rows; _sweptStopped = discovered;';
  ok(RSRC.split(SWM).length === 2, 'ANCHOR: what the sweep hands the seam, spelled once');
  const Mw = M.load('src/routes/sessions.js', editAnchor(RSRC, SWM, '  _heldRows = rows; _sweptStopped = rows;', "src/routes/sessions.js"), 'swept-merged');
  Mw.sweepMerge(discovered.map((r) => ({ ...r })), [kr('sub-bbbbbbbbbbbb')]);
  const s4m = await Mw.heldAccountOfNow('claude', CID(7), { stopped: async () => keptNow });
  ok(gateOf(s4) && s4.accountId === 'sub-aaaaaaaaaaaa' && gateOf(s4m) && s4m.accountId === 'sub-bbbbbbbbbbbb', '§11 (1) r3: THE SWEEP DRIVEN — after a sweep that merged an older copy (B), the seam takes the copy kept now (A); MUTANT RED: the sweep handing its MERGED rows ⇒ B (the delta read\'s scene)', { s4, s4m });
  // r3: a read-back that hangs past its bound ⇒ the sweep's MERGED rows answer, never the discovered row alone
  const s5 = await RS.heldAccountOfNow('claude', CID(7), { stopped: () => new Promise(() => { }), boundMs: 30 });
  ok(gateOf(s5) && s5.accountId === 'sub-bbbbbbbbbbbb', '§11 (1) r3: the kept copies cannot be read in time ⇒ the sweep\'s merged rows (the copy as of the sweep) — never the discovered claude row alone (no account: the default login)', s5);
  RS._noteSweptRows(null);
  const s2 = await seamOf(RS, [ka('agy-bbbbbbbbbbbb', { status: 'live', kept: undefined })]);
  ok(gateOf(s2) && s2.accountId === 'agy-aaaaaaaaaaaa', '§11 (1) …a stale snapshot\'s LIVE row is no fact about now: the kept copy answers (the page shows the conversation live — no Resume there)', s2);
  const MERGE = '  return heldAccountOf(backend, id, mergeKeptStopped(stoppedRows, Array.isArray(kept) ? kept : []));';
  ok(RSRC.split(MERGE).length === 2, 'ANCHOR: the seam\'s merge, spelled once');
  const m1 = await seamOf(M.load('src/routes/sessions.js', editAnchor(RSRC, MERGE, '  return heldAccountOf(backend, id, [...(Array.isArray(kept) ? kept : []), ...(rows || [])]);', "src/routes/sessions.js"), 'kept-first'), sweep);
  ok(gateOf(m1) && m1.accountId === 'agy-aaaaaaaaaaaa', 'MUTANT RED: the kept rows first (the tip\'s) ⇒ the seam bills A while the page names B', m1);
  // (2) the refusal NAMES the account that holds it — its row's name; the machine's own login in the harness's billing word
  const kg = { backend: 'antigravity', sessionId: UUID(8), backendSessionId: UUID(8), status: 'stopped', accountId: 'agy-e0e0e0e0e0e0', kept: 'cw-8-x' };
  const accts = { get: (id) => (id === 'agy-e0e0e0e0e0e0' ? { id, name: 'Kiln notes' } : null) };
  const n1 = await RS.boundElsewhereOf('antigravity', UUID(8), 'agy-ffffffffffff', { rows: [], stopped: async () => [kg], accounts: accts });
  const n2 = await RS.boundElsewhereOf('antigravity', UUID(8), 'agy-ffffffffffff', { rows: [], stopped: async () => [{ ...kg, accountId: 'subscription' }], accounts: accts });
  ok(gateOf(n1) && !n1.words && gateOf(n2) && gateOf(n2.words) && n2.words.join() === 'name' && verdictOf(read('src/ws-create.js').includes('...(wrong.words ? { words: wrong.words } : {})')),
    '§11 cure 2: the machine\'s login is named in its billing WORD and marked `words` (the page says it in the reader\'s language); a person\'s own account name is never translated', { n1: n1 && n1.words, n2: n2 && n2.words });
  const SWp = await import(pathToFileURL(path.join(REPO, 'src/lib/stopped-why.js')).href);
  const ip = SWp.i18nParams({ params: { name: 'Kiln notes', other: 3 }, words: ['missing'] });
  ok(typeof SWp.i18nParams === 'function' && J(ip) === J({ name: 'Kiln notes', other: 3 }) && J(SWp.i18nParams({})) === J({}) && verdictOf(/for \(const k of \(i && Array\.isArray\(i\.words\) \? i\.words : \[\]\)\) if \(typeof p\[k\] === 'string'\) p\[k\] = t\(p\[k\]\);/.test(read('src/lib/stopped-why.js'))),
    '§11 cure 2: i18nParams says only the params named in `words` through t(), the rest as they are');
  ok(gateOf(n1) && n1.params.name === 'Kiln notes' && n1.message === 'this conversation lives in the store of the account «Kiln notes» — it can be resumed only on that account' && gateOf(n2) && n2.params.name === 'Google login' && verdictOf(/\{name\}/.test(RS.BOUND_ELSEWHERE)),
    '§11 (2) the refusal names the account that holds the conversation ({name}: its row\'s name; the machine\'s login in agy\'s billing word)', { n1, n2 });
  const n3 = await RS.boundElsewhereOf('antigravity', UUID(8), 'agy-ffffffffffff', { rows: [], stopped: async () => [{ ...kg, accountId: 'agy-dddddddddddd' }], accounts: accts });
  const n4 = await RS.boundElsewhereOf('antigravity', UUID(8), 'agy-ffffffffffff', { rows: [], stopped: async () => [kg], accounts: { get: () => { throw new Error('the store is busy'); } } });
  ok(gateOf(n4) && n4.code === undefined && n4.refuse === RS.BOUND_ELSEWHERE, 'r3: an accounts store that THROWS says nothing about the holder (never «deleted») — the refusal names it as it can', n4);
  ok(gateOf(n3) && n3.code === 'resume-account-gone' && n3.message === RS.ACCT_GONE_BOUND && !n3.params, '§11 (2) r2: the account that holds it was DELETED ⇒ the deleted-account sentence (resume-account-gone), never «resume it on» an account that is gone', n3);
  // r2: the ONE account a resume goes to — an account-bound harness resumes on the account that HOLDS it, whatever the saved pick says
  const SWm = await import(pathToFileURL(path.join(REPO, 'src/lib/stopped-why.js')).href);
  const hrow = { backend: 'antigravity', backendSessionId: UUID(8), sessionId: UUID(8), status: 'stopped', accountId: 'agy-e0e0e0e0e0e0' };
  ok(SWm.resumeAccountOf('agy-ffffffffffff', [hrow], 'antigravity', UUID(8), { bound: true }) === 'agy-e0e0e0e0e0e0' && SWm.resumeAccountOf('agy-ffffffffffff', [hrow], 'antigravity', UUID(8)) === 'agy-ffffffffffff'
    && SWm.resumeAccountOf('agy-ffffffffffff', [], 'antigravity', UUID(8), { bound: true }) === 'agy-ffffffffffff' && SWm.resumeAccountOf(undefined, [{ ...hrow, accountId: 'subscription' }], 'antigravity', UUID(8), { bound: true }) === 'subscription',
    '§11 (2) r2: bound ⇒ the row\'s account over a stale saved pick (a logged-in stale pick had no bar and no door — refused on every press); no row ⇒ the saved pick; not bound ⇒ as before; the machine\'s own login held ⇒ it', '');
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  ok(gateOf(ZH.includes(`  "${RS.BOUND_ELSEWHERE}": "这个对话在账号「{name}」自己的存储里 — 只能在那个账号上恢复",`)) && verdictOf(JA.includes(`  "${RS.BOUND_ELSEWHERE}": "この会話はアカウント「{name}」自身の保存先にあります — そのアカウントでのみ再開できます",`)),
    '§11 (2) …in zh and ja, the name kept as {name}');
  // (2) the Resume bar's switch offers no account the server refuses: a conversation held by ONE account's own store
  const RA = require(path.join(REPO, 'src/resume-account.js')), RASRC0 = read('src/resume-account.js');
  const sub = (id, name, o = {}) => ({ id, name, backend: 'antigravity', type: 'subscription', loggedIn: true, ...o });
  const roster = [sub('agy-aaaaaaaaaaaa', 'A', { loggedIn: false, loginState: { state: 'logged-out' } }), sub('agy-bbbbbbbbbbbb', 'B'), sub('agy-cccccccccccc', 'C')];
  const sw = (Mod, heldBy, account = 'agy-aaaaaaaaaaaa') => { const v = Mod.resumeAccountVerdict({ pinned: { account, backend: 'antigravity', heldBy }, accounts: roster, loginStates: null, defaults: { machineLogin: { loggedIn: true } } }); const d = (v.doors || []).find((x) => x.kind === 'switch'); return v.ok ? 'ok' : (d ? d.to.map((x) => x.id).join() : '(none)'); };
  const free = sw(RA, undefined), held = sw(RA, 'agy-aaaaaaaaaaaa'), stale = sw(RA, 'agy-bbbbbbbbbbbb');
  // cure 2: the EMPTY switch of a held conversation says why (another account cannot help) — never «add one in Manage agents»
  const vOf = (heldBy) => RA.resumeAccountVerdict({ pinned: { account: 'agy-aaaaaaaaaaaa', backend: 'antigravity', heldBy }, accounts: roster, loginStates: null, defaults: { machineLogin: { loggedIn: true } } });
  const wHeld = RA.resumeAccountWords(vOf('agy-aaaaaaaaaaaa')), wFree = RA.resumeAccountWords({ ...vOf(undefined), doors: [{ kind: 'switch', to: [] }] });
  ok(vOf('agy-aaaaaaaaaaaa').held === true && wHeld.none === 'This conversation lives in this account’s own store — no other account can run it.' && gateOf(/Log in to A again|Open A in Manage agents/.test(wHeld.relogin || ''))
    && wFree.none === 'No other account can run it right now — add one in Manage agents.' && RA.resumeAccountWords(vOf('agy-bbbbbbbbbbbb')).none === null,
    '§11 cure 2: a held conversation whose own account is logged out says another account cannot help (its re-login door stays); a free one keeps «add one in Manage agents»; a stale pick still offers the holder', { wHeld, wFree });
  // cure 3 (主开发's words on d7654c726): no door that always refuses — the words decide whether the switch is DRAWN (PURE)
  const gone = (Mod, heldBy = 'agy-dddddddddddd') => { const v = Mod.resumeAccountVerdict({ pinned: { account: 'agy-dddddddddddd', backend: 'antigravity', heldBy }, accounts: roster, loginStates: null, defaults: { machineLogin: { loggedIn: true } } }); return { v, w: Mod.resumeAccountWords(v) }; };
  const doorsOf = (Mod) => ({ held: Mod.resumeAccountWords(vOf('agy-aaaaaaaaaaaa')).switchDoor, free: Mod.resumeAccountWords({ ...vOf(undefined), doors: [{ kind: 'switch', to: [] }] }).switchDoor, stale: Mod.resumeAccountWords(vOf('agy-bbbbbbbbbbbb')).switchDoor, gone: gone(Mod).w.switchDoor });
  const D3 = doorsOf(RA), G3 = gone(RA), G3free = gone(RA, null);   // null, never undefined: undefined takes the default (held)
  ok(D3.held === false && D3.free === true && D3.stale === true && D3.gone === false && vOf('agy-bbbbbbbbbbbb').held === undefined && vOf('agy-aaaaaaaaaaaa').held === true,
    '§11 cure 3: a HELD conversation with nothing to offer gets NO switch door (held, and held by a deleted account); a free one and a stale pick keep theirs; `held` only when the pinned account IS the holder', { D3, staleHeld: vOf('agy-bbbbbbbbbbbb').held });
  ok(G3free.v.why === 'missing-account' && G3free.v.held === undefined && G3free.w.sentence === 'The account this conversation resumes on was removed, so it can’t resume until you pick another.' && G3free.w.switchDoor === true,
    '§11 cure 3 r2 (the other side): a NOT-held conversation whose account was deleted keeps «…until you pick another» and its switch door', G3free.w);
  ok(G3.v.why === 'missing-account' && G3.v.held === true && G3.w.sentence === 'The account this conversation lived in was removed — the conversation stays in that account’s own store, so no other account can resume it.' && G3.w.none === null && G3.w.relogin === null,
    '§11 cure 3 r2: a held conversation whose account was DELETED says so once — never «until you pick another», no second line, no door', G3.w);
  const BAR = read('src/lib/resume-account-bar.js');
  ok(gateOf(BAR.includes('  if (words.switchDoor) doors.append(swBtn);')) && gateOf(BAR.includes('  bar.append(note, ...(doors.childElementCount ? [doors] : []), pick);')) && BAR.split('doors.append(swBtn)').length === 2,
    'WIRING (cure 3): the bar draws the switch door only when the words say so (one append), and no empty door row');
  const SD = '    switchDoor: !(v.held && empty),\n';
  ok(RASRC0.split(SD).length === 2, 'ANCHOR: the switch door\'s decision, spelled once');
  const MD = doorsOf(M.load('src/resume-account.js', editAnchor(RASRC0, SD, '    switchDoor: true,\n', "src/resume-account.js"), 'door-always'));
  ok(MD.held === true && MD.gone === true, 'MUTANT RED: the switch door always drawn (the release\'s) ⇒ a held conversation gets a door that always refuses', MD);
  ok(gateOf(free.includes('agy-bbbbbbbbbbbb')) && gateOf(free.includes('subscription')) && held === '' && stale === 'agy-bbbbbbbbbbbb',
    '§11 (2) the switch: a harness that is not account-bound offers the others (as before); held by the pinned account ⇒ nothing to switch to (its re-login door stays); a stale on-resume account ⇒ ONLY the account that holds it', { free, held, stale });
  const RASRC = read('src/resume-account.js'), HB = '(heldBy && a.id !== heldBy) || ';
  ok(RASRC.split(HB).length === 2, 'ANCHOR: the switch\'s held-by filter, spelled once');
  const mh = sw(M.load('src/resume-account.js', editAnchor(RASRC, HB, '', "src/resume-account.js"), 'switch-any'), 'agy-aaaaaaaaaaaa');
  ok(verdictOf(mh.includes('agy-bbbbbbbbbbbb')), 'MUTANT RED: no held-by filter ⇒ the switch offers B to a conversation A holds (a door the server always refuses)', mh);
  // the page passes heldBy for an account-bound harness alone — the caps row the page reads IS the descriptor's fact
  const CAPS = require(path.join(REPO, 'src/backend-caps.js'));
  ok(gateOf(HARN.list().every((h) => !!(h.store && h.store.accountBound === true) === (CAPS.capsOf(h.id).accountBound === true))) && CAPS.capsOf('antigravity').accountBound === true,   // !!: a harness with no store (shell) is «not bound»
    '§11 (2) backend-caps accountBound (the page\'s) agrees with every descriptor\'s store.accountBound (the server\'s) — one fact, two tiers');
  const LSRC = read('src/lib/session-lifecycle.js');
  ok(gateOf(/heldBy: accountBound\(backend\) && !hostId \? keptAccountOf\(this\.sidebar\?\._allSessions, backend, backendSessionId\) : undefined \}/.test(LSRC))
    && (LSRC.match(/\{ bound: accountBound\(backend\) && !hostId \}\)/g) || []).length === 2
    && verdictOf(/\(msg\.i18n && msg\.i18n\.key \? t\(msg\.i18n\.key, i18nParams\(msg\.i18n\)\) : ''\) \|\| \(msg\.message \? t\(msg\.message\) : ''\)/.test(LSRC)),
    'WIRING (§11 (2)): the Resume verdict and the create both resume an account-bound harness on the held account (a host\'s resume aside); a sentence with a name is said from its key + params');
  ok(gateOf(read('src/server/inbox-reopen.js').includes("return { ok: false, why, ...(err && err.i18n && err.i18n.key ? { i18n: err.i18n } : {}) };"))
    && gateOf(read('src/routes/user-todos-reply.js').includes("fail(res, 'resume_failed', (o && o.why) || 'the conversation could not be reopened', o && o.i18n ? { i18n: o.i18n } : null)"))
    && verdictOf(read('src/lib/user-todos-actions.js').includes("const why = r && r.code === 'bad_image' && r.picture ? pictureRefusalText([r.picture], t) : r && r.words && r.words.key ? t(r.words.key, r.words.params || {}) : r && r.i18n && r.i18n.key ? t(r.i18n.key, i18nParams(r.i18n)) : r && r.error ? t(r.error) : t('server unreachable');")),   // (bl-chat-b restack-411: the line also words a refused picture by its harness's numbers and a reopen's words first; the i18n road unchanged)
    'WIRING (§11 (2) r2): a For-you reply\'s refusal keeps its key + params from the create to the page (a zh / ja page says it in the reader\'s words)');
  ok(gateOf(read('src/server/inbox-reopen.js').includes("try { held = await require('../routes/sessions').heldAccountOfNow(conv.backend, conv.id); } catch { held = null; }"))
    && verdictOf(read('src/server/inbox-reopen.js').includes('if (held && held.accountId) spec.data.accountId = held.accountId;')),
    'WIRING (§11 (2) r3): the For-you reopen of an account-bound conversation goes to the account that holds it, over a stale saved pick (as the page does)');
  // (3) the rescue tests the SERVER's message — a zh/ja row for an «Account error: …» sentence never silences the bar
  ok(gateOf(/if \(\/\^Account error: \/\.test\(String\(msg\.message \|\| ''\)\) && this\.resumeAccountCheck\) \{/.test(LSRC)) && !/\/\^Account error: \/\.test\(text\)/.test(LSRC),
    '§11 (3) the failed-resume rescue\'s account re-check reads msg.message, never its translation');
  // the seam's wiring: setup hands stoppedSessions to the seam — a create before the first sweep reads the copies with no opts
  let wired = null;
  try {
    RS.setup({ activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => { }, createSessionMessages: () => [], BUFFERS_DIR: '/nonexistent', PERMISSION_MODES: [], hosts: null, serverSetting: () => null, stoppedSessions: async () => [kg] });
    RS._noteSweptRows(null);
    wired = await RS.heldAccountOfNow('antigravity', UUID(8));
  } catch (e) { wired = { threw: String(e && e.message) }; }
  ok(J(wired) === J({ accountId: 'agy-e0e0e0e0e0e0' }), '§11 WIRING: setup({ stoppedSessions }) is what the seam reads with no opts (the line dropped ⇒ null)', wired);
});

for (const p of [W2 && W2.d]) if (p) try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
