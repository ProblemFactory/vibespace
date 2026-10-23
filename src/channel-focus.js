'use strict';
// THE FIRST SCREEN LISTS WHAT MATTERS (design-communication-panel.zh.md §23 R3,
// the owner 2026-09-26 on the aggregated-IM release — "879 个群 · 0 条未读":
// "开头不要把所有消息都放进来，很多是没用的，建议只放重要消息/conversation（比如
// 推送给agent了的，或者某个agent刚刚读取了的），并展示一个小tag表示状态。").
//
// PURE — imports NOTHING, DOM-free and word-free (the words are
// channel-words.js' `statusTagParts`, in the device's language). CJS since
// design 008 (B-3cf8) so the ENGINE asks the same predicate the panel draws by
// (the channel-attachments pattern: the engine requires it, the bundle imports
// it, src/lib/channel-focus.js re-exports it). The server
// sends each row's FACTS (`assignment`, `outbox`, `touch` — rowView in
// src/server/channels-engine.js); everything that decides "does this row
// matter, and which ONE tag does it wear" is here, once, so the panel, the
// window-hosted panel and the suites cannot disagree.
//
// A CONVERSATION MATTERS when any of these holds (§23.2):
//   awaiting   an agent's proposal awaits the owner's approval (outbox.awaiting),
//              or a send's outcome is unknown and waits for the owner's check
//   assigned   it is handed to an agent / a Task Group ON ITS OWN (the
//              conversation grain). A pattern or account grain lists it ONLY
//              once that hand-over acted on it: a wake for it was DELIVERED to
//              the agent in the last 24 h (`touch.wake.ok === true`, a lane
//              other than 'none'), or its wake is held (amber) — D4, the
//              integrator's ruling 2026-09-27: handing a whole account (the
//              owner's 824-thread mailbox) to an agent must not put all of it
//              back on the first screen. Otherwise such a row falls through to
//              read / held / replied like any other.
//   read       an agent read it (the agent route's `readFor`) in the last 24 h
//   held       a wake for it is held (hits pending, or the last wake / the
//              last refusal was not delivered) — within the wake ledger's 7 days.
//              A DIGEST watcher's hits wait on the conversation BY DESIGN until
//              its window closes: those are the digest, never "held" (the R3 ×
//              R4 seam, 2.369.191 — `heldPending` reads the row's R4 `watchers`
//              beside the engine's per-principal `touch.pendingFor`)
//   direct     a SINGLE chat (`kind: 'dm'`) with unread messages whose newest is
//              inside the 24 h window (lane lark-search-poll, owner decision 1,
//              2026-09-28: "首屏'要紧'列表里, 别人私聊你、你还没看的消息, 挂'单聊 · N
//              条新消息'标签") — a person wrote to the owner; the feed's catch-up
//              births are READ (unread 0), so day one never floods the list
//   replied    the owner wrote in it in the last 24 h (a message the vendor
//              records as the owner's own, or the owner's send from here)
// and a non-archived AGENT GROUP always does (the owner's explicit act, D1).
//
// ONE TAG PER ROW, first match wins (§23.3):
//   awaiting › unknown › at-you (@ of me · N) › assigned (→ Agent X; amber when its wake is held)
//   › read (Agent X read N min ago) | new-since-read (new since Agent X read)
//   › held › judged › direct › replied
// `read` and `new-since-read` are the SAME fact split by whether anything
// arrived after the read (`lastAt > upTo`), so they never compete.
//
// The window is 24 h (FOCUS_WINDOW_MS) and its edge is EXCLUSIVE: a read
// exactly 24 h old has left the list. `held` uses the wake ledger's own
// 7 days (HELD_WINDOW_MS) — no new setting.

const FOCUS_WINDOW_MS = 24 * 3600e3;
const HELD_WINDOW_MS = 7 * 86400e3;
/** The tag codes, in priority order (the table the suite pins). */
const TAG_ORDER = Object.freeze(['awaiting', 'unknown', 'at-you', 'assigned', 'read', 'new-since-read', 'held', 'judged', 'direct', 'replied']);

