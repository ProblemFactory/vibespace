'use strict';
/**
 * THE WEBRTC STREAM RUNG, the hub's half (ORCH; design q-041 r2 §2 传输 + 客户端, lane stream-p1a-transport). A machine
 * desktop window whose machine passes the rung (src/server/desktop-access.js streamRung — the agent's `stream-offer`
 * capability and a source) plays the machine's picture as WebRTC: the agent's werift offers, the PAGE's RTCPeerConnection
 * answers, and this module is only the SIGNALING relay between the page's requests and the agent's ops, plus the record:
 *   • start(hostId, {source, fp16, hdr, mic}) the rung's verdict; when taken, `stream-offer` on the agent → the offer (+ the relay's candidates);
 *                            `mic` (lane stream-mic-road) = the page wants its microphone's audio m-line — asked of a `stream-mic` agent
 *                            only (src/agentd/client.js gates it), so an older agent streams without it and the answer's `mic` says which;
 *                            `audio` (lane speaker-passthrough-v1) = the page wants the machine's SOUND on that m-line — asked of a
 *                            `stream-audio` agent only; the answer's `audio` says whether the machine offered its track
 *                            and a session KEY the page names from now on — `{ take: false, code, why }` otherwise (`too_many_streams`
 *                            adds the machine's `live` / `cap` / `displays` — lane desktop-display-modes' per-machine cap; the window
 *                            shows the VNC picture and says why). `source` = the page's choice (src/stream-model.js
 *                            streamSourceOf: a display, or ONE window — lane stream-p3m-build on a Mac, stream-p2w-build on
 *                            Windows: int304's one door); none = the main display. `fp16` = a Windows window's FP16 road (off).
 *                            `hdr` (lane stream-hdr-passthrough) = the page's screen is HDR and its browser decodes WebRTC AV1 in
 *                            hardware, and the person turned 「HDR 直通」 on — asked of a SCREEN source only (the agent offers
 *                            AV1 first where its display and encoder can; the browser's answer decides)
 *                            THE MAC'S HELPER (lane stream-p3m-build): an offer refused `no_helper` (a Mac with no screen
 *                            helper and no compiler) is answered by pushing THIS hub's prebuilt (`helpersDir`: data/bin/helpers/
 *                            vibespace-screen + .version, put there by the release — scripts/build-mac-helper.sh) beside the
 *                            agent's helper over the device link (fs-write-stream, `vibespace-screen-<version>`) when its version
 *                            is the one the agent asks for, then the offer is asked once more. Lane apple-signing: when its `.identity.json`
 *                            and the release manifest's `helper` row are there they must describe this very prebuilt (else `helper_unsigned`,
 *                            nothing pushed — their absence is no refusal, round 4); and an offer whose `helper.wantSigned` is true (an ad-hoc
 *                            helper on a Mac whose agent pins a Team ID) gets this hub's DEVELOPER ID prebuilt pushed once per machine, then
 *                            again after the Mac's own door (`until`, else SIGNED_RETRY_MS) while it still wants one, SIGNED_PUSH_MAX times
 *                            per hub life (round 5; the host claimed before the push's await, round 6; the Mac's hold is a fact about BYTES —
 *                            judged against the prebuilt the hub has NOW, a different one goes at once, round 7; a try is spent only by a push SENT,
 *                            a look at bytes the Mac newly names sends nothing and comes once per SIGNED_RETRY_MS, the hold line names the door by
 *                            the refusal's kind, round 8; a try is a DELIVERY — the device client's refusals before the channel opens, by their
 *                            code, spend none, round 9) — the agent judges it and swaps
 *   • poll(key, n, seq)      THE LONG POLL (src/server/machine-app.js's shape): the agent's trickled candidates the page has not
 *                            seen (from index n), the session's state and the agent's last numbers; it answers at once when
 *                            anything is newer than `seq`, else after ≤ STREAM_LIMITS.pollMaxMs
 *   • answer / candidate     the page's SDP answer and trickled candidates → `stream-answer`
 *   • restart(key)           an ICE-restart offer (the page's restart budget — src/stream-model.js streamStep)
 *   • sound(key, on)         the strip's 「声音」 (lane speaker-passthrough-v1): `stream-audio` on the agent — THE capture of the machine's
 *                            sound for that session starts / ends there
 *   • stop(key, why)         `stream-stop` (its `why` reaches the machine's log); a session no page polled for STREAM_LIMITS.idleMs
 *                            is stopped (the page closed). THE VIEWER GONE (lane stream-window-fixes): the route says when a long
 *                            poll's connection closed before its answer (pollGone — the tab closed, the browser quit or crashed):
 *                            no new poll within STREAM_LIMITS.goneMs ⇒ stopped `viewer_gone`, so the machine ends the capture in
 *                            seconds, not at the idle sweep
 *   • stopWindow(host, id)   every session of that host streaming that window (the picker's 停止 — any browser's)
 *   • facts(hostId)          THE RECORD: per session { key, sid, codec, source, startedAt, state, stats, path, ended } — facts,
 *                            never a decision
 * THE RELAY (NAT — direct first, else the hub forwards): per session ONE UDP socket on this hub; each datagram is framed
 * (src/stream-model.js relayFrame) onto ONE `tcpForward` to the agent's relay port, where the stream host's shims hand it to
 * werift. Its candidates are `typ relay` (the lowest priority: ICE takes a direct pair whenever one works). Bounded: a stalled
 * forward DROPS datagrams for STALL_MS (UDP semantics) — it never queues. `direct: false` strips both sides' host candidates
 * (the suites' relay-only proof; a person never sets it).
 * THE UDP LEG (lane stream-relay-udp — the owner's Windows firewall blocks every inbound UDP to the agent, so no direct pair
 * forms, and the relay over the device link delivered 5 fps of a 30 fps picture): the relay's socket is bound BEFORE the
 * offer, and `stream-offer` carries `relayLeg` {port, key, hosts} — a per-session 32-byte key that travels only over the
 * device link. The daemon PINGs this port from its own socket (src/stream-model.js legControl: HMAC over a rising counter +
 * a nonce); an authenticated PING (legPingVerdict — a forged one or a replayed counter is dropped and counted) names the
 * daemon's (ip, port) and is answered by a PONG; DATA comes only from that address. THE PATH ELECTION (lane stream-leg-flap —
 * src/stream-model.js legElect; the owner's Mac desktop went black 2026-10-20 when this hub followed the path the daemon LAST
 * spoke on and flipped leg ⇄ link three times in 20 s): ONE election per session, with hysteresis — the leg is taken ONCE,
 * when it comes up (a PING flagged UP, or its DATA) ⇒ the browser's datagrams go to it as leg DATA; it is left only when
 * MEASURED dead: no sign of life for legDeadMs while it carried the picture (legStaleMs idle) ⇒ the device link. The device
 * link speaking (`held`) and a PING not flagged UP (`quiet`) are counted, never obeyed. The ladder: direct (host pairs, the
 * highest priority) → this leg → the device link; the device link's frames always reach the browser, whichever way the
 * hub answers. `relay.via` + `relay.leg` on the record, a log line at every change. `udpLeg: false` offers no leg (the
 * suites' device-link control); `legMute()` true drops the leg's PINGs unanswered (the suites' unreachable-hub proof);
 * `elect` = the election (the suites' RED control hands in the .330 rule) — a person never sets any of them.
 * THE HAND-OVER (lane desktop-handover — src/server/desktop-handover-engine.js): `handover` = its hooks — ended(key, why) once
 * per session (the page's stop, the machine's `ended`), started(key, hostId, after) when a session's offer is made (`after` =
 * the page's previous key: a display switch carries the lease), factsOf(key) = the lease's facts every long poll answers
 * (the strip's words and the agent's pointer); device(key) hands the engine a live session's link + sid, nudge(key) answers
 * the page's waiting poll at once.
 * People only: the routes refuse an agent token (`human_only`) before anything here runs.
 */
