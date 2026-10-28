/**
 * THE SAME-ORIGIN RULE FOR COOKIE WRITES (lane owner-write-origin, B-6b2b — rel249 verify #7) — PURE, imports nothing.
 *
 * The owner's browser holds the instance's authority in a cookie (or, on a local instance with no sign-in, in its
 * network position). A page on ANOTHER site can make that browser send a write — a form POST, a no-cors fetch, a
 * WebSocket handshake — and the cookie rides along whenever SameSite lets it: always on a same-site sibling (the
 * fleet's pods share one registrable domain), never-asked on an instance without sign-in. The browser tells us where
 * the request came from (Fetch Metadata, `Sec-Fetch-Site`; `Origin` on every cross-origin write), and a page cannot
 * forge either. The rule (the standard resource-isolation policy):
 *   - judged: POST / PUT / PATCH / DELETE and a WebSocket handshake (`Upgrade`) — GET / HEAD / OPTIONS never (a read
 *     changes nothing; a link from another site still opens a page)
 *   - not the cookie's authority ⇒ not judged: `Authorization: Bearer …` (the owner's / an agent's vsst_ / a job's jbt_
 *     token — a browser never attaches one by itself, and a cross-site script cannot without a CORS preflight this
 *     server never answers)
 *   - `Sec-Fetch-Site` present ⇒ it decides: same-origin / none ⇒ allowed; same-site / cross-site ⇒ refused
 *   - else `Origin` present ⇒ allowed only when it IS this request's own origin (`null` never is)
 *   - neither header ⇒ allowed: not a browser (curl, node, the CLIs) — every browser sends one of them on a
 *     cross-origin write
 * The doors that are no cookie's (/hook, /api/agent/, /dav, /svc, …) are the auth layer's list; they never reach this.
 */

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HOST_RE = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9][A-Za-z0-9.-]*)(:\d{1,5})?$/;
const first = (v) => String(v == null ? '' : v).split(',')[0].trim();
const UPGRADE_PROTO = Object.freeze({ ws: 'http', wss: 'https' }); // Traefik forwards a WebSocket upgrade's proto as ws / wss

