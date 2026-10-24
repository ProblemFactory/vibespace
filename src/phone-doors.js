// THE PHONE'S DOORS (lane phone-files-door, 2026-10-24 — the owner: 「我发现手机上好像不是很容易找到文件管理器」). The file
// explorer's ONLY phone door was a row in the «+» sheet, and that sheet opens on a 500 ms press of a button whose TAP opens
// New Session: a person looking for their files never looks under «new». A thing a person looks for is where they look.
//   · PHONE_TWINS — every desktop door (the toolbar's buttons, the rail's items) and where a phone person finds the same
//     thing. A desktop door with no phone twin is a gap (the twin-set law, re-measured here); a deliberate «none» says
//     why. Each twin is pinned to a LITERAL in a source file, so deleting the twin reds the census (test-phone-doors).
//   · twinCensus — the verdict over the doors the source declares, the table and the sources' text.
// The files door's own verdicts (the 文件 card's chips, the breadcrumbs) are PURE src/files-door.js — the bundle's; this
// table is the census's only (its anchors are source text, never shipped to a page).
// PURE: imports nothing.

const T = (where, file, anchor) => Object.freeze({ where, file, anchor });
/** door — `btn-<x>` (a button of public/index.html's <header id="toolbar">) or `rail:<id>` (src/lib/sidebar-rail.js
 *  item('<id>', …)); twins — [{ where, file, anchor }] (anchor = a literal of `file`), or null with a `why`. */
const PHONE_TWINS = Object.freeze([
  // ── the toolbar ──
  { door: 'btn-new-session', twins: [T('the nav «+» (a tap)', 'public/index.html', '<button id="mobile-nav-new"'), T('the «+» sheet «Agent session»', 'src/lib/mobile-nav.js', "t('Agent session'), () => app.showNewSessionDialog()")] },
  { door: 'btn-terminal', twins: [T('the «+» sheet «Terminal»', 'src/lib/mobile-nav.js', "t('Terminal'), () => app.openShellTerminal()")] },
  { door: 'btn-file-explorer', twins: [T('the nav «文件» (one tap)', 'public/index.html', '<button id="mobile-nav-files"'), T('the For-you page\'s 文件 card', 'src/lib/user-todos-panel.js', 'home.append(filesCard(app));'), T('the «+» sheet «Files»', 'src/lib/mobile-nav.js', "t('Files'), () => app.openFileExplorer()")] },
  { door: 'btn-browser', twins: [T('the «+» sheet «Web view»', 'src/lib/mobile-nav.js', "t('Web view'), () => app.openBrowser()")] },
  { door: 'btn-desktop-apps', twins: [T('the «+» sheet «Apps…»', 'src/lib/mobile-nav.js', "t('Apps…'), () => runCommand('desktopApps.open', { app })"), T('⚙ «Apps…»', 'src/lib/desktop-app-launcher.js', "label: () => t('Apps…')")] },
  { door: 'btn-desktop', twins: [T('the «+» sheet «Desktop»', 'src/lib/mobile-nav.js', "t('Desktop'), () => openDesktopPicker(app)")] },
  { door: 'btn-presets', twins: null, why: 'a phone shows one window at a time — there is no arrangement to save or apply' },
  { door: 'btn-add-grid', twins: null, why: 'a phone shows one window at a time — there is no grid to add' },
  { door: 'btn-global-settings', twins: [T('the nav ⚙', 'public/index.html', '<button id="mobile-nav-gear"')] },
  // ── the rail ──
  { door: 'rail:folders', twins: [T('☰ ▸ the «Folders» tab', 'src/lib/sidebar.js', "foldersTab.dataset.tab = 'folders';")] },
  { door: 'rail:tasks', twins: [T('☰ ▸ the «Task Groups» tab', 'src/lib/sidebar.js', "tasksTab.dataset.tab = 'tasks';")] },
  { door: 'rail:mounts', twins: [T('☰ ▸ the «Remote» tab', 'src/lib/sidebar.js', "mountsTab.dataset.tab = 'mounts';")] },
  { door: 'rail:ports', twins: [T('⚙ ▸ System ▸ «Ports…»', 'src/lib/sidebar-rail.js', "label: () => tr('Ports…')")] },
  { door: 'rail:agents', twins: [T('⚙ «Manage agents…»', 'src/lib/gear-menu.js', "label: () => t('Manage agents…')")] },
  { door: 'rail:plugins', twins: [T('⚙ ▸ Tools ▸ «Plugins…»', 'src/lib/gear-menu.js', "label: () => t('Plugins…')")] },
  { door: 'rail:jobs', twins: [T('⚙ ▸ Tools ▸ «Background Work…»', 'src/lib/gear-menu.js', "label: () => t('Background Work…')")] },
  { door: 'rail:channels', twins: [T('⚙ ▸ Communication ▸ «Channels…»', 'src/lib/channels-panel.js', "label: () => t('Channels…')")] },
  { door: 'rail:system', twins: [T('⚙ ▸ System ▸ «System monitor…»', 'src/lib/sidebar-rail.js', "label: () => tr('System monitor…')")] },
  { door: 'rail:browser', twins: [T('the «+» sheet «Agent browser»', 'src/lib/mobile-nav.js', "t('Agent browser'), () => this._openAgentBrowser")] },
  { door: 'rail:diagnostics', twins: [T('⚙ ▸ System ▸ «Diagnostics report…»', 'src/lib/gear-menu.js', "label: () => t('Diagnostics report…')")] },
  { door: 'rail:settings', twins: [T('⚙ «All Settings...»', 'src/lib/gear-menu.js', "label: () => t('All Settings...')")] },
].map((r) => Object.freeze(r)));

