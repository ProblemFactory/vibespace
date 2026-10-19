'use strict';
/**
 * PURE (imports only src/secret-shapes.js; CJS — the hub's device client, the device agent and a suite share one copy) —
 * A HUB ACT ON A DEVICE IS NEVER ANONYMOUS (lane device-act-audit, design q-042 §3 D4 + D10, 2026-10-19).
 *
 * After `hello` a device trusts its hostToken-authed hub for every op (src/agentd/agentd.js: "the daemon trusts its
 * hostToken-authed paired server"). Before this lane the hub's OWN acts there — a command, a file written, a secret
 * placed, keys typed, a LAN socket opened, a new agent pushed — were called from 14 files with no "who asked", the
 * device logged nothing and the hub audited nothing (data/exit-audit.jsonl holds an agent's exit runs only; the 18
 * fleet pods of the 2026-10-19 incident: 0 lines each). Now:
 *   · THE LAYERS — every op the client sends (and the device answers) is in exactly ONE layer:
 *       read     the device is asked a fact (sysinfo, displays, discovery, usage, stream-*, window-track, proc-list,
 *                dial-status, a file stat / list / read)
 *       session  the life of a person's or agent's own session, app window or tunnel (open / attach / kill a session,
 *                a launched app's fit / pin / stop, a reverse tunnel back to this hub) — it already has its own card
 *       act      the hub CHANGES the device or acts through it: run-cmd, run-stream, a file written / removed / renamed,
 *                place-secret, input-events, a tcp-connect to another LAN host, serve-socks, serve-folder, an app
 *                installed / removed / fetched, a profile browser started, text posted into a conversation, sealed
 *                pool orders, a Settings pane opened, a window pinned
 *       code     the hub replaces the device agent's code (`upgrade`)
 *     An op (or an op:action) without a row is `act` — fail closed: it needs a `by` and is audited (scripts/
 *     test-device-acts.mjs reds the missing row first).
 *   · `by` — WHO asked, spelled like window-reach's principals: `human:` + a browser sign-in's handle (never the
 *     cookie), `agent:<sessionKey>`, `job:<id>`, `system:<module>` (a sweep, a harvest, the hub's own upkeep). The ONE
 *     send point (src/agentd/client.js `_request`) refuses an act / code request without one — `act_without_by`,
 *     in-process, logged, NEVER sent; every client call site passes it (test-architecture's census, a mutant reds it).
 *   · `summaryOf(key, payload)` — what the act was, bounded (≤ SUMMARY_MAX) and secret-free: argv heads, paths, sizes,
 *     counts. Never a token, a file's bytes, a typed key or a posted text (their SIZE only); what is left passes
 *     secret-shapes' redactSecrets.
 *   · `lineOf(...)` — THE audit line, the same shape on both ends: {at, hostId, op, layer, by, summary, ok, code,
 *     outHead (≤ OUT_HEAD_BYTES, redacted), ms}; the device's own state/acts.log carries {at, op, layer, by, summary}.
 *   · `rowOf(line)` — a stored line judged ON THE WAY OUT (bounded, re-redacted — a line on disk is never trusted).
 *   · `addressKeyOf(addr)` — the dial-in address the "first dial from a new address" item keys on (IPv4 as is, an
 *     IPv6 address by its /64 — a privacy address rotating inside one network is not news).
 * Gate: scripts/test-device-acts.mjs (the table, the redaction, one line per act through a fake daemon, the census).
 */
const { redactSecrets } = require('./secret-shapes.js');

