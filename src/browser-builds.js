'use strict';
/**
 * WHICH CHROME BUILD A PROFILE RUNS — SHARED (node builtins + the PURE switch model; the daemon bundles it through
 * src/browser-serve.js). Lane browser-admin 2a (2026-10-01, the owner: "不能pin指定版本").
 *
 * THE FACT. The browser CLI keeps one directory per Chrome build it installed under the account's
 * `~/.agent-browser/browsers/` — measured on this box: `chrome-146.0.7680.153/chrome`, `chrome-151.0.7922.34/chrome`
 * (Chrome for Testing's linux layout: the executable `chrome` at the top of the build's directory). Which builds a
 * machine HAS is a fact about THAT machine (`listBuilds`, run where the browser runs: in-process for this machine, the
 * `browser-serve` op's `builds` action inside a paired machine's daemon — capability `browser-builds`; an older daemon
 * is never asked, it is refused "cannot list builds" by name, never a hang).
 *
 * THE CHOICE. `profile.browser` = `{kind:'default'}` (the CLI's own pick — what every profile ran before this lane)
 * | `{kind:'build', version}` (a build in that machine's list) | `{kind:'path', path}` (a chrome file the user names —
 * a HUMAN act, cookie-only, exactly the rule of `browser.cloak.executablePath`). The agent can never set one:
 * `--executable-path` stays a refused LAUNCH flag, `install` stays NOT_OFFERED, and `by !== 'user'` is refused here.
 *
 * THE VERDICT (`browserChoiceVerdict`), one order everywhere (the create, Change build…, every launch): a choice is
 * well-formed · the user's · for chromium (CloakBrowser runs its own measured build; a cdp / cloud browser is not
 * started by us) · the build is in THAT machine's list and its `chrome` is a regular executable file (a path: the
 * same, read where it runs) · not older than the major that last wrote the profile's directory (the §7.4 version
 * ladder — `SW.versionLadder`; a directory nothing ever wrote has no ladder). A build that VANISHED is refused at the
 * launch by name (`browser_build_missing`) — never a silent fall back to another build.
 *
 * THE LAUNCH. The keeper hands the chosen executable to the CLI through `AGENT_BROWSER_EXECUTABLE_PATH`
 * (`SW.launchEnvFor('chromium', {executablePath})`) on EVERY call of the browser's own session — the measured relaunch
 * rule cloak's executable already rides (a later call whose launch view differs relaunches Chrome, measured on 0.38.1).
 */
const fs = require('fs');
const path = require('path');
const SW = require('./browser-switch.js');

/** Where the CLI keeps its Chrome builds, relative to the account's home. */
const BUILDS_REL = path.join('.agent-browser', 'browsers');
/** A build directory's name: `chrome-<dotted version>` (Chrome for Testing: four parts; three accepted). */
const BUILD_DIR_RE = /^chrome-(\d{2,4}(?:\.\d{1,6}){2,3})$/;
const VERSION_RE = /^\d{2,4}(?:\.\d{1,6}){2,3}$/;
/** The listing's bound (a directory a person fills by hand stays small; a runaway one is cut, said by `cut`). */
const BUILDS_MAX = 64;
/** Every refusal this module answers — a closed set the routes' STATUS table mirrors. */
const BUILD_CODES = Object.freeze(['browser_choice_invalid', 'browser_choice_user_only', 'browser_choice_provider', 'builds_unsupported', 'builds_unreadable', 'browser_build_missing', 'browser_build_not_executable', 'browser_path_missing', 'browser_path_not_executable', 'downgrade_refused', 'downgrade_unknown',
  // lane chrome-builds-download (design 004): the download's refusals, each said by name
  'build_platform_unsupported', 'disk', 'build_present', 'build_version_invalid', 'build_version_unknown', 'build_list_invalid', 'build_list_unreachable', 'build_url_offhost', 'build_fetch_failed', 'build_check_failed', 'build_zip_shape', 'build_unpack_failed', 'build_verify_failed', 'build_in_use', 'build_not_downloaded', 'build_removing', 'unzip_unavailable', 'install_running', 'build_stalled']);

