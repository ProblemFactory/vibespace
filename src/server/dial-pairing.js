'use strict';
// DIAL PAIRING PRIMITIVES (decomposition #13): Transport B server side —
// dial-token minting, dialed-in device registry, deviceForDial (never reuses a
// stop()ed DeviceManager — 2.169.0 invariant), host agentd provisioning,
// daemonPtyShim and the unpair teardown. Extracted VERBATIM. ORCH tier.
const fs = require('fs');
const path = require('path');

const { mk } = require('./lazy.js');
const { ptyListeners } = require('../pty-duck'); // the node-pty duck's listener SET (B-ae4b)

const DF = require('../dial-facts.js');
const PT = require('../pairing-token.js'); // verify-r3: THE ONE DOOR of a pairing token (mint, hash, compare)

function create({ rootDir, AGENTD_DIR, agentdHostToken, getHosts, getMounts,
  getMachineMounts, getPortForwards, getExitProxy, bcastAll = () => { } }) {
  const hosts = mk(getHosts);
  const mounts = mk(getMounts);
  const machineMounts = mk(getMachineMounts);
  const portForwards = mk(getPortForwards);
  const exitProxy = mk(getExitProxy);
  const _agentdInstalled = new Map(); // hostId → version
// ── Transport B (dial-out) server side: devices behind NAT dial US. Pairing
// mints {deviceId, dialToken}; the daemon presents the dial token at the ws
// upgrade (gates the endpoint), then the normal hello/vsht_ auth runs INSIDE
// the mux like every transport. Incoming dials land in a registry the
// device's transport waits on. ──
const agentdDials = new Map();      // deviceId → ws stream adapter (live dial)
const dialBootOf = new Map();       // deviceId → the boot id of the daemon behind the CURRENT stream (null: an older daemon)
const DUP_PROBE_MS = 1500;          // verify-r1 B9: how long the current stream gets to answer before a newcomer replaces it
// B-f3e8: the pairing credential lives ON the dial host record (hosts.json
// dialTokenHash) — dial-tokens.json is migrated once at boot (below, after
// HostManager construction) and there is no separate device registry anymore.
// THE ONLY MINTER (lane-pairing ②): called by exactly two user buttons — the pairing dialog's "Create pairing" /
// "Generate a new command" (POST /api/device/dial-pair) and the ssh machine's "Upgrade to dial-out" — never by
// opening a dialog (test-architecture's mint census). Every mint stamps the dial facts: `tokenMintedAt`,
// `generation`++, the minted URL's host, and the last refusal CLEARED (a refusal of the retired token is not news).
// verify-r2 B8-r2: A ROTATION RETIRES THE HOLDER'S LINK NOW. r1 refused the holder only "at its next dial" and kept
// its link — but the link is what a retired command is FOR: the holder (an impostor, or the lost laptop) stayed
// fully authorized until it happened to drop, and worse, B9 then refused the OWNER's own device running the NEW
// command as a duplicate while the holder answered (reproduced with two real daemons: 4 refusals in 9 s, the row
// naming the owner's device the intruder). The only exception is `keepLink` — the route's in-place push, which
// needs the link to hand the new dial.json over; a push that does not land cuts it too (lockOutDialHolder).
function agentdMintDialPair(deviceId, { host = '', base = '', keepLink = false } = {}) {
  ensureDir(AGENTD_DIR);
  const tok = PT.mintToken('dial');
  hosts.setDialToken(deviceId, PT.tokenHash(tok));
  try { hosts.noteDial(deviceId, 'minted', { host, base }); } catch (e) { console.warn('[device] dial facts not stamped at mint:', e.message); }
  const generation = (() => { try { return Number(hosts.findByDeviceId(deviceId)?.dial?.generation) || 1; } catch { return 1; } })();
  const lockedOut = keepLink === true ? false : lockOutDialHolder(deviceId);
  // the device token (vsht_) for in-mux auth ships in the install payload
  return { deviceId, dialToken: tok, hostToken: agentdHostToken('dial-' + deviceId), generation, lockedOut };
}
/** The device dialed in RIGHT NOW holds a command that is no longer the pairing (verify-r2 B8-r2): its link is ended,
 *  its cached DeviceManager stopped, the disconnect noted — its next dial meets the token gate. → whether a link was
 *  there to end. Never throws. */
function lockOutDialHolder(deviceId) {
  const live = agentdDials.get(deviceId);
  if (!live) return false;
  agentdDials.delete(deviceId);
  dialBootOf.delete(deviceId);
  const dm = agentdDialDevices.get(deviceId);
  if (dm) { try { dm.stop?.(); } catch { } agentdDialDevices.delete(deviceId); }
  try { live.destroy(); } catch { }
  console.log(`[device] '${deviceId}': the pairing was replaced — the device dialed in on the previous command is disconnected (its next dial is refused unless it runs the new command)`);
  noteDialEvent(deviceId, 'disconnected', { at: Date.now() });
  return true;
}

// ── THE DIAL GATE (lane-pairing ③④⑤): the upgrade branch's token check, its NAMED refusal, the --dial-check
// probe's answer, and the facts the server keeps per device. ──
const SERVER_VERSION = (() => { try { return require('../../package.json').version; } catch { return ''; } })();
const _dialBcastAt = new Map(); // deviceId → last hosts-updated this module sent for a dial fact
const refusals = DF.refusalBudget(); // verify-r2: the dial refusals' JOURNAL budget (the wire answer and the row's record never depend on it)
/** One refusal's journal line, under the budget: logged while the key (address + the paired name, if any) and the
 *  window are under it; ONE summary line where either crosses; nothing after. */
function logRefusal(facts, deviceKey, line) {
  const b = refusals.hit(facts && facts.from, deviceKey, Date.now());
  if (b.log) { console.log(line); return; }
  const B = DF.REFUSAL_BUDGET, mins = B.windowMs / 60000;
  if (b.summary === 'key') console.log(`[device] dial refusals from ${(facts && facts.from) || '?'}${deviceKey ? ` for '${deviceKey}'` : ''} exceed ${B.max} in ${mins} min — the rest of this window is answered and not logged (a paired device's row still records its last refusal; a correct token is admitted whatever the count)`);
  else if (b.summary === 'global') console.log(`[device] dial refusals exceed ${B.globalMax} in ${mins} min across all addresses — the rest of this window is answered and not logged (a paired device's row still records its last refusal; a correct token is admitted whatever the count)`);
}
/** Record a dial fact (hosts.noteDial) and tell the clients — at once when the row's state moved, else at most
 *  once per device per 60 s (a refused daemon retries every 30 s). A probe never broadcasts (it registers nothing). */
function noteDialEvent(deviceId, event, facts = {}) {
  let r = null;
  try { r = hosts.noteDial(deviceId, event, facts); } catch (e) { console.warn('[device] dial fact not recorded:', e.message); }
  if (event === 'accepted') dialBootOf.set(deviceId, facts && facts.boot ? String(facts.boot) : null);
  if (!r || event === 'probed') return r;
  const now = Date.now();
  if (r.changed || now - (_dialBcastAt.get(deviceId) || 0) >= 60000) { _dialBcastAt.set(deviceId, now); try { bcastAll({ type: 'hosts-updated' }); } catch { } }
  return r;
}
/** The refusal FRAME: 401 + `X-VibeSpace-Dial-Refusal: <code>` + a JSON body with the sentence (§4.4). `end()`,
 *  never a bare destroy — the bytes must reach the device before the socket closes. */
function refuseDial(socket, code, deviceId) {
  const body = JSON.stringify({ code, error: DF.refusalSentence(code, deviceId), deviceId: String(deviceId || '').slice(0, 64), serverVersion: SERVER_VERSION });
  try {
    socket.end(`HTTP/1.1 401 Unauthorized\r\nX-VibeSpace-Dial-Refusal: ${code}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  } catch { }
  setTimeout(() => { try { socket.destroy(); } catch { } }, 2000).unref?.();
}
/** The --dial-check probe's answer (§4.4): 200 + `X-VibeSpace-Dial-Probe: ok` — the device is NOT registered. */
function answerProbe(socket, deviceId) {
  const body = JSON.stringify({ ok: true, deviceId: String(deviceId || '').slice(0, 64), serverVersion: SERVER_VERSION });
  try { socket.end(`HTTP/1.1 200 OK\r\nX-VibeSpace-Dial-Probe: ok\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`); } catch { }
  setTimeout(() => { try { socket.destroy(); } catch { } }, 2000).unref?.();
}
/**
 * THE GATE of `/api/device-dial` (+ its permanent alias): the per-device dial token (never cookie auth — daemons
 * have no cookies; the real protocol auth, the vsht_ hello, happens inside the mux). → `{deviceId, facts}` for an
 * accepted dial, or null after it answered the socket itself (a named refusal, or a probe's 200).
 */
function gateDialUpgrade(req, socket) {
  // A SOCKET THE DIAL BRANCH HOLDS HAS AN ERROR LISTENER (verify-r3 B-rst): node's http server removes its own at
  // 'upgrade', and every road through this gate holds the socket a while — a refusal and a probe answer with end()
  // and destroy it 2 s later, admitDial parks it ≤ DUP_PROBE_MS while the current link is asked — so a client that
  // RESETS inside that window (anyone who reaches the port: the endpoint needs no cookie) raised an unhandled
  // ECONNRESET ⇒ server.js's uncaughtException ⇒ process.exit(1), the whole hub (reproduced 3 / 3:
  // scratch/r3-repro-rst.mjs). Attached FIRST, before any road; ws adds its own at the accept, this one only destroys.
  socket.on('error', () => { try { socket.destroy(); } catch { } });
  const q = new URL(req.url, 'http://x').searchParams;
  const deviceId = String(q.get('device') || '').slice(0, 64);
  const tok = String(req.headers['x-vibespace-dial-token'] || '');
  const want = hosts.dialTokenHash(deviceId); // pairing credential lives on the host record (B-f3e8)
  const hints = DF.parseDialHeaders(req.headers); // UNTRUSTED: closed codes, ≤ 80 bytes
  // `host` = the Host header AS IT REACHED THIS SERVER (the last proxy's fact — a relay rewrites it; kept for the journal
  // only); `dialed` = the address the DEVICE states it dials (verify-r4 F1: the receiver's fact the pairing sheet reads)
  const facts = { at: Date.now(), from: (req.socket && req.socket.remoteAddress) || '', attempt: hints.attempt, last: hints.last, daemon: hints.daemon, boot: hints.boot, dialed: hints.dialed, platform: hints.platform, host: String(req.headers.host || '').slice(0, 120) };
  // verify-r3: THE ONE DOOR — a constant-time compare over the two digests (never `!==`)
  if (!deviceId || !want || !PT.tokenMatches(tok, want)) {
    const why = !deviceId ? 'no-device-id' : !want ? 'no-pairing' : 'token-mismatch';
    // verify-r2 (the dial endpoint): a stranger hears ONE answer for an unknown name and a wrong token — `no-pairing`
    // on the wire told anyone reaching the port which device names are paired here; the journal keeps the true reason.
    // The answer leaves FIRST: nothing done for a known name (the row's record, the log line) runs before the bytes do.
    const code = why === 'no-pairing' ? 'token-mismatch' : why;
    refuseDial(socket, code, deviceId);
    // the row records a paired device's refusal whatever the count (bounded per device: in memory, throttled to disk)
    if (why === 'token-mismatch') noteDialEvent(deviceId, 'refused', { ...facts, code });
    // observability: a silently deny()'d redial is indistinguishable from "no attempts" in the logs (bit us
    // diagnosing the dead-Mac incident) — now under a LOG budget (DF.refusalBudget): per address (+ the paired name),
    // and per window whatever the addresses
    // the name is the stranger's own bytes: a control character (%0A) would forge a journal line of its own
    const shownId = String(deviceId || '?').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, '?');
    logRefusal(facts, why === 'token-mismatch' ? deviceId : '', `[device] dial REJECTED for '${shownId}' — ${why === 'no-device-id' ? 'no device id' : why === 'no-pairing' ? 'no pairing on record (answered as token-mismatch)' : 'token mismatch'}${hints.probe ? ' (a --dial-check probe)' : ''} (attempt ${hints.attempt}${hints.last ? `, previous failure ${hints.last.code}` : ''}${hints.daemon ? `, daemon ${hints.daemon}` : ''}, from ${facts.from || '?'})`);
    return null;
  }
  if (hints.probe) {
    console.log(`[device] dial-check probe for '${deviceId}' accepted (not registered; from ${facts.from || '?'})`);
    noteDialEvent(deviceId, 'probed', facts);
    answerProbe(socket, deviceId);
    return null;
  }
  return { deviceId, facts };
}
/**
 * THE SECOND GATE (verify-r1 B9), after the token: is a DIFFERENT daemon already dialed in as this device and
 * answering? Two daemons holding one pairing (the same install command run on two machines, a home folder migrated
 * to a new Mac) replaced each other once a second forever — every accept stopped the other's DeviceManager, which
 * closed its stream; 31 accepts in 30 s, the row flipping "connected / 1 attempt failed", nobody told. The verdict is
 * PURE (duplicateDialVerdict); when it says `probe`, the current link gets DUP_PROBE_MS to answer a mux ping — silent
 * ⇒ it is replaced as before (a crashed machine's half-open socket), answering ⇒ the newcomer is refused BY NAME
 * (401 duplicate-device, its daemon logs it and backs off to 30 s) and the row says so for 10 min. → true to admit,
 * null after the socket was answered.
 * verify-r2 B9-r2a: ONLY the same known boot id skips the probe — a newcomer without one (an old bundle, a stripped
 * header) used to replace the live device unasked. And the probe goes THROUGH deviceForDial (bounded): the accept
 * path's own hello may still be in flight, and reading that as "not connected ⇒ dead" let a newcomer arriving inside
 * the hello's round trip evict a healthy device (the same class, one window narrower).
 */
async function admitDial(deviceId, facts, socket) {
  const cur = agentdDials.get(deviceId);
  const incoming = { boot: facts && facts.boot };
  const judge = (alive) => DF.duplicateDialVerdict({ current: cur ? { boot: dialBootOf.get(deviceId) || null, alive } : null, incoming });
  let v = judge(null);
  if (v.action === 'probe') {
    let alive = false;
    try {
      // a connected DeviceManager returns at once; a hello in flight is JOINED (dm.connect() hands back its pending
      // promise); a refused / stopped one throws ⇒ not alive (an auth-failed link is no device to keep)
      const dm = await Promise.race([deviceForDial(deviceId), new Promise((_, rej) => setTimeout(() => rej(new Error('probe: hello still in flight')), DUP_PROBE_MS).unref?.())]);
      if (agentdDials.get(deviceId) === cur && dm && !dm._stopped && dm._dialStream === cur && dm.status().connected) alive = await dm.ping(DUP_PROBE_MS);
    } catch { alive = false; }
    if (agentdDials.get(deviceId) !== cur) return socket.destroyed ? null : true; // the world moved while we asked: nothing to duplicate
    if (socket.destroyed) return null;
    v = judge(alive);
  }
  if (v.action !== 'refuse') return true;
  refuseDial(socket, 'duplicate-device', deviceId);
  noteDialEvent(deviceId, 'duplicate', facts);
  logRefusal(facts, deviceId, `[device] dial REFUSED for '${deviceId}' — duplicate device: another daemon (boot ${dialBootOf.get(deviceId)}) is dialed in and answering; this one (boot ${incoming.boot}${facts.daemon ? `, daemon ${facts.daemon}` : ''}, from ${facts.from || '?'}) holds a copy of the pairing`);
  return null;
}
/** Full unpair of a dial machine (DELETE /api/hosts/:id on a dial record):
 *  mounts torn down, vsht_ token file gone, live stream destroyed. The token
 *  hash dies with the host record itself. */
async function unpairDialDevice(deviceId) {
  try { await machineMounts.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }
  try { portForwards.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }
  try { exitProxy.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }
  try { fs.unlinkSync(path.join(AGENTD_DIR, `host-dial-${deviceId}.token`)); } catch { }
  const live = agentdDials.get(deviceId);
  if (live) { try { live.destroy(); } catch { } agentdDials.delete(deviceId); }
  agentdDialDevices.delete(deviceId);
}
// A DeviceManager over a DIALED-IN device (Transport B consumption): the
// device's daemon holds the mux-server end; we drive it (fs/serve-folder/
// tcp-forward) as the client over the live ws stream in agentdDials. Reused
// per device; reconnects follow the device's --dial retries (getStream picks
// up the fresh stream). Enables 'device' mounts + remote fs for NAT'd devices.
const agentdDialDevices = new Map(); // deviceId → DeviceManager
// THE REFUSED STREAM (verify-r1 C2): a dialed device that refused OUR host key stays dialed in (client.js keeps the
// link on auth-fail — closing it re-dialed every second forever); ops against THAT stream are refused here without
// another hello for AUTH_FAIL_REHELLO_MS, then asked once more (the daemon re-reads its token file at every hello, so
// a token fixed in place heals without a re-dial). A fresh stream is always asked.
const AUTH_FAIL_REHELLO_MS = 60 * 1000;
const authFailedStreams = new Map(); // deviceId → { stream, at }
const authFailedError = (deviceId) => Object.assign(new Error(`agentd auth failed — token mismatch: "${deviceId}" is dialed in but holds another command's host token; generate a new command in the pairing dialog and run it there`), { code: 'auth_failed' });
// THE UPGRADE LEDGER PER DEVICE (verify-r1 C1, 2026-09-28): the 2.330.0 loop breaker (3 upgrade attempts, then keep
// the link) counted on the DeviceManager instance — and every fresh dial stream REBUILDS that instance (the
// stale-stream guard below), so a device whose upgrade never moved its reported version re-dialed after each
// re-exec into a fresh counter: measured 180 upgrades in 45 s once the handshake ran on every dial-in. The count
// lives HERE, keyed by the bundle version it was made against (a rebuilt bundle starts over), and a given-up device
// gets another 3 tries only after UPGRADE_RETRY_AFTER_MS (an operator may have fixed the install meanwhile).
const UPGRADE_RETRY_AFTER_MS = 10 * 60 * 1000;
const upgradeLedgers = new Map(); // deviceId → { expected, tries, gaveUp, at }
function upgradeLedgerFor(deviceId, now = () => Date.now()) {
  return {
    get: (expected) => {
      const r = upgradeLedgers.get(deviceId);
      if (!r || r.expected !== expected) return null;
      if (r.gaveUp && now() - r.at >= UPGRADE_RETRY_AFTER_MS) { upgradeLedgers.delete(deviceId); return null; }
      return { tries: r.tries, gaveUp: r.gaveUp };
    },
    set: (expected, { tries, gaveUp }) => { upgradeLedgers.set(deviceId, { expected, tries: Number(tries) || 0, gaveUp: !!gaveUp, at: now() }); },
  };
}
async function deviceForDial(deviceId, _retried = false) {
  // FAIL FAST when the device isn't dialed in: the stream transport's connect
  // loop otherwise backs off and retries FOREVER, so every operation against
  // an offline device (session create, mount, test) HUNG instead of erroring
  // (real report: create卡住/terminal空白/mount打不开 — Mac daemon died after
  // a self-upgrade re-exec and nothing surfaced it).
  const curStream = agentdDials.get(deviceId);
  if (!curStream) throw new Error(`device "${deviceId}" is offline — its daemon is not dialed in (rerun the install command on it)`);
  const af = authFailedStreams.get(deviceId);
  if (af && af.stream === curStream && Date.now() - af.at < AUTH_FAIL_REHELLO_MS) throw authFailedError(deviceId);
  let dm = agentdDialDevices.get(deviceId);
  // STALE-STREAM GUARD (real report: online=true but every fs op/session
  // blank): the device re-dialed after a self-upgrade re-exec, so agentdDials
  // holds a FRESH stream — but the cached DeviceManager's mux is still bound
  // to the DEAD old stream, and its status().connected can lag true. Rebuild
  // whenever the live stream differs from the one this dm connected over.
  // A STOPPED dm must be treated exactly like a stale stream: stop() is
  // terminal (_connectLoop throws 'stopped' forever), so reusing one wedges
  // EVERY op against an otherwise-healthy device until the stream changes
  // (real userW outage: hours of "offline"/'stopped' while the Mac was
  // dialed-in and fine — a re-dial/unpair race stopped the cached dm).
  if (dm && (dm._stopped || (dm._dialStream && dm._dialStream !== curStream))) {
    try { dm.stop?.(); } catch { }
    dm = null;
    agentdDialDevices.delete(deviceId);
  }
  if (dm && dm.status().connected) return dm;
  if (!dm) {
    const { DeviceManager } = require('../agentd/client.js');
    dm = new DeviceManager({
      dataDir: path.join(rootDir, 'data'),
      bundlePath: path.join(rootDir, 'data', 'bin', 'vibespace-agentd.js'),
      version: require('../../package.json').version,
      transport: { kind: 'stream', hostToken: agentdHostToken('dial-' + deviceId), getStream: () => agentdDials.get(deviceId) || null },
      // lane device-upgrade-stuck: the line NAMES the device — two devices' upgrade lines read as one machine's "two versions"
      log: (...a) => console.log('[device-dial]', JSON.stringify(String(deviceId)), ...a),
      upgradeLedger: upgradeLedgerFor(deviceId), // the loop breaker's count outlives this instance (verify-r1 C1)
      // lane device-upgrade-stuck: THE door (hosts.onAgentUpgrade → src/server/device-upgrade-watch.js)
      onUpgradeStuck: (from, to, info) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('stuck', { ...(info || {}), hostKey: h ? h.id : 'host-dial-' + deviceId, machine: (h && h.name) || deviceId, from, to }); },
      onVersionMatch: (v) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('matched', { hostKey: h ? h.id : 'host-dial-' + deviceId, version: v }); },
      // lane win-upgrade-pipe: an upgrade started / the device answered — a device that never dials back reaches the user
      onUpgradeBegin: (from, to) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('begun', { hostKey: h ? h.id : 'host-dial-' + deviceId, machine: (h && h.name) || deviceId, from, to }); },
      onAnswer: (v) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('answered', { hostKey: h ? h.id : 'host-dial-' + deviceId, version: v }); },
    });
    agentdDialDevices.set(deviceId, dm);
  }
  dm._dialStream = curStream; // remember which stream we bind the mux to
  try {
    await dm.connect();
  } catch (e) {
    // never leave a failed dm in the cache — the next op must rebuild clean
    try { dm.stop?.(); } catch { }
    // lane-pairing ③: the DEVICE refused OUR host key (its state/token came from another command) — it is dialed
    // in while every op fails; the row says so (`auth-fail`), never a plain "connected"
    if (/agentd auth failed/.test(String(e && e.message))) { noteDialEvent(deviceId, 'authFail', { at: Date.now() }); authFailedStreams.set(deviceId, { stream: curStream, at: Date.now() }); }
    if (agentdDialDevices.get(deviceId) === dm) agentdDialDevices.delete(deviceId);
    // a dm stopped MID-CONNECT by a concurrent re-dial cleanup surfaces one
    // transient 'stopped' — while the stream is live, rebuild once instead of
    // failing the caller's FIRST op after a re-dial (seen live on the userW
    // verification: test probe errored once, next op self-healed)
    if (!_retried && String(e && e.message) === 'stopped' && agentdDials.get(deviceId)) {
      return deviceForDial(deviceId, true);
    }
    throw e;
  }
  if (authFailedStreams.get(deviceId)?.stream === curStream) authFailedStreams.delete(deviceId);
  return dm;
}
async function ensureAgentdOnHost(hostId) {
  const version = require('../../package.json').version;
  if (_agentdInstalled.get(hostId) === version) return;
  const bundlePath = path.join(rootDir, 'data', 'bin', 'vibespace-agentd.js');
  await hosts.installAgentd(hostId, bundlePath, version, agentdHostToken(hostId));
  _agentdInstalled.set(hostId, version);
}
// The node-pty DUCK over a device session handle. `onData`/`onExit` hold a SET
// of listeners (src/pty-duck.js, shared with the R6 pipe duck and the OpenCode
// serve terminal), not one slot, because that is what node-pty's own onData
// does and setupSessionPty registers TWO of them: the liveness stamp FIRST,
// then the protocol consumer. With one slot the LAST registration wins, so the
// consumer keeps streaming and the STAMP is silently dropped — ptyQuietSince
// then reads "silent" for a bridge that is relaying bytes and the attach probe
// heals a healthy daemon attach (measured: test-pty-duck §2's control). The
// consumer never died; the liveness fact did. `dispose()` removes only its own
// callback.
function daemonPtyShim(handle) {
  const data = ptyListeners(), exits = ptyListeners();
  handle.onData = (buf) => data.emit(buf.toString('utf-8'));
  handle.onExit = (code) => exits.emit({ exitCode: code });
  return {
    _daemon: true,
    get pid() { return handle.pid; },
    onData(cb) { return data.on(cb); },
    onExit(cb) { return exits.on(cb); },
    write(s) { try { handle.write(s); } catch {} },
    resize(cols, rows) { try { handle.resize(cols, rows); } catch {} },
    kill() { try { handle.kill(); } catch {} },
  };
}
const CHAT_WRAPPER = path.join(rootDir, 'data', 'bin', 'chat-wrapper.js');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

  return { CHAT_WRAPPER, agentdDialDevices, agentdDials,
    agentdMintDialPair, daemonPtyShim, deviceForDial, ensureAgentdOnHost,
    unpairDialDevice, gateDialUpgrade, admitDial, noteDialEvent, lockOutDialHolder, upgradeLedgerFor, UPGRADE_RETRY_AFTER_MS, AUTH_FAIL_REHELLO_MS, DUP_PROBE_MS };
}
module.exports = { create };