// a line that turns its row OFF on a phone (`when: (c) => !c.app.isMobile`, `if (!app.isMobile)`) is no phone twin
const PHONE_OFF_RE = /!\s*(?:c\.|this\.)?app\.isMobile\b|isMobile\s*===?\s*false/;

/** The desktop doors a source declares: the toolbar's `<button id="btn-…"` (inside <header id="toolbar">) and the rail's
 *  `item('<id>'` calls. → ['btn-…', 'rail:…'] in source order. */
function desktopDoors({ indexHtml = '', railSrc = '' } = {}) {
  const out = [];
  const head = /<header id="toolbar">([\s\S]*?)<\/header>/.exec(String(indexHtml));
  if (head) for (const m of head[1].matchAll(/<button id="(btn-[a-z0-9-]+)"/g)) out.push(m[1]);
  for (const m of String(railSrc).matchAll(/\bitem\('([a-z0-9-]+)',/g)) out.push('rail:' + m[1]);
  return [...new Set(out)];
}

/** THE TWIN CENSUS. `doors` = desktopDoors(…), `table` = PHONE_TWINS, `sources` = { [file]: text }. → { ok, missing:
 *  [door] (no row), stale: [door] (a row for a door the source no longer has), broken: [{ door, where, why }] (an anchor
 *  not in its file, a twin turned off on a phone, a «none» without a reason, a row with no twin at all) }. */
function twinCensus({ doors = [], table = PHONE_TWINS, sources = {} } = {}) {
  const rows = new Map((Array.isArray(table) ? table : []).map((r) => [r && r.door, r]));
  const missing = doors.filter((d) => !rows.has(d));
  const stale = [...rows.keys()].filter((d) => !doors.includes(d));
  const broken = [];
  for (const d of doors) {
    const r = rows.get(d);
    if (!r) continue;
    if (r.twins === null) { if (!String(r.why || '').trim()) broken.push({ door: d, where: null, why: 'a «none» row says no reason' }); continue; }
    if (!Array.isArray(r.twins) || !r.twins.length) { broken.push({ door: d, where: null, why: 'no phone twin' }); continue; }
    for (const tw of r.twins) {
      const src = sources[tw.file];
      if (typeof src !== 'string') { broken.push({ door: d, where: tw.where, why: `no source ${tw.file}` }); continue; }
      const at = src.indexOf(tw.anchor);
      if (at < 0) { broken.push({ door: d, where: tw.where, why: `anchor not in ${tw.file}: ${tw.anchor}` }); continue; }
      const line = src.slice(src.lastIndexOf('\n', at) + 1, (src.indexOf('\n', at) + 1 || src.length + 1) - 1);
      if (PHONE_OFF_RE.test(line)) broken.push({ door: d, where: tw.where, why: `turned off on a phone in ${tw.file}` });
    }
  }
  return { ok: !missing.length && !stale.length && !broken.length, missing, stale, broken };
}

module.exports = { PHONE_TWINS, PHONE_OFF_RE, desktopDoors, twinCensus };
