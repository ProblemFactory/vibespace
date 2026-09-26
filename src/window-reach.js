'use strict';
/**
 * WINDOW REACH + SHARE MODE — PURE (imports nothing; CJS so the window-targets
 * engine, the user routes, the request producer, the suites AND the browser
 * bundle share ONE spelling of every rule). Desktop lane E, 2026-09-25 — the
 * owner: "浏览器窗口不是也应该能给agent操作吗？…默认不要让agent能看到所有窗口，
 * 而是创建前和创建后能选择把窗口暴露给哪些agent或者group，或者直接从一个窗口能
 * 发起让某个特定agent控制的request" and (19:05) "任何窗口发送给agent的时候应该都要
 * 有个选项可以切换无障碍还是像素模式。像素模式是最接近用户本人操作的方案作为兜底。"
 *
 * THE REACH MODEL (the house pattern of src/msg-acl.js / src/channel-acl.js):
 *   · a desktop-app window is HIDDEN from every agent by default (D1) — two
 *     levels, a closed set: hidden < exposed;
 *   · the record is PER WINDOW (the keeper's record id is the scope, implicit):
 *     `{ windowId, mode, rows: [{ principal: {kind, id, name}, grantedAt, by }] }`;
 *   · a principal is a live agent SESSION — by its durable conversation key
 *     (`<backend>:<conversation id>`, `webui:<id>` before a conversation
 *     exists: the same spelling as server.js `sessionStatusKey`, so a grant
 *     survives a restart / resume of that conversation) — or a whole Task
 *     GROUP (every session that belongs to it, live now or later: membership
 *     is evaluated at VERB time by the caller, D2);
 *   · ONE row per principal: a second grant to the same principal changes
 *     nothing (the first origin stays — widen-only), a revoke drops ONLY that
 *     principal's row (a group row keeps exposing a member whose own row was
 *     revoked — `reachFor` names the deciding row so the UI can say so);
 *   · `by` ∈ user | request | self-open — who wrote the row: the user's share,
 *     the user's "Ask <agent> to take control" (D3), or the ONE exception of
 *     D1: an agent that opened the window itself (`vibespace-window open`) is
 *     exposed to its own session;
 *   · `reachFor` = MAX over the applicable rows, the deciding row named, a
 *     session row preferred over a group row (the more specific grant).
 *
 * THE SHARE MODE (D7): every window's share carries `mode` ∈ auto | tree |
 * pixels (default auto). `pixels` is the closest thing to the user operating
 * by hand: the agent reads with `screenshot` and acts with `click --at` /
 * `type` / `key` / `scroll`; the TREE verbs (`snapshot`, `click @ref`,
 * `type @ref`) are refused BY NAME `mode_pixels`. `tree` allows everything
 * (the pixel verbs stay the agent's own fallback). `auto` RESOLVES — at
 * attach, and again whenever a snapshot probes — to `tree` when the app's
 * AT-SPI snapshot has a usable node (a role that is not a container, with an
 * action or editable text), else to `pixels`, and the resolution says why
 * ("no accessibility tree — pixel mode"). The mode is the USER's control; an
 * agent never switches it. A switch while an agent holds the lease takes
 * effect at its next verb (the engine audits `mode-changed`).
 *
 * THE PIXEL ROAD (D7, measured by the lane-E reader on xpra 6.5.3): a
 * screenshot is the app's OWN mapped X windows composed by their root
 * position, the ORIGIN being the MAIN window's top-left (the largest window
 * with a class/name — stable while popups come and go), so `--at x,y` is a
 * pixel of THAT image: the engine adds the origin at act time. AT-SPI bounds
 * are never click coordinates (GTK4 reports every node at 0,0 in logical px,
 * Chrome's frame in DIP). On the xpra rung a window nobody is viewing is
 * UNMAPPED (no client ⇒ IsUnviewable): its pixels are black and XTEST input
 * is silently lost — every pixel verb there is refused `window_not_visible`
 * instead of a false success.
 *
 * Lane E verify r2 (2026-09-25): `reach_unreadable` — a caller whose Task Group membership could not be READ is never
 * exposed by a guess nor read as revoked (`reachFor`'s `unreadable`); `principalsNow` reads the launcher's remembered
 * principals against the picker's roster (gone ⇒ `absent`, present ⇒ the CURRENT name).
 *
 * Gate: scripts/test-window-reach.mjs (fast — the principal × scope table,
 * widen-only, the opener exception, the mode table, the pixel plan, a
 * patched-copy control).
 */

