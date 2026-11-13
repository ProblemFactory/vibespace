// 「打开设置」 — THE SETTINGS DOOR ON THE LINE (lane machine-needs-at-pairing pick 2; 主开发's law 2: a need only the person's switch can
// meet — kind (c) — gets a button that opens the right page of THAT machine's settings, with one sentence; the Command Line Tools'
// own installer is a Mac door of the same road — kind (b), macOS's own dialog). Through the machine's agent (`settings-open`:
// POST /api/desktop/machine-desktop/settings-open {host, pane} — the pane BY NAME, src/stream-plan.js MAC_SETTINGS / MAC_DOORS /
// WIN_SETTINGS); an agent that cannot (an older one, a refusal) ⇒ the words say where to go on that machine by hand.
import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';

const PANE_WORDS = {
  sharing: () => t('System Settings › General › Sharing'),
  screen: () => t('Screen & System Audio Recording'),
  accessibility: () => t('Accessibility'),
  clt: () => t('the Command Line Tools installer'),
  remotedesktop: () => t('Settings › System › Remote Desktop'),
  sound: () => t('Settings › System › Sound'),
};
const LABELS = { clt: () => t('Install the Command Line Tools…'), remotedesktop: () => t('Open Windows Settings'), sound: () => t('Open Windows Settings') };
const paneWords = (pane) => (PANE_WORDS[pane] ? PANE_WORDS[pane]() : String(pane));

/** The hub's own refusals (src/hub-act-policy.js REFUSALS + the send point's) — refused HERE, nothing reached the machine. */
const HUB_REFUSALS = ['hub_act_denied', 'ask_expired', 'ask_unfiled', 'act_without_by', 'ask_standing', 'cross-site'];
/** WHY a page did not open (lane machine-needs-at-pairing pick 2, the reader's item 7) — BY THE ANSWER'S CODE, then where to go
 *  on that machine by hand. `r` = the route's answer (null = no answer at all). PURE words. */
export function settingsRefusalText(r, machine, pane) {
  const code = r && r.code, why = String((r && r.error) || code || '').slice(0, 200);
  const byHand = pane === 'clt' ? t('On {machine}, run: xcode-select --install', { machine }) : t('On {machine}, open {pane}', { machine, pane: paneWords(pane) });
  const lead = !r ? t('This page got no answer from the server, so nothing was opened.')
    : code === 'host_unavailable' || code === 'host-unreachable' || code === 'unsupported-host' ? t('{machine} is not connected to this hub right now, so nothing was opened.', { machine })
      : code === 'agent_too_old' || code === 'host_needs_daemon' || code === 'not_mac' || code === 'not_windows' || code === 'bad_pane' ? t('{machine}’s agent is older than this hub and cannot open this page.', { machine })
        : code === 'open_failed' ? t('{machine} tried and its system did not open the page ({why}).', { machine, why })
          : HUB_REFUSALS.includes(code) ? t('This hub refused it, so nothing reached {machine} ({why}).', { machine, why })
            : t('{machine} did not open it ({why}).', { machine, why });
  return `${lead} ${byHand}`;
}
/** Open `pane` on the machine (its agent shows it on that machine's own screen). → the agent's answer | null */
export async function openMachineSettings(hostId, machine, pane) {
  const r = await fetchJson('/api/desktop/machine-desktop/settings-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: hostId, pane }) });
  if (r && r.ok) { showToast(t('Opened {pane} on {machine}', { pane: paneWords(pane), machine })); return r; }
  showToast(settingsRefusalText(r, machine, pane), { type: 'error' });
  return r;
}
/** The button for `pane` of the machine `hostId` (its words name what it opens). */
export function settingsDoor(hostId, machine, pane, { cls = 'file-tool-btn' } = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `${cls} machine-settings-open`; b.dataset.pane = pane;
  b.textContent = LABELS[pane] ? LABELS[pane]() : t('Open System Settings');
  b.title = paneWords(pane);
  b.onclick = async () => { if (b.disabled) return; b.disabled = true; try { await openMachineSettings(hostId, machine, pane); } finally { b.disabled = false; } };
  return b;
}
