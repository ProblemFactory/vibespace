// THE CHAT'S LINK BOUNDARY (lane card-door-in-chat — the owner, 2026-11-07: a mail card drawn in his agent's chat, its
// attachment row's download icon pressed, and the toast said «已复制！» — «这个按钮怎么是复制？！»). A door does what
// its icon says, wherever its card is drawn. The chat's link delegation (ChatRenderers.setupLinkHandler: a click
// copies, Ctrl/⌘+click opens, a right-click or a tap offers Open + Copy) acts on the chat's OWN links only:
//   · a `.chat-link` span: what the chat's linkify drew over a path / URL in text, wherever it sits;
//   · a BARE `<a href>`: markdown's, through safe-html, which keeps no class on what somebody else wrote (and no data-*),
//     so foreign HTML can never draw an anchor that reads as a card's.
// An anchor carrying a class is a door some card drew, and the delegation never touches it (no preventDefault, no copy,
// no menu): the card's own click, the browser's download / new tab / menu. Today's doors: the Outbox card's ⤓
// `chan-prop-file-dl`, its file name `chan-prop-file-name`, its `chan-prop-link`; the API card's `chan-api-obj`; the file
// card's `chat-userfile-link`; the code-change card's `chat-code-change-link`. A card that draws an anchor into the chat
// gives it a class. (Measured, round 2: no card draws somebody else's markdown into an <a> inside the chat — the For-you
// card's rows are escaped text + .fy-link spans, 0 anchors over every item shape — so a class is the whole boundary.)
// Census: scripts/test-path-linkify.mjs ⑩ (the real delegation over every card kind's door + the static census of the
// modules that draw cards into the chat), scripts/test-channel-outbox.mjs (every anchor of the real Outbox card),
// scripts/test-chat-proposal-card.mjs ⑧ (chrome: the ⤓ in the chat downloads the bytes). PURE: imports nothing, DOM-free.

/** THE verdict: the link the chat's delegation acts on for an event at `target`, else null (no link, or a card's door). */
export function chatLinkOf(target) {
  if (!target || typeof target.closest !== 'function') return null;
  const link = target.closest('.chat-link') || target.closest('a[href]');
  if (!link || link.classList.contains('chat-sub-link')) return null;   // lane agy-subagent-cards: a conversation:// link is ChatView's
  if (link.classList.contains('chat-link')) return link;
  return link.classList.length ? null : link;
}
