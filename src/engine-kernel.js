'use strict';
/**
 * A BROWSER ENGINE'S KERNEL ON THIS MACHINE — THE PURE HALF (lane engine-distribution, P4 of the custom browser kernel;
 * docs/design-custom-browser-plugin.zh.md §5 as built). Imports nothing (test-architecture's PURE set). The kernel binary is
 * NOT in the plugin's package (1.2 GB): VibeSpace downloads it, the plugin only answers paths and arguments. The ORCH half
 * (src/server/engine-distribution.js) fetches, hashes, unpacks and writes; this file JUDGES:
 *
 *   THE MANIFEST (`kernelManifestVerdict`): the package's `kernel.json` (schemaVersion 1; `layout {archiveFormat 'tar.zst',
 *   stripComponents, binaryRelPath 'chrome', requiredFiles[]}`; `platforms['<os>-<arch>'] {url, sha256, bytes, version,
 *   binaryRelPath, layout}`) → ONE artifact for this machine, or a refusal by name. The fleet's `browserEngine.kernel {url,
 *   sha256}` (the cluster's own artifact host) is MERGED over the package's, field by field (round 2: a fleet URL that is not
 *   https is refused by name — engine_url_not_https — never swapped for the package's; the sha256 always authenticates).
 *   THE PLAN (`kernelPlan`): every path inside the kernel's own folder — `<root>/<tag>.part`, `<root>/.unpack-<tag>/`,
 *   `<root>/<tag>/` (= dirname of the registry's kernelPath), `<root>/.removing-<tag>/`, the receipt beside `chrome`; for an
 *   install, the Node it unpacks on (round 2: a zlib without zstd ⇒ engine_node_unsupported BEFORE any byte is fetched).
 *   THE ARCHIVE (`tarParser` + `tarEntryVerdict` + `tarShapeVerdict`): a tar stream read header by header (ustar, GNU long
 *   names, pax paths); every entry judged BEFORE anything is extracted — no absolute name, no `..`, no link, no special file,
 *   one top folder per `stripComponents`, no duplicate, every `requiredFiles` a regular file, the program a regular file.
 *   THE RECEIPT (`receiptOf` / `receiptVerdict`): `install-receipt.json {sha256, bytes, verifiedAt, version}` — `sha256` = the
 *   ARCHIVE's (the one kernel.json declares, verified once at install), `bytes` = the size of `chrome` (what a probe can stat
 *   without rehashing 1.2 GB — the kernel side's `/probe` answers `integrity` after `stat.size === bytes`).
 *   THE VERSION (`versionOf` / `versionFact`): `<kernel> --version` run ONCE by VibeSpace after the install (the plugin has
 *   no childProcess) — «measured x» beats «declared x (not measured)»; a probe's own version is the plugin's word.
 */