/** `chrome-151.0.7922.34` → `{version:'151.0.7922.34', major:151}`; null for anything else. */
function parseBuildDir(name) {
  const m = BUILD_DIR_RE.exec(String(name == null ? '' : name));
  return m ? { version: m[1], major: Number(m[1].split('.')[0]) } : null;
}
/** Numeric compare of two dotted versions (a missing part = 0). */
function compareVersions(a, b) {
  const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
/** The executable of a build directory (the measured linux layout; the same file name on every platform the CLI's
 *  `install` writes `chrome` for — a platform whose layout differs simply lists the build as not usable, with why). */
function buildExecutable(root, version) { return path.join(String(root), `chrome-${String(version)}`, 'chrome'); }

/** The facts of ONE file the launch would run: a regular file, executable. `{usable, why}` (why = a code). */
function fileFact(p, { fsImpl = fs } = {}) {
  let st;
  try { st = fsImpl.statSync(p); } catch { return { usable: false, why: 'missing' }; }
  if (!st.isFile()) return { usable: false, why: 'not-a-file' };
  if (!(st.mode & 0o111)) return { usable: false, why: 'not-executable' };
  return { usable: true, why: null };
}

/**
 * THE MACHINE FACT: the builds under `<homeDir>/.agent-browser/browsers` on the machine this runs on. Never throws.
 * → `{ok:true, root, builds:[{version, major, path, usable, why}], missing, cut}` (newest first; `missing` = no such
 * directory — no build was ever installed; `cut` = more than BUILDS_MAX entries) | `{ok:false, code:'builds_unreadable',
 * error, root}` (the directory exists and cannot be read — never reported as "no builds").
 */
function listBuilds({ homeDir, fsImpl = fs } = {}) {
  const root = path.join(String(homeDir || ''), BUILDS_REL);
  let names;
  try { names = fsImpl.readdirSync(root); }
  catch (e) {
    if (e && e.code === 'ENOENT') return { ok: true, root, builds: [], missing: true, cut: false };
    return { ok: false, code: 'builds_unreadable', error: `the Chrome builds folder ${root} could not be read (${e && e.code ? e.code : e && e.message})`, root };
  }
  const parsed = names.map((n) => parseBuildDir(n)).filter(Boolean).sort((a, b) => compareVersions(b.version, a.version));
  const cut = parsed.length > BUILDS_MAX;
  const builds = parsed.slice(0, BUILDS_MAX).map((b) => { const exe = buildExecutable(root, b.version); return { ...b, path: exe, ...fileFact(exe, { fsImpl }) }; });
  return { ok: true, root, builds, missing: false, cut };
}

/** A choice, normalised: the default | a build by version | an absolute path to a chrome file. null = not a choice. */
function normalizeBrowserChoice(v) {
  if (v == null || v === '' || v === 'default') return { kind: 'default' };
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const kind = String(v.kind || '');
  if (kind === 'default') return { kind: 'default' };
  if (kind === 'build') { const ver = String(v.version == null ? '' : v.version).trim(); return VERSION_RE.test(ver) ? { kind: 'build', version: ver } : null; }
  if (kind === 'path') {
    const p = String(v.path == null ? '' : v.path);
    if (!p.startsWith('/') || p.length > 4096 || /[\0\n\r]/.test(p)) return null;
    const n = path.posix.normalize(p);
    return n === '/' ? null : { kind: 'path', path: n };
  }
  return null;
}
/** Two choices name the same thing. */
function sameChoice(a, b) {
  const x = normalizeBrowserChoice(a) || { kind: 'default' }, y = normalizeBrowserChoice(b) || { kind: 'default' };
  return x.kind === y.kind && (x.kind === 'default' || (x.kind === 'build' ? x.version === y.version : x.path === y.path));
}

/**
 * THE VERDICT, in this order and no other (each rung closes a place that would otherwise fail silently):
 *   1 a well-formed choice · 2 the default asks nothing (ok, no executable) · 3 the USER's (an agent never chooses a
 *   build) · 4 chromium only · 5 the machine's list could be read (`builds` null ⇒ `buildsError` or builds_unsupported)
 *   · 6 the build is listed / the path exists · 7 its `chrome` is a regular executable file · 8 the version ladder when
 *   the directory was ever written (`written`) and the check asks for it (`ladder`, the create / Change build… — a
 *   launch runs the build already judged).
 * Inputs: `builds` = a `listBuilds` answer for THE machine the profile runs on; `pathFact` = `fileFact` of a named path
 * read on that machine (null ⇒ not read: a paired machine's path is judged there, at its start); `machine` = its name
 * in sentences. → `{ok:true, choice, executablePath, version, major}` | `{ok:false, code, error, …}`.
 */
function browserChoiceVerdict({ choice, provider = null, by = 'user', builds = null, buildsError = null, pathFact = null, machine = 'this computer', label = 'this profile', recordedMajor = null, dirMajor = null, written = false, ladder = false, confirmed = false } = {}) {
  const c = normalizeBrowserChoice(choice);
  if (!c) return { ok: false, code: 'browser_choice_invalid', error: 'a browser build is {kind:"default"} | {kind:"build", version:"151.0.7922.34"} | {kind:"path", path:"/absolute/path/to/chrome"}' };
  if (c.kind === 'default') return { ok: true, choice: c, executablePath: null, version: null, major: null };
  if (by !== 'user') return { ok: false, code: 'browser_choice_user_only', error: 'which Chrome build a profile runs is the user\'s choice (Agent browser panel → Change build…) — an agent never sets one; `vibespace-browser providers` lists the builds this machine has' };
  if (!(require('./browser-profiles.js').providerRow(provider) || {}).buildChoice) return { ok: false, code: 'browser_choice_provider', error: `a Chrome build is chosen for a Chromium profile only — "${label}" runs ${provider} (CloakBrowser runs its own measured build; a connected or cloud browser is not started by VibeSpace)` };
  let executablePath, version = null, major = null;
  if (c.kind === 'build') {
    if (!builds || builds.ok === false) {
      const e = buildsError || (builds && builds.ok === false ? builds : null);
      return { ok: false, code: (e && e.code) || 'builds_unsupported', error: (e && e.error) || `the Chrome builds on ${machine} could not be listed` };
    }
    const b = (builds.builds || []).find((x) => x && x.version === c.version);
    if (!b) return { ok: false, code: 'browser_build_missing', version: c.version, error: `Chrome ${c.version} is not installed on ${machine} (no ~/.agent-browser/browsers/chrome-${c.version}) — pick another build, or install it there and choose it again` };
    if (!b.usable) return { ok: false, code: 'browser_build_not_executable', version: c.version, why: b.why, error: `Chrome ${c.version} on ${machine} has no runnable chrome file (${b.why === 'missing' ? 'chrome is missing from its folder' : b.why === 'not-executable' ? 'chrome is not executable' : 'chrome is not a regular file'})` };
    executablePath = b.path; version = b.version; major = b.major;
  } else {
    if (pathFact && !pathFact.usable) return { ok: false, code: pathFact.why === 'missing' ? 'browser_path_missing' : 'browser_path_not_executable', why: pathFact.why, error: pathFact.why === 'missing' ? `there is no file at ${c.path} on ${machine}` : `${c.path} on ${machine} is not a runnable file (${pathFact.why})` };
    executablePath = c.path;
  }
  if (ladder && written) {
    const lv = SW.versionLadder({ target: version ? `Chrome ${version}` : `the chrome at ${c.path}`, targetMajor: major, recordedMajor, dirMajor, confirmed });
    if (!lv.ok) return { ok: false, code: lv.code, error: lv.error, needsConfirm: !!lv.needsConfirm, waysOut: lv.waysOut || [], wrote: lv.wrote != null ? lv.wrote : null, targetMajor: major };
  }
  return { ok: true, choice: c, executablePath, version, major };
}

/** The build a RUNNING browser reports (its own `/json/version` "Browser": `Chrome/151.0.7922.34`, `HeadlessChrome/…`)
 *  — the FACT, never the choice. null when it names none. */
function runningBuildOf(browserString) {
  const m = /(?:Headless)?(?:Chrome|Chromium)\/(\d{2,4}(?:\.\d{1,6}){1,3})/i.exec(String(browserString || ''));
  return m ? m[1] : null;
}
/** The choice as the USER's surfaces read it (the panel row, the Change build… dialog: the path he typed is his). */
function choiceView(choice) {
  const c = normalizeBrowserChoice(choice) || { kind: 'default' };
  return c.kind === 'build' ? { kind: 'build', version: c.version } : c.kind === 'path' ? { kind: 'path', path: c.path } : { kind: 'default' };
}
/** verify r1 (F5): what an AGENT may read of a choice — a FACT by kind: a build by its version, a chrome file the user named
 *  by KIND ONLY (its path is a place on the machine the user chose; versions only cross to an agent, never a path). */
function agentChoiceView(choice) {
  const c = normalizeBrowserChoice(choice) || { kind: 'default' };
  return c.kind === 'build' ? { kind: 'build', version: c.version } : c.kind === 'path' ? { kind: 'path' } : { kind: 'default' };
}
/** verify r1 (F5): a vanished build's mark for an AGENT — the version of a build, never the path of a named file. */
function agentMissingView(m) {
  if (!m || typeof m !== 'object') return null;
  return { kind: m.kind || null, what: m.kind === 'path' ? null : (m.what || null), at: m.at || null, code: m.code || null };
}

/** A choice in the agent's / the journal's words (English — the client words its own with t()). */
function buildWords(choice) {
  const c = normalizeBrowserChoice(choice) || { kind: 'default' };
  return c.kind === 'build' ? `Chrome ${c.version}` : c.kind === 'path' ? `the chrome at ${c.path}` : 'the default build';
}
/** The ONE For-you notice of a chosen build that is gone (the keeper files it once per profile and choice): plain words,
 *  what to do — the English is the inbox's own (its items are stored strings, never re-translated). */
function missingNotice({ label = 'a profile', choice = null } = {}) {
  const c = normalizeBrowserChoice(choice) || { kind: 'default' };
  const what = c.kind === 'build' ? `Chrome ${c.version}` : c.kind === 'path' ? `the browser at ${c.path}` : 'its browser';
  return {
    text: `"${label}" cannot start: ${what} is no longer on this computer`,
    detail: `The profile "${label}" is set to run ${what}, and it is not there any more, so its browser did not start (VibeSpace never switches it to another build by itself). Open the Agent browser panel and choose Change build… on "${label}" to pick another build or the default one — or install ${what} again, and the next command starts it.`,
  };
}
/** The listing as an agent / a remote answer carries it (no `fs` handles, plain JSON). */
function buildsView(l) {
  if (!l || l.ok === false) return l ? { ok: false, code: l.code, error: l.error } : null;
  return { ok: true, root: l.root, missing: !!l.missing, cut: !!l.cut, builds: (l.builds || []).map((b) => ({ version: b.version, major: b.major, usable: !!b.usable, why: b.why || null })) };
}

// ── lane chrome-builds-download (design 004, B-80c1 — the owner: 「能不能自动从网上下载对应的版本？…下载前让用户检查是否互相兼容」) ──
// THE PURE HALF of "Download another build…": Google's two Chrome for Testing version documents parsed (an off-host download
// URL refused by name, never offered), THE compatibility verdict a version's row says before any byte moves (two HARD rows
// refuse; every other row is a chip the person reads), the download's paths (never outside the builds folder), and the zip's
// shape judged from `unzip`'s own listing BEFORE anything is extracted. The keeper (src/server/browser-keeper.js
// installChromeBuild) does the fetching, in THE install slot; the record of the hosts is browser-verbs CHROME_BUILDS_RECORD.
const CFT_CHANNELS = Object.freeze(['Stable', 'Beta', 'Dev', 'Canary']);
/** The one platform whose layout is measured (`chrome-<v>/chrome` after the rename) — Linux x64 = CfT's `linux64`. */
const DOWNLOAD_PLATFORM = 'linux-x64';
/** zip + unpacked + slack: a 196 MB zip unpacks to ≈ 390 MB (measured, F1/F8). */
const DISK_FACTOR = 3;
const LIST_MAX = 6000;
const ZIP_ENTRIES_MAX = 5000;
const WITNESS_FILE = 'vibespace-download.json';
const bareHost = (h) => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/\.$/, '');
/** A list document's download URL, judged against the record: https, on the record's file host — else refused BY NAME. */
function downloadUrlVerdict(url, { fileHost } = {}) {
  let x = null;
  try { x = new URL(String(url || '')); } catch { x = null; }
  if (!x) return { ok: false, code: 'build_list_invalid', error: `the list names a download that is not a URL (${String(url).slice(0, 120)})` };
  const want = bareHost(fileHost);
  if (x.protocol !== 'https:' || bareHost(x.hostname) !== want || x.username || x.password) return { ok: false, code: 'build_url_offhost', error: `the list names a download on ${x.protocol === 'https:' ? x.hostname : x.protocol + '//' + x.hostname}, not on ${want} — it is not offered` };
  return { ok: true, url: x.href, host: want };
}
function chromeDownloads(downloads, platform) { const a = downloads && Array.isArray(downloads.chrome) ? downloads.chrome : []; return a.find((d) => d && d.platform === platform) || null; }
/** The 10 KB last-known-good document → the four channel rows (`{channel, version, major, revision, url}`) + the rows refused
 *  by name (`refused`: an off-host URL, a malformed version). A document of another shape is refused whole (`build_list_invalid`). */