const LEVELS = Object.freeze(['hidden', 'exposed']);
const RANK = Object.freeze({ hidden: 0, exposed: 1 });
const PRINCIPAL_KINDS = Object.freeze(['session', 'group']);
/** Who wrote a row — the user's share, the user's request (D3), the agent's own open (D1's one exception). */
const GRANT_ORIGINS = Object.freeze(['user', 'request', 'self-open']);
const MODES = Object.freeze(['auto', 'tree', 'pixels']);
const RESOLVED_MODES = Object.freeze(['tree', 'pixels']);
/** Every code this model (and the lane-E routes / engine on its behalf) answers with — CLOSED. */
const REFUSALS = Object.freeze(['not_exposed', 'mode_pixels', 'window_not_visible', 'outside_window', 'bad_principal', 'bad_mode', 'wake_paced', 'share_local_only', 'no_conversation', 'not_live', 'agent_forbidden',
  // lane E verify r2 (L4): the Task Group store could not be READ while a group row could have decided — the verb is
  // refused, the lease is KEPT (an unreadable store is not the user taking the window away)
  'reach_unreadable']);
function refuse(code, why, extra = {}) {
  if (!REFUSALS.includes(code)) throw new Error(`window-reach: unknown refusal code ${code}`);
  return { ok: false, code, why, ...extra };
}

/** The owner's sentence for a tree verb in pixel mode (D7) — ONE spelling for the engine, the CLI and the manual. */
const PIXELS_SENTENCE = 'the user shared this window in pixel mode — read it with screenshot, act with click --at x,y / type / key / scroll';
/** The CLI's remedy line for not_exposed (the manual quotes it). */
const NOT_EXPOSED_SENTENCE = 'the user has not shared this window with you — ask them (they can share it from the window\'s ⋯ menu)';
/** Lane E verify r2 (L4): the one spelling of reach_unreadable (engine, CLI, manual). */
const REACH_UNREADABLE_SENTENCE = 'the Task Group store could not be read — try again';

// ── principals ──────────────────────────────────────────────────────────────
const SESSION_KEY_RE = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9._:-]{1,160}$/;
const GROUP_ID_RE = /^[A-Za-z0-9._:-]{1,120}$/;
const cleanName = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '');
/** The durable key of a live session — `<backend>:<conversation id>`, else `webui:<id>` (server.js sessionStatusKey's spelling). */
function sessionKeyOf(s, webuiId) {
  const bsid = s && (s.backendSessionId || s.claudeSessionId);
  return bsid ? `${(s && s.backend) || 'claude'}:${bsid}` : `webui:${webuiId}`;
}
/** Every key a caller answers to (its conversation key AND its webui key — a grant written before the conversation had an id). */
function callerKeys(s, webuiId) {
  const out = [sessionKeyOf(s, webuiId)];
  if (webuiId != null && webuiId !== '') { const w = `webui:${webuiId}`; if (!out.includes(w)) out.push(w); }
  return out;
}
/** A principal as stored, or null when it is not one (a closed kind, a key of the right shape, a clean name). */
function normPrincipal(p) {
  if (!p || typeof p !== 'object') return null;
  const kind = String(p.kind || '');
  const id = String(p.id == null ? '' : p.id);
  if (!PRINCIPAL_KINDS.includes(kind)) return null;
  if (kind === 'session' ? !SESSION_KEY_RE.test(id) : !GROUP_ID_RE.test(id)) return null;
  const name = cleanName(p.name);
  return name ? { kind, id, name } : { kind, id };
}
const principalKey = (p) => `${p.kind}\u0000${p.id}`;

