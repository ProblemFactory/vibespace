'use strict';
/**
 * attach-read.js — THE ATTACH'S OFF-LOOP READ (lane resume-all-paced L3 cure, 主开发 2026-11-16 23:16Z, P1 + P2).
 *
 * P1 — A RE-ATTACH IS AN ATTACH. A reader that can read its records off the loop (codex: CodexSessionMessages.rawAsync — the parse
 * in the transcript worker, the merges in slices) does so at EVERY door that reads it: the first attach, every re-attach (a page
 * reload, a reconnect, a second device — the history already loaded, the reader a fresh one), the read-only view, the transcript
 * service. Before this, only the first attach did: every later attach asked a fresh reader for its chat status, which parsed the
 * whole rollout synchronously on the main loop — the frame master's storm table names, one conversation after another.
 *
 * P2 — WHILE AN ATTACH WAITS, THE WINDOW IS TOLD. The read waits its turn in the hub's one-read-at-a-time line
 * (codex-session-store.js oneReadAtATime) — minutes behind a storm of big reads. The page's re-attach ladder turns a living window
 * read-only after ~2.5 min without an ack (chat-view.js), so the wait is acked every ACK_MS like the history rebuild's wait
 * (`queued: true` — it has not started converting yet). The caller passes its own `ack`.
 *
 * → true when it read (a reader with rawAsync), false when the reader reads synchronously by design (claude: its own warm cache)
 */
const ATTACH_ACK_MS = 10000;   // the rebuild's re-ack cadence (ws-handler.js, 2.369.16): one clock for every wait of an attach

async function readOffLoop(sm, { ack = null, ackMs = ATTACH_ACK_MS, bulk = false, label = '' } = {}) {
  if (!sm || typeof sm.rawAsync !== 'function') return false;
  const timer = ack ? setInterval(() => { try { ack(); } catch { } }, ackMs) : null;
  try { await sm.rawAsync({ bulk }); }
  catch (e) { console.warn(`[attach] ${label}: off-loop history read failed — ${(e && e.message) || e}`); }
  finally { if (timer) clearInterval(timer); }
  return true;
}

module.exports = { readOffLoop, ATTACH_ACK_MS };
