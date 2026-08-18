// Peer messaging — post a text message into a live claude session's inbox
// socket, the CLI's own cross-session messaging feature (GA since CLI 2.1.224;
// official doc: code.claude.com/docs/en/cross-session-messaging).
//
// WHY THIS EXISTS (2.344.0, owner-approved B-0bf4): Background Work needed a
// way to tell an OWNER CONVERSATION "your job finished" without VibeSpace
// fabricating user input (the automation red line — we never write synthetic
// prompts into a session's stdin). The CLI ships a first-party inbound channel
// for exactly this: every session binds a unix inbox socket, registers it in
// ~/.claude/sessions/<pid>.json, and PUBLISHES a per-session auth key file
// (<pid>.<sha256>.key, 0600) next to it so that OTHER same-OS-user processes
// can authenticate — that key file is how sessions authenticate to EACH OTHER
// (they are not each other's children), i.e. the by-design same-user peer
// path, not a masquerade. Delivery semantics are the CLI's own: queued while
// mid-turn, a NEW TURN when idle, billed like a typed prompt, inbound-gated by
// the receiving session's crossSessionInbound policy, throttled + deduped by
// the CLI (so a notify storm cannot loop).
//
// Wire protocol (from the 2.1.229 binary's own help text, verified by a live
// self-probe): newline-delimited JSON on the unix socket —
//   {"type":"auth","token":"<key>"}\n
//   {"type":"user","message":{"role":"user","content":"<text>"}}\n
// No ack on success; the 1 MiB line cap and parse failures drop the
// connection server-side.
//
// INVARIANTS:
// - REGISTRY IS THE SOURCE OF TRUTH: a session is reachable iff a registry
//   record with a live pid + a bindable socket path exists. Stale records
//   (dead pid) are treated as absent, never cleaned up by us (the CLI owns
//   that directory).
// - Local machine only: registry + sockets live on THIS machine. Remote
//   conversations fall back to the stash lane (jobs.js) — parked with the
//   rest of cross-machine Background Work.
// - Never throw to callers: every failure returns {ok:false, reason} so the
//   jobs engine can stash instead. A degrade path logs the error VERBATIM
//   (the 2.284 rule).
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const REGISTRY_DIR = path.join(os.homedir(), '.claude', 'sessions');

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Scan the CLI's session registry for the record owning a backend session id.
// Returns {pid, socketPath, key, name, version} or null. `dir` is injectable
// for tests only.
function findPeer(backendSessionId, dir = REGISTRY_DIR) {
  if (!backendSessionId) return null;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  for (const f of entries) {
    if (!/^\d+\.json$/.test(f)) continue;
    let rec;
    try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { continue; }
    if (!rec || rec.sessionId !== backendSessionId) continue;
    if (!rec.messagingSocketPath || !pidAlive(rec.pid)) continue;
    // auth key file: <pid>.<hash>.key beside the record (0600, same user)
    let key = null;
    try {
      const kf = entries.find((e) => e.startsWith(rec.pid + '.') && e.endsWith('.key'));
      if (kf) key = fs.readFileSync(path.join(dir, kf), 'utf-8').trim();
    } catch { }
    return { pid: rec.pid, socketPath: rec.messagingSocketPath, key, name: rec.name || null, version: rec.version || null };
  }
  return null;
}

// Post one text message to a peer's inbox socket. Resolves {ok, reason?}.
// Auth frame is sent when a key was published (the binary marks auth REQUIRED
// on Linux); the user frame is the CLI's documented injection shape.
function postToPeer(peer, text, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok, reason) => { if (!settled) { settled = true; try { sock.destroy(); } catch { } resolve({ ok, reason }); } };
    const sock = net.connect(peer.socketPath);
    const timer = setTimeout(() => done(false, 'timeout'), timeoutMs);
    timer.unref?.();
    sock.on('error', (e) => done(false, 'socket error: ' + e.message));
    sock.on('connect', () => {
      try {
        if (peer.key) sock.write(JSON.stringify({ type: 'auth', token: peer.key }) + '\n');
        sock.write(JSON.stringify({ type: 'user', message: { role: 'user', content: String(text) } }) + '\n');
        // no success ack exists — give the CLI a beat to read before FIN so a
        // racing close can't truncate the line, then treat written as sent
        setTimeout(() => done(true), 150).unref?.();
      } catch (e) { done(false, 'write failed: ' + e.message); }
    });
  });
}

// ── VibeSpace channel ingress (EXPERIMENTAL, 2.344.0) ──────────────────────
// When a session was spawned with the VibeSpace channel enabled
// (agents.vibespaceChannel, default OFF), data/bin/vibespace-channel.js holds
// a per-session unix socket; one JSON line {content, meta?} = one
// notifications/claude/channel event into that session. Ack is a literal
// 'ok' line. Used as the preferred notify lane when present.
function postChannelEvent(sockPath, content, meta, { timeoutMs = 4000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok, reason) => { if (!settled) { settled = true; try { sock.destroy(); } catch { } resolve({ ok, reason }); } };
    const sock = net.connect(sockPath);
    const timer = setTimeout(() => done(false, 'timeout'), timeoutMs);
    timer.unref?.();
    sock.on('error', (e) => done(false, 'socket error: ' + e.message));
    sock.on('data', (d) => { done(String(d).trim().startsWith('ok'), 'nack'); });
    sock.on('connect', () => {
      try { sock.write(JSON.stringify({ content: String(content), meta: meta || {} }) + '\n'); } catch (e) { done(false, 'write failed: ' + e.message); }
    });
  });
}

module.exports = { findPeer, postToPeer, postChannelEvent, REGISTRY_DIR };