// ── the record + its transitions (every one returns a NEW record) ───────────
function emptyRecord(windowId) { return { windowId: String(windowId || ''), mode: 'auto', rows: [] }; }
/** A stored record read back tolerantly: unknown kinds / origins / modes are dropped or defaulted, never trusted. */
function normRecord(r, windowId) {
  const out = emptyRecord(windowId != null ? windowId : r && r.windowId);
  if (!r || typeof r !== 'object') return out;
  if (MODES.includes(r.mode)) out.mode = r.mode;
  const seen = new Set();
  for (const row of Array.isArray(r.rows) ? r.rows : []) {
    const p = normPrincipal(row && row.principal);
    if (!p || seen.has(principalKey(p))) continue;
    seen.add(principalKey(p));
    out.rows.push({ principal: p, grantedAt: Number(row.grantedAt) || 0, by: GRANT_ORIGINS.includes(row.by) ? row.by : 'user' });
  }
  return out;
}
/** Grant one principal. ONE row per principal: an existing row is kept as it is (widen-only; its origin stays). */
function grant(record, principal, { by = 'user', at = 0 } = {}) {
  const rec = normRecord(record);
  const p = normPrincipal(principal);
  if (!p) return { ...refuse('bad_principal', 'a principal is {kind: session|group, id} — a session by its conversation key, a group by its id'), record: rec, changed: false };
  if (!GRANT_ORIGINS.includes(by)) throw new Error(`window-reach: unknown grant origin ${by}`);
  const cur = rec.rows.find((r) => principalKey(r.principal) === principalKey(p));
  if (cur) {
    // a fresher display name is not a change of reach — kept quietly
    if (p.name && cur.principal.name !== p.name) cur.principal = { ...cur.principal, name: p.name };
    return { ok: true, record: rec, changed: false, row: cur };
  }
  const row = { principal: p, grantedAt: Number(at) || 0, by };
  rec.rows.push(row);
  return { ok: true, record: rec, changed: true, row };
}
/** Revoke ONE principal: drops only that principal's row (every other row, group rows included, stays). */
function revoke(record, principal) {
  const rec = normRecord(record);
  const p = normPrincipal(principal);
  if (!p) return { ...refuse('bad_principal', 'a principal is {kind: session|group, id}'), record: rec, changed: false };
  const i = rec.rows.findIndex((r) => principalKey(r.principal) === principalKey(p));
  if (i < 0) return { ok: true, record: rec, changed: false, row: null };
  const [row] = rec.rows.splice(i, 1);
  return { ok: true, record: rec, changed: true, row };
}
function setMode(record, mode) {
  const rec = normRecord(record);
  if (!MODES.includes(mode)) return { ...refuse('bad_mode', `the share mode is one of ${MODES.join(' | ')}`), record: rec, changed: false };
  const changed = rec.mode !== mode;
  rec.mode = mode;
  return { ok: true, record: rec, changed };
}
/** D1's ONE exception as a transition: the agent that opened the window is exposed to its own session. */
function openerGrant(record, { key, name = '', at = 0 } = {}) { return grant(record, { kind: 'session', id: key, name }, { by: 'self-open', at }); }

/**
 * Does this caller reach this window? `ctx` = `{ sessionKeys: [...], groupIds: [...] }` (a bare `sessionId` is
 * read as one more key). → `{ level, via: 'session'|'self-open'|'group'|null, row }`: MAX over the applicable rows,
 * hidden by default, a session's own row preferred (it is the more specific grant) over a group row.
 */
/**
 * `ctx.unreadable` (lane E verify r2, L4): the caller's Task Group membership could not be READ (the store threw). A
 * session row still decides on its own; when no row reaches the caller and the record HAS a group row — the one the
 * unreadable store could have matched — the answer stays `hidden` (fail closed: never exposed by a guess) and says
 * `unreadable: true`, so the engine refuses `reach_unreadable` and keeps the lease instead of reading the fault as the
 * user's revoke. A record with no group row is decided without the store: plainly hidden.
 */
function reachFor(record, ctx = {}) {
  const rec = normRecord(record);
  const keys = new Set([...(Array.isArray(ctx.sessionKeys) ? ctx.sessionKeys : []), ...(ctx.sessionId ? [String(ctx.sessionId)] : [])].map(String));
  const groups = new Set((Array.isArray(ctx.groupIds) ? ctx.groupIds : []).map(String));
  let best = null;
  for (const row of rec.rows) {
    const hit = row.principal.kind === 'session' ? keys.has(row.principal.id) : groups.has(row.principal.id);
    if (!hit) continue;
    if (!best || (best.principal.kind === 'group' && row.principal.kind === 'session')) best = row;
  }
  if (!best) return ctx.unreadable && rec.rows.some((r) => r.principal.kind === 'group') ? { level: 'hidden', via: null, row: null, unreadable: true } : { level: 'hidden', via: null, row: null };
  return { level: 'exposed', via: best.principal.kind === 'group' ? 'group' : best.by === 'self-open' ? 'self-open' : 'session', row: best };
}
const isExposed = (record, ctx) => RANK[reachFor(record, ctx).level] >= RANK.exposed;