// lane attention-policy (owner 2026-10-13: "应该允许禁用原来的固定规则，或者直接加个配置选项可以改怎么判断需关注"): THE FIRST
// SCREEN IS THE OWNER'S POLICY. Each fixed rule is a switch — the setting `channels.attention.rule.<code>`, default on
// (`read` covers read + new-since-read) — and the judge's switch is the LLM plugin's own `attention` feature
// (ONE store: the plugin's config, never a flag here). A rule switched off never lands its row: `statusTag` skips it
// and asks the next rule that is on, so the row keeps any other reason it has and otherwise stays under All with its
// facts. No policy, or every switch on = the table above, byte for byte. A preset SETS the switches (a convenience
// over the same rows, never a third store).
/** The fixed rules a policy switches, in the order the settings rows list them. */
const ATTENTION_RULES = Object.freeze(['direct', 'at-you', 'awaiting', 'assigned', 'read', 'held', 'unknown', 'replied']);
/** The presets — what each one sets: every fixed rule (`rules`) and the judge's switch (`judge`). */
const ATTENTION_PRESETS = Object.freeze({
  both: Object.freeze({ rules: true, judge: true }),
  judge: Object.freeze({ rules: false, judge: true }),
  rules: Object.freeze({ rules: true, judge: false }),
});
const ruleKey = (code) => `channels.attention.rule.${code}`;
/** The policy from a settings reader `get(key)` (unset = on) and the judge's switch (unknown = on). */
function attentionPolicy(get = () => undefined, judge) {
  const rules = {};
  for (const code of ATTENTION_RULES) { let v; try { v = get(ruleKey(code)); } catch { v = undefined; } rules[code] = v !== false; }
  return { rules, judge: judge !== false };
}
/** May tag `code` land under `policy`? (no policy = yes; `new-since-read` is the `read` rule; `judged` the judge's switch) */
function ruleOn(policy, code) {
  if (!policy) return true;
  if (code === 'judged') return policy.judge !== false;
  return (policy.rules || {})[code === 'new-since-read' ? 'read' : code] !== false;
}
/** Which preset a policy is (null = a mix of switches). */
function presetOf(policy) {
  const on = ATTENTION_RULES.map((c) => ruleOn(policy, c));
  const all = on.every(Boolean), none = !on.some(Boolean), judge = ruleOn(policy, 'judged');
  for (const [name, s] of Object.entries(ATTENTION_PRESETS)) if (s.judge === judge && (s.rules ? all : none)) return name;
  return null;
}
/** What preset `name` writes: `{settings: {<rule key>: bool}, judge: bool}` (null = no such preset). */
function presetSwitches(name) {
  const s = Object.prototype.hasOwnProperty.call(ATTENTION_PRESETS, name) ? ATTENTION_PRESETS[name] : null;
  return s ? { settings: Object.fromEntries(ATTENTION_RULES.map((c) => [ruleKey(c), s.rules])), judge: s.judge } : null;
}

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

// lane channel-self-unread (userW inc-muxekkry-clfb 2026-10-07 "发消息在 channel 里面也会被视为一个未读" + B-c91b):
// THE OWNER'S OWN MESSAGE IS READ BY CONSTRUCTION — a record whose author is the account itself (`author.isSelf`,
// stamped by the adapter from the RESOLVED identity, or the id `selfId` names) adds 0 to `unread`, moves the read
// line to its own instant (sending = having read everything up to it, as the vendor apps behave; records AFTER it
// count again), is never "new since read" and never a watch hit. A record whose self-ness is UNKNOWN (no identity
// resolved yet) is counted as before — never a guess. Every counter asks these two (the engine's append sites, the
// store's re-derivation, the watch, statusTag below).
/** Is `r` the account's own message? `author.isSelf === true`, else its author id equals the resolved `selfId`. */
function selfRead(r, selfId = null) {
  const a = r && r.author;
  if (!a || typeof a !== 'object') return false;
  if (a.isSelf === true) return true;
  return typeof selfId === 'string' && selfId !== '' && a.id != null && String(a.id) === selfId;
}
/** The read line after a batch `recs`: `{ readAt, unread, moved }` — `readAt` = the newest self record's instant when
 *  it is past `readAt`; `unread` = the batch's OTHER records past that line; `moved` = the line advanced (the caller
 *  re-derives the row's whole count past it — older unread records before it are read now). */
/** B-ef03 (vendor system notices, 2026-10-08): a vendor SYSTEM notice (`kind: 'system'` — a recall, a join; src/channel-record.js) is READ BY CONSTRUCTION
 *  too — it adds 0, never moves the read line, is never news and never a watch hit (nobody wrote it). */
// lane gmail-draft-not-a-message (fb-9aa1d3bd1e): so is the account's unsent DRAFT (`kind: 'draft'` — nobody received it): it adds
// 0, never moves the read line, is never news and never a watch hit.
function systemRead(r) { return !!r && typeof r === 'object' && (r.kind === 'system' || r.kind === 'draft'); }
function readAdvance(readAt, recs, selfId = null) {
  const list = Array.isArray(recs) ? recs : [];
  let line = num(readAt);
  for (const r of list) if (selfRead(r, selfId) && !systemRead(r) && num(r && r.at) > line) line = num(r.at);
  let unread = 0;
  for (const r of list) if (r && !selfRead(r, selfId) && !systemRead(r) && num(r.at) > line) unread++;
  return { readAt: line, unread, moved: line > num(readAt) };
}
const within = (at, now, win) => { const a = num(at); return a > 0 && now - a < win; };

