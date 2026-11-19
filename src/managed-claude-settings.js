'use strict';
/**
 * DOES THIS MACHINE'S MANAGED CLAUDE SETTINGS SET A KEY HELPER, OR AN ANTHROPIC CREDENTIAL OR ADDRESS? (lane lg-providers, B-d578 —
 * 主开发 2026-11-18 23:45Z, as if a must)
 *
 * READ FROM THE CLI ITSELF (Claude Code 2.1.322's bundle, never run): its settings sources merge in the order user, project, local,
 * flag (--settings), policy (the managed source) — later entries override earlier ones, so the managed source wins over the inline
 * `--settings {"apiKeyHelper":""}` a start passes; and the CLI copies every source's `env` block, the managed one included, over the
 * spawn's own environment. When ANTHROPIC_API_KEY is empty (a token-auth provider's plan empties it) the CLI's key road takes the
 * helper's key and sends it as x-api-key beside the provider's own bearer token — to the PROVIDER's address; a managed env credential
 * goes the same way, and a managed ANTHROPIC_BASE_URL sends the provider's key to the organisation's address instead. Such a start is
 * refused by name before anything spawns (src/ws-create.js; the provider Test likewise, src/server/provider-test.js).
 * (The bundle names host switches that set a managed helper aside — CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST, --bare — with wide effects
 * on what else the CLI reads; none is relied on until it is measured.)
 *
 * THE MANAGED FILE SOURCES (the CLI's own paths): managed-settings.json and the drop-in folder managed-settings.d/*.json in
 * /etc/claude-code (Linux), /Library/Application Support/ClaudeCode (macOS), C:\Program Files\ClaudeCode (Windows).
 * ITS OTHER SOURCES: server-managed settings (not fetched for a custom ANTHROPIC_BASE_URL, which every provider start sets — whether
 * a cached copy still applies could not be told from the bundle); the macOS managed-preferences file for the CLI
 * (com.anthropic.claudecode.plist under /Library/Managed Preferences — the public documentation's name; present ⇒ CANNOT TELL, it is
 * not parsed here); a `policyHelper` a managed document names (it computes settings at startup: CANNOT TELL); and THE WINDOWS POLICY
 * — the `Settings` value under HKLM / HKCU \SOFTWARE\Policies\ClaudeCode (the bundle's own keys and value) and the Windows managed
 * folder — which the CLI reads on Windows, and from WSL (reg.exe, the DrvFs folder): asked here by ONE read-only query per key
 * through the Windows helper (reg.exe by the CLI's own absolute path, both keys at once: a child with a time bound, no shell, its
 * output read as data; on WSL the admin sources apply only when one opts in — wslInheritsWindowsSettings — and HKCU only with its own);
 * no policy ⇒ the start
 * runs; a policy that sets a helper, a credential or an address ⇒ refused like a managed file; a value that does not parse ⇒ the
 * administrator's to fix (cannot tell, as a managed file that does not parse); the helper failing, over its bound or answering what
 * it cannot read ⇒ refused in ITS OWN words (VibeSpace could not read the Windows policy — no administrator is named); the helper
 * absent or unable to start (WSL interop off) ⇒ its own words with no retry promised. A native Windows hub is judged the same way.
 *
 * EVERY READ IS BOUNDED (as ws-create's own settings reader): opened non-blocking (a FIFO never holds a start), a regular file under
 * 1 MiB, ONE of each read in flight across starts (a file's, the folder's stat / statfs / listing, each policy query), the whole answer
 * within MANAGED_FACT_MS; a folder on a NETWORK or FUSE filesystem
 * is never read (statfs) — a local mount (a bind, a container's config map) is a plain local read.
 * → { named: true | false | null, where, cause }  (null = cannot tell; a refusal either way)
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DIRS = Object.freeze({ linux: '/etc/claude-code', darwin: '/Library/Application Support/ClaudeCode', win32: 'C:\\Program Files\\ClaudeCode' });
const MAC_PREFS = '/Library/Managed Preferences';
const MAC_PREF_FILE = /^com\.anthropic\.claudecode\.plist$/i;
const MANAGED_FACT_MS = 8000;
const MAX_BYTES = 1 << 20;
const WIN_DRVFS_DIR = '/mnt/c/Program Files/ClaudeCode';   // the Windows managed folder as WSL sees it (the CLI's own path)
const POLICY_KEYS = Object.freeze(['HKLM\\SOFTWARE\\Policies\\ClaudeCode', 'HKCU\\SOFTWARE\\Policies\\ClaudeCode']);
const POLICY_VALUE = 'Settings';
const REG_MS = 5000;   // per key, as the CLI bounds it; both keys asked AT ONCE (inside MANAGED_FACT_MS)
const REG_MAX = 2 * 1024 * 1024;   // the CLI's own output cap
/** the Windows helper by the CLI's OWN absolute path (it never searches PATH: a service PATH or appendWindowsPath=false has none) */
const regExeOf = (platform, env) => (platform === 'win32' ? path.win32.join(String((env && (env.SystemRoot || env.SYSTEMROOT || env.windir)) || 'C:\\Windows'), 'System32', 'reg.exe') : '/mnt/c/Windows/System32/reg.exe');
// THE ENV RULE (主开发 00:42Z «only credentials and routes»; 01:46Z «against the bundle's own, whole»): a managed env name refuses when
// it decides WHERE the CLI's requests go, WHO can read them, or WHAT credential they carry. The list is the CLI 2.1.322's OWN: the set
// of connection names it strips from a settings source it cannot verify (`lu` in its bundle — its proxy and TLS-trust names, its cloud
// switches and addresses, its credentials and credential files, the config and home folders it reads a login from), WHOLE and in its
// order, its spreads written out; and four it keeps in its other lists (its proxy set's two CLAUDE_CODE_ proxies, the sessions
// token, the Google Cloud auth). TRUST names count by themselves: a managed CA (or the TLS check off) lets whoever holds that CA read
// every request, the provider's key in it — an organisation's inspecting proxy named in the managed env, in the hub's own
// environment (the CLI inherits it), or on the network with no proxy name at all. Matched as the CLI matches them: in ANY case. A
// counted name refuses WHATEVER its value — an EMPTY value is copied over the spawn's own too (a blanked provider token or address
// lets the CLI fall back to another login or to Anthropic's address) — except the seven cloud switches, a route only when ON.
const CLI_CONNECTION_NAMES = Object.freeze([
  // ...us (its network names: proxies, TLS trust, the client certificate)
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'ALL_PROXY', 'NPM_CONFIG_HTTPS_PROXY', 'NPM_CONFIG_HTTP_PROXY', 'NPM_CONFIG_PROXY',
  'NODE_EXTRA_CA_CERTS', 'CLAUDE_CODE_CERT_STORE', 'CLAUDE_CODE_DISABLE_LOOPED_CROSS_CERT_DROP', 'CLAUDE_CODE_DISABLE_SELF_NAMED_CERT_DROP', 'CLAUDE_CODE_CLIENT_CERT',
  'CLAUDE_CODE_CLIENT_KEY', 'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE', 'NODE_TLS_REJECT_UNAUTHORIZED', 'BUN_TLS_REFUSE_DISTRUSTED_KEYS',
  'CLAUDE_CODE_PROXY_RESOLVES_HOSTS', 'CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER', 'CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS', 'API_FORCE_IDLE_TIMEOUT', 'ANTHROPIC_UNIX_SOCKET',
  'CLAUDE_CODE_DISABLE_HTTPS_AGENT_KEEPING', 'NODE_OPTIONS',
  // ...UM (the cloud switches and their resources)
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_MANTLE',
  'CLAUDE_CODE_USE_GATEWAY', 'ANTHROPIC_FOUNDRY_RESOURCE', 'ANTHROPIC_VERTEX_PROJECT_ID', 'ANTHROPIC_AWS_WORKSPACE_ID', 'ANTHROPIC_GOOGLE_CLOUD_PROJECT',
  'ANTHROPIC_GOOGLE_CLOUD_LOCATION', 'ANTHROPIC_GOOGLE_CLOUD_WORKSPACE_ID', 'CLOUD_ML_REGION',
  // ...MV (the addresses, with ...oc and ...ls: the artifacts' and the memory service's)
  'ANTHROPIC_BASE_URL', '_CLAUDE_CODE_ASSUME_FIRST_PARTY_BASE_URL', 'ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_VERTEX_BASE_URL', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_AWS_BASE_URL',
  'ANTHROPIC_GOOGLE_CLOUD_BASE_URL', 'ANTHROPIC_BEDROCK_MANTLE_BASE_URL', 'CLAUDE_CODE_ARTIFACTS_API_BASE_URL', 'CLAUDE_CODE_ARTIFACTS_API_TOKEN', 'CLAUDE_CODE_ARTIFACT_ASSET_BASE_URL',
  'CLAUDE_CODE_ARTIFACT_LIVE_BASE_URL', 'CLAUDE_CODE_ARTIFACT_SYNC_BASE_URL', 'CLAUDE_CODE_ARTIFACT_VIEWER_BASE_URL', 'CLAUDE_CODE_MEMORY_API_BASE_URL', 'CLAUDE_CODE_MEMORY_API_TOKEN',
  'AWS_ENDPOINT_URL_STS', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_SSO', 'AWS_ENDPOINT_URL_SSO_OIDC', 'AWS_ENDPOINT_URL_BEDROCK', 'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
  // ...Iun, ...hn, ...IUr (the cloud SDKs' credentials, credential files and metadata addresses)
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI', 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI', 'AWS_CONTAINER_AUTHORIZATION_TOKEN', 'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT', 'AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE', 'AWS_WEB_IDENTITY_TOKEN_FILE', 'AWS_ROLE_ARN', 'GCE_METADATA_HOST', 'GCE_METADATA_ROOT', 'GCE_METADATA_IP',
  'METADATA_SERVER_DETECTION', 'CLOUDSDK_CONFIG', 'GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES', 'GCLOUD_PROJECT', 'CLAUDE_CODE_CUSTOM_OAUTH_URL',
  // ...aO (the Anthropic and cloud keys and tokens)
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_AUTH_TOKEN', 'ANTHROPIC_AWS_API_KEY',
  // the logins, the federation profile and the folders a login is read from
  'CLAUDE_CODE_API_BASE_URL', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_CODE_OAUTH_SCOPES', 'CLAUDE_CODE_OAUTH_CLIENT_ID', 'CLAUDE_CODE_SESSION_ACCESS_TOKEN', 'CLAUDE_SESSION_INGRESS_TOKEN_FILE',
  'CLAUDE_CODE_ENVIRONMENT_KIND', 'CLAUDE_CODE_REMOTE_SESSION_ID', 'ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'ANTHROPIC_WORKSPACE_ID', 'ANTHROPIC_SERVICE_ACCOUNT_ID',
  'ANTHROPIC_IDENTITY_TOKEN', 'ANTHROPIC_IDENTITY_TOKEN_FILE', 'ANTHROPIC_SCOPE', 'ANTHROPIC_PROFILE', 'ANTHROPIC_CONFIG_DIR', 'CLAUDE_CODE_FEDERATION_CACHE_DIR', 'HOME', 'XDG_CONFIG_HOME',
  'APPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'PROGRAMDATA', 'ALLUSERSPROFILE', 'ANTHROPIC_CUSTOM_HEADERS', 'CLAUDE_CODE_HOST_CREDS_FILE', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
  'CLAUDE_CODE_HOST_AUTH_ENV_VAR', 'CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'CLAUDE_CODE_REMOTE_SETTINGS_PATH', 'CLAUDE_CODE_MANAGED_SETTINGS_PATH',
  'CLAUDE_CODE_DISABLE_ADMIN_ENV_UNION', 'CLAUDE_CODE_MOCK_REMOTE_SETTINGS', 'USE_LOCAL_OAUTH', 'USE_STAGING_OAUTH', 'CLAUDE_LOCAL_OAUTH_API_BASE', 'CLAUDE_LOCAL_OAUTH_APPS_BASE',
  'CLAUDE_LOCAL_OAUTH_CONSOLE_BASE', 'CLAUDE_BRIDGE_BASE_URL', 'CLAUDE_BRIDGE_OAUTH_TOKEN', 'CLAUDE_BRIDGE_SESSION_INGRESS_URL', 'CLAUDE_REMOTE_TOOLS_BRIDGE_URL', 'CLAUDE_CODE_GB_BASE_URL']);
