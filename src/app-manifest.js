'use strict';
/**
 * APPS THAT SURVIVE A REBUILT MACHINE — THE PURE HALF (Layer 0 of docs/design-app-persistence.zh.md, §3.1).
 * Imports nothing; CJS so the hub, the bundle and the device daemon (which bundles src/desktop-serve.js →
 * src/app-serve.js → this file) share ONE spelling.
 *
 * What lives where on a machine (the machine's state, never the instance's — a re-seeded ~/vibespace loses nothing,
 * a paired machine has the same layout):
 *   ~/.vibespace/apps/manifest.json   THE INDEX — `{v, generation, sources, entries, resolved}`; written ONLY by
 *                                     VibeSpace's own process (src/app-serve.js, writeJsonAtomic), never by a script.
 *                                     It is what the dialog and the agent read. It is NOT the authority for what root
 *                                     reinstalls: an agent runs as the same user and can edit it.
 *   ~/.vibespace/apps/debs/           root:root 0755 — the local `.deb` repository: `*.deb` (named
 *                                     <pkg>_<version without epoch>_<arch>.deb), one `.stanza` each (dpkg-deb -f +
 *                                     Filename/Size/SHA256 — PURE packagesStanza is the same text), `Packages` = the
 *                                     stanzas joined. A `file:` source: apt verifies every SHA256 itself.
 *   ~/.vibespace/apps/sys/            root:root 0755 — THE AUTHORITY root reads: entries/<id>.list (the approved
 *                                     top-level packages), entries/<id>.desktop (their .desktop files), keys/,
 *                                     sources/ (third-party sources + their keys, copied at approval; <id>.pref =
 *                                     the source's apt pin), entries/<id>.pin (what an install took FROM an approved
 *                                     source: "<source> <package>" lines — the pin's allow-list), base/status +
 *                                     base/sha (the dpkg set of the image the cache is completed against). The root
 *                                     script refuses a directory that is not root-owned and not group/other-writable,
 *                                     so a user-level process can only rearrange what root itself wrote.
 *   ~/.vibespace/apps/staging/        user-owned — a .deb or a key the user's plan copied, bound by its sha256: root
 *                                     installs it only when the bytes still hash to the approved value.
 *   /var/lib/vibespace/               root-owned, on the EPHEMERAL root filesystem: `apps-replayed` (this rootfs has
 *                                     the entries — a hit costs 1 ms at boot), `dpkg-touched` (the DPkg::Post-Invoke
 *                                     tripwire), `slot-ended` + `last-dpkg.list` (the dpkg set as VibeSpace left it).
 *
 * The pieces here (each table-tested by scripts/test-app-manifest.mjs over output captured from a real apt):
 *   · validateManifest / emptyManifest / withEntry / withoutEntry / withSource — the index's schema
 *   · parseSim / parseUris / parsePlan — `apt-get -s install` + `--print-uris` → the plan the dialog shows, with the
 *     NAMED refusals: needs_snap · conflict · removes · not_found · bad_name · bad_source · no_sudo · no_apt · disk
 *   · parseDesktopFile — a .desktop file → ONE catalog row `app.<entry>` (%f/%U stripped, Terminal=true wrapped in
 *     xterm, NoDisplay/Hidden skipped) checked by the caller's validateAppRow (an exec is a HUMAN's: only a row the
 *     user's approval made exists)
 *   · parseDpkgStatus / dpkgLines / dpkgDelta — the dpkg set and its difference
 *   · packagesStanza / packagesIndex / debFileName — the local repo's index, the same bytes the root script writes
 *   · cacheVerdict — closure − base ⊆ cache (P15: the cache is judged against the IMAGE's base, never against what
 *     this rootfs happens to hold — a package another install brought in is still missing on a fresh one)
 *   · replayRungs — rung 1 offline from the local repo; rung 2 online only when the base changed, rung 1 failed or
 *     the user pressed Refresh
 *   · driftVerdict — "installed outside VibeSpace" (the tripwire touched after VibeSpace's last run)
 *   · APP_SCRIPT + appArgv + appCommands — the ONE root script (packages are argv POSITIONS, never interpolated), the
 *     argv the machine's ONE package slot runs (src/install-slot.js installLauncherArgv), the commands a person reads
 *   · parseRunLog — the script's `= …` lines (delta / desktop / service / deb / entry / base / pin / refused / ok)
 *   · fetchVerdict / sniffInstaller / appImageOffset / debMembers / debIconOf / appImageRow / removePlanFor
 *     — an installer the agent names by ADDRESS or FILE (design 009 §2 A): the address judged before any byte moves (https,
 *     a public name, every redirect re-judged), the kind by the BYTES, the app's own .desktop out of the archive, the
 *     removal of every kind
 *   · pinHost / sourcePin / originOf / withPins — THE PIN of an approved third-party source (verify-r1 H1): every
 *     package from its host at priority 1 (apt takes such a version only when nothing installed has that name), the
 *     packages the user approved FROM it at 500; the Refresh card names each update's origin
 */

const MANIFEST_V = 1;
/** Where a machine keeps its apps, relative to the user's home. */
const APPS_REL = '.vibespace/apps';
/** Debian's package-name rule + how long apt waits for another apt's lock: ONE home, the machine's package slot. */
const { PKG_RE, APT_LOCK_WAIT_S } = require('./install-slot'); // PURE (lane dc-apps-rows, F-I3)
const ENTRY_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NONCE_RE = /^[a-z0-9]{8,32}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const FPR_RE = /^[0-9A-F]{40}(?:[0-9A-F]{24})?$/;
/** Kinds of entry — ONE file each in src/app-kinds/ (lanes dc-apps-rows F-A1, dc-app-kinds). `apt` = packages from the machine's
 *  sources (or an approved third-party one), `deb` = a .deb file the user had (its bytes copied into the repo, sha256
 *  kept) — the rows declaring `entry: 'root'`. The user-level kinds (§3.4, `entry: 'home'`) live in HOME and need no
 *  replay (the home volume keeps them); uv-tool / npm are recorded (POST /api/agent/apps/user-kind), an AppImage is
 *  proposed. */
const K = require('./app-kinds/index.js'); // PURE — an app kind is its own file + one index line
const { ENTRY_KINDS, HOME_KINDS } = K;
const BY_KINDS = Object.freeze(['user', 'agent']);
/** Every refusal a plan may carry, by name (the dialog and the CLI word them). */
const PLAN_CODES = Object.freeze(['no_facts', 'no_apt', 'bad_name', 'not_found', 'conflict', 'removes', 'needs_snap', 'bad_source', 'disk', 'no_sudo', 'shared', 'nothing']);
/** Free space kept on a file system after an install (design §3.1 "磁盘底线"). */
const DISK_FLOOR_BYTES = 2 * 1024 * 1024 * 1024;
const MARKER_DIR = '/var/lib/vibespace';
const REPLAY_MARKER = `${MARKER_DIR}/apps-replayed`;
const DRIFT_MARKER = `${MARKER_DIR}/dpkg-touched`;
const SLOT_ENDED = `${MARKER_DIR}/slot-ended`;
const LAST_LIST = `${MARKER_DIR}/last-dpkg.list`;
const DRIFT_HOOK = '/etc/apt/apt.conf.d/99vibespace-apps';
const APP_ID_PREFIX = 'app.';
/** The modes of the root script (APP_SCRIPT). */
const SCRIPT_MODES = Object.freeze(['install', 'deb', 'remove', 'replay', 'replay-online', 'refresh', 'adopt', 'source', 'source-remove', 'forget']); // design 019 M2: `forget` = drop root's record only (a move into the app system), no apt
/** How long a tripwire touch may trail VibeSpace's own last run and still be VibeSpace's (dpkg's hook fires inside it). */
const DRIFT_SLACK_MS = 2000;
/** verify-r1 H1 — the pin's two priorities: everything from an approved source's host LOW (apt_preferences: 0 < P < 100
 *  = "only when no version is installed" — a newer build of a package the machine has, or one another source also
 *  carries, never wins), what the user approved from it at apt's default. */
const PIN_LOW = 1;
const PIN_APPROVED = 500;
/** verify-r1 H2 — the most root copies out of a user-owned file (MiB; app-serve's DEB_MAX is 4 GiB). */
const GRAB_MAX_MB = 4096;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x, max = 200) => (typeof x === 'string' ? x.slice(0, max) : null);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

// ── the index's schema ──────────────────────────────────────────────────────────────────────────────────────────
function emptyManifest() {
  return { v: MANIFEST_V, generation: 0, sources: [], entries: [], resolved: { codename: null, arch: null, baseSha: null, debs: [], at: null } };
}
const URI_RE = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~%+\/-]*)?$/;
const SUITE_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,63}$/;
/** A third-party apt source as a person proposes it → `{ok, source}` | `{ok:false, code:'bad_source', error}`.
 *  https only (§3.1), a key URL (https) — a source without a key (no Signed-By) is refused by name. */
