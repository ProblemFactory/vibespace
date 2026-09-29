'use strict';
/**
 * PURE (imports nothing; CJS — the daemon bundle AND the browser bundle carry it) — THE DIAL'S FACTS
 * (lane-pairing ①③⑤, B-7007; the owner's MacBook, 2026-09-27: the dialog offered ONE address the Mac could
 * not reach, a hand-edited dial.json dialed a typo host over wss, every re-open minted a new token, and the
 * server said "token mismatch" in its journal while the row said only "offline").
 *
 *   ① `dialAddressCandidates` — every address the SERVER can name for itself (the browser's origin, the relay,
 *      Tailscale / LAN / public interface IPs, this host's name, IPv6), each with what the server knows about
 *      who can reach it; `dialBaseVerdict` — the ONE way a custom address enters (the route re-runs it).
 *   ③ `dialFailureOf` — the daemon's classifier of a failed dial (a CLOSED code set); `parseDialHeaders` —
 *      the server's reader of the daemon's per-attempt hints (untrusted: closed codes, ≤ 80 bytes);
 *      `nextDialStatus` — the reducer of the device's `state/dial-status.json`; `dialLogLine` — its one log line;
 *      `dialRowState` — THE one state the machine row, the Machines card and the pairing sheet all read.
 *   ⑤ `dialCheckLines` — what `vibespace-device.js --dial-check` prints and exits with, per class.
 * Nothing here ever carries a token: a URL is reduced to host:port (`hostOf`) before it is written anywhere.
 *
 * Gate: scripts/test-dial-facts.mjs (fast — every table + patched-copy controls).
 */

const DIAL_PATH = '/api/device-dial'; // server.js's upgrade branch (the /api/agentd-dial alias stays forever there)
const CANDIDATE_KINDS = Object.freeze(['origin', 'relay', 'tailscale', 'lan', 'public', 'hostname', 'ipv6']);
const BASE_REFUSALS = Object.freeze(['scheme', 'host', 'port', 'path', 'query', 'empty']);
/** The daemon's failure classes (§4.2) — CLOSED; `http-<status>` is the one parameterised family. */
const DIAL_FAIL_CODES = Object.freeze(['dns', 'tls', 'not-ws', 'refused-connect', 'timeout', 'unreachable', 'reset',
  'refused-token-mismatch', 'refused-no-pairing', 'refused-no-device-id', 'refused-duplicate-device', 'refused-unknown', 'closed-before-hello', 'lost', 'other']);
/** The server's named refusals at the upgrade (the X-VibeSpace-Dial-Refusal header). */
const DIAL_REFUSAL_CODES = Object.freeze(['token-mismatch', 'no-pairing', 'no-device-id', 'duplicate-device']);
/** THE row's states (§4.6), in the order they are judged. */
const DIAL_ROW_STATES = Object.freeze(['auth-fail', 'connected', 'refused', 'silent', 'never', 'unknown']);
/** The closed reasons the row words (§11.2). */
const DIAL_REASONS = Object.freeze(['token-mismatch', 'no-pairing', 'duplicate-device', 'dns', 'tls', 'refused-connect', 'timeout', 'unreachable', 'not-vibespace', 'other']);
const DUP_NOTE_MS = 10 * 60 * 1000; // a duplicate seen within this long is still on the row
const BOOT_RE = /^[0-9a-f]{8,32}$/;    // the daemon's per-process boot id (x-vibespace-daemon-boot)
const UP_LOST_MS = 2000;       // an upgrade that lived at least this long then closed is the link's END, not a failed dial
const DETAIL_MAX = 200;
const HEADER_MAX = 80;
const DIAL_BASE_MAX = 270; // x-vibespace-dial-base: `https://` + a 253-byte host name + `:65535`
/** verify-r4 F7: node's process.platform names a daemon may state (x-vibespace-daemon-platform) — a CLOSED set. */
const DAEMON_PLATFORMS = Object.freeze(['darwin', 'linux', 'win32', 'freebsd', 'openbsd', 'netbsd', 'sunos', 'aix', 'android']);
const HISTORY_MAX = 20;

const clean = (s, max = DETAIL_MAX) => String(s == null ? '' : s)
  .replace(/vs[a-z]t_[A-Za-z0-9]+/g, (m) => m.slice(0, 5) + '…') // a token never rides a detail
  .replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const isStatusCode = (c) => /^http-[1-5]\d\d$/.test(String(c || ''));
const knownFailCode = (c) => DIAL_FAIL_CODES.includes(c) || isStatusCode(c);

/** `ws://host:3456/api/device-dial?device=X` → `host:3456` (the default port named); anything unparsable → ''. */
function hostOf(url) {
  try {
    const u = new URL(String(url));
    const port = u.port || (/^(wss|https):$/.test(u.protocol) ? '443' : '80');
    return `${u.hostname.includes(':') && !u.hostname.startsWith('[') ? `[${u.hostname}]` : u.hostname}:${port}`;
  } catch { return ''; }
}
/** THE dial URL of a base. */
function dialUrlOf(base, deviceId) { return String(base).replace(/^http/, 'ws') + DIAL_PATH + '?device=' + String(deviceId || ''); }
/** verify-r4 F1: the BASE a dial URL dials (`wss://h:8443/api/device-dial?device=x` → `https://h:8443`; no path, no
 *  query — never a token) — the DEVICE's own fact, which it states on every attempt (x-vibespace-dial-base). '' when
 *  the URL is not one a device can dial. Never throws. */
function dialBaseOfUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return ''; }
  const scheme = u.protocol === 'wss:' || u.protocol === 'https:' ? 'https' : u.protocol === 'ws:' || u.protocol === 'http:' ? 'http' : '';
  if (!scheme) return '';
  const v = dialBaseVerdict(`${scheme}://${u.host}`);
  return v.ok ? v.base : '';
}

// ── ① the address list ──────────────────────────────────────────────────────
function ipv4Class(a) {
  const p = String(a).split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  if (p[0] === 127 || p[0] === 0) return null;                     // loopback / this-network
  if (p[0] === 169 && p[1] === 254) return null;                   // link-local
  if (p[0] >= 224) return null;                                    // multicast / reserved
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return 'tailscale'; // 100.64.0.0/10 — CGNAT, what Tailscale hands out
  if (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)) return 'lan';
  return 'public';
}
function ipv6Global(a) {
  const s = String(a).toLowerCase().split('%')[0];
  if (!s.includes(':')) return false;
  const head = parseInt(s.split(':')[0] || '0', 16);
  return Number.isFinite(head) && head >= 0x2000 && head <= 0x3fff; // 2000::/3 — global unicast only
}
const isFamily4 = (f) => f === 'IPv4' || f === 4;
const isFamily6 = (f) => f === 'IPv6' || f === 6;
/**
 * `{origin, relay, hostname, interfaces, port, deviceId}` → rows `{kind, base, dialUrl, label, note, plain, rank}`.
 * One row per distinct base; origin first, the relay second (omitted when equal), then tailscale, lan, public,
 * hostname, ipv6. Loopback, link-local and `internal` interfaces are never rows. A base is http unless it came
 * from the origin / the relay with https (VibeSpace serves plain http; TLS exists only in front of it).
 */
