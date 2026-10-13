// The Voice input · Dropline row's sheet (lane plugin-settings-p0, the VS Code plugin model): the Plugins list's
// 「待处理 N」 chip opens it — Connect with Fish Audio (the OAuth tier) and, once connected, the teach section's
// proposal cards, projects and journal. ACTIONS only: the language and the teach / context switches are settings
// rows (All Settings › Plugins › Voice input · Dropline), the key is the `dropline` row in Services › Integrations.
import { fetchJson } from './utils.js';
import { t } from './i18n.js';
import { renderAccountRow, renderTeachSection } from './voice-teach-ui.js'; // P1: Connect with Fish Audio + teach

export function renderVoiceSheet(box, rerender) {
  const acct = document.createElement('div');
  acct.className = 'voice-account-box';
  box.appendChild(acct);
  fetchJson('/api/voice/status').then((st) => {
    if (!st || st.error) { acct.textContent = (st && st.error) || t('Server unreachable — nothing was changed'); return; }
    renderAccountRow(acct, st, rerender);
    if (st.connected) renderTeachSection(box, rerender);
  }).catch(() => { });
}
