'use strict';
/**
 * THE LIVE VIEW FITS ITS PANE — PURE (imports nothing; CJS so the server bridge
 * AND the browser bundle carry ONE set of rules, like src/browser-stream.js).
 *
 * Lane S4 — naive-user study 2 (2026-09-26, all three testers): "实况画面只占窗格
 * 上面一截" (the picture used the top 40–60 % of the pane, black below: the page
 * was rendered at the stream's fixed viewport, so a tall pane was mostly empty
 * and a narrow split pane showed a shrunk page) and "手机上的实况窗口" (390 wide:
 * the page at desktop width shrunk into a ~260 px strip, a 20 px "Pricing" link,
 * no pinch-zoom). The page is now rendered AT THE PANE'S SIZE.
 *
 * MEASURED on agent-browser 0.38.1 (the real binary, reached through the keeper
 * of a scratch instance — the facts every rule below stands on):
 *   · the frame IS the page's CSS viewport once one is set: `set viewport W H`
 *     ⇒ every frame W×H and the metadata W×H (headless and headed ≥ 500 px wide).
 *     Before any set: headless 1280×577 frames under a 1280×720 claim; headed a
 *     1241×1252 page DOWNSCALED into 714×720 (the stream's cap is the configured
 *     1280×720) — the lane J facts.
 *   · the frame never exceeds the viewport's CSS size: `set viewport 390 844 2`
 *     ⇒ 390×844 frames under a page whose devicePixelRatio is 2. A device scale
 *     factor adds no picture pixel while it multiplies Chrome's raster work by
 *     s², and a factor change produced NO frame at all on a static page (the
 *     screencast restarts and waits for damage — the blank picture again). So
 *     the fit's factor is 1 (`FIT_SCALE`): "DPR-aware" means the pane is
 *     measured in CSS px, never device px — a DPR-3 phone gets a 390-wide page,
 *     not a 1170-wide desktop layout.
 *   · a HEADED browser cannot show a viewport narrower than its window allows:
 *     390×760 ⇒ a 390×593 frame holding the page scaled 0.78 (480×800 ⇒ 480×768,
 *     0.96); 500 wide and up is exact. `fitHonored` reads it off the picture
 *     ('scaled') and the bridge re-fits at `HEADED_MIN_W`, the pane's aspect kept
 *     (the picture is then drawn scaled to the pane — and the chip says why).
 *   · new tabs inherit the set width/height (not the factor); `set viewport 0 0`
 *     clears nothing — there is no CLI way back, so a restore is an explicit set
 *     to the size the page had before the first fit (`baseline`).
 *   · VERIFY r1 (2026-09-26): the mirror is the daemon's processing ORDER, and
 *     that order is the only honest judge of two viewport sets in flight at
 *     once — the size alone misattributed both directions (measured on the
 *     fake upstream that mirrors as 0.38.1 does: the agent's `set viewport
 *     800 600` landing first was OVERRIDDEN by our fit that landed after it, and
 *     landing second it was announced as "fitted 700×900"). `ownSetOutcome`
 *     compares the two mirrors' positions (`seq`) once our CLI call returns:
 *     the agent's after ours ⇒ the agent's stands; ours after the agent's (or
 *     ours not yet mirrored) ⇒ the bridge PUTS THE AGENT'S CHOICE BACK
 *     (`agentSetArgs`: its factor, or `set device NAME`). The restore never
 *     runs under the agent's feet (`restoreDeferred`: a KNOWN running turn
 *     waits), and the agent's choice + the baseline live in a NOTE on the
 *     keeper's browser record (`fitNoteOf`) so a server restart forgets neither.
 *   · every CLI call is mirrored on the stream: a `launch` command/result pair,
 *     then the verb's own pair `{type:'command', action:'viewport', id,
 *     params:{action, width, height, deviceScaleFactor?}}`; `set device
 *     "iPhone 12"` is `action:'device'` (its result's data names 390×844 @3,
 *     mobile). So the bridge tells ITS OWN set from the AGENT's by the params it
 *     asked for (`ownViewportRecord`), and an agent's set is a flag on the
 *     target (`agentViewportOf`): the bridge never overrides a viewport the
 *     agent chose — the view letterboxes and says so, and a user's explicit
 *     "Fit to this window" is the one act that takes it back.
 *   · a same-document navigation (a hash change) sends a `url` record and NO
 *     frame (nothing repainted): the view cannot tell "the same pixels" from
 *     "no picture" — so the bridge asks the page for a fresh frame after a
 *     navigation that no frame followed (`FRESH_FRAME_MS`), and the view says
 *     "waiting for a picture…" after `WAIT_PICTURE_MS`, never a blank picture
 *     under a URL that says loaded.
 *
 * THE RULE WHEN SEVERAL VIEWERS WATCH (`fitTarget`, decided and pinned): the
 * HOLDER's pane while somebody drives (the person whose clicks land must see the
 * page at their size), else the pane a viewer CLAIMED by an explicit act (lane
 * live-input: the chip's "Fit here" — the latest claim wins; it ends when that
 * view leaves or hides), else the LARGEST visible pane by area, ties → the
 * earliest viewer. A hidden viewer (another desktop, a background tab, a minimized
 * window) never votes. Every other viewer's picture is the same frame,
 * letterboxed by its own aspect — never stretched. Nobody visible for
 * `RESTORE_AFTER_MS` ⇒ the page goes back to its `baseline`.
 *
 * THE PHONE'S PINCH (watch mode): a transform on the picture (`zoomAt`,
 * `pinchStep`, `panStep`, origin top-left, `ZOOM_MIN`..`ZOOM_MAX`, the picture
 * always covering its box); a tap maps through it because the pointer
 * conversion reads the TRANSFORMED rect (`zoomedRect` is that rect, spelled for
 * the table tests). In takeover mode a pinch is refused with a hint.
 * Gate: scripts/test-browser-fit.mjs (fast, tables + patched-copy controls) +
 * scripts/test-browser-live-fit.mjs (heavy, the real rung in chrome).
 */

