'use strict';
/**
 * OPEN WITH LIBREOFFICE — the PURE verdicts (docs/design-desktop-apps.zh.md §7.9;
 * the owner's ruling 2026-09-27, option ②: a Word file is EDITED by opening it in
 * LibreOffice running as a VibeSpace desktop app — the xpra rung, the highest
 * fidelity; the in-browser viewer stays read-only). Imports nothing (CJS so the
 * machine keeper, the routes, the daemon bundle and the browser bundle share ONE
 * spelling of every rule and refusal).
 *
 * What lives here and nowhere else:
 *   • the office TABLE — Writer / Calc / Impress: the catalog id, the module's
 *     command-line switch, the library that proves the module is installed, the
 *     apt packages, the file extensions it opens — and the catalog ROWS built
 *     from it (src/desktop-apps.js spreads them into DEFAULT_REGISTRY)
 *   • `fileVerdict(file)` — may this string be opened: an ABSOLUTE path on the
 *     file's machine (a display string — "host: /path", "~/x" — is refused
 *     `relative-path`, so it can never reach an argv) with an office extension
 *     (else `not-office-file`)
 *   • `openWithVerdict({row, file, ext, machine})` — THE verdict: the file rule,
 *     then THE MACHINE RULE (the app runs WHERE THE FILE IS — `hostId` a
 *     parameter: the file's machine ≠ the app's ⇒ `machine-mismatch`), then the
 *     machine answering (`host-unreachable`), then the app (a non-office row ⇒
 *     `not-office-app`; the machine's catalog knows no office row ⇒
 *     `host_needs_daemon`, its agent predates them; the module is absent ⇒
 *     `app-absent` WITH the install remedy). The row that opens a file is the
 *     file's own module (a .xlsx opens in Calc whichever office row was asked)
 *   • `officeArgv(row, {file, profileDir})` — the argv: the row's module switch,
 *     `--nologo`, the session's OWN LibreOffice profile
 *     (`-env:UserInstallation=file://…` — without it a second launch hands its
 *     document to the first LibreOffice over its pipe and exits: the document
 *     would open inside another file's window, on another display), THEN THE
 *     PATH, LAST, as one argv item (an absolute path never begins with '-')
 *   • `officeRowFor(row, office)` — a catalog row as a machine serves it, from
 *     that machine's office FACTS (src/desktop-display.js officeFacts: which
 *     binary, which module libraries) — an absent module is DIMMED WITH ITS
 *     REASON and its install remedy, never hidden
 *   • `installSpecFor(what)` — the CLOSED set of LibreOffice installs (the
 *     module's package + the metric-compatible Calibri / Cambria faces a .docx
 *     lays out with; B-04da ②: the faces alone, `libreoffice-fonts`, for a
 *     machine that has LibreOffice without them); src/desktop-apps.js
 *     `packageInstallPlan` turns one into the plan the dialog shows before
 *     anything runs
 *   • `officeQuitArgv(profileDir)` — B-04da ④: the hand-over that asks a RUNNING
 *     LibreOffice to quit through its OWN File ▸ Exit (its save prompt, in its
 *     window), never a signal while a document may hold unsaved edits
 *   • `startCenterVerdict(...)` — B-04da ⑤: a FILE session whose main window
 *     became the Start Center (the person closed the document) ends.
 *
 * A machine never trusts the hub and the hub never trusts a request: the route
 * runs `openWithVerdict` with the machine rule before any machine is asked, the
 * machine runs it again with ITS catalog before anything is recorded or started.
 */

/** The LibreOffice binaries a machine may carry, in the order a row takes them (distro packages ship both names;
 *  /usr/bin/libreoffice and /usr/bin/soffice are the same script there). */
const OFFICE_EXECS = Object.freeze(['libreoffice', 'soffice']);
/** Metric-compatible replacements of Office's default faces (Calibri → Carlito, Cambria → Caladea — LibreOffice's own
 *  substitution table maps them): installed with every module so a .docx paginates as it does in Word. */
