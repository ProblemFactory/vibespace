#!/usr/bin/env node
// LANE CHROME-BUILDS-DOWNLOAD (design 004, B-80c1 — the owner: 「能不能自动从网上下载对应的版本？…下载前让用户检查是否互相兼容」).
// "Download another build…", the download half. Fast, no browser: the REAL keeper on a scratch HOME against a loopback fake
// "Chrome for Testing" — an http server serving the two measured list documents (scripts/fixtures/chrome-for-testing/) and zips
// built HERE (a stored-zip writer, so hostile entry names can be planted) whose `chrome` is a script printing
// `Google Chrome for Testing <version>` — the keeper's `chromeBuildsResolve` seam pointing the two names at it (the egress verdict
// is always taken on the NAME, before the request). A spy `unzip` first on the keeper's PATH logs every call.
//
//   ① the lists: nothing is fetched at boot or for the facts (the poll); the channel list is read fresh per picker, every row
//      with its verdict in structure (census relation, CloakBrowser reach, this profile's ladder); the known-good list is kept
//      24 h, then asked with If-Modified-Since (a 304 keeps it);
//   ② the whole path: the slot taken (the marker names `chrome-build`), md5 vs the object's own, `unzip -Z1`/`-Zs` before `-q`,
//      `chrome --version`, THE witness inside, ONE rename — then the build is simply one more row (listed, choosable);
//   ③ integrity: a wrong etag, a truncated body, a flipped byte — each refused by name, nothing kept, nothing listed;
//   ④ the zip: `..`, an absolute name, a link entry, a second top folder — refused BEFORE `unzip -q` runs (the spy's proof);
//      a chrome that says another version — removed and said;
//   ⑤ the egress: a list naming another host (the row refused, the download refused by name); a 302 elsewhere (refused,
//      nothing fetched there); a 302 on the file host followed;
//   ⑥ the slot: a second download / the CLI install while one runs ⇒ install_running; unzip absent ⇒ refused before any
//      fetch; the disk row with its numbers before any byte;
//   ⑦ a restart mid-download: in the fetch ⇒ failed cleanly (partials gone, the slot free); in the unpack ⇒ re-attached to the
//      running unzip and finished (verified, witnessed, listed);
//   ⑧ removal: a pinned build, a running one, a hand-installed folder refused by name; a downloaded one removed via `.removing-`;
//   ⑨ controls (patched keeper copies the gates above must turn red): a fetch without the egress verdict, a keeper that skips
//      the zip's shape, a keeper that skips the md5 check.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
import { chromeZip } from './fixtures/chrome-for-testing/fake-zip.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } return !!c; };
const thr = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 15000, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await pred(); if (v) return v; await sleep(every); } return pred(); };

