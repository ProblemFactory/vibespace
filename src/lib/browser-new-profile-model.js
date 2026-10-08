// THE NEW PROFILE… DIALOG, AS A PURE MODEL (lane browser-admin, 2026-10-01 — the owner: "不能手动创建profile"; the only
// create was a conversation's card menu, a label and nothing else). DOM-free, imports only the switch dialog's PURE word
// module, `t` injected. The server sends STRUCTURE — the provider rows with their verdicts (GET /api/browser/providers,
// `?host=` for the per-machine verdict), the install verdict (GET /api/browser/install), the machines (GET
// /api/desktop/machines) — and this file turns it into the choices the dialog draws, the ONE body it POSTs and the
// words a refusal is said in (by the server's CODE; the server's English sentence is the agent's).
//
// Laws (the switch dialog's, kept): every provider is a row — one that cannot be a profile HERE is shown with its
// reason in words, never hidden; a row that needs a step first (CloakBrowser not installed) offers that step (Install…,
// behind the download confirm), and is chosen once it is done; a machine a provider cannot run on is shown greyed WITH
// the reason as text (P4's rule — never a tooltip-only "you can't"); "Who can use it" defaults to every conversation
// (owner ruling A).
import { backendName, blurbOf, learnBackendRows } from './browser-switcher-model.js';

const i18nKey = (s) => s;

/** The closed set of a provider row's states in this dialog (first match wins, `providerChoices`). */
/** The states a person may pick. */
export const PICKABLE = Object.freeze(['ready', 'needs-port', 'needs-key']);
/** The closed set of a machine row's states. */
export const MACHINE_STATES = Object.freeze(['ready', 'offline', 'no-browser', 'provider-here-only', 'needs-browser']); // lane remote-profile-start: + needs-browser (pickable — the step is said)
/** The states a machine row may be picked in (a machine that needs its one step can still keep a profile; its start says the step). */
export const MACHINE_PICKABLE = Object.freeze(['ready', 'needs-browser']);

const isCloud = (id) => /^cloud:[a-z0-9-]+$/.test(String(id || ''));

/**
 * The provider rows, for the machine the profile will run on. `providers` = the route's rows (each `{id, label, tier,
 * leaseKind, control:{ok, code}, onHost?:{ok, code}}`); `host` = null for this machine; `install` = the CloakBrowser
 * install verdict (`{ok, code, state:{running, failed}, npm}` — null when the server has none).
 * → `[{id, name, blurb, state, pickable, note, offer}]` — `note` = the sentence under the name (null when nothing needs
 * saying), `offer` = 'install' / 'install-again' / null.
 */
