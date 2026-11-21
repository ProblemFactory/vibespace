'use strict';
/**
 * THE ONE WAY A PERMISSION CARD IS ANSWERED ON A LIVE SESSION — ORCH (lane J
 * r2, 2026-09-25). Two callers, one implementation:
 *   · the ws `permission-response` case (the user pressed Allow / Deny);
 *   · the browser takeover's STALE sweep (src/server/browser-handback.js): an
 *     approval the agent queued for a browser page command before (or while)
 *     the user took its browser over is answered with a deny that NAMES
 *     `browser_paused` — the agent re-plans after the handback card instead of
 *     a stale step running on a page nobody planned for (the naive-user
 *     study's S8-36).
 * The answer is the ADAPTER's own frame (`formatPermissionResponse` — the
 * harness decides its shape; `denyMessage` rides where the harness has a
 * channel for it, claude's control_response `message`), written to the
 * session's stdin, appended to the in-memory buffer (a refresh keeps the
 * resolution) and fed to the normalizer through THE live-feed gate. A
 * permission deny opens no turn: it answers a question the CLI already asked
 * inside a turn somebody started (no spend-census row — the census counts turn
 * openers, test-spend-paths §2).
 */
const { trimRing } = require('../chat-ring.js');   // B-5a4d: the ring's ONE trim (the held copy + its queue records carried while owed)

function answerPermission(session, data, { adapterRegistry, feedLive } = {}) {
  if (session && !session.pty && typeof session._attachPending === 'function') session._attachPending();   // B-cd4b: a restored survivor whose batched attach still waits is attached at its first use
  if (session && !session.pty && session._attachFailed) return { ok: false, why: `this conversation could not be reconnected after the restart (${session._attachFailed})` };
  if (!session || !session.pty || session.mode !== 'chat') return { ok: false, why: 'not a live chat session' };
  const adapter = adapterRegistry && typeof adapterRegistry.get === 'function' ? adapterRegistry.get(session.backend) : null;
  if (!adapter || typeof adapter.formatPermissionResponse !== 'function') return { ok: false, why: `no adapter answers permissions for "${session.backend}"` };
  const payload = adapter.formatPermissionResponse(data || {});
  session.pty.write(payload + '\n');
  // Record in buffer so permission state survives refresh/restart
  session.buffer = trimRing(session.buffer + payload + '\n', session);
  try { if (typeof feedLive === 'function') feedLive(session, JSON.parse(payload)); } catch { /* a non-JSON frame is the adapter's business — it was written */ }
  return { ok: true, payload };
}

module.exports = { answerPermission };
