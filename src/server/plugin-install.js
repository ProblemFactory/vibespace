'use strict';
// PLUGIN INSTALL SOURCES (Plugin Ph4, 2.369.30 — docs/design-harness-plugins.md
// §3.2 "打包/分发/版本", docs/plugins.md). Four ways a plugin package reaches
// data/plugins/<id>/, ONE staging pipeline:
//   path            copy a local directory holding vibespace-plugin.json
//   git             `git clone --depth 1` (execFile, 60s, https/ssh forms only — no shell)
//   zip             a `.vsp` (= zip) upload, extracted with the system `unzip`
//                   (the same tool src/routes/files.js archive ops use), Zip-Slip-proof
//   github-release  owner/repo[@tag] → the release's *.vsp asset via the public
//                   GitHub API (no token) → the zip path
// Every source lands in <rootDir>/data/plugins-staging/<random>/ (same
// filesystem as data/plugins so the final step is a rename), the manifest is
// validated THERE (host version, capability paths against the forbidden roots),
// symlinks anywhere in the package are refused (a symlink to / plus a file
// under it is the classic Zip-Slip-by-link), and only then does the package
// move into place. A previous copy of the same id is MOVED to the trash, never
// deleted — same for uninstall: data/plugins-trash/<id>-<ts>/{plugin,state}.
// ORCH tier. Pure staging helpers are exported for the test suite.
// 2.369.43: the walk + the copy are ASYNC (an owner-supplied path must never
// block the event loop), auditTree also returns a package contentHash (the
// loader's "is this the same package?" test for reinstall consent), and the
// uploaded temp file is removed on EVERY exit path (the source whitelist used
// to throw above the try/finally).
// lane engine-distribution (P4 of the custom browser kernel, design-custom-browser-plugin §5.1): a PRIVATE git repository.
// The credential is ONE integration row (`plugin-git`: host + an https token or an ssh deploy key, kept by the integration
// store — sealed, the vault's key), resolved HERE at install time and handed to git ONLY through files: https ⇒ GIT_ASKPASS
// names a 0700 script that cats a 0600 token file; ssh ⇒ GIT_SSH_COMMAND names a 0600 key file. Both live in a 0700 folder
// inside the stage and are SHREDDED (overwritten, then unlinked) on every way out — never argv, never a URL with the token
// (the git-source grammar refuses `user@` in an https URL anyway), never an env value: every git child is serviceEnv + named git switches (§94 FIXED
// row), `-c credential.helper=` so no configured helper stores it; round 2: GIT_CONFIG_GLOBAL=/dev/null beside
// GIT_CONFIG_NOSYSTEM=1 — the hub user's HOME git config (a url.insteadOf would send the clone, and the askpass's token, to
// another host than the one the credential is bound to) is never read by a plugin's git child; a throw while the files are
// written shreds the ones already there. The clone fetches ONE ref at depth 1 (a tag, a branch or
// a full sha — the trust anchor of a fleet install is the sha) and records `{ref, sha}`; every failure is a NAMED code
// (GIT_CODES) that reaches the owner (the Plugins panel; a boot install's For-you notice).
const fs = require('fs');
const { safeFetch } = require('../safe-fetch');
const fsp = require('fs/promises');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { validateManifest } = require('../plugin-manifest');
const { serviceEnv } = require('../agent-env.js');
const { shredFile } = require('../secret-file.js');
const IR = require('../integration-registry.js'); // PURE: the credential's `why` in words (a locked vault, none set)
const EK = require('../engine-kernel.js'); // PURE: THE ONE git-source grammar (gitSourceVerdict / gitRepoOf) — the kernel's credential verdict reads the same

