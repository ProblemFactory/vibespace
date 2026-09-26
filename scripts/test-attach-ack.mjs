#!/usr/bin/env node
// attach-ack proof-of-life contract (2.234.1, userL mass false-death
// incident): EVERY ws attach — real, sub-, or nonexistent id — must get a
// synchronous attach-ack BEFORE the (possibly slow) attached/error reply, so
// the client can tell "server alive and processing" from "server gone" and
// stop declaring live sessions dead on slow replies.
//
// NOTHING HERE IS MACHINE-GLOBAL (2026-09-07 round 2). This suite used to bind
// a fixed :3991 and check its worktree out at a fixed /tmp/vs-ack-smoke — which
// it FORCE-REMOVED first. On a box hosting ~160 checkouts of this repo driven
// by parallel agents that is not a fixture, it is a weapon: a second run of any
// gate deleted the first run's checkout mid-suite, and the loser's red blocked
// a push. (Three more suites share :3991 and four share :3989; the heavy tier's
// machine lock in scripts/ci.mjs keeps THEM serial. This one is fixed at the
// source because it is the destructive one.) The rule is asserted for the whole
// fast tier by test-ci-gate §6 via ci.mjs `machineGlobalFixtures`.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, scratchHome, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = await freePort();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ack-smoke-'));
const wt = path.join(tmpRoot, 'wt');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

// perf lane chunk D: the resume-by-seq legs need ONE live chat session — a stub
// `claude` (prints its stream-json init, idles on stdin) under the real
// chat-wrapper, in a FAKE home (never the real ~/.claude) and a scratch cwd
const fakeHome = scratchHome('ack-home', fs);
const sessCwd = scratch('ack-cwd'); fs.mkdirSync(sessCwd, { recursive: true });
const stub = scratch('ack-claude');
fs.writeFileSync(stub, `#!/bin/sh
for a in "$@"; do case "$a" in --version) echo "2.1.274 (Claude Code) stub"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac; done
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"e2e00000-0000-4000-8000-00000000ac01","model":"claude-fable-5","cwd":"/tmp","tools":[],"permissionMode":"default","claude_code_version":"2.1.274"}'
exec cat >/dev/null
`, { mode: 0o755 });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const cleanup = () => {
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`pkill -9 -f ${JSON.stringify(wt)}`, { stdio: 'ignore' }); } catch {} // the dtach'd wrapper + stub outlive their server
  for (const d of [fakeHome, sessCwd, stub]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });

const probe = (sessionId) => new Promise((resolve) => {
  const seen = [];
  const h = (d) => {
    let m = {}; try { m = JSON.parse(d); } catch { return; }
    if (m.sessionId !== sessionId && m.type !== 'error') return;
    seen.push(m.type);
    if (m.type === 'attached' || m.type === 'error') { ws.off('message', h); resolve(seen); }
  };
  ws.on('message', h);
  ws.send(JSON.stringify({ type: 'attach', sessionId }));
  setTimeout(() => { ws.off('message', h); resolve(seen); }, 8000);
});

const dead = await probe('sess-does-not-exist-123');
check('nonexistent id: ack precedes the error reply', dead[0] === 'attach-ack', JSON.stringify(dead));
check('nonexistent id: still gets a terminal reply', dead.includes('error') || dead.includes('attached'), JSON.stringify(dead));

const sub = await probe('sub-agent-deadbeef00000000');
check('sub- viewer attach also acked first', sub[0] === 'attach-ack', JSON.stringify(sub));

// ── RESUME BY SEQ (perf lane chunk D) never bypasses the ack or the ladder ──
{
  const frames = [];
  ws.on('message', (d) => { try { frames.push(JSON.parse(d)); } catch { } });
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: sessCwd, reqId: 'ack-c1', name: 'ack seq', cols: 80, rows: 24 }));
  for (let i = 0; i < 80 && !frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'ack-c1'); i++) await sleep(250);
  const created = frames.find((m) => m.type === 'created' && m.reqId === 'ack-c1');
  check('a live chat session exists (stub CLI under the real wrapper, fake home)', !!created, JSON.stringify(frames.filter((m) => m.reqId === 'ack-c1')).slice(0, 300));
  if (created) {
    const sid = created.sessionId;
    const seqProbe = (extra) => new Promise((resolve) => {
      const seen = [];
      const h = (d) => {
        let m = {}; try { m = JSON.parse(d); } catch { return; }
        if (m.sessionId !== sid) return;
        if (m.type !== 'attach-ack' && m.type !== 'attached' && m.type !== 'error') return;
        seen.push(m);
        if (m.type === 'attached' || m.type === 'error') { ws.off('message', h); resolve(seen); }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ type: 'attach', sessionId: sid, caps: ['op-seq'], ...extra }));
      setTimeout(() => { ws.off('message', h); resolve(seen); }, 15000);
    });
    const plain = await seqProbe({});
    const att = plain.find((m) => m.type === 'attached');
    check('a plain capable attach: ack first, then the full attached WITH the opSeq advert', plain[0]?.type === 'attach-ack' && att && Array.isArray(att.messages) && typeof att.opSeq === 'number' && !att.slab, JSON.stringify(plain.map((m) => [m.type, m.opSeq, m.slab, Array.isArray(m.messages)])));
    if (att) {
      const unknown = await seqProbe({ sinceSeq: att.opSeq, sinceEpoch: (att.normEpoch || 1) - 1 });
      const ua = unknown.find((m) => m.type === 'attached');
      check('sinceSeq on an UNKNOWN epoch: still attach-ack first, then a PLAIN attached (messages, no replay)', unknown[0]?.type === 'attach-ack' && ua && Array.isArray(ua.messages) && !('replay' in ua) && !ua.slab, JSON.stringify(unknown.map((m) => [m.type, m.slab, Array.isArray(m.messages)])));
      const future = await seqProbe({ sinceSeq: att.opSeq + 1000, sinceEpoch: att.normEpoch });
      const fa = future.find((m) => m.type === 'attached');
      check('a seq this server never handed out (same epoch): ack, then the plain attached', future[0]?.type === 'attach-ack' && fa && Array.isArray(fa.messages) && !fa.slab);
      const held = await seqProbe({ sinceSeq: att.opSeq, sinceEpoch: att.normEpoch });
      const ha = held.find((m) => m.type === 'attached');
      check('the SAME epoch and a covered seq: ack first, then attached {slab:\'held\', replay} with no messages', held[0]?.type === 'attach-ack' && ha && ha.slab === 'held' && Array.isArray(ha.replay) && !('messages' in ha) && ha.opSeq >= att.opSeq, JSON.stringify(held.map((m) => [m.type, m.slab, m.replay?.length])));
    }
    ws.send(JSON.stringify({ type: 'kill', sessionId: sid }));
    for (let i = 0; i < 40 && !frames.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid); i++) await sleep(100);
  }
}

ws.close();
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
