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
// RED CONTROL = the base tree (2.369.336 cut 23d3ce4d): the stub never runs, and the wrapper's log says it ran
// /usr/bin/env.
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
async function create(agyCommand, data) {
  const registry = createAdapterRegistry({
    chatWrapper: path.join(REPO, 'data/bin/chat-wrapper.js'), codexChatWrapper: path.join(REPO, 'data/bin/codex-chat-wrapper.js'),
    acpWrapper: path.join(REPO, 'data/bin/acp-wrapper.js'), acpCommands: { antigravity: agyCommand },
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
  return { sent, id, session, journal, wlog };
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

  console.log('— ③ an unresolved agy (a bare name) through the same path: refused BY NAME, never «exit code 125»');
  const r = await create('agy-not-installed', { accountId: acct.id });
  const refusal = await until(() => r.journal().find((x) => x.type === 'acp' && x.kind === 'notice' && x.level === 'error'), 10000);
  ok(!!refusal && refusal.text === "agy-wrapper: the command is not an executable: agy-not-installed — the hub's Antigravity path is unresolved; reinstall agy or set ANTIGRAVITY_CMD",
    'the session\'s error line names the missing executable and the two ways out', refusal ? refusal.text : r.journal());
  ok(!!refusal && !r.journal().some((x) => x.kind === 'notice' && /exit code/.test(String(x.text))), '…and it is the ONLY error: no «exited (exit code …) — see agy-wrapper.log»');
} finally {
  for (const sock of masters) for (const pid of pidsOnSocket(sock)) { try { process.kill(pid, 'SIGTERM'); } catch { } }
  await sleep(400);
  for (const sock of masters) for (const pid of pidsOnSocket(sock)) { try { process.kill(pid, 'SIGKILL'); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
