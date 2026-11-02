'use strict';
// THE FIXTURE ENGINE PLUGIN (lane engine-plugin) — a manifest plugin's server (loader IPC v1) answering the engine registry's two
// verbs the way the custom kernel's plugin does (its server.js, their main 2adc2cf): GET /probe judges the binaryPath it is HANDED
// (never its env): stat (its own state folder is readable under node --permission), `--version` through its childProcess grant;
// POST /resolve-launch names that program + its arguments, HTTP 409 {code:'no_binary'} when the kernel is absent.
// A suite bends one answer per leg with `mode.json` in the plugin's data folder (VIBESPACE_PLUGIN_DATA):
//   {probe: {…fields over the answer}, launch: {…fields over the answer}, launchStatus: 500, hang: 'probe' | 'launch',
//    noExec: true (lane engine-distribution: the kernel side's v0.1.1+ — no childProcess, so `version` is null)}
// Lane engine-distribution: like theirs, the probe also answers `declaredVersion` (its package's kernel.json, when it has one)
// and `integrity` (its read of the receipt VibeSpace wrote beside the kernel: `stat.size === bytes` ⇒ verified — never a rehash).
// Lane engine-spi-egress: its id and its features follow ITS OWN manifest — the EGRESS VARIANT (scripts/fixtures/engine-plugin-egress/
// vibespace-plugin.json beside this server.js: the reserved `egressAllowlist` row) answers `features: ['egress-allowlist']` (no
// `surfaces`) and launches its kernel with `--vibespace-kernel-features=egress-allowlist` (the fake kernel's getVersion then says so).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const KINDS = ['js-dialog', 'http-auth', 'client-cert', 'permission', 'file-chooser', 'download', 'print', 'popup', 'select-popup', 'webauthn', 'credential', 'payment-request', 'external-protocol', 'interstitial', 'fullscreen', 'pointer-lock', 'media-picker', 'device-chooser', 'native-picker', 'suppressed'];
const MANIFEST = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'vibespace-plugin.json'), 'utf8')) || {}; } catch { return {}; } })();
const EGRESS = !!(MANIFEST.contributes && Array.isArray(MANIFEST.contributes.settings) && MANIFEST.contributes.settings.some((s) => s && s.key === 'egressAllowlist'));
// lane engine-spi-egress L1b: the USER VARIANT (scripts/fixtures/engine-plugin-user: the reserved `executablePath` row) — the program is
// the OWNER's, at a path this process cannot read under node --permission: its probe ECHOES the handed path and CLAIMS installed +
// executable (never a stat — VibeSpace judges the file itself and overrides this word), version null (it cannot run it either)
const USER = !!(MANIFEST.contributes && Array.isArray(MANIFEST.contributes.settings) && MANIFEST.contributes.settings.some((s) => s && s.key === 'executablePath'));
const mode = () => { try { return JSON.parse(fs.readFileSync(path.join(process.env.VIBESPACE_PLUGIN_DATA || '.', 'mode.json'), 'utf8')) || {}; } catch { return {}; } };
function declared() { try { const k = JSON.parse(fs.readFileSync(path.join(__dirname, 'kernel.json'), 'utf8')); const p = k.platforms && k.platforms['linux-x64']; return String((p && p.version) || k.version || '') || null; } catch { return null; } }
function integrity(binaryPath) {
  try { const r = JSON.parse(fs.readFileSync(path.join(path.dirname(binaryPath), 'install-receipt.json'), 'utf8')); return { verified: fs.statSync(binaryPath).size === r.bytes, sha256: r.sha256 || null, verifiedAt: r.verifiedAt || null }; } catch { return null; }
}
function probe(binaryPath, m = {}) {
  if (USER) return { id: String(MANIFEST.id || ''), installed: true, executable: true, binaryPath, version: null, declaredVersion: null, integrity: null, protocol: 1, kinds: KINDS, features: EGRESS ? ['egress-allowlist'] : ['surfaces', 'webauthn', 'credentials'] };
  let installed = false, executable = false, version = null;
  try { installed = fs.statSync(binaryPath).isFile(); if (installed) { fs.accessSync(binaryPath, fs.constants.X_OK); executable = true; if (!m.noExec) version = String(execFileSync(binaryPath, ['--version'], { timeout: 3000, encoding: 'utf8' })).trim() || null; } } catch { /* a fact: absent / not runnable / no version */ }
  return { id: String(MANIFEST.id || ''), installed, executable, binaryPath, version, declaredVersion: declared(), integrity: installed ? integrity(binaryPath) : null, protocol: 1, kinds: KINDS, features: EGRESS ? ['egress-allowlist'] : ['surfaces', 'webauthn', 'credentials'] };
}
process.send({ t: 'hello', api: 1 });
process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'shutdown') process.exit(0);
  if (msg.t !== 'route') return;
  const m = mode();
  const input = { ...(msg.query || {}), ...(msg.body && typeof msg.body === 'object' ? msg.body : {}) };
  const reply = (status, body) => process.send({ t: 'route-reply', id: msg.id, status, body });
  const bin = String(input.binaryPath || '');
  if (msg.path === '/probe') { if (m.hang === 'probe') return; return reply(200, { ...probe(bin, m), ...(m.probe || {}) }); }
  if (msg.path === '/resolve-launch' && msg.method === 'POST') {
    if (m.hang === 'launch') return;
    if (m.launchStatus) return reply(m.launchStatus, { error: 'fixture', code: 'fixture' });
    if (!probe(bin, m).installed) return reply(409, { error: `no kernel at ${bin}`, code: 'no_binary' });
    return reply(200, { executablePath: bin, binaryPath: bin, args: ['--vibespace-engine=fixture', `--vibespace-profile=${input.profileId || ''}`, ...(EGRESS ? ['--vibespace-kernel-features=egress-allowlist'] : [])], env: {}, persona: {}, ...(m.launch || {}) });
  }
  reply(404, { error: 'route not found' });
});