// lane attention-rule-at-you (owner 2026-10-13 on the 需关注 block: "怎么没有 at 我的这个选项"): BEING NAMED BY A PERSON IS
// A FIRST-SCREEN RULE OF ITS OWN. A record @s the owner when one of its RESOLVED `mentions` (src/channel-record.js) is a
// PERSON whose id is the account's resolved `selfId` — a broadcast (@here / @all) or a user group never is (D21), the
// owner's own record never is, a system notice never is, and an unknown self (no identity resolved yet) never guesses.
// The engine keeps the INSTANTS of such records on the index entry (`atYouAts`, newest AT_YOU_MAX, `keepAtYou`); the
// row's count is the kept instants past the read line (`readAt`) inside FOCUS_WINDOW_MS (`atYouOf` — THE predicate:
// statusTag's tag, the server's pre-filter `candidateOf`, the fold's `needsOwner` all ask it), so a read-up-to clears it.
const AT_YOU_MAX = 50;
/** Does record `r` @ the owner (a person mention whose id is the resolved `selfId`)? */
function mentionsSelf(r, selfId = null) {
  if (!r || typeof r !== 'object' || typeof selfId !== 'string' || selfId === '' || selfRead(r, selfId) || systemRead(r)) return false;
  return Array.isArray(r.mentions) && r.mentions.some((m) => m && (m.kind == null || m.kind === 'person') && m.id != null && String(m.id) === selfId);
}
/** The kept instants after a batch `recs`: `ats` + the batch's records that @ the owner, ascending, unique, newest AT_YOU_MAX. */
function keepAtYou(ats, recs, selfId = null) {
  const set = new Set((Array.isArray(ats) ? ats : []).map(num).filter((x) => x > 0));
  for (const r of Array.isArray(recs) ? recs : []) if (mentionsSelf(r, selfId) && num(r.at) > 0) set.add(num(r.at));
  return [...set].sort((a, b) => a - b).slice(-AT_YOU_MAX);
}
/** THE @-YOU COUNT of a row: an agent group's own `atYou`, else its conversation's kept instants past `readAt`, inside the window. */
function atYouOf(row, now = Date.now()) {
  if (!row) return 0;
  if (num(row.atYou) > 0) return num(row.atYou);
  const c = row.conv || row;
  const line = num(c.readAt);
  let n = 0;
  for (const at of Array.isArray(c.atYouAts) ? c.atYouAts : []) if (num(at) > line && within(at, now, FOCUS_WINDOW_MS)) n++;
  return n;
}

// lane decision-attention (D2 of docs/design-decision-api.zh.md §2.4): THE JUDGED TAG — a row no FACT tag claims, judged by
// the LLM plugin (the engine's async scan, src/server/channels-attention.js) to need the owner now. The row's `judged` =
// `{p, clauses: [name], source, rubricV, lastAt, threshold, label?}`: it speaks ONLY of the message it was judged on
// (`lastAt` — a newer message waits for its own verdict), `p ≥ threshold` (the setting `decision.threshold`), and the
// person's own label wins (`label: 'needs'` keeps it, `'not'` drops it). The facts are free and stronger: the scan never
// sends a row a fact tag claims (`judgeCandidate`), and `statusTag` asks every fact tag above `held` before this one.
/** The `judged` tag of a row's verdict, or null. */
function judgedTag(j, lastAt) {
  if (!j || typeof j !== 'object' || num(j.lastAt) !== num(lastAt) || j.label === 'not') return null;
  const p = typeof j.p === 'number' && Number.isFinite(j.p) ? j.p : null;
  if (j.label !== 'needs' && !(p !== null && p >= num(j.threshold))) return null;
  return { code: 'judged', p, clauses: Array.isArray(j.clauses) ? j.clauses.slice(0, 7) : [], source: j.label === 'needs' ? 'you' : 'judge' };
}

/** A principal's key as the engine spells it (channel-filter's `principalKey`: `kind:id`). */
const pkOf = (p) => (p && p.kind && String(p.id == null ? '' : p.id).trim() ? `${p.kind}:${String(p.id).trim()}` : '');

/**
 * HOW MANY OF THIS CONVERSATION'S PENDING HITS ARE HELD (the R3 × R4 seam,
 * 2.369.191). R4 lets SEVERAL principals watch one conversation, and a
 * `notify:'digest'` watcher's hits wait on the conversation (`pending`,
 * tagged `for` that watcher) until its window closes — that wait IS the
 * digest, not a wake that failed to reach anybody. The engine's `touchView`
 * sends `touch.pendingFor` = `[{p, n, oldest}]` (per principal key; `p: null`
 * = a legacy untagged hit); `watchers` = the row's R4 watcher rows
 * (`{principal, notify, digestMinutes}`). A principal's hits are held unless
 * its watcher is a digest whose window — `oldest` + `digestMinutes`, the edge
 * EXCLUSIVE — is still open. A hit with no watcher row (a legacy one, or a
 * watcher since removed) counts as held. A touch without `pendingFor` (a
 * server before the seam) falls back to the total.
 */
function heldPending(touch, now = Date.now(), watchers = []) {
  if (!touch) return 0;
  const per = Array.isArray(touch.pendingFor) ? touch.pendingFor : null;
  if (!per) return num(touch.pending);
  const byPk = new Map();
  for (const w of Array.isArray(watchers) ? watchers : []) { const k = w && pkOf(w.principal); if (k) byPk.set(k, w); }
  let n = 0;
  for (const e of per) {
    if (!e || num(e.n) <= 0) continue;
    const w = e.p ? byPk.get(String(e.p)) : null;
    const windowMs = w ? Math.max(1, num(w.digestMinutes)) * 60e3 : 0;
    const inWindow = !!(w && w.notify === 'digest' && within(e.oldest, now, windowMs));
    if (!inWindow) n += num(e.n);
  }
  return n;
}

/** Is a wake for this conversation HELD (its hits did not reach the agent)?
 *  `watchers` = the row's R4 watcher rows (a digest's open window is not held). */
function heldOf(touch, now = Date.now(), watchers = []) {
  if (!touch) return false;
  if (heldPending(touch, now, watchers) > 0) return true;
  const w = touch.wake;
  if (w && w.ok === false && w.lane === 'none' && within(w.at, now, HELD_WINDOW_MS)) return true;
  if (within(touch.refusalAt, now, HELD_WINDOW_MS) && (!w || num(touch.refusalAt) > num(w.at))) return true;
  return false;
}