const ENV_OTHER_NAMES = Object.freeze(['CLAUDE_CODE_HTTPS_PROXY', 'CLAUDE_CODE_HTTP_PROXY', 'CLAUDE_CODE_SESSIONS_OAUTH_TOKEN', 'ANTHROPIC_GOOGLE_CLOUD_AUTH']);
// NOT COUNTED, each for its reason (the rest of the CLI's list counts): it neither sends a request elsewhere, nor lets another read it,
// nor carries a credential. (npm's three proxy names COUNT — 主开发 02:49Z: when ALL_PROXY is set without the four names the CLI's
// request proxy reads, it hands its axios client back to that client's own env resolution — `Mt.defaults.proxy=n?void 0:!1` — and
// such resolvers read the npm names.)
const ENV_NOT_COUNTED = Object.freeze({
  NO_PROXY: 'narrows where a proxy is used',
  API_FORCE_IDLE_TIMEOUT: 'a connection timing', CLAUDE_CODE_DISABLE_HTTPS_AGENT_KEEPING: 'a connection timing', CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS: 'a connection timing',
});
const ENV_SWITCHES = Object.freeze(new Set(['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD',
  'CLAUDE_CODE_USE_MANTLE', 'CLAUDE_CODE_USE_GATEWAY']));   // a route only when ON