const OFFICE_FONT_PACKAGES = Object.freeze(['fonts-crosextra-carlito', 'fonts-crosextra-caladea']);
/** B-04da ② — the two faces as FACTS a machine probes (src/desktop-display.js officeFacts: a stat of the files each
 *  distro's package installs — never a spawn): a machine that already HAS LibreOffice but not these lays a .docx out in
 *  other faces (other line breaks, other page count), so its catalog row says so and offers the faces alone. */
const OFFICE_FONTS = Object.freeze([
  Object.freeze({ family: 'Carlito', replaces: 'Calibri', package: 'fonts-crosextra-carlito', files: Object.freeze(['/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf', '/usr/share/fonts/google-carlito-fonts/Carlito-Regular.ttf', '/usr/share/fonts/TTF/Carlito-Regular.ttf', '/usr/local/share/fonts/Carlito-Regular.ttf']) }),
  Object.freeze({ family: 'Caladea', replaces: 'Cambria', package: 'fonts-crosextra-caladea', files: Object.freeze(['/usr/share/fonts/truetype/crosextra/Caladea-Regular.ttf', '/usr/share/fonts/google-crosextra-caladea-fonts/Caladea-Regular.ttf', '/usr/share/fonts/TTF/Caladea-Regular.ttf', '/usr/local/share/fonts/Caladea-Regular.ttf']) }),
]);
/** The install of the faces ALONE (B-04da ②) — not a catalog row: the remedy a served LibreOffice row carries. */
const FONTS_ID = 'libreoffice-fonts';
/** The faces a machine's office facts say are absent (`fonts: {Carlito: bool, …}`; absent / null = not knowable ⇒ none). */
function fontsMissingOf(office) {
  const f = office && office.fonts && typeof office.fonts === 'object' ? office.fonts : null;
  return f ? OFFICE_FONTS.filter((x) => f[x.family] === false).map((x) => x.family) : [];
}
/** The three modules. `lib` = the library in LibreOffice's program dir that exists only when the module is installed
 *  (MEASURED 2026-09-27 on this box, LibreOffice 26.2.5.2 from Ubuntu: libreoffice-writer installed ⇒ libswlo.so
 *  present, libsclo.so / libsdlo.so absent — the binary alone says nothing: `libreoffice --calc` without Calc starts
 *  anyway and cannot open a spreadsheet). */
const OFFICE_MODULES = Object.freeze({
  writer: Object.freeze({ module: 'writer', id: 'libreoffice-writer', label: 'LibreOffice Writer', arg: '--writer', lib: 'libswlo.so', package: 'libreoffice-writer', exts: Object.freeze(['docx', 'doc', 'odt', 'rtf']) }),
  calc: Object.freeze({ module: 'calc', id: 'libreoffice-calc', label: 'LibreOffice Calc', arg: '--calc', lib: 'libsclo.so', package: 'libreoffice-calc', exts: Object.freeze(['xlsx', 'xls', 'ods', 'csv']) }),
  impress: Object.freeze({ module: 'impress', id: 'libreoffice-impress', label: 'LibreOffice Impress', arg: '--impress', lib: 'libsdlo.so', package: 'libreoffice-impress', exts: Object.freeze(['pptx', 'ppt', 'odp']) }),
});
const MODULE_KEYS = Object.freeze(Object.keys(OFFICE_MODULES));
/** The generic row (LibreOffice's Start Center): `office: 'any'`. */
const OFFICE_ANY = 'any';
const GENERIC_ID = 'libreoffice';
/** extension → module */
const EXT_MODULE = Object.freeze(Object.fromEntries(MODULE_KEYS.flatMap((k) => OFFICE_MODULES[k].exts.map((e) => [e, k]))));
const OFFICE_EXTS = Object.freeze(Object.keys(EXT_MODULE));

/** The catalog rows (src/desktop-apps.js DEFAULT_REGISTRY spreads them): `exec` = the first name, `execs` = the
 *  alternatives a machine may carry (the first on PATH is served — the browser rows' idiom), `office` = the module
 *  ('any' for the generic row), category 'office'. */
