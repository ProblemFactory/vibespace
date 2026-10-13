#!/usr/bin/env node
// test-tls-plan — src/tls-plan.js (PURE), lane https-tailscale (2026-10-12): which certificate the hub serves on its one
// port (files / tailscale / off), when it fetches a new one, and the owner's words for each `off`. The table: the
// trailing-dot strip, the CLI's exact "not enabled" and "cert access denied" answers, the renew window at 13 / 15 days,
// files over Tailscale, the setting's off, every word in zh + ja. CONTROL: a copy without the trailing-dot strip is RED.
// lane tls-pass-retry (2026-10-13): status-unreadable, the pass cadence (boot miss → 60 s → 300 s → 3600 s; a miss after a
// served pass → 3600 s) and the raw probe line; CONTROL: a cadence that ignores "served since boot" is RED.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TP = require(path.join(REPO, 'src/tls-plan.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const DAY = 24 * 3600 * 1000, NOW = Date.parse('2026-10-12T10:00:00Z');
const DNS = 'box-a.tail1a2b3c.ts.net';
const status = (o = {}) => ({ BackendState: 'Running', Self: { DNSName: DNS + '.' }, MagicDNSSuffix: 'tail1a2b3c.ts.net', CertDomains: [DNS], ...o });
const live = (days) => ({ cert: true, key: true, notAfter: NOW + days * DAY });
const plan = (o = {}) => TP.tlsPlan({ now: NOW, port: 3456, user: 'ada', ...o });
const NOT_ENABLED = 'HTTPS cert support is not enabled/configured for your tailnet.';
const DENIED = "Access denied: cert access denied.\nUse 'sudo tailscale cert box-a.tail1a2b3c.ts.net'.";