const BB = require('../src/browser-builds.js');
const V = require('../src/browser-verbs.js');
const K = require('../src/server/browser-keeper.js');
const CBR = V.CHROME_BUILDS_RECORD;
const UNZIP = ['/usr/bin/unzip', '/bin/unzip'].find((p) => fs.existsSync(p));
if (!UNZIP) { console.log('  ⊘ SKIP the whole suite: no unzip on this machine (the feature refuses `unzip_unavailable` there)'); console.log('ALL PASS (0)'); process.exit(0); }
const ROOT = scratch('cbdl');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home');
const BROWSERS = path.join(HOME, '.agent-browser', 'browsers');
fs.mkdirSync(HOME, { recursive: true });
const servers = new Set();
process.on('exit', () => { for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

const md5 = (b) => crypto.createHash('md5').update(b).digest();

// ── the loopback "Chrome for Testing" ──
const FIX = path.join(REPO, 'scripts/fixtures/chrome-for-testing');
const LKG0 = JSON.parse(fs.readFileSync(path.join(FIX, 'last-known-good-versions-with-downloads.json'), 'utf8'));
const KG = JSON.parse(fs.readFileSync(path.join(FIX, 'known-good-versions-with-downloads.trimmed.json'), 'utf8'));
const KG_LM = 'Sat, 03 Oct 2026 04:26:48 GMT';
let LKG = LKG0;
const hits = [];
const MODES = new Map(); // version → {mode, zip}
const plant = (v, mode, zip = chromeZip(v)) => MODES.set(v, { mode, zip });
const zipUrl = (v) => `/chrome-for-testing-public/${v}/linux64/chrome-linux64.zip`;
const srv = http.createServer((req, res) => {
  const [, host, ...rest] = String(req.url).split('/'); const p = '/' + rest.join('/');
  hits.push({ method: req.method, host, path: p, ims: req.headers['if-modified-since'] || null });
  const json = (o, h = {}) => { const b = Buffer.from(JSON.stringify(o)); res.writeHead(200, { 'content-type': 'application/json', 'content-length': b.length, ...h }); res.end(req.method === 'HEAD' ? undefined : b); };
  if (host === CBR.listHost && p === CBR.lists.lastKnownGood) return json(LKG);
  if (host === CBR.listHost && p === CBR.lists.knownGood) { if (req.headers['if-modified-since'] === KG_LM) { res.writeHead(304); return res.end(); } return json(KG, { 'last-modified': KG_LM }); }
  const m = host === CBR.fileHost && (/^\/chrome-for-testing-public\/([\d.]+)\/linux64\/chrome-linux64\.zip$/.exec(p) || /^\/alt\/([\d.]+)\.zip$/.exec(p));
  const z = m && MODES.get(m[1]);
  if (!z) { res.writeHead(404); return res.end(); }
  const { mode, zip } = z;
  if (mode === 'redirect-away') { res.writeHead(302, { location: 'https://evil.example.com/x.zip' }); return res.end(); }
  if (mode === 'redirect-ok' && !p.startsWith('/alt/')) { res.writeHead(302, { location: `/alt/${m[1]}.zip` }); return res.end(); }
  const sum = mode === 'badetag' ? md5(Buffer.concat([zip, Buffer.from('x')])) : md5(zip);
  const len = mode === 'huge' ? 1e15 : zip.length;
  res.writeHead(200, { 'content-length': String(len), etag: `"${sum.toString('hex')}"`, 'x-goog-hash': `crc32c=AAAAAA==, md5=${sum.toString('base64')}` });
  if (req.method === 'HEAD') return res.end();
  if (mode === 'truncate') { res.write(zip.subarray(0, zip.length >> 1)); return setTimeout(() => res.socket.destroy(), 30); }
  if (mode === 'flip') { const b = Buffer.from(zip); b[b.length >> 1] ^= 0xff; return res.end(b); }
  if (mode === 'slow') { let i = 0; const step = () => { if (res.destroyed) return; if (i >= zip.length) return res.end(); res.write(zip.subarray(i, i + 16384)); i += 16384; setTimeout(step, 40); }; return step(); }
  res.end(zip);
});
servers.add(srv);
const PORT = await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const RESOLVE = (u) => { const x = new URL(u); return `http://127.0.0.1:${PORT}/${x.hostname}${x.pathname}${x.search}`; };
const fileHits = (v, method = 'GET') => hits.filter((h) => h.host === CBR.fileHost && h.method === method && h.path.includes(`/${v}`)).length;

// ── the spy unzip (first on the keeper's PATH): logs each call; sleeps before `-q` while the slow flag exists ──
const SPY = path.join(ROOT, 'spy-bin'), SPY_LOG = path.join(ROOT, 'unzip.log'), SLOW = path.join(ROOT, 'unzip-slow');
fs.mkdirSync(SPY, { recursive: true });
fs.writeFileSync(path.join(SPY, 'unzip'), `#!/bin/sh\necho "$*" >> '${SPY_LOG}'\nif [ "$1" = "-q" ] && [ -f '${SLOW}' ]; then sleep 2; fi\nexec '${UNZIP}' "$@"\n`, { mode: 0o755 });
const spyCalls = (v) => { try { return fs.readFileSync(SPY_LOG, 'utf8').split('\n').filter((l) => l.includes(`chrome-${v}.part`)).map((l) => l.split(' ')[0]); } catch { return []; } };
const PATH_ENV = `${SPY}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
let clock = Date.now();
const quiet = { log() { }, warn() { }, error() { } };
function mkKeeper(dataDir, extra = {}, KK = K) {
  fs.mkdirSync(dataDir, { recursive: true });
  return KK.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: quiet, hostKnown: () => false, chromeBuildsResolve: RESOLVE, now: () => clock, ...extra });
}
const DATA = path.join(ROOT, 'data');
const plan = (v) => BB.downloadPlan({ version: v, buildsRoot: BROWSERS });
const leftovers = (v) => { const p = plan(v); return [p.part, p.unpackDir, p.removingDir].filter((f) => fs.existsSync(f)); };
const listed = (v) => BB.listBuilds({ homeDir: HOME }).builds.some((b) => b.version === v && b.usable);
const marker = () => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'browser-tools', 'install-running.json'), 'utf8')); } catch { return null; } };
let kk = mkKeeper(DATA);
const done = async (k = kk) => { await until(() => !k.chromeBuildFacts().install.running); return k.chromeBuildFacts().install; };

// ═══ ① the lists ═════════════════════════════════════════════════════════════
console.log('— ① the lists: no fetch at boot / for the facts; the channel list fresh; the known-good list kept 24 h');
{
  const f = await kk.chromeBuildsAvailable({});
  ok(hits.length === 0 && f.platform.offered === (process.platform === 'linux' && process.arch === 'x64') && f.root === BROWSERS && f.unzip === true && Array.isArray(f.installed) && f.install.running === false,
    'a keeper booted and its facts read (the progress poll): ZERO requests to either host; the facts say the platform, the builds folder, unzip, the slot', { hits, f: { ...f, installed: undefined } });
  const pr = kk.createProfile({ label: 'Old logins' });
  kk._reg().profiles.find((p) => p.id === pr.id).lastChromiumMajor = 156;
  const c = await kk.chromeBuildsAvailable({ lists: 'channels', profileId: pr.id });
  const st = (c.channels || []).find((r) => r.channel === 'Stable');
  const chip = (row, kind) => (row && row.verdict.chips || []).find((x) => x.kind === kind);
  ok(hits.filter((h) => h.path === CBR.lists.lastKnownGood).length === 1 && (c.channels || []).map((r) => r.channel).join() === 'Stable,Beta,Dev,Canary' && st.version === LKG0.channels.Stable.version && st.url.startsWith(`https://${CBR.fileHost}/`),
    'the picker opens: ONE read of the 10 KB channel list — four rows, each url on the file host', c.channels);
  ok(chip(st, 'census').relation === 'newer' && chip(st, 'census').census === '154.0.8037.57' && chip(st, 'cloak').reach === 'none' && chip(st, 'profile').wrote === 156 && chip(st, 'cli') && st.verdict.offer === true,
    'Stable 154.0.8037.92: newer than the census (154.0.8037.57), can\'t switch to CloakBrowser later, older than the Chrome that last opened "Old logins" (156) — chips, not refusals (offered)', st.verdict);
  await kk.chromeBuildsAvailable({ lists: 'channels' });
  ok(hits.filter((h) => h.path === CBR.lists.lastKnownGood).length === 2, 'opened again: read again (fresh every time a person opens it)');
  const o = await kk.chromeBuildsAvailable({ lists: 'older' });
  const kgReads = () => hits.filter((h) => h.path === CBR.lists.knownGood);
  ok((o.majors || []).map((m) => m.major).join() === '157,154,153,151,146,113' && o.majors.find((m) => m.major === 146).newest === '146.0.7680.165' && fs.existsSync(path.join(DATA, 'browser-tools', 'chrome-builds', 'known-good.json')) && kgReads().length === 1 && !kgReads()[0].ims,
    '"Older versions…": the known-good list read once, kept under data/browser-tools/chrome-builds/, one row per major (newest first, its newest version)', o.majors);
  const v146 = await kk.chromeBuildsAvailable({ major: 146 });
  const v151 = await kk.chromeBuildsAvailable({ major: 151 });
  const v153 = await kk.chromeBuildsAvailable({ major: 153 });
  ok(v146.versions.length === 4 && v146.versions.every((v) => chip(v, 'cloak').reach === 'both') && v151.versions.every((v) => chip(v, 'cloak').reach === 'pro') && chip(v153.versions.find((v) => v.version === '153.0.8010.47'), 'census').relation === 'censused' && kgReads().length === 1,
    'a major expands to its versions from the KEPT list (no read): 146 can still switch to CloakBrowser Free or Pro, 151 to Pro only; 153.0.8010.47 is censused');
  clock += 25 * 3600e3;
  const o2 = await kk.chromeBuildsAvailable({ lists: 'older' });
  ok(kgReads().length === 2 && kgReads()[1].ims === KG_LM && o2.majors.length === 6, 'after 24 h: asked again WITH If-Modified-Since; the 304 keeps the list', kgReads());
}

