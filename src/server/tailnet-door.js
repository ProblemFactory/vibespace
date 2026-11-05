'use strict';
/**
 * ORCH — THE TAILNET DOOR (lane tailnet-names, 2026-11-05 — userW: «装了 Tailscale 插件，https://<host>:8006/ 无法解析»).
 * The rule is PURE src/tailnet-reach.js; the plugin is asked through `reach` (PluginManager.tunnelReach: the Tailscale plugin's
 * own table — its peers AND Self, the suffix, the sign-in state, the mode, the proxy ports — sync, cached) and `fresh`
 * (tunnelReachFresh: the same answer AFTER one bounded status read when the table is stale — a hub that just restarted knows
 * its persisted table at once and waits ≤ 2 s for the live one). The container's resolver is never touched
 * (src/tailscale-dns.js, the 2026-10-19 law).
 * ROUND 2 — THE ROAD IS ADDED, NEVER A GATE: a current device goes through Tailscale; every other host takes the ordinary road
 * unchanged; LAW 2's words only ever EXPLAIN a failure, by its cause.
 * ROUND 3 — THE DOOR IS NEVER A WAY BACK INTO THE HUB, AND LISTENS ONLY WHILE THE ROAD IS ON: a name it does not list is
 * resolved FIRST and refused when an answer is loopback / unspecified / link-local / a metadata address / Tailscale's own
 * service address / one of this hub's own addresses (the vetted address is the one dialled — no second lookup); a device only
 * at its tailnet address; it listens while our plugin is up with the row on (closed when either goes off — the plugin's every
 * change asks it — and never opened at a boot with the plugin down); the PAC sits on `/tailnet-<token>.pac` (a random token
 * kept with the port — a browser that outlived a restart re-fetches it — never logged, never in an answer); a launch and the
 * PAC it causes share ONE status read.
 * ROUND 4 — EVERY INPUT OF THE ROAD REACHES THE DOOR: follow(plugins) is the ONE wiring (mounts-plugins-wiring) — the door asks
 * the PluginManager for the road and follows it through ONE subscription, plugins.watch: the plugin's state (its every
 * broadcast — a start, a stop, a sign-in) AND its rows written through the settings store (the row «Reach tailnet hosts from
 * browsers» is `apply: 'server'` — before r4 its write reached nothing); the built-in plugin has no uninstall (its removal from
 * the road IS a stop). A PAC asked while the road is off is ANSWERED (a clean 404 — a failed fetch Chrome asks again in 8 s /
 * 32 s / 2 min, so the road back on is picked up; an empty 200 would be a success it keeps 12 h), then the door closes; a
 * verdict that outlived its client dials nothing; the token is never in a browser view (src/server/browser-keeper.js
 * browserView: the stamp's {on, mode, why}); the detail line drops Node's hint by its own words, never a host's «node».
 * ROUND 5 — THE REFUSAL REACHES THE CLIENT: a request the road went off under (before its verdict, or while its name was
 * looked up) is ANSWERED — a 403 in the person's words, in the owner's language, by the input that is off — and the door
 * closes only once that answer is out (the verdict's `answered`, egress-proxy.js); a client that leaves is never a device's
 * failure (egress-proxy.js). An input switched off (the row, the plugin's stop) still cuts every connection at once.
 * The doors a tailnet host is reached through, BY NAME:
 *
 *   THE PAC + THE KERNEL DOOR — one loopback HTTP server per hub (an egress-proxy.js instance, tag `tailnet`), started at the
 *     first browser launch that needs it and again (on its kept port) whenever the road comes back on:
 *       GET /tailnet-<token>.pac — what every tailnet-reaching Chrome starts with (`--proxy-pac-url=http://127.0.0.1:<port>/
 *         tailnet-<token>.pac`, comma-free: it rides the browser driver's ONE args line and the attach argv alike), written
 *         LIVE from a SETTLED table: the current devices' names (+ their addresses in userspace) → the plugin's SOCKS5
 *         (userspace) / this door (kernel); everything else DIRECT. Served only to a loopback Host (421), `nosniff`; any other
 *         path 404;
 *       CONNECT / absolute-form GET — kernel mode: a device's NAME is resolved from the table (never the system resolver) and
 *         dialled at its tailnet address (the tunnel routes it); a name the table does not list (a PAC older than a table
 *         change) is resolved by DNS and dialled at the address vetted — never a 403 for a public answer; an upstream failure
 *         is remembered (its cause names the words).
 *   launch({explicit, engine, remote, label}) — the keeper asks it at a local launch → {on, mode, why, arg}: the one switch, or
 *     why not (a proxy of the browser's own WINS — the PAC is never added beside one; not signed in ⇒ no PAC).
 *   agents() / embedded(unblocker) — the in-page browser (/proxy, node-unblocker; keep-alive agents as Node's own): a device in
 *     kernel mode connects to the table's address (TLS still checked against the NAME), in userspace through the plugin's HTTP
 *     proxy (CONNECT); everything else the ordinary road; a FAILED request on a tailnet host answers LAW 2's page (the cause, in
 *     the owner's language, the error's code + its plain words under it), any other failure the base's own error.
 *   missFor(url, {launched, failed, cause, audience}) — the agent browser's navigate answer (the audit route) says why, by name.
 *
 * The module holds ONE shared door (follow(plugins) at boot — mounts-plugins-wiring: configure() + the ONE subscription that
 * calls roadChanged(); unconfigured, nothing answers: no plugin); create() makes an independent one (the suites).
 */