function validateSourceSpec(s) {
  const bad = (error) => ({ ok: false, code: 'bad_source', error });
  if (!isObj(s)) return bad('a package source needs {id, uris, suites, components, key}');
  const id = String(s.id || '');
  if (!ENTRY_ID_RE.test(id)) return bad(`the source's name must be lowercase letters, digits and dashes (got ${JSON.stringify(id.slice(0, 40))})`);
  const uris = Array.isArray(s.uris) ? s.uris.map(String) : typeof s.uris === 'string' ? [s.uris] : [];
  if (!uris.length || uris.length > 4) return bad('a package source needs one to four https addresses');
  for (const u of uris) {
    if (!/^https:\/\//.test(u)) return bad(`${u.slice(0, 120)} is not https — VibeSpace adds only https package sources`);
    if (!URI_RE.test(u)) return bad(`${u.slice(0, 120)} is not a plain https address`);
  }
  const list = (x) => (Array.isArray(x) ? x.map(String) : typeof x === 'string' ? x.split(/\s+/).filter(Boolean) : []);
  const suites = list(s.suites), components = list(s.components);
  if (!suites.length || suites.length > 8 || !suites.every((x) => SUITE_RE.test(x))) return bad('suites must be one to eight plain names (like "stable" or "bookworm")');
  if (components.length > 8 || !components.every((x) => SUITE_RE.test(x))) return bad('components must be plain names (like "main")');
  if (suites.some((x) => x.endsWith('/')) && components.length) return bad('a flat source ("./") takes no components');
  const key = typeof s.key === 'string' ? s.key : '';
  if (!key) return bad('a package source needs its signing key (an https address) — VibeSpace never adds a source without Signed-By');
  if (!/^https:\/\//.test(key) || !URI_RE.test(key)) return bad(`the key address ${key.slice(0, 120)} is not a plain https address`);
  const out = { id, uris, suites, components, key };
  if (s.keySha256 != null) { if (!SHA256_RE.test(String(s.keySha256))) return bad('keySha256 must be 64 hex digits'); out.keySha256 = String(s.keySha256); }
  if (s.fingerprints != null) {
    const f = Array.isArray(s.fingerprints) ? s.fingerprints.map((x) => String(x).toUpperCase()) : [];
    if (!f.length || !f.every((x) => FPR_RE.test(x))) return bad('fingerprints must be OpenPGP fingerprints (40 or 64 hex digits)');
    out.fingerprints = f;
  }
  return { ok: true, source: out };
}
/** The deb822 text of an approved source, its key at `keyPath` (root-only: /etc/apt/keyrings/…). */
function sourceDeb822(src, keyPath) {
  return ['Types: deb', `URIs: ${src.uris.join(' ')}`, `Suites: ${src.suites.join(' ')}`, ...(src.components && src.components.length ? [`Components: ${src.components.join(' ')}`] : []), `Signed-By: ${keyPath}`].join('\n') + '\n';
}
/** verify-r1 H1 — the host an approved source's `Pin: origin` names: the URI's host (apt's origin is the site, no port). */
function pinHost(uri) { const m = /^https:\/\/([A-Za-z0-9.-]+)(?::\d{1,5})?(?:\/|$)/.exec(String(uri || '')); return m ? m[1] : null; }
/** verify-r1 H1 — THE PIN of an approved source: every package from its host at PIN_LOW, the packages the user approved
 *  FROM it (sorted, unique) at PIN_APPROVED. The same bytes the root script's pins() writes to
 *  /etc/apt/preferences.d/vibespace-<id>.pref (and root's copy, sys/sources/<id>.pref). */
function sourcePin({ host, packages = [] } = {}) {
  const pk = [...new Set((packages || []).filter((p) => PKG_RE.test(p)))].sort();
  const rec = (names, prio) => `Package: ${names}\nPin: origin "${host}"\nPin-Priority: ${prio}\n`;
  return rec('*', PIN_LOW) + (pk.length ? '\n' + rec(pk.join(' '), PIN_APPROVED) : '');
}
/** verify-r1 H1 — where a .deb apt would fetch comes from: `{source, host}` — an approved source's id when its URI is
 *  the URL's prefix, else null and the URL's host (null for a `file:` repository). */
function originOf(url, sources = []) {
  const u = String(url || '');
  for (const s of sources || []) for (const b of (s && s.uris) || []) if (u.startsWith(String(b).replace(/\/+$/, '') + '/')) return { source: s.id, host: pinHost(b) };
  const m = /^[a-z][a-z0-9+.-]*:\/\/([A-Za-z0-9.-]+)/i.exec(u);
  return { source: null, host: m ? m[1] : null };
}
const normPin = (p) => (isObj(p) && Array.isArray(p.packages) ? { packages: p.packages.map(String).filter((x) => PKG_RE.test(x)).slice(0, 512) } : null);
function normBy(b) {
  if (!isObj(b) || !BY_KINDS.includes(b.kind)) return null;
  const out = { kind: b.kind };
  if (typeof b.conversation === 'string' && b.conversation) out.conversation = b.conversation.slice(0, 120);
  if (typeof b.name === 'string' && b.name) out.name = b.name.slice(0, 120);
  if (typeof b.sessionId === 'string' && b.sessionId) out.sessionId = b.sessionId.slice(0, 80);
  return out;
}
/** design 009 §2 A — a row's localized names `{zh?, ja?}` (the client picks by the device's language), or null. */
function normLabels(l) {
  if (!isObj(l)) return null;
  const out = {};
  for (const k of ['zh', 'ja']) if (typeof l[k] === 'string' && l[k].trim()) out[k] = l[k].replace(/[\r\n]/g, ' ').trim().slice(0, 80);
  return Object.keys(out).length ? out : null;
}
function normRow(r) {
  if (!isObj(r) || typeof r.id !== 'string' || !(r.id.startsWith(APP_ID_PREFIX) || r.id.startsWith('sys.'))) return null; // `sys.` = a row of the app system (Layer 1, src/app-system.js ROW_PREFIX)
  const out = { id: r.id.slice(0, 64), label: str(r.label, 80) || r.id, exec: str(r.exec, 512) || '', args: Array.isArray(r.args) ? r.args.filter((a) => typeof a === 'string').slice(0, 64) : [] };
  for (const k of ['icon', 'desktop', 'category', 'package']) if (typeof r[k] === 'string' && r[k]) out[k] = r[k].slice(0, 512);
  const labels = normLabels(r.labels);
  if (labels) out.labels = labels;
  return out;
}
function normEntry(e) {
  if (!isObj(e)) return { ok: false, error: 'an entry must be an object' };
  if (!ENTRY_ID_RE.test(String(e.id || ''))) return { ok: false, error: `entry id must match ${ENTRY_ID_RE}` };
  if (!ENTRY_KINDS.includes(e.kind)) return { ok: false, error: `entry ${e.id}: kind must be one of ${ENTRY_KINDS.join('/')}` };
  const packages = Array.isArray(e.packages) ? e.packages.map(String) : [];
  if (K.kindRow(e.kind).entry === 'root' && (!packages.length || packages.length > 64 || !packages.every((p) => PKG_RE.test(p)))) return { ok: false, error: `entry ${e.id}: packages must be 1–64 Debian package names` };
  const by = normBy(e.by);
  if (!by) return { ok: false, error: `entry ${e.id}: by must be {kind: user|agent}` };
  const out = { id: e.id, kind: e.kind, packages, source: typeof e.source === 'string' && e.source ? e.source.slice(0, 40) : null, addedAt: num(e.addedAt), by, approvedAt: num(e.approvedAt),
    rows: (Array.isArray(e.rows) ? e.rows : []).map(normRow).filter(Boolean).slice(0, 16), services: (Array.isArray(e.services) ? e.services : []).filter((u) => typeof u === 'string' && /^[A-Za-z0-9@._-]{1,120}\.service$/.test(u)).slice(0, 16) };
  if (typeof e.why === 'string' && e.why) out.why = e.why.slice(0, 500);
  if (typeof e.label === 'string' && e.label) out.label = e.label.slice(0, 80);
  if (e.layer === 'sys' && K.kindRow(e.kind).entry === 'root') out.layer = 'sys'; // installed INTO the app system (Layer 1) — nothing to replay
  const readRecord = K.kindRow(e.kind).record; // the kind's own record reader (what root / the home wrote for it)
  if (readRecord) {
    const x = readRecord(e, { isObj, str, num, SHA256_RE, PKG_RE });
    if (x && x.error) return { ok: false, error: `entry ${e.id}: ${x.error}` };
    if (x) Object.assign(out, x);
  }
  return { ok: true, entry: out };
}
/** The index → `{ok, manifest}` (normalized: unknown keys dropped) | `{ok:false, error}`. */
function validateManifest(m) {
  if (!isObj(m)) return { ok: false, error: 'the manifest must be an object' };
  if (m.v !== MANIFEST_V) return { ok: false, error: `unknown manifest version ${JSON.stringify(m.v)} (this VibeSpace reads v${MANIFEST_V})` };
  const out = emptyManifest();
  out.generation = Number.isInteger(m.generation) && m.generation >= 0 ? m.generation : 0;
  const ids = new Set();
  for (const e of Array.isArray(m.entries) ? m.entries : []) {
    const v = normEntry(e);
    if (!v.ok) return { ok: false, error: v.error };
    if (ids.has(v.entry.id)) return { ok: false, error: `entry ${v.entry.id} appears twice` };
    ids.add(v.entry.id); out.entries.push(v.entry);
  }
  const sids = new Set();
  for (const s of Array.isArray(m.sources) ? m.sources : []) {
    const v = validateSourceSpec(s);
    if (!v.ok) return { ok: false, error: `source ${isObj(s) ? s.id : '?'}: ${v.error}` };
    if (sids.has(v.source.id)) return { ok: false, error: `source ${v.source.id} appears twice` };
    sids.add(v.source.id);
    out.sources.push({ ...v.source, addedAt: num(s.addedAt), approvedAt: num(s.approvedAt), by: normBy(s.by) || { kind: 'user' }, ...(normPin(s.pin) ? { pin: normPin(s.pin) } : {}) });
  }
  const r = isObj(m.resolved) ? m.resolved : {};
  out.resolved = { codename: str(r.codename, 40), arch: str(r.arch, 20), baseSha: SHA256_RE.test(String(r.baseSha || '')) ? r.baseSha : null,
    debs: (Array.isArray(r.debs) ? r.debs : []).filter((d) => isObj(d) && PKG_RE.test(String(d.package || ''))).map((d) => ({ package: d.package, version: str(d.version, 120), arch: str(d.arch, 20), file: str(d.file, 200), size: num(d.size), sha256: SHA256_RE.test(String(d.sha256 || '')) ? d.sha256 : null })).slice(0, 5000), at: num(r.at) };
  return { ok: true, manifest: out };
}
const bump = (m) => ({ ...m, generation: (m.generation || 0) + 1 });
/** A new manifest with `entry` added or replaced (by id); throws by name on a malformed entry. */
function withEntry(m, entry) {
  const v = normEntry(entry);
  if (!v.ok) throw new Error(v.error);
  return bump({ ...m, entries: [...m.entries.filter((e) => e.id !== v.entry.id), v.entry] });
}
function withoutEntry(m, id) { return bump({ ...m, entries: m.entries.filter((e) => e.id !== id) }); }
const pkgSet = (l) => [...new Set(l || [])].sort().join(' ');
/**
 * design 019 M1 — THE INDEX FOLLOWS ROOT. `host` / `sys` = root's records in each layer (`[{id, packages}]`; null = that
 * layer could not be read — its entries are left alone). An apt / deb index entry's `layer` follows where root's record
 * is (host ⇒ no flag, sys ⇒ 'sys'; in BOTH with the same packages = a move in flight ⇒ 'sys', the copy that persists);
 * one with a record in neither readable layer is DROPPED (a ghost: a Roll back swapped its userland away); a record with
 * no index entry gets a minimal one (by the user, label = the id). The same id in both layers over DIFFERENT packages is
 * a collision: named, never merged. Home kinds untouched. PURE → {manifest, changed, dropped, indexed, relayered, collisions}.
 */
function reconcileIndex(m, { host = null, sys = null } = {}) {
  const out = { manifest: m, changed: false, dropped: [], indexed: [], relayered: [], collisions: [] };
  if (!m || !Array.isArray(m.entries)) return out;
  const by = (l) => new Map((l || []).filter((e) => e && ENTRY_ID_RE.test(String(e.id || ''))).map((e) => [e.id, e]));
  const H = host ? by(host) : null, S = sys ? by(sys) : null;
  const entries = [];
  for (const e of m.entries) {
    if ((K.kindRow(e.kind) || {}).entry !== 'root') { entries.push(e); continue; }
    const h = H && H.get(e.id), s = S && S.get(e.id);
    let layer;
    if (h && s) { if (pkgSet(h.packages) !== pkgSet(s.packages)) { out.collisions.push(e.id); entries.push(e); continue; } layer = 'sys'; }
    else if (s) layer = 'sys';
    else if (h) layer = null;
    else if ((e.layer === 'sys' ? S : H) && H && S) { out.dropped.push(e.id); continue; }
    else { entries.push(e); continue; } // its layer could not be read: left alone
    if ((e.layer || null) !== layer) { out.relayered.push(e.id); const { layer: _l, ...rest } = e; entries.push(layer ? { ...rest, layer } : rest); } else entries.push(e);
  }
  const have = new Set(entries.map((e) => e.id));
  for (const [map, layer] of [[H, null], [S, 'sys']]) {
    for (const r of map ? map.values() : []) {
      if (have.has(r.id)) continue;
      const packages = (r.packages || []).filter((p) => PKG_RE.test(p));
      if (!packages.length) continue;
      const v = normEntry({ id: r.id, kind: 'apt', packages, label: r.id, by: { kind: 'user' }, rows: [], services: [], ...(layer ? { layer } : {}) });
      if (v.ok) { entries.push(v.entry); have.add(r.id); out.indexed.push(r.id); }
    }
  }
  out.changed = !!(out.dropped.length || out.indexed.length || out.relayered.length);
  if (out.changed) out.manifest = bump({ ...m, entries });
  return out;
}
/** design 019 M3 — ONE ROW PER APP: a host row whose `package` an app-system row also carries is dropped (the sys row
 *  persists; the host copy is gone at the next rebuild). PURE. */
function dedupeRows(hostRows, sysRows) {
  const pk = new Set((sysRows || []).map((r) => r && r.package).filter(Boolean));
  return (hostRows || []).filter((r) => !(r && r.package && pk.has(r.package)));
}
function withSource(m, src) {
  const v = validateSourceSpec(src);
  if (!v.ok) throw new Error(v.error);
  return bump({ ...m, sources: [...m.sources.filter((s) => s.id !== v.source.id), { ...v.source, addedAt: num(src.addedAt), approvedAt: num(src.approvedAt), by: normBy(src.by) || { kind: 'user' }, ...(normPin(src.pin) ? { pin: normPin(src.pin) } : {}) }] });
}
/** verify-r1 H1 — the pins a root run printed (`= pin <source> <package…>`, parseRunLog's `pins`) recorded on their
 *  sources: the index mirrors what root holds (root's sys/sources/<id>.pref is what a replay re-creates). */
function withPins(m, pins) {
  if (!isObj(pins) || !Object.keys(pins).length) return m;
  return { ...m, sources: m.sources.map((s) => (Object.prototype.hasOwnProperty.call(pins, s.id) ? { ...s, pin: normPin({ packages: pins[s.id] }) } : s)) };
}
function withoutSource(m, id) { return bump({ ...m, sources: m.sources.filter((s) => s.id !== id) }); }
/** An entry id for a request: the first package's name, dots/pluses as dashes; a taken id gets -2, -3 … */
function entryIdFor(name, taken = []) {
  const base = String(name || 'app').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'app';
  const have = new Set(taken);
  if (!have.has(base) && ENTRY_ID_RE.test(base)) return base;
  for (let i = 2; i < 1000; i++) { const id = `${base}-${i}`; if (!have.has(id)) return id; }
  throw new Error('no free entry id');
}

// ── apt's own words → a plan ────────────────────────────────────────────────────────────────────────────────────
const UNIT = { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
/** "53.1 kB" / "1,234 kB" / "9 B" → bytes (apt prints SI units under LC_ALL=C), or null. */
function parseSize(s) {
  const m = /([\d][\d,]*(?:\.\d+)?)\s*(B|kB|KB|MB|GB|TB)\b/.exec(String(s || ''));
  if (!m) return null;
  return Math.round(Number(m[1].replace(/,/g, '')) * UNIT[m[2]]);
}
const INST_RE = /^Inst (\S+) (?:\[([^\]]+)\] )?\((\S+) (.*?) ?\[([^\]]+)\]\)/;
/** `apt-get -s install …` (or `-s remove` / `-s upgrade`) → its facts. */
function parseSim(text) {
  const out = { inst: [], remv: [], notFound: [], errors: [], unmet: [], broken: false, counts: null, already: [], skipped: [], warnings: [] };
  for (const raw of String(text || '').split('\n')) {
    const l = raw.replace(/\r$/, '');
    let m;
    if ((m = INST_RE.exec(l))) { const [name, arch0] = m[1].split(':'); out.inst.push({ package: name, arch: arch0 || m[5], version: m[3], from: m[2] || null, origin: m[4].replace(/,\s*$/, '').trim() }); continue; }
    if ((m = /^Remv (\S+)(?: \[([^\]]+)\])?/.exec(l))) { out.remv.push({ package: m[1].split(':')[0], version: m[2] || null }); continue; }
    if ((m = /^E: Unable to locate package (\S+)/.exec(l))) { out.notFound.push(m[1]); out.errors.push(l.slice(3)); continue; }
    if ((m = /^E: Package '([^']+)' has no installation candidate/.exec(l))) { out.notFound.push(m[1]); out.errors.push(l.slice(3)); continue; }
    if ((m = /^E: Couldn't find any package by (?:glob|regex) '([^']+)'/.exec(l))) { out.notFound.push(m[1]); out.errors.push(l.slice(3)); continue; }
    if (/^E: Unable to correct problems/.test(l)) { out.broken = true; out.errors.push(l.slice(3)); continue; }
    if ((m = /^E: (.*)$/.exec(l))) { out.errors.push(m[1]); continue; }
    if ((m = /^W: (.*)$/.exec(l))) { out.warnings.push(m[1]); continue; }
    if ((m = /^ (\S+) : (Depends|PreDepends|Pre-Depends|Conflicts|Breaks): (.*)$/.exec(l))) { out.unmet.push(`${m[1]}: ${m[2]} ${m[3]}`); continue; }
    if ((m = /^\s+(Depends|PreDepends|Pre-Depends|Conflicts|Breaks): (.*)$/.exec(l)) && out.unmet.length) { out.unmet.push(`${out.unmet[out.unmet.length - 1].split(':')[0]}: ${m[1]} ${m[2]}`); continue; }
    if ((m = /^(\d+) upgraded, (\d+) newly installed, (\d+) to remove and (\d+) not upgraded\./.exec(l))) { out.counts = { upgraded: +m[1], installed: +m[2], removed: +m[3], notUpgraded: +m[4] }; continue; }
    if ((m = /^(\S+) is already the newest version \(([^)]+)\)/.exec(l))) { out.already.push({ package: m[1].split(':')[0], version: m[2] }); continue; }
    if ((m = /^Skipping (\S+), it is not installed/.exec(l))) { out.skipped.push(m[1]); continue; }
  }
  return out;
}
/** `apt-get --print-uris -y install …` → the files apt would fetch + its two size lines. */
function parseUris(text) {
  const out = { debs: [], needBytes: null, afterBytes: null, freedBytes: null };
  for (const raw of String(text || '').split('\n')) {
    const l = raw.replace(/\r$/, '');
    let m;
    // the hash may be EMPTY (measured: Debian 12's security mirror lines end `<size> ` — a trailing space, no hash)
    if ((m = /^'([^']+)' (\S+) (\d+) ?(\S*)$/.exec(l))) { out.debs.push({ url: m[1], file: m[2], size: Number(m[3]), hash: m[4] || null }); continue; }
    if ((m = /^Need to get (.+?)(?:\/(.+?))? of archives\./.exec(l))) { out.needBytes = parseSize(m[2] || m[1]); continue; }
    if ((m = /^After this operation, (.+?) of additional disk space will be used\./.exec(l))) { out.afterBytes = parseSize(m[1]); continue; }
    if ((m = /^After this operation, (.+?) disk space will be freed\./.exec(l))) { out.freedBytes = parseSize(m[1]); continue; }
  }
  return out;
}
const fmtBytes = (n) => (n == null ? '?' : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} kB` : `${n} B`);
/** Free space after an install → null, or the refusal WITH the numbers (design §3.1: < installed + 2 GiB). */
function diskVerdict({ rootFree = null, homeFree = null, installedBytes = 0, downloadBytes = 0, floor = DISK_FLOOR_BYTES } = {}) {
  const need = Math.max(0, installedBytes || 0) + floor;
  if (rootFree != null && rootFree < need) return { code: 'disk', error: `the system disk has ${fmtBytes(rootFree)} free; this install needs ${fmtBytes(installedBytes || 0)} plus ${fmtBytes(floor)} kept free` };
  const needHome = Math.max(0, downloadBytes || 0) + floor;
  if (homeFree != null && homeFree < needHome) return { code: 'disk', error: `your home disk has ${fmtBytes(homeFree)} free; keeping this app's packages needs ${fmtBytes(downloadBytes || 0)} plus ${fmtBytes(floor)} kept free` };
  return null;
}
/** Seconds a replay from the local repository takes (P15: GIMP 397 MB installed offline in 8.9 s; a few small
 *  packages ~1 s — the bottleneck is dpkg unpacking, not the copy). */