export function providerChoices({ providers = [], install = null, host = null, t = (s) => s } = {}) {
  const out = [];
  learnBackendRows(providers);
  for (const r of Array.isArray(providers) ? providers : []) {
    if (!r || !r.id) continue;
    const id = String(r.id);
    const v = host ? (r.onHost || r.control || {}) : (r.control || {});
    let state = 'ready', note = null, offer = null;
    if (r.leaseKind === 'window-target') { state = 'not-a-profile'; note = t(i18nKey('A window on your desktop is shared with an agent from the window itself — it is not a profile.')); }
    else if (v.ok === false && (v.code === 'provider_needs_local_key' || v.code === 'provider_local_only')) { state = 'other-machine'; note = t(i18nKey('Runs only on the computer VibeSpace runs on — pick This computer to use it.')); }
    else if (v.ok === false) { state = 'unavailable'; note = v.code === 'provider_needs_consent' ? t(i18nKey('Off until you allow agents to use windows on your desktop (Settings → Desktop apps).')) : t(i18nKey("Can't be used in this version of VibeSpace.")); }
    else if (r.install && !host && install && install.code !== 'already_installed') {
      const s = install.state || {};
      if (s.running) { state = 'installing'; note = t(i18nKey('Installing… it can be chosen once it is done.')); }
      else if (s.failed) { state = 'install-failed'; note = t(i18nKey("The last install of {name} didn't finish."), { name: backendName(id, t) }); offer = install.npm === false ? null : 'install-again'; }
      else if (install.ok && install.npm !== false) { state = 'needs-install'; note = t(i18nKey('Not installed yet — install it first, then choose it.')); offer = 'install'; }
      else { state = 'unavailable'; note = t(i18nKey("VibeSpace can't install {name} here by itself. Ask whoever runs VibeSpace, or install it yourself and enter where it is under Settings → Agent browser."), { name: backendName(id, t) }); }
    } else if (id === 'cdp') { state = 'needs-port'; note = t(i18nKey('Connects to a browser that is already running with a debugging port — enter its port.')); }
    else if (isCloud(id)) { state = 'needs-key'; note = t(i18nKey('Runs at the vendor; it needs your key (⚙ → Integrations) before its first start.')); }
    // the switch dialog's names and blurbs speak of SWITCHING ("…so it can't be switched from here"); a row here names what
    // a new profile would BE — its own head for the two that are not a browser VibeSpace starts, the blurb only where it
    // describes the browser itself (Chromium, CloakBrowser); the note says the rest
    // lane dc-browser-backends (F5): a row's own `newProfileName` (cdp, local-window) else its name; the blurb only for a
    // browser VibeSpace starts on a directory of its own (`ownsDir` — the others' blurbs speak of switching)
    const name = r.words && r.words.newProfileName ? t(r.words.newProfileName) : backendName(id, t);
    const blurb = r.ownsDir ? blurbOf(id, t) : null;
    out.push({ id, name, blurb, state, pickable: PICKABLE.includes(state), note, offer });
  }
  return out;
}

/**
 * The machine rows (GET /api/desktop/machines' list). A paired machine runs a profile browser through its agent's
 * `browser-serve` op — one without it (an older agent) or offline is listed with why; a provider that runs only here
 * greys every other machine with the sentence (`providerOnHost` = the chosen provider's verdict on a paired machine,
 * from the `?host=` rows: `{ok, code}` | null when unknown).
 */
/**
 * LANE REMOTE-PROFILE-START: a paired machine with NO BROWSER TO RUN, in words — by its CODE (the machine's `ready.step` /
 * a refused start's `step`: `browser_cli_missing` | `browser_missing`) and its SHELL, with the ONE command to run there (the
 * machine's own, copied as is). → `{title, note, command}` | null (no step).
 */
export function machineStepWords(step, { machine = '', t = (s) => s } = {}) {
  if (!step || typeof step !== 'object' || !step.command) return null;
  const m = String(machine || step.machine || '') || t(i18nKey('that machine'));
  const ps = step.shell === 'powershell';
  const note = step.code === 'browser_cli_missing'
    ? (ps ? t(i18nKey('agent-browser is not installed on {machine}, so no browser can start there. Run this once on it, in PowerShell:'), { machine: m }) : t(i18nKey('agent-browser is not installed on {machine}, so no browser can start there. Run this once on it, in a terminal:'), { machine: m }))
    : (ps ? t(i18nKey('{machine} has no Chrome for agent-browser to run. Run this once on it, in PowerShell:'), { machine: m }) : t(i18nKey('{machine} has no Chrome for agent-browser to run. Run this once on it, in a terminal:'), { machine: m }));
  return { title: t(i18nKey('No browser on {machine} yet'), { machine: m }), note, command: String(step.command) };
}

export function machineChoices({ machines = [], providerOnHost = null, ready = null, t = (s) => s } = {}) {
  const out = [];
  for (const m of Array.isArray(machines) ? machines : []) {
    if (!m || !m.hostId) continue;
    const local = m.hostId === 'local';
    const name = local ? t(i18nKey('This computer')) : String(m.label || m.hostId);
    let state = 'ready', note = null, step = null;
    if (!local) {
      if (!m.connected) { state = 'offline'; note = t(i18nKey('Not connected right now.')); }
      else if (!(Array.isArray(m.capabilities) && m.capabilities.includes('browser-serve'))) { state = 'no-browser'; note = t(i18nKey("Its VibeSpace agent is too old to run a browser — update the agent on it.")); }
      else if (providerOnHost && providerOnHost.ok === false) { state = 'provider-here-only'; note = t(i18nKey('This browser runs only on the computer VibeSpace runs on.')); }
      // lane remote-profile-start: the machine's own `ready` fact (GET /api/browser/builds?host=) — no CLI / no Chrome there, BY NAME + the step
      else { const rd = ready && typeof ready === 'object' ? ready[m.hostId] : null; const w = rd && rd.step ? machineStepWords(rd.step, { machine: name, t }) : null; if (w) { state = 'needs-browser'; note = w.note; step = { code: String(rd.step.code || ''), command: w.command }; } }
    }
    out.push({ hostId: local ? null : String(m.hostId), name, state, pickable: MACHINE_PICKABLE.includes(state), note, step });
  }
  if (!out.some((m) => m.hostId === null)) out.unshift({ hostId: null, name: t(i18nKey('This computer')), state: 'ready', pickable: true, note: null, step: null });
  return out;
}

