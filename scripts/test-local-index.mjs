#!/usr/bin/env node
// THE PERSON'S SESSION INDEX + ITS JUDGE (fast, in-process — lane human-cli, 2026-10-28; the 89-minute hub freeze of
// 2026-10-27: data/ on a stalled NFS, the hub's loop held, every agent CLI dead, the dtach sessions alive and unreachable).
// PURE src/local-index.js (the place, the rows, the doc, the kernel judge, the table, the pick, the dtach packet, the
// chat frames, the record lines) + the ONE writer src/server/local-index.js over a scratch home + the CLI as a module.
//   ① the place ladder never picks a network/FUSE mount — judged where a folder LANDS (a symlink followed, a mount never
//     touched), a squatted rung refused by name, a throwaway hub's own root; its mount reading = fd-budget's, its fs types
//     = mount-path-class's
//   ② a row is CLOSED: no token, no env, no account — whatever the session object holds
//   ③ the doc round-trips; a foreign file is refused by name
//   ④ the process verdict over fake /proc stat text (birth, recycle, zombie, another boot)
//   ⑤ the row judge — every socket fact × the CLI process
//   ⑥ the hub judge — up / frozen / starting / stopped / down
//   ⑦ THE STALE INDEX: the hub died; each row judged by the kernel, never by the hub's word
//   ⑧ the table (numbers, widths, CJK, ~, THE ESC BELT), ⑨ the pick (a number only at a terminal; one list over every hub),
//   ⑩ the dtach packet, ⑪ the chat frames = the adapters' own ENTER frame (filled templates), ⑫ the records → lines + the
//   wrapper's receipts + THE UNION of a conversation's two reads (round 8), ⑬ the hub's unit (its own main process only), ⑭ the writer (one file per hub root, off the loop,
//   coalesced, 0600, a sweep, stop, a throwaway's own root, a symlinked / squatted rung), ⑮ the CLI (the refusal FIRST,
//   never a second reader; the union's keys), ⑯ RED controls: seven patched copies of the PURE module, each caught
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LI_PATH = path.join(REPO, 'src/local-index.js');
let LI = {};
try { LI = require(LI_PATH); } catch (e) { console.log(`  ✗ src/local-index.js loads — ${e.message.split('\n')[0]}`); }
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ' — ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : ''}`); } };
const fn = (f) => typeof f === 'function';
const call = (f, ...a) => { try { return fn(f) ? f(...a) : undefined; } catch (e) { return { threw: e.message }; } };
const deq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortKeys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])])) : Array.isArray(o) ? o.map(sortKeys) : o);

const MI = (rows) => rows.map(([mp, fst], i) => `${20 + i} 1 0:${i} / ${mp} rw,relatime shared:1 - ${fst} src${i} rw`).join('\n');
const LOCAL_MI = MI([['/', 'ext4'], ['/tmp', 'tmpfs'], ['/run/user/1000', 'tmpfs'], ['/home/u/workspace', 'fuse.bindfs'], ['/mnt/nfs', 'nfs4']]);

console.log('① the place — where the folder LANDS, never a mount, never a folder someone else made');
let p = call(LI.indexPlaceOf, { home: '/home/u', uid: 1000, mountinfo: LOCAL_MI, xdgRuntimeDir: '/run/user/1000' });
ok('a home on the machine\'s own disk: <home>/.vibespace/local (the CLI beside it in bin/), said why', p && p.dir === '/home/u/.vibespace/local' && p.via === 'home' && p.bin === '/home/u/.vibespace/local/bin' && /own disk \(ext4\)/.test(p.why), p);
p = call(LI.indexPlaceOf, { home: '/home/u/workspace/me', uid: 1000, mountinfo: LOCAL_MI, xdgRuntimeDir: '/run/user/1000' });
ok('a home on a FUSE mount: /var/tmp/vibespace-<uid> (the mount named in the why)', p && p.dir === '/var/tmp/vibespace-1000' && p.via === 'var-tmp' && /fuse\.bindfs/.test(p.why), p);
p = call(LI.indexPlaceOf, { home: '/mnt/nfs/me', uid: 1000, mountinfo: MI([['/', 'ext4'], ['/mnt/nfs', 'nfs'], ['/var/tmp', 'nfs4'], ['/run/user/1000', 'tmpfs']]), xdgRuntimeDir: '/run/user/1000' });
ok('home AND /var/tmp on NFS: the runtime dir (RAM)', p && p.via === 'runtime-dir' && p.dir === '/run/user/1000/vibespace', p);
p = call(LI.indexPlaceOf, { home: '/mnt/nfs/me', uid: 1000, mountinfo: MI([['/', 'nfs4']]), xdgRuntimeDir: '' });
ok('nothing local: no place, said by name (no_local_disk) — never a mount', p && p.dir === null && p.code === 'no_local_disk' && /nfs4/.test(p.why), p);
p = call(LI.indexPlaceOf, { home: '/Users/u', uid: 501, mountinfo: '' });
ok('no mount table (macOS): the home rung', p && p.via === 'home' && p.dir === '/Users/u/.vibespace/local', p);
p = call(LI.indexPlaceOf, { own: { root: '/tmp/vs-x/wt' }, home: '/home/u', uid: 1000, mountinfo: LOCAL_MI });
ok('a THROWAWAY hub\'s ONE rung is its own root (<root>/data/local-index): never the HOME, no bin/ (it installs nothing)', p && p.via === 'own-root' && p.dir === '/tmp/vs-x/wt/data/local-index' && p.bin === null, p);
ok('one file per hub root: sessions.<12 hex>.json, named by the writer, listed by the reader', fn(LI.indexFileOf) && LI.indexFileOf('0123456789abcdef') === 'sessions.0123456789ab.json' && LI.INDEX_FILE_RE.test('sessions.0123456789ab.json') && !LI.INDEX_FILE_RE.test('sessions.json') && !LI.INDEX_FILE_RE.test('sessions.0123456789ab.json.123.tmp'));
// G1 (acceptance r1): `~/.vibespace` a SYMLINK onto a FUSE mount read as «own disk» — one flush held the hub's loop 4.6 s
const FS = { '/home': 'dir', '/home/u': 'dir', '/home/u/.vibespace': '/home/u/workspace/dotvs', '/home/u/link2': '../u/real', '/home/u/real': 'dir', '/a': '/b', '/b': '/a' };
const touched = [];
const lst = (q) => { touched.push(q); const v = FS[q]; if (v === undefined) return null; return { symlink: v !== 'dir' }; };
const rdl = (q) => FS[q];
p = call(LI.indexPlaceOf, { home: '/home/u', uid: 1000, mountinfo: LOCAL_MI, xdgRuntimeDir: '/run/user/1000', lstat: lst, readlink: rdl });
ok('G1: a home whose .vibespace is a SYMLINK onto the FUSE workspace is NOT the machine\'s own disk — judged where it LANDS (the next rung, said why)', p && p.via === 'var-tmp' && /lands on a fuse\.bindfs mount/.test(p.why), p);
ok('…and the walk never TOUCHED a path on the mount (the mount table is asked before every lstat / readlink)', touched.length > 0 && !touched.some((q) => q.startsWith('/home/u/workspace')), touched);
ok('landedPathOf follows a local relative symlink, ends at a missing component, and names a loop', deq(call(LI.landedPathOf, '/home/u/link2/x/y', { lstat: lst, readlink: rdl, mountinfo: LOCAL_MI }), { path: '/home/u/real/x/y' }) && deq(call(LI.landedPathOf, '/a/z', { lstat: lst, readlink: rdl, mountinfo: '' }), { loop: true }));
// G2 (acceptance r1): another local user can plant /var/tmp/vibespace-<uid> (a symlink to their 0777 folder)
const F = (o) => () => ({ exists: true, symlink: false, dir: true, uid: 1000, mode: 0o700, ...o });
const RL = (f) => (call(LI.rungFolderOf, f, { uid: 1000, dir: '/var/tmp/vibespace-1000' }) || {});
ok('G2 THE RUNG LAW: a pre-made symlink, another uid\'s folder, a folder open to others — each REFUSED by name; a missing one or our own 0700 one is fine',
  RL({ exists: true, symlink: true }).ok === false && /symlink/.test(RL({ exists: true, symlink: true }).why) && RL(F({ uid: 1001 })()).ok === false && /uid 1001/.test(RL(F({ uid: 1001 })()).why)
  && RL(F({ mode: 0o777 })()).ok === false && /open to others/.test(RL(F({ mode: 0o777 })()).why) && RL({ exists: false }).ok === true && RL(F({})()).ok === true);
