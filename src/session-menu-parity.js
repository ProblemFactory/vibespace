// THE TWO SESSION MENUS AGREE (lane think-tools-phone, 主开发 2026-11-17 — the owner, the window's right-click menu open: «另外右键
// 菜单我怎么找不到fork»). A conversation has two menus: its sidebar CARD's (src/lib/session-card.js, menu 'session-card') and its
// WINDOW's (src/lib/taskbar.js registerWindowMenu, menu 'window'). The window's menu carries what acts on the conversation in that
// window (its lifecycle, fork, rename, terminate, its browser, properties, locate); the card's also carries the LIST's helpers
// and the rows that have no window. This table names, for EVERY session command of the card's menu, its entry on the window's
// menu — or that it is not applicable there, and why. scripts/test-locate-verdict.mjs reads both registries against it: a card
// command with no row, or a row naming a window entry the window's menu does not register, is red — the menus cannot drift again.
// PURE: data only, imports nothing.
const CARD_TO_WINDOW = Object.freeze({
  'session.focusWindow': { na: 'the window menu is opened on the window itself — it is the one in front' },
  'session.restart': { window: 'session.restart' },
  'session.viewTmux': { na: 'a tmux session has no VibeSpace window to carry this menu' },
  'session.resumeChat': { na: "a stopped conversation's window offers «Resume session» (session.restart) instead" },
  'session.resumeTerminal': { na: "a stopped conversation's window offers «Resume session» (session.restart) instead" },
  'session.viewHistory': { na: 'the window already shows the conversation' },
  'session.fork': { window: 'session.fork' },
  'session.opencodeTerminal': { na: 'a list-side helper: it opens a NEW terminal window in the folder, not an act on this window' },
  'session.toggleStar': { na: 'a list-side helper: it orders the sidebar list' },
  'session.toggleArchive': { na: 'a list-side helper: it orders the sidebar list' },
  'session.rename': { window: 'window.renameSession' },
  'session.setStatus': { na: 'a list-side helper: the status chip sits on the list row' },
  'session.copyId': { na: 'a list-side helper (Session properties shows the id)' },
  'session.copyPath': { na: 'a list-side helper (Session properties shows the path)' },
  'session.openCwd': { na: 'a list-side helper: it opens the folder in a new file window' },
  'session.findWindow': { na: 'it points from the list to this window — the menu is already on it' },
  'session.goToWindow': { na: 'it points from the list to this window — the menu is already on it' },
  'session.moveWindow': { na: "the window's own «Move to Desktop» moves it" },
  'session.switchBilling': { na: "the window's chat status bar carries the billing chip" },
  'session.pinBrowser': { na: 'a list-side helper: the profile picker opens at the list row' },
  'session.browserLive': { window: 'window.browserLive' },
  'session.browserHandback': { na: 'a list-side helper beside the row that shows the person driving the browser' },
  'session.rescueTranscript': { na: 'for a stopped conversation, which has no window' },
  'session.properties': { window: 'session.properties' },
  'session.terminate': { window: 'window.terminateSession' },
});

module.exports = { CARD_TO_WINDOW };