// ═══ ② the whole path ════════════════════════════════════════════════════════
console.log('— ② the whole path: slot → fetch → check → unpack → verify → witness → rename');
const STABLE = LKG0.channels.Stable.version;
{
  plant(STABLE, 'ok');
  const r = await kk.installChromeBuild({ version: STABLE });
  const f0 = kk.chromeBuildFacts();
  const m0 = marker();
  ok(r.started && r.host === CBR.fileHost && f0.install.running && f0.install.version === STABLE && m0 && m0.kind === 'chrome-build' && m0.version === STABLE && m0.bytes === MODES.get(STABLE).zip.length,
    'the POST: the slot taken (the facts say it), THE marker names a `chrome-build` of that version and its length', { r, f0: f0.install, m0 });
  const i = await done();
  const w = JSON.parse(fs.readFileSync(path.join(BROWSERS, `chrome-${STABLE}`, BB.WITNESS_FILE), 'utf8'));
  ok(i.done === STABLE && !i.failed && listed(STABLE) && w.version === STABLE && w.url === `https://${CBR.fileHost}${zipUrl(STABLE)}` && w.bytes === MODES.get(STABLE).zip.length && w.etag && leftovers(STABLE).length === 0 && !marker(),
    'done: the build is listed (chrome-<v>/chrome runnable), its witness inside names the version, url, length and etag; no .part, no .unpack, no marker', { i, w, left: leftovers(STABLE) });
  ok(spyCalls(STABLE).join() === '-Z1,-Zs,-q' && fileHits(STABLE, 'HEAD') === 1 && fileHits(STABLE, 'GET') === 1, 'one HEAD, one GET; unzip listed the zip twice BEFORE it extracted', spyCalls(STABLE));
  const pf = kk.createProfile({ label: 'Fresh', browser: { kind: 'build', version: STABLE } });
  ok(pf && pf.browser && pf.browser.version === STABLE, 'it is simply one more build: a profile picks it (the choice verdict, unchanged)');
  const again = await thr(() => kk.installChromeBuild({ version: STABLE }));
  ok(again && again.code === 'build_present', 'downloading it again: refused `build_present`');
  const c = await kk.chromeBuildsAvailable({ lists: 'channels' });
  const row = c.channels.find((x) => x.version === STABLE);
  ok(row.verdict.chips.some((x) => x.kind === 'present') && row.verdict.offer === false && c.installed.find((b) => b.version === STABLE).downloaded === true && c.installed.find((b) => b.version === STABLE).bytes > 5000,
    'the picker now says "Already on this computer" on its row (it offers nothing) and lists it with its size, downloaded by VibeSpace');
}