function parseLastKnownGood(doc, { fileHost, platform = 'linux64' } = {}) {
  if (!doc || typeof doc !== 'object' || !doc.channels || typeof doc.channels !== 'object') return { ok: false, code: 'build_list_invalid', error: 'the Chrome for Testing channel list has an unknown shape (no "channels")' };
  const rows = [], refused = [];
  for (const channel of CFT_CHANNELS) {
    const c = doc.channels[channel];
    if (!c || typeof c !== 'object') continue;
    const version = String(c.version || '');
    if (!VERSION_RE.test(version)) { refused.push({ channel, version: version.slice(0, 40), code: 'build_list_invalid', error: `the ${channel} row names no version` }); continue; }
    const d = chromeDownloads(c.downloads, platform);
    if (!d) { refused.push({ channel, version, code: 'build_list_invalid', error: `the ${channel} row has no ${platform} download` }); continue; }
    const u = downloadUrlVerdict(d.url, { fileHost });
    if (!u.ok) { refused.push({ channel, version, code: u.code, error: u.error }); continue; }
    rows.push({ channel, version, major: Number(version.split('.')[0]), revision: String(c.revision || ''), url: u.url });
  }
  if (!rows.length && !refused.length) return { ok: false, code: 'build_list_invalid', error: 'the Chrome for Testing channel list names no channel' };
  return { ok: true, timestamp: String(doc.timestamp || ''), rows, refused };
}
/** The 5.2 MB known-good document → every version with a `platform` chrome zip (`{version, major, revision, url}`, newest
 *  first) + the refused ones. Bounded (LIST_MAX). */