function replayEstimate(installedBytes) { return Math.max(1, Math.round(1 + (Math.max(0, installedBytes || 0) / 1e6) / 50)); }
/**
 * THE PLAN (PURE): the two simulations a machine ran as its user (src/app-serve.js) → what the dialog shows.
 *   ctx = { requested: [package…], facts: {platform, apt, sudo, root, rootFree, homeFree}, kind: 'apt'|'deb'|'remove',
 *           others: [package…] (for a removal: every OTHER entry's top-level packages), deb: {package, …} }
 * → { ok:false, code, error, … } for a refusal (code ∈ PLAN_CODES), or
 *   { ok:true, code: null|'no_sudo', canRun, closure:[{package, version, arch, origin, upgrade}], closureKey, newCount,
 *     upgradeCount, downloadBytes, installedBytes, origins, packages, removes:[…], replaySeconds }
 * A plan that would REMOVE a package is refused (`removes`, named) — an install never takes something away; a removal
 * that would take another entry's package with it is refused `shared`.
 */
function parsePlan(simText, urisText, ctx = {}) {
  const facts = isObj(ctx.facts) ? ctx.facts : null;
  const requested = Array.isArray(ctx.requested) ? ctx.requested.map(String) : [];
  const kind = ctx.kind || 'apt';
  const base = { packages: requested, kind };
  if (!facts) return { ok: false, code: 'no_facts', error: 'the machine did not report its facts (an older agent?)', ...base };
  if ((facts.platform && facts.platform !== 'linux') || !facts.apt) return { ok: false, code: 'no_apt', error: `${facts.prettyName || facts.distro || 'this machine'} has no apt-get — VibeSpace installs apps with apt only`, ...base };
  const badName = requested.find((p) => !PKG_RE.test(p));
  if (badName !== undefined || (!requested.length && !(K.kindRow(kind) || {}).fileBound)) return { ok: false, code: 'bad_name', error: badName !== undefined ? `${JSON.stringify(String(badName).slice(0, 64))} is not a Debian package name` : 'no package named', ...base };
  const sim = parseSim(simText);
  const uris = parseUris(urisText);
  if (sim.notFound.length) return { ok: false, code: 'not_found', error: `no package named ${sim.notFound.join(', ')} in this machine's package sources`, notFound: sim.notFound, ...base };
  if (kind === 'remove') {
    const removes = sim.remv.map((r) => r.package);
    const others = new Set(Array.isArray(ctx.others) ? ctx.others : []);
    const hit = removes.filter((p) => others.has(p));
    if (hit.length) return { ok: false, code: 'shared', error: `removing it would also remove ${hit.join(', ')}, which another of your apps needs`, removes, ...base };
    const ok = !sim.broken && !sim.errors.length;
    if (!ok) return { ok: false, code: 'conflict', error: sim.errors.join('; ') || 'apt cannot remove it', ...base };
    const canRun = !!(facts.root || facts.sudo);
    return { ok: true, code: canRun ? null : 'no_sudo', error: canRun ? null : 'this machine has no passwordless sudo — run the commands below yourself', canRun, closure: [], closureKey: removes.slice().sort().join(' '), removes, newCount: 0, upgradeCount: 0, downloadBytes: 0, installedBytes: -(uris.freedBytes || 0), origins: [], replaySeconds: 0, ...base };
  }
  if (sim.broken || sim.unmet.length || (sim.errors.length && !sim.inst.length)) return { ok: false, code: 'conflict', error: sim.unmet.length ? `apt cannot install it together with what is installed: ${sim.unmet.slice(0, 6).join('; ')}` : (sim.errors[0] || 'apt cannot install it'), unmet: sim.unmet, ...base };
  if (sim.remv.length) return { ok: false, code: 'removes', error: `installing it would REMOVE ${sim.remv.map((r) => r.package).join(', ')} — VibeSpace never removes a package to install another`, removes: sim.remv.map((r) => r.package), ...base };
  const closure = sim.inst.map((i) => ({ package: i.package, version: i.version, arch: i.arch, origin: i.origin, upgrade: !!i.from }));
  if (closure.some((c) => c.package === 'snapd')) return { ok: false, code: 'needs_snap', error: `${requested.join(' ') || 'this package'} is a placeholder for a snap (it pulls in snapd) — snaps do not run in this machine; install the program another way`, ...base };
  const downloadBytes = uris.debs.length ? uris.debs.reduce((a, d) => a + d.size, 0) : (uris.needBytes || 0);
  const installedBytes = uris.afterBytes != null ? uris.afterBytes : (uris.freedBytes != null ? -uris.freedBytes : 0);
  const disk = diskVerdict({ rootFree: num(facts.rootFree), homeFree: num(facts.homeFree), installedBytes: Math.max(0, installedBytes), downloadBytes });
  if (disk) return { ok: false, ...disk, downloadBytes, installedBytes, ...base };
  const origins = [...new Set(closure.flatMap((c) => c.origin.split(',').map((o) => o.trim()).filter(Boolean)))];
  const canRun = !!(facts.root || facts.sudo);
  const nothing = !closure.length;
  return {
    ok: true, code: canRun ? null : 'no_sudo', error: canRun ? null : 'this machine has no passwordless sudo — run the commands below yourself, then check again', canRun,
    closure, closureKey: closure.map((c) => `${c.package}=${c.version}`).sort().join(' '), newCount: closure.filter((c) => !c.upgrade).length, upgradeCount: closure.filter((c) => c.upgrade).length,
    downloadBytes, installedBytes, origins, already: sim.already.map((a) => a.package), nothing, replaySeconds: replayEstimate(installedBytes), ...base,
  };
}
/** `apt-cache search --names-only …` → [{package, summary}] (≤ max). */
function parseSearch(text, max = 50) {
  const out = [];
  for (const l of String(text || '').split('\n')) {
    const m = /^(\S+) - (.*)$/.exec(l.trim());
    if (m && PKG_RE.test(m[1])) out.push({ package: m[1], summary: m[2].slice(0, 200) });
    if (out.length >= max) break;
  }
  return out;
}
/** A search query a person typed → the words apt-cache is given (letters, digits, + . -), or null. */
function searchWords(q) {
  const w = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!w.length || !w.every((x) => /^[a-z0-9+.-]{2,40}$/.test(x))) return null;
  return w;
}
/** `apt-get -s upgrade` (or `--only-upgrade install`) → how many of THESE packages have an update. With `debs` (the same
 *  request's `--print-uris` files, parseUris) each update names its ORIGIN (verify-r1 H1): the approved source's id
 *  (`source`) or the host apt fetches it from — `origin` is the word the Refresh card shows. */
function updatesOf(simText, packages, { debs = null, sources = [] } = {}) {
  const mine = new Set(packages || []);
  const urlOf = new Map();
  for (const d of debs || []) { const p = String(d.file || '').split('_')[0]; if (!urlOf.has(p)) urlOf.set(p, d.url); }
  return parseSim(simText).inst.filter((i) => i.from && mine.has(i.package)).map((i) => {
    const u = { package: i.package, from: i.from, to: i.version };
    if (debs) { const o = urlOf.has(i.package) ? originOf(urlOf.get(i.package), sources) : null; u.origin = o ? o.source || o.host : null; u.source = o ? o.source : null; }
    return u;
  });
}

// ── a .desktop file → one catalog row ─────────────────────────────────────────────────────────────────────────────
/** The desktop-entry "string" escapes (\s \n \t \r \\ \;). */
function unescapeValue(v) { return String(v).replace(/\\([sntr\\;])/g, (_, c) => ({ s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\', ';': ';' }[c])); }
/** The Exec value → its words (the spec's quoting: "…" with \" \` \$ \\ inside), or null when the quoting is broken. */
function execWords(v) {
  const s = unescapeValue(v);
  const out = [];
  let cur = null;
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '"') {
      cur = cur || ''; i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length && '"`$\\'.includes(s[i + 1])) { cur += s[i + 1]; i += 2; } else cur += s[i++];
      }
      if (s[i] !== '"') return null;
      i++; continue;
    }
    if (c === ' ' || c === '\t') { if (cur !== null) { out.push(cur); cur = null; } i++; continue; }
    cur = (cur || '') + c; i++;
  }
  if (cur !== null) out.push(cur);
  return out;
}
const FIELD_CODES = /%[fFuUdDnNickvm]/g;
/** Words with the field codes expanded to NOTHING (VibeSpace opens an app, never a file through it): a word that is
 *  only a code goes, a code inside a word is cut, `%%` is a percent sign. */
