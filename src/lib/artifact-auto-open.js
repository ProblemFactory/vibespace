// THE AUTOMATIC OPEN OF A DOCUMENT THE AGENT WROTE (lane artifacts-auto-open-quiet; owner 2026-10-08 "自动打开产物时不要
// 自动 focus 窗口，很影响使用；加个配置开关"). PURE — imports nothing, no DOM: chat-view.js asks it at a card's LIVE birth
// (the server marks only a doc's write-birth — src/artifacts.js autoOpenVerdict).
//   · quietOpenVerdict({auto, phone, setting}) → 'focus' = the user's OWN open (a card / chip row / Artifacts window
//     click: today's door, it focuses) · 'quiet' = beside the chat, never the focused window, the caret or the keyboard
//     owner (createWindow's caller `quiet`) · 'skip' = nothing opens (the card + the chip only): the setting off, or the
//     phone — ≤768 px one window fills the screen and a minimize is the SYNCED truth (window.js minimize), so a phone
//     can neither show it beside nor park it minimized without minimizing every client's copy.
//   · teachVerdict({verdict, taught}) — the ONE toast per device ("… · Turn off"): the first QUIET open only.
export const TAUGHT_KEY = 'vs-auto-open-taught';
export function quietOpenVerdict({ auto = false, phone = false, setting = true } = {}) {
  if (!auto) return 'focus';
  if (setting === false || phone) return 'skip';
  return 'quiet';
}
export const teachVerdict = ({ verdict, taught } = {}) => verdict === 'quiet' && !taught;