const FIT_SCALE = 1;
const FIT_MIN_W = 240;
const FIT_MIN_H = 160;
const FIT_MAX_W = 3840;
const FIT_MAX_H = 2400;
/** A headed Chrome window's narrowest honest viewport (measured: 480 ⇒ scaled 0.96, 500 ⇒ exact). */
const HEADED_MIN_W = 500;
const FIT_MIRROR_WAIT_MS = 3000; // 2.369.198: how long a frame waits for the daemon's echo of its own set before it is judged anyway
const FIT_STALE_ASK_MS = 10000; // 2.369.198: a size we asked for this recently shields its late frame from `fitHonored`
/** A size within this many px of the applied one is the same size (a pane's sub-pixel wobble never re-fits). */
const FIT_SLACK_PX = 2;
/** The client reports a settled pane (ResizeObserver, debounced) — a drag of the divider is one report, not fifty. */
const FIT_REPORT_MS = 150;
/** The bridge applies the ruling this long after the last report (single flight, one trailing re-run). */
const FIT_DEBOUNCE_MS = 250;
/** Nobody visible for this long ⇒ the page goes back to its baseline (a reload / a tab switch never bounces the page). */
const RESTORE_AFTER_MS = 5000;
/** Our own `set viewport` mirror is recognised within this window of asking. */
const OWN_WINDOW_MS = 15000;
/** A navigation no upstream frame followed within this ⇒ the bridge asks the page for a fresh frame. */
const FRESH_FRAME_MS = 1000;
/** A viewer's `refresh` is answered at most this often per relay. */
const REFRESH_EVERY_MS = 2000;
/** The view says "waiting for a picture…" after this long without one … */
const WAIT_PICTURE_MS = 2000;
/** … and "no picture came" with a Reconnect after this long. */
const NO_PICTURE_MS = 10000;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
/** A double tap on an unzoomed picture zooms to this. */
const ZOOM_DOUBLE_TAP = 2;
/** lane live-input: a view's PLACE tags (random, opaque — `page` per loaded page, `device` per browser profile of this
 *  device, localStorage) ride its pane report so a viewer can be told WHERE the page's size comes from. */
const PLACE_TAG_RE = /^[A-Za-z0-9_-]{4,40}$/;
/** What the bridge tells every viewer about the page's size (`{type:'fit', state, …}`). */

const posNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A viewer's `{type:'fit'}` message → the report the bridge keeps, or null. */
function fitReport(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const w = posNum(msg.width), h = posNum(msg.height);
  if (!w || !h || w > 20000 || h > 20000) return null;
  const dpr = posNum(msg.dpr);
  const tag = (v) => (typeof v === 'string' && PLACE_TAG_RE.test(v) ? v : null);
  const pl = msg.place && typeof msg.place === 'object' ? { page: tag(msg.place.page), device: tag(msg.place.device) } : null;
  return { width: Math.round(w), height: Math.round(h), dpr: dpr && dpr <= 8 ? dpr : 1, visible: msg.visible !== false, force: msg.force === true, claim: msg.claim === true, place: pl && (pl.page || pl.device) ? pl : null };
}

/**
 * A pane (CSS px at net zoom 1) → the page viewport to ask for. The pane's
 * ASPECT is kept when a bound bites (a pane narrower than the floor gets a wider
 * page of the same shape, drawn scaled to fill the pane exactly — never a band).
 * `scale` = FIT_SCALE (see the header's measurement); `drawScale` = how the
 * picture will be drawn (1 = net zoom 1, the normal case); `dpr` is carried for
 * the record only.
 */