// ── the mode (D7) ────────────────────────────────────────────────────────────
/** Roles that carry no act of their own — a tree of only these is a CLOSED tree (Chrome without the switch: 4 frames). */
const CONTAINER_ROLES = Object.freeze(['application', 'frame', 'window', 'panel', 'filler', 'redundant object', 'unknown', 'invalid', 'root pane', 'layered pane', 'glass pane', 'viewport', 'scroll pane', 'internal frame', 'desktop frame']);
/** How many nodes of a snapshot an agent can act on through the tree (a non-container role with an action or editable text). */
function usableNodes(nodes) {
  let n = 0;
  for (const x of Array.isArray(nodes) ? nodes : []) {
    if (!x || CONTAINER_ROLES.includes(String(x.role || ''))) continue;
    const acts = Array.isArray(x.actions) ? x.actions.filter((a) => a && a !== 'showContextMenu' && a !== 'clickAncestor') : [];
    if (acts.length || x.editable || (Array.isArray(x.states) && x.states.includes('editable'))) n++;
  }
  return n;
}
/**
 * The mode a verb runs under. `mode` = the share's (auto | tree | pixels); `probe` = what one snapshot saw
 * (`{a11yOk, nodes, usable, unreadable}`) — only `auto` reads it. → `{ mode: 'tree'|'pixels', why }`.
 */
function resolveMode({ mode = 'auto', probe = null } = {}) {
  if (mode === 'tree') return { mode: 'tree', why: 'the user shared it with its accessibility tree' };
  if (mode === 'pixels') return { mode: 'pixels', why: 'the user shared it in pixel mode' };
  if (!probe) return { mode: null, why: 'not resolved yet — attach resolves it' };
  if (probe.a11yOk === false) return { mode: 'pixels', why: 'the accessibility bus is unreachable here — pixel mode' };
  const nodes = Number(probe.nodes) || 0;
  const usable = probe.usable != null ? Number(probe.usable) || 0 : 0;
  if (!nodes) return { mode: 'pixels', why: 'no accessibility tree — pixel mode' };
  if (!usable) return { mode: 'pixels', why: `its accessibility tree is closed (${nodes} node${nodes === 1 ? '' : 's'}, none you can act on) — pixel mode` };
  return { mode: 'tree', why: `its accessibility tree answers (${usable} node${usable === 1 ? '' : 's'} you can act on) — tree mode` };
}
/** The tree verbs — refused in pixel mode. `click`/`type` are tree verbs only when they name a @ref. */
const TREE_VERBS = Object.freeze(['snapshot']);
/**
 * THE MODE TABLE (D7): may this verb run under this share? `mode` = the share's, `resolved` = auto's resolution
 * ('tree' | 'pixels' | null = not probed yet). → `{ ok, code, why, probe }` — `probe:true` = the verb is allowed AS
 * the probe (a snapshot under an unresolved or pixel-resolved auto re-probes; the engine decides with its result).
 */
function verbGate({ mode = 'auto', resolved = null, resolvedWhy = null, verb, hasRef = false } = {}) {
  const treeVerb = TREE_VERBS.includes(verb) || ((verb === 'click' || verb === 'type') && !!hasRef);
  if (!treeVerb) return { ok: true, code: null, why: null, probe: false };
  if (mode === 'pixels') return { ...refuse('mode_pixels', PIXELS_SENTENCE), probe: false };
  if (mode === 'tree') return { ok: true, code: null, why: null, probe: false };
  // auto
  if (verb === 'snapshot') return { ok: true, code: null, why: null, probe: resolved !== 'tree' };
  if (resolved === 'tree') return { ok: true, code: null, why: null, probe: false };
  if (resolved === 'pixels') return { ...refuse('mode_pixels', `${resolvedWhy || 'no accessibility tree — pixel mode'}: read it with screenshot, act with click --at x,y / type / key / scroll`), probe: false };
  return { ok: true, code: null, why: null, probe: true }; // unresolved: the engine probes first
}

