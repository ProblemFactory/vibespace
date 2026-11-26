'use strict';
// THE HUB'S HTTPS ADDRESS — the I/O half of src/tls-plan.js (PURE). Lane https-tailscale (2026-10-12).
//   · ONE PORT: `front` (net) listens on PORT and peeks each connection's first byte — 0x16 (a TLS ClientHello) goes to
//     the https server, anything else to the http server (`socket.unshift` + `emit('connection')`): plain http through
//     the demux is byte-identical, so a pod behind an https ingress and every localhost caller (hooks, agent tools,
//     VIBESPACE_API) see no change. A ClientHello while no certificate is live is closed.
//   · TRANSPARENT (lane https-demux-witness): a handed-over socket gets what its server's OWN accept gives (acceptAs —
//     TCP_NODELAY, half-open, keep-alive): the bare front left Nagle on, so compression()'s late body waited ~40 ms for
//     the browser's delayed ACK and the Apps list answered after the witness push it should precede (the push lost).
//   · BOTH servers get every listener: server.js attaches its upgrade dispatcher through attachToServers() — the https
//     server is born later (the first live certificate) and replays them (test-architecture §89 = the census).
//   · THE PASS (at boot, then on TP.nextPassMs — a boot miss retries at 60 s / 5 min, else hourly —, when the setting moves,
//     and on POST /api/tls/recheck, the Settings row's Check again): `tailscale status --json` as a CHILD (10 s, never sync),
//     the plan, and when it says renew: `tailscale cert --cert-file … --key-file … <domain>` (a child, 90 s, ONE in
//     flight) into data/tls/. A new certificate = `setSecureContext` — no restart.
//   · THE OWNER'S STEP (https-not-enabled / operator-needed): ONE For-you item per state, persisted in
//     data/tls/state.json so a restart never repeats it; it resolves itself when the state changes.
//   · A FAILED CALL IS LOGGED RAW (lane tls-pass-retry, owner on .260 "怎么用不了https地址"): code, ms, stdout bytes, the first
//     stderr line — and the row shows it. Measured: at boot the loop was held (canary 7450 ms) past execFile's 10 s
//     `timeout`, whose kill destroys the UNREAD stdout first — an answer the child had given in ms came back as
//     `code 0, out ''` ⇒ "Tailscale is not running". runChild keeps its own timer and never discards an answer.
//   · THE TIMER ANSWERS (B-92a4, lane boot-probes-unkillable — the boot restore's fuser / pgrep / fd-scan questions ride
//     runChild too): a child that cannot die on TERM (a `fuser` in D state on an NFS fd walk) never fired execFile's
//     callback, so the promise never settled and production's hub did not listen for 96 s. At its bound runChild now
//     settles TIMEOUT with whatever the child wrote, KILLs it 1 s later if it is still there and lets it go.
const fs = require('fs');
const path = require('path');
const net = require('net');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');
const TP = require('../tls-plan.js');
const SR = require('../store-read.js');   // B-f276 (lane hub-loop-stalls, r4719): data/tls/state.json under the store-read law…
const HOLD = require('../store-read-hold.js');   // …and its hold: a record that could not be read is HELD, never a first run

const STATUS_TIMEOUT_MS = 10000;
const CERT_TIMEOUT_MS = 90000;
const PASS_MS = TP.PASS_MS;
const FIRST_BYTE_MS = 120000; // a connection that never says anything is dropped (the servers' own timeouts start at routing)
const HOLD_MAX_MS = 5000; // B-cd4b: the boot's listen step holds a new connection's hand-over at most this long (said, then let go)
const INBOX_KEY = 'tls';

/** What `server`'s own accept gives a connection (net onconnection: TCP_NODELAY, half-open, TCP keep-alive) — the
 *  demux applies it to the socket it hands over, so a request under it behaves like plain listen. */
