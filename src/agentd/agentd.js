// vibespace-agentd — the per-device machine agent (CS refactor M0 skeleton,
// docs/design-remote-cs.md). M0 scope: lifecycle only — flock singleton,
// setsid detach, 0700 unix socket, multi-connection accept, hello/auth
// (vsht_ token, sha-compared against the state file), heartbeat, and
// server-initiated SELF-UPGRADE (bundle streamed on chan 1 → versioned dir →
// atomic `current` repoint → re-exec). NO session/fs/discovery code lives
// here yet (invariant #2: the daemon ships bytes and runs mechanical
// primitives; #1/#7: nothing this process does may ever kill a session).
// Built as a ZERO-DEPENDENCY single-file bundle (npm run build:agentd).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { Mux, PROTO_VERSION } = require('./mux.js');

const VERSION = process.env.VIBESPACE_AGENTD_VERSION || require('./version.js').VERSION;
// VIBESPACE_DEVICE_ROOT is the current name; VIBESPACE_AGENTD_ROOT stays
// honored forever — in-field daemons were installed with it (launchd plists /
// systemd units on user devices reference it)
const ROOT = process.env.VIBESPACE_DEVICE_ROOT || process.env.VIBESPACE_AGENTD_ROOT || path.join(os.homedir(), '.vibespace', 'agentd');

// SPAWN ENV (real xingweil report: Mac dial chat blank — the daemon runs on
// node fine but its subprocess `sh -c` couldn't find node/claude). launchd
// (macOS) / systemd (Linux) start the daemon with a MINIMAL PATH, so every
// child spawn inherited a PATH without the node/CLI dirs — claude never ran.
// Prepend the daemon's OWN node dir (guaranteed) + the standard user/tool bins
// (nvm current, homebrew, ~/.local/bin, /usr/local/bin) to PATH for children.
// Same class as the systemd 'baked PATH' incident (CLAUDE.md §How to Run).
function spawnEnv(extra) {
  const home = os.homedir();
  const nodeDir = path.dirname(process.execPath);
  const extras = [
    nodeDir, path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
  ];
  const merged = { ...process.env, ...(extra || {}) };
  const cur = String(merged.PATH || process.env.PATH || '');
  const parts = cur.split(':').filter(Boolean);
  for (let i = extras.length - 1; i >= 0; i--) if (!parts.includes(extras[i])) parts.unshift(extras[i]);
  merged.PATH = parts.join(':');
  return merged;
}
const STATE = path.join(ROOT, 'state');
// Windows has no unix sockets for node's net.listen — use a named pipe keyed
// by the root path so several per-instance daemons coexist (EXPERIMENTAL).
const SOCK = process.platform === 'win32'
  ? '\\\\.\\pipe\\vibespace-agentd-' + require('crypto').createHash('sha1').update(ROOT).digest('hex').slice(0, 12)
  : path.join(STATE, 'agentd.sock');
const LOCK = path.join(STATE, 'agentd.lock');
const LOG = path.join(STATE, 'agentd.log');
const TOKEN_FILE = path.join(STATE, 'token');

// Recognizable in process listings (user directive: "看进程列表分不清是干啥的").
// Full rename to vibespace-device (bundle/roots/routes) = graduation slice A.
try { process.title = 'vibespace-device'; } catch { }
fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });

// ── STDIO BRIDGE (M2): `agentd.js --stdio` reaches the STANDING daemon over
// ssh — ensure the daemon runs (setsid-detached, so it PERSISTS after this
// bridge / the ssh pipe dies), then pipe our stdin/stdout ↔ its unix socket.
// The server dials remote via `ssh host -- node <agentd> --stdio`; an ssh drop
// kills only this bridge, the daemon + its sessions survive (the keeper's
// persistence, now in the daemon architecture). ──
if (process.argv.includes('--stdio')) {
  const netB = require('net');
  const cpB = require('child_process');
  const connect = (tries = 0) => {
    const c = netB.connect(SOCK);
    c.on('connect', () => {
      process.stdin.pipe(c);
      c.pipe(process.stdout);
      c.on('close', () => process.exit(0));
      process.stdin.on('end', () => { try { c.end(); } catch {} });
    });
    c.on('error', () => {
      if (tries === 0) {
        // daemon not up — spawn it detached from the CURRENT (M2 stdio-bridge)
        // file, then retry connecting to the socket it will create
        const child = cpB.spawn(process.execPath, [__filename], {
          detached: true, stdio: 'ignore', env: process.env,
        });
        child.unref();
      }
      if (tries > 40) { process.stderr.write('vibespace-device --stdio: daemon unreachable\n'); process.exit(6); }
      setTimeout(() => connect(tries + 1), 250);
    });
  };
  connect();
}

// node-pty is loaded LAZILY (only when a session opens) so M0's zero-dep
// bundle keeps working. On localhost the server passes VIBESPACE_NODE_MODULES
// = the repo's node_modules; M2 (remote) will package prebuilds in the bundle.
let _pty = null;
function pty() {
  if (_pty) return _pty;
  // Resolution order: server-passed node_modules (localhost) → the agentd
  // ROOT's own node_modules (installer's best-effort `npm i node-pty` for
  // terminal-on-dial, B-0d70) → bare require (a globally-installed node-pty).
  const p = require('path');
  const candidates = [
    process.env.VIBESPACE_NODE_MODULES && p.join(process.env.VIBESPACE_NODE_MODULES, 'node-pty'),
    p.join(ROOT, 'node_modules', 'node-pty'),
    'node-pty',
  ].filter(Boolean);
  let lastErr;
  for (const c of candidates) { try { _pty = require(c); return _pty; } catch (e) { lastErr = e; } }
  throw new Error('node-pty not available on this device — terminal sessions need it (chat/files/mounts do not). Re-run the pairing installer to add it. (' + (lastErr && lastErr.message) + ')');
}

function pidCmdline(pid) {
  try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf-8').replace(/\0/g, ' '); } catch { return ''; }
}

