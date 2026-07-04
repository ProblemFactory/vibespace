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

  add({ name, user, host, port, keyPath }) {
    if (!host) throw new Error('host required');
    if (!user) throw new Error('user required');
    const rec = {
      id: 'host-' + crypto.randomBytes(4).toString('hex'),
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
    this.get(id);
    this._state.hosts = this._state.hosts.filter(h => h.id !== id);
    this._discoveryCache.delete(id);
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

  _ssh(h, remoteCmd, { timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      execFile('ssh', [...this.sshArgs(h), '--', remoteCmd], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message || '').trim().slice(0, 300)));
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

  // ── Remote session discovery (lock-first, same algorithm as local) ──

  async discoverSessions(id, { ttlMs = 15000 } = {}) {
    const h = this.get(id);
    const hit = this._discoveryCache.get(id);
    if (hit && Date.now() - hit.at < ttlMs) return hit.sessions;
    // One round trip: alive lock files + all project JSONLs (path, mtime, size)
    const script = `
      for f in "$HOME"/.claude/sessions/*.json; do
        [ -f "$f" ] || continue
        pid=$(basename "$f" .json)
        kill -0 "$pid" 2>/dev/null && { echo "LOCK $(cat "$f")"; }
      done
      find "$HOME"/.claude/projects -maxdepth 2 -name '*.jsonl' -printf 'J %T@ %s %p\\n' 2>/dev/null | sort -rn -k2 | head -200
    `.trim();
    const out = await this._ssh(h, script, { timeoutMs: 20000 });
    const locks = [];
    const jsonls = [];
    for (const line of out.split('\n')) {
      if (line.startsWith('LOCK ')) { try { locks.push(JSON.parse(line.slice(5))); } catch {} }
      else if (line.startsWith('J ')) {
        const m = line.match(/^J ([\d.]+) (\d+) (.+)$/);
        if (m) jsonls.push({ mtime: parseFloat(m[1]) * 1000, size: +m[2], path: m[3] });
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
      sessions.push({ sessionId: path.basename(j.path, '.jsonl'), cwd: null, projDir: path.basename(path.dirname(j.path)), status: 'remote-stopped', host: h.id, hostName: h.name, mtime: j.mtime });
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