function acceptAs(server, socket) {
  socket.setNoDelay(!!server.noDelay);
  socket.allowHalfOpen = !!server.allowHalfOpen;
  if (server.keepAlive) socket.setKeepAlive(true, server.keepAliveInitialDelay || 0);
}

/** A child process, never sync: { code, out, err, ms } — code 'ENOENT' when the binary is missing, 'TIMEOUT' when OUR
 *  bound answered for it. Not execFile's `timeout`: its kill destroys the unread stdout, so a bound that fires late on a held
 *  loop threw away an answer the child had already given (code 0, out ''). A child that exited first keeps its answer.
 *  THE BOUND IS AN ANSWER, NEVER A WAIT (B-92a4): at `timeout` the child gets TERM and, one turn later (the I/O a held loop
 *  runs after its timers), unless it has exited or closed its stdout (then its own answer follows), the promise settles
 *  { code: 'TIMEOUT', out: <what it wrote so far>, err: 'timeout' }. KILL_AFTER_MS later a child still there gets KILL,
 *  and its handle + pipes are let go (unref, destroyed) so nothing waits on it; a late execFile callback is a no-op.
 *  One console line per (bin, basename of its path argument) per process — never the argument itself. */
const KILL_AFTER_MS = 1000;
const timedOutOnce = new Set();
function runChild(bin, args, timeout) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let bound = null, killer = null, timedOut = false, settled = false, ended = false, out = '', err = '';
    const settle = (r) => {
      if (settled) return;
      settled = true;
      if (r.code === 'TIMEOUT') {
        const p = (args || []).find((a) => typeof a === 'string' && a.startsWith('/')), key = p ? `${bin} ${path.basename(p)}` : String(bin);
        if (!timedOutOnce.has(key)) { timedOutOnce.add(key); console.warn(`[child] ${key}: no answer in ${timeout} ms — answered TIMEOUT (${Buffer.byteLength(r.out)} bytes kept); TERM, KILL ${KILL_AFTER_MS} ms later if it is still there`); }
      }
      resolve({ ...r, ms: Date.now() - t0 });
    };
    const child = execFile(bin, args, { maxBuffer: 4 * 1024 * 1024 }, (e, o, se) => {
      clearTimeout(bound); clearTimeout(killer);
      settle({ code: e ? (e.code === 'ENOENT' ? 'ENOENT' : timedOut && e.signal ? 'TIMEOUT' : e.code || e.signal || 1) : 0, out: String(o || ''), err: String(se || (e && e.message) || '') });
    });
    if (child.stdout) { child.stdout.on('data', (d) => { out += d; }); child.stdout.on('end', () => { ended = true; }); }
    if (child.stderr) child.stderr.on('data', (d) => { err += d; });
    const gone = () => child.exitCode !== null || child.signalCode !== null;
    bound = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { }
      killer = setTimeout(() => {
        if (!gone()) { try { child.kill('SIGKILL'); } catch { } }
        settle({ code: 'TIMEOUT', out, err: 'timeout' }); // exited, but a grandchild still holds its pipe: no close will come
        try { child.unref(); } catch { }
        for (const st of [child.stdin, child.stdout, child.stderr]) { try { if (st) st.destroy(); } catch { } }
      }, KILL_AFTER_MS);
      setImmediate(() => { if (!gone() && !ended) settle({ code: 'TIMEOUT', out, err: 'timeout' }); });
    }, timeout);
  });
}

/** B-323e (lane bl-keys-misc, 主开发 r1351 (6)): THE PASS'S CHILDREN ride the hub's starter (src/server/child-starter.js) — the
 *  hourly `tailscale status` / `tailscale cert` never fork the hub on its timer. runChild's answer: {code: 0 | n | 'ENOENT' |
 *  'TIMEOUT', out, err, ms}; the starter's «no answer» reads TIMEOUT (it did not answer in time). The boot's liveness probes
 *  (src/server/boot-restore.js) keep runChild — a start's, named in the start census; its RE-PROBE ladder (a timer) rides this one
 *  (B-323e's remainder, lane nl-starts), handing the names it sets (`envAdd`: the hub's PATH of the moment) and runChild's buffer. */