const LAYERS = Object.freeze(['read', 'session', 'act', 'code']);
const SUMMARY_MAX = 240;      // characters of a line's summary
const OUT_HEAD_BYTES = 200;   // bytes of a line's output head
const BY_KINDS = Object.freeze(['human', 'agent', 'job', 'system']);
const BY_RE = /^(human|agent|job|system):[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,159}$/;
// lane hub-act-ask: what the ask said about an act (its line's `ask`) — asked and allowed once / always, denied, unanswered in
// 60 s, not filed (For you refused the card), the machine's list is Never, refused in a background subject's quiet window,
// the gate could not judge it
const ASK_OUTCOMES = Object.freeze(['allowed', 'always', 'denied', 'expired', 'unfiled', 'never', 'quiet', 'error']);
const askOf = (a) => (ASK_OUTCOMES.includes(a) ? a : null);

// THE TABLE. A key is an op, or `op:action` for the ops whose action decides (fs-op, design-fs, desktop-serve,
// browser-serve). tcp-connect is judged by its host (loopback = read, another host = act) in keyOf.
const TABLE = Object.freeze({
  // ── read ──
  'sysinfo': 'read', 'display-facts': 'read', 'stream-facts': 'read', 'remoteapp-facts': 'read', 'desktop-apps-list': 'read',
  'discovery-snapshot': 'read', 'discovery-claims': 'read', 'discovery-watch': 'read', 'session-events-watch': 'read',
  'usage-scan': 'read', 'usage-events-watch': 'read', 'usage-events-ack': 'read', 'pool-orders-log-ack': 'read',
  'stream-offer': 'read', 'stream-answer': 'read', 'stream-stop': 'read', 'stream-stats': 'read', 'stream-windows': 'read',
  'window-track': 'read', 'window-untrack': 'read', 'proc-list': 'read', 'dial-status': 'read',
  'probe-cli': 'read', 'probe-creds': 'read', 'ping-info': 'read', 'ok': 'read',
  'transcript-op': 'read',  // a conversation's own transcript pages, read where it lives
  'quota-refresh': 'read',  // a quota READING the device takes with its own token (human-gated at the route)
  'tcp-connect:loopback': 'read', // a port on the device's own loopback (a viewer's tunnel, the exit's SOCKS) — its door is the serve that opened it
  'fs-op:stat': 'read', 'fs-op:list': 'read', 'fs-op:read-range': 'read', 'fs-op:home': 'read', 'fs-op:du': 'read',
  'design-fs:read': 'read', 'design-fs:meta': 'read', 'design-fs:tokens': 'read',
  'desktop-serve:facts': 'read', 'desktop-serve:status': 'read', 'desktop-serve:list': 'read', 'desktop-serve:windows': 'read',
  'desktop-serve:app-status': 'read', 'desktop-serve:app-plan': 'read', 'desktop-serve:app-refresh': 'read',
  'browser-serve:version': 'read', 'browser-serve:status': 'read', 'browser-serve:cdp-url': 'read', 'browser-serve:builds': 'read',
  // ── session ──
  'hello': 'session', 'open-session': 'session', 'resize-session': 'session', 'kill-session': 'session',
  'open-pipe-session': 'session', 'attach-pipe-session': 'session', 'kill-pipe-session': 'session',
  'opencode-serve': 'session',   // the OpenCode backend's own server for a conversation
  'tcp-listen': 'session', 'tcp-unlisten': 'session', // the reverse tunnel back to THIS hub (a session's API, a push mount)
  'unserve-folder': 'session', 'unserve-socks': 'session',
  'desktop-serve:launch': 'session', 'desktop-serve:relaunch': 'session', 'desktop-serve:stop': 'session', 'desktop-serve:close-asked': 'session',
  'desktop-serve:fit': 'session', 'desktop-serve:keep-alive': 'session', 'desktop-serve:pin': 'session',
  'desktop-serve:app-unstage': 'session', 'desktop-serve:app-forget': 'session', 'desktop-serve:app-adopt-drift': 'session',
  'browser-serve:stop': 'session', 'browser-serve:end-daemon': 'session',
  // ── act ──
  'run-cmd': 'act', 'run-stream': 'act', 'place-secret': 'act', 'input-events': 'act',
  'tcp-connect': 'act', 'serve-socks': 'act', 'serve-folder': 'act',
  'fs-op:write': 'act', 'fs-op:rm': 'act', 'fs-op:rename': 'act', 'fs-op:mkdir': 'act', 'fs-op:copy': 'act', 'fs-op:move': 'act', 'fs-op:write-stream': 'act',
  'design-fs:write-user': 'act',
  'desktop-serve:app-install': 'act', 'desktop-serve:app-remove': 'act', 'desktop-serve:app-fetch': 'act',
  'browser-serve:start': 'act', 'browser-serve:remove': 'act',
  'peer-post': 'act', 'pool-orders': 'act', 'settings-open': 'act', 'window-pin': 'act',
  'desktop-grab': 'act', 'desktop-input': 'act', // lane desktop-handover's agent verbs (they land with it)
  // ── code ──
  'upgrade': 'code',
});
const ACTION_OPS = Object.freeze(['fs-op', 'design-fs', 'desktop-serve', 'browser-serve']);
const LOOPBACK_RE = /^(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|localhost|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/** The client methods that can send an act / code op — THE census list (test-architecture: every call passes `by`;
 *  test-device-acts proves the list against src/agentd/client.js). `tcpForward` needs it only with a host argument. */
const CLIENT_ACT_METHODS = Object.freeze(['runCmd', 'runShell', 'runStream', 'fsWrite', 'fsRename', 'fsMkdir', 'fsRm', 'fsCopy', 'fsMove', 'fsWriteStream',
  'placeSecret', 'inputEvents', 'tcpForward', 'serveSocks', 'serveFolder', 'desktopServe', 'browserServe', 'designFs', 'peerPost', 'poolOrders', 'settingsOpen', 'windowPin',
  'desktopGrab', 'desktopInput']); // int315: lane desktop-handover's two (.313)
const HOST_ARG_METHODS = Object.freeze({ tcpForward: 1 }); // method → the index of the argument that makes it an act

/** The table key of a request payload. */
function keyOf(p) {
  const op = String((p && p.op) || '');
  if (op === 'tcp-connect') return p.host && !LOOPBACK_RE.test(String(p.host)) ? 'tcp-connect' : 'tcp-connect:loopback';
  if (ACTION_OPS.includes(op)) return `${op}:${String((p && p.action) || '')}`;
  return op;
}
/** The layer of a request payload (an op without a row = `act`: fail closed). */
function layerOf(p) { const k = keyOf(p); return Object.prototype.hasOwnProperty.call(TABLE, k) ? TABLE[k] : 'act'; }
/** Does this request need a `by` (an act or code layer op)? */
const needsBy = (p) => { const l = layerOf(p); return l === 'act' || l === 'code'; };
/** Is it a line of its own? A write-stream is ONE act: its `open` step (the end / abort steps ride it). */
function auditable(p) {
  if (!needsBy(p)) return false;
  if (p.op === 'fs-op' && p.action === 'write-stream') return !p.step || p.step === 'open';
  return true;
}
const validBy = (s) => typeof s === 'string' && BY_RE.test(s);
const tidy = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9._:@/+-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 160);
const mk = (kind) => (id) => { const t = tidy(id); return t ? `${kind}:${t}` : null; };
const byHuman = mk('human'), byAgent = mk('agent'), byJob = mk('job'), bySystem = mk('system');
/** The kind of a `by` ('human' | 'agent' | 'job' | 'system') or null. */
const kindOf = (by) => (validBy(by) ? by.slice(0, by.indexOf(':')) : null);
/** A producer's own subject shape (`{kind:'agent', conversation}` / `{kind:'user'|'person'}`) → a `by`, else `fallback`. */
function byOfWho(who, fallback) {
  const w = who && typeof who === 'object' ? who : null;
  if (w && w.kind === 'agent' && (w.conversation || w.key)) return byAgent(w.conversation || w.key) || fallback;
  if (w && (w.kind === 'job') && w.id) return byJob(w.id) || fallback;
  if (w && (w.kind === 'user' || w.kind === 'person' || w.kind === 'human')) return w.handle ? (byHuman(w.handle) || fallback) : (fallback && kindOf(fallback) === 'human' ? fallback : 'human:owner');
  return fallback;
}

