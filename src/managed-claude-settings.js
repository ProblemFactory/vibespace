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
 * not parsed here); the Windows HKLM / HKCU policy keys, which a WSL CLI reads through reg.exe (a WSL machine ⇒ CANNOT TELL); a
 * `policyHelper` a managed document names (it computes settings at startup: CANNOT TELL).
 *
 * EVERY READ IS BOUNDED (as ws-create's own settings reader): opened non-blocking (a FIFO never holds a start), a regular file under
 * 1 MiB, one read in flight per file across starts, the whole answer within MANAGED_FACT_MS; a folder on a NETWORK or FUSE filesystem
 * is never read (statfs) — a local mount (a bind, a container's config map) is a plain local read.
 * → { named: true | false | null, where, cause }  (null = cannot tell; a refusal either way)
 */
const fs = require('fs');
const path = require('path');

const DIRS = Object.freeze({ linux: '/etc/claude-code', darwin: '/Library/Application Support/ClaudeCode', win32: 'C:\\Program Files\\ClaudeCode' });
const MAC_PREFS = '/Library/Managed Preferences';
const MAC_PREF_FILE = /^com\.anthropic\.claudecode\.plist$/i;
const MANAGED_FACT_MS = 8000;
const MAX_BYTES = 1 << 20;
// a managed env name that carries an Anthropic credential or routes the CLI's requests elsewhere
const ENV_CREDENTIAL_OR_ROUTE = /^(?:ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_CODE_OAUTH|AWS_|GOOGLE_APPLICATION_CREDENTIALS$|CLOUD_ML_|VERTEX_)/;
// filesystems never read: network and FUSE (statfs f_type)
const NETWORK_FS = new Set([0x6969 /* nfs */, 0x517b /* smb */, 0xff534d42 /* cifs */, 0xfe534d42 /* smb2 */, 0x65735546 /* fuse */, 0x01021997 /* 9p */, 0x00c36400 /* ceph */, 0x5346414f /* afs */, 0x47504653 /* gpfs */, 0x19830326 /* fhgfs */, 0x0bd00bd0 /* lustre */]);

const inFlight = new Map();   // one read in flight per file across starts (a hung open holds one threadpool thread, never one per start)
function readOnce(file, fsp) {
  const had = inFlight.get(file);
  if (had) return had;
  const p = (async () => {
    let fh = null;
    try {
      fh = await fsp.open(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
      const st = await fh.stat();
      if (!st.isFile() || st.size > MAX_BYTES) return { unreadable: true };
      return { text: await fh.readFile('utf8') };
    } catch (e) { return e && e.code === 'ENOENT' ? { missing: true } : { unreadable: true }; } finally { try { await fh?.close(); } catch { } }
  })().finally(() => inFlight.delete(file));
  inFlight.set(file, p);
  return p;
}

/** one managed document → { named, cause } | null (names nothing) */
function judge(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { named: null, cause: 'unreadable' };
  if (typeof doc.apiKeyHelper === 'string' && doc.apiKeyHelper.trim()) return { named: true, cause: 'apiKeyHelper' };
  const env = doc.env && typeof doc.env === 'object' ? doc.env : null;
  if (env && Object.entries(env).some(([k, v]) => ENV_CREDENTIAL_OR_ROUTE.test(String(k)) && v != null && String(v) !== '')) return { named: true, cause: 'env' };
  if (doc.policyHelper || doc.policyHelpers) return { named: null, cause: 'policyHelper' };
  return null;
}

async function factOf({ platform, dir, macPrefs, fsp, wsl }) {
  const isWsl = typeof wsl === 'boolean' ? wsl : (platform === 'linux' && !dir ? await wslOf(fsp) : false);
  if (isWsl) return { named: null, where: 'the Windows policy (WSL)', cause: 'wsl' };
  const root = dir || DIRS[platform] || DIRS.linux;
  let st = null;
  try { st = await fsp.stat(root); } catch (e) { if (!e || e.code !== 'ENOENT') return { named: null, where: root, cause: 'unreadable' }; }
  if (st) {
    if (!st.isDirectory()) return { named: null, where: root, cause: 'unreadable' };
    if (typeof fsp.statfs === 'function') { try { const sf = await fsp.statfs(root); if (NETWORK_FS.has(Number(sf.type) >>> 0)) return { named: null, where: root, cause: 'network-mount' }; } catch { return { named: null, where: root, cause: 'unreadable' }; } }
    const files = [path.join(root, 'managed-settings.json')];
    const dropIns = path.join(root, 'managed-settings.d');
    try { for (const n of (await fsp.readdir(dropIns)).sort()) if (/\.json$/i.test(n)) files.push(path.join(dropIns, n)); } catch (e) { if (!e || e.code !== 'ENOENT') return { named: null, where: dropIns, cause: 'unreadable' }; }
    for (const f of files) {
      const r = await readOnce(f, fsp);
      if (r.missing) continue;
      if (r.unreadable) return { named: null, where: f, cause: 'unreadable' };
      let doc;
      try { doc = JSON.parse(r.text); } catch { return { named: null, where: f, cause: 'unreadable' }; }
      const j = judge(doc);
      if (j) return { ...j, where: f };
    }
  }
  if (platform === 'darwin' && macPrefs) {
    const look = async (d, depth) => {
      let names = [];
      try { names = await fsp.readdir(d); } catch { return null; }
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
function managedHelperFact({ platform = process.platform, dir = null, macPrefs = MAC_PREFS, fsp = fs.promises, wsl = null, boundMs = MANAGED_FACT_MS } = {}) {
  let timer = null;
  const late = new Promise((r) => { timer = setTimeout(() => r({ named: null, where: dir || DIRS[platform] || DIRS.linux, cause: 'timeout' }), boundMs); timer.unref?.(); });
  return Promise.race([factOf({ platform, dir, macPrefs, fsp, wsl }).catch(() => ({ named: null, where: dir || DIRS[platform] || DIRS.linux, cause: 'unreadable' })), late]).finally(() => clearTimeout(timer));
}

/** the words a person reads (English t() keys; {provider} = the provider's name, {where} = the file or source) */
const MANAGED_HELPER_WORDS = Object.freeze({
  named: '{provider} cannot start on this machine: its managed Claude settings ({where}) set a key helper or an Anthropic credential or address, and the Claude Code CLI applies them over the settings VibeSpace passes — the organization’s credential would go to {provider}. Ask the administrator to take it out of the managed settings, or use an account of that organization',
  unread: '{provider} cannot start on this machine: what its managed Claude settings set could not be told ({where}) — a managed key helper or credential would go to {provider}. Ask the administrator, or use an account of that organization',
});

/** a create's refusal frame fields for a fact that is not `false` */
function refusalOf(fact, provider) {
  const words = fact && fact.named === true ? MANAGED_HELPER_WORDS.named : MANAGED_HELPER_WORDS.unread;
  const params = { provider: String(provider || 'This provider').slice(0, 80), where: String((fact && fact.where) || '').slice(0, 160) };
  return { code: 'provider-managed-helper', message: words.replace(/\{(provider|where)\}/g, (m, k) => params[k]), i18n: { key: words, params } };
}

module.exports = { DIRS, MANAGED_FACT_MS, ENV_CREDENTIAL_OR_ROUTE, managedHelperFact, MANAGED_HELPER_WORDS, refusalOf };