// ── the pixel road (D7) ──────────────────────────────────────────────────────
/**
 * The app's windows (desktop-app keeper `windows(id)`: `[{id, title, cls, instance, x, y, w, h, mapped, depth}]`,
 * x/y ROOT coordinates) → the plan a screenshot composes and a point act maps through:
 * `{ ok, main, origin:{x,y}, w, h, members, visible, why }`. The MAIN window is the largest one that names itself
 * (a class, an instance or a title) — preferring a mapped one; the ORIGIN is its top-left (stable while popups
 * come and go); the image extends to the right/bottom of every member (a member left of / above the main
 * window is clipped there). `visible` = the main window's own mapped state (null = unknown).
 */
function pixelPlan(windows) {
  const rows = (Array.isArray(windows) ? windows : []).filter((w) => w && Number.isFinite(Number(w.x)) && Number.isFinite(Number(w.y)) && Number(w.w) > 1 && Number(w.h) > 1 && (w.cls || w.instance || w.title || w.name));
  if (!rows.length) return { ok: false, main: null, origin: null, w: 0, h: 0, members: [], visible: false, why: 'the app has no window on its display yet' };
  const area = (w) => Number(w.w) * Number(w.h);
  const mapped = rows.filter((w) => w.mapped !== false);
  const pool = mapped.length ? mapped : rows;
  const main = pool.reduce((a, b) => (area(b) > area(a) ? b : a));
  const ox = Number(main.x), oy = Number(main.y);
  const members = (mapped.length ? mapped : [main]).filter((w) => Number(w.x) + Number(w.w) > ox && Number(w.y) + Number(w.h) > oy);
  let right = ox + Number(main.w), bottom = oy + Number(main.h);
  for (const w of members) { right = Math.max(right, Number(w.x) + Number(w.w)); bottom = Math.max(bottom, Number(w.y) + Number(w.h)); }
  return { ok: true, main: { id: main.id, x: ox, y: oy, w: Number(main.w), h: Number(main.h), mapped: main.mapped === undefined ? null : main.mapped }, origin: { x: ox, y: oy }, w: right - ox, h: bottom - oy,
    members: members.map((w) => ({ id: w.id, x: Number(w.x), y: Number(w.y), w: Number(w.w), h: Number(w.h) })), visible: main.mapped === undefined ? null : main.mapped, why: null };
}
/**
 * May a PIXEL verb (screenshot / click --at / key / scroll / an injected type) run on this window? Whole-display
 * rungs (vnc-display) always have pixels; on the xpra rung the main window must be MAPPED — with no client attached
 * it is not, its grab is black and XTEST input is silently lost. `plan` = pixelPlan's answer or null (unknown ⇒ ok).
 */
function visibilityVerdict({ stream = null, plan = null } = {}) {
  if (stream !== 'xpra' || !plan) return { ok: true, code: null, why: null };
  if (!plan.ok) return refuse('window_not_visible', `${plan.why || 'the app has no window'} — nothing to read or act on in pixels yet`);
  if (plan.visible === false) return refuse('window_not_visible', 'nobody has this window open, so it has no pixels (a click or a key would be lost) — ask the user to open it (`vibespace-window watch <handle>` says where), or use the tree');
  return { ok: true, code: null, why: null };
}
/** A point of the screenshot image (window coordinates) → the display point, or a refusal (outside the image / the display). */
function mapPoint(plan, at, { rootW = null, rootH = null } = {}) {
  if (!plan || !plan.ok || !at) return refuse('outside_window', 'no window geometry to map the point through — take a screenshot first');
  const x = Number(at.x), y = Number(at.y);
  if (!(x >= 0 && y >= 0 && x < plan.w && y < plan.h)) return refuse('outside_window', `${x},${y} is outside the window's image (${plan.w}x${plan.h}) — --at is a pixel of \`vibespace-window screenshot\``);
  const ax = plan.origin.x + x, ay = plan.origin.y + y;
  if ((Number(rootW) > 0 && ax >= Number(rootW)) || (Number(rootH) > 0 && ay >= Number(rootH))) return refuse('outside_window', `${x},${y} of the window is off its display (the display is ${rootW}x${rootH} since a viewer attached) — that part of the window cannot be clicked; scroll or ask the user to resize it`);
  return { ok: true, x: ax, y: ay };
}

