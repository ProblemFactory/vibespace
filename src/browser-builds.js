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
const CHOICE_KINDS = Object.freeze(['default', 'build', 'path']);
/** Every refusal this module answers — a closed set the routes' STATUS table mirrors. */
const BUILD_CODES = Object.freeze(['browser_choice_invalid', 'browser_choice_user_only', 'browser_choice_provider', 'builds_unsupported', 'builds_unreadable', 'browser_build_missing', 'browser_build_not_executable', 'browser_path_missing', 'browser_path_not_executable', 'downgrade_refused', 'downgrade_unknown']);

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
function browserChoiceVerdict({ choice, provider = 'chromium', by = 'user', builds = null, buildsError = null, pathFact = null, machine = 'this computer', label = 'this profile', recordedMajor = null, dirMajor = null, written = false, ladder = false, confirmed = false } = {}) {
  const c = normalizeBrowserChoice(choice);
  if (!c) return { ok: false, code: 'browser_choice_invalid', error: 'a browser build is {kind:"default"} | {kind:"build", version:"151.0.7922.34"} | {kind:"path", path:"/absolute/path/to/chrome"}' };
  if (c.kind === 'default') return { ok: true, choice: c, executablePath: null, version: null, major: null };
  if (by !== 'user') return { ok: false, code: 'browser_choice_user_only', error: 'which Chrome build a profile runs is the user\'s choice (Agent browser panel → Change build…) — an agent never sets one; `vibespace-browser providers` lists the builds this machine has' };
  if (String(provider || 'chromium') !== 'chromium') return { ok: false, code: 'browser_choice_provider', error: `a Chrome build is chosen for a Chromium profile only — "${label}" runs ${provider} (CloakBrowser runs its own measured build; a connected or cloud browser is not started by VibeSpace)` };
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

module.exports = { buildWords, missingNotice, BUILDS_REL, BUILD_DIR_RE, BUILDS_MAX, CHOICE_KINDS, BUILD_CODES, parseBuildDir, compareVersions, buildExecutable, fileFact, listBuilds, normalizeBrowserChoice, sameChoice, browserChoiceVerdict, runningBuildOf, choiceView, agentChoiceView, agentMissingView, buildsView };
