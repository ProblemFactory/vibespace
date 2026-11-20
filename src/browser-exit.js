'use strict';
/**
 * THE EXIT CHECK — PURE (lane cli-update-needs-nothing; the owner 2026-11-17 «A就行»). A person checks a browser profile's proxy EXIT
 * — its public address, country and time zone — ONLY by pressing a button; the check goes THROUGH that profile's proxy (the keeper's
 * forwarder, src/server/egress-proxy.js) to ONE check address the owner sets (`browser.exitCheckUrl` — empty by default; the tree
 * names no third-party address); nothing is kept until the person confirms; never on a timer, never at a launch. The kept answer is
 * handed to an engine plugin at its launch (resolve-launch's optional `egress` object — the names settled with the plugin's
 * conversation: publicIp, country, timezone, checkedAt, source).
 *   · checkUrlVerdict — the address: https only, no login in it, no address literal of a private / loopback / link-local range
 *   · readExitAnswer  — the owner's address answers in ITS shape: a JSON object read TOLERANTLY by a short stated list of key names
 *     (top level, or ONE nested object `location` / `geo`); anything else is said for what it is, never guessed
 *   · zoneVerdict     — a real IANA zone name, judged by the runtime's own date formatter; an offset or an abbreviation refused
 *   · egressRecordOf  — what is kept on the profile, under the hand-over's own names (no mapping to get wrong)
 */
const EXIT_URL_KEY = 'browser.exitCheckUrl';
const DEADLINE_MS = 8000;
const BODY_CAP = 64 * 1024;
// the request: one GET, a fixed short header list, a generic client name — nothing names the instance, the person, the profile or a version
const REQUEST_HEADERS = Object.freeze({ Accept: 'application/json', 'User-Agent': 'exit-check', Connection: 'close' });
// THE SHORT STATED LIST — the key names common services use for each fact (no vendor's name, no per-vendor code)
const KEYS = Object.freeze({
  publicIp: Object.freeze(['ip', 'query', 'address', 'origin']),
  country: Object.freeze(['country_code', 'countryCode', 'country', 'country_name']),
  timezone: Object.freeze(['timezone', 'time_zone', 'timeZone', 'tz']),
});
const NESTED = Object.freeze(['location', 'geo']);
const str = (v) => (v == null ? '' : String(v));

