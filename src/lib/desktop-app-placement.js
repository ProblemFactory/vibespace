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
// his work): AN AGENT'S ACTION MAY PLACE A WINDOW; ONLY A PERSON'S ACTION MAY FOCUS ONE. Lane agent-window-no-pop (owner
// incident inc-mvhebl4n-rkvr, 2026-10-21 「design还是被强行弹出了」 — a repeat: the Design opened beside a chat that was only
// SHOWING, and his desk was re-arranged under his hand while he worked in the ⚙ menu): AN AGENT NEVER CHANGES THE ARRANGEMENT
// OF THE DESK A PERSON IS USING. It opens a window beside its chat only where the person is already looking (that chat is
// the active window, or the active window shares its split frame) or where he is not (the chat lives on another desk);
// everywhere else NO window opens — the chat gets a card and its taskbar entry the badge, and the person's press on the
// card (Open) is the one origin that opens + focuses. Facts in, cells out (PURE, no DOM):
//   chats [{winId, sessionId, minimized, hidden, deskId, looking}] — this client's chat windows (`hidden` = held off screen
//   by the desktop model; `looking` = the active window is this chat or a pane of the split frame that shows it); `desk`
//   the shown desktop id; `active` the active window id (null on an empty desk; equal to winId reads as looking too).
// Cells: act · focus · deskSwitch (always false) · badge (the taskbar entry pulses once and keeps its mark until the person
// focuses it — no toast, no For-you: a window an agent opens is routine) · fromWin (the chat window) · deskId.
// THE TABLE (an agent's push, Settings → Desktop apps → "Agent-opened windows come to the front" OFF, the page visible):
//   the chat on this client                          phone  act     why                 what the person sees
//   no window of that chat                           any    none    not-here            nothing (D3: a client without it opens nothing)
//   shown, looking (active / its split partner)      no     beside  looking             the window beside it, never focused; it pulses
//   shown, not looking (inc-mvhebl4n-rkvr)           no     card    showing-quiet       no window: the chat's card + the chat's badge
//   minimized                                        no     card    minimized-chat      no window: the chat's card + the chat's badge
//   hidden on ANOTHER desk — a Design / an app       no     desk    other-desk          created on that desk (hidden there), no switch; it pulses
//   hidden on another desk — the live view           no     card    other-desk-live     no window (a live view is born only into a chain on screen)
//   hidden, not on another desk (no desk id)         no     card    hidden-chat         no window: the chat's card + the chat's badge
//   shown                                            yes    own     phone-quiet         its own window, never the shown one; the title badge
//   minimized / hidden                               yes    none    phone-not-showing   nothing
//   any — the page hidden                            any    none    hidden              nothing
//   any — the setting ON                             any    D3's old answer (agentBrowserPlacement) WITH focus: beside / own / none
// The doors carry the cells out: beside = the Design snapped to the right half (the chat left), the browser in the chat's
// split; desk = created, then moved to the chat's desk; own = a free window under the active one; card = nothing opens — the
// Design's card says its title + Open (chat-input.js agentCard), the agent browser's is the chat's status-bar chip.
// THE THREE PUSHES THAT PLACE A WINDOW (an agent's doing, told apart by shape — no door a PERSON drives reaches here):
//   · `desktop-app-opened` {origin≠'user', appId, sessionId} — the agent's desktop-app browser / app (lane e2a)
//   · `design-open` {openSpec.action:'openDesign', dir, sessionId} — the agent's `vibespace-design new|open|add|sync|ask`
//     (design-window.js installDesignWindow; a chat card / the home / the gear / a layout replay call openDesign direct)
//   · `browser-live-start` {sessionId} — the agent's browser started (a NEW holder row in the digest:
//     browser-live-window.js autoBindLiveViews; the person's "Open live view" calls openBrowserLive direct)
// Returns the chat's sessionId to place beside, or null when the push is none of them (D3: a person's origin opens nothing).
export const LIVE_START = 'browser-live-start';
export function agentPlacedSession(msg) {
  if (!msg) return null;
  if (msg.type === 'desktop-app-opened') return msg.origin && msg.origin !== 'user' && msg.appId && msg.sessionId ? String(msg.sessionId) : null;
  if (msg.type === 'design-open') { const s = msg.openSpec; const sid = msg.sessionId || (s && s.sessionId); return s && s.action === 'openDesign' && s.dir && sid ? String(sid) : null; }
  if (msg.type === LIVE_START) return msg.sessionId ? String(msg.sessionId) : null;
  return null;
}
export function agentWindowPlacement({ msg = null, chats = [], active = null, desk = null, phone = false, visible = true, front = false } = {}) {
  const base = { focus: false, deskSwitch: false, badge: false };
  const sid = agentPlacedSession(msg);
  if (!sid) return { ...base, act: 'none', why: 'not-agent' };
  if (front) { const old = agentBrowserPlacement({ msg: { ...msg, type: 'desktop-app-opened', origin: AGENT_BROWSER_ORIGIN, appId: msg.appId || 'design', sessionId: sid }, chats, phone, visible }); return { ...base, ...old, focus: old.act !== 'none', why: old.why + '+front' }; }
  if (!visible) return { ...base, act: 'none', why: 'hidden' };
  const chat = (Array.isArray(chats) ? chats : []).find((c) => c && c.sessionId === sid);
  if (!chat) return { ...base, act: 'none', why: 'not-here' }; // D3: a client without that chat opens nothing
  const shown = !chat.minimized && !chat.hidden;
  if (phone) return shown ? { ...base, act: 'own', fromWin: chat.winId, badge: true, why: 'phone-quiet' } : { ...base, act: 'none', why: 'phone-not-showing' };
  const card = (why) => ({ ...base, act: 'card', fromWin: chat.winId, badge: true, why });
  if (chat.hidden && chat.deskId && chat.deskId !== desk) return msg.type === LIVE_START ? card('other-desk-live') : { ...base, act: 'desk', fromWin: chat.winId, deskId: chat.deskId, badge: true, why: 'other-desk' };
  if (chat.hidden) return card('hidden-chat');
  if (chat.minimized) return card('minimized-chat');
  if (chat.looking === true || (!!active && active === chat.winId)) return { ...base, act: 'beside', fromWin: chat.winId, badge: true, why: 'looking' };
  return card('showing-quiet'); // inc-mvhebl4n-rkvr: shown, the person elsewhere on this desk — nothing moves under his hand
}