function parseKnownGood(doc, { fileHost, platform = 'linux64' } = {}) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.versions)) return { ok: false, code: 'build_list_invalid', error: 'the Chrome for Testing version list has an unknown shape (no "versions")' };
  const versions = [], refused = [];
  for (const v of doc.versions.slice(0, LIST_MAX)) {
    const version = String((v && v.version) || '');
    if (!VERSION_RE.test(version)) continue;
    const d = chromeDownloads(v.downloads, platform);
    if (!d) continue;
    const u = downloadUrlVerdict(d.url, { fileHost });
    if (!u.ok) { refused.push({ version, code: u.code, error: u.error }); continue; }
    versions.push({ version, major: Number(version.split('.')[0]), revision: String(v.revision || ''), url: u.url });
  }
  versions.sort((a, b) => compareVersions(b.version, a.version));
  return { ok: true, timestamp: String(doc.timestamp || ''), versions, refused, cut: doc.versions.length > LIST_MAX };
}
/** One row per major, newest first: `{major, newest, count}` (the "Older versions…" list; a major expands to its versions). */
function majorsOf(versions) {
  const m = new Map();
  for (const v of versions || []) { const e = m.get(v.major); if (!e) m.set(v.major, { major: v.major, newest: v.version, count: 1 }); else { e.count++; if (compareVersions(v.version, e.newest) > 0) e.newest = v.version; } }
  return [...m.values()].sort((a, b) => b.major - a.major);
}
/**
 * THE COMPATIBILITY VERDICT of one version, said BEFORE the download (design 004 §2's table). Two HARD rows refuse the
 * download (`hard`, the first is `code`/`error`): the machine (only Linux x64 has the measured layout) and the disk (free bytes
 * on the builds folder's filesystem against the zip's length × 3, when the length is known). Every other row is a CHIP
 * (structure; the client words it): `present` (already on this computer — the row offers nothing), `cli` (driven by the
 * measured agent-browser), `census` (the CDP census relation), `profile` (older than the Chrome that last opened THIS profile —
 * it can't be picked for it), `cloak` (whether a profile opened with it can still switch to CloakBrowser Free / Pro later).
 * Inputs are facts read by the caller (`census` = cdp-census chromeRelation(version), `censusChrome` = its newest censused
 * Chrome; `cloak` = browser-switch CLOAK_TIERS). → `{ok, offer, code, error, hard, chips, major, needBytes}`.
 */
