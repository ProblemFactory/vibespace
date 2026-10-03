// WHICH CHROME BUILD A PROFILE RUNS — THE WORDS (lane browser-admin 2a, 2026-10-01 — the owner: "不能pin指定版本").
// PURE, DOM-free, imports nothing, `t` injected. The server sends STRUCTURE — a profile's `browser` choice ({kind:'default'}
// | {kind:'build', version} | {kind:'path', path}), the build its browser RUNS (its own /json/version, `runningBuild`),
// a missing build's mark, a machine's build list (src/browser-builds.js `buildsView`) — and this file says it: the
// profile card's line, the Change build… dialog's rows (every build a row; one that cannot be picked greyed WITH its
// reason as text), the sentences above its button, a refusal by its CODE. The server's English is the agent's.
const i18nKey = (s) => s;

const VERSION_RE = /^\d{2,4}(?:\.\d{1,6}){2,3}$/;
const majorOf = (v) => { const n = Number(String(v || '').split('.')[0]); return Number.isInteger(n) && n > 0 ? n : null; };
const normalize = (c) => {
  if (!c || typeof c !== 'object') return { kind: 'default' };
  if (c.kind === 'build' && VERSION_RE.test(String(c.version || ''))) return { kind: 'build', version: String(c.version) };
  if (c.kind === 'path' && typeof c.path === 'string' && c.path.startsWith('/')) return { kind: 'path', path: c.path };
  return { kind: 'default' };
};

/** A choice in a sentence: "Chrome 151.0.7922.34" / "the browser CLI's default build" / "the chrome at /opt/x/chrome". */
export function choiceWords(choice, t) {
  const c = normalize(choice);
  if (c.kind === 'build') return t(i18nKey('Chrome {version}'), { version: c.version });
  if (c.kind === 'path') return t(i18nKey('the chrome at {path}'), { path: c.path });
  return t(i18nKey("the browser CLI's default build"));
}

/**
 * THE PROFILE CARD'S LINE (the Agent browser panel row, the switch dialog): the choice, "(pinned)" when it is one, and —
 * while the browser runs — the build it REPORTS (the fact, which for the default build is the only way to know which).
 * A chosen build that vanished says so first (the browser does not start until another is picked). null for a profile
 * whose provider runs its own build (CloakBrowser, a connected / cloud browser).
 */
export function cardBuildLine({ provider = 'chromium', choice = null, running = null, missing = null, live = false } = {}, t) {
  if (String(provider || 'chromium') !== 'chromium') return null;
  const c = normalize(choice);
  if (missing && c.kind !== 'default') return { text: t(i18nKey("{build} is no longer on this computer — it won't start until you choose another build (Change build…)."), { build: choiceWords(c, t) }), warn: true };
  const base = c.kind === 'default' ? choiceWords(c, t) : t(i18nKey('{build} (pinned)'), { build: choiceWords(c, t) });
  const r = typeof running === 'string' && running ? running : null;
  const text = live && r ? t(i18nKey('{choice} · running Chrome {version}'), { choice: base, version: r }) : base;
  return { text: text.charAt(0).toUpperCase() + text.slice(1), warn: false };
}

/**
 * THE CHANGE BUILD… ROWS (the New profile… dialog's build section uses the same rows): the default first, then every
 * build of the machine's list newest first, then — on this computer — "A chrome file I name". A build that cannot run
 * (no `chrome`, not executable) or is OLDER than the major that last wrote the profile (the version ladder — opening it
 * would damage the profile's saved logins; the server refuses it too) is shown greyed with its reason. A list that
 * could not be read says why in one note row; the default stays pickable. → `[{key, kind, version?, label, pickable,
 * note, current}]`.
 */
export function buildRows(listing, { choice = null, lastChromiumMajor = null, local = true, machine = '', t } = {}) {
  const cur = normalize(choice);
  const rows = [{ key: 'default', kind: 'default', label: t(i18nKey("The browser CLI's default build")), pickable: true, note: t(i18nKey('Whatever the browser CLI picks — usually the newest Chrome it installed.')), current: cur.kind === 'default' }];
  const l = listing && typeof listing === 'object' ? listing : null;
  if (!l || l.ok === false) {
    const why = !l ? t(i18nKey('The list of Chrome builds could not be read.'))
      : l.code === 'builds_unsupported' ? t(i18nKey("{machine}'s VibeSpace agent can't list Chrome builds yet — update the agent on it."), { machine: machine || t(i18nKey('This computer')) })
        : t(i18nKey('The list of Chrome builds could not be read.'));
    rows.push({ key: 'note', kind: 'note', label: why, pickable: false, note: null, current: false });
  } else {
    const wrote = Number.isInteger(lastChromiumMajor) ? lastChromiumMajor : null;
    for (const b of Array.isArray(l.builds) ? l.builds : []) {
      if (!b || !VERSION_RE.test(String(b.version || ''))) continue;
      const major = majorOf(b.version);
      let note = null, pickable = true;
      if (!b.usable) { pickable = false; note = b.why === 'not-executable' ? t(i18nKey("Its chrome file can't be run (not executable).")) : t(i18nKey('Its folder has no chrome file.')); }
      else if (wrote != null && major != null && major < wrote) { pickable = false; note = t(i18nKey('Older than the Chrome that last opened this profile ({wrote}) — opening it there would damage its saved logins.'), { wrote }); }
      rows.push({ key: 'v:' + b.version, kind: 'build', version: String(b.version), label: t(i18nKey('Chrome {version}'), { version: b.version }), pickable, note, current: cur.kind === 'build' && cur.version === b.version });
    }
    if (!(l.builds || []).length) rows.push({ key: 'note', kind: 'note', label: t(i18nKey('No Chrome builds are installed there yet.')), pickable: false, note: null, current: false });
    // the chosen build is GONE from the list: its row stays (greyed, said) so the person sees what it was set to
    if (cur.kind === 'build' && !rows.some((r) => r.kind === 'build' && r.version === cur.version)) rows.splice(1, 0, { key: 'v:' + cur.version, kind: 'build', version: cur.version, label: t(i18nKey('Chrome {version}'), { version: cur.version }), pickable: false, note: t(i18nKey('No longer installed.')), current: true });
  }
  if (local) rows.push({ key: 'path', kind: 'path', label: t(i18nKey('A chrome file I name')), pickable: true, note: t(i18nKey('The full path of a Chrome or Chromium program on this computer.')), current: cur.kind === 'path', path: cur.kind === 'path' ? cur.path : '' });
  return rows;
}