const MANIFEST = 'vibespace-plugin.json';
const MAX_ZIP_BYTES = 50 * 1024 * 1024;       // upload / release asset cap
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;  // unpacked cap (path/git/zip)
const MAX_PACKAGE_FILES = 20000;
const MAX_PACKAGE_DEPTH = 32;                 // a bounded walk (symlinks are refused, but depth is still capped)
const GIT_TIMEOUT_MS = 60000;
const GH_SPEC_RE = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:@([A-Za-z0-9._\/-]+))?$/;
/** lane engine-distribution: a git ref — a tag, a branch or a full sha (no leading `-`, no `..`, no `@{`). */
const GIT_REF_RE = /^(?!-)(?!.*\.\.)(?!.*@\{)[A-Za-z0-9._\/-]{1,100}$/;
const GIT_SHA_RE = /^[0-9a-f]{40}$/;
/** The ONE integration row a private repository's credential is kept in (src/integration-registry.js). */
const GIT_CREDENTIAL_ROW = 'plugin-git';
/** Every named refusal of a git install (the route answers `{error, code}`; the panel and the boot notice say them). */
const GIT_CODES = Object.freeze(['plugin_git_spec', 'plugin_git_auth', 'plugin_git_ref_missing', 'plugin_git_timeout', 'plugin_git_credential', 'plugin_git_failed', 'plugin_tree_rejected']);
const codedErr = (status, code, msg) => Object.assign(httpErr(status, msg), { code, payload: { code } });

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
    if (err) { const e = new Error((String(stderr || '').trim() || err.message).split('\n')[0].slice(0, 300)); e.code = err.code; return reject(e); }
    resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
  });
});

const httpErr = (status, msg) => Object.assign(new Error(msg), { status });

/** Walk a directory tree: refuse symlinks, count files/bytes, cap both, and
 *  (opt-in) fingerprint the CONTENT — sha256 over `relpath\0size\0filehash` in
 *  sorted order. That fingerprint is the installer's answer to "is this the
 *  same package?", which is what lets the loader decide whether an existing
 *  plugin's consent may survive a reinstall.
 *  ASYNC BY LAW (2.369.43): this walks an OWNER-SUPPLIED path — the old sync
 *  walk + sync ≤200 MB copy blocked the whole instance's event loop (the "never
 *  block the event loop" law; three past outages came from exactly this). Depth
 *  is bounded too: symlinks are refused, but a pathological tree must not
 *  recurse without a limit. */
async function auditTree(root, { maxFiles = MAX_PACKAGE_FILES, maxBytes = MAX_PACKAGE_BYTES, maxDepth = MAX_PACKAGE_DEPTH, hash = true } = {}) {
  let files = 0, bytes = 0;
  const entries = [];
  const walk = async (dir, depth) => {
    if (depth > maxDepth) throw httpErr(400, `package nests deeper than ${maxDepth} directories`);
    for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isSymbolicLink()) throw httpErr(400, `package contains a symlink (${path.relative(root, p)}) — symlinks are refused in plugin packages`);
      if (d.isDirectory()) { await walk(p, depth + 1); continue; }
      if (!d.isFile()) throw httpErr(400, `package contains a non-regular file (${path.relative(root, p)})`);
      const st = await fsp.stat(p);
      files++; bytes += st.size;
      if (files > maxFiles) throw httpErr(413, `package has more than ${maxFiles} files`);
      if (bytes > maxBytes) throw httpErr(413, `package is larger than ${Math.round(maxBytes / 1048576)} MB`);
      entries.push({ rel: path.relative(root, p), size: st.size, abs: p });
    }
  };
  await walk(root, 0);
  let contentHash = null;
  if (hash) {
    const h = crypto.createHash('sha256');
    for (const e of entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))) h.update(`${e.rel}\0${e.size}\0${await hashFile(e.abs)}\n`);
    contentHash = h.digest('hex');
  }
  return { files, bytes, contentHash };
}

