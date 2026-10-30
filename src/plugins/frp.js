// The FRP built-in plugin (B-0b60 public port exposure; moved out of src/plugins.js by lane dc-plugins, 2026-10-04).
// It PROVIDES 'relay': publish(name, localPort, opts) / unpublish(name) / setSelfDialSub(sub) — the verbs the
// manager's relay surface (frpPublish / frpUnpublish / setSelfDialSub) hands to whichever plugin declares 'relay'.
// The plugin contract (create(h) → verbs, the host handle h) is described in src/plugins.js.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { pidCmdline, pidAlive } = require('./proc.js');
const { replaceShredding } = require('../secret-file.js');   // lane vault-e2e-password-fix-r2: an older frpc.toml held the token
const os = require('os');
const crypto = require('crypto');
const RT = require('../relay-token.js');   // lane relay-token-per-instance (design q-051): THE instance's own relay token (PURE)

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
  provides: ['relay', 'reminders'],   // reminders: a public name the relay refused is ONE For-you item (lane relay-token-per-instance)
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
    // THE INSTANCE'S RELAY TOKEN (lane relay-token-per-instance, design q-051 — the owner's decision 2026-10-20): this
    // instance's OWN token bound to its OWN public names (PURE src/relay-token.js), kept in data/relay-token.json (0600,
    // atomic, the old bytes overwritten) — NOT the vault: a restart re-publishes without the second password (src/vault.js
    // SECRETS_AT_REST names the exception). frpc logs in as `user = <instance id>` with `metadatas.token` = frp's env
    // template; the value rides the frpc child's env only. A fleet pod logs in as its own name with its cluster's token
    // (VIBESPACE_RELAY_CLUSTER_TOKEN, env). The shared token below (`tokenState`) is only the KNOCK frps still asks during
    // the relay's grace; it leaves this instance once a frpc started without it ran a proxy (RETIRE_ID — never before).
    const RETIRE_ID = '2026-10-relay-token-per-instance';
    // THE PROOF (lane frp-token-proof, 2026-10-30 — the hub dropped its own shared token after misreading a login): frps 0.70.0
    // keys the control connection with auth.token on BOTH sides, so a frpc without the shared token is taken (the relay's
    // plugin vouches its own token) and dropped at once — a LOGIN proves nothing. The relay no longer asks the shared token ⇔
    // a proxy RAN on a frpc started WITHOUT it: relayPublished stamps the proof with that frpc's RUN (`frpcRun` — pid + start,
    // written by start()). A stamp without its run (an older build's — possibly a login's) counts as nothing: the knock is
    // sent again until a proxy runs without it.
    const runIdOf = (r) => (r && r.pid && r.at ? `${r.pid}@${r.at}` : null);
    const knocklessProven = (p) => !!(p.relayKnocklessAt && p.relayKnocklessRun);
    const relayFile = () => (h.dataDir ? path.join(h.dataDir, RT.FILE) : null);
    const relayRead = () => {
      const f = relayFile();
      if (!f) return { rec: null, state: 'no-data-dir' };
      let raw;
      try { raw = fs.readFileSync(f, 'utf-8'); } catch (e) { return { rec: null, state: e && e.code === 'ENOENT' ? 'none' : 'unreadable' }; }
      const rec = RT.parse(raw);
      return rec ? { rec, state: 'ok' } : { rec: null, state: 'unreadable' };
    };
    const relayWrite = (rec) => replaceShredding(relayFile(), RT.serialize(rec));   // 0600, atomic, the old token's bytes overwritten
    const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
    const identity = () => RT.identityOf({ rec: relayRead().rec, env: process.env });
    const mintRecord = () => {
      const rec = RT.mint({ randomBytes: crypto.randomBytes, now: Date.now(), label: process.env.VIBESPACE_INSTANCE_NAME || os.hostname() });
      relayWrite(rec);
      console.log(`[plugins] frp: this instance's relay identity ${rec.instanceId} was minted — the relay admin registers it with the line on Plugins › Public URLs`);
      return rec;
    };
    const revokedWords = 'this instance\'s relay token was revoked — mint a new one (Plugins › Public URLs) and send its registration line to the relay admin';
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
    /** THE KNOCK (lane relay-token-per-instance): the shared token frpc still sends as frps's own auth.token — until this
     *  relay proved it no longer asks (a frpc started without it ran a proxy — lane frp-token-proof: never a login) or the owner said so
     *  (「中继已升级」). An instance with no identity of its own always knocks (the old relay). */
    const knockOf = (ident) => {
      const p = h.peek();
      if (ident.token && (p.relayUpgradedAt || knocklessProven(p))) return { token: '', locked: false, off: true };
      return { ...tokenState(), off: false };
    };
    // Effective relay config: USER override wins over the cluster-injected ENV defaults (user directive: the fleet
    // auto-injects VIBESPACE_FRPS_* as defaults + enables the plugin; the user can change any of it). The address /
    // port / subdomain host are SETTINGS rows (All Settings › Plugins › Public URLs — lane plugin-settings-p0); the
    // relay token is a secret the plugin holds itself (the vault's `frp:token` — above), never a setting.
    const frpCfg = () => {
      const v = h.settings();
      const ident = identity();
      const tk = knockOf(ident);
      return {
        serverAddr: v.serverAddr || FRPS_ADDR,
        serverPort: Number(v.serverPort || FRPS_PORT),
        token: tk.token,                           // THE KNOCK (the shared token) — '' once retired, while LOCKED, or none
        ident,                                     // this instance's own identity (RT.identityOf) — its token in memory only
        vaultLocked: tk.locked && !ident.token,    // no identity of its own: the sealed shared token is the relay's only key (the door)
        knockLocked: tk.locked && !!ident.token,   // an identity of its own: frpc starts without the knock (the grace may refuse it)
        knockOff: tk.off,
        subDomainHost: v.subDomainHost || process.env.VIBESPACE_FRPS_SUBDOMAIN_HOST || '',
        portMin: Number(FRP_PORT_MIN),
        portMax: Number(FRP_PORT_MAX),
        // was the RELAY provided by the cluster? its ADDRESS + a key to it: the shared token, the cluster's — or, once the relay's
        // grace is over and the chart drops VIBESPACE_FRPS_TOKEN, this instance's OWN identity (lane fleet-instance-publish: the
        // env-token-only rule turned every such pod's default-on relay OFF at its next restart — no frpc, no public URL)
        fromEnv: !!(FRPS_ADDR && (FRPS_TOKEN || process.env[RT.CLUSTER_TOKEN_ENV] || ident.token)),
      };
    };
    const frpConfigured = () => { const c = frpCfg(); return !!(c.serverAddr && (c.token || c.ident.token)); };
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
    const FRP_TOKEN_ENV = RT.KNOCK_ENV;
    const frpWriteConf = (cfg = frpCfg(), knock = !!cfg.token) => {
      const pw = frpAdminPw();
      fs.mkdirSync(frpProxiesDir(), { recursive: true, mode: 0o700 });
      const toml = [
        `serverAddr = "${cfg.serverAddr}"`,
        `serverPort = ${cfg.serverPort}`,
        ...RT.frpcLines(cfg.ident),   // user = "<instance id>" + metadatas.token = frp's env template, never the value (lane relay-token-per-instance)
        `auth.method = "token"`,
        ...(knock ? [`auth.token = "{{ .Envs.${FRP_TOKEN_ENV} }}"`] : []),   // the knock — none once the relay no longer asks
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
    /** the newest login event the RUNNING frpc wrote (its frpc.log since this start, ≤ 16 KB) → RT.loginOf's answer */
    const loginState = () => {
      let fd = null;
      try {
        fd = fs.openSync(path.join(frpDir(), 'frpc.log'), 'r');
        const size = fs.fstatSync(fd).size, from = Math.max(Number(h.peek().frpcLogFrom) || 0, size - 16384);
        if (from >= size) return null;
        const b = Buffer.alloc(size - from);
        fs.readSync(fd, b, 0, b.length, from);
        return RT.loginOf(b.toString('utf8'));
      } catch { return null; } finally { if (fd !== null) try { fs.closeSync(fd); } catch { } }
    };
    const logSize = () => { try { return fs.statSync(path.join(frpDir(), 'frpc.log')).size; } catch { return 0; } };
    const forYou = () => { try { return h.opts && typeof h.opts.forYou === 'function' ? h.opts.forYou() : null; } catch { return null; } };
    /** THE PLUGIN'S ONE For-you door (origin plugin · frp — never a token): a name the relay refused, the dropped login, the
     *  shared token's retirement. `itemKey` = one item whatever its words say (the dropped login's count moves); `open` = the
     *  click goes to Plugins › Public URLs. → the item, or null (no store wired: the caller's journal line says it) */
    const fileItem = (a, { itemKey = null, open = null } = {}) => {
      const ut = forYou();
      if (!ut || typeof ut.add !== 'function') return null;
      try { return ut.add('frp', { origin: 'plugin', plugin: 'frp', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Public URLs (frp)', text: a.text, detail: a.detail, i18n: a.i18n, ...(itemKey ? { itemKey } : {}), ...(open ? { open } : {}) }); } catch (e) { console.warn('[plugins] frp: a For-you item was not filed:', e.message); return null; }
    };
    const PUBLIC_URLS_DOOR = { kind: 'plugin-settings', plugin: 'frp' };
    /** a public name the relay refused (name_in_use / name_not_yours) ⇒ ONE For-you item per name — never the token */
    const relayAlert = (ref, name) => {
      const a = RT.alertOf(ref, { name });
      if (!a) return;
      if (!fileItem(a)) console.warn(`[plugins] frp: the relay refused the public name ${name} (${ref.code}) — no For-you item was filed, so only this journal says so`);
    };
    /** THE KNOCK'S RETIREMENT (design q-051 §3 ②, RETIRE_ID): once a proxy RAN on a frpc started WITHOUT the shared token —
     *  both facts of ONE run (`relayKnocklessRun`, lane frp-token-proof; a login is no proof) — the relay no longer asks and
     *  the shared token leaves this instance: the vault's `frp:token` entry dropped (at the next unlock when LOCKED now), a
     *  plaintext override too — and SAID (one For-you item naming the entry and why: a drop is never silent). The cluster's
     *  env token is the cluster's (it is simply no longer sent). */
    const retireLegacy = () => {
      const p = h.peek();
      if (!knocklessProven(p) || !p.relayPublishedAt || p.legacyRetired) return false;
      const c = p.config || {};
      if (c.tokenSealed) {
        const v = vaultOf();
        if (!v || v.state() !== 'unlocked') return false;   // the vault's open hook (sealSecrets) retries
        const r = v.secretDrop(FRP_ENTRY);
        if (!r.ok) { console.warn(`[plugins] frp: the shared relay token was not dropped from the vault (${r.code}) — the next unlock retries`); return false; }
      }
      const w = h.rec();
      const held = c.tokenSealed ? FRP_ENTRY : c.token ? 'plugins.json' : null;   // what this instance held (the cluster's env token: nothing to drop)
      if (w.config) { delete w.config.token; delete w.config.tokenSealed; if (!Object.keys(w.config).length) delete w.config; }
      w.legacyRetired = { id: RETIRE_ID, at: Date.now(), run: p.relayKnocklessRun };
      h.save(); h.notify();
      console.log(`[plugins] frp: the shared relay token left this instance (${RETIRE_ID}) — a proxy ran without it (frpc run ${p.relayKnocklessRun}); it logs in with its own token only`);
      if (held) fileItem(RT.retiredAlertOf({ entry: held, at: p.relayKnocklessAt }), { open: PUBLIC_URLS_DOOR });
      return true;
    };
    /** THE RUN'S LOG (lane frp-token-proof): frpc.log read FORWARD from where this run began (`frpcLogFrom`), new bytes only
     *  (≤ SCAN_MAX a pass — the counts are then «at least»), read by RT.runOf: logins, proxies started, and the logins since the
     *  relay last answered a NewProxy (their times on the hub's clock — the file's mtime dates the newest line) */
    const SCAN_MAX = 1 << 20;
    let scan = null;
    const runScan = () => {
      const p = h.peek(), rid = runIdOf(p.frpcRun) || `log@${Number(p.frpcLogFrom) || 0}`;
      if (!scan || scan.run !== rid) scan = { run: rid, offset: Number(p.frpcLogFrom) || 0, rest: '', logins: 0, proxies: 0, unanswered: 0, since: null, recent: [], answeredAt: null };
      let fd = null;
      try {
        fd = fs.openSync(path.join(frpDir(), 'frpc.log'), 'r');
        const st = fs.fstatSync(fd), size = st.size;
        if (size < scan.offset) { scan.offset = 0; scan.rest = ''; }   // rotated / truncated: the new file from its start
        if (size - scan.offset > SCAN_MAX) { scan.offset = size - SCAN_MAX; scan.rest = ''; }
        if (size > scan.offset) {
          const b = Buffer.alloc(size - scan.offset);
          fs.readSync(fd, b, 0, b.length, scan.offset);
          scan.offset = size;
          const text = scan.rest + b.toString('utf8'), cut = text.lastIndexOf('\n');
          scan.rest = cut < 0 ? text : text.slice(cut + 1);
          if (cut >= 0) Object.assign(scan, RT.runOf(text.slice(0, cut), scan, { at: Math.round(st.mtimeMs) }));   // the log's clock mapped onto the hub's
        }
      } catch { } finally { if (fd !== null) try { fs.closeSync(fd); } catch { } }
      return scan;
    };
    /** a proxy started in THIS run (the hub saw one run, or frpc's log says one started) — the unlock's restart reads it */
    const ranThisRun = () => { const p = h.peek(), rid = runIdOf(p.frpcRun); return !!(rid && p.frpcProxyRun === rid) || runScan().proxies > 0; };
    /** THE UNLOCK PUTS THE TOKEN BACK (rule ②) only on a run the LOCK started without it (lane frp-token-proof r2 — never a
     *  TRIAL: the relay refused the token there, and sending it again keeps the relay down until the next trial ≤ 10 min
     *  later); a record an older build wrote (no `frpcKnockless`) counts as the lock's unless a trial began that run */
    const lockStarted = (p) => (p.frpcKnockless ? p.frpcKnockless === 'locked'
      : !(p.knockTrialAt && p.frpcRun && p.frpcRun.at >= p.knockTrialAt && p.frpcRun.at - p.knockTrialAt < 60e3));
    const restartsAtUnlock = (p) => p.frpcKnock === false && lockStarted(p) && !knocklessProven(p) && !p.relayUpgradedAt && !ranThisRun();
    /** THE DROPPED LOGIN (lane frp-token-proof; r2 — a RATE and an OUTCOME, never a count): the running frpc started WITHOUT
     *  the shared token, a publish in this run tried ONE NewProxy that the relay never answered (`relayTry` {run, at} — the
     *  episode's first; publish() always tries before it refuses), and frpc keeps logging in (RT.droppedOf: DROP_LOGINS
     *  logins within DROP_WINDOW since the relay last answered, the newest ≤ DROP_QUIET ago) ⇒ `dropped` = { run, logins,
     *  since, why } — read by publish (after its one try: never «is the domain / DNS set up?», never a 10-port walk), the
     *  card and the status. ONE For-you item per EPISODE (its count refreshed ≤ every 10 min while it is open); the episode
     *  — and its item — END by ANY road: a NewProxy answered (a proxy ran or was refused), the token came back (a run that
     *  sends it), frpc stopped redialling for DROP_QUIET (the relay changed), a new run, the relay stopped. */
    let dropped = null;
    const droppedWhy = (p) => {
      const k = p.frpcKnockless;
      if (k === 'locked' || k === 'none') return k;
      if (k) return 'off';
      const c = frpCfg();   // a record an older build wrote: why it sends no token is read off what this instance holds NOW
      return c.knockLocked ? 'locked' : c.token || c.knockOff ? 'off' : 'none';
    };
    /** not dropped (now): the item said for it is done — the card and the tray agree; `forget` = the episode is OVER (its try
     *  forgotten too: a later healthy reconnect is never judged against an old try) */
    const endDrop = ({ forget = true } = {}) => {
      dropped = null;
      const p = h.peek();
      if (!p.relayDropSaid && !(forget && p.relayTry)) return;
      const said = p.relayDropSaid, w = h.rec();
      delete w.relayDropSaid;
      if (forget) delete w.relayTry;
      h.save();
      if (said && said.itemId) { try { const it = forYou().get(said.itemId); if (it && it.status === 'open') forYou().setStatus(said.itemId, 'done', 'frp'); } catch { } }
    };
    /** a publish's ONE NewProxy went unanswered (neither started nor refused) — the episode's first try in this run is kept */
    const noteTry = (at) => {
      const p = h.peek(), run = runIdOf(p.frpcRun) || runScan().run;
      if (p.frpcKnock !== false || (p.relayTry && p.relayTry.run === run)) return;   // a frpc that sends the token is not judged
      const w = h.rec(); w.relayTry = { run, at }; h.save();
    };
    const noteRun = () => {
      const p = h.peek(), sc = runScan(), now = Date.now();
      const run = runIdOf(p.frpcRun) || sc.run;
      const t = p.relayTry && p.relayTry.run === run ? p.relayTry.at : null;
      const newest = sc.recent.length ? sc.recent[sc.recent.length - 1] : null;
      const over = t === null || (Number.isFinite(sc.answeredAt) && sc.answeredAt >= t) || (now - t > RT.DROP_QUIET && !(Number.isFinite(newest) && now - newest <= RT.DROP_QUIET));
      if (!frpDaemonPid() || over || !RT.droppedOf(sc, { knock: p.frpcKnock !== false, triedAt: t, now })) {
        endDrop({ forget: over || !frpDaemonPid() || p.frpcKnock !== false });
        return null;
      }
      dropped = { run, logins: sc.unanswered, since: Number.isFinite(sc.since) ? sc.since : (p.frpcRun && p.frpcRun.at) || null, why: droppedWhy(p) };
      const said = p.relayDropSaid || {};
      const due = said.run !== run || (said.itemId && Date.now() - (said.at || 0) >= 600e3 && (() => { try { const it = forYou().get(said.itemId); return !!it && it.status === 'open'; } catch { return false; } })());
      if (due) {
        const a = RT.droppedAlertOf({ logins: dropped.logins, since: dropped.since, why: dropped.why });
        const item = fileItem(a, { itemKey: 'relay-login-dropped', open: PUBLIC_URLS_DOOR });
        if (said.run !== run) console.warn(`[plugins] frp: ${a.message}${item ? ' (one For-you item)' : ''}`);
        const w = h.rec(); w.relayDropSaid = { run, at: Date.now(), itemId: item ? item.id : null }; h.save();
      }
      return dropped;
    };
    const droppedError = () => Object.assign(new Error(RT.droppedAlertOf({ logins: dropped.logins, since: dropped.since, why: dropped.why }).message), { code: 'relay_login_dropped' });
    /** what the running frpc's log says, acted on (once a minute and before a publish): the relay refusing the knock while this
     *  instance holds its own token ⇒ ONE restart without it (≤ 1 per 10 min); the dropped login ⇒ its named state. A login
     *  never records the relay as no longer asking (lane frp-token-proof — only a proxy that ran does: relayPublished). */
    const observe = () => {
      const p = h.peek();
      if (!frpDaemonPid() || !['instance', 'cluster'].includes(p.frpcIdentity)) { endDrop(); return null; }
      const ls = loginState();
      if (ls && !ls.ok && ls.code === 'knock_refused' && p.frpcKnock === true && !(Date.now() - (p.knockTrialAt || 0) < 600e3)) {
        const w = h.rec(); w.knockTrialAt = Date.now(); h.save();
        console.log('[plugins] frp: the relay refused the shared token — restarting frpc with this instance\'s own token only');
        restartSoon({ knock: false }, 'without the shared token');
        return ls;
      }
      noteRun();
      return ls;
    };
    /** a restart that waits for the old frpc to leave (its admin port) — never blocking the loop */
    let restarting = null;
    const restartSoon = (opts = {}, why = 'a relay change') => {
      if (restarting) return restarting;
      const pid = frpDaemonPid();
      try { verbs.stop(); } catch { }
      restarting = (async () => {
        for (let i = 0; pid && i < 60 && pidAlive(pid) && pidCmdline(pid).includes('frpc'); i++) await new Promise((r) => setTimeout(r, 50));
        verbs.start(opts);
      })().catch((e) => console.warn(`[plugins] frp: the relay did not restart (${why}):`, e.message)).finally(() => { restarting = null; });
      return restarting;
    };
    let watch = null;
    const watchLogin = (on) => {
      if (watch) { clearInterval(watch); watch = null; }
      if (on) { watch = setInterval(() => { try { observe(); } catch { } }, 60e3); watch.unref?.(); }
    };
    /** a proxy RAN: the identity it ran under is recorded, its subdomain kept for the card — and, on a frpc started WITHOUT
     *  the shared token, THE PROOF stamped with that frpc's run (lane frp-token-proof: the running pid is the run's own) */
    const relayPublished = (sub) => {
      const p = h.peek();
      if (!['instance', 'cluster'].includes(p.frpcIdentity)) return;
      const w = h.rec(), rid = runIdOf(w.frpcRun), thisRun = !!rid && w.frpcRun.pid === frpDaemonPid();
      let dirty = false;
      if (!w.relayPublishedAt) { w.relayPublishedAt = Date.now(); dirty = true; }
      if (thisRun && w.frpcProxyRun !== rid) { w.frpcProxyRun = rid; dirty = true; }
      if (thisRun && w.frpcKnock === false && !knocklessProven(w)) { w.relayKnocklessAt = Date.now(); w.relayKnocklessRun = rid; dirty = true; console.log(`[plugins] frp: a proxy ran on a frpc started without the shared token (run ${rid}) — the relay no longer asks for it`); }
      if (dirty) h.save();
      endDrop();   // the episode ends: a proxy ran
      if (sub && p.frpcIdentity === 'instance') { const r = relayRead().rec; if (r && r.token && !r.subdomains.includes(sub)) { try { relayWrite(RT.withSub(r, sub)); } catch (e) { console.warn('[plugins] frp: the relay record kept no subdomain:', e.message); } } }
      retireLegacy();
    };
    const restartIfRunning = (why) => { if (frpDaemonPid()) restartSoon({}, why); };
    /** the boot replay / an unlock: an instance configured the shared way mints its own identity, and a frpc an OLDER build
     *  started (it survives a hub upgrade, detached) — or one started before the identity — is restarted onto it, once */
    const relayAdopt = () => {
      if (!frpEffectiveEnabled()) return false;
      let cfg = frpCfg();
      if (cfg.ident.kind === 'none' && cfg.token && cfg.serverAddr && relayRead().state === 'none') { mintRecord(); cfg = frpCfg(); }
      if (frpDaemonPid() && cfg.ident.token && h.peek().frpcIdentity !== cfg.ident.kind) { restartSoon({}, 'onto its own relay token'); return true; }
      return false;
    };
    /** the Relay card's doors (config({ relay: op })): mint · rotate · revoke · upgraded (stop knocking) · knock (again) */
    const relayOp = (op) => {
      const ident = identity();
      if (ident.kind === 'cluster' || ident.kind === 'cluster-unnamed') throw Object.assign(new Error(`this instance logs in to the relay with its cluster's token (${RT.CLUSTER_TOKEN_ENV}) — its identity is the cluster's, nothing to ${op} here`), { code: 'relay_cluster' });
      const r = relayRead();
      if (['mint', 'rotate', 'revoke'].includes(op)) {
        if (!relayFile()) throw new Error('this plugin was built without a data dir — no relay identity');
        if (r.state === 'unreadable') throw Object.assign(new Error(`data/${RT.FILE} is unreadable — move it aside first (a new one would lose this instance's id and its public names)`), { code: 'relay_unreadable' });
      }
      const now = Date.now();
      if (op === 'mint' || op === 'rotate') {
        if (op === 'mint' && r.rec && r.rec.token) return;
        if (op === 'rotate' && !r.rec) throw Object.assign(new Error('this instance has no relay identity yet — mint one first'), { code: 'relay_none' });
        if (r.rec) relayWrite(RT.rotate(r.rec, { randomBytes: crypto.randomBytes, now })); else mintRecord();
        console.log(`[plugins] frp: relay token ${r.rec ? 'rotated' : 'minted'} — the old one is no longer used`);
        restartIfRunning();
      } else if (op === 'revoke') {
        if (!r.rec || !r.rec.token) throw Object.assign(new Error('there is no relay token to revoke'), { code: 'relay_none' });
        relayWrite(RT.revoke(r.rec, { now }));
        console.log(`[plugins] frp: relay token of ${r.rec.instanceId} revoked — the relay admin runs \`relay-admin revoke ${r.rec.instanceId}\``);
        try { verbs.stop(); } catch { }
      } else if (op === 'upgraded') {
        if (!ident.token) throw Object.assign(new Error('this instance has no relay token of its own yet — the shared one is its only key'), { code: 'relay_none' });
        const w = h.rec(); w.relayUpgradedAt = now; h.save();
        restartIfRunning();
      } else if (op === 'knock') {
        const p = h.peek();
        if (p.legacyRetired) throw Object.assign(new Error('the shared relay token already left this instance — set it again in the relay settings to knock with it'), { code: 'relay_retired' });
        const w = h.rec(); delete w.relayUpgradedAt; delete w.relayKnocklessAt; delete w.relayKnocklessRun; h.save();
        restartIfRunning();
      } else throw Object.assign(new Error(`unknown relay op ${String(op).slice(0, 20)} (mint / rotate / revoke / upgraded / knock)`), { code: 'bad_op' });
    };
    /** the Relay card's facts — never the token (the registration line carries its sha256 only) */
    const relayStatus = (c) => {
      const r = relayRead(), rec = r.rec, ident = c.ident, p = h.peek(), running = !!frpDaemonPid();
      const lines = !rec ? [] : rec.revokedAt ? [RT.registrationLine(rec, sha256, 'revoke')] : [RT.registrationLine(rec, sha256, 'add'), ...(rec.rotatedAt ? [RT.registrationLine(rec, sha256, 'rotate')] : [])];
      return {
        kind: ident.kind, file: r.state, user: ident.user || null, instanceId: rec ? rec.instanceId : null, label: rec ? rec.label : null,
        prefixes: ident.prefixes, subdomains: rec ? rec.subdomains : [], mintedAt: rec ? rec.mintedAt : null, rotatedAt: rec ? rec.rotatedAt : null, revokedAt: rec ? rec.revokedAt : null,
        lines: ident.kind === 'instance' || ident.kind === 'revoked' ? lines.filter(Boolean) : [],
        login: running ? loginState() : null,
        knock: c.knockOff ? 'off' : c.knockLocked ? 'locked' : c.token ? 'on' : 'none',
        upgradedAt: p.relayUpgradedAt || (knocklessProven(p) ? p.relayKnocklessAt : null), publishedAt: p.relayPublishedAt || null, retired: p.legacyRetired || null,
        // lane frp-token-proof: the running frpc's run — what its log counts; the dropped login by name; a frpc the lock started
        // without the shared token says its restart at the unlock is EXPECTED (the unlock takes it unless a proxy ran — never a trial)
        run: running ? { at: (p.frpcRun && p.frpcRun.at) || null, knock: p.frpcKnock !== false, logins: runScan().logins, proxies: runScan().proxies } : null,
        dropped: running && dropped ? { logins: dropped.logins, since: dropped.since, why: dropped.why } : null,
        restartAtUnlock: !!(running && restartsAtUnlock(p)),   // r2: the same predicate the unlock acts on (never a trial)
      };
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
          if (s) { delete rec.legacyRetired; delete rec.relayKnocklessAt; delete rec.relayKnocklessRun; delete rec.relayUpgradedAt; }   // lane relay-token-per-instance: a shared token set again is knocked with again
          h.save();
        }
        if (patch.relay !== undefined) relayOp(String(patch.relay));   // lane relay-token-per-instance: the Relay card's doors
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
        // lane relay-token-per-instance: the knock's retirement waits for an unlock when the vault holds it; a frpc the LOCK
        // started without the knock (its own token only) gets it back now — lane frp-token-proof: unless a proxy RAN in this
        // run (a login proves nothing: frps 0.70.0 takes a vouched login and drops it); r2: never a TRIAL run (restartsAtUnlock)
        try { retireLegacy(); } catch (e) { console.warn('[plugins] frp: the shared relay token was not retired:', e.message); }
        const p = h.peek();
        if (frpDaemonPid() && restartsAtUnlock(p) && frpCfg().token) {
          restartSoon({}, 'with the shared token');
          return sealed;
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
        if (restarting) return;   // a relay restart in flight starts it
        try { frpScrubConf(); } catch (e) { console.warn('[plugins] frp: the config scrub failed:', e.message); }
        try { if (relayAdopt()) return; } catch (e) { console.warn('[plugins] frp: the relay identity was not adopted:', e.message); }
        if (frpDaemonPid()) watchLogin(true);   // a frpc a previous life started: its login is watched again
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

      start({ knock: withKnock = true } = {}) {
        let cfg = frpCfg();
        if (cfg.vaultLocked) throw lockedRefusal('start');
        if (cfg.ident.kind === 'revoked') throw Object.assign(new Error(revokedWords), { code: 'relay_revoked' });   // fail closed: never the shared token in its place
        // the first start of a relay configured the shared way mints this instance's own identity (design q-051 §3)
        if (cfg.ident.kind === 'none' && cfg.token && cfg.serverAddr && relayRead().state === 'none') { mintRecord(); cfg = frpCfg(); }
        if (!frpConfigured()) throw new Error('the frp relay is not configured on this instance (set VIBESPACE_FRPS_ADDR/TOKEN)');
        const bin = frpBin();
        if (!bin) throw new Error('frpc not installed — run install first');
        if (frpDaemonPid()) return { running: true };
        const knock = withKnock ? cfg.token : '';
        frpWriteConf(cfg, !!knock);
        const logFrom = logSize();
        const logFd = fs.openSync(path.join(frpDir(), 'frpc.out'), 'a');
        // the tokens: the child's env only — BUILT, never the hub's inherited (an agent conversation's session tokens, the cluster's
        // shared token, cloud keys never reach frpc): the kept names + this instance's token + the knock (lane frp-spawn-env-allowlist)
        const env = RT.relayEnv(process.env, { token: cfg.ident.token || '', knock });
        const child = spawn(bin, ['-c', frpConf()], { detached: true, stdio: ['ignore', logFd, logFd], env });
        child.unref();
        fs.writeFileSync(frpPidFile(), String(child.pid));
        const rec = h.rec();
        rec.desiredUp = true;
        rec.frpcKnock = !!knock; rec.frpcIdentity = cfg.ident.token ? cfg.ident.kind : 'none'; rec.frpcLogFrom = logFrom;   // what THIS frpc logs in with
        // lane frp-token-proof: THIS run (the proof is stamped with it) and why it sends no knock — `locked` = the vault kept
        // the shared token closed: during the grace the relay drops such a frpc, so the unlock restarts it WITH the token
        rec.frpcRun = { pid: child.pid, at: Date.now() };
        if (knock) delete rec.frpcKnockless; else rec.frpcKnockless = cfg.knockLocked ? 'locked' : cfg.knockOff ? 'off' : !withKnock && cfg.token ? 'trial' : 'none';
        h.save();
        if (!knock && cfg.knockLocked) console.log('[plugins] frp: frpc starts without the shared relay token (the vault is locked) — the relay may drop it until the unlock, which restarts frpc with the token');
        watchLogin(true);
        setTimeout(() => h.notify(), 1200);
        return { starting: true };
      },

      stop() {
        watchLogin(false);
        endDrop();   // the episode ends with its run (a restart WITH the token, a settings change, the relay stopped)
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
          missing: [!c.serverAddr && 'serverAddr', !c.token && !c.ident.token && !c.vaultLocked && !c.knockLocked && 'token'].filter(Boolean),
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
          relay: relayStatus(c),   // lane relay-token-per-instance: this instance's own identity (never its token)
        };
      },

      /** Publish a LOCAL port to the public internet via the relay. If a
       *  subDomainHost is configured → a random `https://<sub>.<host>` subdomain
       *  (the SNI broker); else a TCP port map `http://<relay>:<port>/` (retrying
       *  on collision — the relay is fleet-shared). name = a stable proxy name. */
      async publish(name, localPort, { preferPort = 0, preferSub = '', proto: protoHint = '' } = {}) {
        const cfg0 = frpCfg();
        if (cfg0.vaultLocked) throw lockedRefusal('publish a public URL');
        if (cfg0.ident.kind === 'revoked') throw Object.assign(new Error(revokedWords), { code: 'relay_revoked' });
        if (!frpConfigured()) throw new Error('public URLs are not available — the frp relay is not configured on this instance');
        if (!frpDaemonPid()) { verbs.start(); await new Promise((r) => setTimeout(r, 1500)); }
        try { observe(); } catch { }   // r2: no refusal before a try — publish() always tries ONE NewProxy (a proxy that runs ends the episode)
        const cfg = frpCfg();
        const safe = String(name).replace(/[^\w-]/g, '_').slice(0, 60);
        const file = path.join(frpProxiesDir(), safe + '.toml');
        // THE NAME RULE before the relay judges it (its plugin answers the same per proxy — lane relay-token-per-instance)
        const user = h.peek().frpcIdentity && h.peek().frpcIdentity !== 'none' ? cfg.ident.user : null;
        if (user && !RT.nameVerdict({ prefixes: cfg.ident.prefixes, user }, { proxyName: safe }).ok) throw Object.assign(new Error(`the relay would refuse the proxy name ${safe} (name_not_yours) — this instance's names start with ${cfg.ident.prefixes.join(' / ')}`), { code: 'name_not_yours' });
        const own = (x) => x.name === safe || (!!user && x.name === `${user}.${safe}`);   // frps registers `<user>.<name>`
        const refusal = (p, pub) => { const ref = RT.refusalOf(p && p.err); if (ref) relayAlert(ref, pub); return ref ? `${RT.REASONS[ref.code]}${ref.owner ? ` (${ref.owner})` : ''}` : ''; };

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
          let refused = '';
          const tried = Date.now();
          const toml = `[[proxies]]\nname = "${safe}"\ntype = "http"\nsubdomain = "${sub}"\nlocalIP = "127.0.0.1"\nlocalPort = ${localPort}\nhostHeaderRewrite = "127.0.0.1"\n`;
          fs.writeFileSync(file, toml, { mode: 0o600 });
          try { await frpReload(); } catch (e) { throw new Error('frpc reload failed: ' + e.message); }
          for (let t = 0; t < 12; t++) {
            await new Promise((r) => setTimeout(r, 400));
            let st = []; try { st = await frpProxyStatus('http'); } catch { }
            const p = st.find(own);
            if (p && p.status === 'running') { relayPublished(sub); h.notify(); return { name: safe, subdomain: sub, proto, url: `https://${sub}.${cfg.subDomainHost}/`, publicHost: `${sub}.${cfg.subDomainHost}` }; }
            if (p && (p.status === 'error' || p.status === 'closed' || p.status === 'start error')) { refused = refusal(p, sub); break; }
          }
          try { fs.unlinkSync(file); await frpReload(); } catch { }
          if (refused) { endDrop(); throw Object.assign(new Error(`the relay refused ${sub}: ${refused}`), { code: 'relay_refused' }); }   // an answer: the control is keyed right
          try { noteTry(tried); noteRun(); } catch { }   // the ONE NewProxy went unanswered
          if (dropped) throw droppedError();   // nothing was refused: the relay dropped the login — never «DNS»
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
          const tried = Date.now();
          let answered = false;
          fs.writeFileSync(file, toml, { mode: 0o600 });
          try { await frpReload(); } catch (e) { lastErr = e.message; continue; }
          // poll the proxy's run state — 'running' = the relay accepted the port
          for (let t = 0; t < 12; t++) {
            await new Promise((r) => setTimeout(r, 400));
            let st = []; try { st = await frpProxyStatus(); } catch { }
            const p = st.find(own);
            if (p && p.status === 'running') {
              relayPublished(null);
              h.notify();
              // scheme reflects what the backend speaks: https:// keeps its own
              // cert (passthrough), http:// for plaintext web, tcp:// for a raw
              // service (DB/VNC/SSH — not a browser link)
              const scheme = proto === 'https' ? 'https' : proto === 'tcp' ? 'tcp' : 'http';
              const url = proto === 'tcp' ? `tcp://${cfg.serverAddr}:${remotePort}` : `${scheme}://${cfg.serverAddr}:${remotePort}/`;
              return { name: safe, remotePort, proto, url, publicHost: cfg.serverAddr };
            }
            if (p && (p.status === 'error' || p.status === 'closed' || p.status === 'start error')) { const why = refusal(p, safe); lastErr = why || p.err || 'port unavailable'; answered = true; break; }
          }
          if (answered) endDrop();   // the relay answered (a refused port): the control is keyed right — no drop
          else { try { noteTry(tried); noteRun(); } catch { } }
          if (dropped) break;   // lane frp-token-proof: the port is not the cause — no other port is tried
        }
        try { fs.unlinkSync(file); await frpReload(); } catch { }
        if (dropped) throw droppedError();
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