const OFFICE_ROWS = Object.freeze([
  Object.freeze({ id: 'libreoffice-writer', label: 'LibreOffice Writer', exec: 'libreoffice', execs: OFFICE_EXECS, args: Object.freeze(['--writer']), category: 'office', office: 'writer' }),
  Object.freeze({ id: 'libreoffice-calc', label: 'LibreOffice Calc', exec: 'libreoffice', execs: OFFICE_EXECS, args: Object.freeze(['--calc']), category: 'office', office: 'calc' }),
  Object.freeze({ id: 'libreoffice-impress', label: 'LibreOffice Impress', exec: 'libreoffice', execs: OFFICE_EXECS, args: Object.freeze(['--impress']), category: 'office', office: 'impress' }),
  Object.freeze({ id: GENERIC_ID, label: 'LibreOffice', exec: 'libreoffice', execs: OFFICE_EXECS, args: Object.freeze([]), category: 'office', office: OFFICE_ANY }),
]);
const OFFICE_ROW_IDS = Object.freeze(OFFICE_ROWS.map((r) => r.id));
const isOfficeModule = (m) => m === OFFICE_ANY || Object.prototype.hasOwnProperty.call(OFFICE_MODULES, m);

// ── files ──
const PATH_MAX = 4096;
const LABEL_MAX = 80;
/** The basename of a slash path ('' for none). */
function baseName(p) { const s = String(p || ''); const i = s.lastIndexOf('/'); return i >= 0 ? s.slice(i + 1) : s; }
/** A file's extension, lower-cased, without the dot — '' when the basename has none (a dotfile named ".docx" has
 *  no extension: it is hidden, not a document). */
function extOf(name) {
  const b = baseName(name);
  const i = b.lastIndexOf('.');
  return i > 0 && i < b.length - 1 ? b.slice(i + 1).toLowerCase() : '';
}
/** The module that opens a file of this name (null ⇒ not an office file). */
function moduleForFile(name) { return EXT_MODULE[extOf(name)] || null; }
/** Does the file explorer offer "Open with LibreOffice" for this name? */
function isOfficeFile(name) { return !!moduleForFile(name); }
/** `//`, `/./`, `/../` folded — the path the machine opens and the file-changed signal names. null = not absolute. */
function foldAbs(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) return null;
  const out = [];
  for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); }
  return '/' + out.join('/');
}
/** The window's label: the file's basename (the model's label), cut in the middle past LABEL_MAX so the extension
 *  still shows. */
function fileLabel(file) {
  const b = baseName(file);
  if (b.length <= LABEL_MAX) return b;
  const keep = LABEL_MAX - 1;
  return b.slice(0, Math.ceil(keep / 2)) + '…' + b.slice(b.length - Math.floor(keep / 2));
}
const refuse = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

/**
 * May this string be opened? → { ok, file (folded), ext, module, label } | { ok:false, code, error }
 *   relative-path     not a string, not absolute ("~/x.docx", "report.docx", "myhost: /x.docx" — a host-labelled
 *                     display string is exactly this shape), a NUL / CR / LF, a trailing slash, longer than 4096
 *   not-office-file   no extension LibreOffice is offered for (the table above)
 * `ext` (optional) overrides the extension read from the name (a caller that already knows it).
 */
function fileVerdict(file, ext = null) {
  if (typeof file !== 'string' || !file) return refuse('relative-path', 'no file path was given');
  if (/[\0\r\n]/.test(file)) return refuse('relative-path', 'the file path contains a control character');
  if (file.length > PATH_MAX) return refuse('relative-path', `the file path is longer than ${PATH_MAX} characters`);
  if (!file.startsWith('/')) return refuse('relative-path', `${JSON.stringify(file.slice(0, 120))} is not an absolute path on the file's machine — LibreOffice is handed the real path, never a display name`);
  if (file.endsWith('/')) return refuse('relative-path', `${file.slice(0, 120)} names a folder, not a file`);
  const folded = foldAbs(file);
  if (!folded || folded === '/') return refuse('relative-path', `${file.slice(0, 120)} is not a file path`);
  const e = typeof ext === 'string' && ext ? ext.replace(/^\./, '').toLowerCase() : extOf(folded);
  const module = EXT_MODULE[e] || null;
  if (!module) return refuse('not-office-file', `${fileLabel(folded)} is not a document LibreOffice is offered for (${OFFICE_EXTS.map((x) => '.' + x).join(' ')})`, { ext: e });
  return { ok: true, code: null, error: null, file: folded, ext: e, module, label: fileLabel(folded) };
}