// ═══ ③ integrity ═══════════════════════════════════════════════════════════════
console.log('— ③ integrity: a wrong etag, a truncated body, a flipped byte');
for (const [v, mode, code] of [[LKG0.channels.Beta.version, 'badetag', 'build_check_failed'], [LKG0.channels.Dev.version, 'truncate', null], [LKG0.channels.Canary.version, 'flip', 'build_check_failed']]) {
  plant(v, mode);
  await kk.installChromeBuild({ version: v });
  const i = await done();
  ok(i.failed && i.version === v && (code ? i.code === code : !!i.code) && /^(fetch|check): /.test(i.error) && !listed(v) && leftovers(v).length === 0 && spyCalls(v).length === 0 && !marker(),
    `${mode}: refused by name (${i.code}: ${String(i.error).slice(0, 90)}) — nothing kept, nothing listed, unzip never ran`, i);
}

// ═══ ④ the zip ═══════════════════════════════════════════════════════════════
console.log('— ④ the zip: refused before `unzip -q`; a chrome that says another version');
{
  const bad = [
    ['113.0.5672.35', 'a ".." entry', [{ name: 'chrome-linux64/../../escaped', data: 'x' }]],
    ['113.0.5672.63', 'an absolute entry', [{ name: '/tmp/vs-cbdl-absolute', data: 'x' }]],
    ['146.0.7633.0', 'a link entry', [{ name: 'chrome-linux64/lnk', data: '/etc/passwd', mode: 0o120777 }]],
    ['146.0.7635.0', 'a second top folder', [{ name: 'other/x', data: 'x' }]],
  ];
  for (const [v, what, extra] of bad) {
    plant(v, 'ok', chromeZip(v, { extra }));
    await kk.installChromeBuild({ version: v });
    const i = await done();
    ok(i.failed && i.code === 'build_zip_shape' && spyCalls(v).join() === '-Z1,-Zs' && !fs.existsSync(plan(v).unpackDir) && !listed(v) && leftovers(v).length === 0 && !fs.existsSync(path.join(HOME, '.agent-browser', 'escaped')) && !fs.existsSync('/tmp/vs-cbdl-absolute'),
      `${what}: refused \`build_zip_shape\` from unzip's own listing — \`unzip -q\` never ran, nothing written`, { i, spy: spyCalls(v) });
  }
  const v = '113.0.5672.0';
  plant(v, 'ok', chromeZip(v, { says: '113.0.5672.1' }));
  await kk.installChromeBuild({ version: v });
  const i = await done();
  ok(i.failed && i.code === 'build_verify_failed' && /says 113\.0\.5672\.1, not 113\.0\.5672\.0/.test(i.error) && !listed(v) && !fs.existsSync(plan(v).targetDir) && leftovers(v).length === 0,
    'a chrome that says another version: refused at verify, removed — never listed, not even for a moment (the rename comes after the witness)', i);
}

