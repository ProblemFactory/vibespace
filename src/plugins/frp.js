// The FRP built-in plugin (B-0b60 public port exposure; moved out of src/plugins.js by lane dc-plugins, 2026-10-04).
// It PROVIDES 'relay': publish(name, localPort, opts) / unpublish(name) / setSelfDialSub(sub) — the verbs the
// manager's relay surface (frpPublish / frpUnpublish / setSelfDialSub) hands to whichever plugin declares 'relay'.
// The plugin contract (create(h) → verbs, the host handle h) is described in src/plugins.js.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { pidCmdline, pidAlive } = require('./proc.js');
const { replaceShredding } = require('../secret-file.js');   // lane vault-e2e-password-fix-r2: an older frpc.toml held the token

// frp (B-0b60 public port exposure): the frps RELAY server is shared fleet
// infra — its address/port/token are INJECTED via env (helm/deploy), never in
// the repo. Absent → the plugin reports configured:false and does nothing.
const FRPS_ADDR = process.env.VIBESPACE_FRPS_ADDR || '';
const FRPS_PORT = Number(process.env.VIBESPACE_FRPS_PORT || 7000);
const FRPS_TOKEN = process.env.VIBESPACE_FRPS_TOKEN || '';
const FRP_ADMIN_PORT = Number(process.env.VIBESPACE_FRP_ADMIN_PORT || 7400);
const FRP_VERSION = process.env.VIBESPACE_FRP_VERSION || '0.70.0';
// public TCP ports frps allows a client to request (must match frps allowPorts)
const FRP_PORT_MIN = Number(process.env.VIBESPACE_FRP_PORT_MIN || 20000);
const FRP_PORT_MAX = Number(process.env.VIBESPACE_FRP_PORT_MAX || 25000);