console.log('§1 tailscale');
{
  const p = plan({ tailscale: { status: status() } });
  ok(p.mode === 'tailscale' && p.domain === DNS && p.url === `https://${DNS}:3456`, `the trailing dot is stripped: ${p.url}`);
  ok(p.renew === true && p.serving === false && p.why === 'fetching' && p.certPath === `data/tls/${DNS}.crt` && p.keyPath === `data/tls/${DNS}.key`, 'no certificate yet ⇒ renew (fetch), not serving, data/tls/<domain>.crt|.key');
  const l = plan({ tailscale: { status: status() }, files: live(60) });
  ok(l.serving && !l.renew && l.why === 'tailscale' && l.words === `Secure address: https://${DNS}:3456 — microphone, a Mac's sign-in and other secure-only features need it`, 'a live certificate ⇒ serving, the Secure-address words');
  ok(l.line.startsWith(`https on :3456 — https://${DNS}:3456 (tailscale certificate, until 2026-12-11`), `the boot-log line: ${l.line}`);
  ok(plan({ tailscale: { status: status() }, files: live(13) }).renew === true, 'renew window: 13 days left ⇒ renew');
  ok(plan({ tailscale: { status: status() }, files: live(15) }).renew === false, 'renew window: 15 days left ⇒ no renew');
  const ex = plan({ tailscale: { status: status() }, files: live(-1) });
  ok(!ex.serving && ex.renew && ex.why === 'fetching', 'an expired certificate is never served — fetched again');
  ok(plan({ tailscale: { status: status({ Self: { DNSName: 'BOX-A.tail1a2b3c.ts.net.' } }) } }).domain === DNS, 'the domain is lower-cased (CertDomains match)');
}
console.log('§2 the owner\'s steps');
{
  const n = plan({ tailscale: { status: status({ CertDomains: null }) } });
  ok(n.mode === 'off' && n.why === 'https-not-enabled' && n.notice === true && !n.renew, 'CertDomains: null ⇒ off, https-not-enabled, a notice, nothing fetched');
  ok(n.words === 'Tailscale HTTPS certificates are off for your tailnet: turn on HTTPS Certificates in the Tailscale admin console → DNS, and VibeSpace fetches its certificate within the hour.', 'the admin-step words');
  const a = plan({ tailscale: { status: status(), certAnswer: NOT_ENABLED } });
  ok(a.why === 'https-not-enabled', 'the CLI\'s exact "' + NOT_ENABLED + '" ⇒ https-not-enabled');
  const d = plan({ tailscale: { status: status(), certAnswer: DENIED } });
  ok(d.renew === true && a.renew === true, 'a refused cert run is retried every pass (renew) — the owner\'s fix needs no restart');
  ok(d.why === 'operator-needed' && d.notice && d.words.includes('sudo tailscale set --operator=ada') && d.i18n.params.user === 'ada', 'the CLI\'s "cert access denied" ⇒ operator-needed, the sudo tailscale set --operator=<user> words');
  ok(plan({ tailscale: { status: status(), certAnswer: DENIED }, files: live(30) }).serving, 'a renewal refused while the certificate is still live keeps serving it');
  ok(plan({ tailscale: { status: status({ CertDomains: null }) }, files: live(30) }).serving, 'HTTPS turned off on the tailnet: the live certificate is served until it ends');
  ok(plan({ tailscale: { status: status({ CertDomains: null }) }, files: live(30) }).renew === false, '… and never renewed');
}
console.log('§3 off');
{
  ok(plan({ tailscale: { error: 'ENOENT' } }).why === 'no-tailscale', 'no tailscale binary ⇒ no-tailscale');
  ok(plan({ tailscale: { error: "failed to connect to local tailscaled; it doesn't appear to be running (sudo systemctl start tailscaled ?)" } }).why === 'no-tailscale', 'tailscaled not running ⇒ no-tailscale');
  const s = plan({ tailscale: { error: 'Failed to connect to local Tailscale daemon for /localapi/v0/status; dial unix /var/run/tailscale/tailscaled.sock: connect: permission denied\nmore' } });
  ok(s.why === 'socket-refused' && s.words === 'Tailscale refused VibeSpace: Failed to connect to local Tailscale daemon for /localapi/v0/status; dial unix /var/run/tailscale/tailscaled.sock: connect: permission denied', 'a refused socket ⇒ socket-refused with the CLI\'s exact first line');
  ok(plan({ tailscale: { status: status({ BackendState: 'NeedsLogin' }) } }).why === 'no-tailscale', 'logged out (NeedsLogin) ⇒ no-tailscale');
  ok(plan({ tailscale: { status: { Self: { DNSName: '' } } } }).why === 'no-tailscale', 'no DNSName ⇒ no-tailscale');
  const off = plan({ setting: 'off', env: { VIBESPACE_TLS_CERT: '/c', VIBESPACE_TLS_KEY: '/k' }, files: { envReadable: true }, tailscale: { status: status() } });
  ok(off.mode === 'off' && off.why === 'disabled' && !off.notice, 'server.https = off wins over files and Tailscale');
  ok(plan({ setting: 'nonsense', tailscale: { status: status() } }).mode === 'tailscale', 'an unknown setting value reads as auto');
}
console.log('§4 files');
{
  const f = plan({ env: { VIBESPACE_TLS_CERT: '/c.pem', VIBESPACE_TLS_KEY: '/k.pem' }, files: { envReadable: true, envNames: ['192.168.1.20'], envNotAfter: NOW + 9 * DAY }, tailscale: { status: status() } });
  ok(f.mode === 'files' && f.serving && f.url === 'https://192.168.1.20:3456' && f.certPath === '/c.pem' && !f.renew, 'VIBESPACE_TLS_CERT + _KEY readable ⇒ files, over Tailscale, never renewed by us');
  ok(plan({ env: { VIBESPACE_TLS_CERT: '/c.pem', VIBESPACE_TLS_KEY: '/k.pem' }, files: { envReadable: false } }).why === 'files-missing', 'unreadable files ⇒ off files-missing (never a silent fall to Tailscale)');
  ok(plan({ env: { VIBESPACE_TLS_CERT: '/c.pem' }, files: { envReadable: true } }).why === 'files-missing', 'a cert without a key ⇒ files-missing');
  ok(plan({ setting: 'files', tailscale: { status: status() } }).why === 'files-missing', 'server.https = files without the env ⇒ files-missing');
}
console.log('§5 the words in zh + ja');
{
  for (const lang of ['zh', 'ja']) {
    const text = fs.readFileSync(path.join(REPO, `src/lib/i18n-${lang}.js`), 'utf8');
    const miss = Object.values(TP.WORDS).filter((w) => !text.includes(JSON.stringify(w) + ':'));
    ok(miss.length === 0, `every plan word has a ${lang} line${miss.length ? ' — missing: ' + miss.join(' | ') : ''}`);
  }
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
  ok(zh.includes('"Tailscale 的 HTTPS 证书功能没开：在 Tailscale 管理台 → DNS → HTTPS Certificates 打开后，VibeSpace 会在一小时内自动取证书"'), 'the owner\'s zh admin-step sentence, verbatim');
  ok(zh.includes('sudo tailscale set --operator={user}（{user} = 运行 VibeSpace 的用户）'), 'the owner\'s zh operator sentence');
}
console.log('§7 lane tls-pass-retry — status-unreadable, the cadence, the probe line');
{
  const u = plan({ tailscale: { unreadable: true } });
  ok(u.mode === 'off' && u.why === 'status-unreadable' && !/not running/i.test(u.words) && u.notice === false, `an unreadable status answer is its own reason, never "not running": ${u.why}`);
  ok(plan({ tailscale: { error: 'Failed to connect to local Tailscale daemon; it doesn\'t appear to be running' } }).why === 'no-tailscale', 'the CLI\'s own "not running" words still say no-tailscale');
  const off = (why) => ({ mode: 'off', why }), on = { mode: 'tailscale', why: 'tailscale', serving: true };
  const rows = [
    ['boot miss #1', { plan: off('status-unreadable'), misses: 1 }, 60000],
    ['boot miss #2', { plan: off('no-tailscale'), misses: 2 }, 300000],
    ['boot miss #3', { plan: off('no-tailscale'), misses: 3 }, 3600000],
    ['boot miss #9', { plan: off('https-not-enabled'), misses: 9 }, 3600000],
    ['a served pass, then a miss', { plan: off('status-unreadable'), misses: 1, liveOnce: true }, 3600000],
    ['serving', { plan: on, misses: 0, liveOnce: true }, 3600000],
    ['fetching (not a miss)', { plan: { mode: 'tailscale', why: 'fetching' }, misses: 0 }, 3600000],
    ['the setting\'s off', { plan: off('disabled'), misses: 1 }, 3600000],
    ['files missing', { plan: off('files-missing'), misses: 1 }, 3600000],
  ];
  for (const [name, args, want] of rows) { const got = TP.nextPassMs(args); ok(got === want, `cadence · ${name} → ${got / 1000} s (want ${want / 1000} s)`); }
  const t = TP.probeLine('status', { code: 'TIMEOUT', out: '{"Backend', err: 'Command failed: tailscale status --json\nmore', ms: 10004 }, 10000);
  ok(t.line === 'tailscale status: timed out after 10000 ms (10004 ms, 9 bytes out) — Command failed: tailscale status --json' && t.bytes === 9 && t.code === 'TIMEOUT', `the probe line: ${t.line}`);
  ok(TP.probeLine('status', { code: 0, out: '', err: '', ms: 801 }).line === 'tailscale status: exit 0 but no readable JSON (801 ms, 0 bytes out)', 'an empty "ok" answer says so');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  for (const k of [TP.WORDS.statusUnreadable, 'Check again', 'Last check: {what}', 'tailscale {cmd} timed out after {s} s', 'tailscale {cmd} answered {bytes} bytes that are not a status', 'tailscale {cmd} failed ({code}): {err}'])
    ok(zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'), `zh + ja: ${k.slice(0, 50)}`);
}
console.log('§7b CONTROL — a cadence that forgets "served since boot"');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tlsplan-'));
  try {
    const src = fs.readFileSync(path.join(REPO, 'src/tls-plan.js'), 'utf8');
    const from = 'if (!isMiss(plan) || liveOnce) return PASS_MS;';
    ok(src.includes(from), 'the control\'s anchor is in the module');
    fs.writeFileSync(path.join(dir, 'tls-plan.js'), src.replace(from, 'if (!isMiss(plan)) return PASS_MS;'));
    const M = require(path.join(dir, 'tls-plan.js'));
    const got = M.nextPassMs({ plan: { mode: 'off', why: 'no-tailscale' }, misses: 1, liveOnce: true });
    ok(got !== 3600000, `CONTROL: a served-then-miss pass retries at ${got / 1000} s instead of the hourly cadence — RED`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log('§6 CONTROL');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tlsplan-'));
  try {
    const src = fs.readFileSync(path.join(REPO, 'src/tls-plan.js'), 'utf8');
    const from = ".trim() : '';\n  return n.replace(/\\.+$/, '').toLowerCase();";
    ok(src.includes(from), 'the control\'s anchor is in the module');
    fs.writeFileSync(path.join(dir, 'tls-plan.js'), src.replace(from, ".trim() : '';\n  return n.toLowerCase();"));
    const M = require(path.join(dir, 'tls-plan.js'));
    const p = M.tlsPlan({ now: NOW, tailscale: { status: status() } });
    ok(p.url !== `https://${DNS}:3456` && p.why === 'https-not-enabled', `CONTROL without the trailing-dot strip: RED (${p.why}, ${p.url})`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