// ═══ ⑤ the egress ═══════════════════════════════════════════════════════════
console.log('— ⑤ the egress: an off-host url in a list, a 302 elsewhere, a 302 on the file host');
{
  LKG = JSON.parse(JSON.stringify(LKG0));
  const beta = LKG.channels.Beta.downloads.chrome.find((d) => d.platform === 'linux64');
  beta.url = 'https://evil.example.com/chrome-linux64.zip';
  const c = await kk.chromeBuildsAvailable({ lists: 'channels' });
  const e = await thr(() => kk.installChromeBuild({ version: LKG.channels.Beta.version }));
  ok(!c.channels.some((r) => r.channel === 'Beta') && c.refusedRows.some((r) => r.channel === 'Beta' && r.code === 'build_url_offhost') && e && e.code === 'build_url_offhost' && /evil\.example\.com/.test(e.message) && !hits.some((h) => h.host === 'evil.example.com') && !kk.chromeBuildFacts().install.running,
    'a channel list naming another host: that row refused BY NAME (never offered), its download refused `build_url_offhost`, nothing fetched there, the slot free', { refused: c.refusedRows, e: e && e.message });
  LKG = LKG0; await kk.chromeBuildsAvailable({ lists: 'channels' });
  const v = '146.0.7680.153';
  plant(v, 'redirect-away');
  const e2 = await thr(() => kk.installChromeBuild({ version: v }));
  ok(e2 && e2.code === 'build_url_offhost' && /evil\.example\.com/.test(e2.message) && !hits.some((h) => h.host === 'evil.example.com') && !listed(v) && leftovers(v).length === 0 && !kk.chromeBuildFacts().install.running,
    'a 302 from the file host to another host: refused by name before the hop is fetched; nothing written', e2 && e2.message);
  const v2 = '146.0.7680.165';
  plant(v2, 'redirect-ok');
  await kk.installChromeBuild({ version: v2 });
  const i = await done();
  ok(i.done === v2 && listed(v2) && hits.some((h) => h.path === `/alt/${v2}.zip`), 'a 302 on the file host itself is followed (re-judged) and lands', i);
}

