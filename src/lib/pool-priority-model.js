// THE POOL'S MANUAL PRIORITY, AS A PURE MODEL (2026-09-28, owner: "手动切换整个池其实
// 比较confusing，我建议移除这个功能，或者做成'手动优先级'这样的概念"). DOM-free, `t`
// injected; imports only the PURE pool module (the verdict that says what "out of
// quota" means — the pool's own hard bars, never a second copy of them). The
// Members… dialog (src/lib/manage-agents.js) is the DOM half: it draws these rows,
// sends PATCH {members, priority} and the one act, "Move every conversation here
// now" (POST …/gather).
// Laws: a member's state is said in WORDS (usable / out of quota until <time> /
// login expired / not signed in) and never greys the row; a row's menu offers only
// what applies (no "Move up" on #1 — absent, never disabled) and the #1 row's
// "Move every conversation here now" is there even when #1 already IS the default
// (addendum 4: the one "everything now" act must never be unreachable); turning
// Manual priority ON seeds the order with the member the pool sits on at the top,
// so the default does not move by the switch itself; turning it OFF clears the list.
import { quotaVerdict } from '../account-pool-auto.js';

const i18nKey = (s) => s;

/** A member's state in words: {code, key, params}. `usage` = the member's passive
 *  usage row, judged ONLY through the pool's own quotaVerdict; `loginState` = the roster's
 *  login reader answer. Order: not signed in › login expired › out of quota › usable
 *  (a quota reading about a login that cannot serve is beside the point). */
export function memberState({ loggedIn = true, loginState = null, usage = null, nowSec = Date.now() / 1000 } = {}) {
  if (!loggedIn) return { code: 'signed-out', key: i18nKey('not signed in'), params: {} };
  const st = loginState && typeof loginState === 'object' ? loginState.state : null;
  if (st === 'expired' || st === 'logged-out') return { code: 'login-expired', key: i18nKey('login expired'), params: {} };
  let v = null;
  try { v = usage ? quotaVerdict(usage, nowSec, { tier: 'hard' }) : null; } catch { v = null; }
  if (v && v.usable === false) {
    const at = v.until && v.until.resetsAt ? v.until.resetsAt * 1000 : 0;
    return at ? { code: 'out', key: i18nKey('out of quota until {time}'), params: { atMs: at } } : { code: 'out', key: i18nKey('out of quota'), params: {} };
  }
  if (v && v.usable === true) return { code: 'usable', key: i18nKey('usable'), params: {} };
  return { code: 'unknown', key: i18nKey('no reading yet'), params: {} };
}

/** Turning Manual priority ON: the member the pool sits on first, then the others in
 *  the member list's order — the default stays where it is. */
export function seedPriority({ current = null, memberIds = [] } = {}) {
  const ids = (memberIds || []).filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i);
  return current && ids.includes(current) ? [current, ...ids.filter((x) => x !== current)] : ids;
}

/** Move one member within the order: 'up' | 'down' | 'top'. A move off the end is a no-op. */
export function movePriority(list, id, how) {
  const out = (list || []).slice();
  const i = out.indexOf(id);
  if (i < 0) return out;
  const j = how === 'top' ? 0 : how === 'up' ? i - 1 : how === 'down' ? i + 1 : i;
  if (j < 0 || j >= out.length || j === i) return out;
  out.splice(i, 1);
  out.splice(j, 0, id);
  return out;
}

/** The dialog's rows. `members` = the pool's candidate subscriptions in list order
 *  [{id, name, email, loggedIn, loginState}]; `checked` = the member ids the save will
 *  keep; `order` = the priority (only in 'priority' mode); `current` = the pool's
 *  default; `stateOf(id)` → memberState. Priority mode lists the ordered members
 *  first (#1…), then the unchecked ones. Every row: {id, name, sub, checked, place,
 *  state, isDefault, actions:[{act, key}]} — `actions` never carries a disabled one. */