/** sha256 of one file, STREAMED (a 200 MB readFile would spike memory). */
function hashFile(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(p);
    s.on('error', reject);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

/** The directory inside `stage` that holds the manifest: the root, or a single
 *  top-level folder (GitHub zips / cp of a folder wrap the package once). */
function findPackageRoot(stage) {
  if (fs.existsSync(path.join(stage, MANIFEST))) return stage;
  const entries = fs.readdirSync(stage, { withFileTypes: true }).filter((d) => !d.name.startsWith('.') && d.name !== '__MACOSX');
  if (entries.length === 1 && entries[0].isDirectory() && fs.existsSync(path.join(stage, entries[0].name, MANIFEST))) return path.join(stage, entries[0].name);
  throw httpErr(400, `no ${MANIFEST} at the package root`);
}

function expandTilde(p) { return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p; }

// ── staging per source (each returns the directory holding the manifest) ──
async function stageFromPath(value, stage) {
  const src = path.resolve(expandTilde(String(value || '').trim()));
  if (!src || src === '/') throw httpErr(400, 'path: give the directory that holds vibespace-plugin.json');
  let st; try { st = await fsp.stat(src); } catch { throw httpErr(400, `path: ${src} does not exist`); }
  if (!st.isDirectory()) throw httpErr(400, `path: ${src} is not a directory`);
  if (!fs.existsSync(path.join(src, MANIFEST))) throw httpErr(400, `path: ${src} has no ${MANIFEST}`);
  await auditTree(src, { hash: false }); // refuse symlinks + size before copying anything (the STAGED copy is what gets fingerprinted)
  const dest = path.join(stage, 'pkg');
  await fsp.cp(src, dest, { recursive: true, verbatimSymlinks: true, filter: (p) => path.basename(p) !== '.git' });
  return dest;
}

/** The host a git URL names (`host` or `host:port`, lower case, the default port dropped) — what a credential is bound to.
 *  Lane kernel-asset-credential round 2: read by THE ONE git-source grammar (PURE EK.gitRepoOf), the one the kernel's
 *  credential verdict reads — a repository that installs is a repository that verdict knows. Round 3: the same PARSED RECORD
 *  gitSpecOf reads (EK.gitSourceVerdict), so the two cannot disagree on a value. */
function gitHostOf(url) {
  const r = EK.gitSourceVerdict(url);
  return r.ok ? r.host : null;
}
/** A git URL + ref, judged before any child runs: `value` may carry `#<ref>` (the older form) — `ref` names it otherwise.
 *  Round 3: the URL git is handed is the PARSED RECORD's `url` (the value trimmed, `#ref` cut off — the string the grammar
 *  judged, never a slice of the caller's own); a space or a control character anywhere in the value, before or after `#`, is
 *  refused like every other shape: plugin_git_spec, with the grammar's reason. */
function gitSpecOf(value, refIn = null) {
  const src = EK.gitSourceVerdict(value);
  if (!src.ok) throw codedErr(400, 'plugin_git_spec', `git: URL must be https://host/owner/repo(.git) or git@host:owner/repo.git (optionally #branch) — ${src.why}`);
  let ref = refIn == null || refIn === '' ? null : String(refIn).trim();
  if (ref && src.ref && src.ref !== ref) throw codedErr(400, 'plugin_git_spec', `git: the URL names #${src.ref.slice(0, 40)} and the ref field names ${ref.slice(0, 40)} — give one`);
  ref = ref || src.ref;
  if (ref && !GIT_REF_RE.test(ref)) throw codedErr(400, 'plugin_git_spec', 'git: invalid ref (a tag, a branch or a full 40-character sha)');
  return { url: src.url, ref, https: src.https, host: src.host };
}
/** POSIX single-quoting for the askpass script's file paths (the stage path is ours; quoted anyway). */
const shq = (p) => `'${String(p).replace(/'/g, `'\\''`)}'`;
/** ONE git child: serviceEnv + the named git switches (the egress door: a pod reaches its git host through the operator's
 *  proxy), a timeout, no shell — §94's FIXED row holds it on serviceEnv. No config but the repository's own: no system file
 *  (GIT_CONFIG_NOSYSTEM), no HOME / XDG file (GIT_CONFIG_GLOBAL=/dev/null) — the URL git dials is the URL credentialFor
 *  judged. A TLS-inspecting egress's trust root therefore rides the egress door's GIT_SSL_CAINFO / GIT_SSL_CAPATH (round 3:
 *  a HOME `http.sslCAInfo` is never read, and a git on libcurl-GnuTLS ignores SSL_CERT_FILE). → {stdout, stderr} | throws
 *  {killed, stderr}. */
function gitRun(gitBin, args, { add = {}, timeout = GIT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(gitBin, args, { timeout, maxBuffer: 8 * 1024 * 1024, env: serviceEnv(process.env, { egress: true, add: { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes', ...add } }) }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(new Error(String(stderr || err.message || '').trim().slice(0, 600) || 'git failed'), { killed: !!err.killed || err.signal === 'SIGTERM', exit: err.code }));
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}
/** A git failure → its NAMED code + the owner's words (the first line of git's own, never a value). */
function gitFailure(e, { url, ref, cred, timeout = GIT_TIMEOUT_MS }) {
  const t = String((e && e.message) || '');
  const line = t.split('\n').map((x) => x.replace(/^(?:fatal|error|remote):\s*/i, '').trim()).filter(Boolean).slice(-1)[0] || 'git failed';
  if (e && e.killed) return codedErr(504, 'plugin_git_timeout', `git: ${gitHostOf(url) || 'the host'} did not finish within ${+(timeout / 1000).toFixed(1)} s (its limit) — nothing was installed`);
  if (/could not read (?:Username|Password)|Authentication failed|terminal prompts disabled|Permission denied \(publickey|HTTP Basic: Access denied|Invalid username or password|\b40[13]\b|not authorized|access denied|Repository not found|repository '.*' not found|Host key verification failed/i.test(t))
    return codedErr(400, 'plugin_git_auth', `git: ${gitHostOf(url) || 'the host'} refused ${cred ? `the ${cred.kind === 'key' ? 'deploy key' : 'token'} of the Plugin Git credential (${cred.host})` : 'an anonymous clone'} — ${cred ? 'check that it can read this repository' : 'a private repository needs the Plugin Git credential (Integrations → Plugins, or the cluster\'s preset)'} (${line.slice(0, 160)})`);
  if (/couldn't find remote ref|not our ref|no such remote ref|unknown revision|Could not find remote branch|invalid refspec|did not match any|no matching remote head/i.test(t))
    return codedErr(400, 'plugin_git_ref_missing', `git: the repository has no ${ref ? `ref ${ref}` : 'default branch'} (${line.slice(0, 160)})`);
  return codedErr(400, 'plugin_git_failed', `git clone failed: ${line.slice(0, 240)}`);
}
/** The credential files of ONE clone, in a 0700 folder: https ⇒ the token (0600) + its user + the askpass script (0700, it
 *  names the FILES — never a value); ssh ⇒ the key (0600). → {add (the env names git reads), files, dir}. A throw part way
 *  (a full disk at the second file) SHREDS the files already written, like every other way out (round 2). `writeFile` is a
 *  suite's door (the second write that fails). */
async function credentialFiles(stage, cred, { writeFile = fsp.writeFile } = {}) {
  const dir = await fsp.mkdtemp(path.join(stage, '.cred-'));
  const files = [];
  try {
    await fsp.chmod(dir, 0o700);
    const put = async (name, text, mode) => { const f = path.join(dir, name); files.push(f); await writeFile(f, text, { mode, flag: 'wx' }); return f; };
    if (cred.kind === 'token') {
      const tok = await put('token', cred.token, 0o600);
      const usr = await put('user', cred.username, 0o600);
      const ask = await put('askpass', `#!/bin/sh\ncase "$1" in\n  [Uu]sername*) cat ${shq(usr)} ;;\n  *) cat ${shq(tok)} ;;\nesac\n`, 0o700);
      return { dir, files, add: { GIT_ASKPASS: ask } };
    }
    const key = await put('key', cred.key.endsWith('\n') ? cred.key : cred.key + '\n', 0o600);
    return { dir, files, add: { GIT_SSH_COMMAND: `ssh -i ${shq(key)} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new` } };
  } catch (e) { await shredCredentials({ dir, files }); throw e; } // a name never written is a no-op for shredFile
}
/** Every credential file overwritten, then unlinked, then the folder — on every way out of a clone. → true when gone. */
async function shredCredentials(c) {
  if (!c) return true;
  let gone = true;
  for (const f of c.files) gone = (await shredFile(f)) && gone;
  await fsp.rm(c.dir, { recursive: true, force: true }).catch(() => {});
  return gone && !fs.existsSync(c.dir);
}
/** THE CLONE: an empty repository, ONE ref fetched at depth 1 (the remote's HEAD when none is named; a tag, a branch or a full
 *  sha otherwise), checked out detached; the sha recorded (a named sha must be what arrived); `.git` removed. */