function buildCompatVerdict({ version, channel = null, platform = process.platform, arch = process.arch, present = false, freeBytes = null, zipBytes = null, freePath = '', census = null, censusChrome = null, profile = null, cloak = SW.CLOAK_TIERS, cli = null, command = '', defaultBuild, defaultUsers = [] } = {}) {
  const v = String(version || '');
  if (!VERSION_RE.test(v)) return { ok: false, offer: false, code: 'build_version_invalid', error: `"${v.slice(0, 40)}" is not a Chrome version`, hard: [{ code: 'build_version_invalid' }], chips: [], major: null, needBytes: null };
  const major = Number(v.split('.')[0]);
  const hard = [], chips = [];
  const machine = SW.platformTag(platform, arch);
  if (machine !== DOWNLOAD_PLATFORM) hard.push({ code: 'build_platform_unsupported', machine, command: String(command || ''), error: `Downloads are offered on Linux x64 computers; on ${machine} install by hand${command ? ': ' + command : ''}` });
  const zb = Number(zipBytes), fb = Number(freeBytes);
  const needBytes = Number.isFinite(zb) && zb > 0 ? zb * DISK_FACTOR : null;
  if (needBytes != null && freeBytes != null && Number.isFinite(fb) && fb < needBytes) hard.push({ code: 'disk', need: needBytes, free: fb, path: String(freePath || ''), error: `needs about ${Math.ceil(needBytes / 1e6)} MB free, ${Math.floor(fb / 1e6)} MB left on ${freePath || 'the builds folder'}` });
  if (present) chips.push({ kind: 'present' });
  if (cli) chips.push({ kind: 'cli', version: String(cli) });
  if (census) chips.push({ kind: 'census', relation: census === 'between' ? 'older' : String(census), census: censusChrome ? String(censusChrome) : null });
  const wrote = profile && Number.isInteger(profile.lastChromiumMajor) ? profile.lastChromiumMajor : null;
  if (wrote != null && major < wrote) chips.push({ kind: 'profile', label: String((profile && profile.label) || ''), wrote });
  const free = cloak && cloak.free ? cloak.free.chromiumMajor : null, pro = cloak && cloak.pro ? cloak.pro.chromiumMajor : null;
  if (Number.isInteger(free) && Number.isInteger(pro)) chips.push({ kind: 'cloak', reach: major <= free ? 'both' : major <= pro ? 'pro' : 'none', free, pro });
  // verify r1 (H1): with no executable path the CLI launches its NEWEST build (measured: agent-browser 0.38.1 ran chrome-157 over
  // chrome-150) — a download newer than every build here becomes the default of every default-choice profile and every
  // conversation's browser, and a profile it opens can't go back. Said on the row (`defaultBuild`: the newest build here, null = none).
  if (defaultBuild !== undefined && !present && (defaultBuild == null || compareVersions(v, String(defaultBuild)) > 0)) chips.push({ kind: 'default', from: defaultBuild == null ? null : String(defaultBuild), users: (Array.isArray(defaultUsers) ? defaultUsers : []).slice(0, 20).map(String) });
  return { ok: hard.length === 0, offer: hard.length === 0 && !present, code: hard[0] ? hard[0].code : null, error: hard[0] ? hard[0].error : null, hard, chips, major, needBytes, channel: channel || null };
}
/** THE PATHS of one download — all inside the builds folder (a version is VERSION_RE-checked: no `/`, no `..`): the zip's
 *  `.part`, the unpack folder, the target `chrome-<version>`, the removal's rename. */