const crypto = require('crypto');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Transform } = require('stream');
const SM = require('../stream-model.js');

const L = SM.STREAM_LIMITS;
const STALL_MS = 50;
const named = (code, message) => Object.assign(new Error(message), { code });

/** This hub's IPv4 addresses (every interface, loopback last) — where a browser can reach the relay's UDP port. */
function hubIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces() || {})) for (const a of list || []) if (a && (a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
  return [...new Set([...out, '127.0.0.1'])];
}
const isHostCandidate = (c) => / typ host( |$)/.test(String(c || ''));
/** An SDP without its host candidates (the relay-only switch). */
const stripHosts = (sdp) => String(sdp || '').split(/\r?\n/).filter((l) => !(l.startsWith('a=candidate:') && isHostCandidate(l))).join('\r\n');
/** An SDP with the relay's candidates added to its (one) media section. */
function withRelay(sdp, lines) {
  if (!lines.length) return sdp;
  const rows = String(sdp || '').split(/\r?\n/);
  const at = rows.findIndex((l) => l.startsWith('m='));
  if (at < 0) return sdp;
  let end = rows.findIndex((l, i) => i > at && l.startsWith('m='));
  if (end < 0) end = rows.length;
  while (end > at && rows[end - 1] === '') end--;
  rows.splice(end, 0, ...lines.map((c) => 'a=' + c));
  return rows.join('\r\n') + (rows[rows.length - 1] === '' ? '' : '\r\n');
}

const HELPERS_DIR = path.join(__dirname, '..', '..', 'data', 'bin', 'helpers');
const MANIFEST_COPY = path.join(__dirname, '..', '..', 'data', 'bin', 'vibespace-agentd.manifest.json'); // the signed release's record beside the bundle (scripts/agentd-release.mjs) — there only when this build IS the release
const digestOf = (file) => new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('error', reject).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))); });
const SHA256_RE = /^[0-9a-f]{64}$/;
// round 9 (acceptance r8 MINOR): the agent's pending record counts the codesign runs that went UNANSWERED on these bytes (src/agentd/stream-mac.js:
// `tries`, 1 or 2 — at 3 it is refused with an `until`); its NEXT check is one more — the hub said «try k of 3» of the next check where k runs had failed
const pendingTries = (hold) => { const k = Number(hold && hold.tries); return Number.isInteger(k) && k > 0 ? k : null; };
const pendingNext = (hold) => { const k = pendingTries(hold); return k === null ? '?' : Math.min(k + 1, 3); };
const DATE_RANGE_MS = 8.64e15; // Date's range (ECMA-262 §21.4.1.1): a time outside it has no ISO form — toISOString throws
const timeOf = (t) => (typeof t === 'number' && Number.isFinite(t) && Math.abs(t) <= DATE_RANGE_MS ? t : null); // a device-sent time — a NUMBER in Date's range — or null (round 5: a bad `until` is tolerated, never thrown on; round 6: null / '' / false / [] / true are no time at all, not epoch 0)
const SIGNED_RETRY_MS = 30 * 60 * 1000; // round 5: the signed push is tried again after this when the Mac named no sooner door (the agent's own UNANSWERED_RETRY_MS)
const SIGNED_PUSH_MAX = 8; // round 5: signed pushes per machine per hub life — bounded; round 8: pushes SENT (bytes went to the Mac, or were refused at its door) — a refusal on the hub's side spends none; round 9: DELIVERIES — the device link took the push (the open travelled: bytes went, the Mac's door refused it, the link dropped under it); a refusal before the channel opened (PUSH_REFUSED_ON_HUB) spends none
// ROUND 9 (acceptance r8): the device client refuses ON THE HUB, before any channel opens, in these cases — src/agentd/client.js fsWriteStream's
// first lines: the capability gate (`host_needs_daemon`), an act with no `by` (`act_without_by`, src/device-acts.js), the machine's «Hub automation»
// gate (src/server/hub-act-ask.js: `hub_act_denied` — the list says nobody / the user denied / the quiet window; `ask_expired` — the user's card got
// no answer in 60 s; `ask_unfiled` — the card could not be filed), the device's allow list judged on the hub (`op-not-allowed`, src/device-policy.js;
// the hub's half runs first — the device's own answer with that code, a list changed since its hello, is read the same way). Nothing went to the
// Mac: no try (round 8 marked every throw of fsWriteStream `sent` — eight paced refusals by the owner's gate shut the host for the hub's life, and the
// Developer ID build never went once the owner allowed it). Every OTHER failure came after the link took the push — the open refused at the Mac's
// door («another transfer is writing», `op-refused` without a code, `link_lost`, a timeout), the bytes stalled (`stalled`), the count wrong
// (`size_changed`), the prebuilt vanished under the push — a DELIVERY: the try is spent. A CODE, never a message's words, says which.
const PUSH_REFUSED_ON_HUB = new Set(['host_needs_daemon', 'act_without_by', 'hub_act_denied', 'ask_expired', 'ask_unfiled', 'op-not-allowed']);
/** Push this hub's prebuilt Mac screen helper to an agent that asked for `need` = { dir, version } (its no_helper / helper_unsigned
 *  answer — or, with `signedOnly`, its offer's `helper.wantSigned`: lane apple-signing). THE RULE (round 4, acceptance r3): the hub
 *  pushes the prebuilt it HAS — it can always name the bytes by sha256; the release record's `helper` row and the identity record
 *  (`.identity.json`, scripts/build-mac-helper.sh) are ADDITIONAL checks WHEN PRESENT (version and sha256 must name this very file,
 *  else refused by name), their absence is no refusal — the device judges the bytes by codesign under its pins; `signedOnly` pushes a
 *  Developer ID build only (the signed row's kind when there is a row, the record's otherwise — round 5). Round 5 (acceptance r4):
 *  a record that is THERE but cannot be read, or names no sha256, is refused by name (never taken for absent); the bytes SENT are
 *  hashed as they go and must be the bytes named (a prebuilt replaced under the push ⇒ refused by name, the Mac asked to drop them);
 *  a device-sent `until` outside Date's range is tolerated. Round 6 (acceptance r5): the row's kind is read only once the row is shown to name
 *  THIS prebuilt; the push stream's error is heard from its first instant and the stream destroyed on every way out (a prebuilt that vanished
 *  between the digest and the open left the hub through uncaughtException; a push refused at open leaked its read fd). → { ok, size, sha256,
 *  identity, note } | { ok: false, code: 'no_helper' | 'helper_unsigned', error, held? (the sha256 the Mac still holds — these very bytes),
 *  hold? (the Mac's record the judge compared), until? (its door, when it named a legible one), sent? (true once the device link TOOK the push —
 *  bytes went, the open was refused at the Mac's door, the link dropped under it: the hub's try, rounds 8 + 9), refusedOnHub? (round 9: the device
 *  client refused before the channel opened — its code, PUSH_REFUSED_ON_HUB; nothing went, no `sent`), looked? (`lookOnly`: the digest compared,
 *  nothing sent) }.
 *  Round 8 (acceptance r7): `lookOnly` digests and compares against the Mac's hold and sends nothing — start()'s look at bytes the Mac newly
 *  names (the push keeps its pacing). */