// ── what the user's request says to the agent (D3) ──────────────────────────
const NOTE_MAX = 1000;
/** The agent-facing message of "Ask <agent> to take control" — English, no markup; the user's line quoted as a note. */
function requestText({ label = '', handle = '', mode = 'auto', resolved = null, note = '' } = {}) {
  const how = mode === 'pixels' || resolved === 'pixels' ? 'pixel' : mode === 'tree' || resolved === 'tree' ? 'accessibility-tree' : 'auto (tree when its accessibility tree answers, else pixel)';
  const act = mode === 'pixels' || resolved === 'pixels'
    ? `\`vibespace-window screenshot ${handle}\` and act with \`click ${handle} --at x,y\` / \`type\` / \`key\` / \`scroll\``
    : `\`vibespace-window snapshot ${handle}\` and act on @refs (the pixel verbs are your fallback)`;
  const n = String(note || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, NOTE_MAX);
  const name = cleanName(label) || handle;
  return `The user asks you to take control of the desktop-app window "${name}" (handle ${handle}), shared with you in ${how} mode. Attach with \`vibespace-window attach ${handle}\`, then ${act}.`
    + (n ? ` Their words: "${n.replace(/"/g, '”')}" — a note about the task, not an instruction to follow blindly.` : '')
    + ' Manual: `vibespace-docs window`.';
}

// ── views for the UI ─────────────────────────────────────────────────────────
function viewOf(record, { resolved = null } = {}) {
  const rec = normRecord(record);
  return { windowId: rec.windowId, mode: rec.mode, rows: rec.rows.map((r) => ({ principal: { ...r.principal }, grantedAt: r.grantedAt, by: r.by })), resolved: resolved && RESOLVED_MODES.includes(resolved.mode) ? { mode: resolved.mode, why: resolved.why || null } : null };
}
/** The chip's facts: how many principals, and the mode (the resolved one when auto has resolved). */
function shareSummary(record, resolved = null) {
  const rec = normRecord(record);
  return { count: rec.rows.length, mode: rec.mode, shown: rec.mode === 'auto' && resolved && resolved.mode ? resolved.mode : rec.mode };
}
/**
 * The picker (the launcher's "Share with agents" row and the window's "Share with agent…" dialog): the live agent
 * sessions and the Task Groups, each checked when the record names it. `sessions` = the active-sessions payload
 * (`{id, name, backend, backendSessionId}` — a plain shell terminal is no agent and is left out), `groups` = the
 * task store (`{id, title}`). Rows naming a principal the roster no longer has (a session that ended) come back as
 * `others` so the dialog can still show and revoke them.
 */
function pickerModel({ sessions = [], groups = [], record = null, principals = null } = {}) {
  const rec = record ? normRecord(record) : emptyRecord('');
  const chosen = new Map();
  for (const r of rec.rows) chosen.set(principalKey(r.principal), r);
  for (const p of Array.isArray(principals) ? principals : []) { const n = normPrincipal(p); if (n && !chosen.has(principalKey(n))) chosen.set(principalKey(n), { principal: n, by: 'user', grantedAt: 0 }); }
  const out = { sessions: [], groups: [], others: [], mode: rec.mode };
  const seen = new Set();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || !s.id || s.backend === 'shell') continue;
    const key = sessionKeyOf(s, s.id);
    if (seen.has('session\u0000' + key)) continue;
    seen.add('session\u0000' + key);
    const row = chosen.get('session\u0000' + key) || chosen.get('session\u0000webui:' + s.id) || null;
    out.sessions.push({ id: s.id, key, name: cleanName(s.name) || key, hasConversation: !key.startsWith('webui:'), checked: !!row, by: row ? row.by : null });
    if (row) seen.add(principalKey(row.principal));
  }
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g || !g.id || g.archived) continue;
    const row = chosen.get('group\u0000' + g.id) || null;
    seen.add('group\u0000' + g.id);
    out.groups.push({ id: String(g.id), name: cleanName(g.title || g.name) || String(g.id), checked: !!row, by: row ? row.by : null });
  }
  for (const [k, r] of chosen) if (!seen.has(k)) out.others.push({ principal: { ...r.principal }, by: r.by, checked: true });
  return out;
}

