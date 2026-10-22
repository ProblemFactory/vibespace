#!/usr/bin/env node
// AN ANTIGRAVITY CONVERSATION STARTS THROUGH THE REAL CREATE PATH (lane antigravity-spawn-argv, 2026-10-21).
// The owner's 2.369.334 hub: «Error: Antigravity exited (exit code 125) — see agy-wrapper.log». The create AND the
// resume died the same way. agy-wrapper.log: `spawned /usr/bin/env --input-format stream-json … EDITOR=… … agy` →
// env's usage error, exit 125. ws-create handed every wrapper `env K=V … <cli>` at the executable's place, and
// agy-wrapper puts agy's flags FIRST.
// HEAVY: the REAL ws-create handler + the production adapter registry + a REAL dtach (node-pty) + the REAL
// data/bin/agy-wrapper.js + a named Antigravity account in the REAL accounts store (a HOME root on a scratch data dir).
// The agy is a STUB. It records its argv and env (and its wrapper's and its dtach master's command lines), then speaks
// the fake agy's stream (scripts/fixtures/antigravity-agy). No vendor, no real login.
//   ① the stub ran AS the wrapper's executable. Its stream argv = the wrapper's own flags + agyFlags(model, mode) + the
//     settings row's extra args, nothing else. Its env: HOME = the account root, the bus disabled, the session's names
//     (id, token, EDITOR, AGY_WEBUI_*). The session started: agy's init became the journal's `session` record.
//   ② NO NAME=value WORD on any command line of the tree (dtach master, wrapper, agy) and the session token on none.
//   ③ an unresolved agy (a bare name) through the same path is REFUSED BY NAME in the journal, never «exit code 125».
//   ⑤ THE SLASH GUARD (lane agy-slash-guard-paths — the owner 2026-10-21: an attachment's message answered «Error: /home
//     was not sent: Antigravity answers its slash commands itself …»): over the session's own pty, agy's OWN commands
//     (/model, /usage opus, /help) are refused by name in the product's sentence and never reach agy; a line that starts
//     with a path — the composer's attachment shape `<cwd>/brief.zip 这里是…`, /home/u/x.zip, /tmp/a.txt — or ~/x,
//     ./run.sh, "/ 2", /2026, /notacommand hello is SENT unchanged (the stub agy reads exactly that line) and answered.
// RED CONTROL = the base tree (2.369.336 cut 23d3ce4d): the stub never runs, and the wrapper's log says it ran
// /usr/bin/env.
//   ④ THE SUBAGENT CARD through the hub (lane agy-subagent-cards): the account's agy store holds the fixture (scripts/
//     fixtures/agy-store, re-parented onto this conversation); a `subagent` turn → the hub's REAL ACP consumer + the ACP
//     normalizer emit the card frames (the Agent card naming the sub, running → completed with its answer), the sub's
//     steps go out as `subagent-message` and never as the parent's cards, the wrapper's tail is on only while the sub
//     works, the virtual session sub-<id> is rebuilt from the journal alone (a restart), the files the sub wrote join
//     this conversation's Artifacts rows via the sub, and an older agy's row (no subagent_info) gets no card and no error.
//     RED CONTROL = the base tree (2.369.339 cut fd843910): no card frame, the row spins.
//   ⑤'s RED CONTROL = the 2.369.340 guard (a wrapper copy with its first-character rule): the attachment
// message is refused as «/home» and agy never sees it.
// Run: node scripts/test-antigravity-session.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); } return null; };
const DTACH = ['/usr/bin/dtach', '/usr/local/bin/dtach', '/bin/dtach'].find((p) => fs.existsSync(p));
if (!DTACH) { console.log('SKIP — no dtach on this machine'); process.exit(0); }

