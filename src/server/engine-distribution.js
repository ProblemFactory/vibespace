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
 *   tar; lane engine-spi-egress: a kernel.json naming `tar.gz` — zlib gunzip, the same reader) judged by tarShapeVerdict BEFORE anything is written (no link, no `..`, one top folder, every requiredFiles) and the
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
 *   THE CREDENTIAL (lane kernel-asset-credential, the owner 2026-10-26: 「内核是支持文件，应该放到仓库里」): a kernel that is a
 *   release asset of the plugin's OWN repository (a private GitHub repository's `api.github.com/repos/<o>/<r>/releases/
 *   assets/<n>`) downloads with the Plugin Git credential — PURE kernelCredentialVerdict says when (the loader's install record
 *   a git source on the row's host, the URL that repository's asset); the row is read through the integration store
 *   (`resolveIntegration('plugin-git')`) at that moment, before any byte, and its token rides ONE header, `Authorization:
 *   Bearer`, on the first hop's host only: a redirect to another host (the release's file host, whose signed address refuses
 *   a second credential) drops it for good, `Accept: application/octet-stream` stays on every hop. Never in a URL, an argv,
 *   an env, a log line or the engine record. Any other URL never makes the row be read at all. ROUND 2: the credential is
 *   OPTIONAL — a row that cannot serve (the vault locked, the store unreadable, a deploy key only, a token that is not one
 *   printable line) never stops the download before a byte: it goes anonymous (a public repository answers, as before this
 *   lane), for a person and the fleet alike, and only a 401 / 403 / 404 of that anonymous try names the reason
 *   (vault_locked · kernel_credential_unusable · the store's own words); GitHub's browser form (`releases/download/…`) never
 *   gets the token — its refusal is kernel_asset_browser_form (kernel.json must name the API form). A transport error is
 *   said by its code, never its message (a library may quote the header). ROUND 3: a first use (`answer: true` — the
 *   keeper's launch) waits for the download's FIRST ANSWER, at most ANSWER_MS: the archive answering ⇒ started; a refusal at
 *   that answer (the private asset's 404 asked without a credential, a length that is not the archive's) is THROWN by name like
 *   one before any byte — so the launch says «downloading» only when bytes really flow; no answer in time ⇒ `answered: false`.
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
 *   NAMING IT AGAIN IS NEVER A POD RESTART (lane fleet-plugin-catalog, the owner 2026-11-05: 「内核不是插件吗？把内核那套放到
 *   admin 里，VibeSpace 去读它作为插件来更新和安装」): the boot job is ONE road of two — `follow(presets)` hears the presets
 *   reader's every change (the cluster Secret's fleet.json, the admin's edit, lands in ≤ ~2 min) and `fleetChanged` runs the
 *   SAME job when the merged `browserEngine` moved since the last run (or the last run failed — a credential fixed beside it).
 *   ONE run at a time per pod (`syncFleet`): a change during a run queues ONE re-run; a failed step waits for the next change
 *   or boot — never a retry loop. Every step journaled by name («fleet plugin: cluster pins <sha> — updating», «… kernel
 *   <size> — downloading»). The new pin is the loader's install at that sha (its D2 trust moves with it — the old package's
 *   lapsed the moment the pin moved). THE KERNEL FOLLOWS ITS RECEIPT: a kernel in its place whose receipt sha256 is not the one
 *   planned now (`kernelDue`: the fleet's new kernel, the plugin's new kernel.json) is downloaded by the run when `preinstall`,
 *   else at the next browser start (the keeper's launch runs the CURRENT kernel and downloads the new one beside it); a landing
 *   while a browser runs the kernel in its place (`inUse`: a process whose /proc/<pid>/exe is inside it) never swaps it under
 *   that browser — the new kernel WAITS at `.next-<tag>` (receipt inside, `rec.next`) and takes the place at the next start
 *   with no browser on the old one (`landNext`: the keeper before it launches, the fleet's run, the boot).
 *   ROUND 2 (主开发's acceptance of 88bda7ad6): NOTHING UNTRUSTED IS READ, FETCHED, RUN OR LANDED — the fleet's kernel step runs only
 *   for a package the CLUSTER trusts now (`clusterTrusts`: pinned by a full sha, installed at that sha, the loader's trust check
 *   green); an untrusted package's kernel.json is never read (kernelDue / landNext ask `trustOf` first) and installKernel refuses
 *   it (engine_untrusted) — the kernel in place stays, the panel says «waiting for your consent — its kernel is not fetched». A
 *   WAITING KERNEL LANDS ONLY WHILE IT IS THE PLANNED ONE — compared with the plan at the landing, a mismatch (the cluster pinned
 *   back) is discarded (`dropNext`: the folder removed, the record cleared, one journal line), kernelDue clears a stale one too. ONE
 *   CRITICAL SECTION per engine (`holdPlace` / `withNext` / `onPlace`): a landing waits for every start between its in-use check and
 *   its spawn (and every measure / put-back), they wait for a landing in flight — each wait bounded and said. The in-use check
 *   compares REAL paths and fails closed. Leftover `.next-*` / `.unpack-*` / `.part` the record does not name are swept at boot and
 *   at each fleet run (`sweepLeftovers`).
 *   ROUND 3 (主开发's acceptance of 8934d6ddf): ONE JUDGE AT EVERY LANDING (`landingVerdict`) — the install road (runInstall) asks
 *   it too, not only the waiting road: at the moment a download would land OR wait beside its place, the package is trusted NOW
 *   and the kernel is the one planned NOW; else the download is discarded (`discardDownload`: «… downloaded for a plan the cluster
 *   has moved away from / a package no longer trusted — discarded, never landed»), never landed, staged or measured. A START NEVER
 *   WAITS FOR A LANDING THAT CANNOT HAPPEN: a landing first asks whether it is POSSIBLE (a start holding the place — a browser
 *   starting — or a program from it ⇒ not now, at once, no line); a landing never waits for a start; a start (`beforeStart`: the
 *   waiting kernel's landing, then its hold) waits only for a landing IN PROGRESS, bounded ONCE for its whole ask (landWaitMs,
 *   never per stage or per queued caller) and said (one journal line; the engine card «waiting for the new kernel to land (≤ 30
 *   s)» meanwhile). Only ENOENT is «gone»: a waiting kernel whose receipt cannot be read now (EACCES / EIO / ESTALE / EMFILE) is
 *   kept, said once, asked again. A cluster repository holding ANOTHER plugin id says so as itself (never the consent words).
 *   ROUND 4 (主开发's acceptance of f4a3a002e): THE JUDGE IS ASKED LAST — inside the landing's section, after every await of its
 *   own (the in-use scan, the put-back, the clean-up): before anything moves, and again with the previous kernel aside, its sync
 *   half (`judgeNow`: trust NOW, the plan's inputs in memory unmoved since the plan was read) in the SAME turn as the rename that
 *   puts the new kernel in its place; refused ⇒ the previous kernel goes back, nothing landed, nothing run. The staging asks it
 *   last too. The cluster's install of the package (its plan, its trust) holds the same ONE writer queue (`planWrite`) — no
 *   landing is judged or renamed while it runs, a start meanwhile is answered «not now» at once. The MEASURE runs the kernel
 *   (`--version`, a re-exec) only for a package trusted NOW. A plan that cannot be read now (anything but ENOENT) is a transient on
 *   the install road too: the verified download is KEPT beside the place (never landed), said once, one fleet re-run queued. A
 *   DISCARD LEAVES A TRACE: the record's last outcome (`discarded`), the engine card's words, ONE For-you notice when nobody
 *   watched. The boot line says «kernel ready» only for a kernel in its place (due / waiting / discarded / your consent: each its
 *   own words).
 *   ROUND 5 (主开发's acceptance of cf33c614c): a REFUSED STAGING KEEPS WHAT WAITS — the staging asks the judge FIRST (nothing beside
 *   the place touched yet), then moves the kernel already waiting ASIDE (never deleted before the judge's last word) and asks again
 *   in the rename's own turn; refused ⇒ the waiting kernel goes back with its record, only the new download is discarded (the card
 *   says both). A START IS REFUSED ONLY WHILE THE PLACE IS NOT WHOLE (`torn`: from the first rename until a kernel is whole in it
 *   again) — the clean-up of the previous kernel is not that window, a start past its bound goes on beside it; one past its bound
 *   BEFORE anything moved holds the place whole, and the landing (asked in the turn that would mark the place torn) never moves a
 *   held place — the new kernel waits beside it. A START NEVER WAITS BEHIND A GIT CLONE: an ask entering the writer queue while a
 *   plan write runs (one that began during the in-use scan too) is «not now» at once — no wait, no landing words.
 *   ROUND 6 (主开发's acceptance of 7f96d8357): A LANDING ASKS ITS WHOLE QUESTION IN THE TURN IT MOVES — `placeBusy` (a hold, a
 *   program running from the place, a hold TAKEN while the scan ran), asked by onPlace and again by landDir after its last await:
 *   a start that spawned past its bound and dropped its hold is seen running, nothing moves. EVERY RENAME OF THE PLACE IS THE
 *   NOT-WHOLE WINDOW (`torn` counts them) — the put-back of an aside kernel into the empty place too. A COPY THE RECORD NAMES IS
 *   NEVER A LEFTOVER: a waiting kernel a stop left as `.next-<tag>.prev` is put back (healAside — the sweep, the staging, landNext),
 *   else the record stops naming it in the same run (`lost`: the discard on the card, kernelDue due again).
 *   ROUND 7 (主开发's acceptance of 33d0d0f21): «UNREADABLE» IS A THIRD ANSWER — healAside answers restored | gone (ENOENT, the
 *   only fact) | unknown (any other error), and on «unknown» nothing moves and nothing is recorded: the sweep keeps every name the
 *   record could name (`.next-<tag>` and `.next-<tag>.prev` while it names a waiting kernel), landNext keeps rec.next, stageNext
 *   sets nothing beside it (the download stays where it is); said once. THE NOT-WHOLE WINDOW OPENS WHEN A PUT-BACK IS ASKED — counted
 *   by restoreAside before the put-back's first await, ended when it settles, finds nothing aside or finds a kernel in its place
 *   (a stat that hangs is a rename that hangs).
 *   ROUND 8 (主开发's acceptance of f0adfe02b): THE PUT-BACK GIVES THREE ANSWERS TOO — restored | none (nothing aside, or a kernel
 *   in its place) | unknown (a stat that answered anything but ENOENT); on «unknown» a landing moves NOTHING and deletes NOTHING —
 *   the previous kernel's copy beside the empty place is never removed unrestored (the new kernel waits beside it), said once.
 *   THE SWEEP KEEPS A NAME ONLY WHILE IT CANNOT TELL — `.next-<tag>.prev` stays while healAside answers unknown; a duplicate it
 *   read is removed as before r7. AN UNKNOWN IS SAID WHERE THE PERSON LOOKS — the card's waiting kernel says it could not be read
 *   (kernelFact `next.unread`), and a person's download beside an unreadable copy is set in the free slot (the copy stays until
 *   the sweep finds the new one whole).
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
const ANSWER_MS = 10000;
const LAND_WAIT_MS = 30000;    // lane fleet-plugin-catalog r2 (N3) / r3 (N2): a start's WHOLE ask (the waiting kernel's landing + its hold), a measure, a put-back waits at most this — ONCE — for a landing in progress (a landing never waits for a start)
const LAUNCH_HOLD_MS = 120000; // … a start's hold ends at its spawn — or after this, whatever happens to the start
const MANIFEST_MAX = 256 * 1024;
const UNPACKED_MAX = 17 * 1024 * 1024 * 1024;
const clip = (s, n = 200) => String(s == null ? '' : s).replace(/[\0-\x1f\x7f]/g, ' ').slice(0, n);
const named = (code, error, extra = {}) => Object.assign(new Error(String(error)), { code, ...extra });

function create({ dataDir, engines = null, loader = null, fleetFacts = () => null, fetchImpl = (...a) => globalThis.fetch(...a), resolveUrl = null, platform = process.platform, arch = process.arch,
  env = () => process.env, userTodos = null, notify = () => {}, log = console, now = () => Date.now(), stallMs = STALL_MS, answerMs = ANSWER_MS, versionMs = VERSION_MS, freeOf: freeOfIn = null,
  zlib: zlibIn = zlib, nodeVersion = process.versions.node, io: ioIn = null, integrations = null, kernelInUse = null, landWaitMs = LAND_WAIT_MS } = {}) {
  // the file doors a suite bends (a write that fails, a rename that fails; lane fleet-plugin-catalog r2: the in-use check's /proc
  // reads + the place's real path, a leftover sweep's listing) — the real fs otherwise
  const io = { createWriteStream: (f, o) => fs.createWriteStream(f, o), rename: (a, b) => fsp.rename(a, b), stat: (f) => fsp.stat(f), readdir: (d) => fsp.readdir(d), readlink: (f) => fsp.readlink(f), realpath: (f) => fsp.realpath(f), readFile: (f) => fsp.readFile(f), rm: (f, o) => fsp.rm(f, o), ...(ioIn || {}) };
  const nodeNow = String(nodeVersion || '');
  const unpackFacts = () => ({ zstd: !!zlibIn && typeof zlibIn.createZstdDecompress === 'function', node: nodeNow });
  const R = () => { try { return typeof engines === 'function' ? engines() : engines; } catch { return null; } };
  const L = () => { try { return typeof loader === 'function' ? loader() : loader; } catch { return null; } };
  const T = () => { try { return typeof userTodos === 'function' ? userTodos() : userTodos; } catch { return null; } };
  const I = () => { try { return typeof integrations === 'function' ? integrations() : integrations; } catch { return null; } };
  const recordFile = path.join(String(dataDir || '.'), RECORD_FILE);
  let record = { v: 1, engines: {} };
  const ready = (async () => { try { const j = JSON.parse(await fsp.readFile(recordFile, 'utf8')); if (j && typeof j === 'object' && j.engines && typeof j.engines === 'object') record = { v: 1, engines: j.engines }; } catch { /* none yet */ } })();
  let saving = Promise.resolve();
  const save = () => (saving = saving.then(async () => { const tmp = `${recordFile}.${process.pid}.tmp`; await fsp.mkdir(path.dirname(recordFile), { recursive: true }); await fsp.writeFile(tmp, JSON.stringify(record, null, 1), { mode: 0o600 }); await fsp.rename(tmp, recordFile); }).catch((e) => log.warn?.(`[browser] the engine record could not be written (${e && e.message})`)));
  const recOf = (id) => (record.engines[id] = record.engines[id] || {});
  const running = new Map();   // id → the download in flight {step, bytes, total, startedAt, by, abort}
  const measuring = new Map();
  const userKernelSaid = new Set(); // L1b r2: an owner's-program engine whose record holds a downloaded kernel — said ONCE per hub life
  const restoring = new Map(); // id → the put-back in flight (one at a time: installKernel, measure and the boot may all ask)
  const asked = new Map(); // r7 (p2): id → the not-whole count its put-back in flight holds (restoreAside takes it; putBack may end it early)
  const fleetLast = { at: null, outcome: null, code: null, error: null, plugin: null, why: null, ref: null, from: null, to: null, kernel: null, got: null };
  // lane fleet-plugin-catalog r2 (N3): ONE critical section per engine — a LANDING (an install's, a waiting kernel's) holds the place
  // alone; a START (the keeper from its in-use check to its spawn), a MEASURE, a PUT-BACK hold it shared; one writer of rec.next
  const gates = new Map(); // id → { holds, landing, tail, writers, waiting (r3: the asks waiting for a landing in progress — the card's words), planning (r4: the cluster's install of the package in flight) }
  const gateOf = (sid) => { let g = gates.get(sid); if (!g) { g = { holds: 0, landing: null, tail: Promise.resolve(), writers: 0, waiting: 0, planning: 0, torn: 0, taken: 0, askers: new Map(), lastAsker: null }; gates.set(sid, g); } return g; };
  /** r7 (p2): ONE count of the not-whole window (`torn`) — taken now, ended once (`end` is idempotent). */
  const notWhole = (sid) => { const g = gateOf(sid); g.torn++; let open = true; return { end: () => { if (open) { open = false; g.torn = Math.max(0, g.torn - 1); } } }; };
  const within = (p, ms) => new Promise((r) => { const t = setTimeout(() => r(false), Math.max(0, ms)); if (t.unref) t.unref(); p.then(() => { clearTimeout(t); r(true); }, () => { clearTimeout(t); r(true); }); });
  const secs = (ms) => +(ms / 1000).toFixed(1);
  const LATE = Symbol('late'); // r3 (N2): an ask whose bound passed in the writer queue — it ran nothing
  const saidRead = new Map(); // r3 (N3): id → the read error a waiting kernel's receipt answered (said once until it reads again)
  const saidAside = new Map(); // r7 (p1): id → the error the waiting kernel's copy beside its place answered (said once until it reads again); r8 (s1): `<id>\0place` → the put-back's
  /** r8 (s3): the error the waiting kernel answered when it was last read (its copy beside the place, or its receipt) — null once it reads. */
  const unreadNext = (sid) => saidAside.get(sid) || saidRead.get(sid) || null;
  const untrustedRunSaid = new Set(); // r4 (N1): id → a measure refused for a package not trusted now (said once until one runs)
  const labelOf = (id) => { try { const p = (L() && L().list ? L().list() : []).find((x) => x.id === id); return p && p.label ? String(p.label) : ''; } catch { return ''; } };
  const pluginVersionOf = (id) => { try { const p = (L() && L().list ? L().list() : []).find((x) => x.id === id); return p && p.version ? String(p.version) : null; } catch { return null; } };
  const who = (id) => BE.engineWords({ id, label: labelOf(id) });
  const fleetEngine = () => { try { const f = fleetFacts(); return f && f.browserEngine && typeof f.browserEngine === 'object' ? f.browserEngine : null; } catch { return null; } };
  // the fleet's kernel as it names it — a field it names is merged over the package's (never dropped for it: kernelManifestVerdict)
  const fleetKernelFor = (id) => { const fe = fleetEngine(); return fe && fe.plugin === id && fe.kernel && (fe.kernel.url || fe.kernel.sha256) ? { url: fe.kernel.url || '', sha256: fe.kernel.sha256 || '' } : null; };
  /** lane fleet-plugin-catalog r2 (N1, D2 whole): the package is TRUSTED now — a person's consent, or the cluster's pin at that very
   *  sha (the loader's verdict, asked at each use) → true | false | null (no loader to ask). Untrusted ⇒ its kernel.json is never
   *  read, its kernel never fetched, run or landed. */
  const trustOf = (sid) => { try { const l = L(); if (l && typeof l.isTrusted === 'function') return !!l.isTrusted(sid); const p = l && typeof l.list === 'function' ? l.list().find((x) => x.id === sid) : null; return p && typeof p.trusted === 'boolean' ? p.trusted : null; } catch { return null; } };
  /** …and the CLUSTER trusts it now (the fleet's kernel step runs for no other): fleet.json names this id at a full commit sha, the
   *  package is installed from git at that sha, and the loader's trust check is green (D2: id + sha + contentHash — the cluster's
   *  pre-trust, or the owner's consent to that very package). */
  /** Round 4 (N1): the plan's inputs as MEMORY holds them now — the fleet's kernel override, the package's install record, its
   *  version — compared in the same turn as a landing's rename with what they were when the plan was read from the disk. */
  const planKeyOf = (sid) => { let inst = null; try { const l = L(); inst = l && typeof l.installRecord === 'function' ? l.installRecord(sid) : null; } catch { inst = null; } return JSON.stringify([fleetKernelFor(sid), inst ? [inst.source || null, inst.value || null, inst.ref || null, inst.sha || null, inst.contentHash || null] : null, pluginVersionOf(sid)]); };
  const clusterTrusts = (sid) => { try { const fe = fleetEngine(), l = L(); const ref = fe && fe.source ? String(fe.source.ref || '') : ''; if (!fe || fe.plugin !== sid || !/^[0-9a-f]{40}$/.test(ref) || !l) return false; const inst = typeof l.installRecord === 'function' ? l.installRecord(sid) : null; return !!(inst && inst.source === 'git' && inst.sha === ref && trustOf(sid) === true); } catch { return false; } };
  /** The kernel's plan; `unpack` (an install's) = the Node it unpacks on — no zstd ⇒ engine_node_unsupported, by name (a
   *  tar.gz `format` needs none). */
  function planOf(id, { unpack = null, format = null } = {}) {
    const r = R();
    const kp = r && typeof r.kernelPath === 'function' ? r.kernelPath(id) : null;
    const plan = EK.kernelPlan({ kernelPath: kp, unpack, format });
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
  /** Round 4 (N3): `strict` (the landing's judge — through `io`, a suite bends it): only ENOENT / ENOTDIR is «none»; any other answer
   *  of the disk (EACCES, EIO, ESTALE, EMFILE on a PVC) is a TRANSIENT, thrown as such (`transient`) — never «no kernel.json». */
  async function readJson(file, max = MANIFEST_MAX, { strict = false } = {}) {
    if (strict) {
      const unread = (e) => named('kernel_plan_unread', `its ${path.basename(file)} could not be read now (${(e && e.code) || (e && e.message)})`, { transient: true });
      let st; try { st = await io.stat(file); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return null; throw unread(e); }
      if (!st.isFile() || st.size > max) return null;
      let txt; try { txt = String(await io.readFile(file)); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return null; throw unread(e); }
      try { return JSON.parse(txt); } catch { return undefined; }
    }
    let st; try { st = await fsp.stat(file); } catch { return null; }
    if (!st.isFile() || st.size > max) return null;
    try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return undefined; }
  }
  /** The package's kernel.json (the installed copy under data/plugins/<id>/). */
  async function manifestDoc(id, { strict = false } = {}) {
    const doc = await readJson(path.join(String(dataDir || '.'), 'plugins', id, EK.KERNEL_FILE), MANIFEST_MAX, { strict });
    if (doc === null) throw named('browser_engine_protocol', `${who(id)}'s package has no ${EK.KERNEL_FILE} — VibeSpace cannot download its kernel (the plugin must name its artifact)`, { none: true });
    if (doc === undefined) throw named('browser_engine_protocol', `${who(id)}'s ${EK.KERNEL_FILE} is not JSON`);
    return doc;
  }
  /** The artifact this machine would download — the facts a card shows before any byte moves (`{version, bytes, host, source}`). */
  async function plannedKernel(id, { strict = false } = {}) {
    await ready;
    const plan = planOf(id);
    const m = EK.kernelManifestVerdict(await manifestDoc(id, { strict }), { tag: plan.tag, fleet: fleetKernelFor(id), id, label: labelOf(id) });
    if (!m.ok) throw named(m.code, m.error);
    return { version: m.version, bytes: m.bytes, host: m.host, source: m.source, sha256: m.sha256 };
  }

  // lane kernel-asset-credential round 2: the door a refused credential names, and the locked vault's words (the vault-words
  // census: a person is told WHERE to unlock and that For you names it)
  const INTEGRATIONS_DOOR = ' (Integrations → Plugins → Plugin Git repository)';
  const CREDENTIAL_SEALED = 'the Plugin Git credential is sealed in the locked vault — unlock it and try again (Unlock… at the top of the page; For you names what is waiting on it)';
  /** THE CREDENTIAL'S ROAD for this download (lane kernel-asset-credential) — BEFORE any byte: PURE kernelCredentialVerdict over
   *  the loader's install record and the plugin-git row's host. A URL that is not the plugin repository's own asset — or is
   *  GitHub's browser form, which serves a session and never a token — never reads the row. The row is read through the
   *  integration store NOW (never kept). ROUND 2: the credential is OPTIONAL — a row that cannot serve this download (the
   *  vault locked, the store unreadable, undecryptable, none / for another host, a deploy key only, a token that is not one
   *  printable line) never stops it: it goes anonymous (a public repository answers) and `without` keeps the reason —
   *  `{code, why, door}` — said only when the anonymous try is refused (refusalOf). A person's download, a first use and the
   *  fleet's boot job alike. → `{road, token, without}` (the token only when it rides). */
  function credentialOf(sid, url) {
    let inst = null; try { const l = L(); inst = l && typeof l.installRecord === 'function' ? l.installRecord(sid) : null; } catch { inst = null; }
    const pre = EK.kernelCredentialVerdict({ kernelUrl: url, install: inst, integration: null });
    if (!pre.asset || pre.form === 'browser') return { road: pre, token: null, without: null };
    const anon = (road, code, why, door = INTEGRATIONS_DOOR) => ({ road, token: null, without: { code, why, door } });
    const store = I();
    let r = null, unread = null;
    if (!store || typeof store.resolveIntegration !== 'function') return anon(pre, 'build_fetch_failed', 'this instance has no integration store', '');
    try { r = store.resolveIntegration('plugin-git'); } catch (e) { unread = clip(String((e && (e.message || e.code)) || e).replace(/\s+/g, ' '), 160) || 'it threw'; }
    if (!unread && r && r.source === 'none' && r.whyCode === 'store-unreadable') unread = clip(r.why, 160) || 'store-unreadable';
    if (unread) return anon(pre, 'build_fetch_failed', `the Integrations store could not be read (${unread})`);
    if (r && r.source === 'none' && r.whyCode === 'vault-locked') return anon(pre, 'vault_locked', CREDENTIAL_SEALED, '');
    if (r && r.source === 'none' && r.whyCode === 'undecryptable') return anon(pre, 'kernel_credential_unusable', `the Plugin Git credential cannot be read (${clip(r.why, 160)})`);
    const v = r && r.source !== 'none' && r.values ? r.values : {};
    const road = EK.kernelCredentialVerdict({ kernelUrl: url, install: inst, integration: v.host ? { host: v.host } : null });
    if (!road.use) return anon(road, 'build_fetch_failed', road.why === 'credential-other-host' ? 'the Plugin Git credential is for another git host' : 'no Plugin Git credential is set');
    const token = v.token == null ? '' : String(v.token).trim(), off = { ...road, use: false, host: null };
    if (!token) return anon({ ...off, why: 'no-token' }, 'kernel_credential_unusable', v.deployKey ? 'the Plugin Git credential is a deploy key; a release asset needs a token' : 'the Plugin Git credential holds no access token; a release asset needs one');
    // round 2: a token is ONE printable line — a control character would make the header itself throw, and that error quote it
    if (!/^[\x21-\x7e]{1,4096}$/.test(token)) return anon({ ...off, why: 'token-unprintable' }, 'kernel_credential_unusable', "the Plugin Git credential's token is not one printable line (a space, a line break or a control character is in it)");
    return { road, token, without: null };
  }

  // ── THE FETCH: https only, every redirect hop https (the sha256 is the authenticity), the stall bound ──
  // lane kernel-asset-credential round 2: a transport error is said by its CODE (ECONNREFUSED, UND_ERR_…) or its kind
  // (TypeError) — never its message: a library may quote a request header in it (undici quotes an invalid header value whole)
  const transportWhy = (e) => { const c = String((e && e.cause && e.cause.code) || (e && e.code) || ''); if (/^[A-Z][A-Z0-9_]{1,40}$/.test(c)) return c; const n = String((e && e.name) || ''); return /^[A-Za-z]{1,40}$/.test(n) ? n : 'error'; };
  // lane kernel-asset-credential: `auth` = {host, token} — the token rides the FIRST hop's host only; a hop to another host
  // drops it for good (a signed blob address refuses a second credential), Accept stays on every hop
  async function kernelFetch(url, { signal, hops = 3, auth = null } = {}) {
    let u = String(url || '');
    let carry = !!(auth && auth.token);
    const bound = carry ? String(auth.host).toLowerCase().replace(/:443$/, '') : null;
    for (let i = 0; i <= hops; i++) {
      const x = EK.httpsUrlOf(u);
      if (!x) throw named('build_fetch_failed', `the kernel's download is not an https address (${clip(u, 120)}) — nothing was fetched from it`);
      if (carry && x.host.replace(/:443$/, '') !== bound) carry = false;
      const headers = { 'user-agent': 'vibespace-kernel-download', accept: 'application/octet-stream' };
      if (carry) headers.authorization = `Bearer ${auth.token}`;
      let res;
      try { res = await fetchImpl(resolveUrl ? resolveUrl(x.url) : x.url, { redirect: 'manual', signal, headers }); }
      catch (e) { if (signal && signal.aborted) throw named('build_fetch_failed', `the download from ${x.host} stalled (no byte for ${Math.round(stallMs / 1000)} s)`); throw named('build_fetch_failed', `${x.host} could not be reached (${transportWhy(e)})`); }
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (loc) { try { await res.body?.cancel(); } catch { /* none */ } try { u = new URL(loc, x.url).href; } catch { throw named('build_fetch_failed', `${x.host} redirected to a bad location`); } continue; }
      return { res, host: x.host, carried: carry };
    }
    throw named('build_fetch_failed', `more than ${hops} redirects from ${clip(url, 120)}`);
  }
  /** One pass over the archive: the zstd (or gzip — kernel.json's `format`) stream → the tar reader → `onEvent` (awaited: the
   *  file writes push back). */
  async function tarPass(file, onEvent, format = 'tar.zst') {
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
    const gz = format === 'tar.gz';
    try { await pipeline(fs.createReadStream(file), gz ? zlib.createGunzip() : zlibIn.createZstdDecompress(), sink); }
    catch (e) { if (e && /^(?:build_[a-z_]+|disk)$/.test(String(e.code || ''))) throw e; throw named('build_unpack_failed', `the kernel archive is not a readable ${gz ? 'tar.gz' : 'tar.zst'} (${clip(e && e.message, 160)})`); }
    const end = parser.end();
    if (!end.ok) throw named('build_unpack_failed', `the kernel archive is not a whole tar: ${end.why}`);
  }
  const dropPartials = async (plan) => { await fsp.rm(plan.part, { force: true }).catch(() => {}); await fsp.rm(plan.unpackDir, { recursive: true, force: true }).catch(() => {}); };

  /**
   * DOWNLOAD a kernel into its place. The refusals before any byte (no place, one already running, kernel.json, the two hard
   * rows) are THROWN; the rest runs on (`wait: true` awaits it — the boot job and the suites) and is said through `kernelFact`.
   * `by`: 'user' (a person's click — the card shows it) | 'fleet' (the boot job) | 'first-use' (a launch found it absent).
   * `answer` (round 3 of lane kernel-asset-credential — the keeper's first use): wait for the download's FIRST ANSWER (at most
   * `answerMs`) — the archive answering ⇒ `{started: true}`; a refusal at that answer is thrown by name; none in time ⇒
   * `{started: true, answered: false}`.
   */
  async function installKernel(id, { by = 'user', wait = false, answer = false } = {}) {
    await ready;
    const sid = String(id || '');
    if (!BE.ID_RE.test(sid)) throw named('browser_engine_missing', `"${clip(sid, 80)}" is not a browser engine plugin id`);
    if (userSourced(sid)) throw named('engine_source_user', `${who(sid)} runs the program you name in its settings (⚙ → Plugins → Program file) — VibeSpace downloads no kernel for it`); // lane engine-spi-egress L1b
    if (trustOf(sid) === false) throw named('engine_untrusted', `${who(sid)} is waiting for your consent (⚙ → Plugins) — its kernel is not fetched until you trust it`); // lane fleet-plugin-catalog r2 (N1): D2 whole — nothing read, nothing recorded
    const plan = planOf(sid);
    if (running.has(sid)) { const r0 = running.get(sid); throw named('install_running', `${who(sid)}'s kernel is already downloading (${r0.total ? Math.floor((100 * r0.bytes) / r0.total) + ' %' : r0.step}) — one at a time`); }
    const st = { step: 'restore', bytes: 0, total: null, startedAt: now(), by, abort: new AbortController() };
    running.set(sid, st);
    let m, fr, cr = null;
    try {
      // round 3: an aside copy beside an empty place (a landing stopped between its renames) comes BACK first — a first use or
      // the fleet's boot then needs no download; one that cannot be put back is refused by name (engine_kernel_aside)
      const rel0 = await holdPlace(sid, { leaseMs: 0, ask: askOf('a download') }); // r2 (N3): never beside a landing in flight
      let back0 = null; try { back0 = await restoreAside(sid, plan); } finally { rel0(); }
      if (back0 && back0.restored && by !== 'user') { running.delete(sid); notify(); return { ok: true, restored: true, id: sid }; }
      // the Node it would unpack on (round 2): no zstd ⇒ refused by name before any byte moves, remembered for this Node —
      // lane engine-spi-egress r2: kernel.json is read and judged FIRST (its format decides whether zstd is needed at all — a tar.gz
      // unpacks on every Node); a kernel.json fault is said as itself, never recorded as engine_node_unsupported
      st.step = 'plan';
      const doc = await manifestDoc(sid);
      const m0 = EK.kernelManifestVerdict(doc, { tag: plan.tag, fleet: fleetKernelFor(sid), id: sid, label: labelOf(sid) });
      if (!m0.ok && m0.code === 'browser_engine_protocol') throw named(m0.code, m0.error);
      planOf(sid, { unpack: unpackFacts(), format: m0.ok ? m0.layout.archiveFormat : EK.archiveFormatOf(doc, plan.tag) });
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
      // lane kernel-asset-credential: the credential's road (and its refusals) before any byte
      cr = credentialOf(sid, m.url);
      st.credential = cr.road.use ? 'plugin-git' : null;
    } catch (e) { running.delete(sid); if (!e || e.code !== 'engine_kernel_landing') await noteFailure(sid, e, st.step, by); throw e; } // r4: a landing in progress is not a failure of this download — refused by name, nothing recorded
    st.total = m.bytes;
    log.log?.(`[browser] downloading ${who(sid)}'s kernel ${m.version} (${m.bytes || '?'} bytes) from ${m.host} into ${plan.targetDir} (${by}; ${m.source === 'fleet' ? 'the fleet\'s artifact' : 'its kernel.json'}${cr.road.use ? '; a release asset of its plugin\'s repository, with the Plugin Git credential' : ''})`);
    notify();
    const auth = cr.token ? { host: cr.road.host, token: cr.token } : null;
    let answered = () => {};
    const first = new Promise((r) => { answered = r; });
    const job = runInstall(sid, plan, m, st, { auth, road: cr.road, without: cr.without, onAnswer: () => answered({ ok: true }) }).then(async (out) => { running.delete(sid); notify(); answered({ ok: true }); return out; }, async (e) => { running.delete(sid); await dropPartials(plan); await noteFailure(sid, e, st.step, by, st.credential); notify(); answered({ error: e }); throw e; });
    if (wait) return job;
    job.catch(() => {}); // said through kernelFact + the journal (+ For-you when nobody watched)
    const out = { ok: true, started: true, id: sid, version: m.version, bytes: m.bytes, host: m.host };
    if (!answer) return out;
    // round 3: «downloading» only when the archive answered — a refusal at the first answer is the caller's, by name
    let late = null;
    const a = await Promise.race([first, new Promise((r) => { late = setTimeout(() => r(null), answerMs); if (late.unref) late.unref(); })]);
    clearTimeout(late);
    if (!a) return { ...out, answered: false };
    if (a.error) throw a.error;
    return out;
  }
  /** lane kernel-asset-credential: a refusal (401 / 403 / 404) of the plugin repository's own asset, said with its road → the
   *  error to throw. Round 2: GitHub's browser form ⇒ kernel_asset_browser_form (kernel.json must name the API form — the token
   *  is never sent there); asked without a credential ⇒ the reason under its own code (`without`: vault_locked ·
   *  kernel_credential_unusable · build_fetch_failed). */
  function refusalOf(g, sid, m, road, without) {
    const head = `${g.host} answered ${g.res.status} for ${who(sid)}'s kernel ${m.version}`;
    if (![401, 403, 404].includes(g.res.status) || !road || !road.asset) return named('build_fetch_failed', head);
    const repo = `${road.repository.host}/${road.repository.path}`;
    if (road.form === 'browser') return named('kernel_asset_browser_form', `${head} — the plugin's kernel.json names the browser download form (github.com/${road.repository.path}/releases/download/…); a private repository's asset needs the API form (api.github.com/repos/${road.repository.path}/releases/assets/<id>) — tell the plugin's author`);
    if (g.carried) return named('build_fetch_failed', `${head} with the Plugin Git credential — its token cannot read ${repo}'s release assets${INTEGRATIONS_DOOR}`);
    if (!without) return named('build_fetch_failed', head);
    return named(without.code, `${head} — it is a release asset of its plugin's own repository (${repo}), asked without a credential: ${without.why}${without.door}`);
  }
  async function runInstall(sid, plan, m, st, { auth = null, road = null, without = null, onAnswer = null } = {}) {
    await withNext(sid, async () => {}); // lane fleet-plugin-catalog r2 (N5): a leftover sweep in flight ends before this download writes its .part / .unpack-<tag>
    // ① FETCH → .part, hashed as it lands
    st.step = 'fetch';
    await fsp.rm(plan.part, { force: true }).catch(() => {});
    let stall = null;
    const kick = () => { clearTimeout(stall); stall = setTimeout(() => { try { st.abort.abort(); } catch { /* none */ } }, stallMs); if (stall.unref) stall.unref(); };
    kick();
    const h = crypto.createHash('sha256');
    let out = null, got = 0;
    try {
      const g = await kernelFetch(m.url, { signal: st.abort.signal, auth });
      if (!g.res.ok) throw refusalOf(g, sid, m, road, without);
      const len = Number(g.res.headers.get('content-length'));
      if (m.bytes != null && Number.isFinite(len) && len > 0 && len !== m.bytes) throw named('build_verify_failed', `${g.host} announces ${len} bytes, ${EK.KERNEL_FILE} says ${m.bytes} — not the declared archive; nothing was kept`);
      const cap = m.bytes != null ? m.bytes : Number.isFinite(len) && len > 0 ? len : EK.BYTES_MAX;
      st.total = m.bytes != null ? m.bytes : Number.isFinite(len) && len > 0 ? len : null;
      if (onAnswer) onAnswer(); // round 3: the archive answered — the download really started
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
      if (e && /^(?:build_[a-z_]+|disk|vault_locked|kernel_credential_unusable|kernel_asset_browser_form)$/.test(String(e.code || ''))) throw e;
      if (st.abort.signal.aborted) throw named('build_fetch_failed', `the download stalled (no byte for ${Math.round(stallMs / 1000)} s) — nothing was kept`);
      throw named('build_fetch_failed', `the download of ${who(sid)}'s kernel failed (${transportWhy(e)})`);
    } finally { clearTimeout(stall); if (out) { try { out.destroy(); } catch { /* none */ } } }
    // ② VERIFY the archive: its length and its sha256 against the manifest's
    st.step = 'verify'; notify();
    if (m.bytes != null && got !== m.bytes) throw named('build_verify_failed', `${got} of the ${m.bytes} bytes arrived — nothing was kept`);
    const sha = h.digest('hex');
    if (sha !== m.sha256) throw named('build_verify_failed', `the archive's sha256 ${sha} is not the declared ${m.sha256} — nothing was unpacked`);
    // ③ LIST: the archive's shape judged before anything is written, and what it unpacks to against the disk now
    st.step = 'list'; notify();
    const listed = [];
    await tarPass(plan.part, async (ev) => { if (ev.type === 'entry') { listed.push(ev.entry); if (listed.length > EK.ENTRIES_MAX) throw named('build_unpack_failed', `the kernel archive has more than ${EK.ENTRIES_MAX} entries`); } }, m.layout.archiveFormat);
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
      }, m.layout.archiveFormat);
    } finally { if (ws) { try { ws.destroy(); } catch { /* none */ } } }
    for (const f of m.layout.requiredFiles) { let s = null; try { s = await fsp.stat(path.join(plan.unpackDir, ...f.split('/'))); } catch { s = null; } if (!s || !s.isFile()) throw named('build_verify_failed', `the unpacked kernel has no ${f} — nothing was placed`); }
    const exeStat = await fsp.stat(path.join(plan.unpackDir, EK.BINARY));
    if (!(exeStat.mode & 0o100)) throw named('build_verify_failed', `the unpacked kernel's ${EK.BINARY} is not executable — nothing was placed`);
    // ⑤ THE RECEIPT beside chrome, then ONE rename into the kernel's place
    st.step = 'land'; notify();
    const receipt = EK.receiptOf({ sha256: sha, bytes: exeStat.size, verifiedAt: now(), version: m.version, archiveBytes: got, binarySha256: bin && binBytes === exeStat.size ? bin.digest('hex') : null });
    await fsp.writeFile(path.join(plan.unpackDir, EK.RECEIPT_FILE), JSON.stringify(receipt, null, 1), { mode: 0o644 });
    const kfact = { version: m.version, sha256: sha, archiveBytes: got, bytes: exeStat.size, host: m.host, source: m.source, by: st.by, credential: st.credential || null };
    // lane fleet-plugin-catalog: a browser runs the kernel in its place ⇒ the new one WAITS beside it for the next browser start;
    // round 2 (N3): the landing is ONE critical section with every start, measure and put-back of this engine (onPlace);
    // round 3 (N1): judged NOW by the ONE judge the waiting road asks too — the package trusted, the kernel the planned one — before
    // it lands OR waits beside the place; a mismatch ⇒ discarded, never landed, staged or measured. (N2): a start holding the place
    // or a program from it ⇒ it waits beside the place at once (a landing never waits for a start). Round 4 (N1): asked again LAST,
    // inside the section (landDir / stageNext) — the verdict above only spares a refused download the in-use scan; (N3) a plan that
    // cannot be read now KEEPS the verified download beside the place (never landed)
    const settledAs = await withNext(sid, async () => {
      const lv = await landingVerdict(sid, sha);
      if (!lv.ok && lv.why !== 'unread') return discardDownload(sid, plan, kfact, lv);
      const out = !lv.ok ? await stageNext(sid, plan, kfact, shape, { unread: lv }) : await onPlace(sid, plan, async (free, busy) => {
        if (!free) return stageNext(sid, plan, kfact, shape, { because: busy });
        const no = await landDir(sid, plan, plan.unpackDir, sha);
        if (no) return no.why === 'unread' ? stageNext(sid, plan, kfact, shape, { unread: no }) : no.why === 'moved' || no.why === 'held' || no.why === 'unknown' ? stageNext(sid, plan, kfact, shape, { because: no.why === 'held' ? no.by : no.why === 'unknown' ? `its place could not be read now (${no.code})` : 'its plan changed as it took its place (judged again: still the planned one)' }) : { refused: no }; // moved in the rename's own turn ⇒ judged afresh beside the place; r5 (m2): a start holds the place ⇒ it waits beside it (r6: said as which)
        await fsp.rm(plan.part, { force: true }).catch(() => {});
        const rec = recOf(sid);
        rec.kernel = { ...kfact, installedAt: now() };
        delete rec.failure; delete rec.discarded;
        if (rec.next) { delete rec.next; await fsp.rm(plan.nextDir, { recursive: true, force: true }).catch(() => {}); } // a kernel that waited is not the one planned any more
        await save();
        return null;
      });
      return out && out.refused ? discardDownload(sid, plan, kfact, out.refused) : out;
    });
    if (settledAs) return settledAs;
    log.log?.(`[browser] ${who(sid)}'s kernel ${m.version} is installed (sha256 ${sha.slice(0, 12)}…, verified; ${shape.files} files)`);
    // ⑥ THE MEASURED VERSION, once, right after the install
    const mv = await measure(sid, { force: true });
    return { ok: true, id: sid, version: m.version, sha256: sha, bytes: got, files: shape.files, measuredVersion: mv && mv.version ? mv.version : null };
  }
  /** ONE landing: `fromDir` (an install's `.unpack-<tag>`, a waiting `.next-<tag>`) takes the kernel's place — the previous one
   *  moved aside first and deleted after; a rename that fails puts the previous one BACK (round 2/3). Round 4 (N1): `sha256` (the
   *  kernel landing) ⇒ THE JUDGE IS ASKED LAST — after every await of the landing's own, before anything moves, and again with the
   *  previous kernel aside, its sync half in the SAME turn as the rename that puts the new one in its place (no await between);
   *  refused ⇒ the previous kernel goes back, nothing landed. Round 5 (m2): the place is NOT WHOLE (`g.torn`) from the first rename
   *  until a kernel is whole in it again — the only window a start past its bound is refused in; a hold standing when the landing
   *  would begin it (a start past its bound before anything moved) ⇒ `held`, nothing moved (a landing never moves a held place).
   *  Round 6 (n1): that question is onPlace's WHOLE one (`placeBusy` — a hold, a running program from the place, a hold taken during
   *  the scan), asked after the landing's last await; (n2) its own put-back of an aside kernel into the empty place is a rename of
   *  the place too (r7 (p2): restoreAside counts it in `torn` from the moment it is asked — its stats too). Round 8 (s1): a put-back
   *  that could not read the place (or the copy beside it) answers `unknown` — NOTHING moves and NOTHING is deleted (the copy beside
   *  the place may be the only previous kernel): `{ok: false, why: 'unknown', code}`, said once by the put-back. → null (landed) |
   *  the refusal ({ok: false, why, p | by | code}). */
  async function landDir(sid, plan, fromDir, sha256 = null) {
    const g = gateOf(sid);
    const back = await restoreAside(sid, plan); // a previous kernel an earlier landing left aside comes BACK first — never deleted unrestored
    if (back && back.unknown) return { ok: false, why: 'unknown', code: back.unknown }; // r8 (s1): could not tell — nothing moves, nothing is deleted
    await fsp.rm(plan.removingDir, { recursive: true, force: true }); // now only a leftover beside a kernel in its place
    let no = sha256 ? landingRefusal(sid, await landingVerdict(sid, sha256)) : null; // nothing moved yet
    if (no) return no;
    // r6 (n1): onPlace's WHOLE question again, after the landing's last await — a start past its bound before anything moved may
    // have spawned and dropped its hold since onPlace asked; the holds' last read is in the turn of the first rename: busy ⇒ held
    const busy = await placeBusy(sid, plan);
    if (busy) return { ok: false, why: 'held', by: busy };
    g.torn++;
    let had = false;
    try {
      try { await io.rename(plan.targetDir, plan.removingDir); had = true; } catch (e) { if (e.code !== 'ENOENT') throw named('build_unpack_failed', `the previous kernel could not be moved aside (${e.code || e.message})`); }
      if (sha256) no = landingRefusal(sid, await landingVerdict(sid, sha256)); // LAST — the rename below is issued in this same turn
      if (no) {
        if (had) { try { await io.rename(plan.removingDir, plan.targetDir); } catch (e2) { const rk = recOf(sid); if (rk.kernel) { rk.aside = rk.kernel; delete rk.kernel; } throw named('engine_kernel_aside', `${who(sid)}'s new kernel was refused at its landing and the previous kernel could not be put back (${(e2 && e2.code) || (e2 && e2.message)}) — it is set aside beside its place; VibeSpace puts it back at the next start or use`); } }
        return no;
      }
      try { await io.rename(fromDir, plan.targetDir); }
      catch (e) {
        // the new kernel could not take the place AFTER the previous one was moved aside: the previous one goes BACK
        let back = !had, why2 = null;
        if (had) { try { await io.rename(plan.removingDir, plan.targetDir); back = true; } catch (e2) { why2 = (e2 && e2.code) || (e2 && e2.message); log.warn?.(`[browser] ${who(sid)}'s previous kernel could not be put back (${why2}) — the next start or use restores it`); } }
        // round 3: NEITHER kernel in its place ⇒ the record says so (never «installed» over an empty place) until it is put back
        if (!back) { const rk = recOf(sid); if (rk.kernel) { rk.aside = rk.kernel; delete rk.kernel; } throw named('engine_kernel_aside', `${who(sid)}'s new kernel could not be put in its place (${(e && e.code) || (e && e.message)}) and the previous kernel could not be put back (${why2}) — it is set aside beside its place; VibeSpace puts it back at the next start or use`); }
        throw named('build_unpack_failed', `${who(sid)}'s new kernel could not be put in its place (${(e && e.code) || (e && e.message)}) — ${had ? 'the previous kernel was put back' : 'nothing was placed'}`);
      }
    } finally { g.torn = Math.max(0, g.torn - 1); }
    // r5 (m2): the place is WHOLE again (the new kernel in it, its receipt inside) — deleting the previous one is not the torn window
    if (had) await io.rm(plan.removingDir, { recursive: true, force: true }).catch((e) => log.warn?.(`[browser] the previous kernel at ${plan.removingDir} could not be deleted (${e && e.message})`));
    return null;
  }
  // ── lane fleet-plugin-catalog: A NEW KERNEL NEVER LANDS UNDER A RUNNING BROWSER ──
  /** Round 3 (N2): ONE ask's bound — a start's whole ask (the waiting kernel's landing + its hold), a measure's, a put-back's: ONE
   *  deadline (landWaitMs from the ask), said once, given up once. */
  const askOf = (asker) => ({ asker, until: Date.now() + landWaitMs, said: false, late: false });
  /** Round 3 (N2): an ask waits for a landing IN PROGRESS (`p`: its renames, or the writer queue it stands in to land the waiting
   *  kernel) — never past its deadline, SAID: one journal line per ask that waits, the engine card «waiting for the new kernel to
   *  land (≤ 30 s)» while it waits; at the deadline ONE line and it goes on. → true when `p` ended in time. */
  async function waitLanding(sid, p, ask) {
    if (ask.late) return false;
    if (await within(p, 0)) return true; // already over — nothing to wait for, nothing to say
    const g = gateOf(sid);
    if (!ask.said) { ask.said = true; log.log?.(`[browser] ${who(sid)}: ${ask.asker} waits for the new kernel to land (≤ ${secs(landWaitMs)} s)`); }
    g.waiting++; notify();
    let ended = false;
    try { ended = await within(p, ask.until - Date.now()); } finally { g.waiting = Math.max(0, g.waiting - 1); notify(); }
    if (!ended) { ask.late = true; log.warn?.(`[browser] ${who(sid)}'s kernel is still taking its place after ${secs(landWaitMs)} s — ${ask.asker} waits no longer`); }
    return ended;
  }
  /** Round 2 (N3): a START's (a measure's, a put-back's) hold on the kernel's place — it first waits for a landing in progress
   *  (within its ask's ONE bound — r3), a landing never starts while a hold stands. → the release (idempotent; `leaseMs` > 0 ⇒ it
   *  ends by itself then — a start that never reports its spawn holds the place no longer). */
  async function holdPlace(id, { leaseMs = LAUNCH_HOLD_MS, ask = null } = {}) {
    const sid = String(id || ''), g = gateOf(sid), a = ask || askOf('a browser start');
    while (g.landing) { if (!(await waitLanding(sid, g.landing, a))) break; }
    // r4 (主开发's ruling on the acceptance's r3 (b)): the bound passed with the landing STILL IN PROGRESS (a rename that hangs) — the
    // place may be half-landed: nothing proceeds beside it (a start, a measure, a put-back); refused BY NAME, the aside kernel put
    // back by the next run (restoreAside — the next start, use, fleet run or boot). r5 (m2): ONLY while the place is not whole
    // (`torn`) — a landing still deleting the previous kernel (the new one whole in its place), or one that has not moved anything
    // yet (it sees this hold and moves nothing), lets the start go on. r6 (n2): `torn` counts EVERY rename of the place in flight —
    // the move-out, the move-in AND the put-back of an aside kernel into the empty place (r7, p2: from the moment it is asked —
    // its stats too)
    if (g.landing && g.torn) throw named('engine_kernel_landing', `the kernel is being replaced — try again in a moment (${who(sid)}'s new kernel has been taking its place for more than ${secs(landWaitMs)} s)`);
    // r6 (n1): a hold TAKEN (and maybe dropped) while a landing's in-use scan runs counts; (n5) whose it is, for the words
    g.holds++; g.taken++; g.lastAsker = a.asker; g.askers.set(a.asker, (g.askers.get(a.asker) || 0) + 1);
    let done = false, t = null;
    const release = () => { if (done) return; done = true; if (t) clearTimeout(t); g.holds = Math.max(0, g.holds - 1); const n = (g.askers.get(a.asker) || 1) - 1; if (n > 0) g.askers.set(a.asker, n); else g.askers.delete(a.asker); };
    if (leaseMs > 0) { t = setTimeout(release, leaseMs); if (t.unref) t.unref(); }
    return release;
  }
  /** Round 2: ONE writer of the place and of the waiting kernel (`rec.next`, `.next-<tag>`) per engine at a time — a landing, a
   *  staging, a discard, a leftover sweep queue behind each other. Round 3 (N2): an `ask` (a start's) stands in the queue only
   *  within its bound — past it, it leaves (its turn passes on when the one before ends) and runs nothing (→ LATE). Round 5 (m3):
   *  a PLAN WRITE in the queue (the cluster's install of the package — a git clone) ⇒ an ask leaves at once (→ LATE): no wait,
   *  no landing words — asked in the turn the ask would start waiting, so one that began during a start's in-use scan counts. */
  async function withNext(sid, fn, ask = null) {
    const g = gateOf(sid), prev = g.tail;
    let done; g.tail = new Promise((r) => { done = r; });
    g.writers++;
    let mine = true;
    try {
      if (!ask) await prev;
      else if (g.planning) { mine = false; prev.then(done); return LATE; }
      else if (!(await waitLanding(sid, prev, ask))) { mine = false; prev.then(done); return LATE; }
      return await fn();
    } finally { g.writers--; if (mine) done(); }
  }
  /** Round 3 (N2), inside withNext: the place is a landing's only when that is POSSIBLE — no start holds it (a browser starting ⇒
   *  in use) and no running program comes from it (`inUse`) — both asked BEFORE anything waits; a landing never waits for a start.
   *  Then `fn(true)` runs as THE landing (a hold asked meanwhile waits for it, bounded); `fn(false)` = not now (the place must not
   *  be touched). The holds are read again after the in-use check, in the same turn that marks the landing. Round 6 (n1): ONE
   *  question (`placeBusy`), asked here AND by landDir before its first rename; `fn(false, busy)` says which (in words). */
  async function onPlace(sid, plan, fn) {
    const g = gateOf(sid);
    const busy = await placeBusy(sid, plan);
    if (busy) return fn(false, busy);
    let end; g.landing = new Promise((r) => { end = r; });
    try { return await fn(true); } finally { g.landing = null; end(); }
  }
  /** Round 6 (n1): MAY THE PLACE BE MOVED NOW — ONE question: a hold standing (a start from its in-use check to its spawn, a measure,
   *  a put-back), a running program from the place (`inUse`), or a hold TAKEN while the scan ran (a start that spawned and dropped
   *  its hold meanwhile — the scan may have listed /proc before it) ⇒ busy. The holds' last read is in the turn the caller marks what
   *  it does (onPlace: the landing; landDir: the first rename). → null | WHICH, in words (n5 — the staging's line says it). */
  async function placeBusy(sid, plan) {
    const g = gateOf(sid), t0 = g.taken;
    if (g.holds > 0) return heldWords(g);
    if (await inUse(sid, plan)) return 'a browser runs the current kernel';
    return g.holds > 0 ? heldWords(g) : g.taken !== t0 ? `${g.lastAsker || 'a browser start'} took the current kernel while it was checked` : null;
  }
  const heldWords = (g) => `${[...g.askers.keys()][0] || g.lastAsker || 'a browser start'} holds the current kernel`;
  /** Does a running program come from the kernel's place (a browser on it)? `/proc/<pid>/exe` of every process (a pod: a handful).
   *  Round 2 (N4): REAL PATHS on both sides — /proc/<pid>/exe is always canonical, so the place is realpath'd too (a symlinked data/
   *  or any ancestor) — and it FAILS CLOSED: a place that cannot be resolved, a /proc that cannot be listed ⇒ in use; a process of
   *  THIS user whose exe cannot be read (EACCES / EPERM — a non-dumpable one) ⇒ in use unless what CAN be read rules it out (its
   *  argv[0] outside the place and its name not the kernel binary's — this user's systemd / sshd-session / ping are such, on any
   *  Linux box); one whose name cannot be read either ⇒ in use. Another user's process is skipped (the kernel folder is this user's
   *  0700). No place yet ⇒ nothing runs it; a computer with no /proc (not Linux) ⇒ none seen, as before. A suite hands in its own
   *  (`kernelInUse`); one that throws counts as in use. */
  async function inUse(sid, plan) {
    if (typeof kernelInUse === 'function') { try { return !!(await kernelInUse(sid, plan)); } catch { return true; } }
    let real;
    try { real = await io.realpath(plan.targetDir); }
    catch (e) { if (e && e.code === 'ENOENT') return false; log.warn?.(`[browser] ${who(sid)}'s kernel place could not be resolved (${(e && e.code) || (e && e.message)}) — counted as in use`); return true; }
    const heads = [...new Set([`${real}/`, `${plan.targetDir}/`])];
    const inPlace = (x) => heads.some((h) => x.startsWith(h));
    let pids;
    try { pids = (await io.readdir('/proc')).filter((n) => /^\d+$/.test(n)); }
    catch (e) { if (e && e.code === 'ENOENT' && platform !== 'linux') return false; log.warn?.(`[browser] /proc could not be listed (${(e && e.code) || (e && e.message)}) — ${who(sid)}'s kernel counted as in use`); return true; }
    const me = typeof process.getuid === 'function' ? process.getuid() : null;
    const bin = path.basename(plan.exe).slice(0, 15);
    const exeOf = async (p) => {
      try { return await io.readlink(`/proc/${p}/exe`); }
      catch (e) {
        if (e && (e.code === 'ENOENT' || e.code === 'ESRCH')) return ''; // ended since the listing; a kernel thread
        if (!e || (e.code !== 'EACCES' && e.code !== 'EPERM')) return null;
        try { const st = await io.stat(`/proc/${p}`); if (me !== null && st.uid !== me) return ''; } catch (e2) { return e2 && e2.code === 'ENOENT' ? '' : null; }
        // THIS user's process, its exe unreadable: judged by what can be read — its argv[0] and its name
        try {
          const argv0 = String(await io.readFile(`/proc/${p}/cmdline`)).split('\0')[0];
          const comm = String(await io.readFile(`/proc/${p}/comm`)).trim();
          return inPlace(argv0) || comm === bin || path.basename(argv0) === path.basename(plan.exe) ? null : '';
        } catch (e3) { return e3 && e3.code === 'ENOENT' ? '' : null; }
      }
    };
    for (let i = 0; i < pids.length; i += 64) {
      const exes = await Promise.all(pids.slice(i, i + 64).map(exeOf));
      if (exes.some((x) => x === null || inPlace(x))) return true;
    }
    return false;
  }
  /** The landing found a browser on the kernel in its place: the new kernel (verified, its receipt inside) WAITS at
   *  `.next-<tag>`; the record keeps the running kernel as installed and says the waiting one (`next`). Inside withNext. Round 4
   *  (N1): judged LAST, its sync half in the same turn as the rename (refused ⇒ `{refused}`, nothing set beside the place); (N3)
   *  `unread` — the plan could not be read now — KEEPS the verified download here (trust still asked), said once, never landed.
   *  Round 5 (m1): judged FIRST too — a refusal touches nothing beside the place: the kernel ALREADY waiting there (and `rec.next`)
   *  stays (r2: a lapsed trust deletes nothing), only the new download is discarded (the caller); the waiting kernel is moved ASIDE
   *  (never deleted before the judge's last word) and comes back on a refusal at the last ask. Round 6 (n3): a `.prev` a stop left
   *  while the record names the waiting kernel IS that kernel — put back first (healAside), never deleted as a leftover; (n5) the
   *  line says WHY the new one waits beside the place (`because`, in words: a browser runs the kernel · a start — a measure, the
   *  boot, a download — holds it · its plan changed as it landed). Round 7 (p1): a copy beside the place that cannot be read now
   *  (healAside → `unknown`) ⇒ nothing is set beside it — the aside copy, rec.next and the new download (`.unpack-<tag>`) stay as
   *  they are, nothing recorded, said once (healAside); the next start or run asks again. Round 8 (s3): a PERSON's download beside
   *  a copy that cannot be read, the slot `.next-<tag>` free (healAside read ENOENT there) ⇒ the new one is set there — the copy
   *  stays as it is (never removed unread); the sweep removes it as a duplicate once the new one reads whole. */
  async function stageNext(sid, plan, kfact, shape, { unread = null, because = 'a browser runs the current kernel' } = {}) {
    const h = await healAside(sid, plan);
    const beside = !!(h.unknown && h.free && kfact.by === 'user'); // r8 (s3)
    if (h.unknown && !beside) return { ok: true, id: sid, version: kfact.version, sha256: kfact.sha256, bytes: kfact.archiveBytes, files: shape.files, staged: false, kept: h.unknown }; // r7 (p1): never rm a copy whose receipt could not be read
    let lv = null;
    const ask = async () => { if (unread) return; lv = await landingVerdict(sid, kfact.sha256); if (!lv.ok && lv.why === 'unread') { unread = lv; lv = null; } };
    const refusal = () => (unread ? (trustOf(sid) !== true ? { ok: false, why: 'untrusted' } : null) : landingRefusal(sid, lv));
    await ask();
    let no = refusal(); // FIRST — nothing beside the place is touched yet
    if (no) return { refused: no };
    const aside = `${plan.nextDir}.prev`; // a stop between the renames below leaves it — r6 (n3): the sweep puts it back while the record names it
    let had = false;
    if (!beside) { // r8 (s3): beside an unread copy nothing is moved aside — its slot is free
      await fsp.rm(aside, { recursive: true, force: true });
      try { await io.rename(plan.nextDir, aside); had = true; } catch (e) { if (!e || e.code !== 'ENOENT') throw named('build_unpack_failed', `${who(sid)}'s kernel waiting beside its place could not be moved aside (${(e && e.code) || (e && e.message)}) — the new one was not set beside it`); }
    }
    const back = async () => {
      if (!had) return;
      try { await io.rename(aside, plan.nextDir); }
      catch (e2) { const rec = record.engines[sid]; if (rec && rec.next) { delete rec.next; await save(); } log.warn?.(`[browser] ${who(sid)}'s waiting kernel could not be put back beside its place (${(e2 && e2.code) || (e2 && e2.message)}) — it is dropped; the next start or the cluster's next run downloads it again`); }
    };
    await ask();
    no = refusal(); // LAST — the rename below is issued in this same turn
    if (no) { await back(); return { refused: no }; }
    try { await io.rename(plan.unpackDir, plan.nextDir); } catch (e) { await back(); throw named('build_unpack_failed', `${who(sid)}'s new kernel could not be set beside its place (${(e && e.code) || (e && e.message)}) — nothing was placed`); }
    if (had) await fsp.rm(aside, { recursive: true, force: true }).catch((e) => log.warn?.(`[browser] the kernel that waited at ${aside} could not be deleted (${e && e.message}) — the next sweep removes it`));
    await fsp.rm(plan.part, { force: true }).catch(() => {});
    const rec = recOf(sid);
    rec.next = { ...kfact, stagedAt: now() };
    delete rec.failure; delete rec.discarded;
    saidAside.delete(sid); saidRead.delete(sid); // r8 (s3): a new waiting kernel — read whole as it was set
    await save();
    if (beside) log.log?.(`[browser] ${who(sid)}'s copy of the waiting kernel that could not be read (${h.unknown}) stays beside its place until the next sweep finds the new one whole`);
    if (unread) log.warn?.(`[browser] ${who(sid)}'s kernel ${kfact.version} is downloaded (sha256 ${kfact.sha256.slice(0, 12)}…, verified) — ${clip(unread.e && unread.e.message, 160) || 'its plan could not be read now'}, so it is KEPT beside its place, never landed; asked again at the next start or run`);
    else log.log?.(`[browser] ${who(sid)}'s kernel ${kfact.version} is downloaded (sha256 ${kfact.sha256.slice(0, 12)}…, verified) — ${because}, so the new one waits beside it and serves the next browser start`);
    return { ok: true, id: sid, version: kfact.version, sha256: kfact.sha256, bytes: kfact.archiveBytes, files: shape.files, staged: true, ...(unread ? { unread: (unread.e && unread.e.code) || 'unread' } : {}) };
  }
  /** Round 2 (N2 / N5): the waiting kernel is DISCARDED — the record cleared AND its folder removed (whoever clears rec.next removes
   *  the dir), ONE journal line: `stale` = no longer the planned one (the cluster pinned back), `gone` = its folder is not the
   *  recorded one. Inside withNext. */
  async function dropNext(sid, plan, why, p = null) {
    const rec = record.engines[sid];
    const v = rec && rec.next ? rec.next.version : null;
    if (rec) delete rec.next;
    await save();
    await fsp.rm(plan.nextDir, { recursive: true, force: true }).catch((e) => log.warn?.(`[browser] the waiting kernel at ${plan.nextDir} could not be deleted (${e && e.message}) — the next sweep removes it`));
    if (why === 'stale') { const fe = fleetEngine(); log.log?.(`[browser] ${who(sid)}'s waiting kernel ${v} is no longer ${fe && fe.plugin === sid ? 'the cluster\'s' : 'the one its plugin names'} — discarded (${p ? `the kernel planned now is ${p.version}` : p === null ? 'no kernel is planned now' : 'the kernel planned now is another'}; never landed)`); }
    else log.warn?.(`[browser] ${who(sid)}'s waiting kernel is not beside its place any more — discarded; the next start or the cluster's next run downloads it again`);
    notify();
  }
  /** Round 3 (N1): THE ONE JUDGE of a downloaded kernel at the moment it would LAND or WAIT beside its place — the install road
   *  (runInstall) and the waiting road (landNext) both ask it, inside withNext: the package TRUSTED now (asked before and after the
   *  plan is read) and the kernel the one PLANNED now (plannedKernel's sha256). → {ok: true, p} | {ok: false, why: 'untrusted' |
   *  'stale' (p: the plan now) | 'unread' (the plan cannot be read now — e)}. */
  async function landingVerdict(sid, sha256) {
    for (let i = 0; ; i++) {
      if (trustOf(sid) !== true) return { ok: false, why: 'untrusted' };
      const key = planKeyOf(sid);
      let p = null;
      try { p = await plannedKernel(sid, { strict: true }); } catch (e) { if (!e || !e.none) return { ok: false, why: 'unread', e }; } // r4 (N3): only ENOENT («no kernel.json») is a fact
      if (trustOf(sid) !== true) return { ok: false, why: 'untrusted' };
      if (planKeyOf(sid) !== key && i < 2) continue; // r4: the plan's inputs moved while it was read — read again
      if (!p || p.sha256 !== sha256) return { ok: false, why: 'stale', p };
      return { ok: true, p, key };
    }
  }
  /** Round 4 (N1): the verdict's SYNC half — asked in the same turn as the rename it allows: the package trusted NOW, the plan's
   *  inputs in memory (`planKeyOf`) unmoved since the plan was read. → null (go) | 'untrusted' | 'moved'. */
  const judgeNow = (sid, lv) => (trustOf(sid) !== true ? 'untrusted' : planKeyOf(sid) !== lv.key ? 'moved' : null);
  /** → null (go) | the refusal ({ok: false, why, p | e}) — the async verdict, then its sync half (no await between them and the caller's rename). */
  const landingRefusal = (sid, lv) => { if (!lv) return null; if (!lv.ok) return lv; const w = judgeNow(sid, lv); return w ? { ok: false, why: w } : null; };
  /** Round 3 (N1): a download the judge refused at its landing — its `.unpack-<tag>` and `.part` removed; never landed, never
   *  staged, never measured; ONE journal line. Inside withNext. */
  async function discardDownload(sid, plan, kfact, lv) {
    await dropPartials(plan);
    const fe = fleetEngine(), cluster = !!(fe && fe.plugin === sid), mover = cluster ? 'the cluster' : 'its plugin';
    const why = lv.why === 'untrusted' ? 'a package no longer trusted' : lv.why === 'stale' ? `a plan ${mover} has moved away from (${lv.p && lv.p.version ? `the kernel planned now is ${lv.p.version}` : lv.p === null ? 'no kernel is planned now' : 'the kernel planned now is another'})` : lv.why === 'moved' ? 'a plan that changed as it landed' : `a plan that cannot be read now (${clip(lv.e && lv.e.message, 160)})`;
    const line = `${who(sid)}'s kernel ${kfact.version} was downloaded for ${why} — discarded, never landed`;
    log.warn?.(`[browser] ${line}`);
    // r4 (N4): A DISCARD LEAVES A TRACE — the record's last outcome (the card says it), ONE For-you notice when nobody watched (the
    // cluster's run, a first use — the existing fileNotice road); the same discard again files nothing new
    const rec = recOf(sid), by = kfact.by || 'user';
    const again = !!(rec.discarded && rec.discarded.why === lv.why && rec.discarded.sha256 === kfact.sha256 && rec.discarded.filed);
    rec.discarded = { why: lv.why, version: kfact.version, sha256: kfact.sha256, at: now(), by, mover: lv.why === 'stale' ? (cluster ? 'cluster' : 'plugin') : null, filed: again };
    if (by !== 'user' && !again) rec.discarded.filed = fileNotice(sid, { what: 'kernel-discarded', code: `kernel_discarded_${lv.why}`, error: line });
    await save();
    notify();
    return { ok: true, id: sid, version: kfact.version, sha256: kfact.sha256, discarded: lv.why };
  }
  /** Round 3 (N3): a waiting kernel's receipt → {sha256} (null: not a receipt of a kernel) | {missing: true} (ENOENT — a FACT: the
   *  folder or its receipt is not there) | {error: code} (any other answer — EACCES, EIO, ESTALE, EMFILE on a PVC: a TRANSIENT; the
   *  waiting kernel and its record are kept). Through `io` (a suite bends it). */
  async function receiptAt(dir) {
    const f = path.join(dir, EK.RECEIPT_FILE);
    let txt;
    try { const st = await io.stat(f); if (!st.isFile() || st.size > 64 * 1024) return { sha256: null }; txt = String(await io.readFile(f)); }
    catch (e) { return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? { missing: true, sha256: null } : { error: (e && e.code) || 'error', sha256: null }; }
    let doc; try { doc = JSON.parse(txt); } catch { doc = undefined; }
    return { sha256: EK.receiptVerdict(doc).sha256 || null };
  }
  /** The kernel that WAITS (`.next-<tag>`) takes its place once no browser runs the current one — asked by the keeper before a
   *  launch, by the fleet's run and at boot. Round 2: ONLY for a package trusted now (N1 — an untrusted one's plan is not read: the
   *  waiting kernel stays until a trusted run judges it), ONLY while it is still the PLANNED one (N2 — compared at the landing; a
   *  mismatch is discarded), as ONE critical section (N3 — a second start waits for this landing, bounded, then runs what landed).
   *  Round 3: judged by THE ONE JUDGE the install road asks too (N1); POSSIBLE first (N2) — a start holding the place or a browser
   *  on the kernel ⇒ false AT ONCE (no wait, no line); only a landing in progress is waited for, within the `ask`'s ONE bound (a
   *  start's — `beforeStart`; the fleet's run and the boot queue unbounded); a receipt that cannot be read now (not ENOENT) keeps
   *  the waiting kernel (N3). → true when it landed. */
  async function landNext(id, { ask = null } = {}) {
    await ready;
    const sid = String(id || '');
    if (!record.engines[sid] || !record.engines[sid].next || running.has(sid)) return false;
    let plan; try { plan = planOf(sid); } catch { return false; }
    if (trustOf(sid) !== true) return false;
    const g = gateOf(sid);
    if (g.planning) return false; // r4 (N1): the cluster's install of the package (its plan, its trust) is in flight — nothing lands meanwhile, said by nobody
    if (!g.landing && (g.holds > 0 || await inUse(sid, plan))) return false; // r3 (N2): nothing can land now — said by nobody, waited for by nobody
    // r5 (m3): a plan write that BEGAN during the scan is asked again where this start would wait — withNext's ask, in this same turn
    let k = null;
    try {
      k = await withNext(sid, async () => {
        const rec = record.engines[sid];
        if (!rec || !rec.next || running.has(sid)) return null; // landed (or discarded) by the one before
        const lv = await landingVerdict(sid, rec.next.sha256); // r3 (N1): THE judge — untrusted / unread ⇒ it waits (asked again); stale ⇒ discarded
        if (!lv.ok) { if (lv.why === 'stale') await dropNext(sid, plan, 'stale', lv.p); return null; }
        let rv = await receiptAt(plan.nextDir);
        if (rv.missing) {
          const h = await healAside(sid, plan); // r6 (n3): a stop left it aside — it is that kernel
          if (h.unknown) return null; // r7 (p1): its copy could not be read now — rec.next as it is, said once (healAside); the start goes on with the current kernel
          if (h.restored) rv = await receiptAt(plan.nextDir);
        }
        if (!record.engines[sid] || !record.engines[sid].next) return null; // r6 (n3): …or the record stopped naming it (said, recorded)
        if (rv.error) { if (saidRead.get(sid) !== rv.error) { saidRead.set(sid, rv.error); log.warn?.(`[browser] ${who(sid)}'s waiting kernel ${rec.next.version} could not be read now (${rv.error}) — it is kept, nothing lands; asked again at the next start or run`); } return null; }
        saidRead.delete(sid);
        if (!rv.sha256 || rv.sha256 !== rec.next.sha256) { await dropNext(sid, plan, 'gone'); return null; }
        const out = await onPlace(sid, plan, async (free) => {
          if (!free) return null;
          const no = await landDir(sid, plan, plan.nextDir, rec.next.sha256); // r4 (N1): judged LAST, inside the section
          if (no) return { refused: no };
          const { stagedAt, ...k0 } = rec.next;
          rec.kernel = { ...k0, installedAt: now() };
          delete rec.next; delete rec.failure; delete rec.discarded;
          await save();
          return k0;
        });
        if (!out || !out.refused) return out;
        // r4 (N1): refused at its landing (the trust or the plan moved during the in-use scan / the put-back / the first rename):
        // nothing landed, nothing ran — stale ⇒ discarded; untrusted / unread / moved ⇒ it waits (judged again at the next ask)
        const w = out.refused.why;
        if (w === 'held' || w === 'unknown') return null; // r5 (m2): a start past its bound holds the place (nothing moved) — it lands at a later start, said by nobody (r3); r8 (s1): its place could not be read — said once by the put-back
        if (w === 'stale') await dropNext(sid, plan, 'stale', out.refused.p);
        else log.warn?.(`[browser] ${who(sid)}'s waiting kernel ${rec.next.version} did not take its place — ${w === 'untrusted' ? 'its package is no longer trusted' : w === 'unread' ? `its plan could not be read now (${clip(out.refused.e && out.refused.e.message, 160)})` : 'its plan changed as it landed'}; nothing ran, it waits (asked again at the next start or run)`);
        return null;
      }, ask);
    } catch (e) { log.warn?.(`[browser] ${who(sid)}'s waiting kernel could not take its place [${(e && e.code) || 'error'}] — ${clip(e && e.message, 300)}; asked again at the next start`); return false; }
    if (!k || k === LATE) return false;
    log.log?.(`[browser] ${who(sid)}'s kernel ${k.version} took its place (it waited for no browser to run the previous one; sha256 ${String(k.sha256).slice(0, 12)}…)`);
    await measure(sid, { force: true }).catch(() => null);
    notify();
    return true;
  }
  /** Round 3 (N2): what a browser START asks before its spawn — ONE ask, ONE bound (landWaitMs — never per stage, never per queued
   *  caller): the waiting kernel lands when that is POSSIBLE now (else false at once), then the start HOLDS the place until its
   *  spawn. It waits only for a landing in progress — said. → {landed, release}. Round 4: the bound passed with a landing STILL in
   *  progress ⇒ throws engine_kernel_landing («the kernel is being replaced — try again in a moment») — the keeper refuses the
   *  start by that name; it never spawns beside a half-landed place. */
  async function beforeStart(id, { leaseMs = LAUNCH_HOLD_MS } = {}) {
    const sid = String(id || ''), ask = askOf('a browser start');
    let landed = false; try { landed = await landNext(sid, { ask }); } catch { landed = false; }
    const release = await holdPlace(sid, { leaseMs, ask });
    return { landed, release };
  }
  /** The kernel in its place is not the one planned NOW (the fleet named a new kernel, the plugin's kernel.json moved) ⇒
   *  `{due: true, current, sha256, version, bytes}` (the sha256s: the kernel in its place, the one planned); none installed, the planned one already waiting (`staged`), a plan that cannot
   *  be read, an owner's program ⇒ due false (the first use / the refusal roads say those). Round 2: a package not trusted now ⇒
   *  `{due: false, untrusted: true}` — its kernel.json is not read (N1); a waiting kernel that is not the plan is discarded here
   *  too, unless a landing / a download of this engine is in flight (that one judges it — N2). */
  async function kernelDue(id) {
    await ready;
    const sid = String(id || '');
    const rec = record.engines[sid];
    if (!rec || !rec.kernel || !rec.kernel.sha256 || userSourced(sid)) return { due: false };
    if (trustOf(sid) !== true) return { due: false, untrusted: true };
    let p; try { p = await plannedKernel(sid); } catch { return { due: false }; }
    if (rec.next && rec.next.sha256 !== p.sha256 && !gateOf(sid).writers && !running.has(sid)) {
      let plan = null; try { plan = planOf(sid); } catch { plan = null; }
      if (plan) await withNext(sid, async () => { if (rec.next && rec.next.sha256 !== p.sha256) await dropNext(sid, plan, 'stale', p); });
    }
    if (p.sha256 === rec.kernel.sha256) return { due: false };
    if (rec.next && rec.next.sha256 === p.sha256) return { due: false, staged: true, version: rec.next.version, sha256: p.sha256 };
    return { due: true, current: rec.kernel.sha256, sha256: p.sha256, version: p.version, bytes: p.bytes };
  }
  /** Round 2 (N5): `.next-*` / `.unpack-*` folders and `*.part` files beside the kernel's place that the record does not name (a
   *  waiting kernel the record lost — a stop between stageNext's rename and its save; an install a restart cut) are REMOVED — the
   *  disk stays bounded — with ONE journal line. Never while a download of this engine runs (its own `.unpack-` / `.part`); asked
   *  at boot and at each fleet run (bootRestore). Round 6 (n3): never the ONLY copy of the kernel the record names — healAside
   *  first. Round 7 (p1): every name the record COULD name stays while it names a waiting kernel — `.next-<tag>` AND
   *  `.next-<tag>.prev` (a copy healAside could not read is never deleted; one it read is put back or the record let go of it).
   *  Round 8 (s2): the `.prev` is kept ONLY while healAside answers unknown — a duplicate it read (the named kernel whole at
   *  `.next-<tag>`) is removed as before r7. → the names removed. */
  async function sweepLeftovers(sid, plan) {
    if (running.has(sid)) return [];
    return withNext(sid, async () => {
      if (running.has(sid)) return [];
      const h = await healAside(sid, plan); // r6 (n3): the waiting kernel a stop left aside is put back (or the record stops naming it) FIRST
      let names = []; try { names = await io.readdir(plan.root); } catch { return []; }
      const rec = record.engines[sid] || {};
      const keep = rec.next ? [path.basename(plan.nextDir), ...(h.unknown ? [`${path.basename(plan.nextDir)}.prev`] : [])] : []; // r8 (s2): the .prev only while healAside could not tell
      const gone = [];
      for (const n of names) {
        if (!(/^\.next-/.test(n) || /^\.unpack-/.test(n) || /\.part$/.test(n)) || keep.includes(n)) continue;
        try { await fsp.rm(path.join(plan.root, n), { recursive: true, force: true }); gone.push(n); } catch (e) { log.warn?.(`[browser] the leftover ${path.join(plan.root, n)} could not be deleted (${e && e.message})`); }
      }
      if (gone.length) log.log?.(`[browser] ${who(sid)}: leftover kernel files the record does not name were removed (${gone.join(', ')})`);
      return gone;
    });
  }
  /** Round 6 (n3): a `.next-<tag>.prev` while the record names a waiting kernel IS that kernel (a stop between stageNext's renames
   *  left it aside — the only copy) ⇒ put back as `.next-<tag>` when nothing stands there; a copy that is not the named kernel, a
   *  put-back that fails, or another kernel standing at `.next-<tag>` ⇒ the record stops naming it in the same run (lostNext).
   *  Round 7 (p1): THREE answers, and only ENOENT is a fact (r3) — `restored` (the named kernel waits at `.next-<tag>` again) ·
   *  `gone` (nothing aside the record needs — no copy, the named kernel already at `.next-<tag>`, or a copy it read and let go
   *  of: lostNext, said and recorded) · `unknown` (a stat or a receipt that answered anything but ENOENT — EIO, ESTALE, EMFILE on
   *  a PVC): NOTHING moves and NOTHING is recorded; every caller keeps both names (the sweep, landNext, stageNext), ONE line until
   *  it reads again. Never a record naming a folder that is gone. Inside withNext (the sweep, stageNext, landNext). Round 8 (s3):
   *  `free` — the copy could not be read and `.next-<tag>` answered ENOENT (a person's download may be set there). → {restored} |
   *  {gone} | {unknown: code, free?}. */
  async function healAside(sid, plan) {
    const rec = record.engines[sid], prev = `${plan.nextDir}.prev`;
    const known = (h) => { saidAside.delete(sid); return h; };
    const fact = (e) => !!e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');
    const unknown = (code) => {
      if (saidAside.get(sid) !== code) { saidAside.set(sid, code); log.warn?.(`[browser] ${who(sid)}'s waiting kernel ${rec.next.version} could not be read beside its place now (${code}) — nothing moves and nothing is recorded: it is kept as it is and nothing new is set beside it; the kernel in its place serves meanwhile, asked again at the next start or run`); }
      return { unknown: code };
    };
    if (!rec || !rec.next) return known({ gone: true });
    let st; try { st = await io.stat(prev); } catch (e) { return fact(e) ? known({ gone: true }) : unknown((e && e.code) || 'error'); }
    if (!st.isDirectory()) return known({ gone: true });
    let there = true; try { await io.stat(plan.nextDir); } catch (e) { if (!fact(e)) return unknown((e && e.code) || 'error'); there = false; }
    if (there) {
      const rv = await receiptAt(plan.nextDir);
      if (rv.error) return unknown(rv.error);
      if (rv.sha256 === rec.next.sha256) return known({ gone: true }); // the named kernel stands at .next- (the .prev is a duplicate — r8 (s2): the sweep removes it)
      await lostNext(sid, 'another kernel stands where it waits');
      return known({ gone: true });
    }
    const rv = await receiptAt(prev);
    if (rv.error) return { ...unknown(rv.error), free: true }; // r8 (s3): .next-<tag> answered ENOENT
    if (rv.sha256 !== rec.next.sha256) { await lostNext(sid, 'the copy left aside is not that kernel'); return known({ gone: true }); }
    try { await io.rename(prev, plan.nextDir); }
    catch (e) { await lostNext(sid, `it could not be put back (${(e && e.code) || (e && e.message)})`); return known({ gone: true }); }
    log.log?.(`[browser] ${who(sid)}'s waiting kernel ${rec.next.version} was put back beside its place (VibeSpace stopped while setting it aside) — nothing is downloaded again`);
    return known({ restored: true });
  }
  /** Round 6 (n3): the record stops naming a waiting kernel a stop lost — rec.next cleared, the discard recorded (`lost`: the card
   *  says it; ONE For-you notice when nobody watched, as every discard), kernelDue due again; ONE line. The folders are leftovers now. */
  async function lostNext(sid, detail) {
    const rec = recOf(sid), n = rec.next;
    if (!n) return;
    delete rec.next;
    const by = n.by || 'user', line = `${who(sid)}'s waiting kernel ${n.version} was lost — VibeSpace stopped while setting it beside its place and ${detail}`;
    rec.discarded = { why: 'lost', version: n.version, sha256: n.sha256, at: now(), by, mover: null, filed: false };
    if (by !== 'user') rec.discarded.filed = fileNotice(sid, { what: 'kernel-discarded', code: 'kernel_discarded_lost', error: line });
    await save();
    log.warn?.(`[browser] ${line} — the record no longer names it; the next start or the cluster's next run downloads it again`);
    notify();
  }
  /** An earlier landing stopped between its two renames (the previous kernel aside, nothing in its place) ⇒ it goes BACK.
   *  Round 3: asked FIRST — installKernel, measure, the boot (`bootRestore`) — not only inside a later landing; one at a time
   *  per id. The record follows the place: put back ⇒ the aside kernel's record is the installed one again (else its receipt's);
   *  not put back ⇒ the record holds NO kernel and the refusal is engine_kernel_aside. Round 8 (s1): THREE answers, as healAside's —
   *  {restored} · {none} (nothing aside, or a kernel in its place) · {unknown: code} (a stat that answered anything but ENOENT: the
   *  copy beside the place is left as it is, nothing moves — said once until it reads again). Round 7 (p2):
   *  THE PLACE IS NOT WHOLE FROM THE MOMENT A PUT-BACK IS ASKED — counted here, before its first await (inside a landing the place
   *  is already empty while its stats run; a stat that hangs is a rename that hangs), ended when it settles, finds nothing aside,
   *  or finds a kernel in its place. */
  function restoreAside(sid, plan) {
    if (restoring.has(sid)) return restoring.get(sid);
    const w = notWhole(sid); // r7 (p2)
    asked.set(sid, w);
    const p = putBack(sid, plan).finally(() => { w.end(); asked.delete(sid); restoring.delete(sid); });
    restoring.set(sid, p);
    return p;
  }
  async function putBack(sid, plan) {
    const w = asked.get(sid) || { end: () => {} };
    const sk = `${sid}\0place`, none = () => { saidAside.delete(sk); w.end(); return { none: true }; };
    const unknown = (what, e) => {
      const code = (e && e.code) || (e && e.message) || 'error';
      if (saidAside.get(sk) !== code) { saidAside.set(sk, code); log.warn?.(`[browser] ${who(sid)}'s ${what} could not be read (${code}) — the previous kernel's copy beside its place is left as it is: nothing moves and nothing is deleted, nothing lands meanwhile; asked again at the next start or use`); }
      return { unknown: code }; // r8 (s1)
    };
    let aside = false; try { aside = (await io.stat(plan.removingDir)).isDirectory(); } catch (e) { if (e && e.code !== 'ENOENT' && e.code !== 'ENOTDIR') return unknown('copy of its previous kernel', e); }
    if (!aside) return none();
    // round 4: put back ONLY onto a place that answers ENOENT — any other answer (EIO / ESTALE) is a transient: nothing is
    // moved and nothing is said (the journal only), the next start or use asks again; a rename onto a kernel would fail and
    // say «set aside» over a good kernel
    let place = null;
    try { place = await io.stat(plan.targetDir); }
    catch (e) { if (!e || e.code !== 'ENOENT') return unknown('kernel place', e); }
    if (place) {
      w.end(); // r7 (p2): a kernel is in its place — whole
      // a kernel IN its place: the aside copy is a LEFTOVER (the landing's rm failed; an NFS silly-rename) — deleted, never put
      // back over it; only when the place's binary is there (a place without one keeps both — measure says it is missing)
      let exe = null; try { exe = await io.stat(plan.exe); } catch (e) { if (e && e.code !== 'ENOENT' && e.code !== 'ENOTDIR') return unknown('kernel in its place', e); }
      if (exe && exe.isFile()) await fsp.rm(plan.removingDir, { recursive: true, force: true }).then(() => log.log?.(`[browser] ${who(sid)}'s leftover previous kernel beside its place was deleted — a kernel is in its place`), (e) => log.warn?.(`[browser] the leftover previous kernel at ${plan.removingDir} could not be deleted (${e && e.message})`));
      return none();
    }
    const rec = recOf(sid);
    try { await io.rename(plan.removingDir, plan.targetDir); }
    catch (e) {
      w.end();
      if (rec.kernel) { rec.aside = rec.kernel; delete rec.kernel; }
      await save();
      throw named('engine_kernel_aside', `${who(sid)}'s previous kernel is set aside beside its place and could not be put back (${(e && e.code) || (e && e.message)}) — no kernel is in its place; VibeSpace tries again at the next start or use`);
    }
    w.end(); // whole again
    saidAside.delete(sk);
    if (!rec.kernel) { const k = rec.aside || await kernelOfReceipt(plan); if (k) rec.kernel = k; }
    delete rec.aside;
    if (rec.failure && rec.failure.code === 'engine_kernel_aside') delete rec.failure;
    await save();
    log.log?.(`[browser] ${who(sid)}'s previous kernel was put back in its place (an earlier landing stopped between its two renames) — nothing was downloaded`);
    notify();
    return { restored: true };
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
      let rel; try { rel = await holdPlace(id, { leaseMs: 0, ask: askOf('the boot') }); } catch { continue; } // lane fleet-plugin-catalog r2 (N3): never beside a landing in flight (r4: one past the bound ⇒ this id waits for the next run)
      try { const back = await restoreAside(id, plan); if (back && back.restored) out.push({ id, restored: true }); } // r8 (s1): unknown ⇒ nothing (said once)
      catch (e) { await noteFailure(id, e, 'restore', 'boot'); out.push({ id, restored: false, code: e.code }); }
      finally { rel(); }
      try { const gone = await sweepLeftovers(id, plan); if (gone.length) out.push({ id, swept: gone }); } catch { /* asked again at the next run */ } // r2 (N5)
      if (record.engines[id] && record.engines[id].next && await landNext(id)) out.push({ id, landed: true }); // lane fleet-plugin-catalog
    }
    if (out.length) notify();
    return out;
  }
  async function noteFailure(sid, e, step, by, credential = null) {
    const rec = recOf(sid);
    const code = (e && e.code) || 'build_fetch_failed', error = clip(e && e.message, 400);
    const again = rec.failure && rec.failure.code === code && rec.failure.filed;
    const road = (e && e.credential) || credential || null; // lane kernel-asset-credential: the road the download took
    delete rec.discarded; // r4 (N4): the record's last outcome is this failure
    rec.failure = { code, error, step: step || 'plan', at: now(), by, filed: !!again, ...(e && e.node ? { node: String(e.node), need: String(e.need || EK.NODE_FLOOR), plugin: pluginVersionOf(sid) } : {}), ...(road ? { credential: road } : {}) };
    log.warn?.(`[browser] ${who(sid)}'s kernel download failed at ${step || 'plan'} [${code}] — ${error}`);
    if (by !== 'user' && !again && code !== 'install_running') rec.failure.filed = fileNotice(sid, { what: 'kernel', code, error });
    await save();
  }
  /** ONE For-you notice (origin plugin) for a failure nobody watched — the boot job's, a first use's. */
  function fileNotice(id, { what, code, error }) {
    const ut = T();
    if (!ut || typeof ut.add !== 'function') return false;
    const name = labelOf(id) || id;
    const aside = what === 'kernel' && code === 'engine_kernel_aside', discarded = what === 'kernel-discarded'; // r4 (N4)
    const text = discarded ? `${name}: its new browser kernel was discarded` : aside ? `${name}: its browser kernel is set aside and could not be put back` : what === 'kernel' ? `${name}: its browser kernel could not be downloaded` : `${name}: the cluster's plugin could not be installed`;
    const detail = discarded ? `${clip(error, 300)} [${code}] — nothing ran; the cluster's next run or the next browser start downloads the kernel planned then` : `${clip(error, 300)} [${code}]${what !== 'kernel' ? ' — ⚙ → Plugins shows it; the cluster\'s next change of the plugin (or the next restart) tries again' : code === 'engine_node_unsupported' ? ` — update Node on this computer to ${EK.NODE_FLOOR} or later; nothing is downloaded until then` : code === 'vault_locked' ? ' — the download is tried again at the next use once it is unlocked' : code === 'kernel_credential_unusable' ? ' — Integrations → Plugins → Plugin Git repository; the download is tried again at the next use' : code === 'kernel_asset_browser_form' ? ' — the plugin\'s author fixes its kernel.json; the download is tried again at the next use' : aside ? ' — Settings → Agent browser shows the engine; it is put back at the next start or use' : ' — Settings → Agent browser shows the engine; the download is tried again at the next use'}`;
    try {
      ut.add('engine-distribution', { origin: 'plugin', plugin: 'engine-distribution', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Plugins', text, detail,
        i18n: { text: { key: discarded ? '{name}: its new browser kernel was discarded' : aside ? '{name}: its browser kernel is set aside and could not be put back' : what === 'kernel' ? '{name}: its browser kernel could not be downloaded' : "{name}: the cluster's plugin could not be installed", params: { name } } } });
      return true;
    } catch (x) { log.warn?.(`[browser] the ${what} failure notice was not filed (${x && x.message})`); return false; }
  }

  /** `<kernel> --version`, ONE child: 5 s, serviceEnv (never the hub's env), no shell. */
  function runVersion(exe) {
    return new Promise((resolve) => {
      try {
        // L1b r2: each failure in words — a flood past the 64 KB cap, a signal — never execFile's own message (it names the path)
        execFile(exe, ['--version'], { timeout: versionMs, maxBuffer: 64 * 1024, encoding: 'utf8', env: serviceEnv(env()) }, (er, so, se) => resolve({ ok: !er, out: `${so || ''}\n${se || ''}`, error: er ? (er.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'printed more than 64 KB for --version' : er.killed ? `no answer within ${Math.round(versionMs / 1000)} s` : er.code != null ? `exited ${er.code}` : er.signal ? `ended by ${er.signal}` : 'it could not be run') : null }));
      } catch (e) { resolve({ ok: false, out: '', error: e.message }); }
    });
  }
  /** THE MEASURED VERSION — once per kernel (the receipt's sha256; a kernel placed by hand: its size + mtime); `force` after an
   *  install. → `{ok, version, says, at, cached}` | `{ok:false, code, error}` (no kernel). */
  async function measure(id, { force = false, path: userPath = null, stamp = null } = {}) {
    await ready;
    const sid = String(id || '');
    if (userPath) return measureUser(sid, String(userPath), { force, stamp }); // lane engine-spi-egress L1b: the owner's program (no receipt, no place)
    let plan; try { plan = planOf(sid); } catch (e) { return { ok: false, code: e.code, error: e.message }; }
    let rel; try { rel = await holdPlace(sid, { leaseMs: 0, ask: askOf('a measure') }); } catch (e) { return { ok: false, code: e.code, error: e.message }; } // lane fleet-plugin-catalog r2 (N3): never beside a landing in flight (r4: past the bound ⇒ refused, nothing run)
    try { return await measureKernel(sid, plan, { force }); } finally { rel(); }
  }
  async function measureKernel(sid, plan, { force = false } = {}) {
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
      // r4 (N1): the measure RUNS the kernel (`--version` — a re-exec): never for a package not trusted NOW (D2's letter) — asked in
      // the same turn as the spawn; said once until one runs
      if (trustOf(sid) !== true) {
        if (!untrustedRunSaid.has(sid)) { untrustedRunSaid.add(sid); log.warn?.(`[browser] ${who(sid)}'s kernel is not run for its version — its package is not trusted now`); }
        return { ok: false, cached: false, code: 'engine_untrusted', error: `${who(sid)} is waiting for your consent (⚙ → Plugins) — its kernel is not run until you trust it` };
      }
      untrustedRunSaid.delete(sid);
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

  /** lane engine-spi-egress L1b: THE OWNER'S PROGRAM measured — the same `--version` once, keyed by the file's own stat as the registry
   *  read it (`stamp` = `<size>:<mtime>` — the registry judged the file, behind the mount door; nothing is read here): a replaced file
   *  is measured again at the next launch. */
  async function measureUser(sid, p, { force = false, stamp = null } = {}) {
    if (!stamp) return { ok: false, code: 'browser_engine_not_executable', error: `the program named for ${who(sid)} was not judged` };
    const forKey = `user:stat:${stamp}`;
    const rec = recOf(sid);
    if (!force && rec.measured && rec.measured.for === forKey) return { ok: !!rec.measured.version, cached: true, ...rec.measured };
    if (measuring.has(sid)) return measuring.get(sid);
    const run = (async () => {
      const r = await runVersion(p);
      const v = EK.versionOf(r.out);
      rec.measured = v.version && r.ok ? { version: v.version, says: v.says, at: now(), for: forKey } : { version: null, says: v.says || null, error: r.ok ? 'it printed no version' : r.error, at: now(), for: forKey };
      await save();
      log.log?.(`[browser] the program named for ${who(sid)} says ${rec.measured.version ? `"${rec.measured.says}" — measured ${rec.measured.version}` : `no version (${rec.measured.error})`}`);
      notify();
      return { ok: !!rec.measured.version, cached: false, ...rec.measured };
    })();
    measuring.set(sid, run);
    try { return await run; } finally { measuring.delete(sid); }
  }
  /** lane engine-spi-egress L1b: an engine whose program the OWNER names has no kernel to download — read off its MANIFEST (the
   *  loader's list: a plugin the fleet just installed is not running yet, so the engine table does not hold it). */
  function userSourced(sid) { try { const p = (L() && L().list ? L().list() : []).find((x) => x.id === sid); return !!(p && p.contributes && BE.binaryRowOf(p.contributes.settings)); } catch { return false; } }
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
   *  version, the last failure. `source: 'user'` + `stamp` (L1b r2 — the registry's stamp of the owner's program NOW): the kernel
   *  state belongs to the download source and is IGNORED (a record an earlier, downloading version of the same plugin left — said
   *  once in the journal), and the measured version is THIS file's only (the record's `for` = `user:stat:<stamp>`), else null. */
  function kernelFact(id, { source = null, stamp = null } = {}) {
    const sid = String(id || '');
    const r = record.engines[sid] || {}, run = running.get(sid);
    if (source === 'user') {
      if ((r.kernel || r.failure) && !userKernelSaid.has(sid)) { userKernelSaid.add(sid); log.log?.(`[browser] ${who(sid)} runs the program its owner names — the kernel this computer's record holds for it (an earlier version of the plugin downloaded one) is ignored; the files stay`); }
      const mu = r.measured && stamp && r.measured.for === `user:stat:${stamp}` ? r.measured : null;
      return { state: 'absent', step: null, bytes: null, total: null, by: null, version: null, sha256: null, installedAt: null, source: null,
        measuredVersion: mu && mu.version ? mu.version : null, measuredAt: mu && mu.version ? mu.at : null, measureError: mu && !mu.version ? mu.error || null : null,
        code: null, error: null, failedAt: null, node: null, need: null, credential: null, next: null, landing: null, discarded: null };
    }
    // a node refusal is a fact about THAT Node and THAT plugin version — on another Node (an upgrade), or after the plugin updated (its
    // kernel.json may name a tar.gz now — lane engine-spi-egress r2), it is asked again, so the record says nothing of it
    const f0 = r.failure || null, f = f0 && f0.code === 'engine_node_unsupported' && (f0.node !== nodeNow || (f0.plugin && f0.plugin !== pluginVersionOf(sid))) ? null : f0;
    const k = r.kernel || null, mv = r.measured || null;
    return {
      state: run ? 'downloading' : k ? 'installed' : f ? 'failed' : 'absent',
      step: run ? run.step : null, bytes: run ? run.bytes : null, total: run ? run.total : null, by: run ? run.by : null,
      version: k ? k.version : null, sha256: k ? k.sha256 : null, installedAt: k ? k.installedAt : null, source: k ? k.source : null,
      measuredVersion: mv && mv.version ? mv.version : null, measuredAt: mv && mv.version ? mv.at : null, measureError: mv && !mv.version ? mv.error || null : null,
      code: !run && f ? f.code : null, error: !run && f ? f.error : null, failedAt: !run && f ? f.at : null,
      node: !run && f && f.node ? f.node : null, need: !run && f && f.need ? f.need : null,
      // lane kernel-asset-credential: the road of the download in flight / the last one ('plugin-git' = the plugin repository's
      // release asset, with the Plugin Git credential) — STRUCTURE, the card words it
      credential: run ? run.credential || null : f ? f.credential || null : k ? k.credential || null : null,
      // lane fleet-plugin-catalog: a new kernel downloaded while a browser ran this one — it serves the next browser start
      // r8 (s3): `unread` — it could not be read when last asked (the error; null once it reads): the card says so, never «it serves the next start»
      next: r.next ? { version: r.next.version || null, sha256: r.next.sha256 || null, stagedAt: r.next.stagedAt || null, unread: unreadNext(sid) } : null,
      // r3 (N2): a start (a measure) waits for the new kernel to land — at most this many seconds (the card says it meanwhile)
      landing: gates.has(sid) && gates.get(sid).waiting > 0 ? { waitS: secs(landWaitMs) } : null,
      // r4 (N4): the last download DISCARDED at its landing — why (untrusted / stale — `mover`: the cluster or its plugin / moved)
      discarded: !run && r.discarded ? { why: r.discarded.why || null, version: r.discarded.version || null, sha256: r.discarded.sha256 || null, at: r.discarded.at || null, mover: r.discarded.mover || null } : null,
    };
  }

  // ── THE FLEET'S PLUGIN — AT BOOT AND AT EVERY CHANGE OF THE CLUSTER'S PIN (D2; lane fleet-plugin-catalog) ──
  const fleetKeyOf = (fe) => (fe ? JSON.stringify(fe) : 'none');
  const sizeWords = (b) => (Number.isFinite(b) && b > 0 ? (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`) : 'size unknown');
  let fleetRun = null, fleetAgain = false, fleetRanKey = null, stopped = false, fleetUnreadKey = null;
  /** Round 4 (N1): a write of the PLAN — the cluster's install / update of the engine's package (its kernel.json, its trust) —
   *  holds the engine's ONE writer queue: no landing is judged or renamed while it runs; a start meanwhile is answered «not now» at
   *  once (landNext reads `planning` before it queues). */
  async function planWrite(sid, fn) { const g = gateOf(sid); g.planning++; try { return await withNext(sid, fn); } finally { g.planning = Math.max(0, g.planning - 1); } }
  /** ONE run at a time per pod: asked while one runs ⇒ ONE re-run after it (any number of asks collapse into it). */
  function syncFleet(why) {
    if (fleetRun) { fleetAgain = true; return fleetRun; }
    fleetRun = (async () => { let out = null, w = why; do { fleetAgain = false; out = await fleetOnce(w); w = 'change'; } while (fleetAgain && !stopped); return out; })().finally(() => { fleetRun = null; });
    return fleetRun;
  }
  /** ONE job after the listen (the boot's run). */
  const bootFleet = () => syncFleet('boot');
  /** Round 2: resolved once no run is in flight (a queued re-run included) — a caller that must not start a second one (a suite). */
  const fleetSettled = async () => { while (fleetRun) { try { await fleetRun; } catch { /* said by the run */ } } };
  /** A presets change: a run only when the merged `browserEngine` moved since the run that last took it (or that run failed —
   *  the credential fixed beside it is a change too); the same pin heard again is nothing (never a re-pull, never a loop). */
  function fleetChanged() {
    const k = fleetKeyOf(fleetEngine());
    if (k === fleetRanKey && fleetLast.outcome !== 'failed' && !(fleetLast.kernel && fleetLast.kernel.state === 'failed')) return Promise.resolve(null);
    return syncFleet('change');
  }
  /** THE LISTENER: the presets reader's changes (cluster-presets `onChange`) → fleetChanged. → the unsubscribe. */
  function follow(presets) {
    if (!presets || typeof presets.onChange !== 'function') return () => {};
    const off = presets.onChange(() => { fleetChanged().catch(() => {}); });
    return () => { stopped = true; try { off(); } catch { /* gone */ } };
  }
  /** ONE run: fleet.json names an engine plugin with a git source ⇒ install / update it when the registry has no such id or
   *  its recorded source / ref differs (never a re-pull of the same record); then its kernel: a waiting one lands when no
   *  browser runs the current one; one the cluster names anew is downloaded now (`preinstall`) or at the next browser start. */
  async function fleetOnce(why) {
    try { return await fleetStep(why); }
    catch (e) { Object.assign(fleetLast, { outcome: 'failed', code: (e && e.code) || 'fleet_run_failed', error: clip(e && e.message, 400) }); log.warn?.(`[plugins] fleet plugin: the run stopped [${fleetLast.code}] — ${fleetLast.error}; the next change or restart runs it again`); notify(); return { ok: false, code: fleetLast.code, error: fleetLast.error }; }
  }
  async function fleetStep(why) {
    await ready;
    // round 3: an aside copy beside an empty place goes back first — no download (every run: a put-back is idempotent, a stat or two)
    const restored = await bootRestore();
    const fe = fleetEngine();
    const prevKey = fleetRanKey; fleetRanKey = fleetKeyOf(fe);
    Object.assign(fleetLast, { at: now(), why, plugin: fe ? fe.plugin : null, ref: fe && fe.source ? fe.source.ref || null : null, outcome: null, code: null, error: null, from: null, to: null, kernel: null, got: null });
    if (!fe || !fe.source || !fe.source.git) {
      fleetLast.outcome = 'none';
      if (why !== 'boot' && prevKey && prevKey !== 'none') { log.log?.('[plugins] fleet plugin: the cluster names no engine plugin with a git source now — what is installed stays; the cluster\'s trust lapses with its pin (the owner is asked)'); notify(); }
      return { ok: true, skipped: 'no fleet engine with a git source', restored };
    }
    const l = L();
    if (!l || typeof l.install !== 'function') { fleetLast.outcome = 'none'; return { ok: false, skipped: 'no plugin loader', restored }; }
    const id = fe.plugin, ref = String(fe.source.ref || '');
    const pinned = /^[0-9a-f]{40}$/.test(ref);
    const inst = typeof l.installRecord === 'function' ? l.installRecord(id) : null;
    const same = !!inst && inst.source === 'git' && inst.value === fe.source.git && String(inst.ref || '') === ref;
    if (!same) {
      const was = inst && inst.source === 'git' && inst.sha ? String(inst.sha) : null;
      fleetLast.from = was;
      log.log?.(`[plugins] fleet plugin: cluster pins ${pinned ? ref.slice(0, 12) : ref ? `«${clip(ref, 60)}» — not a commit sha, so never trusted by the cluster` : 'no ref (its default branch) — never trusted by the cluster'} — ${inst ? `updating ${id}${was ? ` from ${was.slice(0, 12)}` : ''}` : `installing ${id}`}`);
      try {
        const r = await planWrite(id, () => l.install({ source: 'git', value: fe.source.git, ref: fe.source.ref || null, credential: 'auto', by: 'fleet' })); // r4 (N1): under the landing's ONE lock
        const got = r && r.plugin ? r.plugin.id : null;
        fleetLast.to = r && r.sha ? String(r.sha) : null;
        fleetLast.outcome = got !== id ? 'other-id' : !pinned ? 'unpinned' : inst ? 'updated' : 'installed';
        if (got !== id) fleetLast.got = got ? String(got) : null;
        if (!pinned) fleetLast.code = 'fleet_ref_not_sha';
        log.log?.(`[plugins] fleet plugin: ${id} ${inst ? 'updated' : 'installed'} from its git source${fe.source.ref ? ' @' + fe.source.ref : ''}${got !== id ? ` — but the package is "${got}", so it was NOT trusted` : !pinned ? ' — NOT trusted by the cluster (a tag or branch can move; only a full commit sha is the anchor) — the owner is asked' : r && r.trustedBy === 'fleet' ? ` — trusted by the cluster at ${String(r.sha).slice(0, 12)}` : ''}`);
      } catch (e) {
        Object.assign(fleetLast, { outcome: 'failed', code: (e && e.code) || 'plugin_git_failed', error: clip(e && e.message, 400) });
        log.warn?.(`[plugins] fleet plugin: ${id} could not be ${inst ? 'updated' : 'installed'} [${fleetLast.code}] — ${fleetLast.error}; tried again at the cluster's next change or the next restart`);
        fileNotice(id, { what: 'plugin', code: fleetLast.code, error: fleetLast.error });
        notify();
        return { ok: false, code: fleetLast.code, error: fleetLast.error };
      }
    } else fleetLast.outcome = 'same';
    let kernel = null;
    // lane engine-spi-egress L1b: an engine whose program its OWNER names has no kernel — the fleet's preinstall / kernel are ignored, said once
    if ((fe.preinstall === true || (fe.kernel && (fe.kernel.url || fe.kernel.sha256))) && userSourced(id)) { log.log?.(`[plugins] the fleet's engine plugin ${id} runs the program its owner names (executablePath) — the fleet's kernel / preinstall is ignored`); notify(); return { ok: true, plugin: id, outcome: fleetLast.outcome, kernel: { ok: true, ignored: 'user-source' }, restored }; }
    // round 3 (N4): the cluster's repository holds ANOTHER plugin — nothing of <id> came from it, there is nothing to consent to: said
    // as itself (never the consent words); its kernel step does not run
    if (fleetLast.outcome === 'other-id') {
      log.log?.(`[plugins] fleet plugin: the cluster's repository holds another plugin («${fleetLast.got || '?'}»), not ${id} — ${id} is not installed from it and there is nothing to consent to; no kernel is fetched`);
      notify();
      return { ok: true, plugin: id, outcome: 'other-id', got: fleetLast.got, kernel: { ok: true, otherId: fleetLast.got || '?' }, restored };
    }
    // round 2 (N1, D2 whole): the kernel step runs ONLY for a package the CLUSTER trusts now — pinned by a full sha, installed at
    // that sha, the loader's trust check green. Any other (a tag, another id, a trust that did not hold): its kernel.json is not
    // read, nothing is fetched, run or landed — the kernel in place stays; the panel says it waits for the owner's consent
    if (!clusterTrusts(id)) {
      const mine = trustOf(id) === true;
      fleetLast.kernel = mine ? null : { state: 'untrusted' };
      log.log?.(`[plugins] fleet plugin: ${id} ${mine ? 'is trusted by you, not by the cluster — its kernel follows your browser starts, never the cluster\'s run' : 'is waiting for your consent — its kernel is not fetched'}`);
      notify();
      return { ok: true, plugin: id, outcome: fleetLast.outcome, kernel: { ok: true, untrusted: !mine }, restored };
    }
    await landNext(id); // a kernel that waited takes its place when no browser runs the current one
    let present = false; try { await fsp.stat(planOf(id).exe); present = true; } catch { present = false; }
    const due = present ? await kernelDue(id) : { due: false };
    const waiting = !!(record.engines[id] && record.engines[id].next); // r4 (N3): a kernel kept beside the place is judged at the next start or run — never downloaded again
    if (fe.preinstall === true && (!present || due.due) && !waiting && kernelFact(id).state !== 'downloading') {
      let pk = null; try { pk = await plannedKernel(id); } catch { pk = null; }
      log.log?.(`[plugins] fleet plugin: ${id}'s kernel ${pk ? `${pk.version} (${sizeWords(pk.bytes)})` : ''} — downloading${due.due ? ` (it replaces ${String(due.current).slice(0, 12)}…)` : ''}`);
      try { kernel = await installKernel(id, { by: 'fleet', wait: true }); } catch (e) { kernel = { ok: false, code: e.code, error: e.message }; }
      fleetLast.kernel = kernel && kernel.discarded ? null : kernel && kernel.ok === false ? { state: 'failed', code: kernel.code || null, version: pk ? pk.version : null, sha256: pk ? pk.sha256 : null }
        : kernel && kernel.staged ? { state: 'staged', version: kernel.version, sha256: kernel.sha256 } : { state: 'ready', version: kernel && kernel.version ? kernel.version : pk ? pk.version : null, sha256: kernel && kernel.sha256 ? kernel.sha256 : null };
      if (kernel && kernel.discarded) { /* r3 (N1): said by the judge's line; the cluster's next run (queued) decides again */ }
      else if (kernel && kernel.unread) { if (fleetUnreadKey !== fleetRanKey) { fleetUnreadKey = fleetRanKey; fleetAgain = true; } } // r4 (N3): said by the staging's line; ONE re-run queued (once per pin — never a loop) judges it again
      else if (kernel && kernel.staged) log.log?.(`[plugins] fleet plugin: ${id}'s kernel ${kernel.version} waits beside the running one — it serves the next browser start`);
      else if (kernel && kernel.ok === false) log.warn?.(`[plugins] fleet plugin: ${id}'s kernel could not be downloaded [${kernel.code}] — tried again at the cluster's next change, a restart or the next browser start`);
    } else if (due.due) {
      kernel = { ok: true, due: true, version: due.version };
      fleetLast.kernel = { state: 'due', version: due.version, sha256: due.sha256 };
      log.log?.(`[plugins] fleet plugin: ${id}'s kernel ${due.version} (${sizeWords(due.bytes)}) is named — downloaded at the next browser start, which still runs the current one`);
    } else if (due.staged) { kernel = { ok: true, staged: true, version: due.version }; fleetLast.kernel = { state: 'staged', version: due.version, sha256: due.sha256 }; }
    else if (waiting && !present) { const nx = record.engines[id].next; kernel = { ok: true, staged: true, version: nx.version || null }; fleetLast.kernel = { state: 'staged', version: nx.version || null, sha256: nx.sha256 || null }; } // r4 (N3): kept beside an empty place
    else if (fe.preinstall === true) kernel = { ok: true, present };
    notify();
    return { ok: true, plugin: id, outcome: fleetLast.outcome, kernel, restored };
  }
  /** The Plugins panel's fleet line: the last run + its kernel as the record holds it NOW (a waiting kernel; one that landed). */
  const fleetView = () => {
    const out = { ...fleetLast, trusted: fleetLast.plugin ? trustOf(fleetLast.plugin) : null }; // r3 (N5): the words follow trust NOW
    const rec = fleetLast.plugin ? record.engines[fleetLast.plugin] : null, kd = fleetLast.kernel;
    if (kd && kd.state === 'untrusted') out.kernel = trustOf(fleetLast.plugin) === true ? null : kd; // r2: the owner trusted it since
    else if (rec && rec.next) out.kernel = { state: 'staged', version: rec.next.version || null, sha256: rec.next.sha256 || null, unread: unreadNext(fleetLast.plugin) }; // r8 (s3)
    else if (kd && kd.sha256 && rec && rec.kernel && rec.kernel.sha256 === kd.sha256) out.kernel = { state: 'ready', version: rec.kernel.version || null, sha256: kd.sha256 };
    else if (fleetLast.plugin && running.has(fleetLast.plugin)) out.kernel = { state: 'downloading', version: kd ? kd.version : null, sha256: kd ? kd.sha256 : null };
    return out;
  };

  return { installKernel, plannedKernel, measure, kernelFact, bootFleet, bootRestore, fleetView, ready, recordFile, _record: () => record,
    syncFleet, fleetChanged, follow, landNext, kernelDue, holdPlace, fleetSettled, beforeStart, bootLine, // lane fleet-plugin-catalog (r2: holdPlace — a start's hold on the place; r3: beforeStart — a start's ONE ask)
    _inUse: (id) => inUse(String(id || ''), planOf(String(id || ''))) }; // a suite's read of the in-use check (round 2, N4)
}

/** The boot job's journal line (mounts-plugins-wiring) — r3 (N4): another plugin in the cluster's repository is said as itself.
 *  r4 (N5): each kernel shape its own words — «kernel ready» ONLY for a kernel in its place (installed now, put back, present). */
const DISCARD_WORDS = { untrusted: 'its package was no longer trusted when it arrived', stale: 'the cluster moved its pin while it downloaded', moved: 'its plan changed as it landed' };
function bootLine(r) {
  if (!r || !r.plugin) return null;
  const k = r.kernel, v = k && k.version ? ` (${k.version})` : '';
  const kw = !k ? '' : k.ok === false ? `kernel not downloaded [${k.code}]`
    : k.otherId ? `kernel none — the cluster's repository holds another plugin («${k.otherId}»), not ${r.plugin}; there is nothing to consent to`
    : k.untrusted === true ? 'kernel not fetched — it waits for your consent'
    : k.untrusted === false ? 'kernel follows your consent (you trust the package; the cluster does not)'
    : k.ignored ? 'no kernel — it runs the program its owner names'
    : k.discarded ? `kernel discarded (${DISCARD_WORDS[k.discarded] || k.discarded})`
    : k.staged ? `new kernel waiting beside the place${v}`
    : k.due ? `kernel download due${v}`
    : k.ok === true && (k.present === true || k.restored || k.sha256) ? 'kernel ready' : '';
  return `[plugins] the fleet's engine plugin ${r.plugin}: ${r.outcome}${kw ? ` · ${kw}` : ''}`;
}

module.exports = { create, RECORD_FILE, VERSION_MS, bootLine };