// ═══ ⑥ the slot ═══════════════════════════════════════════════════════════════
console.log('— ⑥ the slot: one at a time; unzip absent; the disk row');
{
  const v = '151.0.7922.138';
  plant(v, 'slow', chromeZip(v, { big: 300000 }));
  await kk.installChromeBuild({ version: v });
  const e = await thr(() => kk.installChromeBuild({ version: '151.0.7872.0' }));
  const e2 = await thr(() => kk.installCli({}));
  ok(e && e.code === 'install_running' && /Chrome 151\.0\.7922\.138/.test(e.message) && e2 && e2.code === 'install_running', 'while a download runs: a second download and the browser CLI install are refused `install_running` (THE one slot), by name', { e: e && e.message, e2: e2 && e2.code });
  await until(() => fs.existsSync(plan(v).part) && kk.chromeBuildFacts().install.bytes > 0, 5000, 5);
  const mid = kk.chromeBuildFacts().install;
  ok(fs.existsSync(plan(v).part) && mid.step === 'fetch' && mid.bytes > 0 && mid.total === MODES.get(v).zip.length, 'mid-download: the bytes stream into chrome-<v>.part; the facts say N of M bytes (the progress line)', mid);
  ok((await done()).done === v, '…and it lands');
  const kn = mkKeeper(path.join(ROOT, 'data-nozip'), { env: () => ({ PATH: path.dirname(process.execPath), HOME }) });
  const n0 = hits.length;
  const e3 = await thr(() => kn.installChromeBuild({ version: '151.0.7872.0' }));
  ok(e3 && e3.code === 'unzip_unavailable' && hits.length === n0 && !kn.chromeBuildFacts().install.running, 'unzip absent: refused `unzip_unavailable` before ANY request (not even the list)', e3 && e3.message);
  kn.shutdown();
  const vh = '151.0.7872.0';
  plant(vh, 'huge');
  const e4 = await thr(() => kk.installChromeBuild({ version: vh }));
  ok(e4 && e4.code === 'disk' && e4.build && e4.build.need === 3e15 && e4.build.free > 0 && /needs about 3000000000 MB free, \d+ MB left on \//.test(e4.message) && fileHits(vh, 'GET') === 0 && !fs.existsSync(plan(vh).part) && !kk.chromeBuildFacts().install.running,
    'the disk row: refused `disk` with the numbers (need = length × 3, free, the path) after ONE HEAD — no byte fetched, the slot free', e4 && e4.message);
}

// ═══ ⑦ a restart mid-download ═════════════════════════════════════════════════
console.log('— ⑦ a restart mid-download: in the fetch ⇒ failed cleanly; in the unpack ⇒ re-attached and finished');
{
  const v = '151.0.7873.0';
  plant(v, 'slow', chromeZip(v, { big: 600000 }));
  await kk.installChromeBuild({ version: v });
  await until(() => kk.chromeBuildFacts().install.bytes > 0, 5000, 5);
  kk.shutdown();
  kk = mkKeeper(DATA);
  const i = await done();
  await sleep(300);
  ok(i.failed && /restarted during the download \(step fetch\)/.test(i.error) && leftovers(v).length === 0 && !listed(v) && !marker() && kk._reattached() === 'ended',
    'VibeSpace restarted while the bytes came in: the new keeper judges the marker at once — failed by name, the partial removed, the slot free', { i, left: leftovers(v) });
  const v2 = '151.0.7922.77';
  plant(v2, 'ok');
  fs.writeFileSync(SLOW, '1');
  await kk.installChromeBuild({ version: v2 });
  await until(() => kk.chromeBuildFacts().install.step === 'unpack' && marker() && marker().step === 'unpack', 8000, 5);
  const m = marker();
  kk.shutdown();
  kk = mkKeeper(DATA);
  const f1 = kk.chromeBuildFacts().install;
  fs.rmSync(SLOW, { force: true });
  const i2 = await done();
  ok(m && Number.isInteger(m.pid) && m.files === 2 && f1.running && f1.step === 'unpack' && f1.version === v2 && kk._reattached() === 'running' && i2.done === v2 && listed(v2) && fs.existsSync(path.join(plan(v2).targetDir, BB.WITNESS_FILE)) && leftovers(v2).length === 0 && !marker(),
    'VibeSpace restarted while unzip ran: the marker named the unzip (pid + files); the new keeper RE-ATTACHED (the slot busy, said "unpacking"), then verified, witnessed and landed it', { m, f1, i2 });
}