// ── log (rotated at 5MB ×2) ──
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  try {
    try { if (fs.statSync(LOG).size > 5 * 1024 * 1024) { fs.renameSync(LOG, LOG + '.1'); } } catch { }
    fs.appendFileSync(LOG, line);
  } catch { }
}

// ── flock singleton: O_EXCL pidfile with liveness+identity verification ──
// (no node flock without deps; an exclusive lock file whose pid is verified
// via /proc cmdline (linux) or ps (macOS) is equivalent for our scope)
let blockingPid = null; // set when a live sibling daemon holds the lock
function acquireSingleton() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      process.on('exit', () => { try { fs.unlinkSync(LOCK); } catch { } });
      return true;
    } catch {
      try {
        const pid = Number(fs.readFileSync(LOCK, 'utf-8').trim());
        let cmd = '';
        try { cmd = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf-8').replace(/\0/g, ' '); } catch { }
        // no /proc (macOS/BSD): verify via ps — without this, a RECYCLED pid
        // in a stale lock read as "genuine second instance" forever (any live
        // pid counted as ours), permanently wedging daemon startup
        if (cmd === '') {
          try { cmd = require('child_process').execFileSync('ps', ['-p', String(pid), '-o', 'command='], { timeout: 3000 }).toString().trim(); } catch { }
        }
        let alive = false;
        try { process.kill(pid, 0); alive = true; } catch { }
        // recognize our own daemon by EITHER the bundle name or the process
        // title (process.title='vibespace-device' overwrites /proc/cmdline on
        // Linux, so the old 'agentd'-only check could miss a live sibling)
        if (alive && (cmd === '' || cmd.includes('agentd') || cmd.includes('vibespace-device'))) { blockingPid = pid; return false; } // genuine second instance
        fs.unlinkSync(LOCK); // stale (dead or recycled pid) — retry
      } catch { return false; }
    }
  }
  return false;
}

if (!process.argv.includes('--stdio')) {
if (!acquireSingleton()) {
  process.stderr.write(`vibespace-device: already running (pid ${blockingPid || '?'}, root ${ROOT})` +
    ' — a running daemon adopts a re-pair by itself within ~30s; to force-replace it: kill the pid and the installer/launchd restarts it\n');
  process.exit(3);
}

// read FRESH on every hello (was a startup const): a re-pair rotates the host
// token on disk while the daemon keeps running — a cached hash rejected every
// server hello after an identity rotation until the daemon restarted
const tokenSha = () => {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    return require('crypto').createHash('sha256').update(raw).digest('hex');
  } catch { return null; }
};

log(`vibespace-device ${VERSION} starting (proto ${PROTO_VERSION}, pid ${process.pid})`);
fs.writeFileSync(path.join(STATE, 'agentd.pid'), String(process.pid));

// ── upgrade: receive a new bundle on chan 1, land it versioned, re-exec ──
function beginUpgrade(mux, { version, size }) {
  const dir = path.join(ROOT, version);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, 'agentd.js.tmp');
  const fd = fs.openSync(tmp, 'w', 0o700);
  let got = 0;
  log(`upgrade to ${version} (${size} bytes) begins`);
  return {
    data(buf) {
      fs.writeSync(fd, buf);
      got += buf.length;
      mux.credit(1, buf.length);
      if (got >= size) {
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        // keep whatever filename THIS install runs under (fresh installs are
        // vibespace-device.js, legacy ones agentd.js) — a hardcoded name here
        // would silently rename the daemon back on its first self-upgrade
        const selfName = path.basename(process.argv[1] || 'agentd.js');
        fs.renameSync(tmp, path.join(dir, selfName));
        // atomic current repoint: symlink swap via rename
        const curTmp = path.join(ROOT, '.current.tmp');
        try { fs.unlinkSync(curTmp); } catch { }
        fs.symlinkSync(dir, curTmp);
        fs.renameSync(curTmp, path.join(ROOT, 'current'));
        mux.control({ op: 'upgrade-done', version });
        log(`upgrade to ${version} landed — re-exec`);
        // re-exec from the new dir; the singleton lock is released on exit and
        // NOTHING outside our install dir is touched (invariant #1/#7)
        setTimeout(() => {
          const { spawn } = require('child_process');
          try { fs.unlinkSync(LOCK); } catch { }
          try { fs.unlinkSync(SOCK); } catch { }
          const child = spawn(process.execPath, [path.join(dir, path.basename(process.argv[1] || 'agentd.js'))], {
            detached: true, stdio: 'ignore',
            env: { ...process.env, VIBESPACE_AGENTD_VERSION: version },
          });
          child.unref();
          process.exit(0);
        }, 200);
      }
    },
  };
}

