// The FRP built-in plugin (B-0b60 public port exposure; moved out of src/plugins.js by lane dc-plugins, 2026-10-04).
// It PROVIDES 'relay': publish(name, localPort, opts) / unpublish(name) / setSelfDialSub(sub) — the verbs the
// manager's relay surface (frpPublish / frpUnpublish / setSelfDialSub) hands to whichever plugin declares 'relay'.
// The plugin contract (create(h) → verbs, the host handle h) is described in src/plugins.js.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { pidCmdline, pidAlive } = require('./proc.js');

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
    // Effective relay config: USER override (data/plugins.json config) wins over
    // the cluster-injected ENV defaults (user directive: the fleet auto-injects
    // VIBESPACE_FRPS_* as defaults + enables the plugin; the user can change any
    // of it in the plugin UI).
    const frpCfg = () => {
      const c = h.peek().config || {};
      return {
        serverAddr: c.serverAddr || FRPS_ADDR,
        serverPort: Number(c.serverPort || FRPS_PORT),
        token: c.token || FRPS_TOKEN,
        subDomainHost: c.subDomainHost || process.env.VIBESPACE_FRPS_SUBDOMAIN_HOST || '',
        portMin: Number(c.portMin || FRP_PORT_MIN),
        portMax: Number(c.portMax || FRP_PORT_MAX),
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
    const frpWriteConf = () => {
      const pw = frpAdminPw();
      const cfg = frpCfg();
      fs.mkdirSync(frpProxiesDir(), { recursive: true, mode: 0o700 });
      const toml = [
        `serverAddr = "${cfg.serverAddr}"`,
        `serverPort = ${cfg.serverPort}`,
        `auth.method = "token"`,
        `auth.token = "${cfg.token}"`,
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
      fs.writeFileSync(frpConf(), toml, { mode: 0o600 });
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
        // user override of the cluster-injected relay defaults (empty string ⇒
        // clear the override → fall back to env). Restart if running to apply.
        const rec = h.rec();
        const c = rec.config = rec.config || {};
        const set = (k, v, max = 200) => { if (v === undefined) return; const s = String(v).trim().slice(0, max); if (s) c[k] = s; else delete c[k]; };
        set('serverAddr', patch.serverAddr);
        if (patch.serverPort !== undefined) { const n = Number(patch.serverPort); if (n > 0 && n < 65536) c.serverPort = n; else delete c.serverPort; }
        set('token', patch.token, 200);
        set('subDomainHost', patch.subDomainHost);
        h.save();
        if (frpDaemonPid()) { try { verbs.stop(); } catch { } setTimeout(() => { try { verbs.start(); } catch { } }, 800); }
        h.notify();
        return verbs.status().config;
      },

      // The cluster injects the relay env + wants it default-ON, so frp replays
      // whenever effective-enabled + configured (no prior desiredUp needed — a
      // fresh pod has no state yet). It auto-installs frpc if missing.
      bootReplay() {
        if (!frpEffectiveEnabled() || !frpConfigured()) return;
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
        if (!frpConfigured()) throw new Error('the frp relay is not configured on this instance (set VIBESPACE_FRPS_ADDR/TOKEN)');
        const bin = frpBin();
        if (!bin) throw new Error('frpc not installed — run install first');
        if (frpDaemonPid()) return { running: true };
        frpWriteConf();
        const logFd = fs.openSync(path.join(frpDir(), 'frpc.out'), 'a');
        const child = spawn(bin, ['-c', frpConf()], { detached: true, stdio: ['ignore', logFd, logFd] });
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
          missing: [!c.serverAddr && 'serverAddr', !c.token && 'token'].filter(Boolean),
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