function stripFieldCodes(words) {
  const out = [];
  for (const w of words) {
    if (/^%[fFuUdDnNickvm]$/.test(w)) continue;
    const x = w.split('%%').map((p) => p.replace(FIELD_CODES, '')).join('%');
    if (x !== '' || w === '') out.push(x);
  }
  return out;
}
const CATEGORY_MAP = [['TerminalEmulator', 'terminal'], ['WebBrowser', 'browser'], ['Office', 'office'], ['TextEditor', 'editor'], ['Development', 'editor'], ['Graphics', 'graphics'], ['AudioVideo', 'media'], ['Game', 'game'], ['Science', 'science'], ['Education', 'education'], ['Network', 'network'], ['System', 'utility'], ['Utility', 'utility']];
function categoryOf(cats) {
  const have = String(cats || '').split(';').filter(Boolean);
  for (const [k, v] of CATEGORY_MAP) if (have.includes(k)) return v;
  return 'app';
}
/** A row id for an entry's n-th desktop file: `app.<entry>` for the primary one, `app.<entry>.<stem>` for others. */
function rowIdFor(entry, desktopPath, primary) {
  if (primary) return `${APP_ID_PREFIX}${entry}`;
  const stem = String(desktopPath || '').split('/').pop().replace(/\.desktop$/, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '');
  return `${APP_ID_PREFIX}${entry}.${stem}`.slice(0, 64);
}
/**
 * A `.desktop` file → `{ok:true, row}` | `{ok:false, skip:<why>}` (not an app a person opens: NoDisplay, Hidden, not
 * Type=Application, no Exec) | `{ok:false, error}` (an Exec that cannot be read, a row the validator refuses).
 * `opts.validate` = src/desktop-apps.js validateAppRow (the caller hands it in — this file imports nothing); the row
 * carries `desktop` (where it came from), `icon` (a name or a path — resolved by the icon route) and `package`.
 */