// ── M2 pipe-session registry (keeper semantics inside the daemon) ──
const SESS_DIR = path.join(STATE, 'sessions');
const pipeSessions = {
  _tails: new Map(), // mux → Map(chan → {sid, pos, timer, fd})
  _paths(sid) {
    if (!/^[\w-]+$/.test(sid)) throw new Error('bad sid');
    return {
      out: path.join(SESS_DIR, sid + '.out'),
      fifo: path.join(SESS_DIR, sid + '.in'),
      meta: path.join(SESS_DIR, sid + '.json'),
      err: path.join(SESS_DIR, sid + '.err'),
    };
  },
  _meta(sid) { try { return JSON.parse(fs.readFileSync(this._paths(sid).meta, 'utf-8')); } catch { return null; } },
  _childAlive(m) {
    if (!m || !m.childPid) return false;
    try { process.kill(m.childPid, 0); } catch { return false; }
    const c = pidCmdline(m.childPid);
    const argv0 = path.basename(String((m.cmd && m.cmd[0]) || ''));
    return c === '' ? true : (argv0 ? c.includes(argv0) : false);
  },
  stat(sid) {
    const m = this._meta(sid);
    if (!m) throw new Error('no such pipe session: ' + sid);
    return { pid: m.childPid, exited: m.exited, alive: this._childAlive(m) };
  },
  open({ sid, cmd, args, cwd, env }) {
    fs.mkdirSync(SESS_DIR, { recursive: true, mode: 0o700 });
    const P2 = this._paths(sid);
    const m = this._meta(sid);
    if (m && m.exited === undefined && this._childAlive(m)) return { pid: m.childPid, existing: true };
    if (m && m.exited !== undefined) return { pid: m.childPid, existing: true }; // drain-only: sentinel in buffer
    if (m && !this._childAlive(m)) {
      // crashed without a sentinel — synthesize (never silently respawn: B-0343)
      try { fs.appendFileSync(P2.out, JSON.stringify({ type: '_remote_exit', code: 143, crashed: true }) + '\n'); } catch { }
      fs.writeFileSync(P2.meta, JSON.stringify({ ...m, exited: 143, crashed: true }));
      return { pid: m.childPid, existing: true };
    }
    // fresh spawn: setsid-detached, stdout→file fd, stdin←O_RDWR fifo
    try { fs.unlinkSync(P2.fifo); } catch { }
    const mk = require('child_process').spawnSync('mkfifo', ['-m', '600', P2.fifo]);
    if (mk.status !== 0) throw new Error('mkfifo unavailable');
    const outFd = fs.openSync(P2.out, 'a');
    const errFd = fs.openSync(P2.err, 'a');
    const inFd = fs.openSync(P2.fifo, 'r+');
    // CWD FALLBACK (B-0d70, real xingweil report — the #1 dial-chat-blank
    // cause): the server ships a cwd defaulted to ITS OWN os.homedir()
    // (/home/xingweil on the pod), which does not exist on the device (Mac =
    // /Users/xingweil). child_process.spawn with a nonexistent cwd emits an
    // ASYNC 'error' event, and with no listener that used to CRASH THE WHOLE
    // DAEMON → every session went blank. Resolve to a real dir here and never
    // let a bad cmd/cwd take the daemon down.
    let useCwd = process.env.HOME;
    try { if (cwd && fs.statSync(cwd).isDirectory()) useCwd = cwd; } catch { }
    const child = require('child_process').spawn(cmd, args || [], {
      detached: true, stdio: [inFd, outFd, errFd],
      cwd: useCwd, env: spawnEnv(env),
    });
    child.unref();
    fs.writeFileSync(P2.meta, JSON.stringify({ childPid: child.pid, startedAt: Date.now(), cmd: [cmd, ...(args || [])] }));
    // a spawn failure (ENOENT cmd, EACCES, etc.) arrives async — WITHOUT this
    // listener it is an uncaught 'error' that kills the daemon. Turn it into
    // the normal exit sentinel so the wrapper finalizes instead of hanging.
    child.on('error', (e) => {
      try { fs.appendFileSync(P2.out, JSON.stringify({ type: '_remote_exit', code: 127, spawnError: String(e && e.message || e) }) + '\n'); } catch { }
      try { const cur = this._meta(sid) || {}; fs.writeFileSync(P2.meta, JSON.stringify({ ...cur, exited: 127, exitedAt: Date.now() })); } catch { }
      log(`pipe-session ${sid} spawn error: ${e && e.message}`);
    });
    // we CAN wait on our own detached child — write the real exit sentinel
    child.on('exit', (code) => {
      try { fs.appendFileSync(P2.out, JSON.stringify({ type: '_remote_exit', code: code ?? 0 }) + '\n'); } catch { }
      const cur = this._meta(sid) || {};
      fs.writeFileSync(P2.meta, JSON.stringify({ ...cur, exited: code ?? 0, exitedAt: Date.now() }));
    });
    fs.closeSync(outFd); fs.closeSync(errFd); // child holds its own copies
    log(`pipe-session ${sid} spawned pid=${child.pid}`);
    return { pid: child.pid, existing: false };
  },
  attach(sid, chan, mux, offset) {
    const P2 = this._paths(sid);
    let pos = Math.max(0, offset);
    let fd = null;
    const pump = () => {
      if (fd === null) { try { fd = fs.openSync(P2.out, 'r'); } catch { return; } }
      try {
        const size = fs.fstatSync(fd).size;
        if (pos > size) pos = 0;
        while (pos < size) {
          const want = Math.min(65536, size - pos);
          const b = Buffer.alloc(want);
          const n = fs.readSync(fd, b, 0, want, pos);
          if (n <= 0) break;
          pos += n;
          mux.data(chan, b.subarray(0, n));
        }
      } catch { }
    };
    const timer = setInterval(pump, 150);
    pump();
    let tails = this._tails.get(mux);
    if (!tails) { tails = new Map(); this._tails.set(mux, tails); }
    tails.set(chan, { sid, timer, get fd() { return fd; } });
  },
  writeStdin(mux, chan, buf) {
    const t = this._tails.get(mux)?.get(chan);
    if (!t) return false;
    try {
      const inFd = fs.openSync(this._paths(t.sid).fifo, 'r+');
      fs.writeSync(inFd, buf);
      fs.closeSync(inFd);
      return true;
    } catch { return true; } // attached but stdin gone (exited) — swallow
  },
  detachAll(mux) {
    const tails = this._tails.get(mux);
    if (!tails) return;
    for (const t of tails.values()) { clearInterval(t.timer); try { if (t.fd !== null) fs.closeSync(t.fd); } catch { } }
    this._tails.delete(mux);
  },
  kill(sid) {
    const m = this._meta(sid);
    if (!m) return;
    if (this._childAlive(m)) {
      try { process.kill(m.childPid, 'SIGTERM'); } catch { }
      setTimeout(() => { try { if (this._childAlive(m)) process.kill(m.childPid, 'SIGKILL'); } catch { } }, 2500);
    }
  },
};