/** verify r1 (F7): which form the picker's door draws — 'keep' (the conversation's own kept browser becomes the profile as
 *  it is: Chromium, this computer, its build — said, not offered) | 'empty' (a new empty profile: browser, machine and build
 *  are offered) | null (the panel's own New profile…). The SERVER's plan decides (`adoptKeeps`, GET /api/browser/adopt —
 *  rung D keeps its directory too since lane browser-resume); only an unanswered GET falls back to the rung (C keeps). */
export function adoptFormOf(fromSession) {
  if (!fromSession) return null;
  const keeps = typeof fromSession.adoptKeeps === 'boolean' ? fromSession.adoptKeeps : fromSession.browserVariant === 'C';
  return keeps ? 'keep' : 'empty';
}

/** A port the cdp provider names: 1–65535, an integer. */
export function portOk(v) { const n = Number(String(v == null ? '' : v).trim()); return Number.isInteger(n) && n >= 1 && n <= 65535; }

/**
 * THE ONE BODY the dialog POSTs (POST /api/browser/profiles, or the adopt route from a conversation's picker):
 * `{label, provider, host?, cdpPort?, use?, browser?}` — `use` only when the list is narrowed (absent = every
 * conversation, the server's default), `browser` only when a build / path was chosen. → `{ok, body}` | `{ok:false,
 * field, code}` (the dialog says it beside the field, nothing is sent).
 */
export function createBody({ label = '', provider = 'chromium', host = null, cdpPort = '', mode = 'all', who = [], browser = null, adopt = null, cloneFrom = null } = {}) {
  const l = String(label || '').trim();
  if (!l) return { ok: false, field: 'label', code: 'label_required' };
  const body = { label: l };
  // verify r2 (B4): the picker's door names the FORM it drew — the adopt route refuses by name when the conversation's plan
  // changed since (never the other form applied: an empty profile for a dialog that said "keeps its logins", or the
  // conversation's own browser taken for a dialog that said "empty")
  if (adopt === 'keep' || adopt === 'empty') body.form = adopt;
  const cloning = !!cloneFrom && adopt == null; // lane browser-profile-clone: the copy runs its SOURCE's browser + build — neither is sent
  if (cloning && host) body.host = String(host);
  if (adopt !== 'keep' && !cloning) {
    body.provider = String(provider || 'chromium');
    if (host) body.host = String(host);
    if (body.provider === 'cdp') { if (!portOk(cdpPort)) return { ok: false, field: 'cdpPort', code: 'cdp_port_required' }; body.cdpPort = Number(String(cdpPort).trim()); }
  }
  if (mode === 'only') {
    const w = Array.isArray(who) ? who.filter(Boolean) : [];
    if (!w.length) return { ok: false, field: 'use', code: 'empty_list' };
    body.use = { mode: 'only', who: w };
  }
  if (browser && typeof browser === 'object' && browser.kind && browser.kind !== 'default' && !cloning) body.browser = { ...browser };
  // a folder is bound to the Chrome that wrote it — the server gives the copy its source's provider and build
  if (cloning) body.cloneFrom = String(cloneFrom);
  return { ok: true, body };
}

/**
 * A refused create, in the device's words by the server's CODE. null = the caller says the generic sentence + the
 * server's own (a code this table does not know yet — never silence).
 */