function downloadPlan({ version, url = null, bytes = null, buildsRoot } = {}) {
  const v = String(version || '');
  if (!VERSION_RE.test(v)) return { ok: false, code: 'build_version_invalid', error: `"${v.slice(0, 40)}" is not a Chrome version` };
  const root = path.resolve(String(buildsRoot || ''));
  const b = Number(bytes);
  return { ok: true, version: v, url, root, part: path.join(root, `chrome-${v}.part`), unpackDir: path.join(root, `.unpack-${v}`), targetDir: path.join(root, `chrome-${v}`), removingDir: path.join(root, `.removing-${v}`), witness: path.join(root, `chrome-${v}`, WITNESS_FILE), needBytes: Number.isFinite(b) && b > 0 ? b * DISK_FACTOR : null };
}
/** `unzip -Z1` (the names unzip itself will use) + `unzip -Zs` (each entry's type, first character of its mode) → entries
 *  `[{name, kind: 'file'|'dir'|'link'|'other'}]`. Two listings that do not pair up one to one are refused. */
function parseZipListing(namesText, longText) {
  const names = String(namesText || '').split('\n').filter((x) => x !== '');
  const longs = String(longText || '').split('\n').filter((x) => /^\S{7,10}\s+\d+\.\d+\s/.test(x));
  if (!names.length) return { ok: false, code: 'build_zip_shape', error: 'the zip lists no entry' };
  if (names.length !== longs.length) return { ok: false, code: 'build_zip_shape', error: `the zip's two listings disagree (${names.length} names, ${longs.length} entries) — a name with a line break?` };
  return { ok: true, entries: names.map((name, i) => { const c = longs[i][0]; return { name, size: Number(longs[i].trim().split(/\s+/)[3]) || 0, kind: c === 'l' ? 'link' : c === 'd' || (c === '-' && name.endsWith('/')) ? 'dir' : c === '-' ? 'file' : 'other' }; }) };
}
/** THE ZIP'S SHAPE, judged before `unzip` extracts anything: every entry under the measured layout's ONE top folder, no `..`,
 *  no `.`, no absolute name, no backslash or control character, no link or special entry, no duplicate, and the layout's
 *  `chrome` a regular file. Entries = names (a trailing `/` = a folder) or `{name, kind}`. */
