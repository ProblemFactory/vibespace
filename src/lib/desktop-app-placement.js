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

// THE PERSON'S SIDE OF D3 (lane agent-window-no-steal, owner 2026-10-11: six agent Chromes in a day, each jumped in front of
// his work): AN AGENT'S ACTION MAY PLACE A WINDOW; ONLY A PERSON'S ACTION MAY FOCUS ONE. Every `desktop-app-opened` carries a
// non-human origin (the agent's own browser today; any origin that is not 'user'), so the verdict never says focus:true and
// never switches a desktop — unless the person opted in (Settings → Desktop apps → "Agent-opened windows come to the front",
// `front`, default OFF), which is exactly D3's old answer with focus. Facts in, cells out (PURE, no DOM):
//   chats [{winId, sessionId, minimized, hidden, deskId}] — this client's chat windows; `desk` the shown desktop id;
//   `active` the active window id (null on an empty desk); `interacting` a drag / resize or a text box holding the caret.
// Cells: act 'beside' (in the chat's chain, behind the active window) | 'desk' (created on the chat's desktop, hidden by the
// desktop model like any off-desk window) | 'own' (a free window behind the active one; on a phone never the shown one) |
// 'none'; focus; deskSwitch (always false); behind (stack it under the active window); minimize (the person is mid-act: it
// waits on the taskbar); badge (the taskbar entry pulses once — no toast, no For-you: a browser an agent opens is routine).
export function agentWindowPlacement({ msg = null, chats = [], active = null, desk = null, phone = false, visible = true, interacting = false, front = false } = {}) {
  const base = { focus: false, deskSwitch: false, behind: false, minimize: false, badge: false };
  if (!msg || msg.type !== 'desktop-app-opened' || !msg.origin || msg.origin === 'user' || !msg.appId || !msg.sessionId) return { ...base, act: 'none', why: 'not-agent' };
  if (front) { const old = agentBrowserPlacement({ msg: { ...msg, origin: AGENT_BROWSER_ORIGIN }, chats, phone, visible }); return { ...base, ...old, focus: old.act !== 'none', why: old.why + '+front' }; }
  if (!visible) return { ...base, act: 'none', why: 'hidden' };
  const chat = (Array.isArray(chats) ? chats : []).find((c) => c && c.sessionId === msg.sessionId);
  if (!chat) return { ...base, act: 'none', why: 'not-here' }; // D3: a client without that chat opens nothing
  const shown = !chat.minimized && !chat.hidden;
  if (phone) return shown ? { ...base, act: 'own', fromWin: chat.winId, badge: true, why: 'phone-quiet' } : { ...base, act: 'none', why: 'phone-not-showing' };
  if (chat.hidden) return chat.deskId && chat.deskId !== desk ? { ...base, act: 'desk', fromWin: chat.winId, deskId: chat.deskId, badge: true, why: 'other-desk' } : { ...base, act: 'none', why: 'hidden-chat' };
  if (chat.minimized) return { ...base, act: 'own', fromWin: chat.winId, behind: !!active, minimize: !!interacting, badge: true, why: interacting ? 'minimized-chat-busy' : 'minimized-chat' };
  return { ...base, act: 'beside', fromWin: chat.winId, behind: !!active && active !== chat.winId, badge: true, why: 'showing-quiet' };
}

// Rule 3 — a SECOND top-level of a running app (a Chrome popup, a new Chrome window: the `fresh` satellite): an app a person
// opened keeps today's answer (front + focus); an agent-opened app's satellite is placed beside its main pane, never revealed —
// unless the person is looking at that main pane right now (it is the active window), or opted in (`front`).
export const agentOpenedRecord = (rec) => !!(rec && rec.origin === AGENT_BROWSER_ORIGIN); // the record's opener was an agent
export function satelliteFocus({ agentOpened = false, mainActive = false, front = false } = {}) {
  return !agentOpened || front || mainActive ? { focus: true, why: !agentOpened ? 'person-opened' : front ? 'front' : 'looking' } : { focus: false, why: 'agent-quiet' };
}