export function createRefusalWords(r, t = (s) => s) {
  const code = String((r && r.code) || '');
  const name = (r && r.name) || '';
  switch (code) {
    case 'label_required': return t(i18nKey('Give the profile a name.'));
    case 'label_taken': return t(i18nKey('A profile with this name already exists — pick another name.'));
    case 'cdp_port_required': return t(i18nKey('Enter the port the browser listens on (1–65535).'));
    case 'unsupported-host': return t(i18nKey('That machine is not paired with this VibeSpace any more — pick another.'));
    case 'provider_needs_local_key': case 'provider_local_only': return t(i18nKey('This browser runs only on the computer VibeSpace runs on.'));
    case 'provider_unavailable': case 'provider_unknown': return t(i18nKey("This browser can't be used in this version of VibeSpace."));
    case 'provider_needs_consent': return t(i18nKey('Off until you allow agents to use windows on your desktop (Settings → Desktop apps).'));
    case 'tier3_is_a_window_target': return t(i18nKey('A window on your desktop is shared with an agent from the window itself — it is not a profile.'));
    case 'sharing_refused': return t(i18nKey("Separate tabs can't be used here."));
    case 'dir_unwritable': return t(i18nKey("VibeSpace couldn't create the profile's folder on this computer."));
    case 'empty_list': return t(i18nKey('Pick All agents, or at least one conversation or Task Group.'));   // the who dialog's words (one control since lane everyone-principal)
    case 'no_browser_key': return r && r.why === 'remote' ? t(i18nKey('“{name}” runs on another machine — the Agent browser runs on this machine only'), { name }) : t(i18nKey('“{name}” has no browser of its own yet — restart it (Terminate → Resume), then add it'), { name });
    case 'session-gone': return t(i18nKey('That conversation is not running any more — pick it again from the list'));
    case 'unknown_task': return t(i18nKey('That Task Group no longer exists — pick another one'));
    case 'unknown_conversation': return t(i18nKey('That conversation can no longer be added — pick it again from the list'));
    case 'too_many': return t(i18nKey('At most {n} conversations and Task Groups'), { n: 64 });
    case 'adopt_failed': return t(i18nKey("This conversation's browser could not be kept as a profile."));
    case 'adopt_form_changed': return t(i18nKey("This conversation's browser changed since this dialog opened — nothing was created; the dialog was reopened with the form that applies now."));
    case 'adopt_keeps_browser': return t(i18nKey("This conversation's browser is kept with its logins, so the profile is that browser as it is — Chromium on this computer. Create it with those, then use Change build… if you want another build."));
    case 'agent_forbidden': return t(i18nKey('Only you can do this, not an agent.'));
    default: return cloneRefusalWords(r, t);
  }
}

// ── lane browser-profile-clone (B-9669, the owner 2026-10-08): "Copy logins from" — a STOPPED named profile's folder copied
// into the new one (a one-time snapshot). The server sends the rows (GET /api/browser/clone-sources?host=) with each
// profile's STATE; this file words them. Every named profile is a row — never hidden, never a disabled control explained
// only by a tooltip: the state is the row's own sentence.

/** The closed set of a source row's states (the server's `sourceState`), and the ones a person may pick. */
export const CLONE_SOURCE_STATES = Object.freeze(['stopped', 'running', 'leased', 'other-machine', 'no-folder']);
export const CLONE_PICKABLE = Object.freeze(['stopped', 'running']);
/** The platforms a copy is made on (src/browser-clone.js CLONE_PLATFORMS — measured on Linux only). */
const CLONE_PLATFORMS = ['linux'];

/** Can the machine the profile will run on copy one at all? `machine` = a GET /api/desktop/machines row (null = this
 *  computer). → `{ok}` | `{ok:false, code, note}` — the section says the note instead of rows. */
