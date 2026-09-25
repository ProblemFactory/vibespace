'use strict';
/**
 * THE TYPING PATH — ONE implementation (docs/design-user-inbox-reply.md D1.1).
 *
 * The body of the ws `chat-input` case, moved here verbatim so a second
 * caller can say "exactly as if the owner typed it": the For-you inbox's
 * reply route (src/routes/user-todos-reply.js). Both callers are a
 * PER-OCCURRENCE OWNER ACTION — the owner's keyboard, or the owner's click on
 * Reply — so this path goes through NEITHER the spend authorizer (typed turns
 * are never counted, design-account-hardening D6) NOR the delivery ladder
 * (conversation-deliver.js is "somebody else's message": a peer card, a stash).
 * The spend census (scripts/test-spend-paths.mjs §2) excuses THIS file's one
 * `formatChatInput` with an ALLOW row; nothing else may call it to open a turn
 * nobody typed.
 *
 * `createUserInputSender(deps).send(sessionId, text, {msgId, origin})` →
 *   {ok:true, msgId}
 *   | {ok:false, code, error} with code:
 *       no_session     — no live session under that id
 *       not_chat       — no pty, or not a chat-mode session
 *       input_rejected — the adapter's POISON GUARD refused the frame (2.360.0)
 *       too_large      — > 1 MiB for a wrapper without the frame-file verb (2.361.1)
 *       send_failed    — no adapter for the backend, or the pty write threw
 *
 * Mid-turn is NOT a refusal: the frame is written and the session's own send
 * mode takes over (claude's CLI queues it; codex's wrapper `thread/queue/add`).
 * `origin` only names the caller in the log lines ('ws' | 'inbox-reply').
 */
const fs = require('fs');
const path = require('path');
const { wrapperCaps } = require('./wrapper-files.js');