function paneViewport({ width, height, dpr = 1, floorW = FIT_MIN_W } = {}) {
  const w = posNum(width), h = posNum(height);
  if (!w || !h) return null;
  const minW = Math.max(FIT_MIN_W, posNum(floorW) || FIT_MIN_W);
  let k = Math.max(1, minW / w, FIT_MIN_H / h);
  if (w * k > FIT_MAX_W || h * k > FIT_MAX_H) k = Math.min(FIT_MAX_W / w, FIT_MAX_H / h);
  const W = Math.round(w * k), H = Math.round(h * k);
  return { width: W, height: H, scale: FIT_SCALE, drawScale: w / W, dpr: posNum(dpr) || 1, bounded: Math.abs(k - 1) > 1e-9 };
}

/**
 * THE RULE: whose pane sizes the page. `fits` = [{viewerId, width, height,
 * visible}]. The holder's pane while somebody drives (`mode` 'takeover' and the
 * holder has a visible report), else the largest visible pane by area, ties →
 * the lowest viewer id (the earliest). Null when nobody visible reported.
 */
function fitTarget({ fits = [], holder = null, mode = 'watch', claim = null } = {}) {
  const vis = (fits || []).filter((f) => f && f.visible !== false && posNum(f.width) && posNum(f.height));
  if (!vis.length) return null;
  if (mode === 'takeover' && holder !== null && holder !== undefined) {
    const h = vis.find((f) => f.viewerId === holder);
    if (h) return { viewerId: h.viewerId, width: h.width, height: h.height, dpr: h.dpr || 1, rule: 'holder' };
  }
  if (claim !== null && claim !== undefined) { // lane live-input: the pane a viewer asked for by its own click ("Fit here")
    const c = vis.find((f) => f.viewerId === claim);
    if (c) return { viewerId: c.viewerId, width: c.width, height: c.height, dpr: c.dpr || 1, rule: 'claimed' };
  }
  let best = null;
  for (const f of vis) {
    const a = f.width * f.height;
    if (!best || a > best.a || (a === best.a && Number(f.viewerId) < Number(best.f.viewerId))) best = { a, f };
  }
  return { viewerId: best.f.viewerId, width: best.f.width, height: best.f.height, dpr: best.f.dpr || 1, rule: 'largest' };
}

/**
 * What the bridge does now:
 *   { act:'wait' }                                   — no baseline yet (no picture / no page reading)
 *   { act:'letterbox', agent }                       — the agent chose the viewport (never overridden; `force` = the user's "Fit to this window")
 *   { act:'set', width, height, scale, viewerId, rule, drawScale }
 *   { act:'keep', why, … }                           — already that size / nothing to do
 *   { act:'restore', width, height }                 — nobody visible and a fit is applied: back to the baseline
 * `applied` = the size the bridge last set ({width, height}) or null; `baseline`
 * = the page's size before the first fit; `floorW` = HEADED_MIN_W once a headed
 * browser was seen scaling (`fitHonored`).
 */
function fitVerdict({ fits = [], holder = null, mode = 'watch', agent = null, applied = null, baseline = null, force = false, floorW = FIT_MIN_W, ready = true, claim = null } = {}) {
  if (agent && !force) return { act: 'letterbox', why: 'agent', agent };
  const t = fitTarget({ fits, holder, mode, claim });
  if (!t) {
    if (applied && baseline && posNum(baseline.width) && posNum(baseline.height)) return { act: 'restore', width: Math.round(baseline.width), height: Math.round(baseline.height), why: 'no-visible-viewer' };
    return { act: 'keep', why: 'no-visible-viewer' };
  }
  if (!ready) return { act: 'wait', why: 'no-baseline', viewerId: t.viewerId };
  const vp = paneViewport({ width: t.width, height: t.height, dpr: t.dpr, floorW });
  if (!vp) return { act: 'keep', why: 'no-size' };
  if (!force && applied && Math.abs(posNum(applied.width) - vp.width) <= FIT_SLACK_PX && Math.abs(posNum(applied.height) - vp.height) <= FIT_SLACK_PX) return { act: 'keep', why: 'fitted', ...vp, viewerId: t.viewerId, rule: t.rule };
  return { act: 'set', ...vp, viewerId: t.viewerId, rule: t.rule };
}

/** The CLI argv of a fit (`set viewport W H` — no factor: FIT_SCALE is 1, and naming it restarts nothing). Verify r1:
 *  also the argv that puts the AGENT's own choice back (`agentSetArgs`): its factor when it named one, `set device NAME`. */