export function cloneMachineVerdict(machine, { t = (s) => s } = {}) {
  if (!machine || !machine.hostId || machine.hostId === 'local') return { ok: true };
  const name = String(machine.label || machine.hostId);
  if (machine.platform && !CLONE_PLATFORMS.includes(String(machine.platform))) return { ok: false, code: 'clone_unsupported_platform', note: t(i18nKey('Copying logins works only on Linux for now — {machine} runs {platform}.'), { machine: name, platform: platformName(machine.platform) }) };
  if (!(Array.isArray(machine.capabilities) && machine.capabilities.includes('browser-clone'))) return { ok: false, code: 'clone_agent_too_old', note: t(i18nKey("The VibeSpace agent on {machine} can't copy a profile yet — copying logins works on this computer only for now.")), machine: name };
  return { ok: true };
}
const platformName = (p) => (p === 'darwin' ? 'macOS' : p === 'win32' ? 'Windows' : String(p || ''));

/** Who holds a leased source, in words (the live conversation's name; one that is not running is said as such). */
export function holderNames(holders = [], t = (s) => s) {
  const names = (Array.isArray(holders) ? holders : []).map((h) => (h && h.name ? String(h.name) : t(i18nKey('a conversation that is not running')))).filter(Boolean);
  return [...new Set(names)].join(', ');
}

/** The section's rows: "Don't copy" first (the default), then every named profile on that machine with its state.
 *  → `[{key, id, name, state, pickable, note}]` (`key` 'none' or the profile id). */
export function cloneSourceChoices({ sources = [], t = (s) => s } = {}) {
  const out = [{ key: 'none', id: null, name: t(i18nKey("Don't copy — start signed out")), state: 'none', pickable: true, note: null }];
  for (const r of Array.isArray(sources) ? sources : []) {
    if (!r || !r.id) continue;
    const state = CLONE_SOURCE_STATES.includes(r.state) ? r.state : 'no-folder';
    let note = null;
    if (state === 'stopped') note = t(i18nKey('Stopped — its logins are copied as they are now.'));
    else if (state === 'running') note = t(i18nKey('Its browser is running — it will be stopped first.'));
    else if (state === 'leased') note = t(i18nKey('In use by {holder} — end that first; a browser is never taken from an agent.'), { holder: holderNames(r.holders, t) });
    else if (state === 'other-machine') note = t(i18nKey('Runs on another machine — a copy is made on the machine the new profile runs on.'));
    else note = t(i18nKey('VibeSpace keeps no browser folder for it — nothing to copy.'));
    out.push({ key: String(r.id), id: String(r.id), name: String(r.label || r.id), state, pickable: CLONE_PICKABLE.includes(state), note });
  }
  return out;
}

/** A size in GB with one decimal (the too-big refusal). */
const gb = (n) => (Math.round((Number(n) || 0) / (1024 * 1024 * 1024) * 10) / 10).toFixed(1);

/** A refused copy, by the server's CODE (`source` = the source's name, `holders`, `bytes`, `fsCode`). null = not a clone code. */
export function cloneRefusalWords(r, t = (s) => s) {
  const code = String((r && r.code) || '');
  const source = String((r && r.source) || '');
  switch (code) {
    case 'source_not_found': return t(i18nKey('The profile to copy from no longer exists — pick another.'));
    case 'source_same_machine_only': return t(i18nKey('A copy is made on the machine the profile runs on — pick a profile from that machine.'));
    case 'source_leased': return t(i18nKey('{source} is in use by {holder} — end that first, then copy it.'), { source, holder: holderNames(r.holders, t) });
    case 'source_still_running': return t(i18nKey("{source}'s browser did not stop within 10 seconds — nothing was copied. Try again."), { source });
    case 'source_no_folder': return t(i18nKey('{source} keeps no browser folder here — nothing to copy.'), { source });
    case 'clone_too_big': return t(i18nKey('{source} holds {size} GB to copy — a copy may be at most 2 GB.'), { source, size: gb(r.bytes) });
    case 'clone_failed': return t(i18nKey('The copy failed ({code}) — nothing was created.'), { code: String((r && r.fsCode) || 'error') });
    case 'clone_unsupported_platform': return t(i18nKey('Copying logins works only on Linux for now.'));
    case 'clone_agent_too_old': return t(i18nKey("That machine's VibeSpace agent can't copy a profile yet — copying logins works on this computer only for now."));
    default: return null;
  }
}

