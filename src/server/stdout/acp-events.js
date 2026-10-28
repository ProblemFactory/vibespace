'use strict';
// ACP-EVENTS STDOUT CONSUMER (harness S5, docs/design-harness-plugins.md
// §2.4): the 'acp-events' branch of setupSessionPty (added 2.369.29 with the
// generic ACP v1 harness), moved VERBATIM out of src/server/session-stdout.js
// behind the protocol registry (./index.js). ORCH tier: it consumes the wall
// machine's noteTurnEnd, the model registry (noteHarnessModels) and the
// delivery ladder — the descriptor only NAMES it (caps.streamProtocol =
// 'acp-events'; acpHarness() refuses any other value). Per-attach state
// (lineBuf) lives in the attach closure as before; everything else is on the
// session object.
const protocol = 'acp-events';
/** dtach's clear-screen kickoff to an attaching client — the SAME burst claude-stream-json.js strips
 *  (DTACH_CLEAR_PREAMBLE) — arrives in front of the wrapper's FIRST line. Unstripped, that line failed JSON.parse and
 *  went out as terminal output (lane agy-harness-fixes-2: for a Resume it is the `session` record that carries the mode —
 *  the hub never learned it, the resumed window's chip said «default» while agy ran «Never ask»). */
const DTACH_CLEAR_PREAMBLE = /^(?:\x1b\[H|\x1b\[[0-3]?J)+/;

function create({ engine, noteHarnessModels, deliverRef, permissionRulesRef }) {
  const { noteTurnEnd } = engine;
  function attach(session, id, ptyProcess, { feedLive, broadcastToSession, broadcastActiveSessions, readSessionMeta, writeSessionMeta, updateSessionTodos }) {
    let lineBuf = '';
    // THE MODE THE WRAPPER RUNS IN (lane agy-harness-fixes-2): its `session` / `config` record says it, and the hub's copy
    // follows — session-meta, the attach / status merges — and every open window's chip is told, as a confirmed claude
    // set_permission_mode is (claude-stream-json `permission-mode-ack`). agy adopts a RESUMED conversation's own mode at
    // ITS boot: after the creator's `created`, before this session's normalizer exists (feedLive drops the record, so no
    // init card says it) — the resumed window's chip said «default» while agy ran «Never ask». (That record is the stream's
    // FIRST line, behind dtach's clear preamble — stripped above.)
    const noteMode = (rec) => {
      if (typeof rec.mode !== 'string') return;
      const m = rec.mode || null;
      if ((session._permissionMode || null) === m) return;
      session._permissionMode = m;
      if (session.sockName) { try { writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), permissionMode: m }); } catch { } }
      broadcastToSession(session, id, { type: 'permission-mode-ack', sessionId: id, ok: true, mode: m || '' });
    };
    // ACP v1 harnesses (S8, docs/design-harness-plugins.md §2.3): the
    // generic wrapper (data/bin/acp-wrapper.js) journals ONE JSON record per
    // line ({type:'acp', kind, …}; shape documented at its top). This
    // consumer is deliberately small: id adoption from the `session` record,
    // the streaming flag from prompt_start/prompt_end, the activity label,
    // todos from `plan`, the agent's offered models into the model registry,
    // peer-delivery honesty, then feedLive for the normalizer. No wall
    // machine: ACP carries no subscription-quota signal (usage_update is
    // context size).
    ptyProcess.onData((output) => {
      if (session._reattachAttempts) session._reattachAttempts = 0;
      session.buffer += output;
      // the ring keeps the last 800 000 bytes FROM A WHOLE LINE (lane agy-harness-fixes): a cut mid-line left a corrupt
      // half record as the history's first line
      if (session.buffer.length > 1200000) { const cut = session.buffer.indexOf('\n', session.buffer.length - 800000); session.buffer = cut >= 0 ? session.buffer.slice(cut + 1) : ''; }
      lineBuf += output;
      let nlIdx;
      while ((nlIdx = lineBuf.indexOf('\n')) !== -1) {
        const line = lineBuf.substring(0, nlIdx).replace(/\r/g, '').trim().replace(DTACH_CLEAR_PREAMBLE, '').trim();
        lineBuf = lineBuf.substring(nlIdx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { broadcastToSession(session, id, { type: 'output', sessionId: id, data: line + '\n' }); continue; }
        try {
          if (msg.type === '_stdin_ack' || msg.type === '_stdin_nack') { session._stdinAckReceived = true; continue; }
          if (msg.type !== 'acp') { feedLive(session, msg); continue; } // e.g. the echoed permission-response frame
          // a SUBAGENT's own step (lane agy-subagent-cards): its virtual session's, never the parent's cards / label
          if (msg.kind === 'sub') { require('../acp-subagents.js').feed(session, id, msg, broadcastToSession); continue; }
          let newLabel = null;
          if (msg.kind === 'session') {
            noteMode(msg);
            // The agent's session id IS the conversation id (resume = session/load with it)
            let changed = false;
            if (msg.sessionId && session.backendSessionId !== msg.sessionId) {
              if (session.backendSessionId) {
                const prev = session.forkedFrom || [];
                if (!prev.includes(session.backendSessionId)) prev.push(session.backendSessionId);
                session.forkedFrom = prev;
              }
              session.backendSessionId = msg.sessionId;
              session.claudeSessionId = null;
              changed = true;
            }
            if (msg.cwd && session.cwd !== msg.cwd) { session.cwd = msg.cwd; changed = true; }
            if (changed && session.sockName) {
              writeSessionMeta(session.sockName, {
                ...(readSessionMeta(session.sockName) || {}),
                name: session.name, cwd: session.cwd, backend: session.backend,
                backendSessionId: session.backendSessionId, claudeSessionId: null,
                forkedFrom: session.forkedFrom || null,
                permissionMode: session._permissionMode || null, effort: session._effort || null,
                createdAt: session.createdAt, webuiSessionId: id, mode: session.mode,
              });
              broadcastActiveSessions();
            }
            if (Array.isArray(msg.models) && msg.models.length) { try { noteHarnessModels?.(session.backend, msg.models); } catch {} }
            if (msg.how === 'load' || msg.how === 'resume') newLabel = '';
          } else if (msg.kind === 'config') {
            noteMode(msg);
            if (Array.isArray(msg.models) && msg.models.length) { try { noteHarnessModels?.(session.backend, msg.models); } catch {} }
          } else if (msg.kind === 'prompt_start') {
            session._isStreaming = true; newLabel = 'thinking...';
          } else if (msg.kind === 'prompt_end') {
            session._isStreaming = false; newLabel = '';
            try { noteTurnEnd?.(session); } catch {}
            // the descriptor's after-turn read (antigravity: the card of a sub its OLD wrapper journaled without one — the
            // cards' addendum): its records go through THIS loop next, as if journaled (a `sub` step to its virtual
            // session, a card to the cards) — never into the session buffer / the journal
            try {
              const late = require('../../harnesses').harnessOf(session.backend)?.store?.afterTurn?.(session) || [];
              if (late.length) lineBuf = late.map((r) => JSON.stringify(r)).join('\n') + '\n' + lineBuf;
            } catch (e) { console.warn(`[acp] after-turn read failed: ${e.message}`); }
          } else if (msg.kind === 'update') {
            const u = msg.update || {};
            // lane artifacts-model: a tool call's diff → the conversation's deliverable rows + their cards (the descriptor's hook reads it)
            if (u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') { try { require('../artifact-registry.js').observe(session, msg); } catch (e) { console.warn('[acp] artifacts consumer failed:', e.message); } }
            if (u.sessionUpdate === 'agent_message_chunk') newLabel = 'responding';
            else if (u.sessionUpdate === 'agent_thought_chunk') newLabel = 'thinking...';
            else if (u.sessionUpdate === 'tool_call') newLabel = `running ${String(u.title || u.kind || 'tool').slice(0, 60)}`;
            else if (u.sessionUpdate === 'plan' && Array.isArray(u.entries)) {
              updateSessionTodos(session, u.entries.map((e) => ({ content: String(e?.content || ''), status: e?.status === 'in_progress' ? 'in_progress' : (e?.status === 'completed' ? 'completed' : 'pending') })));
            }
          } else if (msg.kind === 'subagent') {
            // a FINISHED subagent card (lane agy-subagent-cards): the files its sub wrote join this conversation's Artifacts
            // (the descriptor's helper door reads the sub's transcript; a running card reads nothing)
            if (msg.status && msg.status !== 'running') { try { require('../artifact-registry.js').observe(session, msg); } catch (e) { console.warn('[acp] subagent artifacts failed:', e.message); } }
          } else if (msg.kind === 'permission_rules') {
            // READ-ONLY rule answer (ruling 10). For ACP the answer is always
            // 'unsupported-by-protocol' + the live mode — routed anyway, so a
            // pending read gets a TYPED refusal instead of a timeout.
            // PROPERTY ACCESS, never a call — see the twin note in
            // codex-events.js: these lazy refs are mk() Proxies over `{}`, so
            // `ref()` throws TypeError and the answer never lands.
            try { permissionRulesRef?.onWrapperRecord?.(id, msg); } catch (e) { console.warn(`[permission-rules] ${id}: answer handling failed: ${e.message}`); }
          } else if (msg.kind === 'peer_result') {
            // THE CODEX TWIN'S THREE HANDLERS (src/server/stdout/codex-events.js, peer_message_result — lane agy-peer-wake: the
            // antigravity row rides the rpc-queue rung, whose answer is this record). PROPERTY ACCESS on the lazy refs, never
            // a call (the twin note there: these are mk() Proxies over `{}`, `ref()` throws and the bare catch ate it).
            const cid = session.backendSessionId;
            // ① same honesty rule as the codex rpc-queue lane: a promised message never silently dies
            if (msg.ok === false && msg.text) {
              console.log(`[deliver] acp wrapper delivery failed (${msg.reason || 'unknown'}) — re-stashing for ${cid}`);
              // the codex twin's rule (channel-jump verify r2): a frame naming a remembered hand-over restores its originals
              let restored = 0;
              try { if (cid) restored = deliverRef?.restoreFrame?.(cid, String(msg.text), { kind: msg.peerKind || null }) || 0; } catch (e) { console.warn(`[deliver] ${id}: hand-over restore failed: ${e.message}`); }   // kind = the frame's PATH as the wrapper echoes it (verify r4)
              if (!restored) {
                try { if (cid) deliverRef?.stashFor?.(cid, { source: 'agent', kind: msg.peerKind || null, fromName: msg.fromName || null, text: String(msg.text) }); } // kind = the wrapper's echo (S3 verify F3)
                catch (e) { console.warn(`[deliver] ${id}: re-stash failed: ${e.message}`); }
              }
            }
            // ② a notification this harness could not fold into the running turn took another lane — said, like codex's
            // `turn/steer refused` line (an ACP / agy wrapper has no free steer: it waits for its own turn after this one)
            if (msg.ok === true && msg.steer === 'unsupported') console.log(`[deliver] rpc-queue: no steer into the running turn on ${session.backend || 'this harness'} — the notification took the '${msg.mode || '?'}' lane instead`);
            // ③ THE SPEND SETTLEMENT for EVERY answer (conversation-deliver settleRpcDelivery): the wrapper's own verdict
            // settles the frame the ladder wrote — 'queued'/'turn' charges a withheld charge, a mode-less answer is about an
            // earlier frame and settles nothing
            try { if (cid) deliverRef?.settleRpcDelivery?.(cid, { ok: msg.ok !== false, mode: msg.mode || null }); }
            catch (e) { console.warn(`[deliver] ${id}: spend settle failed: ${e.message}`); }
          }
          if (newLabel !== null && session._streamingLabel !== newLabel) {
            session._streamingLabel = newLabel;
            broadcastToSession(session, id, { type: 'streaming-label', sessionId: id, label: newLabel, kind: session._streamingKind || null });
          }
          feedLive(session, msg);
        } catch (e) { console.error(`[acp] record handling failed (${msg.kind || msg.type}): ${e.message}`); }
      }
    });
  }
  return { protocol, attach };
}
module.exports = { protocol, create };
