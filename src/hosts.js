/**
 * HostManager — SSH host registry for remote sessions (collaboration P2).
 *
 * - Host records in data/hosts.json: {id, name, user, host, port, keyPath}.
 *   No secrets stored — auth is ssh key based (reuses ~/.ssh by default; an
 *   in-app generated ed25519 pair lives in data/ssh/ with the public key
 *   surfaced for authorized_keys).
 * - Connectivity test: `ssh -o BatchMode=yes … true` (never prompts).
 * - Remote session discovery runs over ssh on demand (lock files + project
 *   JSONL listing), cached with a short TTL — no daemon on the remote.
 * - Remote transcripts stay on the remote host by design; resume/fork must
 *   target the same host (session records carry `host`).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const SSH_BASE_OPTS = [
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=6',
  '-o', 'StrictHostKeyChecking=accept-new',
];

class HostManager {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this._file = path.join(dataDir, 'hosts.json');
    this._sshDir = path.join(dataDir, 'ssh');
    this._state = { hosts: [] };
    this._discoveryCache = new Map(); // hostId -> {at, sessions}
    this._load();
  }

  _load() {
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { /* fresh */ }
    if (!Array.isArray(this._state.hosts)) this._state.hosts = [];
  }

  _save() {
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2));
    fs.renameSync(tmp, this._file);
  }

  list() { return this._state.hosts.map(h => ({ ...h })); }

  get(id) {
    const h = this._state.hosts.find(x => x.id === id);
    if (!h) throw new Error('host not found');
    return h;
  }

  add({ name, user, host, port, keyPath, privateKey }) {
    if (!host) throw new Error('host required');
    if (!user) throw new Error('user required');
    const id = 'host-' + crypto.randomBytes(4).toString('hex');
    // Pasted/uploaded private key → stored per-host under data/ssh, 0600.
    // BatchMode ssh can't prompt, so passphrase-protected keys won't work.
    if (privateKey && String(privateKey).trim()) {
      const body = String(privateKey).replace(/\r\n/g, '\n').trim() + '\n';
      if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(body)) throw new Error('Not a valid private key (missing BEGIN PRIVATE KEY header)');
      if (/ENCRYPTED/.test(body.split('\n').slice(0, 3).join('\n'))) throw new Error('Key is passphrase-protected — ssh runs non-interactively; provide an unencrypted key');
      fs.mkdirSync(this._sshDir, { recursive: true, mode: 0o700 });
      const kp = path.join(this._sshDir, `${id}.key`);
      fs.writeFileSync(kp, body, { mode: 0o600 });
      keyPath = kp;
    }
    const rec = {
      id,
      name: String(name || host).slice(0, 60),
      user: String(user), host: String(host),
      port: Number(port) || 22,
      keyPath: keyPath ? String(keyPath) : null,
      createdAt: Date.now(),
    };
    if (this._state.hosts.some(h => h.name === rec.name)) throw new Error('A host with that name exists');
    this._state.hosts.push(rec);
    this._save();
    return rec.id;
  }

  remove(id) {
    const h = this.get(id);
    // uploaded per-host key files are ours to clean up
    if (h.keyPath && h.keyPath.startsWith(this._sshDir) && h.keyPath.endsWith(`${id}.key`)) {
      try { fs.unlinkSync(h.keyPath); } catch {}
    }
    this._state.hosts = this._state.hosts.filter(x => x.id !== id);
    this._discoveryCache.delete(id);
    this._save();
  }

  /** Config transfer: host records + the private-key TEXT of any uploaded keys. */
  exportBundle() {
    const keys = {};
    for (const h of this._state.hosts) {
      if (h.keyPath && h.keyPath.startsWith(this._sshDir)) {
        try { keys[h.id] = fs.readFileSync(h.keyPath, 'utf-8'); } catch {}
      }
    }
    return { hosts: this._state.hosts, keys };
  }

  /** Import a host bundle — records REPLACE, uploaded keys rewritten (0600). */
  importBundle(bundle) {
    if (!bundle || !Array.isArray(bundle.hosts)) return;
    fs.mkdirSync(this._sshDir, { recursive: true, mode: 0o700 });
    const hosts = [];
    for (const h of bundle.hosts) {
      const rec = { ...h };
      const keyText = bundle.keys?.[h.id];
      if (keyText && h.keyPath && h.keyPath.startsWith(this._sshDir)) {
        // rebase the key under THIS instance's ssh dir
        const kp = path.join(this._sshDir, `${h.id}.key`);
        fs.writeFileSync(kp, keyText, { mode: 0o600 });
        rec.keyPath = kp;
      } else if (h.keyPath && h.keyPath.startsWith(this._sshDir)) {
        rec.keyPath = null; // key text missing — fall back to ~/.ssh
      }
      hosts.push(rec);
    }
    this._state.hosts = hosts;
    this._save();
  }

  /** ssh argv for a host (shared by test/discovery/bootstrap/session spawn). */
  sshArgs(h, { tty = false } = {}) {
    const args = [...SSH_BASE_OPTS, '-p', String(h.port || 22)];
    if (h.keyPath) args.push('-i', h.keyPath, '-o', 'IdentitiesOnly=yes');
    if (tty) args.push('-t');
    args.push(`${h.user}@${h.host}`);
    return args;
  }

  _ssh(h, remoteCmd, { timeoutMs = 15000, maxBuffer = 4 * 1024 * 1024, encoding } = {}) {
    return new Promise((resolve, reject) => {
      execFile('ssh', [...this.sshArgs(h), '--', remoteCmd], { timeout: timeoutMs, maxBuffer, ...(encoding !== undefined ? { encoding } : {}) }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)));
        resolve(stdout);
      });
    });
  }

  /** Connectivity + remote tool inventory in ONE round trip. */
  async test(id) {
    const h = this.get(id);
    const probe = 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; echo VS-OK; for c in dtach node claude codex; do command -v $c >/dev/null 2>&1 && printf "%s=yes " $c || printf "%s=no " $c; done; echo; uname -sm';
    const t0 = Date.now();
    const out = await this._ssh(h, probe, { timeoutMs: 10000 });
    if (!out.includes('VS-OK')) throw new Error('unexpected response');
    const tools = {};
    for (const m of out.matchAll(/(\w+)=(yes|no)/g)) tools[m[1]] = m[2] === 'yes';
    return { ok: true, latencyMs: Date.now() - t0, tools, uname: (out.trim().split('\n').pop() || '').trim() };
  }

  /** Remote directory autocomplete — ls the parent dir over ssh, prefix-filter. */
  async dirComplete(id, input) {
    const h = this.get(id);
    const raw = String(input || '');
    const slash = raw.lastIndexOf('/');
    const parent = slash >= 0 ? raw.slice(0, slash) || '/' : '';
    const prefix = slash >= 0 ? raw.slice(slash + 1) : raw;
    const base = (parent === '' || parent === '~') ? '"$HOME"' : `'${parent.replace(/'/g, `'\\''`)}'`;
    const out = await this._ssh(h, `cd ${base} 2>/dev/null && ls -1ap 2>/dev/null | grep '/$' | head -60`, { timeoutMs: 6000 }).catch(() => '');
    const shownParent = (parent === '' || parent === '~') ? '~' : parent;
    return out.split('\n')
      .map(s => s.replace(/\/$/, ''))
      .filter(s => s && s !== '.' && s !== '..' && s.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, 20)
      .map(s => (shownParent === '/' ? '/' : shownParent + '/') + s);
  }

  /** Backend status on a host (mirrors local /api/backend-status shape). */
  async backendStatus(id) {
    const h = this.get(id);
    const probe = 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; '
      + 'for c in claude codex; do '
      + 'if command -v $c >/dev/null 2>&1; then v=$($c --version 2>/dev/null | head -1); echo "$c|yes|$v"; else echo "$c|no|"; fi; done; '
      // login state: creds file existence, same heuristic as local
      + '[ -f "$HOME/.claude/.credentials.json" ] && echo "claude-login|yes" || echo "claude-login|no"; '
      + '[ -f "$HOME/.codex/auth.json" ] && echo "codex-login|yes" || echo "codex-login|no"';
    const out = await this._ssh(h, probe, { timeoutMs: 10000 });
    const st = { claude: {}, codex: {} };
    for (const line of out.split('\n')) {
      const [k, v, ver] = line.split('|');
      if (k === 'claude' || k === 'codex') { st[k].installed = v === 'yes'; if (ver) st[k].version = ver.trim(); }
      else if (k === 'claude-login') st.claude.loggedIn = v === 'yes';
      else if (k === 'codex-login') st.codex.loggedIn = v === 'yes';
    }
    return st;
  }

  // ── In-app key generation (optional; default is the user's own ~/.ssh) ──

  keyInfo() {
    const priv = path.join(this._sshDir, 'id_ed25519');
    try {
      const pub = fs.readFileSync(priv + '.pub', 'utf-8').trim();
      return { exists: true, path: priv, publicKey: pub };
    } catch { return { exists: false, path: priv, publicKey: null }; }
  }

  generateKey() {
    if (this.keyInfo().exists) return this.keyInfo();
    fs.mkdirSync(this._sshDir, { recursive: true, mode: 0o700 });
    return new Promise((resolve, reject) => {
      execFile('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'vibespace', '-f', path.join(this._sshDir, 'id_ed25519')], (err) => {
        if (err) return reject(new Error('ssh-keygen failed: ' + err.message));
        resolve(this.keyInfo());
      });
    });
  }

  // ── Remote session transcripts (JSONL over ssh → local cache) ──
  // The cache makes remote sessions first-class: findSessionJsonlPath scans
  // data/remote-jsonl/<hostId>/, so history load / View History / pagination /
  // search all work unchanged. Invalidation by remote size+mtime (one ssh stat
  // when fresh; stat+cat when stale). Session ids are UUIDs — no collisions.
  async fetchSessionJsonl(id, sessionId, { maxBytes = 64 * 1024 * 1024 } = {}) {
    if (!/^[\w-]+$/.test(sessionId)) throw new Error('bad session id');
    const h = this.get(id);
    const dir = path.join(this.dataDir, 'remote-jsonl', id);
    const cachePath = path.join(dir, sessionId + '.jsonl');
    const metaPath = cachePath + '.meta';
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
    const probe = `f=$(find "$HOME"/.claude/projects -maxdepth 2 -name ${JSON.stringify(sessionId + '.jsonl')} 2>/dev/null | head -1); [ -n "$f" ] && stat -c '%s %Y' "$f" && echo "$f"`;
    const out = (await this._ssh(h, probe, { timeoutMs: 15000 })).toString().trim();
    if (!out) return fs.existsSync(cachePath) ? cachePath : null; // gone remotely — keep stale cache if any
    const [sizeMtime, remotePath] = [out.split('\n')[0], out.split('\n')[1]];
    const [size, mtime] = sizeMtime.split(' ').map(Number);
    if (meta && meta.size === size && meta.mtime === mtime && fs.existsSync(cachePath)) return cachePath;
    if (size > maxBytes) throw new Error(`remote transcript too large (${(size / 1048576) | 0}MB)`);
    const buf = await this._ssh(h, `cat ${JSON.stringify(remotePath)}`, { timeoutMs: 120000, maxBuffer: maxBytes + 1024, encoding: 'buffer' });
    fs.mkdirSync(dir, { recursive: true });
    const tmp = cachePath + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, cachePath);
    fs.writeFileSync(metaPath, JSON.stringify({ size, mtime, fetchedAt: Date.now() }));
    return cachePath;
  }

  // ── Remote session discovery (lock-first, same algorithm as local) ──

  async discoverSessions(id, { ttlMs = 15000 } = {}) {
    const h = this.get(id);
    const hit = this._discoveryCache.get(id);
    if (hit && Date.now() - hit.at < ttlMs) return hit.sessions;
    // One round trip: alive lock files + all project JSONLs (path, mtime, size)
    const script = `
      find "$HOME"/.claude/sessions -maxdepth 1 -name '*.json' 2>/dev/null | while read -r f; do
        pid=$(basename "$f" .json)
        kill -0 "$pid" 2>/dev/null && { echo "LOCK $(cat "$f")"; }
      done
      find "$HOME"/.claude/projects -maxdepth 2 -name '*.jsonl' ! -name 'agent-*' -printf 'J %T@ %s %p\\n' 2>/dev/null | sort -rn -k2 | head -200
      # cwd from the head of each JSONL (projDir decode is ambiguous; the first
      # record may be a summary without cwd, so grep the first cwd field instead)
      find "$HOME"/.claude/projects -maxdepth 2 -name '*.jsonl' ! -name 'agent-*' -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -60 | while read -r _ f; do
        printf 'H %s\\t' "$f"; head -c 16000 "$f" | grep -o '"cwd":"[^"]*"' | head -n 1; echo
        printf 'N %s\\t' "$f"; grep -m1 '"type":"user"' "$f" 2>/dev/null | head -c 1500; echo
      done
    `.trim();
    const out = await this._ssh(h, script, { timeoutMs: 20000 });
    const locks = [];
    const jsonls = [];
    const heads = new Map(); // jsonl path -> first record (cwd source)
    for (const line of out.split('\n')) {
      if (line.startsWith('LOCK ')) { try { locks.push(JSON.parse(line.slice(5))); } catch {} }
      else if (line.startsWith('J ')) {
        const m = line.match(/^J ([\d.]+) (\d+) (.+)$/);
        if (m) jsonls.push({ mtime: parseFloat(m[1]) * 1000, size: +m[2], path: m[3] });
      } else if (line.startsWith('H ')) {
        const t = line.indexOf('\t');
        const m = t > 2 && line.slice(t + 1).match(/^"cwd":"([^"]*)"/);
        if (m) heads.set(line.slice(2, t), { ...(heads.get(line.slice(2, t)) || {}), cwd: m[1] });
      } else if (line.startsWith('N ')) {
        const t = line.indexOf('\t');
        if (t > 2) {
          const fp = line.slice(2, t);
          // first user record → session name (same rule as local naming);
          // content is either a plain string ("content":"...") or an array of
          // blocks ("content":[{"type":"text","text":"..."}]) — support both.
          // The line may be truncated at 1500 bytes.
          const seg = line.slice(t + 1);
          const m = seg.match(/"content":"((?:[^"\\]|\\.)*)"/) || seg.match(/"text":"((?:[^"\\]|\\.)*)"/);
          if (m) {
            let name = null;
            try { name = JSON.parse('"' + m[1] + '"'); } catch { name = m[1]; }
            name = (name || '').replace(/\s+/g, ' ').trim();
            if (name && !name.startsWith('<')) heads.set(fp, { ...(heads.get(fp) || {}), name: name.slice(0, 80) });
          }
        }
      }
    }
    // lock-first claim: newest JSONL in the lock's project dir = RUNNING
    const encode = (cwd) => cwd.replace(/[/._]/g, '-');
    const claimed = new Set();
    const sessions = [];
    for (const lock of locks) {
      const dir = encode(lock.cwd || '');
      const cand = jsonls.filter(j => path.basename(path.dirname(j.path)) === dir && !claimed.has(j.path))
        .sort((a, b) => b.mtime - a.mtime)[0];
      if (cand) {
        claimed.add(cand.path);
        sessions.push({ sessionId: path.basename(cand.path, '.jsonl'), cwd: lock.cwd, status: 'remote-running', host: h.id, hostName: h.name, mtime: cand.mtime });
      }
    }
    for (const j of jsonls) {
      if (claimed.has(j.path)) continue;
      const head = heads.get(j.path);
      sessions.push({ sessionId: path.basename(j.path, '.jsonl'), cwd: head?.cwd || null, name: head?.name || null, projDir: path.basename(path.dirname(j.path)), status: 'remote-stopped', host: h.id, hostName: h.name, mtime: j.mtime });
    }
    this._discoveryCache.set(id, { at: Date.now(), sessions });
    return sessions;
  }
}

// ── Bootstrap ──
// One ssh session runs a step-marked script; the caller receives structured
// progress events (step start/ok/fail) plus the raw log stream — the UI shows
// a step list with an expandable live log. Idempotent: every step checks
// before installing.
const BOOTSTRAP_STEPS = [
  { key: 'connect', label: 'Connect' },
  { key: 'dtach', label: 'dtach (session persistence)' },
  { key: 'node', label: 'Node.js' },
  { key: 'claude', label: 'Claude Code CLI' },
];

function bootstrapScript() {
  return `
set -u
export PATH="$HOME/.local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
step() { echo "::STEP:$1:$2::"; }
step connect start
echo "connected: $(uname -sm) — $(whoami)@$(hostname)"
step connect ok

step dtach start
if command -v dtach >/dev/null 2>&1; then
  echo "dtach already installed: $(command -v dtach)"
  step dtach ok
else
  echo "dtach missing — trying package managers (needs passwordless sudo) then source build"
  if sudo -n apt-get install -y dtach >/dev/null 2>&1 || sudo -n yum install -y dtach >/dev/null 2>&1 || sudo -n dnf install -y dtach >/dev/null 2>&1; then
    echo "installed via package manager"
    step dtach ok
  elif command -v gcc >/dev/null 2>&1 || command -v cc >/dev/null 2>&1; then
    tmp=$(mktemp -d) && cd "$tmp" \\
      && curl -fsSL -o dtach.tar.gz https://github.com/crigler/dtach/archive/refs/tags/v0.9.tar.gz \\
      && tar xzf dtach.tar.gz && cd dtach-0.9 && ./configure >/dev/null && make >/dev/null \\
      && mkdir -p "$HOME/.local/bin" && cp dtach "$HOME/.local/bin/" \\
      && echo "built from source into ~/.local/bin/dtach" && step dtach ok \\
      || step dtach fail
    cd "$HOME"
  else
    echo "no sudo and no compiler — install dtach manually"
    step dtach fail
  fi
fi

step node start
if command -v node >/dev/null 2>&1; then
  echo "node already installed: $(node --version)"
  step node ok
else
  echo "installing node via nvm…"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null 2>&1
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" 2>/dev/null
  nvm install --lts >/dev/null 2>&1 && echo "node $(node --version) via nvm" && step node ok || step node fail
fi

step claude start
if command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ]; then
  echo "claude already installed: $(claude --version 2>/dev/null || "$HOME/.local/bin/claude" --version 2>/dev/null)"
  step claude ok
