'use strict';
/** THE `flatpak` APP KIND (lane app-register-model, 2026-10-11 — the owner's JASP: an agent ran `flatpak install --user` by
 *  hand because there was no door, and the app landed "Installed outside VibeSpace"). `vibespace-app add --kind flatpak
 *  <appId> [--remote flathub]` runs `flatpak install --user -y [<remote>] <appId>` AS THE USER (held by the CLI's own permission
 *  card, like uv / npm), then records the entry; it lives in HOME (keeps 'home': a pod's home survives a rebuild). Its catalog
 *  row is the EXPORTED desktop file's (Exec = `flatpak run …`), else `flatpak run <appId>` (`noDesktop`); remove = `flatpak
 *  uninstall --user -y`; a rebuilt machine without the program shows the reinstall as a USER-CLICK rung, never run silently.
 *  PURE, imports nothing; one line in src/app-kinds/index.js. */
const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){2,}$/; // = src/app-witness.js FLATPAK_ID_RE (test-app-register pins them equal)
const REMOTE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SEARCH_COLUMNS = 'application,name,description';
const SEARCH_BUDGET_MS = 5000;
const appIdOk = (x) => typeof x === 'string' && x.length <= 255 && ID_RE.test(x);
const remoteOk = (x) => typeof x === 'string' && REMOTE_RE.test(x);
/** Where flatpak exports a user install's desktop file / icons, and where the app itself lives (all under the user's home). */
const exportedDesktop = (home, appId) => `${home}/.local/share/flatpak/exports/share/applications/${appId}.desktop`;
const exportedIcons = (home) => `${home}/.local/share/flatpak/exports/share/icons/`;
const appDir = (home, appId) => `${home}/.local/share/flatpak/app/${appId}`;
const installCmd = (appId, remote = null) => ['flatpak', 'install', '--user', '-y', ...(remote ? [remote] : []), appId];
const removeArgvOf = (e) => ['flatpak', 'uninstall', '--user', '-y', e.appId];
const reinstallArgvOf = (e) => installCmd(e.appId, e.remote || null);
const searchArgv = (words) => ['flatpak', 'search', '--user', `--columns=${SEARCH_COLUMNS}`, ...words];
/** `flatpak search --columns=application,name,description` → [{appId, name, description}] (bounded; a malformed id is skipped). */
function parseSearch(text, max = 30) {
  const out = [], seen = new Set();
  for (const line of String(text || '').split('\n')) {
    const [appId, name = '', description = ''] = line.split('\t').map((x) => x.trim());
    if (!appIdOk(appId) || seen.has(appId)) continue;
    seen.add(appId);
    out.push({ appId, name: name.slice(0, 80) || appId, description: description.replace(/[\0-\x1f]+/g, ' ').slice(0, 200) });
    if (out.length >= max) break;
  }
  return out;
}
/** THE row of an entry: the exported desktop file's (`parsed` = the caller's parseDesktopFile row) when it runs `flatpak run …
 *  <appId>`, else `flatpak run <appId>`. A Flatpak row is removable and says where it came from (`source`). */
function rowOf(e, parsed = null) {
  const base = { id: `app.${e.id}`, label: e.label || e.appId, exec: 'flatpak', args: ['run', e.appId], category: 'app', app: e.id, flatpak: e.appId, removable: true, source: 'flatpak-user' };
  if (parsed && /(^|\/)flatpak$/.test(String(parsed.exec || '')) && Array.isArray(parsed.args) && parsed.args[0] === 'run' && parsed.args.includes(e.appId)) {
    return { ...base, label: parsed.label || base.label, exec: parsed.exec, args: [...parsed.args], ...(parsed.icon ? { icon: parsed.icon } : {}), ...(parsed.desktop ? { desktop: parsed.desktop } : {}) };
  }
  return base;
}
/** The record reader (app-manifest normEntry): the application id, its remote, whether its desktop file was missing. */
const record = (e) => (appIdOk(e.appId) ? { appId: e.appId, remote: remoteOk(e.remote) ? e.remote : null, ...(e.noDesktop === true ? { noDesktop: true } : {}) } : { error: 'a flatpak entry names its application id' });
/** The words a gone program shows (status / the launcher): the reinstall, a USER-CLICK rung. */
/** A proposal of it: refused by name — a Flatpak is installed as the user and recorded (`add --kind flatpak`), never proposed. */
const requestOf = () => ({ ok: false, code: 'bad-request', error: 'a Flatpak is installed as you, then recorded: vibespace-app add --kind flatpak <appId> --why "…"' });
const goneWords = (e) => `reinstall: ${reinstallArgvOf(e).join(' ')}`;

module.exports = Object.freeze({ id: 'flatpak', entry: 'home', agent: true, cliWord: 'flatpak', card: 'flatpak', keeps: 'home', from: 'none', word: 'Flatpak',
  addArgv: Object.freeze(['flatpak', 'install', '--user', '-y']), removeArgv: Object.freeze(['flatpak', 'uninstall', '--user', '-y']), remoteFlag: true,
  request: true, requestOf, record, rowOf, removeArgvOf, reinstallArgvOf, installCmd, searchArgv, parseSearch, goneWords, exportedDesktop, exportedIcons, appDir, appIdOk, remoteOk,
  ID_RE, SEARCH_COLUMNS, SEARCH_BUDGET_MS });
