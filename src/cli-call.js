'use strict';
/**
 * cli-call.js — THE ONE CALL an agent CLI (data/bin/vibespace-*) makes to its hub (lane cli-call-timeouts, hub feedback
 * 2026-10-23: «vibespace-task progress hung for 30+ min … while the hub answered http in 1 ms; the same line re-issued
 * 3 min later landed in 2 s»).
 *
 * THE LAW: a CLI call is BOUNDED and NAMES ITS WAIT. Every call carries a budget by its verb class (BUDGETS: a read
 * 15 s, a write 30 s, a wake / dispatch 60 s; a long-poll adds the wait it asked the hub for; `--timeout <s>` overrides)
 * and, when the budget runs out, prints ONE line saying WHICH wait ran out and exits EXPIRED_EXIT (124) — never hangs:
 *   connect — the hub never took the connection (nothing was sent);
 *   answer  — the hub took the request and sent no answer;
 *   step    — the hub said it is waiting on a named step of its own (a 103 beacon carrying `X-VibeSpace-Step: <key>`,
 *             sent by the hub's half below, stepAhead(); STEP_WORDS words the key) and that step did not return;
 *   body    — the hub answered but the rest of its answer did not arrive.
 * A read's line stops there; a write's / wake's adds that it may still take effect (look before repeating it).
 *
 * The timing and the words are PURE (parseDuration, takeTimeout, budgetOf, phaseOf, expiryLine); call() is the ONE
 * transport (node http / https: fetch cannot tell the connection from the answer, and its own caps are 300 s). The
 * module is shipped BESIDE the CLIs (copied at boot to data/bin/cli-call.js by src/server/agent-tool-generators.js;
 * hosts.js AGENT_TOOLS) ⇒ node builtins only. Suite: scripts/test-cli-call.mjs; the census that every CLI's hub call
 * goes through call(): test-architecture §99.
 */

const BUDGETS = Object.freeze({ read: 15000, write: 30000, wake: 60000 });
const EXPIRED_EXIT = 124;
const STEP_HEADER = 'x-vibespace-step';
/** The server-side steps a hub may name while it waits (a closed table of KEYS — the hub sends facts, the CLI words them). */
const STEP_WORDS = Object.freeze({
  'folder-write': 'the shared folder write',
  'folder-read': 'the shared folder read',
  compact: "the worker's compaction",
  approval: "the user's approval",
  vendor: 'the vendor call',
  command: 'the command',
});
const stepKey = (k) => String(k == null ? '' : k).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
/** a step KEY → its words; a key this copy does not know is still named, never dropped */
const stepWords = (k) => { const key = stepKey(k); return !key ? '' : (STEP_WORDS[key] || `its "${key}" step`); };
const secs = (ms) => { const s = Number(ms) / 1000; return Number.isInteger(s) || s >= 10 ? String(Math.round(s)) : s.toFixed(1); };

/** '30' / '30s' / '2m' / '1500ms' / '1h' → ms; anything else (0, negative, words) → null */
function parseDuration(v) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)?\s*$/i.exec(String(v == null ? '' : v));
  if (!m) return null;
  const n = Number(m[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[(m[2] || 's').toLowerCase()];
  return n > 0 && Number.isFinite(n) ? Math.round(n) : null;
}

/** Strip the override flag from argv — `--timeout <s>` / `--timeout=<s>` by default; a CLI whose `--timeout` already
 *  means something else (a job's run time, a wait loop) passes ['--call-timeout']. Stops at `--` (what follows is a
 *  command's own argv). → { argv, ms (null = the class budgets), flag (the name the line teaches), error } */
function takeTimeout(argv, flags = ['--timeout']) {
  const out = []; let ms = null; let error = null;
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const a = String(list[i]);
    if (a === '--') { out.push(...list.slice(i)); break; }
    const eq = flags.find((f) => a.startsWith(f + '='));
    let v;
    if (flags.includes(a)) v = list[++i];
    else if (eq) v = a.slice(eq.length + 1);
    else { out.push(list[i]); continue; }
    const n = parseDuration(v);
    if (n == null) error = `${eq || a} wants a duration in seconds (30, 90s, 2m) — got ${v === undefined ? 'nothing' : JSON.stringify(String(v).slice(0, 40))}`;
    else ms = n;
  }
  return { argv: out, ms, flag: flags[0], error };
}

/** The budget of ONE call: the override (--timeout) or the call site's own base (`ms`, a known server hold) or the
 *  class budget — plus `extraMs`, the wait a long-poll itself asked the hub for (always added: it is the caller's own). */
function budgetOf({ cls = 'read', ms = null, extraMs = 0, override = null } = {}) {
  const base = Number(override) > 0 ? Number(override) : Number(ms) > 0 ? Number(ms) : (BUDGETS[cls] || BUDGETS.read);
  return Math.round(base + (Number(extraMs) > 0 ? Number(extraMs) : 0));
}
/** the class of a call by its method when the call site names none: a GET reads, anything else writes */
const classOf = (method, cls) => (BUDGETS[cls] ? cls : String(method || 'GET').toUpperCase() === 'GET' ? 'read' : 'write');

