// PURE (imports nothing, DOM-free) — the `window-live` form's mode arithmetic
// (docs/design-agent-browser-v2 §4.3 / §4.9 / §6.6, P9b): given the lease the
// server broadcast for a desktop-app window and THIS viewer's id, which of the
// three modes the pane is in, whether noVNC must be view-only, and what a
// change between two lease views means to the person looking at it. Kept
// out of desktop-app-window.js so scripts/test-window-target.mjs pins it in
// node without a DOM (the view-visibility.js precedent).

/**
 * `{ leased, mode:'watch'|'takeover', mine, viewOnly, holder, orphaned }`.
 * No lease ⇒ the window is the user's own app: not leased, never view-only
 * (their input reaches it directly, as before P9). A lease with input 'agent'
 * ⇒ Watch (view-only: the agent is driving, the bridge would drop the input
 * anyway). Input 'user' ⇒ Take over: mine when the holder viewer is this one
 * (then input flows), somebody else's otherwise (view-only for me).
 */
export function windowLiveMode({ lease = null, viewerTag = null } = {}) {
  if (!lease || typeof lease !== 'object') return { leased: false, mode: 'watch', mine: false, viewOnly: false, holder: null, orphaned: false };
  const taken = lease.input === 'user';
  // `takenBy.tag` is the OPAQUE name of the takeover (2026-09-21): the viewer id
  // itself is the socket's secret and is in no broadcast — the taker learned its
  // tag from its own takeover answer, everybody else only sees "somebody".
  const holder = taken && lease.takenBy && lease.takenBy.tag != null ? String(lease.takenBy.tag) : null;
  const mine = taken && holder !== null && viewerTag != null && holder === String(viewerTag);
  return { leased: true, mode: taken ? 'takeover' : 'watch', mine, viewOnly: !mine, holder, orphaned: !!lease.orphaned };
}

/** The badge's words (the browser live view's exact three, so the two panes
 *  read the same); the caller wraps them in t(). */
export function windowModeBadge({ leased = false, mode = 'watch', mine = false } = {}) {
  if (!leased) return null;
  if (mode !== 'takeover') return 'Agent is driving';
  return mine ? 'You are driving — agent asked to pause' : 'Another viewer is driving — agent asked to pause';
}

/**
 * What a lease change means to THIS viewer — one of 'took-over' (I now drive),
 * 'handed-back' (I stopped driving, explicitly), 'lapsed' (my takeover ended
 * on its own: idle / viewer-left), 'other-took' (somebody else now drives),
 * 'agent-attached' (an agent took the lease on a window I was driving freely),
 * 'agent-left' (no agent holds it any more), or null (nothing to say).
 */
export function leaseTransition(prev, next, viewerTag) {
  const a = windowLiveMode({ lease: prev, viewerTag });
  const b = windowLiveMode({ lease: next, viewerTag });
  if (!a.leased && b.leased) return 'agent-attached';
  if (a.leased && !b.leased) return 'agent-left';
  if (!a.mine && b.mine) return 'took-over';
  if (a.mine && !b.mine) {
    const cause = next && next.handbackCause;
    if (b.mode === 'takeover') return 'other-took';
    return cause === 'idle' || cause === 'viewer-left' ? 'lapsed' : 'handed-back';
  }
  if (a.mode !== 'takeover' && b.mode === 'takeover' && !b.mine) return 'other-took';
  return null;
}

/** A per-SOCKET viewer id: the id the pane puts on its stream upgrade and on its
 *  takeover. It is the SECRET the bridge binds to that one socket (a second
 *  socket claiming it is refused) and the takeover route trusts, so it is 128
 *  random bits (`crypto.getRandomValues` — available in non-secure contexts,
 *  unlike randomUUID) and never broadcast; a lease names the takeover by an
 *  opaque tag instead. `random` is the suites' injectable fallback. */
export function newViewerId(random = null) {
  let hex = '';
  if (!random && typeof globalThis.crypto?.getRandomValues === 'function') {
    const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b);
    hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  } else { const r = random || Math.random; for (let i = 0; i < 4; i++) hex += Math.floor(r() * 0xffffffff).toString(16).padStart(8, '0'); }
  return `wl-${hex}`;
}