async function stageFromGit(value, stage, { ref: refIn = null, cred = null, gitBin = 'git', timeout = GIT_TIMEOUT_MS } = {}) {
  const spec = gitSpecOf(value, refIn);
  const dest = path.join(stage, 'pkg');
  let c = null, sha = null;
  try {
    if (cred) c = await credentialFiles(stage, cred);
    const add = c ? c.add : {};
    await gitRun(gitBin, ['init', '--quiet', dest]);
    await gitRun(gitBin, ['-C', dest, '-c', 'credential.helper=', 'fetch', '--depth', '1', '--quiet', '--no-tags', '--', spec.url, spec.ref || 'HEAD'], { add, timeout });
    await gitRun(gitBin, ['-C', dest, 'checkout', '--quiet', '--detach', 'FETCH_HEAD']);
    sha = (await gitRun(gitBin, ['-C', dest, 'rev-parse', 'HEAD'])).stdout.trim();
  } catch (e) { throw e && e.code && GIT_CODES.includes(e.code) ? e : gitFailure(e, { url: spec.url, ref: spec.ref, cred, timeout }); }
  finally { await shredCredentials(c); }
  if (!GIT_SHA_RE.test(sha || '')) throw codedErr(400, 'plugin_git_failed', 'git: the clone names no commit');
  if (spec.ref && GIT_SHA_RE.test(spec.ref) && sha !== spec.ref) throw codedErr(400, 'plugin_git_ref_missing', `git: asked for ${spec.ref}, the repository answered ${sha}`);
  await fsp.rm(path.join(dest, '.git'), { recursive: true, force: true }).catch(() => {});
  try { await auditTree(dest, { hash: false }); } catch (e) { throw Object.assign(e, { code: 'plugin_tree_rejected', payload: { code: 'plugin_tree_rejected' } }); }
  return { dir: dest, ref: spec.ref, sha, url: spec.url };
}
/** THE REACHABILITY TEST of the credential row: `git ls-remote <url> HEAD` with it (the same files, the same shredding). */
async function lsRemote(url, { cred = null, gitBin = 'git', scratch, timeout = 15000 } = {}) {
  const spec = gitSpecOf(url);
  await fsp.mkdir(scratch, { recursive: true });
  const stage = await fsp.mkdtemp(path.join(scratch, 'ls-'));
  let c = null;
  try {
    if (cred) c = await credentialFiles(stage, cred);
    const r = await gitRun(gitBin, ['-c', 'credential.helper=', 'ls-remote', '--', spec.url, 'HEAD'], { add: c ? c.add : {}, timeout });
    const head = (r.stdout.split('\n')[0] || '').split(/\s+/)[0];
    return { ok: true, host: spec.host, head: GIT_SHA_RE.test(head) ? head : null };
  } catch (e) { throw e && e.code && GIT_CODES.includes(e.code) ? e : gitFailure(e, { url: spec.url, ref: null, cred }); }
  finally { await shredCredentials(c); await fsp.rm(stage, { recursive: true, force: true }).catch(() => {}); }
}