function dialAddressCandidates({ origin = null, relay = null, hostname = '', interfaces = {}, port = 3456, deviceId = '', bind = null } = {}) {
  const rows = [];
  // verify-r4 F3: an interface address is a row only when THIS SERVER'S SOCKET accepts it (`bind` = the address the
  // server is bound to — server.address(), the SERVER's fact; the interface list is only what the MACHINE has)
  const admits = bindAdmits(bind);
  const seen = new Set();
  const add = (kind, base) => {
    const v = dialBaseVerdict(base);
    if (!v.ok || seen.has(v.base)) return;
    if (kind !== 'origin' && kind !== 'relay' && /^https:/.test(v.base)) return;
    seen.add(v.base);
    // naive-user N-loop: a LOOPBACK base (the browser on this machine, an ssh tunnel's localhost, a host named
    // `localhost`) reaches only THIS machine — it stays a row (a device on this very machine may use it) but goes
    // last, worded so, and is never the default (dialDefaultChoice): it was the first row, checked, "the address you
    // are using now", and a device anywhere else can never dial it
    const loop = isLoopbackBase(v.base);
    rows.push({ kind, base: v.base, dialUrl: dialUrlOf(v.base, deviceId), label: v.base, note: loop ? (kind === 'origin' ? 'loopback-origin' : 'loopback') : kind, plain: /^http:/.test(v.base), rank: loop ? CANDIDATE_KINDS.length : CANDIDATE_KINDS.indexOf(kind), ...(loop ? { loopback: true } : {}) });
  };
  if (origin) add('origin', origin);
  if (relay) add('relay', relay);
  const p = Number(port) > 0 && Number(port) < 65536 ? Number(port) : 3456;
  const v4 = { tailscale: [], lan: [], public: [] }, v6 = [];
  for (const [name, list] of Object.entries(interfaces && typeof interfaces === 'object' ? interfaces : {})) {
    for (const a of Array.isArray(list) ? list : []) {
      if (!a || a.internal) continue;
      if (isFamily4(a.family)) {
        let c = ipv4Class(a.address);
        if (!c || !admits.v4(a.address)) continue;
        // an interface Tailscale names (tailscale0 / ts0 / utun on macOS) carrying a CGNAT address is the tailnet
        if (c === 'public' && /^(tailscale|ts|utun)/i.test(name) && /^100\./.test(a.address)) c = 'tailscale';
        v4[c].push(`http://${a.address}:${p}`);
      } else if (isFamily6(a.family) && ipv6Global(a.address) && admits.v6(String(a.address).split('%')[0])) v6.push(`http://[${String(a.address).split('%')[0]}]:${p}`);
    }
  }
  for (const k of ['tailscale', 'lan', 'public']) for (const b of v4[k]) add(k, b);
  if (admits.any && hostname && /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(String(hostname))) add('hostname', `http://${hostname}:${p}`); // a name resolves to SOME address: only a wildcard bind accepts whichever
  for (const b of v6) add('ipv6', b);
  return rows.sort((a, b) => a.rank - b.rank);
}

/** Is a bare address / host name THIS machine only (127.0.0.0/8, ::1, ::ffff:127.x, localhost, *.localhost)? */
function isLoopbackAddress(a) {
  const h = String(a == null ? '' : a).trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/^::ffff:(?=\d)/, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h);
}
/**
 * verify-r4 F3 — WHICH INTERFACE ADDRESSES THE SERVER'S SOCKET ACCEPTS. `bind` = the address the server is bound to
 * (`server.address().address`; README: `HOST=127.0.0.1` for local-only). Reproduced before: a server started with
 * HOST=127.0.0.1 listed its Tailscale / LAN / hostname addresses, checked the tailnet one "reachable from your tailnet",
 * and every one of them refused the connection (ECONNREFUSED ×4) — and the default HOST=0.0.0.0 is IPv4 ONLY in node,
 * so a global IPv6 row could never answer. → `{v4(addr), v6(addr), any, loopbackOnly}`:
 *   null / ''          unknown (a caller that does not say) ⇒ everything, as before
 *   0.0.0.0            every IPv4, no IPv6
 *   :: / ::0           every IPv4 and IPv6 (node listens dual-stack)
 *   a loopback address none — the machine's other addresses refuse the connection (`loopbackOnly`)
 *   one address        that address only (an IPv4-mapped ::ffff:a.b.c.d is a.b.c.d)
 */
function bindAdmits(bind) {
  const b = String(bind == null ? '' : bind).trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const all = { v4: () => true, v6: () => true, any: true, loopbackOnly: false };
  if (!b) return all;
  if (b === '0.0.0.0') return { v4: () => true, v6: () => false, any: true, loopbackOnly: false };
  if (b === '::' || b === '::0' || /^0*:(0*:)*0*$/.test(b) && b.includes('::')) return all;
  if (isLoopbackAddress(b)) return { v4: () => false, v6: () => false, any: false, loopbackOnly: true };
  const one = b.replace(/^::ffff:(?=\d)/, '');
  return { v4: (a) => String(a) === one, v6: (a) => String(a).toLowerCase() === one, any: false, loopbackOnly: false };
}
/** Does `base` name THIS machine only (127.0.0.0/8, ::1, 0.0.0.0, localhost, *.localhost)? Never throws. */
function isLoopbackBase(base) {
  let h = '';
  try { h = new URL(String(base)).hostname.toLowerCase(); } catch { return false; }
  h = h.replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0.0.0.0' || /^127(\.\d{1,3}){3}$/.test(h);
}
/** The `host:port` a base dials (the scheme's default port named), lower-case — '' when it is not a base. */
function authorityOf(base) { const v = dialBaseVerdict(base); return v.ok ? hostOf(dialUrlOf(v.base, 'x')).toLowerCase() : ''; }
/** A `Host` the device dialed (`host[:port]`, as the dial gate records it) → a base: port 443 ⇒ https, another port
 *  ⇒ http (VibeSpace serves plain http on its port), no port ⇒ the scheme of the pairing's own base. null if unusable. */