function zipShapeVerdict(entries, { layout = 'chrome-linux64/', max = ZIP_ENTRIES_MAX } = {}) {
  const list = Array.isArray(entries) ? entries.map((e) => (typeof e === 'string' ? { name: e, kind: e.endsWith('/') ? 'dir' : 'file' } : e)) : [];
  const bad = (entry, why) => ({ ok: false, code: 'build_zip_shape', entry: String(entry).slice(0, 200), error: `the zip is not a Chrome for Testing build: ${why} (${JSON.stringify(String(entry).slice(0, 120))}) — nothing was extracted` });
  if (!list.length) return bad('', 'it lists no entry');
  if (list.length > max) return bad(list.length, `more than ${max} entries`);
  const seen = new Set();
  let files = 0, chrome = false, unpacked = 0; // verify r1 (L1): what the zip SAYS it unpacks to (`unzip -Zs`'s sizes)
  for (const e of list) {
    const n = String((e && e.name) || '');
    if (!n || /[\0-\x1f\x7f\\]/.test(n)) return bad(n, 'a name with a control character or a backslash');
    if (n.startsWith('/')) return bad(n, 'an absolute name');
    if (!n.startsWith(layout)) return bad(n, `an entry outside ${layout}`);
    const segs = n.replace(/\/$/, '').split('/');
    if (segs.some((s) => s === '..' || s === '.' || s === '')) return bad(n, 'a name with "..", "." or an empty part');
    if (e.kind !== 'file' && e.kind !== 'dir') return bad(n, e.kind === 'link' ? 'a link entry' : 'a special entry');
    if (seen.has(n)) return bad(n, 'the same name twice');
    seen.add(n);
    if (e.kind === 'file') { files++; unpacked += Number(e.size) || 0; if (n === layout + 'chrome') chrome = true; }
  }
  if (!chrome) return bad(layout + 'chrome', 'no chrome program in it');
  return { ok: true, files, entries: list.length, unpacked };
}
/** Does `chrome --version`'s output name exactly this version ("Google Chrome for Testing 154.0.8037.92")? */
function versionSays(out, version) {
  const m = /(?:Chrome|Chromium)[^\d\n]{0,40}(\d{2,4}(?:\.\d{1,6}){3})/.exec(String(out || ''));
  return { ok: !!m && m[1] === String(version), says: m ? m[1] : null };
}

module.exports = { buildWords, missingNotice, BUILDS_REL, BUILD_DIR_RE, BUILDS_MAX, BUILD_CODES, parseBuildDir, compareVersions, buildExecutable, fileFact, listBuilds, normalizeBrowserChoice, sameChoice, browserChoiceVerdict, runningBuildOf, choiceView, agentChoiceView, agentMissingView, buildsView,
  // lane chrome-builds-download (design 004)
  CFT_CHANNELS, DOWNLOAD_PLATFORM, DISK_FACTOR, WITNESS_FILE, VERSION_RE, downloadUrlVerdict, parseLastKnownGood, parseKnownGood, majorsOf, buildCompatVerdict, downloadPlan, parseZipListing, zipShapeVerdict, versionSays };
