#!/usr/bin/env node
// AGENT BROWSER P0 r5 — WHAT SURVIVES A HEADLESS RESTART AND A KILL
// (docs/design-agent-browser-v2.zh.md §3.2.1 + D1; the round-4 verifier's two
// MEDIUM findings, each reproduced on a real worktree server before the fix).
//
// TWO PROMISES THE PRODUCT MADE THAT ONLY A REAL SERVER CAN CHECK:
//
//   ① D1's degrade notice reaches the user EVEN WHEN NOBODY WAS CONNECTED AT
//     BOOT. The systemd / `update.sh` restart shape is exactly that: the boot
//     probe fires at +3 s into an empty `wss.clients`, and round 4 latched
//     `floorAnnounced = true` BEFORE `serverNotice` said whether anyone got it
//     — so the notice was broadcast to nobody and never retried for the life
//     of the process (measured: a client connecting at Ready+6.3 s received
//     ZERO server-notice frames while the journal carried the line). The
//     manual's "the user has already been told" was untrue. Now the latch is
//     the DELIVERY, and the next client to connect is asked again.
//   ② §3.2.1's `conversation` rung fires across the product's OWN Terminate →
//     Resume. `priorKeyFor` read only `data/session-meta`, and both the kill
//     path and the pty-exit path UNLINK that file — so every resume of a
//     stopped conversation minted a NEW key (`resume-unknown` on every resume,
//     the previous namespace's daemon + chromium orphaned until the idle
//     timeout). The binding now lives in a store that outlives the webui
//     session (`data/browser-env/bindings.json`, written at the ONE meta choke
//     point), consulted first.
//
// FAST TIER, and deterministic: a free port, a scratch worktree with its own
// data/, a scratch HOME (a spawned server can only discover what lives under
// its own home — 2026-09-09's 79,533-row lesson), a FAKE `agent-browser` on
// PATH that reports 0.30.0 (no browser is ever launched; the floor probe is
// `--version` only), and a FAKE `claude` on CLAUDE_CMD (a shell that sleeps —
// no CLI, no vendor call, no transcript; the browser key is decided BEFORE the
// spawn, which is the whole reason this can be measured without one).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const { fixtureLitter } = require('../src/fixture-guard.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const done = () => {
  console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
  process.exit(fail ? 1 : 0);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('browser-cont');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const fakeHome = scratchHome('browser-cont-home', fs);