function parseDesktopFile(text, { entry, path: p = null, primary = true, pkg = null, validate = null } = {}) {
  if (!ENTRY_ID_RE.test(String(entry || ''))) return { ok: false, error: 'no entry id' };
  const kv = {}, names = {};
  let main = false;
  for (const raw of String(text || '').split('\n')) {
    const l = raw.replace(/\r$/, '');
    if (!l.trim() || /^\s*#/.test(l)) continue;
    const g = /^\[(.+)\]\s*$/.exec(l);
    if (g) { main = g[1] === 'Desktop Entry'; continue; }
    if (!main) continue;
    const m = /^([A-Za-z0-9-]+)\s*=\s*(.*)$/.exec(l); // the unlocalised key only (Name[zh_TW]= does not match)
    if (m && !(m[1] in kv)) kv[m[1]] = m[2];
    const n = /^Name\[([A-Za-z@_.-]{2,20})\]\s*=\s*(.*)$/.exec(l); // design 009: the localized names, read beside it
    if (n && !(n[1] in names)) names[n[1]] = n[2];
  }
  if ((kv.Type || '') !== 'Application') return { ok: false, skip: 'not-an-application' };
  if (kv.NoDisplay === 'true') return { ok: false, skip: 'no-display' };
  if (kv.Hidden === 'true') return { ok: false, skip: 'hidden' };
  if (!kv.Exec) return { ok: false, skip: 'no-exec' };
  const w0 = execWords(kv.Exec);
  if (!w0 || !w0.length) return { ok: false, error: `the Exec line of ${p || 'the desktop file'} cannot be read` };
  const words = stripFieldCodes(w0);
  if (!words.length) return { ok: false, error: `the Exec line of ${p || 'the desktop file'} names no program` };
  const terminal = kv.Terminal === 'true';
  const label = unescapeValue(kv.Name || words[0].split('/').pop()).replace(/[\r\n]/g, ' ').trim().slice(0, 80);
  const row = { id: rowIdFor(entry, p, primary), label: label || words[0].split('/').pop().slice(0, 80), exec: terminal ? 'xterm' : words[0], args: terminal ? ['-e', ...words] : words.slice(1), category: categoryOf(kv.Categories) };
  if (kv.Icon) row.icon = unescapeValue(kv.Icon).slice(0, 512);
  const labels = desktopNames(names);
  if (labels) row.labels = labels;
  if (p) row.desktop = String(p);
  if (pkg) row.package = String(pkg);
  if (typeof validate === 'function') {
    const v = validate(row);
    if (!v || !v.ok) return { ok: false, error: `${p || 'the desktop file'}: ${(v && v.error) || 'refused'}` };
  }
  return { ok: true, row };
}
/** design 009 §2 A — `Name[xx]` values → `{zh?, ja?}`: zh from Name[zh_CN] › Name[zh] › Name[zh_Hans] › Name[zh_SG] (never
 *  zh_TW / zh_HK — the zh interface is simplified Chinese), ja from Name[ja] › Name[ja_JP]; null when neither exists. */
function desktopNames(names) {
  const pick = (...ks) => { for (const k of ks) { const v = names && typeof names[k] === 'string' ? unescapeValue(names[k]).replace(/[\r\n]/g, ' ').trim().slice(0, 80) : ''; if (v) return v; } return null; };
  const zh = pick('zh_CN', 'zh', 'zh_Hans', 'zh_SG'), ja = pick('ja', 'ja_JP');
  return zh || ja ? { ...(zh ? { zh } : {}), ...(ja ? { ja } : {}) } : null;
}
/** The directories a catalog row's .desktop may come from (root-owned, apt's). */
const desktopPathOk = (p) => typeof p === 'string' && /^\/usr(?:\/local)?\/share\/applications\/[A-Za-z0-9@._+-]+\.desktop$/.test(p) && !p.includes('/../');
/** An icon NAME → the files the icon route may serve, best first (PNG/SVG only — a browser draws them). An absolute
 *  path is accepted only under /usr/share/{icons,pixmaps}. */
function iconCandidates(icon, { appsDir = null } = {}) {
  const s = String(icon || '');
  if (!s) return [];
  if (appsDir && s.startsWith(`${appsDir}/appimage/`)) { const rest = s.slice(appsDir.length + 10); return /^[a-z0-9][a-z0-9-]{0,39}\/icon\.(?:png|svg)$/.test(rest) ? [s] : []; } // an AppImage's icon, copied into its own directory
  if (s.startsWith('/')) return /^\/usr\/share\/(?:icons|pixmaps)\/[A-Za-z0-9@._+\/-]+\.(?:png|svg)$/.test(s) && !s.includes('/../') ? [s] : [];
  if (!/^[A-Za-z0-9@._+-]{1,120}$/.test(s)) return [];
  const out = [];
  for (const size of ['scalable', '256x256', '128x128', '96x96', '64x64', '48x48', '32x32']) for (const ext of size === 'scalable' ? ['svg'] : ['png']) out.push(`/usr/share/icons/hicolor/${size}/apps/${s}.${ext}`);
  out.push(`/usr/share/pixmaps/${s}.png`, `/usr/share/pixmaps/${s}.svg`);
  return out;
}

// ── the dpkg set ────────────────────────────────────────────────────────────────────────────────────────────────
/** /var/lib/dpkg/status (world-readable) → [{package, arch, version}] of the INSTALLED packages. */
function parseDpkgStatus(text) {
  const out = [];
  for (const block of String(text || '').split(/\n\n+/)) {
    const f = {};
    for (const l of block.split('\n')) { const m = /^([A-Za-z-]+): (.*)$/.exec(l); if (m) f[m[1]] = m[2]; }
    if (!f.Package || !f.Status) continue;
    const st = f.Status.split(/\s+/);
    if (st[2] !== 'installed') continue;
    out.push({ package: f.Package, arch: f.Architecture || 'all', version: f.Version || '' });
  }
  return out;
}
/** The dpkg set as the root script's `q` prints it: "pkg:arch version", sorted by bytes (LC_ALL=C sort), unique. */
function dpkgLines(list) {
  const set = new Set((list || []).map((p) => `${p.package}:${p.arch} ${p.version}`));
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
/** The bytes `q | sha256sum` hashes (the base identity): every line + "\n". */
function dpkgListText(list) { return dpkgLines(list).map((l) => l + '\n').join(''); }
/** "pkg:arch version" lines → [{package, arch, version}]. */
function parseDpkgList(text) {
  const out = [];
  for (const l of String(text || '').split('\n')) {
    const m = /^([^\s:]+):(\S+) (\S+)$/.exec(l.trim());
    if (m) out.push({ package: m[1], arch: m[2], version: m[3] });
  }
  return out;
}
/** Two dpkg sets → what changed: added / removed / changed (a version moved). */
function dpkgDelta(before, after) {
  const key = (p) => `${p.package}:${p.arch}`;
  const b = new Map((before || []).map((p) => [key(p), p])), a = new Map((after || []).map((p) => [key(p), p]));
  const added = [], removed = [], changed = [];
  for (const [k, p] of a) { const o = b.get(k); if (!o) added.push(p); else if (o.version !== p.version) changed.push({ package: p.package, arch: p.arch, from: o.version, to: p.version }); }
  for (const [k, p] of b) if (!a.has(k)) removed.push(p);
  const by = (x, y) => (x.package < y.package ? -1 : x.package > y.package ? 1 : 0);
  return { added: added.sort(by), removed: removed.sort(by), changed: changed.sort(by) };
}

// ── the local repository ────────────────────────────────────────────────────────────────────────────────────────
/** The cache's file name for a package: `<pkg>_<version without its epoch>_<arch>.deb` (no `%3a` — a file: source
 *  reads the Filename as written). */
function debFileName({ package: p, version, arch }) { return `${p}_${String(version).replace(/^\d+:/, '')}_${arch}.deb`; }
/** ONE Packages stanza: `dpkg-deb -f` with its blank lines dropped, then Filename / Size / SHA256 — the bytes the root
 *  script writes into <name>.stanza (the heavy gate compares them on a real .deb). */
function packagesStanza({ control, filename, size, sha256 }) {
  const c = String(control || '').split('\n').filter((l) => l !== '').join('\n');
  return `${c}\nFilename: ./${filename}\nSize: ${size}\nSHA256: ${sha256}\n`;
}
/** The Packages file: every stanza followed by a blank line (`{ cat s; echo; }` per stanza). */
function packagesIndex(stanzas) { return (stanzas || []).map((s) => s + '\n').join(''); }
/** A stanza → {package, version, arch, file, size, sha256}. */
function parseStanza(text) {
  const f = {};
  for (const l of String(text || '').split('\n')) { const m = /^([A-Za-z0-9-]+): (.*)$/.exec(l); if (m && !(m[1] in f)) f[m[1]] = m[2]; }
  return f.Package ? { package: f.Package, version: f.Version || null, arch: f.Architecture || null, file: (f.Filename || '').replace(/^\.\//, '') || null, size: f.Size ? Number(f.Size) : null, sha256: f.SHA256 || null } : null;
}
/**
 * THE CACHE-COMPLETENESS RULE (P15): what a fresh machine needs = the closure of the entries against the IMAGE's base;
 * missing = closure − base − cache (by package + version). `complete` ⇔ nothing missing.
 */
function cacheVerdict({ closure = [], base = [], cache = [] } = {}) {
  const k = (p) => `${p.package}=${p.version}`;
  const inBase = new Set(base.map(k)), inCache = new Set(cache.map(k));
  const missing = closure.filter((c) => !inBase.has(k(c)) && !inCache.has(k(c)));
  return { complete: missing.length === 0, missing };
}

// ── after a rebuild ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * WHICH RUNG (design §3.3): → `{run:false, why}` | `{run:true, rung: 1|2, why}`.
 *   refresh          the person pressed Refresh                          → rung 2 (online: update, upgrade, re-cache)
 *   no-entries       nothing to put back                                 → nothing
 *   rung1-failed     the offline rung could not put an entry back        → rung 2
 *   replayed         a replay put every entry back on this root filesystem → nothing (the 1 ms boot)
 *   present          no marker, but every entry's packages are installed (`missing` = 0: an install ran here, no
 *                    replay yet) → nothing
 *   base-unknown / base-changed  the cache was completed against another image → rung 2
 *   fresh-rootfs     a rebuilt machine with the image the cache knows    → rung 1 (offline, from ~/.vibespace/apps/debs)
 */
function replayRungs({ entries = 0, markerHit = false, refresh = false, rung1Failed = false, baseShaNow = null, baseShaStored = null, missing = null } = {}) {
  if (refresh) return { run: true, rung: 2, why: 'refresh' };
  if (!entries) return { run: false, rung: null, why: 'no-entries' };
  if (rung1Failed) return { run: true, rung: 2, why: 'rung1-failed' };
  if (markerHit) return { run: false, rung: null, why: 'replayed' };
  if (missing === 0) return { run: false, rung: null, why: 'present' }; // verify-r1 F4: every entry's packages are installed here (unknown = null ⇒ judged by the rungs)
  if (!baseShaStored) return { run: true, rung: 2, why: 'base-unknown' };
  if (baseShaNow && baseShaNow !== baseShaStored) return { run: true, rung: 2, why: 'base-changed' };
  return { run: true, rung: 1, why: 'fresh-rootfs' };
}
/**
 * THE DRIFT TRIPWIRE'S VERDICT: dpkg ran after VibeSpace's last package run (the Post-Invoke hook touched the marker
 * later than the slot's end) AND the dpkg set moved since → `{drift:true, added, removed, changed}`; anything else
 * `{drift:false, why}`. `managed` = packages the manifest already names (adopting them again would be a no-op).
 */
function driftVerdict({ touchedAt = null, slotEndedAt = null, last = null, now = null, managed = [], slackMs = DRIFT_SLACK_MS } = {}) {
  if (touchedAt == null) return { drift: false, why: 'no-tripwire' };
  if (slotEndedAt == null || last == null) return { drift: false, why: 'no-baseline' };
  if (touchedAt <= slotEndedAt + slackMs) return { drift: false, why: 'ours' };
  const d = dpkgDelta(last, now || []);
  const mine = new Set(managed);
  const added = d.added.filter((p) => !mine.has(p.package));
  if (!added.length && !d.removed.length && !d.changed.length) return { drift: false, why: 'unchanged' };
  return { drift: true, why: 'outside', added, removed: d.removed, changed: d.changed };
}

// ── the root script ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * THE ONE ROOT SCRIPT. Run by the machine's ONE package slot (src/install-slot.js installLauncherArgv — detached,
 * flock-held, re-attached never twice) as `sudo -n sh -c APP_SCRIPT vs-app <appsDir> <mode> <id> <nonce> -- <args…>`.
 * Every name it touches arrives as a positional parameter and is re-checked here (a package name by Debian's rule, the
 * apps dir as the invoking user's own, an id, a nonce); nothing is interpolated into the text. It prints its facts as
 * `= …` lines the machine half parses (parseRunLog) and exits 0 (done — per-entry failures of a replay are named, not
 * fatal), 125 (refused by name: `= refused <code> …`) or apt's own code.
 */
const APP_SCRIPT = [
  'set -eu',
  'export LC_ALL=C DEBIAN_FRONTEND=noninteractive',
  'A=$1; MODE=$2; ID=$3; NONCE=$4; shift 4',
  'if [ "${1:-}" = -- ]; then shift; fi',
  "say() { printf '= %s\\n' \"$*\"; }",
  'refuse() { say refused "$@"; exit 125; }',
  'pkgok() { case $1 in [a-z0-9]?*) ;; *) return 1 ;; esac; case $1 in *[!a-z0-9+.-]*) return 1 ;; esac; [ ${#1} -le 64 ]; }',
  'case $ID in ""|-*|*[!a-z0-9-]*) refuse bad-id ;; esac',
  'case $NONCE in ""|*[!a-z0-9]*) refuse bad-nonce ;; esac',
  'case $MODE in ""|*[!a-z-]*) refuse bad-mode ;; esac',
  'say run "$ID" "$NONCE" "$MODE"', // FIRST after the three names that key it: every refusal below is attributable to this run
  'case $MODE in install|deb|remove|replay|replay-online|refresh|adopt|source|source-remove|forget) ;; *) refuse bad-mode ;; esac',
  'case $A in /*) ;; *) refuse bad-apps-dir ;; esac',
  'case $A in *[!A-Za-z0-9._/@+-]*|*/../*|*/..) refuse bad-apps-dir ;; esac',
  // every positional argument is judged BEFORE anything is touched (and before root is even asked): a name that is not a
  // package is refused here, never handed to apt; nothing here is ever expanded as code
  'case $MODE in',
  'forget) [ $# -eq 0 ] || refuse bad-args ;;',
  'install|adopt) [ $# -gt 0 ] || refuse no-packages; for p in "$@"; do pkgok "$p" || refuse bad-name "$p"; done ;;',
  'deb) case ${1:-} in "$A"/staging/*.deb) ;; *) refuse bad-deb-path ;; esac; case $1 in */../*|*[!A-Za-z0-9._/@+-]*) refuse bad-deb-path ;; esac; case ${2:-} in *[!0-9a-f]*|"") refuse bad-sha ;; esac; [ ${#2} -eq 64 ] || refuse bad-sha ;;',
  'source) case ${1:-} in https://*) ;; *) refuse bad-source not-https ;; esac; case $1 in *[!A-Za-z0-9._~:/%+-]*) refuse bad-source uri ;; esac; case "${2:-}${3:-}" in *[!A-Za-z0-9._/\\ -]*) refuse bad-source suites ;; esac; [ -n "${2:-}" ] || refuse bad-source suites; case ${4:-} in *[!0-9a-f]*|"") refuse bad-sha ;; esac; [ ${#4} -eq 64 ] || refuse bad-sha; case ${5:-} in "$A"/staging/*.key) ;; *) refuse bad-key-path ;; esac; case $5 in */../*|*[!A-Za-z0-9._/@+-]*) refuse bad-key-path ;; esac ;;',
  'esac',
  '[ "$(id -u)" = 0 ] || refuse not-root',
  '[ -d "$A" ] && [ ! -L "$A" ] || refuse no-apps-dir "$A"',
  // the apps dir must be the INVOKING user's own (sudo names them): a process cannot point root at another tree
  'if [ -n "${SUDO_UID:-}" ]; then h=$(getent passwd "$SUDO_UID" | cut -d: -f6); [ -n "$h" ] && [ "$(cd "$A" && pwd -P)" = "$(cd "$h" 2>/dev/null && pwd -P)/.vibespace/apps" ] || refuse apps-dir-not-the-users; fi',
  'D=$A/debs; R=$A/sys; V=/var/lib/vibespace',
  // a directory root reads authority from: root-owned, never group/other-writable, never a link — created so when absent
  'own() { if [ -L "$1" ]; then refuse not-root-owned "$1"; fi; if [ -d "$1" ]; then [ "$(stat -c %u "$1")" = 0 ] && m=$(stat -c %a "$1") && [ $(( 0$m & 022 )) -eq 0 ] || refuse not-root-owned "$1"; elif [ -e "$1" ]; then refuse not-a-directory "$1"; else install -d -m 0755 -o root -g root "$1"; chmod g-s "$1"; fi; }',
  'for d in "$D" "$D/partial" "$R" "$R/entries" "$R/keys" "$R/sources" "$R/base" "$V"; do own "$d"; done',
  'T=$(mktemp -d); trap \'rm -rf "$T"\' EXIT',
  ': > "$T/from"',
  `LOCK="-o DPkg::Lock::Timeout=${APT_LOCK_WAIT_S}"`,
  'CACHE="-o Dir::Cache::archives=$D/ -o APT::Keep-Downloaded-Packages=true -o APT::Sandbox::User=root"', // P15: apt's _apt user cannot enter a 0700 ~/.vibespace
  "q() { dpkg-query -W -f='${db:Status-Abbrev} ${Package}:${Architecture} ${Version}\\n' 2>/dev/null | awk 'substr($1, 2, 1) == \"i\" { print $2 \" \" $3 }' | sort -u; }", // verify-r1 F5: INSTALLED whatever the want flag (a held package is "hi") — the same set the PURE parseDpkgStatus reads
  // the drift tripwire: every dpkg run touches a marker; VibeSpace's own runs end by stamping slot-ended after it
  `hook() { [ -f ${DRIFT_HOOK} ] || printf '%s\\n' '// VibeSpace: marks a dpkg run so the Desktop apps dialog can name what was installed outside VibeSpace' 'DPkg::Post-Invoke { "if [ -d ${MARKER_DIR} ]; then touch ${DRIFT_MARKER}; fi"; };' > ${DRIFT_HOOK}; }`,
  `finish() { pins; q > "$V/last-dpkg.list.tmp" && mv -f "$V/last-dpkg.list.tmp" "${LAST_LIST}"; touch "${SLOT_ENDED}"; }`,
  // verify-r1 F4: the replay marker says THIS root filesystem has every entry back — only a replay that put every entry
  // back writes it (an install / a partial replay never: the next boot would believe a replay that did not happen)
  `replayed() { [ -e "${REPLAY_MARKER}" ] || date +%s > "${REPLAY_MARKER}"; }`,
  // the image's own dpkg set, once per root filesystem (a replay on a fresh one re-takes it)
  'base() { if [ ! -s "$R/base/status" ]; then cp /var/lib/dpkg/status "$R/base/status.tmp" && mv -f "$R/base/status.tmp" "$R/base/status"; q | sha256sum | cut -d" " -f1 > "$R/base/sha"; fi; say base "$(cat "$R/base/sha")"; }',
  // the image's base is re-taken only on a root filesystem VibeSpace never ran on (no slot-ended): a replay on one where an
  // install already ran would record the image PLUS the apps as "the image"
  `rebase() { if [ ! -e "${SLOT_ENDED}" ]; then rm -f "$R/base/status"; fi; base; }`,
  "field() { sed -n \"s/^$1: //p\" \"$2\" | head -1; }",
  // verify-r1 H2: ONE read of a user-owned file into root's own copy — never through a link, never blocking on a FIFO (an
  // O_NONBLOCK open reads what is there; the hash then refuses it), bounded; no `[ -f ] && cp` gap between test and read
  `grab() { dd if="$1" of="$2" iflag=nofollow,nonblock bs=1M count=${GRAB_MAX_MB} 2>/dev/null && [ -f "$2" ] || refuse "$3"; }`,
  // verify-r1 H1: which approved source a .deb apt fetches comes from — apt's own `--print-uris` lines ('URL' file size
  // hash) → "<source> <package>" when the URL starts with the source's URI (PURE originOf is the same rule)
  'srcs() { for s in "$R"/sources/*.sources; do [ -f "$s" ] && return 0; done; return 1; }',
  // verify r1: the hosts the machine's OWN apt sources use (VibeSpace's vibespace-* aside). `Pin: origin` matches a host,
  // so a source on one of them would pin the machine's own archive down with it (its updates, security ones too): refused
  'mine() { { sed -n "s,^[[:space:]]*deb[-a-z]*[[:space:]].*://\\([^/:[:space:]]*\\).*,\\1,p" /etc/apt/sources.list /etc/apt/sources.list.d/*.list 2>/dev/null || true; for f in /etc/apt/sources.list.d/*.sources; do case ${f##*/} in vibespace-*) continue ;; esac; [ -f "$f" ] && sed -n "s/^URIs:[[:space:]]*//p" "$f" | tr " " "\\n" | sed -n "s,^[a-z+]*://\\([^/:]*\\).*,\\1,p"; done; } | tr A-Z a-z | sort -u; }',
  "from() { awk 'substr($1, 1, 1) == \"\\047\" { u = substr($1, 2, length($1) - 2); f = $2; sub(/_.*/, \"\", f); print u \" \" f }' | while read -r u p; do pkgok \"$p\" || continue; for s in \"$R\"/sources/*.sources; do [ -f \"$s\" ] || continue; b=$(field URIs \"$s\"); b=${b%/}; case $u in \"$b\"/*) i=${s##*/}; echo \"${i%.sources} $p\" ;; esac; done; done; }",
  // verify-r1 H1: THE PIN of every approved source (PURE sourcePin is the same text): everything from its host at PIN_LOW,
  // what the user approved FROM it (every entry's .pin) at PIN_APPROVED — root's copy sys/sources/<id>.pref, apt's in
  // /etc/apt/preferences.d. Every run ends here (finish), a replay starts here (restore): no source is ever unpinned
  'pins() {',
  '  for s in "$R"/sources/*.sources; do',
  '    [ -f "$s" ] || continue; i=${s##*/}; i=${i%.sources}; h=$(field URIs "$s" | sed "s,^https://,,; s,[:/].*,,")',
  "    cat \"$R\"/entries/*.pin 2>/dev/null | awk -v i=\"$i\" '$1 == i { print $2 }' | while read -r p; do if pkgok \"$p\"; then echo \"$p\"; fi; done | sort -u > \"$T/allow\"",
  `    { printf 'Package: *\\nPin: origin "%s"\\nPin-Priority: ${PIN_LOW}\\n' "$h"; if [ -s "$T/allow" ]; then printf '\\nPackage: %s\\nPin: origin "%s"\\nPin-Priority: ${PIN_APPROVED}\\n' "$(tr '\\n' ' ' < "$T/allow" | sed 's/ $//')" "$h"; fi; } > "$T/pref"`,
  '    install -d -m 0755 /etc/apt/preferences.d; install -m 0644 -o root -g root "$T/pref" "$R/sources/$i.pref"; install -m 0644 -o root -g root "$T/pref" "/etc/apt/preferences.d/vibespace-$i.pref"',
  '    say pin "$i" $(cat "$T/allow")',
  '  done',
  '}',
  // the approved sources, their keys and their pins back on a fresh root filesystem (design §3.3: before rung 1)
  'restore() {',
  '  install -d -m 0755 /etc/apt/keyrings',
  '  for s in "$R"/sources/*.sources; do [ -f "$s" ] || continue; i=${s##*/}; i=${i%.sources}; for k in "$R/keys/$i.asc" "$R/keys/$i.gpg"; do [ -f "$k" ] && install -m 0644 -o root -g root "$k" "/etc/apt/keyrings/vibespace-${k##*/}"; done; install -m 0644 -o root -g root "$s" "/etc/apt/sources.list.d/vibespace-$i.sources"; done',
  '  pins',
  '}',
  // the local repository: every .deb named <pkg>_<version without epoch>_<arch>.deb, one stanza each, one version per package, Packages rebuilt
  'index() {',
  '  for f in "$D"/*.deb; do',
  '    [ -f "$f" ] || continue',
  '    p=$(dpkg-deb -f "$f" Package 2>/dev/null) || { rm -f "$f"; continue; }',
  '    v=$(dpkg-deb -f "$f" Version); a=$(dpkg-deb -f "$f" Architecture)',
  '    pkgok "$p" || { rm -f "$f"; continue; }',
  '    case "$v$a" in ""|*[!A-Za-z0-9.+~:-]*) rm -f "$f"; continue ;; esac',
  '    n=${p}_$(printf %s "$v" | sed "s/^[0-9]*://")_$a.deb',
  '    if [ "${f##*/}" != "$n" ]; then mv -f "$f" "$D/$n"; f=$D/$n; fi',
  '    s=${f%.deb}.stanza',
  '    if [ -s "$s" ] && [ ! "$f" -nt "$s" ]; then continue; fi',
  "    { dpkg-deb -f \"$f\" | sed '/^$/d'; printf 'Filename: ./%s\\nSize: %s\\nSHA256: %s\\n' \"$n\" \"$(stat -c %s \"$f\")\" \"$(sha256sum \"$f\" | cut -d' ' -f1)\"; } > \"$s.tmp\" && mv -f \"$s.tmp\" \"$s\"",
  '  done',
  '  for s in "$D"/*.stanza; do [ -f "$s" ] || continue; [ -f "${s%.stanza}.deb" ] || rm -f "$s"; done',
  '  : > "$T/cat"',
  '  for s in "$D"/*.stanza; do [ -f "$s" ] || continue; echo "$(field Package "$s") $(field Version "$s") $s" >> "$T/cat"; done',
  '  sort -o "$T/cat" "$T/cat"; pp=; pv=; ps=',
  '  while read -r p v s; do',
  '    if [ "$p" = "$pp" ]; then',
  '      if dpkg --compare-versions "$v" gt "$pv"; then old=$ps; pv=$v; ps=$s; else old=$s; fi',
  '      rm -f "$old" "${old%.stanza}.deb"; say gc "$p"',
  '    else pp=$p; pv=$v; ps=$s; fi',
  '  done < "$T/cat"',
  '  : > "$D/Packages.tmp"',
  '  for s in "$D"/*.stanza; do [ -f "$s" ] || continue; { cat "$s"; echo; } >> "$D/Packages.tmp"; done',
  '  mv -f "$D/Packages.tmp" "$D/Packages"',
  '}',
  // closure − base − cache: what a fresh machine with the image's base would still miss, fetched into the repo
  'fill() {',
  '  [ $# -gt 0 ] && [ -s "$R/base/status" ] || return 0',
  "  apt-get -s -o Dir::State::status=\"$R/base/status\" install \"$@\" 2>/dev/null | awk '$1 == \"Inst\" { v = $3; if (v ~ /^\\[/) v = $4; sub(/^\\(/, \"\", v); sub(/:.*/, \"\", $2); print $2 \" \" v }' | sort -u > \"$T/need\" || true",
  '  : > "$T/have"; for s in "$D"/*.stanza; do [ -f "$s" ] && echo "$(field Package "$s") $(field Version "$s")" >> "$T/have"; done',
  '  sort -u -o "$T/have" "$T/have"; comm -23 "$T/need" "$T/have" > "$T/miss"; k=0',
  '  while read -r p v; do pkgok "$p" || continue; if (cd "$D" && apt-get -q -o APT::Sandbox::User=root download "$p=$v" > /dev/null 2>&1); then k=$((k+1)); else say missing "$p" "$v"; fi; done < "$T/miss"',
  '  say fill "$k"',
  '}',
  'debs() { for s in "$D"/*.stanza; do [ -f "$s" ] || continue; say deb "$(field Package "$s")" "$(field Version "$s")" "$(field Architecture "$s")" "$(sed -n "s,^Filename: \\./,,p" "$s" | head -1)" "$(field Size "$s")" "$(field SHA256 "$s")"; done; }',
  // what an install changed + the .desktop files of the REQUESTED packages ($T/req) + the services it brought
  'emit() {',
  '  q > "$T/after"',
  '  comm -13 "$T/before" "$T/after" | while read -r p v; do say delta + "$p" "$v"; done',
  '  comm -23 "$T/before" "$T/after" | while read -r p v; do say delta - "$p" "$v"; done',
  '  : > "$T/desktop"',
  '  for p in $(cat "$T/req"); do dpkg -L "$p" 2>/dev/null | grep -E "^/usr(/local)?/share/applications/[A-Za-z0-9@._+-]+\\.desktop$" | while read -r f; do say desktop "$p" "$f"; echo "$f" >> "$T/desktop"; done; done',
  '  comm -13 "$T/before" "$T/after" | while read -r p v; do dpkg -L "$p" 2>/dev/null | grep -E "^(/usr)?/lib/systemd/system/[A-Za-z0-9@._-]+\\.service$" | while read -r f; do say service "${p%%:*}" "${f##*/}"; done; done',
  '}',
  'list() { cp "$T/req" "$R/entries/$ID.list.tmp" && mv -f "$R/entries/$ID.list.tmp" "$R/entries/$ID.list"; cp "$T/desktop" "$R/entries/$ID.desktop.tmp" && mv -f "$R/entries/$ID.desktop.tmp" "$R/entries/$ID.desktop"; sort -u "$T/from" > "$R/entries/$ID.pin.tmp" && mv -f "$R/entries/$ID.pin.tmp" "$R/entries/$ID.pin"; }',
  'all() { cat "$R"/entries/*.list 2>/dev/null | sort -u; }',
  // verify r1: EVERY run pins the approved sources BEFORE any apt runs (finish re-pins with what the run took): a source
  // approved before the pin existed is never fetched from unpinned, not even by the first Refresh after the update
  'pins',
  'case $MODE in',
  'install)',
  "  printf '%s\\n' \"$@\" > \"$T/req\"",
  '  hook; base; q > "$T/before"',
  '  echo "+ apt-get update"; apt-get $LOCK update',
  '  if srcs; then mkdir -p "$T/arch/partial"; apt-get $LOCK -o Dir::Cache::archives="$T/arch/" --print-uris -y install "$@" 2>/dev/null | from > "$T/from" || true; fi',
  '  echo "+ apt-get install -y $*"; apt-get $LOCK $CACHE install -y "$@"',
  '  emit; index; fill "$@"; index; list; debs; finish; say ok ;;',
  'deb)',
  '  S=$1; H=$2',
  '  grab "$S" "$T/in.deb" no-deb',
  '  [ "$(sha256sum "$T/in.deb" | cut -d" " -f1)" = "$H" ] || refuse deb-changed',
  '  p=$(dpkg-deb -f "$T/in.deb" Package) && pkgok "$p" || refuse bad-name "$p"',
  '  v=$(dpkg-deb -f "$T/in.deb" Version); a=$(dpkg-deb -f "$T/in.deb" Architecture)',
  '  case "$v$a" in ""|*[!A-Za-z0-9.+~:-]*) refuse bad-deb ;; esac',
  '  n=${p}_$(printf %s "$v" | sed "s/^[0-9]*://")_$a.deb',
  '  install -m 0644 -o root -g root "$T/in.deb" "$D/$n"',
  '  echo "$p" > "$T/req"',
  '  hook; base; q > "$T/before"',
  '  echo "+ apt-get update"; apt-get $LOCK update',
  '  if srcs; then mkdir -p "$T/arch/partial"; apt-get $LOCK -o Dir::Cache::archives="$T/arch/" --print-uris -y install "$D/$n" 2>/dev/null | from > "$T/from" || true; fi',
  '  echo "+ apt-get install -y ./$n"; apt-get $LOCK $CACHE install -y "$D/$n"',
  '  emit; index; fill "$p"; index; list; debs; finish; say ok ;;',
  'remove)',
  '  [ -f "$R/entries/$ID.list" ] || refuse no-entry "$ID"',
  '  : > "$T/req"; : > "$T/desktop"',
  '  for f in "$R"/entries/*.list; do [ "$f" = "$R/entries/$ID.list" ] || cat "$f"; done | sort -u > "$T/others"',
  '  pk=; for p in $(cat "$R/entries/$ID.list"); do pkgok "$p" || continue; if grep -qxF "$p" "$T/others"; then say kept "$p"; else pk="$pk $p"; fi; done',
  "  if [ -n \"$pk\" ]; then apt-get -s remove --autoremove -y $pk 2>/dev/null | awk '$1 == \"Remv\" { print $2 }' | while read -r p; do if grep -qxF \"$p\" \"$T/others\"; then echo \"$p\"; fi; done > \"$T/hit\"; if [ -s \"$T/hit\" ]; then refuse shared $(cat \"$T/hit\"); fi; fi",
  '  hook; q > "$T/before"',
  '  if [ -n "$pk" ]; then echo "+ apt-get remove --autoremove -y$pk"; apt-get $LOCK remove --autoremove -y $pk; fi',
  '  emit; rm -f "$R/entries/$ID.list" "$R/entries/$ID.desktop" "$R/entries/$ID.pin"',
  '  for s in "$D"/*.stanza; do [ -f "$s" ] || continue; p=$(field Package "$s"); if ! awk -v p="$p:" \'index($1, p) == 1 { f = 1 } END { exit !f }\' "$T/after"; then rm -f "$s" "${s%.stanza}.deb"; fi; done',
  '  index; fill $(all); index; debs; finish; say ok ;;',
  'replay)',
  '  hook; rebase; restore',
  '  [ -s "$D/Packages" ] || refuse no-cache',
  '  mkdir -p "$T/lists/partial" "$T/none"',
  '  echo "deb [trusted=yes] file:$D ./" > "$T/sources.list"',
  '  O="-o Dir::Etc::SourceList=$T/sources.list -o Dir::Etc::SourceParts=$T/none -o Dir::State::Lists=$T/lists -o Dir::Cache::pkgcache= -o Dir::Cache::srcpkgcache= -o APT::Sandbox::User=root -o Acquire::Languages=none"',
  '  echo "+ apt-get update (the local repository only)"; apt-get $LOCK $O update',
  '  bad=0',
  '  for l in "$R"/entries/*.list; do',
  '    [ -f "$l" ] || continue; e=${l##*/}; e=${e%.list}; pk=',
  '    for p in $(cat "$l"); do if pkgok "$p"; then pk="$pk $p"; fi; done',
  '    [ -n "$pk" ] || { say entry "$e" failed bad-list; bad=$((bad+1)); continue; }',
  '    echo "+ apt-get install -y$pk (offline)"',
  '    if apt-get $LOCK $O install -y $pk; then say entry "$e" ok; else say entry "$e" failed offline; bad=$((bad+1)); fi',
  '  done',
  '  finish; if [ $bad -eq 0 ]; then replayed; say ok; else say partial "$bad"; fi ;;',
  'replay-online)',
  '  hook; rebase; restore',
  // the machine's own sources (third-party ones restored above) PLUS the local repository: a .deb the user had exists
  // nowhere else, so an online rung without it could never put that entry back
  '  mkdir -p "$T/parts"; for f in /etc/apt/sources.list.d/*; do [ -f "$f" ] && cp "$f" "$T/parts/"; done',
  '  if [ -s "$D/Packages" ]; then echo "deb [trusted=yes] file:$D ./" > "$T/parts/vibespace-local.list"; fi',
  '  P="-o Dir::Etc::SourceParts=$T/parts -o APT::Sandbox::User=root"',
  '  echo "+ apt-get update (the machine\'s sources + the local repository)"; apt-get $LOCK $P update',
  '  bad=0',
  '  for l in "$R"/entries/*.list; do',
  '    [ -f "$l" ] || continue; e=${l##*/}; e=${e%.list}; pk=',
  '    for p in $(cat "$l"); do if pkgok "$p"; then pk="$pk $p"; fi; done',
  '    [ -n "$pk" ] || { say entry "$e" failed bad-list; bad=$((bad+1)); continue; }',
  '    echo "+ apt-get install -y$pk"',
  '    if apt-get $LOCK $P $CACHE install -y $pk; then say entry "$e" ok; else say entry "$e" failed online; bad=$((bad+1)); fi',
  '  done',
  '  index; fill $(all); index; debs; finish; if [ $bad -eq 0 ]; then replayed; say ok; else say partial "$bad"; fi ;;',
  'refresh)',
  '  hook; base; : > "$T/req"; : > "$T/desktop"',
  '  echo "+ apt-get update"; apt-get $LOCK update',
  '  pk=$( (all; for s in "$D"/*.stanza; do [ -f "$s" ] && field Package "$s"; done) | sort -u | while read -r p; do pkgok "$p" && echo "$p"; done | tr "\\n" " ")',
  '  q > "$T/before"',
  '  if [ -n "$pk" ]; then echo "+ apt-get install --only-upgrade -y $pk"; apt-get $LOCK $CACHE install --only-upgrade -y $pk; fi',
  '  emit; index; fill $(all); index; debs; finish; say ok ;;',
  'adopt)',
  '  for p in "$@"; do dpkg-query -W -f=\'${db:Status-Abbrev}\' "$p" 2>/dev/null | grep -q "^.i" || refuse not-installed "$p"; done',
  "  printf '%s\\n' \"$@\" > \"$T/req\"",
  '  hook; base; q > "$T/before"',
  '  if srcs; then for p in "$@"; do apt-get --print-uris download "$p=$(dpkg-query -W -f=\'${Version}\' "$p")" 2>/dev/null; done | from > "$T/from" || true; fi',
  '  for p in "$@"; do v=$(dpkg-query -W -f=\'${Version}\' "$p"); if (cd "$D" && apt-get -q -o APT::Sandbox::User=root download "$p=$v" > /dev/null 2>&1); then say cached "$p" "$v"; else say missing "$p" "$v"; fi; done',
  '  emit; index; fill "$@"; index; list; debs; finish; say ok ;;',
  'source)',
  '  U=$1; SU=$2; CO=${3:-}; H=$4; K=$5',
  '  h=$(printf "%s" "$U" | sed "s,^https://,,; s,[:/].*,," | tr A-Z a-z); if mine | grep -qxF "$h"; then refuse shared-host "$h"; fi',
  '  grab "$K" "$T/key" no-key; [ "$(sha256sum "$T/key" | cut -d" " -f1)" = "$H" ] || refuse key-changed',
  '  if head -c 64 "$T/key" | grep -q "BEGIN PGP"; then x=asc; else x=gpg; fi',
  '  install -d -m 0755 /etc/apt/keyrings',
  '  rm -f "$R/keys/$ID.asc" "$R/keys/$ID.gpg"; install -m 0644 -o root -g root "$T/key" "$R/keys/$ID.$x"; install -m 0644 -o root -g root "$T/key" "/etc/apt/keyrings/vibespace-$ID.$x"',
  "  { printf 'Types: deb\\nURIs: %s\\nSuites: %s\\n' \"$U\" \"$SU\"; [ -z \"$CO\" ] || printf 'Components: %s\\n' \"$CO\"; printf 'Signed-By: /etc/apt/keyrings/vibespace-%s.%s\\n' \"$ID\" \"$x\"; } > \"$T/src\"",
  // verify r1: root's record, then THE PIN (pins reads root's records), only then the source apt reads — a crash at any
  // point (apt-get update can take minutes) leaves no live source without its pin
  '  install -m 0644 -o root -g root "$T/src" "$R/sources/$ID.sources"; pins; install -m 0644 -o root -g root "$T/src" "/etc/apt/sources.list.d/vibespace-$ID.sources"',
  '  echo "+ apt-get update"',
  '  if ! apt-get $LOCK update; then rm -f "/etc/apt/sources.list.d/vibespace-$ID.sources" "/etc/apt/keyrings/vibespace-$ID.$x" "$R/sources/$ID.sources" "$R/keys/$ID.$x" "/etc/apt/preferences.d/vibespace-$ID.pref" "$R/sources/$ID.pref"; refuse source-update-failed; fi',
  '  hook; finish; say ok ;;',
  'forget)', // design 019 M2: the host record goes (its app now lives in the app system) — NO apt: the ephemeral root keeps the packages until the next rebuild
  '  [ -f "$R/entries/$ID.list" ] || refuse no-entry "$ID"',
  '  rm -f "$R/entries/$ID.list" "$R/entries/$ID.desktop" "$R/entries/$ID.pin"; say forgot "$ID"',
  // the saved .debs no remaining entry needs (its closure against the image's base, or its own names) leave the cache; a
  // closure apt cannot simulate keeps every one (a replay must never lose a package it needs)
  '  : > "$T/need"; k=1',
  '  if [ -n "$(all)" ]; then if [ -s "$R/base/status" ] && apt-get -s -o Dir::State::status="$R/base/status" install $(all) > "$T/sim" 2>/dev/null; then awk \'$1 == "Inst" { sub(/:.*/, "", $2); print $2 }\' "$T/sim" > "$T/need"; all >> "$T/need"; else k=0; fi; fi',
  '  if [ $k = 1 ]; then for s in "$D"/*.stanza; do [ -f "$s" ] || continue; p=$(field Package "$s"); if ! grep -qxF "$p" "$T/need"; then rm -f "$s" "${s%.stanza}.deb"; say gc "$p"; fi; done; else say kept-cache; fi',
  '  index; debs; finish; say ok ;;',
'source-remove)',
  '  rm -f "/etc/apt/sources.list.d/vibespace-$ID.sources" "/etc/apt/keyrings/vibespace-$ID.asc" "/etc/apt/keyrings/vibespace-$ID.gpg" "$R/sources/$ID.sources" "$R/keys/$ID.asc" "$R/keys/$ID.gpg" "/etc/apt/preferences.d/vibespace-$ID.pref" "$R/sources/$ID.pref"',
  '  echo "+ apt-get update"; apt-get $LOCK update || true',
  '  finish; say ok ;;',
  'esac',
].join('\n');

/** The argv the package slot runs for one APP_SCRIPT mode — packages / paths as POSITIONS. `root` = the machine half
 *  already runs as root (no sudo). Throws by name on a value the script would refuse anyway (fail before root). */
function appArgv({ mode, appsDir, id, nonce, args = [], root = false }) {
  if (!SCRIPT_MODES.includes(mode)) throw new Error(`unknown app script mode ${JSON.stringify(mode)}`);
  if (typeof appsDir !== 'string' || !appsDir.startsWith('/') || /[^A-Za-z0-9._/@+-]/.test(appsDir)) throw new Error('the apps directory must be an absolute path of plain characters');
  if (!ENTRY_ID_RE.test(String(id))) throw new Error(`bad entry id ${JSON.stringify(id)}`);
  if (!NONCE_RE.test(String(nonce))) throw new Error('bad nonce');
  const a = (Array.isArray(args) ? args : []).map(String);
  if (mode === 'install' || mode === 'adopt') { if (!a.length || !a.every((p) => PKG_RE.test(p))) throw new Error('packages must be Debian package names'); }
  if (mode === 'forget' && a.length) throw new Error('forget takes the entry id only');
  const body = ['sh', '-c', APP_SCRIPT, 'vs-app', appsDir, mode, String(id), String(nonce), '--', ...a];
  return root ? body : ['sudo', '-n', ...body];
}
/**
 * The commands a person READS above Install (and copies when the machine has no passwordless sudo) — the same steps
 * the script runs, as a person would type them, with the apps directory shown as `~/.vibespace/apps`. Lines starting
 * `#` say what VibeSpace does around them. Part of the plan's digest: the run is the plan that was shown, or nothing.
 */
function appCommands({ mode, packages = [], deb = null, source = null, entryLabel = null } = {}) {
  const lock = `-o DPkg::Lock::Timeout=${APT_LOCK_WAIT_S}`;
  const cache = '-o Dir::Cache::archives=~/.vibespace/apps/debs/ -o APT::Keep-Downloaded-Packages=true';
  const keep = '# VibeSpace keeps every .deb it needs in ~/.vibespace/apps/debs (root-owned) so the app comes back after the machine is rebuilt';
  const kindOfMode = K.ROWS.find((r) => r.mode === mode && r.commands); // a root kind's own install steps (its file)
  if (kindOfMode) return kindOfMode.commands({ packages, deb, lock, cache, keep });
  if (mode === 'remove') return [`sudo apt-get ${lock} remove --autoremove -y ${packages.join(' ')}`, `# VibeSpace drops ${entryLabel || 'the app'} from ~/.vibespace/apps and its .deb files from the cache`];
  if (mode === 'refresh') return [`sudo apt-get ${lock} update`, `sudo apt-get ${lock} ${cache} install --only-upgrade -y ${packages.join(' ') || '<your apps>'}`, '# VibeSpace keeps one version of each package in the cache'];
  if (mode === 'adopt') return [`# VibeSpace saves the installed ${packages.join(' ')} .deb files into ~/.vibespace/apps/debs so they come back after a rebuild`, `sudo apt-get download ${packages.join(' ')}`];
  if (mode === 'source' && source) {
    return [`# key ${source.key} — sha256 ${source.keySha256 || '?'}${source.fingerprints && source.fingerprints.length ? `, fingerprint ${source.fingerprints.join(' ')}` : ''}`,
      `sudo install -m 0644 <the key> /etc/apt/keyrings/vibespace-${source.id}.asc`,
      `sudo tee /etc/apt/sources.list.d/vibespace-${source.id}.sources  # Types: deb · URIs: ${source.uris.join(' ')} · Suites: ${source.suites.join(' ')}${source.components.length ? ` · Components: ${source.components.join(' ')}` : ''} · Signed-By: /etc/apt/keyrings/vibespace-${source.id}.asc`,
      `sudo tee /etc/apt/preferences.d/vibespace-${source.id}.pref  # Package: * · Pin: origin "${pinHost(source.uris[0]) || '?'}" · Pin-Priority: ${PIN_LOW} — VibeSpace takes a package from this source only when nothing installed has that name; the packages you install from it later get its updates (${PIN_APPROVED})`,
      `sudo apt-get ${lock} update`];
  }
  if (mode === 'forget') return [`# VibeSpace stops putting ${entryLabel || 'the app'} back after a rebuild: its record leaves ~/.vibespace/apps/sys (root-owned) — no apt runs, nothing is uninstalled now`, '# the saved .deb files no other app needs leave ~/.vibespace/apps/debs'];
  if (mode === 'source-remove' && source) return [`sudo rm /etc/apt/sources.list.d/vibespace-${source.id}.sources /etc/apt/keyrings/vibespace-${source.id}.asc /etc/apt/preferences.d/vibespace-${source.id}.pref`, `sudo apt-get ${lock} update`];
  return [];
}
/**
 * The script's `= …` lines for ONE run (the block after `= run <id> <nonce> <mode>`) → its facts. `found` false when
 * the log names no such run (another install held the slot). A forged line can only describe — what root reinstalls
 * and which rows exist are read from the root-owned ~/.vibespace/apps/sys, never from here.
 */
function parseRunLog(text, { id, nonce } = {}) {
  const lines = String(text || '').split('\n');
  let start = -1, mode = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^= run (\S+) (\S+) (\S+)$/.exec(lines[i]);
    if (m && m[1] === id && m[2] === nonce) { start = i; mode = m[3]; }
  }
  const out = { found: start >= 0, mode, ok: false, partial: null, refused: null, delta: { added: [], removed: [] }, desktops: [], services: [], debs: [], entries: {}, base: null, missing: [], kept: [], gc: [], pins: {} };
  if (start < 0) return out;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^= run /.test(l)) break;
    let m;
    if ((m = /^= delta ([+-]) ([^\s:]+):(\S+) (\S+)$/.exec(l))) (m[1] === '+' ? out.delta.added : out.delta.removed).push({ package: m[2], arch: m[3], version: m[4] });
    else if ((m = /^= desktop (\S+) (\/\S+)$/.exec(l))) out.desktops.push({ package: m[1], path: m[2] });
    else if ((m = /^= service (\S+) (\S+)$/.exec(l))) out.services.push({ package: m[1], unit: m[2] });
    else if ((m = /^= deb (\S+) (\S+) (\S+) (\S+) (\d+) ([0-9a-f]{64})$/.exec(l))) out.debs.push({ package: m[1], version: m[2], arch: m[3], file: m[4], size: Number(m[5]), sha256: m[6] });
    else if ((m = /^= entry (\S+) (ok|failed)(?: (\S+))?$/.exec(l))) out.entries[m[1]] = m[2] === 'ok' ? { ok: true } : { ok: false, code: m[3] || 'failed' };
    else if ((m = /^= base ([0-9a-f]{64})$/.exec(l))) out.base = m[1];
    else if ((m = /^= missing (\S+) (\S+)$/.exec(l))) out.missing.push({ package: m[1], version: m[2] });
    else if ((m = /^= kept (\S+)$/.exec(l))) out.kept.push(m[1]);
    else if ((m = /^= gc (\S+)$/.exec(l))) out.gc.push(m[1]);
    else if ((m = /^= pin ([a-z0-9][a-z0-9-]{0,39})((?: \S+)*)$/.exec(l))) out.pins[m[1]] = m[2].split(' ').filter((p) => PKG_RE.test(p));
    else if ((m = /^= refused (\S+)(?: (.*))?$/.exec(l))) out.refused = { code: m[1], detail: (m[2] || '').slice(0, 300) };
    else if ((m = /^= partial (\d+)$/.exec(l))) out.partial = Number(m[1]);
    else if (l === '= ok') out.ok = true;
  }
  return out;
}