/** A picked row → the choice the server is sent; null when it is incomplete (a path row with no absolute path). */
export function choiceOfRow(row, pathText = '') {
  if (!row || !row.pickable) return null;
  if (row.kind === 'default') return { kind: 'default' };
  if (row.kind === 'build') return { kind: 'build', version: row.version };
  if (row.kind === 'path') { const p = String(pathText || '').trim(); return p.startsWith('/') ? { kind: 'path', path: p } : null; }
  return null;
}

/** The sentences above the Change button: what happens to a RUNNING browser and who is told (never a surprise restart);
 *  a browser somebody DRIVES by hand right now (verify r1 F1: `driven` = the driver's key) says so first — the server refuses
 *  the change (`browser_driven`) until it is handed back. */
export function changeSentences({ live = false, holders = 0, driven = null } = {}, t) {
  if (!live) return [{ text: t(i18nKey("The browser isn't running; its next start uses this build.")), warn: false }];
  if (driven) return [{ text: t(i18nKey('Somebody is driving this browser by hand right now — hand it back first; changing the build would restart it under their hands.')), warn: true }];
  const n = Math.max(0, Number(holders) || 0);
  return [{ text: n
    ? t(i18nKey('Its browser restarts now. {n} conversation(s) using it are told what was interrupted, and their pages reopen.'), { n })
    : t(i18nKey('Its browser restarts now; its open pages reopen.')), warn: n > 0 }];
}

/** How to add a build (installing one is the user's act, by hand for now): the command, where to run it, and that the list
 *  refreshes when the dialog opens again. null without a command. */
export function installHint({ command = '', local = true } = {}, t) {
  const c = String(command || '').trim();
  if (!c) return null;
  return local
    ? t(i18nKey('To add a Chrome build, run {command} in a terminal on this computer; it appears here the next time you open this.'), { command: c })
    : t(i18nKey('To add a Chrome build, run {command} on that machine; it appears here the next time you open this.'), { command: c });
}

/** The success toast. */
export function changedWords({ label = '', to = null, restarted = false, told = 0 } = {}, t) {
  const build = choiceWords(to, t);
  if (!restarted) return t(i18nKey('{label} will run {build} from its next start.'), { label, build });
  return Number(told) > 0 ? t(i18nKey('Restarted {label} on {build}; {n} conversation(s) were told.'), { label, build, n: Number(told) }) : t(i18nKey('Restarted {label} on {build}.'), { label, build });
}

/** A refused change / create, in the device's words by the server's CODE. null = the caller adds the server's sentence. */
export function buildRefusalWords(r, t) {
  switch (String((r && r.code) || '')) {
    case 'browser_build_missing': return t(i18nKey('That Chrome build is not installed there any more — pick another.'));
    case 'browser_build_not_executable': return t(i18nKey("That Chrome build's program can't be run."));
    case 'browser_path_missing': return t(i18nKey('There is no file at that path.'));
    case 'browser_path_not_executable': return t(i18nKey("The file at that path can't be run."));
    case 'browser_choice_invalid': return t(i18nKey('Enter the full path of the chrome program (it starts with /).'));
    case 'browser_choice_provider': return t(i18nKey('Only a Chromium profile runs a Chrome build you choose.'));
    case 'browser_choice_user_only': case 'agent_forbidden': return t(i18nKey('Only you can do this, not an agent.'));
    case 'builds_unsupported': return t(i18nKey("That machine's VibeSpace agent can't list Chrome builds yet — update the agent on it."));
    case 'builds_unreadable': return t(i18nKey('The list of Chrome builds could not be read.'));
    case 'downgrade_refused': return t(i18nKey('That build is older than the Chrome that last opened this profile — opening it would damage its saved logins.'));
    case 'downgrade_unknown': return t(i18nKey("VibeSpace can't tell whether that build is older than the Chrome that last opened this profile. Tick the box to use it anyway."));
    case 'build_noop': return t(i18nKey('The profile already runs that build.'));
    case 'browsing_yourself': return t(i18nKey('You are browsing this profile yourself — close your browsing first.'));
    case 'browser_driven': return t(i18nKey('Somebody is driving this browser by hand right now — hand it back first.'));
    case 'browser_restarting': return t(i18nKey('The browser is restarting — try again in a moment.'));
    default: return null;
  }
}