function runViaStarter(bin, args, timeout, { envAdd = null, maxBuffer = 1024 * 1024 } = {}) {
  const t0 = Date.now();
  return Promise.resolve().then(() => require('./child-starter').childStarter().run(bin, args, { timeoutMs: timeout, capture: true, maxBuffer, ...(envAdd ? { envAdd } : {}) })).then((r) => {
    const code = !r || r.unknown || r.timedOut ? 'TIMEOUT' : r.started === false ? (r.error === 'ENOENT' ? 'ENOENT' : (r.error || 1)) : r.overflow ? 1 : r.code === 0 ? 0 : (r.code != null ? r.code : (r.signal || 1));
    return { code, out: String((r && r.stdout) || ''), err: String((r && (r.stderr || r.error)) || (code === 'TIMEOUT' ? 'timeout' : '')), ms: Date.now() - t0 };
  }, (e) => ({ code: 1, out: '', err: String((e && e.message) || e), ms: Date.now() - t0 }));
}

/** The facts of a cert+key pair on disk: { cert, key, notAfter, names, pem } (pem only when both read). */
async function readPair(certFile, keyFile) {
  const out = { cert: false, key: false, notAfter: null, names: [], pem: null };
  let cert = null, key = null;
  try { cert = await fs.promises.readFile(certFile); out.cert = true; } catch { }
  try { key = await fs.promises.readFile(keyFile); out.key = true; } catch { }
  if (!cert || !key) return out;
  try {
    const x = new crypto.X509Certificate(cert);
    out.notAfter = Date.parse(x.validTo) || null;
    out.names = String(x.subjectAltName || '').split(',').map((s) => s.trim().replace(/^(DNS|IP Address):/, '')).filter(Boolean);
    out.pem = { cert, key };
  } catch { out.cert = false; }
  return out;
}

