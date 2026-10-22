'use strict';
/**
 * THE PRODUCT'S OWN NODE RUNTIME — ONE provisioner (lane runtime-floor, 2026-10-22; the owner: «每次有漏洞都要更新 pod 也太
 * 麻烦了吧 有没有更好的解决方案？»). A Node security release used to mean a new IMAGE for every pod (a rollout restarts the
 * pod and kills every user's dtach session) and a hand-run install on the hub. Now the instance keeps its own node:
 *   · provision(wanted, {root, mirror})  downloads node-v<ver>-<os>-<arch>.tar.gz (.zip on win32) from the mirror into
 *     <root>/runtime/node-v<ver>/ — sha256 checked against the mirror's SHASUMS256.txt BEFORE anything is unpacked, the
 *     unpacked binary must answer its own version — then flips <root>/runtime/current → it atomically (rename of a
 *     symlink; win32: current.txt). It writes ONLY under <root>/runtime (a link there is refused), so a SYSTEM node —
 *     the image's /usr/local/bin/node, the hub's nvm node — is never touched. Bounded: the bytes (the archive ≤ 160 MiB,
 *     the sums ≤ 256 KiB) and the time (10 min); the event loop never held (streams + child processes, never a *Sync
 *     child). THE HASH LIVES IN THIS REPO: src/runtime-floor.js ARCHIVES names every floor archive's sha256 (copied from
 *     nodejs.org's SHASUMS256.txt) — checked FIRST, the mirror's sums second, and a version with no line is never
 *     provisioned (VIBESPACE_NODE_MIRROR can serve only the bytes this repo names). Each provisioned dir carries its record
 *     (.vibespace-runtime.json: version, platform, the sha256 of bin/node) that the switch re-checks before it execs.
 *     PINNED KEY: none — the release team's `.sig` (GPG) is not checked: the known gap, said, not hidden.
 *   · fetchFile — THE ONE downloader of a node release file: the provisioner and the hub's device mirror route
 *     (/vibespace-node/:version/:file) both fetch through it (a tmp + rename, bounded, hashed while it streams).
 *   · currentOf(root) — the provisioned runtime, if any; reexecOnOwnRuntime — the server's FIRST statement: when
 *     <root>/runtime/current is a NEWER node than the one running and answers its version, the process REPLACES itself
 *     with it (process.execve: the same pid, so systemd / run.sh / the pod's entrypoint keep supervising it — no unit,
 *     no image changes; once per start, VIBESPACE_RUNTIME_REEXEC marks the second image; POSIX only — no execve on win32).
 * root = the instance's data dir on the hub and a pod (data/runtime/), the device root for an agent.
 * SHARED: node builtins + the PURE floor table (src/runtime-floor.js).
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const RF = require('./runtime-floor');

const DEFAULT_MIRROR = 'https://nodejs.org/dist';
const MAX_ARCHIVE = 160 * 1024 * 1024;   // a release archive is ~30 MB (linux-x64 .tar.gz); the bound, never the size
const MAX_SUMS = 256 * 1024;             // SHASUMS256.txt is ~6 KB
const TIMEOUT_MS = 10 * 60 * 1000;       // one provisioning, download + unpack + the version answer
const CHILD_MS = 120 * 1000;             // one child (tar, node --version)
const KEEP = 2;                          // provisioned versions kept: the current one + the one before it
const VERSION_RE = /^v\d{1,3}\.\d{1,4}\.\d{1,4}$/;
// the release files a node mirror serves that this code may name (the hub's device mirror route keeps the same list)
const FILE_RE = /^(SHASUMS256\.txt|node-v\d+\.\d+\.\d+-(linux|darwin)-(x64|arm64|armv7l|ppc64le|s390x)(-musl)?\.tar\.gz|node-v\d+\.\d+\.\d+-win-(x64|arm64)\.zip)$/;
const ARCHES = { x64: 'x64', arm64: 'arm64', arm: 'armv7l', ppc64: 'ppc64le', s390x: 's390x' };

/** The release archive for this machine: {file, top (the folder inside it), win} | null (a platform with none). */
function artifactOf(version, { platform = process.platform, arch = process.arch, musl = false } = {}) {
  if (!VERSION_RE.test(String(version))) return null;
  const a = ARCHES[arch];
  if (!a) return null;
  if (platform === 'win32') return (a === 'x64' || a === 'arm64') ? { file: `node-${version}-win-${a}.zip`, top: `node-${version}-win-${a}`, win: true } : null;
  if (platform !== 'linux' && platform !== 'darwin') return null;
  const top = `node-${version}-${platform}-${a}${musl && platform === 'linux' ? '-musl' : ''}`;
  return { file: `${top}.tar.gz`, top, win: false };
}
/** musl libc (Alpine): glibc's version is absent from the process report there. */
function isMusl() { try { return process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime; } catch { return false; } }