/** `scheme://host[:port]`, lower-cased, the scheme's default port dropped; '' when it is not an http(s) origin. */
function normOrigin(o) {
  const m = /^(https?):\/\/([^/?#\s]+)$/i.exec(String(o == null ? '' : o).trim());
  if (!m || !HOST_RE.test(m[2])) return '';
  const scheme = m[1].toLowerCase();
  let host = m[2].toLowerCase();
  if ((scheme === 'http' && host.endsWith(':80')) || (scheme === 'https' && host.endsWith(':443'))) host = host.replace(/:\d+$/, '');
  return `${scheme}://${host}`;
}

/**
 * THE request's own origin, as the browser addressed it — behind the reverse proxies exactly as they forward it: the
 * first `X-Forwarded-Proto` (else https on a TLS socket — the hub's own https, src/server/tls.js — else http) and the
 * first `X-Forwarded-Host` (else `Host`). Tailscale serve, the fleet's ingress and frp keep Host and add the forwarded
 * pair; plain http on localhost has neither. '' when the host is no host. A WebSocket UPGRADE through Traefik (the
 * fleet's ingress) arrives with `X-Forwarded-Proto: ws` / `wss` — the page's scheme is http / https (2.369.275: a
 * .274 fleet instance refused every /ws handshake of its own page as cross-site, own '').
 */
function ownOriginOf(headers, { encrypted = false } = {}) {
  const h = headers || {};
  const fwd = (first(h['x-forwarded-proto']) || (encrypted ? 'https' : 'http')).toLowerCase();
  const proto = UPGRADE_PROTO[fwd] || fwd; // a WebSocket upgrade's forwarded scheme names the page's
  const host = first(h['x-forwarded-host']) || first(h.host);
  if (!/^https?$/.test(proto) || !host) return '';
  return normOrigin(`${proto}://${host}`);
}

/**
 * The verdict for ONE request: { ok, why, origin?, own? }. `why`: 'read' | 'token' | 'same-origin' | 'none' |
 * 'no-browser' | 'origin' (allowed: Origin is ours) — or, refused: 'cross-site' | 'same-site' | 'origin' (a foreign
 * Origin) | 'null-origin'. `origin` = what the request offered, `own` = ours.
 */
function crossSiteVerdict({ method = 'GET', headers = {} } = {}, own = '') {
  const h = headers || {};
  if (!WRITES.has(String(method).toUpperCase()) && !h.upgrade) return { ok: true, why: 'read' };
  if (/^Bearer\s+\S/i.test(String(h.authorization || ''))) return { ok: true, why: 'token' };
  const offered = h.origin == null ? null : String(h.origin);
  const site = String(h['sec-fetch-site'] || '').toLowerCase();
  if (site === 'same-origin' || site === 'none') return { ok: true, why: site };
  if (site === 'same-site' || site === 'cross-site') return { ok: false, why: site, origin: offered, own: normOrigin(own) || null };
  if (offered === null) return { ok: true, why: 'no-browser' };
  const ours = normOrigin(own);
  if (ours && normOrigin(offered) === ours) return { ok: true, why: 'origin' };
  return { ok: false, why: offered.trim().toLowerCase() === 'null' ? 'null-origin' : 'origin', origin: offered, own: ours || null };
}

/**
 * THE STRICT FORM (lane vault-e2e-password — the vault's person doors): `crossSiteVerdict` lets a browser-less write through
 * (no Origin and no Sec-Fetch-Site — a script on an instance nobody signs in to); a door that must be a PERSON on THIS
 * instance's own page asks this one instead: Sec-Fetch-Site same-origin, or (a browser that sends no Sec-Fetch-Site) an
 * Origin equal to `own`. → `{ ok, why }` — why ∈ same-origin | origin | same-site | cross-site | none | no-browser.
 */
function pageVerdict(headers = {}, own = '') {
  const h = headers || {};
  const site = String(h['sec-fetch-site'] || '').toLowerCase();
  if (site) return site === 'same-origin' ? { ok: true, why: 'same-origin' } : { ok: false, why: site };
  const offered = h.origin == null ? '' : normOrigin(String(h.origin));
  const ours = normOrigin(own);
  return ours && offered && offered === ours ? { ok: true, why: 'origin' } : { ok: false, why: offered ? 'origin' : 'no-browser' };
}

/** lane owner-press-attended: A PERSON'S PRESS CARRIES NO BEARER. An ATTENDED door — a press the spend ceiling neither
 *  refuses nor counts (src/spend-authorizer.js `attended`) — refuses EVERY `Authorization: Bearer …` by name: an agent's
 *  vsst_, a Background Work job's jbt_, an automation key's vsak_. The owner's page never sends one (its credential is the
 *  cookie — src/auth.js reads nothing else), so this refuses no person. scripts/test-spend-paths.mjs §2b reads every
 *  attended door for it. */
const PRESS_BEARER_RE = /^Bearer\s+\S/i;
function pressBearer(headers) { return PRESS_BEARER_RE.test(String((headers && headers.authorization) || '')); }

/** lane owner-press-attended r2: THE PRESS — what makes a turn ATTENDED. The acceptance measured a header-less `curl`
 *  (no bearer, no Origin, no Sec-Fetch-Site) pressing «Hand over now» free and unstamped with sign-in OFF: `crossSiteVerdict`
 *  lets a browser-less write through by design. So an attended turn needs a PRESS, and only a door mints one —
 *  `pressOf(req)`: no bearer AND the STRICT page verdict (`pageVerdict`: a person on THIS instance's own page). The door
 *  hands it down with its engine call as `pressed`; every attended site selects its attended reason only on
 *  `isPress(pressed)` (else its gated twin). The value is an IDENTITY no JSON can forge — a body, an agent's payload, a
 *  record re-read from disk never carries one (`toJSON` drops it) — so the ONLY road to an attended turn is a door that
 *  minted it. scripts/test-spend-paths.mjs §2b derives the doors from the `pressOf(` calls, walks every `pressed` hop
 *  from each attended site back to them, and reads each door for its bearer refusal. (A script that FORGES browser
 *  headers is a person to this check — with sign-in OFF anything local can also rewrite the settings; the line this
 *  draws is that nothing makes a free turn by leaving a header OUT.) */
const PRESS = Object.freeze({ toJSON: () => undefined });
function pressOf(req) {
  const h = (req && req.headers) || {};
  if (pressBearer(h)) return null;
  return pageVerdict(h, ownOriginOf(h, { encrypted: !!(req && req.socket && req.socket.encrypted) })).ok ? PRESS : null;
}
const isPress = (x) => x === PRESS;

module.exports = { crossSiteVerdict, pageVerdict, ownOriginOf, normOrigin, WRITES, pressBearer, pressOf, isPress };