// THE REAL HOME IS CENSUSED, NOT TRUSTED (the 2026-09-09 lesson): nothing here
// writes a transcript — the fake claude is a shell that sleeps — but a suite
// that boots a server owes the proof, so the real ~/.claude/projects is listed
// before and diffed after, through the sweeper's own rule.
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const wt = path.join(ROOT, 'wt');
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN, { recursive: true });
// The fake binaries. `agent-browser --version` is the ONLY thing the product
// runs against the browser CLI at boot; a version below the floor is the
// finding's shape. `claude` just has to be a process the pty can hold — and in
// CHAT mode (the wrapper adds `--output-format stream-json`, the only mode
// whose stdout is parsed) it announces a DIFFERENT conversation id one second
// after it starts: claude's IMPLICIT fork on a locked resume (2.219.0), the
// r7 shape of §③. A random id, not the `e2e00000-…` fixture family — no
// transcript is ever written under it. It prints the real CLI's FIRST TWO
// lines — a `system/hook_started` that already carries the session id, then
// the init frame — because dtach's attach preamble (`\e[H\e[J`, no newline)
// is glued onto whatever the wrapper relays first and the consumer parses
// that glued line as noise: with the real CLI the second id-bearing line
// adopts; a one-line fake lost its only record (measured: session A survived
// only because a stdin write's `_stdin_ack` absorbed the preamble first, B
// and C had no such write). The wrapper drops empty and non-JSON child lines,
// so the sacrificial line has to be a real record.
fs.writeFileSync(path.join(BIN, 'agent-browser'), '#!/bin/sh\ncase "$1" in --version) echo "agent-browser 0.30.0";; *) echo "fake agent-browser: $*" >&2; exit 1;; esac\n', { mode: 0o755 });
const ANNOUNCED_ID = crypto.randomUUID();
const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: ANNOUNCED_ID, hook_name: 'SessionStart' });
const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: ANNOUNCED_ID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nexec sleep 600\n`, { mode: 0o755 });

let srv = null;
const cleanup = () => {
  try { srv?.kill('SIGKILL'); } catch { }
  try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

if (!fs.existsSync('/proc/self/environ')) { console.log('\nbrowser continuity'); skip('no /proc — the spawned session\'s environment cannot be read back'); done(); }
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!dtachOk) { console.log('\nbrowser continuity'); skip('dtach is not installed — a local terminal session cannot be created here'); done(); }

const PORT = await freePort();
execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
// Overlay the WORKING TREE (a worktree checks out HEAD, so a pre-commit run
// would otherwise test the previous release). data/ stays the worktree's own.
for (const f of ['src', 'public', 'server.js', 'package.json']) {
  execFileSync('rm', ['-rf', path.join(wt, f)]);
  execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

let journal = '';
const baseEnv = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude') };
for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
srv = spawn('node', ['server.js'], {
  cwd: wt,
  env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stdout.on('data', (d) => { journal += d; });
srv.stderr.on('data', (d) => { journal += d; });
const readyAt = await new Promise((res, rej) => {
  const t = setInterval(() => { if (journal.includes('Ready.')) { clearInterval(t); res(Date.now()); } }, 50);
  setTimeout(() => { clearInterval(t); rej(new Error('boot timeout\n' + journal.slice(-1200))); }, 40000);
}).catch((e) => { ok(false, 'setup: ' + e.message); done(); });

const { WebSocket } = await import('ws');
const connect = async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return { ws, msgs };
};
const NOTICE_RE = /\[notice\] Your agent-browser is too old for shared profiles — 0\.30\.0 is installed/g;
const noticeLines = () => (journal.match(NOTICE_RE) || []).length;

// ═══ ① the floor notice after a HEADLESS boot ═══════════════════════════════
console.log('\n① the D1 degrade notice reaches the first client to connect after a headless boot');
{
  // The boot probe fires ~3 s after the ws handler registered, into an empty
  // client set. Wait for its journal line FIRST — that is the control that the
  // shape under test is the headless one (the server said it to nobody).
  const said = await until(() => noticeLines() >= 1, 15000);
  ok(said, `the server journalled the too-old notice with NO client connected (${noticeLines()} line(s), ${Math.round(Date.now() - readyAt)} ms after Ready)`);
  const a = await connect();
  const got = await until(() => a.msgs.some((m) => m.type === 'server-notice' && m.key === 'agent-browser-floor'), 4000);
  const frame = a.msgs.find((m) => m.type === 'server-notice' && m.key === 'agent-browser-floor');
  ok(got, `THE FINDING: a client connecting ${Math.round(Date.now() - readyAt)} ms after Ready receives the notice (${frame ? JSON.stringify(frame.text).slice(0, 90) + '…' : 'ZERO server-notice frames — the latch was set before anyone was there'})`);
  ok(!!frame && /too old for shared profiles/.test(frame.text) && /isolation is on and working/.test(frame.text), 'and it is the honest sentence (names the floor, says what still works)');
  // NEGATIVE CONTROL: the retry is not a nag loop — once DELIVERED, a later
  // client is not told again (serverNotice burns the key, and the resolver's
  // latch is now the delivery itself).
  const b = await connect();
  await sleep(1200);
  ok(!b.msgs.some((m) => m.type === 'server-notice' && m.key === 'agent-browser-floor'), 'NEGATIVE CONTROL: a second client, connecting after the delivery, is NOT told again (one honest notice, not one per connection)');
  try { a.ws.close(); b.ws.close(); } catch { }
}

// ═══ ② the conversation keeps its browser key across Terminate → Resume ═════
console.log('\n② Terminate → Resume of one conversation keeps ONE browser key (§3.2.1)');
{
  // A random conversation id, NOT the `e2e00000-…` fixture family: that family
  // exists so production readers refuse a synthetic TRANSCRIPT by name, and
  // this suite writes none — the id lives only in the scratch worktree's
  // data/ (session-meta, bindings.json) and in the fake claude's argv.
  const sid = crypto.randomUUID();
  const { ws, msgs } = await connect();
  const metaDir = path.join(wt, 'data', 'session-meta');
  const metaFor = (conv) => {
    for (const f of (fs.existsSync(metaDir) ? fs.readdirSync(metaDir) : [])) {
      if (!f.endsWith('.json')) continue;
      try { const m = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8')); if (m.claudeSessionId === conv) return { file: f, meta: m }; } catch { }
    }
    return null;
  };
  const create = async (reqId, extra = {}) => {
    const before = msgs.filter((m) => m.type === 'created').length;
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'terminal', cwd: ROOT, cols: 80, rows: 24, reqId, resume: true, resumeId: sid, ignoreNoConvo: true, ...extra }));
    await until(() => msgs.filter((m) => m.type === 'created').length > before || msgs.some((m) => m.type === 'error' && m.reqId === reqId), 20000);
    const err = msgs.find((m) => m.type === 'error' && m.reqId === reqId) || null;
    const made = msgs.filter((m) => m.type === 'created');
    return { err, created: made.length > before ? made[made.length - 1] : null };
  };
  const unknownLines = () => (journal.match(new RegExp(`\\[browser\\] sess-\\d+-\\d+: resuming ${sid.slice(0, 8)} but no previous browser key was recorded`, 'g')) || []).length;
  const envOf = (webuiId) => {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      let e; try { e = fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { continue; }
      if (!e.includes(`CLAUDE_WEBUI_SESSION_ID=${webuiId}`)) continue;
      return Object.fromEntries(e.split('\0').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
    }
    return null;
  };

  const c1 = await create('r1');
  if (ok(!c1.err && !!c1.created, `session 1 created as a RESUME of ${sid} (${c1.err ? 'error: ' + JSON.stringify(c1.err).slice(0, 160) : c1.created?.sessionId})`)) {
    const s1 = c1.created.sessionId;
    await until(() => !!metaFor(sid)?.meta?.browserKey, 5000);
    const m1 = metaFor(sid);
    const k1 = m1?.meta?.browserKey || '';
    ok(/^bk-[0-9a-f]{8}$/.test(k1), `session-meta ${m1?.file} records browserKey ${k1} for the conversation`);
    // POSITIVE CONTROL for the journal line: the FIRST resume of a conversation
    // nobody has seen before IS a resume-unknown, and the server says so. Its
    // absence on the second create below is therefore a measurement.
    ok(unknownLines() === 1, `the first resume of a never-seen conversation says \`resume-unknown\` once (${unknownLines()} line(s)) — the control that the line is observable`);
    await until(() => !!envOf(s1)?.AGENT_BROWSER_SESSION, 5000);
    const e1 = envOf(s1);
    ok(e1?.AGENT_BROWSER_SESSION === 'vs-' + k1, `and the spawned process really carries AGENT_BROWSER_SESSION=vs-${k1}`);

    // Terminate — the product's own kill path, which UNLINKS the meta file.
    ws.send(JSON.stringify({ type: 'kill', sessionId: s1 }));
    const killed = await until(() => msgs.some((m) => m.type === 'killed' && m.sessionId === s1), 10000);
    const kf = msgs.find((m) => m.type === 'killed' && m.sessionId === s1);
    ok(killed && kf?.ok === true, `session 1 killed through the ws kill path (${JSON.stringify(kf)})`);
    const gone = await until(() => !metaFor(sid), 5000);
    ok(gone, 'the kill path really unlinked the session-meta file (the shape the finding named: nothing under data/session-meta names this conversation now)');
    await until(() => !envOf(s1), 5000);

    // Resume the SAME conversation.
    const c2 = await create('r2');
    if (ok(!c2.err && !!c2.created && c2.created.sessionId !== s1, `session 2 created as a resume of the same conversation (${c2.err ? 'error: ' + JSON.stringify(c2.err).slice(0, 160) : c2.created?.sessionId})`)) {
      const s2 = c2.created.sessionId;
      await until(() => !!metaFor(sid)?.meta?.browserKey, 5000);
      const k2 = metaFor(sid)?.meta?.browserKey || '';
      ok(k2 === k1, `THE FINDING: the resumed conversation keeps its browser key (${k2} vs ${k1}) — no orphaned namespace, daemon or chromium per resume`);
      ok(unknownLines() === 1, `and the second create did NOT say \`resume-unknown\` (${unknownLines()} line(s) in total: the rung fired)`);
      await until(() => !!envOf(s2)?.AGENT_BROWSER_SESSION, 5000);
      const e2 = envOf(s2);
      ok(e2?.AGENT_BROWSER_SESSION === 'vs-' + k1, `and session 2's process carries the SAME AGENT_BROWSER_SESSION=vs-${k1} (${e2?.AGENT_BROWSER_SESSION || 'none'}) — the browser identity survived the product's own Terminate → Resume`);
      // The durable store is the reason: it names the conversation after the
      // meta file is gone, and it names it ONCE (the second create re-recorded
      // the same key, not a new entry).
      const bindF = path.join(wt, 'data', 'browser-env', 'bindings.json');
      let bind = null; try { bind = JSON.parse(fs.readFileSync(bindF, 'utf8')); } catch { }
      ok(!!bind && bind.byConversation?.[sid]?.key === k1, `data/browser-env/bindings.json binds ${sid.slice(0, 8)}… → ${k1} (the record that outlives the webui session)`);
      ws.send(JSON.stringify({ type: 'kill', sessionId: s2 }));
      await until(() => msgs.some((m) => m.type === 'killed' && m.sessionId === s2), 10000);
      await until(() => !metaFor(sid), 5000);
      await until(() => !envOf(s2), 5000);

      // ═══ THE FORK LEG (r6 — the round-5 verifier's HIGH, reproduced here on
      // the unfixed tree before the fix: bindings[X] moved to the fork's key
      // within 500 ms of the fork's create, and the parent's next resume
      // carried the FORK's AGENT_BROWSER_SESSION). ═══
      // A claude fork is created with claudeSessionId = the PARENT's id (the
      // fork's own id is announced by the CLI's init frame, later — in this
      // fixture, never) and it mints a NEW browser key (D15). Its FIRST meta
      // write therefore carries {claudeSessionId: <parent>, browserKey: <fork
      // key>}, and the choke point's r5 hook bound the PARENT conversation to
      // the FORK's browser: two conversations on one browser (`close --all`
      // from either closes the other's tabs — the incident P0 exists to stop,
      // D15 reversed), the parent's own daemon + chromium orphaned under its
      // old namespace, and NOT ONE journal line, because rung 1 then answered
      // confidently. The record now SAYS which conversation it was forked
      // from (`forkSourceId`), and a record never binds that id.
      const bindingOf = () => { try { return JSON.parse(fs.readFileSync(bindF, 'utf8')).byConversation?.[sid]?.key || ''; } catch { return ''; } };
      const cf = await create('f1', { fork: true });
      if (ok(!cf.err && !!cf.created && cf.created.sessionId !== s2, `a FORK of ${sid.slice(0, 8)} created (${cf.err ? 'error: ' + JSON.stringify(cf.err).slice(0, 160) : cf.created?.sessionId})`)) {
        const sf = cf.created.sessionId;
        // The fork's meta names the PARENT's conversation id until an init
        // frame adopts the fork's own — the fake claude never sends one, so
        // this is the window the incident lived in, held open.
        await until(() => !!metaFor(sid)?.meta?.browserKey, 5000);
        const mf = metaFor(sid);
        const kf = mf?.meta?.browserKey || '';
        ok(/^bk-[0-9a-f]{8}$/.test(kf) && kf !== k1, `the fork minted its OWN key ${kf} ≠ ${k1} (D15) while its meta still names the parent's conversation id — the shape that bound the parent to it`);
        ok(mf?.meta?.forkSourceId === sid, `and the record SAYS which conversation it was forked from (forkSourceId=${String(mf?.meta?.forkSourceId).slice(0, 8)}) — the fact the choke point asks`);
        await until(() => !!envOf(sf)?.AGENT_BROWSER_SESSION, 5000);
        const ef = envOf(sf);
        ok(ef?.AGENT_BROWSER_SESSION === 'vs-' + kf && ef?.AGENT_BROWSER_SESSION !== 'vs-' + k1, `the fork's process carries AGENT_BROWSER_SESSION=vs-${kf}, not the parent's (${ef?.AGENT_BROWSER_SESSION || 'none'})`);
        await sleep(800); // the pre-fix overwrite landed within 500 ms of the create (measured)
        ok(bindingOf() === k1, `THE FINDING: bindings.json STILL binds the parent ${sid.slice(0, 8)}… → ${k1} (now: ${bindingOf() || 'nothing'}) — the fork's meta writes did not re-bind the parent`);
        ok(!/refused to move the browser binding/.test(journal), 'and it was the choke-point rule that held, not the store\'s belt (no refusal line in the journal — the belt is the second layer, driven in test-browser-profiles §⑳)');
        ws.send(JSON.stringify({ type: 'kill', sessionId: sf }));
        await until(() => msgs.some((m) => m.type === 'killed' && m.sessionId === sf), 10000);
        await until(() => !metaFor(sid), 5000);
        await until(() => !envOf(sf), 5000);

        // Resume the PARENT after the fork: its own key, its own browser.
        const c3 = await create('r3');
        if (ok(!c3.err && !!c3.created, `session 3 created as a resume of the parent after the fork (${c3.err ? 'error: ' + JSON.stringify(c3.err).slice(0, 160) : c3.created?.sessionId})`)) {
          const s3 = c3.created.sessionId;
          await until(() => !!metaFor(sid)?.meta?.browserKey, 5000);
          const k3 = metaFor(sid)?.meta?.browserKey || '';
          ok(k3 === k1, `THE FINDING, the parent's side: resuming the parent after a fork lands on the parent's OWN key (${k3} vs ${k1}), never the fork's ${kf}`);
          await until(() => !!envOf(s3)?.AGENT_BROWSER_SESSION, 5000);
          const e3 = envOf(s3);
          ok(e3?.AGENT_BROWSER_SESSION === 'vs-' + k1, `and its process carries AGENT_BROWSER_SESSION=vs-${k1} (${e3?.AGENT_BROWSER_SESSION || 'none'}) — not the fork's namespace`);
          ok(unknownLines() === 1, `still exactly one \`resume-unknown\` line for the conversation (${unknownLines()}) — the fork neither re-minted the parent nor made its resume look unknown`);
          const seen = new Set([e1?.AGENT_BROWSER_SESSION, e2?.AGENT_BROWSER_SESSION, e3?.AGENT_BROWSER_SESSION]);
          ok(seen.size === 1 && seen.has('vs-' + k1), `across all three carriers of the parent conversation exactly ONE namespace was ever spawned (${[...seen].join(', ')}) — no third namespace for a daemon to be orphaned under`);
          ws.send(JSON.stringify({ type: 'kill', sessionId: s3 }));
          await until(() => msgs.some((m) => m.type === 'killed' && m.sessionId === s3), 10000);
          await until(() => !metaFor(sid), 5000);
        }
      }
    }
  }
  try { ws.close(); } catch { }
}

