/** B-5a4d root unit 3 (r4664; its cure r4682 M2 / M3) — WHAT A «NOT DELIVERED» / «NOT CONFIRMED» BUBBLE OFFERS IN ONE VIEW. PURE:
 *  imports nothing; the view (src/lib/chat-view.js _undeliveredActsOf) asks it with its own facts and hands the answer to the renderer
 *  (src/lib/chat-renderers.js applyQueueChip, through the ChatRenderers constructor's `undeliveredActsOf`), and
 *  scripts/test-undelivered-chip.mjs asks it the same way.
 *   · a STOPPED view → { stopped: true } (no act; the chip's words teach the road: resume, then …)
 *   · a live view whose running agent advertised the acts → { resend, dismiss }: Send again only on «Not delivered» AND only where the
 *     message has words to send (a picture alone: Dismiss alone — never a button the hub must refuse); Dismiss on both states
 *   · anything else (an agent started before the update, a disconnected view, another state) → null: no act, the words of before */
function hasWords(msg) {
  const c = msg && msg.content;
  const blocks = Array.isArray(c) ? c : [{ type: 'text', text: String(c == null ? '' : c) }];
  return blocks.some((b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '');
}
export function undeliveredActsFor(msg, { readOnly = false, live = false, advertised = false, act = null } = {}) {
  const st = msg && msg.queueState;
  if ((st !== 'undelivered' && st !== 'unconfirmed') || !msg.webuiMsgId) return null;
  if (readOnly) return { stopped: true };
  if (!live || !advertised || typeof act !== 'function') return null;
  return { resend: st === 'undelivered' && hasWords(msg) ? (b) => act('resend', msg, b) : null, dismiss: (b) => act('dismiss', msg, b) };
}