/** SHASUMS256.txt → the hex digest it lists for `file`, or null. */
function shaOf(sums, file) {
  for (const line of String(sums || '').split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)\s*$/i.exec(line.trim());
    if (m && m[2] === file) return m[1].toLowerCase();
  }
  return null;
}
const refusal = (code, error) => Object.assign(new Error(error), { code });

/** THE ONE DOWNLOADER: `${mirror}/${version}/${file}` → `dest` (a tmp beside it, then a rename), ≤ maxBytes, ≤ timeoutMs
 *  → {bytes, sha256}. A file outside the release list, a mirror that is not http(s), an answer that is not 200, a body
 *  past the bound ⇒ throws (code: bad-request / upstream / too-big / timeout) and leaves nothing at `dest`. */
async function fetchFile({ mirror = DEFAULT_MIRROR, version, file, dest, fetch = globalThis.fetch, maxBytes = MAX_ARCHIVE, timeoutMs = TIMEOUT_MS, signal = null } = {}) {
  if (!VERSION_RE.test(String(version)) || !FILE_RE.test(String(file))) throw refusal('bad-request', `not a node release file: ${version}/${file}`);
  if (!/^https?:\/\/[^\s]+$/.test(String(mirror))) throw refusal('bad-request', `not a mirror url: ${mirror}`);
  const url = `${String(mirror).replace(/\/+$/, '')}/${version}/${file}`;
  const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let res;
  try { res = await fetch(url, { signal: sig, headers: { 'accept-encoding': 'identity' } }); }
  catch (e) { throw refusal(e && e.name === 'TimeoutError' ? 'timeout' : 'upstream', `${url}: ${e && e.message}`); }
  if (!res || !res.ok || !res.body) throw refusal('upstream', `${url}: HTTP ${res ? res.status : '?'}`);
  const enc = String((res.headers && res.headers.get && res.headers.get('content-encoding')) || '').trim().toLowerCase();
  if (enc && enc !== 'identity') { try { await res.body.cancel(); } catch { } throw refusal('upstream', `${url}: answered content-encoding "${enc}" to a request for identity — refused`); }
  const declared = Number(res.headers && res.headers.get && res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { try { await res.body.cancel(); } catch { } throw refusal('too-big', `${url}: ${declared} bytes > ${maxBytes}`); }
  const tmp = `${dest}.part-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const meter = new Transform({ transform(chunk, enc, cb) { bytes += chunk.length; if (bytes > maxBytes) return cb(refusal('too-big', `${url}: more than ${maxBytes} bytes`)); hash.update(chunk); cb(null, chunk); } });
  try {
    await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(tmp, { flags: 'wx', mode: 0o644 }), { signal: sig });
    await fsp.rename(tmp, dest);
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => { });
    if (e && e.code === 'too-big') throw e;
    throw refusal(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'upstream', `${url}: ${e && e.message}`);
  }
  return { bytes, sha256: hash.digest('hex') };
}

/** One bounded child (tar, a node's --version): {code, out} — never the event loop, never the hub's whole env. */
function runChild(cmd, args, { timeoutMs = CHILD_MS, cwd } = {}) {
  return new Promise((resolve) => {
    let out = '', done = false;
    const env = { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', LANG: 'C' };
    let child;
    try { child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); } catch (e) { resolve({ code: -1, out: String(e && e.message) }); return; }
    const take = (d) => { if (out.length < 65536) out += d; };
    child.stdout.on('data', take); child.stderr.on('data', take);
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, timeoutMs);
    const end = (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, out: out.trim() }); };
    child.on('error', (e) => { take(String(e && e.message)); end(-1); });
    child.on('close', (code) => end(code == null ? -1 : code));
  });
}

const runtimeDirOf = (root) => path.join(String(root), 'runtime');
const nodeBinOf = (dir, win = process.platform === 'win32') => path.join(dir, win ? 'node.exe' : path.join('bin', 'node'));

/** The provisioned runtime under `root`: {version, dir, node} | null (none, a dangling or foreign pointer, no binary). */
function currentOf(root, { win = process.platform === 'win32' } = {}) {
  const rt = runtimeDirOf(root);
  let name = null;
  try {
    if (win) name = fs.readFileSync(path.join(rt, 'current.txt'), 'utf8').trim();
    else { const l = fs.readlinkSync(path.join(rt, 'current')); name = l.includes('/') ? null : l; }
  } catch { return null; }
  const m = /^node-(v\d{1,3}\.\d{1,4}\.\d{1,4})$/.exec(String(name || ''));
  if (!m) return null;
  const dir = path.join(rt, name), node = nodeBinOf(dir, win);
  try { if (!fs.statSync(node).isFile()) return null; } catch { return null; }
  return { version: m[1], dir, node };
}

/** <root>/runtime as a REAL directory of this instance (created when missing) — a link there is refused: the
 *  provisioner never writes through one (a planted link must not point it at a system prefix). */
async function runtimeDir(root) {
  if (!root || !path.isAbsolute(String(root))) throw refusal('bad-request', `the runtime root must be an absolute path: ${root}`);
  const rt = runtimeDirOf(root);
  await fsp.mkdir(rt, { recursive: true, mode: 0o755 });
  const st = await fsp.lstat(rt);
  if (!st.isDirectory() || st.isSymbolicLink()) throw refusal('not-own', `${rt} is not a directory of this instance (a link?) — nothing written`);
  return rt;
}

/** Point <root>/runtime/current at `name` atomically (a new symlink renamed over the old; win32: current.txt). */
async function flip(rt, name, win) {
  const tmp = path.join(rt, `.current-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  if (win) { await fsp.writeFile(tmp, name + '\n'); await fsp.rename(tmp, path.join(rt, 'current.txt')); return; }
  await fsp.symlink(name, tmp);
  await fsp.rename(tmp, path.join(rt, 'current'));
}

/** The provisioned versions beyond KEEP leave (oldest first; never the current one). Own entries only. */
async function prune(rt, keepName) {
  let names = [];
  try { names = (await fsp.readdir(rt)).filter((n) => /^node-v\d+\.\d+\.\d+$/.test(n)); } catch { return []; }
  const byAge = names.filter((n) => n !== keepName).sort((a, b) => RF.compare(a.slice(5), b.slice(5)));
  const drop = byAge.slice(0, Math.max(0, byAge.length - (KEEP - 1)));
  for (const n of drop) await fsp.rm(path.join(rt, n), { recursive: true, force: true }).catch(() => { });
  return drop;
}

const RECORD = '.vibespace-runtime.json';
/** sha256 of a file, read in 1 MiB chunks (sync — the switch's one check before an execve; ~0.2 s for a node binary). */
function hashFileSync(file) {
  const h = crypto.createHash('sha256'), buf = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(file, 'r');
  try { for (;;) { const n = fs.readSync(fd, buf, 0, buf.length, null); if (!n) break; h.update(buf.subarray(0, n)); } } finally { fs.closeSync(fd); }
  return h.digest('hex');
}
/** sha256 of a file, streamed (the provisioner's — never the loop). */
async function hashFile(file) {
  const h = crypto.createHash('sha256');
  for await (const c of fs.createReadStream(file)) h.update(c);
  return h.digest('hex');
}
/** A provisioned runtime still holds what the provisioner wrote: its record (.vibespace-runtime.json — version, platform,
 *  the sha256 of bin/node) and a binary hashing to it → {ok} | {ok: false, state: 'unverified' (no / a bad record) |
 *  'tampered' (the binary is not the one provisioned), why}. A planted or corrupted binary never runs. */
function verifyRuntime(dir, node, version) {
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(path.join(dir, RECORD), 'utf8')); } catch { rec = null; }
  if (!rec || rec.version !== version || !/^[0-9a-f]{64}$/.test(String(rec.sha256 || ''))) return { ok: false, state: 'unverified', why: `${path.join(dir, RECORD)} is missing or does not name ${version}` };
  let got = '';
  try { got = hashFileSync(node); } catch (e) { return { ok: false, state: 'tampered', why: `${node} cannot be read (${e && e.code || e})` }; }
  return got === rec.sha256 ? { ok: true, record: rec } : { ok: false, state: 'tampered', why: `${node} hashes ${got.slice(0, 12)}…, the provisioner wrote ${rec.sha256.slice(0, 12)}…` };
}