function baseOfDialedHost(host, pairedBase = '') {
  const s = String(host || '').trim();
  const m = s.match(/^(\[[^\]]+\]|[^:/?#@\s]+)(?::(\d{1,5}))?$/);
  if (!m) return null;
  const scheme = m[2] ? (m[2] === '443' ? 'https' : 'http') : (/^https:/.test(String(pairedBase || '')) ? 'https' : 'http');
  const v = dialBaseVerdict(`${scheme}://${s}`);
  return v.ok ? v.base : null;
}
/**
 * THE address a pairing dialog checks first. For a device already paired (`dial` = its host record's dial facts —
 * naive-user N-sheet: the row's pairing SHEET checked row 1, the browser's origin, whatever the device used, and
 * "Generate" + "send it over its link" pushed ws://127.0.0.1 into a Mac's dial.json — a working device stranded):
 *   connected  the address the device CONNECTED through since the current mint, AS THE DEVICE STATES IT
 *              (`lastAccept.dialed` — the base of its own dial URL, x-vibespace-dial-base; proven reachable from the
 *              device; a hand-edited dial.json included: the owner's Mac). verify-r4 F1: NEVER `lastAccept.host` —
 *              that is the Host header as it REACHED this server, i.e. the last proxy's fact: VibeSpace's own frp
 *              relay rewrites it to `127.0.0.1` (src/plugins.js hostHeaderRewrite), nginx's default to its upstream —
 *              the sheet checked `http://127.0.0.1` for every relay-paired device and Generate + the in-place push
 *              stranded it (reproduced with a real daemon behind a Host-rewriting relay: dial.json → ws://127.0.0.1)
 *   paired     the base the current command was made for (`mintedBase`; a record from before it: `mintedHost`) — also
 *              the answer for a device too old to state its address (it states it after its first self-upgrade)
 * — a listed row when one names the same host:port, else Custom… filled with it. Otherwise (a new device, no facts):
 * the first row a device elsewhere can reach — never a loopback row (naive-user N-loop; verify-r4 F3: when no row is
 * reachable, the relay-publish row if offered, else Custom… empty).
 * A CLAIM (verify-r5 C1; verify-r6 L1) = the device's stated address when VibeSpace did not offer it (no reachable row,
 * not the current command's base). It is NEVER the default: the default is what it would be without the statement
 * (the current command's base — `paired` — else the guess), and the claim rides beside it as `claim` (the base), shown
 * by the picker as an UNCHECKED row worded as the device's claim. verify-r6 L1: r5 checked the claim by default, so ONE
 * press of Generate minted it as the command's base — and from then on it WAS "the base the current command was made
 * for", i.e. `connected`, "the address this device connects through" as a fact, for good (a leaked command's holder's
 * address laundered through the owner's single click on a pre-checked row). Now only the owner's own pick of it makes
 * it the command's base.
 * → `{kind: 'row', base, why, claim?}` | `{kind: 'custom', value, why, claim?}` | `{kind: 'relay-publish', why, claim?}`,
 * why ∈ connected | paired | unstated (verify-r5 C3: a paired device with no statement and no mint facts — a guess,
 * said so) | claim-held (verify-r6 L1: the same guess for a device whose only statement is a claim) | first-reachable
 * | only-loopback | none. Never throws.
 */
function dialDefaultChoice({ candidates = [], dial = null, relayPublishable = false } = {}) {
  const rows = Array.isArray(candidates) ? candidates.filter((c) => c && c.base) : [];
  const pick = (base, why) => {
    const a = authorityOf(base);
    const row = rows.find((c) => c.base === base) || (a ? rows.find((c) => authorityOf(c.base) === a) : null);
    return row ? { kind: 'row', base: row.base, why } : { kind: 'custom', value: base, why };
  };
  const d = dial && typeof dial === 'object' ? dial : null;
  let claim = null;
  const withClaim = (r) => (claim ? { ...r, claim } : r);
  if (d) {
    const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
    const la = d.lastAccept && typeof d.lastAccept === 'object' ? d.lastAccept : null;
    if (la && la.dialed && n(d.lastConnectAt) > 0 && n(d.lastConnectAt) >= n(d.tokenMintedAt)) {
      const v = dialBaseVerdict(la.dialed);
      if (v.ok) {
        // verify-r5 C1: the device's statement is ITS CLAIM — whatever holds the dial token says what it dials, and
        // nothing proves it (a leaked command's holder dialing in while the device is away can state any base; the
        // command this sheet makes then `curl`s its installer from that base with both tokens in the environment). It
        // is `connected` only when VibeSpace ITSELF offered that address — a row another device can reach, or the base
        // the current command was made for (the owner's own pick); anything else (a hand-edited dial.json, a proxy
        // nobody listed, a loopback or link-local address, a stranger's pick) is a CLAIM. verify-r6 L1: a claim is
        // never the default — it rides beside it (`claim`), unchecked; only the owner's own pick makes it the base
        const r = pick(v.base, 'connected');
        const mb = d.mintedBase ? dialBaseVerdict(d.mintedBase) : null;
        const row = r.kind === 'row' ? rows.find((c) => c.base === r.base) : null;
        const offered = !!(row && !row.loopback && !isLoopbackBase(row.base)) || !!(mb && mb.ok && mb.base === v.base);
        if (offered) return r;
        claim = v.base;
      }
    }
    if (d.mintedBase) { const v = dialBaseVerdict(d.mintedBase); if (v.ok) return withClaim(pick(v.base, 'paired')); }
    if (d.mintedHost) { const b = baseOfDialedHost(d.mintedHost); if (b) return withClaim(pick(b, 'paired')); }
  }
  const reach = rows.find((c) => !c.loopback && !isLoopbackBase(c.base));
  // verify-r5 C3: a PAIRED device (`dial` given) that has stated nothing (its daemon predates x-vibespace-dial-base) and
  // whose record predates the mint facts — the first reachable row is a GUESS for it: `unstated`, and the picker says so
  // (r4 dropped the Host-header fallback; this was the one paired case the sheet still checked in silence).
  // verify-r6 L1: the same guess for a device whose only statement is a claim: `claim-held` (the claim is shown beside it)
  const guess = d ? (claim ? 'claim-held' : 'unstated') : 'first-reachable';
  if (reach) return withClaim({ kind: 'row', base: reach.base, why: guess });
  // verify-r4 F3: nothing another device can reach (a server bound to 127.0.0.1 opened from this machine / an ssh
  // tunnel): the relay when it can be published, else Custom… EMPTY — never a loopback row checked for a device that
  // is, by the dialog's own purpose, somewhere else (the loopback rows stay pickable)
  if (relayPublishable) return withClaim({ kind: 'relay-publish', why: guess });
  return withClaim({ kind: 'custom', value: '', why: rows.length ? 'only-loopback' : 'none' });
}

const HOSTNAME_RE = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/;
function hostVerdict(h) {
  if (!h) return false;
  if (h.startsWith('[')) return /^\[[0-9A-Fa-f:.]+\]$/.test(h) && h.includes(':');
  if (/^[\d.]+$/.test(h)) { const p = h.split('.'); return p.length === 4 && p.every((x) => x !== '' && Number(x) >= 0 && Number(x) <= 255); }
  return HOSTNAME_RE.test(h) && !/^\d+$/.test(h.split('.').pop() || '');
}
/**
 * THE ONLY way a custom address enters: `http(s)://host[:port]`, `ws(s)://host[:port]` (→ http(s)), or a bare
 * `host[:port]` (→ http://). → `{ok: true, base}` (no trailing slash) | `{ok: false, code}` — code ∈ BASE_REFUSALS.
 */
function dialBaseVerdict(input) {
  let s = String(input == null ? '' : input).trim();
  if (!s) return { ok: false, code: 'empty' };
  let scheme = 'http';
  const m = s.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//);
  if (m) {
    const sc = m[1].toLowerCase();
    if (!['http', 'https', 'ws', 'wss'].includes(sc)) return { ok: false, code: 'scheme' };
    scheme = sc === 'ws' ? 'http' : sc === 'wss' ? 'https' : sc;
    s = s.slice(m[0].length);
  } else if (/^[A-Za-z][A-Za-z0-9+.-]*:(?!\d)/.test(s) && !s.startsWith('[')) return { ok: false, code: 'scheme' }; // javascript:, data:, mailto:…
  const cut = s.search(/[/?#]/);
  const authority = cut < 0 ? s : s.slice(0, cut);
  const rest = cut < 0 ? '' : s.slice(cut);
  if (rest.includes('?')) return { ok: false, code: 'query' };
  if (rest && rest !== '/') return { ok: false, code: 'path' };
  if (!authority || authority.includes('@')) return { ok: false, code: 'host' };
  let host = authority, port = '';
  const pm = authority.match(/^(\[[^\]]*\]|[^:]*)(?::(.*))?$/);
  if (!pm) return { ok: false, code: 'host' };
  host = pm[1]; port = pm[2] == null ? '' : pm[2];
  if (pm[2] != null && !/^\d{1,5}$/.test(port)) return { ok: false, code: 'port' };
  if (port && (Number(port) < 1 || Number(port) > 65535)) return { ok: false, code: 'port' };
  if (!hostVerdict(host)) return { ok: false, code: 'host' };
  return { ok: true, base: `${scheme}://${host.toLowerCase()}${port ? ':' + Number(port) : ''}` };
}

// ── ③ the daemon's classifier ───────────────────────────────────────────────
const DNS_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NONAME'];
const TLS_CODES = ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'];
/**
 * A failed (or ended) dial → `{code, detail, status?}`. `up` = the upgrade had succeeded, `upMs` = for how long.
 * An upgrade that lived ≥ 2 s is the link's END (`lost`, the streak is not incremented); a shorter one closed
 * before the server's hello (`closed-before-hello`). Never throws; `detail` ≤ 200 chars, no control characters,
 * no token.
 */
function dialFailureOf(err, { up = false, upMs = 0 } = {}) {
  if (up) return { code: Number(upMs) >= UP_LOST_MS ? 'lost' : 'closed-before-hello', detail: clean(err && (err.code || err.message) || '') };
  if (!err) return { code: 'other', detail: 'closed without an error' };
  const code = String(err.code || '');
  const msg = String(err.message || '');
  const detail = clean(code && !msg.includes(code) ? `${code}: ${msg}` : msg || code);
  if (code === 'UPGRADE_REFUSED') {
    const status = Number(err.status) || 0;
    let body = null;
    try { body = typeof err.body === 'string' && err.body ? JSON.parse(err.body) : (err.body && typeof err.body === 'object' ? err.body : null); } catch { body = null; }
    const said = clean(body && typeof body.error === 'string' ? body.error : '');
    const ref = String(err.refusal || '').trim().toLowerCase();
    if (status === 401) {
      if (DIAL_REFUSAL_CODES.includes(ref)) return { code: `refused-${ref}`, detail: said || ref, status };
      return { code: 'refused-unknown', detail: said || 'HTTP 401 with no reason (a server older than this device)', status };
    }
    if (status >= 100 && status <= 599) return { code: `http-${status}`, detail: said || `HTTP ${status}`, status };
    return { code: 'other', detail: detail || 'upgrade refused', status: status || undefined };
  }
  if (code === 'BAD_ACCEPT' || code.startsWith('HPE_')) return { code: 'not-ws', detail };
  if (DNS_CODES.includes(code)) return { code: 'dns', detail };
  if (code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_') || code.startsWith('CERT_') || TLS_CODES.includes(code)
    || ((code === 'EPROTO' || !code) && /wrong version number|ssl|tls/i.test(msg))) return { code: 'tls', detail };
  if (code === 'ECONNREFUSED') return { code: 'refused-connect', detail };
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return { code: 'timeout', detail };
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EADDRNOTAVAIL') return { code: 'unreachable', detail };
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED') return { code: 'reset', detail };
  return { code: 'other', detail: detail || 'unknown failure' };
}

/** The daemon's per-attempt request headers (plain ASCII, each ≤ 80 bytes). */
function dialHeadersOf({ streak = 0, lastFail = null, version = '', boot = '', dialUrl = '', platform = '' } = {}) {
  const h = { 'x-vibespace-dial-attempt': String(Math.max(0, Math.min(1e6, Number(streak) || 0))) };
  // verify-r4 F7: the DEVICE's OS (process.platform) — the pairing sheet preselects that command form, never the browser's
  if (DAEMON_PLATFORMS.includes(String(platform || ''))) h['x-vibespace-daemon-platform'] = String(platform);
  // verify-r4 F1: the address THIS DEVICE dials (the base of its dial URL — no path, no query, never the token): the
  // RECEIVER's fact the pairing sheet checks. The Host header the server sees is the last proxy's (a relay rewrites it)
  const db = dialUrl ? dialBaseOfUrl(dialUrl) : '';
  if (db && db.length <= DIAL_BASE_MAX) h['x-vibespace-dial-base'] = db;
  if (lastFail && knownFailCode(lastFail.code) && Number(lastFail.at) > 0) h['x-vibespace-dial-last'] = `${lastFail.code}@${Math.floor(Number(lastFail.at))}`.slice(0, HEADER_MAX);
  const v = String(version || '');
  if (/^[0-9A-Za-z.+-]{1,40}$/.test(v)) h['x-vibespace-daemon'] = v;
  // verify-r1 B9: THIS PROCESS's boot id — the server tells a re-dial of the same daemon from a SECOND daemon holding
  // a copy of the pairing (the same command run on two machines, a migrated home folder)
  const b = String(boot || '');
  if (BOOT_RE.test(b)) h['x-vibespace-daemon-boot'] = b;
  return h;
}
/** The server's reader of those headers — UNTRUSTED hints: closed codes (anything else is `other`), ≤ 80 bytes. */
function parseDialHeaders(headers) {
  const get = (k, max = HEADER_MAX) => { const v = headers && headers[k]; const s = Array.isArray(v) ? v[0] : v; return typeof s === 'string' && s.length <= max ? s : ''; };
  const a = get('x-vibespace-dial-attempt');
  const attempt = /^\d{1,7}$/.test(a) ? Math.min(1e6, Number(a)) : 0;
  let last = null;
  const l = get('x-vibespace-dial-last');
  const lm = l.match(/^([a-z0-9-]{1,40})@(\d{10,16})$/);
  if (lm) last = { code: knownFailCode(lm[1]) ? lm[1] : 'other', at: Number(lm[2]) };
  else if (l) last = { code: 'other', at: null };
  const d = get('x-vibespace-daemon');
  const daemon = /^[0-9A-Za-z.+-]{1,40}$/.test(d) ? d : null;
  const probe = get('x-vibespace-dial-probe') === '1';
  const b = get('x-vibespace-daemon-boot');
  const boot = BOOT_RE.test(b) ? b : null; // null = a daemon from before the boot id (judged as before: replaced)
  // verify-r4 F1: the device's own dial address — judged by the ONE base verdict (anything else ⇒ null: not stated)
  const dv = dialBaseVerdict(get('x-vibespace-dial-base', DIAL_BASE_MAX));
  const dialed = dv.ok ? dv.base : null;
  const pf = get('x-vibespace-daemon-platform');
  const platform = DAEMON_PLATFORMS.includes(pf) ? pf : null; // verify-r4 F7: closed set; anything else ⇒ not stated
  return { attempt, last, daemon, probe, boot, dialed, platform };
}

/** The server's refusal sentence (the daemon's log and the installer print it; the ROW words are the client's).
 *  verify-r2 (the dial endpoint): a stranger hears ONE answer for a wrong token and an unknown name — `token-mismatch`,
 *  worded for both (the pairing was replaced OR removed; both roads lead to the pairing dialog). Answering `no-pairing`
 *  told anyone reaching the port which device names are paired here. `no-pairing` stays in the closed set so a daemon
 *  talking to an older server still classifies it. */
function refusalSentence(code, deviceId) {
  const id = clean(deviceId, 64) || '?';
  if (code === 'token-mismatch') return `the dial token does not match the pairing on record for "${id}" — generate a new command in the pairing dialog (the command is older than the pairing), or pair again if it is no longer listed`;
  if (code === 'no-pairing') return `this server has no pairing named "${id}" — it was unpaired; pair the device again`;
  if (code === 'duplicate-device') return `pair this machine under its own name — another device is dialed in as "${id}" and answering; this one holds a copy of its pairing (one command run on two machines, or a copied home folder)`;
  return 'the dial URL names no device (?device=<id> is missing)';
}

/**
 * THE device's `state/dial-status.json` reducer. `ev` = `{at, outcome: 'connected'|'failed'|'lost', code, detail,
 * status, host}`. `streak` = failures since the last connect (a `lost` is the link's end — not counted);
 * `lastFail` = the previous failure (the next attempt's `x-vibespace-dial-last`); `history` ≤ 20.
 */
function nextDialStatus(prev, ev) {
  const p = prev && typeof prev === 'object' ? prev : {};
  const at = Number(ev && ev.at) || 0;
  const outcome = ev && ['connected', 'failed', 'lost'].includes(ev.outcome) ? ev.outcome : 'failed';
  const code = outcome === 'connected' ? null : (knownFailCode(ev && ev.code) ? ev.code : 'other');
  const last = { at, outcome, code, detail: outcome === 'connected' ? '' : clean(ev && ev.detail) };
  if (ev && Number(ev.status) > 0) last.status = Number(ev.status);
  const out = {
    host: clean(ev && ev.host, 120) || p.host || '',
    last,
    streak: outcome === 'connected' ? 0 : outcome === 'failed' ? (Number(p.streak) || 0) + 1 : (Number(p.streak) || 0),
    connectedAt: outcome === 'connected' ? at : (p.connectedAt || null),
    lastFail: outcome === 'failed' ? { code, at } : (p.lastFail || null),
    history: [...(Array.isArray(p.history) ? p.history : []), { at, outcome, code }].slice(-HISTORY_MAX),
  };
  return out;
}
const dur = (ms) => {
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h${String(m % 60).padStart(2, '0')}m` : `${Math.floor(h / 24)}d${h % 24}h`;
};
/** THE one daemon log line per attempt (§4.3). */
function dialLogLine({ outcome, code, detail, attempt, delay, url, failedBefore, upMs } = {}) {
  if (outcome === 'connected') return `dial-out connected: ${url}${failedBefore ? ` (after ${failedBefore} failed attempt${failedBefore === 1 ? '' : 's'})` : ''}`;
  if (outcome === 'lost') return `dial-out lost after ${dur(upMs)} — retry in ${delay}ms`;
  if (String(code).startsWith('refused-') && code !== 'refused-connect') return `dial-out refused — ${String(code).slice('refused-'.length)}: ${clean(detail)} (attempt ${attempt}, retry in ${delay}ms)`;
  return `dial-out failed — ${code}: ${clean(detail)} (attempt ${attempt}, retry in ${delay}ms)`;
}

// ── ⑤ --dial-check ──────────────────────────────────────────────────────────
const CHECK_EXITS = Object.freeze({ ok: 0, dns: 10, tls: 11, reach: 12, 'not-vibespace': 13, refused: 14, other: 15 });
/** `{ok, code, detail, host, deviceId, serverVersion, status}` → `{exit, lines:[…]}` (the installer prints them). */
function dialCheckLines({ ok = false, code = 'other', detail = '', host = '', deviceId = '', serverVersion = '', status = 0 } = {}) {
  const h = clean(host, 120) || 'the address';
  if (ok) return { exit: 0, lines: [`dial-check ok — ${h} is a VibeSpace ${clean(serverVersion, 40) || '(older than this device)'} and accepts device "${clean(deviceId, 64)}"`] };
  const d = clean(detail);
  const bare = h.replace(/:\d+$/, '');
  if (code === 'dns') return { exit: CHECK_EXITS.dns, lines: [`dial-check failed — dns: ${d}`, `→ this device cannot resolve ${bare}. In the pairing dialog pick another address (a LAN or Tailscale IP) and generate a new command.`] };
  if (code === 'tls') return { exit: CHECK_EXITS.tls, lines: [`dial-check failed — tls: ${d}`, `→ ${h} does not speak TLS (wss://) — or its certificate is not trusted here. Pick the http/ws address, or fix the certificate.`] };
  if (['refused-connect', 'timeout', 'unreachable', 'reset'].includes(code)) return { exit: CHECK_EXITS.reach, lines: [`dial-check failed — ${code}: ${d}`, `→ nothing answers at ${h} from this network. Is VibeSpace running there, and is this device on a network that reaches it? Pick another address.`] };
  if (code === 'not-ws' || isStatusCode(code)) return { exit: CHECK_EXITS['not-vibespace'], lines: [`dial-check failed — ${code}: ${d}`, `→ ${h} answered, but not as a VibeSpace dial endpoint (status ${Number(status) || String(code).replace(/^http-/, '') || '?'}). A relay with no backend, a proxy page, or the wrong port.`] };
  if (code === 'refused-token-mismatch' || code === 'refused-no-pairing' || code === 'refused-no-device-id' || code === 'refused-unknown') return { exit: CHECK_EXITS.refused, lines: [`dial-check failed — ${code}: ${d}`, '→ generate a new command in the pairing dialog and run that one.'] };
  return { exit: CHECK_EXITS.other, lines: [`dial-check failed — other: ${d || code}`] };
}

// ── the refusal LOG budget (verify-r2, the dial endpoint) ────────────────────
// `max` lines per key per window, `globalMax` lines per window whatever the keys, `keys` = the most keys remembered.
const REFUSAL_BUDGET = Object.freeze({ max: 30, globalMax: 300, windowMs: 10 * 60 * 1000, keys: 4096 });
/** The budget's key for a peer address: IPv4 (a `::ffff:`-mapped one too) as is; IPv6 by its /64 — ONE host's
 *  allotment, so rotating through it is one key, not 2^64; anything else verbatim (≤ 64 chars). Never throws. */
function refusalAddressKey(ip) {
  const s = String(ip == null ? '' : ip).trim().toLowerCase().replace(/%.*$/, '').slice(0, 64);
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) return v4[1];
  if (!/^[0-9a-f:]+$/.test(s) || !s.includes(':')) return s || '?';
  const [l, r] = s.split('::');
  const left = l ? l.split(':') : [];
  const right = s.includes('::') && r ? r.split(':') : [];
  const full = s.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return full.slice(0, 4).map((h) => (h || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
/**
 * How many JOURNAL LINES a refused dial may cost (verify-r2, the dial endpoint): the endpoint answers anyone who
 * reaches the port, and every refusal wrote one line — 2 000 knocks from one address in 185 ms = 2 000 lines, i.e.
 * journald's per-service burst (10 000 / 30 s) spent in about a second, after which it drops the lines that matter.
 * Per KEY (the caller passes the address + the device name when a pairing answers to it, so two paired devices
 * behind one relay or one NAT never mute each other; guessed names share the address's key) the first `max` per
 * window are logged; once the window holds `globalMax` lines nothing more is — an attacker rotating addresses meets
 * that ceiling (≤ `globalMax` + 1 lines per window, whatever arrives). ONE summary line where a key or the window crosses. This is a LOG budget only: the wire answer never
 * changes (a correct token is admitted whatever the count — 144 bits are not brute-forced, and a lock keyed by
 * address would let one stale device behind the relay lock out every other one), and the paired device's own row
 * keeps recording its last refusal (bounded per device by construction: in memory, throttled to disk).
 * O(1) per hit: the map holds ≤ `keys` entries and drops the oldest window first.
 * → `{hit(ip, deviceKey, now) → {log, summary: 'key' | 'global' | null, count, lines}}`, `size()`.
 */
function refusalBudget({ max = REFUSAL_BUDGET.max, globalMax = REFUSAL_BUDGET.globalMax, windowMs = REFUSAL_BUDGET.windowMs, keys = REFUSAL_BUDGET.keys } = {}) {
  const seen = new Map(); // key → { at: the window's start, count } — insertion order = window order (a rolled key is re-inserted)
  let all = { at: -Infinity, lines: 0, told: false }; // the window's LINES (a noisy key spends only its own `max`)
  return {
    hit(ip, deviceKey = '', now = Date.now()) {
      if (now - all.at >= windowMs) all = { at: now, lines: 0, told: false };
      const k = refusalAddressKey(ip) + (deviceKey ? '|' + String(deviceKey).slice(0, 64) : '');
      let r = seen.get(k);
      if (r && now - r.at >= windowMs) { seen.delete(k); r = null; }
      if (!r) {
        while (seen.size >= keys) seen.delete(seen.keys().next().value);
        r = { at: now, count: 0 }; seen.set(k, r);
      }
      r.count += 1;
      const out = (log, summary) => ({ log, summary, count: r.count, lines: all.lines });
      if (all.lines >= globalMax) {
        if (all.told) return out(false, null);
        all.told = true; return out(false, 'global');
      }
      if (r.count <= max) { all.lines += 1; return out(true, null); }
      if (r.count === max + 1) { all.lines += 1; return out(false, 'key'); }
      return out(false, null);
    },
    size() { return seen.size; },
  };
}

/** verify-r4 F7: the pairing command's OS form for a device's stated platform — 'mac' | 'win' | 'linux' | null (not
 *  stated, or an OS the installers do not serve: the sheet then falls back to its guess). */
function commandOsOf(platform) { return platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : platform === 'linux' ? 'linux' : null; }

// ── the device NAME (verify-r4 F6) ─────────────────────────────────────────
/** THE device id a typed name becomes — the ONE rule the dial-pair route mints under and the dialog judges with
 *  (letters, digits, `_`, `-`; ≤ 32). '' = nothing usable (the route then picks `dev-<hex>`). */
function deviceIdOf(input) { return String(input == null ? '' : input).trim().replace(/[^\w-]/g, '').slice(0, 32); }
/** verify-r5 A2: what the typed name BECOMES, said before Create — `{id, reduced, empty}`: `reduced` = the rule dropped
 *  something (a CJK / accented / emoji character, a space, past 32) — "办公室Mac" is paired as "Mac" (and warned as the
 *  paired "Mac"), NFC "café" as "caf" but NFD "café" as "cafe"; `empty` = nothing is left: the route picks dev-<hex>. */
function pairNameShown(input) {
  const typed = String(input == null ? '' : input).trim();
  const id = deviceIdOf(typed);
  return { id, reduced: !!typed && id !== typed, empty: !!typed && !id };
}
/**
 * verify-r4 F6: does "Create pairing" under this NAME replace an existing pairing? The route treats an existing device
 * id as a RE-PAIR — the token rotates, the device dialed in on the old command is disconnected at once (verify-r2
 * B8-r2), and the record (its mounts, its "Who can use it" lists) now belongs to whatever runs the new command.
 * Reproduced: "Pair a device" + the name of a connected device ⇒ no word before Create, the device cut (gen 2).
 * `hosts` = the /api/hosts rows. → `{exists, online, name, deviceId}` (exists false ⇒ a new device). Never throws.
 */
function pairNameVerdict(input, hosts = []) {
  const deviceId = deviceIdOf(input);
  const h = deviceId ? (Array.isArray(hosts) ? hosts : []).find((x) => x && x.deviceId === deviceId) : null;
  if (!h) {
    // verify-r5 A3: a name that differs from a paired one only by upper / lower case is refused by the route
    // (pairRequestVerdict `name_case_taken`) — said here first
    const twin = deviceId ? (Array.isArray(hosts) ? hosts : []).find((x) => x && x.deviceId && String(x.deviceId).toLowerCase() === deviceId.toLowerCase()) : null;
    return { exists: false, online: false, name: '', deviceId, ...(twin ? { caseTwin: String(twin.deviceId) } : {}) };
  }
  return { exists: true, online: !!(h.transport === 'dial' ? h.online : h.dialLive), name: String(h.name || deviceId), deviceId };
}
/**
 * verify-r5 A1 — THE ROUTE'S NAME VERDICT for a mint (POST /api/device/dial-pair), BEFORE anything is published,
 * minted or cut. The dialog's F6 note is a judgement on ITS copy of the machine list: two windows typing one new
 * name, or the device coming online while the dialog was open, raced it (reproduced: the second Create re-paired the
 * name silently, cut the device the first window's command had just connected, and told the second window "the one
 * you generated before stops working"; the first window was never told). So the dialog states what it expects:
 *   expect 'new'       ("Create pairing" — it saw no such device) + the name IS paired ⇒ `already_paired`
 *   expect 'existing'  (the sheet's Generate / "Replace its pairing") ⇒ a re-pair, as before — and (verify-r6 P2) a
 *                      name no longer paired ⇒ `not_paired` (it was removed while the sheet was open)
 *   (none)             an older client / the API ⇒ as before
 * and whatever it expects (verify-r5 A3), a NEW id that differs from a paired one only by upper / lower case is
 * `name_case_taken`: every per-device file is named by the id (data/agentd/host-dial-<id>.token, remote-jsonl/
 * host-dial-<id>/), and on a case-insensitive data dir (a macOS hub; README: full support) "MacBook" and "macbook"
 * SHARE them — one host token for both, and removing either deleted the other's token + transcript cache: its row went
 * to "refuses this server's key" (reproduced on a casefold file system with the real modules). `hosts` =
 * HostManager.list() rows.
 * → `{ok: true, exists}` | `{ok: false, code, error, online?, twin?}`. Never throws.
 */
function pairRequestVerdict({ deviceId = '', expect = null, hosts = [] } = {}) {
  const id = String(deviceId || '');
  const list = (Array.isArray(hosts) ? hosts : []).filter((h) => h && h.deviceId);
  const exact = list.find((h) => h.deviceId === id);
  if (!exact) {
    const twin = list.find((h) => String(h.deviceId).toLowerCase() === id.toLowerCase());
    if (twin) return { ok: false, code: 'name_case_taken', twin: String(twin.deviceId), error: `"${id}" differs from the paired device "${twin.deviceId}" only by upper / lower case — VibeSpace keeps one name for both (a case-insensitive disk shares their files); pick another name, or give "${twin.deviceId}" a new command from its pairing icon` };
  }
  // verify-r6 P2: the sheet's Generate / "Replace its pairing" named a device that is NO LONGER paired (removed in
  // another window, or by another user, while the sheet was open) — it re-created the pairing silently; refused by name
  if (!exact && expect === 'existing') return { ok: false, code: 'not_paired', error: `"${id}" is no longer paired (it was removed — in another window, or by another user) — nothing was created; to pair a device under this name, use "Pair a device"` };
  if (exact && expect === 'new') return { ok: false, code: 'already_paired', online: !!(exact.transport === 'dial' ? exact.online : exact.dialLive), error: `"${id}" is already paired — it was paired a moment ago (another window, or another user); creating it again REPLACES that pairing: confirm with "Replace its pairing"` };
  return { ok: true, exists: !!exact };
}

// ── ② the mint's in-place push (verify-r1 B8, 2026-09-28) ──────────────────
/**
 * Does "Generate a new command" hand the NEW dial.json to the device dialed in RIGHT NOW? Only when the user asked
 * (`requested`): the push is a convenience for a device the user trusts (a new address, a lost command) — but a
 * rotation is ALSO how a leaked command is retired, and pushing the new token to whoever holds the old one served
 * the impostor (reproduced: a daemon started from the old command received the rotated token and was accepted
 * again). The dialog offers the choice only while a device is connected; the default is to lock the holder out.
 * → `{push, why}`, why ∈ 'not-paired-before' | 'not-dialed-in' | 'not-requested' | 'requested'.
 */
function inPlacePushVerdict({ existed = false, live = false, requested = false, shownSince, liveSince = null } = {}) {
  if (!existed) return { push: false, why: 'not-paired-before' };
  // verify-r6 P1: the owner ASKED for the push ("Send the new command to the connected device over its link — it keeps
  // working") on a sheet that showed a CONNECTED device. If that link is gone, or is no longer the link the sheet
  // showed (`shownSince` = the lastConnectAt it displayed; a reconnect — or a leaked command's holder dialing in after
  // the device dropped — moves it), the push cannot do what was approved: REFUSED before anything is minted (it used to
  // fall to a plain rotation — the device the owner chose to keep was cut — or push the token to whoever held the link)
  if (requested === true) {
    if (!live) return { push: false, why: 'not-dialed-in', refuse: 'link_gone' };
    if (shownSince !== undefined && Number(shownSince) !== Number(liveSince)) return { push: false, why: 'link-changed', refuse: 'link_changed' };
    return { push: true, why: 'requested' };
  }
  if (!live) return { push: false, why: 'not-dialed-in' };
  return { push: false, why: 'not-requested' };
}

// ── THE row state (§4.6) ────────────────────────────────────────────────────
/** A stored code (the server's refusal code or the daemon's class) → the closed reason the row words. */
function dialReasonOf(code) {
  const c = String(code || '').replace(/^refused-(token-mismatch|no-pairing|duplicate-device)$/, '$1');
  if (c === 'token-mismatch' || c === 'no-pairing' || c === 'duplicate-device') return c;
  if (['dns', 'tls', 'refused-connect', 'timeout', 'unreachable'].includes(c)) return c;
  if (c === 'not-ws' || isStatusCode(c)) return 'not-vibespace';
  return 'other';
}
/**
 * A SECOND dial-in under a device id that is already dialed in (verify-r1 B9). `current` = the live stream's facts
 * `{boot, alive}` (null = nothing is dialed in; `alive` = did it answer a ping just now: true / false / null = not
 * asked yet), `incoming` = the newcomer's `{boot}`. → `{action: 'replace' | 'refuse' | 'probe', why}`:
 *   no current ⇒ replace (none) · the SAME known boot ⇒ replace (same-daemon: it re-dials after its own drop, the
 *   ONLY newcomer admitted without asking) · otherwise the current is asked: answered ⇒ refuse (duplicate) · silent
 *   ⇒ replace (current-dead) · not asked yet ⇒ probe (why: different-daemon, or unknown-boot when either side
 *   carries no id).
 * verify-r2 B9-r2a: r1 admitted a newcomer WITHOUT a boot id unasked ("a daemon from before the id: replaced as
 * before") — so a copy of the pairing on an old bundle, or any client that simply omits the header, evicted the
 * live device at will (reproduced: 9 accepts / 8 closes in 8 s). A boot id is an identity CLAIM the server cannot
 * verify; what it CAN verify is whether the current link answers. The pre-B9 daemon loses nothing: after its own
 * drop the old socket is closed (nothing current) or half-open (silent ⇒ replaced after the probe).
 * Two daemons on one pairing used to replace each other once a second forever (each accept stopped the other's
 * DeviceManager, which closed its stream): 31 accepts in 30 s, the row flipping, nobody told.
 */
function duplicateDialVerdict({ current = null, incoming = {} } = {}) {
  if (!current) return { action: 'replace', why: 'none' };
  const cb = BOOT_RE.test(String(current.boot || '')) ? String(current.boot) : null;
  const ib = BOOT_RE.test(String((incoming && incoming.boot) || '')) ? String(incoming.boot) : null;
  if (cb && ib && cb === ib) return { action: 'replace', why: 'same-daemon' };
  if (current.alive === true) return { action: 'refuse', why: 'duplicate' };
  if (current.alive === false) return { action: 'replace', why: 'current-dead' };
  return { action: 'probe', why: (!cb || !ib) ? 'unknown-boot' : 'different-daemon' };
}

/**
 * THE one state of a dial machine's link (the row's sub-line + tooltip, the Machines card, the pairing sheet's
 * head). `h` = a /api/hosts row (`online` for a dial record, `dialLive` for a graduated ssh one; `dial` facts).
 * → `{state, at, n, reason, host, dup}` (+ `mintedAt` on `refused` — the current command's instant) — words are the client's; `dup` = `{at, from}` when another device was
 * refused as a duplicate of this one within the last 10 min (null otherwise). First match wins:
 *   auth-fail  online AND the device refused OUR host key after this connect
 *   connected  online (`n` = failed attempts before this connect, `reason` the last of them)
 *   refused    offline AND the last refusal is newer than both the last connect AND the current mint
 *              (a refusal of the token a Generate retired is no longer news)
 *   silent     offline AND it connected before
 *   never      offline AND a command was generated AND it never connected
 *   unknown    none of the above (a record from before this lane)
 */
function dialRowState(h, { now = Date.now() } = {}) {
  const d = (h && h.dial && typeof h.dial === 'object') ? h.dial : {};
  const r = dialRowStateOf(d, h);
  const dd = d.lastDuplicate;
  const dupAt = dd && Number.isFinite(Number(dd.at)) ? Number(dd.at) : 0;
  r.dup = dupAt && now - dupAt <= DUP_NOTE_MS ? { at: dupAt, from: String(dd.from || '') } : null;
  return r;
}
function dialRowStateOf(d, h) {
  const online = !!(h && (h.transport === 'dial' ? h.online : h.dialLive));
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const lastConnectAt = num(d.lastConnectAt), mintedAt = num(d.tokenMintedAt);
  // verify-r4 F1: the host the words name is the DEVICE's (the address it states it dials) or the current command's —
  // never the Host header as it reached this server (a relay rewrites it: "…on a network that reaches 127.0.0.1?")
  const authOf = (b) => { const v = b ? dialBaseVerdict(b) : null; return v && v.ok ? hostOf(dialUrlOf(v.base, 'x')) : ''; };
  const cmdHost = String(d.mintedHost || '');
  // verify-r5 C2: never a REFUSAL's statement — a refused dial proved no pairing (anyone who knows the name knocks with
  // any x-vibespace-dial-base); only an accepted dial's statement is the device's
  const host = authOf(d.lastAccept && d.lastAccept.dialed) || cmdHost;
  if (online) {
    if (d.lastAuthFail && num(d.lastAuthFail.at) > lastConnectAt) return { state: 'auth-fail', at: num(d.lastAuthFail.at), n: 0, reason: null, host };
    const acc = d.lastAccept || {};
    const n = num(acc.attempt);
    return { state: 'connected', at: lastConnectAt || num(acc.at) || null, n, reason: n > 0 ? dialReasonOf(acc.last && acc.last.code) : null, host };
  }
  const ref = d.lastRefusal;
  if (ref && num(ref.at) > Math.max(lastConnectAt, mintedAt)) return { state: 'refused', at: num(ref.at), n: num(ref.attempt), reason: dialReasonOf(ref.code), host, mintedAt: mintedAt || null }; // naive-user N-refused: the words name the CURRENT command's time
  if (lastConnectAt) return { state: 'silent', at: num(d.lastDisconnectAt) || lastConnectAt, n: 0, reason: null, host: authOf(d.lastAccept && d.lastAccept.dialed) || cmdHost };
  if (mintedAt && !num(d.firstConnectAt)) return { state: 'never', at: mintedAt, n: 0, reason: null, host: cmdHost }; // the CURRENT command's address
  return { state: 'unknown', at: null, n: 0, reason: null, host };
}

/**
 * THE GRADUATION'S ssh INVOCATION (verify-r3 B-grad): "Upgrade to dial-out" installs the device daemon on an ssh
 * machine with the freshly minted dial token + the machine's host token. The remote command is the bare `bash -s`;
 * the installer's ARGUMENTS ride stdin as a `set -- …` line bash reads before the installer's own text (which parses
 * "$@" unchanged). r2 and before: `bash -s -- … --dial-token vsdt_… --host-token vsht_…` as the remote command, i.e.
 * the argv of the LOCAL ssh (every user of the hub reads /proc/<pid>/cmdline for the whole install, ≤ 300 s) and the
 * remote shell's command line (the same on the machine). `args` is the argument string, `installer` the script text.
 * → `{remote, stdin}` — the remote command never carries a token.
 */
function sshInstallInvocation({ args = '', installer = '' } = {}) {
  return { remote: 'bash -s', stdin: `set -- ${String(args)}\n${String(installer)}` };
}

module.exports = {
  DIAL_PATH, CANDIDATE_KINDS, BASE_REFUSALS, DIAL_FAIL_CODES, DIAL_REFUSAL_CODES, DIAL_ROW_STATES, DIAL_REASONS,
  UP_LOST_MS, DETAIL_MAX, HEADER_MAX, HISTORY_MAX, CHECK_EXITS,
  hostOf, dialUrlOf, dialBaseOfUrl, DIAL_BASE_MAX, dialAddressCandidates, dialBaseVerdict, ipv4Class, isLoopbackBase, isLoopbackAddress, bindAdmits, dialDefaultChoice, baseOfDialedHost, authorityOf,
  dialFailureOf, dialHeadersOf, parseDialHeaders, refusalSentence, nextDialStatus, dialLogLine,
  dialCheckLines, dialReasonOf, dialRowState, inPlacePushVerdict, duplicateDialVerdict, DUP_NOTE_MS, refusalBudget, refusalAddressKey, REFUSAL_BUDGET,
  sshInstallInvocation, deviceIdOf, pairNameShown, pairNameVerdict, pairRequestVerdict, DAEMON_PLATFORMS, commandOsOf,
};