function viewportArgv({ width, height, scale, device } = {}) {
  if (device) { const d = String(device).trim().slice(0, 80); return d ? ['set', 'device', d] : null; }
  const w = Math.round(posNum(width)), h = Math.round(posNum(height));
  if (!w || !h) return null;
  const s = posNum(scale);
  return s > 1 ? ['set', 'viewport', String(w), String(h), String(s)] : ['set', 'viewport', String(w), String(h)];
}
/** The set that restores an AGENT's choice after ours overrode it: `{width, height, scale}` | `{device}` | null. */
function agentSetArgs(agent) {
  if (!agent || typeof agent !== 'object') return null;
  if (agent.kind === 'device') return agent.device ? { device: String(agent.device) } : null;
  const w = posNum(agent.width), h = posNum(agent.height);
  return w && h ? { width: w, height: h, scale: posNum(agent.scale) > 1 ? posNum(agent.scale) : 1 } : null;
}
/**
 * Verify r1 — AFTER OUR OWN SET RETURNED, WHAT STANDS. The daemon processes commands one at a time and mirrors them in
 * that ORDER (`seq` = the position of the mirror on the stream), so an agent viewport flagged while ours was in flight
 * is judged by order, never by size or by clock:
 *   'fitted'           no agent choice arrived — the page is ours
 *   'agent-stands'     the agent's command was mirrored AFTER ours: the page is the agent's, nothing of ours applies
 *   'agent-overridden' ours was mirrored after the agent's (or not yet — it lands after): our set overrode the agent's
 *                      explicit choice and the bridge must put it back (`agentSetArgs`)
 *   'failed'           the CLI refused
 */
function ownSetOutcome({ ok = false, pending = null, agent = null } = {}) {
  if (!ok) return 'failed';
  if (!agent) return 'fitted';
  const num = (v) => (v === null || v === undefined ? NaN : Number(v));
  const as = num(agent.seq), ps = num(pending && pending.seq);
  if (Number.isFinite(as) && Number.isFinite(ps) && as > ps) return 'agent-stands';
  return 'agent-overridden';
}
/** Verify r1: the restore never runs UNDER THE AGENT'S FEET — a KNOWN running (or paused-on-the-user) turn defers it
 *  to the turn's end; 'idle' or an unknown turn (null: a session that publishes none) restores on the clock as before. */
function restoreDeferred(turn) { return turn === 'running' || turn === 'waiting'; }
/** Verify r1: the page-size NOTE the keeper keeps on the browser's own record (it dies with the record at the next
 *  launch — a relaunched browser has its own size): the bridge's state ↔ the note. A server restart no longer forgets
 *  that the agent chose the size (the first viewer's fit would have overridden it) nor the size to restore to. */
function fitNoteOf({ agent = null, applied = null, baseline = null, floorW = FIT_MIN_W } = {}) {
  const sz = (o) => o && posNum(o.width) && posNum(o.height) ? { width: Math.round(o.width), height: Math.round(o.height) } : null;
  const a = agent && typeof agent === 'object' ? agent : null;
  return {
    agent: a ? { kind: a.kind === 'device' ? 'device' : 'viewport', width: posNum(a.width), height: posNum(a.height), scale: posNum(a.scale) || 1, device: a.device ? String(a.device).slice(0, 80) : null, at: Number(a.at) || 0 } : null,
    applied: sz(applied), baseline: sz(baseline), floorW: Math.max(FIT_MIN_W, posNum(floorW) || FIT_MIN_W),
  };
}
function fitStateFromNote(note) {
  if (!note || typeof note !== 'object') return null;
  const n = fitNoteOf(note);
  const a = n.agent;
  const agent = a && (a.kind === 'device' ? a.device : (a.width && a.height)) ? { ...a, id: null, seq: null } : null;
  return { agent, applied: n.applied, baseline: n.baseline, floorW: n.floorW };
}

/** An upstream `command` mirror that SETS the viewport — `{kind:'viewport'|'device', width, height, scale, device, id}` or null. */
function agentViewportOf(msg) {
  if (!msg || msg.type !== 'command') return null;
  const p = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const a = String(msg.action || p.action || '');
  if (a === 'viewport') {
    const w = posNum(p.width), h = posNum(p.height);
    if (!w || !h) return null;
    return { kind: 'viewport', width: w, height: h, scale: posNum(p.deviceScaleFactor) || 1, device: null, id: typeof msg.id === 'string' ? msg.id : null };
  }
  if (a === 'device') return { kind: 'device', width: 0, height: 0, scale: 0, device: String(p.device || '').slice(0, 80) || null, id: typeof msg.id === 'string' ? msg.id : null };
  return null;
}
/** The `result` of an agent's `set device`: the size it names (so the chip can say it). */
function deviceSizeOf(msg) {
  if (!msg || msg.type !== 'result' || String(msg.action || '') !== 'device') return null;
  const d = msg.data && typeof msg.data === 'object' ? msg.data : {};
  const w = posNum(d.width), h = posNum(d.height);
  return w && h ? { width: w, height: h, scale: posNum(d.deviceScaleFactor) || 1, device: d.device ? String(d.device).slice(0, 80) : null } : null;
}

/**
 * Is this upstream record the mirror of the bridge's OWN `set viewport`?
 * `pending` = { width, height, at, inFlight, id } (id learned from the command).
 * The `launch` pair every CLI call opens with is ours while our call is in
 * flight and its command has not arrived yet. → { own:boolean, learnId? }.
 */