p = call(LI.indexPlaceOf, { home: '/home/u/workspace/me', uid: 1000, mountinfo: LOCAL_MI, xdgRuntimeDir: '/run/user/1000', facts: (d) => (d === '/var/tmp/vibespace-1000' ? { exists: true, symlink: true } : { exists: false }) });
ok('…a squatted var-tmp rung is skipped to the runtime dir, the refusal kept in `tried`', p && p.via === 'runtime-dir' && p.tried.some((t) => t.via === 'var-tmp' && /refused/.test(t.why)), p);
const FD = require(path.join(REPO, 'src/fd-budget.js')), MPC = require(path.join(REPO, 'src/mount-path-class.js'));
const probes = ['/', '/home/u', '/home/u/workspace', '/home/u/workspace/x/y', '/home/u/workspacex', '/tmp/a', '/mnt/nfs', '/run/user/1000/vibespace', 'rel', ''];
ok('PARITY: mountOf reads a mount table exactly as src/fd-budget.js mountOf', fn(LI.mountOf) && probes.every((q) => deq(LI.mountOf(q, LOCAL_MI), FD.mountOf(q, LOCAL_MI))));
ok('PARITY: the network/FUSE file-system types = src/mount-path-class.js NET_FSTYPE (one list)', LI.NET_FSTYPE && LI.NET_FSTYPE.source === MPC.NET_FSTYPE.source, LI.NET_FSTYPE && LI.NET_FSTYPE.source);

console.log('② a row is closed');
const SECRET = ['vsst_', 'a1b2c3d4e5f6a1b2c3d4e5f6'].join('');
const sess = { mode: 'chat', backend: 'claude', name: 'lane x', cwd: '/w/x', socketPath: '/d/sockets/cw-1-2', createdAt: 1000, claudeSessionId: 'c0ffee00-0000-4000-8000-000000000001',
  agentToken: SECRET, env: { ANTHROPIC_API_KEY: SECRET }, _accountId: 'acct-' + SECRET, _oatRoad: 'env', secret: { value: SECRET }, clients: new Map([[1, {}], [2, {}]]),
  _childPid: 4242, _childIdentity: { pid: 4242, starttime: 777, bootId: 'b-1' }, _vaultWait: false, _purpose: null };
const row = call(LI.rowOf, 'sess-1-2', sess, { buffersDir: '/d/session-buffers', transcript: '/h/.claude/projects/-w-x/c0ffee.jsonl', turn: 'running', attachedAt: 5000, conversationId: sess.claudeSessionId });
ok('the row has EXACTLY the closed keys (ROW_KEYS)', row && deq(Object.keys(row), [...(LI.ROW_KEYS || [])]), row && Object.keys(row));
ok('no token, no env, no account in the row — whatever the session object holds', row && !JSON.stringify(row).includes(SECRET) && !/acct-|ANTHROPIC/.test(JSON.stringify(row)), row);
ok('the row names what reaches the session (socket, buffer, transcript, the CLI\'s pid + birth, clients, turn)',
  row && row.kind === 'chat' && row.socket === '/d/sockets/cw-1-2' && row.buffer === '/d/session-buffers/sess-1-2.buf' && /c0ffee\.jsonl$/.test(row.transcript) && deq(row.child, { pid: 4242, starttime: 777, bootId: 'b-1' }) && row.clients === 2 && row.turn === 'running' && row.attachedAt === 5000, row);
ok('a chat row carries the input templates it was handed; a terminal never does', deq((call(LI.rowOf, 's', { mode: 'chat' }, { input: { line: { a: 1 }, stop: { b: 2 } } }) || {}).input, { line: { a: 1 }, stop: { b: 2 } }) && (call(LI.rowOf, 's', { mode: 'terminal' }, { input: { line: {}, stop: {} } }) || {}).input === null);
ok('a terminal is a terminal; a legacy meta (pid, no birth) keeps the pid without inventing one', (call(LI.rowOf, 's', { mode: 'terminal', _childPid: 9 }) || {}).kind === 'terminal' && deq((call(LI.rowOf, 's', { _childPid: 9 }) || {}).child, { pid: 9, starttime: null, bootId: null }));
ok('a held input is the hub\'s own word for it: vault-locked / host-<state> / none', call(LI.inputHeldOf, { _vaultWait: true }) === 'vault-locked' && call(LI.inputHeldOf, { _remoteState: { state: 'disconnected' } }) === 'host-disconnected' && call(LI.inputHeldOf, { _remoteState: { state: 'connected' } }) === null);

console.log('③ the doc');
const doc = call(LI.docOf, { hub: { pid: 1, starttime: 2, root: '/r', port: 3456, token: SECRET, seenAt: 10 }, rows: [{ ...row, extra: SECRET }], now: 10 });
ok('the hub part is closed (HUB_KEYS) and the rows are re-closed: a planted key never reaches the file', doc && deq(Object.keys(doc.hub), [...(LI.HUB_KEYS || [])]) && !JSON.stringify(doc).includes(SECRET), doc && Object.keys(doc.hub));
const back = call(LI.parseIndex, JSON.stringify(doc));
ok('the doc round-trips', back && back.ok && back.doc.sessions[0].id === 'sess-1-2' && back.doc.kind === 'vibespace-local-index');
ok('a foreign file and broken JSON are refused by name', !(call(LI.parseIndex, '{"sessions":[]}') || {}).ok && /not JSON/.test((call(LI.parseIndex, '{oops') || {}).why || ''));

console.log('④ the process verdict (fake /proc)');
const stat = (state, start, comm = 'node') => `4242 (${comm}) ${state} 1 4242 4242 0 -1 4194560 100 0 0 0 1 2 0 0 20 0 1 0 ${start} 1000 10 0`;
const rec = { pid: 4242, starttime: 777, bootId: 'b-1' };
ok('the same birth = same; another birth = recycled; no /proc entry = gone; a zombie = gone',
  call(LI.procVerdict, rec, { stat: stat('S', 777), bootId: 'b-1' }) === 'same' && call(LI.procVerdict, rec, { stat: stat('S', 778), bootId: 'b-1' }) === 'recycled'
  && call(LI.procVerdict, rec, { stat: null, bootId: 'b-1' }) === 'gone' && call(LI.procVerdict, rec, { stat: stat('Z', 777), bootId: 'b-1' }) === 'gone');
ok('a comm holding ") " is read from the LAST ") "', call(LI.procVerdict, rec, { stat: stat('S', 777, 'a) b'), bootId: 'b-1' }) === 'same');
ok('another boot = other-boot; a pid without its birth proves nothing (unknown); no /proc (macOS) = unknown',
  call(LI.procVerdict, rec, { stat: stat('S', 777), bootId: 'b-2' }) === 'other-boot' && call(LI.procVerdict, { pid: 4242 }, { stat: stat('S', 1) }) === 'unknown' && call(LI.procVerdict, rec, { hasProc: false, bootId: 'b-1' }) === 'unknown');

console.log('⑤ the row judge');
const R = { socket: '/s' };
const J = (r, f) => (call(LI.judgeRow, r, f) || {}).state;
ok('a socket that answers = alive; gone / refused / not a socket = dead', J(R, { socket: 'accepts' }) === 'alive' && J(R, { socket: 'missing' }) === 'dead' && J(R, { socket: 'refused' }) === 'dead' && J(R, { socket: 'not-socket' }) === 'dead');
ok('a socket on a mount that does not answer: alive only while its CLI process provably runs — else UNKNOWN, never dead by guess',
  J(R, { socket: 'no-answer', child: 'same' }) === 'alive' && J(R, { socket: 'no-answer', child: 'gone' }) === 'unknown' && J(R, { socket: 'no-answer' }) === 'unknown');