const HIDDEN_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]+/g;
const fold = (s) => String(s == null ? '' : s).replace(HIDDEN_RE, ' ');
const cutChars = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/** Cut a text at `bytes` UTF-8 bytes, never inside a character. */
function cutBytes(s, bytes) {
  const b = Buffer.from(s, 'utf8');
  if (b.length <= bytes) return s;
  let end = bytes; while (end > 0 && (b[end] & 0xc0) === 0x80) end--;
  return b.subarray(0, end).toString('utf8') + '…';
}
const clean = (s, n = SUMMARY_MAX) => cutChars(redactSecrets(fold(s).replace(/\s+/g, ' ').trim().slice(0, n * 4)).text, n);
const b64len = (s) => (typeof s === 'string' ? Math.floor((s.replace(/=+$/, '').length * 3) / 4) : 0);
const argvOf = (cmd, args) => [cmd, ...(Array.isArray(args) ? args : [])].filter((x) => x != null).map(String).join(' ');

/** What the act was — bounded, secret-free (sizes, never bytes). */
function summaryOf(p) {
  const x = p && typeof p === 'object' ? p : {};
  const k = keyOf(x);
  const size = (n) => `${n} B`;
  switch (k) {
    case 'run-cmd': return clean(x.shell != null ? `shell: ${x.shell}` : argvOf(x.cmd, x.args)) + (x.stdin64 ? ` · stdin ${size(b64len(x.stdin64))}` : '');
    case 'run-stream': return clean(argvOf(x.cmd, x.args) + (x.cwd ? ` (in ${x.cwd})` : '')) + (x.stdin64 ? ` · stdin ${size(b64len(x.stdin64))}` : '');
    case 'place-secret': return clean(`${x.path} · ${size(b64len(x.data))}`);
    case 'input-events': {
      const ev = Array.isArray(x.events) ? x.events : [];
      const keys = ev.filter((e) => e && /key|text|type/i.test(String(e.t || e.type || e.kind || ''))).length;
      return `${ev.length} input event(s) · ${keys} key / text, ${ev.length - keys} pointer`; // never WHICH keys (a typed password)
    }
    case 'tcp-connect': return clean(`${x.host}:${Number(x.port) || 0}`);
    case 'serve-socks': return 'a SOCKS5 proxy on its loopback';
    case 'serve-folder': return clean(String(x.path || ''));
    case 'fs-op:write': return clean(`write ${x.path} · ${size(b64len(x.data64))}`);
    case 'fs-op:write-stream': return clean(`write ${x.path} · ${size(Number(x.size) || 0)}${x.overwrite ? ' (overwrite)' : ''}`);
    case 'fs-op:rm': return clean(`rm ${x.recursive ? '-r ' : ''}${x.path}`);
    case 'fs-op:rename': case 'fs-op:move': return clean(`${x.action} ${x.path} → ${x.to}`);
    case 'fs-op:copy': return clean(`copy ${x.path} → ${x.to}`);
    case 'fs-op:mkdir': return clean(`mkdir ${x.path}`);
    case 'design-fs:write-user': return clean(`design ${(x.params && (x.params.dir || x.params.path)) || ''} · user.json ${size(String((x.params && x.params.text) || '').length)}`);
    case 'peer-post': return clean(`a message into ${x.cid}`) + ` · ${String(x.text || '').length} chars`; // never the text
    case 'pool-orders': return x.orders && typeof x.orders === 'object' && x.orders.clearPool ? clean(`clear pool ${x.orders.clearPool}`) : `sealed pool orders · ${Array.isArray(x.orders) ? x.orders.length : (x.orders && Array.isArray(x.orders.orders) ? x.orders.orders.length : 0)}`;
    case 'settings-open': return clean(`Settings → ${x.pane}`);
    case 'window-pin': return clean(`window ${x.wid} ${x.on ? 'on top' : 'not on top'}`);
    case 'link-token': return clean(`the link token of ${x.hostKey || '?'} → session ${x.sid || '?'} · ${Number(x.status) || 0}`); // never the token
    case 'upgrade': return clean(`agent ${x.from || '?'} → ${x.version || x.to || '?'}`) + (x.size ? ` · ${size(Number(x.size) || 0)}` : '');
    default: {
      if (k.startsWith('desktop-serve:') || k.startsWith('browser-serve:')) {
        const pr = x.params && typeof x.params === 'object' ? x.params : {};
        const what = pr.name || pr.entryId || (pr.entry && (pr.entry.id || pr.entry.name)) || pr.profileId || pr.profile || pr.kind || pr.url || pr.file || '';
        return clean(`${x.action}${what ? ' ' + what : ''}`);
      }
      return clean(k);
    }
  }
}
/** The output head a line keeps: ≤ OUT_HEAD_BYTES, folded, redacted (stderr first when it has anything). */
function outHeadOf(answer) {
  const a = answer && typeof answer === 'object' ? answer : {};
  const se = typeof a.stderr === 'string' ? a.stderr : '', so = typeof a.stdout === 'string' ? a.stdout : '';
  const t = se.trim() ? se : so;
  if (!t.trim()) return '';
  return cutBytes(redactSecrets(fold(t.slice(0, OUT_HEAD_BYTES * 8))).text.trim(), OUT_HEAD_BYTES);
}
/** The verdict of a device's answer: `{ok, code}` (a command's exit code, a refusal's code, an error's). */
function answerOf(m) {
  if (!m || typeof m !== 'object') return { ok: false, code: 'no_answer' };
  if (m.error) return { ok: false, code: m.timedOut ? 'timeout' : typeof m.code === 'string' ? m.code : m.linkLost ? 'link_lost' : 'error' };
  if (typeof m.code === 'number') return { ok: m.code === 0 && !m.timedOut && !m.truncated, code: m.code };
  const r = m.result && typeof m.result === 'object' ? m.result : m;
  return r.ok === false ? { ok: false, code: r.code || 'failed' } : { ok: true, code: null };
}
const codeOf = (c) => (c == null ? null : typeof c === 'number' && Number.isFinite(c) ? c : String(c).replace(/[^\w.-]/g, '').slice(0, 40) || null);
/** THE audit line (both ends; the device's has no answer fields). */
function lineOf({ at, hostId = null, machine = null, payload, by, ok = null, code = null, outHead = '', ms = null, ask = null, answeredBy = null } = {}) {
  const p = payload || {};
  return {
    at: Number(at) || 0, ...(hostId != null ? { hostId: String(hostId).slice(0, 160) } : {}), ...(machine != null ? { machine: clean(machine, 80) } : {}),
    op: keyOf(p), layer: layerOf(p), by: validBy(by) ? by : null, summary: summaryOf(p),
    ...(ok === null ? {} : { ok: !!ok }), ...(code != null ? { code: codeOf(code) } : {}), ...(outHead ? { outHead: cutBytes(String(outHead), OUT_HEAD_BYTES) } : {}), ...(ms != null ? { ms: Math.max(0, Math.round(Number(ms) || 0)) } : {}),
    ...(askOf(ask) ? { ask } : {}), ...(askOf(ask) && validBy(answeredBy) ? { answeredBy } : {}), // lane hub-act-ask: the ask's verdict + who answered
  };
}
/** int317 (the r2 verify's RED-3): THE link-token door's line — who asked (the session `agent:<sid>`, its host key in the
 *  summary), the outcome as the HTTP status (200 handed · 423 locked · 404 no link · 401 no such session · 500); `hostId` /
 *  `machine` = the hub's record of that machine (its card lists the line). The token is never an argument. */