function ownViewportRecord(msg, pending, now) {
  if (!msg || !pending || (msg.type !== 'command' && msg.type !== 'result')) return { own: false };
  const a = String(msg.action || (msg.params && msg.params.action) || '');
  if (pending.id && msg.id === pending.id) return { own: true };
  if (a === 'launch') return { own: !!(pending.inFlight && !pending.id && now - Number(pending.at || 0) <= OWN_WINDOW_MS) };
  if (pending.id || msg.type !== 'command') return { own: false };
  if (now - Number(pending.at || 0) > OWN_WINDOW_MS) return { own: false };
  const p = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const learnId = typeof msg.id === 'string' ? msg.id : null;
  // verify r1: a pending `set device NAME` (the agent's choice put back) is recognised by the name
  if (pending.device) return a === 'device' && String(p.device || '') === String(pending.device) ? { own: true, learnId } : { own: false };
  if (a !== 'viewport') return { own: false };
  const sameScale = (posNum(p.deviceScaleFactor) || 1) === (posNum(pending.scale) || 1);
  if (Math.round(posNum(p.width)) === Math.round(posNum(pending.width)) && Math.round(posNum(p.height)) === Math.round(posNum(pending.height)) && sameScale) return { own: true, learnId };
  return { own: false };
}

/**
 * Did the picture that followed a fit come out at the fitted size?
 *   'exact'  — within FIT_SLACK_PX both ways (the page IS the pane)
 *   'scaled' — the width holds but the height came back smaller: a HEADED
 *              window narrower than it can be (measured 390×760 ⇒ 390×593)
 *   'other'  — anything else (a frame of the old size, the agent's own size)
 */
function fitHonored({ fit = null, picture = null } = {}) {
  const fw = posNum(fit && fit.width), fh = posNum(fit && fit.height), pw = posNum(picture && picture.width), ph = posNum(picture && picture.height);
  if (!fw || !fh || !pw || !ph) return 'other';
  if (Math.abs(fw - pw) <= FIT_SLACK_PX && Math.abs(fh - ph) <= FIT_SLACK_PX) return 'exact';
  if (Math.abs(fw - pw) <= FIT_SLACK_PX && ph < fh - FIT_SLACK_PX && fw < HEADED_MIN_W) return 'scaled';
  return 'other';
}

/**
 * Is this picture THIS fit's answer at all — may `fitHonored` read it? (2.369.198, the .197 heavy red: a phone's page
 * re-fitted at 500 px on a HEADLESS browser.) The bridge set 390×700 for the pane's first report and 390×737 for its
 * settled one; on the loaded gate machine the daemon's frame of the FIRST set arrived after the second CLI call had
 * returned — same width, a smaller height — and `fitHonored` read it as a headed window that cannot be that narrow.
 * Two facts tell an earlier frame apart:
 *   'stale-own'  — the picture is a size WE asked for within `staleWindowMs` before this fit (±FIT_SLACK_PX): that
 *                  earlier fit's frame, late (the window bounds the shield: a headed floor that happens to equal an
 *                  old pane is judged once the old ask is that far behind)
 *   'unmirrored' — the daemon has not yet echoed this fit's own `set viewport` (the stream is ONE ordered channel: every
 *                  frame read before the mirror shows the page BEFORE the set); waited at most `mirrorWaitMs`, so a
 *                  daemon that never mirrors still gets judged
 *   'judge'      — otherwise (a picture AT the fit's size is always judged: it is the exact answer)
 */
function frameJudgeVerdict({ fit = null, picture = null, asked = [], mirrored = false, ageMs = 0, mirrorWaitMs = FIT_MIRROR_WAIT_MS, staleWindowMs = FIT_STALE_ASK_MS, now = null } = {}) {
  const fw = posNum(fit && fit.width), fh = posNum(fit && fit.height), pw = posNum(picture && picture.width), ph = posNum(picture && picture.height);
  if (!fw || !fh || !pw || !ph) return 'judge';
  const isPicture = (a) => Math.abs(posNum(a && a.width) - pw) <= FIT_SLACK_PX && Math.abs(posNum(a && a.height) - ph) <= FIT_SLACK_PX;
  if (isPicture(fit)) return 'judge';
  const t = Number.isFinite(now) ? now : null;
  if ((Array.isArray(asked) ? asked : []).some((a) => a && isPicture(a) && (t === null || !Number.isFinite(a.at) || t - a.at <= staleWindowMs))) return 'stale-own';
  if (!mirrored && ageMs < mirrorWaitMs) return 'unmirrored';
  return 'judge';
}