// ── an installer the agent names by ADDRESS or FILE (design 009 §2 A) ───────────────────────────────────────────────
/** The most bytes VibeSpace downloads for one installer, and how many redirects it follows (each one re-judged). */
const FETCH_MAX = 2 * 1024 * 1024 * 1024;
const FETCH_REDIRECTS = 5;
/** Names that are never a public site: loopback, mDNS, the private-use suffixes people and clouds use, RFC 2606/6761. */
const PRIVATE_NAMES = Object.freeze(['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'private', 'home.arpa', 'arpa', 'test', 'example', 'invalid', 'onion', 'alt']);
/**
 * THE ADDRESS VERDICT (PURE) — before any byte moves, and again for every redirect: `{ok, url, host}` |
 * `{ok:false, code:'bad_address', error}`. https only; no user:password@; the host a public NAME (no IP literal in any
 * spelling — the URL parser already turned `0x7f.1` / `2130706433` into dotted quads — no single-label name, nothing
 * under PRIVATE_NAMES). `testHosts`: the reserved `.test` names a suite's resolve seam serves (never a real site).
 */
function fetchVerdict(url, { testHosts = [] } = {}) {
  const bad = (error) => ({ ok: false, code: 'bad_address', error });
  const raw = String(url == null ? '' : url);
  if (raw.length > 2048 || /[\s\0]/.test(raw)) return bad('not a download address');
  let u;
  try { u = new URL(raw); } catch { return bad(`${JSON.stringify(raw.slice(0, 80))} is not an address`); }
  if (u.protocol !== 'https:') return bad(`${u.protocol.replace(/:$/, '')}:// is refused — VibeSpace downloads over https only`);
  if (u.username || u.password) return bad('an address with a user name or password is refused');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(host)) return bad(`${host} is an IP address — name the vendor's site`);
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) return bad(`${host.slice(0, 80)} is not a public site name`);
  const test = (Array.isArray(testHosts) ? testHosts : []).map((h) => String(h).toLowerCase()).includes(host) && /\.test$/.test(host);
  if (!test && PRIVATE_NAMES.some((n) => host === n || host.endsWith(`.${n}`))) return bad(`${host} is a private name, not a public site`);
  return { ok: true, url: u.href, host, port: u.port ? Number(u.port) : 443 };
}
// lane webhook-l1-server: THE RESOLVED ADDRESS VERDICT (`addressVerdict`) moved to src/egress-fence.js — the one fence every
// owner-configured address is judged by (src/app-serve.js reads it from there).
/**
 * THE KIND, BY THE BYTES (PURE) — never by the name. `head` = the file's first ≥ 64 bytes → `{kind:'deb'|'appimage'}` |
 * `{kind:null, why}`. A Debian archive is an ar archive whose first member is `debian-binary`; an AppImage (type 2) is
 * an ELF with `AI\x02` at offset 8 (the spec's magic). A type-1 AppImage (an ISO image) is named and refused.
 */