function linkTokenLine({ at, sid = null, hostKey = null, hostId = null, machine = null, status } = {}) {
  const st = Number(status) || 0;
  // layer `session` (the life of a session's own link back), stated here: it is NO op sent to a device, so it has no TABLE row
  // (a row would need a device-policy flag) — rowOf keeps a stored line's own layer
  return { ...lineOf({ at, hostId: hostId != null ? hostId : hostKey, machine, payload: { op: 'link-token', sid: sid == null ? null : String(sid), hostKey: hostKey == null ? null : String(hostKey), status: st }, by: sid ? byAgent(sid) : null, ok: st === 200, code: st }), layer: 'session' };
}
/** A stored line, judged on the way out: bounded and re-redacted (idempotent). → the row, or null. */
function rowOf(l) {
  if (!l || typeof l !== 'object' || typeof l.op !== 'string') return null;
  const op = l.op.replace(/[^\w:.-]/g, '').slice(0, 60);
  const layer = LAYERS.includes(l.layer) ? l.layer : (Object.prototype.hasOwnProperty.call(TABLE, op) ? TABLE[op] : 'act');
  return {
    at: Number(l.at) || 0, id: typeof l.id === 'string' ? l.id.replace(/[^\w-]/g, '').slice(0, 24) : null,
    hostId: l.hostId == null ? null : String(l.hostId).slice(0, 160), machine: l.machine == null ? null : clean(l.machine, 80),
    op, layer, by: validBy(l.by) ? l.by : null, summary: clean(l.summary),
    ok: l.ok == null ? null : !!l.ok, code: codeOf(l.code), outHead: l.outHead ? cutBytes(redactSecrets(fold(String(l.outHead))).text, OUT_HEAD_BYTES) : '', ms: l.ms == null ? null : Math.max(0, Number(l.ms) || 0),
    ...(askOf(l.ask) ? { ask: l.ask, ...(validBy(l.answeredBy) ? { answeredBy: l.answeredBy } : {}) } : {}),
  };
}