/**
 * The bar's fit chip for THIS viewer (`you`) — shown only when the page is NOT
 * sized for this pane (a fitted page needs no words). `fit` = the bridge's last
 * `{type:'fit'}` record. → { show, kind: 'agent'|'other'|'floor'|'unavailable'|null, width, height, act }
 *   agent       the agent chose the size — the act is `force` (the page follows this window again)
 *   other       another view's window rules (the driver's, a claimed one, else the largest) — the act is `claim`
 *               (lane live-input: the page follows THIS window from the click on; while somebody else drives the
 *               driver's window keeps it and the claim applies at the handback); `where` = the ruling view's place
 *               against this one's (`place` = this view's tags): 'this-page' (another window of this very page),
 *               'this-device' (another tab or window of this browser), 'other-device', or null (unknowable);
 *               `how` = 'smaller' | 'larger' | null — the picture here against the page (from this view's `pane`)
 *   floor       a headed browser cannot be this narrow — the page is its narrowest, scaled to fit
 *   unavailable the size could not be set here — the words say why by the record's `code` alone (builder r2: the raw
 *               error — CDP method names, the agent's own refusal text — is the journal's, never a tooltip's);
 *               `held_while_driving` = a SHARED (mediated) browser keeps its size while somebody drives it (the
 *               mediator's paused fence refuses every viewport call, the product's own too) — `mine` = THIS view drives
 */
function fitChipState({ fit = null, you = null, place = null, pane = null, mine = false } = {}) {
  const none = { show: false, kind: null, width: 0, height: 0, act: null };
  if (!fit || typeof fit !== 'object') return none;
  const w = Math.round(posNum(fit.width)), h = Math.round(posNum(fit.height));
  if (fit.state === 'agent') return { show: true, kind: 'agent', width: w, height: h, act: 'force', device: fit.device || null };
  if (fit.state === 'unavailable') return { show: true, kind: 'unavailable', width: w, height: h, act: null, error: fit.error || null, code: fit.code || null, mine: !!mine };
  if (fit.state === 'fitted') {
    if (fit.viewerId !== null && fit.viewerId !== undefined && you !== null && you !== undefined && fit.viewerId !== you) {
      const theirs = fit.place && typeof fit.place === 'object' ? fit.place : null;
      const mine = place && typeof place === 'object' ? place : null;
      const where = !theirs || !mine ? null
        : (theirs.page && mine.page && theirs.page === mine.page) ? 'this-page'
          : (theirs.device && mine.device && theirs.device === mine.device) ? 'this-device'
            : (theirs.device && mine.device) ? 'other-device' : null;
      const pw = posNum(pane && pane.width), ph = posNum(pane && pane.height);
      const k = pw && ph && w && h ? Math.min(pw / w, ph / h) : 0;
      const how = !k || Math.abs(k - 1) < 0.02 ? null : k < 1 ? 'smaller' : 'larger';
      return { show: true, kind: 'other', width: w, height: h, act: 'claim', rule: fit.rule || 'largest', where, how };
    }
    if (fit.floor && posNum(fit.drawScale) && fit.drawScale < 0.999) return { show: true, kind: 'floor', width: w, height: h, act: null };
  }
  return none;
}
/**
 * builder r2 (the reality verifier's B): the DRIVER'S HELD BUTTONS off the input records the bridge forwards — a resize
 * landing mid-drag re-laid the page out under the pointer (moves jumped from y=232 to y=361; the selection came back
 * empty). `down` = the set held so far ('mouse:left' … / 'touch'); → the next set, or null when the record says nothing
 * about buttons. A MOVE with no button held (`button:'none'`, no `buttons`) while the set holds a mouse button = its
 * release happened where the view could not map it (outside the picture) — the mouse part is cleared.
 */
function buttonStep(down, rec) {
  if (!rec || typeof rec !== 'object') return null;
  const cur = new Set(down instanceof Set ? down : []);
  if (rec.type === 'input_mouse') {
    const b = 'mouse:' + String(rec.button || 'left');
    if (rec.eventType === 'mousePressed') { cur.add(b); return cur; }
    if (rec.eventType === 'mouseReleased') { cur.delete(b); return cur; }
    if (rec.eventType === 'mouseMoved' && !(Number(rec.buttons) > 0) && [...cur].some((x) => x.startsWith('mouse:'))) { for (const x of [...cur]) if (x.startsWith('mouse:')) cur.delete(x); return cur; }
    return null;
  }
  if (rec.type === 'input_touch') {
    if (rec.eventType === 'touchStart') { cur.add('touch'); return cur; }
    if (rec.eventType === 'touchEnd' || rec.eventType === 'touchCancel') { cur.delete('touch'); return cur; }
    return null;
  }
  return null;
}
/** builder r2: does a resize that came due now WAIT for the driver's release? 'hold' while a button is down and has been
 *  for less than `maxMs` (a release that never arrived stops holding it), else 'go'. */