const ROOT = scratchDir('agy-sess');
const BUF = path.join(ROOT, 'b'), SOCK = path.join(ROOT, 's'), DATA = path.join(ROOT, 'data'), MACHINE = path.join(ROOT, 'home'), CWD = path.join(ROOT, 'work'), BIN = path.join(ROOT, 'bin');
for (const d of [BUF, SOCK, DATA, MACHINE, CWD, BIN]) fs.mkdirSync(d, { recursive: true });
const REC = path.join(ROOT, 'agy-record.jsonl');
const FIXTURE = path.join(REPO, 'scripts/fixtures/antigravity-agy');
// THE STUB agy: records what it was handed, then IS the fake agy (the fixture reads process.argv.slice(2) — the same argv)
const STUB = path.join(BIN, 'agy');
fs.writeFileSync(STUB, `#!${process.execPath}
'use strict';
const fs = require('fs');
const cmdline = (pid) => { try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\\0').filter(Boolean); } catch { return null; } };
const ppidOf = (pid) => { try { return Number((/^PPid:\\s*(\\d+)/m.exec(fs.readFileSync('/proc/' + pid + '/status', 'utf8')) || [])[1]) || 0; } catch { return 0; } };
const wrapper = process.ppid, master = ppidOf(wrapper);
fs.appendFileSync(${JSON.stringify(REC)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env, self: cmdline(process.pid), wrapper: cmdline(wrapper), master: cmdline(master) }) + '\\n');
process.env.AGY_STUB_SPAWN_STEP = '6'; process.env.AGY_STUB_SUB_ROLE = '示例评审专家'; // ④: the fixture store's task names step 6
process.env.AGY_STUB_LOG = ${JSON.stringify(ROOT)} + '/stdin-' + (process.env.CLAUDE_WEBUI_SESSION_ID || 'none') + '.jsonl'; // ⑤: every stdin line agy reads, per session
require(${JSON.stringify(FIXTURE)});
`, { mode: 0o755 });
const records = () => { try { return fs.readFileSync(REC, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

// ── a named Antigravity account: the REAL accounts store (os.homedir() = a scratch machine home while it is built)
const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const prevHome = process.env.HOME;
process.env.HOME = MACHINE;
const am = new AccountManager({ dataDir: DATA });
const acct = am.createHomeSubscription('antigravity', { name: 'Personal' });
fs.mkdirSync(path.dirname(path.join(acct.dir, H8.TOKEN_REL)), { recursive: true });
fs.writeFileSync(path.join(acct.dir, H8.TOKEN_REL), 'STUB-LOGIN', { mode: 0o600 }); // what agy's own sign-in writes (never read)
am.finalizeHomeSubscription(acct.id);
process.env.HOME = prevHome;

// ── the REAL create path: ws-create + the production adapter registry + node-pty + dtach + the repo's wrappers
const pty = require(path.join(REPO, 'node_modules/node-pty'));
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const { agentEnv } = require(path.join(REPO, 'src/agent-env.js'));
const { agyFlags } = require(path.join(REPO, 'src/adapters/agy.js'));
const wsCreate = require(path.join(REPO, 'src/ws-create.js'));
const masters = [];
async function create(agyCommand, data, binDir = path.join(REPO, 'data/bin')) {   // binDir: where agy-wrapper.js is (⑤'s RED copy)
  const registry = createAdapterRegistry({
    chatWrapper: path.join(REPO, 'data/bin/chat-wrapper.js'), codexChatWrapper: path.join(REPO, 'data/bin/codex-chat-wrapper.js'),
    acpWrapper: path.join(binDir, 'acp-wrapper.js'), acpCommands: { antigravity: agyCommand },
    ptyWrapper: path.join(REPO, 'data/bin/pty-wrapper.js'), buffersDir: BUF,
  });
  const sent = [], active = new Map(), noop = () => undefined;
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: Math.floor(Math.random() * 1e6) },
    adapterRegistry: registry, hosts: null, accounts: am, os, fs, path,
    execFileSync: require('child_process').execFileSync,
    ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: path.join(REPO, 'data/bin/pty-wrapper.js'), CHAT_WRAPPER: path.join(REPO, 'data/bin/chat-wrapper.js'),
    NODE_CMD: process.execPath, DTACH_CMD: DTACH, ENV_CMD: '/usr/bin/env', // ENV_CMD: what the BASE tree's create path reads (the red control)
    CLAUDE_CMD: 'claude-must-not-run', EDITOR_CMD: path.join(BIN, 'editor-code'), AGENT_BIN_DIR: BIN, PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c },
    serverSetting: noop, harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({}),
    integrationEnabled: () => true, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    pty, setupSessionPty: (s, id, p) => { s.pty = p; },
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = wsCreate.createWsCreateHandler({
    ctx, agentEnv: () => agentEnv(process.env), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
    getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
  });
  await handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', mode: 'chat', backend: 'antigravity', cwd: CWD, reqId: 'r-' + Date.now(), ...data }, new Set());
  const [id, session] = [...active.entries()][0] || [];
  if (session && session.socketPath) masters.push(session.socketPath);
  const journal = () => { try { return fs.readFileSync(path.join(BUF, id + '.buf'), 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
  const wlog = () => { try { return fs.readFileSync(path.join(BUF, 'agy-wrapper.log'), 'utf8'); } catch { return ''; } };
  return { sent, id, session, journal, wlog, registry };
}
const pidsOnSocket = (sock) => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).filter((d) => { try { return fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0').includes(sock); } catch { return false; } }).map(Number);
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

try {
  console.log('— ① a new conversation on the named account: the stub agy runs as the wrapper\'s executable');
  const extra = ['--stub-extra', 'two words'];
  const c = await create(STUB, { accountId: acct.id, model: 'gemini-4-argon-high', permissionMode: 'bypassPermissions', extraArgs: extra });
  ok(c.sent.some((m) => m.type === 'created') && !c.sent.some((m) => m.type === 'error') && !!c.session, 'the create answers `created`', c.sent.map((m) => m.type + (m.message ? ': ' + m.message : '')));
  const start = await until(() => records().find((r) => r.argv.includes('--input-format')), 15000);
  const ran = (/spawned (\S+)/.exec(c.wlog()) || [])[1] || '(the wrapper spawned nothing)';
  ok(!!start && ran === STUB, `the wrapper's executable is the stub agy itself (agy-wrapper.log: spawned ${ran})`, c.wlog().split('\n').slice(-6).join(' | '));
  const want = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--print-timeout', '0', ...agyFlags({ model: 'gemini-4-argon-high', permissionMode: 'bypassPermissions' }), ...extra];
  ok(!!start && JSON.stringify(start.argv) === JSON.stringify(want), 'its argv = the wrapper\'s stream flags + agyFlags(model, mode) + the settings row\'s extra args — nothing else', start && start.argv);
  const e = (start && start.env) || {};
  ok(e.HOME === acct.dir && e.DBUS_SESSION_BUS_ADDRESS === 'disabled:', 'its env: HOME = the account\'s root, the session bus disabled (the isolated-home account reaches agy)', { HOME: e.HOME, bus: e.DBUS_SESSION_BUS_ADDRESS, root: acct.dir });
  ok(!!c.session && e.CLAUDE_WEBUI_SESSION_ID === c.id && e.VIBESPACE_SESSION_TOKEN === c.session.agentToken && e.EDITOR === path.join(BIN, 'editor-code') && e.AGY_WEBUI_BACKEND === 'antigravity'
    && e.AGY_WEBUI_MODEL === 'gemini-4-argon-high' && e.VIBESPACE_SESSION_CWD === CWD && String(e.PATH || '').startsWith(BIN + ':'),
    'its env carries the session\'s names: the id, the token, EDITOR, the cwd, the tools PATH, AGY_WEBUI_*', Object.fromEntries(['CLAUDE_WEBUI_SESSION_ID', 'EDITOR', 'AGY_WEBUI_BACKEND', 'AGY_WEBUI_MODEL', 'VIBESPACE_SESSION_CWD'].map((k) => [k, e[k]])));
  const ses = await until(() => c.journal().find((r) => r.type === 'acp' && r.kind === 'session'), 10000);
  ok(!!ses && /^[0-9a-f-]{36}$/.test(ses.sessionId), 'the conversation STARTED: agy\'s init is the journal\'s `session` record (the id a resume uses)', ses || c.journal().filter((r) => r.kind === 'notice').map((r) => r.text));

  console.log('— ② no NAME=value word on any command line of the tree, and the session token on none');
  const tok = c.session ? c.session.agentToken : '__no_token__';
  const lines = start ? { master: start.master || [], wrapper: start.wrapper || [], agy: start.self || [] } : {};
  ok(!!start && Object.values(lines).every((l) => l.length > 0), 'the stub read its wrapper\'s and its dtach master\'s command lines', Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v.length])));
  ok(!!start && Object.values(lines).every((l) => !l.some((w) => ASSIGN.test(w))), 'not one NAME=value word: the names ride the env', Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v.filter((w) => ASSIGN.test(w)).map((w) => w.split('=')[0])])));
  ok(!!start && Object.values(lines).every((l) => !l.join(' ').includes(tok)) && !c.wlog().includes(tok), 'the session token is on no command line (/proc/<pid>/cmdline is world-readable) and in no wrapper log line');
  const wl = lines.wrapper || [];
  ok(wl[1] === path.join(REPO, 'data/bin/agy-wrapper.js') && wl[4] === STUB && JSON.stringify(wl.slice(5)) === JSON.stringify(extra),
    'the wrapper\'s argv = <agy-wrapper.js> <buffer> <meta> <ONE absolute executable> + the extra args', wl.slice(1));

  console.log('— ④ THE SUBAGENT CARD through the hub: the account\'s agy store → the card frames, the sub\'s virtual session, its files');
  {
    const S = '49120000-0000-4000-8000-0000000000b1', FIXP = '9c0f0000-0000-4000-8000-0000000000a1', SG = '.system_generated';
    const FIXS = path.join(REPO, 'scripts/fixtures/agy-store');
    const cid = ses && ses.sessionId;
    // the account's store = the fixture, re-parented onto THIS conversation (agy's own init named its id)
    const store = path.join(acct.dir, '.gemini', 'antigravity-cli');
    const copy = (from, to) => { const st = fs.statSync(from); if (st.isDirectory()) { fs.mkdirSync(to, { recursive: true }); for (const n of fs.readdirSync(from)) copy(path.join(from, n), path.join(to, n.split(FIXP).join(cid))); } else fs.writeFileSync(to, fs.readFileSync(from, 'utf8').split(FIXP).join(cid)); };
    copy(path.join(FIXS, 'brain'), path.join(store, 'brain'));
    const tfile = path.join(store, 'brain', S, SG, 'logs', 'transcript.jsonl');
    const all = fs.readFileSync(tfile, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(tfile, all.slice(0, 5).join('\n') + '\n');
    // the hub's ACP consumer on the session's own pty — the frames a client gets
    const session = c.session; session.clients = new Map(); session.buffer = '';
    const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));
    const frames = [];
    const mm = new AcpMessageManager(c.id); mm.onOp((op) => frames.push({ type: 'msg', sessionId: c.id, ...op }));
    require(path.join(REPO, 'src/server/stdout/acp-events.js')).create({ engine: { noteTurnEnd() { } } }).attach(session, c.id, session.pty, {
      feedLive: (s, m) => mm.processLive(m), broadcastToSession: (s, id, f) => frames.push(f), broadcastActiveSessions() { }, readSessionMeta: () => null, writeSessionMeta() { }, updateSessionTodos() { },
    });
    const cardOf = (f) => (f.type === 'msg' && ((f.op === 'create' && f.message?.taskInfo?.subId === S && f.message) || (f.op === 'edit' && f.fields?.taskInfo?.subId === S && f.fields))) || null;
    session.pty.write(JSON.stringify({ type: 'chat-input', text: 'please start a subagent', msgId: 'm-sub' }) + '\n');
    const running = await until(() => frames.map(cardOf).find((x) => x && x.taskInfo.status === 'running'), 15000);
    ok(!!running && running.toolName === 'Agent' && running.taskInfo.agentRole === '示例评审专家' && running.taskInfo.spawnStep === 6 && /按 100 分制打分/.test(running.content[0].input.prompt) && running.status === 'pending',
      'the invoke_subagent row → THE CARD FRAMES (msg ops whose taskInfo names the sub): Agent, the role, the spawn step, the task, running', running || frames.map((f) => f.type + ':' + (f.op || '')).slice(-12));
    const live = await until(() => frames.filter((f) => f.type === 'subagent-message' && f.subId === S).length >= 6 && frames.filter((f) => f.type === 'subagent-message'), 8000);
    ok(!!live && live.every((f) => f.sessionId === c.id && f.parentToolUseId === `${cid}:6` && f.message && f.message.type === 'acp'), 'the sub\'s steps go out as `subagent-message` {parent, the card\'s row, subId, an ACP record} — the card\'s live count', live && live.slice(0, 2));
    ok(!frames.some((f) => f.type === 'msg' && f.op === 'create' && /wc -l|样例\.md/.test(JSON.stringify(f.message?.content || '')) && !f.message?.taskInfo), '…and NEVER as the parent\'s own cards (no parent card for a sub\'s read / command)');
    ok(/subagent tail on \(every 2000 ms\)/.test(c.wlog()), 'the wrapper\'s tail is ON while the sub works (every 2 s)', c.wlog().split('\n').filter((l) => /subagent/.test(l)));
    // the sub finishes in the store
    fs.appendFileSync(tfile, all.slice(5).join('\n') + '\n');
    fs.writeFileSync(path.join(store, 'brain', cid, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json'), fs.readFileSync(path.join(FIXS, 'answer.json'), 'utf8').split(FIXP).join(cid));
    const done = await until(() => frames.map(cardOf).find((x) => x && x.taskInfo.status === 'completed'), 10000);
    ok(!!done && done.status === 'complete' && /88\/100/.test(done.content[0].output) && done.taskInfo.files.join() === '/home/u/workspace/示例项目/report.md' && done.taskInfo.steps === 10,
      'the card frame ENDS with the sub: completed, its answer as the output, the file it wrote, ten steps', done && done.taskInfo);
    const off = await until(() => /subagent tail off/.test(c.wlog()), 6000);
    ok(!!off, '…and the tail is OFF (nothing reads the store after it)', c.wlog().split('\n').filter((l) => /subagent/.test(l)));
    // the virtual session: from the live buffers, then from the journal ALONE (a restart / a late viewer)
    const SUBS = require(path.join(REPO, 'src/server/acp-subagents.js'));
    const view = () => { const v = SUBS.normalizerFor(session, `sub-${S}`); v.convertHistory(session.subagentBuffers.get(S)); return v.messages; };
    const liveView = view();
    session.subagentBuffers = new Map(); session._subNormalizers = new Map();
    const holder = SUBS.seed(new Map([[c.id, session]]), S, c.id);
    const fromJournal = holder ? view() : [];
    const shape = (ms) => ms.map((m) => `${m.role}:${m.toolName || ''}:${m.status}`).join(',');
    ok(liveView.length >= 7 && liveView[0].role === 'user' && liveView.filter((m) => m.role === 'tool').length === 4 && holder === session && shape(fromJournal) === shape(liveView),
      'the virtual session sub-<id>: the task bubble, four tool cards, its last words — and the SAME timeline rebuilt from the journal alone (memory gone)', { live: shape(liveView), journal: shape(fromJournal) });
    // the files the sub wrote: a FINISHED card brings them through the descriptor's helper door
    const rows = Object.values(session._artifacts || {});
    const rep = rows.find((r) => r.path === '/home/u/workspace/示例项目/report.md');
    ok(!!rep && rep.via && rep.via.kind === 'subagent' && rep.via.name === '示例评审专家', 'the file the sub wrote joins THIS conversation\'s Artifacts rows, via the sub (the helper door read its transcript in the account\'s store)', rows.map((r) => [r.path, r.via]));
    // an OLDER agy's row (no subagent_info): no card, no error — the row ends as a row
    const before = frames.map(cardOf).filter(Boolean).length;
    session.pty.write(JSON.stringify({ type: 'chat-input', text: 'start a subagent the old way', msgId: 'm-old' }) + '\n');
    const oldRow = await until(() => frames.find((f) => f.type === 'msg' && f.op === 'edit' && f.fields?.toolStatus === 'ok' && f.fields?.content?.[0]?.output === 'Started.'), 10000);
    ok(!!oldRow && frames.map(cardOf).filter(Boolean).length === before && !frames.some((f) => f.type === 'msg' && f.op === 'create' && f.message?.status === 'error'),
      'an older agy\'s invoke_subagent (no subagent_info, its sub in no store): the row ends as a row — no new card, no error', frames.filter((f) => f.type === 'msg').slice(-4));
  }

  console.log('— ③ an unresolved agy (a bare name) through the same path: refused BY NAME, never «exit code 125»');
  const r = await create('agy-not-installed', { accountId: acct.id });
  const refusal = await until(() => r.journal().find((x) => x.type === 'acp' && x.kind === 'notice' && x.level === 'error'), 10000);
  ok(!!refusal && refusal.text === "agy-wrapper: the command is not an executable: agy-not-installed — the hub's Antigravity path is unresolved; reinstall agy or set ANTIGRAVITY_CMD",
    'the session\'s error line names the missing executable and the two ways out', refusal ? refusal.text : r.journal());
  ok(!!refusal && !r.journal().some((x) => x.kind === 'notice' && /exit code/.test(String(x.text))), '…and it is the ONLY error: no «exited (exit code …) — see agy-wrapper.log»');

  console.log('— ⑤ THE SLASH GUARD on the real path: only agy\'s own commands are held back; a line that starts with a path is SENT');
  const SENTENCE = (w) => `${w} was not sent: Antigravity answers its slash commands itself and would end this conversation if one arrived in its stream. Use the model / effort / mode menus here, or run ${w} in an Antigravity terminal session.`;
  const agyRead = (s) => { try { return fs.readFileSync(path.join(ROOT, `stdin-${s.id}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.stdin).map((x) => { try { return JSON.parse(x.stdin).message.content; } catch { return null; } }); } catch { return []; } };
  const refusals = (s) => s.journal().filter((x) => x.type === 'acp' && x.kind === 'notice' && x.noticeKind === 'slash-refused');
  const ends = (s) => s.journal().filter((x) => x.type === 'acp' && x.kind === 'prompt_end');
  let seq = 0;
  // the server's own write (session-stdout writeSessionInput): each line = the adapter's chat-input frame + '\n' on the session's
  // pty. ONE batch, one wait — the journal reaches its file on the wrapper's ~1 s flush; the wrapper takes the lines in order
  // (a command is refused at once, a text is queued behind the running turn)
  async function sayAll(s, lines, nCmd) {
    const r0 = refusals(s).length, e0 = ends(s).length;
    for (const text of lines) s.session.pty.write(s.registry.get('antigravity').formatChatInput(text, 'g' + (++seq)).stdinPayload + '\n');
    await until(() => refusals(s).length >= r0 + nCmd && ends(s).length >= e0 + lines.length - nCmd, 15000);
    return { refused: refusals(s).slice(r0), read: agyRead(s), ended: ends(s).length - e0 };
  }
  const CMDS = [['/model', '/model'], ['/usage opus', '/usage'], ['/help', '/help']];
  const ATTACH = `${CWD}/brief.zip 这里是标书，请看看`;   // _insertUploadedPaths' shape: the uploaded file's absolute path, a space, then what was typed
  const TEXTS = [ATTACH, '/home/u/x.zip 这里是…', '/tmp/a.txt', '~/x', './run.sh', '/ 2', '/2026', '/notacommand hello'];
  const c5 = await create(STUB, { accountId: acct.id });   // a FRESH session: the ④ subagent leg (lane agy-subagent-cards) shares the ① session's stdin
  await until(() => c5.journal().find((x) => x.type === 'acp' && x.kind === 'session'), 10000);
  const got = await sayAll(c5, [...CMDS.map(([l]) => l), ...TEXTS], CMDS.length);
  ok(got.refused.length === CMDS.length && CMDS.every(([l, w]) => got.refused.some((r) => r.level === 'error' && r.text === SENTENCE(w)) && !got.read.includes(l)),
    '/model, /usage opus, /help: each refused BY NAME in the product\'s sentence (the error card), and agy never read it', { refused: got.refused.map((r) => r.text.slice(0, 40)), read: got.read });
  const textBad = TEXTS.filter((l) => !got.read.includes(l));
  ok(textBad.length === 0 && got.ended === TEXTS.length && got.read.length === TEXTS.length,
    `${TEXTS.length} lines that only START with "/" or a path — the attachment's «<cwd>/brief.zip 这里是…» first — are SENT unchanged: agy read exactly each line, in order, and answered each`, { textBad, ended: got.ended, read: got.read });
  ok(JSON.stringify(got.read) === JSON.stringify(TEXTS), '…in the order they were typed (the commands left no gap and no reordering)', got.read);
  ok(!c5.journal().some((x) => x.kind === 'notice' && x.noticeKind === 'agent-exited') && c5.journal().some((x) => x.kind === 'update' && JSON.stringify(x.update || {}).includes('brief.zip')),
    '…the conversation lives on: no «Antigravity ended this session (exit 2)», agy\'s reply names the attachment\'s path', c5.journal().filter((x) => x.kind === 'notice').map((x) => x.text));
  // RED CONTROL = the 2.369.340 guard: a wrapper copy (beside a link to src/, where it reads the slash list) whose test is the
  // base's first character — the same attachment message, through the same create path
  const W_SRC = fs.readFileSync(path.join(REPO, 'data/bin/agy-wrapper.js'), 'utf8');
  const GUARD = "  const word = agySlashCommand(text);\n  if (!word) return false;\n";
  const BASE_GUARD = "  const t = String(text || '').trimStart();\n  if (!/^\\/[A-Za-z]/.test(t)) return false;\n  const word = (t.match(/^\\/[\\w:-]+/) || ['/'])[0];\n";
  const RED = path.join(ROOT, 'red');
  fs.mkdirSync(path.join(RED, 'data/bin'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'src'), path.join(RED, 'src'));
  fs.writeFileSync(path.join(RED, 'data/bin/agy-wrapper.js'), W_SRC.replace(GUARD, BASE_GUARD));
  const b = await create(STUB, { accountId: acct.id }, path.join(RED, 'data/bin'));
  await until(() => b.journal().find((x) => x.type === 'acp' && x.kind === 'session'), 10000);
  const red = await sayAll(b, ['/home/u/x.zip 这里是…'], 1);
  ok(W_SRC.includes(GUARD) && red.refused.length === 1 && red.refused[0].text === SENTENCE('/home') && red.read.length === 0,
    'RED CONTROL (the base guard): the attachment message is refused as the command «/home» — the owner\'s words — and agy never reads it', red);
} finally {
  for (const sock of masters) for (const pid of pidsOnSocket(sock)) { try { process.kill(pid, 'SIGTERM'); } catch { } }
  await sleep(400);
  for (const sock of masters) for (const pid of pidsOnSocket(sock)) { try { process.kill(pid, 'SIGKILL'); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
