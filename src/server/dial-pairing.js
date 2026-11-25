'use strict';
// DIAL PAIRING PRIMITIVES (decomposition #13): Transport B server side —
// dial-token minting, dialed-in device registry, deviceForDial (never reuses a
// stop()ed DeviceManager — 2.169.0 invariant), host agentd provisioning,
// daemonPtyShim and the unpair teardown. Extracted VERBATIM. ORCH tier.
const fs = require('fs');
const path = require('path');

const { mk } = require('./lazy.js');
const { ptyListeners } = require('../pty-duck'); // the node-pty duck's listener SET (B-ae4b)
const { utf8Stream } = require('../utf8-stream.js'); // B-b968: a session re-attached through this machine's own agent: its pty OUTPUT decoded as ONE stream

const DF = require('../dial-facts.js');
const PT = require('../pairing-token.js'); // verify-r3: THE ONE DOOR of a pairing token (mint, hash, compare)

function create({ rootDir, AGENTD_DIR, agentdHostToken, hostTokenLocked = () => null, hubIdentity = null, dropHostToken = (id) => { try { fs.unlinkSync(path.join(AGENTD_DIR, `host-${id}.token`)); } catch { } }, getHosts, getMounts,
  getMachineMounts, getPortForwards, getExitProxy, getDialHealth = () => null, bcastAll = () => { } }) {
  const hosts = mk(getHosts);
  const mounts = mk(getMounts);
  const machineMounts = mk(getMachineMounts);
  require('./cwd-wait.js').register({ getHosts, getMachineMounts });   // B-864f: a pulled machine folder that waits is PENDING, never gone
  require('../machine-mounts.js').registerPullDoor(getMachineMounts);   // B-fcc7: the files route asks the pull manager (server.js takes no line)
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
// lane device-act-audit (design q-042 D10): every mint is an URGENT For-you item — WHO minted it (`by`) and from which browser
// address (`from`) — through the hub's onDeviceAlert door (src/server/device-alerts.js; once per mint)
function agentdMintDialPair(deviceId, { host = '', base = '', keepLink = false, by = 'system:dial-pairing', from = '' } = {}) {
  ensureDir(AGENTD_DIR);
  // lane vault-e2e-password-fix-r2: the device token FIRST — a LOCKED vault refuses the pairing by name (`vault_locked`)
  // before a dial token is minted or the pairing rotated (a rotation it could not finish would lock the holder out)
  const hostToken = agentdHostToken('dial-' + deviceId);
  const tok = PT.mintToken('dial');
  hosts.setDialToken(deviceId, PT.tokenHash(tok));
  try { require('../agentd/client.js').DeviceManager.dropHelloFolds('dev:' + deviceId); } catch { }   // a pairing made again starts its hello folds fresh (what the old one owed is said)
  try { hosts.noteDial(deviceId, 'minted', { host, base }); } catch (e) { console.warn('[device] dial facts not stamped at mint:', e.message); }
  const generation = (() => { try { return Number(hosts.findByDeviceId(deviceId)?.dial?.generation) || 1; } catch { return 1; } })();
  try { const h = hosts.findByDeviceId(deviceId); hosts.onDeviceAlert?.('pairing-minted', { hostKey: h ? h.id : 'host-dial-' + deviceId, machine: (h && h.name) || deviceId, deviceId, by, from: String(from || '').slice(0, 120), generation, host: String(host || '').slice(0, 120) }); } catch (e) { console.warn('[device] pairing alert not filed:', e.message); }
  const lockedOut = keepLink === true ? false : lockOutDialHolder(deviceId);
  // the device token (vsht_) for in-mux auth ships in the install payload
  return { deviceId, dialToken: tok, hostToken, generation, lockedOut };
}
/** The device dialed in RIGHT NOW holds a command that is no longer the pairing (verify-r2 B8-r2): its link is ended,
 *  its cached DeviceManager stopped, the disconnect noted — its next dial meets the token gate. → whether a link was
 *  there to end. Never throws. */
function lockOutDialHolder(deviceId) {
  refusedBoots.delete(deviceId); admitted.delete(deviceId); // a new pairing: no copy of the old one is known any more, linked or not
  const live = agentdDials.get(deviceId);
  if (!live) return false;
  agentdDials.delete(deviceId);
  dialBootOf.delete(deviceId);
  { const pb = probation.get(deviceId); probation.delete(deviceId); if (pb) { try { pb.heldBack.destroy(); } catch { } } dropSpares(deviceId); } // unit 4's cure 2: nothing of the old pairing stays open
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
  if (event === 'accepted') { const b = facts && facts.boot ? String(facts.boot) : null; dialBootOf.set(deviceId, b); const s = agentdDials.get(deviceId); if (s) streamBoot.set(s, b); } // unit 4's cure 2: the boot rides its stream (a seat given back gets its own boot back)
  if (event === 'disconnected') { try { machineMounts.onMachineUnlinked(hosts.findByDeviceId(deviceId)?.id); } catch { } } // B-fcc7: its pull mounts unmounted at once (never a zombie FUSE entry)
  if (!r || event === 'probed') return r;
  const now = Date.now();
  if (r.changed || now - (_dialBcastAt.get(deviceId) || 0) >= 60000) { _dialBcastAt.set(deviceId, now); try { bcastAll({ type: 'hosts-updated' }); } catch { } }
  return r;
}
/** the B-f276 remainder: a dial met while hosts.json is held — 503 + Retry-After, the device still paired, nothing recorded */
function holdDial(socket, deviceId) {
  const body = JSON.stringify({ code: 'hosts-unread', error: 'this VibeSpace cannot read its paired machines right now and reads them again within minutes — nothing about this device was changed; it dials again by itself', deviceId: String(deviceId || '').slice(0, 64), serverVersion: SERVER_VERSION });
  try { socket.end(`HTTP/1.1 503 Service Unavailable\r\nRetry-After: 60\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`); } catch { }
  setTimeout(() => { try { socket.destroy(); } catch { } }, 2000).unref?.();
}
/** The refusal FRAME: 401 + `X-VibeSpace-Dial-Refusal: <code>` + a JSON body with the sentence (§4.4). `end()`,
 *  never a bare destroy — the bytes must reach the device before the socket closes. */
function refuseDial(socket, code, deviceId, proof = '', sentence = '') {   // proof: B-4d71's retire proof (hex), only on a `retired` answer; sentence: lane lg-remote-hardening's own words for a refusal (the duplicate's)
  const body = JSON.stringify({ code, error: sentence || DF.refusalSentence(code, deviceId), deviceId: String(deviceId || '').slice(0, 64), serverVersion: SERVER_VERSION });
  try {
    socket.end(`HTTP/1.1 401 Unauthorized\r\nX-VibeSpace-Dial-Refusal: ${code}\r\n${/^[0-9a-f]{64}$/.test(proof) ? `X-VibeSpace-Retire-Proof: ${proof}\r\n` : ''}Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  } catch { }
  setTimeout(() => { try { socket.destroy(); } catch { } }, 2000).unref?.();
}
/** lane mac-repair-retires-stale (B-06e9): THIS hub's id (`vh-` + 16 hex, PURE rule DF.hubIdOf) — minted ONCE into
 *  AGENTD_DIR/hub-id (O_EXCL; a racing twin's file wins), then read from memory. Told to a device only after it proved its
 *  pairing (the probe's 200 below, the hello of an accepted dial — src/agentd/client.js); the device keeps it in its
 *  dial.json so a re-pair retires the older installs of the SAME hub. '' when it cannot be read or written (nothing is
 *  retired then — the safe direction). Never throws. */
let _hubId = null;
function hubId() {
  if (_hubId !== null) return _hubId;
  const f = path.join(AGENTD_DIR, 'hub-id');
  const read = () => { try { return DF.hubIdOf(fs.readFileSync(f, 'utf8')); } catch { return ''; } };
  let id = read();
  if (!id) {
    try { ensureDir(AGENTD_DIR); fs.writeFileSync(f, 'vh-' + require('crypto').randomBytes(8).toString('hex') + '\n', { flag: 'wx', mode: 0o600 }); } catch { /* EEXIST: a twin minted it first */ }
    id = read();
  }
  _hubId = id;
  return id;
}
/** The --dial-check probe's answer (§4.4): 200 + `X-VibeSpace-Dial-Probe: ok` — the device is NOT registered. `hub` = this
 *  hub's id (lane mac-repair-retires-stale): the probe passed the token check, so the device holds this hub's pairing. */
function answerProbe(socket, deviceId) {
  const body = JSON.stringify({ ok: true, deviceId: String(deviceId || '').slice(0, 64), serverVersion: SERVER_VERSION, ...(hubId() ? { hub: hubId() } : {}) });
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
  // the B-f276 remainder (its read r1, S4): while hosts.json is HELD no pairing can be checked — a TRANSIENT answer the device retries
  // (its classifier: http-503, the hub's own words), never the 401 that tells the person to pair again
  if (hosts.unreadWords && hosts.unreadWords()) { holdDial(socket, deviceId); return null; }
  const want = hosts.dialTokenHash(deviceId); // pairing credential lives on the host record (B-f3e8)
  const hints = DF.parseDialHeaders(req.headers); // UNTRUSTED: closed codes, ≤ 80 bytes
  // `host` = the Host header AS IT REACHED THIS SERVER (the last proxy's fact — a relay rewrites it; kept for the journal
  // only); `dialed` = the address the DEVICE states it dials (verify-r4 F1: the receiver's fact the pairing sheet reads)
  const facts = { at: Date.now(), from: (req.socket && req.socket.remoteAddress) || '', attempt: hints.attempt, last: hints.last, daemon: hints.daemon, boot: hints.boot, dialed: hints.dialed, platform: hints.platform, host: String(req.headers.host || '').slice(0, 120) };
  // verify-r3: THE ONE DOOR — a constant-time compare over the two digests (never `!==`)
  // B-4d71: a device UNPAIRED while offline dials with its exact old token — it is told «retired» with the proof that only the
  // hub that held its pairing — or the holder of its install command — can make (src/pairing-token.js: keyed by its HOST token's
  // hash, over the purpose word, its id, this dial token's hash and its own nonce): it removes its own start and ends
  const tomb = deviceId && !(want && PT.tokenMatches(tok, want)) ? hosts.retiredDialFor?.(deviceId, tok, PT.tokenMatches) : null;
  if (tomb) {
    const nonce = String(req.headers['x-vibespace-dial-nonce'] || '').slice(0, 64);
    refuseDial(socket, 'retired', deviceId, nonce && tomb.proofKey ? PT.retireProof(tomb.proofKey, { deviceId, dialTokenHash: tomb.hash, nonce }) : '');
    logRefusal(facts, deviceId, `[device] dial from '${String(deviceId).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, '?')}' — this device was unpaired: told to retire its own start${nonce ? '' : ' (no nonce: an agent older than this answer — it keeps dialing)'}`);
    return null;
  }
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
    // lane host-stale-dialer (B-6136): a refusal WHILE the device is in = a second agent with an old token — its row and
    // For you name it (src/server/dial-health-watch.js); the journal says it once per 10 min, never every 30 s
    const health = why === 'token-mismatch' ? (() => { try { return getDialHealth()?.byDevice(deviceId); } catch { return null; } })() : null;
    if (health && health.v.kind === 'second-dialer-stale-token') {
      if (getDialHealth().shouldLog(health.h.id, health.v)) console.log(`[device] dial REJECTED for '${shownId}' — token mismatch while '${shownId}' is connected: a SECOND agent with an old token (from ${facts.from || '?'}); its row and For you say so — this line repeats once per 10 min while it knocks`);
      return null;
    }
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
  // unit 4's cure 2 — A REFUSED COPY IS NEVER «DEAD», AND IT NEVER HOLDS THE SEAT AGAINST A COPY THAT PASSES: a stream fenced by
  // a refusal (a greeting or key refused, auth-fail) is no reason to turn the newcomer away, nor to close the refused copy.
  // The newcomer is admitted ON PROBATION (adoptDialStream): the refused copy is held back, open, and the newcomer's OWN
  // greeting decides — it passes ⇒ it takes the seat and the held-back copy is closed; it is refused ⇒ the held-back copy
  // takes its seat back and the newcomer stays open beside it as a SPARE. Nothing is closed, so nothing dials again.
  { const pb = probation.get(deviceId); if (pb && Date.now() - pb.at > PROBATION_MAX_MS) settleProbation(deviceId, false); } // a greeting that never decides (a locked vault) ends: the seat goes back
  { const r = admitted.get(deviceId); if (r && Date.now() - r.at > RESERVE_MS) admitted.delete(deviceId); } // an upgrade that never called back
  const cur = agentdDials.get(deviceId);
  const incoming = { boot: facts && facts.boot };
  const judge = (alive) => DF.duplicateDialVerdict({ current: cur ? { boot: dialBootOf.get(deviceId) || null, alive } : null, incoming });
  const fenced = () => { const c = agentdDials.get(deviceId); return !!c && (authFailedStreams.get(deviceId)?.stream === c || refusedStreams.get(deviceId)?.stream === c); };
  // a copy being greeted (its probation, or its admission reserved until its websocket is up): one at a time
  const pending = () => probation.has(deviceId) || admitted.has(deviceId);
  // the seats beside a refused copy are few: the spares full and a probation given inside the interval ⇒ turned away BY NAME
  // (its daemon backs off). No spare is ever closed to make room (a close is a re-dial a second later)
  const held = () => pending() || (liveSpares(deviceId) >= SPARES_MAX && Date.now() - (lastProbationAt.get(deviceId) || 0) < AUTH_FAIL_REHELLO_MS);
  // a copy refused on probation and CLOSED at the cap is KNOWN by its boot: it dials again a second later and is turned away
  // by name without another greeting until a copy passes or the pairing changes — each such copy is closed at most once, and
  // it never takes the next probation from a copy not yet greeted. An agent that states no boot is known by its address and
  // version for one interval only, and told to WAIT (a healthy machine behind the same relay may share them): such a copy is
  // closed at most once per interval, as any copy beyond the cap without a memory
  const refusedBoot = () => { const k = copyKeyOf(facts), at = refusedBoots.get(deviceId)?.get(k); return !!at && Date.now() - at < (k.startsWith('b:') ? REFUSED_BOOT_MS : AUTH_FAIL_REHELLO_MS); }; // a key with no boot (an address and version a healthy machine behind the same relay may share) is known for one interval only
  // over a refused seat, or a copy on probation, these rules decide — never «the same daemon» (a copy closed at the cap
  // dials again with its own boot, and the seat's boot may be the last newcomer's)
  const tokenUnreadable = () => { try { agentdHostToken('dial-' + deviceId); return false; } catch { return true; } }; // a locked vault, or any token that cannot be read: no greeting could decide
  const ruledAtStart = fenced() || pending();
  let v = ruledAtStart ? { action: 'probe', why: 'refused-seat' } : judge(null);
  let given = null, busy = '', copy = true, known = false, unjudged = false; // a probation's dial facts (→ adoptDialStream); why a copy is turned away (→ the journal); whether the row says it as a copy
  if (v.action === 'probe') {
    let alive = false;
    let answered = null;
    if (!ruledAtStart) {
      try {
        // a connected DeviceManager returns at once; a hello in flight is JOINED (dm.connect() hands back its pending
        // promise); a refused one throws — and is judged below as the fenced copy it now is
        const dm = await Promise.race([deviceForDial(deviceId, false, { probe: true }), new Promise((_, rej) => setTimeout(() => rej(new Error('probe: hello still in flight')), DUP_PROBE_MS).unref?.())]);
        if (agentdDials.get(deviceId) === cur && dm && !dm._stopped && dm._dialStream === cur && dm.status().connected) answered = await dm.ping(DUP_PROBE_MS);
      } catch { answered = null; }
    }
    if (agentdDials.get(deviceId) !== cur && !pending() && !fenced()) return socket.destroyed ? null : true; // the world moved while we asked, and no refused copy holds the seat nor is one being greeted: nothing to duplicate
    if (socket.destroyed) return null;
    const ruled = fenced() || pending();
    if (ruled && refusedBoot()) { alive = true; if (copyKeyOf(facts).startsWith('b:')) { known = true; busy = 'this copy was refused here already (it is not greeted again until a copy passes or the pairing changes)'; } else { copy = false; busy = 'a copy at this address and version was refused here a moment ago (one with no boot id is asked again after the interval)'; } } // a copy with a boot: turned away as the copy it is, not greeted again; with none: told to wait, greeted again after the interval
    else if (ruled && held()) { alive = true; copy = false; busy = pending() ? 'another copy is being greeted' : `${SPARES_MAX} refused copies already wait beside it (one more is greeted per interval)`; } // turned away by name, nothing closed
    else if (fenced() && tokenUnreadable()) { alive = true; copy = false; busy = 'its link token cannot be read now (no greeting can be judged until it can)'; } // a token that cannot be read (a locked vault) is a wait: no probation that could never decide
    else if (fenced()) { alive = false; given = facts || {}; } // a refused copy: the newcomer is greeted on probation
    else if (answered !== null) alive = answered; // a healthy copy that answers keeps its seat; one that does not is replaced
    else { alive = Date.now() - (lastReplaceAt.get(deviceId) || 0) < AUTH_FAIL_REHELLO_MS; if (alive) { copy = false; unjudged = true; } } // nothing to judge: at most one replace per interval, and the next one inside it is told to WAIT, never called a copy (unit 4's cure 2 made this rule; before it, a probe that could not judge replaced every time)
    v = ruled ? { action: alive ? 'refuse' : 'replace', why: 'refused-seat' } : judge(alive);
  }
  if (v.action !== 'refuse') {
    if (given) { // the reservation: one copy greeted at a time; it counts as a probation given, and it ends with its socket
      const r = { facts: given, at: Date.now() };
      admitted.set(deviceId, r); lastProbationAt.set(deviceId, r.at);
      try { socket.once?.('close', () => { if (admitted.get(deviceId) === r) admitted.delete(deviceId); }); } catch { }
    }
    return true; // the stream it replaces is closed by adoptDialStream, once the newcomer's own is up
  }
  // a copy kept waiting is not called a copy: it may be the healthy machine, asked again within the interval
  const nm = String(deviceId).slice(0, 64);
  refuseDial(socket, 'duplicate-device', deviceId, '', !copy ? `wait — other dial-ins as "${nm}" are being judged here (a refused copy of its pairing holds it, or its link cannot be judged yet); this one is asked again within a minute. If this machine holds a copy of another machine's pairing, pair it under its own name`
    : known ? `pair this machine under its own name — its dial-in as "${nm}" was greeted here and refused, and a copy of that pairing holds it; update its agent (or rerun its install command), or pair it under its own name` : undefined);
  if (copy) noteDialEvent(deviceId, 'duplicate', facts);
  logRefusal(facts, deviceId, `[device] dial REFUSED for '${deviceId}' — duplicate device: ${unjudged ? 'the seat could not be judged and was replaced a moment ago (one replace per interval)' : busy ? `the copy dialed in is refused and ${busy}` : `another daemon (boot ${dialBootOf.get(deviceId)}) is dialed in and answering`}; ${copy ? '' : 'told to wait — '}this one (boot ${incoming.boot}${facts.daemon ? `, daemon ${facts.daemon}` : ''}, from ${facts.from || '?'}) holds a copy of the pairing`);
  return null;
}
/** unit 4's cure: a dial-in's stream takes its device's place, and the stream it REPLACES is closed — only now, once the
 *  newcomer's websocket is up (an upgrade that never completed leaves the current one alone). Cure 2: when the stream it
 *  replaces is a REFUSED copy, the newcomer is on PROBATION — the refused copy is held back, open, until the newcomer's own
 *  greeting decides (deviceForDial): it passes ⇒ the held-back copy is closed; it is refused ⇒ the held-back copy takes the
 *  seat back and the newcomer stays open as a spare (at most SPARES_MAX per device: none is ever closed for room — at the cap
 *  admitDial turns a further copy away by name, and greets one more per interval). */
function adoptDialStream(deviceId, stream) {
  // a closed stream is never seated or spared again; a SEATED refused copy that goes while copies wait beside it hands the seat
  // to the newest of them (the row reads what IS dialed in; server.js's own close handler then finds the seat moved)
  try { stream.on('close', () => { closedStreams.add(stream); if (agentdDials.get(deviceId) === stream && !probation.has(deviceId) && liveSpares(deviceId) > 0) seatSpare(deviceId); }); } catch { }
  const facts = admitted.get(deviceId)?.facts || null;
  admitted.delete(deviceId);
  const was = agentdDials.get(deviceId);
  agentdDials.set(deviceId, stream);
  if (!was || was === stream) return;
  const af = authFailedStreams.get(deviceId), rf = refusedStreams.get(deviceId);
  if ((af && af.stream === was) || (rf && rf.stream === was)) {
    const prev = probation.get(deviceId);
    if (prev) spare(deviceId, prev.heldBack, prev); // an earlier probation's held-back copy waits beside it — one over the cap at most, and only for a dial-in adopted while a probation is pending, which admission never lets through (a probation settles at its greeting's answer); never closed for room
    probation.set(deviceId, { stream, heldBack: was, af: af && af.stream === was ? af : null, rf: rf && rf.stream === was ? rf : null, facts, at: Date.now() });
    lastProbationAt.set(deviceId, Date.now());
    watchProbation(deviceId, stream);
    return;
  }
  { const pb = probation.get(deviceId); if (pb && pb.stream === was) { probation.set(deviceId, { ...pb, stream, facts: facts || pb.facts, at: Date.now() }); watchProbation(deviceId, stream); try { was.destroy(); } catch { } return; } } // a copy on probation replaced before its greeting decided hands the probation on: the copy held back stays
  lastReplaceAt.set(deviceId, Date.now());
  try { was.destroy(); } catch { }
}
function watchProbation(deviceId, stream) {
  try { stream.on('close', () => { const pb = probation.get(deviceId); if (pb && pb.stream === stream) settleProbation(deviceId, false); }); } catch { }
}
/** the probation's outcome: `passed` ⇒ the held-back copy is closed, and the spares too (they dial again, meet a seat that
 *  answers and are turned away by name). Else the held-back copy takes the seat back with its fences and its refusal said on
 *  the row again, the refused newcomer is said on the row as a COPY of the pairing (`duplicate`: its door, «pair it under its
 *  own name») and stays open as a spare with its own fences while there is room — at the cap it is closed, and its next dial
 *  meets the once-per-interval rule. A held-back copy that closed meanwhile is no seat: the refused newcomer keeps it; both
 *  gone ⇒ a spare takes it, or the device reads disconnected. `refused` = the newcomer's own greeting was refused (else it
 *  closed before an answer) */
function settleProbation(deviceId, passed, { refused = false } = {}) {
  const pb = probation.get(deviceId);
  if (!pb) return;
  probation.delete(deviceId);
  if (passed) {
    lastReplaceAt.set(deviceId, Date.now());
    try { pb.heldBack.destroy(); } catch { }
    dropSpares(deviceId);
    refusedBoots.delete(deviceId); // a copy passed: the known refused copies may be greeted again (they meet a seat that answers)
    return;
  }
  if (agentdDials.get(deviceId) !== pb.stream) { try { pb.heldBack.destroy(); } catch { } return; } // the seat moved on: nothing is left open behind it
  { const dm = agentdDialDevices.get(deviceId); if (dm && dm._dialStream === pb.stream) { try { dm.stop?.(); } catch { } agentdDialDevices.delete(deviceId); } } // its greeting's retries do not run on against the copy given the seat back (one re-ask at most, as any op's)
  const mine = (m) => (m.get(deviceId)?.stream === pb.stream ? m.get(deviceId) : null);
  const own = { af: mine(authFailedStreams), rf: mine(refusedStreams) }; // the newcomer's own refusal, kept with it as a spare
  const backOpen = !closedStreams.has(pb.heldBack), newOpen = !closedStreams.has(pb.stream);
  const nb = pb.facts && pb.facts.boot ? String(pb.facts.boot) : null, hb = streamBoot.get(pb.heldBack) || null;
  // THE SAME DAEMON DIALED AGAIN (one refused machine that slept and woke — never a copy): a boot is one process, which holds one
  // stream at a time, so its OLDER stream is the dead one. That one goes, and the live one keeps the place with its own refusal
  // (the seat, or a spare's place); never noted as a copy, never known
  if (backOpen && newOpen && refused && nb && nb === hb) { try { pb.heldBack.destroy(); } catch { } reseat(deviceId, pb.stream, own); return; }
  const twin = refused && nb ? (sparesOf.get(deviceId) || []).find((x) => !closedStreams.has(x) && streamBoot.get(x) === nb) : null;
  if (backOpen) {
    reseat(deviceId, pb.heldBack, pb);
    if (!newOpen) return;
    if (refused && pb.facts && !twin) noteDialEvent(deviceId, 'duplicate', { ...pb.facts, at: Date.now() }); // two refused copies: the row says the second, with its door (never a dial-in whose facts are unknown — it was adopted without admission)
    if (!refused) { try { pb.stream.destroy(); } catch { } } // never greeted to the end (a locked vault, a stall): closed, never kept unasked nor remembered — its re-dial is greeted afresh
    else if (twin) { sparesOf.set(deviceId, (sparesOf.get(deviceId) || []).filter((x) => x !== twin)); try { twin.destroy(); } catch { } spare(deviceId, pb.stream, own); } // the same daemon as a spare: its old stream goes, the live one waits in its place
    else if (liveSpares(deviceId) < SPARES_MAX) spare(deviceId, pb.stream, own);
    else { try { pb.stream.destroy(); } catch { } if (pb.facts) { const m = refusedBoots.get(deviceId) || new Map(); for (const [k, at] of m) if (Date.now() - at >= REFUSED_BOOT_MS) m.delete(k); const k = copyKeyOf(pb.facts); m.delete(k); m.set(k, Date.now()); while (m.size > REFUSED_KEYS_MAX) m.delete(m.keys().next().value); refusedBoots.set(deviceId, m); } } // refused and closed at the cap: known
  } else if (!newOpen) seatSpare(deviceId);
  // else the held-back copy went while the newcomer was greeted: the refused newcomer keeps the seat with its own fences
}
/** a refused copy takes the seat with ITS fences, and the row says its refusal again (a newcomer's accept came after it) */
function reseat(deviceId, stream, f) {
  agentdDials.set(deviceId, stream);
  if (streamBoot.has(stream)) dialBootOf.set(deviceId, streamBoot.get(stream)); // the seat's own boot, never the last newcomer's
  if (f && f.af) { authFailedStreams.set(deviceId, f.af); noteDialEvent(deviceId, 'authFail', { at: Date.now() }); }
  if (f && f.rf) {
    refusedStreams.set(deviceId, f.rf);
    if (f.rf.code === 'hello-ack-shape') noteDialEvent(deviceId, 'greetingRefused', { at: Date.now() });
    else if (/^(?:device|hub)[-_]/.test(String(f.rf.code || ''))) { const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteDeviceKey?.(h.id, 'refused-again', { code: String(f.rf.code), road: 'dial', at: Number(f.rf.at) || 0 })) { try { bcastAll({ type: 'hosts-updated' }); } catch { } } } // lane lg-remote-hardening (B-7f0b, the read's must 1): a key refusal said again too
  }
}
/** the seat's copy is gone: the newest copy waiting beside it takes the seat (nothing re-dials, the row reads what IS dialed
 *  in); none ⇒ the seat is empty and the device reads disconnected */
function seatSpare(deviceId) {
  const list = (sparesOf.get(deviceId) || []).filter((x) => !closedStreams.has(x));
  const next = list.pop();
  if (list.length) sparesOf.set(deviceId, list); else sparesOf.delete(deviceId);
  if (next) { reseat(deviceId, next, spareFences.get(next)); return; }
  agentdDials.delete(deviceId);
  noteDialEvent(deviceId, 'disconnected', { at: Date.now() });
}
const liveSpares = (deviceId) => (sparesOf.get(deviceId) || []).filter((x) => !closedStreams.has(x)).length;
function dropSpares(deviceId) {
  for (const sp of sparesOf.get(deviceId) || []) { try { sp.destroy(); } catch { } }
  sparesOf.delete(deviceId);
}
function spare(deviceId, stream, f) {
  const list = (sparesOf.get(deviceId) || []).filter((x) => !closedStreams.has(x));
  if (list.includes(stream) || closedStreams.has(stream)) return;
  list.push(stream); // never one closed to make room: admitDial keeps the count (a close is a re-dial)
  spareFences.set(stream, { af: (f && f.af) || null, rf: (f && f.rf) || null });
  sparesOf.set(deviceId, list);
  try { stream.on('close', () => { const l = sparesOf.get(deviceId); if (l) { const i = l.indexOf(stream); if (i >= 0) l.splice(i, 1); } }); } catch { }
}
/** Full unpair of a dial machine (DELETE /api/hosts/:id on a dial record):
 *  mounts torn down, vsht_ token file gone, live stream destroyed. The token
 *  hash dies with the host record itself. */
async function unpairDialDevice(deviceId) {
  if (hosts.held && hosts.held()) throw Object.assign(new Error(`un-pairing a device: ${hosts.unreadWords()}`), { code: 'hosts-unread', status: 503 });   // the B-f276 remainder's belt: no half teardown over a held list
  // the B-f276 remainder, machine-mounts.json's read r1 (M3): while the mounts store is HELD its records are unknown — removing the
  // machine now would revoke none of its push tokens (a /dav credential outliving its machine): refused BEFORE any side effect
  if (machineMounts.unreadWords && machineMounts.unreadWords()) throw Object.assign(new Error(`removing a machine: ${machineMounts.unreadWords()}`), { code: 'mounts-unread', status: 503 });
  // B-f276 family unit 1 (round wom600meg): …and while mount-tokens.json is HELD a push mount of it could not revoke its token (its
  // unmount below refuses inside a swallow — the machine gone, its folder link alive at the lift): refused BEFORE any side effect
  { const w = machineMounts.revokeHeldFor && machineMounts.revokeHeldFor(hosts.findByDeviceId(deviceId)?.id); if (w) throw Object.assign(new Error(`removing a machine: ${w}`), { code: 'tokens_unread', status: 503 }); }
  // B-4d71: its token's TOMBSTONE — the device's next dial (at once for a device dialed in now: its link ends below; an offline
  // one whenever it comes back) is told «retired» with the proof, and its own agent removes its start and ends
  // (the HOST token's hash keys the proof: read before dropHostToken below. A vault locked now is never asked — that would file
  // «waiting on the vault» for a machine just removed — and leaves no key: that device is told «retired» without a proof and
  // keeps its start, as before)
  let proofKey = null;
  try { if (!hostTokenLocked('dial-' + deviceId)) proofKey = PT.tokenHash(agentdHostToken('dial-' + deviceId)); } catch { }
  try { hosts.noteRetiredDial?.(deviceId, hosts.dialTokenHash(deviceId), proofKey); } catch { }
  try { await machineMounts.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }
  try { portForwards.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }
  try { exitProxy.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }
  try { dropHostToken('dial-' + deviceId); } catch { }   // lane vault-e2e-password-fix-r2: the file before the vault, its entry after
  const live = agentdDials.get(deviceId);
  if (live) { try { live.destroy(); } catch { } agentdDials.delete(deviceId); }
  agentdDialDevices.delete(deviceId);
  authFailedStreams.delete(deviceId); refusedStreams.delete(deviceId); // unit 4's cure r2: nothing of the unpaired stream is kept
  { const pb = probation.get(deviceId); probation.delete(deviceId); if (pb) { try { pb.heldBack.destroy(); } catch { } } dropSpares(deviceId); admitted.delete(deviceId); refusedBoots.delete(deviceId); } // nor its probation or spares
  try { require('../agentd/client.js').DeviceManager.dropHelloFolds('dev:' + deviceId); } catch { }   // B-0194: what its hello folds owe said, then they go
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
// unit 4's cure (主开发's verdict of 2026-11-18): A REFUSAL BY NAME of a dialed stream is remembered the same way — every code
// of client.js TERMINAL_REFUSALS (at this unit the refused greeting alone; the units after it add their key refusals to that
// set and are remembered here with no change; a locked vault is a wait, never remembered). Ops on that stream are refused at
// once with the same code and words for the re-greet interval: no new DeviceManager says hello again.
const refusedStreams = new Map(); // deviceId → { stream, at, code, message }
// unit 4's cure 2: a newcomer over a REFUSED copy is on probation (its own greeting decides the seat), a refused newcomer
// stays open beside the seat as a spare, and whatever the probe cannot judge replaces a seat at most once per interval
const probation = new Map(); // deviceId → { stream, heldBack, af, rf }
const lastProbationAt = new Map(); // deviceId → ms (at the spares' cap, one probation per interval)
const admitted = new Map(); // deviceId → { facts, at }: a newcomer admitted on probation, its websocket not up yet (admitDial → adoptDialStream)
const RESERVE_MS = 10 * 1000; // an upgrade that never called back frees its reservation
const PROBATION_MAX_MS = 30 * 1000; // a greeting that never decides (a locked vault) gives the seat back
const refusedBoots = new Map(); // deviceId → Map(copy key → ms): copies refused on probation and closed at the cap
const REFUSED_BOOT_MS = 24 * 60 * 60 * 1000; // a bound for the memory itself; a pass or a new pairing clears it first
const REFUSED_KEYS_MAX = 16; // and a count: the oldest known copy goes first (a holder stating a new boot at every dial adds one per interval)
const copyKeyOf = (f) => (f && f.boot ? 'b:' + String(f.boot) : 'a:' + String((f && f.from) || '') + '|' + String((f && f.daemon) || ''));
const streamBoot = new WeakMap(); // stream → the boot its dial-in stated
const closedStreams = new WeakSet();
const spareFences = new WeakMap(); // spare stream → { af, rf } (its own refusal, back on the seat with it)
const sparesOf = new Map(); // deviceId → [stream]
const SPARES_MAX = 2;
const lastReplaceAt = new Map(); // deviceId → ms
const authFailedError = (deviceId) => Object.assign(new Error(`agentd auth failed — token mismatch: "${deviceId}" is dialed in but holds another command's host token; generate a new command in the pairing dialog and run it there`), { code: 'auth_failed', stage: 'connect' }); // the first refusal's shape
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
async function deviceForDial(deviceId, _retried = false, { probe = false } = {}) {
  // FAIL FAST when the device isn't dialed in: the stream transport's connect
  // loop otherwise backs off and retries FOREVER, so every operation against
  // an offline device (session create, mount, test) HUNG instead of erroring
  // (real report: create卡住/terminal空白/mount打不开 — Mac daemon died after
  // a self-upgrade re-exec and nothing surfaced it).
  const curStream = agentdDials.get(deviceId);
  if (!curStream) throw new Error(`device "${deviceId}" is offline — its daemon is not dialed in (rerun the install command on it)`);
  const af = authFailedStreams.get(deviceId);
  if (af && af.stream !== curStream) authFailedStreams.delete(deviceId); // a fresh stream is asked afresh
  if (af && af.stream === curStream && Date.now() - af.at < AUTH_FAIL_REHELLO_MS) throw authFailedError(deviceId);
  // unit 3's cure: the person forgot the device key (or let its agent in without one) since a refusal — that stream is asked
  // again, and a link built before is rebuilt over the SAME stream (the next hello is the one judged). The duplicate probe
  // never does either: it only asks whether the current device answers.
  const recK = hosts.findByDeviceId(deviceId) || {};
  const forgotAt = probe ? 0 : Math.max(Number(recK.deviceKeyForgotAt) || 0, Number(recK.deviceKeyUnprovenAt) || 0);
  { const r0 = refusedStreams.get(deviceId); if (r0 && forgotAt > r0.at) refusedStreams.delete(deviceId); }
  const rf = refusedStreams.get(deviceId);
  if (rf && rf.stream !== curStream) refusedStreams.delete(deviceId); // a fresh stream is asked afresh (the old one is gone)
  if (rf && rf.stream === curStream && Date.now() - rf.at < AUTH_FAIL_REHELLO_MS) throw Object.assign(new Error(rf.message), { code: rf.code, stage: 'connect' });
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
  if (dm && (dm._stopped || (dm._dialStream && dm._dialStream !== curStream) || (forgotAt && (dm._builtAt || 0) < forgotAt))) {
    // a Forget over a LIVE link: its stream is CLOSED, so the device's agent ends that connection whole (its sessions and
    // channels with it) and is judged when it dials in again — a new hello over the same stream would meet the old
    // connection's channels on the device
    const forgotLive = !dm._stopped && dm._dialStream === curStream && !!(forgotAt && (dm._builtAt || 0) < forgotAt) && !!(dm.status && dm.status().connected);
    try { dm.stop?.(); } catch { }
    dm = null;
    agentdDialDevices.delete(deviceId);
    if (forgotLive) {
      if (agentdDials.get(deviceId) === curStream) { agentdDials.delete(deviceId); noteDialEvent(deviceId, 'disconnected', {}); }
      throw Object.assign(new Error(`the device key of "${deviceId}" was forgotten: its link is closed, and its agent is judged when it dials in again`), { code: 'device-key-forgotten', stage: 'connect' });
    }
  }
  if (dm && dm.status().connected) return dm;
  if (!dm) {
    const { DeviceManager } = require('../agentd/client.js');
    dm = new DeviceManager({
      dataDir: path.join(rootDir, 'data'),
      bundlePath: path.join(rootDir, 'data', 'bin', 'vibespace-agentd.js'),
      version: require('../../package.json').version,
      hub: hubId(), // lane mac-repair-retires-stale: named in the hello (the device keeps it once the host token proved this hub)
      transport: { kind: 'stream', hostToken: () => agentdHostToken('dial-' + deviceId), getStream: () => agentdDials.get(deviceId) || null },   // asked at every connect: a LOCKED vault refuses it by name (no cached copy outlives a lock)
      // lane device-upgrade-stuck: the line NAMES the device — two devices' upgrade lines read as one machine's "two versions"
      log: (...a) => console.log('[device-dial]', JSON.stringify(String(deviceId)), ...a),
      upgradeLedger: upgradeLedgerFor(deviceId), // the loop breaker's count outlives this instance (verify-r1 C1)
      helloKey: 'dev:' + deviceId, // B-0194: the update refused at each re-dial folds across these instances (client.js HELLO_FOLDS)
      // lane device-upgrade-stuck: THE door (hosts.onAgentUpgrade → src/server/device-upgrade-watch.js)
      onUpgradeStuck: (from, to, info) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('stuck', { ...(info || {}), hostKey: h ? h.id : 'host-dial-' + deviceId, machine: (h && h.name) || deviceId, from, to }); },
      onVersionMatch: (v) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('matched', { hostKey: h ? h.id : 'host-dial-' + deviceId, version: v }); },
      // lane win-upgrade-pipe: an upgrade started / the device answered — a device that never dials back reaches the user
      onUpgradeBegin: (from, to) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('begun', { hostKey: h ? h.id : 'host-dial-' + deviceId, machine: (h && h.name) || deviceId, from, to }); },
      onAnswer: (v) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('answered', { hostKey: h ? h.id : 'host-dial-' + deviceId, version: v }); },
      // lane device-act-audit: every act sent over this dial link = one line of data/device-audit.jsonl (the row's id)
      onAct: (line) => { const h = hosts.findByDeviceId(deviceId); hosts.noteAct(h ? h.id : 'host-dial-' + deviceId, line); },
      // lane device-bundle-signing (design q-042 D2): this hub will not push an unsigned build / the device refused the signature
      onUpgradeRefused: (from, to, info) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('refused', { ...(info || {}), hostKey: h ? h.id : 'host-dial-' + deviceId, machine: (h && h.name) || deviceId, from, to }); },
      // fix r2 (verify-r1 RED-2): a device that trusted no release key pinned the first validly signed one (TOFU)
      onUpgradeTrusted: (from, to, info) => { const h = hosts.findByDeviceId(deviceId); hosts.onAgentUpgrade?.('trusted', { ...(info || {}), hostKey: h ? h.id : 'host-dial-' + deviceId, machine: (h && h.name) || deviceId, from, to }); },
      // lane device-allow-flags: the allow list the device states (its hello-ack) → its record, the card repainted when it moved;
      // its name in a refusal's re-run sentence
      onPolicy: (p) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.notePolicy?.(h.id, p)) { try { bcastAll({ type: 'hosts-updated' }); } catch { } } },
      // lane win-input-elevated: the daemon's own token elevation (its hello-ack) → its record, the card repainted when it moved
      onElevated: (e) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteElevated?.(h.id, e)) { try { bcastAll({ type: 'hosts-updated' }); } catch { } } },
      // lane device-node-version: the node the agent runs on (its hello-ack) → its record, the card repainted when it moved
      onRuntime: (rt) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteRuntime?.(h.id, rt)) { try { bcastAll({ type: 'hosts-updated' }); } catch { } } },
      machine: () => { const h = hosts.findByDeviceId(deviceId); return (h && h.name) || deviceId; },
      // lane hub-act-ask: an act nobody clicked follows the machine's Hub automation list (asks on a cluster instance)
      actGate: hosts.actGateFor(() => { const h = hosts.findByDeviceId(deviceId); return h ? h.id : 'host-dial-' + deviceId; }),
      // lane lg-remote-hardening (B-7f0b, q-042 D3): the device key its record pins; learned / refused → the record, the card repainted
      devicePin: () => { const h = hosts.findByDeviceId(deviceId); const k = h && h.deviceKey; return k == null ? null : (k && typeof k.pub === 'string' ? k.pub : ''); }, deviceProofRequired: () => { const h = hosts.findByDeviceId(deviceId); return !!(h && h.deviceKeyForgotAt); },
      onDeviceKey: (ev, f) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteDeviceKey?.(h.id, ev, { ...(f || {}), road: 'dial' })) { try { bcastAll({ type: 'hosts-updated' }); } catch { } } },
      hubIdentity, // D3 half b: this hub's identity — its public half in every hello, its signature over the device's nonce
    });
    dm._builtAt = Date.now(); agentdDialDevices.set(deviceId, dm);
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
    if (e && e.code !== 'vault_locked' && require('../agentd/client.js').TERMINAL_REFUSALS.has(e.code)) {
      if (e.code === 'hello-ack-shape') noteDialEvent(deviceId, 'greetingRefused', { at: Date.now() }); // the row says «greeting refused»
      refusedStreams.set(deviceId, { stream: curStream, at: Date.now(), code: e.code, message: String(e.message || '').slice(0, 400) });
    }
    if ((authFailedStreams.get(deviceId)?.stream === curStream || refusedStreams.get(deviceId)?.stream === curStream) && probation.get(deviceId)?.stream === curStream) settleProbation(deviceId, false, { refused: true }); // unit 4's cure 2: a refused newcomer gives the seat back
    if (agentdDialDevices.get(deviceId) === dm) agentdDialDevices.delete(deviceId);
    // a dm stopped MID-CONNECT by a concurrent re-dial cleanup surfaces one
    // transient 'stopped' — while the stream is live, rebuild once instead of
    // failing the caller's FIRST op after a re-dial (seen live on the userW
    // verification: test probe errored once, next op self-healed)
    if (!_retried && String(e && e.message) === 'stopped' && agentdDials.get(deviceId)) {
      return deviceForDial(deviceId, true, { probe });
    }
    throw e;
  }
  if (authFailedStreams.get(deviceId)?.stream === curStream) authFailedStreams.delete(deviceId);
  if (refusedStreams.get(deviceId)?.stream === curStream) refusedStreams.delete(deviceId);
  if (probation.get(deviceId)?.stream === curStream) settleProbation(deviceId, true); // unit 4's cure 2: a newcomer that passes takes the seat
  else if (agentdDials.get(deviceId) === curStream) { if (sparesOf.has(deviceId)) dropSpares(deviceId); refusedBoots.delete(deviceId); } // a seat that passes: the copies beside it go, dial again, meet it and are turned away by name; the known copies are forgotten
  return dm;
}
async function ensureAgentdOnHost(hostId) {
  const version = require('../../package.json').version;
  if (_agentdInstalled.get(hostId) === version) return;
  const bundlePath = path.join(rootDir, 'data', 'bin', 'vibespace-agentd.js');
  const r = await hosts.installAgentd(hostId, bundlePath, version, agentdHostToken(hostId));
  if (r && r.deferred) return;   // B-93e7: a landing the host deferred (its bundle could not be synced) is no install — the next connect tries again
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
  const decode = utf8Stream((s) => data.emit(s));   // B-b968: a frame that ends inside a character (zh / ja: three bytes) holds its bytes
  handle.onData = (buf) => decode(buf);
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
    agentdMintDialPair, daemonPtyShim, deviceForDial, ensureAgentdOnHost, hubId,
    unpairDialDevice, gateDialUpgrade, admitDial, noteDialEvent, lockOutDialHolder, upgradeLedgerFor, UPGRADE_RETRY_AFTER_MS, AUTH_FAIL_REHELLO_MS, DUP_PROBE_MS, SPARES_MAX, wsStream, adoptDialStream, knownCount: (deviceId) => refusedBoots.get(deviceId)?.size || 0 };
}
// THE DIALED STREAM (moved from server.js by unit 4's cure r2, so a test drives the hub's own adapter): a device's ws as the
// duplex shape a Mux consumes. removeListener lets the Mux a refused handshake kept leave the stream (Mux.detach);
// listenerCount is what the leg counts. A dispatch walks a copy, so a listener that leaves mid-dispatch skips no other.
function wsStream(ws) {
  const listeners = { data: [], close: [], error: [] };
  ws.on('message', (d) => { const b = Buffer.isBuffer(d) ? d : Buffer.from(d); for (const f of [...listeners.data]) f(b); });
  ws.on('close', () => { for (const f of [...listeners.close]) f(); });
  ws.on('error', () => { for (const f of [...listeners.error]) f(); });
  return {
    write: (d) => { try { ws.send(d); return true; } catch { return false; } },
    on: (ev, fn) => { listeners[ev]?.push(fn); },
    removeListener: (ev, fn) => { const a = listeners[ev]; const i = a ? a.indexOf(fn) : -1; if (i >= 0) a.splice(i, 1); },
    listenerCount: (ev) => (listeners[ev] || []).length,
    destroy: () => { try { ws.close(); } catch { } },
  };
}
module.exports = { create, wsStream };