/** Which wait is running, from what the call has seen so far. */
function phaseOf({ connected = false, answered = false, step = '' } = {}) {
  if (!connected) return 'connect';
  if (step) return 'step';
  return answered ? 'body' : 'answer';
}

/** THE ONE LINE an expired call prints (no newline). */
function expiryLine({ tool = 'vibespace', phase = 'answer', ms = 0, step = '', cls = 'read', origin = '', status = 0, flag = '--timeout' } = {}) {
  const n = secs(ms);
  const longer = ` (${flag || '--timeout'} <seconds> waits longer)`;
  if (phase === 'connect') return `${tool}: the hub${origin ? ` at ${origin}` : ''} did not take the connection in ${n} s — nothing was sent${longer}`;
  const what = phase === 'step' && stepWords(step) ? `the hub answered the request but ${stepWords(step)} did not return in ${n} s`
    : phase === 'body' ? `the hub answered${Number(status) ? ` (HTTP ${Number(status)})` : ''} but the rest of its answer did not arrive in ${n} s`
      : `the hub did not answer in ${n} s`;
  const maybe = cls === 'read' ? '' : ' — it may still take effect: look before you repeat it';
  return `${tool}: ${what}${maybe}${longer}`;
}

// ── the transport ──
const CONF = { tool: 'vibespace', override: null, flag: '--timeout' };
/** once per CLI process: its name (the line's head) and the --timeout it was given (takeTimeout's ms / flag) */
function configure({ tool, override, flag } = {}) {
  if (tool) CONF.tool = String(tool);
  if (override !== undefined) CONF.override = Number(override) > 0 ? Number(override) : null;
  if (flag) CONF.flag = String(flag);
  return { ...CONF };
}

/** A CLI's first line: take its override flag(s) out of process.argv IN PLACE (every parser after it reads argv
 *  unchanged), configure the line's head; a bad value is refused by name (exit 2, nothing sent). */
function cliStart({ tool, flags = ['--timeout', '--call-timeout'] } = {}) {
  const t = takeTimeout(process.argv.slice(2), flags);
  if (t.error) { try { process.stderr.write(`${tool || CONF.tool}: refused — ${t.error}; nothing was sent\n`); } catch { } process.exit(2); }
  process.argv.splice(2, process.argv.length - 2, ...t.argv);
  return configure({ tool, override: t.ms, flag: t.flag });
}

const headerObject = (h) => {
  const out = {};
  if (!h) return out;
  const pairs = typeof h.entries === 'function' && !Array.isArray(h) && typeof h.get === 'function' ? [...h.entries()] : Object.entries(h);
  for (const [k, v] of pairs) if (v !== undefined && v !== null) out[String(k).toLowerCase()] = String(v);
  return out;
};
/** a request body → bytes; FormData / Blob / URLSearchParams through the platform's own encoder (it names the boundary) */
async function bodyBytes(body, headers) {
  if (body === undefined || body === null) return null;
  if (typeof body.pipe === 'function') return body;   // a node stream (a file upload): piped as it is, never buffered
  if (typeof body === 'string') return Buffer.from(body);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  const r = new Response(body);
  const ct = r.headers.get('content-type');
  if (ct && !headers['content-type']) headers['content-type'] = ct;
  return Buffer.from(await r.arrayBuffer());
}
const responseOf = (res, body, method) => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers || {})) {
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else if (v !== undefined) headers.set(k, String(v));
  }
  const bodiless = [204, 205, 304].includes(res.statusCode) || String(method).toUpperCase() === 'HEAD';
  return new Response(bodiless ? null : body, { status: res.statusCode, statusText: res.statusMessage || '', headers });
};

/**
 * THE ONE CALL. `fetch`-shaped: resolves a real Response (ok / status / headers / json() / text() / arrayBuffer()),
 * REJECTS on a network error (a refused / reset connection — the call sites' own catch words it). opts:
 *   method / headers / body   as fetch (a node Readable body is piped; an answer before its last byte stops the sending);
 *   signal                    an AbortSignal: an abort rejects (AbortError) and drops the connection;
 *   cls                       'read' | 'write' | 'wake' (default: GET reads, anything else writes);
 *   ms                        the call site's own base budget (a hold the hub is known to take), else the class's;
 *   extraMs                   the wait a long-poll asked the hub for (added to the budget);
 *   stream                    resolve at the answer's headers with the body as a stream (the budget still runs to its end);
 *   onExpiry                  'exit' (default: print THE line, exit 124) | 'throw' (reject an Error{code:'CLI_CALL_EXPIRED', line, phase});
 *   tool                      the line's head (default: configure()'s).
 */
