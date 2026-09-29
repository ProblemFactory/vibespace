'use strict';
// MOUNTS + PLUGINS + DIAL-SESSION WIRING (decomposition #12): the MountManager
// and PluginManager singletons with their route families, the DialSessionBridge,
// graduateHostToDial (ssh→dial graduation used by both the button and the
// auto path), and createSessionMessages (the transcript-reader factory).
// Extracted VERBATIM. ORCH tier.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFile, execFileSync } = require('child_process');
const { SessionMessages } = require('../session-store');
const { CodexSessionMessages } = require('../codex-session-store');
const { MountTokens } = require('../webdav');

const { mk } = require('./lazy.js');

function create({ app, server, rootDir, HOST, PORT, BUFFERS_DIR, PERMISSION_MODES,
  auth, wss, WS_OPEN, bcastAll, serverSetting, mountTokens, persistenceRouter, instanceUrl,
  hosts, agentdDials, agentdHostToken, agentdMintDialPair, deviceForDial, lockOutDialHolder = () => false,
  ensureAgentdOnHost, getPortForwards, onMountsUpdated, activeSessions, getTelemetry = null, serverNotice = null, broadcastActiveSessions = null,
  // agent browser P1 second half (§3.2.5 / §3.8): the Task-Group default rung, the
  // zero-billed notice queue and the session-meta writer the pin persists through
  getTasks = null, sessionStatusKey = null, getSessionStatus = null, persistSessionMeta = null, rebindSessionMeta = null,
  // B-f7ab: the late browser key reads the record it extends (never a partial one) and asks THE integration switch
  readSessionMetaOf = null, integrationEnabled = null,
  // agent browser P3 (§4.3.1): the ONE delivery ladder the handback announcer forwards to, and the "For you" inbox
  deliver = null, userTodos = null,
  // lane J r2: the adapter registry the browser takeover's stale sweep answers pending approvals through (THE one permission answer)
  adapterRegistry = null,
  // agent browser P4 second half (§7.5): the integration store (src/server/integrations-wiring.js, created BEFORE this
  // wiring in server.js) the key consumer resolves through — never process.env
  integrations = null }) {
  const portForwards = mk(getPortForwards);
// ── Mounts (rclone S3 mounts + share minting — collaboration P1) ──
// ── Plugins (2.140.0, B-2d44): host-level capabilities with persistent state ──
const { PluginManager } = require('../plugins');
const plugins = new PluginManager({
  dataDir: path.join(rootDir, 'data'),
  broadcast: (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
// port-forward can publish a forward publicly via the frp plugin (B-0b60)
portForwards.plugins = plugins;
setTimeout(() => { try { plugins.bootReplay(); } catch (e) { console.warn('[plugins] boot replay:', e.message); } }, 5000);
// CS data-plane deps for hosts.device(id) (2.146.0) — wired SYNCHRONOUSLY.
// (Was a setTimeout(1000); a device dialing in during that window ran mount
// heal / hosts.device() before deps existed → "agentd deps not wired" and a
// failed heal — real owner log. The referenced functions are hoisted
// declarations and `hosts` already exists here, so no defer is needed.)
try {
  hosts.agentdDeps = {
    ensureAgentdOnHost, agentdHostToken, deviceForDial,
    bundlePath: path.join(rootDir, 'data', 'bin', 'vibespace-agentd.js'),
    version: require(require('path').join(rootDir, 'package.json')).version,
  };
  hosts.dataPlaneOn = () => true; // GRADUATED (agentd.dataPlane flag removed) — ssh per-op remains the per-path failure fallback
} catch (e) { console.warn('[device] data-plane deps wiring failed:', e.message); }
// Transport B pairing: mint a device id + dial token + the one-liner the user
// runs on the NAT'd device (no ssh needed). Cookie-authed (user action).
// The pairing IS the machine registration — the dial host record carries the
// token hash (B-f3e8); re-pairing an existing name rotates its token in place.
// B-6640: graduate an SSH machine to dial-out — install the device daemon as
// a persistent service on the host (over ssh, ONE time) so it dials back over
// ws; from then on every data-plane op prefers the dial link (our own
// handshake/heartbeat/reconnect — none of ssh's banner-hang/ControlMaster/
// per-op-child taxes). transport STAYS ssh = the bootstrap + rescue channel.
// NAT rules (user directive): base = explicit serverUrl > agentd.publicUrl >
// relay (viaRelay); the host-side REACHABILITY PRECHECK runs before anything
// is installed — unreachable ⇒ abort, stay pure-ssh. {remove:true} rolls the
// whole thing back (service + root on the host, dial fields on the record).
/** SSH → WS graduation, install half (2.311.0 extracted so it can run
 *  AUTOMATICALLY, not only from a button — the mechanism shipped in 2.248.0
 *  but every machine stayed on ssh because someone had to click it).
 *  Installs the daemon as a persistent service on the machine and has it DIAL
 *  BACK over ws. Throws with a user-readable reason; ssh always remains as the
 *  bootstrap + rescue channel. */
async function graduateHostToDial(h, { serverUrl, viaRelay } = {}) {
  const sshRun = (script, timeout = 30000) => new Promise((resolve) => {
    const { execFile } = require('child_process');
    execFile('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', script],
      { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, so, se) => resolve({ ok: !err, out: String(so || ''), err: String(se || err?.message || '') }));
  });
    // ── install ──
    let base = String(serverUrl || '').replace(/\/$/, '') || String(instanceUrl?.url() || '').replace(/\/$/, '') || null; // ONE resolver (2.367.0): frp mapping layered over agentd.publicUrl.() — a free identifier since the split (2.343.2 audit)
    if (!base && viaRelay) {
      // ONE publisher of the 'vibespace-instance' proxy (instance-url.js):
      // two callers writing the same relay proxy name fought over it, and
      // this one published the whole app with nothing recording it.
      base = String(await instanceUrl.ensurePublished()).replace(/\/$/, '');
    }
    if (!base) throw new Error('no reachable base URL: set agentd.publicUrl, pass serverUrl, or use viaRelay (frp plugin)');
    // reachability PRECHECK from the HOST (any HTTP status = reachable; 000 = not)
    const chk = await sshRun(`curl -s -o /dev/null -w '%{http_code}' --max-time 10 ${JSON.stringify(base + '/api/home')} 2>/dev/null || echo 000`, 20000);
    const code = (chk.out.trim().match(/\d{3}$/) || ['000'])[0];
    if (code === '000') throw new Error(`the machine cannot reach ${base} — graduation aborted (staying on ssh). If this instance is behind NAT, use viaRelay.`);
    // mint onto the EXISTING ssh record (deviceId first so setDialToken finds it)
    // dialRoot must mirror the INSTALLER's derivation byte-for-byte (it does
    // sed hostname-only + tr -cd 'A-Za-z0-9.-') or the removal path tears
    // down the wrong directory.
    const dialHost = (new URL(base).hostname || 'dial').replace(/[^A-Za-z0-9.-]/g, '');
    const root = `$HOME/.vibespace/device@${dialHost || 'dial'}`;
    hosts.graduateDial(h.id, { dialRoot: root });
    const gradDevice = hosts.get(h.id).deviceId;
    const dialUrl = `${base.replace(/^http/, 'ws')}/api/device-dial?device=${gradDevice}`;
    const pair = agentdMintDialPair(gradDevice, { host: require('../dial-facts.js').hostOf(dialUrl), base });
    // ship + run the installer over ssh STDIN — the installer AND its arguments (verify-r3 B-grad): the tokens used to
    // ride `ssh … -- 'bash -s -- … --dial-token vsdt_… --host-token vsht_…'`, i.e. the argv of the LOCAL ssh (readable
    // by every user of this machine through /proc/<pid>/cmdline for the whole install, ≤ 300 s) and the remote shell's
    // command line (the same on the machine). Now the remote command is the bare `bash -s` and the arguments are a
    // `set -- …` line bash reads from stdin before the installer's own text — the installer parses "$@" unchanged.
    const installer = fs.readFileSync(path.join(rootDir, 'scripts', 'vibespace-agentd-install.sh'), 'utf-8');
    const args = `--bundle-url ${JSON.stringify(base + '/vibespace-device.js')} --dial ${JSON.stringify(dialUrl)} --dial-token ${pair.dialToken} --host-token ${pair.hostToken}`;
    const inv = require('../dial-facts.js').sshInstallInvocation({ args, installer });
    const inst = await new Promise((resolve) => {
      const { execFile } = require('child_process');
      const child = execFile('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', inv.remote],
        { timeout: 300000, maxBuffer: 8 * 1024 * 1024 }, (err, so, se) => resolve({ ok: !err, out: String(so || '').slice(-3000), err: String(se || err?.message || '').slice(-1500) }));
      child.stdin.on('error', () => { });
      child.stdin.end(inv.stdin);
    });
    if (!inst.ok) { hosts.ungraduateDial(h.id); bcastAll({ type: 'hosts-updated' }); throw new Error('installer failed on the host — rolled back: ' + (inst.err || inst.out).slice(-600)); }
    // wait for the dial-in (installer verifies the daemon started; the dial
    // itself can lag a few seconds)
    let dialed = false;
    for (let i = 0; i < 15; i++) { if (hosts.dialOnline?.(pair.deviceId)) { dialed = true; break; } await new Promise(r => setTimeout(r, 2000)); }
    bcastAll({ type: 'hosts-updated' });
  return { success: true, dialedIn: dialed, base, deviceId: pair.deviceId, note: dialed ? 'dial link live — data-plane ops now prefer it (ssh stays as rescue)' : 'installed — daemon not dialed in yet; check again shortly or see the machine row' };
}

app.post('/api/hosts/:id/graduate-dial', async (req, res) => {
  try {
    const h = hosts.get(req.params.id);
    if (h.transport === 'dial') return res.status(400).json({ error: 'already a dial device' });
    const sshRun = (script, timeout = 30000, input = null) => new Promise((resolve) => {
      const { execFile } = require('child_process');
      execFile('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', script],
        { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, so, se) => resolve({ ok: !err, out: String(so || ''), err: String(se || err?.message || '') }));
      });
    if (req.body?.remove) {
      // best-effort remote teardown, ALWAYS clear the record (dead host must
      // not hold the graduation hostage — the machine-mounts unmount lesson)
      const root = h.dialRoot || '';
      if (root && /^\$HOME\/[\w@.\/-]+$/.test(root)) {
        const key = require('path').basename(root).replace(/[^A-Za-z0-9.-]/g, '-').replace(/-+$/, '');
        await sshRun(`systemctl --user disable --now "vibespace-device-${key}.service" 2>/dev/null; ` +
          `launchctl bootout "gui/$(id -u)/cc.vibespace.device.${key}" 2>/dev/null; ` +
          `pkill -f "${root}/" 2>/dev/null; sleep 1; rm -rf "${root}"; echo VS_REMOVED`, 30000);
      }
      const devId = h.deviceId;
      hosts.ungraduateDial(h.id);
      try { if (devId && agentdDials.has(devId)) { agentdDials.get(devId)?.destroy?.(); agentdDials.delete(devId); } } catch { }
      bcastAll({ type: 'hosts-updated' });
      return res.json({ success: true, removed: true });
    }
    // lane-pairing ①: the chosen address (the pairing dialog's list) — judged by the ONE verdict before anything runs
    let serverUrl = req.body?.base ?? req.body?.serverUrl;
    if (serverUrl && !req.body?.viaRelay) { const v = require('../dial-facts.js').dialBaseVerdict(serverUrl); if (!v.ok) return res.status(400).json({ error: `not an address the machine can dial (${v.code})`, code: 'bad_base', why: v.code }); serverUrl = v.base; }
    const out = await graduateHostToDial(h, { serverUrl, viaRelay: req.body?.viaRelay });
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── PAIRING (lane-pairing ①②③, B-7007; the owner's MacBook 2026-09-27) ──
// ① the address list: every address the SERVER can name for itself — the browser's origin, the relay, this
//    host's Tailscale / LAN / public interface IPs, its hostname, IPv6 (PURE src/dial-facts.js). Read-only.
app.get('/api/device/dial-addresses', (req, res) => {
  try {
    const DF = require('../dial-facts.js');
    const deviceId = DF.deviceIdOf(req.query.device); // THE one name rule
    const origin = req.headers.origin || `${String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()}://${req.headers.host || ''}`;
    let relay = null, relayPublishable = false;
    try { const st = instanceUrl?.status?.() || {}; relay = st.effectiveUrl || null; relayPublishable = !!(st.frpConfigured && !st.published && !relay); } catch { }
    // verify-r4 F3: the address this server's SOCKET is bound to (not the addresses the machine has) decides which
    // interface rows a device can reach — HOST=127.0.0.1 ("local-only", README) used to list four addresses that all
    // refused the connection, the tailnet one checked
    const bind = (() => { try { const a = server && typeof server.address === 'function' ? server.address() : null; return a && typeof a === 'object' && a.address ? a.address : (HOST || null); } catch { return HOST || null; } })();
    const candidates = DF.dialAddressCandidates({ origin, relay, hostname: os.hostname(), interfaces: os.networkInterfaces(), port: PORT, deviceId: deviceId || 'DEVICE', bind });
    res.json({ candidates, deviceId, relayPublishable, listen: { address: bind, loopbackOnly: DF.bindAdmits(bind).loopbackOnly } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// ② THE ONLY MINTER, called by two buttons ("Create pairing", "Generate a new command") — opening a dialog never
//    mints (test-architecture's mint census). The chosen `base` builds BOTH urls of the command; a custom one is
//    re-judged here (a client is not trusted) BEFORE anything is minted.
app.post(['/api/device/dial-pair', '/api/agentd/dial-pair'], async (req, res) => {
  try {
    const DF = require('../dial-facts.js');
    const deviceId = DF.deviceIdOf(req.body?.deviceId || ('dev-' + require('crypto').randomBytes(4).toString('hex'))); // THE one name rule (the dialog judges a collision with it — verify-r4 F6)
    if (!deviceId) return res.status(400).json({ error: 'the device name has no letters, digits, - or _ left', code: 'bad_name' });
    // verify-r5 A1: THE NAME VERDICT, here, before anything is published, minted or cut — the dialog's note judged its
    // own copy of the list (two windows / a device that came online raced it)
    const nv = DF.pairRequestVerdict({ deviceId, expect: req.body?.expect === 'new' ? 'new' : req.body?.expect === 'existing' ? 'existing' : null, hosts: hosts.list() });
    if (!nv.ok) return res.status(409).json({ error: nv.error, code: nv.code, deviceId, ...(nv.code === 'already_paired' ? { online: !!nv.online } : {}), ...(nv.twin ? { twin: nv.twin } : {}) }); // verify-r5 A3: + name_case_taken {twin}
    // Double-NAT pairing (B-5c1e): when THIS instance is itself behind NAT, viaRelay publishes the instance's OWN
    // http port through the frp relay and hands the device a public subdomain to dial — BEFORE the mint (a failed
    // publish mints nothing).
    let base = null;
    let relayUrl = null;
    if (req.body?.viaRelay) {
      try {
        relayUrl = String(await instanceUrl.ensurePublished()).replace(/\/$/, '');
        base = relayUrl;
      } catch (e) { return res.status(400).json({ error: 'could not publish this instance to the relay: ' + e.message + ' — is the frp plugin installed + started (⚙ → Plugins → Public URLs)?', code: 'relay_unpublished' }); }
    } else {
      const v = DF.dialBaseVerdict(req.body?.base ?? req.body?.serverUrl);
      if (!v.ok) return res.status(400).json({ error: `not an address the device can dial (${v.code})`, code: 'bad_base', why: v.code });
      base = v.base;
    }
    const dialUrl = DF.dialUrlOf(base, deviceId);
    // minting for an EXISTING deviceId is a RE-PAIR: setDialToken rotates the hash on the existing record
    // (mounts/forwards/history kept, host token file untouched) — no unpair needed (userW lesson: unpair-first
    // deleted the record and orphaned the still-running device daemon)
    // verify-r5 A1: …and AGAIN here, synchronous with the mint — the relay publish above awaited, and a second window's
    // Create could have minted this name meanwhile
    const nv2 = DF.pairRequestVerdict({ deviceId, expect: req.body?.expect === 'new' ? 'new' : req.body?.expect === 'existing' ? 'existing' : null, hosts: hosts.list() });
    if (!nv2.ok) return res.status(409).json({ error: nv2.error, code: nv2.code, deviceId, ...(nv2.code === 'already_paired' ? { online: !!nv2.online } : {}), ...(nv2.twin ? { twin: nv2.twin } : {}) });
    const existed = !!hosts.findByDeviceId(deviceId);
    // RE-PAIR of a device that is dialed-in RIGHT NOW: push the rotated dial config over the live link — the
    // daemon re-reads dial.json per attempt (2.170.0), so nothing needs to run on the device. Best-effort; the
    // command is the universal fallback. ONLY WHEN ASKED (verify-r1 B8, PURE inPlacePushVerdict): a rotation is also
    // how a leaked command is retired, and the push handed the new token to whoever held the old one.
    // verify-r2 B8-r2: the verdict is asked BEFORE the mint because the mint ENDS the holder's link unless the push
    // wants it (`keepLink`) — r1 left the holder connected "until its next dial", i.e. until it chose to drop, and B9
    // then refused the owner's device on the new command as the holder's duplicate. A push that does not land cuts
    // the link as well: the device holds a command that is no longer the pairing.
    const holderConnected = !!agentdDials.get(deviceId);
    // verify-r6 P1: a requested push names the link the sheet SHOWED (`keepLinkSince` = its lastConnectAt); a link that
    // is gone or is another one ⇒ refused by name before anything is minted, cut or published further
    const liveRec = existed ? hosts.findByDeviceId(deviceId) : null;
    const pushV = DF.inPlacePushVerdict({ existed, live: holderConnected, requested: req.body?.updateInPlace === true, shownSince: req.body?.keepLinkSince === undefined ? undefined : req.body.keepLinkSince, liveSince: liveRec && liveRec.dial ? liveRec.dial.lastConnectAt : null });
    if (pushV.refuse) return res.status(409).json({ code: pushV.refuse, deviceId, error: pushV.refuse === 'link_gone' ? `"${deviceId}" is no longer connected — nothing was changed; its new command cannot be sent over its link` : `"${deviceId}" reconnected after the sheet was opened (or another device dialed in under its name) — nothing was changed; reopen the sheet` });
    let pair;
    try { pair = agentdMintDialPair(deviceId, { host: DF.hostOf(dialUrl), base, keepLink: pushV.push }); }
    catch (e) { return res.status(400).json({ error: e.message, code: /collides/.test(e.message) ? 'collision' : 'mint_failed' }); }
    bcastAll({ type: 'hosts-updated' });
    let updatedInPlace = false;
    let lockedOut = !!pair.lockedOut;
    if (pushV.push) {
      try {
        const dm = await deviceForDial(deviceId);
        const root = String((await dm.runCmd('sh', ['-c', 'printf %s "${VIBESPACE_DEVICE_ROOT:-$VIBESPACE_AGENTD_ROOT}"'], { timeoutMs: 8000 })).stdout || '').trim();
        if (root && path.isAbsolute(root)) {
          // verify-r3 (the dial-token door census): a token written onto a device goes through the device's ONE secret
          // door, `place-secret` — 0600 at open, tmp + rename (the fsWrite-then-chmod pair it replaced left a window at
          // the umask's mode, and a chmod that failed was swallowed). A daemon without the op, or a root outside its
          // $HOME (the op's own fence), keeps the old pair (the device's state dir is 0700 — the window is its owner's).
          const body = Buffer.from(JSON.stringify({ url: dialUrl, token: pair.dialToken }));
          let via = 'place-secret';
          try { await dm.placeSecret(root + '/state/dial.json', body); }
          catch {
            via = 'fs-write';
            await dm.fsWrite(root + '/state/dial.json', body);
            await dm.runCmd('chmod', ['600', root + '/state/dial.json'], { timeoutMs: 5000 }).catch(() => {});
          }
          updatedInPlace = true;
          console.log(`[device] '${deviceId}': the rotated dial config pushed in place (${via})`);
        }
      } catch { /* offline mid-flight / old bundle — the command covers it */ }
      if (!updatedInPlace) lockedOut = lockOutDialHolder(deviceId) || lockedOut; // the push did not land: the holder keeps a retired command
    }
    res.json({
      ...pair,
      dialUrl, httpBase: base,
      repair: existed,
      updatedInPlace, holderConnected, lockedOut, inPlace: pushV.why, // a connected holder NOT updated is DISCONNECTED now and refused at its next dial (the row says `refused (token mismatch)`)
      relayUrl, // the public subdomain the device dials (double-NAT mode)
      command: `VIBESPACE_DIAL_TOKEN=${pair.dialToken} node vibespace-device.js --dial ${dialUrl}`, // verify-r3 B-inst: the token in the environment (the daemon reads it once and removes it), never an argv
      note: 'install the device daemon bundle on the device, write the hostToken to <root>/state/token (0600), then run with --dial',
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// ③ the DEVICE's own record of its dials (the `dial-status` agentd op — THREE-TOUCH, capability-gated: an old
//    daemon is never asked). Human-triggered (the Machines card's "Dial history…"), never on render.
app.get('/api/hosts/:id/dial-status', async (req, res) => {
  let h;
  try { h = hosts.get(req.params.id); } catch { return res.status(404).json({ error: 'no such machine', code: 'not-found' }); }
  if (!h.deviceId) return res.status(404).json({ error: 'this machine does not dial in', code: 'not-found' });
  if (!agentdDials.get(h.deviceId)) return res.status(503).json({ error: `"${h.name || h.id}" is offline — its daemon is not dialed in`, code: 'offline' });
  try {
    const dm = await deviceForDial(h.deviceId);
    res.json({ status: await dm.dialStatus() });
  } catch (e) {
    if (e && e.code === 'host_needs_daemon') return res.status(409).json({ error: e.message, code: 'host_needs_daemon' });
    res.status(503).json({ error: e.message, code: 'offline' });
  }
});
// (the /api/agentd/devices roster/test/unpair routes retired in B-f3e8 —
// machines are listed by /api/hosts, tested by /api/hosts/:id/test, unpaired
// by DELETE /api/hosts/:id)
const { DialSessionBridge } = require('../dial-session-bridge');
const dialBridge = new DialSessionBridge({
  deviceForDial,
  hostTokenFor: (deviceId) => agentdHostToken('dial-' + deviceId),
  log: (m) => console.log('[dial-bridge]', m),
});
// Standalone device install: serve the agentd bundle + installer (public — the
// bundle is not secret; auth is the per-device dial/host token at connect).
// Canonical names since the vibespace-device rename (2.154.x): /agentd.js and
// /agentd-install.* stay as PERMANENT aliases — commands in old docs/pairings
// must keep working.
app.get(['/vibespace-device.js', '/agentd.js'], (req, res) => {
  try { res.type('application/javascript').send(fs.readFileSync(path.join(rootDir, 'data', 'bin', 'vibespace-agentd.js'))); }
  catch { res.status(404).end(); }
});
app.get(['/vibespace-device-install.ps1', '/agentd-install.ps1'], (req, res) => {
  try { res.type('text/plain').send(fs.readFileSync(path.join(rootDir, 'scripts', 'vibespace-agentd-install.ps1'), 'utf-8')); }
  catch { res.status(404).end(); }
});
app.get(['/vibespace-device-install.sh', '/agentd-install.sh'], (req, res) => {
  try { res.type('text/x-shellscript').send(fs.readFileSync(path.join(rootDir, 'scripts', 'vibespace-agentd-install.sh'), 'utf-8')); }
  catch { res.status(404).end(); }
});
// Node runtime MIRROR for the device installer (2.246.0): a machine that can
// reach THIS instance (or its relay) but not nodejs.org — corporate egress
// filters, CN networks — still pairs. The installer only falls back here when
// the direct download fails. NEVER a general proxy: fixed upstream host +
// strict version/filename allowlist, cached on disk. Both the tarball and the
// SHASUMS come through here, so for that device the trust anchor becomes this
// instance — which it already trusts to serve the daemon bundle it runs.
app.get('/vibespace-node/:version/:file', async (req, res) => {
  const v = String(req.params.version || ''), f = String(req.params.file || '');
  if (!/^v\d+\.\d+\.\d+$/.test(v)) return res.status(400).end();
  if (!/^(SHASUMS256\.txt|node-v\d+\.\d+\.\d+-(linux|darwin)-(x64|arm64|armv7l|ppc64le|s390x)(-musl)?\.tar\.gz|node-v\d+\.\d+\.\d+-win-(x64|arm64)\.zip)$/.test(f))
    return res.status(400).end();
  const dir = path.join(rootDir, 'data', 'node-cache', v), dest = path.join(dir, f);
  try {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dir, { recursive: true });
      const r = await fetch(`https://nodejs.org/dist/${v}/${f}`);
      if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status });
      const tmp = `${dest}.tmp`;
      await require('stream/promises').pipeline(require('stream').Readable.fromWeb(r.body), fs.createWriteStream(tmp));
      fs.renameSync(tmp, dest);
    }
    res.type(f.endsWith('.txt') ? 'text/plain' : 'application/octet-stream');
    fs.createReadStream(dest).pipe(res);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/plugins', (req, res) => {
  try { res.json({ plugins: plugins.list() }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/plugins/:id/status', (req, res) => {
  try { res.json(plugins.status(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/install', async (req, res) => {
  try { res.json(await plugins.install(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/start', (req, res) => {
  try { res.json(plugins.start(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/stop', (req, res) => {
  try { res.json(plugins.stop(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/login', async (req, res) => {
  try { res.json(await plugins.loginStart(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/enabled', (req, res) => {
  try { plugins.setEnabled(req.params.id, !!req.body?.enabled); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/mode', (req, res) => {
  try { res.json(plugins.setMode(req.params.id, String(req.body?.mode || 'auto'))); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/config', (req, res) => {
  try { res.json(plugins.setConfig(req.params.id, req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
});
// "we already offered this plugin" — the first-use dialog is asked ONCE per
// instance (owner: "Not now" is remembered), so the flag is INSTANCE state
// (data/plugins.json) that broadcasts, never per-browser localStorage.
app.post('/api/plugins/:id/prompted', (req, res) => {
  try { res.json(plugins.setPrompted(req.params.id, req.body?.prompted !== false)); } catch (e) { res.status(400).json({ error: e.message }); }
});

// PLUGIN LOADER (Ph2, 2.369.24; Ph4 2.369.30): manifest plugins under
// data/plugins — iframe assets, trusted client modules, forked server
// processes under node --permission, agent-tool shims, install sources.
// agentAuth = the vsst_ bearer → live session (the tool route is cookie-exempt
// under /api/agent/). instanceUrl = the ONLY source of "this instance's public
// address" the shims may bake in (instance-url.js); telemetry = install /
// enable / crash events into the local ledger.
let hostVersion = null; try { hostVersion = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')).version; } catch { }
const { agentEnv } = require('../ws-handler'); // the ONE sanitized-env builder every spawn uses (spawn-hygiene law)
const pluginLoader = require('./plugin-loader.js').create({
  rootDir, app, hostVersion, agentEnv, log: console, instanceUrl,
  broadcast: (m) => bcastAll(m),
  telemetry: (ev) => { try { getTelemetry?.()?.record(ev); } catch { } },
  agentAuth: (req) => {
    const tok = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!tok.startsWith('vsst_') || !activeSessions) return null;
    for (const [id, s] of activeSessions) if (s.agentToken === tok) return { sessionId: id };
    return null;
  },
});
process.on('exit', () => { try { pluginLoader.shutdown(); } catch { } });
// Plugin tool shims ship to ssh hosts / dial devices with the core agent tools:
// hosts.js agentTools() = the static list + whatever the loader generates now.
require('../hosts').HostManager.extraAgentTools = () => pluginLoader.shimNames();
// The shims bake this instance's public URL as their fallback call-back
// address — regenerate them whenever the mapping changes (publish/unpublish).
try { instanceUrl?.onChange?.(() => { try { pluginLoader.syncShims(); } catch (e) { console.warn('[plugins] shim refresh after instance-url change failed:', e.message); } }); } catch { }

const { MountManager } = require('../mounts');
const mounts = new MountManager({
  dataDir: path.join(rootDir, 'data'),
  getSetting: serverSetting,
  broadcast: (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
    // Mount state changed ⇒ context folders skipped as shadowed may be back.
    if (msg?.type === 'mounts-updated') { try { onMountsUpdated?.(); } catch (e) { console.warn('[mounts] onMountsUpdated failed:', e.message); } }
  },
});
// The task store regenerated TASK.md at boot BEFORE mounts existed (its shadow
// predicate answered null) — redo it now that isMounted() can answer.
try { onMountsUpdated?.(); } catch (e) { console.warn('[mounts] boot ctx resync failed:', e.message); }
// Rename guard: bridge-share chroots are filesystem paths under the mount.
// MUST be OUTSIDE the broadcast callback — it was mis-nested inside, so every
// broadcast re-ran it, and a broadcast DURING construction (env-import add →
// _notify → broadcast) referenced `mounts` while it was still in its TDZ,
// throwing "Cannot access 'mounts' before initialization" out of add() before
// it returned the id — which is why an env-provisioned My storage (S3 or
// CephFS) came up `desired: unmounted` on its very first boot.
mounts.pathGuard = (p) => mountTokens.list().some((t) => String(t.root || '').startsWith(p));
setTimeout(() => mounts.restore().catch(e => console.error('[mounts] restore:', e.message)), 2000);
// Hung-mount watchdog: one unreachable backend must never wedge the server
// (libuv threadpool saturation — see mounts.js _healthSweep).
mounts.startHealthWatchdog();
app.locals.mounts = mounts; // files.js circuit breaker asks it about blocked mount roots
// Self-mount guard: a bridge token WE minted = the share points back at this
// instance; fuse→HTTP→self deadlocks the threadpool (real incident).
mounts.selfTokenCheck = (raw) => mountTokens.has(raw);

app.get('/api/mounts', async (req, res) => {
  const cfg = mounts.getMyStorageConfig(); // redacted (no secret)
  res.json({
    mounts: mounts.list(),
    shares: mounts.listShares(),
    env: cfg ? { endpoint: cfg.endpoint, bucket: cfg.bucket, prefix: cfg.prefix, accessKey: cfg.accessKey, configured: cfg.configured, importedFromEnv: cfg.importedFromEnv } : null,
    mountBase: mounts.mountBase,
    mcAvailable: await mounts.mcAvailable(),
    rcloneAvailable: mounts.rcloneAvailable(),
  });
});
app.post('/api/mounts', (req, res) => {
  try { res.json({ success: true, id: mounts.add(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/import', (req, res) => {
  try {
    const link = req.body?.link;
    // vibespace-mount:v1 = another instance's WebDAV bridge (scoped bearer token)
    const dav = MountTokens.parseLink ? MountTokens.parseLink(link) : null;
    if (dav) {
      const id = mounts.add({
        type: 'vibespace', origin: 'imported',
        name: req.body?.name || dav.name || 'vibespace-mount',
        mode: dav.mode === 'rw' ? 'rw' : 'ro',
        url: dav.url, bearerToken: dav.token,
        customPath: req.body?.customPath || null,
      });
      return res.json({ success: true, id });
    }
    // vibespace-cephmount:v1 = a direct CephFS subtree share (path-scoped cephx
    // key minted cluster-side) → a normal kernel cephfs mount, no proxy.
    const cm = MountManager.parseCephMountLink(link);
    if (cm) {
      const id = mounts.add({
        type: 'cephfs', origin: 'imported',
        name: req.body?.name || cm.name || 'ceph-share',
        mode: cm.mode === 'rw' ? 'rw' : 'ro',
        cephMonHosts: cm.mons, cephFsName: cm.fsName || 'cephfs',
        cephPath: cm.path, cephUser: cm.user, cephSecret: cm.secret,
        customPath: req.body?.customPath || null,
      });
      return res.json({ success: true, id });
    }
    const p = MountManager.parseShareLink(link);
    const id = mounts.add({
      ...p, origin: 'imported',
      name: req.body?.name || p.name || 'imported-share',
      mode: p.mode === 'rw' ? 'rw' : 'ro',
      customPath: req.body?.customPath || null,
    });
    res.json({ success: true, id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Direct CephFS subtree share — mint a path-scoped key (ceph-mint service).
app.post('/api/mounts/:id/ceph-share', async (req, res) => {
  try { res.json(await mounts.mintCephShare(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Mount tokens (WebDAV bridge): mint returns the link ONCE; stored hashed
app.get('/api/mount-tokens', (req, res) => res.json({ tokens: mountTokens.list() }));
app.post('/api/mount-tokens', (req, res) => {
  try {
    const { name, root, mode } = req.body || {};
    const { raw, rec } = mountTokens.mint({ name, root, mode });
    const url = `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, token: raw, davUrl: `${url}/dav`, link: mountTokens.buildLink({ url, raw, rec }), id: rec.id, rec: { id: rec.id, name: rec.name, root: rec.root, mode: rec.mode } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/mount-tokens/:id', (req, res) => {
  try { mountTokens.revoke(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Import an rclone.conf: parse to a preview list, then import selected remotes
app.post('/api/mounts/rclone-conf/parse', (req, res) => {
  try {
    const remotes = MountManager.parseRcloneConf(req.body?.text || '');
    // never echo secret values back — just names/types/param-keys + wraps flag
    res.json({ remotes: remotes.map(r => ({ name: r.name, type: r.type, paramKeys: Object.keys(r.params), wraps: r.wraps })) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/rclone-conf/import', async (req, res) => {
  try {
    const all = MountManager.parseRcloneConf(req.body?.text || '');
    const want = new Set(req.body?.names || []);
    const mode = req.body?.mode === 'ro' ? 'ro' : 'rw';
    const doMount = req.body?.mount !== false;
    const added = [];
    for (const r of all) {
      if (want.size && !want.has(r.name)) continue;
      if (r.wraps) continue; // can't resolve nested remotes
      try {
        const id = mounts.addFromRcloneRemote(r, { mode });
        added.push({ name: r.name, id });
        if (doMount) { try { await mounts.mount(id); } catch {} }
      } catch (e) { /* skip dupes/invalid, continue */ }
    }
    res.json({ success: true, added });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// rclone availability + one-click install (data/bin, pinned verified version)
app.get('/api/mounts/rclone', (req, res) => res.json({ available: mounts.rcloneAvailable(), bin: mounts.rcloneBin() }));
app.post('/api/mounts/rclone/install', async (req, res) => {
  try { res.json({ success: true, ...(await mounts.installRclone()) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// A STORAGE MOUNT'S OAUTH CLIENT AND ITS CONSENT ARE THE OWNER'S (client-from-mount
// verify r5): a self-identifying agent bearer (vsst_ / jbt_) is refused by name on
// the routes that begin / follow / finish / cancel a Drive or Gmail consent, that
// write a minted token, and on the config read that prefills the client secret in
// the clear — the courtesy src/routes/channels.js gives its consent verbs and its
// mount-clients list (the same secret, lent to a channel account, would otherwise
// have been one GET away on this side). With sign-in on the cookie gate answers
// 401 before this; on a sign-in-off instance this is the named refusal.
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
function refuseAgentBearer(req, res) {
  if (!isAgentBearer(req)) return false;
  res.status(403).json({ error: 'a storage mount\'s OAuth client and its sign-in are the owner\'s — an agent token may not read, start or complete one', code: 'agent-forbidden' });
  return true;
}
// Guided Google Drive OAuth (see mounts.js startDriveAuth for the model).
// With mountId: re-authorize an EXISTING Drive mount/credential using its own
// OAuth client creds (invalid_grant recovery).
app.post('/api/mounts/gdrive-auth/start', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try {
    const { mountId, ...opts } = req.body || {};
    res.json(mountId ? await mounts.startDriveAuthForMount(mountId) : await mounts.startDriveAuth(opts));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Write a minted token back into an existing Drive record + bounce its mounts.
// `client` = the OAuth client it was minted under (D2: a client switch lands
// WITH its token — never a new client beside the old token)
app.post('/api/mounts/:id/drive-token', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try { await mounts.applyDriveToken(req.params.id, req.body?.token, req.body?.client); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/mounts/gdrive-auth/status', (req, res) => { if (refuseAgentBearer(req, res)) return; res.json(mounts.driveAuthStatus()); });
app.post('/api/mounts/gdrive-auth/callback', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try { res.json(await mounts.forwardDriveCallback(req.body?.url)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/gdrive-auth/cancel', (req, res) => { if (refuseAgentBearer(req, res)) return; mounts.cancelDriveAuth(); res.json({ success: true }); });
// Shared Drive picker (2.131.0): list the Shared Drives a drive credential can
// see — by existing record id, or transiently by pasted token (add dialog).
app.post('/api/mounts/shared-drives', async (req, res) => {
  try { res.json({ drives: await mounts.listSharedDrives(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Gmail guided OAuth (2.134.0) — mirrors the gdrive-auth UX: start returns the
// consent URL; same-machine completes hands-free via the local listener;
// remote users paste the 127.0.0.1 redirect back to /callback.
app.post('/api/mounts/gmail-auth/start', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try { res.json(await mounts.gmail.startAuth(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/mounts/gmail-auth/status', (req, res) => { if (refuseAgentBearer(req, res)) return; res.json(mounts.gmail.authStatus()); });
app.post('/api/mounts/gmail-auth/callback', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try { res.json(await mounts.gmail.forwardCallback(req.body?.url)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/gmail-auth/cancel', (req, res) => { if (refuseAgentBearer(req, res)) return; mounts.gmail.cancelAuth(); res.json({ success: true }); });
// Labels picker (2.135.0): the account's real labels for the sync filter.
app.post('/api/mounts/gmail-labels', async (req, res) => {
  try { res.json({ labels: await mounts.listGmailLabels(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Instance-preset Google clients for the UI picker: keys+labels ONLY, never secrets.
app.get('/api/mounts/drive-defaults', (req, res) => {
  const presets = require('../mounts').MountManager.drivePresets().map((c) => ({ key: c.key, label: c.label }));
  res.json({ presets, hasDefaultClient: presets.length > 0 });
});

app.post('/api/mounts/:id/share', async (req, res) => {
  try {
    const { folder, mode, name, expiryDays } = req.body || {};
    const out = await mounts.mintShareFromMount(req.params.id, { folder, mode, name, expiryDays });
    res.json({ success: true, ...out });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/mounts/shares/:id', async (req, res) => {
  try { await mounts.revokeShare(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/:id/mount', async (req, res) => {
  try {
    const ok = await mounts.mount(req.params.id);
    res.json({ success: ok, mounts: mounts.list() });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/:id/unmount', async (req, res) => {
  try { res.json({ success: await mounts.unmount(req.params.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Decrypted connection config for the edit dialog (prefill REAL values —
// user directive; cookie-authed, single-user instance model)
app.get('/api/mounts/:id/config', (req, res) => {
  if (refuseAgentBearer(req, res)) return;   // verify r5: the plaintext client secret — the owner's dialog only
  try { res.json(mounts.config(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// D2: a bare client switch beside a held token is refused 409 by name
// (`client-change-needs-reauth`) — the client lands WITH its token through
// drive-token {token, client} or a PATCH that carries `token`
app.patch('/api/mounts/:id', async (req, res) => {
  try { await mounts.update(req.params.id, req.body || {}); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(e.code === 'client-change-needs-reauth' ? 409 : 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}), mounts: mounts.list() }); }
});
// Credentials (2.108.0): mount points under a credential + manual convert
app.post('/api/mounts/:id/children', (req, res) => {
  try { const id = mounts.addChild(req.params.id, req.body || {}); res.json({ success: true, id, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ error: e.message, mounts: mounts.list() }); }
});
app.post('/api/mounts/:id/convert', async (req, res) => {
  try { await mounts.convert(req.params.id, req.body?.to === 'credential' ? 'credential' : 'mount'); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ error: e.message, mounts: mounts.list() }); }
});
app.delete('/api/mounts/:id', async (req, res) => {
  try { await mounts.remove(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
const { readLayouts, writeLayouts, flushLayouts } = persistenceRouter;

// Session discovery functions imported from ./src/session-store.js
// Helper to create SessionMessages with correct context
function createSessionMessages(session, sessionId) {
  // Descriptor-declared readers first (S8: every ACP harness ships
  // store.SessionMessages — the wrapper journal is its whole history);
  // claude/codex keep their historical classes below unchanged.
  const be = session?.backend;
  if (be && be !== 'claude' && be !== 'codex') {
    try {
      const h = require('../harnesses').get(be);
      // S9: a store that builds its own reader (opencode: serve-backed for a
      // STOPPED conversation, the wrapper journal for a LIVE one) gets the
      // liveness FACT — transcript-service's synthetic session shape and a
      // live session object are otherwise indistinguishable to the reader.
      if (typeof h?.store?.createReader === 'function') {
        let live = false;
        for (const s of activeSessions.values()) if (s === session) { live = true; break; }
        return h.store.createReader(session, sessionId, { buffersDir: BUFFERS_DIR, live });
      }
      if (h?.store?.SessionMessages) return new h.store.SessionMessages(session, sessionId, { buffersDir: BUFFERS_DIR });
    } catch (e) { console.error(`[session-messages] ${e.message}`); }
  }
  return session?.backend === 'codex'
    ? new CodexSessionMessages(session, sessionId, { buffersDir: BUFFERS_DIR })
    : new SessionMessages(session, sessionId, { buffersDir: BUFFERS_DIR, permissionModes: PERMISSION_MODES });
}

  // ── OpenCode serve ACCESS + its action routes (S9 remainder, B-eac2) ──
  // Wired next to the plugin that owns the serve's on/off switch. ONE layer
  // per instance: routes and ws cases name a machine with `hostId` and it
  // picks the transport (local facts / the `opencode-serve` agentd op / the
  // shipped ssh script) — hostId is a parameter, never a branch.
  require('./opencode-access').create({ app, hosts, broadcast: (m) => bcastAll(m) });

  // ── AGENT BROWSER P1: the profile registry + lease keeper + its routes ──
  // (design-agent-browser-v2 §3.3–§3.5). ONE keeper per instance, installed
  // as the module singleton so ws-create can ask a conversation's pin lazily;
  // LAZY by construction — nothing runs until a profile is attached, and the
  // boot reconciliation (server.js, after restoreSessions) is what may start
  // its tick. The spawn env it hands a browser is the sanitised base env.
  let browserKeeper = null;
  let browserKeys = null; // B-f7ab: the late browser key (src/server/browser-key.js)
  let browserDialogs = null; // lane browser-stuck: the page-dialog watch (src/server/browser-dialogs.js)
  let browserHandback = null;
  let browserAccess = null;
  let egressProxy = null;
  try {
    const { agentEnv } = require('../ws-handler');
    // P4 (§3.6 / §7.3 / D5 (b)): ONE way to reach a profile browser on any
    // machine — local facts in-process, the `browser-serve` agentd op on a
    // paired device, a CDP port tunnelled over tcpForward. `hostId` is a
    // parameter the layer dispatches on; the keeper never asks "is this remote".
    browserAccess = require('./browser-access').create({ hosts, env: () => agentEnv(), log: console });
    // P4 (§7.2.1): the allowlisting egress proxy — started LAZILY, only when
    // the cloak opt-in is on and a plan is asked for (nothing listens on a
    // fresh instance); the allowlist is re-read per request (liveApply).
    const cloakPlan = () => {
      const B = require('../browser-profiles.js');
      const enabled = serverSetting('browser.cloak.enabled') === true;
      if (enabled && !egressProxy) {
        try { egressProxy = require('./egress-proxy').create({ allowlist: () => serverSetting('browser.cloak.egressAllowlist') || '', log: console }); egressProxy.listen().catch((e) => { console.warn('[browser] egress proxy failed to listen — ' + (e && e.message)); egressProxy = null; }); }
        catch (e) { console.warn('[browser] egress proxy unavailable — ' + (e && e.message)); egressProxy = null; }
      }
      return B.cloakservePlan({ enabled, allowlist: serverSetting('browser.cloak.egressAllowlist') || '', proxyPort: egressProxy ? egressProxy.port() || 0 : 0 });
    };
    // P4 second half (§7.5): THE key consumer — one module declares this
    // track's registry rows' consumer, registers their six Test runners and
    // resolves their keys (`keyFor`, the ONE resolve the keeper asks through
    // before a spawn); the switcher's SOURCE chip reads its masked `sourceOf`
    const browserBackend = require('./browser-backend').create({ integrations: () => integrations, log: console });
    { const ids = browserBackend.registerTests(); if (ids.length) console.log(`[browser] key rows' Test runners registered: ${ids.join(', ')}`); }
    // P6 (§6.2 / §6.5 / D6): the CDP-mediating proxy — LAZY (listens on
    // nothing until the first mediated lease), owned by the keeper (its
    // shutdown ends it); its presence is what makes `sharing:"instance"` a
    // value on this instance. An unbuildable proxy is said once and the
    // instance stays in the pre-P6 world (instance sharing refused by name).
    let cdpMediator = null;
    try { cdpMediator = require('./cdp-mediator').create({ log: console }); } catch (e) { console.warn('[browser] cdp mediator unavailable — instance sharing stays refused: ' + (e && e.message)); }
    browserKeeper = require('./browser-keeper').create({
      dataDir: path.join(rootDir, 'data'), env: () => agentEnv(), broadcast: (m) => bcastAll(m),
      serverSetting, serverNotice, getTelemetry,
      userTodos, // lane H verify r5: the ONE For-you notice (origin browser) when a profile's browser keeps closing (the heal budget)
      access: browserAccess, hostKnown: (h) => browserAccess.hostKnown(h),
      integrations: () => integrations, keys: browserBackend, mediator: cdpMediator,
      liveKeys: () => new Set([...activeSessions.values()].map((s) => s && s._browserKey).filter(Boolean)),
      // identity verify r2 (2026-09-28): the keys carried by live sessions on ANOTHER machine (an ssh host / a paired device —
      // rung H): the keeper refuses their `use` / attach (`remote_session`) and never writes them into "Who can use it"
      remoteKeys: () => new Set([...activeSessions.values()].filter((s) => s && s._browserKey && (s.hostId || s.host || s._browserVariant === 'H')).map((s) => s._browserKey)),
      // §3.2.5 row 3: the Task Group this create lands in (spawned-into first,
      // else the earliest bound group naming a default). Belonging is the
      // store's own LIVE rule (`groupsForSession`), asked with the facts a
      // create has: cwd + the dialog's taskId (+ the session key when known).
      taskGroupDefault: ({ cwd = null, initialGroupId = null, sessionKey = null } = {}) => {
        const tasks = getTasks ? getTasks() : null;
        if (!tasks) return '';
        const groups = tasks.groupsForSession({ sessionKey, cwd, initialGroupId }) || [];
        const first = (initialGroupId && groups.find((g) => g.id === initialGroupId && g.browserProfileId)) || groups.find((g) => g.browserProfileId);
        return first ? first.browserProfileId : '';
      },
      // MULTIVIEW B-325a (design-browser-multiview): what the keeper may ask
      // about a CONVERSATION — the turn of the live session carrying its key (the
      // release clock). (The Task Group's cap is NOT read here — lane P verify
      // finding 5: it is stamped when the conversation starts, below.)
      // lane P verify r2 (F1): a turn is answered only where the session's mode
      // PUBLISHES one (chat) — a terminal-mode session's `turnOf` is 'idle' by
      // construction, which released its browser (and its helpers') 3 min after
      // the last verb MID-WORK; null = unknown = never released (the CLI's own
      // idle timeout still ends a browser nobody uses). Pinned: test-architecture §57.
      // owner ruling A (2): + the conversation's NAME — a `browser_busy` refusal names the conversation that drives a
      // shared browser (the ruling's "told so by name"; the one deliberate exception to B-325a)
      conversationFacts: (bk) => {
        let s = null;
        for (const x of activeSessions.values()) if (x && x._browserKey === bk) { s = x; break; }
        if (!s) return { turn: null, name: null };
        const TF = require('./turn-facts.js');
        return { turn: TF.turnKnown(s) ? TF.turnOf(s) : null, name: String(s.webuiName || s.name || '') || null };
      },
      // MULTIVIEW D4 (lane P verify, finding 5): the Task Group's default per-conversation cap for a CREATE —
      // the same belonging rule and facts as the pin's rung above; ws-create stamps it once per conversation
      taskGroupCap: ({ cwd = null, initialGroupId = null, sessionKey = null } = {}) => {
        const tasks = getTasks ? getTasks() : null;
        if (!tasks) return null;
        const groups = tasks.groupsForSession({ sessionKey, cwd, initialGroupId }) || [];
        const first = (initialGroupId && groups.find((g) => g.id === initialGroupId && Number.isInteger(g.browserCap))) || groups.find((g) => Number.isInteger(g.browserCap));
        return first ? first.browserCap : null;
      },
      // "Who can use it" is a LIST (2026-09-27): the Task Groups the conversation carrying a browser key belongs to NOW —
      // the store's own live rule over the live session; a store read that THROWS is `unreadable`, never "no groups" (the
      // re-judge keeps that lease, the PATCH says undecided). A key NO live session carries is `live: false` — a STOPPED
      // conversation's membership cannot be read through the live rule, and it is not "no groups" either (verify
      // 2026-09-28: read as "no groups", a WIDENING detached a stopped member of the listed Task Group — its tab in the
      // shared browser closed for a change that kept it); the keeper judges it at its next command instead
      taskIdsForKey: (bk) => {
        const tasks = getTasks ? getTasks() : null;
        if (!tasks) return { ids: [], unreadable: false };
        let hit = null, hitId = null;
        for (const [id, x] of activeSessions) if (x && x._browserKey === bk) { hit = x; hitId = id; break; }
        if (!hit) return { ids: [], unreadable: false, live: false };
        try {
          const key = sessionStatusKey ? sessionStatusKey(hit, hitId) : null;
          return { ids: (tasks.groupsForSession({ sessionKey: key, cwd: hit.cwd, initialGroupId: hit._initialGroupId }) || []).map((g) => g.id), unreadable: false };
        } catch (e) { console.warn(`[browser] the Task Group list could not be read for ${bk} — ${e && e.message}`); return { ids: [], unreadable: true }; }
      },
      // one Task Group's facts (null = the store no longer lists it) — the write's unknown_task and the panel's words
      taskInfo: (id) => {
        const tasks = getTasks ? getTasks() : null;
        if (!tasks) return null;
        try { const t = tasks.get(String(id)); return t ? { title: String(t.title || ''), archived: !!t.archived } : null; }
        catch (e) { if (/not found/i.test(String(e && e.message))) return null; throw e; }
      },
    });
    const taskIdsFor = (s, id) => {
      const tasks = getTasks ? getTasks() : null;
      if (!tasks || !s) return [];
      const key = sessionStatusKey ? sessionStatusKey(s, id) : null;
      return (tasks.groupsForSession({ sessionKey: key, cwd: s.cwd, initialGroupId: s._initialGroupId }) || []).map((g) => g.id);
    };
    let browserEnvMemo;
    // the pin route re-points a RUNNING session's indirection through the
    // same module ws-create resolves it with (file-based, so a second
    // instance reads the same objects); B-f7ab's late key composes through it too
    const browserEnvFn = () => {
      if (browserEnvMemo !== undefined) return browserEnvMemo;
      try { browserEnvMemo = require('./browser-env').create({ dataDir: path.join(rootDir, 'data'), serverSetting, serverNotice: null, telemetry: null }); }
      catch (e) { console.warn('[browser] pin re-point unavailable — ' + (e && e.message)); browserEnvMemo = null; }
      return browserEnvMemo;
    };
    // B-f7ab: a live session with no browser key YET gets one on its first browser use — the spawn's mint, env and pin
    // ladder (src/server/browser-key.js); the binding rides THE meta choke point (persistSessionMeta → writeSessionMeta)
    browserKeys = require('./browser-key').create({
      browserEnv: browserEnvFn, keeper: () => browserKeeper, activeSessions,
      integrationEnabled: () => (typeof integrationEnabled === 'function' ? integrationEnabled() : true),
      readMeta: (session) => (typeof readSessionMetaOf === 'function' ? readSessionMetaOf(session) : null),
      persistMeta: (session, patch) => { if (persistSessionMeta && session) persistSessionMeta(session, patch); },
      onLiveFactsChanged: () => { try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] live facts not re-published — ' + (e && e.message)); } },
    });
    const { router: browserRouter, setup: setupBrowserRoutes } = require('../routes/browser');
    // lane browser-stuck (2026-09-28): THE DIALOG WATCH — one Page-enabled CDP socket per live local browser, armed before
    // a verb runs; a page dialog becomes a fact of the agent's verb, the live view and the browser fact (src/server/browser-dialogs.js)
    try {
      // the .197 integration (browse-yourself × browser-stuck): the USER browsing a profile himself is a holder of its browser
      // too — his row (no session: never told, never woken) makes the browser SHARED, so a conversation whose tab the watch
      // cannot attribute is told of no dialog (a dialog on HIS tab is his), and while he drives an alert is held for him
      const holdersOf = (profileId) => { try { const out = (browserKeeper.list().leases || []).filter((l) => l && l.profileId === profileId && l.browserKey).map((l) => ({ browserKey: l.browserKey, sessionId: l.sessionId || null, ephemeral: !!l.ephemeral })); const h = typeof browserKeeper.humanOf === 'function' ? browserKeeper.humanOf(profileId) : null; if (h && h.browserKey) out.push({ browserKey: h.browserKey, sessionId: null, ephemeral: false, human: true, input: h.input === 'user' ? 'user' : 'agent' }); return out; } catch { return []; } };
      browserDialogs = require('./browser-dialogs').create({
        keeper: browserKeeper, holdersOf,
        leaseCountOf: (profileId) => new Set(holdersOf(profileId).map((h) => h.browserKey)).size,
        labelOf: (profileId) => { try { const p = browserKeeper.profile(profileId); return p ? p.label : null; } catch { return null; } },
        // rule 6: a dialog that opened while the conversation ran no browser verb ⇒ ONE free next-turn line (never a wake)
        // verify r1: ONE pending dialog notice per conversation (`replaceKind` — a page answered ten times queued ten and
        // evicted the takeover notice), withdrawn when its dialog closes before the agent's turn
        notice: (sessionId, n) => { const st = getSessionStatus ? getSessionStatus() : null; const s = activeSessions.get(sessionId); if (st && sessionStatusKey && s) st.pushNotice(sessionStatusKey(s, sessionId), n, { replaceKind: true }); },
        withdraw: (sessionId, dialogId) => { const st = getSessionStatus ? getSessionStatus() : null; const s = activeSessions.get(sessionId); if (st && sessionStatusKey && s && typeof st.dropNotices === 'function') st.dropNotices(sessionStatusKey(s, sessionId), (x) => x && x.kind === 'browser-dialog' && x.dialog && x.dialog.id === dialogId); },
      });
      browserKeeper.setStuckSource((bk) => browserDialogs.stuckForKey(bk));
      // the Agent browser panel's row: the digest carries `pageStuck` (kinds only), re-broadcast when a dialog / verdict moves
      // NAMED profiles only: the digest also reaches agents, and another conversation's ephemeral record is never named to them
      browserKeeper.addDigest(() => ({ pageStuck: Object.fromEntries(Object.entries(browserDialogs.pageStuckMap()).filter(([pid]) => { try { return !browserKeeper.isEphemeral(pid); } catch { return false; } })) }));
      let digestTimer = null;
      browserDialogs.onChange((ev) => {
        if (!ev || !['open', 'closed', 'stuck', 'held', 'held-cleared', 'down'].includes(ev.kind) || digestTimer) return;
        digestTimer = setTimeout(() => { digestTimer = null; try { bcastAll({ type: 'browser-profiles-updated', ...browserKeeper.list() }); } catch (e) { console.warn('[browser-dialog] the digest was not re-published — ' + (e && e.message)); } }, 300);
        if (digestTimer.unref) digestTimer.unref();
      });
    } catch (e) { browserDialogs = null; console.warn('[browser-dialog] the dialog watch is unavailable — ' + (e && e.message)); }
    setupBrowserRoutes({
      keeper: browserKeeper, activeSessions,
      dialogs: browserDialogs,
      // lane browser-stuck: the agent's `dialog accept|dismiss` is a page act on the trace like any other (the stream mirror's own shape)
      traceDialogAct: (act) => browserStream?.tapDialogAct?.(act),
      // the agent's `new --adopt <dir>` may register a directory ONLY under these roots (browser-profiles.adoptDirVerdict)
      adoptRoots: { homeDir: os.homedir(), dataDir: path.join(rootDir, 'data') },
      // P4: the providers route's cloakserve plan (or its typed refusal) + the live CDP forwards
      cloakPlan, forwards: () => browserAccess.forwards(),
      // P4 second half (§7.4): a switch PROPOSAL (another session holds a lease, or somebody drives the browser) is ONE
      // "For you" item to the owner — zero billed turns, the inbox is the channel
      propose: (sessionId, session, { text, detail, by = 'agent' } = {}) => {
        if (!userTodos || !sessionStatusKey) return null;
        return userTodos.add(sessionStatusKey(session, sessionId), { origin: 'browser', text, detail, urgency: 'normal', by, sessionName: session && (session.name || session.webuiName) || null }); // origin: the BROWSER routes' switch proposal (this file only wires them)
      },
      tasksForSession: (s, id) => taskIdsFor(s, id),
      // §3.8 layer ②: a USER's pin/attach/detach queues one typed notice that
      // rides the user's own next message (zero billed turns); the queue is
      // session-status's, keyed the way the prompt-context route drains it
      notice: (sessionId, session, n) => {
        const st = getSessionStatus ? getSessionStatus() : null;
        if (!st || !sessionStatusKey) return;
        st.pushNotice(sessionStatusKey(session, sessionId), n);
      },
      // the pin outlives a restart: it rides the session's meta like the effort origin does
      persistPin: (session, profileId, origin) => { if (persistSessionMeta && session) persistSessionMeta(session, { browserProfileId: profileId || undefined, browserPinOrigin: origin || undefined }); },
      // P2 (§3.8 ③): the profile the agent LAST USED rides the meta (a restart keeps the chip honest) and re-publishes the live facts (the chip gates on its own digest)
      persistActive: (session, v) => { if (persistSessionMeta && session) persistSessionMeta(session, { browserProfileActive: v === null || v === undefined ? undefined : String(v) }); },
      // lane H: re-run the ONE meta choke point (its binding hook + belts) when an ephemeral browser starts — a missing conversation → key binding is written by the same rule, never a second one
      ensureBinding: (session) => { if (rebindSessionMeta && session) rebindSessionMeta(session); },
      // MULTIVIEW D4: the conversation's explicit browser cap rides the meta (the properties row + a restart); the keeper keeps the conversation-level fact
      persistCap: (session, v) => { if (persistSessionMeta && session) persistSessionMeta(session, { browserCap: Number.isInteger(v) ? v : undefined }); },
      onLiveFactsChanged: () => { try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] live facts not re-published — ' + (e && e.message)); } },
      browserEnv: browserEnvFn,
      // B-f7ab: THE late key — every route that reads a session's browser key asks it for a session that has none
      ensureBrowserKey: (session, o) => browserKeys.ensureBrowserKey(session, o),
    });
    app.use(browserRouter);
    // lane H (2026-09-25): the session card's + status chip's `browserLive` fact moves when a browser STARTS or
    // STOPS (a managed ephemeral one included) — re-publish the live facts, debounced; never holds a verb (no promise)
    {
      let factsTimer = null;
      const MOVES = new Set(['browser-ready', 'browser-stopped', 'attach', 'detach', 'lease-dropped']);
      browserKeeper.onLease((ev) => {
        if (!ev || !MOVES.has(ev.kind) || factsTimer) return null;
        factsTimer = setTimeout(() => { factsTimer = null; try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] live facts not re-published — ' + (e && e.message)); } }, 300);
        if (factsTimer.unref) factsTimer.unref();
        return null;
      });
    }
    // lane S2 (naive study 2 — three answers to "which browser"): THE browser fact of each live conversation is
    // computed at ONE choke point (keeper.factFor over its registry view) and published as active-sessions'
    // `browserFact`. Any registry change (a start, a failure, a pin, a removal, a label, a lease) may move it — the
    // facts are re-computed (debounced, never on a verb's path) and active-sessions is re-published ONLY when a
    // conversation's fact digest moved (the ONE dirty signal = one computation rule)
    {
      const BFm = require('../browser-fact.js');
      const lastFactDigest = new Map();
      let factTimer = null;
      const republishIfMoved = () => {
        factTimer = null;
        let moved = false;
        for (const [id, s] of activeSessions) {
          if (!s || !s._browserKey) continue;
          let d = '';
          try { d = BFm.factDigest(browserKeeper.factFor(BFm.sessionFactsOf(s))); } catch { d = ''; }
          if (lastFactDigest.get(id) !== d) { lastFactDigest.set(id, d); moved = true; }
        }
        for (const id of [...lastFactDigest.keys()]) if (!activeSessions.has(id)) lastFactDigest.delete(id);
        if (moved) { try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] browser facts not re-published — ' + (e && e.message)); } }
      };
      const kickFacts = () => { if (factTimer) return; factTimer = setTimeout(republishIfMoved, 250); if (factTimer.unref) factTimer.unref(); };
      browserKeeper.onChange(kickFacts);
      browserDialogs?.onChange(kickFacts); // lane browser-stuck: a dialog opening / closing / an unresponsive verdict moves the fact (the chip)
    }
    // P3 (§4.3.1): the handback announcer — hangs on the keeper's input/confirmation
    // seams; an explicit handback is delivered through the gated ladder under
    // 'browser-handback', an idle one files one inbox item and queues the
    // zero-spend notice unless browser.announceIdleHandback says otherwise
    try {
      browserHandback = require('./browser-handback').create({
        keeper: browserKeeper, deliver, serverSetting, userTodos, activeSessions,
        sessionKeyFor: (s, id) => (sessionStatusKey ? sessionStatusKey(s, id) : null),
        notice: (sessionId, session, n) => { const st = getSessionStatus ? getSessionStatus() : null; if (st && sessionStatusKey) st.pushNotice(sessionStatusKey(session, sessionId), n); },
        // the owner's ruling (2026-09-27): the takeover's card is shown in the live session's chat — display only, the auto-resume notice's own path
        emitCard: (session, card) => require('../normalizers').feedPeerCard(session, card),
        onLiveFactsChanged: () => { try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] live facts not re-published — ' + (e && e.message)); } },
        // lane J r2: pending approvals for a browser page command go STALE at the takeover / handback (answered browser_paused through THE one permission answer)
        approvals: (() => {
          const N = require('../normalizers');
          // lane S1 verify r3: the sweep's deny is a LOOKUP into the ask's transition table like every other
          // answer (helper-asks.answerFrame → answerVerdict → THE one permission answer); r4: `pendingHelpers`
          // = the helpers' asks too (judged by the browser THEIR commands land on — browser-handback)
          const HA = require('./helper-asks');
          return {
            pending: (session) => N.pendingPermissions(session),
            pendingHelpers: (session) => N.pendingHelperApprovals(session),
            answer: (sessionId, _session, data) => HA.answerFrame({ ...data, sessionId }, { activeSessions, adapterRegistry, feedLive: N.feedLive }, { serverDeny: true }),
            note: (session, requestId, staleBy) => N.notePermissionStale(session, requestId, staleBy),
          };
        })(),
      });
      browserHandback.install();
    } catch (e) { console.warn('[browser] handback announcer unavailable — ' + (e && e.message)); }
  } catch (e) { console.warn('[browser] profile keeper unavailable — ' + (e && e.message)); }
  /** §3.5's boot path — server.js calls it right AFTER restoreSessions() so
   *  the live-key set is final: every persisted lease nobody carries is
   *  dropped, THEN every recorded browser is judged (adopted by pid+starttime
   *  or recorded ended), THEN the tick may start. Async and off the boot
   *  path: a failure is logged, never thrown into the boot. */
  function bootBrowserKeeper(after = null) {
    if (!browserKeeper) return;
    try {
      browserKeeper.boot()
        .then((r) => { if (r && (r.droppedLeases || r.browsers)) console.log(`[browser] boot: ${r.droppedLeases} orphaned lease(s) dropped, ${r.browsers} browser(s) adopted`); })
        .catch((e) => console.warn('[browser] boot reconciliation failed:', e && e.message))
        // owner ruling A: a live session pinned BEFORE the ruling still has its indirection naming the profile's directory —
        // put back on its own browser (the pin stays: it is the default attachment now, opened through the keeper)
        .then(() => { try { const n = require('../routes/browser').convertPinnedDirs(); if (n) console.log(`[browser] boot: ${n} session(s) pinned before owner ruling A no longer hand their own browser the profile's directory`); } catch (e) { console.warn('[browser] pin conversion failed:', e && e.message); } })
        .then(() => { try { const n = require('../routes/browser').healDanglingPins(); if (n) console.log(`[browser] boot: ${n} conversation pin(s) named a deleted profile — cleared`); } catch (e) { console.warn('[browser] dangling-pin heal failed:', e && e.message); } }) // lane S2: no conversation keeps a pin on a profile that is gone
        .then(() => { try { after?.(); } catch (e) { console.warn('[browser] post-boot step failed:', e && e.message); } }); // P5: the recorder taps only browsers the keeper has judged
    } catch (e) { console.warn('[browser] boot reconciliation failed:', e && e.message); }
  }

  /** P2 (§4.2): the live view's cookie-authed ws bridge — ONE upstream stream
   *  connection per (session, target) fanned out to N viewers, the VNC
   *  bridge's backpressure numbers, the keeper's `streamPortFor` for the port.
   *  server.js dispatches `/api/browser/stream` upgrades here. */
  let browserStream = null;
  try {
    browserStream = require('./browser-stream').create({ keeper: browserKeeper, activeSessions, requestAuthed: (req) => auth.requestAuthed(req), getTelemetry, dialogs: browserDialogs });
    // lane browser-stuck: a conversation's dialog is on the tab its live view's relay shows as active (the stream's own `tabs` record)
    if (browserDialogs && browserStream && typeof browserStream.activeTargetsFor === 'function') browserDialogs.setTabsOf((q) => browserStream.activeTargetsFor(q));
  } catch (e) { console.warn('[browser-live] stream bridge unavailable — ' + (e && e.message)); }

  /** P5 (§4.5 / D7 / D35): the action-trace recorder, the per-profile
   *  screencast and the housekeeping — hangs on the keeper's lease seam
   *  (`onLease`) and the bridge's taps; its routes are thin over it; it BOOTS
   *  inside bootBrowserKeeper AFTER the keeper reconciled its leases (a tap
   *  never starts a browser, so the order matters). Absent keeper ⇒ absent. */
  let browserTrace = null;
  try {
    if (browserKeeper) {
      // 2026-09-27 BROWSER SESSIONS: a marker the recorder writes becomes a VibeSpace card in the live conversation that
      // owns that browser (its own key — a helper's browser has no card in the parent's chat); a rebuild / a view-only
      // history reads the markers again through the normalizers' card source (bindings: a stopped conversation's key)
      const N = require('../normalizers');
      const cardOfMarker = (m) => (m.phase === 'start'
        ? { id: `bs:${m.id}:start`, phase: 'start', at: m.at, session: m.id, browserKey: m.browserKey, profileId: m.profileId || null, label: m.label || null }
        : { id: `bs:${m.id}:end`, phase: 'end', at: m.at, session: m.id, browserKey: m.browserKey, profileId: m.profileId || null, label: m.label || null, durationMs: m.durationMs, count: m.count, reason: m.reason, framesRemoved: false });
      const onSession = (m) => { for (const [, s] of activeSessions) { if (s && s._browserKey === m.browserKey) { try { N.feedBrowserCard(s, cardOfMarker(m)); } catch (e) { console.warn('[browser-trace] session card not shown — ' + (e && e.message)); } } } };
      browserTrace = require('./browser-trace').create({ dataDir: path.join(rootDir, 'data'), keeper: browserKeeper, bridge: browserStream, serverSetting, broadcast: (m) => bcastAll(m), onSession });
      browserTrace.install();
      const { router: traceRouter, setup: setupTraceRoutes } = require('../routes/browser-trace');
      // the bindings READER: a stopped conversation's trace is found through the key its CLI id was bound to (P0 r5/r7's store, read off the file per ask — a human's click)
      let bindings = null; try { bindings = require('./browser-bindings').create({ dataDir: path.join(rootDir, 'data') }); } catch (e) { console.warn('[browser-trace] bindings reader unavailable — ' + (e && e.message)); }
      N.setBrowserCardSource(({ session = null, conversationId = null } = {}) => {
        let key = session && /^bk-[0-9a-f]{8}$/.test(String(session._browserKey || '')) ? session._browserKey : null;
        const cid = conversationId || (session && (session.claudeSessionId || session.backendSessionId)) || null;
        if (!key && cid && bindings && typeof bindings.lookup === 'function') { try { key = bindings.lookup(cid) || null; } catch { key = null; } }
        return key ? browserTrace.chatCardsFor(key) : [];
      });
      // owner ruling A (6): the row's Delete… = release every lease + stop, clear every pin (lane S2's `unpinProfile` —
      // ONE implementation, in routes/browser.js beside the pin route), then set aside. Lane S2 (naive study 2, T7): "Set
      // aside" of a PINNED profile is refused `pinned` unless the user unpins (`pinGuard`)
      setupTraceRoutes({ keeper: browserKeeper, trace: browserTrace, activeSessions, bindings,
        releaseProfile: (id) => require('../routes/browser').releaseProfile(id), unpinProfile: (id) => require('../routes/browser').unpinProfile(id),
        // "Who can use it": a picked live session → its conversation's browser key (routes/browser.js's ONE resolver)
        keyForPickedSession: (webuiId) => require('../routes/browser').keyForPickedSession(webuiId),
        pinGuard: (id, unpin) => require('../routes/browser').pinGuardFor(id, unpin),
        // a narrowing's detached conversation hears it on its next message (§3.8 layer ②, the same queue as the pin's)
        notice: (sessionId, session, n) => { const st = getSessionStatus ? getSessionStatus() : null; if (st && sessionStatusKey) st.pushNotice(sessionStatusKey(session, sessionId), n); } });
      app.use(traceRouter);
    }
  } catch (e) { browserTrace = null; console.warn('[browser-trace] recorder unavailable — ' + (e && e.message)); }
  const bootBrowserTrace = () => {
    if (!browserTrace) return;
    try {
      browserTrace.boot()
        .then((r) => { if (r && (r.armed || (r.sweep && (r.sweep.removed || r.sweep.recordingsRemoved)))) console.log(`[browser-trace] boot: ${r.armed} trace tap(s) armed${r.sweep ? `, sweep removed ${r.sweep.removed} entr${r.sweep.removed === 1 ? 'y' : 'ies'} + ${r.sweep.recordingsRemoved} recording(s)` : ''}`); })
        .catch((e) => console.warn('[browser-trace] boot failed:', e && e.message));
    } catch (e) { console.warn('[browser-trace] boot failed:', e && e.message); }
  };

  return { mounts, plugins, dialBridge, graduateHostToDial, createSessionMessages, pluginLoader, browserKeeper, bootBrowserKeeper: () => { bootBrowserKeeper(bootBrowserTrace); }, browserStream, browserHandback, browserTrace, browserKeys, browserDialogs };
}
module.exports = { create };