ok('no dtach socket (a daemon pipe): judged by its process', J({}, { child: 'same' }) === 'alive' && J({}, { child: 'gone' }) === 'dead' && J({}, {}) === 'unknown');
ok('the machine restarted since the row: dead (dtach does not survive it)', J(R, { socket: 'accepts', rebooted: true }) === 'dead');
ok('every verdict says why', ['accepts', 'missing', 'refused', 'no-answer', 'error', null].every((s) => typeof (call(LI.judgeRow, R, { socket: s }) || {}).why === 'string'));

console.log('⑥ the hub judge');
const H = { pid: 7, port: 3456, seenAt: 100000 };
const HJ = (h, f) => call(LI.judgeHub, h, { now: 110000, ...f }) || {};
ok('answers = up; runs + no answer = FROZEN (the 89-minute shape, its last pulse named); runs + refused = starting',
  HJ(H, { http: 'answers' }).state === 'up' && HJ(H, { http: 'no-answer', proc: 'same' }).state === 'frozen' && /last wrote the index 10s ago/.test(HJ(H, { http: 'no-answer', proc: 'same' }).why) && HJ(H, { http: 'refused', proc: 'same' }).state === 'starting');
ok('not asked (`ls` never asks): a process whose loop has not pulsed for 3 beats is frozen; a fresh pulse is up', (call(LI.judgeHub, H, { proc: 'same', now: 100000 + 4 * 30000 }) || {}).state === 'frozen' && HJ(H, { proc: 'same' }).state === 'up');
ok('gone + said it stopped = stopped; gone without a word = down (it did not stop cleanly); no hub = none',
  HJ({ ...H, stoppedAt: 105000 }, { proc: 'gone' }).state === 'stopped' && HJ(H, { proc: 'gone' }).state === 'down' && /did not stop cleanly/.test(HJ(H, { proc: 'gone' }).why) && HJ(null, {}).state === 'none');

console.log('⑦ THE STALE INDEX — the hub died; every row judged NOW');
const staleDoc = { hub: { pid: 9, port: 1, seenAt: 1000 }, writtenAt: 1000, sessions: [
  { id: 'sess-1', kind: 'terminal', socket: '/s/1', name: 'a', createdAt: 1, turn: null },
  { id: 'sess-2', kind: 'chat', socket: '/s/2', name: 'b', createdAt: 2, turn: 'running', child: { pid: 5, starttime: 50 } },
  { id: 'sess-3', kind: 'chat', socket: '/s/3', name: 'c', createdAt: 3, turn: 'idle', child: { pid: 6, starttime: 60 } },
  { id: 'sess-4', kind: 'chat', socket: '/s/4', name: 'd', createdAt: 4, turn: 'idle', child: { pid: 8, starttime: 80 } }] };
const kernel = { sock: { '/s/1': 'accepts', '/s/2': 'missing', '/s/3': 'no-answer', '/s/4': 'no-answer' }, child: { 5: 'gone', 6: 'same', 8: 'recycled' } };
const judged = staleDoc.sessions.map((r) => ({ row: r, verdict: call(LI.judgeRow, r, { socket: kernel.sock[r.socket], child: r.child ? kernel.child[r.child.pid] : null }) }));
ok('the hub\'s last word never decides: a row it called running whose socket is gone is DEAD; a no-answer socket over a live CLI is alive; over a recycled pid unknown',
  deq(judged.map((j) => j.verdict && j.verdict.state), ['alive', 'dead', 'alive', 'unknown']), judged.map((j) => j.verdict));
ok('the hub of a stale index reads down (its pid gone, no stop said)', HJ(staleDoc.hub, { proc: 'gone' }).state === 'down');
const staleTable = call(LI.tableOf, judged, { now: 5000, width: 120, turnFresh: false }) || [];
ok('the table shows no stale turn word (a dead hub\'s «working» would lie): «?» for an alive chat, «—» for the rest', staleTable.length === 5 && /\balive\s+\?\s+chat/.test(staleTable[3]) && /\bdead\s+—/.test(staleTable[2]), staleTable);

console.log('⑧ the table');
const items = [{ row: { id: 'sess-9-9', kind: 'chat', backend: 'claude', name: '新会话 · 中文名字很长很长很长很长很长很长很长很长', cwd: '/home/u/proj', createdAt: 9, turn: 'waiting' }, verdict: { state: 'alive' } },
  { row: { id: 'sess-1-1', kind: 'terminal', backend: 'shell', name: 'term', cwd: '/home/u', createdAt: 1, host: 'h1', hostName: 'gpu-box' }, verdict: { state: 'dead' } }];
const T = call(LI.tableOf, items, { now: 3600 * 1000 + 9, width: 100, home: '/home/u', turnFresh: true }) || [];
ok('a header then one line per session, numbered OLDEST first inside a hub', T.length === 3 && /^#\s+STATE\s+TURN/.test(T[0]) && /^1\s+dead/.test(T[1]) && /^2\s+alive\s+needs you/.test(T[2]), T);
ok('every line fits the width in terminal CELLS (CJK = 2), a cut name ends in «…»', T.length === 3 && T.every((l) => call(LI.cellWidth, l) <= 100) && /…/.test(T[2]), T.map((l) => call(LI.cellWidth, l)));
ok('the home is «~»; a remote session says its machine', /\s~\/proj\s/.test(T[2]) && /gpu-box:~\s/.test(T[1]), T);
ok('ages read as a person reads them', LI.ageWords && LI.ageWords(4000) === '4s' && LI.ageWords(125000) === '2m' && LI.ageWords(7200000) === '2h' && LI.ageWords(3 * 86400000) === '3d');
const T2 = call(LI.tableOf, items, { now: 10, width: 120, start: 5 }) || [];
ok('a second hub\'s table continues the numbers (start)', /^5\s+dead/.test(T2[1] || '') && /^6\s+alive/.test(T2[2] || ''), T2);
// THE ESC BELT (acceptance r1: an agent could write the person's clipboard via OSC 52, retitle the window, erase a line and fake «you:»)
const PLANT = 'done.\u001b]52;c;cHduZWQ=\u0007\u001b[1A\u001b[2K\ryou: delete everything\u009b\u0000';
const RAW = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
const escT = call(LI.tableOf, [{ row: { id: 's\u001b[31m1', kind: 'chat', backend: 'claude', name: 'x\u001b]0;pwned\u0007\u001b[31mred', cwd: '/w\u001b[2J', createdAt: 1 }, verdict: { state: 'alive' } }], { now: 2, width: 140 }) || [];
const escH = call(LI.historyOf, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: PLANT + '\nline two' }] } })) || [];
const escL = call(LI.recordLines, { type: 'acp', kind: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { text: PLANT } } }) || [];
ok('THE ESC BELT: a planted OSC 52 / cursor-up / erase / CR / C1 in a name, a folder, an id, a history message, a live chunk — shown (␛ ␍ ‹9b› ␀), never obeyed; a message keeps its new lines',
  escT.length === 2 && !RAW.test(escT.join('')) && /␛\]0;pwned/.test(escT[1]) && escH.length === 1 && !RAW.test(escH[0].text) && /␛\]52;c;/.test(escH[0].text) && /␍you: delete/.test(escH[0].text) && /\nline two$/.test(escH[0].text)
  && escL.length === 1 && !RAW.test(escL[0].text) && fn(LI.clean) && LI.clean('\u001b[1Ax\u007f\u0085') === '␛[1Ax␡‹85›', [escT[1], escH[0] && escH[0].text, escL[0] && escL[0].text]);