function call(url, opts = {}) {
  const method = String(opts.method || 'GET').toUpperCase();
  const cls = classOf(method, opts.cls);
  const tool = opts.tool || CONF.tool;
  const budget = budgetOf({ cls, ms: opts.ms, extraMs: opts.extraMs, override: CONF.override });
  const headers = headerObject(opts.headers);
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(String(url)); } catch (e) { reject(e); return; }
    const lib = u.protocol === 'https:' ? require('node:https') : require('node:http');
    const seen = { connected: false, answered: false, step: '', status: 0 };
    let req = null; let res = null; let settled = false; let agent = false;
    const done = () => { clearTimeout(timer); };
    const settle = (fn, v) => { if (settled) return; settled = true; if (!opts.stream || fn === reject) done(); if (agent) { try { agent.destroy(); } catch { /* gone */ } } fn(v); };
    const timer = setTimeout(() => {
      const phase = phaseOf(seen);
      const line = expiryLine({ tool, phase, ms: budget, step: seen.step, cls, origin: u.host, status: seen.status, flag: CONF.flag });
      const was = settled; settled = true;   // first: dropping the connection below emits its own errors, which must not answer
      const throwing = opts.onExpiry === 'throw';
      const e = Object.assign(new Error(line), { code: 'CLI_CALL_EXPIRED', line, phase, step: stepKey(seen.step) });
      try { if (req) req.destroy(); } catch { /* gone */ }
      try { if (res) res.destroy(throwing && was ? e : undefined); } catch { /* gone */ }   // a streamed body errors with the line
      if (throwing) { if (!was) reject(e); return; }
      try { process.stderr.write(line + '\n'); } catch { /* the line is best-effort, the exit is not */ }
      process.exit(EXPIRED_EXIT);
    }, budget);
    bodyBytes(opts.body, headers).then((bytes) => {
      if (settled) return;
      const piped = bytes && typeof bytes.pipe === 'function' ? bytes : null;
      if (bytes && !piped && headers['content-length'] === undefined) headers['content-length'] = String(bytes.length);
      // a STREAMED upload keeps its connection (keep-alive, its own agent, destroyed once answered): the hub then reads past a
      // refusal it answers before the last byte and the answer is READ — with `Connection: close` it hung up at once and the
      // next body write raced the answer as `write EPIPE` (int346: test-exit-run's push onto an existing file, 2 of 6 red)
      if (piped) agent = new lib.Agent({ keepAlive: true, maxSockets: 1 });
      req = lib.request(u, { method, headers, agent }, (r) => {
        res = r;
        seen.connected = true; seen.answered = true; seen.status = r.statusCode;
        seen.step = r.headers[STEP_HEADER] ? String(r.headers[STEP_HEADER]) : '';   // a 103's step is over once the answer comes
        r.on('aborted', () => settle(reject, new Error('the hub closed the connection mid-answer')));
        if (opts.stream) {   // node's own bridge (no stream of ours): a cancel destroys the answer, its end / close stops the clock
          r.on('end', done); r.on('close', done);
          settle(resolve, responseOf(r, require('node:stream').Readable.toWeb(r), method));
          return;
        }
        const chunks = [];
        r.on('data', (d) => chunks.push(d));
        r.on('end', () => { if (piped) { try { piped.destroy(); } catch { /* ended */ } } settle(resolve, responseOf(r, Buffer.concat(chunks), method)); });
        r.on('error', (e) => settle(reject, e));
      });
      req.on('socket', (s) => { if (!s.connecting) seen.connected = true; else s.once('connect', () => { seen.connected = true; }); });
      req.on('information', (i) => { const s = i && i.headers && i.headers[STEP_HEADER]; if (s) seen.step = String(s); });
      req.on('error', (e) => { if (!res) settle(reject, e); });   // node's own error (its code + 'connect ECONNREFUSED <host>'): the call sites word it
      if (opts.signal) {
        const abort = () => { try { req.destroy(); } catch { /* gone */ } settle(reject, Object.assign(new Error('the call was aborted'), { name: 'AbortError', code: 'ABORT_ERR' })); };
        if (opts.signal.aborted) { abort(); return; }
        opts.signal.addEventListener('abort', abort, { once: true });
      }
      if (piped) { piped.on('error', (e) => { try { req.destroy(); } catch { /* gone */ } settle(reject, e); }); piped.pipe(req); return; }
      if (bytes) req.write(bytes);
      req.end();
    }, (e) => settle(reject, e));
  });
}

// ── the hub's half ──
/** Before a route waits on a step of its own that can be slow (a worker's compaction, a folder on a mount), it NAMES it:
 *  a 103 informational answer carrying `X-VibeSpace-Step: <key>` — the final status stays free, a client that does not
 *  read 1xx (fetch) skips it. Node sends a 103 only with a Link header, so one rides along (it preloads nothing). */
function stepAhead(res, key) {
  const k = stepKey(key);
  if (!k || !res || res.headersSent || typeof res.writeEarlyHints !== 'function') return false;
  try { res.writeEarlyHints({ link: '</api/agent/docs>; rel=preconnect', [STEP_HEADER]: k }); return true; } catch { return false; }
}

module.exports = { cliStart, stepAhead, BUDGETS, EXPIRED_EXIT, STEP_HEADER, STEP_WORDS, stepWords, parseDuration, takeTimeout, budgetOf, classOf, phaseOf, expiryLine, configure, call };