export function priorityRows({ members = [], checked = null, order = [], mode = 'automatic', current = null, stateOf = () => null } = {}) {
  const on = (id) => (checked == null ? true : checked.includes(id));
  const byId = new Map(members.map((m) => [m.id, m]));
  const ranked = mode === 'priority' ? (order || []).filter((id) => byId.has(id) && on(id)) : [];
  const rest = members.filter((m) => !ranked.includes(m.id)).map((m) => m.id);
  const rows = [];
  for (const id of [...ranked, ...rest]) {
    const m = byId.get(id);
    const place = ranked.indexOf(id);
    const actions = [];
    if (place >= 0) {
      if (place > 0) actions.push({ act: 'top', key: i18nKey('Move to top') }, { act: 'up', key: i18nKey('Move up') });
      if (place < ranked.length - 1) actions.push({ act: 'down', key: i18nKey('Move down') });
      if (place === 0) actions.push({ act: 'gather', key: i18nKey('Move every conversation here now') });
    }
    rows.push({ id, name: m.name || id, sub: m.email || '', checked: on(id), place: place >= 0 ? place + 1 : null, state: stateOf(id), isDefault: id === current, actions });
  }
  return rows;
}

/** The words a row prints: "#1 · UCI Max · usable · (new conversations start here)". */
export function rowWords(row, t, { fmtTime = (ms) => new Date(ms).toISOString() } = {}) {
  const st = row.state ? t(row.state.key, row.state.params && typeof row.state.params.atMs === 'number' ? { time: fmtTime(row.state.params.atMs) } : (row.state.params || {})) : '';
  return {
    place: row.place ? '#' + row.place : '',
    name: row.name,
    state: st,
    note: row.isDefault ? t(i18nKey('new conversations start here')) : '',
  };
}

/** The placement caption (the pool menu / the dialog head). */
export function placementWords(mode, t) {
  return mode === 'priority' ? t(i18nKey('Placement: Manual priority')) : t(i18nKey('Placement: Automatic'));
}

/** WHICH RULE placed a pooled conversation, in words, for the chip's tooltip and
 *  Session Properties: "priority #1" / "automatic" (the pin's "pinned" joins it).
 *  `auth` = server.js sessionAuth's pooled object. '' when it says nothing. */
export function placementNote(auth, t) {
  if (!auth || auth.source !== 'pooled') return '';
  // the note stands beside the member the conversation RUNS ON ("全部 → UCI Max (…)"): "pinned"
  // alone is true only when that member IS the pin. While the pin cannot serve (or applies at the
  // next restart) the conversation runs elsewhere, and the note names the pin (verify r1: it read
  // "→ UCI Max (pinned)" for a conversation pinned to Fish Max)
  if (auth.pinned) return auth.pinnedId && auth.poolTargetId && auth.pinnedId !== auth.poolTargetId ? t(i18nKey('pinned to {name}, running here for now'), { name: auth.pinned }) : t(i18nKey('pinned'));
  if (auth.placement === 'priority') return auth.priorityRank ? t(i18nKey('priority #{n}'), { n: auth.priorityRank }) : t(i18nKey('outside the priority order'));
  if (auth.placement === 'automatic') return t(i18nKey('automatic'));
  return '';
}

/** THE ONE RE-RENDER KEY OF A BILLING IDENTITY (2026-09-30, lane billing-chip — the owner's
 *  conversations kept the member they started on, on the phone, after the pool moved them).
 *  `auth` = server.js sessionAuth(s). Every KEYED renderer of it — the title-bar chip
 *  (window.js setAuthBadge) and the phone's status-bar chip (chat-status-bar.js setBilling) —
 *  skips a repaint while this key is unchanged, so the key is a CENSUS of what those chips print:
 *  the source (the chip's kind), the account / pool name, the member the conversation RUNS ON
 *  (name + id: two members may share a name), the machine, the "estimated" mark, an API key's
 *  tail / detail, and the placement note (pinned / priority #n / automatic — it derives from
 *  pinned, pinnedId, placement, priorityRank). The phone chip's old key was the pool's name
 *  alone, so a per-session switch, a pin or a gather never reached it. A JSON array: no two
 *  identities spell the same key whatever their names contain. '' = no identity. */
export function billingAuthKey(auth, t) {
  if (!auth) return '';
  return JSON.stringify([auth.source || '', auth.name || '', auth.poolTarget || '', auth.poolTargetId || '',
    auth.hostName || '', auth.guessed ? 1 : 0, auth.tail || '', auth.detail || '', placementNote(auth, t)]);
}

