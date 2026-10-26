'use strict';
/**
 * ORCH — A BROWSER ENGINE'S KERNEL AND THE FLEET'S PLUGIN, DISTRIBUTED (lane engine-distribution, P4 of the custom browser
 * kernel; docs/design-custom-browser-plugin.zh.md §5 as built). Two jobs, one module (the For-you producer of both):
 *
 *   THE KERNEL (`installKernel`). The plugin's package carries no kernel (1.2 GB) — its `kernel.json` names the artifact; the
 *   fleet's `browserEngine.kernel {url, sha256}` (the cluster's own artifact host) replaces url + sha256. VibeSpace downloads
 *   it the way design 004 downloads a Chrome build, into the registry's kernel place (`kernelPath(id)` =
 *   `<data>/plugins-state/<id>/kernel/<os>-<arch>/chrome`, the plugin's OWN state folder — its `node --permission` probe can
 *   stat it): the two hard rows first (src/browser-builds.js downloadHardRows: the machine against kernel.json's platforms,
 *   the disk against the archive × DISK_FACTOR — `disk` names the folder's free bytes, a pod's PVC), then fetch (https only,
 *   every redirect hop https, the announced length enforced) into `<tag>.part` with its sha256 → the sha256 against the
 *   manifest's (else build_verify_failed — nothing unpacked) → a LIST pass over the zstd stream (node's zlib zstd, no shell
 *   tar) judged by tarShapeVerdict BEFORE anything is written (no link, no `..`, one top folder, every requiredFiles) and the
 *   unpacked size against the free bytes now → the EXTRACT pass into `.unpack-<tag>/` (stripComponents; every entry judged
 *   again) → `install-receipt.json {sha256, bytes, verifiedAt, version}` beside `chrome` → ONE rename to `<tag>/` (a previous
 *   kernel renamed to `.removing-<tag>` first, then deleted): nothing half-done is ever at the kernel's place. A failed step
 *   removes `.part` and `.unpack-<tag>` and is said by name (build_fetch_failed / build_verify_failed / build_unpack_failed /
 *   disk / build_platform_unsupported / browser_engine_protocol for a kernel.json of another shape / engine_url_not_https for
 *   a fleet address that is not https / engine_sha_malformed for a fleet sha256 that is not 64 hex digits).
 *   ROUND 2 (主开发's acceptance): every file written (`.part`, each extracted entry) is ONE writer with ONE 'error' listener
 *   from its creation — the drain wait reuses it, so a failed write (ENOSPC / EDQUOT / EIO) is the install's named refusal
 *   (`disk` / build_unpack_failed), never an unhandled 'error' that ends the hub; a Node whose zlib has no zstd is refused
 *   (engine_node_unsupported) BEFORE any byte is fetched, remembered on the engine record for THAT Node; a final rename that
 *   fails after the previous kernel was moved aside moves it BACK, and a later landing restores an aside copy before it
 *   would ever delete one.
 *   ROUND 3: a file is written only once it is CLOSED — the writer settles on 'close' (an NFS bind reports ENOSPC / EIO at
 *   close), then compares the size on disk with the bytes written; an aside copy beside an empty place is put back FIRST —
 *   in installKernel, in measure and once at boot (`bootRestore`) — with no download, and one that cannot be put back is
 *   said: the record holds NO kernel (engine_kernel_aside), never «installed» over an empty place.
 *   ROUND 4: the put-back happens ONLY onto a place that answers ENOENT — any other answer (EIO / ESTALE, an NFS bind) is a
 *   transient: nothing moved, nothing said, asked again next time; an aside copy beside a kernel IN its place is a leftover
 *   (the landing's rm failed; an NFS silly-rename) — deleted, never put back over it; a record dropped once is healed by the
 *   next measure that finds the kernel in its place (its receipt's facts).
 *   THE MEASURED VERSION (`measure`). The plugin has no childProcess (the kernel side, settled 2026-10-25): VibeSpace runs
 *   `<kernel> --version` ONCE after the install and before the first launch (the keeper asks — a child, 5 s, serviceEnv),
 *   keyed by the receipt's sha256 (a kernel placed by hand: its size + mtime) — `measuredVersion` + `measuredAt` on THE
 *   ENGINE RECORD (data/browser-engines.json, this module its one writer). The card says «measured x» or «declared x (not
 *   measured)», never a path.
 *   THE FLEET (`bootFleet`, ONE job after the listen, never on the boot path). fleet.json `browserEngine {plugin, source:{git,
 *   ref}, preinstall}`: the plugin registry has no such id or its recorded source / ref differs ⇒ the loader installs it from
 *   git (`by: 'fleet'` — the loader's D2 pre-trust: only the id the fleet names, only that package's contentHash); every boot
 *   compares the record and never re-pulls; `preinstall` ⇒ the kernel is downloaded right away, else on first use (the
 *   keeper's launch). A failure nobody watched (the boot, a first use) files ONE For-you notice (origin plugin).
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Writable } = require('stream');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const EK = require('../engine-kernel.js');
const BB = require('../browser-builds.js');
const BE = require('../browser-engines.js');
const { serviceEnv } = require('../agent-env.js');

const RECORD_FILE = 'browser-engines.json';
const VERSION_MS = 5000;
const STALL_MS = 120000;
const MANIFEST_MAX = 256 * 1024;
const UNPACKED_MAX = 17 * 1024 * 1024 * 1024;
const clip = (s, n = 200) => String(s == null ? '' : s).replace(/[\0-\x1f\x7f]/g, ' ').slice(0, n);
const named = (code, error, extra = {}) => Object.assign(new Error(String(error)), { code, ...extra });

function create({ dataDir, engines = null, loader = null, fleetFacts = () => null, fetchImpl = (...a) => globalThis.fetch(...a), resolveUrl = null, platform = process.platform, arch = process.arch,
  env = () => process.env, userTodos = null, notify = () => {}, log = console, now = () => Date.now(), stallMs = STALL_MS, versionMs = VERSION_MS, freeOf: freeOfIn = null,
  zlib: zlibIn = zlib, nodeVersion = process.versions.node, io: ioIn = null } = {}) {
  // the file doors a suite bends (a write that fails, a rename that fails) — the real fs otherwise
  const io = { createWriteStream: (f, o) => fs.createWriteStream(f, o), rename: (a, b) => fsp.rename(a, b), stat: (f) => fsp.stat(f), ...(ioIn || {}) };
  const nodeNow = String(nodeVersion || '');
  const unpackFacts = () => ({ zstd: !!zlibIn && typeof zlibIn.createZstdDecompress === 'function', node: nodeNow });
  const R = () => { try { return typeof engines === 'function' ? engines() : engines; } catch { return null; } };
  const L = () => { try { return typeof loader === 'function' ? loader() : loader; } catch { return null; } };
  const T = () => { try { return typeof userTodos === 'function' ? userTodos() : userTodos; } catch { return null; } };
  const recordFile = path.join(String(dataDir || '.'), RECORD_FILE);
  let record = { v: 1, engines: {} };
  const ready = (async () => { try { const j = JSON.parse(await fsp.readFile(recordFile, 'utf8')); if (j && typeof j === 'object' && j.engines && typeof j.engines === 'object') record = { v: 1, engines: j.engines }; } catch { /* none yet */ } })();
  let saving = Promise.resolve();
  const save = () => (saving = saving.then(async () => { const tmp = `${recordFile}.${process.pid}.tmp`; await fsp.mkdir(path.dirname(recordFile), { recursive: true }); await fsp.writeFile(tmp, JSON.stringify(record, null, 1), { mode: 0o600 }); await fsp.rename(tmp, recordFile); }).catch((e) => log.warn?.(`[browser] the engine record could not be written (${e && e.message})`)));
  const recOf = (id) => (record.engines[id] = record.engines[id] || {});
  const running = new Map();   // id → the download in flight {step, bytes, total, startedAt, by, abort}
  const measuring = new Map();
  const restoring = new Map(); // id → the put-back in flight (one at a time: installKernel, measure and the boot may all ask)
  const fleetLast = { at: null, outcome: null, code: null, error: null, plugin: null };
  const labelOf = (id) => { try { const p = (L() && L().list ? L().list() : []).find((x) => x.id === id); return p && p.label ? String(p.label) : ''; } catch { return ''; } };
  const who = (id) => BE.engineWords({ id, label: labelOf(id) });
  const fleetEngine = () => { try { const f = fleetFacts(); return f && f.browserEngine && typeof f.browserEngine === 'object' ? f.browserEngine : null; } catch { return null; } };
  // the fleet's kernel as it names it — a field it names is merged over the package's (never dropped for it: kernelManifestVerdict)
  const fleetKernelFor = (id) => { const fe = fleetEngine(); return fe && fe.plugin === id && fe.kernel && (fe.kernel.url || fe.kernel.sha256) ? { url: fe.kernel.url || '', sha256: fe.kernel.sha256 || '' } : null; };
  /** The kernel's plan; `unpack` (an install's) = the Node it unpacks on — no zstd ⇒ engine_node_unsupported, by name. */
  function planOf(id, { unpack = null } = {}) {
    const r = R();
    const kp = r && typeof r.kernelPath === 'function' ? r.kernelPath(id) : null;
    const plan = EK.kernelPlan({ kernelPath: kp, unpack });
    if (!plan.ok && plan.code === 'engine_node_unsupported') throw named(plan.code, `${who(id)}'s kernel cannot be installed here: ${plan.error}`, { node: plan.node, need: plan.need });
    if (!plan.ok) throw named('browser_engine_missing', `${who(id)} has no kernel place on this computer (no such engine plugin id)`);
    return plan;
  }
  /** A write that failed → the install's refusal BY NAME: no room (ENOSPC / EDQUOT) ⇒ `disk`, anything else ⇒ `code`. */
  const writeFailure = (e, { sid, what, code = 'build_unpack_failed', where }) => (e && /^(?:build_[a-z_]+|disk)$/.test(String(e.code || '')) ? e
    : /^(?:ENOSPC|EDQUOT)$/.test(String(e && e.code)) ? named('disk', `${who(sid)}'s kernel ran out of room on ${where} while writing ${what} (${e.code}) — nothing was placed`)
    : named(code, `${who(sid)}'s kernel could not be written (${what}: ${clip((e && e.code) || (e && e.message) || e, 120)}) — nothing was placed`));
  /** ONE file written chunk by chunk: ONE 'error' listener for the stream's whole life, attached at its creation, and ONE 'drain'
   *  listener — the backpressure wait reuses them (never a listener per chunk). A failed write rejects the step that waits or the
   *  next write / the end; the stream never emits an 'error' nobody hears (the hub's uncaughtException exit). */
  function fileWriter(dest) {
    const ws = io.createWriteStream(dest, { flags: 'wx', mode: 0o600 });
    let failed = null, waiter = null, closed = false, onClose = null, fed = 0;
    const err = () => failed || ws.errored || null; // the stream's own error is set the moment it is destroyed, before 'error' is emitted
    const settle = (e) => { const w = waiter; waiter = null; if (w) { if (e) w.reject(e); else w.resolve(); } };
    ws.on('error', (e) => { failed = failed || e || new Error('write failed'); settle(failed); });
    ws.on('drain', () => settle(null));
    // round 3: and ONE 'close' listener — 'finish' comes BEFORE fs.close runs, and a close can fail (an NFS bind reports ENOSPC /
    // EIO there, close-to-open): the 'error' it emits is heard above, the end waits for it here
    ws.on('close', () => { closed = true; const c = onClose; onClose = null; if (c) c(); });
    const wait = () => new Promise((resolve, reject) => { waiter = { resolve, reject }; });
    return {
      stream: ws,
      async write(buf) { if (err()) throw err(); fed += buf.length; if (!ws.write(buf)) { if (err()) throw err(); await wait(); } if (err()) throw err(); },
      // the end settles on 'close' (fs.close answered), re-reads the stream's error, then the size ON DISK against the bytes written
      async end() {
        if (err()) throw err();
        await new Promise((resolve) => { if (closed) resolve(); else { onClose = resolve; ws.end(); } });
        if (err()) throw err();
        const size = (await fsp.stat(dest)).size;
        if (ws.bytesWritten !== fed || size !== fed) throw new Error(`${size} of its ${fed} bytes are on disk after it was closed`);
      },
      destroy() { try { ws.destroy(); } catch { /* gone */ } },
    };
  }
  /** The free bytes of the filesystem holding `dir` (a pod's PVC) — the first existing ancestor's statfs. `freeOf` injectable. */
  async function freeOf(dir) {
    if (freeOfIn) return freeOfIn(dir);
    let d = path.resolve(String(dir));
    for (let i = 0; i < 64; i++) { try { const s = await fsp.statfs(d); return { free: Number(s.bavail) * Number(s.bsize), path: d }; } catch { const up = path.dirname(d); if (up === d) break; d = up; } }
    return { free: null, path: String(dir) };
  }
  async function readJson(file, max = MANIFEST_MAX) {
    let st; try { st = await fsp.stat(file); } catch { return null; }
    if (!st.isFile() || st.size > max) return null;
    try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return undefined; }
  }
  /** The package's kernel.json (the installed copy under data/plugins/<id>/). */
  async function manifestDoc(id) {
    const doc = await readJson(path.join(String(dataDir || '.'), 'plugins', id, EK.KERNEL_FILE));
    if (doc === null) throw named('browser_engine_protocol', `${who(id)}'s package has no ${EK.KERNEL_FILE} — VibeSpace cannot download its kernel (the plugin must name its artifact)`);
    if (doc === undefined) throw named('browser_engine_protocol', `${who(id)}'s ${EK.KERNEL_FILE} is not JSON`);
    return doc;
  }
  /** The artifact this machine would download — the facts a card shows before any byte moves (`{version, bytes, host, source}`). */
  async function plannedKernel(id) {
    await ready;
    const plan = planOf(id);
    const m = EK.kernelManifestVerdict(await manifestDoc(id), { tag: plan.tag, fleet: fleetKernelFor(id), id, label: labelOf(id) });
    if (!m.ok) throw named(m.code, m.error);
    return { version: m.version, bytes: m.bytes, host: m.host, source: m.source, sha256: m.sha256 };
  }

  // ── THE FETCH: https only, every redirect hop https (the sha256 is the authenticity), the stall bound ──
  async function kernelFetch(url, { signal, hops = 3 } = {}) {
    let u = String(url || '');
    for (let i = 0; i <= hops; i++) {
      const x = EK.httpsUrlOf(u);
      if (!x) throw named('build_fetch_failed', `the kernel's download is not an https address (${clip(u, 120)}) — nothing was fetched from it`);
      let res;
      try { res = await fetchImpl(resolveUrl ? resolveUrl(x.url) : x.url, { redirect: 'manual', signal, headers: { 'user-agent': 'vibespace-kernel-download' } }); }
      catch (e) { if (signal && signal.aborted) throw named('build_fetch_failed', `the download from ${x.host} stalled (no byte for ${Math.round(stallMs / 1000)} s)`); throw named('build_fetch_failed', `${x.host} could not be reached (${clip((e && e.cause && e.cause.code) || (e && e.message) || e, 120)})`); }
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (loc) { try { await res.body?.cancel(); } catch { /* none */ } try { u = new URL(loc, x.url).href; } catch { throw named('build_fetch_failed', `${x.host} redirected to a bad location`); } continue; }
      return { res, host: x.host };
    }
    throw named('build_fetch_failed', `more than ${hops} redirects from ${clip(url, 120)}`);
  }
  /** One pass over the archive: the zstd stream → the tar reader → `onEvent` (awaited: the file writes push back). */
  async function tarPass(file, onEvent) {
    const parser = EK.tarParser();
    let seen = 0;
    const handle = async (chunk) => {
      seen += chunk.length;
      if (seen > UNPACKED_MAX) throw named('build_unpack_failed', 'the kernel archive unpacks to more than 17 GB — nothing more was read');
      for (const ev of parser.write(chunk)) {
        if (ev.type === 'error') throw named('build_unpack_failed', `the kernel archive is not a readable tar: ${ev.why}`);
        await onEvent(ev);
      }
    };
    const sink = new Writable({ write(chunk, _enc, cb) { handle(chunk).then(() => cb(), cb); } });
    try { await pipeline(fs.createReadStream(file), zlibIn.createZstdDecompress(), sink); }
    catch (e) { if (e && /^(?:build_[a-z_]+|disk)$/.test(String(e.code || ''))) throw e; throw named('build_unpack_failed', `the kernel archive is not a readable tar.zst (${clip(e && e.message, 160)})`); }
    const end = parser.end();
    if (!end.ok) throw named('build_unpack_failed', `the kernel archive is not a whole tar: ${end.why}`);
  }
  const dropPartials = async (plan) => { await fsp.rm(plan.part, { force: true }).catch(() => {}); await fsp.rm(plan.unpackDir, { recursive: true, force: true }).catch(() => {}); };

  /**
   * DOWNLOAD a kernel into its place. The refusals before any byte (no place, one already running, kernel.json, the two hard
   * rows) are THROWN; the rest runs on (`wait: true` awaits it — the boot job and the suites) and is said through `kernelFact`.
   * `by`: 'user' (a person's click — the card shows it) | 'fleet' (the boot job) | 'first-use' (a launch found it absent).
   */
  async function installKernel(id, { by = 'user', wait = false } = {}) {
    await ready;
    const sid = String(id || '');
    if (!BE.ID_RE.test(sid)) throw named('browser_engine_missing', `"${clip(sid, 80)}" is not a browser engine plugin id`);
    const plan = planOf(sid);
    if (running.has(sid)) { const r0 = running.get(sid); throw named('install_running', `${who(sid)}'s kernel is already downloading (${r0.total ? Math.floor((100 * r0.bytes) / r0.total) + ' %' : r0.step}) — one at a time`); }
    const st = { step: 'restore', bytes: 0, total: null, startedAt: now(), by, abort: new AbortController() };
    running.set(sid, st);
    let m, fr;
    try {
      // round 3: an aside copy beside an empty place (a landing stopped between its renames) comes BACK first — a first use or
      // the fleet's boot then needs no download; one that cannot be put back is refused by name (engine_kernel_aside)
      if (await restoreAside(sid, plan) && by !== 'user') { running.delete(sid); notify(); return { ok: true, restored: true, id: sid }; }
      // the Node it would unpack on (round 2): no zstd ⇒ refused by name before any byte moves, remembered for this Node
      st.step = 'plan';
      planOf(sid, { unpack: unpackFacts() });
      const doc = await manifestDoc(sid);
      const plats = doc && doc.platforms && typeof doc.platforms === 'object' ? Object.keys(doc.platforms) : [];
      const art = doc && doc.platforms && doc.platforms[plan.tag];
      await fsp.mkdir(plan.root, { recursive: true, mode: 0o700 });
      fr = await freeOf(plan.root);
      // design 004's two hard rows: the machine (kernel.json's platforms) and the disk (the archive × DISK_FACTOR)
      const hr = BB.downloadHardRows({ machine: plan.tag, offered: plats, freeBytes: fr.free, archiveBytes: art && Number.isInteger(art.bytes) ? art.bytes : null, freePath: fr.path,
        unsupported: `${who(sid)} offers no kernel for ${plan.tag} computers${plats.length ? ` (it has ${plats.slice(0, 8).join(', ')})` : ''} — nothing was downloaded` });
      if (hr.hard.length) throw named(hr.hard[0].code, hr.hard[0].code === 'disk' ? `${who(sid)}'s kernel ${hr.hard[0].error} — nothing was downloaded` : hr.hard[0].error, { kernel: { need: hr.needBytes, free: fr.free, path: fr.path } });
      m = EK.kernelManifestVerdict(doc, { tag: plan.tag, fleet: fleetKernelFor(sid), id: sid, label: labelOf(sid) });
      if (!m.ok) throw named(m.code, m.error);
    } catch (e) { running.delete(sid); await noteFailure(sid, e, st.step, by); throw e; }
    st.total = m.bytes;
    log.log?.(`[browser] downloading ${who(sid)}'s kernel ${m.version} (${m.bytes || '?'} bytes) from ${m.host} into ${plan.targetDir} (${by}; ${m.source === 'fleet' ? 'the fleet\'s artifact' : 'its kernel.json'})`);
    notify();
    const job = runInstall(sid, plan, m, st).then(async (out) => { running.delete(sid); notify(); return out; }, async (e) => { running.delete(sid); await dropPartials(plan); await noteFailure(sid, e, st.step, by); notify(); throw e; });
    if (wait) return job;
    job.catch(() => {}); // said through kernelFact + the journal (+ For-you when nobody watched)
    return { ok: true, started: true, id: sid, version: m.version, bytes: m.bytes, host: m.host };
  }
  async function runInstall(sid, plan, m, st) {
    // ① FETCH → .part, hashed as it lands
    st.step = 'fetch';
    await fsp.rm(plan.part, { force: true }).catch(() => {});
    let stall = null;
    const kick = () => { clearTimeout(stall); stall = setTimeout(() => { try { st.abort.abort(); } catch { /* none */ } }, stallMs); if (stall.unref) stall.unref(); };
    kick();
    const h = crypto.createHash('sha256');
    let out = null, got = 0;
    try {
      const g = await kernelFetch(m.url, { signal: st.abort.signal });
      if (!g.res.ok) throw named('build_fetch_failed', `${g.host} answered ${g.res.status} for ${who(sid)}'s kernel ${m.version}`);
      const len = Number(g.res.headers.get('content-length'));
      if (m.bytes != null && Number.isFinite(len) && len > 0 && len !== m.bytes) throw named('build_verify_failed', `${g.host} announces ${len} bytes, ${EK.KERNEL_FILE} says ${m.bytes} — not the declared archive; nothing was kept`);
      const cap = m.bytes != null ? m.bytes : Number.isFinite(len) && len > 0 ? len : EK.BYTES_MAX;
      st.total = m.bytes != null ? m.bytes : Number.isFinite(len) && len > 0 ? len : null;
      out = fileWriter(plan.part);
      const wf = (e) => writeFailure(e, { sid, what: 'the download', code: 'build_fetch_failed', where: plan.root });
      for await (const chunk of g.res.body) {
        kick();
        got += chunk.length; st.bytes = got;
        if (got > cap) throw named('build_verify_failed', `the server sent more than the ${cap} bytes of the archive — nothing was kept`);
        h.update(chunk);
        try { await out.write(chunk); } catch (e) { throw wf(e); }
      }
      try { await out.end(); } catch (e) { throw wf(e); }
      out = null;
    } catch (e) {
      if (e && /^(?:build_[a-z_]+|disk)$/.test(String(e.code || ''))) throw e;
      if (st.abort.signal.aborted) throw named('build_fetch_failed', `the download stalled (no byte for ${Math.round(stallMs / 1000)} s) — nothing was kept`);
      throw named('build_fetch_failed', `the download of ${who(sid)}'s kernel failed (${clip(e && e.message, 160)})`);
    } finally { clearTimeout(stall); if (out) { try { out.destroy(); } catch { /* none */ } } }
    // ② VERIFY the archive: its length and its sha256 against the manifest's
    st.step = 'verify'; notify();
    if (m.bytes != null && got !== m.bytes) throw named('build_verify_failed', `${got} of the ${m.bytes} bytes arrived — nothing was kept`);
    const sha = h.digest('hex');
    if (sha !== m.sha256) throw named('build_verify_failed', `the archive's sha256 ${sha} is not the declared ${m.sha256} — nothing was unpacked`);
    // ③ LIST: the archive's shape judged before anything is written, and what it unpacks to against the disk now
    st.step = 'list'; notify();
    const listed = [];
    await tarPass(plan.part, async (ev) => { if (ev.type === 'entry') { listed.push(ev.entry); if (listed.length > EK.ENTRIES_MAX) throw named('build_unpack_failed', `the kernel archive has more than ${EK.ENTRIES_MAX} entries`); } });
    const shape = EK.tarShapeVerdict(listed, { layout: m.layout, id: sid, label: labelOf(sid) });
    if (!shape.ok) throw named(shape.code, shape.error);
    const fr2 = await freeOf(plan.root);
    if (fr2.free != null && shape.unpacked > fr2.free) throw named('disk', `${who(sid)}'s kernel unpacks to ${Math.ceil(shape.unpacked / 1e6)} MB, ${Math.floor(fr2.free / 1e6)} MB left on ${fr2.path} — nothing was extracted`, { kernel: { need: shape.unpacked, free: fr2.free, path: fr2.path } });
    // ④ EXTRACT into .unpack-<tag>/ — every entry judged again on its way out
    st.step = 'unpack'; notify();
    const want = new Map(shape.entries.map((e) => [e.rel, e]));
    await fsp.rm(plan.unpackDir, { recursive: true, force: true });
    await fsp.mkdir(plan.unpackDir, { mode: 0o700 });
    let cur = null, ws = null, bin = null, binBytes = 0;
    const strip = m.layout.stripComponents;
    try {
      await tarPass(plan.part, async (ev) => {
        if (ev.type === 'entry') {
          const v = EK.tarEntryVerdict(ev.entry, { strip });
          if (!v.ok) throw named('build_unpack_failed', `the kernel archive changed between its two reads: ${v.why}`);
          if (v.rel == null) { cur = null; return; }
          const w = want.get(v.rel);
          if (!w || w.kind !== v.kind) throw named('build_unpack_failed', `the kernel archive changed between its two reads (${clip(v.rel, 80)})`);
          const dest = path.join(plan.unpackDir, ...v.rel.split('/'));
          if (v.kind === 'dir') { await fsp.mkdir(dest, { recursive: true, mode: 0o755 }); cur = null; return; }
          await fsp.mkdir(path.dirname(dest), { recursive: true, mode: 0o755 });
          ws = fileWriter(dest);
          cur = { dest, mode: w.mode, rel: v.rel };
          if (v.rel === EK.BINARY) { bin = crypto.createHash('sha256'); binBytes = 0; }
        } else if (ev.type === 'data') {
          if (!cur || !ws) return;
          if (cur.rel === EK.BINARY) { bin.update(ev.bytes); binBytes += ev.bytes.length; }
          try { await ws.write(Buffer.from(ev.bytes.buffer, ev.bytes.byteOffset, ev.bytes.length)); } catch (e) { throw writeFailure(e, { sid, what: cur.rel, where: plan.root }); }
        } else if (ev.type === 'end-entry') {
          if (!cur || !ws) return;
          const w0 = ws; ws = null;
          try { await w0.end(); } catch (e) { throw writeFailure(e, { sid, what: cur.rel, where: plan.root }); }
          await fsp.chmod(cur.dest, EK.fileModeOf(cur.mode));
          cur = null;
        }
      });
    } finally { if (ws) { try { ws.destroy(); } catch { /* none */ } } }
    for (const f of m.layout.requiredFiles) { let s = null; try { s = await fsp.stat(path.join(plan.unpackDir, ...f.split('/'))); } catch { s = null; } if (!s || !s.isFile()) throw named('build_verify_failed', `the unpacked kernel has no ${f} — nothing was placed`); }
    const exeStat = await fsp.stat(path.join(plan.unpackDir, EK.BINARY));
    if (!(exeStat.mode & 0o100)) throw named('build_verify_failed', `the unpacked kernel's ${EK.BINARY} is not executable — nothing was placed`);
    // ⑤ THE RECEIPT beside chrome, then ONE rename into the kernel's place
    st.step = 'land'; notify();
    const receipt = EK.receiptOf({ sha256: sha, bytes: exeStat.size, verifiedAt: now(), version: m.version, archiveBytes: got, binarySha256: bin && binBytes === exeStat.size ? bin.digest('hex') : null });
    await fsp.writeFile(path.join(plan.unpackDir, EK.RECEIPT_FILE), JSON.stringify(receipt, null, 1), { mode: 0o644 });
    await restoreAside(sid, plan); // a previous kernel an earlier landing left aside comes BACK first — never deleted unrestored
    await fsp.rm(plan.removingDir, { recursive: true, force: true }); // now only a leftover beside a kernel in its place
    let had = false; try { await io.rename(plan.targetDir, plan.removingDir); had = true; } catch (e) { if (e.code !== 'ENOENT') throw named('build_unpack_failed', `the previous kernel could not be moved aside (${e.code || e.message})`); }
    try { await io.rename(plan.unpackDir, plan.targetDir); }
    catch (e) {
      // the new kernel could not take the place AFTER the previous one was moved aside: the previous one goes BACK
      let back = !had, why2 = null;
      if (had) { try { await io.rename(plan.removingDir, plan.targetDir); back = true; } catch (e2) { why2 = (e2 && e2.code) || (e2 && e2.message); log.warn?.(`[browser] ${who(sid)}'s previous kernel could not be put back (${why2}) — the next start or use restores it`); } }
      // round 3: NEITHER kernel in its place ⇒ the record says so (never «installed» over an empty place) until it is put back
      if (!back) { const rk = recOf(sid); if (rk.kernel) { rk.aside = rk.kernel; delete rk.kernel; } throw named('engine_kernel_aside', `${who(sid)}'s new kernel could not be put in its place (${(e && e.code) || (e && e.message)}) and the previous kernel could not be put back (${why2}) — it is set aside beside its place; VibeSpace puts it back at the next start or use`); }
      throw named('build_unpack_failed', `${who(sid)}'s new kernel could not be put in its place (${(e && e.code) || (e && e.message)}) — ${had ? 'the previous kernel was put back' : 'nothing was placed'}`);
    }
    if (had) await fsp.rm(plan.removingDir, { recursive: true, force: true }).catch((e) => log.warn?.(`[browser] the previous kernel at ${plan.removingDir} could not be deleted (${e && e.message})`));
    await fsp.rm(plan.part, { force: true }).catch(() => {});
    const rec = recOf(sid);
    rec.kernel = { version: m.version, sha256: sha, archiveBytes: got, bytes: exeStat.size, host: m.host, source: m.source, installedAt: now(), by: st.by };
    delete rec.failure;
    await save();
    log.log?.(`[browser] ${who(sid)}'s kernel ${m.version} is installed (sha256 ${sha.slice(0, 12)}…, verified; ${shape.files} files)`);
    // ⑥ THE MEASURED VERSION, once, right after the install
    const mv = await measure(sid, { force: true });
    return { ok: true, id: sid, version: m.version, sha256: sha, bytes: got, files: shape.files, measuredVersion: mv && mv.version ? mv.version : null };
  }
  /** An earlier landing stopped between its two renames (the previous kernel aside, nothing in its place) ⇒ it goes BACK.
   *  Round 3: asked FIRST — installKernel, measure, the boot (`bootRestore`) — not only inside a later landing; one at a time
   *  per id. The record follows the place: put back ⇒ the aside kernel's record is the installed one again (else its receipt's);
   *  not put back ⇒ the record holds NO kernel and the refusal is engine_kernel_aside. → true when it put one back. */
  function restoreAside(sid, plan) {
    if (restoring.has(sid)) return restoring.get(sid);
    const p = putBack(sid, plan).finally(() => restoring.delete(sid));
    restoring.set(sid, p);
    return p;
  }
  async function putBack(sid, plan) {
    let aside = false; try { aside = (await io.stat(plan.removingDir)).isDirectory(); } catch { aside = false; }
    if (!aside) return false;
    // round 4: put back ONLY onto a place that answers ENOENT — any other answer (EIO / ESTALE) is a transient: nothing is
    // moved and nothing is said (the journal only), the next start or use asks again; a rename onto a kernel would fail and
    // say «set aside» over a good kernel
    let place = null;
    try { place = await io.stat(plan.targetDir); }
    catch (e) { if (!e || e.code !== 'ENOENT') { log.warn?.(`[browser] ${who(sid)}'s kernel place could not be read (${(e && e.code) || (e && e.message)}) — the copy beside it is left as it is; asked again at the next start or use`); return false; } }
    if (place) {
      // a kernel IN its place: the aside copy is a LEFTOVER (the landing's rm failed; an NFS silly-rename) — deleted, never put
      // back over it; only when the place's binary is there (a place without one keeps both — measure says it is missing)
      let exe = null; try { exe = await io.stat(plan.exe); } catch { exe = null; }
      if (exe && exe.isFile()) await fsp.rm(plan.removingDir, { recursive: true, force: true }).then(() => log.log?.(`[browser] ${who(sid)}'s leftover previous kernel beside its place was deleted — a kernel is in its place`), (e) => log.warn?.(`[browser] the leftover previous kernel at ${plan.removingDir} could not be deleted (${e && e.message})`));
      return false;
    }
    const rec = recOf(sid);
    try { await io.rename(plan.removingDir, plan.targetDir); }
    catch (e) {
      if (rec.kernel) { rec.aside = rec.kernel; delete rec.kernel; }
      await save();
      throw named('engine_kernel_aside', `${who(sid)}'s previous kernel is set aside beside its place and could not be put back (${(e && e.code) || (e && e.message)}) — no kernel is in its place; VibeSpace tries again at the next start or use`);
    }
    if (!rec.kernel) { const k = rec.aside || await kernelOfReceipt(plan); if (k) rec.kernel = k; }
    delete rec.aside;
    if (rec.failure && rec.failure.code === 'engine_kernel_aside') delete rec.failure;
    await save();
    log.log?.(`[browser] ${who(sid)}'s previous kernel was put back in its place (an earlier landing stopped between its two renames) — nothing was downloaded`);
    notify();
    return true;
  }
  /** The record of a kernel put back with no record of its own: its receipt's facts (none ⇒ null — a kernel placed by hand). */
  async function kernelOfReceipt(plan) {
    const rv = EK.receiptVerdict(await readJson(plan.receipt, 64 * 1024));
    return rv.sha256 && rv.version ? { version: rv.version, sha256: rv.sha256, archiveBytes: null, bytes: null, host: null, source: 'receipt', installedAt: rv.verifiedAt, by: 'restore' } : null;
  }
  /** Round 4: a kernel IN its place while the record holds none (a record dropped once — a put-back that failed, the kernel put
   *  back by hand since) ⇒ the record follows the place again: the aside record when the receipt is that kernel's, else the
   *  receipt's; a kernel placed by hand (no receipt) keeps no record, as before. */
  async function placeHeld(sid, plan, rec) {
    const k = await kernelOfReceipt(plan);
    if (!k) return;
    rec.kernel = rec.aside && rec.aside.sha256 === k.sha256 ? rec.aside : k;
    delete rec.aside;
    if (rec.failure && rec.failure.code === 'engine_kernel_aside') delete rec.failure;
    await save();
    log.log?.(`[browser] ${who(sid)}'s kernel ${rec.kernel.version} is in its place — the engine record says it is installed again`);
    notify();
  }
  /** ONCE AT BOOT (round 3): every engine this instance knows (the record's, the registry's, the fleet's) — an aside copy beside
   *  an empty place is put back with no download; one that cannot be is said (the record, the card, ONE For-you notice). */
  async function bootRestore() {
    await ready;
    const ids = new Set(Object.keys(record.engines));
    try { const r = R(); for (const row of (r && typeof r.rows === 'function' ? r.rows() : [])) ids.add(row.id); } catch { /* none */ }
    const fe = fleetEngine(); if (fe && fe.plugin) ids.add(fe.plugin);
    const out = [];
    for (const id of ids) {
      if (!BE.ID_RE.test(String(id)) || running.has(id)) continue;
      let plan; try { plan = planOf(id); } catch { continue; }
      try { if (await restoreAside(id, plan)) out.push({ id, restored: true }); }
      catch (e) { await noteFailure(id, e, 'restore', 'boot'); out.push({ id, restored: false, code: e.code }); }
    }
    if (out.length) notify();
    return out;
  }
  async function noteFailure(sid, e, step, by) {
    const rec = recOf(sid);
    const code = (e && e.code) || 'build_fetch_failed', error = clip(e && e.message, 400);
    const again = rec.failure && rec.failure.code === code && rec.failure.filed;
    rec.failure = { code, error, step: step || 'plan', at: now(), by, filed: !!again, ...(e && e.node ? { node: String(e.node), need: String(e.need || EK.NODE_FLOOR) } : {}) };
    log.warn?.(`[browser] ${who(sid)}'s kernel download failed at ${step || 'plan'} [${code}] — ${error}`);
    if (by !== 'user' && !again && code !== 'install_running') rec.failure.filed = fileNotice(sid, { what: 'kernel', code, error });
    await save();
  }
  /** ONE For-you notice (origin plugin) for a failure nobody watched — the boot job's, a first use's. */
  function fileNotice(id, { what, code, error }) {
    const ut = T();
    if (!ut || typeof ut.add !== 'function') return false;
    const name = labelOf(id) || id;
    const aside = what === 'kernel' && code === 'engine_kernel_aside';
    const text = aside ? `${name}: its browser kernel is set aside and could not be put back` : what === 'kernel' ? `${name}: its browser kernel could not be downloaded` : `${name}: the cluster's plugin could not be installed`;
    const detail = `${clip(error, 300)} [${code}]${what !== 'kernel' ? ' — ⚙ → Plugins shows it; the next restart tries again' : code === 'engine_node_unsupported' ? ` — update Node on this computer to ${EK.NODE_FLOOR} or later; nothing is downloaded until then` : aside ? ' — Settings → Agent browser shows the engine; it is put back at the next start or use' : ' — Settings → Agent browser shows the engine; the download is tried again at the next use'}`;
    try {
      ut.add('engine-distribution', { origin: 'plugin', plugin: 'engine-distribution', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Plugins', text, detail,
        i18n: { text: { key: aside ? '{name}: its browser kernel is set aside and could not be put back' : what === 'kernel' ? '{name}: its browser kernel could not be downloaded' : "{name}: the cluster's plugin could not be installed", params: { name } } } });
      return true;
    } catch (x) { log.warn?.(`[browser] the ${what} failure notice was not filed (${x && x.message})`); return false; }
  }

  /** `<kernel> --version`, ONE child: 5 s, serviceEnv (never the hub's env), no shell. */
  function runVersion(exe) {
    return new Promise((resolve) => {
      try {
        execFile(exe, ['--version'], { timeout: versionMs, maxBuffer: 64 * 1024, encoding: 'utf8', env: serviceEnv(env()) }, (er, so, se) => resolve({ ok: !er, out: `${so || ''}\n${se || ''}`, error: er ? (er.killed ? `no answer within ${Math.round(versionMs / 1000)} s` : er.code != null ? `exited ${er.code}` : er.message) : null }));
      } catch (e) { resolve({ ok: false, out: '', error: e.message }); }
    });
  }
  /** THE MEASURED VERSION — once per kernel (the receipt's sha256; a kernel placed by hand: its size + mtime); `force` after an
   *  install. → `{ok, version, says, at, cached}` | `{ok:false, code, error}` (no kernel). */
  async function measure(id, { force = false } = {}) {
    await ready;
    const sid = String(id || '');
    let plan; try { plan = planOf(sid); } catch (e) { return { ok: false, code: e.code, error: e.message }; }
    // round 3: an aside copy beside an empty place comes back BEFORE the place is read (never while a landing owns the place)
    if (!running.has(sid)) { try { await restoreAside(sid, plan); } catch (e) { await noteFailure(sid, e, 'restore', 'first-use'); notify(); return { ok: false, code: e.code, error: e.message }; } }
    let st; try { st = await fsp.stat(plan.exe); } catch (e) { await placeEmpty(sid, e); return { ok: false, code: 'browser_engine_kernel_missing', error: `${who(sid)}'s kernel is not installed on this computer` }; }
    const receipt = await readJson(plan.receipt, 64 * 1024);
    const forKey = receipt && /^[0-9a-f]{64}$/.test(String(receipt.sha256 || '')) ? `sha256:${receipt.sha256}:${receipt.bytes}` : `stat:${st.size}:${Math.round(st.mtimeMs)}`;
    const rec = recOf(sid);
    if (!rec.kernel && !running.has(sid)) await placeHeld(sid, plan, rec); // round 4: the record follows the place again
    if (!force && rec.measured && rec.measured.for === forKey) return { ok: !!rec.measured.version, cached: true, ...rec.measured };
    if (measuring.has(sid)) return measuring.get(sid);
    const p = (async () => {
      const r = await runVersion(plan.exe);
      const v = EK.versionOf(r.out);
      rec.measured = v.version && r.ok ? { version: v.version, says: v.says, at: now(), for: forKey } : { version: null, says: v.says || null, error: r.ok ? 'it printed no version' : r.error, at: now(), for: forKey };
      await save();
      log.log?.(`[browser] ${who(sid)}'s kernel says ${rec.measured.version ? `"${rec.measured.says}" — measured ${rec.measured.version}` : `no version (${rec.measured.error})`}`);
      notify();
      return { ok: !!rec.measured.version, cached: false, ...rec.measured };
    })();
    measuring.set(sid, p);
    try { return await p; } finally { measuring.delete(sid); }
  }

  /** The kernel's place is EMPTY (ENOENT, no landing in flight) ⇒ the record holds no kernel either (round 3: the record never
   *  says «installed» over an empty place — a kernel deleted by hand, a put-back that failed). */
  async function placeEmpty(sid, e) {
    const rec = record.engines[sid];
    if (!e || e.code !== 'ENOENT' || running.has(sid) || !rec || !rec.kernel) return;
    delete rec.kernel;
    await save();
    log.warn?.(`[browser] ${who(sid)}'s kernel is not in its place — the engine record no longer says it is installed`);
    notify();
  }
  /** THE ENGINE RECORD as a surface reads it (sync, never a path): the download in flight, the installed kernel, the measured
   *  version, the last failure. */
  function kernelFact(id) {
    const sid = String(id || '');
    const r = record.engines[sid] || {}, run = running.get(sid);
    // a node refusal is a fact about THAT Node — on another one (an upgrade) it is asked again, so the record says nothing of it
    const f0 = r.failure || null, f = f0 && f0.code === 'engine_node_unsupported' && f0.node !== nodeNow ? null : f0;
    const k = r.kernel || null, mv = r.measured || null;
    return {
      state: run ? 'downloading' : k ? 'installed' : f ? 'failed' : 'absent',
      step: run ? run.step : null, bytes: run ? run.bytes : null, total: run ? run.total : null, by: run ? run.by : null,
      version: k ? k.version : null, sha256: k ? k.sha256 : null, installedAt: k ? k.installedAt : null, source: k ? k.source : null,
      measuredVersion: mv && mv.version ? mv.version : null, measuredAt: mv && mv.version ? mv.at : null, measureError: mv && !mv.version ? mv.error || null : null,
      code: !run && f ? f.code : null, error: !run && f ? f.error : null, failedAt: !run && f ? f.at : null,
      node: !run && f && f.node ? f.node : null, need: !run && f && f.need ? f.need : null,
    };
  }

  // ── THE FLEET'S PLUGIN AT BOOT (D2) ──
  /** ONE job after the listen: fleet.json names an engine plugin with a git source ⇒ install it when the registry has no such
   *  id or its recorded source / ref differs (never a re-pull of the same record); `preinstall` ⇒ its kernel right away. */
  async function bootFleet() {
    await ready;
    const restored = await bootRestore(); // round 3: an aside copy beside an empty place goes back first — no download
    const fe = fleetEngine();
    Object.assign(fleetLast, { at: now(), plugin: fe ? fe.plugin : null, outcome: null, code: null, error: null });
    if (!fe || !fe.source || !fe.source.git) { fleetLast.outcome = 'none'; return { ok: true, skipped: 'no fleet engine with a git source', restored }; }
    const l = L();
    if (!l || typeof l.install !== 'function') { fleetLast.outcome = 'none'; return { ok: false, skipped: 'no plugin loader', restored }; }
    const id = fe.plugin;
    const inst = typeof l.installRecord === 'function' ? l.installRecord(id) : null;
    const same = !!inst && inst.source === 'git' && inst.value === fe.source.git && String(inst.ref || '') === String(fe.source.ref || '');
    if (!same) {
      try {
        const r = await l.install({ source: 'git', value: fe.source.git, ref: fe.source.ref || null, credential: 'auto', by: 'fleet' });
        const got = r && r.plugin ? r.plugin.id : null;
        fleetLast.outcome = got === id ? 'installed' : 'other-id';
        log.log?.(`[plugins] the fleet's engine plugin ${id}: installed from its git source${fe.source.ref ? ' @' + fe.source.ref : ''}${got !== id ? ` — but the package is "${got}", so it was NOT trusted` : ''}`);
      } catch (e) {
        Object.assign(fleetLast, { outcome: 'failed', code: (e && e.code) || 'plugin_git_failed', error: clip(e && e.message, 400) });
        log.warn?.(`[plugins] the fleet's engine plugin ${id} could not be installed [${fleetLast.code}] — ${fleetLast.error}`);
        fileNotice(id, { what: 'plugin', code: fleetLast.code, error: fleetLast.error });
        notify();
        return { ok: false, code: fleetLast.code, error: fleetLast.error };
      }
    } else fleetLast.outcome = 'same';
    let kernel = null;
    if (fe.preinstall === true) {
      const k = kernelFact(id);
      let present = false; try { await fsp.stat(planOf(id).exe); present = true; } catch { present = false; }
      if (!present && k.state !== 'downloading') { try { kernel = await installKernel(id, { by: 'fleet', wait: true }); } catch (e) { kernel = { ok: false, code: e.code, error: e.message }; } }
      else kernel = { ok: true, present };
    }
    notify();
    return { ok: true, plugin: id, outcome: fleetLast.outcome, kernel, restored };
  }
  const fleetView = () => ({ ...fleetLast });

  return { installKernel, plannedKernel, measure, kernelFact, bootFleet, bootRestore, fleetView, ready, recordFile, _record: () => record };
}

module.exports = { create, RECORD_FILE, VERSION_MS };
