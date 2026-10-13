'use strict';
// PURE — lane https-tailscale (2026-10-12, owner "tailscale cert可以做"). The hub answers at
// https://<machine>.<tailnet>.ts.net:<PORT> on the SAME port as http, with a certificate it fetches itself through
// `tailscale cert` — so every secure-context feature (microphone, a Mac's ARD sign-in, WebCrypto, WebAuthn) works from
// any device, not only from localhost. src/server/tls.js is the I/O half (the child processes, the files, the demux).
//
// tlsPlan(facts) → { mode: 'files'|'tailscale'|'off', serving, domain, url, certPath, keyPath, renew, why, words,
// i18n, line, notice }. No fs, no child process, no clock of its own: the facts come in, the verdict goes out.
//   · files      — VIBESPACE_TLS_CERT + VIBESPACE_TLS_KEY name readable files (they win over Tailscale);
//   · tailscale  — `tailscale status --json` gives Self.DNSName (the trailing dot stripped) AND CertDomains lists it;
//                  renew = no live cert yet, or it ends within RENEW_MS;
//   · off        — why: disabled (setting server.https = off) | files-missing | no-tailscale | socket-refused (the
//                  CLI's own error) | https-not-enabled (the tailnet's HTTPS certificates are off — the admin step) |
//                  operator-needed (the local API answers "cert access denied" — `tailscale set --operator`).
// `notice` = the owner must act (https-not-enabled, operator-needed): tls.js files ONE For-you item per state.

const RENEW_MS = 14 * 24 * 3600 * 1000;
const SETTINGS = ['auto', 'off', 'files'];
// the CLI's answers, matched on their stable words (measured on 1.102.3, 2026-10-12)
const NOT_ENABLED_RE = /HTTPS cert support is not enabled/i; // "HTTPS cert support is not enabled/configured for your tailnet."
const ACCESS_DENIED_RE = /cert access denied/i; // "Access denied: cert access denied." + "Use 'sudo tailscale cert …'."
const SOCKET_RE = /permission denied|access denied/i; // "dial unix /var/run/tailscale/tailscaled.sock: connect: permission denied" — anything else (no binary, "it doesn't appear to be running") = no-tailscale
const NOTICE_WHYS = ['https-not-enabled', 'operator-needed'];

// the words (English = the t() key; the client says them with t(key, params), zh/ja in src/lib/i18n-*.js)
const W = {
  secure: 'Secure address: {url} — microphone, a Mac\'s sign-in and other secure-only features need it',
  fetching: 'Fetching the certificate for {url} from Tailscale…',
  disabled: 'HTTPS is off (server.https = off) — VibeSpace answers on http only.',
  filesMissing: 'VIBESPACE_TLS_CERT and VIBESPACE_TLS_KEY must name readable certificate and key files — VibeSpace answers on http only.',
  noTailscale: 'No secure address: Tailscale is not running on this machine (or set VIBESPACE_TLS_CERT and VIBESPACE_TLS_KEY to a certificate of your own).',
  socketRefused: 'Tailscale refused VibeSpace: {error}',
  notEnabled: 'Tailscale HTTPS certificates are off for your tailnet: turn on HTTPS Certificates in the Tailscale admin console → DNS, and VibeSpace fetches its certificate within the hour.',
  operator: 'VibeSpace may not fetch certificates from Tailscale yet: run sudo tailscale set --operator={user} once on this machine ({user} = the user running VibeSpace); it retries every hour.',
};

const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const firstLine = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';

/** Self.DNSName without its trailing dot ('' when the status names none). */
function domainOf(status) {
  const n = status && status.Self && typeof status.Self.DNSName === 'string' ? status.Self.DNSName.trim() : '';
  return n.replace(/\.+$/, '').toLowerCase();
}

function tlsPlan({ setting = 'auto', env = {}, tailscale = {}, files = {}, now = 0, port = 3456, user = 'vibespace', dir = 'data/tls' } = {}) {
  const set = SETTINGS.includes(setting) ? setting : 'auto';
  const say = (mode, why, key, params = {}, more = {}) => {
    const words = fill(W[key], params);
    const serving = !!more.serving;
    const line = serving ? `https on :${port} — ${more.url} (${mode} certificate${more.notAfter ? ', until ' + new Date(more.notAfter).toISOString().slice(0, 10) : ''})` : `https ${mode === 'off' ? 'off' : 'pending'} — ${why}: ${words}`;
    return { mode, setting: set, serving, domain: more.domain || null, url: more.url || null, certPath: more.certPath || null, keyPath: more.keyPath || null,
      renew: !!more.renew, notAfter: more.notAfter || null, why, words, i18n: { key: W[key], params }, line, notice: NOTICE_WHYS.includes(why) };
  };
  if (set === 'off') return say('off', 'disabled', 'disabled');
  const envCert = String(env.VIBESPACE_TLS_CERT || '').trim(), envKey = String(env.VIBESPACE_TLS_KEY || '').trim();
  if (envCert || envKey || set === 'files') {
    if (!envCert || !envKey || !files.envReadable) return say('off', 'files-missing', 'filesMissing');
    const host = (Array.isArray(files.envNames) && files.envNames[0]) || 'localhost';
    const url = `https://${host}:${port}`;
    return say('files', 'files', 'secure', { url }, { serving: true, url, domain: host, certPath: envCert, keyPath: envKey, notAfter: files.envNotAfter || null });
  }
  const err = String(tailscale.error || '');
  if (err) return SOCKET_RE.test(err) ? say('off', 'socket-refused', 'socketRefused', { error: firstLine(err).slice(0, 200) }) : say('off', 'no-tailscale', 'noTailscale');
  const st = tailscale.status || null;
  const domain = domainOf(st);
  if (!domain || (st.BackendState && st.BackendState !== 'Running')) return say('off', 'no-tailscale', 'noTailscale');
  const listed = Array.isArray(st.CertDomains) && st.CertDomains.map((d) => String(d).replace(/\.+$/, '').toLowerCase()).includes(domain);
  const live = !!(files.cert && files.key && files.notAfter && files.notAfter > now);
  const url = `https://${domain}:${port}`;
  const certPath = `${dir}/${domain}.crt`, keyPath = `${dir}/${domain}.key`;
  const at = { domain, url, certPath, keyPath, notAfter: live ? files.notAfter : null };
  if (live) return say('tailscale', 'tailscale', 'secure', { url }, { ...at, serving: true, renew: listed && files.notAfter - now < RENEW_MS });
  const answer = String(tailscale.certAnswer || '');
  // a listed domain is retried every pass (renew) even after a refusal — the owner's fix is picked up without a restart
  if (!listed || NOT_ENABLED_RE.test(answer)) return say('off', 'https-not-enabled', 'notEnabled', {}, { domain, renew: listed });
  if (ACCESS_DENIED_RE.test(answer)) return say('off', 'operator-needed', 'operator', { user }, { domain, renew: true });
  return say('tailscale', 'fetching', 'fetching', { url }, { ...at, renew: true });
}

module.exports = { tlsPlan, domainOf, RENEW_MS, SETTINGS, NOT_ENABLED_RE, ACCESS_DENIED_RE, NOTICE_WHYS, WORDS: W };