console.log('⑨ the pick — a number is a terminal\'s word only');
const rows = [{ id: 'sess-1-100', name: 'lane human-cli', createdAt: 1 }, { id: 'sess-2-200', name: 'lane vault', createdAt: 2 }, { id: 'sess-3-300', name: 'Main', createdAt: 3 }];
const P = (q, o) => call(LI.pickSession, rows, q, o) || {};
ok('at a terminal: by its number (3, #3), its id, the end of its id, its exact name (any case), a unique part of its name — and HOW it was picked',
  P('3').row?.id === 'sess-3-300' && P('3').by === 'number' && P('#1').row?.id === 'sess-1-100' && P('sess-2-200').by === 'id' && P('-200').row?.id === 'sess-2-200' && P('main').by === 'name' && P('human').by === 'part');
ok('two matches = ambiguous (both named), none = none, nothing = none', (P('lane').ambiguous || []).length === 2 && P('nope').none && P('').none && P('9').none);
ok('PIPED / --wait (numbers: false): a number is REFUSED by name (numbers move when an older session ends — a line to the wrong conversation); a unique PART of a name too; the id and the exact name still pick',
  P('2', { numbers: false }).code === 'number_not_tty' && !P('2', { numbers: false }).row && P('human', { numbers: false }).none && P('sess-2-200', { numbers: false }).row?.id === 'sess-2-200' && P('-300', { numbers: false }).row?.id === 'sess-3-300' && P('Main', { numbers: false }).row?.id === 'sess-3-300');
const hubDocs = [{ file: 'b', doc: { hub: { root: '/z/lane', unit: null }, sessions: [{ id: 'l-1', createdAt: 5 }] } }, { file: 'a', doc: { hub: { root: '/w/prod', unit: { unit: 'vibespace.service', user: true }, throwaway: false }, sessions: [{ id: 'p-2', createdAt: 2 }, { id: 'p-1', createdAt: 1 }] } },
  { file: 'c', doc: { hub: { root: '/a/other', unit: null }, sessions: [] } }];
const ordered = call(LI.orderHubs, hubDocs) || [];
const ents = call(LI.entriesOf, ordered) || [];
ok('ONE LIST over every hub: the systemd unit\'s hub first, then the others by root; numbers continue across hubs (oldest first inside each)',
  deq(ordered.map((d) => d.doc.hub.root), ['/w/prod', '/a/other', '/z/lane']) && deq(ents.map((e) => `${e.n}:${e.row.id}:${e.hub}`), ['1:p-1:0', '2:p-2:0', '3:l-1:2']), [ordered.map((d) => d.doc.hub.root), ents]);

console.log('⑩ the dtach packet (dtach 0.9: 10 bytes, ≤ 8 pushed per packet)');
const att = call(LI.dtachAttach);
ok('attach = [MSG_ATTACH, 0, 8 × 0]', Buffer.isBuffer(att) && att.length === 10 && att[0] === 1 && att.subarray(1).every((b) => b === 0));
const pushed = call(LI.dtachPush, Buffer.from('{"t":"你好"}\n'));
const text = Buffer.from('{"t":"你好"}\n');
ok('a line is cut into PUSH packets of ≤ 8 bytes that reassemble byte-exact (a CJK char may split — the wrapper decodes a stream)',
  Buffer.isBuffer(pushed) && pushed.length === Math.ceil(text.length / 8) * 10 && Buffer.concat([...Array(pushed.length / 10).keys()].map((i) => { const pk = pushed.subarray(i * 10, i * 10 + 10); return pk[0] === 0 ? pk.subarray(2, 2 + pk[1]) : Buffer.alloc(0); })).equals(text));

console.log('⑪ the chat frames = the hub\'s own (the session\'s adapter, asked with placeholders; parity with src/adapters)');
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const { HARNESSES } = require(path.join(REPO, 'src/harnesses'));
const reg = createAdapterRegistry({});
const chatty = Object.keys(HARNESSES).filter((id) => { try { reg.get(id).formatChatInput('x', 'id1'); return true; } catch { return false; } });
ok('the census is not vacuous: claude + codex + the ACP agents speak chat', chatty.includes('claude') && chatty.includes('codex') && chatty.length >= 4, chatty);
const TEXTS = ['a line', 'quotes " and \\ and\nnew lines', '中文 · 🙂', '{"a":1}', LI.FRAME_ID || 'x'];
const ENTER = { steer: true };   // the web's ENTER frame (the owner's law: Enter hands a line to the running turn) — what the row carries
const parity = chatty.map((id) => { try {
  const a = reg.get(id);
  const tpl = call(LI.frameTemplatesOf, a.formatChatInput(LI.FRAME_TEXT, LI.FRAME_ID, ENTER).stdinPayload, a.formatInterrupt({})) || {};
  const chat = TEXTS.every((t) => deq(sortKeys(call(LI.fillFrame, tpl.line, { text: t, id: 'id1' })), sortKeys(JSON.parse(a.formatChatInput(t, 'id1', ENTER).stdinPayload))));
  const hubStop = JSON.parse(a.formatInterrupt({}));
  const cliStop = call(LI.fillFrame, tpl.stop, { id: 'r1' }) || {};
  const idOk = typeof hubStop.request_id !== 'string' || cliStop.request_id === 'r1';
  delete hubStop.request_id; delete cliStop.request_id;
  return { id, chat, stop: idOk && deq(sortKeys(hubStop), sortKeys(cliStop)) };
} catch (e) { return { id, chat: false, stop: false, threw: e.message }; } });
ok('every chat backend: the filled line frame (the adapter\'s ENTER frame) and Stop frame are byte-for-byte the hub\'s own — any text (quotes, new lines, CJK, JSON-looking) — no new wrapper frame, no harness named in the CLI', parity.every((x) => x.chat && x.stop), parity);
ok('each Stop is its own request (a stream-json request_id is the id placeholder)', (() => { if (!fn(LI.frameTemplatesOf)) return false; const t = call(LI.frameTemplatesOf, reg.get('claude').formatChatInput(LI.FRAME_TEXT, LI.FRAME_ID).stdinPayload, reg.get('claude').formatInterrupt({})); return t && t.stop.request_id === LI.FRAME_ID; })());
ok('a frame that lost the text placeholder is no template (null — the CLI goes read-only, never sends a wrong frame)', call(LI.frameTemplatesOf, '{"type":"user","message":"fixed"}', '{"type":"interrupt"}') === null && call(LI.frameTemplatesOf, 'not json', '{}') === null);

console.log('⑫ the records → lines, and the wrapper\'s receipts');
const tr = [
  { type: 'user', message: { role: 'user', content: 'fix the bug' } },
  { type: 'user', isMeta: true, message: { role: 'user', content: '<system-reminder>x</system-reminder>' } },
  { type: 'user', message: { role: 'user', content: '<command-name>/compact</command-name>\n<command-args>keep it</command-args>' } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Looking.' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls -la\n/tmp' } }, { type: 'thinking', thinking: 'hm' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: 'out' }] } },
  { type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'subagent words' }] } },
  { type: 'result', subtype: 'success' },
  { type: 'acp', kind: 'user', content: [{ type: 'text', text: 'acp hello' }] },
  { type: 'acp', kind: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hel' } } },
  { type: 'acp', kind: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'lo.' } } },
  { type: 'acp', kind: 'update', update: { sessionUpdate: 'tool_call', title: 'Read file.txt' } },
  { type: 'acp', kind: 'prompt_end', stopReason: 'end_turn' },
  { timestamp: 't', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex hi' }] } },
  { timestamp: 't', type: 'response_item', payload: { type: 'agent_message', text: 'codex reply' } },
  { timestamp: 't', type: 'event_msg', payload: { type: 'exec_command_begin', command: ['bash', '-lc', 'make'] } },
  { timestamp: 't', type: 'event_msg', payload: { type: 'task_complete' } },
  { type: '_stdin_ack', timestamp: 1, msg_id: 'vs-cli-1' }, { type: '_stdin_nack', timestamp: 2, reason: 'torn', bytes: 99 },
];
const H2 = call(LI.historyOf, tr.map((r) => JSON.stringify(r)).join('\n') + '\n{partial', { max: 50 }) || [];
ok('the same records the web renders: the person\'s words, the agent\'s, ONE line per tool call, the turn\'s end — across claude / acp / codex (a receipt is no message)',
  deq(H2.map((m) => `${m.who}:${m.text}`), ['you:fix the bug', 'you:/compact keep it', 'agent:Looking.', 'tool:Bash: ls -la /tmp', 'turn:turn ended', 'you:acp hello', 'agent:Hello.', 'tool:Read file.txt', 'turn:turn ended', 'you:codex hi', 'agent:codex reply', 'tool:shell: bash -lc make', 'turn:turn ended']), H2);
