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
const { claimJsonls } = require('./session-store');

const SSH_BASE_OPTS = [
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=6',
  '-o', 'StrictHostKeyChecking=accept-new',
  // Keepalive (2.124.0, remote-stability pass): silent NAT drops / network
  // blips used to leave half-open ssh pipes lingering for the whole TCP
  // timeout — sessions looked alive but were dead, and nothing could react.
  // 15s app-level probes, 4 misses ⇒ ssh exits within ~60s so the reconnect
  // layers (chat-wrapper remote retry / pty-wrapper retry) can act. Applies
  // to EVERY ssh use (session spawns, discovery, remote-fs, rsync via sshCmd).
  '-o', 'ServerAliveInterval=15',
  '-o', 'ServerAliveCountMax=4',
  '-o', 'TCPKeepAlive=yes',
];

class HostManager {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this._file = path.join(dataDir, 'hosts.json');
    this._sshDir = path.join(dataDir, 'ssh');
    // ControlPath sockets must stay under the ~104-char unix-socket limit —
    // the data dir can be arbitrarily deep (bit on first try: workspace path
    // + cm-<40hex>.<tmpsuffix> overflowed), so masters live in a short
    // per-uid tmp dir instead.
    this._cmDir = path.join(os.tmpdir(), `vs-cm-${process.getuid ? process.getuid() : 'u'}`);
    try { fs.mkdirSync(this._cmDir, { recursive: true, mode: 0o700 }); } catch { }
    this._state = { hosts: [] };
    this._discoveryCache = new Map(); // hostId -> {at, sessions}
    // LAST-KNOWN discovery results, persisted across restarts (2.124.0): the
    // sidebar shows remote sessions immediately after a reload / while a host
    // is unreachable, marked stale, instead of an empty zone.
    this._discFile = path.join(dataDir, 'remote-sessions-cache.json');
    this._persistedDisc = {};
    try { this._persistedDisc = JSON.parse(fs.readFileSync(this._discFile, 'utf-8')) || {}; } catch { }
    this._discPersistTimer = null;
    this._load();
  }

  _persistDiscovery(id, sessions) {
    this._persistedDisc[id] = { at: Date.now(), sessions };
    if (this._discPersistTimer) return;
    this._discPersistTimer = setTimeout(() => {
      this._discPersistTimer = null;
      try {
        const tmp = this._discFile + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this._persistedDisc));
        fs.renameSync(tmp, this._discFile);
      } catch { }
    }, 2000);
  }

  /** Drop the in-memory discovery cache for a host so the NEXT sidebar poll
   *  re-probes immediately — called after remote create/kill/exit so the list
   *  doesn't stay wrong for the cache TTL (state-sync pass, 2.124.0). */
  invalidateDiscovery(id) { this._discoveryCache.delete(id); }

  _load() {
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); }
    catch {
      // hosts.json is the SOLE holder of every dialTokenHash since B-f3e8 —
      // an unparseable file is backed up before we proceed empty, never
      // silently overwritten by the next _save (review hardening)
      try { if (fs.existsSync(this._file)) fs.copyFileSync(this._file, this._file + '.corrupt-' + Date.now()); } catch { }
    }
    if (!Array.isArray(this._state.hosts)) this._state.hosts = [];
  }

  _save() {
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2));
    fs.renameSync(tmp, this._file);
  }

  list() {
    // dial hosts carry a live `online` field (server wires dialOnline to the
    // dialed-in stream registry) — the ONE machine list is the whole roster,
    // there is no separate device API anymore (B-f3e8).
    return this._state.hosts.map(h => (h.transport === 'dial'
      ? { ...h, dialTokenHash: undefined, online: !!this.dialOnline?.(h.deviceId) }
      : { ...h }));
  }

  get(id) {
    const h = this._state.hosts.find(x => x.id === id);
    if (!h) throw new Error('host not found');
    return h;
  }

  /** The host record a dialed-in device belongs to (deviceId = wire identity). */
  findByDeviceId(deviceId) {
    return this._state.hosts.find(h => h.transport === 'dial' && h.deviceId === String(deviceId)) || null;
  }

  /** Pairing credential lives ON the host record (B-f3e8 — dial-tokens.json
   *  folded in). setDialToken find-or-creates so re-pairing an existing name
   *  rotates the token in place. */
  setDialToken(deviceId, sha256Hash, { name } = {}) {
    let h = this.findByDeviceId(deviceId);
    if (!h) { this.add({ name: name || deviceId, transport: 'dial', deviceId }); h = this.findByDeviceId(deviceId); }
    // add() keys by the SANITIZED id — a different raw deviceId that sanitizes
    // to the same id collides and findByDeviceId (raw match) stays null
    if (!h) throw new Error(`device name "${deviceId}" collides with an existing pairing after sanitization — pick another name`);
    h.dialTokenHash = String(sha256Hash);
    this._save();
    return h.id;
  }
  dialTokenHash(deviceId) { return this.findByDeviceId(deviceId)?.dialTokenHash || null; }

  /** B-f3e8 one-time migration: the legacy dial-tokens.json (deviceId →
   *  sha256) folds into the dial host records. MUST be lossless — devices in
   *  the field hold the raw tokens; a lost hash locks every daemon out
   *  permanently. The legacy file is renamed only AFTER every entry landed
   *  in hosts.json (a crash mid-way just re-runs it). */
  migrateDialTokenFile(file) {
    if (!fs.existsSync(file)) return false;
    const all = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const [devId, hash] of Object.entries(all)) {
      if (hash && !this.dialTokenHash(devId)) this.setDialToken(devId, hash);
    }
    const ok = Object.entries(all).every(([devId, hash]) => !hash || this.dialTokenHash(devId));
    if (ok) fs.renameSync(file, file + '.migrated');
    else console.warn('[hosts] dial-token migration incomplete — legacy file kept');
    return ok;
  }

  add({ name, user, host, port, keyPath, privateKey, transport, deviceId, dialTokenHash }) {
    // DIAL host (graduation slice B): a paired dial-out device promoted to a
    // full machine — no ssh fields; every data path rides deviceForDial.
    if (transport === 'dial') {
      if (!deviceId) throw new Error('deviceId required for a dial host');
      const id = 'host-dial-' + String(deviceId).replace(/[^\w-]/g, '');
      if (this._state.hosts.some(h => h.id === id)) return id; // idempotent
      const rec = { id, name: String(name || deviceId).slice(0, 60), transport: 'dial', deviceId: String(deviceId), createdAt: Date.now() };
      if (dialTokenHash) rec.dialTokenHash = String(dialTokenHash);
      this._state.hosts.push(rec);
      this._save();
      return id;
    }
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
      // honest key provenance for the UI (real report: an IMPORTED private key
      // was labeled 'using VibeSpace key'): imported = user pasted/uploaded it;
      // app = the VibeSpace-generated key; default = the system's ssh keys.
      keySource: (privateKey && String(privateKey).trim()) ? 'imported' : (keyPath ? 'app' : 'default'),
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
    // The host's remote-transcript cache is dead weight once the host is gone
    // (files up to 64MB each accumulated forever — audit round-3).
    try { fs.rmSync(path.join(this.dataDir, 'remote-jsonl', id), { recursive: true, force: true }); } catch {}
    this._save();
  }

  // Boot sweep: remote-jsonl dirs whose host no longer exists (orphaned before
  // remove() learned to clean up) + cached transcripts unused for 30 days.
  sweepJsonlCache() {
    const base = path.join(this.dataDir, 'remote-jsonl');
    let dirs = [];
    try { dirs = fs.readdirSync(base); } catch { return; }
    const live = new Set(this._state.hosts.map((h) => h.id));
    const cutoff = Date.now() - 30 * 86400000;
    for (const d of dirs) {
      const dir = path.join(base, d);
      if (!live.has(d)) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} continue; }
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        try {
          const fp = path.join(dir, f);
          if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
        } catch {}
      }
    }
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
      // A bundle from a pre-2.160.0 instance carries dial records WITHOUT the
      // token hash (it lived in dial-tokens.json, never exported) — a wholesale
      // replace would lock every paired device out. Keep the hash we have.
      if (rec.transport === 'dial' && !rec.dialTokenHash) {
        const cur = this.findByDeviceId(rec.deviceId);
        if (cur?.dialTokenHash) rec.dialTokenHash = cur.dialTokenHash;
      }
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

  /** ssh argv for a host (shared by test/discovery/bootstrap/session spawn).
   *  multiplex (2.125.0): ControlMaster connection reuse for SHORT-LIVED
   *  per-op ssh (discovery probes, remote-fs, rsync) — first op pays the
   *  handshake, the next ~10min ride the persisted master (~1s → ~50ms).
   *  NEVER set it on SESSION pipes: if a session's ssh became the master,
   *  its death would kill every multiplexed connection with it (coupling
   *  unrelated sessions), and long-lived pipes pin the master forever. */
  sshArgs(h, { tty = false, reverse = null, multiplex = false } = {}) {
    if (h && h.transport === 'dial') throw new Error(`"${h.name}" is a dial-out device — it has no ssh; this operation must ride the device link`);
    const args = [...SSH_BASE_OPTS, '-p', String(h.port || 22)];
    if (h.keyPath) args.push('-i', h.keyPath, '-o', 'IdentitiesOnly=yes');
    if (multiplex) {
      args.push('-o', 'ControlMaster=auto', '-o', `ControlPath=${path.join(this._cmDir, '%C')}`, '-o', 'ControlPersist=600');
    }
    if (tty) args.push('-t');
    // Reverse tunnel (remote 127.0.0.1:<rport> → this server): remote agent
    // tools (vibespace-status/-task) call VIBESPACE_API through it. Placed
    // BEFORE the destination so option parsing is unambiguous. Bind failures
    // (port in use) only warn — the session still runs, tools just degrade.
    if (reverse) args.push('-R', reverse);
    args.push(`${h.user}@${h.host}`);
    return args;
  }

  /** ssh option STRING for tools that take a transport command (rsync -e):
   *  everything sshArgs adds except the destination. */
  sshCmd(h) {
    const args = [...SSH_BASE_OPTS, '-p', String(h.port || 22)];
    if (h.keyPath) args.push('-i', h.keyPath, '-o', 'IdentitiesOnly=yes');
    // rsync transports are short-lived per-op — ride the shared master too
    args.push('-o', 'ControlMaster=auto', '-o', `ControlPath=${path.join(this._cmDir, '%C')}`, '-o', 'ControlPersist=600');
    return 'ssh ' + args.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ');
  }

  dest(h) { return `${h.user}@${h.host}`; }

  /** Anthropic login state ON THE HOST (read-only probe, one round trip):
   *  subscription = remote credentials.json holds an OAuth token; cliKey = the
   *  remote's console-login-minted primaryApiKey (importable into the central
   *  store). Mirrors AccountManager's local probes. */
  async accountsStatus(id) {
    const h = this.get(id);
    const out = String(await this._ssh(h,
      `S=$(grep -c accessToken "$HOME/.claude/.credentials.json" 2>/dev/null); echo "SUB:$S"; K=$(grep -o "primaryApiKey\\":\\"sk-ant-[^\\"]*" "$HOME/.claude.json" 2>/dev/null | head -1); echo "KEY:$K"`));
    const sub = /SUB:(\d+)/.exec(out);
    const key = /KEY:primaryApiKey":"(sk-ant-[^\s"]+)/.exec(out);
    return {
      subscription: { loggedIn: !!(sub && parseInt(sub[1]) > 0) },
      cliKey: key ? { present: true, tail: key[1].slice(-8) } : { present: false },
    };
  }

  /** Full remote primaryApiKey + org name (for one-click import into the
   *  central store — travels over the ssh channel, never argv). */
  async cliPrimaryKey(id) {
    const h = this.get(id);
    const out = String(await this._ssh(h,
      `grep -o "primaryApiKey\\":\\"sk-ant-[^\\"]*" "$HOME/.claude.json" 2>/dev/null | head -1; grep -o "organizationName\\":\\"[^\\"]*" "$HOME/.claude.json" 2>/dev/null | head -1`));
    const key = /primaryApiKey":"(sk-ant-[^\s"]+)/.exec(out);
    const org = /organizationName":"([^"]+)/.exec(out);
    return { key: key ? key[1] : null, org: org ? org[1] : null };
  }

  /** Remote $HOME, cached per host — injection needs ABSOLUTE remote paths
   *  (agent file tools don't expand ~ or $HOME). */
  async homeDir(h) {
    if (!this._homes) this._homes = new Map();
    if (this._homes.has(h.id)) return this._homes.get(h.id);
    try {
      const out = String(await this._ssh(h, 'echo "$HOME"')).trim().split('\n').pop().trim();
      if (out && out.startsWith('/')) { this._homes.set(h.id, out); return out; }
    } catch { }
    return null;
  }

  _ssh(h, remoteCmd, { timeoutMs = 15000, maxBuffer = 4 * 1024 * 1024, encoding } = {}) {
    return new Promise((resolve, reject) => {
      execFile('ssh', [...this.sshArgs(h, { multiplex: true }), '--', remoteCmd], { timeout: timeoutMs, maxBuffer, ...(encoding !== undefined ? { encoding } : {}) }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)));
        resolve(stdout);
      });
    });
  }

  /** Connectivity + remote tool inventory in ONE round trip. */
  async test(id) {
    const h = this.get(id);
    // dial machine: no ssh — a real round trip over the dialed-in link (runCmd
    // exercises the whole mux path) + the daemon's self-reported identity.
    if (h.transport === 'dial') {
      if (!this.dialOnline?.(h.deviceId)) throw new Error('not dialed in — start the daemon on the device (rerun the install command)');
      const t0 = Date.now();
      const dm = await this.device(id);
      const st = dm.status();
      let tools;
      try {
        const r = await dm.runCmd('sh', ['-c', 'for c in dtach node claude codex; do command -v $c >/dev/null 2>&1 && printf "%s=yes " $c || printf "%s=no " $c; done'], { timeoutMs: 8000 });
        tools = {};
        for (const m of String(r.stdout || '').matchAll(/(\w+)=(yes|no)/g)) tools[m[1]] = m[2] === 'yes';
      } catch { tools = null; } // Windows daemon: no sh — identity still proves the link
      return { ok: true, latencyMs: Date.now() - t0, dial: true, tools, info: st.info || null };
    }
    const probe = 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; echo VS-OK; for c in dtach node claude codex; do command -v $c >/dev/null 2>&1 && printf "%s=yes " $c || printf "%s=no " $c; done; echo; uname -sm';
    const t0 = Date.now();
    const out = await this._ssh(h, probe, { timeoutMs: 10000 });
    if (!out.includes('VS-OK')) throw new Error('unexpected response');
    const tools = {};
    for (const m of out.matchAll(/(\w+)=(yes|no)/g)) tools[m[1]] = m[2] === 'yes';
    return { ok: true, latencyMs: Date.now() - t0, tools, uname: (out.trim().split('\n').pop() || '').trim() };
  }

  /** Kill an EXTERNAL/tmux agent process ON the host (sidebar Terminate for
   *  remote-discovered sessions — the pid is remote). Validates the pid is a
   *  claude/codex process there before SIGTERM; device link first, ssh
   *  fallback (dial machines have no ssh). */
  async killRemotePid(id, pid) {
    const h = this.get(id);
    const p = parseInt(pid, 10);
    if (!Number.isFinite(p) || p <= 1) throw new Error('bad pid');
    const cmd = `C=$(ps -p ${p} -o args= 2>/dev/null); case "$C" in *claude*|*codex*) kill -TERM ${p} && echo VS_OK;; "") echo VS_GONE;; *) echo VS_NOTAGENT;; esac`;
    let out = '';
    if (h.transport === 'dial' || this.dataPlaneOn?.()) {
      try { const dm = await this.device(id); out = String((await dm.runCmd('sh', ['-c', cmd], { timeoutMs: 10000 })).stdout || ''); }
      catch (e) { if (h.transport === 'dial') throw new Error('device unreachable: ' + e.message); }
    }
    if (!out) out = String(await this._ssh(h, cmd));
    if (out.includes('VS_NOTAGENT')) throw new Error('that PID is not a claude/codex process on the host');
    if (!out.includes('VS_OK') && !out.includes('VS_GONE')) throw new Error('kill failed: ' + out.trim().slice(0, 120));
    this._discoveryCache.delete(id); // the card should flip on the next poll
    return { success: true, gone: out.includes('VS_GONE') };
  }

  /** Remote directory autocomplete — parent-dir listing, prefix-filter.
   *  Device link first (the ONLY path for dial machines — real report: the
   *  pull dialog completed LOCAL folders; ssh fallback below unchanged). */
  async dirComplete(id, input) {
    const h = this.get(id);
    const raw = String(input || '');
    const slash = raw.lastIndexOf('/');
    const parent = slash >= 0 ? raw.slice(0, slash) || '/' : '';
    const prefix = slash >= 0 ? raw.slice(slash + 1) : raw;
    if (h.transport === 'dial' || this.dataPlaneOn?.()) {
      try {
        const dm = await this.device(id);
        let base = parent;
        if (base === '' || base === '~') base = String((await dm.runCmd('sh', ['-c', 'echo "$HOME"'], { timeoutMs: 5000 })).stdout || '').trim() || '/';
        else if (base.startsWith('~/')) base = String((await dm.runCmd('sh', ['-c', 'echo "$HOME"'], { timeoutMs: 5000 })).stdout || '').trim() + base.slice(1);
        const r = await dm.fsList(base);
        const shown = (parent === '' || parent === '~') ? '~' : parent;
        return r.entries
          .filter(e => e.isDir && e.name.toLowerCase().startsWith(prefix.toLowerCase()))
          .slice(0, 20)
          .map(e => (shown === '/' ? '/' : shown + '/') + e.name);
      } catch { if (h.transport === 'dial') return []; /* ssh hosts fall through */ }
    }
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

  // ── VibeSpace integration on the host (2.129.0, backlog B-34bb) ─────────
  // Transparency for the ~/.vibespace footprint remote sessions leave on a
  // box (the user was rightly startled finding it unannounced): what's
  // installed, whether it matches the local copies, whether the hook is
  // registered in the REMOTE's own CLI configs, and how many keeper session
  // files exist — plus explicit install/refresh + remove.

  /** The agent-tool set shipped to remotes (same list the per-spawn
   *  distribution in ws-handler uses — keep in sync). */
  static AGENT_TOOLS = ['vibespace-status', 'vibespace-task', 'vibespace-ask', 'vibespace-hook.mjs', 'vibespace-hook-register.mjs', 'vibespace-remote-keeper'];

  /** Integration state ON THE HOST in one ssh round trip: per-tool presence +
   *  sha256 (content compare beats mtime — the local hook/status tools are
   *  REGENERATED every server boot with identical content), hook registration
   *  (grep in the remote's own settings), node availability, keeper session
   *  files. Read-only probe. */
  async agentToolsStatus(id) {
    const h = this.get(id);
    const probe = 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; '
      + `for f in ${HostManager.AGENT_TOOLS.join(' ')}; do `
      + 'p="$HOME/.vibespace/bin/$f"; if [ -f "$p" ]; then s=$( (sha256sum "$p" 2>/dev/null || shasum -a 256 "$p" 2>/dev/null) | cut -d" " -f1 ); echo "T|$f|$s"; else echo "T|$f|"; fi; done; '
      + 'command -v node >/dev/null 2>&1 && echo "NODE|yes" || echo "NODE|no"; '
      + 'grep -q vibespace-hook.mjs "$HOME/.claude/settings.json" 2>/dev/null && echo "HOOK|claude|yes" || echo "HOOK|claude|no"; '
      + 'grep -q vibespace-hook.mjs "$HOME/.codex/hooks.json" 2>/dev/null && echo "HOOK|codex|yes" || echo "HOOK|codex|no"; '
      + 'echo "KEEP|$(ls "$HOME/.vibespace/run" 2>/dev/null | grep -c "\\.sock$")"';
    const out = String(await this._ssh(h, probe, { timeoutMs: 12000 }));
    const st = { tools: {}, node: false, hooks: {}, keeperSessions: 0 };
    for (const line of out.split('\n')) {
      const p = line.trim().split('|');
      if (p[0] === 'T') st.tools[p[1]] = { present: !!p[2], sha256: p[2] || null };
      else if (p[0] === 'NODE') st.node = p[1] === 'yes';
      else if (p[0] === 'HOOK') st.hooks[p[1]] = p[2] === 'yes';
      else if (p[0] === 'KEEP') st.keeperSessions = parseInt(p[1], 10) || 0;
    }
    return st;
  }

  /** Install/refresh the tools + register the hook — the SAME tar-over-stdin
   *  channel the per-spawn distribution uses (nothing bulky/secret in argv;
   *  no token here, tokens stay strictly per-session). */
  installAgentTools(id, toolDir) {
    const h = this.get(id);
    const present = HostManager.AGENT_TOOLS.filter((n) => { try { return fs.statSync(path.join(toolDir, n)).isFile(); } catch { return false; } });
    if (!present.length) throw new Error('no agent tools found locally');
    const { execFileSync } = require('child_process');
    const tar = execFileSync('tar', ['-c', '-C', toolDir, ...present], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    return new Promise((resolve, reject) => {
      const child = execFile('ssh', [...this.sshArgs(h, { multiplex: true }), '--',
        'umask 077; mkdir -p "$HOME/.vibespace/bin"; tar -x -C "$HOME/.vibespace/bin"; chmod +x "$HOME/.vibespace/bin"/vibespace-* 2>/dev/null || true; '
        + 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; '
        + 'node "$HOME/.vibespace/bin/vibespace-hook-register.mjs" 2>/dev/null || true; echo VS-INSTALLED'],
        { timeout: 30000 }, (err, stdout, stderr) => {
          if (err) return reject(new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)));
          if (!String(stdout).includes('VS-INSTALLED')) return reject(new Error('unexpected response'));
          resolve({ installed: present });
        });
      child.stdin.end(tar);
    });
  }

  /** ── CS data-plane (2.146.0): per-host DeviceManager over the ssh stdio
   *  bridge — the shared engine for the fs/discovery/transcript/usage
   *  switchovers. Gated by the CALLER (serverSetting agentd.dataPlane);
   *  connection failures surface so callers fall back to the legacy ssh path.
   *  deps.agentd = { ensureAgentdOnHost, agentdHostToken, bundlePath, version }
   *  injected by server.js after boot. ── */
  async device(id) {
    if (!this._devices) this._devices = new Map();
    const cached = this._devices.get(id);
    if (cached?.status().connected) return cached;
    if (!this.agentdDeps) throw new Error('agentd deps not wired');
    const h = this.get(id);
    // dial hosts have no ssh — the daemon is already dialed IN; drive it
    // over that live stream (deviceForDial caches per device id)
    if (h.transport === 'dial') {
      if (!this.agentdDeps.deviceForDial) throw new Error('dial transport not wired');
      const dm = await this.agentdDeps.deviceForDial(h.deviceId);
      this._devices.set(id, dm);
      return dm;
    }
    await this.agentdDeps.ensureAgentdOnHost(id);
    const remoteCmd = `export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; exec node "$HOME/.vibespace/agentd/current/agentd.js" --stdio`;
    const { DeviceManager } = require('./agentd/client.js');
    const dm = new DeviceManager({
      dataDir: this.dataDir,
      bundlePath: this.agentdDeps.bundlePath,
      version: this.agentdDeps.version,
      transport: { kind: 'ssh', hostToken: this.agentdDeps.agentdHostToken(id), sshBin: 'ssh', sshArgs: this.sshArgs(h, { multiplex: true }), remoteCmd },
      log: () => {},
    });
    await dm.connect();
    this._devices.set(id, dm);
    return dm;
  }

  /** M2 remote install: land the agentd bundle into ~/.vibespace/agentd/<ver>/
   *  + symlink `current`, and provision the host vsht_ token (0600) so the
   *  standing remote daemon authenticates the server's ssh-bridge connection.
   *  Bundle + token ride ONE tar over ssh stdin (never argv). Idempotent. */
  installAgentd(id, bundlePath, version, hostToken) {
    const h = this.get(id);
    const { execFileSync } = require('child_process');
    if (!fs.existsSync(bundlePath)) throw new Error('agentd bundle missing: ' + bundlePath);
    // stage a tar with two entries: agentd.js + token
    const os2 = require('os');
    const stage = fs.mkdtempSync(path.join(os2.tmpdir(), 'vs-agentd-stage-'));
    try {
      fs.copyFileSync(bundlePath, path.join(stage, 'agentd.js'));
      fs.writeFileSync(path.join(stage, 'token'), String(hostToken), { mode: 0o600 });
      const tar = execFileSync('tar', ['-c', '-C', stage, 'agentd.js', 'token'], { timeout: 15000, maxBuffer: 32 * 1024 * 1024 });
      const ver = JSON.stringify(String(version));
      const remote = 'umask 077; D="$HOME/.vibespace/agentd"; mkdir -p "$D/'+String(version).replace(/[^\w.-]/g,'')+'" "$D/state"; '
        + 'tar -x -C "$D/state"; ' // extracts agentd.js + token into state/ temporarily
        + 'mv -f "$D/state/agentd.js" "$D/'+String(version).replace(/[^\w.-]/g,'')+'/agentd.js"; '
        + 'chmod 600 "$D/state/token"; ln -sfn "$D/'+String(version).replace(/[^\w.-]/g,'')+'" "$D/current"; '
        + 'echo VS-AGENTD-INSTALLED';
      return new Promise((resolve, reject) => {
        const child = execFile('ssh', [...this.sshArgs(h, { multiplex: true }), '--', remote],
          { timeout: 30000 }, (err, stdout, stderr) => {
            try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
            if (err) return reject(new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)));
            if (!String(stdout).includes('VS-AGENTD-INSTALLED')) return reject(new Error('unexpected response: ' + String(stdout).slice(0, 120)));
            resolve({ agentdPath: '$HOME/.vibespace/agentd/current/agentd.js' });
          });
        child.stdin.end(tar);
      });
    } catch (e) { try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}; throw e; }
  }

  /** Remove the integration: unregister the hook from the remote CLI configs
   *  (needs the register script still present — runs BEFORE the rm), then rm
   *  exactly our tool files. Per-session token files (.tok-*) and account key
   *  files are left alone (running sessions own them); NOTE a future remote
   *  session spawn re-installs everything by design (per-spawn distribution). */
  async uninstallAgentTools(id) {
    const h = this.get(id);
    const rms = HostManager.AGENT_TOOLS.map((n) => `"$HOME/.vibespace/bin/${n}"`).join(' ');
    const cmd = 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; '
      + 'if [ -f "$HOME/.vibespace/bin/vibespace-hook-register.mjs" ]; then node "$HOME/.vibespace/bin/vibespace-hook-register.mjs" --uninstall 2>/dev/null || true; fi; '
      + `rm -f ${rms}; echo VS-REMOVED`;
    const out = String(await this._ssh(h, cmd, { timeoutMs: 15000 }));
    if (!out.includes('VS-REMOVED')) throw new Error('unexpected response');
    return { ok: true };
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
    // CS data-plane: INCREMENTAL slab sync — transcripts are append-only, so
    // when the cache already holds a prefix we fetch ONLY [cachedSize, size)
    // via read-range instead of re-pulling the whole file (the remote-jsonl
    // whole-file cache's biggest cost). Any failure → legacy ssh path below.
    if (this.dataPlaneOn?.() || h.transport === 'dial') {
      try {
        const dm = await this.device(id);
        // locate via the discovery snapshot (cached-ish) or a targeted find
        const find = await dm.runCmd('sh', ['-c', `find "$HOME"/.claude/projects -maxdepth 2 -name ${JSON.stringify(sessionId + '.jsonl')} 2>/dev/null | head -1`]);
        const remotePath = find.stdout.trim();
        if (!remotePath) return fs.existsSync(cachePath) ? cachePath : null;
        const st = await dm.fsStat(remotePath);
        const size = st.stat.size, mtime = Math.floor(st.stat.mtimeMs / 1000);
        if (meta && meta.size === size && meta.mtime === mtime && fs.existsSync(cachePath)) return cachePath;
        if (size > maxBytes) throw new Error(`remote transcript too large (${(size / 1048576) | 0}MB)`);
        fs.mkdirSync(dir, { recursive: true });
        let localSize = 0;
        try { localSize = fs.statSync(cachePath).size; } catch { }
        if (localSize > 0 && localSize <= size && meta) {
          // append-only delta — the slab win
          if (size > localSize) {
            const delta = await dm.fsReadRange(remotePath, localSize, size - localSize);
            fs.appendFileSync(cachePath, delta.data);
          }
        } else {
          // no/invalid prefix (or remote rotated smaller) — full streamed fetch
          const whole = await dm.fsReadRange(remotePath, 0, size);
          const tmp2 = cachePath + '.tmp';
          fs.writeFileSync(tmp2, whole.data);
          fs.renameSync(tmp2, cachePath);
        }
        fs.writeFileSync(metaPath, JSON.stringify({ size, mtime, fetchedAt: Date.now(), slab: true }));
        return cachePath;
      } catch (e2) { /* legacy fallback below */ }
    }
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

  // ── Remote usage (2.127.0) ──

  /** Harvest per-request usage events from the host's ~/.claude transcripts.
   *  Ships the scanner over ssh STDIN (never argv) and runs it; the remote
   *  keeps its own byte cursors (~/.vibespace/usage-cursor.json), so after the
   *  first full pass each harvest returns only NEW events. Throttled 15min per
   *  host unless forced. Returns the raw NDJSON text ('' when throttled). */
  async harvestUsage(id, { force = false, scannerPath } = {}) {
    const h = this.get(id);
    if (!this._usageHarvestAt) this._usageHarvestAt = new Map();
    const last = this._usageHarvestAt.get(id) || 0;
    if (!force && Date.now() - last < 15 * 60 * 1000) return '';
    this._usageHarvestAt.set(id, Date.now());
    const script = fs.readFileSync(scannerPath, 'utf-8');
    // CS data-plane: ship+run the scanner through the daemon (streaming exec —
    // NDJSON output can be huge). Same cursor semantics; legacy ssh fallback.
    if (this.dataPlaneOn?.() || h.transport === 'dial') {
      try {
        const dm = await this.device(id);
        const home = (await dm.runCmd('sh', ['-c', 'echo "$HOME"'])).stdout.trim();
        const scanPath = home + '/.vibespace/bin/vibespace-usage-scan';
        await dm.fsWrite(scanPath, script); // fsWrite mkdirs the parent
        const chunks = [];
        const { code, error } = await dm.runStream('node', [scanPath], { onData: (b) => chunks.push(b) });
        if (error) throw new Error(error);
        if (code !== 0) throw new Error('scanner exit ' + code);
        return Buffer.concat(chunks).toString('utf-8');
      } catch (e2) { /* legacy ssh fallback below */ }
    }
    return new Promise((resolve, reject) => {
      const child = execFile('ssh', [...this.sshArgs(h, { multiplex: true }), '--',
        'umask 077; mkdir -p "$HOME/.vibespace/bin"; cat > "$HOME/.vibespace/bin/vibespace-usage-scan"; export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; node "$HOME/.vibespace/bin/vibespace-usage-scan"'],
        { timeout: 180000, maxBuffer: 128 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err) { this._usageHarvestAt.set(id, 0); return reject(new Error((stderr || err.message || '').toString().slice(0, 200))); }
          resolve(stdout.toString());
        });
      child.stdin.end(script);
    });
  }

  /** READ-ONLY peek at the host's own claude login token (ban-safety: never
   *  refresh, never write — expired/absent → null; the host's own CLI usage
   *  refreshes it). Powers the on-demand quota ⟳ for remote hosts. */
  async readRemoteOAuth(id) {
    const h = this.get(id);
    let raw;
    try { raw = String(await this._ssh(h, 'cat "$HOME/.claude/.credentials.json" 2>/dev/null || true', { timeoutMs: 10000 })); } catch { return null; }
    try {
      const o = JSON.parse(raw).claudeAiOauth;
      if (o?.accessToken && (!o.expiresAt || o.expiresAt > Date.now() + 60000)) return o.accessToken;
    } catch { }
    return null;
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
      # K = keeper session metas (~/.vibespace/run) — lets discovery classify a
      # keeper-managed claude as reattachable instead of generic 'external'
      # (B-4058: pod rebuild loses local state; the keeper+claude survive)
      find "$HOME"/.vibespace/run -maxdepth 1 -name '*.json' 2>/dev/null | while read -r kf; do
        printf 'K %s\\t' "$(basename "$kf" .json)"; head -c 4000 "$kf" | tr -d '\\n'; echo
      done
      # cwd from the head of each JSONL (projDir decode is ambiguous; the first
      # record may be a summary without cwd, so grep the first cwd field instead)
      find "$HOME"/.claude/projects -maxdepth 2 -name '*.jsonl' ! -name 'agent-*' -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -60 | while read -r _ f; do
        printf 'H %s\\t' "$f"; head -c 16000 "$f" | grep -o '"cwd":"[^"]*"' | head -n 1; echo
        # up to 6 early user records (NOT just the first) — the first user turn is
        # often an injected <vibespace-task-context>/<system-reminder>; the JS side
        # skips those and takes the first REAL message (matches local naming).
        grep -m6 '"type":"user"' "$f" 2>/dev/null | while IFS= read -r u; do printf 'N %s\\t' "$f"; printf '%s' "$u" | head -c 2000; printf '\\n'; done
        # T = sessionIds seen in the file TAIL (last = current writer; records
        # carry the CURRENT id even when a resume kept the ORIGINAL filename).
        # uniq collapses runs (records from one session are consecutive).
        printf 'T %s\\t' "$f"; tail -c 65536 -- "$f" 2>/dev/null | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4 | uniq | tail -n 8 | tr '\\n' ','; echo
      done
    `.trim();
    let out;
    try {
      // CS data-plane (flag agentd.dataPlane): the daemon's raw-facts snapshot
      // SYNTHESIZED into the exact LOCK/J/H/N/T line format the ssh script
      // emits — the parser below runs UNCHANGED (zero interpretation drift).
      // Any failure falls through to the classic ssh script.
      out = null;
      if (this.dataPlaneOn?.() || h.transport === 'dial') {
        try {
          const dm = await this.device(id);
          const snap = await dm.discoverySnapshot();
          const home = '~'; // path prefix only cosmetic in J/H/N/T keys — build real-looking paths
          const lines = [];
          for (const l of snap.locks) lines.push('LOCK ' + JSON.stringify(l));
          for (const j of snap.jsonls) {
            const fp = `/HOME/.claude/projects/${j.projDir}/${j.file}`;
            lines.push(`J ${(j.mtimeMs / 1000).toFixed(4)} ${j.size} ${fp}`);
            if (j.headCwd !== undefined) lines.push(`H ${fp}\t"cwd":"${j.headCwd || ''}"`);
            for (const u of j.userLines || []) lines.push(`N ${fp}\t${u}`);
            if (j.tailIds) lines.push(`T ${fp}\t${j.tailIds.join(',')},`);
          }
          out = lines.join('\n');
        } catch (e2) { out = null; /* legacy fallback below */ }
      }
      if (out == null) out = await this._ssh(h, script, { timeoutMs: 20000 });
    } catch (e) {
      // Host unreachable — serve LAST-KNOWN (expired memory cache, else the
      // disk-persisted copy from a previous run) marked stale instead of
      // failing the sidebar into an empty remote zone (2.124.0).
      const last = this._discoveryCache.get(id) || this._persistedDisc[id];
      if (last && Array.isArray(last.sessions)) {
        return last.sessions.map((s) => ({ ...s, stale: true, staleAt: last.at }));
      }
      throw e;
    }
    const locks = [];
    const keeperBySession = new Map(); // claudeSessionId → {sid} (live keeper sessions)
    const jsonls = [];
    const heads = new Map(); // jsonl path -> first record (cwd source)
    const tailIds = new Map(); // jsonl path -> [sessionIds in tail, last = current writer]
    for (const line of out.split('\n')) {
      if (line.startsWith('K ')) {
        // keeper meta: '<sid>\t<json>' — index by claude session id when known
        try {
          const ti = line.indexOf('\t');
          const ksid = line.slice(2, ti).trim();
          const km = JSON.parse(line.slice(ti + 1));
          if (ksid && km && km.exited === undefined) {
            const key = km.claudeSessionId || km.resumeId;
            if (key) keeperBySession.set(key, { sid: ksid, childPid: km.childPid });
          }
        } catch { }
        continue;
      }
      if (line.startsWith('LOCK ')) { try { locks.push(JSON.parse(line.slice(5))); } catch {} }
      else if (line.startsWith('J ')) {
        const m = line.match(/^J ([\d.]+) (\d+) (.+)$/);
        if (m) jsonls.push({ mtime: parseFloat(m[1]) * 1000, size: +m[2], path: m[3] });
      } else if (line.startsWith('T ')) {
        const t = line.indexOf('\t');
        if (t > 2) {
          const ids = line.slice(t + 1).split(',').map(s => s.trim()).filter(s => /^[\w-]+$/.test(s));
          if (ids.length) tailIds.set(line.slice(2, t), ids);
        }
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
            // first REAL message wins (multiple N lines per file now) — skip
            // synthetic <…>-tag context/reminders and slash-command echoes.
            if (name && !name.startsWith('<') && !name.startsWith('/') && !heads.get(fp)?.name) heads.set(fp, { ...(heads.get(fp) || {}), name: name.slice(0, 80) });
          }
        }
      }
    }
    // lock-first claim per project dir — shared claimJsonls (same algorithm as
    // local /api/sessions): exact id (lock.sessionId = filename for non-resumed
    // sessions) → tail ids (resumed: records carry the CURRENT id while the
    // filename keeps the ORIGINAL) → mtime fallback. The old "newest JSONL in
    // the lock's dir" attributed files arbitrarily with N parallel sessions in
    // one cwd (real incident: 4 running read as 5; kill → wrong id stopped).
    const encode = (cwd) => (cwd || '').replace(/[/._]/g, '-');
    const byDir = new Map(); // projDirName -> { locks: [], jsonls: [] }
    const dirGroup = (d) => {
      if (!byDir.has(d)) byDir.set(d, { locks: [], jsonls: [] });
      return byDir.get(d);
    };
    for (const j of jsonls) dirGroup(path.basename(path.dirname(j.path))).jsonls.push(j);
    for (const lock of locks) dirGroup(encode(lock.cwd)).locks.push(lock);
    const claimed = new Set(); // jsonl paths
    const runningIds = new Set();
    const sessions = [];
    for (const [, g] of byDir) {
      if (!g.locks.length) continue;
      const jmetas = g.jsonls.map(j => ({ id: path.basename(j.path, '.jsonl'), mtime: j.mtime, path: j.path }));
      const claims = claimJsonls(
        g.locks.map(l => ({ sessionId: l.sessionId || null, exactOnly: false, lock: l })),
        jmetas,
        (j) => tailIds.get(j.path) || null,
      );
      const matchedLocks = new Set();
      for (const [jid, w] of claims) {
        const jm = jmetas.find(j => j.id === jid);
        claimed.add(jm.path);
        runningIds.add(jid);
        matchedLocks.add(w.lock);
        sessions.push({ sessionId: jid, cwd: w.lock.cwd, status: 'remote-running', host: h.id, hostName: h.name, mtime: jm.mtime, keeperSid: (keeperBySession.get(jid) || keeperBySession.get(w.lock.sessionId))?.sid });
      }
      // Locks with no JSONL yet (brand-new session, nothing flushed): list by
      // the lock's own sessionId instead of dropping them (or, before this fix,
      // stealing another session's transcript) — parity with local Step 3.
      for (const l of g.locks) {
        if (matchedLocks.has(l) || !l.sessionId || runningIds.has(l.sessionId)) continue;
        runningIds.add(l.sessionId);
        sessions.push({ sessionId: l.sessionId, cwd: l.cwd || null, status: 'remote-running', host: h.id, hostName: h.name, mtime: l.startedAt || Date.now(), keeperSid: keeperBySession.get(l.sessionId)?.sid });
      }
    }
    for (const j of jsonls) {
      if (claimed.has(j.path)) continue;
      const sid = path.basename(j.path, '.jsonl');
      if (runningIds.has(sid)) continue; // already listed via a lock
      const head = heads.get(j.path);
      sessions.push({ sessionId: sid, cwd: head?.cwd || null, name: head?.name || null, projDir: path.basename(path.dirname(j.path)), status: 'remote-stopped', host: h.id, hostName: h.name, mtime: j.mtime });
    }
    this._discoveryCache.set(id, { at: Date.now(), sessions });
    this._persistDiscovery(id, sessions);
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
