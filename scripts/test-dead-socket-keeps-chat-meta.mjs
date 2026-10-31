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
// RED on 43d0f8d2d (2.369.364) and on d5b99bade (the 2.369.365 cut): every section by name (no hook, no reason, no
// read-back, no facts line, no agy discover, no words).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { scratchDir, scratchHome } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const J = JSON.stringify;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : '')); } return !!c; };
const section = async (title, fn) => { console.log('— ' + title); try { await fn(); } catch (e) { ok(false, title + ' — threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); } };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
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
  ok(chat.length >= 4 && chat.every((h) => typeof h.store?.resumeIdOf === 'function'), `§1 every chat harness declares store.resumeIdOf (${chat.map((h) => h.id).join(', ')})`, chat.map((h) => [h.id, typeof h.store?.resumeIdOf]));
  ok(noStore.length >= 1 && noStore.every((h) => h.kind !== 'chat'), `§1 a harness with NO store has nothing to resume — proven by its row (${noStore.map((h) => h.id).join(', ')}: store null, terminal only)`);
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
  ok(k && k.status === 'stopped' && k.stopReason === 'dead-socket-at-boot' && typeof k.stoppedAt === 'number' && !fs.existsSync(path.join(W.META, socks.labChat + '.json')),
    '§2 THE INCIDENT\'S SHAPE: a local antigravity chat whose socket died is kept STOPPED — status, stoppedAt, stopReason «dead-socket-at-boot» (2.369.364: deleted; .365: kept, no status / reason)', k);
  ok(k && k.name === AGY_META.name && k.cwd === AGY_META.cwd && k.accountId === AGY_META.accountId && k.backendSessionId === UUID(1) && J(k.taskIds) === J(['T-9']) && k.effort === 'high' && k.mode === 'chat',
    '§2 …with its name, folder, ACCOUNT, conversation, groups and effort — kept for the resume (no harness locate deletes it: agy\'s store names no file)', k);
  const c = W.json(socks.ledgerChat + '.json.stopped');
  ok(c && c.status === 'stopped' && c.stopReason === 'dead-socket-at-boot' && c.claudeSessionId === CID(1), '§2 a claude chat whose transcript exists: kept the same way', c);
  ok(W.json(socks.acpChat + '.json.stopped')?.stopReason === 'dead-socket-at-boot', '§2 an ACP agent\'s session (opencode) too — its store has no file to locate, and «cannot tell» never deletes (2.369.365\'s settle read locate\'s null as «no transcript» and deleted this one and the agy one seconds after the boot kept them)');
  ok(!W.json(socks.goneThread + '.json.stopped') && !W.json(socks.goneThread + '.json'), '§2 a codex thread whose rollout is gone: kept first, deleted once its harness answered «no transcript» (off the loop — .365\'s settle, asked with the hook\'s id)');
  ok([socks.plainTerm, socks.noIdChat].every((s) => !W.json(s + '.json') && !W.json(s + '.json.stopped')), '§2 a shell and a session that never learned its id — NOTHING to resume — are deleted as before');
  ok(W.json(socks.remoteChat + '.json.orphan') && !W.json(socks.remoteChat + '.json.stopped'), '§2 a remote session is still an orphan for the re-adopt (B-1525, unchanged)');
  const fact = notes.find((l) => /^dead sockets: /.test(l)) || '';
  const keptNamed = (fact.match(/kept: ([^)]*)\)/) || [])[1] || '', delNamed = (fact.match(/nothing to resume: ([^)]*)\)/) || [])[1] || '';
  ok(/^dead sockets: 3 stopped \(kept: cw-[^)]*\), 3 deleted \(nothing to resume: cw-[^)]*\)$/.test(fact) && J(keptNamed.split(', ').sort()) === J([socks.labChat, socks.ledgerChat, socks.acpChat].sort()) && [socks.plainTerm, socks.noIdChat, socks.goneThread].every((s) => delNamed.includes(s)),
    `§2 THE FACTS LINE (the boot trace's notes, ⚙ Diagnostics), said once the kept copies were looked for — the codex thread its harness answered «no transcript» for is said DELETED, never kept (r2): «${fact}»`, notes);
  ok(lines.some((l) => l.includes(`↳ local session meta kept as stopped (antigravity ${UUID(1).slice(0, 8)}…`)), '§2 the journal says which meta was kept');
});