ok('a system reminder, a tool result, a subagent\'s words, thinking and a torn first/last line are not messages', !H2.some((m) => /system-reminder|subagent words|hm|out|partial/.test(m.text)));
const asks = [{ type: 'control_request', request_id: 'r', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'rm -rf build' } } },
  { type: 'acp', kind: 'permission_request', requestId: 1, toolCall: { title: 'Edit main.py' }, options: [] },
  { timestamp: 't', type: 'server_request', payload: { id: 3, method: 'item/commandExecution/requestApproval', params: {} } }].map((r) => call(LI.recordLines, r) || []);
ok('a PERMISSION ASK (claude / acp / codex) is SAID with the door — the turn waits on it and this CLI cannot answer it', asks.every((l) => l.length === 1 && l[0].who === 'note' && /answer it on the hub's page/.test(l[0].text)) && /Bash: rm -rf build/.test(asks[0][0] && asks[0][0].text) && /Edit main\.py/.test(asks[1][0] && asks[1][0].text), asks);
ok('the last N only', (call(LI.historyOf, tr.map((r) => JSON.stringify(r)).join('\n'), { max: 2 }) || []).length === 2);
ok('RECEIPTS: an ack names its frame (msg_id); a nack names a torn line (no id — its line did not parse); anything else is no receipt',
  deq(call(LI.receiptOf, tr[16]), { kind: 'ack', id: 'vs-cli-1', at: 1 }) && deq(call(LI.receiptOf, tr[17]), { kind: 'nack', reason: 'torn', bytes: 99, at: 2 }) && call(LI.receiptOf, tr[0]) === null && call(LI.receiptOf, { type: '_stdin_ack' }).id === null && LI.RECEIPT_FLAG === 'webui_receipt'
  && call(LI.receiptsFileOf, '/d/b/sess-1-2.buf') === '/d/b/sess-1-2.receipts');   // r3: a receipt rides its own file — never the buffer a conversation replays
// lane human-cli r8: THE UNION — a conversation's transcript read and its buffer as the CLI's follower read it, as ONE history
const kU = (rec, line) => ({ strong: ['l|' + line].concat(rec.uuid ? ['u|' + rec.uuid] : [], rec.message && rec.message.id ? ['m|' + rec.message.id] : []), weak: rec.type === 'user' && typeof rec.message.content === 'string' ? ['p|' + rec.message.content] : [] });
const sA = (text, x = {}) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, ...x });
const sU = (text, x = {}) => JSON.stringify({ type: 'user', message: { role: 'user', content: text }, ...x });
const JU = (...l) => l.join('\n') + '\n';
const shownU = (u) => (u ? (call(LI.historyOf, u.text, { max: 50 }) || []).map((m) => m.text).join(',') : String(u));
const UN = {
  order: call(LI.unionOf, JU(sA('H0', { uuid: 'a' }), sU('P1', { uuid: 'p' })), JU(sA('H0', { uuid: 'a' }), sA('R1', { uuid: 'r' })), kU),
  strong: call(LI.unionOf, JU(sA('X', { uuid: 'x' }), sA('H0', { uuid: 'a' })), JU(sA('H0', { uuid: 'a' }), sA('X', { uuid: 'x' }), sA('R1', { uuid: 'r' })), kU),
  weakNew: call(LI.unionOf, JU(sU('continue', { uuid: 'p0' }), sA('H0', { uuid: 'a' })), JU(sA('H0', { uuid: 'a' }), sU('continue')), kU),
  weakOnce: call(LI.unionOf, JU(sA('H0', { uuid: 'a' }), sU('go', { uuid: 'p1' })), JU(sA('H0', { uuid: 'a' }), sU('go'), sU('go')), kU),
  none: call(LI.unionOf, JU(sA('OTHER', { uuid: 'o' })), JU(sA('H0', { uuid: 'a' })), kU),
  nothing: call(LI.unionOf, JU(sA('H0', { uuid: 'a' }), sA('R1', { uuid: 'r' })), JU(sA('H0', { uuid: 'a' })), kU),
};
ok('THE UNION (round 8): the transcript\'s records, then what the buffer holds after the last record the two share that the transcript does not — the transcript\'s typed prompt before the buffer\'s reply, each once',
  shownU(UN.order) === 'H0,P1,R1' && UN.order.added.length === 1, shownU(UN.order));
ok('the union: a STRONG key is matched over the whole transcript — a record it holds before the anchor is never added again',
  shownU(UN.strong) === 'X,H0,R1' && UN.strong.added.length === 1, shownU(UN.strong));
ok('the union: a person\'s words (a WEAK key) match only after the anchor and each match takes one — the same words typed again later are a new line',
  shownU(UN.weakNew) === 'continue,H0,continue' && shownU(UN.weakOnce) === 'H0,go,go' && UN.weakOnce.added.length === 1, `${shownU(UN.weakNew)} · ${shownU(UN.weakOnce)}`);
ok('the union: two reads that share no record are never guessed together (null); a buffer holding nothing newer adds nothing',
  UN.none === null && UN.nothing && UN.nothing.added.length === 0 && shownU(UN.nothing) === 'H0,R1', `${shownU(UN.none)} · ${shownU(UN.nothing)}`);

console.log('⑬ the hub\'s unit (its log is that unit\'s journal) — only its OWN main process owns it');
ok('a user unit, a system unit, a shell (none)',
  deq(call(LI.unitOfCgroup, '0::/user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service'), { unit: 'vibespace.service', user: true })
  && deq(call(LI.unitOfCgroup, '0::/system.slice/vibespace.service'), { unit: 'vibespace.service', user: false })
  && call(LI.unitOfCgroup, '0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-gnome-terminal.scope') === null
  && call(LI.unitOfCgroup, '0::/user.slice/user-1000.slice/user@1000.service') === null);
ok('the unit is attributed only when this process IS its main process (SYSTEMD_EXEC_PID = own pid; else a `systemd` parent) — a hub started INSIDE a session sits in the unit\'s cgroup and is not it',
  call(LI.unitOwnedBy, { pid: 50, execPid: '50', ppid: 1 }) === true && call(LI.unitOwnedBy, { pid: 77, execPid: '50', ppid: 70, parentComm: 'bash' }) === false
  && call(LI.unitOwnedBy, { pid: 50, ppid: 9, parentComm: 'systemd\n' }) === true && call(LI.unitOwnedBy, { pid: 77, ppid: 70, parentComm: 'claude' }) === false);