// ── the launcher's per-app memory (user state `desktopAppReach`, keyed like desktopAppFrame) ──
/** The share a launch proposes for an app (`{principals, mode}`; nothing remembered ⇒ hidden, auto). */
function proposalOf(map, key) {
  const v = key && map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  const principals = (v && Array.isArray(v.principals) ? v.principals : []).map(normPrincipal).filter(Boolean);
  return { principals, mode: v && MODES.includes(v.mode) ? v.mode : 'auto' };
}
/** The map after a launch with `share`: an empty auto share REMOVES the key (the map never grows by choices that change nothing). */
function setProposal(map, key, share) {
  const next = { ...(map && typeof map === 'object' ? map : {}) };
  if (!key) return next;
  const principals = (share && Array.isArray(share.principals) ? share.principals : []).map(normPrincipal).filter(Boolean).slice(0, 64);
  const mode = share && MODES.includes(share.mode) ? share.mode : 'auto';
  if (!principals.length && mode === 'auto') delete next[key]; else next[key] = { principals, mode };
  return next;
}
/** What a launch from the dialog shares: the row the user set in THIS dialog (`touched`), else what the app remembers. */
function launchShare({ touched = false, choice = null, map = null, key = null } = {}) {
  if (touched && choice) { const p = proposalOf({ k: choice }, 'k'); return p; }
  return proposalOf(map, key);
}
/**
 * What the launcher SAYS a launch will share — derived from `launchShare` itself, so the words and the click cannot
 * disagree (lane E verify, 2026-09-25 — the verifier's major: an untouched row read "Hidden from agents" while the
 * click applied the app's REMEMBERED share; the owner's D2 asks that the next launch PROPOSES it, and a proposal is
 * something the user sees before the act). `proposal` = that app's remembered share (`proposalOf(map, key)`).
 * → `{ kind: 'chosen' | 'remembered' | 'hidden', principals, mode, hidden }`: `chosen` = the row the user set in THIS
 * dialog; `remembered` = the row untouched and the app remembers a share that changes anything (principals, or a
 * mode other than auto); `hidden` = nothing will be shared and nothing is remembered.
 */
function launchSummary({ touched = false, choice = null, proposal = null, roster = null } = {}) {
  const s = launchShare({ touched, choice, map: proposal ? { k: proposal } : null, key: 'k' });
  const kind = touched && choice ? 'chosen' : (s.principals.length || s.mode !== 'auto') ? 'remembered' : 'hidden';
  return { kind, principals: roster ? principalsNow(s.principals, roster) : s.principals, mode: s.mode, hidden: !s.principals.length };
}
/**
 * Lane E verify r2 (M2): a principal the per-app memory names, read against the ROSTER the picker draws from
 * (`{sessions, groups}` — the sidebar's live list and task store) at the moment the words are drawn. The memory is
 * rewritten only when the user touches the row, so a remembered name goes stale: a session that ended, a Task Group
 * deleted (a re-created one gets a new id) or archived, a group renamed. → the same principals (ids untouched — the
 * launch applies exactly them) with `name` = a live session's / a listed group's CURRENT name, or the remembered name
 * plus `absent: 'session'` (no live agent answers to the key — the picker's "not running now") / `absent: 'group'`
 * (the store does not list the group — "not in the list now"). An empty roster ⇒ every principal absent.
 */