// ── machines ──
/** A machine id as the rule compares it: '' / null / 'local' are THIS machine. */
const hostKey = (h) => (h == null || h === '' || h === 'local' ? 'local' : String(h));
const machineWords = (key, label) => (label ? String(label) : key === 'local' ? 'this machine' : key);

/** The install remedy of a module: the catalog id the install is for (it names its packages — installSpecFor). */
function remedyFor(id, machineLabel) {
  const spec = installSpecFor(id);
  return spec ? { what: spec.what, label: spec.label, packages: spec.packages.slice(), machine: machineLabel || null } : null;
}

/**
 * THE VERDICT. → { ok:true, catalogId, module, file, label, hostId } | { ok:false, code, error, remedy? }
 *   row      the app asked for: a catalog id, a served row, or null (the file's own module decides). Any OFFICE row is
 *            accepted and the FILE's module opens it (LibreOffice opens a document in its own module; a .xlsx with
 *            only Writer installed cannot open at all — so presence is judged on the file's module).
 *   file     the absolute path ON THE FILE'S MACHINE (fileVerdict)
 *   ext      optional extension override
 *   machine  { hostId: where the app would run, fileHost: where the file lives (default hostId), reachable: false ⇒
 *              refused, why: its reason, registry: THAT machine's served catalog rows (null ⇒ presence is the machine's
 *              own verdict — the hub's route runs this before asking it), label: a DISPLAY name for the sentences —
 *              it only ever reaches an error sentence, never an argv }
 * Codes, in the order they are judged: relative-path · not-office-file · machine-mismatch · host-unreachable ·
 * not-office-app · host_needs_daemon · app-absent (+ remedy).
 */
function openWithVerdict({ row = null, file, ext = null, machine = {} } = {}) {
  const fv = fileVerdict(file, ext);
  if (!fv.ok) return fv;
  const m = machine && typeof machine === 'object' ? machine : {};
  const where = hostKey(m.hostId);
  const fileAt = hostKey(m.fileHost === undefined ? m.hostId : m.fileHost);
  const whereName = machineWords(where, m.label);
  if (where !== fileAt) return refuse('machine-mismatch', `${fv.label} is on ${machineWords(fileAt, m.fileLabel)} — LibreOffice opens it there, on the machine that holds the file (${whereName} was chosen)`, { hostId: where, fileHost: fileAt });
  if (m.reachable === false) return refuse('host-unreachable', `${whereName} is not answering${m.why ? ` (${String(m.why).slice(0, 200)})` : ''} — the file stays where it is; try again once it is back`, { hostId: where });
  const reqId = typeof row === 'string' ? row : row && typeof row === 'object' ? row.id : null;
  if (row != null && !OFFICE_ROW_IDS.includes(reqId)) return refuse('not-office-app', `${(row && row.label) || reqId || 'that app'} does not open documents — LibreOffice does`);
  const want = OFFICE_MODULES[fv.module];
  const base = { ok: true, code: null, error: null, catalogId: want.id, module: fv.module, file: fv.file, label: fv.label, hostId: where };
  if (!Array.isArray(m.registry)) return base;
  if (!m.registry.some((r) => r && r.office)) return refuse('host_needs_daemon', `the VibeSpace agent on ${whereName} predates opening files in LibreOffice — reconnect the machine to upgrade it`, { hostId: where });
  const served = m.registry.find((r) => r && r.id === want.id);
  if (!served || !served.available) return refuse('app-absent', `${want.label} is not installed on ${whereName}${served && served.reason ? ` (${served.reason})` : ''}`, { hostId: where, catalogId: want.id, module: fv.module, remedy: remedyFor(want.id, m.label || null) });
  // B-04da ②: it opens — and when the machine lacks the Calibri / Cambria look-alikes the verdict says so (the menu offers them)
  const fontsMissing = Array.isArray(served.fontsMissing) ? served.fontsMissing.slice() : [];
  return fontsMissing.length ? { ...base, fontsMissing, fontRemedy: remedyFor(FONTS_ID, m.label || null) } : base;
}