function sniffInstaller(head) {
  const b = head && typeof head.length === 'number' ? head : [];
  const at = (i, str) => { for (let k = 0; k < str.length; k++) if (b[i + k] !== str.charCodeAt(k)) return false; return true; };
  if (b.length >= 21 && at(0, '!<arch>\n') && at(8, 'debian-binary')) return { kind: 'deb' };
  if (b.length >= 11 && b[0] === 0x7f && at(1, 'ELF')) {
    if (b[8] === 0x41 && b[9] === 0x49 && b[10] === 0x02) return { kind: 'appimage' };
    if (b[8] === 0x41 && b[9] === 0x49 && b[10] === 0x01) return { kind: null, why: 'an old-style (type 1) AppImage — VibeSpace opens type 2 only' };
    return { kind: null, why: 'a program, not an installer' };
  }
  if (b.length >= 5 && /^\s*<(?:!doctype|html|\?xml|head|body)/i.test(String.fromCharCode(...Array.from(b).slice(0, 64)))) return { kind: null, why: 'a web page, not an installer (the address answers a page — find the file\'s own address)' };
  return { kind: null, why: 'neither a Debian package nor an AppImage' };
}
/** An AppImage's file system starts where its ELF ends: e_shoff + e_shentsize × e_shnum (the spec's own rule) → the
 *  offset, or null. `head` = the first 64 bytes. */
