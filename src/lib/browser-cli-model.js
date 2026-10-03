// THE BROWSER CLI VIBESPACE DRIVES — THE WORDS (lane browser-admin 2b, 2026-10-01). PURE, DOM-free, imports nothing, `t`
// injected. The server sends STRUCTURE (GET /api/browser/cli: the version the flag table was measured on and its download
// numbers, the choice `browser.cli`, the pinned install, the one on PATH, the one in use, the install slot) and this file
// says the Agent browser panel's row — "agent-browser: 0.38.1 (measured) · on PATH: 0.39.2 — drifts" — its ONE act
// (Install the measured version… / Use the measured version / Use the one on PATH), the download confirm (the package,
// the host it comes from, its size, the measured numbers) and an install's outcome by its CODE.
const i18nKey = (s) => s;

/** The row: `{text, warn, offer, version, title}` — `offer` ∈ install | install-again | use-pinned | use-path | null (one act);
 *  `version` = what an install offer installs (verify r1 F10: a version the user NAMED, not the measured one, is said by its
 *  number on the button and drifts on the row exactly as PATH's does). */
export function cliRowWords(f, t) {
  if (!f || typeof f !== 'object' || !f.table) return null;
  const parts = [t(i18nKey('agent-browser: {version} (measured)'), { version: f.table })];
  const choice = f.choice || { mode: 'path' };
  const pinned = f.pinned || null;
  const onPath = f.onPath && f.onPath.version ? String(f.onPath.version) : null;
  const ins = f.install || {};
  let warn = false, offer = null;
  if (choice.mode === 'path') {
    if (onPath) {
      const drifts = onPath !== f.table;
      parts.push(drifts ? t(i18nKey('on PATH: {version} — drifts'), { version: onPath }) : t(i18nKey('on PATH: {version}'), { version: onPath }));
      if (drifts) { warn = true; offer = 'install'; }
    } else { parts.push(t(i18nKey('none on PATH'))); warn = true; offer = 'install'; }
  } else if (pinned && pinned.installed) {
    if (pinned.version === f.table) parts.push(t(i18nKey("in use: VibeSpace's own copy")));
    else { parts.push(t(i18nKey("in use: VibeSpace's own {version} (your choice) — drifts"), { version: pinned.version })); warn = true; } // verify r1 (F10): the drift word with every mode
    if (onPath && onPath !== pinned.version) parts.push(t(i18nKey('on PATH: {version}'), { version: onPath }));
    offer = 'use-path';
  } else {
    parts.push(t(i18nKey('{version} chosen, not installed yet — the one on PATH is used'), { version: (pinned && pinned.version) || f.table }));
    if (onPath) parts.push(t(i18nKey('on PATH: {version}'), { version: onPath }));
    warn = true; offer = 'install';
  }
  // verify r2 (H1, the coordinator's ruling): a switch never restarts a running browser — each keeps the CLI it started with
  // until it stops; the row says how many still do, and how many run on a version no longer here (refused until restarted)
  const run = f.running && typeof f.running === 'object' ? f.running : {};
  const prev = Number(run.previous) || 0, gone = Number(run.gone) || 0;
  if (prev === 1) parts.push(t(i18nKey('1 browser still on the previous CLI — it switches when it stops')));
  else if (prev > 1) parts.push(t(i18nKey('{n} browsers still on the previous CLI — they switch when they stop'), { n: prev }));
  if (gone === 1) { parts.push(t(i18nKey('1 browser runs on a CLI that is no longer installed — restart it to use the current one'))); warn = true; }
  else if (gone > 1) { parts.push(t(i18nKey('{n} browsers run on a CLI that is no longer installed — restart them to use the current one'), { n: gone })); warn = true; }
  if (ins.running) { parts.push(t(i18nKey('installing…'))); offer = null; warn = false; }
  else if (ins.failed) { parts.push(t(i18nKey("the last install didn't finish"))); warn = true; offer = offer === 'use-path' ? offer : 'install-again'; }
  if (offer === 'install' && f.npm === false) { parts.push(t(i18nKey("VibeSpace can't install it here (npm is missing)"))); offer = null; }
  // the measured version installed while PATH is chosen: the one act is to USE it (no second download)
  if (offer === 'install' && choice.mode === 'path' && f.installedTable) offer = 'use-pinned';
  if (offer === 'install' && ins.other) offer = null; // the ONE slot is busy with another install (CloakBrowser)
  const version = choice.mode !== 'path' && pinned && pinned.version ? String(pinned.version) : String(f.table); // what Install… installs (the panel's own rule)
  return { text: parts.join(' · '), warn, offer, version, title: f.inUse && f.inUse.path ? String(f.inUse.path) : '' };
}

/** The ONE act's button label. `version` / `table` (verify r1 F10): an install of a version the user named says its number —
 *  "the measured version" is only ever the measured one. */
export function cliOfferLabel(offer, t, { version = null, table = null } = {}) {
  const named = version && table && String(version) !== String(table);
  switch (offer) {
    case 'install': return named ? t(i18nKey('Install agent-browser {version}…'), { version: String(version) }) : t(i18nKey('Install the measured version…'));
    case 'install-again': return t(i18nKey('Install again…'));
    case 'use-pinned': return t(i18nKey('Use the measured version'));
    case 'use-path': return t(i18nKey('Use the one on PATH'));
    default: return null;
  }
}

/** THE DOWNLOAD CONFIRM: the package, the host it comes from, the size (the measured numbers — never a guess), what
 *  happens after. `version` = the one installed (the measured one by default). */
export function cliConfirmWords(f, t, { version = null } = {}) {
  const v = version || (f && f.table) || '';
  const r = f && f.record && f.record.version === v ? f.record : null;
  const mb = (b) => Math.max(1, Math.round(Number(b) / 1e6));
  const message = r && Number(r.tarballBytes) > 0 && Number(r.unpackedBytes) > 0
    ? t(i18nKey('About {down} MB is downloaded once from {host} (the npm registry) and unpacked to about {size} MB in VibeSpace\'s data folder; no script of the package runs. VibeSpace then drives this version instead of the one on PATH.'), { down: mb(r.tarballBytes), host: String(r.registryHost), size: mb(r.unpackedBytes) })
    : t(i18nKey('It is downloaded from the npm registry into VibeSpace\'s data folder; no script of the package runs. VibeSpace then drives this version instead of the one on PATH.'));
  return { title: t(i18nKey('Install agent-browser {version}?'), { version: v }), message, confirmText: t(i18nKey('Download and install')), danger: false };
}

/** POST /api/browser/cli/install → `{tone, text}`. */
export function cliOutcomeWords(r, t) {
  if (!r || typeof r !== 'object') return { tone: 'error', text: t(i18nKey('Could not reach the server')) };
  if (r.ok && !r.error) return { tone: 'ok', text: t(i18nKey('Installing agent-browser {version}; VibeSpace switches to it when it is done.'), { version: String(r.version || '') }) };
  switch (String(r.code || '')) {
    case 'install_running': return { tone: 'warn', text: t(i18nKey('An install is already running.')) };
    case 'already_installed': return { tone: 'ok', text: t(i18nKey('That version is already installed.')) };
    case 'install_unavailable': return { tone: 'error', text: t(i18nKey("VibeSpace can't install it here (npm is missing)")) };
    case 'agent_forbidden': return { tone: 'error', text: t(i18nKey('Only you can do this, not an agent.')) };
    default: return { tone: 'error', text: t(i18nKey("The install didn't start.")) };
  }
}