// ── the argv ──
/** `-env:UserInstallation=<file URL>` for a profile directory (each path segment percent-encoded: LibreOffice reads a
 *  URL — measured with a space in the path, `%20`). null for a path that is not absolute. */
function userInstallationArg(profileDir) {
  const d = foldAbs(profileDir);
  if (!d || d === '/') return null;
  return '-env:UserInstallation=file://' + d.split('/').map((s) => encodeURIComponent(s)).join('/');
}
/**
 * The argv of an office launch (PURE). → { ok, argv, code, error }
 *   [module switch]  '--writer' / '--calc' / '--impress' (the generic row: none — the Start Center)
 *   '--nologo'       no splash window (under the seamless rung it is one more top-level window for a moment)
 *   '-env:UserInstallation=file://…'  the session's OWN profile (see the header)
 *   file             LAST, one item, only when a file is opened
 * Refused: not an office row (`not-office-app`), no absolute profile dir (`profile-not-owned`), a file that fails
 * fileVerdict (its code).
 */
function officeArgv(row, { file = null, profileDir = null } = {}) {
  if (!row || !isOfficeModule(row.office)) return refuse('not-office-app', `${(row && row.label) || 'this row'} is not a LibreOffice row`);
  const prof = userInstallationArg(profileDir);
  if (!prof) return refuse('profile-not-owned', 'a LibreOffice session needs its own absolute profile directory');
  let f = null;
  if (file !== null && file !== undefined) { const v = fileVerdict(file); if (!v.ok) return v; f = v.file; }
  const own = Array.isArray(row.args) ? row.args.slice() : [];
  return { ok: true, code: null, error: null, argv: [...own, '--nologo', prof, ...(f ? [f] : [])] };
}

// ── the document's lock ──
/** LibreOffice's lock file beside a document: `<dir>/.~lock.<basename>#`. null for a path that is not absolute. */
function lockFileOf(file) {
  const f = foldAbs(file);
  if (!f || f === '/') return null;
  const i = f.lastIndexOf('/');
  return `${f.slice(0, i)}/.~lock.${f.slice(i + 1)}#`;
}
const decodeUrl = (u) => { try { return decodeURIComponent(u); } catch { return u; } };
/**
 * MAY THE MACHINE REMOVE A DOCUMENT'S LOCK FILE AFTER ITS SESSION ENDED? (PURE — identity by WITNESS, never by time.)
 * MEASURED 2026-09-27 (LibreOffice 26.2.5.2): SIGTERM ends LibreOffice in ~130 ms and LEAVES `.~lock.<name>#` behind —
 * the next open of that file says "Document in use" (locked by yourself). Its content is
 * `,<user>,<host>,<date>,<UserInstallation URL>;` — the LAST field is the profile of the LibreOffice that wrote it, and
 * every VibeSpace session has its OWN profile. So a lock is this session's exactly when that field is this session's
 * profile URL (decoded both sides); anything else — another LibreOffice on the same file (another session, the user's
 * own), an unreadable or foreign shape — is KEPT and said. The caller removes it only after a verified-clean teardown
 * (no process of the session left to be writing it). → { remove, why }
 */
