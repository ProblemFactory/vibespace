'use strict';
/**
 * THE OPERATOR DOOR of the apps (lane app-persist-layer1; docs/design-app-persistence.zh.md §3.2 "安全更新的归属", owner
 * D5): the fleet's lever over the security updates of what VibeSpace installed — on each pod
 *   runuser -u <user> -- <checkout>/data/bin/vibespace-app refresh --all
 * from an operator's script (kubectl exec), or a Background Work job the user approved. Neither carries a session token,
 * so this door is not an HTTP route: it is a UNIX SOCKET the server opens AFTER LISTEN (apps-wiring afterListen) at
 * ~/.vibespace/apps/operator/ops.sock — the directory 0700 and the socket 0600, both this account's: only this account
 * (and root) can connect. The credential IS the account — no token on disk, nothing on a TCP port.
 *
 * One request per connection: one NDJSON line ≤ 4 KiB within 5 s, `{"v":1,"op":"refresh","apply":false|true}`. The answer
 * is NDJSON: `{log}` lines while a run streams, then ONE `{ok:true, …}` | `{ok:false, code, error}`, then the close.
 *   refresh  apply:false → the plan the person's Refresh shows (its updates as apt's lists are now; the layer it upgrades)
 *            apply:true  → that plan run through THE SAME engine.run as the person's press ({kind:'refresh'} with the
 *                          plan's digest — what runs is the plan just taken), by {kind:'operator'}; a busy package slot
 *                          answers `busy` (the script retries later); the run itself fetches fresh lists first
 * The ops are a closed set (OPS): nothing installs, removes, adds a source or touches the app system's shape through this
 * door — it upgrades only what was already approved, exactly what the person's Refresh does.
 *
 * The same-uid posture, said plainly: any process of this account reaches the door, an agent's included. In a pod that
 * account already holds NOPASSWD sudo, so the door adds no reach; `vibespace-app` refuses the verb inside a conversation as
 * the RULE (an agent is told: the user's Refresh), and every run is journaled ("[apps] operator door: …").
 * A stale socket (a server that crashed) is replaced; a socket another live server answers on is left alone (this door
 * stays off, said once); anything else at the path — a file, a link, a directory — is never touched (off, said once);
 * a HOME so long the path passes the platform's socket bound (src/sock-path.js socketPathFits) keeps it off by name.
 */
const fs = require('fs');
const fsp = fs.promises;
const net = require('net');
const os = require('os');
const path = require('path');
const SP = require('../sock-path.js'); // THE socket-path rule: the platform's sun_path bound (test-sock-path's table row)

const DOOR_DIR_REL = path.join('.vibespace', 'apps', 'operator');
const SOCKET_NAME = 'ops.sock';
const LINE_MAX = 4096;
const LINE_MS = 5000;
const MAX_CONN = 4;
const OPS = Object.freeze(['refresh']);