async function pushMacHelper(dm, need, helpersDir = HELPERS_DIR, { signedOnly = false, manifestFile = MANIFEST_COPY, lookOnly = false } = {}) {
  const bin = path.join(helpersDir, 'vibespace-screen');
  let have = null, st = null, ident = null, identBad = null, row = null;
  try { have = fs.readFileSync(bin + '.version', 'utf8').trim(); st = fs.statSync(bin); } catch { return { ok: false, code: 'no_helper', error: 'this hub has no prebuilt Mac screen helper (data/bin/helpers/vibespace-screen)' }; }
  let identText = null; // round 5: ABSENT (no file) ≠ UNREADABLE (a file that is not a JSON object: truncated, null, an array)
  try { identText = fs.readFileSync(bin + '.identity.json', 'utf8'); } catch (e) { identBad = e && e.code === 'ENOENT' ? null : String((e && e.message) || e).slice(0, 120); }
  if (identText !== null) {
    try { ident = JSON.parse(identText); } catch (e) { identBad = String((e && e.message) || e).slice(0, 120); }
    if (identBad === null && (ident === null || typeof ident !== 'object' || Array.isArray(ident))) { identBad = `not a JSON object (${ident === null ? 'null' : Array.isArray(ident) ? 'an array' : typeof ident})`; ident = null; }
  }
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); row = manifest && manifest.helper && typeof manifest.helper === 'object' ? manifest.helper : null; } catch { manifest = null; row = null; }
  if (!need || !/^[A-Za-z0-9._-]{1,40}$/.test(String(need.version || '')) || !/^\/[^\0]{1,400}$/.test(String(need.dir || ''))) return { ok: false, code: 'no_helper', error: 'the agent did not say where its helper goes' };
  if (have !== need.version) return { ok: false, code: 'no_helper', error: `this hub's prebuilt Mac screen helper is ${have}; the Mac's agent needs ${need.version}` };
  const refuse = (error) => ({ ok: false, code: 'helper_unsigned', error });
  // ROUND 4 (acceptance r3 M1 + M2) — THE RULE: the hub pushes the prebuilt it HAS (the bytes are always named, by sha256). The signed
  // release's `helper` row and the identity record are ADDITIONAL checks WHEN PRESENT — each must name this very prebuilt (version
  // AND sha256), else refused by name; their ABSENCE is no refusal (every release signed on the Linux release machine carries no
  // row; the mac-helper workflow's release assets carried no identity record before 2.369.363): the words say «unsigned prebuilt —
  // the device judges it», and the Mac judges the bytes by codesign under its pins exactly as before. Four roads: test-stream-mac §6.
  // ROUND 5 (acceptance r4): a record that EXISTS but cannot be read is not «absent» — refused by name (808126df3 did; round 4 pushed with words that said no record); one that names no sha256 is malformed
  if (identBad !== null) return refuse(`this hub's prebuilt Mac screen helper has an identity record that cannot be read (vibespace-screen.identity.json unreadable: ${identBad}) — nothing pushed`);
  const hasIdent = ident !== null;
  if (hasIdent && !SHA256_RE.test(String(ident.sha256 || ''))) return refuse('this hub\'s prebuilt Mac screen helper has a malformed identity record (vibespace-screen.identity.json names no sha256) — nothing pushed');
  if (hasIdent && ident.version != null && ident.version !== have) return refuse(`this hub's prebuilt Mac screen helper says ${have} but its identity record is for ${String(ident.version).slice(0, 40)} — a stale pair, nothing pushed`);
  let sha256 = null;
  try { sha256 = await digestOf(bin); } catch (e) { return { ok: false, code: 'no_helper', error: `this hub's prebuilt Mac screen helper could not be read (${(e && e.code) || e})` }; }
  if (hasIdent && ident.sha256 !== sha256) return refuse(`this hub's prebuilt Mac screen helper is not the one its identity record describes (sha256 ${sha256.slice(0, 12)}… vs ${String(ident.sha256).slice(0, 12)}…) — nothing pushed`);
  if (row) { // the ONE refusal the r1 brief asked for: a release row that names another version, or other bytes than the file
    if (row.version !== have) return refuse(`the signed release names Mac screen helper ${String(row.version).slice(0, 40)}, this hub's prebuilt is ${have} — nothing pushed`);
    if (row.sha256 !== sha256) return refuse(`this hub's prebuilt Mac screen helper is not the release's (sha256 ${sha256.slice(0, 12)}… vs the manifest's ${String(row.sha256).slice(0, 12)}…) — nothing pushed`);
  }
  // ROUND 6 (acceptance r5): the row's kind is read only once the row is shown (above) to name THIS prebuilt — a stale row's kind was said of these bytes («adhoc per the signed release» for a release that never named them)
  const rowKind = row && row.identity && typeof row.identity === 'object' && typeof row.identity.kind === 'string' ? row.identity.kind.slice(0, 20) : null; // round 5: the SIGNED row's kind wins over the unsigned record's
  const kind = rowKind || (hasIdent && typeof ident.kind === 'string' ? ident.kind.slice(0, 20) : null);
  if (signedOnly && kind !== 'developer-id') return refuse(`this hub's prebuilt Mac screen helper is ${kind ? `${kind} (${rowKind ? 'per the signed release' : 'per its identity record'})` : 'of unrecorded identity (no vibespace-screen.identity.json beside it)'}, not a Developer ID build — the Mac keeps the helper it has`);
  const release = manifest && manifest.version ? ` ${String(manifest.version).slice(0, 20)}` : '';
  const note = row ? `named by the signed release${release} (sha256 ${sha256.slice(0, 12)}…)` : `unsigned prebuilt (sha256 ${sha256.slice(0, 12)}…; ${manifest ? `the signed release${release} names no Mac screen helper` : 'no signed release record on this hub'}) — the device judges it${hasIdent ? '' : '; its identity is unverified here (no vibespace-screen.identity.json beside it)'}`;
  // round 3 (acceptance r1 M1): the Mac said which bytes it refused / still judges — those are never sent again (a DIFFERENT prebuilt is judged afresh there);
  // round 4: a refusal born of unanswered codesign runs names when the Mac judges those bytes again (`until`) — the words say so;
  // round 5: a time outside Date's range (a device's say-so) is «later», never a throw (it failed the whole stream start)
  const held = (o) => !!(o && typeof o === 'object' && o.sha256 === sha256);
  const untilMs = need.refused ? timeOf(need.refused.until) : null;
  const again = untilMs !== null ? ` before ${new Date(untilMs).toISOString()} or the agent's next start` : need.refused && need.refused.until !== undefined ? ', tried again later or at the agent\'s next start (the Mac named no legible time)' : '';
  if (held(need.refused)) return { ...refuse(`the Mac refused this very prebuilt (sha256 ${sha256.slice(0, 12)}…): ${String(need.refused.why || need.refused.code || '').slice(0, 240)} — not sent again${again} (a different prebuilt would be judged afresh)`), held: sha256, hold: need.refused, ...(untilMs !== null ? { until: untilMs } : {}) }; // `held` (round 6): the bytes the Mac holds — start()'s record of them when the hold was told of by a refusal it did not know of (another hub life's push)
  if (held(need.pending)) return { ok: false, code: 'no_helper', error: `the Mac holds this prebuilt already and judges it at its next check (codesign answered nothing ${pendingTries(need.pending) ?? '?'} of 3 times so far; the next check is try ${pendingNext(need.pending)} of 3) — not sent again`, held: sha256, hold: need.pending }; // `hold` (round 7): the Mac's record the judge compared — start()'s words; round 9: the agent's `tries` counts the runs that went unanswered (src/agentd/stream-mac.js), the next check is one more
  if (lookOnly) return { ok: false, code: 'no_helper', error: `the Mac's hold (sha256 ${[need.refused, need.pending].map((o) => (o && typeof o === 'object' && typeof o.sha256 === 'string' ? `${o.sha256.slice(0, 12)}…` : null)).filter(Boolean).join(', ')}) is not on this hub's prebuilt (sha256 ${sha256.slice(0, 12)}…)`, looked: sha256 }; // round 8: a look only — start() asked whether the Mac holds THESE bytes; it does not, and the push keeps its pacing
  if (!dm || typeof dm.fsWriteStream !== 'function') return { ok: false, code: 'no_helper', error: 'the Mac\'s agent cannot take a pushed file' };
  // ROUND 5 (acceptance r4): the bytes SENT are hashed as they go — the digest above named them, the push must send those very bytes
  // (a prebuilt replaced under the push — an operator's drop into data/bin/helpers/ — sent bytes nobody checked under the old name)
  const dst = `${need.dir}/vibespace-screen-${need.version}`;
  const sentHash = crypto.createHash('sha256');
  const tee = new Transform({ transform(chunk, _enc, cb) { sentHash.update(chunk); cb(null, chunk); } });
  // ROUND 6 (acceptance r5): the read's error is HEARD from the first instant — a prebuilt that vanished between the digest and the open (an
  // operator's rm, then the copy) errored while the device link was still asking (connect, the hub-act-ask gate, the open), with nobody listening
  // on the tee yet: the hub left through uncaughtException. And the stream is destroyed on every way out (ok, refused, thrown): a push refused
  // at open («another transfer is writing», a gate's no, an old daemon) kept the prebuilt's read fd for the hub's life.
  let readErr = null;
  const src = fs.createReadStream(bin).on('error', (e) => { readErr = readErr || e; tee.destroy(e); });
  tee.on('error', (e) => { readErr = readErr || e; });
  src.pipe(tee);
  let pushErr = null;
  try { await dm.fsWriteStream(dst, { source: tee, size: st.size, overwrite: true, by: 'system:desktop-webrtc' }); } catch (e) { pushErr = e || new Error('the push failed'); } finally { src.destroy(); tee.destroy(); }
  const onHub = pushErr !== null && PUSH_REFUSED_ON_HUB.has(pushErr.code); // round 9 (acceptance r8): the device client refused BEFORE the channel opened — the owner's gate, the allow list, no `by`, an old agent: nothing went to the Mac, the hub's try is not spent (the bound counts deliveries); start() says it once
  if (onHub) return { ok: false, code: 'no_helper', error: `this hub refused the push before the device link opened (${pushErr.code}: ${String(pushErr.message || pushErr).slice(0, 240)})`, refusedOnHub: pushErr.code };
  if (readErr) return { ...refuse(`this hub's prebuilt Mac screen helper vanished under the push (prebuilt vanished: ${String((readErr && readErr.code) || (readErr && readErr.message) || readErr).slice(0, 80)}) — nothing landed in full (the Mac's agent drops a part); what the hub has when a push is next tried is judged afresh`), sent: true }; // `sent` (round 8): the device link took the push — the hub's try is spent, whatever came of it (round 9: a gate that refused it first is `refusedOnHub`, above)
  if (pushErr) return { ok: false, code: 'no_helper', error: `the prebuilt helper did not reach the Mac (${(pushErr && pushErr.message) || pushErr})`, sent: true }; // the open refused at the Mac's door, the link dropped or stalled under the bytes, the count wrong: the link took the push — a delivery (round 9)
  const sent = sentHash.digest('hex');
  if (sent !== sha256) {
    let dropped = false;
    if (typeof dm.fsRm === 'function') { try { await dm.fsRm(dst, false, { by: 'system:desktop-webrtc' }); dropped = true; } catch { /* the Mac judges what it holds by codesign at its next check, as any pushed file */ } }
    return { ...refuse(`this hub's prebuilt Mac screen helper changed under the push: the bytes sent (sha256 ${sent.slice(0, 12)}…) are not the ones named (sha256 ${sha256.slice(0, 12)}…) — ${dropped ? 'the Mac dropped them' : 'the Mac judges what it holds by codesign at its next check'}; what the hub has when a push is next tried is judged afresh`), sent: true }; // round 6: «…at the next stream start» promised what the signed road's machine does not do (its next try is SIGNED_RETRY_MS away)
  }
  return { ok: true, size: st.size, sha256, identity: kind, note };
}

