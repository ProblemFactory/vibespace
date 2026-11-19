// «Update its agent…» — THE OLD AGENT'S DOOR (B-bd27 X1; lane machine-needs-at-pairing's law 1: every sentence that tells a
// person a MACHINE needs something draws its door). A machine's VibeSpace agent too old for something has ONE way out that
// always lands: the hub sends the agent its signed update at every connection (src/agentd/client.js), and where that cannot
// land (a Windows self-upgrade, a refused or stuck update) the pairing command, run again on the machine, installs the agent
// anew. So the door opens THAT MACHINE'S PAIRING SHEET (a paired dial device: its dial state, its command — the sidebar's
// `_showDevicePairDialog`, the door the Machines card's runtime line uses); any other machine (an ssh host, a row this page
// has not loaded) opens Manage agents › Machines, where its row shows the agent's version and its own doors. Words that
// come from a toast carry the same door as the toast's action (`agentUpdateAction`).
import { t } from './i18n.js';

/** The codes that mean «this machine's agent is too old for it» (the capability gates' and the routes' spellings; `no_facts`:
 *  the agent did not report what it runs — an install plan's «reconnect it to upgrade the agent»). */
export const AGENT_OLD_CODES = Object.freeze(['host_needs_daemon', 'host_needs_update', 'agent_too_old', 'device_agent_outdated', 'no_mline', 'no_facts']);
export const isAgentOld = (code) => AGENT_OLD_CODES.includes(String(code || ''));
/** PURE: where the door leads for a host row — 'pairing' (a paired dial device) | 'machines' (any other, or none). */
export function agentDoorTarget(row) { return row && row.transport === 'dial' && row.deviceId ? 'pairing' : 'machines'; }
/** PURE: the host row a reference names — a row, its id or `{hostId}` — among `hosts`; null when none. BY ID ONLY: two machines
 *  may share a name (a peer's word), and the door opens the machine of the row it was drawn on. */
export function hostRowOf(ref, hosts = []) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.transport && ref.id) return ref;
  const key = typeof ref === 'object' ? String(ref.hostId || ref.id || '') : String(ref);
  if (!key) return null;
  const list = Array.isArray(hosts) ? hosts : [];
  return list.find((h) => h && h.id === key) || null;
}
/** Manage agents › Machines — the ONE page-side write of the dialog's tab key outside the dialog (B-06de's doors call it too). */
export function openMachinesTab({ app = globalThis.app } = {}) {
  try { localStorage.setItem('vibespace.agentsTab', 'machines'); } catch { /* the tab falls back to Accounts */ }
  if (app && typeof app._showAgentsDialog === 'function') app._showAgentsDialog();
}
/** Open the door: the pairing sheet of that machine, or Manage agents › Machines. → the target opened. */
export function openAgentUpdate(ref, { app = globalThis.app } = {}) {
  const row = hostRowOf(ref, app && app.sidebar && app.sidebar._hostsData && app.sidebar._hostsData.hosts);
  if (agentDoorTarget(row) === 'pairing' && app && app.sidebar && typeof app.sidebar._showDevicePairDialog === 'function') { app.sidebar._showDevicePairDialog(row); return 'pairing'; }
  openMachinesTab({ app });
  return 'machines';
}
export const agentUpdateLabel = () => t('Update its agent…');
export const agentUpdateTitle = () => t('VibeSpace sends the agent its update each time the machine connects. If the agent stays old, run the pairing command on that machine again: it installs the agent anew.');
/** The button, on the line that says the agent is too old. `before()` = the surface's own close (a dialog that leads away). */
export function agentUpdateDoor(ref, { cls = 'btn-cancel agent-update-door', before = null, app = null } = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.textContent = agentUpdateLabel(); b.title = agentUpdateTitle();
  b.dataset.agentDoor = '1';
  b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); try { if (typeof before === 'function') before(); } catch { /* the surface's */ } openAgentUpdate(ref, { app: app || globalThis.app }); };
  return b;
}
/** The same door as a toast's action (`showToast(text, { action })`). */
export const agentUpdateAction = (ref, { app = null } = {}) => ({ label: agentUpdateLabel(), run: () => openAgentUpdate(ref, { app: app || globalThis.app }) });