/** the door's socket for a home (the CLI computes the same path from its own HOME) */
function socketPath(home = os.homedir()) { return path.join(home, DOOR_DIR_REL, SOCKET_NAME); }
const refusal = (code, error) => ({ ok: false, code, error });
/** a request line → `{ok, op, apply}` | a refusal by name (PURE) */
function parseRequest(line) {
  let j;
  try { j = JSON.parse(String(line)); } catch { return refusal('bad-request', 'one JSON line: {"v":1,"op":"refresh","apply":false|true}'); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return refusal('bad-request', 'one JSON object per connection');
  if (j.v !== 1) return refusal('bad-version', 'this door speaks v 1');
  if (!OPS.includes(j.op)) return refusal('bad-op', `the operator door answers ${OPS.join(' / ')} only — installs, removals and sources are the user's (Desktop apps)`);
  if (j.apply !== undefined && typeof j.apply !== 'boolean') return refusal('bad-request', 'apply is true or false');
  return { ok: true, op: j.op, apply: j.apply === true };
}
/** the plan's words for the operator (PURE): its layer, updates, the host apps a Refresh of the app system leaves alone */
function planView(pl) {
  const ups = Array.isArray(pl && pl.updates) ? pl.updates : [];
  return {
    layer: pl && pl.layer === 'sys' ? 'sys' : 'host',
    canRun: !!(pl && pl.canRun),
    updates: ups.slice(0, 200).map((u) => ({ package: String(u.package || ''), from: u.from == null ? null : String(u.from), to: u.to == null ? null : String(u.to) })),
    count: ups.length,
    skippedHost: Array.isArray(pl && pl.skippedHost) ? pl.skippedHost.map((e) => String(e.id || '')).filter(Boolean).slice(0, 50) : [],
  };
}

function create({ engine, access = null, home = os.homedir(), host = 'local', log = console, lineMs = LINE_MS } = {}) {
  if (!engine) throw new Error('apps-ops-door: engine required');
  const sock = socketPath(home), dir = path.dirname(sock);
  let server = null, ours = null, state = { open: false, why: 'not-opened' }, opening = null;
  const conns = new Set();
  const said = new Set();
  const once = (key, line) => { if (!said.has(key)) { said.add(key); log.warn?.(line); } };

  /** the directory is OURS (a real dir of this account, 0700) or the door stays off */
  async function prepareDir() {
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const st = await fsp.lstat(dir);
    if (!st.isDirectory() || st.uid !== process.getuid()) return 'door-dir';
    await fsp.chmod(dir, 0o700); // also clears an inherited setgid (the PVC root's fsGroup)
    return null;
  }
  /** what sits at the socket path: nothing / a stale socket (removed) / a LIVE door of another server / not a socket */
  async function clearPath() {
    let st = null;
    try { st = await fsp.lstat(sock); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    if (!st.isSocket()) return 'not-a-socket';
    const live = await new Promise((resolve) => {
      const c = net.connect(sock);
      const t = setTimeout(() => { c.destroy(); resolve(true); }, 1000); // a socket that accepts but never answers is held
      c.once('connect', () => { clearTimeout(t); c.destroy(); resolve(true); });
      c.once('error', () => { clearTimeout(t); resolve(false); });
    });
    if (live) return 'in-use';
    await fsp.unlink(sock);
    return null;
  }
  function open() {
    if (!opening) opening = openNow().catch((e) => { state = { open: false, why: 'error' }; once('err', `[apps] operator door: not opened (${e && e.message})`); return state; });
    return opening;
  }
  async function openNow() {
    const fit = SP.socketPathFits(sock, process.platform); // a HOME this long cannot hold a socket: off by name, never a truncated path
    if (!fit.fits) { state = { open: false, why: 'path-too-long' }; once('path-too-long', `[apps] operator door: off — ${sock} would be ${fit.bytes} bytes, over this platform's ${fit.max}-byte socket path`); return state; }
    const why = (await prepareDir()) || (await clearPath());
    if (why) {
      state = { open: false, why };
      once(why, `[apps] operator door: off — ${why === 'in-use' ? `another VibeSpace answers on ${sock}` : why === 'door-dir' ? `${dir} is not this account's directory` : `${sock} is not a socket (left alone)`}`);
      return state;
    }
    server = net.createServer(onConn);
    server.maxConnections = MAX_CONN;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(sock, () => { server.off('error', reject); resolve(); }); });
    await fsp.chmod(sock, 0o600);
    const st = await fsp.lstat(sock);
    ours = { dev: st.dev, ino: st.ino };
    state = { open: true, why: null, path: sock };
    log.log?.(`[apps] operator door: ${sock} (refresh)`);
    return state;
  }
  function onConn(c) {
    conns.add(c);
    c.on('close', () => conns.delete(c));
    c.on('error', () => { });
    c.setEncoding('utf8');
    let buf = '', taken = false;
    const write = (o) => { if (!c.destroyed) { try { c.write(JSON.stringify(o) + '\n'); } catch { /* gone */ } } };
    const finish = (o) => { write(o); c.end(); };
    const t = setTimeout(() => { if (!taken) { taken = true; finish(refusal('timeout', `no request line within ${lineMs / 1000} s`)); } }, lineMs);
    c.on('data', (d) => {
      if (taken) return;
      buf += d;
      const i = buf.indexOf('\n');
      if (i < 0 && buf.length <= LINE_MAX) return;
      taken = true; clearTimeout(t);
      if (i < 0 || i > LINE_MAX) return finish(refusal('too-long', `one request line of at most ${LINE_MAX} bytes`));
      const rq = parseRequest(buf.slice(0, i));
      if (!rq.ok) return finish(rq);
      refresh(rq.apply, write).then(finish, (e) => finish(refusal((e && e.code) || 'refresh_failed', String((e && e.message) || e).slice(0, 500))));
    });
  }
  async function refresh(apply, write) {
    const p = await engine.plan(host, { kind: 'refresh' });
    const pl = (p && p.plan) || {};
    if (!pl.ok) return refusal(pl.code || 'refused', pl.error || 'the machine refused the Refresh plan');
    const view = planView(pl);
    if (!apply) return { ok: true, plan: view };
    if (!view.canRun) return refusal('no_sudo', 'this machine has no passwordless sudo — nothing can be upgraded unattended');
    const busy = access && typeof access.installBusy === 'function' ? access.installBusy(host) : null;
    if (busy) return { ...refusal('busy', `the package slot is running another install (since ${new Date(busy.since).toISOString()}) — try again later`), since: busy.since };
    log.log?.(`[apps] operator door: refresh — ${view.count} known update(s) in the ${view.layer === 'sys' ? 'app system' : 'image\'s packages'}, through the package slot`);
    let carry = '';
    const onData = (d) => { carry += Buffer.isBuffer(d) ? d.toString('utf8') : String(d); const parts = carry.split(/\r?\n/); carry = parts.pop(); for (const x of parts) write({ log: x.slice(0, 2000) }); if (carry.length > 4000) { write({ log: carry.slice(0, 2000) }); carry = ''; } };
    const out = await engine.run({ host, request: { kind: 'refresh' }, expectDigest: p.digest || null, by: { kind: 'operator' }, onData });
    if (carry) write({ log: carry.slice(0, 2000) });
    const run = out.run || {};
    log.log?.(`[apps] operator door: refresh done — ${run.ok === false ? 'FAILED' : run.partial ? 'partial' : 'ok'}${typeof run.upgraded === 'number' ? `, ${run.upgraded} upgraded` : ''}`);
    return { ok: run.ok !== false, done: true, layer: view.layer, known: view.count, upgraded: typeof run.upgraded === 'number' ? run.upgraded : null, partial: !!run.partial, refreshedAt: (out.state && out.state.refreshedAt) || null, skippedHost: view.skippedHost, ...(run.ok === false ? { code: 'refresh_failed', error: 'the upgrade did not finish — its log is above' } : {}) };
  }
  /** stop listening and remove the socket only if it is still the one this server made */
  async function close() {
    for (const c of conns) c.destroy();
    if (server) await new Promise((r) => server.close(() => r()));
    server = null;
    if (ours) { try { const st = fs.lstatSync(sock); if (st.isSocket() && st.dev === ours.dev && st.ino === ours.ino) fs.unlinkSync(sock); } catch { /* gone */ } ours = null; }
    state = { open: false, why: 'closed' };
  }
  return { open, close, state: () => ({ ...state }), path: sock };
}

module.exports = { create, socketPath, parseRequest, planView, OPS, LINE_MAX, LINE_MS, DOOR_DIR_REL, SOCKET_NAME };