function staleLockVerdict(content, profileDir) {
  const own = userInstallationArg(profileDir);
  if (!own) return { remove: false, why: 'the session has no profile to compare with' };
  if (typeof content !== 'string' || !content.trim()) return { remove: false, why: 'the lock file is empty or unreadable' };
  const body = content.trim().replace(/;$/, '');
  const last = body.slice(body.lastIndexOf(',') + 1);
  const want = own.slice('-env:UserInstallation='.length);
  if (!/^file:\/\//.test(last)) return { remove: false, why: 'the lock file is not in the shape LibreOffice writes' };
  if (decodeUrl(last) !== decodeUrl(want)) return { remove: false, why: `the lock names another LibreOffice (${last.slice(0, 160)}) — kept` };
  return { remove: true, why: 'the lock names this session\'s own LibreOffice profile' };
}

// ── a machine's catalog row ──
/**
 * A LibreOffice row as a machine SERVES it, from its office facts (src/desktop-display.js officeFacts):
 *   office = { exec: 'libreoffice'|'soffice'|null, path, program, confinement, modules: {writer, calc, impress} | null }
 *   (`modules: null` = not knowable — a snap's program dir is not ours to read: judged present, the snap decides)
 * → the row + { exec, path, available, reason, reasonCode, remedy } — absent is `app-absent` with its sentence and the
 * install remedy; the generic row is available when any module is.
 */
function officeRowFor(row, office) {
  const o = office && typeof office === 'object' ? office : {};
  const want = row && row.office === OFFICE_ANY ? null : OFFICE_MODULES[row && row.office];
  const what = want ? want.id : GENERIC_ID;
  const label = (row && row.label) || (want ? want.label : 'LibreOffice');
  const absent = (reason) => ({ ...row, exec: (row && row.exec) || OFFICE_EXECS[0], path: null, available: false, reason, reasonCode: 'app-absent', remedy: remedyFor(what, null), confinement: o.confinement || null });
  if (!o.exec || !o.path) return absent(`LibreOffice is not installed (none of ${OFFICE_EXECS.join(', ')} on PATH)`);
  const mods = o.modules && typeof o.modules === 'object' ? o.modules : null;
  if (mods) {
    const have = want ? !!mods[want.module] : MODULE_KEYS.some((k) => mods[k]);
    if (!have) return absent(want ? `${label} is not installed (package ${want.package})` : `no LibreOffice module is installed (${MODULE_KEYS.map((k) => OFFICE_MODULES[k].package).join(', ')})`);
  }
  // B-04da ②: LibreOffice is here but the Calibri / Cambria look-alikes are not — the row says which, and the remedy
  // installs the faces alone (a .docx otherwise paginates in other faces)
  const fontsMissing = fontsMissingOf(o);
  return { ...row, exec: o.exec, path: o.path, available: true, reason: null, reasonCode: null, remedy: null, confinement: o.confinement || null, fontsMissing, fontRemedy: fontsMissing.length ? remedyFor(FONTS_ID, null) : null };
}

// ── installs ──
/** THE CLOSED SET of LibreOffice installs: each catalog id → its apt packages (the module + the fonts). The generic
 *  row installs the three modules. Anything else ⇒ null (a request never names a package). */
function installSpecFor(what) {
  if (what === FONTS_ID) return { what: FONTS_ID, label: 'Carlito / Caladea fonts', packages: OFFICE_FONT_PACKAGES.slice(), verify: 'command -v fc-list' };
  if (what === GENERIC_ID) return { what: GENERIC_ID, label: 'LibreOffice', packages: [...MODULE_KEYS.map((k) => OFFICE_MODULES[k].package), ...OFFICE_FONT_PACKAGES], verify: 'command -v soffice' };
  const k = MODULE_KEYS.find((x) => OFFICE_MODULES[x].id === what);
  if (!k) return null;
  return { what, label: OFFICE_MODULES[k].label, packages: [OFFICE_MODULES[k].package, ...OFFICE_FONT_PACKAGES], verify: 'command -v soffice' };
}
const INSTALL_WHATS = Object.freeze([...OFFICE_ROW_IDS, FONTS_ID]);
/** The LibreOffice installables (src/installs.js registers them — lane dc-apps-rows): planned from the machine's facts op
 *  over the closed spec (the package slot's packageInstallPlan), done once the machine's catalog serves the row. */
const INSTALL_ROWS = Object.freeze(INSTALL_WHATS.map((id) => Object.freeze({ id, from: 'facts', spec: installSpecFor(id), done: 'catalog' })));

// ── ending a session without losing an edit (B-04da) ──
/**
 * B-04da ④ — THE ARGV THAT ASKS A RUNNING LIBREOFFICE TO QUIT (PURE): `<exec> -env:UserInstallation=<the session's
 * profile> .uno:Quit`. A second LibreOffice started on the SAME profile hands its arguments to the running one over
 * that profile's pipe and exits (the header's reason for the per-session profile), and a `.uno:` argument is
 * DISPATCHED there — `.uno:Quit` is File ▸ Exit: every modified document raises LibreOffice's own "Save changes to
 * document … before closing?" in its window (Save / Don't Save / Cancel), an unmodified one closes and LibreOffice
 * removes its own lock. MEASURED 2026-10-02 (LibreOffice 26.2.5.2, Xvfb): unmodified ⇒ the hand-over returns in 18 ms
 * and the app exits 224 ms later, no `.~lock` left; modified ⇒ the prompt shows and the hand-over BLOCKS until it is
 * answered (Cancel ⇒ the app keeps running, the document still open). Run it ONLY while the session's app is alive: on
 * a profile nobody runs, the hand-over starts a fresh LibreOffice that quits at once (measured, 131 ms).
 * null = no absolute profile (nothing to hand over to).
 */
function officeQuitArgv(profileDir) {
  const prof = userInstallationArg(profileDir);
  return prof ? [prof, '.uno:Quit'] : null;
}
/** WM_CLASS of LibreOffice's Start Center (MEASURED 2026-10-02: `"libreoffice", "libreoffice-startcenter"`, title
 *  "LibreOffice"; a Writer document is `"libreoffice", "libreoffice-writer"`). */
const START_CENTER_CLASS = 'libreoffice-startcenter';
/**
 * B-04da ⑤ — A FILE SESSION WHOSE MAIN WINDOW BECAME THE START CENTER ENDS (PURE). Closing the last document from
 * inside LibreOffice (File ▸ Close, the menu bar's ✕) leaves its Start Center — a window of an app nobody opened —
 * where the document was; the window's ✕ (WM_DELETE_WINDOW) on the last document ends LibreOffice outright
 * (measured). `classInstance` = the main window's xpra `class-instance` ([res_name, res_class]).
 *   → { end, why: 'not-office'|'no-file'|'document'|'start-center' } — the generic row (no file) keeps its Start Center:
 *   that IS what it opened.
 */
function startCenterVerdict({ office = null, file = null, classInstance = null } = {}) {
  if (!office) return { end: false, why: 'not-office' };
  if (!file) return { end: false, why: 'no-file' };
  const cls = Array.isArray(classInstance) ? classInstance.map((c) => String(c)) : [];
  return cls.includes(START_CENTER_CLASS) ? { end: true, why: 'start-center' } : { end: false, why: 'document' };
}

module.exports = {
  OFFICE_EXECS, OFFICE_FONT_PACKAGES, OFFICE_MODULES, MODULE_KEYS, OFFICE_ANY, GENERIC_ID, EXT_MODULE, OFFICE_EXTS, OFFICE_ROWS, OFFICE_ROW_IDS, INSTALL_WHATS, INSTALL_ROWS,
  PATH_MAX, LABEL_MAX, baseName, extOf, moduleForFile, isOfficeFile, foldAbs, fileLabel, isOfficeModule,
  fileVerdict, hostKey, openWithVerdict, userInstallationArg, officeArgv, officeRowFor, installSpecFor, remedyFor,
  lockFileOf, staleLockVerdict,
  OFFICE_FONTS, FONTS_ID, fontsMissingOf, officeQuitArgv, START_CENTER_CLASS, startCenterVerdict, // B-04da
};
