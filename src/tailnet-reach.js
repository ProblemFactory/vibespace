'use strict';
// PURE — lane tailnet-names (2026-11-05, userW «装了 Tailscale 插件，https://<host>:8006/ 无法解析»): A TAILNET HOST IS
// REACHED FROM A BROWSER, BY NAME, WHEN THE TAILSCALE PLUGIN IS UP — IN EITHER MODE — and the container's resolver is never
// touched (the 2026-10-19 law, src/tailscale-dns.js). The plugin answers from its OWN table (its `reach()` verb: one read of
// `tailscale status --json`, local, persisted with its time so a restarted hub knows the names at once); this file decides
// over that table and nothing else.
// ROUND 2 — THE ROAD IS ADDED, NEVER A GATE: only a CURRENT DEVICE (a peer, or Self — this machine is a device too), by name or
// by address, is sent through Tailscale; every other host takes the ordinary road unchanged, in every plugin state including
// none (a public Funnel name, a CGNAT intranet address, a LAN short name while the plugin is stopped). The words come only
// AFTER a failure, and follow its cause.
// ROUND 3 — ROUTING READS THE WHOLE TABLE (no cap: a 250-device tailnet routes its 250th; a cap belongs to a DISPLAY only — the
// owner's «known: …» list, bounded and said «… and N more»); A LAUNCH WHILE NOT SIGNED IN CARRIES NO PAC (its stamp says why,
// and the words name it); TAILSCALE WORDS ONLY WHERE TAILSCALE IS INVOLVED (a device, a *.ts.net / the suffix's name, a device
// the last table knew — a bare label that is none keeps the base's error); THE DOOR'S TARGETS ARE VETTED (vetAddress: never
// loopback / unspecified / link-local / a metadata address / Tailscale's own service address / this hub's own addresses).
//   tailnetKind(url, reach) → 'device' | 'known' (a device of the last table while the road is down) | 'name' (a *.ts.net
//     name no table lists) | 'address' (100.64.0.0/10 / fd7a:115c:a1e0::/48 no table lists) | null.
//   routeFor(url, reach, {via}) → 'direct' | 'socks' | 'http-proxy' | 'resolve:<ip>' — ONE url's road: a current device ⇒
//     userspace: the plugin's SOCKS5 ('browser') / HTTP proxy ('embedded', the in-page /proxy); kernel: its NAME resolved from
//     the table (an address ⇒ direct: the tunnel routes it); anything else ⇒ direct. Never refuses.
//   downWhy(reach) → why the tailnet road is down ('no-plugin' | 'system' | 'plugin-off' | 'setting' | 'signed-out' |
//     'starting'), null when it is up.
//   launchFor(reach, {explicit, engine, remote}) → {on, mode, why} — does a Chrome launch carry the tailnet PAC? (signed in only)
//   roadOn(reach) — may the hub's door listen? (our plugin up in kernel / userspace + the row on; signed in or not)
//   vetAddress(addr, {own, device}) → why an address is never a door's target ('loopback' | 'unspecified' | 'link-local' |
//     'metadata' | 'tailscale-service' | 'this-hub' | 'not-tailnet' | 'not-an-address'), null when it may be dialled.
//   pacFor(devices, target, {addresses, asOf}) — the PAC text: the current devices' names (short + FQDN; + their addresses in
//     userspace) → `target`, DIRECT for everything else (never a blanket *.ts.net / suffix rule).
//   missFor(url, reach, {via, launched, failed, cause, lang, audience}) → {why, text, …} | null — LAW 2: a FAILED request on a
//     tailnet host says why THROUGH TAILSCALE, by its cause (en / zh / ja), never «cannot resolve»; the device list only for
//     the owner's own eyes (audience 'owner': the in-page page, the console), never an agent's answer.
// WHY A PAC, NOT --host-resolver-rules (MEASURED on this box, Chrome 151 + agent-browser 0.38.2): Chrome splits the rules list
// at ',' only («Failed parsing rule» for ';'), and the browser driver cuts its ONE args line at EVERY ',' (src/browser-verbs.js
// driverArgsList) — more than one rule cannot ride the driver's road; a data: PAC url always holds a ',' too, and a file://
// PAC is ignored. An http://127.0.0.1 PAC url is comma-free and rides every road (the driver's line, the attach argv); in
// kernel mode it sends the devices' names to the hub's loopback door (src/server/tailnet-door.js), which resolves them here.
// Its path carries the door's random token (`/tailnet-<token>.pac`): the device list is never on a guessable URL.
// Imports nothing.

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const TS_DOMAIN = 'ts.net';
const SHOW_MAX = 8; // a DISPLAY's bound (the owner's «known: …» list) — routing reads the whole table, never a cap
const TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;
const WHYS = Object.freeze(['no-plugin', 'plugin-off', 'signed-out', 'starting', 'setting', 'not-a-peer', 'system', 'explicit-proxy', 'engine', 'remote', 'door', 'started-before', 'started-signed-out', 'started-setting-off', 'door-failed', 'new-device', 'no-answer', 'refused', 'untrusted-cert', 'cert-warning', 'unreachable']);
const PROXY_ENV = Object.freeze(['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']);