/** A MEMBER LEFT THE POOL — what the act's own answer says about the conversations that could
 *  NOT leave it (verify r1): `evicted` = the members route's `{removed, moved, restarted, stayed}`.
 *  The ones that moved are told one by one (the pool's notices); the ones that STAY keep billing
 *  the member that was just taken out, so the act says it itself, as a warning. '' = nothing to say. */
export function evictedWords(evicted, t) {
  // the owner's 全B (2026-09-28): nothing keeps running on the member you removed — a conversation nobody can take
  // over stops after its current turn and waits (`held`); `stayed` is only one that could not be parked at all
  const h = evicted && Number(evicted.held) > 0 ? Number(evicted.held) : 0;
  const n = evicted && Number(evicted.stayed) > 0 ? Number(evicted.stayed) : 0;
  const parts = [];
  if (h) parts.push(t(i18nKey('{n} conversation(s) stop after their current turn and wait — no other member can take them right now. They continue when one can.'), { n: h }));
  if (n) parts.push(t(i18nKey('{n} conversation(s) could not be parked — no member of the pool is signed in.'), { n }));
  return parts.join(' ');
}

/** "MOVE EVERY CONVERSATION HERE NOW" — WHAT THE ACT WILL TOUCH, counted from the live list before
 *  it is asked (verify r1): `sessions` = the active-sessions rows ({accountId, host, poolPin}).
 *  A conversation with its own pin is not the pool's to move. → {move, pinned} */
export function gatherCount(sessions, poolId) {
  const mine = (sessions || []).filter((x) => x && x.accountId === poolId && !x.host);
  const pinned = mine.filter((x) => x.poolPin && x.poolPin.memberId).length;
  return { move: mine.length - pinned, pinned };
}

/** The confirm a pool that RESTARTS to move shows first: it names HOW MANY conversations restart
 *  (and how many stay on their pin). null = nothing would restart — no confirm to show. */
export function gatherConfirmWords({ move = 0, pinned = 0 } = {}, t, { memberName = '' } = {}) {
  if (!(move > 0)) return null;
  return {
    title: t(i18nKey('Move {n} conversation(s) to “{name}”?'), { n: move, name: memberName }),
    message: t(i18nKey('This pool cannot switch a running conversation in place, so each one restarts and continues via resume.'))
      + (pinned > 0 ? ' ' + t(i18nKey('{n} pinned conversation(s) stay on their pin.'), { n: pinned }) : ''),
    confirmText: t(i18nKey('Move & restart')),
  };
}

/** THE WORDS OF THE ACT'S ANSWER (POST …/gather): what moved, what was left alone and why — never
 *  "every conversation" when some stayed; a refusal by its code, in the device's language.
 *  → {text, type: 'error'|undefined} */
export function gatherWords(r, t, { poolName = '', memberName = '', fmtTime = (ms) => new Date(ms).toISOString() } = {}) {
  if (!r || !r.success) {
    if (r && r.code === 'target_cannot_serve') {
      const why = r.why === 'pin-login-dead' ? t(i18nKey('cannot sign in'))
        : r.why === 'pin-exhausted' ? (r.until ? t(i18nKey('out of quota until {time}'), { time: fmtTime(r.until) }) : t(i18nKey('out of quota')))
        : t(i18nKey('not usable in the pool right now'));
      return { type: 'error', text: t(i18nKey('{member}: {why} — nothing was moved. The pool brings its conversations back to it when it can serve again.'), { member: r.member || memberName, why }) };
    }
    return { type: 'error', text: (r && r.error) || t(i18nKey('Switch failed')) };
  }
  const sk = r.skipped || {};
  const pinned = Number(sk.pinned) || 0;
  const cannot = Array.isArray(sk.cannotServe) ? sk.cannotServe.length : 0;
  const moved = typeof r.moved === 'number' ? r.moved : null;
  const parts = [];
  if (!pinned && !cannot) parts.push(t(i18nKey('Every conversation of “{name}” now uses {target}'), { name: poolName, target: memberName }));
  else parts.push(t(i18nKey('{n} conversation(s) of “{name}” now use {target}'), { n: moved == null ? '?' : moved, name: poolName, target: memberName }));
  if (pinned) parts.push(t(i18nKey('{n} pinned conversation(s) stay on their pin.'), { n: pinned }).replace(/[.。]$/, ''));
  if (cannot) parts.push(t(i18nKey('{n} stay where they are ({target} cannot serve them)'), { n: cannot, target: memberName }));
  const restarts = Array.isArray(r.affected) ? r.affected.length : 0;
  if (restarts) parts.push(t(i18nKey('restarting {n} conversation(s)…'), { n: restarts }));
  return { type: undefined, text: parts.join(' — ') };
}