const ENV_NAMES = Object.freeze(new Set([...CLI_CONNECTION_NAMES, ...ENV_OTHER_NAMES].filter((n) => !Object.prototype.hasOwnProperty.call(ENV_NOT_COUNTED, n) && !ENV_SWITCHES.has(n))));
const switchedOff = (v) => v === false || v === 0 || /^(?:|0|false|no|off)$/i.test(String(v == null ? '' : v).trim());
/** the first managed env name that decides where a request goes, who reads it or what credential it carries → name | null */
function envHit(env) {
  for (const [k, v] of Object.entries(env || {})) {
    const n = String(k).toUpperCase();
    if (ENV_SWITCHES.has(n) ? !switchedOff(v) : ENV_NAMES.has(n)) return k;
  }
  return null;
}
// filesystems never read: network and FUSE (statfs f_type)
const NETWORK_FS = new Set([0x6969 /* nfs */, 0x517b /* smb */, 0xff534d42 /* cifs */, 0xfe534d42 /* smb2 */, 0x65735546 /* fuse */, 0x01021997 /* 9p */, 0x00c36400 /* ceph */, 0x5346414f /* afs */, 0x47504653 /* gpfs */, 0x19830326 /* fhgfs */, 0x0bd00bd0 /* lustre */]);

const inFlight = new Map();   // ONE of each read in flight across starts (a hung call holds one threadpool thread, never one per start)
function once(key, fn) {
  const had = inFlight.get(key);
  if (had) return had;
  const p = Promise.resolve().then(fn).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
function readOnce(file, fsp) {
  return once('file:' + file, async () => {
    let fh = null;
    try {
      fh = await fsp.open(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
      const st = await fh.stat();
      if (!st.isFile() || st.size > MAX_BYTES) return { unreadable: true };
      return { text: await fh.readFile('utf8') };
    } catch (e) { return e && e.code === 'ENOENT' ? { missing: true } : { unreadable: true }; } finally { try { await fh?.close(); } catch { } }
  });
}
const statOnce = (p, fsp) => once('stat:' + p, () => fsp.stat(p));
const statfsOnce = (p, fsp) => once('statfs:' + p, () => fsp.statfs(p));
const readdirOnce = (p, fsp) => once('readdir:' + p, () => fsp.readdir(p));

/** ONE read-only query of a Windows policy value through the Windows helper (reg.exe by its absolute path, as the CLI asks it): a
 *  child with a time bound, no shell, its output read as data → { set: doc } | { none: true } | { failed: why } */
function regQuery(key, { exec = execFile, regExe, env = process.env, boundMs = REG_MS } = {}) {
  return once('reg:' + regExe + ':' + key, () => new Promise((resolve) => {
    const childEnv = {};
    for (const k of ['PATH', 'WSL_INTEROP', 'WSL_DISTRO_NAME', 'WSLENV', 'SystemRoot', 'SYSTEMROOT', 'windir']) if (env && env[k] != null) childEnv[k] = env[k];
    try {
      exec(regExe, ['query', key, '/v', POLICY_VALUE], { shell: false, timeout: boundMs, killSignal: 'SIGKILL', windowsHide: true, env: childEnv, maxBuffer: REG_MAX, encoding: 'utf8' }, (err, stdout, stderr) => {
        const out = String(stdout || '');
        if (err) {
          if (err.code === 'ENOENT') return resolve({ failed: 'absent' });
          // cannot be started at all (WSL interop off, /mnt/c mounted noexec): as lasting as an absent helper — no retry helps
          if (err.code === 'EACCES' || err.code === 'ENOEXEC') return resolve({ failed: 'cannot-start' });
          if (err.killed || err.signal) return resolve({ failed: 'timeout' });
          if (err.code === 1 || /unable to find the specified registry key or value/i.test(String(stderr || '') + out)) return resolve({ none: true });   // reg.exe: no such key or value
          return resolve({ failed: 'error' });
        }
        // exit 0 = the value IS there: its name in any case (as the CLI matches it), a string type, the WHOLE rest of the output its
        // data (a value may span lines). Another type, or a reply the parser cannot read (mis-encoded) = CANNOT TELL — never no policy
        // (主开发 01:46Z: the could-not-read words); a string value whose JSON does not parse = the ADMINISTRATOR's to fix (the
        // cannot-tell words, as a managed file that does not parse — retrying never mends it)
        const m = /^[ \t]+settings[ \t]+(REG_\w+)[ \t]*([\s\S]*)$/im.exec(out);
        if (!m || !/^REG_(?:SZ|EXPAND_SZ)$/i.test(m[1])) return resolve({ failed: 'unparsable' });
        const data = m[2].trim();
        if (!data) return resolve({ none: true });
        try { return resolve({ set: JSON.parse(data) }); } catch { return resolve({ malformed: true }); }
      });
    } catch (e) { resolve({ failed: e && e.code === 'ENOENT' ? 'absent' : e && (e.code === 'EACCES' || e.code === 'ENOEXEC') ? 'cannot-start' : 'error' }); }
  }));
}

/** one managed document → { named, cause } | null (names nothing) */
function judge(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { named: null, cause: 'unreadable' };
  if (typeof doc.apiKeyHelper === 'string' && doc.apiKeyHelper.trim()) return { named: true, cause: 'apiKeyHelper' };
  const env = doc.env && typeof doc.env === 'object' ? doc.env : null;
  if (env && envHit(env)) return { named: true, cause: 'env' };
  if (doc.policyHelper || doc.policyHelpers) return { named: null, cause: 'policyHelper' };
  return null;
}

/** one managed FOLDER's documents: managed-settings.json + managed-settings.d/*.json → { fact } (cannot tell) | { docs: [{ where, doc }] }.
 *  `anyFs`: the folder is the machine's own disk however its filesystem reads (the DrvFs C: drive under WSL) — the network rule does
 *  not apply to it */
async function folderDocs(root, fsp, { anyFs = false } = {}) {
  let st = null;
  try { st = await statOnce(root, fsp); } catch (e) { if (!e || e.code !== 'ENOENT') return { fact: { named: null, where: root, cause: 'unreadable' } }; }
  if (!st) return { docs: [] };
  if (!st.isDirectory()) return { fact: { named: null, where: root, cause: 'unreadable' } };
  if (!anyFs && typeof fsp.statfs === 'function') { try { const sf = await statfsOnce(root, fsp); if (NETWORK_FS.has(Number(sf.type) >>> 0)) return { fact: { named: null, where: root, cause: 'network-mount' } }; } catch { return { fact: { named: null, where: root, cause: 'unreadable' } }; } }
  const files = [path.join(root, 'managed-settings.json')];
  const dropIns = path.join(root, 'managed-settings.d');
  try { for (const n of [...(await readdirOnce(dropIns, fsp))].sort()) if (/\.json$/i.test(n)) files.push(path.join(dropIns, n)); } catch (e) { if (!e || e.code !== 'ENOENT') return { fact: { named: null, where: dropIns, cause: 'unreadable' } }; }
  const docs = [];
  for (const f of files) {
    const r = await readOnce(f, fsp);
    if (r.missing) continue;
    if (r.unreadable) return { fact: { named: null, where: f, cause: 'unreadable' } };
    let doc;
    try { doc = JSON.parse(r.text); } catch { return { fact: { named: null, where: f, cause: 'unreadable' } }; }
    docs.push({ where: f, doc });
  }
  return { docs };
}
/** one managed FOLDER judged → a fact | null (names nothing) */
async function folderFact(root, fsp, opts = {}) {
  const r = await folderDocs(root, fsp, opts);
  if (r.fact) return r.fact;
  for (const d of r.docs) { const j = judge(d.doc); if (j) return { ...j, where: d.where }; }
  return null;
}

/** does an ADMIN Windows source (HKLM, the Windows managed file) arm the WSL chain? As the CLI reads it (gGs + ix): absent or null =
 *  disarmed, true / "true" = armed, false / "false" = disarmed — ANY OTHER value is «unreadable», and the CLI then arms it (fails closed:
 *  `B = w !== "disarmed"`) — so do we */
function armsWsl(doc) {
  const v = doc && typeof doc === 'object' ? doc.wslInheritsWindowsSettings : undefined;
  if (v === undefined || v === null) return false;
  return !(v === false || v === 'false');
}

/** THE WINDOWS POLICY (on Windows, and from WSL), as the CLI applies it: HKLM and HKCU asked AT ONCE. On WSL the admin sources (HKLM, the
 *  DrvFs managed folder) apply only when one of them opts in (`wslInheritsWindowsSettings`, armed as the CLI arms it: armsWsl), HKCU
 *  only with BOTH that admin opt-in and its OWN true (the CLI's double opt-in); on Windows all apply. (The CLI also sets HKCU aside
 *  when HKLM or an admin file has content — judged here anyway: a refusal it would not make, never a start it would leak.) A value
 *  that does not parse = the administrator's to fix (cannot tell); the helper failing or late = VibeSpace could not read it (its own
 *  words); absent or unable to start = its own words, no retry. → a fact | null */
async function windowsPolicyFact({ wsl, drvfsDir, fsp, reg = {}, platform, env = process.env, phase = {} }) {
  // the outer bound, if it ends in here, answers the Windows read's own verdict, naming what it waits on (a key, then the DrvFs folder)
  phase.at = 'windows'; phase.where = POLICY_KEYS[0];
  const regExe = reg.regExe || regExeOf(platform, reg.env || env);
  const pending = new Set(POLICY_KEYS);
  const [hklm, hkcu] = await Promise.all(POLICY_KEYS.map((key) => regQuery(key, { ...reg, regExe }).then((q) => { pending.delete(key); if (pending.size) phase.where = [...pending][0]; return q; })));
  // a value that does not parse: the administrator's (cannot tell); the helper ABSENT or unable to start: its own words (no retry
  // promised); failing, over its bound, or answering what it cannot read: «could not read»
  const unread = (q, key) => (q.malformed ? { named: null, where: key, cause: 'unreadable' }
    : { named: null, where: key, cause: q.failed === 'absent' || q.failed === 'cannot-start' ? 'windows-absent' : 'windows-unread', why: q.failed, onWsl: !!wsl });   // onWsl: the words' advice is WSL's or native Windows'
  if (hklm.failed || hklm.malformed) return unread(hklm, POLICY_KEYS[0]);
  const drvDocs = [];
  if (wsl) {
    phase.where = drvfsDir || WIN_DRVFS_DIR;
    const drv = await folderDocs(drvfsDir || WIN_DRVFS_DIR, fsp, { anyFs: true });   // the C: drive WSL mounts (9p): the machine's own disk
    if (drv.fact) return drv.fact;   // a DrvFs file that cannot be read: cannot tell
    drvDocs.push(...drv.docs);
  }
  const adminOptIn = !wsl || armsWsl(hklm.set) || drvDocs.some((d) => armsWsl(d.doc));
  if (adminOptIn) {
    if (hklm.set) { const j = judge(hklm.set); if (j) return { ...j, where: POLICY_KEYS[0] }; }
    for (const d of drvDocs) { const j = judge(d.doc); if (j) return { ...j, where: d.where }; }
  }
  if (hkcu.failed || hkcu.malformed) return unread(hkcu, POLICY_KEYS[1]);
  // DELIBERATELY wider than the CLI's `=== true` (it also takes "true", as the CLI's schema coerces it): wider only refuses more
  const cuOwn = !!hkcu.set && (hkcu.set.wslInheritsWindowsSettings === true || hkcu.set.wslInheritsWindowsSettings === 'true');
  if (hkcu.set && (!wsl || (adminOptIn && cuOwn))) { const j = judge(hkcu.set); if (j) return { ...j, where: POLICY_KEYS[1] }; }
  return null;
}

async function factOf({ platform, dir, macPrefs, fsp, wsl, drvfsDir, reg, phase = {} }) {
  const isWsl = typeof wsl === 'boolean' ? wsl : (platform === 'linux' && !dir ? await wslOf(fsp) : false);
  const root = dir || DIRS[platform] || DIRS.linux;
  const own = await folderFact(root, fsp);
  if (own) return own;
  if (isWsl || platform === 'win32') {
    const win = await windowsPolicyFact({ wsl: isWsl, drvfsDir, fsp, reg, platform, phase });
    if (win) return win;
  }
  if (platform === 'darwin' && macPrefs) {
    const look = async (d, depth) => {
      let names = [];
      try { names = await readdirOnce(d, fsp); } catch { return null; }
      for (const n of names) if (MAC_PREF_FILE.test(n)) return path.join(d, n);
      if (depth > 0) for (const n of names) { const hit = await look(path.join(d, n), depth - 1); if (hit) return hit; }   // the per-user folders under it
      return null;
    };
    const hit = await look(macPrefs, 1);
    if (hit) return { named: null, where: hit, cause: 'mac-prefs' };
  }
  return { named: false, where: root, cause: null };
}

/** a Linux CLI running under WSL (it reads the Windows policy keys through reg.exe) — the env WSL sets, else the kernel's release */
async function wslOf(fsp) {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  const r = await readOnce('/proc/sys/kernel/osrelease', fsp);
  return !!(r && r.text && /microsoft/i.test(r.text));
}

/** → { named, where, cause } within `boundMs` (no answer in time = cannot tell) */
function managedHelperFact({ platform = process.platform, dir = null, macPrefs = MAC_PREFS, fsp = fs.promises, wsl = null, drvfsDir = null, reg = {}, boundMs = MANAGED_FACT_MS } = {}) {
  let timer = null;
  const phase = { at: 'files' };
  const root = dir || DIRS[platform] || DIRS.linux;
  // the bound ending while the WINDOWS read is pending is THAT read's verdict (could not read the Windows policy) — never the
  // administrator's words for the Linux folder
  const late = new Promise((r) => { timer = setTimeout(() => r(phase.at === 'windows' ? { named: null, where: phase.where || POLICY_KEYS[0], cause: 'windows-unread', why: 'timeout' } : { named: null, where: root, cause: 'timeout' }), boundMs); timer.unref?.(); });
  return Promise.race([factOf({ platform, dir, macPrefs, fsp, wsl, drvfsDir, reg, phase }).catch(() => ({ named: null, where: root, cause: 'unreadable' })), late]).finally(() => clearTimeout(timer));
}

/** the words a person reads (English t() keys; {provider} = the provider's name, {where} = the file or source) */
const MANAGED_HELPER_WORDS = Object.freeze({
  named: '{provider} cannot start on this machine: its managed Claude settings ({where}) set a key helper, a credential or an address, which the Claude Code CLI applies over the settings VibeSpace passes — a credential would cross between the organization and {provider}. Ask the administrator to take it out of the managed settings, or use an account of that organization',
  unread: '{provider} cannot start on this machine: what its managed Claude settings set could not be told ({where}) — a managed key helper or credential would go to {provider}. Ask the administrator, or use an account of that organization',
  // the Windows helper absent, unable to start, failing or over its bound: ITS OWN words — nothing an administrator of an organization
  // is needed for; ABSENT or UNABLE TO START (WSL interop off): no retry promised (it will not appear by waiting)
  // …and says what a person can do (主开发 02:49Z) — by platform (03:35Z): on WSL, let it run Windows programs; on Windows, reg.exe itself
  windowsAbsent: '{provider} cannot start on this machine: VibeSpace could not find or start the Windows helper (reg.exe) that reads the Windows policy for Claude Code ({where}), so it cannot tell whether that policy would send a credential to {provider}. Turn on running Windows programs in WSL (interop) and start it again, or start the conversation on another account',
  windowsAbsentNative: '{provider} cannot start on this machine: VibeSpace could not find or start the Windows helper (reg.exe) that reads the Windows policy for Claude Code ({where}), so it cannot tell whether that policy would send a credential to {provider}. Check that Windows’ own reg.exe (in System32) is there and allowed to run, then start it again, or start the conversation on another account',
  windowsUnread: '{provider} cannot start on this machine yet: VibeSpace could not read the Windows policy for Claude Code ({where}), so it cannot tell whether that policy would send a credential to {provider}. Try again in a moment; if it keeps happening, start the conversation on another account',
});

/** a create's refusal frame fields for a fact that is not `false` */
function refusalOf(fact, provider) {
  const words = fact && fact.named === true ? MANAGED_HELPER_WORDS.named : fact && fact.cause === 'windows-absent' ? (fact.onWsl === false ? MANAGED_HELPER_WORDS.windowsAbsentNative : MANAGED_HELPER_WORDS.windowsAbsent) : fact && fact.cause === 'windows-unread' ? MANAGED_HELPER_WORDS.windowsUnread : MANAGED_HELPER_WORDS.unread;
  const params = { provider: String(provider || 'This provider').slice(0, 80), where: String((fact && fact.where) || '').slice(0, 160) };
  return { code: 'provider-managed-helper', message: words.replace(/\{(provider|where)\}/g, (m, k) => params[k]), i18n: { key: words, params } };
}

module.exports = { DIRS, MANAGED_FACT_MS, POLICY_KEYS, CLI_CONNECTION_NAMES, ENV_OTHER_NAMES, ENV_NOT_COUNTED, ENV_SWITCHES, ENV_NAMES, envHit, armsWsl, managedHelperFact, MANAGED_HELPER_WORDS, refusalOf };