/** unzip with a Zip-Slip audit first: every member name is checked before a
 *  single byte is extracted (unzip itself strips leading / and refuses .. in
 *  recent versions, but a listing pass is cheap and version-proof). */
async function stageFromZip(zipPath, stage) {
  let st; try { st = fs.statSync(zipPath); } catch { throw httpErr(400, 'zip: file missing'); }
  if (st.size > MAX_ZIP_BYTES) throw httpErr(413, `zip: larger than ${Math.round(MAX_ZIP_BYTES / 1048576)} MB`);
  let listing;
  try { listing = (await run('unzip', ['-Z1', zipPath], { timeout: 30000 })).stdout; }
  catch (e) { throw httpErr(400, `not a readable .vsp/.zip archive: ${e.message}`); }
  const names = listing.split('\n').filter(Boolean);
  if (!names.length) throw httpErr(400, 'zip: archive is empty');
  if (names.length > MAX_PACKAGE_FILES) throw httpErr(413, `zip: more than ${MAX_PACKAGE_FILES} entries`);
  for (const n of names) {
    if (n.startsWith('/') || n.includes('\\') || n.split('/').some((seg) => seg === '..')) throw httpErr(400, `zip: refused entry "${n.slice(0, 80)}" (path traversal)`);
  }
  const dest = path.join(stage, 'pkg');
  fs.mkdirSync(dest, { recursive: true });
  try { await run('unzip', ['-q', '-o', zipPath, '-d', dest], { timeout: 120000 }); }
  catch (e) { if (!(e.code === 1)) throw httpErr(400, `unzip failed: ${e.message}`); } // exit 1 = warnings only
  await auditTree(dest, { hash: false });
  return dest;
}

