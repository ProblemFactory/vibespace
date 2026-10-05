'use strict';
/**
 * CHROME-FOR-TESTING BUILDS — the download (a row of the keeper's ONE install slot, src/server/browser-installs.js) and
 * Change build… (which build a profile runs, the relaunch it takes), moved verbatim out of src/server/browser-keeper.js
 * (rv-browser F7, lane dc-browser-installs). The PURE half (the plan, the verdicts, the witness) is src/browser-builds.js;
 * the measured hosts and lists are VERBS.CHROME_BUILDS_RECORD; the checks (one HEAD, the md5, the zip shape) are the ones
 * measured — nothing here is re-measured.
 */
const B = require('../browser-profiles.js');
const BB = require('../browser-builds.js');
const CDP = require('../cdp-census.js');
const F = require('../browser-facts.js');
const HM = require('../browser-human.js');
const SW = require('../browser-switch.js');
const VERBS = require('../browser-verbs.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function create(ctx, slot) {
  const { bf, browsing, buildsFor, buildsHere, chromeBuildsResolve, commit, ensureLoaded, env, healing, hereTag, homeDir, humans, installDir, isEph, isLocalRec, isMediated, keptDirFor, keptStore, log, mediator, named, namedError, notify, now, profile, pview, readDirMajor, reopenLeaseTabs, start, stop, stopping, switching, usableExe, userTodos, whichOnPath, writeJsonAtomic } = ctx;
  const { INSTALL_TIMEOUT_MS, busyWords, installMarker, installState, mine: isMine, markInstall, otherOf, runStep, stalledWords } = slot;
  const inputsView = (...a) => ctx.inputsView(...a); // declared later in the keeper (read at call time)
  // ── lane chrome-builds-download (design 004, B-80c1 — the owner: 「能不能自动从网上下载对应的版本？…下载前让用户检查是否互相兼容」) ──
  // DOWNLOAD ANOTHER BUILD: THE install slot's third kind (`chrome-build`, one at a time with the CLI's and CloakBrowser's).
  // Google's two version documents are read only when a PERSON opens the picker (the routes are cookie-only; no timer, no boot
  // path, no agent route): the 10 KB channel list fresh each time, the 5.2 MB known-good list on "Older versions…" (kept under
  // data/browser-tools/chrome-builds/, re-read with If-Modified-Since after 24 h). The download is OUR fetch (no proxy process:
  // `buildFetch`, the ONE fetch site, judges every url and every redirect hop with egressVerdict over CHROME_BUILDS_RECORD's two
  // hosts BEFORE the request) into the CLI's own folder `~/.agent-browser/browsers/` — so the list, the choice verdict, the
  // launch, the switch dialog and the agent's `providers` see it with no new reader. Steps, each said on the row: fetch
  // (`chrome-<v>.part`, the announced length enforced) → check (the bytes' md5 against the object's own md5 — CfT publishes no
  // checksum; TLS to the file host is the authenticity) → unpack (`unzip -Z1`/`-Zs` judged by zipShapeVerdict BEFORE `unzip -q`
  // extracts into `.unpack-<v>/`) → verify (`chrome --version` must say the version) → THE witness `vibespace-download.json`
  // inside the unpacked folder → ONE rename to `chrome-<v>/`: nothing half-done is ever listed as a build. A failed step
  // removes `.part` and `.unpack-<v>` and says the step and why. Removal: only a build VibeSpace downloaded (its witness), no
  // profile choosing it, no running browser reporting it — renamed to `.removing-<v>`, then deleted.
  const CBR = VERBS.CHROME_BUILDS_RECORD;
  const buildsRoot = () => path.join(homeDir, BB.BUILDS_REL);
  const knownGoodFile = () => path.join(installDir, 'chrome-builds', 'known-good.json');
  const buildHosts = () => B.parseEgressAllowlist([CBR.listHost, CBR.fileHost]);
  const listUrl = (which) => `https://${CBR.listHost}${CBR.lists[which]}`;
  const KNOWN_GOOD_TTL_MS = 24 * 3600 * 1000;
  const cbState = { run: 0, version: null, url: null, bytes: 0, total: null, etag: null, code: null, abort: null };
  let cbChannels = null; // the last channel list a person's picker read ({at, parsed}) — where a download's url is found
  const downloadOffer = (hostId = null) => ({ offered: !hostId && hereTag() === BB.DOWNLOAD_PLATFORM, machine: hostId || hereTag() });
  /** THE ONE FETCH of a Chrome build or its lists: the url and every redirect hop (followed by hand) judged by egressVerdict over
   *  the record's two hosts BEFORE the request; https only. Throws by name (`build_url_offhost`, `build_fetch_failed`). */
  async function buildFetch(url, { method = 'GET', headers = {}, signal = null, hops = 3 } = {}) {
    let u = String(url || '');
    for (let i = 0; i <= hops; i++) {
      let x = null; try { x = new URL(u); } catch { x = null; }
      if (!x) throw namedError('build_fetch_failed', `not a URL: ${u.slice(0, 120)}`);
      const ev = B.egressVerdict(x.hostname, buildHosts());
      if (!ev.allow || x.protocol !== 'https:') throw namedError('build_url_offhost', `${x.protocol}//${x.hostname} is refused (${ev.allow ? 'not https' : ev.why}) — Chrome builds come only from ${buildHosts().join(' and ')}; nothing was fetched from it`, { build: { host: x.hostname } });
      let res;
      try { res = await fetch(chromeBuildsResolve ? chromeBuildsResolve(x.href) : x.href, { method, headers, redirect: 'manual', signal }); }
      catch (e) { if (signal && signal.aborted) throw namedError('build_fetch_failed', stalledWords('the download')); throw namedError('build_fetch_failed', `${x.hostname} could not be reached (${(e && e.cause && e.cause.code) || (e && e.message) || e})`); }
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (loc) { try { await res.body?.cancel(); } catch { /* none */ } try { u = new URL(loc, x.href).href; } catch { throw namedError('build_fetch_failed', `${x.hostname} redirected to a bad location`); } continue; }
      return { res, url: x.href, host: x.hostname };
    }
    throw namedError('build_fetch_failed', `more than ${hops} redirects from ${String(url).slice(0, 120)}`);
  }
  async function jsonBody(res, max) {
    const len = Number(res.headers.get('content-length'));
    if (Number.isFinite(len) && len > max) throw namedError('build_list_invalid', `the list is ${len} bytes, more than ${max}`);
    const parts = []; let n = 0;
    for await (const c of res.body) { n += c.length; if (n > max) throw namedError('build_list_invalid', `the list is more than ${max} bytes`); parts.push(Buffer.from(c)); }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw namedError('build_list_invalid', 'the list is not JSON'); }
  }
  /** The 10 KB channel list, FRESH (a person opened the picker). */
  async function channelsList() {
    const { res } = await buildFetch(listUrl('lastKnownGood'));
    if (!res.ok) throw namedError('build_list_unreachable', `the Chrome for Testing channel list answered ${res.status}`);
    const p = BB.parseLastKnownGood(await jsonBody(res, 1 << 20), { fileHost: CBR.fileHost, platform: CBR.platform });
    if (!p.ok) throw namedError(p.code, p.error);
    cbChannels = { at: now(), parsed: p };
    return p;
  }
  /** The kept known-good list (re-judged on every read — a url edited on disk to another host is refused like a fetched one). */
  function knownGoodKept() {
    let k = null; try { k = JSON.parse(fs.readFileSync(knownGoodFile(), 'utf8')); } catch { return null; }
    if (!k || !Array.isArray(k.versions)) return null;
    const versions = [], refused = Array.isArray(k.refused) ? k.refused.slice(0, 200) : [];
    for (const v of k.versions) { if (!v || !BB.VERSION_RE.test(String(v.version || ''))) continue; const u = BB.downloadUrlVerdict(v.url, { fileHost: CBR.fileHost }); if (u.ok) versions.push({ version: v.version, major: Number(String(v.version).split('.')[0]), revision: String(v.revision || ''), url: u.url }); else refused.push({ version: v.version, code: u.code, error: u.error }); }
    return { at: Number(k.at) || 0, lastModified: k.lastModified || null, timestamp: k.timestamp || '', versions, refused };
  }
  /** "Older versions…": the known-good list, kept 24 h, then asked again with If-Modified-Since. */
  async function knownGoodList() {
    const kept = knownGoodKept();
    if (kept && now() - kept.at < KNOWN_GOOD_TTL_MS) return kept;
    const { res } = await buildFetch(listUrl('knownGood'), { headers: kept && kept.lastModified ? { 'If-Modified-Since': kept.lastModified } : {} });
    let rec;
    if (res.status === 304 && kept) { try { await res.body?.cancel(); } catch { /* none */ } rec = { ...kept, at: now() }; }
    else {
      if (!res.ok) throw namedError('build_list_unreachable', `the Chrome for Testing version list answered ${res.status}`);
      const p = BB.parseKnownGood(await jsonBody(res, 32 << 20), { fileHost: CBR.fileHost, platform: CBR.platform });
      if (!p.ok) throw namedError(p.code, p.error);
      rec = { at: now(), lastModified: res.headers.get('last-modified') || null, timestamp: p.timestamp, versions: p.versions, refused: p.refused.slice(0, 200) };
    }
    fs.mkdirSync(path.dirname(knownGoodFile()), { recursive: true, mode: 0o700 });
    writeJsonAtomic(knownGoodFile(), rec);
    return rec;
  }
  /** A version's download url — from the lists a person's picker read (the channel list within the hour, the kept known-good
   *  list); a version no list names is refused, one a list named off-host is refused by that name. */
  async function urlOfVersion(version) {
    const find = (p) => (p ? (p.rows || p.versions || []).find((r) => r.version === version) || null : null);
    const refusedIn = (p) => (p ? (p.refused || []).find((r) => r.version === version) || null : null);
    let ch = cbChannels && now() - cbChannels.at < 3600e3 ? cbChannels.parsed : null;
    const kg = knownGoodKept();
    let hit = find(ch) || find(kg), r = refusedIn(ch) || refusedIn(kg);
    if (!hit && !r && !ch) { ch = await channelsList(); hit = find(ch); r = refusedIn(ch); }
    if (hit) return hit.url;
    if (r) throw namedError(r.code, r.error);
    throw namedError('build_version_unknown', `Chrome ${version} is not in Google's Chrome for Testing lists — open "Older versions…" to read the whole list`);
  }
  /** Free bytes on the filesystem of `dir` (its nearest existing ancestor). */
  function freeOf(dir) {
    let d = path.resolve(String(dir));
    for (let i = 0; i < 64; i++) { try { const s = fs.statfsSync(d); return { free: Number(s.bavail) * Number(s.bsize), path: d }; } catch { const up = path.dirname(d); if (up === d) break; d = up; } }
    return { free: null, path: String(dir) };
  }
  function treeOf(dir, max = 20000) {
    let bytes = 0, files = 0, n = 0; const stack = [dir];
    while (stack.length && n < max) { const d = stack.pop(); let names; try { names = fs.readdirSync(d); } catch { continue; } for (const nm of names) { if (++n > max) break; const p = path.join(d, nm); let st; try { st = fs.lstatSync(p); } catch { continue; } if (st.isDirectory()) stack.push(p); else { bytes += st.size; if (st.isFile()) files++; } } }
    return { bytes, files };
  }
  function witnessOf(version) {
    try { const w = JSON.parse(fs.readFileSync(path.join(buildsRoot(), `chrome-${version}`, BB.WITNESS_FILE), 'utf8')); return w && typeof w === 'object' && w.version === String(version) ? w : null; } catch { return null; }
  }
  /** Who uses a build on THIS computer: the profiles whose choice names it, the running browsers that report it. */
  function buildUsers(version) {
    const profiles = named().filter((p) => !p.host && sameBuild(p.browser, version)).map((p) => p.label || p.id);
    const running = [];
    for (const [id, rec] of Object.entries(ctx.reg.browsers || {})) if (rec && B.isLiveBrowser(rec) && isLocalRec(rec) && BB.runningBuildOf(rec.cdpBrowser) === String(version)) { const p = profile(id); running.push((p && p.label) || id); }
    // verify r1 (H1): the CLI's default IS the newest build — removing it hands every default-choice profile the next one, so a
    // profile a newer major than every build left last opened is said by name (it would start with an older Chrome than wrote it)
    const l = buildsHere(), top = newestHere(l), defaults = [];
    if (top && top.version === String(version)) { const next = l.builds.find((b) => b.usable && b.version !== top.version); for (const p of defaultChoosers()) if (Number.isInteger(p.lastChromiumMajor) && p.lastChromiumMajor > (next ? next.major : -1)) defaults.push(p.label || p.id); }
    // verify r2: a conversation's KEPT browser launches the default too (no executable path) — its directory's own `Last Version`
    // stamp (Chrome writes it) is newer than every build that would be left ⇒ said by name, as a default-choice profile is
    const kept = []; if (top && top.version === String(version)) { const nx = l.builds.find((b) => b.usable && b.version !== top.version), ks = keptStore(); let es = []; try { es = ks && typeof ks.list === 'function' ? ks.list() : []; } catch { es = []; } for (const e of es) { const m = e && e.hasDir ? readDirMajor(keptDirFor(e.browserKey)) : null; if (Number.isInteger(m) && m > (nx ? nx.major : -1)) kept.push(e.label || e.browserKey); } }
    return { profiles, running, defaults, kept };
  }
  // verify r1 (H1): the profiles on the DEFAULT choice here (chromium) — the CLI launches its newest build for them; the newest build
  const defaultChoosers = () => named().filter((p) => !p.host && !!(B.providerRow(p.provider) || {}).buildChoice && (() => { const c = BB.normalizeBrowserChoice(p.browser); return !c || c.kind === 'default'; })());
  const newestHere = (l = buildsHere()) => (l && l.ok ? l.builds.find((b) => b.usable) || null : null);
  const sameBuild = (choice, version) => { const c = BB.normalizeBrowserChoice(choice); return !!c && c.kind === 'build' && c.version === String(version); };
  /** The picker's facts (no fetch): this machine's builds with their sizes, which VibeSpace downloaded (Remove), the free space,
   *  the slot (a download's step and bytes). */
  function chromeBuildFacts() {
    ensureLoaded();
    const l = buildsHere(), fr = freeOf(buildsRoot());
    const installed = l.ok ? l.builds.map((b) => { const u = buildUsers(b.version); return { version: b.version, major: b.major, usable: !!b.usable, bytes: treeOf(path.dirname(b.path)).bytes, downloaded: !!witnessOf(b.version), profiles: [...u.profiles, ...u.defaults, ...u.kept], running: u.running }; }) : [];
    const mine = isMine(ROW.id);
    return { platform: { ...downloadOffer(null), command: installCommandFor(null) }, root: buildsRoot(), free: fr.free, freePath: fr.path, installed, unzip: whichOnPath('unzip') !== null,
      record: { listHost: CBR.listHost, fileHost: CBR.fileHost, measured: CBR.measured },
      install: { running: !!(installState.running && mine), other: otherOf(ROW.id), version: mine ? cbState.version : null, step: mine ? installState.step : null, bytes: mine ? cbState.bytes : 0, total: mine ? cbState.total : null,
        failed: mine && !installState.running && installState.error != null, code: mine && !installState.running ? cbState.code : null, error: mine ? installState.error : null, done: mine && !installState.running && installState.error == null && installState.step === 'done' ? cbState.version : null } };
  }
  /** GET /api/browser/builds/available: the facts alone (the poll — no fetch) | a list read a PERSON asked for, every version
   *  with its compatibility verdict (`lists:'channels'` fresh · `lists:'older'` the majors · `major` its versions · `version`
   *  ONE HEAD: its size + the disk row). Off Linux x64 nothing is fetched. */
  async function chromeBuildsAvailable({ lists = null, major = null, version = null, profileId = null } = {}) {
    const facts = chromeBuildFacts();
    if (!lists && major == null && !version) return facts;
    if (!facts.platform.offered) { const v0 = BB.buildCompatVerdict({ version: CBR.measured.stable, command: facts.platform.command }); throw namedError('build_platform_unsupported', v0.error); }
    const p = profileId ? profile(profileId) : null;
    const prof = p && !isEph(p) ? { label: p.label, lastChromiumMajor: Number.isInteger(p.lastChromiumMajor) ? p.lastChromiumMajor : null } : null;
    const have = new Set(facts.installed.map((b) => b.version));
    let cli = null; try { cli = await bf.probeVersion(); } catch { cli = null; }
    const dTop = newestHere(), dUsers = defaultChoosers().map((x) => x.label || x.id); // verify r1 (H1)
    const verdict = (v, extra = {}) => BB.buildCompatVerdict({ version: v, present: have.has(v), defaultBuild: dTop ? dTop.version : null, defaultUsers: dUsers, freeBytes: facts.free, freePath: facts.freePath, census: CDP.chromeRelation(v), censusChrome: CDP.CENSUS_CHROME, profile: prof, cli: cli || VERBS.TABLE_VERSION, command: facts.platform.command, ...extra });
    if (lists === 'channels') { const c = await channelsList(); return { ...facts, channels: c.rows.map((r) => ({ ...r, verdict: verdict(r.version, { channel: r.channel }) })), refusedRows: c.refused }; }
    if (lists === 'older') { const kg = await knownGoodList(); return { ...facts, majors: BB.majorsOf(kg.versions).map((m) => ({ ...m, verdict: verdict(m.newest) })) }; }
    if (major != null) { const kg = await knownGoodList(); return { ...facts, major: Number(major), versions: kg.versions.filter((v) => v.major === Number(major)).map((v) => ({ ...v, verdict: verdict(v.version) })) }; }
    const v = String(version);
    if (!BB.VERSION_RE.test(v)) throw namedError('build_version_invalid', `"${v.slice(0, 40)}" is not a Chrome version`);
    const url = await urlOfVersion(v);
    const { res, host } = await buildFetch(url, { method: 'HEAD' });
    try { await res.body?.cancel(); } catch { /* none */ }
    if (!res.ok) throw namedError('build_fetch_failed', `${host} answered ${res.status} for Chrome ${v}`);
    const bytes = Number(res.headers.get('content-length')) || null;
    return { ...facts, version: v, host, bytes, verdict: verdict(v, { zipBytes: bytes }) };
  }
  /** The object's own md5 (hex): `x-goog-hash: md5=<base64>` first, else a plain 32-hex etag (a non-composite object's). */
  function md5Of(headers) {
    const gh = String(headers.get('x-goog-hash') || ''), m = /(?:^|,)\s*md5=([A-Za-z0-9+/=]{20,32})/.exec(gh);
    const fromHash = m ? Buffer.from(m[1], 'base64').toString('hex') : null;
    const et = String(headers.get('etag') || '').replace(/^W\//, '').replace(/"/g, '');
    const fromEtag = /^[0-9a-f]{32}$/i.test(et) ? et.toLowerCase() : null;
    if (fromHash && fromEtag && fromHash !== fromEtag) return { md5: null, why: `the server's two checksums disagree (x-goog-hash md5 ${fromHash}, etag ${fromEtag})` };
    return fromHash || fromEtag ? { md5: fromHash || fromEtag, etag: et || null } : { md5: null, why: 'the server sent no checksum for the file (no md5 in x-goog-hash, no plain etag)' };
  }
  const execText = (cmd, argv, opts) => new Promise((resolve) => { try { require('child_process').execFile(cmd, argv, { encoding: 'utf8', maxBuffer: 16 << 20, ...opts }, (er, so, se) => resolve({ ok: !er, out: String(so || ''), err: String(se || ''), error: er ? (er.killed ? 'timed out' : er.code != null ? `exited ${er.code}` : er.message) : null })); } catch (e) { resolve({ ok: false, out: '', err: '', error: e.message }); } });
  const dropPartials = (plan) => { try { fs.rmSync(plan.part, { force: true }); } catch { /* gone */ } try { fs.rmSync(plan.unpackDir, { recursive: true, force: true }); } catch { /* gone */ } };
  /** verify → THE witness → ONE rename: the unpacked folder (all `files` there) runs and SAYS the version; only then is it a build. */
  async function landUnpacked({ version, url = null, bytes = null, etag = null, files = null, cli = null }) {
    const plan = BB.downloadPlan({ version, buildsRoot: buildsRoot() });
    const top = path.join(plan.unpackDir, CBR.layout.replace(/\/$/, ''));
    const t = treeOf(top);
    if (files != null && t.files !== Number(files)) throw namedError('build_unpack_failed', `unzip left ${t.files} of the zip's ${files} files`);
    installState.step = 'verify';
    const exe = path.join(top, 'chrome');
    if (!usableExe(exe)) throw namedError('build_verify_failed', 'the unpacked build has no runnable chrome');
    const r = await execText(exe, ['--version'], { timeout: 30000, env: F.sanitizeProbeEnv({ ...(env() || {}), PATH: (env() || {}).PATH || process.env.PATH || '' }) });
    const s = BB.versionSays(r.out + r.err, version);
    if (!s.ok) throw namedError('build_verify_failed', `the downloaded chrome says ${s.says || (r.error ? 'nothing (' + r.error + ')' : 'nothing')}, not ${version}`);
    writeJsonAtomic(path.join(top, BB.WITNESS_FILE), { version, url, bytes, etag, at: now(), cli: cli || null });
    fs.renameSync(top, plan.targetDir); // THE one rename (same filesystem): the build appears whole, its witness inside
    dropPartials(plan);
  }
  function finishChromeBuild(run, err, code = null) {
    if (run !== cbState.run) return; // a run this keeper abandoned (shutdown) — the next keeper judges what it left
    const plan = BB.downloadPlan({ version: cbState.version, buildsRoot: buildsRoot() });
    if (err && plan.ok) dropPartials(plan);
    try { fs.rmSync(installMarker(), { force: true }); } catch { /* none */ }
    cbState.abort = null; cbState.code = err ? code || 'build_fetch_failed' : null;
    Object.assign(installState, { running: false, finishedAt: now(), exitCode: err ? 1 : 0, error: err ? `${installState.step || 'fetch'}: ${err}` : null, step: err ? installState.step || 'fetch' : 'done', pid: null });
    log[err ? 'warn' : 'log']?.(`[browser] Chrome ${cbState.version} download ${err ? `failed at ${installState.step} — ${err}` : `finished: ${plan.targetDir}`}`);
    notify();
  }
  /** DOWNLOAD a Chrome build (the user's act — the route is cookie-only) into THE install slot. The slot is taken now; the url,
   *  ONE HEAD and the disk row are judged before any byte is written (a refusal then frees the slot and is THROWN — nothing
   *  was fetched); the rest runs on and is said through the slot's state. */
  async function installChromeBuild({ version } = {}) {
    const v = String(version || '');
    const plan = BB.downloadPlan({ version: v, buildsRoot: buildsRoot() });
    if (!plan.ok) throw namedError(plan.code, plan.error);
    if (installState.running) throw namedError('install_running', `an install is already running (${busyWords()}) — one at a time; download again when it is done`);
    const c0 = BB.buildCompatVerdict({ version: v, command: installCommandFor(null) });
    if (c0.hard.length) throw namedError(c0.code, c0.error);
    const l0 = buildsHere();
    if ((l0.ok && l0.builds.some((b) => b.version === v)) || fs.existsSync(plan.targetDir)) throw namedError('build_present', `Chrome ${v} is already on this computer (${plan.targetDir})`);
    const unzip = whichOnPath('unzip');
    if (!unzip) throw namedError('unzip_unavailable', 'unzip is not on PATH — install it (apt install unzip), then download again; nothing was fetched');
    const run = ++cbState.run;
    Object.assign(installState, { running: true, kind: ROW.id, startedAt: now(), finishedAt: null, exitCode: null, spec: `chrome@${v}`, pid: null, error: null, step: 'fetch', refused: [] });
    Object.assign(cbState, { version: v, url: null, bytes: 0, total: null, etag: null, code: null, abort: new AbortController() });
    const free = () => { if (run !== cbState.run) return; cbState.abort = null; Object.assign(installState, { running: false, finishedAt: now(), exitCode: null, error: null, step: null, pid: null, kind: null }); try { fs.rmSync(installMarker(), { force: true }); } catch { /* none */ } };
    let url, head, total, sum;
    try {
      url = await urlOfVersion(v);
      head = await buildFetch(url, { method: 'HEAD', signal: cbState.abort.signal });
      try { await head.res.body?.cancel(); } catch { /* none */ }
      if (!head.res.ok) throw namedError('build_fetch_failed', `${head.host} answered ${head.res.status} for Chrome ${v}`);
      total = Number(head.res.headers.get('content-length'));
      if (!(total > 0)) throw namedError('build_check_failed', `${head.host} announced no length for the file — nothing is fetched without one`);
      sum = md5Of(head.res.headers);
      if (!sum.md5) throw namedError('build_check_failed', `${sum.why} — nothing is fetched without one`);
      const fr = freeOf(plan.root);
      const dv = BB.buildCompatVerdict({ version: v, freeBytes: fr.free, freePath: fr.path, zipBytes: total });
      if (dv.hard.length) throw namedError(dv.code, dv.error, { build: { need: dv.needBytes, free: fr.free, path: fr.path } });
    } catch (e) { free(); notify(); throw e; }
    Object.assign(cbState, { url, total, etag: sum.etag || sum.md5 });
    let cli = null; try { cli = await bf.probeVersion(); } catch { cli = null; }
    markInstall({ kind: ROW.id, spec: installState.spec, version: v, step: 'fetch', pid: null, starttime: null, startedAt: installState.startedAt, stepAt: now(), url, bytes: total, etag: cbState.etag });
    const deadline = setTimeout(() => { try { cbState.abort?.abort(); } catch { /* none */ } }, INSTALL_TIMEOUT_MS);
    if (typeof deadline.unref === 'function') deadline.unref();
    log.log?.(`[browser] downloading Chrome ${v} (${total} bytes) from ${head.host} into ${plan.targetDir} (a user act; log ${installState.log})`);
    notify();
    (async () => {
      let out = null;
      try {
        fs.mkdirSync(plan.root, { recursive: true, mode: 0o755 });
        try { fs.rmSync(plan.part, { force: true }); } catch { /* none */ }
        const g = await buildFetch(url, { signal: cbState.abort.signal });
        if (!g.res.ok) throw namedError('build_fetch_failed', `${g.host} answered ${g.res.status} for Chrome ${v}`);
        const len = Number(g.res.headers.get('content-length'));
        if (Number.isFinite(len) && len !== total) throw namedError('build_check_failed', `the file is ${len} bytes now, ${total} a moment ago`);
        const h = crypto.createHash('md5');
        out = fs.createWriteStream(plan.part, { flags: 'wx', mode: 0o600 });
        const outErr = new Promise((_, rej) => out.on('error', rej)); outErr.catch(() => {});
        for await (const chunk of g.res.body) {
          if (run !== cbState.run) return;
          cbState.bytes += chunk.length;
          if (cbState.bytes > total) throw namedError('build_check_failed', `the server sent more than the ${total} bytes it announced`);
          h.update(chunk);
          if (!out.write(chunk)) await Promise.race([new Promise((r) => out.once('drain', r)), outErr]);
        }
        await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve()))); out = null;
        if (run !== cbState.run) return;
        installState.step = 'check'; notify();
        if (cbState.bytes !== total) throw namedError('build_check_failed', `${cbState.bytes} of the ${total} bytes arrived`);
        const got = h.digest('hex');
        if (got !== sum.md5) throw namedError('build_check_failed', `the file's md5 ${got} is not the server's ${sum.md5}`);
        installState.step = 'unpack'; notify();
        const zenv = F.sanitizeProbeEnv({ ...(env() || {}), PATH: (env() || {}).PATH || process.env.PATH || '' });
        const [z1, zs] = [await execText(unzip, ['-Z1', plan.part], { timeout: 60000, env: zenv }), await execText(unzip, ['-Zs', plan.part], { timeout: 60000, env: zenv })];
        if (!z1.ok || !zs.ok) throw namedError('build_zip_shape', `unzip could not list the zip (${z1.error || zs.error})`);
        const lst = BB.parseZipListing(z1.out, zs.out);
        if (!lst.ok) throw namedError(lst.code, lst.error);
        const shape = BB.zipShapeVerdict(lst.entries, { layout: CBR.layout });
        if (!shape.ok) throw namedError(shape.code, shape.error);
        // verify r1 (L1): what the zip SAYS it unpacks to, against the free space now — before `unzip -q` (a 65 KB zip can declare 64 MB)
        { const fr2 = freeOf(plan.root); if (fr2.free != null && shape.unpacked > fr2.free) throw namedError('disk', `the zip unpacks to ${Math.ceil(shape.unpacked / 1e6)} MB, ${Math.floor(fr2.free / 1e6)} MB left on ${fr2.path} — nothing was extracted`, { build: { need: shape.unpacked, free: fr2.free, path: fr2.path } }); }
        fs.rmSync(plan.unpackDir, { recursive: true, force: true });
        fs.mkdirSync(plan.unpackDir, { mode: 0o700 });
        fs.mkdirSync(installDir, { recursive: true, mode: 0o700 });
        const r = await runStep('unpack', unzip, ['-q', '-n', plan.part, '-d', plan.unpackDir], zenv, { version: v, url, bytes: total, etag: cbState.etag, files: shape.files, cli });
        if (run !== cbState.run) return;
        if (!r.ok) throw namedError('build_unpack_failed', `unzip ${r.error || 'failed'} — see ${installState.log}`);
        await landUnpacked({ version: v, url, bytes: total, etag: cbState.etag, files: shape.files, cli });
        clearTimeout(deadline);
        finishChromeBuild(run, null);
      } catch (e) {
        clearTimeout(deadline);
        const stalled = cbState.abort && cbState.abort.signal.aborted && run === cbState.run;
        finishChromeBuild(run, stalled ? stalledWords('the download') : e && e.message ? e.message : String(e), stalled ? 'build_stalled' : (e && e.code) || null);
      } finally { if (out) { try { out.destroy(); } catch { /* none */ } } } // every way out (an abandoned run's return too) closes the .part
    })();
    return { ok: true, started: true, version: v, bytes: total, host: head.host, target: plan.targetDir, log: installState.log };
  }
  /** A Chrome-build download that was running when VibeSpace went down: an in-process step (fetch / check / verify) died with
   *  it — its partials are removed and it is said; a re-attached `unzip` that finished is verified and landed now. */
  async function finishChromeBuildAfterRestart(m, { stalled = false, letGo = false } = {}) {
    const plan = BB.downloadPlan({ version: m.version, buildsRoot: buildsRoot() });
    let e = null, code = null;
    try {
      if (!plan.ok) e = 'its marker names no version';
      else if (witnessOf(m.version) && usableExe(path.join(plan.targetDir, 'chrome'))) e = null; // it had landed
      else if (m.step === 'unpack' && !stalled && !letGo) { try { await landUnpacked({ version: m.version, url: m.url || null, bytes: m.bytes || null, etag: m.etag || null, files: m.files == null ? null : m.files, cli: m.cli || null }); } catch (x) { e = `VibeSpace restarted during the unpack, and ${x && x.message}`; code = (x && x.code) || 'build_unpack_failed'; } }
      else e = stalled ? `VibeSpace restarted during the download, and its ${stalledWords(`${m.step || 'unpack'} step`)}` : `VibeSpace restarted during the download (step ${m.step || 'fetch'}) — nothing was kept; download it again`;
    } catch (x) { e = String(x && x.message || x); }
    if (e && plan.ok) dropPartials(plan);
    try { fs.rmSync(installMarker(), { force: true }); } catch { /* none */ }
    cbState.code = e ? code || (stalled ? 'build_stalled' : 'build_fetch_failed') : null;
    Object.assign(installState, { running: false, finishedAt: now(), exitCode: e ? 1 : 0, error: e ? `${m.step || 'fetch'}: ${e}` : null, step: e ? (m.step || 'fetch') : 'done', pid: null });
    log[e ? 'warn' : 'log']?.(`[browser] Chrome ${m.version} download after a restart: ${e || 'finished from what it left'}`);
    notify();
  }
  /** REMOVE a build VibeSpace downloaded (the user's act): its witness, no profile choosing it, no running browser reporting it —
   *  else refused by name; renamed to `.removing-<v>`, then deleted (never a delete in place). */
  function removeChromeBuild({ version } = {}) {
    const v = String(version || '');
    const plan = BB.downloadPlan({ version: v, buildsRoot: buildsRoot() });
    if (!plan.ok) throw namedError(plan.code, plan.error);
    ensureLoaded();
    if (!fs.existsSync(plan.targetDir)) throw namedError('browser_build_missing', `Chrome ${v} is not on this computer`);
    if (!witnessOf(v)) throw namedError('build_not_downloaded', `Chrome ${v} was installed by hand (its folder has no ${BB.WITNESS_FILE}) — VibeSpace removes only the builds it downloaded`);
    if (installState.running && isMine(ROW.id) && cbState.version === v) throw namedError('install_running', `Chrome ${v} is being downloaded right now`);
    const u = buildUsers(v);
    if (u.profiles.length || u.running.length || u.defaults.length || u.kept.length) throw namedError('build_in_use', `Chrome ${v} is in use — ${[u.profiles.length ? `chosen by ${u.profiles.map((x) => `"${x}"`).join(', ')}` : '', u.running.length ? `running in ${u.running.map((x) => `"${x}"`).join(', ')}` : '', u.defaults.length ? `the browser CLI's default build of ${u.defaults.map((x) => `"${x}"`).join(', ')}, last opened by a newer Chrome than every build that would be left` : '', u.kept.length ? `the kept browser of ${u.kept.map((x) => `"${x}"`).join(', ')} (its conversation's logins), last opened by a newer Chrome than every build that would be left` : ''].filter(Boolean).join('; ')}${u.profiles.length + u.running.length ? ` — pick another build for ${u.profiles.length + u.running.length > 1 ? 'them' : 'it'} first` : ''}`, { build: { profiles: [...u.profiles, ...u.defaults, ...u.kept], running: u.running } }); // verify r1 (H1): + the default-choice profiles it last opened
    if (fs.existsSync(plan.removingDir)) throw namedError('build_removing', `a removal of Chrome ${v} was cut short — ${plan.removingDir} is still there; remove that folder by hand`);
    fs.renameSync(plan.targetDir, plan.removingDir);
    fs.rmSync(plan.removingDir, { recursive: true, force: true });
    log.log?.(`[browser] removed Chrome ${v} (downloaded by VibeSpace) from ${plan.root} — the user's act`);
    notify();
    return { ok: true, removed: v };
  }
  // ── lane browser-admin 2a: CHANGE BUILD… — which Chrome build a profile runs (the user's act; the route is cookie-only) ──
  const relaunchListeners = new Set();
  /** The relaunch seam (the handback announcer hangs on it): one event per conversation leased on a browser that a
   *  Change build… restarts — `{browserKey, profileId, sessionId, label, from, to, outcome, n, verbs, aborted}`, sent once the
   *  restart's outcome is known (verify r1 F9: `changed` | `restored` | `down`). Never the input
   *  seam: a restart is not a takeover (the live view's relay must not read it as one). */
  function onRelaunch(fn) { relaunchListeners.add(fn); return () => relaunchListeners.delete(fn); }
  /** INTERRUPT ONE HOLDER, before its browser stops (the takeover's rule — never a silent restart under a holder): what it
   *  has in flight is interrupted NOW (a mediated lease's calls cut by the proxy — `M.interruptPlan` — a running script
   *  asked to stop) and what was in flight is read off the trace at the instant; the announcer's ONE card + ONE zero-spend
   *  notice follow with the outcome (`tellRelaunch`). → `{browserKey, n, verbs, ev}`. */
  function interruptForRelaunch(p, l, { from, to }) {
    let ab = null;
    if (mediator && isMediated(p) && typeof mediator.interrupt === 'function') { try { ab = mediator.interrupt({ profileId: p.id, browserKey: l.browserKey }); } catch (e) { log.warn?.(`[browser] ${l.browserKey} on ${p.id}: the relaunch's interrupt failed — ${e && e.message}`); } }
    let inFlight = [];
    if (typeof ctx.inFlightReader === 'function') { try { inFlight = ctx.inFlightReader({ sessionId: l.sessionId || null, browserKey: l.browserKey, profileId: p.id, at: now() }) || []; } catch (e) { inFlight = []; log.warn?.(`[browser] ${l.browserKey}: the in-flight reader failed — ${e && e.message}`); } }
    const verbs = [...new Set(inFlight.map((x) => x && x.verb).filter(Boolean).map(String))];
    const ev = { kind: 'relaunch', cause: 'build', browserKey: l.browserKey, profileId: p.id, sessionId: l.sessionId || null, label: p.label, from: BB.buildWords(from), to: BB.buildWords(to), n: inFlight.length, verbs, aborted: ab && Array.isArray(ab.aborted) ? ab.aborted.length : 0 };
    return { browserKey: l.browserKey, n: inFlight.length, verbs, ev };
  }
  /** verify r1 (F9): THEN TELL IT WHAT HAPPENED — after the restart's outcome (`changed` | `restored`: the new build did not
   *  start, the old one runs again | `down`: neither started); the card + the notice said "restarted on <the new build>,
   *  your tab reopened" before the stop, true or not. → the told rows (`{browserKey, n, verbs, outcome}`). */
  function tellRelaunch(pre, outcome) {
    return pre.map(({ ev, ...row }) => {
      for (const fn of relaunchListeners) { try { fn({ ...ev, outcome, verbs: [...ev.verbs] }); } catch (e) { log.warn?.(`[browser] a relaunch listener threw — ${e && e.message}`); } }
      return { ...row, outcome };
    });
  }
  /** Was this profile's directory ever written by a browser (the version ladder's precondition — a fresh directory has
   *  nothing a build could be older than)? */
  function dirWritten(p) {
    if (Number.isInteger(p.lastChromiumMajor)) return true;
    if (!p.dir || p.host) return false;
    try { return fs.statSync(path.join(String(p.dir), 'Last Version')).isFile(); } catch { return false; }
  }
  /** What Change build… shows: the machine's builds, the profile's choice, the build its browser RUNS (its own answer),
   *  who would be told. Never a write. */
  async function buildsView(profileId) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p || isEph(p)) throw namedError('not-found', `no profile ${profileId}`);
    const rec = ctx.reg.browsers[p.id] || null;
    const listing = await buildsFor(p.host || null);
    return {
      profileId: p.id, label: p.label, provider: p.provider, buildChoice: !!(B.providerRow(p.provider) || {}).buildChoice, host: p.host || null, choice: BB.choiceView(p.browser), missing: p.buildMissing ? { ...p.buildMissing } : null,
      listing, live: B.isLiveBrowser(rec), running: rec ? BB.runningBuildOf(rec.cdpBrowser) : null, holders: ctx.reg.leases.filter((l) => l.profileId === p.id).length,
      browsing: !!humans.get(p.id), switching: switching.has(p.id), lastChromiumMajor: Number.isInteger(p.lastChromiumMajor) ? p.lastChromiumMajor : null,
      driven: (() => { const h = SW.holdOf(ctx.reg.leases.filter((l) => l.profileId === p.id), inputsView({ withHumans: false })); return h.hold === 'driven' ? h.driver : null; })(), // verify r1 (F1): who drives it by hand (a takeover) — the dialog says it, the change is refused
      installCommand: installCommandFor(p.host || null),
      download: downloadOffer(p.host || null), // lane chrome-builds-download: "Download another build…" (this computer, Linux x64)
    };
  }
  /** lane browser-admin 2c (HELD — the user's own act, by hand): the command that adds a Chrome build on a machine — this
   *  machine's REAL browser CLI by its path (in a VibeSpace terminal the bare name is the agent's shim), a paired
   *  machine's by name. The CLI's `install` takes no version: it installs the current Chrome for Testing. */
  function installCommandFor(hostId = null) {
    // the USER's command (the panel only — never an agent answer): the real CLI by its path here, by its name there
    const bare = `${VERBS.REAL_BINARY} install`;
    if (hostId) return bare;
    const b = typeof bf.binPath === 'function' ? bf.binPath() : null;
    return b ? `${/[\s"'$`\\]/.test(b) ? JSON.stringify(b) : b} install` : bare;
  }
  /** The New profile… dialog's build section: a machine's builds before any profile exists. */
  // lane remote-profile-start: + `ready` — can a browser run on that machine at all (its CLI, a Chrome), with the ONE step for
  // ITS platform; null for this computer (its own CLI flows) and for an agent that predates the fact (never claimed missing)
  async function machineBuilds(hostId = null) { const listing = await buildsFor(hostId || null); return { host: hostId || null, listing, installCommand: installCommandFor(hostId || null), download: downloadOffer(hostId || null), ready: hostId && listing && listing.ready ? listing.ready : null }; }
  /**
   * CHANGE BUILD… (lane browser-admin 2a). THE verdict (well-formed · the user's · chromium · on that machine's list /
   * a runnable file · the §7.4 version ladder when the directory was ever written — a downgrade refused by name, an
   * unknown one only with `confirmed`), then: a browser that is not running just records the choice (the next launch
   * runs it); a RUNNING browser restarts — every conversation leased on it is told first (`tellRelaunch`), its agent
   * commands meanwhile answer `browser_restarting`, the browser stops (`why:'switch'` — a takeover stands, the session
   * ends "switched"), the choice is written, the browser starts on the new build and every lease's tab reopens at its
   * last URL. A start that fails puts the old choice back and starts that once (`restored`), answering the refusal.
   * The user browsing it himself is refused by name (his tab would close under him — the Restart rule); so is a browser
   * the user DRIVES from a live view (`browser_driven`, verify r1 — the switch's `driving` rule: never under his hands).
   */
  async function setBrowserChoice({ profileId, choice, confirmed = false, by = 'user' } = {}) {
    ensureLoaded();
    const p = profile(profileId);
    if (!p || isEph(p)) throw namedError('not-found', `no profile ${profileId}`);
    if (switching.has(p.id)) { const rr = SW.restartingRefusal(p); throw namedError(rr.code, rr.error); }
    const refuseBrowsing = () => { if (humans.get(p.id) || browsing.has(p.id)) throw namedError('browsing_yourself', HM.humanRefusalText('browsing_yourself', { label: p.label, act: 'restart' })); }; // verify r2 (H2): his tab being OPENED (Browse yourself in flight) is his too
    refuseBrowsing();
    // verify r1 (F1): a browser the user is DRIVING right now (a takeover from a live view) is never restarted under his
    // hands — the backend switch's own rule (switchVerdict's `driving` ⇒ a proposal, never a stop); here the user's act is
    // refused BY NAME, the driver named, and asked again after the listing's await (a takeover can land during it)
    const drivenNow = () => SW.holdOf(ctx.reg.leases.filter((l) => l.profileId === p.id), inputsView({ withHumans: false }));
    const refuseDriven = (h) => { throw namedError('browser_driven', `"${p.label}" is being driven by hand right now (the live view of ${h.driver}) — hand the browser back first, then change its build`, { driver: h.driver }); };
    { const h = drivenNow(); if (h.hold === 'driven') refuseDriven(h); } // (1) before anything is read
    const c = BB.normalizeBrowserChoice(choice);
    if (!c) throw namedError('browser_choice_invalid', 'a browser build is {kind:"default"} | {kind:"build", version} | {kind:"path", path}');
    if (BB.sameChoice(c, p.browser)) throw namedError('build_noop', `"${p.label}" already runs ${BB.buildWords(c)}`);
    const builds = c.kind === 'build' ? await buildsFor(p.host || null) : null;
    const dirMajor = p.host ? null : readDirMajor(p.dir);
    const v = BB.browserChoiceVerdict({ choice: c, provider: p.provider, by, builds, pathFact: c.kind === 'path' && !p.host ? BB.fileFact(c.path) : null, machine: p.host || 'this computer', label: p.label,
      recordedMajor: Number.isInteger(p.lastChromiumMajor) ? p.lastChromiumMajor : null, dirMajor, written: dirWritten(p), ladder: true, confirmed: !!confirmed });
    if (!v.ok) throw namedError(v.code, v.error, { needsConfirm: !!v.needsConfirm, waysOut: v.waysOut || [], version: c.kind === 'build' ? c.version : null, wrote: v.wrote != null ? v.wrote : null });
    if (switching.has(p.id)) { const rr = SW.restartingRefusal(p); throw namedError(rr.code, rr.error); } // re-asked after the listing's await
    { const h = drivenNow(); if (h.hold === 'driven') refuseDriven(h); } // (2) re-asked after the listing's await
    refuseBrowsing(); // verify r2 (H2): …and his own browsing, begun during it
    const was = p.browser ? { ...p.browser } : null;
    const from = BB.choiceView(was), to = BB.choiceView(c);
    const rec0 = ctx.reg.browsers[p.id];
    const wasLive = B.isLiveBrowser(rec0);
    const leases = ctx.reg.leases.filter((l) => l.profileId === p.id);
    const setChoice = (x) => { if (!x || x.kind === 'default') delete p.browser; else p.browser = { ...x }; delete p.buildMissing; };
    switching.add(p.id);
    let told = [];
    try {
      if (!wasLive) {
        setChoice(c); commit();
        log.log?.(`[browser] ${p.id} "${p.label}": its Chrome build is now ${BB.buildWords(to)} (was ${BB.buildWords(from)}) — not running, the next launch runs it`);
        return { ok: true, profile: pview(p), from, to, restarted: false, told: [], reopened: [] };
      }
      const pre = leases.map((l) => interruptForRelaunch(p, l, { from, to })); // what each holder had in flight is cut NOW, before the stop
      await stop(p.id, { why: 'switch' });
      setChoice(c); commit();
      let browser;
      try { browser = await start(p.id, { why: `build ${BB.buildWords(from)} → ${BB.buildWords(to)}` }); }
      catch (e) {
        setChoice(was); commit();
        let restored = false;
        try { await start(p.id, { why: 'build change rolled back' }); restored = true; }
        catch (e2) { log.warn?.(`[browser] ${p.id} "${p.label}": the build change did not start (${e && e.code}) and the roll back to ${BB.buildWords(from)} did not start either — ${e2 && e2.message}`); }
        if (restored) await reopenLeaseTabs(p, leases);
        told = tellRelaunch(pre, restored ? 'restored' : 'down'); // verify r1 (F9): said as it happened
        log.log?.(`[browser] ${p.id} "${p.label}": the build change ${BB.buildWords(from)} → ${BB.buildWords(to)} did not start (${e && e.code}: ${String(e && e.message).slice(0, 160)}) — put back${restored ? ' and started again' : ' (not started)'}`);
        if (e && typeof e === 'object') { e.restored = restored; throw e; }
        throw namedError('launch_failed', String(e), { restored });
      }
      const reopened = await reopenLeaseTabs(p, leases);
      told = tellRelaunch(pre, 'changed'); // verify r1 (F9): said once the new build runs
      // verify r2 (B5): the change is SETTLING — a loss of this browser inside CHANGE_SETTLE_MS falls back to `was` (the heal
      // asks first), and every conversation on it is told that second outcome too
      { const recN = ctx.reg.browsers[p.id]; if (recN) recN.buildChange = { at: now(), was: was ? { ...was } : null, from, to, pid: recN.browser ? recN.browser.pid : null }; }
      commit();
      log.log?.(`[browser] ${p.id} "${p.label}": Chrome build ${BB.buildWords(from)} → ${BB.buildWords(to)} by the user — restarted, ${told.length} conversation(s) told, ${reopened.filter((r) => r.ok).length}/${reopened.length} tab(s) reopened${browser && browser.runningBuild ? ', running ' + browser.runningBuild : ''}`);
      return { ok: true, profile: pview(p), from, to, restarted: true, told, reopened, browser };
    } finally { switching.delete(p.id); commit(); }
  }
  /** verify r2 (B5): THE FALL-BACK — the new build closed within CHANGE_SETTLE_MS of the change: under `switching` (an agent
   *  command answers browser_restarting, a takeover is refused by name — H2), every holder's calls cut, the browser stopped,
   *  the choice put back to the build it replaced, that build started, the lease tabs reopened ONCE in it, and every
   *  conversation told the second outcome (`fell-back` — on the old build again | `fell-down` — on neither); the user gets
   *  ONE For-you notice naming the build. Single-flight with the heal (`healing`). */
  function fallBackFromChange(rec, p, seenBy) {
    if (healing.has(p.id)) return healing.get(p.id);
    const bc = rec.buildChange; rec.buildChange = null; ctx.dirty = true;
    const pr = (async () => {
      if (switching.has(p.id) || stopping.has(p.id)) return null;
      switching.add(p.id);
      let restored = false;
      try {
        const leases = ctx.reg.leases.filter((l) => l.profileId === p.id);
        const pre = leases.map((l) => interruptForRelaunch(p, l, { from: bc.from, to: bc.to }));
        log.warn?.(`[browser] ${p.id} "${p.label}": ${BB.buildWords(bc.to)} closed within ${Math.round((now() - Number(bc.at || 0)) / 1000)} s of the change (seen by ${seenBy}) — falling back to ${BB.buildWords(bc.from)}`);
        await stop(p.id, { why: 'switch' });
        if (bc.was && bc.was.kind && bc.was.kind !== 'default') p.browser = { ...bc.was }; else delete p.browser;
        delete p.buildMissing;
        commit();
        try { await start(p.id, { why: `build change rolled back (${BB.buildWords(bc.to)} closed within seconds)` }); restored = true; }
        catch (e) { log.warn?.(`[browser] ${p.id} "${p.label}": the fall back to ${BB.buildWords(bc.from)} did not start either — ${e && e.message}`); }
        const reopened = restored ? await reopenLeaseTabs(p, leases) : [];
        const toldFb = tellRelaunch(pre, restored ? 'fell-back' : 'fell-down');
        log.log?.(`[browser] ${p.id} "${p.label}": fell back to ${BB.buildWords(bc.from)} — ${restored ? 'started' : 'NOT started'}, ${toldFb.length} conversation(s) told, ${reopened.filter((x) => x.ok).length}/${reopened.length} tab(s) reopened`);
        if (userTodos && typeof userTodos.add === 'function') {
          const text = `Agent browser "${p.label}": ${BB.buildWords(bc.to)} closed within seconds of starting — ${restored ? `it is back on ${BB.buildWords(bc.from)}` : `${BB.buildWords(bc.from)} did not start again either; it is not running (the next browser command starts it on ${BB.buildWords(bc.from)})`}`;
          try { userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', text, detail: `The Chrome build of "${p.label}" was changed from ${BB.buildWords(bc.from)} to ${BB.buildWords(bc.to)}; that build started and then closed, so VibeSpace put the profile back on ${BB.buildWords(bc.from)}${restored ? ' and started it again' : ''}. Change build… in the Agent browser panel tries another one.`, sessionName: 'Agent browser' }); }
          catch (e) { log.warn?.(`[browser] ${p.id}: the fall back's For-you notice was not filed — ${e && e.message}`); }
        }
      } finally { switching.delete(p.id); commit(); }
      return null;
    })();
    healing.set(p.id, pr);
    return pr.finally(() => { if (healing.get(p.id) === pr) healing.delete(p.id); });
  }
  const ROW = { id: 'chrome-build', words: () => 'Chrome ' + cbState.version, logName: 'Chrome build', inProcess: true,
    beforeReattach: (m) => Object.assign(cbState, { version: String(m.version || ''), url: m.url || null, bytes: 0, total: m.bytes || null, etag: m.etag || null, code: null, abort: null }),
    afterRestart: finishChromeBuildAfterRestart,
    shutdown: () => { if (cbState.abort) { cbState.run++; try { cbState.abort.abort(); } catch { /* none */ } } } };
  return { row: ROW, api: { buildsView, machineBuilds, setBrowserChoice, onRelaunch, chromeBuildFacts, chromeBuildsAvailable, installChromeBuild, removeChromeBuild, fallBackFromChange, downloadOffer, installCommandFor } };
}

module.exports = { create };