await section('§3 THE READ-BACK — the kept metas are /api/sessions rows, and the NEXT boot reads them back', async () => {
  const W = W2;
  const rows = await W.api.stoppedSessions();
  const r = rows.find((x) => x.backendSessionId === UUID(1));
  ok(r && r.backend === 'antigravity' && r.sessionId === UUID(1) && r.status === 'stopped' && r.stopReason === 'dead-socket-at-boot' && r.name === AGY_META.name && r.cwd === AGY_META.cwd && r.mode === 'chat' && r.accountId === AGY_META.accountId && typeof r.stoppedAt === 'number' && r.kept === socks.labChat,
    '§3 the incident\'s session is a STOPPED row with why, when, its name, folder, mode and account (the sidebar\'s card, the window\'s history, the resume-all offer read it)', r);
  ok(rows.length === 3 && rows.some((x) => x.backendSessionId === CID(1) && x.backend === 'claude') && rows.some((x) => x.backendSessionId === 'ses_7'), '§3 …and the claude and ACP ones; the codex one its harness deleted is not listed', rows.map((x) => x.backend + ':' + x.backendSessionId));
  const B = api(W);
  const rows2 = await B.stoppedSessions();
  ok(rows2.length === 3 && J(rows2.map((x) => x.backendSessionId).sort()) === J(rows.map((x) => x.backendSessionId).sort()) && rows2.find((x) => x.backendSessionId === UUID(1))?.accountId === AGY_META.accountId,
    '§3 THE NEXT BOOT reads them back from disk (a fresh boot-restore over the same data dir, no socket at all)', rows2);
  const old = 'cw-7-1793000000007';
  fs.writeFileSync(path.join(W.META, old + '.json.stopped'), J({ backend: 'claude', claudeSessionId: CID(7), name: 'Kept by .365', cwd: '/srv/u/old', mode: 'chat', stoppedAt: 1793000000000 }));
  const rows3 = await api(W).stoppedSessions();
  const o = rows3.find((x) => x.backendSessionId === CID(7));
  ok(o && o.status === 'stopped' && o.stopReason === 'dead-socket-at-boot' && o.name === 'Kept by .365', '§3 a copy 2.369.365 kept (stoppedAt, no status, no reason) reads back the same — its only producer was a dead socket', o);
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
    ok(pend.has(sock) && active.size === 1, '§4 the boot had no answer for it: adopted ALIVE, probe-pending (B-92a4 — a non-answer is never a kill)', [...pend.keys()]);
    fs.writeFileSync(flag, '');
    await withPath(W, () => quiet(async () => { await A.reprobePending(); await A.stoppedSettled(); }));
    const k = W.json(sock + '.json.stopped');
    ok(k && k.status === 'stopped' && k.stopReason === 'dead-socket-at-boot' && k.name === 'Asked later' && k.accountId === AGY_META.accountId && active.size === 0,
      '§4 the re-probe settles it dead: retireDeadSocket\'s ONE road — kept STOPPED with its materials, the adopted session gone', k);
    ok(notes.some((l) => l === `dead sockets (re-probe 1): 1 stopped (kept: ${sock}), 0 deleted`), '§4 the re-probe\'s facts line says what it kept', notes.filter((l) => /dead sockets/.test(l)));
    ok((await A.stoppedSessions()).some((x) => x.backendSessionId === UUID(4)), '§4 …and it is read back as a stopped row');
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
  ok(o && o.status === 'stopped' && o.stopReason === 'dead-socket-at-boot' && o.sessionKey === 'opencode:ses_1' && rows.length === 3, '§5 a conversation no harness lists (an ACP agent\'s) is listed from the meta alone, keyed', o);
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
  ok(r1 && r1.backend === 'antigravity' && r1.sessionId === UUID(1) && r1.status === 'stopped' && r1.name === 'Kiln glaze study' && r1.startedAt === Date.parse('2026-10-30T08:58:46.926Z') && r1.cwd === '/srv/u/kiln study' && r1.accountId === 'agy-e0e0e0e0e0e0',
    '§6 THE RECOVERY DOOR: the owner\'s kind of conversation is a STOPPED row named by its title, dated by its last write, in its folder, under its ACCOUNT (the sidebar\'s Resume goes there)', r1);
  ok(!rows.some((r) => r.backendSessionId === UUID(2)), '§6 a sub-agent\'s row (nesting_depth 1) is no conversation of its own');
  const r3 = rows.find((r) => r.backendSessionId === UUID(3));
  ok(r3 && r3.status === 'live' && r3.webuiId === 'sess-live-3' && r3.webuiName === 'Running', '§6 a conversation a session runs is LIVE, with its webui id (as codex\'s rows)', r3);
  const r5 = rows.find((r) => r.backendSessionId === UUID(5));
  ok(r5 && r5.accountId === 'subscription' && r5.name === 'On the machine login', '§6 the machine\'s own login root is listed too — its account named the create\'s way («subscription» = the CLI\'s own login), so a resume goes to THAT store, never the default (r2)', r5);
  ok(rows[0].backendSessionId === UUID(1) && runs === 1, `§6 newest first; ONE child for every root whose index was not read yet (${runs})`);
  ok(!/preview/i.test(AS.SUMMARY_SQL) && !J(rows).includes('PREVIEW-NEVER-READ'), '§6 the index is asked for a list row only — never a preview, never a transcript');
  await D.discover({ activeSessions: active, harnessId: 'antigravity', dataDir: dd, now: t0 + 1000, runChild });
  await D.discover({ activeSessions: active, harnessId: 'antigravity', dataDir: dd, now: t0 + D.CHECK_MS + 1, runChild });
  ok(runs === 1, `§6 within CHECK_MS nothing is looked at; past it, an UNCHANGED index is not read again (children: ${runs})`);
  await tick(20);
  mkIndex(acct, [{ id: UUID(6), title: 'Brand new', at: '2026-10-31 01:00:00.000000000+00:00', cwd: '/srv/u/n' }]);
  const rows2 = await D.discover({ activeSessions: active, harnessId: 'antigravity', dataDir: dd, now: t0 + 2 * D.CHECK_MS + 2, runChild });
  ok(runs === 2 && rows2.some((r) => r.backendSessionId === UUID(6) && r.name === 'Brand new'), `§6 an index that CHANGED is read again — one child (${runs})`);
  ok(typeof HARN.get('antigravity').store.discover === 'function', '§6 the descriptor\'s store.discover is wired (routes/sessions iterates it like claude\'s and codex\'s)');
  const src = read('src/agy-discover.js').replace(/\/\/.*$/gm, '');
  ok(!/node:sqlite|DatabaseSync/.test(src) && /agy-summaries\.js/.test(src), '§6 the hub never opens the db — data/bin/agy-summaries.js does, as a child (test-architecture §73)');
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
  const keys = [SENT, 'Resume interrupted sessions?', '<b>{n}</b> sessions were interrupted (the server or a machine restarted) and reopened as read-only history. Resume all of them now?', '{n} of them stopped because their process ended while the server was down.', 'Resume all {n}'];
  ok(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':')), '§7 every new word has its zh and ja entry', keys.filter((k) => !zh.includes(J(k) + ':') || !ja.includes(J(k) + ':')));
  const card = read('src/lib/session-card.js'), cv = read('src/lib/chat-view.js'), lay = read('src/lib/layout.js'), lc = read('src/lib/session-lifecycle.js');
  const body = (src, head) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); };
  ok(/\$\{stoppedWhyOf\(s\) \? `<div class="session-card-sub session-card-why"/.test(card), '§7 WIRING: the sidebar\'s card prints the sentence under a stopped row');
  ok(/stoppedWhyFor\(spec\.backend, spec\.backendSessionId, this\.app\?\.sidebar\?\._allSessions\)/.test(body(cv, '  _showResumeBar() {')), '§7 WIRING: the read-only window\'s resume bar says it before «Session is read-only.»');
  ok(/stoppedWhyFor\(/.test(body(lay, '  _paintPlaceholder(win) {')) && /t\('\{n\} of them stopped because their process ended while the server was down\.'/.test(body(lay, '  async _offerResumeAll(stopped) {')) && /noteStoppedRows\(allSessions\)/.test(lay),
    '§7 WIRING: the window\'s stopped tile and the resume-all offer say it (the boot\'s list noted first)');
  ok(/accountId: accountId !== undefined \? accountId : resumeAccountOf\(savedCfg\.account, this\.sidebar\?\._allSessions, backend, targetBackendId\)/.test(body(lc, '  resumeSession(')),
    '§7 WIRING: resumeSession — ONE place for every door (the card, its click, the resume bar, the tile, resume-all) — falls back to the row\'s account, never the harness default');
  ok(/pinned: \{ account: resumeAccountOf\(saved\.account, this\.sidebar\?\._allSessions, backend, backendSessionId\) \|\| ''/.test(body(lc, '  _resumeAccountVerdict(')),
    '§7 WIRING (r2, minor 1): the Resume press\'s verdict — and the create-failure re-check, which asks the same verdict — judges THAT account, not the default');
  const RA = require(path.join(REPO, 'src/resume-account.js'));
  const kRow = { backend: 'claude', backendSessionId: CID(3), sessionId: CID(3), status: 'stopped', stopReason: 'dead-socket-at-boot', accountId: 'sub-aaaaaaaaaaaa' };
  const accts = [{ id: 'sub-aaaaaaaaaaaa', name: 'Kept one', type: 'subscription', backend: 'claude', loggedIn: false, loginState: { state: 'wiped' } }, { id: 'sub-bbbbbbbbbbbb', name: 'Default one', type: 'subscription', backend: 'claude', loggedIn: true }];
  const v = RA.resumeAccountVerdict({ pinned: { account: RAO(undefined, [kRow], 'claude', CID(3)) || '', backend: 'claude' }, accounts: accts, defaults: { defaultAccountId: 'sub-bbbbbbbbbbbb' } });
  ok(v && v.ok === false && v.account && v.account.id === 'sub-aaaaaaaaaaaa' && (v.doors || []).some((d) => d.kind === 'relogin' && d.accountId === 'sub-aaaaaaaaaaaa'),
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
  const notes = [];
  const A = api(W, { notes });
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
  const rowsP = await api(W, { active: pendingLive }).stoppedSessions();
  await tick(50);
  ok(rowsP.some((x) => x.backendSessionId === CID(2) && x.name === 'Parent') && fs.existsSync(path.join(W.META, parent + '.json.stopped')),
    '§8 a LIVE pending fork does not consume its stopped parent\'s copy (addressableId: a borrowed id is nobody\'s address)', rowsP.map((x) => x.name));
  const owner = new Map([['sess-p', { backend: 'claude', claudeSessionId: CID(2), name: 'Parent' }]]);
  const rowsO = await api(W, { active: owner }).stoppedSessions();
  await tick(50);
  ok(!rowsO.some((x) => x.name === 'Parent') && !fs.existsSync(path.join(W.META, parent + '.json.stopped')) && fs.existsSync(path.join(W.META, fork + '.json.stopped')),
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
  ok(/no transcript of this conversation was found on this machine/.test((RS.heldAccountOf('antigravity', UUID(1), rowsOf(kept(null))) || {}).refuse || ''), '§9 …an agy row naming none ⇒ REFUSED by name (store.accountBound — the default\'s store does not hold it)');
  ok(RS.heldAccountOf('claude', CID(1), rowsOf(kept(null, 'claude', CID(1)))) === null && RS.heldAccountOf('antigravity', UUID(1), [{ ...kept('agy-e0e0e0e0e0e0'), status: 'live' }]) === null && RS.heldAccountOf('antigravity', UUID(1), []) === null,
    '§9 …a claude row naming none, a live row, no row ⇒ nothing said (the default, as before)');
  ok(HARN.get('antigravity').store.accountBound === true && HARN.list().filter((h) => h.store && h.store.accountBound).map((h) => h.id).join() === 'antigravity',
    '§9 store.accountBound is a descriptor fact (antigravity only), never a backend branch');
  // the REAL create (src/ws-create.js) behind the REAL For-you reopen (src/server/inbox-reopen.js): the account it resolves
  const d = scratchDir('dsk-held');
  const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
  const registry = createAdapterRegistry({ chatWrapper: '/nonexistent/c.js', codexChatWrapper: '/nonexistent/x.js', acpWrapper: '/nonexistent/a.js', acpCommands: { antigravity: '/nonexistent/agy' }, ptyWrapper: '/nonexistent/p.js', buffersDir: d });
  const asked = [], noop = () => undefined;
  const accounts = new Proxy({ resolveForSpawn: (id, b) => { asked.push([id, b]); throw new Error('probe-stop'); } }, { get: (t, k) => (k in t ? t[k] : noop) });
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
  ok(r && r.ok === false && r.why === 'no transcript of this conversation was found on this machine — it cannot be reopened here' && asked.length === 0,
    '§9 …a kept agy row naming no account is refused with the OLD words — and nothing is spawned', { r, asked });
  asked.length = 0;
  const sent = [];
  RS._noteSweptRows(rowsOf(withCwd(kept('agy-e0e0e0e0e0e0'))));
  await quiet(async () => { await handleCreate({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', backend: 'antigravity', mode: 'chat', cwd: d, resume: true, resumeId: UUID(1), reqId: 'r-auto' }, new Set()); });
  ok(J(asked) === J([['agy-e0e0e0e0e0e0', 'antigravity']]), '§9 …and every other door that states none (an automation\'s open, a page\'s plain create) — the ONE seam is the create itself', asked);
  asked.length = 0;
  await quiet(async () => { await handleCreate({ readyState: 1, send: () => { } }, { type: 'create', backend: 'antigravity', mode: 'chat', cwd: d, resume: true, resumeId: UUID(1), accountId: 'agy-ffffffffffff', reqId: 'r-pick' }, new Set()); });
  ok(J(asked) === J([['agy-ffffffffffff', 'antigravity']]), '§9 an account the door STATES is never overridden (the resume bar\'s switch, the billing switcher)', asked);
  RS._noteSweptRows(null);
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { }
});

for (const p of [W2 && W2.d]) if (p) try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