/**
 * THE ONE TAG a first-screen row wears, or `null` (the row does not matter).
 * `row` = a `groupListRows` row (`{kind:'conv', conv}`) or a digest row
 * itself. Returns structure: `{code, name?, kind?, grain?, held?, n?, at?}`. `policy` (lane attention-policy,
 * `attentionPolicy`): a rule switched off is skipped — the row answers with the next rule that is on, or null.
 */
function statusTag(row, now = Date.now(), policy = null) {
  if (!row) return null;
  // an AGENT GROUP row of the first screen (`groupListRows`' kind 'group' carries its `group`) wears no tag;
  // a digest row's own `kind` is the conversation's ('group' chat / dm / thread) and never means that
  if (row.kind === 'group' && row.group) return null;
  const c = row.conv || row;
  const touch = c.touch || null;
  const ob = c.outbox || {};
  const on = (code) => ruleOn(policy, code);
  if (num(ob.awaiting) > 0 && on('awaiting')) return { code: 'awaiting', n: num(ob.awaiting) };
  if (num(ob.unknown) > 0 && on('unknown')) return { code: 'unknown', n: num(ob.unknown) };
  // lane attention-rule-at-you: being named by a person outranks being assigned
  const ay = on('at-you') ? atYouOf(c, now) : 0;
  if (ay > 0) return { code: 'at-you', n: ay };
  const held = heldOf(touch, now, c.watchers);
  const a = c.assignment;
  if (a && a.principal && (a.principal.id || a.principal.name) && on('assigned')) {
    const grain = a.source || 'conversation';
    // D4 (2026-09-27): a pattern / account grain lists a conversation only once it ACTED on it — a wake
    // DELIVERED to the agent within the window, or a held one; never merely because the scope covers it
    const w = touch && touch.wake;
    const woken = !!(w && w.ok === true && w.lane !== 'none' && within(w.at, now, FOCUS_WINDOW_MS));
    // never a raw id in a tag (r-verify): a principal that arrives without a name is worded by its KIND
    if (grain === 'conversation' || held || woken) return { code: 'assigned', name: a.principal.name || '', kind: a.principal.kind || 'agent', grain, held };
  }
  const rd = touch && touch.read;
  if (rd && within(rd.at, now, FOCUS_WINDOW_MS) && on('read')) {
    const name = rd.name || '';   // never the raw session id (r-verify): the words say "an agent" for a nameless reader
    const kind = rd.kind || 'agent';
    // lane channel-self-unread: the owner's OWN newest message (`touch.selfAt`) is never news — a row whose newest
    // message is his is read up to it (selfRead / readAdvance above)
    const newsAt = num(c.lastAt) > num(touch.selfAt) ? num(c.lastAt) : 0;
    return newsAt > num(rd.upTo) ? { code: 'new-since-read', name, kind, at: num(rd.at) } : { code: 'read', name, kind, at: num(rd.at) };
  }
  if (held && on('held')) return { code: 'held', n: heldPending(touch, now, c.watchers) };
  const jt = on('judged') ? judgedTag(c.judged, c.lastAt) : null;
  if (jt) return jt;
  // lane lark-search-poll (owner decision 1): a single chat somebody wrote in and the owner has not read
  // design 012 (Slack S1): an APP's DM (a bot, an integration) is never "somebody wrote to you"
  if (c.kind === 'dm' && !c.app && num(c.unread) > 0 && within(c.lastAt, now, FOCUS_WINDOW_MS) && on('direct')) return { code: 'direct', n: num(c.unread) };
  if (touch && within(touch.selfAt, now, FOCUS_WINDOW_MS) && on('replied')) return { code: 'replied', at: num(touch.selfAt) };
  return null;
}

/** THE ATTENTION LIST: every non-archived agent group + every conversation
 *  row that wears a tag. The order is the input's (`groupListRows` sorts by
 *  activity) — the IM order the owner reads, the same in both views. */
function focusRows(rows, now = Date.now(), policy = null) {
  return (rows || []).filter((r) => r && (r.kind === 'group' && r.group ? !r.archived : !!statusTag(r, now, policy)));
}

/** The filter box: a case-insensitive substring over what the row SHOWS
 *  (title, source label, last line). Blank = everything. */
function filterRows(rows, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return (rows || []).slice();
  return (rows || []).filter((r) => textMatches([r.title, r.sourceLabel, r.lastText], s));
}

/**
 * THE HEADER's numbers + what the list draws, for one view and one query:
 * `{view, focus, all, shown, moreInAll}` — `focus` / `all` are the two
 * switch counts (the whole lists, never the filtered ones), `shown` the rows
 * to draw, `moreInAll` how many rows OUTSIDE the attention list match the
 * query (the focused view offers them: "{n} more in All").
 */
function firstScreen(rows, { view = 'focus', q = '', now = Date.now(), policy = null } = {}) {
  const all = rows || [];
  const focus = focusRows(all, now, policy);
  const v = view === 'all' ? 'all' : 'focus';
  const shown = filterRows(v === 'all' ? all : focus, q);
  const moreInAll = v === 'focus' && String(q || '').trim() ? filterRows(all, q).length - shown.length : 0;
  return { view: v, focus: focus.length, all: all.length, shown, moreInAll };
}

// ── THE FIRST READ AND ITS PAGES (design 008, B-3cf8 — userW's first Channels open stalled: GET /api/channels sent
// all ~50 000 rows, 77.5 MB, 1.49 s to first byte). The server now sends what the first screen draws — the attention
// rows, each account's newest rows, the counts — and every other row by key from ONE paged route
// (`GET /api/channels/rows`); the client keeps a keyed row store (src/lib/channel-rows.js). The rules both sides
// page by live here, beside the predicate that decides the attention list on both sides.