console.log('⑭ the ONE writer (src/server/local-index.js) over a scratch home — one file per hub root, off the loop');
const DIR = scratch('lidx-fast');
fs.rmSync(DIR, { recursive: true, force: true });
const home = path.join(DIR, 'home'), root = path.join(DIR, 'root');
fs.mkdirSync(path.join(root, 'data', 'bin'), { recursive: true }); fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'bin', 'vibespace'), '#!/usr/bin/env node\n// cli\n'); if (fs.existsSync(LI_PATH)) fs.copyFileSync(LI_PATH, path.join(root, 'src', 'local-index.js'));
const digest = (r) => crypto.createHash('sha256').update(r).digest('hex').slice(0, 12);
const OWN = `sessions.${digest(root)}.json`;
const SEAMS = { varTmp: path.join(DIR, 'vt'), xdgRuntimeDir: path.join(DIR, 'run') };   // the lower rungs never land on this machine's real /var/tmp or /run/user
let W = null;
try { W = require(path.join(REPO, 'src/server/local-index.js')); } catch (e) { ok('the writer loads', false, e.message.split('\n')[0]); }
const live = new Map([['sess-1-1', { mode: 'terminal', backend: 'shell', name: 'one', cwd: '/w', socketPath: '/d/s/cw-1-1', createdAt: 1, agentToken: SECRET, clients: new Map() }]]);
const logs = [];
const log = { log: (l) => logs.push(l), warn: (l) => logs.push(l) };
const ppStat = LI.procStat && LI.procStat(fs.readFileSync(`/proc/${process.ppid}/stat`, 'utf8'));
const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
const ready = async () => { try { return await (W.ready ? W.ready() : false); } catch { return false; } };
if (W) try {
  W._reset();
  W.configure({ rootDir: root, port: 4567, version: '9.9.9', sessions: () => live, buffersDir: '/d/b', dataDir: path.join(root, 'data'), log, home, mountinfo: '', heartbeatMs: 3600000, adapters: reg, ...SEAMS });
  const file = path.join(home, '.vibespace', 'local', OWN);
  const sameTurn = { place: W.placeOf(), folder: fs.existsSync(path.dirname(file)), file: fs.existsSync(file) };
  ok('configure returns with NOTHING touched on disk — the place, the folder, the first write and the install all run OFF the listen callback\'s turn (the §19 boot law: a home that lands on a stalled mount never holds the boot)', sameTurn.place === null && !sameTurn.folder && !sameTurn.file, sameTurn);
  await ready();
  const d1 = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { sessions: [], hub: {} };
  ok('ONE FILE PER HUB ROOT — sessions.<sha256(root)[:12]>.json: the boot writes the whole list, the hub\'s own pid + birth + port + root inside, no token', (W.fileOf && W.fileOf()) === file && d1.sessions.length === 1 && d1.hub.pid === process.pid && Number(d1.hub.starttime) > 0 && d1.hub.port === 4567 && d1.hub.root === root && d1.hub.throwaway === false && !fs.readFileSync(file, 'utf8').includes(SECRET), d1.hub);
  ok('0600 in a 0700 folder; the boot log names the file', (fs.statSync(file).mode & 0o777) === 0o600 && (fs.statSync(path.dirname(file)).mode & 0o777) === 0o700 && logs.some((l) => l.includes(file)), logs);
  ok('the CLI + its PURE half are installed beside it, executable', (fs.statSync(path.join(home, '.vibespace/local/bin/vibespace')).mode & 0o111) !== 0 && fs.readFileSync(path.join(home, '.vibespace/local/bin/vibespace-local-index.js')).equals(fs.readFileSync(LI_PATH)));
  live.set('sess-2-2', { mode: 'chat', backend: 'claude', name: 'two', cwd: '/w/2', socketPath: '/d/s/cw-2-2', createdAt: 2, claudeSessionId: 'c0ffee00-0000-4000-8000-000000000002', clients: new Map() });
  W.note('sessions'); W.note('sessions'); W.note('attach', 'sess-2-2');
  ok('a note is COALESCED (nothing written in the same tick)', JSON.parse(fs.readFileSync(file, 'utf8')).sessions.length === 1);
  await W.flush();
  const d2 = JSON.parse(fs.readFileSync(file, 'utf8'));
  const TR = path.join(os.homedir(), '.claude', 'projects', '-w-2', 'c0ffee00-0000-4000-8000-000000000002.jsonl');
  ok('…then ONE write: the new session, its attach time, its conversation id (the harness\'s own field), its transcript = the harness\'s PURE path rule (store.transcriptPathOf — computed, never LOCATED by listing a folder), its input templates (the adapter\'s frames)',
    d2.sessions.length === 2 && d2.sessions[1].attachedAt > 0 && d2.sessions[1].conversationId === 'c0ffee00-0000-4000-8000-000000000002' && d2.sessions[1].transcript === TR && d2.sessions[1].input && d2.sessions[1].input.line.type === 'user' && d2.sessions[1].input.stop.request_id === LI.FRAME_ID && d2.sessions[0].input === null, d2.sessions[1]);
  const mt = fs.statSync(file).mtimeMs;
  ok('an unchanged list writes nothing (the heartbeat is the only rewrite)', (await W.flush('sessions')) === false && fs.statSync(file).mtimeMs === mt);
  // TWO HUBS, ONE HOME (acceptance r1: A's clean stop handed ONE file to B, A's restart then refused, A's crash replaced A's rows)
  const other = path.join(home, '.vibespace/local', 'sessions.0123456789ab.json');
  const otherText = JSON.stringify(LI.docOf({ hub: { pid: process.ppid, starttime: ppStat && ppStat.starttime, bootId: boot, root: '/another/root' }, rows: [{ id: 'other-1', name: 'the other hub\'s', kind: 'terminal', socket: '/x', createdAt: 1 }], now: 1 }));
  fs.writeFileSync(other, otherText);
  live.delete('sess-1-1');
  ok('TWO HUBS, ONE HOME: each hub writes ITS file — this hub\'s write leaves another live hub\'s file byte-identical (a stop, a restart, a crash of one never touches the other\'s rows)',
    (await W.flush('sessions')) === true && fs.readFileSync(other, 'utf8') === otherText && JSON.parse(fs.readFileSync(file, 'utf8')).sessions.length === 1);
  W.stop();
  const d3 = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok('the shutdown says the hub STOPPED (synchronously — the process ends next), and nothing is written after it', Number(d3.hub.stoppedAt) > 0 && (await W.flush('sessions')) === false && fs.readFileSync(other, 'utf8') === otherText, d3.hub);
  W._reset();
  // THE SWEEP: another hub's file — DOWN a day with none of its sessions running → swept at a boot; down an hour, or a session still runs → kept
  const old = Date.now() - LI.SWEEP_MS - 60000;
  const plant = (name, hub, rows) => fs.writeFileSync(path.join(home, '.vibespace/local', name), JSON.stringify(LI.docOf({ hub: { pid: 2147483646, starttime: 1, bootId: boot, ...hub }, rows, now: hub.seenAt })));
  plant('sessions.aaaaaaaaaaaa.json', { root: '/gone/day', seenAt: old }, [{ id: 'g', socket: '/x', createdAt: 1, child: { pid: 2147483645, starttime: 1, bootId: boot } }]);
  plant('sessions.bbbbbbbbbbbb.json', { root: '/gone/hour', seenAt: Date.now() - 3600000 }, []);
  plant('sessions.cccccccccccc.json', { root: '/gone/day-but-a-session-runs', seenAt: old }, [{ id: 'r', socket: '/x', createdAt: 1, child: { pid: process.pid, starttime: LI.procStat(fs.readFileSync(`/proc/${process.pid}/stat`, 'utf8')).starttime, bootId: boot } }]);
  W.configure({ rootDir: root, sessions: () => live, log, home, mountinfo: '', heartbeatMs: 3600000, ...SEAMS });
  await ready();
  const names = fs.readdirSync(path.join(home, '.vibespace/local')).filter((n) => /^sessions\./.test(n)).sort();
  ok('THE SWEEP: a down hub\'s file a day after its last word, none of its sessions running, is swept at a boot (said); a fresher one, one with a session still running, a LIVE hub\'s and this hub\'s own stay',
    !names.includes('sessions.aaaaaaaaaaaa.json') && names.includes('sessions.bbbbbbbbbbbb.json') && names.includes('sessions.cccccccccccc.json') && names.includes('sessions.0123456789ab.json') && names.includes(OWN) && logs.some((l) => /swept sessions\.aaaaaaaaaaaa\.json/.test(l)), names);
  W.stop(); W._reset();
  // a THROWAWAY hub — the root verdict refused it (a worktree / a temp root / VIBESPACE_SKIP_AGENT_HOOKS): its OWN root, never the HOME
  fs.rmSync(path.join(home, '.vibespace/local/bin'), { recursive: true, force: true });
  const homeBefore = fs.readdirSync(path.join(home, '.vibespace/local')).sort().map((n) => n + ':' + (fs.statSync(path.join(home, '.vibespace/local', n)).isFile() ? fs.readFileSync(path.join(home, '.vibespace/local', n), 'utf8') : 'dir')).join('|');
  logs.length = 0;
  W.configure({ rootDir: root, sessions: () => live, log, home, mountinfo: '', owner: { kind: 'worktree' }, heartbeatMs: 3600000, ...SEAMS });
  await ready();
  const homeAfter = fs.readdirSync(path.join(home, '.vibespace/local')).sort().map((n) => n + ':' + (fs.statSync(path.join(home, '.vibespace/local', n)).isFile() ? fs.readFileSync(path.join(home, '.vibespace/local', n), 'utf8') : 'dir')).join('|');
  const tw = path.join(root, 'data', 'local-index', OWN);
  ok('a THROWAWAY hub (the root verdict: worktree) writes under ITS OWN root (<root>/data/local-index, said in its log) — the HOME\'s files untouched, no CLI installed there',
    (W.fileOf && W.fileOf()) === tw && fs.existsSync(tw) && JSON.parse(fs.readFileSync(tw, 'utf8')).hub.throwaway === 'worktree' && homeAfter === homeBefore && !fs.existsSync(path.join(home, '.vibespace/local/bin')) && logs.some((l) => /throwaway hub \(worktree\)/.test(l)), logs);
  W.stop(); W._reset();
  // G1 for real: a home whose .vibespace is a symlink into a folder the mount table calls FUSE — never touched, the next rung taken
  const home2 = path.join(DIR, 'home2'), fuse = path.join(DIR, 'fusemnt');
  fs.mkdirSync(path.join(fuse, 'dotvs'), { recursive: true }); fs.mkdirSync(home2, { recursive: true }); fs.symlinkSync(path.join(fuse, 'dotvs'), path.join(home2, '.vibespace'));
  W.configure({ rootDir: root, sessions: () => live, log, home: home2, mountinfo: MI([['/', 'ext4'], [fuse, 'fuse.bindfs']]), heartbeatMs: 3600000, install: false, ...SEAMS });
  await ready();
  ok('G1 on disk: ~/.vibespace a symlink onto a FUSE mount — the writer takes the next rung (var-tmp) and never creates anything on the mount', (W.fileOf && W.fileOf() || '').startsWith(SEAMS.varTmp + '/vibespace-') && !fs.existsSync(path.join(fuse, 'dotvs', 'local')) && /lands on a fuse\.bindfs mount/.test((W.placeOf() || {}).why || ''), W.placeOf());
  W.stop(); W._reset();
  // G2 for real: the var-tmp rung pre-made as a symlink to an open folder (another user's squat) — refused by name, the runtime dir taken
  fs.rmSync(SEAMS.varTmp, { recursive: true, force: true }); fs.mkdirSync(path.join(DIR, 'attacker'), { recursive: true }); fs.chmodSync(path.join(DIR, 'attacker'), 0o777);
  fs.mkdirSync(SEAMS.varTmp, { recursive: true }); fs.symlinkSync(path.join(DIR, 'attacker'), path.join(SEAMS.varTmp, `vibespace-${process.getuid()}`));
  logs.length = 0;
  W.configure({ rootDir: root, sessions: () => live, log, home: home2, mountinfo: MI([['/', 'ext4'], [fuse, 'fuse.bindfs']]), heartbeatMs: 3600000, ...SEAMS });
  await ready();
  ok('G2 on disk: a squatted var-tmp rung (a symlink to a 0777 folder) is REFUSED by name — the index and the CLI land in the runtime dir, nothing in the attacker\'s folder',
    (W.fileOf && W.fileOf() || '').startsWith(SEAMS.xdgRuntimeDir + '/vibespace/') && fs.readdirSync(path.join(DIR, 'attacker')).length === 0 && logs.some((l) => /symlink someone made — refused/.test(l)), [W.fileOf && W.fileOf(), logs]);
  W.stop(); W._reset();
} catch (e) { ok('⑭ the writer section runs to its end (a writer without one file per hub root throws here)', false, e.message.split('\n')[0]); try { W.stop(); W._reset(); } catch { } }