function principalsNow(principals, roster) {
  const live = new Map();
  for (const s of roster && Array.isArray(roster.sessions) ? roster.sessions : []) {
    if (!s || !s.id || s.backend === 'shell') continue;
    for (const k of callerKeys(s, s.id)) if (!live.has(k)) live.set(k, s);
  }
  const listed = new Map();
  for (const g of roster && Array.isArray(roster.groups) ? roster.groups : []) if (g && g.id && !g.archived) listed.set(String(g.id), g);
  return (Array.isArray(principals) ? principals : []).map((p) => {
    if (!p || typeof p !== 'object') return p;
    if (p.kind === 'session') { const s = live.get(p.id); return s ? { ...p, name: cleanName(s.name) || p.name || p.id } : { ...p, absent: 'session' }; }
    const g = listed.get(String(p.id));
    return g ? { ...p, name: cleanName(g.title || g.name) || String(p.id) } : { ...p, absent: 'group' };
  });
}
/**
 * Lane E verify r3 (F5): does a written row reach anybody NOW — the launch audit's count and the share view's per-row
 * word. `hits` = the live sessions found answering to the row, `unreadable` = the live sessions whose Task Group
 * membership could not be READ (the store threw). A row with a hit is `matched`; a row that found nobody while a read
 * threw is `undecided` (a group row may reach exactly the session the store could not answer for — the r2 engine
 * folded the fault into "no groups" and counted the very group it could not read as nobody's); a row that found nobody
 * with every read answered is `unmatched`. A session row reads no store, so it is never undecided.
 */
const REACHED_STATES = Object.freeze(['matched', 'unmatched', 'undecided']);
function reachedState({ hits = 0, unreadable = 0 } = {}) {
  const h = Number(hits) > 0 ? Number(hits) : 0, u = Number(unreadable) > 0 ? Number(unreadable) : 0;
  return h > 0 ? 'matched' : u > 0 ? 'undecided' : 'unmatched';
}
/** The launch audit's two counts over the rows' states (`matched` counts in neither). An unknown state THROWS. */
function launchCounts(states) {
  const out = { unmatched: 0, undecided: 0 };
  for (const st of Array.isArray(states) ? states : []) {
    if (!REACHED_STATES.includes(st)) throw new Error(`window-reach: unknown reached state ${JSON.stringify(st)}`);
    if (st !== 'matched') out[st]++;
  }
  return out;
}
/** How many apps of the per-app memory remember a share that changes anything (the untouched row's words). */
function rememberedCount(map) {
  if (!map || typeof map !== 'object') return 0;
  let n = 0;
  for (const k of Object.keys(map)) { const p = proposalOf(map, k); if (p.principals.length || p.mode !== 'auto') n++; }
  return n;
}
/** A launch body's `share` validated (the route's view): `{principals, mode}` or a refusal. */
function normShare(share) {
  if (share == null) return { ok: true, share: null };
  if (typeof share !== 'object') return refuse('bad_principal', 'share is {principals: [...], mode}');
  const list = Array.isArray(share.principals) ? share.principals : [];
  const principals = [];
  for (const p of list.slice(0, 64)) {
    // a session may be named by its LIVE id too (the engine resolves it to its durable key when it applies the share)
    const n = normPrincipal(p) || (p && p.kind === 'session' && /^[A-Za-z0-9._-]{1,120}$/.test(String(p.id == null ? '' : p.id)) ? { kind: 'session', id: String(p.id), ...(cleanName(p.name) ? { name: cleanName(p.name) } : {}) } : null);
    if (!n) return refuse('bad_principal', `${JSON.stringify(p).slice(0, 80)} is not a principal`);
    principals.push(n);
  }
  const mode = share.mode == null ? 'auto' : share.mode;
  if (!MODES.includes(mode)) return refuse('bad_mode', `the share mode is one of ${MODES.join(' | ')}`);
  return { ok: true, share: { principals, mode } };
}

module.exports = {
  LEVELS, RANK, PRINCIPAL_KINDS, GRANT_ORIGINS, MODES, RESOLVED_MODES, REFUSALS, refuse, PIXELS_SENTENCE, NOT_EXPOSED_SENTENCE, REACH_UNREADABLE_SENTENCE, NOTE_MAX, CONTAINER_ROLES, TREE_VERBS,
  sessionKeyOf, callerKeys, normPrincipal, principalKey,
  emptyRecord, normRecord, grant, revoke, setMode, openerGrant, reachFor, isExposed,
  usableNodes, resolveMode, verbGate,
  pixelPlan, visibilityVerdict, mapPoint,
  requestText, viewOf, shareSummary, pickerModel, proposalOf, setProposal, launchShare, launchSummary, principalsNow, rememberedCount, normShare,
  REACHED_STATES, reachedState, launchCounts,
};