// ═══ ⑧ removal ═══════════════════════════════════════════════════════════════
console.log('— ⑧ removal: pinned / running / hand-installed refused by name; a downloaded one removed');
{
  const v = '153.0.7979.0';
  plant(v, 'ok');
  await kk.installChromeBuild({ version: v });
  ok((await done()).done === v, 'a build to remove landed');
  const pp = kk.createProfile({ label: 'Pinned one', browser: { kind: 'build', version: v } });
  const e = await thr(() => kk.removeChromeBuild({ version: v }));
  ok(e && e.code === 'build_in_use' && e.build.profiles.includes('Pinned one') && /"Pinned one"/.test(e.message) && listed(v), 'a profile chooses it: refused `build_in_use`, naming the profile', e && e.message);
  await kk.setBrowserChoice({ profileId: pp.id, choice: { kind: 'default' }, by: 'user' });
  const pr = kk.createProfile({ label: 'Running one' });
  kk._reg().browsers[pr.id] = { state: 'ready', cdpBrowser: `Chrome/${v}` };
  const e2 = await thr(() => kk.removeChromeBuild({ version: v }));
  delete kk._reg().browsers[pr.id];
  ok(e2 && e2.code === 'build_in_use' && e2.build.running.includes('Running one'), 'a running browser reports it: refused `build_in_use`, naming it', e2 && e2.message);
  const hand = path.join(BROWSERS, 'chrome-150.0.1.2'); fs.mkdirSync(hand, { recursive: true }); fs.writeFileSync(path.join(hand, 'chrome'), '#!/bin/sh\n', { mode: 0o755 });
  const e3 = await thr(() => kk.removeChromeBuild({ version: '150.0.1.2' }));
  ok(e3 && e3.code === 'build_not_downloaded' && fs.existsSync(hand), 'a folder installed by hand (no witness): refused `build_not_downloaded`, untouched');
  const e4 = await thr(() => kk.removeChromeBuild({ version: '../../etc' }));
  ok(e4 && e4.code === 'build_version_invalid', 'a version that is a path: refused before any file is named');
  const r = kk.removeChromeBuild({ version: v });
  ok(r.removed === v && !fs.existsSync(plan(v).targetDir) && !fs.existsSync(plan(v).removingDir) && !listed(v), 'nobody uses it: removed (renamed to .removing-<v>, then deleted)');
}

