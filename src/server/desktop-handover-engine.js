'use strict';
/**
 * THE MACHINE-DESKTOP HAND-OVER, the hub's half (ORCH; lane desktop-handover — the decisions are PURE src/desktop-handover.js).
 * The owner hands the machine-desktop window's LIVE STREAM of a paired machine to ONE agent conversation; the agent drives it
 * with `vibespace-window` verbs on `md-<hostId>` (src/routes/window-targets.js routes those handles here). Nothing new reaches
 * the machine but two device ops on THAT stream session (src/agentd/stream-host.js): `desktop-grab` (one still of its display)
 * and `desktop-input` (the agent's records into the session's own sink — the owner's data channel's twin).
 *
 *   · THE LEASE (in memory — a hub restart ends every stream, and with it every hand-over): one per machine, keyed by the window's
 *     stream key (desktop-webrtc's session). give / pause / resume / revoke are the OWNER's (people-only routes,
 *     src/routes/desktop-apps.js); the stream's end ends it (`hooks.ended` — the window's × = window_closed, any other end =
 *     stream_ended; the strip's display switch = rebinding, carried to the window's next stream by `hooks.started(after)`); the
 *     holder conversation not live for holderGraceMs = conversation_ended (the tick); the holder's own `detach` = agent_done
 *   · THE AGENT'S VERBS: list (rows handed to the caller), screenshot (desktop-grab), click --at / key / type / scroll
 *     (desktop-input; the records are src/desktop-handover.js's — the data channel's own shapes — at most handoverEventsMax an
 *     op: a longer act goes in chunks, the lease re-asked between them; the machine's `cancelled: owner_input` = the owner's own
 *     input cut it ⇒ the lease pauses, window_paused with what went in — fix r2), detach (hand it back),
 *     attach (says it is held — nothing to take: the owner gave it), snapshot (mode_pixels: a desktop has no tree here), watch
 *     (the owner's window IS the live view). Every verb re-asks the lease AFTER its await (a pause / revoke that landed while it
 *     waited stops it — window_paused / desktop_not_handed — never after it ran)
 *   · THE AUDIT: one line per verb and per lease change into data/window-audit.jsonl (the windows' file), `origin: 'machine'`:
 *     who (the holder's key), the verb, the point (a click), the chord, a type's LENGTH (never its text), ok / code
 *   · THE STRIP: hooks.factsOf(streamKey) answers the page's long poll — the holder's name, agent | user | rebinding, the agent's
 *     last point (the window draws it as the agent's pointer); every change nudges that poll
 */
const fs = require('fs');
const path = require('path');
const DH = require('../desktop-handover.js');
const DA = require('../device-acts.js'); // int315: the act's `by` = the agent holding the lease (lane device-act-audit)
const SM = require('../stream-model.js'); // STREAM_LIMITS.handoverEventsMax — the daemon's cap on one desktop-input op (fix r2)
const R = require('../window-reach.js');
const { addressableId } = require('../claude-lock-capture.js');
const { capsOf } = require('../backend-caps.js');

const AUDIT_FILE = 'window-audit.jsonl'; // the windows' audit file (src/server/window-targets-engine.js AUDIT_FILE)
const ORIGIN = 'machine';
const TICK_MS = 5000;
const NOTICE_MS = 60000; // how long the page still hears why a lease ended
const named = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);
const keysOf = (s, id) => (addressableId(s) ? R.callerKeys(s, id) : [`webui:${id}`]);

