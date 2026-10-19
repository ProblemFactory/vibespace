// The Voice input · Dropline row's sheet (lane plugin-settings-p0, the VS Code plugin model): the Plugins list's
// 「待处理 N」 chip opens it — Connect with Fish Audio (the OAuth tier) and, once connected, the teach section's
// proposal cards, projects and journal. ACTIONS only: the language and the teach / context switches are settings
// rows (All Settings › Plugins › Voice input · Dropline), the key is the `dropline` row in Services › Integrations —
// `pasteKey` (lane dropline-connect-door) = the caller's way to open that card, offered under Connect.
import { fetchJson } from './utils.js';
import { t } from './i18n.js';
import { renderAccountRow, renderTeachSection } from './voice-teach-ui.js'; // P1: Connect with Fish Audio + teach
import { noteVoiceStatus } from './voice-input.js'; // lane voice-everywhere: the card's read also tells every microphone

export function renderVoiceSheet(box, rerender, { pasteKey = null, focus = null } = {}) {
  const acct = document.createElement('div');
  acct.className = 'voice-account-box';
  box.appendChild(acct);
  fetchJson('/api/voice/status').then((st) => {
    noteVoiceStatus(st);
    if (!st || st.error) { acct.textContent = (st && st.error) || t('Server unreachable — nothing was changed'); return; }
    renderAccountRow(acct, st, rerender, { pasteKey });
    if (st.connected) renderTeachSection(box, rerender, { focus }); // focus: a For-you reminder's door (lane foryou-plugin-notices)
  }).catch(() => { });
}