// a release a person named (its GitHub lookup + the asset it lists, wherever that redirects) ⇒ safeFetch (lane
// runtime-floor's belt: gzip or nothing — never a decoder the answering server picks)
async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await safeFetch(url, { ...opts, signal: ctl.signal, maxBytes: MAX_ZIP_BYTES + 1024 * 1024 }); }
  finally { clearTimeout(timer); }
}

async function stageFromGithubRelease(value, stage) {
  const m = GH_SPEC_RE.exec(String(value || '').trim());
  if (!m) throw httpErr(400, 'github-release: use owner/repo or owner/repo@tag');
  const [, owner, repo, tag] = m;
  const api = `https://api.github.com/repos/${owner}/${repo}/releases/${tag ? 'tags/' + encodeURIComponent(tag) : 'latest'}`;
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'vibespace-plugin-installer' };
  let rel;
  try {
    const r = await fetchWithTimeout(api, { headers });
    if (!r.ok) throw new Error(r.status === 404 ? 'release not found (public repositories only)' : `GitHub API answered ${r.status}`);
    rel = await r.json();
  } catch (e) { throw httpErr(400, `github-release: ${e.message}`); }
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const asset = assets.find((a) => /\.vsp$/i.test(a.name || '')) || (assets.filter((a) => /\.zip$/i.test(a.name || '')).length === 1 ? assets.find((a) => /\.zip$/i.test(a.name || '')) : null);
  if (!asset) throw httpErr(400, `github-release: release ${rel.tag_name || ''} has no *.vsp asset (assets: ${assets.map((a) => a.name).join(', ') || 'none'})`);
  if (Number(asset.size) > MAX_ZIP_BYTES) throw httpErr(413, `github-release: asset ${asset.name} is larger than ${Math.round(MAX_ZIP_BYTES / 1048576)} MB`);
  const zipPath = path.join(stage, 'asset.vsp');
  try {
    const r = await fetchWithTimeout(asset.browser_download_url, { headers: { 'user-agent': headers['user-agent'] } }, 120000);
    if (!r.ok) throw new Error(`download answered ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_ZIP_BYTES) throw new Error('asset exceeds the size cap');
    fs.writeFileSync(zipPath, buf);
  } catch (e) { throw httpErr(400, `github-release: ${e.message}`); }
  const dir = await stageFromZip(zipPath, stage);
  return { dir, resolvedValue: `${owner}/${repo}@${rel.tag_name || tag || 'latest'}` };
}

function moveDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
    fs.rmSync(from, { recursive: true, force: true }); // only after the copy succeeded — a move, never a delete
  }
}

function create({ rootDir, hostVersion = null, forbiddenRoots = [], log = console, integrations = () => null, gitBin = 'git', gitTimeoutMs = GIT_TIMEOUT_MS } = {}) {
  const pluginsDir = path.join(rootDir, 'data', 'plugins');
  const stateDir = path.join(rootDir, 'data', 'plugins-state');
  const stagingDir = path.join(rootDir, 'data', 'plugins-staging');
  const trashDir = path.join(rootDir, 'data', 'plugins-trash');

  /** THE CREDENTIAL of a git install (lane engine-distribution): `mode` = null (none — a public repository) | 'plugin-git'
   *  (the person chose it: unset / locked / for another host ⇒ refused by name) | 'auto' (the fleet's boot install: the row
   *  when it holds a credential for this host, else none). Resolved through the integration store — THE one reader of the
   *  sealed values — at the moment of the clone, never kept. → {kind:'token'|'key', host, username, token|key} | null. */
  function credentialFor(spec, mode) {
    if (!mode) return null;
    if (mode !== GIT_CREDENTIAL_ROW && mode !== 'auto') throw codedErr(400, 'plugin_git_credential', `git: unknown credential "${String(mode).slice(0, 40)}" — the one a plugin install uses is the Plugin Git credential (${GIT_CREDENTIAL_ROW})`);
    const strict = mode === GIT_CREDENTIAL_ROW;
    const no = (why) => { if (strict) throw codedErr(400, 'plugin_git_credential', `git: the Plugin Git credential cannot be used — ${why}`); return null; };
    let store = null; try { store = typeof integrations === 'function' ? integrations() : integrations; } catch { store = null; }
    if (!store || typeof store.resolveIntegration !== 'function') return no('this instance has no integration store');
    let r;
    try { r = store.resolveIntegration('plugin-git'); } catch (e) { return no(String(e && e.message).slice(0, 160)); }
    // a credential that EXISTS but cannot be read now (the vault locked, a rotated key) is refused even for 'auto' — an anonymous
    // clone in its place would only fail as «auth» and hide the reason
    if (r && r.source === 'none' && (r.whyCode === 'vault-locked' || r.whyCode === 'undecryptable')) throw codedErr(400, 'plugin_git_credential', `git: the Plugin Git credential cannot be used — ${IR.credentialWhyText(r)}`);
    if (!r || r.source === 'none') return no(`${IR.credentialWhyText(r || {}) || 'none is set'} (Integrations → Plugins → Plugin Git repository)`);
    const v = r.values || {};
    const host = String(v.host || '').trim().toLowerCase();
    if (!host || host !== spec.host) return no(`it is for ${host || 'no host'}, the repository is on ${spec.host}`);
    if (spec.https) return v.token ? { kind: 'token', host, username: String(v.username || '').trim() || 'x-access-token', token: String(v.token) } : no('it holds no token for an https repository');
    return v.deployKey ? { kind: 'key', host, key: String(v.deployKey).replace(/\r\n/g, '\n') } : no('it holds no deploy key for an ssh repository');
  }
  /** The row's Test (registered by the loader with a repository it knows on that host): ls-remote with the credential. */
  async function testCredential(url) {
    const spec = gitSpecOf(url);
    const cred = credentialFor(spec, GIT_CREDENTIAL_ROW);
    return lsRemote(url, { cred, gitBin, scratch: stagingDir });
  }

  /** Move a plugin's dir + state dir to the trash (never rmSync). Returns the trash path or null. */
  function trash(id, { reason = 'uninstall' } = {}) {
    const pdir = path.join(pluginsDir, id), sdir = path.join(stateDir, id);
    if (!fs.existsSync(pdir) && !fs.existsSync(sdir)) return null;
    const dest = path.join(trashDir, `${id}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(dest, { recursive: true });
    if (fs.existsSync(pdir)) moveDir(pdir, path.join(dest, 'plugin'));
    if (reason === 'uninstall' && fs.existsSync(sdir)) moveDir(sdir, path.join(dest, 'state'));
    try { fs.writeFileSync(path.join(dest, 'why.json'), JSON.stringify({ id, reason, at: new Date().toISOString() }, null, 2)); } catch { }
    return dest;
  }

  /**
   * Install (or replace) from a source. `expectId` (update) refuses a package
   * whose id differs from the record being updated.
   * `contentHash` fingerprints the staged package so the loader can tell a
   * byte-identical reinstall from a DIFFERENT package claiming the same id.
   * lane engine-distribution: a git source takes `ref` (a tag, a branch or a full sha) and `credential` (credentialFor).
   * @returns {{ id, version, dir, replaced: boolean, previous: string|null, source, value, contentHash, warnings, ref, sha }}
   */
  async function install({ source, value, file = null, expectId = null, ref = null, credential = null } = {}) {
    // The uploaded temp file is cleaned in EVERY exit path — the source
    // whitelist used to throw ABOVE the try/finally, so a bad `source` left the
    // multipart upload sitting in os.tmpdir() forever (2.369.43).
    try {
      source = String(source || '').trim();
      if (!['path', 'git', 'zip', 'github-release'].includes(source)) throw httpErr(400, 'source must be path | git | zip | github-release');
      fs.mkdirSync(stagingDir, { recursive: true });
      const stage = fs.mkdtempSync(path.join(stagingDir, 'st-'));
      let resolvedValue = value, gitRef = null, gitSha = null;
      try {
        let pkgDir;
        if (source === 'path') pkgDir = await stageFromPath(value, stage);
        else if (source === 'git') {
          const spec = gitSpecOf(value, ref);
          const g = await stageFromGit(value, stage, { ref, cred: credentialFor(spec, credential), gitBin, timeout: gitTimeoutMs });
          pkgDir = g.dir; resolvedValue = g.url; gitRef = g.ref; gitSha = g.sha;
        }
        else if (source === 'zip') {
          if (!file) throw httpErr(400, 'zip: upload the .vsp file as the multipart field "file"');
          pkgDir = await stageFromZip(file, stage);
          resolvedValue = path.basename(String(value || file));
        } else { const r = await stageFromGithubRelease(value, stage); pkgDir = r.dir; resolvedValue = r.resolvedValue; }
        let root;
        try { root = findPackageRoot(pkgDir); } catch (e) { throw codedErr(400, 'plugin_tree_rejected', e.message); }
        let raw;
        try { raw = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf-8')); }
        catch (e) { throw codedErr(400, 'plugin_tree_rejected', `${MANIFEST}: ${e.message}`); }
        const v = validateManifest(raw, { hostVersion, homeDir: os.homedir(), forbiddenRoots });
        if (!v.ok) throw codedErr(400, 'plugin_tree_rejected', `invalid manifest: ${v.errors.join('; ')}`);
        const id = v.manifest.id;
        if (expectId && id !== expectId) throw httpErr(409, `the package is "${id}" but this record is "${expectId}" — install it as a new plugin instead`);
        if (v.manifest.server && !fs.existsSync(path.join(root, 'server.js'))) throw codedErr(400, 'plugin_tree_rejected', 'manifest says server: true but the package has no server.js');
        let contentHash;
        try { ({ contentHash } = await auditTree(root)); } catch (e) { throw Object.assign(e, { code: 'plugin_tree_rejected', payload: { code: 'plugin_tree_rejected' } }); } // the fingerprint of what actually lands on disk
        const target = path.join(pluginsDir, id);
        const replaced = fs.existsSync(target);
        const previous = replaced ? trash(id, { reason: expectId ? 'update' : 'reinstall' }) : null;
        fs.mkdirSync(pluginsDir, { recursive: true });
        moveDir(root, target);
        log.log?.(`[plugins] installed ${id}@${v.manifest.version} from ${source}${gitSha ? ` @${gitRef || 'HEAD'} (${gitSha.slice(0, 12)})` : ''}${replaced ? ' (previous copy in trash)' : ''}`);
        return { id, version: v.manifest.version, dir: target, replaced, previous, source, value: resolvedValue, contentHash, warnings: v.warnings, ref: gitRef, sha: gitSha };
      } finally {
        try { fs.rmSync(stage, { recursive: true, force: true }); } catch { }
      }
    } finally {
      if (file) { try { fs.rmSync(file, { force: true }); } catch { } }
    }
  }

  return { install, trash, testCredential, pluginsDir, stateDir, trashDir, stagingDir };
}

module.exports = { create, auditTree, findPackageRoot, stageFromZip, GH_SPEC_RE, MAX_ZIP_BYTES, MANIFEST,
  GIT_REF_RE, GIT_SHA_RE, GIT_CODES, GIT_CREDENTIAL_ROW, gitHostOf, gitSpecOf, credentialFiles, shredCredentials }; // lane engine-distribution