/** PROVISION `wanted` (e.g. 'v24.22.1') under `root` → {ok: true, version, node, already, sha256?, bytes?} |
 *  {ok: false, code, error}. Never throws. THE HASH LIVES IN THIS REPO: the archive must equal the line src/runtime-floor.js
 *  ARCHIVES names for it (`archives` — a suite hands its fixture rows) FIRST, the mirror's SHASUMS256.txt second; no line
 *  ⇒ refused before any download. `current` moves only after both matched, the unpacked binary answered `wanted` and its
 *  record (.vibespace-runtime.json: version, platform, the sha256 of bin/node) was written beside it. */
async function provision(wanted, { root, mirror = DEFAULT_MIRROR, fetch: doFetch = globalThis.fetch, platform = process.platform, arch = process.arch, musl = isMusl(), maxBytes = MAX_ARCHIVE, timeoutMs = TIMEOUT_MS, archives = RF.ARCHIVES, log = () => { } } = {}) {
  const win = platform === 'win32';
  const art = artifactOf(wanted, { platform, arch, musl });
  if (!art) return { ok: false, code: 'bad-request', error: `no node release archive for ${wanted} on ${platform}-${arch}` };
  const named = RF.archiveSha(wanted, art.file, archives);
  if (!named) return { ok: false, code: 'no-table-row', error: `src/runtime-floor.js names no sha256 for ${art.file} — never provisioned (the mirror can serve only the bytes this repo names)` };
  const deadline = AbortSignal.timeout(timeoutMs);
  let rt, tmp = null;
  try {
    rt = await runtimeDir(root);
    const name = `node-${wanted}`, target = path.join(rt, name);
    const have = currentOf(root, { win });
    if (have && have.version === wanted && verifyRuntime(have.dir, have.node, wanted).ok) return { ok: true, version: wanted, node: have.node, already: true };
    if (fs.existsSync(nodeBinOf(target, win)) && verifyRuntime(target, nodeBinOf(target, win), wanted).ok) {
      const v = await runChild(nodeBinOf(target, win), ['--version']);
      if (v.code === 0 && v.out === wanted) { await flip(rt, name, win); log(`[runtime] ${wanted} was already unpacked — current points at it`); return { ok: true, version: wanted, node: nodeBinOf(target, win), already: true }; }
    }
    tmp = await fsp.mkdtemp(path.join(rt, '.tmp-'));
    await fetchFile({ mirror, version: wanted, file: 'SHASUMS256.txt', dest: path.join(tmp, 'SHASUMS256.txt'), fetch: doFetch, maxBytes: MAX_SUMS, timeoutMs, signal: deadline });
    const want = shaOf(await fsp.readFile(path.join(tmp, 'SHASUMS256.txt'), 'utf8'), art.file);
    if (!want) throw refusal('not-listed', `${art.file} is not in ${wanted}'s SHASUMS256.txt — refused (nothing unpacked)`);
    if (want !== named) throw refusal('sums-disagree', `the mirror's SHASUMS256.txt says ${want.slice(0, 12)}… for ${art.file}, this repo names ${named.slice(0, 12)}… — refused before the download`);
    const archive = path.join(tmp, art.file);
    log(`[runtime] downloading ${String(mirror).replace(/\/+$/, '')}/${wanted}/${art.file}`);
    const got = await fetchFile({ mirror, version: wanted, file: art.file, dest: archive, fetch: doFetch, maxBytes, timeoutMs, signal: deadline });
    if (got.sha256 !== named) throw refusal('sha-mismatch', `${art.file}: sha256 ${got.sha256} ≠ the line src/runtime-floor.js names (${named}) — refused (nothing unpacked, current unchanged)`);
    const x = await runChild('tar', [win ? '-xf' : '-xzf', archive, '-C', tmp], { timeoutMs: Math.min(CHILD_MS * 2, timeoutMs) });
    if (x.code !== 0) throw refusal('unpack', `tar could not unpack ${art.file}: ${x.out.slice(0, 300)}`);
    const unpacked = path.join(tmp, art.top), bin = nodeBinOf(unpacked, win);
    const said = await runChild(bin, ['--version']);
    if (said.code !== 0 || said.out !== wanted) throw refusal('wrong-binary', `the unpacked node answered ${JSON.stringify(said.out.slice(0, 80))} (exit ${said.code}), not ${wanted} — refused`);
    // the record the switch re-checks before it execs (src/node-runtime.js reexecOnOwnRuntime → verifyRuntime)
    await fsp.writeFile(path.join(unpacked, RECORD), JSON.stringify({ version: wanted, platform: `${platform}-${ARCHES[arch] || arch}${musl && platform === 'linux' ? '-musl' : ''}`, sha256: await hashFile(bin), archive: art.file, archiveSha256: got.sha256, provisionedAt: new Date().toISOString() }, null, 1) + '\n', { mode: 0o644 });
    if (fs.existsSync(target)) await fsp.rename(target, path.join(tmp, 'old-' + name));
    await fsp.rename(unpacked, target);
    await flip(rt, name, win);
    const pruned = await prune(rt, name);
    log(`[runtime] provisioned ${wanted} (sha256 ${got.sha256.slice(0, 12)}…, ${got.bytes} bytes) — ${path.join(rt, 'current')} → ${name}${pruned.length ? `; removed ${pruned.join(', ')}` : ''}`);
    return { ok: true, version: wanted, node: nodeBinOf(target, win), already: false, sha256: got.sha256, bytes: got.bytes };
  } catch (e) {
    return { ok: false, code: (e && e.code) || 'error', error: String((e && e.message) || e) };
  } finally {
    if (tmp) await fsp.rm(tmp, { recursive: true, force: true }).catch(() => { });
  }
}