else
  echo "installing Claude Code (native installer)…"
  curl -fsSL https://claude.ai/install.sh | bash >/dev/null 2>&1 \\
    && echo "installed: $($HOME/.local/bin/claude --version 2>/dev/null || echo done)" && step claude ok || step claude fail
fi
echo "::DONE::"
`.trim();
}

HostManager.prototype.bootstrapSteps = () => BOOTSTRAP_STEPS.map(s => ({ ...s }));

/**
 * Run the bootstrap; onEvent receives {type:'step', key, status} and
 * {type:'log', line} events. Resolves with the final step map.
 */
HostManager.prototype.bootstrap = function (id, onEvent) {
  const h = this.get(id);
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const steps = Object.fromEntries(BOOTSTRAP_STEPS.map(s => [s.key, 'pending']));
    const child = spawn('ssh', [...this.sshArgs(h), 'bash -s'], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.write(bootstrapScript());
    child.stdin.end();
    let buf = '';
    const feed = (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        const m = line.match(/^::STEP:(\w+):(\w+)::$/);
        if (m) {
          steps[m[1]] = m[2] === 'start' ? 'running' : m[2];
          onEvent({ type: 'step', key: m[1], status: steps[m[1]] });
        } else if (line === '::DONE::') { /* final resolve below */ }
        else if (line.trim()) onEvent({ type: 'log', line: line.slice(0, 500) });
      }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 10 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      for (const k of Object.keys(steps)) if (steps[k] === 'pending' || steps[k] === 'running') steps[k] = 'fail';
      onEvent({ type: 'done', code, steps });
      resolve(steps);
    });
  });
};

module.exports = { HostManager, SSH_BASE_OPTS };
