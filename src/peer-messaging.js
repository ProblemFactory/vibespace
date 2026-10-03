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

// Post one text message to a peer's inbox socket. Resolves {ok, reason?, phase, elapsedMs, transient?, late?, code?, closeError?}.
// Auth frame is sent when a key was published (the binary marks auth REQUIRED
// on Linux); the user frame is the CLI's documented injection shape.
//
// THE VERDICT IS THE SOCKET'S, NEVER A TIMER'S ALONE (lane notify-retry, 2026-10-01 — the owner's conversation
// missed a job notification after ONE "timeout" on a live, idle CLI). What this records, per attempt:
//   phase    connect → write (the frames handed to the kernel) → written (flushed: the CLI's to read; no ack
//            exists) → closed (the CLI closed first). A timeout can only ever name `connect` or `write`: a frame
//            that flushed is delivered as far as this side can know (a later reset is NAMED in `closeError`,
//            never a failure — whether the CLI read it is the ambiguity the kb states).
//   transient  true when the next attempt may clear by itself (the timer, EAGAIN = a listener not accepting,
//            ECONNRESET / EPIPE before the flush); false when the registry's path is a socket nobody serves
//            (ENOENT / ECONNREFUSED / ENOTSOCK — the CLI is gone or re-bound: the caller stashes at once).
//   late     how far past the timer the verdict came. MEASURED on this box: a unix-socket connect completes
//            AT THE SYSCALL (or fails at once — a full backlog answers EAGAIN, never a hang), and libuv hands
//            the callback to the NEXT loop iteration's pending phase, which runs AFTER the timers phase. So a
//            stall of OUR loop longer than the timer, right after net.connect(), fired "timeout" on a
//            connection that had already succeeded. The timer therefore defers its verdict ONE loop turn
//            (setImmediate: the check phase runs after pending) and only then judges — and `late` says how
//            stalled the loop was, which is the one number that tells the two causes apart in the journal.
const TRANSIENT_CODES = new Set(['EAGAIN', 'EWOULDBLOCK', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EBUSY', 'ENOBUFS']);
const WRITE_GRACE_MS = 1000;   // a write still in flight when the timer fires is given this much more, bounded
const FLUSH_GRACE_MS = 150;    // after the flush: the CLI may hold the connection open (no ack exists)
const POST_TIMEOUT_MS = 5000;  // the default timer
// THE PRIMITIVE'S OWN BOUND (notify-retry verify r2, measured: a never-reading inbox answered at 6 006 ms): a post resolves
// within the timer + the write grace + the flush grace. A wait for a post in flight that is shorter than this (the exit's
// settle was 5 s) calls a post that lands a second later "unsettled" and the next boot hands a LANDED frame to the stash
const POST_BOUND_MS = POST_TIMEOUT_MS + WRITE_GRACE_MS + FLUSH_GRACE_MS;
function postToPeer(peer, text, { timeoutMs = POST_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let phase = 'connect';
    let settled = false;
    let closeError = null;
    let timer = null;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { sock.destroy(); } catch { }
      resolve({ ...res, phase, elapsedMs: Date.now() - t0 });
    };
    const fail = (reason, { code = null, transient = false, late = 0 } = {}) => finish({ ok: false, reason, ...(code ? { code } : {}), transient, ...(late > 0 ? { late } : {}) });
    const delivered = () => finish({ ok: true, ...(closeError ? { closeError } : {}) });
    const sock = net.connect(peer.socketPath);
    const judgeTimeout = () => {
      if (settled || phase === 'written' || phase === 'closed') return;
      const late = Math.max(0, Date.now() - t0 - timeoutMs);
      if (phase === 'write') {   // connected, the frames in flight: one bounded grace, then it is a timeout in the write phase
        timer = setTimeout(() => { if (!settled && phase === 'write') fail('timeout', { transient: true, late: Math.max(0, Date.now() - t0 - timeoutMs - WRITE_GRACE_MS) }); }, WRITE_GRACE_MS);
        timer.unref?.();
        return;
      }
      fail('timeout', { transient: true, late });
    };
    // the timer's verdict waits one loop turn: a connect / flush already queued by libuv is heard first
    timer = setTimeout(() => { setImmediate(judgeTimeout); }, timeoutMs);
    timer.unref?.();
    sock.on('error', (e) => {
      const code = (e && e.code) || null;
      if (phase === 'written' || phase === 'closed') { closeError = code || String(e && e.message); return; }
      fail('socket error: ' + (e && e.message), { code, transient: TRANSIENT_CODES.has(code) });
    });
    sock.on('close', () => {
      if (settled) return;
      if (phase === 'written') { phase = 'closed'; delivered(); return; }
      fail('socket closed before the frame was written', { transient: true });
    });
    sock.on('connect', () => {
      phase = 'write';
      try {
        const frames = (peer.key ? JSON.stringify({ type: 'auth', token: peer.key }) + '\n' : '')
          + JSON.stringify({ type: 'user', message: { role: 'user', content: String(text) } }) + '\n';
        sock.write(frames, (err) => {
          if (settled) return;
          if (err) { fail('write failed: ' + err.message, { code: err.code || null, transient: TRANSIENT_CODES.has(err.code) }); return; }
          phase = 'written';
          // flushed to the kernel = the CLI's to read. No success ack exists: give the CLI a beat (it may close
          // first — that settles it sooner), then treat written as sent. Never a timeout past this line.
          setTimeout(delivered, FLUSH_GRACE_MS).unref?.();
        });
      } catch (e) { fail('write failed: ' + e.message, { code: e.code || null }); }
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

module.exports = { findPeer, postToPeer, postChannelEvent, REGISTRY_DIR, TRANSIENT_CODES, pidAlive, POST_BOUND_MS };