function create({ app, httpServer, dataDir, port, serverSetting = () => undefined, getUserTodos = () => null, log = console, env = process.env,
  tailscaleBin: binArg, run = runViaStarter, now = () => Date.now(), user = (() => { try { return os.userInfo().username; } catch { return 'vibespace'; } })(),
  statusTimeoutMs = STATUS_TIMEOUT_MS, timers = { setTimeout, clearTimeout }, step = (name, fn) => fn(), holdMaxMs = HOLD_MAX_MS, onCertificate = () => { } } = {}) {   // onCertificate(pem | null): the live pair changed (B2b: a piped hub pushes it to the interface, which holds the port)
  const tailscaleBin = binArg === null ? null : binArg || env.VIBESPACE_TAILSCALE_BIN || 'tailscale';
  const dir = path.join(dataDir, 'tls');
  const stateFile = path.join(dir, 'state.json');
  const FRESH = () => ({ domain: null, certAnswer: null, noticed: null, itemId: null });
  let state = FRESH();
  // B-f276 (lane hub-loop-stalls, r4719) — THE STORE-READ LAW. The release read a failed read or torn bytes as a FIRST RUN: the HTTPS
  // For-you item was filed AGAIN and the open one's id lost (never resolved: two items, the old one open for good), and the next save
  // wrote that over the file. Now through store-read's answer to the hold (code `tls_state_unread`). HELD: notice() files and resolves
  // NOTHING (said once a hold) and saveState writes nothing — the serving plan itself goes on (the record only says what was told);
  // LIFTED: the record read (this run's own Tailscale facts kept: its domain and cert answer are the newer), notice() rules again.
  // TORN: kept aside once, then empty (the hold's own law)
  const isState = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  let heldSaid = false, certWhileHeld = null;   // a cert call that answered while the record was held: the newer answer
  const stateHold = HOLD.create({ file: stateFile, valid: isState, code: 'tls_state_unread', aside: (m) => stateFile + '.corrupt-' + m,
    words: (h) => `the HTTPS record (the For-you item it opened) could not be read (${h && h.code}) — VibeSpace reads it again by itself; nothing is written over it, and the HTTPS item waits until it reads`,
    log: (l) => log.warn?.(`[tls] ${l}`),
    onLift: (v) => {
      const mem = state; state = Object.assign(FRESH(), isState(v) ? v : {}); heldSaid = false;
      let moved = false;
      // this run's Tailscale named ANOTHER domain while held: its facts are the newer (its cert answer with it); the SAME domain keeps
      // the record's cert answer — never reset by the failed read (the adversarial read's note) — unless a cert call answered meanwhile
      if (mem.domain && mem.domain !== state.domain) { state.domain = mem.domain; state.certAnswer = mem.certAnswer; moved = true; }
      else if (certWhileHeld && certWhileHeld.answer !== state.certAnswer) { state.certAnswer = certWhileHeld.answer; moved = true; }
      certWhileHeld = null;
      if (moved) saveState();
      if (plan) notice(plan);
    } });
  { let read; try { read = { text: fs.readFileSync(stateFile, 'utf8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: isState });   // the HTTPS record: THE ANCHOR (test-data-store-census)
    if (stateHold.start(a) === 'data') Object.assign(state, a.value); }
  const saveState = () => { if (!stateHold.writable('a write of the HTTPS record')) return; try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(stateFile + '.tmp', stateFile); } catch (e) { log.warn?.(`[tls] state not saved — ${e.message}`); } };
  const setting = () => { try { return serverSetting('server.https') || 'auto'; } catch { return 'auto'; } };

  let httpsServer = null, liveFp = null, plan = null, lastLine = null, inFlight = null, timer = null, planSetting = null;
  let started = false, liveOnce = false, misses = 0, nextMs = null, lastProbe = null; // the pass cadence + the last failed call's raw outcome
  const failed = (cmd, r, bound) => { lastProbe = TP.probeLine(cmd, r, bound); log.warn?.(`[tls] ${lastProbe.line}`); };
  const listeners = []; // [event, fn] — replayed on the https server when it is born
  const serving = () => !!(plan && plan.serving && liveFp && setting() !== 'off');

  /** THE one way a listener reaches the hub's servers (§89): the http server now, the https one now or at birth. */
  function attachToServers(event, fn) {
    listeners.push([event, fn]);
    httpServer.on(event, fn);
    if (httpsServer) httpsServer.on(event, fn);
  }
  function useCertificate(pem) {
    const fp = crypto.createHash('sha256').update(pem.cert).update(pem.key).digest('hex');
    if (fp === liveFp) return;
    if (!httpsServer) {
      httpsServer = https.createServer({ cert: pem.cert, key: pem.key }, app);
      for (const [e, f] of listeners) httpsServer.on(e, f);
    } else httpsServer.setSecureContext({ cert: pem.cert, key: pem.key }); // a renewal: no restart
    liveFp = fp;
    try { onCertificate(pem); } catch { }
  }

  // ── the demux ──
  const front = net.createServer((socket) => {
    const drop = () => socket.destroy();
    socket.on('error', drop); // a reset before the first byte
    socket.setTimeout(FIRST_BYTE_MS, drop);
    socket.once('data', (chunk) => {
      socket.removeListener('timeout', drop); socket.setTimeout(0);
      socket.pause();
      socket.unshift(chunk);
      const hand = () => {
        socket.removeListener('error', drop); // the servers' own listeners from here (a reset while held is dropped as before the first byte)
        if (socket.destroyed) return;
        if (chunk[0] === 0x16) {
          if (!serving()) return socket.destroy();
          acceptAs(httpsServer, socket);
          httpsServer.emit('connection', socket);
        } else { acceptAs(httpServer, socket); httpServer.emit('connection', socket); }
        process.nextTick(() => socket.resume());
      };
      if (held) held.then(() => setImmediate(hand));   // a turn after the step's last: the hand-overs never share its hold (a throw in hand reaches the process, as unheld)
      else hand();
    });
  });

  // ── THE BOOT'S LISTEN STEP IN TURNS (B-cd4b, the round's follow) ──
  // server.js's listen callback runs the restore's registration and the rest of its step each in a loop turn of its own
  // (src/server/loop-turns.js: after a timers phase, one job a turn), so the loop turns between them. A connection that
  // arrives meanwhile is accepted and its first bytes read, and it is handed to the servers in the turn after the step's last
  // has run: nothing asks the hub's PORT for a conversation before every survivor is in the live set, and every request sees the
  // step whole — as when the step was one turn. (The agent door, src/server/agent-listener.js, is its own loopback port and is
  // not held here.) `step(name, fn)` names the turn's hold in the boot trace (server.js wires bootTrace.step). Bounded: past
  // holdMaxMs the hold is said and let go — after a step turn already queued (setImmediate: a stalled poll phase that fires the
  // bound and the next turn's hop together still runs the turn first); a step that never ends never stops the hub answering. A step
  // turn that itself runs past the bound is never cut: the bound fires after it. With the registration in batches (B-cd4b unit 3)
  // the bound can end BETWEEN two batches when a restore takes longer than it (thousands of survivors: about 3 800 at 32 a turn) —
  // a request may then arrive before the live set is whole; under that, the hold lasts until the listen step's rest has run.
  let stepTurns = 0, held = null, lift = null, holdTimer = null;
  const letGo = () => { if (holdTimer) { timers.clearTimeout(holdTimer); holdTimer = null; } const l = lift; held = null; lift = null; if (l) l(); };
  function turn(fn, name = 'turn') {
    if (typeof fn !== 'function') throw new TypeError('tls: turn(fn, name) takes a function');
    if (!stepTurns++ && !held) {
      held = new Promise((r) => { lift = r; });
      holdTimer = timers.setTimeout(() => { holdTimer = null; log.warn?.(`[tls] the boot's listen step held new connections ${holdMaxMs} ms — handed over now (its turns still run)`); setImmediate(letGo); }, holdMaxMs);
      holdTimer.unref?.();
    }
    require('./loop-turns.js').turn(() => { try { step(name, fn); } finally { if (!--stepTurns) letGo(); } });
  }

  function applyPlan(p, pem) {
    plan = p;
    if (p.serving && pem) useCertificate(pem);
    else if (!p.serving) { if (liveFp !== null) { try { onCertificate(null); } catch { } } liveFp = null; }
    if (p.line !== lastLine) { lastLine = p.line; log.log?.(`[tls] ${p.line}`); }
    notice(p);
  }
  function notice(p) {
    if (stateHold.held()) { if (!heldSaid && (p.notice || state.noticed)) { heldSaid = true; log.warn?.(`[tls] the HTTPS For-you item waits — ${stateHold.words()}`); } return; }   // B-f276: HELD — nothing filed or resolved
    const todos = getUserTodos && getUserTodos();
    if (p.notice && state.noticed !== p.why) {
      if (!todos) return; // filed at the next pass, when the For-you tray exists
      resolveItem(todos); // the previous state's step is done (or moot) — one open item at a time
      try {
        const r = todos.add(INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'HTTPS', text: p.words, i18n: { text: p.i18n } });
        state.itemId = (r && (r.id || (r.item && r.item.id))) || null;
      } catch (e) { log.warn?.(`[tls] the For-you item was not filed — ${e && e.message}`); return; }
      state.noticed = p.why; saveState();
    } else if (!p.notice && state.noticed) {
      resolveItem(todos);
      state.noticed = null; state.itemId = null; saveState();
    }
  }
  function resolveItem(todos) {
    try { if (todos && state.itemId && todos.get(state.itemId) && todos.get(state.itemId).status === 'open') todos.setStatus(state.itemId, 'done', 'agent'); } catch { /* the owner cleared it */ }
  }

  async function facts() {
    const set = setting();
    planSetting = set;
    const base = { setting: set, env, now: now(), port, user, dir: 'data/tls' };
    if (set === 'off') return { args: base, pem: null };
    if (env.VIBESPACE_TLS_CERT || env.VIBESPACE_TLS_KEY || set === 'files') {
      const f = env.VIBESPACE_TLS_CERT && env.VIBESPACE_TLS_KEY ? await readPair(env.VIBESPACE_TLS_CERT, env.VIBESPACE_TLS_KEY) : { pem: null };
      return { args: { ...base, files: { envReadable: !!f.pem, envNames: f.names || [], envNotAfter: f.notAfter } }, pem: f.pem };
    }
    const r = tailscaleBin ? await run(tailscaleBin, ['status', '--json'], statusTimeoutMs) : { code: 'ENOENT' }; // null = a throwaway root: never the real tailscale
    let status = null, error = null, unreadable = false;
    if (r.code === 'ENOENT') error = 'ENOENT';
    else { try { status = JSON.parse(r.out); } catch { } }
    // no JSON: timed out, said "ok" with nothing / half a JSON (unreadable), or the CLI's own error words (no-tailscale / socket)
    if (!status && r.code !== 'ENOENT') { unreadable = r.code === 'TIMEOUT' || r.code === 0 || /^\s*[{[]/.test(r.out || ''); if (!unreadable) error = (r.err || r.out || String(r.code)).trim(); }
    if (status) lastProbe = null; else failed('status', r, statusTimeoutMs);
    const domain = status ? TP.domainOf(status) : null;
    if (domain && domain !== state.domain) { state.domain = domain; state.certAnswer = null; saveState(); }
    const f = domain ? await readPair(path.join(dir, domain + '.crt'), path.join(dir, domain + '.key')) : {};
    return { args: { ...base, tailscale: { status, error, unreadable, certAnswer: state.certAnswer }, files: { cert: !!f.cert, key: !!f.key, notAfter: f.notAfter } }, pem: f.pem || null };
  }
  async function passOnce() {
    let { args, pem } = await facts();
    let p = TP.tlsPlan(args);
    if (p.renew && p.domain) {
      try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch { }
      const r = await run(tailscaleBin, ['cert', '--cert-file', path.join(dir, p.domain + '.crt'), '--key-file', path.join(dir, p.domain + '.key'), p.domain], CERT_TIMEOUT_MS);
      const answer = r.code === 0 ? null : (r.err || r.out || String(r.code)).trim().slice(0, 500);
      if (stateHold.held()) certWhileHeld = { answer };   // B-f276: kept for the lift (the record is not written while held)
      if (answer !== state.certAnswer) { state.certAnswer = answer; saveState(); }
      if (answer) failed('cert', r, CERT_TIMEOUT_MS);
      ({ args, pem } = await facts());
      p = TP.tlsPlan(args);
    }
    applyPlan(p, pem);
    if (p.serving) liveOnce = true;
    misses = TP.isMiss(p) ? misses + 1 : 0;
    return p;
  }
  /** One pass at a time — a second caller shares the one in flight. Every pass that ends sets the next automatic one. */
  function pass() {
    if (!inFlight) inFlight = passOnce().catch((e) => { log.warn?.(`[tls] pass failed — ${e && e.message}`); return plan; }).finally(() => { inFlight = null; schedule(); });
    return inFlight;
  }
  function schedule() {
    if (!started) return;
    if (timer) timers.clearTimeout(timer);
    nextMs = TP.nextPassMs({ plan, liveOnce, misses });
    timer = timers.setTimeout(pass, nextMs); timer.unref?.();
  }

  /** Boot, before listen: the last certificate on disk is served at once (no child process on the boot path). */
  function loadSync() {
    const pair = env.VIBESPACE_TLS_CERT && env.VIBESPACE_TLS_KEY ? [env.VIBESPACE_TLS_CERT, env.VIBESPACE_TLS_KEY] : state.domain ? [path.join(dir, state.domain + '.crt'), path.join(dir, state.domain + '.key')] : null;
    if (!pair) return;
    try {
      const pem = { cert: fs.readFileSync(pair[0]), key: fs.readFileSync(pair[1]) };
      const x = new crypto.X509Certificate(pem.cert);
      const notAfter = Date.parse(x.validTo) || 0;
      if (notAfter <= now()) return;
      const names = String(x.subjectAltName || '').split(',').map((s) => s.trim().replace(/^(DNS|IP Address):/, '')).filter(Boolean);
      const host = env.VIBESPACE_TLS_CERT ? names[0] || 'localhost' : state.domain;
      const url = `https://${host}:${port}`;
      plan = { mode: env.VIBESPACE_TLS_CERT ? 'files' : 'tailscale', serving: true, domain: host, url, notAfter, why: 'boot', words: TP.WORDS.secure.replace('{url}', url), i18n: { key: TP.WORDS.secure, params: { url } }, notice: false };
      useCertificate(pem);
    } catch { /* the first pass says why */ }
  }
  loadSync();

  function start() { started = true; pass(); }
  function stop() { started = false; if (timer) timers.clearTimeout(timer); timer = null; }
  /** The live https address (null while none is served). */
  const url = () => (serving() ? plan.url : null);
  /** The boot line's tail: " and https://<domain>:<port>" while a certificate is live. */
  const bootSuffix = () => (url() ? ` and ${url()}` : '');
  function status() {
    const p = plan || { mode: 'off', why: 'starting', words: '', i18n: null };
    const probe = lastProbe && p.mode === 'off' ? { cmd: lastProbe.cmd, code: lastProbe.code, ms: lastProbe.ms, bytes: lastProbe.bytes, err: lastProbe.err, bound: lastProbe.cmd === 'cert' ? CERT_TIMEOUT_MS : statusTimeoutMs } : null;
    return { mode: p.mode, setting: setting(), serving: serving(), url: url(), domain: p.domain || null, why: p.why, words: p.words, i18n: p.i18n, notAfter: p.notAfter || null, port, probe, nextPassMs: started ? nextMs : null, recordHeld: stateHold.held() ? { code: 'tls_state_unread', words: stateHold.words() } : null };   // B-f276: the record unread, said by name
  }
  function registerRoutes(a) {
    a.get('/api/tls', (req, res) => {
      if (planSetting !== null && setting() !== planSetting) pass(); // the Settings row moved: re-plan now, answer with what is live
      res.json(status());
    });
    // the Settings row's Check again: a pass NOW (the person never waits for the timer). People only — an agent token is refused by name.
    a.post('/api/tls/recheck', async (req, res) => {
      if (/^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''))) return res.status(403).json({ error: 'the https re-check is the person\'s door — an agent token may not press it', code: 'agent-forbidden' });
      await pass();
      res.json(status());
    });
  }
  return { front, attachToServers, listen: (...a) => front.listen(...a), address: () => front.address(), start, stop, pass, url, bootSuffix, status, registerRoutes, turn, holding: () => !!held,
    _https: () => httpsServer, _state: () => ({ ...state }), stateHeld: () => stateHold.held(), stopHold: () => stateHold.stop(), _cadence: () => ({ started, liveOnce, misses, nextMs }), INBOX_KEY };
}

module.exports = { create, acceptAs, runChild, runViaStarter, readPair, INBOX_KEY, STATUS_TIMEOUT_MS, CERT_TIMEOUT_MS, PASS_MS, KILL_AFTER_MS };
