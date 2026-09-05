'use strict';
// PURE manifest validator for VibeSpace plugins (Plugin Ph2, 2.369.24;
// docs/design-harness-plugins.md §3.2). One manifest = `vibespace-plugin.json`
// at the plugin's root. Zero requires: the loader (server), the client and the
// tests all validate with THIS function — one contract, no drift.
//
//   {
//     "id": "<publisher>.<name>",        lowercase slug.slug, must equal the folder name, never contains "vibespace"… except the built-in examples
//     "version": "1.2.3",
//     "engines": { "vibespace": "2.369.24" },   minimum host version
//     "description": "…", "icon": "<svg …>" (optional, inline svg ≤ 4 KiB),
//     "client": "none" | "iframe" | "trusted",   UI tier (trusted = same-origin module, gated by plugins.allowTrusted; not served in Ph2)
//     "server": true | false,                     server.js forked as its own process (IPC-only API)
//     "contributes": {
//       "windows":    [{ "id", "title", "entry": "index.html", "icon"? }],   iframe windows (client tier iframe)
//       "agentTools": [{ "name", "description", "args": { JSON-schema-ish } }], generated `vibespace-tool-<id>-<name>` shims → server tool handler
//       "routes": true | false,                  /api/plugins/<id>/x/* proxied to the server process
//       "settings": {…}, "themes": [...], "keybindings": [...]   accepted, reserved for later phases (ignored with a warning)
//     },
//     "capabilities": { "server": { "fs": { "read": [globs], "write": [globs] }, "spawn": [...], "net": [...] } }   declared, shown at install; enforcement is a later phase
//   }
const ID_RE = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const CLIENT_TIERS = ['none', 'iframe', 'trusted'];
const RESERVED_CONTRIBUTIONS = ['settings', 'themes', 'keybindings', 'panels', 'viewers', 'commands', 'menus', 'statusChips', 'backends'];

function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1; }
  return 0;
}

function safeRelPath(p) {
  if (typeof p !== 'string' || !p) return false;
  if (p.startsWith('/') || p.includes('\\') || p.split('/').some((seg) => seg === '..' || seg === '')) return false;
  return true;
}

/**
 * Validate + normalize a manifest. Never throws.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], manifest: object|null }}
 */
function validateManifest(raw, { hostVersion = null, folderName = null } = {}) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['manifest must be a JSON object'], warnings, manifest: null };
  const m = {};
  // identity
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) errors.push('id must be "<publisher>.<name>" (lowercase letters, digits, hyphens)');
  else if (raw.id.length > 64) errors.push('id must be ≤ 64 characters');
  else m.id = raw.id;
  if (folderName && m.id && folderName !== m.id) errors.push(`id "${m.id}" must equal its folder name "${folderName}"`);
  if (typeof raw.version !== 'string' || !SEMVER_RE.test(raw.version)) errors.push('version must be x.y.z'); else m.version = raw.version;
  const eng = raw.engines && typeof raw.engines === 'object' ? raw.engines.vibespace : undefined;
  if (typeof eng !== 'string' || !SEMVER_RE.test(eng)) errors.push('engines.vibespace must name the minimum host version (x.y.z)');
  else { m.engines = { vibespace: eng }; if (hostVersion && compareVersions(hostVersion, eng) < 0) errors.push(`requires VibeSpace ≥ ${eng} (this host is ${hostVersion})`); }
  m.description = typeof raw.description === 'string' ? raw.description.slice(0, 500) : '';
  if (raw.icon !== undefined) {
    if (typeof raw.icon === 'string' && raw.icon.trimStart().startsWith('<svg') && raw.icon.length <= 4096 && !/<script|on[a-z]+=|javascript:|<foreignObject/i.test(raw.icon)) m.icon = raw.icon;
    else warnings.push('icon ignored: must be an inline <svg …> ≤ 4 KiB with no scripts/handlers');
  }
  // tiers
  const client = raw.client === undefined ? 'none' : raw.client;
  if (!CLIENT_TIERS.includes(client)) errors.push(`client must be one of ${CLIENT_TIERS.join('|')}`); else m.client = client;
  if (raw.server !== undefined && typeof raw.server !== 'boolean') errors.push('server must be true|false'); else m.server = !!raw.server;
  // contributions
  const c = raw.contributes && typeof raw.contributes === 'object' ? raw.contributes : {};
  m.contributes = { windows: [], agentTools: [], routes: !!c.routes };
  if (c.windows !== undefined) {
    if (!Array.isArray(c.windows)) errors.push('contributes.windows must be an array');
    else c.windows.forEach((w, i) => {
      if (!w || typeof w !== 'object') return errors.push(`contributes.windows[${i}] must be an object`);
      if (typeof w.id !== 'string' || !SLUG_RE.test(w.id)) errors.push(`contributes.windows[${i}].id must be a slug`);
      if (typeof w.title !== 'string' || !w.title.trim()) errors.push(`contributes.windows[${i}].title required`);
      if (!safeRelPath(w.entry) || !/\.html?$/i.test(w.entry)) errors.push(`contributes.windows[${i}].entry must be a relative .html path inside ui/`);
      if (m.client === 'none') errors.push(`contributes.windows[${i}] needs client: "iframe" (or "trusted")`);
      if (!errors.length || true) m.contributes.windows.push({ id: String(w.id), title: String(w.title || '').slice(0, 80), entry: String(w.entry || ''), singleton: w.singleton !== false });
    });
  }
  if (c.agentTools !== undefined) {
    if (!Array.isArray(c.agentTools)) errors.push('contributes.agentTools must be an array');
    else c.agentTools.forEach((t, i) => {
      if (!t || typeof t !== 'object') return errors.push(`contributes.agentTools[${i}] must be an object`);
      if (typeof t.name !== 'string' || !SLUG_RE.test(t.name)) errors.push(`contributes.agentTools[${i}].name must be a slug`);
      if (typeof t.description !== 'string' || !t.description.trim()) errors.push(`contributes.agentTools[${i}].description required (agents read it)`);
      if (t.args !== undefined && (typeof t.args !== 'object' || Array.isArray(t.args))) errors.push(`contributes.agentTools[${i}].args must be a JSON-schema object`);
      if (!m.server) errors.push(`contributes.agentTools[${i}] needs server: true (the tool runs in the plugin's process)`);
      m.contributes.agentTools.push({ name: String(t.name), description: String(t.description || '').slice(0, 400), args: t.args && typeof t.args === 'object' ? t.args : { type: 'object', properties: {} } });
    });
  }
  if (m.contributes.routes && !m.server) errors.push('contributes.routes needs server: true');
  for (const k of Object.keys(c)) if (RESERVED_CONTRIBUTIONS.includes(k)) warnings.push(`contributes.${k} is reserved for a later phase — ignored`);
  // capabilities (declared only in Ph2)
  m.capabilities = raw.capabilities && typeof raw.capabilities === 'object' ? raw.capabilities : {};
  if (m.client === 'trusted') warnings.push('client "trusted" is not served in this phase (plugins.allowTrusted) — the plugin loads as iframe-less');
  return { ok: errors.length === 0, errors, warnings, manifest: errors.length ? null : m };
}

module.exports = { validateManifest, compareVersions, safeRelPath, ID_RE, CLIENT_TIERS };
