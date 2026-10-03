// THE MESSAGE ACTION BAR'S RULES (lane reaction-hover, 2026-10-01 — the owner: "这个加表情的加号太丑了。做成 lark 官方
// 那种鼠标指上去才会在消息的右侧出现，不改变上下布局关系。" + "把 reply in thread，quote 也都放在鼠标悬浮按钮里").
//
// PURE (imports nothing, DOM-free): WHICH actions one message's bar offers, in the bar's order, and the toolbar's
// arrow-key step. The DOM half is src/lib/channel-msg-bar.js; the channel window asks `msgBarActions` for every row it
// draws (and again when the conversation's offers change), and the phone's long-press menu is built from the SAME
// list — a control exists only where the conversation offers it (never a greyed button with a hint).
//
//   react   — add a reaction: the conversation offers `react` (the account may add one here)
//   thread  — reply in a thread: the conversation offers `thread-reply` and the channel declares the `thread`
//             placement. In the main list it opens the thread pane on the message's topic (a reply inside a topic is
//             answered in that topic, as itself) or on a NEW thread rooted at the message; in the pane it picks the
//             message the reply answers (the root = the thread itself)
//   quote   — a quoted reply in the chat: the channel declares the `quote` placement, this conversation's composer can
//             send (direct or as a proposal), and the message is NOT inside a topic (the vendor files a reply to a
//             topic message in the topic — the engine's PL5 refuses it, so the control is never drawn there); never
//             in the pane (every message there is inside the thread)
//   more    — an agent GROUP message's menu (Clear content…); the group window's only per-message action
//
// A system line and a cleared message have no bar.

/** The closed vocabulary, in the bar's order (left → right). */
export const MSG_ACTIONS = Object.freeze(['react', 'thread', 'quote', 'more']);

/** A place the ONE classifier calls a topic (`topic-root` / `topic-reply` / `topic-quote`) — the server's
 *  `placeKindOf`, the same word the window's tag and the engine's placement verdict read. */
export const inTopic = (place) => !!(place && typeof place.kind === 'string' && place.kind.startsWith('topic-'));

const offered = (o) => !!(o && o.offered === true);

/**
 * The actions ONE row's bar offers, in order. `conv` = the conversation view the window last drew (`offers`,
 * `threads.placements`) — null for an agent group; `composer` = the window's composer mode (`direct` | `propose` |
 * `readonly` | …); `group` = an agent group's row (its menu is the only action).
 */
export function msgBarActions({ sys = false, cleared = false, group = false, inPane = false, place = null, conv = null, composer = null } = {}) {
  if (sys || cleared) return [];
  if (group) return ['more'];
  const o = (conv && conv.offers) || {};
  const placements = conv && conv.threads && Array.isArray(conv.threads.placements) ? conv.threads.placements : null;
  const declares = (x) => placements === null || placements.includes(x);
  const out = [];
  if (offered(o.react)) out.push('react');
  if (offered(o.threadReply) && declares('thread')) out.push('thread');
  if (!inPane && placements !== null && placements.includes('quote') && (composer === 'direct' || composer === 'propose') && !inTopic(place)) out.push('quote');
  return out;
}

/** THE MESSAGE MENU (lane channel-touch-menu, 2.369.203): the bar's actions + `copy` when the message has words — what
 *  the touch … button, a long press on the row's chrome and a desktop right click open. The bar itself never draws
 *  `copy` (desktop hover unchanged); on a touch-first device the words are selectable, Copy text takes the whole message. */
export function msgMenuActions(barIds, { text = '' } = {}) {
  const ids = Array.isArray(barIds) ? barIds.filter((x) => MSG_ACTIONS.includes(x)) : [];
  return String(text || '').trim() ? [...ids, 'copy'] : ids;
}

/** A TOUCH-FIRST device — the bar is never drawn there, the … button is (never "hover: none" alone: headless Chrome and
 *  a pen report it on a fine pointer, where the bar is the door). */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

/** The key a set of bars is drawn from — the window re-syncs its drawn bars only when this changes. */
export function barKey({ conv = null, composer = null, note = '' } = {}) {
  const o = (conv && conv.offers) || {};
  const pl = conv && conv.threads && Array.isArray(conv.threads.placements) ? conv.threads.placements.join(',') : null;
  return JSON.stringify([offered(o.react), offered(o.threadReply), pl, composer || null, note || '']);
}

/** THE TOOLBAR'S ARROWS (WAI-ARIA toolbar: ONE tab stop per bar, the arrows move inside it, wrapping): the index the
 *  focus moves to from `i` of `n` buttons for `key`, or null when the key is not the bar's. */
export function barKeyStep(key, i, n) {
  if (!(n > 0)) return null;
  const at = Number.isInteger(i) && i >= 0 && i < n ? i : 0;
  switch (key) {
    case 'ArrowRight': return (at + 1) % n;
    case 'ArrowLeft': return (at - 1 + n) % n;
    case 'Home': return 0;
    case 'End': return n - 1;
    default: return null;
  }
}