/** The same major line (the provisioner only ever installs the fixed release of the RUNNING major — a native addon such
 *  as node-pty is built for one major's ABI, so a switch never crosses a line). */
const sameMajor = (a, b) => { const x = RF.tripleOf(a), y = RF.tripleOf(b); return !!x && !!y && x[0] === y[0]; };

/** THE SERVER'S FIRST STATEMENT: when <root>/runtime/current is a NEWER node than the running one and answers its own
 *  version, replace this process with it (same pid, same argv, same env + VIBESPACE_RUNTIME_REEXEC). Returns why it
 *  did not ({state}: 'none' | 'running' | 'not-newer' | 'other-major' | 'unverified' / 'tampered' (the binary is not the one
 *  provisioned — verifyRuntime) | 'broken' | 'unsupported' (win32 / no execve) | 'off' | 'already'); on success it does
 *  not return. One synchronous version probe (≤ 10 s) before anything else loads — the boot's only blocking child. */
function reexecOnOwnRuntime({ root, env = process.env, execve = process.execve, execPath = process.execPath, version = process.version, argv = process.argv, execArgv = process.execArgv, platform = process.platform, probe = null, log = (l) => console.log(l) } = {}) {
  if (env.VIBESPACE_RUNTIME_REEXEC) return { state: 'already', from: env.VIBESPACE_RUNTIME_REEXEC };
  if (platform === 'win32') return { state: 'unsupported' };   // no execve there (a Windows agent's road: the installer's re-provision)
  if (env.VIBESPACE_RUNTIME_SWITCH === '0') return { state: 'off' };
  const cur = currentOf(root);
  if (!cur) return { state: 'none' };
  if (path.resolve(execPath) === path.resolve(cur.node)) return { state: 'running', version: cur.version };
  if (RF.compare(cur.version, version) !== 1) return { state: 'not-newer', version: cur.version };
  if (!sameMajor(cur.version, version)) return { state: 'other-major', version: cur.version };   // a native addon (node-pty) is built for ONE major's ABI
  if (typeof execve !== 'function') return { state: 'unsupported', version: cur.version };
  // RE-VERIFY WHAT IT EXECS: the binary must hash to the record the provisioner wrote — a planted / corrupted one never runs
  const chk = verifyRuntime(cur.dir, cur.node, cur.version);
  if (!chk.ok) { log(`[runtime] NOT switching to ${cur.node}: ${chk.state} — ${chk.why}; this server stays on ${version}`); return { state: chk.state, version: cur.version }; }
  let said = '';
  try { said = (probe || ((n) => execFileSync(n, ['-p', 'process.version'], { encoding: 'utf8', timeout: 10000, env: { PATH: env.PATH || '' }, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })))(cur.node).trim(); } catch { said = ''; }
  if (said !== cur.version) return { state: 'broken', version: cur.version, said };
  log(`[runtime] node ${version} → ${cur.version} (${cur.node}): this server replaces itself with the instance's own runtime`);
  execve(cur.node, [cur.node, ...execArgv, ...argv.slice(1)], { ...env, VIBESPACE_RUNTIME_REEXEC: version });
  return { state: 'exec-returned' }; // unreachable unless a fake execve returns
}

module.exports = { DEFAULT_MIRROR, MAX_ARCHIVE, MAX_SUMS, TIMEOUT_MS, KEEP, VERSION_RE, FILE_RE, RECORD, artifactOf, isMusl, shaOf, fetchFile, runChild, currentOf, provision, verifyRuntime, reexecOnOwnRuntime, runtimeDirOf, nodeBinOf };
