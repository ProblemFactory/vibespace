// WHERE THE AGENT'S OWN DESKTOP-APP BROWSER OPENS (lane e2a, docs/design-agent-browser-v2 §E2.1 Placement, owner D3:
// "beside the chat only on the client that shows it; nowhere else; phone its own window"). PURE — imports nothing, no DOM:
// app.js asks it on every `desktop-app-opened {sessionId, appId, origin}` broadcast (src/server/window-targets-engine.js
// openAgentBrowser). Every client hears; only a client SHOWING that session's chat window opens anything:
//   · 'beside' — the chat window `fromWin` is on screen (not minimized, not on another desktop, the page visible) ⇒ the
//     app opens through lane F's split door (app.linkPlacement(fromWin) — never a new placement path)
//   · 'own'    — the same, on a phone (R6: one pane — its own window)
//   · 'none'   — not an agent-browser launch, the page hidden, or no window here shows that chat (the launcher's running
//     list and the chat's window chip still show it)
const AGENT_BROWSER_ORIGIN = 'agent-browser'; // src/server/window-targets-engine.js AGENT_BROWSER_ORIGIN
export function agentBrowserPlacement({ msg = null, chats = [], phone = false, visible = true } = {}) {
  if (!msg || msg.type !== 'desktop-app-opened' || msg.origin !== AGENT_BROWSER_ORIGIN || !msg.appId || !msg.sessionId) return { act: 'none', why: 'not-agent-browser' };
  if (!visible) return { act: 'none', why: 'hidden' };
  const chat = (Array.isArray(chats) ? chats : []).find((c) => c && c.sessionId === msg.sessionId && !c.minimized && !c.hidden);
  if (!chat) return { act: 'none', why: 'not-showing' };
  return phone ? { act: 'own', fromWin: chat.winId, why: 'phone' } : { act: 'beside', fromWin: chat.winId, why: 'showing' };
}