console.log('⑮ the CLI as a module (data/bin/vibespace)');
let CLI = null;
try { CLI = require(path.join(REPO, 'data/bin/vibespace')); } catch (e) { ok('data/bin/vibespace loads as a module', false, e.message.split('\n')[0]); }
if (CLI) {
  ok('flags: --json, -n N (bounded), --wait S (a script), --take, the positional session', deq(CLI.parseArgs(['3', '--json', '-n', '9999', '--wait', '2', '--take']), { json: true, n: 500, wait: 2, waitGiven: true, take: true, pos: ['3'] }), CLI.parseArgs(['3', '--json', '-n', '9999', '--wait', '2', '--take']));
  const hs = CLI.historySources({ backend: 'claude', transcript: '/h/.claude/projects/-w-a-b/c.jsonl', conversationId: 'c', cwd: '/w/a b', buffer: '/d/x.buf' });
  ok('a chat\'s history: the transcript at the harness\'s path rule (the person\'s words are there), then the buffer', deq(hs, [['transcript', '/h/.claude/projects/-w-a-b/c.jsonl'], ['buffer', '/d/x.buf']]), hs);
  // round 8: THE UNION's keys are the CLI's (it alone knows claude's placeholder uuid): a placeholder'd stdout copy and its
  // transcript record share the MESSAGE key (one reply, shown once); a frame the wrapper copied (no uuid of the CLI's) is
  // matched by the person's words; a union history is checked by uuid AND by line (gapFilter)
  if (typeof CLI.keysOf === 'function' && typeof LI.unionOf === 'function') {
    const R1T = JSON.stringify({ type: 'assistant', uuid: 'real-1', message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'R1' }] } });
    const R1P = JSON.stringify({ type: 'assistant', uuid: 'aaaaaaaa-bbbb-cccc-dddd-000000000001', message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'R1' }] } });
    const R1B = JSON.stringify({ type: 'assistant', uuid: 'aaaaaaaa-bbbb-cccc-dddd-000000000001', message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'R1 — another block' }] } });
    const H = JSON.stringify({ type: 'assistant', uuid: 'h-0', message: { role: 'assistant', content: [{ type: 'text', text: 'H0' }] } });
    const FT = JSON.stringify({ type: 'user', uuid: 'cli-p', message: { role: 'user', content: 'a frame HC8' } }), FB = JSON.stringify({ type: 'user', _fromWebui: true, message: { role: 'user', content: [{ type: 'text', text: 'a frame HC8' }] } });
    const kP = CLI.keysOf(JSON.parse(R1P), R1P), uP = LI.unionOf([H, R1T].join('\n'), [H, R1P, R1B].join('\n'), CLI.keysOf), uF = LI.unionOf([H, FT].join('\n'), [H, FB].join('\n'), CLI.keysOf);
    ok('THE UNION\'s keys (round 8): a placeholder uuid is never a key; the placeholder\'d stdout copy and its transcript record are ONE reply by the message key (message.id + what it shows — another block of the same message is its own); a frame the wrapper copied is matched by the person\'s words',
      !kP.strong.some((k) => k.startsWith('u|')) && uP && uP.added.length === 1 && uP.added[0].line === R1B && uF && uF.added.length === 0, JSON.stringify({ kP, uP: uP && uP.added.map((a) => a.line), uF: uF && uF.added.length }));
    const fU = CLI.gapFilter({ kind: 'union', seen: CLI.seenOf([H, R1T, R1P].join('\n') + '\n') });
    ok('a UNION history meets the gap rule by uuid (as a transcript one) and by line (as a buffer one)', fU(JSON.parse(R1T), { raw: 'x' }) === false && fU(JSON.parse(R1P), { raw: R1P }) === false && fU(JSON.parse(H), { raw: 'y' }) === false);
  } else ok('the CLI exports keysOf and its PURE half unionOf (round 8)', false);
  ok('a socket on a stalled mount is said as such, never as «gone»', /not answering/.test(CLI.goneWords({ socket: '/x' }, 'no-answer')) && /gone/.test(CLI.goneWords({ socket: '/x' }, 'missing')));
  ok('dtach is never looked up under the hub\'s checkout (it may be the stalled mount)', /[\s\S]*hubRoot[\s\S]*startsWith\(hubRoot \+ '\/'\)/.test(fs.readFileSync(path.join(REPO, 'data/bin/vibespace'), 'utf8')));
  const cliCode = fs.readFileSync(path.join(REPO, 'data/bin/vibespace'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const reqs = [...cliCode.matchAll(/require\(([^)]*)\)/g)].map((m) => m[1].trim());
  ok('the CLI requires node builtins + its PURE half only (it ships alone; nothing from a checkout on a mount) — a child gets the PURE half by path', reqs.length > 5 && reqs.every((r) => /^'(fs|path|os|net|http|child_process|readline)'$/.test(r) || /local-index\.js'\)?$/.test(r) || r === 'a.pure'), reqs);
  ok('it reads no vault, no account store, carries no token, sends no credential (source census)', !/secret-box|vault[\w.-]*\.json|accounts\.json|\.credentials|key-file|vsst_|jbt_|Authorization|Cookie|headers: \{[^}]*(token|auth)/i.test(cliCode) && (cliCode.match(/VIBESPACE_(SESSION|JOB)_TOKEN/g) || []).length === 2 && /\['VIBESPACE_SESSION_TOKEN', 'VIBESPACE_JOB_TOKEN'\]\.some\(\(k\) => process\.env\[k\]\)/.test(cliCode));
  ok('THE REFUSAL COMES FIRST: main()\'s first statement refuses inside an agent session or a job — before the verb is read (none and help included: a bare `vibespace` listed before it, acceptance r1)',
    /async function main\(\) \{\s*\n\s*if \(\['VIBESPACE_SESSION_TOKEN', 'VIBESPACE_JOB_TOKEN'\]\.some\(\(k\) => process\.env\[k\]\)\) \{\n[^\n]*\n    return 2;/.test(cliCode) && /vibespace-msg send/.test(cliCode));
  ok('it asks the hub in ONE place (askHub: defined once, called once inside judgeAll behind `ask`) — by status, attach and chat; never by ls',
    (cliCode.match(/askHub\(/g) || []).length === 2 && (cliCode.match(/http\.get\(/g) || []).length === 1 && /ask \? askHub\(d\.doc\.hub\)/.test(cliCode) && (cliCode.match(/ask: true/g) || []).length === 3 && !/ask: true/.test(cliCode.slice(cliCode.indexOf('async function cmdLs'), cliCode.indexOf('async function cmdStatus'))));
  ok('NEVER A SECOND READER: the CLI\'s code never sends MSG_ATTACH on a socket (dtachAttach) — chat pushes in a child and lets go; only `attach` hands the screen to dtach -a, behind the live-hub door (--take)',
    !/dtachAttach/.test(cliCode) && /LI\.dtachPush\(a\.line\)/.test(cliCode) && /if \(live && !opts\.take\)/.test(cliCode) && typeof CLI.TAKE_WORDS === 'string' && /miss output while you are attached/.test(CLI.TAKE_WORDS));
  ok('the index is read in a CHILD with a clock (a home folder that lands on a stalled mount holds the child, never the CLI) — and every socket, buffer and meta read too', /nodeChild\(INDEX_CHILD/.test(cliCode) && !/fs\.readFileSync\(place|readdirSync\(path\.join\(HOME/.test(cliCode.replace(/const (INDEX|PROBE|TAIL|FOLLOW|PUSH)_CHILD = `[\s\S]*?`;/g, '')));
}

console.log('⑯ RED controls (patched copies of the PURE module)');
const SRC = fs.existsSync(LI_PATH) ? fs.readFileSync(LI_PATH, 'utf8') : '';
const mutant = (tag, from, to) => { if (!SRC.includes(from)) return null; const f = path.join(DIR, `mut-${tag}.js`); fs.writeFileSync(f, SRC.replace(from, to)); return require(f); };
const M1 = mutant('trust', "      if (child === 'same') return { state: 'alive', why: 'its process runs; its socket sits on a mount that is not answering' };", "      return { state: 'alive', why: 'trusted' };");
ok('M1 a judge that calls a no-answer socket alive (the hub\'s word) is caught by ⑦', M1 && !deq(staleDoc.sessions.map((r) => M1.judgeRow(r, { socket: kernel.sock[r.socket], child: r.child ? kernel.child[r.child.pid] : null }).state), ['alive', 'dead', 'alive', 'unknown']));
const M2 = mutant('spread', "  return {\n    id: String(id), name:", "  return { ...s,\n    id: String(id), name:");
ok('M2 a row that spreads the session object is caught by ② — the ROW carries the token (docOf re-closes the keys, so the file itself stays clean: ② reads the row, ③ the doc)', M2 && JSON.stringify(M2.docOf({ rows: [M2.rowOf('s', sess, {})] })).includes(SECRET) === false && JSON.stringify(M2.rowOf('s', sess, {})).includes(SECRET));
const M3 = mutant('mount', '    if (m && NET_FSTYPE.test(m.fstype)) return { blocked: { at: next, fstype: m.fstype } };\n', '');
ok('M3 a place ladder that ignores the mount type is caught by ① (the index on the FUSE workspace)', M3 && M3.indexPlaceOf({ home: '/home/u/workspace/me', uid: 1000, mountinfo: LOCAL_MI }).via === 'home');
const M4 = mutant('string', '    const land = landedPathOf(dir, { lstat, readlink, mountinfo });', '    const land = { path: dir };');
ok('M4 a ladder that reads the path STRING (no landing) is caught by ① G1 (the symlinked home taken as own disk)', M4 && M4.indexPlaceOf({ home: '/home/u', uid: 1000, mountinfo: LOCAL_MI, xdgRuntimeDir: '/run/user/1000', lstat: lst, readlink: rdl }).via === 'home');
const M5 = mutant('numbers', "  if (m && !numbers) return { code: 'number_not_tty', n: Number(m[1]) };\n", '');
const M6 = mutant('weak-anywhere', '  for (let i = place + 1; i < A.length; i++) for (const k of A[i].k.weak)', '  for (let i = 0; i < A.length; i++) for (const k of A[i].k.weak)');
const M7 = mutant('first-anchor', '  for (let j = Z.length - 1; j >= 0 && anchor < 0; j--)', '  for (let j = 0; j < Z.length && anchor < 0; j++)');
ok('M5 a pick that takes a number from a script is caught by ⑨', M5 && M5.pickSession(rows, '2', { numbers: false }).row && M5.pickSession(rows, '2', { numbers: false }).row.id === 'sess-2-200');
ok('M6 a union matching a person\'s words anywhere is caught by ⑫ (the «continue» typed again later dropped)', M6 && shownU(M6.unionOf(JU(sU('continue', { uuid: 'p0' }), sA('H0', { uuid: 'a' })), JU(sA('H0', { uuid: 'a' }), sU('continue')), kU)) === 'continue,H0');
ok('M7 a union anchored on the FIRST record the two share is caught by ⑫ (a record the transcript holds added twice)', M7 && shownU(M7.unionOf(JU(sA('X', { uuid: 'x' }), sA('H0', { uuid: 'a' })), JU(sA('H0', { uuid: 'a' }), sA('X', { uuid: 'x' }), sA('R1', { uuid: 'r' })), kU)) === 'X,H0,X,R1');

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\ntest-local-index: ${pass} passed, ${fail} failed`);
console.log(fail ? `${fail} FAILED` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