// Rule 3 — a SECOND top-level of a running app (a Chrome popup, a new Chrome window: the `fresh` satellite): an app a person
// opened keeps today's answer (front + focus); an agent-opened app's satellite is placed beside its main pane, never revealed —
// unless the person is looking at that main pane right now (it is the active window), or opted in (`front`).
export const agentOpenedRecord = (rec) => !!(rec && rec.origin === AGENT_BROWSER_ORIGIN); // the record's opener was an agent
export function satelliteFocus({ agentOpened = false, mainActive = false, front = false } = {}) {
  return !agentOpened || front || mainActive ? { focus: true, why: !agentOpened ? 'person-opened' : front ? 'front' : 'looking' } : { focus: false, why: 'agent-quiet' };
}

// A WINDOW WHOSE APP FIXES ITS SIZE, LARGER THAN THE WORKSPACE (lane app-window-fit-topleft, B-1f0b — the coordinator's
// decision on lane app-fit-fixed's «Larger than the workspace»: a 1000×900 GTK dialog at 2× on an 878 px workspace kept its
// cascade x, its bottom strip past the edge). The app states WM_NORMAL_HINTS min = max (WeChat's login, Inkscape's welcome,
// a GTK dialog) ⇒ the window IS that size, never scaled (WindowManager.setFixedSize). A frame that FITS the workspace keeps
// its place ('cascade' — slid inside, keepInside); one LARGER than it in EITHER dimension stands at the workspace's top-left
// ('top-left': 0,0 of #workspace — below the toolbar, beside the sidebar), so the most of it shows and Scale ▸ 1× reaches
// the rest; WIDER than it ⇒ `barMax` = the room its title bar has from the window's left edge (the workspace's width): the
// window manager holds the bar to it, so the ✕ is on screen at any size. The phone layout (the window IS the screen and the
// picture scales — app-fit-fixed's «named, not fixed») and a workspace not laid out ⇒ 'none'. Facts in (layout px), a cell
// out; window.js asks it at the lock and at a workspace reflow only — never on a drag frame.
//   fixed — the window's app fixes its size; frame {w, h} — the locked window box; workspace {w, h} — #workspace (null: not
//   laid out); phone — the ≤768 px layout.  → { act: 'none' | 'cascade' | 'top-left', left, top, barMax, why }
export function fixedWindowPlacement({ fixed = false, frame = null, workspace = null, phone = false } = {}) {
  const cell = (act, why, at = null, barMax = null) => ({ act, left: at ? at.left : null, top: at ? at.top : null, barMax, why });
  if (!fixed) return cell('none', 'not-fixed');
  if (phone) return cell('none', 'phone');
  const fw = Number(frame && frame.w), fh = Number(frame && frame.h), ww = Number(workspace && workspace.w), wh = Number(workspace && workspace.h);
  if (!(fw > 0 && fh > 0)) return cell('none', 'no-frame');
  if (!(ww > 0 && wh > 0)) return cell('none', 'no-workspace');
  const wider = fw > ww, taller = fh > wh;
  if (!wider && !taller) return cell('cascade', 'fits');
  return cell('top-left', wider && taller ? 'larger' : wider ? 'wider' : 'taller', { left: 0, top: 0 }, wider ? ww : null);
}