// ── M5+: REVERSE TCP FORWARD registry ("互挂云盘" tunnel — the NAT-traversal
// primitive). The server registers a listener; we bind 127.0.0.1:<port> on
// THIS device and push every accepted connection back over the mux as a new
// byte channel (chan ids from 0x40000000 up — never collides with the
// server-allocated 2..N space). The listener OUTLIVES link drops: on mux
// death it is disowned (accepts fail fast) and the reconnecting server
// re-owns it with the SAME port, so a remote rclone mount pointing at the
// port heals without remounting. Loopback bind only — never a general proxy.
const reverseListeners = new Map(); // port → { server, owner: mux|null, disownedAt?: ms }
let pushChanSeq = 0x40000000;

// Reap listeners that were DISOWNED (link dropped) and never re-owned within a
// grace window — covers the mount-removed-while-device-offline case where the
// server never gets to send tcp-unlisten (review finding). A legitimate drop
// re-owns within seconds on reconnect, so 10min is safely past that.
const REVERSE_REAP_MS = 10 * 60 * 1000;
const _reverseReaper = setInterval(() => {
  const now = Date.now();
  for (const [port, L] of reverseListeners) {
    if (L.owner || !L.disownedAt) continue;
    if (now - L.disownedAt < REVERSE_REAP_MS) continue;
    try { L.server.close(); } catch { }
    reverseListeners.delete(port);
    log('reaped stale reverse listener on ' + port + ' (disowned >10min)');
  }
}, 60000);
if (_reverseReaper.unref) _reverseReaper.unref();
function reverseListen(mux, msg) {
  const want = Number(msg.port) || 0;
  const existing = want ? reverseListeners.get(want) : null;
  if (existing) { existing.owner = mux; existing.disownedAt = null; mux.control({ op: 'listen-open', id: msg.id, port: want }); return; }
  const srv = net.createServer((tsock) => {
    const L = reverseListeners.get(srv._vsPort);
    const owner = L && L.owner;
    if (!owner || owner._dead) { tsock.destroy(); return; }
    const chan = pushChanSeq++;
    owner._tcpChans.set(chan, tsock);
    owner.control({ op: 'tcp-accept', port: srv._vsPort, chan }); // MUST precede any data frames
    tsock.on('data', (d) => { try { if (!owner.data(chan, d)) tsock.pause(); } catch { } });
    tsock.on('close', () => { owner._tcpChans.delete(chan); try { owner.control({ op: 'tcp-close', chan }); } catch { } });
    tsock.on('error', () => { });
  });
  srv.on('error', (e) => { try { mux.control({ op: 'listen-open', id: msg.id, error: e.message }); } catch { } });
  srv.listen(want, '127.0.0.1', () => {
    const port = srv.address().port;
    srv._vsPort = port;
    reverseListeners.set(port, { server: srv, owner: mux });
    log(`reverse-forward listening on 127.0.0.1:${port}`);
    mux.control({ op: 'listen-open', id: msg.id, port });
  });
}