function privateHost(h) {
  const x = str(h).toLowerCase().replace(/^\[|\]$/g, '');
  if (x === 'localhost' || x.endsWith('.localhost')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(x);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (x.includes(':')) return x === '::1' || x === '::' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^::ffff:/.test(x);
  return false;
}
/** The check address → { ok: true, value } (the URL as stored) | { ok: false, code, error }; empty → { ok: true, value: '' }. */
function checkUrlVerdict(v) {
  const s = str(v).trim();
  if (!s) return { ok: true, value: '' };
  let u;
  try { u = new URL(s); } catch { return { ok: false, code: 'exit_url_invalid', error: 'the exit check address must be an https address, like https://check.example.org/json' }; }
  if (u.protocol !== 'https:') return { ok: false, code: 'exit_url_invalid', error: 'the exit check address must be an https address' };
  if (u.username || u.password) return { ok: false, code: 'exit_url_invalid', error: 'the exit check address carries no user name or password' };
  if (privateHost(u.hostname)) return { ok: false, code: 'exit_url_invalid', error: 'the exit check address must be a public one — not this machine or a private network' };
  return { ok: true, value: u.href };
}
const scalar = (v) => {
  if (typeof v === 'string' || typeof v === 'number') return str(v).trim();
  // a time zone answered as an object ({ id } / { name }) — the one nested form the list reads
  if (v && typeof v === 'object' && !Array.isArray(v)) { const z = v.id != null ? v.id : v.name; return typeof z === 'string' ? z.trim() : ''; }
  return '';
};
function pick(obj, fact) {
  for (const k of KEYS[fact]) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) { const x = scalar(obj[k]); if (x) return x; }
  for (const n of NESTED) { const o = obj && obj[n]; if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of KEYS[fact]) if (Object.prototype.hasOwnProperty.call(o, k)) { const x = scalar(o[k]); if (x) return x; } }
  return '';
}
/** The answer → { ok: true, read: { publicIp, country, timezone } } (at least one fact read) | { ok: false, kind, said }. */
function readExitAnswer({ status = 0, contentType = '', body = '' } = {}) {
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : str(body);
  const ct = str(contentType).toLowerCase();
  if (status >= 300 && status < 400) return { ok: false, kind: 'redirect', said: `the address answered a redirect (${status}) — a redirect is never followed` };
  if (status && (status < 200 || status >= 300)) return { ok: false, kind: 'status', said: `the address answered ${status}` };
  if (!text.trim()) return { ok: false, kind: 'empty', said: 'the address answered nothing' };
  let j;
  try { j = JSON.parse(text); } catch { j = undefined; }
  if (j === undefined) {
    const html = /html/.test(ct) || /^\s*</.test(text);
    return { ok: false, kind: html ? 'html' : 'text', said: html ? 'the address answered a web page, not JSON' : `the address answered plain text, not JSON${ct ? ` (${ct.slice(0, 60)})` : ''}` };
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, kind: 'json', said: 'the address answered JSON that is not an object' };
  const ip0 = pick(j, 'publicIp').split(',')[0].trim(), z0 = zoneVerdict(pick(j, 'timezone'));
  const read = { publicIp: ipLiteral(ip0) ? ip0 : '', country: pick(j, 'country'), timezone: z0.ok ? z0.value : '' };   // an address literal or empty; the zone canonical (or empty)
  if (!read.publicIp && !read.country && !read.timezone) return { ok: false, kind: 'json', said: 'the address answered JSON without an address, a country or a time zone in it' };
  return { ok: true, read };
}
/** An IP address literal (v4 dotted, or v6) — PURE (no runtime module): the public address is one, or empty. */
function ipLiteral(v) {
  const s = str(v).trim();
  if (/^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s)) return true;
  if (!s.includes(':') || /[^0-9a-fA-F:.]/.test(s)) return false;
  try { return new URL(`http://[${s}]/`).hostname.length > 2; } catch { return false; }
}
/** A real IANA zone name (the runtime's own formatter decides; an offset or an abbreviation refused, with one example). */
function zoneVerdict(v) {
  const z = str(v).trim();
  const say = (why) => ({ ok: false, code: 'exit_timezone_invalid', error: `${why} — give a zone name like Asia/Shanghai` });
  if (!z) return { ok: true, value: '' };
  if (/^[+\-−]\d|^(?:utc|gmt)\s*[+\-−]\s*\d/i.test(z) || /^etc\/gmt[+\-]\d/i.test(z)) return say(`«${z.slice(0, 40)}» is an offset, not a time zone`);
  if (z.toUpperCase() !== 'UTC' && !z.includes('/')) return say(`«${z.slice(0, 40)}» is an abbreviation, not a time zone`);   // UTC in any case (B-9584 U1 r617: the runtime spells it UTC)
  let canon = '';
  try { canon = new Intl.DateTimeFormat('en-US', { timeZone: z }).resolvedOptions().timeZone; } catch { return say(`«${z.slice(0, 40)}» is not a time zone`); }
  return { ok: true, value: canon || z };   // kept in its CANONICAL spelling (asia/tokyo ⇒ Asia/Tokyo)
}
/** What is kept on the profile (and handed to an engine plugin at its launch), under the hand-over's own names. */
function egressRecordOf({ publicIp = '', country = '', timezone = '', source = 'typed' } = {}, { now = 0 } = {}) {
  const tz = zoneVerdict(timezone);
  if (!tz.ok) return tz;
  const ip = str(publicIp).trim(), c = str(country).trim();
  if (ip && !ipLiteral(ip)) return { ok: false, code: 'exit_ip_invalid', error: 'the public address is one IP address, like 203.0.113.7 or 2001:db8::1' };
  if (c.length > 64) return { ok: false, code: 'exit_country_invalid', error: 'the country is at most 64 characters' };
  if (!ip && !c && !tz.value) return { ok: false, code: 'exit_empty', error: 'give at least one of the public address, the country or the time zone' };
  return { ok: true, value: { publicIp: ip, country: c, timezone: tz.value, checkedAt: Number(now) || 0, source: source === 'measured' ? 'measured' : 'typed' } };
}
module.exports = { EXIT_URL_KEY, DEADLINE_MS, BODY_CAP, REQUEST_HEADERS, KEYS, NESTED, checkUrlVerdict, readExitAnswer, zoneVerdict, egressRecordOf, privateHost, ipLiteral };