function create({ access, log = console, now = Date.now, idleMs = L.idleMs, goneMs = L.goneMs, sweepMs = 5000, ips = hubIps, pollMaxMs = L.pollMaxMs, relay = true, direct = true, udpLeg = true, legMute = () => false, elect = SM.legElect, helpersDir = HELPERS_DIR, handover = null } = {}) {
  const sessions = new Map(); // key → session
  const signedPushed = new Map(); // lane apple-signing: hostId → { n, busy, dueAt, held, sent, seen, seenAt, said } — the signed prebuilt is pushed once per machine, then again (round 5) when the Mac's hold on those bytes (a refusal with a door, a judgment in progress) is GONE from its answer — its door opened: `until` passed or the agent started anew — else at the first stream start after SIGNED_RETRY_MS, while it still wants a signed build; SIGNED_PUSH_MAX pushes SENT per machine per hub life (round 8: a refusal on the hub's side — no prebuilt, a wrong kind, a record that names other bytes — spends none; round 5 counted them, and eight such looks shut the host for the hub's life); round 6: the entry is CLAIMED synchronously before the push's await (`busy`) — stream starts in flight together for one Mac push once; round 7 (acceptance r6): a hold is a fact about the BYTES the Mac names — judged by pushMacHelper's ONE comparison against the prebuilt the hub has NOW (`held` = those bytes, or null): a different prebuilt in data/bin/helpers/ goes at once, the same bytes wait for the hold to go; `seen` = the bytes the Mac's answer named at the hub's last look (a hold new to the hub is looked at at once, a hold on bytes the hub never had is paced by dueAt); round 8 (acceptance r7): that look SENDS NOTHING (`lookOnly`) and comes at most once per SIGNED_RETRY_MS (`seenAt`) — round 7 pushed at every start while a Mac paired to several hubs named ever-other bytes; `sent` = the bytes this hub last sent (the judge named them): the Mac naming them is a hold on the hub's OWN bytes — looked at at every start, a corrected prebuilt goes at once; `said` = what the last look came to (a hold's bytes + kind, a refusal's words) — told once, again when it changes; round 9 (acceptance r8): a try is a DELIVERY — pushMacHelper's `sent` only once the device link took the push; the device client's refusals before the channel opened (the owner's «Hub automation» gate, the allow list, no `by`, an old agent — a stable code, PUSH_REFUSED_ON_HUB) are the hub's own: no try, said once, the hold kept (round 8 counted every throw of fsWriteStream)
  const ended = (s, why) => { if (s.endNoted) return; s.endNoted = true; try { handover?.ended?.(s.key, why, s.hostId); } catch (e) { log.warn?.(`[stream] the hand-over did not hear ${s.key} end (${e && e.message})`); } };
  const keyOf = () => 'st' + now().toString(36) + Math.random().toString(36).slice(2, 10);
  const wake = (s) => { s.seq++; for (const f of s.waiters.splice(0)) { try { f(); } catch { /* gone */ } } };
  const relayFacts = (s) => {
    const r = s.relay; if (!r) return null;
    const g = r.leg;
    return { port: r.port, up: r.up, down: r.down, dropped: r.dropped, via: legUsable(s, r) ? 'udp' : 'link',
      leg: g ? { addr: g.addr ? `${g.addr.ip}:${g.addr.port}` : null, pings: g.pings, forged: g.forged, replayed: g.replayed, stray: g.stray, up: g.up, down: g.down, heardMsAgo: g.heardAt ? now() - g.heardAt : null, quiet: g.quiet, held: g.held, changes: g.changes.slice() } : null };
  };
  const view = (s) => ({ key: s.key, sid: s.sid, hostId: s.hostId, codec: s.codec, source: s.source, windowId: s.windowId, startedAt: s.startedAt, state: s.state, stats: s.stats, path: s.path, ended: s.ended, relay: relayFacts(s) });

  function onPush(s, m) {
    if (m.op === 'stream-ice') {
      const c = m.candidate;
      if (c && s.direct === false && isHostCandidate(c.candidate)) return;
      s.cands.push(c || null);
      wake(s);
      return;
    }
    if (m.op === 'stream-stats') {
      if (m.stats) s.stats = m.stats;
      if (m.state) s.state = m.state;
      if (m.ended && !s.ended) { s.ended = m.ended; closeRelay(s); ended(s, m.ended); }
      wake(s);
    }
  }

  /** THE ELECTION's one door (src/stream-model.js legElect): every signal of either path goes through it; a change is
   *  recorded, logged and wakes the page's poll. */
  function vote(s, g, type) {
    const e = elect({ via: g.via, aliveAt: g.aliveAt, dataAt: g.dataAt }, { type, at: now() });
    g.aliveAt = e.aliveAt; g.dataAt = e.dataAt;
    if (!e.changed) return;
    g.via = e.via;
    g.changes.push({ at: now(), via: e.via, why: e.why }); if (g.changes.length > 8) g.changes.shift();
    log.log?.(`[stream] ${s.hostId}: session ${s.sid || '(being offered)'} relay via ${e.via === 'udp' ? `the daemon's udp leg ${g.addr.ip}:${g.addr.port}` : 'the device link'} (${e.why})`);
    wake(s);
  }
  /** The relay's leg is the way to the daemon now: the election took it and has not judged it dead. */
  const legUsable = (s, r) => { if (!(r && r.leg && r.leg.addr)) return false; if (r.leg.via === 'udp') vote(s, r.leg, 'judge'); return r.leg.via === 'udp'; };
  /** A leg packet at the relay's port: the daemon's PING (→ PONG) or DATA (→ the browser that wrote first). */
  function onLeg(s, r, msg, rinfo) {
    const g = r.leg;
    if (!g) { r.dropped++; return; }
    const p = SM.legParse(msg, g.mac);
    if (p && p.type === 'ping') {
      const v = SM.legPingVerdict(g, p);
      if (!v.take) { g[v.code]++; r.dropped++; return; }
      if (legMute()) { r.dropped++; return; } // the suites' unreachable hub: the PING is never answered
      g.lastCounter = p.counter; g.pings++;
      g.addr = { ip: rinfo.address, port: rinfo.port }; g.heardAt = now();
      const pong = SM.legControl(SM.LEG.PONG, { counter: p.counter, nonce: p.nonce, mac: g.mac });
      try { r.sock.send(Buffer.from(pong), rinfo.port, rinfo.address); } catch { /* the next PING */ }
      if (p.flags & SM.LEG.UP) vote(s, g, 'up'); else { g.quiet++; vote(s, g, 'quiet'); }
      return;
    }
    if (p && p.type === 'data' && g.addr && rinfo.address === g.addr.ip && rinfo.port === g.addr.port) {
      g.heardAt = now(); vote(s, g, 'data');
      if (!r.peers.has(`${p.ip}:${p.port}`)) { r.dropped++; return; } // only to a peer that wrote first
      try { r.sock.send(Buffer.from(p.payload), p.port, p.ip); r.down++; g.down++; } catch { r.dropped++; }
      return;
    }
    if (p && p.type === 'data') g.stray++;
    r.dropped++;
  }
  /** The relay's ONE UDP socket, bound before the offer (its port and the leg's key ride `stream-offer`). */
  async function bindRelay(s) {
    const sock = dgram.createSocket('udp4');
    const r = { h: null, sock, peers: new Set(), stallUntil: 0, rest: new Uint8Array(0), up: 0, down: 0, dropped: 0, port: 0, leg: null };
    if (udpLeg) {
      const key = crypto.randomBytes(32); // SM.LEG.keyBytes — memory only (test-key-file-law RANDOM32); it reaches the daemon over the device link
      r.leg = { key, mac: (b) => crypto.createHmac('sha256', key).update(b).digest().subarray(0, SM.LEG.macBytes), addr: null, lastCounter: 0, heardAt: 0, aliveAt: 0, dataAt: 0, via: 'link', pings: 0, forged: 0, replayed: 0, stray: 0, up: 0, down: 0, quiet: 0, held: 0, changes: [] };
    }
    sock.on('error', (e) => { log.warn?.(`[stream] relay ${s.key}: ${e && e.message}`); closeRelay(s); });
    sock.on('message', (msg, rinfo) => {
      if (SM.isLegPacket(msg)) { onLeg(s, r, msg, rinfo); return; }
      const peer = `${rinfo.address}:${rinfo.port}`;
      if (!r.peers.has(peer)) { if (r.peers.size >= L.relayMaxPeers) { r.dropped++; return; } r.peers.add(peer); }
      if (legUsable(s, r)) {
        const pkt = SM.legData(rinfo.address, rinfo.port, msg);
        if (!pkt) { r.dropped++; return; }
        try { sock.send(Buffer.from(pkt.buffer, pkt.byteOffset, pkt.length), r.leg.addr.port, r.leg.addr.ip); r.up++; r.leg.up++; } catch { r.dropped++; }
        return;
      }
      const h = r.h;
      if (!h || now() < r.stallUntil) { r.dropped++; return; }
      const fr = SM.relayFrame(rinfo.address, rinfo.port, msg);
      if (!fr) { r.dropped++; return; }
      let more = true;
      try { more = h.write(Buffer.from(fr.buffer, fr.byteOffset, fr.length)); } catch { closeRelay(s); return; }
      r.up++;
      if (more === false) r.stallUntil = now() + STALL_MS;
    });
    await new Promise((res, rej) => { sock.once('error', rej); sock.bind(0, () => { sock.removeListener('error', rej); res(); }); });
    r.port = sock.address().port;
    s.relay = r;
    return r;
  }
  /** The device link's half: ONE tcpForward to the agent's relay port, framed datagrams both ways. */
  async function attachLink(s, r, relayPort) {
    const h = await s.dm.tcpForward(relayPort);
    if (s.relay !== r) { try { h.close(); } catch { } return; }
    r.h = h;
    h.onData = (d) => {
      const all = new Uint8Array(r.rest.length + d.length); all.set(r.rest); all.set(d, r.rest.length);
      const u = SM.relayUnframe(all);
      if (u.bad) { closeRelay(s); return; }
      r.rest = new Uint8Array(u.rest);
      if (u.frames.length && r.leg) { if (r.leg.via === 'udp') r.leg.held += u.frames.length; vote(s, r.leg, 'link'); } // counted, never obeyed (the election)
      for (const f of u.frames) { if (!r.peers.has(`${f.ip}:${f.port}`)) continue; r.sock.send(Buffer.from(f.payload), f.port, f.ip); r.down++; } // only to a peer that wrote first
    };
    h.onClose = () => { if (s.relay === r) { r.h = null; if (!r.leg) closeRelay(s); } };
  }
  function closeRelay(s) {
    const r = s.relay; if (!r) return;
    s.relay = null;
    try { r.sock.close(); } catch { /* gone */ }
    try { r.h && r.h.close(); } catch { /* gone */ }
  }

  /** The rung, then the offer. → { take: false, code, why } | { take: true, key, sid, offer, source, codec, seq } */
  async function start(hostId, { maxKbps = null, source = null, fp16 = false, hdr = false, after = null, mic = false, audio = false } = {}) {
    if (!access || typeof access.streamRung !== 'function') throw named('host_unavailable', 'the desktop access layer is not wired on this instance');
    const src = SM.streamSourceOf(source);
    if (source != null && !src) return { take: false, code: 'bad_source', why: 'the stream names a display or a window by its id' };
    let v;
    try { v = src ? await access.streamRung(hostId, { want: src.kind }) : await access.streamRung(hostId); } catch (e) { return { take: false, code: (e && e.code) || 'host_unavailable', why: String((e && e.message) || e) }; }
    if (!v.take) return { take: false, code: v.code, why: v.why };
    const key = keyOf();
    const s = { key, hostId, dm: v.dm, platform: v.platform || null, sid: null, source: null, windowId: src && src.kind === 'window' ? String(src.id) : null, codec: null, startedAt: now(), state: 'new', stats: null, path: null, ended: null, cands: [], seq: 0, waiters: [], lastPoll: now(), goneTimer: null, relay: null, direct, relayLines: [] };
    sessions.set(key, s);
    if (relay) { try { await bindRelay(s); } catch (e) { log.warn?.(`[stream] ${hostId}: the relay did not open (${e && e.message}) — direct only`); } }
    // the leg's spec rides the offer: the relay's port, the session's key (over the device link only) and this hub's addresses
    const relayLeg = s.relay && s.relay.leg ? { port: s.relay.port, key: s.relay.leg.key.toString('base64'), hosts: ips().filter((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip))).slice(0, L.legTargets) } : null;
    let r;
    const sourceId = v.sourceId != null ? v.sourceId : src ? src.id : null; // the verdict's own (a fake source's file), else the page's choice
    const offer = () => v.dm.streamOffer({ sourceKind: v.source, sourceId, maxKbps, relay, ...(src && src.share ? { share: src.share } : {}), ...(relayLeg ? { relayLeg } : {}), ...(v.source === 'window' && fp16 ? { fp16: true } : {}), ...(v.source === 'screen' && hdr === true ? { hdr: true } : {}), ...(mic === true ? { mic: true } : {}), ...(audio === true ? { audio: true } : {}) }, { onPush: (m) => onPush(s, m) }); // fp16: a Windows window's FP16 road (lane stream-p2w-build); hdr: lane stream-hdr-passthrough
    try {
      r = await offer();
      if (r && !r.ok && (r.code === 'no_helper' || r.code === 'helper_unsigned') && r.helper) { // a Mac without its screen helper — or one that refused a push (round 3: a DIFFERENT prebuilt is judged afresh there; the same one is never re-sent, the why rides the answer): this hub's prebuilt, then once more
        const p = await pushMacHelper(v.dm, r.helper, helpersDir);
        log.log?.(`[stream] ${hostId}: the Mac ${r.code === 'helper_unsigned' ? 'refused a screen helper' : 'has no screen helper'} ${r.helper.version} — ${p.ok ? `pushed this hub's prebuilt (${p.size} bytes; ${p.note})` : p.error}`);
        if (p.ok) r = await offer(); else r = { ...r, error: `${r.error} — ${p.error}` };
      }
      if (r && r.ok && r.helper && r.helper.wantSigned === true) { // lane apple-signing: the signed prebuilt wins over an ad-hoc build — pushed once per machine, then again when the Mac's door opens (round 5: a refusal born of unanswered codesign runs EXPIRES — the push must come again for the agent's «tried again at» to be true); round 6 (acceptance r5): the host is CLAIMED before the await (c9a6b6ede did; round 5 recorded the push after it — starts in flight together each pushed, the bound counted per wave); round 7 (acceptance r6 M1): the hold is judged against the prebuilt the hub has NOW, by pushMacHelper's one comparison — round 6 judged it against the bytes this hub pushed BEFORE (`prev.sha256`) and looked no further while the Mac named them: a corrected prebuilt dropped into data/bin/helpers/ was never pushed in that hub's life (the base pushed it after SIGNED_RETRY_MS); round 8 (acceptance r7): a look at bytes the Mac newly names SENDS NOTHING and comes once per SIGNED_RETRY_MS (round 7 pushed at every start while the answer named ever-other bytes — a Mac paired to several hubs — and spent the bound in minutes); a try is spent by a push SENT, never by a refusal on the hub's side (round 5 counted those: eight looks at an ad-hoc prebuilt under a Mac that wants a signed one shut the host for the hub's life, the Developer ID cut dropped later never went); the hold line names the door by the refusal's kind; the bytes this hub SENT are its own (the Mac naming them ⇒ a look at every start); round 9 (acceptance r8): a try is a DELIVERY — a refusal by the device client before the channel opened (the owner's gate: eight paced refusals shut the host for the hub's life on round 8) spends none; the pending door names the NEXT run; the push line promises no re-push at dueAt while the Mac names a hold on these bytes
        const prev = signedPushed.get(hostId) || null;
        const sha = (o) => (o && typeof o === 'object' && typeof o.sha256 === 'string' ? o.sha256 : null);
        const named = [sha(r.helper.refused), sha(r.helper.pending)].filter(Boolean).join('+') || null; // the bytes the Mac's answer holds (a refusal, a judgment in progress) — WHICH prebuilt they are is pushMacHelper's to say
        const own = (x) => typeof x === 'string' && named !== null && named.split('+').includes(x); // the Mac's answer names these bytes
        const t = now();
        // THE LOOK (round 8): the first stream start; every start while the Mac holds this hub's OWN bytes — `held` (the judge found the prebuilt the hub has held) or `sent` (the bytes this hub sent, named by the judge at the push): the door's check and the corrected prebuilt's road, free; the paced start (dueAt — round 5); and a LOOK ONLY (digest + compare, nothing sent) when the Mac's answer names bytes the hub has not looked at (`seen`), at most once per SIGNED_RETRY_MS (`seenAt`) — a push of bytes the Mac does not hold is paced, never per start
        const due = !prev || prev.held !== null || own(prev.sent) || t >= prev.dueAt;
        const fresh = prev !== null && named !== null && named !== prev.seen && (prev.seenAt === null || t >= prev.seenAt + SIGNED_RETRY_MS);
        if (!prev || (!prev.busy && prev.n < SIGNED_PUSH_MAX && (due || fresh))) {
          const claim = { n: prev ? prev.n : 0, busy: true, dueAt: prev ? prev.dueAt : t + SIGNED_RETRY_MS, held: prev ? prev.held : null, sent: prev ? prev.sent : null, seen: named, seenAt: due ? (prev ? prev.seenAt : null) : t, said: prev ? prev.said : null }; // THE CLAIM — synchronous, before the await: a start in flight for this Mac sees it and pushes nothing
          signedPushed.set(hostId, claim);
          let p;
          try { p = await pushMacHelper(v.dm, r.helper, helpersDir, { signedOnly: true, lookOnly: !due }); } finally { claim.busy = false; }
          const heldNow = !p.ok && typeof p.held === 'string' ? p.held : null; // the Mac holds the very bytes the hub has now (the judge's one comparison): nothing sent, no try spent — looked at again at the next start
          const went = p.ok || p.sent === true; // round 8: bytes went to the Mac (or were refused at its door) — the one thing that spends a try; a refusal on the hub's side spends none (the bound counts deliveries); round 9: pushMacHelper marks `sent` only once the device link took the push — a refusal before the channel opened (`refusedOnHub`) is a refusal on the hub's side like any other
          const n = claim.n + (went ? 1 : 0);
          const kind = heldNow === null ? null : p.hold && p.hold.tries != null ? 'pending' : p.hold && p.hold.until !== undefined ? 'unanswered' : 'verdict'; // the Mac's record: a judgment in progress; a refusal born of unanswered codesign runs (it has a door); a codesign verdict (it has none)
          const held = heldNow !== null ? heldNow : !went && own(claim.held) ? claim.held : null; // round 8: a look that sent nothing (a refusal on the hub's side — a drop half landed, a wrong-kind build) keeps the hold it knew of while the Mac's answer still names those bytes: the next start looks again
          const said = went ? null : heldNow !== null ? `held ${kind} ${heldNow}${kind === 'pending' ? ` ${pendingTries(p.hold)}` : ''}` : String(p.error || ''); // what this look came to — a hold (its bytes and kind; a judgment in progress with its count — round 9: told again when the count advances), a refusal (its words): told once, again when it changes
          signedPushed.set(hostId, { n, busy: false, dueAt: went || (heldNow === null && due) ? t + SIGNED_RETRY_MS : claim.dueAt, held, sent: p.ok ? p.sha256 : claim.sent, seen: named, seenAt: claim.seenAt, said });
          if (heldNow !== null) {
            if (claim.said !== said) { // noted once per hold — its bytes and its kind (a judgment in progress that became a verdict is told again, with the verdict's door)
              const hold = p.hold && typeof p.hold === 'object' ? p.hold : {};
              const why = String(hold.why || (kind === 'pending' ? `judging it (codesign answered nothing ${pendingTries(hold) ?? '?'} of 3 times so far)` : hold.code || '')).slice(0, 160); // round 9: the agent's `tries` = the runs that went unanswered
              // round 8: the door BY THE REFUSAL'S KIND — round 7 said «until passed, or the agent's next start» of a codesign verdict too, and neither opens it (the agent keeps a verdict across its restarts: src/agentd/stream-mac.js own())
              const door = kind === 'pending' ? `judged at the Mac's next check (try ${pendingNext(hold)} of 3${pendingNext(hold) === 3 ? ', the last' : ''}) — taken then, or refused with that refusal's own door` : kind === 'unanswered' ? `pushed again when that is over (its door: ${p.until ? `\`until\` ${new Date(p.until).toISOString()} passed` : 'its `until` passed (a time the Mac named illegibly)'}, or the agent's next start)` : `not sent again while that verdict stands (its doors: an agent upgrade or another helper version — a codesign verdict outlives the agent's restarts)`;
              log.log?.(`[stream] ${hostId}: the Mac holds this hub's signed prebuilt (sha256 ${heldNow.slice(0, 12)}…): ${why} — ${door}; another prebuilt in this hub's helpers dir goes at the next stream start (${SIGNED_PUSH_MAX - n} of ${SIGNED_PUSH_MAX} tries left)`);
            }
          } else if (went) {
            // round 9 (acceptance r8): the words say what the machine does — the Mac judges these bytes at its next check; while its answer names a hold on them they are NOT sent again (the hold is looked at at every start, free; the hold line names its door; a corrected prebuilt goes at that start), and only with no hold named are they pushed again at dueAt (round 5's law). Round 8 promised «pushed again at the first stream start after <ISO>» of a push the Mac then held for good — a push that never came
            const then = n >= SIGNED_PUSH_MAX ? `not again in this hub's life (${SIGNED_PUSH_MAX} tries)` : `try ${n} of ${SIGNED_PUSH_MAX} — not sent again while the Mac's answer names its hold on these bytes (the hold line at the next stream start names that hold's door; another prebuilt in this hub's helpers dir goes at that start); with no hold named, pushed again at the first stream start after ${new Date(t + SIGNED_RETRY_MS).toISOString()} while the Mac still wants a signed build`;
            log.log?.(`[stream] ${hostId}: the Mac's screen helper is ${r.helper.identity ? r.helper.identity.kind : 'unjudged'} — ${p.ok ? `pushed this hub's signed prebuilt (${p.size} bytes; ${p.note}); the agent takes it at its next check (one last Screen Recording re-grant)` : p.error}; ${then}`);
          } else if (claim.said !== said) { // round 8: a refusal on the hub's side — nothing sent, no try spent — says itself once; the next line when its words change
            const again = held !== null ? `at every stream start while the Mac holds the prebuilt this hub had (sha256 ${held.slice(0, 12)}…)` : `at the first stream start after ${new Date(due ? t + SIGNED_RETRY_MS : claim.dueAt).toISOString()}, then once per ${SIGNED_RETRY_MS / 60000} min, while the Mac still wants a signed build`;
            log.log?.(`[stream] ${hostId}: the Mac's screen helper is ${r.helper.identity ? r.helper.identity.kind : 'unjudged'} — ${p.error}; nothing sent, no try spent (${n} of ${SIGNED_PUSH_MAX} spent); looked at again ${again} (said once — the next line when this answer changes)`);
          }
        } else if (prev.n >= SIGNED_PUSH_MAX && named !== null && named !== prev.seen && (prev.seenAt === null || t >= prev.seenAt + SIGNED_RETRY_MS)) { // after the bound the hub looks no more — a hold the Mac names is noted once per SIGNED_RETRY_MS (round 8: round 7 noted every change, a line per start under an answer that rotates), nothing promised (round 6's words)
          signedPushed.set(hostId, { ...prev, seen: named, seenAt: t });
          const hold = r.helper.refused && typeof r.helper.refused === 'object' ? r.helper.refused : r.helper.pending || {};
          log.log?.(`[stream] ${hostId}: the Mac holds a signed prebuilt (sha256 ${named.slice(0, 12)}…): ${String(hold.why || (hold.tries != null ? `judging it (codesign answered nothing ${pendingTries(hold) ?? '?'} of 3 times so far)` : hold.code || '')).slice(0, 160)} — not pushed again in this hub's life (${SIGNED_PUSH_MAX} tries spent)`);
        }
      }
    } catch (e) {
      closeRelay(s); sessions.delete(key);
      return { take: false, code: (e && e.code) === 'host_needs_daemon' ? 'agent_too_old' : 'offer_failed', why: String((e && e.message) || e) };
    }
    if (!r || !r.ok) { closeRelay(s); sessions.delete(key); return { take: false, code: (r && r.code) || 'offer_failed', why: (r && r.error) || 'the machine did not offer a stream', ...(r && Number.isInteger(r.cap) ? { live: r.live, cap: r.cap, displays: r.displays } : {}) }; } // lane desktop-display-modes: a full machine names its count
    s.sid = r.sid; s.source = r.source || null; s.codec = r.codec || null;
    if (s.relay && r.relayPort) {
      try { await attachLink(s, s.relay, r.relayPort); } catch (e) { log.warn?.(`[stream] ${hostId}: the relay's device-link half did not open (${e && e.message})${s.relay.leg ? ' — the udp leg only' : ' — direct only'}`); if (!s.relay.leg) closeRelay(s); }
    } else closeRelay(s); // an agent that offers no relay
    if (s.relay) s.relayLines = SM.relayCandidates(ips(), s.relay.port);
    const sdp = withRelay(direct === false ? stripHosts(r.offer.sdp) : r.offer.sdp, s.relayLines);
    try { handover?.started?.(key, hostId, after != null ? String(after) : null); } catch (e) { log.warn?.(`[stream] the hand-over did not hear ${key} start (${e && e.message})`); }
    log.log?.(`[stream] ${hostId}: session ${s.sid} offered (${v.source}${s.relay ? `, relay udp ${s.relay.port}${s.relay.leg ? ' + the daemon\'s udp leg asked' : ''}` : ''})`);
    return { take: true, key, sid: s.sid, offer: { type: 'offer', sdp }, source: s.source, codec: s.codec, seq: s.seq, platform: v.platform, mic: r.mic === true, audio: r.audio === true };
  }
  const sessionOf = (key) => { const s = sessions.get(String(key || '')); if (!s) throw named('not_found', 'that stream ended'); return s; };
  async function answer(key, sdp) {
    const s = sessionOf(key);
    if (typeof sdp !== 'string' || !sdp || sdp.length > 64 * 1024) throw named('bad-request', 'an SDP answer is a string of at most 64 KB');
    const r = await s.dm.streamAnswer(s.sid, { answer: { type: 'answer', sdp: s.direct === false ? stripHosts(sdp) : sdp } });
    if (!r || !r.ok) throw named((r && r.code) || 'answer_failed', (r && r.error) || 'the machine did not take the answer');
    return { ok: true };
  }
  async function candidate(key, cand) {
    const s = sessionOf(key);
    const c = cand && typeof cand === 'object' ? { candidate: String(cand.candidate || '').slice(0, 512), sdpMid: cand.sdpMid == null ? null : String(cand.sdpMid).slice(0, 32), sdpMLineIndex: Number.isInteger(cand.sdpMLineIndex) ? cand.sdpMLineIndex : null } : null;
    if (!c || !c.candidate) return { ok: true, skipped: 'end' };
    if (s.direct === false && isHostCandidate(c.candidate)) return { ok: true, skipped: 'host' };
    const r = await s.dm.streamAnswer(s.sid, { candidate: c });
    return { ok: !!(r && r.ok) };
  }
  async function restart(key) {
    const s = sessionOf(key);
    const r = await s.dm.streamOffer({ sid: s.sid, iceRestart: true }, { onPush: (m) => onPush(s, m) });
    if (!r || !r.ok) throw named((r && r.code) || 'restart_failed', (r && r.error) || 'the machine did not restart the stream');
    return { offer: { type: 'offer', sdp: withRelay(s.direct === false ? stripHosts(r.offer.sdp) : r.offer.sdp, s.relayLines) }, seq: s.seq };
  }
  /** lane speaker-passthrough-v1: the strip's 「声音」 → the agent's `stream-audio` (its capability is the client's gate). */
  async function sound(key, on) {
    const s = sessionOf(key);
    if (!s.sid) throw named('not_found', 'that stream has not started');
    const r = await s.dm.streamAudio(s.sid, { on: on === true });
    log.log?.(`[stream] ${s.hostId}: session ${s.sid} sound ${on === true ? 'on' : 'off'}${r && !r.ok ? ` — refused ${r.code}` : ''}`);
    return r;
  }
  async function poll(key, n = 0, seq = -1, waitMs = pollMaxMs) {
    const s = sessions.get(String(key || ''));
    if (!s) return { key, ended: 'not_found' };
    s.lastPoll = now(); clearTimeout(s.goneTimer); s.goneTimer = null; // a poll: the viewer is here
    if (s.seq <= seq && !s.ended) {
      await new Promise((res) => { const t = setTimeout(res, Math.max(0, Math.min(pollMaxMs, waitMs))); s.waiters.push(() => { clearTimeout(t); res(); }); });
      s.lastPoll = now();
    }
    const from = Math.max(0, Math.min(s.cands.length, Number(n) || 0));
    const ho = handover && typeof handover.factsOf === 'function' ? handover.factsOf(s.key, s.hostId) : null; // lane desktop-handover: the strip's lease words + the agent's pointer
    return { key, seq: s.seq, n: s.cands.length, cands: s.cands.slice(from), state: s.state, stats: s.stats, ended: s.ended, relay: relayFacts(s), ...(ho ? { handover: ho } : {}) };
  }
  /** The page's own read of its path (getStats — direct | relay) is told here so the record says it. */
  function notePath(key, p) { const s = sessions.get(String(key || '')); if (s && (p === 'direct' || p === 'relay')) s.path = p; }
  /** A long poll's connection closed before its answer: no new poll within goneMs ⇒ the viewer is gone, the stream stops. */
  function pollGone(key) {
    const s = sessions.get(String(key || ''));
    if (!s || s.ended) return;
    clearTimeout(s.goneTimer);
    s.goneTimer = setTimeout(() => { s.goneTimer = null; if (sessions.get(s.key) === s) stop(s.key, 'viewer_gone').catch(() => { }); }, goneMs);
    s.goneTimer.unref?.();
  }
  async function stop(key, why = 'stopped') {
    const s = sessions.get(String(key || ''));
    if (!s) return { stopped: false };
    sessions.delete(s.key);
    clearTimeout(s.goneTimer);
    s.ended = s.ended || why;
    closeRelay(s);
    wake(s);
    ended(s, why);
    let stopped = false;
    try { stopped = !!(s.sid && (await s.dm.streamStop(s.sid, { why })).stopped); } catch { stopped = false; }
    log.log?.(`[stream] ${s.hostId}: session ${s.sid} stopped (${why})`);
    return { stopped };
  }
  /** The picker's 停止: every session of `hostId` streaming the window `id` (whichever browser opened it). */
  async function stopWindow(hostId, id, why = 'stopped_in_list') {
    const keys = [...sessions.values()].filter((s) => s.hostId === hostId && s.windowId != null && s.windowId === String(id)).map((s) => s.key);
    const r = await Promise.all(keys.map((k) => stop(k, why)));
    return { ok: true, sessions: keys.length, stopped: r.filter((x) => x.stopped).length };
  }
  function facts(hostId) { return [...sessions.values()].filter((s) => !hostId || s.hostId === hostId).map(view); }
  /** lane desktop-handover: a LIVE session's way to its machine (the engine's ops ride its link and name its sid) | null */
  function device(key) { const s = sessions.get(String(key || '')); return s && !s.ended && s.sid ? { key: s.key, hostId: s.hostId, sid: s.sid, dm: s.dm, platform: s.platform, source: s.source, stats: s.stats, state: s.state } : null; }
  /** lane desktop-handover: the lease changed — the page's waiting long poll answers now (its strip redraws). */
  function nudge(key) { const s = sessions.get(String(key || '')); if (s) wake(s); }
  const sweep = setInterval(() => { for (const s of [...sessions.values()]) if (now() - s.lastPoll > idleMs) stop(s.key, 'idle').catch(() => { }); }, sweepMs);
  sweep.unref?.();
  function shutdown() { clearInterval(sweep); for (const s of [...sessions.values()]) stop(s.key, 'shutdown').catch(() => { }); }
  return { start, answer, candidate, restart, sound, poll, pollGone, notePath, stop, stopWindow, facts, device, nudge, shutdown };
}

module.exports = { create, hubIps, stripHosts, withRelay, pushMacHelper, HELPERS_DIR, MANIFEST_COPY, SIGNED_RETRY_MS, SIGNED_PUSH_MAX };