// ── device-folder-mount: a minimal read-only WEBDAV server on the device's
// 127.0.0.1 that the server rclone-`webdav`-mounts (over tcp-connect). WebDAV
// (not the plain-`http` backend) is deliberate: rclone's http backend requests
// a fixed 128MB range on every read and then stalls ~6s waiting on the
// keep-alive connection after a clamped 206; the webdav backend requests sane
// ranges and reads cleanly. Verbs: OPTIONS / PROPFIND (Depth 0/1) / HEAD / GET
// (Range). Zero deps — pure node http + fs + string XML (mirrors src/webdav.js).
const folderServers = new Map(); // port → { server, root }
const _xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function _davHref(rel, isDir) {
  const parts = rel.split('/').filter(Boolean).map(encodeURIComponent);
  let h = '/' + parts.join('/');
  if (isDir && !h.endsWith('/')) h += '/';
  return h || '/';
}
function _davEntry(href, name, st) {
  const isDir = st.isDirectory();
  return `<D:response><D:href>${_xmlEsc(href)}</D:href><D:propstat><D:prop>`
    + `<D:displayname>${_xmlEsc(name)}</D:displayname>`
    + `<D:resourcetype>${isDir ? '<D:collection/>' : ''}</D:resourcetype>`
    + `${isDir ? '' : `<D:getcontentlength>${st.size}</D:getcontentlength>`}`
    + `<D:getlastmodified>${new Date(st.mtimeMs).toUTCString()}</D:getlastmodified>`
    + `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
}
function serveFolder(mux, msg) {
  // strip a trailing slash — the confinement below uses `root + path.sep`, so a
  // root ending in '/' becomes a DOUBLE-slash prefix that no real subpath
  // matches → every file 403s (real walter Mac→VibeSpace pull bug)
  const root = (String(msg.path || '').replace(/\/+$/, '')) || '/';
  try { if (!path.isAbsolute(root) || !fs.statSync(root).isDirectory()) throw new Error('not a directory'); }
  catch (e) { mux.control({ op: 'serve-folder-result', id: msg.id, error: e.message }); return; }
  const http = require('http');
  const srv = http.createServer((req, res) => {
    let rel = '/';
    try { rel = decodeURIComponent(req.url.split('?')[0]).replace(/\/+$/, ''); } catch { }
    const abs = path.join(root, rel || '/');
    // confine within root (+ symlink-escape guard via nearest existing
    // ancestor). root='/' needs its own prefix — '/'+sep is '//' which no
    // real subpath starts with (every file of a '/' share 403'd)
    const rootPfx = root === path.sep ? path.sep : root + path.sep;
    if (abs !== root && !abs.startsWith(rootPfx)) { res.writeHead(403); res.end(); return; }
    const contained = (p) => { let pr = p; for (;;) { try { const r = fs.realpathSync(pr); return r === root || r.startsWith(rootPfx); } catch { const up = path.dirname(pr); if (up === pr) return false; pr = up; } } };
    if (!contained(abs)) { res.writeHead(403); res.end(); return; }
    const relFromRoot = path.relative(root, abs);
    if (req.method === 'OPTIONS') {
      res.writeHead(200, { DAV: '1', Allow: 'OPTIONS, PROPFIND, HEAD, GET', 'MS-Author-Via': 'DAV', 'Content-Length': 0 });
      res.end(); return;
    }
    if (req.method === 'PROPFIND') {
      let st; try { st = fs.statSync(abs); } catch { res.writeHead(404); res.end(); return; }
      const depth = req.headers.depth === '0' ? 0 : 1;
      const out = [_davEntry(_davHref(relFromRoot, st.isDirectory()), path.basename(abs) || '/', st)];
      if (depth === 1 && st.isDirectory()) {
        let names = []; try { names = fs.readdirSync(abs); } catch { }
        for (const name of names) { try { const cst = fs.statSync(path.join(abs, name)); out.push(_davEntry(_davHref(path.join(relFromRoot, name), cst.isDirectory()), name, cst)); } catch { } }
      }
      const body = `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${out.join('')}</D:multistatus>`;
      res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
      res.end(body); return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      let st; try { st = fs.statSync(abs); } catch { res.writeHead(404); res.end(); return; }
      if (st.isDirectory()) { res.writeHead(403); res.end(); return; } // clients list via PROPFIND
      const size = st.size;
      let start = 0, end = size - 1, code = 200;
      const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (range && (range[1] || range[2])) {
        if (range[1]) { start = parseInt(range[1], 10); if (range[2]) end = Math.min(parseInt(range[2], 10), size - 1); }
        else { start = Math.max(0, size - parseInt(range[2], 10)); } // suffix range
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
        code = 206;
      }
      const h = { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Last-Modified': new Date(st.mtimeMs).toUTCString() };
      if (code === 206) h['Content-Range'] = `bytes ${start}-${end}/${size}`;
      res.writeHead(code, h);
      if (req.method === 'HEAD') { res.end(); return; }
      const rs = fs.createReadStream(abs, { start, end });
      rs.on('error', () => { try { res.destroy(); } catch { } });
      rs.pipe(res); return;
    }
    res.writeHead(405, { Allow: 'OPTIONS, PROPFIND, HEAD, GET' }); res.end();
  });
  srv.on('error', (e) => { try { mux.control({ op: 'serve-folder-result', id: msg.id, error: e.message }); } catch { } });
  srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port;
    folderServers.set(port, { server: srv, root });
    log(`serve-folder (webdav) ${root} on 127.0.0.1:${port}`);
    mux.control({ op: 'serve-folder-result', id: msg.id, port, root });
  });
}

// ── serve ──
try { fs.unlinkSync(SOCK); } catch { }
// One connection handler for EVERY transport: local unix socket accepts AND
// outbound dial-out websockets (Transport B) — the stream shape is identical.
function serveConnection(sock) {
  let authed = false;
  let upgrade = null;
  const sessions = new Map(); // chan → { proc, credit accounting is per-mux }
  const tcpChans = new Map(); // chan → net.Socket (M4 tcp-forward)
  const mux = new Mux(sock, {
    onControl(msg) {
      if (msg.op === 'hello') {
        if (msg.protoVersion !== PROTO_VERSION) { mux.control({ op: 'proto-mismatch', protoVersion: PROTO_VERSION }); sock.end(); return; }
        const sha = msg.hostToken ? require('crypto').createHash('sha256').update(String(msg.hostToken)).digest('hex') : null;
        const want = tokenSha();
        if (!want || sha !== want) { mux.control({ op: 'auth-fail' }); log('auth-fail from a connection'); sock.end(); return; }
        authed = true;
        mux.control({
          op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: VERSION,
          platform: process.platform, arch: process.arch, nodeVersion: process.version,
          capabilities: [],
        });
        return;
      }
      if (!authed) { sock.end(); return; }
      if (msg.op === 'ok') return; // server accepted us as-is
      if (msg.op === 'upgrade') { upgrade = beginUpgrade(mux, msg); return; }
      if (msg.op === 'ping-info') { mux.control({ op: 'info', version: VERSION, pid: process.pid, uptime: process.uptime() }); return; }
      // ── M1 session primitive: spawn a pty, relay its bytes on a byte channel
      // (invariant #2: mechanical only — no normalization/discovery here). The
      // spawn spec (cmd/args/env) is assembled SERVER-side and shipped here. ──
      // ── M2 persistent PIPE session (chat-class; the keeper model natively):
      // child runs setsid-DETACHED with stdout→buffer file (direct fd) and
      // stdin←O_RDWR fifo — daemon death/upgrade harms it in no way; any
      // connection reattaches by byte offset. Registry survives daemon
      // restarts (state/sessions/<sid>.json). ──
      if (msg.op === 'open-pipe-session') {
        try {
          const r = pipeSessions.open(msg);
          mux.control({ op: 'pipe-session-open', chan: msg.chan, sid: msg.sid, pid: r.pid, existing: r.existing });
          pipeSessions.attach(msg.sid, msg.chan, mux, Number(msg.offset) || 0);
        } catch (e) { mux.control({ op: 'session-error', chan: msg.chan, error: e.message }); }
        return;
      }
      if (msg.op === 'attach-pipe-session') {
        try {
          const st = pipeSessions.stat(msg.sid);
          mux.control({ op: 'pipe-session-open', chan: msg.chan, sid: msg.sid, pid: st.pid, existing: true, exited: st.exited });
          pipeSessions.attach(msg.sid, msg.chan, mux, Number(msg.offset) || 0);
        } catch (e) { mux.control({ op: 'session-error', chan: msg.chan, error: e.message }); }
        return;
      }
      if (msg.op === 'kill-pipe-session') { try { pipeSessions.kill(msg.sid); } catch { } return; }
      // ── M3: fs ops (mechanical; large payloads ride byte channels) ──
      if (msg.op === 'fs-op') {
        (async () => {
          const rid = msg.id;
          try {
            const p = String(msg.path || '');
            if (!path.isAbsolute(p)) throw new Error('absolute path required');
            switch (msg.action) {
              case 'stat': {
                const st = fs.statSync(p);
                mux.control({ op: 'fs-result', id: rid, stat: { size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDirectory(), mode: st.mode } });
                break;
              }
              case 'list': {
                const entries = fs.readdirSync(p, { withFileTypes: true }).slice(0, 5000).map((e) => {
                  let st = null; try { st = fs.statSync(path.join(p, e.name)); } catch { }
                  return { name: e.name, isDir: e.isDirectory(), size: st?.size ?? 0, mtimeMs: st?.mtimeMs ?? 0 };
                });
                mux.control({ op: 'fs-result', id: rid, entries });
                break;
              }
              case 'read-range': {
                // stream [start, start+len) on the given byte channel — the
                // transcript-slab primitive (server keeps its line-index math)
                const fd = fs.openSync(p, 'r');
                try {
                  const size = fs.fstatSync(fd).size;
                  const start = Math.max(0, Number(msg.start) || 0);
                  const want = Math.min(Number(msg.len) || 0, size - start);
                  mux.control({ op: 'fs-result', id: rid, size, sending: Math.max(0, want) });
                  let pos = start;
                  const CHUNK = 65536;
                  while (pos < start + want) {
                    const n = Math.min(CHUNK, start + want - pos);
                    const b = Buffer.alloc(n);
                    const got = fs.readSync(fd, b, 0, n, pos);
                    if (got <= 0) break;
                    mux.data(msg.chan, b.subarray(0, got));
                    pos += got;
                    await new Promise((r) => setImmediate(r)); // yield: credit frames must interleave
                  }
                  mux.control({ op: 'fs-done', id: rid, chan: msg.chan });
                } finally { fs.closeSync(fd); }
                break;
              }
              case 'write': {
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, Buffer.from(String(msg.data64 || ''), 'base64'));
                mux.control({ op: 'fs-result', id: rid, ok: true });
                break;
              }
              case 'mkdir': fs.mkdirSync(p, { recursive: true }); mux.control({ op: 'fs-result', id: rid, ok: true }); break;
              case 'rename': fs.renameSync(p, String(msg.to)); mux.control({ op: 'fs-result', id: rid, ok: true }); break;
              case 'rm': fs.rmSync(p, { recursive: !!msg.recursive, force: true }); mux.control({ op: 'fs-result', id: rid, ok: true }); break;
              default: throw new Error('unknown fs action: ' + msg.action);
            }
          } catch (e) { mux.control({ op: 'fs-result', id: msg.id, error: e.message }); }
        })();
        return;
      }
      // ── M3: session discovery RAW FACTS (locks + jsonl inventory + tail
      // bytes); the lock-first CLAIM algorithm stays server-side ──
      if (msg.op === 'discovery-snapshot') {
        try {
          const home = os.homedir();
          const locks = [];
          try {
            for (const f of fs.readdirSync(path.join(home, '.claude', 'sessions'))) {
              if (!f.endsWith('.json')) continue;
              const pid = Number(f.slice(0, -5));
              let alive = false; try { process.kill(pid, 0); alive = true; } catch { }
              if (!alive) continue;
              try { locks.push({ pid, ...JSON.parse(fs.readFileSync(path.join(home, '.claude', 'sessions', f), 'utf-8')) }); } catch { }
            }
          } catch { }
          const jsonls = [];
          try {
            const projRoot = path.join(home, '.claude', 'projects');
            for (const d of fs.readdirSync(projRoot).slice(0, 500)) {
              const dp = path.join(projRoot, d);
              let files = []; try { files = fs.readdirSync(dp); } catch { continue; }
              for (const f of files) {
                if (!f.endsWith('.jsonl') || f.startsWith('agent-')) continue;
                try {
                  const st = fs.statSync(path.join(dp, f));
                  jsonls.push({ projDir: d, file: f, size: st.size, mtimeMs: st.mtimeMs });
                } catch { }
              }
            }
          } catch { }
          jsonls.sort((a, b) => b.mtimeMs - a.mtimeMs);
          const top = jsonls.slice(0, 200);
          // raw-facts enrichment for the newest files (the ssh script's H/N/T
          // lines): head cwd, first user lines (name candidates), tail ids
          const home2 = os.homedir();
          for (const j of top.slice(0, 60)) {
            try {
              const fp = path.join(home2, '.claude', 'projects', j.projDir, j.file);
              const fd = fs.openSync(fp, 'r');
              try {
                const headB = Buffer.alloc(Math.min(16000, j.size));
                fs.readSync(fd, headB, 0, headB.length, 0);
                const head = headB.toString('utf-8');
                j.headCwd = (head.match(/"cwd":"((?:[^"\\]|\\.)*)"/) || [])[1] || null;
                const users = [];
                for (const line of head.split('\n')) {
                  if (users.length >= 6) break;
                  if (line.includes('"type":"user"')) users.push(line.slice(0, 2000));
                }
                j.userLines = users;
                const tailStart = Math.max(0, j.size - 65536);
                const tailB = Buffer.alloc(j.size - tailStart);
                fs.readSync(fd, tailB, 0, tailB.length, tailStart);
                const ids = [...tailB.toString('utf-8').matchAll(/"sessionId":"([^"]+)"/g)].map((m) => m[1]);
                const uniq = []; for (const idv of ids) { if (uniq[uniq.length - 1] !== idv) uniq.push(idv); }
                j.tailIds = uniq.slice(-8);
              } finally { fs.closeSync(fd); }
            } catch { }
          }
          mux.control({ op: 'discovery-result', id: msg.id, locks, jsonls: top });
        } catch (e) { mux.control({ op: 'discovery-result', id: msg.id, error: e.message }); }
        return;
      }
      if (msg.op === 'discovery-watch') {
        // fs.watch push: any change under sessions/ or projects/ → one
        // debounced 'discovery-dirty' (server re-snapshots; events carry no
        // interpretation — invariant #2)
        try {
          if (!this._discoWatch) {
            const home = os.homedir();
            let timer = null;
            const kick = () => { if (timer) return; timer = setTimeout(() => { timer = null; try { mux.control({ op: 'discovery-dirty' }); } catch { } }, 500); };
            const watches = [];
            for (const d of [path.join(home, '.claude', 'sessions'), path.join(home, '.claude', 'projects')]) {
              try { watches.push(fs.watch(d, { recursive: true }, kick)); } catch { try { watches.push(fs.watch(d, kick)); } catch { } }
            }
            this._discoWatch = watches;
          }
          mux.control({ op: 'discovery-watching', id: msg.id });
        } catch (e) { mux.control({ op: 'discovery-watching', id: msg.id, error: e.message }); }
        return;
      }
      // ── M4: bounded one-shot command (clipboard/xclip class; NOT a shell —
      // argv only, hard timeout, output capped) ──
      if (msg.op === 'run-cmd') {
        try {
          const { execFile } = require('child_process');
          const child = execFile(String(msg.cmd), (msg.args || []).map(String), {
            timeout: Math.min(Number(msg.timeoutMs) || 10000, 30000), maxBuffer: 2 * 1024 * 1024,
            env: spawnEnv(msg.env),
          }, (err, stdout, stderr) => {
            mux.control({ op: 'cmd-result', id: msg.id, code: err ? (err.code ?? 1) : 0, stdout: String(stdout).slice(0, 1024 * 1024), stderr: String(stderr).slice(0, 65536) });
          });
          if (msg.stdin64) { try { child.stdin.end(Buffer.from(msg.stdin64, 'base64')); } catch { } } else { try { child.stdin.end(); } catch { } }
        } catch (e) { mux.control({ op: 'cmd-result', id: msg.id, code: 127, error: e.message }); }
        return;
      }
      // ── M3: streaming exec (usage-scan class: NDJSON output too big for
      // run-cmd's buffer). argv-only; stdout rides the byte channel. ──
      if (msg.op === 'run-stream') {
        try {
          const { spawn: sp } = require('child_process');
          const child = sp(String(msg.cmd), (msg.args || []).map(String), {
            env: spawnEnv(msg.env), cwd: msg.cwd || process.env.HOME,
          });
          const chanS = msg.chan;
          child.stdout.on('data', (d) => { try { mux.data(chanS, d); } catch { } });
          child.stderr.on('data', () => { });
          child.on('exit', (code) => mux.control({ op: 'stream-exit', chan: chanS, code: code ?? 0 }));
          child.on('error', (e) => mux.control({ op: 'stream-exit', chan: chanS, code: 127, error: e.message }));
          if (msg.stdin64) { try { child.stdin.end(Buffer.from(msg.stdin64, 'base64')); } catch { } } else { try { child.stdin.end(); } catch { } }
          mux.control({ op: 'stream-start', id: msg.id, chan: chanS, pid: child.pid });
        } catch (e) { mux.control({ op: 'stream-start', id: msg.id, chan: msg.chan, error: e.message }); }
        return;
      }
      // ── M4: TCP forward (the VNC-bridge shape): byte channel ↔ a LOCAL
      // 127.0.0.1 port on the device. Loopback only — never a general proxy. ──
      if (msg.op === 'tcp-connect') {
        try {
          const port = Number(msg.port);
          if (!port || port < 1 || port > 65535) throw new Error('bad port');
          const tsock = net.connect({ host: '127.0.0.1', port });
          const chanT = msg.chan;
          tsock.on('connect', () => mux.control({ op: 'tcp-open', id: msg.id, chan: chanT }));
          tsock.on('data', (d) => { try { if (!mux.data(chanT, d)) tsock.pause(); } catch { } });
          tsock.on('close', () => { tcpChans.delete(chanT); mux.control({ op: 'tcp-close', chan: chanT }); });
          tsock.on('error', (e) => { tcpChans.delete(chanT); mux.control({ op: 'tcp-open', id: msg.id, chan: chanT, error: e.message }); });
          tcpChans.set(chanT, tsock);
        } catch (e) { mux.control({ op: 'tcp-open', id: msg.id, chan: msg.chan, error: e.message }); }
        return;
      }
      // ── reverse forward (tunnel): bind 127.0.0.1 here, push accepts back ──
      if (msg.op === 'tcp-listen') { reverseListen(mux, msg); return; }
      if (msg.op === 'tcp-unlisten') {
        const L = reverseListeners.get(Number(msg.port));
        if (L) { try { L.server.close(); } catch { } reverseListeners.delete(Number(msg.port)); }
        mux.control({ op: 'listen-open', id: msg.id, port: Number(msg.port), closed: true });
        return;
      }
      // ── device-folder-mount: serve a folder over minimal HTTP so the server
      // can rclone-`http`-mount it (read-only). Loopback only; the server
      // reaches this port via tcp-connect over the mux. Range GET + directory
      // listings (rclone http backend parses <a href> links). ──
      if (msg.op === 'serve-folder') { serveFolder(mux, msg); return; }
      if (msg.op === 'unserve-folder') {
        const s = folderServers.get(Number(msg.port));
        if (s) { try { s.server.close(); } catch { } folderServers.delete(Number(msg.port)); }
        mux.control({ op: 'serve-folder-result', id: msg.id, port: Number(msg.port), closed: true });
        return;
      }
      if (msg.op === 'open-session') {
        try {
          const { chan, cmd, args, cols, rows, cwd, env } = msg;
          if (!chan || chan < 1) throw new Error('bad session channel');
          // same cwd-exists fallback as pipe-sessions — a stale/deleted cwd
          // otherwise dies at chdir instead of opening in $HOME
          let useCwd = process.env.HOME || '/';
          try { if (cwd && fs.statSync(cwd).isDirectory()) useCwd = cwd; } catch { }
          const proc = pty().spawn(cmd, args || [], {
            name: 'xterm-256color', cols: cols || 120, rows: rows || 30,
            cwd: useCwd,
            env: spawnEnv({ ...(env || {}), TERM: 'xterm-256color', COLORTERM: 'truecolor' }),
          });
          sessions.set(chan, { proc });
          proc.onData((d) => { try { mux.data(chan, Buffer.from(d, 'utf-8')); } catch { } });
          proc.onExit(({ exitCode }) => {
            sessions.delete(chan);
            mux.control({ op: 'session-exit', chan, code: exitCode });
          });
          mux.control({ op: 'session-open', chan, pid: proc.pid });
        } catch (e) {
          mux.control({ op: 'session-error', chan: msg.chan, error: e.message });
        }
        return;
      }
      if (msg.op === 'resize-session') {
        const sx = sessions.get(msg.chan);
        if (sx) { try { sx.proc.resize(msg.cols, msg.rows); } catch { } }
        return;
      }
      if (msg.op === 'kill-session') {
        const sx = sessions.get(msg.chan);
        if (sx) { try { sx.proc.kill(); } catch { } sessions.delete(msg.chan); }
        return;
      }
      log('unknown control op: ' + msg.op);
    },
    onData(chan, buf) {
      if (!authed) return;
      if (chan === 1 && upgrade) { upgrade.data(buf); return; }
      const sx = sessions.get(chan);
      if (sx) { try { sx.proc.write(buf.toString('utf-8')); } catch { } mux.credit(chan, buf.length); return; }
      if (pipeSessions.writeStdin(mux, chan, buf)) { mux.credit(chan, buf.length); return; }
      const t = tcpChans.get(chan);
      if (t) {
        // credit only after the socket drains — otherwise a fast peer piles a
        // whole file transfer into node memory (backpressure, both tcp paths)
        let ok = false; try { ok = t.write(buf); } catch { }
        if (ok) mux.credit(chan, buf.length);
        else t.once('drain', () => { try { mux.credit(chan, buf.length); } catch { } });
      }
    },
    onClose(chan) {
      // peer half-closed a byte channel — tear down the matching local socket
      const t = tcpChans.get(chan);
      if (t) { tcpChans.delete(chan); try { t.destroy(); } catch { } }
    },
    onWritable(chan) { try { tcpChans.get(chan)?.resume?.(); } catch { } },
    onDead() {
      // connection gone: dtach-attach ptys are DETACH points — killing the
      // attach does NOT kill the dtach session (invariant #1: session survives
      // server/daemon death). So we DETACH (kill the attach proc) but the
      // underlying dtach session keeps running for the next connect.
      for (const { proc } of sessions.values()) { try { proc.kill(); } catch { } }
      sessions.clear();
      for (const t of tcpChans.values()) { try { t.destroy(); } catch { } }
      tcpChans.clear();
      // disown (NOT close) reverse listeners: the port stays bound so a
      // reconnecting server re-owns it and remote mounts heal in place. Stamp
      // disownedAt so the reaper can reclaim it if it's never re-owned.
      for (const L of reverseListeners.values()) { if (L.owner === mux) { L.owner = null; L.disownedAt = Date.now(); } }
      if (this._discoWatch) { for (const w of this._discoWatch) { try { w.close(); } catch { } } this._discoWatch = null; }
      pipeSessions.detachAll(mux);
    },
  });
  mux._tcpChans = tcpChans; // reverse-forward accepts push sockets into the owner's map
}
const server = net.createServer(serveConnection);
server.listen(SOCK, () => {
  try { fs.chmodSync(SOCK, 0o600); } catch { }
  log('listening on ' + SOCK);
});
server.on('error', (e) => { log('server error: ' + e.message); process.exit(1); });

// ── Transport B: dial-out (M4-lite). `--dial <wss-url> --dial-token <t>`
// persists the dial config; every boot re-dials. The outbound ws is served by
// the SAME connection handler — the server speaks hello over it like any
// transport (auth still via the device token in hello; the dial token only
// gates the server's upgrade endpoint). Reconnect with backoff, forever —
// a NAT'd device keeps itself reachable. ──
const DIAL_FILE = path.join(STATE, 'dial.json');
(function setupDial() {
  const di = process.argv.indexOf('--dial');
  if (di >= 0) {
    const cfg = { url: process.argv[di + 1], token: (process.argv[process.argv.indexOf('--dial-token') + 1] || '') };
    try { fs.writeFileSync(DIAL_FILE, JSON.stringify(cfg), { mode: 0o600 }); } catch { }
  }
  const readCfg = () => { try { return JSON.parse(fs.readFileSync(DIAL_FILE, 'utf-8')); } catch { return null; } };
  let cfg = readCfg();
  if (!cfg?.url) return;
  const wsMin = require('./ws-min.js');
  let attempts = 0;
  let cfgKey = cfg.url + '|' + (cfg.token || '');
  const dial = () => {
    // re-read the dial config EVERY attempt: a re-pair (identity rotation)
    // rewrites dial.json on disk while this daemon keeps running — the old
    // in-memory identity was rejected forever and the singleton blocked a
    // replacement daemon (real walter incident: 'already running' + REJECTED
    // loop + launchd respawn spam). Parse failure keeps the last good cfg.
    const fresh = readCfg();
    if (fresh?.url) {
      const k = fresh.url + '|' + (fresh.token || '');
      if (k !== cfgKey) { log('dial config changed on disk — adopting the new pairing'); attempts = 0; }
      cfgKey = k; cfg = fresh;
    }
    const ws = wsMin.connect(cfg.url, { headers: { 'x-vibespace-dial-token': cfg.token || '' } });
    let up = false;
    ws.on('open', () => { up = true; attempts = 0; log('dial-out connected: ' + cfg.url); serveConnection(ws); });
    ws.on('close', () => {
      const delay = [1000, 2000, 5000, 15000, 30000][Math.min(4, attempts++)];
      log(`dial-out ${up ? 'lost' : 'failed'} — retry in ${delay}ms`);
      setTimeout(dial, delay);
    });
  };
  dial();
})();

process.on('SIGTERM', () => { log('SIGTERM — exiting (sessions unaffected by design)'); process.exit(0); });
} // end !--stdio daemon body