/** The first read's and a page's bounds (design 008 §2 "Bounds"). */
const ATTENTION_MAX = 300;   // attention rows in one first read (`attention.cut` = how many more the server counted)
const HEAD_ROWS = 30;        // each account's newest listed rows in the first read (the panel's ACCOUNT_ROWS)
const PAGE_ROWS = 60;        // a page by default (All's "Show more")
const PAGE_MAX = 200;        // a page at most (an account's "Show more"; `keys` per read)
const QUERY_MAX = 100;       // characters of a server-side filter

/**
 * COULD THIS INDEX ENTRY WEAR A TAG? The first read builds a `rowView` only for the rows this answers yes for (and
 * each account's newest), then `statusTag` decides — so it may OVER-include, NEVER miss: a quiet conversation handed
 * to an agent, buried at position 49 000 by `lastAt`, must still be on the first screen (test-channel-rows' property:
 * candidateOf ⊇ statusTag(rowView) ≠ null, row for row, at every window edge). It reads the RAW facts rowView /
 * touchView derive the tag's inputs from — `en` the live index entry, `ob` the viewCtx's outbox count for its key
 * (`{awaiting, unknown, ownSentAt}`) — one clause per tag:
 */
function candidateOf(en, ob, now = Date.now(), judged = null) {
  if (!en) return false;
  // judged — the scan's verdict on this row's newest message (the engine hands its cached verdict in)
  if (judgedTag(judged, en.lastAt)) return true;
  // awaiting / unknown — the outbox's count for the key
  if (ob && (num(ob.awaiting) > 0 || num(ob.unknown) > 0)) return true;
  // at-you — the kept @ instants past the read line (atYouOf reads `en.atYouAts` / `en.readAt` raw)
  if ((en.atYou || (en.atYouAts && en.atYouAts.length)) && atYouOf(en, now) > 0) return true;   // int265 seam: no kept instants ⇒ 0 (index-scale ⑨: the per-row pre-filter stays at base cost)
  // assigned, the CONVERSATION grain — the conversation's own rows (convGrainOf reads exactly these three)
  if ((Array.isArray(en.access) && en.access.length) || (Array.isArray(en.watchers) && en.watchers.length) || (en.assignment && en.assignment.principal)) return true;
  // the LAST wake (touchView's `wake`): delivered inside the window (a pattern / account grain that acted) or held
  const wakes = en.stats && Array.isArray(en.stats.wakes) ? en.stats.wakes : null;
  const lw = wakes && wakes.length ? wakes[wakes.length - 1] : null;
  if (lw) {
    const delivered = lw.ok !== false, lane = lw.lane || null;
    if (delivered && lane !== 'none' && within(lw.at, now, FOCUS_WINDOW_MS)) return true;
    if (!delivered && lane === 'none' && within(lw.at, now, HELD_WINDOW_MS)) return true;
  }
  // held — hits pending (a digest watcher's open window over-includes; heldPending decides)
  if (Array.isArray(en.pending) && en.pending.length) return true;
  if (num(en.pendingElided) > 0) return true;
  if (en.pendingElidedBy && typeof en.pendingElidedBy === 'object' && Object.values(en.pendingElidedBy).some((v) => num(v) > 0)) return true;
  // held — the last refusal, newer than the last wake
  const refusalAt = en.stats && en.stats.lastRefusal ? num(en.stats.lastRefusal.at) : 0;
  if (within(refusalAt, now, HELD_WINDOW_MS) && (!lw || refusalAt > num(lw.at))) return true;
  // read / new-since-read — ANY agent read inside the window (touchView keeps the newest)
  for (const r of Array.isArray(en.agentReads) ? en.agentReads : []) if (r && within(r.at, now, FOCUS_WINDOW_MS)) return true;
  // direct — a single chat with unread messages, the newest inside the window
  if (en.kind === 'dm' && !en.app && num(en.unread) > 0 && within(en.lastAt, now, FOCUS_WINDOW_MS)) return true;
  // replied — the owner's own message (a record of theirs, or a send from here)
  return within(en.selfAt, now, FOCUS_WINDOW_MS) || !!(ob && within(ob.ownSentAt, now, FOCUS_WINDOW_MS));
}

/**
 * lane decision-attention: MAY THE JUDGE SEE THIS ROW? A first-screen conversation row (a rowView) that NO fact tag
 * claims (`statusTag` null when its own verdict is left out — a fact is free and stronger), whose newest message is
 * inside the 24 h window and is not the owner's own (`touch.selfAt`), not VibeSpace's own talk. The scan sends
 * nothing else — the candidate-set census (test-decision-attention) pins it: a fact-tagged row is never sent.
 * `policy` (lane attention-policy): a fact whose rule is switched off claims nothing — "只用判断模型" judges every row.
 */
function judgeCandidate(v, now = Date.now(), policy = null) {
  if (!v || typeof v !== 'object' || (v.kind === 'group' && v.group) || isInternal(v) || v.unlisted) return false;
  const c = v.conv || v;
  if (!within(c.lastAt, now, FOCUS_WINDOW_MS)) return false;
  if (c.touch && num(c.touch.selfAt) >= num(c.lastAt)) return false;
  return !statusTag({ ...c, judged: null }, now, policy);
}