// ═══ ③ the IMPLICIT fork (r7): a resume whose CLI announces a DIFFERENT id ═══
console.log('\n③ a resume whose CLI announces a DIFFERENT conversation id (the implicit fork) never binds that id to the resumed conversation\'s key (r7)');
{
  // A `claude --resume X` whose conversation is LOCKED by another live claude
  // silently forks to a NEW id Y (claude's own double-writer protection) and
  // the stream consumer ADOPTS it (2.219.0: claudeSessionId ← Y, forkedFrom ←
  // [X]). The record then names Y beside the key that was decided for X, and
  // r6's rule — "is this the conversation you were forked FROM" — bound Y to
  // X's key: two conversations on one browser for ever, no fork flag, no
  // journal line (the round-6 verifier's MEDIUM). The origin write now states
  // `browserKeyFor` = X, the choke point binds nothing for Y and SAYS so once,
  // and Y's next resume mints its own key. Chat mode, because only chat
  // stdout is parsed; the fake claude announces ANNOUNCED_ID after 1 s.
  const X = crypto.randomUUID(), Y = ANNOUNCED_ID;
  const { ws, msgs } = await connect();
  const metaDir = path.join(wt, 'data', 'session-meta');
  const metaFor = (conv) => {
    for (const f of (fs.existsSync(metaDir) ? fs.readdirSync(metaDir) : [])) {
      if (!f.endsWith('.json')) continue;
      try { const m = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8')); if (m.claudeSessionId === conv) return { file: f, meta: m }; } catch { }
    }
    return null;
  };
  const metaOf = (conv, webuiId) => { const m = metaFor(conv); return m && m.meta.webuiSessionId === webuiId ? m : null; };
  const bindF = path.join(wt, 'data', 'browser-env', 'bindings.json');
  const bindingOf = (conv) => { try { return JSON.parse(fs.readFileSync(bindF, 'utf8')).byConversation?.[conv]?.key || ''; } catch { return ''; } };
  const envOf = (webuiId) => {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      let e; try { e = fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { continue; }
      if (!e.includes(`CLAUDE_WEBUI_SESSION_ID=${webuiId}`)) continue;
      return Object.fromEntries(e.split('\0').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
    }
    return null;
  };
  const create = async (reqId, resumeId) => {
    const before = msgs.filter((m) => m.type === 'created').length;
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, resume: true, resumeId, ignoreNoConvo: true }));
    await until(() => msgs.filter((m) => m.type === 'created').length > before || msgs.some((m) => m.type === 'error' && m.reqId === reqId), 20000);
    const err = msgs.find((m) => m.type === 'error' && m.reqId === reqId) || null;
    const made = msgs.filter((m) => m.type === 'created');
    return { err, created: made.length > before ? made[made.length - 1] : null };
  };
  const killAndWait = async (webuiId, conv) => {
    ws.send(JSON.stringify({ type: 'kill', sessionId: webuiId }));
    await until(() => msgs.some((m) => m.type === 'killed' && m.sessionId === webuiId), 10000);
    const gone = await until(() => !metaOf(conv, webuiId), 8000);
    ok(gone, `${webuiId} killed and its session-meta unlinked`);
    await until(() => !envOf(webuiId), 5000);
  };
  const unknownLines = (conv) => (journal.match(new RegExp(`\\[browser\\] sess-\\d+-\\d+: resuming ${conv.slice(0, 8)} but no previous browser key was recorded`, 'g')) || []).length;
  const implicitLines = () => (journal.match(new RegExp(`\\[browser\\] cw-\\d+-\\d+: the harness announced conversation ${Y.slice(0, 8)} while its browser key bk-[0-9a-f]{8} was decided for ${X.slice(0, 8)}`, 'g')) || []).length;

  const c1 = await create('i1', X);
  if (ok(!c1.err && !!c1.created, `session A created as a CHAT resume of ${X.slice(0, 8)}… (${c1.err ? 'error: ' + JSON.stringify(c1.err).slice(0, 160) : c1.created?.sessionId})`)) {
    const sA = c1.created.sessionId;
    // The origin write lands before the fake announces (1 s); the adoption
    // write then re-names the record. Either record carries the key.
    await until(() => !!(metaFor(X) || metaFor(Y))?.meta?.browserKey, 8000);
    const kX = (metaFor(X) || metaFor(Y))?.meta?.browserKey || '';
    ok(/^bk-[0-9a-f]{8}$/.test(kX), `the resume of a never-seen conversation minted ${kX} for ${X.slice(0, 8)}… (resume-unknown lines for it: ${unknownLines(X)})`);
    const adopted = await until(() => !!metaOf(Y, sA), 8000);
    const mY = metaOf(Y, sA);
    ok(adopted && !!mY, `the consumer ADOPTED the announced id: a session-meta now names ${Y.slice(0, 8)}… (${mY?.file || 'none'}) — the implicit-fork shape, reproduced through the real stream consumer`);
    ok(Array.isArray(mY?.meta?.forkedFrom) && mY.meta.forkedFrom.includes(X) && !mY.meta.forkSourceId, `and its record says forkedFrom=[${X.slice(0, 8)}…] with NO forkSourceId (this was a resume, not a fork — r6's rule cannot see it)`);
    ok(mY?.meta?.browserKey === kX && mY?.meta?.browserKeyFor === X, `the adopted record still carries key ${kX} AND states browserKeyFor=${String(mY?.meta?.browserKeyFor).slice(0, 8)}… — the conversation the key was DECIDED for (r7's fact, spread forward by the adoption write)`);
    await sleep(800); // the pre-fix bind landed on the adoption write, within the same second
    ok(bindingOf(X) === kX, `bindings.json binds the RESUMED conversation ${X.slice(0, 8)}… → ${kX}`);
    ok(bindingOf(Y) === '', `THE FINDING: the ANNOUNCED conversation ${Y.slice(0, 8)}… is NOT bound to ${kX} (now: ${bindingOf(Y) || 'nothing'}) — two conversations do not share one browser for ever`);
    ok(implicitLines() === 1, `and the choke point SAID it, once (${implicitLines()} line): the harness announced ${Y.slice(0, 8)} while its key was decided for ${X.slice(0, 8)}`);
    ok(!/refused to move the browser binding|refused to bind conversation/.test(journal), 'it was the choke-point rule that held, not the store\'s belt (no refusal line)');
    await until(() => !!envOf(sA)?.AGENT_BROWSER_SESSION, 5000);
    const eA = envOf(sA);
    ok(eA?.AGENT_BROWSER_SESSION === 'vs-' + kX, `HONEST BOUNDARY: the running process keeps the browser it spawned with (AGENT_BROWSER_SESSION=${eA?.AGENT_BROWSER_SESSION || 'none'}) — a spawn env is immutable; the fix is that nothing outlives it`);
    await killAndWait(sA, Y);

    // Resume the ANNOUNCED conversation: it gets its OWN key (resume-unknown,
    // said out loud), never X's — the fake announces Y again, which is its own
    // id, so nothing is adopted.
    const c2 = await create('i2', Y);
    if (ok(!c2.err && !!c2.created, `session B created as a resume of the announced conversation ${Y.slice(0, 8)}… (${c2.err ? 'error: ' + JSON.stringify(c2.err).slice(0, 160) : c2.created?.sessionId})`)) {
      const sB = c2.created.sessionId;
      await until(() => !!metaOf(Y, sB)?.meta?.browserKey, 8000);
      const kY = metaOf(Y, sB)?.meta?.browserKey || '';
      ok(/^bk-[0-9a-f]{8}$/.test(kY) && kY !== kX, `THE FINDING, the other side: ${Y.slice(0, 8)}… minted its OWN key ${kY} ≠ ${kX} — it never inherited ${X.slice(0, 8)}…'s cookies`);
      ok(unknownLines(Y) === 1, `and said \`resume-unknown\` once for it (${unknownLines(Y)}) — the honest line, not a silent inheritance`);
      ok(metaOf(Y, sB)?.meta?.browserKeyFor === Y, 'its record states browserKeyFor = itself');
      ok(await until(() => metaOf(Y, sB)?.meta?.sawFirstId === true, 8000), `session B's consumer saw its first id line (sawFirstId persisted: ${metaOf(Y, sB)?.meta?.sawFirstId})`);
      await until(() => !!envOf(sB)?.AGENT_BROWSER_SESSION, 5000);
      ok(envOf(sB)?.AGENT_BROWSER_SESSION === 'vs-' + kY, `and its process carries AGENT_BROWSER_SESSION=vs-${kY}`);
      await sleep(500);
      ok(bindingOf(Y) === kY && bindingOf(X) === kX, `bindings.json: ${Y.slice(0, 8)}… → ${kY}, ${X.slice(0, 8)}… → ${kX} — one key per conversation`);
      await killAndWait(sB, Y);

      // Resume X again: the fake announces Y AGAIN (the lock is still there in
      // this fixture). X keeps its key, Y keeps its own — the rule refuses
      // before the belt ever sees a move.
      const c3 = await create('i3', X);
      if (ok(!c3.err && !!c3.created, `session C created as a second resume of ${X.slice(0, 8)}… (${c3.err ? 'error: ' + JSON.stringify(c3.err).slice(0, 160) : c3.created?.sessionId})`)) {
        const sC = c3.created.sessionId;
        if (!ok(await until(() => !!metaOf(Y, sC), 8000), `session C adopted the announced id too (${metaOf(Y, sC)?.file || 'no meta names it'})`)) {
          // Diagnostics for a red: what the server said, what the meta dir holds, what the fake printed.
          console.log('    journal tail:\n' + journal.split('\n').slice(-40).map((l) => '      ' + l.slice(0, 220)).join('\n'));
          for (const f of (fs.existsSync(metaDir) ? fs.readdirSync(metaDir) : [])) { try { const m = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8')); console.log(`    meta ${f}: webui=${m.webuiSessionId} claude=${String(m.claudeSessionId).slice(0, 8)} key=${m.browserKey} for=${String(m.browserKeyFor).slice(0, 8)} sawFirstId=${m.sawFirstId} resumeSpawn=${m.resumeSpawn}`); } catch { } }
          const bufDir = path.join(wt, 'data', 'session-buffers');
          for (const f of (fs.existsSync(bufDir) ? fs.readdirSync(bufDir) : [])) { if (!f.includes(sC.replace(/^sess-/, '')) && f !== 'chat-wrapper.log') continue; try { console.log(`    buffer ${f}: ` + fs.readFileSync(path.join(bufDir, f), 'utf8').slice(-900).replace(/\n/g, ' | ')); } catch { } }
          const sock = 'cw-' + sC.replace(/^sess-/, '');
          for (const d of fs.readdirSync('/proc')) {
            if (!/^\d+$/.test(d)) continue;
            let c; try { c = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { continue; }
            if (!c.includes(sock)) continue;
            let st = ''; try { st = fs.readFileSync(`/proc/${d}/stat`, 'utf8').split(') ').pop().split(' ').slice(0, 2).join(' '); } catch { }
            console.log(`    proc ${d} [${st}]: ${c.slice(0, 200)}`);
          }
          const before = msgs.length;
          ws.send(JSON.stringify({ type: 'attach', sessionId: sC }));
          await until(() => msgs.slice(before).some((m) => m.type === 'attached' && m.sessionId === sC), 5000);
          const att = msgs.slice(before).find((m) => m.type === 'attached' && m.sessionId === sC);
          console.log(`    attached: ${att ? JSON.stringify({ keys: Object.keys(att), messages: att.messages?.length, buffer: (att.buffer || '').length, chatStatus: att.chatStatus }).slice(0, 400) : 'NO REPLY'}`);
        }
        await until(() => implicitLines() >= 2, 3000);
        await until(() => !!envOf(sC)?.AGENT_BROWSER_SESSION, 5000);
        ok(envOf(sC)?.AGENT_BROWSER_SESSION === 'vs-' + kX, `the second resume of ${X.slice(0, 8)}… spawned on its OWN key again (${envOf(sC)?.AGENT_BROWSER_SESSION || 'none'})`);
        ok(unknownLines(X) === 1, `exactly one \`resume-unknown\` line for ${X.slice(0, 8)}… in its whole life (${unknownLines(X)})`);
        await sleep(800);
        ok(bindingOf(X) === kX && bindingOf(Y) === kY, `after a second implicit fork both bindings are unchanged (${X.slice(0, 8)}… → ${bindingOf(X)}, ${Y.slice(0, 8)}… → ${bindingOf(Y)})`);
        ok(implicitLines() === 2 && !/refused to move the browser binding|refused to bind conversation/.test(journal), `the choke point said it once more for the new session (${implicitLines()} lines) and the belt was never reached`);
        await killAndWait(sC, Y);
      }
    }
  }
  try { ws.close(); } catch { }
}

// ═══ ④ the fixture left nothing under the real home ════════════════════════
console.log('\n④ hygiene: the server and its sessions ran under the fixture HOME');
{
  let srvHome = null;
  try { srvHome = (fs.readFileSync(`/proc/${srv.pid}/environ`, 'utf8').split('\0').find((kv) => kv.startsWith('HOME=')) || '').slice(5); } catch { }
  ok(srvHome === fakeHome, `the server process's HOME is the scratch one (${srvHome}) — a spawned server discovers only what lives under its own home, so nothing here can reach the developer's ~/.claude`);
  ok(String(fakeHome).startsWith(scratch('browser-cont-home')), 'and it is a vs- fixture path every production reader refuses by name');
  // The per-suite census over the REAL home, through the sweeper's own rule
  // (no grace: these entries are diffed against the pre-run listing).
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(lit.offenders.length === 0, `the REAL ~/.claude/projects gained no fixture entry during this run (${added.length} new entries, ${lit.offenders.length} offenders)`);
}

done();
