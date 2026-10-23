// THE ONE LINK OPENER FOR EVERY xterm (lane signin-card-real-screen). A CLI's
// sign-in link reaches xterm two ways: as plain text (WebLinksAddon's matcher)
// and as an OSC-8 HYPERLINK (`ESC]8;;<url>BEL<text>ESC]8;;BEL` — both
// `claude auth login` and `claude setup-token` print one). door-signin-card
// gave the addon a handler, but an OSC-8 link goes through xterm's OWN
// `linkHandler` option, whose default is the native «Do you want to navigate
// to …? WARNING: This link could potentially be dangerous» confirm — the
// dialog the naive testers still met in the «Log in to Claude Code» terminal
// on 2.369.344. Every `new Terminal(` passes TERMINAL_LINK_HANDLER and every
// `new WebLinksAddon(` passes openTerminalLink (test-terminal-zoom-select's
// census): http(s) only, a NEW tab, noopener so it cannot reach this page.
export function openTerminalLink(uri) {
  const u = String(uri || '');
  if (/^https?:\/\//i.test(u)) window.open(u, '_blank', 'noopener,noreferrer');
}
export const TERMINAL_LINK_HANDLER = Object.freeze({ activate: (event, uri) => openTerminalLink(uri), allowNonHttpProtocols: false });