// lane attention-predicate-shared (design q-044 decision 7 — the owner accepted it 2026-10-19): THE FIRST SCREEN SPLITS IN TWO —
// 「需要我」 (a person or an agent waits for the owner) above, 「相关」 (context, not a wait: handed over, read, replied, held,
// the agent groups) folded under it. The 8 rules and their switches are untouched: they still decide CANDIDACY (`statusTag`
// — a row no rule lists is in neither section, it stays under All). PLACEMENT is the row's FACTS, placed by
// src/attention-model.js `bandOfRow` / `needsMe` — the For-you tray's own rule, never a second one (injected below: this
// module imports nothing). `attentionRowOf` reads each wait fact ON ITS OWN, never only the ONE tag (an assigned direct
// chat a person wrote in is still a person waiting); a fact whose rule is switched off claims nothing.
/** rule / fact → the attention row's fact → its band (the suite and the report read this table). */
const ATTENTION_FACTS = Object.freeze([
  Object.freeze({ rule: 'direct', fact: 'waitedBy', band: 2, why: 'a person wrote to me directly, unread, inside 24 h' }),
  Object.freeze({ rule: 'at-you', fact: 'waitedBy', band: 2, why: 'a person @-mentioned me, unread, inside 24 h (an agent group\'s @ of me too)' }),
  Object.freeze({ rule: 'judged', clause: 'waiting', fact: 'waitedBy', band: 2, why: 'the attention judge: someone is waiting on me' }),
  Object.freeze({ rule: 'judged', clause: 'deadline_money', fact: 'deadlineMoney', band: 3, why: 'the attention judge: a deadline or money' }),
  Object.freeze({ rule: 'awaiting', fact: 'action', action: 'approve', band: 4, why: 'a draft waits for my approval to send' }),
  Object.freeze({ rule: 'unknown', fact: 'action', action: 'check', band: 4, why: 'a send whose delivery nobody confirmed waits for my check' }),
  Object.freeze({ rule: 'judged', fact: null, band: 5, why: 'the judge listed it with no waiting / deadline clause' }),
]);
/** The rules whose rows are CONTEXT, never a wait (「相关」), and the agent groups with no @ of the owner. */
const RELATED_RULES = Object.freeze(['assigned', 'read', 'held', 'replied']);
/**
 * A FIRST-SCREEN ROW AS AN ATTENTION ROW (src/attention-model.js's row shape, `band` left for its `bandOfRow`), or null —
 * the row is 「相关」 (or no rule lists it at all). `row` = a `groupListRows` row (a conversation's `{kind:'conv', conv}` or
 * an agent group's `{kind:'group', group, atYou}`) or a digest row itself; `policy` = `attentionPolicy` (the 8 rules'
 * switches). No channel fact is urgent, blocked or dated (`urgency: 'normal'`, `blocked: false`, `due: null` — those are
 * the tray's). `at` = the newest message (band 2 reads it longest-waiting first, bands 4 / 5 newest first); `until` = the
 * first instant a fact it read leaves its 24 h window (null: no clock edge) — the engine's kept count re-asks the row then.
 */
function attentionRowOf(row, now = Date.now(), policy = null) {
  if (!row) return null;
  const group = row.kind === 'group' && !!row.group;
  if (group && row.archived) return null;
  const c = group ? row : row.conv || row;
  if (!group && !statusTag(row, now, policy)) return null;   // candidacy: the 8 rules (an agent group: the owner's act, D1)
  const on = (code) => ruleOn(policy, code);
  const ob = (!group && c.outbox) || {};
  const awaiting = on('awaiting') && num(ob.awaiting) > 0;
  const unknown = on('unknown') && num(ob.unknown) > 0;
  const atYou = on('at-you') && atYouOf(c, now) > 0;
  const direct = !group && on('direct') && c.kind === 'dm' && !c.app && num(c.unread) > 0 && within(c.lastAt, now, FOCUS_WINDOW_MS);
  const jt = !group && on('judged') ? judgedTag(c.judged, c.lastAt) : null;
  const clauses = jt ? jt.clauses : [];
  const waited = direct || atYou || clauses.includes('waiting');
  const money = clauses.includes('deadline_money');
  if (!waited && !money && !awaiting && !unknown && !jt) return null;
  // the clock edge: a direct chat's newest message, the oldest counted @ of me (an agent group's count has none)
  const edges = [];
  if (direct) edges.push(num(c.lastAt) + FOCUS_WINDOW_MS);
  if (atYou && !(num(c.atYou) > 0)) { const line = num(c.readAt); for (const at of Array.isArray(c.atYouAts) ? c.atYouAts : []) if (num(at) > line && within(at, now, FOCUS_WINDOW_MS)) edges.push(num(at) + FOCUS_WINDOW_MS); }
  const key = String(row.key || c.key || '');
  return {
    id: key, key, source: 'channels', band: null, at: num(c.lastAt), due: null, urgency: 'normal', origin: null, kind: 'action',
    options: 0, action: awaiting ? 'approve' : unknown ? 'check' : null, card: false, plugin: null, judged: null, reasks: 0,
    blocked: false, waitedBy: waited ? 'person' : null, deadlineMoney: money, answered: false, notice: false,
    until: edges.length ? Math.min(...edges) : null,
  };
}
/**
 * THE FIRST SCREEN'S TWO SECTIONS: `rows` = the attention list as drawn (`firstScreen`'s `shown`: every candidate + the
 * agent groups), `needsMe` = src/attention-model.js `needsMe` (injected — this module imports nothing), `policy` = the 8
 * rules' switches, `bands` = the owner's band policy (`settingsPolicy`: switches, cap, expanded bands). → `{needs:
 * needsMe's answer over the rows that wait (screen ≤ cap, folds by band, counts), byKey: Map<key, the drawn row>, related:
 * the rest, in the input order}` — the panel draws both, the server's Channels badge is `needs.counts.needsMe`.
 */