/** THE BILLING SWITCHER'S POOL SUBMENU (2026-09-28, owner: "变成池的子菜单，直接选池本身就是自动切换，
 *  如果在子菜单里选"自动"也是自动切换，但如果选择某个具体账号，那在这个账号耗尽之前就pin在这个账号下").
 *  PURE: the words and marks; session-lifecycle.js draws them through showContextMenu's submenu.
 *  - the PARENT row names THIS CONVERSATION's member (addendum 3: the chip prints sessionAuth's
 *    `poolTarget` = accounts.poolMemberOfSession, so the menu must print the same fact — the
 *    pool DEFAULT appears only in words: the Automatic row's hint and the parent's tooltip);
 *    clicking it = automatic (clears the pin), exactly like the Automatic row.
 *  - "Automatic" first, ✓ when nothing is pinned.
 *  - one row per member: ✓ on the conversation's member, "pinned" in words on the pinned one,
 *    its state in words (an out-of-quota member is NOT greyed — picking it pins, and it says
 *    "out of quota — pins now, switches when it can"), and where a pin cannot re-point the
 *    running conversation, "applies at the next restart" (a stopped one: "applies when it resumes").
 *  → {parent:{name, member, memberId, title:{key, params}}, rows:[{act:'auto'|'pin', id?, name, checked, pinned, state, notes:[{key, params}]}]} */
export function poolSubmenuModel({ pool = {}, auth = null, pinId = null, live = true, applies = 'now', stateOf = () => null } = {}) {
  const convMemberId = (auth && auth.poolTargetId) || null;
  const convMember = (auth && auth.poolTarget) || null;
  const defName = pool.currentName || (auth && auth.poolDefault) || null;
  const title = convMember
    ? (defName && convMember !== defName
      ? { key: i18nKey('This conversation runs on {member}; new conversations start on {default}.'), params: { member: convMember, default: defName } }
      : { key: i18nKey('This conversation runs on {member}.'), params: { member: convMember } })
    : (defName ? { key: i18nKey('New conversations start on {default}.'), params: { default: defName } } : null);
  const rows = [{ act: 'auto', name: i18nKey('Automatic'), checked: !pinId, pinned: false, state: null,
    notes: defName ? [{ key: i18nKey('new conversations start on {name}'), params: { name: defName } }] : [] }];
  const members = Array.isArray(pool.memberOptions) ? pool.memberOptions.slice() : [];
  if (pinId && !members.some((m) => m.id === pinId)) members.push({ id: pinId, name: pinId }); // a pinned member the pool no longer offers still shows (and says so)
  for (const m of members) {
    const st = stateOf(m.id);
    const notes = [];
    if (m.id === pinId) notes.push({ key: i18nKey('pinned'), params: {} });
    if (st && st.code && st.code !== 'usable' && st.code !== 'unknown') {
      notes.push({ key: st.key, params: st.params || {} });
      if (m.id !== pinId) notes.push({ key: i18nKey('pins now, switches when it can'), params: {} });
    }
    if (m.id !== convMemberId && m.id !== pinId) {
      if (!live) notes.push({ key: i18nKey('applies when it resumes'), params: {} });
      else if (applies === 'restart') notes.push({ key: i18nKey('applies at the next restart'), params: {} });
    }
    rows.push({ act: 'pin', id: m.id, name: m.name || m.id, checked: !!convMemberId && m.id === convMemberId, pinned: m.id === pinId, state: st, notes });
  }
  return { parent: { name: pool.name || '', member: convMember, memberId: convMemberId, title }, rows };
}

/** One row's note line in the device's words ("pinned · out of quota until Tue 14:00 · pins now…"). */
export function submenuNoteWords(row, t, { fmtTime = (ms) => new Date(ms).toISOString() } = {}) {
  return (row.notes || []).map((n) => t(n.key, n.params && typeof n.params.atMs === 'number' ? { time: fmtTime(n.params.atMs) } : (n.params || {}))).join(' · ');
}