const SCHEMA = 1;
const RECEIPT_FILE = 'install-receipt.json';
const KERNEL_FILE = 'kernel.json';
const ARCHIVE_FORMATS = Object.freeze(['tar.zst']);
/** The program's name inside the kernel's folder — the registry's kernelPath ends in it (src/server/browser-engines.js). */
const BINARY = 'chrome';
const BYTES_MAX = 8 * 1024 * 1024 * 1024;   // an archive or one file past 8 GB is not a browser kernel
const ENTRIES_MAX = 20000;
const REQUIRED_MAX = 64;
const STRIP_MAX = 4;
/** The oldest Node whose zlib unpacks zstd (createZstdDecompress: v23.8.0, backported to v22.15.0) — a kernel install's floor. */
const NODE_FLOOR = '22.15';
const META_MAX = 64 * 1024;                  // a GNU long name / a pax header's body
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const URL_RE = /^https:\/\/([A-Za-z0-9](?:[A-Za-z0-9.-]{0,252}[A-Za-z0-9])?)(?::(\d{1,5}))?(\/[^\s#?]*)?(\?[^\s#]*)?$/;
const SEG_RE = /^[A-Za-z0-9._+@-]{1,255}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const clip = (s, n = 160) => String(s == null ? '' : s).replace(/[\0-\x1f\x7f]/g, ' ').slice(0, n);
const who = (id, label) => { const n = clip(label, 80) || clip(id, 80) || 'browser'; return /\bengine$/i.test(n) ? `the ${n}` : `the ${n} engine`; };

/** A relative path inside a folder: segments of safe characters, no `.` / `..`, no leading `/`. */
function safeRel(p) {
  const s = String(p == null ? '' : p);
  if (!s || s.length > 400 || s.startsWith('/') || s.endsWith('/')) return false;
  return s.split('/').every((seg) => seg !== '.' && seg !== '..' && SEG_RE.test(seg));
}
/** An https URL with a host, no user/password, no fragment → `{url, host}` | null. */
function httpsUrlOf(u) {
  const s = String(u == null ? '' : u).trim();
  const m = URL_RE.exec(s);
  if (!m || s.length > 2000) return null;
  return { url: s, host: m[1].toLowerCase() + (m[2] ? ':' + m[2] : '') };
}

/**
 * THE MANIFEST VERDICT — the package's kernel.json for THIS machine's `tag` (`linux-x64`) → `{ok:true, version, url, host,
 * sha256, bytes, source: 'package'|'fleet', layout:{archiveFormat, stripComponents, binaryRelPath, requiredFiles}}` | a
 * refusal `{ok:false, code, error}`: no artifact for the machine ⇒ build_platform_unsupported; anything of another shape ⇒
 * browser_engine_protocol (the plugin's file speaks another contract). `fleet` = the fleet's `{url, sha256}`, merged field by
 * field (an http url ⇒ engine_url_not_https, a sha256 that is not 64 hex digits ⇒ engine_sha_malformed).
 */
function kernelManifestVerdict(doc, { tag = 'linux-x64', fleet = null, id = '', label = '' } = {}) {
  const w = who(id, label);
  const bad = (why) => ({ ok: false, code: 'browser_engine_protocol', error: `${w}'s ${KERNEL_FILE} ${why} — VibeSpace cannot download its kernel` });
  if (!isObj(doc)) return bad('is missing or not a JSON object');
  if (doc.schemaVersion !== SCHEMA) return bad(`has schemaVersion ${clip(doc.schemaVersion, 12)}, this VibeSpace reads ${SCHEMA}`);
  const plats = isObj(doc.platforms) ? doc.platforms : {};
  const p = plats[tag];
  if (!isObj(p)) {
    const offered = Object.keys(plats).filter((k) => /^[a-z0-9]+-[a-z0-9]+$/.test(k)).slice(0, 8);
    return { ok: false, code: 'build_platform_unsupported', machine: tag, error: `${w} offers no kernel for ${tag} computers${offered.length ? ` (it has ${offered.join(', ')})` : ''} — nothing was downloaded` };
  }
  const top = isObj(doc.layout) ? doc.layout : {}, own = isObj(p.layout) ? p.layout : {};
  const layout = { ...top, ...own };
  if (!ARCHIVE_FORMATS.includes(layout.archiveFormat)) return bad(`names the archive format ${clip(layout.archiveFormat, 20) || '(none)'}, VibeSpace unpacks ${ARCHIVE_FORMATS.join(', ')}`);
  const strip = layout.stripComponents === undefined ? 0 : layout.stripComponents;
  if (!Number.isInteger(strip) || strip < 0 || strip > STRIP_MAX) return bad(`names stripComponents ${clip(strip, 12)} (0–${STRIP_MAX})`);
  const binary = p.binaryRelPath !== undefined ? p.binaryRelPath : layout.binaryRelPath;
  if (binary !== BINARY) return bad(`names the program ${clip(binary, 60) || '(none)'} — VibeSpace places the kernel's program at <${tag}>/${BINARY} (its kernelPath)`);
  const req = layout.requiredFiles === undefined ? [] : layout.requiredFiles;
  if (!Array.isArray(req) || req.length > REQUIRED_MAX || !req.every(safeRel)) return bad(`names requiredFiles of another shape (at most ${REQUIRED_MAX} relative paths inside the kernel's folder)`);
  const requiredFiles = [...new Set([BINARY, ...req])];
  const version = p.version !== undefined ? p.version : doc.version;
  if (typeof version !== 'string' || !VERSION_RE.test(version)) return bad(`names no version for ${tag}`);
  // the fleet's kernel MERGED over the package's, field by field (双形态载荷要合并不要fallback): a URL the fleet names is THE
  // address — not https ⇒ refused by name, never the package's in its place; a sha256 it names is THE pin (it authenticates
  // whatever arrives, from either address) — not 64 hex digits ⇒ refused by name (round 3), never the package's in its place;
  // a field it leaves empty is the package's. A field it names is named whatever its type (a number is a malformed value).
  const given = (v) => (v == null || v === '' ? '' : String(v).trim());
  let flUrl = isObj(fleet) ? given(fleet.url) : '';
  const flSha = isObj(fleet) ? given(fleet.sha256).toLowerCase() : '';
  if (flUrl && !httpsUrlOf(flUrl)) return { ok: false, code: 'engine_url_not_https', error: `the cluster names ${w}'s kernel at ${clip(flUrl, 120)}, which is not an https address (no user, no password, no fragment) — nothing was downloaded; VibeSpace never takes the package's address in its place` };
  if (flSha && !SHA_RE.test(flSha)) return { ok: false, code: 'engine_sha_malformed', error: `the cluster pins ${w}'s kernel to the sha256 "${clip(flSha, 80)}", which is not 64 hex digits — nothing was downloaded; VibeSpace never takes the package's sha256 in its place` };
  const fl = !!(flUrl || flSha);
  const u = httpsUrlOf(flUrl || p.url);
  if (!u) return bad(`names no https download for ${tag} (no user, no password, no fragment)`);
  const sha = (flSha || String(p.sha256 || '')).toLowerCase();
  if (!SHA_RE.test(sha)) return bad(`names no sha256 for ${tag}`);
  const declaredBytes = Number.isInteger(p.bytes) && p.bytes > 0 && p.bytes <= BYTES_MAX ? p.bytes : null;
  if (!flSha && declaredBytes == null) return bad(`names no length (bytes) for ${tag}`);
  // the fleet's own archive: its length is the package's only when it is the SAME archive (the same sha256)
  const bytes = flSha && String(p.sha256 || '').toLowerCase() !== sha ? null : declaredBytes;
  return { ok: true, tag, version, url: u.url, host: u.host, sha256: sha, bytes, source: fl ? 'fleet' : 'package', layout: { archiveFormat: layout.archiveFormat, stripComponents: strip, binaryRelPath: BINARY, requiredFiles } };
}

/** THE PLAN — the paths of one kernel install, all inside the kernel's root folder (`<data>/plugins-state/<id>/kernel/`):
 *  `kernelPath` = the registry's `<root>/<tag>/chrome`. → `{ok, root, tag, targetDir, exe, part, unpackDir, removingDir,
 *  receipt}` | a refusal (a path of another shape is never planned). `unpack` = the Node an INSTALL unpacks on, `{zstd, node}`
 *  (the ORCH hands in `typeof zlib.createZstdDecompress === 'function'` + process.versions.node): no zstd ⇒
 *  engine_node_unsupported, naming the floor and the running Node — before any byte is fetched. */
function kernelPlan({ kernelPath = '', unpack = null } = {}) {
  const k = String(kernelPath || '');
  const segs = k.split('/');
  if (!k.startsWith('/') || segs.length < 4 || segs[segs.length - 1] !== BINARY || segs.slice(1).some((s) => !s || s === '.' || s === '..')) return { ok: false, code: 'browser_engine_missing', error: 'no kernel place on this computer for that engine' };
  const targetDir = segs.slice(0, -1).join('/');
  const root = segs.slice(0, -2).join('/');
  const tag = segs[segs.length - 2];
  if (unpack && unpack.zstd !== true) {
    const node = clip(unpack.node, 40) || null;
    return { ok: false, code: 'engine_node_unsupported', node, need: NODE_FLOOR, error: `this VibeSpace runs on Node ${node || '(unknown)'}, whose zlib has no zstd — a browser engine's kernel (a tar.zst archive) needs Node ${NODE_FLOOR} or later to unpack; nothing was downloaded` };
  }
  return { ok: true, root, tag, targetDir, exe: k, part: `${root}/${tag}.part`, unpackDir: `${root}/.unpack-${tag}`, removingDir: `${root}/.removing-${tag}`, receipt: `${targetDir}/${RECEIPT_FILE}` };
}

// ── THE TAR READER ──────────────────────────────────────────────────────────────────────────────────────────────────
const TYPES = Object.freeze({ '0': 'file', '\0': 'file', '7': 'file', '5': 'dir', '1': 'link', '2': 'link', '3': 'special', '4': 'special', '6': 'special', 'L': 'meta', 'K': 'meta', 'x': 'meta', 'g': 'meta' });
const textOf = (b, o, n) => { let s = ''; for (let i = o; i < o + n && b[i] !== 0; i++) s += String.fromCharCode(b[i]); return s; };
const octOf = (b, o, n) => { const s = textOf(b, o, n).trim(); return /^[0-7]{0,12}$/.test(s) ? (s ? parseInt(s, 8) : 0) : NaN; };
/** One 512-byte header → `{end:true}` (a zero block) | `{bad}` | `{name, mode, size, type, kind, linkname}`. */
function tarHeader(b) {
  if (!b || b.length < 512) return { bad: 'a short header' };
  let zero = true;
  for (let i = 0; i < 512; i++) if (b[i] !== 0) { zero = false; break; }
  if (zero) return { end: true };
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : b[i];
  if (octOf(b, 148, 8) !== sum) return { bad: 'a header whose checksum is wrong' };
  if (b[124] & 0x80) return { bad: 'a file larger than 8 GB' };
  const size = octOf(b, 124, 12), mode = octOf(b, 100, 8);
  if (!Number.isFinite(size) || !Number.isFinite(mode)) return { bad: 'a header with an unreadable size or mode' };
  const type = String.fromCharCode(b[156]);
  const ustar = textOf(b, 257, 5) === 'ustar';
  const prefix = ustar ? textOf(b, 345, 155) : '';
  const name = textOf(b, 0, 100);
  return { name: prefix ? `${prefix}/${name}` : name, mode, size, type, kind: TYPES[type] || 'other', linkname: textOf(b, 157, 100) };
}
/** A pax header's body → its `path` (and `size`) records. */
function paxOf(bytes) {
  const out = {};
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  let i = 0;
  while (i < s.length) {
    const sp = s.indexOf(' ', i);
    const len = sp > i ? Number(s.slice(i, sp)) : NaN;
    if (!(len > 0) || i + len > s.length) break;
    const rec = s.slice(sp + 1, i + len - 1), eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}
/**
 * A STREAMING tar reader: `write(chunk)` → events `[{type:'entry', entry}, {type:'data', entry, bytes}, {type:'end-entry',
 * entry}]` (`bytes` is a view of the chunk — consume it before the next write); `end()` → `{ok}` | `{ok:false, why}`. An
 * entry = `{name, mode, size, kind: file|dir|link|special|other, linkname}` with a GNU long name / a pax path applied.
 * A broken header stops the reader (`failed`); data after the two zero blocks is ignored.
 */
function tarParser() {
  const hdr = new Uint8Array(512);
  let hlen = 0, state = 'header', remain = 0, pad = 0, cur = null, meta = null, metaParts = [], metaLen = 0, ended = false, zeros = 0, failed = null, nextName = null, nextPax = null, count = 0;
  const fail = (why) => { failed = failed || why; return [{ type: 'error', why: failed }]; };
  function headerDone(out) {
    const h = tarHeader(hdr);
    if (h.end) { zeros++; if (zeros >= 2) ended = true; return; }
    zeros = 0;
    if (h.bad) { out.push(...fail(h.bad)); return; }
    if (++count > ENTRIES_MAX * 2) { out.push(...fail(`more than ${ENTRIES_MAX} entries`)); return; }
    if (h.kind === 'meta') {
      if (h.size > META_MAX) { out.push(...fail('a long-name / pax header larger than 64 KB')); return; }
      meta = h; metaParts = []; metaLen = 0; remain = h.size; pad = (512 - (h.size % 512)) % 512;
      state = remain ? 'data' : pad ? 'pad' : 'header';
      if (!remain) metaDone();
      return;
    }
    const entry = { name: h.name, mode: h.mode, size: h.size, kind: h.kind, linkname: h.linkname };
    if (nextName != null) { entry.name = nextName; nextName = null; }
    if (nextPax) { if (typeof nextPax.path === 'string') entry.name = nextPax.path; if (/^\d{1,15}$/.test(String(nextPax.size || ''))) entry.size = Number(nextPax.size); nextPax = null; }
    if (entry.kind === 'dir') entry.size = 0;
    cur = entry; out.push({ type: 'entry', entry });
    remain = entry.kind === 'file' || entry.kind === 'other' ? entry.size : 0; pad = (512 - (remain % 512)) % 512;
    if (!remain) { out.push({ type: 'end-entry', entry }); cur = null; }
    state = remain ? 'data' : pad ? 'pad' : 'header';
  }
  function metaDone() {
    const body = new Uint8Array(metaLen); let o = 0;
    for (const p of metaParts) { body.set(p, o); o += p.length; }
    if (meta.type === 'L') { let e = body.length; while (e > 0 && body[e - 1] === 0) e--; nextName = textOf(body, 0, e); }
    else if (meta.type === 'x') nextPax = paxOf(body);
    meta = null; metaParts = []; metaLen = 0;
  }
  function write(chunk) {
    const out = [];
    if (failed) return [{ type: 'error', why: failed }];
    let i = 0;
    const n = chunk.length;
    while (i < n && !failed) {
      if (ended) break;
      if (state === 'header') {
        const take = Math.min(512 - hlen, n - i);
        hdr.set(chunk.subarray(i, i + take), hlen); hlen += take; i += take;
        if (hlen < 512) break;
        hlen = 0; headerDone(out);
      } else if (state === 'data') {
        const take = Math.min(remain, n - i);
        const part = chunk.subarray(i, i + take);
        if (meta) { metaParts.push(part.slice()); metaLen += part.length; }
        else out.push({ type: 'data', entry: cur, bytes: part });
        remain -= take; i += take;
        if (!remain) { if (meta) metaDone(); else { out.push({ type: 'end-entry', entry: cur }); cur = null; } state = pad ? 'pad' : 'header'; }
      } else {
        const take = Math.min(pad, n - i);
        pad -= take; i += take;
        if (!pad) state = 'header';
      }
    }
    return out;
  }
  function end() {
    if (failed) return { ok: false, why: failed };
    if (!ended && (state !== 'header' || hlen)) return { ok: false, why: 'the archive ends in the middle of an entry' };
    if (!ended && !zeros) return { ok: false, why: 'the archive has no end blocks (cut short?)' };
    return { ok: true };
  }
  return { write, end, get failed() { return failed; } };
}

/**
 * ONE ENTRY judged before it is extracted — `{name, kind, size}` → `{ok:true, rel, top, kind}` (`rel` = the path inside the
 * kernel's folder after `strip`; null for the archive's own top folder) | `{ok:false, why}`. A leading `./` is not a part; the
 * entry `./` itself is the archive's root (`root: true`), never a top folder.
 */
function tarEntryVerdict(e, { strip = 0 } = {}) {
  const raw = String((e && e.name) || '');
  if (!raw || /[\0-\x1f\x7f\\]/.test(raw)) return { ok: false, why: `a name with a control character or a backslash (${JSON.stringify(raw.slice(0, 80))})` };
  if (raw.startsWith('/')) return { ok: false, why: `an absolute name (${clip(raw, 80)})` };
  const kind = e.kind;
  if (kind === 'link') return { ok: false, why: `a link entry (${clip(raw, 80)}${e.linkname ? ' → ' + clip(e.linkname, 60) : ''})` };
  if (kind !== 'file' && kind !== 'dir') return { ok: false, why: `a special entry (${clip(raw, 80)})` };
  const segs = raw.replace(/\/+$/, '').split('/');
  while (segs.length && segs[0] === '.') segs.shift();
  // the archive's OWN root (`./` — an archive made with `tar -C dir -cf - .`): no part, no top folder (round 2)
  if (!segs.length) return kind === 'dir' ? { ok: true, rel: null, top: null, kind, root: true } : { ok: false, why: `a file with no name of its own (${clip(raw, 80)})` };
  if (segs.some((s) => s === '..' || s === '.' || s === '')) return { ok: false, why: `a name with "..", "." or an empty part (${clip(raw, 80)})` };
  if (!segs.every((s) => SEG_RE.test(s))) return { ok: false, why: `a name with characters outside [A-Za-z0-9._+@-] (${clip(raw, 80)})` };
  if (segs.length <= strip) return kind === 'dir' ? { ok: true, rel: null, top: segs.slice(0, strip).join('/'), kind } : { ok: false, why: `a file above the archive's top folder (${clip(raw, 80)}; stripComponents ${strip})` };
  return { ok: true, rel: segs.slice(strip).join('/'), top: strip ? segs.slice(0, strip).join('/') : null, kind };
}

/**
 * THE ARCHIVE'S SHAPE, judged from the LIST pass before anything is extracted: `entries` = the parser's entries; every one
 * passes `tarEntryVerdict`; ONE top folder when `stripComponents > 0`; no duplicate; no folder where a file is; every
 * `requiredFiles` a regular file; the program executable. → `{ok, files, dirs, unpacked, entries:[{rel, kind, size, mode}]}`
 * | `{ok:false, code:'build_unpack_failed', error}` (nothing was extracted).
 */
function tarShapeVerdict(entries, { layout = {}, id = '', label = '' } = {}) {
  const w = who(id, label);
  const bad = (why) => ({ ok: false, code: 'build_unpack_failed', error: `${w}'s kernel archive is not the layout its ${KERNEL_FILE} declares: ${why} — nothing was extracted` });
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return bad('it lists no entry');
  if (list.length > ENTRIES_MAX) return bad(`more than ${ENTRIES_MAX} entries`);
  const strip = Number(layout.stripComponents) || 0;
  const seen = new Map(), out = [];
  let top, files = 0, dirs = 0, unpacked = 0;
  for (const e of list) {
    const v = tarEntryVerdict(e, { strip });
    if (!v.ok) return bad(v.why);
    if (v.root) continue; // `./` — the archive's own root, never a second top folder
    if (strip) { if (top === undefined) top = v.top; else if (v.top !== top) return bad(`two top folders (${clip(top, 60)}, ${clip(v.top, 60)})`); }
    if (v.rel == null) continue;
    if (seen.has(v.rel)) { if (v.kind === 'dir' && seen.get(v.rel) === 'dir') continue; return bad(`the same name twice (${clip(v.rel, 80)})`); }
    seen.set(v.rel, v.kind);
    if (v.kind === 'file') { files++; unpacked += Number(e.size) || 0; if (unpacked > BYTES_MAX * 2) return bad('it unpacks to more than 16 GB'); } else dirs++;
    out.push({ rel: v.rel, kind: v.kind, size: v.kind === 'file' ? Number(e.size) || 0 : 0, mode: Number(e.mode) || 0 });
  }
  for (const rel of seen.keys()) {
    const parts = rel.split('/');
    for (let k = 1; k < parts.length; k++) if (seen.get(parts.slice(0, k).join('/')) === 'file') return bad(`a file where a folder is (${clip(parts.slice(0, k).join('/'), 80)})`);
  }
  for (const f of layout.requiredFiles || [BINARY]) if (seen.get(f) !== 'file') return bad(`no ${clip(f, 80)} in it`);
  const prog = out.find((x) => x.rel === BINARY);
  if (!prog || !(prog.mode & 0o100)) return bad(`its ${BINARY} is not executable`);
  return { ok: true, files, dirs, unpacked, entries: out };
}
/** A file's mode on disk: the archive's owner bits kept (an executable stays one), never group / other write. */
const fileModeOf = (mode) => ((Number(mode) || 0o644) & 0o755) | 0o400;

/** THE RECEIPT written beside `chrome` once the archive was verified: `{sha256, bytes, verifiedAt, version}` (+ the archive's
 *  length and the program's own hash, extra keys the kernel side's reader ignores). */
function receiptOf({ sha256, bytes, version, verifiedAt, archiveBytes = null, binarySha256 = null } = {}) {
  return { sha256: String(sha256), bytes: Number(bytes), verifiedAt: Number(verifiedAt), version: String(version), ...(archiveBytes != null ? { archiveBytes: Number(archiveBytes) } : {}), ...(binarySha256 ? { binarySha256: String(binarySha256) } : {}) };
}
/** A receipt read back (`doc`, null when absent) against the program's size now → `{verified, sha256, verifiedAt, version,
 *  why}` (the same reading the kernel side's `/probe` makes). */
function receiptVerdict(doc, { size = null } = {}) {
  if (!isObj(doc)) return { verified: false, sha256: null, verifiedAt: null, version: null, why: 'no receipt — the kernel was not installed by VibeSpace' };
  const sha = SHA_RE.test(String(doc.sha256 || '')) ? String(doc.sha256) : null;
  const ok = !!sha && Number.isInteger(doc.bytes) && doc.bytes > 0 && Number.isFinite(Number(doc.verifiedAt)) && typeof doc.version === 'string';
  if (!ok) return { verified: false, sha256: sha, verifiedAt: null, version: null, why: 'a receipt of another shape' };
  if (size != null && Number(size) !== doc.bytes) return { verified: false, sha256: sha, verifiedAt: Number(doc.verifiedAt), version: doc.version, why: `the program is ${Number(size)} bytes, the receipt says ${doc.bytes} — it changed since it was verified` };
  return { verified: true, sha256: sha, verifiedAt: Number(doc.verifiedAt), version: doc.version, why: null };
}

/** `<kernel> --version`'s output → `{version, says}` — the dotted version (with a `-suffix` the build names) of the first line,
 *  and that line (clipped). `version` null when the line names none. */
function versionOf(out) {
  const line = String(out == null ? '' : out).split('\n').map((l) => l.trim()).find(Boolean) || '';
  const m = /(\d{2,4}(?:\.\d{1,6}){2,3}(?:-[0-9A-Za-z.]{1,24})?)/.exec(line);
  return { version: m ? m[1] : null, says: clip(line, 120) };
}
/** WHICH VERSION A SURFACE SAYS: the measured one (VibeSpace ran the kernel) › the plugin's probe (`reported`) › the declared
 *  one (kernel.json, not measured) › none. → `{kind: 'measured'|'reported'|'declared'|'none', version}`. */
function versionFact({ measuredVersion = null, version = null, declaredVersion = null } = {}) {
  if (measuredVersion) return { kind: 'measured', version: String(measuredVersion) };
  if (version) return { kind: 'reported', version: String(version) };
  if (declaredVersion) return { kind: 'declared', version: String(declaredVersion) };
  return { kind: 'none', version: null };
}

module.exports = { SCHEMA, RECEIPT_FILE, KERNEL_FILE, ARCHIVE_FORMATS, BINARY, BYTES_MAX, ENTRIES_MAX, NODE_FLOOR, safeRel, httpsUrlOf, kernelManifestVerdict, kernelPlan,
  tarHeader, tarParser, tarEntryVerdict, tarShapeVerdict, fileModeOf, receiptOf, receiptVerdict, versionOf, versionFact };