module.exports = {
  id: 'frp',
  label: 'Public URLs (frp)',
  description: 'Expose a machine’s dev server on the public internet via the frp relay — share a preview link. Off by default; needs the relay configured.',
  provides: ['relay'],
  create(h) {
    const frpDir = () => h.dir;
    const frpBin = () => {
      const local = path.join(frpDir(), 'bin', 'frpc');
      if (fs.existsSync(local)) return local;
      try { return execFileSync('which', ['frpc'], { encoding: 'utf-8' }).trim() || null; } catch { return null; }
    };
    const frpProxiesDir = () => path.join(frpDir(), 'proxies');
    const frpConf = () => path.join(frpDir(), 'frpc.toml');
    const frpPidFile = () => path.join(frpDir(), 'frpc.pid');
    const frpAdminPw = () => {
      const f = path.join(frpDir(), 'admin.pw');
      try { return fs.readFileSync(f, 'utf-8').trim(); } catch { }
      const pw = require('crypto').randomBytes(12).toString('hex');
      fs.mkdirSync(frpDir(), { recursive: true, mode: 0o700 });
      fs.writeFileSync(f, pw, { mode: 0o600 });
      return pw;
    };
    // THE RELAY TOKEN (lane vault-e2e-password-fix-r2): the owner's override is the vault's entry `frp:token` once the vault
    // is set up — data/plugins.json keeps only `config.tokenSealed: true`; before the setup, `config.token` as before (the
    // open hook `sealSecrets` moves it in at the setup / every unlock). LOCKED with a sealed override ⇒ no token: the relay
    // does not start and the card says 「保险库已锁定」 (never the cluster's token in its place — the owner chose another).
    // The cluster's VIBESPACE_FRPS_TOKEN (env, never at rest under data/) is not the vault's (design q-042 §4: P2).
    const FRP_ENTRY = 'frp:token';
    const VAULT_LOCKED = 'key-unreadable:vault_locked';
    const vaultOf = () => { try { return typeof h.vault === 'function' ? h.vault() : null; } catch { return null; } };
    const tokenState = () => {
      const c = h.peek().config || {};
      if (!c.tokenSealed) return { token: c.token || FRPS_TOKEN || '', locked: false };
      const v = vaultOf();
      if (!v || v.state() !== 'unlocked') return { token: '', locked: true };
      const r = v.secretGet(FRP_ENTRY);
      if (!r.ok) return { token: '', locked: r.code === VAULT_LOCKED };
      if (!r.value) return { token: FRPS_TOKEN || '', locked: false };   // the flag outlived its entry: the cluster's
      const t = r.value.toString('utf8'); r.value.fill(0);
      return { token: t, locked: false };
    };
    const lockedWords = 'the vault is locked — the relay token opens after the owner unlocks it with the second password (the relay does not start until then)';
    // lane vault-locked-refusal-notice: the refusal, NOTED (the vault's ONE helper) — «the relay» and what it was refused
    const lockedRefusal = (verb) => { const v = vaultOf(); try { if (v && typeof v.blocked === 'function') v.blocked('the relay', verb); } catch { } return Object.assign(new Error(lockedWords), { code: 'vault_locked' }); };
    // Effective relay config: USER override wins over the cluster-injected ENV defaults (user directive: the fleet
    // auto-injects VIBESPACE_FRPS_* as defaults + enables the plugin; the user can change any of it). The address /
    // port / subdomain host are SETTINGS rows (All Settings › Plugins › Public URLs — lane plugin-settings-p0); the
    // relay token is a secret the plugin holds itself (the vault's `frp:token` — above), never a setting.
    const frpCfg = () => {
      const v = h.settings();
      const tk = tokenState();
      return {
        serverAddr: v.serverAddr || FRPS_ADDR,
        serverPort: Number(v.serverPort || FRPS_PORT),
        token: tk.token,
        vaultLocked: tk.locked,
        subDomainHost: v.subDomainHost || process.env.VIBESPACE_FRPS_SUBDOMAIN_HOST || '',
        portMin: Number(FRP_PORT_MIN),
        portMax: Number(FRP_PORT_MAX),
        fromEnv: !!(FRPS_ADDR && FRPS_TOKEN),   // was the RELAY provided by the cluster?
      };
    };
    const frpConfigured = () => { const c = frpCfg(); return !!(c.serverAddr && c.token); };
    // Default-enabled when the cluster injects the relay env AND the user hasn't
    // explicitly turned it off (rec.enabled === false). Undefined = follow env.
    const frpEffectiveEnabled = () => {
      const rec = h.peek();
      if (rec.enabled === false) return false;
      if (rec.enabled === true) return true;
      return frpCfg().fromEnv; // cluster default-on
    };
    const frpDaemonPid = () => {
      try {
        const pid = Number(fs.readFileSync(frpPidFile(), 'utf-8').trim());
        if (pid && pidAlive(pid) && pidCmdline(pid).includes('frpc')) return pid;
      } catch { }
      return null;
    };
    // lane vault-e2e-password-fix-r2: the TOKEN never lands in frpc.toml — the file names an environment variable (frp's
    // `{{ .Envs.X }}` config template) and start() hands the value to the frpc child's env (memory only)
    const FRP_TOKEN_ENV = 'VIBESPACE_FRP_AUTH_TOKEN';
    const frpWriteConf = () => {
      const pw = frpAdminPw();
      const cfg = frpCfg();
      fs.mkdirSync(frpProxiesDir(), { recursive: true, mode: 0o700 });
      const toml = [
        `serverAddr = "${cfg.serverAddr}"`,
        `serverPort = ${cfg.serverPort}`,
        `auth.method = "token"`,
        `auth.token = "{{ .Envs.${FRP_TOKEN_ENV} }}"`,
        `webServer.addr = "127.0.0.1"`,
        `webServer.port = ${FRP_ADMIN_PORT}`,
        `webServer.user = "vibespace"`,
        `webServer.password = "${pw}"`,
        // keep retrying instead of exiting when the relay is unreachable at
        // start — frp's default (exit on first failed login) left the
        // default-ON plugin permanently down after a boot-time relay blip
        `loginFailExit = false`,
        `log.to = "${path.join(frpDir(), 'frpc.log')}"`,
        `log.level = "info"`,
        `log.maxDays = 3`,
        // proxy files (one per published port) are hot-added via `frpc reload`
        `includes = ["${frpProxiesDir()}/*.toml"]`,
      ].join('\n') + '\n';
      replaceShredding(frpConf(), toml);   // 0600, atomic — and an older file's bytes (the token in the clear) overwritten
      return cfg;
    };
    /** lane vault-e2e-password-fix-r2: a frpc.toml an OLDER build wrote holds the token in the clear. Once the token can be
     *  read (not LOCKED), the file is rewritten (the template; the old bytes overwritten) and a frpc running on it restarted
     *  onto the env road — at the boot replay and at every open of the vault. → whether it scrubbed one. */
    const frpScrubConf = () => {
      let text = '';
      try { text = fs.readFileSync(frpConf(), 'utf-8'); } catch { return false; }
      if (!/^auth\.token = "(?!\{\{)/m.test(text)) return false;
      if (frpCfg().vaultLocked || !frpConfigured()) return false;   // the token cannot be read now: the next open scrubs it
      const running = !!frpDaemonPid();
      if (running) { try { verbs.stop(); } catch { } }
      frpWriteConf();
      if (running) { try { verbs.start(); } catch (e) { console.warn('[plugins] frp: the relay did not restart after its config was scrubbed:', e.message); } }
      console.log('[plugins] frp: frpc.toml no longer holds the relay token (the frpc child\'s env does)');
      return true;
    };
    // frpc admin API (localhost only) — reload picks up new proxy files, status
    // reports each proxy's run state (so we can detect a taken remotePort).
    const frpAdmin = async (pathname, method = 'GET') => {
      const pw = frpAdminPw();
      const auth = 'Basic ' + Buffer.from('vibespace:' + pw).toString('base64');
      const res = await fetch(`http://127.0.0.1:${FRP_ADMIN_PORT}${pathname}`, { method, headers: { Authorization: auth }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error('frpc admin ' + res.status);
      const t = await res.text();
      try { return JSON.parse(t); } catch { return t; }
    };
    const frpReload = async () => frpAdmin('/api/reload', 'GET');
    const frpProxyStatus = async (kind = 'tcp') => {
      const s = await frpAdmin('/api/status', 'GET');
      return (s && s[kind]) || [];
    };

    const verbs = {
      config(patch) {
        // the relay TOKEN (a secret, the Settings section's "Relay token" row asks for it): empty string ⇒ clear the
        // override → the cluster's. The address / port / subdomain host are settings rows; this old door still takes
        // them (an agent / a script) and writes them through the settings store. Restart if running to apply.
        const rec = h.rec();
        if (patch.token !== undefined) {
          const c = rec.config = rec.config || {};
          const s = String(patch.token).trim().slice(0, 200);
          // lane vault-e2e-password-fix-r2: the vault set up ⇒ the override is its entry (LOCKED ⇒ refused by name, nothing
          // written); not set up ⇒ plugins.json as before (the next setup / unlock seals it)
          const v = vaultOf();
          const st = v ? v.state() : (typeof h.sealedDir === 'function' && h.sealedDir() ? 'locked' : 'not_set_up');
          if (st === 'locked') throw lockedRefusal('set its token');
          if (st === 'unlocked') {
            const r = s ? v.secretPut(FRP_ENTRY, s) : v.secretDrop(FRP_ENTRY);
            if (!r.ok) throw Object.assign(new Error(`the relay token could not be sealed into the vault (${r.code})`), { code: r.code });
            delete c.token;
            if (s) c.tokenSealed = true; else delete c.tokenSealed;
          } else if (s) c.token = s; else { delete c.token; delete c.tokenSealed; }
          if (!Object.keys(c).length) delete rec.config;
          h.save();
        }
        const w = {};
        for (const k of ['serverAddr', 'subDomainHost']) if (patch[k] !== undefined) w[k] = String(patch[k]).trim().slice(0, 200);
        if (patch.serverPort !== undefined) { const n = Number(patch.serverPort); w.serverPort = n > 0 && n < 65536 ? n : 0; }
        if (Object.keys(w).length) h.writeSettings(w);
        verbs.applySettings();
        h.notify();
        return verbs.status().config;
      },
      /** THE VAULT'S OPEN HOOK (lane vault-e2e-password-fix-r2 — after a setup and every unlock): a plaintext override in
       *  plugins.json moves into the vault entry; a relay the lock kept down replays now. → whether a token was sealed. */
      sealSecrets() {
        const v = vaultOf();
        if (!v || v.state() !== 'unlocked') return false;
        const rec = h.peek();
        const c = rec.config || {};
        let sealed = false;
        if (c.token) {
          const r = v.secretPut(FRP_ENTRY, c.token);
          if (!r.ok) { console.warn(`[plugins] frp: the relay token was not sealed into the vault (${r.code}) — it stays in plugins.json until the next unlock`); return false; }
          const w = h.rec().config;
          delete w.token; w.tokenSealed = true;
          h.save(); sealed = true;
        }
        try { verbs.bootReplay(); } catch { }
        return sealed;
      },
      /** a relay row changed (the settings store's write hook): a running relay restarts into it */
      applySettings() {
        if (frpDaemonPid()) { try { verbs.stop(); } catch { } setTimeout(() => { try { verbs.start(); } catch { } }, 800); }
      },

      // The cluster injects the relay env + wants it default-ON, so frp replays
      // whenever effective-enabled + configured (no prior desiredUp needed — a
      // fresh pod has no state yet). It auto-installs frpc if missing.
      bootReplay() {
        try { frpScrubConf(); } catch (e) { console.warn('[plugins] frp: the config scrub failed:', e.message); }
        if (!frpEffectiveEnabled() || !frpConfigured()) return;   // a LOCKED vault with a sealed override reads as unconfigured here — the unlock's sealSecrets replays it
        (async () => {
          try {
            if (!frpBin()) { console.log('[plugins] boot: installing frpc (relay default-on)'); await verbs.install(); }
            if (!frpDaemonPid()) { console.log('[plugins] boot replay: starting frp'); verbs.start(); }
          } catch (e) { console.warn('[plugins] boot replay frp failed:', e.message); }
        })();
      },

      async install() {
        const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
        if (!arch) throw new Error('unsupported arch: ' + process.arch);
        const binDir = path.join(frpDir(), 'bin');
        fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
        const name = `frp_${FRP_VERSION}_linux_${arch}`;
        const url = `https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/${name}.tar.gz`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
        const tgz = path.join(frpDir(), 'frp.tgz');
        fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
        execFileSync('tar', ['-xzf', tgz, '-C', frpDir()]);
        fs.copyFileSync(path.join(frpDir(), name, 'frpc'), path.join(binDir, 'frpc'));
        fs.chmodSync(path.join(binDir, 'frpc'), 0o755);
        fs.rmSync(path.join(frpDir(), name), { recursive: true, force: true });
        fs.rmSync(tgz, { force: true });
        h.rec().installedAt = Date.now();
        h.save();
        h.notify();
        return { installed: true, version: FRP_VERSION };
      },

      start() {
        if (frpCfg().vaultLocked) throw lockedRefusal('start');
        if (!frpConfigured()) throw new Error('the frp relay is not configured on this instance (set VIBESPACE_FRPS_ADDR/TOKEN)');
        const bin = frpBin();
        if (!bin) throw new Error('frpc not installed — run install first');
        if (frpDaemonPid()) return { running: true };
        const cfg = frpWriteConf();
        const logFd = fs.openSync(path.join(frpDir(), 'frpc.out'), 'a');
        const child = spawn(bin, ['-c', frpConf()], { detached: true, stdio: ['ignore', logFd, logFd], env: { ...process.env, [FRP_TOKEN_ENV]: cfg.token } });   // the token: the child's env only
        child.unref();
        fs.writeFileSync(frpPidFile(), String(child.pid));
        const rec = h.rec();
        rec.desiredUp = true;
        h.save();
        setTimeout(() => h.notify(), 1200);
        return { starting: true };
      },

      stop() {
        const pid = frpDaemonPid();
        if (pid) { try { process.kill(pid, 'SIGTERM'); } catch { } }
        try { fs.unlinkSync(frpPidFile()); } catch { }
        const rec = h.rec();
        rec.desiredUp = false;
        h.save();
        h.notify();
        return { stopped: true };
      },

      status() {
        const rec = h.peek();
        const c = frpCfg();
        return {
          installed: !!frpBin(),
          configured: frpConfigured(),
          // WHICH field is missing (2.227.10, him188: he filled the address+port,
          // the token stayed empty, and the UI only said "relay not configured" —
          // an unactionable dead end. Name the gap; never make the user guess).
          missing: [!c.serverAddr && 'serverAddr', !c.token && !c.vaultLocked && 'token'].filter(Boolean),
          vaultLocked: !!c.vaultLocked,   // lane vault-e2e-password-fix-r2: the sealed relay token while the vault is LOCKED — the door
          tokenSealed: !!(h.peek().config || {}).tokenSealed,
          server: frpConfigured() ? `${c.serverAddr}:${c.serverPort}` : null,
          publicHost: c.serverAddr || null,
          subDomainHost: c.subDomainHost || null,     // subdomain mode when set
          fromEnv: c.fromEnv,                          // relay came from the cluster env
          running: !!frpDaemonPid(),
          pid: frpDaemonPid() || undefined,
          enabled: frpEffectiveEnabled(),        // default-on when cluster-injected
          desiredUp: !!rec.desiredUp,
          selfDialSub: rec.selfDialSub || '',          // stable subdomain for double-NAT self-publish (B-5c1e)
          portRange: [c.portMin, c.portMax],
          // echo the CURRENT effective config so the UI can prefill editable fields
          config: { serverAddr: c.serverAddr, serverPort: c.serverPort, hasToken: !!c.token, subDomainHost: c.subDomainHost },
        };
      },

      /** Publish a LOCAL port to the public internet via the relay. If a
       *  subDomainHost is configured → a random `https://<sub>.<host>` subdomain
       *  (the SNI broker); else a TCP port map `http://<relay>:<port>/` (retrying
       *  on collision — the relay is fleet-shared). name = a stable proxy name. */
      async publish(name, localPort, { preferPort = 0, preferSub = '', proto: protoHint = '' } = {}) {
        if (frpCfg().vaultLocked) throw lockedRefusal('publish a public URL');
        if (!frpConfigured()) throw new Error('public URLs are not available — the frp relay is not configured on this instance');
        if (!frpDaemonPid()) { verbs.start(); await new Promise((r) => setTimeout(r, 1500)); }
        const cfg = frpCfg();
        const safe = String(name).replace(/[^\w-]/g, '_').slice(0, 60);
        const file = path.join(frpProxiesDir(), safe + '.toml');

        // Detect the backend protocol: HTTP/HTTPS can ride a routed subdomain; a
        // raw-TCP service (DB/VNC/SSH — no Host/SNI) can ONLY be an IP:port, so it
        // falls through to TCP mode even when a subdomain host is configured.
        // An UNREACHABLE backend (nothing listens yet) throws in the probe and rides as http — never a TCP fallback
        // (lane job-publish-stable); port-forward decides first and passes the hint, keeping a forward's last protocol.
        const proto = ['http', 'https', 'tcp'].includes(protoHint) ? protoHint
          : await h.probeProto(localPort).catch(() => 'http');

        // ── subdomain (vhost) mode — PLAINTEXT-HTTP backends ──
        // TLS is terminated SERVER-SIDE at the relay (it holds the wildcard cert
        // and forwards to frps's plaintext HTTP vhost) — no cert on any instance.
        // The proxy is a plain `type=http`; the relay makes it a trusted https URL.
        // An HTTPS-native backend already serves its own cert and a raw-TCP service
        // has no Host to route on — both fall through to IP:port mode below.
        if (cfg.subDomainHost && proto === 'http') {
          const sub = /^[a-z0-9][a-z0-9-]{1,62}$/.test(preferSub) ? preferSub
            : 'vs' + require('crypto').randomBytes(5).toString('hex'); // e.g. vs3f9a1c2b4d
          const toml = `[[proxies]]\nname = "${safe}"\ntype = "http"\nsubdomain = "${sub}"\nlocalIP = "127.0.0.1"\nlocalPort = ${localPort}\nhostHeaderRewrite = "127.0.0.1"\n`;
          fs.writeFileSync(file, toml, { mode: 0o600 });
          try { await frpReload(); } catch (e) { throw new Error('frpc reload failed: ' + e.message); }
          for (let t = 0; t < 12; t++) {
            await new Promise((r) => setTimeout(r, 400));
            let st = []; try { st = await frpProxyStatus('http'); } catch { }
            const p = st.find((x) => x.name === safe);
            if (p && p.status === 'running') { h.notify(); return { name: safe, subdomain: sub, proto, url: `https://${sub}.${cfg.subDomainHost}/`, publicHost: `${sub}.${cfg.subDomainHost}` }; }
            if (p && (p.status === 'error' || p.status === 'closed')) break;
          }
          try { fs.unlinkSync(file); await frpReload(); } catch { }
          throw new Error('could not publish the subdomain on the relay (is the domain / DNS set up?)');
        }

        // ── TCP port mode (works with just the relay IP) ──
        const cand = [];
        if (preferPort >= cfg.portMin && preferPort <= cfg.portMax) cand.push(preferPort);
        const span = cfg.portMax - cfg.portMin + 1;
        let seed = 0; for (const c of safe) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
        cand.push(cfg.portMin + (seed % span));
        for (let i = 0; i < 8; i++) cand.push(cfg.portMin + Math.floor(((seed = (seed * 1103515245 + 12345) >>> 0) / 0xffffffff) * span));
        let lastErr = '';
        for (const remotePort of cand) {
          const toml = `[[proxies]]\nname = "${safe}"\ntype = "tcp"\nlocalIP = "127.0.0.1"\nlocalPort = ${localPort}\nremotePort = ${remotePort}\n`;
          fs.writeFileSync(file, toml, { mode: 0o600 });
          try { await frpReload(); } catch (e) { lastErr = e.message; continue; }
          // poll the proxy's run state — 'running' = the relay accepted the port
          for (let t = 0; t < 12; t++) {
            await new Promise((r) => setTimeout(r, 400));
            let st = []; try { st = await frpProxyStatus(); } catch { }
            const p = st.find((x) => x.name === safe);
            if (p && p.status === 'running') {
              h.notify();
              // scheme reflects what the backend speaks: https:// keeps its own
              // cert (passthrough), http:// for plaintext web, tcp:// for a raw
              // service (DB/VNC/SSH — not a browser link)
              const scheme = proto === 'https' ? 'https' : proto === 'tcp' ? 'tcp' : 'http';
              const url = proto === 'tcp' ? `tcp://${cfg.serverAddr}:${remotePort}` : `${scheme}://${cfg.serverAddr}:${remotePort}/`;
              return { name: safe, remotePort, proto, url, publicHost: cfg.serverAddr };
            }
            if (p && (p.status === 'error' || p.status === 'closed')) { lastErr = p.err || 'port unavailable'; break; }
          }
        }
        try { fs.unlinkSync(file); await frpReload(); } catch { }
        throw new Error('could not allocate a public port on the relay' + (lastErr ? ' (' + lastErr + ')' : ''));
      },

      /** Persist the stable subdomain used to self-publish this instance for
       *  double-NAT device pairing (B-5c1e) so re-pairs/reconnects keep the URL. */
      setSelfDialSub(sub) {
        const rec = h.rec();
        const s = String(sub || '').trim();
        if (s) rec.selfDialSub = s; else delete rec.selfDialSub;
        h.save();
      },

      async unpublish(name) {
        const safe = String(name).replace(/[^\w-]/g, '_').slice(0, 60);
        try { fs.unlinkSync(path.join(frpProxiesDir(), safe + '.toml')); } catch { }
        if (frpDaemonPid()) { try { await frpReload(); } catch { } }
        h.notify();
        return { ok: true };
      },
    };
    return verbs;
  },
};