const fs = require('fs');
const os = require('os');
const dns = require('dns');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const TR = require('../tailnet-reach.js');
const EgressProxy = require('./egress-proxy.js');

const STATE_FILE = 'tailnet-door.json';
const HEAD_MAX = 16 * 1024;
const SAY_WINDOW_MS = 10 * 60 * 1000; // a console line is said once per profile/host + reason per 10 minutes — never per request
const SETTLE_MS = 2000; // the longest a launch + its PAC / a /proxy request wait for a stale table's ONE status read
const HUNG_KEEP_MS = 30 * 1000; // a read that did not answer in its bound: the persisted table serves at once for this long
const FAIL_KEEP_MS = 60 * 1000; // an upstream failure names a browser's tunnel error for a minute
// Node's own agents' options (Node 24: keepAlive, lifo, the 5 s idle timeout, its proxy env) — the door's keep them
const AGENT_KEYS = ['keepAlive', 'keepAliveMsecs', 'scheduling', 'timeout', 'maxSockets', 'maxFreeSockets', 'maxTotalSockets', 'noDelay', 'proxyEnv'];
const agentOptions = (global) => { const o = {}; for (const k of AGENT_KEYS) if (global && global.options && global.options[k] !== undefined) o[k] = global.options[k]; return { ...o, keepAlive: true }; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the console's short reason a launch went without the PAC (said once per profile and reason per window)
const LAUNCH_WHY = Object.freeze({ 'plugin-off': 'the Tailscale plugin is off', setting: 'Reach tailnet hosts from browsers is off (⚙ → Plugins → Tailscale)', 'explicit-proxy': 'it has a proxy of its own, which wins', 'signed-out': 'Tailscale is not signed in', starting: 'Tailscale is still starting' });
// why a vetted address is never this door's target (src/tailnet-reach.js vetAddress) — the 403's words
const VET_WORDS = Object.freeze({ loopback: 'a loopback address', unspecified: 'an unspecified address (this machine)', 'link-local': 'a link-local address', metadata: 'a cloud metadata address', 'tailscale-service': 'Tailscale\'s own service address', 'this-hub': 'one of this machine\'s own addresses', 'not-tailnet': 'not a tailnet address', 'not-an-address': 'no usable address' });
/** an upstream error → the code its words follow (a bare timeout has none) */
const codeOf = (e) => (e && e.code) || (/timed? ?out/i.test(String(e && e.message)) ? 'ETIMEDOUT' : 'ETAILNET');
/** the HTTP proxy's refusal head/body → the code (tailscaled says why in words) */
const sniffCode = (text) => (/connection refused/i.test(text) ? 'ECONNREFUSED' : /no such host|unknown host|not found/i.test(text) ? 'ENOTFOUND' : /time(d)? ?out|deadline/i.test(text) ? 'ETIMEDOUT' : /unreachable/i.test(text) ? 'EHOSTUNREACH' : 'ETAILNET');
/** Node's developer hints, BY THEIR OWN WORDS (Node 24 appends «; if the root CA is installed locally, try running Node.js with
 *  --use-system-ca» to an unknown issuer) — never a clause for holding «node» or «--» (a host pve-node-2 / node-3 / xn--… keeps
 *  its text) */
const NODE_HINTS = [/;?\s*(?:if the root CA is installed locally, )?try running Node\.js with\s+--[a-z][a-z-]*\.?/gi];
/** an error's detail line for a PERSON: its code + the message's own words, Node's hint dropped (r4) */
const plainDetail = (err) => {
  if (!err) return '';
  const said = NODE_HINTS.reduce((t, re) => t.replace(re, ''), String(err.message || '')).replace(/[;\s]+$/, '').trim();
  return `${err.code || ''}${err.code && said ? ' — ' : ''}${said}`.slice(0, 300);
};
/** this hub's own interface addresses (a name answering one of them is a way back into the hub) */
const ownAddresses = () => { try { return Object.values(os.networkInterfaces()).flat().map((i) => i && i.address).filter(Boolean); } catch { return []; } };
const mintToken = () => crypto.randomBytes(16).toString('hex');

function create({ dataDir = null, reach = () => null, fresh = null, settleMs = SETTLE_MS, log = console, lang = () => 'en', dial = null, lookup = null, ownAddrs = ownAddresses, connectTimeoutMs = 10000, cacheMs = 1000, sayWindowMs = SAY_WINDOW_MS } = {}) {
  let cached = null, cachedAt = 0;
  const take = (r) => { cached = r; cachedAt = Date.now(); return r; };
  /** the plugin's answer, read at most once per `cacheMs` (an embedded page asks per resource); `now` = past the cache */
  const reachNow = ({ now = false } = {}) => {
    if (!now && cachedAt && Date.now() - cachedAt < cacheMs) return cached;
    let r = null;
    try { r = reach() || null; } catch { r = null; }
    return take(r);
  };
  const said = new Map();
  /** a console line once per key per window (a flapping plugin, a page of 50 resources: one line) */
  const sayOnce = (key, line) => {
    const t = Date.now(), at = said.get(key);
    if (at !== undefined && t - at < sayWindowMs) return;
    if (said.size > 500) for (const [k, v] of said) if (t - v >= sayWindowMs || said.size > 500) said.delete(k);
    said.set(key, t);
    try { log.log?.(`[tailnet] ${line}`); } catch { /* none */ }
  };
  /** THE SETTLED TABLE: a stale one (a restart, a minute old) waits for ONE bounded status read — SHARED by every caller while
   *  it is pending (a launch and the PAC its Chrome fetches right after wait once, together); a read that did not answer in its
   *  bound is known hung: the persisted table serves at once (for HUNG_KEEP_MS) — said once, «names as of» */
  let inflight = null, hungAt = 0;
  const reachSettled = async () => {
    let r = reachNow();
    if (r && r.up && r.stale && typeof fresh === 'function' && !(hungAt && Date.now() - hungAt < HUNG_KEEP_MS)) {
      if (!inflight) {
        const me = { at: Date.now(), p: Promise.resolve().then(() => fresh(settleMs)).then((f) => (f ? take(f) : null), () => null) };
        inflight = me;
        me.p.then(() => { if (inflight === me) inflight = null; });
      }
      const left = inflight.at + settleMs - Date.now();
      const f = left > 0 ? await Promise.race([inflight.p, new Promise((res) => { const t = setTimeout(() => res(null), left); if (t.unref) t.unref(); })]) : null;
      if (f) r = f;
      hungAt = !f || f.stale ? Date.now() : 0;
    }
    if (r && r.up && r.stale && Number(r.at) > 0) sayOnce('as-of', `names as of ${new Date(Number(r.at)).toISOString()} — Tailscale's status did not answer in ${settleMs} ms; the last table it gave serves`);
    return r;
  };
  const langNow = () => { try { return lang() || 'en'; } catch { return 'en'; } };
  const stateFile = dataDir ? path.join(dataDir, STATE_FILE) : null;
  /** the kept port + the PAC's token (data/tailnet-door.json, 0600 — the hub's own state) */
  const kept = () => { try { const j = JSON.parse(fs.readFileSync(stateFile, 'utf8')); const p = Number(j.port); return { port: Number.isInteger(p) && p > 0 && p < 65536 ? p : 0, token: TR.pacPath(j.token) ? String(j.token) : '' }; } catch { return { port: 0, token: '' }; } };
  const keep = (state) => {
    if (!stateFile) return;
    try { const tmp = `${stateFile}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(state) + '\n', { mode: 0o600 }); fs.renameSync(tmp, stateFile); } catch (e) { sayOnce('keep', `its port could not be kept in ${stateFile} (${e && e.message}) — a browser that outlives a restart reaches tailnet hosts again at its next start`); }
  };
  let px = null, starting = null, token = '', wanted = false;
  const port = () => (px ? px.port() : null);
  // an upstream failure the door saw (host:port → its code) — names the tunnel error a browser reports for it
  const fails = new Map();
  const remember = (host, p, e) => { const key = `${TR.hostOf(host)}:${Number(p) || 0}`; if (fails.size > 200) fails.delete(fails.keys().next().value); fails.set(key, { code: codeOf(e), at: Date.now() }); };
  const recalled = (url) => { const f = fails.get(`${TR.hostOf(url)}:${TR.portOf(url)}`); return f && Date.now() - f.at < FAIL_KEEP_MS ? f.code : null; };

  // ── the PAC + the kernel door ──
  const pacText = (r) => TR.pacFor(TR.pacDevices(r), TR.pacTarget(r, port()), { addresses: !!(r && r.up && r.mode === 'userspace'), asOf: r && r.stale ? r.at : 0 });
  const loopHost = (h) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(String(h || ''));
  const isPac = (p) => { const want = TR.pacPath(token); return !!want && p.length === want.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(want)); };
  /** every ORIGIN-form request: the PAC on its token path (a loopback Host only), any other path 404 */
  const serve = (req, res) => {
    const at = String(req.url || '').split('?')[0];
    const head = (code, type, body) => { try { res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), Connection: 'close' }); res.end(body); } catch { /* gone */ } };
    if (!['GET', 'HEAD'].includes(req.method) || !isPac(at)) { head(404, 'text/plain; charset=utf-8', 'not found\n'); return true; }
    if (!loopHost(req.headers.host)) { head(421, 'text/plain; charset=utf-8', 'the tailnet PAC is served to this machine\'s browsers only\n'); return true; }
    // r4: the road went off without a word (a daemon that died): this PAC is ANSWERED first — a clean 404 (a failed fetch: Chrome
    // goes direct and asks again in 8 s, 32 s, 2 min — the road back on is picked up; a 200 listing nothing is a success it keeps
    // 12 h) — and the door closes once the answer is out or its client left (never a reset)
    if (!TR.roadOn(reachNow())) { res.once('close', () => sync()); head(404, 'text/plain; charset=utf-8', 'reaching Tailscale devices from browsers is off — this PAC is served again once it is back on\n'); return true; }
    reachSettled().then((r) => r, () => null).then((r) => {
      const body = pacText(r);
      try { res.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), Connection: 'close' }); res.end(req.method === 'HEAD' ? undefined : body); } catch { /* gone */ }
    });
    return true;
  };
  /** a name's addresses (the suite's `lookup` seam, else the system's) */
  const lookupAll = (name) => new Promise((resolve, reject) => {
    try { (lookup || dns.lookup)(name, { all: true }, (e, as) => (e ? reject(e) : resolve((Array.isArray(as) ? as : [as]).map((x) => (x && typeof x === 'object' ? x.address : x)).filter((x) => typeof x === 'string' && x)))); } catch (e) { reject(e); }
  });
  const refusal = (why) => ({ allow: false, why });
  /** r4: the road is off — said by its input (the plugin off, the row off), and the door closes; r5: in the person's words (LAW 2's
   *  sentence for that input, the owner's language), and the door closes only AFTER the 403 is out (egress-proxy's `answered`) */
  const offRoad = (r, h) => {
    const why = TR.downWhy(r);
    return { ...refusal(TR.wordsFor(TR.WORDS.en[why] ? why : 'plugin-off', { host: h, what: net.isIP(String(h)) ? 'address' : 'name', lang: langNow() }).text), answered: () => sync() };
  };
  // THE DOOR CARRIES NAMES ONLY, NEVER BACK INTO THE HUB: an address / loopback name is refused as asked; a device's name goes to
  // its tailnet address (the table's); any other name is resolved FIRST and refused when an answer is no target (vetAddress) —
  // `to` = the vetted address the upstream dials (no second lookup); a name that does not resolve is an upstream failure
  const allow = (host) => {
    const h = TR.hostOf(host);
    const r = reachNow();
    if (!TR.roadOn(r)) return offRoad(r, h || host);
    if (!h || /^(localhost|.*\.localhost)$/.test(h) || /^[\d.]+$/.test(h) || h.includes(':')) return refusal(`${h || 'that host'} is not a tailnet name — this door carries names only`);
    const route = TR.routeFor(h, r, { via: 'browser' });
    if (route.startsWith('resolve:')) { const ip = route.slice(8), bad = TR.vetAddress(ip, { device: true }); return bad ? refusal(`${h} is listed at ${ip} — ${VET_WORDS[bad]}: this door is never a way back into the hub`) : { allow: true, to: ip }; }
    return lookupAll(h).then((addrs) => {
      const r2 = reachNow({ now: true });
      if (!TR.roadOn(r2)) return offRoad(r2, h); // r4: the road went off while the name was looked up — nothing dialled
      let own = [];
      try { own = ownAddrs() || []; } catch { own = []; }
      const bad = addrs.map((a) => [a, TR.vetAddress(a, { own })]).find(([, w]) => w);
      if (bad) return refusal(`${h} resolves to ${bad[0]} — ${VET_WORDS[bad[1]]}: this door is never a way back into the hub`);
      return addrs.length ? { allow: true, to: addrs[0] } : { allow: true, error: Object.assign(new Error(`${h} has no address`), { code: 'ENOTFOUND' }) };
    }, (e) => ({ allow: true, error: e }));
  };
  /** the vetted address → where the door dials (`dial` maps it in a suite: the tunnel there is a loopback server) */
  const resolve = (to) => (dial ? dial(to) : to);
  /** an admitted host's upstream failure: remembered; an absolute-form GET's 502 is LAW 2's page */
  const failed = (host, p, e) => {
    remember(host, p, e);
    const m = TR.missFor(`http://${host}:${p}/`, reachNow(), { via: 'browser', failed: true, cause: codeOf(e), lang: langNow(), audience: 'agent' });
    return m ? { type: 'text/html; charset=utf-8', body: pageHtml(m, e) } : null;
  };
  // a refused target's line: once per host per window (never per request — a page polling it floods nothing)
  const doorLog = { log: (line) => { const m = /refused (?:CONNECT )?(\S+?)(?::\d+)?: /.exec(String(line)); sayOnce(`door:${m ? m[1] : line}`, String(line).replace(/^\[tailnet\] /, '')); } };
  const mkProxy = () => EgressProxy.create({ allow, resolve, serve, failed, log: doorLog, tag: 'tailnet', connectTimeoutMs });
  async function ensure() {
    wanted = true;
    if (px) return px.port();
    if (starting) return starting;
    starting = (async () => {
      const k = kept();
      let p = mkProxy();
      let got = 0;
      if (k.port) { try { got = await p.listen({ port: k.port }); } catch (e) { sayOnce(`port:${k.port}`, `its kept port ${k.port} is taken (${(e && (e.code || e.message)) || 'refused'}) — a new one; a browser started before reaches tailnet hosts again at its next start`); p = mkProxy(); got = 0; } }
      if (!got) got = await p.listen({ port: 0 });
      token = got === k.port && k.token ? k.token : mintToken(); // the token rides with its port: a new port, a new token
      px = p;
      if (got !== k.port || token !== k.token) keep({ port: got, token });
      sayOnce(`open:${got}`, `the door listens on 127.0.0.1:${got} while Tailscale devices are reached from browsers`);
      return got;
    })().finally(() => { starting = null; });
    return starting;
  }
  async function close() { const p = px; px = null; if (p) await p.close({ cut: true }); } // its tunnels end with it
  /** THE DOOR LISTENS ONLY WHILE THE ROAD IS ON: open (its kept port, its token) when the road is on and a door ran before or a
   *  launch asked for it; closed when the plugin stops or the row goes off — serialised (a flap ends where the road is) */
  let syncing = Promise.resolve(); // synced() — the last follow of the road, done (a suite waits on it; it never starts one)
  function sync() {
    syncing = syncing.then(async () => {
      const r = reachNow({ now: true });
      if (TR.roadOn(r)) { if (!px && (wanted || kept().port)) await ensure(); return; }
      if (starting) { try { await starting; } catch { /* closed below */ } }
      if (px) { await close(); sayOnce('closed', 'the door closed — reaching Tailscale devices from browsers is off (the plugin stopped, or «Reach tailnet hosts from browsers» is off); it opens again once it is back on'); }
    }).catch((e) => sayOnce('sync', `the door could not follow the road (${e && e.message})`));
    return syncing;
  }
  /** at boot: a door that ran before listens again on its kept port — only while the road is on (never with the plugin down) */
  function boot() { return stateFile ? sync() : Promise.resolve(); }

  /** THE LAUNCH VERDICT the keeper asks at a local Chrome launch → {on, mode, why, arg} — over a SETTLED table (the PAC this
   *  browser fetches right after carries the names: Chrome keeps it for the browser's life) */
  async function launch({ explicit = false, engine = false, remote = false, label = '' } = {}) {
    const r = await reachSettled();
    const v = TR.launchFor(r, { explicit, engine, remote });
    if (!v.on) {
      const r0 = TR.reachOf(r);
      const said0 = r0 && (v.why === 'plugin-off' ? r0.known.length > 0 : ['setting', 'explicit-proxy', 'signed-out', 'starting'].includes(v.why) && r0.up);
      if (said0 && LAUNCH_WHY[v.why]) sayOnce(`launch:${v.why}:${label}`, `"${String(label).slice(0, 80)}" starts without tailnet reach — ${LAUNCH_WHY[v.why]}`);
      return { on: false, mode: v.mode, why: v.why, arg: null };
    }
    let p;
    try { p = await ensure(); } catch (e) { sayOnce('listen', `the door could not listen (${e && e.message}) — browsers start without tailnet reach`); return { on: false, mode: v.mode, why: 'door', arg: null }; }
    return { on: true, mode: v.mode, why: null, arg: TR.pacArg(p, token) };
  }
  /** LAW 2 for one FAILED url (the audit route: audience 'agent' — never the device list); a browser's tunnel error is named
   *  by the upstream failure this door saw for that host and port */
  function missFor(url, { launched = undefined, failed: f = false, cause = null, via = 'browser', lang: l = 'en', audience = 'agent' } = {}) {
    const c = TR.causeOf(cause) === 'tunnel' ? recalled(url) || cause : cause;
    return TR.missFor(url, reachNow(), { via, launched, failed: f, cause: c, lang: l, audience });
  }

  // ── the in-page browser (/proxy) ──
  /** a socket to `host:port` through the plugin's HTTP proxy (userspace): CONNECT, then TLS over it for https */
  function tunnel(options, cb, secure, r) {
    const host = String(options.host || options.hostname || ''), portN = Number(options.port) || (secure ? 443 : 80);
    const s = net.connect({ host: '127.0.0.1', port: r.ports.http });
    let buf = Buffer.alloc(0), done = false;
    const fail = (e) => { if (done) return; done = true; clearTimeout(t); try { s.destroy(); } catch { /* gone */ } cb(e); };
    const t = setTimeout(() => fail(Object.assign(new Error(`${host}:${portN} did not answer through Tailscale in ${connectTimeoutMs} ms`), { code: 'ETIMEDOUT' })), connectTimeoutMs);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) { if (buf.length > HEAD_MAX) fail(Object.assign(new Error('the Tailscale HTTP proxy sent no answer head'), { code: 'ETAILNET' })); return; }
      const head = buf.subarray(0, i).toString('latin1'), rest = buf.subarray(i + 4);
      if (!/^HTTP\/1\.[01] 200\b/.test(head)) { const said0 = `${head.split('\r\n')[0]} ${rest.toString('utf8').slice(0, 300)}`; return fail(Object.assign(new Error(`the Tailscale HTTP proxy could not reach ${host}:${portN} (${said0.trim().slice(0, 160)})`), { code: sniffCode(said0) })); }
      s.removeListener('data', onData);
      done = true; clearTimeout(t);
      s.removeListener('error', fail);
      if (rest.length) s.unshift(rest);
      if (!secure) return cb(null, s);
      cb(null, tls.connect({ ...options, socket: s, servername: options.servername || (net.isIP(host) ? undefined : host) }));
    };
    s.once('connect', () => { try { s.write(`CONNECT ${host}:${portN} HTTP/1.1\r\nHost: ${host}:${portN}\r\n\r\n`); } catch (e) { fail(e); } });
    s.on('error', fail);
    s.on('data', onData);
  }
  /** a suite's `lookup` whose answers go through its `dial` too (DNS answers an address; the suite's network maps it) */
  const dialled = (lk) => (h, o, cb) => lk(h, o, (e, a, fam) => (e ? cb(e) : Array.isArray(a) ? cb(null, a.map((x) => ({ ...x, address: dial ? dial(x.address) : x.address }))) : cb(null, dial ? dial(a) : a, fam)));
  /** an agent's createConnection: the route of THIS host decides (`base` = the agent's own — the ordinary road) */
  function connect(options, cb, secure, base) {
    const host = String(options.host || options.hostname || '');
    const r = reachNow();
    const route = TR.routeFor(host, r, { via: 'embedded' });
    if (route.startsWith('resolve:')) { const ip = route.slice(8); return base({ ...options, host: dial ? dial(ip) : ip, ...(secure ? { servername: options.servername || host } : {}) }, cb); }
    if (route === 'http-proxy') { tunnel(options, cb, secure, TR.reachOf(r)); return undefined; }
    if (!lookup && !dial) return base(options, cb); // THE ORDINARY ROAD, unchanged
    return base({ ...options, ...(lookup ? { lookup: dialled(lookup) } : {}), ...(dial && net.isIP(host) ? { host: dial(host) } : {}) }, cb); // (a suite's seams: `lookup` answers a name, `dial` maps an address)
  }
  const mkAgent = (secure, route) => { const a = new (secure ? https.Agent : http.Agent)(agentOptions(secure ? https.globalAgent : http.globalAgent)); const base = a.createConnection.bind(a); a.createConnection = (o, cb) => route(o, cb, secure, base); return a; };
  const pageHtml = (m, err) => {
    const detail = plainDetail(err);
    return `<!doctype html><html lang="${esc(m.lang)}"><head><meta charset="utf-8"><title>Tailscale</title></head><body style="font:15px/1.5 system-ui,sans-serif;margin:2em;color:#333"><p data-tailnet="${esc(m.why)}">${esc(m.text)}</p>${detail ? `<p data-error="${esc((err && err.code) || '')}" style="color:#777;font-size:13px">${esc(detail)}</p>` : ''}</body></html>`;
  };
  function page(res, m, err) {
    const body = pageHtml(m, err);
    try { res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' }); res.end(body); } catch { /* gone */ }
  }
  /** the /proxy middleware: a tailnet-looking host's road is chosen over a SETTLED table; a FAILED request on a tailnet host
   *  answers LAW 2's page (the cause; the error's code + plain words under it); anything else is the base's unchanged */
  function embeddedOf(unblocker, { prefix = '/proxy/' } = {}) {
    return function tailnetEmbedded(req, res, next) {
      const u = String(req.url || '');
      if (!u.startsWith(prefix)) return unblocker(req, res, next);
      const target = u.slice(prefix.length);
      const go = () => unblocker(req, res, (err) => {
        if (!err) return next();
        const m = TR.missFor(target, reachNow(), { via: 'embedded', failed: true, cause: codeOf(err), lang: langNow(), audience: 'owner' });
        if (m && !res.headersSent) return page(res, m, err);
        return next(err);
      });
      if (!TR.maybeTailnet(target, reachNow())) return go();
      reachSettled().then(go, go);
      return undefined;
    };
  }
  return { ensure, boot, sync, synced: () => syncing, close, launch, missFor, connect, agents: () => ({ httpAgent: mkAgent(false, connect), httpsAgent: mkAgent(true, connect) }), embedded: embeddedOf, pacText: () => pacText(reachNow()), settled: reachSettled, port, reach: reachNow, url: () => (px && TR.pacPath(token) ? `http://127.0.0.1:${px.port()}${TR.pacPath(token)}` : null) };
}

// ── THE SHARED DOOR (one per hub) ──
let shared = null, sharedOpts = {};
/** at boot (mounts-plugins-wiring): the plugin's reach + its fresh read, the data dir, the owner's language → the shared door, booted */
function configure(opts = {}) { const prev = shared; shared = null; sharedOpts = opts || {}; if (prev) prev.close().catch(() => { }); const d = instance(); d.boot(); return d; }
function instance() { if (!shared) shared = create(sharedOpts); return shared; }
/** an input of the road moved (follow()'s subscription): the door follows the road (open while it is on, closed when it is off);
 *  nothing before configure() */
function roadChanged() { if (shared) shared.sync(); }
let unfollow = null;
/** r4 — THE WIRING (mounts-plugins-wiring, at boot): the shared door over a PluginManager — the road asked through tunnelReach /
 *  tunnelReachFresh, and EVERY input of it followed through ONE subscription (plugins.watch: the plugin's every broadcast — a
 *  start, a stop, a sign-in — and its rows written through the settings store: «Reach tailnet hosts from browsers» is an
 *  `apply: 'server'` row nobody re-applies) */
function follow(plugins, { dataDir, lang, log } = {}) {
  if (unfollow) { try { unfollow(); } catch { /* gone */ } unfollow = null; }
  const d = configure({ dataDir, reach: () => plugins.tunnelReach(), fresh: (ms) => plugins.tunnelReachFresh(ms), ...(lang ? { lang } : {}), ...(log ? { log } : {}) });
  unfollow = plugins.watch(() => roadChanged());
  return d;
}
/** server.js's unblocker agents — built before configure(): each connection asks the shared door of THAT moment; keep-alive
 *  as Node's own global agents */
function agents() {
  const mk = (secure) => { const a = new (secure ? https.Agent : http.Agent)(agentOptions(secure ? https.globalAgent : http.globalAgent)); const base = a.createConnection.bind(a); a.createConnection = (o, cb) => instance().connect(o, cb, secure, base); return a; };
  return { httpAgent: mk(false), httpsAgent: mk(true) };
}
const embedded = (unblocker, opts) => { const mw = (req, res, next) => instance().embedded(unblocker, opts)(req, res, next); return mw; };
const launch = (o) => instance().launch(o);
const missFor = (url, o) => instance().missFor(url, o);

module.exports = { create, configure, follow, instance, roadChanged, agents, embedded, launch, missFor, STATE_FILE, LAUNCH_WHY, SAY_WINDOW_MS, SETTLE_MS, HUNG_KEEP_MS, agentOptions, plainDetail };