function createUserInputSender({ activeSessions, adapterRegistry, BUFFERS_DIR, broadcastToSession, feedLive, autoResume, reattachLocalPty, ptyQuietSince, log = console.log, framesDir = path.join(__dirname, '..', '..', 'data', 'chat-frames') }) {
  function send(sessionId, text, { msgId: givenMsgId = null, origin = 'ws' } = {}) {
    const session = activeSessions.get(sessionId);
    if (!session) return { ok: false, code: 'no_session', error: 'no live session ' + sessionId };
    if (!(session.pty && session.mode === 'chat')) return { ok: false, code: 'not_chat', error: 'not a live chat session' };
    session._userInputAt = Date.now();   // the owner's own turn (§22 D2: next-turn reports ride THIS kind of turn only)
    const adapter = adapterRegistry.get(session.backend);
    if (!adapter) return { ok: false, code: 'send_failed', error: `no adapter for backend "${session.backend}"` };
    // New input means prior interrupt succeeded (or user proceeded) —
    // cancel any pending SIGINT fallback to avoid killing mid-stream.
    if (session._interruptTimer) {
      clearTimeout(session._interruptTimer);
      session._interruptTimer = null;
    }
    const msgId = givenMsgId || (Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    // NOTE: the user's message text is sent VERBATIM. Task context and
    // status-override notices are delivered through the harness's OWN
    // native hooks (SessionStart / UserPromptSubmit → vibespace-hook.mjs),
    // never by rewriting the user's input — modifying the message stream
    // is unstable and bypasses the CLI's mechanisms (user directive).
    let stdinPayload, userMsg;
    try { ({ stdinPayload, userMsg } = adapter.formatChatInput(text, msgId)); }
    catch (e) {
      // POISON GUARD tripped (2.360.0): a shredded frame must reach
      // the USER as an error, never the transcript as text. The ws caller
      // answers with code 'input-rejected' — without it the client's error
      // handler read EVERY per-session error as an attach failure and
      // flipped the LIVE window read-only (inc-mt2arppw, userW: "发消息
      // 就会直接中断"), and the text rode a field the client never read.
      return { ok: false, code: 'input_rejected', error: e.message };
    }
    // Large frames (image pastes) ride a FILE, not the pty stdin —
    // multi-MB single lines get shredded by the pty/dtach channel
    // (the 79928a2b 38MB poisoning; local chat only — a remote
    // wrapper can't see this filesystem). The condition is TRANSPORT
    // + CAPABILITY, never a backend id: until design-harness-plugins
    // §1 P1 it also excluded the codex backend by id, which left the
    // shredding class OPEN for codex (its wrapper had no _frame_file
    // verb and dropped unparseable lines silently) instead of letting
    // the capability gate below say "old wrapper" honestly.
    let payloadLine = stdinPayload;
    if (stdinPayload.length > 64 * 1024 && !session.host && session.socketPath) {
      // WRAPPER CAPABILITY GATE (2.361.1, the c1206711 lost-image
      // incident): the _frame_file pointer is only understood by
      // wrappers spawned from 2.360.0+ code. Wrappers are LONG-LIVED
      // (dtach survives updates) — an old wrapper forwards the pointer
      // verbatim to claude, which drops the unknown type SILENTLY and
      // the message vanishes (frame file orphaned). Capability = the
      // caps marker the wrapper writes into its SIDECAR at boot
      // (data/session-buffers/<id>.json, read through the collision-
      // aware resolver — 2.364.1: the 2.361.1 gate read the SERVER's
      // data/session-meta record, which never carries caps, so every
      // wrapper tested "old", every >1MB paste was refused for two
      // releases and the refusal sent users to Terminate+Resume
      // sessions that were already new; owner did it three times).
      // Unmarked wrappers keep the historical raw-stdin path (single-
      // screenshot sized frames rode it safely for months) and
      // anything past the shredding-risk range is REFUSED with a
      // visible, EVIDENCED error instead of lost (no-silent-failures
      // law). Only a POSITIVE verdict is cached — a wrapper still
      // booting a huge resume must not be locked out by its first read.
      let caps = null;
      if (session._wrapperFrameFile !== true) {
        caps = wrapperCaps(BUFFERS_DIR, sessionId, session.socketPath);
        if (caps.frameFile) session._wrapperFrameFile = true;
      }
      if (session._wrapperFrameFile === true) {
        try {
          fs.mkdirSync(framesDir, { recursive: true });
          const fp = path.join(framesDir, `${sessionId}-${Date.now()}.json`);
          fs.writeFileSync(fp, stdinPayload);
          payloadLine = JSON.stringify({ type: '_frame_file', path: fp });
        } catch (e) { log(`[${sessionId}] frame-file bypass failed (${e.message}) — falling back to direct stdin`); }
      } else if (stdinPayload.length > 1024 * 1024) {
        const mb = (stdinPayload.length / 1048576).toFixed(1);
        const started = caps?.startedAt ? new Date(caps.startedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown time';
        const why = caps?.reason === 'no-sidecar'
          ? 'its wrapper has not reported its capabilities yet (still starting up?) — wait a moment and send it again'
          : `its wrapper (started ${started}) predates the frame-file update — Terminate + Resume the session, then send it again`;
        const refusal = `Message too large (${mb}MB) for this session: it was NOT sent — ${why}.`;
        log(`[${sessionId}] chat-input REFUSED (${mb}MB, ${origin}): wrapper caps ${caps?.reason} (pid ${caps?.pid}, started ${caps?.startedAt})`);
        return { ok: false, code: 'too_large', error: refusal };
      }
    }
    session._isStreaming = true;
    // WORK (the default classification, round 4): the user took the
    // conversation over by hand — the one non-turn signal allowed to
    // clear the loop breaker, because a human at the keyboard is
    // exactly who the budget was protecting
    try { autoResume?.noteRecovered?.(sessionId, 'user sent a prompt'); } catch { }
    // /compact turn (2.365.0, the userN "Compaction canceled." case):
    // a large conversation compacts for 1–2 minutes behind a bare
    // "thinking…" spinner, and the CLI's ONLY "Compaction canceled."
    // path is an abort signal — one reflexive Stop click threw the
    // whole attempt away. Label the turn for every client (the label
    // resets with the turn like any other) so Stop can be guarded.
    if (typeof text === 'string' && /^\/compact\b/.test(text.trim())) {
      session._streamingLabel = 'Compacting context… (a large conversation takes 1–2 minutes — Stop cancels it)';
      session._streamingKind = 'compacting';
      broadcastToSession(session, sessionId, { type: 'streaming-label', sessionId, label: session._streamingLabel, kind: 'compacting' });
    }
    try { session.pty.write(payloadLine + '\n'); }
    catch (e) {
      log(`[${sessionId}] chat-input write failed (${origin}): ${e.message}`);
      return { ok: false, code: 'send_failed', error: 'the session did not accept the message: ' + e.message };
    }
    if (userMsg) {
      session.buffer = (session.buffer + JSON.stringify(userMsg) + '\n').slice(-500000);
      feedLive(session, userMsg);
    }
    // Detect broken pty stdin: the wrapper writes _stdin_ack on
    // stdout immediately when it receives stdin input. If no ack
    // AND no byte at all came back from the pty within 5s, the pipe
    // is dead. Both signals checked for compat with old wrappers that
    // don't send _stdin_ack (wrapper only updates on server restart).
    // 2026-09-09: the "did anything come back" half asks the LIVENESS
    // STAMP (`ptyQuietSince`) instead of `session.buffer.length` — the
    // same fact read at the source, and a superset (a chat consumer
    // need not append every byte to session.buffer, and the terminal
    // branch swallows dtach's attach preamble outright). The HEAL is
    // the shared `reattachLocalPty`, which the restore-path attach
    // probe also uses: two triggers, one implementation.
    if (session.socketPath) {
      const inputPayload = payloadLine;
      const sentAt = Date.now();
      session._stdinAckReceived = false;
      setTimeout(() => {
        if (!activeSessions.has(sessionId)) return;
        if (session._stdinAckReceived) return;
        if (!ptyQuietSince(session, sentAt)) return; // bytes came back — the pty is working (old wrapper without ack)
        reattachLocalPty(sessionId, session, 'Broken pty stdin detected', { resend: inputPayload });
      }, 5000);
    }
    return { ok: true, msgId };
  }
  return { send };
}

module.exports = { createUserInputSender };