function firstScreenSplit(rows, now = Date.now(), { policy = null, bands = null, needsMe = null } = {}) {
  const wait = [], related = [], byKey = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const a = r && r.kind !== 'internal-head' ? attentionRowOf(r, now, policy) : null;
    if (a) { wait.push(a); byKey.set(a.key, r); } else if (r) related.push(r);
  }
  return { needs: typeof needsMe === 'function' ? needsMe(wait, now, bands) : null, rows: wait, byKey, related };
}

/** THE CHANNELS RAIL BADGE (decision 7): `convs` = the server's count of conversations in bands 1–4 (`digest.needsMe`, kept
 *  — the client never holds every row) + the non-archived agent groups the attention list puts in bands 1–4 (an @ of the
 *  owner) — `groups` = `/api/channel-groups`' list, `needsMe` injected. Never unread, never the outbox's arithmetic. */
function channelsBadge(convs, groups, now = Date.now(), { policy = null, bands = null, needsMe = null } = {}) {
  const rows = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g || !g.id || g.archivedAt) continue;
    const a = attentionRowOf({ kind: 'group', group: g, key: `groups/${g.id}`, atYou: num(g.atYou), lastAt: num(g.lastAt || g.createdAt), archived: false }, now, policy);
    if (a) rows.push(a);
  }
  const n = rows.length && typeof needsMe === 'function' ? needsMe(rows, now, bands).counts.needsMe : 0;
  return Math.max(0, Math.floor(num(convs))) + n;
}

/** THE ORDER every page and every list keeps: newest first (`lastAt` desc), then `key` — total, so a cursor is exact. */
function pageOrder(a, b) {
  const d = num(b && b.lastAt) - num(a && a.lastAt);
  if (d) return d;
  const x = String(a && a.key), y = String(b && b.key);
  return x < y ? -1 : x > y ? 1 : 0;
}
/** The cursor AFTER a row (`{lastAt, key}`) — what `before` reads next time. */
function pageCursor(row) { return row ? { lastAt: num(row.lastAt), key: String(row.key) } : null; }
/** Does `row` come after the cursor in pageOrder (a null cursor = the start)? */
function afterCursor(row, before) {
  if (!before) return true;
  const a = num(row && row.lastAt), b = num(before.lastAt);
  return a < b || (a === b && String(row && row.key) > String(before.key));
}

/**
 * ONE PASS selecting the next `limit` items after `before` in pageOrder — never a full sort (a bounded heap; the
 * design measured 6 ms for 60 of 50 000). `at(x)` / `keyOf(x)` read an item's `lastAt` / `key` (the server pages raw
 * index entries), `keep(x)` filters. Answers `{items, next, total}`: `total` = how many pass `keep` (the list's
 * count), `next` = the cursor after the last item when more follow it, else null. Rows that moved ABOVE the cursor
 * between two reads are not read again (the broadcast carried them), so a row is never paged twice.
 */
function selectPage(items, { before = null, limit = PAGE_ROWS, keep = null, at = (x) => x.lastAt, keyOf = (x) => x.key } = {}) {
  const n = Math.max(1, Math.floor(num(limit)) || PAGE_ROWS);
  const bA = before ? num(before.lastAt) : 0, bK = before ? String(before.key) : '';
  const heap = [];   // the kept `n`, a max-heap by pageOrder: heap[0] is the WORST kept
  const cmp = (p, q) => (q.a - p.a) || (p.k < q.k ? -1 : p.k > q.k ? 1 : 0);
  const up = (i) => { while (i > 0) { const j = (i - 1) >> 1; if (cmp(heap[i], heap[j]) <= 0) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const down = (i) => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && cmp(heap[l], heap[m]) > 0) m = l; if (r < heap.length && cmp(heap[r], heap[m]) > 0) m = r; if (m === i) return; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } };
  let total = 0, after = 0;
  for (const x of items) {
    if (!x || (keep && !keep(x))) continue;
    total++;
    const a = num(at(x)), k = String(keyOf(x));
    if (before && !(a < bA || (a === bA && k > bK))) continue;
    after++;
    if (heap.length < n) { heap.push({ x, a, k }); up(heap.length - 1); continue; }
    const w = heap[0];
    if (a > w.a || (a === w.a && k < w.k)) { heap[0] = { x, a, k }; down(0); }
  }
  heap.sort(cmp);
  const last = heap[heap.length - 1];
  return { items: heap.map((e) => e.x), next: after > heap.length && last ? { lastAt: last.a, key: last.k } : null, total };
}

/** A filter's words as the server reads them: trimmed, lower-case; '' = no filter; null = refused (over QUERY_MAX). */
function queryOf(q) {
  const s = String(q == null ? '' : q).trim();
  return s.length > QUERY_MAX ? null : s.toLowerCase();
}
/** THE FILTER'S RULE (filterRows above and the server's `q`): a case-insensitive substring of any shown string. */
function textMatches(fields, s) {
  if (!s) return true;
  for (const f of fields) if (f && String(f).toLowerCase().includes(s)) return true;
  return false;
}