/** The dial-in address key: IPv4 as is (an IPv4-mapped IPv6 unwrapped), an IPv6 address by its /64. */
function addressKeyOf(addr) {
  let a = String(addr == null ? '' : addr).trim().toLowerCase();
  if (!a) return null;
  if (a.startsWith('::ffff:') && /^::ffff:\d{1,3}(\.\d{1,3}){3}$/.test(a)) a = a.slice(7);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) return a;
  if (!/^[0-9a-f:]+$/.test(a) || !a.includes(':')) return a.replace(/[^\w.:-]/g, '').slice(0, 64) || null;
  const [head, tail = ''] = a.split('::');
  const hs = head ? head.split(':') : [], ts = tail ? tail.split(':') : [];
  const full = a.includes('::') ? [...hs, ...Array(Math.max(0, 8 - hs.length - ts.length)).fill('0'), ...ts] : hs;
  return full.slice(0, 4).map((h) => (h || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
/** Is the address loopback (a relay / an ingress in front of this hub — never "new")? */
const isLoopbackAddr = (addr) => LOOPBACK_RE.test(String(addr || '').trim());

module.exports = {
  LAYERS, TABLE, ACTION_OPS, BY_KINDS, ASK_OUTCOMES, SUMMARY_MAX, OUT_HEAD_BYTES, CLIENT_ACT_METHODS, HOST_ARG_METHODS,
  keyOf, layerOf, needsBy, auditable, validBy, kindOf, byHuman, byAgent, byJob, bySystem, byOfWho,
  summaryOf, outHeadOf, answerOf, lineOf, linkTokenLine, rowOf, addressKeyOf, isLoopbackAddr,
};
