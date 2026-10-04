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
export function buildRows(listing, { choice = null, lastChromiumMajor = null, local = true, machine = '', t, download = null } = {}) {
  const cur = normalize(choice);
  const rows = [{ key: 'default', kind: 'default', label: t(i18nKey("The browser CLI's default build")), pickable: true, note: t(i18nKey('Whatever the browser CLI picks — usually the newest Chrome it installed.')), current: cur.kind === 'default' }];
  const l = listing && typeof listing === 'object' ? listing : null;
  // ASKED, NOT YET ANSWERED (lane mirror-green-ui, 2.369.205): `{pending:true}` — the dialog drew its build section
  // before the list came back and said "could not be read" about a list it had not even asked for yet (a paired
  // machine answers through its agent: seconds of a false failure). Waiting is said as waiting.
  if (l && l.pending) rows.push({ key: 'note', kind: 'note', label: t(i18nKey('Reading the list of Chrome builds…')), pickable: false, note: null, current: false });
  else if (!l || l.ok === false) {
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
  // lane chrome-builds-download: the last row opens the picker (this computer, Linux x64 — the server's `download.offered`); an act, never a choice
  if (local && download && download.offered) rows.push({ key: 'download', kind: 'download', label: t(i18nKey('Download another build…')), pickable: false, note: t(i18nKey("From Google's Chrome for Testing — every version, its compatibility said before it downloads.")), current: false });
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
export function installHint({ command = '', local = true, download = null } = {}, t) {
  const c = String(command || '').trim();
  if (download && download.offered) return null; // lane chrome-builds-download: the row "Download another build…" is the way here
  if (!c) return null;
  if (download && local) return t(i18nKey('Downloads are offered on Linux x64 computers; to add a Chrome build on this one ({machine}), run {command} in a terminal.'), { machine: String(download.machine || ''), command: c });
  if (download) return t(i18nKey("Downloads to a paired machine aren't offered yet; to add a Chrome build there, run {command} on that machine."), { command: c });
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

// ── lane chrome-builds-download (design 004, B-80c1): "Download another build…" — THE PICKER'S WORDS. The server sends each
// version's verdict as STRUCTURE (src/browser-builds.js buildCompatVerdict: `hard` rows that refuse, `chips` the person reads)
// and the slot's state; this says them. ──
const mb = (b) => Math.max(1, Math.round(Number(b) / 1e6));
/** The intro: where the builds come from and the one law the table applies (a profile opened by a major refuses every lower one). */
export function pickerIntro(t) {
  return t(i18nKey("Chrome for Testing builds, from Google. Once a profile is opened by a Chrome version, every older major is refused for it. Canary and Dev change weekly; Stable is what the browser CLI's own install picks."));
}
/** A channel row's head ("Stable · 154.0.8037.92" — the channel names are Google's) / an older major's. */
export function channelLabel(row) { return `${String((row && row.channel) || '')} · ${String((row && row.version) || '')}`; }
export function majorLabel(m, t) { return t(i18nKey('Chrome {major} · newest {version} · {n} versions'), { major: m.major, version: m.newest, n: m.count }); }
/** A version's verdict → its lines: the HARD refusals first (`hard`), then every chip in words. `warn` = said in amber. */
export function verdictLines(v, t) {
  const out = [];
  for (const h of (v && Array.isArray(v.hard) ? v.hard : [])) {
    if (h.code === 'build_platform_unsupported') out.push({ text: h.command ? t(i18nKey('Downloads are offered on Linux x64 computers; on {machine} install by hand: {command}'), { machine: String(h.machine || ''), command: h.command }) : t(i18nKey('Downloads are offered on Linux x64 computers.')), warn: true, hard: true });
    else if (h.code === 'disk') out.push({ text: t(i18nKey('Needs about {need} MB free, {free} MB left on {path}'), { need: mb(h.need), free: Math.floor(Number(h.free) / 1e6), path: String(h.path || '') }), warn: true, hard: true });
  }
  for (const c of (v && Array.isArray(v.chips) ? v.chips : [])) {
    if (c.kind === 'present') out.push({ text: t(i18nKey('Already on this computer')), warn: false });
    else if (c.kind === 'cli') out.push({ text: t(i18nKey('Driven by agent-browser {version}'), { version: String(c.version || '') }), warn: false });
    else if (c.kind === 'census' && c.relation === 'censused') out.push({ text: t(i18nKey('Fully classified for the live view')), warn: false });
    else if (c.kind === 'census' && c.relation === 'newer') out.push({ text: t(i18nKey('Newer than the census ({census}): what it adds is refused by name while you drive the browser; everything else works'), { census: String(c.census || '') }), warn: false });
    else if (c.kind === 'census' && c.relation === 'older') out.push({ text: t(i18nKey('Older than the census: a few methods it lacks are listed harmlessly')), warn: false });
    else if (c.kind === 'profile') out.push({ text: t(i18nKey("Older than the Chrome that last opened {label} ({wrote}) — can't be picked for it; fine for a new profile"), { label: String(c.label || ''), wrote: c.wrote }), warn: true });
    else if (c.kind === 'cloak') out.push({ text: c.reach === 'both' ? t(i18nKey('A profile opened with it can still switch to CloakBrowser (Free or Pro) later'))
      : c.reach === 'pro' ? t(i18nKey('A profile opened with it can switch to CloakBrowser Pro (Chromium {pro}) later, not to Free ({free}): switching down is refused'), { free: c.free, pro: c.pro })
        : t(i18nKey("A profile opened with it can't switch to CloakBrowser later (Free {free} / Pro {pro}): switching down is refused"), { free: c.free, pro: c.pro }), warn: c.reach !== 'both' });
    // verify r1 (H1): newer than every build here = the browser CLI's next default (it launches its newest build)
    else if (c.kind === 'default') out.push({ text: (c.users || []).length ? t(i18nKey("Becomes the browser CLI's default build (now {from}): {who} and every conversation's browser start with it next time — after that they can't go back to an older Chrome"), { from: String(c.from || '—'), who: c.users.join(', ') }) : t(i18nKey("Becomes the browser CLI's default build (now {from}): every conversation's browser starts with it next time — after that it can't go back to an older Chrome"), { from: String(c.from || '—') }), warn: true });
  }
  return out;
}
/** THE CONFIRM (the cliConfirmWords shape): the version, the host it comes from, the size, where it lands, how it is checked,
 *  what happens after. ONE button: Download. */
export function downloadConfirmWords({ version = '', host = '', bytes = null, root = '', becomesDefault = false } = {}, t) {
  const where = Number(bytes) > 0 ? t(i18nKey('About {size} MB comes from {host} and unpacks to about {unpacked} MB in {root}.'), { size: mb(bytes), host, unpacked: mb(Number(bytes) * 2), root }) : t(i18nKey('It comes from {host} and unpacks into {root}.'), { host, root });
  return { title: t(i18nKey('Download Chrome {version}?'), { version }), message: where + ' ' + t(i18nKey("It is checked against the server's own length and checksum — Google publishes no separate one. Nothing restarts; it becomes a build you can pick. Chrome for Testing never auto-updates.")) + (becomesDefault ? ' ' + t(i18nKey("It also becomes the browser CLI's default build: profiles on the default and every conversation's browser start with it next time.")) : ''), confirmText: t(i18nKey('Download')), danger: false };
}
/** A refused download / removal / list read, by its CODE. null = the caller adds the server's sentence. */
export function downloadRefusalWords(r, t) {
  switch (String((r && r.code) || '')) {
    case 'install_running': return t(i18nKey('Another install is running — download again when it is done.'));
    case 'build_present': return t(i18nKey('That build is already on this computer.'));
    case 'unzip_unavailable': return t(i18nKey('unzip is missing on this computer — install it (apt install unzip), then try again.'));
    case 'build_url_offhost': return t(i18nKey("Google's list pointed that download at another site — VibeSpace refused it."));
    case 'build_version_unknown': return t(i18nKey("That version is not in Google's list."));
    case 'build_list_unreachable': case 'build_fetch_failed': return t(i18nKey("Google's server could not be reached."));
    case 'build_list_invalid': return t(i18nKey("Google's list could not be read."));
    case 'disk': return r && r.build && Number(r.build.need) > 0 ? verdictLines({ hard: [{ code: 'disk', ...r.build }] }, t)[0].text : t(i18nKey('Not enough free disk space.'));
    case 'build_check_failed': return t(i18nKey("The downloaded file didn't match the server's length or checksum — nothing was kept."));
    case 'build_zip_shape': return t(i18nKey("The downloaded file isn't a Chrome build VibeSpace can unpack safely — nothing was kept."));
    case 'build_unpack_failed': return t(i18nKey('The build could not be unpacked — nothing was kept.'));
    case 'build_verify_failed': return t(i18nKey("The downloaded Chrome didn't say the version it should — nothing was kept."));
    case 'build_stalled': return t(i18nKey("The download didn't finish in 15 minutes — nothing was kept."));
    case 'build_in_use': { const who = r && r.build ? [...(r.build.profiles || []), ...(r.build.running || [])] : []; return t(i18nKey('That build is in use — {who}. Pick another build for them first.'), { who: who.join(', ') }); }
    case 'build_not_downloaded': return t(i18nKey('That build was installed by hand — VibeSpace removes only the builds it downloaded.'));
    case 'build_removing': return t(i18nKey('A removal of that build was cut short — remove its folder by hand.'));
    case 'build_platform_unsupported': return t(i18nKey('Downloads are offered on Linux x64 computers.'));
    default: return buildRefusalWords(r, t);
  }
}
/** THE PROGRESS LINE (the slot's state, polled): downloading… N MB of M MB → checking… → unpacking… → verifying…; ready;
 *  failed with its reason (and Try again); another install holding the slot. null = nothing to say. */
export function downloadProgressWords(i, t) {
  if (!i || typeof i !== 'object') return null;
  const version = String(i.version || '');
  if (i.running) {
    if (i.step === 'check') return { text: t(i18nKey('Checking Chrome {version}…'), { version }), busy: true };
    if (i.step === 'unpack') return { text: t(i18nKey('Unpacking Chrome {version}…'), { version }), busy: true };
    if (i.step === 'verify') return { text: t(i18nKey('Verifying Chrome {version}…'), { version }), busy: true };
    return { text: t(i18nKey('Downloading Chrome {version}… {got} MB of {total} MB'), { version, got: Math.floor(Number(i.bytes || 0) / 1e6), total: Number(i.total) > 0 ? mb(i.total) : '?' }), busy: true };
  }
  if (i.other) return { text: t(i18nKey('Another install is running ({what}) — downloads wait for it.'), { what: i.other === 'cli' ? t(i18nKey('the browser CLI')) : 'CloakBrowser' }), busy: true };
  if (i.done) return { text: t(i18nKey('Chrome {version} is ready — pick it in the list.'), { version: String(i.done) }), done: true };
  if (i.failed) return { text: t(i18nKey("Chrome {version} didn't download — {reason}"), { version, reason: downloadRefusalWords({ code: i.code }, t) || String(i.error || '') }), warn: true, failed: true };
  return null;
}
/** An installed build's line in the picker: its size and whose it is; `remove` = the Remove act is offered (VibeSpace downloaded
 *  it and nobody chooses or runs it). */
export function installedWords(b, t) {
  const who = [...((b && b.profiles) || []), ...((b && b.running) || [])];
  const size = mb((b && b.bytes) || 0);
  if (who.length) return { text: t(i18nKey('{size} MB · in use by {who}'), { size, who: who.join(', ') }), remove: false };
  if (b && b.downloaded) return { text: t(i18nKey('{size} MB · downloaded by VibeSpace'), { size }), remove: true };
  return { text: t(i18nKey('{size} MB · installed by hand — VibeSpace removes only the builds it downloaded'), { size }), remove: false };
}
export function freeWords({ free = null, freePath = '' } = {}, t) { return Number.isFinite(Number(free)) && free != null ? t(i18nKey('{free} GB free on {path}'), { free: (Number(free) / 1e9).toFixed(1), path: String(freePath || '') }) : null; }
export function removeConfirmWords(b, t) { return { title: t(i18nKey('Remove Chrome {version}?'), { version: String(b.version || '') }), message: t(i18nKey('Its folder ({size} MB) is deleted from this computer; no profile uses it. You can download it again later.'), { size: mb(b.bytes || 0) }), confirmText: t(i18nKey('Remove')), danger: true }; }
export function removedWords(version, t) { return t(i18nKey('Removed Chrome {version}.'), { version: String(version || '') }); }