// ═══ ⑨ controls ═══════════════════════════════════════════════════════════════
console.log('— ⑨ controls: patched keeper copies the gates above must turn red');
{
  const MUT = mutantCopies('cbdl-download', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const runCopy = async (label, from, to, v, mode, zip) => {
    ok(src.includes(from), `control (${label}): the patch applies`);
    const Kc = MUT.load('src/server/browser-keeper.js', src.replace(from, to), label);
    const kc = mkKeeper(path.join(ROOT, 'data-' + label), {}, Kc);
    await kc.chromeBuildsAvailable({ lists: 'older' });
    plant(v, mode, zip);
    try { await kc.installChromeBuild({ version: v }); } catch (e) { kc.shutdown(); return { thrown: e }; }
    const i = await done(kc); kc.shutdown(); return { i };
  };
  const a = await runCopy('no-egress-verdict', "if (!ev.allow || x.protocol !== 'https:') throw namedError('build_url_offhost',", "if (false) throw namedError('build_url_offhost',", '154.0.8011.0', 'redirect-away');
  ok(hits.some((h) => h.host === 'evil.example.com'), 'control (a): a fetch without the egress verdict FOLLOWED the 302 to evil.example.com — exactly what ⑤ refuses', a);
  const b = await runCopy('no-zip-shape', 'if (!shape.ok) throw namedError(shape.code, shape.error);', '', '154.0.8012.0', 'ok', chromeZip('154.0.8012.0', { extra: [{ name: 'chrome-linux64/../../escaped2', data: 'x' }] }));
  ok(spyCalls('154.0.8012.0').includes('-q'), 'control (b): a keeper that skips the zip\'s shape RAN `unzip -q` on a ".." zip — exactly what ④ refuses', { b, spy: spyCalls('154.0.8012.0') });
  const c = await runCopy('no-md5', 'if (got !== sum.md5) throw namedError(', 'if (false) throw namedError(', '157.0.8079.0', 'flip');
  ok(c.i && c.i.code !== 'build_check_failed' && spyCalls('157.0.8079.0').length > 0, 'control (c): a keeper that skips the md5 check handed the flipped bytes to unzip — exactly what ③ refuses at the check', c);
}
try { kk.shutdown(); } catch { /* none */ }

// ═══ verify r1 (H1, L1) ══════════════════════════════════════════════════════
console.log('— verify r1: a download newer than every build is the CLI\'s next default (said; its removal guarded) · a zip bomb refused before unzip -q');
{
  const vNew = '158.0.9000.1', vBomb = '158.0.9000.2';
  const row = (v) => ({ ...LKG0.channels.Canary, version: v, downloads: { chrome: [{ platform: 'linux64', url: `https://${CBR.fileHost}${zipUrl(v)}` }] } });
  LKG = { ...LKG0, channels: { ...LKG0.channels, Canary: row(vNew), Beta: row(vBomb) } };
  plant(vNew, 'ok'); plant(vBomb, 'ok', chromeZip(vBomb, { extra: [{ name: 'chrome-linux64/blob', data: Buffer.alloc(64 << 20), deflate: true }] }));
  const dp = kk.createProfile({ label: 'Default one' });
  const c = await kk.chromeBuildsAvailable({ lists: 'channels' });
  const can = c.channels.find((r) => r.channel === 'Canary'), dch = can.verdict.chips.find((x) => x.kind === 'default');
  ok(dch && dch.users.includes('Default one') && dch.from === BB.listBuilds({ homeDir: HOME }).builds.find((b) => b.usable).version, 'a version newer than every build here: its row says it becomes the browser CLI\'s default (now the newest build), naming the default-choice profiles', can.verdict.chips);
  await kk.installChromeBuild({ version: vNew });
  ok((await done()).done === vNew, 'it landed (now the newest build — the default of every default-choice profile)');
  kk._reg().profiles.find((p) => p.id === dp.id).lastChromiumMajor = 158;
  const e = await thr(() => kk.removeChromeBuild({ version: vNew }));
  ok(e && e.code === 'build_in_use' && e.build.profiles.includes('Default one') && /default build of .*"Default one"/.test(e.message) && listed(vNew), 'Remove while a default-choice profile was last opened by it and every build left is older: refused by name', e && e.message);
  // verify r2 (kept): a conversation's KEPT browser launches the default too — its directory's `Last Version` stamp guards the removal
  { kk._reg().profiles.find((p) => p.id === dp.id).lastChromiumMajor = null; kk.shutdown();
    const ks = require('../src/server/browser-kept.js').create({ dataDir: DATA, log: quiet }), kd = (bk, stamp) => { const d = ks.dirOf(bk); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'Last Version'), stamp); ks.noteStart(bk, { hasDir: true, label: bk === 'bk-0000a157' ? 'Research chat' : 'Old chat' }); ks.noteStop(bk, { why: 'idle', hasDir: true }); };
    kd('bk-0000a157', vNew); kd('bk-0000a154', '100.0.1.1'); kk = mkKeeper(DATA, { kept: ks });
    const e3 = await thr(() => kk.removeChromeBuild({ version: vNew }));
    ok(e3 && e3.code === 'build_in_use' && e3.build.profiles.includes('Research chat') && !e3.build.profiles.includes('Old chat') && !e3.build.profiles.includes('Default one') && /kept browser of "Research chat"/.test(e3.message) && listed(vNew), 'Remove while a conversation\'s kept browser was last opened by it (its `Last Version`) and every build left is older: refused by name (an older stamp is not counted)', e3 && e3.message);
    ks.shutdown(); }
  const real = fs.statfsSync;
  fs.statfsSync = (p, ...a) => { const r = real(p, ...a); return String(p).startsWith(ROOT) ? { ...r, bsize: 4096, bavail: Math.floor((24 << 20) / 4096) } : r; };
  try {
    const e2 = await thr(() => kk.installChromeBuild({ version: vBomb })); const i = e2 ? null : await done();
    ok(!e2 && i.failed && i.code === 'disk' && !spyCalls(vBomb).includes('-q') && !listed(vBomb) && !leftovers(vBomb).length, 'a zip that declares more than the free space (64 MB, 24 MB free): refused `disk` BEFORE unzip -q, nothing kept', { e2: e2 && e2.code, i, calls: spyCalls(vBomb) });
  } finally { fs.statfsSync = real; }
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