/** a URL, a host[:port] or a bare host → the lower-case hostname (no brackets, no trailing dot), '' when none */
function hostOf(url) {
  let s = String(url == null ? '' : url).trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) { try { s = new URL(s).hostname; } catch { return ''; } }
  else s = s.replace(/[/?#].*$/, '').replace(/^\[([^\]]*)\](?::\d+)?$/, '$1').replace(/^([^:]*):\d+$/, '$1');
  return s.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}
/** a URL's port (its scheme's default when none), 0 when unknown */
function portOf(url) {
  const s = String(url == null ? '' : url).trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) { try { const u = new URL(s); return Number(u.port) || ({ 'https:': 443, 'http:': 80, 'wss:': 443, 'ws:': 80 }[u.protocol] || 0); } catch { return 0; } }
  const m = /:(\d{1,5})$/.exec(s.replace(/[/?#].*$/, '').replace(/^\[[^\]]*\]/, ''));
  return m ? Number(m[1]) : 0;
}
const inCgnat = (h) => { const m = IPV4_RE.exec(h); return !!m && +m[1] === 100 && +m[2] >= 64 && +m[2] <= 127 && +m[3] <= 255 && +m[4] <= 255; };
const inTsV6 = (h) => /^fd7a:115c:a1e0:/i.test(h);
const isAddress = (h) => IPV4_RE.test(h) || h.includes(':');
const isLoopback = (h) => h === 'localhost' || h.endsWith('.localhost') || /^127\./.test(h) || h === '::1';
// a door's target is never a way back into this machine (nor its cloud's metadata service, nor Tailscale's own 100.100.100.100)
const METADATA = Object.freeze(['169.254.169.254', 'fd00:ec2::254', '100.100.100.200']);
const TS_SERVICE = Object.freeze(['100.100.100.100', 'fd7a:115c:a1e0::53']);
const bareAddr = (a) => { const s = String(a == null ? '' : a).trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, ''); const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s); return m ? m[1] : s; };
/** why `addr` is never a door's target, null when it may be dialled: `own` = this hub's own interface addresses (never for a
 *  name — Self is reached by its DEVICE road, at its tailnet address, as every peer reaches it); `device` = a table address
 *  (it must be a tailnet one) */
function vetAddress(addr, { own = [], device = false } = {}) {
  const a = bareAddr(addr);
  const v4 = IPV4_RE.exec(a);
  if (!a || !(v4 ? v4.slice(1).every((o) => +o <= 255) : a.includes(':'))) return 'not-an-address';
  if (METADATA.includes(a)) return 'metadata';
  if (TS_SERVICE.includes(a)) return 'tailscale-service';
  if (v4 ? +v4[1] === 127 : a === '::1') return 'loopback';
  if (v4 ? +v4[1] === 0 : a === '::') return 'unspecified';
  if (v4 ? +v4[1] === 169 && +v4[2] === 254 : /^fe[89ab][0-9a-f]?:/.test(a)) return 'link-local';
  if (device) return inCgnat(a) || inTsV6(a) ? null : 'not-tailnet';
  if ((Array.isArray(own) ? own : []).some((o) => bareAddr(o) === a)) return 'this-hub';
  return null;
}
const cleanSuffix = (s) => String(s || '').trim().replace(/^\.+|\.+$/g, '').toLowerCase();
/** a table: records {name, short, ips} (a bare string = a name with no address — an older copy) */
const list = (peers) => (Array.isArray(peers) ? peers : []).map((p) => (typeof p === 'string' ? { name: p.toLowerCase(), short: p.toLowerCase().split('.')[0], ips: [] } : p))
  .filter((p) => p && typeof p.name === 'string' && p.name);
const ipsOf = (r) => (Array.isArray(r && r.ips) ? r.ips : []).filter((a) => typeof a === 'string' && a).map((a) => a.toLowerCase());
/** the table's record for a host — its name (full, or the bare label) or one of its addresses → {name, ip (the asked address,
 *  else IPv4 first), ips, self} | null */
function deviceOf(host, devices) {
  const q = hostOf(host);
  if (!q) return null;
  const all = list(devices);
  const hit = isAddress(q) ? all.find((r) => ipsOf(r).includes(q)) : (all.find((r) => r.name === q) || (q.includes('.') ? null : all.find((r) => r.short === q)));
  if (!hit) return null;
  const ips = ipsOf(hit);
  return { name: hit.name, ip: isAddress(q) ? q : (ips.find((a) => IPV4_RE.test(a)) || ips[0] || null), ips, self: hit.self === true };
}
/** a NAME's record with an address (src/tailscale-dns.js lookupName's rule) — the r1 export, kept */
function peerOf(host, peers) { const d = isAddress(hostOf(host)) ? null : deviceOf(host, peers); return d && d.ip ? { name: d.name, ip: d.ip, ips: d.ips } : null; }

/** the plugin's answer in one shape (a missing / broken one ⇒ no plugin); `devices` = the peers + Self (a device too) */
function reachOf(reach) {
  const r = reach && typeof reach === 'object' ? reach : null;
  if (!r) return null;
  const ports = r.ports && typeof r.ports === 'object' ? r.ports : {};
  const self = r.self && typeof r.self === 'object' && typeof r.self.name === 'string' && r.self.name ? { ...r.self, self: true } : null;
  const peers = list(r.peers).filter((p) => p.self !== true); // THE WHOLE TABLE: routing never caps (a display may)
  const state = typeof r.state === 'string' ? r.state : null;
  return { up: r.up === true, mode: ['kernel', 'userspace', 'system'].includes(r.mode) ? r.mode : null, state, read: r.read === true || state !== null,
    loggedIn: r.loggedIn === true, browsers: r.browsers !== false, peers, self, devices: self ? [...peers, self] : peers, suffix: cleanSuffix(r.suffix),
    known: list(r.known), at: Number(r.at) || 0, stale: r.stale === true, ports: { socks: Number(ports.socks) || 0, http: Number(ports.http) || 0 } };
}
/** why the tailnet road is down — null when it is up (the plugin ours, running, signed in, the row on) */
function downWhy(reach) {
  const r = reachOf(reach);
  if (!r) return 'no-plugin';
  if (r.mode === 'system') return 'system'; // a system tailscaled (a dev machine): its own routes and DNS — never ours to steer
  if (!r.up || !r.mode) return 'plugin-off';
  if (!r.browsers) return 'setting';
  if (r.loggedIn) return null;
  return ['NeedsLogin', 'NeedsMachineAuth'].includes(r.state) ? 'signed-out' : 'starting'; // «not yet read» is never «signed out»
}
/** may the hub's door listen? — only while the road is on: our plugin up (kernel / userspace) + the row on; signed in or not (a
 *  signed-out PAC lists nothing) */
function roadOn(reach) { const w = downWhy(reach); return w === null || w === 'signed-out' || w === 'starting'; }
/** what kind of tailnet host `url` is over `reach` (see the header) */
function tailnetKind(url, reach) {
  const r = reachOf(reach);
  const h = hostOf(url);
  if (!h || isLoopback(h)) return null;
  if (r && deviceOf(h, r.devices)) return 'device';
  if (r && deviceOf(h, r.known)) return 'known';
  if (isAddress(h)) return inCgnat(h) || inTsV6(h) ? 'address' : null;
  if (h === TS_DOMAIN || h.endsWith('.' + TS_DOMAIN) || (r && r.suffix && h.endsWith('.' + r.suffix))) return 'name';
  return null;
}
function isTailnetHost(url, reach) { return tailnetKind(url, reach) !== null; }
/** might a fresher table change this host's road? (a bare label, a *.ts.net name, a tailnet address, a known device) */
function maybeTailnet(url, reach) { const h = hostOf(url); return !!h && !isLoopback(h) && (tailnetKind(h, reach) !== null || (!isAddress(h) && !h.includes('.'))); }

/** ONE url's road (see the header). Never throws, never refuses. */
function routeFor(url, reach, { via = 'browser' } = {}) {
  const r = reachOf(reach);
  if (downWhy(r) !== null) return 'direct';
  const d = deviceOf(url, r.devices);
  if (!d || !d.ip) return 'direct'; // NOT a current device ⇒ the ordinary road, unchanged
  if (r.mode === 'kernel') return isAddress(hostOf(url)) ? 'direct' : `resolve:${d.ip}`;
  if (via === 'embedded') return r.ports.http ? 'http-proxy' : 'direct';
  return r.ports.socks ? 'socks' : 'direct';
}

/** does a Chrome launch carry the tailnet PAC? `explicit` = the profile, the person's browser config or the launch env names
 *  its own proxy (it WINS: Chromium ranks a PAC url above --proxy-server and above the env, so the PAC is never added beside
 *  one); `engine` = an engine plugin's browser (its own network); `remote` = it runs on another machine. */
function launchFor(reach, { explicit = false, engine = false, remote = false } = {}) {
  const r = reachOf(reach);
  const off = (why) => ({ on: false, mode: r ? r.mode : null, why });
  if (remote) return off('remote');
  if (engine) return off('engine');
  if (!r) return off('no-plugin');
  if (r.mode === 'system') return off('system');
  if (!r.up || !r.mode) return off('plugin-off');
  if (!r.browsers) return off('setting');
  if (explicit) return off('explicit-proxy');
  if (!r.loggedIn) return off(downWhy(r)); // r3: not signed in ⇒ no PAC (Chrome would keep an empty one) — 'signed-out' | 'starting'
  return { on: true, mode: r.mode, why: null };
}
/** the proxy a launch env names (Chrome on Linux honours them) → its variable's name, or null */
function envProxyOf(env) { const e = env && typeof env === 'object' ? env : {}; return PROXY_ENV.find((k) => typeof e[k] === 'string' && e[k].trim()) || null; }

/** the PAC text — evaluated by Chrome's PAC engine (ES5); the CURRENT devices' names (full + bare; + their addresses when
 *  `addresses`) → `target`, DIRECT for everything else — a name no table lists goes the ordinary road (public DNS, the LAN) */
function pacFor(devices, target, { addresses = false, asOf = 0 } = {}) {
  const names = {};
  for (const p of list(devices)) { names[p.name] = 1; if (p.short) names[p.short] = 1; if (addresses) for (const a of ipsOf(p)) names[a] = 1; }
  const t = String(target || 'DIRECT').replace(/[^A-Za-z0-9 .:;\-[\]]/g, '');
  const when = Number(asOf) > 0 ? new Date(Number(asOf)).toISOString() : '';
  return [
    '// VibeSpace: the devices on your tailnet through Tailscale, everything else DIRECT (lane tailnet-names)',
    ...(when ? [`// names as of ${when} (Tailscale's status did not answer in time; the last table it gave)`] : []),
    'function FindProxyForURL(url, host) {',
    "  var h = String(host).toLowerCase().replace(/\\.$/, '').replace(/^\\[|\\]$/g, '');",
    `  var names = ${JSON.stringify(names)};`,
    `  if (Object.prototype.hasOwnProperty.call(names, h)) return '${t}';`,
    "  return 'DIRECT';",
    '}',
    '',
  ].join('\n');
}
/** the PAC's target for a mode: userspace ⇒ the plugin's SOCKS5, kernel ⇒ the hub's loopback door (it resolves the names) */
function pacTarget(reach, doorPort) {
  const r = reachOf(reach);
  if (downWhy(r) !== null) return 'DIRECT';
  if (r.mode === 'userspace') return r.ports.socks ? `SOCKS5 127.0.0.1:${r.ports.socks}` : 'DIRECT';
  return r.mode === 'kernel' && doorPort ? `PROXY 127.0.0.1:${Number(doorPort)}` : 'DIRECT';
}
/** the devices a PAC lists (none while the road is down) */
function pacDevices(reach) { const r = reachOf(reach); return downWhy(r) === null ? r.devices : []; }
/** the PAC's path on the door: `/tailnet-<token>.pac` (the door's random token — never a guessable URL), null without one */
function pacPath(token) { return TOKEN_RE.test(String(token || '')) ? `/tailnet-${token}.pac` : null; }
/** the one switch a launch carries (comma-free by construction — the driver cuts its line at every ','), or null */
function pacArg(doorPort, token) { const p = Number(doorPort), at = pacPath(token); return Number.isInteger(p) && p > 0 && p < 65536 && at ? `--proxy-pac-url=http://127.0.0.1:${p}${at}` : null; }

/** a failure's code (a Node error code, Chrome's net::ERR_*, 'TIMEOUT') → its cause class, null when it is no network failure */
function causeOf(code) {
  const c = String(code || '').trim().replace(/^net::/i, '').toUpperCase();
  if (!c) return null;
  if (/CERT|^UNABLE_TO_(VERIFY|GET_ISSUER)/.test(c)) return 'cert';
  if (c === 'ECONNREFUSED' || c === 'ERR_CONNECTION_REFUSED') return 'refused';
  if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_NONAME', 'EAI_FAIL', 'ERR_NAME_NOT_RESOLVED', 'ERR_NAME_RESOLUTION_FAILED'].includes(c)) return 'name';
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EHOSTDOWN', 'ERR_CONNECTION_TIMED_OUT', 'ERR_TIMED_OUT', 'ERR_ADDRESS_UNREACHABLE', 'ERR_NETWORK_UNREACHABLE'].includes(c)) return 'timeout';
  if (['ERR_TUNNEL_CONNECTION_FAILED', 'ERR_SOCKS_CONNECTION_FAILED', 'ERR_SOCKS_CONNECTION_HOST_UNREACHABLE', 'ERR_PROXY_CONNECTION_FAILED', 'ETAILNET'].includes(c)) return 'tunnel';
  if (['ECONNRESET', 'EPIPE', 'ECONNABORTED', 'ERR_CONNECTION_RESET', 'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_ABORTED', 'ERR_CONNECTION_FAILED', 'ERR_EMPTY_RESPONSE', 'ERR_SSL_PROTOCOL_ERROR'].includes(c)) return 'reset';
  return null;
}

// ── LAW 2: THE WORDS (en / zh / ja) — a failure on a tailnet host names Tailscale and its cause, never «cannot resolve» ──
const WORDS = Object.freeze({
  en: {
    what: { name: 'name', address: 'address' }, through: ' through Tailscale',
    'plugin-off': '{host} is a Tailscale {what} — the Tailscale plugin is off: start it in ⚙ → Plugins → Tailscale',
    'no-plugin': '{host} is a Tailscale {what} — this instance has no Tailscale running: install and start it in ⚙ → Plugins → Tailscale',
    'signed-out': '{host} is a Tailscale {what} — Tailscale is not signed in yet: Log in in ⚙ → Plugins → Tailscale',
    setting: '{host} is a Tailscale {what} — reaching Tailscale devices from browsers is off: turn on «Reach tailnet hosts from browsers» in ⚙ → Plugins → Tailscale',
    'not-a-peer': '{host} is not a device on your tailnet',
    known: ' (known: {known})', more: ' and {n} more',
    'explicit-proxy': '{host} is a Tailscale {what} — this browser has its own proxy, which VibeSpace leaves as it is: use a proxy that reaches your tailnet, or remove it',
    'started-before': '{host} is on your tailnet, but this browser started before Tailscale was up — stop it and open the page again: it is routed through Tailscale at its next start',
    'started-signed-out': '{host} is on your tailnet, but this browser started while Tailscale was signed out — stop it and open the page again: it is routed through Tailscale at its next start',
    'started-setting-off': '{host} is on your tailnet, but this browser started while «Reach tailnet hosts from browsers» was off — stop it and open the page again: it is routed through Tailscale at its next start',
    'door-failed': '{host} is on your tailnet, but VibeSpace could not open its tailnet door when this browser started (the hub log says why) — stop it and open the page again',
    'new-device': '{host} joined your tailnet after this browser started — stop it and open the page again: it is reached at its next start',
    'no-answer': '{host} is on your tailnet but did not answer through Tailscale — is that device online?',
    unreachable: '{host} is on your tailnet, but the connection through Tailscale failed ({code}) — is that device online, and is anything listening on port {port}?',
    refused: '{host} answered{through}, but refused the connection on port {port} — is the service running on that port?',
    'untrusted-cert': '{host} answered{through}, but with a certificate the in-page browser does not trust (self-signed?) — it cannot open it from here: give the device a trusted certificate (tailscale cert)',
    'cert-warning': '{host} answered{through}, but with a certificate Chrome does not trust (self-signed?) — Chrome shows a certificate warning: accept it in the live view, or give the device a trusted certificate (tailscale cert)',
    asOf: ' (names as of {when})',
    none: 'none yet',
  },
  zh: {
    what: { name: '名字', address: '地址' }, through: '经 Tailscale ',
    'plugin-off': '{host} 是 Tailscale 里的{what} — Tailscale 插件没有开：在 ⚙ → 插件 → Tailscale 里启动它',
    'no-plugin': '{host} 是 Tailscale 里的{what} — 这个实例没有在运行 Tailscale：在 ⚙ → 插件 → Tailscale 里安装并启动它',
    'signed-out': '{host} 是 Tailscale 里的{what} — Tailscale 还没有登录：在 ⚙ → 插件 → Tailscale 里登录',
    setting: '{host} 是 Tailscale 里的{what} — 从浏览器访问 Tailscale 设备已关闭：在 ⚙ → 插件 → Tailscale 打开「从浏览器访问 tailnet 里的机器」',
    'not-a-peer': '{host} 不是你 tailnet 里的设备',
    known: '（已知：{known}）', more: '，以及另外 {n} 台',
    'explicit-proxy': '{host} 是 Tailscale 里的{what} — 这个浏览器有自己的代理，VibeSpace 不会改它：换一个能到达 tailnet 的代理，或者去掉它',
    'started-before': '{host} 在你的 tailnet 里，但这个浏览器是在 Tailscale 起来之前启动的 — 关掉它再打开页面：下次启动时会经 Tailscale 访问',
    'started-signed-out': '{host} 在你的 tailnet 里，但这个浏览器是在 Tailscale 没登录时启动的 — 关掉它再打开页面：下次启动时会经 Tailscale 访问',
    'started-setting-off': '{host} 在你的 tailnet 里，但这个浏览器启动时「从浏览器访问 tailnet 里的机器」是关着的 — 关掉它再打开页面：下次启动时会经 Tailscale 访问',
    'door-failed': '{host} 在你的 tailnet 里，但这个浏览器启动时 VibeSpace 没能打开它的 tailnet 入口（原因见 hub 日志）— 关掉它再打开页面',
    'new-device': '{host} 是在这个浏览器启动之后才加入你的 tailnet 的 — 关掉它再打开页面：下次启动时就能访问',
    'no-answer': '{host} 在你的 tailnet 里，但经 Tailscale 没有回应 — 那台设备在线吗？',
    unreachable: '{host} 在你的 tailnet 里，但经 Tailscale 的连接失败了（{code}）— 那台设备在线吗？端口 {port} 上有服务在监听吗？',
    refused: '{host} {through}有回应，但拒绝了端口 {port} 上的连接 — 那个端口上的服务在运行吗？',
    'untrusted-cert': '{host} {through}有回应，但用的是页内浏览器不信任的证书（自签名？）— 在这里打不开它：给那台设备换一张可信的证书（tailscale cert）',
    'cert-warning': '{host} {through}有回应，但用的是 Chrome 不信任的证书（自签名？）— Chrome 会显示证书警告：在实时画面里接受它，或者给那台设备换一张可信的证书（tailscale cert）',
    asOf: '（名单截至 {when}）',
    none: '暂无',
  },
  ja: {
    what: { name: '名前', address: 'アドレス' }, through: 'Tailscale 経由で',
    'plugin-off': '{host} は Tailscale の{what}です — Tailscale プラグインがオフです：⚙ → プラグイン → Tailscale で起動してください',
    'no-plugin': '{host} は Tailscale の{what}です — このインスタンスでは Tailscale が動いていません：⚙ → プラグイン → Tailscale でインストールして起動してください',
    'signed-out': '{host} は Tailscale の{what}です — Tailscale にまだログインしていません：⚙ → プラグイン → Tailscale でログインしてください',
    setting: '{host} は Tailscale の{what}です — ブラウザーから Tailscale のデバイスへの接続がオフです：⚙ → プラグイン → Tailscale で「ブラウザーから tailnet のマシンに接続」をオンにしてください',
    'not-a-peer': '{host} はあなたの tailnet のデバイスではありません',
    known: '（既知：{known}）', more: ' ほか {n} 台',
    'explicit-proxy': '{host} は Tailscale の{what}です — このブラウザーには独自のプロキシがあり、VibeSpace は変更しません：tailnet に届くプロキシを使うか、外してください',
    'started-before': '{host} は tailnet 上にありますが、このブラウザーは Tailscale が起動する前に開始されました — 閉じてからページを開き直してください：次の起動から Tailscale 経由になります',
    'started-signed-out': '{host} は tailnet 上にありますが、このブラウザーは Tailscale にログインしていない間に開始されました — 閉じてからページを開き直してください：次の起動から Tailscale 経由になります',
    'started-setting-off': '{host} は tailnet 上にありますが、このブラウザーは「ブラウザーから tailnet のマシンに接続」がオフの間に開始されました — 閉じてからページを開き直してください：次の起動から Tailscale 経由になります',
    'door-failed': '{host} は tailnet 上にありますが、このブラウザーの起動時に VibeSpace が tailnet の入口を開けませんでした（理由は hub のログにあります）— 閉じてからページを開き直してください',
    'new-device': '{host} はこのブラウザーの起動後に tailnet に加わりました — 閉じてからページを開き直してください：次の起動から届きます',
    'no-answer': '{host} は tailnet 上にありますが、Tailscale 経由で応答がありません — そのデバイスはオンラインですか？',
    unreachable: '{host} は tailnet 上にありますが、Tailscale 経由の接続に失敗しました（{code}）— そのデバイスはオンラインですか？ポート {port} で何か待ち受けていますか？',
    refused: '{host} は{through}応答しましたが、ポート {port} への接続を拒否しました — そのポートのサービスは動いていますか？',
    'untrusted-cert': '{host} は{through}応答しましたが、ページ内ブラウザーが信頼しない証明書でした（自己署名？）— ここからは開けません：そのデバイスに信頼できる証明書を入れてください（tailscale cert）',
    'cert-warning': '{host} は{through}応答しましたが、Chrome が信頼しない証明書でした（自己署名？）— Chrome に証明書の警告が出ます：ライブビューで受け入れるか、そのデバイスに信頼できる証明書を入れてください（tailscale cert）',
    asOf: '（名前は {when} 時点）',
    none: 'まだありません',
  },
});
const LANGS = Object.freeze(Object.keys(WORDS));
const fill = (tpl, params) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
const whenOf = (t) => (Number(t) > 0 ? new Date(Number(t)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '');
/** the sentence of one reason in one language (en when the language has none); `known` (an array) = the device list, said
 *  only for the owner's eyes; `through` = it went through Tailscale; `asOf` = the table is the last one Tailscale gave */
function wordsFor(why, { host = '', what = 'name', known = null, port = 0, code = '', through = false, asOf = 0, lang = 'en' } = {}) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const w = WORDS[l];
  const names = Array.isArray(known) ? known.slice(0, SHOW_MAX) : null; // a DISPLAY's bound, said: «… and N more»
  const more = names && known.length > SHOW_MAX ? fill(w.more, { n: known.length - SHOW_MAX }) : '';
  const params = { host: String(host).slice(0, 253), what: w.what[what] || w.what.name, port: Number(port) || '?', code: String(code || '').replace(/^net::/i, '').slice(0, 60) || '?',
    through: through ? w.through : '', known: names ? (names.length ? names.join(', ') + more : w.none) : '', when: whenOf(asOf), n: known && known.length > SHOW_MAX ? known.length - SHOW_MAX : 0 };
  let text = fill(w[why] || WORDS.en[why], params);
  if (why === 'not-a-peer' && names) text += fill(w.known, params);
  if (params.when) text += fill(w.asOf, params);
  return { why, key: WORDS.en[why], params, text, lang: l };
}
/** LAW 2 — why a FAILED request on a tailnet host failed, in words; null when nothing failed, the failure is no network failure
 *  (a dialog, a prompt, a CDP timeout), or the host is none of Tailscale's — not a device, no *.ts.net / suffix name, no device
 *  the last table knew (a bare label like a compose service's: the base's own error then stands alone). `launched` = the browser's
 *  launch stamp `{arg, mode, why}` (no `arg`: it started without the PAC; undefined: not known); `cause` = the failure's code;
 *  `audience` 'owner' (the in-page page, the console: the device list may show) | 'agent' (an agent's answer: never). */
function missFor(url, reach, { via = 'browser', launched = undefined, failed = false, cause = null, lang = 'en', audience = 'agent' } = {}) {
  if (!failed) return null; // THE ROAD IS ADDED, NEVER A GATE: the words only ever explain a failure
  const r = reachOf(reach);
  const h = hostOf(url);
  if (!h || isLoopback(h)) return null;
  const cls = causeOf(cause);
  if (!cls) return null;
  const kind = tailnetKind(h, r);
  const down = downWhy(r);
  const road = routeFor(h, r, { via });
  const known = audience === 'owner' && r ? [...new Set(r.devices.map((p) => p.short || p.name))] : null;
  const say = (why, through = false) => wordsFor(why, { host: h, what: isAddress(h) ? 'address' : 'name', known, port: portOf(url), code: cause, through, asOf: r && r.stale ? r.at : 0, lang });
  const byCause = () => ({ cert: via === 'embedded' ? 'untrusted-cert' : 'cert-warning', refused: 'refused', timeout: 'no-answer' }[cls] || 'unreachable');
  // the browser started WITHOUT the PAC (its stamp): its own proxy won / it started before Tailscale was up
  if (via === 'browser' && launched !== undefined && !(launched && launched.arg) && kind === 'device' && !down && road !== 'direct') {
    const w = launched && launched.why;
    if (['engine', 'remote', 'system'].includes(w)) return null; // not VibeSpace's Chrome on this machine to route
    return say({ 'explicit-proxy': 'explicit-proxy', 'signed-out': 'started-signed-out', setting: 'started-setting-off', door: 'door-failed' }[w] || 'started-before'); // r3: the stamp's own reason
  }
  // a current device, on the road VibeSpace added: the words follow the error, through Tailscale
  if (kind === 'device' && !down) {
    if (cls === 'name') return road !== 'direct' && via === 'browser' ? say('new-device') : null; // its PAC predates the device
    const why = byCause();
    return say(why, ['refused', 'untrusted-cert', 'cert-warning'].includes(why));
  }
  // the person's OWN device while the road is down (the plugin off, signed out, the row off): said with the door
  if ((kind === 'device' || kind === 'known') && down && !['system', 'starting'].includes(down)) return cls === 'cert' || cls === 'refused' ? say(byCause()) : say(down);
  // a tailnet-looking host the ordinary road failed on — the hint after the failure, never a refusal before it
  if (cls === 'name' && (kind === 'name' || kind === 'known')) return down === null ? say('not-a-peer') : ['system', 'starting'].includes(down) ? null : say(down);
  if ((kind === 'name' || kind === 'address') && (cls === 'cert' || cls === 'refused')) return say(byCause());
  return null;
}

/** r4 — a browser's launch stamp `{arg, mode, why}` as ANY view carries it: {on, mode, why} — never the arg (its PAC url holds the
 *  door's token); null / undefined pass as they are */
function stampView(stamp) { return stamp && typeof stamp === 'object' ? { on: !!stamp.arg, mode: stamp.mode || null, why: stamp.why || null } : stamp; }

module.exports = { WHYS, WORDS, LANGS, SHOW_MAX, PROXY_ENV, hostOf, portOf, deviceOf, peerOf, tailnetKind, isTailnetHost, maybeTailnet, reachOf, downWhy, roadOn, vetAddress, routeFor, launchFor, envProxyOf, pacFor, pacTarget, pacDevices, pacPath, pacArg, causeOf, wordsFor, missFor, stampView };