function fitHoldVerdict({ down = 0, downAt = 0, now = 0, maxMs = 15000 } = {}) {
  if (!(Number(down) > 0)) return 'go';
  return Number(now) - Number(downAt) < Number(maxMs) ? 'hold' : 'go';
}
/**
 * lane live-input (the owner: "按另一个窗口的大小 — 非常 confusing 看不懂啥意思"): THE CHIP'S WORDS, one read each —
 * (1) why the picture here is smaller / larger, (2) which other place the page's size follows when that is knowable,
 * (3) what a click does. `t` is the caller's translator (the literals below are the dictionary keys). → {text, title}.
 * No "viewport", "pane", "lease" or "rule" — the words a person uses: page, window, tab, device, drive.
 */
function fitChipWords(c, { t = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => (p[k] !== undefined ? String(p[k]) : '{' + k + '}')) : s) } = {}) {
  if (!c || !c.show) return { text: '', title: '' };
  const size = { w: c.width, h: c.height };
  // builder r2: sentences are joined by a TRANSLATED template ("{first} {then}" — zh / ja join with no space after 。),
  // and every sentence carries its own full stop (the agent kind printed "…1280×720. 这个窗口…" / "…にしました. この…")
  const join = (...parts) => parts.filter(Boolean).reduce((a, b) => t('{first} {then}', { first: a, then: b }));
  if (c.kind === 'agent') {
    const who = c.device ? t('The agent set this page to the {device} size ({w}×{h}).', { device: c.device, ...size }) : t('The agent set this page to {w}×{h}.', size);
    return { text: t('Agent’s size {w}×{h} · Fit here', size), title: join(who, t('This window shows it scaled. Click to make the page fit this window again.')) };
  }
  if (c.kind === 'other') {
    const text = c.where === 'this-page' ? t('Sized for your other window · Fit here')
      : c.where === 'this-device' ? t('Sized for your other tab · Fit here')
        : c.where === 'other-device' ? t('Sized for another device · Fit here')
          : t('Sized for another window · Fit here');
    const place = c.where === 'this-page' ? t('your other window showing this browser')
      : c.where === 'this-device' ? t('another tab or window of yours on this device')
        : c.where === 'other-device' ? t('a window on another device')
          : t('another window showing this browser');
    const lead = c.rule === 'holder'
      ? t('The page is {w}×{h} to fit the window of whoever is driving it ({place}).', { ...size, place })
      : t('The page is {w}×{h} to fit {place}.', { ...size, place });
    const shown = c.how === 'smaller' ? t('Here it is shown smaller.') : c.how === 'larger' ? t('Here it is shown larger.') : t('Here it is shown scaled.');
    // builder r2: the driver is usually the viewer's OWN other tab — "that window", never "they" (对方 read as another person)
    const act = c.rule === 'holder' ? t('Click to make the page fit this window once that window hands back.') : t('Click to make the page fit this window instead.');
    return { text, title: join(lead, shown, act) };
  }
  if (c.kind === 'floor') return { text: t('Page {w} px wide (its narrowest)', { w: c.width }), title: t('This browser’s window cannot be narrower than {w} px, so the page is that wide and shown smaller here.', { w: c.width }) };
  if (c.kind === 'unavailable') {
    if (c.code === 'held_while_driving') {
      return { text: t('Page {w}×{h} · resized after the handback', size), title: c.mine
        ? t('A shared browser cannot change its size while you drive it, so the page is shown scaled here. It is resized again once you hand back.')
        : t('A shared browser cannot change its size while someone drives it, so the page is shown scaled here. It is resized again after the handback.') };
    }
    // builder r2 (the reality verifier's item 5): never the raw error — it was English, addressed to the agent, full of
    // CDP method names and cut at 200 characters; the journal keeps it (the bridge's one warning per relay)
    return { text: t('Page {w}×{h} · could not resize', size), title: t('The page could not be resized to this window, so it is shown scaled.') };
  }
  return { text: '', title: '' };
}

/**
 * What the picture area says about the picture (the blank-white fix):
 *   frames === 0          : since the stream opened — 'ok' (<2 s), 'waiting', 'none' (≥10 s)
 *   a navigation no frame followed (navAt > lastFrameAt): the same clock from the
 *   navigation — the stale picture is marked (`stale`), never shown as the new page.
 * → { state: 'ok'|'waiting'|'none', stale, since }
 */
function pictureState({ connected = false, frames = 0, lastFrameAt = 0, navAt = 0, openAt = 0, now = 0 } = {}) {
  if (!connected) return { state: 'ok', stale: false, since: 0 };
  let since = 0, stale = false;
  if (!(Number(frames) > 0)) since = Number(openAt) || 0;
  else if (Number(navAt) > Number(lastFrameAt)) { since = Number(navAt); stale = true; }
  else return { state: 'ok', stale: false, since: 0 };
  if (!since) return { state: 'ok', stale, since: 0 };
  const dt = Number(now) - since;
  return { state: dt >= NO_PICTURE_MS ? 'none' : dt >= WAIT_PICTURE_MS ? 'waiting' : 'ok', stale, since };
}