// ── VIBESPACE'S OWN TALK FOLDS (lane channels-badges — the owner, 2026-10-03: "提供一个选项可以把vibespace内部沟通收缩起来，
// 这样避免agent互相沟通内容太多挤占实际沟通空间"). INTERNAL = an agent group (a pair: an agent private chat) or a row
// stamped `internal` (the built-in agents source). The panel draws a list's internal rows as ONE block under a head
// ("VibeSpace internal (N)") at the place of its newest row — every other row keeps the input order. FOLDED (the
// default since lane channels-fold — the owner, 2026-10-03; an unfold is user state `channelsPanelFolds.internal:
// false`, synced to every client) the head alone stands for the block, with the block's unread and @-you counts.
// NOTHING THAT NEEDS THE OWNER FOLDS AWAY: a row that @-mentions the owner (`atYou`) or awaits the owner (the awaiting /
// unknown tags) keeps its OWN row, on top of the list.

/** Is this row VibeSpace's own talk? */
function isInternal(r) { return !!(r && (r.internal === true || (r.kind === 'group' && r.group))); }
/** Does this row need the OWNER (it never folds)? An @ of the owner, or a draft / a send awaiting the owner. */
function needsOwner(r, now = Date.now()) {
  if (!r) return false;
  if (atYouOf(r, now) > 0) return true;
  const st = statusTag(r, now);
  return !!(st && (st.code === 'awaiting' || st.code === 'unknown'));
}
/**
 * THE INTERNAL BLOCK of a list about to be drawn: `{rows, block}`. `rows` = the list as drawn — ONE
 * `{kind:'internal-head', key, block}` marker where the block stands; unfolded, the block's rows right under it;
 * folded, the rows that need the owner FIRST (in the input order) and the rest of the block gone. `block` =
 * `{n, unread, atYou, pinned, folded}` over EVERY internal row of the list (null: the list holds none).
 */
function internalBlock(rows, { folded = false, now = Date.now() } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const inner = list.filter(isInternal);
  if (!inner.length) return { rows: list.slice(), block: null };
  const pinned = folded ? inner.filter((r) => needsOwner(r, now)) : [];
  const block = {
    n: inner.length, unread: inner.reduce((s, r) => s + num(r.unread), 0), atYou: inner.reduce((s, r) => s + num(r.atYou), 0),
    pinned: pinned.length, folded: !!folded,
  };
  const head = { kind: 'internal-head', key: 'internal-head', block };
  const out = pinned.slice();
  let placed = false;
  for (const r of list) {
    if (!isInternal(r)) { out.push(r); continue; }
    if (placed || pinned.includes(r)) continue;
    placed = true;
    out.push(head);
    if (!folded) out.push(...inner);
  }
  if (!placed) out.splice(pinned.length, 0, head);
  return { rows: out, block };
}

/**
 * lane channels-list-polish (the owner: "整体做的更接近一个聊天工具的列表"): THE PER-ACCOUNT LIST ROW — the attention
 * list's shape: the avatar, the name, the LAST MESSAGE's first line ("author: text" — peer bytes, the client puts them
 * through textContent; bounded), the time, the unread count. The "Access: … · Notify: …" line is shown ONLY when the
 * conversation's own grain DIFFERS from the account's (`assignment.source === 'conversation'`) — worded as that
 * difference; an inherited row says nothing.
 */
const LIST_LAST_MAX = 160;
function listRowModel(conv) {
  const c = conv && typeof conv === 'object' ? conv : {};
  const first = String(c.lastText || '').split(/\r?\n/)[0].replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIST_LAST_MAX);
  const w = c.lastWho && typeof c.lastWho === 'object' ? c.lastWho : null;
  const who = !first || !w ? null : w.self ? { self: true } : (typeof w.name === 'string' && w.name.trim() ? { name: w.name.trim().slice(0, 80) } : null);
  const own = !!(c.assignment && c.assignment.source === 'conversation');
  // lane channel-record-revisions: the newest message was RECALLED — the row says so (its words stay in the window, folded)
  return { last: first, who, at: Number(c.lastAt) || 0, unread: Math.max(0, Number(c.unread) || 0), grainLine: own, recalled: !!(c.lastRecalled && first) };
}

module.exports = {
  LIST_LAST_MAX, listRowModel,
  FOCUS_WINDOW_MS, HELD_WINDOW_MS, TAG_ORDER, heldPending,
  ATTENTION_RULES, ATTENTION_PRESETS, attentionPolicy, ruleOn, presetOf, presetSwitches,   // lane attention-policy
  heldOf, statusTag, focusRows, filterRows, firstScreen,
  ATTENTION_MAX, HEAD_ROWS, PAGE_ROWS, PAGE_MAX, QUERY_MAX, candidateOf, judgedTag, judgeCandidate,   // + judgedTag / judgeCandidate: lane decision-attention
  pageOrder, pageCursor, afterCursor, selectPage, queryOf, textMatches,
  isInternal, needsOwner, internalBlock,
  selfRead, readAdvance, systemRead,   // + systemRead: B-ef03
  AT_YOU_MAX, mentionsSelf, keepAtYou, atYouOf,   // lane attention-rule-at-you
  ATTENTION_FACTS, RELATED_RULES, attentionRowOf, firstScreenSplit, channelsBadge,   // lane attention-predicate-shared (decision 7)
};
