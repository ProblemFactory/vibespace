// lane desktop-vnc-remember (owner 2026-10-19): 「登录已记住」 — the Machines card's chip for a machine whose desktop sign-in is
// REMEMBERED (sealed in the vault; the hub signs in to its VNC server by itself while the vault is unlocked). A technical fact
// about the machine, worded — never the row's key or its kind. Forgotten from the machine's dialog (src/lib/machine-desktop.js).
import { t } from './i18n.js';
import { escHtml } from './utils.js';

/** `state` = the machine's row of GET /api/desktop/machine-desktop/signins (absent = none kept) → the chip's HTML ('' = none). */
export function signinChipHtml(state) {
  if (!state || state.kept !== true) return '';
  const tip = t('This machine’s desktop sign-in is sealed in the vault; VibeSpace signs in by itself while the vault is unlocked. Forget it in the machine’s dialog (Apps → the machine).');
  return `<span class="agents-mach-chip agents-mach-signin" title="${escHtml(tip)}">${escHtml(t('Sign-in remembered'))}</span>`;
}