function appImageOffset(head) {
  const b = head;
  if (!b || b.length < 64 || b[0] !== 0x7f) return null;
  const le = b[5] === 1, is64 = b[4] === 2;
  const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) + b[o] * 0x1000000);
  const shoff = is64 ? (le ? u32(0x28) + u32(0x2c) * 0x100000000 : u32(0x2c) + u32(0x28) * 0x100000000) : u32(0x20);
  const n = is64 ? u16(0x3a) * u16(0x3c) : u16(0x2e) * u16(0x30);
  const off = shoff + n;
  return Number.isSafeInteger(off) && off > 0 ? off : null;
}
/** `dpkg-deb -c` (tar's verbose listing) → `[{type, size, path, link}]`; `path` without the leading `.`. */
function debMembers(listing) {
  const out = [];
  for (const l of String(listing || '').split('\n')) {
    const m = /^([-dlhcbps])[rwxsStT-]{9}\s+\S+\s+(\d+)\s+\d{4}-\d\d-\d\d \d\d:\d\d(?::\d\d)?\s+\.(\/.*?)(?: -> (.*)| link to (.*))?$/.exec(l);
    if (m) out.push({ type: m[1] === '-' ? 'file' : m[1] === 'd' ? 'dir' : m[1] === 'l' ? 'symlink' : m[1] === 'h' ? 'hardlink' : 'other', size: Number(m[2]), path: m[3], link: m[4] || m[5] || null });
    if (out.length >= 200000) break;
  }
  return out;
}
const memberOk = (m, max) => m && m.type === 'file' && m.size <= max && !/(^|\/)\.\.(\/|$)/.test(m.path) && /^\/[A-Za-z0-9@._+\/-]+$/.test(m.path);
/** The .desktop files a .deb would install where a launcher looks (regular files only — a symlink, a `..`, a huge file
 *  is never read), the one named after the package first. */
function debDesktopOf(members, { pkg = null, max = 256 * 1024 } = {}) {
  const ok = (members || []).filter((m) => memberOk(m, max) && /^\/usr(?:\/local)?\/share\/applications\/[A-Za-z0-9@._+-]+\.desktop$/.test(m.path));
  const score = (m) => { const b = m.path.split('/').pop().replace(/\.desktop$/, ''); return pkg && b === pkg ? 2 : pkg && b.includes(pkg) ? 1 : 0; };
  return ok.sort((a, b) => score(b) - score(a) || (a.path < b.path ? -1 : 1)).map((m) => m.path);
}
/** The icon a .deb carries for `icon` (a name or an absolute path): a PNG / SVG ≤ 1 MiB, the largest hicolor size first. */
function debIconOf(members, icon, { max = 1024 * 1024 } = {}) {
  const s = String(icon || '');
  if (!s) return null;
  const files = new Map((members || []).filter((m) => memberOk(m, max) && /\.(?:png|svg)$/.test(m.path)).map((m) => [m.path, m]));
  if (s.startsWith('/')) return files.has(s) ? s : null;
  if (!/^[A-Za-z0-9@._+-]{1,120}$/.test(s)) return null;
  for (const c of iconCandidates(s)) if (files.has(c)) return c;
  for (const p of files.keys()) if (/^\/(?:usr\/share|opt)\//.test(p) && p.endsWith(`/${s}.png`)) return p;
  return null;
}
/** design 009 S2 — an AppImage's catalog row: its own .desktop (parsed like any other), run as `<dir>/AppRun` of the
 *  tree VibeSpace unpacked, its icon the copy in its directory. → `{ok, row}` | the parse's refusal. */
function appImageRow({ entry, desktopText, dir, icon = null, validate = null }) {
  const r = parseDesktopFile(desktopText, { entry, primary: true, validate: null });
  if (!r.ok) return r;
  const apprun = `${dir}/root/AppRun`;
  const row = { ...r.row, exec: r.row.exec === 'xterm' ? 'xterm' : apprun, args: r.row.exec === 'xterm' ? ['-e', apprun, ...r.row.args.slice(2)] : r.row.args };
  if (icon) row.icon = icon; else delete row.icon;
  if (typeof validate === 'function') { const v = validate(row); if (!v || !v.ok) return { ok: false, error: `the AppImage's desktop file: ${(v && v.error) || 'refused'}` }; }
  return { ok: true, row };
}
/** design 009 S3 — the removal of an entry that lives in the user's home (no root): what runs and what a person reads. */
function removePlanFor(entry, { appsDir = '~/.vibespace/apps' } = {}) {
  if (!isObj(entry) || !HOME_KINDS.includes(entry.kind) || !ENTRY_ID_RE.test(String(entry.id || ''))) return { ok: false, code: 'not_found', error: 'not an app in your home' };
  const name = String(entry.label || '');
  const common = { ok: true, code: null, canRun: true, kind: 'remove', mode: 'home-remove', entryKind: entry.kind, entryId: entry.id, packages: [], closure: [], removes: [], downloadBytes: 0, installedBytes: 0, label: name || entry.id };
  const kr = K.kindRow(entry.kind);
  if (!kr.removeArgv) return { ...common, dir: `${appsDir}/appimage/${entry.id}`, closureKey: `home-remove appimage ${entry.id}`, commands: [`rm -r ~/.vibespace/apps/appimage/${entry.id}`, '# VibeSpace drops its row from Apps'] };
  if (!/^[@a-z0-9][a-z0-9@/._+-]{0,120}$/i.test(name)) return { ok: false, code: 'bad_name', error: `${entry.id} names no tool` };
  const argv = [...kr.removeArgv, name];
  return { ...common, homeArgv: argv, closureKey: `home-remove ${entry.kind} ${name}`, commands: [argv.join(' ')] }; // `homeArgv`, never `argv`: the root slot finds nothing to run in it
}

module.exports = {
  MANIFEST_V, APPS_REL, PKG_RE, ENTRY_ID_RE, NONCE_RE, SHA256_RE, FPR_RE, ENTRY_KINDS, BY_KINDS, PLAN_CODES, DISK_FLOOR_BYTES, APT_LOCK_WAIT_S,
  MARKER_DIR, REPLAY_MARKER, DRIFT_MARKER, SLOT_ENDED, LAST_LIST, DRIFT_HOOK, APP_ID_PREFIX, SCRIPT_MODES, DRIFT_SLACK_MS,
  PIN_LOW, PIN_APPROVED, GRAB_MAX_MB, pinHost, sourcePin, originOf, withPins,
  emptyManifest, validateManifest, withEntry, withoutEntry, withSource, withoutSource, entryIdFor, validateSourceSpec, sourceDeb822,
  reconcileIndex, dedupeRows, // design 019 M1 / M3
  parseSize, parseSim, parseUris, parsePlan, diskVerdict, replayEstimate, parseSearch, searchWords, updatesOf, fmtBytes,
  unescapeValue, execWords, stripFieldCodes, categoryOf, rowIdFor, parseDesktopFile, desktopPathOk, iconCandidates,
  parseDpkgStatus, dpkgLines, dpkgListText, parseDpkgList, dpkgDelta,
  debFileName, packagesStanza, packagesIndex, parseStanza, cacheVerdict,
  replayRungs, driftVerdict,
  APP_SCRIPT, appArgv, appCommands, parseRunLog,
  HOME_KINDS, FETCH_MAX, FETCH_REDIRECTS, PRIVATE_NAMES, fetchVerdict, sniffInstaller, appImageOffset, debMembers, debDesktopOf, debIconOf, appImageRow, removePlanFor, desktopNames, normLabels,
};