// ── the phone's pinch-zoom (watch mode): a transform on the picture, origin top-left ──
/** `z` = {s, tx, ty} in the box's own px; the picture always covers its box. */
function zoomClamp(z, box) {
  const W = posNum(box && box.width), H = posNum(box && box.height);
  const s = clamp(Number(z && z.s) || 1, ZOOM_MIN, ZOOM_MAX);
  if (!W || !H) return { s, tx: 0, ty: 0 };
  const tx = clamp(Number(z && z.tx) || 0, W * (1 - s), 0), ty = clamp(Number(z && z.ty) || 0, H * (1 - s), 0);
  return { s, tx: Math.abs(tx) < 1e-9 ? 0 : tx, ty: Math.abs(ty) < 1e-9 ? 0 : ty };
}
const ZOOM_NONE = Object.freeze({ s: 1, tx: 0, ty: 0 });
function isZoomed(z) { return !!(z && Number(z.s) > 1.001); }
/** Zoom by `factor` keeping box point (px, py) under the finger. */
function zoomAt(z, factor, px, py, box) {
  const s0 = Number(z && z.s) || 1;
  const s1 = clamp(s0 * (Number(factor) || 1), ZOOM_MIN, ZOOM_MAX);
  const cx = (Number(px) - (Number(z && z.tx) || 0)) / s0, cy = (Number(py) - (Number(z && z.ty) || 0)) / s0; // the content point under the finger
  return zoomClamp({ s: s1, tx: Number(px) - cx * s1, ty: Number(py) - cy * s1 }, box);
}
/** A two-finger gesture: from the start (z0, fingers a0 b0) to now (a1 b1), box-local px — the content under the start midpoint follows the midpoint, the scale follows the spread. */
function pinchStep(z0, a0, b0, a1, b1, box) {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const s0 = Number(z0 && z0.s) || 1;
  const s1 = clamp(d0 > 0 ? s0 * d1 / d0 : s0, ZOOM_MIN, ZOOM_MAX);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const cx = (m0.x - (Number(z0 && z0.tx) || 0)) / s0, cy = (m0.y - (Number(z0 && z0.ty) || 0)) / s0;
  return zoomClamp({ s: s1, tx: m1.x - cx * s1, ty: m1.y - cy * s1 }, box);
}
/** A one-finger drag on a zoomed picture. */
function panStep(z0, dx, dy, box) { return zoomClamp({ s: Number(z0 && z0.s) || 1, tx: (Number(z0 && z0.tx) || 0) + Number(dx || 0), ty: (Number(z0 && z0.ty) || 0) + Number(dy || 0) }, box); }
/** The picture element's rect under the transform (translate(tx,ty) scale(s), origin 0 0) — what getBoundingClientRect answers, spelled for the tables. */
function zoomedRect(rect, z) {
  const s = Number(z && z.s) || 1;
  return { left: (Number(rect && rect.left) || 0) + (Number(z && z.tx) || 0), top: (Number(rect && rect.top) || 0) + (Number(z && z.ty) || 0), width: (Number(rect && rect.width) || 0) * s, height: (Number(rect && rect.height) || 0) * s };
}
function transformCss(z) { return isZoomed(z) ? `translate(${Number(z.tx) || 0}px, ${Number(z.ty) || 0}px) scale(${Number(z.s)})` : ''; }

module.exports = {
  FIT_SCALE, FIT_MIN_W, FIT_MIN_H, FIT_MAX_W, FIT_MAX_H, HEADED_MIN_W, FIT_SLACK_PX, FIT_REPORT_MS, FIT_DEBOUNCE_MS, RESTORE_AFTER_MS, OWN_WINDOW_MS,
  FRESH_FRAME_MS, REFRESH_EVERY_MS, WAIT_PICTURE_MS, NO_PICTURE_MS, ZOOM_MIN, ZOOM_MAX, ZOOM_DOUBLE_TAP, ZOOM_NONE,
  fitReport, paneViewport, fitTarget, fitVerdict, viewportArgv, agentViewportOf, deviceSizeOf, ownViewportRecord, fitHonored, fitChipState, pictureState,
  FIT_MIRROR_WAIT_MS, FIT_STALE_ASK_MS, frameJudgeVerdict, // 2.369.198: is this picture THIS fit's answer (an earlier fit's late frame / a frame before the daemon's mirror is not)
  fitChipWords, PLACE_TAG_RE, buttonStep, fitHoldVerdict, // lane live-input (+ builder r2: the driver's held buttons hold a resize): the chip's words (where the page's size comes from + what a click does); a view's place tags
  agentSetArgs, ownSetOutcome, restoreDeferred, fitNoteOf, fitStateFromNote, // verify r1: the order-judged outcome of our own set, the deferred restore, the persisted note
  zoomClamp, isZoomed, zoomAt, pinchStep, panStep, zoomedRect, transformCss,
};