function create({ dataDir, activeSessions, log = console, now = Date.now, tickMs = TICK_MS, holderGraceMs = DH.LIMITS.holderGraceMs } = {}) {
  const sessionsMap = () => (typeof activeSessions === 'function' ? activeSessions() : activeSessions) || new Map();
  const leases = new Map(); // hostId → lease (src/desktop-handover.js leaseStep's shape + holderLostAt, dot)
  const notices = new Map(); // streamKey → { end, at, name } (the page hears why it ended)
  let webrtc = null;

  function audit(line) {
    if (!dataDir) return;
    try { fs.appendFileSync(path.join(dataDir, AUDIT_FILE), JSON.stringify({ at: now(), origin: ORIGIN, ...line }) + '\n'); }
    catch (e) { log.warn?.(`[handover] audit line not written: ${e.message}`); }
  }
  const nudge = (key) => { try { webrtc?.nudge?.(key); } catch { /* the page polls again */ } };
  /** One step of the state table; a change is nudged to the page, an end is audited + noticed. */
  function step(hostId, ev, auditLine = null) {
    const was = leases.get(hostId) || null;
    const r = DH.leaseStep(was, ev, now());
    if (!r.changed) return { lease: was, changed: false, end: null };
    if (r.lease) leases.set(hostId, { ...r.lease, holderLostAt: ev.type === 'give' ? null : was && was.holderLostAt, dot: ev.type === 'give' ? null : was && was.dot });
    else leases.delete(hostId);
    if (r.end && was) {
      notices.set(was.streamKey, { end: r.end, at: now(), name: was.holder.name });
      audit({ handle: was.handle, verb: 'lease-end', sessionKey: was.holder.key, by: ev.by || (r.end === 'agent_done' ? 'agent' : r.end === 'revoked' || r.end === 'replaced' ? 'user' : 'stream'), cause: r.end, heldMs: now() - was.since });
      log.log?.(`[handover] ${hostId}: the hand-over to ${was.holder.key} ended (${r.end})`);
      nudge(was.streamKey);
    }
    if (auditLine) audit(auditLine);
    const lease = leases.get(hostId) || null;
    if (lease) nudge(lease.streamKey);
    return { lease, changed: true, end: r.end };
  }

  // ── the stream's hooks (src/server/desktop-webrtc.js) ──
  const hooks = {
    ended(key, why, hostId) {
      const h = hostId != null ? String(hostId) : [...leases.values()].find((l) => l.streamKey === String(key))?.hostId;
      if (h == null || !leases.has(h)) return;
      step(h, { type: 'stream-ended', streamKey: String(key), why: String(why || ''), ...(why === 'shutdown' ? { by: 'hub' } : {}) }); // fix r2: the hub's own shutdown is audited by: hub
    },
    started(key, hostId, after) {
      const l = leases.get(String(hostId));
      if (!l || l.input !== 'rebinding' || after == null || String(after) !== l.streamKey) return;
      const dev = webrtc && webrtc.device ? webrtc.device(key) : null;
      const r = step(l.hostId, { type: 'rebind', streamKey: String(key), sid: dev ? dev.sid : null, display: dev && dev.source && dev.source.display != null ? dev.source.display : null });
      if (r.lease) audit({ handle: r.lease.handle, verb: 'lease-rebind', sessionKey: r.lease.holder.key, by: 'user', display: r.lease.display });
    },
    factsOf(key, hostId = null) { // verify r1 (B): EVERY stream of the machine hears its lease (the phone's window too) — `own` = this stream carries it
      const k = String(key || '');
      const l = [...leases.values()].find((x) => x.streamKey === k) || (hostId != null ? leases.get(String(hostId)) || null : null);
      if (l) return { ...DH.leaseView(l, now()), state: l.input, own: l.streamKey === k };
      const n = notices.get(k);
      return n && now() - n.at < NOTICE_MS ? { state: 'none', ended: n.end, at: n.at, name: n.name } : null;
    },
  };

  // ── the owner's side ──
  /** The live session a picker row names (`agent:<conversation id>`) → { key, webuiId, name } | a refusal. */
  function holderOf(principal) {
    const m = /^agent:([A-Za-z0-9._:-]{1,128})$/.exec(String(principal || ''));
    if (!m) throw named('bad-request', 'principal is agent:<conversation id> (the picker\'s row)');
    for (const [id, s] of sessionsMap()) {
      if (!s || !addressableId(s)) continue;
      if (addressableId(s) !== m[1]) continue;
      if (capsOf(s.backend || 'claude').terminalOnly) throw named('not_an_agent', 'a plain shell cannot drive a desktop — pick an agent conversation');
      return { key: R.sessionKeyOf(s, id), webuiId: id, name: s.name || s.webuiName || null };
    }
    throw named('no_conversation', 'that conversation is not live on this hub — open it, then hand the desktop over');
  }
  async function capsOfDevice(dev) {
    try { const c = await dev.dm.connect(); return (c && c.info && c.info.capabilities) || []; } catch { return []; }
  }
  async function give({ hostId, streamKey, principal }) {
    const host = String(hostId || '');
    const dev = webrtc && webrtc.device ? webrtc.device(streamKey) : null;
    if (!dev || dev.hostId !== host) throw named('stream_not_live', 'the window shows no live stream of that machine — a hand-over rides the window\'s stream (the VNC picture has no agent road)');
    if (dev.source && dev.source.kind === 'window') throw named('not_a_display', 'a hand-over is of the machine\'s display — this stream shows one window');
    const caps = await capsOfDevice(dev);
    if (!caps.includes('desktop-grab') || !caps.includes('desktop-input')) throw named('host_needs_update', 'the machine\'s agent predates the hand-over — it updates itself with the hub, then hand it over again');
    const holder = holderOf(principal);
    const display = dev.source && dev.source.display != null ? dev.source.display : null;
    const r = step(host, { type: 'give', hostId: host, streamKey: String(streamKey), sid: dev.sid, display, platform: dev.platform, holder });
    if (!r.lease) throw named('bad-request', 'the hand-over could not be made');
    audit({ handle: r.lease.handle, verb: 'lease-give', sessionKey: holder.key, by: 'user', display });
    log.log?.(`[handover] ${host}: handed to ${holder.key}`);
    return { ok: true, lease: DH.leaseView(r.lease, now()) };
  }
  const leaseOfHost = (hostId) => { const l = leases.get(String(hostId || '')); if (!l) throw named('no_lease', 'this machine\'s desktop is not handed to anyone'); return l; };
  function pause(hostId, cause = 'owner_input') {
    const l = leaseOfHost(hostId);
    const r = step(l.hostId, { type: 'owner-input' }, null);
    if (r.changed) audit({ handle: l.handle, verb: 'lease-pause', sessionKey: l.holder.key, by: 'user', cause: String(cause).replace(/[^a-z_]/g, '').slice(0, 30) || 'owner_input' });
    return { ok: true, already: !r.changed, lease: DH.leaseView(r.lease, now()) };
  }
  function resume(hostId) {
    const l = leaseOfHost(hostId);
    const r = step(l.hostId, { type: 'resume' }, null);
    if (r.changed) audit({ handle: l.handle, verb: 'lease-resume', sessionKey: l.holder.key, by: 'user', pausedMs: l.pausedAt != null ? now() - l.pausedAt : null });
    return { ok: true, already: !r.changed, lease: DH.leaseView(r.lease, now()) };
  }
  function revoke(hostId) {
    const l = leaseOfHost(hostId);
    step(l.hostId, { type: 'revoke', by: 'user' });
    return { ok: true, ended: 'revoked' };
  }
  const stateOf = (hostId) => { const l = leases.get(String(hostId || '')); return l ? DH.leaseView(l, now()) : null; };

  // ── the agent's side ──
  const callerKeys = (f) => (f && f.session ? keysOf(f.session, f.sessionId) : []);
  /** The caller's lease of `handle`, live and not paused, or the refusal by name (the PURE verdict). */
  function held(handle, f) {
    const host = DH.hostOfHandle(handle);
    const l = host != null ? leases.get(host) || null : null;
    const v = DH.agentVerdict(l, callerKeys(f));
    if (v) throw named(v.code, v.error, { handle, origin: ORIGIN, ...(v.code === 'window_paused' && l ? { takenAt: l.pausedAt } : {}) });
    const dev = webrtc && webrtc.device ? webrtc.device(l.streamKey) : null;
    if (!dev) { step(l.hostId, { type: 'stream-ended', streamKey: l.streamKey, why: 'gone' }); throw named('desktop_not_handed', `this machine's desktop is not handed to you any more — ${DH.END_WHY.stream_ended}`, { handle, origin: ORIGIN }); }
    return { lease: l, dev };
  }
  /** Re-asked after every await: the same lease object is still the caller's and still driving. */
  function stillHeld(handle, f, lease) {
    const { lease: now2 } = held(handle, f);
    if (now2.streamKey !== lease.streamKey) throw named('desktop_switching', 'the window switched displays while this ran — take a new screenshot', { handle, origin: ORIGIN });
    return now2;
  }
  const machineName = (hostId) => hostId;
  function rowsFor(f) {
    const keys = callerKeys(f);
    const out = [];
    for (const l of leases.values()) {
      if (!keys.includes(l.holder.key)) continue;
      out.push({ handle: l.handle, label: `${machineName(l.hostId)} — its desktop`, origin: ORIGIN, hostId: l.hostId, mine: true, state: l.input === 'agent' ? 'yours' : l.input === 'user' ? 'paused' : 'switching', display: l.display, mode: 'pixels', modeWhy: 'a machine\'s desktop: screenshot + click --at / type / key / scroll (no tree)', shot: l.shot ? { w: l.shot.w, h: l.shot.h } : null, since: l.since, lease: { input: l.input === 'user' ? 'user' : 'agent', since: l.since, pausedAt: l.pausedAt } });
    }
    return out;
  }
  function errOfDevice(e) {
    if (e && e.code === 'host_needs_daemon') return named('host_needs_update', 'the machine\'s agent predates the hand-over (it was never asked) — it updates itself with the hub; ask the owner', { origin: ORIGIN });
    return named('device_unreachable', `the machine did not answer (${(e && e.message) || e})`, { origin: ORIGIN });
  }
  async function screenshot(handle, f) {
    const { lease, dev } = held(handle, f);
    let r;
    try { r = await dev.dm.desktopGrab(dev.sid, { by: DA.byAgent(lease.holder.key) }); } catch (e) { audit({ handle, verb: 'screenshot', sessionKey: lease.holder.key, by: 'pixels', ok: false, code: errOfDevice(e).code }); throw errOfDevice(e); }
    if (r && r.code === 'not_found') { daemonGone(lease); audit({ handle, verb: 'screenshot', sessionKey: lease.holder.key, by: 'pixels', ok: false, code: 'not_found' }); throw named('not_found', NOT_FOUND_WHY, { handle, origin: ORIGIN }); }
    const cur = stillHeld(handle, f, lease);
    if (!r || !r.ok) { audit({ handle, verb: 'screenshot', sessionKey: lease.holder.key, by: 'pixels', ok: false, code: (r && r.code) || 'still_failed' }); throw named((r && r.code) || 'still_failed', (r && r.error) || 'the machine took no picture', { handle, origin: ORIGIN }); }
    const png = Buffer.from(String(r.png64 || ''), 'base64');
    const shot = { w: r.w, h: r.h, origin: r.origin || { x: 0, y: 0 }, display: r.display != null ? String(r.display) : cur.display, at: now() };
    leases.set(cur.hostId, { ...leases.get(cur.hostId), shot });
    audit({ handle, verb: 'screenshot', sessionKey: cur.holder.key, by: 'pixels', ok: true, w: shot.w, h: shot.h, display: shot.display, bytes: png.length });
    return { handle, png, w: shot.w, h: shot.h, originX: shot.origin.x, originY: shot.origin.y, display: shot.display, coords: 'display', machine: cur.hostId };
  }
  const INPUT_STATUS_CODES = new Set(['uipi_blocked', 'accessibility_permission', 'unmapped_key', 'input_unsupported']);
  const NOT_FOUND_WHY = 'the machine\'s stream session is gone — its agent restarted; the hand-over ended (the owner hands it over again)';
  /** fix r2: the daemon answered not_found for the stream session (it restarted) ⇒ the lease ends `daemon_gone`, audited. */
  function daemonGone(lease) { step(lease.hostId, { type: 'daemon-gone', streamKey: lease.streamKey, by: 'machine' }); }
  /** fix r2: the machine says the owner's own input cut the agent's records — the lease pauses here too (the page's pause may
   *  still be on its way) → the window_paused refusal */
  function ownerTook(lease) {
    const r = step(lease.hostId, { type: 'owner-input' });
    if (r.changed) audit({ handle: lease.handle, verb: 'lease-pause', sessionKey: lease.holder.key, by: 'machine', cause: 'owner_input' });
    const l = leases.get(lease.hostId);
    return named('window_paused', 'the owner\'s own key, pointer or wheel took the desktop mid-act — the rest was not sent; wait until they press 「继续交给它」 / "Hand back to the agent"; do not retry in a loop', { cancelled: 'owner_input', takenAt: l && l.pausedAt != null ? l.pausedAt : now() });
  }
  async function act(handle, f, body = {}) {
    const { lease, dev } = held(handle, f);
    const verb = String(body.verb || '');
    const platform = dev.platform || lease.platform || null;
    // the last still's size; before one (a Mac's still is pending) the picture's own size from the stream's numbers
    const sc = dev.stats && dev.stats.screen;
    const size = lease.shot ? { w: lease.shot.w, h: lease.shot.h } : sc && sc.w > 0 && sc.h > 0 ? { w: sc.w, h: sc.h } : null;
    const origin = lease.shot ? lease.shot.origin : (dev.source && dev.source.origin) || { x: 0, y: 0 };
    const refuse = (code, error, extra = {}) => { audit({ handle, verb, sessionKey: lease.holder.key, by: 'pixels', ok: false, code, ...extra }); throw named(code, error, { handle, origin: ORIGIN }); };
    let records, did;
    if ((verb === 'click' || verb === 'type') && body.ref) refuse('mode_pixels', 'a machine\'s desktop has no tree here — read it with screenshot, act with click --at x,y / type / key / scroll');
    if (verb === 'click') {
      const pv = DH.pointVerdict(body.at, size);
      if (pv) refuse(pv.code, pv.error);
      const at = DH.parseAt(body.at);
      records = DH.clickRecords(at, body.button == null ? 1 : body.button, origin);
      if (!records) refuse('bad-request', '--button is 1 (left), 2 (middle) or 3 (right)');
      did = { by: 'point', at, button: Number(body.button) || 1, coords: 'display' };
    } else if (verb === 'key') {
      const c = DH.chordRecords(body.chord, platform);
      if (!c.records) refuse(c.code, c.error, c.refusedAs ? { refusedAs: c.refusedAs } : {});
      records = c.records;
      did = { chord: String(body.chord), keys: [...c.mods, c.key] };
    } else if (verb === 'type') {
      const tr = DH.typeRecords(body.text, platform, { keys: !!body.keys });
      if (!tr.records) refuse(tr.code, tr.error);
      records = tr.records;
      did = { by: tr.road, chars: tr.chars };
    } else if (verb === 'scroll') {
      if (body.at != null) { const pv = DH.pointVerdict(body.at, size); if (pv) refuse(pv.code, pv.error); }
      else if (!size) refuse('screenshot_first', 'take a screenshot first — the wheel turns at a pixel of that image (its centre by default)');
      records = DH.scrollRecords(body.direction, body.by, body.at != null ? DH.parseAt(body.at) : null, size, origin);
      if (!records) refuse('bad-request', `scroll is up | down | left | right, --by 1..${DH.LIMITS.scrollMaxNotches}`);
      did = { direction: String(body.direction).toLowerCase(), by: body.by == null ? DH.LIMITS.scrollDefault : Number(body.by) };
    } else refuse('bad-request', 'the verbs of a machine\'s desktop: screenshot, click --at, key, type, scroll');
    // ONE op carries at most handoverEventsMax records (fix r2): a longer act — a `type --keys` — goes in chunks cut where nothing
    // is held down, the lease re-asked between them (a pause / revoke / switch that landed stops the rest; what went in is said)
    const chunks = DH.chunkRecords(records, SM.STREAM_LIMITS.handoverEventsMax);
    let r = null, n = 0, sent = 0, cut = null;
    for (let ci = 0; ci < chunks.length; ci++) {
      if (ci) { try { stillHeld(handle, f, lease); } catch (e) { cut = e; break; } }
      try { r = await dev.dm.desktopInput(dev.sid, chunks[ci], { by: DA.byAgent(lease.holder.key) }); } catch (e) { const er = errOfDevice(e); if (!sent) refuse(er.code, er.message); cut = er; break; }
      if (r && r.code === 'not_found') { daemonGone(lease); refuse('not_found', `${NOT_FOUND_WHY}${sent ? ` (${sent} of ${records.length} records had gone in)` : ''}`); }
      n += (r && r.n) || 0;
      sent += r && r.cancelled ? Math.max(0, Number(r.sent) || 0) : chunks[ci].length;
      if (r && r.cancelled) { cut = r.cancelled === 'owner_input' ? ownerTook(lease) : named('desktop_not_handed', `this machine's desktop is not handed to you any more — ${DH.END_WHY.stream_ended}`); break; }
      if (!r || r.ok !== true) break; // a refusal (uipi …) or a failure — said below; the rest is not sent
    }
    const part = sent < records.length ? { sent, of: records.length, ...(did.by === 'keys' ? { charsTyped: DH.charsTyped(records, sent) } : {}) } : null;
    const cur = leases.get(lease.hostId);
    const point = records.slice(0, sent).find((x) => x.t === 'md' || x.t === 'wh');
    if (cur && point) leases.set(cur.hostId, { ...cur, dot: { x: point.x - origin.x, y: point.y - origin.y, at: now(), verb } });
    if (cur) nudge(cur.streamKey);
    const refusedCode = !cut && r && Array.isArray(r.refused) && r.refused.length ? r.refused[0].code : null;
    audit({ handle, verb, sessionKey: lease.holder.key, by: 'pixels', ok: !cut && !!(r && r.ok), ...(cut ? { code: cut.code } : refusedCode ? { code: refusedCode } : {}), ...(part ? { sent } : {}), ...(did.at ? { x: did.at.x, y: did.at.y, button: did.button } : {}), ...(did.chord ? { chord: did.chord } : {}), ...(did.chars != null ? { chars: did.chars, road: did.by } : {}), ...(did.direction ? { direction: did.direction, notches: did.by } : {}), display: lease.shot ? lease.shot.display : lease.display, events: records.length });
    if (cut) throw named(cut.code, `${cut.message} — ${sent} of ${records.length} records went in${part && part.charsTyped != null ? ` (${part.charsTyped} of ${did.chars} characters typed)` : ''}`, { handle, origin: ORIGIN, ...(cut.takenAt != null ? { takenAt: cut.takenAt } : {}), did: { partial: true, verb, ...(cut.cancelled ? { cancelled: cut.cancelled, released: { ok: true } } : {}), ...part } }); // the machine released what the agent held (stream-host dropAgent)
    if (r && r.ok === false && !Array.isArray(r.refused)) throw named(r.code || 'input_failed', r.error || 'the machine did not take that input', { handle, origin: ORIGIN });
    if (refusedCode) throw named(INPUT_STATUS_CODES.has(refusedCode) ? refusedCode : 'inject_failed', refusedCode === 'uipi_blocked' ? 'Windows keeps input away from an administrator window that has the focus — nothing reached it' : refusedCode === 'accessibility_permission' ? 'the Mac takes no keys or clicks until Accessibility is on for vibespace-screen (the owner\'s switch)' : `the machine did not take part of it (${refusedCode})`, { handle, origin: ORIGIN, did: { partial: true, verb, ...part } });
    return { ok: true, handle, did: { ...did, backend: 'stream', n, display: lease.shot ? lease.shot.display : lease.display, ...(r && r.clipboard ? { clipboard: r.clipboard } : {}) } };
  }
  function attach(handle, f) {
    const { lease } = held(handle, f);
    return { ok: true, resumed: true, handle, origin: ORIGIN, mode: { mode: 'pixels', why: 'a machine\'s desktop: no tree' }, note: 'the owner handed you this desktop — nothing to take; screenshot, then click --at / type / key / scroll', lease: DH.leaseView(lease, now()) };
  }
  function detach(handle, f) {
    const host = DH.hostOfHandle(handle);
    const l = host != null ? leases.get(host) : null;
    const v = DH.agentVerdict(l && l.input === 'user' ? { ...l, input: 'agent' } : l, callerKeys(f)); // handing it back is allowed while paused
    if (v && v.code === 'desktop_not_handed') throw named(v.code, v.error, { handle, origin: ORIGIN });
    step(l.hostId, { type: 'agent-done', by: 'agent' });
    return { ok: true, handle, ended: 'agent_done', appRunning: true };
  }
  function snapshot(handle, f) { held(handle, f); throw named('mode_pixels', 'a machine\'s desktop has no tree here — screenshot, then click --at x,y / type / key / scroll', { handle, origin: ORIGIN }); }
  function watch(handle, f) { const { lease } = held(handle, f); return { handle, label: `${lease.hostId} — its desktop`, origin: ORIGIN, form: 'machine-desktop', note: 'the owner watches this desktop in its own window — they see your pointer there; there is no pane to point them to' }; }

  // ── the tick: a holder that is gone, a display switch that never came back ──
  function tick() {
    const map = sessionsMap();
    for (const l of [...leases.values()]) {
      let live = false;
      for (const [id, s] of map) { if (s && keysOf(s, id).includes(l.holder.key)) { live = true; break; } }
      const cur = leases.get(l.hostId);
      if (!cur) continue;
      if (live) { if (cur.holderLostAt != null) leases.set(l.hostId, { ...cur, holderLostAt: null }); }
      else if (cur.holderLostAt == null) leases.set(l.hostId, { ...cur, holderLostAt: now() });
      else if (now() - cur.holderLostAt >= holderGraceMs) { step(l.hostId, { type: 'holder-gone' }); continue; }
      if (cur.input === 'rebinding') step(l.hostId, { type: 'rebind-timeout' });
    }
    for (const [k, n] of notices) if (now() - n.at >= NOTICE_MS) notices.delete(k);
  }
  const timer = tickMs > 0 ? setInterval(tick, tickMs) : null;
  timer?.unref?.();
  function shutdown() { if (timer) clearInterval(timer); }

  return { hooks, setWebrtc: (wr) => { webrtc = wr || null; }, give, pause, resume, revoke, stateOf, rowsFor, screenshot, act, attach, detach, snapshot, watch, tick, shutdown, isMachineHandle: DH.isMachineHandle, ORIGIN };
}

module.exports = { create, AUDIT_FILE, ORIGIN, TICK_MS };
